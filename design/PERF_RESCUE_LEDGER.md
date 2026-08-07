# Performance Rescue — Chunk Ledger

Single source of truth for where the Performance Rescue stands. **Read this before anything else;
trust it over memory or recollection.** Update it at the end of every session, before committing.

Pairs with `design/PERF_BUDGET.md` (the frame-time contract), `design/PERF_TRIAGE.md` (bottleneck
evidence), and `scripts/lib/perfCausalScenarios.mjs` (the deterministic causal harness every chunk
is measured with).

## Quality contract (binding on every chunk)

Never reduce resolution, draw distance, population, geometry/LOD quality, material roles, shadows,
post-processing, effect capacity, authored lighting, texture quality, or gameplay complexity.
Optimization comes only from algorithms, allocation, batching, cadence, culling, residency, state
ordering, persistent resources, and backend ownership.

## Measurement rules

- Every chunk closes on **measured before/after** from `scripts/lib/perfCausalScenarios.mjs`
  (8 scenarios), plus `npm run check:baseline`.
- Two consecutive harness runs must be **byte-identical**. Determinism is the gate, not a nicety.
- Counters count **work**, not durations — integers are host-contention-immune and bisectable.
- **A counter must never fail toward good news.** If a code path is not instrumented, it reports
  zero, which is indistinguishable from "fixed". Every new owner of work needs its own counter.

## Known-baseline facts (do not re-derive)

- **Pre-existing failures on clean master** (`43703d2a` and later): `ui-screen-imports`,
  `pq020-ceres-topology`, `sim`, `sim-v3`. Verified by running `check:baseline` in a pristine
  worktree at `43703d2a`: identical four failures, identical actual sim hash `94f18fcc…`.
  Anything failing beyond these four is yours.
- A faked `window` in a headless harness **must** carry `performance`. Rapier's wasm-bindgen glue
  probes `window.performance` first and only falls back to Node's global when `window` is absent;
  a bare `{}` hands Rust `undefined` and panics the wasm module on the first `world.step()`, then
  every later call reports "recursive use of an object". The cascade is louder than the cause.
- `src/core/sim.js` builds its **own** minimal registry with its own `step()`, separate from
  `createRegistry` in `registry.js`. Instrument both or sim work silently reports zero.
- `git commit -- <paths>` commits the **working tree**, not your staged index. This tree carries a
  concurrent agent's dirty work. Stage exact blobs with `git hash-object -w` +
  `git update-index --cacheinfo`, then `git commit` with **no pathspec**. Verify `git show --stat`.
- `node_modules` may be a Windows directory junction. A recursive delete **follows** it and destroys
  the target. Unlink the reparse point first.

---

## Chunk 1 — Deterministic causal accounting + repeated package-graph work — **DONE**

Commits: `1bb3730e`, `f86d1d56`, `d8a9cc16` (base `43703d2a`).

**What shipped**

- Tier-1 counter families J–P in `src/core/perfCounters.js` with per-cause attribution, plus the K2
  family (`planInstantiations` / `planNodesInstantiated`). Zero-cost-when-off preserved: the
  disabled path is a single boolean read with no allocation.
- `scripts/lib/perfCausalScenarios.mjs` — 8 deterministic scenarios (seeds 91001–91008) driving the
  real fixed-step sim and the real presentation ownership path under a synthetic frame pump,
  synthetic monotonic clock, and seeded ambient `Math.random`.
- `src/render/renderPackageLoader.js` — render packages compile a **flat instance plan** once at
  load (depth-first pre-order array of `{source, parentIndex, name, isMesh, recordIds}`) and
  instantiate from it with `Object3D.clone(false)`. Replaces per-instance `SkeletonUtils.clone()`
  plus per-instance semantic re-traversal. Rejects skinned/bone/instanced/LOD/light/camera content
  rather than falling back silently.
