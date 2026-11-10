// M07 — cargo in the wake. One authored smuggling pass: a hauler keeps a lane and
// leaves a crate in its wake. The pilot matches that lane and scoops the crate.
// Identity and tuned scalars only. The mission owner settles pay and failure.

import { COMMODITIES } from './commodities.js';

const STOLEN = COMMODITIES.find((row) => row && row.id === 'cmdty_stolen_goods');

export const WAKE_HANDOFF = Object.freeze({
  id: 'm07_cargo_in_the_wake',
  type: 'smuggling_run',
  source: 'wakeHandoff',
  stationId: 'station_drift',
  destStationId: 'station_drift',
  sectorId: 'sector_pallas_drift',
  factionId: 'faction_mts',
  cmdtyId: 'cmdty_stolen_goods',
  cmdtyName: (STOLEN && STOLEN.name) || 'Stolen Goods',
  qty: 4,
  rewardCr: 1280,
  /** Seconds from the first lane tick before the hauler is gone. */
  windowS: 80,
  /** Hauler lane speed, WU/s. Not a player-flight retune. */
  speed: 36,
  /** Relative speed at or under this counts as flying the hauler's lane. */
  matchSpeed: 10,
  /** Must still be beside the hauler when the crate comes aboard. */
  alongsideWu: 160,
  /** Crate sits this far behind the hauler, in the wake. */
  wakeOffset: 48,
  heading: 0,
  start: Object.freeze({ x: 1600, z: -720 }),
  haulerName: 'Lane Hauler',
});

/**
 * Whether the pilot is flying the hauler's lane. Pure: no state writes.
 * `matched` is relative speed. `alongside` is distance to the hauler, not to the crate.
 */
export function wakePassRead(player, hauler) {
  if (!player || !player.pos || !hauler || !hauler.pos || hauler.alive === false) {
    return { matched: false, alongside: false, relSpeed: Infinity, distance: Infinity };
  }
  const distance = Math.hypot(player.pos.x - hauler.pos.x, player.pos.z - hauler.pos.z);
  const rvx = (player.vel && player.vel.x || 0) - (hauler.vel && hauler.vel.x || 0);
  const rvz = (player.vel && player.vel.z || 0) - (hauler.vel && hauler.vel.z || 0);
  const relSpeed = Math.hypot(rvx, rvz);
  return {
    distance,
    relSpeed,
    alongside: distance <= WAKE_HANDOFF.alongsideWu,
    matched: relSpeed <= WAKE_HANDOFF.matchSpeed,
  };
}

export function buildWakeHandoffOffer() {
  const name = WAKE_HANDOFF.cmdtyName;
  const qty = WAKE_HANDOFF.qty;
  const title = 'Pass the crate in the wake';
  const brief = `${qty}u ${name} ride in a hauler's wake in Pallas Drift. Match its speed and fly into the crate. Drift Market pays only for that pass.`;
  return {
    id: WAKE_HANDOFF.id,
    type: WAKE_HANDOFF.type,
    source: WAKE_HANDOFF.source,
    stationId: WAKE_HANDOFF.stationId,
    destStationId: WAKE_HANDOFF.destStationId,
    destSectorId: WAKE_HANDOFF.sectorId,
    factionId: WAKE_HANDOFF.factionId,
    title,
    summary: 'Match the hauler and take the crate in its wake.',
    brief,
    reward_cr: WAKE_HANDOFF.rewardCr,
    collateral_cr: 0,
    riskTier: 2,
    minRep: -40,
    distance: 0,
    preloadedCargo: false,
    params: {
      cmdtyId: WAKE_HANDOFF.cmdtyId,
      qty,
      cargoValue: ((STOLEN && STOLEN.basePrice) || 300) * qty,
      fValue: 1,
      taskTime: 20,
      wakeHandoff: {
        windowS: WAKE_HANDOFF.windowS,
        closeAt: null,
        pose: null,
        haulerName: WAKE_HANDOFF.haulerName,
      },
    },
  };
}
