// A faction naming you a new rank (or taking one back) used to be words only: comms log + news.
// faction:repChanged now plays the career chord on a rank-up and the refusal tick on a rank-down.
// Seed 4242. The real factions system emits the payloads; the AudioContext is never created.
// Going hostile (faction:aggro) is deliberately NOT voiced here: heat.js raises WANTED on it and
// the wanted-escalation alert already owns that moment.
import assert from 'node:assert/strict';
import test from 'node:test';

import { RECIPES } from '../src/data/audioRecipes.js';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import {
  FACTION_STANDING_CUES,
  FACTION_STANDING_WINDOW_S,
  audio,
  factionStandingCue,
} from '../src/audio/audioSystem.js';
import { factions } from '../src/systems/factions.js';

const SEED = 4242;

function boot() {
  const state = createGameState(SEED);
  state.mode = 'flight';
  const bus = createBus();
  factions.init({ state, bus, helpers: {} });
  factions.newGame();
  const ear = Object.create(audio);
  const plays = [];
  ear.init({ state, bus, helpers: {} });
  ear.play = (recipeId, opts) => { plays.push({ recipeId, opts }); return { recipeId }; };
  return { state, bus, ear, plays };
}

function standing(plays) {
  return plays.filter((row) => row.recipeId === 'sfx_promotion_chord' || row.recipeId === 'sfx_ui_error');
}

test('the two standing cues are authored recipes', () => {
  const ids = new Set(RECIPES.map((row) => row.id));
  assert.ok(ids.has(FACTION_STANDING_CUES.rankUp.id));
  assert.ok(ids.has(FACTION_STANDING_CUES.rankDown.id));
  assert.notEqual(FACTION_STANDING_CUES.rankUp.id, FACTION_STANDING_CUES.rankDown.id);
});

test('a rank-up plays the promotion chord exactly once', () => {
  const { state, bus, ear, plays } = boot();
  try {
    state.factions.faction_dmc.rep = 140;
    factions.applyRep('faction_dmc', 20, 'seed-4242');
    bus.flush();
    const heard = standing(plays);
    assert.equal(heard.length, 1);
    assert.equal(heard[0].recipeId, 'sfx_promotion_chord');
    assert.equal(heard[0].opts.gain, 0.55);
  } finally {
    ear.destroy();
  }
});

test('a rank-down plays the refusal tick, not the chord', () => {
  const { state, bus, ear, plays } = boot();
  try {
    state.factions.faction_dmc.rep = 150;
    factions.applyRep('faction_dmc', -20, 'seed-4242');
    bus.flush();
    const heard = standing(plays);
    assert.equal(heard.length, 1);
    assert.equal(heard[0].recipeId, 'sfx_ui_error');
    assert.equal(heard[0].opts.gain, 0.5);
  } finally {
    ear.destroy();
  }
});

test('a change inside one rank is silent (rankChanged false)', () => {
  const { state, bus, ear, plays } = boot();
  try {
    state.factions.faction_dmc.rep = 20;
    factions.applyRep('faction_dmc', 5, 'seed-4242');
    bus.flush();
    assert.deepEqual(standing(plays), []);
  } finally {
    ear.destroy();
  }
});

test('tier-only payloads (spillover, direct writes) are silent', () => {
  assert.equal(factionStandingCue({ factionId: 'faction_dmc', delta: 9, tierChanged: true }), null);
  assert.equal(factionStandingCue({ factionId: 'faction_dmc', delta: 9, rankChanged: false }), null);
  assert.equal(factionStandingCue({ factionId: 'faction_dmc', delta: 0, rankChanged: true }), null);
  assert.equal(factionStandingCue(null), null);
  assert.equal(factionStandingCue({ rankChanged: true, delta: 3 }), FACTION_STANDING_CUES.rankUp);
  assert.equal(factionStandingCue({ rankChanged: true, delta: -3 }), FACTION_STANDING_CUES.rankDown);
});

test('one cue per window: a burst is throttled and the next window speaks again', () => {
  const { state, bus, ear, plays } = boot();
  try {
    state.simTime = 100;
    bus.emit('faction:repChanged', { factionId: 'faction_dmc', delta: 10, rankChanged: true });
    bus.emit('faction:repChanged', { factionId: 'faction_scn', delta: 10, rankChanged: true });
    bus.emit('faction:repChanged', { factionId: 'faction_scn', delta: -10, rankChanged: true });
    bus.flush();
    assert.equal(standing(plays).length, 1, 'three rank changes in one instant are one cue');

    state.simTime = 100 + FACTION_STANDING_WINDOW_S - 0.5;
    bus.emit('faction:repChanged', { factionId: 'faction_dmc', delta: 10, rankChanged: true });
    bus.flush();
    assert.equal(standing(plays).length, 1, 'still inside the window');

    state.simTime = 100 + FACTION_STANDING_WINDOW_S + 0.1;
    bus.emit('faction:repChanged', { factionId: 'faction_dmc', delta: 10, rankChanged: true });
    bus.flush();
    assert.equal(standing(plays).length, 2, 'the next window speaks');

    state.simTime = 5; // a restore rewinds the clock: that is a fresh window, not a stuck one
    bus.emit('faction:repChanged', { factionId: 'faction_dmc', delta: 10, rankChanged: true });
    bus.flush();
    assert.equal(standing(plays).length, 3);
  } finally {
    ear.destroy();
  }
});

test('docked (rt._paused) still plays: mission turn-ins rank up at the dock', () => {
  const { state, bus, ear, plays } = boot();
  try {
    ear.rt._paused = true;
    state.ui.docked = true;
    state.simTime = 50;
    bus.emit('faction:repChanged', { factionId: 'faction_dmc', delta: 10, rankChanged: true });
    bus.flush();
    assert.equal(standing(plays).length, 1);
  } finally {
    ear.destroy();
  }
});

test('the title screen and a sealed Crucible run stay quiet', () => {
  const { state, bus, ear, plays } = boot();
  try {
    state.mode = 'menu';
    state.simTime = 10;
    bus.emit('faction:repChanged', { factionId: 'faction_dmc', delta: 10, rankChanged: true });
    bus.flush();
    assert.equal(standing(plays).length, 0, 'menu');

    state.mode = 'flight';
    state.simTime = 20;
    state.run = { kind: 'survival', phase: 'active' };
    bus.emit('faction:repChanged', { factionId: 'faction_dmc', delta: 10, rankChanged: true });
    bus.flush();
    assert.equal(standing(plays).length, 0, 'sealed run');

    state.run = { kind: 'survival', phase: 'ended' };
    state.simTime = 30;
    bus.emit('faction:repChanged', { factionId: 'faction_dmc', delta: 10, rankChanged: true });
    bus.flush();
    assert.equal(standing(plays).length, 1, 'the seal lifts when the run ends');
  } finally {
    ear.destroy();
  }
});

test('faction:aggro adds no second sting: the heat alert owns going hostile', () => {
  const { bus, ear, plays } = boot();
  try {
    bus.emit('faction:aggro', { factionId: 'faction_dmc', isAggro: true });
    bus.emit('faction:aggro', { factionId: 'faction_dmc', isAggro: false });
    bus.flush();
    assert.deepEqual(plays, []);
  } finally {
    ear.destroy();
  }
});