- `src/render/partsLibrary.js` — specialises by iterating the flat plan instead of `root.traverse()`.
- `scripts/check-render-package-instance-plan.mjs` (`npm run check:render-package-plan`) — gates all
  26 shipping packages on plan coverage and record resolution: **26/26, 617 nodes, 622 records.**

**Why the refactor was justified:** all 26 shipping packages are pure rigid geometry — 616 GLB nodes
(438 mesh, 178 plain), zero skins/animations/cameras/lights. `SkeletonUtils.clone()`'s entire
skeleton-rebinding machinery was wasted work. The larger hidden cost was per-instance
`indexSemanticNodes`, which rebuilt a Map of all records and then per node ran
`Object.keys().filter()`, allocated a `Set`, and re-compared strings.

**Exit gate 1 — determinism:** all 8 scenarios byte-identical across two runs. PASS.

**Exit gate 2 — per-instance work at zero post-boot:** PASS.

| Scenario | graphClone | graphTraversal | semanticCompile | post-boot (clone/trav/semantic) |
|---|---|---|---|---|
| `station-approach-docking` (1 instance) | 1/8 → **0/0** | 4/32 → 1/8 | 3 → 2 | 1/2/1 → **0/0/0** |
| `sector-transition-admission` (5 instances) | 5/40 → **0/0** | 12/96 → 1/8 | 7 → 2 | 5/10/5 → **0/0/0** |

