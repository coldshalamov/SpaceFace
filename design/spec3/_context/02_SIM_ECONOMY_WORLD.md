# 02 — SIM, ECONOMY & WORLD (recon brief for spec3 planning)

**Scope:** the "simulation & content data" spine — economy, mining, cargo, world/sectors, missions,
automation, factions, ships, and `src/data/**`. Sibling agents own flight/physics/combat CODE, render,
and UI screens; this brief deliberately does NOT deep-dive those.

**How to read this:** every claim is cited `file:line`. Numbers are quoted verbatim from live code
(`src/data/**`, `src/systems/**`), not from the design docs — where the two disagree, the disagreement
is itself flagged (see §0 "SCHEMA DRIFT"). Planning agents should treat this file as ground truth for
"what the sim actually does today" and treat `design/CONTENT_BIBLE.md` as the *intended balance* it
was back-solved from.

---

## 0. ORIENTATION & THE ONE BIG DRIFT YOU MUST KNOW

### 0.1 Data catalog (all pure-data, no `three` import)
`src/data/`: `commodities.js` (33 cmdty), `ships.js` (13), `weapons.js` (13), `modules.js` (31),
`tech.js` (28 nodes), `blueprints.js` (19), `sectors.js` (10), `sectorAnchors.js`, `factions.js` (8 +
REP tables), `missions.js` (10 types + 8 story beats + OFFER_MIX + tuning), `mining.js` (18 ORES / 6
ASTEROIDS / 4 BEAMS / 4 RECIPES / 4 FIELDS), `automation.js` (BALANCE + DRONES/TRADERS/OUTPOSTS),
`claimableBodies.js`, `enemies.js`, `narrative.js`, `impulseCharges.js`, `palettes.js`,
`newGameDefaults.js`, `combatDefs.js`, `audioRecipes.js`.

### 0.2 SCHEMA DRIFT — `CONTENT_BIBLE.md` is one generation behind the live IDs
`design/CONTENT_BIBLE.md` (1134 lines) is the **balance authority + progression-curve doc**. Its
NUMBERS carried forward and are still the spine (activeRefByTier, prices, rep tiers, mission BASE, etc.),
but its literal **schema/IDs are stale**. It references files and ids that no longer match live code:

| CONTENT_BIBLE (stale) | LIVE code (ARCHITECTURE §0.4 prefixes) |
|---|---|
| `src/data/ores.js`, `asteroidTypes.js`, `techTree.js` | consolidated into `src/data/mining.js`; `tech.js` |
| faction ids `scn / mts / dmc / reach / quiet / vael / free / choir` | `faction_scn`, `faction_mts`, … |
| sector ids `s0_helios`, `s2_tethys`, … | `sector_helios_prime`, `sector_tethys_junction`, … |
| tech ids `combat_basics`, ship ids `wasp`, module `w_pulse_s` | `tech_combat_basics`, `ship_wasp`, `wpn_pulse_laser_s`, `mod_*` |
| commodity ids `ore`, `refined_metals` (bulk feedstock) | `cmdty_ore_iron`, `cmdty_refined_metals`, … (33 items) |
| tech tree "27 nodes" | **28 nodes** live (`tech_advanced_navigation` added) |
| mission BASE cargo 120 / mining 90 | **retuned**: cargo 180 / mining 130 (see §5) |
| STORY_BEATS generic (`mine 10u rock, deliver home`) | **rewritten** to the 47-A / Director Vale spine (see §5.3) |

**Planner takeaway:** do not grep the CONTENT_BIBLE for ids. Use it for *target economics*; use
`src/data/**` for *actual ids and shapes*. A "reconcile CONTENT_BIBLE to live schema" pass is itself a
worthwhile content task (it is currently misleading to any agent that trusts it literally).

### 0.3 GDD framing — "expose it, don't rebuild it"
`design/GDD_2_0.md:311` — *"The economy sim is the codebase's crown jewel — expose it."* §11 lists
surfacing work (price memory on maps, best-known-margin lines) rather than new sim. This brief's job is
to point at the deep-but-invisible systems (§1.7, §8).

---

## 1. ECONOMY SIM MODEL — the crown jewel

**Owner:** `src/systems/economy.js` (1172 lines). SOLE writer of `state.player.credits` (§0.6). Cycle
math in `src/systems/economyCycles.js`. Commodity catalog `src/data/commodities.js`.

### 1.1 The price formula (this is the core — memorize it)
Price is a pure function of `stock / baseEq`:

```
mid = basePrice * clamp( (stock / baseEq)^(-elasticity), 0.40, 2.60 )      economy.js:133-135
buy  = mid * (1 + spread/2)                                                  economy.js:497
sell = mid * (1 - spread/2)
```

- **`baseEq`** = the FIXED pricing reference = `BASE_EQ_DEFAULT(1000) * sizeFactor` (`S:0.5, M:1, L:2`).
  At `stock == baseEq`, `mid == basePrice`. (`economy.js:34,36,159-161,380`)
- **`equilibrium`** = the stock DRIFT TARGET (a *different* quantity from baseEq) =
  `baseEq * roleFactor` where `roleFactor = {produce:2.0, consume:0.35, none:0}` (`economy.js:35,163-165`).
  Producers drift stock ABOVE baseEq → surplus → cheap (they sell what they make). Consumers drift
  BELOW → shortage → dear (they buy what they need). **This surplus/shortage gradient is what makes
  A→B routes profitable** (`economy.js:9-13`).
- **The subtle bit** (`economy.js:17-23` "PRICING NOTE"): the spec's literal formula used `effectiveEq`
  as BOTH price reference and drift target, which collapses every price to `basePrice`. Live code
  deliberately splits them (baseEq = fixed reference, equilibrium = role-modified target) to reproduce
  the spec's worked route numbers. **Do not "simplify" this back together — it's load-bearing.**

