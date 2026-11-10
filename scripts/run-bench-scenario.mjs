#!/usr/bin/env node
// Run one or more real-runtime bench scenarios and print their `metrics.targets` (the owner's sentences in numbers).
//
//   node scripts/run-bench-scenario.mjs feel.bumper_scene            # the hull-burst yardstick (~20 s)
//   node scripts/run-bench-scenario.mjs feel.fling_scene             # the slice-A fling / loot / Massline throw yardstick (~35 s)
//   node scripts/run-bench-scenario.mjs feel.bumper_scene --seed=7 --json
//
// Scenarios are auto-discovered from scripts/lib/bench/scenarios/*.mjs. A target is an INSTRUMENT reading, not a
// gate: `NOT MET` is the finding. Targets never feed the FEEL_CONTRACT bars (they live in metrics.targets, not
// metrics.bars). The run boots the production profile through bootRealPath (live rapier-dynamic authority, live
// systems), so it needs no browser and no GPU.
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => {
  const [k, ...v] = a.replace(/^--/, '').split('=');
  return [k, v.length ? v.join('=') : true];
}));
const ids = args.filter((a) => !a.startsWith('--'));
if (!ids.length) {
  console.error('usage: node scripts/run-bench-scenario.mjs <scenarioId> [more ids] [--seed=4242] [--json]');
  process.exit(2);
}

const { runVerbBench } = await import(pathToFileURL(join(ROOT, 'scripts/lib/bench/verbBench.mjs')).href);
const seed = Number(flags.seed) || 4242;
const result = await runVerbBench({ seeds: [seed], scenarioIds: ids });
console.log(`ok=${result.ok} wallMs=${result.wallMs} runs=${result.runs.length} seed=${seed}`);
let unmet = 0;
for (const run of result.runs) {
  const m = run.metrics || {};
  console.log(`== ${run.scenarioId}  hash ${String(run.runHash).slice(0, 12)}${run.runError ? `  ERROR ${run.runError}` : ''}`);
  for (const t of m.targets || []) {
    if (!t.met) unmet++;
    console.log(`  ${t.met ? 'MET    ' : 'NOT MET'} ${t.id} = ${t.value} ${t.unit || ''} | ${t.note || ''}`);
  }
  if (flags.json) console.log(JSON.stringify(m, (k, v) => (k === 'realPathProof' || k === 'path' ? undefined : v), 2));
}
if (unmet) console.log(`${unmet} target(s) NOT MET`);
process.exit(result.ok && !unmet ? 0 : 1);
