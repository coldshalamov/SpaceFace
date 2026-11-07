<!-- LIFETIME: CAMPAIGN -->
# E6 — STATUS

**Lane 3 RENDERER.** Updated 2026-11-06 (second review round). The single after-run and its
**FAIL** stand: it predates the measurement-layer fixes below and was not re-run.

## What is landed (this session)

| Piece | Where | Behaviour |
|---|---|---|
| One residency manager | `src/render/residencyManager.js` | Owns the `requested → uploading (budgeted) → visible` verdict for drawables that reach the presented draw guard, and the hold/queue/liveness policy behind it. It does not yet own program/compile readiness or texture versions (open item 2/3). |
| Per-draw residency gate | `src/render/bloom.js` (`unreadyDrawGuard`) | Every presented draw is gated, for entity leaves **and** VFX/tether/prop roots. A stamped geometry draws with one property read; an unstamped geometry ≤ 32 KB uploads inline and is stamped by its own draw; anything larger is held invisible and uploaded off-screen. |
| **Protected roots are never hidden** | `residencyManager.js`, `renderer.js` (`_bindPresentationMesh`) | Player/forceRender/neverCull subtrees are latched at bind; `holdRoot` refuses them and `admitGeometry` clears any stale hold and admits inline. A protected body is never blanked by the measurement lane, and the submit pass is protected-first. |
| **Non-renewable hold deadline** | `residencyManager.js` | The 2 s deadline is stamped once at the first hold. A refused redraw re-queues the request but no longer pushes the deadline, so a redrawn root cannot ride the 30 s driver watchdog. |
| **Honest draw-point counters** | `residencyManager.js`, `bloom.js`, `renderer.js` | `noteRefusedDraw(object, reason)` takes presentation from `__sfPresentedOnce` (drawable or ancestor), never a caller constant. `refusedByReason` splits geometry / instanced / compile / detach / submit / other. `visibleUnreadyDraws` is deduped per drawable until it is presented again; `presentedRefusedEntities` publishes the same deduped unit explicitly; `presentedRefusedDraws` keeps the raw per-draw count. A first-time turret/engine leaf under a presented hull is a presentation refusal. |
| **Presented proof includes ancestors** | `residencyManager.js` (`markPresented`) | A drawn leaf marks its entity root (bounded walk, stops at an already-marked node), so a missing child under a presented hull is classified as a presentation refusal instead of a silent pre-admission hold. |
| Hold liveness / fail-open | `residencyManager.js` | Every non-progress path retries or releases: upload errors back off (250/500 ms) then fail open after 3 attempts; a full queue spills to `heldUnqueued` and is re-admitted when space frees; a 1.2 s request TTL retries once; a 2 s hold deadline releases even an in-flight hold; a 30 s drain watchdog abandons a hung driver. A released hold sets a one-shot bypass so the next presented draw takes the pre-E6 inline path. |
| **Urgency upgrade before dedupe** | `residencyManager.js` (`requestUpload`) | An ambient hold that comes onto the glass is promoted to the urgent chain before the pending/in-flight dedupe return; `urgentUpgrades` counts in-place promotions. |
| **Separate urgent in-flight batch** | `residencyManager.js` (`drainUploads`) | One ambient and one urgent batch may be in flight together (the driver serializes GL submission). The single-flight rule remains for explicit `maxRoots` test/paced use. |
| **Deadline-derived drain throughput** | `residencyManager.js` | The old fixed 8 roots / 200 ms = 40 roots/s could not serve a 150-body burst. Selection now derives roots-per-drain from queue depth and the deadline cadence; a backlog (or a hold within 1 s of its deadline) drains at 10 Hz, the ordinary queue at 5 Hz. A synthetic 150-root burst reaches `pending: 0` inside 2 s with `admittedFailOpen: 0` under a normal driver. |
| **In-flight visibility** | `residencyManager.js`, `renderer.js` (`_scheduleResidencyDrain`) | `snapshot()` exposes `queued`, `inFlight` and `ghostedInFlight`; `hasOutstandingWork()` keeps the renderer timer alive after the last hold so the 30 s watchdog is reachable. |
| Budgeted off-screen upload lane | `renderer.js` (`_installResidencyManager`, `_scheduleResidencyDrain`) | Held drawables drain on a 200 ms background task (100 ms under backlog/near-deadline pressure) through the residency pass the warm roots already use mid-flight. Empty geometry uses `includeEmpty: true`, matching the `hasUnresidentGeometry` release census. |
| **Capacity-0 pools are not pending** | `startupGpuResidency.js` (`hasUnresidentGeometry`, instanced censuses) | A capacity-0 InstancedMesh has no instance bytes for the driver proxy to upload (`uploadable:false`); it is no longer counted unready, so fail-open is not the only exit. A forced hold releases on the next drain without a fail-open release. |
| **Real per-instance proof** | `residencyManager.js`, `startupGpuResidency.js` | The proof keys on `instanceMatrix` **capacity** and `version`, stamped by the driver's proxy upload and by a real draw. Live count churn inside the proven capacity draws (the old live-count latch produced 188 blinks and is not repeated). A grown/replaced instance buffer is held; a content rewrite on an already-presented pool is admitted and counted as `instanceVersionUploads`, not a blink. |
| **Context-generation stamps** | `residencyManager.js`, `startupGpuResidency.js`, `renderer.js` | `webglcontextlost` bumps the residency generation. `geometryGpuResident()`/`hasUnresidentGeometry()`/`admitGeometry()` reject pre-loss stamps, including pooled/off-scene geometry the restore pass never visits; the driver and real draws stamp the live generation. |
| Bind visibility cannot overwrite a hold | `entityMeshVisibility.js` (`applyBoundMeshVisibility`), `renderer.js` | The appearance commit no longer writes `visible = true` over a live `RESIDENCY_HELD`; the bind-then-submit overwrite is a focused test. |
| Resident stand-in preferred | `renderer.js` (`_bindPresentationMesh`) | A fresh bind that can already draw its resident resolving-marker stand-in is not held by the residency lane. |
| Compile wall deadline + fallback | `bloom.js` (`COMPILE_REFUSAL_FAIL_OPEN_MS`, `presentedFallbackMaterial`) | 1.5 s wall deadline from the first refusal; every refusal increments `__sfCompileRefusalCount`; the fail-open has `__sfCompileFailOpen`. An already-drawn object keeps its last proven material (`__sfCompileFallbacks`). The refusal episode now resets per material and after a quiet gap, so a later swap does not fail open on its first refusal. |
| **Honest probe gate** | `scripts/probe-frame-solid.mjs` | The E6 verdict names every failing clause and now requires `visibleUnreadyDraws === 0`, `presentedRefusedEntities === 0`, `admittedFailOpen === 0`, `residencyFailOpen === 0`, `inFlight === 0`, `ghostedInFlight === 0` and `pending === 0` as well as the blink/link/left-undrawn clauses. It does not drop a clause because it reads high. |
| **Mid-route lane sampling** | `scripts/lib/frameSolidSampler.mjs` | The 250 ms lane row records manager `pending`, `refusedDraws`, `admittedFailOpen`, `residencyFailOpen` and deduped `presentedRefusedEntities`, so a backlog that clears during the 2.5 s settle is still in the report. |
| Counters | `state.render.residency` (published ~2 Hz) | `visibleUnready`, `visibleUnreadyDraws` (deduped), `presentedRefusedEntities`, `presentedRefusedDraws`, `refusedDraws`, `refusedByReason`, `admittedProtectedInline`, `protectedHoldRefusals`, `instancedGrowthHolds`, `instanceVersionUploads`, `urgentUpgrades`, `preAdmittedHolds`, `heldDraws`, `heldRoots`, `releasedRoots`, `failOpenReleases` (alias `residencyFailOpen`), `admittedFailOpen`, `expiredRequests`, `expiredRetries`, `uploadRetries`, `queued`, `inFlight`, `ghostedInFlight`, `heldUnqueued`, `firstResidentDelayP50/P95/Max`, `uploadMs`, `uploadRuns/Failures`, `pending`, `compileFailOpen`, `compileRefusals`, `compileFallbacks`, `disposed`. Read from `SF.registry.get('render')._residencyManager.snapshot()`. |