**Known remaining non-zero shipping operation (Chunk 2's target):** once-per-package
`compileBlueprint` inside `prepareDecoded`. It runs per package **load**, and residency has an
`onEvict` path — so an evict-then-reload during ordinary play runs a blueprint compile mid-flight.

---

## Chunk 2 — render-package v2 + residency/admission — **GATE 1 MET; gates 2/3/5 open**

**Gate 1 is met on the shipping package route.** `compileBlueprint` no longer runs when a package
carries a runtime table; the loader binds precompiled data by flat-plan index.

**Measured before/after** (`station-approach-docking` and `sector-transition-admission` are the two
package-bearing scenarios; both show the same result):

| | before | after |
|---|---|---|
| `runtimeSemanticCompiles` cause map | `package-blueprint-compile: 1`, `package-plan-compile: 1` | `package-runtime-bind: 1`, `package-plan-compile: 1` |
| `graphTraversals` / `graphNodesVisited` | 1 / 8 | 1 / 8 |
| post-boot `runtimeSemanticCompiles` | 0 | 0 |

The total deliberately stays at **2**. Driving the field to zero would have been indistinguishable
from deleting the call site — the counter-fails-toward-good-news trap this ledger names. Instead the
same field keeps counting, and the **cause** changes, which is a positive signal that the bind path
ran rather than an absence of evidence.

Determinism: all 8 scenarios byte-identical across two runs. `check:baseline`: exactly the four known
pre-existing failures. `check:render-package-plan`: 26/26, 731 nodes. Focused tests: 68/68.

**Material profiles are now declared, not derived.** `configureAuthoredMaterialProfiles` ran two
`root.traverse()` passes on the bind path and inferred each material's role from its name, userData
and assetId — name-based discovery on a shipping load path. The offline derivation now records what
it resolved (via a new optional `record` observer) and ships it as `runtime.materialProfiles`, which
the binder applies by plan index. **524 profile entries across 26 packages, none empty** — e.g.
kestrel 18, helios-trade-hub 115, wasp 8, with real role spreads (hull/mechanical/glass/signal/
warning/radiator/drive/service/docking). An empty array would have silently applied nothing, the same
failure class as a counter dropping to zero, so the count is checked rather than assumed.

One subtlety worth keeping: material roles gate texture-bearing profiles on `geometry.getAttribute('uv')`.
The offline rebuild has no vertex data, so it mirrors exactly that one fact from the glTF
`TEXCOORD_0` accessor declaration. Without it every material resolves as untextured offline and the
shipped roles disagree with what the runtime would have picked.

### Gate 3 — coverage — MET

Coverage is now **derived from the release manifest**, not curated.
`scripts/generate-render-package-pilots.mjs` walks `release_manifest.json`, and
`npm run check:render-package-coverage` fails if any released GLB has no package. A hand-kept list
could only ever answer "is every asset someone *remembered* packaged?" — which is how 60 of 86
assets came to have none.

**26 → 81 packages.** `check:render-package-plan` went from 26/26 (731 nodes, 622 records) to
**81/81 (1897 nodes, 1409 records)**. Every one of those 55 newly packaged assets previously loaded
through the source route, recompiling a blueprint at load.

Two assets are excluded, each with a recorded reason rather than silent absence:

| asset | reason |
|---|---|
| `fins/fin_crystalline.glb` | two nodes share the name `fin_crystalline_Material_Accent_Merged`; semantic locators resolve by name, so this is a genuine authoring defect to fix in the asset |
| `kestrel/kestrel_reference.glb` | not under `parts/`, so no slot mapping — it is a reference file, not a runtime asset |

Two derivation fixes were needed along the way, both narrow:

- **Slugged ID collisions.** Node *names* are asserted unique before any ID is minted, so a collision
  only ever meant two names differing in punctuation alone (`Dome_Frame_1.18` vs `Dome-Frame-1-18`).
  That is an authoring style difference, not an ambiguity, so `makeIdAllocator` disambiguates
  deterministically. Assets without collisions get no suffix, so existing packages stay byte-identical.
- **The generator validates before claiming.** It runs the real `derivePilotSemanticManifest` rather
  than re-implementing its rules, so a contract-violating asset is reported with the contract's own
  message instead of entering the manifest and breaking the build later.

`test/render-package-pilots.test.mjs` no longer asserts a frozen 26-key list — that is the same
curated-list antipattern. It now asserts the originally-admitted families are still packaged and
lets the coverage check own "nothing is missing".

### Gate 2 — fail closed — MET

A released part under `assets/ships/release/parts/` with no render package now throws
(`assertSourceRouteAdmitted`) instead of quietly compiling its blueprint from source at load. That
silent fallback is precisely what let coverage rot unnoticed: the game looked correct while paying
full derivation cost on every load, and nothing ever said so.

The source route remains reachable for development via `globalThis.__SF_DEV_SOURCE_ASSETS__`, and
assets outside `release/parts/` are unaffected — they are tooling and reference files, not runtime
content. `SOURCE_ROUTE_ALLOWLIST` carries the one asset that genuinely cannot be packaged
(`fin_crystalline.glb`) together with its reason, so the exception is reviewable rather than
invisible. That list is the difference between *excluded* and *forgotten*.

### Gate 5 — residency prewarm + prepare-then-swap — contract MET, call site outstanding

`preloadAuthoredParts` existed in `assetLoader.js` with **zero call sites** — the prewarm mechanism
had been written and never wired. And `rotateSector` alone is a swap, not a prepare-then-swap: it
warms the sector being *left*, then switches, leaving the sector being *entered* to demand-load its
archetypes while the player is already flying in it. Each of those loads is a decode plus a GPU
upload plus a first-draw shader compile, arriving in the frame least able to absorb it.

`prepareSectorEntry(renderer, sectorId, urls, options)` closes that: it retains every archetype under
an `asset-incoming-sector` owner, verifies the set is complete, warms shaders while nothing is being
drawn, and only then rotates. The rotate is deliberately the last statement, and an incomplete set
throws rather than degrading — entering a sector whose assets are still loading is the exact failure
being prevented.

`npm run check:sector-prewarm` gates the **ordering**, not just the outcome: a check that only
asserted "everything ended up resident" would pass either way. It drives the real function through
injection seams (`loadPart`, `residency`) and asserts against the journal — 7/7:

- every archetype resident, scoped to the incoming sector with role `sector-prewarm`
- the swap happens strictly after the last retain
- shaders warm before the swap
- an incomplete set aborts entry, never rotates, and names the missing archetype

**Outstanding:** `prepareSectorEntry` has no production caller yet. The remaining work is to derive a
sector's spawnable archetype set and invoke it from the sector transition path (`sector:enter` is
emitted at `src/balance/hunterPublicRoute.js:177`; `renderer.js:1493` already handles `sector:exit`).
The mechanism and its ordering guarantee are proven; what is missing is the archetype-set query.