### 1.2 Price impact (large trades) — closed-form integral, not per-unit loop
A trade of `qty` moves stock unit-by-unit along the price curve; the average unit price is the closed
form of `∫ s^(-el) ds` (`economy.js:137-149`, `avgMid()`):

```
avg = basePrice*baseEq^el / ((1-el)*ΔN) * (sHi^(1-el) - sLo^(1-el))     [el≠1]
    = basePrice*baseEq^el / ΔN * ln(sHi/sLo)                              [el==1]
```

Consequence: each route has a **capacity sweet spot** — margins diminish as you flood/drain a station,
so over-farming one lane self-decays. `quote()` returns `priceImpactPct` for the UI
(`economy.js:499-501`). Buy can't drain stock below 1u (`economy.js:526`).

### 1.3 Spread (the house edge) & frontier penalty
`SPREAD_BASE = 0.08` (8%), clamped `[0.04, 0.40]`. `spreadOf()` = base × event-mods × `(1 +
frontierPenalty)` (`economy.js:38-40,193-196`). **Frontier penalty** widens spread up to +6% in
low-security sectors: `clamp((1-security)*0.06, 0, 0.06)` (`economy.js:40,362-366`) — poor frontier
stations are worse places to trade, which is a real, working mechanic.

### 1.4 Stock regeneration (drift) — the living-market tick
Economy ticks every `ECON_TICK_S = 5`s of sim time (`economy.js:42,300-303`). Each tick, every
(station,commodity) stock drifts toward its effective target (`economy.js:337-341`):

```
stock' = clamp( stock + DRIFT_RATE(0.006) * driftMod * (effectiveEq - stock) * tickDt, 0, ∞ )
effectiveEq = equilibrium * eventEqMods(clamped 0.25..4.0) * cycleFactor        economy.js:182-190
```

Half-life ≈ ln2/0.006 ≈ 1.9 min. `driftMod` is normally 1 but a BLOCKADE event sets it to 0.1
(freezes restock). After drift, `recomputePrices()` caches `lastMid/lastBuy/lastSell` per entry.

### 1.5 Hidden regional price cycles — the "learn the wave" skill layer (`economyCycles.js`)
Per-station, per-commodity, seeded/deterministic sine cycles that multiply the drift target, giving
market charts a readable-yet-predictable shape:

```
cycleFactor = clamp( 1 + bias + amplitude*sin(phase + frequency*elapsed), 0.62, 1.52 )   economyCycles.js:99-105
```

- 5 regimes (`stable / volatile / rising / falling / turbulent`) with distinct amp/freq/bias presets
  (`economyCycles.js:26-40`). Frequencies are minutes-long (period ~58s to ~4.4min,
  `FREQUENCY_LO/HI 0.0004..0.0018`). Higher-`volatility` commodities get bigger amplitudes.
- Regimes re-roll every 180–420s (`REGIME_MIN/MAX_S`) so the player can learn the *current* wave.
- `predictPriceCurve()` (`economyCycles.js:117-137`) forecasts a mid-price curve "if the current
  regime holds" — this is the skill hook for a market-chart UI. **`regimeLabel()` gives human labels
  ("Rising demand", "Turbulent market").**

### 1.6 Economic events + propagation
`injectEvent()` (`economy.js:909-935`) supports 4 typed events, each attaching field-mods to entries:

| type | mods | pressure |
|---|---|---|
| shortage | eq×0.30, spread×1.5 | 0.7 |
| boom | eq×2.0 | 0.5 |
| blockade | drift×0.1 (freeze restock), spread×1.8 | 0.6 |
| piracy | spread×1.4 | 0.4 |

- Spontaneous events auto-roll ~every `EVENT_INTERVAL_S = 90`s game-wide, capped 3/station
  (`economy.js:43,45,316-319,967-983`).
- **Propagation** (`economy.js:986-1020`): shortage/boom bleed ONE hop along the sector-neighbour
  graph, nudging neighbour stock (shortage drains neighbours −, boom floods +; decays ×0.35/hop).
- Events also fire from other systems: `mission:forceEvent`, `combat:baseDestroyed` (destroying a
  pirate base triggers a narcotics shortage there, `economy.js:1022-1032`).

### 1.7 Contraband, scanning & fines — a fully working mechanic
`runScan()` (`economy.js:837-882`) rolls on jump-gate use / patrol proximity:

```
p_scan = clamp( BASE_SCAN(0.25) * (1+security) - scannerCloak, 0.02, 0.95 )    economy.js:46,845
```

If caught: fine = `Σ basePrice*qty*FINE_MULT[legality]` where
`FINE_MULT = {legal:0, restricted:0.8, illegal:1.2, contraband:1.5}` (`economy.js:48,852-858`).
Cargo is **confiscated**, a rep hit `-clamp(fine/2000, 2, 25)` hits the scanning faction, unpaid fines
become `debt` + `bounty` (`economy.js:867-875`). **Bribe path**: pay 30% of fine to keep standing
(`economy.js:50,884-891`). Contraband/illegal goods only appear at `blackmarket` stations
(`economy.js:118-121,388-390`).

### 1.8 Station differentiation — production/consumption profiles
Markets are built lazily per station from its TYPE's produce/consume role over the 33 commodities
(`economy.js:373-409`, `roleFor()` at 125-130). Station types:
`trade_hub, refinery, mining, fab, military, blackmarket, research`. Each commodity carries
`producedBy[]` / `consumedBy[]` arrays (`commodities.js:10-78`) — that's the entire supply-chain graph.
Example chains: `mining→ore→refinery→refined_metals→fab→hull_plate/circuitry→military`. A commodity
whose role is `none` at a station is simply not traded there (hidden).

