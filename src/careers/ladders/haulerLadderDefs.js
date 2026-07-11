// CL-01 Hauler professional ladder — data definitions only (candidate).
// Embodied five-step freight arc: brokerage → convoy/risk → lane tax →
// spread counterplay → lane infrastructure. Save-safe, non-binding.
//
// Framework contract:
//  - rewards / choice consequences use ONLY canonical owner intents
//    (economy:grantCredits | economy:chargeCredits | faction:repDelta).
//  - No heat:delta, bare cargo/heat/beatIndex, or direct owner writes.
//  - World pressure (mission:forceEvent) is emitted by haulerLadderFsm, not rewards.
//  - Never advances story.beatIndex; never exclusive-locks peer careers.
//
// Live event seams (verified):
//  mission:completed/failed/expired, economy:tradeCompleted, dock:docked,
//  entity:killed, heat:changed (+ isPlayerWanted), cargo:fragileLost,
//  mining:bulkHaulDelivered, mission:forceEvent → economy.injectEvent.

import { hash32 } from '../../core/rng.js';
import {
  LADDER_REWARD_EVENTS,
  validateLadderDefinition,
} from './ladderShared.js';

export const HAULER_LADDER_CAREER_ID = 'hauler';
export const HAULER_LADDER_TITLE = 'Hauler Professional';
/** Story-tag prefix for authored ladder missions (distinct from origin.hauler.v1). */
export const HAULER_LADDER_STORY_PREFIX = 'ladder.hauler';

export const HAULER_LADDER_STEP_IDS = Object.freeze([
  'broker_desk',
  'bonded_convoy',
  'risk_lane_tax',
  'spread_counterplay',
  'lane_infrastructure',
]);

/** Soft alternate unlock skillProof key (framework __meta.skillProof). */
export const HAULER_SKILL_PROOF_KEY = 'cargo_delivery_complete';

export const HAULER_LANE_TOLL_CR = 80;
export const HAULER_LANE_TOLL_REASON = 'ladder:hauler:lane_toll';

/**
 * Per-step deterministic gameplay parameters (not framework-validated rewards).
 * FSM seeds step.payload from these; tests pin expected values.
 */
