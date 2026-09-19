// Spawn-time compositional remapping. No renderer, event subscriptions, clocks or RNG.
// The two already-consumed scatter coordinates carry all seed variation. The caller MUST
// still consume the legacy draws; this module never asks for an additional draw.
import { ARRANGEMENT_LIMITS, sectorCompositionFor } from '../data/sectorCompositions.js';

const TAU = Math.PI * 2;
const RAD = Math.PI / 180;
const GOLDEN = 0.6180339887498949;
const SILVER = 0.4142135623730951;
const EPS = 1e-8;
const frac = n => n - Math.floor(n);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const d2 = (a, b) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
const pointOK = p => p && Number.isFinite(p.x) && Number.isFinite(p.z);
const round6 = n => Math.round(n * 1e6) / 1e6;

function assertPoint(p, label) {
  if (!pointOK(p)) throw new TypeError(`${label} must have finite x and z`);
}
function assertRadius(radius) {
  if (!Number.isFinite(radius) || radius < 0) throw new RangeError('radius must be finite and nonnegative');
}

/** Exact squared XZ distance to a line segment; handles zero-length segments. */
export function segmentDistanceSquared(p, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const len2 = dx * dx + dz * dz;
  const t = len2 > 0 ? clamp(((p.x - a.x) * dx + (p.z - a.z) * dz) / len2, 0, 1) : 0;
  const x = p.x - a.x - t * dx, z = p.z - a.z - t * dz;
  return x * x + z * z;
}

// Peer collisions are checked in a spawn-local spatial hash, not against the live entityList.
// Every query is capped; exhaustion is rejection (never an unchecked acceptance).
class PeerIndex {
  constructor() {
    this.bins = new Map();
    this.rows = [];
    this.maxRadius = 0;
    this.checks = 0;
    this.saturated = 0;
  }
  add(pos, radius) {
    const row = { x: pos.x, z: pos.z, radius };
    const cell = ARRANGEMENT_LIMITS.spatialCell;
    const key = `${Math.floor(pos.x / cell)},${Math.floor(pos.z / cell)}`;
    let bin = this.bins.get(key);
    if (!bin) { bin = []; this.bins.set(key, bin); }
    bin.push(row);
    this.rows.push(row);
    this.maxRadius = Math.max(this.maxRadius, radius);
  }
  clear(pos, radius, gap = ARRANGEMENT_LIMITS.rockGap) {
    const cell = ARRANGEMENT_LIMITS.spatialCell;
    const reach = radius + this.maxRadius + gap;
    let checks = 0;
    const test = rows => {
      for (const row of rows || []) {
        if (++checks > ARRANGEMENT_LIMITS.maxPeerChecksPerCandidate) {
          this.saturated++;
          return false;
        }
        this.checks++;
        if (d2(pos, row) < (radius + row.radius + gap) ** 2 - EPS) return false;
      }
      return true;
    };
    // A malformed/custom giant body must not create a million-cell empty-grid scan.
    if (reach > cell * 8) return test(this.rows);
    for (let iz = Math.floor((pos.z - reach) / cell); iz <= Math.floor((pos.z + reach) / cell); iz++) {
      for (let ix = Math.floor((pos.x - reach) / cell); ix <= Math.floor((pos.x + reach) / cell); ix++) {
        if (!test(this.bins.get(`${ix},${iz}`))) return false;
      }
    }
    return true;
  }
}

/** Circle-vs-clearance constraints. The body radius, not just its centre, must clear. */
export function clearsKeepouts(pos, radius, keepouts) {
  for (const c of keepouts) {
    if (c.kind === 'disc') {
      if (d2(pos, c.center) < (c.radius + radius) ** 2 - EPS) return false;
    } else if (segmentDistanceSquared(pos, c.a, c.b) < (c.halfWidth + radius) ** 2 - EPS) {
      return false;
    }
  }
  return true;
}

