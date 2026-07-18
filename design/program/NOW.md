# NOW — Active Work and Path Leases

**Snapshot:** 2026-07-18, refreshed at the start of the Sprint 2 Corridor Contract Wave. Foundation
integrated by `77a09790`, `32596ec7`, and `bfb23570`.

**Observed tree at refresh:** base `bfb23570`, index empty, 3 commits ahead of `origin/master`,
28 dirty foreign paths totalling +4540/-1670 (foreign `git diff` object `4028ca7b`). That digest is
the tamper detector for this sprint: if it changes, a lease owner is live and the lead re-reviews
before staging anything.

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
| `CONTENT-2026-07-18` | `EXTERNAL / OCCUPIED` | concurrent content/narrative lane; **newly recorded at this refresh** | `src/data/barks.js`, `src/data/flavor/020-ad-board.js`, `src/data/flavor/030-graffiti.js`, `src/data/flavor/040-band.js`, `src/data/flavor/080-landmark-lore.js`, `src/data/laneContacts.js`, `src/data/moralTraps.js`, `src/data/namedAces.js`, `src/data/narrative.js`, `src/data/wreckMissions.js`, `src/localization/catalogs/en-US.generated.js` | These were dirty but undocumented by the previous board. `en-US.generated.js` is a 4588-line regeneration and is a generated-index mutex besides. No Sprint 2 packet may author encounter/wreck/contact/bark prose while this lane is open. |
| `SCREENS-2026-07-18` | `EXTERNAL / OCCUPIED` | folded into the HUD/visual-asset lane at this refresh | `src/ui/screens/base.js`, `src/ui/screens/gameOver.js`, `src/ui/screens/missionLog.js`, `design/MAP_DATA_HANDOFF.md` | Screen lifecycle and Game Over/mission-log presentation are live foreign work. `missionLog.js` also overlaps the map lane. Read-only for Sprint 2. |
| `SPRINT2-CORRIDOR-2026-07-18` | `CLAIMED` | lead/status integrator (this sprint) | New files only under `scripts/lib/goldCorridor*`, `scripts/check-gold-corridor-*`, `src/combat/masslineOrbitTelemetry.js`, `src/systems/asteroidFormationModel.js`, `src/systems/e1EncounterPhases.js`, matching `test/*` contracts, `design/program/**` status, and `package.json` script entries applied by the lead | Base `bfb23570`. Write-set is disjoint from every `EXTERNAL / OCCUPIED` lease above. Any packet whose write-set or evidence-set intersects an occupied lease is returned `BLOCKED_BY_LEASE`, not rearchitected around. |

If another path becomes dirty, treat it as occupied until its owner and intent are proven. Add it here in
the next integration pass; do not silently absorb it.

## Lease-blocked packet classes

Sprint 2 uses four distinct non-terminal verdicts so a blocked packet stays legible to the next lead.
These are reporting classes, not new protocol states; the protocol state remains `BLOCKED`.

| Class | Meaning |
|---|---|
| `BLOCKED_BY_LEASE` | The packet's write-set intersects an `EXTERNAL / OCCUPIED` path. |
| `EVIDENCE_BLOCKED` | Implementable, but its required player-route evidence is produced by a runtime whose current output is defined by foreign uncommitted code, so the capture would not prove the packet. |
| `ATTEMPTED_STILL_RED` | Work was done and measured; the declared terminal state was not reached. Before/after numbers required. |
| `NOT_STARTED (dependency)` | Held only by an unmet packet dependency, with the blocking ID named. |

Before declaring any of these, compute the packet's write-set and evidence-set and intersect it with
the union of the occupied paths above. Blanket-blocking a whole lane is itself status dishonesty: a
packet that only *reads* an occupied module is not blocked.

## Sprint 2 — Corridor Contract Wave

The active sprint owns 23 of the 113 packets (20.35%): `G01–G08`, `T01–T04`, `A01–A05`, `W01–W06`.
Completing all 23 on top of `F01–F17` would reach 40/113 (35.40%). Packet count is a scope
denominator only.

**Baseline at `bfb23570`:** `npm run check:foundation` exit 0; content census `ok:true` with 0
duplicate/missing IDs, 0 identity mismatches, 0 dangling references; deep-state ladder 13 contracts /
0 captured / 13 planned.

**Wave-0 path confirmation:** all four Wave-1 expected new files are free — `scripts/lib/goldCorridorPublicPilot.mjs`,
`scripts/check-gold-corridor-public-pilot.mjs`, `test/gold-corridor-public-pilot-contract.test.mjs`,
`src/combat/masslineOrbitTelemetry.js`, `test/massline-orbit-telemetry.test.mjs`,
`src/systems/asteroidFormationModel.js`, `test/asteroid-formation-model.test.mjs`,
`test/e1-encounter-phase-dispatch.test.mjs`, `src/systems/e1EncounterPhases.js`. Their research
anchors (`src/combat/trace.js`, `src/systems/e1EncounterRuntime.js`, `src/systems/masslineTelemetry.js`,
`src/systems/tetherGameplay.js`, `src/systems/asteroidSites.js`, `src/data/sites.js`,
`scripts/lib/professionalTravelPublicRoute.mjs`) all exist and are clean.

**Execution isolation:** Sprint 2 workers run in dedicated git worktrees cut from `bfb23570` and hold
no Git authority whatsoever. Only the lead writes to the primary worktree. This is a preservation
measure, not a convenience: the 28 foreign paths are uncommitted and unrecoverable, so a single
worker-side `checkout`/`clean`/`stash` would destroy another lane's work with no backup.

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
  Measured at `bfb23570` and pinned as the Sprint 2 golden-safety gate:

  | Compare | `ok` | `hashEqual` | Stale expected vs actual |
  |---|---|---|---|
  | `check:sim:compare` | true | true | `presentation:caption` 3→4, `presentation:cueApplied` 14→15, `presentation:cue` 14→15, `audio:cue` 3→4 |
  | `check:sim:v3:compare` | true | true | `authoritativeHash` expected `a6c96aad…0ff1`, actual `7e3e114e…d50f` |

  The gate is on the **actual** column. Any Sprint 2 change that moves an actual value is a regression
  in this sprint. Any change to an expected value is a forbidden re-record.
- No deep-state fixture is called captured yet. The thirteen contracts exist; public-route artifacts are
  still work.

## Handoff rule

Only the lead/status integrator edits this board during concurrent execution. Agents return a receipt in
the format in [`roadmap/00_EXECUTION_PROTOCOL.md`](./roadmap/00_EXECUTION_PROTOCOL.md); the lead updates
the lease and program truth in the same integration pass.
