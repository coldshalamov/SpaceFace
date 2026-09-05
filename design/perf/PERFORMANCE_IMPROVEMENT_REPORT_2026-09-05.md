<!-- LIFETIME: DATED REVIEW — descriptive evidence, not admission. New work must still be admitted
     through design/PERF_OPTION_SPACE.md (PQ leaves) before implementation. -->

# Performance improvement report — 2026-09-05

Scope: a repo-wide, code-level sweep for performance improvements that could be implemented or
tried, sized small / medium / huge, with special attention to **integrated-graphics laptops**
(weak GPU with shared memory bandwidth, weaker CPU). This review is descriptive: it names findings
and evidence, it does not admit work. Items that overlap an existing reserved identity in
`design/PERF_OPTION_SPACE.md` are cross-referenced in §6 rather than re-numbered.

## Coverage and method

Six parallel structured sweeps plus direct reads of the core loop, event bus, registry, simulation
runner, presentation runner, renderer hot paths (`renderer.js`, `bloom.js`, `vfx.js` frame paths,
`presentPath.js`, `adaptiveQuality.js`), physics authority (`physics.js`,
`sg02DynamicBodyOwner.js`, `rapierCollisionWorld.js`), HUD patterns, `partsLibrary.js` seams, and
startup (`main.js`, `index.html`, `electron/main.cjs`). Deep-swept areas: all of `src/systems/`
(~55k lines), `src/render/` (~45k), `src/ui/` (~30k+), `src/core/` + `src/combat/` + `src/ai/`
(~35k), `src/audio/` + `src/save/` + `src/data/` seams + `partsLibrary.js` (~25k). Combined with
the direct reads this covers well over 40% of the runtime code, weighted toward the per-frame and
per-tick paths. Every finding below carries a `file:line` anchor read in the working tree.

## 1. Calibration: what is already optimal (do not pay for these again)

This codebase has had substantial, measured perf work. Any improvement campaign should start from
this list, not rediscover it:

- **Loop**: fixed 60 Hz sim with bounded catch-up (4) and backlog shedding, allocation-free runner
  and completed-tick ring (`src/core/simulationRunner.js`); presentation runner with lifecycle
  suspend/restore and stall detection (`src/core/presentationRunner.js`).
- **Event bus**: pooled dispatch snapshots and pooled deferred records; no per-emit array garbage
  except one closure + one swap array (§4.10) (`src/core/eventBus.js`).
- **Renderer**: canvas MSAA off on the default bloom route (`src/render/presentPath.js:19-25`);
  single-sampled MSAA-0 HalfFloat HDR targets; 2 full-res + 2 reduced-res post passes total; no
  additive upsample RT; opaque sort bypassed (`renderer.js:3065`); BatchedMesh explicitly rejected
  on Intel/ANGLE measurement (`renderer.js:3075-3080`); `preserveDrawingBuffer` only on the devshot
  route (`presentPath.js:38-50`).
- **Entity submit**: presentation-world slot queries with retained arrays, dirty masks,
  projected-px LOD with hysteresis, glass/runway bands, per-entity shadow-caster policy
  (`renderer.js:6154-6451`).
- **Particles/VFX**: SoA typed-array pools, instanced shard cloud + sprite buckets, partial
  dynamic-range uploads, swap-remove retire, relevance probes + 12–30 Hz cadences that fully sleep
  (`vfx.js` update paths).
- **Asteroids**: instanced common-rock pool with view+shadow frustum culling and dirty-slot matrix
  reuse (`asteroidInstancePool.js`).
- **Textures**: KTX2/BasisU mip-chained pipeline with Draco/meshopt and GPU residency budgets
  (`assetLoader.js`, `assetResidency.js`).
- **Adaptive resolution**: GPU tier detection incl. `intel/iris/Apple GPU` + dynamic-resolution
  controller, currently enabled only for the `software` tier (`adaptiveQuality.js`,
  `renderer.js:3936-3947`) — see §2.1/§3.20 for the integrated-tier gap.
- **HUD**: dirty-checked `setText/setStyle/setClass`, numerics at 10 Hz, roster keyed-reconcile at
  5 Hz, retained overlays (`hud.js`).
- **Save**: worker-encoded chunked autosave with 8 ms synchronous-slice target, calm-window
  deferral (`saveSystem.js`).
- **Shadows**: single 512² directional over ±300, texel-snapped follow, dirty-gated re-render,
  one-frame skip when present >22 ms (`shadowCasterPolicy.js`, `shadowPresentCadence.js`).
