// test/asteroid-formation-model.test.mjs — contract tests for the pure asteroid formation model.
//
// These tests build their OWN asteroid fixtures on purpose. They deliberately do NOT import or
// assert on src/data/sectors.js or the live site/sector catalogs: that content is unstable while
// other agents work on it, and none of it is this model's contract. Everything asserted here is a
// property of buildAsteroidFormations() given explicit inputs.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAsteroidFormations,
  classifyArchetype,
  formationIdFor,
  linkDistance,
  FORMATION_MODEL_VERSION,
  FORMATION_ID_PREFIX,
  FORMATION_VARIANCE,
  FORMATION_ARCHETYPE_BY_ID,
  FORMATION_REJECT_REASON,
  FORMATION_LINK,
} from '../src/systems/asteroidFormationModel.js';

// --- fixture helpers ---------------------------------------------------------------------------

function rock(id, x, z, radius = 10, typeId = 'ast_common_rock', extra = {}) {
  return { id, pos: { x, z }, radius, data: { typeId, yieldU: 12 }, ...extra };
}

/** Two well-separated groups: 3 rocks near the origin, 3 rocks ~4000u away. */
function twoGroupField() {
  return [
    rock('a1', 0, 0, 12),
    rock('a2', 60, 20, 9),
    rock('a3', 120, -10, 7),
    rock('b1', 4000, 4000, 14, 'ast_metallic'),
    rock('b2', 4080, 4030, 10, 'ast_metallic'),
    rock('b3', 4150, 3960, 8, 'ast_icy'),
  ];
}

/** Deterministic shuffle (seeded, no Math.random) so the "order independence" test is repeatable. */
function shuffled(arr, seed = 12345) {
  const out = arr.slice();
  let s = seed >>> 0;
  const next = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function translate(arr, dx, dz) {
  return arr.map((a) => ({ ...a, pos: { x: a.pos.x + dx, z: a.pos.z + dz } }));
}

function rotate(arr, rad) {
  const c = Math.cos(rad); const s = Math.sin(rad);
  return arr.map((a) => ({
    ...a,
    pos: { x: a.pos.x * c - a.pos.z * s, z: a.pos.x * s + a.pos.z * c },
  }));
}

/** Every property the contract says is coordinate-independent. */
const INVARIANT_KEYS = [
  'id', 'designation', 'archetype', 'archetypeName', 'label', 'anchorAsteroidId',
  'count', 'spanRadius', 'packing', 'elongation', 'resourceContinuity', 'dominantTypeId',
  'yieldTotal', 'richness', 'gasRisk', 'thermalRisk', 'sensorSignature', 'siteAffinity',
  'coreCandidateId',
];

function invariantView(f) {
  const out = {};
  for (const k of INVARIANT_KEYS) out[k] = f[k];
  out.memberIds = f.memberIds.slice();
  out.mass = { ...f.mass };
  return out;
}

/** Walk every leaf of the model and assert nothing is NaN/Infinity. */
function assertAllFinite(node, path = 'model') {
  if (typeof node === 'number') {
    assert.ok(Number.isFinite(node), `${path} must be finite, got ${node}`);
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((v, i) => assertAllFinite(v, `${path}[${i}]`));
    return;
  }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) assertAllFinite(v, `${path}.${k}`);
  }
}

// --- determinism -------------------------------------------------------------------------------

test('same seed + same input produces byte-stable formation records', () => {
  const field = twoGroupField();
  const a = buildAsteroidFormations(field, { seed: 77 });
  const b = buildAsteroidFormations(field, { seed: 77 });
  assert.deepStrictEqual(a, b);
  // Structural sanity so the deep-equal above cannot pass vacuously on an empty model.
  assert.equal(a.formations.length, 2);
  assert.equal(a.bodyCount, 6);
  assert.equal(a.version, FORMATION_MODEL_VERSION);
});

test('repeated calls are stable across many seeds and remain JSON-safe', () => {
  const field = twoGroupField();
  for (const seed of [0, 1, 42, 999, 0xdeadbeef]) {
    const a = buildAsteroidFormations(field, { seed });
    const b = buildAsteroidFormations(field, { seed });
    assert.deepStrictEqual(a, b);
    // JSON round-trip must be lossless: no Map, no undefined, no functions, no NaN.
    assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
    assertAllFinite(a);
  }
});

