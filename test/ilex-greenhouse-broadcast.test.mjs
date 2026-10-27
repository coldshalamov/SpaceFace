import test from 'node:test';
import assert from 'node:assert/strict';
import { ILEX_ARK as C, ILEX_VAULT_IDS, freshIlexArk, normalizeIlexArk } from '../src/data/ilexArk.js';
import { ilexGreenhouseBroadcast } from '../src/data/ilexGreenhouse.js';
import { stationBroadcast, CADENCE_S, COMBAT_SILENCE_S } from '../src/systems/stationBroadcast.js';
import { createBus } from '../src/core/eventBus.js';
import { createSimulation } from '../src/core/sim.js';
import { economy } from '../src/systems/economy.js';
import { createDomainDiffer, applyDomainPathUpdate, configureDomainMirroring, createDomainMirroringProfile } from '../scripts/lib/simReadModel.mjs';

function settled(ids) {
  const row = freshIlexArk();
  row.phase = 'settled'; row.acceptedAt = 0; row.deadline = C.deadlineS;
  for (const id of ILEX_VAULT_IDS) row.vaults[id].status = ids.includes(id) ? 'delivered' : 'lost';
  row.settlement = { id: `${C.id}:outcome`, stationId: C.stationId, deliveredVaultIds: [...ids],
    at: 30, harvestAt: 30 + C.harvestDelayS, rewardCr: ids.length ? C.baseRewardCr + C.vaultRewardCr * ids.length : 0 };
  return { ilexArk: row, economy: { committedIntents: {} }, simTime: 30, meta: { seed: 804 } };
}
function boot(source = settled(['vault_2'])) {
  const bus = createBus(), calls = [], queue = { active: null, pending: [] };
  const player = { id: 1, type: 'ship', pos: { x: 0, z: 0 } };
  const station = { id: 2, type: 'station', pos: { x: 100, z: 0 }, data: { stationId: C.stationId, stationTypeId: 'mining' } };
  const state = Object.assign(source, { runtime: { profileId: 'production' }, mode: 'flight', playerId: 1, entities: new Map([[1, player], [2, station]]), entityList: [player, station] });
  let accepted = true;
  const system = { ...stationBroadcast };
  const ctx = { state, bus, registry: { get: () => ({ queue }) }, helpers: { voice: { say(p) { calls.push(p); if (accepted) bus.emit('voice:surface', p); return accepted; } } } };
  system.init(ctx);
  return { system, state, bus, calls, queue, station, ctx, reject(value) { accepted = !value; },
    advance() { state.simTime += CADENCE_S; system._tick(); }, greenhouse() { return calls.filter(c => c.id?.startsWith('ilex:greenhouse:')); } };
}
function transport() {
  configureDomainMirroring(createDomainMirroringProfile('station'));
  const differ = createDomainDiffer(), domains = new Map(), facade = {};
  let tick = 0;
  return { facade, land(state) {
    for (let i = 0; i < 61; i++, tick++) for (const update of structuredClone(differ.diff(state, tick).updates)) {
      applyDomainPathUpdate(domains, update, new Set());
      const root = update.segs[0]; if (!root.includes('.')) facade[root] = domains.get(root);
    }
    return facade;
  } };
}

