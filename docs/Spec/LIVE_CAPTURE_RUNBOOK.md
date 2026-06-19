# Live Capture Runbook — Frame-Time (§18 Gate 6) & Store Screenshots (§16.4)

**Spec reference:** §18 Gate 6 (performance & release), §12.1 (frame-time budget), §13.2 (exposure), §16.4 (store screenshots)

This document covers the two graphics-spec items that need the game **running with a real WebGL stack**
(not the isolated-ship SwiftShader capture pipeline). Everything else in the spec is implemented,
verified, and merged to `master` (PR #1).

## Why these two need a live run (not a result yet)

The graphics style guide (§2) is explicit: *"Final frame-time and screenshot judgment still require
running the game on the target and floor profiles."* The repo's `scripts/capture-kestrel-shot.mjs`
captures **isolated ships** under SwiftShader (software GL) — fine for visual judgment (silhouette,
materials, damage, faction contrast, bloom behavior) but **two things are out of its reach**:

1. **Frame-time** — SwiftShader timings are not representative of a hardware GPU, so they can't confirm
   the §12.1 budget (16.7 ms target / 33.3 ms floor).
2. **Store screenshots** — §16.4's six scenes need the **full game world** (sectors, asteroids, combat,
   stations), not a ship rendered alone on black.

Both are closed by running the actual game on **any machine with a GPU** (the dev machine itself is fine
— `npm run electron` uses its WebGL). No special hardware is required.

## Step 1 — Frame-time diagnostics (§18 Gate 6, §12.1)

```bash
npm install
npm run electron
```

Open devtools and read the diagnostics the renderer publishes each frame:

```js
window.__THREE_GAME_DIAGNOSTICS__.getReport()
// { frameMs: { last, avg, min, max, p95 }, render: { calls, triangles }, memory, ... }
```

The diagnostics module (`src/render/diagnostics.js`) already accumulates correctly across the bloom
multi-pass frame. `p95` over ~3 s of rolling history is the §18 Gate 6 number.

**Pass criteria (§12.1):**
- p95 frame time ≤ 16.7 ms at the target profile (60 fps)
- p95 frame time ≤ 33.3 ms at the floor profile (30 fps)

Toggle bloom in **Settings → Video** and capture both ways (§18 Gate 6: "diagnostics captured bloom
on/off").

## Step 2 — Exposure check (§13.2)

Fly the Kestrel into the darkest normal sector. Confirm the player ship retains a readable midtone
**without a permanent white outline**. Exposure is a stable fixed value (1.0 via `bloom.js`; no
auto-adaptation exists in `src/`), so this is visual confirmation, not tuning — unless the live run
shows otherwise.

## Step 3 — Store screenshots (§16.4)

Play to each of §16.4's six scenes and capture with F12 (or the OS screenshot):

1. Kestrel hero flight in a readable core sector
2. Close manual mining with clear tool/rock interaction
3. Faction contrast in a combat or escort encounter (the seven bespoke ships make this read)
4. Surface or station service scene with scale cues
5. Later-tier logistics/intervention view showing progression
6. Quiet narrative frame demonstrating mood and UI restraint

The same ship + material language must survive all six (§16.4).

## What's already done (verified, on master)

- §9 Kestrel (builder, sockets, decals, §9.10 upgrade behavior, §9.11 damage states)
- All seven §8 faction ships — bespoke, live-capture-verified
- §9.9 socket-aware VFX · §11.1 material discipline · §12.2–12.5 (batching, LOD, collision debug)
- §13.2 exposure (verified stable, no auto-adapt) · §17 asset pipeline · §6.2 silhouette gate
- §20 Phase-1 leak check · SwiftShader capture pipeline for visual judgment
- `npm run check` — 185 art checks, all green on `master`
