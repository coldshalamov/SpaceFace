// PERF — transient voice creation rate.
//
// `audio.play()` used to mint the whole synth graph (4-9 native nodes) per cue; at the
// 12-voice cap under sustained fire that meant constant create/dispose churn. Transient
// recipes are now rendered once to a PCM buffer through the same playRecipe graph and
// replayed as one BufferSource into a pooled thin shell. These tests pin the contract:
// node-creation count per play, shell recycling on GC and steal, bake eligibility, and
// the exact-fallback path when no OfflineAudioContext exists.
import assert from 'node:assert/strict';
import test from 'node:test';

import { audio, AUDIO_RECIPE_BY_ID, MAX_AUDIO_VOICES } from '../src/audio/audioSystem.js';
import { recipeBakeInfo, renderRecipeToBuffer } from '../src/audio/synth.js';

const LASER = 'sfx_wpn_pulse_laser'; // oscillator + filter + shaper + sub-bass + click ≈ 10 nodes

// ---------------------------------------------------------------------------
// Counting Web Audio mock. Every factory call is tallied so a play() can be
// audited for how many native nodes it would mint.
// ---------------------------------------------------------------------------
function makeParam(v = 0) {
  return {
    value: v,
    setValueAtTime(val) { this.value = val; },
    linearRampToValueAtTime(val) { this.value = val; },
    exponentialRampToValueAtTime(val) { this.value = val; },
    setTargetAtTime(val) { this.value = val; },
    cancelScheduledValues() {},
  };
}

function makeCtx(counts, sampleRate = 44100) {
  const ctx = {
    currentTime: 0,
    state: 'running',
    sampleRate,
    destination: { connect() {}, disconnect() {} },
    createGain() {
      counts.gain++;
      return { gain: makeParam(1), connect() {}, disconnect() {} };
    },
    createOscillator() {
      counts.osc++;
      return {
        type: 'sine', frequency: makeParam(440), detune: makeParam(0),
        connect() {}, disconnect() {}, start() {}, stop() {},
      };
    },
    createBiquadFilter() {
      counts.filter++;
      return {
        type: 'lowpass', frequency: makeParam(1000), Q: makeParam(1), gain: makeParam(0),
        connect() {}, disconnect() {},
      };
    },
    createWaveShaper() {
      counts.shaper++;
      return { curve: null, oversample: 'none', connect() {}, disconnect() {} };
    },
    createBufferSource() {
      counts.src++;
      return {
        buffer: null, loop: false,
        playbackRate: makeParam(1), detune: makeParam(0),
        connect() {}, disconnect() {}, start() {}, stop() {},
      };
    },
    createStereoPanner() {
      counts.panner++;
      return { pan: makeParam(0), connect() {}, disconnect() {} };
    },
    createDynamicsCompressor() {
      counts.comp++;
      return {
        threshold: makeParam(0), knee: makeParam(0), ratio: makeParam(0),
        attack: makeParam(0), release: makeParam(0),
        connect() {}, disconnect() {},
      };
    },
    createBuffer(ch, len, rate) {
      counts.buffer++;
      return {
        numberOfChannels: ch, length: len, sampleRate: rate, duration: len / rate,
        getChannelData() { return new Float32Array(len); },
      };
    },
  };
  return ctx;
}

function zeroCounts() {
  return { gain: 0, osc: 0, filter: 0, shaper: 0, src: 0, panner: 0, comp: 0, buffer: 0 };
}

function totalCreated(counts) {
  return counts.gain + counts.osc + counts.filter + counts.shaper + counts.src + counts.panner;
}

/** An OfflineAudioContext double: same node factories, resolves a silent buffer. */
function installMockOfflineContext(counts) {
  const prior = globalThis.OfflineAudioContext;
  globalThis.OfflineAudioContext = class MockOffline {
    constructor(_ch, frames, rate) {
      const ctx = makeCtx(counts, rate || 44100);
      this._ctx = ctx;
      this._frames = frames;
      this.destination = ctx.destination;
      this.sampleRate = ctx.sampleRate;
      this.currentTime = 0;
      for (const k of Object.keys(ctx)) {
        if (typeof ctx[k] === 'function') this[k] = ctx[k].bind(ctx);
      }
    }
    startRendering() {
      const len = this._frames;
      const rate = this.sampleRate;
      return Promise.resolve({
        numberOfChannels: 1, length: len, sampleRate: rate, duration: len / rate,
        getChannelData() { return new Float32Array(len); },
      });
    }
  };
  return () => {
    if (prior === undefined) delete globalThis.OfflineAudioContext;
    else globalThis.OfflineAudioContext = prior;
  };
}

