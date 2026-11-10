import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createSimLaneRuntime } from '../src/core/simLaneMain.js';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { makeShipEntitySpec } from '../src/systems/ships.js';

class CaptureEventTarget {
  constructor() { this.listeners = new Map(); }

  addEventListener(type, listener, options) {
    const entries = this.listeners.get(type) || [];
    entries.push({ listener, capture: options === true || options?.capture === true });
    this.listeners.set(type, entries);
  }

  removeEventListener(type, listener, options) {
    const entries = this.listeners.get(type);
    if (!entries) return;
    const capture = options === true || options?.capture === true;
    const index = entries.findIndex((entry) => entry.listener === listener && entry.capture === capture);
    if (index >= 0) entries.splice(index, 1);
  }

  dispatch(type, event = {}, { captureOnly = false } = {}) {
    const payload = event;
    payload.type = type;
    for (const entry of [...(this.listeners.get(type) || [])]) {
      if (!captureOnly || entry.capture) entry.listener(payload);
    }
  }

  listenerCount(type, capture) {
    const entries = this.listeners.get(type) || [];
    return capture === undefined ? entries.length : entries.filter((entry) => entry.capture === capture).length;
  }
}

function installDom() {
  const previous = {};
  for (const name of ['window', 'document', 'innerWidth', 'innerHeight']) {
    previous[name] = {
      present: Object.prototype.hasOwnProperty.call(globalThis, name),
      value: globalThis[name],
    };
  }
  const windowTarget = new CaptureEventTarget();
  const canvasTarget = new CaptureEventTarget();
  const documentTarget = new CaptureEventTarget();
  windowTarget.innerWidth = 1280;
  windowTarget.innerHeight = 800;
  windowTarget.requestAnimationFrame = () => 1;
  windowTarget.cancelAnimationFrame = () => {};
  documentTarget.pointerLockElement = null;
  documentTarget.body = { classList: { contains: () => false } };
  documentTarget.getElementById = (id) => id === 'gl-canvas' ? canvasTarget : null;
  globalThis.window = windowTarget;
  globalThis.document = documentTarget;
  globalThis.innerWidth = 1280;
  globalThis.innerHeight = 800;
  return {
    windowTarget,
    canvasTarget,
    documentTarget,
    restore() {
      for (const [name, entry] of Object.entries(previous)) {
        if (entry.present) globalThis[name] = entry.value;
        else delete globalThis[name];
      }
    },
  };
}

function responseFor(worker, receive, finish, msg) {
  const savedWindow = globalThis.window;
  const savedDocument = globalThis.document;
  delete globalThis.window;
  delete globalThis.document;
  const restoreDom = () => {
    globalThis.window = savedWindow;
    globalThis.document = savedDocument;
  };
  const deliver = (kind, reply) => {
    restoreDom();
    receive({ kind, seq: msg.seq, ...reply });
    if (msg.kind === 'tick') {
      const pending = finish.current;
      finish.current = null;
      pending?.resolve(reply);
    }
  };
  let operation;
  try {
    operation = msg.kind === 'init'
      ? worker.init(msg)
      : msg.kind === 'tick'
        ? worker.tick(msg)
        : msg.kind === 'shutdown'
          ? worker.shutdown()
          : null;
  } catch (error) {
    restoreDom();
    receive({ kind: 'error', seq: msg.seq, message: String(error), stack: error?.stack });
    return;
  }
  if (operation && typeof operation.then === 'function') {
    operation.then((reply) => deliver(msg.kind === 'init' ? 'ready' : 'tickDone', reply), (error) => {
      restoreDom();
      receive({ kind: 'error', seq: msg.seq, message: String(error), stack: error?.stack });
      const pending = finish.current;
      finish.current = null;
      pending?.reject(error);
    });
  } else {
    restoreDom();
  }
}

