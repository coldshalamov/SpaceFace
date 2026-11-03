# Tethys Scale 4 → Ceres handoff

Source baseline: PR #803 head `8430713f54b9547f55800ce11dfb3f83b9d7aca9`.

## Route already in the game

After the first 47-A hand-in at Helios, Book 1 (`honest_work`) posts the sealed-alloy run from
Helios to the receiving berth at Tethys Junction. Delivery records the alloy step and the existing
Tycho manifest message records its quiet re-categorization. The next ordered step is Scale 4, then
the existing DMC furnace detail at Ceres. This order and contract identity come from the campaign
book and `embodiedMissions` definitions, not from this handoff.

Tethys already has an arrival and a physical activity. The existing Scale 4 deck announces itself;
its surrounding freight platform, inspection desk, tally post, and counted-freight rack use ordinary
registered place assets. The player must bring a fresh **jettisoned player-cargo pod** into the
90-WU plate ring and let it settle at 8 WU/s or less. The desk compares the pod's stamp with its
0.94 plate reading, logs a variance when present, and leaves the pod alive. The sealed alloys have
already been delivered; the Scale 4 waypoint explicitly says they are not required. The physical
clue is the player's own freight against the desk's reading, not a second hand-in of the alloys.

## Missing connection added

The scale's original readout names the discrepancy, but the campaign previously had no Kessler
response after the ordered Book 1 variance was accepted and no character line pointing onward to
Ceres. The new `KESSLER DESK` message occurs only when Mission Story receives the fresh accepted
`scale_4` step. It says: “Variance filed. Next: Ceres furnace detail. Feed ore intact; losses stay
recorded.” A premature event, a non-variance reading, or a duplicate receipt does not produce it.

The contact does not claim Kessler caused the manifest change, that the delivered alloy is the pod
on the scale, or that the furnace detail has already produced an outcome. It does not change cargo,
credits, beat progression, mission acceptance, or save data. The existing Mission Story owner still
records the step and the existing Tethys board/mission owner supplies the Ceres contract.

## Consequence and return

The next authored job remains `campaign47a:b1:infested`, offered from Tethys and bound for the Ceres
refinery. Its current owner requires clearing four repair-mite sites and feeding three marked ore
pods into CR-FEED. It preserves the existing outcome rules: delivered lots pay per lot, destroyed
lots are recorded as losses, and a cleared site with all cargo lost can advance without cargo pay.
The message adds no obstruction or payment gate. The player may still rearm at Tethys or Helios as
the contract brief allows. After the Ceres leg, the next book begins at Tethys with the Cinder board;
this change does not alter that route.

## Evidence boundary

The source-backed route is in `src/story/campaign47a/campaignData.js` and
`src/story/campaign47a/embodiedMissions.js`. The arrival announcement, plate, and retained-pod
behavior are in `src/data/kessler.js`, `src/systems/kesslerScale.js`, and
`src/systems/kesslerScaleWorksite.js`. The ordered handoff is in `src/systems/missionStoryOps.js`.
The focused candidate test extends `test/w533-books-0-2.test.mjs` and drives the actual Scale 4
system with a real jettisoned-cargo entity before accepting the existing Ceres contract. It does not
claim a rendered/browser journey or a full Save/Continue acceptance.
The original-67 base commit `67c9e951081ff05117e7aabd37f706f60c500733` has the same source blobs
as PR #803 head for `embodiedDialogue.js` (`8a193913ab25ecb8057214d4c776a45629e40fa4`) and the
W533 test (`cba2214e8ff3447b459111ae24c90945b02cd88c`); no cumulative edit to either path sits between
that base and this work. The exact-843 originals are retained under `remote/head843/` for restoration.

## Focused verification

Against the candidate sources, the authored B0–B7 dialogue regression passes and preserves one primary and one recovery line per book. The set-piece validator also returns clean dialogue and mission schemas; the added `step_handoff` variant does not require a handoff for every book or change the existing primary/recovery rules. The W533 Books 0–2 harness passes, including its production Scale 4 owner path, accepted ordered step, variance line, no cargo/credit change, Ceres contract, and duplicate receipt suppression.

The PQ-032 file has one unchanged integration failure in its long-tow spine case: at its B1 assertion, `state.story.beatIndex` is still 1 rather than 2. The other three PQ-032 tests pass. The same 3-pass/1-fail result occurs with the untouched exact-843 `missionStoryOps.js` and `embodiedDialogue.js` control and the same test/dependency overlay, so it is not introduced by this handoff. No test fixture or golden was altered to mask it.

The comms event's `persist: true` keeps the line on the live comms feed; it does not create a saved transcript. The ordered Scale 4 step is the replay guard: a duplicate Scale 4 event against the retained state cannot acquire a new step ID and therefore cannot emit a second handoff. The focused harness checks retained pod/receipt behavior; it does not claim a complete game Save/Continue journey or rendered/browser verification.

Repro command from the workspace root:

`node --import ./recovery-20261031/next-mission-arrival/candidate/test/overlay-loader.mjs --test ./recovery-20261031/next-mission-arrival/candidate/test/story-campaign47a-embodied-dialogue.test.mjs ./recovery-20261031/next-mission-arrival/candidate/test/pq-032-00-set-pieces.test.mjs ./recovery-20261031/next-mission-arrival/candidate/test/w533-books-0-2.test.mjs`

The loader uses the isolated candidate for the two changed source files, exact-843 unmodified copies for `missions.js`, `lootShards.js`, `cargoPayloadTypes.js`, and `scannerReadModel.js`, and the read-only sparse checkout for remaining dependencies. Key campaign route, Scale 4, and game-state/event-bus dependencies were hash-checked against 843. This is a focused overlay run, not a full-repository checkout.

Root integration repeat: the authored dialogue file, W533 Books 0–2 harness, and existing Garden/Nest
regressions passed together (13 Node test results, including W533's five in-file checks). Root also
repeated the candidate/control PQ run: both retained the same 3/4 result and unchanged B1 assertion.
Fresh master was rechecked at a7733759390fd7586107b6bfba6081cd4d904338 immediately before publication;
no intervening remote edits existed.

SF-WORLD-DIRECTION, SF-SECTOR-COHERENCE, SF-LIVING-WORLD and SF-GAME remain open. This extends
the player route from Helios through Tethys toward Ceres; it does not mark the whole route, rendered
experience, complete Save/Continue envelope, or broader game accepted.
