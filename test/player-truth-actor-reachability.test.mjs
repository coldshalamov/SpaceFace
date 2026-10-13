import test from 'node:test';
import assert from 'node:assert/strict';
import { readTarget, fightBeat } from '../scripts/player-truth/driver.mjs';
import { applyWorldObjectSelection, clearWorldObjectSelection } from '../src/ui/worldObjectInteraction.js';
import { radarHostileCourseText, publishRadarHostileCourse } from '../src/ui/radar.js';

const drawnMeshes = rows => new Map(rows.map(e => [e.id, { visible: true, matrixWorld: e.pos }]));

test('fighter aims at a visible gameplay target rather than a nearer off-canvas or HUD target', async () => {
  const savedWindow = globalThis.window; const savedDocument = globalThis.document;
  const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, right: 1000, bottom: 600, width: 1000, height: 600 }) };
  class Vector3 {
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    setFromMatrixPosition(m) { return this.set(m.x, m.y || 0, m.z); }
    project() { this.x /= 100; this.y = -this.z / 100; this.z = 0; return this; }
  }
  const me = { id: 1, alive: true, team: 0, pos: { x: 190, z: 0 }, rot: 0, hull: 100, hullMax: 100 };
  const enemy = (id, x, z) => ({ id, alive: true, type: 'ship', team: 1, pos: { x, z }, data: {} });
  const rows = [me, enemy(2, 180, 0), enemy(3, 90, 0), enemy(4, 0, 0)];
  try {
    globalThis.window = { SF: { THREE: { Vector3 }, state: { playerId: 1, entityList: rows,
      render: { camera: {}, meshes: drawnMeshes(rows), renderer: { domElement: canvas } } } } };
    globalThis.document = { elementFromPoint: (x, y) => x > 850 ? { tagName: 'DIV' } : canvas };
    const target = (await readTarget());
    assert.equal(target.x, 500);
    assert.equal(target.y, 300);
    assert.equal(target.dist, 190);
    rows.push({ ...enemy(5, 40, 0), team: me.team, data: { runRole: 'companion' } });
    assert.equal((await readTarget()).x, 500, 'a reachable friendly companion cannot outrank the real enemy');
    rows.pop();
    rows.pop();
    assert.equal((await readTarget()).none, true, 'unreachable enemies cannot produce false firing attempts');
    rows.push(enemy(6, 40, 0));
    window.SF.state.render.scene = {};
    rows.at(-1).presentationAdmission = 'pending';
    window.SF.ctx = { helpers: { worldToScreen: () => ({ x: 700, y: 300, onScreen: true }) } };
    assert.equal((await readTarget()).none, true, 'a staged pending contact cannot mask the real visible hunt');
    rows.at(-1).presentationAdmission = 'ready';
    assert.equal((await readTarget()).x, 700, 'an admitted pooled body uses the renderer projection without needing a private root');
    window.SF.state.render.meshes.set(6, { visible: true, matrixWorld: { x: 0, z: 0 } });
    assert.equal((await readTarget()).x, 500, 'a drawn hull uses the render frame rather than global simulation coordinates');
  } finally {
    if (savedWindow === undefined) delete globalThis.window; else globalThis.window = savedWindow;
    if (savedDocument === undefined) delete globalThis.document; else globalThis.document = savedDocument;
  }
});

