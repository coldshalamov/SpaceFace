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
| `src/ui/screens/stationHub.js` and legacy station panels | The default station shell replaced the body, but live helpers and many checks still import the legacy module. | After the protected station lane is stable, extract helpers, point checks at `stationScreen`, prove the public route, then remove unreachable panels. |
| Source-only feature candidates (`asteroidMotion`, handling/mass/module panels, Ship's Ledger UI) | Some are retained or admitted product outcomes with focused checks; Ship's Ledger still needs player reachability. | Decide integrate-versus-retire per outcome against `design/program/`; remove source, checks, and plan claim together if retired. |
| `src/systems/ai.js` and `src/systems/flight.js` | Compatibility backends are not the default route, but retention is a support-policy decision. | Formally support and test a compatibility route, or retire selector branches and compatibility code together. |
| Root `.blend` sources and clay renders | The apparent root/asset-tree `.blend` pairs have different hashes; unreferenced media may still carry unique provenance. | Review with the asset owner and manifests before moving to source/evidence storage or deleting. |
| Check namespace/topology | Hundreds of focused commands are not reached by the default aggregate, but many are legitimate narrow contracts. | Catalog checks as release gate, focused contract, manual probe, or historical; deduplicate aggregates without deleting behavior by name alone. |
| `check-sector-palettes.mjs` | Schema validation is functional, while exact class matching and core-relative luminance may constrain intentional sector mood. | Keep schema/type checks; have render/design owners decide whether class/luminance rules become diagnostics or player-facing evidence. |
| Root handoff/history docs | `MASSLINE_PHYSICS_HANDOFF.md` is recent; `VISUAL_ASSET_PLAN.md` and `needed-assets.md` already have explicit plan-registry roles. | Reclassify or move only when every maintained link and useful intent has a stronger canonical owner. |
