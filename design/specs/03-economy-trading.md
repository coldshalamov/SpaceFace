# Economy & Trading

## Summary
A data-driven, stock-based market economy. Every station owns an independent market: each tradeable commodity has a live `stock` that drifts exponentially toward a per-station `equilibrium`, and price is derived purely from the stock/equilibrium ratio via an elasticity curve (low stock = expensive, high stock = cheap). Producer station types hold high equilibrium stock of what they make (so they sell it cheap) and low equilibrium stock of what they consume (so they buy it dear); consumer types are the inverse. Players profit by hauling goods from producer stations (low buy price) to consumer stations (high sell price). Large trades move stock and therefore self-impact price with diminishing returns, so each route has a capacity sweet spot rather than infinite scaling. A buy/sell spread gives the house edge. Economic events (shortages, booms, blockades, piracy spikes) are time-boxed modifiers injected onto a station+commodity's equilibrium/drift and propagate to neighbors along trade links. Contraband trades at high margin but triggers scan checks at gates/patrols with value-scaled fines and reputation hits. The system runs on a slow economy tick (5 s) decoupled from the 60 Hz sim, mutates only GameState.markets, and communicates entirely through the event bus so combat/mission/AI-trader systems compose without coupling.

## Mechanics
- MARKET MODEL: Each station S has a market = map of commodityId -> {stock, equilibrium, lastPrice, eventMods[]}. Price is a pure function of stock/equilibrium; there is no separately stored price. Only `stock` and `equilibrium` are persisted; price is recomputed on demand and cached per econ tick.
- PRODUCER vs CONSUMER: A station's type (from Sectors subsystem) maps to a production profile. For each commodity the profile gives a role: 'produce' (equilibrium = baseEq * 2.0, drift pulls stock UP, sells cheap), 'consume' (equilibrium = baseEq * 0.35, stock chronically low, buys dear), or 'none' (not traded; commodity hidden in that market). baseEq default = 1000 units, scaled by station size tier (S=0.5x, M=1x, L=2x).
- PRICE FROM STOCK: mid = basePrice * priceMult(stock, equilibrium) where priceMult = clamp((stock/equilibrium)^(-elasticity), 0.40, 2.60). elasticity is per-commodity (low for staples ~0.30, high for luxuries/contraband ~0.60). At stock==eq, mult=1.0 -> price==basePrice.
- BUY/SELL SPREAD: Player BUYS from station at buyPrice = round(mid * (1 + spread/2)); player SELLS to station at sellPrice = round(mid * (1 - spread/2)). spread default 0.08 (8%), widened by events and by low station 'wealth' (frontier stations spread 0.14).
- PRICE IMPACT (large trades): trades resolve unit-by-unit against live stock. Buying decrements stock (price rises as you drain it); selling increments stock (price falls as you flood it). For performance, batch trades of N units use the closed-form average of the integral of priceMult over the stock delta, not a literal loop (loop only used as reference/validation). Net effect: a 200u trade on a 1000-eq market shifts mid ~15-25%, giving diminishing marginal profit.
- STOCK DRIFT (per econ tick, dt=5s): stock += driftRate * (effectiveEq - stock) * dt, clamped >=0. driftRate default 0.006/s (half-life ~1.9 min) so player-induced shortages visibly persist then recover. Producers and consumers share the same drift math; their differing equilibria create the price gradient.
- ECONOMY TICK: a single EconomySystem.update runs every 5 s of sim time (accumulator pattern). It (1) ages/expires eventMods, (2) drifts every station+commodity stock toward effectiveEq, (3) propagates event pressure along trade links, (4) recomputes & caches lastPrice, (5) emits 'economy/tick' once. ~ (stations*commodities) ops; with 30 stations x 20 commodities = 600 cheap ops every 5 s.
- ECONOMIC EVENTS: data-driven typed modifiers placed on (stationId, commodityId, field, mult, duration). Types: SHORTAGE (equilibrium *0.3, spread *1.5), BOOM (equilibrium *2.0 on consumed goods, demand up), BLOCKADE (drift *0.1 so stock frozen, spread *1.8, all trade margin spikes), PIRACY_SPIKE (raises scan-evasion value & insurance, biases SHORTAGE on military/medical). Events fire from a scheduler (avg 1 new event per 90 s game-wide) and from other systems via bus (e.g. combat clearing a pirate base ends a PIRACY_SPIKE).
- EVENT PROPAGATION: each station has tradeLinks[] (neighbor stationIds from Sectors). On econ tick, a fraction of an event's price-pressure bleeds to linked stations: neighborEq *= 1 + 0.35*(parentPressure)*linkStrength, decaying with hop distance (0.35 per hop, stops at pressure<0.05). A shortage at A makes A's neighbors mildly pricier too, so the player can still arbitrage but the easy spread narrows over time.
- CONTRABAND & SCANNING: commodities with legality !== 'legal' only appear in markets at stations whose faction tolerates them (blackMarket flag). Carrying them is safe until a SCAN check: triggered on jump-gate use and on proximity to a patrol/police ship. p_scan = clamp(baseScan*(1+security) - scannerCloakRating, 0.02, 0.95), baseScan=0.25, security per sector 0..1. On scan, if illicit cargo found: pay fine, lose cargo (confiscated), take faction reputation hit, possibly become hostile.
- FINES & REP: fine = sum over illicit stacks of (unitBasePrice * qty * fineMult[legality]) where fineMult = {restricted:0.8, illegal:1.2, contraband:1.5}. If player can't pay, debt + bounty raised. reputationHit = -clamp(fineValue/2000, 2, 25) with the scanning faction; emits 'reputation/change'. A 'smuggling' perk or bribe option (pay 30% of fine to faction officer) can be offered via event bus to the Mission/Dialog system.
- BUY/SELL TRANSACTION FLOW: UI calls economy.quote(stationId, commodityId, qty, side) -> returns {unitAvg, total, priceImpactPct, stockAfter, legalityWarning}. On confirm, economy.execute(...) validates credits/cargo volume/mass, mutates GameState.markets stock + GameState.player.credits + cargo, emits 'trade/completed'. All mutations are transactional (validate-then-apply) so a failed cargo-volume check rolls back.
- AI TRADER COMPOSITION: hired NPC traders (passive income) call the SAME economy.execute path, so their buying/selling moves real stock and competes with the player, naturally damping over-farmed routes. Mining drones sell ore via economy.execute at the nearest refinery. This makes passive income self-balancing without special-case code.
- PRICE DISCOVERY UI: player only sees a station's prices when docked OR when they own a 'market data' module / have visited recently (cached snapshot with timestamp + staleness). Encourages exploration; trade-route planner highlights known spreads.

