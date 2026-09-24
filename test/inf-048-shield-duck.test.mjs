import assert from 'node:assert/strict';
import test, { after } from 'node:test';

// INF-048 — the player's terse shield failure reserves the ear: the world mix bows for
// the alarm phrase at the published duck levels, then returns on the audio-clock envelope.
// Mirrors the mock-Web-Audio harness from test/audio-mix-direction.test.mjs.

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
  createConvolver() { return { buffer: null, normalize: true, connect() {}, disconnect() {} }; }
  createPanner() { return { connect() {}, disconnect() {} }; }
  resume() { this.state = 'running'; return Promise.resolve(); }
  close() { this.state = 'closed'; return Promise.resolve(); }
}

let FAKE_NOW_MS = 0;
globalThis.window = { addEventListener() {}, removeEventListener() {}, AudioContext: MockAudioContext, webkitAudioContext: MockAudioContext };
globalThis.performance = { now: () => FAKE_NOW_MS };
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};

const { audio, COMMS_DUCK } = await import('../src/audio/audioSystem.js');
const { createBus } = await import('../src/core/eventBus.js');

function makeState() {
  const player = {
    id: 1, isPlayer: true, alive: true, type: 'ship', team: 'player',
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
    hull: 100, hullMax: 100, shield: 0, shieldMax: 100, flags: {},
  };
  return {
    playerId: 1, tick: 0, simTime: 0,
    entities: new Map([[1, player]]),
    entityList: [player],
    player: { credits: 0, fuel: 100, cruise: { phase: 'idle' }, cargo: { items: {} } },
    input: { moveX: 0, moveZ: 0, brake: false, fire: false, actions: {} },
    world: { currentSectorId: 'sector_helios_prime', sectors: {}, activeSector: { stations: [] } },
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

test('INF-048: player shield failure bows the world mix for the alarm phrase', () => {
  const h = boot();
  frame(h, 24);
  const base = { ...h.rt._busLevels };
  assert.ok(base.music > 0 && base.combat > 0 && base.ambient > 0 && base.engine > 0, 'world buses must be live');

  h.bus.emit('shieldDown', { combatantId: 1, pos: { x: 10, z: 0 } });
  frame(h, 3);
  assert.ok(h.rt._commsDuckUntilS > h.ctx.currentTime, 'the duck window must open on shield failure');
  assert.equal(h.rt._commsDuckGain, COMMS_DUCK.gain, 'the reservation rides the published duck level');
  const ducked = { ...h.rt._busLevels };
  assert.ok(ducked.music < base.music * 0.75, `music bows ${base.music} -> ${ducked.music}`);
  assert.ok(ducked.combat < base.combat * 0.75, `combat bows ${base.combat} -> ${ducked.combat}`);
  assert.ok(ducked.ambient < base.ambient * 0.75, `ambient bows ${base.ambient} -> ${ducked.ambient}`);
  assert.ok(ducked.engine < base.engine * 0.75, `engine bows ${base.engine} -> ${ducked.engine}`);
  assert.equal(ducked.master, base.master, 'the master fader stays the user\'s knob');
});

test('INF-048: the reservation is deterministic and returns on the envelope', () => {
  const h = boot();
  // Settle the music director first (shields read empty, so it walks calm->tense on its own
  // hold clock). The return assertion below must measure the duck envelope, not direction.
  frame(h, 240);
  const base = { ...h.rt._busLevels };
  h.bus.emit('shieldDown', { combatantId: 1, pos: { x: 10, z: 0 } });
  frame(h, 2);
  const firstUntil = h.rt._commsDuckUntilS;
  const firstGain = h.rt._commsDuckGain;
  // A second blowout inside the window extends the reservation, never deepens it.
  h.bus.emit('shieldDown', { combatantId: 1, pos: { x: 10, z: 0 } });
  frame(h, 2);
  assert.equal(h.rt._commsDuckGain, firstGain, 'no stacking — one reserved gain position');
  assert.ok(h.rt._commsDuckUntilS >= firstUntil, 'the window extends, it does not double-bow');

  const wait = Math.ceil((h.rt._commsDuckUntilS - h.ctx.currentTime) * 60) + 12;
  frame(h, wait);
  assert.ok(h.ctx.currentTime >= h.rt._commsDuckUntilS, 'phrase window must close');
  assert.equal(h.rt._commsDuckLive, 1, 'the duck envelope itself releases on the clock');
  // Engine and combat carry no sidechain term, so they measure the duck return exactly.
  // (Music/ambient also ride the loud-voice sidechain follower, which releases on its own
  // slower clock — separate, correct dynamics, not the reservation under test.)
  assert.ok(Math.abs(h.rt._busLevels.engine - base.engine) < base.engine * 0.02,
    `engine returns ${h.rt._busLevels.engine} ≈ ${base.engine}`);
  assert.ok(Math.abs(h.rt._busLevels.combat - base.combat) < base.combat * 0.02,
    `combat returns ${h.rt._busLevels.combat} ≈ ${base.combat}`);
});

test('INF-048: an NPC shield break does not reserve the ear', () => {
  const h = boot();
  frame(h, 24);
  h.bus.emit('shieldDown', { combatantId: 9, pos: { x: 400, z: 0 } });
  frame(h, 3);
  assert.ok(!(h.rt._commsDuckUntilS > h.ctx.currentTime), 'distant NPC failure stays positional');
});

after(() => { try { audio.destroy(); } catch (_) {} });
