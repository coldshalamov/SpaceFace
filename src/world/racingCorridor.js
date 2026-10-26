// Spawn-time scenery for explicitly temporary circuit flights. Campaign sector objects
// are never registered, and no actor is deleted or moved after it enters the world.
import { RACING_CIRCUITS } from '../data/raceLevels.js';
import { RACING_CIRCUIT_LAYOUTS } from '../data/racingCircuitLayouts.js';
import { sectorGlobalOrigin } from '../data/sectorCoordinates.js';
import { asteroidColliderRadius } from '../data/asteroidColliders.js';
import { hash32 } from '../core/rng.js';

const sessions = new WeakMap();
const registeredSectors = new WeakMap();
// AL-RACE-2: the corridor serves the whole nine-course catalog, not only the
// original three. One circuit lives in each sector, so sectorId still keys the map.
const levels = new Map(RACING_CIRCUITS.map(level => [level.sectorId, level]));
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
  const level = levels.get(sectorId);
  const layout = level && (level.layout || RACING_CIRCUIT_LAYOUTS[sectorId]);
  const course = level && level.course;
  // No plan for an unusable course: fewer than two gates leaves no first leg and
  // no grid line, and a non-finite authored gate would poison every keepout and
  // the skirt reach. The sector falls back to its normal field arranger instead.
  if (!level || !layout || !course || !Array.isArray(course.gates)) return null;
  const origin = sectorGlobalOrigin(sectorId);
  const gates = course.gates.filter(finitePoint)
    .map(p => ({ x: p.x + origin.x, z: p.z + origin.z }));
  if (gates.length < 2) return null;
  const segments = gates.slice(1).map((b, i) => ({ a: gates[i], b }));
  const first = segments[0], length = Math.hypot(first.b.x - first.a.x, first.b.z - first.a.z) || 1;
  const grid = {
    x: first.a.x - (first.b.x - first.a.x) / length * 240,
    z: first.a.z - (first.b.z - first.a.z) / length * 240,
  };
  return {
    sectorId, courseId: course.courseId, layout, origin, gates, segments,
    keepouts: [...segments, { a: grid, b: gates[0] }],
    halfWidthWU: (Number(course.gateRadiusWU) || 90) + (Number(layout.hullRadiusWU) || 32),
    // One reservation-ordered peer list for the whole sector pass — arranger seeds
    // (stations, authored POIs, reservations), banked rocks, restored bodies, and every
    // scenery body this membrane examined or moved. Without it a shifted POI could land
    // on a banked rock and two bodies stacked on the same leg could collapse onto one
    // another: corridor clearance alone never measured body-vs-body.
    peers: [],
    // The materialization bag these peers describe. world.js builds each pass into a
    // fresh bag and publishes it only at the end, so its identity marks the pass;
    // peers registered against a discarded bag must never bias the next build.
    contentsBag: null,
    grid,
  };
}

/** Clearance is for the complete body, not only its center. */
export function clearsRacingCorridor(plan, pos, radius = 0) {
  if (!plan || !finitePoint(pos) || !Number.isFinite(radius) || radius < 0) return false;
  const clearance = plan.halfWidthWU + radius;
  return plan.keepouts.every(({ a, b }) => closestOnSegment(pos, a, b).distance >= clearance - 1e-6);
}

// Peer rows are { pos:{x,z}, radius, key?, cls }. A keyed row belongs to one named
// body — the same authored slot on a re-materialization — so the body skips its own
// stale seat instead of being pushed further out every pass. Row classes:
//   'resv' — authored reservations and restored bodies.
//   'seed' — stations and authored POI sites.
//   'rock' — every settled scatter rock (arranger or membrane).
//   'solid'— scenery this membrane placed or moved.
// Movers check against their own contract:
//   'rock' movers (arranger banking) honor seeds, reservations and the earlier
//        pile — exactly what the arranger's per-instance reservation set always
//        held — so the seeded bank stays bitwise what the courses were tuned
//        around.
//   'memrock' movers (membrane re-seats of intruding scatter) honor only
//        reservations — the old membrane was corridor-only, and anything wider
//        reshuffles authored/bound rocks the courses were tuned against.
//   'solid' movers (POI shifts, dressing, props) honor the whole list — that is
//        the defect this list exists for: a shifted unique body can never again
//        collapse onto a moved or settled one.
const PEER_CAP = 8192;

