# W114 audit — in-flight-hitches lane

`saturated: false`

Audit head: `ce756b80e` on `devin/1791416524-perf-w110` (master merged; W113 live on this branch — ≥ `cd0e33cf1` per brief).
Docs read per brief: `design/perf/PERF_W4_CLOSURE_2026-09-29.md`, `design/perf/HILLCLIMB-LOG.md`, plus the W113 wave reports in `design/perf/`. No adjudicated (KEEP/DOCUMENTED/REJECTED/GATED) items or waves 1–113 re-reported.

## Findings (ranked)

### P1 — `driveShadowPolicySteps` drive-error path drops the parked walk's accumulated `receiverDelta` — the tally drifts permanently

`src/render/renderer.js:31791-31812`. The error contract is asymmetric:

- **Sig-mismatch abandon** at `:31774-31780` *carries* the partial tally forward — the remint stores `carriedDelta: slot.carriedDelta + slot.out.receiverDelta`, so the prefix of nodes already flipped is counted exactly once.
- **Drive throw** at `:31803-31811` deletes the `_policyStepsParked` slot outright — `slot.out.receiverDelta` and `slot.carriedDelta` are discarded with it — `notePolicyRootFault` + `laneWarn` + return `null`.

`noteReceiver` writes into `opts.out.receiverDelta` **mid-walk** (`src/render/shadowCasterPolicy.js:296-317`): a throw at node K leaves nodes 0..K−1 already flipped with their delta counted in the dropped `slot.out`. The rescue/restore caller (`:30222-30262`) sees `null` → re-queues → the reminted walk visits a subtree whose prefix already matches policy → emits only suffix deltas. Net: every mid-walk fault leaks the prefix's receiver flips from `_shadowReceiverTally`. **Under-count** direction (torn turn-on prefix) walks the tally toward the `_armDepthStage` `shadowReceivers <= 0` freeze / `_detachDepthStageSession` disable while live receivers exist — missing shadows on presented frames; **over-count** direction (torn turn-off prefix) keeps the shadow stage live forever — a per-frame render cost paid for nothing. Both directions are silent: no `_shadowReceiversDirty` is stamped, so the conservative recount path that heals this never fires. Bounded per root by `notePolicyRootFault` storm-park (≥3 faults/epoch → parked till next epoch), but each fault compounds the drift and nothing ever measures it.

The exact pattern for the fix already exists in this file: `drainDisposeQueueLane` at `:2429-2431` settles a torn corpse's mid-walk measurement by nulling `iter._measure` so the dirty recount path (`countShadowReceivers`-backed) replaces the under-subtraction. **Fix sketch:** in the `:31803` catch, stamp `owner._shadowReceiversDirty = true` (or fold `slot.out.receiverDelta + slot.carriedDelta` into a root-keyed pending-delta ledger the next mint's finish consumes, matching the `carriedDelta` shape already used at `:31776-31778`). **Effort: S.** **Impact: M.** **Risk: L** — worst case one extra conservative recount on an already-faulting root.

Secondary nit on the same slot: the park sig at `:31772` is `${allowCast?0:1}|${walkRoot===root?1:0}` — a resuming caller with different `opts` (e.g. `preCountRoot`) silently inherits the mint-time options; the `out.preReceiverCount` copy is guarded (`:31820-31822`) so the caller just falls back to its own path — conservative, leave it, one-line note.

### P2 — Deferred pool-admission warns sit inside unbounded re-queue loops

`src/render/renderer.js:7124-7135` (contact shadow pool) and `:7607-7627` (ship auxiliary pool). Both legs:

```
catch (error) {
  ...cleanup...
  pool.requestedCapacity = pool.capacity;   // or requested{Shield,Nav}Capacity
  console.warn('[render] deferred ... pool admission failed', error);   // raw, unledgiered
  return false;
}).finally(() => {
  ...
  if (requested > capacity) queue...PoolGrowth(pool, requested);   // immediate re-queue
});
```

