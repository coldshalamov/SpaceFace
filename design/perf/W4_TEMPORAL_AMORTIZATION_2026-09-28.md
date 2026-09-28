# W4 — Temporal amortization: measured verdict

Wave-4 lane. Requirement: find every-frame recomputation whose results are temporally
coherent and provably identical when run less often. Verdict up front:

**The codebase is already near-saturated on this family. The one un-gated
observational block — `world.update`'s four proximity sub-ticks — was amortized to
30 Hz (`WORLD_OBSERVE_SCAN_TICKS = 2`) with identical outcomes on run ticks
(monotonic-transition proof + byte-identical bench). Measured −5.4% of
`world.update` wall time on a POI-dense synthetic sector. Everything else surveyed
already carries a quiet latch, a %-cadence, an FNV-phased owner slice, or a
per-tick memo. TAA/motion-vector reprojection is inapplicable (WebGL renderer,
three.js TRAANode is WebGPU-only).**

## 1. RESEARCH — what "temporal amortization" means in engines

- **Every-N-frames work skipping with optional interpolation** is Unreal's
  canonical form: **Update Rate Optimizations (URO)** skip full animation updates
  for N frames and interpolate the skipped poses; UE docs recommend ~15 Hz at
  appropriate distances (docs.unrealengine.com/4.27 — "Animation Optimization:
  Use Update Rate Optimizations"). The **Animation Budget Allocator** applies the
  same skip-and-fill under a global budget; "crucial in Fortnite for animating
  many characters on screen efficiently" (Epic, Performance Tips & Tricks —
  Animation, dev.epicgames.com).
- **Significance-driven tick frequency**: UE's `SignificanceManager` computes a
  per-object significance so game logic can decide "what level of detail objects
  should be at, tick frequency, whether to spawn effects" (UE 5.7 API docs). This
  is the general pattern SpaceFace's `shouldRunOnTick` + `SIM_TIER` + quiet
  latches already implement locally.
- **Temporal reprojection / TAA**: reuse last-frame radiance via camera +
  per-pixel motion vectors (velocity buffer) with history clamping — Karis'
  *"Temporal Reprojection in INSIDE"* lineage. In three.js this is `TRAANode`
  (renderer nodes): it requires `depthNode` + `velocityNode` passes and camera
  jitter, and it is **WebGPU-only** — no WebGL path (three.js docs + source;
  three.pr-31895 shows the velocity-node scaffolding is still settling). SpaceFace
  renders on `WebGLRenderer` — and this box has no GPU at all (SwiftShader) — so
  reprojection is both architecturally gated and unmeterable here.
- **Frame-pacing governors** (spike smoothing): spread-and-slice work across
  ticks so the worst tick costs a fair share — UE's `FOrderedBudget`, Unity's
  budgeted jobs, and this repo's `takeNearWorkSlice`/`stampNearWorkBudget` are
  the same idea.
- **Fixed-timestep decoupling** (Fiedler, *"Fix Your Timestep!"*) is already the
  sim's architecture: 60 Hz tick loop decoupled from presentation, which is the
  precondition for every technique above.

Takeaway: the research points at techniques SpaceFace mostly already has. The
lane's job reduced to an **honesty census** — find what is NOT yet amortized.

## 2. ASSESS — the census