test('real economy harvest reaches the flight projection and existing local PA, with truthful full/partial/zero copy', () => {
  for (const ids of [ILEX_VAULT_IDS, ['vault_2', 'vault_6'], []]) {
    const sim = createSimulation({ seed: 804, systems: [economy] });
    const source = settled(ids), wire = transport();
    let pa;
    try {
      sim.state.ilexArk = source.ilexArk; sim.state.simTime = source.simTime;
      const econ = sim.registry.get('economy'), originalGet = econ.registryGet.bind(econ);
      econ.registryGet = name => name === 'ilexArk' ? { outcomeReceipt: () => structuredClone(source.ilexArk.settlement) } : originalGet(name);
      const events = []; sim.bus.on('ilexArk:harvested', p => events.push(structuredClone(p)));
      pa = boot(wire.land(sim.state));
      assert.equal(pa.state.ilexArk, undefined, 'flight receives no custody ledger');
      pa.system._tick();
      assert.equal(pa.greenhouse().length, 1);
      assert.match(pa.greenhouse()[0].text, ids.length ? /No first harvest.*recorded yet/ : /No Ilex vault arrived.*no planting/);
      assert.equal(econ.applyIlexSeedHarvest(source.ilexArk.settlement.id).reason, 'planting_pending');
      sim.state.simTime = source.ilexArk.settlement.harvestAt;
      assert.equal(econ.applyIlexSeedHarvest(source.ilexArk.settlement.id).qty, ids.length * C.provisionsPerVault);
      assert.equal(events.length, 1);
      const committed = JSON.stringify(sim.state.economy.committedIntents), credits = sim.state.player.credits;
      const stock = sim.state.economy.markets[C.stationId].cmdty_food.stock;
      wire.land(sim.state); pa.state.mode = 'flight'; pa.system._tick();
      assert.equal(pa.greenhouse().length, ids.length ? 2 : 1, 'zero arrival does not invent a second harvest announcement');
      const line = pa.greenhouse().at(-1);
      if (ids.length) {
        assert.match(line.text, new RegExp(`first harvest added ${ids.length * 12}u`));
        assert.match(line.text, new RegExp(`${ids.length}/6 Ilex seed lines accepted`));
        assert.match(line.text, /Check the Market for current availability/);
      }
      assert.equal(line.channel, 'ambient'); assert.equal(line.priority, 1); assert.equal(line.stationId, C.stationId);
      assert.equal(econ.applyIlexSeedHarvest(source.ilexArk.settlement.id).duplicate, true);
      assert.equal(events.length, 1);
      assert.equal(sim.state.economy.markets[C.stationId].cmdty_food.stock, stock);
      assert.equal(sim.state.player.credits, credits);
      assert.equal(JSON.stringify(sim.state.economy.committedIntents), committed);
      // Ordinary trade can exhaust the stock. A recap states a past addition, never availability.
      sim.state.economy.markets[C.stationId].cmdty_food.stock = 0;
      assert.equal(ilexGreenhouseBroadcast(sim.state, C.stationId).text, line.text);
      for (let i = 0; i < 10; i++) pa.advance();
      assert.equal(pa.greenhouse().length, ids.length ? 2 : 1, 'no repeated greenhouse loop');
    } finally { pa?.system.destroy(); sim.dispose(); }
  }
});

test('PA remains local and yields to tutorial, combat, voice floor, cadence and non-flight mode', () => {
  const h = boot();
  try {
    h.station.data.stationId = 'station_helios'; h.system._tick(); assert.equal(h.greenhouse().length, 0);
    h.station.data.stationId = C.stationId; h.state.simTime += CADENCE_S;
    h.station.pos.x = 1000; h.system._tick(); assert.equal(h.greenhouse().length, 0); h.station.pos.x = 100;
    h.state.mode = 'station'; h.system._tick(); h.state.mode = 'flight';
    h.state.onboarding = { active: true }; h.system._tick(); h.state.onboarding.finished = true;
    h.queue.active = {}; h.system._tick(); h.queue.active = null;
    h.queue.pending.push({}); h.system._tick(); h.queue.pending = [];
    h.bus.emit('combat:damage', { targetId: 1 }); h.system._tick();
    assert.equal(h.greenhouse().length, 0);
    h.state.simTime += COMBAT_SILENCE_S; h.system._tick(); assert.equal(h.greenhouse().length, 1);
    const count = h.calls.length; h.system._tick(); assert.equal(h.calls.length, count);
    h.advance(); assert.equal(h.greenhouse().length, 1, 'normal station life resumes, no second greenhouse line');
  } finally { h.system.destroy(); }
});

test('declined or missing voice cannot consume the one local recap and retry stays rate bounded', () => {
  const h = boot();
  try {
    const say = h.ctx.helpers.voice.say; delete h.ctx.helpers.voice.say;
    h.system._tick(); assert.equal(h.system._ilexBroadcastId, null);
    h.ctx.helpers.voice.say = say; h.reject(true); h.system._tick();
    assert.equal(h.system._ilexBroadcastId, null);
    h.system._tick(); assert.equal(h.greenhouse().length, 1);
    h.reject(false); h.advance(); assert.equal(h.greenhouse().length, 2);
    h.advance(); assert.equal(h.greenhouse().length, 2);
  } finally { h.system.destroy(); }
});

