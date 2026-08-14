<!-- LIFETIME: STABLE -->
# Same-picture performance option space

This is the exhaustive reserved catalog of performance work SpaceFace may later admit.
It does **not** admit work, claim completion, or hold a queue snapshot.

Companion to [`PERF_BUDGET.md`](./PERF_BUDGET.md),
[`PERF_SYSTEMATIC_PROGRAM.md`](./PERF_SYSTEMATIC_PROGRAM.md) when that file is present,
[`PERFORMANCE_OPTIMIZATION_CONSTELLATION.md`](./PERFORMANCE_OPTIMIZATION_CONSTELLATION.md),
and [`CANONICAL_BUILD_MAP.md`](../CANONICAL_BUILD_MAP.md) §8 / §8.1 / §8.2.

Existing identities `PQ-034`–`PQ-044` and `PQ-051`–`PQ-060` stay authoritative for their
scopes. Identities `PQ-061`–`PQ-094` below are reserved so later campaigns can admit
leaves without inventing overlapping outcomes.

## 1. Picture and behavior contract

A plan in this catalog is legal only if the player-facing game is unchanged:

- Default bloom, shadows, particles, render scale, pixel-ratio cap, authored near meshes,
  and on-glass population stay on.
- Input, flight, weapons, collisions, and required physics stay 60 Hz and deterministic
  with `state.rng` / `state.simTime`.
- Browser and Electron remain one game path.
- Only true off-glass roots may drop submit. A timer win that empties the table is a failed cycle.
- Quality knobs, Minecraft-like stand-ins, and camera-facing soft cards (except distant
  background stars) are not optimizations.

A huge job, a Worker, WASM, WebGPU, a native slice, or a Rust island is **in scope**
when it keeps this contract. Size of the job is not a reason to omit the plan.

## 2. What this game is

SpaceFace is a **tilted top-down table**, not a horizon flight sim.

At normal chase distance the readable ground is on the order of one tabletop
(~170×100 world units). Maximum zoom-out is still only a few hundred units across.
If it is not next to the player ship, it is not on the glass.

Plans that assume a distant skyline, far-fleet impostors-as-the-main-win, or
“keep the whole sector meshed so landmarks are specks” must be rewritten against
that table, or executed only for map/UI/background roles.

Three different distances exist and must not be collapsed:

1. **Glass** — what the chase camera actually covers.
2. **Approach runway** — how far a fast ship can travel in a fraction of a second
   (enough to admit a mesh without pop).
3. **Sim/world** — the corridor sector and neighbors that still exist as game state.

Most leftover cost is paying glass prices for (2) and (3).

## 3. How every plan runs

No leaf implements a platform or algorithm because it is fashionable.

```
measure the live pole
  → pick one family from this catalog
  → if the leaf is INV: build the detector/scaffold, write the census, name the owner
  → if the leaf is IMPL: implement only what the census selected
  → shipped tests of the real functions
  → matched same-route A/B that keeps on-glass submit counts honest
  → keep or revert
  → feed any new legal outcome back into this catalog as a new reserved leaf
```

Investigation packets are first-class. Their done condition is a named owner plus
a keep/reject/implement decision, not a green check. The paired implementation
packet is how that decision becomes production.

Standing workflow `PQ-094` is the loop that discovers poles this file does not
yet name.

## 4. Horizon

| Horizon | Meaning |
|---|---|
| **Near** | Weeks. Detectors and tabletop-correct cuts. |
| **Mid** | Months. Admission, compose slicing, residency, cadence, memory. |
| **Long** | Multi-month. Worker, WASM islands, WebGPU backend, native present, Electron GPU process. |
| **Standing** | Recurring measurement that can mint new leaves. |

Horizon is effort, not permission. A Long leaf may be admitted first if the owner
asks for that campaign.

## 5. Reserved identities

### 5.1 Existing modernization and smoothness (do not duplicate)

