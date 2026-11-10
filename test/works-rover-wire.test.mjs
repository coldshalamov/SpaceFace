// PQ-131.01 — authored Rover source/release/package and live-wire contract.
// Headless native coverage for the authored Rover asset identity, exact hooks, and async owner
// lifecycle. The browser route separately proves the player-facing surface and appearance.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';

import { WORKS_PARTS } from '../src/ui/asteroid/worksPartLoader.js';
import { sceneFromGlbJson } from '../scripts/lib/renderPackageRuntimeTable.mjs';

const ROOT = new URL('../', import.meta.url);
const require = createRequire(import.meta.url);
const { parse } = require(require.resolve('@babel/parser', {
  paths: [process.env.SPACEFACE_DEPS_ROOT || process.cwd()],
}));
const SOURCE_PATH = 'assets/ships/parts/works/place_works_rover.glb';
const RELEASE_PATH = 'assets/ships/release/parts/works/place_works_rover.glb';
const PACKAGE_META_PATH = 'assets/ships/release/render-packages/works-rover/render-package.json';
const PACKAGE_GLB_PATH = 'assets/ships/release/render-packages/works-rover/render.glb';
const REQUIRED_HOOKS = [
  'boom_pivot', 'bit_tip',
  'hopper_fill_0', 'hopper_fill_1', 'hopper_fill_2', 'hopper_fill_3', 'hopper_fill_4',
  'hopper_lid', 'lamp_socket', 'vent_stack', 'track_L', 'track_R', 'scar_plate',
];

function pathUrl(path) {
  return new URL(path, ROOT);
}

const RENDERER_SOURCE = readFileSync(pathUrl('src/ui/asteroid/asteroidRenderer3d.js'), 'utf8');

function productionFunctionSource(name) {
  let found = null;
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'FunctionDeclaration' && node.id?.name === name) found = node;
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object' && value.type) visit(value);
    }
  };
  visit(parse(RENDERER_SOURCE, { sourceType: 'module' }));
  assert.ok(found, `${name} must remain an executable renderer function`);
  return RENDERER_SOURCE.slice(found.start, found.end);
}

const LOAD_AUTHORED_ROVER = productionFunctionSource('loadAuthoredRover');
const ADMIT_TERRAIN = productionFunctionSource('admitTerrain');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function roverLoadFixture({ assetPromise, pipelinePromise = Promise.resolve(true) }) {
  const events = [];
  const logs = [];
  const state = { group: null, loadPromise: null, ready: false, failed: false };
  const rover = { visible: false };
  const pipelineStarted = deferred();
  const loader = {
    loadWorksPart(id) { events.push(`load:${id}`); return assetPromise; },
    releaseWorksPart(group) { events.push('release'); return group; },
  };
  const scope = {
    authoredRoverState: state,
    authoredRoverGen: 0,
    worksTearingDown: false,
    disposed: false,
    glTeardownDone: false,
    ensureWorksLoader: () => loader,
    installAuthoredRover(group) {
      state.group = group;
      rover.visible = !!group;
      return true;
    },
    queueWorksPipelines() {
      pipelineStarted.resolve();
      return pipelinePromise;
    },
    rover,
    console: { error(...args) { logs.push(args); } },
  };
  return {
    load: runInNewContext(`(${LOAD_AUTHORED_ROVER})`, scope),
    events,
    logs,
    pipelineStarted: pipelineStarted.promise,
    scope,
    state,
    rover,
  };
}

function terrainFixture({ pipelinePromise }) {
  const logs = [];
  const pipelineStarted = deferred();
  const scope = {
    terrainGeneration: 0,
    terrainReady: false,
    terrainFailed: false,
    worksTearingDown: false,
    disposed: false,
    glTeardownDone: false,
    rockGroup: {},
    queueWorksPipelines() {
      pipelineStarted.resolve();
      return pipelinePromise;
    },
    console: { error(...args) { logs.push(args); } },
  };
  return {
    admit: runInNewContext(`(${ADMIT_TERRAIN})`, scope),
    logs,
    pipelineStarted: pipelineStarted.promise,
    scope,
  };
}