test('Continue recaps restored facts once; restoring, fresh game and destruction cannot leak the previous crop', () => {
  const h = boot();
  try {
    h.system._tick(); assert.equal(h.greenhouse().length, 1);
    const saved = JSON.parse(JSON.stringify({ ilexArk: h.state.ilexArk, economy: h.state.economy }));
    h.bus.emit('save:restoring'); h.advance(); assert.equal(h.greenhouse().length, 1);
    h.state.ilexArk = normalizeIlexArk(saved.ilexArk); h.state.economy = saved.economy; h.state.simTime = 30;
    h.bus.emit('save:loaded'); h.system._tick(); assert.equal(h.greenhouse().length, 2);
    assert.equal(h.greenhouse()[0].text, h.greenhouse()[1].text);
    h.advance(); assert.equal(h.greenhouse().length, 2);
    h.state.ilexArk = freshIlexArk(); h.bus.emit('game:newGame'); h.system._tick();
    assert.equal(h.greenhouse().length, 2);
    h.system.destroy(); h.bus.emit('save:loaded'); h.advance(); assert.equal(h.greenhouse().length, 2);
    h.state.ilexArk = saved.ilexArk; h.system.init(h.ctx); h.system._tick(); assert.equal(h.greenhouse().length, 3);
  } finally { h.system.destroy(); }
});

test('elapsed time and arbitrary market inventory never invent a crop; legacy saves stay silent', () => {
  const state = settled(['vault_1']); state.simTime = 100000;
  state.economy.markets = { [C.stationId]: { cmdty_food: { stock: 9999 } } };
  assert.match(ilexGreenhouseBroadcast(state, C.stationId).text, /No first harvest.*recorded yet/);
  assert.equal(ilexGreenhouseBroadcast({}, C.stationId), null);
  state.ilexArk.vaults.vault_1.status = 'lost';
  assert.equal(ilexGreenhouseBroadcast(state, C.stationId), null);
});

test('existing browser cadence and real voice arbiter deliver a caption receipt, retract it on restore, and recover a failed load', async () => {
  const { voiceArbiter } = await import('../src/ui/voiceArbiter.js');
  const { projectBridgeEvent } = await import('../scripts/lib/simEventBridge.mjs');
  const oldWindow = globalThis.window;
  const timers = new Map(); let nextTimer = 0;
  globalThis.window = { setInterval(fn) { timers.set(++nextTimer, fn); return nextTimer; }, clearInterval(id) { timers.delete(id); } };
  const h = boot(), arb = { ...voiceArbiter }, receipts = [];
  try {
    arb.init(h.ctx); h.ctx.registry.get = name => name === 'voiceArbiter' ? arb : null;
    h.bus.on('toast', p => { if (p._fromVoice) receipts.push(p); });
    assert.equal(timers.size, 1, 'the production timer owns evaluation');
    [...timers.values()][0]();
    assert.equal(receipts.length, 0, 'queued copy is not claimed as presented');
    arb.update(1 / 60, h.state);
    assert.equal(receipts.length, 1);
    assert.match(receipts[0].text, /No first harvest.*recorded yet/);
    assert.equal(arb.queue.active.channel, 'ambient');
    // A harvested event may precede its domain update. It cannot promote waiting facts.
    const fakeHarvest = { receiptId: `${C.id}:outcome:first-harvest`, stationId: C.stationId,
      commodityId: 'cmdty_food', qty: 72, deliveredVaultIds: [...ILEX_VAULT_IDS], at: 150 };
    const bridged = structuredClone(projectBridgeEvent('ilexArk:harvested', fakeHarvest));
    assert.equal(bridged.dropped, false);
    assert.deepEqual(bridged.flat, fakeHarvest);
    h.bus.emit('ilexArk:harvested', bridged.flat);
    assert.match(ilexGreenhouseBroadcast(h.state, C.stationId).text, /No first harvest/);
    h.bus.emit('save:restoring');
    assert.equal(arb.queue.active, null, 'an old-life caption is cancelled at restore entry');
    h.state.simTime += 40; [...timers.values()][0](); arb.update(1 / 60, h.state);
    assert.equal(receipts.length, 1);
    h.bus.emit('save:error', { reason: 'load_failed' });
    [...timers.values()][0](); arb.update(1 / 60, h.state);
    assert.equal(receipts.length, 2, 'failed Continue does not silence station PA forever');
    h.system.destroy(); assert.equal(timers.size, 0); assert.equal(arb.queue.active, null);
  } finally { h.system.destroy(); arb.destroy?.(); globalThis.window = oldWindow; }
});

