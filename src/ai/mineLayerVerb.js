// The mine-layer's area-denial verb (combat-variety vertical). Policy only: the doctrine owns
// WHEN (the `mine_drop` phase, after the `wake_mines` telegraph); this module owns the release
// geometry and cadence, and goes through the mines system's `helpers.placeMine` — the same owner
// the minefield_wake encounter uses. It never writes entities, physics, or damage directly.

const MINE_DROP_INTERVAL_TICKS = 42; // ~0.7 s between seeds across the drop line
const MINE_RELEASE_STANDOFF_WU = 10; // clear of the hull, inside the wake

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

/** The wake point: behind the hull along its motion (nose heading when barely moving). */
export function mineLayerWakePoint(entity) {
  if (!entity || !entity.pos) return null;
  const vx = finite(entity.vel && entity.vel.x);
  const vz = finite(entity.vel && entity.vel.z);
  const speed = Math.hypot(vx, vz);
  let dx;
  let dz;
  if (speed > 8) {
    dx = -vx / speed;
    dz = -vz / speed;
  } else {
    const rot = finite(entity.rot);
    dx = -Math.cos(rot);
    dz = -Math.sin(rot);
  }
  const standoff = MINE_RELEASE_STANDOFF_WU + finite(entity.radius, 8);
  return {
    x: finite(entity.pos.x) + dx * standoff,
    z: finite(entity.pos.z) + dz * standoff,
  };
}

export function applyMineLayerVerb({ state, entity, doctrinePhase, tick, placeMine }) {
  if (!state || !entity || entity.alive === false) return null;
  if (doctrinePhase !== 'mine_drop') return null;
  if (typeof placeMine !== 'function') return null;
  const data = entity.data || (entity.data = {});
  const last = Number.isFinite(data._mineLayerLastDropTick) ? data._mineLayerLastDropTick : -Infinity;
  if (tick - last < MINE_DROP_INTERVAL_TICKS) return null;
  const pos = mineLayerWakePoint(entity);
  if (!pos) return null;
  const mine = placeMine({
    ownerId: entity.id,
    pos,
    team: entity.team,
    factionId: entity.factionId || null,
    telegraph: true,
  });
  if (mine) data._mineLayerLastDropTick = tick;
  return mine;
}
