// PQ-135 — the run seal. "Nothing you earn here follows you home" is printed on the Crucible door;
// this is what makes it true for reputation and heat, the two campaign figures a run was moving.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { isRunSealed } from '../src/core/runSeal.js';
import { createRunState } from '../src/core/runState.js';
import { factions } from '../src/systems/factions.js';
import { heat } from '../src/systems/heat.js';

const FACTION = 'faction_reach';

function boot() {
  const state = createGameState(11);
  const bus = createBus();
  const ctx = { state, bus, helpers: {} };
  factions.init(ctx);
  bus.emit('game:started', {});
  heat.init(ctx);
  if (typeof heat.newGame === 'function') heat.newGame();
  state.player.heat = 0;
  return { state, bus, ctx };
}

function repOf(state, id) {
  const rec = state.factions && state.factions[id];
  return rec ? rec.rep : null;
}

function enterRun(state, phase = 'active') {
  state.run = createRunState({ kind: 'survival', ruleset: 'swarm', seed: 4242 });
  state.run.phase = phase;
}

test('isRunSealed answers the one question the boundary needs', () => {
  assert.equal(isRunSealed(null), false);
  assert.equal(isRunSealed({}), false);
  assert.equal(isRunSealed({ run: null }), false);
  assert.equal(isRunSealed({ run: createRunState() }), false, 'an inactive run seals nothing');
  for (const phase of ['loadout', 'arena_intro', 'wave_intro', 'active', 'cleanup', 'draft', 'refit', 'victory']) {
    const run = createRunState({ kind: 'survival' });
    run.phase = phase;
    assert.equal(isRunSealed({ run }), true, `${phase} is inside the run`);
  }
  const ended = createRunState({ kind: 'survival' });
  ended.phase = 'ended';
  assert.equal(isRunSealed({ run: ended }), false, 'a finished run seals nothing');
  // An adventure "run" is the campaign itself and must never be sealed.
  const adventure = createRunState({ kind: 'adventure' });
  adventure.phase = 'active';
  assert.equal(isRunSealed({ run: adventure }), false);
  // A malformed envelope defaults to OPEN — a leaked kill is far better than silently freezing
  // reputation for the rest of a campaign session.
  assert.equal(isRunSealed({ run: { kind: 'survival' } }), false);
  assert.equal(isRunSealed({ run: [] }), false);
});

test('reputation does not move during a run, and moves normally outside one', () => {
  const h = boot();
  const before = repOf(h.state, FACTION);
  assert.equal(typeof before, 'number');

  enterRun(h.state);
  h.bus.emit('faction:repDelta', { factionId: FACTION, delta: -25, reason: 'kill_faction_ship' });
  assert.equal(repOf(h.state, FACTION), before, 'a sealed run cannot move standing');
  assert.equal(factions.applyRep(FACTION, -25, 'direct'), 0, 'not even through the direct call');

  h.state.run.phase = 'ended';
  h.bus.emit('faction:repDelta', { factionId: FACTION, delta: -25, reason: 'kill_faction_ship' });
  assert.notEqual(repOf(h.state, FACTION), before, 'the campaign still works after the run');
});

test('a whole arena full of kills leaves every faction exactly where it was', () => {
  const h = boot();
  const snapshot = JSON.stringify(h.state.factions);
  enterRun(h.state);
  // Kills route through the factions kill handler, which is the path the live walk tripped.
  for (let i = 0; i < 40; i++) {
    h.bus.emit('entity:killed', {
      id: 500 + i,
      type: 'ship',
      factionId: FACTION,
      killerId: h.state.playerId,
      victimClass: 'fighter',
      witnessed: true,
      pos: { x: 0, z: 0 },
    });
  }
  assert.equal(JSON.stringify(h.state.factions), snapshot, 'forty kills, nothing moved');
});

test('heat does not accrue during a run — no WANTED, so no hunters into the arena', () => {
  const h = boot();
  enterRun(h.state);
  const before = h.state.player.heat;
  heat._raise(0.5, 'test');
  assert.equal(h.state.player.heat, before, 'heat is sealed');
  heat._setHeat(0.9, 'test');
  assert.equal(h.state.player.heat, before, 'and cannot be set either');

  // Both directions: a run must leave campaign heat exactly as it found it.
  h.state.player.heat = 0.4;
  heat._setHeat(0, 'decay');
  assert.equal(h.state.player.heat, 0.4, 'a run does not launder heat away either');

  h.state.run.phase = 'ended';
  heat._raise(0.2, 'test');
  assert.ok(h.state.player.heat > 0.4, 'the campaign still accrues heat after the run');
});
