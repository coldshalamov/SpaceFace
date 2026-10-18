import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { createGameState } from '../src/core/gameState.js';
import { createSimLaneRuntime } from '../src/core/simLaneMain.js';
import { createBus } from '../src/core/eventBus.js';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { targetConditionReadout } from '../src/ui/targetCondition.js';
import { buildMachineMesh } from '../src/render/machineVisuals.js';
import { tickCustodianWork, tickMasonWork } from '../src/systems/machineWork.js';
import { ensureAlienEcologyState } from '../src/data/alienEcologyState.js';
import { MACHINE_SITES } from '../src/data/precursorMachines.js';

async function workerLane(t) {
  const scenarioContract = JSON.parse(readFileSync(
    new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8',
  ));
  const worker = createSimHost();
  let deliver;
  let pendingTick;
  const channelFactory = () => ({
    post(message) {
      if (message.kind === 'shutdown') return worker.shutdown();
      const operation = message.kind === 'init'
        ? worker.init({ ...message, scenarioContract })
        : worker.tick(message);
      Promise.resolve(operation).then((reply) => {
        const envelope = structuredClone({
          kind: message.kind === 'init' ? 'ready' : 'tickDone', seq: message.seq, ...reply,
        });
        deliver(envelope);
        if (message.kind === 'tick' && message.steps > 0 && pendingTick) {
          const pending = pendingTick;
          pendingTick = null;
          pending.resolve(envelope);
        }
      }, (error) => {
        deliver({ kind: 'error', seq: message.seq, message: String(error?.message || error) });
        if (pendingTick) {
          const pending = pendingTick;
          pendingTick = null;
          pending.reject(error);
        }
      });
    },
    onMessage(callback) { deliver = callback; },
    terminate() { worker.shutdown(); },
  });
  const state = createGameState(4242);
  const lane = createSimLaneRuntime({
    state, registry: {}, bus: createBus(),
    flags: { lane: 'worker', warnings: [], sab: false }, channelFactory,
  });
  t.after(() => { lane.close(); worker.shutdown(); });
  await lane.readyPromise;
  return {
    state, worker, lane,
    tick: () => new Promise((resolve, reject) => {
      pendingTick = { resolve, reject };
      lane.runner.stepOnce();
    }),
  };
}

test('worker transport makes the heavy-hull target readout follow authoritative mass', async (t) => {
  const { state, worker, tick } = await workerLane(t);
  const native = worker.host.runtime.spawn({
    type: 'ship', mass: 300, physicsBody: false, radius: 8,
    pos: { x: 40, y: 0, z: 0 }, vel: { x: 0, z: 0 },
  });
  await tick();
  const target = state.entities.get(native.id);
  assert.ok(target, 'the native ship reaches the main-thread entity map');
  assert.notEqual(target, native, 'the readout consumes a transported entity');
  assert.equal(targetConditionReadout(state, target)?.heavyMass, true,
    'a transported 300-mass hull displays its heavy-mass condition');
  assert.match(targetConditionReadout(state, target).text, /HEAVY MASS · SHOVE RESISTANT/);
  assert.equal(target.mass, 300);

  native.mass = 149;
  await tick();
  assert.equal(state.entities.get(native.id), target, 'mass updates preserve the target identity');
  assert.equal(target.mass, 149, 'later vitals carry changed authoritative mass');
  assert.notEqual(targetConditionReadout(state, target)?.heavyMass, true,
    'the readout stops naming heavy mass below the boundary');
});

