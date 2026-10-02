// FB-027 — a compositional champion telegraphs a NAMED hunter trick, not a stat bump.
//
// Each rotation row that is a composition (packages) assigns one of the shipped hunter tricks;
// each champion body is stamped as a bounty hunter of the crucible's own contract, so the
// telegraph → counter-window → activation → cooldown lifecycle is the exact path a bounty mark
// runs. Capital rows carry no trick — the score's beats already telegraph their own openings.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';
import { survivalWave } from '../src/systems/survivalWave.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import { bountyHunt } from '../src/systems/bountyHunt.js';
import { hunterTrickById } from '../src/data/hunterTricks.js';
import { SWARM_BOSS_ROTATION, SWARM_RULESET, swarmBossFor } from '../src/data/swarmMode.js';
import { SURVIVAL_COHORT_TAG } from '../src/systems/waveMaterialization.js';

const DT = 1 / 60;
const SEED = 4242;
const ARENA = 'helios_core';

function boot(wave) {
  const state = createGameState(SEED);
  state.mode = 'flight';
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit(event, payload) {
      emitted.push({ event, payload });
      raw.emit(event, payload);
    },
  };
  const budget = makeBudgetApi(state);
  const spawned = [];
  const helpers = {
    spawnBudget: budget,
    spawnEntity(spec) {
      const id = state.nextEntityId++;
      const entity = {
        ...spec, id, alive: true,
        pos: spec.pos ? { x: spec.pos.x, z: spec.pos.z } : { x: 0, z: 0 },
      };
      state.entities.set(id, entity);
      state.entityList.push(entity);
      spawned.push(entity);
      return entity;
    },
  };
  const player = { id: state.nextEntityId++, alive: true, pos: { x: 0, z: 0 }, type: 'ship', team: 0 };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  raw.on('entity:destroyed', (p) => budget.releaseEntity(p && p.id));
  state.run = createRunState({ kind: 'survival', ruleset: SWARM_RULESET, seed: SEED });
  state.run.arenaId = ARENA;
  state.run.phase = 'active';
  state.run.wave = wave;

  const ctx = { state, bus, helpers };
  survivalWave.init(ctx);
  const hunt = Object.create(bountyHunt);
  hunt.init({ state, bus, helpers });
  return { state, bus, emitted, spawned, hunt };
}

function step(h, n = 1) {
  for (let i = 0; i < n; i++) {
    h.state.tick += 1;
    h.state.simTime += DT;
    survivalWave.update(DT);
    h.hunt.update(DT, h.state);
  }
}

function startWave(h, wave) {
  const plan = planWave({ seed: SEED, arenaId: ARENA, wave, ruleset: SWARM_RULESET });
  assert.ok(!plan.error, `wave ${wave} plans`);
  h.bus.emit('run:wavePlanned', { wave, plan });
  h.bus.emit('run:waveStarted', { wave });
  step(h, 2);
}

function champions(h) {
  return h.spawned.filter((e) => e.data && e.data.bountyHunt && e.data.bountyHunt.role === 'hunter');
}
function named(h, event) {
  return h.emitted.filter((e) => e.event === event);
}

test('every compositional rotation row names a shipped trick; capital rows name none', () => {
  const tricked = {
    iron_maw: 'pd-curtain',
    corsair_wing: 'phase-jammer',
    the_anvil: 'shield-turtle',
    quiet_choir: 'sensor-ghost',
  };
  for (const boss of SWARM_BOSS_ROTATION) {
    if (boss.scoreId) {
      assert.equal(boss.trickId, undefined,
        `${boss.id} is a capital score — its beats are the telegraphs, a hunter verb would lie`);
      continue;
    }
    assert.equal(boss.trickId, tricked[boss.id], `${boss.id} carries its authored trick`);
    assert.ok(hunterTrickById(boss.trickId), `${boss.trickId} is a real trick id`);
  }
  // The plan carries the row's trick id so the wave owner can stamp it on each champion body.
  for (const [wave, trickId] of [[10, 'pd-curtain'], [40, 'phase-jammer'], [50, 'shield-turtle'], [60, 'sensor-ghost']]) {
    const plan = planWave({ seed: SEED, arenaId: ARENA, wave, ruleset: SWARM_RULESET });
    assert.equal(plan.swarm.bossTrickId, trickId, `wave ${wave}`);
  }
});