- **Audio**: capped 12-voice one-shot pool, write-gained bed params, 100 ms threat recompute.
- **Spatial hash**: layered static/dynamic with active-bucket iteration, stamp dedup, batch radius
  queries (`spatialHash.js`) — AI perception is broadphase-based, not O(n²).

**The remaining wins are therefore mostly: (a) leftover per-tick scans/allocations in sim systems
and AI, (b) a handful of real GPU levers (fill-rate defaults, ship draw-call LOD, shader loop
size), (c) DOM/CSS steady-state waste in map/screens/HUD, (d) audio node churn, (e) burst
main-thread JSON on save/menu/boot paths, and (f) Rapier solver/sleep configuration.**

Entity scale for cost reasoning: ~100–300 live entities typical (≈80 asteroids/sector +
`spawnBudget` cap 24 (hard 40) ships + traffic cap 8/sector), worst case ~400–500 in a big fight.
`MAX_CATCHUP_STEPS = 4` means every render overrun amplifies into sim backlog — CPU wins convert
directly into frame pacing.

---

## 2. HUGE items (multi-day; the ones that move integrated-GPU frames)

### 2.1 Tier-aware default `pixelRatioCap` — the single biggest iGPU fill-rate lever
- Today: `pixelRatioCap: 2` default (`src/core/gameState.js:28`) applied as
  `min(devicePixelRatio, cap) × renderScale` (`renderer.js:7876-7891`). On the extremely common
  150%-scaling / Retina integrated laptop, the full HalfFloat HDR scene RT + composite render at
  up to 2× linear = **4× the pixels**, over shared-memory bandwidth, for a tilted tabletop game
  that is GPU present-bound by the repo's own diagnostics comment (`renderer.js:3913-3921`).
- Try: pick the default cap at boot from the already-computed `detectGpu()` tier — e.g. 1.25–1.5
  on `integrated`, keep 2 on discrete. One-time decision, no runtime RT churn (which is why
  dynamic resolution was disabled for this tier). Keep the player slider authoritative when set.
- Doctrine note: `design/PERF_BUDGET.md` §3 forbids lowering these knobs **to pass gates**; a
  tier-specific *playability default* is a product decision to try with the standard A/B evidence,
  not a silent quality cut. Verify with the §7 protocol and the pixel-parity gate expectations.
- Size: huge win, small-medium implementation. Confidence: high.

### 2.2 LOD for procedural ships — the biggest remaining draw-call/vertex lever
- Today: procedural ships get `optimizeStaticBatches` only — no `attachLodState`, no `updateLod`
  (`visualFactory.js:3485`); `lod.js:10-13` says "LOD0-only for now"; `wholeShipLodPolicy.js`
  covers authored GLB families only. Asteroids and stations already have the full machinery. Every
  NPC ship at any distance draws greeble scatter, 3 blinker fixtures, per-hardpoint weapons,
  engine fans, sensor masts, shield ring, decals — the dominant per-ship cost in a freighter
  swarm, and nothing in `syncEntityViews` (`renderer.js:6285-6289`) can demote them.
- Try: wire `attachLodState` + an `updateLod` that hides far-detail leaves (greebles, blinkers,
  masts) at LOD2 and decal shells at LOD1, using the existing `hlod.js:23-39` helpers and
  `isFarDetailSurface()` classification. Preserves the close-up picture exactly (PQ-108's
  on-glass-LOD idea, applied to procedural hulls).
- Size: huge in busy sectors; medium implementation. Confidence: high.

### 2.3 Galaxy map: route planner runs 2× per animation frame
- Today: `_draw` → `_updateRailSections` (`galaxyMap.js:8533` → `:7780-7781`) →
  `_routeAlternativesHtml` runs `world.computeRoute(dest, 'fuel')` **and** `computeRoute(dest,
  'hops')` every frame, building an HTML string that is only then change-compared. The rAF loop is
  active whenever LOCAL-level live contacts exist (`_animationActive`, `galaxyMap.js:6194-6203`).
  `_revealAlternatives` (`:7849-7867`) auto-opens that section whenever a route/contract/selection
  exists, so this is the common case, not an edge case.
- Cost: full route-graph walks twice per frame on the main thread, colliding with the WebGL canvas
  — the largest single UI-side frame cost found in the repo.
- Try: memoize on (destination, plotted-route shape, discovered-count); recompute on route events
  and `refresh()`, never inside `_draw`.
- Size: huge (while chart open at LOCAL). Confidence: high.