test('the model never mutates its input array or the asteroid objects', () => {
  const field = twoGroupField();
  const before = JSON.parse(JSON.stringify(field));
  const lengthBefore = field.length;
  buildAsteroidFormations(field, { seed: 5 });
  assert.equal(field.length, lengthBefore);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(field)), before);
});

// --- seed behaviour ----------------------------------------------------------------------------

test('different seeds vary labels and soft ratings but NEVER structure', () => {
  const field = twoGroupField();
  const base = buildAsteroidFormations(field, { seed: 1 });
  const seeds = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

  const idSets = new Set();
  const designations = new Set();
  const gasValues = new Set();
  const signatureValues = new Set();

  for (const seed of seeds) {
    const m = buildAsteroidFormations(field, { seed });
    assert.equal(m.formations.length, base.formations.length);
    for (let i = 0; i < m.formations.length; i++) {
      const f = m.formations[i];
      const bf = base.formations[i];
      // STRUCTURE is seed-independent.
      assert.deepStrictEqual(f.memberIds, bf.memberIds, 'membership must not depend on seed');
      assert.equal(f.archetype, bf.archetype, 'archetype must not depend on seed');
      assert.equal(f.anchorAsteroidId, bf.anchorAsteroidId, 'anchor must not depend on seed');
      assert.equal(f.count, bf.count);
      assert.deepStrictEqual(f.mass, bf.mass, 'mass distribution must not depend on seed');
      assert.equal(f.packing, bf.packing);
      assert.equal(f.elongation, bf.elongation);
      assert.equal(f.resourceContinuity, bf.resourceContinuity);
      assert.deepStrictEqual(f.centroid, bf.centroid, 'geometry must not depend on seed');

      // SOFT ratings stay inside the authored band around the seed-1 value.
      assert.ok(Math.abs(f.gasRisk - bf.gasRisk) <= 2 * FORMATION_VARIANCE.gasRisk + 1e-6,
        `gasRisk drifted outside the authored band: ${f.gasRisk} vs ${bf.gasRisk}`);
      assert.ok(Math.abs(f.thermalRisk - bf.thermalRisk) <= 2 * FORMATION_VARIANCE.thermalRisk + 1e-6);
      assert.ok(Math.abs(f.sensorSignature - bf.sensorSignature) <= 2 * FORMATION_VARIANCE.sensorSignature + 1e-6);
      assert.ok(Math.abs(f.siteAffinity - bf.siteAffinity) <= 2 * FORMATION_VARIANCE.siteAffinity + 1e-6);
      for (const v of [f.gasRisk, f.thermalRisk, f.sensorSignature, f.siteAffinity]) {
        assert.ok(v >= 0 && v <= 1, `rating out of [0,1]: ${v}`);
      }
    }
    idSets.add(m.formations.map((f) => f.id).join(','));
    m.formations.forEach((f) => designations.add(f.designation));
    // Track the metallic group (mid-range signature, not clamped) for the variation assertion.
    const metallic = m.formations.find((f) => f.dominantTypeId === 'ast_metallic');
    gasValues.add(metallic.gasRisk);
    signatureValues.add(metallic.sensorSignature);
  }

  // Seeds must actually do something.
  assert.ok(idSets.size > 1, 'ids must vary with seed');
  assert.ok(designations.size > 1, 'designations must vary with seed');
  assert.ok(signatureValues.size > 1, 'sensorSignature must vary with seed');
  assert.ok(gasValues.size > 1, 'gasRisk must vary with seed');

  // And the varied signature values must not be pinned at a clamp (i.e. the band is observable).
  for (const v of signatureValues) assert.ok(v > 0 && v < 1, `expected mid-range signature, got ${v}`);
});

// --- identity ----------------------------------------------------------------------------------

