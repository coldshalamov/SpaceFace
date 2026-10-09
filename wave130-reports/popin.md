# wave-130 audit — popin-admission

audit_sha: `c19a717f86bf46731719a1904eee1c5e103cc8e8` (origin/devin/1791504143-perf-w120)
lane: popin-admission
saturated: false

## Findings

### F1 — Spawn-request and intervention warm seen-latches survive demote and retract; stranding the cohort on re-entry (MECHANISM_VERIFIED)

**Evidence**
- `src/render/renderer.js:6820` — `warmQueuedSpawnRequestDecodes` gates on `owner._spawnRequestWarmSeen` (session-lifetime Set, key `${sectorId}:${archetypes.join(',')}`); once inserted it is never deleted. Only the mint site exists in the file.
- `src/render/renderer.js:6842` — `warmPendingInterventionDecodes` gates on `owner._interventionWarmSeen` (bare `sectorId` key); likewise never cleared. Its warm posts `wreckVisualExemplarSpecs` + `warmSeededModularPool(owner, sectorId, 'intervention-warm:modular')` — the ~43-file modular kit covering the intervention site ships.
- `src/render/renderer.js:6088-6105` — W129's `clearSectorWarmLatchKeys(owner, sectorId)` drops `_wantedTierWarmSectors`, `_modularPoolWarmSectors` (`${sectorId}\0` prefix), `_gateWingWarmKeys` (`${sectorId}|` prefix) — but not these two Sets.
- The cohorts are durable world state: `world.pendingSpawns[sectorId]` (`world.js:5399`) survives demote (queue stays resident; `_flushPendingSpawns` at `world.js:1059` drains on next enter) AND save/load (`world.js:7052/7115`). `state.pendingInterventions` rows persist until `intervention:resolved`; sector:enter materializes them via `_materializePendings` (intervention.js:63-80).
- The warms are `ownerlessWarm` decodes (`assetLoader.js:713-720` → `{softLease:true, decodeWarm:true}`): soft leases evict under byte pressure (`assetResidency.js:542` `releaseOwner` → `evictIfUnowned`), and `_predictedSectorWarm`/`_routeDeepSectorWarm` owners release on retract/absorb (renderer.js:6765, 6915+) so the files go evictable between visits.
- Coverage on re-approach: `liveSectorFullExtrasStubs` (`saveEnvelopeSectorWarm.js:836`+, roster push at ~1342) re-enumerates `queuedSpawnRequestRoster` unconditionally per `(sectorId, enterSerial)` — spawn-request hulls DO get re-warmed via `warmLiveSectorFullExtras` arms (chargeStart/membershipCandidate/death-recovery, renderer.js:19256-19308) when those arms fire. The intervention cohort has no equivalent cover — `warmPendingInterventionDecodes` is the only lane warming the wreck exemplar table and the intervention modular pool, and the seen latch suppresses it permanently after first fire.
- Stale comment concealing the gap: `liveEnterSpawnerStubs` claims intervention guard/jumper "mount the procedural buildShipMesh path — no authored file to warm" (saveEnvelopeSectorWarm.js:~836). False for the authored-upgrade leg: `_spawnGuard`/`_spawnJumper` stamp only `data.ai.archetype` (no defId/lootTableId/silhouette/assetRef/trafficRole — intervention.js), so `wholeShipVisualForEntity` (partsLibrary.js:2116) falls through the named maps and `authoredPreloadPlanForEntity` resolves the seeded modular pick (partsLibrary.js:1175+) — exactly the files `warmSeededModularPool` decodes.

**Mechanism** — Player leaves a sector with queued spawn requests or an unresolved intervention site; predicted/route warm retracts, soft-lease files evict. On re-entry (or approach→retract→re-approach), `_interventionWarmSeen` refuses to re-post: the site materializes inside `sector:enter` with cold files — wreck residue picks and guard/jumper modular ships decode at mount instead of warm, so the presented frame holds the sanctioned procedural stand-in / marker while ~40+ files decode. Same shape for `_spawnRequestWarmSeen` when `warmLiveSectorFullExtras` wasn't armed for that return path (plain re-entry with no charge phase). Exactly the demote→re-enter skip-work class W129 F1 fixed for the other three sector-keyed latches.

**Fix sketch** — Delete both seen-latches (preferred): every arm site is already file-level deduped, so re-posting per residency poll is the cheap re-warm pattern `warmEncounterPendingDecode` already uses via `dueAt` refresh. Alternative: extend `clearSectorWarmLatchKeys` to delete the `_interventionWarmSeen` sector key and `${sectorId}:`-prefixed `_spawnRequestWarmSeen` keys — but that only fixes the demote path, not retract→re-approach, so deletion is the honest fix. Correct the stale `liveEnterSpawnerStubs` comment either way.

**Effort** S — **Impact** M (narrow cohort: sectors carrying pendingSpawns/pendingInterventions with evicted warms; the intervention modular kit is the material piece) — **Risk** L (extra posts are dedupe-capped no-ops when files are resident).

