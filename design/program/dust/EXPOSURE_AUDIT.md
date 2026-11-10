# DUST P1a — Encounter Exposure Audit (2026-10-31)

Read-only audit of the 354-module encounter library (`src/data/encounters/index.generated.js`,
registry built by `buildEncounterCatalog`, `src/data/encounters/catalog.js:33`). Every claim below
was verified against live code with Node imports of the real catalog, zones (`src/data/sectorZones.js`
via `zonesForSector`), and `SECTORS` (`src/data/sectors.js`, 25 sectors / 34 stations). The prior
census said "355 modules / ~12 rolling scripts"; the live registry imports **354** modules and the
truth about rolling is different and more useful (§1, §3).

## 1. Route map — how each of the 354 modules can be encountered

Method: full census, no sampling. For every module I evaluated (a) planner eligibility by replaying
the exact candidate filter of `planEncountersDay` (`src/systems/encounterDirector.js:3929-3942`)
against every sector's real zone types and the sector/tier/security gates; (b) lived-vignette
eligibility per `tickLivedVignettes` (`src/systems/livedWorldDirector.js:206-221`); (c) every
`requestAuthoredEncounter` caller in `src/` (grep-verified, constants resolved); (d) the unique-wreck
direct path (`gates.uniqueWreckOnly` + `planUniqueWreckEncounter`,
`src/data/encounters/planning.js:92-128`). Modules with no surviving route are **dark**.

| Bucket | Count | % | Mechanism (file:line) |
|---|---|---|---|
| (a) Ambient director roll only | 100 | 28.2% | `planEncountersDay` candidate filter + weighted draw, `encounterDirector.js:3929-3998` |
| (a)+(b/c) Ambient roll **and** another route | 13 | 3.7% | same, plus the callers below |
| (b) lived-vignette curated rotation only | 30 | 8.5% | `livedWorldDirector.js:214` (`livedRotation === true`), once-ever per save (`:217`, `:29-38`) |
| (b′) physical prop scenes | 2 | 0.6% | `scene_struck_bell`, `scene_sweep_window` — prop-proximity special case, `livedWorldDirector.js:209-213, 235-236`; runtimes `struckBellRuntime.js` / `sweepWindowRuntime.js` |
| (c) fixed owner placement — unique wrecks | 7 | 2.0% | `gates.uniqueWreckOnly`/`uniqueWreckId`; planned by `planning.js:92-128`, fired from `uniqueWrecks.js:1204` complications |
| (c) fixed owner placement — authored requests only | 7 | 2.0% | see table in §1.1 |
| (d) **NO route found (dark)** | **195** | **55.1%** | — |

Headline: **dark fraction 55.1% (195/354)**. Only **113 modules (31.9%)** are ambient-roll eligible
today. The prior "~12 scripts" census counted *script verbs*, not modules: the 113 roll-eligible
modules run 12 generic scripts (34 modules) plus 77 `script:'selfRegistered'` vignette modules and 2
scriptless majors (`the_grandee_transit`, `counting_relay` — dispatched via
`encounterScriptFor`, `encounterDirector.js:5051-5057`, which prefers
`SELF_REGISTERED_RUNTIME_BY_ID`).

### 1.1 Fixed owner placements (route c), complete list

