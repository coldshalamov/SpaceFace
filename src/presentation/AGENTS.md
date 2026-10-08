# src/presentation/

Pure cue data and classifiers. Not a registered system. The system is `systems/presentationOrchestrator.js` plus `presentationAdapters.js`.

- `cueSchema.js`, `cueRecipes.js`, and `cueRecipesSignatures.js` are the envelope. `cueArbitration.js` reserves lanes; it does not sort. `*.none` is free. Camera reserve is 1.
- `causalVfxGrammar.js` is how contact happened. `render/forceLanguage/` is what acts.
- `vfxAdmissionPriority.js` takes priority from the receipt. Do not treat an event id as an entity id unless the cue has no lanes, budgets, or source event.
- `throttleAnswer.js` is the one throttle window for the idle cue and the plume.
- `flightOverheadMath.js` writes `state.render.slipstream` only. `releaseGhost.js` telemetry is not an impulse.
- `routeRibbon.js`, `wantedSearchVolume.js`, and `worldSiteDamageStates.js` are read-only.
- `capitalBossPresentation.js` is a canvas overlay. Clock and shapes come from the score. No Three.js. `restore()` must skip a beat id the score does not know.
- No `Math.random`, no DOM, no Three.js, no `entity.data` writes.
- Lane totals stay camera 3, vfx 8, audio 6, ui 6, a11y 6. Structural FX uses `admitStructuralFxCue` and does not charge those lanes.
- A cue file that imports `src/systems` or `src/render` is no longer pure.
