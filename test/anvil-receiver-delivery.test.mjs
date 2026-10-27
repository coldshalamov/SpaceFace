import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { cargo } from '../src/systems/cargo.js';
import { mining } from '../src/systems/mining.js';
import { economy } from '../src/systems/economy.js';
import { traffic } from '../src/systems/traffic.js';
import { world } from '../src/systems/world.js';
import { save } from '../src/save/saveSystem.js';
import { ANVIL_WORK, anvilWorkerRecordId, anvilBuyerApproach, anvilBuyerIngress, anvilServicePoint, anvilReceiverWorkStatus, anvilTrafficYield } from '../src/systems/anvilWork.js';
import { PLANET_SITE } from '../src/data/planets.js';
import { livingWorkStatusText, createContactHailResponse } from '../src/data/contactHail.js';

const commodityId = PLANET_SITE.harvest.commodityShallow;
const stationId = ANVIL_WORK.buyerId;
function boot(extraSystems = []) {
  const sim = createSimulation({ seed: 47, systems: [{ ...world, update() {} }, { ...traffic, update() {} }, economy, ...extraSystems] });
  const state = sim.state; state.mode = 'flight'; state.world.currentSectorId = PLANET_SITE.sectorId;
  const owner = sim.registry.get('traffic'), econ = sim.registry.get('economy');
  owner.ensureAnvilWorker(state, sim.spawn, { x: 14000, z: 6000 });
  const receiver = state.entityList.find(e => e.data?.worldRecordId === anvilWorkerRecordId(state, 'receiver'));
  const collector = state.entityList.find(e => e.data?.worldRecordId === anvilWorkerRecordId(state, 'collector'));
  const station = sim.spawn({ type: 'station', hull: 1000, radius: 120, pos: { x: 13000, z: 9500 }, data: { stationId, collisionProxy: 'skin:place_station_trade_hub', dockRadius: 90 } });
  econ.ensureMarket(stationId);
  return { sim, state, owner, econ, receiver, collector, station };
}
function load(t, qty = 7) {
  t.owner._setTrafficManifest(t.receiver, t.state.traffic.freighters.find(r => r.id === t.receiver.id),
    t.owner._buildMinerManifest(t.receiver, 0, commodityId, qty));
  t.receiver.data.itinerary.phase = 'delivery';
  t.receiver.pos = anvilBuyerApproach(t.receiver, t.station); t.receiver.vel = { x: 0, z: 0 };
}
function stock(t) { return t.state.economy.markets[stationId][commodityId].stock; }

test('buyer receives exactly the finite hold before observers; no player reward or invented replacement cargo', () => {
  const t = boot(); try {
    load(t); const before = stock(t), wallet = t.state.player.credits;
    let events = 0;
    t.sim.bus.on('economy:freightAccepted', p => {
      if (p.source !== 'anvil_work') return;
      events++; assert.equal(p.qty, 7);
      assert.equal(t.receiver.data.cargoManifest.totalQty, 0);
      assert.equal(t.receiver.data.itinerary.phase, 'return_berth');
      assert.equal(t.owner._deliverAnvilReceiver(t.receiver, t.station), false);
    });
    assert.equal(t.owner._deliverAnvilReceiver(t.receiver, t.station), true);
    assert.equal(stock(t), before + 7); assert.equal(events, 1);
    assert.equal(t.state.player.credits, wallet);
    assert.equal(t.receiver.data.itinerary.deliveredQty, 7);
    assert.equal(t.state.world.records.byId[t.receiver.data.worldRecordId].cargoManifest.totalQty, 0);
    assert.equal(t.owner._deliverAnvilReceiver(t.receiver, t.station), false);
    assert.equal(stock(t), before + 7);
  } finally { t.sim.dispose(); }
});

for (const cause of ['far', 'speed', 'foreign-job', 'dead', 'duplicate', 'missing-market', 'wrong-station', 'bad-hold', 'nan-position', 'infinite-velocity', 'nan-station-position', 'infinite-station-velocity'])
  test(`receiver refuses ${cause} without losing cargo or changing stock`, () => {
    const t = boot(); try {
      load(t); const before = stock(t);
      if (cause === 'far') t.receiver.pos.x += 200;
      if (cause === 'nan-position') t.receiver.pos.x = NaN;
      if (cause === 'infinite-velocity') t.receiver.vel.x = Infinity;
      if (cause === 'nan-station-position') t.station.pos.z = NaN;
      if (cause === 'infinite-station-velocity') t.station.vel.z = Infinity;
      if (cause === 'speed') t.receiver.vel.x = 20;
      if (cause === 'foreign-job') t.receiver.data.jobId = 'job:foreign';
      if (cause === 'dead') t.receiver.alive = false;
      if (cause === 'duplicate') t.sim.spawn({ type: 'ship', hull: 100, data: { ...t.receiver.data } });
      if (cause === 'missing-market') delete t.state.economy.markets[stationId][commodityId];
      if (cause === 'wrong-station') t.station.data.stationId = 'station_customs';
      if (cause === 'bad-hold') t.receiver.data.cargoManifest.lines[0].qty = 1;
      assert.equal(t.owner._deliverAnvilReceiver(t.receiver, t.station), false);
      assert.equal(t.receiver.data.cargoManifest.totalQty, 7);
      if (cause !== 'missing-market') assert.equal(stock(t), before);
    } finally { t.sim.dispose(); }
  });

for (const cause of ['reject', 'throw', 'mismatch', 'replace-hold', 'nan-at-commit', 'station-type-at-commit', 'station-size-at-commit'])
  test(`failed ${cause} custody acknowledgement preserves finite cargo`, () => {
    const t = boot(); try {
      load(t); const source = t.receiver.data.cargoManifest;
      t.econ.applyFreightDelivery = p => {
        if (cause === 'reject') return { ok: false };
        if (cause === 'throw') throw new Error('intake unavailable');
        if (cause === 'replace-hold') t.receiver.data.cargoManifest = structuredClone(source);
        if (cause === 'nan-at-commit') t.receiver.pos.x = NaN;
        if (cause === 'station-type-at-commit') t.station.type = 'ship';
        if (cause === 'station-size-at-commit') t.station.data.dockRadius += 20;
        return p.commitCustody({ ok: true, ...p, acceptedLines: [{ commodityId, qty: cause === 'mismatch' ? 6 : 7 }] });
      };
      assert.equal(t.owner._deliverAnvilReceiver(t.receiver, t.station), false);
      assert.equal(t.receiver.data.cargoManifest.totalQty, 7);
      assert.equal(t.receiver.data.itinerary.phase, 'delivery');
    } finally { t.sim.dispose(); }
  });

test('existing freight journal reserves callback reentry and retries only an uncommitted intake', () => {
  const t = boot(); try {
    const p = { receiptId: 'anvil-test', stationId, commodityId, qty: 7, source: 'anvil_work' };
    const before = stock(t); let calls = 0, events = 0;
    t.sim.bus.on('economy:freightAccepted', () => events++);
    const callback = result => {
      calls++; assert.equal(result.acceptedLines[0].qty, 7);
      assert.equal(t.econ.applyFreightDelivery(p).reason, 'freight_custody_pending');
      assert.equal(t.econ.applyFreightDelivery({ ...p, commitCustody: () => true }).reason, 'freight_custody_pending');
      return true;
    };
    assert.equal(t.econ.applyFreightDelivery({ ...p, commitCustody: () => false }).ok, false);
    assert.throws(() => t.econ.applyFreightDelivery({ ...p, commitCustody: () => { throw new Error('refusal'); } }), /refusal/);
    assert.equal(stock(t), before); assert.equal(events, 0);
    assert.equal(t.econ.applyFreightDelivery({ ...p, commitCustody: callback }).ok, true);
    assert.equal(t.econ.applyFreightDelivery({ ...p, commitCustody: callback }).duplicate, true);
    assert.equal(calls, 1, 'matching retry cannot debit custody twice');
    assert.equal(stock(t), before + 7);
    assert.equal(t.econ.applyFreightDelivery({ ...p, qty: 8 }).reason, 'receipt_conflict');
  } finally { t.sim.dispose(); }
});

test('original collector waits at home while loaded receiver is away and resumes after physical return', () => {
  const t = boot(); try {
    load(t); assert.equal(t.owner._deliverAnvilReceiver(t.receiver, t.station), true);
    t.collector.data.itinerary.phase = 'berthed';
    const source = structuredClone(t.collector.data.cargoManifest);
    t.owner._stepAnvilWork(1 / 60, t.state);
    assert.equal(t.collector.data.itinerary.phase, 'berthed');
    assert.ok(t.collector.data.intent.moveZ >= 0 && t.collector.data.intent.moveZ <= 1);
    assert.deepEqual(t.collector.data.cargoManifest, source);
    assert.match(livingWorkStatusText(t.collector, { state: t.state }), /TENDER AWAY/);
    assert.match(anvilReceiverWorkStatus(t.state, t.receiver), /RETURNING/);
    t.receiver.pos = anvilBuyerIngress(t.receiver, t.station); t.receiver.vel = { x: 0, z: 0 };
    t.owner._stepAnvilReceiver(t.receiver); assert.equal(t.receiver.data.itinerary.buyerExitRequired, false);
    t.receiver.pos = { x: 16800, z: 6000 }; t.receiver.vel = { x: 0, z: 0 };
    t.collector.pos = anvilServicePoint(t.receiver); t.collector.vel = { x: 0, z: 0 };
    t.owner._stepAnvilWork(1 / 60, t.state);
    assert.equal(t.receiver.data.itinerary.phase, 'receiving');
    assert.equal(t.collector.data.itinerary.phase, 'outbound');
    t.receiver.data.jobId = 'job:tow'; t.collector.data.itinerary.phase = 'berthed';
    t.owner._stepAnvilWork(1 / 60, t.state);
    assert.equal(t.collector.data.itinerary.phase, 'berthed');
  } finally { t.sim.dispose(); }
});

for (const failure of ['setter-before', 'setter-after', 'persistence']) test(`custody is coherent when ${failure} throws`, () => {
  const t = boot(); try {
    load(t); const before = stock(t), original = t.owner._setTrafficManifest;
    if (failure.startsWith('setter')) t.owner._setTrafficManifest = function(...args) {
      if (failure === 'setter-after') original.apply(this, args);
      throw new Error('injected setter failure');
    };
    else t.sim.registry.get('world').upsertWorldRecord = () => { throw new Error('record temporarily unavailable'); };
    const accepted = t.owner._deliverAnvilReceiver(t.receiver, t.station);
    assert.equal(accepted, failure === 'persistence');
    assert.equal(stock(t), before + (accepted ? 7 : 0));
    assert.equal(t.receiver.data.cargoManifest.totalQty, accepted ? 0 : 7);
    assert.equal(t.state.traffic.freighters.find(r => r.id === t.receiver.id).manifest.totalQty, accepted ? 0 : 7);
    assert.equal(t.receiver.data.itinerary.phase, accepted ? 'return_berth' : 'delivery');
    assert.equal(t.receiver.data.itinerary.sequence, accepted ? 1 : 0);
  } finally { t.sim.dispose(); }
});

