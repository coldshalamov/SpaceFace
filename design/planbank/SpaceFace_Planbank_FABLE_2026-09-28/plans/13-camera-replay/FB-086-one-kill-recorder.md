# FB-086 — One tape records the fight: the two-body kill ring retires in favour of the killcam tape

**Kind:** build · **Lane:** THE FIGHT · **Routing:** open
**Seam tags:** seam: killReplay.js, seam: killcamTape.js, seam: crucible.js
**Write-set:** `src/systems/killReplay.js`, `src/sim/killcamTape.js`, `src/ui/screens/crucible.js`, `src/core/registry.js`, `test/fb-one-kill-recorder.test.mjs`
**Neighbours (extend, never restate):** SFQ-B058

## The gap
Two recorders run every Crucible tick: `killReplay.js` keeps a 2-body 300-sample ring (player plus nearest
other) and `killcamTape.js` keeps 48 ships / 128 rounds / 96 flashes. The results screen plays the 2-dot ring
via `killReplayActions` while the richer tape is staged by `killcamStage.js` elsewhere on the same screen. Two
costs, one of which shows a fight.

## Why this direction
Keeping both was rejected (perf is design). The tape is richer and already staged; pointing the results action
at `takeKillcamTape` and deleting the ring removes a table-clock owner.

## Mechanism
- Point `killReplayActions` in `crucible.js` at the killcam tape request (`killcamStageRequestFor`); remove the
  `killReplay` registration from `src/core/registry.js` and the system file.
- Make sure the tape's clear-on-`run:started` and reduced-motion freeze rules cover the results replay case.
- Pin that the results replay for a seed-4242 death shows ≥ 3 ships when three were present.

## Done when
`test/fb-one-kill-recorder.test.mjs` pins the replay source and ship count; `killcam-tape.test.mjs` stays
green; `wave-b9-kill-replay.test.mjs` is updated to the tape or retired with its reason in the commit; one
fewer table-clock owner in the manifest.

## Do not
Do not add a third recorder. Do not keep the ring "for safety". Do not touch the 30 s input-tape replay in
`replay.js`.

## Focus test starting points
- `test/killcam-tape.test.mjs`
- `test/wave-b9-kill-replay.test.mjs`
- `test/crucible-results.test.mjs`