function peerBlocked(plan, pos, radius, key, cls) {
  const peers = plan.peers;
  if (!peers) return false;
  for (const row of peers) {
    if (!row || (key != null && row.key === key)) continue;
    if (cls === 'memrock' && row.cls !== 'resv') continue;
    if (cls === 'rock' && row.cls === 'solid') continue;
    if (Math.hypot(pos.x - row.pos.x, pos.z - row.pos.z) < radius + row.radius + 8) return true;
  }
  return false;
}

function notePeer(plan, pos, radius, key, cls) {
  const peers = plan.peers;
  if (!peers || !finitePoint(pos) || !Number.isFinite(radius)) return;
  for (let i = 0; i < peers.length; i++) {
    const row = peers[i];
    if (!row) continue;
    // A keyed row refreshes in place: the body re-settles its own seat each pass.
    if (key != null && row.key === key) { row.pos = { x: pos.x, z: pos.z }; row.radius = radius; return; }
    if (key != null && row.key != null && row.pos.x === pos.x && row.pos.z === pos.z) {
      // Two registration paths salt the same body differently — the arranger keys a
      // banked rock by its seed slot, the spec membrane by fieldId — so the seat
      // already has an owner. Keeping the first row keeps one self-skip identity;
      // a second keyed row would make the body block its own re-materialization.
      return;
    }
    // Only an unkeyed row covers an unkeyed re-push — re-seeded stations and re-reserved
    // marks never grow the list across passes. A keyed row at the same spot belongs to a
    // named body whose own self-skip must never swallow an activity reservation that
    // exists to block everyone, including that body.
    if (key == null && row.key == null && row.pos.x === pos.x && row.pos.z === pos.z) return;
  }
  if (peers.length >= PEER_CAP) return;
  peers.push({ pos: { x: pos.x, z: pos.z }, radius, key, cls: cls || 'solid' });
}

function outsidePoint(plan, original, radius, salt, cls) {
  // The body's identity is its authored slot + the caller's salt; materialization is
  // deterministic, so the same body re-derives the same key on every pass.
  const key = `${salt}|${original.x}|${original.z}`;
  // 'memrock' is a mover contract, not a body kind: a membrane-reseated rock still
  // registers as a 'rock' row so unique movers keep clear of it like any other.
  const rowCls = cls === 'memrock' ? 'rock' : cls;
  if (clearsRacingCorridor(plan, original, radius)) {
    // An already-clear body keeps its seat — only its reservation is refreshed so a
    // later moved body avoids it.
    notePeer(plan, original, radius, key, rowCls);
    return { ...original };
  }
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
    if (clearsRacingCorridor(plan, pos, radius) && !peerBlocked(plan, pos, radius, key, cls)) {
      notePeer(plan, pos, radius, key, rowCls);
      return pos;
    }
  }
  // A dense self-overlap still has an exterior. This bounded skirt preserves the body
  // rather than accepting an unchecked point or deleting scenery to make a test pass.
  // Every candidate at this reach is corridor-clear by construction; the golden-angle
  // walk only prefers a bearing no peer already sits on.
  const baseReach = Math.max(...plan.gates.map(p => Math.hypot(p.x - plan.origin.x, p.z - plan.origin.z)))
    + plan.halfWidthWU + radius + 160;
  const baseAngle = (hash32(String(salt)) >>> 0) / 4294967296 * Math.PI * 2;
  for (let attempt = 0; attempt < 64; attempt++) {
    const reach = baseReach + Math.floor(attempt / 8) * (radius + 40);
    const angle = baseAngle + attempt * 2.399963229728653;
    const pos = { x: plan.origin.x + Math.cos(angle) * reach, z: plan.origin.z + Math.sin(angle) * reach };
    if (!peerBlocked(plan, pos, radius, key, cls)) {
      notePeer(plan, pos, radius, key, rowCls);
      return pos;
    }
  }
  // A peer ring dense enough to block every skirt angle cannot trap the point either;
  // fall back to the same deterministic exterior the un-peered path returned.
  const pos = { x: plan.origin.x + Math.cos(baseAngle) * baseReach, z: plan.origin.z + Math.sin(baseAngle) * baseReach };
  notePeer(plan, pos, radius, key, rowCls);
  return pos;
}

