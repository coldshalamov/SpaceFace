<!-- LIFETIME: STABLE -->
# Roadmap control files

This directory contains the stable queue index, the execution protocol, executable active packets, and exact-revision receipts. It does not define a permanent chronological order in prose; the dependency graph, live leases, and active packet entry gates determine what can run.

## Files

| Surface | Role |
|---|---|
| [`program-queue.json`](./program-queue.json) | stable IDs, dependencies, broad mutexes/checks/evidence classes, coarse lifecycle |
| [`active/`](./active/README.md) | current executable packet set and recommended dependency order |
| [`00_EXECUTION_PROTOCOL.md`](./00_EXECUTION_PROTOCOL.md) | finite implementation, validation, review, and receipt state machine |
| `receipts/` | immutable or append-only exact-revision evidence |
| numbered roadmap chapters | durable milestone/product references | 

## Queue discipline

Queue rows should remain compact. A row may name sources, dependencies, mutex domains, focused check aliases, evidence classes, and receipt links. It should not carry full test transcripts, rejection history, speculative architecture, or a multi-page integration narrative. Put that information in the active packet while work is live and in a receipt when the evidence is durable.

A queue row can be a portfolio container. Large graphics, presentation, and acceptance rows must be implemented through bounded leaf packets even when they retain one stable parent ID.

## Identity corrections

When a stable/canonical ID collides with an existing row, the integrator resolves it before implementation and records the alias. Feature agents must not silently reuse or renumber IDs from a worker branch. The current active packet for PQ-019 flags such a correction explicitly.
