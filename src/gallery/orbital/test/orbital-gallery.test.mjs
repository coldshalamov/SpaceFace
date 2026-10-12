import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { GALLERY_ASSETS } from '../assets.js';
import { PLAYABLE_SLICE, SCENARIOS } from '../catalog.js';
import { runGalleryProof } from '../proof.js';
import { validateCatalog } from '../validate.js';

const ROOT = join(import.meta.dirname, '../../../..');

test('orbital gallery catalog is 24 launchable challenges on the shipping glass', () => {
  const issues = validateCatalog(SCENARIOS);
  assert.deepEqual(issues, [], issues.join('\n'));
  assert.equal(SCENARIOS.length, 24);
  assert.equal(PLAYABLE_SLICE.length, 6);
  assert.deepEqual(PLAYABLE_SLICE, SCENARIOS.slice(0, 6).map((scenario) => scenario.id));
  const duals = SCENARIOS.filter((scenario) => scenario.strategies.length >= 2);
  assert.equal(duals.length, 12);
  const families = new Set(SCENARIOS.map((scenario) => scenario.family));
  assert.equal(families.size, 6);
  for (const asset of Object.values(GALLERY_ASSETS)) {
    for (const relative of asset.lod) {
      assert.equal(existsSync(join(ROOT, relative)), true, relative);
    }
  }
});

test('orbital gallery sources do not roll Math.random', () => {
  const dir = join(import.meta.dirname, '..');
  const files = readdirSync(dir).filter((name) => name.endsWith('.js'));
  for (const name of files) {
    const text = readFileSync(join(dir, name), 'utf8');
    assert.equal(text.includes('Math.random'), false, name);
  }
});

test('orbital gallery proof: 24 fixed-seed wins, distinct duals, idle fails, retry, live stick', { timeout: 180000 }, async () => {
  const report = await runGalleryProof();
  assert.equal(report.ok, true, report.summary);
  assert.equal(report.physicsProof.backend, 'rapier-dynamic');
  assert.equal(report.physicsProof.sg02Ready, true);
  assert.equal(report.physicsProof.physicsBackend, 'rapier-dynamic');
  assert.equal(report.physicsProof.flightBackend, 'v3');
  assert.equal(report.determinism, true);
  assert.equal(report.retry.ok, true);
  assert.equal(report.live.ok, true);
  assert.equal(report.idleIssues.length, 0);
  assert.equal(report.dualIssues.length, 0);
  for (const id of PLAYABLE_SLICE) {
    assert.ok(report.wins.some((win) => win.id === id), id);
  }
});
