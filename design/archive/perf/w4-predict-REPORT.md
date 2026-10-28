# Wave-4 Lane Report — Predictive Prefetch

Lane question: *can we infer the next-needed assets from kinematics/route instead of authored
triggers alone?*

Branch: `devin/1790651081-w4-predict` off `origin/master` (9a30ffc0).

## Verdict

Predictive prefetch ships — but as a **decode-census warm, not a prewarm record**. The prior
waves already landed entity-level kinematic coverage (decode runway 13.5 s horizon, two-lane
authored prefetch ship + non-ship with depth-2 lookahead, deadline-aware splice into the
serial entity-plan lane, residency/landmark bounding). The remaining gap is exactly one
artifact: the **whole-sector authored census warm** fires only at `jump:chargeStart` (≈3 s
of charge), while the nav layer names the destination seconds-to-minutes earlier.

The naive implementation — a speculative record in `_incomingSectorPrewarm` — was built and
rejected on measured grounds: the slot is owned by the *current* sector's own
settle→publish lifecycle for most of a short approach (`_incomingSectorPrewarm ===
_authoredSectorPrewarmPending` for the entire 19 s executor flight in probe), so a
speculative record either starves waiting for the slot or must supersede the live settle —
the latter aborts the current sector's staged boundary publication, a visible regression.

What landed instead: `updatePredictedSectorPrewarm` (residency poll cadence) warms the
predicted sector's authored census **under its own residency owner**, through the same
`preloadAuthoredParts` serial ambient path the record's census uses, and never touches the
record slots. `admitAuthoredAssetTask` dedupes decode work by `url::slot`, so when
`jump:chargeStart` creates the authored record its census instant-hits every file the
prediction already decoded. No boundary staging, no certification changes, no visible
behavioral surface — it only prefetches earlier, never loads less.

## Research citations

- **X-Plane 12 scenery loading** (XEarthLayer whitepaper,
  github.com/samsoir/xearthlayer `docs/dev/xplane-scenery-loading-whitepaper.md`): flight-sim
  scenery streams tiles by heading direction, not radius — lead ~1–2° of arc, keyed to flight
  phase. Precedent for velocity-vector + route prefetch over pure proximity.
- **Analyzing Pre-fetching in Large-scale Visual Simulation** (NUS, cgi05 —
  comp.nus.edu.sg/~tants/prefetch2_files/cgi05.pdf): formal viewer position+velocity prefetch
  model for large scene graphs — prefetch region = future visibility under current velocity,
  horizon-limited.
- **Prediction-Based Prefetching for Remote Rendering Streaming** (Virginia Tech TR —
  eprints.cs.vt.edu/archive/00000984/01/PredictionPrefetch-TR.pdf): prediction vs spatial
  locality A/B — +35% / +17% hit-ratio gains from velocity-predicted prefetch.
- **Using prefetching to improve walkthrough latency** (Wiley CAV 14(4), doi
  10.1002/cav.149): object-correlation / semantic prefetch — prefetch what the *task* implies
  (route, intent), not just what the camera implies.

## Assessment — what was already covered

Read both `PERF_*_2026-09-26.md` docs plus `src/render/assetLoader.js`,
`assetResidency.js`, `authoredAdmissionPolicy.js`, `tabletopPolicy.js`:

- **Entity level is saturated.** `kickDecodeRunwayAssets` runs every residency poll;
  kinematics admission (`timeToEnterRadiusSeconds`) feeds `admitEntityPlan` with deadline
  splice; authored parts prefetch along ship + non-ship lanes two hops deep.
- **Sector level has a single warm trigger.** `beginIncomingSectorPrewarm` is created only
  by `jump:chargeStart` (`GATE_CHARGE` ≈ 3 s) or the `sector:enter` path itself; its serial
  `preloadAuthoredParts` census then has to finish inside the charge + jump window on the
  fail-closed publication contract. The slot additionally stays pinned to the *origin*
  sector's own pending record for most of the early approach.
- **Earlier intent signals exist and are reliable.** `nav.executor` (route follower legs),
  `nav.autopilot.targetEntityId` (gate entity), `nav.waypoint.targetSectorId`,
  `nav.route.legs` (plotted path), and ballistic gate approaches
  (`timeToEnterRadiusSeconds` on `data.isGate` entities) all name the destination sector.

## Implementation

`src/render/sectorPredict.js` — pure scorer `predictNextSector(state, {heldSectorId})`:

