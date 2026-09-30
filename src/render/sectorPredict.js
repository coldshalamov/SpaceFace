/**
 * Predict which sector the player will need next, from declared intent (route executor, plotted
 * route, armed autopilot, waypoint) down to raw kinematics (a ballistic path that enters a gate's
 * capture disc inside an arm horizon). Pure: no allocations beyond the one result object, no sim
 * writes — the caller decides what to do with the answer.
 *
 * Confidence order, strongest first:
 *   1. route-executor  — `nav.executor` engaged: the follower itself emits world:requestJump at the
 *                        gate handoff, so the current leg's `toSectorId` is near-certain.
 *   2. autopilot-gate  — `nav.autopilot.active` aiming at a gate entity (`targetEntityId`).
 *   3. waypoint-sector — `nav.autopilot.active` with `nav.waypoint.targetSectorId` set.
 *   4. route-plotted   — `nav.autoTravel` with a route but no engaged executor yet.
 *   5. gate-approach   — no declared intent; the ship's own velocity vector enters a gate disc.
 *
 * `options.heldSectorId` is the sector a caller is already warming: the kinematic leg re-proves it
 * against a longer hold horizon so autopilot braking (decaying speed stretches ballistic
 * time-to-enter) does not flap the warm set. Declared-intent legs need no hysteresis — they read
 * the intent itself, not the motion.
 */

import { timeToEnterRadiusSeconds } from './tabletopPolicy.js';
import {
  CORRIDOR_SECTOR_IDS,
  isCorridorSector,
  sectorGlobalOrigin,
} from '../data/sectorCoordinates.js';
import { SECTORS } from '../data/sectors.js';

/** A ballistic path that enters a gate's disc this soon is treated as jump intent. */
export const PREDICT_GATE_ARM_SECONDS = 30;
/** Once armed, keep the prediction while the path still enters the disc within this horizon. */
export const PREDICT_GATE_HOLD_SECONDS = 120;
/** Captures both the gate dock ring (~70-90 WU) and the route follower's 260 WU handoff radius. */
export const PREDICT_GATE_CAPTURE_RADIUS_WU = 260;

function entitySectorIdOf(entity) {
  const data = entity && entity.data;
  const id = entity && (entity.homeSectorId || (data && (data.homeSectorId || data.sectorId)));
  return id == null ? null : String(id);
}

function gateDestination(entity) {
  const data = entity && entity.data;
  if (!data || data.isGate !== true) return null;
  const to = data.gateTo;
  return to == null ? null : String(to);
}

let _discRadiusBySectorId = null;
function sectorDiscRadiusWu(sectorId) {
  if (!_discRadiusBySectorId) {
    _discRadiusBySectorId = new Map();
    for (const sector of SECTORS || []) {
      if (sector && sector.id) {
        // Author the predictor disc at the sector's hard bound (worldRadius + 500), not the bare
        // authored radius — content standing in the worldRadius..+500 skirt has the same cold-pop
        // profile on border approach. Matches hardRadius in world.js.
        const worldRadius = Number.isFinite(sector.worldRadius) && sector.worldRadius > 0
          ? sector.worldRadius : 4000;
        _discRadiusBySectorId.set(sector.id, worldRadius + 500);
      }
    }
  }
  return _discRadiusBySectorId.get(sectorId) ?? 4500;
}

function sectorResult(sectorId, source, currentSectorId, ttcSeconds) {
  const exact = sectorId == null ? null : String(sectorId);
  if (!exact || exact === currentSectorId) return null;
  return Number.isFinite(ttcSeconds)
    ? { sectorId: exact, source, ttcSeconds }
    : { sectorId: exact, source };
}

