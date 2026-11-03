import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { traffic } from '../src/systems/traffic.js';
import { survivorPod, shouldEjectCausalSurvivorPod } from '../src/systems/survivorPod.js';

function boot({ carrierId = 11, generation = 3, withoutPod = false } = {}) {
  const bus = createBus(); const events = [];
  const carrier = { id: carrierId, occupantGeneration: generation, type: 'ship', alive: true,
    pos: { x: 200, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 12, hull: 100, hullMax: 100,
    flags: {}, data: { trafficRole: 'rescue', worldRecordId: 'rescue:one' } };
  const station = { id: 40, type: 'station', alive: true, pos: { x: 0, z: 0 }, data: { stationId: 'station_test' } };
  const pod = { id: 51, occupantGeneration: 5, type: 'payload', alive: true, pos: { x: 205, z: 0 },
    vel: { x: 0, z: 0 }, radius: 5, mass: 24, hull: 40, hullMax: 40, flags: { persistent: true },
    data: { payloadType: 'survivor_pod', survivorPodCausal: { entityId: 51, victimId: 9,
      sectorId: 'sector_test', factionId: 'faction_scn', memoryId: 'survivor:9',
      phase: 'adrift', expireAt: 100, ejectedAt: 1 } } };
  const rec = { id: carrierId, role: 'rescue', targetId: 40, carryingSurvivor: false };
  const list = withoutPod ? [carrier, station] : [carrier, station, pod];
  const state = { mode: 'flight', simTime: 12, tick: 1, nextEntityId: 500, playerId: 1,
    meta: { seed: 7 }, entities: new Map(list.map(e => [e.id, e])), entityList: list,
    world: { currentSectorId: 'sector_test' }, traffic: { freighters: [rec] },
    player: { tether: { active: false, targetId: null } }, ui: {}, story: { flags: {} } };
  const helpers = {};
  const owner = { ...traffic, state, bus, helpers, _sectorStations: () => [station], _pickStation: () => station };
  bus.on('survivorPod:boarded', e => owner._onSurvivorPodRescued(e));
  const sys = { ...survivorPod }; sys.init({ state, bus, helpers });
  for (const name of ['survivorPod:boarded','survivorPod:rescued','survivorPod:delivered','economy:grantCredits','faction:repDelta']) {
    bus.on(name, payload => events.push({ name, payload }));
  }
  return { bus, state, carrier, station, pod, rec, owner, sys, events };
}
const count = (h, name) => h.events.filter(e => e.name === name).length;

test('lifter pickup is custody; only physical station arrival settles once', () => {
  const h = boot();
  h.sys.update(.1, h.state);
  assert.equal(count(h, 'survivorPod:boarded'), 1);
  assert.equal(count(h, 'survivorPod:rescued'), 0);
  assert.equal(count(h, 'economy:grantCredits'), 0);
  assert.equal(h.rec.carryingSurvivor, true);
  assert.equal(h.state.entities.has(h.pod.id), false);
  h.owner._stepRescue(h.carrier, h.rec, [h.station], h.state, .1);
  assert.equal(count(h, 'survivorPod:delivered'), 0);
  h.carrier.pos.x = 10;
  h.owner._stepRescue(h.carrier, h.rec, [h.station], h.state, .1);
  assert.equal(count(h, 'survivorPod:delivered'), 1);
  assert.equal(count(h, 'survivorPod:rescued'), 1);
  assert.equal(count(h, 'economy:grantCredits'), 0);
  assert.equal(h.state.survivorPod.causal.receipts.filter(r => r.id === 'survivor:9' && r.outcome === 'rescued').length, 1);
  h.owner._stepRescue(h.carrier, h.rec, [h.station], h.state, .1);
  assert.equal(count(h, 'survivorPod:rescued'), 1);
  h.sys.destroy();
});

test('Continue rebinds a passenger to the same durable lifter after entity ID changes', () => {
  const a = boot(); a.sys.update(.1, a.state);
  const snapshot = JSON.parse(JSON.stringify(a.sys.serialize())); a.sys.destroy();
  const b = boot({ carrierId: 111, generation: 22, withoutPod: true });
  b.sys.deserialize(snapshot); b.bus.emit('save:loaded', {}); b.sys.update(.1, b.state);
  assert.equal(b.rec.carryingSurvivor, true);
  assert.equal(count(b, 'survivorPod:rescued'), 0);
  b.carrier.pos.x = 10; b.owner._stepRescue(b.carrier, b.rec, [b.station], b.state, .1);
  assert.equal(count(b, 'survivorPod:rescued'), 1);
  b.sys.destroy();
});

test('disabled or destroyed lifter releases the same survivor as a real pod without a payout', () => {
  for (const loss of ['disabled','killed']) {
    const h = boot(); h.sys.update(.1, h.state);
    if (loss === 'disabled') { h.carrier.data.disabled = true; h.sys.update(.1, h.state); }
    else { h.carrier.alive = false; h.bus.emit('entity:killed', { id: h.carrier.id, type: 'ship',
      data: h.carrier.data, pos: h.carrier.pos, vel: h.carrier.vel }); h.sys.update(.1, h.state); }
    const returned = h.state.entityList.filter(e => e.alive !== false && e.data?.survivorPodCausal?.memoryId === 'survivor:9');
    assert.equal(returned.length, 1, loss);
    assert.equal(returned[0].type, 'payload');
    assert.equal(count(h, 'survivorPod:rescued'), 0);
    assert.equal(count(h, 'economy:grantCredits'), 0);
    h.sys.update(.1, h.state);
    assert.equal(h.state.entityList.filter(e => e.alive !== false && e.data?.survivorPodCausal?.memoryId === 'survivor:9').length, 1);
    h.sys.destroy();
  }
});

test('new rescue hulls do not get tender jobs; existing leased or unrelated jobs are untouched', () => {
  const h = boot(); let assigned = 0, released = 0;
  const job = { entityId: h.carrier.id, worldRecordId: 'rescue:one',
    job: { kind: 'tender', route: [{ id: 'berth:a' }, { id: 'client:b' }] } };
  let claim = { holder: 'other' };
  h.owner.helpers = { npcJobs: { assign: () => { assigned++; }, get: () => job,
    controlClaim: () => claim, release: () => { released++; delete h.carrier.data.jobId; return true; } } };
  h.owner._maybeAssignJob(h.carrier, 'rescue', h.station, h.station, [h.station], 'sector_test');
  assert.equal(assigned, 0);
  h.carrier.data.jobId = 'old';
  h.owner._releaseLegacyRescueJob(h.carrier, h.rec);
  assert.equal(released, 0);
  claim = null; job.entityId = 999;
  h.owner._releaseLegacyRescueJob(h.carrier, h.rec);
  assert.equal(released, 0);
  job.entityId = h.carrier.id;
  h.owner._releaseLegacyRescueJob(h.carrier, h.rec);
  assert.equal(released, 1);
  h.sys.destroy();
});

test('player handoff pays only once after the carrying lifter actually reaches the station', () => {
  const h = boot();
  const player = { id: 1, type: 'ship', alive: true, pos: { x: 200, z: 0 }, data: {} };
  h.state.entities.set(1, player); h.state.entityList.push(player);
  h.state.player.tether = { active: true, targetId: h.pod.id };
  h.sys.update(.1, h.state);
  assert.equal(count(h, 'survivorPod:boarded'), 1);
  assert.equal(count(h, 'economy:grantCredits'), 0);
  assert.equal(count(h, 'faction:repDelta'), 0);
  h.carrier.pos.x = 10;
  h.owner._stepRescue(h.carrier, h.rec, [h.station], h.state, .1);
  assert.equal(count(h, 'economy:grantCredits'), 1);
  assert.equal(count(h, 'survivorPod:rescued'), 1);
  h.owner._stepRescue(h.carrier, h.rec, [h.station], h.state, .1);
  assert.equal(count(h, 'economy:grantCredits'), 1);
  h.sys.destroy();
});

test('a hard sector departure retains the passenger and returns the same person on re-entry', () => {
  const h = boot(); h.sys.update(.1, h.state);
  h.bus.emit('sector:exit', { sectorId: 'sector_test' });
  h.state.entities.delete(h.carrier.id);
  h.state.entityList.splice(h.state.entityList.indexOf(h.carrier), 1);
  h.state.world.currentSectorId = 'sector_other'; h.sys.update(.1, h.state);
  assert.equal(count(h, 'survivorPod:rescued'), 0);
  assert.equal(h.state.entityList.filter(e => e.data?.survivorPodCausal?.memoryId === 'survivor:9').length, 0);
  h.state.world.currentSectorId = 'sector_test';
  h.bus.emit('sector:enter', { sectorId: 'sector_test' });
  const pods = h.state.entityList.filter(e => e.alive !== false && e.data?.survivorPodCausal?.memoryId === 'survivor:9');
  assert.equal(pods.length, 1);
  assert.equal(pods[0].type, 'payload');
  assert.equal(count(h, 'economy:grantCredits'), 0);
  h.sys.destroy();
});

test('a refused pod retirement cannot create passenger custody or payment', () => {
  const h = boot(); h.sys.helpers.removeEntity = () => false;
  h.sys.update(.1, h.state);
  assert.equal(h.state.entities.get(h.pod.id), h.pod);
  assert.equal(count(h, 'survivorPod:boarded'), 0);
  assert.equal(count(h, 'survivorPod:rescued'), 0);
  assert.equal(h.state.survivorPod.causal.receipts.some(r => r.outcome === 'in_transit'), false);
  h.sys.destroy();
});

test('real npcJobs owner releases only a rescue lifter’s legacy tender job', async () => {
  const { createSimulation } = await import('../src/core/sim.js');
  const { npcJobsRuntime } = await import('../src/systems/npcJobsRuntime.js');
  const sim = createSimulation({ seed: 47, systems: [traffic, npcJobsRuntime] });
  try {
    const state = sim.state; state.mode = 'flight'; state.world.currentSectorId = 'sector_test';
    const hull = sim.spawn({ type: 'ship', hull: 100, hullMax: 100, pos: { x: 10, z: 0 },
      data: { trafficRole: 'rescue', worldRecordId: 'rescue:legacy' } });
    const id = sim.helpers.npcJobs.assign(hull, { kind: 'tender', sectorId: 'sector_test', route: [
      { id: 'berth:a', pos: { x: 0, z: 0 } }, { id: 'client:b', pos: { x: 100, z: 0 } },
    ] });
    assert.ok(id);
    const owner = sim.registry.get('traffic');
    assert.equal(owner._releaseLegacyRescueJob(hull, { id: hull.id, role: 'rescue' }), true);
    assert.equal(hull.data.jobId, undefined);
    assert.equal(sim.helpers.npcJobs.get(id), null);
  } finally { sim.dispose(); }
});

test('real save envelope preserves the passenger when the transient lifter is absent on Continue', async () => {
  const { createSimulation } = await import('../src/core/sim.js');
  const { world } = await import('../src/systems/world.js');
  const { save } = await import('../src/save/saveSystem.js');
  const sim = createSimulation({ seed: 47, systems: [{ ...world, update() {} }, survivorPod, { ...traffic, update() {} }, save] });
  try {
    const s = sim.state; s.mode = 'flight'; s.world.currentSectorId = 'sector_helios_prime';
    const player = sim.spawn({ type: 'ship', hull: 100, hullMax: 100, team: 0, pos: { x: 0, z: 0 } }); s.playerId = player.id;
    const station = sim.spawn({ type: 'station', hull: 1000, pos: { x: 0, z: 0 }, radius: 40, data: { stationId: 'station_helios' } });
    const hull = sim.spawn({ type: 'ship', hull: 100, hullMax: 100, pos: { x: 200, z: 0 },
      data: { trafficRole: 'rescue', worldRecordId: 'test:save-lifter' } });
    const pod = sim.spawn({ type: 'payload', hull: 40, hullMax: 40, radius: 5, mass: 24, pos: { x: 205, z: 0 },
      flags: { persistent: true }, data: { payloadType: 'survivor_pod', survivorPodCausal: {
        victimId: 9, sectorId: 'sector_helios_prime', factionId: 'faction_scn', memoryId: 'save:person',
        phase: 'adrift', expireAt: 200, ejectedAt: 1 } } });
    s.traffic.freighters.push({ id: hull.id, role: 'rescue', targetId: station.id });
    sim.registry.get('survivorPod').update(.1, s);
    assert.equal(s.entities.has(pod.id), false);
    const saver = sim.registry.get('save');
    const env = JSON.parse(JSON.stringify(saver.serialize('rescue-custody'))); delete env.checksum;
    assert.ok(env.data.survivorPod.causalReceipts.some(r => r.id === 'save:person' && r.outcome === 'in_transit'));
    assert.equal(saver.loadEnvelope(env), true);
    const sys = sim.registry.get('survivorPod'); sys.update(.1, s);
    const pending = s.survivorPod.causal.receipts.filter(r => r.id === 'save:person' && r.outcome === 'in_transit');
    const bodies = s.entityList.filter(e => e.alive !== false && e.data?.survivorPodCausal?.memoryId === 'save:person');
    assert.equal(pending.length, 0, 'the absent transient carrier is not invented');
    assert.equal(bodies.length, 1, 'the same survivor returns as one physical pod');
    assert.equal(s.survivorPod.causal.receipts.some(r => r.id === 'save:person' && r.outcome === 'rescued'), false);
    const second = JSON.parse(JSON.stringify(saver.serialize('rescue-adrift-again'))); delete second.checksum;
    assert.equal(saver.loadEnvelope(second), true); sys.update(.1, s);
    assert.equal(s.entityList.filter(e => e.alive !== false && e.data?.survivorPodCausal?.memoryId === 'save:person').length, 1,
      'a second Continue retains exactly one recovered pod');
  } finally { sim.dispose(); }
});

test('an actual survivor pickup leaves a real finite wreck available to the existing salvor dispatcher', async () => {
  const { createSimulation } = await import('../src/core/sim.js');
  const { npcJobsRuntime } = await import('../src/systems/npcJobsRuntime.js');
  const sim = createSimulation({ seed: 47, systems: [survivorPod, { ...traffic, update() {} }, npcJobsRuntime] });
  try {
    const s = sim.state; s.mode = 'flight'; s.simTime = 90; s.world.currentSectorId = 'sector_helios_prime';
    s.settings.gameplay.physicsBackend = 'custom';
    const station = sim.spawn({ type: 'station', hull: 1000, radius: 40, pos: { x: 0, z: 0 }, data: { stationId: 'station_helios' } });
    const lifter = sim.spawn({ type: 'ship', hull: 100, hullMax: 100, pos: { x: 220, z: 0 },
      data: { trafficRole: 'rescue', worldRecordId: 'rescue:cleanup' } });
    const rec = { id: lifter.id, role: 'rescue', targetId: station.id }; s.traffic.freighters.push(rec);
    const pod = sim.spawn({ type: 'payload', hull: 40, hullMax: 40, pos: { x: 225, z: 0 }, radius: 5, mass: 24,
      flags: { persistent: true }, data: { payloadType: 'survivor_pod', survivorPodCausal: {
        victimId: 99, sectorId: 'sector_helios_prime', factionId: 'faction_scn', memoryId: 'cleanup:person',
        phase: 'adrift', expireAt: 240, ejectedAt: 80 } } });
    const wreck = sim.spawn({ type: 'wreck', hull: 20, hullMax: 20, pos: { x: 350, z: 20 }, radius: 12, mass: 80,
      data: { salvagePool: { cmdty_scrap_metal: 5 }, salvorNoticeAt: 0, spillNoticed: true } });
    sim.registry.get('survivorPod').update(.1, s);
    assert.equal(s.entities.has(pod.id), false); assert.equal(rec.carryingSurvivor, true);
    const owner = sim.registry.get('traffic');
    assert.equal(owner._dispatchGeneralSalvors('sector_helios_prime'), 1);
    const cutter = s.entityList.find(e => e.data?.generalSalvor && e.data?.jobId);
    assert.ok(cutter); const job = sim.helpers.npcJobs.get(cutter.data.jobId);
    assert.equal(job.job.payload.targetId, wreck.id);
    assert.equal(wreck.data.salvagePool.cmdty_scrap_metal, 5, 'dispatch does not mint or remove salvage');
    assert.equal(wreck.data.salvorClaimedBy, cutter.data.worldRecordId);
    const { NPC_JOB_PHASE } = await import('../src/systems/npcJobs.js');
    const extractions = []; sim.bus.on('salvage:npcExtraction', p => extractions.push(p));
    // Stage the real actors at the work boundary; this is not a claim about travel animation.
    job.job.phase = NPC_JOB_PHASE.WORK; job.job.routeIndex = 1; job.job.progress = .99; job.job.workS = 1;
    cutter.pos = { x: wreck.pos.x - 20, z: wreck.pos.z }; cutter.vel = { ...wreck.vel };
    sim.registry.get('npcJobsRuntime').update(.25, s); sim.bus.flush();
    assert.equal(extractions.length, 1);
    assert.equal(cutter.data.cargoManifest.totalQty, 5);
    assert.deepEqual(wreck.data.salvagePool, {});
  } finally { sim.dispose(); }
});

test('an interrupted survivor can be picked up again and delivered exactly once', () => {
  const h = boot(); h.sys.update(.1, h.state);
  h.carrier.data.disabled = true; h.sys.update(.1, h.state);
  const returned = h.state.entityList.find(e => e.alive !== false && e.data?.survivorPodCausal?.memoryId === 'survivor:9');
  assert.ok(returned);
  const second = { ...h.carrier, id: 12, occupantGeneration: 4, pos: { ...returned.pos }, alive: true,
    data: { trafficRole: 'rescue', worldRecordId: 'rescue:two' }, flags: {} };
  h.state.entities.set(second.id, second); h.state.entityList.push(second);
  const secondRec = { id: second.id, role: 'rescue', targetId: h.station.id };
  h.state.traffic.freighters.push(secondRec); h.sys.update(.1, h.state);
  assert.equal(secondRec.carryingSurvivor, true);
  assert.equal(h.state.entities.has(returned.id), false);
  assert.equal(h.state.survivorPod.causal.receipts.filter(r => r.id === 'survivor:9').length, 1);
  second.pos.x = 10; second.pos.z = 0;
  h.owner._stepRescue(second, secondRec, [h.station], h.state, .1);
  assert.equal(count(h, 'survivorPod:rescued'), 1);
  assert.equal(h.state.survivorPod.causal.receipts.filter(r => r.id === 'survivor:9' && r.outcome === 'rescued').length, 1);
  h.sys.destroy();
});

test('pod-pressure cleanup cannot erase the passenger returned by an interrupted lifter', async () => {
  const { enforceCausalSurvivorPodCap } = await import('../src/systems/survivorPod.js');
  const h = boot(); h.sys.update(.1, h.state);
  h.carrier.data.disabled = true; h.sys.update(.1, h.state);
  const returned = h.state.entityList.find(e => e.alive !== false && e.data?.survivorPodCausal?.memoryId === 'survivor:9');
  assert.ok(returned);
  assert.equal(enforceCausalSurvivorPodCap(h.state, h.bus, 0, {}), 0);
  assert.equal(h.state.entities.get(returned.id), returned);
  h.sys.destroy();
});

test('ordinary traffic update releases a legacy lifter job and aims at the actual mayday caller', async () => {
  const { createSimulation } = await import('../src/core/sim.js');
  const { npcJobsRuntime } = await import('../src/systems/npcJobsRuntime.js');
  const sim = createSimulation({ seed: 47, systems: [traffic, npcJobsRuntime] });
  try {
    const s = sim.state; s.mode = 'flight'; s.simTime = 10; s.world.currentSectorId = 'sector_helios_prime';
    s.playerId = sim.spawn({ type: 'ship', team: 0, hull: 100, pos: { x: 50, z: 0 }, data: {} }).id;
    const station = sim.spawn({ type: 'station', hull: 1000, radius: 40, pos: { x: 0, z: 0 }, data: { stationId: 'station_helios' } });
    const hull = sim.spawn({ type: 'ship', team: 2, hull: 100, hullMax: 100, pos: { x: 100, z: 0 },
      data: { trafficRole: 'rescue', worldRecordId: 'rescue:ordinary' } });
    const caller = sim.spawn({ type: 'ship', team: 2, hull: 100, pos: { x: 350, z: 20 },
      data: { trafficRole: 'hauler', trafficLabel: 'Mayday ship' } });
    const rec = { id: hull.id, role: 'rescue', targetId: station.id }; s.traffic.freighters.push(rec);
    const id = sim.helpers.npcJobs.assign(hull, { kind: 'tender', route: [
      { id: 'berth:a', pos: { x: 0, z: 0 } }, { id: 'client:b', pos: { x: 100, z: 0 } },
    ] });
    assert.ok(id);
    const owner = sim.registry.get('traffic'); owner._broadcastCivilianDistress(caller, null, 'combat_damage');
    owner.update(.1, s);
    assert.equal(hull.data.jobId, undefined);
    assert.equal(rec.rescueCallerId, caller.id);
    assert.equal(rec.civilianReaction, 'responding_distress');
    assert.equal(hull.data.intent.moveZ, 1);
  } finally { sim.dispose(); }
});

test('delivery callbacks cannot write passenger or steering state onto a recycled hull', () => {
  const h = boot(); h.sys.update(.1, h.state); h.carrier.pos.x = 10;
  h.bus.on('survivorPod:rescued', () => {
    h.carrier.occupantGeneration += 1;
    h.carrier.data = { trafficRole: 'hauler', sentinel: 'new occupant' };
  });
  h.owner._stepRescue(h.carrier, h.rec, [h.station], h.state, .1);
  assert.deepEqual(h.carrier.data, { trafficRole: 'hauler', sentinel: 'new occupant' });
  assert.equal(count(h, 'survivorPod:rescued'), 1);
  h.sys.destroy();
});

test('a stale player line on a recycled pod ID cannot claim the new survivor or earn a fee', () => {
  const h = boot(); h.pod.occupantGeneration = 9;
  const player = { id: 1, occupantGeneration: 2, type: 'ship', alive: true, pos: { x: 200, z: 0 }, data: {} };
  h.state.entities.set(1, player); h.state.entityList.push(player);
  h.state.player.tether = { active: true, targetId: h.pod.id, attachmentId: 'old-line' };
  h.state.combat = { attachments: { byId: { 'old-line': { state: 'active', ownerId: 1,
    ownerGeneration: 2, targetId: h.pod.id, targetGeneration: 5 } } } };
  h.sys.update(.1, h.state);
  const boarded = h.events.find(e => e.name === 'survivorPod:boarded');
  assert.equal(boarded.payload.reason, 'rescue_hull');
  h.carrier.pos.x = 10; h.owner._stepRescue(h.carrier, h.rec, [h.station], h.state, .1);
  assert.equal(count(h, 'survivorPod:rescued'), 1);
  assert.equal(count(h, 'economy:grantCredits'), 0);
  h.sys.destroy();
});

test('one civilian kill produces the survivor and the actual aftermath wreck claimed by a salvor', async () => {
  const { createSimulation } = await import('../src/core/sim.js');
  const { npcJobsRuntime } = await import('../src/systems/npcJobsRuntime.js');
  const { aftermathWrecks, aftermathForSector } = await import('../src/systems/aftermathWrecks.js');
  const { zonesForSector } = await import('../src/data/sectorZones.js');
  const { sectorLocalToGlobalForSector } = await import('../src/data/sectorCoordinates.js');
  const { shouldEjectCausalSurvivorPod } = await import('../src/systems/survivorPod.js');
  const sector = 'sector_helios_prime'; const pos = sectorLocalToGlobalForSector(zonesForSector(sector)[0].center, sector);
  const sim = createSimulation({ seed: 47, systems: [aftermathWrecks, survivorPod, { ...traffic, update() {} }, npcJobsRuntime] });
  try {
    const s = sim.state; s.mode = 'flight'; s.simTime = 90; s.world.currentSectorId = sector;
    s.playerId = sim.spawn({ type: 'ship', team: 0, hull: 100, pos: { x: pos.x + 100, z: pos.z + 100 }, data: {} }).id;
    sim.spawn({ type: 'station', hull: 1000, radius: 40, pos: { x: pos.x - 300, z: pos.z }, data: { stationId: 'station_helios' } });
    const hull = sim.spawn({ type: 'ship', hull: 100, hullMax: 100, pos: { x: pos.x + 35, z: pos.z },
      data: { trafficRole: 'rescue', worldRecordId: 'rescue:incident' } });
    const rec = { id: hull.id, role: 'rescue' }; s.traffic.freighters.push(rec);
    const victim = sim.spawn({ type: 'ship', team: 2, hull: 50, hullMax: 100, radius: 12, mass: 100,
      pos: { ...pos }, data: { trafficRole: 'hauler', worldRecordId: 'victim:incident' } });
    for (let n = 0; n < 100 && !shouldEjectCausalSurvivorPod(s, victim); n++) victim.data.worldRecordId = `victim:incident:${n}`;
    assert.equal(shouldEjectCausalSurvivorPod(s, victim), true);
    victim.alive = false;
    sim.bus.emit('entity:killed', { id: victim.id, type: 'ship', pos: { ...victim.pos }, vel: { ...victim.vel },
      sectorId: sector, data: victim.data });
    const marker = aftermathForSector(s, sector).find(m => m.victimId === victim.id);
    const survivor = s.entityList.find(e => e.alive && e.data?.survivorPodCausal?.victimId === victim.id);
    assert.ok(marker); assert.ok(survivor);
    const wreck = s.entityList.find(e => e.alive && e.type === 'wreck' && e.data?.provenance?.markerId === marker.markerId);
    assert.ok(wreck); wreck.data.salvorNoticeAt = 0;
    sim.registry.get('survivorPod').update(.1, s);
    assert.equal(rec.carryingSurvivor, true);
    assert.equal(sim.registry.get('traffic')._dispatchGeneralSalvors(sector), 1);
    const cutter = s.entityList.find(e => e.data?.generalSalvor && e.data?.jobId);
    assert.equal(sim.helpers.npcJobs.get(cutter.data.jobId).job.payload.targetId, wreck.id);
  } finally { sim.dispose(); }
});

async function recycledVictimBoot({ retireBeforePod = false, snapshotGeneration = false } = {}) {
  const { createSimulation } = await import('../src/core/sim.js');
  const { combat } = await import('../src/systems/combat.js');
  const bus = createBus(); let sim;
  // Exercise the real combat kill payload after an earlier synchronous owner retires the hull.
  if (retireBeforePod) bus.on('entity:killed', p => {
    if (snapshotGeneration) p.occupantGeneration = sim.state.entities.get(p.id).occupantGeneration;
    sim.helpers.removeEntity(p.id, { immediate: true, reason: 'identity-test-killed-retirement' });
  });
  sim = createSimulation({ seed: 1, bus, systems: [survivorPod, { ...traffic, update() {} }, { ...combat, update() {} }] });
  const s = sim.state; s.mode = 'flight'; s.simTime = 12; s.world.currentSectorId = 'sector_test';
  const player = sim.spawn({ type: 'ship', team: 0, hull: 100, hullMax: 100, pos: { x: 1000, z: 1000 } });
  s.playerId = player.id;
  const station = sim.spawn({ type: 'station', hull: 1000, pos: { x: 0, z: 0 }, data: { stationId: 'station_test' } });
  const sys = sim.registry.get('survivorPod'), owner = sim.registry.get('traffic');
  const events = [];
  for (const name of ['survivorPod:boarded', 'survivorPod:rescued', 'survivorPod:abandoned', 'economy:grantCredits', 'faction:repDelta']) {
    bus.on(name, payload => events.push({ name, payload }));
  }
  const addCarrier = (worldRecordId, pos = { x: 220, z: 0 }) => {
    const hull = sim.spawn({ type: 'ship', team: 2, hull: 100, hullMax: 100, pos,
      data: { trafficRole: 'rescue', worldRecordId } });
    const rec = { id: hull.id, role: 'rescue', targetId: station.id }; s.traffic.freighters.push(rec);
    return { hull, rec };
  };
  const firstCarrier = addCarrier('identity:lifter-A');
  const eject = label => {
    const victim = sim.spawn({ type: 'ship', team: 2, hull: 100, hullMax: 100, radius: 12,
      pos: { x: 200, z: 0 }, data: { trafficRole: 'hauler', worldRecordId: label } });
    for (let n = 0; n < 100 && !shouldEjectCausalSurvivorPod(s, victim); n++) victim.data.worldRecordId += 'x';
    assert.equal(shouldEjectCausalSurvivorPod(s, retireBeforePod ? { id: victim.id, data: {} } : victim), true);
    const id = victim.id, generation = victim.occupantGeneration;
    sim.registry.get('combat').kill(victim, null);
    const pod = s.entityList.find(e => e.alive && e.data?.survivorPodCausal?.victimId === id);
    assert.ok(pod);
    return { id, generation, pod, person: pod.data.survivorPodCausal.memoryId };
  };
  const board = (pod, playerAnswered = false) => {
    const id = pod.id;
    if (playerAnswered) {
      player.pos.x = pod.pos.x; player.pos.z = pod.pos.z;
      s.player.tether = { active: true, targetId: id };
    }
    sys.update(.1, s);
    s.player.tether = { active: false, targetId: null };
    assert.equal(s.entities.has(id), false, 'only a genuine physical pickup retires the pod');
  };
  const retireVictim = victim => {
    if (!retireBeforePod) assert.equal(sim.helpers.removeEntity(victim.id,
      { immediate: true, reason: 'identity-test-killed-retirement' }), true);
  };
  const deliver = carrier => {
    owner._stepRescue(carrier.hull, carrier.rec, [station], s, .1);
    assert.equal(carrier.rec.carryingSurvivor, true, 'the distant station cannot settle custody');
    carrier.hull.pos.x = 10; carrier.hull.pos.z = 0;
    owner._stepRescue(carrier.hull, carrier.rec, [station], s, .1);
    owner._stepRescue(carrier.hull, carrier.rec, [station], s, .1);
  };
  return { sim, bus, state: s, sys, events, firstCarrier, addCarrier, eject, board, retireVictim, deliver };
}

test('recycled victim occupants keep independent rescue custody through Continue, recovery and arrival', async () => {
  const h = await recycledVictimBoot();
  try {
    const a = h.eject('identity:crew-A'); h.board(a.pod, true); h.retireVictim(a);
    const b = h.eject('identity:crew-B');
    assert.equal(b.id, a.id, 'the canonical allocator actually recycled the victim slot');
    assert.notEqual(b.generation, a.generation); assert.notEqual(b.person, a.person);
    const carrierB = h.addCarrier('identity:lifter-B', { ...b.pod.pos }); h.board(b.pod, true);
    assert.equal(count(h, 'survivorPod:boarded'), 2); assert.equal(count(h, 'economy:grantCredits'), 0);
    const saved = JSON.parse(JSON.stringify(h.sys.serialize()));
    h.sys.deserialize(saved); h.bus.emit('save:loaded', {});
    assert.deepEqual(h.state.survivorPod.causal.receipts.map(r => r.id), [a.person, b.person], 'saved person IDs stay unchanged');
    const returned = [];
    for (const [person, carrier] of [[a.person, h.firstCarrier], [b.person, carrierB]]) {
      const oxygen = h.state.survivorPod.causal.receipts.find(r => r.id === person).oxygenLeft;
      carrier.hull.data.disabled = true; h.sys.update(.1, h.state);
      const pods = h.state.entityList.filter(e => e.alive && e.data?.survivorPodCausal?.memoryId === person);
      assert.equal(pods.length, 1); assert.equal(pods[0].data.survivorPodCausal.expireAt, h.state.simTime + oxygen);
      returned.push(pods[0]);
    }
    assert.equal(count(h, 'survivorPod:rescued'), 0); assert.equal(count(h, 'economy:grantCredits'), 0);
    const replacementA = h.addCarrier('identity:lifter-A2', { ...returned[0].pos }); h.board(returned[0], true);
    const replacementB = h.addCarrier('identity:lifter-B2', { ...returned[1].pos }); h.board(returned[1], true);
    h.deliver(replacementB);
    assert.equal(h.state.survivorPod.causal.receipts.find(r => r.id === a.person).outcome, 'in_transit',
      'one person’s terminal event cannot remove the other passenger');
    h.deliver(replacementA);
    assert.deepEqual(h.events.filter(e => e.name === 'survivorPod:rescued').map(e => e.payload.id).sort(), [a.person, b.person].sort());
    assert.equal(count(h, 'economy:grantCredits'), 2); assert.equal(count(h, 'faction:repDelta'), 2);
  } finally { h.sim.dispose(); }
});

test('expiry of a recycled victim’s new pod cannot erase the earlier person aboard a lifter', async () => {
  const h = await recycledVictimBoot();
  try {
    const a = h.eject('identity:crew-A'); h.board(a.pod); h.retireVictim(a);
    const b = h.eject('identity:crew-B'); assert.equal(b.id, a.id);
    h.state.simTime = b.pod.data.survivorPodCausal.expireAt + 1; h.sys.update(.1, h.state);
    assert.equal(count(h, 'survivorPod:abandoned'), 1);
    assert.equal(h.state.survivorPod.causal.receipts.find(r => r.id === a.person).outcome, 'in_transit');
    h.deliver(h.firstCarrier);
    assert.deepEqual(h.events.filter(e => e.name === 'survivorPod:rescued').map(e => e.payload.id), [a.person]);
    assert.equal(count(h, 'economy:grantCredits'), 0);
  } finally { h.sim.dispose(); }
});

test('actual combat killed-hull fallback keeps recycled ejections distinct and preserves a supplied occupant snapshot', async () => {
  let victimPerson;
  for (const mode of [{}, { retireBeforePod: true, snapshotGeneration: true }, { retireBeforePod: true }]) {
    const h = await recycledVictimBoot(mode);
    try {
      const a = h.eject('identity:crew-A'); h.board(a.pod); h.retireVictim(a);
      if (!mode.retireBeforePod) victimPerson = a.person;
      if (mode.snapshotGeneration) assert.equal(a.person, victimPerson, 'retirement must preserve an explicit victim generation');
      const b = h.eject('identity:crew-B'); assert.equal(b.id, a.id);
      assert.notEqual(b.generation, a.generation); assert.notEqual(b.person, a.person);
      const carrierB = h.addCarrier('identity:lifter-B', { ...b.pod.pos }); h.board(b.pod);
      h.deliver(h.firstCarrier); h.deliver(carrierB);
      assert.equal(count(h, 'survivorPod:rescued'), 2); assert.equal(count(h, 'economy:grantCredits'), 0);
    } finally { h.sim.dispose(); }
  }
});
