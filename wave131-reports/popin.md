# Wave 131 audit — popin

Audited HEAD: `35fb5fed7` on `devin/1791504143-perf-w120`.
Lane scope: first-presented and late-presented pop-in — authored assets decoding at mount
inside the reveal instead of pre-decoded on the decode runway / prewarm arms.

```yaml
saturated: false
```

## Findings (ranked)

### F1 — Surviving once-fired warm latches still strand evicted cohorts cold

**Evidence (all at 35fb5fed7):** W130 deleted the three biggest once-fired latches
(`_spawnRequestWarmSeen`, `_interventionWarmSeen`, `_modularPoolWarmSectors`), but ~14
`warmedAt` WeakMap latches and 2 sector Sets still dedupe ownerless-warm posts by record
deadline/identity — none re-post after a soft-budget eviction:

- `_encounterPendingWarmDueAt` renderer.js:5711 — encounter-pending squad
  (`warmEncounterPendingDecode` → `preloadAuthoredAssetsForEntity` + `warmSeededModularPool`
  for the six-file site table), arm window 6.0s.
- `_reinforcementWarmDueTick` :5782 — combat/salvage reinforcement wings, arm ≤13.5s runway,
  sector-scoped buckets (`dueTick` mutates on re-schedule but not on eviction).
- `_combatReinforcementWarmAt` :5821 — combat reinforcement hulls (score-static roster,
  latch re-arms only on deadline change).
- `_pursuitWarmAt` :5863, `_lawIncidentWarmAt` :5897, `_stationPatrolWarmAt` :6114,
  `_aceReturnWarmAt` :6156, `_cultureIntroWarmAt` :6196, `_planetChallengeWarmAt` :6255,
  `_uniqueWreckComplicationWarmAt` :6295, `_depotWatchWarmAt` :6389, `_depotPatrolWarmAt` :6433,
  `_claimDefenseWarmed` :6536 — all `warmedAt.get(rec) === rec.<deadlineField>` dedupes.
- `_capitalWingWarmFights` :5931 — the weakest in the class: a bare `WeakMap` `set(rec,true)`
  with no deadline field at all; nothing re-arms it, ever, for that record.
- `_wantedTierWarmSectors` :5964 and `_gateWingWarmKeys` :6053 — `Set` latches cleared only
  by demote (`clearSectorWarmLatchKeys` :6088-6095), not by eviction.
- Nemesis squad (bus-driven single arm, ~6s window) — same class, tiny window.

**Mechanism (player-visible):** each site does `if (!warmAt.get(rec)) warmAt.set(rec, dueAt) …`
or `if (warmAt.get(rec) === rec.dueAt) return`. The ownerless warms post with
`{softLease:true, decodeWarm:true}` (assetLoader.js:715-722, :863-864 — every warm role matches
`WARM_PURPOSE_RESIDENCY_ROLE` /warm|runway|prewarm|armory|predicted/i), so they ride the byte
budget and evict under pressure (`evictOldestSoftEntries`, assetResidency.js ~:860). Once evicted,
the latch still reads "warmed" — nothing re-posts — and the spawn/encounter/intervention mounts the
file at request time, inside the reveal window: the exact cold decode→mount pop-in burst the class
produces. Per-event likelihood is gated by byte-pressure eviction landing inside the arm→fire window
(most ≤13.5s), lower per event than W130's multi-visit pendingInterventions but identical failure
mode, and several latches cover multi-hull reveals (reinforcement wings, squad spawns).

**Status:** MECHANISM_VERIFIED. **Effort:** S–M (delete the dedupes and let the registry re-post
each poll — the established W130 shape; the ~4-line WeakMap idiom is duplicated 14× so a shared
helper pays for itself). **Magic-frame impact:** M. **Risk:** low — registry dedupe bounds the
re-post cost (measured, F3); the demote clears stay.

### F2 — Warm re-posts never re-pin the lease: `retain()` drops the recency refresh

**Evidence:** `request.commit()` (assetResidency.js:435-447) takes the resident fast path when
`entry.owners.has(owner)` and skips `retain()`. Inside `retain()` (:377-424) the `existingMetadata`
branch refreshes `entry.lastWarmClaimAtMs = now()` **only** on the decodeWarm→decodeServed upgrade;
a warm re-post (`softLease+decodeWarm` metadata, no `decodeServed`) early-returns `false` and writes
nothing. `lastWarmClaimAtMs` is otherwise stamped once, at first claim (new-owner branch :419).

