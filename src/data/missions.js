// src/data/missions.js – mission system canonical data.
// Exports: MISSION_TYPES (10), SET_PIECE_MISSIONS (5), STORY_BEATS (8), OFFER_MIX, MISSION_TUNING.
// Pure data, no imports.

export const MISSION_TUNING = {
  BASE: {
    // Freight bases must cover real cargo acquisition, collateral exposure, tolls, and repair.
    // The old 180/170 values made successful Courier contracts net-negative.
    // bounty_hunt 110: combat contracts must clear gate tolls + repair + death insurance
    // after exclusive mission settlement (no stacked ambient bountyCr). Tuned for M3 Hunter
    // cohort ≥62.5 cr/min with real operating costs. The denser public-route adapter sits
    // without pushing the denser public route above its existing 400 cr/min ceiling.
    // Below mining quota and patrol_clear because this is a single-target writ.
    cargo_delivery: 600, bulk_trade: 550, bounty_hunt: 110, mining_quota: 130,
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

export const MISSION_STANDING_LADDER = [
  {
    minRep: -149,
    maxRisk: 1,
    name: 'Recovery Work',
    short: 'Disliked+',
    unlocks: 'R0-R1 local hauling, mining, courier, and recovery contracts',
  },
  {
    minRep: -29,
    maxRisk: 2,
    name: 'Neutral Board',
    short: 'Neutral+',
    unlocks: 'R2 standard trade, recon, bounty, and patrol postings',
  },
  {
    minRep: 30,
    maxRisk: 3,
    name: 'Accepted Contracts',
    short: 'Accepted+',
    unlocks: 'R3 higher-risk escorts, smuggling, and combat contracts',
  },
  {
    minRep: 150,
    maxRisk: 4,
    name: 'Trusted Work',
    short: 'Trusted+',
    unlocks: 'R4 severe contracts and loyalty-grade payouts',
  },
  {
    minRep: 400,
    maxRisk: 4,
    name: 'Allied Retainers',
    short: 'Allied+',
    unlocks: 'future faction-chain retainers and faction-exclusive work',
    aspirational: true,
  },
];

export function missionStandingGateForRisk(riskTier) {
  const risk = Math.max(0, Math.min(4, Math.round(Number(riskTier) || 0)));
  for (const gate of MISSION_STANDING_LADDER) {
    if (risk <= gate.maxRisk) return gate;
  }
  return MISSION_STANDING_LADDER[MISSION_STANDING_LADDER.length - 2];
}

export function missionStandingGateForMinRep(minRep) {
  const rep = Math.round(Number(minRep) || 0);
  let gate = MISSION_STANDING_LADDER[0];
  for (const candidate of MISSION_STANDING_LADDER) {
    if (rep >= candidate.minRep) gate = candidate;
  }
  return gate;
}

export function missionMinRepForRisk(riskTier) {
  const gate = missionStandingGateForRisk(riskTier);
  return gate ? gate.minRep : 0;
}

export const STORY_BRANCH_INTRO_TAG = 'story.branch_intro';
export const STORY_BRANCH_INTRO_MIN_REP = -29;

export const STORY_BRANCH_INTROS = [
  {
    branch: 'traders',
    factionId: 'faction_mts',
    type: 'bulk_trade',
    title: 'Meridian Charter Trial',
  },
  {
    branch: 'patrol',
    factionId: 'faction_scn',
    type: 'patrol_clear',
    title: 'Concord Patrol Trial',
  },
  {
    branch: 'free',
    factionId: 'faction_free',
    type: 'smuggling_run',
    title: 'Free Captain Intro Run',
  },
];

export const MISSION_TYPES = [
  {
    type: 'cargo_delivery', riskTierRange: [0, 1], chainable: true,
    completionEvent: 'cargo.delivered',
    rewardFormula: 'round(600 * (1 + distance/2000) * RISK_MULT[riskTier] * (1 + cargoValue/8000) * f_faction * f_time)',
    timeFormula: 'round((distance/140 + 20) * slack)', taskTime: 20,
    failureCondition: 'timer OR cargo lost (ship destroyed)',
    constraints: { needsCargoSpace: true },
  },
  {
    type: 'bulk_trade', riskTierRange: [1, 2], chainable: true, collateral: true,
    completionEvent: 'trade.sold (aggregated to quota)',
    rewardFormula: 'round(550 * (1 + distance/2000) * RISK_MULT[riskTier] * (1 + cargoValue/8000) * f_faction * f_time)',
    timeFormula: 'round((distance/140 + quotaQty*1.5) * slack)', taskTime: 'quotaQty*1.5',
    failureCondition: 'timer OR fail to sell quota; collateral forfeited',
    constraints: { collateralPct: 0.25 },
  },
  {
    // R1+ keeps "first blood" / early board writs reachable before standing climbs to R2.
    type: 'bounty_hunt', riskTierRange: [1, 4], chainable: true,
    completionEvent: 'enemy.killed (entityId==targetId)',
    rewardFormula: 'round(110 * (1 + distance/2000) * RISK_MULT[riskTier] * targetStrength * f_faction * f_time)',
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
  {
    // PQ-019C — the authored physical capsule heist. AUTHORED-ONLY, never procedurally rolled.
    //
    // Procedural weight is zero STRUCTURALLY rather than by a table entry: every OFFER_MIX row is
    // 10 long and this is the 11th type, so `missions._pickType` reads `weights[10] || 0` = 0 for
    // every station type. Because 0 does not change the weight total, adding this entry leaves the
    // procedural offer RNG stream byte-identical. `missions._syncHeistOffer` is the only thing that
    // ever puts it on a board.
    //
    // `chainable: false` keeps `_instanceFromOffer` from minting a chainNextSeed, so completing a
    // heist cannot auto-offer a procedural sequel. No `collateral`: see src/data/heistMission.js.
    type: 'heist_intercept', riskTierRange: [3, 3], chainable: false, proceduralWeight: 0,
    completionEvent: 'heist terminal receipt (fenced_success) from the pure outcome arbiter',
    rewardFormula: 'authored flat payout (src/data/heistMission.js PQ019C_HEIST_TUNING.payoutCr)',
    timeFormula: 'none — the run window is an arbitrated `expired` candidate, not a mission deadline',
    taskTime: 0,
    failureCondition: 'any terminal outcome other than fenced_success',
    constraints: { authoredOnly: true },
  },
];

// SP1 — authored set-piece chains compiled into ordinary sequential mission offers.
// These are definitions, not persistent run state: boards, active missions, their cause records,
// and canonical receipts remain the only save authority. A route consists of commonStages followed
// by exactly one of two branch stage lists. Every route is intentionally 3-4 accepted missions.
// Original three (long_read, witness_run, hearing) plus depth-shape expansion (blockade_run,
// investigation_chain): each multiplies board variety via stage *graphs*, not single-threshold reskins.
function setPieceCopyRefs(archetypeId, stageId) {
  const root = `mission.sp1.${archetypeId}.${stageId}`;
  return {
    instructionRef: `${root}.instruction`,
    successRef: `${root}.success`,
    failureRef: `${root}.failure`,
    recoveryRef: `${root}.recovery`,
  };
}

export const SET_PIECE_MISSIONS = [
  {
    id: 'long_read',
    title: 'The Long Read',
    startStationId: 'station_drift',
    repeatable: true,
    commonStages: [
      {
        id: 'rumor_survey',
        title: 'Buy the Bad Coordinates',
        type: 'recon_scan',
        boardStationId: 'station_drift',
        destSectorId: 'sector_io_reach',
        factionId: 'faction_mts',
        riskTier: 1,
        rewardCr: 620,
        collateralCr: 0,
        upfrontCostCr: 180,
        durationS: 1800,
        distance: 2400,
        params: {
          scanTargets: 2,
          setPieceObjective: 'long_read_rumor_survey',
          rumorPurchased: false,
          bearingFixed: false,
        },
        clauseIds: [],
        ...setPieceCopyRefs('long_read', 'rumor_survey'),
      },
      {
        id: 'hold_the_cutters',
        title: 'Recover Under Pressure',
        type: 'salvage_retrieval',
        boardStationId: 'station_reach',
        destSectorId: 'sector_io_reach',
        factionId: 'faction_free',
        riskTier: 2,
        rewardCr: 1180,
        collateralCr: 260,
        durationS: 1800,
        distance: 900,
        params: {
          setPieceObjective: 'long_read_salvage',
          complicationObserved: false,
          salvageDecisionReady: false,
        },
        clauseIds: ['no_kills'],
        ...setPieceCopyRefs('long_read', 'hold_the_cutters'),
      },
    ],
    branches: [
      {
        id: 'lawful',
        label: 'File the Evidence',
        tradeoff: 'Take the legible price and make the recovered record public.',
        stages: [
          {
            id: 'file_the_evidence',
            title: 'File the Evidence',
            type: 'salvage_retrieval',
            boardStationId: 'station_reach',
            destSectorId: 'sector_io_reach',
            factionId: 'faction_scn',
            riskTier: 2,
            rewardCr: 1540,
            collateralCr: 420,
            durationS: 900,
            distance: 3100,
            params: {
              setPieceObjective: 'long_read_fence',
              wreckChoiceId: 'authority_handover',
            },
            clauseIds: [],
            ...setPieceCopyRefs('long_read', 'file_the_evidence'),
          },
        ],
      },
      {
        id: 'quiet',
        label: 'Erase the Origin',
        tradeoff: 'Take the quiet price and let Nyx remove the recovered record’s provenance.',
        stages: [
          {
            id: 'erase_the_origin',
            title: 'Erase the Origin',
            type: 'salvage_retrieval',
            boardStationId: 'station_reach',
            destSectorId: 'sector_io_reach',
            factionId: 'faction_quiet',
            riskTier: 3,
            rewardCr: 2240,
            collateralCr: 620,
            durationS: 900,
            distance: 3600,
            params: {
              setPieceObjective: 'long_read_fence',
              wreckChoiceId: 'claim_hardware',
            },
            clauseIds: [],
            ...setPieceCopyRefs('long_read', 'erase_the_origin'),
          },
        ],
      },
    ],
  },
  {
    id: 'witness_run',
    title: 'The Witness Run',
    startStationId: 'station_customs',
    repeatable: true,
    witnesses: [
      {
        id: 'dorin',
        displayName: 'Dorin Vale',
        travelLineRefs: [
          'mission.sp1.witness_run.travel.dorin.01',
          'mission.sp1.witness_run.travel.dorin.02',
          'mission.sp1.witness_run.travel.dorin.03',
          'mission.sp1.witness_run.travel.dorin.04',
        ],
      },
      {
        id: 'kell',
        displayName: 'Kell Orr',
        travelLineRefs: [
          'mission.sp1.witness_run.travel.kell.01',
          'mission.sp1.witness_run.travel.kell.02',
          'mission.sp1.witness_run.travel.kell.03',
          'mission.sp1.witness_run.travel.kell.04',
        ],
      },
    ],
    commonStages: [
      {
        id: 'compare_aliases',
        title: 'Compare the Aliases',
        type: 'recon_scan',
        boardStationId: 'station_customs',
        destSectorId: 'sector_tethys_junction',
        factionId: 'faction_scn',
        riskTier: 1,
        rewardCr: 560,
        collateralCr: 0,
        distance: 700,
        params: { scanTargets: 3 },
        clauseIds: [],
        ...setPieceCopyRefs('witness_run', 'compare_aliases'),
      },
      {
        id: 'extract_the_witness',
        title: 'Extract the Witness',
        type: 'passenger_transport',
        boardStationId: 'station_customs',
        destStationId: 'station_drift',
        destSectorId: 'sector_pallas_drift',
        factionId: 'faction_scn',
        riskTier: 2,
        rewardCr: 1080,
        collateralCr: 260,
        distance: 2600,
        params: { passengerCount: 1, witnessSelector: 'seeded_chain_actor' },
        clauseIds: [],
        ...setPieceCopyRefs('witness_run', 'extract_the_witness'),
      },
    ],
    branches: [
      {
        id: 'publish',
        label: 'Publish the Testimony',
        tradeoff: 'Give the witness public custody and make the retaliation window visible.',
        stages: [
          {
            id: 'transfer_public_custody',
            title: 'Transfer Public Custody',
            type: 'passenger_transport',
            boardStationId: 'station_drift',
            destStationId: 'station_coalition',
            destSectorId: 'sector_helios_prime',
            factionId: 'faction_scn',
            riskTier: 2,
            rewardCr: 1480,
            collateralCr: 420,
            distance: 2900,
            params: { passengerCount: 1, witnessSelector: 'chain_actor' },
            clauseIds: ['no_kills'],
            ...setPieceCopyRefs('witness_run', 'transfer_public_custody'),
          },
          {
            id: 'file_the_testimony',
            title: 'File the Testimony',
            type: 'cargo_delivery',
            boardStationId: 'station_coalition',
            destStationId: 'station_tethys',
            destSectorId: 'sector_tethys_junction',
            factionId: 'faction_scn',
            riskTier: 2,
            rewardCr: 1880,
            collateralCr: 520,
            distance: 1900,
            preloadedCargo: true,
            params: { cmdtyId: 'cmdty_classified_salvage', qty: 1 },
            clauseIds: ['cargo_intact'],
            ...setPieceCopyRefs('witness_run', 'file_the_testimony'),
          },
        ],
      },
      {
        id: 'shelter',
        label: 'Shelter the Witness',
        tradeoff: 'Keep the source alive and useful by making the record unavailable.',
        stages: [
          {
            id: 'run_the_shelter_key',
            title: 'Run the Shelter Key',
            type: 'smuggling_run',
            boardStationId: 'station_drift',
            destStationId: 'station_nyx_march',
            destSectorId: 'sector_nyx_march',
            factionId: 'faction_quiet',
            riskTier: 3,
            rewardCr: 1840,
            collateralCr: 560,
            distance: 1800,
            preloadedCargo: true,
            params: { cmdtyId: 'cmdty_classified_salvage', qty: 1 },
            clauseIds: ['no_scan'],
            ...setPieceCopyRefs('witness_run', 'run_the_shelter_key'),
          },
          {
            id: 'verify_quiet_handoffs',
            title: 'Verify the Quiet Handoffs',
            type: 'recon_scan',
            boardStationId: 'station_nyx_march',
            destSectorId: 'sector_nyx_march',
            factionId: 'faction_quiet',
            riskTier: 3,
            rewardCr: 2360,
            collateralCr: 620,
            distance: 800,
            params: { scanTargets: 3 },
            clauseIds: ['no_scan'],
            ...setPieceCopyRefs('witness_run', 'verify_quiet_handoffs'),
          },
        ],
      },
    ],
  },
  {
    id: 'hearing',
    title: 'The Hearing',
    startStationId: 'station_forge',
    repeatable: true,
    commonStages: [
      {
        id: 'open_the_hearing',
        title: 'Open the Hearing',
        type: 'recon_scan',
        boardStationId: 'station_forge',
        destSectorId: 'sector_vesta_forge',
        factionId: 'faction_dmc',
        riskTier: 2,
        rewardCr: 880,
        collateralCr: 220,
        distance: 800,
        params: { scanTargets: 3 },
        clauseIds: [],
        ...setPieceCopyRefs('hearing', 'open_the_hearing'),
      },
    ],
    branches: [
      {
        id: 'defend',
        label: 'Defend the Station',
        tradeoff: 'Buy repair time first, then break only the marked siege screen.',
        stages: [
          {
            id: 'escort_the_tender',
            title: 'Escort the Repair Tender',
            type: 'escort',
            boardStationId: 'station_forge',
            destStationId: 'station_depot3',
            destSectorId: 'sector_vesta_forge',
            factionId: 'faction_dmc',
            riskTier: 2,
            rewardCr: 1420,
            collateralCr: 420,
            distance: 1100,
            params: { targetStrength: 1.25 },
            clauseIds: ['no_kills'],
            ...setPieceCopyRefs('hearing', 'escort_the_tender'),
          },
          {
            id: 'break_the_screen',
            title: 'Break the Siege Screen',
            type: 'patrol_clear',
            boardStationId: 'station_depot3',
            destSectorId: 'sector_vesta_forge',
            factionId: 'faction_dmc',
            riskTier: 2,
            rewardCr: 2040,
            collateralCr: 520,
            distance: 900,
            params: { clearCount: 3, targetStrength: 1.35 },
            clauseIds: [],
            ...setPieceCopyRefs('hearing', 'break_the_screen'),
          },
        ],
      },
      {
        id: 'expedite',
        label: 'Expedite the Siege',
        tradeoff: 'Make the target deck precise and let the firing schedule become the verdict.',
        stages: [
          {
            id: 'deliver_target_deck',
            title: 'Deliver the Target Deck',
            type: 'cargo_delivery',
            boardStationId: 'station_forge',
            destStationId: 'station_depot3',
            destSectorId: 'sector_vesta_forge',
            factionId: 'faction_choir',
            riskTier: 3,
            rewardCr: 1860,
            collateralCr: 620,
            distance: 1100,
            preloadedCargo: true,
            params: { cmdtyId: 'cmdty_classified_salvage', qty: 1 },
            clauseIds: ['no_scan'],
            ...setPieceCopyRefs('hearing', 'deliver_target_deck'),
          },
          {
            id: 'file_firing_corrections',
            title: 'File the Firing Corrections',
            type: 'recon_scan',
            boardStationId: 'station_depot3',
            destSectorId: 'sector_vesta_forge',
            factionId: 'faction_choir',
            riskTier: 3,
            rewardCr: 2320,
            collateralCr: 680,
            distance: 900,
            params: { scanTargets: 3 },
            clauseIds: ['no_scan'],
            ...setPieceCopyRefs('hearing', 'file_firing_corrections'),
          },
        ],
      },
    ],
  },
  // ── Depth shapes: multi-stage graphs with distinct verb sequences ──────────
  {
    id: 'blockade_run',
    title: 'The Blockade Run',
    startStationId: 'station_customs',
    repeatable: true,
    commonStages: [
      {
        id: 'map_the_cordon',
        title: 'Map the Cordon',
        type: 'recon_scan',
        boardStationId: 'station_customs',
        destSectorId: 'sector_tethys_junction',
        factionId: 'faction_scn',
        riskTier: 2,
        rewardCr: 720,
        collateralCr: 0,
        durationS: 1500,
        distance: 900,
        params: {
          scanTargets: 3,
          setPieceObjective: 'blockade_map_cordon',
        },
        clauseIds: [],
        ...setPieceCopyRefs('blockade_run', 'map_the_cordon'),
      },
      {
        id: 'hold_course_under_fire',
        title: 'Hold Course Under Fire',
        type: 'cargo_delivery',
        boardStationId: 'station_customs',
        destStationId: 'station_tethys',
        destSectorId: 'sector_tethys_junction',
        factionId: 'faction_mts',
        riskTier: 2,
        rewardCr: 1180,
        collateralCr: 280,
        durationS: 1800,
        distance: 1100,
        preloadedCargo: true,
        params: {
          cmdtyId: 'cmdty_classified_salvage',
          qty: 1,
          setPieceObjective: 'blockade_hold_course',
        },
        clauseIds: ['cargo_intact'],
        ...setPieceCopyRefs('blockade_run', 'hold_course_under_fire'),
      },
    ],
    branches: [
      {
        id: 'pay_the_toll',
        label: 'Pay the Quiet Toll',
        tradeoff: 'Lose mass and pride; keep the route legally invisible.',
        stages: [
          {
            id: 'run_the_quiet_tithe',
            title: 'Run the Quiet Tithe',
            type: 'smuggling_run',
            boardStationId: 'station_tethys',
            destStationId: 'station_smuggler',
            destSectorId: 'sector_pallas_drift',
            factionId: 'faction_quiet',
            riskTier: 3,
            rewardCr: 1640,
            collateralCr: 480,
            durationS: 1600,
            distance: 2400,
            preloadedCargo: true,
            params: {
              cmdtyId: 'cmdty_classified_salvage',
              qty: 1,
              setPieceObjective: 'blockade_quiet_tithe',
            },
            clauseIds: ['no_scan'],
            ...setPieceCopyRefs('blockade_run', 'run_the_quiet_tithe'),
          },
        ],
      },
      {
        id: 'break_the_guns',
        label: 'Break the Guns',
        tradeoff: 'Clear the cordon ships and force a public arrival.',
        stages: [
          {
            id: 'clear_the_cordon',
            title: 'Clear the Cordon Screen',
            type: 'patrol_clear',
            boardStationId: 'station_tethys',
            destSectorId: 'sector_tethys_junction',
            factionId: 'faction_scn',
            riskTier: 3,
            rewardCr: 1720,
            collateralCr: 520,
            durationS: 1700,
            distance: 1000,
            params: {
              clearCount: 3,
              targetStrength: 1.3,
              setPieceObjective: 'blockade_clear_cordon',
            },
            clauseIds: [],
            ...setPieceCopyRefs('blockade_run', 'clear_the_cordon'),
          },
          {
            id: 'dock_through_wreckage',
            title: 'Dock Through the Wreckage',
            type: 'cargo_delivery',
            boardStationId: 'station_tethys',
            destStationId: 'station_drift',
            destSectorId: 'sector_pallas_drift',
            factionId: 'faction_mts',
            riskTier: 2,
            rewardCr: 2100,
            collateralCr: 560,
            durationS: 1400,
            distance: 2600,
            preloadedCargo: true,
            params: {
              cmdtyId: 'cmdty_classified_salvage',
              qty: 1,
              setPieceObjective: 'blockade_public_dock',
            },
            clauseIds: ['cargo_intact'],
            ...setPieceCopyRefs('blockade_run', 'dock_through_wreckage'),
          },
        ],
      },
    ],
  },
  {
    id: 'investigation_chain',
    title: 'The Investigation Chain',
    startStationId: 'station_reach',
    repeatable: true,
    commonStages: [
      {
        id: 'scan_the_silent_wreck',
        title: 'Scan the Silent Wreck',
        type: 'recon_scan',
        boardStationId: 'station_reach',
        destSectorId: 'sector_io_reach',
        factionId: 'faction_free',
        riskTier: 2,
        rewardCr: 680,
        collateralCr: 0,
        durationS: 1500,
        distance: 1200,
        params: {
          scanTargets: 3,
          setPieceObjective: 'investigation_scan_wreck',
        },
        clauseIds: [],
        ...setPieceCopyRefs('investigation_chain', 'scan_the_silent_wreck'),
      },
      {
        id: 'recover_the_black_box',
        title: 'Recover the Black Box',
        type: 'salvage_retrieval',
        boardStationId: 'station_reach',
        destSectorId: 'sector_io_reach',
        factionId: 'faction_free',
        riskTier: 2,
        rewardCr: 1240,
        collateralCr: 300,
        durationS: 1800,
        distance: 900,
        params: {
          setPieceObjective: 'investigation_recover_box',
        },
        clauseIds: ['no_kills'],
        ...setPieceCopyRefs('investigation_chain', 'recover_the_black_box'),
      },
    ],
    branches: [
      {
        id: 'file_public',
        label: 'File It Public',
        tradeoff: 'Hand the log to Concord and make the names legible.',
        stages: [
          {
            id: 'file_the_log',
            title: 'File the Log at Customs',
            type: 'cargo_delivery',
            boardStationId: 'station_reach',
            destStationId: 'station_customs',
            destSectorId: 'sector_tethys_junction',
            factionId: 'faction_scn',
            riskTier: 2,
            rewardCr: 1680,
            collateralCr: 440,
            durationS: 1500,
            distance: 2800,
            preloadedCargo: true,
            params: {
              cmdtyId: 'cmdty_classified_salvage',
              qty: 1,
              setPieceObjective: 'investigation_file_log',
            },
            clauseIds: ['cargo_intact'],
            ...setPieceCopyRefs('investigation_chain', 'file_the_log'),
          },
        ],
      },
      {
        id: 'sell_quiet',
        label: 'Sell It Quiet',
        tradeoff: 'Sell the log to Quiet and erase who found it first.',
        stages: [
          {
            id: 'sell_the_log',
            title: 'Sell the Log Off-Book',
            type: 'smuggling_run',
            boardStationId: 'station_reach',
            destStationId: 'station_nyx_march',
            destSectorId: 'sector_nyx_march',
            factionId: 'faction_quiet',
            riskTier: 3,
            rewardCr: 2140,
            collateralCr: 580,
            durationS: 1600,
            distance: 2200,
            preloadedCargo: true,
            params: {
              cmdtyId: 'cmdty_classified_salvage',
              qty: 1,
              setPieceObjective: 'investigation_sell_log',
            },
            clauseIds: ['no_scan'],
            ...setPieceCopyRefs('investigation_chain', 'sell_the_log'),
          },
        ],
      },
    ],
  },
];

const SET_PIECE_ARCHETYPE_IDS = [
  'long_read',
  'witness_run',
  'hearing',
  'blockade_run',
  'investigation_chain',
];
const SET_PIECE_CLAUSE_IDS = new Set(['no_kills', 'cargo_intact', 'no_scan']);
const SET_PIECE_COMMODITY_IDS = new Set(['cmdty_classified_salvage']);

export function validateSetPieceMissionCatalog(catalog = SET_PIECE_MISSIONS) {
  const errors = [];
  const definitions = Array.isArray(catalog) ? catalog : [];
  const missionTypes = new Set(MISSION_TYPES.map((entry) => entry.type));
  const archetypeIds = new Set();
  const copyRefs = new Set();
  let playableRoutes = 0;

  if (!Array.isArray(catalog)) errors.push('SET_PIECE_MISSIONS must be an array.');
  if (definitions.length !== SET_PIECE_ARCHETYPE_IDS.length) {
    errors.push(`Expected ${SET_PIECE_ARCHETYPE_IDS.length} SP1 archetypes; found ${definitions.length}.`);
  }

  for (const definition of definitions) {
    const root = definition && definition.id || '<missing-archetype>';
    if (!definition || typeof definition !== 'object') {
      errors.push('Every SP1 archetype must be an object.');
      continue;
    }
    if (!SET_PIECE_ARCHETYPE_IDS.includes(definition.id)) errors.push(`${root}: unexpected archetype id.`);
    if (archetypeIds.has(definition.id)) errors.push(`${root}: duplicate archetype id.`);
    archetypeIds.add(definition.id);
    if (typeof definition.title !== 'string' || definition.title.length < 8) errors.push(`${root}: authored title required.`);
    if (typeof definition.startStationId !== 'string' || !definition.startStationId.startsWith('station_')) {
      errors.push(`${root}: canonical startStationId required.`);
    }
    if (!Array.isArray(definition.commonStages) || definition.commonStages.length < 1) {
      errors.push(`${root}: at least one common stage required.`);
    }
    if (!Array.isArray(definition.branches) || definition.branches.length !== 2) {
      errors.push(`${root}: exactly two branches required.`);
    }
    const stageIds = new Set();
    const commonStages = Array.isArray(definition.commonStages) ? definition.commonStages : [];
    const branches = Array.isArray(definition.branches) ? definition.branches : [];
    const branchIds = new Set();
    for (const branch of branches) {
      playableRoutes += 1;
      const branchRoot = `${root}/${branch && branch.id || '<missing-branch>'}`;
      if (!branch || typeof branch !== 'object') {
        errors.push(`${root}: branch must be an object.`);
        continue;
      }
      if (!branch.id || branchIds.has(branch.id)) errors.push(`${branchRoot}: unique branch id required.`);
      branchIds.add(branch.id);
      if (typeof branch.label !== 'string' || branch.label.length < 4) errors.push(`${branchRoot}: visible label required.`);
      if (Object.hasOwn(branch, 'branches')) errors.push(`${branchRoot}: nested branches are forbidden.`);
      const branchStages = Array.isArray(branch.stages) ? branch.stages : [];
      const routeLength = commonStages.length + branchStages.length;
      if (routeLength < 3 || routeLength > 4) errors.push(`${branchRoot}: route must contain 3-4 stages.`);
      if (branchStages.length < 1) errors.push(`${branchRoot}: branch stages required.`);
      if (branchStages[0] && !(branchStages[0].collateralCr > 0)) {
        errors.push(`${branchRoot}: branch entry requires a recoverable collateral stake.`);
      }
      if (![...commonStages, ...branchStages].some((stage) => stage && stage.clauseIds && stage.clauseIds.length)) {
        errors.push(`${branchRoot}: route must exercise at least one contract clause.`);
      }
    }

    const allStages = [...commonStages, ...branches.flatMap((branch) => Array.isArray(branch.stages) ? branch.stages : [])];
    for (const stage of allStages) {
      const stageRoot = `${root}/${stage && stage.id || '<missing-stage>'}`;
      if (!stage || typeof stage !== 'object') {
        errors.push(`${root}: stage must be an object.`);
        continue;
      }
      if (!stage.id || stageIds.has(stage.id)) errors.push(`${stageRoot}: unique stage id required.`);
      stageIds.add(stage.id);
      if (typeof stage.title !== 'string' || stage.title.length < 6) errors.push(`${stageRoot}: authored title required.`);
      if (!missionTypes.has(stage.type)) errors.push(`${stageRoot}: unknown mission type ${stage.type}.`);
      if (typeof stage.boardStationId !== 'string' || !stage.boardStationId.startsWith('station_')) {
        errors.push(`${stageRoot}: canonical boardStationId required.`);
      }
      if (stage.destStationId != null && (typeof stage.destStationId !== 'string' || !stage.destStationId.startsWith('station_'))) {
        errors.push(`${stageRoot}: invalid destStationId.`);
      }
      if (typeof stage.destSectorId !== 'string' || !stage.destSectorId.startsWith('sector_')) {
        errors.push(`${stageRoot}: canonical destSectorId required.`);
      }
      if (typeof stage.factionId !== 'string' || !stage.factionId.startsWith('faction_')) {
        errors.push(`${stageRoot}: canonical factionId required.`);
      }
      if (!Number.isInteger(stage.riskTier) || stage.riskTier < 0 || stage.riskTier > 4) {
        errors.push(`${stageRoot}: riskTier must be 0-4.`);
      }
      if (Object.hasOwn(stage, 'minRep')) errors.push(`${stageRoot}: minRep overrides are forbidden.`);
      if (!(Number.isFinite(stage.rewardCr) && stage.rewardCr > 0)) errors.push(`${stageRoot}: positive rewardCr required.`);
      if (!(Number.isFinite(stage.collateralCr) && stage.collateralCr >= 0)) errors.push(`${stageRoot}: nonnegative collateralCr required.`);
      if (!stage.params || typeof stage.params !== 'object' || Array.isArray(stage.params)) errors.push(`${stageRoot}: params object required.`);
      if (stage.params && stage.params.cmdtyId && !SET_PIECE_COMMODITY_IDS.has(stage.params.cmdtyId)) {
        errors.push(`${stageRoot}: unapproved SP1 commodity ${stage.params.cmdtyId}.`);
      }
      if (!Array.isArray(stage.clauseIds) || stage.clauseIds.length > 1) {
        errors.push(`${stageRoot}: clauseIds must be an array with at most one clause.`);
      } else {
        for (const clauseId of stage.clauseIds) {
          if (!SET_PIECE_CLAUSE_IDS.has(clauseId)) errors.push(`${stageRoot}: unsupported clause ${clauseId}.`);
        }
      }
      for (const key of ['instructionRef', 'successRef', 'failureRef', 'recoveryRef']) {
        const ref = stage[key];
        if (typeof ref !== 'string' || !ref.startsWith(`mission.sp1.${root}.${stage.id}.`)) {
          errors.push(`${stageRoot}: canonical ${key} required.`);
        } else if (copyRefs.has(ref)) {
          errors.push(`${stageRoot}: duplicate copy ref ${ref}.`);
        } else {
          copyRefs.add(ref);
        }
      }
    }

    if (definition.id === 'witness_run') {
      if (!Array.isArray(definition.witnesses) || definition.witnesses.length !== 2) {
        errors.push(`${root}: exactly two seeded witness voices required.`);
      }
      for (const witness of definition.witnesses || []) {
        if (!witness.id || !witness.displayName || !Array.isArray(witness.travelLineRefs)
            || witness.travelLineRefs.length < 3) {
          errors.push(`${root}: each witness requires identity and transit lines.`);
          continue;
        }
        for (const ref of witness.travelLineRefs) {
          if (typeof ref !== 'string' || !ref.startsWith(`mission.sp1.witness_run.travel.${witness.id}.`)) {
            errors.push(`${root}/${witness.id}: invalid travel-line ref.`);
          }
        }
      }
    }
  }

  for (const id of SET_PIECE_ARCHETYPE_IDS) {
    if (!archetypeIds.has(id)) errors.push(`Missing SP1 archetype ${id}.`);
  }

  return {
    ok: errors.length === 0,
    errors,
    archetypes: definitions.length,
    playableRoutes,
  };
}

// Offer-mix weights by station type (order matches MISSION_TYPES array above).
// [cargo, trade, bounty, mining, salvage, escort, patrol, smuggling, passenger, recon]
// Bounty column raised on civilian hubs/refineries so Hunter boards refresh with real writs
// without waiting a full refreshSec idle beat (military already bounty-heavy).
export const OFFER_MIX = {
  mining:      [3, 2, 2, 4, 2, 1, 1, 0, 1, 1],
  refinery:    [3, 2, 2, 4, 2, 1, 1, 0, 1, 1],
  fab:         [3, 2, 2, 2, 2, 1, 1, 0, 1, 1],
  trade_hub:   [4, 4, 2, 1, 1, 2, 1, 1, 3, 1],
  military:    [1, 1, 4, 0, 1, 2, 4, 0, 1, 2],
  research:    [2, 1, 1, 1, 2, 1, 1, 0, 1, 4],
  blackmarket: [2, 1, 3, 2, 3, 1, 2, 2, 1, 2],
};

// 8-beat story spine FSM.
// cold_start.objective is longform spine copy for Mission Log / post-tutorial story tracker —
// on-demand context, not the first-flight B0 verb. During B0 the HUD mission tracker owns the
// single persistent actionable line (onboarding waypoint reason: "Contract 47-A: thrust to the beacon.").
export const STORY_BEATS = [
  { beat: 0, id: 'cold_start',     objective: 'Contract 47-A: sample the 12.4t mass discrepancy, dock Helios. Payment withheld. Status pending.',
    reward: { credits: 400, rep: { faction: 'home', amount: 5 }, unlock: 'mod_mining_laser_s' }, introduces: 'mining', next: 1 },
  { beat: 1, id: 'honest_work',    objective: 'Accept a low-risk haul or trade contract, confirm it is TRACKED in Mission Log, then carry the required cargo to the marked station for profit.',
    reward: { credits: 600, unlock: 'trade_tutorial' }, introduces: 'trade', next: 2 },
  { beat: 2, id: 'first_blood',    objective: 'Arm the Hitch, track a low-risk bounty, and destroy the marked hostile.',
    reward: { credits: 800, unlock: 'wpn_pulse_laser_s' }, introduces: 'combat', next: 3 },
  { beat: 3, id: 'bigger_boat',    objective: 'Follow the Elroy outcome to the marked shipyard; buy a tier-two hull.',
    reward: { credits: 1000, milestone: 'cargo+20u' }, introduces: 'shipyard', next: 4 },
  { beat: 4, id: 'pick_a_side',    objective: 'Complete the faction intro selected by the Elroy outcome.',
    reward: { credits: 1200, rep: { chosen: 15, opposing: -10 } }, introduces: 'factions', next: 5 },
  { beat: 5, id: 'proving_ground', objective: 'Complete your faction chain: MTS trade runs, SCN patrol clears, or Free Captain smuggling jobs.',
    reward: { credits: 2500, unlock: 'module_unlock' }, introduces: 'chaining+passive_preview', next: 6 },
  { beat: 6, id: 'empire_seed',    objective: 'Deploy a drone, then assign the program selected by the Elroy outcome.',
    reward: { credits: 3000, unlock: 'passive_income' }, introduces: 'passive_income', next: 7 },
  { beat: 7, id: 'deep_reach',     objective: 'Use the Empire Seed in a physical Ashfall operation, then review final dispositions.',
    reward: { credits: 5000, unlock: 'newgame_plus' }, introduces: 'endgame', next: null },
];
