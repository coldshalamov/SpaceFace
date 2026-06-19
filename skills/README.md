# SpaceFace Skills

These skills were vendored for SpaceFace on 2026-06-17 to support continued work on the space trading, combat, mining, economy, mission, progression, UI, QA, and desktop packaging direction already present in this repository.

SpaceFace uses Three.js for rendering, but the game is not "just Three.js." The skills here are split between renderer/runtime help and broader game-design/production help.

Three.js source: https://github.com/majidmanzarpour/threejs-game-skills  
Three.js source commit checked before install: `2215fd7c28ce55cee6a593ba1e422485db42498f`

Game production source: https://github.com/AlterLab-IEU/AlterLab_GameForge  
Game production source commit checked before install: `5f5148d61986b32299070e87fcd4a1ab3718eacf`

The upstream licenses and READMEs are preserved as `UPSTREAM_LICENSE`, `UPSTREAM_README.md`, `UPSTREAM_LICENSE_GAMEFORGE`, and `UPSTREAM_README_GAMEFORGE.md`.

## Game Design And Production Skills

- `game-designer`: Use for core loop clarity, player motivation, progression shape, feature priority, and turning design intent into concrete game rules.
- `game-economy-designer`: Use for commodity prices, supply/demand, money sinks, passive income caps, trade-route profitability, inflation risk, and progression pacing.
- `game-narrative-director`: Use for factions, story spine, mission flavor, player motivation, and making SpaceFace's world feel coherent instead of just data-rich.
- `game-technical-director`: Use for architecture decisions, module boundaries, performance risk, save compatibility, Electron packaging risk, and implementation sequencing.
- `game-ux-designer`: Use for HUD readability, station workflows, starmap ergonomics, onboarding, settings, feedback, and reducing menu friction.
- `game-accessibility-specialist`: Use for readable UI, color/contrast, input remapping, motion sensitivity, cognitive load, and inclusive playtesting.
- `game-balance-check`: Use for ship/module/weapon tuning, mission rewards, mining yield, economy pacing, enemy difficulty, and passive-vs-active income balance.
- `game-playtest`: Use for structured test scripts, first-session flow, fun/friction notes, regression checks, and player-facing verification.
- `game-analytics-setup`: Use for deciding what telemetry or local instrumentation would reveal about retention, difficulty, loops, and economy health.
- `game-code-review`: Use for game-specific review of systems, data catalogs, save migrations, performance-sensitive loops, and release risk.

## Three.js Renderer And Asset Skills

- `threejs-game-director`: Use as the entrypoint for broad SpaceFace feature, polish, or release work that spans gameplay, rendering, UI, QA, and assets.
- `threejs-gameplay-systems`: Use for flight feel, combat, mining, economy-loop tuning, AI behavior, mission flow, and fixed-timestep system work.
- `threejs-aaa-graphics-builder`: Use for improving the primitive-based ship/station/asteroid/VFX look without losing browser performance.
- `threejs-game-ui-designer`: Use for HUD, station screens, star map, tech tree, outfitting, settings, and desktop-safe overlay polish.
- `threejs-debug-profiler`: Use when frame rate, draw calls, scene size, input, resize, canvas, or Three.js runtime issues appear.
- `threejs-qa-release`: Use for playtest matrices, canvas screenshot checks, browser/Electron release readiness, and packaging risk reports.
- `threejs-image-generator`: Use for concept sheets, UI icons, title art, decals, texture references, and images that can feed 3D generation.
- `threejs-3d-generator`: Use for model generation or conversion workflows if SpaceFace moves beyond purely procedural primitive assets.
- `threejs-audio-generator`: Use for weapon, mining, UI, ambience, ship, station, and voice/stinger audio asset workflows.

## SpaceFace Notes

- Prefer SpaceFace's current zero-build ES module setup, `vendor/three.module.js`, data catalogs, single flat `GameState`, event bus, and fixed-timestep loop unless a task explicitly calls for a larger architecture change.
- Keep generated assets out of client-side secrets and do not store provider API keys in this repo.
- Before claiming a game-facing change is complete, verify with the existing checks in `package.json` and, when visual behavior is involved, run a live browser or Electron pass.
