// Swarm arrival geometry and per-wave first-act admission. Placement never writes velocity.
// While the pilot waits, canonical damage/fuse owners hold harm; bodies keep their motion
// and resume ordinary damage after the act. The geometry tests below never park a body.
export const SWARM_ARRIVAL_GRACE_S = 2.5;
export const SWARM_SPAWN_LOOKAHEAD_S = 0.75;
export const SWARM_SPAWN_RETRY_TICKS = 30;
const SOLIDS = new Set(['asteroid', 'wreck', 'station', 'ship', 'drone']);
const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;

/** Closest approach of two discs over the next horizon seconds (XZ world units). */
export function sweptDiscsOverlap(pos, radius, other, {
  horizon = SWARM_SPAWN_LOOKAHEAD_S, clearance = 8, velocity = null,
} = {}) {
  if (!other || other.alive === false || other.collides === false || !other.pos) return false;
  const rx = finite(other.pos.x) - pos.x;
  const rz = finite(other.pos.z) - pos.z;
  const vx = finite(other.vel?.x) - finite(velocity?.x);
  const vz = finite(other.vel?.z) - finite(velocity?.z);
  const speed2 = vx * vx + vz * vz;
  const t = speed2 > 1e-12
    ? Math.max(0, Math.min(Math.max(0, finite(horizon)), -(rx * vx + rz * vz) / speed2)) : 0;
  const dx = rx + vx * t;
  const dz = rz + vz * t;
  const reach = Math.max(0, finite(radius)) + Math.max(0, finite(other.radius, 10))
    + Math.max(0, finite(clearance));
  return dx * dx + dz * dz < reach * reach;
}

/** All live solid occupants, including the pilot and same-tick arrivals, are obstacles. */
export function swarmPlacementIsClear(state, pos, radius, options = {}) {
  if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)
    || !Number.isFinite(radius) || radius < 0) return false;
  const occupants = state?.entities && typeof state.entities.values === 'function'
    ? state.entities.values() : (state?.entityList || []);
  for (const entity of occupants) {
    if (!entity || (!SOLIDS.has(entity.type)
      && !(entity.physicsBody?.schemaVersion === 1 && entity.physicsBody.material !== 'massline_sensor'))) continue;
    if (sweptDiscsOverlap(pos, radius, entity, options)) return false;
  }
  for (const entity of options.reserved || []) {
    if (sweptDiscsOverlap(pos, radius, entity, options)) return false;
  }
  return true;
}

/**
 * Deterministic bounded search near the intended gate. A blocked gate returns null;
 * it never manufactures a collision, jumps through the player, or hides a ship kilometres away.
 * Search changes neither the RNG stream nor any existing body's position/velocity.
 */
export function findSwarmArrival(state, proposed, radius, options = {}) {
  if (!proposed || !Number.isFinite(proposed.x) || !Number.isFinite(proposed.z)
    || !Number.isFinite(radius) || radius < 0) return null;
  const player = state?.entities?.get?.(state.playerId);
  const anchor = player?.pos || { x: 0, z: 0 };
  const dx = proposed.x - finite(anchor.x);
  const dz = proposed.z - finite(anchor.z);
  const initial = Math.hypot(dx, dz);
  const floor = Math.max(72, finite(player?.radius, 6) + radius + 32);
  const ring = Math.max(initial, floor);
  const angle = Math.atan2(dz, dx);
  if (initial >= floor && swarmPlacementIsClear(state, proposed, radius, options)) {
    return { x: proposed.x, z: proposed.z };
  }
  // Preserve throw-shaped packs when only a neighbour blocks the proposed point.
  // Search their authored disc first; actual terrain may still require a wider gate berth.
  const center = options.clusterCenter;
  const clusterRadius = finite(options.clusterRadius);
  if (center && Number.isFinite(center.x) && Number.isFinite(center.z) && clusterRadius > 0) {
    for (let sample = 0; sample < 64; sample++) {
      const localAngle = angle + sample * 2.399963229728653; // golden-angle disc samples
      const r = clusterRadius * Math.sqrt(sample / 63);
      const pos = { x: center.x + Math.cos(localAngle) * r, z: center.z + Math.sin(localAngle) * r };
      if (Math.hypot(pos.x - finite(anchor.x), pos.z - finite(anchor.z)) < floor) continue;
      if (swarmPlacementIsClear(state, pos, radius, options)) return pos;
    }
  }
  // Nine radii, nine bearings. Keep the arrival within +/-22.5 degrees of its tell.
  for (let radial = 0; radial < 9; radial++) {
    for (let lane = 0; lane < 9; lane++) {
      const turn = (lane % 2 ? 1 : -1) * Math.ceil(lane / 2) * Math.PI / 32;
      const r = ring + radial * 24;
      const pos = { x: finite(anchor.x) + Math.cos(angle + turn) * r,
        z: finite(anchor.z) + Math.sin(angle + turn) * r };
      if (swarmPlacementIsClear(state, pos, radius, options)) return pos;
    }
  }
  return null;
}

// Per-wave pilot latch. Held on the state object, never on state.run: survivalWave
// must not write the run record. A new wave number forgets the previous act, so a
// round cannot be won, or shot through, on the last round's thrust. A save/load
// re-arms the opener until the next pilot act — a fresh boot is a fresh opener,
// and a playing pilot re-acts on the next tick, so nothing observable is lost.
const _pilotActedWave = new WeakMap();

function liveSwarmFight(state) {
  const run = state && state.run;
  if (!run || run.kind !== 'survival' || run.ruleset !== 'swarm') return null;
  if (run.phase !== 'active' || !Number.isInteger(run.wave)) return null;
  return run;
}

/** True unless a live swarm round is waiting on this wave's first pilot act. No swarm run counts as already acting, so headless fire-roster checks keep their cap. */
export function swarmPilotHasActed(state) {
  const run = liveSwarmFight(state);
  if (!run) return true;
  return _pilotActedWave.get(state) === run.wave;
}

export function noteSwarmPilotAction(state) {
  const run = liveSwarmFight(state);
  if (!run) return;
  _pilotActedWave.set(state, run.wave);
}

/**
 * A trigger pull, physical verb, boost, brake, or a real stick. autoFire is combat-stick mode:
 * followAutoTargetPath writes moveX/moveZ/turnIntent every tick, so those axes
 * do not count while autoFire is on. An idle pilot who left the stick on auto
 * has not acted. Input-owned drawFlightManual distinguishes real device controls
 * from those assist axes. Explicit physical verbs still count. Threshold matches
 * flight.js hasManualFlightInput.
 */
export function swarmPilotIsActing(state) {
  const input = state && state.input;
  if (!input) return false;
  if (input.fire === true) return true;
  if (input.boost || input.brake) return true;
  const actions = input.actions;
  if (actions && (actions.tetherFire || actions.tetherCut || actions.chargeThrow
    || actions.chargeDetonate || actions.dropBomb || actions.gyreSnare || actions.throwArm
    || actions.deployWell || actions.deployRepulsor || actions.deployMassSeed
    || Math.abs(actions.reelDelta || 0) > 0.08)) return true;
  if (input.drawFlightManual === true) return true;
  if (input.autoFire) return false;
  return Math.abs(input.moveX || 0) > 0.08
    || Math.abs(input.moveZ || 0) > 0.08
    || Math.abs(input.turnIntent || 0) > 0.08;
}
