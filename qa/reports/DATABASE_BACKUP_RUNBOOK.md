# Production Database Backup & Disaster Recovery Runbook

**Database File:** `./data/payroll.sqlite`  
**Application:** Mohsin & Co — Payroll & Attendance Management System  
**Engine:** Embedded SQLite via WebAssembly (`sql.js`) with atomic file exports  
**Operational Status:** Standard Operating Procedure (SOP) for Production Hosts

---

## 1. Executive Summary & Architecture Context

The application stores all relational data (employees, attendance logs, biometric punches, payroll periods, adjustments, user accounts, and audit records) in a single SQLite database file located at `./data/payroll.sqlite`.

Because the application uses an in-memory WebAssembly SQLite engine that synchronizes state to `./data/payroll.sqlite` via atomic binary filesystem writes, **database backup and disaster recovery must be managed at the host/infrastructure layer**. Application code does not contain automated background cloud replication, meaning automated host-level cron/systemd snapshotting is mandatory before releasing to production.

---

## 2. Backup Strategy & Scheduling

### Recommended Backup Schedule
| Frequency | Type | Destination | Retention |
| :--- | :--- | :--- | :--- |
| **Hourly (Active Hours: 08:00–20:00)** | Point-in-time Snapshot | Local Host (`/var/backups/payroll/hourly`) | 48 hours |
| **Daily (23:00 PKT)** | Full Compressed Backup | Offsite Encrypted Object Storage (e.g. S3 / B2) | 30 days |
| **Monthly (1st of month)** | Monthly Archive | Offsite Cold Storage / Glacial Storage | 7 years (Statutory Payroll Retention) |

---

## 3. Host-Level Automated Backup Script

Install the following bash script on the production server (e.g. `/usr/local/bin/backup-payroll.sh`):

```bash
#!/usr/bin/env bash
set -euo pipefail

# Configuration
APP_DIR="/var/www/payroll-management/mohsin-&-co-payroll-&-attendance"
DB_SOURCE="${APP_DIR}/data/payroll.sqlite"
BACKUP_DIR="/var/backups/payroll"
DATE_STAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_NAME="payroll_backup_${DATE_STAMP}.sqlite"
ARCHIVE_PATH="${BACKUP_DIR}/daily/${BACKUP_NAME}.gz"
GPG_RECIPIENT="ops@mohsinco.com"

# Ensure local backup directory exists
mkdir -p "${BACKUP_DIR}/hourly" "${BACKUP_DIR}/daily" "${BACKUP_DIR}/monthly"

# 1. Verify Source Database File Exists
if [ ! -f "${DB_SOURCE}" ]; then
  echo "[ERROR] Database file not found at ${DB_SOURCE}" >&2
  exit 1
fi

# 2. Safe Copy using SQLite CLI or file copy
# Since sql.js writes atomically, copy to a staging snapshot first
cp "${DB_SOURCE}" "${BACKUP_DIR}/hourly/${BACKUP_NAME}"

# 3. Compress snapshot
gzip -c "${BACKUP_DIR}/hourly/${BACKUP_NAME}" > "${ARCHIVE_PATH}"

# 4. Optional: Encrypt with GPG for offsite transfer
if command -v gpg >/dev/null 2>&1; then
  gpg --batch --yes --trust-model always -r "${GPG_RECIPIENT}" --encrypt "${ARCHIVE_PATH}"
fi

# 5. Push to Offsite Cloud Storage (e.g. AWS S3 or Rclone)
if command -v aws >/dev/null 2>&1; then
  aws s3 cp "${ARCHIVE_PATH}.gpg" "s3://mohsin-payroll-backups/daily/${BACKUP_NAME}.gz.gpg" \
    --storage-class STANDARD_IA
fi

# 6. Retention Pruning (Keep local hourly for 2 days, daily for 30 days)
find "${BACKUP_DIR}/hourly" -type f -mtime +2 -delete
find "${BACKUP_DIR}/daily" -type f -mtime +30 -delete

echo "[SUCCESS] Payroll database backed up to ${ARCHIVE_PATH} at $(date)"
```

---

## 4. Hostinger / Cloud VPS Operational Requirements

If deploying to **Hostinger Cloud / VPS** or managed Node.js hosting:
1. **Enable Daily Automated Snapshots:**
   - In the Hostinger hPanel / VPS Management dashboard, navigate to **VPS Management > Snapshots & Backups**.
   - Ensure **Automatic Daily Backups** is toggled ON.
2. **Cron Job Schedule:**
   - Configure a cron job under `crontab -e`:
     ```text
     0 23 * * * /usr/local/bin/backup-payroll.sh >> /var/log/payroll-backup.log 2>&1
     ```

---

## 5. Restoration & Verification Procedure

In the event of data corruption, accidental deletion, or disaster recovery:

### Step 1: Halt Application Service
Stop the Node.js process immediately to prevent in-flight writes from overwriting recovery data:
```bash
# Systemd or PM2
pm2 stop payroll-app || systemctl stop payroll-app
```

### Step 2: Retrieve & Decrypt Backup File
```bash
# Download from offsite storage if necessary
aws s3 cp s3://mohsin-payroll-backups/daily/payroll_backup_20260901_230000.sqlite.gz.gpg ./

# Decrypt
gpg --decrypt payroll_backup_20260901_230000.sqlite.gz.gpg > payroll_backup.sqlite.gz

# Decompress
gunzip -f payroll_backup.sqlite.gz
```

### Step 3: Verify Integrity with SQLite CLI
```bash
sqlite3 payroll_backup.sqlite "PRAGMA integrity_check;"
# MUST RETURN: ok
```

### Step 4: Atomic Replacement
```bash
# Archive existing (corrupted) file with timestamp
mv /var/www/payroll-management/mohsin-&-co-payroll-&-attendance/data/payroll.sqlite \
   /var/www/payroll-management/mohsin-&-co-payroll-&-attendance/data/payroll.sqlite.corrupt_$(date +%s)

# Install verified backup
cp payroll_backup.sqlite /var/www/payroll-management/mohsin-&-co-payroll-&-attendance/data/payroll.sqlite
chmod 660 /var/www/payroll-management/mohsin-&-co-payroll-&-attendance/data/payroll.sqlite
```

### Step 5: Start Service & Verify
```bash
pm2 start payroll-app || systemctl start payroll-app

# Verify API and latest records
curl -s http://localhost:3000/api/auth/me
```

---

## 6. Disaster Recovery Simulation Drill

- **Frequency:** Quarterly.
- **Protocol:** Restore the latest backup file onto a staging instance or isolated container, verify `PRAGMA integrity_check;`, and confirm employee and payroll counts match production records.
