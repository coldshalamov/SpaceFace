# ADR-0001: Three.js zero-build ESM + DOM-overlay UI + procedural Web Audio

- **Status:** Accepted (retroactive — documents a decision already in force)
- **Date:** 2026-06-17 (decision predates this record; see ARCHITECTURE.md §1)
- **Deciders:** SpaceFace lead / architecture contract
- **Tags:** engine, render, ui, audio, build

> Retroactive ADR: the stack below is **already implemented** across `src/` (84 files), `index.html`,
> `vendor/`, `styles/`, and the procedural audio system. This record captures *why*, so it isn't
> re-litigated.

---

## Context

A semi-3D top-down space trading/combat/mining game, built by a small team (and parallel agents)
targeting the browser first and **Steam via Electron** later. Forces in play:

- **Iteration speed over ceremony.** A build step (bundler, transpiler, asset pipeline) is friction
  on every edit and a barrier to parallel, single-responsibility file ownership.
- **No art/audio budget for assets.** The plan mandates *no external art assets* and *100%
  procedural audio* (ARCHITECTURE.md §1.1) — meshes from Three primitives, textures from runtime
  `<canvas>`, sound from the Web Audio graph.
- **A lot of 2D UI** (HUD, trade, starmap, tech tree, missions, settings) that must stay crisp and
  readable *through* screen shake and at any DPI.
- **Modern evergreen runtime only** (Chromium via Electron); no need to support legacy browsers, so
  native ES modules + importmaps are available without a bundler.

## Decision

We will build on a **zero-build, native-ESM Three.js r0.160 stack**, with **all UI as a DOM/CSS
overlay** and **100% procedural Web Audio**, served as plain static files. Specifically:

- **Three.js r0.160**, vendored at `vendor/three.module.js` (+ `vendor/addons/`), loaded via a
  `<script type="importmap">` in `index.html` (`"three" → "./vendor/three.module.js"`). No bundler,
  no transpile; `package.json` is `"type":"module"` and files import each other with explicit `.js`
  extensions.
- **DOM overlay for ALL UI.** `index.html` layers a single `#gl-canvas` (WebGL) under a
  `pointer-events:none` `#ui-root` whose interactive children opt back in; the *only* 3D→DOM bridge
  is `render.worldToScreen(vec3)` (ARCHITECTURE.md §1.2). No 3D text. Screen shake moves only the
  camera, so the HUD stays readable.
- **Procedural everything for media.** Audio is synthesized at runtime (Web Audio graph,
  AudioContext resumed on first user gesture); meshes are Three primitives; textures are generated on
  `<canvas>`. No audio/image files are required for the game to run.
- **Static-served, Electron-packaged.** A zero-dependency static server (`server.js`) for dev; the
  same files packaged into Electron (`electron/main.cjs`) for the Steam build — *the page is
  identical in both* because nothing is bundled or rewritten.

## Options considered

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **Zero-build ESM + Three + DOM UI + procedural audio** (chosen) | Instant iteration; trivial parallel file ownership; UI is just HTML/CSS (fast, accessible, DPI-crisp); page is byte-identical dev↔packaged; no asset pipeline | Must vendor + pin Three by hand; no tree-shaking/minify; relies on importmap support; ESM `.js`-extension discipline | **Chosen** — matches team size, zero-asset mandate, and Steam-via-Electron path |
| Bundler (Vite/esbuild/Rollup) + Three | Tree-shaking, HMR, TS option | A build step on every change; bundling diverges dev from packaged output; heavier for parallel agents; unnecessary given Chromium-only target | Rejected — friction without payoff for this team/target |
| Canvas/WebGL UI (in-engine 2D, no DOM) | One render path; no DOM/WebGL split | Reimplements text/layout/focus/accessibility badly; unreadable under shake; far slower to build the large 2D UI surface | Rejected — DOM gives the UI for free |
| Game-engine runtime (Unity/Godot/Phaser) | Batteries included | Heavy, opinionated, harder zero-asset procedural pipeline; larger Steam build; less control over the exact render/UI split | Rejected — overkill; loses the zero-build simplicity |

## Consequences

- **Positive:** edit-refresh iteration with no build; clean single-responsibility files for parallel
  development; UI is standard, accessible, crisp HTML/CSS that survives screen shake; the dev page
  and the packaged page are the *same* page; no asset licensing/pipeline burden.
- **Negative / costs:** Three is vendored and version-pinned by hand (upgrades are manual); no
  minification/tree-shaking (acceptable for a desktop Steam title, not a bandwidth-sensitive web
  app); the team must hold ESM discipline (explicit `.js`, importmap correctness).
- **Risks / follow-ups:** *Dev-vs-packaged divergence.* Because there is no bundler normalizing
  output, the dev static server (`server.js`) and the Electron in-process server
  (`electron/main.cjs`) are two hand-written servers with **different MIME/route tables and a
  different origin** — so "works in the dev tab" does **not** prove "works in the shipped binary."
  This is the load-bearing reason the release QA matrix has **two columns** and insists on running
  the real binary (see `design/QA_MATRIX.md`, rows MIME-1 / ROUTE-1 / ASSET-1 / BOOT-1).
- **Reversal cost:** Moderate. Adopting a bundler later is additive (the ESM source already imports
  cleanly); the DOM-UI and procedural-audio decisions are deeper and would be expensive to reverse.

## References

- ARCHITECTURE.md §1 (Tech stack & render/UI composition), §1.2 (DOM layering), §1.3 (boot).
- `index.html` (importmap, `#gl-canvas` + `#ui-root` layering), `package.json` (`type:module`,
  Electron `main`, `build.files`), `server.js` + `electron/main.cjs` (the two static servers).
- design/V2_MASTER_PLAN.md (zero-build, procedural-only direction).
- Related: ADR-0002 (the save + offscreen-sim model that this stack hosts).
