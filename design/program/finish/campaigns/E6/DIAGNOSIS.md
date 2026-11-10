<!-- LIFETIME: CAMPAIGN -->
# E6 — Nothing appears before it is ready: diagnosis

**Campaign:** E6 (Lane 3, RENDERER). Written before any edit, 2026-11-06.
**Measured on:** this laptop, headed Chrome, Intel integrated ANGLE/D3D11, 1600x900, shared
checkout while other agents ran. Host was contended (825 of 877 flight frames over 50 ms), so
**counters are the evidence here, not frame times**.

## 1. What the player sees

Ships and wrecks appear late and then settle; a body that has been on screen for a second is
sometimes still not drawn at all; and every so often the whole frame stalls for 100–300 ms when
something new enters the picture. Models "blink" — drawn, gone for a moment, drawn again.

## 2. The measured cause chain

Instrument: `node scripts/probe-frame-solid.mjs` (the standing pop-in/blink guard rail,
`scripts/lib/frameSolidSampler.mjs`). Baseline report:
`.devshots/frame-solid/2026-11-06T16-36-57-957Z.json`.

```
frames 877        blinks 0     rootSwaps 1     regressions 0
missingFrames 139 stuckMissing 100            leftUndrawn 1
time-to-appear  69 episodes, 60 on time (0.87), 7 late
                 late p50 496 ms, p95 2130 ms, max 2130 ms
in-flight shader links 30 (5 of them inside a frame that was drawn)
gpu submission  bufferFullUploadsPerFrame 6.0
                bufferPartialUploadsPerFrame 81.5
                bufferUploadBytesPerFrame 140,584 B
admission lanes pipelineHeldRoots max 103, residencyPending max 101,
                upgradePending max 70, upgradeCompiling max 19
authored jobs   pipelineMs 48 %, compileMs 37 % of timed job time
                (max single pipeline leg 5,799 ms; max compile leg 4,913 ms)
```

Four separate defects, in the order they cost the player:

1. **A drawable links its program inside a drawn frame.** 30 shader links happened in flight and
   **5 landed inside a frame that was actually drawn** (`plume-system`, `rcs-system`,
   `Asteroid_*`, `SF_RibbonTrail`, `wr:lantern-ward`). The draw guard *can* refuse an uncompiled
   draw, but it only does so while the scene scan is armed (`__sfUnreadyDrawGuardDepth > 0`), and
   production swaps the wrapper out at settle (M2 `disarmOnSettle`) to stop paying for the walk.
   A new material mounted on an **existing** object after settle changes neither the scene child
   count nor the program count before the draw, so nothing re-arms the guard and the link happens
   in the presented frame. This is the 100–300 ms "admission brick" on a live route.

2. **A drawable uploads its vertex/index buffers inside a drawn frame.** `bufferFullUploadsPerFrame
   6.0` in steady flight; the residency stamp (`geometry.userData.spacefaceGpuResident`) is only
   written by the boot/warm residency pass. Anything created after that — VFX roots, tethers,
   props, a live swap to a quality-tier geometry — draws first and uploads first, in the presented
   frame. `bloom.js` only *reports* these (`describeUnstampedVisibleGeometries`) when a brick has
   already happened.

3. **Bodies sit on the glass with nothing drawn.** One ship (`id=635, ship_drifter`) was hidden for
   **100 consecutive frames** with `pipelinesPending`, `geometryPending`, `admissionSubstrate` and
   `asset:compiling-pipelines` all set, while `inGlassSet=true` for 88 of them. `leftUndrawn` and
   the 2,130 ms late tail are the same class: the admission lanes carry a backlog
   (`upgradePending` peaked at 70, `residencyPending` at 101) and the gate resolves it by hiding.

4. **The forced heavy admission.** With the frame late, `_drainMeshBuildQueue` refuses to start
   work, and `shouldStartHeavyAdmissionEventually` forces **one heavy item after 3 skipped frames**
   (`HEAVY_ADMISSION_EVENTUAL_SKIP`, `admissionSliceBudget.js:45`). The slice budget is 3 ms
   target / 8 ms hard, but the drain "always completes at least one item", so three late frames in
   a row guarantee an unbudgeted build inside a frame the player is watching. The trigger is a
   frame counter, not anything about the body: an item sitting off-screen for the next ten seconds
   is forced in exactly the same way as one about to enter the camera.

