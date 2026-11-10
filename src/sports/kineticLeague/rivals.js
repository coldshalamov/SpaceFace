// Four keeper/rival behaviors. Each one is a force on a real body.
// Difficulty is read timing and commit, never hull or damage.

import { clamp } from './geometry.js';

function pd(body, targetX, targetZ, mass, maxAccel, gain) {
  const fx = clamp((targetX - body.x) * gain - body.vx * 5.5, -maxAccel, maxAccel) * mass;
  const fz = clamp((targetZ - body.z) * 7 - body.vz * 5, -maxAccel * 0.65, maxAccel * 0.65) * mass;
  return { fx, fz };
}

function ensure(session) {
  if (!session.rival) session.rival = { phase: 'watch', until: 0, targetX: 0, nextRead: 0, dir: 0, commitUntil: 0 };
  return session.rival;
}

/** Holds the tagged post. Counterplay: take the open side. Shooting into the wall is a save. */
export function wallForce(body, session) {
  const home = session.arena.keeper;
  return pd(body, -16, home.z, body.mass, 78, 11);
}

/** Commits to a lateral direction and cannot reverse until the lock expires. */
export function shadeForce(body, session) {
  const ball = session.bodies.find((b) => b.role === 'ball' && b.alive);
  const state = ensure(session);
  const homeZ = session.arena.keeper.z;
  if (ball && session.simTime >= state.commitUntil) {
    state.dir = ball.x >= body.x ? 1 : -1;
    state.commitUntil = session.simTime + 0.55;
    state.targetX = clamp(body.x + state.dir * 18, -20, 20);
  }
  return pd(body, state.targetX || -10, homeZ, body.mass, 70, 9);
}

/**
 * Bracket telegraph: read, tell, then dash. A fast shot finishes during the tell.
 * A slow shot down the read is met on the line.
 */
export function watchForce(body, session) {
  const ball = session.bodies.find((b) => b.role === 'ball' && b.alive);
  const state = ensure(session);
  const home = session.arena.keeper;
  const now = session.simTime;
  if (state.phase === 'tell' && now >= state.until) {
    state.phase = 'dash';
    state.until = now + 0.72;
  } else if (state.phase === 'dash' && now >= state.until) {
    state.phase = 'recover';
    state.until = now + 0.85;
  } else if (state.phase === 'recover' && now >= state.until) {
    state.phase = 'watch';
    state.targetX = 0;
  }
  if (state.phase === 'watch' && ball && now >= state.nextRead && ball.vz < -8) {
    state.nextRead = now + 0.22;
    const eta = (home.z - ball.z) / ball.vz;
    if (Number.isFinite(eta) && eta > 0 && eta < 2.4) {
      state.targetX = clamp(ball.x + ball.vx * eta * 0.92, -18, 18);
      state.phase = 'tell';
      state.until = now + 1.25;
    }
  }
  const targetX = state.phase === 'tell' ? body.x : (state.targetX || 0);
  const accel = state.phase === 'dash' ? 110 : 64;
  return pd(body, targetX, home.z, body.mass, accel, state.phase === 'dash' ? 14 : 8);
}

/** Leaves the cradle and runs at the payload. Counterplay: release while it is upfield. */
export function chargeForce(body, session) {
  const payload = session.bodies.find((b) => b.role === 'payload' && b.alive);
  const home = session.arena.charge;
  // Shades the right-hand lane. A payload that stays left of x=4 is the counterplay;
  // one that crosses into the right lane is hunted and the handoff is stolen.
  if (!payload || payload.z < -36 || payload.x < 4) return pd(body, home.x, home.z, body.mass, 70, 8);
  return pd(body, Math.max(8, payload.x), payload.z, body.mass, 100, 10);
}

const FORCES = Object.freeze({
  wall: wallForce,
  shade: shadeForce,
  watch: watchForce,
  charge: chargeForce,
});

export const RIVAL_IDS = Object.freeze(Object.keys(FORCES));

export function rivalForceFor(id) {
  return FORCES[id] || null;
}

export function describeRival(id) {
  switch (id) {
    case 'wall':
      return 'Holds one post. The other side of the aperture is the shot.';
    case 'shade':
      return 'Commits to a lateral read and cannot reverse until the lock ends.';
    case 'watch':
      return 'Telegraphs, then dashes. A ball that arrives during the tell is free.';
    case 'charge':
      return 'Abandons the cradle to chase the payload. A side release scores behind it.';
    default:
      return '';
  }
}