### 1.9 Commodity data shape (`commodities.js` — 33 items, `cmdty_*`)
```js
{ id:'cmdty_ore_iron', name:'Iron Ore', category:'raw ore', basePrice:28, volatility:0.20,
  elasticity:0.40, legality:'legal', volPerU:1.0, massPerU:0.8, fineMult:0,
  producedBy:['mining'], consumedBy:['refinery','trade_hub'] }
```
**Value ladder (basePrice cr/u):** ores 8→500,000 (silicate 8 … iron 28 … platinoid 150 … einsteinium
2000 … raw emerald 5000 … ruby 20000 … diamond 100000 … **amazonite 500,000**). Refined 70–140,
components 165–200, tech 150–340, luxury 190–300, contraband narcotics 220 / stolen 150, military
weapons 280 / munitions 115 / impulse_charge 180. `volPerU` is the hold footprint; `elasticity` steepens
the price curve (staples ~0.30, luxuries ~0.70, amazonite 0.80).

### 1.10 Player-facing trade state (already tracked, mostly invisible)
- **`marketMemory`** — last-seen buy/sell/seenAt per visited station, saved under player
  (`economy.js:444-465`). This is exactly the data GDD §11 "price memory on maps" wants surfaced.
- **`marketIntel`** — snapshot per station for map/route-planner (`economy.js:430-441`).
- **`tradeLedger`** (last 10 trades) + **`tradeLots`** (FIFO cost-basis lots for real profit/margin
  accounting, `economy.js:610-665`). Lifetime stats: `lifetimeProfit`, `biggestSingleProfit`,
  `smuggledValue`, `tradesCount` (`economy.js:590-600`).
- **Services** (`ui:service`, `economy.js:740-806`): refuel `6 cr/u`, repair `0.9 cr/hp`, ammo
  `12 cr/u` (bought as `cmdty_munitions` into the hold), and **hull insurance** (rate 0.6, deductible
  500cr) — all working, all under-surfaced.

### 1.11 WHERE THE ECONOMY IS SHALLOW / INVISIBLE
1. **Regional cycles are computed but there is no market-chart UI** — `predictPriceCurve()` /
   `regimeLabel()` exist and produce forecast data nobody can see. This is the single biggest
   "expose it" opportunity.
2. **`marketMemory` exists but isn't overlaid on the nav map** (GDD §11's explicit ask).
3. **Events fire silently** — `economy:eventStarted/eventEnded` are emitted; a "market news / event
   ticker" would make the living economy legible.
4. **Cost-basis ledger (`tradeLots`) computes real per-trade margins** that never surface as a
   "you made X profit on this run" readout.
5. **Insurance / debt / bounty** are modelled (`player.debt`, `player.bounty`) with almost no UI.

---

## 2. MINING & MATERIALS

<!-- MINING SECTION — filled from mining sub-agent below -->

---

## 3. PROGRESSION — ships, modules, tech, blueprints

**Data:** `ships.js` (13), `weapons.js` (13), `modules.js` (31), `tech.js` (28), `blueprints.js` (19).
**Runtime:** `src/systems/ships.js` (fitting, derived stats, unlock gate).

### 3.1 Ship ladder (T0–T5, 13 hulls) — `src/data/ships.js`
Two-layer defence (hull + shield); no armor layer for player ships (armor is an enemy concept). `slots`
is a typed+sized grid `{weapon,shield,engine,cargo,mining,utility}` of `S/M/L`. Engine slot is always
exactly 1. `requiresTech` (a `tech_*` id) gates purchase.

| Ship | T | Role | Hull | Shield | Cargo | Mass | Slots W/Sh/E/C/M/U | Price | requiresTech |
|---|---|---|---|---|---|---|---|---|---|
| Kestrel | 0 | starter | 120 | 40 | 40 | 18 | 1/1/1/1/1/1 | 0 | — |
| Pelican | 1 | mining | 180 | 60 | 60 | 32 | 1/1/1/1/2/1 | 22k | — |
| Wasp | 1 | fighter | 150 | 110 | 15 | 16 | 2/1/1/0/0/1 | 28k | combat_basics |
| Mule | 1 | freighter | 200 | 70 | 140 | 55 | 1/1/1/3/0/1 | 35k | — |
| Drifter | 2 | multirole | 320 | 180 | 90 | 48 | 2/1/1/2/1/2 | 95k | — |
| Hornet | 2 | interceptor | 260 | 240 | 20 | 24 | 3/1/1/0/0/2 | 110k | strike_craft |
| Ironback | 2 | mining_barge | 480 | 160 | 200 | 90 | 1/2/1/3/4/2 | 130k | industrial_mining |
| Bastion | 3 | corvette | 640 | 460 | 70 | 80 | 4/2/1/1/0/3 | 320k | warship_license |
| Atlas | 3 | heavy_hauler | 720 | 300 | 480 | 200 | 2/2/1/6/0/3 | 380k | bulk_logistics |
| Ranger | 3 | explorer | 480 | 380 | 110 | 60 | 3/2/1/2/0/4 | 290k | long_range_survey |
| Warden | 4 | gunship | 1100 | 820 | 90 | 150 | 4/3/1/1/0/4 | 950k | capital_weapons |
| Colossus | 4 | battlecruiser | 1600 | 1100 | 200 | 300 | 5/4/1/2/0/5 | 1.4M | capital_hulls |
| Leviathan | 5 | flagship | 3200 | 2600 | 350 | 600 | 7/5/1/3/0/8 | 4.5M | flagship_command |

Each hull also carries a **`visuals` block** (family, proportions, tiers[], hardpoints[]) consumed only
by `render/visualFactory.js` — pure presentation, gameplay never reads it. Weapon slots may carry a
`facing` ∈ front/left/right/rear/turret, making loadout position a strategic choice (broadside vs nose).