test('formation ids are independent of input array order', () => {
  const field = twoGroupField();
  const straight = buildAsteroidFormations(field, { seed: 21 });
  for (const s of [1, 2, 3, 999]) {
    const mixed = buildAsteroidFormations(shuffled(field, s), { seed: 21 });
    assert.deepStrictEqual(mixed, straight, `shuffle seed ${s} changed the model`);
  }
  const ids = new Set(straight.formations.map((f) => f.id));
  assert.equal(ids.size, straight.formations.length, 'ids must be unique');
  for (const id of ids) assert.ok(id.startsWith(FORMATION_ID_PREFIX));
});

test('ids survive a simulated save/restore round-trip of the seed', () => {
  const field = twoGroupField();
  const live = buildAsteroidFormations(field, { seed: 4242 });

  // Serialize only what a save would actually hold: the seed and the asteroid recipe.
  // NOTE the recipe must carry yieldU as well as typeId — the model reads both, so a save that
  // drops yieldU would restore a formation with the right id but the wrong richness.
  const saved = JSON.stringify({
    seed: live.seed,
    bodies: field.map((a) => ({
      id: a.id, x: a.pos.x, z: a.pos.z, radius: a.radius,
      typeId: a.data.typeId, yieldU: a.data.yieldU,
    })),
  });
  const restored = JSON.parse(saved);

  // Rebuild from the restored save, in a different order, via a differently-shaped input object.
  const rebuiltInput = shuffled(restored.bodies, 7).map((b) => ({
    id: b.id, x: b.x, z: b.z, radius: b.radius,
    data: { typeId: b.typeId, yieldU: b.yieldU },
  }));
  const regenerated = buildAsteroidFormations(rebuiltInput, { seed: restored.seed });

  assert.deepStrictEqual(
    regenerated.formations.map((f) => f.id),
    live.formations.map((f) => f.id),
    'ids must regenerate identically after save/restore',
  );
  assert.deepStrictEqual(regenerated.byAsteroidId, live.byAsteroidId);
  assert.deepStrictEqual(regenerated, live);
});

test('formationIdFor is a pure function of seed + anchor key', () => {
  assert.equal(formationIdFor(9, 'a1'), formationIdFor(9, 'a1'));
  assert.notEqual(formationIdFor(9, 'a1'), formationIdFor(10, 'a1'));
  assert.notEqual(formationIdFor(9, 'a1'), formationIdFor(9, 'a2'));
});

test('byAsteroidId maps every accepted body to exactly one formation', () => {
  const field = twoGroupField();
  const m = buildAsteroidFormations(field, { seed: 3 });
  assert.equal(Object.keys(m.byAsteroidId).length, field.length);
  const counted = m.formations.reduce((n, f) => n + f.count, 0);
  assert.equal(counted, m.bodyCount);
  for (const a of field) assert.ok(m.byAsteroidId[a.id], `${a.id} unassigned`);
});

// --- density regimes ---------------------------------------------------------------------------

test('EMPTY input yields a well-formed empty model', () => {
  for (const input of [[], null, undefined]) {
    const m = buildAsteroidFormations(input, { seed: 8 });
    assert.equal(m.formations.length, 0);
    assert.equal(m.count, 0);
    assert.equal(m.bodyCount, 0);
    assert.deepStrictEqual(m.byAsteroidId, {});
    assert.deepStrictEqual(m.rejected, []);
    assertAllFinite(m);
  }
});

test('SPARSE field: bodies beyond the bridge distance stay solitary', () => {
  const far = FORMATION_LINK.maxGap * 3;
  const field = [rock('s1', 0, 0, 8), rock('s2', far, 0, 8), rock('s3', 0, far, 8)];
  const m = buildAsteroidFormations(field, { seed: 2 });
  assert.equal(m.formations.length, 3);
  for (const f of m.formations) {
    assert.equal(f.count, 1);
    assert.equal(f.archetype, 'af_solitary');
    assert.equal(f.mass.dominance, 1);
    assert.equal(f.resourceContinuity, 1);
    assert.equal(f.packing, 1); // a lone body fills its own span exactly
    assert.equal(f.elongation, 0); // no NaN from the degenerate 1-point covariance
  }
});

