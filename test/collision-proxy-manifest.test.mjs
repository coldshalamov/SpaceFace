// Contract tests for the collision proxy manifest module (PQ-008 / SF-08 → F18).
//
// What these tests defend:
//   - the manifest schema and the binding flag contract (collides only; never renderable,
//     targetable, or radar-visible);
//   - the compound-size bound (a manifest can never expand past MAX_PROXY_PRIMITIVES, even under
//     an adversarial chain count);
//   - the Helios silhouette approximation: a coarse Hausdorff-style bound measured against the
//     AUTHORED footprint constants — deterministic, no GLB parsing anywhere in this file;
//   - the corridor gap stays genuinely navigable and the berth deck stays clear of every proxy
//     (the proxy set must not silently seal the dock route it exists to make truthful);
//   - the golden-safety gate: manifests activate ONLY for entities that explicitly declare them.
//
// The measured geometry numbers (expanded counts, silhouette bound, gap width, berth clearance)
// are pinned as literals copied BY HAND from the live module. Any deliberate rebalancing of the
// Helios proxy set must update these pins deliberately, with the semantic delta reviewed.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  COLLISION_PROXY_FLAGS,
  COLLISION_PROXY_KINDS,
  COLLISION_PROXY_MANIFESTS,
  COLLISION_PROXY_SCHEMA_VERSION,
  MAX_PROXY_PRIMITIVES,
  collisionProxyIdForStation,
  corridorStateFor,
  distanceToProxy,
  effectiveCorridorBearingDeg,
  expandProxyPrimitives,
  measureCorridorGapWidth,
  measureSilhouetteBound,
  proxyScaleFor,
  proxyWorldPrimitives,
  resolveBerthWorld,
  resolveCollisionProxyManifest,
  resolveCorridorAxisWorld,
  validateCollisionProxyManifest,
} from '../src/data/collisionProxyManifests.js';

const HELIOS = COLLISION_PROXY_MANIFESTS.helios_trade_hub;
const DEG = Math.PI / 180;
const EPS = 1e-9;

/** Live-style station fixture: rot 0, stamped corridor bearing, R = dockRadius = 90. */
function heliosStation(overrides = {}) {
  return {
    id: 'st-fixture',
    type: 'station',
    alive: true,
    pos: { x: 0, z: 0 },
    rot: 0,
    radius: 42,
    data: {
      stationId: 'station_helios',
      dockRadius: 90,
      collisionProxy: 'helios_trade_hub',
      corridorBearingDeg: 135,
    },
    ...overrides,
  };
}

function clone(doc) {
  return JSON.parse(JSON.stringify(doc));
}

// ---------------------------------------------------------------------------------------------
// schema + flag contract
// ---------------------------------------------------------------------------------------------

test('the live Helios manifest validates clean against its own validator', () => {
  const result = validateCollisionProxyManifest(HELIOS);
  assert.deepEqual(result.issues, []);
  assert.equal(result.ok, true);
  assert.equal(HELIOS.schemaVersion, COLLISION_PROXY_SCHEMA_VERSION);
  assert.equal(HELIOS.id, 'helios_trade_hub');
  assert.deepEqual([...HELIOS.stationIds], ['station_helios']);
  assert.equal(HELIOS.referenceRadius, 'dockRadius');
});

test('the flag contract is exact, frozen, and carried by every manifest', () => {
  assert.ok(Object.isFrozen(COLLISION_PROXY_FLAGS));
  assert.deepEqual(COLLISION_PROXY_FLAGS, {
    collides: true,
    renderable: false,
    targetable: false,
    radarVisible: false,
  });
  for (const manifest of Object.values(COLLISION_PROXY_MANIFESTS)) {
    assert.equal(manifest.flags, COLLISION_PROXY_FLAGS, `${manifest.id} must carry the shared contract`);
  }
  // Frozen-ness must actually take.
  try { COLLISION_PROXY_FLAGS.renderable = true; } catch { /* strict mode throws */ }
  assert.equal(COLLISION_PROXY_FLAGS.renderable, false);
});

