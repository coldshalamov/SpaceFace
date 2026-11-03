import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { createSimLaneRuntime } from '../src/core/simLaneMain.js';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { laneCommandSink, uninstallSimCommandSink, installSimCommandSink } from '../src/core/simLaneCommands.js';
import { CERES_WORKFLEET_CONTRACT as C } from '../src/data/ceresWorkfleet.js';
import { ceresWorkfleetHardwareSpec } from '../src/data/ceresWorkfleetHardware.js';
import { markMachineryEffective, machineryRequestedPresentation } from '../src/core/machineryPresentation.js';
import { publishCeresWorkfleetActuation, ceresWorkfleetThrust } from '../src/systems/ceresWorkfleet.js';
import { readCeresWorkfleetActuation, recordCeresWorkfleetCutWork } from '../src/core/ceresWorkfleetActuation.js';

const contract = JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8'));

test('actual native workfleet output crosses production host and current main-lane receipt', async () => {
  const host = createSimHost(), main = createGameState(47);
  let receive, initRequest, tick = 0;
  const asWorker = async fn => { const sink = laneCommandSink(); uninstallSimCommandSink();
    try { return await fn(); } finally { if (sink) installSimCommandSink(sink); } };
  const lane = createSimLaneRuntime({ state: main, bus: createBus(), registry: {}, helpers: {},
    flags: { lane: 'worker', sab: false, warnings: [] }, clockMode: 'worker-local',
    channelFactory: () => ({ onMessage(fn) { receive = fn; }, post(msg) { if (msg.kind === 'init') initRequest = msg; }, terminate() {} }) });
  try {
    const init = await asWorker(() => host.init({ ...initRequest, scenarioContract: contract }));
    receive(structuredClone({ kind: 'ready', seq: initRequest.seq, ...init })); await lane.readyPromise;
    const { state, runtime, registry } = host.host;
    state.mode = 'flight'; registry.get('world').enterSector(C.sectorId);
    const breaker = runtime.spawn(ceresWorkfleetHardwareSpec('breaker'));
    const head = runtime.spawn(ceresWorkfleetHardwareSpec('cutterHead'));
    state.tick = 40; state.simTime = 4;
    const physics = registry.get('physics'); assert.equal(await asWorker(() => physics.prepareBackend(state)), true);
    const native = physics._sg02; native.syncFromEntities([breaker, head]);
    for (const entity of [breaker, head]) markMachineryEffective(entity, state, machineryRequestedPresentation(entity));
    const control = ceresWorkfleetThrust(breaker, { x: breaker.pos.x + 20, z: breaker.pos.z, rot: breaker.rot }, { speed: 1, accel: .5 });
    publishCeresWorkfleetActuation(breaker, control, state.tick, state);
    native.step(1 / 60, state.tick);
    // The actual site owner accepts both brace and cutting work; this fixture selects
    // the work result directly, rather than waiting for the full worker route.
    const sites = registry.get('asteroidSites');
    const brace = sites.applyWorldSiteBeamOperation({ siteId: C.siteId, componentId: 'long_plate_clamp', verb: 'repair', amount: 24, requestStreamId: 'player-industrial-beam', requestSequence: 1, tick: state.tick });
    assert.equal(brace.ok, true, JSON.stringify(brace));
    const cut = sites.applyWorldSiteBeamOperation({ siteId: C.siteId, componentId: 'long_plate', verb: 'cut', amount: 1, requestStreamId: 'player-industrial-beam', requestSequence: 2, tick: state.tick });
    assert.equal(cut.ok, true, JSON.stringify(cut)); assert.ok(cut.moved > 0);
    state.npcJobs.ceresWorkfleet = { phase: 'head_cut' };
    assert.equal(recordCeresWorkfleetCutWork(state, head, cut), true);
    const step = async generation => {
      const reply = await asWorker(() => host.tick({ tick: ++tick, steps: 0, commands: [], generation }));
      receive(structuredClone({ kind: 'clockTick', ...reply })); return reply;
    };
    const first = await step(0), mainBreaker = main.entities.get(breaker.id), mainHead = main.entities.get(head.id);
    assert.ok(mainBreaker && mainHead);
    const force = readCeresWorkfleetActuation(mainBreaker, main), cutting = readCeresWorkfleetActuation(mainHead, main);
    assert.ok(force && Math.hypot(force.localFx, force.localFz) > 0, 'actual consumed native control reaches main');
    assert.equal(cutting?.cutWork, true, 'accepted site work reaches main cutter');
    assert.equal(mainBreaker.data.ceresWorkfleetPublic, undefined, 'receipt stays outside entity data');
    state.tick++; state.simTime += 1 / 60;
    breaker.data.playerOwned = true;
    const empty = await step(0);
    assert.equal(mainBreaker.data.playerOwned, true, 'capture state reaches the main guard before the receipt');
    assert.equal(!!readCeresWorkfleetActuation(mainBreaker, main), false, 'no new consumed force revokes output');
    assert.equal(!!readCeresWorkfleetActuation(mainHead, main), false, 'cut work is current-tick only');
    receive(structuredClone({ kind: 'clockTick', ...first }));
    assert.equal(!!readCeresWorkfleetActuation(mainBreaker, main), false, 'old tick cannot make old telemetry current');
    lane.runner.setLifecycleGeneration(1);
    receive(structuredClone({ kind: 'clockTick', ...empty }));
    assert.equal(!!readCeresWorkfleetActuation(mainHead, main), false, 'old lifecycle cannot bind');
  } finally { lane.close(); host.shutdown(); }
});
