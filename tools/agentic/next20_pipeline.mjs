#!/usr/bin/env node
/**
 * Next-N dispatch pipeline entry.
 *
 * Reads the live dispatcher (`node scripts/program-dispatch.mjs --ready`),
 * never a hand-built backlog. Groups overlapping write-sets so they run in
 * series. Prints implementer and teammate-review prompts. Integrates a unit
 * to `done` when the checks that catch the change passed and a reviewer
 * would ship it.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
  DEFAULT_COUNT,
  assertReceiptOnDisk,
  buildImplementerPrompt,
  buildReviewerPrompt,
  canIntegrate,
  compactUnit,
  applyReviewClose,
  formatPipelineLog,
  loadReadyFromDispatcher,
  patchDispatchUnitDone,
  patchDispatchUnitReady,
  receiptPathFor,
  selectSlate,
} from './next20_pipeline_lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const QUEUE_REL = path.join('design', 'program', 'roadmap', 'program-queue.json');

function fail(message, code = 2) {
  console.error(`next20-pipeline: ${message}`);
  process.exit(code);
}

function usage() {
  console.log(`Usage:
  node tools/agentic/next20_pipeline.mjs --run [--count N] [--frozen ID,ID] [--skip ID,ID] [--out DIR]
  node tools/agentic/next20_pipeline.mjs --schedule [--count N] [--frozen ID,ID]
  node tools/agentic/next20_pipeline.mjs --prompt --id PQ-XXX.YY [--wave 0|1]
  node tools/agentic/next20_pipeline.mjs --integrate --id PQ-XXX.YY [--receipt PATH] [--review JSON] [--tests-pass]
  node tools/agentic/next20_pipeline.mjs --reopen --id PQ-XXX.YY
  node tools/agentic/next20_pipeline.mjs --apply-reviews --reviews DIR [--tests-pass]

--run snapshots the live dispatcher. --prompt 0 is the implementer; --prompt 1 is one teammate look.
--integrate / --apply-reviews are the only writers of dispatch-unit state. A reviewer who would not
ship the work keeps the unit ready.`);
}

function csv(value) {
  if (!value || value === true) return [];
  return String(value).split(',').map((s) => s.trim()).filter(Boolean);
}

function parseJsonArg(value, label) {
  if (value == null || value === true || value === '') fail(`--${label} is required`);
  if (fs.existsSync(value)) {
    return JSON.parse(fs.readFileSync(value, 'utf8'));
  }
  return JSON.parse(String(value));
}

let values;
try {
  ({ values } = parseArgs({
    args: process.argv.slice(2),
    strict: true,
    allowPositionals: false,
    options: {
      help: { type: 'boolean', short: 'h' },
      run: { type: 'boolean' },
      schedule: { type: 'boolean' },
      prompt: { type: 'boolean' },
      integrate: { type: 'boolean' },
      reopen: { type: 'boolean' },
      'apply-reviews': { type: 'boolean' },
      reviews: { type: 'string' },
      count: { type: 'string' },
      frozen: { type: 'string' },
      skip: { type: 'string' },
      protect: { type: 'string' },
      out: { type: 'string' },
      id: { type: 'string' },
      wave: { type: 'string' },
      receipt: { type: 'string' },
      review: { type: 'string' },
      'tests-pass': { type: 'boolean' },
      root: { type: 'string' },
    },
  }));
} catch (error) {
  fail(error.message);
}

if (values.help) {
  usage();
  process.exit(0);
}

const root = values.root ? path.resolve(values.root) : ROOT;
const modes = [values.run, values.schedule, values.prompt, values.integrate, values.reopen, values['apply-reviews']].filter(Boolean).length;
if (modes !== 1) fail('choose exactly one of --run, --schedule, --prompt, --integrate, --reopen, --apply-reviews');

const count = values.count != null ? Number(values.count) : DEFAULT_COUNT;
if (!Number.isInteger(count) || count < 1) fail('--count must be a positive integer');

function selectNow() {
  const ready = loadReadyFromDispatcher(root);
  return {
    ready,
    selection: selectSlate(ready, {
      count,
      frozenIds: csv(values.frozen),
      skipIds: csv(values.skip),
      protectedPaths: csv(values.protect),
    }),
  };
}

if (values.schedule) {
  const { ready, selection } = selectNow();
  const payload = {
    source: selection.source,
    readyCount: ready.length,
    count: selection.count,
    slate: selection.slate.map(compactUnit),
    skipped: selection.skipped,
    families: selection.families.map((family) => ({
      id: family.id,
      serial: family.serial,
      ids: family.ids,
      sharedPaths: family.sharedPaths,
    })),
  };
  console.log(JSON.stringify(payload, null, 2));
  process.exit(0);
}

if (values.run) {
  const { ready, selection } = selectNow();
  const log = formatPipelineLog(selection);
  process.stdout.write(log);
  const outDir = values.out ? path.resolve(values.out) : null;
  if (outDir) {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'pipeline-run.log'), log);
    fs.writeFileSync(
      path.join(outDir, 'slate.txt'),
      `${selection.slate.map((u) => u.id).join('\n')}\n`,
    );
    fs.writeFileSync(
      path.join(outDir, 'schedule.json'),
      `${JSON.stringify({
        source: selection.source,
        readyCount: ready.length,
        slate: selection.slate.map(compactUnit),
        skipped: selection.skipped,
        families: selection.families.map((family) => ({
          id: family.id,
          serial: true,
          ids: family.ids,
          sharedPaths: family.sharedPaths,
        })),
      }, null, 2)}\n`,
    );
    for (const unit of selection.slate) {
      const dir = path.join(outDir, 'prompts', unit.id);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'implementer.txt'), `${buildImplementerPrompt(unit)}\n`);
      fs.writeFileSync(path.join(dir, 'reviewer.txt'), `${buildReviewerPrompt(unit, 1)}\n`);
    }
  }
  process.exit(0);
}

if (values.prompt) {
  const id = values.id;
  if (!id) fail('--id is required with --prompt');
  const ready = loadReadyFromDispatcher(root);
  const unit = ready.find((row) => row.id === id);
  if (!unit) fail(`unit ${id} is not in the live --ready list (already done, blocked, or unknown)`);
  const wave = values.wave == null ? 0 : Number(values.wave);
  if (wave === 0) process.stdout.write(`${buildImplementerPrompt(unit)}\n`);
  else if (wave === 1) process.stdout.write(`${buildReviewerPrompt(unit, 1)}\n`);
  else fail('--wave must be 0 (implementer) or 1 (one teammate look)');
  process.exit(0);
}

if (values.integrate) {
  const id = values.id;
  if (!id) fail('--id is required with --integrate');
  const receiptRel = values.receipt
    ? String(values.receipt).replaceAll('\\', '/')
    : receiptPathFor(id);
  let review = null;
  if (values.review) {
    review = parseJsonArg(values.review, 'review');
  }
  const receipt = assertReceiptOnDisk(root, receiptRel);
  const gate = canIntegrate({
    testsPass: !!values['tests-pass'],
    review,
  });
  if (!gate.ok) {
    console.log(JSON.stringify({ id, integrated: false, reason: gate.reason, notes: gate.notes || null }, null, 2));
    process.exit(1);
  }
  const queuePath = path.join(root, QUEUE_REL);
  const before = fs.readFileSync(queuePath, 'utf8');
  const after = patchDispatchUnitDone(before, id, receipt.ok ? receiptRel : '');
  if (after !== before) fs.writeFileSync(queuePath, after);
  console.log(JSON.stringify({ id, integrated: true, receipt: receipt.ok ? receiptRel : null, state: 'done' }, null, 2));
  process.exit(0);
}

if (values.reopen) {
  const id = values.id;
  if (!id) fail('--id is required with --reopen');
  const queuePath = path.join(root, QUEUE_REL);
  const before = fs.readFileSync(queuePath, 'utf8');
  const after = patchDispatchUnitReady(before, id);
  if (after !== before) fs.writeFileSync(queuePath, after);
  console.log(JSON.stringify({ id, reopened: true, state: 'ready' }, null, 2));
  process.exit(0);
}

if (values['apply-reviews']) {
  const reviewsDir = values.reviews ? path.resolve(values.reviews) : fail('--reviews DIR is required with --apply-reviews');
  if (!fs.existsSync(reviewsDir)) fail(`reviews dir missing: ${reviewsDir}`);
  const names = fs.readdirSync(reviewsDir).filter((n) => n.endsWith('-review.json'));
  const rows = [];
  let queueText = fs.readFileSync(path.join(root, QUEUE_REL), 'utf8');
  for (const name of names.sort()) {
    const id = name.replace(/-review\.json$/, '');
    const reviewPath = path.join(reviewsDir, `${id}-review.json`);
    const receiptRel = receiptPathFor(id);
    let review = { wouldShip: false, notes: 'missing review file' };
    try { review = JSON.parse(fs.readFileSync(reviewPath, 'utf8')); } catch { /* keep ready */ }
    const receipt = assertReceiptOnDisk(root, receiptRel);
    const gate = applyReviewClose(id, {
      testsPass: !!values['tests-pass'],
      review,
    });
    if (gate.ok) {
      queueText = patchDispatchUnitDone(queueText, id, receipt.ok ? receiptRel : '');
      rows.push({ id, verdict: 'DONE', reason: 'would ship; checks that catch the change passed' });
    } else {
      rows.push({
        id,
        verdict: 'NOT DONE',
        reason: gate.reason,
      });
    }
  }
  fs.writeFileSync(path.join(root, QUEUE_REL), queueText);
  const log = [
    'NEXT20 APPLY-REVIEWS',
    `reviews: ${reviewsDir}`,
    `units: ${rows.length}`,
    ...rows.map((row) => `${row.id} ${row.verdict} ${row.reason}`),
  ].join('\n');
  console.log(log);
  if (rows.some((row) => row.verdict === 'NOT DONE')) process.exit(1);
  process.exit(0);
}