test('NORMAL field: a two-body group classifies as a shepherd pair', () => {
  const field = [rock('p1', 0, 0, 10), rock('p2', 80, 0, 10)];
  const m = buildAsteroidFormations(field, { seed: 6 });
  assert.equal(m.formations.length, 1);
  assert.equal(m.formations[0].count, 2);
  assert.equal(m.formations[0].archetype, 'af_shepherd_pair');
});

/** A 4x4 grid of equal bodies. `spacing` controls how tightly packed it is. */
function grid(prefix, spacing, radius) {
  const field = [];
  let n = 0;
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) field.push(rock(`${prefix}${n++}`, i * spacing, j * spacing, radius));
  }
  return field;
}

test('DENSE field: nearly-touching equal bodies form one packed cluster', () => {
  const m = buildAsteroidFormations(grid('d', 26, 11), { seed: 11 });
  assert.equal(m.formations.length, 1);
  const f = m.formations[0];
  assert.equal(f.count, 16);
  assert.ok(f.mass.dominance < 0.2, 'no single body should dominate an even grid');
  assert.ok(f.elongation < 0.4, 'a square grid is not elongated');
  assert.ok(f.packing >= 0.28, `expected a packed cluster, got packing ${f.packing}`);
  assert.equal(f.archetype, 'af_dense_cluster');
  assertAllFinite(m);
});

test('a loosely spaced grid links up but reads as a drift swarm, not a dense cluster', () => {
  // Same 16 bodies, same connectivity — only the spacing differs. This is what keeps the
  // packing threshold meaningful rather than a value every linked group trivially clears.
  const m = buildAsteroidFormations(grid('l', 40, 10), { seed: 11 });
  assert.equal(m.formations.length, 1, 'still one group: spacing is well inside the bridge distance');
  const f = m.formations[0];
  assert.equal(f.count, 16);
  assert.ok(f.packing < 0.28, `expected a loose group, got packing ${f.packing}`);
  assert.equal(f.archetype, 'af_drift_swarm');
});

test('a dominant anchor with satellites classifies as matriarch', () => {
  const field = [
    rock('m0', 0, 0, 30, 'ast_metallic', { mass: 20000 }),
    rock('m1', 90, 0, 5, 'ast_metallic', { mass: 400 }),
    rock('m2', -90, 30, 5, 'ast_metallic', { mass: 400 }),
    rock('m3', 20, 95, 5, 'ast_metallic', { mass: 400 }),
  ];
  const m = buildAsteroidFormations(field, { seed: 13 });
  assert.equal(m.formations.length, 1);
  const f = m.formations[0];
  assert.equal(f.archetype, 'af_matriarch');
  assert.equal(f.anchorAsteroidId, 'm0');
  assert.equal(f.coreCandidateId, 'm0');
  assert.ok(f.mass.dominance > 0.9);
});

test('a drawn-out chain classifies as a rubble stream', () => {
  const field = [];
  for (let i = 0; i < 9; i++) field.push(rock(`r${i}`, i * 100, 0, 8));
  const m = buildAsteroidFormations(field, { seed: 17 });
  assert.equal(m.formations.length, 1);
  const f = m.formations[0];
  assert.equal(f.count, 9);
  assert.ok(f.elongation > 0.9, `a straight line should be highly elongated, got ${f.elongation}`);
  assert.equal(f.archetype, 'af_rubble_stream');
});

test('OVERLAPPING bodies at identical positions do not produce NaN', () => {
  const field = [
    rock('o1', 500, -500, 10),
    rock('o2', 500, -500, 10),
    rock('o3', 500, -500, 10),
    rock('o4', 500, -500, 10),
  ];
  const m = buildAsteroidFormations(field, { seed: 19 });
  assert.equal(m.formations.length, 1);
  const f = m.formations[0];
  assert.equal(f.count, 4);
  assert.equal(f.elongation, 0, 'coincident points have no principal axis');
  assert.equal(f.principalAxisRad, 0);
  assert.equal(f.centroid.x, 500);
  assert.equal(f.centroid.z, -500);
  assertAllFinite(m);
  // Nothing is "in front" of a coincident pile, so every corridor reads fully clear.
  for (const c of f.approachCorridors) assert.equal(c.clearance, 1);
});

