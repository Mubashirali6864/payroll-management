# Graph Report - Payroll Management - Copy  (2026-10-26)

## Corpus Check
- 127 files · ~455,828 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 14 file(s) not represented in the graph (top: (none) 5, .sqlite 3, .jsonc 1)

## Summary
- 1197 nodes · 1624 edges · 83 communities (80 shown, 3 thin omitted)
- Extraction: 93% EXTRACTED · 7% INFERRED · 0% AMBIGUOUS · INFERRED: 120 edges (avg confidence: 0.94)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- App.tsx
- mohsin-&-co-payroll-&-attendance/package.json
- server.ts
- package.json
- test_audit_suite.py
- dependencies
- compilerOptions
- common.ps1
- p2_regression.mjs
- p0_independent_verification.mjs
- p1_independent_verification.mjs
- qa_adversarial_deep_audit.mjs
- 1. CONFIRMED FINDINGS (10/12)
- p1_adversarial_attack.mjs
- p0_regression.mjs
- core_workflows.spec.js
- database.ts
- 2. Module Walkthroughs & Expected Behaviors
- Login Rate-Limit UX Fix Report
- Tasks: [FEATURE NAME]
- startServer
- speckit-analyze/SKILL.md
- CODE_AUDIT.md — In-Depth Static Code & Vulnerability Audit
- 2. Smoke Test Execution Matrix
- Detailed Defect Specifications & Remediation Plan
- 3. Comprehensive Deployment & Security Evaluation
- BLOCKER-01: Production-Accessible Known Administrator Credentials
- Independent Release-Blocker Security Verification Report
- FALSE_POSITIVES.md — Disproven Concerns & Clarifications
- Phase 3: P2 Remediation Records
- 4. Confirmed Defects & Evidence Index
- Smoke Test Matrix
- Execution Steps
- saveDatabase
- 3. The 7 Mandatory Quality Gates (Execution Steps)
- Detailed Evidence & Analysis
- authMiddleware
- 2. Phase-by-Phase Verification Details
- Production Database Backup & Disaster Recovery Runbook
- Final Production Readiness Report
- P1_VERIFICATION_REPORT.md — Independent Verification & Release Gate Review
- 2. Detailed Remediations
- Feature Specification: [FEATURE NAME]
- 2. Detailed P2 Defect Specifications
- ref_fs
- speckit-plan/SKILL.md
- speckit-specify/SKILL.md
- speckit-tasks/SKILL.md
- 1. Evaluation Findings & Evidence
- Core Principles
- System Architecture, Business Rules & Persistent Memory
- Assess Bug
- Findings
- Bug Triage Workflow Extension
- ref_path
- getJwtSecret
- 2. Detailed P1 Defect Specifications
- P0 Independent Verification Report
- Assess Bug
- Core Principles & System Architecture
- Implementation Plan: [FEATURE]
- Fix Bug
- Test Bug Fix
- speckit-checklist/SKILL.md
- 3. BLOCKER-02 Verification: Silent JWT Secret Fallback
- Mohsin & Co Payroll & Attendance Management System
- speckit-clarify/SKILL.md
- speckit-implement/SKILL.md
- Production Deployment Checklist
- Fix Bug
- Test Bug Fix
- speckit-constitution/SKILL.md
- OPEN.md — Open Architectural & Operational Risks
- P0_FIX_REPORT.md — Master Codex Phase 1 Remediation Report
- speckit-taskstoissues/SKILL.md
- Mohsin & Co Payroll & Attendance Management System
- [CHECKLIST TYPE] Checklist: [FEATURE NAME]
- TEST_MATRIX.md
- AGENTS.md
- p2_adversarial_attack.mjs
- mohsin_co_payroll_attendance_node_modules_jsonwebtoken_index

## God Nodes (most connected - your core abstractions)
1. `authMiddleware()` - 21 edges
2. `startServer()` - 20 edges
3. `authFetch()` - 20 edges
4. `Detailed Defect Specifications & Remediation Plan` - 18 edges
5. `1.1 `tests/test_audit_suite.py` (Python `pytest`)` - 17 edges
6. `EmployeeManagementView()` - 16 edges
7. `react` - 15 edges
8. `compilerOptions` - 15 edges
9. `getJwtSecret()` - 14 edges
10. `3. Comprehensive Deployment & Security Evaluation` - 14 edges

## Surprising Connections (you probably didn't know these)
- `BLOCKER-02: Silent Fallback to Known Static JWT Secret` --references--> `getJwtSecret()`  [INFERRED]
  qa/findings/FIXED.md → mohsin-&-co-payroll-&-attendance/src/auth.ts
- `1.3 Production Build: PASS` --references--> `getJwtSecret()`  [INFERRED]
  qa/reports/FINAL_PRE_DEPLOYMENT_STATUS.md → mohsin-&-co-payroll-&-attendance/src/auth.ts
