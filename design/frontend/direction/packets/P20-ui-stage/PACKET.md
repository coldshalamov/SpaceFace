```yaml
packet: P20
title: The UI stage — a lit world behind every screen, in the main renderer, with plate fallbacks
lane: CODE
tool: local (Codex gpt-5.6/gpt-6 or Grok 4.6 xhigh in an isolated checkout; the controller integrates)
dependsOn: [P01, P16]
current: [title, station-dock, crucible-door, pause]
inputs: [design/frontend/direction/approved/frame-title.png, design/frontend/direction/approved/frame-station-dock.png, design/frontend/direction/approved/frame-crucible-door.png]
returns: commits on a branch + receipt design/frontend/direction/receipts/P20-REPORT.md
mutex: [ui-stage, presentation-freeze]
```

# P20 — The UI stage

## Why this packet exists (read before touching anything)

Today **no screen has a world behind it**: `src/core/presentationFreeze.js:9-18` freezes world
submission on any non-empty screen stack, `screenManager.js:540-542` hard-wires `isLiveOverlay()`
to false, and the only 3D under a menu is a **second WebGL context** in `src/ui/shipPreviewMount.js`
(one hull + one dock GLB, fixed rig) that `secondaryPreviewWebGlBlocked` (`:49-77`) refuses on Intel
GPUs in flight or docked — the owner's own hardware. The committed title reference frame is black.
Every screen the art direction describes stands on a lit world, so this is leaf zero.

The freeze exists for a good reason ("a map that lets an off-screen enemy keep killing the player
is an ambush"). Keep that reason: **the simulation stays frozen; the picture does not.**

## Objective

1. **Gate zero:** the Title on the default route at 1920×1080 shows a lit, three-dimensional
   hangar with the hull in it (not an `<img>` of a PNG), and `capture-ui-matrix --world --only=title`
   proves it. Same for `station-dock` and `crucible-door`.
2. **One context.** A `uiStage` module in `src/render/` that lets the **main renderer** draw a
   *presentation scene* while the sim is frozen: `title-hangar` (P16 hangar + the starter hull),
   `berth` (P16 berth + the player's hull, while docked), `arena-foundry` (the Crucible door
   diorama), and `held-world` (the frozen flight picture, sharp, for pause/chart/ship in flight).
   Scene swap, slow authored camera drift, the P16 lighting; no second WebGL context on the
   default path.
3. **Plate fallback.** When the stage cannot run (context lost, blocked GPU, headless capture), the
   screen shows the matching P15 backdrop plate (or the P16 rendered still) so no screen is ever
   black. The fallback is authored and looks like the stage in a still.
4. **Orbit for THE SHIP / Shipworks** on the stage (yaw/zoom) without a second context; the old
   `shipPreviewMount` path remains only until P35 retires it.

## Write set

`src/core/presentationFreeze.js`, `src/core/renderUpdatePhase.js`, `src/render/uiStage.js` (new),
`src/render/renderer.js` (the hook only), `src/ui/screenManager.js` (stage requests per screen),
`src/ui/views/menuFrames.js`, `src/ui/screens/stageHull.js`, `src/ui/station/stationApp.js`
(berth), `src/ui/screens/crucible.js` (door stage request), `styles/kit.css` (stage/scrim
tokens), tests under `test/ui-stage*.test.mjs`. Do not touch `src/systems/*`, the sim, or
`shipPreviewMount.js` beyond a guard.

## Checks and evidence

`npm run check:baseline` · `node --test test/secondary-preview-webgl.test.mjs
test/first-flight-gpu-hold.test.mjs` · `npm run probe:runtime-witness` (no new hitches on the
flight route; the stage must cost nothing in flight) · `node scripts/capture-ui-matrix.mjs --world
--headed --only=title,station-dock,crucible-door,pause --out=.devshots/frontend/P20` at 1280/1920/2560
· the plate fallback exercised headless (`--only=title` without `--world` shows the plate, not
black).

## Acceptance

Gate zero holds at all three widths; the stage runs on the main context; a blocked-GPU path shows
the authored plate; flight frame cost unchanged within the runtime witness's noise; receipt with
the captures.

## The way this gets faked

A static PNG of a ship with `data-k-ready="1"`; a black canvas behind a screen; keeping the second
WebGL context and calling it the stage; unfreezing the simulation to get a moving picture.
