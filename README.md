# ShiftFair

> **Autonomous Gig & Shift Dispute Adjudication with GenLayer Intelligent Contracts and Capped Deterministic Arithmetic.**

[![GenLayer Network](https://img.shields.io/badge/Network-GenLayer%20Studionet%20(61999)-6affd8?style=flat-square)](https://studio.genlayer.com)
[![Contract](https://img.shields.io/badge/Contract-0xdB74...03Fd-blue?style=flat-square)](https://explorer-studio.genlayer.com/address/0xdB7419b175bb5Ff63343f8a9Ac7f42f11feA03Fd)
[![Contract Tests](https://img.shields.io/badge/Python%20Tests-18%2F18%20PASS-brightgreen?style=flat-square)]()
[![Frontend Tests](https://img.shields.io/badge/Frontend%20Tests-10%2F10%20PASS-brightgreen?style=flat-square)]()
[![Browser E2E](https://img.shields.io/badge/Playwright%20E2E-PASS%20(Desktop%20%2B%20Mobile)-success?style=flat-square)]()
[![Security Audit](https://img.shields.io/badge/Bandit%20Scan-0%20Issues-brightgreen?style=flat-square)]()
[![Live App](https://img.shields.io/badge/Live%20App-Vercel%20Production-purple?style=flat-square)](https://shiftfair-genlayer.vercel.app)

---

## 1. What It Does

ShiftFair resolves disputed shift overtime and attendance records by uniting deterministic smart contract guarantees with bounded GenLayer AI semantic consensus:

1. **Frozen Shift Policy**: Claimant and employer/supervisor establish immutable baseline shift hours, maximum allowable overtime, and designate an independent third-party attestor before work commences.
2. **Hash-Bound Attendance Evidence**: Timesheets, geolocation pings, badge swipes, and supervisor authorizations are hashed (`SHA-256`) and locked into contract storage.
3. **Third-Party Attestation**: The nominated attestor independently signs an on-chain attestation binding the physical attendance evidence to an external verifiable reference.
4. **GenLayer Multi-Validator AI Consensus**: Independent validators assess whether the attendance evidence corroborates requested hours and whether supervisor authorization is substantiated.
5. **Deterministic Capped Arithmetic**: The smart contract—not the AI—calculates the approved minutes, strictly capping payouts to policy boundaries. Disagreements trigger an appeal round without silent approvals.

---

## 2. Why GenLayer

Standard smart contracts cannot interpret unstructured attendance records, photos of timesheet logs, or handwritten supervisor authorizations. Traditional off-chain oracles introduce centralization risks and single points of failure.

GenLayer resolves this via **Intelligent Contracts & Optimistic Democracy**:
- **Validator Fact Consensus**: GenLayer validators independently evaluate three bounded booleans:
  - `supervisor_authorized`: Did an authorized manager approve the extra shift?
  - `attendance_matches_shift`: Do timesheet/badge records corroborate the requested hours?
  - `evidence_sufficient`: Is proof complete, verifiable, and uncontradicted?
- **Strict Code-Enforced Mapping**:
  $$\text{All True} \longrightarrow \mathbf{APPROVED\_MINUTES} = \min(\text{requested}, \text{policy\_cap})$$
  $$\text{Any False or Inconclusive} \longrightarrow \mathbf{REVIEW\_REQUIRED} \quad (\text{approved} = 0)$$
- **Adversarial Prompt Hardening**: Model instructions treat all evidence and challenge arguments as untrusted raw `DATA`, impervious to prompt injection attacks.

---

## 3. Steward Feedback & UX Overhaul (`zoefunds`)

In response to reviewer feedback (*"No wallet connect?"*), ShiftFair was completely re-architected following the Nudge-Folio design specification:

| Reviewer Feedback | Root Cause | Engineering Remediation |
| :--- | :--- | :--- |
| **"No wallet connect?"** | Wallet connection was previously buried in a sub-view. | Added a prominent **Web3 Wallet Connect** component in the global floating capsule header with live telemetry (`Studionet · 61999`). |
| **Interactive Account Drawer** | Reviewers lacked visibility into active account parameters. | Built an interactive **Web3 Account Drawer** with 1-click address copy, Explorer link, network switcher, and disconnect controls. |
| **Network Mismatch Errors** | Metamask on Ethereum triggered silent disconnects. | Implemented automatic **EIP-3085 / EIP-3326 chain switching** for GenLayer Studionet (`61999` / `0xF22F`). |
| **UI Aesthetics** | Legacy form layout felt like an internal tool. | Rebuilt into a **Centered Neo-Brutalist Canvas** matching Nudge-Folio with top coordinate ruler (`0-1400`), Hero Selection Box (`[SELECTION: 1280 × 640]`), Pastel stickers, and Featured Project Cards. |
| **Case Lifecycle Clarity** | Step progress was hidden. | Added an **8-Stage Case Lifecycle Progress Stepper** (`Draft` $\to$ `Finalized`) and an **AI Consensus Fact Vector Matrix**. |

See [docs/STEWARD_RESPONSE.md](docs/STEWARD_RESPONSE.md) for the complete builder portal remediation details.

---

## 4. Deployed Provenance & Live Verification

- **Network**: GenLayer Studionet
- **Chain ID**: `61999` (`0xF22F`)
- **Canonical RPC**: `https://studio.genlayer.com/api`
- **Contract Address**: [`0xdB7419b175bb5Ff63343f8a9Ac7f42f11feA03Fd`](https://explorer-studio.genlayer.com/address/0xdB7419b175bb5Ff63343f8a9Ac7f42f11feA03Fd)
- **Deployed Source SHA-256**: `958bc9996945b9064abd98b7a712b799dc7d9905de89b2ca7305b8e0cefaf2d5`
- **ABI Schema SHA-256**: `29fa8f2f2b889f08f5452de2dd06e76a349111d28801364a3bf32d85c1220e20`
- **Source Byte Parity**: Exact 1:1 match with `contracts/shiftfair.py`
- **Production Application**: [https://shiftfair-genlayer.vercel.app](https://shiftfair-genlayer.vercel.app)
- **Live Qualification Case**: `GLV4-shiftfair-39138804500` (Terminal Verdict: `REVIEW_REQUIRED`, 2 rounds, 2 challenges, verified hash chain)

---

## 5. Verification Matrix & Quality Gates

| Verification Gate | Command | Result | Coverage |
| :--- | :--- | :--- | :--- |
| **Python Pytest Suite** | `python -m pytest tests/` | **18 / 18 PASS** | Contract states, multi-party consent, isolation |
| **Node Unit Tests** | `npm test` | **10 / 10 PASS** | Role transitions, receipt verification, hash linking |
| **Playwright Wallet E2E** | `npm run test:browser` | **PASS** | 390px mobile viewport zero-overflow, chain switching |
| **Playwright Registry E2E** | `npm run test:registry-browser` | **PASS** | Exact ID lookup, paged queries, hash provenance |
| **Bandit Static Security** | `bandit -r contracts/` | **0 FINDINGS** | Clean security profile (0 High, 0 Medium, 0 Low) |
| **GenVM Linter** | `python -m genvm_linter.cli lint` | **3 / 3 PASS** | Storage decorator compatibility, purity constraints |
| **Studionet Bytecode Parity**| `npm run verify:live` | **PASS** | Exact 1:1 source code & ABI schema hash match |
| **GitHub Actions CI/CD** | `qualify` workflow | **PASS (58s)** | Exact-head commit verification on `main` |

---

## 6. Local Testing & Verification

### Prerequisites
- Python 3.12+
- Node.js 22+
- npm

### Run Test Suites

```powershell
# 1. Python contract & state machine regression tests (18 tests)
python -m pip install -r requirements-dev.txt
python -m pytest tests -q

# 2. Static security scan & GenVM linter
python -m bandit -q -r contracts
$env:PYTHONIOENCODING="utf-8"; python -m genvm_linter.cli lint contracts/shiftfair.py

# 3. Live Studionet RPC & Bytecode verification
npm install
npm run verify:live

# 4. Frontend unit tests & syntax validation
cd web
npm install
npm run check
npm test
npm run build

# 5. Playwright Browser E2E (Mobile + Desktop + Wallet Reconnection)
$env:APP_URL="https://shiftfair-genlayer.vercel.app"
npm run test:browser
npm run test:registry-browser
```

---

## 7. Security Architecture & Threat Model

1. **Role Authority Boundary**:
   - Claimant (`creator`), employer/supervisor (`recipient`), and independent attestor (`attestor`) must be three distinct addresses.
   - Unauthorized attestations or supervisor overrides are rejected at contract level.
2. **Replay & Timestamp Protection**:
   - Time boundaries rely exclusively on transaction block timestamps (`gl.message.raw['datetime']`), never client local clocks.
   - Evidence digests and challenge hashes are verified via cryptographic SHA-256 comparisons.
3. **Crash-Safe Transaction Lifecycle**:
   - The frontend persists broadcast transaction hashes before polling.
   - Transactions require verified GenVM execution receipts (`FINISHED_WITH_RETURN`) and state readbacks before being treated as successful.

See [docs/SECURITY.md](docs/SECURITY.md) and [docs/AUDIT.md](docs/AUDIT.md) for further technical specifications.
