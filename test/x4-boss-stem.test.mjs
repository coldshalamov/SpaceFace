import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { MUSIC_STEMS } from '../src/data/audioRecipes.js';
import {
  STEM_KEYS,
  STEM_ID_BY_STATE,
  THEME_STATES,
  THEME_MOTIFS,
  THEME_STEM_WEIGHTS,
  MOTIF_STEPS_PER_BAR,
  BOSS_MOTIF,
  motifPhraseBars,
  intervalSignature,
  resolveThemeMatrix,
  scoreStemWeights,
} from '../src/audio/themeMatrix.js';
import { BOSS_STEM_WEIGHTS } from '../src/audio/scoreDirector.js';
import {
  AUTHORED_STEM_SAMPLES,
  acquireThemeStem,
  decodePcmWav,
  motifStepSeconds,
  noteToHz,
  renderMotifLeadPcm,
  toneEnergy,
} from '../src/audio/themeCompose.js';
import { SAMPLE_MANIFEST } from '../src/audio/sampleLibrary.js';
import { audio, isBossBody, stemSequencerName } from '../src/audio/audioSystem.js';
import { CUE_VARIANTS, VARIANT_CUE_IDS, hasCueVariants, nextCueVariant } from '../src/audio/cueVariants.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('five stems: travel, tension, combat, station, boss', () => {
  assert.deepEqual([...STEM_KEYS], ['A', 'B', 'C', 'D', 'E']);
  assert.equal(MUSIC_STEMS.length, 5);
  const station = MUSIC_STEMS.find((row) => row.id === 'stem_d');
  const boss = MUSIC_STEMS.find((row) => row.id === 'stem_e');
  assert.equal(station.label, 'Station');
  assert.equal(station.themeState, 'station');
  assert.equal(station.authoredSampleId, 'theme_station');
  assert.equal(boss.label, 'Boss');
  assert.equal(boss.themeState, 'boss');
  assert.equal(boss.authoredSampleId, 'theme_boss');
});

test('the boss state resolves to the boss stem, not the station body', () => {
  const boss = resolveThemeMatrix({ bossActive: true, inCombat: true, threat: 1 });
  assert.equal(boss.state, 'boss');
  assert.equal(boss.musicState, 'combat');
  assert.equal(boss.audibleStemWeights.E, 1);
  assert.equal(boss.stemDef.id, 'stem_e');
  // The station row stays the station row.
  const station = resolveThemeMatrix({ docked: true });
  assert.equal(station.state, 'station');
  assert.equal(station.stemDef.id, 'stem_d');
});

test('the boss mix is an authored row, not a phase remix', () => {
  const frame = { phase: 'fight', stem: 'E', stemWeights: BOSS_STEM_WEIGHTS };
  assert.equal(scoreStemWeights(frame, { state: 'boss' }), null);
  assert.equal(THEME_STEM_WEIGHTS.boss.E, 1);
});

test('the boss body is a real authored file', () => {
  assert.equal(AUTHORED_STEM_SAMPLES.boss, 'theme_boss');
  assert.ok(existsSync(path.join(ROOT, 'assets/audio/music/theme_boss.wav')));
  assert.ok(THEME_STATES.includes('boss'));
});

// ---- X4 P0: the boss stem has a voice -------------------------------------------------------

/** A recording AudioContext: enough surface for the stem sequencers, no sound. */
function fakeCtx() {
  const stats = { oscillators: 0, started: 0 };
  const param = (value) => ({
    value,
    setValueAtTime() { return this; },
    linearRampToValueAtTime() { return this; },
    exponentialRampToValueAtTime() { return this; },
    cancelScheduledValues() { return this; },
    setTargetAtTime() { return this; },
  });
  const node = (extra = {}) => ({ connect() {}, disconnect() {}, ...extra });
  const ctx = {
    currentTime: 10,
    sampleRate: 32000,
    stats,
    createOscillator() {
      stats.oscillators += 1;
      return node({ type: 'sine', frequency: param(440), detune: param(0), start() { stats.started += 1; }, stop() {}, onended: null });
    },
    createGain() { return node({ gain: param(1) }); },
    createBiquadFilter() { return node({ type: 'lowpass', frequency: param(1000), Q: param(1) }); },
    createDelay() { return node({ delayTime: param(0.2) }); },
    createBufferSource() {
      stats.started += 1;
      return node({ buffer: null, loop: false, playbackRate: param(1), start() {}, stop() {}, onended: null });
    },
    createBuffer(channels, length) {
      return { length, numberOfChannels: channels, getChannelData: () => new Float32Array(length) };
    },
  };
  return ctx;
}

