# Automation & Passive Income (anti-idle layer)

## Summary
Build-up layer adding deployable mining drones, hired NPC traders on routes, owned/built outposts, and basic fleet command. All passive yields are expressed as a fraction of an explicit active-income reference curve A(T) so total net passive income is hard-capped below active play. Drones accrue continuously into a capped buffer; traders pay on discrete cycle completion with a per-cycle loss roll; outposts produce continuously into a capped buffer. Upkeep credit drain, fuel/durability decay, and danger-scaled loss risk turn 'passive' into an attention/management cost, never true idle. Offline progress is a capped catch-up tick computed on load. Composes with economy (prices), mining (field/asteroid resolution), world/faction (sector danger), cargo, progression (tier), combat (hits/spawns), and notifications via the shared GameState + event bus.

## Mechanics
- Active-income reference A(T): designer-fixed credits/min of competent active play per progression tier. T1:250, T2:600, T3:1400, T4:3200, T5:7000 cr/min, stored as data table automation.balance.activeRefByTier. Every passive source's net yield is sized as a fraction of A(T_player).
- GLOBAL PASSIVE CAP: net passive income (after upkeep + expected losses) is clamped so passiveNetPerMin <= passiveCapFrac*A(T_player), passiveCapFrac=0.45. Gross above the cap is converted at overflowEff=0.25, so stacking automation never reaches active rates.
- THREE ACCRUAL TYPES. Continuous (drones, outposts): rate/s added to a capped buffer each tick (delta = rate*dt). Discrete (traders): profit credited as an event on route-cycle completion (cycleTime seconds); loss roll per cycle. Offline catch-up: on load, elapsedAway (capped at OFFLINE_CAP=14400s=4h) simulated in one coarse pass per source.
- MINING DRONES: deploy N drones near an asteroid field (within deployRange of player at deploy time). Each auto-targets the nearest live asteroid, flies to it, mines at mineRate (u/s) into a SHARED group buffer of capacity bufferCap. Buffer full -> drones idle (or auto-return if autoReturn). Player flies into group radius to collect (transfer to ship cargo, subject to free space) or recalls (banks buffer to linked outpost/station). Drones burn fuel and lose durability under attack; fuel=0 or durability=0 -> drone LOST (no refund). This is the attention cost.
- HIRED NPC TRADERS: hire a trader ship (one-time hireCost), assign a ROUTE = 2 known stations (A<->B). Each cycle buys low at A, sells high at B using live economy prices, nets profit credited on cycle completion. upkeepPerMin drains whether or not it completes. Each cycle rolls a loss chance vs route danger; on loss the trader and its in-transit cargo investment are destroyed.
- Trader route profit self-limits: each completed cycle emits trade pressure to the economy, depressing the next cycle's spread, so a single route decays and the player must diversify routes (a management cost).
- OWNED OUTPOSTS: buy an outpost slot or BUILD one at a discovered sector site. Recipe consumes input commodity at inRate, produces output at outRate into capped storage (storageCap). Player or an assigned trader hauls output to market, OR outpost auto-sells to local station at a 20% price penalty. upkeepPerMin; raidable if defense < raid strength.
- OUTPOST UPGRADES: levels 1..5; upgrading raises outRate, storageCap and defense, costs upgradeCost(level), raises upkeep. Defense reduces raid success and can be reinforced by assigning a fleet ship on guard.
- BASIC FLEET COMMAND: own up to fleetCap ships (T1:2 ... T5:8). Each owned ship gets one ORDER: mine (acts as a high-tier drone), trade (runs an assigned route), escort (follows player, adds to player combat), guard (parks at an outpost/drone-group to cut loss probability). One order per ship; switching has a redeployTime delay.
- ESCORT/GUARD COMPOSITION: a ship on guard multiplies the asset's effective defense and halves its loss/raid probability. This is how fleet command composes with the loss-risk system: defense spending trades against income loss.
- ATTENTION/MANAGEMENT COST (anti-idle enforcement): (1) drones must be recalled+refueled before fuel runs out or are lost; (2) routes go 'hot' as danger rises and spreads collapse, forcing manual re-routing; (3) outposts get raided and need defense/restock; (4) total upkeep scales super-linearly with fleet size so unmanaged sprawl bleeds credits. None resolve favorably without player action.
- UPKEEP DRAIN: summed upkeep deducted from credits each minute (applied per-tick as upkeep*dt/60). At credits=0, assets go 'distressed' (production frozen, fuel still bleeds, traders stop); after distressGrace=120s unpaid, one random distressed asset is repossessed per grace period (soft failure, not a hard wipe).
- OFFLINE/AWAY ACCRUAL: on load, elapsed=clamp(now-lastSave, 0, 14400s); coarse pass: drones add min(mineRate*elapsed, bufferCap) per group; outposts add min(outRate*elapsed, storageCap); traders complete floor(elapsed/cycleTime) cycles with one aggregated survival roll; realized credits multiplied by offlineEff=0.6 so presence is always better; upkeep for elapsed deducted.

