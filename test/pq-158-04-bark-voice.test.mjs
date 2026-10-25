// test/pq-158-04-bark-voice.test.mjs — PQ-158.04 leaf gate.
//
// DONE WHEN: every corpus line through the pipeline (BARK_CORPUS_TARGET-pinned); subtitles; determinism untouched.
// Seed 15804. Fourteen faction registers + mechanic. Directed synthetic voice, no recorded actors.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BARK_FACTIONS, BARK_SITUATIONS, barkFor } from '../src/data/barks.js';
import { RECIPES } from '../src/data/audioRecipes.js';
import { SAMPLE_MANIFEST } from '../src/audio/sampleLibrary.js';
import { audio } from '../src/audio/audioSystem.js';
import {
  BARK_VOICE_SEED,
  BARK_CORPUS_TARGET,
  BARK_RECIPE_ID,
  FACTION_VOICE_REGISTERS,
  MECHANIC_VOICE_REGISTER,
  MECHANIC_LINES,
  countBarkCorpus,
  enumerateBarkPipeline,
  enumerateMechanicPipeline,
  resolveBarkVoice,
  resolveVoiceRegister,
  factionRegistersAreDistinct,
  identifyRegisterFromSpeech,
  identifyRegisterFromPcm,
  identifyRegisterFromWavBuffer,
  renderRegisterCallsignPcm,
  renderBarkUtterancePcm,
  enumerateDeliveredBarkWavs,
  deliveredBarkWavRelPath,
  BLIND_REGISTER_CLIPS,
  BARK_UTTERANCE_SECONDS,
  DELIVERED_WAV_SECONDS,
} from '../src/audio/barkVoice.js';
import { decodePcmWav, encodeWavPcm16, THEME_SAMPLE_RATE } from '../src/audio/themeCompose.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MEASURE_SEED = 15804;

test(`seed ${MEASURE_SEED}: all ${BARK_CORPUS_TARGET} bark lines go through the directed pipeline with captions`, () => {
  const count = countBarkCorpus();
  const rows = enumerateBarkPipeline();
  console.log(`[pq-158.04 corpus] seed=${MEASURE_SEED} count=${count} pipeline=${rows.length} target=${BARK_CORPUS_TARGET}`);
  assert.equal(count, BARK_CORPUS_TARGET);
  assert.equal(rows.length, BARK_CORPUS_TARGET);
  const captions = new Set();
  for (const row of rows) {
    assert.equal(row.seed, MEASURE_SEED);
    assert.equal(row.caption, row.line, 'subtitle text is the spoken line');
    assert.ok(row.caption.length > 0);
    assert.ok(row.speech.f0 > 0);
    assert.ok(row.speech.rate > 0);
    assert.ok(row.radio.bandpassLo < row.radio.bandpassHi);
    assert.equal(row.recipeId, BARK_RECIPE_ID);
    assert.ok(FACTION_VOICE_REGISTERS[row.factionId], row.factionId);
    captions.add(row.caption);
  }
  assert.ok(captions.size >= 200, 'the corpus is not one line reused');
  assert.ok(recipeIdsHas(BARK_RECIPE_ID));
});

function recipeIdsHas(id) {
  return RECIPES.some((r) => r.id === id);
}

test('fourteen faction registers are distinct; mechanic is a fifteenth close-mic register', () => {
  assert.equal(BARK_FACTIONS.length, 14);
  assert.equal(Object.keys(FACTION_VOICE_REGISTERS).length, 14);
  assert.equal(factionRegistersAreDistinct(), true);
  const f0s = new Set(BARK_FACTIONS.map((id) => FACTION_VOICE_REGISTERS[id].f0));
  const rates = new Set(BARK_FACTIONS.map((id) => FACTION_VOICE_REGISTERS[id].rate));
  assert.ok(f0s.size >= 12, 'registers must sit on different fundamentals');
  assert.ok(rates.size >= 11, 'registers must speak at different cadences');
  // The authored invariant behind the blind-listen contract: every pair of registers sits
  // ≥5 Hz apart, and identifyRegisterFromPcm's <2.5 Hz tolerance makes cross-naming
  // mathematically impossible. A new register at 4 Hz off would silently degrade the guesser.
  const sorted = [...f0s].sort((a, b) => a - b);
  const minGap = Math.min(...sorted.slice(1).map((f, i) => f - sorted[i]));
  assert.ok(minGap >= 5, `register f0 min pairwise gap ${minGap} Hz under the 5 Hz no-cross-name floor`);
  assert.equal(MECHANIC_VOICE_REGISTER.id, 'mechanic');
  assert.notEqual(MECHANIC_VOICE_REGISTER.f0, FACTION_VOICE_REGISTERS.faction_scn.f0);
  const mechanic = enumerateMechanicPipeline();
  assert.equal(mechanic.length, MECHANIC_LINES.length);
  for (const row of mechanic) {
    assert.equal(row.mechanic, true);
    assert.equal(row.caption, row.line);
    assert.equal(row.registerId, 'mechanic');
  }
  console.log(`[pq-158.04 registers] ${BARK_FACTIONS.map((id) => `${id}:${FACTION_VOICE_REGISTERS[id].f0}Hz/${FACTION_VOICE_REGISTERS[id].rate}x`).join(' ')} mechanic:${MECHANIC_VOICE_REGISTER.f0}Hz`);
});

