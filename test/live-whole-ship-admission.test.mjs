import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import * as THREE from 'three';

import {
  invalidatePartsLibraryCaches,
  preloadAuthoredAssetsForEntity,
  preloadAuthoredPartLibrary,
  resolveRequiredWholeShipRecord,
  spawnableShipArchetypePrewarmUrls,
  wholeShipVisualForEntity,
  wrapShipWithAuthoredParts,
} from '../src/render/partsLibrary.js';

function makeStubCanvas() {
  const context = {
    canvas: { width: 256, height: 256 }, fillRect() {}, strokeRect() {}, clearRect() {}, fillText() {}, strokeText() {},
    save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, setTransform() {},
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, rect() {},
    bezierCurveTo() {}, quadraticCurveTo() {}, fill() {}, stroke() {}, drawImage() {},
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
    createImageData(width, height) { return { data: new Uint8ClampedArray(width * height * 4), width, height }; },
    getImageData(_x, _y, width, height) { return { data: new Uint8ClampedArray(width * height * 4), width, height }; },
    putImageData() {}, measureText() { return { width: 10 }; },
    fillStyle: '', strokeStyle: '', font: '', lineWidth: 1, globalAlpha: 1,
  };
  return { width: 256, height: 256, getContext: () => context, style: {}, addEventListener() {} };
}

globalThis.document = {
  createElement: (tag) => tag === 'canvas' ? makeStubCanvas() : { style: {}, appendChild() {}, addEventListener() {} },
};

const RELEASE_ROOT = 'assets/ships/release/parts/';
const ASSET_ID_BY_FILE = Object.freeze({
  'wholeships/kestrel.glb': 'SF_K0_KESTREL_BORROWED_TIME_V4',
  'wholeships/wasp_production_v1.glb': 'SF_WASP_PRODUCTION_V1',
  'wholeships/ashline_dart.glb': 'SF_WHOLESHIP_ASHLINE_DART',
  'wholeships/ashline_lode.glb': 'SF_WHOLESHIP_ASHLINE_LODE',
  'wholeships/ashline_rig.glb': 'SF_WHOLESHIP_ASHLINE_RIG',
  'wholeships/helios_lark.glb': 'SF_WHOLESHIP_HELIOS_LARK',
  'wholeships/helios_cradle.glb': 'SF_WHOLESHIP_HELIOS_CRADLE',
  'wholeships/helios_span.glb': 'SF_WHOLESHIP_HELIOS_SPAN',
  'wholeships/ore_barge.glb': 'SF_WHOLESHIP_ORE_BARGE',
  'wholeships/repair_tender.glb': 'SF_WHOLESHIP_REPAIR_TENDER',
  'wholeships/salvage_cutter.glb': 'SF_WHOLESHIP_SALVAGE_CUTTER',
  'wholeships/survey_pin.glb': 'SF_WHOLESHIP_SURVEY_PIN',
});

function relativeFile(url) {
  return String(url || '').replace(/\\/g, '/').replace(RELEASE_ROOT, '');
}

function makeRecord(url) {
  const file = relativeFile(url);
  const geometry = new THREE.BoxGeometry(1, 0.5, 0.5);
  const material = new THREE.MeshStandardMaterial({ color: 0x8090a0, roughness: 0.7, metalness: 0.3 });
  return {
    url,
    assetId: ASSET_ID_BY_FILE[file] || `FIXTURE_${file}`,
    bounds: { min: [-0.5, -0.25, -0.25], max: [0.5, 0.25, 0.25], size: [1, 0.5, 0.5], center: [0, 0, 0] },
    primitives: [{
      key: `${url}#fixture`,
      name: 'LOD0_Body',
      geometry,
      material,
      matrix: new THREE.Matrix4(),
      tags: Object.freeze({ lod: 'lod0', tint: 'hull' }),
    }],
    markers: [],
    residency: { key: `${url}::hull`, generation: 1, state: 'resident' },
  };
}

function emptySubstrate() {
  const root = new THREE.Group();
  root.visible = false;
  root.userData.authoredAdmissionSubstrate = true;
  return root;
}

function makeWasp(id, extraData = {}) {
  return {
    id,
    type: 'ship',
    alive: true,
    team: 1,
    factionId: 'faction_reach',
    radius: 12,
    pos: { x: 0, z: 0 },
    data: { defId: 'ship_wasp', sectorId: 'sector_helios_prime', ...extraData },
  };
}

async function drainQueuedUpgrade(scheduledFrames, boundary, timeoutTurns = 80) {
  for (let i = 0; i < 8 && scheduledFrames.length; i++) scheduledFrames.shift()();
  for (let turn = 0; turn < timeoutTurns; turn++) {
    const state = boundary.userData && boundary.userData.authoredAssetState;
    if (state === 'authored' || state === 'unavailable' || state === 'fallback-after-error'
      || state === 'none-build-failed') {
      return state;
    }
    await Promise.resolve();
    if (scheduledFrames.length) scheduledFrames.shift()();
  }
  return boundary.userData && boundary.userData.authoredAssetState;
}