/** Conservative circle-vs-ellipse clearance in field coordinates. */
export function clearsAperture(x, z, radius, rx, rz) {
  if (rx <= 0 || rz <= 0) return true;
  // Scale by the *minor* axis. Simply inflating both axes by radius under-protects diagonals.
  const scale = 1 + radius / Math.min(rx, rz);
  return (x / rx) ** 2 + (z / rz) ** 2 >= scale * scale - EPS;
}

/**
 * Map two unit coordinates into a coherent, irregular, open silhouette.
 * The motif is directional, but no shape is centred on or attached to the camera.
 * @returns {{x:number,z:number}} field-radius-normalized coordinates.
 */
export function motifPoint(motif, u, v, recipe) {
  const thickness = recipe.thickness;
  const bias = recipe.bias;
  let x, z;
  if (motif === 'crescent') {
    const gap = recipe.openingDeg * RAD;
    // Two unequal angular populations; the opening points at the focus.
    const t = u < bias ? (u / bias) * 0.49 : 0.56 + ((u - bias) / (1 - bias)) * 0.44;
    const angle = gap * 0.5 + (TAU - gap) * t;
    const r = 0.64 + (v - 0.5) * thickness * 2 + 0.045 * Math.sin(angle * 3.1);
    x = Math.cos(angle) * r;
    z = Math.sin(angle) * r * recipe.aspect;
  } else if (motif === 'strata') {
    // A broad broken near shelf and a narrower far shelf, neither a lattice nor a disk.
    const near = u < bias;
    const t = near ? u / bias : (u - bias) / (1 - bias);
    x = (t * 2 - 1) * 0.78;
    const step = t < 0.43 ? -0.035 : 0.075;
    z = (near ? -1 : 1) * (0.37 + step + 0.12 * Math.sin(t * 3.7))
      + (v - 0.5) * thickness * 2;
  } else if (motif === 'braid') {
    const near = u < bias;
    const t = near ? u / bias : (u - bias) / (1 - bias);
    x = (t * 2 - 1) * 0.81;
    z = (near ? -1 : 1) * (0.33 + 0.13 * Math.sin(t * Math.PI * 1.45))
      + 0.07 * Math.sin(t * TAU) + (v - 0.5) * thickness * 2;
  } else if (motif === 'fan') {
    const near = u < bias;
    const t = near ? u / bias : (u - bias) / (1 - bias);
    x = 0.72 - t * 1.47;
    z = (near ? -1 : 1) * (0.19 + t * 0.40)
      + (v - 0.5) * thickness * (0.65 + t);
  } else if (motif === 'islands') {
    // Three disconnected, unequal lenticular masses; weighted area is intentional rhythm.
    const index = u < 0.48 ? 0 : u < 0.80 ? 1 : 2;
    const t = index === 0 ? u / 0.48 : index === 1 ? (u - 0.48) / 0.32 : (u - 0.80) / 0.20;
    const a = [2.10, 4.02, 5.82][index];
    const radius = [0.59, 0.66, 0.62][index];
    const theta = t * TAU;
    const rr = Math.sqrt(v);
    x = Math.cos(a) * radius + Math.cos(theta) * rr * (0.22 + thickness * 0.30);
    z = Math.sin(a) * radius * recipe.aspect + Math.sin(theta) * rr * (0.13 + thickness * 0.22);
  } else if (motif === 'rift') {
    // Offset broken caustics, not a mathematical spiral or a complete magic-circle ring.
    const near = u < bias;
    const t = near ? u / bias : (u - bias) / (1 - bias);
    const angle = (near ? 0.38 : 3.40) + t * (near ? 2.09 : 1.94);
    const r = (near ? 0.69 : 0.76) + (v - 0.5) * thickness * 2;
    x = Math.cos(angle) * r + (near ? -0.07 : 0.04);
    z = Math.sin(angle) * r * recipe.aspect;
  } else {
    throw new RangeError(`Unknown arrangement motif: ${motif}`);
  }
  return { x, z };
}