test('every stem key names a real sequencer — including E', () => {
  for (const key of STEM_KEYS) {
    const name = stemSequencerName(key);
    assert.ok(name, `stem ${key} has no sequencer`);
    assert.equal(typeof audio[name], 'function', `stem ${key} -> ${name} is not a method`);
  }
  assert.equal(stemSequencerName('E'), '_seqBoss');
  assert.equal(stemSequencerName('Z'), null);
});

test('X4 P0: a boss frame drives an audible source (the E fader is not a dead gain node)', () => {
  const ctx = fakeCtx();
  const previous = audio.rt;
  audio.rt = { ctx, _caches: {}, _scoreIdentity: null };
  try {
    // Two bars of the 100 BPM boss grid: 32 sixteenth steps.
    for (let step = 0; step < 32; step++) {
      audio._seqBoss(ctx, 10 + step * 0.15, step % 16, { step, macroBar: Math.floor(step / 16) },
        0.15, 0.6, ctx.createGain(), ctx.createDelay(), ctx.createGain());
    }
  } finally {
    audio.rt = previous;
  }
  assert.ok(ctx.stats.oscillators > 0, 'boss sequencer created no oscillator');
  assert.ok(ctx.stats.started > 0, 'boss sequencer started no source');
  console.log(`[x4 boss-audible] oscillators=${ctx.stats.oscillators} started=${ctx.stats.started}`);
});

test('X4 P0: the boss latch reads the canonical boss marks', () => {
  assert.equal(isBossBody({ data: { isBoss: true } }), true);
  assert.equal(isBossBody({ data: { encounterBoss: 'x' } }), true);
  assert.equal(isBossBody({ data: { missionBoss: { id: 1 } } }), true);
  assert.equal(isBossBody({ data: { bossDressing: 'arena' } }), true);
  assert.equal(isBossBody({ data: { missionTag: 'capital_boss' } }), true);
  assert.equal(isBossBody({ data: { lootTableId: 'enemy_lancer' } }), false);
  assert.equal(isBossBody({ data: null }), false);
  assert.equal(isBossBody(null), false);
  // The mid-session clear + save seed are both wired to a fresh Set, never a stale one.
  const prev = audio.rt;
  const prevState = audio.state;
  audio.rt = { _bossIds: new Set([7]), _bossActive: true };
  audio.state = { entities: { values: () => [{ id: 3, data: { isBoss: true } }, { id: 4, data: {} }][Symbol.iterator]() } };
  try {
    assert.equal(audio._seedBossLatchFromState(), 1);
    assert.equal(audio.rt._bossActive, true);
    audio._sessionBoundaryReset();
    assert.equal(audio.rt._bossIds.size, 0);
    assert.equal(audio.rt._bossActive, false);
  } finally {
    audio.rt = prev;
    audio.state = prevState;
  }
});

// ---- X4 #1: the boss's final note is last ------------------------------------------------

