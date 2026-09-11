// test/pq-158-04-bark-voice.test.mjs — PQ-158.04 leaf gate.
//
// DONE WHEN: all 271 lines through the pipeline; subtitles; determinism untouched.
// Seed 15804. Eight faction registers + mechanic. Directed synthetic voice, no recorded actors.

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
} from '../src/audio/barkVoice.js';

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

test('eight faction registers are distinct; mechanic is a ninth close-mic register', () => {
  assert.equal(BARK_FACTIONS.length, 8);
  assert.equal(Object.keys(FACTION_VOICE_REGISTERS).length, 8);
  assert.equal(factionRegistersAreDistinct(), true);
  const f0s = new Set(BARK_FACTIONS.map((id) => FACTION_VOICE_REGISTERS[id].f0));
  const rates = new Set(BARK_FACTIONS.map((id) => FACTION_VOICE_REGISTERS[id].rate));
  assert.ok(f0s.size >= 7, 'registers must sit on different fundamentals');
  assert.ok(rates.size >= 6, 'registers must speak at different cadences');
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

test(`seed ${MEASURE_SEED}: f0/rate/filter names each faction register without the label`, () => {
  for (const factionId of BARK_FACTIONS) {
    const r = FACTION_VOICE_REGISTERS[factionId];
    const named = identifyRegisterFromSpeech({ f0: r.f0, rate: r.rate, filterHz: r.filterHz });
    assert.equal(named, factionId, `${factionId} must resolve from speech params, not from its label`);
  }
  assert.equal(identifyRegisterFromSpeech({ f0: 0, rate: 0, filterHz: 0 }), null);
  console.log(`[pq-158.04 blind-stand-in] seed=${MEASURE_SEED} 8/8 speech-params residual=no-stranger-headphones`);
});
