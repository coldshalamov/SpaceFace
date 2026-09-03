// test/fun-bench.test.mjs — PQ-173.00: The Fun Convergence Loop Bench tests.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { computeRunHash } from '../scripts/lib/bench/runHash.mjs';
import { simulateCrucibleSwarm, CRUCIBLE_ARENAS, CRUCIBLE_LOADOUTS, CRUCIBLE_DEFAULT_SEEDS } from '../scripts/lib/bench/crucibleBench.mjs';
import { runFlightBench } from '../scripts/lib/bench/flightBench.mjs';
import { runVerbBench } from '../scripts/lib/bench/verbBench.mjs';

test('computeRunHash generates bit-identical SHA-256 hashes for identical inputs', () => {
  const payloadA = {
    config: { bench: 'crucible', ruleset: 'swarm', arenaId: 'helios_core', loadoutId: 'physics_toolkit', seed: 4242, waveCount: 3 },
    waveCheckpoints: ['hash1', 'hash2', 'hash3'],
    eventTrace: [{ tick: 1, type: 'spawn', data: { x: 10, z: 20 } }],
    metrics: { kills: 71, vpm: 10.0, knockBudgetMet: true },
  };

  const payloadB = {
    config: { bench: 'crucible', ruleset: 'swarm', arenaId: 'helios_core', loadoutId: 'physics_toolkit', seed: 4242, waveCount: 3 },
    waveCheckpoints: ['hash1', 'hash2', 'hash3'],
    eventTrace: [{ tick: 1, type: 'spawn', data: { x: 10, z: 20 } }],
    metrics: { kills: 71, vpm: 10.0, knockBudgetMet: true },
  };

  const resA = computeRunHash(payloadA);
  const resB = computeRunHash(payloadB);

  assert.equal(resA.runHash, resB.runHash, 'Hashes must be bit-identical');
  assert.equal(resA.runHash.length, 64, 'Run hash must be 64-character hex SHA-256');
  assert.deepEqual(resA.runManifest, resB.runManifest, 'Manifests must match');
});

test('simulateCrucibleSwarm is deterministic across duplicate runs of the same seed', () => {
  for (const arena of CRUCIBLE_ARENAS) {
    for (const loadout of CRUCIBLE_LOADOUTS) {
      for (const seed of CRUCIBLE_DEFAULT_SEEDS.slice(0, 1)) {
        const run1 = simulateCrucibleSwarm({ arenaId: arena.id, loadoutId: loadout.id, seed, waveCount: 3 });
        const run2 = simulateCrucibleSwarm({ arenaId: arena.id, loadoutId: loadout.id, seed, waveCount: 3 });

        assert.equal(run1.runHash, run2.runHash, `Crucible ${arena.id}/${loadout.id}/s${seed} must hash identical`);
        assert.deepEqual(run1.waveCheckpoints, run2.waveCheckpoints, 'Wave checkpoints must match');
        assert.deepEqual(run1.metrics, run2.metrics, 'Metrics must match');
        assert.equal(run1.waveCheckpoints.length, 3, 'Must complete 3 waves');
        assert.equal(run1.metrics.wavesCleared, 3);
        assert.ok(run1.metrics.totalKills > 0, 'Kills must be greater than zero');
        assert.equal(run1.metrics.b13Met, true, 'B13 knock budget must be met');
      }
    }
  }
});

test('runFlightBench executes all 4 motion lab scenarios and hashes identically', async () => {
  const result1 = await runFlightBench({ seeds: [13502] });
  const result2 = await runFlightBench({ seeds: [13502] });

  assert.equal(result1.ok, true);
  assert.equal(result2.ok, true);
  assert.equal(result1.runs.length, 4);

  for (let i = 0; i < result1.runs.length; i++) {
    const r1 = result1.runs[i];
    const r2 = result2.runs[i];
    assert.equal(r1.runHash, r2.runHash, `${r1.scenarioId} must produce identical hash on repeat`);
    assert.deepEqual(r1.metrics, r2.metrics, `${r1.scenarioId} metrics must match`);
  }
});

test('runVerbBench executes all 6 verb scenarios and hashes identically', async () => {
  const result1 = await runVerbBench({ seeds: [4242] });
  const result2 = await runVerbBench({ seeds: [4242] });

  assert.equal(result1.ok, true);
  assert.equal(result2.ok, true);
  assert.equal(result1.runs.length, 6);

  for (let i = 0; i < result1.runs.length; i++) {
    const r1 = result1.runs[i];
    const r2 = result2.runs[i];
    assert.equal(r1.runHash, r2.runHash, `${r1.scenarioId} must produce identical hash on repeat`);
    assert.deepEqual(r1.metrics, r2.metrics, `${r1.scenarioId} metrics must match`);
  }
});