| shapeId(s) | Owner / citation |
|---|---|
| `interlude_unknown_vessel`, `interlude_the_hand`, `interlude_second_client`, `interlude_the_ticker`, `interlude_the_drawer`, `interlude_the_smell_ticket` | story campaign 47a interludes — `src/story/campaign47a/interludes.js:24-89`, dispatched via `missionStoryOps.js:1820` |
| `claim_threat` | claim-defense warning — claims owner `claims.js:1540,1557` → director `_resolveClaimDefensePlan` `encounterDirector.js:1636-1654` |
| `patrol_beat` (also ambient) | claims depot patrol — `claims.js:2956`, id at `claimsReadModel.js:45` |
| `last_argument_passage` | `lastArgument.js:190` (id at `src/data/lastArgument.js:4`) |
| `kilnback_intro` / `mothlight_intro` / `pallet_jack_intro` / `scissorwake_intro` | one-off cast systems `kilnback.js:319`, `mothlight.js:263`, `palletJack.js:436`, `scissorwave.js:112` (ids in `src/data/{kilnback,mothlight,palletJack,scissorwake}.js`) — all four are ALSO ambient-roll eligible |
| `the_nest` | `nestVisit.js:128` (also ambient) |
| `ambush_snare` (also ambient) | travel-lane ambush `travelLanes.js:1184,1223` + `src/data/travelLaneRoutes.js:83`; convoy depot-watch `trafficConvoyOps.js:391`; deniable-cause clause `encounterDirector.js:1236` |
| `the_eighth_bell`, `the_runaway_kiln` (also ambient) | trailer staging `trailerEncounterStaging.js:16-21`, list at `src/data/trailerMoments.js:47` |
| `pro_salvage_outfits` (also ambient) | salvage-outfits discovery `src/features/salvageOutfits/discovery.js:47` |
| `depth_h5_corridor_massacre` (also ambient) | Orrin witness case re-anchor `src/data/orrinWitnessCase.js:61` |
| `unique_wreck_*` (7) | `uniqueWrecks.js:1204` (`complication.encounterId`); modules 130-171, 343 — `zoneTypes: []` keeps them out of the planner by design ("Direct-only R2 encounter hook", module header) |

Sector-POI anchoring exists but is rare: exactly **1** module uses `anchorPoiId`
(`depth_h1_distress_from_inside` → `poi_helios_yard`, picked by `pickZoneFor`,
`encounterDirector.js:4224-4239`); 10 modules use `earlyWindowGuaranteeDay` teach-day guarantees
(splice-immune beats, `encounterDirector.js:4017-4078`).

### 1.2 The dark 195, by family

| Family | Count | Why dark |
|---|---|---|
| `lived_*` 4xx compatibility catalog (orders 391-498) | 148 | `gates.externalOnly` → planner filter rejects (`encounterDirector.js:3935`) AND `livedRotation !== true` → lived tick rejects (`livedWorldDirector.js:214`). Row-459 ruling: "no longer fire uninvited"; **no authored requester exists** (grep: only own module + `presentation.generated.js`) |
| `lived_*` 5xx grid (orders 500-566) | 67 | same — includes the entire 5xx family; the **one** exception is `lived_mining_belt_toll_choir_follow_on` (536) which has `livedRotation: true` |
| `scene_*` ambient scenes (orders 902-925) | 22 | `ambientScene: true` + `sectorIds` in the body, but `ambientScene ∩ livedRotation = 0`, so the ambient bucket inside `pickLivedVignette` (`livedWorldDirector.js:63-71`) is **unreachable dead code** — candidates can only contain `livedRotation` modules or the two prop scenes |
| named 3xx vignettes (orders 372-390: `the_kettle_hold` … `the_wrong_berth`) | 19 | `externalOnly`, no requester |
| `k1_*` (orders 170-210) | 5 | `externalOnly`, no requester (only self + presentation references) |
| depth follow-ons (300, 310) | 2 | `externalOnly`, no requester |
| `resonance_obelisk_patrol` | 1 | `zoneTypes: []` → planner filter rejects; no requester |

(148+67 counts overlap the 30 rotation modules; the families above are counts of dark members only.)

## 2. Community vignette reachability (5xx-lived and friends)

- The 5xx grid is **zone-family × situation × twist × actor** combinatorics
  (`lived_<zone>_<situation>_<actor>_<twist>`). Every zone family it uses exists in reachable
  sectors (`zonesForSector`): e.g. `planetary_mass` → sector_tethys_junction only; `colony` →
  sector_charon_expanse only; `nebula_fog` → sector_veil_nebula + sector_eris_margin;
  `trade_lane`/`patrol_corridor` → helios/tethys/io/dione; the other ten families span 4-16 sectors
  each. All 25 sectors are reachable on the ordinary jump graph (`neighbors` in `sectors.js`; no
  locks found). **Placement conditions are satisfiable — the family is dark for mechanical reasons
  (`externalOnly` + `livedRotation !== true`), not placement mismatch.**
- The 24 `ambientScene` modules (which DO carry per-sector `sectorIds`) are spread thin and are all
  dark except the two prop scenes (§1.2). Authored placement concentration (module `sectorIds`):
  helios_prime/dione_lane/kepler_scar/pallas_drift/io_reach/phoebe_echo 3 each; 11 more sectors 2
  each; the rest 1.
