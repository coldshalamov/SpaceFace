// Authored M3 career contracts. These are ordinary missions-system offers: missions owns the
// active id, objective marker, target spawning, settlement, cargo/credit receipts, and save data.
// CareerOrigins only records which authored link comes next.

import { hash32 } from '../../core/rng.js';

export const ORIGIN_ROUTE_STATUS = Object.freeze({
  IDLE: 'idle',
  ACTIVE: 'active',
  RECOVERING: 'recovering',
  COMPLETED: 'completed',
  ABANDONED: 'abandoned',
});

export const ORIGIN_ROLE_KITS = Object.freeze({
  hauler: Object.freeze({
    defId: 'mod_market_data_s',
    label: 'Market Data Uplink S',
    tradeoff: 'Occupies the Hitch utility slot; favors route intelligence over armor or winch force.',
  }),
  hunter: Object.freeze({
    defId: 'mod_ram_plate',
    label: 'Ram Plate',
    tradeoff: 'Occupies the Hitch utility slot; favors close pursuit over freight or extraction tools.',
  }),
  prospector: Object.freeze({
    defId: 'mod_winch_hd',
    label: 'Heavy-Duty Winch',
    tradeoff: 'Occupies the Hitch utility slot; favors mass handling over market or combat tools.',
  }),
});

// The three first-dock paths must read differently through physical game authorities, not just
// through copy.  This compact contract is also persisted into the acceptance receipt so save/load,
// telemetry, and later UI work can report what the player actually signed up to do.
export const ORIGIN_PHYSICAL_IDENTITIES = Object.freeze({
  hauler: Object.freeze({
    lane: 'freight',
    verb: 'carry',
    cargo: Object.freeze({ mode: 'manifest', commodityId: 'cmdty_food', qty: 8 }),
    loadout: ORIGIN_ROLE_KITS.hauler,
  }),
  hunter: Object.freeze({
    lane: 'warrant',
    verb: 'intercept',
    cargo: null,
    loadout: ORIGIN_ROLE_KITS.hunter,
  }),
  prospector: Object.freeze({
    lane: 'extraction',
    verb: 'survey',
    cargo: Object.freeze({ mode: 'mine_then_sell', commodityId: 'cmdty_ore_iron', qty: 6 }),
    loadout: ORIGIN_ROLE_KITS.prospector,
  }),
});

const HUNTER_CONTRACTS = Object.freeze([
  Object.freeze({
    id: 'yard_writ', title: 'Yard Perimeter Writ', type: 'bounty_hunt',
    stationId: 'station_helios', destSectorId: 'sector_helios_prime', factionId: 'faction_scn',
    riskTier: 0, rewardCr: 180,
    description: 'Identify the marked raider. Keep lawful hulls clean.',
    objective: 'Intercept the marked hostile',
    storyTarget: Object.freeze({
      id: 'origin_hunter_yard_mark', name: 'Rook Nine', label: 'ROOK NINE — WARRANT',
      role: 'probationary_writ', archetype: 'wasp_swarmer', factionId: 'faction_reach',
      zoneId: 'zone_helios_memorial',
    }),
  }),
  Object.freeze({
    id: 'belt_pursuit', title: 'Belt Pursuit Writ', type: 'bounty_hunt',
    stationId: 'station_helios', destSectorId: 'sector_ceres_belt', factionId: 'faction_scn',
    riskTier: 1, rewardCr: 300,
    description: 'Hold contact through the quarry doctrine. Finish clean.',
    objective: 'Pursue the marked hostile into Ceres',
    storyTarget: Object.freeze({
      id: 'origin_hunter_belt_mark', name: 'Red Ledger', label: 'RED LEDGER — WARRANT',
      role: 'pursuit_writ', archetype: 'reaver_pirate', factionId: 'faction_reach',
      zoneId: 'zone_ceres_ambush',
    }),
  }),
  Object.freeze({
    id: 'junction_counter', title: 'Junction Counter-Writ', type: 'bounty_hunt',
    stationId: 'station_ceres', destSectorId: 'sector_tethys_junction', factionId: 'faction_scn',
    riskTier: 1, rewardCr: 420,
    description: 'Read the telegraph. Close the warrant without WANTED heat.',
    objective: 'Close the marked warrant at Tethys',
    storyTarget: Object.freeze({
      id: 'origin_hunter_junction_mark', name: 'Needle Wake', label: 'NEEDLE WAKE — WARRANT',
      role: 'counterplay_writ', archetype: 'corsair_raider', factionId: 'faction_reach',
      zoneId: 'zone_tethys_blackmkt',
    }),
  }),
]);

