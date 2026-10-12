import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzePack } from '../lib/analyze.mjs';
import { highFails } from '../lib/detectors.mjs';
import { sceneCatalog } from '../lib/scenarios.mjs';
import { witnessScenario } from '../lib/witness.mjs';
import { buildVerdict } from '../lib/atlas.mjs';

test('starter scene runs on the lab runtime and stays semantically clean', async () => {
  const entry = sceneCatalog().find((row) => row.id === 'scene.starter-rest');
  const pack = await witnessScenario(entry);
  assert.equal(pack.ok, true, pack.error);
  assert.equal(pack.lab.renderingDetached, true);
  assert.ok(pack.views.length >= 6);
  const player = pack.views[0].objects.find((object) => object.isPlayer);
  assert.ok(player);
  assert.equal(player.package.sourceExists, true);
  assert.equal(player.package.metadataExists, true);
  assert.equal(player.lodLevel, 'lod0');
  assert.equal(player.visible, true);
  const zooms = new Set(pack.views.map((view) => view.zoom));
  assert.ok(zooms.size >= 2);
  const tiers = new Set(pack.views.map((view) => view.qualityTier));
  assert.ok(tiers.has('low') && tiers.has('medium') && tiers.has('high'));
  const fails = highFails(analyzePack(pack));
  assert.deepEqual(fails.map((row) => row.kind), []);
});

test('an incomplete lab arm with a usable final surface cannot become a clean verdict', () => {
  const pack = { id: 'partial', ok: true, lab: { ok: false, status: 'incomplete' }, views: [] };
  const issues = analyzePack(pack);
  assert.ok(issues.some((row) => row.kind === 'lab-incomplete'));
  const verdict = buildVerdict({
    scenarioCount: 1, scenarioRows: [{ id: 'partial', labOk: false, labStatus: 'incomplete' }],
    issues, reviews: [], critique: { ok: true }, faults: [], benign: [],
  });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.status, 'incomplete');
  assert.ok(verdict.missingMeasurements.some((row) => row.scenarioId === 'partial'));
});

test('skipping all simulations cannot mint an integration-ready verdict', () => {
  const verdict = buildVerdict({
    scenarioCount: 2, scenarioRows: [], issues: [], reviews: [],
    critique: { ok: true }, faults: [], benign: [],
  });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.status, 'incomplete');
  assert.equal(verdict.measuredScenarioCount, 0);
  assert.equal(verdict.renderingStatus, 'unmeasured');
});
