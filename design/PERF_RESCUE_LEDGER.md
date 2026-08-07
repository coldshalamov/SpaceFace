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

**Still open:** gate 2 (fail-closed / dev-only source route) and gate 5 (residency prewarm +
prepare-then-swap). Gate 4 was already in place (`build:render-package-pilots --check`).

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

## Chunk 3 — dense presentation snapshot + batched renderer — NOT STARTED

Exit gate: ≥5× reduction in per-ordinary-entity presentation work at 5× population, with the old
renderer deleted after a bounded parity window. Input already present:
`src/render/dynamicBufferRanges.js`.

## Chunk 4 — sim / render / platform separation — NOT STARTED

Build the transport on an in-process `MessageChannel` and prove digests **first**, then move to real
Workers, then `OffscreenCanvas`. Exit gate: the default route actually uses separated owners.

## Chunk 5 — backend optimization + certification — NOT STARTED

WebGL2 work-family optimization, a WebGPU parity slice (decide from evidence, do not assume),
quiet-machine player-corridor certification, hard native trigger.

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
