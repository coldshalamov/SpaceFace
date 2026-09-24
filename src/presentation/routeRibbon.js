// §22 F16 — a faint world ribbon along the point the live autopilot already steers toward.
// No force. Brightness stays under the authored engine-plume core.

import { resolveAutopilotTarget } from '../systems/flightV3.js';

export const ENGINE_PLUME_CORE_INTENSITY = 6.5;
export const ROUTE_RIBBON_BRIGHTNESS = 0.85;

function finitePoint(point) {
  return point && Number.isFinite(point.x) && Number.isFinite(point.z)
    ? { x: point.x, z: point.z }
    : null;
}

function waypointPoint(waypoint) {
  if (!waypoint) return null;
  return finitePoint(waypoint) || finitePoint(waypoint.pos);
}

export function routeRibbon(state) {
  const nav = state && state.player && state.player.nav;
  if (!nav) return null;
  const autopilot = nav.autopilot;
  const waypoint = waypointPoint(nav.waypoint);
  const stored = autopilot && finitePoint(autopilot.target);
  const hasDestination = !!(
    (autopilot && autopilot.active === true)
    || waypoint
    || stored
  );
  if (!hasDestination) return null;
  const player = state.entities && typeof state.entities.get === 'function'
    ? state.entities.get(state.playerId)
    : null;
  if (!player || !player.pos || !Number.isFinite(player.pos.x) || !Number.isFinite(player.pos.z)) return null;
  const resolved = autopilot ? resolveAutopilotTarget(state, autopilot) : null;
  const end = finitePoint(resolved) || stored || waypoint;
  if (!end) return null;
  return {
    active: true,
    brightness: ROUTE_RIBBON_BRIGHTNESS,
    force: 0,
    points: [
      { x: player.pos.x, z: player.pos.z },
      { x: end.x, z: end.z },
    ],
  };
}