### 2.4 Rapier configuration pass: solver iterations, selective sleep, redundant WASM reads
- Today (all in `src/core/sg02DynamicBodyOwner.js`):
  - `new RAPIER.World(...)` with defaults — no `numSolverIterations` tuning (`:190`), despite the
    game being planar with manually integrated springs (`:1440-1452`) so the solver only sees
    plain contacts.
  - Every dynamic body is created `setCanSleep(false)` (`:903-906`) for replay stability — idle
    wrecks/chunks/parked drones are integrated and narrow-phase-checked every step, forever.
  - `_maybeResyncBodyPose` reads `body.translation()` for **every dynamic body every tick**
    (`:1179-1208` via `:1060-1064`) and `_enforcePlane` reads translation/linvel/rotation/angvel
    again (`:1311-1342`) — each read is a JS→WASM boundary call that allocates a result object in
    the glue. At small body counts the boundary overhead dominates.
- Try (each behind the determinism gate PQ-066 and 47-A golden hashes): `numSolverIterations = 2`
  (structural-give clamping at `:843-884` already masks small solver loss); allow sleep for bodies
  with no spring attachment and no commanded force (wake via the membrane on impulse); skip the
  pre-step pose verification for bodies the owner exclusively writes. This is the concrete code
  entry point for reserved identity **PQ-084 (physics sleep)** plus a solver-tuning sibling.
- Size: huge on weak CPU as bodies grow; medium implementation + A/B. Confidence: high on the
  mechanics; needs golden-hash validation before keep.

### 2.5 Tactical AI restructure: stop re-deriving membership and inspect data every tick
- Today (`src/systems/tacticalAI.js`): 5–6 full `entityList` passes per tick, each allocating
  fresh Map/Set/array containers — `markCheapCohortMembers` (`:354-365`), `gatherCohorts`
  (`:382-409`, `new Map()` + `[...byId.values()]`), `gatherRecipeSquads` (`:450-477`), 
  `driveChoreographyMembers` (`:479-503`, `new Set()`), `applySquadTokenFireGate` (`:605-622`).
  Additionally every stamp calls `director.inspect()` which builds a debug-shaped snapshot object
  per member per tick (`fodderCohort.js:1090-1116`, `squadFrame.js:928-958`), and choreography
  members are stamped **twice** per tick (`:495` and `:616`). The roster itself is rebuilt,
  re-normalized, and re-sorted every 2 ticks even when unchanged (`aiPorts.js:425-511`) although
  the stack's `_syncRoster` already supports zero-cost reuse (`ai/stack.js:340-361`).
- Try: one membership index maintained in `entityIndex` (like the existing `aiShips` bucket),
  pooled per-tick shared containers, expose the 4 scalar stamp fields on the pooled plan record
  instead of calling `inspect()`, and skip roster rebuilds on an identity/version signature.
- Size: huge at scale, medium implementation. Confidence: high (every tick, hot).

### 2.6 Platform scaleout (already reserved; listed for completeness)
Sim Worker (`PQ-082`/`PQ-043`), WASM sim island (`PQ-083`), WebGPU backend (`PQ-089`/`PQ-044`),
SharedArrayBuffer snapshots (`PQ-093`), native present (`PQ-090`). All stay gated on the §5.2/§7
investigation order in `PERF_OPTION_SPACE.md`. Listed here because on a 4-core integrated laptop
offloading the ~5 ms sim budget is the only remaining way to buy headroom once the items above are
spent. Size: huge each.

---

## 3. MEDIUM items (roughly a day each; clear, measurable wins)

### Sim CPU — leftover per-tick scans and rebuilds
1. **Combat kernel iterates and re-sorts the full entity list every tick.** `prePhysics`/
   `postPhysics` use `sortedEntitiesFromSource` = `[...list].sort()` with cache invalidation on
   every spawn/destroy (`src/combat/kernel.js:111-140, 266-280`) — during combat that is nearly
   every tick. `syncCombatantBounds` also runs twice per combatant per tick (`:127,:138`). Fix:
   iterate `entityIndex.ships/drones/stations` + damageables; sort the small typed lists; skip the
   second bounds sync. *(medium)*
2. **AI contact objects allocated per candidate per sensor refresh.** `entityContacts` spreads a
   fresh ~28-field object per asteroid/pickup/projectile in 1600 WU (`aiPorts.js:887-919`) —
   hundreds of short-lived objects per decision tick in rock fields. Cache the hazard contact per
   source per tick (the `_contactBaseFor` pattern at `:561-575` already exists) and stamp per-
   observer fields onto the live copy. *(medium-large in asteroid sectors)*
