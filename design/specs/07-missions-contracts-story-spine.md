# Missions, contracts & story spine

## Summary
A listener-and-granter subsystem: it never owns the wallet or faction reputation, it detects progress from events other systems emit (mining.yield, trade.sold, enemy.killed, cargo.delivered, scan.completed, player.scannedByPatrol, dock.entered, sector.entered) and pays out by emitting deltas (economy.grantCredits, faction.repDelta, spawn.request, ui.notify, story.beatAdvanced). It owns three things: per-station mission boards (deterministically generated from a seeded hash of worldSeed+stationId+refreshEpoch so save/load reproduces exactly), active mission instances (a lifecycle FSM offered->accepted->active->completed/failed/expired->settled), and a hand-authored 8-beat main-storyline FSM that introduces systems in order (mining -> trade -> combat -> ship upgrade -> faction choice/branch -> mission chains/passive-income preview -> first passive asset -> endgame north star of 100k net worth + capital ship or defended outpost). Ten procedurally generated mission types share ONE multiplicative reward family reward_cr = round(BASE[type] * f_dist * f_risk * f_value * f_faction * f_time) with all four required scalers, time limits derived from travel+task time with slack, collateral deposits on bulk_trade/smuggling to kill the accept-then-dump exploit, optional deterministic chaining, and event-keyed (not entity-pinned) objectives plus stale-target GC to prevent soft-locks. All cross-system references are by string ID for save/load safety; all credit constants are flagged tunable for cross-calibration against the economy and mining yields.

## Mechanics
- LIFECYCLE FSM per mission: offered -> accepted -> active -> (completed | failed | expired) -> settled. offered lives on a station board with TTL; accept moves it to missions.active, charges collateral, emits mission.accepted, fires spawn.request for any deferred targets; active tracks objectiveProgress vs objectiveTarget each relevant event; completed when progress>=target before deadline; failed on failure-condition event; expired when gameTime>deadline; settled pays reward+rep (or penalty) then removes instance and writes completedLog
- BOARD GENERATION & REFRESH: on dock.entered or when refreshEpoch=floor(gameTime/T_refresh) advances, regenerate the station's slots using seeded RNG seed=hash32(worldSeed,stationId,refreshEpoch); pick S=clamp(3+stationTier,3,9) types via OFFER_MIX weights for the stationType (rep-boosted for signature types); for each, roll dest within sectorReach, riskTier from dest sector danger, cargoValue/targetStrength from content tables, then compute reward_cr & time_limit_s via formulas; expired/accepted slots only regenerate on next epoch or dock so the board feels stable mid-visit
- OBJECTIVE TRACKING: each type maps to a listened completion-event (see interactions); progress accumulates (mining/bulk_trade quotas sum qty; patrol counts tagged kills; cargo/passenger/salvage/scan are boolean-at-dest); a single resolver function on each event scans missions.active for matching missionId/targetId and advances progress, emitting ui.notify on change and mission.completed at threshold
- CHAINING: chainable missions carry chainNextSeed; on completion, if chained, deterministically generate the next link from that seed and auto-offer it (ui.notify 'Follow-up available') or auto-accept for story chains (B5); chains store seeds not live instances so they survive save/load and interruption
- STORY FSM ADVANCEMENT: a story watcher subscribes to the same completion events filtered by storyTag==beatIndex; when current beat objective fires, grant beat reward (credits+rep+unlock flag), increment story.beatIndex, emit story.beatAdvanced, and inject the next beat's scripted offer onto the relevant board (or set branch at B4 from player's accepted intro contract)
- DETERMINISTIC SEEDED RNG: a small hash32(...)->mulberry32 PRNG produces all offer rolls; no Math.random anywhere in generation, so board contents and chain links reproduce exactly across save/load
- STALE-TARGET GC: each tick and on load, prune active missions whose destStationId/targetEntityIds no longer resolve (story missions re-inject equivalents); prevents soft-locks and orphaned objectives