## State Owned
- markets: Record<stationId, Record<commodityId, MarketEntry>> — the live per-station economy. MarketEntry = { stock:number(units), equilibrium:number(units), baseEq:number, role:'produce'|'consume'|'none', lastMid:number(cr), lastBuy:number, lastSell:number, eventMods: EventMod[] }
- commodities: Record<commodityId, CommodityDef> — static data table (basePrice, category, volatility, elasticity, legality, volumePerUnit, massPerUnit, fineMult, producedBy[], consumedBy[]). Loaded from content, not mutated at runtime.
- econEvents: ActiveEvent[] — list of in-flight economic events { id, type, stationId, commodityId|'*', field, mult, startT, duration, pressure }
- econClock: { accumulator:number, lastTickT:number, ticksElapsed:number } — drives the 5 s economy tick decoupled from render
- marketIntel: Record<stationId, { snapshot, seenAtT }> — cached prices the player has discovered, for the map/route-planner UI
- player.credits: number (cr) — debited/credited by trades and fines (shared with other systems; economy is one writer)
- player.cargo: { items: Record<commodityId, qty>, usedVolume:number(u), usedMass:number(t), capVolume:number, capMass:number } — economy reads caps, writes items/used on trade
- player.bounty / player.debt: number — raised by unpaid fines (shared with Combat/Faction)
- tradeStats: { lifetimeProfit:number, tradesCount:number, biggestSingleProfit:number, smuggledValue:number } — meta/achievement + idle-growth tracking

