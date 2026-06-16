# Factions & Reputation

## Summary
A data-driven faction & reputation layer for SpaceFace. 8 factions, each with a personality, home sectors, controlled assets (stations/lanes/asteroid fields), and a static base-relationship matrix. The player holds a numeric reputation value per faction on a [-1000, +1000] scale, bucketed into 9 named tiers from Sworn Enemy to Hero. A central applyRep(faction, delta, reason) function (driven by a data table of action weights) is the single mutation point; it emits rep events, applies cross-faction spillover via the relationship matrix, clamps, and updates derived per-faction flags (hostile/locked/discount). Reputation drives: trade price multipliers, dock access vs lockout, attack-on-sight, mission availability/quality, NPC escort & combat assistance, and bribe costs. A lightweight dynamic-conflict layer tracks per-faction-pair tension that the player tips via kills/missions/contraband, periodically flipping contested sectors and spawning war fleets. All state lives in GameState.factions and mutates only through the event bus + applyRep, so AI spawning, economy pricing, missions, and combat all read the same source of truth.

## Mechanics
- Reputation is a per-faction signed integer in [-1000,+1000]; 0 = true neutral, stored in GameState.factions[id].rep.
- Single mutation entry point: applyRep(factionId, delta, reason) — clamps, applies diminishing returns near caps, fires events, runs spillover, recomputes tier+flags. Nothing else writes rep directly.
- 9 tiers (thresholds on the rep value): Sworn Enemy <=-700, Hated [-699,-400), Hostile [-399,-150), Disliked [-149,-30), Neutral [-29,+29], Accepted (+30,+149], Trusted (+150,+399], Allied (+400,+699], Hero >=+700.
- Action weights are data (REP_ACTIONS table): killing a faction ship, completing/failing its missions, trading at its stations, getting caught with contraband, destroying its rivals, scanning/looting, distress-call rescues, bribes.
- Cross-faction spillover: every applyRep also nudges related factions by delta * matrix.spillover[a][b] (ally factions gain a fraction when you help one; enemy factions lose a fraction). Spillover is capped per event and does NOT itself recurse.
- Diminishing returns: gains above Trusted and losses below Hostile are scaled by a softening factor so the last stretch toward Hero/Sworn-Enemy is grindy and intentional, never accidental.
- Witnessed-only rule: hostile actions (kills, contraband) only change rep if a faction sensor/ship/station is within WITNESS_RANGE (1200 wu) or it is a station-scan event; unwitnessed crimes have a BUSTED_CHANCE roll instead.
- Attack-on-sight: any faction at rep <= -150 (Hostile tier or worse) sets aggro flag; its NPCs target the player on sensor contact and stations deny docking.
- Dock access gates on rep: <-150 lockout, [-150,-30) docking allowed but services restricted + surcharge, >=+30 full services, tier bonuses unlock special inventory.
- Trade pricing: buy/sell multipliers scale linearly with rep so Allied/Hero get discounts and Hostile get surcharges; applied by the economy system via getRepPriceMod(factionId).
- Missions: each mission template has minRep + factionId; mission board filters by rep, and higher tiers unlock higher-tier/higher-pay contracts and faction storyline missions.
- NPC assistance: at >=+150 (Trusted) faction patrols will assist the player in combat vs that faction's enemies; at >=+400 (Allied) you can hail for a paid/free escort; bribery available to clear minor hostility for credits scaling with negative rep.
- Dynamic conflict: GameState.conflicts holds per-pair tension [0,100]; player actions feed tension via TENSION_ACTIONS; when a pair crosses warThreshold a war is declared, contested sectors flip owner, and war fleets spawn — the player can pick a side and tip outcomes.
- Rep decay-toward-neutral: tiny per-in-game-day drift of extreme values toward 0 (configurable, default for negative rep only) so the galaxy slowly forgives, keeping the player from being permanently locked out.
- Persistence: all faction rep, flags, bribe history, and conflict tension serialize into the save JSON under GameState.factions and GameState.conflicts.

