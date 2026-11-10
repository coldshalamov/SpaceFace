import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';

// Owner-boundary fixture, intentionally without movement/combat execution. Native counterpart
// below proves the real flight and repair. These tests never infer repair from an emitted command.
function fixture() {
  const sim = createSimulation({ seed: 4242, systems: [npcJobsRuntime] });
  const state = sim.state, rt = sim.registry.get('npcJobsRuntime');
  state.mode = 'flight'; state.world.currentSectorId = 'sector_helios_prime';
  const player = sim.spawn({ type: 'ship', team: 0, pos: { x: 1000, z: 0 } });
  state.playerId = player.id;
  const spawn = (id, x, kind) => {
    const e = sim.spawn({ type: 'ship', team: 2, pos: { x, z: 0 }, radius: 8, mass: 10,
      hull: 100, hullMax: 100, data: { worldRecordId: id } });
    rt.assign(e, { kind, sectorId: state.world.currentSectorId,
      route: [{ id: 'berth', pos: { x: 500, z: 0 } }, { id: 'client', pos: { x: 0, z: 0 } }] });
    return e;
  };
  const tender = spawn('tender', 100, 'tender'), casualty = spawn('casualty', 0, 'miner');
  state.combat = { entities: {} };
  const setDrive = (e, down) => { state.combat.entities[e.id] = { subsystems: {
    subsystem_drive: { destroyed: down, effectiveDisabled: down }
  } }; };
  const disable = e => { setDrive(e, true); sim.bus.emit('combat:subsystemDisabled', {
    targetId: e.id, subsystemId: 'subsystem_drive' }); };
  const stages = [], commands = [];
  sim.bus.on('npcjobs:crewResponse', p => stages.push(p));
  sim.bus.on('combat:repairSubsystem', p => commands.push(p));
  const step = seconds => { for (let i = 0; i < seconds * 60; i++) sim.step(1 / 60); };
  return { sim, state, rt, tender, casualty, spawn, setDrive, disable, stages, commands, step };
}

test('an unconfirmed weld never reports a repaired drive or advances its shift', () => {
  const f = fixture(); f.disable(f.casualty); f.step(20);
  assert.equal(f.commands.length, 1);
  assert.ok(f.stages.some(p => p.stage === 'repair_unconfirmed'));
  assert.equal(f.stages.some(p => p.stage === 'repaired'), false);
  assert.equal(f.rt._entryForEntity(f.casualty.id).job.phase, 'flee');
  assert.equal(f.rt._entryForEntity(f.casualty.id).job.progress, 0);
  assert.equal(f.rt._crewDriveState(f.casualty.id), true);
});

test('mid-weld restore drops old leases then reconstructs one request from current combat truth', () => {
  const f = fixture(); f.disable(f.casualty); f.step(1);
  const old = f.rt._crewResponse, data = f.rt.serialize();
  f.rt.deserialize(JSON.parse(JSON.stringify(data)));
  assert.equal(f.rt._crewResponse, null);
  f.sim.bus.emit('save:loaded', {}); f.step(1);
  const current = f.rt._crewResponse;
  assert.ok(current); assert.notEqual(current, old);
  assert.equal(current.casualtyRef, f.casualty);
  assert.equal(f.rt.activeControlClaimCount(), 1);
  assert.equal(f.stages.filter(p => p.stage === 'dispatched').length, 2);
  assert.equal(f.stages.some(p => p.stage === 'repaired'), false);
});

test('healthy restored worker needs no truck, and unknown/enabled event alone is not proof', () => {
  const f = fixture(); f.disable(f.casualty); f.step(1);
  f.sim.bus.emit('combat:subsystemEnabled', { targetId: f.casualty.id, subsystemId: 'subsystem_drive' });
  assert.ok(f.rt._crewResponse, 'disabled combat owner defeats forged enabled event');
  delete f.state.combat.entities[f.casualty.id];
  f.sim.bus.emit('combat:subsystemEnabled', { targetId: f.casualty.id, subsystemId: 'subsystem_drive' });
  assert.ok(f.rt._crewResponse, 'unknown is not healthy');
  f.setDrive(f.casualty, false);
  const data = f.rt.serialize(); f.rt.deserialize(data); f.sim.bus.emit('save:loaded', {}); f.step(6);
  assert.equal(f.rt._crewResponse, null);
  assert.equal(f.stages.filter(p => p.stage === 'dispatched').length, 1);
});

test('a recycled casualty identity cannot receive or acknowledge the former hull repair', () => {
  const f = fixture(); f.disable(f.casualty); f.step(1);
  const replacement = { ...f.casualty, occupantGeneration: f.casualty.occupantGeneration + 1,
    data: { ...f.casualty.data, worldRecordId: 'replacement' } };
  f.state.entities.set(replacement.id, replacement); f.setDrive(replacement, false);
  f.sim.bus.emit('combat:subsystemEnabled', { targetId: replacement.id, subsystemId: 'subsystem_drive' });
  assert.ok(f.rt._crewResponse);
  f.step(1);
  assert.ok(f.stages.some(p => p.stage === 'casualty_lost'));
  assert.equal(f.commands.length, 0);
  assert.equal(f.stages.some(p => p.stage === 'repaired'), false);
});

test('an unreachable disabled crew does not starve another crew the tender can reach', () => {
  const f = fixture(); const far = f.spawn('aaa-far-casualty', 10000, 'hauler');
  f.setDrive(far, true); f.setDrive(f.casualty, true); f.step(1);
  assert.equal(f.rt._crewResponse.casualtyEntityId, f.casualty.id);
  assert.equal(f.rt.activeControlClaimCount(), 1);
});