export const HAULER_STEP_PARAMS = Object.freeze({
  broker_desk: Object.freeze({
    id: 'broker_desk',
    index: 0,
    title: 'Broker Desk',
    theme: 'brokerage',
    missionType: 'cargo_delivery',
    commodityId: 'cmdty_food',
    qty: 10,
    originStationId: 'station_helios',
    originSectorId: 'sector_helios_prime',
    destStationId: 'station_coalition',
    destSectorId: 'sector_helios_prime',
    riskTier: 0,
    baseRewardCr: 280,
    collateralCr: 0,
    deadlineSlackS: 300,
    factionId: 'faction_mts',
    recoveryCooldownS: 20,
    recoveryHint: 'Retry the desk. Same route, thinner pay.',
    acceptLine: 'Desk wants real tickets. Buy cheap, sell true.',
    successLine: 'Broker stamp filed. Numbers held.',
    failLine: 'Desk voided. Rebook when hold is free.',
    recoveryLine: 'Same legs. Count the dock tickets.',
    teach: 'Posted mid is not the hold price.',
    failCodes: Object.freeze(['deadline', 'cargo_lost', 'abandoned', 'wrong_commodity']),
    listen: Object.freeze([
      'mission:completed',
      'mission:failed',
      'mission:expired',
      'economy:tradeCompleted',
      'dock:docked',
    ]),
  }),
  bonded_convoy: Object.freeze({
    id: 'bonded_convoy',
    index: 1,
    title: 'Bonded Convoy',
    theme: 'convoy_risk',
    missionType: 'escort',
    commodityId: null,
    qty: 0,
    originStationId: 'station_helios',
    originSectorId: 'sector_helios_prime',
    destStationId: 'station_ceres',
    destSectorId: 'sector_ceres_belt',
    riskTier: 1,
    baseRewardCr: 360,
    collateralCr: 100,
    deadlineSlackS: 420,
    factionId: 'faction_mts',
    recoveryCooldownS: 30,
    recoveryHint: 'Re-run the lane. Cover the freighters.',
    acceptLine: 'Bond on the haulers. Stay inside the cone.',
    successLine: 'Convoy docked. Bond released.',
    failLine: 'Escort voided. The yard keeps the bond.',
    recoveryLine: 'Re-run the lane. Cover the freighters.',
    teach: 'Convoy survival, not kill quota.',
    failCodes: Object.freeze([
      'escort_abandoned',
      'escortee_destroyed',
      'deadline',
      'heat_spiked',
    ]),
    listen: Object.freeze([
      'mission:completed',
      'mission:failed',
      'mission:expired',
      'entity:killed',
      'heat:changed',
      'dock:docked',
    ]),
    heatGate: true,
  }),
  risk_lane_tax: Object.freeze({
    id: 'risk_lane_tax',
    index: 2,
    title: 'Risk Lane Tax',
    theme: 'convoy_risk_cargo_consequence',
    missionType: 'cargo_delivery',
    commodityId: 'cmdty_fuel_cells',
    qty: 8,
    originStationId: 'station_helios',
    originSectorId: 'sector_helios_prime',
    destStationId: 'station_ceres',
    destSectorId: 'sector_ceres_belt',
    riskTier: 2,
    baseRewardCr: 420,
    collateralCr: 120,
    deadlineSlackS: 240,
    factionId: 'faction_mts',
    recoveryCooldownS: 35,
    recoveryHint: 'Fly gentler. Rebook the spur.',
    acceptLine: 'Lane tax rising. Bond rides with the hold.',
    successLine: 'Cargo clean. Tax paid or slipped.',
    failLine: 'Hold cracked or heat burned the bond.',
    recoveryLine: 'Fly gentler. Rebook the spur.',
    teach: 'Fragile cargo punishes hard impacts.',
    failCodes: Object.freeze([
      'cargo_cracked',
      'heat_spiked',
      'deadline',
      'collateral_burned',
    ]),
    listen: Object.freeze([
      'mission:completed',
      'mission:failed',
      'mission:expired',
      'heat:changed',
      'cargo:fragileLost',
    ]),
    heatGate: true,
    fragile: true,
    injectEvent: Object.freeze({
      typePool: Object.freeze(['piracy', 'blockade']),
      durationS: 180,
    }),
    laneTollCr: HAULER_LANE_TOLL_CR,
  }),
  spread_counterplay: Object.freeze({
    id: 'spread_counterplay',
    index: 3,
    title: 'Spread Counterplay',
    theme: 'market_manipulation_counterplay',
    missionType: 'bulk_trade',
    commodityId: 'cmdty_ore_iron',
    qty: 12,
    originStationId: 'station_beltout',
    originSectorId: 'sector_ceres_belt',
    destStationId: 'station_ceres',
    destSectorId: 'sector_ceres_belt',
    riskTier: 1,
    baseRewardCr: 200,
    collateralCr: 0,
    deadlineSlackS: 480,
    factionId: 'faction_mts',
    recoveryCooldownS: 40,
    recoveryHint: 'Watch the event clock. Rebuy the legs.',
    acceptLine: 'Someone flooded the board. Trade the truth.',
    successLine: 'Spread proved under pressure.',
    failLine: 'Spread not closed. Stock moved without you.',
    recoveryLine: 'Watch the event clock. Rebuy the legs.',
    teach: 'Profit is the spread you actually trade.',
    failCodes: Object.freeze([
      'spread_not_closed',
      'stock_exhausted',
      'wrong_side',
      'deadline',
    ]),
    listen: Object.freeze([
      'economy:tradeCompleted',
      'mission:completed',
      'dock:docked',
    ]),
    minSpreadPct: 0.08,
    injectEvent: Object.freeze({
      typePool: Object.freeze(['shortage', 'boom', 'blockade']),
      durationS: 300,
    }),
  }),
  lane_infrastructure: Object.freeze({
    id: 'lane_infrastructure',
    index: 4,
    title: 'Lane Infrastructure',
    theme: 'infrastructure_cargo_consequence',
    missionType: 'cargo_delivery',
    missionTypePreferred: 'bulk_haul',
    commodityId: 'cmdty_ore_iron',
    qty: 20,
    originStationId: 'station_beltout',
    originSectorId: 'sector_ceres_belt',
    destStationId: 'station_ceres',
    destSectorId: 'sector_ceres_belt',
    riskTier: 1,
    baseRewardCr: 500,
    collateralCr: 0,
    deadlineSlackS: 600,
    factionId: 'faction_mts',
    recoveryCooldownS: 45,
    recoveryHint: 'Reload the bulk. Same dest, thinner cut.',
    acceptLine: 'Refinery needs bulk. Move the lane spine.',
    successLine: 'Infrastructure run closed. Professional stamped.',
    failLine: 'Bulk never arrived. Lane stays hungry.',
    recoveryLine: 'Reload the bulk. Same dest, thinner cut.',
    teach: 'Infrastructure runs change the lane, not just the wallet.',
    failCodes: Object.freeze(['deadline', 'cargo_lost', 'abandoned']),
    listen: Object.freeze([
      'mission:completed',
      'mission:failed',
      'mission:expired',
      'mining:bulkHaulDelivered',
    ]),
    boomOnComplete: Object.freeze({
      type: 'boom',
      durationS: 240,
      stationId: 'station_ceres',
      commodityId: 'cmdty_ore_iron',
    }),
  }),
});

