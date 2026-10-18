// One numbers-station count. The Red Cable Yard anomaly carries the cadence.
// It stays noise until the hull sits in the radar shadow of the Resonant
// Cathedral, and the decoded line names a real place in the same sector.
// The station ids are lookup keys. They are never spoken.

import { playerBearingHyphen } from '../core/playerCompass.js';

export const NUMBERS_SHADOW_STATION = Object.freeze({
  sectorId: 'sector_vesta_forge',
  channelId: 'numbers_station',
  broadcasterPoiId: 'poi_vesta_red_cable_yard',
  occluderPoiId: 'poi_vesta_resonant_cathedral',
  rewardPoiId: 'poi_freighter',
});

export const NUMBERS_SHADOW_NOISE = '···· the count breaks ····';

/** Plain sentence from live display names and the player compass. Null when
 * either name or the offset is missing, so a lookup id can never be spoken. */
export function numbersShadowFact(occluderName, rewardName, dx, dz) {
  const occluder = typeof occluderName === 'string' ? occluderName.trim() : '';
  const reward = typeof rewardName === 'string' ? rewardName.trim() : '';
  const bearing = playerBearingHyphen(dx, dz);
  if (!occluder || !reward || !bearing) return null;
  return `${reward} lies ${bearing} of ${occluder}.`;
}