## Content
- RAW MATERIALS — Water Ice | id water_ice | basePrice 12 | vol 0.30 | elasticity 0.30 | legality legal | volPerU 1.0 | massPerU 1.0 | producedBy [ice_field,agri] consumedBy [habitat,shipyard,refinery]
- RAW — Ore (Raw Metal) | id ore | basePrice 28 | vol 0.45 | elast 0.40 | legal | volPerU 1.0 massPerU 1.6 | producedBy [mining,asteroid_outpost] consumedBy [refinery]
- RAW — Silicates | id silicates | basePrice 22 | vol 0.40 | elast 0.35 | legal | 1.0/1.2 | producedBy [mining] consumedBy [refinery,fab]
- RAW — Ice Volatiles (Hydrogen/fuel feedstock) | id volatiles | basePrice 35 | vol 0.55 | elast 0.45 | legal | 1.0/0.4 | producedBy [gas_skimmer,ice_field] consumedBy [refinery,shipyard,habitat]
- REFINED — Refined Metals | id refined_metals | basePrice 85 | vol 0.45 | elast 0.45 | legal | 1.0/1.4 | producedBy [refinery] consumedBy [fab,shipyard,military]
- REFINED — Alloys (composite) | id alloys | basePrice 140 | vol 0.50 | elast 0.50 | legal | 1.0/1.3 | producedBy [refinery,fab] consumedBy [shipyard,military]
- REFINED — Polymers | id polymers | basePrice 70 | vol 0.40 | elast 0.40 | legal | 1.2/0.7 | producedBy [refinery] consumedBy [fab,habitat]
- REFINED — Fuel Cells | id fuel_cells | basePrice 95 | vol 0.55 | elast 0.50 | legal | 0.8/0.6 | producedBy [refinery,gas_skimmer] consumedBy [ALL stations + ship refuel]
- TECH/ELEC — Microchips | id microchips | basePrice 260 | vol 0.55 | elast 0.55 | legal | 0.5/0.2 | producedBy [fab] consumedBy [shipyard,military,habitat,research]
- TECH — Electronics (modules/components) | id electronics | basePrice 190 | vol 0.50 | elast 0.50 | legal | 0.8/0.5 | producedBy [fab] consumedBy [shipyard,habitat]
- TECH — Ship Parts | id ship_parts | basePrice 320 | vol 0.60 | elast 0.55 | legal | 1.5/1.8 | producedBy [shipyard,fab] consumedBy [shipyard,repair_dock,military]
- TECH — Quantum Cores (high-tech) | id quantum_cores | basePrice 880 | vol 0.70 | elast 0.60 | legal | 0.4/0.3 | producedBy [research] consumedBy [shipyard,military]
- CONSUMER — Consumer Goods | id consumer_goods | basePrice 110 | vol 0.45 | elast 0.45 | legal | 1.0/0.5 | producedBy [fab] consumedBy [habitat,frontier]
- CONSUMER — Textiles | id textiles | basePrice 60 | vol 0.40 | elast 0.40 | legal | 1.0/0.6 | producedBy [agri,fab] consumedBy [habitat]
- LUXURY — Luxury Goods | id luxury_goods | basePrice 380 | vol 0.65 | elast 0.60 | legal | 0.8/0.4 | producedBy [habitat,fab] consumedBy [habitat,casino,frontier]
- LUXURY — Art & Antiques | id art | basePrice 620 | vol 0.80 | elast 0.65 | restricted (export-controlled) | 0.6/0.3 | producedBy [habitat] consumedBy [casino,habitat]
- FOOD/MED — Food (Provisions) | id food | basePrice 40 | vol 0.50 | elast 0.30 | legal | 1.0/0.7 | producedBy [agri] consumedBy [ALL crewed stations + frontier]
- FOOD/MED — Medical Supplies | id medical | basePrice 175 | vol 0.60 | elast 0.50 | legal | 0.7/0.4 | producedBy [research,fab] consumedBy [habitat,frontier,military]
- CONTRABAND — Narcotics | id narcotics | basePrice 220 | vol 0.90 | elast 0.60 | illegal | 0.6/0.2 | producedBy [blackmarket,pirate_base] consumedBy [blackmarket,casino,frontier] fineMult 1.5
- CONTRABAND — Stolen Goods | id stolen_goods | basePrice 150 | vol 0.85 | elast 0.55 | contraband | 1.0/0.8 | producedBy [pirate_base] consumedBy [blackmarket] fineMult 1.5
- MILITARY HW — Weapon Systems | id weapons | basePrice 400 | vol 0.70 | elast 0.55 | restricted (license) / illegal w/o license | 1.2/1.5 | producedBy [military,shipyard] consumedBy [military,pirate_base*] fineMult 1.2
- MILITARY HW — Munitions | id munitions | basePrice 130 | vol 0.60 | elast 0.50 | restricted | 0.9/1.1 | producedBy [military,fab] consumedBy [military,pirate_base*] fineMult 1.0
- STATION TYPES referenced: mining, asteroid_outpost, ice_field, gas_skimmer, refinery, fab(factory), shipyard, repair_dock, habitat, agri, research, military, casino, frontier, blackmarket, pirate_base. Each maps to produce/consume roles above.
- WORKED ROUTE EXAMPLE (refined_metals, refinery A -> factory B): A is refinery (role produce, eq 2400, stock ~2400). mid_A = 85*(2400/2400)^-0.45 = 85*1.0... actually stock>eq case: with stock 2400 eq 1200 (consume-adjusted demand) mid_A=62.2, buyPrice ~65. B is factory (role consume, eq 1000, stock depleted ~300). mid_B=146, sellPrice ~140. Player hauls 200u in a 200u hold. With unit-by-unit price impact: avg buy 65.97 cr/u, avg sell 124.18 cr/u (impact compresses both ends). Gross profit = 124.18-65.97 = 58.2 cr/u * 200u = 11,641 cr per round trip, ROI 88%. At ~90 s travel each way + dock time (~4 min round trip) that's ~2,900 cr/min — a strong but not infinite early-game route that decays as you over-farm it (stock recovers in ~2 min, so repeat trips earn less until eq restores).
- PROFITABILITY TARGETS by tier: starter hauler (50u hold): 1,500-3,500 cr/trip. mid trader (200u): 8,000-14,000 cr/trip. bulk freighter (800u): 30,000-55,000 cr/trip but heavier price impact (margin/u drops ~35% vs small loads). Contraband routes: 2-3x legal margin (e.g. narcotics 80-180 cr/u net) offset by scan-loss expectation. Target: a focused player reaches ship-upgrade #1 (~25k cr) in ~20-30 min of active trading.