test('X4 #1: motif rows are bar-aware — `bar` is sixteen sixteenths, not one beat', () => {
  const sixteenth = 0.15;
  assert.equal(MOTIF_STEPS_PER_BAR, 16);
  assert.equal(motifStepSeconds({ bar: 0, beat: 12 }, sixteenth), 12 * sixteenth);
  assert.equal(motifStepSeconds({ bar: 1, beat: 0 }, sixteenth), 16 * sixteenth);
  assert.equal(motifPhraseBars(BOSS_MOTIF), 2);
  // The written phrase: A(0) D(8) A(bar1) F#(bar1+8), with rests between.
  assert.deepEqual(BOSS_MOTIF.steps.map((r) => motifStepSeconds(r, sixteenth)), [0, 8, 16, 24].map((s) => s * sixteenth));
  const lead = renderMotifLeadPcm(BOSS_MOTIF);
  const order = [];
  for (const [a, b] of [[0.05, 0.6], [1.3, 1.8], [2.5, 3.0], [3.7, 4.4]]) {
    const hz = { a2: toneEnergy(lead, 32000, 110, a, b), d2: toneEnergy(lead, 32000, 73.42, a, b), f3: toneEnergy(lead, 32000, 185, a, b) };
    order.push(Object.entries(hz).sort((x, y) => y[1] - x[1])[0][0]);
  }
  assert.deepEqual(order, ['a2', 'd2', 'a2', 'f3'], `lead order ${order.join(' ')}`);
});

test('X4 #1 note window: theme_boss.wav opens on A2 and the F# arrives in the second bar', () => {
  const decoded = decodePcmWav(readFileSync(path.join(ROOT, 'assets/audio/music/theme_boss.wav')));
  assert.ok(decoded, 'theme_boss.wav is not a PCM WAV');
  const sr = decoded.sampleRate;
  const a2 = toneEnergy(decoded.pcm, sr, 110, 0.05, 0.5);
  const f3 = toneEnergy(decoded.pcm, sr, 185, 0.05, 0.5);
  assert.ok(a2 > f3 * 10, `opening window is not the written A2 (A2=${a2.toFixed(4)} F#3=${f3.toFixed(4)})`);
  // Bar 2, step 24 at 100 BPM is 3.6 s: the raised sixth answers there, not at t=0.
  const fLate = toneEnergy(decoded.pcm, sr, 185, 3.7, 4.5);
  const aLate = toneEnergy(decoded.pcm, sr, 110, 3.7, 4.5);
  assert.ok(fLate > aLate * 3, `the F# is not sounding in bar 2 (F#3=${fLate.toFixed(4)} A2=${aLate.toFixed(4)})`);
  console.log(`[x4 boss-window] A2@0.05-0.5=${a2.toFixed(4)} F#3@0.05-0.5=${f3.toFixed(4)} F#3@3.7-4.5=${fLate.toFixed(4)}`);
});

test('X4 #1 heard motif: a 64-step boss pass plays A2/D2/A2/F#3 on 0/8/16/24', () => {
  const ctx = fakeCtx();
  const previous = audio.rt;
  audio.rt = { ctx, _caches: {}, _scoreIdentity: null };
  const heard = [];
  let step = -1;
  const original = audio._playNote;
  // The motif is the only boss voice that carries both the space-delay send and the pluck filter.
  audio._playNote = function (_ctx, freq, _dur, _gain, _wave, _bus, _delay, _t, options = {}) {
    if (options.pluckFilter === true && options.delayGain === 0.35) heard.push({ step, freq });
    return null;
  };
  try {
    // The real scheduler's first pass: step 0..63, macroBar 0, so bar === floor(step / 16).
    for (step = 0; step < 64; step++) {
      const seq = { step, macroBar: 0 };
      audio._seqBoss(ctx, 10 + step * 0.15, step, seq, 0.15, 0.6,
        ctx.createGain(), ctx.createDelay(), ctx.createGain());
    }
  } finally {
    audio._playNote = original;
    audio.rt = previous;
  }
  const hz = (note, oct) => noteToHz(note, oct).toFixed(1);
  const phrase = [
    [0, hz('A', 2)],
    [8, hz('D', 2)],
    [16, hz('A', 2)],
    [24, hz('F#', 3)],
  ];
  assert.deepEqual(heard.slice(0, 4).map(({ step: s, freq }) => [s, freq.toFixed(1)]), phrase,
    'the heard first phrase is A2/D2/A2/F#3, not A2/D2 twice');
  assert.deepEqual(heard.slice(4).map(({ step: s, freq }) => [s, freq.toFixed(1)]),
    phrase.map(([s, f]) => [s + 32, f]), 'the two-bar phrase repeats on bars 2-3');
  console.log(`[x4 motif-heard] ${heard.map(({ step: s, freq }) => `${s}:${freq.toFixed(1)}Hz`).join(' ')}`);
});