Blink counters read **0** on this route already (the October blink work holds): do not re-fix
blinking as if it were open. The remaining pop classes are late, missing, and the brick.

## 3. Is the design the bottleneck?

**Partly.** The residency/admission system is not missing — `startupGpuResidency.js`,
`pipelineReadiness.js`, `liveGeometryAdmission.js`, `entityMeshVisibility.js` and the bloom draw
guard each own a real piece of it. The design defect is that **no single owner holds the
"ready" verdict**, so each piece answers for itself and they disagree:

- the draw guard answers "is the program linked?" only while its scan is armed;
- the residency pass answers "is the buffer uploaded?" only for the subjects it was given at boot;
- the submit gate answers "should this root be drawn?" from a snapshot of flags that the other two
  lanes write at different times;
- the build queue decides when to work from a skip counter, not from the body's predicted arrival.

Replacing the whole admission pipeline would be the wrong spend: the pieces work, and the boot
route is already clean. What is missing is one **residency manager** that (a) owns a per-drawable
proof of readiness, (b) is consulted on **every** draw rather than only during an armed walk, and
(c) turns "upload this later" into a budgeted queue instead of an inline surprise. That is a
bounded change to three files plus one new module; it keeps every existing lane and its tests.

Cost of the full replacement (rewrite admission around a retained render list): weeks, and E7 is
where that belongs. Cost of this change: days, and it removes the brick class outright.

## 4. The chosen road

1. **One residency manager** (`src/render/residencyManager.js`) owns the lifecycle
   `requested → loading → uploading → compiled → visible` for every drawable, and answers one
   question per draw: *is this object's geometry resident and its program linked?*
   - It keeps a **per-drawable proof stamp** (`geometry residency + material version + program`),
     so a settled drawable costs a property read, not a WeakMap walk or a GL query.
   - A drawable without proof is refused and its root is queued; the manager drains uploads with
     the existing `prepareStartupGeometryResidency` path (proven mid-flight by the warm-root call
     site), inside a per-frame byte/time budget.
   - Small geometries (≤ 32 KB, i.e. ordinary effect cards) upload inline and are stamped after
     the draw, so a hit flash never waits a frame. Big ones (authored hulls, tethers, place props)
     never upload inside a presented frame.
2. **The draw gate stays armed.** The scene walk may still disarm (that is what M2 measured); the
   per-draw compiled/resident check does not. This closes the post-settle link hole.
3. **Hold the drawable, not the hull.** A drawable without resident geometry is hidden and queued
   at its own granularity, so a late-mounted part, tether or prop waits without blanking the hull
   that carries it. (The first plan was to hold the whole bound root; measurement and review made
   clear that a per-leaf hold removes the same in-frame upload without ever making a ship
   disappear, so the leaf is the unit.)
4. **Predictive pre-admission replaces the skip counter.** The build and residency queues are
   ordered by **predicted time to glass** (position + velocity, 2 s lookahead) instead of
   "3 late frames → force one". A queued body that is about to enter the camera is urgent; a body
   parked off-screen is not forced into a late frame at all.
5. **Counters, permanently.** `visibleUnready` (a draw submitted while unready — must be 0),
   `firstVisibleToResidentMs`, `uploadsQueued`, `uploadMs`, `residentProofHits` are exposed on the
   renderer for the frame-solid probe and the E10 dashboard.

Nothing here fades, raises a budget, or adds a special-case gate. The look is unchanged: the same
meshes, the same materials, the same camera; only the frame on which a mesh is allowed to be drawn
moves later, to the frame after its data exists.

**Verify:** the frame-solid counters (`in-flight shader links inside a drawn frame`,
`bufferFullUploadsPerFrame`, `leftUndrawn`, `late`) fall, `visibleUnready` reads 0 on the
adventure route and the Crucible round, and the gameplay-camera capture is unchanged against
`docs/visual-assets/LOOK.md`.
