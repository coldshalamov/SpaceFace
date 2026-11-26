import { playerSensorBlock } from '../../systems/scanner.js';

/* Inside a nebula the scanner really does wash out (hazardLanguage: "sensors wash out"). Presentation
   only - detection, AI sensors and targeting are untouched. Contacts inside 45 % of the radar range
   read normally; between 45 % and 75 % they fade to unknown ghost marks (no identity, no colour);
   beyond 75 % they vanish. Stations and gates are charted, not sensed, and keep their marks. */
export const NEBULA_VEIL_GHOST_FRACTION = 0.45;
export const NEBULA_VEIL_HIDE_FRACTION = 0.75;
export const VEIL_CLEAR = 0;
export const VEIL_GHOST = 1;
export const VEIL_HIDDEN = 2;

/**
 * Dead or jammed sensor bank. Sensed marks leave the scope: ships, wrecks,
 * pickups, pings, and the firing lead. Charted stations, gates, the belt,
 * and the plotted waypoint stay — those are not the sensor board.
 */
export function radarBoardBlind(state, player) {
  const who = player || (state && state.entities && typeof state.entities.get === 'function'
    ? state.entities.get(state.playerId)
    : null);
  return playerSensorBlock(state, who) != null;
}

/** True while the player's current hazard read is a nebula (sector hazard or nebula_fog zone). */
export function nebulaVeilActive(state) {
  const read = state && state.ui && state.ui.hazardRead;
  if (!read || (read.type !== 'nebula' && read.type !== 'nebula_fog')) return false;
  // A read stamped in another sector is stale: the veil applies only inside a nebula of THIS sector.
  const here = state.world && state.world.currentSectorId;
  return !(read.sectorId && here && read.sectorId !== here);
}

/** Veil band for a contact at `distanceSq` on a radar of `rangeSq` (squared WU). */
export function nebulaVeilBand(distanceSq, rangeSq) {
  if (!(rangeSq > 0)) return VEIL_CLEAR;
  const ghostSq = rangeSq * NEBULA_VEIL_GHOST_FRACTION * NEBULA_VEIL_GHOST_FRACTION;
  if (distanceSq <= ghostSq) return VEIL_CLEAR;
  const hideSq = rangeSq * NEBULA_VEIL_HIDE_FRACTION * NEBULA_VEIL_HIDE_FRACTION;
  return distanceSq <= hideSq ? VEIL_GHOST : VEIL_HIDDEN;
}

/** Identity is available only for a fresh, unobscured sensor return. */
export function chartContactRead(state, player) {
  const blind = radarBoardBlind(state, player);
  const veil = nebulaVeilActive(state);
  const range = Number(state?.ui?.radarRange) || 4000;
  const rangeSq = range * range;
  return {
    key: `${blind}:${veil}:${range}`,
    sees(entity) {
      if (blind || !player?.pos || !entity?.pos) return false;
      const dx = entity.pos.x - player.pos.x;
      const dz = entity.pos.z - player.pos.z;
      const distanceSq = dx * dx + dz * dz;
      return distanceSq <= rangeSq && (!veil || nebulaVeilBand(distanceSq, rangeSq) === VEIL_CLEAR);
    },
  };
}
