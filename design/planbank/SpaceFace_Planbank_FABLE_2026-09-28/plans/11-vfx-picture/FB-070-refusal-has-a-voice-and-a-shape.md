# FB-070 — Every refusal the player causes has one voice and one withdrawal shape

**Kind:** wire · **Lane:** THE PICTURE · **Routing:** open
**Seam tags:** seam: combatVerbCues.js, seam: causalVfxGrammar.js, seam: actionEventRecipes.js
**Write-set:** `src/audio/combatVerbCues.js`, `src/audio/audioSystem.js`, `src/presentation/causalVfxGrammar.js`, `src/render/vfx/actionEventRecipes.js`, `test/fb-refusal-voice-shape.test.mjs`
**Neighbours (extend, never restate):** SFQ-I078, SFQ-I009, NXI-046

## The gap
`sfx_massline_deny` is authored in `src/data/audioRecipes.js` and referenced only by `minimalActionAudio.js`.
The denial receipts `tether:latchDenied`, `tether:cutDenied`, `tether:lineControlDenied` are `SILENT(...)`
rows in `combatVerbCues.js`; `massSeed:deployDenied`, `fields:deployDenied`, `bombs:denied`, `beam:denied`,
`countermeasure:denied` are emitted with no listener at all. `CAUSAL_VFX_GRAMMAR` has eight families and none
for refusal. A refused verb produces nothing.

## Why this direction
A UI error toast was rejected (the refusal is a world fact at the ship, not a menu fact). The deny recipe
exists; the grammar's `reaction` family already has a `delayed-inward-out` motion whose inverse is a
withdrawal. One family, one recipe, eight events.

## Mechanism
- Add a ninth causal family `refusal` (silhouette: a short retraction toward the hull, no burst) with
  reduced-count variants, and one `actionEventRecipes` row per denial event keyed to it.
- Route all eight denial events to `sfx_massline_deny` on the world register (not `sfx_ui_error`), with the same
  40 ms per-source admission `hitVoice.js` uses so a held key cannot machine-gun the voice.
- Carry the refusal reason in the payload so the existing latch-deny caption
  (`test/wave-g2-latch-deny-cue.test.mjs` pins the cue) reads the reason word, never a generic "denied".

## Done when
Seed 4242 scripted denials (latch out of range, seed deploy in a field, bomb with empty rack, beam without
power): each fires exactly one `sfx_massline_deny` and one refusal-family VFX record; no double voice with the
UI deny; `test/fb-refusal-voice-shape.test.mjs` pins all eight.

## Do not
Do not add a new sound asset. Do not answer refusal with camera shake or particles. Do not change any denial
rule itself.

## Focus test starting points
- `test/wave-g2-latch-deny-cue.test.mjs`
- `test/combat-verb-cues.test.mjs`
- `test/world-cue-recipes.test.mjs`
