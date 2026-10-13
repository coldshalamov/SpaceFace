import test from 'node:test';
import assert from 'node:assert/strict';
import { MACHINE_SITES } from '../src/data/precursorMachines.js';
import { ensureAlienEcologyState } from '../src/data/alienEcologyState.js';
import { materializeMachineLayer, tickMachineLayer, handleMachinePickupCollected } from '../src/systems/precursorMachines.js';
import { serializeAlienEcologyState, deserializeAlienEcologyState } from '../src/systems/alienEcology.js';
import { addCargo, removeCargo } from '../src/systems/cargo.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { mulberry32, hash32 } from '../src/core/rng.js';
import { save } from '../src/save/saveSystem.js';

function fixture(sectorId) {
  const state = { meta: { seed: 4242 }, simTime: 0, tick: 0, playerId: 1,
    entities: new Map(), entityList: [], player: { activeShipIndex: 0, ownedShips: [{ defId: 'ship_kestrel' }],
      cargo: { items: {}, capVolume: 500, capMass: 500, usedVolume: 0, usedMass: 0 } },
    world: { currentSectorId: sectorId, sectors: {} } };
  const events = []; let id = 100;
  const world = { state, active: { dressing: [] }, registry: { get: () => null },
    _toGlobal: p => ({ ...p }), bus: { emit: (name, payload) => events.push({ name, payload }) },
    helpers: { mulberry32, hash32, spawnEntity(spec) {
      const e = { ...spec, id: id++, alive: true, occupantGeneration: 1, pos: { ...spec.pos }, vel: spec.vel || { x: 0, z: 0 } };
      state.entities.set(e.id, e); state.entityList.push(e); return e;
    } } };
  materializeMachineLayer(world, { id: sectorId }, world.active);
  return { state, world, events,
    machine: kind => state.entityList.find(e => e.alive !== false && e.data?.machine?.kind === kind),
    step(dt = 0.1) { state.simTime += dt; state.tick++; tickMachineLayer(world, dt); },
    seconds(seconds) { for (let i = 0; i < seconds * 10; i++) this.step(); },
    playerAt(pos) {
      const e = { id: 1, alive: true, occupantGeneration: 1, pos: { ...pos }, vel: { x: 0, z: 0 }, radius: 10 };
      state.entities.set(1, e); return e;
    } };
}

test('B141-R fast loose route mail is refused, recoverable and accepted only after slowing', () => {
  const f = fixture('sector_io_reach'); f.step();
  const rec = ensureAlienEcologyState(f.state).machineSites.io_listening_field;
  const token = rec.courierToken, pod = f.state.entityList.find(e => e.data?.machineToken);
  token.readyAt = 0;
  pod.pos = { ...token.destPos }; pod.vel = { x: 100, z: 0 };
  f.step(); assert.equal(token.status, 'loose');
  f.step();
  assert.equal(token.status, 'loose'); assert.equal(pod.alive, true);
  assert.equal(rec.courierReceiver.stored, 0);
  assert.ok(f.events.some(e => e.payload?.text?.includes('TOO FAST FOR THE INTAKE')));
  pod.vel.x = 21; f.step();
  assert.equal(token.status, 'delivered'); assert.equal(rec.courierReceiver.stored, 1);
  f.seconds(3);
  assert.equal(f.events.filter(e => e.name === 'machine:tokenDelivered').length, 1);
});

test('B141-R held mail remains in the hold when the returning hull outruns the intake', () => {
  const f = fixture('sector_io_reach'); f.step();
  const token = ensureAlienEcologyState(f.state).machineSites.io_listening_field.courierToken;
  const pod = f.state.entityList.find(e => e.data?.machineToken);
  addCargo(f.state, 'cmdty_gate_handshake', 1);
  assert.equal(handleMachinePickupCollected(f.world, { pickupId: pod.id, collectorId: 1, amount: 1, acceptedAmount: 1 }), true);
  pod.alive = false;
  const player = f.playerAt(token.destPos); player.vel.x = 90;
  f.step(); assert.equal(token.status, 'intercepted');
  assert.equal(f.state.player.cargo.items.cmdty_gate_handshake, 1);
  player.vel.x = 0; f.step(); assert.equal(token.status, 'delivered');
  assert.equal(f.state.player.cargo.items.cmdty_gate_handshake || 0, 0);
});

