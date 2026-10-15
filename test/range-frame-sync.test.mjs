import assert from 'node:assert/strict';
import test from 'node:test';

import { rangeScreen } from '../src/ui/screens/range.js';

test('range catch-up frames synchronize chrome, beam, and rail once at the final simulation state', () => {
  const screen = Object.create(rangeScreen);
  screen._accumS = 0;
  screen.state = { steps: 0 };
  const syncs = [];
  screen._stepSimulation = () => { screen.state.steps += 1; };
  screen._syncChrome = () => syncs.push(['chrome', screen.state.steps]);
  screen._syncBeam = () => syncs.push(['beam', screen.state.steps]);
  screen._syncRail = () => syncs.push(['rail', screen.state.steps]);

  const stepped = screen._advanceFrameSimulation((3 / 60) + 1e-9);

  assert.equal(stepped, true);
  assert.equal(screen.state.steps, 3, 'all accumulated fixed steps still run');
  assert.deepEqual(syncs, [
    ['chrome', 3],
    ['beam', 3],
    ['rail', 3],
  ], 'presentation sees the final catch-up state once, after simulation completes');

  syncs.length = 0;
  assert.equal(screen._advanceFrameSimulation(1 / 120), false);
  assert.equal(screen.state.steps, 3);
  assert.deepEqual(syncs, []);
});
