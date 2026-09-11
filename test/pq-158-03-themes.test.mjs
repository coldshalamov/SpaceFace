// test/pq-158-03-themes.test.mjs — PQ-158.03 leaf gate.
//
// DONE WHEN: a stranger hums the travel theme; a per-sector bed is identified blind.
// Seed 15803. Four state themes with motifs, per-sector beds, faction stings via the Band.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { MUSIC_STEMS } from '../src/data/audioRecipes.js';
import { BAND_BED_PROFILES } from '../src/audio/bandBeds.js';
import { SAMPLE_MANIFEST } from '../src/audio/sampleLibrary.js';
import {
  THEME_MATRIX_SEED,
  THEME_STATES,
  THEME_MOTIFS,
  TRAVEL_MOTIF,
  SECTOR_BEDS,
  FACTION_STINGS,
  THEME_STEM_WEIGHTS,
  resolveThemeMatrix,
  resolveThemeState,
  resolveSectorBed,
  resolveFactionSting,
  themeMotifsAreDistinct,
  intervalSignature,
  identifyThemeFromIntervals,
  identifySectorBedFromSignature,
  sectorBedToBandIntent,
} from '../src/audio/themeMatrix.js';
import {
  THEME_SAMPLE_RATE,
  THEME_ASSETS,
  AUTHORED_STEM_SAMPLES,
  renderMotifLeadPcm,
  renderSectorBedPcm,
  humMelodyFromPcm,
  describeBedFromPcm,
  identifySectorBedFromPcm,
  decodePcmWav,
} from '../src/audio/themeCompose.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const MEASURE_SEED = 15803;

test(`seed ${MEASURE_SEED}: four state themes, each with a hummable motif and authored stem weights`, () => {
  assert.deepEqual([...THEME_STATES], ['travel', 'combat', 'station', 'wanted']);
  const distinct = themeMotifsAreDistinct();
  assert.equal(distinct.motifs, true);
  assert.equal(distinct.beds, true);
  assert.equal(distinct.stings, true);
  for (const state of THEME_STATES) {
    const motif = THEME_MOTIFS[state];
    assert.ok(motif.notes.length >= 4, `${state} motif must be hummable (>=4 notes)`);
    assert.ok(motif.hummable.split(' ').length >= 4);
    assert.ok(THEME_STEM_WEIGHTS[state][motif.stem] >= 0.9, `${state} must drive its own stem`);
    const stem = MUSIC_STEMS.find((row) => row.themeState === state);
    assert.ok(stem, `${state} must be named on a MUSIC_STEMS row`);
    assert.equal(stem.motif, motif.hummable);
  }
  console.log(`[pq-158.03 themes] seed=${MEASURE_SEED} travel="${TRAVEL_MOTIF.hummable}" combat="${THEME_MOTIFS.combat.hummable}" station="${THEME_MOTIFS.station.hummable}" wanted="${THEME_MOTIFS.wanted.hummable}"`);
});

test('a stranger can hum the travel theme: rising A-minor arpeggio to the octave', () => {
  assert.equal(TRAVEL_MOTIF.hummable, 'A C E A');
  assert.deepEqual([...TRAVEL_MOTIF.notes], ['A', 'C', 'E', 'A']);
  assert.equal(TRAVEL_MOTIF.steps.length, 4);
  assert.equal(TRAVEL_MOTIF.key, 'Am');
  assert.equal(TRAVEL_MOTIF.stem, 'A');
  const intervals = [];
  const semitone = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  for (let i = 1; i < TRAVEL_MOTIF.notes.length; i++) {
    const a = TRAVEL_MOTIF.notes[i - 1];
    const b = TRAVEL_MOTIF.notes[i];
    const octA = TRAVEL_MOTIF.octaves[i - 1];
    const octB = TRAVEL_MOTIF.octaves[i];
    intervals.push((octB * 12 + semitone[b]) - (octA * 12 + semitone[a]));
  }
  assert.deepEqual(intervals, [3, 4, 5], 'minor third, major third, perfect fourth — the outbound climb');
  const travel = resolveThemeMatrix({ docked: false, wanted: false, threat: 0 });
  assert.equal(travel.state, 'travel');
  assert.equal(travel.hummable, 'A C E A');
  assert.equal(travel.seed, MEASURE_SEED);
});

