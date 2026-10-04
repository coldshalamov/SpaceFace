import assert from 'node:assert/strict';
import test, { after } from 'node:test';

// NXI-208 — the quiet-state mix does not retain a dead field loop. When the last
// field ends, its loop releases inside the EXISTING audio lifecycle (the _frame
// pass that already reconciles rt.loops against state.fields.active) — not on a
// second timer or RAF, and not only when some new gameplay sound arrives to
// sweep it up. Owner: src/audio/audioSystem.js + src/audio/fieldAudio.js.
// Harness mirrors the mock Web-Audio rig from test/fb-priority-duck-sustained.test.mjs.

import { FIELD_DEFS } from '../src/data/fields.js';
import { fieldLoopKey } from '../src/audio/fieldAudio.js';

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
  }
  createBuffer(channels, length, sampleRate) {
    return { length, sampleRate, numberOfChannels: channels, getChannelData() { return new Float32Array(length); } };
  }
  createGain() { return new MockGainNode(); }
  createOscillator() { return new MockOscillatorNode(); }
  createBiquadFilter() { return new MockBiquadFilterNode(); }
  createBufferSource() { return new MockBufferSource(); }
  createDynamicsCompressor() {
    return {
      threshold: new MockAudioParam(-6), knee: new MockAudioParam(6), ratio: new MockAudioParam(12),
      attack: new MockAudioParam(0.003), release: new MockAudioParam(0.25),
      connect() {}, disconnect() {},
    };
  }
  createStereoPanner() { return { pan: new MockAudioParam(0), connect() {}, disconnect() {} }; }
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

function makeState(fieldsActive) {
  const player = {
    id: 1, isPlayer: true, alive: true, type: 'ship', team: 'player',
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
    hull: 100, hullMax: 100, shield: 100, shieldMax: 100, flags: {},
  };
  return {
    playerId: 1, tick: 0, simTime: 0, mode: 'flight',
    entities: new Map([[1, player]]),
    entityList: [player],
    player: { credits: 0, fuel: 100, cruise: { phase: 'idle' }, cargo: { items: {} } },
    input: { moveX: 0, moveZ: 0, brake: false, fire: false, actions: {} },
    world: { currentSectorId: 'sector_helios_prime', sectors: {}, activeSector: { stations: [] } },
    fields: { active: fieldsActive },
    settings: {
      audio: { muted: false, master: 0.55, sfx: 0.7, music: 0.32, engine: 0.7, ambient: 0.7, combat: 0.7, ui: 0.7, comms: 0.7 },
      video: { motionReduce: true },
      accessibility: { audioCues: true, captions: false },
    },
    ui: { docked: false, screenStack: [] },
  };
}

const WELL = (id, x = 6) => ({
  id, kind: 'well', strength: FIELD_DEFS.well.strength,
  phase: 'active', center: { x, z: 0 },
});

function boot(fieldsActive) {
  try { audio.destroy(); } catch (_) {}
  FAKE_NOW_MS = 0;
  const state = makeState(fieldsActive);
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

const fieldLoopKeys = (h) => Object.keys(h.rt.loops).filter((k) => k.startsWith('fieldLoop_'));

test('the last field ending releases its loop on the existing frame pass — no new gameplay sound needed', () => {
  const h = boot([WELL('w1')]);
  frame(h, 10);
  assert.ok(h.rt.loops[fieldLoopKey('w1')], 'the live well hums as a sustained loop');

  // The last field ends on the sim side: its record leaves state.fields.active —
  // and NOTHING else arrives: no fields:ended emit, no audio:cue, no play().
  // The done-when pins the case where the accepted end is only visible in the
  // published mirror, so the existing cadence reconcile must do the release.
  h.state.fields.active.length = 0;
  let plays = 0;
  const origPlay = audio.play;
  audio.play = (...a) => { plays++; return origPlay.apply(audio, a); };
  let fieldEvents = 0;
  const count = () => { fieldEvents++; };
  h.bus.on('fields:ended', count);
  try {
    frame(h, 10); // ~0.17 s of audio clock — past the 0.05 s reconcile cadence
  } finally {
    audio.play = origPlay;
  }
  assert.equal(plays, 0, 'no new gameplay sound arrived to sweep the loop up');
  assert.equal(fieldEvents, 0, 'the release did not need a second fields:ended');
  assert.equal(h.rt.loops[fieldLoopKey('w1')], undefined,
    'the dead field loop releases inside the existing lifecycle');
  assert.deepEqual(fieldLoopKeys(h), [], 'the quiet-state mix retains no field loop');
});

test('the accepted ended source releases by event, and a still-live neighbor keeps humming', () => {
  const h = boot([WELL('w1'), WELL('r1', 12)]);
  h.state.fields.active[1].kind = 'repulsor';
  h.state.fields.active[1].strength = FIELD_DEFS.repulsor.strength;
  frame(h, 10);
  assert.ok(h.rt.loops[fieldLoopKey('w1')] && h.rt.loops[fieldLoopKey('r1')],
    'both live fields hold loops');

  // The event path: the ended source names the loop's identity directly.
  h.bus.emit('fields:ended', { fieldId: 'r1', kind: 'repulsor', reason: 'field_expired' });
  assert.equal(h.rt.loops[fieldLoopKey('r1')], undefined, 'the ended source releases at once');
  h.state.fields.active = h.state.fields.active.filter((r) => r.id !== 'r1');
  frame(h, 10);
  assert.ok(h.rt.loops[fieldLoopKey('w1')], 'the surviving neighbor keeps its loop');

  // Neighboring success: a field that legitimately goes live again still earns a
  // fresh loop — the release was a release, not a stuck-closed mixer lane.
  h.state.fields.active.push(WELL('w2', 9));
  frame(h, 10);
  assert.ok(h.rt.loops[fieldLoopKey('w2')], 'a new live field still gets its voice');
});

after(() => { try { audio.destroy(); } catch (_) {} });
