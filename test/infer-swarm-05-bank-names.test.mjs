// INFERENCE swarm-as-toybox U5 — the bank names its tricks.
//
// A style settlement arrived as a bare number ("+340 SCORE") while the acts
// that earned it were named only at detection, seconds earlier. The award now
// carries the settled banks' trick names and the earn receipt prints them, so
// the player learns which acts the purse just paid for.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { runSession } from '../src/systems/runSession.js';
import { survivalRewards } from '../src/systems/survivalRewards.js';
import { bankActive, recordTrick } from '../src/systems/stuntCombo.js';
import { stuntGrammar } from '../src/systems/stuntGrammar.js';
import { earnLine } from '../src/ui/survivalHud.js';
import { noteSwarmPilotAction } from '../src/systems/swarmSafety.js';

const VICTIM = [{ lifeId: 'bank-life', threatClass: 'fodder', dead: true }];
const METRICS = { payloadMass: 20, playerDryHullMass: 20, usefulDeltaV: 0, referenceCruise: 100 };

function trickFor(trickId, name, episodeId, tick) {
  return {
    schemaVersion: 2, actorId: 7, trickId, name,
    rarity: 'common', family: 'tether', episodeId, tick, rootTick: tick,
    modifiers: {}, victimLives: VICTIM, metrics: METRICS,
  };
}

test('the earn receipt names a banked settlement and stays bare without acts', () => {
  assert.equal(
    earnLine({ score: 340, reason: 'stunt_bank', bankActs: ['Bolas', 'Bank Job'] }),
    '+340 SCORE · Bolas, Bank Job',
  );
  assert.equal(
    earnLine({ score: 340, reason: 'stunt_bank', bankActs: ['Bolas', 'Bank Job', 'Clothesline', 'Tow Kill'] }),
    '+340 SCORE · Bolas, Bank Job, Clothesline +1',
  );
  assert.equal(earnLine({ score: 340, reason: 'stunt_bank' }), '+340 SCORE');
  assert.equal(earnLine({ score: 100, reason: 'kill' }), '+100 SCORE');
});

test('a settled bank reaches the award with its trick names', () => {
  const state = createGameState(4242);
  const bus = createBus();
  state.playerId = 7;
  runSession.init({ state, bus });
  survivalRewards.init({ state, bus });
  stuntGrammar.init({ state, bus });
  const awards = [];
  bus.on('run:awardRequested', (p) => awards.push(p));
  try {
    bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'swarm', seed: 4242, arenaId: 'helios_core' });
    for (const nextPhase of ['arena_intro', 'wave_intro', 'active']) {
      bus.emit('run:transitionRequested', { expectedPhase: state.run.phase, nextPhase });
    }
    noteSwarmPilotAction(state);
    const combo = state.stunts.combo;
    recordTrick(combo, trickFor('bolas', 'Bolas', 'ep-a', 600));
    recordTrick(combo, trickFor('bank_job', 'Bank Job', 'ep-b', 620));
    bankActive(combo, { tick: 640, reason: 'quiet' });
    bus.emit('stunt:styleBanked', {});
    const bank = awards.find((a) => a && a.reason === 'stunt_bank');
    assert.ok(bank, 'the settlement award fires');
    assert.ok(bank.score > 0);
    assert.deepEqual(bank.bankActs, ['Bolas', 'Bank Job']);
    assert.match(earnLine({ score: bank.score, reason: bank.reason, bankActs: bank.bankActs }), /Bolas/);
  } finally {
    stuntGrammar.destroy();
    survivalRewards.destroy();
    runSession.destroy();
  }
});

test('the awarded receipt carries the names through the run wallet', () => {
  const state = createGameState(4242);
  const bus = createBus();
  runSession.init({ state, bus });
  const awarded = [];
  bus.on('run:awarded', (p) => awarded.push(p));
  try {
    bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'swarm', seed: 4242, arenaId: 'helios_core' });
    for (const nextPhase of ['arena_intro', 'wave_intro', 'active']) {
      bus.emit('run:transitionRequested', { expectedPhase: state.run.phase, nextPhase });
    }
    noteSwarmPilotAction(state);
    assert.equal(runSession.award({ score: 340, reason: 'stunt_bank', bankActs: ['Bolas', 7, ''] }), true);
    assert.deepEqual(awarded[0].bankActs, ['Bolas'], 'only real names pass through');
    assert.equal(runSession.award({ score: 100, reason: 'kill', bankActs: 'Bolas' }), true);
    assert.equal(awarded[1].bankActs, undefined, 'a non-array is dropped, not printed');
  } finally {
    runSession.destroy();
  }
});