Focused checks (real counts, this pass): `test/residency-manager.test.mjs` **31/31**;
`bloom-unready-draw-guard` **27/27**; `presented-draw-detach-pass` **11/11**;
`bloom-instancing-readiness` **5/5**; `entity-mesh-visibility` **16/16**;
`sf-258-admission-starvation` **5/5**; `authored-admission-recovery` **13/13**;
`stand-in-resident-submit` **2/2**; `frame-solid-residency-gate` **4/4** — **114/114 focused**
(97 pre-existing + 17 new regression tests). Supporting residency/renderer suites
(`startup-geometry-residency`, `renderer-owner-lifetime`, `authored-async-liveness`,
`frame-solid-glass-priority`, startup/opening residency) **198 passed, 1 skipped** across the two
runs. `node scripts/check-game-playable.mjs` was run: **18/18 route checks PASS** (BOOT, LAUNCH,
PILOT, HULL, WORLD, CONTROLS, SAVE, CONTINUE, reload lane, CLEAN, SHADER, ASSETS, authored hull).
`npm run test:fast` is **39/39**.

## Measured — one after-run, not a matched A/B

Instrument: `node scripts/probe-frame-solid.mjs` (headed, Intel iGPU). **One** after-run on commit
**`07e20d5f1826`** (the E6 commits `84bfa5`→`a7549b` plus a concurrent Q1 commit on top; the shared
checkout also held unrelated uncommitted sim/UI/snapshot-fence changes while it ran). Route:
adventure, seed 4242, `sector_helios_prime`, worker sim lane, **218 entities**, **1,725 manager
frames**, 76 time-to-appear episodes. There is no same-identity baseline in this run, so it is not a
matched before/after. **It predates the counter-definition and drain changes in this pass**, so its
`visibleUnreadyDraws 848` is the old raw per-draw count, not the deduped `presentedRefusedEntities`
the gate now reads.

