# PQ-020 Ceres Activity-Pocket Topology

> **NON-AUTHORITATIVE · PLANNING-ONLY · NOT INTEGRATED**
>
> Historical audit/implementation plan for `SF-PORT-03`. No runtime behavior changed. Valid state:
> `returned/planning_complete` only.

| Field | Value |
|---|---|
| Base branch / commit | `codex/delegation-base-20260723` / `8f1c630f5ebf26f209052b8164f3cdf024ffd06f` |
| Result branch | `agent/chatgpt-pq020-topology-20260723` |
| Permitted path | `docs/handoffs/chatgpt-portfolio-20260723/PQ020_CERES_ACTIVITY_POCKET_TOPOLOGY.md` |
| Runtime status | `NOT IMPLEMENTED · NOT INTEGRATED` |

Claims are marked **VERIFIED**, **INFERENCE**, **PROPOSAL**, **UNKNOWN/BLOCKER**, or **SUPPLIED
CONSTRAINT**. The only current PQ-017 statement used is the supplied fact that it is in progress and
not yet integrated.

## 1. Executive decision

**PROPOSAL:** use four sector-local pockets, reusing existing authorities:

```text
CIVIC <-> PRODUCTION <-> TRANSIT/CHECKPOINT
              |
              +------> CATHEDRAL GRAVEYARD
```

- **Civic:** preserve Ceres Refinery.
- **Production:** tighten the existing mining zone around Belt Outpost, `f_ceres_1`, the dense-rock
  hazard, and the Abandoned Driller.
- **Transit:** add one no-presence checkpoint zone at the midpoint of the existing Helios- and
  Tethys-facing gates, plus one physical `place_lane_beacon`.
- **Graveyard:** reserve an off-lane Cathedral coordinate inside the existing ambush zone. Site
  identity, footprint, interaction, and persistence remain Cathedral-owned.

**BLOCKED:** wait for the integrated Cathedral interface, Cathedral coordinate/clearance approval,
Atlas/data-owner approval of the POI alias below, the Atlas mutex, and a refreshed approved base.

### Corrected POI system-map wiring

**VERIFIED:** [`applySectorAnchors`](../../../src/data/sectorAnchors.js) and
[`buildAtlasIndex`](../../../src/core/atlasIndex.js) use `poi.pos`, but
[`buildSystemModel`](../../../src/ui/galaxyMap.js) reads
`poi.anchor || poi.center || poi.position`. A new `pos`-only beacon would have an Atlas coordinate but
null system-map coordinates.

**PROPOSAL, Atlas/data-owned:** do not edit `galaxyMap.js`. Derive a compatibility alias from the
canonical coordinate in `applySectorAnchors`:

```js
const merged = a ? { ...poi, ...a } : poi;
return merged && merged.pos ? { ...merged, position: merged.pos } : merged;
```

`pos` is the only authored coordinate; `position === pos` by reference. Acceptance requires finite and
exact Atlas global `x/z`, system-map global `x/z`, sector-local `drawPos`, selectable navigation, and
physical/map equality.

## 2. Current-state inventory

### Coordinates and existing geography

**VERIFIED:** SpaceFace uses the XZ plane. Ceres' lattice origin is `(-12288,8192)`;
`worldRadius = 4200`. Sources:
[`ARCHITECTURE.md`](../../../ARCHITECTURE.md),
[`sectorCoordinates.js`](../../../src/data/sectorCoordinates.js),
[`sectors.js`](../../../src/data/sectors.js), and
[`sectorAnchors.js`](../../../src/data/sectorAnchors.js).

| Existing item | Local XZ | Global XZ |
|---|---:|---:|
| `station_ceres` | `(-1100,620)` | `(-13388,8812)` |
| `station_beltout` | `(780,-940)` | `(-11508,7252)` |
| gate to Helios | `(2866,-1910)` | `(-9422,6282)` |
| gate to Tethys | `(3444,0)` | `(-8844,8192)` |
| gate to Pallas | `(-1910,2866)` | `(-14198,11058)` |
| `f_ceres_1` | `(420,-720)` | `(-11868,7472)` |
| `f_ceres_2` | `(-680,240)` | `(-12968,8432)` |
| `f_ceres_3` | `(920,860)` | `(-11368,9052)` |
| `poi_driller` | `(240,-1180)` | `(-12048,7012)` |
| `poi_survey` | `(-1240,-320)` | `(-13528,7872)` |

