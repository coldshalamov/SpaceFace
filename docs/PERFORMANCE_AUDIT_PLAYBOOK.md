<!-- LIFETIME: DURABLE -->
# SpaceFace Performance Audit & Enhancement Playbook

Comprehensive operational guide and tooling reference for auditing, diagnosing, and enhancing runtime performance across SpaceFace using **Spector.js**, **stats-gl**, **Three.js `renderer.info`**, **MemLab**, and **`gltf-transform inspect`**.

---

## 1. The 5 Performance Vectors

| Vector | Tool | Primary Diagnostic Metric | What It Exposes |
|---|---|---|---|
| **WebGL Draw Pipeline** | **Spector.js** | Draw call count, state switches, uniform updates, pipeline binding | Over-fragmented meshes, redundant material changes, bad blending states |
| **Real-Time Frametime** | **stats-gl** | CPU frame ms, GPU raster ms (EXT_disjoint_timer_query), FPS | GPU vs CPU bottlenecks, fill-rate stalls, frame overrun spikes |
| **Engine Telemetry** | **`renderer.info`** | Calls, triangles, geometries, textures, compiled programs | Multi-pass draw totals, mid-gameplay shader compiles, allocation leaks |
| **Heap & Leaks** | **MemLab** | Detached DOM elements, retained closures, undisposed Three.js objects | Leaked WebGL textures/geometries, runaway preview loops, bus listener leaks |
| **3D Asset Weight** | **`gltf-transform`** | Primitives per mesh, polygon count, texture dimensions, VRAM | Models split into 50+ draw calls, oversized 4K textures, uncompressed meshes |

---

## 2. Hard Performance Budgets

| Metric | Target / Healthy | Warning Threshold | Actionable Ceiling | Remediation |
|---|---|---|---|---|
| **Frametime (60 FPS)** | **16.6 ms** | > 18.0 ms | > 22.0 ms (Hitch) | Profile CPU sim vs GPU present |
| **Simulation Step** | **< 2.5 ms** (p95) | > 5.0 ms | > 8.0 ms | Spatial hashing, AI cadence, entity culling |
| **Render Phase** | **< 4.5 ms** (p95) | > 8.0 ms | > 12.0 ms | Mesh visibility culling, transform updates |
| **GPU Time (stats-gl)** | **< 8.0 ms** | > 12.0 ms | > 16.0 ms | Reduce bloom passes, clamp dynamic resolution |
| **Draw Calls / Frame** | **< 120 calls** | > 200 calls | > 350 calls | `InstancedMesh`, `gltf-transform merge` |
| **Triangles on Screen** | **< 150,000** | > 250,000 | > 450,000 | Implement LOD1/LOD2, geometry simplify |
| **Mid-Flight Shaders** | **EXACTLY 0** | 1 program | > 2 programs | Warm up shaders before sector presentation |
| **Texture VRAM** | **< 200 MB** | > 350 MB | > 600 MB | Downscale textures to 1024px, KTX2/BasisU |
| **JS Heap Floor** | **< 300 MB** | > 500 MB | > 800 MB | Object pooling, eliminate GC garbage churn |
| **Retained Leaks (MemLab)** | **0 clusters** | 1 cluster | > 5 clusters | Invoke `.dispose()` on unmount, unbind events |

---

## 3. Tool Guides & Operational Workflows

### Tool 1: Spector.js (WebGL Pipeline Inspection)

Spector.js intercepts WebGL commands at the driver boundary, providing single-frame inspection of every draw call, bound shader, uniform, and render target.

#### Headless CLI Capture (Agent Automated)
```bash
npm run perf:spector
# Target a specific route (e.g. flight, station, combat):
node scripts/capture-spector-frame.mjs --route=flight
```
- **Artifacts**:
  - Raw capture: `.devshots/spector/spector-capture.json`
  - Analysis report: `.devshots/spector/report.md`
- **Output metrics**: Total GL commands, draw calls per shader program, texture bindings, state switches.

#### Interactive Browser Usage
- Launch with query param: `http://localhost:8123/?spector=1`
- **Keyboard Shortcut**: `Ctrl + Alt + C` triggers an instant frame capture and auto-downloads the JSON trace.
- **Console API**:
  - `window.SF.perf.spector.displayUI()` — Displays the red Spector record button in the browser corner.
  - `await window.SF.captureSpector({ download: true })` — Programmatic capture.

#### What to Look For
1. **Redundant `useProgram` calls**: If shaders switch back and forth between identical programs, material sorting is missing.
2. **Draw call count**: Each `drawElements` / `drawArrays` call carries driver overhead. High numbers (> 250) indicate individual non-instanced meshes.
3. **Redundant state changes**: Excessive `blendFunc`, `depthMask`, or `cullFace` toggling.

---

### Tool 2: stats-gl (Real-Time GPU / CPU Overlay)

`stats-gl` measures both main-thread CPU execution time and GPU rendering time via the `EXT_disjoint_timer_query_webgl2` extension.