A persistently-failing admission (sustained GL OOM, context trouble, a residency pass that always rejects this root) loops promise → `console.warn` → re-queue forever — the warn rate equals the promise-chain cadence, unbounded per epoch, and the serialized `Error` lands inside the very failure window it reports on. Every sibling fault path in this file goes through `noteLaneFault` + an epoch park or the `laneWarn` rollup; these two consult nothing. Worst-case volume/epoch: **unbounded** — the largest raw-console amplifier left on a presented-adjacent path.

**Fix sketch:** stamp a fault-epoch + `retryAt = now() + 1000` on the pool (`_contactShadowGrowthFaultEpoch` etc.) and gate the re-queue in the `.finally` on it — one retry/sec mirrors the arm-fault cadence — and route the warn through `stormWarn` (module-level, no owner needed at these sites). **Effort: S.** **Impact: M.** **Risk: L** — a genuinely persistently-failing pool retries slower, which is the point; capacity bookkeeping already idempotent (`requestedCapacity` fields are re-read each cycle).

### P3 — `busErrorLog` is the only dedup ledger with no size cap, and its `listenerIndex` keying re-mints verbatim budgets on listener churn

`src/core/eventBus.js:34-50`. `stormWarn`'s map caps at 256 (`renderer.js:2174`), `authoredWarnLog` caps at 512 (`authoredMotion.js:42`) — `busErrorLog` has no cap at all. The key `` `${label}|${event}|${listenerIndex}` `` (`:45`, H12-verified at all four call sites: `dispatchRange:72`, `flushSlicedEmits:334`, `drainEmitSlice:383`, `drainPresentationTail:451`) positions the row per *listener index* — so a faulting listener that is unregistered and re-registered (survival-wave roster churn, presenter rebind) lands at a new index, mints a fresh row, and re-earns its 8-verbatim budget. Two leaks compound: (i) row growth is `faults × churn`, session-long and uncapped; (ii) warn volume per faulting listener is `8 verbatim × distinct positions seen`, defeating the dedup the key was built for. `listenerIndex` exists in the key to keep *different* listeners on the same event from folding into one row — but churned re-registration is the same listener semantically.

**Fix sketch:** cap the map (256, mirroring `_stormWarnLog`) with insertion-order eviction (`Map` iterates oldest-first — `delete` the first key on overflow), and consider keying on listener identity (`listener.name`/`listener` reference is already available in scope — a WeakRef or registered-position token) so churned re-registration folds into the same row. The cap alone bounds (i); the identity key fixes (ii). **Effort: S-M.** **Impact: L-M** — bounded blast radius per faulting listener today; unbounded only across session-length churn, and each stale row is small. **Risk: L.**

### P4 — Unrouted per-pass `console.*` on presented-adjacent fault paths

Each of these already stamps `noteLaneFault` — the ledger holds the truth — but the raw console write is uncapped I/O at fault cadence:

1. `renderer.js:2410`, `:2428` — `console.info` on despawn-dispose iterator mint/step failure. Per faulting corpse per drain pass; the drain rides presented frames and a fault-storm of corpses warns every pass until the queue drains (corpses are consumed on fault — bounded by corpse count per epoch, uncapped across epochs).
2. `renderer.js:23122`, `:23265` — `console.info` torn hidden-freeze/unfreeze mints, once per drain pass while torn rows land (names capped at 4 — payload bounded, cadence not: a root whose mint throws every pass re-queues per unhide cycle).
3. The `"... drive failed; running the sync twin"` family — ~20 raw `console.warn`/`console.error` sites in cook/residency/ledger drives (`:10748`, `:13830`, `:17030`, `:18148`, etc.), each inside a `for (;;)` drive loop's catch: `closeCookStepsIter` + `noteLaneFault` + warn + `runCookSyncTwin`. In a degraded epoch where the drive re-mints per pass, the warn rate equals the pass rate — the warn plus its `Error` arg serialize inside a frame already paying the sync twin. Same shape for `mesh-build enqueue` / `warm ledger refill` / `roster`/`crucible`/`swarm` warm-failure warns (`:20066-20233`, `:21888-22283`).
4. `renderer.js:25036` — `console.error('[render] mesh build failed permanently', { error: ..., mesh: row.mesh })` — passes the live mesh object as a console payload: devtools retain it. Per failed row; bounded by permanent-failure count, cheap fix when routing anyway.

