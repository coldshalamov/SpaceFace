// inf-pocket-beat — WF-13: the living world's staged beats answer audibly.
//
// Before this unit the causal-chain receipts (traffic:ceresCausalChain) were the one staged
// world moment with no voice: a surveyor could lay a probe line beside you, a patrol scan a
// hauler, a convoy form at the pod — in total silence. Every other world family (fields,
// massSeed, salvage, foghorn) already answers. This pins the new pocket-beat wake:
//   * an event_start within earshot plays ONE positioned sfx_pocket_beat_wake;
//   * offscreen beats stay silent (the world happened where nobody is);
//   * phase ticks / cycle bookkeeping stay silent;
//   * two same-window starts rate-cap to one voice;
//   * the rate varies inside authored bounds per (sector, event, cycle) — derived stream,
//     never the shared state rng;
//   * the recipes render real sources (the synth never falls through to a silent voice) and
//     the wake carries its authored accessibility caption.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

class MockAudioParam {
  constructor(initialVal = 1) { this.value = initialVal; this.timeline = []; }
  setValueAtTime(val) { this.value = val; }
  linearRampToValueAtTime(val) { this.value = val; }
  exponentialRampToValueAtTime(val) { this.value = val; }
  setTargetAtTime(val) { this.value = val; }
  cancelScheduledValues() {}
}

class MockGainNode {
  constructor(initialGain = 1) { this.gain = new MockAudioParam(initialGain); }
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

class MockAudioContext {
  constructor() {
    this.currentTime = 0;
    this.state = 'running';
    this.sampleRate = 44100;
  }
  createBuffer(channels, length, sampleRate) {
    return { length, sampleRate, numberOfChannels: channels,
      getChannelData() { return new Float32Array(length); } };
  }
  createGain() { return new MockGainNode(); }
  createOscillator() { return new MockOscillatorNode(); }
  createBiquadFilter() { return new MockBiquadFilterNode(); }
  createWaveShaper() { return { curve: null, oversample: 'none', connect() {}, disconnect() {} }; }
  createDynamicsCompressor() {
    return {
      threshold: new MockAudioParam(-6), knee: new MockAudioParam(6), ratio: new MockAudioParam(12),
      attack: new MockAudioParam(0.003), release: new MockAudioParam(0.25),
    };
  }
  createBufferSource() {
    return { playbackRate: new MockAudioParam(1), connect() {}, start() {}, stop() {} };
  }
  resume() { this.state = 'running'; }
}

globalThis.window = { addEventListener() {}, removeEventListener() {} };

const { RECIPES } = await import('../src/data/audioRecipes.js');
const { audio, AUDIO_RECIPE_BY_ID } = await import('../src/audio/audioSystem.js');
const { playRecipe } = await import('../src/audio/synth.js');
const { captionForGameplayRecipe } = await import('../src/ui/captions.js');
const { CERES_CAUSAL_CHAIN_EVENT } = await import('../src/systems/traffic.js');

const REAL_PLAY = audio.play;

const WAKE = 'sfx_pocket_beat_wake';
const BELLS = ['sfx_pocket_beat_bell', 'sfx_pocket_beat_breath'];

function mockRt() {
  const ctx = new MockAudioContext();
  return {
    ctx,
    masterGain: ctx.createGain(),
    sfxBus: ctx.createGain(),
    musicBus: ctx.createGain(),
    engineBus: ctx.createGain(),
    ambientBus: ctx.createGain(),
    combatBus: ctx.createGain(),
    uiBus: ctx.createGain(),
    commsBus: ctx.createGain(),
    voices: [],
    loops: {},
    _caches: {},
    _nextVoiceId: 1,
    _criticalSquelchUntilMs: 0,
  };
}

function beatState(actorPos, simTime = 0) {
  const player = { id: 'p1', pos: { x: 0, z: 0 } };
  const actor = { id: 'a1', alive: true, pos: actorPos, data: { activityActorSlotId: 'slot_a' } };
  return {
    playerId: 'p1',
    mode: 'flight',
    simTime,
    settings: { audio: { muted: false } },
    entities: new Map([['p1', player], ['a1', actor]]),
    entityList: [player, actor],
  };
}

function startReceipt(sectorId = 'sector_x', eventId = 'ev_test', cycle = 0) {
  return {
    schema: 'spaceface.ceresCausalChain.v1',
    kind: 'event_start',
    sectorId, eventId, cycle,
    actorSlotIds: ['slot_a'],
    phase: 'gather',
    cue: 'heavy_burn',
  };
}

test('the pocket-beat recipes are defined, layered over real voices, and render sources', () => {
  const wake = AUDIO_RECIPE_BY_ID[WAKE];
  assert.ok(wake, `${WAKE} is defined in audioRecipes.js`);
  assert.equal(wake.type, 'layered');
  for (const layerId of wake.layers) {
    assert.ok(AUDIO_RECIPE_BY_ID[layerId], `layer ${layerId} is defined`);
  }
  assert.equal(wake.layers.length, 2, 'bell over breath, nothing else');
  const ctx = new MockAudioContext();
  const dest = ctx.createGain();
  for (const recipe of [wake, ...wake.layers.map((id) => AUDIO_RECIPE_BY_ID[id])]) {
    const voice = playRecipe(ctx, recipe, dest, { peakGain: 0.5 }, {});
    assert.ok(voice.sources.length >= 1,
      `${recipe.id} renders with at least one real source`);
  }
  assert.ok(RECIPES.some((r) => r.id === WAKE), 'the wake is in the shipped RECIPES catalog');
});

test('the wake carries its authored accessibility caption', () => {
  const caption = captionForGameplayRecipe(WAKE, AUDIO_RECIPE_BY_ID[WAKE], null);
  assert.ok(caption, 'an explicit caption resolves for the wake');
  assert.equal(typeof caption.text, 'string');
  assert.ok(caption.text.length > 0);
  assert.equal(caption.baseText, 'Work wakes nearby.');
  assert.equal(caption.event, 'world.beat');
});

test('audioSystem subscribes to the live chain receipt event', () => {
  const src = fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'audio', 'audioSystem.js'),
    'utf8',
  );
  assert.ok(src.includes(`bus.on(CERES_CAUSAL_CHAIN_EVENT`),
    'the wake rides the canonical chain event, not a renamed copy');
});

