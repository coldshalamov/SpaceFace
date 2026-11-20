/**
 * SWITCHBACK's freight corridor. Geometry is data, never Three.js objects.
 * Distance is arc length in world units; the first/last tangent extends the track
 * so trailing cars can be initialized without wrapping or piling up at the end.
 */

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
const SEGMENTS_PER_SPAN = 24;

export function mixConvoySeed(seed, salt = 0) {
  let h = ((Number.isFinite(seed) ? seed : 4242) >>> 0) ^ (salt >>> 0);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return (h ^ (h >>> 16)) >>> 0;
}

function spline(a, b, c, d, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2
    + (-a + 3 * b - 3 * c + d) * t3);
}

/** Build one bounded, seeded open corridor. Optional receivers are real world positions. */
export function createConvoyRoute({ seed = 4242, origin = { x: -1500, z: -700 }, heading = 0.1,
  lawfulReceiver = null, illicitReceiver = null } = {}) {
  const config = {
    seed: finite(seed, 4242) >>> 0,
    origin: { x: clamp(finite(origin?.x, -1500), -1e7, 1e7), z: clamp(finite(origin?.z, -700), -1e7, 1e7) },
    heading: Math.atan2(Math.sin(finite(heading, 0.1)), Math.cos(finite(heading, 0.1))),
  };
  // Gently different bends, identical topology. No branch can intersect itself.
  const variation = (mixConvoySeed(config.seed, 8103) / 0xffffffff - 0.5) * 70;
  const local = [[0, 0], [260, -35], [560, 80 + variation], [820, 210 + variation],
    [1100, 160], [1400, -70 - variation], [1710, -140], [2010, -40], [2350, 90]];
  const cs = Math.cos(config.heading), sn = Math.sin(config.heading);
  const controlPoints = local.map(([x, z]) => ({
    x: config.origin.x + cs * x - sn * z,
    z: config.origin.z + sn * x + cs * z,
  }));
  const points = [];
  let distance = 0;
  for (let span = 0; span < controlPoints.length - 1; span++) {
    const b = controlPoints[span], c = controlPoints[span + 1];
    const a = controlPoints[span - 1] || { x: 2 * b.x - c.x, z: 2 * b.z - c.z };
    const d = controlPoints[span + 2] || { x: 2 * c.x - b.x, z: 2 * c.z - b.z };
    for (let step = span === 0 ? 0 : 1; step <= SEGMENTS_PER_SPAN; step++) {
      const t = step / SEGMENTS_PER_SPAN;
      const point = { x: spline(a.x, b.x, c.x, d.x, t), z: spline(a.z, b.z, c.z, d.z, t) };
      const previous = points[points.length - 1];
      if (previous) distance += Math.hypot(point.x - previous.x, point.z - previous.z);
      points.push({ ...point, distance });
    }
  }
  const route = { schemaVersion: 1, config, controlPoints, points, length: distance,
    forkDistance: distance * 0.63, fork: null, receivers: null };
  const junction = sampleRoute(route, route.forkDistance);
  // A side branch, not a magic collection radius laid over the main line. A car
  // must leave the convoy corridor and cross the gate in the outward direction.
  const branchAngle = junction.angle + 0.95;
  const nx = Math.cos(branchAngle), nz = Math.sin(branchAngle);
  route.fork = { x: junction.x + nx * 130, z: junction.z + nz * 130,
    nx, nz, halfWidth: 65, junctionX: junction.x, junctionZ: junction.z };
  const endpoint = sampleRoute(route, distance);
  route.receivers = {
    lawful: { x: endpoint.x, z: endpoint.z, radius: 65 },
    illicit: { x: junction.x + nx * 420, z: junction.z + nz * 420, radius: 50 },
  };
  for (const [key, override] of [['lawful', lawfulReceiver], ['illicit', illicitReceiver]]) {
    if (override && Number.isFinite(override.x) && Number.isFinite(override.z)
      && Math.abs(override.x) <= 1e7 && Math.abs(override.z) <= 1e7) {
      route.receivers[key] = { x: override.x, z: override.z,
        radius: clamp(finite(override.radius, route.receivers[key].radius), 12, 100) };
      config[`${key}Receiver`] = { ...route.receivers[key] };
    }
  }
  return route;
}

function segmentSample(a, b, distance) {
  const length = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  const tx = (b.x - a.x) / length, tz = (b.z - a.z) / length;
  const offset = distance - a.distance;
  return { x: a.x + tx * offset, z: a.z + tz * offset,
    angle: Math.atan2(tz, tx), tx, tz, distance };
}

/** O(log n), with continuous tangent extension outside the authored route. */
export function sampleRoute(route, distance = 0) {
  if (!route?.points || route.points.length < 2) throw new TypeError('Invalid SWITCHBACK route');
  const points = route.points;
  const s = finite(distance);
  if (s <= 0) return segmentSample(points[0], points[1], s);
  if (s >= route.length) return segmentSample(points[points.length - 2], points[points.length - 1], s);
  let low = 0, high = points.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >>> 1;
    if (points[middle].distance <= s) low = middle; else high = middle;
  }
  return segmentSample(points[low], points[high], s);
}

/**
 * Nearest point on the bounded corridor (<=192 spans). A previous distance only
 * breaks exact geometric ties; it never drags a body onto the track.
 */
export function projectRoute(route, point, hintDistance = 0) {
  if (!Number.isFinite(point?.x) || !Number.isFinite(point?.z)) return null;
  let best = null;
  const points = route.points;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const dx = b.x - a.x, dz = b.z - a.z, ll = dx * dx + dz * dz;
    const t = ll > 1e-12 ? clamp(((point.x - a.x) * dx + (point.z - a.z) * dz) / ll, 0, 1) : 0;
    const x = a.x + dx * t, z = a.z + dz * t;
    const d2 = (point.x - x) ** 2 + (point.z - z) ** 2;
    const distance = a.distance + (b.distance - a.distance) * t;
    if (!best || d2 < best.distanceSquared - 1e-9
      || (Math.abs(d2 - best.distanceSquared) <= 1e-9
        && Math.abs(distance - hintDistance) < Math.abs(best.distance - hintDistance))) {
      const len = Math.sqrt(ll) || 1, tx = dx / len, tz = dz / len;
      best = { x, z, tx, tz, angle: Math.atan2(tz, tx), distance,
        lateral: (point.x - x) * -tz + (point.z - z) * tx, distanceSquared: d2 };
    }
  }
  return best;
}

/** A directed finite gate intersection, robust to high speed between sim ticks. */
export function crossesExtractionFork(route, before, after, radius = 0) {
  const gate = route?.fork;
  if (!gate || ![before?.x, before?.z, after?.x, after?.z].every(Number.isFinite)) return false;
  const d0 = (before.x - gate.x) * gate.nx + (before.z - gate.z) * gate.nz;
  const d1 = (after.x - gate.x) * gate.nx + (after.z - gate.z) * gate.nz;
  if (d0 > 0 || d1 <= 0 || d1 <= d0) return false;
  const t = -d0 / (d1 - d0);
  const x = before.x + (after.x - before.x) * t, z = before.z + (after.z - before.z) * t;
  const lateral = (x - gate.x) * -gate.nz + (z - gate.z) * gate.nx;
  return Math.abs(lateral) + Math.max(0, finite(radius)) <= gate.halfWidth;
}