Existing zones in [`sectorZones.js`](../../../src/data/sectorZones.js):

- `zone_ceres_belt`: `(300,-300), r1100`, no presence;
- `zone_ceres_refinery`: `(-1100,620), r720`, lawful patrol;
- `zone_ceres_ambush`: `(-400,-2400), r640`, pirates;
- `zone_ceres_derelict`: `(240,-1180), r420`, scavengers.

**INFERENCE:** the broad mining/refinery discs overlap and the mining disc is poorly centered on Belt
Outpost. This is coordinate analysis, not route evidence.

### Corrected `industries` consumer inventory

Adding `industries: { mining: true, refinery: true }` changes two distinct paths.

1. **Live natural path — VERIFIED.**
   [`trafficRoleMixForSector`](../../../src/systems/traffic.js) boosts live miner/hauler weights.
   Existing traffic assigns miner, hauler, and patrol jobs from real stations/asteroids and yields
   steering when `jobId` exists. Ceres' nominal live count is `round(10/3)=3`, before ecology and named
   contact behavior, capped at eight. Gates/POIs are not station destinations.
   Natural-occurrence proof must follow
   [`npc-jobs-natural-census.test.mjs`](../../../test/npc-jobs-natural-census.test.mjs): held-out seeds,
   real producer, no direct job injection, lifecycle advancement.

2. **Offscreen projection — VERIFIED.**
   [`projectSectorEmbodiment`](../../../src/sim/sector/embodiment.js) calls `buildRoleMixBias`;
   industrial metadata multiplies offscreen miner bias by `2.2` and hauler bias by `1.4`. The bias is
   placed in `traffic_density.payload.roleMixBias` and bound into `embodimentDigest`. This creates
   deterministic intent recipes, not visible ships.
   [`check-m2-sector-embodiment.mjs`](../../../scripts/check-m2-sector-embodiment.mjs) and
   [`m2-sector-embodiment.test.mjs`](../../../test/m2-sector-embodiment.test.mjs) cover ordering,
   replay, payload-bound digests, durable IDs, continuous-enter idempotency, serialize/deserialize
   preservation, same-epoch no-reemit, and full/subset audit continuity.

Future receipts must report live traffic/jobs separately from offscreen intents/digests.

## 3. Proposed coordinates and invariants

| Pocket/item | Local XZ | Global XZ | Envelope |
|---|---:|---:|---:|
| Civic — `station_ceres` | `(-1100,620)` | `(-13388,8812)` | existing `r720` |
| Production — `zone_ceres_belt` | `(500,-700)` | `(-11788,7492)` | `r850` |
| Transit — `zone_ceres_throughline` | `(3155,-955)` | `(-9133,7237)` | `r500` |
| Beacon — `poi_ceres_throughline` | `(3040,-920)` | `(-9248,7272)` | physical POI |
| Cathedral reservation | `(-720,-2120)` | `(-13008,6072)` | proposed `r620` |

Invariants:

1. All authored values remain sector-local; no galaxy-map or lattice coordinate changes.
2. Transit center is exactly the midpoint:
   `((2866+3444)/2,(-1910+0)/2)=(3155,-955)`.
3. Beacon offset from the midpoint is `sqrt(115²+35²)=120.2 WU`.
4. Civic→production = `2074.2 WU`; production→transit = `2667.2 WU`;
   production→Cathedral = `1872.1 WU`; civic→transit = `4537.1 WU`.
5. Transit boundary: `distance((0,0),(3155,-955))+500 ≈ 3796 WU < 4200 WU`.
6. Existing IDs/anchors remain unchanged.
7. Checkpoint zone has no `presence`; it adds no spawn budget.
8. Cathedral placement is dependency-owned and requires deterministic collision/field clearance.

Reference open-space times at the Atlas `140 WU/s` planning speed are `14.8 s`, `19.1 s`, `13.4 s`,
and `32.4 s` for the four legs above. These are not player-route acceptance.

## 4. Architecture, event, and data flow

