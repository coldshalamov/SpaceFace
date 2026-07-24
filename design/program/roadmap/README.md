<!-- LIFETIME: STABLE -->
# Roadmap control files

This directory contains the stable queue index, the execution protocol, executable active packets, and exact-revision receipts. It does not define a permanent chronological order in prose; the dependency graph, live leases, and active packet entry gates determine what can run.

## Files

| Surface | Role |
|---|---|
| `../../../scripts/program-dispatch.mjs` | compact read-only view of one packet or the dependency-ready candidate; omits narrative history |
| [`program-queue.json`](./program-queue.json) | stable IDs, dependencies, broad mutexes/checks/evidence, and a transitional legacy state field |
| [`active/`](./active/README.md) | current executable packet set and recommended dependency order |
| [`00_EXECUTION_PROTOCOL.md`](./00_EXECUTION_PROTOCOL.md) | finite implementation, validation, review, and receipt state machine |
| `receipts/` | immutable or append-only exact-revision evidence |
| numbered roadmap chapters | durable milestone/product references |

## Queue discipline

Use `node scripts/program-dispatch.mjs --next` or `--id PQ-XXX` for ordinary orientation; open the raw queue only when maintaining identities/dependencies or investigating history. The command labels the queue's transitional combined `state` field as legacy and never treats dependency readiness as a claim.

Queue rows should become compact. A row may name sources, dependencies, mutex domains, focused check aliases, evidence classes, and receipt links. It should not carry full test transcripts, rejection history, speculative architecture, or a multi-page integration narrative. Put that information in the active packet while work is live and in a receipt when the evidence is durable.

A queue row can be a portfolio container. Large graphics, presentation, and acceptance rows must be implemented through bounded leaf packets even when they retain one stable parent ID.

## Identity corrections

When a stable/canonical ID collides with an existing row, the integrator resolves it before implementation and records the alias. Feature agents must not silently reuse or renumber IDs from a worker branch. The current active packet for PQ-019 flags such a correction explicitly.
