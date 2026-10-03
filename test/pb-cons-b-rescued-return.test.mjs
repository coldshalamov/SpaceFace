// PB-CONS-B — SF-156 + SF-162, the aftermath pair.
//
// SF-156: a rescued worker returns to work. A crewed worker hull dies with a live job, its
// survivor pod is rescued, and later the SAME person — one durable world record, same role,
// same workplace route — flies back into their actual job through the job kernel. Pins:
//   1. the return is to the REAL job (same kind, same route, the loop actually works), never a
//      generic respawn — and a death with no captured job fabricates no return;
//   2. person identity survives a save/restore round-trip; exactly one hull per person, and a
//      restore taken after the return never spawns a second one;
//   3. rescue resolution is once per receipt (replays do not re-schedule or re-return).
// SF-162: a scavenger switching occupation does so through a real, legible switch. The field
// owner's own `wreckEcology:departed` event is the released obligation; the switch fires once
// per transition, moves the SAME surviving goods onto the SAME person's durable record, and the
// new hauler carries none of the scavenger's work state — no double-dipping. One loss is final.
//
// Fixed seed throughout; no Math.random anywhere (the sim's state.rng drives the return jitter).
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { uniqueWrecks } from '../src/systems/uniqueWrecks.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { scavengerWorldRecordId } from '../src/systems/scavengerOccupationSwitch.js';

const SEED = 156162;
const DT = 1 / 60;
const SECTOR = 'sector_a';
const ROUTE = [{ id: 'home', pos: { x: 0, z: 0 } }, { id: 'field', pos: { x: 600, z: 0 } }];
const SHORT = { speed: 100, commissionS: 1, departS: 1, approachS: 1, workS: 30, loadS: 1, unloadS: 1, dwellS: 1 };

function boot(seed = SEED) {
  const sim = createSimulation({ seed, systems: [uniqueWrecks, npcJobsRuntime] });
  sim.state.mode = 'flight';
  sim.state.world = sim.state.world || {};
  sim.state.world.currentSectorId = SECTOR;
  return sim;
}
function steps(sim, n) { for (let i = 0; i < n; i++) sim.step(DT); }
function stepSeconds(sim, s) { steps(sim, Math.round(s / DT)); }
function hull(sim, worldRecordId, pos = { x: 0, z: 0 }, extraData = {}) {
  const e = sim.spawn({ type: 'ship', team: 2, pos, vel: { x: 0, z: 0 }, hull: 100, hullMax: 100, radius: 6 });
  e.data = e.data || {};
  e.data.worldRecordId = worldRecordId;
  e.data.sectorId = SECTOR;
  Object.assign(e.data, extraData);
  return e;
}
function hullsByRecord(sim, recordId) {
  const out = [];
  for (const e of sim.state.entities.values()) {
    if (e && e.data && e.data.worldRecordId === recordId && e.alive !== false) out.push(e);
  }
  return out;
}
function killWorker(sim, worker) {
  // The kill seam in owner order: the uniqueWrecks capture runs before the job kernel releases.
  sim.bus.emit('entity:killed', { id: worker.id });
  sim.bus.emit('survivorPod:ejected', {
    entityId: 999001, victimId: worker.id, sectorId: SECTOR,
    factionId: 'faction_free', expireAt: sim.state.simTime + 180,
    phase: 'adrift', source: 'causal_eject',
  });
}
function rescue(sim, worker, receiptId) {
  sim.bus.emit('survivorPod:resolved', {
    id: receiptId, outcome: 'rescued', victimId: worker.id,
    sectorId: SECTOR, t: sim.state.simTime,
  });
}

