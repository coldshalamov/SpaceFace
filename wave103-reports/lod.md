# W103 lod-in-frame audit — devin/1791064509-perf-w60 @ 87c75829a

saturated: false

Four live contract-preserving residuals remain (LOD-1..LOD-4), all in the W102
freeze/unfreeze + shadow-tally machinery's own tail. None is a regression; each
is a next-layer item the new queues exposed.

## Ranked findings

### LOD-1 — Unmeasured `shadowMeshNotes` hooks pay a `countShadowReceivers` traverse per whole-ship LOD swap, inside the presented pass

- Evidence: `src/render/partsLibrary.js:9191` (`shadowNotes.removed(prev)`) and
  `:9198` (`shadowNotes.added(next)`) inside `swapTo` (:9181-9220), reached from
  `boundary.userData.updateLod` (:9224) → `swapTo(transition.level)` (:9238) →
  fired by the presented-pass `userData.updateLod(lodLevel)` call at
  `src/render/renderer.js:23549`. The hooks funnel to
  `_noteShadowMeshAdded/Removed(root, null)` (renderer.js:27208-27222) →
  `shadowReceiverTally.noteAdded/noteRemoved`, which run
  `countShadowReceivers(root)` unconditionally at note time — even while a
  stepped recount is pending (the measure precedes the pendingRecount check).
  Same unmeasured pattern at re-commit :9155 (loops `removed(root)` per retained
  level — up to ~3 traverses per re-commit), chunk publish/remove :13676,
  :13685, :14103, :14216, authored-swap fallback `renderer.js:9305`, and warm
  lifecycle notes :11460/:18548/:18771/:18922/:19463/:20276.
- Mechanism: a whole-ship LOD band flip in flight (zoom sweep crossing a hull's
  px hysteresis band) = 2 subtree traverses (~100-300 nodes each for a ship LOD
  level root; larger for packaged chunk meshes) inside `syncEntityViews`, per
  hull, per flip. A band-crossing fleet on a zoom pass multiplies it per pass.
  This is the W102-F4 residual class: the queue-adjacent despawn note sites got
  measured; the partsLibrary hook sites did not.
- Fix sketch: the hook sites cannot measure (they never walk the subtree), so
  route them to `_markShadowReceiversDirty` (renderer.js:27225-27229) instead of
  per-root notes — one paced tally recount absorbs N swaps; conservative-on
  direction preserved (dirty → recount, never a stale settle). The
  `packagedPolicy`-fed add path at :11460 already measures via `preCountRoot`;
  keep it. Alternatively export a `measuredReceivers` from the level-map the
  swap already builds — strictly more work than the dirty mark.
- Effort: S. Magic-frame impact: M (band-flip storms only, but those are exactly
  the zoom-sweep moments). Risk: L — `markDirty` is the tally's safest call.

### LOD-2 — `_unbindPresentationMesh` still pays the last atomic 2×O(subtree) restore inline (and ~half of it is dead work)

- Evidence: `src/render/renderer.js:21441-21444` — on `sfHiddenFrozen === true`,
  unbind runs `unfreezeHiddenSubtreeMatrices(mesh)` synchronously
  (`staticChildMatrices.js:177`, two subtree walks: restore + re-mark).
  Caller classes: `entity:destroyed` presentation listener (:16639, drained
  ≤8/frame), residency evict legs (:22041), F9 leftover sweep (:12786) and
  sector-departure sweep (:15583) — the latter two inside paced legs where the
  walk lands atomically between clock checks.
- Mechanism: a minted-frozen hull unbinding mid-frame pays ~2× subtree visits
  (~100-500 for a hull, ~1-3k for a packaged boundary) inside its caller's
  slot — the same class W102-F5 fixed for corpse dispose, at ~¼ the size.
  For corpses bound for `_despawnDisposeQueue` the restore is pure dead work:
  `disposeObject` (:28478+) does not read `matrixAutoUpdate`/`sfCullFrozen`.
  The restore is only load-bearing for reuse paths — a pooled root re-adopted
  with interior marks keeps them: `spacefaceUnfreezeStaticAncestors`
  (vendor/three.module.js:151-159) clears ancestors on add(), never descendants,
  so a reused hull would keep interior nodes' local matrices pinned.
- Fix sketch: (i) tag the despawn corpse payload `wasHiddenFrozen` and let the
  drain skip the restore entirely for dispose-bound corpses — dead-work
  elimination, zero risk; (ii) for reuse-bound unbinds, drive
  `unfreezeHiddenSubtreeMatricesSteps` under the caller's leg clock where one
  exists (the two sweep legs already pace corpse dispose identically).
- Effort: S for (i), M for (ii). Impact: L-M. Risk: L for (i); M for (ii) —
  pooled reuse must still see clean marks.

