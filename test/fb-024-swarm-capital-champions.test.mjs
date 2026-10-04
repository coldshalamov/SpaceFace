// FB-024 — the Foreman and the Regent field as AUTHORED CAPITAL SCORES, not scaled raiders.
//
// Wave 20 and wave 30 put a single capital hull on the board whose fight is the shipped score
// machine: `capitalBoss:start` opens a fight record, the system's orders gate the hull's fire
// and movement, its acts advance on hull thresholds, its wing request spawns through the
// survival budget as run cohort, and its end detaches with the wave. These tests drive the
// real wave owner and the real production ports — no stub score.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';
import { survivalWave } from '../src/systems/survivalWave.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import { createProductionCapitalBossEncounters } from '../src/systems/capitalBossRuntime.js';
import { capitalOrderKey } from '../src/ai/capitalBossOrders.js';
import { SWARM_RULESET, swarmBossFor } from '../src/data/swarmMode.js';
import { SURVIVAL_COHORT_TAG } from '../src/systems/waveMaterialization.js';

const DT = 1 / 60;
const SEED = 4242;
const ARENA = 'helios_core';

function boot(wave) {
  const state = createGameState(SEED);
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
    routeCombatDamage(packet) { return packet; },
    spawnEntity(spec) {
      const id = state.nextEntityId++;
      const entity = {
        ...spec,
        id,
        alive: true,
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
  const capSys = createProductionCapitalBossEncounters();
  capSys.init(ctx);
  return { state, bus, emitted, spawned, capSys };
}

function tick(h, n = 1) {
  for (let i = 0; i < n; i++) {
    h.state.tick += 1;
    h.state.simTime += DT;
    survivalWave.update(DT);
    h.capSys.update(DT);
  }
}

function planFor(wave) {
  const plan = planWave({ seed: SEED, arenaId: ARENA, wave, ruleset: SWARM_RULESET });
  assert.ok(!plan.error, `wave ${wave} plans`);
  return plan;
}

function startWave(h, wave) {
  h.bus.emit('run:wavePlanned', { wave, plan: planFor(wave) });
  h.bus.emit('run:waveStarted', { wave });
  tick(h, 2);
}

function cohort(h) {
  return h.spawned.filter((e) => e.data && e.data.runCohort === SURVIVAL_COHORT_TAG);
}
function capitalBody(h) {
  return cohort(h).find((e) => e.data.missionTag === 'capital_boss');
}
function fightStore(h) {
  return h.state.capitalBossEncounters;
}
function named(h, event) {
  return h.emitted.filter((e) => e.event === event);
}

test('the rotation walks eight champions — capital scores at wave 20, 30, 70 and 80', () => {
  const order = ['iron_maw', 'mirrorjaw_foreman', 'forge_regent', 'corsair_wing', 'the_anvil',
    'quiet_choir', 'brood_queen', 'brood_tendril'];
  for (const [i, wave] of [10, 20, 30, 40, 50, 60, 70, 80].entries()) {
    const boss = swarmBossFor(wave);
    assert.equal(boss && boss.id, order[i], `wave ${wave}`);
  }
  assert.equal(swarmBossFor(90).id, 'iron_maw', 'the rotation wraps after the eighth');
  const w20 = planFor(20).swarm;
  assert.equal(w20.bossScoreId, 'capital_boss_foreman');
  assert.equal(w20.bossEnemyId, 'mirrorjaw_foreman');
  assert.equal(w20.bossRoom, 'mirror_lane');
  assert.equal(w20.bossTrickId, null, 'a capital row never carries a hunter trick');
  const w30 = planFor(30).swarm;
  assert.equal(w30.bossScoreId, 'capital_boss_regent');
  assert.equal(w30.bossEnemyId, 'forge_regent');
  assert.equal(w30.bossRoom, 'crown_furnace');
  // Each capital row fields exactly one champion package — the hull the score will fly.
  for (const wave of [20, 30]) {
    const champions = planFor(wave).packages.filter((p) => p.champion === true);
    assert.equal(champions.length, 1, `wave ${wave} fields one capital hull`);
    assert.equal(champions[0].enemyId, wave === 20 ? 'mirrorjaw_foreman' : 'forge_regent');
    assert.equal(champions[0].count, 1);
  }
});

test('a landed capital champion opens its score and hands its hull to the orders', () => {
  const h = boot(20);
  startWave(h, 20);
  const boss = capitalBody(h);
  assert.ok(boss, 'the Foreman hull is a real cohort body');
  assert.equal(boss.data.lootTableId, 'mirrorjaw_foreman');
  assert.equal(boss.data.runWave, 20);
  assert.equal(boss.data.bountyHunt, undefined, 'capital champions never enter the hunter path');

  const fight = fightStore(h).fights['swarm:w20'];
  assert.ok(fight, 'capitalBoss:start opened a fight record');
  assert.equal(fight.encounterId, 'capital_boss_foreman');
  assert.equal(fight.bossId, boss.id);
  assert.equal(fight.targetId, h.state.playerId);

  // The score owns the hull's trigger before its first AI tick.
  const order = fightStore(h).orders[capitalOrderKey(boss.id)];
  assert.ok(order, 'the boss hull is under a capital order');
  assert.equal(order.scoreOwnsAttacks, true);
  assert.equal(order.suppressStockFire, true);
});

test('the score runs: the fight starts, telegraphs, and the wing request fields a real screen', () => {
  const h = boot(20);
  startWave(h, 20);
  const boss = capitalBody(h);
  // Drive through the 180-tick intro — the fight must reach an act on its own observation.
  tick(h, 210);
  const fight = fightStore(h).fights['swarm:w20'];
  assert.equal(fight.started, true, 'the score is running on the live pair');
  assert.ok(named(h, 'capitalBoss:started').length > 0);

  // Push the hull under act II's threshold — the wing call arrives with the act.
  boss.hull = Math.floor(boss.hullMax * 0.5);
  tick(h, 40);
  assert.equal(fight.actIndex >= 1, true, 'act II entered on the hull threshold');
  assert.ok(named(h, 'capitalBoss:wingRequested').length > 0, 'the screen was requested');

  // The wing spawned through the survival port: run-cohort stamped, hunting the pilot,
  // and joined into the wave's own accounting. The join receipt — not a role guess — is the
  // member list, since ordinary wave-20 chaff carries the same `runWave` stamp.
  const joins = named(h, 'survivalWave:cohortJoined');
  assert.ok(joins.length > 0, 'wing members were registered into the wave cohort');
  const memberIds = joins.flatMap((e) => e.payload.ids);
  const wingMembers = memberIds.map((id) => h.state.entities.get(id)).filter(Boolean);
  assert.ok(wingMembers.length >= 2, 'the wing materialized as real bodies');
  for (const member of wingMembers) {
    assert.equal(member.data.runCohort, SURVIVAL_COHORT_TAG);
    assert.equal(member.data.runWave, 20);
    assert.equal(member.data.ai.huntPlayer, true);
    assert.equal(member.data.ai.forcePlayerTarget, true);
  }

  // The wing flies under the fight's fire gate, not on its own stock triggers.
  for (const member of wingMembers) {
    const o = fightStore(h).orders[capitalOrderKey(member.id)];
    assert.ok(o && o.fightId === 'swarm:w20', 'wing member is under the fight\'s order ledger');
    assert.equal(o.suppressStockFire, true, 'wing fire waits for the recovery gate');
  }
});

test('killing the champion ends the fight, and the next wave detaches the record', () => {
  const h = boot(20);
  startWave(h, 20);
  const boss = capitalBody(h);
  tick(h, 200);
  assert.equal(fightStore(h).fights['swarm:w20'].started, true);

  boss.alive = false;
  boss.hull = 0;
  h.bus.emit('entity:killed', { id: boss.id });
  tick(h, 3);
  const fight = fightStore(h).fights['swarm:w20'];
  assert.ok(fight.terminal, 'champion death is the score\'s victory, not a disappearance');
  assert.equal(fight.terminal, 'victory');

  // Wave planning reaps the fight record — the ledger never outlives its round.
  h.bus.emit('run:wavePlanned', { wave: 21, plan: planFor(21) });
  assert.equal(fightStore(h).fights['swarm:w20'], undefined, 'the fight detached at wave reset');
  const leftover = Object.values(fightStore(h).orders).filter((o) => o.fightId === 'swarm:w20');
  assert.equal(leftover.length, 0, 'its orders released with it');
});

test('the Regent fields the same machinery on wave 30', () => {
  const h = boot(30);
  startWave(h, 30);
  const boss = capitalBody(h);
  assert.ok(boss, 'the Regent hull landed');
  assert.equal(boss.data.lootTableId, 'forge_regent');
  const fight = fightStore(h).fights['swarm:w30'];
  assert.ok(fight);
  assert.equal(fight.encounterId, 'capital_boss_regent');
  tick(h, 200);
  assert.equal(fight.started, true);
});
