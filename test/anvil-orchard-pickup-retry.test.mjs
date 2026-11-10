import test from 'node:test';
import assert from 'node:assert/strict';
import {ready} from './fixtures/anvil-orchard-custody-ready.mjs';
import {cargo} from '../src/systems/cargo.js';
import {mining} from '../src/systems/mining.js';
import {pickupAcceptanceRetryBlocks, setPickupAcceptanceRetry, clearPickupAcceptanceRetry} from '../src/core/pickupAcceptance.js';

async function released() {
  const h = await ready();
  const registry = h.sim.registry, resolve = registry.get.bind(registry);
  registry.get = name => name === 'cargo' ? cargo : resolve(name);
  cargo.init(registry.ctx); mining.init(registry.ctx);
  h.context = {state: h.sim.state, pickup: h.pod, collector: h.worker};
  return h;
}
const blocks = h => pickupAcceptanceRetryBlocks(h.pod.data, h.worker.id, h.sim.state.playerId, h.sim.state.simTime, h.context);

for (const route of ['mining', 'physics-receipt']) test(`${route} refusal preserves native ready data, throttles retries and mining collects exactly once`, async () => {
  const h = await released();
  try {
    const {state} = h.sim, data = h.pod.data, before = structuredClone(data);
    const receipt = h.owner.readOrchardPodReady(h.pod, state);
    assert.ok(receipt);
    let attempts = 0;
    h.sim.bus.on('pickup:collected', payload => {
      attempts++;
      // Physics normally visits pickups, not Orchard payloads. Exercise its shared retry
      // writer with an explicit owner refusal; real Orchard capacity/collection uses mining.
      if (route === 'physics-receipt' && payload.kind === undefined) {
        payload.acceptedAmount = 0; payload.rejectedAmount = payload.amount;
      }
    });
    const collect = () => route === 'mining' || state.player.cargo.capVolume > 0
      ? mining._collectPickupViaEvent(h.pod, h.worker)
      : h.facade._applyPickupCollection(h.pod, h.worker, h.sim.bus, state);
    const cap = state.player.cargo.capVolume;
    state.player.cargo.capVolume = 0;
    collect();
    assert.equal(attempts, 1);
    assert.equal(blocks(h), true);
    assert.equal(h.pod.data, data); assert.deepEqual(data, before);
    assert.equal(h.owner.readOrchardPodReady(h.pod, state), receipt);
    collect(); state.simTime = 0.74; collect(); assert.equal(attempts, 1);
    state.simTime = 0.75; collect(); assert.equal(attempts, 2);
    assert.equal(h.owner.readOrchardPodReady(h.pod, state), receipt);
    state.player.cargo.capVolume = cap;
    state.simTime = 1.49; collect(); assert.equal(attempts, 2);
    state.simTime = 1.5; collect(); assert.equal(attempts, 3);
    assert.equal(h.pod.alive, false); assert.equal(blocks(h), false);
    assert.equal(state.player.cargo.items.cmdty_gas_hydrogen, 4);
    collect(); assert.equal(state.player.cargo.items.cmdty_gas_hydrogen, 4);
    assert.equal(state.sites.anvilOrchard.lots[0].outcome, 'delivered');
    assert.deepEqual(data, before);
  } finally { h.close(); }
});

test('mining update eligibility shares the protected refusal throttle', async () => {
  const h = await released();
  try {
    h.sim.state.player.cargo.capVolume = 0;
    h.worker.pos = {...h.pod.pos};
    let attempts = 0; h.sim.bus.on('pickup:collected', () => attempts++);
    mining.update(1/60, h.sim.state); assert.equal(attempts, 1);
    mining.update(1/60, h.sim.state); assert.equal(attempts, 1);
    assert.ok(h.owner.readOrchardPodReady(h.pod, h.sim.state));
  } finally { h.close(); }
});

