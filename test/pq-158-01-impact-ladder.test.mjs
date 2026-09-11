// test/pq-158-01-impact-ladder.test.mjs — PQ-158.01 leaf gate (bar B9b).
//
// DONE WHEN (verbatim): "B9b table test; A/B capture." B9b (inherited from PQ-139.01): a table test
// over (material, force) that prints the chosen rate/gain; scout-on-rock vs freighter-on-station
// stays >= 1 octave and >= 12 dB apart. PQ-158.01 adds the sample half: the same 3x3 ladder
// (hull/rock/station x light/medium/heavy) is carried by nine DISTINCT designed samples, each with
// a measurable layered transient, body and tail. The PQ-139.01 synth law (pitch from acoustic
// mass, gain from dp, tier recipes) is consumed, never re-tuned. Seed: the cue resolution is pure
// data over (mass, type, dp), identical on every run; WAV analysis reads shipped bytes.
//
// Headed A/B capture is residual (PQ-141.02 holds the GPU); this file is the closeable bar.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { COLLISION_LADDER, SAMPLE_BINDINGS } from '../src/data/audioRecipes.js';
import {
  SAMPLE_MANIFEST,
  resolveLadderBinding,
  resolveSampleBinding,
  createSampleRuntime,
} from '../src/audio/sampleLibrary.js';
import { audio, resolveCollisionCue } from '../src/audio/audioSystem.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MEASURE_SEED = 15801;

// The 3x3 scenario table: material (hull/rock/station) x force (light/medium/heavy). Masses and
// dp values are the same physical vocabulary the PQ-139.01 bar used: a 16-mass scout, 32-mass
// fighters, 200-mass freighters, immovable asteroids/stations mapped to nominal acoustic masses,
// dp 40 = a docking-speed nudge, dp 1000 = a firm knock, dp 24000 = a hull-shattering exchange.
const FORCES = [
  ['light', 40],
  ['medium', 1000],
  ['heavy', 24000],
];
function collisionInput(material, dp) {
  if (material === 'rock') return { massA: 16, typeA: 'ship', massB: null, typeB: 'asteroid', dp, impulse: dp };
  if (material === 'station') return { massA: 200, typeA: 'ship', massB: null, typeB: 'station', dp, impulse: dp };
  const mass = dp <= 400 ? 16 : dp <= 4000 ? 32 : 200;
  return { massA: mass, typeA: 'ship', massB: mass, typeB: 'ship', dp, impulse: dp };
}
// The tier law the ladder must NOT change (PQ-139.01, pinned by test/audio-collision-weight.test.mjs).
const TIER_RECIPE = {
  kiss: 'sfx_dock_clunk',
  knock: 'sfx_mining_impact',
  slam: 'sfx_explosion_small',
  broadside: 'sfx_explosion_large',
};

// ---------------------------------------------------------------------------
// 1. THE B9b TABLE — 3x3 ladder, printed numbers, law untouched
// ---------------------------------------------------------------------------
test(`seed ${MEASURE_SEED}: the 3x3 impact ladder table — every cell resolves material, force, sample and the pinned tier recipe`, () => {
  const rows = [];
  for (const material of ['hull', 'rock', 'station']) {
    for (const [weight, dp] of FORCES) {
      const cue = resolveCollisionCue(collisionInput(material, dp));
      const ladderId = `ladder_${material}_${weight}`;
      assert.equal(cue.material, material, `${ladderId}: material must come from the touched surfaces`);
      assert.equal(cue.weight, weight, `${ladderId}: force band must come from dp`);
      assert.equal(cue.ladderId, ladderId, `${ladderId}: cue names its ladder cell`);
      const binding = resolveLadderBinding(cue.ladderId);
      assert.ok(binding, `${ladderId}: ladder cell must resolve to a designed sample binding`);
      assert.equal(binding.sampleId, ladderId, `${ladderId}: binding names its own cell's sample`);
      assert.equal(cue.recipeId, TIER_RECIPE[cue.tier], `${ladderId}: tier recipe unchanged by the ladder`);
      rows.push({ material, weight, dp, rate: cue.rate, gain: cue.gain, tier: cue.tier, recipeId: cue.recipeId, ladderId });
    }
  }
  // B9b printout: the table with the chosen rate/gain per (material, force) cell.
  console.log(`[pq-158.01 B9b table] seed=${MEASURE_SEED}`);
  console.log('material  force   dp      rate    gain    tier       recipeId              ladderId');
  for (const r of rows) {
    console.log(
      `${r.material.padEnd(9)} ${r.weight.padEnd(7)} ${String(r.dp).padEnd(7)} ${r.rate.toFixed(3)}   ` +
      `${r.gain.toFixed(3)}   ${r.tier.padEnd(10)} ${r.recipeId.padEnd(19)}  ${r.ladderId}`,
    );
  }
  assert.equal(rows.length, 9, 'the ladder table is 3x3');
});

