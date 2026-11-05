import assert from 'node:assert/strict';
import test from 'node:test';
import { createSimulation } from '../src/core/sim.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { NPC_JOB_KIND, NPC_JOB_PHASE } from '../src/systems/npcJobs.js';

const DT = 1 / 60;

function fixture(t) {
  const sim = createSimulation({ seed: 4242, systems: [npcJobsRuntime] });
  t.after(() => sim.dispose());
  sim.state.mode = 'flight';
  sim.state.world.currentSectorId = 'sector_a';
  const player = sim.spawn({ type: 'ship', team: 0, pos: { x: 100000, z: 100000 },
    vel: { x: 0, z: 0 }, hull: 100, hullMax: 100, radius: 6 });
  sim.state.playerId = player.id;
  const rt = sim.registry.get('npcJobsRuntime');
  const toasts = [], resumed = [];
  sim.bus.on('toast', p => { if (/back to work/.test(p?.text)) toasts.push(p); });
  sim.bus.on('npcjobs:resumed', p => resumed.push(p));
  return { sim, rt, player, toasts, resumed };
}

function worker(f, kind, z = 0) {
  const actor = f.sim.spawn({ type: 'ship', team: 2, pos: { x: 0, z },
    vel: { x: 0, z: 0 }, hull: 100, hullMax: 100, radius: 6,
    data: { worldRecordId: `resume-${kind}-${z}`, sectorId: 'sector_a' } });
  const id = f.rt.assign(actor, { kind, sectorId: 'sector_a',
    route: [{ id: 'home', pos: { x: 0, z } }, { id: 'work', pos: { x: 600, z } }],
    speed: 100, commissionS: 1, departS: 1, approachS: 1, workS: 30,
    loadS: 1, unloadS: 1, dwellS: 1 });
  assert.ok(id);
  return { actor, id, entry: f.rt._byId()[id] };
}

function step(f, seconds) {
  for (let i = 0; i < Math.round(seconds / DT); i++) f.sim.step(DT);
}

function interruptAndRemoveNpc(f, job) {
  const threat = f.sim.spawn({ type: 'ship', team: 1, pos: { x: 620, z: 20 },
    vel: { x: 0, z: 0 }, hull: 100, hullMax: 100, radius: 6 });
  assert.equal(f.rt.interruptJob(job.id, { entityId: threat.id }), true);
  assert.equal(job.entry.job.phase, NPC_JOB_PHASE.FLEE);
  // No player action or killer attribution: ordinary autonomous threat removal.
  f.sim.bus.emit('entity:destroyed', { id: threat.id });
  f.sim.state.entities.delete(threat.id);
}

test('autonomous hauler and salvor returns report work without claiming player cover', t => {
  const f = fixture(t);
  const hauler = worker(f, NPC_JOB_KIND.HAULER);
  const salvor = worker(f, NPC_JOB_KIND.SALVOR, 100);
  step(f, 10);
  interruptAndRemoveNpc(f, hauler);
  interruptAndRemoveNpc(f, salvor);
  step(f, 8);
  assert.deepEqual(f.resumed.map(p => ({ id: p.jobId, via: p.via })), [
    { id: hauler.id, via: 'threat_clear' }, { id: salvor.id, via: 'threat_clear' },
  ]);
  assert.deepEqual(f.toasts.map(p => p.text), ['Hauler back to work.', 'Salvor back to work.']);
});

test('manual return preserves phase, progress and cooldown without treating proximity as help', t => {
  const f = fixture(t);
  const job = worker(f, NPC_JOB_KIND.SALVOR);
  step(f, 10);
  f.player.pos = { ...job.actor.pos };
  const before = { phase: job.entry.job.phase, progress: job.entry.job.progress,
    loopCount: job.entry.job.loopCount };
  for (let i = 0; i < 2; i++) {
    interruptAndRemoveNpc(f, job);
    assert.equal(f.rt.resumeJob(job.id), true);
    assert.deepEqual({ phase: job.entry.job.phase, progress: job.entry.job.progress,
      loopCount: job.entry.job.loopCount }, before);
  }
  assert.equal(f.resumed.length, 2, 'both actual returns remain on the lifecycle record');
  assert.ok(f.resumed.every(p => p.via === 'manual'));
  assert.deepEqual(f.toasts.map(p => p.text), ['Salvor back to work.'], 'same per-job cooldown');
});

for (const fromWing of [false, true]) {
  for (const automatic of [false, true]) {
    test(`${fromWing ? 'wingman' : 'player'} aggression retains its warning on ${automatic ? 'automatic' : 'manual'} return`, t => {
      const f = fixture(t);
      const job = worker(f, NPC_JOB_KIND.HAULER);
      step(f, 10);
      const attacker = fromWing
        ? f.sim.spawn({ type: 'ship', team: 0, pos: { x: 100000, z: 100000 },
          radius: 6, hull: 100, hullMax: 100, data: { isWingman: true } })
        : f.player;
      // Existing canonical combat-event consumer owns the civilian's reaction.
      f.sim.bus.emit('combat:damage', { targetId: job.actor.id, attackerId: attacker.id,
        amount: 5, rawTotal: 5, applied: 5 });
      assert.equal(job.entry.job.phase, NPC_JOB_PHASE.FLEE);
      assert.equal(job.entry.threatId, attacker.id);
      if (automatic) step(f, 30);
      else assert.equal(f.rt.resumeJob(job.id), true);
      assert.equal(f.resumed.length, 1);
      assert.equal(f.resumed[0].via, automatic ? 'threat_clear' : 'manual');
      assert.deepEqual(f.toasts.map(p => p.text), ['Hauler back to work. Watch your fire.']);
    });
  }
}