test('the validator rejects malformed manifests', () => {
  const cases = [
    ['wrong schemaVersion', (m) => { m.schemaVersion = 999; }],
    ['missing id', (m) => { delete m.id; }],
    ['renderable proxy', (m) => { m.flags = { ...m.flags, renderable: true }; }],
    ['targetable proxy', (m) => { m.flags = { ...m.flags, targetable: true }; }],
    ['radar-visible proxy', (m) => { m.flags = { ...m.flags, radarVisible: true }; }],
    ['non-colliding proxy', (m) => { m.flags = { ...m.flags, collides: false }; }],
    ['empty primitives', (m) => { m.primitives = []; }],
    ['unknown kind', (m) => { m.primitives.push({ kind: 'mesh', id: 'x' }); }],
    ['zero-radius circle', (m) => { m.primitives.push({ kind: 'circle', id: 'x', x: 0, z: 0, r: 0 }); }],
    ['degenerate chain', (m) => { m.primitives.push({ kind: 'chain', id: 'x', radius: 1, circleR: 0.1, count: 2 }); }],
    ['missing corridor mouth', (m) => { m.docking.corridor.mouthRadius = 0; }],
    ['missing capture geometry', (m) => { m.docking.capture.halfWidth = 0; }],
    ['missing berth geometry', (m) => { m.docking.berth.dockRadius = 0; }],
    ['missing assist tuning', (m) => { m.docking.assist = { kp: 0.9 }; }],
    ['berth outside capture lane', (m) => { m.docking.berth.radius = m.docking.capture.outerRadius + 0.1; }],
  ];
  for (const [label, mutate] of cases) {
    const manifest = clone(HELIOS);
    mutate(manifest);
    const result = validateCollisionProxyManifest(manifest);
    assert.equal(result.ok, false, `${label} must be rejected`);
    assert.ok(result.issues.length > 0, `${label} must name its issue`);
  }
});

// ---------------------------------------------------------------------------------------------
// proxy count bounds + expansion shape
// ---------------------------------------------------------------------------------------------

test('Helios expansion is bounded, pinned, and only produces registrable kinds', () => {
  const expanded = expandProxyPrimitives(HELIOS, { entity: heliosStation() });
  // Pinned composition: core 1 + spars 4 + ring1 13 (16 minus 3 gap circles) + ring2 5 (8 minus 3).
  assert.equal(expanded.length, 23);
  assert.ok(expanded.length <= MAX_PROXY_PRIMITIVES);
  assert.equal(expanded.filter((p) => p.kind === 'capsule').length, 4);
  assert.equal(expanded.filter((p) => p.kind === 'circle' && p.id === 'core').length, 1);
  assert.equal(expanded.filter((p) => p.chain === 'ring1').length, 13);
  assert.equal(expanded.filter((p) => p.chain === 'ring2').length, 5);
  for (const primitive of expanded) {
    assert.ok(COLLISION_PROXY_KINDS.includes(primitive.kind), `registrable kind ${primitive.kind}`);
    assert.notEqual(primitive.kind, 'chain', 'chains must be fully expanded before registration');
    assert.ok(primitive.r > 0, 'every expanded primitive has a positive radius');
    for (const key of ['x', 'z']) {
      if (primitive[key] !== undefined) assert.ok(Number.isFinite(primitive[key]), `${key} finite`);
    }
  }
});

test('the expansion cap holds even under an adversarial chain count', () => {
  const manifest = clone(HELIOS);
  manifest.primitives = [{ kind: 'chain', id: 'huge', radius: 1, circleR: 0.1, count: 500 }];
  const expanded = expandProxyPrimitives(manifest, {});
  assert.equal(expanded.length, MAX_PROXY_PRIMITIVES, 'expansion is hard-capped, never more');
  assert.equal(MAX_PROXY_PRIMITIVES, 32, 'the registered bound itself is pinned');
});

// ---------------------------------------------------------------------------------------------
// authored footprint anchors (independent literal pins)
// ---------------------------------------------------------------------------------------------

test('the Helios footprint anchors match the independent hard-coded table', () => {
  assert.equal(HELIOS.footprint.coreRadius, 0.46);
  assert.deepEqual([...HELIOS.footprint.spar.angles], [0, 90, 180, 270]);
  assert.equal(HELIOS.footprint.spar.inner, 0.20);
  assert.equal(HELIOS.footprint.spar.outer, 0.88);
  assert.equal(HELIOS.footprint.spar.halfWidth, 0.08);
  assert.equal(HELIOS.footprint.ring1.radius, 0.80);
  assert.equal(HELIOS.footprint.ring1.tubeHalfWidth, 0.06);
  assert.equal(HELIOS.footprint.ring2.radius, 0.62);
  assert.equal(HELIOS.footprint.ring2.minorRadius, 0.51);
  assert.equal(HELIOS.footprint.ring2.tubeHalfWidth, 0.05);
  assert.equal(HELIOS.silhouetteBound, 0.24, 'the declared bound is pinned — loosening it is a reviewed change');
});

