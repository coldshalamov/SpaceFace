<!-- LIFETIME: ACTIVE_PROGRAM -->
# ENGINE — the target architecture: a game that never hitches

**Owner, 2026-11-06:** "facilitate the buildout of a robust backend system that never hitches and does
what we're trying to do optimally and efficiently … like a real professional game."

`../MASTER_PLAN.md` Part 1 has the campaigns (E1–E10) and the diagnosis. This file is the
**destination**: the architecture those campaigns build toward, the budgets it lives within, the
policies that keep it hitch-free, and the tools that catch regressions. When a campaign has to choose,
it chooses whatever moves the code toward this picture.

---

## 1. The picture — five threads, one rule

**The rule: no thread ever waits on another thread to draw a frame.**

| Thread | Owns | Never does |
|---|---|---|
| **Main (UI)** | DOM UI, input capture, audio scheduling, platform glue | render, simulate, decode assets, compile shaders |
| **Render worker** [NEW — OffscreenCanvas] | three.js, the playout buffer, VFX, the camera, residency/upload scheduling | DOM, simulation |
| **Sim worker** [EXISTS] | the authoritative fixed-step simulation (60 Hz), physics (Rapier WASM), AI, economy (sliced) | render, DOM |
| **Asset workers** (2) [EXTEND] | fetch, decode, KTX2 transcode, mesh processing, save compression | anything on the frame path |
| **Audio worklet** [EXISTS in part] | mixing, procedural engine sounds | — |

**Why a render worker (the ambitious one):** today the renderer shares the main thread with DOM UI,
input and message handling — any layout, long UI update, GC or message burst steals frame time, and
the HUD's forced layouts and churn are measured costs. Moving rendering to an OffscreenCanvas in a
worker means **UI work can never drop a frame**, and the main thread becomes light. three.js supports
OffscreenCanvas; the work is moving everything renderer-side off DOM assumptions (measurement via
`getBoundingClientRect` moves to main and is sent over). Gate it behind a measured A/B on the laptop
(master plan E7) — keep the main-thread renderer as the fallback.

**Data paths (all shared memory where cross-origin isolation exists — master plan E5):**
- **Sim → render:** a **triple-buffered snapshot** in a SharedArrayBuffer: structure-of-arrays (ids,
  generations, positions, velocities, rotations, angular velocities, flags, visual state) + a small
  event ring (spawns, deaths, impacts, teleports). The render worker reads the latest two complete
  snapshots for the **playout buffer** (E1): interpolate, extrapolate ≤ 150 ms, correct smoothly.
- **Main → sim:** the input/command ring [EXISTS].
- **Sim → main:** a UI model snapshot at 10–20 Hz (HUD values, prompts) — UI never reads sim state
  directly.
- **Fallback (no isolation):** transferable buffers with the same layout.

## 2. The simulation core