### LOD-3 — `sfHiddenFreezeLastShowSeq` lifecycle gap: never cleared at unbind, never stamped on a never-frozen root's re-show

- Evidence: stamped only inside the `sfHiddenFrozen === true` re-show branch
  (renderer.js:23471), read by the freeze drain's dwell leg (:21201). The
  unbind clear at :21434-21444 deletes `sfHiddenFreezeQueued`,
  `sfHiddenUnfreezeQueued`, `sfDespawnNoted` — but not the show stamp.
- Mechanism: (i) a pooled mesh rebinds carrying the old owner's stamp → the new
  owner's first legit hide gets an unearned ≤3-pass dwell defer; (ii) worse, the
  dwell can never guard a first-time flapper: `lastShow == null` skips the defer
  (:21202-21205), so a fresh root flapping at the cull boundary mints a freeze
  on its first hidden pass, then pays the unfreeze restore ≤N passes later —
  the dwell only begins after one wasted mint+restore cycle has already been
  paid.
- Fix sketch: `delete ud.sfHiddenFreezeLastShowSeq` in the :21434 block; stamp
  `this._viewSyncSeq` on every visible-loop row (or at least rows carrying
  `sfHiddenFreezeQueued`) so the dwell sees the first flap too.
- Effort: S. Impact: L. Risk: L.

### LOD-4 — Freeze-queue drain scans a churned dead-entry storm at ≤256/pass while live entries wait behind them (starvation is on the consult side, not the mint side)

- Evidence: drain loop renderer.js:21187-21220 — `scanned` counts pops, dead
  entries (`visible`, detached, `matrixAutoUpdate!==true`, `sfHiddenFrozen`)
  consume the same 256 budget as live ones; kept entries compact via
  `pending[w++]`. Mirror structure in the unfreeze drain :21245-21263.
- Mechanism (residual (a) enumerated): a mass-re-show burst (camera snap,
  sector re-entry, loading-hold release) queues up to the minted-frozen
  population in one pass — bounded by population, drains at 6/pass. Sustained
  unbounded growth is impossible: every unfreeze enqueue requires a minted
  `sfHiddenFrozen` root, which costs a freeze mint ≤6/pass — the two queues are
  rate-matched, so churn reaches equilibrium, not divergence. The real cost is
  consult-side starvation: a mass-unbind event (sector teardown, wave wipe)
  leaves hundreds of dead entries ahead of live ones; each pass spends its
  256-scan budget dropping garbage and mints nothing. A live root behind ~1k
  dead entries waits ~4 passes for a restore it is owed now.
- Fix sketch: cheapest — let dead-entry drops bypass the scan budget (count
  scans only on live consults, cap total pops at a higher bound like 1024, or
  simply drain dead entries unconstrained: each drop is ~4 flag reads).
  Alternatively mint by backlog: `Math.max(6, ceil(live/8))` under the paced
  ledger, mirroring `DESPAWN_DISPOSE_DRAIN` scaling.
- Effort: S. Impact: L (the deferred state is the beneficial one — frozen marks
  persist, saving continues; only the restore bookkeeping lags). Risk: L.

## Lane residuals

(a) Unfreeze-drain starvation inverse — enumerated under LOD-4. Binding
constraint ranking: the 6-root mint cap binds burst drain latency (N/6 passes);
the 256-scan cap binds consult-side starvation under dead-entry storms; drain
placement (single end-of-pass site :23825) adds ≤1 pass head-of-line and is
never the binding constraint. Sustained growth cannot diverge — re-enqueues are
gated by fresh freeze mints at the same 6/pass rate.

(b) >3-pass flappers — the dwell covers only the ≤3-pass classification-jitter
band. Cost model: mint+restore ≈ 4 subtree visits vs ~1 compose-visit saved per
hidden pass → breakeven ≈ 4 hidden passes; the dwell's own tax (3 unfrozen
hidden passes per deferral) pushes effective breakeven to ~7. The marginal-loss
band is hides of ~4-6 passes — narrow. A physically-plausible flapper (zoom bob
at the cull boundary on slow passes, ~10-15-pass period) is still net-positive
for the freeze. Residual: the uncovered band is the FIRST cycle (LOD-3, part ii)
plus a per-root flap counter for repeat offenders (e.g. dwell 3→8 after a paid
mint+restore inside K passes). Effort S, impact L.