test('a disabled tender cannot take the next crew response', () => {
  const f = fixture(); f.setDrive(f.tender, true); f.disable(f.casualty); f.step(6);
  assert.equal(f.rt._crewResponse, null); assert.equal(f.rt.activeControlClaimCount(), 0);
});

test('a synchronous repair acknowledgment remains ordered and releases the exact lease once', () => {
  const f = fixture(); f.sim.bus.on('combat:repairSubsystem', p => {
    f.setDrive(f.casualty, false);
    f.sim.bus.emit('combat:subsystemEnabled', { targetId: p.entityId, subsystemId: p.subsystemId });
  });
  f.disable(f.casualty); f.step(8);
  assert.deepEqual(f.stages.map(p => p.stage), ['dispatched', 'welding', 'welded', 'repaired']);
  assert.equal(f.rt.activeControlClaimCount(), 0); assert.equal(f.commands.length, 1);
});


test('welding requires continuous eligible proximity, not elapsed time away', () => {
  const f = fixture(); f.disable(f.casualty); f.step(1);
  f.tender.pos.x = 500; f.step(10);
  f.tender.pos.x = 100; f.step(1);
  assert.equal(f.commands.length, 0);
  f.step(6); assert.equal(f.commands.length, 1);
});

test('an unconfirmed weld times out even if the tender separates', () => {
  const f = fixture(); f.disable(f.casualty); f.step(7);
  assert.equal(f.commands.length, 1);
  f.tender.pos.x = 500; f.step(11);
  assert.ok(f.stages.some(p => p.stage === 'repair_unconfirmed'));
  assert.equal(f.rt._crewResponse, null);
  assert.equal(f.stages.some(p => p.stage === 'repaired'), false);
});

test('crew flight ownership follows exact lives and yields another casualty controller', () => {
  const f = fixture(); f.disable(f.casualty); f.step(1);
  assert.equal(f.rt._crewResponseOwnsFlight(f.tender), true);
  assert.equal(f.rt._crewResponseOwnsFlight(f.casualty), true);
  assert.equal(f.rt._crewResponseOwnsFlight({ ...f.tender }), false);
  const entry = f.rt._entryForEntity(f.casualty.id);
  assert.equal(f.rt.claimControl(entry.job.id, { claimId: 'other', holder: 'other' }).granted, true);
  assert.equal(f.rt._crewResponseOwnsFlight(f.casualty), false);
  f.step(8);
  assert.equal(f.commands.length, 0);
  assert.equal(f.rt._crewResponse, null);
  assert.equal(entry.control.claimId, 'other');
  assert.equal(f.rt._crewResponseOwnsFlight(f.tender), false);
  assert.ok(f.stages.some(p => p.stage === 'ownership_lost' && p.via === 'casualty_claimed'));
  assert.equal(f.stages.some(p => p.stage === 'casualty_lost'), false);
});

test('a weld observer cannot redirect a repair command to a replacement numeric occupant', () => {
  const f = fixture();
  f.sim.bus.on('npcjobs:crewResponse', p => {
    if (p.stage === 'welded') f.state.entities.set(f.casualty.id,
      { ...f.casualty, occupantGeneration: f.casualty.occupantGeneration + 1 });
  });
  f.disable(f.casualty); f.step(8);
  assert.equal(f.commands.length, 0);
  assert.equal(f.rt._crewResponse, null);
});

test('durable worker combat references reject ambiguous, reassigned and finite-site identities', async () => {
  const { resolveWorldJobCombatRef } = await import('../src/combat/persistence.js');
  const f = fixture(), e = f.casualty, entry = f.rt._entryForEntity(e.id);
  const ref = { kind: 'worldJob', recordId: e.data.worldRecordId, jobId: entry.job.id,
    sectorId: entry.sectorId, shipDefId: 'ship_ranger' };
  e.data.defId = ref.shipDefId; e.data.sectorId = ref.sectorId;
  f.state.world.records = { byId: { [ref.recordId]: { recordId: ref.recordId,
    jobId: ref.jobId, sectorId: ref.sectorId, shipDefId: ref.shipDefId, type: 'ship',
    alive: true, hull: 100, outcome: 'active' } } };
  const incoming = JSON.parse(JSON.stringify(f.rt.serialize()));
  assert.equal(resolveWorldJobCombatRef(f.state, ref, incoming), e.id);
  const duplicate = { ...e, id: 9001, data: { ...e.data } };
  f.state.entities.set(duplicate.id, duplicate);
  assert.equal(resolveWorldJobCombatRef(f.state, ref, incoming), null);
  f.state.entities.delete(duplicate.id);
  for (const [field, value] of [['jobId', 'other'], ['sectorId', 'other'], ['defId', 'ship_kestrel'],
    ['worldSiteId', 'finite-site'], ['persistenceOwner', 'asteroidSites']]) {
    const old = e.data[field]; e.data[field] = value;
    assert.equal(resolveWorldJobCombatRef(f.state, ref, incoming), null, field);
    if (old === undefined) delete e.data[field]; else e.data[field] = old;
  }
  f.state.entities.set(e.id, { ...e, id: 9002 });
  f.state.entities.set(9002, { id: 9002, alive: true, data: { worldRecordId: 'unrelated' } });
  assert.equal(resolveWorldJobCombatRef(f.state, ref, incoming), null, 'map key is not a different occupant id');
  f.state.entities.set(e.id, e); f.state.entities.delete(9002);
  f.state.world.records.byId[ref.recordId].outcome = 'destroyed';
  assert.equal(resolveWorldJobCombatRef(f.state, ref, incoming), null);
});