for (const phase of ['delivery', 'return_berth']) test(`retained ${phase} tender keeps collector at its original berth`, () => {
  const t = boot(); try {
    t.receiver.data.itinerary.phase = phase;
    t.receiver.pos = { x: 13000, z: 9300 };
    t.sim.registry.get('world').upsertWorldRecord(t.receiver);
    t.state.entities.delete(t.receiver.id);
    t.state.entityList.splice(t.state.entityList.indexOf(t.receiver), 1);
    t.collector.data.itinerary.phase = 'berthed';
    t.owner._stepAnvilWork(1 / 60, t.state);
    assert.equal(t.collector.data.itinerary.phase, 'berthed');
    assert.ok(t.collector.data.intent.moveZ >= 0 && t.collector.data.intent.moveZ <= 1);
    assert.match(livingWorkStatusText(t.collector, { state: t.state }), /TENDER AWAY/);
    t.collector.data.itinerary.phase = 'return';
    t.collector.pos = { x: 16700, z: 6000 }; t.collector.rot = 0;
    t.owner._stepAnvilWork(1 / 60, t.state);
    assert.equal(t.collector.data.intent.aimAngle, 0, 'return aims at original berth, not retained buyer position');
  } finally { t.sim.dispose(); }
});

test('primed actor index cannot authorize an in-place impostor identity', () => {
  const t = boot(); try {
    load(t); assert.ok(anvilReceiverWorkStatus(t.state, t.receiver));
    t.receiver.data.worldRecordId = 'foreign-record';
    const before = stock(t);
    assert.equal(t.owner._deliverAnvilReceiver(t.receiver, t.station), false);
    assert.equal(t.receiver.data.cargoManifest.totalQty, 7); assert.equal(stock(t), before);
  } finally { t.sim.dispose(); }
});

test('save in accepted observer sees debited hold, persisted receipt and accepted stock together', () => {
  const t = boot(); try {
    load(t); const before = stock(t); let captured;
    t.sim.bus.on('economy:freightAccepted', p => {
      if (p.source !== 'anvil_work') return;
      captured = { economy: JSON.parse(JSON.stringify(t.econ.serialize())),
        world: JSON.parse(JSON.stringify(t.sim.registry.get('world').serialize())),
        manifest: structuredClone(t.receiver.data.cargoManifest),
        route: structuredClone(t.receiver.data.itinerary), stock: stock(t) };
    });
    assert.equal(t.owner._deliverAnvilReceiver(t.receiver, t.station), true);
    assert.equal(captured.manifest.totalQty, 0);
    const savedReceiver = captured.world.records.byId[t.receiver.data.worldRecordId];
    assert.equal(savedReceiver.cargoManifest.totalQty, 0);
    assert.equal(savedReceiver.itinerary.phase, 'return_berth');
    assert.equal(captured.route.phase, 'return_berth'); assert.equal(captured.stock, before + 7);
    t.econ.deserialize(captured.economy);
    let called = false;
    const result = t.econ.applyFreightDelivery({ receiptId: `anvil-delivery:${t.receiver.data.worldRecordId}:0`,
      stationId, commodityId, qty: 7, source: 'anvil_work', commitCustody: () => { called = true; return true; } });
    assert.equal(result.duplicate, true); assert.equal(called, false);
    assert.equal(stock(t), before + 7);
  } finally { t.sim.dispose(); }
});

test('buyer orbit only starts after physical ingress settling and retains the finite hold', () => {
  const t = boot(); try {
    load(t); const r = t.receiver, ingress = anvilBuyerIngress(r, t.station);
    r.pos = { ...ingress }; r.vel = { x: 9, z: 0 };
    t.owner._stepAnvilReceiver(r); assert.notEqual(r.data.itinerary.buyerIngressReached, true);
    r.pos.x += 100; r.vel.x = 0;
    t.owner._stepAnvilReceiver(r); assert.notEqual(r.data.itinerary.buyerIngressReached, true);
    r.pos = { ...ingress };
    t.owner._stepAnvilReceiver(r); assert.equal(r.data.itinerary.buyerIngressReached, true);
    assert.equal(r.data.itinerary.phase, 'delivery'); assert.equal(r.data.cargoManifest.totalQty, 7);
  } finally { t.sim.dispose(); }
});

test('derived price refresh failure cannot resurrect accepted cargo or double stock on retry', () => {
  const t = boot(); try {
    load(t); const before = stock(t);
    t.econ.recomputeLivePrices = () => { throw new Error('derived refresh unavailable'); };
    assert.equal(t.owner._deliverAnvilReceiver(t.receiver, t.station), true);
    assert.equal(t.receiver.data.cargoManifest.totalQty, 0);
    assert.equal(stock(t), before + 7);
    const retry = t.econ.applyFreightDelivery({ receiptId: `anvil-delivery:${t.receiver.data.worldRecordId}:0`,
      stationId, commodityId, qty: 7, source: 'anvil_work',
      commitCustody: () => { throw new Error('must not debit twice'); } });
    assert.equal(retry.duplicate, true); assert.equal(stock(t), before + 7);
  } finally { t.sim.dispose(); }
});

test('outward flight can oppose an accepted field without capping force at the cruise-speed fraction', async () => {
  const { resolvePropulsionProfile } = await import('../src/core/flight/propulsionCatalog.js');
  const t = boot(); try {
    const c = t.collector; c.data.itinerary.phase = 'clear_band';
    c.pos = { x: 14980, z: 6000 }; c.rot = 0; c.vel = { x: 1, z: 0 };
    const registry = t.owner._registry;
    t.owner._registry = { get: id => id === 'fields'
      ? { readAcceptedFieldAcceleration: () => ({ ax: -20, az: 0 }) } : registry.get(id) };
    t.owner._stepAnvilWork(1 / 60, t.state);
    const profile = resolvePropulsionProfile(c, t.state);
    assert.equal(c.data.intent.brake, false);
    assert.ok(c.data.intent.moveZ > ANVIL_WORK.speed / profile.combatSpeed,
      'accepted opposing field requires additional ordinary thrust, not speed-fraction clipping');
    assert.ok(c.data.intent.moveZ <= 1);
    c.vel.x = ANVIL_WORK.speed + 4;
    t.owner._stepAnvilWork(1 / 60, t.state);
    assert.equal(c.data.intent.brake, true, 'same authored speed still governs braking');
  } finally { t.sim.dispose(); }
});

import { anvilReceiverFixture, receiverContactDepth, relocateAnvilObserver, assertNoObserverContact, readAnvilWorker } from './fixtures/anvil-receiver-native.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { wholeShipVisualForEntity } from '../src/render/partsLibrary.js';

test('native contact evidence rejects an unowned non-sensor collider', () => {
  const receiver = { id: 1 }, rec = { colliders: [{}] };
  const physics = { _sg02: { records: new Map([[1, rec]]), _colliderOwners: new Map(),
    world: { contactPairsWith(collider, callback) { callback({ handle: 99, isSensor: () => false }); } } } };
  assert.throws(() => receiverContactDepth(physics, receiver), /unknown native contact owner/);
});

// Diagnostic service-level budgets, not production guarantees under weather/thermal admission.
// Loaded return includes conservative33s radial +126s arc +50s20-speed service chord
// +31s braking/settlement allowance. The earlier180s diagnostic failed and is preserved.
// These clocks belong to the observation run and never reset on phase reentry or save/load.
const RECEIVER_ROUTE_BUDGET = Object.freeze({ global: 1200, secondCollection: 240, loadedReturn: 240 });
function observeReceiverRoute(clock, sample) {
  if (sample.secondCycle && sample.phase === 'collect') clock.collectAt ??= sample.time;
  if (sample.secondCycle && sample.phase === 'clear_band' && sample.collectorQty > 0) clock.loadedAt ??= sample.time;
  const collectionElapsed = clock.collectAt == null ? null : (clock.loadedAt ?? sample.time) - clock.collectAt;
  const loadedReturnElapsed = clock.loadedAt == null ? null : sample.time - clock.loadedAt;
  const failure = sample.time > RECEIVER_ROUTE_BUDGET.global ? 'global route budget'
    : collectionElapsed > RECEIVER_ROUTE_BUDGET.secondCollection ? 'second collection budget'
    : loadedReturnElapsed > RECEIVER_ROUTE_BUDGET.loadedReturn ? 'loaded return budget' : null;
  return { ...clock, collectionElapsed, loadedReturnElapsed, failure };
}
function actualRepeatHandoff(sample) {
  return sample.secondCycle && sample.collectorAlive === true && sample.receiverAlive === true
    && sample.collectorRecordId === sample.originalCollectorRecordId
    && sample.receiverRecordId === sample.originalReceiverRecordId
    && sample.receiverQty > 0 && sample.actualTransferQty > 0;
}

test('receiver route diagnostic clocks latch and fail each bounded stage without resetting', () => {
  const clock = {}, sample = { time: 500, secondCycle: true, phase: 'collect', collectorQty: 0 };
  assert.equal(observeReceiverRoute(clock, sample).failure, null);
  assert.equal(observeReceiverRoute(clock, { ...sample, time: 740 }).failure, null);
  assert.equal(observeReceiverRoute(clock, { ...sample, time: 740.001, phase: 'outbound' }).failure, 'second collection budget');
  assert.equal(observeReceiverRoute(clock, { ...sample, time: 742 }).collectAt, 500, 'reentry cannot restart collection');
  const loaded = {};
  observeReceiverRoute(loaded, sample);
  observeReceiverRoute(loaded, { ...sample, time: 700, phase: 'clear_band', collectorQty: 12 });
  assert.equal(observeReceiverRoute(loaded, { ...sample, time: 940, phase: 'return' }).failure, null);
  assert.equal(observeReceiverRoute(loaded, { ...sample, time: 940.001, phase: 'clear_band', collectorQty: 12 }).failure, 'loaded return budget');
  assert.equal(loaded.loadedAt, 700, 'clear-band reentry cannot restart loaded return');
  assert.equal(observeReceiverRoute({}, { ...sample, time: 1201, phase: 'berthed' }).failure, 'global route budget');
  const empty = {};
  observeReceiverRoute(empty, { ...sample, phase: 'clear_band' });
  assert.equal(empty.loadedAt, undefined, 'zero cargo cannot start loaded-return proof');
});

test('receiver repeat handoff rejects phantom cargo, dead participants and replacement identity', () => {
  const sample = { secondCycle: true, collectorAlive: true, receiverAlive: true,
    collectorRecordId: 'collector', originalCollectorRecordId: 'collector',
    receiverRecordId: 'receiver', originalReceiverRecordId: 'receiver', receiverQty: 12, actualTransferQty: 12 };
  assert.equal(actualRepeatHandoff(sample), true);
  for (const change of [{ secondCycle: false }, { receiverQty: 0 }, { actualTransferQty: 0 },
    { collectorAlive: false }, { receiverAlive: false }, { collectorRecordId: 'replacement' },
    { receiverRecordId: 'replacement' }]) assert.equal(actualRepeatHandoff({ ...sample, ...change }), false);
});

test('ordinary observer follows the original current far carrier instead of its stale exact snapshot', () => {
  const state = { meta: { seed: 47 }, world: { records: { byId: {} }, farActors: { rows: [] } } };
  const id = anvilWorkerRecordId(state, 'collector');
  const stale = { recordId: id, pos: { x: 17245, z: 6175 } };
  const current = { id: 142, alive: true, pos: { x: 15392, z: 3749 }, data: { worldRecordId: id } };
  state.world.records.byId[id] = stale; state.world.farActors.rows.push(current);
  const f = { state, actor: () => null };
  assert.equal(readAnvilWorker(f, 'collector'), current);
  state.world.farActors.rows.push({ ...current, id: 143 });
  assert.throws(() => readAnvilWorker(f, 'collector'), /ambiguous far carriers/);
  state.world.farActors.rows.length = 0;
  assert.equal(readAnvilWorker(f, 'collector'), stale, 'record-only fallback remains available');
});