## State Owned
- GameState.factions: Record<FactionId, FactionRuntime> — owns all per-faction runtime; keyed by faction id string.
- GameState.factions[id].rep: number — signed reputation in [-1000,+1000], default 0.
- GameState.factions[id].tier: string — derived tier name (e.g. 'Neutral'), recomputed by applyRep; cached for UI/AI cheap reads.
- GameState.factions[id].aggro: boolean — true when rep<=-150; gates attack-on-sight and dock lockout.
- GameState.factions[id].bribesPaid: number — running total credits spent bribing this faction (for escalating bribe cost + UI).
- GameState.factions[id].lastDelta: {value:number, reason:string, t:number} — most recent rep change, for HUD toast + log.
- GameState.factions[id].knownContrabandStrikes: number — count of times caught with this faction's contraband (escalates penalties/fines).
- GameState.factions[id].discoveredHostileBy: number (sim time) — timestamp combat started, for cooldown/forgiveness logic.
- GameState.conflicts: Record<PairKey, ConflictRuntime> — owns dynamic inter-faction war state; PairKey = sorted 'a:b'.
- GameState.conflicts[key].tension: number — [0,100] current tension between the pair.
- GameState.conflicts[key].state: 'cold'|'tense'|'war' — derived from tension thresholds.
- GameState.conflicts[key].playerLean: number — [-1,+1], how much player has favored side A vs B (drives spillover of war outcomes onto player rep).
- GameState.sectors[id].owner: FactionId — current controlling faction (mutated by conflict flips; read by spawning/economy). Factions module writes this on war resolution only.
- GameState.factionMeta (load-time, immutable): the static data tables (factions, relationship matrix, REP_ACTIONS, tiers, price curves) loaded from content; not serialized into saves (re-loaded from content on boot).