test('ordinary headless simulations retain silence; production worker clock is exclusive and removed on destroy', () => {
  const h = boot();
  try {
    h.bus.emit('economy:tick', { t: 30 }); assert.equal(h.calls.length, 0);
    h.system.destroy(); h.ctx.helpers.mobileSeams = { lane: 'worker' }; h.system.init(h.ctx);
    h.bus.emit('economy:tick', { t: 30 }); assert.equal(h.greenhouse().length, 1);
    assert.equal(h.system._timer, null);
    h.system.destroy(); h.state.simTime += CADENCE_S;
    h.bus.emit('economy:tick', { t: h.state.simTime }); assert.equal(h.calls.length, 1);
  } finally { h.system.destroy(); }
});

test('actual production worker owns PA and arbiter, and its caption crosses the real host and main event application', async () => {
  const { createSimHost } = await import('../scripts/lib/simWorkerHost.mjs');
  const { createSimLaneRuntime } = await import('../src/core/simLaneMain.js');
  const { createGameState } = await import('../src/core/gameState.js');
  const { makeShipEntitySpec } = await import('../src/systems/ships.js');

  const { laneCommandSink, uninstallSimCommandSink, installSimCommandSink } = await import('../src/core/simLaneCommands.js');
  const previousStorage = globalThis.localStorage, worker = createSimHost();
  const mainState = createGameState(804), mainBus = createBus(), presented = [], surfaced = [];
  const { default: contract } = await import('../src/data/scenarios/47a.scenario.json', { with: { type: 'json' } });
  let deliver;
  const asWorker = async operation => {
    const sink = laneCommandSink(); uninstallSimCommandSink();
    try { return await operation(); } finally { if (sink) installSimCommandSink(sink); }
  };
  const lane = createSimLaneRuntime({ state: mainState, bus: mainBus, registry: {},
    flags: { lane: 'worker', sab: false, warnings: [] }, clockMode: 'worker-local',
    channelFactory: () => ({ onMessage(fn) { deliver = fn; }, terminate() { worker.shutdown(); },
      post(message) {
        if (message.kind !== 'init') return;
        asWorker(() => worker.init({ ...structuredClone(message), scenarioContract: contract }))
          .then(reply => deliver(structuredClone({ kind: 'ready', seq: message.seq, ...reply })))
          .catch(error => deliver({ kind: 'error', seq: message.seq, message: String(error) }));
      } }) });
  mainBus.on('toast', p => { if (p._fromVoice && /Ceres greenhouse/.test(p.text)) presented.push(p); });
  mainBus.on('voice:surface', p => { if (/Ceres greenhouse/.test(p.text)) surfaced.push(p); });
  try {
    await lane.readyPromise;
    const { state, registry, runtime, bus } = worker.host;
    const pa = registry.get('stationBroadcast'), arb = registry.get('voiceArbiter'), econ = registry.get('economy');
    assert.equal(pa._ctx.helpers.voice.say instanceof Function, true);
    assert.equal(pa._ctx.registry.get('voiceArbiter'), arb);
    assert.equal(pa._timer, null); assert.equal(typeof pa._onEconomyTick, 'function');
    state.mode = 'flight'; state.simTime = 150; state.onboarding = { active: false, finished: true };
    const player = runtime.spawn(makeShipEntitySpec('ship_kestrel', { isPlayer: true, player: state.player, pos: { x: 0, z: 0 }, fittings: [] }));
    state.playerId = player.id;
    runtime.spawn({ type: 'station', pos: { x: 100, z: 0 }, radius: 30, mass: 1e9, hull: 1e9,
      data: { stationId: C.stationId, stationTypeId: 'mining', dockRadius: 70 } });
    registry.get('ilexArk').deserialize(settled(['vault_2', 'vault_6']).ilexArk);
    const harvest = econ.applyIlexSeedHarvest(`${C.id}:outcome`);
    assert.equal(harvest.qty, 24);
    // The harvest receipt itself emits only its existing generic toast. The PA waits for
    // the real economy cadence and checks the real worker voice floor at that instant.
    assert.equal(pa._ilexBroadcastId, null);
    const ledger = JSON.stringify(state.economy.committedIntents), credits = state.player.credits;
    arb.newGame(); // Start this focused cadence with a known presentation floor.
    pa._ctx.helpers.voice.say({ id: 'test:mission', channel: 'story', text: 'Mission channel occupied.', ttl: 2 });
    arb.update(1 / 60, state);
    econ.update(5, state);
    assert.equal(pa._ilexBroadcastId, null, 'the real worker PA yields to its real mission voice floor');
    state.simTime += 3; arb.update(1 / 60, state);
    econ.update(5, state); arb.update(1 / 60, state);
    assert.match(arb.queue.active?.text || '', /first harvest added 24u/);
    const reply = await asWorker(() => worker.tick({ kind: 'tick', steps: 0, tick: 0, commands: [] }));
    const wire = structuredClone(reply);
    assert.ok(wire.events.some(e => e.t === 'voice:surface' && /Ceres greenhouse/.test(e.p?.text)));
    deliver({ kind: 'clockTick', ...wire });
    assert.equal(presented.length, 1); assert.equal(surfaced.length, 1);
    assert.equal(surfaced[0].channel, 'ambient'); assert.equal(surfaced[0].priority, 1);
    assert.match(presented[0].text, /2\/6 Ilex seed lines accepted/);
    assert.equal(state.player.credits, credits); assert.equal(JSON.stringify(state.economy.committedIntents), ledger);
    bus.emit('save:restoring'); assert.equal(arb.queue.active, null);
  } finally {
    lane.close(); worker.shutdown();
    if (previousStorage === undefined) delete globalThis.localStorage; else globalThis.localStorage = previousStorage;
  }
});