test('full production native receiver delivers the finite load through Continue and returns to the original collector', async () => {
  // An externally supplied envelope is a previously observed native route checkpoint,
  // never a hand-edited save. CI starts the ordinary work route and saves it itself.
  const envelope = process.env.ANVIL_RECEIVER_CONTINUE_ENVELOPE
    ? JSON.parse(readFileSync(process.env.ANVIL_RECEIVER_CONTINUE_ENVELOPE, 'utf8')) : null;
  const f = await anvilReceiverFixture({ envelope });
  try {
    const receipts = [], phases = [], frames = [], collectorFrames = [], dynamicContacts = [], spills = [], transfers = [];
    const previousParticipant = new Map();
    const participantIds = new Set(), lifecycle = [], nativeBeforeSteps = [];
    let continued = !!envelope, previous = '', minContact = Infinity, nativeTicks = 0;
    let departed = !!envelope, arrived = false, returned = false, handedAgain = false;
    let residencyChecked = false, laybyReached = false, minStaticContact = Infinity;
    const read = role => readAnvilWorker(f, role);
    const route = e => e.data?.itinerary || e.itinerary;
    const hold = e => e.data?.cargoManifest || e.cargoManifest;
    const atStart = read('receiver'); assert.ok(atStart);
    for (const name of ['entity:killed', 'entity:destroyed', 'entity:removed']) {
      f.runtime.bus.on(name, payload => {
        if (!participantIds.has(payload?.id)) return;
        lifecycle.push({ name, time: f.state.simTime, tick: f.state.tick,
          payload: structuredClone(payload), participants: ['collector', 'receiver'].map(role => ({ role,
            live: structuredClone(f.actor(role)), retained: structuredClone(f.state.world.records.byId[anvilWorkerRecordId(f.state, role)]),
            matchingEntities: structuredClone(f.state.entityList.filter(e => e.data?.worldRecordId === anvilWorkerRecordId(f.state, role))),
          })) });
      });
    }
    const initialDelivered = route(atStart).deliveredQty;
    let acquiredQty = hold(atStart).totalQty;
    f.runtime.bus.on('traffic:anvilTransfer', p => {
      if (p.receiverId !== f.actor('receiver')?.id) return;
      acquiredQty += p.qty; transfers.push(structuredClone(p));
    });
    f.runtime.bus.on('freight:cargoSpilled', p => {
      if (p.carrierId !== f.actor('receiver')?.id) return;
      const pods = p.podIds.map(id => structuredClone(f.state.entities.get(id)));
      assert.equal(pods.reduce((sum, pod) => sum + pod.data.amount, 0), p.qty);
      assert.ok(pods.every(pod => pod.data.manifestId === p.manifestId
        && pod.data.spillCause === p.cause && pod.data.destinationId === stationId
        && pod.data.ownerRecordId === anvilWorkerRecordId(f.state, 'receiver')
        && pod.data.ownerName === 'Stormshift Receiving Tender'));
      assert.equal(p.ownerName, 'Stormshift Receiving Tender');
      spills.push({ event: structuredClone(p), pods });
    });
    f.runtime.bus.on('economy:freightAccepted', p => {
      if (p.source !== 'anvil_work') return;
      receipts.push(structuredClone(p));
      const receiver = f.actor('receiver');
      assert.equal(hold(receiver).totalQty, 0, 'accepted observer sees finite custody already debited');
      assert.equal(route(receiver).phase, 'return_berth');
      assert.equal(route(receiver).interruption, null, 'accepted return cannot be an empty-load abort');
      assert.equal(route(receiver).deliveredQty, initialDelivered + receipts.reduce((sum, row) => sum + row.qty, 0));
      assert.equal(p.receiptId, `anvil-delivery:${receiver.data.worldRecordId}:${route(receiver).sequence - 1}`);
      if (process.env.ANVIL_RECEIVER_EVIDENCE_DIR) writeFileSync(
        process.env.ANVIL_RECEIVER_EVIDENCE_DIR + '/accepted-return-save.json',
        JSON.stringify(f.runtime.getSystem('save').serialize('actual-accepted-receiver-return')));
      arrived = true;
    });
    const routeDeadline = RECEIVER_ROUTE_BUDGET.global;
    const routeClock = {};
    let timing = null, repeatTransferQty = 0;
    const originalCollectorRecordId = anvilWorkerRecordId(f.state, 'collector');
    const originalReceiverRecordId = anvilWorkerRecordId(f.state, 'receiver');
    f.runtime.bus.on('traffic:anvilTransfer', p => {
      if (returned && p.sourceId === f.actor('collector')?.id && p.receiverId === f.actor('receiver')?.id
        && p.qty > 0) repeatTransferQty += p.qty;
    });
    for (let i = 0; f.state.simTime + 1 / 60 <= routeDeadline; i++) {
      let c = read('collector'), r = read('receiver'); assert.ok(c && r);
      const watched = route(r).phase === 'receiving' ? c : r;
      // Observation-only relocation through the ordinary player/world API. Participants,
      // scenery, collisions, forces, threats and residency remain entirely production-owned.
      if (i % 120 === 0) relocateAnvilObserver(f, watched);
      if (!continued && route(r).phase === 'delivery') {
        const save = JSON.parse(JSON.stringify(f.runtime.getSystem('save').serialize('anvil-receiver-outbound')));
        const held = structuredClone(hold(r));
        assert.equal(f.runtime.getSystem('save').loadEnvelope(save), true); f.state.mode = 'flight';
        assert.equal(await f.physics.prepareBackend(f.state), true);
        r = read('receiver'); assert.deepEqual(hold(r), held); continued = true;
        if (process.env.ANVIL_RECEIVER_EVIDENCE_DIR) writeFileSync(
          process.env.ANVIL_RECEIVER_EVIDENCE_DIR + '/fresh-outbound-save.json', JSON.stringify(save));
      }
      if (continued && !residencyChecked && route(r).phase === 'delivery') {
        const held = structuredClone(hold(r)), recordId = anvilWorkerRecordId(f.state, 'receiver');
        f.world.relocatePlayerInSector({ x: r.pos.x + 18000, z: r.pos.z + 18000, heading: 0 },
          { reason: 'anvil-receiver-residency-observation' });
        let farTicks = 0;
        for (; farTicks < 600 && f.state.simTime + 1 / 60 <= routeDeadline; farTicks++) f.step();
        assert.equal(farTicks, 600, 'full ten-second distant residency fits the absolute route deadline');
        assert.equal(f.actor('receiver'), undefined, 'ordinary residency shelves the distant tender');
        const retained = f.state.world.records.byId[recordId];
        assert.deepEqual(hold(retained), held, 'far owner preserves finite cargo, without offscreen delivery');
        assert.equal(route(retained).phase, 'delivery'); assert.equal(receipts.length, 0);
        relocateAnvilObserver(f, retained, 'anvil-receiver-residency-return');
        for (let j = 0; j < 120 && !f.actor('receiver') && f.state.simTime + 1 / 60 <= routeDeadline; j++) f.step();
        assert.ok(f.actor('receiver')); assert.deepEqual(hold(f.actor('receiver')), held);
        residencyChecked = true;
      }
      if (f.state.simTime + 1 / 60 > routeDeadline) break;
      for (const role of ['collector', 'receiver']) {
        const e = f.actor(role); if (e) participantIds.add(e.id);
        if (e) previousParticipant.set(e.data.worldRecordId, {
          tick: f.state.tick, hull: e.hull, cargoQty: hold(e).totalQty, pos: { ...e.pos }, vel: { ...e.vel } });
      }
      const participantsBeforeStep = ['collector', 'receiver'].map(role => f.actor(role)).filter(Boolean);
      if (process.env.ANVIL_RECEIVER_EVIDENCE_DIR) {
        nativeBeforeSteps.push({ tick: f.state.tick, time: f.state.simTime,
          ships: [...f.physics._sg02.records.values()].filter(rec => rec.entity.type === 'ship'
            && participantsBeforeStep.some(e => Math.hypot(rec.entity.pos.x-e.pos.x,rec.entity.pos.z-e.pos.z)<400))
            .map(rec => ({ id: rec.entity.id, pos: { ...rec.entity.pos }, vel: { ...rec.entity.vel },
              nativeVelocity: rec.body.linvel(), rot: rec.entity.rot, hull: rec.entity.hull,
              radius: rec.entity.radius, targetId: rec.entity.data?.ai?.targetId,
              securityTargetId: rec.entity.data?.ai?.securityTargetId })) });
        if (nativeBeforeSteps.length > 180) nativeBeforeSteps.shift();
      }
      const retainedBeforeStep = ['collector', 'receiver'].map(role => {
        const record = f.state.world.records.byId[anvilWorkerRecordId(f.state, role)];
        return { role, alive: record?.alive, outcome: record?.outcome, phase: record?.itinerary?.phase,
          lastSeenTick: record?.lastSeenTick, recordId: record?.recordId, pos: record?.pos && { ...record.pos } };
      });
      f.step(); c = read('collector'); r = read('receiver');
      if ((c?.alive !== true || r?.alive !== true) && process.env.ANVIL_RECEIVER_EVIDENCE_DIR) {
        writeFileSync(process.env.ANVIL_RECEIVER_EVIDENCE_DIR + '/survival-failure.json', JSON.stringify({
          sourceTree: process.env.PUBLIC_TREE || null, time: f.state.simTime, tick: f.state.tick,
          previousParticipant: [...previousParticipant], retainedBeforeStep, lifecycle, nativeBeforeSteps, collector: c, receiver: r,
          // markRecordDestroyed mutates records silently; compare retainedBeforeStep to these actual records.
          nearbyNativeOwners: [...f.physics._sg02.records.values()].filter(rec => participantsBeforeStep.some(e =>
            Math.hypot(rec.entity.pos.x - e.pos.x, rec.entity.pos.z - e.pos.z) < 300))
            .map(rec => ({ entity: rec.entity, dynamic: rec.body.isDynamic(), nativeVelocity: rec.body.linvel() })),
          originalObjects: participantsBeforeStep.map(entity => ({ entity, native: receiverContactDepth(f.physics, entity) })),
        }, null, 2));
      }

      assert.ok(c && r); assert.equal(r.alive, true);
      assert.equal(c.alive, true, `original collector died during ${route(c).phase} at tick ${f.state.tick}`);
      const spentQty = receipts.reduce((sum, p) => sum + p.qty, 0)
        + spills.reduce((sum, row) => sum + row.event.qty, 0);
      assert.equal(hold(r).totalQty + spentQty, acquiredQty,
        `finite custody changed without accepted receipt or actual spill pod at tick ${f.state.tick}`);
      if (i % 1800 === 0) {
        const participants = [c, r].map(e => {
          const body = f.physics._sg02?.records.get(e.id)?.body;
          return { recordId: e.data?.worldRecordId || e.recordId, id: e.id,
            phase: route(e).phase, cargoQty: hold(e).totalQty, hull: e.hull, hullMax: e.hullMax,
            heat: f.state.planet?.ships?.[e.id]?.heat ?? null, live: !!e.data,
            pos: e.pos, vel: e.vel, rot: e.rot, intent: e.data?.intent,
            fieldAcceleration: e.data ? f.runtime.getSystem('fields').readAcceptedFieldAcceleration(e, { ax: 0, az: 0 }) : null,
            nativeForce: body?.userForce?.(), jobId: e.data?.jobId || e.jobId || null };
        });
        console.log('ANVIL_PROGRESS', JSON.stringify({ tick: f.state.tick, time: f.state.simTime, participants }));
      }
      const phase = route(c).phase + ':' + route(r).phase + (route(r).buyerIngressReached ? ':ingress-settled' : '');
      if (phase !== previous) {
        phases.push({ tick: f.state.tick, time: f.state.simTime, phase,
          collectorQty: hold(c).totalQty, receiverQty: hold(r).totalQty });
        const liveC = f.actor('collector');
        if (liveC) collectorFrames.push({ time: f.state.simTime, phase, collector: structuredClone(liveC) });
        const live = f.actor('receiver');
        const station = f.state.entityList.find(e => e.data?.stationId === stationId);
        if (live) frames.push({ time: f.state.simTime, phase, receiver: { ...structuredClone(live), model: wholeShipVisualForEntity(live, { requiredWholeShip: true }) },
          station: station && structuredClone(station),
          collector: { ...structuredClone(c), phase: route(c).phase, qty: hold(c).totalQty },
          nearby: [...new Set([...f.state.entityList, ...[...f.physics._sg02.records.values()].map(row => row.entity)])].filter(e => e.alive !== false && e !== live
            && Math.hypot(e.pos.x - live.pos.x, e.pos.z - live.pos.z) < 600)
            .map(e => structuredClone(e)) });
        console.log('ANVIL_PHASE', JSON.stringify({ ...phases.at(-1), receiverPos: r.pos, receiverVel: r.vel }));
        if (process.env.ANVIL_RECEIVER_EVIDENCE_DIR) writeFileSync(
          process.env.ANVIL_RECEIVER_EVIDENCE_DIR + '/native-route-progress.json', JSON.stringify({ sourceTree: process.env.PUBLIC_TREE || null, phases, frames, collectorFrames, spills, transfers, observerPlacements: f.observerPlacements }, null, 2));
        previous = phase;
      }
      const liveCollector = f.actor('collector');
      if (liveCollector && route(c).phase === 'berthed' && route(r).phase !== 'receiving') {
        const home = route(c).center;
        laybyReached ||= Math.hypot(c.pos.x - home.x - ANVIL_WORK.berthRadius - 180,
          c.pos.z - home.z - 160) <= 20 && Math.hypot(c.vel.x, c.vel.z) <= ANVIL_WORK.transferSpeed;
      }
      for (const participant of [f.actor('receiver'), liveCollector]) {
        if (!participant) continue;
        const observed = receiverContactDepth(f.physics, participant);
        if (participant === f.actor('receiver') && observed.admitted) nativeTicks++;
        for (const contact of observed.contacts || []) {
          if (contact.targetId === f.state.playerId && (contact.distance < 0 || contact.impulse > 0)
            && process.env.ANVIL_RECEIVER_EVIDENCE_DIR) writeFileSync(
              process.env.ANVIL_RECEIVER_EVIDENCE_DIR + '/observer-contamination.json',
              JSON.stringify({ time: f.state.simTime, participant, contact, observerPlacements: f.observerPlacements }, null, 2));
          assertNoObserverContact(f.state, contact);
          minContact = Math.min(minContact, contact.distance);
          const target = contact.targetEntity;
          assert.ok(target && target.id != null && typeof target.type === 'string'
            && typeof contact.dynamic === 'boolean', 'unknown native contact owner fails classification');
          const originalPair = ['collector', 'receiver'].some(role =>
            target.data?.worldRecordId === anvilWorkerRecordId(f.state, role));
          if (contact.dynamic && !originalPair) {
            // Moving traffic, aftermath and genuinely drifting encounter-terrain hazards
            // are retained, including damage/debris. Anchored-intent terrain becoming
            // dynamic is a separate open baseline issue, not a traffic classification.
            // It is not evidence of collision-free flight or an authored route obstruction.
            dynamicContacts.push({ tick: f.state.tick, participantId: participant.id,
              participantRecordId: participant.data.worldRecordId, participantPos: { ...participant.pos },
              participantVel: { ...participant.vel }, hull: participant.hull,
              before: previousParticipant.get(participant.data.worldRecordId),
              cargoQty: hold(participant).totalQty, targetId: target.id, targetType: target.type,
              targetData: structuredClone(target.data), targetPos: { ...target.pos },
              targetVel: { ...target.vel }, distance: contact.distance, normal: contact.normal,
              impulse: contact.impulse });
          } else {
            minStaticContact = Math.min(minStaticContact, contact.distance);
            if (contact.distance < -0.05 && process.env.ANVIL_RECEIVER_EVIDENCE_DIR) writeFileSync(
              process.env.ANVIL_RECEIVER_EVIDENCE_DIR + '/native-contact-failure.json',
              JSON.stringify({ contact, receiver: participant, target, phases, frames }, null, 2));
            // Failure-only bounded identity/pose receipt. Never serialize whole entities or WASM.
            let pairReceipt = '';
            if (!(contact.distance >= -0.05)) {
              const native = f.physics._sg02;
              const text = value => typeof value === 'string' ? value.slice(0, 160) : value ?? null;
              const vector = value => value ? { x: value.x, y: value.y, z: value.z } : null;
              const describe = entity => {
                const rec = native?.records.get(entity.id);
                return { id: entity.id, type: entity.type,
                  recordId: text(entity.data?.worldRecordId), stationId: text(entity.data?.stationId),
                  role: text(entity.data?.itinerary?.role || entity.data?.trafficRole || entity.role),
                  phase: text(entity.data?.itinerary?.phase), occupantGeneration: entity.occupantGeneration ?? null,
                  pos: vector(entity.pos), vel: vector(entity.vel), rot: entity.rot,
                  proxyKey: text(entity.data?.collisionProxy), nativeProxyId: text(rec?.proxyId),
                  bodyRevision: entity.physicsBody?.revision ?? null, nativeRevision: rec?.revision ?? null,
                  nativeEntityGeneration: rec?.entity?.occupantGeneration ?? null,
                  nativeSameEntity: rec?.entity === entity, bodyHandle: rec?.body?.handle ?? null,
                  colliderCount: rec?.colliders?.length ?? 0,
                  colliderHandles: rec?.colliders?.slice(0, 32).map(collider => collider.handle) || [],
                  nativeDynamic: rec?.spec?.dynamic ?? null,
                  nativePos: rec?.body ? vector(rec.body.translation()) : null,
                  nativeVel: rec?.body ? vector(rec.body.linvel()) : null };
              };
              try { pairReceipt = JSON.stringify({ tick: f.state.tick, simTime: f.state.simTime,
                nativeTick: native?.tick ?? null, nativeFrameOrigin: vector(native?._frameOrigin),
                distance: contact.distance, impulse: contact.impulse, normal: vector(contact.normal),
                dynamic: contact.dynamic, originalPair,
                participant: describe(participant), target: describe(target) });
              } catch (error) { pairReceipt = JSON.stringify({ tick: f.state.tick, participantId: participant.id,
                targetId: target.id, diagnosticError: String(error?.message || error).slice(0, 240) }); }
            }
            assert.ok(contact.distance >= -0.05,
              `authored-static/original-pair penetration ${contact.distance} into ${contact.targetId} at ${f.state.tick}; pair=${pairReceipt}`);
          }
        }
      }
      departed ||= route(r).phase === 'delivery';
      if (arrived && route(r).phase === 'receiving' && route(c).phase === 'outbound') returned = true;
      timing = observeReceiverRoute(routeClock, { time: f.state.simTime, secondCycle: returned,
        phase: route(c).phase, collectorQty: hold(c).totalQty });
      timing.collectorQty = hold(c).totalQty; timing.receiverQty = hold(r).totalQty;
      timing.angleToHome = Math.abs(Math.atan2(c.pos.z - route(c).center.z, c.pos.x - route(c).center.x));
      handedAgain = actualRepeatHandoff({ secondCycle: returned, collectorAlive: c.alive, receiverAlive: r.alive,
        collectorRecordId: c.data?.worldRecordId || c.recordId, originalCollectorRecordId,
        receiverRecordId: r.data?.worldRecordId || r.recordId, originalReceiverRecordId,
        receiverQty: hold(r).totalQty, actualTransferQty: repeatTransferQty });
      if (timing.failure || handedAgain) break;
    }
    const r = read('receiver');
    const evidence = { sourceTree: process.env.PUBLIC_TREE || null, time: f.state.simTime, routeDeadline, timing, routeBudgets: RECEIVER_ROUTE_BUDGET, repeatTransferQty, lifecycle,
      continued, departed, arrived, returned, handedAgain, residencyChecked, laybyReached, nativeTicks,
      minContact: Number.isFinite(minContact) ? minContact : null,
      minStaticContact: Number.isFinite(minStaticContact) ? minStaticContact : null, observerPlacements: f.observerPlacements, dynamicContacts, receipts, spills, transfers, acquiredQty, phases, frames, collectorFrames,
      deliveredDelta: route(r).deliveredQty - initialDelivered };
    if (process.env.ANVIL_RECEIVER_EVIDENCE_DIR) {
      mkdirSync(process.env.ANVIL_RECEIVER_EVIDENCE_DIR, { recursive: true });
      writeFileSync(process.env.ANVIL_RECEIVER_EVIDENCE_DIR + '/native-continue-route.json', JSON.stringify(evidence, null, 2));
    }
    console.log('ANVIL_RECEIVER_NATIVE', JSON.stringify({ ...evidence, frames: frames.length, dynamicContacts: dynamicContacts.length }));
    assert.equal(timing?.failure, null, JSON.stringify(timing));
    assert.ok(continued && departed && arrived && returned && handedAgain && residencyChecked && laybyReached,
      `incomplete physical route at global cap ${routeDeadline}: ${JSON.stringify(timing)}`);
    assert.ok(nativeTicks > 1000); assert.equal(receipts.length, 1);
    assert.equal(evidence.deliveredDelta, receipts[0].qty);
  } finally {
    try {
      if (process.env.ANVIL_RECEIVER_EVIDENCE_DIR) {
        mkdirSync(process.env.ANVIL_RECEIVER_EVIDENCE_DIR, { recursive: true });
        writeFileSync(process.env.ANVIL_RECEIVER_EVIDENCE_DIR + '/terminal-participants.json', JSON.stringify({
          sourceTree: process.env.PUBLIC_TREE || null, time: f.state.simTime, tick: f.state.tick,
          observerPlacements: f.observerPlacements,
          participants: ['collector', 'receiver'].map(role => ({ role,
            live: f.actor(role), retained: f.state.world.records.byId[anvilWorkerRecordId(f.state, role)],
            matchingEntities: f.state.entityList.filter(e => e.data?.worldRecordId === anvilWorkerRecordId(f.state, role)),
          })),
        }, null, 2));
        writeFileSync(process.env.ANVIL_RECEIVER_EVIDENCE_DIR + '/terminal-save.json',
          JSON.stringify(f.runtime.getSystem('save').serialize('actual-native-route-terminal')));
      }
    } finally { f.close(); }
  }
});

