# Starter integration notes

Local join of the three starter lanes onto `codex/starter-integration`. The scratch branch was never pushed and has been deleted. This branch is not on master. This is not starter-experience acceptance.

## Join

Scratch branch `codex/starter-integration-scratch`, merged in this order onto `83a0cf278` (this branch, two commits past `6dc08f08`):

| Branch | Head | Result |
|---|---|---|
| `origin/master` | `6dc08f08e7ebcbf29d1421d3d902b3b819c03c3d` | already the base |
| `origin/codex/starter-progression-and-choice` | `4fe080f515ebf96df6aebe64aa403b5cb9445f75` | clean |
| `origin/codex/starter-living-world-and-aftermath` | `18fd7494edff53f64306218efd984075661f3476` | clean |
| `origin/codex/starter-feedback-and-iteration` | `48ea6231deb33aeee52e1b66680655ee64a446d0` | clean |

No overlapping paths with this branch's write set (`flightV3`, `orbitAssist`, `camera`, `audioSystem`, `input`, `tetherGameplay`, and the two new tests). No conflict hunks.

The public session below ran after Agent 1 and Agent 3 were at those heads, and after Agent 2 was at `f83d172`. Agent 2's three later commits (`adca0f681`, `80605be86`, `18fd7494e`) were merged afterwards, also clean. They touch `npcJobsRuntime.js`, encounter 344, and their tests. They do not touch flight, input, onboarding, or save.

## Public tutorial-on circuit

One headless Chrome session on the joined tree. Isolated store `/tmp/sf-starter-circuit-store` (removed after the run). Ordinary route: title **New Game**, **Launch**, then keyboard. No economy, fit, dock, or tether API calls.

What the hands did:

- Arrival was flight, `tutorialHints: true`, pilot scheme, 5,000 CR, hull 140, onboarding active. The station sat about 1,347 WU from the origin spawn, which is `station_helios` at (1280, −420). `state.sector` was empty in the probe; the station distance is the sector evidence.
- `KeyD` yawed the nose (`rot` rose by about 0.068 in 450 ms).
- Holding the yaw and thrust keys closed on the marked derelict from about 230 WU to about 55 WU.
- A Space tap latched that derelict. The tutorial voice became "Winch in. Hold tether to reel."
- Holding Space with W reeled. The voice became "Cut and coast. Tap tether to cut."
- A short Space tap released the line. Beat `tether` was done. The voice became "Swing the rock through the wreck." The tether mirror was inactive.
- A `blur` event while W was held dropped `input.moveZ` from 1 to 0.
- F5 stamped `meta.lastSavedAt`.
- P opened pause. Tick and `simTime` stayed at 140 / 2.333 s, `timeScale` 0.
- Main Menu, then Continue: 5,000 CR, cargo count 5, tutorial still on, beat 0 with `tether` done, the same next line, tether inactive. The hull was still moving on the velocity it had at the save. Onboarding re-staged a lesson wreck (new id) beside the ship. The released line did not come back.

The session ended on the swing-the-rock lesson. It did not reach the raid, a haul, Shipworks, a Swing Drive fit, a job choice, an aftermath return, or death and retry.

Swing Drive was still unfitted (`derived.swingDrive` false at 5,000 CR). The distinguishable maneuver is the production flight case in `test/starter-integration-feel.test.mjs`: the same dash impulse, then forward with no turn key, yaws onto the tangent and gates radial thrust. That case is not this public session.

Death, respawn, and the living-target line cut are `test/starter-integration-interrupt.test.mjs`. The public session did not die.

## Verdicts

### Agent 1 — PR #280, `4fe080f51`

Clean join. Helios Swing Drive S at 5,100 CR, B5 at the Helios berth, and the docked-save of the berth, the three offers, and the recommended run all live in their files. `saveSystem` already calls `onboarding.serialize()`. Their new `choiceStationId`, `choiceOfferIds`, and `recommendedMissionId` ride that slice. No save-system change is required for those fields.

The public session never docked, so this join did not exercise the purchase or the job choice through the station UI. Their A6 pass remains a tutorials-off, API-dock fixture.

Their departure line says the bound boost key on a taut Massline swings around the anchor. The production commit window also keeps the next thrust on that circle during the slack moment after the dash. The key and the line they name are the ones the maneuver uses.

### Agent 2 — PR #285, `18fd7494e`

Clean join. Partial living-world slice. The authored miner can fall back to cutting, a lot changes hands only from alongside the set-down, and a delivered raid kill of the adopted barge spills the real lot and leaves one marker wreck that survives `aftermathWrecks` serialize/deserialize. `saveSystem` already calls `aftermathWrecks.serialize()` and deserializes it, so that marker has a core save path. Their PR still says the live adoption and the return visit are not exercised. This public session did not reach the raid.

### Agent 3 — PR #279, `48ea6231d`

Clean join. Aftermath clock holds while contact lasts. The inline gravity-well and cargo-spill stand-ins are gone.