**Exit gates**

1. Shipping loader performs zero `compileBlueprint`, zero name-based discovery, zero geometry
   processing. Proven by Tier-1 counters at zero post-boot across all 8 scenarios.
2. Loader **fails closed** without a package; the source route is reachable only from an explicit
   dev mode.
3. Package coverage derived from real sector/spawn manifests, not a curated list.
4. Offline compile is deterministic: rebuilding a package from unchanged inputs is byte-identical.
5. Every spawnable archetype resident and shader-warmed before scene publish; sector change is
   prepare-then-swap.

---

## Chunk 3 — dense presentation snapshot + batched renderer — **CONTRACT MET; renderer wiring open**

### `spaceface.presentationSnapshot.v1` — MET (`npm run check:presentation-snapshot`, 13/13)

`src/render/presentationSnapshot.js` is a struct-of-arrays view: one typed array per field, entity
`i` at index `i` in all of them. The path it replaces walks live entity objects and reads fields
through pointers — scattered across the heap, so each read is a potential cache miss and none
prefetch each other — while allocating a per-entity intermediate every frame.

**Measured, at 400 → 2000 entities over 60 frames:**

| | 1× population | 5× population |
|---|---:|---:|
| object-walk allocations | 96,000 | **480,000** (exactly 5×) |
| dense reallocations | 2 | **2** (frame-count independent) |
| dense per-frame allocations | 0 | **0** |

The gate measures **work, not wall time**. Timing a JIT-warmed loop on a contended Windows box
measures the box; allocation and reallocation counts are integers, host-independent, and are what
actually causes the hitches. Per-entity presentation allocation goes from 4-per-entity-per-frame to
zero regardless of population, which is the ≥5× reduction stated as a ratio no faster machine can fake.

Also gated: dense column layout and write order, id/flag/tint round-trip, journal drains in insertion
order (a destroy overtaking its spawn would leak a slot), drain reports its count, and **journal
overflow is counted rather than silently dropped** — a renderer that missed a spawn is worse off
believing it saw everything.

Capacity grows by doubling and never shrinks: shrinking would trade a steady-state allocation of zero
for repeated reallocation whenever population oscillates around a threshold, which is the exact hitch
this contract exists to remove.

### Batched instance renderer — MET (`npm run check:batched-instances`, 7/7)

`src/render/batchedInstanceRenderer.js` consumes the snapshot columns directly and emits **one draw
per archetype**. The per-entity path issues one draw per entity, each carrying a pipeline/uniform
binding whether or not anything changed — and ordinary entities are overwhelmingly a few archetypes
repeated, so nearly every one of those bindings is redundant.

| population 400 → 2000, 6 archetypes | |
|---|---:|
| per-entity draw calls | 400 → **2000** |
| batched draw calls | 6 → **6** |
| reduction at 5× population | **333×** |
| buffer reallocations, 60 settled frames | **0** |

Two properties are gated together because either alone misleads. Draw calls must stop tracking
population — the scaling claim. And the matrices must equal what the per-entity path produced —
**parity is checked against THREE's own `Matrix4.compose`**, not a second copy of the inline math, so
the two sides cannot be wrong together. Worst element delta `< 1e-5`, which is single-precision
epsilon for Float32 storage against THREE's Float64 arithmetic. A batcher that is fast and wrong is
worse than the path it replaces, because the error surfaces as subtly misplaced geometry rather than
a crash.

TRS composition is written inline rather than through `Matrix4.compose` so no `Matrix4`, `Vector3` or
`Quaternion` is allocated per entity per frame — routing through object wrappers would hand back
exactly the allocation the dense snapshot exists to remove. A fully culled frame issues **0** draws,
so the metric stays sensitive to culling rather than counting empty archetypes.