test('DEGENERATE input: zero radius, zero coords, and huge coords stay finite', () => {
  const field = [
    rock('g1', 0, 0, 0),
    rock('g2', 0, 0, 0),
    rock('g3', 1e12, -1e12, 1e6),
  ];
  const m = buildAsteroidFormations(field, { seed: 23 });
  assert.equal(m.bodyCount, 3);
  assertAllFinite(m);
  for (const f of m.formations) {
    assert.ok(f.spanRadius > 0, 'span must never be zero');
    for (const v of [f.packing, f.elongation, f.gasRisk, f.thermalRisk, f.sensorSignature, f.siteAffinity, f.resourceContinuity]) {
      assert.ok(v >= 0 && v <= 1, `expected [0,1], got ${v}`);
    }
  }
});

// --- fail-closed on bad input --------------------------------------------------------------------

test('non-finite and malformed bodies are rejected, not crashed on', () => {
  const field = [
    rock('ok1', 0, 0, 10),
    rock('ok2', 60, 0, 10),
    { id: 'nanx', pos: { x: NaN, z: 0 }, radius: 10 },
    { id: 'infz', pos: { x: 0, z: Infinity }, radius: 10 },
    { id: 'nanr', pos: { x: 0, z: 0 }, radius: NaN },
    { id: 'negr', pos: { x: 0, z: 0 }, radius: -5 },
    { pos: { x: 0, z: 0 }, radius: 10 }, // missing id
    null,
    'not-an-object',
  ];
  const m = buildAsteroidFormations(field, { seed: 31 });

  assert.equal(m.bodyCount, 2, 'only the two valid bodies survive');
  assert.equal(m.formations.length, 1);
  assertAllFinite(m);

  const byKey = Object.fromEntries(m.rejected.filter((r) => r.key).map((r) => [r.key, r.reason]));
  assert.equal(byKey.nanx, FORMATION_REJECT_REASON.NON_FINITE_POSITION);
  assert.equal(byKey.infz, FORMATION_REJECT_REASON.NON_FINITE_POSITION);
  assert.equal(byKey.nanr, FORMATION_REJECT_REASON.NON_FINITE_RADIUS);
  assert.equal(byKey.negr, FORMATION_REJECT_REASON.NON_FINITE_RADIUS);
  assert.equal(m.rejected.filter((r) => r.reason === FORMATION_REJECT_REASON.MISSING_KEY).length, 1);
  assert.equal(m.rejected.filter((r) => r.reason === FORMATION_REJECT_REASON.NOT_OBJECT).length, 2);
});

test('duplicate keys are rejected so anchor uniqueness always holds', () => {
  const field = [rock('dup', 0, 0, 10), rock('dup', 40, 0, 10), rock('other', 80, 0, 10)];
  const m = buildAsteroidFormations(field, { seed: 33 });
  assert.equal(m.bodyCount, 2, 'the second "dup" is dropped');
  assert.equal(m.rejected.length, 1);
  assert.equal(m.rejected[0].reason, FORMATION_REJECT_REASON.DUPLICATE_KEY);
  assert.equal(m.rejected[0].key, 'dup');
  const anchors = m.formations.map((f) => f.anchorAsteroidId);
  assert.equal(new Set(anchors).size, anchors.length);
});

test('a non-finite seed falls back to a defined deterministic model', () => {
  const field = twoGroupField();
  const nan = buildAsteroidFormations(field, { seed: NaN });
  const inf = buildAsteroidFormations(field, { seed: Infinity });
  const zero = buildAsteroidFormations(field, { seed: 0 });
  assert.deepStrictEqual(nan, zero);
  assert.deepStrictEqual(inf, zero);
  assert.deepStrictEqual(buildAsteroidFormations(field), zero, 'omitted opts defaults to seed 0');
  assertAllFinite(nan);
});

test('unknown typeIds use the safe default instead of throwing', () => {
  const field = [
    rock('u1', 0, 0, 10, 'ast_totally_made_up'),
    rock('u2', 60, 0, 10, null),
    { id: 'u3', pos: { x: 120, z: 0 }, radius: 10, data: {} },
  ];
  const m = buildAsteroidFormations(field, { seed: 37 });
  assert.equal(m.bodyCount, 3);
  assertAllFinite(m);
});

