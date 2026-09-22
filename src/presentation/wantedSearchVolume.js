// §22 F8 — the WANTED search is the radius heat already owns, read for a world ring.
// This module does not write heat.

import { heatRadiusForLevel } from '../systems/heat.js';

export function readWantedSearchVolume(state) {
  const zone = state && state.player && state.player.heatZone;
  if (!zone || zone.active !== true || !(zone.radius > 0) || !(zone.level > 0)) return null;
  const authored = heatRadiusForLevel(zone.level);
  return {
    active: true,
    x: Number(zone.center && zone.center.x) || 0,
    z: Number(zone.center && zone.center.z) || 0,
    radius: zone.radius,
    authoredRadius: authored,
    level: zone.level,
    clearAfterS: zone.clearAfterS || 0,
    opacity: 0.22,
  };
}
