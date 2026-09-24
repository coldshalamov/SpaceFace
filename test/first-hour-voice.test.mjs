// FIRST-HOUR-VOICE — the first hour is audible.
//
// Proves, without a browser and without an audio device:
//   1. the instructor register exists, is deterministic, is distinct from every faction register
//      and the mechanic, and its sample body is in the manifest and on disk, byte-pinned to the
//      shipped renderer (generate-bark-voice --check);
//   2. every tutorial:say line gets the full radio treatment (key click → register voice →
//      squelch tail) with no faction theme sting, and the same line inside the repeat window
//      keys the mic once;
//   3. firsthour:milestone plays the authored moment stinger;
//   4. ui:firstRunSplash:active plays the cold-open swell — the splash is not silent black.
//
// A headless harness cannot prove a speaker moved. It can prove the graph is connected to real
// bus events with the authored recipes — which is exactly what was missing.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Mock Web Audio (same shape as test/asteroid-sound-routing.test.mjs)
// ---------------------------------------------------------------------------
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
  constructor() { this.frequency = new MockAudioParam(440); this.detune = new MockAudioParam(0); this.type = 'sine'; this._started = false; this._stopped = false; }
  connect() {} disconnect() {}
  start() { this._started = true; }
  stop() { this._stopped = true; }
}
class MockBiquadFilterNode {
  constructor() { this.frequency = new MockAudioParam(1000); this.Q = new MockAudioParam(1); this.type = 'lowpass'; }
  connect() {} disconnect() {}
}
class MockBufferSource {
  constructor() { this.buffer = null; this.loop = false; this.playbackRate = new MockAudioParam(1); this._started = false; }
  connect() {} disconnect() {}
  start() { this._started = true; }
  stop() {}
}
class MockAudioContext {
  constructor() { this.currentTime = 0; this.state = 'running'; this.sampleRate = 44100; }
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

const { audio, INSTRUCTOR_REPEAT_WINDOW_S } = await import('../src/audio/audioSystem.js');
const { createBus } = await import('../src/core/eventBus.js');
const barkVoice = await import('../src/audio/barkVoice.js');
const { SAMPLE_MANIFEST } = await import('../src/audio/sampleLibrary.js');

const failures = [];
function section(name, fn) {
  try { fn(); console.log(`  ok  ${name}`); } catch (err) {
    failures.push(`${name}: ${err && err.message}`);
    console.log(`  FAIL ${name}\n       ${err && err.message}`);
  }
}

function makeState() {
  return {
    playerId: 'player',
    simTime: 10,
    tick: 100,
    entities: new Map([['player', { id: 'player', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, hull: 100, hullMax: 100, shield: 50, shieldMax: 50, alive: true, flags: {}, team: 0, type: 'ship' }]]),
    player: { cruise: { phase: 'idle' }, tether: { active: false, strain: 0 }, cargo: { items: {} } },
    input: { moveX: 0, moveZ: 0, brake: false, actions: {} },
    world: { currentSectorId: 'sector_helios_prime', sectors: {} },
    settings: {
      audio: { muted: false, master: 0.55, sfx: 0.7, music: 0.32, engine: 0.7, ambient: 0.7, combat: 0.7, ui: 0.7, comms: 0.7 },
      video: { motionReduce: false },
      accessibility: {},
    },
    ui: { docked: false, screenStack: [] },
    mode: 'flight',
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
  const plays = [];
  const origPlay = audio.play;
  audio.play = function spyPlay(id, opts) {
    plays.push({ id, opts: opts || {} });
    return origPlay.call(this, id, opts);
  };
  return { state, bus, ctx, plays, rt: audio.rt };
}

// ---------------------------------------------------------------------------
// §1 — the instructor register: distinct, deterministic, resident
// ---------------------------------------------------------------------------
section('§1 instructor register: distinct f0 from every faction + the mechanic', () => {
  const { INSTRUCTOR_VOICE_REGISTER, FACTION_VOICE_REGISTERS, MECHANIC_VOICE_REGISTER, resolveInstructorVoice } = barkVoice;
  const f0s = [
    ...Object.values(FACTION_VOICE_REGISTERS).map((r) => r.f0),
    MECHANIC_VOICE_REGISTER.f0,
    INSTRUCTOR_VOICE_REGISTER.f0,
  ];
  assert.equal(new Set(f0s).size, f0s.length, 'instructor f0 must be unique in the voice set');
  assert.notEqual(INSTRUCTOR_VOICE_REGISTER.id, 'mechanic');
  // Least-processed register in the set: the instructor is clean radio, not a faction palette.
  const noises = [...Object.values(FACTION_VOICE_REGISTERS).map((r) => r.noise), MECHANIC_VOICE_REGISTER.noise];
  assert.ok(INSTRUCTOR_VOICE_REGISTER.noise < Math.min(...noises), 'instructor must be the cleanest register');
});

section('§2 resolveInstructorVoice: deterministic, duration scales with the line', () => {
  const { resolveInstructorVoice } = barkVoice;
  const a = resolveInstructorVoice('Contract 47-A: the manifest says one mass.');
  const b = resolveInstructorVoice('Contract 47-A: the manifest says one mass.');
  assert.equal(JSON.stringify(a), JSON.stringify(b), 'same line must resolve identically (no RNG)');
  assert.equal(a.sampleId, 'bark_instructor');
  assert.equal(a.recipeId, 'sfx_bark_radio');
  assert.ok(a.speech.durationS > 0.45, 'speech duration must be positive');
  const long = resolveInstructorVoice('word '.repeat(20) + 'end');
  assert.ok(long.speech.durationS > a.speech.durationS, 'longer line must resolve longer');
  assert.equal(barkVoice.INSTRUCTOR_LINES.length >= 2, true, 'representative instructor lines authored');
});

section('§3 bark_instructor sample: manifest row, on disk, byte-pinned to the renderer', () => {
  const entry = SAMPLE_MANIFEST.get('bark_instructor');
  assert.ok(entry, 'manifest must carry bark_instructor');
  assert.equal(entry.file, 'assets/audio/voice/bark_instructor.wav');
  const wav = path.join(__dirname, '..', entry.file);
  assert.ok(fs.existsSync(wav), 'the rendered sample body must exist on disk');
  const head = fs.readFileSync(wav).subarray(0, 4).toString('ascii');
  assert.equal(head, 'RIFF', 'sample must be a WAV file');
  // The shipped bytes must match the shipped renderer exactly (the generator's own law).
  execFileSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'generate-bark-voice.mjs'), '--check'], { stdio: 'pipe' });
});

