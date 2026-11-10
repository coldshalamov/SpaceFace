import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { uniqueWrecks } from '../src/systems/uniqueWrecks.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';

test('B113: a rescued worker retries a refused real job on the same hull before return acknowledgement', () => {
  const sim = createSimulation({ seed: 4242, systems: [uniqueWrecks, npcJobsRuntime] });
  try {
    sim.state.mode = 'flight';
    sim.state.world.currentSectorId = 'sector_test';
    const worker = sim.spawn({ type: 'ship', team: 2, pos: { x: 0, z: 0 }, hull: 100,
      data: { worldRecordId: 'worker:test:retry', defId: 'ship_wasp', sectorId: 'sector_test' } });
    assert.ok(sim.helpers.npcJobs.assign(worker, { kind: 'miner', sectorId: 'sector_test',
      route: [{ id: 'home', pos: { x: 0, z: 0 } }, { id: 'field', pos: { x: 100, z: 0 } }] }));
    sim.bus.emit('entity:killed', { id: worker.id });
    worker.alive = false;
    sim.state.entities.delete(worker.id);
    sim.bus.emit('survivorPod:ejected', { victimId: worker.id });
    sim.bus.emit('survivorPod:resolved', { id: 'rescue:test:retry', victimId: worker.id, outcome: 'rescued', t: 0 });
    const host = sim.registry.get('uniqueWrecks');
    const returns = [];
    sim.bus.on('rescuedWorker:returned', payload => returns.push(payload));
    const assign = sim.helpers.npcJobs.assign;
    let refused = true;
    sim.helpers.npcJobs.assign = (...args) => refused ? null : assign(...args);
    sim.state.simTime = 100;
    host._rescuedWorkers.sync();
    assert.equal(returns.length, 0, 'no acknowledgement without a real job');
    assert.equal(host._rescuedWorkers.status()[0].outcome, 'rescued');
    const waiting = [...sim.state.entities.values()].filter(e => e.data?.worldRecordId === 'worker:test:retry');
    assert.equal(waiting.length, 1, 'one hull waits for its captured workplace');
    assert.match(waiting[0].data.scanLabel, /AWAITING SHIFT/);
    waiting[0].data.jobId = 'job:stale-restored-shift';
    host._rescuedWorkers.sync();
    assert.equal(returns.length, 0, 'a stale job label is not a real accepted workplace');
    assert.equal(host._rescuedWorkers.status()[0].outcome, 'rescued');
    refused = false;
    host._rescuedWorkers.sync();
    assert.equal(returns.length, 1);
    assert.equal(returns[0].entityId, waiting[0].id, 'retry reuses the waiting hull');
    assert.ok(sim.helpers.npcJobs.get(waiting[0].data.jobId));
    host._rescuedWorkers.sync();
    assert.equal(returns.length, 1);
    const recycledId = waiting[0].id;
    waiting[0].alive = false;
    sim.state.entities.set(recycledId, { id: recycledId, type: 'ship', alive: true,
      pos: { x: 0, z: 0 }, data: { worldRecordId: 'unrelated:replacement' } });
    sim.bus.emit('entity:killed', { id: recycledId });
    assert.equal(host._rescuedWorkers.status()[0].outcome, 'returned',
      'a recycled numeric id cannot report the remembered worker lost');
  } finally { sim.dispose(); }
});
