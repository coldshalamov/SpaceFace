#!/usr/bin/env node
// Moment Machine CLI. Reads a moment stream or an Adventure tape and can encode the ranked batch.

import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { analyzeMomentStream, ingestStream } from '../../src/presentation/momentMachine/index.js';
import { situation, SITUATION_COUNT } from './situations.mjs';
import { rankSituations, writeBatch, chooseEncodeSet } from './batch.mjs';
import { encodeMoment, videoTooling } from './encode.mjs';

function arg(name, fallback) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((item) => item.startsWith(prefix));
  if (hit) return hit.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0 && process.argv[index + 1] && !process.argv[index + 1].startsWith('--')) {
    return process.argv[index + 1];
  }
  return fallback;
}

function command() {
  const value = process.argv[2];
  if (!value || value.startsWith('--')) return 'help';
  return value;
}

function printSelection(analysis) {
  const selection = analysis.selection || analysis;
  const ranked = selection.ranked || [];
  const lines = ranked.map((moment) => (
    `#${moment.rank} ${moment.shape} score=${moment.score.toFixed(3)} `
    + `ticks=${moment.inTick}-${moment.outTick} footage=${moment.footage.status} ${moment.reason}`
  ));
  if (!lines.length) lines.push('no moment selected');
  const rejected = (selection.rejected || []).map((row) => `reject ${row.reason}`);
  process.stdout.write(`${lines.concat(rejected).join('\n')}\n`);
}

async function selectOne() {
  const seed = Number(arg('seed', '1'));
  const tape = arg('tape', '');
  let input = situation(seed);
  if (tape) input = JSON.parse(await readFile(tape, 'utf8'));
  const analysis = analyzeMomentStream(input);
  printSelection(analysis);
  if (!analysis.ok || !analysis.selection || !analysis.selection.ranked.length) process.exitCode = 1;
}

async function ingestTape() {
  const tape = arg('tape', '');
  if (!tape) {
    process.stderr.write('missing --tape\n');
    process.exitCode = 1;
    return;
  }
  const raw = JSON.parse(await readFile(tape, 'utf8'));
  const stream = ingestStream(raw);
  const analysis = analyzeMomentStream(stream);
  process.stdout.write(`${JSON.stringify({
    positionSource: stream.positionSource,
    events: stream.events.map((event) => ({ id: event.id, kind: event.kind, tick: event.tick })),
    dropped: stream.dropped,
    ranked: analysis.selection ? analysis.selection.ranked.map((moment) => moment.shape) : [],
    footage: analysis.selection && analysis.selection.ranked[0] ? analysis.selection.ranked[0].footage : null,
  }, null, 2)}\n`);
}

async function batch() {
  const outDir = path.resolve(arg('out', path.join('tools', 'moment-machine', 'out')));
  const encode = arg('encode', 'true') !== 'false';
  const index = await writeBatch(outDir, { encode });
  process.stdout.write(`${JSON.stringify({
    outDir,
    situations: index.situations,
    selectMs: index.selectMs,
    boringRejected: index.boringRejected,
    featsSelected: index.featsSelected,
    sideEffectsSelected: index.sideEffectsSelected,
    categoryCount: index.categoryCount,
    categories: index.categories,
    clipCount: index.clipCount,
    videoVerified: index.videoVerified,
  }, null, 2)}\n`);
  if (encode && index.clipCount < 10) process.exitCode = 1;
}

async function exportOne() {
  const seed = Number(arg('seed', '1'));
  const outDir = path.resolve(arg('out', path.join('tools', 'moment-machine', 'out')));
  const format = arg('format', 'webm');
  const stream = situation(seed);
  const analysis = analyzeMomentStream(stream);
  const plan = analysis.plans && analysis.plans[0];
  if (!plan) {
    process.stderr.write('nothing to export\n');
    process.exitCode = 1;
    return;
  }
  await mkdir(outDir, { recursive: true });
  const extension = format === 'mp4' ? 'mp4' : 'webm';
  const outPath = path.join(outDir, `seed-${seed}-${plan.moment.shape}.${extension}`);
  const tooling = await videoTooling();
  const encoded = await encodeMoment(plan, analysis.selection.stream.samples, {
    outPath,
    format,
    tooling,
  });
  process.stdout.write(`${JSON.stringify({
    ok: encoded.ok,
    reason: encoded.reason || null,
    format: encoded.format || null,
    fallback: encoded.fallback || null,
    outPath: encoded.outPath || null,
    verified: encoded.verified || null,
    unverified: encoded.unverified === true,
  }, null, 2)}\n`);
  if (!encoded.ok) process.exitCode = encoded.unverified ? 3 : 1;
}

function summarize() {
  const ranked = rankSituations();
  const chosen = chooseEncodeSet(ranked.rows, 10);
  const shapes = [];
  for (let i = 0; i < chosen.length; i += 1) {
    if (!shapes.includes(chosen[i].moment.shape)) shapes.push(chosen[i].moment.shape);
  }
  process.stdout.write(`${JSON.stringify({
    situations: SITUATION_COUNT,
    selectMs: ranked.elapsedMs,
    encodeSet: chosen.map((item) => ({ seed: item.seed, shape: item.moment.shape, tone: item.tone })),
    categories: shapes,
  }, null, 2)}\n`);
}

const action = command();
if (action === 'select') {
  selectOne();
} else if (action === 'ingest') {
  ingestTape();
} else if (action === 'batch') {
  batch();
} else if (action === 'export') {
  exportOne();
} else if (action === 'summary') {
  summarize();
} else {
  process.stdout.write(`moment-machine commands:
  select --seed N
  select --tape file.json
  ingest --tape file.json
  summary
  export --seed N --out dir [--format webm|mp4]
  batch --out dir [--encode true|false]
`);
}