(c) Parked unfreezes behind non-sync modes — benign by construction.
`shouldFreezeFlightSubmit` (docked, screenStack, sectorShellAdmission —
`src/core/renderUpdatePhase.js:39-62`, `src/core/presentationFreeze.js`) and
`holdOpeningPicture` (renderer.js:24767-24769) skip `syncEntityViews` entirely:
no passes run, so no enqueues AND no drains — the queue cannot grow while
parked. Parked entries' roots keep frozen marks (still the beneficial state),
and drops-on-unbind/detach keep the parked set honest. The loading-hold path
already runs a bounded `syncEntityViews(1)` (renderer.js:24253) — a second
drain site. A non-sync drain site (e.g. inside a UI tick) is legal but would be
pure overhead: there is no presented work to save while the frame is frozen.
Verdict: no fix warranted.

(d) Stale interior `sfCullFrozen` marks under deferred restore — inert.
`sfCullFrozen` has exactly one writer (`staticChildMatrices.js:164`) and one
reader/deleter (`:183-185`, inside `unfreezeHiddenSubtreeMatrices`) — zero
semantic readers anywhere else (grep-verified). The vendored walk reads only
`sfMatrixFrozen` (vendor/three.module.js:139-140) and composes marked subtrees
under force; the restored root's `matrixAutoUpdate=true` (:23470) makes
`updateMatrix()` set `matrixWorldNeedsUpdate` (three.core.js) every frame, so
force-descend covers the still-marked interior. Marks heal at mint; interior
`mUA=false` nodes have no writers by construction (`shouldFreezeStaticChild`
excludes sockets/animated/hook nodes). No defect.

(e) Remaining presented-frame whole-subtree walks, ranked by worst-case node
count:

| # | Walk | Site | Worst-case | When |
|---|------|------|-----------|------|
| 1 | `countShadowReceivers` ×2 per whole-ship LOD swap (+ chunk publish/remove, re-commit loop) | partsLibrary.js:9191/:9198, :9155, :13676/:13685/:14103/:14216 → renderer.js:27208-27222 | LOD root ~100-300 nodes; packaged chunk ~0.5-1k | Band flip in `syncEntityViews`; package seams (LOD-1) |
| 2 | `unfreezeHiddenSubtreeMatrices` at unbind | renderer.js:21444 | bound subtree ~0.1-0.5k, ×2 walks | Destroyed/evict/sweep seams (LOD-2) |
| 3 | `applyProjectedDetailLod` per hlod band flip | hlod.js:23-59 via renderer.js:23549 | station root ~0.5-2k | LOD2 crossing; `_appliedLodLevel`-gated — a multi-station crossing stacks them |
| 4 | Warm teardown `noteShadowMeshRemoved` + `disposeObject`/`disposePreparedAuthoredBoundary` | renderer.js:18922, :19463, :20276 | warm root ~0.1-1k, ×2 | Lifecycle edges (run:ended, warm reclaim) — bounded per event, atomic inside |
| 5 | `drawnCullRadiusForMesh` genuine-key miss (`Box3.setFromObject`) | visualCullRadius.js | bound subtree ~50-300 | Once per unique composition key per mesh — LRU only serves flip-backs |
| 6 | `disposeObject` flush twins | renderer.js:18089, :21778 | corpse subtree | Teardown events only (destroy/clearAll), not per-frame |
| 7 | `motionTravelPadFor` first-miss `setFromObject` | visualCullRadius.js | pad nodes ~5-20 | Once per binding |
| 8 | Vendored `scene.updateMatrixWorld()` | renderer.js:27600 | O(scene − frozen subtrees) | Every presented frame — the baseline the freeze machinery defends |
| 9 | `mintTouchDrawableSession` census ×4 per cook | renderer.js:10765-10789; mints :13422/:15055/:16092/:16257 | O(scene) stepped | Loading/cook legs only — not presented; residual: the 4 legs share `census.drawables` but each mints its own keep Set — dedupe the keep set when no `noteWorldMutation` lands between legs (L) |

Micro-note (not a finding): protected roots sitting in the hidden set (player,
`neverCull`) keep `mesh.visible === true` — their freeze-queue entries drop on
the `visible` check every consult, then the hidden loop re-enqueues them next
pass: a permanent 1-slot consult/re-enqueue churn per protected hidden row.
Cost ~one scan slot per pass; harmless.

## W102 regression verification — all SOUND

Audited on the w60 worktree (HEAD 87c75829a). Each item checked against the
brief's sub-checks (a)-(e)/(f).

1. **Unfreeze queue/drain** — SOUND. (a) enqueue at :23468 inside the
   `sfHiddenFrozen === true` branch (:23461), flag cleared after :23469 — a
   post-clear queue can never silently no-op since `sfHiddenFrozen` gates both;
   (b) drops at :21256-21260 cover re-frozen / re-queued / `mUA!==true` /
   detached, each preceded by `delete ud.sfHiddenUnfreezeQueued` (:21253);
   (c) budgets `minted >= 6 || scanned >= 256` → `pending[w++]` carryover,
   compaction not shift (:21245-21251); (d) unbind deletes the flag :21436.
   Drain placement :23825 end-of-pass, inside the `!holdOpeningPicture` gate.