- `5. Mandatory Remediation Steps Before Production Traffic` --references--> `getJwtSecret()`  [INFERRED]
  qa/reports/POST_DEPLOYMENT_SMOKE_TEST_REPORT.md → mohsin-&-co-payroll-&-attendance/src/auth.ts
- `Defensive `verifyPassword` Guard` --references--> `verifyPassword()`  [INFERRED]
  qa/reports/LOGIN_RATE_LIMIT_UX_FIX_REPORT.md → mohsin-&-co-payroll-&-attendance/src/auth.ts
- `DEFECT-03: Unauthenticated `/api/dashboard/metrics` ✅ CONFIRMED HIGH` --references--> `authMiddleware()`  [INFERRED]
  ADVERSARIAL_REVIEW.md → mohsin-&-co-payroll-&-attendance/src/auth.ts

## Import Cycles
- None detected.

## Communities (83 total, 3 thin omitted)

### Community 0 - "App.tsx"
Cohesion: 0.06
Nodes (80): 3. Frontend Views & UI Components, 3. Core Functional Requirements & System Modules, Daily Wage Consolidated Bulk Sheet, Daily Wage "Daily Come, Daily Pay" Financial Model, Financial Formulas, Module 1: Employee Directory & Lifecycle Management (`EmployeeManagementView`), Module 2: Attendance Tracking & Shift Engine (`AttendanceView`), Module 3: Payroll Engine & Compensation Calculations (`PayrollView`) (+72 more)

### Community 1 - "mohsin-&-co-payroll-&-attendance/package.json"
Cohesion: 0.04
Nodes (42): devDependencies, autoprefixer, tailwindcss, tsx, @types/express, @types/node, @types/sql.js, @types/node (+34 more)

### Community 2 - "server.ts"
Cohesion: 0.19
Nodes (15): AuditLog, attendanceOverrideSchema, bulkAttendanceSchema, companySettingsSchema, createEmployeeSchema, createShiftSchema, createUserSchema, loginSchema (+7 more)

### Community 3 - "package.json"
Cohesion: 0.10
Nodes (19): author, description, devDependencies, @playwright/test, @types/node, directories, test, @types/node (+11 more)

### Community 4 - "test_audit_suite.py"
Cohesion: 0.08
Nodes (26): 1.1 `tests/test_audit_suite.py` (Python `pytest`), 1.2 `tests/node_audit_test.mjs` (Node.js Native Test Runner), 1.3 `here/example.spec.js` (Playwright Template), 1.4 `tests/qa_adversarial_deep_audit.mjs` (Deep Adversarial Reproduction Suite), 1. Existing Test Inventory & Evaluation, 2. Gap Analysis & Missing Tests, TEST_AUDIT.md — Existing Test Suite Evaluation & Coverage Gap Analysis, calculate_daily_wage_payroll() (+18 more)

### Community 5 - "dependencies"
Cohesion: 0.08
Nodes (26): dependencies, bcryptjs, cors, dotenv, esbuild, express, express-rate-limit, @google/genai (+18 more)

### Community 6 - "compilerOptions"
Cohesion: 0.12
Nodes (15): compilerOptions, allowImportingTsExtensions, allowJs, experimentalDecorators, isolatedModules, jsx, lib, module (+7 more)

### Community 7 - "common.ps1"
Cohesion: 0.17
Nodes (17): Find-SpecifyRoot(), Format-SpecKitCommand(), Get-CurrentBranch(), Get-FeaturePathsEnv(), Get-InvokeSeparator(), Get-NormalizedPriority(), Get-Python3Command(), Get-RepoRoot() (+9 more)

### Community 8 - "p2_regression.mjs"
Cohesion: 0.40
Nodes (4): adminToken, envContent, envPath, envSecretMatch

### Community 9 - "p0_independent_verification.mjs"
Cohesion: 0.20
Nodes (8): adminPayload, cashierPayload, cashierToken, envContent, envPath, envSecretMatch, fallbackToken, validAdminToken

### Community 10 - "p1_independent_verification.mjs"
Cohesion: 0.29
Nodes (6): adminPayload, envContent, envPath, envSecretMatch, expiredToken, validToken

### Community 11 - "qa_adversarial_deep_audit.mjs"
Cohesion: 0.43
Nodes (4): calculatePayrollForMonth(), processBiometricPunch(), queryAll(), queryOne()

### Community 12 - "1. CONFIRMED FINDINGS (10/12)"
Cohesion: 0.07
Nodes (27): 1. CONFIRMED FINDINGS (10/12), 2. SEVERITY OVERRATED (2/12), 3. FALSE POSITIVES IN ORIGINAL REPORT (0/12), 4. MISSED CRITICAL FINDINGS (5 Additional), 5. SEVERITY RE-CLASSIFICATION TABLE, 6. REMAINING UNCERTAINTIES, 7. REPRODUCTION EVIDENCE SUMMARY, 8. CONCLUSION (+19 more)

