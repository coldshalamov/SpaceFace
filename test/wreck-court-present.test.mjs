// Each wreck cites a Forge place. The shipping picture is not an extruded planform.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { openCourt, publicView, listCourtCases } from '../src/systems/wreckCourt.js';
import { presentCourt } from '../src/render/wreckCourt/present.js';
import { WRECK_COURT_VARIANT_IDS } from '../src/data/wreckCourt/variants.js';
import { WRECK_COURT_PLACES } from '../src/data/wreckCourt/places.js';
import { DT } from '../src/data/wreckCourt/physics.js';
import { SIM_DT } from '../src/core/sim.js';

test('every case cites a Forge place and does not extrude a polygon', () => {
  const asset = JSON.parse(readFileSync(new URL('../assets/wreck-court/variants.json', import.meta.url), 'utf8'));
  assert.deepEqual(asset.variants.map((v) => v.id), [...WRECK_COURT_VARIANT_IDS]);
  const source = readFileSync(new URL('../src/render/wreckCourt/present.js', import.meta.url), 'utf8');
  assert.equal(source.includes('extrudePolygon'), false);
  assert.equal(source.includes('indices'), false);
  assert.equal(DT, SIM_DT);
  const used = new Set();
  for (const caseId of listCourtCases()) {
    const picture = presentCourt(publicView(openCourt({ caseId, seed: 40404 })));
    assert.ok(picture.draws.length >= 2, caseId);
    assert.equal(picture.camera.y > 0, true);
    for (const draw of picture.draws) {
      used.add(draw.variant);
      assert.equal(draw.extruded, false, draw.id);
      assert.equal(draw.placeId, WRECK_COURT_PLACES[draw.variant], draw.id);
      assert.equal(draw.indices, undefined, draw.id);
      assert.equal(draw.positions, undefined, draw.id);
      assert.equal(typeof draw.x, 'number');
      assert.equal(typeof draw.z, 'number');
    }
  }
  assert.ok(used.size >= 12, `only ${used.size} variants drawn`);
  const tug = presentCourt(publicView(openCourt({ caseId: 'wc_abandoned_tow', seed: 40404 })));
  const haulerDraw = tug.draws.find((d) => d.variant === 'wc_hauler');
  const tugDraw = tug.draws.find((d) => d.variant === 'wc_tug');
  assert.ok(haulerDraw && tugDraw);
  assert.notEqual(haulerDraw.placeId, tugDraw.placeId);
  const sling = presentCourt(publicView(openCourt({ caseId: 'wc_slingshot_disappearance', seed: 40404 })));
  assert.equal(sling.draws.some((d) => d.id === 'ship'), false);
  assert.ok(sling.draws.some((d) => d.variant === 'wc_vent'));
  assert.ok(sling.draws.some((d) => d.variant === 'wc_planetoid'));
});