1. `route-executor` — `nav.executor.engaged`, status ≠ `arrived` → `legs[legIndex].toSectorId`.
2. `autopilot-gate` — autopilot active, target entity is `data.isGate` → `data.gateTo`.
3. `waypoint-sector` — `nav.waypoint.targetSectorId` while autopilot active.
4. `route-plotted` — `autoTravel` + `nav.route.legs` → leg leaving the current sector.
5. `gate-approach` — ballistic `timeToEnterRadiusSeconds` into `max(dockRadius, 260 WU)`
   within a 30 s arm horizon (120 s hold hysteresis for a held sector). Refuses fly-bys and
   retreats; skips the current sector and out-of-sector gates.

`src/render/renderer.js` — `updatePredictedSectorPrewarm(owner)` inside
`reconcileMeshResidency` (existing residency poll, zero added cadence):

- prediction → warm `{type:'predicted-sector-warm', sectorId}` owner over
  `preloadAuthoredParts(census.map({residencyOwner, role:'sector-predicted', sectorId,
  isResidencyOwnerActive}))` — the same census (`this._sectorPrewarmRequests`) and the same
  serial one-at-a-time decode loop the authored record uses. Same budget, same queue.
- retract on prediction drop/move (`predicted-sector-warm-retracted`); absorb when any of
  the three record slots covers the sector (`predicted-sector-warm-absorbed`) — the
  authored census then owns the same decode keys.
- reset paths (`disposeRendererOwnedResources`, render-system init) release/null the warm.

## Verification

Golden determinism — `node scripts/sf-sim.mjs run 47a --seed 47 --ticks 720 --inputs
test/47a.inputs.json --expect test/47a.telemetry.expected.json --hash --repeat 20
--reload-at 600`:

- branch: `deterministic: true`, `sha256 === baselineSha256 ===
  cc9419388b2608d697345bb94a786c4120cfc21e04365f437e15c4c4c0a4e885`, 20 repeats.
  (The prompt's baseline `f3583c50…` is stale — the checked-in expected telemetry
  carries `cc941938…`, and master produces that same hash.)

Unit — `node --test test/sector-predict-prewarm.test.mjs`: **16/16 pass** (all five signal
legs, current-sector exclusion, fly-by/retreat refusal, cross-sector gate exclusion, 120 s
hold hysteresis, intent-over-kinematics priority, plus warm arm/retract/supersede/absorb/
record-ownership/off-flight owner-path coverage).

Live probe — `node scripts/probe-w4-predict-prewarm.mjs --headless` (New Game seed 4242,
atlas revealed, `ui:setCourse` → `nav:engageRoute`, real route-executor flight
Helios→Ceres), A/B vs master worktree:

| metric | branch | master |
|---|---|---|
| predicted warm arm | sim 11.9 s — `route-executor`, 59 reqs | — |
| chargeStart (ceres) | sim 18.6 s | sim 19.6 s |
| **warm settled before charge** | **59/59 decoded, 6.7 s lead** | cold at chargeStart |
| arrival census published | +5 s, `pending=0` | +5 s, `pending=0` |

The destination sector's entire authored census was resident ~4 s before the charge window
began; the authored record inherited it fully hot.

`probe-frame-solid.mjs --headless` A/B (in-sector, predictor never arms): both FAIL with
the same environmental signature on this soft-GPU CI box — `rootHidden`/`asset:loading`/
`compiling-pipelines` missing-frames and identical `uploadTexture … 'width'` page errors
on both sides (10 branch / 3 master — variance, not mechanism; master shows them too).
Per-run totals swing widely (missingFrames 496 vs 242 while master's run also ran ~40%
longer wall-clock); no diff-mechanism exists on this probe's path since no route is ever
engaged.

## Constraints check

- **Zero visible quality change**: the warm publishes nothing, stages no boundaries, alters
  no cadence — it retains decoded blueprints only; boundary/publish contracts untouched.
- **Only prefetches earlier, never loads less**: retracted owners fall back to the same soft
  package cache the record's released assets use; `isResidencyOwnerActive` makes the warm
  cancelable mid-chain exactly like record cancellation.
- **Never amend**: single commit series, no rewrites.

## Residual notes

- The warm is decode-only; GL upload + shader compile still happen at the authored record's
  stage boundary (by design — they are the visible side the contract certifies).
- A wrong prediction costs one sector-census of decode work that lands in soft cache —
  bounded by existing soft-budget sweeps, identical fate to a superseded record.
- Sector-idle pins: a plotted-but-never-flown route holds the warm; that is stated intent,
  and retract-on-drop covers route clears.