### 3.2 Fitting & derived stats — `src/systems/ships.js`
Fit rule (§0.18): `slot.type === module.slotType && SIZE_RANK[slot.size] >= SIZE_RANK[module.size]`.
Derived stats fold equipped mass into speed/accel/turn (`getDerivedStats`, ships.js ~197-298):
`massRatio = totalMass/hullMass`; `speedMass = 2/(1+massRatio)`; `maxSpeed = engine.topSpeed*2.6*handling*speedMass`;
`turnRate = 4.4*turnMult*handling*turnMass`; `cargoCap = floor((hull.cargo + ΣcargoFlat)*(1+ΣcargoCapPct)*cargoCapMult)`.
Efficiency mults from tech (`shieldRegenMult, energyRegenMult, cargoCapMult, tradeFeeMult, miningYieldMult`)
apply globally to any hull after research.

### 3.3 Weapon/module catalog (~44 fittable items, 6-type slot grid)
**Weapons (13, `wpn_*`):** Pulse Laser S/M, Autocannon S / Heavy Autocannon M, Flak/PD Turret S, Beam
Laser M, Railgun M, Plasma Cannon M, Missile Rack M, Heavy Beam L, Torpedo L, Siege Lance L, EMP
Disruptor M. DPS band 31 (starter) → 210 (Siege Lance). Tracking types: fixed, hitscan, homing,
auto_turret. Heat-gated kinetics carry `heatPerShot/heatMax/heatDissip`; missiles/torps consume
`cmdty_munitions` ammo.

**Modules (31, `mod_*`):** 3 shields (booster S / capacitor M / aegis L: +60/+180/+520 shield), 3
engines (ion/fusion/warp: +70/+95/+130 topSpeed), 4 cargo (pod M +50 / expander L +160 / compactor L
+110&+15% / smuggler hold +8&hidden), 4 mining lasers (see §2), and ~10+ utility (afterburner,
shield hardener 12% DR, repair nanobots +4hp/s OOC, tractor 400 range, targeting computer +15%rng/+8%dmg,
sensor array +60% radar, drone bay, jump drive T2, chaff/ECM countermeasures, plus role kits: ram plate,
heavy-duty winch, charge rack, drill amp, survey suite). Slot types: `weapon, shield, engine, cargo,
mining, utility`.

### 3.4 Tech tree (28 nodes, 4 branches) — `src/data/tech.js`
Shape: `{id:'tech_*', branch, prereqs:['tech_*'], cost:{credits, rp}, unlocks:{ships[],modules[],
efficiency{},flags[],droneTierCap,npcTraderHiring,outpostConstruction}}`. Branch sizes: **combat 13,
industry 5, drives 4, logistics 6.** RP is earned from scanning/missions, spent here. 6 root nodes
(no prereq): combat_basics, deflector_theory, industrial_mining, bulk_logistics, drive_tuning,
tractor_systems. Cost ladder: cheapest `tractor_systems` (10k/15rp) → `flagship_command`
(2.5M/1200rp). Key capstones gate the endgame:
- `capital_weapons` (600k, prereqs warship_license+fire_control) → Warden + Heavy Beam L + Torpedo L
- `capital_hulls` (900k) → Colossus; `flagship_command` (2.5M, +graviton_drives) → Leviathan + Siege Lance
- **Logistics branch is the automation gate:** `drone_control`→droneTierCap:1, `drone_swarm`→cap:2,
  `autonomous_fleets`→cap:3+npcTraderHiring, `outpost_charter`→cap:4+outpostConstruction. This wires
  directly into §6.

### 3.5 Blueprints (19, `bp_*`) — `src/data/blueprints.js`
Crafting chain, 4 categories: **refine** (7, no tech: ore→refined at refinery), **assemble** (5, tech-gated:
refined+components→module/weapon at fab), **augment** (3, in-place module upgrade e.g. mining_laser_s→
mining_beam_m), **ship** (4: bulk materials→whole hull; Pelican/Mule/Wasp/Drifter craftable — note
higher-tier hulls have NO blueprint and are shipyard-buy only). Shape:
`{id, category, tier, stationType, requiresTech, inputs:{cmdtyId:qty}, outputs:{kind,id,qty}, fromModule?}`.

### 3.6 Unlock gating (how it all wires)
`ships.isUnlocked(def)` = `!def.requiresTech || player.researchedNodes.includes(def.requiresTech)`
(ships.js ~587). Modules/weapons use the same check. Blueprints gate on `requiresTech` too. Tech nodes
gate on ALL `prereqs` being researched. So the dependency graph is: **RP+credits → tech node →
(ship purchasable | module buyable | blueprint craftable | efficiency mult | automation flag).**

---

## 4. WORLD & SECTORS

**Data:** `src/data/sectors.js` (10 sectors, 262 lines), `sectorAnchors.js` (deterministic gate/station/
POI positions). **Runtime:** `src/systems/world.js` (jump FSM, fuel, interdiction, discovery, Dijkstra),
`sectorSim.js` (offscreen day-tick drift), `scanner.js` (pulse/hidden-POI reveal). **Identity docs:**
`design/world-identity/` (STORY_SECTOR_MAP, SECTOR_STYLE_INDEX, WORLD_NAVIGATION_SPEC, 10 sector md files).

### 4.1 Sector graph data model (10 nodes, ~20 bidirectional edges, handcrafted)
Shape (`sectors.js`): `{id:'sector_*', name, tier(0-4), security(0-1), securityLevel, factionId,
position{x,y} (star-map node coords), worldRadius(3500-5500), wealthIndex, dangerIndex, trafficPerMin,
enemyDensity(0-0.8), enemyLevel[min,max], neighbors[], stations[], fields[], hazards[], pois[]}`. Special
edges: `wormholeTo:{sectorId, gatedBy:'tech:...'}` (Veil→Ashfall, one-way, gated by long_range_survey).
Jump graph (bidirectional):

