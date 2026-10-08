# Wave 116 audit — in-flight-hitches

HEAD audited: `eaed1e7af` on `devin/1791416524-perf-w110` (W115 landed + W116 boot commit).
Golden hash contract unchanged (`0b33dde…`), zero quality degradation allowed.

`saturated: false`

## Findings (ranked)

### P1 — Parameterized dedupWarn site keys mint per-ID verbatim budgets

- Evidence: `src/systems/encounterDirector.js:427` (`encounterDirector/predation-retaliation-release/${targetId}`), `src/systems/encounterDirector.js:1192` (`encounterDirector/predation-tick/${live.shapeId}`), `src/core/warnDedup.js:26-66`.
- Mechanism: `dedupWarn(site, ...)` keys the budget on the full site string, so each interpolated key is its own site. Each distinct target/shape ID gets an independent 8-verbatim budget, an independent ≥1 s suppressed-summary heartbeat, and an independent `_warnDedupLog` row. A systemic predation fault over N live shapes emits 8N verbatim warns (each carrying a non-interned Error arg → allocation + devtools I/O inside the frame it was thrown on), then N warns/s of heartbeats indefinitely. If >256 distinct IDs fault, the 256-cap oldest-evict deletes live storm rows; the re-minted row re-arms that ID's 8-verbatim budget, so a wide fault rotates verbatim warns forever instead of converging to summaries. The verbatim budget is per site *string*, not per call site; the heartbeat does not reset under continuous distinct messages (it can't — each message is a new row).
- Fix sketch: pass a static site key (`encounterDirector/predation-tick`) and keep the ID in the trailing args so arg shape joins the suppressed bucket. If per-ID accountability is needed, add a second-level rollup (site → {perId counts}) rather than per-ID verbatim budgets.
- Effort: S. Magic-frame impact: M (verbatim warn storm inside a live predation epoch is real presented-frame cost; only fires under a fault storm). Risk: L.

### P2 — `_policyRootFaults` never un-latches mid-epoch: heal-blind park + unswept retention