function bytes(path) {
  return readFileSync(pathUrl(path));
}

function sha256(payload) {
  return createHash('sha256').update(payload).digest('hex');
}

function glbJson(path) {
  const payload = bytes(path);
  assert.equal(payload.toString('ascii', 0, 4), 'glTF', `${path} must be a GLB`);
  assert.equal(payload.readUInt32LE(4), 2, `${path} must use GLB 2.0`);
  let offset = 12;
  while (offset + 8 <= payload.length) {
    const length = payload.readUInt32LE(offset);
    const type = payload.readUInt32LE(offset + 4);
    const chunk = payload.subarray(offset + 8, offset + 8 + length);
    if (type === 0x4e4f534a) return JSON.parse(chunk.toString('utf8').replace(/\s+$/u, ''));
    offset += 8 + length;
  }
  throw new Error(`${path} contains no JSON chunk`);
}

function nodeNames(gltf) {
  return new Set((gltf.nodes || []).map((node) => node.name).filter(Boolean));
}

test('authored Rover source, release, and pilot bindings are hash-identical', () => {
  const source = bytes(SOURCE_PATH);
  const release = bytes(RELEASE_PATH);
  const parts = JSON.parse(readFileSync(pathUrl('assets/ships/parts/parts_manifest.json'), 'utf8'));
  const releaseManifest = JSON.parse(readFileSync(pathUrl('assets/ships/release/release_manifest.json'), 'utf8'));
  const pilots = JSON.parse(readFileSync(pathUrl('assets/ships/render-packages/pilots.json'), 'utf8'));
  const part = parts.parts.find((row) => row.id === 'place_works_rover');
  const releaseRow = releaseManifest.assets.find((row) => row.id === 'place_works_rover');
  const pilot = pilots.pilots.find((row) => row.key === 'works-rover');

  assert.ok(part, 'parts manifest must register place_works_rover');
  assert.ok(releaseRow, 'release manifest must register place_works_rover');
  assert.ok(pilot, 'render-package pilots must register works-rover');
  assert.equal(part.file, 'works/place_works_rover.glb');
  assert.equal(part.bytes, source.length);
  assert.equal(releaseRow.source, `assets/ships/parts/${part.file}`);
  assert.equal(releaseRow.release, RELEASE_PATH);
  assert.equal(releaseRow.sourceSha256, sha256(source));
  assert.equal(releaseRow.releaseSha256, sha256(release));
  assert.equal(releaseRow.sourceBytes, source.length);
  assert.equal(releaseRow.releaseBytes, release.length);
  assert.equal(pilot.runtimeAssetId, 'place_works_rover');
  assert.equal(pilot.sourceUrl, RELEASE_PATH);
  assert.equal(pilot.releaseSha256, sha256(release));
  assert.equal(pilot.releaseBytes, release.length);
  assert.equal(pilot.sceneRoot, true);
});

