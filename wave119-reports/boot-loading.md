# Wave 119 — boot-loading lane audit

Audited master @ 89c25c17e ("Give Veil Step a brimstone poof."). Read-only; no code, no PRs, no runs.
Upstream commits 5b62cade5 / 8ac1efd2f (listener-fault + driver-bank rewrites) verified against
master's current shape — both landed cleanly, see regression notes.

## saturated: false

The lane is not exhausted: the restore epilogue still carries the single largest un-sliced span
in the boot path (physics world rebuild), plus one mid-generator contiguous run the W118 slicing
pattern didn't reach. Everything else in the lane is verified working or reduced to hygiene items.

## Ranked findings

### B1 — Restore epilogue runs the physics world rebuild + resume chain in one unyielded span (H)

**Evidence:** `src/save/saveSystem.js:5256-5291` — after the budgeted `save:loaded` drain loop,
`_restoreChunks` runs, inside a single generator step: `_resumeCeresEntityReferences()` →
`restoreStunts()` → `_resumeCeresAttachmentRestore()` → `this._physics.completeRestore(...)` →
`primeAutosaveCapture()` head → `finalizeLoadedGame` prefix → two `settings:changed` emits.
No `yield` between any of them. `completeRestore` → `physics.js:377-421` `_finishNativeRestore`
which synchronously calls `resetActivityRuntimeForRestore`, `reconcileMachineryBeforePhysics`,
`reconcileLatchBeforePhysics`, `ensureActivityClassified`, then `adoptWorldSnapshot` /
`rebuildWorldFromEntities` across the whole physics census — a WASM Rapier world rebuild in one
call, on the Continue path, immediately before `finalizeLoadedGame`'s gated wait chain.

**Mechanism:** the W118 slicing covered the deserialize bodies and the emit drain but stopped at
the epilogue. On a dense saved sector this is the last big brick between "loaded" and veil lift —
exactly the frame that decides whether Continue hitches visibly or not.

**Fix sketch:** two cheap yields (`yield 'physics-restored'` before `completeRestore`, one before
the settings emits) split the epilogue across slice windows — veil up, sim paused, unobservable.
The bigger fix is a `completeRestoreSteps` chunked twin for `rebuildWorldFromEntities`
(batch-adopt per N entities; keep `adoptWorldSnapshot` atomic if the native contract requires it —
in that case chunk only the reconcile/classify prelude).

**Effort:** M (S for the yield-only split). **Impact:** H on mature saves. **Risk:** M — partial
world visibility is nil under loading, but native world adoption may have an atomicity contract;
worst case only the prelude chunkifies.

### B2 — Unsliced combat/`afterContinue` run between 'persistent-spawned' and 'combat-restored' (M)

**Evidence:** `src/save/saveSystem.js:5010-5040` — contiguous calls in one generator step:
`_restoreEntityIdAllocator`, `_restoreCeresEntityReferences`, `_clearStaleTargets`,
`_restoreCombat`, eight `afterContinue()` calls, then `_callDeserialize('bombs')`,
`_callDeserialize('impulseCharges')`, `_callDeserialize('masslineSnares')`.

**Mechanism:** `restoreCombatState` rebuilds the whole combat ledger; `afterContinue` runs on
systems that walk entity lists; the three deserializes restage deployable networks row by row.
Individually cheap, collectively a slice window or more on a war-heavy save — same class of
contiguous run the W118 tail-slicing fixed, left inside the gap between two yield labels.

**Fix sketch:** interleave `yield` lines between the calls exactly like the 'x-restored' pattern.
Checked for source-regex test pins: `test/` greps show tests *call* `_restoreCombat` /
`afterContinue` / `_resumeCeresEntityReferences` directly — no literal call-site text pins — so
interleaving is safe.

**Effort:** S. **Impact:** M. **Risk:** L.

### B3 — `_restoreAsync`'s busy branch re-enters the SYNC `_restore` lane (M)

**Evidence:** `src/save/saveSystem.js:4614-4630` — when a restore is requested while another is in
flight, the deferred continuation calls `this._restore(data, slot, options)`, and `_restore`
(4633+) drains the entire `_restoreChunks` generator synchronously — every sliced call, zero
frame yields.

**Mechanism:** a deferred restore that drains during a live transition (rather than under the
loading veil) pays the whole restore — clear entities, all deserializes, spawns, epilogue — in
one frame of live flight. The slicing in F6 only protects the async lane.

**Fix sketch:** route the deferred continuation through `_restoreAsync`'s generator driver
instead of `_restore`, or verify `deferRunTransition` can only fire under a veil and mark
DOCUMENTED.

**Effort:** S-M. **Impact:** M if reachable mid-transition, else nil. **Risk:** L-M.

### B4 — `_spawnPersistentEntities` batch is count-bounded, not time-bounded (L-M)