## Formulas
- priceMult(stock, eq, elasticity) = clamp( (max(stock,1)/eq)^(-elasticity), 0.40, 2.60 )
- effectiveEq(station, commodity) = baseEq * roleFactor * sizeFactor * Π(eventMods[field=='equilibrium'].mult)  // roleFactor: produce=2.0, consume=0.35, none=0(untraded); sizeFactor S=0.5/M=1/L=2
- mid = basePrice * priceMult(stock, effectiveEq, elasticity)
- spreadEff = clamp( 0.08 * Π(eventMods[field=='spread'].mult) * (1 + frontierPenalty[0..0.06]), 0.04, 0.40 )
- buyPriceUnit = round( mid * (1 + spreadEff/2) ); sellPriceUnit = round( mid * (1 - spreadEff/2) )
- PRICE IMPACT closed form, buy N units stock s0->s0-N: avgMid = basePrice * eff^elasticity / ((1-elasticity)*N) * ( s_hi^(1-elasticity) - s_lo^(1-elasticity) ), s_hi=s0, s_lo=s0-N; if elasticity==1 use basePrice*eff/N*ln(s_hi/s_lo). Sell is the mirror over [s0, s0+N].
- STOCK DRIFT/tick: stock' = clamp( stock + 0.006 * driftMod * (effectiveEq - stock) * 5, 0, eqCap ); half-life = ln2/(0.006*driftMod); BLOCKADE driftMod=0.1
- TRADE MUTATION: buy N -> stock-=N; sell N -> stock+=N
- EVENT PROPAGATION: neighborEqMult *= 1 + 0.35*parentPressure*linkStrength*(0.35^hop), while parentPressure*0.35^hop >= 0.05
- p_scan = clamp( 0.25*(1+sectorSecurity) - scannerCloakRating, 0.02, 0.95 )
- fine = Σ illicitStacks( basePrice * qty * fineMult[legality] ); fineMult{restricted:0.8, illegal:1.2, contraband:1.5}
- reputationHit = -clamp(fine/2000, 2, 25); bribeCost = round(0.30*fine)
- volumeCheck: usedVolume + N*volPerU <= capVolume AND usedMass + N*massPerU <= capMass
- profitPerTrip = N*(avgSellUnit(B,N) - avgBuyUnit(A,N)) - fuelCost - dockFees; fuelCost = distance/fuelEfficiency * fuelCellPrice
- priceConfidence = clamp(1 - (now - seenAtT)/600, 0, 1)