### Community 13 - "p1_adversarial_attack.mjs"
Cohesion: 0.33
Nodes (5): adminPayload, envContent, envPath, envSecretMatch, validToken

### Community 15 - "p0_regression.mjs"
Cohesion: 0.40
Nodes (3): envContent, envPath, envSecretMatch

### Community 16 - "core_workflows.spec.js"
Cohesion: 0.13
Nodes (10): adminToken, envContent, envPath, envSecretMatch, adminToken, envContent, envPath, envSecretMatch (+2 more)

### Community 17 - "database.ts"
Cohesion: 0.27
Nodes (9): DATA_DIR, DB_PATH, getDatabase(), initSchemaAndSeed(), seedEmployeesAndAttendance(), seedInitialData(), Fix Implemented, bcryptjs (+1 more)

### Community 18 - "2. Module Walkthroughs & Expected Behaviors"
Cohesion: 0.11
Nodes (17): 1. Monthly Staff Payslip (A5 Half-A4 Standard), 1. System Overview & Navigation Structure, 2. Daily Wage Consolidated Bulk Sheet, 2. Module Walkthroughs & Expected Behaviors, A. Executive Dashboard (`DashboardView`), B. Employee Management & HR Directory (`EmployeeManagementView`), C. Attendance & Shift Tracking (`AttendanceView`), D. Payroll Management & Compensation Engine (`PayrollView`) (+9 more)

### Community 19 - "Login Rate-Limit UX Fix Report"
Cohesion: 0.08
Nodes (23): CHOSEN FIX, CURRENT CLIENT IDENTIFICATION, CURRENT LIMIT (Before Fix), CURRENT WINDOW, Defensive `verifyPassword` Guard, Full Playwright E2E Suite, LEGITIMATE USER IMPACT, Login Rate-Limit UX Fix Report (+15 more)

### Community 20 - "Tasks: [FEATURE NAME]"
Cohesion: 0.07
Nodes (26): Dependencies & Execution Order, Format: `[ID] [P?] [Story] Description`, Implementation for User Story 1, Implementation for User Story 2, Implementation for User Story 3, Implementation Strategy, Incremental Delivery, MVP First (User Story 1 Only) (+18 more)

### Community 21 - "startServer"
Cohesion: 0.36
Nodes (10): startServer(), calculateHoursWorked(), calculatePayrollForMonth(), processBiometricPunch(), verifyPassword(), queryAll(), queryOne(), runExec() (+2 more)

### Community 22 - "speckit-analyze/SKILL.md"
Cohesion: 0.08
Nodes (25): 1. Initialize Analysis Context, 2. Load Artifacts (Progressive Disclosure), 3. Build Semantic Models, 4. Detection Passes (Token-Efficient Analysis), 5. Severity Assignment, 6. Produce Compact Analysis Report, 7. Provide Next Actions, 8. Offer Remediation (+17 more)

### Community 23 - "CODE_AUDIT.md — In-Depth Static Code & Vulnerability Audit"
Cohesion: 0.10
Nodes (20): 1. Logic & Business Engine Defects, 2. React & Frontend State Defects, 3. Next.js vs. SPA Architectural Audit, 5. Database Architecture & Integrity Issues, 6. Security Vulnerabilities, CODE_AUDIT.md — In-Depth Static Code & Vulnerability Audit, [DEFECT-DB-01] sql.js In-Memory Multi-Process Incoherency, [DEFECT-DB-02] Non-Atomic Disk Writes (+12 more)

### Community 24 - "2. Smoke Test Execution Matrix"
Cohesion: 0.09
Nodes (21): 1. Executive Summary, 2. Smoke Test Execution Matrix, 3. Cryptographic Token Audit (BLOCKER-02 Live Failure), 4. Root Cause Analysis, 5. Mandatory Remediation Steps Before Production Traffic, 6. Final Decision, Critical Finding: Production Server Runs Outdated Un-Remediated Code, Post-Deployment Production Smoke Test Report (+13 more)

### Community 25 - "Detailed Defect Specifications & Remediation Plan"
Cohesion: 0.10
Nodes (20): Detailed Defect Specifications & Remediation Plan, FIX_PLAN.md — Master Codex Verified Bug Fix Plan, [P0-01] Production Server Ignores `.env` and Runs on Hardcoded Fallback Secret (DEFECT-ADV-01), [P0-02] Process-Killing Remote Denial of Service via `PUT /api/settings/users/:id` (DEFECT-ADV-02), [P0-03] Payroll Adjustments Target Month Omission & Retroactive Misattribution (DEFECT-01), [P1-01] Overnight Shift Duration Arithmetic Inversion Floored to 0.0 Hours (DEFECT-02), [P1-03] Resigned/Inactive Employees Excluded from Payroll Despite Worked Days (DEFECT-ADV-05), [P1-04] Missing Time Format Validation in `attendanceOverrideSchema` (DEFECT-ADV-03) (+12 more)

