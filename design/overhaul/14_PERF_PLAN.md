# 14 — The performance plan: three campaigns, one bar

**Written 2026-11-22 for the owner, from the repo's own measurements.** Evidence base:
`.devshots/frame-cost/owner-r6/cur-r0.json` (the round-6 profile), the four audit lists in
`.devshots/director/fable/audits/`, `02_INSPECTION_LEDGER.md` E1–E5, `12_PIPELINE.md` §4,
`design/archive/perf/PERF_BUDGET.md`, a fresh `scripts/audit-asset-cost.mjs` run (2026-11-22),
and a read of the runtime asset load path. Nothing here overrides a ruling; R14 (fix it with
architecture, never by making the game dumber or uglier) governs every line.

The bar, from `12_PIPELINE.md` §4 and `PERF_BUDGET.md`:

| Measure | Now | Bar |
|---|---|---|
| Swarm round 6, owner's laptop | 8.2 fps (9.3 after four fix passes) | steady 60; never under 30 |
| Adventure flight, 170 s | 35 fps avg, swinging 9–57; 5 freezes, longest 3.6 s | steady 60; 0 freezes |
| Sim step, Adventure / Swarm w15 | 8.6 med / 13.6 p95; 9.5 / 14.8 p95 / 58 worst | < 8 ms p95, worst < 16 |
| Boot to title / New Game→flight / PLAY→first hostile | 38.5–65 s / 13.5–114 s / 36–42 s | ≤ 10 s / ≤ 10–20 s / ≤ 5 s |
| Foundry set GPU | ~17–20 ms/frame (~70 ms scene GPU at native, r20) | holds 30 with room; 60 in reach |

Three campaigns, in priority order:

| Campaign | The player gets | The lever |
|---|---|---|
| **R — the crowded fight** | A round-6 fight that holds 30–60 fps | Stop doing per-frame and per-step work that only needs to be recent |
| **B — the bake cache** | Title in seconds, not a minute; no re-derivation every boot | Derive once, persist by content hash; decode off the glass thread |
| **G — the GPU rebake** | Wreck fields, stations and the Foundry draw for a fraction of the GPU cost | Re-run the release compiler with merge groups, right-sized textures, decimation |

R is the owner's felt pain and already has five engineers on it (PERF-AUDIT-LISTS); this page
orders their checklists. B is the "long batch processing task" the owner asked about. G is
offline asset work with no runtime risk until the re-pin. PERF-AB (same-machine A/B) gates all
three.

---

## 1. Campaign R — the crowded-fight frame

The round-6 profile is not GPU-bound and not draw-call-bound: presentation p50 68.7 ms, UI
20.1 ms, render 36.7 ms; top self-time is program linking (71.9 ms/s), `drawSmartLabel`
(44.4), `querySelectorAll` (27.7), `getBoundingClientRect` (22.7). The cause is a pattern: work
that only needs to be recent is done in full every frame or every step. The four audit lists
already locate every instance. Land them in this order — each item is a slice with its own
before/after.

### R1. The hottest single functions (audits A1–A5)

| Fix | Where | Evidence |
|---|---|---|
| Cache `measureText` by (text, font) — one Map, cleared on font change | `src/ui/map/flightMinimap.js:1803` `drawSmartLabel` | 44.4 ms/s self, hottest UI function |
| Cache avoid-rect rows; invalidate on DOM mutation (ResizeObserver), not per frame | `src/ui/hudAvoidRects.js` | 34.8/35.1 ms/s inclusive, `querySelectorAll` + `getBoundingClientRect` per row per frame |
| Cache element refs once per screen open; no `getElementById`/`qSA` in the frame path | `src/ui/hud.js` receipt lane, obstacle snapshot | 15.6 ms/s inclusive; snapshot gates the whole HUD walk |
| Throttle the tether's self-rescheduling rAF loop to actual tether changes | `contracts.js` `layTether` | 34 DOM reads every frame while open, 15+ forced-layout |

Done when: a frame-path trace shows zero `measureText`/`querySelector*`/`getBoundingClientRect`
per frame in steady flight (`check:ui:perf`, `probe-frame-cost` census).

### R2. Zero forced layouts in the frame path (A6)

190 per-frame reads follow a style/class/text write in the same function — each is a guaranteed
layout flush inside the hot loop. Fix class: batch writes, read once, then write; or keep the
read data cached. Mechanical, list-driven, checkable line by line against
`audits/ui-layout-reads.txt`.

### R3. The UI clock collapse (A8)