test('only a matching surface receipt consumes a recap, including synchronous delivery and stale lifecycle receipts', () => {
  const h = boot();
  try {
    h.ctx.helpers.voice.say = p => { h.calls.push(p); return true; };
    h.system._tick();
    const first = h.calls[0];
    assert.equal(h.system._ilexBroadcastId, null, 'accepted is not heard');
    for (const change of [{ id: 'wrong' }, { text: 'wrong' }, { channel: 'story' }]) {
      h.bus.emit('voice:surface', { ...first, ...change });
      assert.equal(h.system._ilexBroadcastId, null);
    }
    h.bus.emit('save:restoring'); h.bus.emit('save:loaded'); h.system._tick();
    const second = h.calls[1];
    assert.notEqual(first.id, second.id, 'old lifecycle delivery cannot match a new attempt');
    h.bus.emit('voice:surface', first); assert.equal(h.system._ilexBroadcastId, null);
    h.state.simTime += 5; h.bus.emit('voice:surface', second); assert.ok(h.system._ilexBroadcastId);
    h.state.simTime += CADENCE_S - 1; h.system._tick(); assert.equal(h.calls.length, 2, '20 seconds from actual presentation, not only request');
    h.advance(); assert.equal(h.greenhouse().length, 2);
    h.bus.emit('game:newGame');
    h.ctx.helpers.voice.say = p => { h.calls.push(p); h.bus.emit('voice:surface', p); return true; };
    h.system._tick(); assert.ok(h.system._ilexBroadcastId, 'receipt listener is armed before say');
    h.advance(); assert.equal(h.greenhouse().length, 3);
  } finally { h.system.destroy(); }
});

