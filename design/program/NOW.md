# NOW — Active Work and Path Leases

**Snapshot:** 2026-07-18, foundation integrated by `77a09790`, `32596ec7`, and the program commit
containing this board.

This is the volatile pickup board. It answers only: what is being integrated, which paths are occupied,
and what may be claimed next. Scope and dependencies live in [`roadmap/README.md`](./roadmap/README.md);
completion truth remains split across the verified, remaining-work, and acceptance pages.

Before acting, refresh `git log -1 --oneline`, `git status --short`, and
`git rev-list --left-right --count origin/master...HEAD`. This snapshot never licenses an agent to
overwrite newer work.

## Integration and occupied lanes

| Lease | State | Owner | Allowed paths | Base / handoff |
|---|---|---|---|---|
| `FND-2026-07-18` | `INTEGRATED` | lead/status integrator | Closed foundation lease: program docs, narrow plan routing, CI/census/catalog/fixture/physics diagnostics, focused tests, and package wiring | Runtime repair `77a09790`; diagnostic implementation `32596ec7`; program/history integration is the commit containing this board. |
| `MAP-2026-07-18` | `EXTERNAL / OCCUPIED` | concurrent map/render lane; owner must identify itself before handoff | `design/MAP_UX_PLAN.md`, `scripts/capture-maps.mjs`, `scripts/check-bloom-structural-perf.mjs`, `src/core/gameState.js`, `src/data/sectors.js`, `src/render/bloom.js`, `src/render/renderer.js`, `src/systems/world.js`, `src/ui/galaxyMap.js`, `src/ui/navigation/localSpaceMapModel.js` | These edits predate or appeared outside `FND-2026-07-18`. Do not stage, edit, move, or claim them from the foundation lane. Current `check:m2:map-cutover` is 13/14; the dirty region-data palette hash is the known red edge. |
| `HUD-ASSETS-2026-07-18` | `EXTERNAL / OCCUPIED` | user-confirmed HUD and visual-asset agents | `scripts/capture-gameplay.mjs`, `src/ui/bandHud.js`, `src/ui/uiRoot.js`, and any subsequently dirty HUD, render, asset, manifest, capture, or visual-check path not explicitly created by `FND-2026-07-18` | Preserve in place. Foundation validation may read these paths but must not edit, stage, reformat, revert, or use their current state as final acceptance. |
| `MISSION-2026-07-18` | `EXTERNAL / OCCUPIED` | concurrent owner not yet identified | `src/systems/missions.js` | Appeared outside the foundation lane. Preserve and require an owner/handoff before staging or cross-seam integration. |

If another path becomes dirty, treat it as occupied until its owner and intent are proven. Add it here in
the next integration pass; do not silently absorb it.

## Ready to claim

These packets can run in parallel after each agent refreshes the tree and returns a path claim to the lead:

| Packet | Lane | Default path budget | Must not overlap |
|---|---|---|---|
| `G01` | Gold-corridor public pilot | `scripts/lib/goldCorridorPublicPilot.mjs`, `scripts/check-gold-corridor-public-pilot.mjs`, `test/gold-corridor-public-pilot-contract.test.mjs`, ignored evidence | map/render lease, save internals |
| `T01` | Massline orbit telemetry kernel | `src/combat/masslineOrbitTelemetry.js`, `test/massline-orbit-telemetry.test.mjs` | flight input, physics owner, tether gameplay until interface review |
| `A01` | Asteroid formation model | `src/systems/asteroidFormationModel.js`, `test/asteroid-formation-model.test.mjs` | asteroid UI shell and active map/render files |
| `W01` | Encounter phase-dispatch contract | `test/e1-encounter-phase-dispatch.test.mjs`; provisional extraction only at `src/systems/e1EncounterPhases.js` | encounter content catalog edits |

`package.json`, `src/core/registry.js`, `src/core/gameState.js`, `src/systems/input.js`, save/load owners,
shared CSS, and generated indexes are integration mutexes. Feature agents return the requested shared
change; the lead applies it after collision review.

## Blocked or deliberately parked

- The attachment available in this run is a roadmap summary that references a separate 113-packet
  Markdown file not present in the attachment directory or repository. The executable 113-packet
  decomposition in `roadmap/` is therefore a live-tree reconstruction, not a verbatim import. This does
  not block work; if the source file arrives, reconcile outcomes and retain stable IDs.
- Map cutover and its planning cleanup stay with the occupied map lane.
- `check:sim:v3` is red against its expected hash. The V3 and legacy reload compares currently prove
  uninterrupted/reload equality but report stale expected envelopes. Do not re-record either golden from
  this lane; coordinate source attribution and review with the occupied `gameState`/HUD work first.
- No deep-state fixture is called captured yet. The thirteen contracts exist; public-route artifacts are
  still work.

## Handoff rule

Only the lead/status integrator edits this board during concurrent execution. Agents return a receipt in
the format in [`roadmap/00_EXECUTION_PROTOCOL.md`](./roadmap/00_EXECUTION_PROTOCOL.md); the lead updates
the lease and program truth in the same integration pass.
