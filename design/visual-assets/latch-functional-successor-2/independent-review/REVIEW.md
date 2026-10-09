# Independent review: Latch Nine functional successor 1

## Verdict: request changes

The frozen packet has two reproducible lifecycle defects. Its scoped normal-route, native-control, model/package, and shared-owner contracts otherwise passed the checks below. This is a review of unpromoted WIP, not shipping/visual/performance acceptance.

### F1 — owned death is lost when current service eligibility is absent (high functional impact)

`src/systems/latchNine.js:46–47,80–87,96–102` authenticates destruction through `_tender`, which represents current eligible presence. Setting the actual owned tender's `data.disabled=true` drops `_tender` even though the materializer still owns that exact entity and generation. A subsequent real death (`hull=0`, `alive=false`, `entity:killed`) is ignored.

Independent evidence:
- `independent-normal.test.mjs`: the disabled-owned-death case fails; the other five cases pass
- `disabled-death-consequence.test.mjs`: after the death, JSON save contains `destroyed:false`, spawn budget remains 1, and the materializer retains the dead actor. After semantic Continue, a fresh live Latch is created and `destroyed` remains false
- The reproduction does not treat an ID-only event as death truth. It kills the exact actor actually spawned by the normal materializer

Required correction: retain exact owned entity/lifetime identity independently of active presentation/control eligibility, use it to authenticate death, preserve the current-map/generation/departure fences, release the owned budget, and ensure Continue cannot resurrect it. Unrelated and recycled identities must remain unable to mark destruction.

### F2 — hiding the body root leaves its separate pooled plumes active (medium presentation/lifecycle impact)

`src/render/latchNineVisuals.js:8–9,35–40` returns from `inside()` before checking visibility of the matching entity root, and the subsequent ancestry walk does not check visibility. The plume group is separately mounted in the scene.

`independent-presentation.test.mjs` decodes the actual compiled package, creates native Latch actuation, and uses the actual industrial `ContinuousPlumeSystem`. After `entity.mesh.visible=false`, the driver still exposes six lit channels and the plume batch emits six channels into 30 active pooled slots. Expected is zero emission while the owning body is hidden. The same suite confirms root replacement withdraws plumes and double disposal releases every owned material exactly once.

Required correction: include the entity root and higher ancestors in visibility validation, withdraw both mouths and plumes while hidden, and resume correctly when the same valid source/lifetime becomes visible again. Ordinary offscreen native-body ownership should remain separate from visual visibility.

## Source/provenance boundary

- Frozen packet: `recovery-latch-20261004/latch-functional-successor-1`
- SOURCE_MAP SHA-256: `223d37c0160c681cf8d8aa1835edc48f49fefebb201119c0036655e32aaf26b5`
- Accepted combined-v3 source-map SHA-256: `2ea9dabaa3963a8f928022cf2a443fa0b82ff039b34876e5badb05be0507df2e`
- All 57 postimages, declared base-file hashes, and packet manifest entries verified. See `hash-verification.json`
- Existing private runtime: `recovery-latch-20261004/normal-route-v2`; no new checkout was created and no production source was changed by this reviewer
- `audit-loader.mjs` records actual imported URLs, realpaths, source-byte hashes and hashes returned by Node's loader. 43 frozen files were imported across the review suites; 1,010 runtime source/script/test modules were observed. No runtime source escaped through a symlink, no loaded-source byte mismatch was observed, and no path acquired multiple loaded hashes
- Unchanged imported modules match accepted combined-v3, except the disclosed generated `modelTruthCensus.json` and `renderPackageManifest.js`. Their exact hashes are in `import-audit.json`. The former adds Latch and regenerates four existing Ceres measurements; the latter only adds Latch
- Selected release/pilot/fleet rows match the frozen selection; unrelated membership/order is preserved. The private regenerated parts manifest also changes the existing Brood Mite bounds/socket ordering. This private aggregate is not the integration deliverable: import selected rows and rebuild aggregate registries under the integrator's ownership
- The selected parts-row note says 27 fixed slabs but current source/census/native body use 29 fixed slabs plus three paddles; this is a stale descriptive note, not the collision geometry
- `final-hash-recheck.json` confirms all runtime and frozen postimage hashes at the original review boundary. The author briefly applied and restored a correction while report sealing was in progress; no original test/import ran in that interval, and the final check found no drift. The correction is reviewed separately