function installFlightQueueHarness(scene) {
  const scheduledFrames = [];
  const priorWindow = globalThis.window;
  const priorRaf = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = (callback) => {
    scheduledFrames.push(callback);
    return scheduledFrames.length;
  };
  globalThis.window = {
    SF: {
      state: {
        mode: 'loading',
        player: null,
        world: { currentSectorId: 'sector_helios_prime' },
        render: {
          scene,
          compileObjectPipelines() { return Promise.resolve({ skipped: true }); },
          prepareAuthoredGpuResidency() { return Promise.resolve({ skipped: true }); },
        },
      },
    },
  };
  return {
    scheduledFrames,
    restore() {
      if (priorRaf === undefined) delete globalThis.requestAnimationFrame;
      else globalThis.requestAnimationFrame = priorRaf;
      if (priorWindow === undefined) delete globalThis.window;
      else globalThis.window = priorWindow;
    },
  };
}

test('spawnable prewarm URLs include the Ashline rig body', () => {
  const urls = spawnableShipArchetypePrewarmUrls();
  assert.ok(urls.includes('wholeships/ashline_rig.glb'),
    'sector prewarm must name the rig body used by live reaver-family hostiles');
});

test('stale hull records omit the rig and the error lists every loaded whole-ship', () => {
  const entity = makeWasp('stale-hull-wasp', { lootTableId: 'reaver_pirate' });
  const hulls = [
    makeRecord(`${RELEASE_ROOT}wholeships/kestrel.glb`),
    makeRecord(`${RELEASE_ROOT}wholeships/wasp_production_v1.glb`),
  ];
  const selection = wholeShipVisualForEntity(entity, { requiredWholeShip: true });
  assert.equal(selection.file, 'wholeships/ashline_rig.glb');

  let message = '';
  assert.throws(() => {
    try {
      resolveRequiredWholeShipRecord(entity, hulls, { releaseMode: true, requiredWholeShip: true });
    } catch (error) {
      message = error && error.message ? error.message : String(error);
      throw error;
    }
  }, /did not pass the live authored-asset loader/);

  console.log('UNTRUNCATED whole-ship hull records:\n' + message);
  assert.match(message, /Loaded whole-ship hull records:/);
  assert.match(message, /wholeships\/kestrel\.glb/);
  assert.match(message, /wholeships\/wasp_production_v1\.glb/);
  assert.equal(/ashline_rig\.glb \(/.test(message), false,
    'the stale slot must not claim the rig was loaded');
});

test('admission re-reads the live whole-ship plan after identity lands during decode', async () => {
  const renderer = {};
  const entity = makeWasp('prefetch-identity-wasp');
  const loads = [];
  const loadAuthoredPart = async (url) => {
    loads.push(relativeFile(url));
    if (String(url).includes('wasp_production_v1.glb')) {
      entity.data.lootTableId = 'reaver_pirate';
    }
    return makeRecord(url);
  };
  const options = { releaseMode: true, loadAuthoredPart, requiredWholeShip: true };

  await preloadAuthoredPartLibrary(renderer, options);
  const library = await preloadAuthoredAssetsForEntity(renderer, entity, options);
  const hulls = library.get('hull') || [];
  const selection = wholeShipVisualForEntity(entity, options);

  assert.equal(selection.file, 'wholeships/ashline_rig.glb');
  assert.equal(entity.data.lootTableId, 'reaver_pirate');
  assert.ok(loads.includes('wholeships/wasp_production_v1.glb'),
    'the first captured plan still decodes the Wasp production body');
  assert.ok(loads.includes('wholeships/ashline_rig.glb'),
    'admission must request the rig once lootTableId lands during that decode');
  assert.ok(hulls.some((record) => String(record.url || '').includes('ashline_rig.glb')),
    'the hull slot must contain the live rig record before compose');
  assert.equal(
    resolveRequiredWholeShipRecord(entity, hulls, options).assetId,
    'SF_WHOLESHIP_ASHLINE_RIG',
  );

  invalidatePartsLibraryCaches(renderer);
});

describe('live authored publication', { concurrency: 1 }, () => {
test('a live reaver-family Wasp publishes its rig body after identity lands during prefetch', async () => {
  const renderer = {};
  const scene = new THREE.Scene();
  const entity = makeWasp('live-reaver-wasp');
  const warnings = [];
  const origWarn = console.warn;
  console.warn = (...args) => {
    warnings.push(args.map((arg) => (
      arg instanceof Error ? `${arg.name}: ${arg.message}` : String(arg)
    )).join('\n'));
    origWarn.apply(console, args);
  };
  const loads = [];
  const loadAuthoredPart = async (url) => {
    loads.push(relativeFile(url));
    if (String(url).includes('wasp_production_v1.glb')) {
      entity.data.lootTableId = 'reaver_pirate';
    }
    return makeRecord(url);
  };
  const options = { releaseMode: true, loadAuthoredPart, requiredWholeShip: true };
  const harness = installFlightQueueHarness(scene);

  try {
    await preloadAuthoredPartLibrary(renderer, options);
    const boundary = wrapShipWithAuthoredParts(entity, emptySubstrate(), options);
    entity.mesh = boundary;
    scene.add(boundary);
    boundary.userData.requestAuthoredUpgrade(renderer, scene);
    const state = await drainQueuedUpgrade(harness.scheduledFrames, boundary);

    const substituteWarnings = warnings.filter((text) => /no substitute visual published/i.test(text));
    assert.deepEqual(substituteWarnings, [],
      `a loadable required whole-ship must not fail closed as an invisible hull; loads=${JSON.stringify(loads)} lootTableId=${entity.data.lootTableId}`);
    assert.equal(state, 'authored',
      'the live entity must publish the rig once its current whole-ship identity is known');
    assert.equal(boundary.userData.authoredVisualRoot === 'none-build-failed', false);
  } finally {
    console.warn = origWarn;
    harness.restore();
    invalidatePartsLibraryCaches(renderer);
  }
});

test('a 47-A Reaver interceptor Wasp publishes the rig when assetRef is present at wrap', async () => {
  const renderer = {};
  const scene = new THREE.Scene();
  const entity = makeWasp('47a-interceptor', { assetRef: 'enemy_reaver_interceptor' });
  const warnings = [];
  const origWarn = console.warn;
  console.warn = (...args) => {
    warnings.push(args.map((arg) => (
      arg instanceof Error ? `${arg.name}: ${arg.message}` : String(arg)
    )).join('\n'));
  };
  const loads = [];
  const loadAuthoredPart = async (url) => {
    loads.push(relativeFile(url));
    return makeRecord(url);
  };
  const options = { releaseMode: true, loadAuthoredPart, requiredWholeShip: true };
  const harness = installFlightQueueHarness(scene);

  try {
    await preloadAuthoredPartLibrary(renderer, options);
    const boundary = wrapShipWithAuthoredParts(entity, emptySubstrate(), options);
    entity.mesh = boundary;
    scene.add(boundary);
    boundary.userData.requestAuthoredUpgrade(renderer, scene);
    const state = await drainQueuedUpgrade(harness.scheduledFrames, boundary);
    assert.ok(loads.includes('wholeships/ashline_rig.glb'), `loads=${JSON.stringify(loads)}`);
    assert.deepEqual(warnings.filter((text) => /no substitute visual published/i.test(text)), []);
    assert.equal(state, 'authored');
  } finally {
    console.warn = origWarn;
    harness.restore();
    invalidatePartsLibraryCaches(renderer);
  }
});

test('a required whole-ship that does not load is a failed check, not a passing warning', async () => {
  const renderer = {};
  const scene = new THREE.Scene();
  const entity = makeWasp('missing-rig-wasp', { lootTableId: 'reaver_pirate' });
  const warnings = [];
  const origWarn = console.warn;
  console.warn = (...args) => {
    warnings.push(args.map((arg) => (
      arg instanceof Error ? `${arg.name}: ${arg.message}` : String(arg)
    )).join('\n'));
  };
  const loadAuthoredPart = async (url) => {
    if (String(url).includes('ashline_rig.glb')) return null;
    return makeRecord(url);
  };
  const options = { releaseMode: true, loadAuthoredPart, requiredWholeShip: true };
  const harness = installFlightQueueHarness(scene);

  try {
    await preloadAuthoredPartLibrary(renderer, options);
    const boundary = wrapShipWithAuthoredParts(entity, emptySubstrate(), options);
    entity.mesh = boundary;
    scene.add(boundary);
    boundary.userData.requestAuthoredUpgrade(renderer, scene);
    const state = await drainQueuedUpgrade(harness.scheduledFrames, boundary);
    const published = state === 'authored';
    const silentPass = warnings.some((text) => /no substitute visual published/i.test(text)) && published;
    assert.equal(silentPass, false);
    assert.equal(published, false,
      'when the required GLB does not load, admission must not claim a published ship');
    assert.ok(
      state === 'unavailable' || state === 'fallback-after-error' || warnings.some((text) => /no substitute|incomplete/i.test(text)),
      'the missing required body must remain unpublished',
    );
    assert.equal(
      warnings.some((text) => /no substitute visual published|incomplete/i.test(text)) && published !== true,
      true,
      'the live-admission check must go red when a required whole-ship is unpublished',
    );
  } finally {
    console.warn = origWarn;
    harness.restore();
    invalidatePartsLibraryCaches(renderer);
  }
});
});
