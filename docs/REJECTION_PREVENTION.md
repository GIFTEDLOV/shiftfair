# Rejection-prevention matrix — ShiftFair

No external GenLayer steward rejection letter or direct steward feedback for these four projects was accessible. This matrix does not invent comments. Its concerns come from documented cross-project engineering findings in Procura, EventSure and RightsRail.

| Historical concern and source | Applied requirement | Evidence in this project | Remaining risk |
|---|---|---|---|
| Procura reviewer stopped after `MAJORITY_DISAGREE`; EventSure requires receipts and canonical readback. | Finalized status, consensus, successful GenVM execution and state are checked separately. | `scripts/verify-live.mjs`, `evidence/shiftfair-live.json`; preserved inconclusive/review verdict. | App live signing remains incomplete for browser projects. |
| Procura identified unfinished lifecycle; EventSure distinguishes mocks from live behavior. | Test role transitions, evidence, attestation, challenges, second deliberation and finalization. | Historical case is round 2 FINALIZED; project regression tests cover challenge/deadline and state guards. | No fresh signed write this turn because no funded authorized ephemeral signer was available. |
| RightsRail audit AUD-004 and EventSure source concerns. | Exact byte and ABI provenance; distinguish wallet control from issuer identity. | Release SHA, ABI hash, receipt artifacts; dossier states identity limitation. | No external issuer/document oracle. |
| RightsRail audit AUD-005: prompt boundary and model discretion. | Independent validator rerun; strict schema; no model control of contract parameters. | `gl.vm.run_nondet_unsafe`, source, adversarial and disagreement tests. | Model/provider availability is external. |
| RightsRail challenge/finality issues. | Both parties get a challenge slot; first party cannot steal the other slot; response window is honored. | Contract checks, local tests and browser transition tests. | Browser time is only preflight; contract time is authoritative. |
| RightsRail AUD-002/AUD-003. | Deterministic transaction time and bounded arithmetic. | GenVM transaction context, integer caps and tests. | No settlement or legal enforcement. |
| RightsRail audit AUD-007 and synthetic demo concern. | No synthetic cases presented as chain records. | App reads canonical contract state; historical synthetic source references are labeled. | Public UI still serves older read-only code; mobile overflow remains until redeploy. |
| Prior `.as_hex` string-address SDK crash. | All public serialized address inputs handle string and typed address values. | `test_genvm_plain_string_addresses_supported`. | Future SDK changes require pinned-version check. |