130 rAF registrations + 8 intervals under `src/ui` are throttled to 10/20/30 Hz — but at 8 fps
every clock fires on essentially every rendered frame; the throttling design collapses exactly
when needed most. Drive HUD sub-updates from the one frame loop with skip counters, not from
per-widget clocks.

### R4. Freeze the static scene (audits C1–C5)

- 257 "likely static, matrix NOT frozen" creations: `asteroidInteriorPreview.js` (72),
  `lawArenaDressing.js` (47), `visualFactory.js` (59), the rest in set pieces, stations, arena
  dressing. Freeze via the existing `freezeStaticChildMatrices` walk — the tool already exists,
  the calls are missing.
- Freeze subtrees of dynamic ships (turrets, lamps, decals that never move relative to the
  parent) — 424 dynamic-looking sites, check children not just roots.
- 513 creation sites allocate a `new Material`/clone per object — move to shared material
  caches; per-object materials defeat the program cache and add compile churn (the profile's
  program-link cost is first-use churn made worse by this).
- Early-out the whole-scene hooks when nothing changed: `deepFieldStars.js:313`,
  `visualFactory.js` onBeforeRender blinkers/shimmer/glint (lines 2326–4620).
- Classify the 534 "unknown" creation sites; freeze or mark them.

Done when: `probe-frame-cost` census shows `matrixAutoUpdate` on only genuinely moving nodes;
`updateMatrixWorld` + `projectObject` self-time falls out of the profile's top ten.

### R5. Frame-path garbage (audits D1–D10)

- `syncEntityViewsSteps` (`src/render/renderer.js:31090`): 3 × `new Float64Array(16)` + object
  literals per visible entity, per frame, bypassing the per-entity scratches the file already
  documents. Scratch-reuse.
- 94 closures created inside loops — hoist; they also defeat JIT inlining.
- 85 `new Set` + 56 `new Map` rebuilds per frame — retained collections, cleared per frame.
- 136 spreads + 11 `.concat(` in frame code — hidden allocations.
- Gate the 11 `JSON.stringify` calls in frame functions behind a debug flag.

Done when: soak holds the ceilings (heap < 3 MB/min, geometries/textures < 2 %/min) with the
round-6 crowd alive, and the 975 ms worst snapshot gap is gone.

### R6. The sim step under 8 ms p95 (audits B1–B9)

The bus fires 1,103 distinct event names from step-reachable code; the aggregate, not any one
event, is the cost. The fix shape already exists in the codebase — `presentation:vfxCue` and
`camera:shake` are batched sim→render crossings, and R20 deleted the five-second market pass by
going closed-form. Copy that shape:

- Queue and coalesce `toast` (285 sites), `comms:popup` (205), `comms:log` (160), `audio:cue`
  (340) per tick — buffer, flush once.
- Economy intents (`grantCredits`/`chargeCredits`, 71 per-step sites) drain once per tick
  through the economy owner.
- `src/systems/missions.js` (101 per-step sites, densest file): mission bookkeeping only needs
  to be recent — dirty flags, not per-tick emits.
- Time-slice the "only-needs-recent" systems (planning, sensing, law, news, ambient directors)
  on the budgeted frame-task scheduler that already landed (`522811d30b`); the worker
  directive cap (`a6f74d2cbf`) and PERF-09 (`6ff08d5ac8`) are the precedent slices.
- The 516 "unknown" emit sites: classify before assuming they are cold.

Done when: `scripts/probe-worker-physics-load.mjs` and the w15 headless crowd read < 8 ms p95,
worst < 16. Any change that intentionally alters sim behaviour re-records the `check:sim`
golden in the same change; a moved hash otherwise is a bug.

---

## 2. Campaign B — the bake cache (boot and load)

Boot re-derives, every time, work whose inputs never change. The fix is one rule: **derive
once, key by content hash, persist** — the precedent is `src/render/programBinaryCache.js`,
which already persists shader binaries to IndexedDB. The wishlist in
`design/archive/perf/PERF_TOP10_AND_BACKLOG_2026-09-13.md` names half of these.

### B1. Persist composed-ship static batches (the big one)

Today every loadout template merges static geometry at runtime — clone → de-index → transform
→ merge (`src/render/partsLibrary.js:14654–14810`) — into RAM-only caches (LRU 48 entries,
template cache 32 entries / 32 MiB). Every boot rebuilds all of it; mid-flight eviction
re-merges on the glass. Bake the merged static batch per archetype into the loadout's package
(or a sidecar keyed by the loadout hash) at first composition, persist, and load it directly
afterwards. The `flightStaticV3` instance-plan lane is the existing seam for shipping the
precompiled table.