3. **`worldRecordId → entity` reverse index.** `entityWithWorldRecord` scans the whole entity map
   per call on per-tick paths (`traffic.js:8175-8181`; call sites `:3406, :5214, :5621, :5937`),
   and `findLiveEntityForRecord` re-implements the same scan (`world/worldRecords.js:1035-1042`);
   `presentationAdmission.js:81-97` scans all entities per world-site per tick
   (`asteroidSites.js:1288`). One Map in the entity index removes an entire class of O(N) scans.
   *(medium)*
4. **Sanctuary-withdrawal pass touches every entity every tick** with per-NPC station distance
   tests (`lawSecurity.js:434-454`). Cadence to 4–8 Hz with `shouldRunOnTick` and pre-fetch the
   station list from `entityIndex.stations`. *(medium)*
5. **`describeEntity()` rebuilt per tick while the mining beam is held** (`mining.js:225` →
   `interactionDescriptors.js:118-141`: fresh descriptor, stable-key string, display-name string,
   lowercase hostility probes, arrays). Cache per target id, invalidate on events; or compute only
   the fields `resolveBeamVerb` reads per tick. *(medium)*
6. **Full-entityList scans for rare entity types, per tick**: vector mines (`weapons.js:1059`),
   mines (`mines.js:116-141`), ghost contacts (`scanner.js:831-847`), cruise mass-lock
   (`cruise.js:106-120`). Fix: typed buckets in `entityIndex` (the pattern exists) or spatial
   queries. *(medium)*
7. **Beam combat per-tick rebuilds**: `buildWeaponDamagePacket` clones statuses per beam per tick,
   beam record + `beamKey` template string + `combat:fire` event with fresh origin/`to` objects
   every tick per beam (`weapons.js:601-630`, `_muzzle` `:1212-1223`). Reuse the packet during the
   beam phase; cadence `phase:'update'` emits to ~15 Hz. *(medium)*
8. **Massline acquisition snapshot churn** (`tetherGameplay.js:1704-1793`, `:2212-2230`): per
   refresh at up to 12.5 Hz — `[...nearby]` copies, full `entityList` scan for attachable
   candidates (pickups/payloads are already indexed), fresh Maps/Sets/sort closures, and
   per-candidate `isHostileToPlayer` (next item); optional per-candidate Rapier raycasts
   (`:1894-1925`) — batch or top-3 only. *(medium)*
9. **`isHostileToPlayer()` memoization** (`scanner.js:1443-1481`): `String(...)` + `.toLowerCase()`
   allocations per call and worst-case O(gates+hazards) lane scan per call (`:1550-1573`); called
   from weapons, tether acquisition, mining, and HUD contact words (twice on some paths).
   Memoize ~0.25 s per entity; hoist sector lane-danger per tick. *(medium)*
10. **Bulk entity removal splices ~24 index arrays per dead entity**
    (`coreSystem.js:470-525`): a missile-salvo expiry costs O(24·N·shift) in one tick. Mark stale
    and let `reconcileEntityIndexSource` rebuild once (`:527-534`), or swap-remove. *(medium, spiky)*
11. **Economy econTick lookups**: `stationInfo()` linear scan per station per tick-of-econ
    (`economy.js:159-175`), `commodityDef()` `.find` per listing (`:177-184`), fresh closures per
    listing (`:306-312`, `:770`), `SECTORS.find` in `propagateEvents` (`:1942`), `_rng()` re-hashing
    its seed per draw (`:2026-2029`). Maps + cached seed. *(small-medium at 5 s cadence)*
12. **`getDerivedStats` resolves fittings twice per call** (`ships.js:623-624` → two
    `resolveFittings`/`buildSlotList` passes); memoize slot list per defId. *(small)*

### GPU / render
13. **Cross-root merge + matrix freeze for ship hulls.** Procedural ships only get per-parent
    merge; asteroids/stations/wrecks get `freezeStaticPresentation` →
    `optimizeStaticBatchesForRoot` (`visualFactory.js:3485` vs `:268-338`). Ship sub-trees
    (weapons `:1693`, engines `:1703`, masts `:1737-1744`) can't collapse and recompute local
    matrices every `updateMatrixWorld`. Freeze hull-relative statics with the existing exclusions.
    *(small-medium)*
