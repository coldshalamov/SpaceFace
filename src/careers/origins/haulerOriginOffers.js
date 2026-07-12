// Builds board-shaped mission offers + market-truth snapshots for Hauler origin steps.
// Emits shapes compatible with missions.js accept path (mission:offered). Isolated candidate only.

import { hash32 } from '../../core/rng.js';
import { COMMODITIES } from '../../data/commodities.js';
import {
  HAULER_CAREER_ID,
  HAULER_ORIGIN_ID,
  HAULER_ORIGIN_OFFER_COPY,
  HAULER_STEPS,
  haulerCollateralMultiplier,
  haulerRewardMultiplier,
} from './haulerOriginData.js';

const COMMODITY_BY_ID = new Map(COMMODITIES.map((commodity) => [commodity.id, commodity]));

/**
 * Deterministic mission id for a step attempt.
 * Format mirrors missions style (readable + unique) without colliding board RNG.
 */
export function haulerMissionId(seed, stepId, attempt, offerNonce) {
  const h = hash32(seed >>> 0 || 1, HAULER_ORIGIN_ID, stepId, attempt | 0, offerNonce | 0);
  return `mo_hauler_${stepId}_${(h >>> 0).toString(16)}`;
}

/**
 * Read mid/buy/sell from a live economy market entry when present.
 * Falls back to transparent synthetic quotes so isolated tests stay authority-shaped.
 */
export function readMarketTruth(state, stationId, commodityId, options = {}) {
  const markets = state && state.economy && state.economy.markets;
  const entry = markets && markets[stationId] && markets[stationId][commodityId];
  if (entry && Number.isFinite(entry.lastMid)) {
    return {
      stationId,
      commodityId,
      mid: Math.round(entry.lastMid),
      buy: Math.round(Number.isFinite(entry.lastBuy) ? entry.lastBuy : entry.lastMid * 1.04),
      sell: Math.round(Number.isFinite(entry.lastSell) ? entry.lastSell : entry.lastMid * 0.96),
      stock: Number.isFinite(entry.stock) ? entry.stock : null,
      source: 'economy.markets',
    };
  }
  if (!options.allowSynthetic) return null;
  // Deterministic synthetic truth is supporting-test data only, never the player route.
  const base = syntheticBasePrice(commodityId);
  const roleBias = stationRoleBias(stationId, commodityId);
  const mid = Math.round(base * roleBias.midMult);
  const spread = 0.08;
  return {
    stationId,
    commodityId,
    mid,
    buy: Math.round(mid * (1 + spread / 2) * roleBias.buyMult),
    sell: Math.round(mid * (1 - spread / 2) * roleBias.sellMult),
    stock: null,
    source: 'synthetic_fallback',
  };
}

function syntheticBasePrice(commodityId) {
  const table = {
    cmdty_food: 40,
    cmdty_fuel_cells: 95,
    cmdty_ore_iron: 28,
  };
  return table[commodityId] || 50;
}

/** Producer stations sell cheaper; consumer stations buy dearer. */
function stationRoleBias(stationId, commodityId) {
  // Iron: mining produce cheap sell; refinery consume dear buy.
  if (commodityId === 'cmdty_ore_iron') {
    if (stationId === 'station_beltout') {
      return { midMult: 0.9, buyMult: 0.95, sellMult: 0.92 };
    }
    if (stationId === 'station_ceres') {
      return { midMult: 1.15, buyMult: 1.08, sellMult: 1.05 };
    }
  }
  if (commodityId === 'cmdty_fuel_cells' && stationId === 'station_ceres') {
    return { midMult: 1.1, buyMult: 1.05, sellMult: 1.02 };
  }
  return { midMult: 1, buyMult: 1, sellMult: 1 };
}

export function buildStepMarketSnapshot(state, step, options = {}) {
  const origin = readMarketTruth(state, step.originStationId, step.commodityId, options);
  const dest = readMarketTruth(state, step.destStationId, step.commodityId, options);
  if (!origin || !dest) return null;
  return {
    commodityId: step.commodityId,
    origin,
    dest,
    // Teaching field: real hold economics vs fantasy mid-to-mid.
    fantasyMidSpread: dest.mid - origin.mid,
    realTradeSpread: dest.sell - origin.buy, // player buys at origin buy, sells at dest sell
    lesson: step.teach,
  };
}

