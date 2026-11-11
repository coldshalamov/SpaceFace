# PERF-01 — Where the frame goes: seven on/off experiments

**Program:** B Performance (`PLAYBOOK.md` §3B). **Tier:** D (lead interprets). **Size:** medium.
You change no game behaviour for players. You add dev-only switches to the profiler, run experiments,
and report numbers. **Run this only when no other worker is booting the game** (ask nothing; check
`tasklist | grep -i -E "electron|chrome"` shows no game instances you did not start, wait if it does).

## Why
Measured 2026-11-10: in steady opening flight the main thread is **0.4 % idle**; 34 % is browser-native
time (`(program)`), ~24 % three.js; the simulation advances at **0.62×** real time. Nobody knows which
part of the main thread is waste. One A/B per suspect answers it.

## Build: switches on the existing profiler
`scripts/probe-main-thread-profile.mjs` already profiles 15 s of held-thrust flight and prints a "game
cadence" line (with `simWallRatio`) and a report with main-thread shares. Add flags (dev-only; they
must not exist in a player's build path — apply them from the probe via `page.evaluate` / URL params
read only when `?perfmonitor=1` or a probe flag is present):

| Flag | What it does |
|---|---|
| `--hide-hud` | `display:none` on every HUD/DOM overlay root above the canvas (find them: children of `#hud` and siblings of the GL canvas) |
| `--no-post` | turn off post-processing (bloom, CAS sharpen, any full-screen pass) — find the setting in `src/render/bloom.js` / renderer post route |
| `--render-scale=0.5` | renderer pixel ratio × 0.5 |
| `--no-shadows` | shadows off |
| `--skip-render` | keep the frame loop and sim running but skip the WebGL draw call(s) (`renderer.render`) |
| `--ack-limit=<n>` | raise the sim worker's unacknowledged-reply limit (find the backpressure constant in `src/core/simLaneMain.js` / the worker; ≤4 today) |
| `--trace` | also record a Chrome performance trace (CDP `Tracing.start`, categories `devtools.timeline,disabled-by-default-devtools.timeline,gpu`) and print the top 10 trace event names by total duration (e.g. `UpdateLayoutTree`, `Layout`, `Paint`, `CompositeLayers`, `GPUTask`) — this splits the 34 % `(program)` |

## Run
Same seed, same 15 s window, alternating baseline and variant so machine noise hits both:
`baseline, hide-hud, baseline, no-post, baseline, render-scale=0.5, baseline, no-shadows, baseline,
skip-render, baseline, ack-limit=16, baseline --trace`. Then the same list once in Swarm
(`?swarmRound=20`, use whatever the probe needs to start Swarm; if it cannot, say so).

## Report (receipt + `design/program/fleet/drafts/PERF-01-results.md`, committed)
A table, one row per run: variant · fps (frames/15 s) · main-thread idle % · simWallRatio · top 3
self-time owners · long tasks. Then for each variant, the **difference from the mean of its two
neighbouring baselines**. Then the `--trace` top-10 table. No interpretation needed beyond "this
variant moved idle by X points and simWallRatio by Y".

## Files you may edit
`scripts/probe-main-thread-profile.mjs` and any `scripts/lib/*` helper it uses; the minimal hook in the
game for a switch that cannot be done from outside (name each, gate it behind the probe flag);
`design/program/fleet/drafts/PERF-01-results.md`. `git diff` first.

Commit: `fleet(PERF-01): seven on/off experiments on the main thread, with results`.
