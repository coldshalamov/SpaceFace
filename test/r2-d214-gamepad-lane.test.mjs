import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Worker } from 'node:worker_threads';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { createRegistry } from '../src/core/registry.js';
import { createSimLaneRuntime } from '../src/core/simLaneMain.js';
import { laneRpc, laneSetMode, laneWriteSetting } from '../src/core/simLaneCommands.js';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { setPromptDevice, setGamepadCaptureHandler, getGamepadCaptureHandler } from '../src/ui/bindings.js';
import { verbBindingLabel } from '../src/onboarding/verbSpeech.js';

async function fixture(t) {
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const pad = {
    id: 'D214 standard controller', connected: true, index: 0, mapping: 'standard',
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
  };
  let pads = [pad];
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true, value: { getGamepads: () => pads },
  });
  const mainNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const worker = createSimHost();
  const mainState = createGameState(4242);
  const bus = createBus();
  const connections = [];
  bus.on('gamepad:connected', event => connections.push(event));
  const ctx = { state: mainState, bus, helpers: {}, simLane: 'worker' };
  const registry = createRegistry(ctx);
  ctx.registry = registry;
  const scenarioContract = JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8'));
  let deliver, finish;
  const posts = [];
  const lane = createSimLaneRuntime({
    state: mainState, registry, bus, helpers: { scenarioContract },
    flags: { lane: 'worker', warnings: [], sab: false },
    channelFactory: () => ({
      onMessage(fn) { deliver = fn; },
      terminate() { worker.shutdown(); },
      post(message) {
        if (message.kind === 'shutdown') return;
        const msg = structuredClone(message);
        posts.push(msg);
        // The production worker has no Gamepad API. Only the wire descriptor can drive it.
        delete globalThis.navigator;
        const operation = msg.kind === 'init' ? worker.init(msg) : worker.tick(msg);
        Promise.resolve(operation).then(reply => {
          Object.defineProperty(globalThis, 'navigator', mainNavigator);
          deliver({ kind: msg.kind === 'init' ? 'ready' : 'tickDone', seq: msg.seq, ...structuredClone(reply) });
          if (msg.kind === 'tick') { const pending = finish; finish = null; pending?.resolve(reply); }
        }, error => {
          Object.defineProperty(globalThis, 'navigator', mainNavigator);
          deliver({ kind: 'error', seq: msg.seq, message: String(error) });
          const pending = finish; finish = null; pending?.reject(error);
        });
      },
    }),
  });
  t.after(() => {
    lane.close(); worker.shutdown();
    setPromptDevice('kbm');
    setGamepadCaptureHandler(null);
    if (previousNavigator) Object.defineProperty(globalThis, 'navigator', previousNavigator);
    else delete globalThis.navigator;
  });
  await lane.readyPromise;
  const state = worker.host.state;
  state.mode = 'flight';
  state.settings.gameplay.controlScheme = 'pilot';
  const player = worker.host.runtime.spawn(makeShipEntitySpec('ship_kestrel', {
    isPlayer: true, pos: { x: 2000, z: -2000 },
  }));
  state.playerId = player.id;
  await worker.host.registry.get('physics').prepareBackend(state);
  const tick = () => new Promise((resolve, reject) => {
    ctx.gamepad.captureMode = !!getGamepadCaptureHandler();
    ctx.gamepad.tick(1 / 60);
    finish = { resolve, reject };
    lane.runner.stepOnce();
  });
  return {
    state, player, pad, registry, ctx, tick, posts, connections,
    gamepad: worker.host.registry.get('input').gamepad,
    disconnect() { pads = []; },
    button(index, down) { pad.buttons[index] = { pressed: down, value: down ? 1 : 0 }; },
  };
}

