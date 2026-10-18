# Security model — ShiftFair

## Roles and transitions

Creator and counterparty are distinct; a third distinct attestor wallet is nominated at case creation. Consent precedes rule freezing. Later operations enforce roles, state and deadlines. The stored deployment owner has no privileged case-transition path. Case IDs are unique; transition gates and challenge slots prevent action replay.

## Provenance and data integrity

Rule, evidence and attestation values are hash-bound. Address arguments handle both SDK strings and typed `Address` objects, avoiding the historical `.as_hex` string failure. Semantic history has at most two rounds; each canonical JSON entry has a SHA-256 hash linked to the previous entry. `get_case_ids_page` caps each page at 100.

## Intelligent-contract execution

The semantic evaluation executes inside `gl.vm.run_nondet_unsafe`. Validators independently rerun the bounded classification and compare the strict boolean vector. Untrusted evidence and challenge text are delimited as data and cannot set actors, terms, deadlines, balances or amounts. The deterministic contract maps the vector to its verdict. Missing evidence becomes an explicit inconclusive/review result; disagreement reverts the update. Challenge text is included in round two; each party has one slot, and the other party receives up to 24 hours to respond after the first challenge.

## Deterministic and economic controls

GenVM transaction-context time governs deadlines. Frozen terms and actor roles cannot be changed by model output. Invoice amounts/rates and ShiftFair minutes are capped; integer arithmetic is deterministic. No contract makes external calls, receives payable value or transfers assets, so there is no callback reentrancy or settlement path.

## Residual risks

- A signature shows control of the agreed wallet; it does not authenticate a real-world issuer or prove document/physical facts.
- Models and validators are external execution assumptions; low evidence or disagreement is not approval.
- Public creation is unbounded over contract lifetime; pagination bounds each read, but storage and the legacy all-ID view can grow.
- Amounts/minutes are determinations only and are not paid by this contract.
- The deployed browser app is older than `web/`, read-only, and still has a mobile overflow. `RELEASE_QUALIFIED=false` until funded signed E2E and production redeploy.
- During release research, the public Studio explorer transaction API response included validator `node_config` values labelled as private keys. Raw responses were not saved or published; this project does not call that API. This is an external issue and has not been reported through an authorized channel in this work session.

`tests/` is a mocked GenLayer regression harness, not live execution. `scripts/verify-live.mjs` performs read-only source, ABI, receipt, state and history checks.
