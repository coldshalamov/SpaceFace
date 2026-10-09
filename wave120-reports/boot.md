# Wave-120 audit — boot-loading lane (frozen/stalled loading screens)

Branch: devin/1791494351-perf-w119 @ c3895c513 (HEAD incl. W119 + W120-lod commits).
Scope: _restoreAsync/_restoreChunks/Continue path, armed-slot staleness, setFromObject
tails, atomic spans in boot/admission/publish. Read-only audit; no code written.

saturated: false

## Findings (ranked)

### 1. `_finishNativeRestore` — last whole-census atomic brick in the epilogue — H
- Evidence: src/core/physics.js:392-425 invoked at src/save/saveSystem.js:5299 directly
  after the W119 'physics-restored' yield.
- Mechanism: one generator step runs resetActivityRuntimeForRestore +
  reconcileMachineryBeforePhysics + reconcileLatchBeforePhysics +
  ensureActivityClassified + entity collect, then either adoptWorldSnapshot (single WASM
  invoke — atomic) or rebuildWorldFromEntities (per-body collider mint loop — sliceable).
  On a mature save this is the largest remaining unbounded span between 'loaded' and veil
  lift — W119 moved the yield boundary before it but the call itself is one brick.
- Fix sketch: `_finishNativeRestoreSteps` generator — each JS leg as a named yield, the
  fallback rebuild loop batched per ~16 bodies; driven by the restore's own yield driver.
  No sim ticks run under _restoring + scale:0, so interleaved yields preserve determinism
  and order. The WASM adopt stays a single step (un-sliceable invoke — pre-staging it is a
  separate question).
- Effort M | Impact H | Risk M (rebuild path must keep collider mint order identical).

### 2. `sector:exit` emit inside `enterSectorChunked` — ~49 listeners atomic in one step — M-H
- Evidence: src/systems/world.js:987 (generator head); ~49 `on('sector:exit'` sites;
  `sector:enter` is in the sliced-budget set (presentationRunner.js:204), `sector:exit`
  is sliced nowhere.
- Mechanism: on a mid-flight restore (pause→Load, gameOver Load-latest, or the B3 deferred
  lane draining after flight started) the departing sector's entire exit tail — teardowns,
  unbinds, ledger flushes — lands inside ONE enterSectorChunked step.
- Why it's legal HERE despite the F4/F5/F9 deferral: that deferral blocked emit slicing
  across LIVE sim ticks (determinism when sim writes land). During restore the sim is
  frozen and exit listeners observe departure only — none reads arrival state — so slicing
  inside the restore session carries no listener-ordering hazard.
- Fix sketch: `setEmitSliceBudget('sector:exit', n)` armed in _openRestoreSession, drains
  at the existing generator yields, cleared in _closeRestoreSession.
- Effort S-M | Impact M-H | Risk M.

### 3. The 8× afterContinue run is still one atomic step — M
- Evidence: src/save/saveSystem.js:5052-5059 (lastShift/redKite/ilexArk/kilnback/
  mothlight/palletJack/towlineTable/borrowedVoice).
- Mechanism: W119 sliced around the run — yields at :5051 and :5060 — but the eight serial
  rebinds run contiguously; each walks its own restored ledger.
- Fix sketch: same per-call slice point as the deserialize run (yield between each; the
  systems are independent).
- Effort S | Impact M | Risk L.

### 4. `settings:changed` audio+video emit pair — ~30 listeners atomic in the tail — M
- Evidence: src/save/saveSystem.js:5329-5330 (post-'save-finalized'). The video emit's
  key==null branch pulls _syncPostOptions + onResize + shadow sync + adaptive + FOV
  synchronously (src/render/renderer.js:18604-18638); audio's handler may mint
  AudioContext (src/audio/audioSystem.js:2788).
- Mechanism: the last contiguous listener run before the veil lifts. Bounded but chunky —
  one reconcile class the epilogue still pays in a single task.
- Fix sketch: yield between the two emits — no listener classification needed (they are
  already separate emits; slicing INSIDE an emit is what needs classification).
- Effort S | Impact M | Risk L.

### 5. `restoreCombatState` rebuilds the combat ledger atomically — M
- Evidence: src/combat/persistence.js:49-80 via saveSystem.js:5050 — restoreCombatants +
  restoreAttachments + restoreActions + normalizedAttachmentNextId map scan in one step.
- Mechanism: O(saved combat rows) on a heavy-combat save.
- Fix sketch: restoreCombatStateSteps — the combatants→attachments→actions section seams
  already exist.
