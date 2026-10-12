# Starter integration notes

Local join of the three starter lanes onto `codex/starter-integration`. The scratch branch was never pushed and has been deleted. Nothing here is on master. This is not starter-experience acceptance.

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