function relevantKeepouts(keepouts, center, radius) {
  return keepouts.filter(c => c.kind === 'disc'
    ? d2(center, c.center) <= (radius + c.radius) ** 2
    : segmentDistanceSquared(center, c.a, c.b) <= (radius + c.halfWidth) ** 2);
}

/**
 * An ephemeral context owned by world's synchronous materializer. Discard after the spawn pass.
 * All public points are GALACTIC-GLOBAL; only catalog records enter as SECTOR-LOCAL.
 * options.reservations: already-global authored activity marks to protect before any rock spawns.
 * Unknown sectors return null: their authors have not opted into this grammar.
 */
export function createSectorArranger(sector, options = {}) {
  if (!sector || typeof sector.id !== 'string') throw new TypeError('sector.id is required');
  const profile = sectorCompositionFor(sector.id);
  if (!profile) return null;
  const origin = options.origin || { x: 0, z: 0 };
  assertPoint(origin, 'origin');
  const toGlobal = p => ({ x: origin.x + p.x, z: origin.z + p.z });
  const keepouts = [];
  const anchors = new Map();
  const live = options.active || {};
  const worldRadius = Number.isFinite(sector.worldRadius) && sector.worldRadius > 0 ? sector.worldRadius : 4000;
  const stations = [], gates = [], pois = [];
  const disc = (id, center, radius) => keepouts.push({ kind: 'disc', id, center: { ...center }, radius });
  const route = (id, a, b) => {
    if (d2(a, b) > 1) keepouts.push({ kind: 'capsule', id, a: { ...a }, b: { ...b }, halfWidth: profile.routeHalfWidth });
  };
  for (const st of sector.stations || []) {
    const actual = (live.stations || []).find(row => row.stationId === st.id);
    const pos = actual && pointOK(actual.pos) ? { ...actual.pos } : pointOK(st.pos) ? toGlobal(st.pos) : null;
    if (!pos) continue;
    const dock = st.size === 'L' ? 90 : st.size === 'S' ? 60 : 72;
    const row = { id: st.id, pos, radius: Math.max(profile.stationHalo, dock + 50) };
    anchors.set(st.id, pos); stations.push(row);
    disc(st.id, pos, row.radius);
    route(`approach:${st.id}`, origin, pos);
  }
  for (const gate of sector.gates || []) {
    const actual = (live.gates || []).find(row => row.to === gate.to);
    const pos = actual && pointOK(actual.pos) ? { ...actual.pos } : pointOK(gate.pos) ? toGlobal(gate.pos) : null;
    if (!pos) continue;
    gates.push({ id: gate.to, pos }); anchors.set(gate.to, pos);
    disc(`gate:${gate.to}`, pos, profile.gateHalo);
    route(`transit:${gate.to}`, origin, pos);
  }
  for (const poi of sector.pois || []) {
    const actual = (live.pois || []).find(row => row.poiId === poi.id);
    const pos = actual && pointOK(actual.pos) ? { ...actual.pos } : pointOK(poi.pos) ? toGlobal(poi.pos) : null;
    if (!pos) continue;
    const visualRadius = Number.isFinite(poi.visualRadius) && poi.visualRadius > 0 ? poi.visualRadius : poi.landmark ? 32 : 12;
    const radius = Math.max(visualRadius + profile.poiMargin, Number(poi.dressingExclusionRadius) || 0);
    const row = { id: poi.id, type: poi.type, pos, radius };
    anchors.set(poi.id, pos); pois.push(row); disc(poi.id, pos, radius);
  }
  disc('spawn:breathing-room', origin, profile.spawnHalo);
  const focus = anchors.get(profile.focus) || stations[0]?.pos || { ...origin };
  const peers = new PeerIndex();
  const fields = [];
  const stats = { fields: 0, moved: 0, pinned: 0, fallback: 0, motifPlaced: 0, repaired: 0, candidates: 0,
    propsMoved: 0, propsKept: 0 };
  for (const r of options.reservations || []) {
    assertPoint(r.pos, 'reservation.pos'); assertRadius(r.radius);
    peers.add(r.pos, r.radius);
  }

  function createField(fdef, center, radius) {
    assertPoint(center, 'field center');
    if (!Number.isFinite(radius) || radius <= 0) throw new RangeError('field radius must be positive');
    const recipe = { ...profile, ...(profile.fields[fdef.id] || {}) };
    const angle = Number.isFinite(recipe.axisDeg) ? recipe.axisDeg * RAD
      : Math.atan2(focus.z - center.z, focus.x - center.x) + recipe.angleDeg * RAD;
    const c = Math.cos(angle), s = Math.sin(angle);
    const nearby = relevantKeepouts(keepouts, center, radius);
    const rx = recipe.aperture[0] * radius, rz = recipe.aperture[1] * radius;
    const info = { id: fdef.id, center: { ...center }, radius, angle, motif: recipe.motif,
      aperture: { rx, rz }, stats: { moved: 0, pinned: 0, fallback: 0, motifPlaced: 0, repaired: 0, candidates: 0 } };
    fields.push(info); stats.fields++;
    const localToWorld = (x, z) => ({ x: center.x + round6(c * x - s * z), z: center.z + round6(s * x + c * z) });
    const admissible = (pos, bodyRadius) => {
      const dx = pos.x - center.x, dz = pos.z - center.z;
      return bodyRadius <= radius && dx * dx + dz * dz <= (radius - bodyRadius) ** 2 + EPS
        && clearsAperture(c * dx + s * dz, -s * dx + c * dz, bodyRadius, rx, rz)
        && clearsKeepouts(pos, bodyRadius, nearby)
        && peers.clear(pos, bodyRadius);
    };
    function place(original, bodyRadius, slotIndex, pinned = false) {
      assertPoint(original, 'scatter position'); assertRadius(bodyRadius);
      if (!Number.isSafeInteger(slotIndex) || slotIndex < 0) throw new RangeError('slotIndex must be a nonnegative safe integer');
      if (pinned) {
        peers.add(original, bodyRadius);
        stats.pinned++; info.stats.pinned++;
        return { ...original }; // no clipping; activity anchors may intentionally lie outside a field
      }
      const dx = original.x - center.x, dz = original.z - center.z;
      // Recover the two positional draws from the legacy uniform-disc sample. All later draws,
      // including HP, yield, size and angular velocity, remain where they were in the stream.
      const u0 = frac(Math.atan2(dz, dx) / TAU);
      const v0 = clamp((dx * dx + dz * dz) / (radius * radius), 0, 1 - Number.EPSILON);
      const count = ARRANGEMENT_LIMITS.motifCandidates + ARRANGEMENT_LIMITS.repairCandidates;
      for (let attempt = 0; attempt < count; attempt++) {
        stats.candidates++; info.stats.candidates++;
        const u = frac(u0 + slotIndex * GOLDEN + attempt * SILVER);
        const v = frac(v0 + attempt * GOLDEN);
        let pos;
        if (attempt < ARRANGEMENT_LIMITS.motifCandidates) {
          const p = motifPoint(recipe.motif, u, v, recipe);
          pos = localToWorld(p.x * radius, p.z * radius);
        } else {
          // Bounded repair still respects the aperture, field envelope, keepouts and peer gap.
          // It trades local motif purity for safety rather than looping until something fits.
          const a = u * TAU;
          const rr = Math.sqrt(v) * Math.max(0, radius - bodyRadius);
          pos = localToWorld(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        if (!admissible(pos, bodyRadius)) continue;
        peers.add(pos, bodyRadius);
        stats.moved++; info.stats.moved++;
        const key = attempt < ARRANGEMENT_LIMITS.motifCandidates ? 'motifPlaced' : 'repaired';
        stats[key]++; info.stats[key]++;
        return pos;
      }
      // Impossible custom geometry: keep the original slot, never delete/duplicate an object.
      // Its original clearance defects can remain. The fixture reports fallback, not success.
      peers.add(original, bodyRadius);
      stats.fallback++; info.stats.fallback++;
      return { ...original };
    }
    return { place, info, reserveRestored(pos, bodyRadius) {
      assertPoint(pos, 'restored position'); assertRadius(bodyRadius); peers.add(pos, bodyRadius);
    } };
  }

  function closest(rows, pos) {
    let best = null, bestDistance = Infinity;
    for (const row of rows) {
      const distance = d2(pos, row.pos);
      if (distance < bestDistance) { best = row; bestDistance = distance; }
    }
    return best;
  }

  /**
   * Only caller-opted-in ambient furniture is eligible. Authored kits, aftermath, mission slots,
   * billboard facings, conveyor routes and one-offs are not generic scatter and are never moved.
   * Existing point -> anchor distance supplies the seed variation; no extra random draw.
   */
  function placeProp(placeId, original, radius, rot = 0) {
    assertPoint(original, 'prop position'); assertRadius(radius);
    const wreckLike = placeId === 'place_dead_hulk' || placeId === 'place_debris_chunk';
    const fieldLike = placeId === 'place_mining_drone' || placeId === 'place_nav_buoy';
    if (!wreckLike && !fieldLike) { stats.propsKept++; return { pos: original, rot }; }
    const candidates = wreckLike ? pois.filter(p => p.type === 'wreck' || p.type === 'derelict') : [];
    const fieldAnchors = (sector.fields || []).flatMap(f => {
      const liveField = (live.fields || []).find(a => a.id === f.id);
      const pos = liveField && pointOK(liveField.center) ? liveField.center : pointOK(f.center) ? toGlobal(f.center) : null;
      return pos ? [{ id: f.id, pos, radius: f.clusterRadius || 450 }] : [];
    });
    const anchor = closest(candidates.length ? candidates : fieldAnchors, original);
    if (!anchor || d2(anchor.pos, original) > 850 ** 2) { stats.propsKept++; return { pos: original, rot }; }
    const distance = Math.sqrt(d2(anchor.pos, original));
    const jitter = frac(distance * GOLDEN) - 0.5;
    const axis = wreckLike ? profile.dressingAngleDeg * RAD
      : Math.atan2(focus.z - anchor.pos.z, focus.x - anchor.pos.x);
    const baseAngle = wreckLike ? axis + (placeId === 'place_debris_chunk' ? 0.24 : -0.08)
      : axis + (placeId === 'place_mining_drone' ? 1.08 : -1.15);
    const reach = wreckLike ? clamp(distance, 140, 340) : Math.max(100, (anchor.radius || 350) * 0.76);
    for (let i = 0; i < 12; i++) {
      const angle = baseAngle + jitter * 0.16 + (i === 0 ? 0 : (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.12);
      const radial = reach + (i % 3) * 14;
      const pos = { x: anchor.pos.x + Math.cos(angle) * radial, z: anchor.pos.z + Math.sin(angle) * radial };
      if (d2(pos, original) > 560 ** 2 || d2(pos, origin) > Math.max(0, worldRadius - radius) ** 2) continue;
      if (!clearsKeepouts(pos, radius, keepouts) || !peers.clear(pos, radius, 12)) continue;
      peers.add(pos, radius); stats.propsMoved++;
      return { pos, rot: wreckLike ? axis + jitter * 0.12 : angle + Math.PI * 0.5 };
    }
    stats.propsKept++;
    return { pos: original, rot };
  }

  return {
    profile,
    focus: { ...focus },
    keepouts,
    fields,
    createField,
    placeProp,
    reserve(pos, radius) { assertPoint(pos, 'reservation'); assertRadius(radius); peers.add(pos, radius); },
    summary() { return { ...stats, peerChecks: peers.checks, saturatedQueries: peers.saturated }; },
  };
}
