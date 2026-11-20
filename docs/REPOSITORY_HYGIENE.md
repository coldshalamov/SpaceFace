# Repository Hygiene Register

This is the single holding area for cleanup candidates that are plausible but not safe to change
without an owner or product decision. It is not product scope or a reason to delay current Alpha
work. Remove rows when resolved; completed cleanup belongs in Git history rather than an accumulating
ledger.

## Admission rule

A cleanup is immediately safe only when it has no current diff, maintained consumer, runtime or
authoring role, accepted-evidence role, or unresolved provenance. Otherwise record the decision gate
here. Absence from the default runtime or `npm run check` is not enough by itself.

## Deferred decisions

| Candidate | Why it is not an automatic deletion | Safe next decision |
|---|---|---|
| `mcps/` | Tool-schema output is currently modified and gaining untracked connector data in the shared tree. | Identify the generating tool and decide whether this is source, cache, or externalized state after activity stops. |
| `skills/` | Vendored generic skills have license/provenance records and may still serve an external harness. | Confirm whether any maintained workflow consumes them; then keep the complete vendor package or remove it as one unit. |
| `.campaign/` and copied workspaces | Ignored controller state may contain an active campaign as well as stale snapshot instructions. | Let the active controller owner expire/archive campaigns; never promote copied `AGENTS.md` files to authority. |
| `.devshots/` captures and runnable copies | These are the largest local storage consumer. Named route baselines and graphics review receipts still have owners. | Keep the compact verdict and required capture. Full source overlays are gzip files by default. Use the manifest path printed by the creator. Reuse [saved comparisons](./VALIDATION_WORKFLOW.md#player-truth-route-check). Recover unique local work before retiring any copied tree. |
| `.dev/pr-expansion/work/` | The active PR intake packet relies on original numbered staging directories. | Close or migrate the active work through the [fleet queue](../design/program/fleet/QUEUE.md) with its ledger before pruning staging payloads. |
| `.git/objects/` | Pack files include current history and locally retained objects. A fetch can have in-progress packs. | Keep the shared object store while work is active. Treat any eventual history rewrite as a separate coordinated migration. |
| `src/ui/station/` helpers and station panels | The monolithic `src/ui/screens/stationHub.js` is gone; the station shell owns the body and helpers live under `src/ui/station/`. | Retire any remaining checks or references that still name the removed module. |
| Source-only feature candidates (`asteroidMotion`, handling/mass/module panels, Ship's Ledger UI) | Some are retained or admitted product outcomes with focused checks; Ship's Ledger still needs player reachability. | Decide integrate-versus-retire per outcome against `design/program/`; remove source, checks, and plan claim together if retired. |
| `src/systems/flight.js` | Compatibility backend, not the default route (`src/systems/ai.js` was deleted in Q4 — the tactical stack is the only AI backend). Retention is a support-policy decision. | Formally support and test a compatibility route, or retire selector branches and compatibility code together. |
| Root `.blend` sources and clay renders | The apparent root/asset-tree `.blend` pairs have different hashes; unreferenced media may still carry unique provenance. | Review with the asset owner and manifests before moving to source/evidence storage or deleting. |
| Check namespace/topology | Hundreds of focused commands are not reached by the default aggregate, but many are legitimate narrow contracts. | Catalog checks as release gate, focused contract, manual probe, or historical; deduplicate aggregates without deleting behavior by name alone. |
| `check-sector-palettes.mjs` | Schema validation is functional, while exact class matching and core-relative luminance may constrain intentional sector mood. | Keep schema/type checks; have render/design owners decide whether class/luminance rules become diagnostics or player-facing evidence. |
| Root handoff/history docs | `MASSLINE_PHYSICS_HANDOFF.md` is recent; `VISUAL_ASSET_PLAN.md` and `needed-assets.md` already have explicit plan-registry roles. | Reclassify or move only when every maintained link and useful intent has a stronger canonical owner. |
