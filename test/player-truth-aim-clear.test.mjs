// The active swarm gate froze at sim 9.3s: fightBeat mouse-down landed on the
// racing HUD Circuits button, opened the race board, and the reader then
// heap-OOMed. The click must step off that control toward the canvas.
import test from 'node:test';
import assert from 'node:assert/strict';
import { retreatAim } from '../scripts/player-truth/driver.mjs';

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