| Piece | Target | Status |
|---|---|---|
| **Entity store** | SoA typed buffers with stable indices + generations; a facade for legacy code during migration | NEW (E4) |
| **Scheduler** | every system declares `{ modes, rate, budgetMs }`; the scheduler runs per-mode manifests, slices low-rate work across ticks, and reports per-system time + allocation | NEW (E3) |
| **Spatial index** | one shared spatial hash (or BVH) rebuilt incrementally per tick; every "near X" query uses it — no system scans all entities | EXTEND |
| **Events** | batched per-tick buffers (impacts, damage, kills) instead of per-event fan-out to dozens of listeners | NEW (E2) |
| **Physics** | Rapier tuned for the game: collision groups (debris/Brood don't pair with everything), sleeping islands that tows don't keep awake, CCD only for fast small bodies, joints only where needed | EXTEND (E2) |
| **Simulation LOD** | full rate near the player; far sectors and off-screen agents in coarse steps | NEW (E3) |
| **Hot loops in WASM** | after the SoA rewrite, any system still ≥ 1 ms/tick is a candidate for Rust → WASM sharing the same buffers | GATED (E4) |
| **Determinism** | `state.rng`, `state.simTime`; versioned reference digests; replay tapes [EXISTS] | EXISTS |

## 3. The frame budget (owner's laptop, auto quality tier)

| Budget | Target per frame (60 fps = 16.7 ms) |
|---|---|
| Sim step (worker) | p95 ≤ 8 ms, p99 ≤ 12 ms, max ≤ 25 ms |
| Render JS (render worker or main) | ≤ 4 ms, ≤ 100 KB allocation |
| GPU | ≤ 12 ms (dynamic resolution with hysteresis holds it) |
| Main thread (UI) | ≤ 3 ms, ≤ 1 MB/s allocation; no long task > 50 ms after load |
| Uploads (textures/meshes) | ≤ 2 ms per frame, time-sliced |
| Shader compile on a gameplay frame | **0** — every variant compiled during loading or off-screen |

## 4. Hitch-proof policies (lint-level rules)

1. **No synchronous shader compiles in gameplay.** Variants enumerated at build time, compiled during
   loading with parallel compile; anything new compiles off-screen and appears only when ready (E6).
2. **No synchronous GPU readbacks** on the frame path.
3. **No layout thrash:** UI reads layout once per frame (batched), writes once (dirty-checked).
4. **No per-frame allocation** in render or sim hot paths (pools, scratch objects, typed arrays).
5. **No unbounded work on one frame:** loading, uploads, economy ticks, saves — all time-sliced with
   budgets; when over budget, defer, never stall.
6. **Nothing becomes visible before it's resident** (E6).
7. **Every async boundary has a timeout and a fallback** (lost ACKs re-baseline without freezing — the
   playout buffer hides it).
8. **Saves are incremental and off-thread** (asset worker compresses).
9. **New systems must declare a budget and a rate** to be registered.

A static check (script) enforces what it can (per-frame `new` in hot files, `getBoundingClientRect` in
render paths, synchronous compile calls) and fails the build on new violations.

## 5. Observability — find hitches in minutes, not weeks

- **The frame-truth dashboard** (E10): live overlay + JSON trace.
- **The flight recorder (black box)** [NEW]: always on, near-zero cost — a ring buffer of the last
  2 s of per-system sim timings, render pass timings, main-thread tasks, GC events and snapshot
  arrival times. **Any frame > 50 ms automatically dumps the ring** with the scene context (sector,
  entity counts, active effects) to a file. Every hitch report comes with its own diagnosis.
- **Hitch replay:** a dumped recording can be replayed in the sim harness (replay tapes exist) to
  reproduce the expensive tick deterministically and profile it.
- **A hitch budget in CI-style checks:** the busy-route soak (master plan §4 bars) runs on the laptop
  after every engine change; regressions block the change.

## 6. Loading and streaming

- **Route-split code** (title / Swarm / Adventure / station) — E9.
- **World streaming by cells:** sectors are divided into cells; cells near the player and along the
  predicted route are resident; far cells unload; the residency manager (E6) admits assets by
  prediction 2 s ahead of need.
- **Persistent caches** in Electron: assets, transcoded textures, compiled programs.
- **The title screen is interactive while loading.**

## 7. The decision gates (ambitious, honest)

| Gate | Question | Decided by |
|---|---|---|
| **Render worker** | Does OffscreenCanvas rendering remove UI-caused frame drops without losing look or features? | laptop A/B on the busy routes (E7) |
| **WebGPU** | Does three.js WebGPURenderer cut render JS and setProgram cost on the iGPU? | laptop A/B (E7) |
| **Rust/WASM systems** | Is a system still ≥ 1 ms/tick after SoA? | the scheduler's per-system report (E4) |
| **Native engine** | Is a native rebuild ≥ 3× better and cheaper than finishing the web stack? | the Swarm slice (E8, kill criteria fixed) |

## 8. Done for the engine

- [ ] All §3 budgets met on the laptop on the busy Crucible round and the Adventure busy route.
- [ ] A 30-minute Adventure soak and a 15-wave Swarm run: zero frames > 50 ms after load; zero freezes;
      zero visible snaps (pose trace).
- [ ] The flight recorder is on by default and its dumps reproduce in the replay harness.
- [ ] The §4 static check runs and passes.
- [ ] The decision gates have written verdicts.
