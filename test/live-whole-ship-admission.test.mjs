import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import * as THREE from 'three';

import {
  authoredPreloadPlanForEntity,
  invalidatePartsLibraryCaches,
  isPackagedLiveWholeShipFile,
  preloadAuthoredAssetsForEntity,
  preloadAuthoredPartLibrary,
  requiresProductionWholeShipForEntity,
  resolveRequiredWholeShipRecord,
  spawnableShipArchetypePrewarmUrls,
  wholeShipVisualForEntity,
  wrapShipWithAuthoredParts,
} from '../src/render/partsLibrary.js';
import { presentationAllowsTargetLock } from '../src/core/presentationAdmission.js';

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
  'wholeships/pelican_production_v1.glb': 'SF_PELICAN_PRODUCTION_V1',
  'wholeships/mule_production_v1.glb': 'SF_MULE_PRODUCTION_V1',
  'wholeships/drifter_production_v1.glb': 'SF_DRIFTER_PRODUCTION_V1',
  'wholeships/hornet_production_v1.glb': 'SF_HORNET_PRODUCTION_V1',
  'wholeships/ironback_production_v1.glb': 'SF_IRONBACK_PRODUCTION_V1',
  'wholeships/bastion_production_v1.glb': 'SF_BASTION_PRODUCTION_V1',
  'wholeships/atlas_production_v1.glb': 'SF_ATLAS_PRODUCTION_V1',
  'wholeships/ranger_production_v1.glb': 'SF_RANGER_PRODUCTION_V1',
  'wholeships/warden_production_v1.glb': 'SF_WARDEN_PRODUCTION_V1',
  'wholeships/colossus_production_v1.glb': 'SF_COLOSSUS_PRODUCTION_V1',
  'wholeships/leviathan_production_v1.glb': 'SF_LEVIATHAN_PRODUCTION_V1',
  'wholeships/massline_express_liner_v1.glb': 'SF_WHOLESHIP_MASSLINE_EXPRESS_LINER_V1',
  'wholeships/yard_tug.glb': 'SF_WHOLESHIP_YARD_TUG',
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

