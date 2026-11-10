// RC-02 — the round-10 boss runs its AUTHORED Iron Maw score, not a stock dreadnought carrying
// a hunter trick. The `iron_maw` rotation row now wires `enemyId`+`scoreId` like every other
// capital row (FB-024), so the wave owner materializes the same one dreadnought_boss hull it
// always fielded and hands it to `capital_boss_hulk`: `capitalBoss:start` opens the fight, the
// score's orders gate its fire, the acts advance on hull thresholds, and the named beats
// (SOUNDING SHOT, PORT BATTERY, KEELBREAKER) telegraph and fire on the roster clock.
// Same seed-4242 harness as fb-024-swarm-capital-champions — the real wave owner and the real
// production ports, no stub score.

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
import {
  SWARM_RULESET, swarmBossFor, bossPackagesFor, swarmCatalogIssues, swarmEligibleEnemyIds,
} from '../src/data/swarmMode.js';
import { requireCapitalBossEncounter } from '../src/data/encounters/capital-boss.js';
import { SURVIVAL_COHORT_TAG } from '../src/systems/waveMaterialization.js';

const DT = 1 / 60;
const SEED = 4242;
const ARENA = 'helios_core';
const IRON_MAW_BEATS = new Set(requireCapitalBossEncounter('capital_boss_hulk').score.beats.map((b) => b.id));

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

function capitalBody(h) {
  return h.spawned.find((e) => e.data && e.data.runCohort === SURVIVAL_COHORT_TAG
    && e.data.missionTag === 'capital_boss');
}
function fightStore(h) {
  return h.state.capitalBossEncounters;
}
function named(h, event) {
  return h.emitted.filter((e) => e.event === event);
}

test('the wave-10 row resolves the authored script id and the same single hull', () => {
  const boss = swarmBossFor(10);
  assert.equal(boss.id, 'iron_maw');
  assert.equal(boss.scoreId, 'capital_boss_hulk');
  assert.equal(boss.enemyId, 'dreadnought_boss', 'the Iron Maw hull def, unchanged');
  assert.equal(boss.trickId, undefined, 'a capital row never carries a hunter trick');
  assert.equal(boss.packages, undefined, 'capital rows carry enemyId, not packages');
  // The implied package is exactly what the old compositional row fielded: one elite hull.
  assert.deepEqual(bossPackagesFor(boss), [{ enemyId: 'dreadnought_boss', count: 1, role: 'elite' }]);

  const plan = planFor(10);
  const swarm = plan.swarm;
  assert.equal(swarm.bossScoreId, 'capital_boss_hulk');
  assert.equal(swarm.bossEnemyId, 'dreadnought_boss');
  assert.equal(swarm.bossTrickId, null);
  const champions = plan.packages.filter((p) => p.champion === true);
  assert.equal(champions.length, 1, 'wave 10 fields one capital hull');
  assert.equal(champions[0].enemyId, 'dreadnought_boss');
  assert.equal(champions[0].count, 1);

  // The score id must name a shipped encounter and the hull a catalog id — the validator
  // is the tripwire a typo'd wiring trips on.
  assert.equal(requireCapitalBossEncounter('capital_boss_hulk').score.name, 'IRON MAW');
  assert.ok(swarmEligibleEnemyIds(10).has('dreadnought_boss'), 'the boss hull stays prewarmed');
  assert.deepEqual(swarmCatalogIssues(), [], 'the whole swarm catalog still resolves');
});

