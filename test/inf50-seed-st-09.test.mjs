// SEED-ST-09: the first plotted cross-sector route names Engage and its map home once.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { speakPlottedRouteTeach } from '../src/ui/hud.js';
import { plottedRouteEngageTeach } from '../src/ui/map/mapRouteRibbon.js';
import { promptLabel, setPromptDevice } from '../src/ui/bindings.js';

function crossRoute() {
  return { legs: [{ from: 'sector_helios_prime', to: 'sector_ceres_waypoint', fuel: 12, charge: 6 }] };
}

function sameRoute() {
  return { legs: [{ from: 'sector_helios_prime', to: 'sector_helios_prime', fuel: 0, charge: 0 }] };
}

test('a plotted cross-sector route names Engage on the Star Map once and does not fly it', () => {
  setPromptDevice('kbm');
  const label = promptLabel('starmap');
  assert.equal(plottedRouteEngageTeach(sameRoute(), { mapLabel: label }), '');
  assert.equal(plottedRouteEngageTeach(crossRoute(), { engaged: true, mapLabel: label }), '');
  assert.equal(plottedRouteEngageTeach(null), '');
  const taught = plottedRouteEngageTeach(crossRoute(), { mapHome: 'Star Map', mapLabel: label });
  assert.match(taught, /\bEngage\b/);
  assert.match(taught, /Star Map/);
  assert.ok(taught.includes(label));

  const state = createGameState(4242);
  assert.equal(state.meta.seed, 4242);
  state.nav.route = crossRoute();
  state.nav.autoTravel = true;
  const bus = createBus();
  const seen = [];
  bus.on('toast', (payload) => seen.push(payload));
  bus.on('nav:engageRoute', () => seen.push({ text: 'ENGAGED' }));
  const line = speakPlottedRouteTeach(state, bus);
  assert.equal(line, taught);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].text, taught);
  assert.equal(state.nav.executor, undefined, 'plotting still does not engage');
  assert.equal(speakPlottedRouteTeach(state, bus), '');
  assert.equal(seen.length, 1);
  assert.equal(state.player.hints.plottedRouteEngage, true);
});

test('same-sector, already engaged, combat, and hints off do not spend the line', () => {
  setPromptDevice('kbm');
  const bus = createBus();
  const seen = [];
  bus.on('toast', (payload) => seen.push(payload));
  bus.on('nav:engageRoute', () => seen.push({ text: 'ENGAGED' }));

  const same = createGameState(4242);
  same.nav.route = sameRoute();
  same.nav.autoTravel = true;
  assert.equal(speakPlottedRouteTeach(same, bus), '');
  assert.notEqual(same.player.hints.plottedRouteEngage, true);

  const flying = createGameState(4242);
  flying.nav.route = crossRoute();
  flying.nav.executor = { engaged: true };
  assert.equal(speakPlottedRouteTeach(flying, bus), '');
  assert.notEqual(flying.player.hints.plottedRouteEngage, true);
  assert.equal(flying.nav.executor.engaged, true);

  const quiet = createGameState(4242);
  quiet.settings.gameplay.tutorialHints = false;
  quiet.nav.route = crossRoute();
  assert.equal(speakPlottedRouteTeach(quiet, bus), '');
  assert.notEqual(quiet.player.hints.plottedRouteEngage, true);

  const previous = globalThis.document;
  globalThis.document = { body: { dataset: { sfHudJob: 'fight' } } };
  try {
    const fighting = createGameState(4242);
    fighting.nav.route = crossRoute();
    assert.equal(speakPlottedRouteTeach(fighting, bus), '');
    assert.notEqual(fighting.player.hints.plottedRouteEngage, true);
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
  assert.equal(seen.length, 0);
});
