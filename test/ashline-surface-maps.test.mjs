import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import sharp from 'sharp';

import { makeAshlineSurfaceMaps } from '../tools/art/lib/ashlineSurfaceMaps.mjs';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

test('Ashline maps are complete, role-correct, and visibly non-flat', async () => {
  const maps = makeAshlineSurfaceMaps({
    shipKey: 'lode',
    materialName: 'Material_Hull',
    size: 128,
  });

  for (const role of ['baseColor', 'normal', 'orm']) {
    const metadata = await sharp(maps[role]).metadata();
    assert.equal(metadata.width, 128);
    assert.equal(metadata.height, 128);
    assert.equal(metadata.format, 'png');
  }

  const baseStats = await sharp(maps.baseColor).stats();
  assert.ok(baseStats.channels[0].mean > 55, 'the hull midtone must not collapse into black');
  assert.ok(baseStats.channels[0].stdev > 10, 'repair panels and wear must create color hierarchy');

  const normalStats = await sharp(maps.normal).stats();
  assert.ok(normalStats.channels[0].stdev > 5, 'real seams and repair edges must move the X normal');
  assert.ok(normalStats.channels[1].stdev > 5, 'real seams and repair edges must move the Y normal');
  assert.ok(normalStats.channels[2].mean > 220, 'OpenGL tangent-space blue must remain dominant');

  const ormStats = await sharp(maps.orm).stats();
  assert.ok(ormStats.channels[0].stdev > 2, 'AO must respond to seams and recesses');
  assert.ok(ormStats.channels[1].stdev > 2, 'roughness must respond to paint, repairs, and wear');
  assert.ok(ormStats.channels[2].stdev > 2, 'metallic must change where paint is chipped or replaced');
});

test('each Ashline ship receives a distinct deterministic service history', () => {
  const make = (shipKey) => makeAshlineSurfaceMaps({
    shipKey,
    materialName: 'Material_Hull',
    size: 96,
  });
  const dartA = make('dart');
  const dartB = make('dart');
  const lode = make('lode');
  const rig = make('rig');

  assert.equal(sha256(dartA.baseColor), sha256(dartB.baseColor), 'same ship build must be deterministic');
  assert.notEqual(sha256(dartA.baseColor), sha256(lode.baseColor), 'Dart and Lode may not share one wear mask');
  assert.notEqual(sha256(lode.baseColor), sha256(rig.baseColor), 'Lode and Rig may not share one wear mask');
  assert.notEqual(sha256(dartA.normal), sha256(rig.normal), 'ship-specific repairs must also affect surface normals');
});

test('Ashline material roles distinguish paint, repair primer, hot metal, and refractory ceramic', async () => {
  const make = (materialName) => makeAshlineSurfaceMaps({
    shipKey: 'dart',
    materialName,
    size: 96,
  });
  const paint = make('Material_Red_Paint');
  const repair = make('Material_RepairPrimer');
  const heat = make('Material_HeatMetal');
  const refractory = make('Material_Refractory');

  assert.equal(paint.metadata.role, 'red');
  assert.equal(repair.metadata.role, 'repair');
  assert.equal(heat.metadata.role, 'heatmetal');
  assert.equal(refractory.metadata.role, 'refractory');

  const paintOrm = await sharp(paint.orm).stats();
  const repairOrm = await sharp(repair.orm).stats();
  const heatOrm = await sharp(heat.orm).stats();
  const refractoryOrm = await sharp(refractory.orm).stats();
  const refractoryColor = await sharp(refractory.baseColor).stats();
  assert.ok(paintOrm.channels[2].mean < 80, 'intact oxide paint must not read as metallic plastic');
  assert.ok(
    repairOrm.channels[2].mean < 80,
    'intact zinc/phosphate repair primer must remain dielectric',
  );
  assert.ok(
    repairOrm.channels[1].mean > paintOrm.channels[1].mean,
    'chalked repair primer must remain rougher than intact oxide paint',
  );
  assert.ok(heatOrm.channels[2].mean > 210, 'nickel hot-section metal must remain metallic');
  assert.ok(refractoryOrm.channels[2].mean < 8, 'refractory ceramic must be non-metallic');
  assert.ok(
    refractoryOrm.channels[1].mean > heatOrm.channels[1].mean,
    'dry ceramic must be rougher than heat metal',
  );
  assert.ok(
    refractoryColor.channels[0].mean > 105
      && refractoryColor.channels[1].mean > 100
      && refractoryColor.channels[2].mean > 85,
    'alumina-zirconia must read as pale dry ceramic rather than an orange glowing hoop',
  );
  assert.ok(
    refractoryColor.channels[0].stdev > 9,
    'ceramic soot, seams, and spalls must survive as material-scale variation',
  );
});

test('unknown Ashline material names fail closed instead of inheriting hull maps', () => {
  assert.throws(
    () => makeAshlineSurfaceMaps({
      shipKey: 'lode',
      materialName: 'Material_RepairPr1mer',
      size: 64,
    }),
    /unknown Ashline material role/u,
  );
});

test('curved and machined roles suppress the hull plate grid instead of wrapping leather-like seams', async () => {
  const make = (materialName) => makeAshlineSurfaceMaps({
    shipKey: 'lode',
    materialName,
    size: 128,
  });
  const hull = make('Material_Hull');
  const mechanical = make('Material_Mechanical');
  const heat = make('Material_HeatMetal');
  const refractory = make('Material_Refractory');

  const hullNormal = await sharp(hull.normal).stats();
  const mechanicalNormal = await sharp(mechanical.normal).stats();
  const heatNormal = await sharp(heat.normal).stats();
  const mechanicalColor = await sharp(mechanical.baseColor).stats();
  const heatColor = await sharp(heat.baseColor).stats();

  assert.ok(
    mechanicalNormal.channels[0].stdev < hullNormal.channels[0].stdev * 0.6,
    'machined receivers must not inherit the hull plate-grid relief',
  );
  assert.ok(
    heatNormal.channels[0].stdev < hullNormal.channels[0].stdev * 0.4,
    'rolled hot jackets must use restrained microstructure rather than block seams',
  );
  assert.ok(mechanicalNormal.channels[0].stdev > 2, 'machined metal must retain micro-response');
  assert.ok(heatNormal.channels[0].stdev > 1.5, 'hot metal must retain micro-response');
  assert.ok(
    mechanicalColor.channels[2].mean > mechanicalColor.channels[0].mean,
    'machined steel should retain a cool alloy separation',
  );
  assert.ok(
    heatColor.channels[0].mean > heatColor.channels[2].mean,
    'heat-darkened alloy should retain a warm thermal separation',
  );
  assert.equal(hull.metadata.panelFasteners, true);
  assert.equal(mechanical.metadata.panelFasteners, false);
  assert.equal(heat.metadata.panelFasteners, false);
  assert.equal(refractory.metadata.panelFasteners, false);
});
