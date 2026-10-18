# Release qualification — ShiftFair `v4.0.0-rc.1`

- Source SHA-256: `958bc9996945b9064abd98b7a712b799dc7d9905de89b2ca7305b8e0cefaf2d5`; deployed address: `0xdB7419b175bb5Ff63343f8a9Ac7f42f11feA03Fd`; ABI SHA-256: `29fa8f2f2b889f08f5452de2dd06e76a349111d28801364a3bf32d85c1220e20`.
- Lifecycle case `GLV4-shiftfair-39138804500` is `FINALIZED` with verdict `REVIEW_REQUIRED`; all three transactions are recorded in `evidence/shiftfair-live.json`. Its source reference is synthetic and labeled.
- Run 39138804500 overall failed at NoticeClock majority disagreement; the three artifacts for other projects individually recorded PASS. NoticeClock’s later run 39142055216 passed its lifecycle and ended INCONCLUSIVE.
- Original deployment run 39138161003 concluded failure in live qualification after deployment and byte verification passed.

The current production app https://shiftfair-genlayer.vercel.app serves an older read-only deployment. Updated `web/` source passed local desktop/390 px Chromium checks and real RPC reads. Production mobile still overflows. Public writes remain locked; a funded ephemeral-signer transaction, execution receipt, canonical readback, production rebuild/redeploy and production-browser recheck are outstanding.

**Status:** source and contract provenance are verified; this release candidate is not yet fully submission-ready. Do not enable `RELEASE_QUALIFIED` or submit a full-application readiness claim until the app acceptance criteria pass.
