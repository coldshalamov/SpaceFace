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

/**
 * FB-137 — a set-piece transition draws its travel line instead of emitting into nothing.
 * missions.js marks the run once (`cause.travelLineSpoken`) when it fires
 * `mission:setPieceTravelLine` on the destination-sector entry; this model is the consumer.
 * The line is a SECOND destination ribbon — it never touches the active route: the primary
 * `routeRibbon` keeps reading nav/autopilot exactly as before, and this returns a separate
 * list the painter layers underneath it.
 *
 * The line clears itself by construction: it draws only while the mission is active, its
 * flag is spoken, and the player stands in the sector the next beat lives in — so a
 * `mission:setPieceTransition` (completion, failure, or a stage that moves the run) removes
 * the ribbon with the mission, no teardown listener required. One ribbon per travel line:
 * one entry per qualifying mission.
 */
export const SET_PIECE_RIBBON_BRIGHTNESS = 0.45; // under the primary's 0.85 — a hint, not a route

function stationPosFor(state, stationId) {
  if (!stationId) return null;
  const index = state && state.entityIndex;
  const indexed = index && index.byStationId && index.byStationId.get(stationId);
  if (indexed && indexed.alive !== false && indexed.pos
      && Number.isFinite(indexed.pos.x) && Number.isFinite(indexed.pos.z)) {
    return { x: indexed.pos.x, z: indexed.pos.z };
  }
  const entities = state && state.entities;
  if (entities && typeof entities.values === 'function') {
    for (const e of entities.values()) {
      if (!e || e.alive === false || !e.pos) continue;
      const data = e.data;
      const id = (data && (data.stationId || data.station)) || (e.type === 'station' ? e.id : null);
      if (id === stationId && Number.isFinite(e.pos.x) && Number.isFinite(e.pos.z)) {
        return { x: e.pos.x, z: e.pos.z };
      }
    }
  }
  return null;
}

/**
 * Secondary travel-line ribbons for spoken set-piece transitions. Never includes the active
 * route and never draws for an unaccepted offer — only `missions.active` rows qualify.
 *
 * @returns {Array<{kind:'set-piece', secondary:true, missionId:string, brightness:number,
 *                  points:[{x:number,z:number},{x:number,z:number}]}>}
 */
export function setPieceRibbons(state) {
  const missions = state && state.missions && state.missions.active;
  const sectorId = state && state.world && state.world.currentSectorId;
  const player = state && state.entities && typeof state.entities.get === 'function'
    ? state.entities.get(state.playerId)
    : null;
  if (!Array.isArray(missions) || !sectorId
      || !player || !player.pos
      || !Number.isFinite(player.pos.x) || !Number.isFinite(player.pos.z)) {
    return [];
  }
  const out = [];
  for (const m of missions) {
    if (!m || m.status !== 'active' || m.destSectorId !== sectorId) continue;
    const cause = m.cause;
    if (!cause || cause.archetypeId !== 'witness_run' || cause.travelLineSpoken !== true) continue;
    const to = stationPosFor(state, cause.travelLineTo || m.destStationId);
    if (!to) continue;
    out.push({
      kind: 'set-piece',
      secondary: true,
      missionId: m.id,
      brightness: SET_PIECE_RIBBON_BRIGHTNESS,
      points: [
        { x: player.pos.x, z: player.pos.z },
        { x: to.x, z: to.z },
      ],
    });
  }
  return out;
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
