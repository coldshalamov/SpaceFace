import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';

import {
  getPrecompileKeepAliveDiagnostics,
  invalidatePrecompileState,
  precompileGlobalPipelines,
  precompilePipelines,
} from '../src/render/precompile.js';
import { getAuthoredUpgradeQueueStats } from '../src/render/partsLibrary.js';
import {
  createShipAuxPool,
  warmActivePostProcessFrame,
} from '../src/render/renderer.js';

test('deferred sector shader precompile admits one archetype per browser yield', async () => {
  const preparedSubjects = [];
  let browserYields = 0;
  const renderer = {
    compileAsync: async () => {},
    info: { programs: [] },
  };
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 10000);
  const result = await precompilePipelines(renderer, scene, camera, {
    sector: {
      id: 'sector_incremental_probe',
      trafficPerMin: 4,
      enemyDensity: 0,
      security: 1,
      tier: 1,
      pois: [],
    },
    incremental: true,
    preparePipelines: async (subject) => {
      preparedSubjects.push(subject);
      assert.notEqual(subject.name, 'SF_Precompile_Staging');
      assert.equal(subject.parent?.name, 'SF_Precompile_Staging');
      assert.equal(subject.parent?.parent, scene);
    },
    yieldToMain: async () => { browserYields++; },
  });

  assert.equal(result.skipped, false);
  assert.equal(result.shipArchetypes, preparedSubjects.length);
  assert.ok(preparedSubjects.length > 1, 'the fixture must exercise multiple archetypes');
  assert.equal(browserYields, preparedSubjects.length + 1, 'yield once before work and after each admitted archetype');
  assert.equal(scene.getObjectByName('SF_Precompile_Staging'), undefined);
});

