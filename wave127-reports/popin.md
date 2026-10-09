# wave127 popin-admission audit — 2026-10-09 · headSha 64b539976

lane: popin (sector-entry warm mints, claim-chain staleness, stranded rotations)
branch: devin/1791504143-perf-w120 · repo root C:/Users/Administrator/repos/SpaceFace
scope: src/render, src/systems, src/core, src/world, src/save, src/ai, src/data (encounters)

- Contract read: PERF_W4_CLOSURE adjudications + HILLCLIMB-LOG recent decisions + the sector-claim predicate requirements skimmed and applied; documented/KEEP items left out of the candidate list per the audit contract.
- `sectorMembershipGuard` → `{"violations":[]}` (14-file allowlist; src/render, src/data, src/save carry no entity-sector writes — all hits are record/local fields).
- Indexed-key state: `entityIndex.__spacefaceEntityIndexV1` with byType lanes (station, planets, asteroids, npcs, ships, radarContacts) + `bySectorId` (canonical claim `e.homeSectorId || data.homeSectorId || data.sectorId`), `byWorldRecordId`, `byAuthoredId`, `byId`, `byName`, plus `idToViewId`/`getView` keyed mesh lanes. Lane versions bump on every membership mutation; `laneEpoch` folds into `entityIndexLaneVersion` so a cleared-index memo can't false-match a stale sum.

## Findings (telemetry-first; evidence live-verified this session)

### F1 — `syncFreezeCards` walks `entityList` every presented frame inside the bolus sector; every match sits in `bySectorId.get(BOLUS_SECTOR_ID)`

**Evidence (MECHANISM_VERIFIED)**