test('a required ship without an allowed body cannot fall through to modular assembly', () => {
  const entity = makeWasp('unpackaged-required-hull', { defId: 'ship_unpackaged' });
  const options = { releaseMode: true, requiredWholeShip: true };
  assert.deepEqual(authoredPreloadPlanForEntity(entity, options), {},
    'do not request modular accessories for a required body with no live selection');
  assert.throws(() => resolveRequiredWholeShipRecord(entity, [
    makeRecord(`${RELEASE_ROOT}hulls/hull_light.glb`),
    makeRecord(`${RELEASE_ROOT}engines/engine_small.glb`),
  ], options), /required packaged whole-ship selection/i);
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

describe('PQ-193 required roster, liner, and opening kitbash', { concurrency: 1 }, () => {
  const SLOTS = Object.freeze([
    { label: 'ship_kestrel', data: { defId: 'ship_kestrel' }, file: 'wholeships/kestrel.glb' },
    { label: 'ship_wasp', data: { defId: 'ship_wasp' }, file: 'wholeships/wasp_production_v1.glb' },
    { label: 'ship_pelican', data: { defId: 'ship_pelican' }, file: 'wholeships/pelican_production_v1.glb' },
    { label: 'ship_mule', data: { defId: 'ship_mule' }, file: 'wholeships/mule_production_v1.glb' },
    { label: 'ship_drifter', data: { defId: 'ship_drifter' }, file: 'wholeships/drifter_production_v1.glb' },
    { label: 'ship_hornet', data: { defId: 'ship_hornet' }, file: 'wholeships/hornet_production_v1.glb' },
    { label: 'ship_ironback', data: { defId: 'ship_ironback' }, file: 'wholeships/ironback_production_v1.glb' },
    { label: 'ship_bastion', data: { defId: 'ship_bastion' }, file: 'wholeships/bastion_production_v1.glb' },
    { label: 'ship_atlas', data: { defId: 'ship_atlas' }, file: 'wholeships/atlas_production_v1.glb' },
    { label: 'ship_ranger', data: { defId: 'ship_ranger' }, file: 'wholeships/ranger_production_v1.glb' },
    { label: 'ship_warden', data: { defId: 'ship_warden' }, file: 'wholeships/warden_production_v1.glb' },
    { label: 'ship_colossus', data: { defId: 'ship_colossus' }, file: 'wholeships/colossus_production_v1.glb' },
    { label: 'ship_leviathan', data: { defId: 'ship_leviathan' }, file: 'wholeships/leviathan_production_v1.glb' },
    { label: 'express-liner', data: { defId: 'ship_mule', trafficRole: 'express' }, file: 'wholeships/massline_express_liner_v1.glb' },
    { label: 'smuggler', data: { defId: 'ship_drifter', trafficRole: 'smuggler' }, file: 'wholeships/drifter_production_v1.glb' },
    { label: 'pirate', data: { defId: 'ship_hornet', trafficRole: 'pirate' }, file: 'wholeships/hornet_production_v1.glb' },
    { label: 'recovery-tug', data: { defId: 'ship_mule', assetRef: 'asset.slice.meridian_recovery_tug' }, file: 'wholeships/yard_tug.glb' },
  ]);

  for (const slot of SLOTS) {
    test(`${slot.label} empty substrate publishes the packaged complete body`, async () => {
      const renderer = {};
      const scene = new THREE.Scene();
      const entity = {
        id: `pq193-${slot.label}`,
        type: 'ship',
        alive: true,
        team: 1,
        radius: 12,
        pos: { x: 0, z: 0 },
        data: { sectorId: 'sector_helios_prime', ...slot.data },
      };
      const loads = [];
      const loadAuthoredPart = async (url) => {
        loads.push(relativeFile(url));
        return makeRecord(url);
      };
      const options = {
        releaseMode: true,
        loadAuthoredPart,
      };
      const harness = installFlightQueueHarness(scene);
      try {
        assert.equal(requiresProductionWholeShipForEntity(entity), true, slot.label);
        const selection = wholeShipVisualForEntity(entity, options);
        assert.equal(selection && selection.file, slot.file, slot.label);
        assert.equal(isPackagedLiveWholeShipFile(selection.file), true, slot.label);
        await preloadAuthoredPartLibrary(renderer, options);
        const substrate = emptySubstrate();
        assert.equal(substrate.visible, false);
        const boundary = wrapShipWithAuthoredParts(entity, substrate, options);
        assert.equal(substrate.visible, false);
        entity.mesh = boundary;
        scene.add(boundary);
        boundary.userData.requestAuthoredUpgrade(renderer, scene);
        const state = await drainQueuedUpgrade(harness.scheduledFrames, boundary);
        assert.ok(loads.includes(slot.file), `${slot.label} loads=${JSON.stringify(loads)}`);
        assert.equal(state, 'authored', `${slot.label} must publish the complete body`);
        assert.equal(boundary.userData.authoredVisualRoot === 'procedural-fallback', false);
        assert.equal(substrate.visible, false, 'the substrate is never a visible stand-in');
        assert.equal(presentationAllowsTargetLock(entity, window.SF.state), true, 'the published body can be locked');
      } finally {
        harness.restore();
        invalidatePartsLibraryCaches(renderer);
      }
    });

    test(`${slot.label} missing body leaves an empty, untargetable substrate`, async () => {
      const renderer = {};
      const scene = new THREE.Scene();
      const entity = makeWasp(`missing-${slot.label}`, slot.data);
      const substrate = emptySubstrate();
      const loads = [];
      const warnings = [];
      const priorWarn = console.warn;
      console.warn = (...args) => warnings.push(args.map(String).join(' '));
      const options = {
        releaseMode: true,
        libraryScope: `missing-${slot.label}`,
        // Even with modular records resident, they cannot stand in for the missing body.
        bootstrapPlan: { hull: ['hulls/hull_light.glb'], engine: ['engines/engine_small.glb'] },
        loadAuthoredPart: async (url) => {
          loads.push(relativeFile(url));
          return relativeFile(url) === slot.file ? null : makeRecord(url);
        },
      };
      const harness = installFlightQueueHarness(scene);
      try {
        await preloadAuthoredPartLibrary(renderer, options);
        const boundary = wrapShipWithAuthoredParts(entity, substrate, options);
        entity.mesh = boundary;
        scene.add(boundary);
        boundary.userData.requestAuthoredUpgrade(renderer, scene);
        assert.equal(await drainQueuedUpgrade(harness.scheduledFrames, boundary), 'unavailable');
        assert.ok(loads.includes(slot.file), 'the exact body was requested');
        assert.equal(substrate.visible, false);
        let visibleMeshes = 0;
        boundary.traverseVisible((node) => { if (node.isMesh) visibleMeshes++; });
        assert.equal(visibleMeshes, 0, 'no modular hull, engine, or other stand-in is published');
        assert.equal(presentationAllowsTargetLock(entity, window.SF.state), false);
        assert.ok(warnings.some((message) => /no substitute visual published/.test(message)));
      } finally {
        console.warn = priorWarn;
        harness.restore();
        invalidatePartsLibraryCaches(renderer);
      }
    });
  }

  test('a delayed Drifter stays empty until that same complete body publishes', async () => {
    const renderer = {};
    const scene = new THREE.Scene();
    const entity = makeWasp('delayed-drifter', { defId: 'ship_drifter' });
    const file = 'wholeships/drifter_production_v1.glb';
    const loads = [];
    let releaseBody;
    const bodyReady = new Promise((resolve) => { releaseBody = resolve; });
    const options = {
      releaseMode: true,
      libraryScope: 'delayed-drifter',
      bootstrapPlan: {},
      loadAuthoredPart: async (url) => {
        loads.push(relativeFile(url));
        await bodyReady;
        return makeRecord(url);
      },
    };
    const harness = installFlightQueueHarness(scene);
    try {
      const substrate = emptySubstrate();
      const boundary = wrapShipWithAuthoredParts(entity, substrate, options);
      entity.mesh = boundary;
      scene.add(boundary);
      boundary.userData.requestAuthoredUpgrade(renderer, scene);
      await drainQueuedUpgrade(harness.scheduledFrames, boundary, 40);
      assert.deepEqual(loads, [file], 'only the complete body is requested');
      assert.equal(substrate.visible, false);
      assert.equal(presentationAllowsTargetLock(entity, window.SF.state), false);
      let visibleMeshes = 0;
      boundary.traverseVisible((node) => { if (node.isMesh) visibleMeshes++; });
      assert.equal(visibleMeshes, 0, 'decode never exposes a temporary drawable');
      releaseBody();
      assert.equal(await drainQueuedUpgrade(harness.scheduledFrames, boundary), 'authored');
      assert.deepEqual(loads, [file], 'publication keeps the original body identity');
      assert.equal(substrate.visible, false);
      assert.equal(presentationAllowsTargetLock(entity, window.SF.state), true);
    } finally {
      releaseBody();
      harness.restore();
      invalidatePartsLibraryCaches(renderer);
    }
  });
});