// ---------------------------------------------------------------------------
// §4 — the live wire: tutorial:say → instructor radio treatment
// ---------------------------------------------------------------------------
section('§4 tutorial:say plays key click, instructor voice, squelch — once per line', () => {
  const h = boot();
  const line = 'Contract 47-A: the manifest says one mass — your instruments say another.';
  h.bus.emit('tutorial:say', { text: line });
  const click = h.plays.filter((p) => p.id === 'sfx_comms_key_click');
  const voice = h.plays.filter((p) => p.id === 'sfx_bark_radio');
  const tail = h.plays.filter((p) => p.id === 'sfx_comms_squelch_tail');
  assert.equal(click.length, 1, 'mic must key once');
  assert.equal(voice.length, 1, 'instructor voice must ride the bark radio recipe');
  assert.equal(voice[0].opts.barkSampleId, 'bark_instructor', 'voice body must be the instructor register');
  assert.ok(voice[0].opts.critical, 'speech must be critical-scheduled');
  assert.ok(voice[0].opts.duckSeconds > 0, 'speech must duck comms');
  assert.equal(tail.length, 1, 'squelch tail must close the transmission');
  // Sequenced starts: click leads, tail follows the speech window.
  assert.ok(click[0].opts.startTime <= voice[0].opts.startTime, 'key click leads the voice');
  assert.ok(tail[0].opts.startTime >= voice[0].opts.startTime, 'squelch follows the voice');
  // No faction theme sting: the instructor is nobody's faction.
  assert.equal(h.rt._themeFactionId, null, 'the instructor must not sting a faction theme');
  const firstTailAt = tail[0].opts.startTime;
  // Same line again inside the window: the mic keys once.
  h.plays.length = 0;
  h.bus.emit('tutorial:say', { text: line });
  assert.equal(h.plays.filter((p) => p.id === 'sfx_bark_radio').length, 0, 'repeat inside the window must not re-speak');
  // A different line still speaks, and it waits until the first transmission has closed.
  h.bus.emit('tutorial:say', { text: 'The Kestrel is armed: fire the Pulse Laser S, then let the heat clear.' });
  const nextVoice = h.plays.filter((p) => p.id === 'sfx_bark_radio');
  const nextClick = h.plays.filter((p) => p.id === 'sfx_comms_key_click');
  assert.equal(nextVoice.length, 1, 'a new line must speak');
  assert.ok(nextClick[0].opts.startTime >= firstTailAt, 'the next key waits for the squelch');
});

