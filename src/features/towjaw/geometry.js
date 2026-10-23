// Deterministic XZ geometry shared by simulation, damage routing and presentation.
// The existing capital-boss functions own exact capsule/annular-sector boundary tests.
import { circleIntersectsBossShape, sweptCircleIntersectsBossShape } from '../../combat/capitalBossGeometry.js';
import { TOWJAW_ATTACKS, TOWJAW_MECHANISMS, TOWJAW_SLOTS } from './catalog.js';

const EPS = 1e-9;
const TAU = Math.PI * 2;
export const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
export const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
export const wrapAngle = value => ((value + Math.PI) % TAU + TAU) % TAU - Math.PI;
export const validPoint = p => !!p && Number.isFinite(p.x) && Number.isFinite(p.z);
export const compareIds = (a, b) => typeof a === 'number' && typeof b === 'number'
  ? a - b : String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
export const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export function localToWorld(body, offset) {
  const angle = finite(body?.rot ?? body?.heading);
  const c = Math.cos(angle), s = Math.sin(angle);
  const pos = body?.pos || body?.origin || { x: 0, z: 0 };
  return { x: finite(pos.x) + offset.x * c - offset.z * s,
    z: finite(pos.z) + offset.x * s + offset.z * c };
}

export function slotPosition(boss, slot) {
  const definition = TOWJAW_SLOTS[slot];
  return definition ? localToWorld(boss, definition) : null;
}

export function mechanismPosition(boss, key) {
  const definition = TOWJAW_MECHANISMS[key];
  return definition ? localToWorld(boss, definition) : null;
}

export function limitVector(x, z, maxLength) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return { x: 0, z: 0 };
  const length = Math.hypot(x, z);
  const scale = length > maxLength && length > 0 ? maxLength / length : 1;
  return { x: x * scale, z: z * scale };
}

/** Earliest physical plate intersection on a finite incoming segment. Missing
 * direction returns no interception: an unlocated hit must never gain armor. */
export function armorIntercept({ from, to, armor = [], ignoreId = null } = {}) {
  if (!validPoint(from) || !validPoint(to)) return null;
  const dx = to.x - from.x, dz = to.z - from.z;
  const a = dx * dx + dz * dz;
  if (a <= EPS) return null;
  let best = null;
  for (let i = 0; i < Math.min(armor.length, 6); i++) {
    const body = armor[i];
    if (!body || body.id === ignoreId || body.alive === false || !validPoint(body.pos)) continue;
    const radius = clamp(finite(body.radius, 5), 0.1, 14);
    const x = from.x - body.pos.x, z = from.z - body.pos.z;
    const b = 2 * (x * dx + z * dz), c = x * x + z * z - radius * radius;
    const discriminant = b * b - 4 * a * c;
    if (discriminant < -EPS) continue;
    const root = Math.sqrt(Math.max(0, discriminant));
    const t = c <= 0 ? 0 : (-b - root) / (2 * a);
    if (t < -EPS || t > 1 + EPS) continue;
    const clipped = clamp(t, 0, 1);
    if (!best || clipped < best.t - EPS || Math.abs(clipped - best.t) <= EPS && compareIds(body.id, best.id) < 0) {
      best = { id: body.id, t: clipped, point: { x: from.x + dx * clipped, z: from.z + dz * clipped } };
    }
  }
  return best;
}

/** A mechanism is covered only when a latched physical plate actually occludes
 * its outward approach. A nominal slot with its body dragged away is no cover. */
export function isMechanismCovered(key, model, world) {
  const boss = world?.boss;
  const mechanism = world?.mechanisms?.[key];
  const point = validPoint(mechanism?.pos) ? mechanism.pos : mechanismPosition(boss, key);
  if (!boss || !point || !validPoint(boss.pos)) return false;
  const direction = { x: point.x - boss.pos.x, z: point.z - boss.pos.z };
  const length = Math.hypot(direction.x, direction.z);
  if (!(length > 0)) return false;
  const from = { x: point.x + direction.x / length * 140, z: point.z + direction.z / length * 140 };
  const debris = world.debris || [];
  const armor = [];
  for (const plate of (model.armor || []).slice(0, 6)) {
    if (plate.status !== 'latched') continue;
    const body = debris.find(candidate => candidate.id === plate.id);
    if (body?.alive !== false && body) armor.push(body);
  }
  return armorIntercept({ from, to: point, armor }) !== null;
}

