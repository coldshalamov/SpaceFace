// C01-01 — a Swarm run can be won at round thirty.
//
// The Pit is a finite course. Clearing round thirty — its champion dead and the round's
// remaining enemies down — ends the run as a win; dying inside that round stays a loss.
// The record counts the win once and holds the line's fastest sim time.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';
import { runSession } from '../src/systems/runSession.js';
import { survivalResults } from '../src/systems/survivalResults.js';
import {
  survivalRun,
  SURVIVAL_WAVE_INTRO_TICKS,
} from '../src/systems/survivalRun.js';
import { survivalWave } from '../src/systems/survivalWave.js';
import { survivalDraft } from '../src/systems/survivalDraft.js';
import { ships } from '../src/systems/ships.js';
import { economy } from '../src/systems/economy.js';
import { createProductionCapitalBossEncounters } from '../src/systems/capitalBossRuntime.js';
import {
  loadCrucibleMeta,
  resetCrucibleMetaForTests,
  useCrucibleMetaClock,
  useCrucibleMetaStorage,
} from '../src/systems/survivalRecords.js';
import { resultTitle } from '../src/ui/screens/crucible.js';
import { TECH_NODES } from '../src/data/tech.js';
import {
  SWARM_RULESET,
  SWARM_WAVE_MAX,
  isSwarmBossWave,
  swarmBossFor,
} from '../src/data/swarmMode.js';
import { swarmStartAtRound } from '../src/data/swarmLadder.js';
import { SURVIVAL_COHORT_TAG } from '../src/systems/waveMaterialization.js';

const DT = 1 / 60;
const SEED = 4242;
const ARENA = 'helios_core';
const FINAL = SWARM_WAVE_MAX;

function memoryStorage() {
  const map = new Map();
  return {
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(String(key), String(value)); },
    removeItem(key) { map.delete(key); },
  };
}

// The same owner stack the real route runs: runSession writes the phase, survivalRun walks it,
// survivalWave owns the round and calls it cleared, survivalResults settles the record.
function boot({ storage = memoryStorage() } = {}) {
  resetCrucibleMetaForTests();
  useCrucibleMetaClock(() => '2026-11-11T00:00:00.000Z');
  useCrucibleMetaStorage(storage);
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
  const registry = {
    get(name) {
      if (name === 'ships') return ships;
      if (name === 'economy') return economy;
      if (name === 'survivalDraft') return survivalDraft;
      return null;
    },
  };
  const ctx = { state, bus, helpers, registry };
  economy.init(ctx);
  ships.init(ctx);
  runSession.init(ctx);
  survivalResults.init(ctx);
  survivalRun.init(ctx);
  survivalWave.init(ctx);
  survivalDraft.init(ctx);
  const capSys = createProductionCapitalBossEncounters();
  capSys.init(ctx);
  if (economy.newGame) economy.newGame();
  if (ships.newGame) ships.newGame();
  state.player.researchPoints += TECH_NODES.reduce((s, n) => s + ((n.cost && n.cost.rp) || 0), 0) + 1000;
  const cost = TECH_NODES.reduce((s, n) => s + ((n.cost && n.cost.credits) || 0), 0);
  if (cost > 0) economy.grantCredits(cost, 'test:tech');
  for (let pass = 0; pass < TECH_NODES.length + 1; pass++) {
    let progressed = false;
    for (const node of TECH_NODES) {
      if (!state.player.researchedNodes.includes(node.id) && ships.unlockTech(node.id)) progressed = true;
    }
    if (!progressed) break;
  }
  ships.buyShip({ defId: 'ship_hornet', setActive: true, grant: true });
  const player = helpers.spawnEntity({ type: 'ship', alive: true,
    pos: { x: 200, z: 0 }, hull: 260, hullMax: 260, radius: 16, team: 0 });
  state.playerId = player.id;
  raw.on('entity:destroyed', (p) => budget.releaseEntity(p && p.id));
  return { state, bus, emitted, spawned, capSys, storage };
}

function step(h, n = 1) {
  for (let i = 0; i < n; i++) {
    h.state.tick += 1;
    h.state.simTime += DT;
    survivalRun.update(DT);
    survivalWave.update(DT);
    h.capSys.update(DT);
  }
}

function named(h, event) {
  return h.emitted.filter((entry) => entry.event === event);
}

function transition(h, expectedPhase, nextPhase) {
  h.bus.emit('run:transitionRequested', {
    expectedPhase, nextPhase, reason: 't', tick: 0,
  });
}

/** The run has flown twenty-nine rounds; the next pick launches the last one. */
function beginAtFinalRound(h) {
  h.bus.emit('run:beginRequested', {
    kind: 'survival', ruleset: SWARM_RULESET, seed: SEED, arenaId: ARENA,
  });
  transition(h, 'loadout', 'draft');
  assert.equal(h.state.run.phase, 'draft');
  h.state.run.wave = FINAL - 1;
  h.bus.emit('run:draftPickRequested', { offerId: null });
  step(h, SURVIVAL_WAVE_INTRO_TICKS + 8);
  assert.equal(h.state.run.phase, 'active');
  assert.equal(h.state.run.wave, FINAL);
}

function liveCohort(h) {
  return h.state.entityList.filter(
    (e) => e.alive && e.data && e.data.runCohort === SURVIVAL_COHORT_TAG,
  );
}

