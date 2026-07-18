# NOW — Active Work and Path Leases

**Snapshot:** 2026-07-18, refreshed at the start of the Sprint 2 Corridor Contract Wave. Foundation
integrated by `77a09790`, `32596ec7`, and `bfb23570`.

**Observed tree at refresh:** base `bfb23570`, index empty, 3 commits ahead of `origin/master`,
**29** dirty foreign paths totalling +4540/-1670 (foreign `git diff` object `4028ca7b`). That digest is
the tamper detector for this sprint: if it changes, a lease owner is live and the lead re-reviews
before staging anything.

> **A lease owner is LIVE.** At 07:52 and again at 07:58 on 2026-07-18, `src/ui/galaxyMap.js` changed
> under the sprint — +80 lines adding an `entityHomeSector()` helper, suppressing foreign-sector gate
> twins from SYSTEM survey (a "Gate → Helios Prime" listed while standing in Helios Prime, which also
> blew the auto-fit span out ~8x), a kill subscription, and intel-sync throttling. This is map-domain
> work by the `MAP-2026-07-18` owner, not sprint work. It is preserved untouched and was never staged.
> Consequence: the foreign digest is generational, not fixed. Re-derive it before every staging
> decision rather than comparing against a stale pin. `A03`, `G07`, `W05`, and `R03` are confirmed
> `BLOCKED_BY_LEASE` by observation, not merely by the board.

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

## Sprint 2 packet status

Integrated this sprint, at the commits named. Terminal states are not collapsed into "done".

| Packet | State | Commit | Proof at that commit |
|---|---|---|---|
| `G01` | `FOCUSED_GREEN` + `INTEGRATED` | `d5e0d6e7` | `node --test test/gold-corridor-public-pilot-contract.test.mjs` 31/31; `npm run check:launch-policy` OK |
| `T01` | `FOCUSED_GREEN` + `INTEGRATED` | `cd784532` | `node --test test/massline-orbit-telemetry.test.mjs` 26/26 |
| `A01` | `FOCUSED_GREEN` + `INTEGRATED` | `cd784532` | `node --test test/asteroid-formation-model.test.mjs` 31/31 |
| `W01` | `FOCUSED_GREEN` + `INTEGRATED` | `cd784532` | `node --test test/e1-encounter-phase-dispatch.test.mjs` 14/14; no extraction required |
| `G04` | `ATTEMPTED_STILL_RED` | diagnosis only | Inverted the row's stated cause. `check:autopilot` fully green; `G01` docks Helios at 152.1/155.2 WU through public input. No repair, no clean-tree attribution. |

Each of the four green packets was independently adversarially reviewed by a separate agent that
re-ran the acceptance commands, audited the write-set against the foreign path list, grepped for
`Math.random`/`Date.now`/`three` imports, confirmed no `*.expected.json` was touched, and mutation-
tested the subject where applicable. `A01` was returned `CONFIRMED_FOCUSED_GREEN` **with a must-fix**;
that fix landed in `5c1d9c0c` and raised its suite from 31 to 33.

`W01` is explicitly coverage-only: the existing `encounterDirector` / `e1EncounterRuntime` seam held
under adversarial probing, so `src/systems/e1EncounterPhases.js` was NOT created. The protocol requires
saying so rather than implying the characterization exposed a defect.

None of the four is wired into the runtime. That is deliberate and is what makes them provably
hash-inert: `grep` over `src/`, `scripts/`, `test/`, and `package.json` finds no reference to any of
them outside their own tests. Runtime consumption begins at `T03`/`T04`, `A02`/`A03`, and `W03`–`W06`.

## Returned integration requests — real defects found, deliberately NOT fixed

`W01` probed the encounter dispatch seam and found two genuine defects in `encounterDirector.js`.
That file is outside `W01`'s write-set, so they were returned as integration requests rather than
fixed inside the packet, exactly as the protocol requires. They remain OPEN:

