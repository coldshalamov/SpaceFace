# Wave 101 — in-flight-hitches audit

Audited `devin/1791064509-perf-w60` @ `73b275a07` (post-W100 docs commit on PR #220). Read-only audit; no code changed, no app run.

`saturated: false` — two concrete quality-degrading residuals and one presented-frame amortization remain with clear implementation paths.

## Findings (ranked)

### F1 — Grouped `touchMany` restores the reveal before the async render; hidden subjects silently skip their touch

**Evidence:**
- `src/render/renderer.js:10721-10729` — `touchExactTargetSubjects` is `async`; its first statement after the arg check is `for (const subject of list) await stampSubjectEnvAsync(subject)`. The first `await` suspends unconditionally (microtask boundary even on a resolved promise), and `stampSubjectEnvAsync` paces further via `admissionPaceYield` (10730).
- `src/render/renderer.js:14957-14970` (cook/rock pools), `13327-13340` (pool seal), and `15944-15962` → `15982-15987` / `16143-16148` (late + rescan, via `whileRevealedGroup`) — all four armed `touchMany` sites reveal subjects with `revealSubjectForCompile`, call the async touch, and run `restores[i]()` in `finally` — which executes the moment the async call suspends, before `bloom.touchScenePipelines` is ever reached.
- `src/render/openingGpuAdmission.js:585-592` — `touchSubjectOnExactTarget` builds `drawableSubjects` by filtering `node.visible !== false`; a subject re-hidden by the early restore produces `drawableSubjects = []` → returns `{skipped: true, reason: 'null-geometry'}` (misleading reason) without rendering.
- `src/render/openingGpuAdmission.js:874` — `touched = touchMany(group)` is never awaited; the returned promise resolves to a skipped result nobody reads.
- `src/render/compilePresentSlice.js:117-119, 134-201` — `revealSubjectForCompile` exists precisely so `visible=false` / count-0 subjects still get their program link + buffer upload; the docblock names the depth-pass contract.

**Mechanism:** the W100 grouped-touch machinery is live (armed under `state.mode === 'loading'`, `touchBatchSize: 24`) but structurally dead for exactly the subjects that needed the reveal: any subject `visible===false` at call time has its reveal reverted before the detached async continuation reaches `touchScenePipelines` → `drawableSubjects` empties → no hide/render happens for it → its already-issued programs and geometry buffers still link/upload inside a later presented pass — the brick class the machinery exists to absorb. Frequency is bounded (loading-shell subjects are mostly `visible=true`, where the restore harmlessly writes back `true`), but authored-hidden children (parked LOD proxies, `updateLod`-hidden nodes, pending-latch subjects on post-opening legs) are the cohort the reveal was authored to serve — they now no-op silently. Secondary defect in the same function: `renderer.js:10725-10726` calls `bloom.touchScenePipelines(list, cam.obj, scene)` without forwarding `drawableSession` — only the non-bloom fallback at 10728 passes `{ drawableSession }` — so on the production bloom route the pooled `drawableHideSession` minted by every call site is ignored and each ≤24-subject group re-enumerates `scene.traverse` anyway (`openingGpuAdmission.js:486-491`).

**Fix sketch:** keep the reveal alive until the async touch settles — move the `try/finally` inside `touchExactTargetSubjects` (pass a `reveal` callback in), or make the call sites `await` a sync-ordered variant: `await stampAllEnvs(list)` first, then `run()` inside the still-held reveals. Also thread `drawableSession` through `bloom.touchScenePipelines(subject, camera, lightingScene, options)` → `touchSubjectOnExactTarget(..., { drawableSession })`. Effort **S**. Magic-frame impact **H** (restores the deferred-link/upload absorption the wave was built for; the failure mode is exactly presented-frame program links). Risk **low** — the reveal/restore discipline is unchanged; only its lifetime extends to cover the await chain.

### F2 — `packPresentationWorldToFenceSteps` still drops a row when a mid-park allocation is swap-moved into the minted prefix

**Evidence:**
- `src/render/snapshotFence.js:460` — `mintedSlots = world.activeSlots.slice(0, active)` freezes the prefix at mint.
- `src/render/snapshotFence.js:469-470` — `appendedSlots = world.activeSlots.slice(active, getDiagnostics().active)` covers allocations past the bound at commit time.
- `src/render/presentationWorld.js:315-325` — `removeActive` swap-moves `activeSlots[activeCount-1]` into `activeSlots[position]`; `presentationWorld.js:308-313` — `addActive` appends at `activeCount++` (into the appended region); `722-745` — `retireSlot` → `removeActive`.
- `src/render/renderer.js:24351-24379` — the parked pack drives **in flight** every `snapshotNeedsPack` frame, suspended across whole frame intervals under the 4ms bound.
- Drop path: `renderer.js:23177, 23192-23198` — `posed=false` (snapshotIndexOf −1) → `applyEntityMeshVisibility(mesh, false)` hides the mesh for the frame.

**Mechanism:** the brief's expectation — "freeze at bound + appended sweep covers mid-park allocations" — holds only when appended rows stay appended. Sequence: pack mints at bound `N` → `addActive` lands row R at index `N` → `retireSlot` of a *prefix* row `p < N` swap-moves `activeSlots[N-1]`-region tail into `p` — if the tail element is R (or any row allocated mid-park), R now sits at `p < N`. `mintedSlots` doesn't contain R (frozen before its allocation); the appended sweep `slice(N, activeCount)` doesn't reach `p`. R is packed by neither sweep → absent from the committed snapshot → `posed=false` → `snapshotMissing` hide → **1-frame pop-out of a live entity**, self-healing next pack (`packDirty` never cleared). Requires retire+alloc inside one parked window — kill/spawn storms in combat sectors, exactly where packs park routinely.

**Fix sketch:** after the appended sweep, run a dirty-tail scan: `for i in 0..activeNow: if (world.packDirty[world.activeSlots[i]]) packRow(world.activeSlots[i])` — O(active) once per commit, repacking only rows the identity sweeps missed (packDirty stays set on them; alive-slots check already in `packRow` skips retired rows). Alternative: stamp a `membershipSeq` on `addActive`/`removeActive` and supersede the parked pack on mismatch (safer but discards a partial walk). Effort **S**. Magic-frame impact **M** (a rare real pop-out — the precise class). Risk **low**.

### F3 — `unreadyProgramsPending` re-traverses the whole visible scene every presented frame during admission windows

**Evidence:** `src/render/bloom.js:1248-1283` — while any program reports `isReady()===false`, `hideUnreadySceneDrawables` (invoked by every guarded presented pass — bloom `renderScenePass` at 1991, graph/native routes via `renderer.js:27261-27286`) runs `scanPresentedDrawables(scene)` = `scene.traverseVisible` every frame (1281-1282), with no cadence. The sibling pending-only window already ships the amortized contract this path lacks: `pendingSubjects`-scoped + mount-drain scans with a 30-frame full-sweep failsafe (1283-1308, `UNREADY_PENDING_SWEEP_FRAMES` at 1147). Per-draw correctness does not depend on the traverse: `renderBufferDirect` guard (bloom.js:1061-1106) skips unready draws and queues admission.

**Mechanism:** during a decode/compile burst (the busiest frames — live spawns, pool growth), `unreadyProgramsPending` latches and each presented pass pays O(visible-scene-nodes) — ~5-20k nodes in dense sectors, ~0.5-2ms — on top of the admission work that made the frame heavy. The drawable set only changes on mounts/material rebinds; the instrumented mount watch (`ensureSceneMountWatch`/`recordMountedRootForUnreadyScan`, 1149-1163/1114-1116) and `pendingSubjects` drain already cover instrumented mutations; the traverse's residual value is only uninstrumented binds — the same residual the sibling path bounds at 30 frames.

**Fix sketch:** extend the pending-window scoping to the unready-programs path — when `unreadyProgramsPending` fires without `sceneSetChanged`/`drainRoots`, scan `pendingSubjects` + mounted roots per frame and keep the 30-frame `scanPresentedDrawables(scene)` sweep as the uninstrumented-bind failsafe (identical staleness bound already shipped). Effort **S–M**. Magic-frame impact **M** (removes the largest remaining per-frame amortizable walk, on the busiest windows). Risk **low-medium** — an uninstrumented bind (material swap on a live mounted mesh with no mount event) waits ≤30 frames for the sweep; the draw-time guard already prevents on-glass links for stamped materials, and unstamped never-compiled materials keep the same sweep-bound staleness as the shipped pending window.

### F4 — notedWalk: both add→remove visit orders over-count (conservative-on, sticky until next clean recount)

**Evidence:** `src/render/shadowReceiverTally.js:117-133` — `noteAdded` records `{delta, seq}` while pending; `noteRemoved` decrements `count` and records nothing. `53-66` — the stepped walk pops children pushed at parent-visit time and counts them **without re-checking attachment**. `192-198` — stamp formula.

**Mechanism (lane (a) enumeration):**
- Order 1 — add mid-walk, never visited, removed pre-stamp: note `{+δ}` stays unabsorbed (`visits.get(root) === undefined`) → `stamped += δ` for a gone root → over-count δ.
- Order 2 — added mid-walk, pushed to the walk's stack before removal, popped post-removal: counted in `receivers` (`walked`), and `visits.set` fires with `visitSeq > note.seq` → note absorbed — but the root is detached → `walked` over-counts δ. `noteRemoved`'s "absorbed by construction" comment (128-130) is only true for `scene.traverse` (live-child reachability); the explicit-stack twin reaches ghosts.
- A net-zero add+remove under a pending walk therefore lands `+δ`, never `−δ` — no under-count path exists, so every residue errs conservative-on: the map-stays-on boolean consumers are unaffected; `prepareActiveShadowCamera`'s receiver-count-scaled extent reads slightly high; the count stays inflated until the next dirty event mints a clean walk (seq-matched stamps clear `dirty`, so the over-count can persist arbitrarily long in quiet periods — bounded by the noted roots' receiver deltas, typically tens).