- Evidence: `src/render/renderer.js:32048-32069` (rec mint/ratchet), `:32073-32074` (defer consult), `:29407` (caller). Epoch = `serviceFaultEpoch` = `enterSerial | contextRestoreSeq`.
- Mechanism (i), heal-blind: the exponential park (deferrals ×2, cap 2048 syncs ≈30-34 s at 60fps, minutes at low fps) only clears on epoch flip. Nothing deletes a root's fault rec when the root is re-dirtied: `invalidateShadowCasterPolicy` bumps `shadowCasterPolicyDirtySeq` so the root is re-evaluated, but the defer consult at `:32074` returns `false` (no-change verdict) until `deferUntil` expires. A transient fault class — a drive that throws on a subtree whose materials/geometries are mid-rebind during an authored swap, whose fault is gone on the next natural re-eval — keeps serving the stale withheld/castShadow verdict for the full park window even though the invalidation was explicit. Roots that legitimately need earlier retry exist: any fault caused by a transient tree state rather than a persistent pathology.
- Mechanism (ii), retention: `_policyRootFaults` is a strong-keyed Map written at `:32050` and read only at `:32073`; unlike `_policyStepsParked` it is never deleted at the detach seams (`:23591`, `:23879`, `:24033`, `:29752`, `:29765`, `:30486`) or in `_sweepDetachedDepthStageRoots`. Detached roots' recs are dead weight until the next epoch flip — small per rec, unbounded across a long sector.
- Mechanism (iii), no success credit: `deferrals` never decays — a root healed for an hour that faults once re-parks at the accumulated backoff immediately. Epoch flip bounds it; sector epochs are long.
- Fix sketch: (i) `_policyRootFaults.delete(root)` inside `invalidateShadowCasterPolicy` (a fresh dirty mark is explicit evidence the tree changed — the park's "no-change" verdict is definitionally stale). (ii) delete at the same six seams `_policyStepsParked` is deleted at, or add it to `_sweepDetachedDepthStageRoots`. (iii) optional: reset `deferrals` when a post-park eval succeeds.
- Effort: S. Magic-frame impact: M (stale shadow verdict on a live, mutated subtree for up to ~30 s; no stand-in pop, but a real correctness window). Risk: L (un-parking re-runs a walk that was already invalidated).

### P3 — Residual raw `console.*` on event/degraded-path sites (hunt item c)

- Evidence — per-event catches still un-deduped:
  - `src/systems/encounterDirector.js:1153` (encounter fire failed), `:1165` (predation init failed), `:1200` (tick failed — aborts the live record), `:2532` (custody event failed), `:2541` (event failed). Each aborts/retires its record on throw, so a persistent pathology warns once per record — bounded per record, unbounded across spawns; a systemic script fault emits one warn per encounter event.
  - `src/systems/sectorSim.js:427` (`offscreenRiskPass`), `:456` (`injectConflictTension`), `:1015` (`_guard` wrapper around `day:tick`, `sector:enter/exit`, `save:loaded`, `freight:loss`, `freight:cargoSpilled`, `game:started`) — event cadence, not per-tick.
  - W114-P4 carryover still unrouted: `src/render/renderer.js:2151` (`runCookSyncTwin` — warns per degraded drive per pass; label-keyed `stormWarn`/`laneWarn` would fold it), `:17420`, `:21994`, `:22355`, `:27249`; `src/render/partsLibrary.js:7903`, `:9436`. ~156 raw `console.*` remain under `src/render/`, but the rest are cold mount/install/boot paths; the drive/deferred families above are the presented-adjacent class.
  - `src/systems/` per-tick update catches outside encounterDirector/sectorSim: none found — `ai.js:162`, `combat.js:243/1106`, `missions.js:2068`, `physics.js:676`, `coreSystem.js:134`, `registry.js:302`, `world.js:1898` are all spawn/recovery/event cadence. UI/audio hot paths clean.
- Mechanism: W115 covered the three worst per-tick sites; the residual set is event-cadence plus the drive-catch family — lower rate, but each raw warn still pays allocation+devtools inside the pass that measured it, and the drive family re-mints per pass under a degraded epoch.
- Fix sketch: route the five encounterDirector sites through `dedupWarn` (static keys — see P1), wrap `_guard`'s `console.error` in `dedupError('sectorSim/' + label, ...)`, move `:2151` to `stormWarn`/`laneWarn`.
- Effort: S. Magic-frame impact: L-M. Risk: L.

### P4 — `tryPresentedCall` has no fault retry cadence

- Evidence: `src/render/renderer.js:2277-2290` (epoch-latched warn, then `run()` re-invoked next frame) and its 39 call sites across `prepareFrame`.
- Mechanism: the epoch latch silences the console, but a persistently-faulting presented tail still pays `try`+throw+stack capture every frame for the whole epoch (~tens of µs × frames × epoch minutes). Every other faulted lane in the renderer now parks behind a `*RetryAt`/`deferUntil`/`sfRowFaultedEpoch`; presented tails are the only fault class that re-runs unconditionally per frame.
- Fix sketch: stamp `render._presentedFaultRetryAt[label] = now + 1000` on catch and skip `run()` until it expires — same 1 s cooldown as `_growthFaultRetryAt`. Fallback value continues to be served between retries.
- Effort: S. Magic-frame impact: L (only a persistently-faulting tail benefits, but that is exactly the storm case). Risk: L.

## Hunt-item dispositions

- (a) warnDedup key-space — P1 above. Also verified: cap-hit evicts oldest row (not `clear()`), suppressed heartbeat resets `suppressed=0` on emit, verbatim warns don't stamp `lastWarnAt` so the first suppressed call summarizes immediately (same shape as `stormWarn` — consistent, deliberate).
- (b) exponential park reachability — P2 above: no mid-epoch un-latch path exists; `invalidateShadowCasterPolicy` is the natural seam; retention never swept. Epoch flip (`enterSerial`|`contextRestoreSeq`) is the only reset.
- (c) non-render console storms — P3 above; per-tick classes in systems are now covered, residuals are event-cadence plus the drive family.
- (d) synchronous throw-through per-frame — coverage is now thorough: 39 `tryPresentedCall` tails, `sfRowFaultedEpoch` row quarantine in both `syncEntityViewsSteps` loops, `frame._errs` cap-20 in `presentationRunner`, capped `renderUpdatePhase` logs, per-listener `dispatchRange` catch + dedup. Residual: P4 (thrown cost per frame, un-silenced at the throw site) — the only remaining per-frame synchronous throw class.

## Regression verification — W115 machinery (all PASS, verified at `eaed1e7af`)

- **warnDedup contract + call sites**: `src/core/warnDedup.js` — 8 verbatim, 256-cap oldest-evict, ≥1 s heartbeat, suppressed counter folded into summary. Call sites present: `encounterDirector.js:405/427/1192`, `sectorSim.js:162`. PASS (with P1/P3 residuals above).
- **Exponential fault park**: `renderer.js:32048-32069` — `faults>=3` gates parking, `base=30+((faults*7)%60)`, `deferUntil += min(2048, base<<(deferrals-1))`, epoch-mismatched recs reset in place. PASS (with P2 residuals).
- **Lod F1** unstagedCache consult `:30107-30141` — non-destructive: full tracked set retained, membership re-proved via ancestor walk, marks re-stamped under live sig. PASS.
- **Lod F2** `_depthCollectLightSig` `:29680-29713` — memo serve gated on `memo.epoch === shadowCensusEpoch()`; seq+epoch-keyed cache; unsigned arm nulled when presented/forced-spent. PASS.
- **Lod F3** dual-sig verdict `{verdictSig, verdictLiveSig}` `:30311-30320` + leftover sweep `{leftoverSig, leftoverLiveSig}` + `leftoverMarked` `:30442-30464`. PASS.
- **Lod F4** `findFlightTemplateObject` `partsLibrary.js:12155-12166` — index hit requires `objectPathFromRoot` reachability, fallback intact. PASS.
- **Popin P1** `drainGltfParseQueue` `decodeTaskBudget.js:297-407` — forced-wallet consult + 4 ms box + `gltfParseFramesSkipped<2` cap + in-span debits + settle tail ≤24 ms. PASS.
- **Popin P2-P4** two-strike probation `_withheldDepthCasterProbation` WeakMap keyed `{root, set}` `renderer.js:29879-29929`; `withheldDepthCasterProvablyDead` dead on invisible ancestors + `geometry == null` (`shadowDepthAdmission.js:190-218`, root-visibility intentionally not consulted per comment :213-215). PASS.
- **Popin P5** forced debits net ledgers across awaits — `partsLibrary.js:6799-6894` (`ledgerBefore`/`residual`/`forcedResidual`), pool settle `:14261+` same pattern. PASS.
- **Boot F1/F2** `failAuthoredPlaceAdmission` `:4363-4387` — no unscoped pre-gate release; `releaseBoundaryResidency` `:10419-10433` forwards `admissionEpoch` → `releaseOwnerInstances` `:15874-15923`. PASS.
- **Boot F3/F4/F5** `disposeDetachedObjectSteps` `:16954-16993`, `disposeDetachedPlaceFallback[Steps]` `:16995-17072` — root hooks fenced, per-node disposes fenced, `spacefaceSharedAsset`/`spacefaceSharedFallback` guards; `disposeAbortPartialPreScanSteps` `:11185-11204` guards shared geometries. PASS.
- **Boot F6** five stepped terminal legs present and yielded: `canonicalizeMaplessHullMaterials` `:16550`, `specializeClaimRelayOpaqueMaterials` `:4982`, `installWreckCathedralOpaqueDepthPrepass` `:5094`, `installStationOpaqueDepthPrepass` `:5268`, `expandComposedPlaceBoundsSteps` `:4742-4762` (128-stride yields, DFS union order preserved). PASS.
- **Motion detach on teardown** — `detachAuthoredMotion` on all three teardown paths (`disposeDetachedObjectSteps` `:16954`, `disposeDetachedPlaceFallbackSteps` `:17033`, `detachedFallbackTeardownThenClearSteps` `:3515`). PASS.
- **Epoch-scoped residency release** — `releaseOwnerInstances` `expectedEpoch` filter at `:15874-15923` (`release.__ownerReleaseScope`); `expectedEpoch == null` = clear-all preserved for unconditional callers. PASS.

Older-wave spot checks on this lane:

- W114-P1 (drive-throw leak): `renderer.js:32117-32118` now `parkedMap.delete(root); owner._shadowReceiversDirty = true;` — receiverDelta no longer swallowed. PASS.
- W114-P2 (warn+requeue loop): `queueContactShadowGrowth` consults `pool._growthFaultRetryAt` at `:7108` before minting; failure stamps `Date.now()+1000` + `stormWarn` at `:7156-7158` and `:7648-7650`. PASS.
- W114-P3 (bus error log): `eventBus.js:34-86` — key is `${label}|${event}|${busListenerToken(listener)}`, oldest-evict at 256 — listener churn can't re-mint verbatim. PASS.
- W114-P4 (unrouted console sites): partially landed — `laneWarn` adopted at ~40 drive sites; residual unrouted sites listed in P3. STILL OPEN.
- W114-P5 (cap-hit `clear()`): `authoredMotion.js:50-58` `noteAuthoredWarn` now evicts oldest; `warnDedup.js` same. PASS.
- W108-P6 (`_policyStepsParked` abort-dirty + seam deletes + sweep + `invalidatedAt` skip on parked-consume): all present (`:30486`, `:23591/23879/24033/29752/29765`, `_sweepDetachedDepthStageRoots` `:23299+`). PASS — its sibling `_policyRootFaults` is the un-swept one (P2ii).
- BatchedMesh path gap (known P3 deferral): `_getForwardBatchedMeshDepthSlice` serves one specimen's band to the whole family — confirmed unchanged, still deferred per mandate.