- The 30 `livedRotation` modules cover all 14 zone families (2-3 each) and are presentable in every
  sector (hosts: tethys 14, ceres 13, charon 13, pallas 11, helios 11, veil 10, io 10, …) but are
  **once-ever per save** (`livedWorldDirector.js:29-38, 217`) with a 90 s world gap (`GAP_S`,
  `:18`) and require standing inside an authored zone of the family's type (`:218-219`).

**The 8 communities where authored vignette content is most concentrated** (station ids from
`src/data/sectors.js`; scenes = ambientScene placements, rot = rotation modules presentable,
uniq = single-sector ambient shapes):

| # | Sector | Stations | Evidence |
|---|---|---|---|
| 1 | sector_helios_prime | station_helios, station_coalition | 3 scenes, 11 rot, 7 uniq (`opening_hauler_raid`, `salvage_tail`, `second_rinse`, `candle_relighting`, `the_witnessed_price`, `the_fire_sale`, `depth_h1`) |
| 2 | sector_tethys_junction | station_tethys, station_customs | 2 scenes, 14 rot (max), uniq `sling_chord`, `the_declaration`, `two_ships_one_mistake` |
| 3 | sector_ceres_belt | station_ceres, station_beltout | 2 scenes, 13 rot, uniq `belt_claim_jumpers`, `pro_shipbreaking_yard`, `pro_industrial_disasters`, `the_working_battlefield`, `kilnback_intro` |
| 4 | sector_vesta_forge | station_forge, station_vesta_outlying_yard, station_depot3 | 1 scene, 9 rot, uniq `winnow_throw`, `the_eighth_bell`, `the_runaway_kiln`, `glue_meet_mass`, `the_blind_welder` |
| 5 | sector_pallas_drift | station_drift, station_smuggler | 3 scenes, 11 rot, uniq `the_drift_auction` |
| 6 | sector_io_reach | station_reach, station_io_merc | 3 scenes, 10 rot, uniq `depth_h4`, `depth_h5`, `mothlight_intro` |
| 7 | sector_charon_expanse | station_expanse | 1 scene, 13 rot |
| 8 | sector_veil_nebula | station_veil | 2 scenes, 10 rot, uniq `surge_line` |

(Dead-scene leaders dione_lane, kepler_scar, phoebe_echo tie at 3 placements each but have no other
vignette mass — first candidates for P1b lighting.)

## 3. Widening seams in `encounterDirector.js`

**Where ambient rolls select scripts — the whole chain:**

1. `_planSector` (`encounterDirector.js:865-903`) — per (sector, dayIndex) on `day:tick`/enter/load;
   calls `planEncounters` (`:892`), pushes `dir.pending` with `dueAt = now + delay` (`:900`).
2. `planEncounters` (`:3874-3899`) — hour bucket = `SHAPE_BUCKET_DAYS = 6` sector-days
   (`:3898`, from `ENCOUNTER_SHAPE_HOUR_SECONDS 3600 / ENCOUNTER_REPETITION_DAY_SECONDS 600`);
   carries grammar-key counts + `seenShapes` across the bucket.
3. `planEncountersDay` (`:3905-4086`) — the roll:
   - candidate filter `:3929-3943`: `e.tier === tier` (deck tiers: major/minor/ambient), zone-type
     match (or `anchorPoiId` present), **rejects `gates.externalOnly` (`:3935`)**, rejects
     `gates.sectorIds` not containing this sector (`:3938`), `minSectorTier`/`maxSecurity`/
     `minSecurity` (`:3939-3941`).
   - slot-count roll `:3945-3951`: major `roll < 0.35 ? 1 : 0`; minor `1 + floor(roll*2)` (≤2);
     ambient `floor(roll*4)` (≤3). Caps `MAX_MAJOR_PER_DAY 1 / MAX_MINOR_PER_DAY 2 /
     MAX_AMBIENT_PER_DAY 3` (`:194-196`).
   - weight `:3963-3970`: `weightOf = regionalEncounterWeight(ecology, sector, shape) × earlyFactor
     × (unseen-in-bucket ? 6 : 1)` (`SHAPE_UNSEEN_WEIGHT`, `:198`).
     `regionalEncounterWeight` (`regionalEcology.js:249-260`) folds ecology bias; note
     `Math.max(0, Number(w) || 1)` — **`weight: 0` coerces to 1, it does not disable**.
   - draw `:3978` → `pickWeighted` (`:4250-4260`): one `rng()` per attempt over the ordered
     candidate list, `r -= Math.max(0, Number(weightOf(e)) || 1)`.
   - retry loop `:3977-3991`: rare gate `rng() < 0.75` drops (`RARE_GATE`, `:197`); zone pick
     `pickZoneFor` (`:4223-4247`, anchored POI or uniform zone); grammar budget skip
     `:3985-3986` (`ENCOUNTER_SHAPE_BUDGET_PER_HOUR = 4`, `encounterScripts.js:3991`).
   - rng stream: `mulberry32(hash32(seed, sectorId, dayIndex))` (`:3909`) — **one sequential stream
     per (seed, sector, day); see §4**.