- Effort M | Impact M | Risk L-M.

### 6. `__setActiveVisualRoot` armed slot lacks the B6 epoch self-clear — L-M
- Evidence: src/render/partsLibrary.js:3140/3826/3996 armed; consulted at :3212/:3688.
- Mechanism: stale JOB invocations are gated at the job layer (admissionEpoch,
  staleRunVerdict) — but unlike the publisher/disposer the closure has no own-epoch check;
  any future caller reaching the slot under a newer admission swaps the live root pointer.
- Fix sketch: mirror installPreparedBoundaryPublisher's installedEpoch self-clear.
- Effort S | Impact L-M | Risk L.

### 7. Autosave warm-slice chain can re-fire inside a SECOND restore — L
- Evidence: src/save/saveSystem.js:2618-2646 — guard is `state.mode !== 'loading'` +
  _autosaveJobCurrent; a chain armed by restore A can run inside restore B's 'loading'
  window reading B's state (correct data, redundant bounded work).
- Fix sketch: stamp _restoreSequence on the runSlice chain.
- Effort S | Impact L | Risk L.

### 8. finalizeLoadedGame rejection path emits save:error without token gate — L
- Evidence: src/save/saveSystem.js:5315-5322 — `.then` rejection branch emits save:error
  unconditionally; a stale finalizer rejection during a NEWER restore surfaces a wrong
  toast.
- Fix sketch: gate the emit on transitionToken validity like the rest of the lane.
- Effort S | Impact L | Risk L.

## setFromObject tails (item c) — resolved, no action
drawn-cull path re-runs on key-move miss or 600-call cadence expiry — per-pass cap 4 +
jittered defers + force-FIFO drained under ~1ms with paced debit + 1.15 stale-serve bias
(src/render/visualCullRadius.js:65-359). Remaining walks are bounded:
primeDrawnCullStamps pays one Box3 walk inside the paced commit tail (:372);
_measureMotionPad first-consult capped per pass + force-queue (:65-78);
_clearanceBoxScratch behind the position-drift memo (renderer.js:4802, W108).
The commit-tail path does NOT re-run per frame — only on key-move miss/cadence expiry.

## W119 regression verification — all pass
- lod F1 (drift-gate re-key): renderer.js:29264-29373 — cleanRootCensusDrift requires
  stampedCollectEpoch !== censusEpochNow AND censusFreshNow; stamp re-keyed at :29373 on
  any completed unscoped collect — a census flip no longer re-pays subtree collects.
- lod F2 (pendingIter fail-closed): renderer.js:11967-11986 — collected===null under the
  unsigned mint window takes whole-subtree withhold allowCast:false; syncOpts=opts never
  reached for unprovable roots.
- popin F1 (under-ceiling governor skip): assetResidency.js:1397-1456 — synthetic plan
  under the named ceiling (no spread/sort/index build); entries census doubles as the
  blocked-breakdown after-table when plan.evict is empty; single activePendingKeys Set.
- popin F2 (softBudgetPending tails): assetResidency.js:428-429/464-465/889-890/911-912 —
  both sync + Steps tails drain inline.
- popin F3 (postDispatch re-mint): renderer.js:3204-3223 — primary-leg fault re-mints a
  standalone postDispatch iterator once (_sectorExitCleanupPendingPost); a post-dispatch
  fault drops for real with the decay sweep as backstop.
- boot B1+B2 (sliced restore): 'physics-restored' at :5298 precedes completeRestore :5299;
  'save-finalized' at :5325 precedes the settings emits :5329; entity-refs :5044,
  combat-ledger :5051, after-continue :5060, impulse-charges :5074 interleaved.
- boot B3 (deferred restore lane): saveSystem.js:4673-4689 — deferRunTransition callback
  routes to _restoreAsync (async pacing) with save:error handling, not the sync _restore.
- boot B6 (publisher self-clear): partsLibrary.js:9365-9391 — mirrors the disposer's
  named-installed closure + guarded delete on admissionEpoch mismatch.
- hitches F1 (post-present resume): saveSystem.js:202-218 postRestoreTaskAtBackgroundPriorityBounded
  (scheduler.postTask 'background' / setTimeout(0) + 48ms bound), consumed at :4746.
- hitches F2 (WeakMap fault rows): eventBus.js:45-66 — WeakMap-keyed rows + busErrorRowsByKey
  cap + oldest-evict.
- hitches F4 (policiesMs): partsLibrary.js:8843-8847 — real legMs sums, yields excluded.