const unlockPrereq = Object.freeze({
  type: 'or',
  any: Object.freeze([
    Object.freeze({ type: 'originCompleted', careerId: HAULER_LADDER_CAREER_ID }),
    Object.freeze({ type: 'skillProof', key: HAULER_SKILL_PROOF_KEY, min: 1 }),
  ]),
});

/**
 * Framework-valid ladder definition for registerLadderDefinition().
 * Extra metadata (params, dialogue, soft unlocks) lives on steps outside reward keys.
 */
export function buildHaulerLadderDefinition() {
  return {
    careerId: HAULER_LADDER_CAREER_ID,
    title: HAULER_LADDER_TITLE,
    nonBinding: true,
    themeArc: 'brokerage → convoy/risk → market manipulation counterplay → infrastructure/cargo consequence',
    unlockPrerequisites: [unlockPrereq],
    steps: [
      {
        id: 'broker_desk',
        index: 0,
        title: 'Broker Desk',
        prerequisites: [unlockPrereq],
        rewards: {
          credits: 280,
          rep: [{ factionId: 'faction_mts', delta: 3 }],
        },
        recovery: {
          cooldownS: 20,
          hint: HAULER_STEP_PARAMS.broker_desk.recoveryHint,
        },
        dialogue: pickDialogue(HAULER_STEP_PARAMS.broker_desk),
        params: HAULER_STEP_PARAMS.broker_desk,
        soft: { boardBias: { cargo_delivery: 0.05 } },
      },
      {
        id: 'bonded_convoy',
        index: 1,
        title: 'Bonded Convoy',
        prerequisites: [{
          type: 'ladderStepDone',
          careerId: HAULER_LADDER_CAREER_ID,
          stepId: 'broker_desk',
        }],
        rewards: {
          credits: 360,
          rep: [{ factionId: 'faction_mts', delta: 5 }],
        },
        recovery: {
          cooldownS: 30,
          hint: HAULER_STEP_PARAMS.bonded_convoy.recoveryHint,
        },
        dialogue: pickDialogue(HAULER_STEP_PARAMS.bonded_convoy),
        params: HAULER_STEP_PARAMS.bonded_convoy,
      },
      {
        id: 'risk_lane_tax',
        index: 2,
        title: 'Risk Lane Tax',
        prerequisites: [{
          type: 'ladderStepDone',
          careerId: HAULER_LADDER_CAREER_ID,
          stepId: 'bonded_convoy',
        }],
        rewards: {
          credits: 420,
          rep: [{ factionId: 'faction_mts', delta: 4 }],
        },
        recovery: {
          cooldownS: 35,
          hint: HAULER_STEP_PARAMS.risk_lane_tax.recoveryHint,
        },
        choices: [
          {
            id: 'pay_toll',
            label: 'Pay the lane toll',
            consequences: [{
              event: LADDER_REWARD_EVENTS.CHARGE_CREDITS,
              payload: {
                amount: HAULER_LANE_TOLL_CR,
                reason: HAULER_LANE_TOLL_REASON,
              },
            }],
          },
          {
            id: 'run_guns',
            label: 'Run the guns',
            consequences: [],
          },
          {
            id: 'veer_slip',
            label: 'Veer the slip',
            consequences: [],
          },
        ],
        dialogue: pickDialogue(HAULER_STEP_PARAMS.risk_lane_tax),
        params: HAULER_STEP_PARAMS.risk_lane_tax,
        soft: { unlockHints: ['mod_smuggler_hold'] },
      },
      {
        id: 'spread_counterplay',
        index: 3,
        title: 'Spread Counterplay',
        prerequisites: [{
          type: 'ladderStepDone',
          careerId: HAULER_LADDER_CAREER_ID,
          stepId: 'risk_lane_tax',
        }],
        rewards: {
          credits: 200,
          rep: [{ factionId: 'faction_mts', delta: 4 }],
        },
        recovery: {
          cooldownS: 40,
          hint: HAULER_STEP_PARAMS.spread_counterplay.recoveryHint,
        },
        dialogue: pickDialogue(HAULER_STEP_PARAMS.spread_counterplay),
        params: HAULER_STEP_PARAMS.spread_counterplay,
      },
      {
        id: 'lane_infrastructure',
        index: 4,
        title: 'Lane Infrastructure',
        prerequisites: [{
          type: 'ladderStepDone',
          careerId: HAULER_LADDER_CAREER_ID,
          stepId: 'spread_counterplay',
        }],
        rewards: {
          credits: 500,
          rep: [{ factionId: 'faction_mts', delta: 8 }],
        },
        recovery: {
          cooldownS: 45,
          hint: HAULER_STEP_PARAMS.lane_infrastructure.recoveryHint,
        },
        dialogue: pickDialogue(HAULER_STEP_PARAMS.lane_infrastructure),
        params: HAULER_STEP_PARAMS.lane_infrastructure,
        soft: {
          unlockHints: ['mod_cargo_hold_s'],
          boardBias: { cargo_delivery: 0.12, bulk_trade: 0.12 },
        },
      },
    ],
    completionBonus: {
      credits: 1200,
      rep: [{ factionId: 'faction_mts', delta: 8 }],
    },
  };
}