/**
 * Board-shaped offer payload for mission:offered.
 * missions.js board offers use these fields; integration can accept without reshaping.
 */
export function buildHaulerStepMissionOffer(state, step, attempt, offerNonce, options = {}) {
  const seed = (state && state.meta && state.meta.seed) || 1;
  const mult = haulerRewardMultiplier(attempt);
  const colMult = haulerCollateralMultiplier(attempt);
  const reward_cr = Math.max(1, Math.round(step.baseRewardCr * mult));
  const collateral_cr = Math.max(0, Math.round(step.collateralCr * colMult));
  const missionId = haulerMissionId(seed, step.id, attempt, offerNonce);
  const simTime = (state && state.simTime) || 0;
  const marketTruth = buildStepMarketSnapshot(state, step, options);
  const commodity = COMMODITY_BY_ID.get(step.commodityId);
  const cargoValue = Math.max(1, Math.round(((commodity && commodity.basePrice) || 1) * step.qty));
  const params = step.missionType === 'bulk_trade'
    ? {
      cmdtyId: step.commodityId,
      qty: step.qty,
      progress: 0,
      cargoValue,
      fValue: 1 + cargoValue / 8000,
      taskTime: step.qty * 1.5,
    }
    : {
      cmdtyId: step.commodityId,
      qty: step.qty,
      cargoValue,
      fValue: 1 + cargoValue / 8000,
      taskTime: 20,
      passengers: 0,
    };

  return {
    id: missionId,
    type: step.missionType,
    title: step.title,
    stationId: step.originStationId,
    factionId: 'faction_mts',
    riskTier: step.riskTier,
    reward_cr,
    collateral_cr,
    destStationId: step.destStationId,
    destSectorId: step.destSectorId,
    originStationId: step.originStationId,
    originSectorId: step.originSectorId,
    commodityId: step.commodityId,
    qty: step.qty,
    params,
    // The first-hour path is accepted in flight, so mission authority must put the sealed
    // manifest in the hold. The player is proving custody, not shopping for their own contract.
    preloadedCargo: step.missionType === 'cargo_delivery',
    objectiveTarget: step.qty,
    objectiveProgress: 0,
    // Origin-tagged so the chain can filter mission:completed without hijacking the board.
    storyTag: `${HAULER_ORIGIN_ID}:${step.id}`,
    originCareer: HAULER_CAREER_ID,
    originStepId: step.id,
    markerId: `origin:${HAULER_CAREER_ID}:${step.id}`,
    markerKind: 'mission-objective',
    mapLabel: step.acceptLine,
    time_limit_s: step.deadlineSlackS,
    deadlineS: simTime + step.deadlineSlackS,
    expiresAtEpoch: 1,
    marketTruth,
    description: step.acceptLine,
    teach: step.teach,
  };
}

export function buildFirstDockOriginOffer(state, stationId, offerNonce) {
  const seed = (state && state.meta && state.meta.seed) || 1;
  const first = HAULER_STEPS[0];
  const stepOffer = buildHaulerStepMissionOffer(state, first, 0, offerNonce);
  return {
    originId: HAULER_ORIGIN_ID,
    careerId: HAULER_CAREER_ID,
    nonBinding: true,
    stationId: stationId || first.originStationId,
    offerNonce,
    copy: { ...HAULER_ORIGIN_OFFER_COPY },
    firstStepId: first.id,
    previewMission: stepOffer,
    exclusivity: {
      exclusive: false,
      blocksOtherOrigins: false,
      peers: ['hunter', 'prospector'],
    },
    seedHash: hash32(seed, HAULER_ORIGIN_ID, 'firstDock', offerNonce) >>> 0,
  };
}

export function stepDefAt(index) {
  return HAULER_STEPS[index] || null;
}

export function stepDefById(stepId) {
  return HAULER_STEPS.find((s) => s.id === stepId) || null;
}