test('a corsair wing lands three hunters on the crucible contract and all telegraph the jam', () => {
  const h = boot(40);
  startWave(h, 40);
  const hunters = champions(h);
  assert.equal(hunters.length, 3, 'three raider aces, three hunters');
  for (const e of hunters) {
    assert.equal(e.data.lootTableId, 'corsair_raider');
    assert.equal(e.data.runCohort, SURVIVAL_COHORT_TAG);
    assert.equal(e.data.bountyHunt.contractId, 'swarm:champion:w40');
    assert.equal(e.data.bountyHunt.trickId, 'phase-jammer');
    assert.equal(e.data.contractTargetId, h.state.playerId,
      'the crucible contract targets the pilot — the hunter pursues them');
  }
  // Ordinary wave chaff never picks up a hunter stamp.
  const chaff = h.spawned.filter((e) => e.data && e.data.runCohort === SURVIVAL_COHORT_TAG
    && !(e.data.bountyHunt && e.data.bountyHunt.role === 'hunter'));
  assert.ok(chaff.length > 0, 'the wave still fields ordinary bodies');
  for (const e of chaff) assert.equal(e.data.bountyHunt, undefined);

  // First normalize marks them pursuing; the trick telegraphs on the shared path.
  step(h, 2);
  for (const e of hunters) {
    assert.equal(e.data.bountyHunt.pursuing, true);
    assert.equal(e.data.bountyHunt.trickState.phase, 'telegraphing');
    assert.ok(Number.isFinite(e.data.bountyHunt.trickState.telegraphHull),
      'the interrupt bookkeeping is live — damage during the window fizzles interruptible tricks');
    assert.equal(e.data.intent.mode, 'bounty_player');
  }
  const tells = named(h, 'bountyHunt:trickTelegraph');
  assert.equal(tells.filter((p) => p.payload.trickId === 'phase-jammer').length, 3);

  // Past the counter window the jam fires — once per hunter, then cooldown.
  step(h, Math.ceil(1.1 / DT) + 4);
  const fired = named(h, 'bountyHunt:trickActivated').filter((p) => p.payload.trickId === 'phase-jammer');
  assert.equal(fired.length, 3, 'each champion fires the trick once');
  for (const e of hunters) {
    assert.equal(e.data.bountyHunt.trickState.phase, 'cooldown');
    assert.equal(e.data.cm.effect.cfg.kind, 'ecm',
      'the phase jam writes the same ECM payload a bounty hunter\'s would');
  }
});

test('a capital champion never enters the hunter path — its score owns the telegraphs', () => {
  const h = boot(20);
  startWave(h, 20);
  const boss = h.spawned.find((e) => e.data && e.data.missionTag === 'capital_boss');
  assert.ok(boss, 'the Foreman landed');
  assert.equal(boss.data.bountyHunt, undefined, 'no hunter stamp on a score-owned hull');
  step(h, 8);
  const tells = named(h, 'bountyHunt:trickTelegraph').filter((p) => p.payload.entityId === boss.id);
  assert.equal(tells.length, 0, 'the score telegraphs; the hunter path stays out of its way');
});

test('the swarm stamp is the wave row, not the hull — a non-boss corsair raider stays ordinary', () => {
  // corsair_raider exists only as the wave-40 champion; fielding the row's trick is decided by
  // the PLAN's champion flag, never by the enemy id — the same hull on a contract stays clean.
  const h = boot(40);
  const before = champions(h).length;
  h.bus.emit('run:wavePlanned', {
    wave: 41,
    plan: planWave({ seed: SEED, arenaId: ARENA, wave: 41, ruleset: SWARM_RULESET }),
  });
  h.bus.emit('run:waveStarted', { wave: 41 });
  step(h, 3);
  assert.equal(champions(h).length, before, 'a non-champion wave adds no hunters');
  assert.equal(swarmBossFor(41), null, 'wave 41 fields no champion at all');
});