test('SF-156: a rescued worker returns to their actual job, once', () => {
  const sim = boot();
  const seen = { returned: [], toasts: [] };
  sim.bus.on('rescuedWorker:returned', (p) => seen.returned.push(p));
  sim.bus.on('toast', (p) => { if (p && /back on the job/.test(p.text)) seen.toasts.push(p); });

  const worker = hull(sim, 'wr-rescued-156', { x: 0, z: 0 }, { defId: 'ship_wasp' });
  const jobId = sim.helpers.npcJobs.assign(worker, { kind: 'miner', route: ROUTE, sectorId: SECTOR, ...SHORT });
  assert.ok(jobId, 'the worker holds a real job');
  stepSeconds(sim, 10);
  const before = sim.helpers.npcJobs.get(jobId).job;
  assert.equal(before.phase, 'work', 'the worker was at work when they died');

  killWorker(sim, worker);
  assert.notEqual(sim.state.entities.get(worker.id)?.data?.jobId, jobId, 'the kernel released the dead job');
  rescue(sim, worker, 'survivor:test:1');
  const status = sim.registry.get('uniqueWrecks')._rescuedWorkers.status();
  assert.equal(status.length, 1, 'one person record for one rescued worker');
  assert.equal(status[0].outcome, 'rescued');
  assert.equal(status[0].role, 'miner', 'the record keeps the person\'s role');
  assert.equal(status[0].hasWorkplace, true, 'the record keeps the person\'s workplace');
  assert.ok(status[0].returnDueAtS != null, 'the return is scheduled');

  stepSeconds(sim, 90);
  sim.bus.emit('economy:tick');
  steps(sim, 5);

  assert.equal(seen.returned.length, 1, 'the return is one legible event');
  assert.equal(seen.returned[0].role, 'miner');
  assert.equal(seen.returned[0].worldRecordId, 'wr-rescued-156', 'the same person, same record');
  const hulls = hullsByRecord(sim, 'wr-rescued-156');
  assert.equal(hulls.length, 1, 'exactly one hull carries the person');
  const backJobId = hulls[0].data.jobId;
  assert.equal(backJobId, 'job:wr-rescued-156', 'the return re-enters through the job kernel');
  const backJob = sim.helpers.npcJobs.get(backJobId).job;
  assert.equal(backJob.kind, 'miner', 'same occupation');
  assert.deepEqual(backJob.route.map((w) => w.id), ['home', 'field'], 'the SAME workplace route');
  stepSeconds(sim, 12);
  assert.equal(sim.helpers.npcJobs.get(backJobId).job.phase, 'work', 'the returned worker is at work, not idle');

  // Once per receipt: a replayed resolution never re-schedules, re-spawns, or re-announces.
  rescue(sim, worker, 'survivor:test:1');
  sim.bus.emit('economy:tick');
  stepSeconds(sim, 2);
  assert.equal(seen.returned.length, 1, 'the return fired once');
  assert.equal(hullsByRecord(sim, 'wr-rescued-156').length, 1, 'still one person');
  assert.equal(seen.toasts.length, 1, 'the pilot heard it once');

  // Counterexample: a death with no job has no workplace to return to — no fabricated person.
  const beforeCount = sim.registry.get('uniqueWrecks')._rescuedWorkers.status().length;
  const bystander = hull(sim, 'wr-bystander-156', { x: 300, z: 40 });
  killWorker(sim, bystander); // no jobId on this hull
  rescue(sim, bystander, 'survivor:test:2');
  assert.equal(sim.registry.get('uniqueWrecks')._rescuedWorkers.status().length, beforeCount,
    'a non-worker rescue opens no return record');
  sim.dispose();
});

test('SF-156: person identity survives save/restore — and never doubles', () => {
  // Save taken between the rescue and the return.
  const simA = boot();
  const worker = hull(simA, 'wr-rescued-156b', { x: 0, z: 0 }, { defId: 'ship_wasp' });
  simA.helpers.npcJobs.assign(worker, { kind: 'hauler', route: ROUTE, sectorId: SECTOR, ...SHORT });
  stepSeconds(simA, 10);
  killWorker(simA, worker);
  rescue(simA, worker, 'survivor:restore:1');
  const bagA = JSON.parse(JSON.stringify(simA.registry.get('uniqueWrecks')._ensureState()));
  const saved = Object.values(bagA.rescuedWorkers.people)[0];
  assert.equal(saved.outcome, 'rescued', 'the save carries the scheduled return');
  assert.ok(saved.returnDueAtS != null, 'the due time survived serialization');
  simA.dispose();

  // Restore into a fresh runtime: the same person comes back, once.
  const simB = boot();
  Object.assign(simB.registry.get('uniqueWrecks')._ensureState(), bagA);
  const seenB = [];
  simB.bus.on('rescuedWorker:returned', (p) => seenB.push(p));
  stepSeconds(simB, 100);
  simB.bus.emit('economy:tick');
  steps(simB, 5);
  assert.equal(seenB.length, 1, 'the restored record returns exactly once');
  assert.equal(seenB[0].worldRecordId, 'wr-rescued-156b');
  assert.equal(seenB[0].personKey, saved.personKey, 'same durable person key across restore');
  const hullsB = hullsByRecord(simB, 'wr-rescued-156b');
  assert.equal(hullsB.length, 1, 'one hull per person after restore');
  const backJob = simB.helpers.npcJobs.get(hullsB[0].data.jobId).job;
  assert.equal(backJob.kind, 'hauler', 'the restored return keeps the real occupation');
  assert.deepEqual(backJob.route.map((w) => w.id), ['home', 'field'], 'the restored return keeps the workplace');
  simB.bus.emit('economy:tick');
  stepSeconds(simB, 5);
  assert.equal(hullsByRecord(simB, 'wr-rescued-156b').length, 1, 'sync never duplicates the person');
  simB.dispose();

  // A save taken AFTER the return restores quiet: no second return, no ghost hull.
  const simC = boot();
  const workerC = hull(simC, 'wr-rescued-156c', { x: 0, z: 0 }, { defId: 'ship_wasp' });
  simC.helpers.npcJobs.assign(workerC, { kind: 'miner', route: ROUTE, sectorId: SECTOR, ...SHORT });
  stepSeconds(simC, 10);
  killWorker(simC, workerC);
  rescue(simC, workerC, 'survivor:restore:2');
  stepSeconds(simC, 90);
  simC.bus.emit('economy:tick');
  steps(simC, 5);
  const bagC = JSON.parse(JSON.stringify(simC.registry.get('uniqueWrecks')._ensureState()));
  assert.equal(Object.values(bagC.rescuedWorkers.people)[0].outcome, 'returned');
  simC.dispose();
  const simD = boot();
  Object.assign(simD.registry.get('uniqueWrecks')._ensureState(), bagC);
  const seenD = [];
  simD.bus.on('rescuedWorker:returned', (p) => seenD.push(p));
  stepSeconds(simD, 100);
  simD.bus.emit('economy:tick');
  steps(simD, 5);
  assert.equal(seenD.length, 0, 'a returned person is never returned again');
  assert.equal(hullsByRecord(simD, 'wr-rescued-156c').length, 0, 'and never respawned dead');
  simD.dispose();
});

