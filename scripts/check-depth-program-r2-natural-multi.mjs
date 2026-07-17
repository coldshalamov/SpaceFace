#!/usr/bin/env node
// R2 natural multi-seed check — D10 primary marks required (F1 §8).
//
// Default: invoke the shared D10 primary runner so multi-seed acceptance
// always asserts the full wreck mark spine (not a structural soak skeleton).
//
// Usage:
//   npm run check:depth-program:r2:natural-multi
//   NATURAL_ROUTE_SEED_MODE=ci|held-out|full node scripts/check-depth-program-r2-natural-multi.mjs

import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CONTENT_CLASSES,
  D10_CARRIER,
  D10_CI_SEEDS,
  D10_ROUTE_ID,
  NATURAL_ROUTE_SCHEMA,
  REQUIRED_MARKS_BY_CLASS,
  defineRoute,
  loadHeldOutSeeds,
  resolveSeedSet,
  validateMarkSequence,
} from './lib/naturalRoute.mjs';
import {
  D10_PRIMARY_SEEDS,
  runD10PrimaryMulti,
  runD10PrimarySeed,
} from './check-depth-program-r2-natural-d10-primary.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const AGGREGATE = resolve(ROOT, '.devshots/depth-program/r2-natural-multi.json');

const SEED_MODE = String(process.env.NATURAL_ROUTE_SEED_MODE || 'primary').toLowerCase();

const route = defineRoute({
  id: D10_ROUTE_ID,
  contentClass: CONTENT_CLASSES.wreck,
  requiredMarks: REQUIRED_MARKS_BY_CLASS.wreck,
  ciSeeds: [...D10_CI_SEEDS],
  supporting: false,
  carrier: { ...D10_CARRIER },
  steps: [],
  meta: {
    multi: true,
    d10Primary: true,
    wreckId: D10_CARRIER.wreckId,
  },
});

function seedsForMode(mode) {
  if (mode === 'primary' || mode === 'd10-primary') {
    return [...D10_PRIMARY_SEEDS];
  }
  if (mode === 'ci' || mode === 'held-out' || mode === 'full') {
    return [...resolveSeedSet(route, mode)];
  }
  throw new Error(`unknown NATURAL_ROUTE_SEED_MODE=${mode} (use primary|ci|held-out|full)`);
}

const seeds = seedsForMode(SEED_MODE);
assert.ok(seeds.length >= 2, 'multi-seed requires ≥2 seeds');
assert.ok(
  seeds.some((s) => D10_CI_SEEDS.includes(s)) || SEED_MODE === 'held-out',
  'CI/primary mode must pin D10 CI seeds (F1 §8)',
);

const { multi, naturalness, supporting, evidencePaths, aggregate: primaryAgg } = await runD10PrimaryMulti(seeds);

// Assert full D10 wreck mark spine on every seed (not skeleton soak).
for (const row of multi.rows) {
  assert.equal(row.pass, true, `seed ${row.seed} must pass primary D10`);
  const markCheck = validateMarkSequence(row.marks || [], REQUIRED_MARKS_BY_CLASS.wreck);
  assert.equal(markCheck.pass, true,
    `seed ${row.seed} missing D10 marks: ${markCheck.missing.join(', ')}`);
  assert.ok(
    (row.marks || []).some((m) => m.name === 'scan-hardened'),
    `seed ${row.seed} must record scan-hardened`,
  );
  assert.ok(
    (row.marks || []).some((m) => m.name === 'claim-resolved'),
    `seed ${row.seed} must record claim-resolved`,
  );
  assert.ok(
    (row.marks || []).some((m) => m.name === 'reward-durable'),
    `seed ${row.seed} must record reward-durable`,
  );
}

assert.equal(naturalness.pass, true,
  `naturalness must pass: ${naturalness.failures.join('; ')}`);
assert.equal(multi.pass, true, 'all multi-seed rows must pass');
assert.equal(supporting, false, 'D10 primary multi must remain supporting:false');

const aggregate = {
  schema: NATURAL_ROUTE_SCHEMA,
  harness: 'check:depth-program:r2:natural-multi',
  supporting: false,
  skeleton: false,
  d10Primary: true,
  seedMode: SEED_MODE,
  seeds,
  heldOutAvailable: loadHeldOutSeeds().length,
  slots: [
    {
      routeId: D10_ROUTE_ID,
      wreckId: D10_CARRIER.wreckId,
      sectorId: D10_CARRIER.sectorId,
      slot: D10_CARRIER.slot,
      channel: D10_CARRIER.channel,
    },
  ],
  requiredMarks: REQUIRED_MARKS_BY_CLASS.wreck,
  result: multi.result,
  pass: multi.pass && naturalness.pass,
  naturalness,
  rows: multi.rows.map((row) => ({
    seed: row.seed,
    pass: row.pass,
    result: row.result,
    marks: (row.marks || []).map((m) => m.name),
    markCheck: validateMarkSequence(row.marks || [], REQUIRED_MARKS_BY_CLASS.wreck),
    phaseTrail: row.phaseTrail,
    ticks: row.ticks,
    simTime: row.simTime,
  })),
  evidencePaths,
  primaryAggregate: primaryAgg?.result || null,
  driver: 'scripts/check-depth-program-r2-natural-d10-primary.mjs + naturalRoute.mjs',
  residual: [
    'Expand slots beyond D10 with per-wreck route configs under scripts/routes/',
    'Tier B D10 UI e2e still residual for claim click surface',
  ],
};

mkdirSync(dirname(AGGREGATE), { recursive: true });
writeFileSync(AGGREGATE, `${JSON.stringify(aggregate, null, 2)}\n`, 'utf8');

// Touch runD10PrimarySeed export so the shared runner surface stays intentional.
assert.equal(typeof runD10PrimarySeed, 'function', 'shared primary seed runner must be importable');

console.log(`R2 natural multi OK: ${multi.seedCount} seeds (mode=${SEED_MODE}, D10 marks asserted)`);
console.log(`supporting:false naturalness=${naturalness.pass}`);
console.log(`Aggregate: ${AGGREGATE}`);