## Interactions
- EMITS 'economy/tick' { t, ticksElapsed } — once per 5 s econ tick; AI-trader & idle-income systems can act on it.
- EMITS 'trade/completed' { stationId, commodityId, side, qty, unitAvg, total, priceImpactPct, profit? } — consumed by Missions (trade quests), Stats/Achievements, Tutorial, idle-income ledger.
- EMITS 'economy/event/started' { eventId, type, stationId, commodityId, duration } and 'economy/event/ended' { eventId } — consumed by HUD notifications, Map markers, Mission generator (e.g. 'deliver medical to shortage station').
- EMITS 'contraband/scanned' { stationId|patrolId, found:bool, fine, confiscated[] } and 'reputation/change' { factionId, delta } — consumed by Faction, Combat (turn hostile), HUD.
- EMITS 'credits/change' { delta, reason } and 'cargo/change' { } — consumed by HUD, Save system.
- LISTENS 'sim/dock' { stationId } — builds/refreshes the station market UI snapshot, writes marketIntel.
- LISTENS 'sim/jumpGate' and 'patrol/proximity' { security, scannerCloak } — runs scan check against illicit cargo.
- LISTENS 'combat/baseDestroyed' { stationId, type } — if pirate_base, ends related PIRACY_SPIKE events & may trigger SHORTAGE of contraband.
- LISTENS 'aiTrader/requestTrade' { stationId, commodityId, side, qty } and 'miningDrone/sellOre' { stationId, qty } — routes NPC/passive-income trades through economy.execute so they move real stock (self-balancing idle income).
- LISTENS 'mission/forceEvent' { type, stationId, commodityId } — lets the mission system stage scripted booms/shortages for quests.
- READS GameState.sectors (station types, tradeLinks, sectorSecurity), GameState.factions (legality tolerance per faction), GameState.player.modules (scannerCloak, marketData module) — does not write them.
- PROVIDES API (called by UI & other systems): economy.quote(stationId, commodityId, qty, side) -> quote; economy.execute(quote|params) -> result; economy.getMarket(stationId); economy.priceOf(stationId, commodityId, side); economy.injectEvent(eventDef). All pure-ish wrappers over GameState.markets.
- SAVE/LOAD: serializes markets (stock+equilibrium+eventMods only, prices recomputed), econEvents, econClock, marketIntel, tradeStats into GameState JSON; deterministic given same seed + event log.

