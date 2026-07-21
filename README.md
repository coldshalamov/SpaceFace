# SpaceFace

A semi‑3D, top‑down space game for desktop — fly a ship, **mine** asteroids, **trade** on a living supply/demand economy, **fight** pirates, **upgrade** your ship and modules, **jump** between sectors, take **missions**, and build **passive income** (drones, hired traders, outposts) that grows while you play. Inspired by *Freelancer*, *Endless Sky*, *Star Valor*, *Rebel Galaxy*, and the *X* series.

Built with **Three.js** (true 3D meshes under a tilted top‑down camera), release-authored GLB ship parts, procedural world dressing/VFX, a DOM/CSS overlay UI, and a Web Audio mix that supports both synthesis and licensed authored sources.

---

## Quick start

Requires **Node.js** (used only for a tiny zero‑dependency static server).

```bash
node server.js
```

Then open **http://localhost:8123/** in a normal browser tab. That's it — no install, no build step.

> Tip: keep the tab focused. Browsers pause the animation loop in fully hidden/background tabs.

### Launch policy

Browser (`http://localhost:8123/`), Electron dev (`npm run electron`), and packaged desktop builds must boot the same player-facing game: same `src/main.js` entry, same `createGameState()` defaults, same systems, same default settings, and the same release-authored ship assets. Query-string entries such as debug probes and capture tools are tooling only; they cannot be required to see normal assets or features.

Source GLBs under `assets/ships/parts/` are authoring/build inputs. Normal play uses the release-authored runtime assets under `assets/ships/release/parts/` in both browser and desktop.

### Controls
| Action | Key |
|---|---|
| Move / strafe | **W A S D** |
| Aim | **Mouse** |
| Fire weapons | **Left‑mouse / Space** |
| Mining beam | **Right‑mouse** (hold, near an asteroid) / **LT** on gamepad |
| Afterburner | **Shift** / **RB** on gamepad |
| Countermeasure | **X** / **R3** on gamepad |
| Dock | **E** when the dock prompt shows; **Enter** is a secondary key |
| Star map | **M** | · Tech tree **T** · Missions/journal **J** |
| Codex | **K** |
| Pause / back | **Esc** |
| Quick save / load | **F5 / F9** |
| Zoom | **Mouse wheel** |

Asteroids live out in the **belt sectors** (e.g. Ceres Belt) — the starting hub is a populated station system, so jump out to a belt to mine.

---

## What's implemented

- **Flight & combat** — semi‑Newtonian thrust/drag flight, mouse‑aim, boost; lasers/autocannons/missiles with energy + heat; enemy AI archetypes (swarmer/sniper/brawler/pirate/trader/capital); 4‑layer health (hull/armor/shield/cap); loot, bounties, death + respawn.
- **Mining & cargo** — beam mining of 6 asteroid types into a volume‑capped hold; ore pickups + magnet; salvage.
- **Living economy** — 33 commodities across a real supply/demand market per station (price‑from‑stock, spreads, price impact, drift, economic events, contraband + fines). Profitable trade routes actually exist.
- **Progression** — 13 ships (T0–T5), ~35 weapons/modules across a 6‑type slot grid, a 28‑node tech tree, shipyard + drag‑fit outfitting with live stat deltas.
- **World** — 10 sectors as a jump graph, fuel + jump drive, interdiction, fog‑of‑war, route planning (Dijkstra), hazards.
- **Factions** — 8 factions, −1000..+1000 / 9‑tier reputation, hostility/aggro, price modifiers, spillover, conflict.
- **Missions** — deterministic station boards, 10 mission types (delivery, bounty, mining quota, escort, smuggling, …), objective tracking, and an 8‑beat story spine that teaches the systems.
- **Automation (anti‑idle)** — mining drones, hired traders on routes, outposts, fleet orders — passive income that is **capped** below active earnings, with upkeep, loss risk, and offline catch‑up.
- **Full UI** — flight HUD (vitals, throttle, radar, target panel, cargo/credits, alerts), station hub (market/shipyard/outfitting/missions/services/factions/bar), star map, tech tree, automation panel, pause/settings/save‑load/help/main menu.
- **Save/load** — versioned saves to localStorage + JSON export/import, autosave, migrations.
- **Audio system** — synthesized state-driven SFX and adaptive music today, with shared buses and an authored-source path for cues that benefit from recorded material.

