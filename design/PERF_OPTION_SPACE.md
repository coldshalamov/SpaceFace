<!-- LIFETIME: STABLE -->
# Same-picture performance option space

This is the exhaustive reserved catalog of performance work SpaceFace may later admit.
It does **not** admit work, claim completion, or hold a queue snapshot.

Companion to [`PERF_BUDGET.md`](./PERF_BUDGET.md),
[`PERF_SYSTEMATIC_PROGRAM.md`](./PERF_SYSTEMATIC_PROGRAM.md) when that file is present,
[`PERFORMANCE_OPTIMIZATION_CONSTELLATION.md`](./PERFORMANCE_OPTIMIZATION_CONSTELLATION.md),
and [`CANONICAL_BUILD_MAP.md`](../CANONICAL_BUILD_MAP.md) §8 / §8.1 / §8.2 / **§8.3
(exhaustive technique inventory)**.

Existing identities `PQ-034`–`PQ-044` and `PQ-051`–`PQ-060` stay authoritative for their
scopes. Identities `PQ-061`–`PQ-123` below are reserved so later campaigns can admit
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

## 3. Universal investigate → invalidate → implement workflow

No leaf implements a platform or algorithm because it is fashionable. Every
reserved identity, including later ones minted by `PQ-094`, uses this loop.

### 3.1 Investigate

1. Name the **player symptom** (steady 30 Hz, one 100 ms hitch, Continue stall, long-session decay).
2. Build or reuse a **detector** from §6 that reads the live player route, not a stand-in.
3. Run a **fixed-seed glass fly** (and Continue if the symptom is boot). Write raw JSON.
4. Split cost into **glass / runway / beyond** and into **owner buckets** (compile, upload,
   compose, submit, present, sim, HUD, audio, save, GC, unknown).
5. Write a one-page census: owner, when it fires, whether it can change the picture,
   and the smallest legal IMPL leaf.

Done for INV: a named owner plus `implement` / `reject` / `needs-deeper-inv`. Not a green check.

### 3.2 Invalidate (reject without implementing)

Reject the candidate when **any** of these hold:

- The census says that owner is not on the pole (another bill is larger).
- A same-route A/B with the candidate **worsens** p95, hitch, or worst-frame.
- On-glass submit counts collapse, bloom/shadows drop, or pixels change.
- Sim hashes move and `PQ-066` did not pre-clear that change.
- The stall merely **moved** (into Continue, first shot, or sector entry).
- JS↔WASM / Worker **copy** costs more than the island saves (`PQ-067` bench).
- The idea needs a quality knob or an empty sky to “win.”

Write `reject` plus the fingerprint. Keep the detector. Do not retry the same
candidate against the same harness without a relevant change.

### 3.3 Implement

1. Admit the **smallest** IMPL leaf the census selected. One pole per cycle.
2. Ship tests that drive the **real** functions (no re-implemented oracle).
3. Matched interleaved A/B; on-glass submit and default picture stay honest.
4. **Keep** only if hitch and/or p95 improve (or already vsync) and the picture holds.
5. **Revert** otherwise. Feed any new legal outcome into this catalog as a new leaf.

```
symptom → detector → census (INV)
       → invalidate?  reject + keep evidence
       → else one IMPL leaf → tests → A/B → keep|revert
       → PQ-094 sweep → new leaf if a pole has no name
```

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

### 5.10 Additional reserved leaves (gaps after §5.2–§5.8)

These are legal same-picture routes that the first catalog pass did not name.
Each still starts as INV unless a prior census already named that owner.

