import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Worker } from 'node:worker_threads';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { runNewGameSimBoot } from '../src/core/newGameBoot.js';
import { createSimLaneRuntime } from '../src/core/simLaneMain.js';
import { laneRpc, laneSetMode } from '../src/core/simLaneCommands.js';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';

const scenarioContract = JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8'));

for (const laneName of ['main', 'worker']) {
  test(`${laneName}: Crucible practice launch boots seed 39039 and the Hornet through the public request`, { timeout: 60000 }, async t => {
    // Each page has one staging module; isolate it between lane fixtures just as a reload does.
    const sandbox = await import(`../src/ui/sandbox/sandboxSetup.js?d210=${laneName}`);
    const preset = sandbox.SCENARIO_PRESETS.find(row => row.id === 'sling_practice');
    let state, bus, registry, helpers, close, boot, probe;
    const cameraZooms = [];
    if (laneName === 'main') {
      const host = createSimHost();
      await host.init({ profile: 'production', seed: 4242, scenarioContract });
      state = host.host.state;
      bus = host.host.bus;
      registry = host.host.registry;
      helpers = host.host.sim.helpers;
      close = async () => host.shutdown();
      boot = opts => {
        state.mode = 'loading';
        return runNewGameSimBoot({ state, bus, registry, helpers, opts, awaitPhysicsPrep: true });
      };
      probe = async () => ({ seed: state.meta.seed });
    } else {
      const worker = new Worker(new URL('./fixtures/whole-sim-browser-worker-thread.mjs', import.meta.url), { type: 'module' });
      state = createGameState(4242);
      bus = createBus();
      // ships has no page-side facade: setup must run against its native owner.
      registry = { get: () => undefined };
      helpers = {};
      let receive;
      worker.on('message', message => receive?.(message));
      const lane = createSimLaneRuntime({
        state, bus, registry, helpers: { scenarioContract },
        flags: { lane: 'worker', warnings: [], sab: false },
        channelFactory: () => ({
          post: message => worker.postMessage(message),
          onMessage: handler => { receive = handler; },
          onError: handler => worker.on('error', handler),
          terminate() {},
        }),
      });
      close = async () => { lane.close(); await worker.terminate(); };
      await lane.readyPromise;
      boot = async opts => {
        laneSetMode(state, bus, 'loading');
        const ack = await laneRpc('newGameBoot', { opts });
        assert.equal(ack.ok, true, JSON.stringify(ack));
        return ack.result;
      };
      probe = async () => {
        const ack = await laneRpc('probeState');
        assert.equal(ack.ok, true);
        return ack.result;
      };
    }
    try {
      state.render ||= {};
      state.render.cameraCtrl = { setZoom: zoom => cameraZooms.push(zoom), snapToPlayer() {} };
      sandbox.installSandboxGameStartedHook(bus, { state, bus, registry, helpers });
      let opts;
      bus.on('game:new', payload => { opts = payload; });
      sandbox.requestSandboxGame(bus, sandbox.buildSandboxLaunchConfig(preset.config));
      assert.equal(opts.seed, 39039, 'the button emits the fixed practice seed');
      assert.equal((await boot(opts)).ok, true);
      const bootSeed = state.meta.seed;
      const bootHull = state.player.ownedShips[state.player.activeShipIndex]?.defId;
      const native = await probe();
      t.diagnostic(`native seed=${native.seed}; page seed=${state.meta.seed}; page hull=${state.player.ownedShips[state.player.activeShipIndex]?.defId}`);
      await t.test('the fixed seed reaches authority and the page mirror', () => {
        assert.equal(native.seed, 39039, 'the authoritative boot uses the practice seed');
        assert.equal(bootSeed, 39039, 'the boot acknowledgement already carries the fixed seed');
        assert.equal(state.meta.seed, 39039, 'the page mirror receives the actual run seed');
      });
      await t.test('the room has the Hornet, one anchor and two inert targets', () => {
        const active = state.player.ownedShips[state.player.activeShipIndex];
        assert.equal(bootHull, 'ship_hornet', 'the boot acknowledgement already carries the practice hull');
        assert.equal(active.defId, 'ship_hornet', 'the native ships owner supplies the practice Hornet before loading completes');
        assert.equal(state.entities.get(state.playerId).data.defId, 'ship_hornet');
        assert.equal(state.entityList.filter(entity => entity.alive !== false && entity.data?.sandboxMasslineAnchor).length, 1);
        assert.equal(state.entityList.filter(entity => entity.alive !== false && entity.data?.ai == null
          && entity.type === 'ship' && entity.team === 2 && entity.id !== state.playerId).length, 2);
      });
      assert.equal(sandbox.hasPendingSandboxLaunch(), false, 'scene preparation consumes the staged request');
      assert.deepEqual(cameraZooms, [120], 'the camera stays page-owned and is applied exactly once');
      bus.emit('game:started', {});
      assert.deepEqual(cameraZooms, [120], 'the later lifecycle receipt does not replay setup');
    } finally { await close(); }
  });
}
