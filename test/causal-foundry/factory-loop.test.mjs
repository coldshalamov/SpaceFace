import test from 'node:test';
import assert from 'node:assert/strict';

import { testCandidates } from '../../tools/causal-foundry/generate.js';

test('factory simulates at least 100 candidates and rejects fakes', { timeout: 180000 }, async () => {
  const { simulated, rows } = await testCandidates();
  assert.ok(simulated >= 100, `simulated ${simulated}`);
  assert.equal(rows.length, simulated + 1);
  const accepted = rows.filter((row) => row.accepted);
  const rejected = rows.filter((row) => !row.accepted);
  assert.ok(rejected.length > accepted.length, 'most generated twins are not content');
  assert.ok(rejected.some((row) => row.reasons.includes('trivial-variant')), 'missing trivial-variant');
  assert.ok(rejected.some((row) => row.reasons.some((reason) => reason.startsWith('zero-force:'))), 'missing zero-force');
  assert.ok(rejected.some((row) => row.reasons.includes('single-mechanic')), 'missing single-mechanic');
  assert.ok(rejected.some((row) => row.reasons.some((reason) => reason.startsWith('impossible-profile:'))), 'missing impossible profile');
  assert.ok(rejected.some((row) => row.reasons.includes('spawn-overlap')), 'missing overlap');
  for (const row of accepted) {
    assert.ok(row.metrics.firedObservables.length >= 2, row.id);
    assert.equal(row.metrics.physicalCauseFraction, 1, row.id);
    assert.ok(row.traceHash, row.id);
    assert.equal(row.reasons.length, 0, row.id);
    assert.equal(row.signature.includes('|'), true, row.signature);
    assert.equal(row.signature.startsWith('gen-'), false, row.signature);
  }
  assert.equal(new Set(accepted.map((row) => row.signature)).size, accepted.length);
  const pinFamilies = ['gen-reel', 'gen-static', 'gen-diagonal'];
  const pinAccepted = accepted.filter((row) => pinFamilies.includes(row.family));
  assert.ok(pinAccepted.length <= 1, pinAccepted.map((row) => `${row.id}:${row.signature}`).join(','));
  const hashes = new Map();
  for (const row of rows) {
    if (!row.traceHash) continue;
    if (!hashes.has(row.id)) hashes.set(row.id, row.traceHash);
  }
  assert.equal(hashes.size, simulated);
});