## State Owned
- missions.boards: { [stationId]: { refreshEpoch:int, slots: MissionOffer[] } } — generated offers per station (MissionOffer = {id,type,seed,params,reward_cr,time_limit_s,collateral_cr,riskTier,destStationId|sectorId,factionId,storyTag?,expiresAtEpoch})
- missions.active: MissionInstance[] — accepted missions in flight (MissionInstance = {id,type,params,objectiveProgress,objectiveTarget,acceptedAt_s,deadline_s,reward_cr,collateral_cr,factionId,destStationId|sectorId,targetEntityIds:[],status:'active',chainNextSeed?})
- missions.completedLog: { type:string, count:int, totalCr:int, success:int, fail:int }[] — aggregated ledger for stats UI
- missions.nextId: int — monotonic counter for mission/offer ID generation
- story: { beatIndex:int (0..7), branch: 'traders'|'patrol'|'free'|null, flags: {[key]:bool}, chainProgress:int } — main-storyline FSM cursor
- missions.config (MISSION_TUNING): all tunable constants (BASE[], RISK_MULT[], divisors, T_refresh, slack, collateralPct, FRIENDLY_THRESHOLD, maxActive) — serialized so saves are self-describing

## Content
- === 10 MISSION-TYPE TABLE (cols: id | BASE_cr | riskTier | typicalTime_s | failureCondition | chainable? | completionEvent listened) ===
- cargo_delivery | 120 | 0-1 | 60-120 | timer expires OR cargo lost (ship destroyed) | yes | dock.entered@dest + cargo.delivered{itemId,qty}
- bulk_trade | 150 | 1-2 | 180-360 | timer expires OR fail to sell required qty; collateral forfeited | yes | trade.sold{commodityId,qty,stationId} aggregated to quota
- bounty_hunt | 200 | 2-4 | 120-300 | timer expires OR bounty target despawns/flees sector | yes | enemy.killed{entityId==targetId,byPlayer:true}
- mining_quota | 90 | 1-3 | 150-300 | timer expires | yes | mining.yield{oreId,qty} aggregated to quota
- salvage_retrieval | 130 | 1-3 | 120-240 | timer expires OR wreck destroyed before pickup | yes | cargo.delivered{itemId==salvageId} at dest
- escort | 180 | 2-4 | 150-300 | escortee entity.destroyed OR escortee abandoned (player leaves sector) | no | dock.entered@dest with escortee.alive
- patrol_clear | 220 | 2-4 | 180-360 | timer expires with hostiles remaining | yes | all spawn-tagged enemy.killed (clearCount reached)
- smuggling_run | 250 | 2-4 | 120-300 | player.scannedByPatrol{hasContraband:true} OR timer; collateral forfeited on bust | no | cargo.delivered{itemId==contrabandId} at dest covertly
- passenger_transport | 110 | 0-2 | 90-200 | timer expires OR ship destroyed (passenger lost) | yes | dock.entered@dest
- recon_scan | 100 | 1-3 | 120-240 | timer expires OR scan-target despawns | yes | scan.completed{targetId in objective set}
- === 3 WORKED EXAMPLES (reproducible from formulas) ===
- EX1 cargo_delivery 'Haul 18u Refined Alloy to Tycho Relay' | inputs: type=cargo, BASE=120, dist=1800wu, riskTier=1, cargoValue=2400cr, faction=neutral(f_faction=1.0) | f_dist=1+1800/2000=1.90, f_risk[1]=1.3, f_value=1+2400/8000=1.30, f_time=1.0 | reward=round(120*1.90*1.3*1.30*1.0*1.0)=385cr | time_limit=round((1800/140 + 20)*2.2)=72s | repDelta on success +3 (Traders Guild)
- EX2 bounty_hunt 'Eliminate pirate ace "Vex Mara" in Cinder Belt' | inputs: type=bounty, BASE=200, dist=3200wu, riskTier=3, targetStrength=2.4 (used as f_value), faction=aligned w/ Patrol(f_faction=1.15) | f_dist=1+3200/2000=2.60, f_risk[3]=2.2, f_value=2.4 | reward=round(200*2.60*2.2*2.4*1.15)=3157cr | time_limit=round((3200/140 + 60)*2.5)=207s | repDelta success: +8 Patrol, -5 Pirates
- EX3 mining_quota 'Deliver 40u Veldspar to Hollow Station' | inputs: type=mining, BASE=90, dist=1200wu, riskTier=2, quota qty=40 @ unitVal 45cr => cargoValue=1800cr, faction=neutral | f_dist=1+1200/2000=1.60, f_risk[2]=1.7, f_value=1+1800/8000=1.225 | reward=round(90*1.60*1.7*1.225*1.0)=300cr | time_limit=round((1200/140 + 40*3)*2.0)=257s | repDelta +2 Industrials
- === STORY SPINE: 8 beats (FSM, beatIndex 0..7). schema per beat: precondition / objective(event) / reward / systemIntroduced / nextBeat ===
- B0 'Cold Start' | pre: newGame | obj: complete scripted mining_quota (mine 10u Veldspar, deliver to home station) -> mining.yield + dock.entered | reward: 400cr + Mining Laser MkI unlock + 5 rep HomeFaction | introduces: MINING + mission board | next: B1
- B1 'Honest Work' | pre: beat0 done | obj: complete scripted cargo_delivery (carry 12u to neighbor station) -> cargo.delivered | reward: 600cr + Trade screen tutorial flag | introduces: TRADE/commodity buy-low-sell-high | next: B2
- B2 'First Blood' | pre: beat1 done | obj: scripted bounty_hunt vs 1 weak pirate (spawn.request lvl1) -> enemy.killed | reward: 800cr + Pulse Cannon MkI unlock | introduces: COMBAT + weapons | next: B3
- B3 'Bigger Boat' | pre: beat2 done AND credits>=1500 (else hint to grind generated missions) | obj: purchase any tier-2 hull at shipyard -> ship.purchased event | reward: 1000cr rebate + cargo +20u milestone | introduces: SHIPYARD/upgrades | next: B4
- B4 'Pick a Side' (BRANCH) | pre: beat3 done | obj: accept Traders Guild OR Patrol Authority OR Free Captains intro contract (player choice in UI) -> mission.accepted{storyTag} sets story.branch | reward: 1200cr + chosen-faction rep +15, opposing -10 | introduces: FACTION reputation + branching | next: B5
- B5 'Proving Ground' | pre: beat4 done | obj: branch-specific 3-mission chain (Traders=bulk_trade x3 / Patrol=patrol_clear x2 / Free=smuggling_run x2) -> chain completes | reward: 2500cr + faction module unlock (e.g. Trade Computer / Combat Drone / Cloak) | introduces: MISSION CHAINING + passive-income preview | next: B6
- B6 'Empire Seed' | pre: beat5 done AND credits>=8000 | obj: deploy first passive asset (buy mining drone OR hire NPC trader OR claim outpost plot) -> asset.deployed event | reward: 3000cr + passive-income system online | introduces: PASSIVE INCOME (drones/traders/outposts) | next: B7
- B7 'The Deep Reach' (ENDGAME / north star) | pre: beat6 done | obj: amass 100000cr net worth AND rep>=50 with chosen faction, THEN either buy a capital-class hull OR build+defend a fully-staffed outpost through a 3-wave assault (patrol_clear style) -> capital.acquired OR outpost.defended | reward: title 'Sector Baron' + NewGame+ unlock + endless escalation flag | introduces: endgame loop | next: null (sandbox continues)
- === SOFT-LOCK FALLBACKS ===
- Story objectives are EVENT-satisfied, not entity-pinned: if a scripted NPC/station required by a beat is destroyed/unreachable, board re-injects an equivalent generated mission tagged storyBeat:N on next dock; B3/B6 credit-gates show a hint instead of blocking and never require a specific unrecoverable entity.

