# FB-117 — A pad or touch player sees pad or touch prompts, from the tables that already exist

**Kind:** wire · **Lane:** THE HAND · **Routing:** open
**Seam tags:** seam: controlPrompts.js, seam: bindings.js, seam: onboarding.js
**Write-set:** `src/ui/controlPrompts.js`, `src/ui/bindings.js`, `src/systems/onboarding.js`, `test/fb-prompts-speak-device.test.mjs`
**Neighbours (extend, never restate):** SFQ-B224, NXI-003, NXI-220

## The gap
`CONTROL_PROMPTS` authors three full modality tables and `controlPrompt()` resolves them; no runtime caller
exists. `PAD_ACTION_FOR` maps four actions, so `promptLabel(action, 'gamepad')` falls back to keyboard labels
for every other verb, and `GAMEPAD_BUTTON_LABELS` is Xbox-only. A pad player is shown keyboard glyphs for the
whole Hand.

## Why this direction
Three device vocabularies exist and none is rendered; routing hints and prompts through
`currentPromptModality` is the wiring. A glyph-set setting (Xbox/PlayStation/Nintendo) is one table and one
key.

## Mechanism
- Call `controlPrompt(key, currentPromptModality(ctx))` inside `onboarding._showHint` and extend
  `PAD_ACTION_FOR` to every pad-routed verb.
- Add `+controls.gamepad.glyphSet` consumed by `gamepadGlyphForAction` with three label tables.
- Pin that the same hint renders three different strings under the three modalities and that the glyph set
  changes labels.

## Done when
`test/fb-prompts-speak-device.test.mjs`: three modalities, three strings; glyph set switches;
`pq-177-02-glyphs.test.mjs` stays green.

## Do not
Do not add a fourth modality. Do not change prompt copy. Do not redesign prompt chrome (ORRERY).

## Focus test starting points
- `test/pq-177-02-glyphs.test.mjs`
- `test/pq-164-01-glyphs-remap.test.mjs`