#### How to Activate
- **URL Parameter**: Append `?stats=1` or `?statsgl=1` to any game URL.
- **Keyboard Shortcut**: Press `F3` or `Ctrl + Alt + S` while playing to toggle the HUD.
- **Console API**: `window.SF.toggleStatsGl()`.

#### Panel Interpretation
- **FPS Panel** (Cyan): Instantaneous and EMA smoothed framerate.
- **CPU Panel** (Green): Main-thread Javascript frame cost in milliseconds.
- **GPU Panel** (Yellow): Actual GPU hardware rasterization time.
  - *If GPU is low (< 5ms) but CPU is high (> 16ms)*: Engine is CPU-bound (sim, scene-graph traversal, or garbage collection).
  - *If CPU is low (< 4ms) but GPU is high (> 16ms)*: Engine is fill-rate bound (post-processing bloom, unculled transparent VFX particles, or huge draw buffer).

---

### Tool 3: Three.js `renderer.info` (Multi-Pass Telemetry & Spikes)

SpaceFace includes an in-engine monitor (`src/testing/perf/rendererInfoMonitor.js`) that captures `renderer.info` accumulated across multi-pass rendering (including bloom).

#### Headless CLI Probe (Agent Automated)
```bash
npm run perf:renderer-info
# Sample for 30 seconds of flight:
node scripts/probe-renderer-info.mjs --duration=30
```
- **Artifacts**:
  - Report: `.devshots/renderer-info/report.md`
  - Telemetry log: `.devshots/renderer-info/telemetry.json`

#### In-Engine Monitoring
- **URL Parameter**: `?perfmonitor=1` or `?perf=1`
- **Keyboard Shortcut**: `Ctrl + Alt + I` dumps real-time min/avg/p95/max percentiles to console.
- **Console API**: `window.SF.dumpRenderInfo()`

#### Critical Anomalies Detected
- **Late Shader Compilations**: Triggers an alert whenever `programs.length` increases mid-gameplay. Shaders must be pre-warmed during initial load.
- **Draw Call Spikes**: Triggers an anomaly when a frame exceeds 350 calls.
- **Resource Creep**: Displays current live `geometries` and `textures` count.

---

### Tool 4: MemLab (Memory Leak & Retainer Analysis)

MemLab performs automated E2E navigation cycles (`baseline -> target action -> back`) to detect retained memory, detached DOM elements, and unreleased Three.js allocations.

#### Running Scenarios
```bash
# Run leak detection on ship preview / hangar:
npm run perf:memlab -- --scenario=ship-preview

# Run leak detection on station dock / undock cycle:
npm run perf:memlab -- --scenario=station-cycle

# Run leak detection on galaxy map open / close cycle:
npm run perf:memlab -- --scenario=galaxy-map
```
- **Artifacts**:
  - Report: `.devshots/memlab/report.md`
  - Snapshots: `.devshots/memlab/snapshots/`

#### Interactive Heap Inspection
If MemLab reports leak clusters:
```bash
# Open interactive heap snapshot browser:
npx memlab view-heap

# Follow retainer graph for a specific leaked object:
npx memlab trace --node-id=<NODE_ID>
```

#### Common SpaceFace Leak Culprits
- **Secondary WebGL contexts**: Hidden canvas loops running after screen transition (e.g. ship preview canvas).
- **Event Bus Listeners**: Event listeners registered via `state.bus.on(...)` without corresponding cleanup on screen `onHide()`.
- **Three.js Geometries & Materials**: Dynamic meshes removed from `scene` without calling `geometry.dispose()` and `material.dispose()`.

---

### Tool 5: `gltf-transform inspect` (3D Asset Audit)

Audits all GLB and GLTF assets in `assets/` to identify multi-primitive meshes, vertex bloat, and VRAM hogs.

#### Automated Asset Audit
```bash
# Audit all assets (ranked report of top offenders):
npm run perf:gltf

# Audit first 20 assets:
node scripts/audit-gltf-assets.mjs --limit=20

# Directly inspect any individual model:
npx gltf-transform inspect assets/ships/fleet_player_bodies_v1/hornet/source/wholeships/hornet_production_v1_lod0.glb
```
- **Artifacts**:
  - Markdown Audit: `.devshots/asset-audit/gltf-audit-report.md`
  - Raw JSON: `.devshots/asset-audit/gltf-audit.json`

#### Key Flags Identified by the Audit
- `MULTI_PRIMITIVE_DRAW_CALLS`: Model contains multiple primitives. Each primitive requires a separate draw call.
- `HIGH_POLY_COUNT`: Model exceeds 30,000 triangles without LOD tiers.
- `HIGH_TEXTURE_VRAM`: Model textures consume > 25 MB of uncompressed GPU memory.
- `LARGE_TEXTURE_MAPS`: Model contains 2048px or 4096px textures.
- `UNCOMPRESSED_GEOMETRY`: File > 500 KB lacking `KHR_mesh_quantization` or `EXT_meshopt_compression`.