Read first per lane instructions: `PERF_MASTER_PLAN_2026-09-26.md`,
`PERF_METHODS_2026-09-26.md` (landed leaves + forbidden list), and
`simattr-REPORT.md` (per-system spike census: physics & world are the "prime
suspects"; tacticalAI/ordnance scale with entity counts).

Per-tick systems surveyed, with their existing amortization mechanism:

| System / sub-tick | Existing amortization |
|---|---|
| `tickFarActors` (farActorTable.js) | `FAR_EMPTY_QUIET` latch + rescan deadline |
| `tickOpticFieldRocks` (asteroidField.js) | `OPTIC_FAR_QUIET` latch |
| `_tickAsteroidFieldInteractions` | parked latch while field unmined |
| `_tickFieldRegrowth` | `FIELD_REGROWTH_SCAN_TICKS` (300) cadence |
| world record GC | `WORLD_RECORD_GC_TICKS` (60) cadence |
| `difficultyDirector` | quiet latch + 0.5 s rescan deadline |
| `lawSecurity` | sanctuary latch + NEAR clock |
| 46 calendar systems | CALENDAR clock: 2 Hz, cohort-straddled ×10-tick sub-phases + pinned anchors |
| 16 near systems | NEAR clock: primary ticks only, never catch-up |
| `masslineTelemetry` | surveyed, REJECTED — edge-sensitive snap/reel machines + `maxStrainSinceLatch` peak accumulator can miss a 1-tick peak under gating |
| `stationServices` | inert off-dock early-out |
| `npcJobsRuntime`/`titles`/`planetRuntime`/`heat`/`chronicler`/`scanner` | sim-clock sweeps or early-outs already present |
| `syncContactShadowPool`, `serviceRenderMeshResidency`, `syncEntityViews` (renderer.js) | delta-dirty instance writes, 0.1–0.25 s polls, SoA lanes + persistent submit lanes (reprojection-style pose reuse already in-tree) |
| HUD aggregations | GLASS clock + per-tick memo (`ensureActivityClassified`) |

Rejected candidates (evidence, not vibes):

- **`_tickHazards` / `_tickWorldOneOffSpin`** — dt-integrated (radiation
  damage, rotation); skipping ticks changes integrals → not identical.
- **`_tickFrameOrigin`** — feeds the hashed origin; must stay 60 Hz.
- **`_tickAsteroidFieldInteractions`** — physical rock promotion is spawn
  semantics (hash-visible).
- **`computeTranslationControl`** (flightDynamics.js) — hashed control force,
  part of the sim hash path; skipped-tick interpolation would alter it.
- **`clonePlain`/`sanitize`/`canonicalStringify`** — serializer/hash path,
  wave-3 territory, results consumed per-run; no temporal coherence to exploit.
- **`writePhysicsTelemetry`/`updateTelemetryAndBreak`** — survival-arena
  gameplay consumer reads every tick; gating changes gameplay reads.
- **TAA / motion vectors** — WebGPU-only in three.js; renderer is WebGL;
  this box renders via SwiftShader (no GPU read possible).

## 3. IMPLEMENT — the leaf

`world.update` ran four *observational* proximity scans every tick:

- `_tickResidency` — corridor membership (Voronoi over 23 corridor sectors,
  hysteresis dwell). Output: `sector:exit/enter` transitions — monotonic.
- `_tickZoneLabel` — `zoneAt` O(zones) disc scan. Output: `world:zoneEntered`
  transitions — monotonic.
- `_tickPOIScan` — O(pois) distance+reveal walk. Output: discovery/identify
  transitions — monotonic (nothing un-discovers in a tick).
- `requestDecodeRunwayPromote` (presentationSources.js) — 2 spatial queries/tick
  over far/field rows. Output: promote-edge stamps — monotonic.

All four only ever *settle toward* a terminal state; none integrate `dt`, none
feed the sim hash path, and none reorder work inside a tick. Gating to even ticks
defers each transition by ≤1 tick and halves the per-tick walk — identical
output on run ticks, which is the PERF_METHODS leaf grammar's preferred shape
("provably-identical work removal").

Patch (`src/systems/world.js`, +13/−4):

```js
const WORLD_OBSERVE_SCAN_TICKS = 2;
// in update(dt, state):
const observeTick = (state.tick | 0) % WORLD_OBSERVE_SCAN_TICKS === 0;
if (observeTick) this._tickResidency(state);
...
if (observeTick) this._tickZoneLabel(state);
if (observeTick) this._tickPOIScan(state);
...
if (observeTick) requestDecodeRunwayPromote(state, this.helpers);
```

Ordering inside run ticks is byte-for-byte preserved — the gate only skips whole
ticks. Sub-tick call shapes are untouched, so the direct-call contract tests
(`_tickResidency`, `_tickPOIScan`, `requestDecodeRunwayPromote` harnesses) are
unaffected.

## 4. VERIFY

**Golden 47a**: `node scripts/sf-sim.mjs run 47a --seed 47 --ticks 720 --inputs
test/47a.inputs.json --expect test/47a.telemetry.expected.json --hash
--repeat 20 --reload-at 600` → `"deterministic": true`, sha256
`cc9419388b2608d697345bb94a786c4120cfc21e04365f437e15c4c4c0a4e885` === current
expected (note: prompt's stated baseline `f3583c50…` was superseded by the
2026-09-27 economy-honesty re-record; master reproduces `cc9419388b`). Exit 0.
(`world` is not in the 47a curated system set — the leaf is golden-invisible by
construction; the run still confirms no collateral in shared code paths.)

**Probe A/B** (`scripts/w4-observe-bench.mjs`): synthetic ceres-sector state,
24 POI carriers, stations/gates/fields/hazards; warmup 120 ticks then timed
`world.update(1/60)` loop, A = stash / B = leaf:

| run | µs/tick (update) | events | POIs discovered |
|---|---|---|---|
| baseline | 31.16 | originShift×1, zoneEntered×1, toast×1 | 24/24 |
| gated 30 Hz | 29.48 | identical | 24/24 |

**−5.4% of `world.update` wall time, outcome-identical.** The harness runs ticks
back-to-back so every transition still lands; the cost model is strictly halved
(four O(pois+zones+sectors) walks skip every other tick).

**Focused tests** (`node --test`, 12 files): 93 pass / 5 fail. All 5 failures
reproduce byte-identical on the baseline stash (pre-existing master breakage in
`exploration-discovery-journal`, `funnel-cache`, `packet-codex-b-contracts` —
story/census assertions unrelated to tick cadence). Zero regressions introduced.

## Verdict

LANDED: `WORLD_OBSERVE_SCAN_TICKS = 2` on the world's observational scan block —
the one remaining un-gated every-tick walk of the "environment scans" archetype
named in the lane brief. Everything else in the family is already amortized; the
reprojection branch of the research is architecturally inapplicable (WebGL, no
velocity pass, no GPU on this box). Spike-smoothing beyond landed machinery is a
plateau: the remaining 60 Hz work is hash-path or edge-sensitive by measurement.