test('B9b bar: scout-on-rock (light) vs freighter-on-station (heavy) is >= 1 octave and >= 12 dB apart', () => {
  const scout = resolveCollisionCue(collisionInput('rock', 40));
  const freighter = resolveCollisionCue(collisionInput('station', 24000));
  const octaves = Math.log2(scout.rate / freighter.rate);
  const db = 20 * Math.log10(freighter.gain / scout.gain);
  console.log(
    `[pq-158.01 B9b bar] scout-on-rock rate ${scout.rate.toFixed(3)} gain ${scout.gain.toFixed(3)} | ` +
    `freighter-on-station rate ${freighter.rate.toFixed(3)} gain ${freighter.gain.toFixed(3)} | ` +
    `${octaves.toFixed(2)} octaves, ${db.toFixed(2)} dB`,
  );
  assert.ok(octaves >= 1.0, `pitch separation must stay >= 1 octave, got ${octaves.toFixed(3)}`);
  assert.ok(db >= 12, `loudness separation must stay >= 12 dB, got ${db.toFixed(2)}`);
  // The designed samples must not undo the law: the two cells bind DIFFERENT samples, and the
  // bindings carry no rate/gain compensation that would collapse the separation.
  assert.equal(scout.ladderId, 'ladder_rock_light');
  assert.equal(freighter.ladderId, 'ladder_station_heavy');
  assert.equal(resolveLadderBinding(scout.ladderId).rate, 1, 'sample binding adds no pitch compensation');
  assert.equal(resolveLadderBinding(freighter.ladderId).rate, 1, 'sample binding adds no pitch compensation');
  assert.notEqual(scout.ladderId, freighter.ladderId);
});

test('the same contact always resolves the same ladder cell (deterministic, pure)', () => {
  const input = collisionInput('rock', 1000);
  const first = resolveCollisionCue(input);
  const second = resolveCollisionCue(input);
  assert.deepEqual(second, first, 'identical inputs give identical cues including the ladder cell');
});

// ---------------------------------------------------------------------------
// 2. NINE DESIGNED SAMPLES — not one thump reused three ways
// ---------------------------------------------------------------------------
function readPcmWav(id) {
  const entry = SAMPLE_MANIFEST.get(id);
  assert.ok(entry, `${id}: missing from SAMPLE_MANIFEST`);
  const file = path.join(ROOT, entry.file);
  assert.ok(existsSync(file), `${id}: missing file ${entry.file}`);
  const buf = readFileSync(file);
  assert.equal(buf.toString('ascii', 0, 4), 'RIFF', `${id}: not a RIFF wav`);
  assert.equal(buf.toString('ascii', 8, 12), 'WAVE', `${id}: not a WAVE file`);
  assert.equal(buf.readUInt16LE(20), 1, `${id}: not PCM`);
  assert.equal(buf.readUInt16LE(22), 1, `${id}: expected mono`);
  assert.equal(buf.readUInt16LE(34), 16, `${id}: expected 16-bit`);
  const dataBytes = buf.readUInt32LE(40);
  const sampleRate = buf.readUInt32LE(24);
  const n = dataBytes / 2;
  const pcm = new Float64Array(n);
  for (let i = 0; i < n; i++) pcm[i] = buf.readInt16LE(44 + i * 2) / 32768;
  return { pcm, sampleRate, seconds: n / sampleRate, file: entry.file, bytes: buf };
}