/** AL-RACE-2 — a rigid nudge for seeded solid scenery. Seeded POI markers and attached
 * fleets (e.g. the Quiessence ring) translate as one body so their formation survives;
 * authored positions and runtime-owned native sites never pass through here. Returns
 * the {x,z} offset that takes the point clear of the corridor, or null when no session
 * covers this sector object or the point already clears. */
export function racingCorridorSceneryShift(state, sectorId, pos, radius = 0) {
  if (!finitePoint(pos) || !Number.isFinite(radius) || radius < 0) return null;
  const session = sessions.get(state);
  const sector = state.world?.sectors?.[sectorId];
  if (!session || registeredSectors.get(sector) !== session) return null;
  const plan = session.plans.get(sectorId);
  if (!plan) return null;
  const moved = outsidePoint(plan, pos, radius, `${sectorId}:scenery`);
  if (moved.x === pos.x && moved.z === pos.z) return null;
  return { x: moved.x - pos.x, z: moved.z - pos.z };
}

/** Solid table props also use this membrane; kit/aftermath rows bypass the field arranger. */
export function racingDressingSpec(state, spec) {
  if (spec?.collides !== true || !finitePoint(spec.pos)) return spec;
  const session = sessions.get(state);
  const sectorId = spec.homeSectorId || spec.data?.homeSectorId || spec.data?.sectorId;
  const sector = state.world?.sectors?.[sectorId];
  if (!session || registeredSectors.get(sector) !== session) return spec;
  const plan = session.plans.get(sectorId);
  if (!plan) return spec;
  const radius = Math.max(0.5, Number(spec.radius) || 10);
  const moved = outsidePoint(plan, spec.pos, radius, spec.data?.placeId || 'prop');
  return moved.x === spec.pos.x && moved.z === spec.pos.z ? spec : { ...spec, pos: moved };
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
      const placed = outsidePoint(plan, spec.pos, 6 * 64, group, 'memrock');
      offset = { x: placed.x - spec.pos.x, z: placed.z - spec.pos.z };
      session.opticOffsets.set(group, offset);
    }
    return offset.x === 0 && offset.z === 0 ? spec
      : { ...spec, pos: { x: spec.pos.x + offset.x, z: spec.pos.z + offset.z } };
  }
  const radius = asteroidColliderRadius(spec.data?.typeId, spec.radius);
  const moved = outsidePoint(plan, spec.pos, radius, spec.data?.fieldId || 'rock', 'memrock');
  return moved.x === spec.pos.x && moved.z === spec.pos.z ? spec : { ...spec, pos: moved };
}