```text
sectors.js
  ├─ industries + POI declaration
  ├─ applySectorAnchors
  │    ├─ canonical poi.pos
  │    └─ derived poi.position = poi.pos
  ├─ sectorZones + appendAuthoredZones
  ├─ atlasIndex: poi.pos -> global Atlas node
  ├─ galaxyMap unchanged: poi.position -> global x/z + local drawPos
  └─ world/authored-place runtime -> physical beacon at same coordinate
```

```text
Ceres industries
  ├─ LIVE trafficRoleMixForSector
  │    -> seeded live role -> existing npcJob -> one steering writer
  └─ OFFSCREEN projectSectorEmbodiment
       -> roleMixBias payload -> digest -> applied-ID/audit state -> save/idempotency
```

No new traffic controller, job type, embodiment schema, registry slot, save row, or Atlas registry.

**Route semantics:** Helios and Tethys are direct neighbors, so generic routing may bypass Ceres.
Evidence must record generic behavior and a separately forced through-Ceres itinerary. The checkpoint
is a readable Ceres landmark, not automatically a freight stop or mandatory corridor.

**Save boundary:** no pocket save object. Still prove continuing-save content refresh, embodiment
applied-ID/audit continuity, same-epoch no-reemit, map selection/route continuity, and Cathedral-owned
aftermath persistence.

## 5. Exact future write set

Not authorized by this historical report.

### Topology/data lane — exactly five paths

1. **`src/data/sectors.js`**
   - add `industries: { mining: true, refinery: true }`;
   - add `poi_ceres_throughline`, type `beacon`, name `Throughline Weigh Beacon`,
     faction `faction_dmc`;
   - no other Ceres record changes.

2. **`src/data/sectorAnchors.js`**
   - add `{ id:'poi_ceres_throughline', pos:{x:3040,z:-920},
     landmarkGlb:'place_lane_beacon' }`;
   - derive `position: merged.pos` in the POI branch of `applySectorAnchors`;
   - assert `position === pos`; no duplicate coordinate literal;
   - do not edit `galaxyMap.js` or move existing anchors.

3. **`src/data/sectorZones.js`**
   - only:
     ```diff
     - center: { x: 300, z: -300 }, radius: 1100
     + center: { x: 500, z: -700 }, radius: 850
     ```

4. **`src/data/authoredPlaces.js`**
   - append ordinary zone:
     ```js
     {
       id: 'zone_ceres_throughline',
       name: 'Throughline Weigh',
       type: 'border_checkpoint',
       factionId: 'faction_dmc',
       reason: 'A calibrated weigh beacon marks the Ceres throughline between the Helios and Tethys approaches.',
       center: { x: 3155, z: -955 },
       radius: 500,
       threat: 1
     }
     ```
   - no presence, RNG, global coordinates, discovery state, or registry.

5. **`test/pq020-ceres-topology.test.mjs`** — new
   - exact IDs/coordinates, midpoint/separation/boundary math;
   - local/global round trip;
   - `position === pos`;
   - exact Atlas global position;
   - exact system-map global `x/z` and local `drawPos`;
   - selection/course equality and physical/map agreement;
   - no duplicate IDs or existing-anchor drift;
   - both live traffic and offscreen role-bias deltas;
   - deterministic equal-input projection/digest;
   - station routes still exclude gates/POIs;
   - no registry/save-schema requirement.

Run directly; do not edit `package.json`.

### Cathedral companion — zero PQ-020 tracked paths

Dependency receipt must provide stable integrated site ID/path/API, local `(-720,-2120)`, global
`(-13008,6072)`, `r620` envelope, ambush-zone membership, selectable map identity, save identity, and
measured clearance.

### Evidence lane — zero tracked changes

Evidence owner may launch the integrated build and return external evidence only. No source, data,
test, script, asset, manifest, map, renderer, HUD, package, program, worldbuilding, or handoff edits.

Explicit exclusions include `galaxyMap.js`, `atlasIndex.js`, `traffic.js`, `embodiment.js`,
`sectorSim.js`, registry, save schema, package, input, combat, AI, Massline, tether, renderer, assets,
manifests, `design/program/**`, `docs/worldbuilding/**`, and generated indexes.

## 6. Mutex/dependency and collision analysis

