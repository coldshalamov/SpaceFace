// Spawn-time scenery for explicitly temporary circuit flights. Campaign sector objects
// are never registered, and no actor is deleted or moved after it enters the world.
import { RACE_LEVELS } from '../data/raceLevels.js';
import { RACING_CIRCUIT_LAYOUTS } from '../data/racingCircuitLayouts.js';
import { sectorGlobalOrigin } from '../data/sectorCoordinates.js';
import { asteroidColliderRadius } from '../data/asteroidColliders.js';
import { hash32 } from '../core/rng.js';

const sessions = new WeakMap();
const registeredSectors = new WeakMap();
const levels = new Map(RACE_LEVELS.map(level => [level.sectorId, level]));
const finitePoint = p => p && Number.isFinite(p.x) && Number.isFinite(p.z);
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

export function isRacingCorridorSession(state) {
  const session = state && sessions.get(state);
  return !!session && session.sectors.some(sector => state.world?.sectors?.[sector.id] === sector);
}

/** Call after fresh world.newGame(), before its first materialization; false on restore. */
export function configureRacingCorridorSession(state, enabled) {
  if (!state || typeof state !== 'object') return;
  const previous = sessions.get(state);
  if (previous) for (const sector of previous.sectors) registeredSectors.delete(sector);
  sessions.delete(state);
  if (enabled !== true) return;
  const session = { state, sectors: [], plans: new Map(), opticOffsets: new Map() };
  for (const sector of Object.values(state.world?.sectors || {})) {
    if (!sector || !levels.has(sector.id)) continue;
    session.sectors.push(sector);
    session.plans.set(sector.id, racingCorridorPlan(sector.id));
    registeredSectors.set(sector, session);
  }
  sessions.set(state, session);
}

function closestOnSegment(pos, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const length2 = dx * dx + dz * dz;
  const t = length2 > 0 ? clamp(((pos.x - a.x) * dx + (pos.z - a.z) * dz) / length2, 0, 1) : 0;
  const x = a.x + dx * t, z = a.z + dz * t;
  return { x, z, distance: Math.hypot(pos.x - x, pos.z - z) };
}

/** Includes the approach behind the grid as well as every closing/lap segment. */
export function racingCorridorPlan(sectorId) {
  const level = levels.get(sectorId), layout = RACING_CIRCUIT_LAYOUTS[sectorId];
  if (!level || !layout) return null;
  const course = level.course, origin = sectorGlobalOrigin(sectorId);
  const gates = course.gates.map(p => ({ x: p.x + origin.x, z: p.z + origin.z }));
  const segments = gates.slice(1).map((b, i) => ({ a: gates[i], b }));
  const first = segments[0], length = Math.hypot(first.b.x - first.a.x, first.b.z - first.a.z);
  const grid = {
    x: first.a.x - (first.b.x - first.a.x) / length * 240,
    z: first.a.z - (first.b.z - first.a.z) / length * 240,
  };
  return {
    sectorId, courseId: course.courseId, layout, origin, gates, segments,
    keepouts: [...segments, { a: grid, b: gates[0] }],
    halfWidthWU: course.gateRadiusWU + layout.hullRadiusWU,
    grid,
  };
}

/** Clearance is for the complete body, not only its center. */
export function clearsRacingCorridor(plan, pos, radius = 0) {
  if (!plan || !finitePoint(pos) || !Number.isFinite(radius) || radius < 0) return false;
  const clearance = plan.halfWidthWU + radius;
  return plan.keepouts.every(({ a, b }) => closestOnSegment(pos, a, b).distance >= clearance - 1e-6);
}

function outsidePoint(plan, original, radius, salt) {
  if (clearsRacingCorridor(plan, original, radius)) return { ...original };
  let closest = null;
  for (const segment of plan.keepouts) {
    const p = closestOnSegment(original, segment.a, segment.b);
    if (!closest || p.distance < closest.distance) closest = { ...p, segment };
  }
  const { a, b } = closest.segment;
  const length = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  const nx = -(b.z - a.z) / length, nz = (b.x - a.x) / length;
  const side = ((original.x - closest.x) * nx + (original.z - closest.z) * nz) < 0 ? -1 : 1;
  for (let attempt = 0; attempt < 64; attempt++) {
    const sign = (attempt & 1) ? -side : side;
    const offset = plan.halfWidthWU + radius + plan.layout.shoulderWU + Math.floor(attempt / 2) * 36;
    const pos = { x: closest.x + nx * offset * sign, z: closest.z + nz * offset * sign };
    if (clearsRacingCorridor(plan, pos, radius)) return pos;
  }
  // A dense self-overlap still has an exterior. This bounded skirt preserves the body
  // rather than accepting an unchecked point or deleting scenery to make a test pass.
  const reach = Math.max(...plan.gates.map(p => Math.hypot(p.x - plan.origin.x, p.z - plan.origin.z)))
    + plan.halfWidthWU + radius + 160;
  const angle = (hash32(String(salt)) >>> 0) / 4294967296 * Math.PI * 2;
  return { x: plan.origin.x + Math.cos(angle) * reach, z: plan.origin.z + Math.sin(angle) * reach };
}

/** Solid table props also use this membrane; kit/aftermath rows bypass the field arranger. */
export function racingDressingSpec(state, spec) {
  if (spec?.collides !== true || !finitePoint(spec.pos)) return spec;
  const session = sessions.get(state);
  const sectorId = spec.homeSectorId || spec.data?.homeSectorId || spec.data?.sectorId;
  const sector = state.world?.sectors?.[sectorId];
  if (!session || registeredSectors.get(sector) !== session) return spec;
  const plan = session.plans.get(sectorId);
  const radius = Math.max(0.5, Number(spec.radius) || 10);
  if (!plan || clearsRacingCorridor(plan, spec.pos, radius)) return spec;
  return { ...spec, pos: outsidePoint(plan, spec.pos, radius, spec.data?.placeId || 'prop') };
}

