// inf-coverseek — the Coverseek elite affix (enemies that use the environment, wave-4's
// named orbit-strafe-cover slice). A marked elite swings until a room rock sits on the line
// between it and the player, then HOLDS: forward/reverse drive authority cut (flightV3
// consumes the record), yaw intact — the hull coasts its orbit behind its rock until the
// pilot flanks, lands a hit, or the rock drifts off the line.
//
// Pure geometry + a bounded life-bound record. This module owns no bus, no state writes and
// no physics: swarmElites stamps and scans, flightV3 consumes. Sim-clean: no Three.js, no
// wall clock — ticks and positions in, verdicts out.

/** Mid-range duel band: closer than this it brawls, farther it closes. */
export const SWARM_COVER_MIN_RANGE_WU = 200;
export const SWARM_COVER_MAX_RANGE_WU = 700;
/** How long one scan verdict holds before the next scan refreshes or drops it. */
export const SWARM_COVER_WINDOW_TICKS = 300;
/** Scan cadence: the rock sweep runs ~4x per second, expiry runs every tick. */
export const SWARM_COVER_SCAN_EVERY_TICKS = 15;
/** After a hit the elite brawls for this long before seeking cover again — the flush beat. */
export const SWARM_COVER_BREAK_TICKS = 240;
/** A pebble does not hide a hull: minimum rock radius the geometry will accept. */
export const SWARM_COVER_MIN_ROCK_RADIUS = 14;
/** The rock must sit between the pair, not hug either endpoint. */
const COVER_LINE_MARGIN = 0.15;
/** Cap on the loose-entityList fallback so an unindexed world cannot scan the room. */
const COVER_ROCK_CAP = 64;

/**
 * True when `rock` blocks the line from `elite` to `player`: the rock is big enough to hide
 * a hull, its center projects onto the segment inside the between-margin, and the
 * perpendicular distance is within the rock's radius plus the hull's own. Pure read.
 */
export function rockCoversLine(elite, player, rock, eliteRadius = 10) {
  if (!elite || !player || !rock || !rock.pos || !elite.pos || !player.pos) return false;
  if (!(Number(rock.radius) >= SWARM_COVER_MIN_ROCK_RADIUS)) return false;
  const dx = player.pos.x - elite.pos.x;
  const dz = player.pos.z - elite.pos.z;
  const length2 = dx * dx + dz * dz;
  if (!(length2 > 1e-6)) return false;
  const rx = rock.pos.x - elite.pos.x;
  const rz = rock.pos.z - elite.pos.z;
  const t = (rx * dx + rz * dz) / length2;
  if (t < COVER_LINE_MARGIN || t > 1 - COVER_LINE_MARGIN) return false;
  const px = elite.pos.x + dx * t;
  const pz = elite.pos.z + dz * t;
  const perp2 = (rock.pos.x - px) ** 2 + (rock.pos.z - pz) ** 2;
  const reach = Math.max(0, Number(rock.radius) || 0) + Math.max(0, eliteRadius);
  return perp2 <= reach * reach;
}

/**
 * The rock that best blocks the elite→player line, deterministic: best coverage first
 * (largest slack under the reach disc), ties broken by the lower id so the same room
 * always picks the same stone.
 */
export function findCoverRock(elite, player, rocks, eliteRadius = 10) {
  if (!Array.isArray(rocks) || rocks.length === 0) return null;
  const dx = player.pos.x - elite.pos.x;
  const dz = player.pos.z - elite.pos.z;
  const length2 = dx * dx + dz * dz;
  if (!(length2 > 1e-6)) return null;
  let best = null;
  let bestScore = -Infinity;
  for (let i = 0; i < rocks.length; i++) {
    const rock = rocks[i];
    if (!rock || rock.alive === false || !rock.pos) continue;
    if (!(Number(rock.radius) >= SWARM_COVER_MIN_ROCK_RADIUS)) continue;
    const rx = rock.pos.x - elite.pos.x;
    const rz = rock.pos.z - elite.pos.z;
    const t = (rx * dx + rz * dz) / length2;
    if (t < COVER_LINE_MARGIN || t > 1 - COVER_LINE_MARGIN) continue;
    const px = elite.pos.x + dx * t;
    const pz = elite.pos.z + dz * t;
    const perp = Math.sqrt((rock.pos.x - px) ** 2 + (rock.pos.z - pz) ** 2);
    const reach = Math.max(0, Number(rock.radius) || 0) + Math.max(0, eliteRadius);
    if (perp > reach) continue;
    const score = reach - perp;
    if (score > bestScore || (score === bestScore && best != null
      && compareIds(rock.id, best.rockId) < 0)) {
      bestScore = score;
      best = { rockId: rock.id, t, coverage: score };
    }
  }
  return best;
}

/**
 * Live cover bodies for the scan: the indexed asteroid lane when the entity index is ready,
 * else a capped walk of the loose list. The entities are returned by reference — the caller
 * reads pos/radius on its own tick, so a stale body is caught by its own alive check.
 */
export function coverRocksOf(state) {
  const index = state && state.entityIndex;
  if (index && index.__spacefaceEntityIndexV1 === true && index.ready === true
    && Array.isArray(index.asteroids)) return index.asteroids;
  const out = [];
  const list = state && state.entityList;
  if (Array.isArray(list)) {
    for (let i = 0; i < list.length && out.length < COVER_ROCK_CAP; i++) {
      const e = list[i];
      if (e && e.type === 'asteroid' && e.alive !== false) out.push(e);
    }
  }
  return out;
}

/**
 * The flight-side consumption guard: a cover record authoritatively holds a hull only while
 * its life matches the body's occupant generation and its window has not expired. swarmElites
 * writes and clears the record under run gates; flight never extends it.
 */
export function isSwarmCoverLive(cover, { tick = 0, life = null } = {}) {
  if (!cover || typeof cover !== 'object') return false;
  if (cover.life !== life) return false;
  return Number(tick) < Number(cover.until);
}

function compareIds(a, b) {
  if (Number.isFinite(a) && Number.isFinite(b)) return a - b;
  const sa = String(a);
  const sb = String(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}