### Community 26 - "3. Comprehensive Deployment & Security Evaluation"
Cohesion: 0.05
Nodes (34): 2. Deep Dive on New Confirmed Defects, 3. Likely Defects & Vulnerabilities, 4. Possible Architectural Risks, 5. False Positives / Disproven Concerns, 6. Recommendations & Remediation Summary, [DEFECT-ADV-01] Production Server Ignores `.env` and Runs on Hardcoded Fallback Secret, [DEFECT-ADV-02] Process-Killing Remote Denial of Service via `PUT /api/settings/users/:id`, [DEFECT-ADV-03] Missing Time Format Validation Causes `NaN` / `null` Hours Worked (+26 more)

### Community 27 - "BLOCKER-01: Production-Accessible Known Administrator Credentials"
Cohesion: 0.10
Nodes (19): 1. Executive Summary, 2. Detailed Remediations, 3. Pre-Release Conditions Addressed, Before vs After Behavior, Before vs After Behavior, BLOCKER-01: Production-Accessible Known Administrator Credentials, BLOCKER-02: Silent JWT Secret Fallback, Files Changed (+11 more)

### Community 28 - "Independent Release-Blocker Security Verification Report"
Cohesion: 0.12
Nodes (16): 10. Required Human Actions Before Production Release, 11. Final Classifications, 12. Final Release Decision, 1. Executive Summary, 2.1 Static Codebase Analysis, 2.2 Isolated Temporary Database Tests, 2.3 Live Running Server Test, 2. BLOCKER-01 Verification: Known Admin Credentials (+8 more)

### Community 29 - "FALSE_POSITIVES.md — Disproven Concerns & Clarifications"
Cohesion: 0.33
Nodes (5): 1. SQL Injection in Search, Filter, and Payroll Queries, 2. Missing Next.js App Router / Server Actions Vulnerabilities, 3. JWT Query Parameter Exposure Vulnerability, 4. Unvalidated Role Escalation via Inactive Switch-Role Feature, FALSE_POSITIVES.md — Disproven Concerns & Clarifications

### Community 30 - "Phase 3: P2 Remediation Records"
Cohesion: 0.10
Nodes (20): BLOCKER-01: Hardcoded Demo Credentials Exposed in UI & Seeding, BLOCKER-02: Silent Fallback to Known Static JWT Secret, Detailed Remediation Records, FIXED.md — Remediated Defects & Verification Register, P0-01 (DEFECT-ADV-01): JWT Fallback Secret & Missing Dotenv Ingestion, P0-02 (DEFECT-ADV-02): Partial User Update Destructuring Process Crash, P0-03 (DEFECT-01): Adjustment Target Month Misattribution in Payroll Engine, P1-01 (DEFECT-03 / DEFECT-ADV-08): Unauthenticated Public Financial Metrics Disclosure (+12 more)

### Community 31 - "4. Confirmed Defects & Evidence Index"
Cohesion: 0.11
Nodes (18): 1. Overall Risk Summary, 2. Test Execution Scorecard, 3. Detailed Master Codex Deliverables Index, 4. Confirmed Defects & Evidence Index, 5. Remediation Roadmap (Phase 10 Guidance), 🔴 DEFECT-01 (Critical): Payroll Adjustments Target Month Omission & Misattribution, 🔴 DEFECT-02 (High): Overnight Shift Work Duration Inversion Collapses to 0.0 Hours, 🟡 DEFECT-04 (Medium): Broken Self-Deletion Check Allows Admin Self-Lockout (+10 more)

### Community 32 - "Smoke Test Matrix"
Cohesion: 0.12
Nodes (16): 10. Database Write & Read Round-Trip, 11. Error Handling & Security Boundary Check, 12. Mobile & Cross-Browser Responsiveness, 1. Health & Build Integrity Check, 2. Login Workflow, 3. Logout & Session Invalidation, 4. Authorization & Role Enforcement, 5. Employee Directory & Safe Creation (Non-Destructive) (+8 more)

### Community 33 - "Execution Steps"
Cohesion: 0.12
Nodes (15): 1. Initialize Convergence Context, 2. Load Artifacts (Progressive Disclosure), 3. Build the Intent Inventory, 4. Assess the Codebase and Classify Findings, 5. Assign Severity, 6. Present the In-Session Findings Summary, 7. Append Convergence Tasks (or report converged), 8. Provide Next Actions (Handoff) (+7 more)

### Community 34 - "saveDatabase"
Cohesion: 0.13
Nodes (15): saveDatabase(), 1. System Architecture Discovery (Phase 0), 2.1 Frontend Tabs & Views, 2.2 Backend REST API Endpoints, 2. Comprehensive Route & Endpoint Map (Phase 1), 3. User Roles & RBAC Matrix, 4. Critical Business Workflows, 5. Security & Risk Surface Analysis (+7 more)