## State Owned
- automation.drones: DroneGroup[] - {id, sectorId, fieldId, originPos:{x,z}, count:int, tier:int, sharedBuffer:{oreType,vol}, bufferCap:number, fuel, fuelMax, durability, durabilityMax, autoReturn:bool, state:'mining'|'returning'|'idle'|'distressed'}
- automation.traders: Trader[] - {id, tier, route:{fromStationId,toStationId}, cycleProgress:0..1, cycleTime, cargoVol, lastCycleProfit, upkeepPerMin, hotness:0..1, state:'enroute'|'trading'|'idle'|'distressed'}
- automation.outposts: Outpost[] - {id, sectorId, pos:{x,z}, recipeId, level:1..5, storage:{good,vol}, storageCap, defense, upkeepPerMin, autoSell:bool, raidCooldown, state:'producing'|'halted'|'raided'|'distressed'}
- automation.fleet: FleetShip[] - {id, shipDefId, order:'mine'|'trade'|'escort'|'guard'|'idle', targetRef:{kind,refId}, redeployTimer, hp, state}
- automation.fleetCap: int - max owned ships, derived from progression tier (T1:2..T5:8)
- automation.balance: {activeRefByTier:number[], passiveCapFrac:0.45, overflowEff:0.25, offlineEff:0.6, offlineCapSec:14400, distressGraceSec:120}
- automation.accumulators: {creditBuffer:number, upkeepDebt:number} - fractional per-tick credit accrual/drain carried between ticks to avoid sub-cr rounding loss
- automation.meta: {lastTickTime, totalPassiveEarnedLifetime, lostAssetsLog:[], rngSeed} - rngSeed feeds deterministic loss/raid rolls

## Content
- DRONE Mk1 | tier 1 | mineRate 0.8 u/s | bufferCap 60 u | fuelMax 240 | fuelRate 1.0/s | durabilityMax 40 | deployRange 350 wu | cost 4000 cr | upkeep 6 cr/min
- DRONE Mk2 | tier 2 | mineRate 1.6 u/s | bufferCap 120 u | fuelMax 360 | fuelRate 1.0/s | durabilityMax 70 | deployRange 400 wu | cost 12000 cr | upkeep 14 cr/min
- DRONE Mk3 | tier 3 | mineRate 3.0 u/s | bufferCap 240 u | fuelMax 540 | fuelRate 1.0/s | durabilityMax 110 | deployRange 450 wu | cost 34000 cr | upkeep 30 cr/min
- DRONE Mk4 | tier 4 | mineRate 5.5 u/s | bufferCap 480 u | fuelMax 720 | fuelRate 1.0/s | durabilityMax 180 | deployRange 500 wu | cost 90000 cr | upkeep 60 cr/min
- TRADER Hauler-L | tier 1 | cargoVol 80 u | cycleTime 180 s | tradeEff 0.9 | hireCost 9000 cr | upkeep 18 cr/min | baseLossPerCycle 0.02
- TRADER Freighter-M | tier 2 | cargoVol 200 u | cycleTime 240 s | tradeEff 0.92 | hireCost 28000 cr | upkeep 40 cr/min | baseLossPerCycle 0.025
- TRADER Bulk-H | tier 3 | cargoVol 480 u | cycleTime 320 s | tradeEff 0.94 | hireCost 75000 cr | upkeep 85 cr/min | baseLossPerCycle 0.03
- OUTPOST Ore Refinery | recipe 2 ore -> 1 alloy | outRate 0.5 alloy/s @L1 | storageCap 300 @L1 | buildCost 60000 cr | defense 20 @L1 | upkeep 50 cr/min
- OUTPOST Fuel Synth | recipe 1 gas -> 1 fuel | outRate 0.7 fuel/s @L1 | storageCap 400 @L1 | buildCost 45000 cr | defense 15 @L1 | upkeep 40 cr/min
- OUTPOST Hab/Trade Hub | passive credit gen, no input | outRate 12 cr/s @L1 capped by credit buffer 1500 | buildCost 110000 cr | defense 30 @L1 | upkeep 90 cr/min
- OUTPOST UPGRADE Lx | outRate x1.6/level | storageCap x1.7/level | defense +15/level | upgradeCost 0.8*buildCost*level | upkeep x1.5/level
- FLEET ORDER mine | ship acts as a high-tier drone (ship cargo as buffer, no fuel-loss, takes hull damage if attacked)
- FLEET ORDER trade | ship runs an assigned 2-station route, cargoVol = ship capacity, lower lossPerCycle (owned ships tougher)
- FLEET ORDER escort | follows player within 200 wu, adds its weapons to player-side combat
- FLEET ORDER guard | parks at an outpost or drone-group, x1.8 effective defense, halves that asset's loss probability
- FLEET CAP by tier | T1:2 | T2:3 | T3:4 | T4:6 | T5:8
- ACTIVE REFERENCE A(T) cr/min | T1:250 | T2:600 | T3:1400 | T4:3200 | T5:7000 (designer anchor all passive yields are sized against)

