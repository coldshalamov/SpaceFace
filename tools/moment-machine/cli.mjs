#!/usr/bin/env node
// Moment Machine CLI. Selection reads a real Adventure tape or an authoritative session.
// Encoding runs only when playback frames exist. Missing positions are reported.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { analyzeMomentStream, ingestStream } from '../../src/presentation/momentMachine/index.js';
import { writeBatch } from './batch.mjs';
import { runSession } from './sessions.mjs';
import { encodeMoment } from './encode.mjs';

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
  const tape = arg('tape', '');
  if (tape) {
    const input = JSON.parse(await readFile(tape, 'utf8'));
    const analysis = analyzeMomentStream(input);
    printSelection(analysis);
    return;
  }
  const seed = Number(arg('seed', ''));
  if (!Number.isInteger(seed) || seed <= 0) {
    process.stderr.write('select needs --tape or --seed\n');
    process.exitCode = 1;
    return;
  }
  const session = runSession(seed);
  process.stdout.write(`${JSON.stringify(session, null, 2)}\n`);
  if (!session.ok) process.exitCode = 1;
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
  const selection = analysis.selection || { ranked: [] };
  const top = selection.ranked && selection.ranked[0];
  const encodable = !!(analysis.plans && analysis.plans[0] && analysis.plans[0].exportSpan
    && analysis.plans[0].exportSpan.exportable === true && stream.positionSource !== 'none');
  process.stdout.write(`${JSON.stringify({
    positionSource: stream.positionSource,
    events: stream.events.map((event) => ({ id: event.id, kind: event.kind, tick: event.tick })),
    dropped: stream.dropped,
    ranked: selection.ranked.map((moment) => moment.shape),
    footage: top ? top.footage : null,
    encodable,
    videoVerified: false,
  }, null, 2)}\n`);
}

async function batch() {
  const outDir = path.resolve(arg('out', path.join('artifacts', 'moment-machine')));
  const index = await writeBatch(outDir, { cwd: process.cwd() });
  process.stdout.write(`${JSON.stringify({
    outDir,
    situations: index.situations,
    selectMs: index.selectMs,
    evidenceClass: index.evidenceClass,
    videoVerified: index.videoVerified,
    categoryCount: index.categoryCount,
    unselectedShapes: index.unselectedShapes,
    clipCount: index.clipCount,
    headedError: index.headedCapture && index.headedCapture.error,
  }, null, 2)}\n`);
}

async function exportOne() {
  const tape = arg('tape', '');
  const seedArg = arg('seed', '');
  let analysis = null;
  if (tape) {
    analysis = analyzeMomentStream(JSON.parse(await readFile(tape, 'utf8')));
  } else if (seedArg) {
    const session = runSession(Number(seedArg));
    process.stdout.write(`${JSON.stringify({
      ok: false,
      videoVerified: false,
      reason: session.positionSource === 'none' ? 'tape-positions-unrecorded' : 'playback-frames-required',
      ranked: session.ranked,
    }, null, 2)}\n`);
    process.exitCode = 2;
    return;
  } else {
    process.stderr.write('export needs --tape or --seed\n');
    process.exitCode = 1;
    return;
  }
  const plan = analysis.plans && analysis.plans[0];
  const stream = analysis.selection && analysis.selection.stream;
  const span = plan && plan.exportSpan;
  if (!plan || !span || span.exportable !== true || !stream || stream.positionSource === 'none') {
    process.stdout.write(`${JSON.stringify({
      ok: false,
      wroteFile: false,
      videoVerified: false,
      reason: stream && stream.positionSource === 'none' ? 'tape-positions-unrecorded' : (span && span.reason) || 'unrecorded',
      footage: analysis.selection && analysis.selection.ranked[0] ? analysis.selection.ranked[0].footage : null,
      ranked: analysis.selection ? analysis.selection.ranked.map((moment) => moment.shape) : [],
    }, null, 2)}\n`);
    process.exitCode = 2;
    return;
  }
  const outDir = path.resolve(arg('out', path.join('artifacts', 'moment-machine')));
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, 'export-refused.json');
  const encoded = await encodeMoment(plan, stream.samples, { outPath, framesArePlayback: false });
  await writeFile(outPath, JSON.stringify(encoded, null, 2));
  process.stdout.write(`${JSON.stringify(encoded, null, 2)}\n`);
  process.exitCode = 2;
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
} else {
  process.stdout.write(`moment-machine commands:
  select --seed N          one authoritative session
  select --tape file.json  rank a recorded Adventure tape
  ingest --tape file.json  report footage gaps; do not invent positions
  export --tape file.json  encode only real playback frames
  batch --out artifacts/moment-machine
`);
}