| Domain | Collision | Disposition |
|---|---|---|
| PQ-017/PQ-018 | Cathedral interface/persistence owned elsewhere | Wait for integrated receipt |
| Atlas/data | alias, anchors, zones, place identity | One Atlas/data writer |
| Galaxy map | consumer mismatch but protected file | data-derived alias; no map edit |
| Live traffic/jobs | industrial metadata changes live roles | reuse owners; no new controller |
| Offscreen embodiment | same metadata changes payload/digest | characterize existing kernel; no source edit |
| Save | applied IDs/digests and Cathedral state | save/idempotency proof; no speculative schema |
| Asset/renderer/GPU | live beacon evidence uses shared runtime | serialize after data integration; zero writes |
| Git/program ledgers | lead-owned atomicity/status | integration owner only |

If a necessary edit leaves the five-path write set, stop and return a shared-change request.

## 7. Determinism, ownership, save, accessibility, performance

- **Determinism:** sector-local constants only; no ambient RNG/wall clock; equal projections
  deep/digest equal; no golden rewrite.
- **Single writers:** traffic emits owner-safe intents; NPC jobs own job-hull steering; offscreen
  embodiment creates recipes, not entities, and writes no credits/cargo/rep/hull.
- **Save:** no pocket object; `check:save-schema` green; post-load same-epoch projection emits zero;
  full-field digest survives subset/continuous-enter; test new and continuing saves.
- **Accessibility:** textual labels/inspector, keyboard and applicable gamepad/touch selection,
  non-color-only semantics, reduced-motion/flash and contrast preserved; HUD unchanged.
- **Performance:** no default quality reduction or content deletion. Use the measured contract below.

### Corrected measurable PERF_BUDGET protocol

[`design/PERF_BUDGET.md`](../../../design/PERF_BUDGET.md) defines a `16.7 ms` desktop target,
`33.3 ms` low-end floor, p95/p99/hitch evidence, and hitches as frames `>32 ms`.

Matched before/after evidence must:

1. use the same Ceres route: sector entry → map open/select → Refinery → Belt Outpost → beacon → map;
2. name target/floor profile, hardware, OS, browser, GPU, power, viewport, seed/save, ship, camera/FOV,
   and settings;
3. use identical route/settings before/after;
4. warm up `>=5 s`;
5. run at least three repetitions per profile;
6. measure `>=10 s` per repetition and record sample count; require `>=600` target rAF samples or
   `>=300` floor samples;
7. report rAF p95/p99/max, diagnostic p95, hitches >32 ms, phase p95s, map-open latency,
   sector-entry latency, calls/triangles peaks, and memory;
8. run `check:perf-budget`, `check:perf`, `check:hitch-budget`, and `check:gpu-path` where supported.

Stop unless target p95 `<=16.7 ms`, floor p95 `<=33.3 ms`, p95/p99/median-max regression `<=5%`,
hitch count does not increase, and map-open/sector-entry p95 meet both `after<=before*1.05` and
delta `<=` one profile frame budget. Any route/profile/settings mismatch invalidates comparison.

## 8. Adversarial failure modes

- Atlas charts beacon but system map gets null coordinates.
- `position` is independently authored and drifts from `pos`.
- Protected `galaxyMap.js` is edited.
- Industries are treated as traffic-only; offscreen digest change is missed.
- Offscreen intent is misreported as visible traffic.
- Natural-job proof injects jobs or depends on one seed.
- Beacon is falsely assumed to attract traffic.
- Generic Helios→Tethys route is falsely described as through Ceres.
- Rim checkpoint crushes civic/production labels through auto-fit.
- Cathedral collides with deterministic asteroids/site bodies.
- Continuing saves miss new static places.
- Beacon asset falls back or never materializes.
- Journey drops below 10/11 or a 10/11 red is called green.
- Average FPS hides p99/max/hitch regressions.
- Performance evidence changes hardware, route, viewport, or settings.
- Evidence owner changes tracked files.

Each is a stop condition for the corresponding phase.

## 9. Phased implementation and canonical checks

### Phase 0 — dependency/lease
Collect Cathedral receipt, alias approval, mutex, and refreshed base. **Stop** if any is missing.

### Phase 1 — five-path data/test commit
Apply only section 5. **Stop** if any excluded owner is needed.

### Phase 2 — coordinate/Atlas proof
Run:

