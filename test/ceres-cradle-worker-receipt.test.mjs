import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { createSimLaneRuntime } from '../src/core/simLaneMain.js';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { CERES_WORKFLEET_CONTRACT as C } from '../src/data/ceresWorkfleet.js';
import { ceresWorkfleetHardwareSpec } from '../src/data/ceresWorkfleetHardware.js';
import { bindCeresCradleLayout, readCeresCradleLayout, canPublishCeresCradleLayout } from '../src/core/ceresWorkfleetLayoutAdmission.js';

const scenarioContract = JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8'));

test('production native cradle receipt reaches the actual main guard and follows its lifetime', async () => {
  const host = createSimHost(), main = createGameState(4242);
  let receive, initRequest, tick = 0;
  const lane = createSimLaneRuntime({ state: main, bus: createBus(), registry: {}, helpers: {},
    flags: { lane: 'worker', sab: false, warnings: [] }, clockMode: 'worker-local',
    channelFactory: () => ({ onMessage(fn) { receive = fn; }, post(msg) { if (msg.kind === 'init') initRequest = msg; }, terminate() {} }) });
  try {
    const init = await host.init({ ...initRequest, scenarioContract });
    receive(structuredClone({ kind: 'ready', seq: initRequest.seq, ...init }));
    await lane.readyPromise;
    const { state, runtime, registry } = host.host;
    state.world.currentSectorId = C.sectorId; main.world.currentSectorId = C.sectorId;
    const entity = runtime.spawn(ceresWorkfleetHardwareSpec('cradle'));
    assert.equal(bindCeresCradleLayout(entity, state), 'keepers-v2');
    const step = async generation => {
      const reply = await host.tick({ tick: ++tick, steps: 0, commands: [], generation });
      receive(structuredClone({ kind: 'clockTick', ...reply }));
      return reply;
    };
    await step(0);
    const row = main.entities.get(entity.id);
    assert.ok(row, 'the real journal and spawn information created the main facade');
    assert.equal(canPublishCeresCradleLayout(row, main), false, 'recipe alone is not native readiness');
    const physics = registry.get('physics');
    assert.equal(await physics.prepareBackend(state), true);
    physics._sg02.syncFromEntities([entity]);
    const ready = await step(0);
    assert.equal(ready.entityVitals.find(v => v[0] === entity.id)[1].ceresCradlePublic.receipt.layout, 'keepers-v2');
    assert.equal(readCeresCradleLayout(row, main), 'keepers-v2');
    assert.equal(canPublishCeresCradleLayout(row, main), true);
    host.host.journal.requestRebuild('receipt-test');
    const rebuild = await step(0);
    assert.equal(rebuild.journalFullRebuild, true);
    assert.strictEqual(main.entities.get(entity.id), row);
    assert.equal(canPublishCeresCradleLayout(row, main), true, 'full rebuild rebinds after data replacement');
    entity.physicsBody.revision++;
    await step(0);
    assert.equal(canPublishCeresCradleLayout(row, main), false, 'revision awaiting native body revokes');
    physics._sg02.syncFromEntities([entity]);
    const renewed = await step(0);
    assert.equal(canPublishCeresCradleLayout(row, main), true, 'new native body authorizes its revision');
    lane.runner.setLifecycleGeneration(1);
    assert.equal(canPublishCeresCradleLayout(row, main), false, 'world change immediately revokes old receipt');
    receive(structuredClone({ kind: 'clockTick', ...renewed }));
    assert.equal(canPublishCeresCradleLayout(row, main), false, 'old envelope cannot reauthorize');
    await step(1);
    assert.equal(canPublishCeresCradleLayout(row, main), true, 'current generation authorizes existing live body');
    physics._sg02.syncFromEntities([]);
    await step(1);
    assert.equal(canPublishCeresCradleLayout(row, main), false, 'removed native body sends null revocation');
  } finally { lane.close(); host.shutdown(); }
});
