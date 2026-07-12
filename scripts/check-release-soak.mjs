#!/usr/bin/env node
// Milestone 6 — headless release-soak harness (SPEC2/08 §6.1 / ALPHA M6).
//
// Drives real fixed-step systems through a representative long session:
//   new game → flight → tether/mining/combat → economy → dock/undock →
//   map/jump → save/reload → death/recovery → continued play
//
// Modes:
//   --quick   Deterministic CI path (default). Short sim, full phase coverage.
//   --full    Accelerated 30–60 sim-minute soak (multi-seed when default seeds used).
//
// Optional:
//   --seed N          Override seed (single-seed campaign).
//   --json            Print full receipt JSON to stdout.
//   --receipt <path>  Write primary receipt JSON (default under .devshots/spec2/).
//
// Never launches Browser/Electron/Chrome/Edge. Never claims browser GPU FPS.
// Owns only processes it starts (headless path starts none).

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  formatReceiptSummary,
  RELEASE_SOAK_RECEIPT_SCHEMA,
} from './lib/releaseSoakReceipts.mjs';
import {
  runReleaseSoakCampaign,
  createProcessRegistry,
  modeConfig,
} from './lib/releaseSoakSession.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const DEFAULT_RECEIPT_DIR = path.join(ROOT, '.devshots', 'spec2');

const args = process.argv.slice(2);
if (hasFlag(args, '--help') || hasFlag(args, '-h')) {
  printHelp();
  process.exit(0);
}

const mode = parseMode(args);
const seed = parseSeed(args);
const wantJson = hasFlag(args, '--json');
const receiptPath = parseReceiptPath(args, mode);

const startedAt = Date.now();
const processRegistry = createProcessRegistry();

const campaign = runReleaseSoakCampaign({
  mode,
  root: ROOT,
  processRegistry,
  seeds: seed != null ? [seed] : undefined,
});

const durationMs = Date.now() - startedAt;
const primary = campaign.primary;
const submission = {
  schema: 'spaceface.releaseSoakSubmission.v1',
  campaign: 'M6-RELEASE-SOAK',
  generatedAt: new Date().toISOString(),
  mode: campaign.mode,
  seeds: campaign.seeds,
  durationMs,
  pass: campaign.pass,
  failures: campaign.failures,
  processOwnership: {
    spawned: processRegistry.spawned.slice(),
    ownedKills: processRegistry.ownedKills,
    foreignKills: processRegistry.foreignKills,
    note: 'headless soak starts no child processes and must not kill ambient PIDs',
  },
  runs: campaign.runs.map((run) => ({
    seed: run.seed,
    deterministic: run.deterministic,
    firstPass: run.first.pass,
    secondPass: run.second.pass,
    hash: run.first.hash,
    ticks: run.first.ticks,
    saveReload: run.first.saveReload,
    failures: [...new Set([...(run.first.failures || []), ...(run.second.failures || [])])],
  })),
  primaryReceipt: primary,
};

await mkdir(path.dirname(receiptPath), { recursive: true });
await writeFile(receiptPath, `${JSON.stringify(primary, null, 2)}\n`, 'utf8');

const submissionPath = path.join(DEFAULT_RECEIPT_DIR, `release-soak-submission-${mode}.json`);
await mkdir(path.dirname(submissionPath), { recursive: true });
await writeFile(submissionPath, `${JSON.stringify(submission, null, 2)}\n`, 'utf8');

if (wantJson) {
  process.stdout.write(`${JSON.stringify(submission, null, 2)}\n`);
} else {
  console.log(`[check-release-soak] mode=${mode} seeds=${campaign.seeds.join(',')}`);
  console.log(`[check-release-soak] durationMs=${durationMs}`);
  if (primary) console.log(`[check-release-soak] ${formatReceiptSummary(primary)}`);
  for (const run of campaign.runs) {
    console.log(
      `[check-release-soak] seed=${run.seed} deterministic=${run.deterministic} `
      + `pass=${run.first.pass && run.second.pass} hash=${String(run.first.hash || '').slice(0, 12)}…`,
    );
  }
  console.log(`[check-release-soak] receipt: ${path.relative(ROOT, receiptPath)}`);
  console.log(`[check-release-soak] submission: ${path.relative(ROOT, submissionPath)}`);
  if (campaign.failures.length) {
    for (const f of campaign.failures.slice(0, 12)) console.error(`  ✗ ${f}`);
  }
}

if (!campaign.pass) {
  console.error(`[check-release-soak] FAIL in ${mode} mode`);
  process.exit(1);
}

console.log(`[check-release-soak] PASS in ${mode} mode (${RELEASE_SOAK_RECEIPT_SCHEMA})`);
process.exit(0);

// ── CLI helpers ──────────────────────────────────────────────────────────────

function printHelp() {
  const quick = modeConfig('quick');
  const full = modeConfig('full');
  console.log(`Usage: node scripts/check-release-soak.mjs [--quick|--full] [--seed N] [--json] [--receipt path]

Milestone 6 headless release soak. Fixed-step systems only — no browser/Electron.

  --quick     CI mode (default). ~${quick.totalSimSeconds}s sim, seed ${quick.seeds.join(',')}.
  --full      Accelerated long soak. ~${Math.round(full.totalSimSeconds / 60)} sim-minutes, seeds ${full.seeds.join(',')}.
  --seed N    Single-seed override.
  --json      Emit full submission JSON on stdout.
  --receipt p Write primary receipt JSON to path.

Receipts never claim browser GPU FPS from headless data.
`);
}

function parseMode(argv) {
  if (hasFlag(argv, '--full')) return 'full';
  if (hasFlag(argv, '--quick')) return 'quick';
  const eq = argv.find((a) => a.startsWith('--mode='));
  if (eq) {
    const v = eq.slice('--mode='.length);
    if (v === 'full' || v === 'quick') return v;
  }
  const idx = argv.indexOf('--mode');
  if (idx >= 0 && argv[idx + 1]) {
    const v = argv[idx + 1];
    if (v === 'full' || v === 'quick') return v;
  }
  // Legacy aliases map onto the headless contract (never open a browser here).
  if (hasFlag(argv, '--mode=headless') || argv.includes('headless')) return 'full';
  if (hasFlag(argv, '--mode=contract') || argv.includes('contract')) return 'quick';
  return 'quick';
}

function parseSeed(argv) {
  const eq = argv.find((a) => a.startsWith('--seed='));
  if (eq) {
    const n = Number(eq.slice('--seed='.length));
    return Number.isInteger(n) ? n : null;
  }
  const idx = argv.indexOf('--seed');
  if (idx >= 0 && argv[idx + 1]) {
    const n = Number(argv[idx + 1]);
    return Number.isInteger(n) ? n : null;
  }
  return null;
}

function parseReceiptPath(argv, mode) {
  const eq = argv.find((a) => a.startsWith('--receipt='));
  if (eq) return path.resolve(eq.slice('--receipt='.length));
  const idx = argv.indexOf('--receipt');
  if (idx >= 0 && argv[idx + 1]) return path.resolve(argv[idx + 1]);
  return path.join(DEFAULT_RECEIPT_DIR, `release-soak-receipt-${mode}.json`);
}

function hasFlag(argv, flag) {
  return argv.includes(flag);
}