test('synthetic shader precompile creates zero authored asset residency demand', async () => {
  const source = readFileSync(new URL('../src/render/precompile.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /preloadAuthoredPartLibrary/);

  let legacyCompileCalls = 0;
  let exactTargetPrepareCalls = 0;
  let canopyVariants = [];
  let lateWorldOwners = [];
  let retainedPipelineOwners = [];
  let retainedPipelineLayouts = {};
  let residentWarmCalls = 0;
  const renderer = {
    compileAsync: async () => { legacyCompileCalls++; },
    info: { programs: [] },
  };
  const scene = new THREE.Scene();
  createShipAuxPool(scene);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 10000);
  const result = await precompileGlobalPipelines(renderer, scene, camera, {
    incremental: true,
    video: { particleQuality: 'medium' },
    warmPostProcess: async () => {
      residentWarmCalls++;
      assert.equal(scene.getObjectByName('SF_Precompile_Staging'), undefined,
        'resident warm runs only after synthetic staging detaches');
    },
    preparePipelines: async (subject) => {
      exactTargetPrepareCalls++;
      assert.equal(subject.name, 'SF_Precompile_Global_Pipelines');
      assert.equal(subject.parent?.name, 'SF_Precompile_Staging');
      assert.equal(subject.parent?.parent, scene);
      canopyVariants = [];
      lateWorldOwners = [];
      retainedPipelineOwners = [];
      retainedPipelineLayouts = {};
      subject.traverse((object) => {
        if (object.name === 'SF_Precompile_L5b_Wormhole'
          || object.name === 'Spindle_Locked_Core_Glow') lateWorldOwners.push(object.name);
        if (object.userData?.precompileRetainedPipeline) {
          const id = object.userData.precompileRetainedPipeline;
          retainedPipelineOwners.push(id);
          const material = object.material;
          retainedPipelineLayouts[id] = {
            objectType: object.type,
            materialType: material?.type,
            map: !!material?.map,
            normalMap: !!material?.normalMap,
            aoMap: !!material?.aoMap,
            roughnessMap: !!material?.roughnessMap,
            metalnessMap: !!material?.metalnessMap,
            transmission: material?.transmission,
            clearcoat: material?.clearcoat,
            vertexColors: material?.vertexColors,
            fog: material?.fog,
            transparent: material?.transparent,
            depthWrite: material?.depthWrite,
            tangents: !!object.geometry?.getAttribute?.('tangent'),
            customProgramCacheKey: material?.customProgramCacheKey?.(),
          };
        }
        if (!object.userData?.precompileCanopyVariant) return;
        const material = object.material;
        canopyVariants.push({
          id: object.userData.precompileCanopyVariant,
          physical: material.isMeshPhysicalMaterial === true,
          map: !!material.map,
          normalMap: !!material.normalMap,
          aoMap: !!material.aoMap,
          roughnessMap: !!material.roughnessMap,
          metalnessMap: !!material.metalnessMap,
          transmission: material.transmission,
          transparent: material.transparent,
          depthWrite: material.depthWrite,
          forceSinglePass: material.forceSinglePass,
          dithering: material.dithering,
          tangents: !!object.geometry?.getAttribute?.('tangent'),
        });
      });
    },
  });

  assert.equal(result.skipped, false);
  assert.equal(result.retainedCanopyVariants, 4);
  assert.deepEqual(result.residentBufferWarm, { warmed: true, mode: 'warmPostProcess' });
  assert.equal(residentWarmCalls, 1);
  assert.equal(exactTargetPrepareCalls, 1);
  assert.equal(legacyCompileCalls, 0);
  assert.deepEqual(lateWorldOwners.sort(), ['SF_Precompile_L5b_Wormhole', 'Spindle_Locked_Core_Glow']);
  const expectedRetainedPipelines = [
    'authored-physical-clearcoat-fullmap',
    'authored-physical-fullmap-no-tangent',
    'authored-physical-fullmap-tangent',
    'authored-physical-transmission-fullmap',
    'common-rock-instanced-pbr',
    'fogged-basic-surface',
    'fogged-halo-sprite',
    'hitch-main-plume',
    'mapped-standard-surface',
    'ship-shield-bubble',
  ];
  assert.deepEqual(retainedPipelineOwners.sort(), expectedRetainedPipelines);
  assert.deepEqual(
    getPrecompileKeepAliveDiagnostics(renderer).retainedPipelines.sort(),
    expectedRetainedPipelines,
  );
  assert.deepEqual(retainedPipelineLayouts['common-rock-instanced-pbr'], {
    objectType: 'Mesh',
    materialType: 'MeshStandardMaterial',
    map: true,
    normalMap: true,
    aoMap: true,
    roughnessMap: true,
    metalnessMap: true,
    transmission: undefined,
    clearcoat: undefined,
    vertexColors: true,
    fog: true,
    transparent: false,
    depthWrite: true,
    tangents: false,
    customProgramCacheKey: 'spaceface-common-rock-geology-pbr-v4',
  });
  assert.equal(retainedPipelineLayouts['fogged-halo-sprite'].objectType, 'Sprite');
  assert.equal(retainedPipelineLayouts['fogged-halo-sprite'].materialType, 'SpriteMaterial');
  assert.equal(retainedPipelineLayouts['fogged-halo-sprite'].fog, true);
  assert.equal(retainedPipelineLayouts['fogged-basic-surface'].transparent, true);
  assert.equal(retainedPipelineLayouts['fogged-basic-surface'].depthWrite, false);
  assert.equal(retainedPipelineLayouts['authored-physical-fullmap-tangent'].tangents, true);
  assert.equal(retainedPipelineLayouts['authored-physical-fullmap-no-tangent'].tangents, false);
  assert.equal(retainedPipelineLayouts['authored-physical-transmission-fullmap'].transmission, 0.65);
  assert.equal(retainedPipelineLayouts['authored-physical-transmission-fullmap'].clearcoat, 1);
  assert.equal(retainedPipelineLayouts['authored-physical-clearcoat-fullmap'].transmission, 0);
  assert.equal(retainedPipelineLayouts['authored-physical-clearcoat-fullmap'].clearcoat, 1);
  assert.equal(retainedPipelineLayouts['mapped-standard-surface'].materialType, 'MeshStandardMaterial');
  assert.equal(retainedPipelineLayouts['mapped-standard-surface'].aoMap, false);
  assert.equal(retainedPipelineLayouts['mapped-standard-surface'].metalnessMap, false);
  assert.deepEqual(canopyVariants, [
    {
      id: 'surface', physical: true, map: false, normalMap: false, aoMap: false,
      roughnessMap: true, metalnessMap: true,
      transmission: 0, transparent: true, depthWrite: false,
      forceSinglePass: true, dithering: true, tangents: true,
    },
    {
      id: 'normal-surface-ao', physical: true, map: false, normalMap: true, aoMap: true,
      roughnessMap: true, metalnessMap: true,
      transmission: 0, transparent: true, depthWrite: false,
      forceSinglePass: true, dithering: true, tangents: true,
    },
    {
      id: 'base-normal-surface', physical: true, map: true, normalMap: true, aoMap: false,
      roughnessMap: true, metalnessMap: true,
      transmission: 0, transparent: true, depthWrite: false,
      forceSinglePass: true, dithering: true, tangents: true,
    },
    {
      id: 'base-normal-surface-ao-standard',
      physical: false,
      map: true,
      normalMap: true,
      aoMap: true,
      roughnessMap: true,
      metalnessMap: true,
      transmission: undefined,
      transparent: true,
      depthWrite: false,
      forceSinglePass: true,
      dithering: true,
      tangents: true,
    },
  ]);
  assert.deepEqual(getAuthoredUpgradeQueueStats(scene), { pending: 0, running: false });
  assert.equal(scene.getObjectByName('SF_Precompile_Staging'), undefined);
  const rendererSource = readFileSync(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  const globalPrecompileCalls = rendererSource.split('precompileGlobalPipelines(').slice(1);
  assert.equal(globalPrecompileCalls.length, 2,
    'renderer has exactly the startup and context-restoration global precompile calls');
  for (const call of globalPrecompileCalls) {
    const options = call.slice(call.indexOf('{'), call.indexOf('}).catch'));
    assert.match(options, /warmPostProcess:\s*state\.render\.warmPostProcess/,
      'every global precompile uses the host postprocess warm path');
  }
  const sectorPrecompile = rendererSource.split('precompilePipelines(').slice(1);
  assert.equal(sectorPrecompile.length, 1);
  assert.doesNotMatch(
    sectorPrecompile[0].slice(sectorPrecompile[0].indexOf('{'), sectorPrecompile[0].indexOf('}).catch')),
    /warmPostProcess/,
    'sector-only precompile does not trigger a resident-scene warm draw',
  );
});

test('resident warm uses the active render path priority', () => {
  const calls = [];
  const scene = {};
  const camera = {};
  const graph = {
    render(subject, view, options) {
      calls.push(['renderGraph', subject, view, options]);
    },
  };
  const bloom = {
    render(subject, view) {
      calls.push(['bloom', subject, view]);
    },
  };
  const renderer = {
    render(subject, view) {
      calls.push(['straight', subject, view]);
    },
  };

  assert.equal(warmActivePostProcessFrame({
    video: { renderGraph: true, bloom: true },
    ensureRenderGraph: () => true,
    getRenderGraph: () => graph,
    bloom,
    renderer,
    scene,
    camera,
    time: 12.5,
  }), 'renderGraph');
  assert.deepEqual(calls.splice(0), [['renderGraph', scene, camera, { time: 12.5 }]]);

  assert.equal(warmActivePostProcessFrame({
    video: { renderGraph: true, bloom: true },
    ensureRenderGraph: () => false,
    getRenderGraph: () => graph,
    bloom,
    renderer,
    scene,
    camera,
  }), 'bloom');
  assert.deepEqual(calls.splice(0), [['bloom', scene, camera]]);

  assert.equal(warmActivePostProcessFrame({
    video: { bloom: false },
    bloom,
    renderer,
    scene,
    camera,
  }), 'straight');
  assert.deepEqual(calls, [['straight', scene, camera]]);
});

test('precompile receipts are renderer-scoped and invalidated for context restoration', async () => {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 10000);
  const rendererA = { compileAsync: async () => {}, info: { programs: [] } };
  const rendererB = { compileAsync: async () => {}, info: { programs: [] } };
  let rendererAPrepares = 0;
  let rendererBPrepares = 0;
  const optionsA = {
    incremental: true,
    preparePipelines: async () => { rendererAPrepares++; },
    yieldToMain: async () => {},
  };
  const optionsB = {
    incremental: true,
    preparePipelines: async () => { rendererBPrepares++; },
    yieldToMain: async () => {},
  };

  assert.equal((await precompileGlobalPipelines(rendererA, scene, camera, optionsA)).skipped, false);
  assert.equal((await precompileGlobalPipelines(rendererA, scene, camera, optionsA)).skipped, true);
  assert.equal((await precompileGlobalPipelines(rendererB, scene, camera, optionsB)).skipped, false);
  assert.equal(rendererAPrepares, 1);
  assert.equal(rendererBPrepares, 1);

  invalidatePrecompileState(rendererA, { dispose: false });
  assert.equal((await precompileGlobalPipelines(rendererA, scene, camera, optionsA)).skipped, false);
  assert.equal(rendererAPrepares, 2);
});
