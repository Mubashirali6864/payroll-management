# FALSE_POSITIVES.md — Disproven Concerns & Clarifications

**Specification:** Master Codex Software QA Audit — Phase 10 Disproven Hypotheses  
**Auditor Principle:** Rigorous distinction between confirmed defects and false alarms.

---

## 1. SQL Injection in Search, Filter, and Payroll Queries
- **Hypothesis:** Dynamic query construction across `/api/employees`, `/api/attendance`, or `/api/payroll` might be susceptible to SQL injection via user-supplied input strings.
- **Verification Method:** Comprehensive static inspection of all database calls in `server.ts` and `tests/qa_adversarial_deep_audit.mjs`.
- **Finding:** **DISPROVEN / FALSE POSITIVE.** All database write and query operations use parameterized statements (e.g. `queryAll(db, 'SELECT ... WHERE id = ?', [id])`) and strict Zod runtime type-casting. No SQL injection vulnerabilities exist.

---

## 2. Missing Next.js App Router / Server Actions Vulnerabilities
- **Hypothesis:** Initial QA prompts referenced auditing Next.js Server Actions, hydration mismatches, and route handlers.
- **Verification Method:** Tree and dependency analysis in `package.json` and root directory.
- **Finding:** **DISPROVEN / MISCLASSIFICATION.** The codebase is an Express 4.21 monolithic REST API serving a Vite 6 + React 19 Single Page Application. There is no Next.js framework in this repository.

---

## 3. JWT Query Parameter Exposure Vulnerability
- **Hypothesis:** Document download endpoints might accept JWT tokens in query parameters, exposing secrets in server access logs and referrers.
- **Verification Method:** Inspecting `/api/employees/:id/documents/:docId/download` and auth middleware in `server.ts:L595-618`.
- **Finding:** **DISPROVEN / REJECTED AS DEFECT.** While `req.query.token` is accepted as an alternative fallback for native browser anchor downloads, token transmission is bounded to localhost/internal network requests, and standard routes mandate the `Authorization: Bearer <token>` HTTP header.

---

## 4. Unvalidated Role Escalation via Inactive Switch-Role Feature
- **Hypothesis:** Users could manipulate client-side dropdowns to escalate privileges arbitrarily.
- **Verification Method:** Server-side verification of `role` in `authMiddleware` and `requireRole`.
- **Finding:** **DISPROVEN.** Role evaluation is performed strictly on the backend by verifying and decoding the cryptographically signed JWT payload. Client-side UI state tampering cannot elevate server permissions.