// ---- X4 #3: the boss is a different piece ------------------------------------------------

test('X4 #3: the boss is slower than the fight and phrases in two bars with rests', () => {
  const boss = THEME_MOTIFS.boss;
  const combat = THEME_MOTIFS.combat;
  assert.ok(boss.bpm >= 96 && boss.bpm <= 104, `boss bpm ${boss.bpm}`);
  assert.ok(boss.bpm < combat.bpm, `boss ${boss.bpm} is not slower than combat ${combat.bpm}`);
  assert.equal(boss.bpm, 100);
  assert.equal(motifPhraseBars(boss), 2);
  // Rests: each note ends before the next begins, and the phrase has a gap.
  const sixteenth = (60 / boss.bpm) / 4;
  const starts = boss.steps.map((r) => motifStepSeconds(r, sixteenth));
  const ends = boss.steps.map((r) => motifStepSeconds(r, sixteenth) + r.dur * sixteenth);
  for (let i = 1; i < starts.length; i++) assert.ok(ends[i - 1] <= starts[i], `note ${i} overlaps`);
  assert.ok(boss.steps.every((r) => r.dur < MOTIF_STEPS_PER_BAR), 'a boss note fills a whole bar');
  // Distinct from every other motif by interval shape.
  const sig = intervalSignature(boss.notes);
  assert.notEqual(sig, intervalSignature(combat.notes));
  assert.equal(sig, '5,0,9');
});

test('X4 #5: one tempo per state — the motif reads the MUSIC_STEMS row', () => {
  for (const state of THEME_STATES) {
    const row = MUSIC_STEMS.find((r) => r.id === STEM_ID_BY_STATE[state]);
    assert.ok(row, `${state} has no MUSIC_STEMS row`);
    assert.equal(THEME_MOTIFS[state].bpm, row.bpm, `${state} motif tempo drifted from its row`);
  }
  // The station no longer advertises 116 in one file and 72 in another.
  assert.equal(MUSIC_STEMS.find((r) => r.id === 'stem_d').bpm, 72);
  assert.equal(THEME_MOTIFS.station.bpm, 72);
});

// ---- X4 #3: residency ----------------------------------------------------------------

test('X4 #3: the 16 s stems are tier 2; acquireThemeStem fetches one stem on demand', () => {
  for (const state of THEME_STATES) {
    const id = AUTHORED_STEM_SAMPLES[state];
    const row = SAMPLE_MANIFEST.get(id);
    assert.ok(row, `${id} missing`);
    assert.equal(row.tier, 2, `${id} is tier ${row.tier}; a 1 MB loop must not warm the menu`);
    assert.equal(row.loop, true);
  }
  const acquired = [];
  const samples = { acquire: (id) => { acquired.push(id); return null; } };
  acquireThemeStem(samples, 'boss');
  assert.deepEqual(acquired, ['theme_boss']);
  acquireThemeStem(samples, 'not-a-state');
  acquireThemeStem(null, 'boss');
  assert.deepEqual(acquired, ['theme_boss']);
});

// ---- X4 #4: heard cues rotate ---------------------------------------------------------

test('X4 #4: heard cues rotate three takes; unlisted emitters keep their body', () => {
  assert.equal(CUE_VARIANTS.length, 3);
  assert.ok(VARIANT_CUE_IDS.includes('combat.action.reject'));
  assert.ok(VARIANT_CUE_IDS.includes('sfx_ui_click'));
  assert.equal(hasCueVariants('ship:rcsPulse'), false, 'an emitter is not a cue body');
  const bag = {};
  const takes = [0, 1, 2, 0].map(() => nextCueVariant(bag, 'combat.action.reject'));
  assert.deepEqual(takes.map((t) => t.index), [1, 2, 0, 1]);
  assert.deepEqual([...new Set(CUE_VARIANTS.map((v) => v.rate))].length, 3);
  assert.equal(nextCueVariant(bag, 'ship:rcsPulse'), null);
  assert.equal(nextCueVariant(null, 'sfx_ui_click'), null);
});