Their audio request is done on this branch, in `src/audio/audioSystem.js`: a `tether:broken` whose reason `tetherBreakCueForReason` maps to null stays silent, matching presentation. `cut` and `release` stay silent too, and still stamp `_masslinePlayerCutTick`, so a later `tether:releaseRated` does not snap. `endpoint_lost` still plays the break. Covered by `test/starter-integration-interrupt.test.mjs` and the existing `test/pq-158-02-massline-instrument.test.mjs` cut case.

## Routed findings

### 1. Violence spills are invisible to salvors

- File: `src/systems/traffic.js`, `_spillHaulerCargoFromViolence`
- Symptom: Agent 3's `world.cargo_spill` on seed 4242 spills cargo from a laden civilian hauler, and the first broken link is `spill_noticed`. No salvor plots a course.
- Cause: the violence path writes `ownerRecordId`, `spillCause`, and `attackerId` on the pod. `_onFreightCargoSpilled` only notices a pod whose `data.freightCustodyPod` is an object. The violence path does not stamp that object.
- Suggested change: when the hauler already has freight-custody identity, stamp `freightCustodyPod` on the pod this function just spawned, in the shape `_onFreightCargoSpilled` already reads. Leave the notice owner where it is.

### 2. The opening raid is not held for the loaded barge

- File: `src/systems/encounterDirector.js` (director owner). Seam: `openingRaidCarrierReady` in `src/data/encounters/344-opening-hauler-raid.js`.
- Symptom: encounter 344 can still cast before the Helios starter barge is in frame with cut ore.
- Cause: `openingRaidCarrierReady(state)` is true only while that loaded barge is present. Agent 2 exported it and said the director owner can hold the raid. Nothing calls it.
- Suggested change: in the Helios starter operation, do not cast 344 while `openingRaidCarrierReady` is false. Do not start a second raid.

### 3. An ordinary Helios latch does not survive Continue

- File: `src/combat/persistence.js`, `buildEntityRefs` and `serializeAttachments`
- Symptom: a line that is still attached to a Helios starter rock or the tutorial derelict at save time is absent after Continue. The public session had already cut, so the resumed mirror was correctly inactive. A live rock latch would be dropped.
- Cause: `buildEntityRefs` records the player, persistent-flagged bodies, incoming Ceres hostile owners, and stunt bodies. `buildAttachmentRefs` adds `worldRecord` / `worldSite` refs for Ceres hardware only. A row with no ref is skipped. That is what keeps a recycled numeric id from inheriting the joint.
- Suggested change: persist a starter-rock latch by `worldRecordId` (or another stable identity) and rebind on load to the body that still carries it. Drop the row when that body is gone. Do not restore by numeric entity id. This is not a `saveSystem.js` field.

### 4. Gravity-well bench label still says Fling

- File: `scripts/lib/bench/scenarios/feel.gravity_well.mjs`
- Symptom: the scenario label is still "B1 Gravitic Well Deflection & Fling" while the production field captures and holds.
- Cause: the stand-in orbit was replaced by the real fields owner. The label was not.
- Suggested change: name the hold the well actually does, or change the well if the bar still wants a fling. Do not add an impulse in flight to satisfy the old label.

## Owned behavior this branch carries alone

Useful without the sibling branches:

- After a swing-drive dash, forward thrust with no turn key yaws onto the line's tangent for 1.35 s, including while the line is slack. The dash impulse is unchanged. Brake, opposite turn, a lost or changed target, death, respawn, and load clear it. Pause freezes `simTime`, so the window does not expire in the menu.
- A valid throw solution pulls the chase focus toward the predicted meeting. An invalid solution does not.
- The claim cracker at (720, −420), mass 11,000, is already inside `f_helios_starter` and `zone_helios_claim`, about 560 WU from Helios. That is the local swing yard. No new zone and no spawned body.
- Death and respawn break lines that name the player (`endpoint_lost`), keep a living target, drop a dead one, and release held thrust, turn, boost, and fire. `save:loaded` does not cut a line.

## Rebase onto the published harness