4. Fire-time `_pump` (`:1261-1373`, 1 Hz): rank by `tensionCandidateRank`, then
   `encounterPacingBlockReason` (`:5200-5231`): docked/tutorial/tension/rhythm, **cooldown
   `dir.cooldowns[shape.id]`** (`:5207`; stamped at resolve `:2531`, abort-min `:2602`),
   **pressure `dir.pressure[deck] < shape.pressureCost`** (`:5208`; accrual `:911-950`, pool cap
   `POOL_MAX 140` `:209`), `MIN_GAP_S 30` / `MAJOR_EXTRA_GAP_S 240` / ambient caps/gaps
   (`:5214-5229`), then `_gatesPass` (`:1457-1501`: `sectorIds`, `storyBeatMin`, `minSectorTier`,
   `requiredTech`, `minCargoValue`, `bountyOnly`, `claimsOnly`, `moralDebtOnly`, `uniqueOnce`,
   `requiresCompletedShape`, security bounds), proximity/relocation (`:1325-1344`), spawn admission
   (`:1352`), `fireReady` hold (`:1360-1370`, `FIRE_READY_HOLD_S 60`).

**What a new module needs to be roll-eligible:** file `src/data/encounters/NNN-name.js` exporting
`encounterOrder` (unique positive int), `trigger` (deepFreeze), `default` (defineEncounter), plus
`runtime = compileVignette(spec)` for vignette behavior; regenerate
`src/data/encounters/index.generated.js` via `scripts/build-encounter-index.mjs`. Trigger must
carry: `tier` major/minor/ambient; `deck`; `weight > 0` (0 is coerced to 1 — do not rely on it to
disable; empty `zoneTypes` disables); `zoneTypes` matching real `zonesForSector` types; **no
`gates.externalOnly`**; satisfiable `gates.sectorIds`/tier/security; `pressureCost` the deck can
afford; `cooldownS`; `proximity` only if a zone-anchored approach is wanted. Vignette modules use
`script: 'selfRegistered'` + `fallbackScript` (squad plan falls back at
`src/data/encounters/planning.js:203`); live dispatch prefers the compiled runtime
(`encounterScriptFor`, `:5051-5057`).

**The lived lane** (`livedWorldDirector.js`): scan every 6 s (`SCAN_S :17`), one candidate at a
time, world must be calm (`:167-199`); pick is hash-bucketed, not weighted
(`pickLivedVignette :57-89`: curated `hash32(seed, sectorId, zoneKey, day, 'lived-vignette') % 5`
authored-vs-all, `% 3` overlay preference; ambient bucket `:63-71` currently unreachable — §1.2).

## 4. Determinism constraints — every pin that touches the director