test('per-sector beds are identifiable blind: unique hz/wave/noise per named sector', () => {
  const ids = Object.keys(SECTOR_BEDS);
  assert.ok(ids.length >= 10, 'the ten campaign sectors each need a bed');
  const signatures = new Set();
  const labels = [];
  for (const id of ids) {
    const bed = resolveSectorBed(id);
    assert.equal(bed.id, SECTOR_BEDS[id].id);
    assert.ok(bed.hzA > 0 && bed.hzB > bed.hzA);
    signatures.add(bed.signature);
    labels.push(`${id}:${bed.hzA}/${bed.waveA}`);
  }
  assert.equal(signatures.size, ids.length, 'two sectors share a bed — cannot identify blind');
  const helios = resolveSectorBed('sector_helios_prime');
  const sker = resolveSectorBed('sector_sker_haven');
  const ash = resolveSectorBed('sector_ashfall_reach');
  assert.ok(helios.hzA > sker.hzA || helios.waveA !== sker.waveA);
  assert.ok(ash.noise > helios.noise, 'Ashfall is the noisy edge; Helios is the quiet core');
  console.log(`[pq-158.03 beds] ${labels.join(' | ')}`);
});

test('faction stings ride the Band: eight unique profiles a stranger can tell apart', () => {
  const ids = Object.keys(FACTION_STINGS);
  assert.equal(ids.length, 8);
  const signatures = new Set();
  for (const id of ids) {
    const sting = resolveFactionSting(id);
    assert.ok(sting.profile, `${id} must resolve a Band profile`);
    assert.ok(BAND_BED_PROFILES[sting.profileKey], `${id} Band profile ${sting.profileKey} missing`);
    signatures.add(sting.signature);
  }
  assert.equal(signatures.size, 8);
});

test('adaptive matrix: travel / combat / station / wanted from the live snapshot', () => {
  assert.equal(resolveThemeState({}), 'travel');
  assert.equal(resolveThemeState({ docked: true }), 'station');
  assert.equal(resolveThemeState({ wanted: true }), 'wanted');
  assert.equal(resolveThemeState({ inCombat: true }), 'combat');
  assert.equal(resolveThemeState({ threat: 0.7 }), 'combat');
  const station = resolveThemeMatrix({ docked: true, sectorId: 'sector_helios_prime' });
  assert.equal(station.state, 'station');
  assert.equal(station.musicState, 'docked');
  assert.equal(station.bed.id, 'bed_helios');
  const wanted = resolveThemeMatrix({ wanted: true, factionId: 'faction_reach' });
  assert.equal(wanted.state, 'wanted');
  assert.equal(wanted.sting.label, 'Reach');
  assert.equal(wanted.stemWeights.B, 1);
  const combat = resolveThemeMatrix({ inCombat: true, sectorId: 'sector_sker_haven' });
  assert.equal(combat.state, 'combat');
  assert.equal(combat.bed.id, 'bed_sker');
  assert.equal(combat.stemWeights.C, 1);
});

test(`seed ${MEASURE_SEED}: interval shape names travel without reading the hummable label`, () => {
  const travelSig = intervalSignature(['A', 'C', 'E', 'A']);
  const combatSig = intervalSignature(['A', 'E', 'A', 'C']);
  const stationSig = intervalSignature(['C', 'E', 'G', 'B']);
  const wantedSig = intervalSignature(['A', 'Bb', 'A', 'E']);
  assert.equal(identifyThemeFromIntervals(travelSig), 'travel');
  assert.equal(identifyThemeFromIntervals(combatSig), 'combat');
  assert.equal(identifyThemeFromIntervals(stationSig), 'station');
  assert.equal(identifyThemeFromIntervals(wantedSig), 'wanted');
  assert.notEqual(travelSig, combatSig);
  assert.notEqual(travelSig, stationSig);
  assert.equal(identifyThemeFromIntervals('9,9,9'), null);
  const helios = identifySectorBedFromSignature(SECTOR_BEDS.sector_helios_prime.signature);
  const sker = identifySectorBedFromSignature(SECTOR_BEDS.sector_sker_haven.signature);
  assert.equal(helios, 'sector_helios_prime');
  assert.equal(sker, 'sector_sker_haven');
  assert.notEqual(helios, sker);
  assert.equal(identifySectorBedFromSignature('no-such-bed'), null);
  console.log(`[pq-158.03 interval-shape] seed=${MEASURE_SEED} travelSig=${travelSig} helios=${helios}`);
});

test(`seed ${MEASURE_SEED}: a stranger hums the travel theme from PCM (never reads the hummable label)`, () => {
  const pcm = renderMotifLeadPcm(TRAVEL_MOTIF);
  const hummed = humMelodyFromPcm(pcm, THEME_SAMPLE_RATE);
  assert.deepEqual(hummed, ['A', 'C', 'E', 'A'], `stranger hummed ${hummed.join(' ') || '(silence)'}`);
  assert.equal(THEME_MOTIFS.travel.hummable.split(' ').join(' '), hummed.join(' '));
  console.log(`[pq-158.03 stranger-hum] seed=${MEASURE_SEED} hummed="${hummed.join(' ')}" windows=${hummed.length}`);
});