### Community 35 - "3. The 7 Mandatory Quality Gates (Execution Steps)"
Cohesion: 0.11
Nodes (17): 1. Testing Philosophy & Core Principles, 2. Test Suite Catalog & Test Architecture, 3. The 7 Mandatory Quality Gates (Execution Steps), 4. Expected Test Outputs & Assertion Standards, 5. Troubleshooting & Continuous Verification FAQ, A. Deep QA Audit Output Reference, B. Business Logic Unit Tests Output Reference, Core Verification Rules (+9 more)

### Community 36 - "Detailed Evidence & Analysis"
Cohesion: 0.12
Nodes (15): DEFECT-01: Adjustment Target Month Omission & Misattribution, DEFECT-02: Overnight Shift Minute Arithmetic Inversion Floored to 0.0 Hours, DEFECT-03: Unauthenticated Public Financial Metrics Disclosure, DEFECT-04: Self-Deletion Check Logic Failure Allows Admin Self-Lockout, DEFECT-05: Scheduled Off-Day Work Uncredited for Daily Wage Earners, DEFECT-06: Future Month Unworked Period Calculated at 100% Full Base Salary, DEFECT-07: Rapid Double-Punch on Biometric Terminal Records Immediate 0-Hour Check-Out, DEFECT-08: Stored Cross-Site Scripting (XSS) in Print Templates (+7 more)

### Community 37 - "authMiddleware"
Cohesion: 0.15
Nodes (18): authMiddleware(), JWTPayload, optionalAuth(), requirePermission(), requireRole(), verifyToken(), 4. API & Protocol Vulnerabilities, [DEFECT-API-01] Unauthenticated Financial Dashboard Metrics Endpoint (+10 more)

### Community 38 - "2. Phase-by-Phase Verification Details"
Cohesion: 0.14
Nodes (13): 1. Executive Summary, 2. Phase-by-Phase Verification Details, 3. Deployment Audit Checklist & Classifications, 4. Final Decision, Phase 2: Deployment Environment & Secrets Configuration, Phase 3: Database Safety & Pre-Deployment Backup, Phase 4: Hostinger Automated Backup Configuration, Phase 5: Remediated Build Deployment (+5 more)

### Community 39 - "Production Database Backup & Disaster Recovery Runbook"
Cohesion: 0.14
Nodes (13): 1. Executive Summary & Architecture Context, 2. Backup Strategy & Scheduling, 3. Host-Level Automated Backup Script, 4. Hostinger / Cloud VPS Operational Requirements, 5. Restoration & Verification Procedure, 6. Disaster Recovery Simulation Drill, Production Database Backup & Disaster Recovery Runbook, Recommended Backup Schedule (+5 more)

### Community 40 - "Final Production Readiness Report"
Cohesion: 0.15
Nodes (12): Accepted Risks, Build & Test Results, Critical Workflow Status, DEFECT-10: Cascading Unawaited Async State Handlers in `App.tsx`, DEFECT-11: Default Demo Credentials Displayed in Plaintext on Login UI, DEFECT-12: Dark-to-Light Flash of Unstyled Content (FOUC), Executive Decision, Final Production Readiness Report (+4 more)

### Community 41 - "P1_VERIFICATION_REPORT.md — Independent Verification & Release Gate Review"
Cohesion: 0.15
Nodes (12): 1. Executive Summary, 2. Independent Finding-by-Finding Verification, 3. Comprehensive Quality Gate & Regression Scorecard, 4. Release Gate Decision, FINAL DECISION, [P1-01] DEFECT-03 / DEFECT-ADV-08: Unauthenticated Public Financial Metrics Disclosure, [P1-02] DEFECT-ADV-03: Missing Time Format Validation in `attendanceOverrideSchema`, [P1-03] DEFECT-02 / DEFECT-ADV-07: Overnight Shift Duration Arithmetic Inversion Floored to 0.0 Hours (+4 more)

### Community 42 - "2. Detailed Remediations"
Cohesion: 0.15
Nodes (12): 1. Executive Summary, 2. Detailed Remediations, 3. Full Regression Suite Results, 4. Final P2 Classification, Defect Resolution Scorecard, P2-01 (`DEFECT-09`): `half_day` Attendance Status Counted as 100% Full Day in Daily Wage Payroll, P2-02 (`DEFECT-05`): Working on Scheduled Off-Days Uncredited for Daily Wage Earners, P2-03 (`DEFECT-06`): Future Month Payroll Calculation Awards 100% Full Salary for 0 Days Worked (+4 more)

### Community 43 - "Feature Specification: [FEATURE NAME]"
Cohesion: 0.15
Nodes (12): Assumptions, Edge Cases, Feature Specification: [FEATURE NAME], Functional Requirements, Key Entities *(include if feature involves data)*, Measurable Outcomes, Requirements *(mandatory)*, Success Criteria *(mandatory)* (+4 more)

