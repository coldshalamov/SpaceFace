```yaml
session: S4
title: The engine port — the prototype ported into the game's own modules against a pinned commit
tool: ChatGPT 6 Pro — JS/CSS engineering in the VM, running the repository's static checks
dependsOn: [S3]
phases: [P20, P21, P22, P30, P31, P32, P33, P34, P35, P36, P37, P38]
current: [title, flight, station-market, chart-galaxy]
inputs: [.devshots/ui-packets/returns/S3-return/]
source: [index.html, package.json, src/ui/, styles/, src/core/presentationFreeze.js, src/core/renderUpdatePhase.js, src/data/audioRecipes.js, src/audio/synth.js, src/audio/audioSystem.js, scripts/check-type-floor.mjs, scripts/check-colour-tokens.mjs, scripts/check-ui-screen-imports.mjs, scripts/check-command-deck-ui.mjs, scripts/ui-grammar-thresholds.mjs, scripts/ui-grammar-surfaces.mjs, scripts/check-asset-reachability.mjs, scripts/lib/]
returns: S4-return.zip
```

# S4 — The engine port

## What this session is

You port the finished prototype (S1–S3) into SpaceFace's own front-end modules. `source/` is a
snapshot of the repository's UI code at the commit stamped in `README.txt`; `inputs/S3-return/` is
the prototype with `HANDOFF_TO_ENGINE.md`. Your GitHub connector can read any further file by
path **at that commit** (name the SHA in every request) and can open a pull request; it cannot
clone the repository, which is why the snapshot is in the zip. You have no game runtime here — no
WebGL, no simulation — so the discipline is: **keep every contract the modules already honour,
change the DOM and CSS to the prototype's, and leave the repository's own static checks green.** A
local lane integrates your return, runs the game, captures every screen with the world, and fixes
what only a runtime can reveal.

**Delivery.** Return the port two ways: (1) a branch `chatgpt/s4-engine-port` from the stamped
commit with one commit per phase and a pull request against `master` titled "S4 — engine port
(unverified at runtime)", opened through the connector; (2) the zip below with the same full files
and patch, in case the connector fails. The repository also carries an "agent code packet"
GitHub Actions workflow; if the connector surfaces it, use it as its documentation says. Never
push to `master` directly.

## What you must know about the code (audited 2026-09-10)

- Screens are duck-typed objects registered from `src/ui/uiRoot.js` (`SCREEN_MODULES`) into
  `src/ui/screenManager.js`, which mounts `div.screen[data-screen]` inside `#screens`. Kit screens
  add the `k-screen` class; the manager switches them to `display: grid`.
- The station is one screen (`src/ui/station/stationScreen.js` + `stationApp.js`) with destination
  panels under `src/ui/station/screens/` (`market.js`, `shipworks.js`, `industry.js`, `contracts.js`,
  `factions.js`, `bar.js`, `ledger.js`). `styles/station.css` is loaded lazily by `stationApp.js`.
- The HUD is `src/ui/hud.js` (4,661 lines) with its CSS in `src/ui/views/hudStyles.js` (a
  template literal) plus six `<style>` nodes it injects; the radar is two 2D canvases in
  `src/ui/radar.js`; the action bar is `src/ui/powerRail.js` (**never add
  `requestAnimationFrame` there** — its header says why; keep the `hud:slotClaim` /
  `hud:slotRelease` contract); the sector-law block is built by `src/ui/sectorLawPresenter.js`.
- The chart is `src/ui/galaxyMap.js` (~11k lines, canvas 2D). Port its **shell** (lens keys,
  scope keys, inspector plate, cargo tape) and its canvas typography via `src/ui/canvasFonts.js`;
  the field drawing is a separate patch file so the local lane can land it independently.
- Tokens: `styles/kit.css` (`--k-*`); fonts: `styles/fonts.css` (absolute `/styles/fonts/…` URLs are
  correct — Electron serves over http). The 18 `MIGRATED_SCREENS` in
  `source/scripts/check-ui-screen-imports.mjs` **must not** declare `STYLE_ID` or inject a
  `<style>`; their CSS lives in `styles/`.
- Icons: `src/ui/station/icons.js` (inline SVG strings, 36 glyphs + 14 crests) and `src/ui/glyphs.js`
  (path arrays for canvas). Keep both APIs; retarget them to the new family.
- The capture harness reaches screens by the selectors in `source/scripts/ui-grammar-surfaces.mjs`
  (for example `[data-screen="mainMenu"] [data-action="crucible"]`). **Keep every `data-*` hook
  that file names**, or the surface becomes unreachable to the matrix.
- Audio is 100 % synthesised: recipes in `src/data/audioRecipes.js`, cue map
  `AUDIO_CUE_TO_RECIPE` in `src/audio/audioSystem.js`; the kit's cue names live in
  `src/ui/kit/sound.js`.
- **No screen has a live world behind it by design**: `src/core/presentationFreeze.js` freezes
  world submission on any screen stack. Your stage module is a **draft** the local lane verifies
  with the runtime witness; do not unfreeze the simulation.

## Phases

### Phase 0 — Read and map

