# GenLayer submission dossier — ShiftFair

## Project name

ShiftFair

## Short description

Resolve shift and overtime eligibility from frozen work rules and attested evidence, with capped deterministic minute calculations.

## Detailed description

ShiftFair is a full GenLayer application for shift changes and overtime claims. Parties freeze a written work rule, lock evidence and nominate a distinct attestor. The app reads canonical claim pages and history, and supports participation, adjudication, challenges and finalization. Requested and approved minutes remain bounded by immutable policy parameters.

## Problem solved

Shift decisions mix natural-language work rules, supervisor authorization, attendance evidence and capped overtime arithmetic.

## Why this requires a GenLayer Intelligent Contract

Independent semantic validators assess authorization, attendance and evidence sufficiency against frozen text. Deterministic arithmetic then computes eligible minutes; an ordinary workflow cannot credibly perform both tasks.

## Genuine semantic-consensus behavior

Leader and validators independently classify supervisor_authorized, attendance_matches_shift and evidence_sufficient inside GenLayer nondeterministic execution. The response schema is exact. The contract caps requested/policy minutes and derives provisional/final results deterministically; disagreement cannot become approval.

## GitHub repository URL

[https://github.com/GIFTEDLOV/shiftfair](https://github.com/GIFTEDLOV/shiftfair)

## Production app URL

https://shiftfair-genlayer.vercel.app

## Studionet deployment

- Chain 61999, RPC `https://studio.genlayer.com/api`
- Contract: [0xdB7419b175bb5Ff63343f8a9Ac7f42f11feA03Fd](https://explorer-studio.genlayer.com/address/0xdB7419b175bb5Ff63343f8a9Ac7f42f11feA03Fd)
- Explorer: [https://explorer-studio.genlayer.com/address/0xdB7419b175bb5Ff63343f8a9Ac7f42f11feA03Fd](https://explorer-studio.genlayer.com/address/0xdB7419b175bb5Ff63343f8a9Ac7f42f11feA03Fd)
- Verified source SHA-256: `958bc9996945b9064abd98b7a712b799dc7d9905de89b2ca7305b8e0cefaf2d5`
- ABI schema SHA-256: `29fa8f2f2b889f08f5452de2dd06e76a349111d28801364a3bf32d85c1220e20`

## Live demonstration evidence

- Case `GLV4-shiftfair-39138804500` finalized at round 2; recorded verdict **REVIEW_REQUIRED**.
- First and second semantic transaction hashes and finalization hash are preserved in `evidence/shiftfair-live.json`.
- [GitHub workflow run 39138804500](https://github.com/GIFTEDLOV/driftproof/actions/runs/39138804500); exact transaction explorer links are included in the source artifact.
- Qualification source records are synthetic and labelled; this proves GenLayer behavior, not a real-world issuer’s identity or the truth of a physical record.

## Security and qualification summary

The deployed V4 source is byte-identical to the repository source; the deployed ABI matches the locally generated schema. The local regression suite covers role separation, state transitions, source hashes, strict semantic schemas, validator disagreement, prompt injection, challenge fairness, deadlines, duplicates/replay, numeric bounds, address-serialization compatibility and history integrity. Live workflow evidence records transaction status, GenVM execution and canonical readback.

The current production UI still serves an older read-only build; `RELEASE_QUALIFIED=false`. A real funded ephemeral-signer E2E and a new production deployment are outstanding. This project is not yet fully submission-ready.

## Instructions for reviewers

1. Inspect `contracts/shiftfair.py` and verify its hash and ABI using `npm run verify:live`.
2. Run `python -m pytest -q`, `python -m genvm_linter.cli lint contracts/shiftfair.py`, `npm ci`, and `npm run verify:live`.
3. Read `evidence/shiftfair-live.json`; preserve the terminal verdict shown above.
4. For apps, open the production URL read-only; wallet signing is deliberately disabled until its real signed-browser qualification completes.

## Known limitations and external trust assumptions

Attestor wallet control does not independently authenticate employee, supervisor, payroll identity or real attendance; the contract does not pay wages. Qualification source data were synthetic. The updated repository frontend has not been deployed to the public URL.

Public case creation has no global lifetime cap. Pagination limits each page to 100 records, but total storage and the legacy `get_case_ids()` view can grow. Semantic execution depends on available non-deterministic model services and validator execution; disagreement is not approval. Invoice/minute outputs do not settle assets.
