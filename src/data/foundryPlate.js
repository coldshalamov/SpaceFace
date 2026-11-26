// One planar datum for the Foundry bank's visible slab and native contact faces.
// The former radius26 ball did not cover the authored 96-WU bank segment.
export function foundryPlateShape(source = {}) {
  const stored = source.data?.foundryPlate || source;
  const positive = (value, fallback) => Number.isFinite(value) && value > 0 ? value : fallback;
  const referenceRadius = positive(stored.referenceRadius, 26);
  const halfWidth = positive(stored.halfWidth, 48);
  const halfDepth = positive(stored.halfDepth, referenceRadius * 0.65);
  const halfHeight = positive(stored.halfHeight, referenceRadius * 0.08);
  const normal = source.normal;
  const rot = normal && Math.hypot(normal.x, normal.z) > 0
    ? Math.atan2(-normal.x, normal.z) : (Number.isFinite(source.rot) ? source.rot : 0);
  return { referenceRadius, halfWidth, halfDepth, halfHeight,
    radius: Math.hypot(halfWidth, halfDepth), rot };
}

export function foundryPlateProxy(shape) {
  return {
    schemaVersion: 1, id: 'foundry:bank-plate', referenceRadius: 'radius',
    flags: { collides: true, renderable: false, targetable: false, radarVisible: false },
    primitives: [{ kind: 'obb', x: 0, z: 0, angleDeg: 0,
      hx: shape.halfWidth / shape.radius, hz: shape.halfDepth / shape.radius }],
  };
}

const SIDE_SIGNS = [-1, 1];

/** Sweep the pilot's radius along its current velocity against the plate's actual planar faces. */
export function predictFoundryPlateContact(plate, pilot, horizonS) {
  const shape = plate?.data?.foundryPlate;
  const radius = pilot?.radius;
  if (!shape || !plate.pos || !pilot.pos || !pilot.vel || !(radius > 0) || !(horizonS > 0)) return null;
  const { halfWidth, halfDepth } = shape;
  const cos = Math.cos(plate.rot || 0);
  const sin = Math.sin(plate.rot || 0);
  const dx = pilot.pos.x - plate.pos.x;
  const dz = pilot.pos.z - plate.pos.z;
  const x = dx * cos + dz * sin;
  const z = -dx * sin + dz * cos;
  const vx = pilot.vel.x * cos + pilot.vel.z * sin;
  const vz = -pilot.vel.x * sin + pilot.vel.z * cos;
  if (Math.abs(x) > halfWidth + radius + Math.abs(vx) * horizonS
    || Math.abs(z) > halfDepth + radius + Math.abs(vz) * horizonS) return null;
  const gapX = Math.max(0, Math.abs(x) - halfWidth);
  const gapZ = Math.max(0, Math.abs(z) - halfDepth);
  const radiusSq = radius * radius;
  if (gapX * gapX + gapZ * gapZ <= radiusSq) return null;

  let time = Infinity;
  let normalX = 0;
  let normalZ = 0;
  for (const sign of SIDE_SIGNS) {
    if (sign * vx < 0) {
      const t = (sign * (halfWidth + radius) - x) / vx;
      if (t > 0 && t <= horizonS && t < time && Math.abs(z + vz * t) <= halfDepth) {
        time = t;
        normalX = sign;
        normalZ = 0;
      }
    }
    if (sign * vz < 0) {
      const t = (sign * (halfDepth + radius) - z) / vz;
      if (t > 0 && t <= horizonS && t < time && Math.abs(x + vx * t) <= halfWidth) {
        time = t;
        normalX = 0;
        normalZ = sign;
      }
    }
  }

  // The expanded corners are round: the bounding square would warn on a pass through empty air.
  const speedSq = vx * vx + vz * vz;
  for (const sx of SIDE_SIGNS) for (const sz of SIDE_SIGNS) {
    const rx = x - sx * halfWidth;
    const rz = z - sz * halfDepth;
    const approach = rx * vx + rz * vz;
    if (approach >= 0) continue;
    const disc = approach * approach - speedSq * (rx * rx + rz * rz - radiusSq);
    if (disc <= 0) continue;
    const t = (-approach - Math.sqrt(disc)) / speedSq;
    if (!(t > 0 && t <= horizonS && t < time)) continue;
    const cx = rx + vx * t;
    const cz = rz + vz * t;
    if (sx * cx < 0 || sz * cz < 0) continue;
    time = t;
    normalX = cx / radius;
    normalZ = cz / radius;
  }

  if (!Number.isFinite(time)) return null;
  return {
    timeToContactS: time,
    closingSpeed: -(vx * normalX + vz * normalZ),
    normal: { x: normalX * cos - normalZ * sin, z: normalX * sin + normalZ * cos },
  };
}

