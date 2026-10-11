// INFERENCE swarm-as-toybox U4 — the room teaches the chain once.
//
// The chain climbs +2 when a kill arrives differently from the last, and
// nothing ever said so: the variety badge sat unexplained on the HUD.
// The first varied step now speaks the rule once per profile (through the
// shared player-hints store onboarding itself is suppressed in survival,
// so the chain owner teaches its own rule and respects tutorialHints).
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { runSession } from '../src/systems/runSession.js';
import { swarmChain } from '../src/systems/swarmChain.js';

function boot({ hints = {}, tutorialHints = true } = {}) {
  const state = createGameState(4242);
  const bus = createBus();
  state.playerId = 0;
  state.player = { hints };
  state.settings = { gameplay: { tutorialHints } };
  state.simTime = 100;
  state.entities.set(0, { id: 0, alive: true, type: 'ship', pos: { x: 0, z: 0 }, data: {} });
  runSession.init({ state, bus });
  swarmChain.init({ state, bus });
  const toasts = [];
  const lessons = [];
  bus.on('toast', (p) => toasts.push(p));
  bus.on('swarm:chainLesson', (p) => lessons.push(p));
  bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'swarm', seed: 4242, arenaId: 'helios_core' });
  for (const nextPhase of ['arena_intro', 'wave_intro', 'active']) {
    bus.emit('run:transitionRequested', { expectedPhase: state.run.phase, nextPhase });
  }
  let nextId = 21;
  return {
    state, bus, toasts, lessons,
    kill(cause) {
      const id = nextId++;
      state.entities.set(id, {
        id, alive: false, type: 'ship', pos: { x: id, z: 0 },
        data: { runCohort: 'survival', runWave: 1 },
      });
      bus.emit('entity:killed', { id, killerId: 0, cause, tick: 1 });
    },
    close() { swarmChain.destroy(); runSession.destroy(); },
  };
}

test('the first varied step speaks the rule once, then never again', () => {
  const h = boot();
  try {
    h.kill('direct');
    h.kill('direct');
    assert.equal(h.toasts.length, 0, 'same-cause kills teach nothing');
    assert.equal(h.lessons.length, 0);
    h.kill('terrain');
    assert.equal(h.lessons.length, 1);
    assert.equal(h.lessons[0].step, 2);
    assert.equal(h.toasts.length, 1);
    assert.equal(h.toasts[0].text, 'Different kill — the chain climbs faster.');
    h.kill('explosive');
    assert.equal(h.lessons.length, 1, 'second varied step stays silent');
    assert.equal(h.toasts.length, 1);
    assert.equal(h.state.player.hints.swarmChainVariety, true);
  } finally { h.close(); }
});

test('a taught profile stays silent on the next run', () => {
  const hints = { swarmChainVariety: true };
  const h = boot({ hints });
  try {
    h.kill('direct');
    h.kill('terrain');
    assert.equal(h.lessons.length, 0);
    assert.equal(h.toasts.length, 0);
  } finally { h.close(); }
});

test('tutorialHints off stays silent', () => {
  const h = boot({ tutorialHints: false });
  try {
    h.kill('direct');
    h.kill('terrain');
    assert.equal(h.lessons.length, 0);
    assert.equal(h.toasts.length, 0);
    assert.equal(h.state.player.hints.swarmChainVariety, undefined, 'no flag spent while muted');
  } finally { h.close(); }
});