// ---------------------------------------------------------------------------------------------
// silhouette approximation bound (Hausdorff-style, authored constants, no GLB parsing)
// ---------------------------------------------------------------------------------------------

test('the measured Helios silhouette bound respects the declared bound at every snap bearing', () => {
  for (const bearing of [45, 135, 225, 315]) {
    const measured = measureSilhouetteBound(HELIOS, { corridorBearingDeg: bearing });
    assert.ok(
      measured.bound <= HELIOS.silhouetteBound,
      `bearing ${bearing}: measured ${measured.bound} exceeds declared ${HELIOS.silhouetteBound}`,
    );
    // Pinned measurement (deterministic authored-constants comparison): any geometry drift reds this.
    assert.ok(
      Math.abs(measured.bound - 0.21913732326007512) < EPS,
      `bearing ${bearing}: measured bound drifted (${measured.bound})`,
    );
    assert.ok(measured.bound > 0.1, 'the bound must measure real geometry, not trivially zero');
    assert.ok(measured.proxyToFootprint < 0.02, 'proxies must hug the footprint tightly');
  }
});

test('the corridor gap stays navigable and the berth deck stays clear of every proxy', () => {
  // Ship reference: radius ~0.16R (14 wu at R=90) per the manifest berth note.
  const SHIP_RADIUS = 0.16;
  for (const bearing of [45, 135, 225, 315]) {
    const gap = measureCorridorGapWidth(HELIOS, { corridorBearingDeg: bearing });
    assert.ok(Math.abs(gap.width - 0.52) < EPS, `gap width pinned at 0.52 (got ${gap.width})`);
    assert.ok(
      gap.width >= SHIP_RADIUS * 2 + 0.04,
      `bearing ${bearing}: gap ${gap.width} must clear a ship diameter with margin`,
    );
  }
  // The berth itself (0.72R on the corridor lane) must clear every expanded proxy surface.
  const primitives = expandProxyPrimitives(HELIOS, { corridorBearingDeg: 135 });
  const berthLocal = { x: Math.cos(135 * DEG) * 0.72, z: Math.sin(135 * DEG) * 0.72 };
  let clearance = Infinity;
  for (const primitive of primitives) {
    clearance = Math.min(clearance, distanceToProxy(berthLocal, primitive));
  }
  assert.ok(Math.abs(clearance - 0.26) < EPS, `berth clearance pinned at 0.26 (got ${clearance})`);
  assert.ok(clearance > SHIP_RADIUS, 'a berthed ship must not intersect any proxy');
});

// ---------------------------------------------------------------------------------------------
// resolution + golden-safety gate
// ---------------------------------------------------------------------------------------------

test('manifests activate ONLY for entities that explicitly declare them', () => {
  assert.equal(resolveCollisionProxyManifest(heliosStation()), HELIOS);
  // Same station id WITHOUT the declaration: no manifest. This is the 47a golden-safety gate.
  const undeclared = heliosStation();
  undeclared.data = { stationId: 'station_helios', dockRadius: 90 };
  assert.equal(resolveCollisionProxyManifest(undeclared), null);
  assert.equal(resolveCollisionProxyManifest({ data: { collisionProxy: 'nope' } }), null);
  assert.equal(resolveCollisionProxyManifest({}), null);
  assert.equal(resolveCollisionProxyManifest(null), null);
  assert.equal(collisionProxyIdForStation('station_helios'), 'helios_trade_hub');
  assert.equal(collisionProxyIdForStation('station_other'), null);
});

test('scale and corridor bearing resolution are deterministic and snapped', () => {
  assert.equal(proxyScaleFor(heliosStation(), HELIOS), 90);
  assert.equal(proxyScaleFor({ radius: 42, data: {} }, HELIOS), 42);
  assert.equal(proxyScaleFor({}, HELIOS), 1);

  const stamped = (deg) => {
    const station = heliosStation();
    station.data.corridorBearingDeg = deg;
    return effectiveCorridorBearingDeg(HELIOS, station);
  };
  assert.equal(stamped(140), 135);
  assert.equal(stamped(0), 45);
  assert.equal(stamped(200), 225);
  assert.equal(stamped(350), 315);
  assert.equal(stamped(89), 45);
  assert.equal(stamped(91), 135);
  // No stamp: the manifest fallback (135) applies.
  const unstamped = heliosStation();
  delete unstamped.data.corridorBearingDeg;
  assert.equal(effectiveCorridorBearingDeg(HELIOS, unstamped), 135);
});