section('§4b two lines in one tick take the mic in order', () => {
  const h = boot();
  // The thrust beat does this: a hidden premise, then the visible line, same frame.
  h.bus.emit('tutorial:say', { text: 'Contract 47-A: the manifest says one mass — your instruments say another.' });
  h.bus.emit('tutorial:say', { text: 'Hold thrust until the marker is behind you.' });
  const clicks = h.plays.filter((p) => p.id === 'sfx_comms_key_click');
  const voices = h.plays.filter((p) => p.id === 'sfx_bark_radio');
  const tails = h.plays.filter((p) => p.id === 'sfx_comms_squelch_tail');
  assert.equal(clicks.length, 2, 'both lines key the mic');
  assert.equal(voices.length, 2, 'both lines speak');
  assert.equal(tails.length, 2, 'both lines close');
  assert.ok(voices[0].opts.barkSampleId === 'bark_instructor');
  assert.ok(clicks[1].opts.startTime >= tails[0].opts.startTime, 'second key starts after the first squelch');
  assert.ok(voices[1].opts.startTime > voices[0].opts.startTime, 'the second voice follows the first');
  assert.ok(voices[1].opts.startTime >= clicks[1].opts.startTime, 'the second voice still follows its own key click');
});

section('§5 instructor repeat window is authored and finite', () => {
  assert.equal(typeof INSTRUCTOR_REPEAT_WINDOW_S, 'number');
  assert.ok(INSTRUCTOR_REPEAT_WINDOW_S > 0 && INSTRUCTOR_REPEAT_WINDOW_S <= 12);
});

// ---------------------------------------------------------------------------
// §6 — the payoff moments and the curtain-raiser are audible
// ---------------------------------------------------------------------------
section('§6 firsthour:milestone plays the moment stinger', () => {
  const h = boot();
  h.bus.emit('firsthour:milestone', { milestone: 'firstAttach', atS: 42 });
  const stinger = h.plays.filter((p) => p.id === 'sfx_moment_stinger');
  assert.equal(stinger.length, 1, 'the authored stinger must fire on the milestone');
});

section('§7 ui:firstRunSplash:active plays the cold-open swell', () => {
  const h = boot();
  h.bus.emit('ui:firstRunSplash:active', { line: 'Helios System. Third shift. The manifest is wrong.' });
  const swell = h.plays.filter((p) => p.id === 'sfx_firsthour_coldopen');
  assert.equal(swell.length, 1, 'the curtain-raiser must not be silent');
  assert.ok(swell[0].opts.critical, 'the swell must survive a busy first frame');
});

// ---------------------------------------------------------------------------

try { audio.destroy(); } catch (_) { /* harness teardown */ }
console.log('');
if (failures.length) {
  console.error(`FIRST-HOUR-VOICE: ${failures.length} failure(s)`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
} else {
  console.log('FIRST-HOUR-VOICE: all sections pass');
  process.exit(0);
}