Read `HANDOFF_TO_ENGINE.md`, then the modules named above. Write `PORT_MAP.md`: for every
prototype screen, the module(s) that own it, the DOM hooks and ARIA roles that must survive, the
checks that assert on it, and your plan. Verify the checks run: `node source/scripts/check-type-floor.mjs`
etc. from the `source/` root (they read relative paths; run them with `source/` as the working
directory; if one needs a helper not in the snapshot, record it — do not stub it).

### Phase 1 — The kit runtime — spec `phases/P21.md`

`styles/fh.css` (the prototype's, adapted to the module DOM), `styles/hud.css` (new — the HUD's
CSS moves here section by section from `hudStyles.js`), `src/ui/kit/assets.js` (manifest → CSS
custom properties for `border-image` sources and slices; icon sprite injection; `plate()`,
`sprite()`, `icon()`, `mark()`, `glyphPath()`), `styles/kit.css` tokens replaced by the Field
Hardware tokens, `styles/fonts.css` with Archivo, `src/ui/kit/motion.js` and `sound.js` replaced by
the prototype's (adapted to modules), recipes merged into `audioRecipes.js` and the cue map. Add
`kit.css`, `fh.css`, `hud.css` to the `LIVE` lists in `check-type-floor.mjs` and
`check-colour-tokens.mjs`. Asset paths point at `assets/ui/kit/…` (the local lane copies the
accepted kits there; the S3 return's `assets/` folder is the reference layout). Checkpoint.

### Phase 2 — The shell and the modes — specs `phases/P22.md`, `P37.md`, `P30.md`

`mainMenu.js`, `newGame.js`, `pause.js`, `settings.js`, `saveLoad.js`, `gameOver.js`,
`credits.js`, the Crucible modules (`crucible.js`, `crucibleDraft.js`, `crucibleFocus.js`),
`views/menuFrames.js` (the title's world container becomes the stage mount from Phase 5, with the
S1 plate as the fallback image). Checkpoint.

### Phase 3 — The station and THE SHIP — specs `phases/P33.md`, `P34.md`, `P35.md`

`stationApp.js`/`stationScreen.js` (arrival, destinations as keys, vitals plate), the seven
destination panels, `src/ui/ship/shipScreen.js` presentation, `station/screens/shipworks.js`
presentation (the shared stage's host node stays; its skin changes). `styles/station.css` shrinks
as rules move to `fh.css`. Checkpoint.

### Phase 4 — The HUD and the reading screens — specs `phases/P31.md`, `P32.md`, `P38.md`, `P36.md`

`hud.js` instrument sections (speed gauge, ship block, sockets via `powerRail.js` skin, status
strip, objective plate, comms tape, rightdock: contacts, target panel, sector-law badge),
`radar.js` drawing on the same canvases with the P12 bezel/face assets and `glyph-paths.json`,
`uiRoot.js` reticle SVG; `missionLog.js`, `codex.js`, `help.js`, `techTree.js`; the chart shell in
`galaxyMap.js` and a separate `patches/chart-field-drawing.diff`. Checkpoint.

### Phase 5 — The stage draft — spec `phases/P20.md`

`src/render/uiStage.js` (new): a presentation-scene manager the main renderer can draw while the
simulation is frozen — scenes `title-hangar`, `berth`, `arena-foundry`, `held-world` — with a
documented hook for `renderUpdatePhase.js` and a `presentationFreeze.js` change that distinguishes
"freeze the simulation" from "freeze the picture". Plate fallback when the stage is unavailable.
Mark the whole phase **UNVERIFIED — runtime witness required** in `NOTES.md`. Checkpoint.

### Phase 6 — Checks, patch, package

`node --check` on every changed file; run the four static checks and `check-asset-reachability`
from `source/`; fix until green or record the exact failure. Produce `patch/S4.diff` (unified,
against the stamped commit) **and** the full changed files under `files/` with their repository
paths; `PORT_MAP.md` final; `NOTES.md` with `UNVERIFIED` (everything a runtime must confirm),
`CONTRACTS_KEPT` (the list above, ticked), `MISSING`.

## Return contract

```
S4-return/
  PLAN.md · PROGRESS.md · NOTES.md · QA.md · PORT_MAP.md · manifest.json
  files/<repo path>       every changed or new file, full content
  patch/S4.diff           unified diff against the stamped commit
  patch/chart-field-drawing.diff
  checks/                 the output of every check you ran, verbatim
```

## Definition of done

Every screen in `HANDOFF_TO_ENGINE.md` has a ported module; the four static checks and the asset
reachability check pass from `source/` with your files applied; no migrated screen injects a
style; every `data-*` hook in `ui-grammar-surfaces.mjs` survives; the Power Rail has no rAF; the
patch applies cleanly to the stamped commit (`git apply --check` in your VM if git is available);
`NOTES.md` is honest about what a runtime must verify.

## The way this session gets faked

Restyling the existing DOM with a plate background; leaving the old CSS in place and adding
`fh.css` on top; a stage module that unfreezes the sim; a patch that does not apply; checks
"passed" without their output in `checks/`.
