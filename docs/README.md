# SpaceFace documentation

This is the navigation front door for engineering and world-content documentation. It does not own
product status. For the current whole-program position, start at
[`design/program/README.md`](../design/program/README.md).

## Start by task

| Need | Read |
|---|---|
| What is done, open, or ready to resume? | [`design/program/README.md`](../design/program/README.md) and its verified-done, remaining-work, acceptance, and integration pages |
| What future plans are retained but not yet scheduled? | [`design/program/06_RETAINED_FUTURE_BACKLOG.md`](../design/program/06_RETAINED_FUTURE_BACKLOG.md) and [`design/PLAN_REGISTRY.md`](../design/PLAN_REGISTRY.md) |
| Technical invariants and ownership | [`ARCHITECTURE.md`](../ARCHITECTURE.md) |
| Find the module that owns behavior | [`MODULE_MAP.md`](./MODULE_MAP.md) |
| Diagnose a recurring failure | [`COMMON_BUGS.md`](./COMMON_BUGS.md) |
| Trace an event end to end | [`EVENT_ROUTING.md`](./EVENT_ROUTING.md) (generated) |
| Inspect registry and update order | [`SYSTEM_REGISTRY.md`](./SYSTEM_REGISTRY.md) (generated) |
| Work on the 47-A slice | [`Spec/47A_SLICE_CONTRACT.md`](./Spec/47A_SLICE_CONTRACT.md) |
| Work on narrative or setting | [`worldbuilding/`](./worldbuilding/) and [`worldbuilding/sheets/README.md`](./worldbuilding/sheets/README.md) |
| Review earlier integration evidence | [`handoffs/`](./handoffs/) (historical evidence, not current status) |
| Decide whether a generated folder/file belongs in Git | [`ARTIFACT_RETENTION.md`](./ARTIFACT_RETENTION.md) |
| Understand which files can direct an agent | [`POLICY_MANIFEST.md`](./POLICY_MANIFEST.md) |
| Search without ingesting snapshots and transcripts | [`SEARCH_CONTEXT.md`](./SEARCH_CONTEXT.md) |
| Continue a deferred repository/context cleanup | [`REPOSITORY_HYGIENE.md`](./REPOSITORY_HYGIENE.md) |

## Documentation classes

- **Authority:** repo-root `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, and the active
  task spec. These define rules and intent.
- **Current status:** `design/program/`. It is the only whole-program pickup/status surface; live
  `check:*` output and player-facing evidence still outrank prose.
- **Navigation/reference:** `MODULE_MAP.md` and `COMMON_BUGS.md`. Keep these aligned with live code.
- **Generated indexes:** `EVENT_ROUTING.md` and `SYSTEM_REGISTRY.md`. Regenerate with
  `npm run build:indexes`; never edit them by hand.
- **Content source material:** `worldbuilding/`. Canonical prose, planning sheets, implementation,
  and review history have different authority; use that folder's index before treating a draft as canon.
- **Historical evidence:** `handoffs/`, review iterations, and old makeover/audit reports. They explain
  earlier decisions but do not establish present completion.

## Maintenance

Read [`docs/AGENTS.md`](./AGENTS.md) before changing this tree. Avoid dates, line numbers, file sizes,
or pass-count literals when a durable path or command communicates the same fact.
