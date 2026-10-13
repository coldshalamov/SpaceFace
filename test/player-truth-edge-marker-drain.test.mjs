import test from 'node:test';
import assert from 'node:assert/strict';
import { drainPlayerTruth, observeEdgeMarkers } from '../scripts/player-truth/driver.mjs';
import { checkOffscreenMarker } from '../scripts/player-truth/checks.mjs';

test('a drain observes each visible marker and its exact live shooter in one browser task', async () => {
  const prior = Object.fromEntries(['window', 'document', 'getComputedStyle'].map(key => [key, globalThis[key]]));
  const samples = [{ f: 1, e: [] }];
  const shooter = { id: 7, occupantGeneration: 17, type: 'ship', alive: true, pos: { x: 15, z: 25 } };
  const at = performance.now();
  const placement = { version: 1, id: 7, generation: 17, at, expiresAt: at + 250,
    x: 480, y: 600, onScreen: false, behind: false };
  let evaluations = 0;
  globalThis.window = { innerWidth: 960, innerHeight: 540,
    __playerTruth: { drain: () => ({ samples, events: [], keys: [] }) },
    SF: { state: { entities: new Map([[7, shooter]]) }, ctx: { helpers: { worldToScreen() {
      throw new Error('a newer sim projection must not replace the producer placement');
    } } } } };
  globalThis.document = { querySelectorAll: () => [{
    getAttribute: key => key === 'data-entity-id' ? '7'
      : key === 'data-placement-read' ? JSON.stringify(placement) : 'bottom',
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

test('producer placement cannot excuse a stale, dead, disarmed, recycled or wrong-side chip', () => {
  const prior = Object.fromEntries(['window', 'document', 'getComputedStyle'].map(key => [key, globalThis[key]]));
  const at = performance.now();
  const shooter = { id: 7, occupantGeneration: 17, type: 'ship', alive: true, data: {}, pos: { x: 15, z: 25 } };
  let placement = { version: 1, id: 7, generation: 17, at, expiresAt: at + 250,
    x: 480, y: 600, onScreen: false, behind: false };
  globalThis.window = { innerWidth: 960, innerHeight: 540, SF: { state: { entities: new Map([[7, shooter]]) } } };
  globalThis.document = { querySelectorAll: () => [{
    getAttribute: key => key === 'data-entity-id' ? '7' : key === 'data-placement-read'
      ? (placement ? JSON.stringify(placement) : null) : 'bottom',
    getBoundingClientRect: () => ({ left: 470, top: 518, width: 20, height: 20 }),
  }] };
  globalThis.getComputedStyle = () => ({ display: 'block', visibility: 'visible', opacity: '1' });
  const verdict = () => checkOffscreenMarker({ meta: { rounds: false }, samples: [{ mode: 'flight', vw: 960,
    vh: 540, e: [], edgeMarkers: observeEdgeMarkers() }] });
  try {
    assert.equal(verdict().status, 'PASS');
    for (const invalidate of [
      () => { placement.expiresAt = at - 1; },
      () => { shooter.alive = false; },
      () => { shooter.data.unarmed = true; },
      () => { shooter.data.weapons = []; },
      () => { shooter.occupantGeneration = 18; },
      () => { placement = null; },
      () => { placement.x = -10; placement.y = 270; },
    ]) {
      placement = { version: 1, id: 7, generation: 17, at, expiresAt: at + 250,
        x: 480, y: 600, onScreen: false, behind: false };
      shooter.alive = true; shooter.occupantGeneration = 17; shooter.data = {};
      invalidate(); assert.equal(verdict().status, 'FAIL');
    }
  } finally {
    for (const [key, value] of Object.entries(prior)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  }
});
