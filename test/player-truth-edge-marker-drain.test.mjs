import test from 'node:test';
import assert from 'node:assert/strict';
import { drainPlayerTruth } from '../scripts/player-truth/driver.mjs';

test('a drain observes each visible marker and its exact live shooter in one browser task', async () => {
  const prior = Object.fromEntries(['window', 'document', 'getComputedStyle'].map(key => [key, globalThis[key]]));
  const samples = [{ f: 1, e: [] }];
  const shooter = { id: 7, alive: true, pos: { x: 15, z: 25 } };
  let evaluations = 0;
  globalThis.window = { innerWidth: 960, innerHeight: 540,
    __playerTruth: { drain: () => ({ samples, events: [], keys: [] }) },
    SF: { state: { entities: new Map([[7, shooter]]) }, ctx: { helpers: { worldToScreen(pos) {
      assert.deepEqual(pos, { x: 15, y: 0, z: 25 });
      return { x: 480, y: 600, onScreen: false, behind: false };
    } } } } };
  globalThis.document = { querySelectorAll: () => [{
    getAttribute: key => key === 'data-entity-id' ? '7' : 'bottom',
    getBoundingClientRect: () => ({ left: 470, top: 518, width: 20, height: 20 }),
  }] };
  globalThis.getComputedStyle = () => ({ display: 'block', visibility: 'visible', opacity: '1' });
  const page = { async evaluate(fn, arg) { evaluations++; return fn(arg); } };
  try {
    const result = await drainPlayerTruth(page);
    assert.equal(evaluations, 1, 'a second evaluation could observe a newer HUD frame');
    assert.deepEqual(result.samples[0].edgeMarkers, [{ edge: 'bottom', x: 480, y: 528,
      shooter: { id: 7, alive: true, onScreen: false, behind: false, x: 480, y: 600 } }]);
  } finally {
    for (const [key, value] of Object.entries(prior)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  }
});
