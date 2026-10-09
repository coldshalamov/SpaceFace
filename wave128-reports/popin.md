# wave128 popin-admission audit — 2026-10-09 · headSha 165636c357719efbc9065106b40bdfffc16f8b12

lane: popin-admission (sector-scoped entityList consumers, warm-mint cadence, deferred-admission drains, stale-bucket safety) · branch `devin/1791504143-perf-w120` · read-only audit of HEAD (waves 120–127 on PR #257).

`saturated: false` — two small but real expressible conversions remain: one in-lane (sector-prewarm census quartet, canonical claim chain, 4–5 full-list walks per crossing) and one adjacent render-path walk (uvulaHold, id-exact, per-frame while tethered to the uvula). Everything else enumerated is either already pooled, rate-limited, cold, or non-expressible under the canonical claim chain.

## Contract read

- Read `design/perf/PERF_W4_CLOSURE_2026-09-29.md`, `design/perf/HILLCLIMB-LOG.md` (through W127), and prior lane reports `wave126-reports/popin.md` / `wave127-reports/popin.md` before hunting. Adjudicated items below are not re-reported.
- Golden sim hash `0b33dde18752ca52…` unchanged by audit (no code touched). Evidence levels tagged per finding; no GPU numbers are load-bearing (SwiftShader box).
- Canonical claim chain: `entitySectorId(entity)` = `e.homeSectorId || data.homeSectorId || data.sectorId || null` (renderer.js:1267-1270); index key raw, unstringified (coreSystem.js:1114-1117 `entitySectorIndexKey`); all restamps funnel through `syncEntitySectorMembership` (coreSystem.js:1310-1314).

## Findings

### F1 — Incoming-sector prewarm arm rides 4–5 O(entityList) collects per crossing (MECHANISM_VERIFIED)

**Evidence.** `src/render/renderer.js`:
- `:18757-18764` `sectorPrewarmRequests(sectorId)` → `authoredPrewarmRequestsForEntities(state.entityList, {sectorId, playerId, playerPos, viewportHeight})` — full-list filter; internally the per-entity check is the canonical chain `entitySectorId(entity) === exactSectorId` (partsLibrary.js:1393-1397) plus per-entity plan derivation. Final `requests.sort` is by `rankByKey` (min deadlineRank, url/slot tiebreak) — order-insensitive, so a bucket-fed member set yields the identical request set.
- `:8615-8630` `validateSectorPrewarmPopulationCoverage(record, options)` — `for (const entity of options.entityList || [])` applying `options.isEligible(entity)`; `options.entityList` = `state.entityList` via `sectorPrewarmCoverageOptions` (:18777-18789). `isEligible` = `sectorPrewarmEntityIsEligible` (:18771-18776): `alive !== false && id !== playerId && String(entitySectorId(entity) || '') === record.sectorId && entityHasOwnSectorPrewarmPlan(entity, record.sectorId, playerId)` — canonical claim chain, bucket-expressible. Fail-closed semantics preserved under pooling: `entities?.get(id)` authority check still runs per member, and a Set cannot duplicate members (the "appeared more than once" check becomes vacuous, never weaker).
- `:18875` `stageSectorPrewarmBoundaries(record, entities = state.entityList)` — same eligibility predicate, collects `staged[]` then distance-sorts — member-set identical under pooling, order normalized by the sort.
- `refreshSectorPrewarmPopulation` (:19121-19127) = requests collect + stage; `beginIncomingSectorPrewarm` (:19129+) seeds both; `validateCurrentSectorPrewarmPopulation` (:18792-18804) re-derives requests at publish certify.

**Cadence.** Per sector crossing: arm at `jump:chargeStart` / `jump:unfiledConfirmed` / `player:death` (recoverable) / enter-publish mismatch re-arm (:19791-19800) → ~1 census + ~1 stage; `jump:arrive` dirty-refresh (:19349) → requests + stage again; publish certification → requests + coverage census. ≈4–5 full-list walks per crossing, all on the charge/entry path where frames matter most.

**Mechanism.** All three consumers filter on `String(entitySectorId(e)) === record.sectorId` — exactly the key `bySectorId` maintains. Pooling `bySectorId.get(record.sectorId) || []` (under the standard 4-part guard `__spacefaceEntityIndexV1 === true && ready === true && bySectorId instanceof Map`, entityList fallback) makes the scan prefix O(bucket) instead of O(entityList); per-member predicates unchanged.

**Fix sketch.** One helper `sectorPrewarmEligiblePool(record)` returning the guarded bucket-or-list; feed it at :18759 (`authoredPrewarmRequestsForEntities` arg), :18780 (`entityList:` in coverage options), and :18875 default/callers. Keep single-entity callers (:19266, :19270 `[entity]`) as-is.

**Effort:** S–M (one helper + 4 call sites + the String-normalization caveat below). **Impact:** M (per crossing, on the entry path; ~4–5 walks × entityList; absolute µs small but this is the lane's residual class). **Risk:** L–M — bucket key is raw while the compare String-normalizes; numeric `homeSectorId` vs string `record.sectorId` would miss the bucket. Prior conversions accepted this edge (sector ids are strings in practice); keep the entityList fallback so a key-type mismatch degrades to today, not to a miss.

### F2 — `bolusCable.uvulaHold` linear entityList scan inside per-frame tether-cable path (MECHANISM_VERIFIED, magnitude measured)

**Evidence.** `src/render/bolusCable.js:8-26`: `uvulaHold(state)` iterates `combat.attachments.byId` (small) then inner-scans `state.entityList` for `ent.id === att.targetId && ent.data.bolus && role === 'uvula'`. Called from `bolusCableStyle` → `src/render/vfx.js:9856` inside the per-frame tether-cable draw, gated `live && !remote && anchorEnt.data?.bolus?.role === 'uvula'` — so it runs **every frame while the player is tethered to the uvula** (bolus boss fight).

**Mechanism.** The inner walk exists only to resolve `att.targetId → entity`. `state.entities` is the authoritative live map — `validateSectorPrewarmPopulationCoverage` itself asserts `options.entities.get(entity.id) === entity`. `state.entities.get(att.targetId)` is the same resolution in O(1).

**Magnitude (measured, node micro-bench, N=600 entityList).** list-walk `uvulaHold` ≈ **1.68µs/call** vs map `entities.get` ≈ **0.028µs/call** — ~60×; ~1.65µs/frame saved during the uvula-tether window. Same magnitude class as the landed W127 F1 freeze-card conversion (which was O(entityList) per frame ungated inside the sector; this one is gated to the tether window).

**Fix sketch.** Replace the inner `for` over `list` with `const ent = state.entities && state.entities.get(att.targetId);` then apply the same `ent.data.bolus && role === 'uvula'` checks; first-match semantics preserved (attachments iterated in identical order).

**Effort:** S (few lines). **Impact:** L–M (per-frame during the boss-tether window only; ~µs-scale). **Risk:** L — `entities` is authoritative; no ordering/aliasing change. Scope note: id-exact (not sector-keyed) — adjacent to the lane's letter but inside the render-path census mandate; flagged rather than dropped.

### Informational — `warmStationPatrolDecode` (renderer.js:6080-6120)

`entities.find` per pending item with a 3-way OR `(e.id|String(e.id)===stationId || e.stationId===stationId || e.data.stationId===stationId)` — claims on `stationId` fields, not the home-sector chain; `byStationId` holds only the first indexed holder (coreSystem.js:965,1176-1180), so pooling would silently drop the OR's other branches. WeakMap `warmedAt` dedupes per item — bounded, decaying. Not expressible; not a finding.

## Regression verification — W127 landed machinery (at 165636c35)

| W127 item | Status | Evidence |
|---|---|---|
| bolus freeze-card sector bucket (`syncFreezeCards`) | VERIFIED | bolusView.js:196-201 guarded bucket pool `bySectorId.get(BOLUS_SECTOR_ID) || []` + entityList fallback; FREEZE-role/pos/alive/|vel|≤0.5 predicates per member; organs always claim bolus sector via theBolus.js:51-102 (`sector.id === BOLUS_SECTOR_ID` gate, `homeSectorId: sector.id`, `_stampHomeSector`). |
| keepalive-gated store encoder | VERIFIED | sharedPlayerStore.js:~421 `if (keepalive === true) { try { TextEncoder().encode(body).byteLength } catch { body.length } }` — byteLength only computed on keepalive pushes. |
| pre-push restore yield | VERIFIED | saveSystem.js `_syncSharedPlayerStore`: `if (delta != null) await this._restoreFrameYield();` before `pushSharedPlayerStore(delta)`; `save:store-synced` emits in `finally` on both outcomes. |
| `applySharedStoreKeysChunked` (W126 machinery — in scope: W127 touched sharedPlayerStore.js) | VERIFIED | sharedPlayerStore.js:313-323 intact — `APPLY_SHARED_STORE_BATCH = 8`, `yieldQueue` every 8 keys, called from `_syncSharedPlayerStore` with `yieldQueue: () => this._restoreFrameYield()`. |
| W126 roster pool / sorter / bolus buckets | N/A per prompt | W127 commits touched only bolusView.js, saveSystem.js, sharedPlayerStore.js — roster pool, sorter, bolus tick buckets untouched; spot-check not required. |

Sector-membership guard run against materialized tree at HEAD: **`{"violations":[]}`** — all restamps inside scanned dirs funnel through `syncEntitySectorMembership`; manual sweep of unscanned dirs (render/data/save/audio/ui/onboarding/characters/observability/main.js) found zero entity-shaped sector writes.

## Lane-hunt summary

**(a) Per-frame/per-enter sector-scoped entityList walks, expressibility check.** ~180 entityList consumers enumerated. Expressible-and-unconverted: F1's three prewarm census sites (the last canonical-chain walks on the admission path). Non-expressible enumerations (predicate strictly broader than the claim chain or needs entityList positions): `_captureSectorDurableRecords` disjunct `home === s || data.sectorId === s` admits divergent `data.sectorId` claims (broader than canonical → bucket would drop them); `_despawnEntitiesForSector`/`_despawnEntityIds`/`_destroyEntitiesAtIndices` need entityList *indices* for highest-first swap-pop ordering — the index has no position map; `warmStationPatrolDecode` (3-way stationId OR); `findLiveEntityForRecord` (recordId-keyed, not sector-scoped).

**(b) Warm-mint coverage.** Verified closed: `entity:spawned` single-entity appends feed the pending prewarm record directly (:19266-19270); `sector:membershipCandidate` arms full-extras stubs during the dwell; `includeSpawnableArchetypes` covers ambient hull+packaged plans; `jump:unfiledConfirmed` closes the post-confirm gap for unfiled jumps; `player:death` recoverable arms the recovery dock during the modal dwell. No late-staged entity class without a cadence.

**(c) Deferred-admission drains.** Newcomer census (:25290-25350) memoized on `_viewSyncSeq`/`firstFlightIds` with snapshot + tail-rescan (maintained set, yields every 1024 under paced debit); mesh-build queue rides head index; deferred enter materializers FIFO+epoch; `rotateSectorDeferred`/`onAbandoned` verified clean at W127 (unchanged); hold-exempt degrade walk bounded (≤3 faults/epoch, one forced-wallet sync). No drain re-walks entityList to select the next batch.

**(d) Stale-bucket consumers after unstamped claim flips.** Guard clean at HEAD (`{"violations":[]}`); every bucket consumer predicate-filters per member, so an unstamped divergence can't be served (a foreign-stamped entity simply isn't in the bucket — same as a walk that filters on the canonical chain, per the W127 organ-restamp caveat). The prewarm eligibility predicate reads the canonical chain itself, so F1's pooling is verdict-identical there too.

## Explicitly not re-reported

Per HILLCLIMB-LOG adjudication (KEEP/DOCUMENTED/REJECTED/GATED, no new mechanism evidence): `_resourceWorkPublishedCount` OR-predicate; hail conjunction walks; mesh-domain compares; bandRadio era-scoped scan; ceresCausalActor; opticField spent scan; ambientPredation entityById fallback; sableVenn/tallyThree record lookups; latchNine walk; readiness census; authoredCriticalVisualReadiness (rate-limited 1 scan/4 frames after 30 at main.js:1292-1305); shelf-verb radius checks (onboarding.js:840-862 + verbSpeech.js:99-127 — non-sector radius scans, out of lane); `forEachLivingWorldActor` record-capture sweeps.

## Verdict

`saturated: false` — F1 (in-lane, canonical-expressible census quartet on the admission path) and F2 (adjacent render-path O(1) conversion, measured) are the remaining expressible work. Both are S-effort, low-risk, verdict-identical under pooling. The census class is otherwise exhausted: every other sector-scoped reader is pooled, rate-limited, cold, or provably non-expressible under the claim chain.