**Fix sketch:** route the verbatim emits through `laneWarn(owner, lane, ...)` where an owner/state exists (most sites already compute `state`/`owner.state` for `noteLaneFault`), else `stormWarn(site, ...)`. The rollup already counts everything — no diagnostic is lost; the verbatim volume collapses to 8/epoch/lane + 1 s heartbeats. **Effort: S-M** (mechanical across ~25 sites; a few need a lane label chosen). **Impact: M** — this is the residual console-stall class on presented paths; each site is cheap but the family fires at pass cadence under fault storms. **Risk: L** — lanes get one more rollup row; the soak's zero-warnings contract is unaffected because these paths all warn today.

### P5 — Cap-hit `clear()` on `_stormWarnLog` / `authoredWarnLog` wipes every row's budget mid-storm

`renderer.js:2174` (`_stormWarnLog.size >= 256 → clear()`) and `authoredMotion.js:42` (`size >= 512 → clear()`). At cap, *every* storming site simultaneously re-earns 8 verbatim warns — the worst burst lands exactly when the storm is worst — and every row's accrued `suppressed` count vanishes (per-site diagnostic loss; the heartbeat summary never reports them). Bounded (one burst per cap-fill) and self-healing, but it's an amplifier shaped like a cliff. **Fix sketch:** evict the oldest/idle row instead of clearing (`Map` preserves insertion order — `for (const k of map.keys()) { map.delete(k); break; }`), or halve. **Effort: S.** **Impact: L.** **Risk: L.**

Nit on the same hunt: `laneWarn` (`:2198-2200`) resets `warns`/`suppressed`/`summarized` on epoch flip without emitting a terminal summary — a storm that ends at an epoch boundary never reports its tail count. Diagnostic-only; noted, not ranked.

## Lane hunts

### (a) Raw-console census on presented/per-tick paths

613 `console.*` sites in `src/`; `renderer.js` alone holds 192. Classification by cadence (enclosing-function context read per site):

- **Uncapped amplifiers (findings):** deferred pool admission re-queue loops (P2); dispose-lane / torn-mint / sync-twin warn family (P4).
- **Cadence-gated, verified:** `drawPreparedFrame` pre-submit refusal pair `:27909-27913` + `:28065-28083` — `refusals === 1 || refusals % 120` ≈ once per 2 s while held; fail-open emit `:28121-28133` — `_openingMissingHoldFailOpen` once-flag; post-submit validation payload `:28363-28390` + `:28522+` — once per opening, `console.info`, deliberately non-blocking.
- **Epoch/enter-parked, verified:** `residentReattach`/`residencyReconcile`/`residencyPoll`/`arrivalReserve`/`holdExempt*` warns (`:2734`, `:2834`, `:2868`, `:3254`, `:3326`, `:3394`, `:3793-4121`) — all stamp a fault epoch + `retryAt = +1000` or park till next enter; ≤1 warn/enter or 1 s-cadenced.
- **Once-per-epoch flag, verified:** `syncEntityViews` catch `:25788-25794` — `_entityViewSyncFaultWarned` per `serviceFaultEpoch`.
- **Cold mount/enter sites:** `uiRoot.js` (21 sites — screen mount/register/refresh catches), `asteroidRenderer3d.js` (63 sites — authored-load failures per mount, watchdog retry/fail pair `:3850-3851` bounded by watchdog cadence, mount settle `:349`), `shipPreview*`/`partsLibrary`/`saveSystem`/`encounterDirector` — per-mount or per-enter, no per-tick emit found.
- **`queued exact-target touch failed` `:6941`** — inside context-restore drain, bounded by `pendingExactTargetTouches` size per restore event. Cold.

### (b) Dedup-ledger correctness

