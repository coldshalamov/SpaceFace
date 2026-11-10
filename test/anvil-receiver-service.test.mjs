import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { traffic } from '../src/systems/traffic.js';
import { world } from '../src/systems/world.js';
import { economy } from '../src/systems/economy.js';
import { ANVIL_WORK, anvilWorkerRecordId, anvilReceiverWorkStatus, anvilServicePoint, anvilBuyerApproach } from '../src/systems/anvilWork.js';
import { PLANET_SITE } from '../src/data/planets.js';
import { getCombatKernel } from '../src/combat/kernel.js';
import { SUBSYSTEM_DEFS } from '../src/data/combatDefs.js';
import { save } from '../src/save/saveSystem.js';
import { stepLatchRepair } from '../src/combat/latchRepair.js';

function boot() {
  const sim = createSimulation({ seed: 47, systems: [{ ...world, update() {} }, { ...traffic, update() {} }, economy, save] });
  const state = sim.state; state.mode = 'flight'; state.world.currentSectorId = PLANET_SITE.sectorId;
  const owner = sim.registry.get('traffic');
  owner.ensureAnvilWorker(state, sim.spawn, { x: 14000, z: 6000 });
  const actor = role => state.entityList.find(e => e.data?.worldRecordId === anvilWorkerRecordId(state, role));
  const receiver = actor('receiver'), collector = actor('collector');
  const station = sim.spawn({ type: 'station', hull: 1000, radius: 120, pos: { x: 13000, z: 9500 }, data: { stationId: ANVIL_WORK.buyerId, collisionProxy: 'skin:place_station_trade_hub', dockRadius: 90 } });
  sim.registry.get('economy').ensureMarket(ANVIL_WORK.buyerId);
  return { sim, state, owner, receiver, collector, station };
}
function load(t, entity = t.receiver, qty = 7) {
  t.owner._setTrafficManifest(entity, t.state.traffic.freighters.find(r => r.id === entity.id),
    t.owner._buildMinerManifest(entity, 0, PLANET_SITE.harvest.commodityShallow, qty));
}
function disable(t) {
  const kernel = getCombatKernel({ state: t.state, bus: t.sim.bus });
  kernel.inspect({ entityId: t.receiver.id });
  const runtime = t.state.combat.entities[t.receiver.id];
  const part = runtime.subsystems.subsystem_drive;
  const def = SUBSYSTEM_DEFS.find(d => d.id === 'subsystem_drive');
  assert.equal(kernel.routeDamage({ attackerId: null, targetId: t.receiver.id,
    packet: { channels: { ion: def.armor.flat + part.health / def.armor.multipliers.ion },
      penetration: 0, shieldBypass: 1, subsystemShare: 1, hit: { subsystemId: def.id },
      source: { kind: 'test', id: 'receiver-drive-hit' } },
    origin: { kind: 'test', id: 'receiver-drive-hit' } }).ok, true);
  t.state.tick += 2; kernel.prePhysics(1 / 60);
  assert.equal(runtime.capabilities.drive, false);
}

test('disabled receiver holds its loaded receiving route without inventing departure or losing custody', () => {
  const t = boot(); try {
    load(t); disable(t); const source = structuredClone(t.receiver.data.cargoManifest);
    for (let i = 0; i < 120; i++) t.owner._stepAnvilReceiver(t.receiver);
    assert.equal(t.receiver.data.itinerary.phase, 'receiving');
    assert.equal(t.receiver.data.intent.moveZ, 0);
    assert.deepEqual(t.receiver.data.cargoManifest, source);
    assert.match(anvilReceiverWorkStatus(t.state, t.receiver), /DRIVE OFFLINE.*GAS HELD/);
  } finally { t.sim.dispose(); }
});

