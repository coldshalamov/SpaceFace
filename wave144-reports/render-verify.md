# wave144 render-verify report

- Lane: render (presented-frame pipeline) — read-only audit, no code/PR/app-run.
- Audited tip: `devin/1791504143-perf-w120` @ `e4c409d32` (fetched 2026-10-11; tip drift vs the brief's named commits: a reconcile merge landed on top — audited the actual tip, not the brief's enumeration).
- Prior pin: `e1e9cc24c` (wave143 → saturated). Delta pin↔tip = the three named commits (`9093c6959`, `8c9daef8d`, `9d752aa76`) + master merge `d99f98c71` (world-remembers/Gyre/racing batch) + reconcile merges `a32389628`/`e4c409d32`.
- Headline: `vendor/three.module.js`, `src/render/post/spaceRenderGraph.js`, `src/render/presenter.js`, `src/render/post/bloom.js`, `src/render/renderer.js` are **byte-identical pin↔tip** (0-line diff). The presented-frame machinery is untouched; the wave143 replay-prelude floor table holds verbatim.

saturated: true

## VERIFY — new commits vs the presented path

### V-1 `9093c6959` snapshotFence per-slot dirty consume — MECHANISM_VERIFIED, no capture-contract interaction

- Mechanism: `packPresentationWorldToFenceSteps` (snapshotFence.js :629–660) now clears `dirty[slot]=0` as each mark is scanned and buffers the slot in `consumedDirty`; a bail/membership-mismatch restores consumed bits (`:655–658`) before the classic walk. This mirrors the atomic walk's mark-after-process ⇒ next-pack-rewrite self-heal (its `dirty.fill(0,0,scan)` runs only at commit, `:536`-region comment), closing the mid-park mark-loss the trailing fill caused. Correct on all three exits: commit (rewrites committed, marks stay clear — byte-identical outcome), bail/mismatch (marks restored → classic walk repacks), dead-slot marks (consumed, no row — same as the atomic fill).
- Capture contract: **no interaction.** The pack is a stepped leg in the frame's sync pass (renderer.js :28113–28210, parked under the 4 ms wall bound, `pacedFrameSpend`-consulted pre-mint and debited post-step :28137–28190). It writes only the fence buffer — never the THREE scene — and cannot interleave between `renderAndCaptureList` and `renderCapturedList`, which are one synchronous call inside spaceRenderGraph.js :424–432.
- New allocation: one `consumedDirty` array per pack mint + O(dirty-marks) pushes — off the presented path, bounded by the pack window.
- Residual (hardening nit, not material): exits that bypass the restore — the driver's `iter.return()` supersede (renderer.js :28126–28130) and a thrown pack (`closeCookStepsIter` :28163) — leave consumed marks cleared with their rows in the dead buffer. **Supersede is masked**: `fastPackPrevious`/`previousIndex` require `previous.poseEpoch === poseEpoch` (snapshotFence.js :418, :664–665), so a new-epoch pack disables the clean-slot copy path and rewrites every live row by identity — nothing can strand. A same-epoch mid-scan **throw** could strand consumed marks → stale rows until the slot re-marks; requires an exception inside a typed-array-write loop (the same exposure the stepped twin's classic portion already carries at :687/:728). Fix if ever seen: wrap the scan in try/finally restoring `consumedDirty`.

### V-2 `8c9daef8d` packageDetachSerial + works consult re-collect — off the presented path

- `bumpPackageDetachSerial()` is an O(1) integer increment on CPU-payload releases only (imageSourceDedupe.js :449/:463, packageCpuDetach.js :411/:536); releases are event-rate, not per-frame.
- The re-collect lives in the asteroid works-screen's `webglcontextrestored` consult (asteroidRenderer3d.js :1403–1445) — async, event-gated, bounded at `CONTEXT_RESTORE_RECOLLECT_MAX = 4` re-fires per chain. Separate renderer/canvas from the presented loop; nothing added to a presented pass.

### V-3 `9d752aa76` — docs only; `d99f98c71`/`e4c409d32` merges — zero machinery additions