| Ledger | Cap | Verbatim | Suppressed emit | Issues |
|---|---|---|---|---|
| `laneWarn` (`:2190-2222`) | per-lane rows on `render.laneWarns` (call-site vocabulary — bounded) | 8/epoch | ≥1 s heartbeat (`:2217-2221`) | epoch flip drops suppressed silently (P5 nit) |
| `stormWarn` (`:2168-2189`) | 256 → `clear()` | 8/key | ≥1 s heartbeat | cliff evict (P5) |
| `noteBusHandlerError` (`eventBus.js:34-65`) | **none** (P3) | 8/key | ≥1 s heartbeat | `listenerIndex` key re-mints on churn (P3) |
| `noteAuthoredWarn` (`authoredMotion.js:33-57`) | 512 → `clear()` | 8/key | ≥1 s heartbeat | cliff evict (P5) |

Heartbeat check: none of `stormWarn`/`noteBusHandlerError`/`noteAuthoredWarn` stamps `lastWarnAt` on verbatim emits — the first suppressed call summarizes immediately. Equivalent net shape to `laneWarn`'s `summarized` flag (`:2206-2212`); consistent, not a drift bug. `laneWarn` *does* stamp `lastWarnAt` on verbatim + summary — so its heartbeat spacing is measured from the last emit, also consistent. No starvation path found where a storming key can never re-emit: all four ledgers either reset on cap eviction (re-verbatim) or heartbeat.

### (c) Rescue fail-closed bookkeeping — stamps a later pass must not double-apply

Full stamp census for the rescue leg (`:29681-29804`):

- **Skip paths stamp nothing** — deferred-owned (`:29705-29708`), `rescueSig == null` / `rescueMemo.epoch !== shadowCensusEpoch()` / `rescueMemo.pendingIter` (`:29727-29730`, the H8 gate), `!rescueAllCurrent` (`:29733-29739`): `pending` + `_withheldDepthCasters` rows retained verbatim; a later pass re-reads the same rows. Clean.
- **`authoredCastShadow` flip** (`:29742-29746`): `castShadow = true` + `_shadowMapDirty` — idempotent; a re-run sees the flag already set (no double-apply).
- **Deadline-null path** (`:29757-29765`): stamps `_shadowMapDirty` + `STAGE_SELF_DIRTY_KEY = _liveDirtySeq()`. The parked iterator survives in `_policyStepsParked` with the same sig (`allowCast|walkRoot===root`) for both the rescue call (`:29752-29756`) and the restore-leg call (`:30229-30233`) — a later pass **resumes the same slot**, so `out.receiverDelta` keeps accumulating in one ledger: counted exactly once at whichever finish lands. No double-apply.
- **Success path** (`:29781-29786`): `pending.delete` + `_withheldDepthCasters.delete` + `sfDepthUndrawableCycles` delete + `STAGE_SELF_DIRTY_KEY` re-stamp. The dirty re-stamp makes the next checked sync re-drive the root — flag writes are idempotent (`markShadowCasterPolicy`/`noteReceiver` write final state), so a second derive converges rather than double-applies.
- **The one real gap is P1:** the drive-throw catch is the only exit that discards accumulated `receiverDelta` instead of carrying (sig-mismatch) or settling-dirty (dispose-lane precedent).

