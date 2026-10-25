#!/usr/bin/env node
// scripts/generate-bark-voice.mjs — PQ-158.04 directed synthetic voice pipeline.
//
// Agents run this. No recorded actors, no network. Speech is the shipped renderer in
// src/audio/barkVoice.js (glottal identity + formants + radio). Default: one representative
// WAV per faction register plus the mechanic and instructor, plus unlabeled blind callsigns.
// --all writes every corpus line. --check verifies bytes against the shipped renderer.
//
//   node scripts/generate-bark-voice.mjs
//   node scripts/generate-bark-voice.mjs --check
//   node scripts/generate-bark-voice.mjs --catalog
//   node scripts/generate-bark-voice.mjs --all
//   node scripts/generate-bark-voice.mjs --all --check
//
// --all writes every corpus line plus the runtime representative clips (bark_* registers,
// mechanic, instructor) and the blind callsigns. --all --check byte-verifies all of them and
// audits the whole voice tree for stray files the pipeline no longer owns (npm run
// check:bark-voice-corpus); --all --prune deletes strays instead of only failing on them.

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  BARK_CORPUS_TARGET,
  BARK_VOICE_SEED,
  BARK_UTTERANCE_SECONDS,
  DELIVERED_WAV_SECONDS,
  MECHANIC_LINES,
  MECHANIC_VOICE_REGISTER,
  FACTION_VOICE_REGISTERS,
  INSTRUCTOR_LINES,
  BLIND_REGISTER_CLIPS,
  countBarkCorpus,
  deliveredBarkWavRelPath,
  enumerateBarkPipeline,
  enumerateMechanicPipeline,
  resolveBarkVoice,
  resolveInstructorVoice,
  renderBarkUtterancePcm,
  renderRegisterCallsignPcm,
} from '../src/audio/barkVoice.js';
import { encodeWavPcm16, THEME_SAMPLE_RATE } from '../src/audio/themeCompose.js';
import { BARKS, BARK_FACTIONS } from '../src/data/barks.js';
import { auditExpectedTree } from './lib/treeAudit.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'assets', 'audio', 'voice');
const SR = THEME_SAMPLE_RATE;

const argv = process.argv.slice(2);
const checkOnly = argv.includes('--check');
const catalogOnly = argv.includes('--catalog');
const writeAll = argv.includes('--all');
// --prune deletes flagged strays instead of failing on them; only meaningful with --all,
// and only ever deletes files the pipeline provably does not own under voice/. It is
// disabled under --check so the verify-only mode never mutates the tree.
const pruneStrays = argv.includes('--prune') && !checkOnly;
if (argv.includes('--prune') && (!writeAll || checkOnly)) {
  console.error('--prune only applies to --all without --check');
  process.exit(2);
}

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
  const instructor = resolveInstructorVoice(INSTRUCTOR_LINES[0]);
  jobs.push({
    file: path.join(OUT_DIR, `${instructor.sampleId}.wav`),
    rel: `assets/audio/voice/${instructor.sampleId}.wav`,
    resolved: instructor,
    seconds: BARK_UTTERANCE_SECONDS,
  });
  return jobs;
}

const corpus = countBarkCorpus();
const pipeline = enumerateBarkPipeline();
const mechanic = enumerateMechanicPipeline();

if (corpus !== BARK_CORPUS_TARGET || pipeline.length !== BARK_CORPUS_TARGET) {
  console.error(`bark corpus ${corpus} / pipeline ${pipeline.length}, expected ${BARK_CORPUS_TARGET}`);
  process.exit(1); // fail fast — rendering the full job set against a drifted corpus is wasted work
}

if (catalogOnly) {
  console.log(`PQ-158.04 catalog seed=${BARK_VOICE_SEED} lines=${pipeline.length} mechanic=${mechanic.length}`);
  for (const row of pipeline) {
    console.log(`${row.factionId}\t${row.situation}\t${row.speech.f0}\t${row.speech.rate}\t${row.caption}`);
  }
  process.exit(0);
}

