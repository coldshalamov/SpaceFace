# W114 audit — popin-admission lane

`saturated: false`

Audit head: `cd0e33cf1` on `devin/1791416524-perf-w110` (waves 1–108 merged via PR #220; 109–113 live on this branch / PR #238).
Docs read per brief: `design/perf/PERF_W4_CLOSURE_2026-09-29.md`, `design/perf/HILLCLIMB-LOG.md`.

## Findings (ranked)

### P1 — Three skip-cap lanes still force-start with no forced-wallet consult

The wallet contract (`src/render/decodeTaskBudget.js:109-115`) says a lane that runs only because its aging cap fired must consult `forcedFrameSpend()` first and defer a frame if spent — the counter stays at cap so it still forces next frame in arrival order. W113 wired this on five sites; three lanes still have the old shape: `pacedSpent && skips < CAP` defers, but once the cap fires they drain on whatever frame is presented, consult nothing, and debit only the paced ledger. Under a sustained-late stretch every cap trips on the same presented frame and these stack on top of all the wired lanes.

1. **`src/render/decodeTaskBudget.js:369-386` — `drainGltfCompileQueue` cap-fired leg.** `pacedFrameSpend() >= GLTF_COMPILE_FRAME_MS && gltfCompileFramesSkipped < GLTF_COMPILE_MAX_SKIPPED_FRAMES` (2) → skip + `armFrameDrain`; after the cap, drains `while (ran === 0 || now() - start < GLTF_COMPILE_FRAME_MS)` — min-4 ms of compile plus one unbounded compile tail — with only `notePacedFrameSpend` at :386. This is the compile artery for every decoded ship/station/prop; its forced unit is the largest of the three. The file defines `forcedFrameSpend`/`FORCED_FRAME_BUDGET_MS` and never calls it.
2. **`src/render/partsLibrary.js:6593-6605` — `driveOpeningPublicationResume` cap-fired batch.** `pacedFrameSpend() >= PACED_FRAME_BUDGET_MS && _openingPublicationResumeSkips < OPENING_PUBLICATION_RESUME_MAX_SKIPS` (2) → defer; post-cap releases up to `min(16, max(4, ceil(queue/8)))` `entry.resolve()` continuations — parked commit tails — with no forced consult and no debit. The drain's own span is trivial; what it releases is not, and none of it is wallet-visible at release time.
3. **`src/render/partsLibrary.js:9141-9165` — `scheduleRetainedDisposeDrain` cap-fired leg.** Same `pacedSpent && retainedDisposeLedgerSkips < 2` gate; post-cap runs stepped `disposeDetachedObjectSteps`/`queuePacedDetachedTeardown` legs to 4 ms with `notePacedFrameSpend` only at :9165.

The canonical wired shape already exists at `src/render/renderer.js:2347-2355` + `:2453-2455` (despawn drain): `pacedSpent && (skips < CAP || forcedFrameSpend() >= FORCED_FRAME_BUDGET_MS)` → defer (counter clamped at cap so arrival order holds), then `noteForcedFrameSpend(elapsed)` on the forced run. **Fix:** port that shape to all three sites — consult inside the existing skip predicate, debit the elapsed span when the run was forced. For site 2 the honest gate is the consult; the resolve() span itself is ~free, so either debit it anyway for uniformity or keep it consult-only deliberately. **Effort: S-M** (mechanical, one predicate + one debit each). **Impact: M** (site 1 alone justifies it — largest unwired forced unit left). **Risk: L** — worst case each lane waits one more presented frame mid-storm; the cap counter still forces next frame, and deferral is what the wallet exists to buy.

### P2 — A dead member in a root's `_withheldDepthCasters` set can veto that root's rescue restore for the rest of the sector

The W113 P2 rescue gate at `src/render/renderer.js:29712-29741` is all-or-nothing per root: `rescueAllCurrent` requires every member of `pendingWithheld` to satisfy `casterDepthMarkCurrent(mesh, liveSig, camera)` — `mark.l === lightSig` plus morph/depth-material/kind/layer/camera pair checks (`src/render/shadowDepthAdmission.js:332-356`). One member that can never carry a current mark leaves `rescueAllCurrent === false` → `continue` → root keeps `_pendingDepthStageRoots` + `_withheldDepthCasters` rows forever while the arm is fault-parked. Since `serviceFaultEpoch` = `enterSerial|contextRestoreSeq` (`renderer.js:2475-2479`) lasts an entire sector enter, a dead member starves restore for the rest of the sector — withheld meshes keep `castShadow=false`, pending keeps the arm's waitlist alive.

Members that can never prove currency under the live memo sig:
- **Detached-without-unbind meshes.** Withheld sets only union-add (`renderer.js:29331-29335`); there is no per-mesh prune anywhere — every `_withheldDepthCasters.delete` is wholesale per-root (`:29604/:29617/:29782/:29007/:28898/:30184/:30208/:30281`, unbind sweep `:23771-23780`, teardown `:23925`). The per-mesh unbind cleanup at `:23474-23497` only fires when the mesh *itself* was a root key. A mesh dropped from the subtree (packaged part swap, LOD-fragment churn, dispose under a surviving root) keeps its withhold-time mark; it is never re-collected (collects walk live trees) and never re-marked → permanent `!current`.
- **No-longer-signature-capable meshes.** `collectUnstagedShadowCasters*` excludes casters that fail `isCasterCapable` (invisible materials / no uuid, `shadowDepthAdmission.js:390-394`); a mesh whose materials mutate to that state after withhold can never be re-marked under any sig.
- **Never-covered live meshes while the arm is parked** — marks minted only under foreign sigs or never minted; the arm's own compile leg is the covering minter and the fault gate parked it. Transient class (heals at the next enter or when a foreign co-subject compile covers the mesh), but it is why the veto test must be *structural*, not mark-based.

**Fix sketch:** in the rescue loop, treat provably-dead members as absent — skip meshes not currently under `root` (ancestor walk to `root`) or no longer signature-capable before the all-current verdict, and `.delete` them from the set so they stop being re-scanned. A member merely unmarked-but-alive must still veto (fail-closed is correct for live members — that is the P2 fix working). **Effort: M.** **Impact: M** — persistent missing shadows + permanent pending backpressure under fault storms for affected roots. **Risk: L-M** — the prune test must never un-withhold a mesh whose marks are genuinely mid-flight; dead checks must be structural only.

### P3 — The resumed pipeline batch consults the forced wallet but never debits its released link span

`src/render/pipelineReadiness.js:432-435` — W113 P3 added the consult correctly (`forcedFrameSpend() >= FORCED_FRAME_BUDGET_MS` → `scheduleResumedBatch()` + return, flag uncommitted). But when the consult passes, `observePipelineAdmission(flushResumedBatch())` at :437 dispatches `flushQueuedThrough` → `enqueueLink` → `pumpLinks` → `invokeCompileBatch` (:340-357, :258-270) — sync dispatch head plus one serialized link unit — and nothing anywhere in the file calls `noteForcedFrameSpend` (the import at :2 is consult-only). The released unit debits zero on the wallet the resume just consulted — the same half-machinery shape W113 P1 killed on the five sites upstream. **Fix:** debit the resumed batch's dispatched span — `const resumeStarted = now()` before `observePipelineAdmission(...)` and capped `noteForcedFrameSpend(now() - resumeStarted)` after — or deliberately scope the debit to the sync dispatch head since the link work is already serialized one-at-a-time through `pumpLinks`. **Effort: S.** **Impact: L-M** — unit is small (`resumeBatchSize` default 1, `BATCH_COMPILE_MAX_UNITS` 4, serial links), but it stacks on a frame the wallet already debited. **Risk: L.**

## Lane hunts

### (a) Consult-to-debit ordering — which unit spans must consult before work starts vs. honest post-unit

- **Indivisible sync units** — plates `initTexture` (`deepSkyPlates.js:237-241`), nebula `_ensureNebulaBake` (`spaceBackground.js:1885-1887`), wormhole promote+mesh mint (`spaceBackground.js:2829-2839`): post-unit capped debit is the only honest shape; no mid-unit consult point exists. Verified honest.
- **Async unit** — `drivePoolAdmissionIfUnclaimed` (`partsLibrary.js:13970-14002`): consult → `await prepare` → `activate` → settle-debit is the right bookkeeping for a spend that spans presents. Residual: the intermediate frames read zero forced spend while the unit's compile+touch batches run (its internal stage yields pace the real cost), and the whole `min(span,8)` debit lands on whatever frame the settle hits — a second consult before `activate` would catch a frame that got spent mid-unit, but activate is small and bounded by slots. Documented residual, not a finding.
- **Upgrade pick** (`partsLibrary.js:7424-7475`): consult covers the pick; the debit covers the sort; the post-sort span (`primeNextAuthoredAssetPlan` O(jobs) filter+sort at :7727-7806, job mint, `Promise.resolve().then(run)` dispatch) lands on the consulted frame unmetered — bounded predicates, and `run()`'s heavy phases all yield (4 ms `buildComposedShipAsync` slices). Honest.
- **Two mesh-build gates** (`renderer.js:24828-24842`, `:24938-24947`): consult-only per W113 adjudication — released rows are paced-debited and bounded by `buildBudget` + `shouldContinueAdmissionSlice`+`usePacedLedger` (`:24963-24996`, verified on-glass overflow path too). Covered, not a residual.
- **Missing consult entirely:** P1's three lanes. **Consulted but never debited:** P3.

### (b) Mark-currency rescue breadth — members that can never prove currency, and starvation bounds

Enumerated in P2. The transient classes are bounded and correct: `rescueSig == null` (unsigned first mint / storm pin → `continue`, bounded by the ~4 ms/pass stepped mint — usually one pass); `rescueMemo.epoch !== shadowCensusEpoch()` or `pendingIter` (mid-remint → `continue`, bounded by mint completion — this is the H8 epoch gate working); live meshes with stale-sig marks and no covering compile while the arm is fault-parked (epoch-bounded — heals next sector enter / context restore / a foreign co-subject compile that covers the mesh). The unbounded class is dead members — detached-without-unbind or signature-incapable — which no leg will ever re-mark; they starve their root's restore for the whole enter epoch.

### (c) Withheld-set / pending pairing under rescue sweeps

Verified consistent: `pending.delete(root)` pairs `_withheldDepthCasters.delete(root)` only after a successful restore (`:29781-29782`); every `continue` path keeps both rows; the deferred-owned skip (`:29705-29708`) keeps both because the owning compile's settle path restores them (`_restoreWithheldDepthCasters` inside `compileShadowDepthPipelines(Steps)` success at `shadowDepthAdmission.js:646-656`). One nit: the detached-root fast path (`:29698-29700`) deletes `pending` but leaves the withheld row and `STAGE_SELF_DIRTY_KEY` for the cadenced sweep (`:29604`) to clean — bounded leak window, nit not finding.

### (d) Remaining admission-path work without wallet consults or stride bounds, ranked

1. `drainGltfCompileQueue` cap-fired leg — P1 site 1 (4 ms + unbounded tail, no consult).
2. `driveOpeningPublicationResume` cap-fired batch — P1 site 2 (≤16 released commit tails, no consult).
3. `scheduleRetainedDisposeDrain` cap-fired leg — P1 site 3 (4 ms stepped legs, no consult).
4. Resumed-batch released link span — P3 (consulted, un-debited).
5. Rescue per-mesh `casterDepthMarkCurrent` loop (`renderer.js:29733-29738`) — O(set) compares run inside the per-root iteration; `rescueDeadline` is only consulted between roots (:29697). Compares are µs each so a large set is still bounded; note, not a finding.

Checked and clear: `gltfParse` drain (count-2 cap, microtask'd tasks — `decodeTaskBudget.js:286-323`); on-glass mesh-build overflow (slice+paced-ledger bound, `renderer.js:24961-24996`); mesh-build released rows (paced debits); `_armDepthStage` ceremony (ledger + forced consult `:29665-29668`); `_sweepDetachedDepthStageRoots` cadence + size cap (`:29642-29652` — sibling-lane surface, covered); reattach regrade strides (W112 verified); parse/compile decode runway legs (own drivers pace them).

## W113 popin regression verification — all items PASS

- **P1 — five post-unit forced-wallet debits: PASS.** Consult + `started` stamp + indivisible work + capped `noteForcedFrameSpend` present at all five sites: plates pump (`deepSkyPlates.js:229-255`), nebula deferred bake (`spaceBackground.js:1877-1890`), wormhole promote+mesh (`spaceBackground.js:2819-2847` — debit scored to the forced-consult path only via `promoteStarted === -1` guard at :2843), pool orphan admission settle (`partsLibrary.js:13983-13995`), upgrade pick sort incl. glass carve-out (`partsLibrary.js:7424-7475`, carve-out at :7432 flows through the same `:7475` debit). The two mesh-build gates remain consult-only as specced (`renderer.js:24828-24842`, `:24938-24947`).
- **P2 — mark-currency rescue gate: PASS.** `renderer.js:29712-29741`: rescue consults the memo (`rescueSig != null && rescueMemo.epoch === shadowCensusEpoch() && !rescueMemo.pendingIter`), then un-withholds only when every member satisfies `casterDepthMarkCurrent(mesh, liveSig, camera)`; any non-current keeps pending + withheld. Deferred-owned roots skipped first at :29705.
- **P3 — pipelineReadiness forced consult: PASS.** `pipelineReadiness.js:432-436`: `forcedFrameSpend() >= FORCED_FRAME_BUDGET_MS` → `scheduleResumedBatch()` + `return` before `skippedResumeForLatePresent = false` commits at :436.

Shared-lane item verified while inside the rescue: hitches H8 (rescue must consult the census epoch before trusting stale-sig marks) — `rescueMemo.epoch === shadowCensusEpoch()` + `!rescueMemo.pendingIter` gate at `renderer.js:29727-29730` is in place.

## Other checks

- Full `shouldStartHeavyAdmission`/`shouldStartHeavyAdmissionEventually`/`forcedFrameSpend()` consult universe enumerated: `renderer.js` (gates :20204, :24836, :24943; forced consults :20263, :23370, :23406, :23421, :29394, :29665, :31728-31732), `partsLibrary.js` (:13983, :7424, +`commitAnyReadyGates` consulted site), `deepSkyPlates.js`, `spaceBackground.js`, `pipelineReadiness.js`, `framePacing.js`, `pacingUtils.js`, `worldBoundaryPrecompute.js`. The three unwired lanes in P1 are the complete residual set — every other skip-cap/aging lane consults.
- No code changed, no PR, nothing run — audit only.
