// §22 F8 — the WANTED search is the radius heat already owns, read for a world ring.
// This module does not write heat.

import { heatRadiusForLevel, heatZoneInCurrentSector } from '../systems/heat.js';

export function readWantedSearchVolume(state, out = null) {
  const zone = heatZoneInCurrentSector(state);
  if (!zone || !(zone.radius > 0) || !(zone.level > 0)) return null;
  const authored = heatRadiusForLevel(zone.level);
  const volume = out || {};
  volume.active = true;
  volume.x = Number(zone.center && zone.center.x) || 0;
  volume.z = Number(zone.center && zone.center.z) || 0;
  volume.radius = zone.radius;
  volume.authoredRadius = authored;
  volume.level = zone.level;
  volume.clearAfterS = zone.clearAfterS || 0;
  volume.opacity = 0.22;
  return volume;
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
 * `out` serves the per-tick readers — a fresh {inside, edge} per step is pure churn.
 */
export function stepWantedSearchEdge(previousInside, inside, out = null) {
  const now = !!inside;
  out = out || {};
  out.inside = now;
  if (previousInside == null) out.edge = null;
  else if (previousInside && !now) out.edge = 'leave';
  else if (!previousInside && now) out.edge = 'enter';
  else out.edge = null;
  return out;
}
