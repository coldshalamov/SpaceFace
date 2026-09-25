# alloc-profile-flight — V8 allocation sampling (settled flight + busiest scene)

**Kind:** report (no game code changed)  
**Measured SHA (origin/master tip):** `0612d2b9fc994557dd35cb00d0df21b791722c23`  
**When:** 2026-09-22 ~20:55–20:58 EDT (America/New_York)  
**Branch for this outbox:** `vm-drop` (job folder only)  
**GPU tier:** **software** (soft-GPU — ANGLE Mesa llvmpipe). Not SwiftShader this pass (same label family as `cpu-profile-flight` / `quiet-witness-baseline`).

## Window match to cpu-profile-flight

Same idle soft-GPU VM (`DISPLAY=:4`), seed 47, master tip with `emergentPrimitives` present.

| Window | This job | cpu-profile-flight analogue |
|---|---|---|
| Settled held-thrust ~60 s | `SPACEFACE_WITNESS_MS=60000` + `--alloc-probe` | `--ms=60000 --label=settled-60s` |
| Busiest reachable (New Game → load → early flight) | `--alloc-probe-boot` + `SPACEFACE_WITNESS_MS=20000` | `--from-launch --flight-ms=20000` |

Both EXIT 0. Machine otherwise idle during capture.

## Tooling (what worked)

| Item | Detail |
|---|---|
| Primary | `node scripts/probe-runtime-witness.mjs` with `--alloc-probe` / `--alloc-probe-boot` |
| CDP API | `HeapProfiler.startSampling` `{ samplingInterval: 65536 }` then `HeapProfiler.stopSampling` |
| Also | `--gc-probe` (`HeapProfiler.collectGarbage`) to split churn vs retention |
| Not used / missing | `clinic` / `0x` binaries not present; Electron `--heapsnapshot-signal` not wired for renderer; `perf:memlab` is a ship-preview leak scenario, not flight |
| Raw artifacts | Stock probe **does not** write a Chrome `.heapprofile` file. It merges self-size into **top-25 sites** inside `report.json` → `allocProfile`. Those JSON reports + stdout logs are the raw capture here. |

**Important:** sampled MB is V8 allocation-sampling attribution (≈ every 64 KiB), **not** live heap size and **not** an exact byte counter. Rates below = `(sampled MB × 1024) / ΔexecutedFrames` or `/ Δtick` over the flight sample window only.

## Headline numbers

| Window | Sampled alloc (top merge) | Live JS heap (first → last sample) | Forced GC (`--gc-probe`) | ΔexecutedFrames / Δtick |
|---|---:|---|---|---:|
| Settled ~60 s | **13 MB** | 365 → 397 MB used | 379 → **363** MB (−16 MB) | 537 / 1343 |
| From-launch busy | **27 MB** | 303 → 453 MB used | 435 → **348** MB (−87 MB) | 134 / 273 (flight tail only; sampling includes boot) |

Forced-GC read: settled reclaim is small vs live set → **mostly retained working set** during steady flight, with modest sampling-visible churn. From-launch reclaim **87 MB** → **large boot/load garbage** on top of retention (Rapier init, KTX2, GLTF, materials).

## Settled flight — top allocation sites

Sample wall: 60 000 ms held thrust after flight entry. Sampling armed at flight loop (`--alloc-probe`).

### By sampled size (top 25)

