<!-- LIFETIME: STABLE -->
# SpaceFace documentation

This is the navigation front door for engineering and world-content documentation. It does not own product status.

## Start by task

| Need | Read |
|---|---|
| Enter implementation | [`../CANONICAL_BUILD_MAP.md`](../CANONICAL_BUILD_MAP.md) |
| Technical invariants and ownership | [`../ARCHITECTURE.md`](../ARCHITECTURE.md) |
| Live leases and blockers | [`../design/program/NOW.md`](../design/program/NOW.md) |
| Executable admitted packet | [`../design/program/roadmap/active/README.md`](../design/program/roadmap/active/README.md) |
| Finite review/verification workflow | [`../design/program/roadmap/00_EXECUTION_PROTOCOL.md`](../design/program/roadmap/00_EXECUTION_PROTOCOL.md) |
| Find the module that owns behavior | [`MODULE_MAP.md`](./MODULE_MAP.md) |
| Diagnose a recurring failure | [`COMMON_BUGS.md`](./COMMON_BUGS.md) |
| Choose focused, lab, broker, and player-route validation | [`VALIDATION_WORKFLOW.md`](./VALIDATION_WORKFLOW.md) |
| Trace an event end to end | [`EVENT_ROUTING.md`](./EVENT_ROUTING.md) (generated) |
| Inspect registry/update order | [`SYSTEM_REGISTRY.md`](./SYSTEM_REGISTRY.md) (generated) |
| Understand which files may direct an agent | [`POLICY_MANIFEST.md`](./POLICY_MANIFEST.md) |
| Search without ingesting snapshots/transcripts | [`SEARCH_CONTEXT.md`](./SEARCH_CONTEXT.md) |
| Evaluate third-party tools/assets | [`OPEN_SOURCE_INTAKE.md`](./OPEN_SOURCE_INTAKE.md) |
| Work on the 47-A slice | [`Spec/47A_SLICE_CONTRACT.md`](./Spec/47A_SLICE_CONTRACT.md) |
| Retained future plans not yet scheduled | [`../design/program/06_RETAINED_FUTURE_BACKLOG.md`](../design/program/06_RETAINED_FUTURE_BACKLOG.md) and [`../design/PLAN_REGISTRY.md`](../design/PLAN_REGISTRY.md) |
| Work on narrative/setting | [`worldbuilding/`](./worldbuilding/) and [`worldbuilding/sheets/README.md`](./worldbuilding/sheets/README.md) |
| Review prior integration evidence | [`handoffs/`](./handoffs/) (historical, not status) |
| Decide artifact retention | [`ARTIFACT_RETENTION.md`](./ARTIFACT_RETENTION.md) |
| Resume deferred repository/context cleanup | [`REPOSITORY_HYGIENE.md`](./REPOSITORY_HYGIENE.md) |

## Documentation classes

- **Authority:** root `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, and the selected active packet.
- **Current status:** `design/program/`, with `NOW.md` limited to volatile leases and the queue/receipts owning durable facts.
- **Navigation/reference:** `MODULE_MAP.md`, `COMMON_BUGS.md`, and `SEARCH_CONTEXT.md`.
- **Generated indexes:** `EVENT_ROUTING.md` and `SYSTEM_REGISTRY.md`; regenerate with `npm run build:indexes`.
- **Historical evidence:** handoffs, reviews, old audit reports, and captures. They explain; they do not dispatch.

## Maintenance

Read [`AGENTS.md`](./AGENTS.md) before changing this tree. Prefer durable paths/symbols over dates, line numbers, file sizes, or copied status. Run `node scripts/check-program-docs.mjs` after changing program-facing links or policy lifetimes.
