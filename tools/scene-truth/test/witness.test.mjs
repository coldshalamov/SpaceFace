import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzePack } from '../lib/analyze.mjs';
import { claimGpuFrame, publishCapture, sceneSvg } from '../lib/atlas.mjs';
import { analyzeWitness, copiedObservation, highFails } from '../lib/detectors.mjs';
import { healthyWitness } from '../lib/faults.mjs';
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
  assert.equal(player.presentationSource, 'unmeasured');
  assert.equal(player.presentedRadius, null);
  assert.equal(pack.views.every((view) => view.gpuFrame === false && view.captureKind === 'semantic-projection'), true);
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

test('semantic SVG is not a GPU frame', () => {
  const witness = {
    captureKind: 'semantic-projection',
    seed: 1,
    tick: 4,
    zoom: 144,
    qualityTier: 'medium',
    frame: { halfH: 20, halfV: 12 },
    objects: [],
    gpuFrame: true,
  };
  const svg = sceneSvg(witness);
  assert.match(svg, /not a GPU frame/);
  assert.equal(claimGpuFrame(witness), false);
  assert.equal(claimGpuFrame({ captureKind: 'gpu-frame', gpuFrame: true, pixels: svg }), false);
  assert.equal(claimGpuFrame({ captureKind: 'gpu-frame', frameCapture: { format: 'svg', svg } }), false);
  assert.equal(claimGpuFrame({
    captureKind: 'gpu-frame',
    frameCapture: { format: 'png', bytes: new Uint8Array([1, 2, 3, 4]) },
  }), true);
  const published = publishCapture({ captureKind: 'gpu-frame', gpuFrame: true, pixels: svg });
  assert.equal(published.gpuFrame, false);
  assert.equal(published.captureKind, 'semantic-projection');
});

test('a witness whose observed fields copy the expected fields fails', () => {
  const expected = { file: 'wholeships/kestrel.glb', radius: 12, visible: true };
  const witness = healthyWitness();
  witness.expected = expected;
  witness.observed = { file: expected.file, radius: expected.radius, visible: expected.visible };
  assert.equal(copiedObservation(witness), true);
  const fails = highFails(analyzeWitness(witness));
  assert.equal(fails.length, 1);
  assert.equal(fails[0].kind, 'copied-observation');
  assert.equal(fails[0].failBuild, true);
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