test('combined authored GLB exposes exact Rover hooks and only live LOD0/LOD1 roots', () => {
  const gltf = glbJson(SOURCE_PATH);
  const names = nodeNames(gltf);
  const contract = gltf.asset?.extras?.spacefaceAsset;
  assert.equal(contract?.assetId, 'place_works_rover');
  assert.equal(contract?.slot, 'place');
  assert.equal(contract?.category, 'works');
  assert.equal(contract?.forward, '+X');
  assert.equal(contract?.up, '+Y');
  assert.equal(contract?.starboard, '+Z');
  assert.equal(contract?.unit, 'metre');
  assert.equal(contract?.lodPolicy, undefined);
  assert.ok(names.has('rover'), 'canonical LOD0 root is required');
  assert.ok(names.has('LOD1_rover'), 'canonical LOD1 root is required');
  for (const hook of REQUIRED_HOOKS) {
    assert.ok(names.has(hook), `missing exact LOD0 hook ${hook}`);
    assert.ok(names.has(`LOD1_${hook}`), `missing exact LOD1 hook ${hook}`);
  }
  assert.equal([...names].some((name) => /^LOD2(?:_|$)/u.test(name)), false,
    'LOD2 must remain authoring-only and absent from the combined live source');
  assert.equal(gltf.scenes?.[0]?.extras?.spacefaceAsset?.assetId, 'place_works_rover');
  const roverNode = (gltf.nodes || []).find((node) => node.name === 'rover');
  const siteNode = (gltf.nodes || []).find((node) => node.name === 'LOD1_rover');
  assert.equal(roverNode?.extras?.spacefaceAsset?.assetId, 'place_works_rover');
  assert.equal(siteNode?.extras?.spacefaceAsset?.assetId, 'place_works_rover');
});

test('works loader and renderer use the single-flight authored seam with no procedural Rover import', () => {
  const loaderSource = readFileSync(pathUrl('src/ui/asteroid/worksPartLoader.js'), 'utf8');
  const rendererSource = readFileSync(pathUrl('src/ui/asteroid/asteroidRenderer3d.js'), 'utf8');
  const previewSource = readFileSync(pathUrl('src/render/asteroidInteriorPreview.js'), 'utf8');
  const entry = WORKS_PARTS.place_works_rover;

  assert.ok(entry);
  assert.equal(entry.lod0, RELEASE_PATH);
  assert.equal(entry.lod1, RELEASE_PATH);
  assert.deepEqual(entry.hooks, REQUIRED_HOOKS);
  assert.match(loaderSource, /createAuthoredAssetLease/);
  assert.match(loaderSource, /disposeAuthoredAssetRuntime/);
  assert.doesNotMatch(loaderSource, /new\s+KTX2Loader/u);
  assert.doesNotMatch(loaderSource, /setTranscoderPath/u);
  assert.match(rendererSource, /loadWorksPart\('place_works_rover'\)/u);
  assert.match(rendererSource, /authoredRoverState\.loadPromise/u);
  assert.match(rendererSource, /releaseWorksPart\(group\)/u);
  assert.doesNotMatch(rendererSource, /\bmakeRover\b/u);
  assert.doesNotMatch(previewSource, /export function makeRover/u);
});

