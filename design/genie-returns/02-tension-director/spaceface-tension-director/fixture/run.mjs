#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { ARCHETYPES, SEEDS, runScenario } from './simulation.mjs';

const args = process.argv.slice(2);
let hours = 0.5, out = path.resolve(fileURLToPath(new URL('../evidence/generated/', import.meta.url))), repeat = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--hours') hours = Number(args[++i]);
  else if (args[i] === '--out') out = path.resolve(args[++i] || '');
  else if (args[i] === '--repeat') repeat = true;
  else throw new Error(`Unknown argument: ${args[i]}. Supported: --hours 0.5..24 --out DIR --repeat`);
}
if (!Number.isFinite(hours) || hours < 0.5 || hours > 24) throw new RangeError('--hours must be 0.5..24');
await fs.mkdir(out, { recursive: true });
const seconds = Math.round(hours * 3600), results = [], comparisons = [];
for (const archetype of ARCHETYPES) for (const seed of SEEDS) {
  const enabled = await runScenario({ archetype, seed, seconds, enabled: true });
  const baseline = await runScenario({ archetype, seed, seconds, enabled: false });
  let repeatVerified = false;
  if (repeat) {
    const again = await runScenario({ archetype, seed, seconds, enabled: true, checkpointAt: Math.floor(seconds / 2) });
    assert.equal(again.policyHash, enabled.policyHash, 'fixed-input/checkpoint policy trace changed');
    assert.equal(again.receiptsHash, enabled.receiptsHash, 'fixed-input/checkpoint receipts changed');
    repeatVerified = true;
  }
  for (const result of [enabled, baseline]) {
    const name = `${archetype}-${seed}-${result.enabled ? 'directed' : 'legacy'}`;
    await fs.writeFile(path.join(out, `${name}.json`), JSON.stringify(result, null, 2) + '\n');
    const keys = Object.keys(result.timeline[0]);
    await fs.writeFile(path.join(out, `${name}.csv`), keys.join(',') + '\n'
      + result.timeline.map((r) => keys.map((k) => r[k] ?? '').join(',')).join('\n') + '\n');
    results.push({ name, ...result.summary, policyHash: result.policyHash, receiptsHash: result.receiptsHash });
  }
  comparisons.push({ archetype, seed, repeatAndCheckpointVerified: repeatVerified,
    directedCombatSpawns: enabled.summary.combatSpawns, legacyCombatSpawns: baseline.summary.combatSpawns,
    directedPhaseTransitions: enabled.summary.phaseTransitions,
    starvationNotices: enabled.summary.starvationNotices, maxSnapshotBytes: enabled.summary.maxSnapshotBytes });
  console.log(`${archetype}/${seed}: ${hours}h, ${enabled.summary.phaseTransitions} transitions, ${enabled.summary.combatSpawns} combat spawns; repeat+checkpoint=${repeatVerified}`);
}
const summary = { schema: 'spaceface.tension.fixture-suite.v1',
  evidenceClass: 'focused-consumer-with-world-doubles', secondsPerScenario: seconds,
  baseline: 'actual packet legacy rhythm, controller feature flag disabled',
  note: 'Synthetic supply/actors/combat/repairs; not a production world, meaningful-choice count, economic-loop result, or target-PC benchmark.',
  seeds: SEEDS, archetypes: ARCHETYPES, repeatWithCheckpoint: repeat, comparisons, runs: results };
await fs.writeFile(path.join(out, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(`Wrote deterministic JSON + CSV traces to ${out}`);
