import assert from 'node:assert/strict';
import test, { after } from 'node:test';

// FB-083 — a high-importance cue bows EVERY sustained voice, not only the weapon and
// engine loops: the live gravity well's field hum, the taut rope tone, and the cruise
// loop all take the -8 dB / 250 ms envelope. Music, comms, ui, and master never take it.
// Harness mirrors the mock Web-Audio rig from test/inf-048-shield-duck.test.mjs.

import { FIELD_DEFS } from '../src/data/fields.js';
import {
  PRIORITY_DUCK_DB,
  PRIORITY_DUCK_DURATION_MS,
  PRIORITY_DUCK_THRESHOLD,
  createCuePriorityBus,
  dbToGain,
  isPriorityDuckTarget,
} from '../src/audio/cuePriorityBus.js';

const DUCK_GAIN = Math.round(dbToGain(PRIORITY_DUCK_DB) * 10000) / 10000;

// The sustained voices the mix actually carries, tagged the way _startLoopVoice /
// fieldAudio.js leave them on rt.loops — a loop flag on a world bus is the whole target.
const WELL = { busName: 'combat', role: 'combat', loop: true };        // field loop (fieldAudio.js)
const ROPE = { busName: 'engine', loop: true };                        // tether tone rides the engine-side duck
const CRUISE = { busName: 'engine', role: 'engineLoop', loop: true };  // _syncCruiseLoop → sfx.cruiseEngaged
const DRILL = { busName: 'sfx', loop: true };                          // drill grind
const HUM = { busName: 'ambient', loop: true };                        // station / anomaly hum
const MUSIC = { busName: 'music', role: 'music', loop: true };
const COMMS = { busName: 'comms', role: 'comms', loop: true };
const UI = { busName: 'ui', role: 'ui', loop: true };
const MASTER = { busName: 'master', role: 'master', loop: true };

test('FB-083: the envelope classifies every sustained world voice and restores at 250 ms', () => {
  for (const v of [WELL, ROPE, CRUISE, DRILL, HUM]) {
    assert.equal(isPriorityDuckTarget(v), true, `sustained ${v.busName} voice must bow`);
  }
  for (const v of [MUSIC, COMMS, UI, MASTER]) {
    assert.equal(isPriorityDuckTarget(v), false, `${v.busName} never takes the cue`);
  }
  assert.equal(isPriorityDuckTarget({ busName: 'combat', loop: false }), false,
    'one-shots do not bow — sustained voices only');
  assert.equal(isPriorityDuckTarget({ busName: 'ambient', loop: true, critical: true }), false,
    'the critical voice itself never bows');

  const bus = createCuePriorityBus();
  const cueAt = 1000;
  assert.equal(bus.applyCue({ importance: PRIORITY_DUCK_THRESHOLD - 0.01 }, 0), null,
    'a sub-threshold cue opens no window — the threshold is unchanged');

  const env = bus.applyCue({ id: 'test.critical', importance: 0.9, playerRelevance: 1 }, cueAt);
  assert.ok(env, 'a critical cue opens the duck window');
  assert.equal(env.durationMs, PRIORITY_DUCK_DURATION_MS, 'the 250 ms law stands');
  assert.equal(env.duckDb, PRIORITY_DUCK_DB, 'the -8 dB depth stands');
  assert.equal(env.duckGain, DUCK_GAIN);
  assert.equal(env.endMs, cueAt + PRIORITY_DUCK_DURATION_MS);

  for (const v of [WELL, ROPE, CRUISE, DRILL, HUM]) {
    assert.equal(bus.gainFor(v, cueAt + 1), DUCK_GAIN, `${v.busName} loop bows inside the window`);
    assert.equal(bus.gainFor(v, env.endMs - 1), DUCK_GAIN, `${v.busName} still bowed on the last ms`);
    assert.equal(bus.gainFor(v, env.endMs), 1, `${v.busName} returns on the 250 ms boundary`);
  }
  for (const v of [MUSIC, COMMS, UI, MASTER]) {
    assert.equal(bus.gainFor(v, cueAt + 1), 1, `${v.busName} untouched inside the window`);
    assert.equal(bus.gainFor(v, env.endMs - 1), 1, `${v.busName} untouched to the boundary`);
  }
});

// ---- live mix harness --------------------------------------------------------

