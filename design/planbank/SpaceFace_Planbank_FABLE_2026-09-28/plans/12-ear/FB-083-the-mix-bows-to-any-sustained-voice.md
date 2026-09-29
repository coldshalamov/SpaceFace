# FB-083 — A high-importance cue ducks every sustained voice, not only the weapon and engine loops

**Kind:** polish · **Lane:** THE EAR · **Routing:** open
**Seam tags:** seam: cuePriorityBus.js
**Write-set:** `src/audio/cuePriorityBus.js`, `test/fb-priority-duck-sustained.test.mjs`
**Neighbours (extend, never restate):** SFQ-B195, NXB-052

## The gap
`PRIORITY_DUCK_THRESHOLD` 0.8 ducks only `weaponLoop` and `engineLoop` by −8 dB for 250 ms. Field hums, the
rope tone, the drill grind and the new cruise loop keep stacking under a critical cue. `isPriorityDuckTarget`
can already classify any loop voice by bus and category; the target set is the only thing narrow.

## Why this direction
A second ducker was rejected; one line of classification is the whole change.

## Mechanism
- Widen `isPriorityDuckTarget` to any voice flagged `loop === true` on the sfx, engine, combat or ambient buses;
  leave music, comms, ui and master unaffected as today.
- Keep the depth and duration constants; pin that the rope tone and a field loop duck and recover on schedule.

## Done when
`test/fb-priority-duck-sustained.test.mjs`: a critical cue during a live well, a taut rope and cruise ducks
all three and restores at 250 ms; music and comms are untouched; `inf-048-shield-duck.test.mjs` stays green.

## Do not
Do not duck music or speech. Do not change the threshold.

## Focus test starting points
- `test/inf-048-shield-duck.test.mjs`
