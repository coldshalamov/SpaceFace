// §22 F8 — the WANTED search is the radius heat already owns, read for a world ring.
// This module does not write heat.

import { heatRadiusForLevel, heatZoneInCurrentSector } from '../systems/heat.js';

export function readWantedSearchVolume(state) {
  const zone = heatZoneInCurrentSector(state);
  if (!zone || !(zone.radius > 0) || !(zone.level > 0)) return null;
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

/** True when a world point sits inside the search ring. A missing volume is outside. */
export function pointInsideWantedSearch(volume, x, z) {
  if (!volume || !(volume.radius > 0)) return false;
  const dx = (Number(x) || 0) - (Number(volume.x) || 0);
  const dz = (Number(z) || 0) - (Number(volume.z) || 0);
  return dx * dx + dz * dz <= volume.radius * volume.radius;
}

/**
 * One edge per crossing. The first sample only latches, so spawning inside the ring
 * does not play an enter cue. `previousInside` null means "not yet observed".
 */
export function stepWantedSearchEdge(previousInside, inside) {
  const now = !!inside;
  if (previousInside == null) return { inside: now, edge: null };
  if (previousInside && !now) return { inside: now, edge: 'leave' };
  if (!previousInside && now) return { inside: now, edge: 'enter' };
  return { inside: now, edge: null };
}