2. **Flap dwell** — SOUND. (a) defer leg keeps entry `pending[w++]` with flag
   untouched (:21202-21205); (b) `lastShow != null` guard — absent stamp mints
   normally; (c) compares `viewSeq` (pass counter `:23268`), never wall clock.
   Residual gap reported as LOD-3.
3. **notedWalk visit stamps** — SOUND. (a) unconditional stamp on every live
   pop (:67-75); (b) visited-then-removed writes `delta = -delta` exact
   retraction (:146-162); (c) unvisited-note removal deletes the pair;
   (d) detached ancestor-liveness skip precedes the stamp (:56-64).
4. **Measured corpse notes** — SOUND. (a) `disposeObjectSteps(m, corpseMeasure)`
   counts mid-walk, `iterDone` notes `_noteShadowMeshRemoved(m,
   iter._measure.receivers)` (:2008-2119, :28478-28517); (b) `sfDespawnNoted`
   corpses skip the drain note + clear flag (:20739-20751 contextLost inline
   note); (c) torn iterator nulls `_measure` → dirty recount; (d) all
   queue-adjacent unmeasured note sites removed — drain owns the note;
   (e) remounted corpse (`parent != null` at drain) skips note+dispose (:2049).
   Edge verified safe: the flag persists through remount so a second
   destroy-push skips its note — landing exact against the never-re-added first
   delta.
5. **Stepped sweep disposes** — SOUND. (a) `disposeObjectSteps` drives under
   the leg clocks — 8ms wall + `pacedFrameSpend` at :12792-12809,
   `providerSliceDue` at :15586-15597 — inside per-corpse teardown, not just
   between corpses; (b) mid-teardown cookStale return leaves the same
   scene-removed half-disposed contract; (c) `measure.receivers` feeds the note
   exactly.
6. **drawnCullRadius LRU** — SOUND. (a) LRU consulted only on moved composite
   key, cadence expiry still re-measures; (b) LRU hit halves the window
   (`DRAWN_CULL_REMEASURE_CALLS >> 1`); (c) ≤3-entry FIFO stash on outgoing
   keys; (d) served radius is the key's own measurement (visualCullRadius.js
   :65-140).
7. **Generation-validated retire bursts** — SOUND. (a) deadResidents mint
   `{slot, gen, resident}` and retire re-checks `alive!==1 || slotGenerations
   mismatch || entityRefs mismatch || resident.alive!==false` → skip
   (presentationWorld.js:1102-1364); (b) absent mints `{id, sourceGen}` and
   `retire(id, gen)` honors the journal DESTROY contract (:747-753); (c)
   recycled slot / resurrected id mid-park is not retired.
8. **Cook-scoped drawable census** — SOUND. (a) `_touchDrawableCensus` keys
   `{scene, _liveSectorCookGeneration}` (:10765-10789); (b) the 4 leg sessions
   share `census.drawables`, each mints its own keep Set (:13422, :15055,
   :16092, :16257 — keep-set dedupe is the (e)-9 residual); (c) paced
   `drawableHideSessionSteps` enumeration still drives under
   `admissionPaceYield`.
9. **Per-call keep** — SOUND. `withOnlySubjectsDrawable`
   (openingGpuAdmission.js:469-535): keep mints fresh per call; ancestors +
   descendants join per call; `session.keep` unread by the hide pass.
10. **Guarded census iter** — SOUND. Arm-time site wraps `next()` in try/catch
    stamping `{done:true,value:undefined}` (:24956-24976); in-frame drain site
    same (:25320-25332); timer-gap drain already guarded (:25387-25396).
11. **Paced roster-prewarm cohort** — SOUND. (a) `needsWork` gate returns early
    when exemplars/weapons ledgered + leaf/catalog attempted (:18249-18311);
    (b) `cohortOwed()` is a sync gate before the await (:18313-18501); (c)
    mounts `_markShadowReceiversDirty`, never unmeasured `noteAdded`; (d) drain
    promise joins `_rosterPrewarmPending` → `rosterPrewarmSettle` covers it
    (:13068-13132); (e) leaf/catalog stamps at attempt time; (f) drain-end
    `upgradeBareRockMaterials` covers post-sweep mounts.

## Not re-reported (adjudicated / preexisting)

BatchedMesh specimen gap, loading artwork GL pause, ambient compile-tail
serialization, LOD-F2/F3/F5 markers, LOD-N4 depth over-inclusion, BOOT-F3(a)
generator split, BOOT-F7/F4/F5/F9 emit slicing, F6 payload intern,
nxb-059 stale source-scan — all per brief exclusion list.