/** Commitment freezes these world-space shapes. It never tracks an evading
 * player after the warning starts. The actual hit and the warning share them. */
export function attackGeometry(kind, boss, target, side = 1) {
  const def = TOWJAW_ATTACKS[kind];
  if (!def || !validPoint(boss?.pos)) return null;
  const origin = kind === 'grapple' ? mechanismPosition(boss, 'jaw') : { x: boss.pos.x, z: boss.pos.z };
  const to = validPoint(target?.pos) ? target.pos : localToWorld(boss, { x: 100, z: 0 });
  const heading = wrapAngle(Math.atan2(to.z - origin.z, to.x - origin.x));
  const shapes = kind === 'ram' ? [{ kind: 'lane',
    a: { x: origin.x, z: origin.z },
    b: { x: origin.x + Math.cos(heading) * def.length, z: origin.z + Math.sin(heading) * def.length },
    radius: def.radius,
  }] : [{ kind: 'arc', x: origin.x, z: origin.z, heading,
    halfAngle: def.halfAngle, inner: def.inner, outer: def.outer }];
  return { origin, heading, side: side < 0 ? -1 : 1, shapes };
}

export function pointInAttack(shape, point, radius = 0) {
  if (!shape || !validPoint(point)) return false;
  return circleIntersectsBossShape(point, Math.max(0, finite(radius)), shape);
}

export function sweptInAttack(shape, from, to, radius = 0) {
  if (!shape || !validPoint(from) || !validPoint(to)) return false;
  return sweptCircleIntersectsBossShape(from, to, Math.max(0, finite(radius)), shape);
}

/** Current jaw sweep is a moving capsule within the warned arc. Testing the
 * interval endpoints plus angular interval gives deterministic 60 Hz coverage. */
export function grappleSweepShape(attack, progress, previousProgress = progress) {
  const envelope = attack?.shapes?.[0];
  if (!envelope || envelope.kind !== 'arc') return null;
  const a = clamp(previousProgress, 0, 1), b = clamp(progress, 0, 1);
  const direction = attack.side || 1;
  const start = envelope.heading + direction * (a * 2 - 1) * envelope.halfAngle;
  const end = envelope.heading + direction * (b * 2 - 1) * envelope.halfAngle;
  return { ...envelope, heading: (start + end) / 2,
    halfAngle: Math.min(envelope.halfAngle, Math.abs(end - start) / 2 + 0.055) };
}

/** Bounded, sector-relative placement. The caller must supply the named field
 * center; no global starter-spawn coordinates enter this encounter. */
export function encounterLayout(origin, heading = 0, count = 9, seed = 4242) {
  const body = { pos: validPoint(origin) ? origin : { x: 0, z: 0 }, rot: finite(heading) };
  let state = (Number(seed) >>> 0) || 1;
  const random = () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 4294967296; };
  const scrap = [];
  for (let i = 0; i < clamp(Math.floor(finite(count, 9)), 3, 12); i++) {
    const angle = i * 2.399963229728653 + (random() - 0.5) * 0.24;
    const radius = 84 + 18 * (i % 4) + random() * 12;
    const position = localToWorld(body, { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius });
    scrap.push({ ...position, mass: 8 + Math.floor(random() * 13), radius: 5.8 + random() * 1.6,
      vx: (random() - 0.5) * 2, vz: (random() - 0.5) * 2 });
  }
  return { origin: { ...body.pos }, heading: body.rot,
    mechanisms: Object.fromEntries(Object.keys(TOWJAW_MECHANISMS).map(key => [key, mechanismPosition(body, key)])), scrap };
}