### Community 44 - "2. Detailed P2 Defect Specifications"
Cohesion: 0.17
Nodes (11): 1. Prioritization & Ordering, 2. Detailed P2 Defect Specifications, 3. Step-by-Step Remediation Sequence, [P2-01] DEFECT-09: `half_day` Attendance Status Counted as 100% Full Day in Daily Wage Payroll, [P2-02] DEFECT-05: Working on Scheduled Off-Days Uncredited for Daily Wage Earners, [P2-03] DEFECT-06: Future Month Payroll Calculation Awards 100% Full Salary for 0 Days Worked, [P2-04] DEFECT-04: Flawed Self-Deletion Check Permitting Admin Self-Lockout, [P2-05] DEFECT-08: Stored Cross-Site Scripting (XSS) in Printable Ledger & Reports Templates (+3 more)

### Community 45 - "ref_fs"
Cohesion: 0.12
Nodes (10): esbuild, adminToken, appDir, cashierToken, envContent, envPath, envSecretMatch, hrToken (+2 more)

### Community 46 - "speckit-plan/SKILL.md"
Cohesion: 0.18
Nodes (10): Completion Report, Done When, Key rules, Mandatory Post-Execution Hooks, Outline, Phase 0: Outline & Research, Phase 1: Design & Contracts, Phases (+2 more)

### Community 47 - "speckit-specify/SKILL.md"
Cohesion: 0.18
Nodes (10): Completion Report, Done When, For AI Generation, Mandatory Post-Execution Hooks, Outline, Pre-Execution Checks, Quick Guidelines, Section Requirements (+2 more)

### Community 48 - "speckit-tasks/SKILL.md"
Cohesion: 0.18
Nodes (10): Checklist Format (REQUIRED), Completion Report, Done When, Mandatory Post-Execution Hooks, Outline, Phase Structure, Pre-Execution Checks, Task Generation Rules (+2 more)

### Community 49 - "1. Evaluation Findings & Evidence"
Cohesion: 0.18
Nodes (10): 1.2 Test Integrity: PASS, 1.3 Production Build: PASS, 1.4 Production JWT Secret: VERIFIED, 1.5 Reverse Proxy: UNKNOWN, 1.6 Database Backups: UNKNOWN, 1.7 Demo Credentials: FIXED, 1. Evaluation Findings & Evidence, 2. Final Classifications (+2 more)

### Community 50 - "Core Principles"
Cohesion: 0.18
Nodes (10): Core Principles, Governance, [PRINCIPLE_1_NAME], [PRINCIPLE_2_NAME], [PRINCIPLE_3_NAME], [PRINCIPLE_4_NAME], [PRINCIPLE_5_NAME], [PROJECT_NAME] Constitution (+2 more)

### Community 51 - "System Architecture, Business Rules & Persistent Memory"
Cohesion: 0.18
Nodes (10): 1. Key Business Rules & Formulas, 2. Database Schema (SQLite via `sql.js`), 4. Agent Protocols & Knowledge Graph (Graphify & AGENTS.md), 5. Verification & Testing, A. Payroll Calculation & Payout, B. Accurate Accrual Cost Calculation (Today & Month-To-Date), C. Dynamic Monthly Days & Strict User-Selected Off Days, C. Employee Lifecycle & Data Integrity (+2 more)

### Community 52 - "Assess Bug"
Cohesion: 0.20
Nodes (9): Assess Bug, Bug Assess Skill, Execution, Guardrails, Prerequisites, Safety When Fetching URLs, Slug Resolution, URL Trust Policy (+1 more)

### Community 53 - "Findings"
Cohesion: 0.20
Nodes (9): Files Changed, Findings, [P1-01] DEFECT-03 / DEFECT-ADV-08: Unauthenticated Public Financial Metrics Disclosure, [P1-02] DEFECT-ADV-03: Missing Time Format Validation in `attendanceOverrideSchema`, [P1-03] DEFECT-02 / DEFECT-ADV-07: Overnight Shift Duration Arithmetic Inversion Floored to 0.0 Hours, [P1-04] DEFECT-ADV-05: Resigned/Inactive Employees Excluded from Payroll Despite Worked Shifts, P1 Fix Report, Summary (+1 more)

### Community 54 - "Bug Triage Workflow Extension"
Cohesion: 0.20
Nodes (9): Bug Triage Workflow Extension, Commands, Disabling, Guardrails, Hooks, Installation, Overview, Slug Conventions (+1 more)

### Community 55 - "ref_path"
Cohesion: 0.20
Nodes (7): @tailwindcss/vite, vite, @vitejs/plugin-react, adminToken, envContent, envPath, envSecretMatch

### Community 56 - "getJwtSecret"
Cohesion: 0.15
Nodes (10): generateToken(), getJwtSecret(), hashPassword(), 2. Per-Finding Remediation Breakdown, P0-01 (DEFECT-ADV-01): JWT Fallback Secret & Missing Dotenv Ingestion, P0-02 (DEFECT-ADV-02): Partial User Update Destructuring Node.js Process Crash, P0-03 (DEFECT-01): Adjustment Target Month Misattribution in Payroll Engine, Phase 1: Local Release Artifact Verification (+2 more)