for (const boundary of ['collector-replacement', 'collector-id', 'collector-alias-id', 'collector-life', 'pickup-replacement', 'pickup-id', 'pickup-data', 'pickup-life', 'dead-pickup', 'dead-collector', 'state', 'world', 'sector', 'enter-serial', 'entities', 'row', 'rewind']) {
  test(`protected retry drops at ${boundary} boundary without authorizing custody`, async () => {
    const data = {orchardId: 'anvil_storm_orchard', orchardKind: 'pod', amount: 4};
    const pod = {id: 2, occupantGeneration: 1, alive: true, data};
    const worker = {id: 1, occupantGeneration: 1, alive: true};
    const state = {simTime: 0, playerId: 1, player: {cargo: {items: {}}}, world: {currentSectorId: 'orchard'}, sites: {anvilOrchard: {}}, entities: new Map([[1, worker], [2, pod]])};
    const h = {pod, worker, sim: {state}, context: {state, pickup: pod, collector: worker}, close() {}};
    try {
      const before = structuredClone(h.pod.data);
      state.simTime = 10;
      setPickupAcceptanceRetry(h.pod.data, h.worker.id, 11, h.context);
      assert.equal(blocks(h), true);
      switch (boundary) {
        case 'collector-replacement': state.entities.set(h.worker.id, {...h.worker}); h.context.collector = state.entities.get(h.worker.id); break;
        case 'collector-id': h.worker.id++; break;
        case 'collector-alias-id': h.worker.id = 3; state.entities.set(3, h.worker); break;
        case 'collector-life': h.worker.occupantGeneration++; break;
        case 'pickup-replacement': state.entities.set(h.pod.id, {...h.pod}); h.context.pickup = state.entities.get(h.pod.id); break;
        case 'pickup-id': h.pod.id++; break;
        case 'pickup-data': h.pod.data = structuredClone(h.pod.data); break;
        case 'pickup-life': h.pod.occupantGeneration++; break;
        case 'dead-pickup': h.pod.alive = false; break;
        case 'dead-collector': h.worker.alive = false; break;
        case 'state': h.context.state = {...state}; break;
        case 'world': state.world = {...state.world}; break;
        case 'sector': state.world.currentSectorId = 'other'; break;
        case 'enter-serial': state.world.enterSerial = (state.world.enterSerial || 0) + 1; break;
        case 'entities': state.entities = new Map(state.entities); break;
        case 'row': state.sites.anvilOrchard = structuredClone(state.sites.anvilOrchard); break;
        case 'rewind': state.simTime = 9; break;
      }
      assert.equal(blocks(h), false);
      if (boundary === 'collector-alias-id') {
        h.worker.id = 1; state.entities.delete(3);
        assert.equal(blocks(h), false, 'the stale hold was discarded, not merely bypassed');
      }
      assert.deepEqual(h.pod.data, before);
      assert.equal(state.player.cargo.items.cmdty_gas_hydrogen || 0, 0);
    } finally { h.close(); }
  });
}

test('protected sidecars are absent from saves, no-context calls and copied data; clear is inert', async () => {
  const h = await released();
  try {
    const data = h.pod.data, before = structuredClone(data);
    setPickupAcceptanceRetry(data, h.worker.id, 1, h.context);
    assert.equal(blocks(h), true);
    const envelope = JSON.parse(JSON.stringify(h.sim.registry.get('save').serialize('protected-retry')));
    assert.equal(JSON.stringify(envelope).includes('pickupAcceptanceRetryAt'), false);
    assert.equal(pickupAcceptanceRetryBlocks(structuredClone(data), h.worker.id, h.worker.id, 0, h.context), false);
    assert.equal(pickupAcceptanceRetryBlocks(data, h.worker.id, h.worker.id, 0), false);
    setPickupAcceptanceRetry(data, h.worker.id, 1);
    assert.equal(blocks(h), false);
    setPickupAcceptanceRetry(data, h.worker.id, 1, h.context);
    clearPickupAcceptanceRetry(data); assert.equal(blocks(h), false);
    assert.deepEqual(data, before);
    assert.ok(h.owner.readOrchardPodReady(h.pod, h.sim.state));
    setPickupAcceptanceRetry(data, h.worker.id, 1, h.context);
    assert.equal(blocks(h), true);
    delete envelope.checksum;
    assert.equal(h.sim.registry.get('save').loadEnvelope(envelope), true);
    assert.equal(blocks(h), false);
  } finally { h.close(); }
});

test('ordinary no-context and legacy saved holds retain their existing semantics', () => {
  const data = {amount: 4};
  setPickupAcceptanceRetry(data, 7, 3);
  assert.deepEqual(data, {amount: 4, pickupAcceptanceRetryAt: 3, pickupAcceptanceRetryCollectorId: 7});
  assert.equal(pickupAcceptanceRetryBlocks(data, 7, 7, 2), true);
  assert.equal(pickupAcceptanceRetryBlocks(data, 8, 7, 2), false);
  delete data.pickupAcceptanceRetryCollectorId;
  assert.equal(pickupAcceptanceRetryBlocks(data, 7, 7, 2), true);
  assert.equal(pickupAcceptanceRetryBlocks(data, 8, 7, 2), false);
  assert.equal(pickupAcceptanceRetryBlocks(data, 7, 7, 3), false);
  assert.deepEqual(data, {amount: 4});
});


test('protected collector-specific holds allow a distinct collector without resetting the first deadline', () => {
  const data = Object.freeze({orchardId: 'anvil_storm_orchard', orchardKind: 'pod', amount: 4});
  const pickup = {id: 2, alive: true, data}, collector = {id: 1, alive: true}, other = {id: 3, alive: true};
  const state = {simTime: 0, entities: new Map([[1, collector], [2, pickup], [3, other]])};
  const context = {state, pickup, collector};
  setPickupAcceptanceRetry(data, 1, 0.75, context);
  assert.equal(pickupAcceptanceRetryBlocks(data, 3, 1, 0.25, {...context, collector: other}), false);
  assert.equal(pickupAcceptanceRetryBlocks(data, 1, 1, 0.5, context), true);
  assert.equal(pickupAcceptanceRetryBlocks(data, 1, 1, 0.75, context), false);
  setPickupAcceptanceRetry(data, 1, 1, context);
  setPickupAcceptanceRetry(data, 1, NaN, context);
  assert.equal(pickupAcceptanceRetryBlocks(data, 1, 1, 0, context), false);
  clearPickupAcceptanceRetry(data);
  assert.deepEqual(Object.keys(data), ['orchardId', 'orchardKind', 'amount']);
});
