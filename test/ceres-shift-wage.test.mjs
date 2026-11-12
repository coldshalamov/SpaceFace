import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { createSimLaneRuntime } from '../src/core/simLaneMain.js';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { laneCommandSink, uninstallSimCommandSink, installSimCommandSink } from '../src/core/simLaneCommands.js';
import { CERES_WORKFLEET_CONTRACT as C } from '../src/data/ceresWorkfleet.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { kesslerCeresShiftChoice, kesslerCeresShiftReply } from '../src/ui/station/ceresShiftConversation.js';

const contract = JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8'));
const WAGE = 'ceres:second-measure:brace-wage';

test('the real site receipt pays once and reaches the main wallet before the yard call', async () => {
  const host = createSimHost(), main = createGameState(47), mainBus = createBus();
  let receive, initRequest, tick = 0;
  const asWorker = async fn => { const sink = laneCommandSink(); uninstallSimCommandSink();
    try { return await fn(); } finally { if (sink) installSimCommandSink(sink); } };
  const lane = createSimLaneRuntime({ state: main, bus: mainBus, registry: {}, helpers: {},
    flags: { lane: 'worker', sab: false, warnings: [] }, clockMode: 'worker-local',
    channelFactory: () => ({ onMessage(fn) { receive = fn; }, post(msg) { if (msg.kind === 'init') initRequest = msg; }, terminate() {} }) });
  const received = [];
  mainBus.on('comms:message', p => { if (p.sender === 'SECOND MEASURE YARD') received.push({ ...p, wallet: main.player.credits }); });
  try {
    const init = await asWorker(() => host.init({ ...initRequest, scenarioContract: contract }));
    receive(structuredClone({ kind: 'ready', seq: initRequest.seq, ...init })); await lane.readyPromise;
    const { state, registry, runtime } = host.host;
    state.mode = 'flight'; registry.get('world').enterSector(C.sectorId);
    const player = runtime.spawn(makeShipEntitySpec('ship_kestrel', { isPlayer: true,
      pos: { ...C.sitePlacement.pos }, fittings: [] }));
    state.playerId = player.id;
    const sites = registry.get('asteroidSites'), econ = registry.get('economy');
    sites._syncWorldSites(C.sectorId);
    const start = state.player.credits;
    const step = async () => { const reply = await asWorker(() => host.tick({ tick: ++tick, steps: 0, commands: [], generation: 0 }));
      receive(structuredClone({ kind: 'clockTick', ...reply })); return reply; };
    const operation = amount => sites.applyWorldSiteBeamOperation({ siteId: C.siteId, componentId: 'long_plate_clamp', verb: 'repair', amount,
      requestStreamId: 'player-industrial-beam', requestSequence: state.tick, tick: state.tick });
    state.tick = 10;
    const partial = operation(12); assert.equal(partial.receipt.complete, false); assert.equal(state.player.credits, start);
    await step(); assert.equal(received.length, 0);
    state.tick = 11;
    const complete = operation(12); assert.equal(complete.receipt.complete, true);
    assert.equal(state.player.credits, start + 400);
    const event = { siteId: C.siteId, componentId: 'long_plate_clamp', operationId: 'brace_long_plate', receipt: complete.receipt };
    assert.equal(econ.settleCeresBraceWage(event).duplicate, true);
    assert.equal(econ.settleCeresBraceWage({ ...event, receipt: { ...event.receipt } }).ok, false,
      'a copied same-id event is not the live committed receipt');
    await step();
    assert.equal(received.length, 1); assert.match(received[0].text, /400 credits transferred/i);
    assert.equal(received[0].wallet, start + 400, 'domain is applied before the paid call');
    const saved = registry.get('save').serializeData();
    assert.equal(saved.player.credits, start + 400);
    assert.ok(saved.economy.committedIntents[WAGE]);
    assert.equal(registry.get('save')._restore(structuredClone(saved), 'quick').restored, true);
    assert.ok(state.economy.committedIntents[WAGE], 'Continue restores the one-time wage record');
    assert.equal(econ.settleCeresBraceWage(event).ok, false, 'a pre-restore receipt is not the current live operation');
    assert.equal(state.player.credits, start + 400, 'restored settlement cannot pay again');
    const legacy = structuredClone(saved); delete legacy.economy.committedIntents[WAGE];
    assert.equal(registry.get('save')._restore(legacy, 'quick').restored, true);
    assert.equal(state.player.credits, start + 400, 'loading an already-braced legacy save does not pay');
    state.tick++;
    assert.equal(econ.settleCeresBraceWage(event).ok, false, 'an old completion event cannot backpay a legacy record');
    const forged = { ...event, receipt: { ...event.receipt, tick: state.tick, requestSequence: state.tick } };
    assert.equal(econ.settleCeresBraceWage(forged).ok, false, 'same id with forged current timing cannot authenticate');
    assert.equal(state.player.credits, start + 400);
  } finally { lane.close(); host.shutdown(); }
});

test('Kessler offers the work and reports only the actual site outcome', () => {
  const s = { ui: { docked: true, dockedStationId: 'station_helios' }, sites: { worldById: {} } };
  const id = kesslerCeresShiftChoice(s, 'station_helios').id;
  const reply = () => kesslerCeresShiftReply(s, 'station_helios', id).text;
  assert.match(reply(), /400 credits.*completed brace/i);
  s.sites.worldById[C.siteId] = { completedOperations: { brace_long_plate: { receiptId: 'actual' } }, payloads: { long_plate: {} } };
  assert.match(reply(), /do not have a completed lift/i);
  s.sites.worldById[C.siteId].payloads.long_plate.retained = { receiverWorldRecordId: C.identities.cradle };
  assert.match(reply(), /secured in the cradle/i);
  s.sites.worldById[C.siteId].payloads.long_plate.destroyed = true;
  assert.match(reply(), /plate is gone/i);
  assert.equal(kesslerCeresShiftChoice(s, 'station_ceres'), null);
});