`origin/master` moved to `c15b0e913` (merge of PR #288, `codex/player-truth-harness`). This branch was rebased onto that commit. The flight, orbit-assist, camera, audio, tether, input, and starter-integration test blobs are the same bytes as `cd22d5d89`. No conflict. The harness tree (`scripts/player-truth/**`, `src/testing/playerTruth/**`) is master's and is not edited here. The join table above is the earlier scratch merge; this rebase does not redo it.

## Player-truth adventure

Required gate for the tutorial-on circuit, run once the harness existed:

`npm run player-truth -- --mode=adventure --duration=150 --evidence --wall=35`

The recorded build is `55f38f0f7` (dirty). That commit was a local merge of the pre-rebase flight head `cd22d5d89` and harness `ec37c3d2e`. The scratch branch was never pushed and has been deleted. Dirty is `scripts/player-truth/run.mjs` only: an uncommitted launch used system Chrome at `/usr/bin/google-chrome` (`channel: 'chrome'`, `--no-sandbox`, `--disable-dev-shm-usage`) because Playwright's bundled Chromium is not installed on this box. That patch was reverted before the scratch branch was deleted. It is not on this branch. An empty diff of the owned flight, input, audio, camera, and tether files between `cd22d5d89` and the rebased head is the game tree this verdict grades. Master's later harness commit `da74b69c0` only prints the game entity id (`id % 1e6`) on offender lines and pluralizes the popping count. This run had no FAIL, so that wording does not move a grade.

Exit code 2. Overall **INCOMPLETE**. No page errors. Seed 4242. Software GL (SwiftShader), headless Chromium 154.0.8037.57, 960×540. Wall 1395 s, play sim 150.4 s, 2698 frames, 66 screenshots. Stopped because the 150 s duration was reached. The player script was idle 6 s, then thrust and yaw probes, then cruise thrust bursts and turns.

| Check | Result |
|---|---|
| route | **PASS** — main menu → mode select → preparation → spawn → play. Tutorial hints true. Default pilot and ship, Launch. Flight at sim 0.2 s. |
| player_control | **PASS** — 0/2 probes dead. KeyW thrust Δv 189.9 over sim 6.32–7.55 s. KeyD yaw 2.40 rad over sim 7.55–8.37 s. |
| tumble | **PASS** — longest 0 s. |
| player_ship | **PASS** — 0/2580 frames bad. |
| spawn_motion | **PASS** — 0 bodies. |
| lod_churn | **PASS** — 0/s. |
| popping | **PASS** — 0.4/min, worst entity 1 toggle. |
| vfx_coverage | **PASS** — p95 0% of the screen. |
| readability | **UNKNOWN** — enemy 0, asteroid 0, projectile 0, pickup 0 (need 5). |
| frame_time | **UNKNOWN** — p50 72 ms, p99 238 ms, 8 long tasks ≥250 ms. Software GL, not graded. |
| round_resolution, kills_before_input, reward_before_input, loadout | n/a |

Copies of the harness output, unchanged:

- `design/program/starter-integration/player-truth/adventure/verdict.md`
- `design/program/starter-integration/player-truth/adventure/verdict.json`
- `design/program/starter-integration/player-truth/adventure/contact-sheet.jpg`

The sheet header is `INCOMPLETE · adventure · seed 4242 · 55f38f0f7` and `FAIL: none`. Speed climbs from 0 to about 195 by sim 16 s and later holds near 180–189. The tutorial strip stays `TUTORIAL 1 / 12` for the whole 150 s. The earlier custom public session remains the evidence that a Space latch, reel, and cut, plus blur, F5, pause, and Continue, work through the public keys. This harness cruise does not press Massline, so it does not replace that session.

### Routed: the adventure cruise never arms the tether lesson

- File: `scripts/player-truth/driver.mjs`, `cruiseBeat` (harness owner; not edited here)
- Symptom: a 150 s adventure cruise leaves the tutorial strip at `TUTORIAL 1 / 12` while the ship is moving.
- Cause: `cruiseBeat` holds KeyW for 0.8 s and, every fourth beat, KeyA or KeyD for 0.4 s. It never taps Space, so the massline latch does not happen. Adventure does not call `fightBeat` (that beat presses Space only every seventh beat).
- Suggested change: an adventure beat that taps Space once the marked derelict is in range, then holds to reel and taps to cut, on the public pilot scheme. A strip stuck at 1/12 on this cruise is that script, not a starter-integration failure.

## Ship that cannot move, or tumbles, after a round reset

Looked for that cause in the files this lane owns: `src/systems/flightV3.js`, `src/core/flight/orbitAssist.js`, `src/systems/input.js`, `src/systems/tetherGameplay.js`, `src/render/camera.js`, `src/audio/audioSystem.js`, and the rest of `src/core/flight/`. Not found. No fix added.

`flightV3` listens for `flight:racePrecision`, `save:loaded`, `game:started`, `player:death`, `player:respawn`, `tether:latched`, and `massline:selfSling`. It has no round-reset subscriber. The flight sim is inactive while the player is dead, defeated, out of flight, or docked. Death and respawn release held controls and clear the swing commit. A Swarm round reset that does not emit those events does not hit this path.

`origin/codex/swarm-crucible-overhaul` at `459fa9348` does not change those files. Since master its names are the survival and swarm systems, the crucible draft UI, deep-field and background render, `src/render/lod.js`, and its tests. LOD, HLOD, whole-ship LOD policy, asset residency, crucible warm-package residency, crucible ghost, and startup GPU residency were not edited on this branch.

The published summary on master (`design/program/player-truth/SUMMARY.md`), from the harness run on master `6dc08f08e`, already marks both owner reports **NOT REPRODUCED**: `player_control` 0/4 thrust/yaw probes dead across both Swarm rounds, `tumble` no uncommanded spin beyond 0.5 s. This adventure run on the starter flight code also passes both (0/2 probes dead, tumble 0 s).

This is still not starter-experience acceptance. The harness result is INCOMPLETE, the adventure cruise does not play the massline lesson, and the branch is not on master.