// --- coordinate-dependence contract ---------------------------------------------------------------

test('TRANSLATION invariance: only the centroid moves', () => {
  const field = twoGroupField();
  const base = buildAsteroidFormations(field, { seed: 55 });
  const dx = 9000; const dz = -12345;
  const moved = buildAsteroidFormations(translate(field, dx, dz), { seed: 55 });

  assert.equal(moved.formations.length, base.formations.length);
  for (let i = 0; i < base.formations.length; i++) {
    const b = base.formations[i]; const t = moved.formations[i];
    // Everything coordinate-independent is byte-identical.
    assert.deepStrictEqual(invariantView(t), invariantView(b));
    // Corridors are relative geometry, so translation does not disturb them either.
    assert.deepStrictEqual(t.approachCorridors, b.approachCorridors);
    assert.equal(t.principalAxisRad, b.principalAxisRad);
    // The centroid is translation-DEPENDENT and must actually have moved.
    assert.ok(Math.abs(t.centroid.x - (b.centroid.x + dx)) < 1e-3, 'centroid.x must translate');
    assert.ok(Math.abs(t.centroid.z - (b.centroid.z + dz)) < 1e-3, 'centroid.z must translate');
    assert.notEqual(t.centroid.x, b.centroid.x);
  }
});

test('ROTATION invariance: grouping, ids and intrinsics hold; bearings and axis move', () => {
  const field = twoGroupField();
  const base = buildAsteroidFormations(field, { seed: 66 });
  const theta = 0.7; // ~40 degrees: not a multiple of the corridor grid
  const spun = buildAsteroidFormations(rotate(field, theta), { seed: 66 });

  assert.equal(spun.formations.length, base.formations.length);
  let axisMoved = false;
  let corridorsMoved = false;

  for (let i = 0; i < base.formations.length; i++) {
    const b = base.formations[i]; const r = spun.formations[i];

    // Discrete coordinate-independent properties: exact.
    assert.equal(r.id, b.id, 'ids must not depend on orientation');
    assert.deepStrictEqual(r.memberIds, b.memberIds, 'membership must not depend on orientation');
    assert.equal(r.archetype, b.archetype);
    assert.equal(r.anchorAsteroidId, b.anchorAsteroidId);
    assert.equal(r.designation, b.designation);
    assert.equal(r.dominantTypeId, b.dominantTypeId);
    assert.deepStrictEqual(r.mass, b.mass, 'mass distribution is orientation-free');
    assert.equal(r.resourceContinuity, b.resourceContinuity);

    // Continuous coordinate-independent properties: within FP epsilon of the rotation.
    for (const k of ['spanRadius', 'packing', 'elongation', 'gasRisk', 'thermalRisk', 'sensorSignature', 'siteAffinity']) {
      assert.ok(Math.abs(r[k] - b[k]) < 1e-3, `${k} must be rotation-invariant (${b[k]} -> ${r[k]})`);
    }

    // The centroid must have rotated with the field.
    const cx = b.centroid.x * Math.cos(theta) - b.centroid.z * Math.sin(theta);
    const cz = b.centroid.x * Math.sin(theta) + b.centroid.z * Math.cos(theta);
    assert.ok(Math.abs(r.centroid.x - cx) < 1e-2, 'centroid.x must rotate');
    assert.ok(Math.abs(r.centroid.z - cz) < 1e-2, 'centroid.z must rotate');

    if (r.principalAxisRad !== b.principalAxisRad) axisMoved = true;
    // The bearing grid itself is world-fixed and never changes...
    assert.deepStrictEqual(
      r.approachCorridors.map((c) => c.bearingRad),
      b.approachCorridors.map((c) => c.bearingRad),
      'the bearing grid is authored and fixed',
    );
    // ...but the clearances along it must re-shuffle.
    const bc = b.approachCorridors.map((c) => c.clearance).join(',');
    const rc = r.approachCorridors.map((c) => c.clearance).join(',');
    if (bc !== rc) corridorsMoved = true;
  }

  // Guards against the invariance test passing on a model that simply ignores position.
  assert.ok(axisMoved, 'principalAxisRad is rotation-DEPENDENT and must change');
  assert.ok(corridorsMoved, 'approach corridor clearances are rotation-DEPENDENT and must change');
});