```
helios_prime    → [ceres_belt, tethys_junction, vesta_forge]
ceres_belt      → [helios_prime, tethys_junction, pallas_drift]
tethys_junction → [helios_prime, ceres_belt, vesta_forge, io_reach]
vesta_forge     → [helios_prime, tethys_junction, charon_expanse]
pallas_drift    → [ceres_belt, io_reach, sker_haven]
io_reach        → [tethys_junction, pallas_drift, charon_expanse, veil_nebula]
charon_expanse  → [vesta_forge, io_reach, ashfall_reach]
sker_haven      → [pallas_drift, veil_nebula]
veil_nebula     → [io_reach, sker_haven, ~wormhole~ ashfall_reach]
ashfall_reach   → [charon_expanse]   (entered via veil wormhole; one-way back to charon)
```

### 4.2 Jump / fuel / interdiction (live formulas from `world.js`)
- **Fuel:** `BASE_FUEL = 4 units/ly`. Edge distance derived from map positions
  `clamp(raw*1.4 + 1.5, 2, 9)` ly. Cost `ceil(BASE_FUEL * edgeDist * drive.tierFuelMult)`. Start fuel
  100/100. Abort refunds 50%.
- **Jump drive tiers:** T1 `{charge 8.0, fuelMult 1.0, stealth 0.0, hotJump false}`, T2
  `{5.5, 0.85, 0.15, false}`, T3 `{3.5, 0.70, 0.35, hotJump true}`.
- **Jump FSM:** IDLE→CHARGING(`baseCharge*edgeDist/4`)→JUMPING(consume fuel, ~1.2s tunnel)→
  COOLDOWN(6s drive / 0s gate)→IDLE.
- **Gate toll:** `security>0.6 ? round(50 + 200*security) : 0` (via `economy:chargeCredits`).
- **Interdiction (drive route):** `clamp(BASE_INTERDICT(0.35) * (1-security) * (1-driveStealth), 0, 0.6)`.
  Helios ≈0.7%; Ashfall ≈21.6% with T3. Rolled on arrival from seeded RNG; ambush spawns
  `1 + floor(rng*(1+tier))` enemies and injects a danger impulse into `sectorSim`.
- **Dijkstra routing** (`world.js`): over DISCOVERED edges only; weight = fuel cost (or 1 in hops mode);
  returns `{legs:[{from,to,fuel,charge,interdict}], totalFuel, totalHops}`.

### 4.3 Fog-of-war / discovery
`state.world.discovery[sectorId] = {discovered, visitedCount, pois:{[id]:{discovered,identified,
bossDefeated}}, fieldsDepleted:{[fieldId]:0..1}}`. Entering a sector marks it discovered and **reveals
one-hop neighbours** (Elite/EVE "see ahead"). Uncharted sectors (tier ≥3) can be pre-charted by buying
**survey data** for `750 + tier*1250` cr from an adjacent station. POIs: non-hidden auto-discover within
`scanRange*(1+0.25*scannerTier)`, identify within 50% range; **hidden POIs require an active scan pulse**
(`scanner.js`, 8s cooldown, 1200wu ping, `HIDDEN_POI_RADIUS 2000`). Boss defeat persists across reload.

### 4.4 POI & hazard types
POI types: `beacon, derelict, cache, colony, anomaly, wormhole, wreck`. Hazard types:
`dense_asteroid, nebula, radiation, debris` (with `{center, radius, intensity, moving?}`). Claimable
bodies are a special POI (`claimable:true, size`) — currently only **2 exist**: Io Reach (size M) and
Charon Expanse (size S). Boss arena (`poi_boss`, Ashfall) hard-spawns the dreadnought once per save.

### 4.5 The 10 sector identities (from `design/world-identity/`)
| # | id | name | band | one-line identity |
|---|---|---|---|---|
| 1 | sector_helios_prime | Helios Prime | core | Clean core, full-spectrum air; tutorial-safe home (enemyDensity 0) before danger begins. |
| 2 | sector_ceres_belt | Ceres Belt | belt | Industrial refinery band where ore-refining begins; yellow-white light slipping, maintenance overdue. |
| 3 | sector_tethys_junction | Tethys Junction | core | Four-gate contracts hub where factions compete openly; "under review" has stopped meaning anything. |
| 4 | sector_vesta_forge | Vesta Forge | belt | Fab-ring foundry with slag radiation; module-craft industrial band under strain. |
| 5 | sector_pallas_drift | Pallas Drift | fringe | Hollowed-out smuggler haven, layered graffiti; Quiet-faction black market in contested sodium-red. |
| 6 | sector_io_reach | Io Reach | fringe | Contested gate-5 bourse where factions overlap; claim-filing rewards a patience the system won't repay. |
| 7 | sector_charon_expanse | Charon Expanse | belt | Cinder refinery at the wrong-light extremity; recyclers overextended, bounty-board / pressurized-air economy. |
| 8 | sector_sker_haven | Sker Haven | fringe | Gate-camped pirate haven; graffiti written for future people, not present ones. Rep-gated black market. |
| 9 | sector_veil_nebula | Veil Nebula | anomaly | Vael-built research space, best air in the outer sectors; wormhole gate to the endgame through the nebula. |
| 10 | sector_ashfall_reach | Ashfall Reach | anomaly | Pit-smell endgame: thin cold air, moving radiation, sparse graffiti, dreadnought boss arena at the river's end. |

### 4.6 World gaps (code vs. identity-docs intent)
Overall the 10 sectors are faithfully realized (stations, hazards, POIs, claimables all placed). Two
gaps: (a) **Charon Expanse** identity doc wants a *bounty-board station / pressurized-air secondary
market*, but code defines only a refinery — the bounty-board archetype is missing. (b) Tethys identity
leans on a rich "contracts board" that the data represents only as generic `missions` services. Also
note: the map is small and 100% handcrafted — **no procedural sector generation**, so "more world" =
authored content, not a generator.

