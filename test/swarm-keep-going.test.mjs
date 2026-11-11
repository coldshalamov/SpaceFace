// C01-03 — win at thirty, then keep going as deep as you can last.
//
// The round-30 win is banked the moment it lands; the plate then offers exactly two ways
// off — Take the win (the ordinary hangar exit) and Keep going (the deep course, the old
// endless water: decade-mark champions, late brood families, strain variants, event
// rotations). A death past the win settles the post-win purse under the ordinary death
// rules and never unwrites the victory.

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
import { isSwarmDeepRun } from '../src/systems/survivalSwarm.js';
import {
  resultTitle, resultWinOffers, resultRows,
} from '../src/ui/screens/crucible.js';
import { swarmRoundWord } from '../src/ui/survivalHud.js';
import { TECH_NODES } from '../src/data/tech.js';
import {
  SWARM_RULESET, SWARM_WAVE_MAX, isSwarmBossWave, swarmBossFor,
} from '../src/data/swarmMode.js';
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

// The same owner stack the real route runs: runSession writes the phase, survivalRun walks
// it, survivalWave owns the round and calls it cleared, survivalResults settles the record.
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

/** Put the run into draft one round shy of `target`, then let the pick launch it. */
function beginAtRound(h, target) {
  assert.equal(h.state.run.phase, 'draft', `draft expected before round ${target}`);
  h.state.run.wave = target - 1;
  h.bus.emit('run:draftPickRequested', { offerId: null });
  // A pick on a refit gate (the decade marks) benches first — the draft->refit hop lands
  // inside the update ticks, then the armory's close walks it on to the intro.
  step(h, 4);
  for (let i = 0; i < 4 && h.state.run.phase === 'refit'; i++) {
    h.bus.emit('run:refitClosed', {});
    step(h, 4);
  }
  step(h, SURVIVAL_WAVE_INTRO_TICKS + 8);
  assert.equal(h.state.run.phase, 'active');
  assert.equal(h.state.run.wave, target);
}

