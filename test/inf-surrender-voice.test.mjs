// A wing striking colors has an ear (seed: "enemies that react — surrender is a beat, not dead
// air"). pirateDisengage marks every member of the squad on the same tick; the desk's law is one
// strike-colors voice per burst, positioned at the hull, in the falling-resolution register the
// WANTED-clear voice owns — relief, not reward, never the rising reactor threat.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { RECIPES } from '../src/data/audioRecipes.js';
import { audio } from '../src/audio/audioSystem.js';
import { combatVerbRecipe, combatVerbCueRow, verbCueCoverage } from '../src/audio/combatVerbCues.js';

function cueHost() {
  const played = [];
  const bus = createBus();
  const state = { tick: 42, simTime: 10, playerId: 'player', entities: new Map(), entityList: [],
    ui: {}, world: {}, settings: {}, audioRuntime: {} };
  const host = Object.create(audio);
  host._wallClockMs = () => 1000;
  host.init({ state, bus, helpers: {} });
  host.play = (id, opts = {}) => { played.push({ id, ...opts }); return { id }; };
  return { host, bus, played };
}

test('the surrender row names the falling-resolution register', () => {
  assert.equal(combatVerbRecipe('combat:surrendered'), 'sfx_wanted_clear');
  const recipe = RECIPES.find((r) => r.id === 'sfx_wanted_clear');
  assert.ok(recipe, 'sfx_wanted_clear is authored');
  assert.ok(recipe.freqSweep && recipe.freqSweep[1] < recipe.freqSweep[0],
    'the register falls — standing down, not winding up');
  const coverage = verbCueCoverage().find((row) => row.id === 'combat:surrendered');
  assert.equal(coverage.dispatcher, 'table', 'the table dispatches the row (one ear owner)');
});

test('a squad burst of surrenders speaks one voice, at the hull', () => {
  const { bus, played } = cueHost();
  for (const id of ['raider-1', 'raider-2', 'raider-3']) {
    bus.emit('combat:surrendered', { entityId: id, squadId: 'sq-7', reason: 'broken', x: 120, z: -40 });
  }
  assert.equal(played.length, 1, `one strike-colors voice per burst — got ${played.length}`);
  assert.equal(played[0].id, 'sfx_wanted_clear');
  assert.deepEqual(played[0].position, { x: 120, z: -40 }, 'the voice sits at the surrendering hull');
});

test('a second wing surrendering later earns its own voice', () => {
  const { host, bus, played } = cueHost();
  bus.emit('combat:surrendered', { entityId: 'a-1', squadId: 'sq-a', x: 0, z: 0 });
  host._wallClockMs = () => 1600;
  bus.emit('combat:surrendered', { entityId: 'b-1', squadId: 'sq-b', x: 40, z: 8 });
  assert.equal(played.length, 2, 'distinct squads, distinct moments');
});

test('the cue row resolves through the shared row reader', () => {
  const row = combatVerbCueRow('combat:surrendered');
  assert.equal(row.recipe, 'sfx_wanted_clear');
  assert.equal(row.shape, '');
});
