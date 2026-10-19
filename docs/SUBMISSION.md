# GenLayer submission dossier ? ShiftFair

## Project name

ShiftFair

## Short description

Resolve shift and overtime eligibility from frozen work rules and attested evidence, with capped deterministic minute calculations.

## Detailed description

ShiftFair supports participation, frozen work rules, attendance evidence, a distinct attestor, semantic adjudication, two-party challenges, second-round deliberation, and finalization. The production app reads a paged canonical case registry and supports wallet-validated actions with transaction receipt and canonical state reconciliation. Requested, provisional and final minutes are capped by contract rules.

## Problem solved

Shift decisions combine written work rules, supervisor authorization, attendance evidence and capped overtime arithmetic.

## Why this requires a GenLayer Intelligent Contract

Validators independently assess authorization and attendance semantics against frozen work rules. The contract then applies deterministic capped calculations; a deterministic workflow cannot decide whether the real-world record satisfies natural-language policy.

## Genuine semantic-consensus behavior

Leader and validators independently classify supervisor_authorized, attendance_matches_shift and evidence_sufficient in gl.vm.run_nondet_unsafe. The strict vector is checked; contract arithmetic caps policy/requested minutes and derives a provisional result. Challenges enter round two; disagreement cannot silently approve.

The leader and validators independently execute the semantic evaluation. The result is schema-validated and contract code alone maps it to permitted outcomes. Evidence and challenge text are untrusted input. Disagreement and invalid output cannot silently become approval. Challenge periods and finalization use contract transaction time.

## GitHub repository

https://github.com/GIFTEDLOV/shiftfair

## Production app

https://shiftfair-genlayer.vercel.app

## Studionet deployment

- Network: GenLayer Studionet
- Chain ID: `61999`
- Canonical RPC: `https://studio.genlayer.com/api`
- Contract: [0xdB7419b175bb5Ff63343f8a9Ac7f42f11feA03Fd](https://explorer-studio.genlayer.com/address/0xdB7419b175bb5Ff63343f8a9Ac7f42f11feA03Fd)
- Verified deployed source SHA-256: `958bc9996945b9064abd98b7a712b799dc7d9905de89b2ca7305b8e0cefaf2d5`
- ABI schema SHA-256: `29fa8f2f2b889f08f5452de2dd06e76a349111d28801364a3bf32d85c1220e20`

## Live demonstration and evidence

- Historic case: `GLV4-shiftfair-39138804500`; status `FINALIZED`; terminal verdict **REVIEW_REQUIRED**.
- Qualification workflow: [run 39138804500](https://github.com/GIFTEDLOV/driftproof/actions/runs/39138804500).
- Deployed contract and source parity evidence: `evidence/live-verification.json`.
- Production deployment: `dpl_Dn2XLYLqNLMZpRJHSzhYMpeVQzZy`; https://shiftfair-genlayer-i6kg3jkun-kolofahkelvin16-6437s-projects.vercel.app; production alias https://shiftfair-genlayer.vercel.app.
- Signed Chromium production wallet verification: `evidence/browser-wallet-e2e.json` with real signed transaction, GenVM receipt and canonical state readback.
- Full synthetic lifecycle: `BROWSER-LIFECYCLE-1792362857919-ShiftFair`, terminal **REVIEW_REQUIRED**. Transaction and state evidence: `evidence/signed-browser-lifecycle.json`, `evidence/signed-browser-lifecycle-readback.json`, and `evidence/signed-browser-lifecycle-resumption.json`.
- Production registry verification: PASS on 2026-10-19 after the earlier 500-requests/hour quota rejection. Exact-ID search, canonical FINALIZED / REVIEW_REQUIRED state, two challenges and hash-linked history passed. See evidence/signed-browser-registry.json, evidence/signed-browser-registry-rate-limit.json and evidence/production-registry-retries.json.

## Security and qualification summary

Automated adversarial, arithmetic-bound, state-machine, schema, address-compatibility, history-integrity and wallet E2E checks passed. A genuine Chromium wallet signed transaction was reconciled against successful GenVM execution and canonical state. The synthetic full lifecycle recovered the exact saved round-two adjudication hash and then finalized REVIEW_REQUIRED after both challenges. An earlier production registry attempt received the Studionet 500/hour rate-limit error and correctly displayed no simulated fallback; after the quota reset, production registry search and canonical detail passed.

- Exact-main CI: [workflow run 39175261903](https://github.com/GIFTEDLOV/shiftfair/actions/runs/39175261903) passed for the then-current main commit. The repository Actions history and versioned release provide the exact-HEAD and version-tag qualification results.
- CI covers Python tests, GenVM lint, ABI/schema, source provenance, security analysis and app SDK/build/browser tests where applicable.
- No unresolved Critical or High issue was identified in the release audit.
- The historic 39138804500 workbench is not represented as a four-project PASS: NoticeClock was BLOCKED; the other three project artifacts individually report PASS. NoticeClock's later case 39142055216 passed its lifecycle, with terminal verdict INCONCLUSIVE.

## Instructions for reviewers

1. Inspect `contracts/shiftfair.py` and `release.json`.
2. Verify the deployed source and ABI against the hashes above using the checked-in read-only verifier.
3. Review the case and receipt evidence under `evidence/`; a FINALIZED label is not treated as proof without successful GenVM execution and canonical state readback.
4. Open https://shiftfair-genlayer.vercel.app on Studionet chain 61999, connect a test wallet, and use the registry to inspect actual on-chain case state. If Studionet reports its rate limit, wait for its quota window and retry; the app intentionally shows an error rather than mock cases.
5. Treat all qualification cases and source records as synthetic test inputs; do not infer real-world events.

## Known limitations and external trust assumptions

Qualification source data were synthetic. An attestor signature proves control of the nominated wallet, not employee, supervisor or payroll identity, actual attendance, or document truth. The contract does not pay wages. No employment identity oracle is connected. During this verification window, Studionet RPC returned a 500-request/hour limit; registry reads fail closed without mock data. Case storage is append-only and unbounded over time.

## Portal status

The submission fields and evidence package are **prepared for immediate Portal entry**. The final Portal submission has **not** been made. It requires an authenticated Builder Portal session and explicit final-submit authorization; no claim of submission or steward approval is made.