test('a beat starting within earshot answers once, positioned on its hull', () => {
  audio.state = beatState({ x: 300, z: -400 }, 120);
  audio.rt = mockRt();
  const plays = [];
  const realPlay = audio.play.bind(audio);
  audio.play = (recipeId, opts) => { plays.push({ recipeId, opts }); return realPlay(recipeId, opts); };
  try {
    audio._onPocketChainBeat(startReceipt());
  } finally { audio.play = realPlay; }
  assert.equal(plays.length, 1, 'one wake voice, not a fanfare');
  assert.equal(plays[0].recipeId, WAKE);
  assert.deepEqual(plays[0].opts.position, { x: 300, z: -400 }, 'positioned on the beat hull');
  assert.equal(plays[0].opts.gain, 0.45);
  assert.ok(plays[0].opts.rate >= 0.92 && plays[0].opts.rate <= 1.08,
    `rate stays inside authored bounds (${plays[0].opts.rate})`);
});

test('a beat beyond earshot stays silent; so do phase ticks and cycle bookkeeping', () => {
  audio.state = beatState({ x: 2000, z: 0 }, 50);
  audio.rt = mockRt();
  const plays = [];
  audio.play = (recipeId) => { plays.push(recipeId); return null; };
  try {
    audio._onPocketChainBeat(startReceipt());
    audio._onPocketChainBeat({ ...startReceipt(), kind: 'phase' });
    audio._onPocketChainBeat({ ...startReceipt(), kind: 'cycle_complete' });
    audio._onPocketChainBeat({ ...startReceipt(), kind: 'seed' });
  } finally { audio.play = REAL_PLAY; }
  assert.equal(plays.length, 0, 'offscreen and non-start receipts never speak');
});

test('a missing or unbound actor never speaks, and neither does a parked menu', () => {
  const state = beatState({ x: 100, z: 0 }, 10);
  state.entityList = state.entityList.filter((e) => e.id !== 'a1');
  audio.state = state;
  audio.rt = mockRt();
  let plays = 0;
  audio.play = () => { plays += 1; return null; };
  try {
    audio._onPocketChainBeat(startReceipt());
    audio._onPocketChainBeat(null);
    audio._onPocketChainBeat({ ...startReceipt(), actorSlotIds: [] });
    const menu = beatState({ x: 100, z: 0 }, 10);
    menu.mode = 'station';
    audio.state = menu;
    audio._onPocketChainBeat(startReceipt());
  } finally { audio.play = REAL_PLAY; }
  assert.equal(plays, 0);
});

test('two same-window starts rate-cap to one voice; the next beat after the gap speaks again', () => {
  audio.state = beatState({ x: 100, z: 0 }, 200);
  audio.rt = mockRt();
  const rates = [];
  audio.play = (recipeId, opts) => { rates.push(opts && opts.rate); return null; };
  try {
    audio._onPocketChainBeat(startReceipt('sector_x', 'ev_one', 0));
    audio._onPocketChainBeat(startReceipt('sector_x', 'ev_two', 0)); // same tick, cap holds
    audio.state.simTime = 205;                                       // inside the 6 s gap
    audio._onPocketChainBeat(startReceipt('sector_x', 'ev_three', 0));
    audio.state.simTime = 207;                                       // past the gap
    audio._onPocketChainBeat(startReceipt('sector_x', 'ev_four', 1)); // next cycle, new roll
  } finally { audio.play = REAL_PLAY; }
  assert.equal(rates.length, 2, `one wake now, one after the gap (${rates.length})`);
  assert.notEqual(rates[0], rates[1], 'the variation stream moves between beats');
});

test('a restored sim clock clears the prior timeline rate limit', () => {
  audio.state = beatState({ x: 100, z: 0 }, 200);
  audio.rt = mockRt();
  const plays = [];
  audio.play = (recipeId) => { plays.push(recipeId); return null; };
  try {
    audio._onPocketChainBeat(startReceipt('sector_x', 'ev_before_restore', 0));
    audio.state = beatState({ x: 100, z: 0 }, 40);
    audio._onPocketChainBeat(startReceipt('sector_x', 'ev_after_restore', 0));
  } finally { audio.play = REAL_PLAY; }
  assert.deepEqual(plays, [WAKE, WAKE], 'the previous timeline cannot silence a restored run');
});

test('the real play path voices the wake through the live scheduler', () => {
  audio.state = beatState({ x: 200, z: 100 }, 300);
  audio.rt = mockRt();
  audio._onPocketChainBeat(startReceipt());
  assert.ok(audio.rt.voices.length >= 1,
    `the wake produces a live voice (${audio.rt.voices.length})`);
});

test('the canonical event name is the one traffic exports', () => {
  assert.equal(CERES_CAUSAL_CHAIN_EVENT, 'traffic:ceresCausalChain');
});
