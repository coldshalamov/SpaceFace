#!/usr/bin/env node
// Tuning-lab CLI. One stepper (labWorld.mjs), one seeding rule, one result format for every bench.
//
//   node scripts/lab/run.mjs <bench> [--scenarios a,b] [--seeds 1,2,3] [--variant name]
//        [--bundle focused|full] [--out path.json] [--quiet]
//
// A bench module exports SCENARIOS, DEFAULT_SCENARIOS, runScenario(id, {seed, bundle, params}),
// optional VARIANTS {name: params}, optional COLUMNS for the summary table.
import { table, writeResult } from './labMetrics.mjs';

const BENCHES = {
  tether: () => import('./benches/tetherSpin.mjs'),
  ttk: () => import('./benches/ttk.mjs'),
  aim: () => import('./benches/autoAim.mjs'),
  npc: () => import('./benches/npcEvasion.mjs'),
  sling: () => import('./benches/slingThrow.mjs'),
  flight: () => import('./benches/flightTurn.mjs'),
  lock: () => import('./benches/targetLock.mjs'),
};

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
      out[k] = v;
    } else out._.push(a);
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const benchId = args._[0];
if (!benchId || !BENCHES[benchId]) {
  console.error(`usage: node scripts/lab/run.mjs <${Object.keys(BENCHES).join('|')}> [--scenarios ..] [--seeds ..] [--variant ..] [--bundle focused|full] [--out file]`);
  process.exit(2);
}
const bench = await BENCHES[benchId]();
const scenarios = args.scenarios ? String(args.scenarios).split(',') : bench.DEFAULT_SCENARIOS;
const seeds = args.seeds ? String(args.seeds).split(',').map(Number) : [1, 2, 3];
const variants = args.variant ? String(args.variant).split(',') : ['baseline'];
const bundle = args.bundle || 'focused';

const results = [];
const t0 = Date.now();
for (const variant of variants) {
  const params = (bench.VARIANTS && bench.VARIANTS[variant]) || {};
  if (variant !== 'baseline' && !(bench.VARIANTS && bench.VARIANTS[variant])) throw new Error(`unknown variant ${variant}`);
  for (const sc of scenarios) {
    for (const seed of seeds) {
      const r = await bench.runScenario(sc, { seed, bundle, params });
      r.variant = variant;
      results.push(r);
      if (!args.quiet) process.stderr.write(`.${sc}#${seed}`);
    }
  }
}
process.stderr.write('\n');
const summary = bench.summarizeRuns ? bench.summarizeRuns(results) : results;
if (bench.COLUMNS) console.log(table(summary, bench.COLUMNS));
const payload = {
  schema: 'spaceface.tuningLab.result.v1', bench: benchId, bundle, seeds, scenarios, variants,
  wallMs: Date.now() - t0, node: process.version, generatedAt: new Date().toISOString(), summary, runs: results,
};
if (args.out) { writeResult(String(args.out), payload); console.log(`wrote ${args.out}`); }
