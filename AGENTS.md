# AGENTS.md - Agent Operating Standards & Knowledge Graph Protocol

This repository is governed by the following strict operating instructions for all AI coding agents (Antigravity, Claude Code, Codex, Aider, OpenCode).

---

## 1. Fast Architecture Lookups (Graphify First)

This project maintains an AST and semantic knowledge graph under `graphify-out/`.

**MANDATORY RULE**:
- **NEVER** re-analyze the entire codebase or run repetitive broad greps from scratch.
- **FIRST** query the knowledge graph:
  ```powershell
  .\graphify.cmd query "<concept or question>"
  ```
  Or for specific symbol relationships:
  ```powershell
  .\graphify.cmd path "<NodeA>" "<NodeB>"
  .\graphify.cmd explain "<Concept>"
  ```
- Refer to `graphify-out/GRAPH_REPORT.md` and `graphify-out/graph.json` for community groupings, data flows, and god-nodes.
- If `graphify-out/wiki/index.md` exists, navigate the wiki directly.

---

## 2. Mandatory Post-Edit Graph Update

Whenever any TypeScript, JavaScript, or backend files are modified:
- **IMMEDIATELY** run:
  ```powershell
  .\graphify.cmd update .
  ```
  This is a local AST-only incremental update (no API cost) that keeps node mappings, exports, and call-graphs synchronized.

---

## 3. Architecture Diagrams & Workflows (Archify)

- When visual architecture, request lifecycles, or sequence flows are required or modified, consult and update the diagrams using `archify`.
- Keep system component boundaries and payroll state machines documented.

---


---

## 4.1 Mandatory TDD, Unit Testing & Adversarial Verification

**Unit testing is mandatory on all tasks. Always activate and follow 	dd-workflow principles.**

### The TDD Cycle (Strictly Enforced)
1. **RED**: Write or update tests first before modifying implementation code. Run tests to confirm they fail as expected.
2. **GREEN**: Write minimal, clean, type-safe implementation code to pass the tests.
3. **REFACTOR**: Polish code for performance, readability, and maintainability while preserving passing tests.
4. **COVERAGE**: Maintain 80%+ test coverage across core domain logic, utilities, and components.

### Integration Testing
- Unit tests alone are insufficient: always verify integration across database records, API route handlers, and UI workflows.
- Confirm state persists correctly after page reload and client-side transitions.

### Adversarial Break & Reverse Verification ("Mutation Testing Protocol")
- **Break It**: After implementing or modifying a feature, intentionally introduce a defect, boundary mutation, or invalid payload to verify that:
  - The automated test suite catches the failure immediately.
  - The UI and API fail gracefully with proper error boundaries rather than unhandled crashes.
- **Reverse & Confirm**: Revert the intentional defect and re-run all checks. If all tests pass cleanly, the feature is verified.
- **Rule**: If a test suite passes when business logic is broken, the test suite is inadequate.

## 4. Quality Gates & Compilations

Before declaring any task complete or delivering output:
1. **TypeScript Typecheck**:
   ```powershell
   node ./node_modules/typescript/bin/tsc --noEmit
   ```
   Must pass with **0 errors**.
2. **QA Deep Audit**:
   ```powershell
   node --test tests/comprehensive_deep_qa_audit.mjs
   ```
   All 20/20 test suites must pass.
3. **Build Check**:
   ```powershell
   node build.js
   ```
4. **Dev Server Liveness**:
   The dev server must remain actively running on port 3000 (`http://localhost:3000`).

---

## 5. Coding Principles

- **No Undefined Variables**: Every variable, state handler, and import must be explicitly typed and declared.
- **No Unnecessary Wording**: Keep user-facing documents (like payslips and invoices) clean, concise, and formatted for targeted paper dimensions (e.g., A5 / Half-A4).