test('pipeline is deterministic and does not touch sim RNG', () => {
  const a = resolveBarkVoice({ factionId: 'faction_reach', situation: 'attack', line: 'Weapons free.' });
  const b = resolveBarkVoice({ factionId: 'faction_reach', situation: 'attack', line: 'Weapons free.' });
  assert.deepEqual(a, b);
  const quiet = resolveBarkVoice({ factionId: 'faction_quiet', situation: 'scan', line: 'Hold.' });
  const reach = resolveBarkVoice({ factionId: 'faction_reach', situation: 'scan', line: 'Hold.' });
  assert.notEqual(quiet.speech.f0, reach.speech.f0);
  assert.notEqual(quiet.speech.rate, reach.speech.rate);
  const corpusLine = barkFor('faction_scn', 'scan', 0);
  const fromCorpus = resolveBarkVoice({ factionId: 'faction_scn', situation: 'scan', line: corpusLine });
  assert.equal(fromCorpus.caption, corpusLine);
  for (const situation of BARK_SITUATIONS) {
    const row = resolveBarkVoice({ factionId: 'faction_free', situation });
    assert.equal(row.situation, situation);
  }
});

test('representative directed-voice samples exist for every register', () => {
  const ids = [...BARK_FACTIONS.map((id) => resolveVoiceRegister(id).sampleId), MECHANIC_VOICE_REGISTER.sampleId];
  for (const id of ids) {
    const entry = SAMPLE_MANIFEST.get(id);
    assert.ok(entry, `${id} missing from SAMPLE_MANIFEST`);
    const file = path.join(ROOT, entry.file);
    assert.ok(existsSync(file), `${id} missing ${entry.file}`);
    const buf = readFileSync(file);
    assert.equal(buf.toString('ascii', 0, 4), 'RIFF');
    assert.equal(buf.toString('ascii', 8, 12), 'WAVE');
  }
});

test('_onBarkVoice plays the radio recipe, uses the faction sample, and captions the line', () => {
  const plays = [];
  const captions = [];
  const host = Object.create(audio);
  host.play = (recipeId, opts) => { plays.push({ recipeId, opts }); return { recipeId }; };
  host.bus = { emit(ev, p) { captions.push({ ev, p }); } };
  host.rt = {};
  host._onBarkVoice({
    factionId: 'faction_choir',
    situation: 'warn',
    text: 'The Pattern sees you.',
  });
  const barkPlay = plays.find((row) => row.recipeId === BARK_RECIPE_ID);
  assert.ok(barkPlay, `expected a ${BARK_RECIPE_ID} play, got ${plays.map((p) => p.recipeId).join(',')}`);
  assert.equal(barkPlay.opts.barkSampleId, 'bark_choir');
  assert.equal(barkPlay.opts.critical, true);
  const cap = captions.find((c) => c.ev === 'presentation:caption');
  assert.ok(cap);
  assert.equal(cap.p.text, 'The Pattern sees you.');
  assert.equal(cap.p.shape, 'radio');
});

test('_onBarkVoice mechanic uses the close-mic register and captions the hull line', () => {
  const plays = [];
  const captions = [];
  const host = Object.create(audio);
  host.play = (recipeId, opts) => { plays.push({ recipeId, opts }); return { recipeId }; };
  host.bus = { emit(ev, p) { captions.push({ ev, p }); } };
  host.rt = {};
  host._onBarkVoice({
    mechanic: true,
    kind: 'mechanic',
    text: MECHANIC_LINES[0],
  });
  const barkPlay = plays.find((row) => row.recipeId === BARK_RECIPE_ID);
  assert.ok(barkPlay);
  assert.equal(barkPlay.opts.barkSampleId, 'bark_mechanic');
  const cap = captions.find((c) => c.ev === 'presentation:caption');
  assert.equal(cap.p.text, MECHANIC_LINES[0]);
});

