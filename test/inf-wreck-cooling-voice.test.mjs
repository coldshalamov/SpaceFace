// inf-wreck-cooling-voice — WF-13: the hulks you just made sound their cooling.
//
// Before this unit a fresh kill's wreck burned and smoked at its breach for 38 s and cooled over
// two and a half minutes (render/vfx/wreckAftermathState.js, inf-wreck-burn) in total silence:
// the fight ended and the battlefield went mute while the fire was still on screen. This pins:
//   * the cooling heat law reads the same sim stamps and window the fire reads (unstamped set
//     dressing and cold husks never speak);
//   * ticking is densest right after the flame gutters and thins as the metal cools; the frame
//     groans only while hot;
//   * a wreck field is bounded — only the nearest WRECK_COOL_VOICE_CAP hulks speak;
//   * the stream is deterministic per wreck (no Math.random) and a rewound clock starts fresh;
//   * audioSystem plays the rows positioned at the hulk on the ambient bus, captions the first
//     voice only, and holds while combat owns the mix / docked / off flight.

import test from 'node:test';
import assert from 'node:assert/strict';

class MockAudioParam {
  constructor(initialVal = 1) { this.value = initialVal; }
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
  constructor() { this.frequency = new MockAudioParam(440); this.detune = new MockAudioParam(0); this.type = 'sine'; }
  connect() {}
  disconnect() {}
  start() {}
  stop() {}
}
class MockBiquadFilterNode {
  constructor() { this.frequency = new MockAudioParam(1000); this.Q = new MockAudioParam(1); this.type = 'lowpass'; }
  connect() {}
  disconnect() {}
}
class MockAudioContext {
  constructor() { this.currentTime = 0; this.state = 'running'; this.sampleRate = 44100; }
  createBuffer(channels, length, sampleRate) {
    return { length, sampleRate, numberOfChannels: channels, getChannelData() { return new Float32Array(length); } };
  }
  createGain() { return new MockGainNode(); }
  createOscillator() { return new MockOscillatorNode(); }
  createBiquadFilter() { return new MockBiquadFilterNode(); }
  createWaveShaper() { return { curve: null, oversample: 'none', connect() {}, disconnect() {} }; }
  createStereoPanner() { return { pan: new MockAudioParam(0), connect() {}, disconnect() {} }; }
  createDynamicsCompressor() {
    return {
      threshold: new MockAudioParam(-6), knee: new MockAudioParam(6), ratio: new MockAudioParam(12),
      attack: new MockAudioParam(0.003), release: new MockAudioParam(0.25),
    };
  }
  createBufferSource() { return { playbackRate: new MockAudioParam(1), connect() {}, start() {}, stop() {} }; }
  resume() { this.state = 'running'; }
}

globalThis.window = { addEventListener() {}, removeEventListener() {} };

const { RECIPES } = await import('../src/data/audioRecipes.js');
const { audio, AUDIO_RECIPE_BY_ID, getBusForRecipe } = await import('../src/audio/audioSystem.js');
const { playRecipe } = await import('../src/audio/synth.js');
const { captionForGameplayRecipe } = await import('../src/ui/captions.js');
const { WRECK_BURN_S, WRECK_COOL_S } = await import('../src/render/vfx/wreckAftermathState.js');
const {
  WRECK_COOL_HEARING_WU, WRECK_COOL_RECIPES, WRECK_COOL_VOICE_CAP,
  createWreckCoolingMemory, planWreckCooling, wreckCoolHeat, wreckCoolSizeRate,
} = await import('../src/audio/wreckCoolingVoice.js');

const REAL_PLAY = audio.play;
const LISTENER = { x: 0, z: 0 };

function wreck(id, x, z, killedAt, extra = {}) {
  return { id, type: 'wreck', alive: true, pos: { x, z }, radius: 8, data: { killedAt, ...extra } };
}

/** Run the planner over [t0, t1) at the audio frame rate; returns every row it emitted. */
function runPlanner(wrecks, t0, t1, memory = createWreckCoolingMemory(), dt = 1 / 60) {
  const rows = [];
  const out = [];
  for (let t = t0; t < t1; t += dt) {
    const n = planWreckCooling(wrecks, LISTENER, t, memory, out);
    for (let i = 0; i < n; i++) {
      const r = out[i];
      rows.push({ t, recipeId: r.recipeId, wreckId: r.wreckId, gain: r.gain, rate: r.rate,
        first: r.first, x: r.position.x, z: r.position.z });
    }
  }
  return rows;
}