function rmsWindow(pcm, a, b) {
  let s = 0;
  const lo = Math.max(0, a), hi = Math.min(pcm.length, b);
  for (let i = lo; i < hi; i++) s += pcm[i] * pcm[i];
  return Math.sqrt(s / Math.max(1, hi - lo));
}

test('every ladder cell is its own designed file — nine distinct transient/body/tail voices', () => {
  const cells = [...Object.keys(COLLISION_LADDER)];
  assert.equal(cells.length, 9, 'the ladder ships exactly nine cells');
  assert.equal(new Set(cells).size, 9, 'ladder cell ids are unique');
  const defaultSamples = new Set(Object.values(SAMPLE_BINDINGS).map((b) => b.id));
  const decoded = new Map();
  for (const id of cells) {
    assert.ok(!defaultSamples.has(id), `${id}: a ladder cell must not alias an existing library sample`);
    const wav = readPcmWav(id);
    assert.ok(Math.abs(wav.seconds - SAMPLE_MANIFEST.get(id).seconds) < 0.05,
      `${id}: manifest seconds drift`);
    decoded.set(id, wav);
  }
  const uniqueBytes = new Set(cells.map((id) => decoded.get(id).bytes.toString('base64')));
  assert.equal(uniqueBytes.size, 9, 'nine cells rendered to identical bytes — one thump reused three ways');
});

test('every ladder sample has a measured transient, body and tail (struck, sustained, decaying)', () => {
  for (const id of Object.keys(COLLISION_LADDER)) {
    const { pcm, sampleRate } = readPcmWav(id);
    const n = pcm.length;
    // transient: the loudest 5 ms window inside the first 15% (the designed strike)
    let strike = 0;
    const win = Math.max(1, Math.round(0.005 * sampleRate));
    for (let a = 0; a + win < n * 0.15; a += win) strike = Math.max(strike, rmsWindow(pcm, a, a + win));
    // body: the sustained middle between strike and decay
    const body = rmsWindow(pcm, n * 0.15, n * 0.5);
    // tail: the designed decay over the last 15% — quiet but present (above 16-bit floor)
    const tail = rmsWindow(pcm, n * 0.85, n);
    const strikeOverTail = strike / Math.max(tail, 1e-9);
    console.log(
      `[pq-158.01 layers] ${id.padEnd(22)} strike ${strike.toFixed(4)}  body ${body.toFixed(4)}  ` +
      `tail ${tail.toFixed(5)}  strike/tail ${strikeOverTail.toFixed(1)}x (${(20 * Math.log10(strikeOverTail)).toFixed(1)} dB)`,
    );
    assert.ok(strike > 0.1, `${id}: no designed transient strike in the first 15%`);
    assert.ok(tail > 1e-4, `${id}: tail decays to digital silence — no designed tail`);
    assert.ok(body > tail, `${id}: no designed body between strike and tail`);
    assert.ok(strikeOverTail >= 2, `${id}: strike must dominate the tail (transient vs decay), got ${strikeOverTail.toFixed(2)}x`);
  }
});

test('force stretches the tail: duration increases light -> medium -> heavy inside every material', () => {
  for (const material of ['hull', 'rock', 'station']) {
    const secs = ['light', 'medium', 'heavy'].map((w) => SAMPLE_MANIFEST.get(`ladder_${material}_${w}`).seconds);
    assert.ok(secs[0] < secs[1] && secs[1] < secs[2],
      `${material}: tail must lengthen with force, got ${secs.join(' <= ')}`);
    const bindings = ['light', 'medium', 'heavy'].map((w) => resolveLadderBinding(`ladder_${material}_${w}`));
    for (const b of bindings) {
      assert.ok(b.share > 0 && b.share < 1, `${b.sampleId}: share must split the hybrid`);
      assert.equal(b.rate, 1, `${b.sampleId}: the mass law owns pitch; bindings stay neutral`);
      assert.equal(b.tier, 0, `${b.sampleId}: the collision path is core-tier residency`);
    }
  }
});

