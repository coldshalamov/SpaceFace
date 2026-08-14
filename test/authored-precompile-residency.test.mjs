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
import { createShipAuxPool } from '../src/render/renderer.js';
import { preloadRockSurfaceLibrary } from '../src/render/rockSurfaceLibrary.js';

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
  await preloadRockSurfaceLibrary(null, {
    loadTexture: async () => new THREE.Texture(),
  });

  let legacyCompileCalls = 0;
  let exactTargetPrepareCalls = 0;
  let canopyVariants = [];
  let lateWorldOwners = [];
  let retainedPipelineOwners = [];
  let retainedRockPipelines = [];
  let retainedAuthoredOpaquePipelines = [];
  let retainedVfxMaterialCount = 0;
  let disposedRetainedVfxMaterials = 0;
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
    preparePipelines: async (subject) => {
      exactTargetPrepareCalls++;
      assert.equal(subject.name, 'SF_Precompile_Global_Pipelines');
      assert.equal(subject.parent?.name, 'SF_Precompile_Staging');
      assert.equal(subject.parent?.parent, scene);
      canopyVariants = [];
      lateWorldOwners = [];
      retainedPipelineOwners = [];
      retainedRockPipelines = [];
      retainedAuthoredOpaquePipelines = [];
      retainedVfxMaterialCount = 0;
      disposedRetainedVfxMaterials = 0;
      subject.traverse((object) => {
        if (object.name === 'SF_Precompile_L5b_Wormhole'
          || object.name === 'Spindle_Locked_Core_Glow') lateWorldOwners.push(object.name);
        if (object.userData?.precompileRetainedPipeline) {
          retainedPipelineOwners.push(object.userData.precompileRetainedPipeline);
          if (object.userData.precompileRetainedPipeline.startsWith('common-rock')) {
            retainedRockPipelines.push({
              id: object.userData.precompileRetainedPipeline,
              instanced: object.isInstancedMesh === true,
              materialType: object.material?.type || null,
              map: !!object.material?.map,
              normalMap: !!object.material?.normalMap,
              geologyPbr: !!object.geometry?.getAttribute?.('sfGeologyPbr'),
            });
          }
          if (object.userData.precompileRetainedPipeline.startsWith('authored-opaque-')) {
            retainedAuthoredOpaquePipelines.push({
              id: object.userData.precompileRetainedPipeline,
              map: !!object.material?.map,
              normalMap: !!object.material?.normalMap,
              aoMap: !!object.material?.aoMap,
              roughnessMap: !!object.material?.roughnessMap,
              metalnessMap: !!object.material?.metalnessMap,
              clearcoat: Number(object.material?.clearcoat) > 0,
              transmission: Number(object.material?.transmission) > 0,
              transparent: object.material?.transparent === true,
              dithering: object.material?.dithering === true,
              tangents: !!object.geometry?.getAttribute?.('tangent'),
            });
          }
        }
        let owner = object;
        while (owner && owner !== subject
          && owner.userData?.precompileRetainedPipeline !== 'vfx-salvo') owner = owner.parent;
        if (owner?.userData?.precompileRetainedPipeline === 'vfx-salvo' && object.material) {
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          for (const material of materials) {
            retainedVfxMaterialCount++;
            material.addEventListener('dispose', () => { disposedRetainedVfxMaterials++; });
          }
        }
        if (!object.userData?.precompileCanopyVariant) return;
        const material = object.material;
        canopyVariants.push({
          id: object.userData.precompileCanopyVariant,
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
  assert.equal(result.retainedCanopyVariants, 3);
  assert.equal(exactTargetPrepareCalls, 1);
  assert.equal(legacyCompileCalls, 0);
  assert.ok(retainedVfxMaterialCount > 4, 'fixture must cover the retained VFX material family');
  assert.equal(disposedRetainedVfxMaterials, 0,
    'the production precompile teardown must not dispose retained VFX program owners');
  assert.deepEqual(lateWorldOwners.sort(), ['SF_Precompile_L5b_Wormhole', 'Spindle_Locked_Core_Glow']);
  assert.deepEqual(retainedPipelineOwners.sort(), [
    'authored-opaque-clearcoat', 'authored-opaque-clearcoat-transmission',
    'authored-opaque-standard', 'common-rock-instanced-pbr', 'hitch-main-plume',
    'opaque-batch-cast', 'opaque-batch-nocast',
    'ship-shield-bubble', 'vfx-salvo',
  ]);
  assert.deepEqual(retainedAuthoredOpaquePipelines.sort((a, b) => a.id.localeCompare(b.id)), [
    {
      id: 'authored-opaque-clearcoat', map: true, normalMap: true, aoMap: true,
      roughnessMap: true, metalnessMap: true, clearcoat: true, transmission: false,
      transparent: false, dithering: true, tangents: true,
    },
    {
      id: 'authored-opaque-clearcoat-transmission', map: true, normalMap: true, aoMap: true,
      roughnessMap: true, metalnessMap: true, clearcoat: true, transmission: true,
      transparent: false, dithering: true, tangents: true,
    },
    {
      id: 'authored-opaque-standard', map: true, normalMap: true, aoMap: true,
      roughnessMap: true, metalnessMap: true, clearcoat: false, transmission: false,
      transparent: false, dithering: true, tangents: true,
    },
  ]);
  assert.deepEqual(retainedRockPipelines, [{
    id: 'common-rock-instanced-pbr',
    instanced: true,
    materialType: 'MeshStandardMaterial',
    map: true,
    normalMap: true,
    geologyPbr: true,
  }]);
  assert.deepEqual(
    getPrecompileKeepAliveDiagnostics(renderer).retainedPipelines.sort(),
    [
      'authored-opaque-clearcoat', 'authored-opaque-clearcoat-transmission',
      'authored-opaque-standard', 'common-rock-instanced-pbr', 'hitch-main-plume',
      'opaque-batch-cast', 'opaque-batch-nocast',
      'ship-shield-bubble', 'vfx-salvo',
    ],
  );
  assert.deepEqual(canopyVariants, [
    {
      id: 'surface', map: false, normalMap: false, aoMap: false,
      roughnessMap: true, metalnessMap: true,
      transmission: 0, transparent: true, depthWrite: false,
      forceSinglePass: true, dithering: true, tangents: true,
    },
    {
      id: 'normal-surface-ao', map: false, normalMap: true, aoMap: true,
      roughnessMap: true, metalnessMap: true,
      transmission: 0, transparent: true, depthWrite: false,
      forceSinglePass: true, dithering: true, tangents: true,
    },
    {
      id: 'base-normal-surface', map: true, normalMap: true, aoMap: false,
      roughnessMap: true, metalnessMap: true,
      transmission: 0, transparent: true, depthWrite: false,
      forceSinglePass: true, dithering: true, tangents: true,
    },
  ]);
  assert.deepEqual(getAuthoredUpgradeQueueStats(scene), { pending: 0, running: false });
  assert.equal(scene.getObjectByName('SF_Precompile_Staging'), undefined);
});

test('global precompile retains the directional-shadow program family without changing live state', async () => {
  const calls = [];
  let warmRenderState = null;
  const renderer = {
    compileAsync: async () => {},
    info: { programs: [] },
    shadowMap: { enabled: false, type: THREE.PCFShadowMap },
    render(renderScene) {
      const depthOwners = [];
      renderScene.traverse((object) => {
        const id = object.userData?.precompileRetainedPipeline;
        if (object.castShadow && id?.startsWith('shadow-depth')) depthOwners.push(id);
      });
      warmRenderState = {
        shadowMapEnabled: renderer.shadowMap.enabled,
        keyCastsShadow: key.castShadow,
        depthOwners: depthOwners.sort(),
        canopyAttached: !!renderScene.getObjectByName('SF_Precompile_Canopy_KeepAlive'),
        shadowRootAttached: !!renderScene.getObjectByName('SF_Precompile_ShadowDepth_KeepAlive'),
      };
    },
  };
  const scene = new THREE.Scene();
  const key = new THREE.DirectionalLight(0xffffff, 1);
  key.castShadow = false;
  scene.add(key);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 10000);

  await precompileGlobalPipelines(renderer, scene, camera, {
    incremental: true,
    preparePipelines: async (subject) => {
      calls.push({
        subject,
        shadowMapEnabled: renderer.shadowMap.enabled,
        keyCastsShadow: key.castShadow,
        retainedPipelines: [],
      });
      const call = calls.at(-1);
      subject.traverse((object) => {
        const id = object.userData?.precompileRetainedPipeline;
        if (id) call.retainedPipelines.push(id);
      });
    },
    yieldToMain: async () => {},
  });

  assert.equal(calls.length, 2, 'compile both ordinary and directional-shadow program keys');
  assert.equal(calls[0].subject, calls[1].subject);
  assert.deepEqual(calls.map(({ shadowMapEnabled, keyCastsShadow }) => ({
    shadowMapEnabled,
    keyCastsShadow,
  })), [
    { shadowMapEnabled: false, keyCastsShadow: false },
    { shadowMapEnabled: true, keyCastsShadow: true },
  ]);
  assert.deepEqual(
    calls[0].retainedPipelines.filter((id) => id.startsWith('shadow-depth')),
    [],
    'depth-only variants should not add unused no-shadow program keys',
  );
  assert.deepEqual(
    calls[1].retainedPipelines.filter((id) => id.startsWith('shadow-depth')).sort(),
    ['shadow-depth-map-instanced', 'shadow-depth-map-mesh', 'shadow-depth-solid-mesh'],
    'the shadow admission pass must retain every exact depth layout observed after boot',
  );
  assert.deepEqual(warmRenderState, {
    shadowMapEnabled: true,
    keyCastsShadow: true,
    depthOwners: ['shadow-depth-map-instanced', 'shadow-depth-map-mesh', 'shadow-depth-solid-mesh'],
    canopyAttached: false,
    shadowRootAttached: true,
  }, 'the resident warm must isolate the exact casters under temporary production shadow state');
  assert.equal(renderer.shadowMap.enabled, false, 'restore the player renderer setting');
  assert.equal(key.castShadow, false, 'restore the live key-light state');
  invalidatePrecompileState(renderer);
});

test('global precompile admits late depth owners when directional shadows are already active', async () => {
  const calls = [];
  let warmRenderDepthOwners = [];
  const renderer = {
    compileAsync: async () => {},
    info: { programs: [] },
    shadowMap: { enabled: true, type: THREE.PCFShadowMap },
    render(renderScene) {
      warmRenderDepthOwners = [];
      renderScene.traverse((object) => {
        const id = object.userData?.precompileRetainedPipeline;
        if (object.castShadow && id?.startsWith('shadow-depth')) warmRenderDepthOwners.push(id);
      });
      warmRenderDepthOwners.sort();
    },
  };
  const scene = new THREE.Scene();
  const key = new THREE.DirectionalLight(0xffffff, 1);
  key.castShadow = true;
  scene.add(key);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 10000);

  await precompileGlobalPipelines(renderer, scene, camera, {
    incremental: true,
    preparePipelines: async (subject) => {
      const depthOwners = [];
      subject.traverse((object) => {
        const id = object.userData?.precompileRetainedPipeline;
        if (id?.startsWith('shadow-depth')) depthOwners.push(id);
      });
      calls.push(depthOwners.sort());
    },
    yieldToMain: async () => {},
  });

  assert.deepEqual(calls, [
    [],
    ['shadow-depth-map-instanced', 'shadow-depth-map-mesh', 'shadow-depth-solid-mesh'],
  ], 'new depth owners require one exact-target compile even when the shadow state needs no toggle');
  assert.deepEqual(warmRenderDepthOwners,
    ['shadow-depth-map-instanced', 'shadow-depth-map-mesh', 'shadow-depth-solid-mesh'],
    'the hidden resident warm must exercise Three.js own shadow-depth material path');
  assert.equal(scene.getObjectByName('SF_Precompile_Canopy_KeepAlive'), undefined,
    'retained program owners must leave the live scene immediately after the hidden warm');
  assert.equal(renderer.shadowMap.enabled, true);
  assert.equal(key.castShadow, true);
  invalidatePrecompileState(renderer);
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