`PQ-034` measurement · `PQ-037` render packages · `PQ-038` PresentationWorld ·
`PQ-039` hot query · `PQ-040` dirty GPU ranges · `PQ-041` Electron shell ·
`PQ-042` GPU correction · `PQ-043` sim Worker (conditional) ·
`PQ-044` WebGPU/TSL slice (conditional) · `PQ-051` frame liveness ·
`PQ-052` rigid opaque batching · `PQ-053` live LOD/HLOD (reinterpret off-glass
as tabletop cheapness, not a skyline) · `PQ-054` bounded GPU admission ·
`PQ-055` immutable transport · `PQ-056` present/AA · `PQ-057` activity scheduler ·
`PQ-058` resource governor · `PQ-059` WebGPU scaleout · `PQ-060` native trigger.

### 5.2 Investigations and scaffolding

| Plan | Horizon | Player outcome | Scope | Done when |
|---|---|---|---|---|
| **`PQ-061` / `PERF-21-TABLETOP-CENSUS`** | Near | We know, per frame, what is on the glass vs fake-visible vs resident vs simulated. | Headed + unit census: glass half-extents at live zoom; query-box half-extents and margin; `fullSynced` / submit / pool / shadow / closure / mesh-resident / sim-awake counts inside glass, inside runway, and beyond. No product mutation required. | A repeatable probe writes those bands for a fixed seed fly; a same-image IMPL leaf can be chosen without guessing. Feeds `PQ-068`–`PQ-071`, `PQ-077`, `PQ-080`. |
| **`PQ-062` / `PERF-22-HITCH-CLASSIFIER`** | Near | Every frame >32 ms has a named owner. | Scaffold on the live present path: compile, upload, compose, mesh build, shadow, speed-lines, bloom, GC, restore, autosave, unknown. Unit tests of the classifier; headed fly writes a histogram. | A 12 s stimulus fly attributes ≥90% of hitches to a named owner. Feeds `PQ-072`–`PQ-075`, `PQ-087`. |
| **`PQ-063` / `PERF-23-PHASE-TIMERS`** | Near | Sim / render-prep / submit / present / UI / VFX have honest clocks. | Wire or repair GPU timers and CPU phase probes so they measure the real present path (bloom HDR, not a stand-in). Include Intel/ANGLE. | Matched A/B can say which bill grew. Does not itself change the picture. |
| **`PQ-064` / `PERF-24-SHADER-VARIANT-CENSUS`** | Near | We know every live program key (lights, HDR target, batching, shadows, LOD). | Traverse opening + first-combat + traffic; record Three program cache keys; diff against precompile keep-alives. | A list of first-use keys that still compile on the playable path. Feeds `PQ-072`, `PQ-075`. |
| **`PQ-065` / `PERF-25-ALLOC-GC-SOAK`** | Near | We know whether long flight hitches are GC or retained growth. | Heap snapshots, allocation timelines, GPU buffer/texture counts over a multi-sector soak. | Named retainers or “flat.” Feeds `PQ-058`, `PQ-079`, `PQ-086`. |
| **`PQ-066` / `PERF-26-DETERMINISM-LAB`** | Near | Cadence/sleep/worker/WASM candidates can be rejected if they break save/sim hashes. | Lab fixtures that hash the same seed with and without a proposed cadence. No hash goldens edited to pass. | A candidate is legal or illegal for IMPL. Required before `PQ-080`–`PQ-084`. |
| **`PQ-067` / `PERF-27-PLATFORM-SPIKE-MATRIX`** | Mid | Same picture, four spikes, keep/reject each. | Isolated spikes: (1) sim Worker + snapshot, (2) WASM island for one CPU owner, (3) WebGL→WebGPU present of one scene, (4) native present of one scene. Each spike is throwaway-or-promote. JS↔WASM copy cost is measured, not assumed. | Written keep/reject with A/B and picture parity. Feeds `PQ-081`–`PQ-083`, `PQ-089`–`PQ-091`. |

### 5.3 Tabletop-correct implementation (this camera)