- `node --test test/pq020-ceres-topology.test.mjs`
- `npm run check:sector-geography`
- `npm run check:atlas-integrity`
- `npm run check:atlas-spatial-truth`
- `npm run check:atlas-place-path`
- `npm run check:map-frames`
- `npm run check:m2b:sector-graph`
- `npm run check:sector-postcard`

Stop on null coordinates, frame drift, duplicate/missing IDs, inaccessible representation, selection
mismatch, physical/map disagreement, or boundary failure.

### Phase 3 — live jobs/offscreen/save
Run:

- `npm run check:npc-jobs` plus a held-out Ceres natural-job matrix;
- `npm run check:m2:sector-embodiment`;
- `npm run check:m2:continuous-handoff`;
- `npm run check:sim:compare`;
- `npm run check:save-schema`;
- controlled Ceres offscreen role-bias/digest comparison;
- serialize/deserialize and post-load no-reemit proof.

Stop on direct job injection, magic seed dependence, duplicate intents, digest/audit corruption,
nondeterminism, save/schema drift, or golden rewrite.

### Phase 4 — asset, route, journey, accessibility, performance
Evidence owner makes zero tracked changes. Run:

- `npm run check:assets:live`;
- `npm run check:asset-reachability`;
- owning authored-place proof:
  `poi_ceres_throughline -> place_lane_beacon`, no fallback, physical/map equality;
- `npm run check:visual-stability`;
- `npm run check:journey:textile`;
- `npm run check:ui-a11y`;
- `npm run check:wcag-contrast`;
- matched PERF_BUDGET protocol.

Record all eleven journey outcomes and require `>=10/11` for PQ-020's regression floor. The canonical
script requires 11/11 for exit zero; 10/11 remains a red/partial, never green.

### Phase 5 — controller acceptance
Controller reviews exact commit-bound receipts; lead alone updates status. This packet cannot claim
implemented, focused_green, route_accepted, or integrated.

## 10. Player-route evidence

Required normal route:

1. enter Ceres;
2. open system map publicly;
3. verify civic/production label readability;
4. select beacon and record global `x/z` plus local `drawPos`;
5. verify course target and physical position match Atlas/map;
6. undock at `station_ceres`;
7. travel/dock or resolve `station_beltout`;
8. observe natural live jobs without debug creation;
9. fly Belt Outpost → beacon;
10. approach from both endpoint-gate directions;
11. record generic route and separately forced through-Ceres route;
12. follow production → Driller/ambush → Cathedral;
13. use Cathedral-owned interaction;
14. save/reload/resume;
15. repeat critical selection by applicable input routes;
16. collect matched target/floor performance evidence.

Receipt fields: exact commit/dirty state, seed/save/platform/input, profile/hardware/settings, canonical
and alias coordinates, Atlas/system-map/physical positions, leg times, screenshots, live job census,
offscreen payload/digest/applied IDs, post-load no-reemit, Cathedral receipt, asset/fallback result,
all 11 journey outcomes, accessibility results, and performance duration/sample/p95/p99/max/hitches/
map-open/sector-entry data.

## 11. Unresolved risks

1. Integrated Cathedral ID/path/API/footprint/map/save contract.
2. Cathedral acceptance of `(-720,-2120)` after clearance testing.
3. Atlas/data-owner alias approval.
4. Continuing-save refresh of appended static places.
5. Generic route behavior with direct Helios–Tethys edge.
6. Acceptance of tightened production zone and fringe fields.
7. Whether an unstaffed checkpoint is enough; guaranteed traffic requires rescope.
8. Future live beacon asset/fallback result.
9. Map auto-fit/label compression.
10. Cathedral approach combat pressure.
11. Controller-held-out seeds.
12. Target/floor hardware definitions.
13. Whether 10/11 red is acceptable as PQ-020 floor.
14. Three-pocket fallback policy if Cathedral remains unavailable.

## 12. Controller-ready acceptance checklist

- [ ] Cathedral dependency and Atlas/data alias/mutex are resolved.
- [ ] Diff is exactly the five future paths; no protected path changed.
- [ ] Existing Ceres IDs/anchors remain unchanged.
- [ ] Canonical beacon `pos`, same-object `position`, Atlas global position `(-9248,7272)`,
      system-map global point, local `drawPos (3040,-920)`, selected course, and physical position agree.
