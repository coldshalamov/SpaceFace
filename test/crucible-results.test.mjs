// CRU-018 — the run ends with an explanation, and the same seed can be run again.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { runSession } from '../src/systems/runSession.js';
import {
  deathSentence,
  outcomeSentence,
  survivalResults,
} from '../src/systems/survivalResults.js';
import {
  CRUCIBLE_ARENA_ID,
  clearCrucibleSetup,
  crucibleLaunchConfig,
  crucibleSetupFor,
  lastCrucibleSetup,
  normalizeSeed,
  requestCrucibleRun,
} from '../src/ui/crucibleLaunch.js';
import { resultRows } from '../src/ui/screens/crucible.js';
import { PRODUCTION_UPDATE_ORDER } from '../src/runtime/authoritativeSystemManifest.js';

const SEED = 7;

function boot(seed = SEED) {
  const state = createGameState(seed);
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
  const player = { id: 1, alive: true, pos: { x: 0, z: 0 }, type: 'ship' };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  state.nextEntityId = 2;
  const ctx = { state, bus, helpers: {} };
  runSession.init(ctx);
  survivalResults.init(ctx);
  return { state, bus, emitted, ctx, player };
}

function named(emitted, event) {
  return emitted.filter((entry) => entry.event === event);
}

function beginActive(harness) {
  harness.bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'scored', seed: SEED, arenaId: CRUCIBLE_ARENA_ID });
  let from = 'loadout';
  for (const next of ['arena_intro', 'wave_intro', 'active']) {
    harness.bus.emit('run:transitionRequested', { expectedPhase: from, nextPhase: next, reason: 't', tick: 0 });
    from = next;
  }
}

function cohortKill(harness) {
  const id = harness.state.nextEntityId++;
  const entity = { id, alive: true, type: 'ship', team: 1, pos: { x: 5, z: 5 }, data: { level: 1, runCohort: 'survival' } };
  harness.state.entities.set(id, entity);
  entity.alive = false;
  harness.bus.emit('entity:killed', { id, killerId: 1, type: 'ship', pos: { x: 5, z: 5 } });
}

const DEFEAT_RECEIPT = Object.freeze({
  attacker: 'Reaver Corsair',
  faction: 'Crimson Reach',
  weapon: 'Heavy Autocannon M',
  direction: 'behind',
  dominantLayer: 'hull',
  cause: 'Destroyed by Reaver Corsair',
  fatalSummary: 'Autocannon burst through the hull',
  vitalsPct: { shield: 0, armor: 0, hull: 0 },
});

test('the death sentence names who, from where, with what, and through which layer', () => {
  const line = deathSentence(DEFEAT_RECEIPT, { wave: 6 });
  assert.match(line, /Reaver Corsair/);
  assert.match(line, /wave 6/);
  assert.match(line, /behind/);
  assert.match(line, /Heavy Autocannon M/);
  assert.match(line, /through the hull/);
  assert.equal(deathSentence(null), 'The run ended.');
});

test('a run that was not a death still explains itself', () => {
  assert.match(outcomeSentence('victory', { wave: 10 }), /All 10 waves cleared/);
  assert.match(outcomeSentence('aborted', { wave: 4 }), /left the arena/);
  assert.match(outcomeSentence('defeat', { wave: 3 }), /ended on wave 3/);
});