## Formulas
- REWARD (one multiplicative family for ALL types): reward_cr = round(BASE[type] * f_dist * f_risk * f_value * f_faction * f_time)
- f_dist = 1 + distance_wu / 2000   (distance = path length from accept-station to objective-station/sector center; min 0)
- f_risk = RISK_MULT[riskTier], RISK_MULT = [1.0, 1.3, 1.7, 2.2, 3.0] for tiers 0..4 (tier from sector danger + enemy density)
- f_value (cargo-bearing types cargo_delivery/bulk_trade/mining_quota/salvage/smuggling/passenger): f_value = 1 + cargoValue_cr / 8000;  combat types (bounty/patrol/escort): f_value = targetStrength (= sum of target ship tier multipliers, ~1.0..4.0);  recon: f_value = 1 + scanTargets*0.25
- f_faction = 1.15 if player rep with offering faction >= FRIENDLY_THRESHOLD(=25) else 1.0 (loyalty bonus); independent of reward-payer
- f_time (urgency/rush option) = 1.0 normal, 1.35 if mission flagged rush (time_limit halved)
- TIME LIMIT: time_limit_s = round((travelEstimate + taskTime) * slack);  travelEstimate = pathLength_wu / playerCruiseSpeed_wu_s (use 140 as reference speed);  taskTime: cargo/passenger=20, mining=quotaQty*3, bounty=60, patrol=clearCount*45, escort=90, salvage=30, scan=scanTargets*25;  slack = 2.0..2.5 (default 2.2, lower for rush)
- REP GAIN on success: repDelta = round(BASE_REP[type] * (1 + riskTier*0.4)), BASE_REP: cargo=3, trade=3, mining=2, bounty=5, patrol=5, escort=4, salvage=3, smuggling=4(to offering faction)/-3(to law faction), passenger=2, recon=4
- FAILURE PENALTY: repDelta_fail = -ceil(repDelta_success * 0.6) to offering faction; collateral forfeited (bulk_trade & smuggling only)
- COLLATERAL (anti accept-then-dump): deposit_cr = round(0.25 * reward_cr) charged at accept on bulk_trade and smuggling_run; refunded on success, kept on failure/expire
- BOARD REFRESH: offers per station S = clamp(3 + stationTier, 3, 9); offer set seeded RNG seed = hash32(worldSeed, stationId, refreshEpoch); refreshEpoch = floor(gameTime_s / T_refresh), T_refresh = 600s (10 in-game min); also force-refresh expired slots on dock.entered; NEVER call Math.random directly
- OFFER MIX WEIGHTS by stationType (cargo,trade,bounty,mining,salvage,escort,patrol,smuggling,passenger,recon): industrial=[3,2,1,4,2,1,1,0,1,1], trade_hub=[4,4,1,1,1,2,1,1,3,1], military=[1,1,4,0,1,2,4,0,1,2], frontier=[2,1,3,2,3,1,2,2,1,2]; weight*=(1+rep/100) for the station faction's signature types