test('SF-162: the scavenger\'s occupation switch is real, legible, and double-dip-free', () => {
  const sim = boot();
  sim.spawn({ type: 'station', pos: { x: 2000, z: 0 }, vel: { x: 0, z: 0 }, radius: 80, data: { stationId: 'station_test' } });
  const seen = { switched: [], delivered: [], toasts: [] };
  sim.bus.on('occupation:switched', (p) => seen.switched.push(p));
  sim.bus.on('occupation:delivered', (p) => seen.delivered.push(p));
  sim.bus.on('toast', (p) => { if (p && /switched to hauling/.test(p.text)) seen.toasts.push(p); });

  const hold = { cmdty_salvage_electronics: 3, cmdty_medical: 1 };
  const picker = hull(sim, 'wr-ecology-picker', { x: 1000, z: 0 }, { wreckEcologyRole: 'scavenger' });
  sim.bus.emit('wreckEcology:departed', {
    fieldId: 'field_a', sectorId: SECTOR, zoneId: 'zx',
    entityId: picker.id, hold: { ...hold }, holdQty: 4,
  });

  assert.equal(seen.switched.length, 1, 'one legible switch event');
  const switchEvent = seen.switched[0];
  assert.equal(switchEvent.from, 'scavenger');
  assert.equal(switchEvent.to, 'salvage_hauler');
  assert.equal(switchEvent.holdQty, 4, 'the switch names the goods it moves');
  const record = scavengerWorldRecordId(SEED, 'field_a');
  assert.equal(switchEvent.personKey, `wreck-ecology:${SEED}:field_a`, 'the switch names the person');
  const haulers = hullsByRecord(sim, record);
  assert.equal(haulers.length, 1, 'the same person, one new hull, one occupation');
  const hauler = haulers[0];
  assert.deepEqual(hauler.data.cargo.items, hold, 'the SAME surviving goods moved, not minted');
  assert.equal(hauler.data.wreckEcologyRole, undefined, 'no scavenger role rides along');
  assert.equal(hauler.data.scavengerWork, undefined, 'no scavenger work state rides along');
  const haulerJobId = hauler.data.jobId;
  assert.equal(haulerJobId, `job:${record}`, 'the new occupation is a real job-kernel job');
  assert.equal(switchEvent.jobId, haulerJobId, 'the event names the new job');
  stepSeconds(sim, 20);
  const phase = sim.helpers.npcJobs.get(haulerJobId).job.phase;
  assert.ok(phase !== 'complete', 'the delivery job runs');
  assert.ok(['depart', 'transit', 'approach', 'unload', 'return'].includes(phase), `the hauler is flying the delivery (phase ${phase})`);

  // Once per transition: a repeated departed for the same person never re-fires or duplicates.
  sim.bus.emit('wreckEcology:departed', {
    fieldId: 'field_a', sectorId: SECTOR, zoneId: 'zx',
    entityId: picker.id, hold: { ...hold }, holdQty: 4,
  });
  assert.equal(seen.switched.length, 1, 'no second switch for the same person');
  assert.equal(hullsByRecord(sim, record).length, 1, 'no second hull');

  // The new occupation completes: the delivery is on the record, once.
  sim.bus.emit('npcjobs:complete', { jobId: haulerJobId, kind: 'hauler' });
  sim.bus.emit('npcjobs:complete', { jobId: haulerJobId, kind: 'hauler' });
  assert.equal(seen.delivered.length, 1, 'the delivery fired once');
  assert.equal(seen.toasts.length, 1, 'the switch was announced once');
  sim.dispose();
});

