// The active swarm gate froze at sim 9.3s: fightBeat mouse-down landed on the
// racing HUD Circuits button, opened the race board, and the reader then
// heap-OOMed. The click must step off that control toward the canvas.
import test from 'node:test';
import assert from 'node:assert/strict';
import { retreatAim, swarmBreakWanted, swarmKiteKey } from '../scripts/player-truth/driver.mjs';

test('an aim point on the top tape steps toward canvas center until it is clear', () => {
  const cx = 480;
  const cy = 270;
  const onButton = (_x, y) => y < 40;
  const aim = retreatAim(480, 12, cx, cy, onButton);
  assert.ok(aim.y >= 40, `y ${aim.y} still on the tape`);
  assert.ok(aim.y < cy, 'it stops at the first clear point, short of center');
});

test('eight blocked steps fall back to canvas center', () => {
  assert.deepEqual(retreatAim(10, 10, 480, 270, () => true), { x: 480, y: 270 });
});

test('a clear point is used as-is', () => {
  assert.deepEqual(retreatAim(100, 200, 480, 270, () => false), { x: 100, y: 200 });
});

test('the swarm fighter stays inside the 260 u guns unless the pack is actually on it', () => {
  assert.equal(swarmKiteKey(400, 0, false), 'KeyW', 'outside the guns, close in');
  assert.equal(swarmKiteKey(100, 0, false), 'KeyS', 'inside 150, brake');
  assert.equal(swarmKiteKey(200, 2, false), null, 'inside 150–250, the coast beat does not chase');
  assert.equal(swarmKiteKey(200, 0, false), 'KeyW', 'inside the band, the other beats hold the range');
  assert.equal(swarmKiteKey(100, 0, true), 'KeyW', 'a break burns out even from close range');
  const wave = { near: 10, packDist: 400, hull: 1 };
  assert.equal(swarmBreakWanted(wave, 0), false, 'a 10-ship wave at 400 u is the fight, not a flee');
  assert.equal(swarmBreakWanted({ near: 4, packDist: 100, hull: 1 }, 0), true);
  assert.equal(swarmBreakWanted({ near: 3, packDist: 50, hull: 1 }, 0), false, 'three hostiles are not a surround');
  assert.equal(swarmBreakWanted({ near: 1, packDist: 40, hull: 1 }, 0.05), true, 'a real hit still breaks');
  assert.equal(swarmBreakWanted({ near: 2, packDist: 200, hull: 0.4 }, 0), true);
  assert.equal(swarmBreakWanted({ near: 2, packDist: 500, hull: 0.4 }, 0), false, 'low hull at long range stays on the guns');
});