test('_onDocked speaks the mechanic on the same directed-voice path', () => {
  const plays = [];
  const captions = [];
  const host = Object.create(audio);
  host.play = (recipeId, opts) => { plays.push({ recipeId, opts }); return { recipeId }; };
  host.bus = { emit(ev, p) { captions.push({ ev, p }); } };
  host.rt = {};
  host.state = {};
  host._syncEnvironmentMix = () => {};
  host._markMusicDirty = () => {};
  host._startStationHum = () => {};
  // The mechanic only speaks a filed fact now (d097ea0d8 — silence beats an invented scar);
  // a dockSpill row is the lightest real line the fixture can carry.
  host.state = { player: { cargo: { dockSpill: { commodityId: 'cmdty_ore_iron', count: 2 } } } };
  host._onDocked({ stationId: 'station_test' });
  const barkPlay = plays.find((row) => row.recipeId === BARK_RECIPE_ID);
  assert.ok(barkPlay, 'dock must speak the mechanic');
  assert.equal(barkPlay.opts.barkSampleId, 'bark_mechanic');
  const cap = captions.find((c) => c.ev === 'presentation:caption');
  assert.ok(cap && cap.p.text.length > 0);
});

test(`seed ${MEASURE_SEED}: f0/rate/filter names each faction register without the label`, () => {
  for (const factionId of BARK_FACTIONS) {
    const r = FACTION_VOICE_REGISTERS[factionId];
    const named = identifyRegisterFromSpeech({ f0: r.f0, rate: r.rate, filterHz: r.filterHz });
    assert.equal(named, factionId, `${factionId} must resolve from speech params, not from its label`);
  }
  assert.equal(identifyRegisterFromSpeech({ f0: 0, rate: 0, filterHz: 0 }), null);
  console.log(`[pq-158.04 blind-stand-in] seed=${MEASURE_SEED} 14/14 speech-params residual=no-stranger-headphones`);
});

test(`seed ${MEASURE_SEED}: the player's authored durations stay inside the spoken range`, () => {
  // Delivered artifacts are normalized to 1.4 s; the player hears resolved.speech.durationS
  // (authored per line, clamped [0.45, 4.8]). A durationS regression is invisible to the
  // byte-pinned gate — pin the range and real variance here instead.
  const rows = enumerateBarkPipeline();
  const durations = new Set();
  for (const row of rows) {
    const d = row.speech.durationS;
    assert.ok(d >= 0.45 && d <= 4.8, `${row.factionId}/${row.situation} durationS ${d} out of spoken range`);
    durations.add(d);
  }
  assert.ok(durations.size >= rows.length / 4, `corpus durations collapsed to ${durations.size} distinct values`);
});

test(`seed ${MEASURE_SEED}: all ${BARK_CORPUS_TARGET} directed-voice lines exist as WAVs on disk`, () => {
  const rows = enumerateDeliveredBarkWavs();
  assert.equal(rows.length, BARK_CORPUS_TARGET);
  // Literal pins: the naming scheme itself is the contract (4-digit positional index), not
  // just internal consistency — an assertion that re-derives the name can't fail.
  assert.equal(rows[0].file, 'assets/audio/voice/line_0000_faction_scn.wav');
  for (let i = 0; i < rows.length; i++) {
    assert.match(rows[i].file, /^assets\/audio\/voice\/line_\d{4}_[A-Za-z0-9_-]+\.wav$/);
    assert.equal(rows[i].file, deliveredBarkWavRelPath(i, rows[i].registerId));
    const file = path.join(ROOT, rows[i].file);
    assert.ok(existsSync(file), `missing delivered line ${rows[i].file}`);
    const buf = readFileSync(file);
    assert.equal(buf.toString('ascii', 0, 4), 'RIFF');
    assert.equal(buf.toString('ascii', 8, 12), 'WAVE');
    assert.ok(buf.byteLength > 44);
  }
  console.log(`[pq-158.04 delivered] seed=${MEASURE_SEED} wavs=${rows.length}/${BARK_CORPUS_TARGET}`);
});

test(`seed ${MEASURE_SEED}: delivered WAVs byte-match a fresh render — a stale corpus cannot hide`, () => {
  // Existence + RIFF magic alone can't see a renderer/register edit left unregenerated: the
  // files would still exist and still be WAVs. Re-render a deterministic spread (~1 row per
  // faction per third of the corpus) and byte-compare against the shipped artifacts.
  const pipeline = enumerateBarkPipeline();
  const stride = Math.ceil(pipeline.length / 42);
  const sampled = pipeline.filter((_, i) => i % stride === 0 || i === pipeline.length - 1);
  for (const [i, row] of sampled.entries()) {
    const index = pipeline.indexOf(row);
    const rel = deliveredBarkWavRelPath(index, row.registerId);
    const fresh = encodeWavPcm16(renderBarkUtterancePcm(row, { sampleRate: THEME_SAMPLE_RATE, seconds: DELIVERED_WAV_SECONDS }), THEME_SAMPLE_RATE);
    const onDisk = readFileSync(path.join(ROOT, rel));
    assert.deepEqual(onDisk, fresh, `${rel} is stale — regenerate via generate-bark-voice.mjs --all (sample ${i + 1}/${sampled.length})`);
  }
  console.log(`[pq-158.04 delivered-drift] seed=${MEASURE_SEED} sampled=${sampled.length}/${pipeline.length} byte-identical`);
});