test('the player dying ends the run and publishes a causal summary', () => {
  const harness = boot();
  beginActive(harness);
  harness.state.run.wave = 4;
  cohortKill(harness);
  cohortKill(harness);
  harness.bus.emit('run:awardRequested', { credits: 40, xp: 260, score: 900 });
  harness.bus.emit('combat:damage', { targetId: 1, attackerId: 9, applied: 22, type: 'kinetic', weaponId: 'wpn_autocannon_m' });
  harness.bus.emit('player:death', { ...DEFEAT_RECEIPT, recoverable: true });

  assert.equal(harness.state.run.phase, 'ended');
  assert.equal(harness.state.run.result.outcome, 'defeat');

  const ready = named(harness.emitted, 'run:resultsReady');
  assert.equal(ready.length, 1);
  const result = ready[0].payload;
  assert.equal(result.outcome, 'defeat');
  assert.equal(result.kills, 2);
  assert.equal(result.wave, 4);
  assert.equal(result.credits, 40);
  assert.equal(result.score, 900);
  assert.equal(result.seed, SEED);
  assert.equal(result.defeat.attacker, 'Reaver Corsair');
  assert.equal(result.damageTrail.length, 1);
  assert.equal(result.damageTrail[0].weaponId, 'wpn_autocannon_m');
  assert.match(result.headline, /Reaver Corsair killed you on wave 4/);
});

test('victory publishes results even though it emits no run:ended', () => {
  const harness = boot();
  beginActive(harness);
  harness.state.run.wave = 10;
  harness.bus.emit('run:transitionRequested', { expectedPhase: 'active', nextPhase: 'cleanup', reason: 'wave_clear', tick: 1 });
  harness.bus.emit('run:transitionRequested', { expectedPhase: 'cleanup', nextPhase: 'victory', reason: 'act_complete', tick: 2 });
  assert.equal(harness.state.run.phase, 'victory');
  const ready = named(harness.emitted, 'run:resultsReady');
  assert.equal(ready.length, 1);
  assert.equal(ready[0].payload.outcome, 'victory');
  assert.match(ready[0].payload.headline, /waves cleared/);
});

test('a wave the arena cannot build ends the run instead of stranding the player in it', () => {
  // survivalRun emits run:wavePlanFailed and then stops: it does not retry and it does not end the
  // run. With nobody listening, the player sat in an empty arena in wave_intro forever.
  const harness = boot();
  harness.bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'scored', seed: SEED, arenaId: CRUCIBLE_ARENA_ID });
  harness.bus.emit('run:transitionRequested', { expectedPhase: 'loadout', nextPhase: 'arena_intro', reason: 't', tick: 0 });
  harness.bus.emit('run:transitionRequested', { expectedPhase: 'arena_intro', nextPhase: 'wave_intro', reason: 't', tick: 0 });
  assert.equal(harness.state.run.phase, 'wave_intro');

  harness.bus.emit('run:wavePlanFailed', { wave: 4, error: 'invalid_input', issues: [] });

  assert.equal(harness.state.run.phase, 'ended', 'the run ends rather than hanging');
  assert.equal(harness.state.run.result.reason, 'wave_plan_failed');
  const ready = named(harness.emitted, 'run:resultsReady');
  assert.equal(ready.length, 1);
  assert.match(ready[0].payload.headline, /could not build wave 4/);
});

test('the damage trail is bounded and only records hits on the player', () => {
  const harness = boot();
  beginActive(harness);
  for (let i = 0; i < 25; i++) {
    harness.bus.emit('combat:damage', { targetId: 1, attackerId: 9, applied: i, type: 'kinetic' });
  }
  harness.bus.emit('combat:damage', { targetId: 55, attackerId: 1, applied: 999, type: 'kinetic' });
  harness.bus.emit('player:death', { ...DEFEAT_RECEIPT });
  const result = named(harness.emitted, 'run:resultsReady')[0].payload;
  assert.equal(result.damageTrail.length, 8);
  assert.ok(result.damageTrail.every((entry) => entry.amount !== 999), 'the player\'s own hits are not in the trail');
});