test('injured operable receiver may dispatch; disabled receiver may still accept physically settled finite cargo', () => {
  const t = boot(); try {
    t.receiver.hull = 40; load(t); t.owner._stepAnvilReceiver(t.receiver);
    assert.equal(t.receiver.data.itinerary.phase, 'delivery', 'no invented hull-based receipt or departure rule');
    t.receiver.data.itinerary.phase = 'receiving'; disable(t);
    const heldAfterDamage = t.receiver.data.cargoManifest.totalQty;
    load(t, t.collector, 3); t.collector.data.itinerary.phase = 'return';
    t.collector.pos = anvilServicePoint(t.receiver); t.collector.vel = { x: 0, z: 0 }; t.receiver.vel = { x: 0, z: 0 };
    assert.equal(t.owner._transferAnvilLoad(t.collector, t.receiver), 3);
    t.owner._stepAnvilReceiver(t.receiver);
    assert.equal(t.receiver.data.itinerary.phase, 'receiving');
    assert.equal(t.receiver.data.cargoManifest.totalQty, heldAfterDamage + 3);
  } finally { t.sim.dispose(); }
});

test('existing taut-line repair, not waiting or slack, restores same receiver drive and resumes finite delivery', () => {
  const t = boot(); try {
    load(t); disable(t); t.receiver.hull = t.receiver.hullMax - 24;
    const source = structuredClone(t.receiver.data.cargoManifest);
    const player = t.sim.spawn({ type: 'ship', team: 0, hull: 100, hullMax: 100, pos: { x: t.receiver.pos.x + 100, z: t.receiver.pos.z } });
    t.state.playerId = player.id;
    // Focused repair-owner fixture, not ordinary input acquisition or native physics proof.
    t.state.combat.attachments = { byId: { repair: { id: 'repair', ownerId: player.id, targetId: t.receiver.id, state: 'active', restLength: 200 } } };
    assert.equal(stepLatchRepair(t.state, 1, t.sim.bus), 0);
    t.owner._stepAnvilReceiver(t.receiver); assert.equal(t.receiver.data.itinerary.phase, 'receiving');
    t.state.combat.attachments.byId.repair.restLength = 100;
    assert.equal(stepLatchRepair(t.state, 1, t.sim.bus), 12);
    t.owner._stepAnvilReceiver(t.receiver); assert.equal(t.receiver.data.itinerary.phase, 'receiving');
    assert.equal(stepLatchRepair(t.state, 1, t.sim.bus), 12);
    assert.equal(t.state.combat.entities[t.receiver.id].capabilities.drive, true);
    t.owner._stepAnvilReceiver(t.receiver); assert.equal(t.receiver.data.itinerary.phase, 'delivery');
    assert.deepEqual(t.receiver.data.cargoManifest, source);
  } finally { t.sim.dispose(); }
});

test('drive loss en route retains route; already-settled buyer handoff needs no propulsion', () => {
  const t = boot(); try {
    load(t); t.receiver.data.itinerary.phase = 'delivery'; disable(t);
    t.owner._stepAnvilReceiver(t.receiver);
    assert.equal(t.receiver.data.itinerary.phase, 'delivery'); assert.equal(t.receiver.data.intent.moveZ, 0);
    t.receiver.pos = anvilBuyerApproach(t.receiver, t.station); t.receiver.vel = { x: 0, z: 0 };
    t.owner._stepAnvilReceiver(t.receiver);
    assert.equal(t.receiver.data.cargoManifest.totalQty, 0);
    assert.equal(t.receiver.data.itinerary.phase, 'return_berth');
    t.owner._stepAnvilReceiver(t.receiver); assert.equal(t.receiver.data.intent.moveZ, 0);
  } finally { t.sim.dispose(); }
});

for (const cause of ['dead', 'superseded', 'duplicate', 'foreign-job']) test(`receiver service respects ${cause} original authority`, () => {
  const t = boot(); try {
    load(t); disable(t); const route = structuredClone(t.receiver.data.itinerary);
    if (cause === 'dead') t.receiver.alive = false;
    if (cause === 'superseded') t.state.entities.delete(t.receiver.id);
    if (cause === 'duplicate') t.sim.spawn({ type: 'ship', hull: 100, data: { ...t.receiver.data } });
    if (cause === 'foreign-job') t.receiver.data.jobId = 'foreign';
    t.receiver.data.intent = { marker: 'other-owner' };
    t.owner._stepAnvilReceiver(t.receiver);
    assert.deepEqual(t.receiver.data.intent, { marker: 'other-owner' });
    assert.deepEqual(t.receiver.data.itinerary, route);
    assert.equal(anvilReceiverWorkStatus(t.state, t.receiver), null);
  } finally { t.sim.dispose(); }
});