**Evidence:** `src/save/saveSystem.js:165` `RESTORE_PERSISTENT_SPAWN_BATCH = 16`; the spawn loop
in `_restoreChunks` yields every 16 spawns.

**Mechanism:** each persistent spawn fans out `entity:spawned` listeners + residency admission +
sim registration; 16 of them on a mature save can exceed the 16 ms slice before the yield point
is reached — the yield counts entities, not milliseconds like the surrounding code.

**Fix sketch:** add the same `RESTORE_YIELD_SLICE_MS` wall-clock check inside the batch loop
(yield early when the window elapses, keep the count cap as an upper bound).

**Effort:** S. **Impact:** L-M. **Risk:** L.

### B5 — Residual cold `setFromObject` in commit tails for non-enveloped authored roots (L-M)

**Evidence:** `src/render/visualCullRadius.js:372-390` — `primeDrawnCullStamps` early-outs when
`root.userData.visualBounds` is stamped, else pays an unbudgeted `Box3.setFromObject` inline.
Called at every commit tail: partsLibrary.js:3487 (cargo), 4517/4556 (place), 9556/9997 (ship),
and visualFactory.js:5973 (`stampBuiltVisual` — character-family authored roots).

**Mechanism:** composed paths mint measured envelopes (`expandComposedPlaceBoundsSteps`,
partsLibrary.js:11075-11078), but authored roots that reach commit through non-composed families —
character-family builds, station roots, HLOD-adjacent roots — arrive without `visualBounds` and
still pay the walk, inside the paced commit ledger. Bounded by the ledger but an O(subtree) brick
in one call; the consult path itself never pays it.

**Fix sketch:** extend the measured-envelope mint to the remaining authored families (reuse the
same bounds machinery at build time), or document that the commit-tail walk is the intentional
last-resort measure.

**Effort:** M. **Impact:** L-M (paced tail, not presented frame). **Risk:** L.

### B6 — Publisher/disposer epoch-refusal asymmetry (L, hygiene)

**Evidence:** `src/render/partsLibrary.js:9281-9315` vs `9362-9378` — on `admissionEpoch` mismatch
the disposer wrapper self-clears its slot; the publisher wrapper returns `false` but leaves
`boundary.userData.__publishPreparedAuthoredBoundary` armed with the stale closure.

**Mechanism:** after a bail+readmission the stale publisher slot keeps refusing every consult
(until `markAuthoredBoundaryForReadmission` deletes it or a new install overwrites it), and it
retains the whole commit closure chain. Benign today — callers treat `false` as not-published and
state checks dominate — but it's a retained stale arm the disposer contract deliberately avoids.

**Fix sketch:** hoist the publisher wrapper to a named `installed` and mirror the disposer's
self-clear (`if (boundary.userData.__publishPreparedAuthoredBoundary === installed) delete …`).

**Effort:** S. **Impact:** L. **Risk:** L.

## Lane-item coverage