---

## 5. FACTIONS & MISSIONS

**Data:** `factions.js` (8 factions + REP_TIERS + REP_ACTIONS + REP_CONFIG), `missions.js` (10 types +
8 STORY_BEATS + OFFER_MIX + MISSION_TUNING), `narrative.js`. **Runtime:** `factions.js`, `missions.js`,
`story.js`.

### 5.1 Factions & reputation (−1000..+1000, 9 tiers)
8 factions (id / start rep): `faction_scn` Solar Concord Navy (lawful, 0), `faction_mts` Meridian Trade
Syndicate (corporate, 0), `faction_dmc` Drift Miners Collective (blue-collar, 0), `faction_reach`
Crimson Reach (pirate, **−50**), `faction_quiet` The Quiet (smuggler, 0), `faction_vael` The Vael
(xenophobic, **−120**), `faction_free` Free Frontier (independent, **+40**), `faction_choir` Ascendant
Choir (zealot, 0). Each carries a `relations{}` matrix (−1..+1) used for spillover.

**9 tiers** (`factions.js` REP_TIERS): Sworn Enemy(−1000..−700) / Hated(−699..−400) / Hostile(−399..−150)
/ Disliked(−149..−30) / Neutral(−29..29) / Accepted(30..149) / Trusted(150..399) / Allied(400..699) /
Hero(700..1000). **Effects:** rep ≤ −150 → `aggro=true` + dock locked/attack-on-sight; Disliked →
`dock:'restricted'`. **Price multipliers** (t=rep/1000): buy `clamp(1 − 0.30·max(0,t) + 0.40·max(0,−t),
0.70, 1.40)`, sell `clamp(1 + 0.20·max(0,t) − 0.30·max(0,−t), 0.70, 1.20)` — allies buy cheaper, hostiles
pay a surcharge.

**Rep change actions** (REP_ACTIONS): kill_faction_ship base −25 × classMult {scout .6/fighter 1/gunship
1.5/frigate 2/capital 2.5} (only if witnessed, range 1200wu); trade `+0.5/1000cr` cap +3/dock; complete
mission `+15×repMult`; fail `−12`; caught_contraband `−40×escalation`; rescue_distress `+20`.
**Diminishing returns:** near ±1000, deltas taper to 0.4× (last stretch is grindy). **Spillover:** one
non-recursive round weighted by the relations matrix, capped ±8/event.

**Living faction layer (deep, under-exposed):** each faction has a daily-updated `power` score
(`5 + 6·sectors + min(12,2·haulers) + min(8,3·stations) − 6·aggro`). **5 contested sectors** with per-pair
`{tension, state cold/tense/war, playerLean, momentum}`; `tension≥75→war`, `tension≥40→tense`; when
`|momentum|≥100` a **sector flips owner**. Player kills on a contested pair nudge tension/lean. Wars
resolve on the sim-day tick. **This whole inter-faction-war system runs but is nearly invisible to the
player** — a top "expose it" candidate.

### 5.2 Missions (10 types, deterministic boards)
One multiplicative reward family across all types:
`reward = round(BASE[type] * (1+dist/2000) * RISK_MULT[riskTier] * fValue * fFaction * fTime)`.
`RISK_MULT = [1.0,1.3,1.7,2.2,3.0]`; `fFaction = 1.15 if rep≥25 else 1.0`; `fTime` = rush opt-in.

**Live BASE (retuned vs CONTENT_BIBLE):** cargo_delivery 180, bulk_trade 170, bounty_hunt 200,
mining_quota 130, salvage_retrieval 160, escort 180, patrol_clear 220, smuggling_run 250,
passenger_transport 160, recon_scan 140. Types carry `riskTierRange`, `chainable`, `collateral` flags.

**Board generation (deterministic per station+epoch):** `epoch = floor(simTime/600s)`;
`seed = hash32(meta.seed, stationId, epoch)`; offer count `clamp(3+sizeTier, 3, 9)`; type picked from
`OFFER_MIX[stationType]` weighted by `repBoost = 1 + max(0,rep)/100` (higher rep surfaces a station's
signature missions). Per-offer: destination = distance-weighted reachable station; risk = clamped sector
danger (prefers drifted live hazard from sectorSim); distance `clamp(600+hypot·650, 600, 6000)`; time
limit `round((distance/140 + taskTime)·2.2)`; collateral 25% (bulk_trade/smuggling only). **Chaining:**
chainable missions store `chainNextSeed` and inject a follow-up of the same type on completion.
Standing gates: risk 0-1 needs Disliked+, risk 2 Neutral+, risk 3 Accepted+, risk 4 Trusted+.

**OFFER_MIX** (weights per station type over the 10 mission types) shapes what each station offers —
military stations skew bounty/patrol/recon, blackmarket skews smuggling/salvage/bounty, trade_hub skews
cargo/trade/passenger.

### 5.3 Story spine (8 beats) — LIVE version is the 47-A / Director Vale arc
Live `STORY_BEATS` (`missions.js:209-226`) have been **rewritten** from the CONTENT_BIBLE's generic
tutorial spine into a narrative arc:
- B0 cold_start (follow the 47-A mass signal, sample the discrepancy, dock at Helios) — introduces mining
- B1 honest_work (accept + haul a tracked contract) — trade
- B2 first_blood (arm Kestrel, destroy a bounty target) — combat
- B3 bigger_boat (afford any T2 hull) — shipyard
- B4 pick_a_side (accept an intro from MTS / SCN / Free Captains) — factions branch
- B5 proving_ground (complete faction chain: MTS trades / SCN patrols / Free smuggling) — chaining
- B6 empire_seed (deploy first passive asset) — automation
- B7 deep_reach (100k net worth + 50 branch-rep, then buy capital hull OR build+defend outpost) — endgame

