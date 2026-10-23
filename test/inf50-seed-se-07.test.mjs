// SEED-SE-07 — a committed jump, its arrival, and an interdiction each say one line.
// Seed 4242 is the script clock, not a sim roll. Continuity stays visual. No new audio floor.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { PRESENTATION_RECIPES } from '../src/presentation/cueRecipes.js';
import { presentationAdapters } from '../src/systems/presentationAdapters.js';
import { presentationOrchestrator } from '../src/systems/presentationOrchestrator.js';

const SEED = 4242;
const SPOKEN = Object.freeze({
  'travel.jump.committed': 'Jump committed.',
  'travel.arrival.oriented': 'Arrived.',
  'travel.interdiction.triggered': 'Interdicted.',
});

function harness() {
  const state = {
    tick: SEED,
    simTime: SEED / 60,
    mode: 'flight',
    playerId: 1,
    settings: { video: {}, accessibility: {} },
    world: { currentSectorId: 'sector_helios_prime' },
    entities: new Map([[1, { id: 1, pos: { x: 0, y: 0, z: 0 } }]]),
  };
  const bus = createBus();
  const captions = [];
  const suppressed = [];
  bus.on('presentation:caption', (payload) => captions.push(payload));
  bus.on('presentation:cueSuppressed', (payload) => suppressed.push(payload));
  const presenter = Object.create(presentationOrchestrator);
  const adapters = Object.create(presentationAdapters);
  presenter.init({ state, bus });
  adapters.init({ state, bus });
  return { state, bus, captions, suppressed, presenter };
}

function travelCaptions(h, id) {
  return h.captions.filter((row) => row && row.id && (!id || row.id === id));
}

test('SEED-SE-07 seed 4242 jump, arrival, and interdiction each caption once', () => {
  const h = harness();
  h.bus.emit('jump:start', { from: 'sector_helios_prime', to: 'sector_ceres_belt', via: 'drive' });
  h.bus.flush();
  const jumped = travelCaptions(h, 'travel.jump.committed');
  assert.equal(jumped.length, 1);
  assert.equal(jumped[0].text, SPOKEN['travel.jump.committed']);
  assert.equal(jumped[0].lane, 'accessibility.caption_priority');
  assert.equal(travelCaptions(h, 'travel.transition.continuity').length, 0);

  h.bus.emit('sector:enter', { sectorId: 'sector_ceres_belt' });
  h.bus.flush();
  const arrived = travelCaptions(h, 'travel.arrival.oriented');
  assert.equal(arrived.length, 1);
  assert.equal(arrived[0].text, SPOKEN['travel.arrival.oriented']);
  assert.equal(travelCaptions(h, 'travel.arrival.sector_identity').length, 0);

  h.state.tick = SEED + 1;
  h.bus.emit('interdiction:triggered', { sectorId: 'sector_ceres_belt', ambushCount: 2 });
  h.bus.flush();
  const yanked = travelCaptions(h, 'travel.interdiction.triggered');
  assert.equal(yanked.length, 1);
  assert.equal(yanked[0].text, SPOKEN['travel.interdiction.triggered']);

  const before = h.captions.length;
  h.bus.emit('cruise:engaged', {});
  h.bus.flush();
  assert.equal(h.captions.length, before, 'a vfx travel cue must not grow a caption');
});

test('SEED-SE-07 dedupe-window repeats stay one caption and the audio floor stays one voice', () => {
  for (const id of Object.keys(SPOKEN)) {
    const recipe = PRESENTATION_RECIPES[id];
    assert.equal(recipe.lanes.accessibility, 'accessibility.caption_priority');
    assert.equal(recipe.lanes.audio, 'audio.travel');
    assert.equal(recipe.budgets.voices, 1);
  }
  assert.equal(PRESENTATION_RECIPES['travel.transition.continuity'].lanes.accessibility, 'accessibility.none');
  assert.equal(PRESENTATION_RECIPES['travel.corridor.continuity'].lanes.accessibility, 'accessibility.none');
  assert.equal(PRESENTATION_RECIPES['travel.cruise.engaged'].lanes.accessibility, 'accessibility.none');
  assert.equal(PRESENTATION_RECIPES['travel.arrival.sector_identity'].lanes.accessibility, 'accessibility.none');

  const jump = harness();
  const depart = () => jump.bus.emit('jump:start', {
    from: 'sector_helios_prime', to: 'sector_ceres_belt', via: 'drive',
  });
  depart();
  jump.bus.flush();
  jump.presenter._travelCycle.committed = false;
  jump.state.tick = SEED + 10;
  depart();
  jump.bus.flush();
  assert.equal(travelCaptions(jump, 'travel.jump.committed').length, 1);
  assert.ok(jump.suppressed.some((row) => row.id === 'travel.jump.committed' && row.reason === 'dedupe_window'));

  const arrive = harness();
  arrive.bus.emit('jump:start', { from: 'sector_helios_prime', to: 'sector_ceres_belt', via: 'drive' });
  arrive.bus.flush();
  arrive.bus.emit('sector:enter', { sectorId: 'sector_ceres_belt' });
  arrive.bus.flush();
  arrive.state.tick = SEED + 5;
  arrive.bus.emit('sector:enter', { sectorId: 'sector_ceres_belt' });
  arrive.bus.flush();
  assert.equal(travelCaptions(arrive, 'travel.arrival.oriented').length, 1);
  assert.ok(arrive.suppressed.some((row) => row.id === 'travel.arrival.oriented' && row.reason === 'dedupe_window'));

  const block = harness();
  block.bus.emit('jump:start', { from: 'sector_helios_prime', to: 'sector_ceres_belt', via: 'drive' });
  block.bus.flush();
  const yank = () => block.bus.emit('interdiction:triggered', { sectorId: 'sector_ceres_belt', ambushCount: 1 });
  yank();
  block.bus.flush();
  block.state.tick = SEED + 5;
  yank();
  block.bus.flush();
  assert.equal(travelCaptions(block, 'travel.interdiction.triggered').length, 1);
  assert.ok(block.suppressed.some((row) => row.id === 'travel.interdiction.triggered' && row.reason === 'dedupe_window'));
  block.state.tick = SEED + 5 + 40;
  yank();
  block.bus.flush();
  assert.equal(travelCaptions(block, 'travel.interdiction.triggered').length, 2);
});