function pickDialogue(params) {
  return {
    acceptLine: params.acceptLine,
    successLine: params.successLine,
    failLine: params.failLine,
    recoveryLine: params.recoveryLine,
  };
}

/** Frozen shared definition instance for register + tests. */
export const HAULER_LADDER_DEF = Object.freeze(buildHaulerLadderDefinition());

export function validateHaulerLadderDefinition(def = HAULER_LADDER_DEF) {
  return validateLadderDefinition(def);
}

/** Deterministic mission id for a ladder step attempt. */
export function haulerLadderMissionId(masterSeed, stepId, attempt, offerNonce) {
  const h = hash32(
    (masterSeed >>> 0) || 1,
    'careerLadder',
    HAULER_LADDER_CAREER_ID,
    String(stepId || ''),
    attempt | 0,
    offerNonce | 0,
  );
  return `mo_ladder_hauler_${stepId}_${(h >>> 0).toString(16)}`;
}

/** Story tag written onto authored mission offers. */
export function haulerLadderStoryTag(stepId) {
  return `${HAULER_LADDER_STORY_PREFIX}:${stepId}`;
}

/**
 * Per-step seed: hash32(masterSeed,'careerLadder','hauler',stepId,nonce)>>>0
 * Matches draft seed_expr without wall clock or Math.random.
 */
export function haulerLadderStepSeed(masterSeed, stepId, nonce = 0) {
  return hash32(
    (masterSeed >>> 0) || 1,
    'careerLadder',
    HAULER_LADDER_CAREER_ID,
    String(stepId || ''),
    nonce | 0,
  ) >>> 0;
}

/**
 * Board-shaped mission offer for missions.postAndAcceptAuthoredOffer.
 * Missions remain sole mission authority; ladder only authors the offer shape.
 */
