// SFQ-B167 — the heat notebook is the observation. One sample becomes a lure.
// Filament is the sample. Resin stands in if the filament is gone. No pile, no clock.

import { HEAT_TRIAL_NOTE } from './heatProximityTrial.js';

export const LURE_SITE_ID = 'harvest_deep';
export const LURE_FILAMENT = 'cmdty_filament_sample';
export const LURE_RESIN = 'cmdty_cyst_resin';

export const LURE_NEED = 'The notebook is filed. One filament sample or one resin lot makes the lure.';
export const LURE_MADE = 'The filament sample is now the lure. It is fitted. Leave and come back to try it.';
export const LURE_MADE_RESIN = 'The resin stands in for the lost filament. The lure is fitted. Leave and come back to try it.';
export const LURE_SHOWN = 'The maw answers the lure. A cold pass would hold. The heat brings the charge.';

export function heatLureRecipe(note, filamentQty, resinQty) {
  if (note !== HEAT_TRIAL_NOTE) return { ready: false, material: null, text: null };
  const filament = Number(filamentQty) > 0;
  const resin = Number(resinQty) > 0;
  if (filament) return { ready: true, material: LURE_FILAMENT, text: LURE_MADE };
  if (resin) return { ready: true, material: LURE_RESIN, text: LURE_MADE_RESIN };
  return { ready: false, material: null, text: LURE_NEED };
}

export function copyHeatDerivative(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const lure = raw.lure === LURE_FILAMENT || raw.lure === LURE_RESIN ? raw.lure : null;
  const next = {};
  if (lure) next.lure = lure;
  if (raw.shown === true) next.shown = true;
  if (raw.trialStarted === true) next.trialStarted = true;
  if (raw.edge === true) next.edge = true;
  if (raw.asked === true) next.asked = true;
  return Object.keys(next).length ? next : null;
}

// M12 — Quiet passage: a heat-sensitive passenger transport.
// The passenger ship's comfort/alarm answers the hull's heat signature near it.
// The same physical reading from the heat notebook: a cold pass holds shadow (stays calm);
// a hot pass brings the charge (spooks the transport, degrading the contract).
// Heat itself stays owned by heat.js (state.player.heat).

export const QUIET_PASSAGE = Object.freeze({
  id: 'm12_quiet_passage',
  type: 'passenger_transport',
  source: 'quietPassage',
  stationId: 'station_tethys',
  destStationId: 'station_customs',
  sectorId: 'sector_tethys_junction',
  checkpointZoneId: 'zone_tethys_checkpoint',
  checkpointPos: Object.freeze({ x: -640, z: -1180 }),
  checkpointRadius: 320,
  transportStartPos: Object.freeze({ x: -300, z: -700 }),
  transportSpeed: 30,
  proximityRange: 400,
  quietSpeedLimit: 45,
  quietHeatThreshold: 0.15,
  rewardCr: 1600,
  degradedRewardCr: 800,
  passenger: Object.freeze({
    name: 'Elysia Vance',
    why: 'A cold line past the Customs Gate without lighting up the scanner array.',
  }),
});

/**
 * Reuses heatProximityTrial / heatLure reading logic:
 * At the same proximity range, a cold pass holds shadow while a hot pass brings the charge.
 * Heat signature itself is owned by heat.js (passed in via playerHeat).
 */
export function evaluatePassengerHeatProximity(player, transport, playerHeat = 0) {
  if (!player || !player.pos || !transport || !transport.pos) {
    return { inRange: false, isHot: false, comfort: 1, spooked: false, drive: 'shadow' };
  }
  const dx = player.pos.x - transport.pos.x;
  const dz = player.pos.z - transport.pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist > QUIET_PASSAGE.proximityRange) {
    return { inRange: false, isHot: false, comfort: 1, spooked: false, drive: 'shadow' };
  }
  const speed = Math.hypot(player.vel?.x || 0, player.vel?.z || 0);
  const heatVal = Number(playerHeat) || 0;
  // A hot approach: WANTED heat above threshold or high burn speed / thruster plume
  const isHot = heatVal > QUIET_PASSAGE.quietHeatThreshold || speed > QUIET_PASSAGE.quietSpeedLimit;
  if (isHot) {
    return { inRange: true, isHot: true, comfort: 0, spooked: true, drive: 'charge' };
  }
  return { inRange: true, isHot: false, comfort: 1, spooked: false, drive: 'shadow' };
}

export function buildQuietPassageOffer() {
  return {
    id: QUIET_PASSAGE.id,
    type: QUIET_PASSAGE.type,
    source: QUIET_PASSAGE.source,
    stationId: QUIET_PASSAGE.stationId,
    destStationId: QUIET_PASSAGE.destStationId,
    destSectorId: QUIET_PASSAGE.sectorId,
    factionId: 'faction_free',
    title: 'Quiet passage',
    summary: 'Escort a heat-sensitive passenger transport cold through the Customs Gate checkpoint.',
    brief: 'The passenger cannot risk the customs scanner waking up. Escort the transport through the checkpoint. Approach cold — keep your hull quiet and coast. A hot approach spooks the transport and cuts the fee.',
    reward_cr: QUIET_PASSAGE.rewardCr,
    collateral_cr: 0,
    time_limit_s: null,
    duration_s: null,
    riskTier: 1,
    params: {
      passenger: { ...QUIET_PASSAGE.passenger },
      quietPassage: {
        comfort: 1,
        spooked: false,
        phase: 'transit',
        passedCheckpoint: false,
        pose: { ...QUIET_PASSAGE.transportStartPos },
      },
    },
  };
}