### Parity window against the incumbent — MET (`npm run check:render-path-parity`, 4/4)

`projectRenderEntityFrame` in `src/render/renderEntityFrame.js` is the wiring seam: the render frame
has already visited every entity and cached its pose, so projecting into the dense snapshot is a
linear pass over `frame.records` rather than a second traversal of `state.entityList`. Euler→quaternion
conversion is written inline so no `Quaternion` or `Euler` is allocated per entity per frame —
allocating one would hand back exactly the cost the snapshot removes.

The parity check runs **both paths over the same classified frame** and compares. This is the bounded
parity window the chunk requires before deletion: removing the incumbent on the strength of the
challenger's own unit check would delete the only reference able to prove the challenger right.

| 300 entities, 256 visible, 5 archetypes | |
|---|---:|
| per-entity draw calls | 256 |
| batched draw calls | **5** |
| worst world-matrix delta | **1.9e-6** |

Parity is asserted on the **composed world matrix**, not the intermediate fields, because that is what
the GPU consumes — comparing components would let a transposition or an axis-order mistake pass with
both sides holding identical numbers while the ship draws pointing the wrong way. The incumbent side
uses THREE's own `mesh.updateMatrix()`, so the two sides cannot be wrong together.

### Adopted on the default route

`renderer.js` now calls `projectRenderEntityFrame` every frame, immediately before
`endRenderEntityFrame`. It runs on the **default** route rather than behind a flag: a snapshot only
some players produce is a snapshot nobody can trust, because divergence would surface as a bug report
instead of a gate. Archetype identity is the (geometry, material) pair — the two things that must
match for one instanced draw — cached per mesh in a `WeakMap`, so the common case is a single lookup
with no allocation and a disposed mesh takes its entry with it rather than pinning geometry alive.

#### Verified in a real browser (2026-08-07)

The Browser pane is not displayed in this environment, so the page never composites: rAF is
throttled, `fps` reads 0 and no run can be entered by clicking. Driving the registry directly works
around it — `SF.registry.get('render')` exposes the live render system.

Observed on the running game:

| | |
|---|---|
| `_presentationSnapshot` present on the live renderer | yes |
| `generation` after natural frames | 1 → **2** (the projection executes in the real draw path) |
| `grows` across those frames | **1**, unchanged |

`grows` staying at 1 while `generation` advances is the property that matters: the projection
reserves once and never reallocates per frame. Had the reserve logic been wrong, `grows` would climb
with `generation`.

A `TypeError: post-target frame origin requires display/render IDs and sim tick` is thrown by
`registry.step` when pumped without an active run. It is a pre-existing guard, not this change —
`renderUpdate` still advanced the snapshot past it.

**Not yet observed:** a populated frame. `count` is 0 because no run was active, so the projection
has not been watched handling real entities in game.

**Open:** the per-entity draw path still executes alongside the snapshot. That is the parity window
running in production. Deleting the incumbent is deliberately **not** done yet: the parity evidence
covers synthetic records and an empty live frame, and the incumbent is the only reference able to
prove the replacement right on a populated scene. Deleting it before observing one populated frame
would remove the fallback and the evidence at the same time. Socket-attached plume and
distance-sampled wake are untouched. `src/render/dynamicBufferRanges.js` is the seam for GPU upload.

## Chunk 4 — sim / render / platform separation — **TRANSPORT + DIGESTS MET; thread move open**

### In-process boundary with digest equality — MET (`npm run check:sim-transport`, 6/6)

`src/core/simTransport.js` runs both owners in one process over a real `MessageChannel` — the same
asynchronous, copy-only, ordered-delivery semantics a Worker has, minus the thread.

Moving the boundary and the thread together is the expensive mistake: if the result diverges there is
no way to tell a genuine ownership violation (the renderer quietly mutating sim state) from a
transfer artifact (a structured clone dropping a field, a detached buffer, a reordered message) — and
you find out across a thread boundary with no shared stack. Moving the boundary first makes every
divergence synchronously debuggable.

