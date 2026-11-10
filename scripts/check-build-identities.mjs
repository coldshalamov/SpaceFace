#!/usr/bin/env node
// scripts/check-build-identities.mjs — the fit-archetype pilot acceptance run.
//
// Proves the progression vertical's build-identity claim: four different FITS of the same hull
// complete the SAME fixed-seed combat content through measurably different verb profiles.
// Every number comes from the real authoritative runtime (bootRealPath: rapier-dynamic, SG-02,
// live systems); every counted verb is a bus event the game published.
//
// Usage: node scripts/check-build-identities.mjs [--write=<report path>] [--seed=<n>]
// Exit 0 = all four completed alive, signature verbs fired, profiles pairwise distinct.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  ARCHETYPE_SEED,
  ARCHETYPES,
  runArchetypePilot,
  scorePilotRuns,
} from './lib/bench/archetypePilots.mjs';

function parseArgs(argv) {
  const out = { write: null, seed: ARCHETYPE_SEED };
  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--write=')) out.write = arg.slice('--write='.length);
    else if (arg.startsWith('--seed=')) out.seed = Number(arg.slice('--seed='.length));
    else if (arg === '--help' || arg === '-h') out.help = true;
  }
  return out;
}

const args = parseArgs(process.argv);
if (args.help) {
  console.log('usage: node scripts/check-build-identities.mjs [--write=<report.md>] [--seed=<n>]');
  process.exit(0);
}

const verbRows = [
  'shotsFired', 'latches', 'lineCuts', 'whipSnap', 'whipImpact', 'swingDash',
  'snareDeployed', 'snareCaught', 'decoyDeployed', 'pdsIntercept', 'towFlailHit', 'kills',
];

console.log(`[build-identities] seed ${args.seed} — running ${ARCHETYPES.length} fit-archetype pilots sequentially (real path, hosts strictly sequential)`);
const runs = [];
for (const archetype of ARCHETYPES) {
  const started = Date.now();
  const run = await runArchetypePilot(archetype.id, { seed: args.seed });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`[build-identities] ${run.label.padEnd(24)} completed=${run.completed} alive=${run.playerAlive} `
    + `raiders=${run.raidersDown}/3 ticks=${run.ticks} (${seconds}s)`);
  runs.push(run);
}

const score = scorePilotRuns(runs);

// Render the verb table.
const lines = [];
lines.push('# Build Identity Pilot Proof', '');
lines.push(`Generated: 2026-09-18 · seed: ${args.seed} · hull: ship_drifter (all fits) · content: 3 corsair raiders + tow anchor + terrain ring`);
lines.push(`Verdict: ${score.ok ? 'PASS' : 'FAIL'}`, '');
if (!score.ok) {
  for (const problem of score.problems) lines.push(`- ${problem}`);
  lines.push('');
}
lines.push('| identity | completed | alive | raiders down | ticks | signature verbs |');
lines.push('|---|---|---|---|---|---|');
for (const run of runs) {
  const sig = run.signature.map((row) => `${row}=${run.verbs[row]}`).join(', ');
  lines.push(`| ${run.label} | ${run.completed} | ${run.playerAlive} | ${run.raidersDown}/3 | ${run.ticks} | ${sig} |`);
}
lines.push('');
lines.push('| identity | ' + verbRows.join(' | ') + ' |');
lines.push('|---' + '|---'.repeat(verbRows.length) + '|');
for (const run of runs) {
  lines.push(`| ${run.label} | ` + verbRows.map((row) => run.verbs[row]).join(' | ') + ' |');
}
lines.push('');
lines.push('Every counted verb is a bus event the live sim published (`combat:fire`, `tether:whipSnap`,');
lines.push('`ship:swingDash`, `massline:snareDeployed`, `countermeasure:deployed` kind=decoy, `pds:intercept`,');
lines.push('`combat:collisionConsequence` provenance=tow_flail, `entity:killed`). Same seed, same content,');
lines.push('same hull — the fits play differently, which is the acceptance.');

const report = lines.join('\n');
console.log(report);

if (args.write) {
  mkdirSync(dirname(args.write), { recursive: true });
  writeFileSync(args.write, report + '\n');
  console.log(`[build-identities] wrote ${args.write}`);
}

process.exit(score.ok ? 0 : 1);
