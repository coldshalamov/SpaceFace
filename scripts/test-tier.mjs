#!/usr/bin/env node
// One runner for the three test tiers: fast | route | reference | all.
//
//   node scripts/test-tier.mjs fast
//   node scripts/test-tier.mjs route --shard=1/2
//   node scripts/test-tier.mjs reference --json --timeout=900
//
// The tier files are the source of truth (test/tiers/*.txt). Every entry is validated before
// anything runs: a renamed test file or npm script is drift and fails the tier instead of
// silently disappearing. Each entry prints the exact command it ran.

import { fileURLToPath } from 'node:url';
import {
  TIER_NAMES, classifyEntry, formatSummary, packageScripts, parseRunnerArgs,
  readTierFile, runEntries, shardEntries, summarize,
} from './lib/testTier.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

let options;
try {
  options = parseRunnerArgs(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exit(2);
}

const tiers = options.tier === 'all' ? TIER_NAMES : [options.tier];
const scripts = packageScripts(ROOT);
const selected = [];
const drift = [];

for (const tier of tiers) {
  let file;
  try {
    file = readTierFile(ROOT, tier);
  } catch (error) {
    drift.push({ tier, error: error.message });
    continue;
  }
  if (!file.entries.length) {
    drift.push({ tier, error: `tier file has no entries: ${file.file}` });
    continue;
  }
  for (const line of file.entries) {
    try {
      selected.push({ tier, file: file.file, ...classifyEntry(line, { root: ROOT, scripts }) });
    } catch (error) {
      drift.push({ tier, line, error: error.message });
    }
  }
}

if (drift.length) {
  if (options.json) process.stdout.write(`${JSON.stringify({ schema: 'spaceface.testTierResult.v1', ok: false, drift }, null, 2)}\n`);
  else {
    console.error('test tier drift — fix the tier file or the missing target:');
    for (const item of drift) console.error(`  [${item.tier}] ${item.line || ''} ${item.error}`.trim());
  }
  process.exit(2);
}

let sharded = selected;
if (options.shard) {
  const perTier = new Map();
  for (const entry of sharded) {
    if (!perTier.has(entry.tier)) perTier.set(entry.tier, []);
    perTier.get(entry.tier).push(entry);
  }
  sharded = [];
  for (const tier of tiers) sharded.push(...shardEntries(perTier.get(tier) || [], options.shard.index, options.shard.count));
}

if (options.list) {
  for (const entry of sharded) console.log(`[${entry.tier}] ${entry.command}`);
  process.exit(0);
}

if (!sharded.length) {
  console.error('test tier selection is empty');
  process.exit(2);
}

const results = await runEntries(sharded, {
  root: ROOT,
  timeoutMs: options.timeoutMs,
  json: options.json,
  failFast: options.failFast,
});
const summary = summarize(results);
summary.tier = options.tier;
summary.shard = options.shard;
summary.entries = results.map((result) => ({
  tier: result.tier,
  command: result.command,
  ok: result.ok,
  durationMs: result.durationMs,
  timedOut: result.timedOut,
  code: result.code,
}));

if (options.json) process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
else console.log(formatSummary(summary, { tier: options.tier, shard: options.shard }));

process.exitCode = summary.ok ? 0 : 1;
