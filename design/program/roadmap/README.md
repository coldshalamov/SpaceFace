<!-- LIFETIME: STABLE -->
# Roadmap control files

This directory contains the stable queue index, the execution protocol, executable active packets,
and exact-revision receipts. It does not define permanent file ownership or chronological order in
prose; the dependency graph supplies integration order, while any thread may take a dependency-front
unit and finish it.

## Files

| Surface | Role |
|---|---|
| `../../../scripts/program-dispatch.mjs` | compact read-only view of the first or all exact ready units, or one parent packet; omits narrative history |
| [`program-queue.json`](./program-queue.json) | stable parent IDs plus exact dispatch-unit dependencies, coordination hints, checks, receipts, and a transitional legacy parent state field |
| [`active/`](./active/README.md) | current executable packet set and recommended dependency order |
| `retired/` | non-executable packet plans retained for audit; a file may be completed or deliberately deferred, and retirement alone never means DONE |
| [`00_EXECUTION_PROTOCOL.md`](./00_EXECUTION_PROTOCOL.md) | finite implementation, validation, review, and receipt state machine |
| `receipts/` | immutable or append-only exact-revision evidence |
| numbered roadmap chapters | durable milestone/product references |

## Queue discipline

Use `node scripts/program-dispatch.mjs --next`, `--ready`, or `--id PQ-XXX` for ordinary
orientation; open the raw queue only when maintaining identities/dependencies or investigating
history. `--next` and `--ready` return exact ready dispatch units. `--id` returns parent context
and its units, labels the parent's transitional combined `state` field as legacy, and never turns a
parent into a claim.

Queue rows should become compact. A row may name sources, integration dependencies, coordination
hints, focused check aliases, evidence classes, and receipt links. A coordination hint never creates
task-long ownership or a durable blocker. The row should not carry full test transcripts, rejection
history, speculative architecture, or a multi-page integration narrative. Put that information in
the active packet while work is live and in a receipt when the evidence is durable.

A queue row can be a portfolio container. Large graphics, presentation, and acceptance rows must be implemented through bounded leaf packets even when they retain one stable parent ID.

Cross-packet leaf requirements use structured `evidenceDependencies`. Each entry binds a parent
packet ID, exact leaf ID, required acceptance state, planned receipt path, and committed Git blob ID
of the accepted receipt. `receiptBlob: null` is an explicit unresolved gate. A bound receipt must be
tracked and clean and start with this machine-readable comment:

```text
<!-- PROGRAM_EVIDENCE_RECEIPT
packetId: PQ-022
leafId: PQ-022.<leaf-id>
acceptance: route_accepted
disposition: PASS
candidateCommit: <Git commit>
-->
```

Dispatch becomes eligible only when the committed blob and all metadata match the queue entry and
the candidate commit is reachable from `HEAD`; prose such as "required leaves accepted" never
unlocks work.

## Identity corrections

When a stable/canonical ID collides with an existing row, the agent shaping that bounded unit resolves
it before implementation and records the alias. Agents must not silently reuse or renumber IDs from
a worker branch. The current active packet for PQ-019 flags such a correction explicitly.
