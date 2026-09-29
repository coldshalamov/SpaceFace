# FB-080 — The combat verb cue table dispatches every row it authors, with one writer per massline event

**Kind:** wire · **Lane:** THE EAR · **Routing:** open
**Seam tags:** seam: combatVerbCues.js, seam: audioSystem.js, seam: masslineInstrument.js
**Write-set:** `src/audio/combatVerbCues.js`, `src/audio/audioSystem.js`, `src/audio/masslineInstrument.js`, `test/fb-verb-cue-dispatch.test.mjs`

## The gap
`combatVerbRecipe` in `combatVerbCues.js` is called for six hardcoded ids; roughly 120 authored rows
(including `tether:whipSnap`, `tether:cutDenied`, `tether:lineControlDenied`) never play. The table reads as a
dispatcher and audits as coverage. Separately, `combatVerbCues.js` and `masslineInstrument.js` disagree on the
release/latch/break recipes, so two voices can answer one physical event.

## Why this direction
Renaming the table to a ledger was rejected: the authored rows are good work. A generic fan-out (the pattern
`actionVfx.js` and `vfx.js` already use for recipe tables) makes each row live once; rows whose event already
has a semantic-cue owner are marked SILENT with the reason, not deleted.

## Mechanism
- Iterate the table's ids with `bus.on` at audio init, skipping the six explicit handlers and any row whose
  event has a `presentationAdapters.js` owner (mark those SILENT with the owner named).
- Make `combatVerbCues.js` delegate the six massline events to `MASSLINE_RECIPES` in `masslineInstrument.js` so
  there is one writer.
- Pin a no-double-voice test: a scripted release, latch and break each produce exactly one recipe play.

## Done when
`test/fb-verb-cue-dispatch.test.mjs`: every non-SILENT row has a live subscription and each of the six
massline events plays exactly once on seed 4242; `combat-verb-cues.test.mjs` and `wave-c5-verb-cues.test.mjs`
stay green.

## Do not
Do not play both the raw and the semantic voice for one event. Do not add recipes. Do not touch the mining or
drill rows' SILENT reasons.

## Focus test starting points
- `test/combat-verb-cues.test.mjs`
- `test/wave-c5-verb-cues.test.mjs`
- `test/model-truth-verb-cues.test.mjs`