| Plan | Horizon | Player outcome | Scope | Done when |
|---|---|---|---|---|
| **`PQ-068` / `PERF-28-GLASS-BOX-SUBMIT`** | Near | Off-glass ships are not drawn. On-glass picture is identical. | After `PQ-061`, set submit to glass + a short measured runway (fast-ship travel in a fraction of a second), not a thousand-unit fake-visible box. Hidden remains the only drop for true off-box roots. | Same seed: on-glass submit counts hold; total submits fall; p95/hitch improve or match vsync. |
| **`PQ-069` / `PERF-29-APPROACH-RESIDENCY`** | Near | Meshes exist just before they can enter the glass, not kilometers away. | After `PQ-061`, prefetch/evict radii become approach-seconds at measured top speed, not 5200/6400-as-horizon. | Off-glass mesh count drops; entering ships do not pop; first-use hitch does not move into Continue. |
| **`PQ-070` / `PERF-30-OFFSTAGE-WORK-FREEZE`** | Near | LOD, shadow policy, closures, and plate pooling do not run for roots we will not submit. | After `PQ-068`. Pose may stay cheap for the runway. | Diagnostics show those owners only on glass+runway. |
| **`PQ-071` / `PERF-31-OFFGLASS-LANDMARKS`** | Mid | A station across the belt is a map fact, not a live 3D resident, until approach. | After `PQ-061` proves whole-sector landmark meshes are off-glass. Map/UI still names them. Background planets that are actually in the sky path stay. | Sector travel no longer keeps unused stations fully meshed; approach rebuilds without pop. |

### 5.4 Admission and hitch removal

| Plan | Horizon | Player outcome | Scope | Done when |
|---|---|---|---|---|
| **`PQ-072` / `PERF-32-EXACT-KEY-PREWARM`** | Mid | First sight of a live program key does not occupy one display callback. | After `PQ-064`. Tiny dummies that match live keys (light count, HDR target, batching defines, shadow depth). Revert if the fly worsens (already observed with a wrong BatchedMesh keep-alive). | `PQ-062` histogram loses that first-use bucket. Continue does not absorb the stall. |
| **`PQ-073` / `PERF-33-COMPOSE-PART-SLICE`** | Mid | Building a ship cannot drop a 40–250 ms brick on the present thread. | Yield between parts / merge slots; never start compose on a late present; cache merged plates. Combat thread stays off sync composition unless a prepared boundary exists. | Worst-frame compose owner in `PQ-062` falls; on-glass ships still appear. |
| **`PQ-074` / `PERF-34-UPLOAD-AFTER-PRESENT`** | Mid | Texture/buffer first upload cannot share the present beat. | One upload after present or next rAF; skip mipgen when the image already has mips. | Upload bucket in `PQ-062` falls. |
| **`PQ-075` / `PERF-35-NEXT-CONTACT-WARM`** | Mid | Only hulls about to enter the glass are warmed. | Combine `PQ-061` + `PQ-064` + traffic intent so warmup follows the table, not the whole sector. | First-combat / first-traffic hitch gone without a loading-screen stall. |

### 5.5 On-glass GPU submit

| Plan | Horizon | Player outcome | Scope | Done when |
|---|---|---|---|---|
| **`PQ-076` / `PERF-36-ONGLASS-LANES`** | Mid | Canopy, plume, decal, and transparent lanes that share a program collapse without changing pixels. | After `PQ-052`. Keep those surfaces out of the rigid opaque batch; give them their own legal lanes if the census shows they dominate on-glass draws. | Fewer submits, identical pixels. |
| **`PQ-077` / `PERF-37-SHADOW-GLASS-SET`** | Near | Only casters that can fall on the visible table pay a depth pass. | After `PQ-061`. Shadow radius/ortho follow glass + skirt, not a multi-screen disk. | Shadows on-glass match; off-glass casters drop; hitch/p95 hold or improve. |
| **`PQ-078` / `PERF-38-PRESENT-FUSION`** | Mid | Still one bloom/HDR present; optional quality-preserving AA only if `PQ-063` says the present bill is the pole. | Extends `PQ-056`. No depth prepass or extra fullscreen without a net same-image win. | Same image; present time down or plan closes no-mutation. |
| **`PQ-079` / `PERF-39-BUFFER-POLICY`** | Mid | BatchedMesh/instance buffers do not hitch on first grow or over-allocate the session. | After `PQ-065`. Start size, growth, and ceiling chosen from census. Revert flight-time growth if A/B worsens. | Allocation hitch bucket falls; VRAM plateaus. |

### 5.6 Simulation and CPU

