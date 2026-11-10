// A named crew member dying is no longer mute (seed: the ear audit — crew:injured/crew:lost had
// zero subscribers). The comms line carries the words; the voice under it is a warn tick for an
// injury and the hull's own low groan for a death, and a mass-casualty tick collapses to one
// dark beat. Real bus, recording play stub.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { audio } from '../src/audio/audioSystem.js';
import { combatVerbRecipe, verbCueCoverage } from '../src/audio/combatVerbCues.js';

function cueHost() {
  const played = [];
  const bus = createBus();
  const state = { tick: 10, simTime: 4, playerId: 'player', entities: new Map(), entityList: [],
    ui: {}, world: {}, settings: {}, audioRuntime: {} };
  const host = Object.create(audio);
  host._wallClockMs = () => 1000;
  host.init({ state, bus, helpers: {} });
  host.play = (id, opts = {}) => { played.push({ id, ...opts }); return { id }; };
  return { host, bus, played };
}

test('the casualty rows resolve their registers', () => {
  assert.equal(combatVerbRecipe('crew:injured'), 'sfx_ui_alert');
  assert.equal(combatVerbRecipe('crew:lost'), 'sfx_hull_stress_groan');
  const lost = verbCueCoverage().find((row) => row.id === 'crew:lost');
  assert.equal(lost.dispatcher, 'table');
  assert.notEqual(combatVerbRecipe('crew:lost'), 'sfx_cash_register', 'a death is never a chime');
});

test('an injury speaks one warn tick; a death speaks the groan', () => {
  const { bus, played } = cueHost();
  bus.emit('crew:injured', { id: 'crew-1', name: ' Petra Ilyes' });
  bus.emit('crew:lost', { id: 'crew-2', name: ' Petra Ilyes' });
  assert.deepEqual(played.map((p) => p.id), ['sfx_ui_alert', 'sfx_hull_stress_groan']);
});

test('a mass-casualty tick collapses to one beat per event window', () => {
  const { host, bus, played } = cueHost();
  for (const id of ['c1', 'c2', 'c3']) bus.emit('crew:lost', { id, name: `Crew ${id}` });
  assert.equal(played.length, 1, `one groan for the tick, got ${played.length}`);
  host._wallClockMs = () => 1600;
  bus.emit('crew:lost', { id: 'c4', name: 'Crew c4' });
  assert.equal(played.length, 2, 'a later casualty earns its own beat');
});
