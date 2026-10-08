# W114 audit — lod-in-frame

**saturated: false**

Audited HEAD `cd0e33cf1` (branch `devin/1791416524-perf-w110`, tip of W113 work). Read `design/perf/PERF_W4_CLOSURE_2026-09-29.md`, `design/perf/HILLCLIMB-LOG.md`, and the W113 wave reports; no adjudicated (KEEP/DOCUMENTED/REJECTED/GATED) items re-reported. Contract check: audit-only — no code writes, no PRs, no app runs; sim golden hash untouched (no sim files read as changed).

## Findings

### F1 — Verdict-skip starvation: census churn can defer a caster's stage/deny verdict indefinitely and nothing counts the skips — H impact / S-M effort / L-M risk

Evidence: `src/render/renderer.js:29856-29861` (arm mints `lightSig` + `armSigEpoch = shadowCensusEpoch()`), `:30085-30094` (verdict gate: `verdictStale = verdictLiveEpoch !== armSigEpoch || (lightSig == null && memo.epoch !== verdictLiveEpoch)` skips the whole allow/deny-park block), `:29900-29913` (`unstagedCache` consult requires `cache.epoch === armSigEpoch`), `:30100` (`sfDepthUndrawableCycles++` only inside a *landed* deny). Mutation sources: `noteShadowCensusLightMutation()` bumps `shadowCensusMutationEpoch` from ~10 sites (precompile.js, `vfx.js:15165`, flightOverheadPresentation.js, disposeObject heldLight).

Mechanism: W113 F1's gate correctly closed double-denial under epoch drift, but it also made "skip the verdict" a silent no-op path. Any light mutation between arm-mint and verdict — a combat VFX light birth/death is a per-frame event — flips `shadowCensusEpoch()` and the verdict is skipped. Two consequences, both unbounded: (i) a legit stageable root never lands its allow verdict, so its casters sit unadmitted (missing real shadows, or a later in-frame depth-compile when something finally draws them); (ii) an undrawable root that *should* deny-park never lands the park and re-enters the arm pipeline every arm. There is no escalation: `sfDepthUndrawableCycles` counts landed denies only, `armFaultCount` counts throws only — a verdict skipped N times bumps no counter. Whether the skipped root re-arms immediately (still in `pending` → `finally` re-arms at `:30290`) or waits for an unrelated `invalidateShadowCasterPolicy` dirty-stamp, the admission is deferred by an amount proportional to light-churn frequency — worst during exactly the combat bursts the magic-frame contract cares about. Note the stale test is *stricter* than semantic drift: `shadowCensusEpoch` bumps on any mutation callback, while `lightCensusSignature` only changes on type/layers/castShadow-count/fog drift — a pure position move can skip a verdict whose collect was still perfectly valid.

Fix sketch: per pending entry, count consecutive verdict-skips (`entry.verdictSkips = (entry.verdictSkips|0)+1`, reset on landed verdict or re-dirty). After ≥2 skips, instead of skipping again: mint a fresh sig consult (`this._depthCollectLightSig(scene)` + `shadowCensusEpoch()` re-read) and evaluate the verdict under the live values — a stale-epoch verdict is worse than a fresh-epoch one only when the census actually drifted, which the fresh sig settles. Cheaper variant with the same effect: keep the gate, but let `lightCensusSignature(live) === armTimeSignature` override epoch inequality (epoch-equal-or-sig-equal proceeds).

Risk: evaluating under a drifted epoch can park/allow against a since-changed census — bounded by re-minting the sig at verdict time rather than trusting the arm's. The starvation counter must live on the pending entry, not module state, so it follows the root across re-arms.

### F2 — `unstagedCache` throws away a valid collect on any census flip; the epoch key duplicates the per-mesh mark re-prove it already runs — M impact / S effort / L risk

Evidence: `src/render/renderer.js:29900-29913` — consult requires `cache.seq === shadowCasterPolicyDirtySeq(root) && cache.epoch === armSigEpoch`, then re-proves every cached mesh via `casterDepthMarkCurrent(mesh, markSig, camera)` anyway; on epoch mismatch `:29913` nulls the entry and the loop falls into the full subtree collect (`:29975-29986` re-mints `{seq, epoch: armSigEpoch, meshes}`).

Mechanism: the mesh *list* is only stale when the subtree changed — which `dirtySeq` already keys. The sig-sensitive part is each mesh's mark, and the consult re-proves every mesh's mark under the current arm sig regardless. So `cache.epoch === armSigEpoch` adds no correctness — it converts every census flip into a full O(subtree) re-walk for roots whose subtrees never moved. Compounds F1: under sustained light churn, every arm both skips its verdict AND pays a full re-collect for the same roots — the exact budget `collectDeadline` exists to protect.