## Content
- FACTION | Solar Concord Navy (scn) | law/order federation military | home: Sol Gate, Aegis Reach, Lumen Cross | controls: 6 core sectors, jump-gate checkpoints, customs scans | personality: lawful, punishes contraband hard, rewards pirate kills | color #3A78FF
- FACTION | Meridian Trade Syndicate (mts) | corporate trade guild / megacorp | home: Bourse Station, Halcyon Ring, Tariff Point | controls: 5 trade-hub sectors, commodity exchanges, tolls | personality: greedy, neutral-leaning, sells access to anyone with credits | color #F2B233
- FACTION | Drift Miners Collective (dmc) | blue-collar mining union | home: Ore Belt, Slagfields, Deepcut | controls: 4 asteroid-rich sectors, refineries, ore prices | personality: proud, anti-corporate, hates claim-jumpers and ore theft | color #C9772E
- FACTION | Crimson Reach (reach) | pirate clans | home: The Gash, Bloodmoor, Hollow Vael | controls: 3 lawless sectors, ambush lanes | personality: violent, opportunistic, attack-on-sight to law factions, raids trade lanes | color #D8334A
- FACTION | The Quiet (quiet) | smuggler syndicate | home: Lowlight, Shade Harbor (hidden docks) | controls: black markets in 4 contested sectors, contraband routes | personality: secretive, neutral-pragmatic, profits from war | color #7A5FB0
- FACTION | The Vael (vael) | alien/outsider hive-collective | home: Veil Expanse, Chorus Deep (alien sectors) | controls: 3 far-rim sectors, exotic tech, unique commodities | personality: inscrutable, xenophobic by default (starts at -120), opens up only via deep rep grind | color #2FCFA0
- FACTION | Free Frontier (free) | independent settlers/freelancers | home: scattered — Outpost 9, Tinker, Last Light | controls: no monolithic territory; many neutral waystations | personality: friendly, anti-authority, default mild-positive (+40) | color #4ECbe0
- FACTION | Ascendant Choir (choir) | militant techno-zealots | home: The Reliquary, Ascension Spire | controls: 2 fortified zealot sectors, relic shrines | personality: fanatical, hostile to aliens and pirates, crusading, mission-heavy | color #E85FD0
- TIER | Sworn Enemy | rep<=-700 | AOS, total lockout, kill-bounty on player, no bribes accepted
- TIER | Hated | -699..-400 | AOS, lockout, bribes very expensive
- TIER | Hostile | -399..-150 | AOS, lockout, bribes available
- TIER | Disliked | -149..-30 | dock allowed, +15..40% surcharge, basic missions only, restricted services
- TIER | Neutral | -29..+29 | standard prices, common missions, full basic docking
- TIER | Accepted | +30..+149 | -5..10% discount, faction missions unlock, repair/refuel priority
- TIER | Trusted | +150..+399 | -10..18% discount, patrols assist you, mid-tier missions + storyline start
- TIER | Allied | +400..+699 | -18..28% discount, callable escort, elite missions, special inventory
- TIER | Hero | >=+700 | -30% cap discount, free escort, flagship/relic unlocks, faction title + free passage
- REP_ACTION | kill_faction_ship | -25 (scaled by target tier: scout x0.6, fighter x1, capital x2.5) | only if witnessed
- REP_ACTION | kill_faction_enemy_ship | +6 to the rival's enemy faction (e.g. killing a pirate -> +6 scn,+6 choir)
- REP_ACTION | complete_faction_mission | +15 base x mission.repMult (1..4 by tier)
- REP_ACTION | fail/abandon_faction_mission | -12
- REP_ACTION | trade_at_faction_station | +0.5 per 1000 cr of net trade, capped +3 per docking
- REP_ACTION | caught_contraband (faction scan) | -40 + fine; +1 knownContrabandStrikes; repeat strikes x1.5
- REP_ACTION | destroy_faction_station/asset | -150 (catastrophic, near-instant Hostile)
- REP_ACTION | rescue_faction_distress_call | +20
- REP_ACTION | loot_faction_wreck (witnessed) | -8
- REP_ACTION | bribe_official | +clears aggro to -29 floor; cost formula below
- RELATIONSHIP | scn: ally[mts,choir-conditional], hostile[reach,vael], neutral[dmc,quiet,free]
- RELATIONSHIP | mts: ally[scn], rival/tense[dmc], neutral[quiet,free,vael], hostile[reach]
- RELATIONSHIP | dmc: ally[free], rival[mts], hostile[reach], neutral[scn,quiet,vael,choir]
- RELATIONSHIP | reach (pirates): hostile[scn,mts,dmc,choir], ally[quiet-uneasy], neutral[free,vael]
- RELATIONSHIP | quiet (smugglers): neutral-to-all (pragmatic), ally[reach-uneasy], profits when scn<->reach at war
- RELATIONSHIP | vael (alien): hostile[scn,choir], neutral[mts,dmc,quiet,free], xenophobic default
- RELATIONSHIP | free: ally[dmc], friendly-neutral[all except reach], mild-hostile[choir]
- RELATIONSHIP | choir (zealots): hostile[vael,reach], ally[scn-conditional], neutral[mts,dmc], mild-hostile[free]
- SPILLOVER WEIGHTS | ally=+0.35, friendly=+0.2, neutral=0.0, rival=-0.2, hostile=-0.35 (applied to delta, capped +/-8 per event)
- CONTESTED SECTORS (flippable in war) | Lumen Cross (scn<->reach), Tariff Point (mts<->dmc), Hollow Vael (reach<->vael), Lowlight (quiet<->scn), Deepcut (dmc<->reach)
- STARTING REP | scn 0, mts 0, dmc 0, reach -50, quiet 0, vael -120, free +40, choir 0
- BRIBE/ESCORT | bribe base 500cr, escort hire 2000cr/sector (free at Hero), distress reward 500-3000cr by sector tier

