// Read-only presentation resolution for navigation waypoints.
//
// `targetEntityId` is gameplay-facing: autopilot, Massline targeting, save normalization, and other
// control owners may consume it. `presentationEntityId` is deliberately narrower. It lets HUD/map
// surfaces follow a moving physical objective without quietly turning that objective into a flight
// or tether assist. The authored waypoint position remains the fail-closed fallback if the entity is
// absent during admission, destruction, or a save/load boundary.

import { resolveEntitySelection } from './sim/stableSelection.js';
import { SECTORS } from '../data/sectors.js';

const SECTOR_BY_ID = new Map(SECTORS.map((s) => [s.id, s]));

function sectorDisplayName(sectorId) {
  const sector = SECTOR_BY_ID.get(sectorId);
  return (sector && sector.name) || String(sectorId || '');
}

/**
 * The FIRST gate hop on the shortest sector-graph path toward `destSectorId`, plus the live gate
 * entity in the player's current sector that flies it.
 *
 * This is the cross-sector wayfinding fallback: a tracked objective in another sector has no world
 * fix, which used to leave every flight instrument answering "ROUTE PENDING" while the pilot sat
 * with no direction at all. The honest answer the game CAN give is physical: the gate in this
 * sector that starts the trip. BFS runs over the authored neighbour lists (the same graph
 * `world.computeRoute` plans over); the gate must EXIST as a live entity, so the fix always
 * points at a thing the pilot can actually see and fly at.
 *
 * Pure: reads state, returns a plain record, writes nothing.
 *
 * @returns {{
 *   pos: {x:number,z:number}|null,
 *   label: string,
 *   sectorId: string,
 *   destSectorId: string,
 * }|null} `pos` is null only when no live gate entity carries the hop — the caller then says so
 *   in words ("open the map to plot") instead of pointing at nothing.
 */
export function resolveCrossSectorGateFix(state, destSectorId) {
  const current = (state && state.world && state.world.currentSectorId)
    || null;
  if (!current || !destSectorId || destSectorId === current) return null;
  if (!SECTOR_BY_ID.has(current) || !SECTOR_BY_ID.has(destSectorId)) return null;

  // BFS over authored neighbours: current -> ... -> dest. The first step is the gate to name.
  const prev = new Map([[current, null]]);
  const queue = [current];
  let nextHop = null;
  while (queue.length) {
    const id = queue.shift();
    if (id === destSectorId) { nextHop = id; break; }
    const sector = SECTOR_BY_ID.get(id);
    const neighbours = (sector && sector.neighbors) || [];
    for (const nb of neighbours) {
      if (prev.has(nb) || !SECTOR_BY_ID.has(nb)) continue;
      prev.set(nb, id);
      queue.push(nb);
    }
  }
  if (!nextHop) return null;
  // Walk back to the first step out of `current`.
  let step = destSectorId;
  while (prev.get(step) && prev.get(step) !== current) step = prev.get(step);
  nextHop = prev.get(step) === current ? step : null;
  if (!nextHop) return null;

  let pos = null;
  const list = (state && state.entityList) || null;
  if (Array.isArray(list)) {
    for (const e of list) {
      if (!e || e.alive === false || !e.pos) continue;
      const data = e.data;
      if (!data || !data.isGate || data.gateTo !== nextHop) continue;
      if (Number.isFinite(e.pos.x) && Number.isFinite(e.pos.z)) {
        pos = { x: e.pos.x, z: e.pos.z };
        break;
      }
    }
  }
  return {
    pos,
    label: `Gate → ${sectorDisplayName(nextHop)}`,
    sectorId: nextHop,
    destSectorId,
  };
}

/**
 * Where to POINT when the tracked objective is in another sector: the gate that starts the trip.
 *
 * Null whenever the ordinary waypoint flow already has a live fix (`resolveWaypointPresentationPosition`
 * resolves nav.waypoint) — the existing instruments own that case. Null when nothing is tracked or
 * the destination is this sector. This is presentation-only: it never arms a course and never
 * touches `nav`.
 *
 * @returns {{pos:{x:number,z:number}|null, label:string, sectorId:string, destSectorId:string}|null}
 */
export function resolveObjectiveGatePresentation(state) {
  if (!state) return null;
  const nw = state.nav && state.nav.waypoint;
  if (nw && resolveWaypointPresentationPosition(state, nw)) return null;
  const current = (state && state.world && state.world.currentSectorId) || null;
  if (!current) return null;
  const active = (state.missions && state.missions.active) || [];
  const destOf = (m) => (m && (m.destSectorId || (m.params && m.params.sectorId))) || null;
  const trackedId = state.ui && state.ui.trackedMissionId;
  const tracked = trackedId
    ? active.find((m) => m && m.id === trackedId && m.status === 'active')
    : null;
  const mission = (tracked && destOf(tracked))
    ? tracked
    : active.find((m) => m && m.status === 'active' && destOf(m));
  const dest = destOf(mission);
  if (!dest || dest === current) return null;
  return resolveCrossSectorGateFix(state, dest);
}

export function resolveWaypointPresentationPosition(state, waypoint) {
  if (!waypoint) return null;
  if (waypoint.stable) {
    // The bind was stamped at arm time: a durable target follows its new instance, a
    // recycled transient id resolves closed and the authored fix keeps the waypoint honest.
    const entity = resolveEntitySelection(state, waypoint.stable);
    const pos = entity && entity.alive !== false ? entity.pos : null;
    if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.z)) return pos;
    const fallback = waypoint.pos;
    return fallback && Number.isFinite(fallback.x) && Number.isFinite(fallback.z) ? fallback : null;
  }
  const presentationId = waypoint.presentationEntityId;
  if (presentationId != null) {
    const entity = state?.entities?.get?.(presentationId);
    const pos = entity && entity.alive !== false ? entity.pos : null;
    if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.z)) return pos;
  }
  const fallback = waypoint.pos;
  return fallback && Number.isFinite(fallback.x) && Number.isFinite(fallback.z) ? fallback : null;
}

/**
 * The live entity a freshly authored course aimed at, or null. The course owner (`world._onSetCourse`)
 * binds this as the waypoint's `presentationEntityId` so every surface that resolves through
 * `resolveWaypointPresentationPosition` — HUD arrow, radar, both maps, threat halo — points at the
 * SAME live position the autopilot chases via `targetEntityId` (flight re-resolves the entity every
 * tick). Without the bind, a course set on a moving contact flies flight to the hull while every
 * instrument stays parked at the click-time fix. Fail-closed: a dead, despawned, or position-less
 * target binds nothing and the authored pos remains the waypoint's place.
 */
export function presentationEntityIdForCourseTarget(entities, targetEntityId) {
  if (targetEntityId == null || !entities || typeof entities.get !== 'function') return null;
  let entity = entities.get(targetEntityId);
  if (!entity && typeof targetEntityId === 'string') {
    const numeric = Number(targetEntityId);
    if (Number.isFinite(numeric)) entity = entities.get(numeric);
  }
  if (!entity || entity.alive === false || !entity.pos) return null;
  return Number.isFinite(entity.pos.x) && Number.isFinite(entity.pos.z) ? entity.id : null;
}
