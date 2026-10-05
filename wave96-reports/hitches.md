# W96 audit — in-flight hitches

saturated: false

Audit head: `devin/1791064509-perf-w60` @ `4f6df8366` (detached checkout; master untouched). Contracts: zero visible-quality trade; sim golden `892f88c9` must stay bit-identical. All file:line evidence is on that head.

## Findings (ranked)

### F1 — Atomic shadow-policy traverses are the last unbounded-count presented-frame walk class

**Evidence:** `renderer.js:25239-25273` (atomic branch — `syncShadowCasterPolicy` whole-subtree `root.traverse`, `shadowCasterPolicy.js:378-384`), gated atomic at `:25171-25197` (`traverseDeferred` requires `withholdCoverageKnown`; `needsAtomicOut` hoisted exempt), `shadowCasterPolicy.js:298-312` (`preCountRoot` — every receiveShadow-true node pays an O(depth) ancestor walk → O(N×depth) inside the already-atomic traverse). Call sites: `:9272` (`onAuthoredAssetSwap` with `{preCountRoot}`), `:11313` (packaged graft `syncScope`), `:22816` (per-frame visible loop).

**Mechanism:** two whole-subtree policy traverses bypass *both* presented-frame caps (`SHADOW_ROOT_SYNC_PASS_CAP=8` and the `SHADOW_POLICY_PASS_MS=4` pass wallet — `traverseDeferred` can never fire for them and the starvation slot never applies):