## Formulas
- Continuous accrual per tick (drones/outposts): bufferVol += clamp(rate*dt, 0, bufferCap - bufferVol). rate in u/s, dt in s.
- Drone group gross value/min: grossDrones = sum_groups( min(mineRate*count, fillRoom)*60 ) * orePrice(oreType). Realized only on collect/recall.
- Drone fuel: fuel -= fuelRate*dt each active tick; fuel<=0 -> group LOST. Refuel on recall: refuelCost = (fuelMax-fuel)*0.5 cr/unit.
- Trader cycle profit: profit = cargoVol * max(0, sellPrice_B - buyPrice_A) * tradeEff - routeFuelCost; routeFuelCost = routeDist(A,B)*0.4 cr/wu. Credited when cycleProgress reaches 1.0.
- Trader progress per tick: cycleProgress += dt/cycleTime; on >=1.0 -> credit profit, roll loss, reset to 0.
- Spread self-limit: each completed cycle emits 'economy:applyTradePressure' {stationId:A, good, vol:+cargoVol} and {stationId:B, good, vol:-cargoVol}; economy moves prices, shrinking the next spread.
- Per-cycle loss probability: pLoss = clamp(baseLossPerCycle * dangerMult * hotnessMult / guardMult, 0, 0.35). dangerMult = 1 + sectorDanger(route)*2 (0..1). hotnessMult = 1 + hotness (hotness +0.05 per consecutive cycle on same route, decays 0.1/min when idle). guardMult = 1 + 0.5*guardShipsOnRoute.
- Trader loss resolution: remove trader, emit 'automation:assetLost' {kind:'trader',id,value}, refund 0, spawn pirate encounter flag in route sector (composes with combat/spawn).
- Outpost output: storage.vol += clamp(outRate(level)*dt, 0, storageCap(level)-storage.vol). outRate(level)=outRate_L1*1.6^(level-1); storageCap(level)=cap_L1*1.7^(level-1).
- Outpost auto-sell income/min: if autoSell, sellable = min(storage.vol, outRate*60); income = sellable * localPrice(good) * 0.8; storage.vol -= sellable.
- Outpost raid check (every raidInterval=600s while danger>0): pRaid = clamp(sectorDanger*0.4 / defenseMult, 0, 0.5). defenseMult = (defense(level)/20)*(guardShip?1.8:1). On success: storage.vol *= 0.3, state 'raided' for 300s, emit 'automation:outpostRaided'.
- Upkeep drain per tick: state.credits -= (sum(upkeepPerMin)/60)*dt via accumulators; track upkeepDebt if credits insufficient; upkeepDebt past distressGraceSec worth -> repossess one random distressed asset.
- GLOBAL CAP at credit time: net = grossRealized - upkeepThisMin - expectedLossThisMin; capLimit = passiveCapFrac*A(T_player); if net>capLimit then credited = capLimit + (net-capLimit)*overflowEff else credited = net.
- Expected loss per min (for cap accounting): expLoss = sum_traders(pLoss*traderValue/(cycleTime/60)) + sum_outposts(pRaid*storageValue/(raidInterval/60)).
- Offline catch-up on load: elapsed=clamp(now-lastSave,0,offlineCapSec); per source use elapsed instead of dt with same caps; multiply realized credits by offlineEff=0.6; traders complete floor(elapsed/cycleTime) cycles with survival=(1-pLoss)^cycles single roll; deduct upkeep*elapsed/60.
- Verification target: with passiveCapFrac=0.45, a fully-built tier-T stack credits <= 0.45*A(T) cr/min after upkeep+loss, i.e. always < active play; raw gross may exceed but overflowEff=0.25 crushes returns past the cap.