test('existing full panic spill retires only the lost trip and physically returns without buyer credit', () => {
  const t = boot(); try {
    load(t, 1); t.receiver.data.itinerary.destinationStationId = stationId;
    const old = structuredClone(t.receiver.data.cargoManifest), before = stock(t);
    let accepted = 0, spilled;
    t.sim.bus.on('economy:freightAccepted', () => accepted++);
    t.sim.bus.on('freight:cargoSpilled', p => spilled = p);
    const pod = t.owner._spillHaulerCargoFromViolence(t.receiver, null, 'panic_jettison');
    assert.ok(pod); assert.equal(spilled.qty, 1); assert.equal(spilled.cause, 'panic_jettison');
    assert.equal(pod.data.manifestId, old.manifestId);
    assert.equal(t.receiver.data.cargoManifest.totalQty, 0);
    const atBuyer = { ...t.receiver.pos };
    t.owner._stepAnvilReceiver(t.receiver);
    assert.deepEqual(t.receiver.pos, atBuyer, 'no pose nudge to home');
    assert.equal(t.receiver.data.itinerary.phase, 'return_berth');
    assert.equal(t.receiver.data.itinerary.sequence, 1);
    t.owner._stepAnvilReceiver(t.receiver);
    assert.equal(t.receiver.data.itinerary.sequence, 1, 'abort generation retires once');
    assert.equal(t.receiver.data.itinerary.deliveredQty, 0);
    assert.equal(stock(t), before); assert.equal(accepted, 0);
    // Focused boundary fixture only: physical arrival is proved by native route test.
    t.receiver.pos = anvilBuyerIngress(t.receiver, t.station); t.receiver.vel = { x: 0, z: 0 };
    t.owner._stepAnvilReceiver(t.receiver); assert.equal(t.receiver.data.itinerary.buyerExitRequired, false);
    t.receiver.pos = { x: 16800, z: 6000 }; t.receiver.vel = { x: 0, z: 0 };
    t.owner._stepAnvilReceiver(t.receiver);
    assert.equal(t.receiver.data.itinerary.phase, 'receiving');
    t.collector.pos = anvilServicePoint(t.receiver); t.collector.vel = { x: 0, z: 0 };
    t.collector.data.itinerary.phase = 'collect';
    assert.equal(t.owner.acceptAnvilHarvest(t.collector, { siteId: PLANET_SITE.id, commodityId, qty: 2 }), 2);
    t.collector.data.itinerary.phase = 'return';
    assert.equal(t.owner._transferAnvilLoad(t.collector, t.receiver), 2);
    assert.notEqual(t.receiver.data.cargoManifest.manifestId, old.manifestId);
    assert.notEqual(t.receiver.data.cargoManifest.lotId, old.lotId);
    assert.equal(t.receiver.data.cargoManifest.totalQty + spilled.qty, 3);
    assert.equal(accepted, 0); assert.equal(stock(t), before);
  } finally { t.sim.dispose(); }
});