function makeHost(ctx) {
  const host = Object.create(audio);
  host.state = {
    playerId: 'p1',
    tick: 1,
    simTime: 0,
    entities: new Map([['p1', { id: 'p1', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } }]]),
    settings: { audio: { muted: false }, video: {}, accessibility: { captions: false } },
  };
  const bus = () => ({ gain: makeParam(1), connect() {}, disconnect() {} });
  host.rt = {
    ctx,
    voices: [],
    loops: {},
    sfxBus: bus(), combatBus: bus(), engineBus: bus(),
    ambientBus: bus(), uiBus: bus(), commsBus: bus(), musicBus: bus(),
    _caches: {},
    _nextVoiceId: 1,
    _bakeCache: new Map(),
    _bakeQueue: [],
    _bakeInflight: 0,
    _bakeBytes: 0,
    _shellPool: new Map(),
    _samples: null,
  };
  return host;
}

async function settle() {
  for (let i = 0; i < 6; i++) await Promise.resolve();
}

/** Retire every finished voice through the ordinary GC path. */
function gcFinished(host, ctx) {
  let max = ctx.currentTime;
  for (const v of host.rt.voices) {
    if (v.stopAt !== Infinity && v.stopAt > max) max = v.stopAt;
  }
  ctx.currentTime = max + 0.01;
  host._gcVoices(ctx.currentTime);
}

// ---------------------------------------------------------------------------
// Bake eligibility
// ---------------------------------------------------------------------------

test('recipeBakeInfo: transients have finite tails, continuous and loop recipes are ineligible', () => {
  const laser = AUDIO_RECIPE_BY_ID[LASER];
  assert.ok(laser, 'fixture recipe exists');
  const info = recipeBakeInfo(laser, AUDIO_RECIPE_BY_ID);
  assert.ok(info && Number.isFinite(info.seconds) && info.seconds > 0 && info.seconds < 2);
  assert.ok(info.releaseS > 0);

  const beam = AUDIO_RECIPE_BY_ID.sfx_wpn_beam_laser;
  assert.equal(recipeBakeInfo(beam, AUDIO_RECIPE_BY_ID), null,
    'a continuous recipe can never bake — it has no tail to render');

  const layeredContinuous = {
    id: 'x_layered_cont', type: 'layered', layers: ['leaf_cont', 'leaf_one'],
    gainEnvelope: { attack: 0.01, decay: 0.04, release: 0.1 },
  };
  const byId = {
    leaf_cont: { id: 'leaf_cont', type: 'continuous_oscillator', baseFreq: 100 },
    leaf_one: { id: 'leaf_one', type: 'oscillator', baseFreq: 200 },
  };
  assert.equal(recipeBakeInfo(layeredContinuous, byId), null,
    'a layered recipe containing a continuous leaf has an infinite render');

  const repeater = AUDIO_RECIPE_BY_ID.sfx_loot_collect;
  assert.ok(repeater && repeater.repeatCount > 0, 'fixture repeater exists');
  const ri = recipeBakeInfo(repeater, AUDIO_RECIPE_BY_ID);
  assert.ok(ri.seconds > repeater.repeatCount * repeater.repeatIntervalS,
    'repeat offsets extend the render window');
});

// ---------------------------------------------------------------------------
// Bake pipeline + per-play node count
// ---------------------------------------------------------------------------

test('first play uses the synth graph and queues a bake; steady-state plays mint one BufferSource', async () => {
  const counts = zeroCounts();
  const restore = installMockOfflineContext(counts);
  try {
    const ctx = makeCtx(counts);
    const host = makeHost(ctx);

    // Play 1: no buffer yet — ordinary synth path mints its graph; the bake renders offline.
    const v1 = host.play(LASER, { gain: 0.8 });
    assert.ok(v1 && !v1._bakedShell, 'first play is a live synth voice');
    const synthNodes = totalCreated(counts);
    assert.ok(synthNodes >= 8, `laser synth graph minted its full node set (${synthNodes})`);
    assert.ok(counts.osc >= 1 && counts.filter >= 1 && counts.shaper >= 1);
    gcFinished(host, ctx);

    await settle();
    const entry = host.rt._bakeCache.get(LASER);
    assert.ok(entry && entry.status === 'ready' && entry.buffer,
      'offline render populated the cache');

    // Play 2: first baked play builds its shell (2 gains) plus one BufferSource.
    const b2 = totalCreated(counts);
    const v2 = host.play(LASER, { gain: 0.8 });
    assert.ok(v2 && v2._bakedShell, 'play 2 rode the baked path');
    assert.equal(totalCreated(counts) - b2, 3, 'cold baked play = shell gains + 1 source');
    gcFinished(host, ctx); // retires the shell into the pool

    // Plays 3+: steady state — one BufferSource per play, nothing else.
    const b3 = totalCreated(counts);
    const oscBefore = counts.osc;
    for (let i = 0; i < 4; i++) {
      const v = host.play(LASER, { gain: 0.8 });
      assert.ok(v && v._bakedShell, `play ${i + 3} reused a pooled shell`);
      gcFinished(host, ctx);
    }
    assert.equal(totalCreated(counts) - b3, 4, 'four warm plays minted four BufferSources');
    assert.equal(counts.osc, oscBefore, 'no oscillator minted on the baked path');
  } finally {
    restore();
  }
});

