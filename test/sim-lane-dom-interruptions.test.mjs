import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createSimLaneRuntime } from '../src/core/simLaneMain.js';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { createWorldObjectInteraction } from '../src/ui/worldObjectInteraction.js';
import { furnaceCapstanSpec } from '../src/missions/furnaceCapstan.js';

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
    const entries = [...(this.listeners.get(type) || [])].sort((a, b) => Number(b.capture) - Number(a.capture));
    for (const entry of entries) {
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
  const aim = { x: 0, z: 0 };
  let receive = null;
  const finish = { current: null };
  const lane = createSimLaneRuntime({
    state: mainState,
    registry: {},
    bus: createBus(),
    flags: { lane: 'worker', warnings: [], sab: false },
    helpers: {
      raycastToPlane: () => aim,
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
  return { dom, lane, posts, state, mainState, aim, tick, worker };
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

async function makeLatchFixture(t) {
  const f = await makeFixture(t);
  const spawnRock = (z) => f.worker.host.runtime.spawn({
    type: 'asteroid', mass: 5000, radius: 24, hull: 120, pos: { x: 150, z },
  });
  const marked = spawnRock(-120);
  const alternative = spawnRock(120);
  assert.equal(await f.worker.host.registry.get('physics').prepareBackend(f.state), true);
  Object.assign(f.aim, { x: marked.pos.x, z: marked.pos.z });
  f.dom.windowTarget.dispatch('mousemove', { clientX: 700, clientY: 340, movementX: 20, movementY: -10 });
  for (let i = 0; i < 18 && !f.mainState.masslineAcquisition?.selected; i++) await f.tick();
  const preview = f.mainState.masslineAcquisition;
  assert.equal(preview?.selected?.targetId, marked.id);
  assert.equal(preview?.selected?.status, 'ready');
  const latched = [];
  f.worker.host.bus.on('tether:latched', event => latched.push(event));
  const denied = [];
  f.worker.host.bus.on('tether:latchDenied', event => denied.push(event));
  return { ...f, spawnRock, marked, alternative, preview, latched, denied };
}

test('a keyboard latch keeps the shown target when the worker reprojects the stationary cursor', async (t) => {
  const f = await makeLatchFixture(t);
  const { marked, alternative, preview, latched } = f;

  // Camera follow can move the projection for a stationary screen point before its next visual mark.
  Object.assign(f.aim, { x: alternative.pos.x, z: alternative.pos.z });
  f.dom.windowTarget.dispatch('keydown', { code: 'KeyF', target: null });
  await f.tick();
  assert.deepEqual(f.state.input.aimWorld, f.aim, 'the worker used the new camera projection');
  assert.equal(latched[0]?.targetId, marked.id, 'the same live body owns the committed line');
  assert.equal(latched[0].selectionReceiptId, preview.id);
  assert.equal(latched[0].previewMatched, true);
  const attachment = Object.values(f.state.combat.attachments.byId).find(line => line.targetId === marked.id);
  assert.equal(attachment?.targetGeneration, preview.selected.occupantGeneration);
});

test('a queued keyboard latch reports a lost target if the marked id is reused', async (t) => {
  const f = await makeLatchFixture(t);
  f.dom.windowTarget.dispatch('keydown', { code: 'KeyF', target: null });
  assert.equal(f.worker.host.sim.helpers.removeEntity(f.marked.id, { immediate: true }), true);
  const replacement = f.spawnRock(f.marked.pos.z);
  assert.equal(replacement.id, f.marked.id);
  assert.notEqual(replacement.occupantGeneration, f.preview.selected.occupantGeneration);
  await f.tick();
  assert.deepEqual(f.latched, []);
  assert.deepEqual(f.denied, [{ targetId: f.marked.id, reason: 'target-lost' }]);
});

test('a sampled CR-FEED pick does not latch a different worker life', async (t) => {
  const f = await makeLatchFixture(t);
  const { state, mainState, dom } = f;
  state.run.kind = 'adventure';
  mainState.run.kind = 'adventure';
  const spec = furnaceCapstanSpec({ id: 'm_4' });
  const service = f.worker.host.runtime.spawn({ ...spec, pos: { x: -64, z: 0 } });
  await f.tick();
  const shown = mainState.entities.get(service.id);
  assert.equal(shown.occupantGeneration, service.occupantGeneration);
  shown.presentationAdmission = 'ready';
  const camera = new THREE.PerspectiveCamera(50, 1280 / 800, 0.1, 4000);
  camera.position.set(0, 180, 0.0001);
  camera.up.set(0, 0, -1);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  const scene = new THREE.Scene();
  const root = new THREE.Mesh(new THREE.BoxGeometry(16, 12, 16), new THREE.MeshBasicMaterial());
  root.position.set(service.pos.x, 6, service.pos.z);
  scene.add(camera, root);
  scene.updateMatrixWorld(true);
  Object.assign(mainState.render, { camera, scene, meshes: new Map([[service.id, root]]) });
  const canvas = dom.canvasTarget;
  canvas.getBoundingClientRect = () => ({ width: 1280, height: 800, left: 0, top: 0 });
  const interaction = createWorldObjectInteraction({ state: mainState, bus: createBus() }, { isOpen: () => false });
  t.after(() => interaction.destroy());
  const point = root.position.clone().project(camera);
  const tap = (clientX, clientY) => {
    canvas.dispatch('mousedown', { button: 2, target: canvas, clientX, clientY });
    dom.windowTarget.dispatch('mouseup', { button: 2, target: canvas });
  };
  const tapService = () => tap((point.x + 1) * 640, (1 - point.y) * 400);
  tapService();
  await f.tick();
  assert.equal(state.player.targetId, service.id, 'ordinary pointer selection still publishes the gantry');
  assert.deepEqual(f.latched, [], 'a second nearby body must not latch from the gantry click');

  tapService();
  assert.equal(f.worker.host.sim.helpers.removeEntity(service.id, { immediate: true }), true);
  const replacement = f.spawnRock(-60);
  assert.equal(replacement.id, service.id);
  assert.notEqual(replacement.occupantGeneration, service.occupantGeneration);
  await f.tick();
  assert.deepEqual(f.latched, [], 'a queued service pick must not act on the recycled ID or a second body');

  tap(640, 400);
  await f.tick();
  assert.equal(f.latched[0]?.targetId, f.marked.id, 'empty-glass RMB still acquires the actual aimed body');
});