test('existing partial violence spill leaves only its finite remainder eligible for buyer credit', () => {
  const t = boot(); try {
    load(t, 8); const before = stock(t);
    let spilled; t.sim.bus.on('freight:cargoSpilled', p => spilled = p);
    assert.ok(t.owner._spillHaulerCargoFromViolence(t.receiver, null, 'combat_damage'));
    assert.equal(spilled.qty, 2); assert.equal(t.receiver.data.cargoManifest.totalQty, 6);
    assert.equal(t.owner._deliverAnvilReceiver(t.receiver, t.station), true);
    assert.equal(stock(t), before + 6); assert.equal(t.receiver.data.itinerary.deliveredQty, 6);
    assert.equal(t.receiver.data.cargoManifest.totalQty, 0);
  } finally { t.sim.dispose(); }
});


test('rematerialized original worker rebinds truthful identity before existing spill publication', () => {
  const t = boot(); try {
    load(t, 1);
    t.receiver.data.name = null; t.receiver.data.trafficLabel = null;
    const rec = t.state.traffic.freighters.find(r => r.id === t.receiver.id);
    rec.worldRecordId = null; rec.targetId = t.station.id;
    t.owner._stepAnvilWork(1 / 60, t.state);
    assert.equal(t.receiver.data.name, 'Stormshift Receiving Tender');
    assert.equal(rec.worldRecordId, t.receiver.data.worldRecordId);
    const pod = t.owner._spillHaulerCargoFromViolence(t.receiver, null, 'panic_jettison');
    assert.equal(pod.data.ownerName, 'Stormshift Receiving Tender');
    assert.equal(pod.data.ownerRecordId, t.receiver.data.worldRecordId);
    assert.equal(pod.data.destinationId, stationId);
  } finally { t.sim.dispose(); }
});


test('collecting the real spilled pod cannot also credit the empty NPC buyer trip', () => {
  const t = boot([cargo, mining]); try {
    load(t, 1); const before = stock(t);
    const player = t.sim.spawn({ type: 'ship', isPlayer: true, hull: 100, pos: { ...t.receiver.pos } });
    t.state.playerId = player.id;
    const pod = t.owner._spillHaulerCargoFromViolence(t.receiver, null, 'panic_jettison');
    assert.ok(pod);
    const beforePlayer = t.state.player.cargo.items[commodityId] || 0;
    const collected = t.sim.registry.get('mining')._collectPickupViaEvent(pod, player);
    assert.equal(collected.accepted, 1); assert.equal(pod.alive, false);
    assert.equal(t.state.player.cargo.items[commodityId], beforePlayer + 1);
    assert.equal(t.owner._deliverAnvilReceiver(t.receiver, t.station), false);
    assert.equal(stock(t), before); assert.equal(t.receiver.data.itinerary.deliveredQty, 0);
    assert.equal(t.receiver.data.cargoManifest.totalQty, 0);
  } finally { t.sim.dispose(); }
});

test('original-worker metadata repair cannot rename an in-place foreign identity', () => {
  const t = boot(); try {
    t.owner._stepAnvilWork(1 / 60, t.state); // prime the stable-id lookup
    t.receiver.data.worldRecordId = 'foreign:replacement';
    t.receiver.data.name = 'Other Crew'; t.receiver.data.trafficLabel = 'Other Work';
    const rec = t.state.traffic.freighters.find(r => r.id === t.receiver.id);
    rec.worldRecordId = 'foreign:replacement';
    t.owner._stepAnvilWork(1 / 60, t.state);
    assert.equal(t.receiver.data.name, 'Other Crew');
    assert.equal(t.receiver.data.trafficLabel, 'Other Work');
    assert.equal(rec.worldRecordId, 'foreign:replacement');
  } finally { t.sim.dispose(); }
});


test('collector works clockwise through the open band and retains original radial/outer-arc return', () => {
  const t = boot(); try {
    const c = t.collector, center = c.data.itinerary.center;
    c.data.itinerary.phase = 'collect';
    c.pos = { x: center.x + ANVIL_WORK.radius, z: center.z };
    c.vel = { x: 0, z: 0 }; c.rot = -Math.PI / 2;
    const pos = { ...c.pos }, vel = { ...c.vel };
    t.owner._stepAnvilWork(1 / 60, t.state);
    const target = { x: center.x + Math.cos(-0.22) * ANVIL_WORK.radius,
      z: center.z + Math.sin(-0.22) * ANVIL_WORK.radius };
    assert.equal(c.data.intent.aimAngle, Math.atan2(target.z - pos.z, target.x - pos.x));
    assert.deepEqual(c.pos, pos); assert.deepEqual(c.vel, vel);
    c.data.itinerary.phase = 'clear_band';
    c.pos = { x: center.x - 900, z: center.z }; c.rot = Math.PI;
    t.owner._stepAnvilWork(1 / 60, t.state);
    assert.equal(Math.abs(c.data.intent.aimAngle), Math.PI, 'other-limb interruption clears outward first');
    c.pos = { x: center.x - ANVIL_WORK.berthRadius, z: center.z };
    t.owner._stepAnvilWork(1 / 60, t.state);
    assert.equal(c.data.itinerary.phase, 'return');
    t.owner._stepAnvilWork(1 / 60, t.state);
    assert.ok(Math.abs(c.data.intent.aimAngle) > 1, 'outer opposite limb follows arc, not chord across core');
  } finally { t.sim.dispose(); }
});

for (const loadQty of [0, 2]) test(`inner service corridor admits ${loadQty}u return only after physical inner-side settlement`, () => {
  const t = boot(); try {
    if (loadQty) { t.collector.data.itinerary.phase = 'collect'; t.owner.acceptAnvilHarvest(t.collector, {siteId: PLANET_SITE.id, commodityId, qty: loadQty}); }
    t.collector.data.itinerary.phase = 'return';
    t.collector.pos = {x: t.receiver.pos.x + 58, z: t.receiver.pos.z - 15};
    t.collector.vel = {x: 0, z: 0};
    t.owner._stepAnvilWork(1/60, t.state);
    assert.equal(t.collector.data.itinerary.phase, 'return');
    assert.equal(t.receiver.data.cargoManifest.totalQty, 0);
    assert.equal(t.owner._transferAnvilLoad(t.collector, t.receiver), 0);
    assert.ok(Math.abs(Math.sin(t.collector.data.intent.aimAngle)) > .95, 'outer arrival clears laterally, not through tender');
    t.collector.pos = anvilServicePoint(t.receiver);
    t.owner._stepAnvilWork(1/60, t.state);
    assert.equal(t.collector.data.itinerary.phase, 'berthed');
    assert.equal(t.receiver.data.cargoManifest.totalQty, loadQty);
  } finally {t.sim.dispose();}
});
for (const bad of ['nan-position','infinite-velocity']) test(`service custody and departure reject ${bad}`, () => {
  const t = boot(); try {
    t.collector.data.itinerary.phase = 'collect'; t.owner.acceptAnvilHarvest(t.collector, {siteId: PLANET_SITE.id,commodityId,qty:1});
    t.collector.pos = anvilServicePoint(t.receiver); t.collector.vel = {x:0,z:0};
    if (bad==='nan-position') t.collector.pos.x = NaN; else t.collector.vel.x = Infinity;
    t.collector.data.itinerary.phase = 'return';
    assert.equal(t.owner._transferAnvilLoad(t.collector,t.receiver),0);
    t.owner._stepAnvilWork(1/60,t.state); assert.equal(t.collector.data.itinerary.phase,'return');
    t.collector.data.itinerary.phase='berthed'; t.owner._stepAnvilWork(1/60,t.state);
    assert.equal(t.collector.data.itinerary.phase,'berthed'); assert.equal(t.receiver.data.cargoManifest.totalQty,0);
  } finally {t.sim.dispose();}
});
test('receiving tender station-keeps at original home without writing its pose or overriding a foreign job', () => {
 const t=boot(); try {t.receiver.pos.x+=33; t.receiver.vel={x:-.325,z:.09}; const pos={...t.receiver.pos};
 t.owner._stepAnvilReceiver(t.receiver); assert.deepEqual({...t.receiver.pos},pos); assert.ok(Math.cos(t.receiver.data.intent.aimAngle)<-.99);
 t.receiver.data.jobId='foreign'; const intent=t.receiver.data.intent;t.owner._stepAnvilReceiver(t.receiver);assert.equal(t.receiver.data.intent,intent);
 }finally{t.sim.dispose();}
});

test('buyer ingress starts terminal braking at the clear outer-arc handover rather than inside the forecourt', () => {
 const t=boot();try{load(t);t.receiver.data.itinerary.buyerIngressReached=false;
 const ingress=anvilBuyerIngress(t.receiver,t.station);t.receiver.pos={x:ingress.x+800,z:ingress.z};
 t.receiver.vel={x:-30,z:0};t.receiver.rot=Math.PI;
 const before={...t.receiver.pos};t.owner._stepAnvilReceiver(t.receiver);
 assert.equal(t.receiver.data.intent.brake,true);assert.equal(t.receiver.data.itinerary.buyerIngressReached,false);
 assert.deepEqual({...t.receiver.pos},before);assert.equal(t.receiver.data.cargoManifest.totalQty,7);
 const center=t.receiver.data.itinerary.center, mouth=anvilBuyerApproach(t.receiver,t.station);
 const radius=Math.max(ANVIL_WORK.berthRadius,Math.hypot(mouth.x-center.x,mouth.z-center.z)+100);
 t.receiver.pos={x:center.x+ANVIL_WORK.berthRadius,z:center.z};
 const next={x:center.x+Math.cos(.22)*radius,z:center.z+Math.sin(.22)*radius};
 t.receiver.rot=Math.atan2(next.z-t.receiver.pos.z,next.x-t.receiver.pos.x);
 t.receiver.vel={x:Math.cos(t.receiver.rot)*30,z:Math.sin(t.receiver.rot)*30};
 t.owner._stepAnvilReceiver(t.receiver);assert.equal(t.receiver.data.intent.brake,false,'outer arc retains55 rather than terminal20');
 }finally{t.sim.dispose();}
});