test('B145 native foundry waits on actual mail, repairs with finite charges, then exposes its physical choice', () => {
  const f = fixture('sector_pallas_drift');
  f.seconds(100);
  let rec = ensureAlienEcologyState(f.state).machineSites.pallas_empty_foundry;
  assert.equal(rec.workCycle.status, 'awaiting_mail');
  assert.equal(rec.maintenance.material, 3);
  assert.equal(f.state.entityList.some(e => e.data?.machineWorkpiece), false);
  f.seconds(160);
  rec = ensureAlienEcologyState(f.state).machineSites.pallas_empty_foundry;
  assert.equal(rec.courierToken.status, 'delivered');
  assert.equal(rec.courierReceiver.acceptedReceipts[rec.courierToken.receiptId], 1);
  assert.equal(rec.maintenance.completed, true); assert.equal(rec.maintenance.material, 0);
  assert.equal(rec.maintenance.integrity, 1);
  assert.equal(rec.workCycle.status, 'jurisdiction');
  const body = f.state.entityList.find(e => e.data?.machineWorkpiece);
  assert.equal(body.alive, true); assert.equal(consumePhysicsCommand(body), null, 'neither procedure pulls during the disagreement');
  assert.equal(f.events.filter(e => e.name === 'machine:repairCompleted').length, 1);
});

test('B145 intercepted mail keeps repair waiting; a real late return resumes the single work history', () => {
  const f = fixture('sector_pallas_drift'); f.step();
  let rec = ensureAlienEcologyState(f.state).machineSites.pallas_empty_foundry;
  const pod = f.state.entityList.find(e => e.data?.machineToken);
  addCargo(f.state, 'cmdty_gate_handshake', 1);
  assert.equal(handleMachinePickupCollected(f.world, { pickupId: pod.id, collectorId: 1, amount: 1, acceptedAmount: 1 }), true); pod.alive = false;
  f.seconds(180);
  assert.equal(rec.maintenance.material, 3); assert.equal(rec.workCycle.status, 'awaiting_mail');
  f.playerAt(rec.courierToken.destPos); f.step();
  assert.equal(rec.courierToken.status, 'delivered');
  f.seconds(40);
  assert.ok(rec.maintenance.material < 3 && rec.maintenance.material > 0);
  const progress = rec.maintenance.work, material = rec.maintenance.material;
  const saved = serializeAlienEcologyState(f.state);
  deserializeAlienEcologyState(f.state, saved);
  rec = ensureAlienEcologyState(f.state).machineSites.pallas_empty_foundry;
  assert.equal(rec.maintenance.work, progress); assert.equal(rec.maintenance.material, material);
  f.seconds(40);
  assert.equal(rec.maintenance.completed, true); assert.equal(rec.courierReceiver.stored, 1);
  assert.equal(f.events.filter(e => e.name === 'machine:repairCompleted').length, 1);
});

function readyFoundry() {
  const f = fixture('sector_pallas_drift'); f.seconds(260);
  const rec = ensureAlienEcologyState(f.state).machineSites.pallas_empty_foundry;
  const body = f.state.entityList.find(e => e.alive !== false && e.data?.machineWorkpiece);
  assert.ok(body); return { f, rec, body, site: MACHINE_SITES.pallas_empty_foundry };
}

