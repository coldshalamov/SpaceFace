# Wave-126 Audit Report — lane: popin-admission

- **Repo**: coldshalamov/SpaceFace
- **Audited commit**: `48ed75f52` (branch `devin/1791504143-perf-w120`, PR #257 open — waves 120–125)
- **W125 commits under audit**: `2ed5695a1` (popin: bySectorId lane + membership funnel), `9e72466b4` (boot: NG+ under veil, mirror deltas, generation tracking), `b3b142e24` (hitches: shelved-member discovery cells)
- **Hardware**: Windows Server 2022 + SwiftShader. No GPU present; GPU-cost conclusions are hardware-unverified. CPU-side counters only.
- **Mode**: read-only audit. No code written, no PRs, no app launches. Node used only to run `scripts/lib/sectorMembershipGuard.mjs` (reported `{"violations":[]}`).

## Verdict

`saturated: false` — three evidence-supported findings remain in-lane, ranked below. The W125 machinery itself verifies clean; the residual is (a) a roster-pool narrowing edge for divergent-stamp entities and (b) two sector-scoped readers still walking `entityList` that the new lane can now serve.

## Findings (ranked by evidence × materiality)

### F1 — Entities physically arriving with a divergent canonical stamp (`e.homeSectorId` ≠ entry sector) are invisible to the arrival roster — a real popin class the old walk covered for free

**Evidence (MECHANISM_VERIFIED mechanism; UNVERIFIED incidence)**

- `src/render/renderer.js:23256-23274` — `_publishArrivalRosterSteps` now builds the pool as `bySectorId.get(exactSectorId)` + `bySectorId.get(null)`; unready lane falls back to `entityList`.
- `src/render/pipelineAutoFlushPolicy.js:282-296` (and stepped twin :326-341) — the roster predicate is `alive !== false` + `ARRIVAL_TYPES` only. **No sector predicate exists** — pre-W125 the roster covered every typed live entity regardless of stamp, so a physically-present entity with a foreign claim still warmed in.
- `src/core/coreSystem.js:1136-1140` — canonical key = `e.homeSectorId || data.homeSectorId || data.sectorId || null`: `e.homeSectorId` heads the chain, so a stale top-level stamp pins the entity to the old bucket even when `data.sectorId` names the new sector.
- Concrete divergent-mint paths:
  - `src/systems/traffic.js:4907-4911` (and `:4815-4818`, `src/systems/world.js:806-808`, `:2316-2319`) — "set-if-absent" pattern: `if (!e.homeSectorId && !d.homeSectorId) { both = sectorId }`; `if (d.sectorId == null) d.sectorId = sectorId` — a durable actor that already carries a home stamp keeps it through a cross-sector adopt, so `e.homeSectorId` stays origin-sector while `data.sectorId` also may stay origin.
  - `src/world/farActorTable.js:769-773` — rematerialize stamps `ent.homeSectorId = rec.homeSectorId` (and `data.homeSectorId`) then funnel-syncs — if the record's `homeSectorId` is the ORIGIN sector while the actor materializes in the DESTINATION, the entity mints a divergent claim at the exact moment the arrival roster runs. `src/world/worldRecords.js:1224` (`bindEntityToRecord`) same shape.
- Net effect: such an entity sits in bucket(origin) — absent from pool(destination) — while physically crossing in. It warms nothing on entry, then pops when the camera reveals it. This is precisely the "wrong canonical sector" class the wave prompt names.
- Incidence is the open question: whether `farActorTable`/`worldRecords` re-home the record's `homeSectorId` on each sector hop (making the claim converge) determines how large the affected population is. The set-if-absent traffic/world sites guarantee *some* divergence exists whenever a pre-homed durable actor is adopted into a new sector without a full re-home.

**Mechanism**: roster misses → no warm mint / no visibility note → first paint arrives late (visible popin) or the mesh binds at reveal-time.

**Fix sketch** (cheapest first): (a) on rematerialize, stamp `homeSectorId = materialization sector` when the record's stored home differs from where the body actually mints — records mean "home" semantically but the canonical chain reads it as membership; (b) or widen the roster pool: append a rescue pass over entities whose `data.sectorId === exactSectorId` but whose canonical key is foreign (a second small walk over the prior-sector bucket is wrong; needs either a `byDataSectorId` lane or an explicit divergence counter at mint to size F1 first); (c) simplest safety: when `arrivalRosterMiss` accrues, one full-list pass per enter until the divergence population is enumerated.

**Effort**: S-M | **Magic-frame impact**: M-H if divergent population is real (crossing actors are exactly the "something pops in on sector entry" class) | **Risk**: M — re-homing records changes durable identity semantics; pool widening re-adds walk cost.

### F2 — `sorterTargetsForSector` still rebuilds its latch by walking all of `entityList`; the predicate is canonical-expressible

**Evidence (MECHANISM_VERIFIED)**

- `src/systems/precursorMachines.js:1017-1035` — version-latched cache: on lane-version/sector change it walks `for (const e of state.entityList)` filtering `e.homeSectorId !== sectorId` + `type ∈ {wreck,pickup,debris}`.
- Its sibling `machineScanForSector` (:967-994) already rides `bySectorId.get(sectorId)` with an unchanged per-member predicate — the conversion precedent sits 30 lines away.
- Predicate check: `e.homeSectorId === sectorId` is the chain's head — every match lands in bucket `sectorId`, so bucket ⊇ matches; keeping the type/pos predicates per-member preserves verdicts exactly.
- Cost today: O(entityList) once per `(laneVersion, sectorId)` change — and lane versions bump on every membership mutation, so in a churning sector this rebuild refires often.

**Fix sketch**: pool `bySectorId.get(sectorId) || entityList-when-unready` exactly like `machineScanForSector`; keep `alive`/type/pos predicates.

**Effort**: S | **Magic-frame impact**: M (O(members) vs O(all) per rebuild; sectors with heavy membership churn benefit most) | **Risk**: L

### F3 — `tickBolus` walks `entityList` every sim tick with a sector predicate; outside the bolus sector the whole walk is wasted

**Evidence (MECHANISM_VERIFIED)**

- `src/systems/theBolus.js:258-262` — `const list = state.entityList; for … if (ent.homeSectorId !== BOLUS_SECTOR_ID) continue;` (plus `data.bolus`/`alive` predicates).
- `src/systems/world.js:4495` — `tickBolus(this, dt)` runs in the main system tick; in every non-bolus sector this scans the full live list to find nothing.
- Canonical check: matches require `e.homeSectorId === BOLUS_SECTOR_ID` → all matches sit in the bolus bucket; `bySectorId.get(BOLUS_SECTOR_ID)` (≈undefined elsewhere) early-outs the whole scan.

**Fix sketch**: same pool pattern as F2 (`bySectorId.get(BOLUS_SECTOR_ID) || []` when index ready; else the existing list walk).

**Effort**: S | **Magic-frame impact**: L-M (per-tick O(N)→O(0) outside bolus; inside bolus O(members)≈O(N) anyway) | **Risk**: L

### F4 — Enumerated but not canonical-expressible / already-narrowed sector readers (informational)

- `src/systems/world.js:5038` `_resourceWorkPublishedCount` — predicate is `e.homeSectorId === sectorId || data.homeSectorId === sectorId`: the OR matches entities indexed under a *different* canonical key (e.g. `e.homeSectorId=B`, `data.homeSectorId=A` matches sector A's predicate but lives in bucket B). Needs `byDataHomeSectorId` or different semantics — do not convert to `bySectorId` naively. Walks `indexedTypeScan('asteroids')` already (type-narrowed).
- `src/systems/traffic.js:9873-9879` and `src/data/contactHail.js:1267` (`hailAsteroidsOf`) — require `data.sectorId === CERES && data.homeSectorId === CERES` (conjunction on data fields). Expressible (matches land in the CERES bucket) but rides the asteroid lane already; event-driven (hail/help choice), cold — low value.
- `src/render/renderer.js:24717,24859` — sector compare is an early-out inside `this._meshes` (mesh-domain) walks that must visit every mesh row; not entity-domain — `bySectorId` cannot replace them without an id→entity detour per row.
- `src/world/activityRuntime.js:1774-1777`, `src/systems/lawSecurity.js:1173,4949,5186`, `src/systems/aiPorts.js:755-756`, `src/systems/npcJobsRuntime.js:2060-2073` — per-member predicates on single entities or non-sector walks; not sector-scoped readers.

## Regression verification — W125 machinery (all concretely verified)

| Item | Verdict |
|---|---|
| **popin F1 sector lane** (`2ed5695a1`) | VERIFIED — `coreSystem.js`: canonical key `e.homeSectorId \|\| data.homeSectorId \|\| data.sectorId \|\| null` (:1136-1140); append stamps `_indexSectorKey` + `indexSlotMember` + `bumpLaneVersion('sectorMemberships')` (:939-941); `removeEntityIndex` (:1088-1092) and `removeEntitiesFromIndex` sector leg (:1468-1472) unindex + bump; `clearEntityIndex` clears lane + bumps `laneEpoch` (:805-807) and `entityIndexLaneVersion` folds `laneEpoch` into the sum (`livingWorldViews.js:125-135`) so a cleared-index memo can't false-match a stale sum; `repairEntityIndex` forces `ready=false` before rebuild (:745-748). |
| **popin F1 funnel + guard** | VERIFIED — `syncEntitySectorMembership` (:1328-1338) is the only restamp path: unindex→stamp key→index→bump; skips unindexed ids; ran `scripts/lib/sectorMembershipGuard.mjs` → `{"violations":[]}` across the 14-file allowlist (5 scanned dirs; src/render, src/data, src/save, src/ui etc. carry no entity-sector writes — audited by grep, all hits are record/local fields). Bucket consumers (`alienEcology.js:499-519,803-818` impulse sites; `precursorMachines.js:983-994` `machineScanForSector`) use the bucket as pre-filter with unchanged per-member predicates — `e.homeSectorId===sectorId` ⊑ canonical key so semantics match the old walk. |
| **popin F2 roster pool** | VERIFIED — `renderer.js:23256-23274` pools members+null-globals under `index.ready===true && bySectorId instanceof Map`, else falls back to `entityList`; roster predicates unchanged (types only — see F1 for the narrowing consequence). |
| **boot NG+ under veil** | VERIFIED — `main.js:589-597`: `prepareRun` calls `enterLoadingMode` then `await resolveNewGamePlusOverlay` (:866-881) which prefers `prepareNewGamePlusAsync`; `saveSystem.js:2580-2589` prefers `_prepareNewGamePlusSlotAsync` (:2551-2565 stepped async), sync fallback preserved; failure throws `GameStartReadinessError('NEW_GAME_PLUS_UNAVAILABLE')` → discard path — the pre-veil sync prepare regression is closed. |
| **boot mirror deltas** (`9e72466b4`) | VERIFIED — both recovery-promotion sites emit `{[LS_PREFIX+slot]: backupRaw, INDEX_KEY: indexJson}` via `_queueSharedStoreMirror` (`saveSystem.js:4343-4352` sync load, `:4456-4467` loadAsync); worker-encode settle forwards `limit`/`actual` (:3434-3439); `bumpSaveStoreGeneration` tracks `sf.settings.*` writes (:110-121, `installSaveStoreWriteTracking` :123-149). |
| **hitches shelved discovery** (`b3b142e24`) | VERIFIED — `activityRuntime.js:868-1039`: 2048wu cells, `discover+maxPresence` pad, walk = cold build + every-8th-pass audit (:976-1009), stale on `PHYSICS_PARTITION_EPOCH` drift / `indexVersion` drift / null ref (:978-981), partition-0 membership on build-time pos, `walks`/`queries` counters present, per-candidate envelope predicate identical to the old walk. |
| **W124 spot-check** (W125 touched `assetResidency.js`) | VERIFIED — `enforcePlanMemo` composes correctly: consulted at :2216-2226 (sync) and :2383-2393 (stepped, validated on first `.next()`); every plan input is funneled — register (:362), owner index (:714) / unindex (:743) → `residencyMutationSeq`; pending-request transitions (:100,:113) → `pendingRequestSeq`; byte ledgers + `governorCapBytes` compared verbatim; `evictIfUnowned` (:1620-1624) bumps via unindex. Sole in-place metadata mutation `retain()` :383-396 flips `decodeWarm→decodeServed` + `lastWarmClaimAtMs` — fields no governor predicate reads (`resourceGovernor.js:182-271` reads roles/tiers/player/interaction/gameplayShell/activeRequest only); `lastWarmClaimAtMs` feeds only the soft-budget sort (:860), not the enforce plan. `mirrorPatch`/frame-tail quarantine untouched by W125 (not re-verified per prompt). |

## Lane-hunt summary

- **(a) sector readers on O(entityList)**: two canonical-expressible walks remain → F2, F3. One OR-predicate walk is deliberately NOT expressible → F4 (documented). Asteroid-lane and mesh-domain sites enumerated in F4.
- **(b) divergent claims vs roster**: confirmed as a mechanism — roster has no sector predicate, pool narrowed to exact+null, `e.homeSectorId`-headed canonical chain + keep-if-present restamps + record-minted stamps create the invisible-to-roster class → F1. Guard coverage of unscanned dirs audited: clean.
- **(c) warm-mint coverage gaps**: no structural gap found — every warm/boundary retain path passes `sectorId` (`assetResidency.js:1746,1800,1864`; `partsLibrary.js:10535`; `renderPackageLoader.js:178`; `assetLoader.js:855`); `render-package-cache` retains are deliberately sectorless (they're the `sectorlessOwnerRetains` ledger's intended members — cache pins, not sector members). The ARRIVAL_TYPES ceiling (ship/station/asteroid/wreck/payload/beacon) is the designed coverage boundary. The real coverage gap is F1's divergent-stamp population.
- **(d) stranded rotations past a second crossing**: verified clean — `rotateSectorDeferred` seq-guards supersede (:1857-1885), `effectiveCurrentSectorId` returns newest REQUESTED so B→A reversals aren't dropped (:1827-1831), `onAbandoned` covers pre-first-next kills (:1899-1905), the fuse chain cascades `onAbandoned` to both legs (renderer.js:19576-19584, 19821-19833), abandon sites call `.return()` AND `onAbandoned` (:19364-19367), the drain loop re-reads `_sectorExitCleanupIter` per pass so mid-drain fuses are picked up (:3217-3270), and context repin consumes all queued seqs (:1924-1926).

## Explicitly not re-reported

Adjudicated KEEP/DOCUMENTED/REJECTED/GATED items from `design/perf/PERF_W4_CLOSURE_2026-09-29.md` and `HILLCLIMB-LOG.md` were read and are excluded per the audit contract (incl. boot F1 saveAsync slot txn, optic spatial-hash query, F4/F5/F9 tick-paced emit slicing, T→F collides over-inclusion caveat).
