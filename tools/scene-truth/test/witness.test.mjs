import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzePack } from '../lib/analyze.mjs';
import { buildVerdict, claimGpuFrame, LIMITATIONS, publishCapture, sceneSvg } from '../lib/atlas.mjs';
import { analyzeWitness, copiedObservation, highFails } from '../lib/detectors.mjs';
import { bindEntity, liveShieldGeometryRadius } from '../lib/bindVisual.mjs';
import { healthyWitness } from '../lib/faults.mjs';
import { sceneCatalog } from '../lib/scenarios.mjs';
import { sceneTruthSamplesFromState } from '../lib/hook.mjs';
import { witnessScenario } from '../lib/witness.mjs';
import { buildDeterministicSurface } from '../../../src/testing/lab/deterministicSurface.js';

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
  assert.equal(player.shieldGeometryRadius, player.colliderRadius);
  assert.ok(player.shieldGeometryRadius > 0);
  assert.equal((player.effects || []).some((effect) => effect.kind === 'shield'), false);
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
  const svgBytes = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  const xmlBytes = new TextEncoder().encode('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>');
  assert.equal(claimGpuFrame({ captureKind: 'gpu-frame', frameCapture: { bytes: svgBytes } }), false);
  assert.equal(claimGpuFrame({ captureKind: 'gpu-frame', frameCapture: { bytes: xmlBytes } }), false);
  const pngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(claimGpuFrame({ captureKind: 'gpu-frame', frameCapture: { bytes: pngBytes } }), true);
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

test('a current shield of 0 does not keep the raised shell radius', () => {
  const entity = {
    id: 7,
    alive: true,
    radius: 14,
    shield: 0,
    shieldMax: 55,
    pos: { x: 0, z: 0 },
    data: {},
  };
  assert.equal(liveShieldGeometryRadius(entity), null);
  const [sample] = sceneTruthSamplesFromState({ entityList: [entity] });
  assert.equal(sample.shieldGeometryRadius, null);
});

test('the lab surface carries shield hit points and a def id alone wears no disc', () => {
  const surface = buildDeterministicSurface({
    tick: 1,
    simTime: 0,
    mode: 'flight',
    playerId: 1,
    meta: { seed: 1 },
    entityList: [{
      id: 1,
      type: 'ship',
      alive: true,
      team: 0,
      pos: { x: 0, z: 0 },
      vel: { x: 0, z: 0 },
      rot: 0,
      mass: 18,
      radius: 14,
      hull: 140,
      hullMax: 140,
      shield: 40,
      shieldMax: 55,
      data: { defId: 'ship_kestrel', scenarioAlias: 'player' },
    }],
    input: { moveX: 0, moveZ: 0, turnIntent: 0, boost: false, keys: {} },
  });
  assert.equal(surface.entities[0].shield, 40);
  assert.equal(surface.entities[0].shieldMax, 55);
  const fromSurface = bindEntity({
    id: surface.entities[0].id,
    type: 'ship',
    alive: true,
    isPlayer: true,
    radius: surface.entities[0].radius,
    shield: surface.entities[0].shield,
    shieldMax: surface.entities[0].shieldMax,
    pos: surface.entities[0].pos,
    data: { defId: 'ship_kestrel' },
  });
  assert.equal(fromSurface.shieldGeometryRadius, 14);
  assert.equal((fromSurface.effects || []).some((effect) => effect.kind === 'shield'), false);
  const defOnly = bindEntity({
    id: 'pilot',
    type: 'ship',
    alive: true,
    radius: 14,
    pos: { x: 0, z: 0 },
    data: { defId: 'ship_kestrel' },
  });
  assert.equal(defOnly.shieldGeometryRadius, null);
  assert.equal((defOnly.effects || []).some((effect) => effect.kind === 'shield'), false);
  assert.equal(LIMITATIONS.some((line) => /def shield stat/.test(line)), false);
  assert.equal(LIMITATIONS.some((line) => line.includes('shieldMax') && line.includes('separate measurement')), true);
});

test('a presented shield disc is measured independently of the live shell', () => {
  const mismatched = bindEntity({
    id: 'pilot',
    type: 'ship',
    alive: true,
    isPlayer: true,
    radius: 14,
    shield: 40,
    shieldMax: 55,
    presentedShieldRadius: 55,
    pos: { x: 0, z: 0 },
    data: { defId: 'ship_kestrel' },
  });
  assert.equal(mismatched.shieldGeometryRadius, 14);
  assert.equal(mismatched.effects.find((effect) => effect.kind === 'shield').radius, 55);
  const witness = healthyWitness();
  witness.objects[0] = {
    ...witness.objects[0],
    shieldGeometryRadius: mismatched.shieldGeometryRadius,
    effects: mismatched.effects,
  };
  const fails = highFails(analyzeWitness(witness));
  assert.equal(fails.some((row) => row.kind === 'shield-geometry-mismatch'), true);
});

test('copying the expected keep-out into presentedRadius fails', () => {
  const witness = healthyWitness();
  const player = witness.objects.find((object) => object.isPlayer);
  player.presentedRadius = player.expectedRadius;
  player.presentationSource = 'unmeasured';
  assert.equal(copiedObservation(witness), true);
  const fails = highFails(analyzeWitness(witness));
  assert.equal(fails.some((row) => row.kind === 'copied-observation'), true);
  assert.equal(fails.some((row) => row.kind === 'silhouette-scale-mismatch'), false);

  const bloated = healthyWitness();
  const hull = bloated.objects.find((object) => object.isPlayer);
  hull.presentedRadius = hull.expectedRadius * 4;
  hull.presentationSource = 'unmeasured';
  const ignored = highFails(analyzeWitness(bloated));
  assert.equal(ignored.some((row) => row.kind === 'silhouette-scale-mismatch'), false);

  const measured = healthyWitness();
  const drawn = measured.objects.find((object) => object.isPlayer);
  drawn.presentedRadius = drawn.expectedRadius * 4;
  drawn.presentationSource = 'measured';
  const scaled = highFails(analyzeWitness(measured));
  assert.equal(scaled.some((row) => row.kind === 'silhouette-scale-mismatch'), true);

  const sample = bindEntity({
    id: 'pilot',
    type: 'ship',
    alive: true,
    isPlayer: true,
    radius: 14,
    pos: { x: 0, z: 0 },
    data: { defId: 'ship_kestrel' },
  });
  const copiedThroughBind = bindEntity({
    id: 'pilot',
    type: 'ship',
    alive: true,
    isPlayer: true,
    radius: 14,
    pos: { x: 0, z: 0 },
    presentedRadius: sample.expectedRadius,
    data: { defId: 'ship_kestrel' },
  });
  assert.equal(copiedThroughBind.presentationSource, 'unmeasured');
  assert.equal(copiedThroughBind.presentedRadius, sample.expectedRadius);
  const boundWitness = healthyWitness();
  boundWitness.objects[0] = {
    ...boundWitness.objects[0],
    presentedRadius: copiedThroughBind.presentedRadius,
    expectedRadius: copiedThroughBind.expectedRadius,
    presentationSource: copiedThroughBind.presentationSource,
  };
  assert.equal(highFails(analyzeWitness(boundWitness)).some((row) => row.kind === 'copied-observation'), true);
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