| Counter | Value |
|---|---|
| in-frame shader links | **0** |
| `visibleUnready` (held again after presentation) | **3** |
| `refusedDraws` / `visibleUnreadyDraws` (old raw definition) | 912 / 848 |
| `heldDraws` / `preAdmittedHolds` | 28 / 23 |
| `heldRoots` / `releasedRoots` | 26 / 26 |
| `failOpenReleases` / `admittedFailOpen` | 22 / 12 |
| `pending` at stop (after the 2 s deadline settle) | **0** |
| `compileRefusals` / `compileFailOpen` / `compileFallbacks` | 39 / 0 / 0 |
| `leftUndrawn` | **5** |
| `blinks` / `stuckMissing` / `regressions` | 3 / 29 / 2 |
| frames over 50 ms | 571 of 1,080 sampled frames (contended host) |
| probe verdict | **FAIL** |

**Every failing clause in that run, named:** `blinks 3`, `regressions 2`, `stuckMissing 29`,
`leftUndrawn 5`, `visibleUnready 3`, `visibleUnreadyDraws 848` (raw), and — under the gate added in
this pass — `admittedFailOpen 12` / `residencyFailOpen 22`. The link, end-of-route `pending`, and
in-flight clauses passed/are unmeasured on that report (the old snapshot had no `inFlight` field);
they are gate clauses now. The run also reported 150 missing frames with `asset:loading` /
`pipelinesPending` reasons. This is **not** a pass and the after-run was not repeated after the
counter fix.

## Open / not done in this session

1. **The after-run is not re-measured after the counter/drain changes.** Its 848 is a raw per-frame
   count from the old counter; the deduped `presentedRefusedEntities` unit is new and unmeasured on
   a real route. A clean-tree after-run is required to know whether the deduped blink class is 0.
2. **Presentation refusals are still a real class.** The submit sites count a visible root hidden
   by `pipelinesPending` / `authoredPending` / `geometryPending` latches as `submit-pending`
   refusals. Those are now named per reason, but the unified `admit()` verdict (geometry + program
   in one manager) and the single writer of `mesh.visible` are **not** implemented. Compile state
   still lives in bloom, and the submit pass can still hide a presented body for a pipeline latch.
   This is the remaining structural E6 work, not a counter issue.
3. **Texture-version proof is still missing (deliberately deferred).** The geometry proof is
   per-geometry and generation-checked; a texture version swap remains covered only by the
   existing detach/rehydrate slot pass. No texture-version registry was added.
4. **Inline upload / fail-open / instanced-version paths remain.** A protected or small drawable
   uploads inside the presented frame by design; a bounded fail-open draw does too; an
   already-presented instanced pool that rewrites its matrices uploads the changed buffer as a
   content update. The gate now counts these (`admittedProtectedInline`, `admittedFailOpen`,
   `instanceVersionUploads`), but the headline "every drawable's data is resident before it draws"
   is true only for the held/queued class, not for the whole picture.
5. **Capacity proof is per pool.** A dormant pool that is given a genuinely new instance buffer is
   held until the driver proves it; a new `InstancedMesh` created *inside* a presented frame still
   pays its first bind unless its owner pre-admits it. The renderer's contact-shadow/aux pool growth
   paths pre-admit; other producers may not.
6. **`firstResidentDelayP50/P95` includes fail-open releases**, so on the after-run its p95
   (2,109.8 ms) measures the deadline, not upload latency. `uploadMsMax` (7,525.7 ms) is the driver
   tail. A separate `firstProofLatency` metric is not implemented.
7. **Main-thread task > 50 ms and allocation ≤ 100 KB/frame: not met/measured as an acceptance
   bar.** The after-run recorded 571 of 1,080 sampled frames over 50 ms on a contended host shared
   with other agents; that is a real FAIL for the bar, not a quiet-host number, and is retained as
   not met.
8. **Crucible, sector jump and long soak are not measured in this pass.** The E6 after-run covers
   the adventure route only; no claim is made for those routes. The 250 ms lane fields now make a
   mid-route backlog visible on whichever route is run.
9. **Build-time shader variant enumeration** is not implemented; the measured outcome it was meant
   to produce (no variant links inside a drawn frame) was met on this run (0), so a separate
   enumeration manifest is not justified yet.