14. **Event-light pool sized by GPU tier.** 6 permanently-visible PointLights bake 6-light loops
    into every PBR program (`vfx.js:209`, `:11455`, `:216-218`); the count is already a managed
    shader-key input with matching precompile. A 4-light `integrated` preset is a safe boot-time
    change. Cross-ref PQ-096. *(medium)*
15. **Screen-size clamps for additive particles/flares.** Smoke grows to ~11 WU
    (`vfx.js:12204`); shards/sprites are additive (`particleShards.js:136`,
    `instancedSpritePool.js:70-75`); at close zoom these are unbounded screen-size additive
    overdraw — the classic shared-memory fill killer. Clamp projected size (the starfield already
    does: `spaceBackground.js:630`). *(medium)*
16. **Shadows tier default.** Shadows default ON with a still-rebuilt-almost-every-frame 512²
    depth pass while moving (`gameState.js:28`, `renderer.js:6968-6994`). Try: shadows off or
    256² on `integrated` (contact-shadow discs already carry the ground read,
    `renderer.js:758-799`). Same doctrine caveat as §2.1. *(small-medium change, medium GPU win)*
17. **Material clones break per-ship batching**: per-fixture `emissiveMaterial(...).clone()`
    blinkers ×3 (`visualFactory.js:2255`), armor clone `:1442`, grime `:1467`, gem `:2672`. Share
    per (ship,color); pulse via instance color. *(small-medium)*
18. **NPC canopy glass**: `MeshPhysicalMaterial` clearcoat, transparent, DoubleSide on every
    procedural ship (`visualFactory.js:525-537`). Use MeshStandardMaterial for NPC tiers.
    *(small)*
19. **Dynamic resolution for the `integrated` tier without RT-churn hitches** (`renderer.js:3936-
    3947`): a `setSize`-free path that only resizes bloom RTs, or a small preset ladder. As
    shipped, an integrated GPU under transient load has zero automatic relief. *(medium)*

### UI / DOM / CSS
20. **`box-shadow` keyframe animations on always-visible HUD** (`uiRoot.js:1464-1465, 1669-1672,
    1731-1733`; `comms.js:747`): paint-property animations run continuously over the WebGL canvas.
    Animate `opacity` on a static pre-rendered glow pseudo-element instead. *(medium — duty-cycle
    dependent)*
21. **Market + bar screens rebuild on the ~3.3 Hz periodic path**: per-row quote recomputation, ~8
    `querySelector` per row, unconditional textContent writes, full chip-DOM rebuild per row
    (`market.js:1240-1330`, `renderIntelStrip :1518+`); bar rebuilds every contact card with fresh
    listeners (`bar.js:1484-1553`). Signature-gate rows, cache field spans, no-op on
    `options.periodic` (missionLog already does: `missionLog.js:1837`). *(medium)*
22. **Galaxy map per-frame DOM/model work beyond the planner**: ~11 `querySelector` per `_draw`
    (`galaxyMap.js:8495, 8503, 7730-7778`), inspector string rebuild every frame instead of the
    file's own 64 ms cadence (`:6236`, `:6377-6382`), weather/cargo-deck snapshots computed every
    frame (`:8534-8535`), ribbon legs `innerHTML` keyed on live ETA labels (`:7614-7650`),
    `getBoundingClientRect` on every mousemove (`:8221`). Cache refs; cadence to 64 ms; coarse
    keys. *(medium aggregated)*
23. **`drop-shadow` filters on per-frame-translated overlays** (`uiRoot.js:1608, 1781-1782,
    2033-2035`): each 30–60 Hz transform write re-rasterizes the filtered layer. Isolate filters
    onto static children or drop at this scale. *(small-medium)*

### Audio (steady-state node churn)
24. **All four music-stem sequencers run forever, even at 0.0001 gain** — in `calm`, stems B/C/D
    keep creating oscillators/filters/BufferSources every 16th note into a silent bus
    (`audioSystem.js:3081-3098`, `:3405-3420`). Gate `scheduleNotes` on stem weight with a small
    lookahead; also call `_pauseMusicSchedulers()` on gameplay pause (`_onPause`, `:1638-1681`).
    *(medium)*
25. **Engine hum writes 8 AudioParam automations per frame uncached** (`audioSystem.js:3920-3931`
    ≈ 480 events/s) and **priority-duck rewrites loop gains per frame** (`:4114-4124`). Apply the
    existing `_bedTargetCache` / `v._audioGainTarget` patterns (`:3973-4013`, `:3651-3658`).
    *(small-medium)*