1. `_onChoose` guards only on `live.phase === 'done'`. A consumed offer therefore re-dispatches once a
   handler advances to a non-terminal internal phase (e.g. h6 `waiting_battle`).
2. `_recordPlayerChoiceLine` runs before `handler.choose` and unconditionally, so any accepted
   re-dispatch appends a duplicate entry to `state.story.playerChoiceLines`.

Optional hardening, lead's call: h6's `choose` `wait` branch could no-op when `live.phase` is already
`waiting_battle`, and `finish()` could early-return on an already-resolved live record.

These are single-writer/duplicate-event defects in a live runtime owner. Fixing them changes
simulation behavior and must be sequenced with its own golden-safety review — not folded into a
contract packet.

`A01` had one real defect of its own, found by adversarial review and fixed in `5c1d9c0c`: `r4()`
returned `Infinity` for finite inputs above ~1.8e304 because it validated the input rather than the
rounded result, and the degenerate-input fixture capped at 1e12 — 292 orders of magnitude short of
the overflow. The lesson generalizes: a fail-closed contract is only as good as the magnitude its
fixtures actually reach.

## Sprint 2 branch anomaly — read before assuming where the work is

At `07:40:44` on 2026-07-18, mid-sprint, the working tree moved from `master` to a new branch
`feat/map-ux-polish-pass` (reflog: `checkout: moving from master to feat/map-ux-polish-pass` at
`2a355195`). Sprint 2 did not do this; the branch name matches the `MAP-2026-07-18` lane, whose owner
was independently observed editing `src/ui/galaxyMap.js` at 07:52, 07:58, and 08:26.

Consequence: `master` still points at `2a355195` (the Wave-0 reconciliation), while the four later
Sprint 2 commits sit on `feat/map-ux-polish-pass`. Nothing is lost — that branch is exactly
`master` + Sprint 2's commits, and the foreign lane has committed nothing — but Sprint 2 work is
**not reachable from `master`**.

The lead deliberately did not move any ref. Fast-forwarding `master` would be trivially reversible,
but the branch was created by another live lane and re-pointing a shared ref is that lane's decision,
not this sprint's. Resolve the ownership question first, then fast-forward or cherry-pick.

## Pre-existing reds — measured, attributed, and NOT caused by Sprint 2

| Check | State | Attribution |
|---|---|---|
| `check:encounter-director` | RED | `two-day soak should produce encounters (got 2)` at `check-encounter-director.mjs:171`. This is the `W06` outcome. `CONTENT-2026-07-18` is concurrently editing `narrative.js` (+64), `wreckMissions.js` (+38), and four flavor packs. `W01` names this command in its acceptance and must neither be blamed for it nor "fix" it. |
| `check:save-schema` | RED | Two independent causes. (a) `$.sites` — pre-existing **committed** debt: `sites` is absent from `gameState.js` at HEAD and in the tree; it enters via the save payload from the asteroid-sites feature, which shipped without regenerating `SAVE_SCHEMA.md` (last written 2026-07-14, `850c80f3`). (b) `$.settings.video.bloomThreshold` 0.72→1 — **foreign dirty**: `git diff -w --ignore-blank-lines src/core/gameState.js` shows that value is the file's ONLY real change; the rest of its diff is line-ending churn. |
| `check:sim:compare`, `check:sim:v3:compare` | `ok`/`hashEqual` true, stale expected envelopes | Pre-existing. Unchanged by Sprint 2 — see the golden gate below. |

> **Do not run `node scripts/generate-save-schema.mjs --write` to clear the save-schema red.**
> Regenerating would bake the MAP/render lane's *uncommitted* `bloomThreshold` value into a committed
> artifact, silently capturing another lane's WIP. `A02`, `G02`, and `G03` must treat this as a known
> red with the attribution above and must not touch `SAVE_SCHEMA.md` while `gameState.js` is leased.

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
