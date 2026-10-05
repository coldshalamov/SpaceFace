# Wave 85 — boot-loading audit

Head audited: `devin/1791064509-perf-w60` @ `2162d361e` (W84 landed `cebbb70d7`+`2162d361e` on PR #220; waves 1-69 on master `9431f548f`).

```
saturated: false
```

## Ranked findings

### F1 — Suspended journal rebuild pays a ~4× O(entities) live-state fallback on EVERY presented frame

- **Evidence:** `consume()` early-outs to `fallbackFromState` whenever `journal.needsRebuild() === true || journalValid === false` — `src/render/presentationPublisher.js:151-152` → `:81-96` (`world.rebuildFromEntities(aliveEntities(state))` — `collectJournalPresentationEntities` is a full entity scan, `:12-14`; `rebuildFromEntities` is `clear()` + `allocateEntity` per alive entity — `src/render/presentationWorld.js:804-822`). `needsRebuild` is `() => rebuildRequired` (`presentationJournal.js:624`) and `rebuildRequired` stays set across the whole stepped suspension until commit `:576`. Every presented frame also follows `publication.rebuilt === true` → `this._rebindPresentationMeshes()` (`renderer.js:23257-23259`) and `snapshotNeedsPack` → `packPresentationWorldToFence` (`renderer.js:23269-23280`). Runner drives ≤512 generator steps/present — `presentationRunner.js:721,737-741`.
- **Mechanism:** while a stepped rebuild is in flight (≈ `journalRows/512` presents for the collect leg — up to ~32 presents at `DEFAULT_RECORD_CAPACITY=16384`, `presentationJournal.js:11`), every presented frame pays: entity collect + full `PresentationWorld` rebuild + full presentation-mesh rebind + full snapshot-fence pack — four O(entities)-scale sweeps **per frame**, for the entire suspension window. Pre-W84 the same fallback fired once (inside the single brick present); W84 slices the journal work but multiplies the per-present fallback by the suspension length, so each suspended frame still bricks at roughly the old single-frame cost.
- **Fix sketch:** publish into a shadow retained buffer and swap atomically at commit — `retained`/`read`/`write`/`count` become a swappable segment, the committed range stays consumable throughout the suspension, `journalValid` never drops, and the whole per-frame fallback disappears. Cheaper alternative: memoize the fallback result keyed on an entities-version stamp and re-run only on entity churn (churn isn't versioned today, so the shadow buffer is the honest fix).
- **Effort:** M-L (shadow segment + cursor swap) / M (fallback memo).
- **Magic-frame impact:** **H** — the largest remaining per-frame cost inside shell-visible windows (rebuilds cluster at Continue-load, sector churn, spawn bursts).
- **Risk:** M — swap must preserve `discardThrough`/`retainedSlot`/`visitRange`/`hasRange` semantics; mis-swapping loses journal continuity (visible pop).

### F2 — Stepped-rebuild publish leg is unsliced for every reachable journal

- **Evidence:** `JOURNAL_REBUILD_SLICE_ROWS = 512` counts generator `next()` calls, not rows — `presentationRunner.js:721,737-755`. Collect leg yields per entity row (`collectJournalPresentationEntitiesChunked`, `presentationSources.js:116-160`) → ≤512 rows/present. Publish leg (`rebuildFromSteps`, `presentationJournal.js:515-579`) yields per **64 rows** (`:562`) → ≤512 × 64 = **32,768 rows/present**. Journal capacity is 16,384 (`:11,:121-124`) → the entire publish leg always drains inside one presented frame. Commit message claims "512 rows/present" — true only for the collect leg.
- **Mechanism:** a max-size rebuild publishes up to ~16K `publishSpawn` records (~µs each: `ensureEntityId` + generation counters + `append` + `fillPose`) atomically inside the committing present — the slicing budget never engages on the leg that does the actual work.
- **Fix sketch:** charge published rows to the budget — yield per row inside `rebuildFromSteps` (or return a per-step row count via `lastRebuildRecordCount` delta and let the runner debit `budget` by rows, keeping the 64-row yield cadence as granularity).
- **Effort:** S
- **Magic-frame impact:** **H** worst case (whole-journal publish brick in one present), M typical.
- **Risk:** S — accounting change only.

### F3 — `requestRebuild` during suspension silently truncates the mid-flight publish (latent)

- **Evidence:** `requestRebuild` (`presentationJournal.js:236-244`) sets `rebuildRequired` and calls `clearRetained()` but never sets `rebuildInvalidatedDuringSteps` — unlike `prepareRecord` `:249`, `publishSpawn` `:317`, `recordCoalescible` `:383`. Foreign callers exist (`presentationPublisher.js:82` fallback; `coreSystem.js` owner-publication-error/undock-resume sites; runner `:781`).
- **Mechanism:** a `requestRebuild` landing while `publishIter` is suspended wipes the ring buffer; the suspended `publishSpawn(rebuilding=true)` loop keeps appending post-wipe and commits at `:568-576` with only post-wipe records → truncated journal → next `visitRange` hits 'not-retained'/range-gap → extra full rebuild cycle. **Reachability today: none** — the publish leg never spans >1 present at ≤32,768 rows (F2) and runs synchronously inside one frame, so no foreign call can interleave mid-publish. Latent: fires the moment F2 is fixed or capacity grows past 32K.
- **Fix sketch:** `if (rebuildInProgress) rebuildInvalidatedDuringSteps = true;` inside `requestRebuild` — one line, converts silent truncation into the designed `'invalidated'` re-collect.
- **Effort:** S
- **Magic-frame impact:** M if reachable (silent loss + rebuild churn); L today.
- **Risk:** S

### F4 — Zero-refusal runners drain the whole identity census inside the magic frame

- **Evidence:** arm gate mints `captureOpeningAdmissionIdentitySteps` and advances it **once per evaluation** — `renderer.js:23521-23541`. Refusal path only while `pendingAdmission > 0` (`:23554-23592`). Proceed path drains the remainder inline: `while (!censusStep.done) censusStep = ...next()` — `:23880-23883`. Census = document-order DFS + per-drawable material `Map`s + `renderer.info` scans (`openingGpuAdmission.js:128-188`).
- **Mechanism:** on the well-warmed path the campaign optimizes toward (KHR_parallel_shader_compile present, admissions settled before the first presented frame), the gate never refuses → the iterator mints and drains its entire O(scene)+per-drawable census **inside the presented first frame** — exactly the span W84 sliced out for refusing runners. Slicing amortizes work only for runners that were already holding.
- **Fix sketch:** mint the iterator earlier (at `prepareOpeningFirstPicture` arm / cook entry) so slices spread across the cook→present window; or bound the proceed-path drain to the paced budget and stamp `submitted` only at census completion (the draw still proceeds — the census is diagnostic-only, so arriving a frame late only shifts delta attribution). Both preserve the baseline-pre-submit contract for any runner that would have refused.
- **Effort:** M
- **Magic-frame impact:** **H** — the last un-sliced whole-scene pass in the presented first frame on the happy path.
- **Risk:** M — early mint captures a pre-freeze census; entities mounting until `prepareOpeningFirstPicture`'s freeze would be missed from the baseline (diagnostic skew, not correctness — needs care).

### F5 — Up to 9 forced whole-scene composes inside `prepareOpeningFirstPicture`

- **Evidence:** `_publishOpeningFirstPicture` runs `scene.updateMatrixWorld(true)` — `renderer.js:22960`; vendored `force` path bypasses the `sfMatrixFrozen` skip (`vendor/three.module.js:103-146`). Called once per settle pass `:23104` (≤8 passes) plus final `:23123`. Each call also pays `syncEntityViews(1)`, `_rebindPresentationMeshes`, `_syncAuthoredInstanceSubmission`, `_syncShadowMapEnabled`, `_updateShadowFollow`, `_syncAsteroidInstanceSubmission`, and the unforced second compose `:22988-22989` — one atomic span per call.
- **Mechanism:** each forced compose is one atomic O(scene) walk under the loading shell → repeated loading-bar freeze windows on dense scenes (the shell hides the frame but the bar stalls ~9× O(scene)). `updateMatrixWorldSteps` (W84) covers the plan build only; the publish path still forces sync composes per pass.
- **Fix sketch:** (i) gate the forced compose on a scene-dirty epoch — skip the pass when nothing composed since the previous publish (quality-identical on no-change passes, which are most of them); or (ii) convert `_publishOpeningFirstPicture` to a Steps twin driven between `yieldToBrowser` beats (the caller is already async).
- **Effort:** M (dirty-epoch needs reliable coverage of every matrix-affecting mutation) / M (Steps twin).
- **Magic-frame impact:** M-H — shell-covered, so it reads as a frozen progress bar / delayed first paint rather than a visible hitch.
- **Risk:** M — an incomplete dirty-epoch skips a needed compose → stale transforms in the first picture (quality).

### F6 — Deferred first-draw diagnostics land as one un-sliced chunk ~2 frames post-arm

- **Evidence:** `afterBrowserPaint` = rAF → `setTimeout(0)` → rAF (`renderer.js:25980-25991`) → `_finishOpeningFirstDrawDiagnostics` (`:24034-24143`): `captureOpeningAdmissionCountsForRenderer` (instanced-mesh scene sweep + `renderer.properties` scans) `:24054`, `validateOpeningSubmissionReceipt` `:24064`, ShadowDepthLedger export — single synchronous callback.
- **Mechanism:** W84 moved the O(scene)+O(drawables) diagnostics off the magic frame; they land whole inside ~frame N+2 — an early *visible* flight frame on dense scenes.
- **Fix sketch:** Steps twin for the counts capture and validation, driven under the lifecycle scheduler in ≤4ms slices; preserve the internal ordering contract (counts before validation, `:24054` → `:24064`).
- **Effort:** M
- **Magic-frame impact:** M
- **Risk:** S — diagnostics-only; ordering contract is internal.

### F7 — `armDepthStage` collect floor + session-mint fallback are atomic spans adjacent to presents

- **Evidence:** collect deadline checked only after **≥2 roots** — `renderer.js:24693` (`collected >= 2 && armNow() >= collectDeadline`); per-root node budget `4096 × depthNodeScale` ≤ 32,768 nodes at scale 8 (`:24650-24651`); session-mint failure → **sync** `compileShadowDepthPipelines` on ≤128 casters + whole-scene light census + reparent/render/restore in one arm task (`:24723-24750`).
- **Mechanism:** two consecutive max-scale roots ≈ up to ~64K node visits before the 4ms `SHADOW_DEPTH_ARM_COLLECT_MS` deadline can break — the floor exists for progress but admits a worst-case ~10× over-budget leg. The session fallback fires only when staging-session mint fails (rare) but is un-paced when it does — ledger skips (`SHADOW_DEPTH_LEDGER_MAX_SKIPS=2`, `:24561`) can force it onto a spent frame.
- **Fix sketch:** check the deadline between every root past the first (keep a min-1 progress floor), or charge node visits against the deadline directly; for the fallback path, drive `compileShadowDepthPipelinesSteps` with the same ledger budget instead of the sync drain.
- **Effort:** S-M
- **Magic-frame impact:** M (bounded, rare path).
- **Risk:** S

### F8 — Packaged-group subtrees leak GPU resources on two orphan exits (pre-existing, now inconsistent)

- **Evidence:** `attachPackagedBody` post-compile orphan `:4235-4238` and post-`publicationWait` orphan `:4244-4247` release residency but never call `disposeDetachedPackagedGroup` — every other orphan path does (`:4154`, `:4192`, `:4198`, `:4204`); `packagedCommitOrphaned` (`:4109-4115`) releases residency + stamps 'orphaned-before-swap'.
- **Mechanism:** the packaged subtree's geometry/material resources stay allocated past the swap on those two exits — VRAM held until unrelated GC; the residency claim is released so it's a pure resource leak, not a stuck claim.
- **Fix sketch:** route both exits through `disposeDetachedPackagedGroup` (or extend `packagedCommitOrphaned` to dispose).
- **Effort:** S
- **Magic-frame impact:** L-M (leak, not a stall — accumulates under repeated orphan churn on long sessions).
- **Risk:** S

## Regression notes — W84 machinery verified concretely

**1. Packaged-commit pacing** (`visualFactory.js` `.then` ~:4099)
- (a) Yields at `:4154`/`:4192`/`:4198`/`:4204` each re-check `packagedCommitOrphaned` → release residency + `disposeDetachedPackagedGroup` — a detached root can't mount later. **Exception:** post-compile `:4235-4238` and post-`publicationWait` `:4244-4247` orphan exits skip the dispose (F8).
- (b) Mount tail `:4261-4276` is atomic: `hideProceduralChildren` → `root.add` → `carryAdmittedOnceStamp` → canonicalize → `syncPackagedBodyShadowPolicy` → userData stamps → `'authored'`; no yield inside → no presented frame can observe the graft with minted default castShadow.
- (c) `authoredAssetState` sequencing preserved on all exits (`orphaned-before-swap`, `unavailable`, `stale-verdict-superseded`, `fallback-after-error`). Cosmetic asymmetry: `:4227` stamps `'unavailable'` then returns `'orphaned-before-swap'`; stale check `:4214` returns boolean `false` vs the string verdict used elsewhere — callers treat both as non-`'authored'`.
- (d) `staleAuthoredRunVerdict` (`partsLibrary.js:2713-2721`: epoch mismatch || `isAbortedStalledAdmission`) short-circuits before any packaged work; all W84 yields sit downstream of the guard.

**2. `rebuildFromSteps` + stepped driver**
- (a) Sync `rebuildFrom` (`:581-586`) drains and returns `step.value === true` → `'invalidated'` maps to `false`. Runner's sync-fallback branch (`:743-748`, only when `rebuildFromSteps` is absent — dead path in-tree) counts it as `journalRebuildFailureCount++` instead of re-collecting — a semantic divergence, unreachable today.
- (b) `rebuildRequired` stays set across suspension; foreign writes flag invalidation via `prepareRecord` `:249` (reached by `recordSpawn` `:314`/`recordDestroy` `:353`), `publishSpawn` non-rebuilding `:317`, `recordCoalescible` `:381-384`. **Hole:** `requestRebuild` `:236-244` (`clearRetained` without flag) — F3, latent.
- (c) `'invalidated'` → `steppedJournalRebuild = null` (`runner :758`) + `needsRebuild` still true → next present re-collects; convergence holds under bounded foreign writes (each write flags, so an attempt wasted per write burst at most).
- (d) Commit ordering identical: `alignJournalCursor` then `pendingJournalStart/End` armed only after `step.done` (`:756-774`); `acknowledgePresentedJournal` gated on `!needsRebuild` (`:803-805`) — cannot ack mid-flight.
- (e) `populateJournalFrame` sets `journalValid=false` while suspended (`:787-788,800`) — contract preserved, but the consumer consequence is the F1 per-frame fallback: the sync window paid it once, the stepped window pays it per present.

**3. `captureOpeningAdmissionIdentitySteps` + deferred diagnostics**
- (a) Census strictly precedes submit — remainder drain `:23880-23883` before `_renderPostRoute` `:23914`; residual is the zero-refusal inline drain (F4).
- (b) Arm gate `:23521-23526` falsy paths enumerated: `mode!=='flight'`, `openingFirstVisibleGpuCounts` set, `_openingFirstDrawDiagnosticsDeferred` set, `openingSubmissionFirstDrawSubmittedAt` finite — a second arm cannot submit while the tail pends.
- (c) `_finishOpeningFirstDrawDiagnostics` writes counts `:24054` before the validation block `:24064` inside one callback; the in-place validation gate `:23928-23931` additionally requires `!deferred` → receipt validation can never run before counts land.
- (d) Single-fire: latch set before scheduling `:23901`; `finally` clears `:24142`; re-arm possible only after both fields persisted.
- (e) Twins identical (`openingGpuAdmission.js:128-188`): document-order DFS, per-drawable material `Map`s, same visit order → census `Map` key order identical where iterated.

**4. Deferred identity release** (`_meshReleasePending`)
- (a) Readers between unbind and flush: `shipMicroMotion.js:2277-2297` `releaseEntityMesh`/`releaseMesh`/`releaseMeshSet` clear record refs idempotently (mountMesh-match only). A same-frame read of `mountMesh`/`veinRig`/`dishNodes`/`boundMesh` observes pre-release refs — designed: fields are scratch refs; the mesh itself is released at flush, and bind paths re-stamp fresh refs.
- (b) `disposeObject` teardown inside the pending window drops refs at flush; `Set` dedupe prevents double-release when the registry twin also walks.
- (c) Batch-end flush `:20253` and per-frame flush via `serviceRenderMeshResidency` `:2065` share one `Set` — cannot double-run (clears are idempotent).

**5. `updateMatrixWorldSteps`** (`renderer.js:526-559`)
- (a) Output identical to forced `Object3D#updateMatrixWorld`: `matrixAutoUpdate`→`updateMatrix`, `needsUpdate || force`→compose+clear+propagate, reversed-children push = document-order DFS, yield per 2048.
- (b) Overridden children (`SkinnedMesh` `vendor/three.core.js:23757`, `Camera` `:45693`, `AudioListener` `:50641`, `PositionalAudio` `:51670`) call `super` → the patched base — sibling order preserved → identical world matrices.
- (c) `sfMatrixFrozen` skip fires only under `!force`; twin calls use `force:true` → moot. Remaining unforced call sites `:22989`/`:25491` are dirty-subtree composes by design (bounded).

**6. `driveCompileShadowDepthPipelines` retry loop** (`renderer.js:566-587`)
- (a) `lightSigEpoch` re-minted per attempt before driving (`:584`).
- (b) `result.stale === true` retried ≤4; non-stale returns immediately.
- (c) Exhausted → `{ skipped: true, reason: 'light-census-drifted-repeatedly' }` — no throw.

**7. `_syncShadowMapEnabled` epoch gating**
- Change-gated flips `:25133`/`:25169` — `castShadow` writes that don't change the value never bump `noteShadowCensusLightMutation`; a real flip in either direction bumps exactly once per write.

## Lane residuals enumerated per prompt

- **(a) un-sliced census remainder:** the *entire* census on zero/low-refusal runners — see F4.
- **(b) other whole-scene composes in cook:** `_publishOpeningFirstPicture` forced compose `:22960` × up to 9 calls (F5) is the only unbounded forced compose left; unforced `:22989`/`:25491` walk dirty subtrees only; `assetLoader.js:1484`/`:1854` are per-GLB scenes (bounded subtrees, off the live scene).
- **(c) readers between paint and deferred callback:** only async pollers (`scripts/capture-ordinary-life.mjs:282-296`, `check-game-playable.mjs:686`, `probe-automation-outpost-live.mjs:81-86`, `probe-runtime-witness.mjs:2418`) plus the guarded validation gate `:23928` — no consumer reads predated values. Clean.
- **(d) `stampProducerReceipt` parity:** flat 5-field copy of `producerCensus` fields (`:11399-11407`) at commit sites `:11536`/`:13365`/`:13621`/`:15533` — value identity preserved (same object references the old writes carried); synchronous stamp → no torn read possible. Clean.
- **(e) armDepthStage fallback + shell-visible sync drains:** F7 covers the arm. `live.poolProgramSeal` (`:12800-12953`) is fully paced (`sealPace` + `cookStale` at every leg). World-restore (`_restoreChunks`, `saveSystem.js:4699+`) yields per section under `RESTORE_YIELD_SLICE_MS`; 17 systems expose `deserializeChunked`; the ~30 remaining `_callDeserialize` sites are bounded per-system state bags inside single yield windows — no residual beyond bounded spans.