### Save / load / boot (burst main-thread work)
26. **Manual save stringifies the payload twice and parses twice synchronously**
    (`saveSystem.js:506-513, 789-831`); the transactional autosave path already shows the correct
    shape. Reuse the checksum string; route validation through the worker. *(small-medium)*
27. **Rollback snapshot on every load-from-flight** runs a full capture + checksum stringify +
    deep clone before restore starts (`saveSystem.js:2593-2610`, `:2494-2500`). Reuse the last
    validated autosave bytes as the rollback target. *(medium)*
28. **`listSlots()` fallback scan validates every slot's full payload** (parse + fnv1a per slot,
    `saveSystem.js:1025-1063`, `:4066-4072`) — menu hitch with several multi-MB slots; the file's
    own comment (`:969-971`) describes the index-first contract. Trust the index unless corrupt.
    *(medium)*
29. **Boot path**: `partsLibrary.js` and its deep render graph are statically imported at boot
    though nothing authored renders until a run starts (`main.js:28`); scenario contract
    fetch + canonical stringify + SHA-256 block the loop start (`main.js:108`). Dynamic-import the
    library inside the new-game transition; overlap the fetch/hash with registry init. *(medium)*

---

## 4. SMALL items (hours each; aggregate GC/CPU hygiene)

**Sim/systems**
1. `JSON.parse(JSON.stringify(manifest))` per tick per Ceres disabled-hauler incident, twice
   (`traffic.js:5957` via `:6298-6299`). *(high confidence)*
2. `traffic._rng()` → `_ensureState()` re-runs 3× `compactStableIds` (arrays + Sets) per RNG draw
   (`traffic.js:8032-8035`, `:7916-7960`). Read the seed directly.
3. Salvor dispatch pass full-scan + `localeCompare` sort every 4th tick in every sector
   (`traffic.js:3400-3401`, `:4080-4102`). Cadence to 30–60 ticks or event-driven.
4. `stationIdentity()` `String()` per candidate inside `.find()` per tick
   (`traffic.js:8159-8164`, used at `:3407, :3461`). Cache on `station.data`.
5. Courier/liner per-tick presentation strings + itinerary objects + `Object.keys(...).sort()`
   while boarding (`traffic.js:2127-2145, 2202-2216, 2436-2455, 2506-2520, 2632-2648`).
6. `gcExpiredRecentMemory` materializes `Object.keys(bag.byId)` per tick
   (`world.js:2662` → `worldRecords.js:113-128`). 1–2 s accumulator.
7. `mining:tick` event at 60 Hz per active miner/drone with fresh payload (`mining.js:689-694`,
   `automation.js:858-875`); `beam:denied` per tick while denied (`mining.js:254`);
   `mining:heatChanged` at 50 Hz (`mining.js:523-534`). Cadence + reuse payloads.
8. Mining per-tick allocs: `beamLineFor`, `toolState`, `rayCircleContact`, seam points
   (`mining.js:229-250, 1622-1645`); `_rollOre` table rebuild per unit (`:851-866`);
   `richOreForTier` sorts ORES per call (`:1861-1867`); `_drainWreck` per-tick spread + sort +
   reduces (`:1046-1108`). Static caches + scratch objects.
9. `Math.hypot` in range-gate branches across traffic/mining/weapons/AI helpers
   (`src/core/math.js:27-29`, `ai/contracts.js:219-225`, `traffic.js:3363` etc.) — `d²` compare or
   `sqrt(dx²+dz²)`; keep `hypot` where golden hashes pin it.
10. String-building sort comparators per comparison: `compareId` (`fodderCohort.js:1153-1159`),
    `stableId` (`ai/contracts.js:180-183`); numeric compare or precomputed keys; drop the
    `slice()` before sort (`:357`).
11. `_attackSpecFor` builds a `join(',')` cache key per shot (`weapons.js:773-774`); RNG entropy
    object allocated per draw (`weapons.js:328-335`); weapon def + heat fields re-resolved per
    weapon per tick (`weapons.js:289, 354, 365`) — bake onto runtime.
12. Automation outposts: per-tick production plan + input scan + filter/sort per good
    (`automation.js:1364-1416`) — refresh at 0.5–1 s, keep `storage += rate*dt` per tick.
13. Missions: `_adoptLiveMissionTargets` full-entity filter+sort run twice per retry window
    (`missions.js:4192-4256` via `:4181` and `:4362`); persistent `missionId → entities` index
    (`missionTag` already stamped, `:4286`).