1. **Uncovered withhold verdicts** — `opts.allowCast===false` on a dirty root with no `withheldMeshes` and no `_withheldDepthCasters` entry. Deliberate fail-closed (a subtree whose flags were never verified can't be trusted under a partial walk), but the *count* is unbounded: a batch of K dirty deny-verdict roots in one pass pays K×O(subtree) atomically inside the presented frame — e.g. a mass out-of-ortho cohort flipping band/dirty together on a sector-drift pass.
2. **`needsAtomicOut` (preCountRoot)** — authored asset swaps and packaged grafts are event-driven but land on the presented frame that fires them (combat refit, station upgrade, dock swap). Cost is O(subtree) traverse + O(N×depth) pre-count, the worst shape left in the lane.

Atomic legs debit `notePacedFrameSpend` (metered, W95) but never the wallet, so a burst runs to completion in one frame regardless of spend.

**Fix sketch:** route the `allowCast===false` withhold verdict through `driveShadowPolicySteps` — the stepped driver already carries sig-mismatch abandon + `carriedDelta` chaining (W93), and withholding is monotonic-safe (castShadow only flips true→false mid-walk; the depth-stage collect re-evaluates staged-vs-unstaged per mesh anyway, so a half-withheld root is consistent — its not-yet-visited casters read identically to the un-withheld steady state). `needsAtomicOut` shrinks to callers that genuinely need a synchronous `out` param; `preCountRoot`'s ancestor re-walks can fold into the walker's own visit (each node's receiveShadow count is already computed for the policy — sum it during the single traverse) turning O(N×depth) into O(N) inside a paced generator.

**Effort:** M. **Impact:** H (only remaining unbounded presented-frame traverse family). **Risk:** M — withhold bookkeeping (`denied` stamp, park literals) must mint only at completed-walk state; needs a deny-entry half-step protocol mirroring the park literal.

---

### F2 — In-flight boundary retire pays a whole-scene receiver recount on the next presented frame

**Evidence:** `renderer.js:8075` — `disposePreparedSectorBoundary` unconditionally calls `options.markShadowReceiversDirty` → `:26034-26037` → `tally.markDirty()`; resolve at `:26057-26063` → `shadowReceiverTally.js:51-60` `recount` = `scene.traverse` O(scene); `_syncShadowMapEnabled` (runs every presented frame, `:23936`) resolves the dirty tally.

**Mechanism:** every prepared-boundary retire during flight (sector drift-out teardown, packaged upgrade replacement — the paced `disposeBoundaryObject` path of W95) marks the tally dirty; the next presented frame pays one whole-scene traverse (~O(10⁴) nodes — the exact walk the tally exists to delete). Bursts collapse to one recount per frame-batch, so cost is 1×O(scene) per frame that follows a retire — a ~1-3ms read-only walk per event.

**Fix sketch:** settle exactly — `countShadowReceivers(boundary)` before removal (strictly smaller than the teardown walk it precedes, or fold into the dispose iterator itself) and feed `_noteShadowMeshRemoved(boundary, measured)` — the exact-delta path already exists (`:26025-26030`) and is already used that way by `_parkBoundedWarmRoots` (`:20129-20133`). Wire a `measuredReceivers` through `disposePreparedSectorBoundary`/`disposeBoundary` options.

**Effort:** S-M. **Impact:** M. **Risk:** L — exact-delta contract already proven at other call sites.

---

### F3 — Starvation slot winner is call-order, not park age or priority (lane item a)

**Evidence:** `renderer.js:25217-25238` — slot granted to the first castable mint observing a spent wallet (`_policyMintStarvedSeq !== collectSeq`). Call order = `syncEntityViews` visible loop (`:22816`, `:22308`, `:22126`) iterated in `query.visibleSlots` order — stable slot-index ordering, no priority input.

**Mechanism — latency bound:** a K-root burst of spent-wallet mints mints one forced slice per pass, so the tail root waits ≈ K passes (~16.7ms each) before its first slice, plus completion paced by the shared 4ms wallet across parked resumes. Bounded but linear — K=40 → ~0.7s to full mint coverage; impact is stale cast/receive flags only (withhold verdicts are atomic-exempt, so no cold-link exposure).

**Mechanism — sibling starvation:** the slot is claimed by whichever spent mint is evaluated first — i.e. the lowest-slot-index dirty root, every pass. A chronically-first root that keeps re-dirtying (attach/swap churn under an early-slot root — the player ship typically slots early) can re-claim the slot each pass while later roots park unpaid indefinitely under sustained wallet pressure. Pathological, requires sustained per-pass dirty churn on the leader, but nothing bounds it.

**Fix sketch:** rotate the grant — remember the last slot winner (`_policyMintStarvedRoot`) and prefer the first spent mint *after* it in eval order; or stamp each unpaid park with its first-park `collectSeq` and grant the oldest. Either is ~10 lines.

**Effort:** S. **Impact:** M (cadence fairness; not pixels). **Risk:** L.

---

### F4 — Parked-recheck cadence asymmetries: keep-verdict re-key preserves mint factor; expiry re-arm flattens it (lane item c)

**Evidence:** `renderer.js:25012-25024` (keep-verdict re-key rewrites `seq/lightSig/lightSigEpoch/oqX/oqZ/denied` but leaves `recheck`), `:24960-24961` (expiry re-arm is flat `96 + stamp%32` — drops both mint factors: `Math.min(8, 1<<(cycles-1))` backoff and the `×0.5` ortho-interior halving minted at `:25564`/`:25691` via `shadowCastAxisDistance <= parkedCell`).

**Mechanism:** (i) a root minted glass-adjacent (halved ~48-64 cadence) that drifts out and is re-keyed keeps its 2× recheck burn until next expiry — wasted forced `collectUnstagedShadowCastersFlag` subtree walks on a far-off-ortho park. (ii) Conversely the flat re-arm *drops* the cycles backoff a park earned: a high-cycle park meant to recheck at ~1024 re-arms at ~96-127 forever — under a large steady-state parked set (out-of-ortho drift cohort), that's M forced subtree collects per ~2s against the shared collect wallet instead of per ~16s. The comment calls the cadence a "best-effort backstop", so the flat curve may be intentional simplification — but it silently discards the mint-time escalation the entry itself carries in `depthNodeScale`/cycles.

**Fix sketch:** re-arm through the same formula at expiry (the entry already stores `depthNodeScale`; cycles live in `sfDepthUndrawableCycles`), and on keep-verdict re-key re-derive the halving from live position (the entry re-stamps `oqX/oqZ` anyway — `shadowCastAxisDistance` vs `parkedCell` is one call).

**Effort:** S. **Impact:** L-M (steady-state park-lane burn, not spikes). **Risk:** L.

---

### F5 — `recomputeMaxRadius` re-scans the whole active set per max-holder retire

**Evidence:** `presentationWorld.js:319-327`, called from `retireSlot` (`:704`) whenever the retired slot held the max radius.

**Mechanism:** O(activeCount) per qualifying retire; a retire burst that happens to kill the max-holder repeatedly (descending-radius destroys, e.g. a pack of large wrecks/structures cleared together) pays K×O(activeCount) Float64 scans in one tick's retire drain. Cheap per call, unbounded in count.

**Fix sketch:** lazily recompute — flag `maxRadiusDirty` on max-holder retire and recompute once at the next read site (cull-bounds query), collapsing a burst into one scan.

**Effort:** S. **Impact:** L. **Risk:** L.

---

## Lane-item residuals (enumerated)

**(a) starvation slot** → F3 above. Bound: ≈K passes for a K-burst's mints (one forced slice + wallet-funded progress per pass); fairness defect: call-order winner, priority-blind.

**(b) park literals missing `lightSigEpoch`** — clean. Both park-mint literals stamp `lightSig + lightSigEpoch: shadowCensusEpoch() + oqX/oqZ + depthNodeScale` (`:25560-25574`, `:25687-25705`); the keep-verdict re-key re-stamps epoch (`:25014`). No silent prefilter disable.

**(c) recheck re-mint on re-key** → F4 above. Mint-time factors are not re-derived at re-key nor at expiry re-arm; worth normalizing.

**(d) atomic-leg metering × wallet double-count** — clean. `notePacedFrameSpend` debits the shared macrotask ledger, not the `SHADOW_POLICY_PASS_MS` wallet; exactly one branch (atomic XOR stepped) debits per call — no literal double-count. The residual is the *exemption itself* (atomic legs burn ledger but never park) — folded into F1.

**(e) dead-row collect narrow / committed missing destroy** — clean. `collectedLiveIds` admits only `alive !== false` (`presentationRunner.js:791`); doom requires live-id membership (`:797`) and escalates at `JOURNAL_REBUILD_INVALIDATED_MAX=3`. A suppressed destroy for a dead row commits; the id drops out of the committed set and retires via the normal publish diff — strictly *shorter* staleness than the abort path (which deferred the retire a full pass). No consume-side stale-slot extension.

**(f) remaining presented-frame walks, ranked by worst-case node count:**

| # | Walk | Bound | Verdict |
|---|------|-------|---------|
| 1 | `scene.updateMatrixWorld()` (`:26408`, every presented frame, once for all passes) | O(scene ~10⁴); frozen/clean subtrees skipped | Keep atomic — compose must complete before draw; `updateMatrixWorldSteps` already serves the cook paths |
| 2 | `_shadowCensusForFrame` (`:25326-25348`) | O(scene) once per `_viewSyncSeq`, epoch-latched memo | Bounded — one traverse max per pass, skipped in quiet epochs |
| 3 | `shadowReceiverTally.recount` (`shadowReceiverTally.js:51-60`) | O(scene) once per dirty mark, next presented frame | **F2** — settle exactly from the retire walk |
| 4 | Atomic policy traverses (withhold/`needsAtomicOut`) | O(subtree)×uncapped count | **F1** |
| 5 | `collectUnstagedShadowCastersFlag` (recheck/drift/queue collects, `:25085`) | O(subtree), node-budget 4096×scale, count-cap 8, wallet-free but capped | Bounded — recheck cadence nit is F4 |
| 6 | `disposeObject(root)` per item inside paced drains (`:12633`, `:15202`, despawn/retained queues) | O(subtree) per item; loop paced between items | Documented bounded-atomic class; W95 covers boundary path |
| 7 | Warm-root teardowns `disposeObject(root)` (`:18378`, `:18920`) | O(warm subtree), event-driven in flight | Bounded per event; candidate for `disposeObjectSteps` twin |
| 8 | `_updateHazardVisuals` (`:23176-23181`, sector:enter) | O(#hazardVisuals) — tiny | Fine |
| 9 | `endRenderEntityFrame` byId reconciliation | O(visible rows) on seen-set overflow | Bounded |
| 10 | `_sweepDetachedDepthStageRoots` (`:25380-25403`) | O(parked set) per arm, on the post-present callback | Bounded, ledger-gated |

## Regression notes — W95 machinery verified at 4f6df8366

1. **needsSync gate** (a) `shadowCasterPolicyNeedsSync` (`shadowCasterPolicy.js:166-173`) = `state.dirty || lodLevel !== next || castBand !== next` — exact mirror of the walker early-out (`:272`), nothing else consulted; (b) `_shadowRootSyncPassCount` increments only when `!scopedSync && !traverseDeferred && !skipTraverseOnDrift && !hadParkedWalk && traverseWouldSync` (`:25198-25200`) — clean calls free; (c) dispatch gated on `!traverseDeferred && !skipTraverseOnDrift && traverseWouldSync` (`:25203`); (d) `needsAtomicOut = !!(extra && extra.preCountRoot)` force-sets `traverseWouldSync` (`:25178-25180`). ✓
2. **withholdCoverageKnown** (a) `traverseDeferred` requires `withholdCoverageKnown` (`:25186-25197`) — uncovered withholds stay atomic past the cap; (b) roots with `withheldMeshes != null` or `_withheldDepthCasters.has(root)` still defer. ✓
3. **Starvation slot** (a) `walletSpent && !hadParkedWalk && _policyMintStarvedSeq !== collectSeq → starvationSlot=true` (`:25217-25221`) — one forced slice per pass; (b) later spent mints park unpaid (`:25228-25235`); (c) `collectSeq` rolls with `_viewSyncSeq` (`:22526`, `:25055`) re-arming the slot. ✓ (fairness nit → F3)
4. **Atomic leg metering** (a) `notePacedFrameSpend(atomicElapsed)` only when `> 0` (`:25270-25272`); (b) the atomic sync runs synchronously — no yield inside `syncShadowCasterPolicy`. ✓
5. **lightSigEpoch prefilter + stamps** (a) drift release requires `lightSigEpoch !== shadowCensusEpoch()` before the sig compare (`:24981-24983`); (b) same-epoch parks skip `_shadowCensusForFrame()`; (c) keep-verdict re-key re-stamps (`:25013-25014`); (d) both park literals carry the stamp. ✓
6. **Ortho-interior recheck halving** (a) `shadowCastAxisDistance(root.position, framePlayerLocal, ...) <= parkedCell` mints the `×0.5` (`:25560-25574`); (b) out-of-cell keeps unhalved; (c) `Math.ceil((96+stamp%32) × min(8,2^(cycles-1)) × (glassAdj?0.5:1))` matches the pre-edit curve scaled. ✓
7. **boundEntityRefs doom** (a) written only inside the `meshRefs !== mesh` block (`:773-783`); (b) cleared at allocateRecord/retireSlot/unbindMesh (`:638`, `:712`, `:801`); (c) doom skip requires `resident === boundEntityRefs[slot] && resident.alive !== false` (`:984-986`); (d) `ensureCapacity` grows the column (`:282`). ✓
8. **Journal collect narrow** (a) `collectedLiveIds` = `alive !== false` only (`:786-800`); (b) dead-row suppressed destroys commit undoomed; (c) live collisions doom and escalate at 3 via `syncJournalRebuildEscalation`. ✓
9. **Paced disposeBoundaryObject** (a) flight + `disposeObjectSteps` → paced Steps drain yielding past 4ms or a spent ledger (`:10426-10438`); (b) non-flight/no-Steps → sync `disposeObject`; (c) dead-context guards first (`:10418-10419`). ✓
10. **Cook cohort mint** (a) cohort tails + buffer-roots leg share the lazy `cookPoolRootsMemo` (`:13891-13894`, `:13946`, `:14245`); (b) `cohortSubjects` chunks 1024 through `uniqueAdmissionUnits` with shared `unitSeenMaterials/Geometries` (`:13984-14008`); (c) `cookStale()` bails in bucket legs (`:13148`); (d) unbucketed seal fallback awaits `sealPace` per root (`:13158-13162`); (e) `_shadowCensusForFrame` latches epoch per `_viewSyncSeq` (`:25326-25348`). ✓
11. **precollectedCasting** (a) `compileShadowDepthPipelinesSteps` consumes `options.precollectedCasting` and skips its own census yield (`shadowDepthAdmission.js:586-614`); (b) both drive sites precollect once before the retry loop (`:542-551`, `:15720-15721`); (c) drift retries re-mint `lightSigOverride/lightSigEpoch` only — no re-collect. ✓
12. **postPace superseded** (a) `postPace` returns `passEpoch !== live enterSerial` (`:15320-15376`); (b) all rescan legs bail `superseded:true` (`:15407-15538`, `:15738`); (c) pass tail returns `postSupersededResult()` `{skipped:true, superseded:true, queued, sector, lateRoots:0, depth:{skipped:'epoch-superseded'}}`. ✓
