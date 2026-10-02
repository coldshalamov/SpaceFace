// GFX-16 slice 5: every commodity category has its own authored pickup solid, the baked geometry is
// sound, and the visual factory wires it in without disturbing the motion/tint contracts.
import assert from 'node:assert/strict';
import test from 'node:test';

import { COMMODITIES } from '../src/data/commodities.js';
import {
  PICKUP_SHAPES,
  PICKUP_SHAPE_BY_CATEGORY,
  buildPickupGeometry,
  pickupShapeForCommodity,
} from '../src/render/pickupShapes.js';
import { createVisualFactory, invalidateVisualFactoryCaches } from '../src/render/visualFactory.js';

globalThis.__SF_VISUAL_FACTORY_THROW__ = true;   // a wiring bug must fail the test, not fall back

test('the baked kit has one distinct, sound solid per shape name', () => {
  const names = Object.keys(PICKUP_SHAPES);
  assert.equal(names.length, 17, 'sixteen categories plus the cut gem');
  const seen = new Set();
  for (const name of names) {
    const shape = PICKUP_SHAPES[name];
    assert.ok(shape.tris >= 20 && shape.tris <= 250, `${name}: ${shape.tris} tris is outside the 20..250 budget`);
    assert.equal(shape.indices.length, shape.tris * 3, `${name}: index count`);
    assert.equal(shape.positions.length % 3, 0, `${name}: position triples`);
    const vertCount = shape.positions.length / 3;
    let farthest = 0;
    for (let i = 0; i < shape.positions.length; i += 3) {
      const x = shape.positions[i]; const y = shape.positions[i + 1]; const z = shape.positions[i + 2];
      assert.ok(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z), `${name}: finite positions`);
      farthest = Math.max(farthest, Math.hypot(x, y, z));
    }
    assert.ok(farthest <= 1.0005 && farthest >= 0.95, `${name}: must fit (and fill) the unit sphere, got ${farthest}`);
    for (const ix of shape.indices) assert.ok(Number.isInteger(ix) && ix >= 0 && ix < vertCount, `${name}: index in range`);
    const key = shape.positions.join(',');
    assert.ok(!seen.has(key), `${name}: duplicates another shape`);
    seen.add(key);
  }
});

test('every commodity resolves to a kit shape; gems read as gems; unknown ids keep the octahedron', () => {
  for (const c of COMMODITIES) {
    const shape = pickupShapeForCommodity(c.id);
    assert.ok(shape && PICKUP_SHAPES[shape], `${c.id} (${c.category}) has no pickup shape`);
  }
  for (const category of new Set(COMMODITIES.map((c) => c.category))) {
    assert.ok(PICKUP_SHAPE_BY_CATEGORY[category], `category "${category}" is not mapped`);
  }
  assert.equal(pickupShapeForCommodity('cmdty_gem_ruby'), 'gem');
  assert.equal(pickupShapeForCommodity('cmdty_exotic_amazonite'), 'gem');
  assert.equal(pickupShapeForCommodity('cmdty_ore_iron'), 'raw_ore');
  assert.equal(pickupShapeForCommodity('cmdty_gas_hydrogen'), 'gas');
  assert.equal(pickupShapeForCommodity('not_a_commodity'), null);
  assert.equal(pickupShapeForCommodity(null), null);
});

test('geometry is flat-shaded: non-indexed, one normal per face, unit-length normals', () => {
  const geo = buildPickupGeometry('component');
  assert.equal(geo.index, null);
  assert.equal(geo.attributes.position.count, PICKUP_SHAPES.component.tris * 3);
  const n = geo.attributes.normal;
  for (let i = 0; i < n.count; i++) {
    const len = Math.hypot(n.getX(i), n.getY(i), n.getZ(i));
    assert.ok(Math.abs(len - 1) < 1e-4, 'unit normal');
  }
  // the three vertices of a triangle share one normal (flat), unlike a smoothed mesh
  assert.ok(Math.abs(n.getX(0) - n.getX(1)) < 1e-6 && Math.abs(n.getY(0) - n.getY(2)) < 1e-6);
  assert.equal(buildPickupGeometry('nope'), null);
});

test('the visual factory gives each category its own shared geometry and keeps the pickup contracts', () => {
  invalidateVisualFactoryCaches();
  const factory = createVisualFactory();
  const make = (id, commodityId, extra = {}) => factory.build({
    id, type: 'pickup', radius: 2.2, pos: { x: 0, z: 0 }, data: { kind: 'commodity', commodityId, ...extra },
  });
  const ore1 = make(101, 'cmdty_ore_iron');
  const ore2 = make(102, 'cmdty_ore_copper');
  const gas = make(103, 'cmdty_gas_hydrogen');
  const mystery = factory.build({ id: 104, type: 'pickup', radius: 2.2, pos: { x: 0, z: 0 }, data: { kind: 'module' } });

  for (const v of [ore1, ore2, gas, mystery]) {
    assert.ok(v, 'built');
    assert.equal(v.userData.kind, 'pickup');
    assert.ok(v.userData.gem && v.userData.gem.isMesh, 'userData.gem stays the mesh the motion presentation drives');
    assert.equal(v.userData.gem.scale.x, 2.2, 'scale = radius, so hit and magnet radii are unchanged');
  }
  // same category -> the SAME cached geometry (no per-pickup geometry); different category -> different solid
  assert.equal(ore1.userData.gem.geometry, ore2.userData.gem.geometry);
  assert.notEqual(ore1.userData.gem.geometry, gas.userData.gem.geometry);
  assert.equal(ore1.userData.gem.geometry.attributes.position.count, PICKUP_SHAPES.raw_ore.tris * 3);
  assert.equal(gas.userData.gem.geometry.attributes.position.count, PICKUP_SHAPES.gas.tris * 3);
  assert.equal(ore1.userData.pickupShape, 'raw_ore');
  assert.equal(gas.userData.pickupShape, 'gas');
  // non-commodity pickups keep the original octahedron (8 faces)
  assert.equal(mystery.userData.gem.geometry.type, 'OctahedronGeometry');
  assert.equal(mystery.userData.pickupShape, 'octahedron');
  // tint is untouched: still the category colour on an emissive dark-metal material
  assert.equal(ore1.userData.gem.material.emissive.getHexString(), 'c89a6a');
  assert.equal(gas.userData.gem.material.emissive.getHexString(), '59d6c7');
});