function clearedWave(h, wave) {
  return named(h, 'run:waveCleared').some((e) => e.payload && e.payload.wave === wave);
}

/** Kill every body the round fields until its owner calls it cleared. */
function clearTheRound(h, wave = FINAL) {
  for (let i = 0; i < 40000 && !clearedWave(h, wave); i++) {
    for (const e of liveCohort(h)) {
      e.alive = false;
      h.bus.emit('entity:killed', { id: e.id, tick: h.state.tick });
      h.bus.emit('entity:destroyed', { id: e.id, tick: h.state.tick });
    }
    step(h);
  }
  assert.ok(clearedWave(h, wave), `round ${wave} never called itself cleared`);
}

/** Drive a live round-30 fight to the win: cohort resolved, cleanup walked, victory landed. */
function runToVictory(h) {
  beginAtFinalRound(h);
  const plan = named(h, 'run:wavePlanned').find((e) => e.payload.wave === FINAL)?.payload?.plan;
  assert.ok(plan && !plan.error, 'round 30 plans');
  assert.equal(plan.swarm.bossId, 'forge_regent', 'the Forge Regent holds round thirty');
  assert.equal(plan.swarm.boss, true);
  assert.equal(plan.swarm.requireBoss, true, 'the champion is owed as a real kill');
  clearTheRound(h);
  for (let i = 0; i < 600 && h.state.run.phase !== 'victory'; i++) step(h);
  assert.equal(h.state.run.phase, 'victory', 'the cleared last round lands the win');
}

test('the course is thirty rounds and round thirty belongs to the Forge Regent', () => {
  assert.equal(FINAL, 30, 'the Pit ends at thirty');
  for (const wave of [5, 10, 15, 20, 25, 30]) {
    assert.equal(isSwarmBossWave(wave), true, `round ${wave} is a champion`);
  }
  for (const wave of [1, 4, 6, 9, 11, 24, 26, 29]) {
    assert.equal(isSwarmBossWave(wave), false, `round ${wave} is not`);
  }
  const order = [5, 10, 15, 20, 25, 30].map((wave) => swarmBossFor(wave).id);
  assert.deepEqual(order, [
    'iron_maw', 'corsair_wing', 'mirrorjaw_foreman', 'yardmaster', 'the_anvil', 'forge_regent',
  ], 'the design bosses hold their authored rounds');
  // The dev route check the packet asks for: ?swarmRound=30 opens on the final fight.
  const start = swarmStartAtRound('30');
  assert.equal(start.startWave, FINAL, '?swarmRound=30 opens on the last round');
  assert.equal(swarmBossFor(start.startWave).id, 'forge_regent', 'the route reaches the boss');
});

test('clearing round thirty — champion and every body it fields — wins the run', () => {
  const h = boot();
  runToVictory(h);
  const results = named(h, 'run:resultsReady');
  const result = results.at(-1).payload;
  assert.equal(result.outcome, 'victory', 'the run ends as a win');
  assert.equal(result.wave, FINAL);
  assert.equal(resultTitle(result), 'THE PIT IS YOURS');
  // No endless play: after the win the machine never plans a thirty-first round.
  step(h, 120);
  assert.equal(h.state.run.phase, 'victory');
  assert.equal(named(h, 'run:wavePlanned').some((e) => e.payload.wave > FINAL), false);
});

test('dying inside round thirty is still a loss', () => {
  const h = boot();
  beginAtFinalRound(h);
  h.bus.emit('run:endRequested', { outcome: 'defeat', reason: 'dead', tick: h.state.tick });
  const result = named(h, 'run:resultsReady').at(-1).payload;
  assert.equal(result.outcome, 'defeat');
  assert.equal(h.state.run.phase, 'ended');
  assert.equal(resultTitle(result), 'Run Over', 'the loss keeps today’s screen');
});

test('the record counts the win once and keeps the line’s fastest sim time', () => {
  const h = boot();
  runToVictory(h);
  const meta = loadCrucibleMeta(h.storage);
  const rows = Object.values(meta.records.byKey);
  assert.equal(rows.length, 1, 'the win writes exactly one record line');
  assert.equal(rows[0].victories, 1, 'records count the win once');
  assert.equal(rows[0].attempts, 1);
  assert.ok(Number.isFinite(rows[0].bestWinTimeS) && rows[0].bestWinTimeS > 0,
    'the win time is filed');
  assert.equal(meta.records.lifetime.victories, 1);
  // A loss on the same line bumps attempts and never the win count.
  h.bus.emit('run:transitionRequested',
    { expectedPhase: 'victory', nextPhase: 'inactive', reason: 't', tick: 0 });
  h.bus.emit('run:beginRequested', {
    kind: 'survival', ruleset: SWARM_RULESET, seed: SEED, arenaId: ARENA,
  });
  transition(h, 'loadout', 'draft');
  h.state.run.wave = FINAL - 1;
  h.bus.emit('run:draftPickRequested', { offerId: null });
  step(h, SURVIVAL_WAVE_INTRO_TICKS + 8);
  assert.equal(h.state.run.phase, 'active');
  h.bus.emit('run:endRequested', { outcome: 'defeat', reason: 'dead', tick: h.state.tick });
  const after = loadCrucibleMeta(h.storage);
  const row = Object.values(after.records.byKey)[0];
  assert.equal(row.victories, 1, 'a loss never touches the win count');
  assert.equal(row.attempts, 2);
  assert.equal(after.records.lifetime.victories, 1);
});