for (const pickAccepted of [true, false, null, undefined]) test(pickAccepted == null
  ? `two public selection misses produce bounded search movement ${pickAccepted === undefined ? 'with a fresh radar and persistent visible rejected body ' : ''}and release every key`
  : `fighter publicly selects the visible subject by ${pickAccepted ? 'RMB' : 'keyboard fallback'} and follows its painted lead pip`, async () => {
  const savedWindow = globalThis.window; const savedDocument = globalThis.document;
  const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, right: 1000, bottom: 600, width: 1000, height: 600 }) };
  class Vector3 {
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    setFromMatrixPosition(m) { return this.set(m.x, m.y || 0, m.z); }
    project() { this.x /= 100; this.y = -this.z / 100; this.z = 0; return this; }
  }
  const player = { id: 1, alive: true, type: 'ship', team: 0, pos: { x: 0, z: 0 }, rot: 0, hull: 260, hullMax: 260 };
  const target = { id: 3, alive: true, type: 'ship', team: 1, pos: { x: 10, z: 0 }, data: {} };
  const state = { mode: 'flight', simTime: 10, playerId: 1, player: { targetId: 2 }, input: {}, ui: {},
    run: { kind: 'survival', phase: 'active' }, entityList: [player, target],
    render: { camera: {}, meshes: drawnMeshes([player, target]), renderer: { domElement: canvas } } };
  let pipPainted = false; const moves = []; const clicks = []; const pressed = []; const held = new Set(); const movement = []; const movementTicks = [];
  const attributes = new Map();
  const radar = { offsetParent: {}, getAttribute: key => attributes.get(key) ?? null,
    setAttribute: (key, value) => attributes.set(key, value), removeAttribute: key => attributes.delete(key) };
  const refreshRadar = () => {
    if (pickAccepted === undefined) publishRadarHostileCourse(radar, { baseLabel: 'Local tactical radar.',
      courseText: radarHostileCourseText([{ x: 10, y: 50 }], 50), mode: 'flight', simTime: state.simTime });
  };
  const pip = { classList: { contains: () => pipPainted }, offsetParent: {},
    getBoundingClientRect: () => ({ left: 600, top: 320, width: 22, height: 22 }) };
  const page = { evaluate: async (fn, arg) => fn(arg), waitForTimeout: async () => {
    if (held.has('KeyW')) movementTicks.push(state.simTime);
    state.simTime += 0.2; refreshRadar();
  },
    keyboard: { down: async key => { held.add(key); movement.push(key); }, up: async key => { held.delete(key); }, press: async key => {
      pressed.push(key);
      if (key === 'Backspace') clearWorldObjectSelection(state);
      if (key === 'Tab' && pickAccepted != null) { applyWorldObjectSelection(state, target, 'keyboard'); pipPainted = true; }
    } }, mouse: {
      move: async (x, y) => moves.push([x, y]),
      click: async (x, y, options) => {
        clicks.push({ x, y, button: options.button });
        if (pickAccepted) { applyWorldObjectSelection(state, target, 'pointer'); pipPainted = true; }
        else clearWorldObjectSelection(state);
        const nearer = { ...target, id: 4, pos: { x: 5, z: 0 } };
        state.entityList.push(nearer); state.render.meshes.set(4, { visible: true, matrixWorld: nearer.pos });
      }, down: async () => {
        assert.ok(pickAccepted != null, 'a missed selection must not become a false shot');
        assert.equal(state.player.targetId, target.id, 'the gun assist shares this visible subject');
      }, up: async () => {},
    } };
  try {
    globalThis.window = { SF: { THREE: { Vector3 }, state } };
    globalThis.document = { elementFromPoint: () => canvas, querySelector: (selector) => selector === '.sf-leadpip.visible' ? pip
      : selector === '.sf-radar-semantic-canvas' && pickAccepted === undefined ? radar : null };
    refreshRadar();
    await fightBeat(page, 1);
    assert.deepEqual(pressed, pickAccepted ? [] : ['Backspace', 'Tab']);
    if (pickAccepted == null) {
      assert.deepEqual(movement.filter(key => key !== 'ShiftLeft'), ['KeyW'], 'the two failed selection controls still admit deliberate physical movement');
      assert.ok(movementTicks.length >= 2, 'seeing the same rejected hull cannot end recovery before meaningful forward movement');
      assert.equal(held.size, 0);
      assert.ok(state.simTime >= 10.6 && state.simTime <= 11.5, 'the miss is a bounded search beat');
      const firstEnd = state.simTime;
      await fightBeat(page, 2);
      assert.deepEqual(movement.filter(key => key !== 'ShiftLeft'), ['KeyW', 'KeyW'], 'another miss progresses through the same public search');
      assert.ok(state.simTime - firstEnd >= 0.6 && state.simTime - firstEnd <= 1.5);
      assert.equal(held.size, 0);
      return;
    }
    assert.deepEqual(clicks, [{ x: 550, y: 300, button: 'right' }]);
    assert.deepEqual(moves, [[550, 300], [611, 331]], 'aim uses the already painted cue rather than hidden velocity');
    pip.offsetParent = null;
    assert.deepEqual([(await readTarget({ selectedOnly: true })).x, (await readTarget({ selectedOnly: true })).y], [550, 300], 'a hidden lead cue cannot drive the actor');
    pip.offsetParent = {};
    globalThis.document.elementFromPoint = (x) => x === 611 ? { tagName: 'DIV' } : canvas;
    assert.deepEqual([(await readTarget({ selectedOnly: true })).x, (await readTarget({ selectedOnly: true })).y], [550, 300], 'a HUD-covered lead cue falls back to the reachable subject');
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
      setFromMatrixPosition(m) { return this.set(m.x, m.y || 0, m.z); }
      project() { this.x /= 100; this.y = -this.z / 100; this.z = 0; return this; }
    }
    const me = { id: 1, alive: true, team: 0, pos: { x: 0, z: 0 }, rot: 0, hull: 100, hullMax: 100 };
    const state = { mode: 'flight', simTime: 10, playerId: 1, player: { targetId: hasTarget ? 2 : null }, run: { kind: 'survival', phase: 'active' },
      entityList: [me, ...(hasTarget ? [{ id: 2, alive: true, type: 'ship', team: 1, pos: { x: 10, z: 0 }, data: {} }] : [])],
      render: { camera: {}, renderer: { domElement: canvas } } };
    state.render.meshes = drawnMeshes(state.entityList);
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