// --- derived-property sanity ------------------------------------------------------------------

test('resource continuity reflects material homogeneity', () => {
  const pure = buildAsteroidFormations([
    rock('h1', 0, 0, 10, 'ast_metallic'),
    rock('h2', 60, 0, 10, 'ast_metallic'),
    rock('h3', 120, 0, 10, 'ast_metallic'),
  ], { seed: 71 }).formations[0];

  const mixed = buildAsteroidFormations([
    rock('x1', 0, 0, 10, 'ast_metallic'),
    rock('x2', 60, 0, 10, 'ast_icy'),
    rock('x3', 120, 0, 10, 'ast_crystalline'),
  ], { seed: 71 }).formations[0];

  assert.equal(pure.resourceContinuity, 1);
  assert.equal(pure.dominantTypeId, 'ast_metallic');
  assert.ok(mixed.resourceContinuity < pure.resourceContinuity);
});

test('richness tracks surveyed yield and is independent of siteAffinity', () => {
  const rich = buildAsteroidFormations([
    rock('y1', 0, 0, 10, 'ast_metallic', { data: { typeId: 'ast_metallic', yieldU: 32 } }),
    rock('y2', 60, 0, 10, 'ast_metallic', { data: { typeId: 'ast_metallic', yieldU: 32 } }),
  ], { seed: 72 }).formations[0];
  // Same ids, same geometry, same material — ONLY yieldU differs. Reusing the ids holds the
  // seeded per-anchor variance roll constant so the siteAffinity comparison below is exact.
  const poor = buildAsteroidFormations([
    rock('y1', 0, 0, 10, 'ast_metallic', { data: { typeId: 'ast_metallic', yieldU: 4 } }),
    rock('y2', 60, 0, 10, 'ast_metallic', { data: { typeId: 'ast_metallic', yieldU: 4 } }),
  ], { seed: 72 }).formations[0];

  assert.equal(rich.richness, 1, 'yieldU at the authored reference reads as fully rich');
  assert.equal(rich.yieldTotal, 64);
  assert.ok(poor.richness < rich.richness);
  assert.equal(poor.yieldTotal, 8);
  // Geometry and material are identical, so the Core-siting answer must be identical too:
  // richness is survey data, not a placement input.
  assert.equal(rich.siteAffinity, poor.siteAffinity);

  // A body with no yield data at all stays finite and reads as zero richness.
  const none = buildAsteroidFormations([
    { id: 'n1', pos: { x: 0, z: 0 }, radius: 10 },
  ], { seed: 72 }).formations[0];
  assert.equal(none.richness, 0);
  assert.equal(none.yieldTotal, 0);
});

test('gas-rich formations read as high gas risk; plain rock does not', () => {
  const gassy = buildAsteroidFormations([
    rock('gg1', 0, 0, 16, 'ast_gas_cloud'),
    rock('gg2', 70, 0, 16, 'ast_gas_cloud'),
  ], { seed: 73 }).formations[0];
  const stony = buildAsteroidFormations([
    rock('sr1', 0, 0, 16, 'ast_common_rock'),
    rock('sr2', 70, 0, 16, 'ast_common_rock'),
  ], { seed: 73 }).formations[0];

  assert.ok(gassy.gasRisk > 0.5, `expected high gas risk, got ${gassy.gasRisk}`);
  assert.ok(stony.gasRisk < 0.2, `expected low gas risk, got ${stony.gasRisk}`);
  assert.ok(gassy.gasRisk > stony.gasRisk);
});

test('exotic material and greater mass raise the sensor signature', () => {
  const loud = buildAsteroidFormations([
    rock('e1', 0, 0, 13, 'ast_rare_exotic'),
    rock('e2', 70, 0, 13, 'ast_rare_exotic'),
    rock('e3', 140, 0, 13, 'ast_rare_exotic'),
  ], { seed: 79 }).formations[0];
  const quiet = buildAsteroidFormations([
    rock('q1', 0, 0, 6, 'ast_common_rock'),
  ], { seed: 79 }).formations[0];
  assert.ok(loud.sensorSignature > quiet.sensorSignature);
});

