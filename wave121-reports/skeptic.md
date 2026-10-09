# Wave 121 — skeptical audit (disprove-the-gains)

- lane: **skeptic** (regression review of the wave-119/120 machinery + the wave-121 batches already landed on the audit branch)
- audited: `devin/1791504143-perf-w120` @ `3fa568f847c1abf8eb21b2f267d401590592724d` (HEAD; includes W120 `ca626ba4a`/`241b5be05`/`20bb78011` + W121 `0917823d6`/`d37b0fab6`/`f73cf6268`). Merge-base vs `origin/master`: `e261ae275` (W119 machinery already merged via #247).
- evidence class: all source-level MECHANISM_VERIFIED. This box is SwiftShader — no GPU/frame-time claim is hardware-verified.
- **clean: false**

## Ranked findings

### F1 — H — the new `__setActiveVisualRoot` epoch guards refuse their own live commits (correctness / completeness regression)

`src/render/partsLibrary.js` 3138, 3830, 4009 (added W120 boot B6, `ca626ba4a`):

```
const installedEpoch = boundary.userData.admissionEpoch;
const setActiveRoot = (next) => {
  if (boundary.userData.admissionEpoch !== installedEpoch) { ...delete slot...; return; }
  activeRoot = next; boundary.userData.hull = next; boundary.userData.lod = ...;
};
```

`boundary.userData.admissionEpoch` is bumped inside `residencyOptionsForBoundary` (`partsLibrary.js:7182`) on **every** admission request — including the boundary's own upgrade requests (`requestAuthoredUpgrade` at 3169, `startAuthoredUpgrade` at 3880, place twin at ~4081). So the closure captures epoch N at builder time, and the upgrade request that arms its only real consumer bumps the boundary to N+1 before the commit runs. At `commitAuthoredCargoCapsuleBoundary` (3462) the job-side staleness check (`options.admissionEpoch !== boundary.userData.admissionEpoch`, 3392) passes — the job IS live — then `setActiveRoot(authored.root)` hits the new guard and refuses.

Consequences of every epoch-minting upgrade commit on these three boundary types:

- `activeRoot` stays `fallbackRoot` — the subtree `boundary.remove()` just detached. The next commit's "remove the live interior root" targets the detached fallback (no-op), so a second authored commit can stack a duplicate root on the same boundary.
- `boundary.userData.hull`/`lod` keep pointing at the detached fallback. `cameraDirector.js:401` (`visualRoot = root.userData.hull || root`) and `collisionDebug.js:84`/`renderer.js:5124,25577` read a removed subtree.
- `boundary.userData.updateLod` routes `activeRoot?.userData?.updateLod` to the detached fallback — the mounted authored root receives no LOD transitions after upgrade (LOD-frozen body: stuck at commit-time detail).
- The guard's `delete boundary.userData.__setActiveVisualRoot` disarms the slot for the rest of the boundary's life (re-installed only by a full re-admission rebuild).

The mirrored model, `installPreparedBoundaryPublisher`, captures `installedEpoch` at **install-in-commit time** (3509/4442/4558) — inside the same epoch that consults it. The swap guards capture at builder time, one residency-mint earlier. The job-side epoch check at 3392/4364 already rejects genuinely stale runs; the closure guard only fires on live commits. Minimal repro reasoning: any `requestAuthoredUpgrade` → `residencyOptionsForBoundary` bumps → commit `setActiveRoot` no-ops → `hull`/`lod`/`activeRoot` never move off the detached fallback. Unit tests do not cover this: with `renderer == null` no bump happens and the closure fires normally — green tests, broken path. Class: correctness defect; also completeness (stale `hull` contract + dead LOD steering + potential ghost double-mount).

### F2 — M — deferred governor enforce ordered behind the fallible leg; a post-leg fault strands it (deferred-then-dropped)

`src/render/renderer.js` ~19353 (clean path) and ~3214-3230 (fault re-mint path): the fused sector-exit cleanup chains `releaseUnreferencedCacheOwnersSteps(postDispatchReason)` *before* `enforceBudgetSteps('gpu')`. W121 F5 fixed the primary-leg fault (pendingPost still armed → re-mint), but a fault in the post leg itself — on either path — drops the whole iterator with `_sectorExitCleanupPendingPost` already false, so `enforceBudget` never runs. Pre-W120 the enforce was synchronous inside `applySectorExitResidency` and could not be stranded; now `deferBudgetEnforce: true` makes it dependent on the fused drive surviving twice. Impact: an over-ceiling residency state stays unenforced until the next seam or the 10s decay sweep's soft-budget drain — bounded growth, not a leak, but a guarantee quietly weakened. Order the enforce leg first, or wrap legs independently.

### F3 — L — deferred async restore closure drops the `.catch` shape the sibling lane uses (complexity debt)

`src/save/saveSystem.js` ~4526 (`_restorePreparedEnvelopeAsync`'s SFQ-B223 defer): `try { return this._restorePreparedEnvelopeAsync(prepared, slot, options); } catch ...` — the `try`/`catch` only covers the synchronous prefix; a late rejection returns through `pendingRunTransition()` in `_closeRestoreSession` as an unhandled-rejected promise (nobody awaits `drained`). Compare `_restoreAsync`'s defer (~4715) which chains `.catch(...)` → `save:error`. Latent only: `_restorePreparedEnvelopeAsync` self-handles today (`_handleLoadFailureAsync` never rethrows), but any future rejection — e.g. `_endLoadFailure` throwing — escapes silently where the sync twin would have emitted `save:error`. Add `.catch` to match the sibling lane.

### F4 — L — abandoned Steps twins leak the candidate RAPIER world (complexity debt)

`src/core/sg02DynamicBodyOwner.js` `rebuildWorldFromEntitiesSteps` (~768): the scratch `candidate` world is disposed only in `catch` — a generator `return()`/abandon mid-drive runs `finally` blocks only, so a parked drive that is closed (iterator.return on fault mid-`yield*`, or an orphaned chain) leaks a whole WASM world + its colliders. Today's drivers always run to completion or throw, so it is latent — but it is exactly the abandonment surface the audit asked about for Steps twins. A `try/finally { if (!committed) candidate.dispose(); }` closes it.

### F5 — L — the running-ledger/index layer is a fragile invariant with no drift detection (complexity debt)

The W121 popin machinery (`gpuResidentBytesTotal`, `cpuPackageBytesTotal`, `unaccountedResourceCount`, `softOwnerCount`/`rpcOwnerCount`, `sectorOwnerIndex`, `warmCoverage`, `activePendingKeys`) is exact *today* — I verified every mutation funnels through the maintained helpers (`assets.delete` only in `evictIfUnowned`; `entry.owners` write sites only in `retain`/`release`/`releaseOwner`; `pendingRequests.delete` only in `finishRequest`; `request.active` only in `deactivateRequest`). But this is precisely the class the previous iteration already failed once: W120's `pendingRequestsVersion` memo missed the deactivate bump and served stale key sets (the W121 F3 fix). Any future mutation path that forgets a `note*` hook silently corrupts governor/soft-budget decisions — there is no periodic recompute-and-compare assertion to catch drift. Cheap guard: a dev/probe assert that re-walks the maps and diffs the scalars.

### F6 — L — `laneWarn` heartbeat lacks the quiet-gap heal its siblings got (consistency nit)

`src/render/renderer.js` ~2213: `heartbeatMs` doubles to 30 s and resets on **epoch flip only**; `warnDedup`/`noteBusHandlerError` also re-arm on a >60 s quiet gap. A storm that pauses mid-epoch inherits the backed-off interval, so a fresh burst's first heartbeat can arrive ~30 s late while the equivalent bus/warnDedup rows report promptly. Harmless observability skew; align the heal predicate.

## Claims checked and verified clean

- **Byte ledgers** (`gpuResidentBytesTotal`/`cpuPackageBytesTotal`/`unaccountedResourceCount`): increment/decrement sites are symmetric with the old computed sums; `registerAsset` collision guards (same-gen return / cross-gen throw) hold; `finalizeResource` covers both context-lost and disposed paths; no `.clear()`/bulk teardown bypasses them.
- **`activePendingKeys` live set**: refcounted add/remove covers the dup-key case the version memo broke on; all `active` transitions funnel through `deactivateRequest`; `cancel()`/`finishRequest()` order deactivates before `evictIfUnowned` so a finishing request stops blocking its own eviction — same semantics as the old scan.
- **`sectorOwnerIndex` + soft/rpc counters**: `isSoftResidencyOwner`/`isPackageCacheOnlyEntry` equivalence verified line-by-line (`softLease===true || role ∈ {render-package-cache, decode-cache, runtime-cache}`; rpc-only for the strict tier); `nonPlayer` preserves the seams' raw `role !== 'player'` filter; re-retain of an existing owner early-returns before indexing (no double count); snapshot copies before `retain` inside the map walk are correct.
- **`enforceBudgetSteps` / `releaseUnreferencedCacheOwnersSteps` / `enforceSoftResidencyBudgetsSteps`**: yield cadences, per-candidate live re-checks (`assets.has` + `isGovernorEntryEvictable` + `visibilityHeld` re-verified after each yield), and the `packageCacheBudgetDepth` re-entrancy guard all match the sync twins. `softBudgetArmSuppressed` wraps only the synchronous `release()` call (try/finally), so foreign retain/release during a mid-drive park still arms the pending drain — no suppression leak.
- **Emit slicing**: `setEmitSliceBudget('sector:exit'/'mode:changed', 8)` is armed in `_openRestoreSession` and cleared unconditionally in `_closeRestoreSession` (the always-run epilogue, both success and error paths); parked tails deliver via the restore's own `drainEmitSlice` loop (~5349) and `presentationRunner`'s per-frame drain — no listener is dropped. Live-tick slicing stays disabled.
- **Steps twins fidelity**: `syncFromEntitiesSteps`, `rebuildWorldFromEntitiesSteps`, `completeRestoreSteps`/`_finishNativeRestoreSteps`, `restoreCombatStateSteps`, `aceMemory.deserializeChunked`/`normalizeMemorySteps`/`normalizeActiveReturnsSteps`, `recoveryEncounter.deserializeChunked` are line-faithful to the sync originals (early-outs included); state assignment still happens atomically at generator completion, so a mid-drive abort cannot publish a half-normalized record.
- **Import lane contract**: `loadEnvelopeFromString`/`importString` preserve the sync-`false` rejection shape and resolve `Promise<true>` on the async path; all callers handle the thenable (`saveLoad.js` awaits, `importFile` branches on `.then`); NXI-234 stale-accept semantics identical in both twins.
- **Post-present dispatch**: `postTaskAtBackgroundPriorityBounded` (both the render twin and the new `src/core/backgroundPost.js`) dedupes fire across postTask+timer and has a hard starvation bound; `armCallbackAfterPresent` has the hidden-tab `setTimeout` fallback — `_publishAssetResidencyDiagnosticsDeferred` cannot park forever, and it wraps the identical publish (payload parity).
- **Warn heartbeats**: warnDedup/laneWarn/busError backoff (1 s → 30 s cap, heal on quiet gap / epoch flip) matches the claimed shape and shrinks only diagnostic volume — delivery is never suppressed.
- **W120 scoreboard micro-bench** (`f3368f8d0`): enforce over-ceiling 14.6→4.6 ms and release-burst 4.5→1.2 ms are plausible given the ledger/census changes verified above; CPU-scope only, honestly labeled hardware-unverified for frame time.
- **Subtraction sweep**: no lowered quality constants, removed effects, shrunken budgets, or dropped draw coverage found in the diff; all deletions are replaced machinery or warn-call routing.

## Evidence-quality note (campaign process)

`ca626ba4a`'s commit message advertised work that does not exist in the tree (`buildBank`, `decryptArchive`, `cooperativeSlice`, `recordLedger`, …); the W121 lod lane already logged the durable correction and the code itself is fine. For the skeptic's purposes this matters: the campaign's *prose* layer has shipped a false claim once already, so mechanism text should be treated as a hypothesis to falsify, not evidence — which is what the refined-evidence contract now does.

## Verdict

The wave-119/120 machinery is largely sound: the pacing, ledgers, index, and Steps twins I checked are faithful, bounded, and restore-scoped. **Not clean**: F1 is a deterministic correctness/completeness regression on the authored-upgrade commit path introduced by W120-B6 itself (the guard fires on the live run, not the stale one it was built for), and F2 keeps a deferred enforce strandable by a second fault. Both are small, surgical fixes (capture the epoch at request time / consult `options.admissionEpoch`; order `enforceBudgetSteps` before the post leg or per-leg guard it).

`clean: false`
