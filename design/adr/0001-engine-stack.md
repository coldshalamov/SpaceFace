# ADR-0001: Three.js ESM + DOM-overlay UI + Web Audio

- **Status:** Accepted stack; media/asset restrictions amended by current architecture
- **Date:** 2026-06-17 (decision predates this record; see ARCHITECTURE.md §1)
- **Deciders:** SpaceFace lead / architecture contract
- **Tags:** engine, render, ui, audio, build

> Retroactive ADR: the stack below is **already implemented** across `src/`, `index.html`,
> `vendor/`, `styles/`, and the shared audio/media systems. This record captures *why*, so it isn't
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
- **Original no-art-budget phase.** This ADR was written when the plan mandated *no external art
  assets* and *100% procedural audio* (ARCHITECTURE.md §1.1) — meshes from Three primitives,
  textures from runtime `<canvas>`, sound from the Web Audio graph. That is now historical for
  fallback/prototype surfaces: the live game uses an authored GLB pipeline under `assets/ships/`
  and allows reviewed build-time or runtime dependencies when they improve
  quality without breaking determinism, perf, or browser/Electron parity.
- **A lot of 2D UI** (HUD, trade, starmap, tech tree, missions, settings) that must stay crisp and
  readable *through* screen shake and at any DPI.
- **Modern evergreen runtime only** (Chromium-class browsers and the optional Electron shell); no
  need to support legacy browsers, so native ES modules + importmaps are available in the dev route.

## Decision

We build on a native-ESM Three.js stack with DOM/CSS overlay UI and Web Audio, served directly in
development and bundled for release. Authored and procedural media are both supported. Specifically:

- **Three.js r0.160**, vendored at `vendor/three.module.js` (+ `vendor/addons/`), loaded via a
  `<script type="importmap">` in `index.html` (`"three" → "./vendor/three.module.js"`). No bundler,
  no transpile; `package.json` is `"type":"module"` and files import each other with explicit `.js`
  extensions.
- **DOM overlay for interactive UI.** `index.html` layers a single `#gl-canvas` (WebGL) under a
  `pointer-events:none` `#ui-root` whose interactive children opt back in; the *only* 3D→DOM bridge
  is `render.worldToScreen(vec3)` (ARCHITECTURE.md §1.2). Interactive text remains DOM-owned;
  decorative world-space labels may exist when they have an accessible equivalent and measured cost.
  Screen shake moves only the camera, so the HUD stays readable.
- **Hybrid media behind common runtime seams.** Web Audio owns playback/mixing and supports both
  synthesis and licensed authored sources. The renderer supports production GLB/KTX2 assets plus
  procedural dressing/fallbacks. Media technique is selected by player-facing quality, provenance,
  memory/performance, and maintenance evidence.
- **Static-served, optionally desktop-packaged.** A zero-dependency static server (`server.js`) for
  the primary browser route; an optional Electron shell (`electron/main.cjs`) serves the same
  player-facing route. Release builds may serve the minified `build/web/` bundle, but packaging must
  not change gameplay, settings defaults, assets, or feature reachability.

## Options considered

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **Zero-build ESM + Three + DOM UI + Web Audio** (chosen) | Instant iteration; clear module ownership; UI is accessible and DPI-crisp; source route stays simple; authored and procedural media share one runtime path | Must vendor + pin Three by hand; production bundling can diverge if not tested; relies on importmap support in dev; ESM `.js`-extension discipline | **Chosen** — matched the PC/browser path and remains compatible with the production asset/audio pipelines added later. |
| Bundler (Vite/esbuild/Rollup) + Three | Tree-shaking, HMR, TS option | A build step on every change; bundling diverges dev from packaged output; heavier for parallel agents; unnecessary given Chromium-only target | Rejected — friction without payoff for this team/target |
| Canvas/WebGL UI (in-engine 2D, no DOM) | One render path; no DOM/WebGL split | Reimplements text/layout/focus/accessibility badly; unreadable under shake; far slower to build the large 2D UI surface | Rejected — DOM gives the UI for free |
| Game-engine runtime (Unity/Godot/Phaser) | Batteries included | Heavy, opinionated, harder zero-asset procedural pipeline; larger desktop build; less control over the exact render/UI split | Rejected — overkill; loses the zero-build simplicity |

## Consequences

- **Positive:** edit-refresh iteration with no build; clean single-responsibility files for parallel
  development; UI is standard, accessible, crisp HTML/CSS that survives screen shake; the dev page
  and the packaged page are the *same* player route; authored and procedural media can be selected
  per result instead of by a global source restriction.
- **Negative / costs:** Three is vendored and version-pinned by hand (upgrades are manual); the
  browser source route is intentionally simple while production bundles must be checked for parity;
  the team must hold ESM discipline (explicit `.js`, importmap correctness).
- **Risks / follow-ups:** *Dev-vs-packaged divergence.* The source and bundled outputs still need
  parity tests. Browser and Electron launchers now share `scripts/lib/gameServer.cjs`; serving or MIME
  behavior belongs there rather than in duplicated launcher code. Player-route acceptance must still
  cover every distribution path being shipped.
- **Reversal cost:** Moderate. Adopting a bundler later is additive (the ESM source already imports
  cleanly); the DOM-UI and Web Audio ownership seams are deeper and would be expensive to reverse.

## References

- ARCHITECTURE.md §1 (Tech stack & render/UI composition), §1.2 (DOM layering), §1.3 (boot).
- `index.html` (importmap, `#gl-canvas` + `#ui-root` layering), `package.json` (`type:module`,
  Electron `main`, `build.files`), `server.js` + `electron/main.cjs` (the two static servers).
- Related: ADR-0002 (the save + offscreen-sim model that this stack hosts).