**The gate is digest equality**, not "it looks right": what the renderer receives across the transport
hashes identically to a direct single-threaded read, **40/40 frames at 300 entities**. Also gated:
a real `MessageChannel` backs it (not the fallback shim, or the proven path would differ from the
production one), delivery is ordered, the published payload is a **copy** so the renderer cannot
mutate sim state through it, and — critically — **the digest is proven able to fail**: nudging one
position by 0.01 changes the hash. A digest that cannot fail makes every other assertion worthless.

The digest quantises before hashing. Raw float bits can differ harmlessly across a structured-clone
round-trip, and a digest tripping on that noise would cry wolf every frame; the grid is fine enough
that any difference a player could see still changes the hash.

Delivery is never synchronous, deliberately — a synchronous transport would let the renderer observe
sim state inside the sim's own step (the exact violation being hunted) and would break the moment a
real Worker made delivery async.

**Open:** real Workers, `OffscreenCanvas`, and checkpoint/journal restart. The default route does not
yet use separated owners — the transport is proven, not adopted.

## Chunk 5 — backend optimization + certification — **DECISION RULES MET; measurement open**

### Evidence-driven backend + native decisions — MET (`npm run check:backend-decision`, 15/15)

"Should we move to WebGPU?" and "is it time to go native?" are the two questions most likely to be
settled by taste, vendor enthusiasm, or whoever argued last. Both are decidable from numbers, so
`src/render/backendDecision.js` makes them functions with explicit thresholds. Disagreeing with a
verdict now means disagreeing with a number.

**It refuses rather than defaults.** Missing or partial evidence returns `insufficient-evidence` and
names the missing fields. A default would be an assumption wearing a verdict's clothes.

| threshold | value | why |
|---|---|---|
| `minFrameTimeGainRatio` | 1.25× | under a quarter is inside driver/machine noise — indistinguishable from a good afternoon |
| `maxParityRegressions` | 0 | a backend that renders differently is not a faster backend, it is a different game |
| `minSampleFrames` | 600 | fewer cannot see the tail |
| `p99CeilingMs` | 50 | p99, not average — 60 fps average with a 90 ms tail is worse than a steady 50 |
| `requiresWorkFamiliesExhausted` | true | otherwise "go native" becomes a way to skip an unfinished optimization |

The gate drives both functions across every threshold in **both** directions, because a decision
function that always says yes is just an opinion with a return type. Notably: a p99 of 120 ms with
structural work unfinished returns **stay-browser**, and only flips to **go-native** once the work
families are exhausted.

**Open:** the WebGL2 work-family optimization itself, the WebGPU parity slice that would feed this
evidence, and quiet-machine corridor certification runs. The rules are in place and gated; the
measurements that feed them are not yet collected.

---

### Chunk 2 scope rulings (2026-08-07)

**Keep `render.glb`.** The chunk brief's phrase "runtime-ready binary payload" read literally means a
custom container replacing the GLB. That would break GLTFLoader, KTX2 transcoding, and the decode
path Chunk 1 just stabilised, and it is required by **none** of the five exit gates. v2 is therefore
an **additive `runtime` block inside `render-package.json`**; the GLB stays the geometry container.

**Bind by plan index, not by name.** Chunk 1's flat instance plan is a depth-first pre-order over the
decoded scene, which is exactly reproducible from the glTF node graph. v2 references nodes by
`planIndex`, so the loader performs no search and no name matching. Each reference also carries the
node's declared `name`, which the loader asserts against the plan — that is a **checksum, not
discovery**, and it turns a silent mis-binding into a loud failure.

**One implementation of the semantics.** Tag/marker/canopy derivation (`collectTags`,
`buildPrimitiveTags`, `isContractMarker`, `isCanopy`) is a pure function of node name, `userData`,
slot, and parent chain — it needs no geometry and no textures. It is extracted into a shared module
that the compiler runs offline and the parity gate runs online. Re-implementing it against
gltf-transform would create two copies of the same semantics and guarantee drift.