### F2 — `liveEnterSpawnerStubs` stale "procedural" comment conceals the modular-kit coverage gap (MECHANISM_VERIFIED as doc defect; folded into F1's fix)

The comment asserts no authored file exists for intervention spawns; `authoredPreloadPlanForEntity`'s seeded modular branch contradicts it. Either extend the charge-time extras warm to the intervention modular pick, or let F1's latch deletion restore the residency-poll warm. Not double-counted in scoring.

## Regression verification (W129 machinery, concrete)

- **popin F1 — PASS.** `world:residency` emit (world.js:1265,1308,2202) carries `sectors` = all `Object.keys(state.world.residentSectors)`; demoted sectors persist at `RECORD_ONLY` so every emit enumerates them. Listener (renderer.js:18524-18544) calls `clearSectorWarmLatchKeys` for `tier !== 'FULL'`; key prefixes verified byte-exact against mint sites (bare id / `\0` / `|`). One class of sector-keyed latch survives — F1 above.
- **popin F2 — PASS.** Same emit clears `_sessionLiveSectorCookedId` + `_sessionRecookKeepGpu` + `state.render.sessionLiveSectorCookedId` only for the demoted id; the 13569 `recook` gate then takes the full cook on re-materialization (resumeAutoFlush + requestDecodeRunwayPromote + census), and the 13321 keep-GPU recook skip can no longer fire for a demoted sector.
- **boot F1 — PASS.** `saveSystem.js` `_slotStoreSignatureAsync` (added ~2156): yields every 16 keys via `_restoreFrameYield`, brackets on `_saveStoreGeneration` (redo on tear, 3 attempts then sync `_slotStoreSignature` fallback, `sig-error:N` on throw so nothing stale caches). `_slotIndexWithFallbackAsync` (2240) + mid-ride re-sign (2250) ride it; sync callers (2196 `_slotIndexWithFallback`, title/deleteSlot paths) still use the sync twin.
- **boot F2 — PASS.** `_scanStoredSlotsAsync`/`_scanRecoverySlotsAsync` collect `{slot, raw}` untrusted entries during the yielded walk, then `Promise.all` dispatch in slices of 4 with identical `out[slot]` write legs (env→`slotCardFromEnvelopeData`, else peek→`slotMetaFromGzipEnvelope`), yielding between slices.
- **boot F3 — PASS.** `_newerUnplayableSkipAsync` (2890) + `loadAsync` (4626/4650) consult `burst.raws` only under `sig === 'gen:' + _saveStoreGeneration` with `has`/`get`/null semantics identical to getItem; generation miss falls back to honest getItem (loadAsync keeps the try/catch→`save:error` emit on that leg).
- **Prior-wave spot-check:** W129 commits touched only renderer.js + saveSystem.js — no W126-W128 machinery in the diff; skipped per prompt.

## Lane sweep notes (no finding)

- Ground (a) remaining enumeration: `clearDecodeRunwayDedupe` (6653) is called on all three sector-enter paths (19793/19838/19970) — packaged/hulk/prefetch Sets clear per enter, supersession covered. `LIVE_ENTER_SPAWNER_STUBS_MEMO` WeakMap keyed `(sectorId, enterSerial)` self-invalidates. `_sectorHandoff*` stamps are epoch-guarded and rewritten per seam. `_holdExemptPersistentSkips` reset per seam. `_claimDefenseRosters` is encounterId-keyed and released on encounter:resolved. `_appearanceReplacements` entity-keyed, cancelled on destroyed/save:restoring. `_waveHullDecodePending` crucible-scoped, cleared on run:ended. Per-sector pacing wallets: none found (decodeTaskBudget is global).
- Ground (b) re-cook parity: with the cooked stamp cleared, re-materialization takes `recook=false` at 13569 → identical census/flush/promote path as first entry; file-level decode dedupe makes preserved-warm files cheap rather than skipped — no over-pay. Epoch-stable RNG re-roll reproduces the same cohort — no under-pay.
- Ground (c): `deferredEnterMaterializers` FIFO drains via `drainDeferredEnterSlice(state, sector, 4, …)` riding a maintained queue with epoch-drop via `dropDeadDeferredEnterEntries`; `queuedSpawnRequestRoster` iterates the whole pendingSpawns queue but only inside the (enterSerial)-memoized extras census. Admission queues (gpuResidencyAdmissions, meshBuildQueue head, `admitNextUpgradeJob` serial cap) ride maintained queues. No re-walk-to-pick-cohort drain found.
- Ground (d): `_rebuildBridges` slots key entity id AND stamp `epoch = enterSerial` (25742); `settleRebuildBridges` releases on drawable/cap/epoch-death; entity ids recycle but `authoredUpgradePromise`/`_decodeRunwayPrefetchIds` are cleared on enter via `clearDecodeRunwayDedupe` or die with the entity. No verdict-stranding mechanism found.

## Hardware-unverified findings

None — the F1 mechanism is sim/render-queue observable; on real hardware the visible symptom is a procedural stand-in persisting ~a decode window where the authored modular ship/wreck should be.