function mockRt() {
  const ctx = new MockAudioContext();
  return {
    ctx,
    masterGain: ctx.createGain(), sfxBus: ctx.createGain(), musicBus: ctx.createGain(),
    engineBus: ctx.createGain(), ambientBus: ctx.createGain(), combatBus: ctx.createGain(),
    uiBus: ctx.createGain(), commsBus: ctx.createGain(),
    voices: [], loops: {}, _caches: {}, _nextVoiceId: 1, _criticalSquelchUntilMs: 0,
    threat: 0,
  };
}

test('the cooling recipes exist, route to the ambient bus, and render real sources', () => {
  const ctx = new MockAudioContext();
  for (const id of Object.values(WRECK_COOL_RECIPES)) {
    const recipe = AUDIO_RECIPE_BY_ID[id];
    assert.ok(recipe, `${id} is defined`);
    assert.ok(RECIPES.some((r) => r.id === id), `${id} ships in the RECIPES catalog`);
    assert.equal(getBusForRecipe(recipe, id), 'ambient', `${id} rides the ambient bus (ducked under combat)`);
    const voice = playRecipe(ctx, recipe, ctx.createGain(), { peakGain: 0.4 }, {});
    assert.ok(voice.sources.length >= 1, `${id} renders at least one source`);
    assert.ok(Number.isFinite(voice.stopAt), `${id} is a finite one-shot, never a drone`);
  }
  // Metal is not stone: the wreck groan is its own voice, not the seam rock's groan.
  const groan = AUDIO_RECIPE_BY_ID[WRECK_COOL_RECIPES.groan];
  const rock = AUDIO_RECIPE_BY_ID.sfx_ambient_rock_groan;
  assert.notEqual(groan.wave, rock.wave);
  assert.ok(groan.baseFreq > rock.baseFreq && groan.lfoRate > rock.lfoRate);
});

test('every cooling voice carries an authored caption', () => {
  for (const id of Object.values(WRECK_COOL_RECIPES)) {
    const caption = captionForGameplayRecipe(id, AUDIO_RECIPE_BY_ID[id], null);
    assert.ok(caption && caption.authored, `${id} has an authored caption`);
    assert.equal(caption.event, 'wreck.cooling');
    assert.match(caption.baseText, /wreck/i);
  }
});

test('heat reads the fire clock: full through the burn, eased to cold, silent unstamped or cold', () => {
  assert.equal(wreckCoolHeat(-1), 0, 'unstamped set dressing is cold');
  assert.equal(wreckCoolHeat(NaN), 0);
  assert.equal(wreckCoolHeat(0), 1);
  assert.equal(wreckCoolHeat(WRECK_BURN_S - 0.01), 1);
  assert.equal(wreckCoolHeat(WRECK_COOL_S), 0);
  assert.equal(wreckCoolHeat(WRECK_COOL_S + 500), 0);
  let prev = 1;
  for (let age = 0; age <= WRECK_COOL_S; age += 2) {
    const h = wreckCoolHeat(age);
    assert.ok(h <= prev + 1e-12, `heat never rises with age (${age}s)`);
    prev = h;
  }
  assert.ok(wreckCoolSizeRate(30) < wreckCoolSizeRate(4), 'a big frame rings lower than a shard');
});

test('a fresh stamped wreck in earshot speaks, positioned on the hulk; the first voice is flagged', () => {
  const w = wreck(7, 120, -80, 1000);
  const rows = runPlanner([w], 1000 + WRECK_BURN_S + 2, 1000 + WRECK_BURN_S + 12);
  assert.ok(rows.length >= 4, `a cooling hulk ticks over ten seconds (${rows.length})`);
  assert.ok(rows.every((r) => r.wreckId === 7 && r.x === 120 && r.z === -80), 'positioned at the hulk');
  assert.equal(rows.filter((r) => r.first).length, 1, 'exactly one first voice (the caption moment)');
  assert.ok(rows[0].first, 'and it is the first voice heard');
  assert.ok(rows.every((r) => Object.values(WRECK_COOL_RECIPES).includes(r.recipeId)));
});

