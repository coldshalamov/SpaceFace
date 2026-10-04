// Boundary fixtures change only public plan inputs and the canonical capacity ledger.
// Materialization, reservations, finite lives, damage and clear receipts remain real owners.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bootRealPath } from '../scripts/lib/bench/realPath.mjs';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { survivalWave } from '../src/systems/survivalWave.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import { combat } from '../src/systems/combat.js';
import { createRunState } from '../src/core/runState.js';
import { scalarHitToDamagePacket } from '../src/combat/damage.js';
import { SWARM_RULESET, bindSwarmPressureContext, resetSwarmPressureState } from '../src/data/swarmMode.js';

async function boot() {
  const h = await bootRealPath({ seed: 927,
    systems: [spawnBudget, 'actions', survivalWave, 'physics', combat],
    hulls: [{ hullId: 'ship_kestrel', isPlayer: true, pos: { x: 0, z: 0 } }],
  });
  h.state.run = { ...createRunState({ kind: 'survival', ruleset: 'swarm', seed: 927 }),
    phase: 'active', wave: 17, arenaId: 'helios_core' };
  h.state.world.currentSectorId = null;
  h.budget = h.runtime.getSystem('spawnBudget').api;
  h.budget.setMax(40);
  h.wave = h.runtime.getSystem('survivalWave');
  resetSwarmPressureState();
  bindSwarmPressureContext({ getAlive: () => h.wave._cohort.size });
  h.clears = [];
  h.bus.on('run:waveCleared', p => h.clears.push(p));
  return h;
}
function hit(h, entity, damage = 100000) {
  const result = h.withFeatures(() => h.runtime.getSystem('combat').ensureKernel().routeDamage({
    attackerId: h.player.id, targetId: entity.id,
    packet: scalarHitToDamagePacket({ damage, damageType: 'kinetic' }),
    origin: { kind: 'weapon', id: 'affordability-proof' },
  }));
  assert.ok(result.ok);
  if (entity.alive === false) {
    h.runtime.getHelpers().removeEntity(entity.id, { immediate: true });
    h.bus.flush();
  }
}
function start(h, plan) {
  assert.ok(!plan.error);
  h.bus.emit('run:wavePlanned', { wave: 17, plan });
  h.bus.emit('run:waveStarted', { wave: 17 });
}
function authoredPlan() {
  return planWave({ seed: 927, arenaId: 'helios_core', wave: 17, mode: SWARM_RULESET });
}

for (let remaining = 0; remaining <= 5; remaining++) for (let seats = 0; seats <= 4; seats++) {
  test(`reinforcement affordability: ${remaining} finite lives, ${seats} available seats`, async () => {
    const h = await boot();
    try {
      const authored = authoredPlan();
      const opening = { ...authored.schedule[0], enemyId: 'wasp_swarmer', role: 'mass',
        count: 1, atTick: 0, debut: false, champion: false };
      start(h, { ...authored, schedule: [opening], openingLesson: null,
        swarm: { ...authored.swarm, newcomer: null, killTarget: remaining + 1,
          concurrent: Math.max(1, seats), pressureScale: 1,
          roster: [{ enemyId: 'brood_splitter', role: 'pressure', fromWave: 1, weight: 1e12 },
            { enemyId: 'wasp_swarmer', role: 'mass', fromWave: 1, weight: 1 }] } });
      assert.equal(h.wave._admittedTotal, 1);
      hit(h, [...h.wave._cohort.values()][0].entity);
      assert.equal(h.budget.current(), 0);
      assert.equal(h.budget.request(40 - seats, 'survival-wave:external-occupancy'), 40 - seats);
      h.step(1);
      const rows = [...h.wave._cohort.values()].map(row => row.entity);
      const family = rows.find(e => e.data?.splitterFamily);
      const affordable = remaining >= 4 && seats >= 3;
      assert.equal(!!family, affordable, 'family admission needs both four finite lives and three seats');
      assert.ok(h.wave._admittedTotal <= remaining + 1, 'no quota overspend');
      assert.ok(h.budget.current() <= 40, 'unchanged hard cap');
      if (!remaining || !seats) assert.equal(rows.length, 0);
      else if (!affordable) assert.ok(rows.length > 0 && rows.every(e => !e.data.splitterFamily), 'affordable ordinary fallback');
      if (family) {
        assert.equal(h.wave._admittedTotal, 5, 'one parent prepays exactly four finite lives');
        assert.equal(h.budget.current(), 40 - seats + 3);
        hit(h, family, 36);
        assert.equal(h.wave._cohort.size, 3, 'children registered before synchronous parent clear');
        assert.equal(h.clears.length, 0);
        assert.equal(h.budget.current(), 40 - seats + 3, 'children consume the reserved seats');
      }
      // An unavailable hard budget postpones work; it cannot erase quota or deadlock the run.
      h.budget.release('survival-wave:external-occupancy');
      for (let round = 0; round < 8 && !h.clears.length; round++) {
        for (const row of [...h.wave._cohort.values()]) hit(h, row.entity);
        h.step(1);
      }
      assert.equal(h.clears.length, 1);
      assert.equal(h.clears[0].admitted, remaining + 1);
      assert.equal(h.clears[0].killed + h.clears[0].cancelled, remaining + 1);
      assert.equal(h.budget.current(), 0);
      h.step(2);
      assert.equal(h.clears.length, 1, 'stale ticks cannot emit a duplicate clear');
    } finally { bindSwarmPressureContext(null); resetSwarmPressureState(); h.dispose(); }
  });
}

for (let seats = 0; seats <= 4; seats++) {
  test(`authored wave17 debut retains its four-life obligation with ${seats} available seats`, async () => {
    const h = await boot();
    try {
      const authored = authoredPlan(), debut = authored.schedule.find(e => e.debut && e.enemyId === 'brood_splitter');
      assert.ok(debut);
      assert.equal(h.budget.request(40 - seats, 'survival-wave:external-occupancy'), 40 - seats);
      start(h, { ...authored, schedule: [{ ...debut, atTick: 0 }], openingLesson: null,
        swarm: { ...authored.swarm, killTarget: 4, concurrent: 3 } });
      assert.equal(h.wave._admittedTotal, seats >= 3 ? 4 : 0);
      assert.equal(h.wave._plannedBodies, 4);
      assert.equal(h.wave._pending.length, seats >= 3 ? 0 : 1, 'refused debut remains owed');
      assert.equal(h.clears.length, 0);
      h.budget.release('survival-wave:external-occupancy');
      h.step(1);
      const parent = [...h.wave._cohort.values()][0]?.entity;
      assert.ok(parent?.data?.splitterFamily);
      assert.equal(h.wave._admittedTotal, 4);
      assert.equal(h.wave._pending.length, 0);
      hit(h, parent, 36);
      assert.equal(h.wave._cohort.size, 3);
      for (const row of [...h.wave._cohort.values()]) hit(h, row.entity);
      h.step(1);
      assert.equal(h.clears.length, 1);
      assert.equal(h.clears[0].admitted, 4);
      assert.equal(h.clears[0].killed, 4);
      assert.equal(h.budget.current(), 0);
    } finally { bindSwarmPressureContext(null); resetSwarmPressureState(); h.dispose(); }
  });
}