---

## 4. Performance Enhancement Cookbook: How to Fix Defects

### Recipe 1: Fixing High Draw Calls (Multi-Primitive Models)
**Problem**: An asset has 40 primitives in GLTF, generating 40 separate WebGL draw calls for every ship on screen.
**Fix**:
1. Consolidate primitives with `gltf-transform merge`:
   ```bash
   npx gltf-transform merge input.glb output.glb
   ```
2. Or combine meshes sharing the same material in Blender (`Ctrl + J` join, shared UV map).

### Recipe 2: Compressing Geometry & Reducing Disk/Download Size
**Problem**: Raw floating-point vertex coordinates waste bandwidth and cache.
**Fix**:
```bash
# 1. Quantize attributes (8-bit / 16-bit precision):
npx gltf-transform quantize input.glb output.glb

# 2. Apply Meshopt compression:
npx gltf-transform meshopt input.glb output.glb
```
*Result: Typically 50%–75% reduction in asset size with zero visible loss.*

### Recipe 3: Clamping Texture VRAM on Props & Ships
**Problem**: A small prop has 4096×4096 textures that take 67 MB of GPU memory uncompressed.
**Fix**:
```bash
# Resize texture dimensions to 1024x1024:
npx gltf-transform resize --width 1024 --height 1024 input.glb output.glb
```

### Recipe 4: Eliminating Mid-Flight Shader Compilation Hitches
**Problem**: When a new ship type or weapon fires for the first time, the game hitches for 100–300 ms while WebGL links the shader.
**Fix**:
1. Never compile on first draw.
2. In `src/render/precompile.js`, add the material and light configuration to the prewarm admission list.
3. Pre-compile using `renderer.compile(scene, camera)` or `renderer.compileAsync(...)` during loading.

### Recipe 5: Preventing Three.js Memory Leaks
**Problem**: Geometries or textures steadily climb in `renderer.info.memory` across sector jumps.
**Fix**:
Implement strict disposal lifecycle when unmounting entities or UI stages:
```js
function disposeHierarchy(obj) {
  obj.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      if (Array.isArray(child.material)) child.material.forEach((m) => disposeMaterial(m));
      else disposeMaterial(child.material);
    }
  });
}

function disposeMaterial(mat) {
  for (const key of Object.keys(mat)) {
    const val = mat[key];
    if (val && typeof val === 'object' && val.isTexture) {
      val.dispose();
    }
  }
  mat.dispose();
}
```

### Recipe 6: Eliminating Garbage Collection Churn in the 60 Hz Loop
**Problem**: V8 GC triggers every few seconds, causing 10–20 ms stutter frames.
**Fix**:
1. **Zero allocation in `update()`**: Pre-allocate scratch vectors, matrices, and arrays outside the tick.
   ```js
   // BAD: allocates a new object 60 times a second per ship
   const delta = new THREE.Vector3(target.x - pos.x, 0, target.z - pos.z);

   // GOOD: reuse module-level scratch
   const _scratchVec = new THREE.Vector3();
   _scratchVec.set(target.x - pos.x, 0, target.z - pos.z);
   ```
2. Run `npm run probe:runtime-witness -- --alloc-probe` to find the exact line allocating garbage.

---

## 5. Diagnostic Decision Tree

```
Symptom: Framerate drops or hitches
│
├── Check stats-gl (F3 or ?stats=1)
│   ├── GPU time is high (> 12 ms)
│   │   ├── Inspect with Spector.js (npm run perf:spector)
│   │   │   └── Draw calls > 250? -> Use InstancedMesh or gltf-transform merge.
│   │   └── Check Post-Processing / Bloom
│   │       └── Reduce bloom blur passes, clamp dynamic resolution scale.
│   │
│   └── CPU time is high (> 12 ms)
│       ├── Check renderer.info (Ctrl+Alt+I)
│       │   └── Did programs count increase? -> Late shader compilation hitch!
│       ├── Run GC probe (npm run probe:runtime-witness -- --gc-probe)
│       │   └── Heap collapses after GC? -> Allocation churn in 60Hz loop.
│       └── Check simulation tick in runtime witness report.
│
└── Memory steadily grows over time
    ├── Check renderer.info (geometries/textures climbing?)
    │   └── Missing .dispose() on unmount.
    └── Run MemLab (npm run perf:memlab -- --scenario=station-cycle)
        └── Examine retainer traces for detached DOM nodes or active loops.
```

---

## 6. Quick Command Cheat Sheet

```bash
# 1. Capture WebGL frame & draw call analysis
npm run perf:spector

# 2. Sample 15s of Three.js renderer.info telemetry
npm run perf:renderer-info

# 3. Audit all 3D assets for high draw calls, polys, and VRAM
npm run perf:gltf

# 4. Run automated memory leak detection
npm run perf:memlab

# 5. Full automated performance audit sweep
npm run perf:audit
```
