// inf-well-dive — the Diver elite affix's geometry (enemies that use the environment, the
// reserved commit-through slice). A marked elite closing on the pilot dives THROUGH a room
// pull instead of around it: the scan finds the live well-kind field whose disc the
// elite→player line genuinely crosses, swarmElites stamps a bounded life-bound commit, and
// flightV3 steers the approach at the well until the grip takes over — full drive authority
// stays, because the commit IS the trick: thrust through the pull arrives hot and bent, guns
// live. Where Coverseek holds behind a stone and the Rider drifts, a Diver commits.
//
// Pure geometry + a bounded kernel read. This module owns no bus, no state writes and no
// physics: fields and positions in, verdicts out. Sim-clean: no Three.js, no wall clock —
// ticks and simTime-shaped numbers only.

/** The crossing must sit between the pair, not hug either endpoint. */
export const SWARM_DIVE_LINE_MARGIN = 0.12;
/** A line that only kisses the rim is not a dive: it must pierce this deep into the disc. */
export const SWARM_DIVE_CROSS_FRAC = 0.85;
/** Cap on the kernel read so an unbounded field cache cannot sweep the room. */
export const SWARM_DIVE_PULL_CAP = 8;

const WELL_KIND = 'well';

/**
 * The live pull fields a dive can commit through: the kernel's own cached records, filtered
 * to well-kind pulls whose lifetime covers `now` and whose geometry is usable. Read-only —
 * the records are the kernel's live cache and must not be stored or mutated.
 */
export function livePullsOf(fieldsSystem, now) {
  if (!fieldsSystem || typeof fieldsSystem.kernelList !== 'function') return [];
  const list = fieldsSystem.kernelList();
  if (!Array.isArray(list)) return [];
  const out = [];
  for (let i = 0; i < list.length && out.length < SWARM_DIVE_PULL_CAP; i++) {
    const field = list[i];
    if (!field || field.kind !== WELL_KIND) continue;
    if (!(Number(field.expireAt) > now)) continue;
    const center = field.center;
    if (!center || !Number.isFinite(center.x) || !Number.isFinite(center.z)) continue;
    if (!(Number(field.radius) > 0)) continue;
    out.push(field);
  }
  return out;
}

/**
 * True when the elite→player line genuinely dives through `field`: the well's center
 * projects onto the segment inside the between-margin, and the perpendicular distance
 * pierces SWARM_DIVE_CROSS_FRAC of the disc's radius. Pure read.
 */
export function linePiercesPull(elite, player, field) {
  if (!elite || !player || !field || !elite.pos || !player.pos || !field.center) return false;
  const radius = Number(field.radius);
  if (!(radius > 0)) return false;
  const dx = player.pos.x - elite.pos.x;
  const dz = player.pos.z - elite.pos.z;
  const length2 = dx * dx + dz * dz;
  if (!(length2 > 1e-6)) return false;
  const wx = field.center.x - elite.pos.x;
  const wz = field.center.z - elite.pos.z;
  const t = (wx * dx + wz * dz) / length2;
  if (t < SWARM_DIVE_LINE_MARGIN || t > 1 - SWARM_DIVE_LINE_MARGIN) return false;
  const px = elite.pos.x + dx * t;
  const pz = elite.pos.z + dz * t;
  const perp2 = (field.center.x - px) ** 2 + (field.center.z - pz) ** 2;
  const pierce = radius * SWARM_DIVE_CROSS_FRAC;
  return perp2 <= pierce * pierce;
}

/**
 * The pull the elite's closing line dives through best, deterministic: deepest pierce first
 * (largest slack under the pierced disc), ties broken by the lower id so the same room always
 * commits through the same well.
 */
export function findDivePull(elite, player, pulls) {
  if (!Array.isArray(pulls) || pulls.length === 0) return null;
  const dx = player.pos.x - elite.pos.x;
  const dz = player.pos.z - elite.pos.z;
  const length2 = dx * dx + dz * dz;
  if (!(length2 > 1e-6)) return null;
  let best = null;
  let bestScore = -Infinity;
  for (let i = 0; i < pulls.length; i++) {
    const field = pulls[i];
    if (!field || !field.center) continue;
    const radius = Number(field.radius);
    if (!(radius > 0)) continue;
    const wx = field.center.x - elite.pos.x;
    const wz = field.center.z - elite.pos.z;
    const t = (wx * dx + wz * dz) / length2;
    if (t < SWARM_DIVE_LINE_MARGIN || t > 1 - SWARM_DIVE_LINE_MARGIN) continue;
    const px = elite.pos.x + dx * t;
    const pz = elite.pos.z + dz * t;
    const perp = Math.sqrt((field.center.x - px) ** 2 + (field.center.z - pz) ** 2);
    const pierce = radius * SWARM_DIVE_CROSS_FRAC;
    if (perp > pierce) continue;
    const score = pierce - perp;
    if (score > bestScore || (score === bestScore && best != null
      && compareIds(field.id, best.fieldId) < 0)) {
      bestScore = score;
      best = { fieldId: field.id, cx: field.center.x, cz: field.center.z, radius, t };
    }
  }
  return best;
}

function compareIds(a, b) {
  if (Number.isFinite(a) && Number.isFinite(b)) return a - b;
  const sa = String(a);
  const sb = String(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}