## Executed checks

Commands used Node v24.19.0 with `--preserve-symlinks --preserve-symlinks-main`, the audit loader, `--test --test-reporter=tap`, and the existing private runtime as cwd for asset-reading cases. The directory contains unchanged logs and executable independent repros. Fixture setup was extracted from the producer's normal-route and actual-package fixtures; assertions and adverse scenarios were independently authored.

- `focused-rerun.tap`: 94/94. Latch service/runtime/reconstruction/guidance/normal materializer/package checks plus dock-intent, physics-owned-control and canonical first-place transaction contracts
- `shared-rerun.tap`: 29/29. Ceres census/admission/presentation, physics authority caching and owned-control contracts
- `prior-adverse-rerun.tap`: 7/7 unchanged earlier adverse tests. Previous-consumed force remains visible after a new submission; foreign equal-valued control is rejected; teardown does not overwrite later foreign commands; native failure and missing next-tick command withdraw actuation; signed yaw correction and full paddle travel remain valid
- `independent-normal.tap`: 5/6; F1 is the sole failure. Passing cases include damage after observation, native observation gaps, sector-exit versus death, repeated runtime initialization/teardown, and scene de-admission/native teardown
- `disabled-death-consequence.tap`: 0/1; deeper consequence of F1, not a third defect
- `independent-presentation.tap`: 1/2; F2 is the sole failure. Root replacement and material restoration/disposal pass
- `docking-current.tap` and `docking-accepted-base.tap`: both 25/28, with exactly the same three failures below

There was one invalid initial test invocation because the new audit-loader file was written relative to the wrong cwd. It failed at module loading, before testing production behavior; preserved as `invalid-invocation-missing-loader.log`. The corrected invocation is the result reported above.

## Independently confirmed pre-existing docking failures

Both accepted combined-v3 and the frozen Latch successor fail the same unchanged tests:
1. `default station autopilot stages an outside-gap approach through the measured corridor mouth`: assertion `same retained case re-measured against the live skin berth`, expected true, actual false
2. `proxy diagnostics publish frozen world geometry on the physicsRuntime surface (debug seam)`: expected 322.5, actual 172.5
3. `real authority: capture settles at the berth with bounded per-tick velocity change`: actual per-tick delta-v 0.43333410367619046 exceeds bound 0.43333333333333335

These are not newly introduced by this packet; they are not repaired or waived by this review. No full ambient piloted route success is inferred from manually positioned approach/berth fixtures.

## What the evidence establishes

- Normal owner creates one canonical actor through the existing spawn budget, binds one slot, uses measured station geometry for its service box, and excludes its actor from generic durable world-record serialization
- Sector exit retires native/control leases and releases the slot without recording destruction; return uses a fresh actor/lifetime
- Opaque consumed-control identity, current native tick and numeric delivered-force agreement jointly gate visible thrust. Foreign equal-value/source writes do not impersonate the owned receipt
- Actual compiled geometry, source publication, native 32-piece compound, independent mouth channels, current scene ancestry, pooled plumes and material teardown are exercised. No fake GLB substitutes for the canonical package
- Guidance uses the existing station broadcast consumer; ordinary dock intent/UI commit remains the authority. Clean-arrival evidence requires contiguous native observations, current lifetimes and a one-use receipt. Independent late damage and observation-gap checks reject recognition
- Save hooks retain only met, cleanArrivals, incidentIds and destroyed. Actual semantic restore fixtures discard live/native references, transient motor angles and prior acknowledgement. F1 is the specific destruction exception
- Stale/missing/unrelated law-owner incident rows and repeated commits cannot inflate recognized facts in the tested cases

## Explicitly still open

Promotion is false. GPU/real game-view acceptance, a complete ambient flown route, full-game cold Continue, and real GPU draw/performance measurements are not established. Current CPU composition is 25 visible mesh candidates per LOD; source triangle totals are 24,040 / 9,606 / 3,414. These exceed the proposed near-10 mesh/draw and 14,000 / 5,600 / 2,500 triangle budgets. Geometry/nozzle-seat art remains WIP. Neutral previews were inspected by the parent, not independently accepted as game-camera evidence here.

No source, shared integration tree, remote, merge, deploy, or gameplay writer was changed by this review. Existing worktrees were inventoried only; concurrent/foreign trees were left intact under the explicit assignment.
