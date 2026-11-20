// MAPS-2 — the chart's local survey:
//   - a round-metre survey grid that never crowds (lines at least ~72 px apart)
//   - stations drawn by type with their services as pips; hostile stations red
//   - one rock-field painter shared with the minimap (fields only where rocks cluster)
import test from 'node:test';
import assert from 'node:assert/strict';

import { surveyGridStep, drawSurveyStation } from '../src/ui/galaxyMap.js';
import { createRockFieldPainter, isRockRecord } from '../src/ui/map/rockFieldRegion.js';
import { createMapCamera, globalToScreen, screenToGlobal } from '../src/ui/map/mapCamera.js';
import { projectRadarPoint, tacticalRadarMetrics } from '../src/ui/map/tacticalMapGrammar.js';
import { playerBearingLetter } from '../src/core/playerCompass.js';

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

test('minimap, chart and the 3D view agree: east (+x) is screen left, north (+z) is screen up', () => {
  // Measured live 2026-11-20 through the renderer's worldToScreen: a point 300 m east of the ship
  // projects 2134 px to its LEFT; 300 m north (+z) projects 867 px ABOVE it.
  const view = { width: 800, height: 600 };
  const cam = createMapCamera({ focusGlobal: { x: 0, z: 0 }, spanWU: 2000 });
  const centre = globalToScreen(cam, { x: 0, z: 0 }, view);
  const east = globalToScreen(cam, { x: 300, z: 0 }, view);
  const north = globalToScreen(cam, { x: 0, z: 300 }, view);
  assert.ok(east.x < centre.x && Math.abs(east.y - centre.y) < 1e-6, 'chart: east is left');
  assert.ok(north.y < centre.y && Math.abs(north.x - centre.x) < 1e-6, 'chart: north is up');
  const back = screenToGlobal(cam, east, view);
  assert.ok(Math.abs(back.x - 300) < 1e-6 && Math.abs(back.z) < 1e-6, 'chart unprojects exactly');
  const m = tacticalRadarMetrics(false);
  const rEast = projectRadarPoint({ x: 0, z: 0 }, { x: 300, z: 0 }, 1000, m);
  const rNorth = projectRadarPoint({ x: 0, z: 0 }, { x: 0, z: 300 }, 1000, m);
  assert.ok(rEast.x < m.center && rNorth.y < m.center, 'minimap: east left, north up');
  assert.equal(playerBearingLetter(300, 0), 'E');
  assert.equal(playerBearingLetter(0, 300), 'N');
});