- **(a) armed-closure staleness:** enumerated slots — `__disposePreparedAuthoredBoundary` (epoch +
  self-clear + owned-call grammar), `__publishPreparedAuthoredBoundary` (epoch, see B6),
  `admissionStandInRelease`/`admissionStandInResolver` (die with their substrate; consulted via
  substrate first at visualOverrides.js:670), `activateAuthoredMotionRegistration` (retired-guarded
  detach, verified under the H4 reshape), `wholeShipLodTransitionPromise` (identity compare before
  clear at partsLibrary.js:9799/9805 — stale chain can't clobber), `trigger.onBeforeRender`
  (self-disarms, consults live state), `__setActiveVisualRoot`/`update*`/`validate*`/`rebind*`
  dispatchers (dispatch via live `activeRoot`, no stale fire). Only B6 residual.
- **(b) visualBounds coverage:** minted on composed roots (11075-11078), copied to boundary on
  ship/place/cargo commits, `stampBuiltVisual` primes character-family roots; consult path serves
  the stamped envelope (or stale×1.15 while a paced force-remeasure queues, 1 ms deadline, cap
  4/pass — never blocks). Residual = B5.
- **(c) restore-slice yield coverage:** `meta`→`simClock`→`clearMissionRuntime`→`_clearEntitiesChunked`
  →~20 literal `deserialize`/`yield` pairs→`spawnPlayer`→`enterSectorChunked`→residency drain→
  batched persistent spawn→combat→missions→emit drain→autosave prime→finalize are sliced.
  Residuals = B1 (epilogue), B2 (combat block), B4 (batch granularity); B3 bypasses slicing
  entirely on the deferred lane.
- **(d) atomic spans ranked:** B1's `_finishNativeRestore` is the largest remaining atomic span in
  the boot path; B2 second; everything else in admission/publish/commit is either generator-driven
  or atomic-by-design with a single paced-ledger debit (cargo commit, partsLibrary.js:3443-3503 —
  verified, no internal yields so no restamp needed).

## Regression notes — W118 machinery verified on master @ 89c25c17e

- **lod L1:** `STAGE_COLLECT_EPOCH_KEY` (renderer.js:7737) stamped on collect at 11989/17958/18062/
  29700; `cleanRootCensusDrift` (29243) opens `collectGate` (29259-29261) only for clean band-1
  roots; the queued catch-all holds `allowCast:false` until re-staged (29404 `skipTraverseOnDrift`
  respects it). Verified.
- **lod L2:** `serveLive` requires `!censusMemo.pendingIter` (11945-11946) — pending census can't
  serve over-cover; post-opening deferred collect re-queues tail via the epoch stamps. Verified.
- **lod L3:** `parkedServeFresh` gates null-sig re-keys (29106-29114): during `pendingIter` a
  parked-release drift consults no live signature; drift compares run at 29139. Verified.
- **popin F1:** `retain()` defers census via `softBudgetPending` when `assets.size >=
  SOFT_BUDGET_INLINE_MAX` (assetResidency.js:303-304, const at 632) — K retains per commit, no
  K×O inline. Verified.
- **popin F2:** `boundary-removed` listener and `releaseOwner` defer the same way (398-399,
  494-495); paced sweep drains clear the flag and enforce once (425, 460-461). Verified.
- **popin F3:** `sector:exit` → `prepareSectorExit` pins synchronously (renderer.js:18685) then
  `driveCacheCleanup` Steps composition (19295-19308, primary+postDispatch legs on
  `_sectorExitCleanupIter`); `enforceBudget` consults `budgetTotals()` (1370/1397); paced drain
  at 3141-3209. Verified.
- **boot F1:** owned-disposer grammar — `installPreparedBoundaryDisposer` (9281-9315) captures
  `installedEpoch`, refuses+self-clears on mismatch; `disposeOwnedPreparedBoundary` (9340) calls
  only when the slot identity matches; `commitAuthoredBoundary` bails route through it. Same
  grammar in place/cargo paths. Verified.
- **boot F4:** publisher twin epoch-guarded (9362-9378) + `published` latch; see B6 for the one
  asymmetry. Verified.
- **boot F5:** measured envelopes minted in composed steps, copied to boundary at ship commit
  9960-9964 and cargo commit ~3465-3471; `primeDrawnCullStamps` early-outs on the stamp
  (visualCullRadius.js:377). Verified.
- **boot F6:** `_restoreChunks` literal `this._callDeserialize('x', data.x)` call sites each
  followed by `yield 'x-restored'` (4829+); `_restoreAsync` yields a real frame only ≥16 ms since
  last real yield (`RESTORE_YIELD_SLICE_MS` at 6343); `save:loaded` via `setEmitSliceBudget(...,8)`
  + `drainEmitSlice(4, 16)` with a 64-iteration guard. Literal call-site pins intact. Verified.
- **hitches H1:** `composeYield` resolves via `postTaskAtBackgroundPriorityBounded`
  (compilePresentSlice.js:359 — background-priority arm + 48 ms bounded timeout, fires once);
  rAF arm dispatches through the same bound. Verified.
- **hitches H2:** `commitLegStarted = monotonicNow()` restamps after every `composeYield` in ship
  commit (9932, 10024-10045) and place commit (4454-4577). Cargo commit is atomic-by-design —
  single ledger debit, no restamps needed. Verified.
- **hitches H3 (superseded, upstream 5b62cade5):** `invokeBusListener` (eventBus.js:55) always
  delivers; `try/catch` only notes via `noteBusHandlerError` (per-listener dedup, verbatim-first +
  1 s-spaced warns). Contract test "burst of bad payloads never suppresses the next valid event"
  exists at test/event-bus-contract.test.mjs:46. Verified.
- **hitches H4 (reshaped, upstream 8ac1efd2f):** `attachAuthoredMotionDriverSteps` — `detach`
  assigned before the first post-activate yield; `retired` guard makes it idempotent; rollback
  disposes named drivers, restores `updateDriveState`, unregisters registry/aliases, deletes root
  hooks. `finally` runs raw bank dispose only when `!bankTransferred && typeof detach !==
  'function'` — pre-activate abandons covered, no double-dispose. Verified.
- **hitches H5:** `dedupWarn` static keys on all publish/swap/cleanup warn sites (e.g.
  `partsLibrary:cargo-publish-touch`, `cargo-swap-observer`); `warnOnce` absent from partsLibrary.
  Verified.
- **hitches H6:** `_sectorExitCleanupIter` catch stamps `noteLaneFault(state,'sectorExitCleanup')`
  + `laneWarn` before clearing (renderer.js:3202-3205). Verified.