/** Seeded optic lattices arrive after the normal field pass. Keep every cell's
 * relative pose by moving the whole bounded scatter motif with one translation. */
export function racingAsteroidSpec(state, spec) {
  if (!finitePoint(spec?.pos)) return spec;
  const session = sessions.get(state);
  const sectorId = spec.homeSectorId || spec.data?.homeSectorId;
  if (!session || registeredSectors.get(state.world?.sectors?.[sectorId]) !== session) return spec;
  const plan = session.plans.get(sectorId);
  if (!plan) return spec;
  const group = spec.data?.opticStructureId;
  if (typeof group === 'string' && group.startsWith('scatter:')) {
    let offset = session.opticOffsets.get(group);
    if (!offset) {
      // The source scatter recipes are at most four wick cells plus one cap,
      // on a 64-WU lattice. Six spacings contain every cell and its stone skin.
      const placed = outsidePoint(plan, spec.pos, 6 * 64, group);
      offset = { x: placed.x - spec.pos.x, z: placed.z - spec.pos.z };
      session.opticOffsets.set(group, offset);
    }
    return offset.x === 0 && offset.z === 0 ? spec
      : { ...spec, pos: { x: spec.pos.x + offset.x, z: spec.pos.z + offset.z } };
  }
  const radius = asteroidColliderRadius(spec.data?.typeId, spec.radius);
  if (clearsRacingCorridor(plan, spec.pos, radius)) return spec;
  return { ...spec, pos: outsidePoint(plan, spec.pos, radius, spec.data?.fieldId || 'rock') };
}

/** Existing world's arranger interface; active only for explicitly registered sector objects. */
export function createRacingCorridorArranger(sector, options = {}) {
  const session = sector && registeredSectors.get(sector);
  if (!session) return null;
  const plan = session.plans.get(sector.id);
  if (!plan) return null;
  const peers = [];
  for (const station of options.active?.stations || []) {
    if (finitePoint(station.pos)) peers.push({ pos: station.pos, radius: 150 });
  }
  for (const poi of sector.pois || []) {
    if (finitePoint(poi.pos)) peers.push({
      pos: { x: poi.pos.x + plan.origin.x, z: poi.pos.z + plan.origin.z },
      radius: Math.max(24, Number(poi.placeTargetRadius) || Number(poi.visualRadius) || (poi.runtimeOwner ? 100 : 24)),
    });
  }
  const stats = { placed: 0, moved: 0, skirts: 0 };
  const peerClear = (pos, radius) => peers.every(row => Math.hypot(pos.x - row.pos.x, pos.z - row.pos.z) >= radius + row.radius + 8);
  const reserve = (pos, radius) => { if (finitePoint(pos) && Number.isFinite(radius)) peers.push({ pos: { ...pos }, radius }); };
  return {
    profile: plan.layout,
    keepouts: plan.keepouts,
    createField(fdef) {
      const legs = plan.layout.fields[fdef.id] || plan.segments.map((_, i) => i);
      return {
        place(original, bodyRadius, slotIndex) {
          const radius = asteroidColliderRadius(fdef.type, bodyRadius);
          const seed = hash32(fdef.id, slotIndex, original.x, original.z) >>> 0;
          for (let attempt = 0; attempt < 96; attempt++) {
            const leg = legs[(slotIndex + Math.floor(attempt / 8)) % legs.length] % plan.segments.length;
            const { a, b } = plan.segments[leg];
            const length = Math.hypot(b.x - a.x, b.z - a.z);
            const t = 0.12 + (((seed % 65521) / 65521 + attempt * 0.381966) % 1) * 0.76;
            const side = ((slotIndex + attempt) & 1) ? -1 : 1;
            const depth = plan.layout.shoulderWU + ((seed >>> 16) % 97) / 97 * plan.layout.edgeDepthWU
              + Math.floor(attempt / 16) * (radius * 2 + 20);
            const offset = (plan.halfWidthWU + radius + depth) * side;
            const pos = { x: a.x + (b.x - a.x) * t - (b.z - a.z) / length * offset,
              z: a.z + (b.z - a.z) * t + (b.x - a.x) / length * offset };
            if (!clearsRacingCorridor(plan, pos, radius) || !peerClear(pos, radius)) continue;
            reserve(pos, radius); stats.placed++; stats.moved++;
            return pos;
          }
          // Preserve the existing object budget. Unusually crowded banks use the safe
          // exterior; the centerline and start grid never inherit scatter as a fallback.
          let pos = outsidePoint(plan, original, radius + 80, seed);
          for (let attempt = 0; !peerClear(pos, radius) && attempt < 64; attempt++) {
            const angle = (seed / 4294967296 + attempt * 0.381966) * Math.PI * 2;
            const reach = 3000 + attempt * (radius * 2 + 12);
            pos = { x: plan.origin.x + Math.cos(angle) * reach, z: plan.origin.z + Math.sin(angle) * reach };
          }
          reserve(pos, radius); stats.placed++; stats.skirts++;
          return pos;
        },
        reserveRestored: reserve,
      };
    },
    placeProp(placeId, pos, radius, rot = 0) {
      return { pos: outsidePoint(plan, pos, radius, placeId), rot };
    },
    reserve,
    summary: () => ({ ...stats }),
  };
}