test('main-thread pad samples fly and turn the real worker ship, with neutral and disconnect release', async t => {
  const f = await fixture(t);
  await f.tick();
  assert.equal(f.connections.length, 1, 'the authoritative controller announces connection');
  f.ctx.gamepad.tick(1 / 60);
  assert.equal(f.connections.length, 1, 'the UI sampler does not duplicate the connection announcement');
  assert.equal(f.state.input.moveZ, 0, 'a connected quiet controller does not thrust');
  assert.equal(f.state.input.turnIntent, 0, 'a connected quiet controller does not turn');
  const initialRotation = f.player.rot;
  f.pad.axes = [0.7, -0.9, 0, 0];
  for (let i = 0; i < 8; i++) await f.tick();
  assert.ok(f.state.input.moveZ > 0.5, 'main-thread stick supplies worker thrust');
  assert.ok(f.state.input.turnIntent > 0.5, 'main-thread stick supplies worker turn');
  assert.deepEqual(f.gamepad.axes, f.ctx.gamepad.axes, 'worker raw axes equal main-thread polling');
  assert.ok(Math.hypot(f.player.vel.x, f.player.vel.z) > 0, 'authoritative ship accelerates');
  assert.notEqual(f.player.rot, initialRotation, 'authoritative ship turns');
  assert.equal(f.registry.get('input').gamepad, f.ctx.gamepad, 'UI facade exposes the main controller');
  const effects = [];
  f.pad.vibrationActuator = { playEffect(_type, frame) { effects.push(frame); } };
  f.button(5, true);
  await f.tick();
  f.ctx.gamepad.tick(1 / 60);
  assert.ok(effects.length > 0, 'the browser actuator receives the worker-produced haptic frame');
  assert.equal(effects.at(-1).strongMagnitude, f.gamepad.haptics.strong, 'haptics use authoritative momentum rather than missing facade velocity');
  f.button(5, false);
  await f.tick();
  f.button(12, true);
  await f.tick();
  assert.equal(f.state.input.actions.autoTargetToggle, true, 'a pad edge reaches the worker action contract');
  assert.deepEqual(f.gamepad.actions, f.ctx.gamepad.actions, 'worker resolved actions equal main-thread polling');
  await f.tick();
  assert.equal(f.state.input.actions.autoTargetToggle, false, 'a held button does not repeat its edge');
  f.button(12, false);
  await f.tick();
  setGamepadCaptureHandler(() => {});
  f.button(12, true);
  await f.tick();
  assert.equal(f.state.input.actions.autoTargetToggle, false, 'rebinding capture suppresses gameplay actions');
  setGamepadCaptureHandler(null);
  f.pad.axes = [0, 0, 0, 0];
  f.button(12, false);
  await f.tick();
  assert.equal(f.state.input.moveZ, 0, 'neutral sample releases thrust');
  assert.equal(f.state.input.turnIntent, 0, 'neutral sample releases turn');
  laneWriteSetting(f.ctx.state, 'settings.controls.gamepad.enabled', false);
  f.pad.axes = [0.8, -1, 0, 0];
  await f.tick();
  assert.equal(f.state.input.moveZ, 0, 'disabled controller cannot supply thrust');
  assert.equal(f.state.input.turnIntent, 0, 'disabled controller cannot supply turn');
  laneWriteSetting(f.ctx.state, 'settings.controls.gamepad.enabled', true);
  f.pad.axes = [0, 0, 0, 0];
  await f.tick();
  f.pad.axes = [0.8, -1, 0, 0];
  await f.tick();
  f.disconnect();
  await f.tick();
  assert.equal(f.state.input.moveZ, 0, 'disconnect clears thrust');
  assert.equal(f.state.input.turnIntent, 0, 'disconnect clears turn');
  assert.equal(f.state.input.actions.autoTargetToggle, false, 'disconnect never synthesizes a toggle');
  const count = f.posts.flatMap(p => p.commands || []).filter(c => c.p?.d?.type === 'gamepadFrame').length;
  assert.ok(count > 0, 'physical pad frames cross the real lane command channel');
  t.diagnostic(`seed 4242: worker speed=${Math.hypot(f.player.vel.x, f.player.vel.z).toFixed(3)}, turn=${(f.player.rot - initialRotation).toFixed(3)}, pad frames=${count}`);
});