| rank | sampled MB | ~KB / execFrame | ~KB / tick | churn class | site |
|---:|---:|---:|---:|---|---|
| 1 | 1.4 | 2.67 | 1.07 | **per-frame** | `append @ presentationJournal.js:274` |
| 2 | 1.2 | 2.29 | 0.91 | **per-frame** | `cloneUniforms @ three.core.js:37307` |
| 3 | 0.9 | 1.72 | 0.69 | **per-frame** | `Object3D @ three.core.js:11757` |
| 4 | 0.5 | 0.95 | 0.38 | runtime/builtin | `Set @ :0` |
| 5 | 0.5 | 0.95 | 0.38 | runtime/builtin | `get @ :0` |
| 6 | 0.4 | 0.76 | 0.30 | runtime/builtin | `Float32Array @ :0` |
| 7 | 0.3 | 0.57 | 0.23 | **per-frame** | `createBindingState @ three.module.js:1710` |
| 8 | 0.3 | 0.57 | 0.23 | **per-frame** | `BufferAttribute @ three.core.js:16696` |
| 9 | 0.3 | 0.57 | 0.23 | **per-frame** | `multiplyMatrices @ three.core.js:10385` |
| 10 | 0.3 | 0.57 | 0.23 | **per-frame** | `stableJsonStringify @ renderPackage.js:265` |
| 11 | 0.3 | 0.57 | 0.23 | runtime/builtin | `set @ :0` |
| 12 | 0.3 | 0.57 | 0.23 | mid-flight / admission-ish | `createFlowFlipbookMaterial @ flowFlipbookMaterial.js:646` |
| 13 | 0.2 | 0.38 | 0.15 | runtime | `(IDLE_EXTERNAL) @ :0` |
| 14 | 0.2 | 0.38 | 0.15 | **per-frame** | `MeshPhysicalMaterial @ three.core.js:38336` |
| 15 | 0.2 | 0.38 | 0.15 | telemetry | `(anonymous) @ eventTrace.js:71` |
| 16 | 0.1 | 0.19 | 0.08 | one-time/residual | `(anonymous) @ partsLibrary.js:4192` |
| 17 | 0.1 | 0.19 | 0.08 | **per-frame** | `frame @ presentationRunner.js:780` |
| 18 | 0.1 | 0.19 | 0.08 | runtime/builtin | `join @ :0` |
| 19 | 0.1 | 0.19 | 0.08 | one-time/residual | `setup @ three.module.js:1606` |
| 20 | 0.1 | 0.19 | 0.08 | **per-frame** | `Material @ three.core.js:20414` |
| 21 | 0.1 | 0.19 | 0.08 | runtime | `(V8 API) @ :0` |
| 22 | 0.1 | 0.19 | 0.08 | **per-frame** | `setBlending @ three.module.js:10263` |
| 23 | 0.1 | 0.19 | 0.08 | **per-frame** | `BufferGeometry @ three.core.js:18165` |
| 24 | 0.1 | 0.19 | 0.08 | one-time/residual | `(anonymous) @ KTX2Loader.js:633` |
| 25 | 0.1 | 0.19 | 0.08 | **per-frame** | `update @ three.module.js:4278` |

### Per-frame vs per-sim-tick (settled)

- **Per-frame / presentation+render churn (dominant):** `presentationJournal.append`, `cloneUniforms`, `Object3D`, WebGL binding/buffer/material paths, `presentationRunner.frame`, `stableJsonStringify` (render package). These are the legal first targets if the goal is cutting steady-flight allocation.
- **Per-sim-tick:** no site in the settled **top-25** clearly owned by `simulationRunner` / `registry.step` / physics. Sim alloc is below the sampling floor of this capture (or nested under unnamed builtins). Contrast cpu-profile-flight where sim was ~5% **CPU** inclusive — CPU cost ≠ allocation volume.
- **One-time / residual mid-window:** small KTX2 / partsLibrary / three `setup` / flow-flipbook material creation — consistent with soft-GPU mid-flight admission still ticking (see cpu-profile `isProgram` / compile notes).

JS heap samples (MB used, from long-task section of witness report):  
`365 468 496 505 393 403 410 374 364 388 377 385 372 376` — sawtooth with natural GC, not monotonic leak across the 60 s window.

## From-launch busy — top allocation sites

Sampling armed **before** the loading route (`--alloc-probe-boot`), then ~20 s held thrust. Includes New Game → authored-visuals → entering-flight → early flight (same busy family as cpu-profile-flight).

| rank | sampled MB | churn class | site |
|---:|---:|---|---|
| 1 | 2.0 | **one-time** | `runRapierInitWithFilteredWarning @ rapierCompatRuntime.js:81` |
| 2 | 1.6 | per-frame/render (also boot materials) | `cloneUniforms @ three.core.js:37307` |
| 3 | 1.5 | per-frame/render (also boot scene) | `Object3D @ three.core.js:11757` |
| 4 | 0.8 | runtime/builtin | `get @ :0` |
| 5 | 0.6 | boot/render | `parseUniform @ three.module.js:6100` |
| 6 | 0.6 | **one-time** | `(anonymous) @ KTX2Loader.js:633` |
| 7 | 0.5 | runtime/builtin | `join @ :0` |
| 8 | 0.5 | runtime/builtin | `Float32Array @ :0` |
| 9 | 0.4 | **one-time** (pool ctor) | `PlumeSlotPool @ continuousPlume.js:138` |
| 10 | 0.4 | boot/economy populate | `pricePointAt @ economy.js:408` |
| 11 | 0.4 | boot/render | `MeshPhysicalMaterial @ three.core.js:38336` |
| 12 | 0.4 | runtime | `(V8 API) @ :0` |
| 13 | 0.4 | boot/render | `BufferAttribute @ three.core.js:16696` |
| 14 | 0.4 | boot/render | `BufferGeometry @ three.core.js:18165` |
| 15 | 0.3 | per-frame | `stableJsonStringify @ renderPackage.js:265` |
| 16 | 0.3 | runtime | `(IDLE_EXTERNAL) @ :0` |
| 17 | 0.3 | per-frame | `createBindingState @ three.module.js:1710` |
| 18 | 0.3 | three.js | `copy @ three.core.js:13272` |
| 19 | 0.3 | per-frame | `multiplyMatrices @ three.core.js:10385` |
| 20 | 0.3 | runtime/builtin | `toLowerCase @ :0` |
| 21 | 0.3 | runtime/builtin | `map @ :0` |
| 22 | 0.3 | frame/vfx | `update @ arcadeStructuralFx.js:240` |
| 23 | 0.3 | **sim-tick** | `step @ registry.js:773` |
| 24 | 0.3 | render | `setValueV3f @ three.module.js:5251` |
| 25 | 0.3 | **one-time** | `parse @ GLTFLoader.js:429` |