- Full-diff scan of every merged `src/` change: **0** new `onBeforeRender`/`onAfterRender` hooks (the only match is a comment line in packageCpuDetach docs), **0** new `updateMatrixWorld` calls, **0** new rAF/timer arms in `src/render/`. Merged content (gyreSnarePresentation, emergentPayloadPresentation, racing views, camera.js, vfx recipes) adds scene objects and sim-side behavior only — the pipeline mechanics it flows through are unchanged.

## FLOOR TABLE — re-verify at `e4c409d32`

Vendor + graph byte-identical ⇒ the wave143 table holds verbatim. Spot re-verified the load-bearing lines at tip: replay copy + instanced filter :17891–17909; `projectObject`/`finish`/`sort`/`addToRenderList` inside the non-replay else :17911–17933; depth-gated shell capture :17936–17951; `info.render.frame++` falsy-guarded :17962; `shadowMap.render` :17966–17968 (empty `shadowsArray` → `lights.length===0` early-out :9369); `setupLights` falsy-guarded :17990; `capturedList` predicates fully falsy-normalized (zero `=== undefined` remains). Residual O(>1) on a replay call: the O(N) shell copy + O(N) draws — the floor itself.

## HUNT (fresh — capture-side costs never before measured)

### H-A `setupLights`/`lightsArray` work on the capture pass — bounded, upstream parity

- Replay skips `setupLights` entirely (falsy guard :17990); the capture pass pays `lights.setup(lightsArray)` — an O(L log L) `shadowCastingAndTexturingLightsFirst` sort (:8819) + O(L) uniform fills (:8820+) — plus `setupLightsView` O(L) matrix transforms inside renderScene.
- **L is a small frozen constant, by hard design:** sector light set = 4 (ambient + 3 directionals, renderer.js :10378–10381); event pool = 6 + weapon pool = 2 PointLights, always mounted AND always visible (vfx.js :429, :15204–15210; weaponLights.js :6–35) — toggling the visible count would re-key every lit shader (NUM_POINT_LIGHTS baked into programs), so the pools pin the census constant and precompile warms against it. Authored content **cannot** inject lights: assetLoader.js :1587–1588 rejects GLB nodes embedding a light/camera, renderPackageLoader.js :655 same policy. ⇒ `setupLights` ≈ 12–16-light work per capture frame — a fixed micro-cost, no scaling term. MECHANISM_VERIFIED + bounded.

### H-B `shadowMap.render` capture vs replay — bounded; replay free-rides capture output

- Replay: `shadowsArray` stays empty (populated only inside `projectObject`) → `lights.length === 0` early-out → O(1). Its draws still sample shadow maps rendered on pass 1 via the persistent lights state — correct by design.
- Capture: pays the staged shadow set — bounded twice over: (a) `scope.enabled === false`/`autoUpdate` gates early-out when the shadow setting/arm is off (renderer.js :10676 re-gates per frame; :29283); (b) when armed, the shadowDepthAdmission machinery holds the live shadow-light set to the staged key (`SF_AdmissionShadowDepthKey`, shadowDepthAdmission.js :96–110) with census memos + per-slice recollect budgets (:222–232). One bounded depth pass per armed light — upstream+admission parity, no wave-added term.

### H-C sort cost inside `projectObject`'s finish — paid once, inherited by replay

- `currentRenderList.finish()` (:8512–8526) is O(stale-tail) reference nulling — not the sort.
- `currentRenderList.sort()` (:8504–8508) = O(N log N) per non-empty list (opaque/transmissive/transparent) with allocation-free field comparators (`painterSortStable`/`reversePainterSortStable` :8343–8380) — runs **only on the capture pass** inside the non-replay else (:17919–17925).
- The shell capture copies the **post-sort** arrays (:17936–17951) → the replay draws the already-sorted order and pays zero sort. Sort-once-draw-twice: the two-pass route costs the same single sort any upstream render pays. `sortObjects` untouched (default true).

## STANDING LEDGER (carried)

- F1 pre-existing edge (thrown render leaves `renderListStack` non-empty → later captures silently dead) — unchanged.
- snapshotFence same-epoch throw-exit can strand consumed marks (new this wave; supersede masked; rare) — watch only.
- `consumedDirty` per-mint array + two 3-element literals in the replay copy (:17899–17900) — micro-allocs, off-path/by-design.
- Debug assert residual; PR #260 — carried.