## Formulas
- clampRep(r) = max(-1000, min(1000, r))
- applyRep(id, delta, reason): raw = factions[id].rep; soft = applyDiminish(raw, delta); factions[id].rep = clampRep(raw + soft); recomputeTier(id); applyFlags(id); emit('rep:changed',{id,delta:soft,reason,newRep}); applySpillover(id, soft, reason)
- applyDiminish(raw, delta): if delta>0 and raw>=150: factor = 1 - (raw-150)/(1000-150)*0.6  (gains taper to 0.4x near +1000). if delta<0 and raw<=-150: factor = 1 - (-150-raw)/(1000-150)*0.6 (losses taper to 0.4x near -1000). else factor=1. return round(delta*factor)
- applySpillover(srcId, delta, reason): for each other faction f: w = MATRIX.spillover[srcId][f]; if w==0 continue; sd = clamp(round(delta*w), -8, +8); rep[f] = clampRep(rep[f]+sd); recomputeTier(f); applyFlags(f); emit('rep:spillover',...) — spillover never re-triggers spillover
- killRepDelta(targetFaction, targetClass): base=-25; classMult={scout:0.6,fighter:1.0,gunship:1.5,frigate:2.0,capital:2.5}[targetClass]; return base*classMult (only if witnessed within 1200 wu)
- witnessed(actorPos, faction): true if any faction[id] ship/station within WITNESS_RANGE=1200 wu of actorPos, OR event is a station customs scan
- bustChance(contrabandUnits) = min(0.9, 0.15 + 0.03*contrabandUnits)  (rolled at faction scan checkpoints when not auto-witnessed)
- tierOf(rep): first tier whose [min,max] contains rep (table lookup over TIERS)
- getRepPriceMod(id): t = rep/1000 (in [-1,1]); buyMult = clamp(1 - 0.30*max(0,t) + 0.40*max(0,-t), 0.70, 1.40); sellMult = clamp(1 + 0.20*max(0,t) - 0.30*max(0,-t), 0.70, 1.20). Economy multiplies base price by these.
- dockAccess(id): rep<=-150 -> 'locked'; rep<-30 -> 'restricted'; else 'full'
- aggroFlag(id): rep <= -150
- missionAvailable(m): factions[m.factionId].rep >= m.minRep  (minRep examples: common 0, faction 30, mid 150, elite 400, storyline gated +flags)
- bribeCost(id): if rep>-30 return 0 (n/a); cost = round((abs(min(rep,-30))-29) * 8 * (1 + 0.5*bribesPaid_count)) ; rep>=Hated tier(-400) unbribeable -> returns Infinity. On pay: rep = -29, aggro=false, bribesPaid+=cost
- escortCost(id, sectors): tier>=Hero ? 0 : 2000*sectors*(tier>=Allied?0.5:1)
- repDecay(id, days): if rep<-30: rep = min(-30+? , rep + 2*days) toward -30 (forgiveness); if rep>30: rep -= 1*days toward 30 (slow fade). default: only negative decays, positive is sticky (config DECAY_POSITIVE=false)
- tensionAdd(pairKey, amt): conflicts[key].tension = clamp(tension+amt,0,100). Player actions: kill side-A ship near contested sector -> +1.5 tension & playerLean toward B; complete A's anti-B mission -> +4 & lean A; sell contraband fueling war -> +2
- conflictState(t): t<40 'cold'; 40..74 'tense'; >=75 'war'
- warResolve(pairKey): on entering war, every WAR_TICK (every 6 in-game hrs) compute momentum = baseStrength[A]-baseStrength[B] + playerLean*PLAYER_WEIGHT(25); if |cumulativeMomentum|>FLIP_THRESHOLD(100) -> contested sector owner flips to leading side, tension resets to 50, emit('conflict:flip'). Player rep with losing side -= 30*|lean|, winning side += 20*|lean|
- onPlayerEvent routing: combat system emits 'ship:destroyed'{victimFaction,victimClass,attacker:'player',witnessed} -> factions.applyRep(victimFaction, killRepDelta) + for each enemyOfVictim applyRep(enemy,+6) + tensionAdd