test('survivalResults is inert outside a live survival run, and New Game forgets the last one', () => {
  const harness = boot();
  harness.bus.emit('player:death', { ...DEFEAT_RECEIPT });
  harness.bus.emit('combat:damage', { targetId: 1, attackerId: 9, applied: 5, type: 'kinetic' });
  assert.equal(named(harness.emitted, 'run:endRequested').length, 0, 'no run to end');
  assert.equal(named(harness.emitted, 'run:resultsReady').length, 0, 'no results to publish');

  // A finished result survives for the results surface to read, and is cleared by a fresh game.
  beginActive(harness);
  harness.bus.emit('player:death', { ...DEFEAT_RECEIPT });
  assert.ok(survivalResults.lastResult(), 'the ended run has a readable result');
  survivalResults.newGame();
  assert.equal(survivalResults.lastResult(), null);
});

test('the results grid states outcome, depth, kills, score, salvage, level and seed', () => {
  const rows = resultRows({
    outcome: 'defeat', deepestWave: 6, wave: 6, kills: 31, score: 1240,
    credits: 88, level: 4, xp: 640, seed: 4242,
  });
  const map = new Map(rows);
  assert.equal(map.get('Outcome'), 'Lost');
  assert.equal(map.get('Reached'), 'Wave 6 of 10');
  assert.equal(map.get('Kills'), '31');
  assert.equal(map.get('Salvage'), '88 cr');
  assert.equal(map.get('Seed'), '4242');
  assert.equal(new Map(resultRows({ outcome: 'victory', deepestWave: 10 })).get('Outcome'), 'Survived');
  assert.deepEqual(resultRows(null), []);
});

test('the Crucible launch config is an ordinary New Game config carrying a validated setup', () => {
  clearCrucibleSetup();
  const setup = crucibleSetupFor({ starterId: 'kinetic_baseline', seed: 4242 });
  assert.equal(setup.ok, true);
  assert.equal(setup.value.arenaId, CRUCIBLE_ARENA_ID);
  assert.equal(setup.value.seed, 4242);

  const config = crucibleLaunchConfig(setup.value);
  assert.equal(config.survivalSetup.seed, 4242);
  assert.equal(config.shipId, setup.value.hullId);
  assert.equal(config.seed, 4242);
  assert.equal(config.sectorId, 'sector_helios_prime');
  // Survival never carries an enemy package into the launch — the wave owner decides what spawns.
  assert.equal(config.combatLabSetup, undefined);
  assert.equal(config.spawnEnemies, undefined);
});

test('restart replays the seed the run BEGAN with, through the real New Game request', () => {
  clearCrucibleSetup();
  assert.equal(lastCrucibleSetup(), null);
  const emitted = [];
  const bus = { emit(event, payload) { emitted.push({ event, payload }); }, on() {}, off() {}, once() {} };
  const setup = crucibleSetupFor({ starterId: 'energy_baseline', seed: 99 });
  requestCrucibleRun(bus, setup.value);

  // The launch went through the ordinary New Game request, not a Crucible-only bootstrap.
  assert.equal(emitted.filter((e) => e.event === 'game:new').length, 1);

  const remembered = lastCrucibleSetup();
  assert.equal(remembered.seed, 99);
  assert.equal(remembered.hullId, setup.value.hullId);
  // Mutating the returned copy must not corrupt what a later restart replays.
  remembered.seed = 1;
  assert.equal(lastCrucibleSetup().seed, 99);

  requestCrucibleRun(bus, lastCrucibleSetup());
  assert.equal(emitted.filter((e) => e.event === 'game:new').length, 2);
  assert.equal(lastCrucibleSetup().seed, 99, 'the same seed is replayed');
});

test('seeds are clamped into the range the wave planner accepts', () => {
  assert.equal(normalizeSeed(0), 1);
  assert.equal(normalizeSeed(-5), 1);
  assert.equal(normalizeSeed('4242'), 4242);
  assert.equal(normalizeSeed(NaN), 1);
  assert.equal(normalizeSeed(0xffffffff + 100), 0xffffffff);
});

test('survivalResults is event-driven and never joins the per-frame update order', () => {
  assert.equal(PRODUCTION_UPDATE_ORDER.includes('survivalResults'), false);
  assert.equal(typeof survivalResults.update, 'undefined');
});