14. Story: `snapshotEndingFacts` allocations per tick once `flags.endgame` is set
    (`story.js:579-630` → `story/endings/eligibility.js:23-50`). Cache or event-driven.
15. Claims: defense-warning waypoint object + template string rebuilt per tick
    (`claims.js:1198-1213`).
16. `hash32(...args)` builds a join string per call (`src/core/rng.js:74-82`) — numeric fast path.
17. Event bus: per-`emit` closure `set.forEach((fn)=>snapshot.push(fn))` and a fresh `[]` per
    non-empty flush (`eventBus.js:31-33, 53-54`). Hoist the callback; double-buffer `deferred`.
18. Registry: `shouldSkipSystemOnCatchup(s.name, state)` per system per tick
    (`registry.js:755-759`) — hoist the per-tick decision.
19. Runtime witness 1 Hz `getReport()` builds a large report (180-sample sorts × ~40 stats + full
    entity walk) on the main thread (`runtimeWitness.js:587-598` → `perfRuntime.js:1115-1191`) —
    a periodic few-ms spike; read scalars or memoize.
20. SG-02 owner hygiene: `stepReceipts = []` per step (`sg02DynamicBodyOwner.js:619`), `new Map()`
    per step in `_captureContactImpacts` (`:1091`), `[...merged.values()].sort()` per step
    (`:1175`), `Math.min(...dynamicCaps)` spreads (`:1104, 1147`), `diagnostics()` walks all
    records twice per tick (`:386-405`), `_hasManualSpringAttachment` walks all attachments per
    body per step (`:644-651`), `push(...stepReceipts)` spread (`:632`).
21. Physics command membrane: `writePhysicsControl` allocates ~6 objects per craft per tick,
    command record re-created per tick (`physicsAuthority.js:26-39, 56-60, 257-270`),
    `planeForce`/`yawTorque`/`quatFromYaw` copies per application (`sg02DynamicBodyOwner.js:1263-
    1281`, `:1997-2005`) — retain + reset instead of delete/recreate. ~25k allocs/s at 40 craft.
22. Projectile sweep falls back to all-collidables × all projectiles when the hash is off below 96
    collidables (`physics.js:614-633`, `:929-936`) — count statics only, or lower the threshold.
23. `updateDockRange` walks stations per tick (`physics.js:738-811`) — early-out when docked.

**Render**
24. Shadow-follow key template string per frame (`renderer.js:7271`) — 5-number compare.
25. `bubble.updateWorldMatrix(true,false)` + nav-source matrix update per ship per frame
    (`renderer.js:1365, 1401`) — read `matrixWorld` after the frame's `updateMatrixWorld`.
26. Field-geometry instanced pools rewritten every frame while fields exist (`vfx.js:9768-9771`,
    ~400 matrices) — `_consumeCadence` like the other VFX subsystems.
27. `DoubleSide` on all VFX quads (`particleShards.js:138`, `instancedSpritePool.js:190`,
    `engineTrailSurfaces.js:97,170,186`) — plane-viewed; FrontSide is a free raster win.
28. Common-rock geometry is non-indexed after `toCreasedNormals` (`visualFactory.js:1951-1971`) —
    an indexed instanced variant cuts vertex invocations ~3× if rock-heavy views matter.
29. `getExternalTexture` lacks mipmap/anisotropy caps (`vfx.js:241-253`,
    `visualFactory.js:201-214`) — guard against authored fallback cost.
30. No-op self-assignment `slot.obj.intensity = slot.intensity` (`vfx.js:11635`).

**UI**
31. HUD per-frame `heatRow.querySelector('.sf-bar')` (`hud.js:4237`) — cache at build.
32. Unconditional `document.body.dataset.sfHudJob` write at 10 Hz (`hud.js:4309-4311`).
33. Per-frame `{x,y,z}` allocations into `worldToScreen` (`hud.js:1760, 1794, 2107, 4612`;
    `uiRoot.js:563`) and per-tell layout records (`hud.js:809`) — scratch vectors; cache layout
    per (w,h).
34. `getElementById('toasts')` per 10 Hz lane placement (`hud.js:4572`).
35. `syncHudAccessibility` unconditional `getElementById`+`setAttribute`+`inert` per frame
    (`uiRoot.js:1131-1133` → `screenManager.js:269-275`).
36. `getElementById('aim-reticle')` per frame (`uiRoot.js:512`).
37. `JSON.stringify` signature per frame in band HUD (`bandHud.js:115` via `uiRoot.js:1147`) —
    tuple compare.