## Interactions
- LISTENS dock.entered{stationId} -> refresh expired board slots, check delivery-objective satisfaction, settle pending rewards
- LISTENS cargo.delivered{missionId?,itemId,qty,stationId} -> mark delivery objectives (cargo/salvage/smuggling/passenger)
- LISTENS trade.sold{commodityId,qty,stationId} -> increment bulk_trade quota progress
- LISTENS mining.yield{oreId,qty} -> increment mining_quota progress
- LISTENS enemy.killed{entityId,factionId,byPlayer} -> satisfy bounty (entityId==targetId) and patrol_clear (count tagged kills)
- LISTENS entity.destroyed{entityId} -> fail escort if entityId==escorteeId; fail cargo/passenger if player ship destroyed
- LISTENS scan.completed{targetId} -> satisfy recon objective set
- LISTENS sector.entered{sectorId} -> spawn deferred mission targets, fail escort if escortee abandoned
- LISTENS player.scannedByPatrol{hasContraband} -> fail active smuggling_run, forfeit collateral
- LISTENS ship.purchased / asset.deployed -> satisfy story beats B3/B6
- LISTENS update(dt) -> decrement TTL on offers + active missions, emit mission.expired/failed on timeout
- EMITS mission.accepted{missionId,type,storyTag?} ; mission.completed{missionId,type} ; mission.failed{missionId,reason} ; mission.expired{missionId}
- EMITS economy.grantCredits{amount,reason:'mission:<id>'} for rewards & collateral refund; economy.chargeCredits{amount,reason:'collateral'} at accept (economy system owns wallet)
- EMITS faction.repDelta{factionId,delta,reason} on completion/failure (faction system owns rep)
- EMITS spawn.request{entityType,sectorId,position,tags,refId} for bounty targets, escortee, patrol hostiles, salvage wrecks, scan beacons
- EMITS story.beatAdvanced{fromIndex,toIndex,branch?} ; ui.notify{kind,text} for offers/progress/success/fail toasts
- READS GameState.economy.credits (read-only, for collateral affordability check) and GameState.factions[].rep (read-only, for f_faction & offer weighting)