// --all covers the corpus rows AND the runtime representative clips (bark_* register files,
// mechanic, instructor), so a lone `--all --check` is a complete voice-tree audit.
const jobs = (writeAll
  ? pipeline.map((row, i) => {
    const rel = deliveredBarkWavRelPath(i, row.registerId);
    return {
      file: path.join(ROOT, rel),
      rel,
      resolved: row,
      seconds: DELIVERED_WAV_SECONDS,
    };
  })
  : []).concat(representativeJobs());

if (!checkOnly) mkdirSync(OUT_DIR, { recursive: true });
const mismatches = [];
let wrote = 0;
// Write only drifted/missing files — an unchanged byte-for-byte WAV keeps its mtime, so a
// regeneration that changes nothing doesn't churn the whole tree's timestamps.
for (const job of jobs) {
  const bytes = wavFromPcm(renderBarkUtterancePcm(job.resolved, { sampleRate: SR, seconds: job.seconds }));
  if (checkOnly) {
    if (!existsSync(job.file)) { mismatches.push(`missing ${job.rel}`); continue; }
    const existing = readFileSync(job.file);
    if (!existing.equals(bytes)) mismatches.push(`drifted ${job.rel}`);
  } else {
    if (!existsSync(job.file) || !readFileSync(job.file).equals(bytes)) { writeFileSync(job.file, bytes); wrote++; }
  }
}

const blindDir = path.join(OUT_DIR, 'blind');
if (!checkOnly) mkdirSync(blindDir, { recursive: true });
for (const clip of BLIND_REGISTER_CLIPS) {
  const register = FACTION_VOICE_REGISTERS[clip.factionId];
  const pcm = renderRegisterCallsignPcm(register, { sampleRate: SR });
  const bytes = wavFromPcm(pcm);
  const file = path.join(ROOT, clip.file);
  if (checkOnly) {
    if (!existsSync(file)) mismatches.push(`missing ${clip.file}`);
    else if (!readFileSync(file).equals(bytes)) mismatches.push(`drifted ${clip.file}`);
  } else {
    if (!existsSync(file) || !readFileSync(file).equals(bytes)) { writeFileSync(file, bytes); wrote++; }
  }
}

// Stray audit: --all fails on any stray WAV in the voice tree — stale line_* names, a renamed
// register's old bark_* clip, or an orphan under voice/blind/. It runs in write mode too: a
// renumber leaves orphans at the point of cause, not at the next --check. Scoped to .wav so
// OS debris (Thumbs.db, .gitkeep) isn't counted as corpus drift; expected paths are
// OUT_DIR-relative so a future nested delivered layout audits correctly.
if (writeAll) {
  const expected = new Set(jobs.map((j) => path.relative(OUT_DIR, j.file).replace(/\\/g, '/')));
  for (const c of BLIND_REGISTER_CLIPS) expected.add(`blind/${path.basename(c.file)}`);
  for (const rel of auditExpectedTree(OUT_DIR, expected, { prune: pruneStrays, extensions: /\.wav$/i })) {
    if (pruneStrays) console.log(`pruned stray assets/audio/voice/${rel}`);
    else mismatches.push(`stray assets/audio/voice/${rel}`);
  }
}

if (mismatches.length) {
  console.error(`bark voice tree does not match the pipeline (${mismatches.length}):`);
  for (const m of mismatches) console.error(`  ${m}`);
  process.exitCode = 1;
} else {
  console.log(
    `PQ-158.04 seed=${BARK_VOICE_SEED} corpus=${pipeline.length}/${BARK_CORPUS_TARGET} `
    + `registers=${Object.keys(FACTION_VOICE_REGISTERS).length} mechanic=${mechanic.length} `
    + `wavs=${jobs.length} blind=${BLIND_REGISTER_CLIPS.length}`
    + (checkOnly ? ' (verified)' : ` written=${wrote} unchanged=${jobs.length + BLIND_REGISTER_CLIPS.length - wrote}`),
  );
  console.log(`mechanic register f0=${MECHANIC_VOICE_REGISTER.f0} captions=on`);
}
