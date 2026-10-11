// Explicit node path for the orbital gallery.
// Usage:
//   node src/gallery/orbital/scripts/prove.mjs
//   node src/gallery/orbital/scripts/prove.mjs --id=og-a1-straight-cue --strategy=astern

import { SCENARIOS } from '../catalog.js';
import { runGalleryProof, traceScenario } from '../proof.js';

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, value] = arg.replace(/^--/, '').split('=');
  return [key, value === undefined ? true : value];
}));

if (args.id) {
  const scenario = SCENARIOS.find((row) => row.id === args.id || row.id.endsWith(args.id));
  if (!scenario) {
    console.error(`unknown scenario ${args.id}`);
    process.exit(1);
  }
  const strategyId = args.strategy || scenario.strategies[0].id;
  const row = await traceScenario(scenario.id, strategyId);
  console.log(JSON.stringify({
    id: row.id,
    strategyId: row.strategyId,
    result: row.result,
    snapshot: row.snapshot,
    trace: row.trace,
    backend: row.proof && row.proof.backend,
  }, null, 2));
  process.exit(row.result && row.result.won ? 0 : 1);
}

const report = await runGalleryProof();
console.log(report.summary);
process.exit(report.ok ? 0 : 1);