**Antagonist: Director Vale** ("THE BOARD NOTICED") — files administrative codes (REF 44-C) controlling
customs / commodity allocation / atmospheric viability. A **HUD meta-arc** traces player complicity in 3
phases (PROTECTIVE → COMPLICIT → ABSENT; cargo manifest silently self-corrects as you become complicit).
Phase can advance early if law-faction rep ≤ −100. **5 endgame choices (A–E)** gated on 100k+50rep:
The Clean Uniform (Concord hero, record cleared) / The Same Silence (erased, logistics-only) / The Only
Honest Option (wormhole loop, campaign resets) / The Ledger Continues (become the next Kurtz) / The Next
Run (decline; 47-B opens PENDING). Cold-start hands over the Tessera from friend KAEL; graffiti "IF
YOU'RE READING THIS WE DIDN'T MAKE IT." **This narrative system is substantially built and is a real
asset** — worldbuilding docs in `docs/worldbuilding/story/` back it.

---

## 6. AUTOMATION (anti-idle) + CLAIMS (the base-building seam)

**Data:** `automation.js` (BALANCE + DRONES + TRADERS + OUTPOSTS), `claimableBodies.js`. **Runtime:**
`automation.js` (1530 lines), `claims.js`, `alphabet.js` (drone programs).

### 6.1 The balance anchor — A(T) sustained active income (the whole game's spine)
`AUTO_BALANCE.activeRefByTier = {1:250, 2:600, 3:1400, 4:3200, 5:7000}` cr/min (`data/automation.js`).
Every passive yield is sized as a fraction of A(T). `passiveCapFrac 0.45`, `overflowEff 0.25`,
`offlineEff 0.6`, `offlineCapSec 14400` (4h), `distressGraceSec 120`, `fleetCapByTier {1:2..5:8}`.