### Community 57 - "2. Detailed P1 Defect Specifications"
Cohesion: 0.22
Nodes (8): 1. Prioritization & Ordering, 2. Detailed P1 Defect Specifications, 3. Step-by-Step Remediation Plan, [P1-01] DEFECT-03 / DEFECT-ADV-08: Unauthenticated Public Access to Confidential Financial Metrics, [P1-02] DEFECT-ADV-03: Missing Time Format Validation in `attendanceOverrideSchema`, [P1-03] DEFECT-02 / DEFECT-ADV-07: Overnight Shift Duration Arithmetic Inversion Floored to 0.0 Hours, [P1-04] DEFECT-ADV-05: Resigned/Inactive Employees Excluded from Payroll Despite Worked Shifts, P1_FIX_PLAN.md — Master Codex Phase 2: P1 Remediation Plan

### Community 58 - "P0 Independent Verification Report"
Cohesion: 0.22
Nodes (8): Executive Result, FINAL DECISION, Finding-by-Finding Verification, [P0-01] DEFECT-ADV-01: JWT Fallback Secret & Missing Dotenv Ingestion, [P0-02] DEFECT-ADV-02: Partial User Update Destructuring Node.js Process Crash, [P0-03] DEFECT-01: Adjustment Target Month Misattribution in Payroll Engine, P0 Independent Verification Report, Release Gate

### Community 59 - "Assess Bug"
Cohesion: 0.22
Nodes (8): Assess Bug, Execution, Guardrails, Prerequisites, Safety When Fetching URLs, Slug Resolution, URL Trust Policy, User Input

### Community 60 - "Core Principles & System Architecture"
Cohesion: 0.20
Nodes (9): Core Principles & System Architecture, I. Accurate Attendance & Explicit Absence Preservation (NON-NEGOTIABLE), II. Employee Lifecycle, Soft-Deletion & Reactivation Security, III. Shift Policies & Work Hours Architecture, Mohsin & Co Payroll & Attendance Management System - Constitution & Permanent Memory, Technical Specifications & Storage, V. Daily Wage Management & "Daily Come, Daily Pay" Architecture, VI. Dashboard & Reporting Metrics Architecture (+1 more)

### Community 61 - "Implementation Plan: [FEATURE]"
Cohesion: 0.22
Nodes (8): Complexity Tracking, Constitution Check, Documentation (this feature), Implementation Plan: [FEATURE], Project Structure, Source Code (repository root), Summary, Technical Context

### Community 62 - "Fix Bug"
Cohesion: 0.25
Nodes (7): Bug Fix Skill, Execution, Fix Bug, Guardrails, Prerequisites, Slug Resolution, User Input

### Community 63 - "Test Bug Fix"
Cohesion: 0.25
Nodes (7): Bug Test Skill, Execution, Guardrails, Prerequisites, Slug Resolution, Test Bug Fix, User Input

### Community 64 - "speckit-checklist/SKILL.md"
Cohesion: 0.25
Nodes (7): Anti-Examples: What NOT To Do, Checklist Purpose: "Unit Tests for English", Example Checklist Types & Sample Items, Execution Steps, Post-Execution Checks, Pre-Execution Checks, User Input

### Community 65 - "3. BLOCKER-02 Verification: Silent JWT Secret Fallback"
Cohesion: 0.50
Nodes (4): 3.1 Implementation Inspection (`src/auth.ts` & `server.ts`), 3.2 Process Startup Scenarios Tested Independently, 3.3 Cryptographic Token Verification, 3. BLOCKER-02 Verification: Silent JWT Secret Fallback

### Community 66 - "Mohsin & Co Payroll & Attendance Management System"
Cohesion: 0.25
Nodes (7): 1. Executive Summary & Product Vision, 2. User Roles & Permission Matrix, 4. Non-Functional & Technical Requirements, 5. Architectural Memory & Changelog, Mohsin & Co Payroll & Attendance Management System, Product Requirements Document (PRD), v2.2.0 (Current)

### Community 67 - "speckit-clarify/SKILL.md"
Cohesion: 0.29
Nodes (6): Completion Report, Done When, Mandatory Post-Execution Hooks, Outline, Pre-Execution Checks, User Input

### Community 68 - "speckit-implement/SKILL.md"
Cohesion: 0.29
Nodes (6): Completion Report, Done When, Mandatory Post-Execution Hooks, Outline, Pre-Execution Checks, User Input

### Community 71 - "Production Deployment Checklist"
Cohesion: 0.29
Nodes (6): 1. Environment & Cryptographic Secrets, 2. Database & Filesystem, 3. Reverse Proxy & Network Security, 4. Application Runtime & Process Management, 5. Host Backup & Recovery, Production Deployment Checklist

### Community 72 - "Fix Bug"
Cohesion: 0.29
Nodes (6): Execution, Fix Bug, Guardrails, Prerequisites, Slug Resolution, User Input

