// MAPS-2 — the chart's local survey:
//   - a round-metre survey grid that never crowds (lines at least ~72 px apart)
//   - stations drawn by type with their services as pips; hostile stations red
//   - one rock-field painter shared with the minimap (fields only where rocks cluster)
import test from 'node:test';
import assert from 'node:assert/strict';

import { surveyGridStep, drawSurveyStation } from '../src/ui/galaxyMap.js';
import { createRockFieldPainter, isRockRecord } from '../src/ui/map/rockFieldRegion.js';

function recordingCtx() {
  const calls = [];
  const noop = () => {};
  const handler = {
    get(target, prop) {
      if (prop in target) return target[prop];
      return (...args) => { calls.push([prop, ...args]); };
    },
    set(target, prop, value) { target[prop] = value; calls.push(['set:' + String(prop), value]); return true; },
  };
  return { ctx: new Proxy({ calls, measureText: (t) => ({ width: String(t).length * 7 }), createPattern: () => ({}), noop }, handler), calls };
}

test('the survey grid steps in round metres and keeps its lines apart', () => {
  assert.equal(surveyGridStep(1), 100);
  assert.equal(surveyGridStep(0.1), 1000);
  assert.equal(surveyGridStep(0.02), 5000);
  for (const ppm of [2, 0.5, 0.1, 0.03, 0.005]) {
    assert.ok(surveyGridStep(ppm) * ppm >= 72 || surveyGridStep(ppm) === 25000, `step for ${ppm} px/m`);
  }
});

test('a station is drawn with one pip per service, and red when hostile', () => {
  const { ctx, calls } = recordingCtx();
  drawSurveyStation(ctx, 10, 10, 'trade_hub', ['trade', 'refuel', 'repair'], {});
  assert.equal(calls.filter((c) => c[0] === 'fillRect').length, 3, 'three services, three pips');
  const hostile = recordingCtx();
  drawSurveyStation(hostile.ctx, 10, 10, 'pirate_camp', [], { hostile: true });
  assert.ok(hostile.calls.some((c) => c[0] === 'set:strokeStyle' && c[1] === '#ff6a52'), 'hostile station is red');
});

test('the rock-field painter only forms a field where rocks cluster and never paints a ship', () => {
  const painter = createRockFieldPainter(null);
  const { ctx } = recordingCtx();
  const project = (x, z) => ({ x, y: z });
  const lone = [{ type: 'asteroid', pos: { x: 50, z: 50 }, radius: 10 }];
  assert.equal(painter.paint(ctx, lone, project, 1, 400, 400), 0, 'a lone rock is not a field');
  const cluster = [0, 1, 2, 3].map((i) => ({ type: 'asteroid', pos: { x: 100 + i * 12, z: 100 }, radius: 10 }));
  assert.equal(painter.paint(ctx, cluster, project, 1, 400, 400), 4);
  assert.equal(isRockRecord({ type: 'ship', pos: { x: 0, z: 0 } }), false);
});