| Pin | Path | What it pins | Would widening break it? |
|---|---|---|---|
| E6 shape budget | `test/e6-encounter-shape-budget.test.mjs` | planner walk (seeds 4242/8008 × 4 sectors × 10 h): ≥3 distinct combat shapeIds in h0-3 and h5-9; never a single combat shape/grammar for 3 h; walk deterministic; variety-floor mechanism pin (custom 3-shape catalog) | **Yes, sequences** if candidates are added to existing pools (draws reshuffle); assertions are lower bounds so more variety likely stays green, but picks/timings change for every seed |
| Director acceptance | `scripts/check-encounter-director.mjs` | §2 planner determinism (same seed ⇒ byte-identical schedule), budgets ≤1/2/3, ≥45 s onset spacing, day variance; §3 runtime soak: identical runs ⇒ identical logs, mean ≥3 telegraphs over 4 seeds, gaps/caps/dock/tutorial/budget/pressure-spend; §5 gates | Self-consistent (not golden), but its own comment (`:174-179`) states roster changes reshuffle every sector-day; mean-floor could dip on unlucky reshuffles |
| Repetition meter | `scripts/check-content-repetition.mjs` | 10 h walk, any grammar key ≤ 4/hour | Widening with same-grammar shapes can exceed the budget unless lanes respect it |
| B1 supply | `test/b1-hours-income-encounter-supply.test.mjs` | planner supply > 0 every hour on route sectors | Safe under additive lanes; at risk if existing draws are displaced |
| Opening raid | `test/opening-hauler-raid-and-pursuit.test.mjs`, `opening-raid-waits-for-laden-carrier`, `opening-hauler-raid-timeout-ships-remain` | Day-0 Helios guarantee planned, delay 60-360 s, hauler present | Safe — guarantees are splice-immune (`encounterDirector.js:4031-4078`) if the existing stream is untouched |
| PQ-030.02 counter-first | `test/pq-030-02-counter-first.test.mjs` | teach-day guarantee economics | Safe (guarantee path) |
| Lived world | `test/lived-world.test.mjs` | `pickLivedVignette` hash-bucket behavior (incl. `lived-ambient % 3` at `:433-434`), compile integrity of all 225 vignettes, struck-bell specifics | Candidate-list changes alter bucket modulos; unit pins on the picker function signature stay |
| First ten minutes | `test/core-first-ten-minute-contract.test.mjs` | 90 s Helios starter sanctuary (no hostile acquire/fire), first-hostile ledger completeness | Property-based; safe unless a lit shape violates sanctuary (fire-time checks still apply) |
| Schedulability fixtures | `test/infer-vael-station-screen-schedulable.test.mjs` (+ per-shape cr-/depth-/eighth-bell/runaway-kiln tests, `scripts/check-living-universe-events.mjs`, `check-helios-living-pocket.mjs`, `check-m4-regional-ecology.mjs`) | specific shapes schedulable/behaving; mostly direct requests or guarantees | Safe under additive lanes |
| Sim goldens | `test/47a.telemetry*.expected.json` + `check:sim` (`scripts/sf-sim-cli.mjs:325-346`), `scripts/sim-golden-diff.mjs` | 720-tick 47a scenario authoritativeHash | **Unaffected** — the 47a system list does not include `encounterDirector` |
| Playthrough ledger | `scripts/run-actual-game-playthrough.mjs` (foreign-dirty; read only) | measurement only, no assertions | n/a |

**Verdict: widening via added candidates inside the existing per-(seed,sector,day) stream changes
every default-route schedule** (one sequential rng stream; `pickWeighted` consumes one `rng()` over
an ordered candidate list, so any roster/weight change reshuffles all picks — stated outright at
`check-encounter-director.mjs:174-179`). No golden pins a byte-exact schedule across changes (the
E6/director pins are self-consistency or lower bounds), but DUST contract 1 demands preservation of
default-route sequences, which is achievable — §5.

## 5. Recommended widening design (design only)

**Goal:** ≥3× distinct authored ids crossed on a 20 h ordinary route (baseline §6: ~70) ⇒ target
≥210 distinct — i.e. light up most of the 195 dark modules, without touching the existing stream.

1. **Additive parallel lane, separate rng stream (the core move).** Keep `planEncountersDay`
   untouched. After it returns, a new `planDustLaneDay(seed, sectorId, dayIndex, zones, catalog)`
   draws from its own `mulberry32(hash32(seed, sectorId, dayIndex, 'dust-lane-v1'))` stream,
   appends extra pending items (tier `ambient` first), and caps itself (e.g. ≤1 dust item/sector-day,
   ≤1/hour grammar budget share). Existing picks, delays, and fire order of legacy items are
   bit-identical because the legacy stream is never read differently. Fire-time competition is the
   one real coupling: dust items must yield to legacy items in `_pump` ranking (rank dust items
   strictly below legacy due items unless nothing else is due — a `dustLane: true` flag on the item,
   honored in `tensionCandidateRank`) so legacy pacing/cadence sequences are preserved.