class MockAudioParam {
  constructor(v = 1) { this.value = v; this.timeline = []; }
  setValueAtTime(val, t) { this.timeline.push({ type: 'set', val, t }); this.value = val; return this; }
  linearRampToValueAtTime(val, t) { this.timeline.push({ type: 'linear', val, t }); this.value = val; return this; }
  exponentialRampToValueAtTime(val, t) { this.timeline.push({ type: 'exp', val, t }); this.value = val; return this; }
  setTargetAtTime(val, t, tc) { this.timeline.push({ type: 'target', val, t, tc }); this.value = val; return this; }
  cancelScheduledValues(t) { this.timeline = this.timeline.filter((e) => e.t < t); return this; }
}
class MockGainNode {
  constructor(g = 1) { this.gain = new MockAudioParam(g); this._out = []; }
  connect(d) { this._out.push(d); }
  disconnect() { this._out.length = 0; }
}
class MockOscillatorNode {
  constructor() { this.frequency = new MockAudioParam(440); this.detune = new MockAudioParam(0); this.type = 'sine'; }
  connect() {} disconnect() {}
  start() {} stop() {}
}
class MockBiquadFilterNode {
  constructor() { this.frequency = new MockAudioParam(1000); this.Q = new MockAudioParam(1); this.type = 'lowpass'; }
  connect() {} disconnect() {}
}
class MockBufferSource {
  constructor() { this.buffer = null; this.loop = false; this.playbackRate = new MockAudioParam(1); }
  connect() {} disconnect() {}
  start() {} stop() {}
}
class MockAudioContext {
  constructor() {
    this.currentTime = 0; this.state = 'running'; this.sampleRate = 44100;
    this.created = { gain: 0, osc: 0, filter: 0, source: 0, panner: 0 };
  }
  createBuffer(channels, length, sampleRate) {
    return { length, sampleRate, numberOfChannels: channels, getChannelData() { return new Float32Array(length); } };
  }
  createGain() { this.created.gain++; return new MockGainNode(); }
  createOscillator() { this.created.osc++; return new MockOscillatorNode(); }
  createBiquadFilter() { this.created.filter++; return new MockBiquadFilterNode(); }
  createBufferSource() { this.created.source++; return new MockBufferSource(); }
  createDynamicsCompressor() {
    return {
      threshold: new MockAudioParam(-6), knee: new MockAudioParam(6), ratio: new MockAudioParam(12),
      attack: new MockAudioParam(0.003), release: new MockAudioParam(0.25),
      connect() {}, disconnect() {},
    };
  }
  createStereoPanner() { this.created.panner++; return { pan: new MockAudioParam(0), connect() {}, disconnect() {} }; }
  createWaveShaper() { return { curve: null, oversample: 'none', connect() {}, disconnect() {} }; }
  createDelay(max = 1) { return { delayTime: new MockAudioParam(Math.min(0.1, max)), connect() {}, disconnect() {} }; }
  createChannelMerger() { return { connect() {}, disconnect() {} }; }
  createChannelSplitter() { return { connect() {}, disconnect() {} }; }
  createConvolver() { return { buffer: null, normalize() {}, connect() {}, disconnect() {} }; }
  createPanner() { return { connect() {}, disconnect() {} }; }
  resume() { this.state = 'running'; return Promise.resolve(); }
  close() { this.state = 'closed'; return Promise.resolve(); }
}

let FAKE_NOW_MS = 0;
globalThis.window = { addEventListener() {}, removeEventListener() {}, AudioContext: MockAudioContext, webkitAudioContext: MockAudioContext };
globalThis.performance = { now: () => FAKE_NOW_MS };
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};

const { audio } = await import('../src/audio/audioSystem.js');
const { createBus } = await import('../src/core/eventBus.js');

function makeState() {
  const player = {
    id: 1, isPlayer: true, alive: true, type: 'ship', team: 'player',
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
    hull: 100, hullMax: 100, shield: 0, shieldMax: 100, flags: {},
  };
  return {
    playerId: 1, tick: 0, simTime: 0, mode: 'flight',
    entities: new Map([[1, player]]),
    entityList: [player],
    player: {
      credits: 0, fuel: 100, cruise: { phase: 'idle' }, cargo: { items: {} },
      // A taut line under tow: the rope tone sings at the published load.
      tether: { phase: 'loaded', load: 0.8, active: true },
    },
    input: { moveX: 0, moveZ: 0, brake: false, fire: false, actions: {} },
    world: { currentSectorId: 'sector_helios_prime', sectors: {}, activeSector: { stations: [] } },
    // A live gravity well near the player: its field hum is a sustained combat-bus loop.
    fields: {
      active: [{
        id: 'w1', kind: 'well', strength: FIELD_DEFS.well.strength,
        phase: 'active', center: { x: 6, z: 0 },
      }],
    },
    settings: {
      audio: { muted: false, master: 0.55, sfx: 0.7, music: 0.32, engine: 0.7, ambient: 0.7, combat: 0.7, ui: 0.7, comms: 0.7 },
      video: { motionReduce: true },
      accessibility: { audioCues: true, captions: false },
    },
    ui: { docked: false, screenStack: [] },
  };
}

function boot() {
  try { audio.destroy(); } catch (_) {}
  FAKE_NOW_MS = 0;
  const state = makeState();
  const bus = createBus();
  audio.init({ state, bus, helpers: {} });
  const ctx = audio._ensureContext();
  assert.ok(ctx, 'mock AudioContext must come up');
  return { state, bus, ctx, rt: audio.rt };
}

