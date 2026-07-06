# ADR-0001: Three.js zero-build ESM + DOM-overlay UI + procedural Web Audio

- **Status:** Accepted (retroactive — documents a decision already in force)
- **Date:** 2026-06-17 (decision predates this record; see ARCHITECTURE.md §1)
- **Deciders:** SpaceFace lead / architecture contract
- **Tags:** engine, render, ui, audio, build

> Retroactive ADR: the stack below is **already implemented** across `src/` (84 files), `index.html`,
> `vendor/`, `styles/`, and the procedural audio system. This record captures *why*, so it isn't
> re-litigated.
>
> **Current status amendment (2026-07-04):** The player-facing target is PC/browser. Electron is an
> optional desktop distribution shell for the same route, and the production bundle is an output
> artifact, not a separate gameplay path.

---

## Context

A semi-3D top-down space trading/combat/mining game, built by a small team (and parallel agents)
targeting the PC browser first, with optional desktop packaging through the same route. Forces in
play:

- **Iteration speed over ceremony.** A build step (bundler, transpiler, asset pipeline) is friction
  on every edit and a barrier to parallel, single-responsibility file ownership.
- **No art/audio budget for assets.** The plan mandates *no external art assets* and *100%
  procedural audio* (ARCHITECTURE.md §1.1) — meshes from Three primitives, textures from runtime
  `<canvas>`, sound from the Web Audio graph.
- **A lot of 2D UI** (HUD, trade, starmap, tech tree, missions, settings) that must stay crisp and
  readable *through* screen shake and at any DPI.
- **Modern evergreen runtime only** (Chromium-class browsers and the optional Electron shell); no
  need to support legacy browsers, so native ES modules + importmaps are available in the dev route.

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
- **Static-served, optionally desktop-packaged.** A zero-dependency static server (`server.js`) for
  the primary browser route; an optional Electron shell (`electron/main.cjs`) serves the same
  player-facing route. Release builds may serve the minified `build/web/` bundle, but packaging must
  not change gameplay, settings defaults, assets, or feature reachability.

## Options considered

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **Zero-build ESM + Three + DOM UI + procedural audio** (chosen) | Instant iteration; trivial parallel file ownership; UI is just HTML/CSS (fast, accessible, DPI-crisp); source route stays simple; no required asset pipeline | Must vendor + pin Three by hand; production bundling can diverge if not tested; relies on importmap support in dev; ESM `.js`-extension discipline | **Chosen** — matches team size, zero-asset mandate, and the PC/browser path |
| Bundler (Vite/esbuild/Rollup) + Three | Tree-shaking, HMR, TS option | A build step on every change; bundling diverges dev from packaged output; heavier for parallel agents; unnecessary given Chromium-only target | Rejected — friction without payoff for this team/target |
| Canvas/WebGL UI (in-engine 2D, no DOM) | One render path; no DOM/WebGL split | Reimplements text/layout/focus/accessibility badly; unreadable under shake; far slower to build the large 2D UI surface | Rejected — DOM gives the UI for free |
| Game-engine runtime (Unity/Godot/Phaser) | Batteries included | Heavy, opinionated, harder zero-asset procedural pipeline; larger desktop build; less control over the exact render/UI split | Rejected — overkill; loses the zero-build simplicity |

## Consequences

- **Positive:** edit-refresh iteration with no build; clean single-responsibility files for parallel
  development; UI is standard, accessible, crisp HTML/CSS that survives screen shake; the dev page
  and the packaged page are the *same* page; no asset licensing/pipeline burden.
- **Negative / costs:** Three is vendored and version-pinned by hand (upgrades are manual); the
  browser source route is intentionally simple while production bundles must be checked for parity;
  the team must hold ESM discipline (explicit `.js`, importmap correctness).
- **Risks / follow-ups:** *Dev-vs-packaged divergence.* Because there is no bundler normalizing
  output, the dev static server (`server.js`) and the Electron in-process server
  (`electron/main.cjs`) are two hand-written servers with different origins and a packaged asset
  allowlist — so "works in the browser tab" does **not** prove "works in the desktop shell" when that
  shell is being shipped. This is the load-bearing reason the release QA matrix keeps an optional
  parity column (see `design/QA_MATRIX.md`, rows MIME-1 / ROUTE-1 / ASSET-1 / BOOT-1).
- **Reversal cost:** Moderate. Adopting a bundler later is additive (the ESM source already imports
  cleanly); the DOM-UI and procedural-audio decisions are deeper and would be expensive to reverse.

## References

- ARCHITECTURE.md §1 (Tech stack & render/UI composition), §1.2 (DOM layering), §1.3 (boot).
- `index.html` (importmap, `#gl-canvas` + `#ui-root` layering), `package.json` (`type:module`,
  Electron `main`, `build.files`), `server.js` + `electron/main.cjs` (the two static servers).
- design/V2_MASTER_PLAN.md (zero-build, procedural-only direction).
- Related: ADR-0002 (the save + offscreen-sim model that this stack hosts).
