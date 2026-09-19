// A bounded shaping stage INSIDE tacticalAI's existing maneuver/fire owners.
// No entity writes, target-position omniscience, damage shortcuts or new executor.
import { NEMESIS_KITS } from '../data/nemesisRival.js';
import { clamp, finite } from '../nemesis/model.js';

// Public flag from ai/contracts.js. Kept as a literal here so the pure acceptance harness does
// not import the entire tactical stack. Same non-enumerable marker and request schema.
const NORMALIZED_FLAG = '__spacefaceNormalizedThrusterRequest';
const SHAPABLE = new Set(['intercept', 'orbit', 'screen', 'formation', 'approach_socket']);
const wrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
const usablePosition = (p) => p && Number.isFinite(p.x) && Number.isFinite(p.z);

function context(ship, state) {
  const tag = ship && ship.data && ship.data.nemesis;
  const active = state && state.nemesis && state.nemesis.active;
  return tag && active && tag.encounterId === active.id && active.crewIds.includes(ship.id)
    ? { tag, active } : null;
}

/** Pure authorization gate: denial only. It never grants fire that normal AI denied. */
export function nemesisFireAllowed(ship, state) {
  const tag = ship && ship.data && ship.data.nemesis;
  if (!tag) return true;
  const ctx = context(ship, state);
  if (!ctx) return false;
  const { active } = ctx;
  const now = finite(state.simTime);
  if (now - active.startedAt < 2 || now - active.actChangedAt < 2) return false;
  if (active.surrenderedAt != null) return false; // Whole wing honors the surrender.
  if (ship.id === active.bossId && active.retreatAt != null) return false;
  // A precommitted final-act cooling window, never invulnerability. Player weapons stay live.
  if (active.plan.chapter === 3 && active.act === 2
      && (now - active.actChangedAt) % 10 < 2) return false;
  return true;
}

/** Shape a real SG-06 request, preserving [-1,1] thruster bounds and the physics authority. */
export function shapeNemesisManeuverRequest(request, state, sensorFrame = null) {
  if (!request || !state || !state.entities || typeof state.entities.get !== 'function') return request;
  const ship = state.entities.get(request.entityId), ctx = context(ship, state);
  if (!ctx || !usablePosition(ship.pos) || !request.forceLocal) return request;
  // Collision avoidance, line escape and deadlock handling always outrank authored style.
  if (request.brake || ['escape_tether', 'clear_deadlock', 'cut_tether'].includes(request.kind)) return request;
  const { active, tag } = ctx;
  if (active.surrenderedAt != null) return shaped(request, {
    forceLocal: { forward: 0, right: 0 }, torqueYaw: 0, boost: false, brake: true,
    reason: 'nemesis:surrender', trajectory: [],
  });
  const contact = sensorFrame && Array.isArray(sensorFrame.contacts)
    && sensorFrame.contacts.find((c) => c.id === state.playerId && c.visible === true
      && c.valid !== false && c.alive !== false && finite(c.confidence, 1) >= 0.55 && usablePosition(c.pos));
  const retiring = ship.id === active.bossId && active.retreatAt != null;
  let heading;
  if (retiring) {
    // No visible target? Continue the escape heading authored at deployment, not an x-ray pursuit.
    heading = contact ? Math.atan2(ship.pos.z - contact.pos.z, ship.pos.x - contact.pos.x)
      : finite(tag.egressHeading, finite(ship.rot));
  } else {
    if (!contact || !SHAPABLE.has(request.kind)) return request;
    const kitId = tag.role === 'escort' && active.plan.secondary ? active.plan.secondary
      : active.plan.chapter === 3 ? active.plan.acts[active.act] : active.plan.primary;
    const kit = NEMESIS_KITS[kitId] || NEMESIS_KITS.open;
    if (kit.tactic === 'baseline') return request;
    const dx = contact.pos.x - ship.pos.x, dz = contact.pos.z - ship.pos.z;
    const distance = Math.hypot(dx, dz);
    if (!(distance > 1)) return request;
    const side = active.plan.side * (tag.slot === 2 ? -1 : 1);
    let vx = dx / distance, vz = dz / distance;
    if (kit.tactic === 'cross_wake') {
      const vel = contact.vel || {};
      const targetHeading = Math.hypot(finite(vel.x), finite(vel.z)) > 8
        ? Math.atan2(vel.z, vel.x) : finite(contact.rot);
      const lateralX = -Math.sin(targetHeading), lateralZ = Math.cos(targetHeading);
      // Aim for a lateral socket, never the exposed tail of a towing ship.
      vx = contact.pos.x + lateralX * side * kit.range - ship.pos.x;
      vz = contact.pos.z + lateralZ * side * kit.range - ship.pos.z;
    } else if (kit.tactic === 'wide_orbit') {
      const radial = clamp((distance - kit.range) / 220, -0.9, 0.9);
      [vx, vz] = [vx * radial - vz * side * 0.7, vz * radial + vx * side * 0.7];
    } else if (kit.tactic === 'oblique_close') {
      [vx, vz] = [vx - vz * side * 0.48, vz + vx * side * 0.48];
    } else { // Screen advance: moderate offset, no magic speed or acceleration.
      const radial = distance > kit.range ? 0.8 : -0.25;
      [vx, vz] = [vx * radial - vz * side * 0.22, vz * radial + vx * side * 0.22];
    }
    heading = Math.atan2(vz, vx);
  }
  const error = wrap(heading - finite(ship.rot));
  const forward = clamp(Math.cos(error), 0.08, retiring ? 1 : 0.82);
  const right = clamp(Math.sin(error) * 0.65, -0.65, 0.65);
  return shaped(request, {
    kind: retiring ? 'retreat' : request.kind,
    targetHeading: wrap(heading), torqueYaw: clamp(error * 1.5, -1, 1),
    forceLocal: { forward, right }, boost: false,
    trajectory: [], reason: retiring ? 'nemesis:learn_and_leave' : 'nemesis:committed_counter',
  });
}

function shaped(request, fields) {
  const out = { ...request, ...fields };
  if (request[NORMALIZED_FLAG] === true) Object.defineProperty(out, NORMALIZED_FLAG, { value: true });
  if (Object.isFrozen(request)) { Object.freeze(out.forceLocal); Object.freeze(out.trajectory); Object.freeze(out); }
  return out;
}