## Interactions
- READS state.credits (owned by economy/core, assumed number) - debits upkeep, credits passive income via accumulators to avoid sub-cr loss.
- READS state.player.sectorId and state.player.pos:{x,z} (owned by core/movement) - deploy-range checks and collect proximity.
- READS state.player.progressionTier T (owned by progression, assumed int 1..5) - drives A(T), fleetCap, tier availability.
- READS commodity prices via ctx.economy.getPrice(stationId, good) or event 'economy:priceQuery' (owned by economy, assumed shape) - trader profit and outpost auto-sell.
- READS sector danger via ctx.world.getSectorDanger(sectorId)->0..1 (owned by world/faction, assumed) - loss and raid probabilities.
- READS asteroid field via ctx.mining.getField(fieldId)->{asteroids[],orePrices} and reuses ctx.mining.mineAsteroid(astId,vol) (owned by mining) - drones reuse the player's mining resolution.
- READS ship cargo capacity ctx.cargo.freeSpace(shipId) (owned by cargo) - collect transfer and fleet 'mine' buffer.
- EMITS 'economy:applyTradePressure' {stationId,good,vol} - moves prices so trader routes self-limit.
- EMITS 'automation:assetLost' {kind,id,value,sectorId} - notifications alert; combat/spawn may spawn the killer pirate.
- EMITS 'automation:outpostRaided' {outpostId,sectorId,lossVol} - notifications + optional defend-mission hook.
- EMITS 'automation:incomeCredited' {amount,source} - HUD ticker + stats tracking.
- EMITS 'automation:assetDistressed' {kind,id} and 'automation:assetRepossessed' {kind,id} - UI warnings when upkeep unpaid.
- HANDLES 'combat:hitAsset' {assetKind,assetId,damage} - applies drone durability / fleet+outpost hp loss, may trigger LOST.
- HANDLES 'ui:fleetOrder' {shipId,order,targetRef} from Fleet UI - sets order with redeployTimer.
- WRITES the automation.* tree to the save JSON; lastSaveTime stamped for offline catch-up; rngSeed persisted for determinism.
- Update order: runs AFTER economy (needs prices) and mining (needs field state), BEFORE notifications/UI refresh (alerts reflect this tick).

## UI Needs
- AUTOMATION / FLEET panel (DOM overlay, opened from HUD or station menu): tabs Drones | Traders | Outposts | Fleet.
- Drones tab: drone groups with sector, count, ore type, buffer-fill bar (vol/bufferCap), fuel bar, durability bar, state badge; actions Deploy (when in field), Recall, Refuel, toggle Auto-return; live cr/min estimate per group.
- Traders tab: route (A->B), tier, cycle-progress ring, last-cycle profit, hotness meter, danger badge, upkeep; actions Re-route, Recall/Dismiss, assign Guard; net cr/min after upkeep.
- Outposts tab: type/recipe, level, storage-fill bar, defense value, raid-risk badge, autoSell toggle, upkeep; actions Upgrade (shows cost), Restock, assign Guard ship; cr/min.
- Fleet tab: roster of owned ships (x/cap), per-ship order dropdown (mine/trade/escort/guard/idle), target selector, redeploy timer, hp bar; ship acquisition entry point.
- Global passive summary header: total gross cr/min, total upkeep cr/min, expected-loss cr/min, NET cr/min, and a CAP bar showing net vs passiveCapFrac*A(T) (amber when overflow-throttled).
- HUD ticker: scrolling line for 'automation:incomeCredited' and red flash for assetLost/outpostRaided/assetDistressed.
- Map overlay markers: icons for owned drone groups, trader routes (danger-colored A-B line), and outposts, so the management/attention cost is spatially visible.
- Offline-return modal on load: 'While away (capped Xh): +N cr from drones, +M cr from traders, K cycles run, J assets lost' summary.

## Risks
- Cap correctness: enforce the global passive cap at credit time, not as an estimate; if overflowEff or expectedLoss accounting is wrong, stacked automation can exceed active income and break the core fantasy. Unit-test net <= 0.45*A(T) across full builds per tier.
- Borrowed-state shape mismatch: economy price query, sector danger, mining field access, cargo capacity, and progression tier are owned elsewhere with assumed shapes; the orchestrator must reconcile exact fn/event names or these silently no-op.
- Offline catch-up exploit: clamping (OFFLINE_CAP=4h) and offlineEff=0.6 must be airtight; an off-by-one in cycle count or uncapped buffer lets players time-skip for huge gains. Guard against negative elapsed from clock changes.
- Per-tick fractional credits: crediting/draining sub-1-cr amounts at 60Hz must use accumulators (creditBuffer/upkeepDebt) or rounding loses or duplicates money.
- Trade-pressure feedback loop: if economy does not move prices on 'applyTradePressure', routes never self-limit and a single route becomes infinite money; the economy subsystem must honor the event.
- Loss-event UX: assets vanishing while the player is elsewhere must always notify clearly and be preventable via guard, or losses feel unfair/random rather than a managed risk.
- Distress repossession: must pick low-value or clearly-flagged assets and warn first, or it feels like a punitive wipe.
- Determinism: loss/raid rolls should draw from a seeded RNG (automation.meta.rngSeed) so saves/replays stay deterministic and offline catch-up is reproducible.