test('B148 one ballast can enter preservation with spent repair charges and no tug or softlock', () => {
  const { f, rec, body, site } = readyFoundry();
  body.pos = { x: site.center.x + site.workCycle.preserveDx, z: site.center.z };
  body.vel.x = 30; f.seconds(4);
  assert.equal(rec.jurisdiction.status, 'waiting', 'fast crossings do not settle custody');
  body.vel.x = 0; f.seconds(4);
  assert.equal(rec.jurisdiction.choice, 'preservation'); assert.equal(rec.jurisdiction.status, 'resolved');
  assert.equal(rec.workCycle.commissioned, false); assert.equal(rec.maintenance.material, 0);
  assert.equal(body.alive, true); assert.equal(consumePhysicsCommand(body), null);
  const saved = serializeAlienEcologyState(f.state); deserializeAlienEcologyState(f.state, saved);
  f.seconds(5);
  assert.equal(f.events.filter(e => e.name === 'machine:jurisdictionResolved').length, 1);
  assert.equal(f.events.filter(e => e.name === 'machine:repairCompleted').length, 1);
});

test('B148 east custody releases the Mason field, commissions once and persists the chosen body', () => {
  const { f, rec, body, site } = readyFoundry();
  body.pos = { x: site.center.x + site.workCycle.cradleDx, z: site.center.z };
  f.seconds(8);
  assert.equal(rec.jurisdiction.choice, 'construction'); assert.equal(rec.jurisdiction.status, 'resolved');
  assert.equal(rec.masonry.status, 'placed'); assert.equal(rec.workCycle.commissioned, true);
  consumePhysicsCommand(body); f.seconds(2); assert.equal(consumePhysicsCommand(body), null);
  assert.equal(f.events.filter(e => e.name === 'machine:workpiecePlaced').length, 1);
  const saved = serializeAlienEcologyState(f.state);
  deserializeAlienEcologyState(f.state, saved); f.seconds(5);
  assert.equal(f.state.entityList.filter(e => e.alive !== false && e.data?.machineWorkpiece).length, 1);
  assert.equal(f.events.filter(e => e.name === 'machine:workpiecePlaced').length, 1);
});

test('B148 native entity save retains the actual foundry ballast pose and unsettled momentum', () => {
  const { f, rec, body, site } = readyFoundry();
  body.pos = { x: site.center.x + site.workCycle.preserveDx, z: site.center.z };
  f.seconds(1);
  assert.equal(rec.jurisdiction.status, 'waiting');
  body.pos.x += 7; body.vel.x = 12;
  const ecology = serializeAlienEcologyState(f.state);
  const entities = save._serializeEntities.call({ state: f.state });
  const savedBody = entities.persistent.find(e => e.data?.machineWorkpiece === site.siteId);
  assert.ok(savedBody, 'the native entity envelope must carry the unique physical body');
  assert.equal(savedBody.pos.x, body.pos.x); assert.equal(savedBody.vel.x, 12);
  const fresh = fixture(site.sectorId);
  deserializeAlienEcologyState(fresh.state, ecology);
  const restored = fresh.world.helpers.spawnEntity(savedBody);
  fresh.seconds(4);
  const restoredRec = ensureAlienEcologyState(fresh.state).machineSites[site.siteId];
  assert.equal(restoredRec.jurisdiction.status, 'waiting', 'moving saved ballast cannot complete a calm custody decision');
  assert.equal(fresh.state.entityList.filter(e => e.alive !== false && e.data?.machineWorkpiece === site.siteId).length, 1);
  assert.equal(restoredRec.masonry.pos.x, restored.pos.x);
});