const PROSPECTOR_CONTRACTS = Object.freeze([
  Object.freeze({
    id: 'ceres_survey', title: 'Ceres Survey Sample', type: 'recon_scan',
    stationId: 'station_helios', destSectorId: 'sector_ceres_belt', factionId: 'faction_dmc',
    riskTier: 0, rewardCr: 220,
    description: 'Pulse one Ceres field, then cut a three-unit iron sample from the scanned seam.',
    objective: 'Survey a Ceres field and mine a 3u iron sample',
    params: Object.freeze({
      scanTargets: 1,
      originSurveySample: true,
      sampleCmdtyId: 'cmdty_ore_iron',
      sampleQty: 3,
      surveyComplete: false,
    }),
  }),
  Object.freeze({
    id: 'iron_sample', title: 'Iron Seam Sample', type: 'mining_quota',
    stationId: 'station_helios', destSectorId: 'sector_ceres_belt', factionId: 'faction_dmc',
    riskTier: 0, rewardCr: 220, description: 'Cut six units of iron from scanned seams.',
    objective: 'Mine 6u iron in Ceres', params: Object.freeze({ cmdtyId: 'cmdty_ore_iron', qty: 6 }),
  }),
  Object.freeze({
    id: 'refinery_assay', title: 'Refinery Assay', type: 'bulk_trade',
    stationId: 'station_ceres', destStationId: 'station_ceres',
    destSectorId: 'sector_ceres_belt', factionId: 'faction_dmc',
    riskTier: 0, rewardCr: 260, description: 'Dock at Ceres Refinery. Sell six units of sampled iron.',
    objective: 'Sell 6u iron at Ceres Refinery', params: Object.freeze({ cmdtyId: 'cmdty_ore_iron', qty: 6 }),
  }),
]);

export const CAREER_ORIGIN_CONTRACTS = Object.freeze({
  hunter: HUNTER_CONTRACTS,
  prospector: PROSPECTOR_CONTRACTS,
});

export function createOriginRouteState(careerId) {
  return {
    careerId,
    status: ORIGIN_ROUTE_STATUS.IDLE,
    contractIndex: 0,
    activeMissionId: null,
    activeOfferId: null,
    attempt: 0,
    completedContractIds: [],
    startedAtS: null,
    completedAtS: null,
    lastFailure: null,
    upgradeGranted: false,
  };
}

export function normalizeOriginRouteState(careerId, raw) {
  const base = createOriginRouteState(careerId);
  if (!raw || typeof raw !== 'object') return base;
  const defs = CAREER_ORIGIN_CONTRACTS[careerId] || [];
  const status = Object.values(ORIGIN_ROUTE_STATUS).includes(raw.status) ? raw.status : base.status;
  return {
    ...base,
    ...raw,
    careerId,
    status,
    contractIndex: Math.max(0, Math.min(defs.length, Number.isInteger(raw.contractIndex) ? raw.contractIndex : 0)),
    activeMissionId: raw.activeMissionId == null ? null : String(raw.activeMissionId),
    activeOfferId: raw.activeOfferId == null ? null : String(raw.activeOfferId),
    attempt: Math.max(0, Number.isInteger(raw.attempt) ? raw.attempt : 0),
    completedContractIds: Array.isArray(raw.completedContractIds)
      ? raw.completedContractIds.map(String).filter((id) => defs.some((def) => def.id === id))
      : [],
    upgradeGranted: !!raw.upgradeGranted,
  };
}

export function buildOriginContractOffer(state, careerId, contractIndex, attempt = 0) {
  const def = CAREER_ORIGIN_CONTRACTS[careerId] && CAREER_ORIGIN_CONTRACTS[careerId][contractIndex];
  if (!def) return null;
  const seed = ((state && state.meta && state.meta.seed) || state && state.seed || 1) >>> 0 || 1;
  const suffix = hash32(seed, 'career_origin', careerId, def.id, attempt | 0).toString(16);
  const params = {
    ...(def.params || {}),
    taskTime: def.type === 'bounty_hunt' ? 45 : 20,
    fValue: 1,
  };
  return {
    id: `mo_${careerId}_${def.id}_${suffix}`,
    type: def.type,
    title: def.title,
    description: def.description,
    stationId: def.stationId,
    factionId: def.factionId,
    riskTier: def.riskTier,
    reward_cr: Math.max(1, Math.round(def.rewardCr * Math.max(0.7, 1 - attempt * 0.15))),
    collateral_cr: 0,
    destStationId: def.destStationId || null,
    destSectorId: def.destSectorId,
    params,
    storyTag: `origin.${careerId}.v1:${def.id}`,
    originCareer: careerId,
    originContractId: def.id,
    originContractIndex: contractIndex,
    markerId: `origin:${careerId}:${def.id}`,
    markerKind: 'mission-objective',
    mapLabel: def.objective,
    storyTarget: def.storyTarget ? { ...def.storyTarget } : null,
  };
}