test('Continue preserves damaged original receiver, disabled drive and finite held load', () => {
  const t = boot(); try {
    load(t); disable(t); t.receiver.hull = 90;
    const recordId = t.receiver.data.worldRecordId;
    const source = structuredClone(t.receiver.data.cargoManifest);
    const player = t.sim.spawn({ type: 'ship', team: 0, hull: 100, hullMax: 100, radius: 6,
      pos: { x: t.receiver.pos.x, z: t.receiver.pos.z + 180 }, flags: { persistent: true } });
    t.state.playerId = player.id;
    const saver = t.sim.registry.get('save');
    const envelope = JSON.parse(JSON.stringify(saver.serialize('receiver-drive-hold')));
    assert.equal(saver.loadEnvelope(envelope), true); t.state.mode = 'flight';
    const restored = t.state.entityList.find(e => e.alive !== false && e.data?.worldRecordId === recordId);
    assert.ok(restored); assert.notEqual(restored, t.receiver);
    assert.equal(restored.hull, 90);
    assert.deepEqual(restored.data.cargoManifest, source);
    assert.equal(t.state.combat.entities[restored.id].capabilities.drive, false, 'post-reset damage is ready before traffic');
    t.owner._stepAnvilReceiver(restored);
    assert.equal(restored.data.itinerary.phase, 'receiving');
    assert.equal(restored.data.intent.moveZ, 0);
    assert.equal(t.state.entityList.filter(e => e.alive !== false && e.data?.worldRecordId === recordId).length, 1);
  } finally { t.sim.dispose(); }
});


test('malformed-present damage is quarantined without Hail mutation, dispatch, transfer or healthy overwrite', () => {
 const t=boot();try{
  load(t);disable(t);t.sim.registry.get('world').upsertWorldRecord(t.receiver);
  const rec=t.state.world.records.byId[t.receiver.data.worldRecordId];
  rec.extra.orchardSubsystemDamage.unknownAuthority={drive:true};
  const corrupt=structuredClone(rec.extra.orchardSubsystemDamage);
  delete t.state.combat.entities[t.receiver.id];
  const before=structuredClone(t.state.combat);
  assert.match(anvilReceiverWorkStatus(t.state,t.receiver),/DAMAGE RECORD UNAVAILABLE/);
  assert.deepEqual(t.state.combat,before,'Hail never hydrates or changes authority');
  t.owner._stepAnvilReceiver(t.receiver);
  assert.equal(t.receiver.data.itinerary.phase,'receiving');assert.equal(t.receiver.data.intent.moveZ,0);
  load(t,t.collector,3);t.collector.data.itinerary.phase='return';t.collector.pos=anvilServicePoint(t.receiver);t.collector.vel={x:0,z:0};t.receiver.vel={x:0,z:0};
  assert.equal(t.owner._transferAnvilLoad(t.collector,t.receiver),0);
  t.sim.registry.get('world').upsertWorldRecord(t.receiver);
  assert.deepEqual(t.state.world.records.byId[t.receiver.data.worldRecordId].extra.orchardSubsystemDamage,corrupt);
 }finally{t.sim.dispose();}
});

test('legacy absent damage remains distinct and receiver Hail never creates runtime',()=>{
 const t=boot();try{
  delete t.state.combat?.entities?.[t.receiver.id];
  const before=structuredClone(t.state.combat);
  assert.match(anvilReceiverWorkStatus(t.state,t.receiver),/RECEIVING SHALLOW GAS/);
  assert.deepEqual(t.state.combat,before);
  load(t);t.owner._stepAnvilReceiver(t.receiver);assert.equal(t.receiver.data.itinerary.phase,'delivery');
 }finally{t.sim.dispose();}
});


test('cold valid damaged Hail reads saved drive truth without creating combat state',()=>{
 const t=boot();try{
  disable(t);t.sim.registry.get('world').upsertWorldRecord(t.receiver);
  delete t.state.combat.entities[t.receiver.id];const before=structuredClone(t.state.combat);
  assert.match(anvilReceiverWorkStatus(t.state,t.receiver),/DRIVE OFFLINE/);
  assert.deepEqual(t.state.combat,before);
 }finally{t.sim.dispose();}
});