/** Existing world's arranger interface; active only for explicitly registered sector objects. */
export function createRacingCorridorArranger(sector, options = {}) {
  const session = sector && registeredSectors.get(sector);
  if (!session) return null;
  const plan = session.plans.get(sector.id);
  if (!plan) return null;
  // A new bag means a new materialization pass — the bodies the old peer rows
  // described are gone, so the list dies with them. Fields create the first
  // arranger of every pass before any scenery membrane call; the dressing pass
  // and the REDUCED→FULL promote reuse the same bag and keep the seats.
  if (plan.contentsBag !== options.active) {
    plan.contentsBag = options.active;
    plan.peers.length = 0;
  }
  // The arranger and the scenery membrane share the plan's reservation list: a banked
  // rock blocks a shifted POI exactly as a shifted POI blocks the next banked rock.
  for (const station of options.active?.stations || []) {
    if (finitePoint(station.pos)) notePeer(plan, station.pos, 150, undefined, 'seed');
  }
  for (const poi of sector.pois || []) {
    if (finitePoint(poi.pos)) notePeer(plan, {
      x: poi.pos.x + plan.origin.x, z: poi.pos.z + plan.origin.z,
    }, Math.max(24, Number(poi.placeTargetRadius) || Number(poi.visualRadius) || (poi.runtimeOwner ? 100 : 24)),
      undefined, 'seed');
  }
  // Already-global authored activity marks enter as reservations BEFORE the first
  // movable rock — same contract as the campaign arranger. Ceres is a racing
  // sector now: without this a banked scatter rock could land on a bound mark.
  for (const r of options.reservations || []) {
    if (finitePoint(r?.pos) && Number.isFinite(r.radius)) notePeer(plan, r.pos, r.radius, undefined, 'resv');
  }
  const stats = { placed: 0, moved: 0, skirts: 0 };
  const peerClear = (pos, radius, key, cls) => !peerBlocked(plan, pos, radius, key, cls);
  const reserve = (pos, radius, key, cls) => notePeer(plan, pos, radius, key, cls);
  return {
    profile: plan.layout,
    keepouts: plan.keepouts,
    createField(fdef) {
      // A layout may skip a field id, carry an empty leg list, or lack the fields
      // map entirely — every one of those banks all legs rather than indexing
      // nothing or a missing entry. Legs that cannot index a segment (negative,
      // fractional, out of range) drop out instead of reading segments[-1].
      const authoredLegs = plan.layout.fields ? plan.layout.fields[fdef.id] : null;
      const inRange = (leg) => Number.isInteger(leg) && leg >= 0 && leg < plan.segments.length;
      const authored = Array.isArray(authoredLegs) ? authoredLegs.filter(inRange) : [];
      const legs = authored.length ? authored : plan.segments.map((_, i) => i);
      return {
        place(original, bodyRadius, slotIndex) {
          const radius = asteroidColliderRadius(fdef.type, bodyRadius);
          const seed = hash32(fdef.id, slotIndex, original.x, original.z) >>> 0;
          // The body's own reservation key: a re-materializing rock skips its own stale
          // seat and re-settles it, never drifting further out each pass. Matches the
          // key outsidePoint derives for the seeded fallback call below.
          const bodyKey = `${seed}|${original.x}|${original.z}`;
          // slotIndex | 0 guards non-integer callers but a negative still indexes
          // legs[-1] — plan.segments[undefined] then throws on destructure. Wrap
          // through a positive modulo; non-negative indices are bit-identical to
          // the old ordering. An empty leg list banks nothing and falls through
          // to the exterior fallback instead of dividing by zero.
          const wrap = (i) => ((i % legs.length) + legs.length) % legs.length;
          for (let attempt = 0; attempt < 96 && legs.length; attempt++) {
            const leg = legs[wrap((slotIndex | 0) + Math.floor(attempt / 8))];
            const { a, b } = plan.segments[leg];
            const length = Math.hypot(b.x - a.x, b.z - a.z) || 1;
            const t = 0.12 + (((seed % 65521) / 65521 + attempt * 0.381966) % 1) * 0.76;
            const side = ((slotIndex + attempt) & 1) ? -1 : 1;
            const depth = plan.layout.shoulderWU + ((seed >>> 16) % 97) / 97 * plan.layout.edgeDepthWU
              + Math.floor(attempt / 16) * (radius * 2 + 20);
            const offset = (plan.halfWidthWU + radius + depth) * side;
            const pos = { x: a.x + (b.x - a.x) * t - (b.z - a.z) / length * offset,
              z: a.z + (b.z - a.z) * t + (b.x - a.x) / length * offset };
            if (!clearsRacingCorridor(plan, pos, radius) || !peerClear(pos, radius, bodyKey, 'rock')) continue;
            reserve(pos, radius, bodyKey, 'rock'); stats.placed++; stats.moved++;
            return pos;
          }
          // Preserve the existing object budget. Unusually crowded banks use the safe
          // exterior; the centerline and start grid never inherit scatter as a fallback.
          let pos = outsidePoint(plan, original, radius + 80, seed, 'rock');
          for (let attempt = 0; !peerClear(pos, radius, bodyKey, 'rock') && attempt < 64; attempt++) {
            const angle = (seed / 4294967296 + attempt * 0.381966) * Math.PI * 2;
            const reach = 3000 + attempt * (radius * 2 + 12);
            pos = { x: plan.origin.x + Math.cos(angle) * reach, z: plan.origin.z + Math.sin(angle) * reach };
          }
          reserve(pos, radius, bodyKey, 'rock'); stats.placed++; stats.skirts++;
          return pos;
        },
        reserveRestored: (pos, radius) => reserve(pos, radius, undefined, 'resv'),
      };
    },
    placeProp(placeId, pos, radius, rot = 0) {
      return { pos: outsidePoint(plan, pos, radius, placeId), rot };
    },
    reserve,
    summary: () => ({ ...stats }),
  };
}
