import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCheckCatalog,
  classifyCheck,
  extractNpmDependencies,
} from '../scripts/lib/checkCatalog.mjs';

test('extractNpmDependencies finds unique npm-script edges in command order', () => {
  assert.deepEqual(
    extractNpmDependencies('npm run check:one && npm run check:two -- --headed && npm run check:one'),
    ['check:one', 'check:two'],
  );
});

test('classifyCheck exposes route and runtime properties without claiming acceptance', () => {
  assert.deepEqual(
    classifyCheck('check:career:browser', 'node scripts/check-career-public-route-browser.mjs'),
    {
      kind: 'leaf',
      runtimeHint: 'browser',
      routeHint: 'public-player-route',
      focusHint: 'career',
      classificationMethod: 'id-command-heuristic',
    },
  );
  assert.equal(
    classifyCheck('check:bundle', 'node scripts/build-bundle.mjs').routeHint,
    'structural',
  );
});

test('buildCheckCatalog reports graph shape, missing edges, and cycles deterministically', () => {
  const catalog = buildCheckCatalog({
    name: 'fixture',
    scripts: {
      'check:unit': 'node --test test/unit.test.mjs',
      'check:browser': 'node scripts/check-public-route-browser.mjs',
      'check:all': 'npm run check:unit && npm run check:browser',
      'check:missing': 'npm run check:not-defined',
      'check:cycle:a': 'npm run check:cycle:b',
      'check:cycle:b': 'npm run check:cycle:a',
      start: 'node server.js',
    },
  });

  assert.equal(catalog.schemaVersion, 1);
  assert.deepEqual(catalog.classification, {
    status: 'hint-only',
    method: 'id-command-heuristic',
    limitation: 'Runtime and route hints are not import-graph or execution proof.',
  });
  assert.deepEqual(catalog.summary, {
    checks: 6,
    leaves: 2,
    composites: 4,
    missingDependencies: 1,
    cycleWitnesses: 1,
  });
  assert.deepEqual(catalog.cycleAnalysis, {
    method: 'deterministic-depth-first-search',
    limitation: 'Reported paths are representative cycle witnesses, not an exhaustive elementary-cycle enumeration.',
  });
  assert.deepEqual(catalog.missingDependencies, [
    { check: 'check:missing', dependency: 'check:not-defined' },
  ]);
  assert.deepEqual(catalog.cycles, [
    ['check:cycle:a', 'check:cycle:b', 'check:cycle:a'],
  ]);
  assert.deepEqual(catalog.checks.map((entry) => entry.id), [
    'check:all',
    'check:browser',
    'check:cycle:a',
    'check:cycle:b',
    'check:missing',
    'check:unit',
  ]);
});