`evictOldestSoftEntries` sorts candidates by `a.lastWarmClaimAtMs - b.lastWarmClaimAtMs`
(~:860) — the armed re-posted cohort keeps its first-post stamp, so it deterministically sorts
oldest-idle and is evicted first on every pressure wave. The "while the request runs, the entry is
excluded from the soft class" gate (`classifySoftBudgetEntry` :875-880 → 0 while a request is active)
covers only the ~2-microtask post→commit window (~µs) — the ~250ms between polls the entry sits
fully exposed with a stale stamp.

**Mechanism (player-visible):** the W130 commit message says the re-post "re-pins the soft lease
mid-approach." It does not — the re-post performs zero writes on a resident file. The intended
defense (keep the approach cohort young so pressure evicts *other* files first) is dead code; what
remains is evict→re-decode churn every poll, which mostly works but burns decode-budget slices and,
under sustained pressure, still surfaces a cold file at fire time.

**Status:** MECHANISM_VERIFIED. **Fix sketch:** on `commit()` (or `retain()`'s
`existingMetadata` branch), when the entry is already owned by this owner and the request metadata
is warm (`softLease`/`decodeWarm`), set `entry.lastWarmClaimAtMs = now()`. ~4 lines.
**Effort:** S. **Magic-frame impact:** M. **Risk:** low — the stamp exists solely for idle sorting;
refreshing it is the documented intent of the W130 change.

### F3 — Per-poll re-post cost is unaccounted spend (measured)

**Evidence:** micro-bench on this box (node 24, extracted copies of assetResidency.js +
resourceGovernor.js, `.bench-w131/`): one full resident re-post cycle —
`beginRequest`→`commit`→retain fast path, `finishRequest`→`deactivateRequest`,
`finalizeChunk` microtask, 2 emits, 2 budget-class rekeys — is **3.22µs/file**; **0.138ms/poll**
for the 43-file seeded-pool cohort (~0.55ms/s at the 4Hz poll); **0.297ms/poll** for three stacked
cohorts (~1.2ms/s). Plus the loader-side prefix per file (~2-5µs, unmeasured here: `runtimeFor`
await, deadline-class regex, two map consults, `pendingAssetTasks` join check,
`assertSourceRouteAdmitted`, `Promise.resolve` + `.catch` alloc).

All of it lands in microtasks *after* the synchronous pump segment — outside the poll's slice clock
and outside the paced ledger (the commit-continuation cost-hiding class, W86 doctrine). So the
re-post steady state is ~0.5-1.5ms/s of invisible spend that grows with concurrent cohorts — small,
but unaccounted, and every W130-style latch deletion adds more. `warmSeededModularPool`'s `armKey`
parameter is also dead (still mints `recordsForSector` + serial memo each call; `pickModularSites`
re-derives per cohort per poll).

**Mechanism:** not itself a frame hazard at current cohort sizes; it is steady unaccounted spend in
a machine that already runs a millisecond budget per frame, and the honest accounting wave-reviewers
keep flagging.

**Status:** MECHANISM_VERIFIED + CPU-measured (hardware-unverified frame impact; SwiftShader box).
**Fix sketch:** a light `reclaimWarm(key, owner)` consult — if resident under the owner, refresh
`lastWarmClaimAtMs` and skip the request mint — kills F2 and F3 together; otherwise a cheap
`runtime.assets.has(cacheKey)` gate before `beginRequest`. **Effort:** S–M. **Impact:** L.
**Risk:** low.

### Not findings (checked, negative)

- **(a) re-post heat:** the re-post leg is *not* hot enough to be its own material finding —
  measured above; it is F3's problem statement, not a hazard.
- **(b) retract→re-approach re-decode placement:** on byte-pressure eviction `onEvict` deletes the
  `runtime.assets` registry entry, so the next re-post re-decodes via the deadline-class worker post
  + paced compile tail — placement is by design inside presented frames and strictly better than a
  mount-time decode. The residual exposure is F1 (latches suppress the re-post entirely) and F2
  (eviction is more likely than intended), not a new defect.
- **(d) admission verdicts stranded on entity identity:** clean. Verdict machinery keys on
  mesh/userData — `presentationEntityId` stamped at `_bindPresentationMesh` (:23797), deleted at
  unbind (:23939); writes epoch-guarded by `staleAuthoredRunVerdict`; restore remaps via
  `sessionEntityIdRemap`/`sfStableEntityKey`/`stableMeshKeyForEntity` (:1904+).
  `_authoredSectorPrewarmPendingId` minted :19857, cleared on five paths
  (:3019-3021, :9992, :11450, :19497, :19780-19781, :19809). `_decodeRunwayPrefetchIds` is a
  bounded pending-entry snapshot, rekeyed on activation. No unbounded session-scoped identity
  stores found on this pass.
