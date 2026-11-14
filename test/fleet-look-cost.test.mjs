import test from 'node:test';
import assert from 'node:assert/strict';
import { measureFleetLookCost } from '../src/render/fleetLookCost.js';

function fixture(autoReset) {
  const render = { calls: 17, triangles: 29, points: 3, lines: 5, frame: 10 };
  const info = {
    autoReset, render,
    reset() { render.calls = render.triangles = render.points = render.lines = 0; },
  };
  let finishes = 0;
  const renderer = {
    info,
    getContext: () => ({ finish() { finishes++; } }),
    render() {
      if (info.autoReset) info.reset();
      render.frame++;
      render.calls++;
      render.triangles += 4;
    },
  };
  return { renderer, render, get finishes() { return finishes; } };
}

test('fleet look cost measures all passes once per frame and restores other counters', async () => {
  for (const autoReset of [true, false]) {
    const f = fixture(autoReset);
    let clock = 0;
    const result = await measureFleetLookCost({
      renderer: f.renderer, frames: 8,
      renderFrame() { f.renderer.render(); f.renderer.render(); f.renderer.render(); },
      now: () => clock++, yieldToMain: async () => {},
    });
    assert.equal(result.calls, 3);
    assert.equal(result.callsP90, 3);
    assert.equal(result.triangles, 12);
    assert.equal(result.frames, 8);
    assert.equal(f.finishes, 14);
    assert.equal(f.renderer.info.autoReset, autoReset);
    assert.deepEqual([f.render.calls, f.render.triangles, f.render.points, f.render.lines], [17, 29, 3, 5]);
  }
});

test('fleet look cost restores the renderer counters when a draw throws', async () => {
  const f = fixture(true);
  await assert.rejects(measureFleetLookCost({
    renderer: f.renderer, frames: 8, renderFrame() { throw new Error('injected draw failure'); },
    now: () => 0, yieldToMain: async () => {},
  }), /injected draw failure/);
  assert.equal(f.renderer.info.autoReset, true);
  assert.deepEqual([f.render.calls, f.render.triangles, f.render.points, f.render.lines], [17, 29, 3, 5]);
});