test('an unknown ladder cell degrades to the recipe default, never to silence', () => {
  assert.equal(resolveLadderBinding(null), null);
  assert.equal(resolveLadderBinding('ladder_hull_extreme'), null);
  assert.equal(resolveLadderBinding('ladder_rock_light').sampleId, 'ladder_rock_light');
  // The recipe's own hybrid binding still resolves — that is the degradation path.
  assert.ok(resolveSampleBinding('sfx_mining_impact'), 'recipe default binding intact');
});

// ---------------------------------------------------------------------------
// 3. WIRING — _onCollision rides the pinned recipe AND names the ladder cell
// ---------------------------------------------------------------------------
test('_onCollision keeps the pinned tier recipe and passes the ladder cell for every table row', () => {
  for (const material of ['hull', 'rock', 'station']) {
    for (const [weight, dp] of FORCES) {
      const played = [];
      const host = Object.create(audio);
      host.play = (recipeId, opts) => { played.push({ recipeId, opts }); return null; };
      const mass = material === 'hull' ? (dp <= 400 ? 16 : dp <= 4000 ? 32 : 200) : 200;
      const otherType = material === 'station' ? 'station' : 'asteroid';
      const entities = material === 'hull'
        ? new Map([[1, { id: 1, type: 'ship', mass }], [2, { id: 2, type: 'ship', mass }]])
        : new Map([[1, { id: 1, type: 'ship', mass: material === 'station' ? 200 : 16 }],
          [2, { id: 2, type: otherType }]]);
      host.state = { entities };
      host._onCollision({ aId: 1, bId: 2, dp, impulse: dp, pos: { x: 3, z: 4 } });
      assert.equal(played.length, 1, `${material}/${weight}: exactly one cue`);
      const expectedTier = dp <= 400 ? 'kiss'
        : (dp >= 4000 && (material !== 'rock')) ? 'broadside'
          : (dp >= 4000 || (material === 'station' && dp > 400)) ? 'slam' : 'knock';
      assert.equal(played[0].recipeId, TIER_RECIPE[expectedTier],
        `${material}/${weight}: tier law untouched`);
      assert.equal(played[0].opts.ladderId, `ladder_${material}_${weight}`,
        `${material}/${weight}: the ladder cell rides the cue`);
      assert.ok(Number.isFinite(played[0].opts.gain) && Number.isFinite(played[0].opts.rate));
    }
  }
});

test('_onCollision never crashes on missing entities and stays silent on a null payload', () => {
  const played = [];
  const host = Object.create(audio);
  host.play = (recipeId, opts) => { played.push({ recipeId, opts }); return null; };
  host.state = { entities: new Map() };
  host._onCollision({ aId: 99, bId: 98, dp: 40, impulse: 40, pos: { x: 0, z: 0 } });
  assert.equal(played.length, 1, 'an unresolvable collision still plays');
  assert.ok(TIER_RECIPE[Object.entries(TIER_RECIPE).find(([, id]) => id === played[0].recipeId)?.[0]],
    'fallback cue is a tier recipe');
  assert.equal(played[0].opts.ladderId, 'ladder_hull_light', 'fallback lands on the hull/light cell');
  played.length = 0;
  host._onCollision(null);
  assert.equal(played.length, 0, 'a null payload stays silent');
});

