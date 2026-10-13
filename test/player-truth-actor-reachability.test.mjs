import test from 'node:test';
import assert from 'node:assert/strict';
import { readTarget, fightBeat } from '../scripts/player-truth/driver.mjs';

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

for (const hasTarget of [false, true]) {
  test(`fighter releases ${hasTarget ? 'fire and steering' : 'search thrust'} when the public draft freezes sim time`, async () => {
    const savedWindow = globalThis.window; const savedDocument = globalThis.document;
    const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, right: 1000, bottom: 600, width: 1000, height: 600 }) };
    class Vector3 {
      set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
      project() { this.x /= 100; this.y = -this.z / 100; this.z = 0; return this; }
    }
    const me = { id: 1, alive: true, team: 0, pos: { x: 0, z: 0 }, rot: 0, hull: 100, hullMax: 100 };
    const state = { mode: 'flight', simTime: 10, playerId: 1, run: { kind: 'survival', phase: 'active' },
      entityList: [me, ...(hasTarget ? [{ id: 2, alive: true, type: 'ship', team: 1, pos: { x: 10, z: 0 }, data: {} }] : [])],
      render: { camera: {}, renderer: { domElement: canvas } } };
    const held = new Set(); let fire = false; const pressed = [];
    const page = { evaluate: async (fn, arg) => fn(arg),
      waitForTimeout: async () => { throw new Error('the actor waited on a legitimately frozen sim clock'); },
      keyboard: {
        down: async key => { held.add(key); state.run.phase = 'draft'; },
        up: async key => { held.delete(key); },
        press: async key => { pressed.push(key); },
      }, mouse: { move: async () => {}, down: async () => { fire = true; }, up: async () => { fire = false; } } };
    try {
      globalThis.window = { SF: { THREE: { Vector3 }, state } };
      globalThis.document = { elementFromPoint: () => canvas };
      await fightBeat(page, hasTarget ? 3 : 0);
      assert.equal(state.simTime, 10, 'the real modal kept its simulation freeze');
      assert.equal(held.size, 0);
      assert.equal(fire, false);
      assert.deepEqual(pressed, [], 'no combat gesture leaks into draft controls');
    } finally {
      if (savedWindow === undefined) delete globalThis.window; else globalThis.window = savedWindow;
      if (savedDocument === undefined) delete globalThis.document; else globalThis.document = savedDocument;
    }
  });
}