## Interactions
- LISTENS 'ship:destroyed' {victimFaction, victimClass, attackerId, pos, witnessed} (from combat) -> applyRep on victim faction (negative) and on victim's enemy factions (positive), feeds tensionAdd for relevant contested pairs.
- LISTENS 'trade:completed' {factionId, netCredits, stationId} (from economy/trade) -> applyRep trade_at_faction_station (+0.5/1000cr capped +3).
- LISTENS 'mission:completed' / 'mission:failed' {factionId, repMult} (from missions) -> applyRep +15*repMult / -12; storyline missions may set faction flags.
- LISTENS 'scan:contraband' {factionId, units, fine} (from law/customs system) -> applyRep -40, knownContrabandStrikes++, emit 'fine:issued'.
- LISTENS 'distress:rescued' {factionId, tierReward} (from event/spawn system) -> applyRep +20, emit 'reward:credits'.
- LISTENS 'day:tick' {days} (from time system) -> repDecay for all factions, advance conflict WAR_TICK / warResolve.
- EMITS 'rep:changed' {factionId, delta, reason, newRep, newTier, tierChanged} -> consumed by HUD (toast), AI (re-evaluate aggro), economy (price refresh), missions (board refresh).
- EMITS 'rep:spillover' {factionId, delta, srcFaction} -> consumed by HUD log (subtle), AI aggro recheck.
- EMITS 'faction:aggro' {factionId, isAggro} -> consumed by AI/spawn system to set NPC targeting + station dock-deny, and by HUD to flash hostile contact.
- EMITS 'conflict:flip' {pairKey, sectorId, newOwner} -> consumed by sector/spawn system (re-skin station, change spawn tables), economy (price shift), map UI.
- EMITS 'conflict:war_declared' {pairKey, sides} -> spawn system spawns war fleets in contested sector; mission system injects war-side missions.
- PROVIDES getRepPriceMod(factionId) -> read by economy/trade for buy/sell multipliers.
- PROVIDES dockAccess(factionId), isAggro(factionId), getTier(factionId), bribeCost(factionId), missionAvailable(mission) -> read by docking UI, AI, mission board, station menu.
- WRITES GameState.sectors[id].owner on war resolution -> read by spawn (which faction's NPCs/stations appear), economy (local prices), parallax/skybox tint.
- READS GameState.factionMeta (static tables) for relationship matrix, spillover weights, action weights, tier thresholds, price curves at load.
- SAVE/LOAD: GameState.factions + GameState.conflicts serialize to JSON; factionMeta re-hydrated from content on boot (not saved).

## UI Needs
- Reputation panel (faction screen): list all 8 factions with color swatch, current tier name, numeric rep, and a horizontal bar from -1000..+1000 with tier-band coloring and a marker at current value.
- Per-faction detail: relationship icons to other 7 factions (ally/neutral/rival/hostile), home sectors, what they control, and active effects at current tier (discount %, dock status, escort availability).
- HUD rep toast: transient notification on 'rep:changed' / 'faction:aggro' — e.g. '+15 Drift Miners Collective (mission complete) -> Accepted', red flash on new aggro.
- Sensor/contact tagging: nearby NPC ships and stations tinted by faction color with a small standing indicator (green=friendly, yellow=neutral, orange=disliked, red=aggro).
- Station dock screen: show faction, your standing, dock status (full/restricted/locked), price modifier preview, and a Bribe button (with cost) when hostile-but-bribeable.
- Mission board: filter/sort by faction and lock greyed-out missions below your minRep with a 'requires Trusted+' hint.
- Trade screen: show the rep price modifier inline (e.g. '-12% ally discount' / '+25% hostile surcharge') on each buy/sell line.
- Conflict/war map overlay: galaxy map shows contested sectors, current owner color, tension meter per active war pair, and player-lean indicator; banner when a war is declared or a sector flips.
- Escort/hail prompt: at Allied+ a 'Request Escort' action with cost (or FREE at Hero) on the station menu and via comms hail.
- Bribe confirm dialog: shows cost, resulting standing (-29 Disliked), and escalation warning for repeat bribes.

## Risks
- 