async function makeFixture(t) {
  const worker = createSimHost();
  const dom = installDom();
  const mainState = createGameState(276);
  const scenarioContract = JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8'));
  const posts = [];
  let receive = null;
  const finish = { current: null };
  const lane = createSimLaneRuntime({
    state: mainState,
    registry: {},
    bus: createBus(),
    flags: { lane: 'worker', warnings: [], sab: false },
    helpers: {
      raycastToPlane: () => ({ x: 0, z: 0 }),
      mobileSeams: { lane: 'worker' },
      scenarioContract,
    },
    channelFactory: () => ({
      onMessage(handler) { receive = handler; },
      post(msg) {
        posts.push(msg);
        responseFor(worker, receive, finish, msg);
      },
      terminate() { worker.shutdown(); },
    }),
  });
  t.after(() => {
    try { lane.close(); } catch (_) {}
    try { worker.shutdown(); } catch (_) {}
    dom.restore();
  });
  await lane.readyPromise;
  const state = worker.host.state;
  state.mode = 'flight';
  state.ui.screenStack = [];
  state.settings.gameplay.controlScheme = 'pilot';
  const player = worker.host.runtime.spawn(makeShipEntitySpec('ship_kestrel', {
    isPlayer: true,
    pos: { x: 0, z: 0 },
  }));
  state.playerId = player.id;
  const tick = () => new Promise((resolve, reject) => {
    finish.current = { resolve, reject };
    lane.runner.stepOnce();
  });
  return { dom, lane, posts, state, tick };
}

function assertNeutral(state, label) {
  assert.equal(state.input.moveX, 0, `${label}: moveX`);
  assert.equal(state.input.moveZ, 0, `${label}: moveZ`);
  assert.equal(state.input.boost, false, `${label}: boost`);
  assert.equal(state.input.fire, false, `${label}: fire`);
}

function holdControls(fixture) {
  const { dom } = fixture;
  dom.windowTarget.dispatch('keydown', { code: 'KeyW', target: null });
  dom.windowTarget.dispatch('keydown', { code: 'ShiftLeft', target: null });
  dom.canvasTarget.dispatch('mousedown', { button: 0, target: dom.canvasTarget, clientX: 640, clientY: 400 });
}

test('worker DOM adapter forwards interruption releases and capture-phase physical releases', async (t) => {
  const f = await makeFixture(t);
  holdControls(f);
  await f.tick();
  assert.equal(f.state.input.moveZ, 1, 'worker receives held forward thrust');
  assert.equal(f.state.input.boost, true, 'worker receives held boost');
  assert.equal(f.state.input.fire, true, 'worker receives held primary fire');

  f.dom.windowTarget.dispatch('pointercancel');
  await f.tick();
  assertNeutral(f.state, 'pointercancel');

  holdControls(f);
  await f.tick();
  f.dom.documentTarget.pointerLockElement = f.dom.canvasTarget;
  f.dom.documentTarget.dispatch('pointerlockchange');
  await f.tick();
  assert.equal(f.state.input.fire, true, 'locked pointerlockchange preserves fire');
  assert.equal(f.state.input.boost, true, 'locked pointerlockchange preserves boost');

  f.dom.documentTarget.pointerLockElement = null;
  f.dom.documentTarget.dispatch('pointerlockchange');
  await f.tick();
  assertNeutral(f.state, 'unlocked pointerlockchange');

  holdControls(f);
  await f.tick();
  // A modal/overlay consumes the bubbling phase. Capture listeners still see the physical release.
  f.dom.windowTarget.dispatch('keyup', { code: 'KeyW', target: {} }, { captureOnly: true });
  f.dom.windowTarget.dispatch('keyup', { code: 'ShiftLeft', target: {} }, { captureOnly: true });
  f.dom.windowTarget.dispatch('mouseup', { button: 0, target: {} }, { captureOnly: true });
  await f.tick();
  assertNeutral(f.state, 'capture-phase keyup/mouseup');
});

test('worker DOM adapter removes interruption listeners on teardown', async (t) => {
  const f = await makeFixture(t);
  assert.equal(f.dom.windowTarget.listenerCount('keyup', true), 1);
  assert.equal(f.dom.windowTarget.listenerCount('mouseup', true), 1);
  assert.equal(f.dom.windowTarget.listenerCount('pointercancel'), 1);
  assert.equal(f.dom.documentTarget.listenerCount('pointerlockchange'), 1);
  f.lane.close();
  assert.equal(f.dom.windowTarget.listenerCount('keyup'), 0);
  assert.equal(f.dom.windowTarget.listenerCount('mouseup'), 0);
  assert.equal(f.dom.windowTarget.listenerCount('pointercancel'), 0);
  assert.equal(f.dom.documentTarget.listenerCount('pointerlockchange'), 0);
});
