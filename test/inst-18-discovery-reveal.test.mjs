// INST-18 — a point of interest resolving on the scope is the authored wonder beat.
// `sfx_discovery_reveal` existed in the recipe book bound to a sample but nothing ever played
// it: proximity scans, survey sweeps, unlocks, anomaly triangulation and investigation
// completions all emit `poi:discovered`, and only bookkeeping listened. The audio system now
// answers with the reveal — once per POI, one reveal per tick so a sweep reads as one find,
// and never on a POI whose record already carries identification/investigation (the plate
// motif owns that beat).
import test from 'node:test';
import assert from 'node:assert/strict';

import { audio } from '../src/audio/audioSystem.js';
import { createBus } from '../src/core/eventBus.js';
import { RECIPES } from '../src/data/audioRecipes.js';

function fakeParam() {
  return {
    value: 0,
    setValueAtTime() {}, setTargetAtTime() {}, linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {}, cancelScheduledValues() {},
  };
}

function fakeNode() {
  return {
    gain: fakeParam(), frequency: fakeParam(), Q: fakeParam(), detune: fakeParam(),
    playbackRate: fakeParam(), type: '', loop: false, buffer: null,
    connect() {}, disconnect() {}, start() {}, stop() {},
  };
}

function fakeCtx(now = 1) {
  return {
    currentTime: now,
    state: 'running',
    sampleRate: 48000,
    destination: {},
    createGain: fakeNode,
    createOscillator: fakeNode,
    createBiquadFilter: fakeNode,
    createBufferSource: fakeNode,
    createDynamicsCompressor: fakeNode,
    createBuffer: (channels, len, rate) => ({
      getChannelData: () => new Float32Array(len),
      sampleRate: rate,
    }),
    addEventListener() {},
    removeEventListener() {},
  };
}

function makeHost(world = {}) {
  const bus = createBus();
  const player = {
    id: 'player', alive: true, pos: { x: 0, z: 0 }, hull: 100, hullMax: 100,
    cap: 50, flags: {}, data: { weapons: [], combat: {} },
  };
  const state = {
    playerId: 'player',
    simTime: 10,
    tick: 5,
    entities: new Map([['player', player]]),
    input: { fire: false },
    settings: { audio: { muted: false, master: 1, sfx: 1, music: 0.5 } },
    ui: {},
    world: { currentSectorId: 'sector_helios', discovery: {}, ...world },
    audioRuntime: {},
  };
  const plays = [];
  const host = Object.create(audio);
  host.play = function playSpy(recipeId, opts) {
    plays.push({ recipeId, opts: opts || {} });
    return { recipeId };
  };
  host.init({ state, bus, helpers: {} });
  host.rt.ctx = fakeCtx(10);
  return { host, bus, state, plays };
}

const reveals = (plays) => plays.filter((p) => p.recipeId === 'sfx_discovery_reveal');

test('a discovered POI plays the authored reveal once', () => {
  const { bus, plays } = makeHost();
  bus.emit('poi:discovered', { poiId: 'poi_a', sectorId: 'sector_helios', type: 'cache' });
  assert.equal(reveals(plays).length, 1);
  assert.equal(reveals(plays)[0].opts.gain, 0.7);
});

test('the same POI never re-rings, even if the event is re-emitted', () => {
  const { bus, plays } = makeHost();
  const payload = { poiId: 'poi_a', sectorId: 'sector_helios' };
  bus.emit('poi:discovered', payload);
  bus.emit('poi:discovered', payload);
  bus.emit('poi:discovered', { ...payload });
  assert.equal(reveals(plays).length, 1, 'once per POI, at the listener too');
});

test('a survey sweep coalesces to one reveal per tick', () => {
  const { bus, state, plays } = makeHost();
  for (const poiId of ['poi_a', 'poi_b', 'poi_c']) {
    bus.emit('poi:discovered', { poiId, sectorId: 'sector_helios' });
  }
  assert.equal(reveals(plays).length, 1, 'three finds in one tick read as one sound');
  state.tick += 1;
  bus.emit('poi:discovered', { poiId: 'poi_d', sectorId: 'sector_helios' });
  assert.equal(reveals(plays).length, 2, 'a later find rings again');
});

test('an investigated or already-identified POI yields to the plate motif', () => {
  const { bus, plays } = makeHost({
    discovery: {
      sector_helios: { pois: { poi_a: { discovered: true, identified: true, investigated: true } } },
    },
  });
  bus.emit('poi:discovered', { poiId: 'poi_a', sectorId: 'sector_helios', type: 'cache' });
  assert.equal(reveals(plays).length, 0,
    'the record flags are set before the completion emits — the plate speaks for it');
});

test('a bare payload is silent, and the recipe really exists', () => {
  const { bus, plays } = makeHost();
  bus.emit('poi:discovered', {});
  bus.emit('poi:discovered', null);
  bus.emit('poi:discovered', { poiId: null });
  assert.equal(reveals(plays).length, 0);
  assert.ok(RECIPES.some((r) => r && r.id === 'sfx_discovery_reveal'),
    'the authored recipe exists to be played');
});