### Community 73 - "Test Bug Fix"
Cohesion: 0.29
Nodes (6): Execution, Guardrails, Prerequisites, Slug Resolution, Test Bug Fix, User Input

### Community 74 - "speckit-constitution/SKILL.md"
Cohesion: 0.33
Nodes (5): Outline, Post-Execution Checks, Pre-Execution Checks, Scope Guard, User Input

### Community 75 - "OPEN.md — Open Architectural & Operational Risks"
Cohesion: 0.33
Nodes (5): 1. [RISK-ARCH-01] `sql.js` In-Memory WebAssembly Multi-Process Concurrency Desync, 2. [RISK-OPS-01] Orphaned Documents & File Leakage on Employee Deletion, 3. [RISK-SEC-01] Committed Production JWT Secret in Source Control, 4. [RISK-PERF-01] Non-Atomic SQLite Database Exports Under Disk Stress, OPEN.md — Open Architectural & Operational Risks

### Community 76 - "P0_FIX_REPORT.md — Master Codex Phase 1 Remediation Report"
Cohesion: 0.33
Nodes (5): 1. Executive Summary, 3. Quality Gate Scorecard, 4. Remaining Risks Statement, 5. Phase 1 Stop Condition, P0_FIX_REPORT.md — Master Codex Phase 1 Remediation Report

### Community 78 - "speckit-taskstoissues/SKILL.md"
Cohesion: 0.40
Nodes (4): Outline, Post-Execution Checks, Pre-Execution Checks, User Input

### Community 79 - "Mohsin & Co Payroll & Attendance Management System"
Cohesion: 0.40
Nodes (4): Architecture & System Documentation, Core Principles & Business Logic, Mohsin & Co Payroll & Attendance Management System, Running Locally

### Community 80 - "[CHECKLIST TYPE] Checklist: [FEATURE NAME]"
Cohesion: 0.40
Nodes (4): [Category 1], [Category 2], [CHECKLIST TYPE] Checklist: [FEATURE NAME], Notes

### Community 82 - "AGENTS.md"
Cohesion: 0.20
Nodes (9): 1. Fast Architecture Lookups (Graphify First), 2. Mandatory Post-Edit Graph Update, 3. Architecture Diagrams & Workflows (Archify), 4.1 Mandatory TDD, Unit Testing & Adversarial Verification, 4. Quality Gates & Compilations, 5. Coding Principles, Adversarial Break & Reverse Verification ("Mutation Testing Protocol"), Integration Testing (+1 more)

### Community 83 - "p2_adversarial_attack.mjs"
Cohesion: 0.40
Nodes (4): adminToken, envContent, envPath, envSecretMatch

### Community 85 - "mohsin_co_payroll_attendance_node_modules_jsonwebtoken_index"
Cohesion: 0.22
Nodes (4): authToken, envContent, envPath, envSecretMatch

## Knowledge Gaps
- **14 isolated node(s):** `@google/genai`, `@types/bcryptjs`, `@types/cors`, `@types/jsonwebtoken`, `@types/multer` (+9 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 775 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `authMiddleware()` connect `authMiddleware` to `server.ts`, `Detailed Evidence & Analysis`, `P1_VERIFICATION_REPORT.md — Independent Verification & Release Gate Review`, `1. CONFIRMED FINDINGS (10/12)`, `startServer`, `Findings`, `getJwtSecret`, `2. Detailed P1 Defect Specifications`, `FALSE_POSITIVES.md — Disproven Concerns & Clarifications`, `Phase 3: P2 Remediation Records`, `4. Confirmed Defects & Evidence Index`?**
  _High betweenness centrality (0.138) - this node is a cross-community bridge._
- **Are the 18 inferred relationships involving `authMiddleware()` (e.g. with `DEFECT-03: Unauthenticated `/api/dashboard/metrics` ✅ CONFIRMED HIGH` and `startServer()`) actually correct?**
  _`authMiddleware()` has 18 INFERRED edges - model-reasoned connections that need verification._
- **What connects `@google/genai`, `@types/bcryptjs`, `@types/cors` to the rest of the system?**
  _14 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `App.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.06378865979381443 - nodes in this community are weakly interconnected._
- **Why does `getJwtSecret()` connect `getJwtSecret` to `3. BLOCKER-02 Verification: Silent JWT Secret Fallback`, `server.ts`, `authMiddleware`, `1. Evaluation Findings & Evidence`, `startServer`, `2. Smoke Test Execution Matrix`, `BLOCKER-01: Production-Accessible Known Administrator Credentials`, `Phase 3: P2 Remediation Records`?**
  _High betweenness centrality (0.040) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `startServer()` (e.g. with `authMiddleware()` and `Fix Implemented`) actually correct?**
  _`startServer()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Should `mohsin-&-co-payroll-&-attendance/package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.043478260869565216 - nodes in this community are weakly interconnected._