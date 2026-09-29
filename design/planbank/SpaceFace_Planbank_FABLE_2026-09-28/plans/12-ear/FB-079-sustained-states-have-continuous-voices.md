# FB-079 — Cruise, a live well, and a loaded tow each have a continuous voice that dies with the state

**Kind:** build · **Lane:** THE EAR · **Routing:** open
**Seam tags:** seam: audioSystem.js, seam: bombAudio.js, seam: masslineInstrument.js
**Write-set:** `src/audio/audioSystem.js`, `src/audio/bombAudio.js`, `src/audio/masslineInstrument.js`, `test/fb-continuous-voices.test.mjs`
**Neighbours (extend, never restate):** SFQ-B194, NXB-052, NXI-208, SF-230

## The gap
Cruise is the longest-held player state and has only a one-shot on engage; `sfx.cruiseEngaged` is authored,
sample-bound to the thrust loop, and one of four recipes with no reference. A gravity well plays
`sfx_field_deploy_well` once and nothing sustains while it is live. Towing a reactor under load is silent
while `sfx_tether_strain_creak` and `resolveTetherTone` exist. Adjacent to SF-230 (one field heard through
force direction); this is the sustain, not the direction.

## Why this direction
New loops were rejected; every voice here is authored. `bombAudio.js` already runs entity-lifetime field loops
that die on the entity (`bombFieldLoopEnvelope`, capped at eight), and the rope tone is the reference
continuous voice. Reuse both patterns.

## Mechanism
- Start `sfx.cruiseEngaged` as a loop on `cruise:engaged`, stop within one tick on
  `cruise:dropped`/`cruise:snared`; gain follows `stepCueGain` so zero throttle is silent by contract.
- Run well/repulsor/cone as `bombAudio`-style entity loops keyed on the field id, dying on `fields:ended`; hold
  under the same eight-loop cap.
- Feed the tow's load into `resolveTetherTone` as strain so a heavy tow creaks and a slack line is silent.

## Done when
Seed 4242 script (cruise 10 s, deploy a well, tow a wreck): the audio record shows three loops starting and
stopping on their edges with silence at 0; `test/fb-continuous-voices.test.mjs` pins start/stop ticks;
`cv-ear-field-deploy-voices.test.mjs` and `pq-158-02-massline-instrument.test.mjs` stay green.

## Do not
Do not fade instead of stopping. Do not exceed the loop cap. Do not add a voice that continues after the state
ends.

## Focus test starting points
- `test/cv-ear-field-deploy-voices.test.mjs`
- `test/pq-158-02-massline-instrument.test.mjs`