for (const kind of ['custodian', 'mason']) {
  for (const rebuild of [false, true]) {
    test(`worker transports ${kind} work lights through ${rebuild ? 'an active rebuild' : 'vitals-only changes'} and completion`, async (t) => {
      const { state, worker, lane, tick } = await workerLane(t);
      const nativeState = worker.host.state;
      const site = MACHINE_SITES[kind === 'custodian' ? 'ashfall_maintenance_scene' : 'pallas_empty_foundry'];
      const native = worker.host.runtime.spawn({
        type: 'machine', physicsBody: false, radius: 12, pos: { ...site.center },
        data: { machine: { kind, siteId: site.siteId } },
      });
      const world = {
        state: nativeState, bus: worker.host.bus,
        _toGlobal: (pos) => ({ ...pos }),
        helpers: { spawnEntity: (spec) => worker.host.runtime.spawn(spec) },
      };
      const sites = ensureAlienEcologyState(nativeState).machineSites;
      if (kind === 'custodian') {
        nativeState.world.dressing ||= { rows: [] };
        nativeState.world.dressing.rows.push({
          id: 900001, type: 'prop', radius: 20, alive: true, pos: { ...site.center },
          data: { machineSite: site.siteId, placeId: 'machine_pylon' },
        });
      } else {
        sites[site.siteId] = {
          courierToken: { status: 'delivered', destSiteId: site.siteId, receiptId: 'transport-receipt' },
          courierReceiver: { stored: 1, acceptedReceipts: { 'transport-receipt': 1 } },
          maintenance: { completed: true },
          jurisdiction: { status: 'resolved', choice: 'construction' },
        };
      }
      await tick();
      const entity = state.entities.get(native.id);
      assert.ok(entity, 'the machine spawns through the production lane');
      assert.notEqual(entity.data.machine, native.data.machine, 'work flags cross a cloned boundary');
      let mesh = buildMachineMesh(entity);
      const lampName = kind === 'custodian' ? 'cust_tip' : 'msn_weld';
      const intensity = () => {
        mesh.userData.updateAuthoredMotion(entity, 1, {}, state);
        return mesh.getObjectByName(lampName).material.emissiveIntensity;
      };
      assert.ok(intensity() <= 0.35, 'a newly transported idle machine has a quiet work light');

      const work = kind === 'custodian' ? tickCustodianWork : tickMasonWork;
      work(world, native, 0.1);
      const field = kind === 'custodian' ? 'repairing' : 'working';
      assert.equal(native.data.machine[field], true, 'the real work owner starts native work');
      const generation = lane.journal.getRebuildGeneration();
      if (rebuild) lane.journal.requestRebuild();
      await tick();
      assert.equal(lane.journal.getRebuildGeneration() > generation, rebuild,
        'the selected transport path was exercised');
      if (rebuild) mesh = buildMachineMesh(entity);
      assert.ok(intensity() >= 1.8, 'a transported machine lights up when native work starts');
      const machineData = entity.data.machine;

      if (kind === 'custodian') {
        for (let charge = 0; charge < 3; charge++) work(world, native, 9);
        assert.equal(sites[site.siteId].maintenance.completed, true);
      } else {
        const body = nativeState.entityList.find((row) => row.data?.machineWorkpiece === site.siteId);
        body.pos.x = site.center.x + site.workCycle.cradleDx;
        body.pos.z = site.center.z;
        body.vel.x = 0;
        body.vel.z = 0;
        work(world, native, 3);
        assert.equal(sites[site.siteId].masonry.status, 'placed');
      }
      assert.equal(native.data.machine[field], false, 'the real work owner finishes native work');
      await tick();
      assert.equal(state.entities.get(native.id), entity, 'work updates preserve entity identity');
      assert.equal(entity.data.machine, machineData, 'vitals update the existing machine data');
      assert.equal(entity.data.machine.kind, kind, 'static machine identity survives work updates');
      assert.equal(entity.data.machine[field], false,
        'completion reaches the nested visual flag');
      assert.ok(intensity() <= 0.35, 'a transported finished machine returns to its quiet work light');
      const steadyReply = await tick();
      assert.ok(!steadyReply.entityVitals.some(([id]) => id === native.id),
        'unchanged work flags do not send another vitals row');
    });
  }
}
