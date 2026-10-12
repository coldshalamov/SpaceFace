// The web build has no shell to quit, and window.close() is ignored for a tab the player opened, so
// Quit there was a dead red button. Quit is offered only where the desktop shell can act on it.
import test from 'node:test';
import assert from 'node:assert/strict';

import { canQuit } from '../src/ui/quitGame.js';
import { arcRailGeometry } from '../src/ui/orrery/arcRail.js';

test('quit: no desktop shell, no Quit', () => {
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'window');
  const prev = globalThis.window;
  try {
    globalThis.window = { close() {} };
    assert.equal(canQuit(), false, 'a browser tab cannot quit');
    globalThis.window = { close() {}, spacefaceShell: { quit() {} } };
    assert.equal(canQuit(), true, 'the desktop shell can');
  } finally {
    if (had) globalThis.window = prev; else delete globalThis.window;
  }
});

test('arc rail: a [index, lines] gap keeps the stops after it where one more verb would put them', () => {
  const place = () => ({ pivot: { x: 220, y: 220 }, re: 200, centerDeg: 112 });
  const five = arcRailGeometry(1280, 720, 6, { span: 74, place });
  const four = arcRailGeometry(1280, 720, 5, { span: 74, place, gaps: [[4, 1]] });
  for (let i = 0; i < 4; i += 1) assert.ok(Math.abs(four.anchors[i].y - five.anchors[i].y) < 1e-6, `verb ${i} holds its stop`);
  assert.ok(Math.abs(four.anchors[4].y - five.anchors[5].y) < 1e-6, 'the reference line holds its stop');
  // a bare index is still most of a line of air, as before
  const legacy = arcRailGeometry(1280, 720, 3, { span: 40, place, gaps: [1] });
  assert.equal(legacy.anchors.length, 3);
});