## UI Needs
- Station Mission Board panel: list of S offer cards (title, type icon, dest station/sector, distance, riskTier stars, reward_cr, time_limit, collateral if any, rush toggle) with Accept button; greys/disables if cargo/credits insufficient
- Active Missions tracker (HUD sidebar): each active mission shows objective text, progress (e.g. 23/40u mined, 2/3 sold), countdown timer (color shifts amber<60s/red<20s), distance-to-objective arrow
- Objective waypoint markers on the radar/minimap + world-space directional indicator (pointing to dest station / bounty target / wreck / scan beacon)
- Mission detail modal: full briefing text, reward breakdown (BASE*multipliers shown), failure conditions, faction rep impact preview, Abandon button (warns collateral forfeit)
- Toast notifications via ui.notify: 'Mission accepted', 'Objective updated', 'Mission complete +Ncr +rep', 'Mission FAILED', 'Offer expired'
- Story panel / Captain's Log: current beat objective pinned at top, completed beats as collapsible log, branch indicator after B4, endgame net-worth/rep progress bars for B7
- Completed-missions ledger (stats screen): counts per type, total cr earned, success/fail ratio

## Risks
- CREDIT CALIBRATION: BASE[type] and divisors (2000, 8000) are placeholders that MUST be cross-tuned against economy commodity margins and mining yields so missions pay ~1.2-1.8x raw grinding, not 10x; flag all constants as tunable in a single MISSION_TUNING object
- ID-SERIALIZATION: every mission references stationId/targetId/itemId/factionId by string ID, never object refs; on load, re-resolve IDs and drop/regenerate missions whose target entities no longer exist (stale-target GC pass)
- DETERMINISM: board offers MUST come from seeded hash32(worldSeed,stationId,refreshEpoch); a stray Math.random breaks save/load reproducibility and multiplayer-determinism later
- SOFT-LOCK: story beats keyed to events not specific surviving entities; credit-gated beats (B3/B6/B7) show hints and never hard-block; provide fallback re-injection of equivalent generated mission if a scripted NPC/station dies
- ANTI-EXPLOIT: collateral deposit on bulk_trade/smuggling prevents accept-then-dump farming; cap simultaneous active missions (e.g. 8) to prevent stacking; validate delivered cargo wasn't double-counted across two delivery missions
- TARGETS IN UNLOADED SECTORS: bounty/escort/patrol/salvage targets spawn lazily via spawn.request on sector.entered, with a TTL; if player never visits, mission simply expires (no orphan entities); store objective sectorId so it can be deferred
- TIMER FAIRNESS: time_limit uses reference speed 140wu/s; if player ship is slower than reference, generated mission picks nearer dest (cap distance by sectorReach) so limits stay achievable; rush variant is opt-in only
- CHAIN OWNERSHIP: chained missions store nextMissionTemplate seed, not a live instance, so an interrupted chain can regenerate its next link deterministically on completion