| Plan | Horizon | Player outcome | Scope | Done when |
|---|---|---|---|---|
| **`PQ-095` / `PERF-55-SKY-ON-A-TABLE`** | Near INV→IMPL | Starfield, parallax, deep-field, and planet cards cost what a tabletop can use, not a horizon sim. | Census `spaceBackground` / parallax / deep-field / sky planets vs glass. Invalidate if they are already cheaper than submit. Else cadence, residency, or cheaper sky depth that still reads as sky. | Sky phase falls or reject; glass picture including sky unchanged. |
| **`PQ-096` / `PERF-56-EVENT-LIGHT-CARDINALITY`** | Mid INV→IMPL | Always-visible event lights stop baking unused light-count variants into every program. | Census live point-light count vs flashes. Three bakes visible light count into the program key. Options: intensity-only pool already matching compile; fewer reserved slots if the picture matches; exact-count prewarm (`PQ-072`). | First-flash hitch gone; combat lighting looks the same. |
| **`PQ-097` / `PERF-57-BLOOM-RESOLVE`** | Mid INV→IMPL | Bloom/HDR present costs less at the same look. | After `PQ-063` says present is the pole. Half-res or R11G11B10 bloom, fewer pyramid levels, same default strength. Pixel-diff the glass. Invalidate if the halo changes. | Present time down; matched stills keep. |
| **`PQ-098` / `PERF-58-SPEEDLINE-OFFTHREAD`** | Mid INV→IMPL | Boost speed-lines cannot hitch the 3D present. | Census Canvas2D overlay. Options: cache strokes (partially shipped), OffscreenCanvas worker, GPU polyline, skip one frame after late present (shipped). | Speed-line bucket leaves `PQ-062`; boost still reads. |
| **`PQ-099` / `PERF-59-SCENE-GRAPH-FLATTEN`** | Mid INV→IMPL | `updateMatrixWorld` / child walks do not scale with off-glass graphs. | Census Object3D count and matrix updates on glass vs beyond. Flatten or freeze static station/place graphs; layers bitmask for glass. | Prep CPU falls; sockets/animation that must move still move. |
| **`PQ-100` / `PERF-60-ORIGIN-REBASE-HITCH`** | Mid INV→IMPL | Floating-origin rebase is not a 30–100 ms hitch. | Census rebase frequency and cost (batch bounds, instance buffers). Invalidate if rare and cheap. Else dirty-only refresh (partially shipped). | Rebase disappears from `PQ-062`. |
| **`PQ-101` / `PERF-61-CATCHUP-SPIRAL`** | Near INV→IMPL | A late render does not cascade extra sim steps into the next miss. | Census `MAX_CATCHUP_STEPS` / accumulator after hitches. Cap or shed without teleporting the ship. | One hitch does not become three; determinism/`PQ-066` holds. |
| **`PQ-102` / `PERF-62-MENU-WORLD-UNLOAD`** | Mid INV→IMPL | Station UI, map, and pause do not keep a full flight world submitting. | Census hidden-screen 3D. Unload or freeze the flight scene when the player cannot see it; restore on exit without a seconds-scale hitch. | Hidden screens drop GPU; return-to-flight picture matches. |
| **`PQ-103` / `PERF-63-DECODE-WORKER`** | Mid INV→IMPL | GLB / KTX2 / Basis / meshopt decode is not on the present thread. | Worker or WASM decode; ImageBitmap / createImageBitmap. Main thread only installs GPU objects (`PQ-074`). | Decode bucket leaves `PQ-062`; assets look the same. |
| **`PQ-104` / `PERF-64-BINARY-SHADER-CACHE`** | Mid INV→IMPL | Repeat boots reuse driver program binaries. | Chromium/Electron program binary cache, WebGPU pipeline cache. Invalidate if first-run fly is unchanged and only boot changes. | Warm launch first-use compile histogram shrinks. |
| **`PQ-105` / `PERF-65-AUDIO-TABLE-CULL`** | Near INV→IMPL | Audio sources follow the table, not a 900 WU horizon. | Census voice count vs glass. Cull/mix only what the player can hear next to the ship. | Audio CPU falls; combat and UI sound unchanged. |
| **`PQ-106` / `PERF-66-HOT-ALLOC-SHAPES`** | Mid INV→IMPL | Per-frame object/event/string allocation is not the hitch owner. | After `PQ-065`. Pool events, SoA traffic, monomorphic hot functions, no megamorphic adds. | GC hitch bucket falls or reject. |
| **`PQ-107` / `PERF-67-STATE-CHANGE-SORT`** | Mid INV→IMPL | On-glass draws are ordered to minimize program binds, not random scene order. | After `PQ-063` says submit is still the pole on-glass. Sort opaque by program; optional front-to-back. Pixel-diff. | Draw time down; pixels match. |
| **`PQ-108` / `PERF-68-TINY-ONGLASS-LOD`** | Mid INV→IMPL | A 30-pixel on-glass fighter is cheap; a 120-pixel fighter is full. | This is **on-glass** LOD for this camera, not a far-world impostor. After `PQ-061` projected-px histogram. | Tiny contacts cheaper; close ships unchanged. |
| **`PQ-109` / `PERF-69-GL-CONTEXT-FLAGS`** | Near INV→IMPL | Canvas/GL flags do not add a hidden copy (alpha, preserveDrawingBuffer, desynchronized, powerPreference). | A/B each flag. Invalidate if picture or input latency worsens. | Present time down or reject per flag. |
| **`PQ-110` / `PERF-70-ANGLE-BACKEND`** | Mid INV→IMPL | Electron/Chromium uses the fastest legal ANGLE backend on this GPU (D3D11/D3D12/Vulkan). | Same game, different plumber. Invalidate if artifacts or worse hitch. | Quiet fly p95/hitch improve or reject. |
| **`PQ-111` / `PERF-71-PIXEL-PARITY-GATE`** | Near INV | Same-picture claims have a glass still-diff, not hope. | Scaffold: paired stills, ignore grain if needed, fail on emptied sky or missing bloom/shadows. Used by every IMPL A/B. | Later leaves can be invalidated automatically when the table changes. |
| **`PQ-112` / `PERF-72-THERMAL-NOISE`** | Standing | A/B pairs that are GPU-clock or thermal noise are discarded, not averaged. | Detect clocks/thermals; require interleaved pairs. | Saturated pairs cannot pass a leaf. |
| **`PQ-113` / `PERF-73-PROD-PROBES-OFF`** | Near INV→IMPL | Production default does not leave hitch rings, GPU timers, or debug traversals on. | Census default-on probes. Keep them opt-in. | Default fly does not pay debug tax. |
| **`PQ-114` / `PERF-74-IDLE-ADMISSION`** | Mid INV→IMPL | Compile/upload of the *next* contact happens in true idle, not on rAF. | `scheduler.yield` / idle callback **after** present, never `setTimeout(0)` stacked on the next rAF (already shown to floor 30 Hz). | Next-contact warm without stealing vsync. |
| **`PQ-115` / `PERF-75-VFX-ONGLASS`** | Mid INV→IMPL | Trails, sparks, lights, and flipbooks exist only for on-glass + short runway. Loot-magnet trails follow the live table and keep a 580 WU tractor inner-band cap when the table is wider. Glass origin is `tableLookAtDelta` for seams, station lamps, NPC signatures, and loot-magnet. | After `PQ-061`. Pixel-floor already exists for some FX; extend to pools. | VFX draw/CPU scale with the table. |
| **`PQ-116` / `PERF-76-HDR-BUFFER-FORMAT`** | Mid INV→IMPL | Scene/bloom targets use the cheapest format that keeps the default halo. | HalfFloat vs R11G11B10 vs RGBM; Intel-specific. Feeds `PQ-097`. | Present/fill down; stills keep. |
| **`PQ-117` / `PERF-77-HIDDEN-SYSTEM-SKIP`** | Near INV→IMPL | Registry systems do not full-tick when the 3D world is not on screen. | Pause, map, station shell, loading. Input/save stay alive. | Hidden-screen CPU/GPU drop; resume hashes hold. |
| **`PQ-118` / `PERF-78-REPLAY-PERF-BISECT`** | Mid INV | A hitch can be bisected with a deterministic replay instead of folklore. | Record input+seed; replay; classify (`PQ-062`). | A named hitch is reproducible offline. |
| **`PQ-119` / `PERF-79-TABLE-MAP-SPEC`** | Near IMPL | Off-table contacts stay map/radar facts. | After `PQ-061`/`PQ-071`. No live mesh for stations or traffic that cannot enter the glass this second. | Census shows beyond-band roots are not resident; map still names them. |
| **`PQ-120` / `PERF-80-TABLE-READABLE-REMASTER`** | Near INV→IMPL | Starter and other camera-prominent ships spend remaster budget on mid-scale openings that read at default zoom 144 (drive barrels you can look down, hat-section wells, framed canopy), not stacked micro-greebles. | Learned from Hitch cycles 01–06: adding primitives raised clay toy-read and did not beat live V9 at tabletop size. Cut/hide donor slabs and iris shutters; boolean or replace sealed housings. | Clay is manufactured form; rear camera sees into the drive; sponson is not a sealed board. |
| **`PQ-121` / `PERF-81-VFX-FOCUS-ORIGIN`** | Near IMPL | Cosmetic VFX glass culls use the live look-at, not the player pin. | Combat/tether camera shove must not drop on-glass lights. Tractor cap stays player-centered. | On-glass VFX survives a shove; off-glass stays dim. |
| **`PQ-122` / `PERF-82-TABLE-ASPECT-CLAMP`** | Near INV | Ultrawide windows do not grow sim authority back into a horizon. | Letterbox to three 16:9 panes or accept sleeping side-edge civilians. | Far side-edge traffic stays a map fact. |
| **`PQ-123` / `PERF-83-INSTANCE-FAR-CULL`** | Near IMPL | Instance far cull follows the live camera table, not a leftover 9000 WU horizon. | Submit already drops off-table roots. Keep the 420 WU owner-sphere pad. Default covers 90° / 330 WU 16:9 as 3D camera distance. | No horizon instance tax; on-glass batches stay. |

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
- **Glass still-diff** — `PQ-111` paired stills for same-picture invalidate.
- **Thermal/clock guard** — `PQ-112` so noisy pairs cannot pass.
- **Light-count / program-key pair** — `PQ-096` with `PQ-064`.
- **Hidden-screen probe** — `PQ-102` / `PQ-117` (map, station, pause).
- **Decode-thread probe** — `PQ-103` main vs worker.
- **Replay tape** — `PQ-118` input+seed for hitch bisect.

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
| Sky/parallax/deep-field dominate on a table | `PQ-095` |
| First flash / new light-count compile | `PQ-096`, `PQ-072` |
| Bloom/HDR present is the remaining pole | `PQ-097`, `PQ-116`, `PQ-078` |
| Speed-lines hitch | `PQ-098` |
| Matrix/graph walks dominate prep | `PQ-099` |
| Origin rebase hitch | `PQ-100` |
| One hitch becomes several | `PQ-101` |
| Menus still draw the world | `PQ-102`, `PQ-117` |
| Decode/transcode on rAF | `PQ-103`, `PQ-104` |
| Audio CPU vs 900 WU cull | `PQ-105` |
| Tiny on-glass ships still full lod0 | `PQ-108` |
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
