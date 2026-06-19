# Steam Deck / Target-Hardware Capture Runbook

**Spec reference:** §18 Gate 6 (performance & release), §12.1 (frame-time budget), §13.2 (exposure), §16.4 (store screenshots)

This document covers the graphics-spec items that **require the physical target hardware** and cannot be
completed in a headless/software-rendered session. Everything else in the spec is implemented, verified,
and merged to `master` (PR #1).

## Why a runbook (not a result)

The graphics style guide (§2) is explicit: *"Final frame-time and screenshot judgment still require
running the game on the target and floor profiles."* A headless SwiftShader capture (which the repo's
`scripts/capture-kestrel-shot.mjs` performs) produces valid frames for **visual** judgment — silhouette,
materials, damage readability, faction contrast, bloom behavior — but its timings are **not representative**
of a real GPU and cannot satisfy the §12.1 budget (16.7 ms target / 33.3 ms floor).

## Prerequisites

- A Steam Deck (or the documented floor-profile machine)
- This repo at `master` (PR #1 merged)

## Step 1 — Frame-time diagnostics (§18 Gate 6, §12.1)

```bash
npm install
npm run electron          # or: npm start → open http://localhost:8123/ on the device
```

In the running game, open the devtools console and read the diagnostics the renderer publishes:

```js
window.__THREE_GAME_DIAGNOSTICS__.getReport()
```

This returns `{ frameMs: { last, avg, min, max, p95 }, render: { calls, triangles }, memory, ... }`.
The diagnostics module (`src/render/diagnostics.js`) already correctly accumulates across the bloom
multi-pass frame (the hard part) — `p95` over ~3 s of rolling history is the §18 Gate 6 number.

**Pass criteria (§12.1):**
- p95 frame time ≤ 16.7 ms at the target profile (60 fps)
- p95 frame time ≤ 33.3 ms at the floor profile (30 fps)

Toggle bloom in **Settings → Video** and re-capture both ways (spec §18 Gate 6: "diagnostics captured
bloom on/off"). The bloom chain renders several passes; a ship draw call may be paid multiple times,
so measure both.

## Step 2 — Exposure check (§13.2)

Fly the Kestrel into the darkest normal sector. Confirm the player ship retains a readable midtone
**without a permanent white outline** (§13.2). Exposure is a stable fixed value (1.0 via `bloom.js`
default; no auto-adaptation exists in `src/`) — so this is a visual-confirmation step, not a tuning task,
unless the live capture shows otherwise.

## Step 3 — Store screenshots (§16.4)

The spec's six store-ready scenes (§16.4) require the **full game world** (sectors, asteroids, combat,
stations), not the isolated-ship capture pipeline. Capture each by playing to the scene:

1. Kestrel hero flight in a readable core sector
2. Close manual mining with clear tool/rock interaction
3. Faction contrast in a combat or escort encounter (the seven bespoke ships now make this read)
4. Surface or station service scene with scale cues
5. Later-tier logistics/intervention view showing progression
6. Quiet narrative frame demonstrating mood and UI restraint

Use F12 (or the platform screenshot) in the running game. The same ship + material language must
survive all six (§16.4).

## Step 4 — Record + file

Record the p95 numbers (bloom on/off, target + floor), the exposure confirmation, and the six
screenshots. These close §18 Gate 6 and §16.4 — the last two open spec items.

## What's already done (no device needed)

- §9 Kestrel (builder, sockets, decals, §9.10 upgrade behavior, §9.11 damage states)
- All seven §8 faction ships (Kestrel/Concord/Meridian/Drift/Reaver/Quiet/Vael) — bespoke, verified
- §9.9 socket-aware VFX · §11.1 material discipline · §12.2–12.5 (batching, LOD, collision debug)
- §13.2 exposure (verified stable, no auto-adapt) · §17 asset pipeline · §6.2 silhouette gate
- §20 Phase-1 leak check · live capture pipeline (SwiftShader) for visual judgment
- `npm run check` — 185 art checks, all green on `master`