**Material construction stays; only its *derivation* moves offline.** `makeCanopyMaterial`
constructs a new `MeshPhysicalMaterial`, and `configureAuthoredMaterialProfiles` mutates material
parameters by role. Both are bakeable into the GLB in principle (`KHR_materials_*` + alphaMode
BLEND), but baking rewrites all 26 GLBs (~100 MB), changes every `contentHash`, and needs visual
re-verification. Gate 1 forbids *traversal, name-based discovery, and geometry processing* — not
material construction. So v2 **declares** canopy primitives and material roles by index, the loader
applies them without deriving them, and a dedicated counter keeps the remaining construction
visible. Baking is recorded as a follow-on, not silently skipped.

### Chunk 2 measured coverage gap (2026-08-07)

`assets/ships/release/parts/` holds **86** authored GLBs. **26** are packaged. **60 are not:**

| cockpits | engines | fins | gear | greebles | hulls | places | pods | weapons | wholeships |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 3 | 6 | 6 | 2 | 7 | 10 | 11 | 3 | 6 | 6 |

Every unpackaged asset still loads through the **source route**, i.e. a real `compileBlueprint` at
load. This is why gate 2 (fail-closed) and gate 3 (manifest-derived coverage) cannot land in the
same session as gate 1: they require authoring 60 semantic manifests and re-verifying 60 assets.
Sizing this first is what makes the session boundary a decision instead of an accident.

### Idempotency proof (2026-08-07)

`node scripts/build-render-package-pilots.mjs --check` compiles all 26 pilots into a temp directory
and byte-compares against the committed packages: **fresh 26/26 in 19.5 s**. This matters for two
reasons. It is Chunk 2's gate 4 (deterministic byte-identical rebuild) already in place, and it
proved the ~22 dirty `render-package.json` files in the working tree are *compiler output* from a
concurrent agent — regenerating them preserves that work exactly rather than destroying it.

## Session log

### 2026-08-07 — Chunk 2 opened: v2 derivation landed, loader flip NOT done

**Shipped (commit below).** The v2 runtime table — the payload that lets the shipping loader stop
deriving anything — is implemented, cross-validated against all 26 packages, and gated. The loader
still runs `compileBlueprint`; **gate 1 is not met.** Nothing on the shipping runtime path changed
this session, so there is no regression surface.

- `deriveAuthoredRuntimeTable` (`src/render/assetLoader.js`) — the derivation half of
  `compileBlueprint` as a standalone, JSON-serializable function: per-primitive and per-marker
  entries addressed by `planIndex`, root-relative matrices, canopy classification, hidden
  (`COLLISION_HULL` / `nonRender`) nodes, and scene bounds. It lives beside the tag helpers it uses
  so there is exactly one implementation of the semantics.
- `scripts/lib/renderPackageRuntimeTable.mjs` — runs that same function offline against a graph
  rebuilt from the render.glb JSON chunk. No binary decode, no KTX2, so it runs in the compiler.

**Cross-validation: `primitives + hidden == package geometry records` for 26/26.** That is an
independent confirmation, because package `geometry[]` is produced by the gltf-transform compiler
from accessors while the table is produced by the runtime's own name/userData semantics. `markers`
also equalled `anchors` for 25/26; `conveyor-barge` has 5 markers to 1 anchor, which is correct —
blueprint markers (HOOK_*/MOUNT_*/socket/drive) are a **superset** of declared semantic anchors, so
marker/anchor equality is an authoring coincidence, not a contract.