test('SF-162: a lost hauler is final, an empty hold spends quietly, mid-flight restores rematerialize', () => {
  const sim = boot();
  sim.spawn({ type: 'station', pos: { x: 2000, z: 0 }, vel: { x: 0, z: 0 }, radius: 80, data: { stationId: 'station_test' } });
  const seen = { switched: [], delivered: [] };
  sim.bus.on('occupation:switched', (p) => seen.switched.push(p));
  sim.bus.on('occupation:delivered', (p) => seen.delivered.push(p));

  // Empty hold: the old occupation ends, no new one begins, nothing is announced.
  const pickerC = hull(sim, 'wr-ecology-c', { x: 900, z: 0 });
  sim.bus.emit('wreckEcology:departed', {
    fieldId: 'field_c', sectorId: SECTOR, zoneId: 'zx',
    entityId: pickerC.id, hold: {}, holdQty: 0,
  });
  assert.equal(seen.switched.length, 0, 'no switch without goods to move');
  assert.equal(hullsByRecord(sim, scavengerWorldRecordId(SEED, 'field_c')).length, 0);

  // field_b switches, then the hauler dies: one loss is final, no resurrection.
  const pickerB = hull(sim, 'wr-ecology-b', { x: 1000, z: 0 });
  sim.bus.emit('wreckEcology:departed', {
    fieldId: 'field_b', sectorId: SECTOR, zoneId: 'zx',
    entityId: pickerB.id, hold: { cmdty_medical: 2 }, holdQty: 2,
  });
  assert.equal(seen.switched.length, 1);
  const recordB = scavengerWorldRecordId(SEED, 'field_b');
  const haulerB = hullsByRecord(sim, recordB)[0];
  const statusB = () => sim.registry.get('uniqueWrecks')._occupationSwitch.status()
    .find((row) => row.fieldId === 'field_b');
  assert.equal(statusB().phase, 'salvage_hauler');
  // The real kill path despawns the hull; persistent flags do not survive a death removal.
  sim.bus.emit('entity:killed', { id: haulerB.id });
  sim.state.entities.delete(haulerB.id);
  assert.equal(statusB().phase, 'lost', 'the loss closes the record');
  sim.bus.emit('wreckEcology:departed', {
    fieldId: 'field_b', sectorId: SECTOR, zoneId: 'zx',
    entityId: pickerB.id, hold: { cmdty_medical: 2 }, holdQty: 2,
  });
  assert.equal(seen.switched.length, 1, 'no resurrection after a loss');
  assert.equal(hullsByRecord(sim, recordB).length, 0);
  sim.dispose();

  // A save taken mid-delivery rematerializes the SAME hauler — same record, same goods, one hull.
  const simE = boot();
  simE.spawn({ type: 'station', pos: { x: 2000, z: 0 }, vel: { x: 0, z: 0 }, radius: 80, data: { stationId: 'station_test' } });
  const pickerE = hull(simE, 'wr-ecology-e', { x: 1000, z: 0 });
  simE.bus.emit('wreckEcology:departed', {
    fieldId: 'field_e', sectorId: SECTOR, zoneId: 'zx',
    entityId: pickerE.id, hold: { cmdty_salvage_electronics: 5 }, holdQty: 5,
  });
  const bagE = JSON.parse(JSON.stringify(simE.registry.get('uniqueWrecks')._ensureState()));
  assert.equal(Object.values(bagE.occupationSwitch.people)[0].phase, 'salvage_hauler');
  simE.dispose();
  const simF = boot();
  simF.spawn({ type: 'station', pos: { x: 2000, z: 0 }, vel: { x: 0, z: 0 }, radius: 80, data: { stationId: 'station_test' } });
  Object.assign(simF.registry.get('uniqueWrecks')._ensureState(), bagE);
  const seenF = [];
  simF.bus.on('occupation:switched', (p) => seenF.push(p));
  simF.bus.emit('economy:tick');
  steps(simF, 5);
  assert.equal(seenF.length, 0, 'the restore is a rematerialization, not a second switch');
  const recordE = scavengerWorldRecordId(SEED, 'field_e');
  const haulersF = hullsByRecord(simF, recordE);
  assert.equal(haulersF.length, 1, 'the one hauler is re-found after restore');
  assert.deepEqual(haulersF[0].data.cargo.items, { cmdty_salvage_electronics: 5 }, 'the same goods');
  assert.equal(haulersF[0].data.jobId, `job:${recordE}`, 'the same deterministic job');
  simF.bus.emit('economy:tick');
  steps(simF, 5);
  assert.equal(hullsByRecord(simF, recordE).length, 1, 'still exactly one hauler');
  simF.dispose();
});