test('real arbiter expiry and preemption before presentation do not swallow recap; departed or changed facts are invalidated', async () => {
  const { voiceArbiter } = await import('../src/ui/voiceArbiter.js');
  const h = boot(), arb = { ...voiceArbiter }, surfaced = [];
  try {
    arb.init(h.ctx); h.ctx.registry.get = () => arb;
    h.bus.on('voice:surface', p => { if (p.id?.startsWith('ilex:greenhouse:')) surfaced.push(p); });
    h.system._tick();
    h.ctx.helpers.voice.say({ id: 'urgent', channel: 'story', text: 'Hold for mission.', ttl: 10 });
    arb.update(1 / 60, h.state);
    assert.equal(h.system._ilexBroadcastId, null);
    h.state.simTime += 11; arb.update(1 / 60, h.state);
    assert.equal(surfaced.length, 0, 'queued greenhouse expired under mission floor');
    h.state.simTime += 9; h.system._tick();
    h.station.pos.x = 1000; arb.update(1 / 60, h.state);
    assert.equal(surfaced.length, 0, 'departed station cannot surface later');
    h.station.pos.x = 100; h.state.simTime += CADENCE_S; h.system._tick();
    h.state.ilexArk = freshIlexArk(); arb.update(1 / 60, h.state);
    assert.equal(surfaced.length, 0, 'no accepted voyage means no stale crop recap');
    h.state.ilexArk = settled(['vault_2']).ilexArk;
    h.state.simTime += CADENCE_S; h.system._tick(); arb.update(1 / 60, h.state);
    assert.equal(surfaced.length, 1); assert.ok(h.system._ilexBroadcastId);
    h.ctx.helpers.voice.say({ id: 'preempt', channel: 'story', text: 'New mission.', ttl: 1 });
    arb.update(1 / 60, h.state);
    h.state.simTime += CADENCE_S; arb.update(1 / 60, h.state); h.system._tick(); arb.update(1 / 60, h.state);
    assert.equal(surfaced.length, 1, 'actually surfaced line remains delivered after preemption');
  } finally { h.system.destroy(); arb.destroy?.(); }
});

test('worker clock restores generic PA without greenhouse state; browser and presenting worker-main never double clock', () => {
  const oldWindow = globalThis.window, timers = new Map(); let serial = 0;
  const h = boot({ simTime: 30, meta: { seed: 804 } });
  try {
    h.system.destroy(); h.ctx.helpers.mobileSeams = { lane: 'worker' }; h.state.runtime.profileId = 'legacy47a'; h.system.init(h.ctx);
    h.bus.emit('economy:tick'); assert.equal(h.calls.length, 0, 'nonproduction worker-shaped headless remains silent');
    h.system.destroy(); h.state.runtime.profileId = 'production'; h.system.init(h.ctx);
    h.bus.emit('economy:tick'); assert.equal(h.calls.length, 1); assert.equal(h.greenhouse().length, 0);
    h.bus.emit('economy:tick'); assert.equal(h.calls.length, 1);
    h.state.simTime += CADENCE_S; h.bus.emit('economy:tick'); assert.equal(h.calls.length, 2);
    h.system.destroy();
    globalThis.window = { setInterval(fn) { timers.set(++serial, fn); return serial; }, clearInterval(id) { timers.delete(id); } };
    h.system.init(h.ctx); assert.equal(timers.size, 1); assert.equal(h.system._onEconomyTick, null);
    h.bus.emit('economy:tick'); assert.equal(h.calls.length, 2);
    [...timers.values()][0](); assert.equal(h.calls.length, 3);
    h.system.destroy(); h.ctx.simLane = 'worker'; h.system.init(h.ctx);
    assert.equal(timers.size, 0); assert.equal(h.system._onEconomyTick, null);
    h.state.simTime += CADENCE_S; h.bus.emit('economy:tick'); assert.equal(h.calls.length, 3);
  } finally { h.system.destroy(); globalThis.window = oldWindow; }
});

test('restored worker cadence preserves Latch guidance priority and all ambient work remains read-only', () => {
  const h = boot();
  try {
    h.system.destroy(); h.ctx.helpers.mobileSeams = { lane: 'worker' };
    h.station.data.stationId = 'station_tethys';
    h.state.entities.get(1).alive = true;
    h.state.latchNine = { stationId: 'station_tethys', shipId: 1, phase: 'APPROACH', clearance: 'NOT_READY', dockReady: false, guidance: { hint: 'align' } };
    h.state.rng = () => { throw new Error('ambient must not draw shared RNG'); };
    const before = JSON.stringify(h.state);
    h.system.init(h.ctx); h.bus.emit('economy:tick');
    assert.equal(h.calls.length, 1); assert.equal(h.calls[0].id, 'latch-nine:guidance');
    assert.match(h.calls[0].text, /before clearance/);
    for (let i = 0; i < 100; i++) h.bus.emit('economy:tick');
    assert.equal(h.calls.length, 1, 'burst of clock receipts cannot defeat the cap');
    assert.equal(JSON.stringify(h.state), before, 'no save, gameplay or RNG writes');
  } finally { h.system.destroy(); }
});