**Found and fixed: a blind spot in `check:render-package-plan` (shipped in Chunk 1).** Its graph
rebuild treated every glTF node as at most one Mesh. GLTFLoader wraps a **multi-primitive** mesh in
a Group of Meshes, and those extra nodes are part of the decoded scene and therefore of the flat
plan. Exactly one shipping package is affected — `helios-trade-hub`, 28 multi-primitive nodes adding
114 mesh nodes — so its real plan is **148 nodes, not the 33 the gate reported**. The gate passed
because *both sides of its comparison used the same wrong rebuild*: a check that compares a mistake
against itself. It now shares the fidelity-correct rebuild and reports **731 nodes across 26/26**
(was 617).

**Settled: GLTFLoader unique-naming.** Node names are what tags derive from and what the binder will
assert, so the rebuild has to reproduce `createUniqueName`. The ordering is fixed by GLTFLoader's own
comment at `loadNode` — *"reserve node's name before its dependencies, so the root has the intended
name"*. The node claims its name **first**, so a single-primitive mesh (which becomes the node and is
renamed to the node's name) leaves the authored name intact; only multi-primitive siblings keep
mesh-derived names, taking `name`, `name_1`, `name_2`, … in primitive order. A first attempt that
refused to guess here failed 12/26 packages, which is what surfaced the rule.

**Next session, in order.** (1) Extend `renderPackageCompiler.mjs` to emit the table into
`render-package.json` and add it to the content identity in `src/contracts/renderPackage.js`; the
real scene bounds must come from the compiler's accessor-derived bounds, since the offline rebuild's
placeholder geometry has none. (2) Add `bindAuthoredRuntimeTable` to `assetLoader.js` and flip
`prepareDecoded`. (3) Add a counter for what the binder still *applies* — the old
`package-blueprint-compile` counter going to zero proves nothing on its own, since deleting the call
site looks identical. (4) Parity test: table-bound blueprint vs `compileBlueprint` blueprint,
field-for-field, across all 26. (5) Regenerate and re-run the 8 scenarios for determinism.

**Known residual for gate 1:** `configureAuthoredMaterialProfiles` does two `root.traverse()` calls
and is still on the bind path as designed. Eliminating it means declaring material roles in the
table and applying them over the primitives list instead of traversing. Counted, not hidden.

#### Mandated measurements (run at commit `ac22c6bc`)

**How to run the 8 scenarios.** The harness had no driver and no npm script, which is why this
measurement was not reproducible. It is self-driving — the lib guards on its own `argv[1]`:

```
node scripts/lib/perfCausalScenarios.mjs --twice     # determinism gate
node scripts/lib/perfCausalScenarios.mjs             # full JSON reports
```

**Determinism — PASS.** All 8 scenarios byte-identical across two runs: `boot`, `steady-flight`,
`turning-flight`, `first-encounter`, `dense-combat-vfx`, `dense-asteroid-field`,
`station-approach-docking`, `sector-transition-admission`.

**`npm run check:baseline` — exactly the four known pre-existing failures**, no new ones:
`ui-screen-imports`, `pq020-ceres-topology`, `sim` and `sim-v3` (sim actual hash `94f18fcc…`,
matching the recorded pre-existing value). `render-package-plan` PASSES at its strengthened 731-node
coverage.

**Counter baseline — the "before" the loader flip is measured against.** Unchanged from Chunk 1's
close, as expected: this commit adds no shipping-path work.

| counter | station-approach-docking (total / postBoot) | sector-transition-admission (total / postBoot) |
|---|---|---|
| `graphNodesCloned` | 0 / 0 | 0 / 0 |
| `graphTraversals` | 1 / 0 | 1 / 0 |
| `graphNodesVisited` | 8 / 0 | 8 / 0 |
| `runtimeSemanticCompiles` | **2** / 0 | **2** / 0 |
| `planInstantiations` | 2 / 2 | 10 / 10 |
| `planNodesInstantiated` | 15 / 15 | 75 / 75 |

`runtimeSemanticCompiles = 2` is the Chunk 2 target: one plan compile plus one
`package-blueprint-compile`. The flip must take it to **1**, and — per the counter trap above — a
second counter must show the binder's own work as nonzero at load, or a deleted call site is
indistinguishable from a fixed one.
