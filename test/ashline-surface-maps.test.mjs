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