- `src/render/bolusView.js:190-202` — `const list = state.entityList || []; for (…)` with no early break; the predicate (`ent.data.bolus && FREEZE.has(role) && pos && alive !== false && |vel| ≤ 0.5`) scans the full live list every call to build `want[]`.
- `src/render/bolusView.js:23-37,99` — `syncBolusView` early-outs when `currentSectorId !== BOLUS_SECTOR_ID` (lights to 0 and return), so the walk only runs in-sector — but then on every call.
- `src/render/renderer.js:28168` — `tryPresentedCall(this, 'bolus-view', () => syncBolusView(this))` runs on the presented-frame tail, alongside `marrow-cone`/`backdrop` — i.e. per rendered frame, a hotter cadence than W126-F3's per-tick walk.
- Canonical check: `data.bolus` is minted only at `src/systems/theBolus.js:51-92` — mint path gated on `sector.id === BOLUS_SECTOR_ID` (:51), `homeSectorId: sector.id` (:79), `world._stampHomeSector(ent, sector.id)` (:102). Canonical head = BOLUS_SECTOR_ID for every `data.bolus` carrier → all matches land in `bySectorId.get(BOLUS_SECTOR_ID)`. `tickBolus`'s own predicate asserts the same invariant (`theBolus.js:270`).
- What falls out under bucketing: a `data.bolus` entity restamped to another sector (cross-sector adopt) would leave the bucket — the identical caveat the landed F3 conversion accepted for the same match set; bolus organs are sector fixtures and never re-home.
- Ordering: `want[]` order = pool order, so the card-slot assignment among same-role members may permute vs entityList order. Card identity/positions are per-entity (positions read off `ent.pos`, the dedupe key joins `ent.id`), so this is cosmetic only.
- Fallback: `bySectorId.get(BOLUS_SECTOR_ID) || []` under the `__spacefaceEntityIndexV1 && ready && bySectorId instanceof Map` guard, entityList when unready — preserves cold-boot verdicts.
- Cost today: O(global entityList) per presented frame while inside the bolus sector — and the list is sim-wide, so off-sector actors (far freighters, other sectors' fauna) inflate N.

**Fix sketch**: pool `bySectorId.get(BOLUS_SECTOR_ID)` exactly like the landed W126-F3 conversion in the same subsystem (`theBolus.js:262-266`); keep all per-member predicates including the speed gate.

**Effort**: S | **Magic-frame impact**: M (in-sector per-frame O(N)→O(bolus members); the bolus sector is a boss arena fought under load, so the walk runs when frames matter) | **Risk**: L

### F2 — Enumerated but not canonical-expressible / already-narrowed / cold readers (informational)

- `src/render/bandRadio.js:87-102` `watchtowerBucketsList` — era-scoped claiming side-channel (advancement-restricted broadcast band): no index bucket expresses "band-admission member"; its fetch path iterates in place with a dedupe (correct by design; the index rebuild at :144-154 is the stale-answer fix). Do not convert.
- `src/audio/audioSystem.js:4763-4795` `_ceresCausalActorPosition` — predicate is `data.activityActorSlotId === slotId`, not sector: freighter-ledger and `indexedWorldRecordEntity` lanes run first; the residual entityList walk covers activity-adopted strays (documented in-file). Event-driven (work-cue), cold.
- `src/combat/opticField.js:249-256` `collectOpticSpentIds` — `data.opticMaterial === 'spent'` scan, once per sector entry/save load to rebuild the watch. "Physically present" can't be bucket-expressed — same class as the roster census that deliberately walks the whole list.
- `src/ai/ambientPredation.js:1258-1265` `entityById` — `entities.get` fast path; the list scan is a defensive fallback when the map is missing.
- `src/data/sableVenn.js:12,20`, `src/data/tallyThree.js:26` — `worldRecordId`/station-id lookups; event-driven helpers, cold.
- `src/render/renderer.js:13915,14029,16511` — first-flight / sector-entry census walks (asteroid-type and render-relevance predicates, not sector-scoped; once per entry by design).
- `src/core/dockIntent.js:11`, `src/audio/audioSystem.js:510,1114`, `src/render/renderer.js:6322` — already on typed index lanes (`entityIndex.stations`/`.ships`) with entityList fallback.

## Regression verification — W126 machinery (all concretely verified)

| Item | Verdict |
|---|---|
| **W126-F1 roster pool restore** (`3f98caa1a`) | VERIFIED — `renderer.js:23256-23274` `_publishArrivalRosterSteps` pools `state.entityList` directly; the in-file comment documents why bucketing can't express "physically present" (divergent-stamped entrants went invisible to the warm mint). Stamps land only at completion (`:23298-23309`); the paced drain re-reads `_arrivalRosterIter` per pass and flags `_arrivalReservePending` on fault so the capacity reserve can't be stranded (`:3281-3313`). |
| **W126-F2 machineScanForSector** (`3f98caa1a`) | VERIFIED — `precursorMachines.js:982-992` pools `index.bySectorId.get(sectorId)` under the `__spacefaceEntityIndexV1 && ready && bySectorId instanceof Map` guard, `state.entityList` when unready; per-member `e.homeSectorId === sectorId` predicate unchanged so verdicts match the old walk. A missing bucket (no indexed members) yields `pool = undefined` → walk skipped → empty, correct. |
| **W126-F3 tickBolus** (`3f98caa1a`) | VERIFIED — `theBolus.js:262-266` pools `bySectorId.get(BOLUS_SECTOR_ID) \|\| []` under the same guard, entityList fallback; the per-member predicate (:269-270) is unchanged. Outside the bolus sector the bucket is absent → O(0) per tick — the stated goal. |
| **W125 claim-chain core** (unaffected by W126) | VERIFIED — `syncEntitySectorMembership` funnel and the `bumpLaneVersion` stamps remain in `coreSystem.js` (:833-896 sampled: collidables/freighters/machines/flavorCarriers/worldSiteRoots/worldRecordIds/worldSites/capitalBossCast all bump on membership writes); guard re-run this session → `{"violations":[]}`. |

## Lane-hunt summary

- **(a) sector readers on O(entityList)**: one canonical-expressible walk remains → F1 (`bolusView.syncFreezeCards`, per presented frame in-sector). W126's F4 list re-verified: `_resourceWorkPublishedCount` (OR-predicate on `data.homeSectorId`, type-narrowed already), the hail paths (data-conjunction predicate, event-driven cold), and the mesh-domain seam compares (`renderer.js` `_meshes` walks) all still non-expressible or cold → F2 (documented, unchanged).
- **(b) W126-F4 non-expressible readers — per-tick/per-enter custom lane?** No. Re-verified each is cold: `_resourceWorkPublishedCount` runs on the regrowth/publish path, hail helpers on hail/help-choice events, mesh-domain compares inside already-mandatory mesh walks. None is a per-tick or per-enter hot path, so a bespoke lane would pay an index build + membership-churn bookkeeping for walks that never run when frames matter. Remaining work isn't worth one — the correct tier is "verified narrow, documented".
- **(c) warm-mint coverage gaps**: none found — the roster census pools the whole live list again (W126-F1), `ARRIVAL_TYPES` (ship/station/asteroid/wreck/payload/beacon) is the designed boundary, and durable actors outside it ride their own lanes: traffic freighters spawn `type: 'ship'` (roster-covered), drones and the save-restore promote cohort ride `liveSectorFullExtrasStubs`/`saveEnvelopeFullExtrasStubs` (`renderer.js:6587-6591`, invoked at :19204/:19217/:19237/:19248 on sector entry/return), `sectorlessOwnerRetains` is the intended home for render-package cache pins. No entity type with authored assets on stage at entry lacks a coverage lane.
- **(d) queues/iterators stranding a queued rotation past a second crossing**: verified clean — `rotateSectorDeferred` seq-guards supersede (`assetResidency.js:1857-1885`), `effectiveCurrentSectorId` returns the newest REQUESTED target so B→A reversals aren't dropped (:1827-1831), `onAbandoned` finalizes rotate markers for mints killed before their first `.next()` (:1899-1905), fused iterators forward `onAbandoned` to both legs (renderer.js:19574-19586, 19821-19833, 19428-19431), abandon sites call `.return()` AND `onAbandoned` (:19364-19367), the drain loop re-reads `_sectorExitCleanupIter` per pass so mid-drain fuses are picked up (:3215-3275), and context repin consumes every queued seq (:1924-1926). A dropped mint loses only its warm retains — the rotation pointer itself repoints via `onAbandoned`, so no stranded rotation exists.

## Verdict

`saturated: false` — one expressible conversion candidate remains (F1, S-effort, same shape as the landed W126-F3). The rest of the enumerable popin surface is verified narrow or documented non-expressible; if F1 lands next wave, the lane is done absent new readers.

## Explicitly not re-reported

Adjudicated KEEP/DOCUMENTED/REJECTED/GATED items from `design/perf/PERF_W4_CLOSURE_2026-09-29.md` and `HILLCLIMB-LOG.md` were read and are excluded per the audit contract (incl. boot F1 saveAsync slot txn, optic spatial-hash query, F4/F5/F9 tick-paced emit slicing, T→F collides over-inclusion caveat).