function beginRun(h) {
  h.bus.emit('run:beginRequested', {
    kind: 'survival', ruleset: SWARM_RULESET, seed: SEED, arenaId: ARENA,
  });
  transition(h, 'loadout', 'draft');
  assert.equal(h.state.run.phase, 'draft');
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
function clearTheRound(h, wave) {
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
  beginAtRound(h, FINAL);
  clearTheRound(h, FINAL);
  for (let i = 0; i < 600 && h.state.run.phase !== 'victory'; i++) step(h);
  assert.equal(h.state.run.phase, 'victory', 'the cleared last round lands the win');
}

/** Walk a cleared round's cleanup back to the between-round pause. */
function cleanupToDraft(h) {
  for (let i = 0; i < 600 && h.state.run.phase !== 'draft'; i++) step(h);
  assert.equal(h.state.run.phase, 'draft', 'the cleared round returns to the pause');
}

test('the round-30 win offers exactly Take the win and Keep going', () => {
  const h = boot();
  beginRun(h);
  runToVictory(h);
  const result = named(h, 'run:resultsReady').at(-1).payload;
  assert.equal(result.outcome, 'victory');
  assert.equal(resultTitle(result), 'THE PIT IS YOURS');
  const offers = resultWinOffers(result);
  assert.deepEqual(offers.map((o) => o.label), ['Take the win', 'Keep going'],
    'the win plate offers exactly the two authored choices');
  const ledger = Object.fromEntries(resultRows(result));
  assert.equal(ledger['Deepest round'], '30', 'the ledger files the deepest round');
});

test('Keep going resumes the course at round 31 — the deep water opens', () => {
  const h = boot();
  beginRun(h);
  runToVictory(h);
  h.bus.emit('run:swarmDeepRequested', {});
  assert.equal(h.state.run.phase, 'draft',
    'the resume lands in the ordinary between-round pause');
  assert.ok(isSwarmDeepRun(h.state.run), 'the run wears the deep stamp');
  assert.equal(h.state.run.wave, FINAL, 'the wave counter kept the win');
  // The win purse is spent home — what the deep run earns settles under its own ending.
  assert.equal(h.state.run.credits, 0, 'the banked purse left the wallet');

  // The ordinary draft pick launches round 31 — the wave-30 bench sits between the card
  // and the launch on a refit gate, so the armory's close walks it onward.
  h.bus.emit('run:draftPickRequested', { offerId: null });
  step(h, 4);
  for (let i = 0; i < 4 && h.state.run.phase === 'refit'; i++) {
    h.bus.emit('run:refitClosed', {});
    step(h, 4);
  }
  step(h, SURVIVAL_WAVE_INTRO_TICKS + 8);
  assert.equal(h.state.run.phase, 'active');
  assert.equal(h.state.run.wave, 31);
  const plan31 = named(h, 'run:wavePlanned').find((e) => e.payload.wave === 31)?.payload?.plan;
  assert.ok(plan31 && !plan31.error, 'round 31 plans');
  assert.equal(plan31.swarm.boss, false, 'round 31 is no champion row on the deep clock');
  assert.equal(swarmRoundWord(h.state.run), 'ROUND 31 · DEEP',
    'the round counter reads the deep water');

  // Round 31 is a live fight that clears back into the same pause.
  clearTheRound(h, 31);
  cleanupToDraft(h);
  assert.ok(isSwarmDeepRun(h.state.run), 'the deep stamp rides the pause');
});

test('the deep course fields its authored champions on the decade marks', () => {
  // The old course's own rows: a champion every tenth round, in the authored rotation.
  const table = [
    [40, 'corsair_wing'], [50, 'the_anvil'], [60, 'quiet_choir'], [70, 'brood_queen'],
    [80, 'brood_tendril'], [90, 'nest_carrier'], [100, 'casket_worm'], [110, 'furnace_maw'],
    [120, 'yardmaster'], [130, 'adjudicator_44c'], [140, 'hive_hulk'],
  ];
  for (const [wave, id] of table) {
    assert.equal(isSwarmBossWave(wave), true, `wave ${wave} is a champion row`);
    assert.equal(swarmBossFor(wave).id, id, `wave ${wave} seats ${id}`);
  }
  for (const wave of [31, 35, 45, 55, 75, 85, 95, 105, 115, 125, 135, 145]) {
    assert.equal(isSwarmBossWave(wave), false, `wave ${wave} is no champion row`);
  }
});

test('a death past the win settles the post-win purse — the victory stays banked', () => {
  const h = boot();
  beginRun(h);
  runToVictory(h);
  const winResult = named(h, 'run:resultsReady').at(-1).payload;
  assert.equal(winResult.outcome, 'victory');
  assert.equal(named(h, 'run:resultsReady').length, 1);

  h.bus.emit('run:swarmDeepRequested', {});
  // Sail to round 35 through the ordinary pause, then die inside it.
  beginAtRound(h, 35);
  const plan35 = named(h, 'run:wavePlanned').find((e) => e.payload.wave === 35)?.payload?.plan;
  assert.ok(plan35 && !plan35.error, 'round 35 plans');
  assert.equal(plan35.swarm.boss, false, 'round 35 is no champion row');
  // Give the run post-win earnings so the death settle has a purse to split.
  h.state.run.credits = 400;
  const bountyBefore = loadCrucibleMeta(h.storage).hangar.bounty;
  h.bus.emit('run:endRequested', { outcome: 'defeat', reason: 'dead', tick: h.state.tick });

  const results = named(h, 'run:resultsReady');
  assert.equal(results.length, 2, 'a second result publishes for the deep ending');
  const death = results.at(-1).payload;
  assert.equal(death.outcome, 'defeat');
  assert.equal(death.deepestWave, 35, 'the deepest round reached is filed');
  const ledger = Object.fromEntries(resultRows(death));
  assert.equal(ledger['Deepest round'], '35');

  // The record: one win, and the deepest round moved to 35 — the win was never unwritten.
  const meta = loadCrucibleMeta(h.storage);
  const row = Object.values(meta.records.byKey)[0];
  assert.equal(row.victories, 1, 'the round-30 win still counts once');
  assert.equal(row.deepestWave, 35, 'the record holds the deepest round');
  assert.equal(meta.records.lifetime.victories, 1);
  assert.equal(meta.records.lifetime.deepestWave, 35);
  // Ordinary death rules: half the post-win purse banks home.
  const bountyAfter = loadCrucibleMeta(h.storage).hangar.bounty;
  assert.equal(bountyAfter, bountyBefore + 200,
    'the post-win purse banks at the death fraction, never re-banking the win');
});

test('Take the win keeps the terminal path — the run retires as a victory', () => {
  const h = boot();
  beginRun(h);
  runToVictory(h);
  // Take the win is the ordinary hangar exit: the victory stays put and the run tears
  // down through its authored leave, never resuming the course.
  transition(h, 'victory', 'inactive');
  step(h, 120);
  assert.equal(named(h, 'run:resultsReady').length, 1, 'no second result publishes');
  assert.equal(named(h, 'run:wavePlanned').some((e) => e.payload.wave > FINAL), false,
    'the course never plans a thirty-first round');
  const meta = loadCrucibleMeta(h.storage);
  const row = Object.values(meta.records.byKey)[0];
  assert.equal(row.victories, 1);
  assert.equal(row.deepestWave, FINAL, 'the run reached the course edge and stopped');
});