for (const interruption of [null, 'draft', 'error']) test(`held fire follows a moving painted cue and releases controls on ${interruption || 'completion'}`, async () => {
  const oldWindow = globalThis.window; const oldDocument = globalThis.document;
  const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, right: 1000, bottom: 600, width: 1000, height: 600 }) };
  class Vector3 {
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    setFromMatrixPosition(m) { return this.set(m.x, m.y || 0, m.z); }
    project() { this.x /= 100; this.y = -this.z / 100; this.z = 0; return this; }
  }
  const player = { id: 1, alive: true, team: 0, pos: { x: 0, z: 0 }, rot: 0, hull: 260, hullMax: 260 };
  const target = { id: 2, alive: true, type: 'ship', team: 1, pos: { x: 10, z: 0 }, data: {} };
  const state = { mode: 'flight', simTime: 10, playerId: 1, player: { targetId: 2 },
    run: { kind: 'survival', phase: 'active' }, entityList: [player, target],
    render: { camera: {}, meshes: drawnMeshes([player, target]), renderer: { domElement: canvas } } };
  const held = new Set(); const tracked = []; let firing = false;
  const pip = { offsetParent: {}, getBoundingClientRect: () => ({ left: 600 + (state.simTime - 10) * 20, top: 300, width: 22, height: 22 }) };
  const page = { evaluate: async (fn, arg) => fn(arg), waitForTimeout: async () => {
    state.simTime += 0.2;
    if (interruption === 'draft' && state.simTime >= 10.35) state.run.phase = 'draft';
  }, keyboard: { down: async key => held.add(key), up: async key => held.delete(key), press: async () => {} }, mouse: {
    move: async (x, y) => {
      if (firing && x > 611) {
        tracked.push({ x, y, phase: state.run.phase });
        if (interruption === 'error') throw new Error('painted aim update failed');
      }
    }, down: async () => { firing = true; }, up: async () => { firing = false; },
  } };
  try {
    globalThis.window = { SF: { THREE: { Vector3 }, state } };
    globalThis.document = { elementFromPoint: () => canvas, querySelector: selector => selector === '.sf-leadpip.visible' ? pip : null };
    if (interruption === 'error') await assert.rejects(fightBeat(page, 1), /painted aim update failed/);
    else await fightBeat(page, 1);
    assert.ok(tracked.length >= 1, 'the cursor follows a newly painted cue while the button remains held');
    assert.ok(tracked.every(point => point.phase === 'active'), 'no combat cursor update leaks into the armory');
    assert.equal(held.size, 0); assert.equal(firing, false);
  } finally {
    if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow;
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
  }
});
