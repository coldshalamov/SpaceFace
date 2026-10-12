import test from 'node:test';
import assert from 'node:assert/strict';
import { readTarget } from '../scripts/player-truth/driver.mjs';

test('fighter aims at a visible gameplay target rather than a nearer off-canvas or HUD target', () => {
  const savedWindow = globalThis.window; const savedDocument = globalThis.document;
  const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, right: 1000, bottom: 600, width: 1000, height: 600 }) };
  class Vector3 {
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    project() { this.x /= 100; this.y = -this.z / 100; this.z = 0; return this; }
  }
  const me = { id: 1, alive: true, team: 0, pos: { x: 190, z: 0 }, rot: 0, hull: 100, hullMax: 100 };
  const enemy = (id, x, z) => ({ id, alive: true, type: 'ship', team: 1, pos: { x, z }, data: {} });
  const rows = [me, enemy(2, 180, 0), enemy(3, 90, 0), enemy(4, 0, 0)];
  try {
    globalThis.window = { SF: { THREE: { Vector3 }, state: { playerId: 1, entityList: rows,
      render: { camera: {}, renderer: { domElement: canvas } } } } };
    globalThis.document = { elementFromPoint: (x, y) => x > 850 ? { tagName: 'DIV' } : canvas };
    const target = readTarget();
    assert.equal(target.x, 500);
    assert.equal(target.y, 300);
    assert.equal(target.dist, 190);
    rows.push({ ...enemy(5, 40, 0), team: me.team, data: { runRole: 'companion' } });
    assert.equal(readTarget().x, 500, 'a reachable friendly companion cannot outrank the real enemy');
    rows.pop();
    rows.pop();
    assert.equal(readTarget().none, true, 'unreachable enemies cannot produce false firing attempts');
  } finally {
    if (savedWindow === undefined) delete globalThis.window; else globalThis.window = savedWindow;
    if (savedDocument === undefined) delete globalThis.document; else globalThis.document = savedDocument;
  }
});
