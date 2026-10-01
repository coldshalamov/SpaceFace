// INST-25 — an emergent cue reaches its own voice and plays once per event.
// Seed 4242. The muzzle cue is emitted before the system ticks, which is when
// the bus used to be missing. No weapon-fire recipe, no samples.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { allocateEntityId, makeEntity } from '../src/core/entity.js';
import { createGameState } from '../src/core/gameState.js';
import { emergentWeaponByKind } from '../src/data/emergentPrimitives.js';
import { emergentRecipe } from '../src/audio/emergentPrimitiveVoice.js';
import { emergentPrimitives, launchEmergent } from '../src/systems/emergentPrimitives.js';

function ship(state, x) {
  const entity = makeEntity({
    type: 'ship',
    alive: true,
    pos: { x, z: 0 },
    radius: 4,
    hull: 100,
    hullMax: 100,
  });
  entity.id = allocateEntityId(state);
  state.entities.set(entity.id, entity);
  state.entityList.push(entity);
  return entity;
}

function boot() {
  const bus = createBus();
  const heard = [];
  bus.on('emergent:audio', (cue) => heard.push(cue));
  const state = createGameState(4242);
  state.mode = 'flight';
  state.input.actions = {};
  const player = ship(state, 0);
  state.playerId = player.id;
  emergentPrimitives.init({ state, bus, helpers: {}, registry: null });
  const shooter = ship(state, 200);
  return { bus, heard, state, shooter };
}

test('seed 4242: one emergent:audio plays once on the primitive voice', () => {
  const { heard, state, shooter } = boot();
  const voice = emergentPrimitives.voice;
  assert.equal(voice.played.length, 0);

  const sticky = emergentWeaponByKind('sticky');
  assert.equal(launchEmergent(state, shooter, sticky, 0), true);
  assert.equal(heard.length, 1);
  assert.equal(voice.played.length, 1);
  assert.equal(voice.played[0].id, 'sfx_emergent_slug');
  assert.equal(voice.played[0].id, heard[0].id);
  assert.equal(emergentRecipe(voice.played[0].id).id, 'sfx_emergent_slug');
  assert.equal(voice.played[0].id.startsWith('sfx_wpn_'), false);
  assert.equal(voice.played[0].pan, 0.5);
  assert.equal(voice.played[0].gain, 0.8);
  assert.equal(voice.played[0].impulse, 30);

  const primer = emergentWeaponByKind('primer');
  assert.equal(launchEmergent(state, shooter, primer, 0), true);
  assert.equal(heard.length, 2);
  assert.equal(voice.played.length, 2);
  assert.equal(voice.played[1].id, 'sfx_emergent_crackle');
  assert.notEqual(voice.played[1].id, voice.played[0].id);

  emergentPrimitives.destroy();
});

test('a rejected cue stays silent and a re-init does not play the next event twice', () => {
  const { bus, heard, state, shooter } = boot();
  const voice = emergentPrimitives.voice;
  assert.equal(voice.play(null), false);
  assert.equal(voice.play({ id: 'sfx_wpn_gravitic', gain: 1 }), false);
  assert.equal(voice.played.length, 0);
  bus.emit('emergent:audio', { id: 'sfx_wpn_pulse_laser', x: 0, z: 0, pan: 0, gain: 0.8, impulse: 1 });
  assert.equal(voice.played.length, 0, 'weapon-fire recipes are not this voice');

  bus.emit('emergent:audio', { id: 'sfx_emergent_gel', x: 1, z: 2, pan: 0, gain: 0.8, impulse: 12 });
  assert.equal(voice.played.length, 1);
  assert.equal(voice.played[0].id, 'sfx_emergent_gel');

  emergentPrimitives.init({ state, bus, helpers: {}, registry: null });
  const again = emergentPrimitives.voice;
  assert.notEqual(again, voice);
  assert.equal(again.played.length, 0);
  const before = heard.length;
  launchEmergent(state, shooter, emergentWeaponByKind('sticky'), 0);
  assert.equal(heard.length - before, 1);
  assert.equal(again.played.length, 1);
  assert.equal(again.played[0].id, 'sfx_emergent_slug');

  emergentPrimitives.destroy();
});