## UI Needs
- STATION TRADE SCREEN (DOM overlay on dock): table of commodities with columns — name, category icon, your-cargo qty, station stock bar (stock vs equilibrium, colored: red=shortage<0.5eq, green=surplus>1.5eq), buy price, sell price, qty stepper + Max button, and a live 'price impact' readout that updates as qty changes (shows unitAvg and new price after trade). Illegal rows tinted red with a warning icon + legality label.
- BUY/SELL CONFIRM: shows total cr, cargo volume/mass after (with bars vs cap), price-impact %, and for contraband an estimated scan-risk warning for the current route.
- CARGO HOLD WIDGET (persistent HUD): used/cap volume (u) and mass (t) bars, per-commodity stack list, total cargo value at nearest-known prices.
- CREDITS + DELTA TICKER (HUD): current credits, animated +/- on trade/fine, lifetimeProfit in stats panel.
- ECONOMY EVENT FEED (HUD notifications + Map): toast on event start/end ('SHORTAGE: Medical Supplies at Kepler Station — prices +120%'); map markers colored by event type; tooltip with duration remaining.
- TRADE ROUTE PLANNER (Map/Trade tab): for stations the player has marketIntel on, list best known spreads (commodity, buy@A, sell@B, est profit/u, est profit/trip for current hold, distance, staleness indicator). Sortable by profit/trip and profit/min.
- MARKET INTEL STALENESS: each known price shows an age/confidence indicator; un-visited stations show '?' prices.
- SCAN/FINE MODAL: on scan-with-contraband, modal showing found cargo, fine amount, confiscation list, rep hit, and Pay / Bribe(30%) / Refuse options.
- PASSIVE INCOME LEDGER (idle-growth panel): per-tick income from AI traders/mining drones/outposts sourced from 'trade/completed' events, with cr/min rate and projections — reinforces the idle-game growth loop.

## Risks
- Price-impact closed form must match the unit-loop reference within rounding, or quote() and execute() disagree and players exploit the gap — unit-test the integral against the loop for N=1..1000.
- Equilibrium tuning is the whole game balance: if produce/consume eq factors are wrong, either no route is profitable or one route is infinitely farmable. Needs a tuning pass with the worked-route numbers as the anchor (target 80-90% ROI early game, decaying).
- Drift rate vs travel time coupling: if stock recovers faster than a round trip, the player never sees their own impact; if slower, markets feel dead. driftRate=0.006 assumes ~2-4 min round trips — revisit if travel speeds change.
- AI traders + mining drones routing through economy.execute can crash prices on popular routes (good) but could also starve the player's income unpredictably; cap NPC trade volume per tick and/or give player-owned assets priority.
- Event propagation can cascade/oscillate if linkStrength*hop decay is mis-set — clamp total eqMult per station (e.g. 0.25x..4x) and cap simultaneous active events per station.
- Contraband scan probability must feel fair: at high security p_scan~0.47 means ~half of gate jumps caught — verify expected-value of smuggling stays positive-but-risky, not a trap. Surface scan-risk in UI before the player commits.
- Float drift in stock over thousands of ticks — keep stock as float but round for display; ensure save/load round-trips exactly (store full precision).
- Determinism: scan checks and event scheduler must draw from a seeded RNG in GameState, not Math.random(), or save/load diverges.
- Performance: recomputing prices for every station each tick is fine at 30 stations but UI route-planner scanning all known markets each frame is not — compute on tick and cache, never per-frame.
- Spread + price-impact + fines all touch player.credits which other systems also write; funnel ALL credit changes through one helper that emits 'credits/change' to avoid desync with HUD/save.