### 6.2 The signature mechanic — the GLOBAL PASSIVE CAP funnel
EVERY passive credit passes through `creditPassive()` (`automation.js:837-859`), a per-minute token
bucket sized at `passiveCapPerMin = A(playerTier) * 0.45` (playerTier = clamp(droneTierCap,1,5)):
```
_capBudget += (capLimit/60)*dt, clamped [0, capLimit]        // refilled each tick, automation.js:213-214
credited = min(gross, _capBudget); _capBudget -= credited     // overflow DROPPED, not credited
```
Note: live code **hard-clamps overflow to 0** (drops it) rather than applying the spec's `overflowEff
0.25`, because 0.25 of a big lump breaks the cap's upper bound (`automation.js:842-851`, verified).
Guarantees net passive/min ≤ cap ≤ active at every tier — passive **always** below active play.

### 6.3 Three accrual types
- **Mining drones** (`automation.js:237-510`) — REAL flying `type:'drone'` entities that orbit/seek the
  nearest asteroid in the home sector and chip ore into a SHARED capped buffer at the AUTHORED rate
  (`mineRate*count*dt`); out-of-sector they accrue abstractly. Fuel bleeds each tick; **fuel=0 → group
  LOST**. Buffer realized to credits only on Recall (through the cap funnel); recall costs
  `(fuelMax−fuel)*0.5` cr refuel. Tiers mk1-4: mineRate 0.8/1.6/3.0/5.5, bufferCap 60/120/240/480,
  cost 4k/12k/34k/90k, upkeep 6/14/30/60 cr/min.
- **Hired traders** (`automation.js:548-664`) — discrete 2-station A→B route; `cycleProgress += dt/cycleTime`;
  on completion credit `units*max(0,sellB−buyA)*tradeEff*(1−0.5·hotness) − routeFuelCost` (prices read
  LIVE from economy). **Hotness** rises +0.05/cycle on the same route and collapses the spread (forces
  re-routing), decays 0.1/min idle. Danger-scaled loss roll `clamp(baseLoss·(1+danger·2)·(1+hotness)·
  (1−speedMult)/guardMult, 0, 0.35)` — faster haulers survive better, escorts (guardMult) protect. On
  loss: trader gone + a pirate encounter spawns in the route sector. Each cycle applies
  `economy:applyTradePressure` so the route self-limits. Tiers: cargoVol 80/200/480, cycleTime
  180/240/320, hireCost 9k/28k/75k.
- **Outposts** (`automation.js:669-742`) — continuous production into capped storage (level-scaled
  `outRate*1.6^(L-1)`, `cap*1.7^(L-1)`); autosell every 60s at −20% penalty; raid roll every 600s
  `clamp(danger*0.4/defenseMult, 0, 0.5)` (defenseMult = defense/20 × 1.8 if guarded) → lose 70% storage,
  frozen 300s. Types: refinery (2 ore→1 alloys, cost 60k), fuelsynth (1 volatiles→1 fuel_cells, 45k),
  habhub (passive 12 cr/min direct, 110k). `OUTPOST_UPGRADE` to level 5 (outRate×1.6, cap×1.7, upkeep×1.5).

### 6.4 Upkeep, distress, repossession, offline catch-up
- **Upkeep** drains per-minute (`automation.js:747-776`): can't pay → `_distressAll()` freezes every
  asset; after `graceTimer ≥ 120s` unpaid, `_repossessOne()` takes the LOWEST-value asset (soft failure,
  never a hard wipe). Paying restores.
- **Offline catch-up** (`runOfflineCatchup`, `automation.js:1126-1207`) — on `save:loaded`, one coarse
  pass over elapsed away-time (clamped to 4h), sizing the cap bucket to the WHOLE window
  (`passiveCapPerMin * elapsed/60`), scaling realized income by `offlineEff 0.6` (presence always
  better), running one aggregated trader survival roll `(1−pLoss)^n`, then funnelling through the cap.
  Upkeep is charged for the full window; unpaid remainder distresses assets. Emits `automation:offlineSummary`.
- **Offscreen sector-sim risk pass** (`offscreenRiskPass`, `automation.js:1219-1279`) — ADR-0002: once
  per day-tick, sectorSim hands in a drifted-danger resolver so traders/outposts in NON-current sectors
  roll losses against live drifted danger, not the static catalog. Reuses the same loss machinery.

### 6.5 Fleet & alphabet programs
`fleetCapByTier` wingmen assignable from `ownedShips` with orders (escort/mine/guard/idle/attack) —
`_guardCountFor` lets guard-fleet ships cut an asset's loss/raid probability. **Alphabet programs**
(`alphabet.js`, `assignProgram`): a drone group can run a template (`mine_to_depot / patrol_guard /
scout_report`) instead of the legacy buffer loop — it mines into the player's REAL cargo (`addCargo`)
and sells at a depot for real credits (still through the cap funnel). This is the seam that bridges
automation → claims.

### 6.6 CLAIMS — the "you own a place" node system (`claims.js`, `claimableBodies.js`)
Base-as-node (NOT a tile grid). Verbs: CLAIM (fly to a claimable POI, pay `CLAIM_COST = 15000`; body
gets `BODY_SLOTS_BY_SIZE = {S:2, M:3, L:4}` slots), BUILD module, TELEPORT. Body modules (`BODY_MODULES`,
each `techReq` maps to a REAL tech node): **Cargo Depot** (4500, tech_outpost_charter — a MOVE beacon
alphabet drones resolve to), **On-Site Refinery** (12000, tech_deep_core_mining — auto-refines ore→
materials at 0.5/s, 2 ore→1 refined per REFINE_MAP), **Quantum Teleporter** (45000, tech_graviton_drives
— links body to a station, collapses your worst lane to one jump), **Defense Battery** (8000,
tech_outpost_charter — reduces raid risk). Only 2 claimable bodies exist in the world today (§4.4).
State: `state.claims.bodies[] = {id, sectorId, poiId, name, size, slots, modules[], linkedStationId,
x, z}`, serialized with a stable poiId re-attach seed.

### 6.7 Seams to extend toward player bases/claims
1. **Depot beacon** — alphabet drones already resolve a 'depot' MOVE target; a claimed body with a depot
   module is the natural sell-point. The plumbing exists; more templates + more claimable bodies = more
   depth.
2. **Only 2 claimable bodies** exist → adding claimable POIs to more sectors is pure content, no new sim.
3. **Outposts (§6.3) and Claims (§6.6) are two parallel "base" systems** with overlapping concepts
   (production, storage, defense, raids). A planner should decide whether to unify them or keep
   outpost=abstract-node vs claim=in-world-body. Claims teleporter ("rewrites the map") is the more
   ambitious, less-developed one.
4. **Faction war × claims:** contested-sector claims could be raided by the losing faction — a natural
   crossover (§5.1) that isn't wired yet.

---

## 7. BALANCE & CONTENT GAPS (where a planner should aim)

### 7.1 Where the numbers live
- **Master anchor:** `AUTO_BALANCE.activeRefByTier` (A(T)=250/600/1400/3200/7000 cr/min) — everything
  is back-solved from this. `design/CONTENT_BIBLE.md` §"PROGRESSION CURVE" is the human explanation
  (hull prices as "minutes of A(T)", passive capped at 0.45×A(T), etc.).
- **Economy tunables:** `ECONOMY_PRICE_TUNING` + consts at `economy.js:33-50`.
- **Nav tunables:** `world.js` (BASE_FUEL, drive tiers, interdiction). **Mission tunables:**
  `MISSION_TUNING`. **Faction tunables:** REP_TIERS/REP_ACTIONS/REP_CONFIG. **Mining:** `mining.js`.

### 7.2 What's flagged "reasonable first cut, not tuned"
The CONTENT_BIBLE explicitly frames its numbers as a *reconciled first cut* validated for
cross-reference integrity and three worked mission examples — NOT playtested balance. The
`check:balance` script guards the anchor math, not fun. Mission BASE rewards already drifted from the
Bible (retuned upward) with no doc update — a sign balance is being hand-tweaked ahead of the doc.

### 7.3 The 3 richest already-simulated systems that are UNDER-EXPOSED
1. **Regional price cycles + forecasting** (`economyCycles.predictPriceCurve/regimeLabel`) — full
   predictive market data with no chart UI. The single biggest "expose it" win.
2. **Inter-faction war** (power scores, 5 contested sectors, tension→war→sector-flip momentum) — an
   entire strategy layer running invisibly; needs a map overlay / news feed to become legible.
3. **Cost-basis trade ledger + market memory** (`tradeLots`, `marketMemory`) — real per-run
   profit/margin and last-seen prices, never surfaced on the map or a post-trade readout (GDD §11's ask).

### 7.4 The 3 biggest CONTENT/DEPTH gaps to target
1. **CONTENT_BIBLE ↔ live schema drift** (§0.2): the balance authority references dead ids/files and a
   stale story spine; any planner trusting it literally will be wrong. Reconcile it (or replace it with
   a generated-from-code balance sheet).
2. **World is tiny & 100% handcrafted** (10 sectors, only 2 claimable bodies, no procedural gen; Charon
   bounty-board archetype missing). "More game" = authored content, and the claims/base layer is
   starved of places to build.
3. **Automation vs Claims are two overlapping base systems** neither fully realized; the teleporter
   ("rewrites the map") and alphabet-program depth are the ambitious-but-thin frontier. Mining refining
   (§2) is likewise present as recipes but under-integrated into the moment-to-moment loop.

---

*(Mining section §2 filled below once its recon returns.)*