/** The live plate seats define the rim, including the gap between each neighboring pair. */
export function createFoundryReturnGuide(at, plates) {
  let innerEdge = Infinity;
  let outerEdge = 0;
  const gates = plates.map((plate, index) => {
    const shape = foundryPlateShape(plate);
    const c = Math.cos(shape.rot);
    const s = Math.sin(shape.rot);
    const dx = plate.pos.x - at.x;
    const dz = plate.pos.z - at.z;
    const x = Math.abs(dx * c + dz * s);
    const z = Math.abs(-dx * s + dz * c);
    innerEdge = Math.min(innerEdge, Math.hypot(Math.max(0, x - shape.halfWidth), Math.max(0, z - shape.halfDepth)));
    outerEdge = Math.max(outerEdge, Math.hypot(x + shape.halfWidth, z + shape.halfDepth));
    const next = plates[(index + 1) % plates.length];
    const pos = { x: (plate.pos.x + next.pos.x) / 2, z: (plate.pos.z + next.pos.z) / 2 };
    const angle = Math.atan2(pos.z - at.z, pos.x - at.x);
    return { pos, angle };
  });
  return { at, plates, gates, innerEdge, outerEdge };
}

function rimLineIsClear(plates, from, to, radius) {
  const sweep = { pos: from, vel: { x: to.x - from.x, z: to.z - from.z }, radius };
  return !plates.some(plate => plate.alive && plate.collides && predictFoundryPlateContact(plate, sweep, 1));
}

/** Keep the selected gap for this departure. Route outward first if a straight return meets a plate. */
export function foundryReturnCourse(guide, pilot, selectedGate = null) {
  const { at, plates, gates, innerEdge, outerEdge } = guide;
  const radius = pilot.radius;
  const clearance = radius + 8;
  const dx = pilot.pos.x - at.x;
  const dz = pilot.pos.z - at.z;
  const distance = Math.hypot(dx, dz);
  const inside = innerEdge - clearance;
  if (selectedGate ? distance <= inside : distance <= outerEdge + clearance) return null;
  const entryReach = Math.max(0, inside - 12);

  const turnStep = Math.PI / 6;
  // A 30-degree leg at this radius stays outside even at the midpoint of the turn.
  const outside = (outerEdge + clearance) / Math.cos(turnStep / 2) + 8;
  const atBearing = (angle, reach) => ({ x: at.x + Math.cos(angle) * reach, z: at.z + Math.sin(angle) * reach });
  let gate = selectedGate;
  if (!gate) {
    let nearest = Infinity;
    for (const opening of gates) {
      const d = Math.hypot(opening.pos.x - pilot.pos.x, opening.pos.z - pilot.pos.z);
      if (d >= nearest || !rimLineIsClear(plates, atBearing(opening.angle, outside), atBearing(opening.angle, entryReach), radius)) continue;
      nearest = d;
      gate = opening;
    }
  }
  if (!gate) return null;
  const entry = atBearing(gate.angle, entryReach);
  if (rimLineIsClear(plates, pilot.pos, entry, radius)) return { gate, aim: entry, throughGap: true };

  const bearing = Math.atan2(dz, dx);
  const delta = Math.atan2(Math.sin(gate.angle - bearing), Math.cos(gate.angle - bearing));
  const turn = distance < outside - 1 ? 0 : Math.max(-turnStep, Math.min(turnStep, delta));
  return { gate, aim: atBearing(bearing + turn, Math.max(distance, outside)), throughGap: false };
}
