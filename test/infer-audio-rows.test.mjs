// Rows 194 (NXB-052) and 228 (FB-070 + FB-080).
// Scripted clocks only — no Math.random, no sim rng. Denial order is seed 4242.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { RECIPES } from '../src/data/audioRecipes.js';
import {
  REFUSAL_VOICE,
  REFUSAL_SHAPE,
  REFUSAL_EVENT_IDS,
  REFUSAL_ADMIT_MS,
  combatVerbCueRow,
  combatVerbRecipe,
  verbCueCoverage,
  verbCueDispatchIds,
  admitRefusalVoice,
  playAuthoredVerbCue,
} from '../src/audio/combatVerbCues.js';

const RECIPE_IDS = new Set(RECIPES.map((recipe) => recipe && recipe.id).filter(Boolean));

test('every refusal is one voice and one withdrawal shape', () => {
  assert.equal(REFUSAL_EVENT_IDS.length, 8);
  assert.equal(RECIPE_IDS.has(REFUSAL_VOICE), true);
  const shapes = new Set();
  const voices = new Set();
  for (const id of REFUSAL_EVENT_IDS) {
    const row = combatVerbCueRow(id);
    assert.ok(row, id);
    assert.equal(row.recipe, REFUSAL_VOICE, id);
    assert.equal(row.shape, REFUSAL_SHAPE, id);
    assert.equal(combatVerbRecipe(id), REFUSAL_VOICE, id);
    assert.notEqual(row.recipe, 'sfx_ui_error', id);
    shapes.add(row.shape);
    voices.add(row.recipe);
  }
  assert.equal(shapes.size, 1);
  assert.equal(voices.size, 1);
});

test('the verb cue table dispatches every row it authors, once', () => {
  const coverage = verbCueCoverage();
  assert.ok(coverage.length > 40);
  const seen = new Set();
  for (const row of coverage) {
    assert.equal(seen.has(row.id), false, row.id);
    seen.add(row.id);
    assert.ok(['table', 'owner', 'alias', 'silent'].includes(row.dispatcher), row.id);
    if (row.dispatcher === 'silent') {
      assert.equal(row.recipe, 'SILENT');
      assert.ok(row.owner && row.owner.length > 8, row.id);
    } else if (row.dispatcher === 'owner') {
      assert.ok(row.owner, row.id);
      assert.notEqual(row.recipe, 'SILENT');
    } else if (row.dispatcher === 'table') {
      assert.equal(row.owner, '');
      assert.equal(RECIPE_IDS.has(row.recipe), true, `${row.id} ${row.recipe}`);
    }
  }
  const dispatched = new Set(verbCueDispatchIds());
  for (const row of coverage) {
    if (row.dispatcher === 'table') assert.equal(dispatched.has(row.id), true, row.id);
    else assert.equal(dispatched.has(row.id), false, `${row.id} must not be dispatched twice`);
  }
  for (const id of REFUSAL_EVENT_IDS) {
    const row = coverage.find((entry) => entry.id === id);
    assert.ok(row.dispatcher === 'table' || row.dispatcher === 'owner', id);
    assert.equal(row.recipe, REFUSAL_VOICE);
    assert.equal(row.shape, REFUSAL_SHAPE);
  }
  assert.equal(dispatched.has('tether:latchDenied'), false, 'minimal action already voices the latch refusal');
  assert.equal(dispatched.has('tether:lineControlDenied'), true);
  assert.equal(dispatched.has('tether:whipSnap'), true);
  assert.equal(dispatched.has('tether:released'), false, 'cut and rated release already voice the let-go');
});

test('a held refusal admits once per source inside 40 ms', () => {
  const book = Object.create(null);
  assert.equal(admitRefusalVoice(book, 'beam:denied:7', 1000), true);
  assert.equal(admitRefusalVoice(book, 'beam:denied:7', 1000 + REFUSAL_ADMIT_MS - 1), false);
  assert.equal(admitRefusalVoice(book, 'bombs:denied:7', 1000), true, 'a different refusal still speaks');
  assert.equal(admitRefusalVoice(book, 'beam:denied:7', 1000 + REFUSAL_ADMIT_MS), true);
  const plays = [];
  const host = {
    rt: {},
    now: 0,
    _wallClockMs() { return this.now; },
    play(id, opts) { plays.push({ id, opts }); return { id }; },
  };
  playAuthoredVerbCue(host, 'beam:denied', { reason: 'no_power', ownerId: 3 });
  host.now = 10;
  assert.equal(playAuthoredVerbCue(host, 'beam:denied', { reason: 'no_power', ownerId: 3 }), null);
  host.now = 50;
  playAuthoredVerbCue(host, 'beam:denied', { reason: 'no_power', ownerId: 3 });
  assert.deepEqual(plays.map((row) => row.opts.reason), ['no_power', 'no_power']);
  assert.equal(plays[0].id, REFUSAL_VOICE);
  assert.equal(plays[0].opts.shape, REFUSAL_SHAPE);
  assert.notEqual(plays[0].opts.reason, 'denied');
});

