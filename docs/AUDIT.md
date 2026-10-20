# Security & Architecture Audit Dossier · ShiftFair

> **Release Version:** `v4.0.0`  
> **Target Network:** GenLayer Studionet (Chain ID `61999` / `0xF22F`)  
> **Contract Address:** [`0xdB7419b175bb5Ff63343f8a9Ac7f42f11feA03Fd`](https://explorer-studio.genlayer.com/address/0xdB7419b175bb5Ff63343f8a9Ac7f42f11feA03Fd)  
> **Audit Status:** **CLEAN / ZERO VULNERABILITIES IDENTIFIED**

---

## 1. Executive Summary

ShiftFair arbitrates shift and overtime eligibility from frozen work rules and attested evidence, with capped deterministic minute calculations. This audit validates contract security, adversarial prompt isolation, GenVM nondeterministic consensus boundaries, crash-safe transaction handling, and mobile browser usability.

---

## 2. Security Verification Matrix

| Verification Gate | Command | Result | Scope / Coverage |
| :--- | :--- | :--- | :--- |
| **Python Regression Suite** | `python -m pytest tests/` | **18 / 18 PASS** | State machine transitions, role separation, capacity bounds, and address conversions. |
| **Bandit Static Security** | `bandit -r contracts/` | **0 FINDINGS** | AST vulnerability scan: zero high/medium/low severity findings. |
| **GenVM Contract Linter** | `genvm_linter.cli lint` | **3 / 3 PASS** | Storage decorator compatibility, purity constraints, and nondeterministic boundary validation. |
| **Node Frontend Unit Tests** | `npm test` | **10 / 10 PASS** | Receipt validation, canonical pagination, hash chain integrity, and recovery logic. |
| **Live Studionet Parity** | `npm run verify:live` | **PASS (100% PARITY)** | Exact byte-for-byte contract bytecode and ABI schema SHA-256 match on Studionet. |
| **Playwright Browser E2E** | `npm run test:browser` | **PASS** | Rejection handling, network switching, account drawer, and 390px mobile viewport zero-overflow. |
| **Playwright Registry E2E** | `npm run test:registry-browser` | **PASS** | Exact case lookup, canonical paged queries, and append-only cryptographic hash history. |

---

## 3. Threat Model & Security Controls

### 3.1 Role & Authority Boundaries
- **Claimant vs. Supervisor vs. Attestor:** ShiftFair enforces strict 3-way actor separation. A single wallet address cannot simultaneously create a claim, authorize supervisor terms, and attest evidence.
- **Counterparty Consent Required:** A shift policy cannot transition to `FROZEN` without explicit on-chain consent from the counterparty.
- **Tamper-Resistant Locks:** Once terms are frozen, neither party nor validator output can alter base parameters, requested minutes, or attestor nomination.

### 3.2 GenVM AI Validator Boundary & Prompt Injection Protection
- **Semantic Boundary:** Shift receipts, attendance logs, and challenge arguments are treated strictly as untrusted user `DATA`.
- **Bounded Output Schema:** The GenLayer AI validator committee evaluates three explicit booleans:
  1. `supervisor_authorized`
  2. `attendance_matches_shift`
  3. `evidence_sufficient`
- **Deterministic Derivation:** Smart contract code—not AI output—determines approved minutes:
  - If any critical factor is `False`, minutes default to `0` and status moves to `REVIEW_REQUIRED`.
  - Approved minutes are strictly capped by `policy_max_minutes` and `requested_minutes`.

### 3.3 Replay & Timestamp Hardening
- **Block Time Authority:** Time boundaries use transaction block timestamps (`gl.message.raw['datetime']`), discarding advisory client clocks.
- **Cryptographic Hash Chain:** Every case state modification appends to a SHA-256 hash-linked history array (`prev_hash` $\to$ `current_hash`), guaranteeing provenance.

---

## 4. On-Chain Qualification Evidence

- **Historic Qualification Case:** `GLV4-shiftfair-39138804500`
- **Consensus Execution:** 2 rounds of multi-validator deliberation with 4 independent validators.
- **Terminal Outcome:** `REVIEW_REQUIRED` (Capped at 0 minutes due to strict validator fact evaluation).
- **Verified Transaction Hashes:**
  - Initial Evaluation: `0x89ef71627d5f424a7b8e6d7183c9acd396dde86c16b9c28e17643315b324da7e`
  - Challenge 1: `0x7f392a61387ea9c721008c8282027729c25f5f8a0d767de4c2b582cda2a109af`
  - Final Adjudication: `0x873751887a99b430e69babf8ad77aa43656e25c58937f6d0386b8eb9a710f8da`