test('the landed champion opens the Iron Maw score and the script moves', () => {
  const h = boot(10);
  startWave(h, 10);
  const boss = capitalBody(h);
  assert.ok(boss, 'the dreadnought hull is a real cohort body stamped capital_boss');
  assert.equal(boss.data.lootTableId, 'dreadnought_boss');
  assert.equal(boss.data.runWave, 10);
  assert.equal(boss.data.bountyHunt, undefined, 'no hunter trick on a capital champion');

  const start = named(h, 'capitalBoss:start');
  assert.equal(start.length, 1, 'capitalBoss:start fired exactly once');
  assert.equal(start[0].payload.encounterId, 'capital_boss_hulk');
  const fight = fightStore(h).fights['swarm:w10'];
  assert.ok(fight, 'the fight record opened under the wave fight id');
  assert.equal(fight.encounterId, 'capital_boss_hulk');
  assert.equal(fight.bossId, boss.id);
  assert.equal(fight.targetId, h.state.playerId);

  // The score owns the hull's trigger before its first AI tick — stock fire is suppressed.
  const order = fightStore(h).orders[capitalOrderKey(boss.id)];
  assert.ok(order, 'the boss hull is under a capital order');
  assert.equal(order.scoreOwnsAttacks, true);
  assert.equal(order.suppressStockFire, true);

  // Drive through the intro (180) and act-I transition (150): the authored pattern must be
  // what telegraphs and fires — the script's own named moves, not generic AI shots.
  tick(h, 700);
  assert.equal(fight.started, true, 'the score is running on the live pair');
  assert.ok(named(h, 'capitalBoss:started').length > 0);
  assert.equal(fight.actIndex, 0, 'act I · THE BEARING is the entered act');
  const telegraphs = named(h, 'capitalBoss:telegraph');
  const attacks = named(h, 'capitalBoss:attack');
  assert.ok(telegraphs.length > 0, 'the script telegraphs');
  assert.ok(attacks.length > 0, 'the script fires authored beats');
  const beatIds = new Set([...telegraphs, ...attacks].map((e) => e.payload.beatId));
  assert.ok(beatIds.size > 0 && [...beatIds].every((id) => IRON_MAW_BEATS.has(id)),
    `every move is an Iron Maw beat, saw ${[...beatIds].join(', ')}`);
  assert.ok(beatIds.has('sounding_shot'), 'the lesson shot is the opener the score authored');
  assert.ok(fight.telemetry.casts > 0, 'the fight ledger counts real casts');
});

test('the act structure is the authored one: act II calls the maw screen wing', () => {
  const h = boot(10);
  startWave(h, 10);
  const boss = capitalBody(h);
  tick(h, 400);
  const fight = fightStore(h).fights['swarm:w10'];
  assert.equal(fight.started, true);

  // Push the hull under act II's authored threshold — II · THE BROKEN RUDDER requests the
  // warden screen the score wrote for itself.
  boss.hull = Math.floor(boss.hullMax * 0.5);
  tick(h, 40);
  assert.equal(fight.actIndex, 1, 'act II entered on the hull threshold');
  const wings = named(h, 'capitalBoss:wingRequested');
  assert.ok(wings.length > 0, 'the score requested its screen');
  assert.equal(wings[0].payload.wing.id, 'maw_screen');

  // The wing materializes through the survival port as real run-cohort bodies.
  const joins = named(h, 'survivalWave:cohortJoined');
  assert.ok(joins.length > 0, 'wing members were registered into the wave cohort');
  const memberIds = joins.flatMap((e) => e.payload.ids);
  assert.equal(memberIds.length, 2, 'the maw screen is the authored two-ship wedge');
});

test('killing the champion resolves the score as a victory, not a disappearance', () => {
  const h = boot(10);
  startWave(h, 10);
  const boss = capitalBody(h);
  tick(h, 200);

  boss.alive = false;
  boss.hull = 0;
  h.bus.emit('entity:killed', { id: boss.id });
  tick(h, 3);
  const fight = fightStore(h).fights['swarm:w10'];
  assert.equal(fight.terminal, 'victory', 'champion death is the score\u2019s authored ending');

  h.bus.emit('run:wavePlanned', { wave: 11, plan: planFor(11) });
  assert.equal(fightStore(h).fights['swarm:w10'], undefined, 'the fight detaches with the wave');
});
