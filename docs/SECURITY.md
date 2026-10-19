# Security and threat model ? ShiftFair

## Scope and result

This review covers `contracts/shiftfair.py`, the public ABI, GenVM integration, state transitions, evidence and history, app bindings where applicable, regression tests, and recorded live execution. No unresolved Critical or High severity finding was identified in the release audit or the passing exact-head qualification workflow. This is not a formal proof or legal opinion.

## Controls

- **Three-party separation:** claimant/creator, counterparty/recipient, and designated attestor are distinct; unauthorized and forged attestations are rejected.
- **Frozen policy:** contract terms and bounded parameters cannot be changed by semantic model output after freeze.
- **Semantic boundary:** untrusted evidence and both parties' challenge text are data, not instructions. The nondeterministic evaluator has a fixed contract-owned instruction and must return a strict bounded schema.
- **Consensus disagreement:** disagreement, malformed output, or inconclusive predicates do not silently become approval.
- **Deadlines:** contract transaction time is authoritative for consent, challenges, and finalization windows; browser time is advisory only.
- **Integrity and replay:** evidence digests, case identifiers, duplicate references, and append-only hash-linked history are checked. Address helpers accept the SDK's serialized strings and address objects, covering the prior `'str' object has no attribute 'as_hex'` regression.
- **Bounded work:** public registry reads use fixed-size pages. Arithmetic uses bounded integers; no external contract calls, token transfers, or payout path exists, so EVM reentrancy is not applicable.
- **Minute arithmetic:** requested, policy, provisional and final minutes are capped; finalization preserves the adjudicated provisional amount.


## GenLayer behavior

The contract executes semantic evaluation through GenLayer's supported nondeterministic computation path. Validators independently execute the necessary semantic decision before consensus state changes. Contract code validates the schema and derives the allowed outcome; model output cannot select actors, deadlines, money, or rules. See the live receipt evidence and `gl.vm.run_nondet_unsafe` implementation.

## Explicit limitations and trust assumptions

- A signature and attestation record prove that the nominated on-chain wallet signed the agreed digest. They do **not** independently prove the real-world issuer's identity or document truth.
- Qualification data are synthetic and do not establish a real notice, invoice, delivery, shift, employee, or event.
- These contracts record determinations. They do not authenticate real-world identities or execute legal judgments, invoice payments, parcel refunds, or wages.
- Case storage and append-only history grow over time. Registry access is paginated; the contracts provide no pruning/deletion mechanism.
- Semantic model/provider availability and Studionet RPC availability are external dependencies. The public UI must surface failures rather than invent data.
- An earlier Studionet registry read hit the 500 requests/hour rate limit. After the quota reset, the 2026-10-19 production registry browser check passed. The error and recovery evidence are preserved; the application continues to fail closed without synthetic fallback.
