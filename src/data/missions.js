// src/data/missions.js – mission system canonical data.
// Exports: MISSION_TYPES (10), STORY_BEATS (8), OFFER_MIX, MISSION_TUNING.
// Pure data, no imports.

export const MISSION_TUNING = {
  BASE: {
    cargo_delivery: 180, bulk_trade: 170, bounty_hunt: 200, mining_quota: 130,
    salvage_retrieval: 160, escort: 180, patrol_clear: 220, smuggling_run: 250,
    passenger_transport: 160, recon_scan: 140,
  },
  RISK_MULT: [1.0, 1.3, 1.7, 2.2, 3.0],
  BASE_REP: {
    cargo_delivery: 3, bulk_trade: 3, bounty_hunt: 5, mining_quota: 2,
    salvage_retrieval: 3, escort: 4, patrol_clear: 5, smuggling_run: 4,
    passenger_transport: 2, recon_scan: 4,
  },
  distDivisor: 2000,
  valueDivisor: 8000,
  faction: { friendlyThreshold: 25, loyaltyBonus: 1.15 },
  rush: { fTime: 1.35, slackMult: 0.5 },
  cruiseSpeedRef: 140,
  slackDefault: 2.2,
  collateralPct: 0.25,
  refreshSec: 600,
  maxActive: 8,
};

export const MISSION_TYPES = [
  {
    type: 'cargo_delivery', riskTierRange: [0, 1], chainable: true,
    completionEvent: 'cargo.delivered',
    rewardFormula: 'round(180 * (1 + distance/2000) * RISK_MULT[riskTier] * (1 + cargoValue/8000) * f_faction * f_time)',
    timeFormula: 'round((distance/140 + 20) * slack)', taskTime: 20,
    failureCondition: 'timer OR cargo lost (ship destroyed)',
    constraints: { needsCargoSpace: true },
  },
  {
    type: 'bulk_trade', riskTierRange: [1, 2], chainable: true, collateral: true,
    completionEvent: 'trade.sold (aggregated to quota)',
    rewardFormula: 'round(170 * (1 + distance/2000) * RISK_MULT[riskTier] * (1 + cargoValue/8000) * f_faction * f_time)',
    timeFormula: 'round((distance/140 + quotaQty*1.5) * slack)', taskTime: 'quotaQty*1.5',
    failureCondition: 'timer OR fail to sell quota; collateral forfeited',
    constraints: { collateralPct: 0.25 },
  },
  {
    type: 'bounty_hunt', riskTierRange: [2, 4], chainable: true,
    completionEvent: 'enemy.killed (entityId==targetId)',
    rewardFormula: 'round(200 * (1 + distance/2000) * RISK_MULT[riskTier] * targetStrength * f_faction * f_time)',
    timeFormula: 'round((distance/140 + 60) * slack)', taskTime: 60,
    failureCondition: 'timer OR target despawns/flees sector',
    constraints: { fValueIsTargetStrength: true },
  },
  {
    type: 'mining_quota', riskTierRange: [1, 3], chainable: true,
    completionEvent: 'mining.yield (aggregated to quota)',
    rewardFormula: 'round(130 * (1 + distance/2000) * RISK_MULT[riskTier] * (1 + cargoValue/8000) * f_faction * f_time)',
    timeFormula: 'round((distance/140 + quotaQty*3) * slack)', taskTime: 'quotaQty*3',
    failureCondition: 'timer',
    constraints: {},
  },
  {
    type: 'salvage_retrieval', riskTierRange: [1, 3], chainable: true,
    completionEvent: 'cargo.delivered (itemId==salvageId)',
    rewardFormula: 'round(160 * (1 + distance/2000) * RISK_MULT[riskTier] * (1 + cargoValue/8000) * f_faction * f_time)',
    timeFormula: 'round((distance/140 + 30) * slack)', taskTime: 30,
    failureCondition: 'timer OR wreck destroyed before pickup',
    constraints: {},
  },
  {
    type: 'escort', riskTierRange: [2, 4], chainable: false,
    completionEvent: 'dock.entered@dest with escortee.alive',
    rewardFormula: 'round(180 * (1 + distance/2000) * RISK_MULT[riskTier] * targetStrength * f_faction * f_time)',
    timeFormula: 'round((distance/140 + 90) * slack)', taskTime: 90,
    failureCondition: 'escortee destroyed OR abandoned (player leaves sector)',
    constraints: { fValueIsTargetStrength: true },
  },
  {
    type: 'patrol_clear', riskTierRange: [2, 4], chainable: true,
    completionEvent: 'all spawn-tagged enemy.killed (clearCount reached)',
    rewardFormula: 'round(220 * (1 + distance/2000) * RISK_MULT[riskTier] * targetStrength * f_faction * f_time)',
    timeFormula: 'round((distance/140 + clearCount*45) * slack)', taskTime: 'clearCount*45',
    failureCondition: 'timer expires with hostiles remaining',
    constraints: { fValueIsTargetStrength: true },
  },
  {
    type: 'smuggling_run', riskTierRange: [2, 4], chainable: false, collateral: true,
    completionEvent: 'cargo.delivered (itemId==contrabandId) covertly',
    rewardFormula: 'round(250 * (1 + distance/2000) * RISK_MULT[riskTier] * (1 + cargoValue/8000) * f_faction * f_time)',
    timeFormula: 'round((distance/140 + 20) * slack)', taskTime: 20,
    failureCondition: 'scanned with contraband OR timer; collateral forfeited on bust',
    constraints: { collateralPct: 0.25, repToLawFaction: -3 },
  },
  {
    type: 'passenger_transport', riskTierRange: [0, 2], chainable: true,
    completionEvent: 'dock.entered@dest',
    rewardFormula: 'round(160 * (1 + distance/2000) * RISK_MULT[riskTier] * (1 + cargoValue/8000) * f_faction * f_time)',
    timeFormula: 'round((distance/140 + 20) * slack)', taskTime: 20,
    failureCondition: 'timer OR ship destroyed (passenger lost)',
    constraints: {},
  },
  {
    type: 'recon_scan', riskTierRange: [1, 3], chainable: true,
    completionEvent: 'scan.completed (targetId in objective set)',
    rewardFormula: 'round(140 * (1 + distance/2000) * RISK_MULT[riskTier] * (1 + scanTargets*0.25) * f_faction * f_time)',
    timeFormula: 'round((distance/140 + scanTargets*25) * slack)', taskTime: 'scanTargets*25',
    failureCondition: 'timer OR scan-target despawns',
    constraints: { fValueIsScanTargets: true },
  },
];