// ---------------------------------------------------------------------------
// Mock Web Audio — same shape the mix-direction suite drives.
// ---------------------------------------------------------------------------
class MockAudioParam {
  constructor(v = 1) { this.value = v; this.timeline = []; }
  setValueAtTime(val, t) { this.timeline.push({ type: 'set', val, t }); this.value = val; return this; }
  linearRampToValueAtTime(val, t) { this.timeline.push({ type: 'linear', val, t }); this.value = val; return this; }
  exponentialRampToValueAtTime(val, t) { this.timeline.push({ type: 'exp', val, t }); this.value = val; return this; }
  setTargetAtTime(val, t, tc) { this.timeline.push({ type: 'target', val, t, tc }); this.value = val; return this; }
  cancelScheduledValues(t) { this.timeline = this.timeline.filter((entry) => entry.t < t); return this; }
}
class MockGainNode {
  constructor(g = 1) { this.gain = new MockAudioParam(g); }
  connect() {}
  disconnect() {}
}
class MockOscillatorNode {
  constructor() {
    this.frequency = new MockAudioParam(440);
    this.detune = new MockAudioParam(0);
    this.type = 'sine';
  }
  connect() {}
  disconnect() {}
  start() {}
  stop() {}
}
class MockBiquadFilterNode {
  constructor() {
    this.frequency = new MockAudioParam(1000);
    this.Q = new MockAudioParam(1);
    this.type = 'lowpass';
  }
  connect() {}
  disconnect() {}
}
class MockBufferSource {
  constructor() { this.buffer = null; this.loop = false; this.playbackRate = new MockAudioParam(1); }
  connect() {}
  disconnect() {}
  start() {}
  stop() {}
}
class MockAudioContext {
  constructor() {
    this.currentTime = 0;
    this.state = 'running';
    this.sampleRate = 44100;
    this.destination = {};
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
  createDelay() { return { delayTime: new MockAudioParam(0.1), connect() {}, disconnect() {} }; }
  createChannelMerger() { return { connect() {}, disconnect() {} }; }
  createChannelSplitter() { return { connect() {}, disconnect() {} }; }
  createConvolver() { return { buffer: null, normalize: true, connect() {}, disconnect() {} }; }
  createPanner() { return { connect() {}, disconnect() {} }; }
  resume() { this.state = 'running'; return Promise.resolve(); }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
  close() { this.state = 'closed'; return Promise.resolve(); }
  addEventListener() {}
  removeEventListener() {}
}

let FAKE_NOW_MS = 0;
globalThis.window = {
  addEventListener() {},
  removeEventListener() {},
  AudioContext: MockAudioContext,
  webkitAudioContext: MockAudioContext,
};
globalThis.performance = { now: () => FAKE_NOW_MS };
globalThis.requestAnimationFrame = () => 7;
globalThis.cancelAnimationFrame = () => {};

const {
  audio,
  MAX_AUDIO_VOICES,
  QUIET_BED_GAIN,
  combatPressureThreat,
  pressureBedGainForThreat,
  mixCueStaysReadable,
} = await import('../src/audio/audioSystem.js');
const { createBus } = await import('../src/core/eventBus.js');

function hostile(id, x, z) {
  return {
    id, alive: true, type: 'ship', team: 'raider', pos: { x, z },
    data: { ai: { combatant: true }, combat: { targetId: 1 } },
  };
}

function makeState() {
  const player = {
    id: 1, isPlayer: true, alive: true, type: 'ship', team: 'player',
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
    hull: 100, hullMax: 100, shield: 100, shieldMax: 100, flags: {},
  };
  return {
    playerId: 1, tick: 0, simTime: 0, mode: 'flight',
    entities: new Map([[1, player]]),
    entityList: [player],
    player: { tether: { active: false, phase: 'slack', strain: 0, load: 0 } },
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
  try { audio.destroy(); } catch (_) { /* fresh process */ }
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

function fieldBomb(id = 9) {
  return {
    id,
    alive: true,
    type: 'bomb',
    pos: { x: 12, z: 0 },
    data: { phase: 'field', bombId: 'bomb_singularity', fieldStartedAt: 0 },
  };
}

test('combat bed threat releases when the last hostile is gone, and stays up while one remains', () => {
  const hot = { threat: 0.8, nearbyHostiles: 2, committedHostiles: 1, activeEncounter: false, doctrineThreat: false };
  assert.ok(combatPressureThreat(hot, false) > 0.5);
  const tail = { threat: 0.3, nearbyHostiles: 0, committedHostiles: 0, activeEncounter: false, doctrineThreat: false, recentDamage: true };
  assert.equal(combatPressureThreat(tail, false), 0);
  assert.equal(pressureBedGainForThreat(0), QUIET_BED_GAIN);
  assert.equal(combatPressureThreat(hot, true), 0, 'docked is quiet even with a hunter still marked');
  assert.equal(mixCueStaysReadable('sfx_wpn_pulse_laser', { primary: true }), true);
  assert.equal(mixCueStaysReadable('sfx_wpn_pulse_laser', {}), false);
  assert.equal(mixCueStaysReadable('sfx_massline_deny', {}), true);
});

test('the crowded combat mix releases into real quiet after the last threat', () => {
  const h = boot();
  frame(h, 20);
  assert.ok((h.rt._pressureGain.gainValue || 0) <= 0.001, 'idle bed is quiet');

  const hunter = hostile(2, 400, 0);
  h.state.entityList.push(hunter);
  h.state.entities.set(2, hunter);
  h.state.entities.get(1).hull = 15;
  h.bus.emit('combat:damage', { isPlayer: true, hullDamage: 12, pos: { x: 8, z: 0 } });
  h.state.player.tether = { active: true, phase: 'loaded', strain: 1, load: 1, lineControl: false };
  const bomb = fieldBomb();
  h.state.entityList.push(bomb);
  h.state.entities.set(bomb.id, bomb);
  h.bus.emit('comms:popup', { category: 'danger', text: 'Incoming.' });
  frame(h, 30);

  assert.ok(h.rt.threat > 0.2, 'the fight is still a threat');
  assert.ok(h.rt._pressureGain.gainValue > 0.001, 'the pressure bed is up during the fight');
  assert.equal(h.rt.alarms.lowHull, true, 'low hull warns during the fight');
  assert.ok(h.rt.tetherHum.gainValue > 0.001, 'the tether tone is up while the line is loaded');
  assert.ok(h.rt.loops[`bombField_${bomb.id}`], 'the live field loop is part of the crowded mix');

  audio._applyPriorityCue({ id: 'comms.danger', importance: 0.95, playerRelevance: 1 });
  const buried = audio.play('sfx_wpn_pulse_laser', { gain: 0.6 });
  const primary = audio.play('sfx_wpn_pulse_laser', { gain: 0.6, primary: true });
  const warning = audio.play('sfx_hull_stress_groan', { gain: 0.5, warning: true });
  assert.equal(buried, null, 'a routine shot can wait under a critical comms squelch');
  assert.ok(primary, 'the player verb stays audible');
  assert.ok(warning, 'the immediate warning stays audible');
  assert.ok(h.rt.voices.length <= MAX_AUDIO_VOICES, `voice count ${h.rt.voices.length} inside ${MAX_AUDIO_VOICES}`);

  // Last threat dies. The damage window is still open — the bed must not keep growling.
  h.state.entityList = h.state.entityList.filter((entity) => entity.id !== hunter.id);
  h.state.entities.delete(hunter.id);
  frame(h, 20);
  assert.ok(h.state.simTime - h.rt._lastDamageT < 6, 'the damage tail is still inside the combat window');
  assert.ok(h.rt._pressureGain.gainValue <= 0.001, `pressure releases to quiet, got ${h.rt._pressureGain.gainValue}`);
  assert.ok(h.rt.loops[`bombField_${bomb.id}`], 'a live field is not a dead loop — it stays until the field ends');

  bomb.data.phase = 'spent';
  frame(h, 12);
  assert.equal(h.rt.loops[`bombField_${bomb.id}`], undefined, 'the dead field loop releases without a new one-shot');

  h.state.entities.get(1).hull = 100;
  h.state.player.tether = { active: false, phase: 'slack', strain: 0, load: 0 };
  frame(h, 8);
  assert.equal(h.rt.alarms.lowHull, false, 'the hull alarm releases when the hull recovers');
  assert.equal(h.rt.tetherHum.gainValue, 0.0001, 'the tether tone releases when the line is gone');
  assert.ok(h.rt.voices.length <= MAX_AUDIO_VOICES);
});

test('docked quiet releases alarms and field loops, and undock restores a field that is still live', () => {
  const h = boot();
  const bomb = fieldBomb(11);
  h.state.entityList.push(bomb);
  h.state.entities.set(bomb.id, bomb);
  h.state.entities.get(1).hull = 10;
  frame(h, 12);
  assert.equal(h.rt.alarms.lowHull, true);
  assert.ok(h.rt.loops[`bombField_${bomb.id}`]);
  h.state.ui.docked = true;
  h.rt._docked = true;
  frame(h, 8);
  assert.equal(h.rt.alarms.lowHull, false, 'the station is quiet — the hull chirp does not follow you in');
  assert.equal(h.rt.loops[`bombField_${bomb.id}`], undefined, 'field loops release in the docked mix');
  assert.ok(h.rt._pressureGain.gainValue <= 0.001);
  h.state.ui.docked = false;
  h.rt._docked = false;
  frame(h, 12);
  assert.ok(h.rt.loops[`bombField_${bomb.id}`], 'undock reconciles the field that is still live');
  assert.equal(h.rt.alarms.lowHull, true, 'the hull warning returns in flight');
});

test('two comms phrases release independently and a frozen clock cannot stick the duck', () => {
  const h = boot();
  frame(h, 10);
  const open = h.rt._busLevels.music;
  const firstAt = h.ctx.currentTime;
  audio._commsDuck(1, 0.5);
  frame(h, 8);
  assert.ok(h.rt._busLevels.music < open * 0.75, 'the first phrase bows the mix');
  const secondAt = h.ctx.currentTime;
  audio._commsDuck(1.2, 0.5);
  const secondEnd = h.rt._commsDuckUntilS;
  assert.ok(secondEnd > firstAt + 1, 'the later phrase outlives the first');
  const untilFirstGone = Math.ceil((firstAt + 1.05 - h.ctx.currentTime) * 60);
  frame(h, Math.max(1, untilFirstGone));
  assert.ok(h.ctx.currentTime > firstAt + 1, 'the first phrase has ended');
  assert.ok(h.ctx.currentTime < secondEnd, `still inside the second phrase (${h.ctx.currentTime} < ${secondEnd})`);
  assert.ok(secondAt < h.ctx.currentTime);
  assert.ok(h.rt._commsDuckLive < 1, 'ending the first phrase does not unduck the second');
  frame(h, Math.ceil((secondEnd - h.ctx.currentTime) * 60) + 8);
  assert.equal(h.rt._commsDuckLive, 1, 'the bow releases once the later phrase ends');
  assert.ok(Math.abs(h.rt._busLevels.music - open) < open * 0.05, 'music returns without raising master');

  audio._commsDuck(2, 0.5);
  assert.ok(h.rt._commsDuckLive < 1 || h.ctx.currentTime < h.rt._commsDuckUntilS);
  FAKE_NOW_MS += 5000;
  audio._applySettings();
  assert.equal(h.rt._commsDuckLive, 1, 'a suspended wall clock releases a finished phrase');
  assert.equal(h.rt._commsPhrases.length, 0);
});

test('mute and resume keep the tether tone and do not replay the latch', () => {
  const h = boot();
  h.state.player.tether = { active: true, phase: 'loaded', strain: 1, load: 1 };
  frame(h, 8);
  const plays = [];
  const orig = audio.play.bind(audio);
  audio.play = (id, opts) => { plays.push(id); return orig(id, opts); };
  h.bus.emit('tether:latched', { targetId: 4 });
  h.bus.emit('tether:latchDenied', { reason: 'out_of_range', targetId: 4 });
  h.bus.emit('tether:lineControlDenied', { reason: 'maximum_length', targetId: 4 });
  h.bus.emit('tether:whipSnap', { targetId: 4 });
  const latch = plays.filter((id) => id === 'sfx_tether_latch_lock').length;
  const deny = plays.filter((id) => id === REFUSAL_VOICE).length;
  const snap = plays.filter((id) => id === 'sfx_tether_crack').length;
  assert.equal(latch, 1, 'the latch has one voice');
  assert.equal(deny, 2, 'latch refusal and reel refusal each speak once, not twice');
  assert.equal(snap, 1, 'the whip snap row is dispatched');
  const tone = h.rt.tetherHum.gainValue;
  assert.ok(tone > 0.001);
  h.state.settings.audio.muted = true;
  audio._applySettings();
  assert.equal(h.rt._busLevels.master, 0, 'mute clears audible gain');
  frame(h, 6);
  h.state.settings.audio.muted = false;
  audio._applySettings();
  frame(h, 4);
  assert.equal(plays.filter((id) => id === 'sfx_tether_latch_lock').length, latch, 'unmute does not replay the latch');
  assert.ok(h.rt.tetherHum.gainValue > 0.001, 'the ongoing tether tone is still the desired loop');
  audio._onPause(true);
  audio._onPause(false);
  assert.equal(plays.filter((id) => id === 'sfx_tether_latch_lock').length, latch, 'resume does not replay expired one-shots');
  const raf = h.rt._rafId;
  audio._startFrameLoop();
  assert.equal(h.rt._rafId, raf, 'resume does not start a second audio update loop');
  assert.ok(h.rt.voices.length <= MAX_AUDIO_VOICES);
  audio.play = orig;
});

after(() => { try { audio.destroy(); } catch (_) { /* already destroyed */ } });