2. **Append-only category registries.** Dust-lane membership is declared by a new append-only field
   (`dustLane: true` on the trigger, or an explicit id list in a new `src/data/encounters/dustLane.js`
   ordered by `encounterOrder`). Never reweight, remove, or reorder existing candidates in the
   legacy filter — that is the one operation that reshuffles the legacy stream.
3. **Light the 5xx grid + scene_* via the lane, home-first.** The lane's first cohort = the 5xx
   family members whose zone family matches the current sector (they are sector-agnostic by design),
   then the 22 dark `scene_*` (whose `sectorIds` are honored by the lane as a hard filter), then the
   3xx named vignettes, then k1_*/follow-ons with their authored sector gates. Per-module
   `cooldownS` and once-per-save rotation reuse `dir.cooldowns` / a new `dustSeen` map on
   `dir.stats` (same shape as `livedSeen`, saved with the director state).
4. **Reuse, don't duplicate, the lived tick.** `livedWorldDirector.tickLivedVignettes` already has
   placement, once-ever, and world-calm gating; extending its candidate filter
   (`livedWorldDirector.js:214`) to admit `ambientScene === true` modules re-activates the existing
   (currently unreachable) ambient bucket at `:63-71` — but that changes lived-lane buckets for the
   30 rotation modules (test/lived-world.test.mjs pins modulos). Safer: run ambientScene modules
   through the dust lane (§1) and leave the lived tick untouched.
5. **Pressure valve.** Dust items carry `pressureCost` paid from the civilian pool (they are
   no-combat scenes almost everywhere) so they cannot starve legacy combat pacing; `noCombat` shapes
   bypass `combat_busy` only, never dock/tutorial/rhythm blocks.
6. **If preservation were abandoned** (not recommended): inserting candidates into the legacy filter
   breaks, at minimum, the E6 walk's seed-4242/8008 pick sequences and the director soak's telegraph
   counts (`scripts/check-encounter-director.mjs:179-189` multi-seed mean), and every capture/ledger
   derived from default-route schedules. The 47a sim goldens stay green either way (§4).

Sizing: the dust lane at ≤1 item/sector-day over 120 sector-days (20 h) adds ≤120 presentations;
with unseen-bias rotation across ~190 newly lit modules, ≥140 distinct new ids is comfortably in
range, putting the total above 210 without touching legacy draws.

## 6. Baseline numbers for P1 (measured by P1c counters)

Derivation (planner replay, seed 17101, no ecology fold — the E6/B1 fixture convention; 6
sector-days/sim-hour): ordinary route Helios 4 h → Ceres 5 h → Tethys 4 h → Vesta 3 h → Pallas 2 h
→ Io 2 h (story-spine sectors per `src/story/campaign47a/` mentions, adjacent trades):

- **Scheduled (planner offers): 381 items, 78 distinct shapeIds** (Helios 27 / Ceres 35 / Tethys 33
  / Vesta 25 / Pallas 20 / Io 23 distinct per stay). Single-sector 20 h stays: Helios 31, Ceres 45,
  Tethys 46 distinct.
- **Crossed (presented) estimate: ~55-75 distinct ambient ids.** Assumptions: fire-time
  pressure/cooldown/proximity cull 25-45% of scheduled shapes at least once (soak evidence: ~1.5
  fires/sector-day vs 3.2 offers/sector-day in the §3 Sker soak; ordinary routes are calmer), while
  the unseen-shape ×6 bias and 120 days of rotation push every repeatedly-scheduled shape through.
- Plus fixed placements on the same route: 6 story interludes, 2 prop scenes, 0-7 unique-wreck
  complications (visit-dependent), ~5-12 lived-rotation vignettes (once-ever, zone-gated), 1-3
  claim-defense/depot beats.

**P1a baseline: ≈70 distinct encounter ids crossed in a 20 h ordinary route (55-90 band); ~78 is the
planner ceiling. 3× target ⇒ ≥210, which requires lighting ≈140+ of the 195 dark modules (§5).**

Assumptions to re-verify with P1c telemetry: fire fraction per shape class, route composition, and
that no off-route sector (nym/kepler/rhea/… 16 sectors) is needed — those add up to 25 more
planner-eligible ambient ids not counted above.

— P1a, 2026-10-31. Method: full-census node replays of the real catalog/zones/gates; all file:line
citations verified against the working tree at audit time.
