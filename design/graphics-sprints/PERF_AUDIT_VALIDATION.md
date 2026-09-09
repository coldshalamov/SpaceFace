<!-- LIFETIME: DURABLE -->
<!-- Method for the parity/perf harness. Measurement rules are consolidated in EXPANSION_PROGRAM.md section 5. -->
# Validation of the external SpaceFace performance audit

Checked against committed `master` @ `dab9199a` on 2026-08-05, plus a fresh real-GPU capture
(Intel iGPU, ANGLE/D3D11, 1920x1080, hardware WebGL — not SwiftShader).

**Verdict: substantially valid.** Every load-bearing factual claim I could check is true, its two
self-corrections of the prior agent are correct, and its central diagnosis is confirmed by an
independent measurement it did not have access to. Three claims are unverified. One framing needs
qualifying.

---

## 1. Claims verified TRUE in source

| Audit claim | Evidence |
|---|---|
| `RUNTIME_MESH_BUILD_BUDGET = 2` is a **job-count** budget, not time or bytes | `src/render/renderer.js:146`; used at `:1685` and enforced at `:1725` as `built < buildBudget` — a counter, never a clock |
| `_drainMeshBuildQueue()` calls `this.vf.build(e)` **synchronously** | `src/render/renderer.js:1731` (also `:1777`) — inside the reconcile loop, on the render thread |
| Runtime geometry composition is on the live path | `partsLibrary.js:3932` `toNonIndexed()`, `:3936` `computeVertexNormals()`, `mergeGeometries` at `:3614/:3874/:3893`; **`ships/kestrelHero.js:295,305`** and `ships/shipKit.js:551,561` do the same for the *player* ship and kit hulls |
| Render packages are machinery, not the product path | `src/render/renderPackageLoader.js` + `src/contracts/renderPackage.js` exist; a repo-wide search for `render-package*.json` artifacts returns **zero** files |
| VFX still runs broad `state.entityList` scans | 6 occurrences in `src/render/vfx.js` |
| Dirty-range uploads cover only selected pools | `addUpdateRange`/`updateRanges` appear in exactly **one** file, `src/render/dynamicBufferRanges.js` |
| `PresentationWorld` is real, not scaffolding | `src/render/presentationWorld.js` exists as a substantial module |

## 2. Self-corrections — both correct

- **"Not Electron 31 anymore."** True: `package.json` pins **Electron 43.2.0** and **three 0.184.0**
  (vendored at `vendor/three.module.js`). Chromium modernization is not the untouched lever.
- **"Draw calls are not the main limiter."** True in magnitude. Measured this session: **44–75 draw
  calls** in flight scenes, **108** in combat, at 29k–73k triangles. The audit's "~37" is the right
  order. Nothing here is draw-call bound.

## 3. The central diagnosis — independently CONFIRMED

The audit argues the primary defect is unbounded authored-asset admission work on the render thread,
and that a job-count budget cannot bound frame duration. A fresh combat capture confirms it directly.

`.devshots/gfx/base-combat-vfx.json`, `perf.phases` (79 frame samples, real GPU):

| Phase | p50 | p95 | max |
|---|---|---|---|
| **admission** | **0.0 ms** | **198.8 ms** | **238.8 ms** |
| presentation | 11.0 | 26.0 | 118.3 |
| render | 7.8 | 17.7 | 109.6 |
| sim | 9.4 | 19.1 | 34.3 |
| vfx | 1.3 | 2.7 | 4.9 |

Whole-frame p95 for that run was **250 ms** (avg 62 ms). **Admission's max of 238.8 ms accounts for
essentially the entire spike.** Its p50 of 0 is the signature the audit predicts: most frames do no
admission work at all, and the frames that do pay two hundred milliseconds for it — because the
budget permits *two objects* of *any* size.

Every other captured scene (`idle`, `asteroid-field`, `boost`, `ui-overlay`) sat vsync-locked at
p95 16.8 ms. So the "smooth narrow valley, avalanches in the mountain passes" framing is accurate,
and combat is the pass.

## 4. Claims NOT verified

- **"callback p95 fell 25.9 ms -> 8.2 ms"** — no provenance found this session; treat as unconfirmed.
- **"32,587 partial vs 105 full uploads"** — not reproduced.
- **Residency has accounting but no capacity governor** — module exists; the absence of high/low-water
  budgets was not confirmed line-by-line.

## 5. Attribution inside admission — RESOLVED, and it corrects the audit

`perf.backgroundJobs` ships `enabled: false`, so neither the audit nor the first capture could see
inside the admission phase. Enabling it and re-running the combat route resolves the question.

**The 250 ms whole-frame figure was a counter cap. The true worst frame was 1836.2 ms.**

Worst frame `displayFrameId=510`, admission **1836.2 ms**, **jobs started that frame: 1**:

| Slice | ms | Share |
|---|---:|---:|
| composition (`buildComposedShip`) | **1836.2** | **100%** |
| pipeline (`pipelineAdmissionSync`) | 38.9 | secondary |
| commit / misc | 0.4 | noise |

Job: `authored-upgrade` seq 21, entity `ship:326`, asset `wholeships/ashline_dart.glb`, cache **hit**.
Neighbouring hitch frames follow the identical shape — one job owning 99.9–100% of the phase:

| Frame admission | Jobs | Asset | Largest slice share |
|---:|---:|---|---:|
| 1836.2 ms | 1 | ashline_dart | 100% |
| 400.1 ms | 1 | ashline_rig | 99.9% |
| 345.6 ms | 1 | ashline_rig | 99.9% |
| 247.9 ms | 1 | ashline_dart | 100% |

Code path: `upgradeBoundary` → `buildComposedShip` → `instantiatePart` → `staticBatches.flush()`,
landing in `partsLibrary.js` `mergeGeometries` `:3614/:3874/:3893`, `toNonIndexed()` `:3932`,
`computeVertexNormals()` `:3936`, then `shipKit.finalizeShip` (`:551/:561`). Because the asset is a
cache **hit**, the cost is pure synchronous CPU composition — not transport, not GLB decode.

**Correction to the audit.** Its §2 proposes converting `RUNTIME_MESH_BUILD_BUDGET` from a count to a
time-and-byte budget as an early high-value fix. On this evidence that would **not** help: the hitch
is a single non-preemptible synchronous composition, and concurrency is already limited to 1
(`authoredUpgradeConcurrencyLimit()`). You cannot budget milliseconds out of one 1836 ms call.

The correct first move is the audit's own §1 — **offline-baked render packages** — so the composition
stops happening during play at all, or alternatively slicing `buildComposedShip` itself into
resumable steps. A deadline governor remains worthwhile *afterwards*, to schedule package admission;
it is just not the thing that removes this stall.

This is the audit's §9 discipline ("select the branch from a real trace") applied to its own §2.

## 6. Relevance to the graphics program

This is not a separate concern. Combat is one of the five scene types in
[`MODERN_PARITY_LOOP.md`](MODERN_PARITY_LOOP.md), and a 250 ms p95 makes its quality score
meaningless: the reviewer would be scoring a stuttering frame. **The admission hitch is a blocker for
the combat lane of the graphics work**, not merely a parallel performance task.

Conversely, the audit's "forbidden" list — no texture-resolution cuts, no geometry or population
cuts, no disabling bloom/AA/shadows to manufacture a win — is exactly the dual gate this program
already enforces, and matches the standing project rule against quality reduction.
