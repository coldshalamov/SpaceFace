// INFERENCE unit — the historic-wreck bearing fix is the discovery loop's payoff beat and it
// was silent: `uniqueWreck:bearingFixed` carried a plate and a toast but no sound, while the
// same plate's POI path (`discovery:plateUnlocked`) answered with the 3-note motif. The bearing
// fix now speaks with the same motif — once per wreck, never on a re-emitted row, and a second
// wreck rings again. The bearing-fixed moment is not a `poi:discovered`, so the reveal fanfare
// stays out of the way.
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

const motif = (plays) => plays.filter((p) => p.recipeId === 'sfx_discovery_plate_note');
const reveal = (plays) => plays.filter((p) => p.recipeId === 'sfx_discovery_reveal');

test('a fixed bearing plays the authored plate motif — the 3-note figure', () => {
  const { bus, plays } = makeHost();
  bus.emit('uniqueWreck:bearingFixed', {
    wreckId: 'wreck_silver_draft', sectorId: 'sector_helios', pos: { x: 10, z: 4 },
  });
  assert.equal(motif(plays).length, 3, 'root, third, fifth');
  assert.equal(motif(plays)[0].opts.critical, true);
});

test('the same wreck never re-rings, even if the event is re-emitted', () => {
  const { bus, plays } = makeHost();
  const payload = { wreckId: 'wreck_silver_draft', sectorId: 'sector_helios' };
  bus.emit('uniqueWreck:bearingFixed', payload);
  bus.emit('uniqueWreck:bearingFixed', payload);
  bus.emit('uniqueWreck:bearingFixed', { ...payload });
  assert.equal(motif(plays).length, 3, 'one motif total, not three');
});

test('a different wreck rings again', () => {
  const { bus, plays } = makeHost();
  bus.emit('uniqueWreck:bearingFixed', { wreckId: 'wreck_a', sectorId: 'sector_helios' });
  bus.emit('uniqueWreck:bearingFixed', { wreckId: 'wreck_b', sectorId: 'sector_ashfall_reach' });
  assert.equal(motif(plays).length, 6);
});

test('the bearing fix is not a POI reveal — the wonder fanfare stays quiet', () => {
  const { bus, plays } = makeHost();
  bus.emit('uniqueWreck:bearingFixed', { wreckId: 'wreck_a', sectorId: 'sector_helios' });
  assert.equal(reveal(plays).length, 0);
});

test('a bare payload is silent, and the motif recipe really exists', () => {
  const { bus, plays } = makeHost();
  bus.emit('uniqueWreck:bearingFixed', {});
  bus.emit('uniqueWreck:bearingFixed', null);
  bus.emit('uniqueWreck:bearingFixed', { sectorId: 'sector_helios' });
  assert.equal(motif(plays).length, 0);
  assert.ok(RECIPES.some((r) => r && r.id === 'sfx_discovery_plate_note'),
    'the authored recipe exists to be played');
});