38. Radar 2D: `createRadialGradient` per 10 Hz draw + full clear (`radar.js:469`) — pre-render the
    static plate offscreen (galaxyMap already does this: `galaxyMap.js:8413-8472`).
39. `backdrop-filter: blur(2px)` on cargo/contacts/weapon panels (`uiRoot.js:2510-2512`).

**Audio**
40. `_noteFreq` allocates its SEMITONES table per note (`audioSystem.js:2995-3001`) — hoist.

---

## 5. Suggested order of attack for integrated graphics

If the goal is "smooth on an integrated laptop," spend in this order (each needs the §7 evidence):

1. §2.1 tier-aware pixelRatioCap default (fill rate — biggest lever, boot-time safe).
2. §2.3 galaxy-map planner memoization (biggest UI-side frame cost).
3. §2.2 procedural-ship LOD (draw calls/vertices in traffic).
4. §2.5 tactical AI membership/stamp/roster restructure (every-tick CPU waste).
5. §3.1 combat kernel typed iteration (combat-hot CPU).
6. §2.4 Rapier solver iterations + selective sleep (behind the determinism gate).
7. §3.20 box-shadow → opacity HUD animations (paint contention with the canvas).
8. §3.13–3.16 ship merge/freeze, light-pool tier, particle size clamps, shadow tier.
9. §3.24–3.25 audio sequencer gating + param caching (steady node churn).
10. §3.26–3.29 save/boot burst work (hitch class, not steady state).
11. The §4 hygiene pass as a batched cleanup campaign.

## 6. Cross-reference to the reserved PQ catalog

Findings above that map onto identities already reserved in `design/PERF_OPTION_SPACE.md` — admit
through those leaves, don't mint duplicates:

| Report item | Existing identity |
|---|---|
| §2.4 Rapier sleep | `PQ-084` (physics sleep); solver tuning is a natural sibling leaf |
| §2.2 ship LOD / tiny-ship detail | `PQ-053` (live LOD/HLOD), `PQ-108` (on-glass LOD) |
| §3.14 event-light cardinality | `PQ-096` (+ `PQ-072` exact-key prewarm) |
| §3.15 VFX on-glass/table sizing | `PQ-115`, `PQ-121`, `PQ-126` |
| §3.16 shadow glass set | `PQ-077` |
| §3.19 dynamic resolution | `PQ-056` / present; `PQ-058` resource governor |
| §3.5/§3.6 admission + world-record scans | `PQ-070` (offstage work freeze), `PQ-080` (table cadence) |
| §3.21–3.23 HUD/map/screen cadence | `PQ-088` (HUD/audio cadence), `PQ-102`/`PQ-117` (hidden screens) |
| §3.24–3.25 audio | `PQ-105` (audio table cull), `PQ-088` |
| §3.26–3.29 save/boot bursts | `PQ-087` (autosave hitch), `PQ-103`/`PQ-104` (decode/binary cache, boot family) |
| §4 allocation hygiene batch | `PQ-106` (hot-alloc shapes) |
| §2.6 platform scaleout | `PQ-082`/`PQ-083`/`PQ-089`–`PQ-093` |
| Draw-order/present experiments | `PQ-052`, `PQ-076`, `PQ-078`, `PQ-097`, `PQ-116`, `PQ-107` |

Items **not** in the catalog that likely merit new leaves via a `PQ-094` sweep note: §2.1
(tier-aware pixel-ratio default), §2.3 (galaxy-map planner per-frame), §2.5 (tactical-AI
membership/stamp restructure), §3.1 (combat kernel typed iteration), §3.20 (HUD box-shadow paint
animations).

## 7. How to try any of these (repo contract)

- Run the investigation first when the owner is unknown: `npm run probe:runtime-witness` and read
  `.devshots/runtime-witness/report.md`; the catalog's `PQ-061`–`PQ-063` censuses name owners.
- Before/after on the same machine/window/seed: `npm run check:perf` (p95, hitch count, phase
  p95s, `render.calls` peak), `npm run check:hitch-budget`; graphics-adjacent changes also take a
  paired still-diff so the default picture provably holds (`PQ-111`).
- Sim-touching cadence/physics changes must clear the determinism lab before keep (`PQ-066`); no
  golden re-recording to pass.
- Quality-default experiments (§2.1, §3.14–§3.16) are product decisions with evidence, not gate
  shortcuts — `design/PERF_BUDGET.md` §3 governs.