test('unstamped dressing, cold husks, zero bornAt and far hulks stay silent', () => {
  const now = 5000;
  const silent = [
    wreck(1, 50, 0, undefined),                         // authored set dressing: no stamp
    { id: 2, type: 'wreck', alive: true, pos: { x: 60, z: 0 }, radius: 8, data: { bornAt: 0 } },
    wreck(3, 70, 0, now - WRECK_COOL_S - 1),            // cooled past the window
    wreck(4, WRECK_COOL_HEARING_WU + 50, 0, now - 5),   // hot but beyond earshot
    wreck(5, 40, 0, now - 5, {}),                       // hot …
  ];
  silent[4].alive = false;                               // … but retired
  const rows = runPlanner(silent, now, now + 10);
  assert.equal(rows.length, 0, 'only the sim\'s own fresh dead speak, and only within earshot');
});

test('ticking is densest just after the flame gutters and thins as the metal cools', () => {
  const kill = 0;
  const early = runPlanner([wreck(9, 80, 0, kill)], WRECK_BURN_S + 1, WRECK_BURN_S + 21)
    .filter((r) => r.recipeId !== WRECK_COOL_RECIPES.groan).length;
  const late = runPlanner([wreck(9, 80, 0, kill)], WRECK_COOL_S - 22, WRECK_COOL_S - 2)
    .filter((r) => r.recipeId !== WRECK_COOL_RECIPES.groan).length;
  assert.ok(early >= 2 * late, `early cooling ticks (${early}) far outnumber the last embers (${late})`);
  assert.ok(late >= 1, 'the last embers still tick before the husk goes cold');
  const burnGroans = runPlanner([wreck(9, 80, 0, kill)], 1, WRECK_BURN_S - 1)
    .filter((r) => r.recipeId === WRECK_COOL_RECIPES.groan).length;
  const lateGroans = runPlanner([wreck(9, 80, 0, kill)], WRECK_COOL_S - 40, WRECK_COOL_S - 1)
    .filter((r) => r.recipeId === WRECK_COOL_RECIPES.groan).length;
  assert.ok(burnGroans >= 2, `the burning frame groans as it settles (${burnGroans})`);
  assert.equal(lateGroans, 0, 'a settled, nearly cold frame no longer groans');
});

test('a wreck field is bounded: only the nearest hot hulks speak', () => {
  const now = 300;
  const field = [];
  for (let i = 0; i < 6; i++) field.push(wreck(100 + i, 60 + i * 40, 0, now - WRECK_BURN_S - 4));
  const rows = runPlanner(field, now, now + 20);
  const voiced = new Set(rows.map((r) => r.wreckId));
  assert.ok(voiced.size <= WRECK_COOL_VOICE_CAP, `at most ${WRECK_COOL_VOICE_CAP} hulks voiced (${voiced.size})`);
  assert.deepEqual([...voiced].sort(), [100, 101], 'the nearest two');
});

test('the stream is deterministic per wreck and a rewound clock starts a fresh timeline', () => {
  const field = [wreck(11, 90, 30, 0), wreck(12, -140, 60, 10)];
  const a = runPlanner(field, 45, 75);
  const b = runPlanner(field, 45, 75);
  assert.deepEqual(a, b, 'two hearings of the same aftermath are identical');
  assert.ok(new Set(a.map((r) => r.rate.toFixed(4))).size > 3, 'pitch varies voice to voice');
  const memory = createWreckCoolingMemory();
  runPlanner(field, 60, 70, memory);
  const rewound = runPlanner(field, 45, 50, memory);
  assert.ok(rewound.length > 0, 'a restored earlier clock is not silenced by the later timeline');
  assert.ok(rewound[0].first, 'the rewound hearing re-flags its first voice');
});

