// A quiet swarm wave has not been played. Seed 4242 idle paid +202 score at
// sim 41.1, before any flight input, in the same gap as the second pre-input
// death. award() is the only writer of run.score.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { runSession } from '../src/systems/runSession.js';
import { noteSwarmPilotAction } from '../src/systems/swarmSafety.js';

function activeSwarm() {
  const state = createGameState(4242);
  const bus = createBus();
  runSession.init({ state, bus });
  bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'swarm', seed: 4242, arenaId: 'helios_core' });
  for (const nextPhase of ['arena_intro', 'wave_intro', 'active']) {
    bus.emit('run:transitionRequested', { expectedPhase: state.run.phase, nextPhase });
  }
  return state;
}

test('a quiet swarm wave banks no score; credits still settle', () => {
  const state = activeSwarm();
  try {
    assert.equal(runSession.award({ score: 202, reason: 'stunt_bank', bankActs: ['Slingshot'] }), false);
    assert.equal(state.run.score, 0);
    assert.equal(runSession.award({ credits: 40, score: 202, reason: 'stunt_bank' }), true);
    assert.equal(state.run.score, 0);
    assert.equal(state.run.credits, 40);
  } finally {
    runSession.destroy();
  }
});

test('score pays once this wave has a pilot act', () => {
  const state = activeSwarm();
  try {
    noteSwarmPilotAction(state);
    assert.equal(runSession.award({ score: 202, reason: 'stunt_bank' }), true);
    assert.equal(state.run.score, 202);
  } finally {
    runSession.destroy();
  }
});

test('a scored run is not held to the swarm act latch', () => {
  const state = createGameState(7);
  const bus = createBus();
  runSession.init({ state, bus });
  try {
    bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'scored', seed: 7, arenaId: 'helios_core' });
    for (const nextPhase of ['arena_intro', 'wave_intro', 'active']) {
      bus.emit('run:transitionRequested', { expectedPhase: state.run.phase, nextPhase });
    }
    assert.equal(runSession.award({ score: 100, reason: 'kill' }), true);
    assert.equal(state.run.score, 100);
  } finally {
    runSession.destroy();
  }
});