- **LIVE_ENTER_SPAWNER_STUBS_MEMO** (saveEnvelopeSectorWarm.js:1105): keyed on the `state` object
  plus `enterSerial` — enter bumps the serial, restore swaps the object; correct invalidation.

## Regression notes — landed waves

**W130 popin (46ef3e012) — verification:**
- Latch deletions PASS: `_spawnRequestWarmSeen`, `_interventionWarmSeen`,
  `_modularPoolWarmSectors` fully gone; `clearSectorWarmLatchKeys` (:6088-6095) keeps its two
  remaining legs (`_wantedTierWarmSectors`, `_gateWingWarmKeys`) and dropped the dead modular
  block consistently with the deleted `getModularPoolWarmArmKeys`.
- Registry dedupe substitute PASS: `admitAuthoredAssetTask` (assetLoader.js:149-190) cache-hits on
  `runtime.assets` → no `createTask`; evicted files re-decode since `onEvict` deletes the registry
  entry.
- Claimed mechanism FAIL → F2: "re-post re-pins the soft lease" is dead — see F2. Functional
  contract (re-decode after eviction) works; the stated protection does not.
- `liveEnterSpawnerStubs` scope comment fix PASS.

**W130 boot/save companion (35fb5fed7) — verification:**
- B-130-1 (cardEnv lane) PASS: worker-twin + host projections carry `cardEnv`
  (`restore_prepare_meta` :291-309; `cardEnvFromEnvelope` :390 host / :657 worker spliced into
  PLAYER_CHUNKED); `cardEnvs[slot]` collected :2414 and published :2445 with
  `_prepareEnvelopeMeta` fallback.
- B-130-2b (fallbacks) PASS: `_collectCardEnv`/scan sites pass
  `verdict.cardEnv || this._prepareEnvelopeMeta(raw)` (:2672/:2766); fallbacks
  :4827/:4847/:4850 return `{ok:true, cardEnv}`.
- B-130-3 (speculation raw handoff) PASS: `readSlotSaveData` memo is `{slot,sig,raw,data}`
  bracketed by `saveStoreSignature` (saveLoad.js:772-790); `_select` renders-then-emits
  `save:loadSpeculationTarget {slot,raw,sig}` (:1150-1160); `speculateLoadPrepare` adopts
  `provided.raw` only when `provided.sig === 'gen:'+_saveStoreGeneration` (:2533-2547).
- B-130-4 (burst merge on retry) PASS: `Object.assign(burst, fresh)` + recurse on
  `fresh.sig !== sig` (:2281).
- Skeptic F1 (deferred restoring emit) PASS: `deferRestoringEmit` plumbed :5545/:5609;
  `pendingRestoringEmit` held on the session (:5726-5772); `_firePendingRestoringEmit` fires only
  after capture resolves (:5561/:5629 → :5780-5783); failure closes the session without emit.
- Skeptic F2 (silenced apply facade + stamp gate) PASS: `_saveStoreApplySilenced` counter gates
  `bumpSaveStoreGeneration` (:107/:115); facade wraps apply (:554-559);
  `_sharedStoreCollectCache` stamps only when `_saveStoreGeneration === genAtCollect` (:572) — a
  foreign bump inside the yield windows voids the stamp.
- Skeptic F3 (shelved-discovery moved-set) PASS: `shelvedDiscoveryMoved` marks :329, audit clears
  :1021, query path envelope-tests :1047-1048 (activityRuntime.js).
- W129 spot-check PASS: `clearSectorWarmLatchKeys` retains the wanted/gateWing demote clears; the
  only W130 touch was deleting the dead modular block.

**Golden:** sf-sim.mjs `47a` hash not re-run for this audit lane (code-read + micro-bench only;
the wave's recorded golden `0b33dde18752ca52ee6b6be25ded38ab6e86899dc6444a7e47842a2bb785b2d1`
stands from W130's close).

## Next-lane recommendations

1. F2 first — 4-line fix that makes W130's stated mechanism real and protects every future
   latch-free arm (F1's fix depends on the re-post actually re-pinning).
2. F1 — delete the remaining once-fired latches; introduce one shared `warmArm` re-post helper so
   the pattern doesn't re-grow a third crop of per-site WeakMaps.
3. F3 — fold a `reclaimWarm` consult into the same change so the re-post leg skips the request mint
   when the file is already resident under the owner.
