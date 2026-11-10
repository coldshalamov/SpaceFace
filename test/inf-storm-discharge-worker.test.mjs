import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import * as THREE from 'three';
import { createLawArenaDressing } from '../src/render/lawArenaDressing.js';
import { MAIN_TO_SIM_BUS_EVENTS } from '../src/core/mainToSimEventSurface.js';
import { createSimLaneRuntime } from '../src/core/simLaneMain.js';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';

const source = `
  import { parentPort, workerData } from 'node:worker_threads';
  import { readFileSync } from 'node:fs';
  const { createSimHost } = await import(workerData.host);
  const { createRunState } = await import(workerData.runState);
  const { planWave } = await import(workerData.planner);
  const { noteSwarmPilotAction } = await import(workerData.safety);
  let lane, init, state, arena, target, seq = 0, warning;
  const tick = async commands => lane.tick({ tick: ++seq, steps: 0,
    ackEnd: init.initRebuild?.end ?? 0, commands: commands || [] });
  function step() { state.tick++; state.simTime += 1 / 60; arena.update(1 / 60, state); }
  parentPort.on('message', async message => {
    try {
      if (message.kind === 'init') {
        lane = createSimHost();
        init = await lane.init({ profile: 'production', seed: 7, bridgeAll: true,
          scenarioContract: JSON.parse(readFileSync(new URL(workerData.scenario))) });
        state = lane.host.state;
        state.mode = 'flight';
        const player = lane.host.runtime.spawn({ type: 'ship', isPlayer: true, team: 0,
          pos: { x: 3000, z: 400 }, vel: { x: 0, z: 0 }, radius: 10, hull: 100, hullMax: 100 });
        state.playerId = player.id;
        state.run = { ...createRunState({ kind: 'survival', ruleset: 'swarm', seed: 7 }),
          arenaId: 'storm_lattice', phase: 'wave_intro', wave: 5 };
        arena = lane.host.registry.get('survivalArena');
        lane.host.bus.on('survivalArena:stormWarning', p => { warning = { wave: p.wave, serial: p.serial, roomGeneration: p.roomGeneration }; });
        lane.host.bus.emit('run:wavePlanned', { wave: 5, plan: planWave({ seed: 7, arenaId: 'storm_lattice', wave: 5 }), tick: state.tick });
        state.run.phase = 'active'; noteSwarmPilotAction(state);
        const relay = arena._roomSolids.get('relay_0');
        target = lane.host.runtime.spawn({ type: 'drone', team: 1, pos: { x: relay.pos.x + 18, z: relay.pos.z },
          radius: 8, hull: 100, hullMax: 100, armorHp: 50, armorMax: 50,
          data: { runCohort: 'survival', runWave: 5 } });
        for (let i = 0; i < 400 && !warning; i++) step();
        if (!warning) throw new Error('no warning');
        parentPort.postMessage({ ok: true, targetId: target.id, init, wire: await tick() });
      } else if (message.kind === 'ack') {
        const ack = await tick(message.commands);
        for (let i = 0; i < 100; i++) step();
        parentPort.postMessage({ ok: true, ack, wire: await tick(), targetId: target.id });
      } else if (message.kind === 'close') { lane.shutdown(); parentPort.postMessage({ ok: true }); }
    } catch (error) { parentPort.postMessage({ ok: false, error: error.stack || String(error) }); }
  });
`;

test('default worker warning reaches the reader before its receipt permits accepted damage', async () => {
  assert.equal(MAIN_TO_SIM_BUS_EVENTS.has('survivalArena:stormPresented'), true,
    'the normal main-to-sim event gate accepts the reader receipt');
  const worker = new Worker(new URL(`data:text/javascript,${encodeURIComponent(source)}`), { workerData: {
    host: new URL('../scripts/lib/simWorkerHost.mjs', import.meta.url).href,
    runState: new URL('../src/core/runState.js', import.meta.url).href,
    planner: new URL('../src/systems/survivalWavePlanner.js', import.meta.url).href,
    safety: new URL('../src/systems/swarmSafety.js', import.meta.url).href,
    scenario: new URL('../src/data/scenarios/47a.scenario.json', import.meta.url).href,
  } });
  const send = message => new Promise((resolve, reject) => {
    const onError = error => { worker.off('message', onMessage); reject(error); };
    const onMessage = result => { worker.off('error', onError); result.ok ? resolve(result) : reject(new Error(result.error)); };
    worker.once('error', onError); worker.once('message', onMessage); worker.postMessage(message);
  });
  let lane, receive, initRequest;
  const outgoing = [];
  const bus = createBus();
  try {
    lane = createSimLaneRuntime({ state: createGameState(7), bus, registry: {}, helpers: {},
      flags: { lane: 'worker', sab: false, warnings: [] }, clockMode: 'worker-local',
      channelFactory: () => ({ onMessage(fn) { receive = fn; }, terminate() {},
        post(message) { if (message.kind === 'init') initRequest = message;
          else if (message.kind === 'clockCommand') outgoing.push(message); } }) });
    const opening = await send({ kind: 'init' });
    receive(structuredClone({ kind: 'ready', seq: initRequest.seq, ...opening.init }));
    await lane.readyPromise;
    const warning = opening.wire.events.find(e => e.t === 'survivalArena:stormWarning');
    assert.ok(warning, 'production worker sent the committed path');
    assert.equal(opening.wire.events.some(e => e.t === 'combat:damage' && e.p.targetId === opening.targetId), false);
    const scene = new THREE.Scene(), reader = createLawArenaDressing();
    let receipt = null;
    assert.equal(reader.handleStormWarning(warning.p, scene, p => {
      receipt = p;
      bus.emit('survivalArena:stormPresented', p);
    }), true);
    assert.ok(scene.getObjectByName('storm_discharge_warning'));
    reader.updateRoom(warning.p.atSim, 1 / 60, { reducedMotion: true, reducedFlash: true });
    assert.ok(receipt, 'the attached warning reader publishes the exact life-bound receipt');
    const commands = outgoing.flatMap(message => message.commands || []);
    assert.ok(commands.some(command => command.t === 'bus' && command.p?.emit === 'survivalArena:stormPresented'),
      `actual main lane forwards the receipt: ${JSON.stringify(outgoing)}`);
    const result = await send({ kind: 'ack', commands });
    const damage = result.wire.events.filter(e => e.t === 'combat:damage' && e.p.targetId === result.targetId);
    assert.equal(damage.length, 1);
    assert.ok(damage[0].p.armorDamage > 0, 'the same worker used the real accepted damage owner');
    const resolved = result.wire.events.find(e => e.t === 'survivalArena:stormResolve');
    assert.ok(resolved); assert.equal(reader.handleStormResolve(resolved.p), true);
    assert.ok(scene.getObjectByName('storm_discharge_arc'));
    reader.updateRoom(resolved.p.atSim + 0.31, 1 / 60, {});
    assert.equal(scene.getObjectByName('storm_discharge_arc'), undefined);
  } finally {
    lane?.close();
    await send({ kind: 'close' });
    await worker.terminate();
  }
});