function frame(h, n = 1) {
  for (let i = 0; i < n; i++) {
    h.ctx.currentTime += 1 / 60;
    FAKE_NOW_MS += 1000 / 60;
    h.state.simTime += 1 / 60;
    h.state.tick += 1;
    audio._frame();
  }
}

test('FB-083: a critical cue bows a live well, the taut rope, and cruise — then returns at 250 ms', () => {
  const h = boot();
  h.rt._wantCruise = true;          // the same desire flag _frame honors for the engaged drive
  audio._syncFieldAudio();          // bound at init by fieldAudio.bindFieldAudio
  frame(h, 30);                     // let the loops start and the sidechain follower settle

  const cruise = h.rt.loops.cruise;
  const well = h.rt.loops.fieldLoop_w1;
  assert.ok(cruise && cruise.gain && cruise.gain.gain, 'the cruise loop is live');
  assert.ok(well && well.gain && well.gain.gain, 'the well hum is a live loop');
  assert.ok(h.rt.tetherHum && h.rt.tetherHum.gain, 'the rope bed exists');
  assert.ok(h.rt._elemVoice && h.rt._elemVoice.ropeGain > 0, 'the taut rope is singing');

  const base = {
    cruise: cruise.gain.gain.value,
    well: well.gain.gain.value,
    rope: h.rt.tetherHum.gainValue,
    heardRope: h.rt._elemVoice.heardRope,
    buses: { ...h.rt._busLevels },
  };
  assert.ok(base.cruise > 0 && base.well > 0 && base.rope > 0 && base.heardRope > 0,
    'all three voices must be audible before the cue');

  // A critical cue on the wired presentation route opens the 250 ms window.
  h.bus.emit('presentation:cue', { id: 'test.critical', importance: 0.9, playerRelevance: 1 });
  frame(h, 2);

  // Every sustained world voice bows by the published depth.
  assert.ok(Math.abs(h.rt._priorityDuckWeapon - DUCK_GAIN) < 1e-6, 'the weapon-side probe takes the envelope');
  assert.ok(Math.abs(h.rt._priorityDuckEngine - DUCK_GAIN) < 1e-6, 'the engine-side probe takes the envelope');
  assert.ok(cruise.gain.gain.value < base.cruise * 0.6,
    `cruise bows ${base.cruise} -> ${cruise.gain.gain.value}`);
  assert.ok(well.gain.gain.value < base.well * 0.6,
    `the well bows ${base.well} -> ${well.gain.gain.value}`);
  assert.ok(h.rt.tetherHum.gainValue < base.rope * 0.6,
    `the rope bows ${base.rope} -> ${h.rt.tetherHum.gainValue}`);
  assert.ok(Math.abs(h.rt._elemVoice.duck - DUCK_GAIN) < 1e-3,
    'the elementary rope voice takes the priority duck');
  assert.ok(h.rt._elemVoice.heardRope < base.heardRope * 0.9,
    `heard rope ${base.heardRope} -> ${h.rt._elemVoice.heardRope}`);

  // Music, comms, ui, and master never take the cue — not at the arbiter, not at the faders.
  // The fader check carries a 2% band: the combat sidechain follower (a different duck law,
  // already live under the well's hum) is still converging and breathes the music fader by
  // ~0.4% a frame. The cue must add nothing on top of that — a real bow would be ~60%.
  for (const key of ['music', 'comms', 'ui', 'master']) {
    assert.equal(h.rt._priorityBus.gainFor({ busName: key, loop: true }, FAKE_NOW_MS), 1,
      `the priority bus answers 1 for ${key}`);
    assert.ok(Math.abs(h.rt._busLevels[key] - base.buses[key]) <= Math.max(1e-9, base.buses[key] * 0.02),
      `the ${key} fader is untouched (${base.buses[key]} -> ${h.rt._busLevels[key]})`);
  }

  // The envelope closes on its own clock: past 250 ms every voice returns.
  frame(h, 20);
  assert.equal(h.rt._priorityDuckWeapon, 1, 'the weapon probe releases');
  assert.equal(h.rt._priorityDuckEngine, 1, 'the engine probe releases');
  assert.ok(Math.abs(cruise.gain.gain.value - base.cruise) < base.cruise * 0.05,
    `cruise returns ${cruise.gain.gain.value} ≈ ${base.cruise}`);
  assert.ok(Math.abs(well.gain.gain.value - base.well) < base.well * 0.05,
    `the well returns ${well.gain.gain.value} ≈ ${base.well}`);
  assert.ok(Math.abs(h.rt.tetherHum.gainValue - base.rope) < Math.max(1e-6, base.rope * 0.05),
    `the rope returns ${h.rt.tetherHum.gainValue} ≈ ${base.rope}`);
  assert.ok(h.rt._elemVoice.duck > DUCK_GAIN + 0.05,
    'the elementary rope voice releases back to the sidechain level');
});

after(() => { try { audio.destroy(); } catch (_) {} });