---

## Project layout

```
index.html            DOM shell + Three.js importmap
server.js             zero‑dep static server
styles/ui.css         theme + layout
vendor/three.module.js
src/
  main.js             boot + bootstrap
  core/               state, event bus, registry, fixed‑timestep loop, entity, physics, rng/math
  systems/            input, flight, ai, weapons, combat, mining, cargo, economy,
                      factions, missions, world, ships, automation
  render/             renderer, camera, starfield, visualFactory, vfx
  audio/              audioSystem, synth
  save/               saveSystem, migrations, checksum
  ui/                 uiRoot, screenManager, hud, radar, … + screens/*
  data/               pure‑data catalogs (ships, weapons, modules, commodities, sectors,
                      factions, missions, tech, enemies, automation, palettes, …)
ARCHITECTURE.md       the canonical contract (state schema, event table, file manifest)
design/               current GDD/build plan plus historical design material
```

**Architecture in one breath:** a single flat `GameState`, an event bus, and registry-selected systems
(each `init(ctx)` + `update(dt, state)`) wired in a fixed order and driven by a 60 Hz fixed-timestep
loop decoupled from rendering. Content is data-driven. See [`ARCHITECTURE.md`](ARCHITECTURE.md) for
the full contract and [`docs/README.md`](docs/README.md) for task-oriented documentation routing.

Current design authority lives in [`design/GDD_2_0.md`](design/GDD_2_0.md). The sole whole-program
status and pickup surface is [`design/program/README.md`](design/program/README.md);
[`design/vision/ALPHA_PROGRAM.md`](design/vision/ALPHA_PROGRAM.md) owns Alpha scope/order, while the
activated spec2/spec3/revamp/depth/graphics plan owns task detail.

> **Agents and contributors:** read [`AGENTS.md`](AGENTS.md) for engineering invariants, and
> [`CANONICAL_BUILD_MAP.md`](CANONICAL_BUILD_MAP.md) for program work / "what next" / multi-plan
> dispatch (it routes into `design/program/` without replacing original plans).
> `ARCHITECTURE.md` (repo root) is the technical contract; `design/GDD_2_0.md` is
> the design authority. Live status ledgers live under
> [`design/program/README.md`](design/program/README.md).

### Dev helpers
- `node scripts/check-data.mjs` — verify every data module's exports.
- `node scripts/check-data-refs.mjs` — verify every cross‑file ID (`ship_/wpn_/cmdty_/…`) resolves.
- In the browser console, `window.SF = { state, bus, registry, ctx }` is exposed for inspection.

---

## Optional Desktop Packaging

SpaceFace is a PC/browser game first. The browser route (`node server.js` → `http://localhost:8123/`) is the primary player-facing path. An optional **Electron** shell is included (`electron/main.cjs`) for desktop distribution; it serves the same game route on a private localhost port and opens a game window.

- **Dev** (`npm run electron`): serves the raw ES modules + importmap from the project root at the same root URL as the browser path — no build step, hot-editable source.
- **Release** (`npm run dist`): first runs `build:bundle` (esbuild) to produce a tree-shaken, minified bundle in `build/web/` (~45% smaller JS than the raw `src/`+`vendor/` tree, with three/rapier/loaders code-split into on-demand chunks), then electron-builder packages that into an installer. The Electron shell auto-detects the bundle and serves it when present.

```bash
npm install            # downloads Electron + electron-builder + esbuild (~250 MB, one time)
npm run electron       # run the desktop app (dev: raw modules)
npm run build:bundle   # build the minified bundle to build/web/ (without packaging)
npm run dist           # bundle + package a distributable (Win installer / mac dmg / linux AppImage) into dist/
```

Desktop packaging is a shell concern only. It must not change gameplay, assets, settings defaults, scenarios, renderer features, or UI reachability from the browser route.

---

## Current status and future work

Implementation status changes quickly and is intentionally not duplicated here. The verified done/open split,
acceptance state, retained future ideas, and exact resume order live in
[`design/program/`](design/program/README.md).

---

*Built collaboratively by a fleet of AI subagents against a single architectural contract — design fan‑out → architecture synthesis → verified engine spine → parallel subsystem implementation, integration‑tested by driving the live game.*