test('the planner reuses its row pool (no per-frame row objects)', () => {
  const memory = createWreckCoolingMemory();
  const out = [];
  const w = [wreck(21, 40, 0, 0)];
  let first = null;
  for (let t = 40; t < 60; t += 1 / 60) {
    const n = planWreckCooling(w, LISTENER, t, memory, out);
    if (n && !first) first = out[0];
  }
  assert.ok(first, 'the hulk spoke');
  assert.equal(out[0], first, 'row 0 is the same pooled object across passes');
  assert.ok(out.length <= 2, 'the pool never outgrows one tick + one groan');
});

test('audioSystem plays the rows at the hulk, captions only the first, and holds in fights', () => {
  const player = { id: 'p1', alive: true, pos: { x: 0, z: 0 } };
  const hot = wreck(31, 150, 40, 0);
  const state = {
    playerId: 'p1', mode: 'flight', simTime: WRECK_BURN_S + 1,
    settings: { audio: { muted: false } },
    entities: new Map([['p1', player], [31, hot]]),
    entityList: [player, hot],
    entityIndex: { wrecks: [hot] },
  };
  audio.state = state;
  audio.rt = mockRt();
  const plays = [];
  audio.play = (recipeId, opts) => { plays.push({ recipeId, ...opts, position: { ...opts.position } }); return null; };
  try {
    for (let t = WRECK_BURN_S + 1; t < WRECK_BURN_S + 9; t += 1 / 60) {
      state.simTime = t;
      audio._updateWreckCooling();
    }
    assert.ok(plays.length >= 3, `the hulk speaks through the audio host (${plays.length})`);
    assert.deepEqual(plays[0].position, { x: 150, z: 40 }, 'positioned at the hulk');
    assert.equal(plays[0].captionOwned, false, 'the first voice carries the caption');
    assert.ok(plays.slice(1).every((p) => p.captionOwned === true), 'the rest never flood captions');

    // Combat owns the mix: the cooling waits out the fight.
    plays.length = 0;
    audio.rt.threat = 0.6;
    for (let t = WRECK_BURN_S + 9; t < WRECK_BURN_S + 14; t += 1 / 60) {
      state.simTime = t;
      audio._updateWreckCooling();
    }
    assert.equal(plays.length, 0, 'held while combat owns the mix');

    // Docked, paused and off-flight are silent too.
    audio.rt.threat = 0;
    for (const mutate of [
      () => { audio.rt._docked = true; },
      () => { audio.rt._docked = false; audio.rt._paused = true; },
      () => { audio.rt._paused = false; state.mode = 'station'; },
    ]) {
      mutate();
      for (let t = WRECK_BURN_S + 14; t < WRECK_BURN_S + 18; t += 1 / 60) {
        state.simTime = t;
        audio._updateWreckCooling();
      }
    }
    assert.equal(plays.length, 0, 'docked, paused and off-flight never tick');
  } finally {
    audio.play = REAL_PLAY;
  }
});

test('through the real play(): a first cooling voice lands on the ambient bus with its caption', () => {
  const player = { id: 'p1', alive: true, pos: { x: 0, z: 0 } };
  const hot = wreck(41, 60, 0, 0);
  const captions = [];
  audio.bus = { emit(name, payload) { if (name === 'presentation:caption') captions.push(payload); }, on() {} };
  audio.state = {
    playerId: 'p1', mode: 'flight', simTime: WRECK_BURN_S + 1,
    settings: { audio: { muted: false }, accessibility: { captions: true } },
    entities: new Map([['p1', player], [41, hot]]),
    entityList: [player, hot],
    entityIndex: { wrecks: [hot] },
  };
  audio.rt = mockRt();
  for (let t = WRECK_BURN_S + 1; t < WRECK_BURN_S + 6; t += 1 / 60) {
    audio.state.simTime = t;
    audio.rt.ctx.currentTime = t;
    audio._updateWreckCooling();
  }
  const voiced = audio.rt.voices.filter((v) => Object.values(WRECK_COOL_RECIPES).includes(v.recipeId));
  assert.ok(voiced.length >= 1, 'real voices were scheduled');
  assert.ok(voiced.every((v) => v.busName === 'ambient'), 'on the ambient bus');
  const cooled = captions.filter((c) => /wreck/i.test(String(c.text)));
  assert.equal(cooled.length, 1, `one authored caption for the hulk (${cooled.length})`);
});