// ---------------------------------------------------------------------------
// 4. PLAYBACK — a resident ladder sample carries the body; a miss degrades to the recipe hybrid
// ---------------------------------------------------------------------------
function param(value) {
  return {
    value,
    setValueAtTime() { return this; },
    linearRampToValueAtTime() { return this; },
    exponentialRampToValueAtTime() { return this; },
    cancelScheduledValues() { return this; },
    setTargetAtTime() { return this; },
  };
}
function fakeGraphCtx() {
  const node = () => ({ connect() {}, disconnect() {} });
  const source = () => ({ ...node(), loop: false, playbackRate: param(1), start() {}, stop() {}, onended: null });
  return {
    currentTime: 2.0,
    sampleRate: 48000,
    state: 'running',
    destination: node(),
    createOscillator() { return { ...source(), type: 'sine', frequency: param(440), detune: param(0) }; },
    createGain() { return { ...node(), gain: param(1) }; },
    createBiquadFilter() { return { ...node(), type: 'lowpass', frequency: param(1000), Q: param(0.7) }; },
    createStereoPanner() { return { ...node(), pan: param(0) }; },
    createBufferSource() { return { ...source(), buffer: null, detune: param(0) }; },
    createWaveShaper() { return { ...node(), curve: null, oversample: 'none' }; },
    createDynamicsCompressor() { return { ...node(), threshold: param(-6), knee: param(6), ratio: param(12), attack: param(0.003), release: param(0.25) }; },
    createBuffer(channels, length) {
      const data = new Float32Array(length);
      return { sampleRate: 48000, getChannelData: () => data };
    },
  };
}
function fakeDecodedBuffer(seconds, sampleRate = 32000) {
  return { duration: seconds, length: Math.round(seconds * sampleRate), numberOfChannels: 1, sampleRate };
}
const settle = () => new Promise((resolve) => setImmediate(resolve));
async function drainQueue(rounds = 80) {
  for (let i = 0; i < rounds; i++) await settle();
}

test('a resident ladder sample is the attached body; a non-resident cell degrades with no gap', async () => {
  const ctx = { ...fakeGraphCtx(), decodeAudioData: async () => fakeDecodedBuffer(0.5) };
  const rockBuf = fakeDecodedBuffer(0.4);
  let decodeCount = 0;
  const ctxWithCount = { ...ctx, decodeAudioData: async () => { decodeCount++; return rockBuf; } };
  const files = new Map([...SAMPLE_MANIFEST.values()]
    .filter((e) => e.file.includes('impact/ladder_'))
    .map((e) => [e.file, new ArrayBuffer(8)]));
  const samples = createSampleRuntime({
    ctx: ctxWithCount,
    fetchImpl: async (file) => files.has(file)
      ? { ok: true, arrayBuffer: async () => files.get(file) }
      : { ok: false },
    byteBudget: 8 * 1024 * 1024,
  });
  samples.setContext(ctxWithCount);

  const rt = {
    ctx: ctxWithCount,
    voices: [],
    loops: {},
    _caches: {},
    _lifecycleSuspended: false,
    _nextVoiceId: 1,
    _criticalSquelchUntilMs: 0,
    sfxBus: ctx.createGain(),
    engineBus: ctx.createGain(),
    ambientBus: ctx.createGain(),
    combatBus: ctx.createGain(),
    uiBus: ctx.createGain(),
    commsBus: ctx.createGain(),
    _samples: samples,
  };
  const harness = Object.create(audio);
  harness.rt = rt;
  harness.state = { playerId: 1, entities: new Map(), settings: { audio: { muted: false } }, video: {} };

  // Miss first: the cue still plays (full synth) and schedules the decode.
  const degraded = harness.play('sfx_mining_impact', { gain: 0.5, ladderId: 'ladder_rock_light' });
  assert.ok(degraded, 'a non-resident ladder cell still plays the synth voice');
  assert.equal(degraded.subVoices.some((s) => s.sampleLayer), false, 'no sample body on a miss');
  await drainQueue();
  assert.ok(decodeCount >= 1, 'the miss scheduled the decode');

  // Resident: the LADDER buffer (not the recipe default) is the attached sample body.
  const voice = harness.play('sfx_mining_impact', { gain: 0.5, ladderId: 'ladder_rock_light', rate: 1.2 });
  assert.ok(voice, 'resident hybrid plays');
  const sub = voice.subVoices.find((s) => s.sampleLayer);
  assert.ok(sub, 'ladder sample body attached');
  assert.equal(sub.sources[0].buffer, rockBuf, 'the attached body is the designed ladder sample');
  assert.ok(Math.abs(sub.sources[0].playbackRate.value - 1.2) < 1e-6, 'the cue rate (mass law) drives the sample too');

  // No ladderId: the recipe keeps its own default hybrid binding (PQ-158.00 behaviour intact).
  const plain = harness.play('sfx_mining_impact', { gain: 0.5 });
  assert.ok(plain, 'recipe-default hybrid plays');
  samples.dispose();
});
