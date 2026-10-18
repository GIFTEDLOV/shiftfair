# ShiftFair

Resolve shift and overtime eligibility from frozen work rules and attested evidence, with capped deterministic minute calculations.

**Package:** v4.0.0-rc.1 · **Network:** Studionet `61999` · **Contract:** [`0xdB7419b175bb5Ff63343f8a9Ac7f42f11feA03Fd`](https://explorer-studio.genlayer.com/address/0xdB7419b175bb5Ff63343f8a9Ac7f42f11feA03Fd)

## Description

ShiftFair is a full GenLayer application for shift changes and overtime claims. Parties freeze a written work rule, lock evidence and nominate a distinct attestor. The app reads canonical claim pages and history, and supports participation, adjudication, challenges and finalization. Requested and approved minutes remain bounded by immutable policy parameters.

## Deployment provenance

- RPC: `https://studio.genlayer.com/api`
- Exact deployed-source SHA-256: `958bc9996945b9064abd98b7a712b799dc7d9905de89b2ca7305b8e0cefaf2d5`
- Independently recomputed ABI schema SHA-256: `29fa8f2f2b889f08f5452de2dd06e76a349111d28801364a3bf32d85c1220e20`
- `getContractCode` parity: exact match with `contracts/shiftfair.py`.

## Existing live case

Case `GLV4-shiftfair-39138804500` reached `FINALIZED`, round 2, with terminal verdict **REVIEW_REQUIRED**. Evidence is in `evidence/shiftfair-live.json`; the recorded run is [39142055216](https://github.com/GIFTEDLOV/driftproof/actions/runs/39142055216) for NoticeClock and [39138804500](https://github.com/GIFTEDLOV/driftproof/actions/runs/39138804500) for the other projects. Run 39138804500 as a whole failed because NoticeClock disagreed; the three case artifacts preserved here individually report `PASS`. Source evidence is synthetic and labeled.

## Release status

The existing deployed V4 contract is preserved and byte-verified. **This package is not submission-qualified as a complete release yet.** ParcelCourt and ShiftFair production URLs still serve older read-only bundles. Their updated source in `web/` is not deployed, and signing remains disabled (`RELEASE_QUALIFIED=false`) until a funded ephemeral-signer browser transaction passes actual GenVM receipt and canonical-state checks. No live positive verdict is claimed.

## Run checks

Requirements: Python 3.12+, Node.js 22+, npm.

```powershell
python -m pip install -r requirements-dev.txt
python -m pytest -q
python -m genvm_linter.cli lint contracts/shiftfair.py
npm ci
npm run verify:live
```

For the two frontend repos: `cd web; npm ci; npm run check; npm test; npm run build; npm audit --audit-level=high`. Python tests use an explicit local API fixture; they are regression tests, not live consensus proof. The read-only verifier independently checks code bytes, ABI, receipt summaries, canonical state and history through GenLayerJS 1.1.8.

See [Security](docs/SECURITY.md), [Deployment](docs/DEPLOYMENT.md), [Rejection prevention](docs/REJECTION_PREVENTION.md), [Submission dossier](docs/SUBMISSION.md) and [Release status](docs/RELEASE.md). MIT license in `LICENSE`.