| Plan | Horizon | Player outcome | Scope | Done when |
|---|---|---|---|---|
| **`PQ-080` / `PERF-40-TABLE-CADENCE`** | Mid | 60 Hz is the table and the fight. Off-table owners sleep. | After `PQ-057` + `PQ-066`. Hostiles/combatants/player stay awake. | Sim p95 ≤ 5 ms in crowded flight; combat authority unchanged. |
| **`PQ-081` / `PERF-41-SNAPSHOT-FENCE`** | Mid | Render reads a dense snapshot; it does not chase live entity objects. | Finish PresentationWorld / snapshot columns so draw is a linear typed-array scan. Required before Worker/WASM. | Zero per-entity object walks on the present path; picture unchanged. |
| **`PQ-082` / `PERF-42-SIM-WORKER`** | Long | Sim tick runs on another core; input/present stay on the UI thread. | Implements `PQ-043` only after `PQ-063` + `PQ-081` show sim is the pole. Same determinism. | Crowded sim p95 meets budget; no input lag; hashes hold. |
| **`PQ-083` / `PERF-43-WASM-SIM-ISLAND`** | Long | One hot CPU island (queries, scheduler, snapshot pack, or traffic) runs in WASM/Rust. | After `PQ-067` measures copy cost. Rapier already occupies physics. Do not wrap Three.js. Snapshot in, snapshot out. | That island’s CPU falls more than the copy costs; hashes hold. |
| **`PQ-084` / `PERF-44-PHYSICS-SLEEP`** | Mid | Far inactive Rapier bodies sleep. Collisions on the table stay authoritative. | After `PQ-066`. | Physics time scales with the table, not the sector. |

### 5.7 Memory, I/O, HUD, audio

| Plan | Horizon | Player outcome | Scope | Done when |
|---|---|---|---|---|
| **`PQ-085` / `PERF-45-PLACE-SHELL`** | Mid | Large places decode a shell first; detail streams when approaching. | Extends `PQ-055`. For this camera, “shell” is what the table can see, not a skyline HLOD. | Continue/approach hitch falls; close picture unchanged. |
| **`PQ-086` / `PERF-46-TEXTURE-RESIDENCY`** | Mid | Off-glass KTX2/maps evict; on-glass maps never thrash. | After `PQ-065` + `PQ-069`. | GPU memory plateaus; no evict/reload flicker on the table. |
| **`PQ-087` / `PERF-47-AUTOSAVE-HITCH`** | Mid | Autosave cannot occupy a display callback. | Slice, defer after present, or worker serialize. Deterministic saves. | Autosave disappears from `PQ-062`. |
| **`PQ-088` / `PERF-48-HUD-AUDIO-CADENCE`** | Mid | HUD DOM and audio graph do not run full work for off-glass or hidden UI. | After `PQ-063` if UI/audio is the pole. | Phase time falls; accessibility and reachability hold. |

### 5.8 Platform scaleout (large jobs stay listed)

| Plan | Horizon | Player outcome | Scope | Done when |
|---|---|---|---|---|
| **`PQ-089` / `PERF-49-WEBGPU-BACKEND`** | Long | Same game, WebGPU present, WebGL rollback. | After `PQ-067` spike and `PQ-044` decision. Render bundles, GPU cull, texture arrays, later meshlets. Not a visual restyle. | Quiet-machine p95/hitch beat WebGL on the same route; pixels match within the declared parity. |
| **`PQ-090` / `PERF-50-NATIVE-PRESENT`** | Long | One native present slice consumes the same snapshot/input/save. | After web families and `PQ-089` are exhausted or rejected. Electron addon or sibling process. Same art. | Slice beats web p99 without product divergence, or the plan closes not-triggered with evidence. |
| **`PQ-091` / `PERF-51-RUST-ISLANDS`** | Long | Additional Rust/WASM islands beyond `PQ-083` (full sim tick, spatial index, save packer). | Never ports Three.js. Interop is snapshot/SAB only. Full-engine rewrite (Bevy/Fyrox/custom) is a `PQ-090` successor, not a silent swap. | Named islands beat JS+copy; hashes and picture hold. |
| **`PQ-092` / `PERF-52-ELECTRON-PRESENT`** | Mid | Electron’s GPU process, vsync, and swap no longer add hitch vs the browser route. | After `PQ-063` compares shells. Same game bytes. | Browser and Electron hitch/p95 match on the same save. |
| **`PQ-093` / `PERF-53-SHARED-ARRAY-SNAPSHOT`** | Long | Worker/WASM publish through SharedArrayBuffer without structured-clone tax. | After `PQ-081`/`PQ-082`. Fallback when SAB is unavailable. | Copy time disappears from the phase timer; determinism holds. |

