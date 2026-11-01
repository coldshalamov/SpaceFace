// Shared read-only flight targets and profile transforms. Presentation consumers must not
// import the simulation adapter and its physics owners to read these values.
import {
  corridorStateFor,
  proxyScaleFor,
  resolveBerthWorld,
  resolveCollisionProxyManifest,
  resolveCorridorAxisWorld,
  resolveDockAnchor,
} from '../../data/collisionProxyManifests.js';
import { resolveEntitySelection } from '../../ui/sim/stableSelection.js';

export const AUTOPILOT_ARRIVAL_RADIUS = 38;
const AUTO_TARGET_HELM_MULT = 1.5;
const AUTO_TARGET_PATH_OVERDRIVE_MULT = 1.6;

// Phase 2b #9 (tuning lab): the station a docking autopilot targets is excluded from its own
// obstacle list, so a hull starting behind the station flew the straight line to the corridor mouth
// THROUGH the station and ground against its proxy forever (measured: every 180° start, every hull,
// ~7000 contacts at up to 158 wu/s, never docked). A far-side approach now rounds the station on a
// circle of DOCK_ORBIT_RADIUS_MULT x mouth radius, aiming a carrot DOCK_ORBIT_STEP_DEG ahead toward
// the corridor axis, until the hull is within that angle of the axis — then the authored mouth aim
// takes over unchanged. Starts already inside the circle keep the mouth aim (the exit path).
export const DOCK_ORBIT_RADIUS_MULT = 1.3;
export const DOCK_ORBIT_STEP_DEG = 60;
export function dockOrbitWaypoint(entity, axis, mouthRadius, player) {
  if (!player || !player.pos || !(mouthRadius > 0)) return null;
  const R = mouthRadius * DOCK_ORBIT_RADIUS_MULT;
  const rx = finite(player.pos.x) - finite(entity.pos.x);
  const rz = finite(player.pos.z) - finite(entity.pos.z);
  const along = rx * axis.x + rz * axis.z;
  const lateral = rx * -axis.z + rz * axis.x;
  const theta = Math.atan2(lateral, along);
  const step = DOCK_ORBIT_STEP_DEG * Math.PI / 180;
  if (Math.abs(theta) <= step || Math.hypot(rx, rz) < R * 0.9) return null;
  const tw = theta - Math.sign(theta) * step;
  const c = Math.cos(tw);
  const s = Math.sin(tw);
  return {
    x: finite(entity.pos.x) + (axis.x * c - axis.z * s) * R,
    z: finite(entity.pos.z) + (axis.z * c + axis.x * s) * R,
  };
}

