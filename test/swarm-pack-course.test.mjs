import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';
import { survivalWave } from '../src/systems/survivalWave.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import { swarmPackFor, composeSwarmPackOpening } from '../src/data/swarmPack.js';
import { swarmRosterFor, swarmBossFor, swarmQuota, swarmRewards, bindSwarmPressureContext,
  resetSwarmPressureState, SWARM_DEBUT_TICKS } from '../src/data/swarmMode.js';
import { COMBAT_LAB_ARENAS } from '../src/data/combatLabSetups.js';
import { ironKrakenForSwarmWave } from '../src/data/ironKraken.js';
import { swarmForecastForRun, swarmNextLine } from '../src/ui/screens/crucibleDraft.js';

const arenas = ['helios_core', 'lagrange_crucible', 'cinder_sluice', 'cryo_drift',
  'storm_lattice', 'asteroid_mill', 'the_hive'];
const count = packages => packages.reduce((sum, pkg) => sum + pkg.count, 0);
const planAt = (wave, seed = 4242, arenaId = 'helios_core', extra = {}) =>
  planWave({ ruleset: 'swarm', mode: 'swarm', seed, arenaId, wave, ...extra });

test('the complete Pack uses admitted roles, native budgets and champion cadence in all seven rooms', () => {
  assert.ok(arenas.every(id => COMBAT_LAB_ARENAS.some(arena => arena.id === id)));
  for (const seed of [4242, 7331, 47]) for (const arenaId of arenas) for (let wave = 1; wave <= 10; wave++) {
    const plan = planAt(wave, seed, arenaId), legal = new Set(swarmRosterFor(wave).map(entry => entry.enemyId));
    assert.equal(plan.error, undefined, `${arenaId}:${wave}`);
    assert.deepEqual(plan, planAt(wave, seed, arenaId));
    assert.equal(plan.swarm.pack.round, wave);
    assert.equal(plan.swarm.killTarget, swarmQuota(wave));
    assert.deepEqual(plan.rewards, swarmRewards(wave));
    assert.ok(count(plan.packages) <= 24);
    assert.equal(count(plan.schedule), count(plan.packages));
    assert.equal(plan.swarm.boss, wave === 5);
    assert.equal(plan.systemEvent, undefined, 'authored arc events cannot leak into the Pack');
    for (const pkg of plan.packages) {
      if (pkg.characterScoreId) {
        assert.equal(pkg.enemyId, ironKrakenForSwarmWave(wave)?.enemyId);
        assert.equal(pkg.count, 1, 'the existing character keeps one owed seat');
      } else if (!pkg.champion) assert.ok(legal.has(pkg.enemyId), `${wave}: premature ${pkg.enemyId}`);
      assert.ok(pkg.count > 0 && pkg.batchSize > 0);
    }
    const debuts = plan.packages.filter(pkg => pkg.debut);
    assert.ok(debuts.length <= 1);
    assert.ok(debuts.every(pkg => pkg.count === 1 && pkg.atTick >= SWARM_DEBUT_TICKS));
    if (wave === 10) assert.equal(plan.packages.some(pkg => pkg.champion), false);
  }
});

test('composition preserves total bodies and protected seats under real pressure contracts', () => {
  for (const swarmStake of ['exhibition', 'contender', 'veteran', 'ironbound']) for (const wave of [2, 3, 4, 6, 7, 8, 9, 10]) {
    const plan = planAt(wave, 4242, 'helios_core', { swarmStake, swarmThreats: ['thick_pack'] });
    assert.equal(plan.error, undefined);
    const before = JSON.stringify(plan.packages);
    const composed = composeSwarmPackOpening(wave, plan.packages);
    assert.equal(count(composed), count(plan.packages));
    assert.equal(JSON.stringify(plan.packages), before, 'composition never mutates caller data');
    for (const pkg of plan.packages.filter(pkg => pkg.champion || pkg.debut || pkg.wall || pkg.staged)) {
      assert.ok(composed.includes(pkg), 'owed physical actor keeps its original seat');
    }
  }
  assert.equal(swarmPackFor(11), null);
  assert.equal(planAt(11).swarm.pack, undefined);
  assert.equal(planAt(3, 4242, 'helios_core', { mutators: ['heavies_only'] }).swarm.pack, undefined);
  assert.equal(planAt(3, 4242, 'helios_core', { circuitRound: { stage: 1, localRound: 3, kind: 'cohort' } }).swarm.pack, undefined);
});

test('intermission previews name the next actual composition and round ten leads to eleven', () => {
  const run = { ...createRunState({ kind: 'survival', ruleset: 'swarm', seed: 4242 }),
    arenaId: 'helios_core', phase: 'draft', wave: 2, modifiers: [], telemetry: {} };
  const forecast = swarmForecastForRun(run, 3);
  assert.equal(forecast.openingQuestion, planAt(3).swarm.pack.question);
  assert.match(swarmNextLine(forecast), /One pirate commits/);
  assert.equal(swarmForecastForRun({ ...run, wave: 10, phase: 'refit' }, 11).wave, 11);
  assert.equal(swarmBossFor(10), null);
});

test('a first commitment is materialized on its staged bearing before the stream may repeat it', () => {
  resetSwarmPressureState(); bindSwarmPressureContext(null);
  const state = createGameState(4242), bus = createBus(), receipts = [];
  state.run = { ...createRunState({ kind: 'survival', ruleset: 'swarm', seed: 4242 }),
    phase: 'active', wave: 3, arenaId: 'helios_core' };
  const player = { id: state.nextEntityId++, alive: true, type: 'ship', radius: 8, pos: { x: 0, z: 0 } };
  state.playerId = player.id; state.entities.set(player.id, player); state.entityList.push(player);
  const budget = makeBudgetApi(state);
  const helpers = { spawnBudget: budget, spawnEntity(spec) {
    const entity = { ...spec, id: state.nextEntityId++, alive: true };
    state.entities.set(entity.id, entity); state.entityList.push(entity); return entity;
  } };
  bus.on('entity:destroyed', event => budget.releaseEntity(event.id));
  bus.on('run:waveMaterialized', event => receipts.push(event));
  const owner = Object.create(survivalWave); owner.init({ state, bus, helpers });
  try {
    const plan = planAt(3);
    bus.emit('run:wavePlanned', { wave: 3, plan });
    bus.emit('run:waveStarted', { wave: 3 });
    for (let tick = 1; tick <= 480; tick++) {
      state.tick = tick; state.simTime = tick / 60;
      // Defeat one ammunition body to create a genuine reinforcement vacancy.
      if (tick === 30) {
        const victim = state.entityList.find(entity => entity.alive && entity.data?.lootTableId === 'wasp_swarmer');
        assert.ok(victim); victim.alive = false; state.entities.delete(victim.id);
        bus.emit('entity:destroyed', { id: victim.id });
      }
      owner.update(1 / 60); bus.flush();
    }
    const pirates = receipts.filter(row => row.enemyId === 'reaver_pirate' && row.admitted > 0);
    assert.ok(pirates.length);
    assert.notEqual(pirates[0].reinforcement, true);
    assert.ok(pirates[0].atTick >= 120);
    assert.equal(pirates[0].admitted, 1);
    assert.equal(pirates[0].gateGroup, plan.packages.find(pkg => pkg.staged).gateGroup);
    assert.ok(budget.current() <= budget.max());
  } finally { owner.destroy(); resetSwarmPressureState(); }
});