// ---------------------------------------------------------------------------------------------
// world-space transforms + distance math
// ---------------------------------------------------------------------------------------------

test('proxyWorldPrimitives composes translation, rotation, and scale exactly', () => {
  const station = heliosStation({ pos: { x: 1000, z: -500 }, rot: Math.PI / 2 });
  const world = proxyWorldPrimitives(station, HELIOS);
  assert.equal(world.length, 23);
  const core = world.find((p) => p.id === 'core');
  assert.ok(Math.abs(core.x - 1000) < EPS);
  assert.ok(Math.abs(core.z - (-500)) < EPS);
  assert.ok(Math.abs(core.r - 0.46 * 90) < EPS);
  // spar-0 runs station-local +x (18 → 79.2 wu); at rot π/2 that maps onto world +z.
  const spar0 = world.find((p) => p.id === 'spar-0');
  assert.equal(spar0.kind, 'capsule');
  assert.ok(Math.abs(spar0.ax - 1000) < 1e-9);
  assert.ok(Math.abs(spar0.az - (-482)) < 1e-9);
  assert.ok(Math.abs(spar0.bx - 1000) < 1e-9);
  assert.ok(Math.abs(spar0.bz - (-420.8)) < 1e-9);
  assert.ok(Math.abs(spar0.r - 6.75) < EPS);
});

test('berth and corridor axis resolve to pinned world geometry', () => {
  const station = heliosStation();
  const berth = resolveBerthWorld(station, HELIOS);
  assert.ok(Math.abs(berth.x - (-45.820519420888274)) < EPS);
  assert.ok(Math.abs(berth.z - 45.82051942088828) < EPS);
  const axis = resolveCorridorAxisWorld(station, HELIOS);
  assert.ok(Math.abs(axis.x - (-Math.SQRT1_2)) < EPS);
  assert.ok(Math.abs(axis.z - Math.SQRT1_2) < EPS);
  assert.ok(Math.abs(axis.bearingRad - 135 * DEG) < EPS);
});

test('distanceToProxy is exact for circle, capsule, and obb primitives', () => {
  assert.equal(distanceToProxy({ x: 2, z: 0 }, { kind: 'circle', x: 0, z: 0, r: 1 }), 1);
  assert.equal(distanceToProxy({ x: 0.5, z: 0 }, { kind: 'circle', x: 0, z: 0, r: 1 }), -0.5);
  assert.equal(distanceToProxy({ x: 2, z: 2 }, { kind: 'capsule', ax: 0, az: 0, bx: 4, bz: 0, r: 1 }), 1);
  assert.equal(distanceToProxy({ x: 5, z: 0 }, { kind: 'capsule', ax: 0, az: 0, bx: 4, bz: 0, r: 1 }), 0);
  assert.equal(distanceToProxy({ x: 3, z: 0 }, { kind: 'obb', x: 0, z: 0, hx: 2, hz: 1, angleDeg: 0 }), 1);
  assert.equal(distanceToProxy({ x: 0, z: 0 }, { kind: 'obb', x: 0, z: 0, hx: 2, hz: 1, angleDeg: 0 }), -1);
  assert.equal(distanceToProxy({ x: 0, z: 0 }, { kind: 'unknown' }), Infinity);
});

// ---------------------------------------------------------------------------------------------
// purity + determinism
// ---------------------------------------------------------------------------------------------

test('the module is pure: no clock, no RNG, no Three.js, no GLB parsing', () => {
  const source = readFileSync(new URL('../src/data/collisionProxyManifests.js', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  for (const forbidden of ['Math.random', 'Date.now', 'new Date(', "from 'three'", 'GLTFLoader', '.glb']) {
    assert.equal(source.includes(forbidden), false, `manifest module must not use ${forbidden}`);
  }
  assert.ok(source.includes('export function corridorStateFor'), 'comment stripping ate the source');

  const station = heliosStation();
  assert.deepEqual(
    expandProxyPrimitives(HELIOS, { entity: station }),
    expandProxyPrimitives(HELIOS, { entity: station }),
  );
  assert.deepEqual(
    measureSilhouetteBound(HELIOS, { entity: station }),
    measureSilhouetteBound(HELIOS, { entity: station }),
  );
  assert.deepEqual(
    proxyWorldPrimitives(station, HELIOS),
    proxyWorldPrimitives(station, HELIOS),
  );
});