test('worker prompt vocabulary follows transported pad, touch, and keyboard device facts', async t => {
  const f = await fixture(t);
  setPromptDevice('gamepad');
  await f.tick();
  setPromptDevice('kbm');
  assert.equal(verbBindingLabel(f.state, 'travelBurn'), 'L3', 'worker names the controller binding');
  setPromptDevice('touch');
  await f.tick();
  setPromptDevice('kbm');
  assert.equal(verbBindingLabel(f.state, 'travelBurn'), '', 'touch hints do not name an unavailable key');
  await f.tick();
  assert.equal(verbBindingLabel(f.state, 'travelBurn'), 'Num Lock/H', 'keyboard vocabulary returns after keyboard activity');
});

test('default autonomous worker clock receives pad frames across a separate realm', { timeout: 30000 }, async t => {
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const pad = {
    id: 'D214 clock controller', connected: true, index: 0, mapping: 'standard',
    axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
  };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { getGamepads: () => [pad] } });
  const worker = new Worker(new URL('./fixtures/whole-sim-browser-worker-thread.mjs', import.meta.url), { type: 'module' });
  const state = createGameState(4242);
  let receive, workerError, lane;
  const waiters = new Set();
  function waitFor(predicate, label) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        waiters.delete(check);
        reject(new Error(`${label}: ${JSON.stringify({ tick: state.tick, mode: state.mode, scale: state.timeScale, input: state.input, player: state.entities.get(state.playerId) && { pos: state.entities.get(state.playerId).pos, rot: state.entities.get(state.playerId).rot } })}`));
      }, 10000);
      const check = () => {
        if (!workerError && !predicate()) return;
        clearTimeout(timeout); waiters.delete(check);
        if (workerError) reject(new Error(workerError.message));
        else resolve();
      };
      waiters.add(check); check();
    });
  }
  try {
    worker.on('message', msg => {
      if (msg.kind === 'error') workerError = msg;
      receive?.(msg);
      for (const check of [...waiters]) check();
    });
    worker.on('error', error => { workerError = error; for (const check of [...waiters]) check(); });
    lane = createSimLaneRuntime({
      state, bus: createBus(), registry: {},
      flags: { lane: 'worker', warnings: [], sab: false }, clockMode: 'worker-local',
      helpers: { scenarioContract: JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8')) },
      channelFactory: () => ({
        post(msg) { worker.postMessage(msg); }, onMessage(fn) { receive = fn; }, terminate() {},
      }),
    });
    await lane.readyPromise;
    lane.runner.setClockActive(true);
    const boot = await laneRpc('newGameBoot', { opts: { seed: 4242 }, newGamePlus: null });
    assert.equal(boot.ok, true);
    assert.equal(boot.result.ok, true);
    laneSetMode(state, null, 'flight');
    await laneRpc('probeState');
    const neutralTick = state.tick;
    lane.runner.prepareWithoutAdvance();
    await waitFor(() => state.mode === 'flight' && state.entities.has(state.playerId)
      && state.input.promptDevice === 'kbm' && state.tick > neutralTick + 2, 'connected neutral sample');
    const player = state.entities.get(state.playerId);
    const start = { x: player.pos.x, z: player.pos.z, rot: player.rot };
    pad.axes = [0.7, -0.9, 0, 0];
    lane.runner.prepareWithoutAdvance();
    await waitFor(() => state.input.moveZ > 0.5 && state.input.turnIntent > 0.5
      && Math.abs(player.rot - start.rot) > 0.01 && Math.hypot(player.pos.x - start.x, player.pos.z - start.z) > 0.1, 'pad movement');
    t.diagnostic(`autonomous worker: ship displaced ${Math.hypot(player.pos.x - start.x, player.pos.z - start.z).toFixed(3)} WU and turned ${(player.rot - start.rot).toFixed(3)} radians`);
    pad.axes = [0, 0, 0, 0];
    lane.runner.prepareWithoutAdvance();
    await waitFor(() => state.input.moveZ === 0 && state.input.turnIntent === 0, 'neutral release');
    assert.equal(workerError, undefined);
  } finally {
    lane?.close();
    await worker.terminate();
    if (previousNavigator) Object.defineProperty(globalThis, 'navigator', previousNavigator);
    else delete globalThis.navigator;
  }
});
