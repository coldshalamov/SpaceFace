# Wave 132 audit — popin

Audited HEAD: `06e495da9` on `devin/1791504143-perf-w120` (PR #257 tip — carries waves 120-131).
Lane scope: things popping into existence late — authored assets decoding inside the reveal
instead of pre-decoded on the runway/prewarm arms.

```yaml
saturated: false
```

## W131 verification — ALL PASS

- **reclaimWarm consult (F2/F3) — PASS.** `retain()` refreshes `entry.lastWarmClaimAtMs = now()`
  when the incoming metadata carries `decodeWarm === true || softLease === true`
  (assetResidency.js:395-401, inside the `existingMetadata` branch, beside the
  decodeWarm→decodeServed upgrade). `reclaimWarm(key, owner)` (assetResidency.js:453-460)
  returns false for missing / non-`resident` / null-owner / foreign-owner entries, true +
  re-stamps otherwise; exported on the frozen API (:2550). `loadAuthoredPart`
  (assetLoader.js:717-723) consults `residency.reclaimWarm(cacheKey, residencyOwner)` under
  `ownerlessWarm` BEFORE `beginRequest` — a resident-under-owner re-post mints no request.
- **Latch-free warm polls (F1) — PASS.** No `warmedAt`/`once-fired` WeakMap or Set survives at
  any of the 15 sites (renderer.js:5706-6540 — encounterPending, reinforcements ×2, pursuit,
  lawIncident, stationPatrol, aceReturn, cultureIntro, planetChallenge, uniqueWreck, depotWatch,
  depotPatrol, claimDefense, capitalWing, wantedTier, gateWing); every arm re-posts each
  residency pass. The surviving Sets are in-flight dedupes, not latches:
  `_decodeRunwayPrefetchIds` (:5253), `_decodeRunwayPackagedFiles` (:5510),
  `_decodeRunwayHulkFiles` (:6561), `_waveHullDecodePending` (:6664) all `.delete()` in
  `.finally` on settle and clear on sector rotation via `clearDecodeRunwayDedupe` (:6642-6646).
  The plan-computing trio memo plans, not posts: `_gateWingWarmKeys` is a Map of verdict
  booleans on `sectorId|to|day|factionId|security|wanted` (:6034-6054), still demote-cleared via
  `clearSectorWarmLatchKeys` (:6067-6077); `_uniqueWreckComplicationWarmPlans` /
  `_depotWatchWarmPlans` / `_depotPatrolWarmPlans` WeakMaps re-plan only when the arm's own
  deadline stamp moves (:6274-6298, :6389-6410, :6437-6463), all through
  `plannedAuthoredEncounterShips` (:6333-6349). `warmAuthoredEncounterArm` still returns the
  count for `warmLaneAmbushDecode`. Test pin modernized:
  `encounter-pending-decode-warm.test.mjs` now `doesNotMatch /warmedAt|WarmDueAt|WeakMap/`.
- **deleteSlot direct write (B-131-F1) — PASS.** saveSystem.js:3011-3041 — writes
  `normalizeSlotIndex(this._readIndex())` minus the slot via `setItem(INDEX_KEY)`, splices
  `_slotIndexCache.merged` + re-stamps `'gen:'+_saveStoreGeneration`; no `_slotIndexWithFallback`.
- **Spec-arm debounce (B-131-F2) — PASS.** `_armSpeculativePrepare` (:2513-2560) mints
  `{sig,slot,raw,promise:null,dispatch,_timer}` under `SPEC_ARM_DEBOUNCE_MS=200`; `dispatch()`
  lazy-mints `spec.promise` exactly once, carries the `_prepareEnvelopeStringAsync` +
  `save:envelopeSpecPrepared` emit chain (sig re-checked at emit). Sync load clears the parked
  `_timer` at :4670-4672 (consumes `spec.raw` only); the async lane consumes via dispatch.
- **Value-riding re-arm (B-131-F3) — PASS.** `bumpSaveStoreGeneration(key, value)` forwards to
  `_onSaveStoreBump` (:114-124); same-slot writes re-arm from `bumpValue` with the sig bracket
  (:383-391); foreign writes defer `Promise.resolve().then(() => speculateLoadPrepare(staleSlot))`.
- **Memo LRU (B-131-F4) — PASS.** `_slotDataMemo` is a Map bounded by `_SLOT_DATA_MEMO_MAX = 6`
  with delete+set recency on hits (:778-782) and oldest-first eviction (:800-803).
- Prior-wave spot-check: no W131 commit touched the W130 cardEnv/latch-delete/apply-facade
  machinery; nothing there to re-verify.

## Fresh hunt — the W131 ground

### (a) Verdict/roster memo invalidation — SOUND, one latent contract gap

I traced every input feeding the planned rosters. `resolveEncounter`'s rng is
`mulberry32(hash32(seed, payload.encounterId, shape.id))` (encounterDirector.js:3356-3361) —
**anchor, zoneName, zoneRadius, simTime/dayIndex, and playerPos never enter the rng**; they
feed `zone.center`→jitter positions and `squadId`/cosmetics only. Ships = f(shape, encounterId,
zone faction via `localCivilian`, levelBand). So:

- `uniqueWreck` memo on `record.dueAt` is sound — `planUniqueWreckEncounter` rng keys on
  (programSeed, def.id, encounterId) (uniqueWrecks.js:143-148); `bearing.exactPos`/`simTime`
  only move positions and `squadId`.
- `depotWatch`/`depotPatrol` memos on `watchAt`/`encounterId:nextAt` are sound — the comments'
  "roster is anchor-independent" claim is verified: a station resolving mid-arm shifts the
  anchor and squad positions, never which hulls the fire plans.
- `gateWing` verdict memo covers every `planGateScene` input (seed is run-constant; the tuple
  covers sectorId|to|day|factionId|security|wanted). The fire (`_onChargeStart`,
  gateControlDirector.js:88-107) computes the SAME tuple — `activeSector()` is the identical
  sector pick (gcd.js:301-307), `DAY_SECONDS` 600 both sides.
- **`wanted` predicate divergence — checked, collapsed.** Fire's `wanted` =
  `isHostileToPlayer(WANTED_PROBE, ...)` where the probe is `{team:3, data:{ai:{lawful:true}}}`
  (gcd.js:44-48,238-242): reduces to `securityTargetId === playerId || isPlayerWanted(state) ||
  factionAggroOnPlayer(probe, state)`. `factionAggroOnPlayer` requires `e.factionId != null`
  (scanner.js:1989-1994) — the frozen probe has none → unreachable. `ai.securityTargetId` is
  undefined → `undefined === state.playerId` fires only when playerId is unset (no chargeStart
  can exist without a player). **In-flight the fire's `wanted` === `isPlayerWanted(state)` —
  the warm's exact predicate.** Equivalent, not a finding. Residual divergence:
  `REPEAT_COOLDOWN_S=120` (gcd.js:38,100) early-returns the fire — invisible to the warm, which
  keeps re-posting the wasp hull in-range during cooldown. Spend-only, ~µs/poll — not worth
  modeling.
- Memo-key consistency note (not a finding): `uniqueWreck` memos on `dueAt` alone,
  `depotWatch` on `watchAt` alone, `depotPatrol` on `encounterId:nextAt`. Sound today — the
  unkeyed fields are record-creation constants or ship-irrelevant — but a uniform armKey
  (deadline + identity) would harden all three identically.

### (b) Non-GLB warm lanes — SOUND

Only two `beginRequest` sites exist: assetLoader.js:722 (GLB — now reclaimWarm-guarded) and
renderPackageLoader.js:247, which mints once per package-entry generation behind the
task/content-hash caches — never per re-post. A package warm re-post resolves through the task
cache and ends at `record.renderPackage.retain(owner, {softLease:true, decodeWarm:true})`
(assetLoader.js:1474-1478) → registry `retain()` → the W131 `lastWarmClaimAtMs` refresh — so
package re-posts re-pin correctly and never minted request objects at all. Textures are
procedural (canvasTextures — no residency requests); place/prop/census/pod files all funnel
through `loadAuthoredPart` → the consult covers them.

### (c) Re-post-every-poll steady state — bounded; measured

- `warmSeededModularPool` posts **43 files** per call (measured at HEAD: 10 REGULAR_HULL_FILES
  + cockpit 3, engine 6, fin 6, weapon 6, greeble 7, gear 2, pod 3 — the comment's "~43" is
  exact). Concurrent pool arms ≤ ~3 (wantedTier + bountyStaged + ecologyScavenger) plus the
  intervention event arm.
- Per-call costs, node24 micro-benchmark on the extracted HEAD tree (one process):
  `planGateScene` **0.44 µs/call**; `authoredPreloadPlanForEntity` **6.07 µs** whole-ship /
  **4.33 µs** modular per ship (each plan ≈7 files). A 10-ship roster ≈ ~60µs/poll of plan
  resolution + library scans + lane enqueues.
- Worst single yield-group (renderer.js:24951-24955: wantedTier 43+2 files + gateWing +
  stationPatrol) ≈ ~50 `loadAuthoredPart`/`ensureEntityLibrary` calls ≈ ~0.5-1ms inside one
  generator step — inside the paced slice. Whole-poll upper bound ≈ ~200 file-level calls ≈
  2-4ms spread over six yield groups at 250ms cadence.

### (d) Nemesis + remaining latches

`state.nemesis.pending` IS pollable — the record persists announce→dispatch→ack and a cancel
clears it (nemesis.js:250-261, `_cancelPending` :304-308). Today's bus arm posts once per
`nemesis:announced`; decodeWarm entries evict byte-pressure-last, so the residual is only a
soft-budget/demote eviction inside the ~6s window, or the dispatched→spawned gap — narrow.
No other non-sector once-fired warm latch survives (F1's 15 sites all poll-and-repost).

## Findings (ranked)

### F1 — `plannedAuthoredEncounterShips` drops `item.warmShips` and `item.warmAssets`

**Evidence (all at 06e495da9):** the helper (renderer.js:6333-6349) returns only
`planned.item.ships` archetype records. The same `resolveEncounter` item carries two further
warm channels the fire mounts: `warmShips` (namedHunter captain-pool union; `claimVictim` hull —
encounterDirector.js:3469-3478) and `warmAssets` (packaged bodies — pods/props, :3461).
`warmEncounterPendingDecode` covers all three (:5716-5742); the depotWatch/depotPatrol/
uniqueWreck/laneAmbush arms through the helper cover only `ships`.
Today every armed shape is squad-only — verified: `ambush_snare` (020-ambush-snare.js),
`patrol_beat` (090-patrol-beat.js), and all six `unique_wreck_*` complication shapes carry no
`claimVictim`/`warmAssets`/`namedHunter` — so the drop is **latent**: the first shape routed
through these arms that carries a claim victim or packaged props (a lane `ambushShapeId` data
edit, a depot shape revision) decodes those files cold inside the reveal it was armed to cover.
**Mechanism:** MECHANISM_VERIFIED as a contract gap (the fields exist on the item the helper
already replays; it silently discards them). **Fix:** have the helper also collect
`item.warmShips` archetypes and return `item.warmAssets` for the file lane (the
encounter-pending poll's `warmAssets`→`loadAuthoredPart` loop is the exact shape to copy).
**Effort:** S. **Magic-frame impact:** M latent / L today. **Risk:** low — additive; the live
shapes' warm sets are unchanged.

### F2 — In-flight warm re-posts still mint a `beginRequest` per poll

**Evidence:** `reclaimWarm` requires `entry.state === 'resident'` (assetResidency.js:455-457).
A warm re-post landing while the entry is still `'loading'`/`'requested'` falls through to
`beginRequest` — every poll mints a request object (`pendingRequests.add`, `state.requests.add`,
`emit('request-begun')`, `notePendingRequestActivated`) that later churns `commit()`/`cancel()`
→ `finishRequest`/`retain`/`evictIfUnowned`. The decode itself dedupes via
`admitAuthoredAssetTask`; this is pure bookkeeping, ~2-8 mints per file per arm
(in-flight window ÷ 0.25s poll). With several armed cohorts sharing a decode burst the churn
is ~50-100 request objects/sec transiently. **Fix:** extend the consult to a claim-refresh
that covers the in-flight states (re-stamp the pending request's demand signal instead of
minting a sibling), or a per-`(key,owner)` in-flight dedupe inside `beginRequest`. **Effort:**
S. **Impact:** L (spend only — no pop-in). **Risk:** low-moderate — touches the request
ledger; needs the same owner-exactness as reclaimWarm.

### F3 — `authoredPreloadPlanForEntity` re-resolves per ship per poll; memoizable on its input tuple

**Evidence:** every `warmEnemyRosterDecode` re-post runs `ensureEntityLibrary` →
`authoredPreloadPlanForEntity` (partsLibrary.js:1175-1240) — `hashString` + `SHIP_BY_ID` +
`contractRecords` + `authoredWeaponMounts`/`fittedModuleMounts`/`authoredGearMount`/
`authoredGreebleMounts`/`authoredPodMounts` per ship per 250ms poll. Measured **4.3-6.1 µs**
(node24, extracted HEAD). The plan is pure over `(entity.id | defId | factionId | whole-file
selection | forceWholeShipFile/lodLevel/requiredWholeShip opts)` — all readable into a memo
key; the module's own comment requires re-resolution because "combat/traffic identity can land
mid-preload" — identity fields are in the tuple, so a key change re-plans. ~5 concurrent roster
arms (~20-40 ships) ≈ 100-240µs/poll of pure re-resolution, plus per-file lane enqueue +
`libraryHasPreloadPlan` record scans in `ensureEntityLibrary`. **Fix:** WeakMap memo on
`entity` keyed by the tuple — re-plan on any input move; alternatively bound the re-post burst
with a per-step file budget shared by the yield groups. **Effort:** S-M. **Impact:** L-M
(recurring spend; grows with each wave's new cohorts). **Risk:** moderate — a plan memo on a
missed input reintroduces the stale-plan class; the tuple must enumerate every read (incl.
`options` fields and `wholeShipVisualForEntity` inputs).

### F4 — Nemesis squad arm is the last once-fired warm (residual)

**Evidence:** `onBus('nemesis:announced')` → `warmNemesisSquadDecode` once per announce
(renderer.js:19324-19327). `state.nemesis.pending` is a live pollable record for the whole
window (nemesis.js:250-261) — the poll could re-post while `pending` exists and
`pending.notBefore - now <= TABLE_DECODE_RUNWAY_SECONDS` (and through the dispatched-ack gap).
The residual is narrow — decodeWarm rides byte-pressure-last and a rejected dispatch
re-announces — but it is the only surviving once-fired warm of the class W131 deleted.
**Fix:** fold a `warmNemesisPendingDecode(owner)` reading `state.nemesis.pending` into the
residency pass (gate on `pending`, the runway window, and sector match). **Effort:** S.
**Impact:** L. **Risk:** low.

## Hardware-unverified

Nothing in this lane's findings requires GPU truth — all items are CPU-side bookkeeping /
coverage. The plan/memo numbers above are node24 CPU measurements (SwiftShader-independent).
