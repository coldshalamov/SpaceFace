# `src/ui/kit/` — the frontend kit's JS

Authority: `design/frontend/direction/DIRECTION_SHEET.md`, then `design/frontend/direction/KIT_SPEC.md`.
The CSS half is `styles/kit.css` (linked last in `index.html`). Screens import from `./index.js`.

| Module | Spec | What it does |
|---|---|---|
| `motion.js` | §7 | `settle`, `stamp`, `cut`, `reducedMotion`. Every settle is 140 ms, named by the state that started it, cancellable; reduced motion (`html.sf-reduce-motion` or the system setting) is a plain cut. |
| `temperature.js` | §5 | `setTemperature`, `deriveTemperature`, `bindTemperature`. Reads `document.body.dataset.kScreen` (written by `screenManager.syncVisibility`), `state.player.heat` (wanted at 0.15), `state.ui.docked`, `state.run.kind/phase` (the Crucible run owner — not the spec's illustrative `state.crucible.run`), `state.mode`. Writes only `html[data-k-temp]`. |
| `sound.js` | §8 | `bindSound(bus)`, `cue(name)` → `bus.emit('audio:cue', { id, gain })` with the ids the audio system already maps. No context, no files, no new ids; the eight UI recipes live in `src/data/audioRecipes.js`. |
| `dom.js` | §6.5 | `el`, `words`, `rows`, `table`, `hero`, `title` builders with component-scoped roving focus and the kit cues. |
| `lab.js` | §10 | Renders the kit page (`_kitlab.html`, also `_uilab.html`); no game code. |

`ui.init` (`src/ui/uiRoot.js`) calls `bindSound(ctx.bus)` and `bindTemperature(ctx.bus, ctx.state)`
once. A screen never sets the temperature or injects CSS. Tests: `test/kit.test.mjs`.