export function resolveAutopilotTarget(state, autopilot) {
  if (!state || !autopilot) return null;
  const id = autopilot.targetEntityId;
  let entity = null;
  if (autopilot.stable) {
    // SF-244: the course owner stamped what the bind meant at arm time — a recycled id
    // resolves closed and the burn falls back to the fix, never onto the new holder.
    entity = resolveEntitySelection(state, autopilot.stable);
  } else if (id != null && state.entities && typeof state.entities.get === 'function') {
    entity = state.entities.get(id);
    if (!entity && typeof id === 'string') {
      const numeric = Number(id);
      if (Number.isFinite(numeric)) entity = state.entities.get(numeric);
    }
  }
  if (entity && entity.alive !== false && entity.pos
      && Number.isFinite(entity.pos.x) && Number.isFinite(entity.pos.z)) {
    // PQ-008 stations with truthful collision geometry dock at an authored berth, not at the
    // legacy center-radius ring. A station waypoint still identifies the live entity, but default
    // flight resolves its terminal point into the manifest-owned corridor. Its terminal radius is
    // the same berth gate that owns the physical dock prompt, rather than a wider capture volume
    // where autopilot could declare arrival without exposing that prompt.
    const manifest = entity.type === 'station' ? resolveCollisionProxyManifest(entity) : null;
    if (manifest && manifest.docking) {
      const berth = resolveBerthWorld(entity, manifest);
      const scale = proxyScaleFor(entity, manifest);
      const axis = resolveCorridorAxisWorld(entity, manifest);
      const mouthRadius = positive(manifest.docking.corridor && manifest.docking.corridor.mouthRadius, 0) * scale;
      const approach = {
        x: finite(entity.pos.x) + axis.x * mouthRadius,
        z: finite(entity.pos.z) + axis.z * mouthRadius,
      };
      const berthDockRadius = positive(manifest.docking.berth && manifest.docking.berth.dockRadius, 12);
      const captureHalfWidth = positive(
        manifest.docking.capture && manifest.docking.capture.halfWidth,
        0,
      ) * positive(scale, 1);
      const player = state.playerId != null && state.entities && typeof state.entities.get === 'function'
        ? state.entities.get(state.playerId)
        : null;
      const corridor = player && player.pos
        ? corridorStateFor(manifest, entity, player.pos, player.vel)
        : null;
      // Targeting the berth directly from an arbitrary bearing can drive the ship into the compound
      // station silhouette outside its authored gap. First converge on the corridor mouth. Switch
      // to the berth well before the terminal dock gate could stop/deactivate the staging course,
      // or immediately when the ship is already geometrically inside the lane.
      const inLane = !!(
        corridor && (corridor.inCorridor || corridor.inCapture || corridor.berthed)
      );
      const approachDistance = player && player.pos
        ? Math.hypot(finite(player.pos.x) - approach.x, finite(player.pos.z) - approach.z)
        : 0;
      // The berth stage holds the authored lane with lateral avoidance suppressed — it must only
      // arm while the hull is geometrically in the lane, or just outside the mouth still aligned
      // with the corridor wedge. A hull off the wedge — knocked into an inter-spar armpit by a
      // traffic dodge or contact — keeps the mouth aim: the only path that exits back through the
      // ring gap instead of grinding structure until the solver expels it.
      const shipRelX = player && player.pos ? finite(player.pos.x) - finite(entity.pos.x) : 0;
      const shipRelZ = player && player.pos ? finite(player.pos.z) - finite(entity.pos.z) : 0;
      const shipAlong = shipRelX * axis.x + shipRelZ * axis.z;
      const shipLateral = Math.abs(shipRelX * -axis.z + shipRelZ * axis.x);
      const wedgeHalfWidth = Math.max(
        captureHalfWidth,
        Math.tan(finite(manifest.docking.corridor && manifest.docking.corridor.halfWidthDeg, 0)
          * (Math.PI / 180)) * Math.max(shipAlong, 1),
      );
      const alignedWithLane = shipAlong > 0 && shipLateral <= wedgeHalfWidth;
      const approachSwitchRadius = Math.max(AUTOPILOT_ARRIVAL_RADIUS + 7, captureHalfWidth);
      const berthStage = !player || !player.pos || inLane
        || (approachDistance <= approachSwitchRadius && alignedWithLane);
      // SF-130: the terminal anchor is the hull's own dock anchor — the deck berth when its
      // planar envelope clears the pocket, else the corridor-axis mooring standoff. Same
      // anchor the physics dock:range gate uses, so the autopilot can never park the hull
      // somewhere the dock prompt will not fire.
      const dockAnchor = resolveDockAnchor(entity, manifest, player) || {
        x: berth.x, z: berth.z,
        dockRadius: berthDockRadius,
        speedGate: positive(manifest.docking.berth && manifest.docking.berth.speedGate, 12),
        kind: 'berth',
      };
      const orbit = berthStage ? null : dockOrbitWaypoint(entity, axis, mouthRadius, player);
      return {
        x: berthStage ? dockAnchor.x : orbit ? orbit.x : approach.x,
        z: berthStage ? dockAnchor.z : orbit ? orbit.z : approach.z,
        radius: 0,
        arrivalRadius: dockAnchor.dockRadius,
        dockingProxyId: manifest.id || null,
        dockingStage: berthStage ? 'berth' : 'corridor-mouth',
        dockAnchorKind: dockAnchor.kind,
        corridorInLane: inLane,
        dockSpeedGate: dockAnchor.speedGate,
        approachPoint: approach,
        entity,
        label: autopilot.label || entity.name || (entity.data && entity.data.name) || 'Station berth',
      };
    }
    return {
      x: entity.pos.x,
      z: entity.pos.z,
      radius: entity.radius || 0,
      entity,
      label: autopilot.label || entity.name || (entity.data && entity.data.name) || entity.type || 'Autopilot target',
    };
  }
  const target = autopilot.target;
  if (!target || !Number.isFinite(target.x) || !Number.isFinite(target.z)) return null;
  return { x: target.x, z: target.z, radius: 0, entity: null, label: autopilot.label || 'Autopilot target' };
}

export function applyAutoTargetHelmProfile(profile) {
  return {
    ...profile,
    maxYawRate: Number.isFinite(profile.maxYawRate)
      ? profile.maxYawRate * AUTO_TARGET_HELM_MULT
      : profile.maxYawRate,
    yawAccel: Number.isFinite(profile.yawAccel)
      ? profile.yawAccel * AUTO_TARGET_HELM_MULT
      : profile.yawAccel,
    yawBrake: Number.isFinite(profile.yawBrake)
      ? profile.yawBrake * AUTO_TARGET_HELM_MULT
      : profile.yawBrake,
  };
}

export function applyAutoTargetPathProfile(profile) {
  const scale = (value) => Number.isFinite(value)
    ? value * AUTO_TARGET_PATH_OVERDRIVE_MULT
    : value;
  return {
    ...profile,
    mainAccel: scale(profile.mainAccel),
    strafeAccel: scale(profile.strafeAccel),
    reverseAccel: scale(profile.reverseAccel),
    maxSpeed: scale(profile.maxSpeed),
    combatSpeed: scale(profile.combatSpeed),
    precisionSpeed: scale(profile.precisionSpeed),
  };
}

function finite(v, fallback = 0) { return Number.isFinite(v) ? v : fallback; }
function positive(v, fallback) { return Number.isFinite(v) && v > 0 ? v : fallback; }
