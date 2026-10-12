import assert from 'node:assert/strict';
import test from 'node:test';
import { coverageGaps, requiredCoverage, sceneCatalog } from '../lib/scenarios.mjs';

test('catalog has 25 real-route scenarios and the required themes', () => {
  const catalog = sceneCatalog();
  assert.ok(catalog.length >= 25, `expected >= 25 scenarios, got ${catalog.length}`);
  const ids = new Set(catalog.map((entry) => entry.id));
  assert.equal(ids.size, catalog.length);
  assert.deepEqual(coverageGaps(catalog), []);
  for (const theme of requiredCoverage()) {
    assert.ok(catalog.some((entry) => entry.covers.includes(theme)), theme);
  }
  const fixtures = catalog.filter((entry) => entry.source === 'fixture');
  assert.ok(fixtures.length >= 3);
  for (const entry of fixtures) {
    assert.equal(entry.doc.schema, 'spaceface.simScenario.v1');
    assert.ok(entry.sourcePath.startsWith('src/'));
  }
});