Fix sketch: on `seq`-match/`epoch`-mismatch, run `cache.meshes` through the same mark re-prove loop (re-stamp `cache.epoch = armSigEpoch` after consult), or drop the epoch key entirely and let `dirtySeq` + mark re-prove carry correctness. If a belt-and-suspenders bound is wanted, cap epoch-mismatch reuse at one flip.

Risk: assumes `dirtySeq` covers every subtree mutation class that changes caster candidacy; a class that misses dirty-stamping (e.g. a geometry swap without policy invalidation) could keep a stale mesh id one arm longer — but that exposure already exists via `seq` alone, so no new correctness surface. `markSig` is the arm's sig and may itself be stale post-flip; safe because the verdict gate independently skips stale-epoch arms and the deferred leg mints marks under the leg's fresh sig.

### F3 — Presentation-commit authored-motion activation walks the full mesh subtree, unsliced, per commit — M impact / S effort / L risk

Evidence: `src/render/renderer.js:25457` — `m.traverse((node) => node.userData?.activateAuthoredMotionRegistration?.(e))` inside the mesh-commit path (immediately before `record.committed = true`), no explicit stack, no slice budget, no yield.

Mechanism: every presentation commit pays an unbounded O(subtree) `traverse`. One commit is cheap, but the commit path runs per-entity — a re-sector boundary rebuild or a squadron spawn burst stacks N subtree walks inside one frame-adjacent window. Same blast shape the W-series kept finding in the stage/collect arms, just on the commit path. `traverse` also cannot early-exit (cf. F-5's comment at `startupGpuResidency.js:337`), so even a "no registrations" walk pays the full subtree.

Fix sketch: explicit-stack Steps twin paced through the paced ledger (`notePacedFrameSpend`), or hoist activation registration to build time so commit is O(1) (the registrations are keyed on `userData`, which a build-time walk could pre-collect into a flat list on `m.userData`).

Risk: activation ordering vs the `m.visible` flip and `record.committed` — preserve preorder visit order via explicit stack and keep activation before `committed = true`.

### F4 — Resident-reattach mint snapshots the whole owner mesh map per call — L-M impact / S effort / L risk

Evidence: `src/render/renderer.js:~2000` — `for (const [id, mesh] of Array.from(owner._meshes))` inside `reattachResidentGpuMeshesSteps`; W113 F4 added the liveness guard (`:2062`) but kept the snapshot.

Mechanism: each reattach mint copies the entity→mesh map (O(N) alloc) to guard against mutation during the stepped iteration. During a residency-reattach cohort (sector boundary rebuild) that's one map copy per minted reattach — N copies of a map that itself has N entries.

Fix sketch: iterate the live `Map` directly — `Map` iteration is well-defined under concurrent delete, and the `:2062` liveness guard already makes stale/aliased entries safe — or carry a `_meshesVersion` stamp (already maintained at `:25459`) and skip re-collecting when unchanged.

Risk: mutations landing *between* steps rather than during the loop body — the liveness guard catches detached/aliased meshes; a mesh added mid-iteration would be visited or not per Map semantics, which matches the snapshot's own indeterminacy.

## Hunt dispositions (brief items)

- **(a) verdict-skip bookkeeping** → F1 + F2. `unstagedCache` is epoch-keyed so a stale epoch can never be *read* (it is discarded and re-collected — expensive but coherent); `deniedAllowCast` mints and withheld-set unions happen only inside a landed deny (`:29331-29336`, `:30093-30134`), so a skipped verdict cannot leave a half-minted withhold. No stale-carry bug found; the residue is the starvation/budget burn, which is F1/F2.
- **(b) census-flip-churn starvation** → F1. No floor or escalation exists for repeated skips.
- **(c) rescue-ledger coherence** → checked, coherent. Survivor marks are re-proven per consult sig (`casterDepthMarkCurrent` compares `mark.l === lightSig` + morph/custom/layers/camera/kind/material — `shadowDepthAdmission.js:332-356`); leftover eval re-proves under `leftoverSig` (`:30154-30165`); parked rows re-key on ortho-cell/lightSig drift (`:28749-28902`). Mixed-epoch marks read stale → re-collect, never poison. No per-row sig ledger needed given the re-prove.
- **(d) remaining per-pass O(subtree) traverses** → F3 + F4. Other `traverse()` sites checked are already defended: shadow-receiver census wallet-gated + stale-served (`:30588-30598`), pooled-nav-light lookup cached on `userData` (`:7970-7980`), socket pose cached per name (`:30818-30821`), bloom geometry walk parked ≤256/frame with an identical drain (`bloom.js:1916-1960,2143`), dispose path paced via `disposeObjectSteps` (`:31879+`).

## Regression verification — W113 machinery

| Item | Verdict | Evidence |
|---|---|---|
| lod F1 — verdict epoch gate | VERIFIED | `renderer.js:30085-30094` — `verdictStale` on epoch mismatch or unsigned-arm stale memo; skips deny-park + leftover eval. Residual gap tracked as F1. |
| lod F2 — re-arm on non-empty pending in `finally` | VERIFIED | `renderer.js:30290-30302` — `pending.size > 0` → `_armDepthStage()`; clean drain resets `_depthStageArmFaults`, clears pending/scheduled, kills session. |
| lod F3 — parked-root walk inside rescue deadline | VERIFIED | `renderer.js:29753-29765` — parked walk inside the 8 ms rescue deadline. |
| lod F4 — reattach liveness guard | VERIFIED | `renderer.js:2062` — `entity.alive === false || entity.mesh !== mesh` skip inside `reattachResidentGpuMeshesSteps`. |
| popin P1 — forced consults are consult-only | VERIFIED | `renderer.js:24836` (`lateStartAllowed`), `:24943` (`resumedStartAllowed`) consult the admission lane without minting. |
| popin P2 — rescue consults P2/H8 parked state | VERIFIED | `renderer.js:29725-29730`. |
| popin P3 — forced-budget gate before `skippedResumeForLatePresent` clear | VERIFIED | `pipelineReadiness.js:425-435` — `forcedFrameSpend() >= FORCED_FRAME_BUDGET_MS` → `scheduleResumedBatch(); return;` ahead of the flag clear. |
| boot F-1 — cook lane paced under `yieldBuffers()` | VERIFIED | `renderer.js:16126/16132/16144/16155` — every per-subject and per-step seam yields. |
| boot F-2 — paced reveal/restore cohorts at both cook sites | VERIFIED | `renderer.js:16097-16212` — `driveRevealCohort` mints `revealSubjectForCompileSteps` per root; mid-mint `cookStale()` throws `'cook-superseded'` *into* the generator (self-restoring prefix, `:16119-16125`), then sync-restores minted entries → `null` → `cookSuperseded`; `driveRestoreCohort` paces `restoreSteps` inside both `finally` blocks (`:16181`, `:16210`); throwing mint → `closeCookStepsIter` + `noteLaneFault('cookRevealMint')` + `runCookSyncTwin`. |
| boot F-3 — flight-template Steps twins | VERIFIED | `partsLibrary.js:11403-11460` — `yield*` to `createFlightTemplateRootInstanceSteps`, `yield` per recipe and before bindings restore; `instantiateRenderPackagePartSteps` + `bindInstanceMotionSteps` (`:13514`); owner-material census explicit-stack `%128` (`:11583+`); all 10 composedShipSteps instantiatePart sites route through `instantiatePartSteps` (`:10351-10541`); sync trio stays sync at `:3484/:4683/:4695`. |
| boot F-4 — startup residency strides | VERIFIED | `startupGpuResidency.js:158/257/314` — `(++visited % every) === 0 || clockNow() - strideAt >= 2`; collectYield awaited before work-item build/partition (`:561/:568`); resident-skip branches yield at `(index & 255) === 255 || >=2ms` (`:764/:776`). |
| boot F-5 — async exact-target touch seam | VERIFIED | `hasUnresidentGeometry` explicit-stack DFS with first-unresident early exit (`startupGpuResidency.js:332-349`); publish seam returns `{skipped:'scan-failed'}`/`'touch-failed'`, `laneWarn`-ed, never unhandled (`renderer.js:12386-12424`). |
| hitches H8 — rescue consults policy state | VERIFIED | `renderer.js:29725-29730`. |
| hitches H9 — `laneWarn` ≥1 s heartbeat stamps | VERIFIED | `renderer.js:2175-2218` — `lastWarnAt` stamped per emit + rollup row; authoredMotion.js:41-51 same shape. |
| hitches H10 — bloom geometry walk parked ≤256/frame | VERIFIED | `bloom.js:1916-1960` — parked iter keyed by scene; `rememberBloomGeometries` slices ≤256, `drainBloomGeometryWalk` drains the same walk pre-`gl.finish()` (`:2143`) — identical diff fidelity. |
| hitches H11 — arm sweep cadence | VERIFIED | `renderer.js:29642-29652`. |
| hitches H12 — bus error rows keyed per listener | VERIFIED | `eventBus.js:35-45` — `${label}|${event}|${listenerIndex}`; all four sites pass the index (`:72`, `:334`, `:383`, `:451`). |

## Bottom line

The W113 machinery all checks out — every verify item holds. The lane is **not saturated**: the new frontier is the *verdict-skip* side of F1's epoch gate (starvation + forced re-collect under light churn, F1/F2), one unbudgeted commit-path subtree walk (F3), and one per-mint map snapshot (F4). All four fixes are small and none touches quality or sim determinism.