// Offer-mix weights by station type (order matches MISSION_TYPES array above).
// [cargo, trade, bounty, mining, salvage, escort, patrol, smuggling, passenger, recon]
export const OFFER_MIX = {
  mining:      [3, 2, 1, 4, 2, 1, 1, 0, 1, 1],
  refinery:    [3, 2, 1, 4, 2, 1, 1, 0, 1, 1],
  fab:         [3, 2, 1, 2, 2, 1, 1, 0, 1, 1],
  trade_hub:   [4, 4, 1, 1, 1, 2, 1, 1, 3, 1],
  military:    [1, 1, 4, 0, 1, 2, 4, 0, 1, 2],
  research:    [2, 1, 1, 1, 2, 1, 1, 0, 1, 4],
  blackmarket: [2, 1, 3, 2, 3, 1, 2, 2, 1, 2],
};

// 8-beat story spine FSM.
export const STORY_BEATS = [
  { beat: 0, id: 'cold_start',     objective: 'mining_quota: mine 10u cmdty_silicate, deliver to home station',
    reward: { credits: 400, rep: { faction: 'home', amount: 5 }, unlock: 'mod_mining_laser_s' }, introduces: 'mining', next: 1 },
  { beat: 1, id: 'honest_work',    objective: 'cargo_delivery: carry 12u to neighbor station',
    reward: { credits: 600, unlock: 'trade_tutorial' }, introduces: 'trade', next: 2 },
  { beat: 2, id: 'first_blood',    objective: 'bounty_hunt: kill 1 weak pirate (lvl1)',
    reward: { credits: 800, unlock: 'wpn_pulse_laser_s' }, introduces: 'combat', next: 3 },
  { beat: 3, id: 'bigger_boat',    objective: 'purchase any T2 hull at shipyard', precredits: 1500,
    reward: { credits: 1000, milestone: 'cargo+20u' }, introduces: 'shipyard', next: 4 },
  { beat: 4, id: 'pick_a_side',    objective: 'accept faction_mts OR faction_scn OR faction_free intro contract', branch: true,
    reward: { credits: 1200, rep: { chosen: 15, opposing: -10 } }, introduces: 'factions', next: 5 },
  { beat: 5, id: 'proving_ground', objective: 'branch chain: faction_mts=bulk_trade x3 / faction_scn=patrol_clear x2 / faction_free=smuggling_run x2',
    reward: { credits: 2500, unlock: 'module_unlock' }, introduces: 'chaining+passive_preview', next: 6 },
  { beat: 6, id: 'empire_seed',    objective: 'deploy first passive asset (drone OR trader OR outpost)', precredits: 8000,
    reward: { credits: 3000, unlock: 'passive_income' }, introduces: 'passive_income', next: 7 },
  { beat: 7, id: 'deep_reach',     objective: 'amass 100000cr net worth AND rep>=50 with chosen faction, THEN buy capital hull OR build+defend outpost (3-wave)',
    reward: { title: 'Sector Baron', unlock: 'newgame_plus' }, introduces: 'endgame', next: null },
];