export function buildHaulerLadderMissionOffer(state, stepId, attempt, offerNonce, options = {}) {
  const params = HAULER_STEP_PARAMS[stepId];
  if (!params) return null;
  const masterSeed = ((state && state.meta && state.meta.seed) || (state && state.seed) || 1) >>> 0 || 1;
  const missionId = options.missionId
    || haulerLadderMissionId(masterSeed, stepId, attempt, offerNonce);
  const simTime = Number.isFinite(state && state.simTime) ? state.simTime : 0;
  const mult = Number.isFinite(options.attemptMult) ? options.attemptMult : 1;
  const reward_cr = Math.max(1, Math.round(params.baseRewardCr * mult));
  const collateral_cr = Math.max(0, Math.round(params.collateralCr * mult));
  const missionType = options.missionType || params.missionType;
  const storyTag = haulerLadderStoryTag(stepId);

  let missionParams;
  if (missionType === 'escort') {
    missionParams = {
      destStationId: params.destStationId,
      destSectorId: params.destSectorId,
      taskTime: 30,
      fValue: 1.2,
    };
  } else if (missionType === 'bulk_trade') {
    missionParams = {
      cmdtyId: params.commodityId,
      qty: params.qty,
      progress: 0,
      cargoValue: Math.max(1, params.qty * 28),
      fValue: 1 + (params.qty * 28) / 8000,
      taskTime: params.qty * 1.5,
    };
  } else {
    missionParams = {
      cmdtyId: params.commodityId,
      qty: params.qty,
      cargoValue: Math.max(1, params.qty * 40),
      fValue: 1 + (params.qty * 40) / 8000,
      taskTime: 20,
      passengers: 0,
    };
  }

  return {
    id: missionId,
    type: missionType,
    title: params.title,
    stationId: params.originStationId,
    factionId: params.factionId,
    riskTier: params.riskTier,
    reward_cr,
    collateral_cr,
    destStationId: params.destStationId,
    destSectorId: params.destSectorId,
    originStationId: params.originStationId,
    originSectorId: params.originSectorId,
    commodityId: params.commodityId,
    qty: params.qty,
    params: missionParams,
    objectiveTarget: params.qty || 1,
    objectiveProgress: 0,
    storyTag,
    ladderCareer: HAULER_LADDER_CAREER_ID,
    ladderStepId: stepId,
    time_limit_s: params.deadlineSlackS,
    deadlineS: simTime + params.deadlineSlackS,
    expiresAtEpoch: 1,
    description: params.acceptLine,
    teach: params.teach,
  };
}

/**
 * Deterministic injectEvent selection for world pressure (economy owns apply).
 * typePool drawn via hash of step seed — never Math.random.
 */
export function pickHaulerInjectEvent(stepId, stepSeed) {
  const params = HAULER_STEP_PARAMS[stepId];
  if (!params || !params.injectEvent) return null;
  const pool = params.injectEvent.typePool;
  if (!pool || !pool.length) return null;
  const idx = (stepSeed >>> 0) % pool.length;
  return {
    type: pool[idx],
    stationId: params.destStationId || params.originStationId,
    commodityId: params.commodityId || '*',
    duration: params.injectEvent.durationS,
  };
}

export function getHaulerStepParams(stepId) {
  return HAULER_STEP_PARAMS[stepId] || null;
}

/** Test-vector catalog (ids match branch draft). */
export const HAULER_LADDER_TEST_VECTORS = Object.freeze([
  Object.freeze({ id: 'H0-success', stepId: 'broker_desk', expect: 'step done; grantCredits once' }),
  Object.freeze({ id: 'H0-fail-deadline', stepId: 'broker_desk', expect: 'recovering; attemptMult 0.85' }),
  Object.freeze({ id: 'H0-idempotent-reward', stepId: 'broker_desk', expect: 'no second credits grant' }),
  Object.freeze({ id: 'H1-success', stepId: 'bonded_convoy', expect: 'step done' }),
  Object.freeze({ id: 'H1-escortee-lost', stepId: 'bonded_convoy', expect: 'fail escortee_destroyed' }),
  Object.freeze({ id: 'H1-civilian-heat', stepId: 'bonded_convoy', expect: 'fail heat_spiked' }),
  Object.freeze({ id: 'H2-success-toll', stepId: 'risk_lane_tax', expect: 'chargeCredits 80 + step done' }),
  Object.freeze({ id: 'H2-fragile-fail', stepId: 'risk_lane_tax', expect: 'fail cargo_cracked' }),
  Object.freeze({ id: 'H2-blockade-inject', stepId: 'risk_lane_tax', expect: 'mission:forceEvent once' }),
  Object.freeze({ id: 'H3-spread-ok', stepId: 'spread_counterplay', expect: 'step done' }),
  Object.freeze({ id: 'H3-spread-fail', stepId: 'spread_counterplay', expect: 'spread_not_closed' }),
  Object.freeze({ id: 'H3-receipt-gate', stepId: 'spread_counterplay', expect: 'stamp grantCredits once' }),
  Object.freeze({ id: 'H4-complete', stepId: 'lane_infrastructure', expect: 'completed; boom forceEvent' }),
  Object.freeze({ id: 'H4-save-roundtrip', stepId: 'lane_infrastructure', expect: 'status preserved' }),
  Object.freeze({ id: 'H4-no-story-touch', stepId: 'lane_infrastructure', expect: 'beatIndex unchanged' }),
]);