test('Rover and terrain continuations honor live ownership while preserving active failures', async () => {
  const canceledNull = deferred();
  const canceledLoad = roverLoadFixture({ assetPromise: canceledNull.promise });
  const canceledNullResult = canceledLoad.load();
  canceledLoad.scope.worksTearingDown = true;
  canceledLoad.scope.authoredRoverGen += 1;
  canceledNull.resolve(null);
  assert.equal(await canceledNullResult, null);
  assert.equal(canceledLoad.state.failed, false);
  assert.deepEqual(canceledLoad.logs, [], 'a cancelled null load is not an authored-asset failure');

  const canceledReject = deferred();
  const canceledRejectedLoad = roverLoadFixture({ assetPromise: canceledReject.promise });
  const canceledRejectResult = canceledRejectedLoad.load();
  canceledRejectedLoad.scope.disposed = true;
  canceledRejectedLoad.scope.authoredRoverGen += 1;
  canceledReject.reject(new Error('context retired'));
  assert.equal(await canceledRejectResult, null);
  assert.equal(canceledRejectedLoad.state.failed, false);
  assert.deepEqual(canceledRejectedLoad.logs, [], 'a cancelled load rejection is silent');

  const activeFailure = deferred();
  const activeLoad = roverLoadFixture({ assetPromise: activeFailure.promise });
  const activeFailureResult = activeLoad.load();
  activeFailure.reject(new Error('active asset failure'));
  assert.equal(await activeFailureResult, null);
  assert.equal(activeLoad.state.failed, true, 'a live load failure remains observable in readiness');
  assert.equal(activeLoad.logs.length, 1, 'a live load failure keeps its diagnostic');

  const latePipeline = deferred();
  const oldGroup = { id: 'old' };
  const lateLoad = roverLoadFixture({
    assetPromise: Promise.resolve(oldGroup),
    pipelinePromise: latePipeline.promise,
  });
  const lateResult = lateLoad.load();
  await lateLoad.pipelineStarted;
  const newerGroup = { id: 'new' };
  lateLoad.scope.authoredRoverGen += 1;
  lateLoad.state.group = newerGroup;
  lateLoad.state.ready = false;
  lateLoad.rover.visible = true;
  latePipeline.resolve(true);
  assert.equal(await lateResult, null);
  assert.equal(lateLoad.state.group, newerGroup, 'an old admission cannot replace the current group');
  assert.equal(lateLoad.state.ready, false, 'an old admission cannot publish readiness for its successor');
  assert.deepEqual(lateLoad.logs, []);

  const canceledTerrainPipeline = deferred();
  const canceledTerrain = terrainFixture({ pipelinePromise: canceledTerrainPipeline.promise });
  canceledTerrain.admit();
  await canceledTerrain.pipelineStarted;
  canceledTerrain.scope.worksTearingDown = true;
  canceledTerrainPipeline.reject(new Error('context retired'));
  await Promise.resolve();
  assert.equal(canceledTerrain.scope.terrainFailed, false);
  assert.deepEqual(canceledTerrain.logs, [], 'teardown compile cancellation is not a terrain failure');

  const activeTerrainPipeline = deferred();
  const activeTerrain = terrainFixture({ pipelinePromise: activeTerrainPipeline.promise });
  activeTerrain.admit();
  await activeTerrain.pipelineStarted;
  activeTerrainPipeline.reject(new Error('active pipeline failure'));
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(activeTerrain.scope.terrainFailed, true);
  assert.equal(activeTerrain.logs.length, 1, 'a live pipeline failure keeps its diagnostic');
});

test('Rover render package is content-addressed to the selected release', () => {
  const release = bytes(RELEASE_PATH);
  const metadata = JSON.parse(readFileSync(pathUrl(PACKAGE_META_PATH), 'utf8'));
  const packageGltf = glbJson(PACKAGE_GLB_PATH);
  assert.equal(metadata.assetId, 'sf.render.works-rover');
  assert.equal(metadata.provenance?.sourceGlb?.sha256, sha256(release));
  assert.equal(metadata.provenance?.sourceGlb?.bytes, release.length);
  assert.ok(metadata.contentHash);
  assert.ok((metadata.geometry || []).length > 0);
  const names = nodeNames(packageGltf);
  assert.ok(names.has('rover'));
  assert.ok(names.has('LOD1_rover'));
});

test('released runtime table resolves every Rover hook to a real package node', () => {
  const metadata = JSON.parse(readFileSync(pathUrl(PACKAGE_META_PATH), 'utf8'));
  const packageGltf = glbJson(PACKAGE_GLB_PATH);
  const scene = sceneFromGlbJson(packageGltf);
  const plan = [];
  scene.traverse((node) => plan.push(node));
  const markers = metadata.runtime?.markers || [];
  const primitives = metadata.runtime?.primitives || [];
  for (const hook of REQUIRED_HOOKS) {
    const entry = markers.find((candidate) => candidate.name === hook)
      || primitives.find((candidate) => candidate.name === hook);
    assert.ok(entry, `runtime table missing hook ${hook}`);
    assert.equal(plan[entry.planIndex]?.name, hook, `runtime plan does not resolve ${hook}`);
  }
  assert.equal(
    REQUIRED_HOOKS.filter((hook) => markers.some((entry) => entry.name === hook)
      || primitives.some((entry) => entry.name === hook)).length,
    REQUIRED_HOOKS.length,
  );
});