test('per-sector beds identified blind from PCM: Helios is the warm sine, Sker the saw growl', () => {
  const heliosPcm = renderSectorBedPcm(resolveSectorBed('sector_helios_prime'));
  const skerPcm = renderSectorBedPcm(resolveSectorBed('sector_sker_haven'));
  const helios = describeBedFromPcm(heliosPcm, THEME_SAMPLE_RATE);
  const sker = describeBedFromPcm(skerPcm, THEME_SAMPLE_RATE);
  assert.equal(helios.character, 'warm-sine', `Helios described as ${helios.character} f0=${helios.f0.toFixed(1)} noise=${helios.noise.toFixed(3)}`);
  assert.equal(sker.character, 'saw-growl', `Sker described as ${sker.character} f0=${sker.f0.toFixed(1)} noise=${sker.noise.toFixed(3)}`);
  assert.ok(Math.abs(helios.f0 - 82.4) < 4, `Helios f0 ${helios.f0}`);
  assert.ok(Math.abs(sker.f0 - 72) < 6, `Sker f0 ${sker.f0}`);
  assert.equal(identifySectorBedFromPcm(heliosPcm, THEME_SAMPLE_RATE), 'sector_helios_prime');
  assert.equal(identifySectorBedFromPcm(skerPcm, THEME_SAMPLE_RATE), 'sector_sker_haven');
  const ash = describeBedFromPcm(renderSectorBedPcm(resolveSectorBed('sector_ashfall_reach')), THEME_SAMPLE_RATE);
  assert.ok(ash.noise > helios.noise, `Ashfall noise ${ash.noise.toFixed(3)} must exceed Helios ${helios.noise.toFixed(3)}`);
  let named = 0;
  for (const sectorId of Object.keys(SECTOR_BEDS)) {
    const pcm = renderSectorBedPcm(resolveSectorBed(sectorId));
    if (identifySectorBedFromPcm(pcm, THEME_SAMPLE_RATE) === sectorId) named += 1;
  }
  assert.equal(named, Object.keys(SECTOR_BEDS).length, `blind bed names ${named}/${Object.keys(SECTOR_BEDS).length}`);
  console.log(`[pq-158.03 blind-bed] Helios ${helios.character} ${helios.f0.toFixed(1)}Hz n=${helios.noise.toFixed(3)} | Sker ${sker.character} ${sker.f0.toFixed(1)}Hz n=${sker.noise.toFixed(3)} | named ${named}/${Object.keys(SECTOR_BEDS).length}`);
});

test('the adaptive matrix drives authored stems; Band intent carries the sector voice', () => {
  for (const state of THEME_STATES) {
    const stem = MUSIC_STEMS.find((row) => row.themeState === state);
    assert.ok(stem, `${state} stem missing`);
    assert.equal(stem.authoredSampleId, AUTHORED_STEM_SAMPLES[state]);
    assert.ok(SAMPLE_MANIFEST.has(stem.authoredSampleId), `${state} authored sample not in the library`);
  }
  const helios = sectorBedToBandIntent(resolveSectorBed('sector_helios_prime'));
  const sker = sectorBedToBandIntent(resolveSectorBed('sector_sker_haven'));
  assert.equal(helios.bed.waveA, 'sine');
  assert.equal(sker.bed.waveA, 'sawtooth');
  assert.ok(sker.bed.noise > helios.bed.noise);
  assert.notEqual(helios.bed.kind, sker.bed.kind);
});

test(`seed ${MEASURE_SEED}: authored travel WAV is the phrase a stranger hums`, () => {
  const entry = SAMPLE_MANIFEST.get('theme_travel');
  assert.ok(entry, 'theme_travel missing from SAMPLE_MANIFEST');
  const file = path.join(ROOT, entry.file);
  assert.ok(existsSync(file), `missing ${entry.file}`);
  const decoded = decodePcmWav(readFileSync(file));
  assert.ok(decoded, 'theme_travel is not a PCM WAV');
  const hummed = humMelodyFromPcm(decoded.pcm, decoded.sampleRate);
  assert.deepEqual(hummed, ['A', 'C', 'E', 'A'], `authored stem hummed ${hummed.join(' ') || '(silence)'}`);
  for (const asset of THEME_ASSETS) {
    const row = SAMPLE_MANIFEST.get(asset.id);
    assert.ok(row, `${asset.id} missing from SAMPLE_MANIFEST`);
    assert.ok(existsSync(path.join(ROOT, row.file)), `${asset.id} file missing`);
  }
  console.log(`[pq-158.03 authored-stem] seed=${MEASURE_SEED} file=${entry.file} hummed="${hummed.join(' ')}" assets=${THEME_ASSETS.length}`);
});