- [ ] Transit zone `(3155,-955),r500`, production `(500,-700),r850`, Cathedral `(-720,-2120)`.
- [ ] Live traffic and offscreen embodiment are proven/reported separately.
- [ ] Natural jobs arise without injection; equal embodiment inputs/digests match.
- [ ] Applied IDs/audit digests save/reload; same-epoch post-load emits zero.
- [ ] Topology, sector-geography, Atlas, map-frame, embodiment, handoff, sim, save, and postcard gates pass.
- [ ] Exact beacon asset passes live/reachability and owning physical/map proof.
- [ ] Visual stability and accessibility pass.
- [ ] All 11 journey outcomes retained; score >=10/11, with any 10/11 exit-red honest.
- [ ] Generic versus through-Ceres routing is reported accurately.
- [ ] Target/floor hardware and matched route/settings/sample evidence are recorded.
- [ ] rAF p95/p99/max, hitches >32 ms, map-open and sector-entry latency meet section 7.
- [ ] Evidence owner has zero tracked changes.
- [ ] Lead alone updates program status.
- [ ] Receipt remains `returned/planning_complete` until lead action.

## 13. Corrected SpaceFace receipt

```yaml
spacefaceReceipt:
  taskId: SF-PORT-03
  title: PQ-020 Ceres activity-pocket topology
  status: returned/planning_complete
  authority: non-authoritative
  scope: planning-only
  integration: not-integrated
  baseCommit: 8f1c630f5ebf26f209052b8164f3cdf024ffd06f
  requestedBranch: agent/chatgpt-pq020-topology-20260723
  changedFiles:
    - docs/handoffs/chatgpt-portfolio-20260723/PQ020_CERES_ACTIVITY_POCKET_TOPOLOGY.md
  correctionsApplied:
    - canonical poi.pos with derived applySectorAnchors position alias; no galaxyMap edit
    - live traffic and deterministic offscreen embodiment consumers separated
    - sector-geography, journey-textile, and exact live beacon-asset gates added
    - matched PERF_BUDGET target/floor evidence and thresholds added
  unresolvedBlockers:
    - integrated Cathedral contract and clearance
    - Atlas/data alias approval and mutex
    - continuing-save static-place refresh behavior
    - exact target/floor hardware profiles
    - live route, asset, journey, save, accessibility, and performance evidence
```

## Source anchors

[`CANONICAL_BUILD_MAP.md`](../../../CANONICAL_BUILD_MAP.md) ·
[`AGENTS.md`](../../../AGENTS.md) ·
[`program queue`](../../../design/program/roadmap/program-queue.json) ·
[`execution protocol`](../../../design/program/roadmap/00_EXECUTION_PROTOCOL.md) ·
[`corrected build plan`](../../../design/sequential-build-plan/REVIEW/BUILD_PLAN_CORRECTED.md) ·
[`Ceres identity`](../../../design/world-identity/sectors/sector_ceres_belt.md) ·
[`PLACE_REGISTRATION`](../../../src/data/PLACE_REGISTRATION.md) ·
[`sectors`](../../../src/data/sectors.js) ·
[`anchors`](../../../src/data/sectorAnchors.js) ·
[`zones`](../../../src/data/sectorZones.js) ·
[`authored places`](../../../src/data/authoredPlaces.js) ·
[`Atlas index`](../../../src/core/atlasIndex.js) ·
[`traffic`](../../../src/systems/traffic.js) ·
[`embodiment`](../../../src/sim/sector/embodiment.js) ·
[`sectorSim`](../../../src/systems/sectorSim.js) ·
[`galaxy map`](../../../src/ui/galaxyMap.js) ·
[`PERF_BUDGET`](../../../design/PERF_BUDGET.md) ·
[`sector geography gate`](../../../scripts/check-sector-geography.mjs) ·
[`embodiment gate`](../../../scripts/check-m2-sector-embodiment.mjs) ·
[`journey textile`](../../../scripts/check-journey-textile.mjs) ·
[`assets live`](../../../scripts/probe-authored-assets-live.mjs) ·
[`asset reachability`](../../../scripts/check-asset-reachability.mjs).