test('voice-cap steal retires the losing shell and the new voice reuses it', async () => {
  const counts = zeroCounts();
  const restore = installMockOfflineContext(counts);
  try {
    const ctx = makeCtx(counts);
    const host = makeHost(ctx);
    host.play(LASER, { gain: 0.8 });
    await settle();
    gcFinished(host, ctx);

    // Fill the cap with baked voices (each keeps its shell while alive).
    while (host.rt.voices.length < MAX_AUDIO_VOICES) {
      assert.ok(host.play(LASER, { gain: 0.8 }), 'baked play admitted under the cap');
    }
    assert.equal(host.rt.voices.length, MAX_AUDIO_VOICES);

    // One more play: the budget steals the oldest disposable voice — a baked one —
    // its shell hits the pool, and the new voice immediately reuses it. The whole
    // steal+admit cycle mints a single BufferSource.
    const b = totalCreated(counts);
    const admitted = host.play(LASER, { gain: 0.8 });
    assert.ok(admitted && admitted._bakedShell, 'steal admitted a baked voice');
    assert.equal(host.rt.voices.length, MAX_AUDIO_VOICES, 'cap held through the steal');
    assert.equal(totalCreated(counts) - b, 1,
      'steal+admit minted exactly one BufferSource — the dropped shell was reused');
  } finally {
    restore();
  }
});

// ---------------------------------------------------------------------------
// Fallback parity — no OfflineAudioContext anywhere (the Node/test environment).
// ---------------------------------------------------------------------------

test('without OfflineAudioContext play() keeps the identical synth path', () => {
  const counts = zeroCounts();
  const ctx = makeCtx(counts);
  const host = makeHost(ctx);
  const v1 = host.play(LASER, { gain: 0.8 });
  const v2 = host.play(LASER, { gain: 0.8 });
  assert.ok(v1 && v2 && !v1._bakedShell && !v2._bakedShell);
  assert.ok(counts.osc >= 2, 'synth graphs still mint their oscillators');
  assert.equal(host.rt._bakeDisabled, true, 'baking stands down without a renderer');
  const entry = host.rt._bakeCache.get(LASER);
  assert.ok(entry && entry.status === 'failed');
});

test('a 100%-sample voice skips the synth graph entirely (resident carrier)', () => {
  const counts = zeroCounts();
  const ctx = makeCtx(counts);
  const host = makeHost(ctx);
  const bark = {
    duration: 0.4, sampleRate: 44100, length: 17640,
    getChannelData: () => new Float32Array(4),
  };
  const v = host.play(LASER, { gain: 0.8, barkPcmBuffer: bark });
  assert.ok(v, 'carrier voice admitted');
  assert.equal(counts.osc, 0, 'silent synth layer minted no oscillator');
  assert.ok(v.subVoices.length === 1 && v.subVoices[0].sampleLayer,
    'the resident sample attached as the only sub-voice');
});

// ---------------------------------------------------------------------------
// renderRecipeToBuffer uses the real playRecipe graph on the offline context.
// ---------------------------------------------------------------------------

test('renderRecipeToBuffer runs the recipe graph and resolves a buffer', async () => {
  const counts = zeroCounts();
  const restore = installMockOfflineContext(counts);
  try {
    const off = new globalThis.OfflineAudioContext(1, 8192, 44100);
    const recipe = AUDIO_RECIPE_BY_ID[LASER];
    const buf = await renderRecipeToBuffer(off, recipe, {});
    assert.ok(buf && buf.length === 8192 && buf.duration > 0);
    assert.ok(counts.osc >= 1, 'the offline render used the same oscillator graph');
    assert.ok(counts.gain >= 2 && counts.filter >= 1 && counts.shaper >= 1,
      'the offline render built the full recipe graph');
  } finally {
    restore();
  }
});
