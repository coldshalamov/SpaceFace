// Silhouettes are real meshes: extruded planforms, one per variant, drawn from the public scene.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { openCourt, publicView, listCourtCases } from '../src/systems/wreckCourt.js';
import { presentCourt, extrudePolygon } from '../src/render/wreckCourt/present.js';
import { WRECK_COURT_VARIANT_IDS } from '../src/data/wreckCourt/variants.js';

test('every case draws a distinct extruded wreck, and the catalog matches the asset', () => {
  const asset = JSON.parse(readFileSync(new URL('../assets/wreck-court/variants.json', import.meta.url), 'utf8'));
  assert.deepEqual(asset.variants.map((v) => v.id), [...WRECK_COURT_VARIANT_IDS]);
  const used = new Set();
  const meshes = new Map();
  for (const caseId of listCourtCases()) {
    const picture = presentCourt(publicView(openCourt({ caseId, seed: 40404 })));
    assert.ok(picture.draws.length >= 2, caseId);
    assert.equal(picture.camera.y > 0, true);
    for (const draw of picture.draws) {
      used.add(draw.variant);
      assert.ok(draw.indices.length >= 12, draw.id);
      assert.equal(draw.positions.length, draw.normals.length);
      assert.equal(draw.positions.length % 3, 0);
      meshes.set(draw.variant, draw.positions.slice(0, 12).join(','));
    }
  }
  assert.ok(used.size >= 12, `only ${used.size} variants drawn`);
  assert.ok(meshes.size >= 12);
  const tug = extrudePolygon([[-1, -1], [2, 0], [-1, 1]], 2);
  const hauler = extrudePolygon([[-2, -1], [2, -1], [2, 1], [-2, 1]], 3);
  assert.notEqual(tug.positions.join(','), hauler.positions.join(','));
  const sling = presentCourt(publicView(openCourt({ caseId: 'wc_slingshot_disappearance', seed: 40404 })));
  assert.equal(sling.draws.some((d) => d.id === 'ship'), false);
  assert.ok(sling.draws.some((d) => d.variant === 'wc_vent'));
  assert.ok(sling.draws.some((d) => d.variant === 'wc_planetoid'));
});
