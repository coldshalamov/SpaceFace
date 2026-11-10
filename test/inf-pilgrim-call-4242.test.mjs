import test from 'node:test';
import assert from 'node:assert/strict';

import { FAUNA_SPECIES } from '../src/data/alienFauna.js';
import { DISCOVERY_AUDIO_RECIPES, FAUNA_ROLE_SOUND } from '../src/data/discoveryAudio.js';
import { tickDiscoverySound } from '../src/systems/discoverySound.js';
import { resolveAudioCueRecipeId } from '../src/audio/audioSystem.js';

function world() {
  const events = [];
  return {
    events,
    bus: { emit(name, payload) { events.push({ name, payload }); } },
    state: {
      mode: 'flight',
      paused: false,
      simTime: 12,
      meta: { seed: 4242 },
      world: { currentSectorId: 'sector_veil_nebula' },
    },
  };
}

test('a pilgrim spine plays its own call, not a drifter, seed 4242', () => {
  assert.equal(FAUNA_SPECIES.pilgrim_spine.role, 'migrant');
  const player = { id: 'player', alive: true, pos: { x: 0, z: 0 }, rot: 0 };
  const spine = {
    id: 'spine',
    alive: true,
    pos: { x: 80, z: 0 },
    data: { ecology: { speciesId: 'pilgrim_spine' } },
  };
  const drifter = {
    id: 'cloud',
    alive: true,
    pos: { x: 80, z: 0 },
    data: { ecology: { speciesId: Object.values(FAUNA_SPECIES).find((row) => row.role === 'drifter').id } },
  };
  const heard = world();
  assert.equal(tickDiscoverySound(heard, [spine], 'fauna', player, 20), true);
  assert.equal(heard.events.at(-1).name, 'audio:cue');
  assert.equal(heard.events.at(-1).payload.id, FAUNA_ROLE_SOUND.migrant);
  assert.equal(heard.events.at(-1).payload.id, 'ambient_fauna_migrant');
  assert.notEqual(heard.events.at(-1).payload.id, FAUNA_ROLE_SOUND.drifter);

  const other = world();
  assert.equal(tickDiscoverySound(other, [drifter], 'fauna', player, 20), true);
  assert.equal(other.events.at(-1).payload.id, 'ambient_fauna_drifter');

  const migrant = DISCOVERY_AUDIO_RECIPES.find((row) => row.id === 'ambient_fauna_migrant');
  const drift = DISCOVERY_AUDIO_RECIPES.find((row) => row.id === 'ambient_fauna_drifter');
  assert.ok(migrant);
  assert.notEqual(migrant.baseFreq, drift.baseFreq);
  assert.notEqual(migrant.wave, drift.wave);
  assert.equal(resolveAudioCueRecipeId('ambient_fauna_migrant'), 'ambient_fauna_migrant');
});
