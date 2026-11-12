import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { createSimLaneRuntime } from '../src/core/simLaneMain.js';
import { laneDomEvent } from '../src/core/simLaneCommands.js';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { makeShipEntitySpec } from '../src/systems/ships.js';

test('worker cursor aim follows renderer projection, including camera motion without mouse motion', async () => {
  const previousWindow = globalThis.window;
  const worker = createSimHost();
  const mainState = createGameState(42);
  const scenarioContract = JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8'));
  let deliver, finish;
  let projected = { x: 3100, z: -1700 };
  const ndcs = [];
  const lane = createSimLaneRuntime({
    state: mainState, registry: {}, bus: createBus(),
    flags: { lane: 'worker', warnings: [], sab: false },
    helpers: { raycastToPlane(ndc) { ndcs.push({ ...ndc }); return projected; } },
    channelFactory: () => ({
      onMessage(fn) { deliver = fn; }, terminate() { worker.shutdown(); },
      post(msg) {
        if (msg.kind === 'shutdown') return;
        const op = msg.kind === 'init' ? worker.init({ ...msg, scenarioContract }) : worker.tick(msg);
        Promise.resolve(op).then(reply => {
          deliver({ kind: msg.kind === 'init' ? 'ready' : 'tickDone', seq: msg.seq, ...reply });
          if (msg.kind === 'tick') { const pending = finish; finish = null; pending.resolve(reply); }
        }, error => {
          deliver({ kind: 'error', seq: msg.seq, message: String(error) });
          if (finish) { const pending = finish; finish = null; pending.reject(error); }
        });
      },
    }),
  });
  const tick = () => new Promise((resolve, reject) => { finish = { resolve, reject }; lane.runner.stepOnce(); });
  try {
    await lane.readyPromise;
    globalThis.window = { innerWidth: 1280, innerHeight: 800, addEventListener() {}, removeEventListener() {} };
    const state = worker.host.state;
    const player = worker.host.runtime.spawn(makeShipEntitySpec('ship_kestrel', { isPlayer: true, pos: { x: 2000, z: -2000 } }));
    state.playerId = player.id; state.mode = 'flight';
    state.settings.gameplay.controlScheme = 'pilot';
    const shots = [];
    worker.host.bus.on('combat:fire', shot => { if (shot.ownerId === player.id) shots.push(shot); });
    laneDomEvent({ type: 'mousedown', button: 0, clientX: 800, clientY: 200 });
    await tick();
    assert.deepEqual(state.input.aimWorld, projected);
    assert.ok(Math.abs(state.input.aimAngle - Math.atan2(300, 1100)) < 1e-8);
    assert.ok(ndcs.length > 0, 'the main renderer projects cursor coordinates');
    assert.deepEqual(ndcs.at(-1), { x: 0.25, y: 0.5 }, 'screen coordinates reach the renderer as NDC');
    assert.ok(shots.length > 0, 'public mouse fire reaches the worker weapons owner');
    assert.ok(Math.abs(shots[0].dir - state.input.aimAngle) < 0.1, 'the bullet fires along the cursor aim');
    projected = { x: 800, z: -2300 };
    await tick();
    assert.deepEqual(state.input.aimWorld, projected, 'stationary cursor is reprojected when camera moves');
    assert.ok(Math.cos(state.input.aimAngle) < 0, 'aim switches side rather than pointing at world origin');
    for (const gun of player.data.weapons) gun._cooldown = 0;
    await tick();
    assert.ok(Math.cos(shots.at(-1).dir) < 0, 'the next bullet follows the reprojected cursor');
    mainState.settings.controls.mouse = { sensitivity: 2, invertY: true };
    await tick();
    assert.deepEqual(ndcs.at(-1), { x: 0.5, y: -1 }, 'worker projection preserves mouse sensitivity and inversion');
  } finally {
    lane.close(); worker.shutdown();
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});
