// SEED-HF-10 / SEED-HF-09 — a hostile line on the player's hull warns, and a part the player
// breaks on someone else is named. Both ride the live presentation bus. Seed 4242.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { getPresentationRecipe, validatePresentationRecipes } from '../src/presentation/cueRecipes.js';
import { presentationOrchestrator } from '../src/systems/presentationOrchestrator.js';
import { presentationAdapters } from '../src/systems/presentationAdapters.js';

const PLAYER_ID = 7;
const ENEMY_ID = 4;

function boot() {
  const state = createGameState(4242);
  state.playerId = PLAYER_ID;
  state.tick = 12;
  state.simTime = 0.2;
  state.mode = 'flight';
  state.settings = { video: {}, accessibility: {} };
  state.entities = new Map([
    [PLAYER_ID, { id: PLAYER_ID, alive: true, pos: { x: 0, y: 0, z: 0 } }],
    [ENEMY_ID, { id: ENEMY_ID, alive: true, pos: { x: 40, y: 0, z: 0 } }],
  ]);
  const bus = createBus();
  const cues = [];
  const ui = [];
  const captions = [];
  bus.on('presentation:cue', (payload) => cues.push(payload));
  bus.on('presentation:uiCue', (payload) => ui.push(payload));
  bus.on('presentation:caption', (payload) => captions.push(payload));
  presentationOrchestrator.init({ state, bus });
  presentationAdapters.init({ state, bus });
  return {
    state, bus, cues, ui, captions,
    teardown() {
      presentationOrchestrator.dispose();
      presentationAdapters.dispose();
    },
  };
}

test('seed 4242: a hostile latch warns LINE ON YOU; the player\'s own latch stays a latch', () => {
  const recipe = getPresentationRecipe('tether.line_on_you');
  assert.ok(recipe, 'the warning has a presentation recipe');
  assert.equal(validatePresentationRecipes().ok, true);
  assert.equal(recipe.lanes.ui, 'ui.tension_warning');
  assert.notEqual(recipe.lanes.ui, getPresentationRecipe('tether.attach').lanes.ui);

  const h = boot();
  try {
    h.bus.emit('tether:attached', { actorId: ENEMY_ID, targetId: PLAYER_ID, attachmentId: 'att-on-you' });
    h.bus.flush();
    const hostile = h.cues.filter((cue) => cue.sourceEvent === 'tether:attached');
    assert.equal(hostile.length, 1);
    assert.equal(hostile[0].id, 'tether.line_on_you');
    assert.equal(hostile[0].targetId, PLAYER_ID);
    assert.equal(hostile[0].sourceId, ENEMY_ID);
    const banner = h.ui.find((row) => row.cueId === 'tether.line_on_you');
    assert.ok(banner, 'the warning reaches the banner');
    assert.equal(banner.text, 'LINE ON YOU');
    assert.equal(banner.sev, 'warn');
    const caption = h.captions.find((row) => row.id === 'tether.line_on_you');
    assert.equal(caption.text, 'A hostile line is on your hull.');

    h.bus.emit('tether:attached', { actorId: PLAYER_ID, targetId: ENEMY_ID, attachmentId: 'att-mine' });
    h.bus.flush();
    const own = h.cues.filter((cue) => cue.id === 'tether.attach');
    assert.equal(own.length, 1, 'the player latching someone else stays MASSLINE ATTACHED');
    assert.equal(h.cues.filter((cue) => cue.id === 'tether.line_on_you').length, 1);
  } finally {
    h.teardown();
  }
});

test('seed 4242: breaking an enemy drive names the part; the player\'s own drive keeps the long sentence', () => {
  const h = boot();
  try {
    h.bus.emit('combat:subsystemDisabled', {
      attackerId: PLAYER_ID,
      targetId: ENEMY_ID,
      subsystemId: 'subsystem_main_drive',
    });
    h.bus.flush();
    const enemy = h.ui.find((row) => row.cueId === 'subsystem.disabled');
    assert.ok(enemy, 'a player-caused disable still reaches the banner');
    assert.equal(enemy.text, 'DRIVE DISABLED');
    const enemyCaption = h.captions.find((row) => row.id === 'subsystem.disabled');
    assert.equal(enemyCaption.text, 'DRIVE DISABLED');

    h.bus.emit('combat:subsystemDisabled', {
      attackerId: ENEMY_ID,
      targetId: PLAYER_ID,
      subsystemId: 'subsystem_main_drive',
    });
    h.bus.flush();
    const own = h.ui.filter((row) => row.cueId === 'subsystem.disabled');
    assert.equal(own.length, 2);
    assert.equal(own[1].text, 'Drive out — the ship is not pushing');
    assert.notEqual(own[1].text, 'DRIVE DISABLED');

    h.bus.emit('combat:subsystemDisabled', {
      attackerId: PLAYER_ID,
      targetId: ENEMY_ID,
      subsystemId: 'subsystem_unknown_widget',
    });
    h.bus.flush();
    const generic = h.ui.filter((row) => row.cueId === 'subsystem.disabled').at(-1);
    assert.equal(generic.text, 'SUBSYSTEM DISABLED');
  } finally {
    h.teardown();
  }
});