### Per-frame vs per-sim-tick vs one-time (busy)

- **One-time / boot:** Rapier WASM init (**#1**), KTX2, GLTF parse, `PlumeSlotPool` construction, economy `pricePointAt` population, material/geometry construction spikes. Matches cpu-profile-flight “authored-visuals / entering-flight” busyness, now in **bytes**.
- **Per-frame (also active in early flight):** same Three/render package cluster as settled (`cloneUniforms`, `Object3D`, buffers, binding state).
- **Per-sim-tick:** `step @ registry.js:773` appears at **0.3 MB** sampled in this window (visible once boot is included / early flight is denser). Still small vs boot+render.

Do **not** divide boot sites by flight-only Δframes — sampling covered load.

## GPU tier label

**software** — `ANGLE (Mesa, llvmpipe (LLVM 19.1.7 256 bits), OpenGL 4.5)`. Soft-GPU. Not SwiftShader/Subzero on this pass (standalone SwiftShader was an older empty-baseline probe path). Soft-GPU elevates compile/admission CPU in the sister cpu-profile job; allocation sites above are mostly JS/Three/game and should port to owner iGPU, though absolute heap timing may differ.

## Pointers to raw artifacts

| Path | Contents |
|---|---|
| `artifacts/settled-60s/report.json` | Full witness probe JSON including `allocProfile`, `gcProbe`, `gpu`, first/last samples |
| `artifacts/settled-60s/report.md` | Human witness report (heap sawtooth, long tasks, hitch attribution) |
| `artifacts/from-launch-busy/report.json` | Same for boot-inclusive sampling |
| `artifacts/from-launch-busy/report.md` | Witness markdown |
| `artifacts/settled-60s-stdout.log` / `from-launch-busy-stdout.log` | Console including `alloc-probe:` top-20 lines |
| `artifacts/alloc-summary.json` | Classified copy of both `allocProfile` tables + env |
| `artifacts/env.txt` | SHA, GPU tier, CDP sampling interval |

**How to re-open / re-run**

```bash
# Settled ~60 s (same window family as cpu-profile-flight settled-60s)
DISPLAY=:4 SPACEFACE_WITNESS_MS=60000 SPACEFACE_WITNESS_TAG=alloc-settled-60s \
  node scripts/probe-runtime-witness.mjs --alloc-probe --gc-probe --no-sample-shots

# Busiest from-launch (alloc from before loading)
DISPLAY=:4 SPACEFACE_WITNESS_MS=20000 SPACEFACE_WITNESS_TAG=alloc-from-launch-busy \
  node scripts/probe-runtime-witness.mjs --alloc-probe-boot --gc-probe --no-sample-shots
```

Chrome DevTools: there is **no** `.heapprofile` file to Load; use the tables in this report / `allocProfile` in the JSON. A full `HeapProfiler.takeHeapSnapshot` was **not** taken (multi‑hundred‑MB–GB soft-GPU heaps; stock flight probe uses sampling for a reason).

## Map for later alloc-reduction jobs

1. Steady flight: stop or ring-buffer **`presentationJournal.append`**; cut **`cloneUniforms` / material clone** paths; audit **`stableJsonStringify`** per frame.
2. Boot/load: Rapier init and KTX2/GLTF are expected one-shots — measure separately from frame churn; GC reclaim of 87 MB after busy proves much of that is garbage after construction.
3. Sim tick: not the dominant sampled allocator in settled top-25; prefer cpu-profile for sim CPU, watch `registry.step` only if busy-window alloc grows.

## Commands actually run (EXIT 0)

```text
DISPLAY=:4 SPACEFACE_WITNESS_MS=60000 SPACEFACE_WITNESS_TAG=alloc-settled-60s \
  node scripts/probe-runtime-witness.mjs --alloc-probe --gc-probe --no-sample-shots
# ~20:55:34–20:57:18 EDT

DISPLAY=:4 SPACEFACE_WITNESS_MS=20000 SPACEFACE_WITNESS_TAG=alloc-from-launch-busy \
  node scripts/probe-runtime-witness.mjs --alloc-probe-boot --gc-probe --no-sample-shots
# ~20:57:30–20:58:29 EDT
```
