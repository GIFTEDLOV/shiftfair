# Release qualification ? ShiftFair v4.0.0

**Release dossier date:** 2026-10-19
**Release state:** Source, contract, and existing live qualification evidence are preserved. Portal dossier is prepared; final Portal submission is not made.

- Contract address: [0xdB7419b175bb5Ff63343f8a9Ac7f42f11feA03Fd](https://explorer-studio.genlayer.com/address/0xdB7419b175bb5Ff63343f8a9Ac7f42f11feA03Fd).
- Deployed V4 source SHA-256: `958bc9996945b9064abd98b7a712b799dc7d9905de89b2ca7305b8e0cefaf2d5`; ABI schema SHA-256: `29fa8f2f2b889f08f5452de2dd06e76a349111d28801364a3bf32d85c1220e20`.
- Historic case `GLV4-shiftfair-39138804500`: `FINALIZED / REVIEW_REQUIRED`; its source inputs are synthetic and labeled.
- Qualification workflow: [39138804500](https://github.com/GIFTEDLOV/driftproof/actions/runs/39138804500).
- Exact-main CI before release preparation: [39173958293](https://github.com/GIFTEDLOV/shiftfair/actions/runs/39173958293) passed.
- Production application is `https://shiftfair-genlayer.vercel.app`; deployment `dpl_GKPZps4G9PupyCNi9XhnMG9cqQvW` is READY.
- Signed production-browser lifecycle `BROWSER-LIFECYCLE-1792362857919-ShiftFair` finalized `REVIEW_REQUIRED`; a real signed transaction was independently checked against GenVM execution and canonical state.
- Registry read qualification: `RATE_LIMITED`. Studionet answered the read with `Rate limit exceeded: 500 requests per hour` on 2026-10-18 22:58 UTC. The UI showed an error and used no mock fallback; repeat this read after the quota window resets.

The original V4 contract deployment is preserved. No contract redeployment or source-hash substitution occurred. The release-verification artifact distinguishes successful transaction finality from successful GenVM execution and canonical state.

**Submission:** prepared in [docs/SUBMISSION.md](SUBMISSION.md) and [docs/SUBMISSION_FIELDS.json](SUBMISSION_FIELDS.json); **not submitted to the Builder Portal**. No steward acceptance is claimed.

See [deployment evidence](DEPLOYMENT.md), [security review](SECURITY.md), [rejection-prevention matrix](REJECTION_PREVENTION.md), and [reviewer instructions](SUBMISSION.md).
