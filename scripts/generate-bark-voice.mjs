#!/usr/bin/env node
// scripts/generate-bark-voice.mjs — PQ-158.04 directed synthetic voice pipeline.
//
// Agents run this. No recorded actors, no network. Speech is the shipped renderer in
// src/audio/barkVoice.js (glottal identity + formants + radio). Default: one representative
// WAV per faction register and the mechanic, plus unlabeled blind callsigns. --all writes
// every corpus line. --check verifies bytes against the shipped renderer.
//
//   node scripts/generate-bark-voice.mjs
//   node scripts/generate-bark-voice.mjs --check
//   node scripts/generate-bark-voice.mjs --catalog
//   node scripts/generate-bark-voice.mjs --all

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  BARK_CORPUS_TARGET,
  BARK_UTTERANCE_SECONDS,
  MECHANIC_LINES,
  MECHANIC_VOICE_REGISTER,
  FACTION_VOICE_REGISTERS,
  BLIND_REGISTER_CLIPS,
  countBarkCorpus,
  enumerateBarkPipeline,
  enumerateMechanicPipeline,
  resolveBarkVoice,
  renderBarkUtterancePcm,
  renderRegisterCallsignPcm,
} from '../src/audio/barkVoice.js';
import { encodeWavPcm16, THEME_SAMPLE_RATE } from '../src/audio/themeCompose.js';
import { BARKS, BARK_FACTIONS } from '../src/data/barks.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'assets', 'audio', 'voice');
const SR = THEME_SAMPLE_RATE;

const argv = process.argv.slice(2);
const checkOnly = argv.includes('--check');
const catalogOnly = argv.includes('--catalog');
const writeAll = argv.includes('--all');

function wavFromPcm(pcm) {
  return encodeWavPcm16(pcm, SR);
}

function representativeLine(factionId) {
  const pack = BARKS[factionId];
  const lines = pack && pack.scan;
  return (lines && lines[0]) || 'Channel open.';
}

function representativeJobs() {
  const jobs = [];
  for (const factionId of BARK_FACTIONS) {
    const line = representativeLine(factionId);
    const resolved = resolveBarkVoice({ factionId, situation: 'scan', line });
    jobs.push({
      file: path.join(OUT_DIR, `${resolved.sampleId}.wav`),
      rel: `assets/audio/voice/${resolved.sampleId}.wav`,
      resolved,
      seconds: BARK_UTTERANCE_SECONDS,
    });
  }
  const mechanic = resolveBarkVoice({ mechanic: true, line: MECHANIC_LINES[0] });
  jobs.push({
    file: path.join(OUT_DIR, `${mechanic.sampleId}.wav`),
    rel: `assets/audio/voice/${mechanic.sampleId}.wav`,
    resolved: mechanic,
    seconds: BARK_UTTERANCE_SECONDS,
  });
  return jobs;
}

const corpus = countBarkCorpus();
const pipeline = enumerateBarkPipeline();
const mechanic = enumerateMechanicPipeline();

if (corpus !== BARK_CORPUS_TARGET || pipeline.length !== BARK_CORPUS_TARGET) {
  console.error(`bark corpus ${corpus} / pipeline ${pipeline.length}, expected ${BARK_CORPUS_TARGET}`);
  process.exitCode = 1;
}

if (catalogOnly) {
  console.log(`PQ-158.04 catalog seed=${15804} lines=${pipeline.length} mechanic=${mechanic.length}`);
  for (const row of pipeline) {
    console.log(`${row.factionId}\t${row.situation}\t${row.speech.f0}\t${row.speech.rate}\t${row.caption}`);
  }
  process.exit(process.exitCode || 0);
}

const jobs = writeAll
  ? pipeline.map((row, i) => ({
    file: path.join(OUT_DIR, `line_${String(i).padStart(3, '0')}_${row.registerId}.wav`),
    rel: `assets/audio/voice/line_${String(i).padStart(3, '0')}_${row.registerId}.wav`,
    resolved: row,
    seconds: 1.4,
  }))
  : representativeJobs();

mkdirSync(OUT_DIR, { recursive: true });
const mismatches = [];
for (const job of jobs) {
  const bytes = wavFromPcm(renderBarkUtterancePcm(job.resolved, { sampleRate: SR, seconds: job.seconds }));
  if (checkOnly) {
    if (!existsSync(job.file)) { mismatches.push(`missing ${job.rel}`); continue; }
    const existing = readFileSync(job.file);
    if (!existing.equals(bytes)) mismatches.push(`drifted ${job.rel}`);
  } else {
    writeFileSync(job.file, bytes);
  }
}

const blindDir = path.join(OUT_DIR, 'blind');
mkdirSync(blindDir, { recursive: true });
for (const clip of BLIND_REGISTER_CLIPS) {
  const register = FACTION_VOICE_REGISTERS[clip.factionId];
  const pcm = renderRegisterCallsignPcm(register, { sampleRate: SR });
  const bytes = wavFromPcm(pcm);
  const file = path.join(ROOT, clip.file);
  if (checkOnly) {
    if (!existsSync(file)) mismatches.push(`missing ${clip.file}`);
    else if (!readFileSync(file).equals(bytes)) mismatches.push(`drifted ${clip.file}`);
  } else {
    writeFileSync(file, bytes);
  }
}

if (mismatches.length) {
  console.error(`bark voice tree does not match the pipeline (${mismatches.length}):`);
  for (const m of mismatches) console.error(`  ${m}`);
  process.exitCode = 1;
} else {
  console.log(
    `PQ-158.04 seed=15804 corpus=${pipeline.length}/${BARK_CORPUS_TARGET} `
    + `registers=${Object.keys(FACTION_VOICE_REGISTERS).length} mechanic=${mechanic.length} `
    + `wavs=${jobs.length} blind=${BLIND_REGISTER_CLIPS.length}${checkOnly ? ' (verified)' : ''}`,
  );
  console.log(`mechanic register f0=${MECHANIC_VOICE_REGISTER.f0} captions=on`);
}