(The sibling popin lane's P2 already covers the *dead-member* veto + withheld/pending pairing in the same loop — not re-reported; my enumeration found the pairing consistent on the paths it covers.)

### (d) Presented-frame walk census — no unconditional O(scene) re-entry via W113 machinery

- Parked bloom walk: `driveBloomGeometryWalk` ≤256 visited/frame (`bloom.js:1938-1951`), mint only while `!bloomGeometryWalkIter`; `drainBloomGeometryWalk` (full drain) only on `rehearseScenePass` (`:2143`) — boot lane.
- Async touch seam: `detachedSubjectUploadsPendingAsync` (`renderer.js:11789`, awaited `:11812`; `state.render.touchSubjectExactTarget` `:12360-12432`) — off the presented frame.
- Stepped census mint: `_shadowCensusForFrame` (`:29374-29531`) — ≤4 ms/pass drain, once-per-pass dedup via `memo.lastDrainSeq === _viewSyncSeq`; sync fallback only when `paceEpochNow() < 0` + forced wallet + faults < 3 (`:29520-29527`). A rescue consult (`:29726`) can spend its ≤4 ms mint step inside the 8 ms `rescueDeadline`, but only the first root pays — `lastDrainSeq` dedupes same-pass calls. Bounded; note, not finding.
- Sweep cadence: `:29642-29652` — ≥1 s OR combined pending+parked size change OR empty-pending (H11 verified).
- Steps-twins for the other walks: `syncEntityViewsSteps` 128-row strides; `bloomGeometryWalkSteps` yields per node; `disposeObjectSteps` parked per corpse.
- Remaining O(scene) on presented frames: the bloom brick diagnostics `describeNewProgramOwners`/`describeNewGeometryOwners`/`describeUnstampedVisibleGeometries` (`bloom.js:2042-2117`) — `scene.traverse` inside the `rows.length >= 24` cap that does **not** early-exit (traverse has no stop) — fires only on sampled bricks (`brickSeq === 1 || %120 || ≥1 s heartbeat`). Bounded by sampling; the W-series notes already mark it do-not-re-gate. Not a regression.
- `emitSlice`/`drainPresentationTail`: bounded (cap 64, interleave 8, paced consults) — `eventBus.js:77-464`.

## W113 hitches regression verification — all items PASS

- **H8 — rescue consults census epoch before trusting marks: PASS.** `renderer.js:29727-29730`: withheld un-stamp requires `rescueSig != null && rescueMemo && rescueMemo.epoch === shadowCensusEpoch() && !rescueMemo.pendingIter`; each member must then satisfy `casterDepthMarkCurrent(mesh, rescueSig, rescueCamera)` (`:29733-29739`). A mid-remint memo (`pendingIter` set) → `continue` — fail-closed, bookkeeping only.
- **H9 — `laneWarn` ≥1 s suppressed-count heartbeat: PASS.** `:2217-2221` — `warnNow - row.lastWarnAt >= 1000` emits `"suppressed N total since last summary"`; `lastWarnAt` stamped on verbatim (`:2204`) and summary (`:2208`).
- **H10 — parked bloom geometry walk + drain on sync path: PASS.** `bloom.js:1905-1960` — `SEEN_BLOOM_GEOMETRY_CAP = 2000`, `bloomGeometryWalkSteps` yields per node, driver ≤256 visited/frame; `drainBloomGeometryWalk` called once in `rehearseScenePass` (`:2143`) beside `gl.finish()`; presented-path call `:2119-2120` uses `drainAll = false`. Same `seenBloomGeometries` uuid-register semantics in both modes — diff fidelity preserved.
- **H11 — arm-preamble sweep cadence: PASS.** `:29646-29652` — runs when `pendingEmpty || _depthStageSweepAt === undefined || now - _depthStageSweepAt >= 1000 || _depthStageSweepSize !== sweepSize`; `_depthStageSweepSize` tracks combined pending+parked (covers "either ledger changed").
- **H12 — bus per-listener dedup key: PASS.** `${label}|${event}|${listenerIndex}` at `dispatchRange:72`, `flushSlicedEmits:334`, `drainEmitSlice:383`, `drainPresentationTail:451` — all four emit paths keyed. (Keying's residual is P3.)

Adjacent verification while in the file: verdict epoch gate (`:30076-30081` — `verdictLiveEpoch !== armSigEpoch || (lightSig == null && memo.epoch !== verdictLiveEpoch)` → skip deny), post-rescue re-arm (`:29791-29803` — `pending.size === 0` → fault counters reset + cleanup; else `_armDepthStage()` re-arm which re-passes the fault gate cheaply), rescue deadline contract (`:29752-29757` deadline `armNow() >= rescueDeadline`; null return → `_shadowMapDirty` + `STAGE_SELF_DIRTY_KEY` re-stamp + re-queue).

## Other checks

- `git status` clean on the audit checkout; no code written, no PR, nothing run — audit only.
- Sim files untouched; golden-hash contract unaffected (no sim reads produced changes).