### 5.9 Standing discovery

| Plan | Horizon | Player outcome | Scope | Done when |
|---|---|---|---|---|
| **`PQ-094` / `PERF-54-POLE-SWEEP`** | Standing | New poles become new reserved leaves instead of folklore. | Recurring: run `PQ-061`–`PQ-063` on the current default route; if a pole has no leaf, add one here; if a leaf is disproved, mark reject and keep the evidence. | Each sweep produces a keep/reject/new-leaf note. Never “done forever.” |

## 6. Investigation protocols (scaffolds this catalog may build)

These are tools, not outcomes. A campaign may build any of them when a leaf needs them.

- **Glass-band probe** — counts submit/LOD/shadow/mesh/sim by glass / runway / beyond.
- **Hitch ring** — owner enum on every >32 ms present.
- **Program-key dump** — live Three cache keys vs keep-alive set.
- **Phase clocks** — CPU + `EXT_disjoint_timer_query` on the real bloom path.
- **Alloc soak** — heap + GPU object counts across sectors.
- **Hash pair** — same seed with/without a cadence or Worker.
- **Platform spikes** — Worker, WASM, WebGPU, native, each isolated.
- **Interop bench** — JS object walk vs typed snapshot vs SAB vs postMessage copy.
- **Shell pair** — Browser vs Electron on one save.
- **Restore/TDR drill** — lose context, count hitch and recovery.
- **Spector / RenderDoc / PIX / Intel GPA** — draw-family census when submit is the pole.
- **Chrome trace / GC** — when `PQ-065` is the next question.

Detectors must read the live player route, not a convenient stand-in.

## 7. Implementation-after-investigation

| If the census says… | Admit / resume |
|---|---|
| Off-glass submit/LOD/shadows dominate | `PQ-068`–`PQ-071`, `PQ-077` |
| First-use compile/upload/compose dominate | `PQ-072`–`PQ-075`, `PQ-073` |
| On-glass draw count still misses vsync | `PQ-076`, `PQ-052`, `PQ-078` |
| Sim p95 misses 5 ms and GPU is cheap | `PQ-080`–`PQ-084`, then `PQ-043`/`PQ-082` |
| Copy/interop dominates a WASM trial | `PQ-081`, `PQ-093`, or reject `PQ-083` |
| Memory grows across travel | `PQ-058`, `PQ-086`, `PQ-085` |
| Autosave or HUD/audio is the hitch owner | `PQ-087`, `PQ-088` |
| Web structural families exhausted, p99 still high | `PQ-089`, then `PQ-090`/`PQ-091` |
| Electron worse than browser | `PQ-092` |
| Unknown | `PQ-094` plus a new reserved leaf |

## 8. Explicitly not discarded

These stay in the catalog even when expensive:

- Simulation Worker and SharedArrayBuffer snapshots.
- Rust/WASM islands and a later full native present.
- WebGPU backend and GPU-driven cull/meshlets.
- Electron GPU-process / swap work.
- Part-sliced authored compose (large refactor).
- Offline place/ship shells and exact-key prewarm.
- Replacing Three.js **only** as the `PQ-090` successor after a native slice proves the product still matches.

These stay **illegal** as optimizations:

- Lowering default quality, emptying the glass, or fake-star billboards for things the player can fly past.
- Editing sim goldens to hide a cadence change.
- Calling a spike “done” without picture parity and a matched A/B.

## 9. Suggested default order (not a lease)

When no owner campaign is named: `PQ-061` → `PQ-062` → `PQ-063` → then the table in §7.
`PQ-094` may run in parallel as measurement only.
`PQ-067` and Long platform leaves wait until §7 points at them, unless the owner starts that campaign explicitly.
