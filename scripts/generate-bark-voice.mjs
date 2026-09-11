#!/usr/bin/env node
// scripts/generate-bark-voice.mjs — PQ-158.04 directed synthetic voice pipeline.
//
// Agents run this. No recorded actors, no network. Speech is a seeded formant buzz through a
// radio bandpass. Default: catalog every bark line (271) + write one representative WAV per
// faction register and the mechanic. --all writes every line (heavy). --check verifies the
// representative set is on disk.
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
  MECHANIC_LINES,
  MECHANIC_VOICE_REGISTER,
  FACTION_VOICE_REGISTERS,
  countBarkCorpus,
  enumerateBarkPipeline,
  enumerateMechanicPipeline,
  resolveBarkVoice,
} from '../src/audio/barkVoice.js';
import { BARKS, BARK_FACTIONS } from '../src/data/barks.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'assets', 'audio', 'voice');
const SR = 32000;

const argv = process.argv.slice(2);
const checkOnly = argv.includes('--check');
const catalogOnly = argv.includes('--catalog');
const writeAll = argv.includes('--all');

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Biquad {
  constructor(type, f0, q, sr) {
    const w0 = (2 * Math.PI * Math.min(f0, sr * 0.49)) / sr;
    const cos = Math.cos(w0);
    const sin = Math.sin(w0);
    const alpha = sin / (2 * Math.max(0.1, q));
    let b0, b1, b2, a0, a1, a2;
    if (type === 'lp') {
      b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = b0;
      a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha;
    } else if (type === 'hp') {
      b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = b0;
      a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha;
    } else {
      b0 = alpha; b1 = 0; b2 = -alpha;
      a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha;
    }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0;
    this.a1 = a1 / a0; this.a2 = a2 / a0;
    this.x1 = this.x2 = this.y1 = this.y2 = 0;
  }
  process(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

function wavBytes(pcm) {
  const data = pcm.byteLength;
  const buf = Buffer.alloc(44 + data);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + data, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(data, 40);
  Buffer.from(pcm.buffer, pcm.byteOffset, data).copy(buf, 44);
  return buf;
}

function renderUtterance(resolved, maxSeconds = 1.05) {
  const rng = mulberry32(resolved.hash ^ 15804);
  const dur = maxSeconds;
  const n = Math.max(1, Math.round(dur * SR));
  const out = new Float64Array(n);
  const f0 = resolved.speech.f0;
  const formants = resolved.speech.formants.map((f) => new Biquad('bp', f, 8, SR));
  const radioLo = new Biquad('hp', resolved.radio.bandpassLo, 0.7, SR);
  const radioHi = new Biquad('lp', resolved.radio.bandpassHi, 0.7, SR);
  const words = resolved.line.trim().split(/\s+/).length;
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const env = Math.min(1, t / 0.02) * Math.min(1, (dur - t) / 0.06);
    const syllable = 0.55 + 0.45 * Math.abs(Math.sin(Math.PI * words * (t / dur)));
    const buzz = (phase % 1) < 0.12 ? 1 : -0.15;
    phase += f0 / SR;
    let s = buzz * 0.45;
    for (const f of formants) s = f.process(s);
    s = radioHi.process(radioLo.process(s));
    s += (rng() * 2 - 1) * resolved.radio.noise * 0.25;
    if (resolved.radio.drive) s = Math.tanh(s * (1 + resolved.radio.drive * 4));
    out[i] = s * env * syllable;
  }
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]));
  const norm = peak > 1e-9 ? 0.92 / peak : 0;
  const pcm = new Int16Array(n);
  for (let i = 0; i < n; i++) pcm[i] = Math.round(Math.max(-1, Math.min(1, out[i] * norm)) * 32767);
  return pcm;
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
    });
  }
  const mechanic = resolveBarkVoice({ mechanic: true, line: MECHANIC_LINES[0] });
  jobs.push({
    file: path.join(OUT_DIR, `${mechanic.sampleId}.wav`),
    rel: `assets/audio/voice/${mechanic.sampleId}.wav`,
    resolved: mechanic,
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
  }))
  : representativeJobs();

mkdirSync(OUT_DIR, { recursive: true });
let mismatches = [];
for (const job of jobs) {
  const bytes = wavBytes(renderUtterance(job.resolved, writeAll ? 1.4 : 1.05));
  if (checkOnly) {
    if (!existsSync(job.file)) { mismatches.push(`missing ${job.rel}`); continue; }
    const existing = readFileSync(job.file);
    if (!existing.equals(bytes)) mismatches.push(`drifted ${job.rel}`);
  } else {
    writeFileSync(job.file, bytes);
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
    + `wavs=${jobs.length}${checkOnly ? ' (verified)' : ''}`,
  );
  console.log(`mechanic register f0=${MECHANIC_VOICE_REGISTER.f0} captions=on`);
}