### B2. Parse packages off the glass thread

`GLTFLoader.parse` builds the scene graph on the main thread per package load
(`src/render/renderPackageLoader.js:1608`); meshopt decode and image slicing already moved to
workers. Either move the parse behind the same worker pool, or take the path the code already
anticipates — a flat binary artifact (`src/render/flightProductCooker.js:36` notes "a future
flat artifact loader") produced by the render-package compiler, so runtime "parse" becomes
attribute-array upload.

### B3. Transcode KTX2 once

Every texture transcodes from Basis on every load — a 15-texture ship package serialises into
~4 worker waves (`src/render/assetLoader.js:375–430`). Cache the transcoded GPU-ready payload
keyed by texture content hash (programBinaryCache pattern), or pre-transcode per target format
in the release lane.

### B4. Verify once, not per fetch

Every package fetch hashes every byte (render.glb + each external KTX2,
`src/render/renderPackageLoader.js:1416–1470`). In packaged Electron builds, verify against a
signed manifest at install; keep per-fetch hashing in dev.

### B5. Bake the canvas textures

`src/render/canvasTextures.js` generates deterministic seeded noise/greeble/panel textures on
the main thread every boot — the header measures ~49 MB + 12.3 MB scratch for one 1024 fbm —
uploaded uncompressed RGBA and never disposed. They are deterministic: bake them to KTX2 at
build time.

### B6. Bake the small derivations

- `sfHullPosition` per-vertex attribute (`src/render/illustratedHullLayout.js:24–70`) — an
  O(vertex) decode loop per package load; bake it into the GLB.
- Scenario prop batching (`src/render/scenarioPropBatching.js`, called from
  `visualOverrides.js`) merges per prop group at load with no cache — cache by group hash.

### B7. Compressed world textures

Rock family JPG/PNGs (`src/render/rockFamilyLibrary.js`), painted planet atlases, and the
8 MB RGBA deep-sky plates upload uncompressed with runtime mipgen. Convert offline to KTX2
through the existing release profiles.

### B8. Boot sequencing, under R25

R25 rules the boot: load slower rather than hitch the movie. The bake/prefetch work belongs in
the movie window and the loading cook; the ~700 no-cache module revalidations and 17 buffer
stalls on the movie (ledger E-rows, R25) get fixed at the server/packaging layer, not by
shrinking the movie.

Done when: `npm run capture:opening` reads title ≤ 10 s, New Game→flight inside the bar,
PLAY→first hostile ≤ 5 s, and `check:hitch-budget` stays green through sector entries — all
through the game lock on a quiet machine, before/after in the same change.

---

## 3. Campaign G — the GPU rebake (assets)

Fresh `audit-asset-cost.mjs` run (2026-11-22, full JSON): 50 packages with same-material
primitives worth **4,005 draw calls/frame** (per instance), 48 packages holding **84.9 MB** of
oversize GPU texture residency, and 2 triangle spikes totalling **231,134 triangles**. Corpus:
434 models actually drawn (252 MB, 4.53 M LOD0 triangles); 2.02 GB of GLBs nothing references
(disk hygiene, not perf).

### G1. Merge groups for the fifty (4,005 draw calls/frame)

The compiler already joins primitives (`joinPrimitives` in
`scripts/lib/renderPackageCompiler.mjs:650–695`) but only inside authored
`semanticManifest.mergeGroups`. The fifty flagged packages — worst first: the aftermath wreck
family (152 primitives on one material in the bow-stripped package alone ≈ 293 dc/frame per
instance), `last_argument` (159), `stormshift-collector` (125), `ceres-breaker` (106),
`jump-ring` (97) — need groups derived (same material + same parent + join-safe mode), then a
recompile and manifest re-pin. The runtime's rigid-opaque BatchedMesh pool already absorbs the
eligible statics; this pass targets exactly the residue it cannot (canopies, decals, nav
lights, transparents). Wreck fields and wave crowds carry these bodies many at once, and they
repeat every wave.

Draw calls are **not** the round-6 pole (22–96/frame was measured as fine; the r6 profile's 245
spikes with crowd scale) — this campaign is for the GPU-side state/program churn and the
crowd/wreck scenes, not a frame-rate promise.

### G2. Finish the texture right-sizing (84.9 MB)

The landed TEXTURE-DOWNSIZE re-encoded 36 release-part bodies (~94.5 MB) and left ships,
stations and the render-packages untouched. The remaining 84.9 MB lives in
`render-packages/*/render.glb` — 1024 px sets on bodies that never exceed ~110 px at the
closest framing (the audit computes the cap from the real camera, zoom range and px/WU).
Recompile those 48 through the release lanes' own profiles, re-pin, and add the audit's
oversize rule as a build check so new packages cannot ship oversize.

### G3. Decimate the two spikes (231k triangles)

`wreck-cathedral` carries 166,944 triangles on a wreck whose siblings carry a fraction of
that; the audit names the second. Re-bake at authored-LOD1 density — these are far props.
Frames judged before landing (director's eye).

### G4. The Foundry set (~17–20 ms GPU/frame)

OVH-03a's own board note: cut the cost before it can hold 60. With G1–G3 landed the set
re-measures; the queued defects (furnace casing vanishing, Shadows Off bypass) ride the same
pass. Bar from §4: holds 30 with room.

### G5. LOD everywhere it is safe

DRAW-COST-1 (building) re-enabled demotion for anonymous hostiles with a single-frame
safe-swap (`src/render/wholeShipLodPolicy.js:15`). All 120 hull bodies already ship authored
lod1 — the triangles are paid for either way. Once the swap is proven in play, extend demotion
to traffic and distant faction hulls, which today always draw LOD0. Named, mission and player
hulls keep close detail by policy.

Done when: scene GPU p50 at native in the Foundry round-20 probe fits the 30/60 bars;
round-6 draw calls sit inside the normal band at crowd peak; `perfRuntime` texture residency
drops by the promised MB; every visible change is judged by opening the frame.

---

## 4. Order of work

1. **R1–R2** (hottest UI functions + forced layouts) — smallest diffs, biggest single profile
   hits; unblock everything else by raising fps out of the clock-collapse regime.
2. **R6 slice 1** (toast/comms/audio coalescing + economy intents) — the sim's biggest
   per-step fan-out, following the R20 shape.
3. **B5 + B7** (bake canvas textures; compress world textures) — offline-only, no runtime
   code, lands while R works.
4. **R3–R5** (UI clocks; static freeze; frame garbage) — list-driven sweeps.
5. **B1** (persist static batches) — the biggest boot item; needs its own lane and a soak.
6. **G1–G2** (merge groups; right-size) — batch rebake + re-pin + frame judgement.
7. **R6 slice 2** (missions bookkeeping, time-sliced recent-only systems).
8. **B2–B4, B6** (worker parse / flat artifact; transcode cache; verify-once; small bakes).
9. **G3–G5** (decimation; Foundry re-measure; LOD extension).
10. **PERF-AB** after each campaign, not at the end — old build against new, flown alternately
    on the same quiet machine, so every fps change is attributed.

## 5. How every claim is checked

- One game instance at a time: wrap anything that boots the game in
  `node scripts/fleet/game-lock.mjs run -- <command>`.
- Gates on **p95/p99 and hitch count, never averages** (`PERF_BUDGET.md` §1; enforced by
  `npm run check:perf-budget`). The named probes: `check:perf`, `check:hitch-budget`,
  `check:ui:perf`, `check:perf:attribution`, `probe-frame-cost` / `probe-frame-toggle`,
  `scripts/soak.mjs` ceilings, `capture:opening` for the player route.
- Speed claims carry a matched before/after in the same change. Visible changes are judged by
  opening the frame. Sim-behaviour changes re-record the `check:sim` golden in the same change
  and say so.
- Forbidden as a "fix" (R14 / `PERF_BUDGET.md` §3): turning down render scale, pixel ratio,
  bloom, shadows or particle quality to pass a gate; claiming a win from average fps while
  p95/hitches regress.

## 6. What this plan deliberately does not do

Measured dead ends, do not re-propose: draw-call count as the round-6 pole, bloom (~1 % of
frame), Rapier physics (66 bodies / 0.8 ms), download size, shader disk cache, exact-key dummy
prewarm (made it worse), Vulkan ANGLE, hidden interior geometry, instanced hulls for hundreds
of ships (dropped by R19), quality-cut defaults. And the 2.02 GB of unreferenced GLBs is a
hygiene sweep, not a performance task — nothing loads them.

## 7. Execution log (what landed, with the numbers it landed with)

- **G1 landed** (`eafef8b103`, 2026-11-22): compile-time static merge for plain packages.
  Same-parent immutable opaque meshes join into one mesh per material. The stripped
  ore-freighter bow draws 15 calls instead of 308 at the same 9,888 triangles and 0.044 % pixel
  drift (before/after harness in `.devshots/perf-g1/`); 205 of 422 packages rebuilt in one
  atomic pass; freshness 422/422, reachability 1,121 OK, check:sim golden unchanged,
  check:playable 18/18. Audit mergeable-draws debt: 4,005 → 2,669 dc/frame.
- **G1b landed** (same day): cross-parent static merge in the compiler — ancestor chains bake
  to the lowest common ancestor; chains crossing transform animation, skin joints, MOTION_
  pivots or node extensions are refused. Nine small props merged (90 → 70 primitives,
  pixel-exact on the comparison frame). The audit's remaining 45 mergeable rows are dominated
  by dynamic-part hulls (`last_argument`: 144 of 169 meshes are individually-addressed
  dynamics) that must keep their own draws — the container-level heuristic overcounts them.
- **B5 landed** (same day): procedural canvas textures persist to IndexedDB
  (`src/render/canvasTextureStore.js`, the programBinaryCache pattern) and later boots serve
  them from the store while the loading screens play. On the measured route a cold boot builds
  19 canvas textures and persists the 10 canvas-backed ones (0.4 MB); warm boots build only the
  9 cheap DataTexture ramps (no canvas to persist). Served pixels are bit-identical to fresh
  builds (0/65,536 on the identity probe; the flipY decode path is separately proven live).
  Boot wall-clock on this machine is agent-load noise (17–60 s swings) — the build count is
  the signal. The full boot win still wants B1–B3 (static batches, worker parse, transcode
  cache), which queue behind other lanes' files.
- **Audit honesty fix landed** (same day): `mergeable-draws` now subtracts primitives on
  dynamic-role nodes using each render package's own semantic table. The naive count was
  45 rows / 2,669 dc; role-aware it is 38 rows / 1,502 dc — the honest remaining debt, most of
  it in scene-root packages whose parentId shape the cross-parent pass does not yet reach.
- **Corrections to this plan from execution:** the `layTether` rAF item in R1 is over-attributed
  — its settle loop is bounded (≤3 passes + one 900 ms tail); steady state has no per-frame
  reads. The G2 tranche is blocked by power-of-two quantization: every flagged body's 2×-closest-framing
  bar (516–830 px) still rounds up to the 1024 they already ship; halving below that violates
  the repo's own quality rule. A per-axis (non-square) budget policy is the only legal way to
  take that memory back. LANE-FWD in check:playable flaked once under agent load and passed
  clean on rerun — rerun before blaming a change.
- **Blocked by shared-checkout collisions (2026-11-22):** R1's HUD files, R3, R5
  (`renderer.js`), R6 (`toasts.js`, systems), B1 (`partsLibrary.js`), B5 wiring
  (`visualFactory.js`/`assetLoader.js`/`main.js`) are all mid-edit by other lanes; they queue
  behind those lanes landing.
- **Director's rulings on work in flight (2026-11-22 09:10 EST).** (1) The uncommitted Foundry
  edits that put 4 crates on a belt instead of 6 on integrated graphics do not land: R14, never
  emptier. The room keeps its contents on every tier; the cost comes out of how it is drawn.
  (2) Demoting the Foundry's static merged pieces to a cheaper lit material on integrated graphics
  may land only with a same-moment before/after pair opened and judged to look right, and it is the
  stopgap for G4's baked lighting, not a replacement. (3) The "fast composite" that drops the
  illustrated edge sampling may land only if the pair is indistinguishable at 1920x1080; the
  resolution governor (74fe37f4ab, 2766aa10d9) is the sanctioned lever and already holds the Foundry
  at 17-23 ms of GPU. Its floor of 0.5 shows stair-stepped edges: 0.6 is the working floor until the
  upscale is better. (4) What the runtime Foundry merge (8c063dbdb0) already covers, so G4 does not
  redo it: static set pieces merged into one world-space mesh per material at authored LOD1, deck
  plates as one 28-triangle slab, trim and rollers in one instanced batch. Still G4's: baked
  lighting, the cheap material, a package-compiler bake, re-entry after a death (released package
  arrays fall back to unmerged meshes: untested), and shadows on machinery (switched off by the
  merge: restore for shadows-on presets). (5) Programs still compile in live play in the Foundry
  (20-32 a run): work-lamp lenses mounting after the veil lifts, keyed asteroid instances, enemy hull
  materials on first appearance, beacon lamps (one program each: a missing shared material), wasp
  threat plates and brood shards, the next wave's deferred warm, LOD0 parts of player hulls. Probe:
  scripts/probe-live-compile.mjs. Unowned as of this note; first engineer free takes it.
