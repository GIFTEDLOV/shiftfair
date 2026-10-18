# ShiftFair

Resolve shift and overtime eligibility from frozen work rules and attested evidence, with capped deterministic minute calculations.

**Release:** v4.0.0 ? **Network:** GenLayer Studionet (chain `61999`) ? **Contract:** [`0xdB7419b175bb5Ff63343f8a9Ac7f42f11feA03Fd`](https://explorer-studio.genlayer.com/address/0xdB7419b175bb5Ff63343f8a9Ac7f42f11feA03Fd)

## What it does

ShiftFair supports participation, frozen work rules, attendance evidence, a distinct attestor, semantic adjudication, two-party challenges, second-round deliberation, and finalization. The production app reads a paged canonical case registry and supports wallet-validated actions with transaction receipt and canonical state reconciliation. Requested, provisional and final minutes are capped by contract rules.

## Why GenLayer

Validators independently assess authorization and attendance semantics against frozen work rules. The contract then applies deterministic capped calculations; a deterministic workflow cannot decide whether the real-world record satisfies natural-language policy.

Leader and validators independently classify supervisor_authorized, attendance_matches_shift and evidence_sufficient in gl.vm.run_nondet_unsafe. The strict vector is checked; contract arithmetic caps policy/requested minutes and derives a provisional result. Challenges enter round two; disagreement cannot silently approve.

## Deployment provenance

- Canonical RPC: `https://studio.genlayer.com/api`
- Exact deployed source SHA-256: `958bc9996945b9064abd98b7a712b799dc7d9905de89b2ca7305b8e0cefaf2d5`
- ABI schema SHA-256: `29fa8f2f2b889f08f5452de2dd06e76a349111d28801364a3bf32d85c1220e20`
- `getContractCode` source-byte parity: exact match with `contracts/shiftfair.py`.
- Explorer: https://explorer-studio.genlayer.com/address/0xdB7419b175bb5Ff63343f8a9Ac7f42f11feA03Fd

## Live qualification

- Historic case: `GLV4-shiftfair-39138804500`, terminal `REVIEW_REQUIRED`; source data is synthetic and explicitly labeled.
- Historic qualification: [GitHub Actions run 39138804500](https://github.com/GIFTEDLOV/driftproof/actions/runs/39138804500).
- Project exact-head CI: [run 39173958293](https://github.com/GIFTEDLOV/shiftfair/actions/runs/39173958293).
- Production application: https://shiftfair-genlayer.vercel.app
- Current production deployment: `dpl_GKPZps4G9PupyCNi9XhnMG9cqQvW` (https://shiftfair-genlayer-ma0vk8dy8-kolofahkelvin16-6437s-projects.vercel.app).
- Signed Chromium lifecycle: `BROWSER-LIFECYCLE-1792362857919-ShiftFair` finalized `REVIEW_REQUIRED`; see [lifecycle evidence](evidence/signed-browser-lifecycle.json), [independent receipt and state readback](evidence/signed-browser-lifecycle-readback.json), and [production browser-wallet evidence](evidence/browser-wallet-e2e.json).
- Production registry browser check: `RATE_LIMITED`; see [registry evidence](evidence/signed-browser-registry.json) when present. The latest read received the Studionet 500-request/hour RPC quota error and no cases were fabricated.

## Release and submission status

The v4.0.0 package source and submission materials are prepared in this independent repository. GitHub release publication follows exact-head CI. Submission fields and review instructions are in [docs/SUBMISSION.md](docs/SUBMISSION.md) and [docs/SUBMISSION_FIELDS.json](docs/SUBMISSION_FIELDS.json). The Portal entry is **prepared, not submitted**; a final Portal submission is an authenticated action.

## Checks

Requirements: Python 3.12+, Node.js 22+, npm.

```powershell
python -m pip install -r requirements-dev.txt
python -m pytest -q
python -m genvm_linter.cli lint contracts/shiftfair.py
npm ci
npm run verify:live
```

For the frontend: `cd web; npm ci; npm run check; npm test; npm run build`. Production browser wallet test: `$env:APP_URL='https://shiftfair-genlayer.vercel.app'; npm run test:browser`. Registry test: `$env:APP_URL='https://shiftfair-genlayer.vercel.app'; npm run test:registry-browser` (requires available Studionet RPC quota).

See [security audit](docs/SECURITY.md), [deployment](docs/DEPLOYMENT.md), [rejection-prevention matrix](docs/REJECTION_PREVENTION.md), and [release qualification](docs/RELEASE.md). MIT License.