**Fix sketch (optional):** have the Steps walk stamp `visits` only for nodes still attached (`for (p=object; p; p=p.parent) if (p===scene) live`), or record `noteRemoved` as a negative-delta note absorbed the same way (`{delta:-δ, seq}` — the stamp's `Σ unabsorbed` then nets the dead root to zero in both orders). Effort **S**. Magic-frame impact **L** (no visual defect; removes a sticky conservative bias). Risk **low** — write-path and stamp math only.

### F5 — `whileRevealed` pays O(subject) reveal+restore for async `compileOne` whose compile never reads visibility

**Evidence:** `src/render/renderer.js:11848-11851` — `whileRevealed` runs `restoreSubject()` in `finally` as soon as the async `run()` suspends at its first `await` (`compileSubjectColorAndDepth` → `await stampSubjectEnvAsync`, 10705-10711). `src/render/compilePresentSlice.js:117-119` — "Color compile() still visits those objects" — `renderer.compile[Async]` is visibility-independent; the reveal exists for `shadowMap.render` (depth) and real draws only.

**Mechanism:** every async compile admit (11857, 13321, 14943, 15977, 16141) walks the subject twice (reveal + restore) and the reveal covers only the sync prefix — dead work, no defect. Fix sketch: drop the `whileRevealed` wrap on `compileOne` (env stamping is visibility-independent too), or keep a synchronous-depth-pass reveal only where `driveCompileShadowDepthPipelines` actually draws. Effort **S**. Impact **L** (small constant work per admit inside paced legs). Risk **low**.

## W100 machinery verification (concrete)

| Item | Verdict | Evidence |
|---|---|---|
| Stepped boot collectors | **Sound** | `startupGpuResidency.js:214-250, 276-303` — Steps twins reproduce `traverse` pre-order via reversed-children stack push; identical `drawableHasWork`/`seen`/tier-facade semantics; `prepareStartupGeometryResidency` drives under `options.yieldToMain || yieldToBrowser` with `typeof`-guarded sync fallback (523-537); serial-route `paceQueue` retained. Cook legs check `cookStale()` per beat (renderer.js:13180-13214, 15540-15599, 13313, 13344). |
| `drawableHideSession` | **Sound** | `openingGpuAdmission.js:455-497` — one-mint `scene.traverse` → `drawables`; `keep` unions subjects+ancestors+descendants across uses (`fresh` skips kept subjects); non-session path re-traverses with same semantics; restore writes back recorded `entry.visible` — under-coverage is safe by contract (hidden drawables draw in the absorbed pass). |
| notedWalk recount | **Sound with caveat (F4)** | notes recorded only `if (pendingRecount && root)`; `resetNotedWalk` demotes `note.seq→0` and zeroes `loose` (89-98) → lane (b): loose does **not** accumulate across re-mints; supersede bounded by `RECOUNT_SUPERSEDE_CAP=4` + 8-resolve quiet window (36-42). Stamp formula `max(0, walked + Σ unabsorbed + loose)` verified at 192-198. Over-count edges in F4 are the only residual; boolean consumers unaffected. |
| Cull-freeze hidden matrices | **Sound** | `staticChildMatrices.js:155-196` — freeze stamps `sfCullFrozen` only on nodes it froze; restore rewrites stamped nodes, clears `sfMatrixFrozen` up `root.parent`, sets `root.matrixWorldNeedsUpdate`; never-stamped roots save nothing. Lane (c): dynamically mounted updaters stay live — vendored `Object3D.add` clears `sfMatrixFrozen` marks up ancestors (contract relied on at 23147-23163 unfreeze sites and `shouldFreezeStaticChild`'s `updateRuntimeState`/`updateDriveState`/lod-tag exemptions prevent re-freeze of live content). `updateMatrixWorldSteps` twin mirrors elision at 214-252. |
| Radii gating | **Sound** | `presentationWorld.js:516-561` writes `world.radii[slot]` only `if (Number.isFinite(visualRadius))` with raise-max/`maxRadiusDirty` bookkeeping; `allocateRecord` (648-662) seeds radius with the same bookkeeping — no re-stomp; `exactVisible` reads the stamped `world.radii[slot]` (`presentationQueries.js:149, 192-193`). |
| Fence-pack minted+appended | **Partial — residual hole (F2)** | minted freeze + appended sweep verified at `snapshotFence.js:460, 469-470`; comment's invariant ("rows only move toward lower indices") misses the retire-of-prefix-while-appended-rows-exist case — swap-remove moves *into* the prefix, evading both sweeps. |
| Async compile/touch | **Sound + defect (F1)** | `touchExactTargetSubject` stays sync (10713-10719); `touchExactTargetSubjects` paces env stamps under `admissionPaceYield` + forwards `drawableSession` (10721-10730); every call site awaits (`finish(...)`, `Promise.all(issued)`, `admitOpeningUnitsAcrossSlices`) — no sync result consumption. But see F1: the armed `touchMany` restores the reveal before the async render reaches `touchScenePipelines` (all 4 sites), and the bloom branch drops `drawableSession` (10726 vs 10728). |

## Lane (d) — remaining presented-frame walks, ranked by worst-case node count

1. `scanPresentedDrawables(scene)` per frame while `unreadyProgramsPending` — O(visible-scene) — F3.
2. `scene.updateMatrixWorld()` (`renderer.js:27257`) — O(live-unfrozen scene) every presented frame — the irreducible floor; cull-freeze already prunes hidden hulls. `sfHiddenFrozen` minted at bind (20990-21021) + hidden-loop freezes (23060-23065, 23119-23123) cover culled roots; residual = live visible set only.
3. Program readiness poll `for program of info.programs: isReady()` — O(programs ~ hundreds)/frame while pending — cheap per call, bounded.
4. `applyInstanceChunkPolicies` + `consolidateOpaqueInstanceChunks` — O(pools×chunks)/frame with 32-recompute budget (`partsLibrary.js:14390-14405`).
5. `syncSceneStateFromFrame` — O(authored records + active owners) (`partsLibrary.js:14267-14311`).
6. `syncPoolBucket` — O(bucket records), dirty-gated (`asteroidInstancePool.js:486-615`).
7. `advanceVisibilityHysteresis` — O(held keys)/frame (`assetResidency.js:754-767`); `noteOwnerVisibility` O(owner assets) per visible slot (×2, 23302-23304).
8. `syncContactShadowPool` / `syncShipAuxPools` / `tickShieldShellClock` / `updateCameraOccluders` — O(frame records)/frame.
9. `endRenderEntityFrame` — ≤256 evictions/frame parked iterator (`renderEntityFrame.js:150-169`).
10. Per-visible-slot work in `syncEntityViews` — all O(1): memoized `entityVisualCullRadius`, `entityIsOnDeadlineGlass` band math, LOD retain latch (23240-23243), band/living-awake gated closures, `syncResolvingMarker` O(degree), `entityIsExplicitRenderFocus` memo.

Everything heavier — residency reconcile/reattach/cache-lease/arrival-roster/hold-exempt/protected drains, despawn/env-rebind queues, admission legs — rides stepped iterators under `≥1 step per frame + 4ms or pacedFrameSpend` bounds (`renderer.js:2200-2742` and call sites). Bloom's diagnostic traverses (`bloom.js:1816-1929`) fire only on already-bricked frames by design.

## Prior-wave adjudication notes

- Lane (a) edges enumerated above — both over-count, conservative-on (F4).
- Lane (b): `loose` resets per re-mint; cap+cooldown bound storms — safe.
- Lane (c): dynamically-mounted updaters stay live (add() clears ancestor `sfMatrixFrozen`; updater tags exempt re-freeze) — safe.
- Lane (d): ranking above; only F3's traverse is amortizable-without-semantic-change.
- Sim determinism untouched — all findings are render-side; nothing requires entity/sim mutation.