test('B147 unrelated lore and routine witness holds cannot clear a contaminated manifest incident', () => {
  const f = fixture('sector_veil_nebula');
  f.playerAt(MACHINE_SITES.veil_exception_chamber.center);
  const ae = ensureAlienEcologyState(f.state); ae.machineProtocol = 'revoked';
  ae.evidence = { L09: true, L10: true, P10: true, P99: false };
  addCargo(f.state, 'cmdty_spore_catalyst', 2);
  f.seconds(14);
  const rec = ae.machineSites.veil_exception_chamber;
  assert.equal(ae.machineProtocol, 'revoked'); assert.equal(rec.exceptionMinted, undefined);
  assert.equal(f.state.player.cargo.items.cmdty_unbroken_lens || 0, 0);
  assert.ok(rec.enforcement); assert.equal(rec.appeal.hold, 0);
  assert.ok(f.events.some(e => /ISOLATE THE FLAGGED LOTS/.test(e.payload?.text || '')));
  removeCargo(f.state, 'cmdty_spore_catalyst', 2, 'jettison');
  f.seconds(13);
  assert.equal(ae.machineProtocol, 'exception'); assert.equal(rec.appeal.status, 'accepted');
  assert.deepEqual(rec.appeal.comparison.classifiedManifest, { cmdty_spore_catalyst: 2 });
  assert.equal(rec.appeal.comparison.observedLots, 0);
  assert.equal(rec.appeal.comparison.siteId, 'veil_exception_chamber');
  assert.equal(f.state.player.cargo.items.cmdty_unbroken_lens, 1);
  assert.equal(rec.enforcement.status, 'appealed');
  f.seconds(70);
  assert.equal(f.events.filter(e => e.name === 'machine:appealAccepted').length, 1);
});

test('B147 a different owned hull or a moving comparison cannot overturn the named incident', () => {
  const f = fixture('sector_veil_nebula'); const player = f.playerAt(MACHINE_SITES.veil_exception_chamber.center);
  const ae = ensureAlienEcologyState(f.state); ae.machineProtocol = 'violation';
  f.step(); f.state.player.ownedShips.push({ defId: 'ship_hornet' }); f.state.player.activeShipIndex = 1;
  f.seconds(30); assert.equal(ae.machineProtocol, 'violation');
  f.state.player.activeShipIndex = 0; player.vel.x = 9;
  f.seconds(13); assert.equal(ae.machineProtocol, 'violation');
  player.vel.x = 0; f.seconds(13); assert.equal(ae.machineProtocol, 'exception');
});

test('B149-R Continue and new Executor bodies retain remaining grace, scope and the incident resolution', () => {
  const f = fixture('sector_veil_nebula');
  const executor = f.machine('executor');
  const player = f.playerAt({ x: executor.pos.x + 100, z: executor.pos.z }); player.vel.x = 9;
  ensureAlienEcologyState(f.state).machineProtocol = 'revoked';
  addCargo(f.state, 'cmdty_spore_catalyst', 2); addCargo(f.state, 'cmdty_alloys', 3);
  f.seconds(45);
  const saved = serializeAlienEcologyState(f.state);
  const incidentId = saved.machineSites.veil_exception_chamber.enforcement.id;
  const fresh = fixture('sector_veil_nebula');
  deserializeAlienEcologyState(fresh.state, saved); fresh.state.simTime = f.state.simTime;
  const frame = fresh.machine('executor');
  const live = fresh.playerAt({ x: frame.pos.x + 100, z: frame.pos.z }); live.vel.x = 9;
  addCargo(fresh.state, 'cmdty_spore_catalyst', 2); addCargo(fresh.state, 'cmdty_alloys', 3);
  fresh.seconds(14); assert.equal(fresh.state.player.cargo.items.cmdty_spore_catalyst, 2);
  fresh.seconds(2); assert.equal(fresh.state.player.cargo.items.cmdty_spore_catalyst || 0, 0);
  assert.equal(fresh.state.player.cargo.items.cmdty_alloys, 3);
  const rec = ensureAlienEcologyState(fresh.state).machineSites.veil_exception_chamber;
  assert.equal(rec.enforcement.id, incidentId); assert.equal(rec.enforcement.status, 'purged');
  assert.equal(rec.lastEnforcement.incidentId, incidentId);
  fresh.seconds(65);
  assert.equal(fresh.events.filter(e => e.name === 'ecology:quarantinePulse').length, 1);
});