test('receiver return uses bounded bend speed while retaining clear home-straight cruise', () => {
 const t=boot();try{load(t);t.receiver.data.itinerary.buyerIngressReached=true;t.receiver.data.itinerary.phase='return_berth';
 const c=t.receiver.data.itinerary.center,mouth=anvilBuyerApproach(t.receiver,t.station);
 const radius=ANVIL_WORK.berthRadius;
 t.receiver.data.itinerary.buyerExitRequired=false;
 t.receiver.pos={x:c.x,z:c.z+radius};
 const target={x:c.x+Math.cos(Math.PI/2-.22)*radius,z:c.z+Math.sin(Math.PI/2-.22)*radius};
 t.receiver.rot=Math.atan2(target.z-t.receiver.pos.z,target.x-t.receiver.pos.x);
 t.receiver.vel={x:Math.cos(t.receiver.rot)*40,z:Math.sin(t.receiver.rot)*40};
 t.owner._stepAnvilReceiver(t.receiver);assert.equal(t.receiver.data.intent.brake,true,'curve target35 brakes40');
 t.receiver.pos={x:c.x+ANVIL_WORK.berthRadius-800,z:c.z};t.receiver.rot=0;t.receiver.vel={x:40,z:0};
 t.owner._stepAnvilReceiver(t.receiver);assert.equal(t.receiver.data.intent.brake,false,'clear home straight retains55');
 assert.equal(t.receiver.data.itinerary.phase,'return_berth');
 }finally{t.sim.dispose();}
});

test('accepted return preserves its physical forecourt exit across save captures and duplicate receipt', () => {
 const t=boot();try{load(t);const before=stock(t);assert.equal(t.owner._deliverAnvilReceiver(t.receiver,t.station),true);
 const r=t.receiver.data.itinerary;assert.equal(r.buyerExitRequired,true);assert.equal(r.deliveredQty,7);
 for(const stage of ['before','during','after']){
  if(stage==='during'){const exit=anvilBuyerIngress(t.receiver,t.station);t.receiver.pos={x:exit.x-20,z:exit.z-20};}
  if(stage==='after'){t.receiver.pos=anvilBuyerIngress(t.receiver,t.station);t.receiver.vel={x:0,z:0};t.owner._stepAnvilReceiver(t.receiver);}
  const saved=JSON.parse(JSON.stringify(t.sim.registry.get('world').serialize())).records.byId[t.receiver.data.worldRecordId];
  assert.equal(saved.itinerary.buyerExitRequired,stage!=='after');assert.equal(saved.cargoManifest.totalQty,0);
  assert.equal(t.owner._deliverAnvilReceiver(t.receiver,t.station),false);assert.equal(stock(t),before+7);
 }
 }finally{t.sim.dispose();}
});
test('old near-forecourt return requires exit but old far return never turns back to the buyer', () => {
 const t=boot();try{load(t);t.receiver.data.itinerary.buyerIngressReached=true;t.receiver.data.itinerary.phase='return_berth';delete t.receiver.data.itinerary.buyerExitRequired;
 t.owner._stepAnvilReceiver(t.receiver);assert.equal(t.receiver.data.itinerary.buyerExitRequired,true);
 delete t.receiver.data.itinerary.buyerExitRequired;t.receiver.pos={x:16700,z:6000};t.receiver.vel={x:0,z:0};
 t.owner._stepAnvilReceiver(t.receiver);assert.equal(t.receiver.data.itinerary.buyerExitRequired,false);
 assert.ok(Math.cos(t.receiver.data.intent.aimAngle)>.99,'far legacy return continues home');
 }finally{t.sim.dispose();}
});

test('real Continue preserves exit-required state before during and after exit without repeating buyer credit', () => {
  // Focused real save/world/custody contract. Full production scenery/physics and
  // ordinary movement remain covered by the separate native whole-route case.
  const t=boot([save]);
  try {
    load(t);assert.equal(t.owner._deliverAnvilReceiver(t.receiver,t.station),true);
    const player=t.sim.spawn({type:'ship',team:0,hull:100,hullMax:100,radius:6,
      pos:{x:t.receiver.pos.x,z:t.receiver.pos.z+180},flags:{persistent:true}});
    t.state.playerId=player.id;const saver=t.sim.registry.get('save');
    const before=stock(t);let receiver=t.receiver;
    for(const stage of ['before','during','after']) {
      const station=t.owner._sectorStations().find(e=>e.data?.stationId===stationId)||t.station;
      const exit=anvilBuyerIngress(receiver,station);
      if(stage==='during'){receiver.pos.x=exit.x-20;receiver.pos.z=exit.z-20;}
      if(stage==='after'){receiver.pos.x=exit.x;receiver.pos.z=exit.z;receiver.vel.x=0;receiver.vel.z=0;t.owner._stepAnvilReceiver(receiver);}
      const observer=t.state.entities.get(t.state.playerId);observer.pos.x=receiver.pos.x;observer.pos.z=receiver.pos.z+180;
      const envelope=JSON.parse(JSON.stringify(saver.serialize(`receiver-exit-${stage}`)));
      assert.equal(saver.loadEnvelope(envelope),true);t.state.mode='flight';
      receiver=t.state.entityList.find(e=>e.alive!==false&&e.data?.worldRecordId===anvilWorkerRecordId(t.state,'receiver'));
      assert.ok(receiver,'same retained receiver rematerializes nearby');
      assert.equal(receiver.data.itinerary.buyerExitRequired,stage!=='after');
      assert.equal(receiver.data.itinerary.deliveredQty,7);assert.equal(receiver.data.itinerary.sequence,1);
      assert.equal(receiver.data.cargoManifest.totalQty,0);
      const restoredStation=t.owner._sectorStations().find(e=>e.data?.stationId===stationId);
      assert.equal(t.owner._deliverAnvilReceiver(receiver,restoredStation),false);
      assert.equal(stock(t),before);
    }
  } finally {t.sim.dispose();}
});

 test('pre-ingress panic near the buyer does not infer a reached service chord from proximity or an older sale', () => {
 const t=boot();try{load(t,0);const r=t.receiver.data.itinerary;r.buyerIngressReached=false;r.deliveredQty=7;
 t.owner._stepAnvilReceiver(t.receiver);assert.equal(r.phase,'return_berth');assert.equal(r.buyerExitRequired,false);assert.equal(r.deliveredQty,7);assert.equal(r.interruption,'empty_load');
 }finally{t.sim.dispose();}
});

test('observer contamination fails at first participant impulse or penetration', () => {
 for(const contact of [{targetId:1,distance:-.01,impulse:0},{targetId:1,distance:.1,impulse:2}])
  assert.throws(()=>assertNoObserverContact({playerId:1},contact),/observer fixture contacted/);
 assert.doesNotThrow(()=>assertNoObserverContact({playerId:1},{targetId:2,distance:-1,impulse:2}));
});

test('observer chooses another native-clear view when the old offset lands on the receiving tender', () => {
 const player={id:1,pos:{x:0,z:0},vel:{x:0,z:0}},tender={id:2,pos:{x:0,z:180},vel:{x:0,z:0}};
 const playerRecord={entity:player,body:{translation:()=>({x:0,y:0,z:0})},colliders:[{shape:{radius:18},translation:()=>({x:0,y:0,z:0})}]};
 const obstacle={entity:tender,body:{linvel:()=>({x:0,z:0}),isDynamic:()=>true},colliders:[{isSensor:()=>false,castShape:()=>null,projectPoint:p=>{
 const d=Math.hypot(p.x,p.z-180);return{isInside:d<=20,point:{x:p.x/d*20,y:0,z:180+(p.z-180)/d*20}};}}]};
 let placed;const f={physics:{_sg02:{RAPIER:{Ball:class{constructor(radius){this.radius=radius;}}},_frameOrigin:{x:0,z:0},records:new Map([[1,playerRecord],[2,obstacle]])}},state:{playerId:1,entities:new Map([[1,player]]),world:{records:{byId:{}}}},actor:()=>tender,world:{relocatePlayerInSector:p=>placed=p}};
 const choice=relocateAnvilObserver(f,{pos:{x:0,z:0}});
 assert.ok(choice.clearance>=32);assert.ok(Math.hypot(placed.x,placed.z-180)>100);
});
test('fresh production observer admission has a measured native-clear placement', async () => {
 const f=await anvilReceiverFixture();try{
 assert.ok(f.observerPlacements.length);assert.ok(f.observerPlacements[0].clearance>=32);
 const R=f.physics._sg02.RAPIER;
 for(const crossing of [false,true]){
  const world=new R.World({x:0,y:0,z:0});try{
   const player={id:1,pos:{x:0,z:0},vel:{x:0,z:0}};
   const body=world.createRigidBody(R.RigidBodyDesc.dynamic());const co=world.createCollider(R.ColliderDesc.ball(14),body);
   const hazard=world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(100,0,crossing?180:300).setLinvel(-100,0,0));
   const hc=world.createCollider(R.ColliderDesc.ball(20),hazard);
   const records=new Map([[1,{entity:player,body,colliders:[co]}],[2,{entity:{id:2},body:hazard,colliders:[hc]}]]);
   let placed;const probe={physics:{_sg02:{RAPIER:R,_frameOrigin:{x:0,z:0},records}},state:{playerId:1,entities:new Map([[1,player]])},actor:()=>player,world:{relocatePlayerInSector:p=>placed=p}};
   relocateAnvilObserver(probe,{pos:{x:0,z:0}});
   if(crossing)assert.ok(Math.hypot(placed.x,placed.z-180)>1,'actual swept crossing rejects old viewpoint');
   else assert.ok(Math.hypot(placed.x,placed.z-180)<.001,'directional near-miss retains old viewpoint');
  }finally{world.free();}
 }
 }finally{f.close();}
});


test('receiver hail imports standalone without pulling a Flight V3 scanner cycle', async () => {
  const { spawnSync } = await import('node:child_process');
  const url = new URL('../src/data/contactHail.js', import.meta.url).href;
  const result = spawnSync(process.execPath, [...process.execArgv, '--input-type=module', '--eval',
    `const m = await import(${JSON.stringify(url)}); if (typeof m.livingWorkStatusText !== 'function') process.exit(2);`],
    { encoding: 'utf8', timeout: 30000 });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
});

test('receiver ingress preserves the existing Flight V3 docking orbit multiplier', async () => {
  const { DOCK_ORBIT_RADIUS_MULT } = await import('../src/systems/flightV3.js');
  const t = boot(); try {
    const ingress = anvilBuyerIngress(t.receiver, t.station), mouth = anvilBuyerApproach(t.receiver, t.station);
    const distance = p => Math.hypot(p.x - t.station.pos.x, p.z - t.station.pos.z);
    assert.ok(Math.abs(distance(ingress) / distance(mouth) - DOCK_ORBIT_RADIUS_MULT) < 1e-10);
  } finally { t.sim.dispose(); }
});

