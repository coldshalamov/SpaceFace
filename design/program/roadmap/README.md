<!-- LIFETIME: STABLE -->
# Roadmap control files

This directory contains the stable queue index, the execution protocol, executable active packets, and exact-revision receipts. It does not define a permanent chronological order in prose; the dependency graph, live leases, and active packet entry gates determine what can run.

## Files

| Surface | Role |
|---|---|
| `../../../scripts/program-dispatch.mjs` | compact read-only view of the first or all exact claim-ready units, or one parent packet; omits narrative history |
| [`program-queue.json`](./program-queue.json) | stable parent IDs plus exact dispatch-unit dependencies, mutexes, checks, receipts, and a transitional legacy parent state field |
| [`active/`](./active/README.md) | current executable packet set and recommended dependency order |
| `retired/` | checked-off packet plans retained for audit without advertising them as executable work |
| [`00_EXECUTION_PROTOCOL.md`](./00_EXECUTION_PROTOCOL.md) | finite implementation, validation, review, and receipt state machine |
| `receipts/` | immutable or append-only exact-revision evidence |
| numbered roadmap chapters | durable milestone/product references |

## Queue discipline

Use `node scripts/program-dispatch.mjs --next`, `--ready`, or `--id PQ-XXX` for ordinary
orientation; open the raw queue only when maintaining identities/dependencies or investigating
history. `--next` and `--ready` return exact claim-ready dispatch units. `--id` returns parent context
and its units, labels the parent's transitional combined `state` field as legacy, and never turns a
parent into a claim.

Queue rows should become compact. A row may name sources, dependencies, mutex domains, focused check aliases, evidence classes, and receipt links. It should not carry full test transcripts, rejection history, speculative architecture, or a multi-page integration narrative. Put that information in the active packet while work is live and in a receipt when the evidence is durable.

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

When a stable/canonical ID collides with an existing row, the integrator resolves it before implementation and records the alias. Feature agents must not silently reuse or renumber IDs from a worker branch. The current active packet for PQ-019 flags such a correction explicitly.
