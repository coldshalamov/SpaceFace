// The thrown charge earns its ladder (seed: "arena hazards the physics turns into weapons" needs
// an ear): throw, bite, arm — the detonation was already its own voice and stays the only boom.
// The table dispatches each event; every payload carries pos, so each voice sits at the charge.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { RECIPES } from '../src/data/audioRecipes.js';
import { audio } from '../src/audio/audioSystem.js';
import { combatVerbRecipe, verbCueCoverage } from '../src/audio/combatVerbCues.js';

function cueHost() {
  const played = [];
  const bus = createBus();
  const state = { tick: 10, simTime: 4, playerId: 'player', entities: new Map(), entityList: [],
    ui: {}, world: {}, settings: {}, audioRuntime: {} };
  const host = Object.create(audio);
  host.init({ state, bus, helpers: {} });
  host.play = (id, opts = {}) => { played.push({ id, ...opts }); return { id }; };
  return { host, bus, played };
}

test('the charge ladder resolves three distinct registers, all authored', () => {
  assert.equal(combatVerbRecipe('charge:thrown'), 'sfx_massline_throw');
  assert.equal(combatVerbRecipe('charge:stuck'), 'sfx_hitch_latch');
  assert.equal(combatVerbRecipe('charge:armed'), 'sfx_snare_arm_tick');
  for (const id of ['sfx_massline_throw', 'sfx_hitch_latch', 'sfx_snare_arm_tick']) {
    assert.ok(RECIPES.some((r) => r.id === id), `${id} is authored`);
  }
  for (const verb of ['charge:thrown', 'charge:stuck', 'charge:armed']) {
    const row = verbCueCoverage().find((r) => r.id === verb);
    assert.equal(row.dispatcher, 'table', `${verb} dispatched by the table`);
  }
});

test('the sequence speaks at the charge, and the detonation stays the only boom', () => {
  const { bus, played } = cueHost();
  bus.emit('charge:thrown', { chargeId: 'c1', ownerId: 'player', pos: { x: 30, z: 5 } });
  bus.emit('charge:stuck', { chargeId: 'c1', hostId: 'rock-9', pos: { x: 44, z: 9 } });
  bus.emit('charge:armed', { chargeId: 'c1', pos: { x: 44, z: 9 } });
  assert.deepEqual(played.map((p) => p.id),
    ['sfx_massline_throw', 'sfx_hitch_latch', 'sfx_snare_arm_tick']);
  assert.deepEqual(played[1].position, { x: 44, z: 9 }, 'the bite sits at the host');
  for (const p of played) {
    assert.notEqual(p.id, 'sfx_explosion_small', 'no ladder stage steals the blast');
  }
});