for (const scenario of ['crossing', 'moving-away', 'near-miss', 'stationary-ahead', 'service-pair', 'early-envelope-entry'])
 test(`civilian predictive yield: ${scenario}`, () => {
  const t=boot(); try {
   const e=t.collector; e.pos={x:16000,z:6000}; e.vel={x:-42,z:0};
   const other=t.sim.spawn({type:'ship',hull:100,radius:18,pos:{x:15930,z:5920},vel:{x:0,z:50},data:{}});
   if(scenario==='moving-away'){other.pos={x:16060,z:6000};other.vel={x:20,z:0};}
   if(scenario==='near-miss'){other.pos={x:15930,z:5800};other.vel={x:0,z:50};}
   if(scenario==='stationary-ahead'){other.pos={x:15945,z:6000};other.vel={x:0,z:0};}
   if(scenario==='service-pair'){other.pos={x:15940,z:6000};other.vel={x:0,z:0};e.vel={x:-2,z:0};}
   if(scenario==='early-envelope-entry'){other.pos={x:15890,z:6000};other.vel={x:0,z:0};}
   const before=JSON.stringify([e.pos,e.vel,e.data.cargoManifest,other.pos,other.vel]);
   const result=anvilTrafficYield(t.state,e);
   assert.equal(!!result,['crossing','stationary-ahead','early-envelope-entry'].includes(scenario));
   if(result)assert.equal(result.targetId,other.id);
   assert.equal(JSON.stringify([e.pos,e.vel,e.data.cargoManifest,other.pos,other.vel]),before);
  } finally {t.sim.dispose();}
 });

test('constructed native crossing yields through ordinary Flight V3 braking without contact or cargo mutation',async()=>{
 const {physics}=await import('../src/core/physics.js');
 const {flightV3}=await import('../src/systems/flightV3.js');
 const {makeShipEntitySpec}=await import('../src/systems/ships.js');
 const t=boot([flightV3,physics]);try{
  t.state.settings.gameplay.physicsBackend='rapier-dynamic';
  const e=t.collector;e.pos={x:16000,z:6000};e.vel={x:-42,z:0};e.rot=Math.PI;
  e.data.itinerary.phase='outbound';
  const crossing=t.sim.spawn(makeShipEntitySpec('ship_hornet',{team:1,pos:{x:15930,z:5920},rot:Math.PI/2,ai:{passive:true}}));
  crossing.vel={x:0,z:50};
  const observer=t.sim.spawn({type:'ship',isPlayer:true,team:0,hull:100,
   pos:{x:15965,z:5960},maxSpeed:200,collides:false,physicsBody:false});t.state.playerId=observer.id;
  // Controlled crossing fixture, not a reconstruction of Hornet514's unknown pre-impact motion.
  // No world generators, combat controller or observation collider in this focused lane.
  assert.equal(await t.sim.registry.get('physics').prepareBackend(t.state),true);
  const f=t.sim.registry.get('physics');let yielded=0,min=Infinity;
  const cargoBefore=JSON.stringify(e.data.cargoManifest);
  for(let i=0;i<180;i++){
   crossing.data.intent={moveX:0,moveZ:0.3,boost:false,fire:false,aimAngle:Math.PI/2,brake:false};
   if(anvilTrafficYield(t.state,e))yielded++;
   t.owner._stepAnvilWork(1/60,t.state);
   t.sim.step(1/60);
   const contact=receiverContactDepth(f,e);
   assert.equal(contact.admitted,true,'worker must use an admitted native body');
   assert.equal(receiverContactDepth(f,crossing).admitted,true,JSON.stringify({id:crossing.id,alive:crossing.alive,collides:crossing.collides,partition:crossing._physicsPartition,body:crossing.physicsBody,native:[...f._sg02.records.keys()]}));
   assert.ok(contact.contacts.every(c=>c.distance>=-0.05&&c.impulse===0),`contact at ${i}`);
   min=Math.min(min,Math.hypot(e.pos.x-crossing.pos.x,e.pos.z-crossing.pos.z));
  }
  assert.ok(yielded>0);assert.ok(e.pos.x<15999,'worker moved under physical integration');
  assert.ok(crossing.pos.z>6020,'crossing ship physically traverses the worker lane');
  assert.equal(e.alive,true);assert.equal(crossing.alive,true);
  assert.equal(JSON.stringify(e.data.cargoManifest),cargoBefore);
  console.log(JSON.stringify({constructedCrossing:true,yielded,minDistance:min,workerPos:e.pos,otherPos:crossing.pos}));
 }finally{t.sim.dispose();}
});

test('predictive yield uses the compact ship index with identical fallback decisions',()=>{
 const t=boot();try{
  t.collector.pos={x:16000,z:6000};t.collector.vel={x:-42,z:0};
  const ship=t.sim.spawn({type:'ship',hull:100,radius:18,pos:{x:15930,z:5920},vel:{x:0,z:50},data:{}});
  const indexed={...t.state,entityIndex:{__spacefaceEntityIndexV1:true,ready:true,shipLike:[t.collector,ship]}};
  Object.defineProperty(indexed,'entityList',{get(){throw new Error('fat population scan');}});
  const fallback={...t.state,entityIndex:null};
  assert.deepEqual(anvilTrafficYield(indexed,t.collector),anvilTrafficYield(fallback,t.collector));
 }finally{t.sim.dispose();}
});

test('observer prediction matches production relocation zero velocity instead of discarded drift',async()=>{
 const f=await anvilReceiverFixture();try{
  const player=f.state.entities.get(f.state.playerId);
  player.vel.x=180;player.vel.z=-160;player.angVel=2;
  const selected=relocateAnvilObserver(f,f.actor('collector'),'observer-velocity-reset-regression');
  assert.ok(selected.clearance>=32);assert.ok(Math.hypot(selected.pos.x-f.actor('collector').pos.x,
   selected.pos.z-f.actor('collector').pos.z)<=450.000001,'original candidate bounds retained');
  assert.equal(player.vel.x,0);assert.equal(player.vel.z,0);assert.equal(player.angVel,0);
 }finally{f.close();}
});

async function harvestBudgetFixture(t) {
  const { planetRuntime } = await import('../src/systems/planetRuntime.js');
  const { fields } = await import('../src/systems/fields.js');
  const { PRODUCTION_FEATURES } = await import('../src/runtime/runtimeProfiles.js');
  const { snapshotFeatureMaps, applyFeatureConfigToMaps, restoreFeatureMaps } = await import('../src/data/featureFlags.js');
  const prior = snapshotFeatureMaps(); applyFeatureConfigToMaps(PRODUCTION_FEATURES);
  const sim = createSimulation({ seed: 424213, systems: [
    { name: 'world', init(ctx) { this.state = ctx.state; }, upsertWorldRecord: world.upsertWorldRecord },
    traffic, fields, planetRuntime,
  ], updateOrder: [] });
  t.after(() => { sim.dispose(); restoreFeatureMaps(prior); });
  const state = sim.state; state.mode = 'flight'; state.world.currentSectorId = PLANET_SITE.sectorId;
  const planet = sim.registry.get('planetRuntime'); planet.update(0, state);
  const rt = state.planet, worker = state.entities.get(rt.witnessId);
  worker.pos.x = rt.center.x + 980; worker.pos.z = rt.center.z;
  worker.vel.x = 0; worker.vel.z = 70; worker.data.itinerary.phase = 'collect';
  const crowded = Array.from({ length: 7 }, () => sim.spawn({ type: 'ship', hull: 100, hullMax: 100,
    collides: true, radius: 12, mass: 30, pos: { ...worker.pos }, vel: { x: 0, z: 0 },
    physicsBody: { dynamic: true, radius: 12, mass: 30 } }));
  let candidates = [worker];
  // Constructed candidate order exercises the real bounded admission and producer owners.
  // It is not a reconstruction of the fresh production encounter.
  planet.helpers = { ...planet.helpers, queryRadius(center, radius, out) { out.push(...candidates); return out; } };
  const admit = () => { candidates = [worker]; planet._tickShips(1 / 60, state, rt, PLANET_SITE); };
  const evict = () => { candidates = [...crowded, worker]; planet._tickShips(1 / 60, state, rt, PLANET_SITE); };
  const harvest = (dt = .5) => planet._tickWorkerHarvest(dt, state, rt, PLANET_SITE);
  admit();
  return { sim, state, planet, rt, worker, admit, evict, harvest };
}

test('bounded harvest budget retains only admitted fractional path without retaining heat or extra slots', async t => {
  const f = await harvestBudgetFixture(t); f.harvest();
  assert.ok(Math.abs(f.rt.ships[f.worker.id].pendingShallow - .35) < 1e-10);
  f.rt.ships[f.worker.id].heat = .4;
  f.evict(); assert.equal(f.rt.ships[f.worker.id], undefined);
  assert.equal(f.planet._scratchIds.length, 7); assert.ok(!f.planet._scratchIds.includes(f.worker.id));
  const carry = structuredClone(f.rt.workerHarvestCarry);
  f.harvest(100); assert.deepEqual(f.rt.workerHarvestCarry, carry, 'unadmitted time produces nothing');
  assert.equal(f.worker.data.cargoManifest.totalQty, 0);
  f.admit(); assert.ok(f.rt.ships[f.worker.id].heat < .01, 'thermal state still resets under ordinary admission');
  const carryIdentity = f.rt.workerHarvestCarry;
  f.harvest(); assert.ok(Math.abs(f.rt.ships[f.worker.id].pendingShallow - .70) < 1e-10);
  assert.strictEqual(f.rt.workerHarvestCarry, carryIdentity, 'same-life bookkeeping reuses one bounded carry object');
  f.evict(); f.admit(); f.harvest();
  assert.equal(f.worker.data.cargoManifest.totalQty, 1, 'only actual admitted path becomes one finite unit');
  assert.ok(Math.abs(f.rt.workerHarvestCarry.pendingShallow - .05) < 1e-10);
});

for (const invalidation of ['dead', 'new-life', 'new-record', 'new-site', 'left-band', 'left-collect']) {
  test(`fractional harvest carry rejects ${invalidation} before budget readmission`, async t => {
    const f = await harvestBudgetFixture(t); f.harvest(); f.evict();
    if (invalidation === 'dead') f.worker.alive = false;
    if (invalidation === 'new-life') {
      const { stampOccupantGeneration } = await import('../src/core/entity.js'); stampOccupantGeneration(f.state, f.worker);
    }
    if (invalidation === 'new-record') f.worker.data.worldRecordId += ':foreign';
    if (invalidation === 'new-site') f.rt.workerHarvestCarry.siteId = 'other-site';
    if (invalidation === 'left-band') f.worker.pos.x = f.rt.center.x + PLANET_SITE.bands.influence + 10;
    if (invalidation === 'left-collect') f.worker.data.itinerary.phase = 'return';
    f.harvest(); assert.equal(f.rt.workerHarvestCarry, null);
  });
}

test('fractional carry never restores refused whole units and is transient across planet teardown', async t => {
  const f = await harvestBudgetFixture(t);
  f.sim.registry.get('traffic').acceptAnvilHarvest = () => 0;
  f.harvest(2); assert.equal(f.worker.data.cargoManifest.totalQty, 0);
  assert.ok(Math.abs(f.rt.workerHarvestCarry.pendingShallow - .4) < 1e-10);
  f.evict(); f.admit(); f.harvest(.01);
  assert.ok(f.rt.ships[f.worker.id].pendingShallow < .5, 'refused whole unit was discarded');
  f.planet._unwind('save_loaded'); assert.equal(f.state.planet.workerHarvestCarry, null);
});

test('an admitted changed record cannot inherit the previous worker fraction', async t => {
  const f = await harvestBudgetFixture(t); f.harvest(); f.evict();
  f.worker.data.worldRecordId += ':replacement'; f.admit(); f.harvest();
  assert.ok(Math.abs(f.rt.ships[f.worker.id].pendingShallow - .35) < 1e-10);
  assert.equal(f.rt.workerHarvestCarry.recordId, f.worker.data.worldRecordId);
  assert.equal(f.worker.data.cargoManifest.totalQty, 0);
});