export function predictNextSector(state, options = {}) {
  if (!state) return null;
  const currentSectorId = String((state.world && state.world.currentSectorId) || '');
  const heldSectorId = options.heldSectorId == null ? null : String(options.heldSectorId);
  const nav = state.nav || null;

  // 1. Engaged route executor: the leg being flown ends at a gate whose jump the follower requests.
  const executor = nav && nav.executor;
  if (executor && executor.engaged === true && executor.status !== 'arrived') {
    const legs = Array.isArray(executor.legs) ? executor.legs : [];
    const legIndex = Number.isInteger(executor.legIndex) ? executor.legIndex : 0;
    const leg = legs[legIndex] || null;
    const hit = leg && sectorResult(leg.toSectorId, 'route-executor', currentSectorId);
    if (hit) return hit;
  }

  const entities = state.entities || null;
  const entityById = (id) => (entities && typeof entities.get === 'function' ? entities.get(id) : null);
  const autopilot = nav && nav.autopilot;

  // 2. Autopilot actively aimed at a gate entity.
  if (autopilot && autopilot.active === true) {
    const target = entityById(autopilot.targetEntityId);
    const hit = sectorResult(gateDestination(target), 'autopilot-gate', currentSectorId);
    if (hit) return hit;
    // 3. Waypoint aimed at a sector's gate (set by world._onSetCourse / the map).
    const waypoint = nav && nav.waypoint;
    if (waypoint) {
      const hit = sectorResult(waypoint.targetSectorId, 'waypoint-sector', currentSectorId);
      if (hit) return hit;
      const waypointGate = entityById(waypoint.targetEntityId);
      const gateHit = sectorResult(gateDestination(waypointGate), 'autopilot-gate', currentSectorId);
      if (gateHit) return gateHit;
    }
  }

  // 4. Plotted route not yet engaged (or executor legs exhausted): the leg that departs the
  //    current sector names the next one.
  const route = nav && nav.route;
  if (nav && nav.autoTravel === true && route && Array.isArray(route.legs)) {
    for (const leg of route.legs) {
      if (!leg || String(leg.from) !== currentSectorId) continue;
      const hit = sectorResult(leg.to, 'route-plotted', currentSectorId);
      if (hit) return hit;
    }
  }

  // 5. Kinematic gate approach: the player's own ballistic path enters a gate disc.
  const player = entityById(state.playerId);
  const playerPos = player && player.pos;
  if (!player || !playerPos || !entities) return null;
  const pvx = (player.vel && Number(player.vel.x)) || 0;
  const pvz = (player.vel && Number(player.vel.z)) || 0;
  let best = null;
  for (const entity of entities.values ? entities.values() : []) {
    const to = gateDestination(entity);
    if (!to || to === currentSectorId) continue;
    if (entitySectorIdOf(entity) !== currentSectorId) continue;
    if (!entity.pos || entity.alive === false) continue;
    const radius = Math.max(
      Number(entity.data && entity.data.dockRadius) || 0,
      PREDICT_GATE_CAPTURE_RADIUS_WU,
    );
    const horizon = to === heldSectorId ? PREDICT_GATE_HOLD_SECONDS : PREDICT_GATE_ARM_SECONDS;
    const relVx = ((entity.vel && Number(entity.vel.x)) || 0) - pvx;
    const relVz = ((entity.vel && Number(entity.vel.z)) || 0) - pvz;
    const ttc = timeToEnterRadiusSeconds(
      entity.pos.x - playerPos.x,
      entity.pos.z - playerPos.z,
      relVx,
      relVz,
      radius,
      horizon,
    );
    if (!Number.isFinite(ttc)) continue;
    if (!best || ttc < best.ttcSeconds) best = { sectorId: to, source: 'gate-approach', ttcSeconds: ttc };
  }
  if (best) return best;

  // 6. Ballistic border penetration: free flight over a Voronoi seam never touches a gate
  //    entity — the player's global path enters a neighboring sector's authored disc, and the
  //    target's authored census is exactly what pops if it is still cold at membership change.
  //    Corridor-only: continuous global addressing only exists inside the corridor lattice.
  if (!isCorridorSector(currentSectorId)) return null;
  // Live entity positions are already galactic-global in the corridor (authored locals are
  // composed into global once at spawn; sectorMembershipAtGlobal reads player.pos directly).
  const gpos = playerPos;
  const currentOrigin = sectorGlobalOrigin(currentSectorId);
  for (const id of CORRIDOR_SECTOR_IDS) {
    if (id === currentSectorId) continue;
    const origin = sectorGlobalOrigin(id);
    const radius = sectorDiscRadiusWu(id);
    const horizon = id === heldSectorId ? PREDICT_GATE_HOLD_SECONDS : PREDICT_GATE_ARM_SECONDS;
    const ttc = timeToEnterRadiusSeconds(
      origin.x - gpos.x,
      origin.z - gpos.z,
      -pvx,
      -pvz,
      radius,
      horizon,
    );
    if (Number.isFinite(ttc)) {
      if (!best || ttc < best.ttcSeconds) best = { sectorId: id, source: 'border-approach', ttcSeconds: ttc };
      continue;
    }
    // Membership flips on Voronoi penetration, not authored-disc contact — a graze that crosses
    // the cell deep past the bisector never enters the disc window at all. Mirror the flip's own
    // threshold (y ≥ max(2500, 0.35·span), world.js membership): arm when the ballistic path
    // reaches flip depth inside the horizon while leading toward the neighbor.
    if (!currentOrigin || !origin) continue;
    const spanX = origin.x - currentOrigin.x;
    const spanZ = origin.z - currentOrigin.z;
    const span = Math.hypot(spanX, spanZ);
    if (!(span > 1e-6)) continue;
    const nx = spanX / span;
    const nz = spanZ / span;
    const vN = pvx * nx + pvz * nz;
    if (vN <= 1e-6) continue;
    const midX = (currentOrigin.x + origin.x) * 0.5;
    const midZ = (currentOrigin.z + origin.z) * 0.5;
    const y0 = (gpos.x - midX) * nx + (gpos.z - midZ) * nz;
    const needed = Math.max(2500, 0.35 * span);
    const tFlip = Math.max(0, (needed - y0) / vN);
    if (tFlip <= horizon) {
      if (!best || tFlip < best.ttcSeconds) best = { sectorId: id, source: 'border-approach', ttcSeconds: tFlip };
    }
  }
  return best;
}