test(`seed ${MEASURE_SEED}: delivered filename authority rejects unsafe segments`, () => {
  // The naming authority's guards are the fail-closed contract — a loose index or unsafe
  // registerId must throw, not emit a filename that escapes the positional scheme.
  assert.throws(() => deliveredBarkWavRelPath(1.5, 'faction_scn'), /integer 0-9999/);
  assert.throws(() => deliveredBarkWavRelPath(-1, 'faction_scn'), /integer 0-9999/);
  assert.throws(() => deliveredBarkWavRelPath(10000, 'faction_scn'), /integer 0-9999/);
  assert.throws(() => deliveredBarkWavRelPath(0, 'bad/../seg'), /safe filename segment/);
});

test(`seed ${MEASURE_SEED}: unlabeled callsign PCM names all fourteen registers (no filename, no label)`, () => {
  const shuffled = [...BARK_FACTIONS];
  // Deterministic shuffle from the seed, not Math.random.
  let s = MEASURE_SEED >>> 0;
  for (let i = shuffled.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    const tmp = shuffled[i];
    shuffled[i] = shuffled[j];
    shuffled[j] = tmp;
  }
  const named = [];
  for (const factionId of shuffled) {
    const pcm = renderRegisterCallsignPcm(FACTION_VOICE_REGISTERS[factionId]);
    const got = identifyRegisterFromPcm(pcm, 32000);
    assert.equal(got, factionId, `unlabeled ${factionId} callsign named ${got}`);
    named.push(got);
  }
  assert.equal(new Set(named).size, 14);
  console.log(`[pq-158.04 pcm-blind] seed=${MEASURE_SEED} order=${shuffled.join(',')} named=${named.join(',')}`);
});

test(`seed ${MEASURE_SEED}: unlabeled on-disk clips name fourteen registers without using filenames`, () => {
  const named = [];
  for (const clip of BLIND_REGISTER_CLIPS) {
    const buf = readFileSync(path.join(ROOT, clip.file));
    const got = identifyRegisterFromWavBuffer(buf);
    assert.equal(got, clip.factionId, `${clip.file} named ${got}, expected ${clip.factionId}`);
    named.push(got);
  }
  assert.equal(new Set(named).size, 14);
  console.log(`[pq-158.04 blind-files] seed=${MEASURE_SEED} named=${named.join(',')}`);
});

test(`seed ${MEASURE_SEED}: shipped utterance PCM names each faction register (no label)`, () => {
  const named = [];
  for (const factionId of BARK_FACTIONS) {
    const row = resolveBarkVoice({ factionId, situation: 'scan' });
    assert.equal(row.speech.f0, FACTION_VOICE_REGISTERS[factionId].f0);
    const pcm = renderBarkUtterancePcm(row, { sampleRate: 32000, seconds: BARK_UTTERANCE_SECONDS });
    const got = identifyRegisterFromPcm(pcm, 32000);
    assert.equal(got, factionId, `utterance ${factionId} named ${got}`);
    named.push(got);
  }
  assert.equal(new Set(named).size, 14);
  console.log(`[pq-158.04 utterance-pcm] seed=${MEASURE_SEED} named=${named.join(',')}`);
});

test(`seed ${MEASURE_SEED}: player-heard bark WAVs name fourteen registers from PCM, never from the filename`, () => {
  const named = [];
  for (const factionId of BARK_FACTIONS) {
    const sampleId = FACTION_VOICE_REGISTERS[factionId].sampleId;
    const entry = SAMPLE_MANIFEST.get(sampleId);
    const buf = readFileSync(path.join(ROOT, entry.file));
    const decoded = decodePcmWav(buf);
    assert.ok(decoded, entry.file);
    const got = identifyRegisterFromPcm(decoded.pcm, decoded.sampleRate);
    assert.equal(got, factionId, `${entry.file} named ${got}, expected ${factionId}`);
    named.push(got);
  }
  assert.equal(new Set(named).size, 14);
  console.log(`[pq-158.04 bark-wav-blind] seed=${MEASURE_SEED} named=${named.join(',')}`);
});