test('actual save/load drops transient fractional carry without granting cargo to the restored life', async t => {
  const { planetRuntime } = await import('../src/systems/planetRuntime.js');
  const { fields } = await import('../src/systems/fields.js');
  const { npcJobsRuntime } = await import('../src/systems/npcJobsRuntime.js');
  const { PRODUCTION_FEATURES } = await import('../src/runtime/runtimeProfiles.js');
  const { snapshotFeatureMaps, applyFeatureConfigToMaps, restoreFeatureMaps } = await import('../src/data/featureFlags.js');
  const { occupantGenerationOf } = await import('../src/core/entity.js');
  const prior = snapshotFeatureMaps(); applyFeatureConfigToMaps(PRODUCTION_FEATURES);
  const sim = createSimulation({ seed: 424213, systems: [world, npcJobsRuntime, traffic, fields, planetRuntime, save] });
  t.after(() => { sim.dispose(); restoreFeatureMaps(prior); });
  const state = sim.state; state.mode = 'flight';
  const player = sim.spawn({ type: 'ship', team: 0, hull: 100, hullMax: 100,
    pos: { x: 0, z: 0 }, radius: 6, flags: { persistent: true } }); state.playerId = player.id;
  sim.registry.get('world').enterSector(PLANET_SITE.sectorId); sim.step();
  const planet = sim.registry.get('planetRuntime'), worker = state.entities.get(state.planet.witnessId);
  const recordId = worker.data.worldRecordId, oldLife = occupantGenerationOf(worker);
  worker.pos.x = state.planet.center.x + 980; worker.pos.z = state.planet.center.z;
  worker.vel.x = 0; worker.vel.z = 70; worker.data.itinerary.phase = 'collect';
  player.pos.x = worker.pos.x; player.pos.z = worker.pos.z + 100;
  planet._tickShips(1 / 60, state, state.planet, PLANET_SITE);
  planet._tickWorkerHarvest(.5, state, state.planet, PLANET_SITE);
  assert.ok(state.planet.workerHarvestCarry.pendingShallow > .3);
  const saver = sim.registry.get('save'), envelope = JSON.parse(JSON.stringify(saver.serialize('anvil-fractional-carry')));
  assert.equal(saver.loadEnvelope(envelope), true); state.mode = 'flight';
  assert.equal(state.planet.workerHarvestCarry, null, 'actual load normalization discards the transient fraction');
  const restored = state.entityList.find(e => e.alive !== false && e.data?.worldRecordId === recordId);
  assert.ok(restored); assert.notEqual(occupantGenerationOf(restored), oldLife);
  assert.equal(restored.data.cargoManifest.totalQty, 0, 'loading does not materialize a whole unit');
  sim.registry.get('traffic')._stepAnvilWork(1 / 60, state);
  planet._scratchIds.length = 0;
  planet._tickWorkerHarvest(100, state, state.planet, PLANET_SITE);
  assert.equal(restored.data.cargoManifest.totalQty, 0, 'unadmitted restored time cannot turn discarded carry into cargo');
  assert.equal(state.planet.workerHarvestCarry, null);
});

test('injured original collector requests real service instead of launching from berth', () => {
  const t = boot(); try {
    const e = t.collector; e.data.itinerary.phase = 'berthed'; e.hull = 90;
    e.pos = { ...anvilServicePoint(t.receiver) }; e.vel = { x: 0, z: 0 };
    t.owner._stepAnvilWork(1 / 60, t.state);
    assert.equal(e.data.itinerary.phase, 'service_hold');
    assert.equal(e.data.itinerary.serviceRequired, true);
    assert.equal(e.hull, 90); assert.equal(e.data.cargoManifest.totalQty, 0);
    assert.ok(Math.sin(e.data.intent.aimAngle) > 0.99, 'clear laterally before the outer layby, not through tender');
    assert.match(livingWorkStatusText(e, { state: t.state }), /REPAIR.*TAUT/);
  } finally { t.sim.dispose(); }
});

test('service release requires actual 75 percent hull and preserves receiver-away truth', () => {
  const t = boot(); try {
    const e = t.collector; e.data.itinerary.phase = 'service_hold'; e.data.itinerary.serviceRequired = true;
    e.hull = 149; t.receiver.data.itinerary.phase = 'return_berth'; t.receiver.pos.x += 500;
    t.owner._stepAnvilWork(1 / 60, t.state);
    assert.equal(e.data.itinerary.phase, 'service_hold'); assert.equal(e.hull, 149);
    assert.match(livingWorkStatusText(e, { state: t.state }), /TENDER AWAY/);
    e.hull = 150; t.owner._stepAnvilWork(1 / 60, t.state);
    assert.equal(e.data.itinerary.serviceRequired, false);
    assert.equal(e.data.itinerary.phase, 'berthed');
  } finally { t.sim.dispose(); }
});

test('repair Hail separates compact truthful progress from actionable route guidance', () => {
  const t = boot(); try {
    const e = t.collector; e.hull = 90; e.data.itinerary.phase = 'service_hold'; e.data.itinerary.serviceRequired = true;
    const compact = livingWorkStatusText(e, { state: t.state });
    assert.match(compact, /HULL 45% \/ 75%/);
    assert.doesNotMatch(compact, /Aim at|Reel In|tap Massline/);
    const offer = { kind: 'trader', targetId: e.id, requestId: 'repair-help' };
    const reply = createContactHailResponse(t.state, offer, 'route');
    assert.match(reply.lines[0], /Aim at this collector and attach Massline/);
    assert.match(reply.lines[0], /If slack, hold Massline \+ Reel In gently/);
    assert.match(reply.lines[0], /Release the hold to keep the line; tap Massline separately to cut/);
    assert.doesNotMatch(reply.lines[0], /KeyF|Digit0|BracketLeft|press Q/);
    assert.equal(e.hull, 90); assert.equal(e.data.itinerary.serviceRequired, true, 'read-only help grants no repair');
    t.state.combat ||= {}; t.state.combat.entities ||= {};
    t.state.combat.entities[String(e.id)] = { capabilities: { drive: false } };
    assert.match(livingWorkStatusText(e, { state: t.state }), /HULL 45% \/ 100% · DRIVE DISABLED/);
    e.data.itinerary.phase = 'return';
    assert.doesNotMatch(createContactHailResponse(t.state, offer, 'route').lines[0], /Aim at/);
    assert.match(livingWorkStatusText(e, { state: t.state }), /INJURED · RETURNING/);
  } finally { t.sim.dispose(); }
});

test('injured loaded return keeps finite transfer before service hold', () => {
  const t = boot(); try {
    const e = t.collector; e.data.itinerary.phase = 'collect';
    assert.equal(t.owner.acceptAnvilHarvest(e, { siteId: PLANET_SITE.id, commodityId, qty: 3 }), 3);
    e.hull = 90; e.data.itinerary.phase = 'return';
    e.pos = { ...anvilServicePoint(t.receiver) }; e.vel = { x: 0, z: 0 };
    t.owner._stepAnvilWork(1 / 60, t.state);
    assert.equal(t.receiver.data.cargoManifest.totalQty, 3); assert.equal(e.data.cargoManifest.totalQty, 0);
    t.owner._stepAnvilWork(1 / 60, t.state);
    assert.equal(e.data.itinerary.phase, 'service_hold'); assert.equal(e.hull, 90);
    assert.equal(e.data.itinerary.sequence, 1);
  } finally { t.sim.dispose(); }
});

for (const cause of ['dead', 'foreign-job', 'duplicate']) test(`repair service does not take authority over ${cause} original`, () => {
  const t = boot(); try {
    const e = t.collector; e.hull = 90; e.data.itinerary.phase = 'berthed';
    if (cause === 'dead') e.alive = false;
    if (cause === 'foreign-job') e.data.jobId = 'job:foreign';
    if (cause === 'duplicate') t.sim.spawn({type:'ship', hull:90, data:{...e.data}});
    t.owner._stepAnvilWork(1 / 60, t.state);
    assert.equal(e.data.itinerary.serviceRequired, undefined);
    assert.equal(Boolean(livingWorkStatusText(e,{state:t.state})?.includes('REPAIR')), false);
    assert.equal(e.hull,90);
  } finally {t.sim.dispose();}
});

test('real Continue retains original repair hold and damage without replacement or cargo grant', () => {
  const t = boot([save]); try {
    const e=t.collector; e.hull=90; e.data.itinerary.phase='berthed';
    t.owner._stepAnvilWork(1/60,t.state);
    const player=t.sim.spawn({type:'ship',team:0,hull:100,hullMax:100,radius:6,pos:{x:e.pos.x,z:e.pos.z+180},flags:{persistent:true}});
    t.state.playerId=player.id;
    const saver=t.sim.registry.get('save'),recordId=e.data.worldRecordId;
    const envelope=JSON.parse(JSON.stringify(saver.serialize('original-repair-hold')));
    assert.equal(saver.loadEnvelope(envelope),true);t.state.mode='flight';
    const restored=t.state.entityList.find(x=>x.alive!==false&&x.data?.worldRecordId===recordId);
    assert.ok(restored);assert.equal(restored.hull,90);assert.equal(restored.data.itinerary.serviceRequired,true);
    assert.equal(restored.data.itinerary.phase,'service_hold');assert.equal(restored.data.cargoManifest.totalQty,0);
    t.owner._stepAnvilWork(1/60,t.state);assert.equal(restored.data.itinerary.phase,'service_hold');
    assert.equal(t.state.entityList.filter(x=>x.alive!==false&&x.data?.worldRecordId===recordId).length,1);
  } finally {t.sim.dispose();}
});

test('repair hold preserves missing berth guard and safely releases an already healed old hold', () => {
 const t=boot();try{const e=t.collector;e.hull=90;e.data.itinerary.phase='service_hold';
  t.receiver.alive=false;t.state.world.records.byId[t.receiver.data.worldRecordId].alive=false;
  t.owner._stepAnvilWork(1/60,t.state);assert.equal(e.data.intent.moveZ,0);assert.equal(e.data.intent.brake,true);
  assert.match(livingWorkStatusText(e,{state:t.state}),/TENDER UNAVAILABLE/);
  e.hull=160;e.data.itinerary.serviceRequired=false;t.owner._stepAnvilWork(1/60,t.state);
  assert.equal(e.data.itinerary.phase,'berthed');assert.equal(e.data.itinerary.serviceRequired,false);
 }finally{t.sim.dispose();}
});

test('service hold waits for the actual drive capability, not just healed hull', () => {
 const t=boot();try{const e=t.collector;e.hull=160;e.data.itinerary.phase='service_hold';e.data.itinerary.serviceRequired=true;
  t.state.combat ||= {};t.state.combat.entities ||= {};t.state.combat.entities[String(e.id)]={capabilities:{drive:false},subsystems:{subsystem_drive:{effectiveDisabled:true}}};
  t.owner._stepAnvilWork(1/60,t.state);assert.equal(e.data.itinerary.phase,'service_hold');
  assert.match(livingWorkStatusText(e,{state:t.state}),/REPAIR HOLD/);
  t.state.combat.entities[String(e.id)].capabilities.drive=true;t.state.combat.entities[String(e.id)].subsystems.subsystem_drive.effectiveDisabled=false;
  t.owner._stepAnvilWork(1/60,t.state);assert.equal(e.data.itinerary.serviceRequired,false);
 }finally{t.sim.dispose();}
});