test('site affinity prefers a dominant, homogeneous, gas-free formation', () => {
  const good = buildAsteroidFormations([
    rock('sa1', 0, 0, 26, 'ast_metallic', { mass: 15000 }),
    rock('sa2', 80, 10, 6, 'ast_metallic', { mass: 400 }),
  ], { seed: 83 }).formations[0];
  const bad = buildAsteroidFormations([
    rock('sb1', 0, 0, 12, 'ast_gas_cloud', { mass: 700 }),
    rock('sb2', 80, 0, 12, 'ast_icy', { mass: 700 }),
    rock('sb3', 160, 20, 12, 'ast_crystalline', { mass: 700 }),
  ], { seed: 83 }).formations[0];
  assert.ok(good.siteAffinity > bad.siteAffinity,
    `expected ${good.siteAffinity} > ${bad.siteAffinity}`);
  assert.equal(good.coreCandidateId, 'sa1', 'the core candidate is the dominant body');
});

test('approach corridors are blocked where mass sits and clear where it does not', () => {
  // A tight line of rocks along +X only; the centroid sits inside the line.
  const field = [];
  for (let i = 0; i < 6; i++) field.push(rock(`c${i}`, i * 70, 0, 12));
  const f = buildAsteroidFormations(field, { seed: 91 }).formations[0];

  const along = f.approachCorridors.find((c) => Math.abs(c.bearingRad) < 1e-6);
  const across = f.approachCorridors.find((c) => Math.abs(c.bearingRad - Math.PI / 2) < 1e-3);
  assert.ok(along, 'the +X bearing must exist on the grid');
  assert.ok(across, 'the +Z bearing must exist on the grid');
  assert.ok(along.clearance < across.clearance,
    `approaching along the chain (${along.clearance}) should be more blocked than across it (${across.clearance})`);
  assert.equal(f.bestApproachBearingRad, f.approachCorridors
    .reduce((best, c) => (c.clearance > best.clearance ? c : best)).bearingRad);
});

// --- exported helpers ---------------------------------------------------------------------------

test('classifyArchetype is total and fail-closed', () => {
  assert.equal(classifyArchetype({ count: 1 }), 'af_solitary');
  assert.equal(classifyArchetype({ count: 2 }), 'af_shepherd_pair');
  assert.equal(classifyArchetype({ count: 5, dominance: 0.9 }), 'af_matriarch');
  assert.equal(classifyArchetype({ count: 5, dominance: 0.1, elongation: 0.95 }), 'af_rubble_stream');
  assert.equal(classifyArchetype({ count: 5, dominance: 0.1, elongation: 0.1, packing: 0.9 }), 'af_dense_cluster');
  assert.equal(classifyArchetype({ count: 5, dominance: 0.1, elongation: 0.1, packing: 0.01 }), 'af_drift_swarm');
  // Garbage in => a defined archetype out, never a throw or undefined.
  for (const bad of [undefined, {}, { count: NaN }, { count: 5, dominance: NaN, elongation: NaN, packing: NaN }]) {
    const id = classifyArchetype(bad);
    assert.ok(FORMATION_ARCHETYPE_BY_ID[id], `classifyArchetype returned unknown archetype ${id}`);
  }
});

test('linkDistance is symmetric, capped, and fail-closed', () => {
  assert.equal(linkDistance(10, 20), linkDistance(20, 10));
  assert.equal(linkDistance(0, 0), FORMATION_LINK.baseGap);
  assert.equal(linkDistance(1e9, 1e9), FORMATION_LINK.maxGap);
  assert.ok(Number.isFinite(linkDistance(NaN, Infinity)));
  assert.equal(linkDistance(NaN, NaN), FORMATION_LINK.baseGap);
});

test('every archetype id in the table is reachable and named', () => {
  for (const id of Object.keys(FORMATION_ARCHETYPE_BY_ID)) {
    assert.equal(typeof FORMATION_ARCHETYPE_BY_ID[id].name, 'string');
    assert.ok(FORMATION_ARCHETYPE_BY_ID[id].name.length > 0);
  }
});
