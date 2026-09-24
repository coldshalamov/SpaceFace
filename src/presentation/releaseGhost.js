// §22 F1 — the path a lighter body will keep if the taut line is cut this instant.
// Read-only. Release does not add impulse here; the ghost is the body's live velocity.

const TAUT = new Set(['capture', 'loaded', 'overload']);
const MIN_SPEED = 8;
const SEGMENT_WU = 42;

function massOf(body) {
  const physics = body && body.physicsBody && body.physicsBody.mass;
  const authored = body && body.mass;
  const value = Number.isFinite(physics) && physics > 0 ? physics : authored;
  return Number.isFinite(value) && value > 0 ? value : 1;
}

/**
 * World-space first segment of the lighter body's post-release coast.
 * Null when the line is slack, the player is the body that will move, or the
 * body is barely moving. Never writes velocity.
 */
export function payloadReleaseGhost(state) {
  const tether = state && state.player && state.player.tether;
  if (!tether || !TAUT.has(tether.phase) || tether.targetId == null) return null;
  const entities = state.entities;
  if (!entities || typeof entities.get !== 'function') return null;
  const player = entities.get(state.playerId);
  const payload = entities.get(tether.targetId);
  if (!player || !payload || !player.pos || !payload.pos || !payload.vel) return null;
  if (!(massOf(payload) < massOf(player))) return null;
  const vx = Number(payload.vel.x);
  const vz = Number(payload.vel.z);
  if (!Number.isFinite(vx) || !Number.isFinite(vz)) return null;
  const speed = Math.hypot(vx, vz);
  if (speed < MIN_SPEED) return null;
  const dirX = vx / speed;
  const dirZ = vz / speed;
  const length = Math.min(SEGMENT_WU, speed * 0.5);
  return {
    active: true,
    payloadId: payload.id,
    x0: payload.pos.x,
    z0: payload.pos.z,
    x1: payload.pos.x + dirX * length,
    z1: payload.pos.z + dirZ * length,
    dirX,
    dirZ,
    speed,
    addsSpeed: false,
  };
}

export function writePayloadReleaseGhost(telemetry, state) {
  if (!telemetry) return null;
  const ghost = payloadReleaseGhost(state);
  telemetry.payloadReleaseGhost = ghost;
  return ghost;
}
