import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Scene } from 'three';
import { projectBridgeEvent } from '../scripts/lib/simEventBridge.mjs';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import {
  installSimCommandSink, laneCommandSink, laneRpc, laneSetMode, uninstallSimCommandSink,
} from '../src/core/simLaneCommands.js';
import { createSimLaneRuntime } from '../src/core/simLaneMain.js';
import { createLawArenaDressing } from '../src/render/lawArenaDressing.js';
import { crucibleLaunchConfig, crucibleSetupFor } from '../src/ui/crucibleLaunch.js';
import { requestSandboxGame } from '../src/ui/sandbox/sandboxSetup.js';

const INSTALL = 'survivalArena:installed';
const SEED = 7;
const scenarioContract = JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url)));

async function asWorker(fn) {
  // This test hosts both realms in one process. The browser worker has no main-side sink.
  const sink = laneCommandSink();
  uninstallSimCommandSink();
  try { return await fn(); }
  finally { if (sink) installSimCommandSink(sink); }
}

async function openGauntlet(arenaId) {
  const host = createSimHost();
  const state = createGameState(SEED);
  const bus = createBus();
  const scene = new Scene();
  const dressing = createLawArenaDressing();
  let raw, wire, replayed;
  let pending = Promise.resolve();
  let lane;
  try {
    bus.on(INSTALL, (p) => {
      replayed = p;
      dressing.handleInstall(p, scene);
    });
    lane = createSimLaneRuntime({
      state, bus, registry: {}, helpers: {},
      flags: { lane: 'worker', sab: false, warnings: [] }, clockMode: 'worker-local',
      channelFactory: () => {
        let receive;
        return {
          onMessage(fn) { receive = fn; },
          terminate() {},
          post(message) {
            if (message.kind === 'init') pending = pending.then(async () => {
              const reply = await asWorker(() => host.init({
                ...structuredClone(message), profile: 'production', seed: SEED, bridgeAll: true, scenarioContract,
              }));
              receive(structuredClone({ kind: 'ready', seq: message.seq, ...reply }));
            });
            if (message.kind === 'clockCommand') pending = pending.then(async () => {
              const reply = await asWorker(() => host.tick({ ...structuredClone(message), kind: 'tick' }));
              const install = reply.events.find((event) => event.t === INSTALL);
              if (install) wire = install.p;
              receive(structuredClone({ kind: 'clockTick', ...reply, commandSequence: message.commandSequence }));
            });
          },
        };
      },
    });
    await lane.readyPromise;
    host.host.bus.on(INSTALL, (p) => { raw = p; });
    const launchBus = createBus();
    let opts;
    launchBus.on('game:new', (p) => { opts = p; });
    const setup = crucibleSetupFor({ starterId: 'ricochet_runner', ruleset: 'scored', arenaId, seed: SEED });
    assert.ok(setup.ok);
    requestSandboxGame(launchBus, crucibleLaunchConfig(setup.value, 'scored'));
    laneSetMode(state, bus, 'loading');
    await laneRpc('newGameBoot', { opts });
    await pending;

    assert.equal(raw?.arenaId, arenaId, 'the authoritative opening produced the install');
    assert.equal(raw.wave, 1);
    assert.equal(projectBridgeEvent('test:unadaptedInstall', raw).dropped, true, 'generic depth still applies');
    assert.ok(wire, 'the worker reply includes the authoritative install');
    assert.deepEqual(wire, raw, 'the worker reply preserves the finalized receipt');
    assert.deepEqual(replayed, raw, 'the main lane dispatches the same finalized receipt');
    const room = dressing.peekRoom();
    assert.equal(room?.root.parent, scene);
    return room.parts.map((part) => part.root.name);
  } finally {
    dressing.handleReleased();
    lane?.close();
    host.shutdown();
  }
}

test('the production worker delivers Cryo Drift prop coordinates for the main scene', async () => {
  const parts = await openGauntlet('cryo_drift');
  for (const name of ['cryo_frame', 'cryo_tank', 'cryo_manifold']) assert.ok(parts.includes(name), name);
});

test('the production worker delivers Storm Lattice pylon and relay poses for the main scene', async () => {
  const parts = await openGauntlet('storm_lattice');
  assert.ok(parts.some((name) => name.startsWith('storm_pylon_')));
  assert.ok(parts.some((name) => name.startsWith('storm_relay_')));
  assert.ok(parts.includes('storm_wire'));
});
