import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { build, transform } from 'esbuild';

import * as THREE from 'three';

import { derivePilotSemanticManifest } from '../scripts/build-render-package-pilots.mjs';
import { sceneFromGlbJson } from '../scripts/lib/renderPackageRuntimeTable.mjs';
import {
  deriveAuthoredRuntimeTable,
  prepareRenderPackageBlueprint,
} from '../src/render/assetLoader.js';
import {
  beginAuthoredInstanceMeshDisposeRegistrationProbe,
  buildAuthoredPlaceProp,
  disposePreparedAuthoredBoundary,
  endAuthoredInstanceMeshDisposeRegistrationProbe,
  invalidatePartsLibraryCaches,
  preloadAuthoredPartLibrary,
  prepareAuthoredInstancePoolsForContextLoss,
  prepareAuthoredVisualPipelines,
  publishPreparedAuthoredBoundary,
  syncAuthoredInstancePools,
  upgradeAuthoredPlaceBoundaryForProbe,
  wrapShipWithAuthoredParts,
} from '../src/render/partsLibrary.js';
import { createDynamicBufferCoordinator } from '../src/render/dynamicBufferRanges.js';
import { detachStaleWebGlDisposeListeners } from '../src/render/contextResourceLifecycle.js';
import {
  RENDER_PACKAGE_PILOTS,
  renderPackagePilotForAssetId,
  renderPackagePilotForSourceUrl,
} from '../src/render/renderPackageManifest.js';

if (!globalThis.document) {
  globalThis.document = {
    createElement(tag) {
      if (tag !== 'canvas') return { style: {}, appendChild() {}, addEventListener() {} };
      const context = {
        canvas: { width: 256, height: 256 },
        fillRect() {}, strokeRect() {}, clearRect() {}, fillText() {}, strokeText() {},
        save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, setTransform() {},
        beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, rect() {},
        bezierCurveTo() {}, quadraticCurveTo() {}, fill() {}, stroke() {}, drawImage() {},
        createLinearGradient() { return { addColorStop() {} }; },
        createRadialGradient() { return { addColorStop() {} }; },
        createImageData(width, height) {
          return { data: new Uint8ClampedArray(width * height * 4), width, height };
        },
        getImageData(_x, _y, width, height) {
          return { data: new Uint8ClampedArray(width * height * 4), width, height };
        },
        putImageData() {},
        measureText() { return { width: 10 }; },
        fillStyle: '', strokeStyle: '', font: '', lineWidth: 1, globalAlpha: 1,
      };
      return {
        width: 256,
        height: 256,
        style: {},
        addEventListener() {},
        getContext: () => context,
      };
    },
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

let minifiedThreeRendererModulePromise = null;

function createEventCanvas() {
  const listeners = new Map();
  return {
    width: 4,
    height: 4,
    style: {},
    addEventListener(type, listener) {
      let bucket = listeners.get(type);
      if (!bucket) listeners.set(type, (bucket = new Set()));
      bucket.add(listener);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    setAttribute() {},
    emit(type, event = {}) {
      for (const listener of [...(listeners.get(type) || [])]) listener.call(this, event);
    },
  };
}

function createDeterministicWebGl2Context(canvas) {
  let nextConstant = 1;
  const constants = new Map([['SAMPLER_2D', 0x8b5e]]);
  const namesByConstant = new Map([[0x8b5e, 'SAMPLER_2D']]);
  const constant = (name) => {
    if (!constants.has(name)) {
      while (namesByConstant.has(nextConstant)) nextConstant++;
      constants.set(name, nextConstant);
      namesByConstant.set(nextConstant, name);
      nextConstant++;
    }
    return constants.get(name);
  };
  const parameterValues = {
    ALIASED_LINE_WIDTH_RANGE: new Float32Array([1, 1]),
    ALIASED_POINT_SIZE_RANGE: new Float32Array([1, 64]),
    IMPLEMENTATION_COLOR_READ_FORMAT: 0x1908,
    IMPLEMENTATION_COLOR_READ_TYPE: 0x1401,
    MAX_COMBINED_TEXTURE_IMAGE_UNITS: 32,
    MAX_CUBE_MAP_TEXTURE_SIZE: 4096,
    MAX_FRAGMENT_UNIFORM_VECTORS: 1024,
    MAX_SAMPLES: 4,
    MAX_TEXTURE_IMAGE_UNITS: 16,
    MAX_TEXTURE_SIZE: 4096,
    MAX_UNIFORM_BUFFER_BINDINGS: 24,
    MAX_VARYING_VECTORS: 16,
    MAX_VERTEX_ATTRIBS: 16,
    MAX_VERTEX_TEXTURE_IMAGE_UNITS: 16,
    MAX_VERTEX_UNIFORM_VECTORS: 1024,
    RENDERER: 'SpaceFace deterministic WebGL2 probe',
    SHADING_LANGUAGE_VERSION: 'WebGL GLSL ES 3.00 deterministic',
    VENDOR: 'SpaceFace',
    VERSION: 'WebGL 2.0 deterministic',
  };
  const context = {
    canvas,
    drawingBufferHeight: canvas.height,
    drawingBufferWidth: canvas.width,
    checkFramebufferStatus: () => constant('FRAMEBUFFER_COMPLETE'),
    clientWaitSync: () => constant('CONDITION_SATISFIED'),
    createBuffer: () => ({}),
    createFramebuffer: () => ({}),
    createProgram: () => ({}),
    createQuery: () => ({}),
    createRenderbuffer: () => ({}),
    createSampler: () => ({}),
    createShader: () => ({}),
    createTexture: () => ({}),
    createVertexArray: () => ({}),
    fenceSync: () => ({}),
    getActiveAttrib: () => null,
    getActiveUniform: () => ({ name: 'map', type: 0x8b5e, size: 1 }),
    getAttribLocation: () => 0,
    getContextAttributes: () => ({
      alpha: true,
      antialias: false,
      depth: true,
      failIfMajorPerformanceCaveat: false,
      powerPreference: 'default',
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      stencil: false,
    }),
    getError: () => constant('NO_ERROR'),
    getExtension: () => null,
    getParameter(value) {
      return parameterValues[namesByConstant.get(value)] ?? 0;
    },
    getProgramInfoLog: () => '',
    getProgramParameter(_program, value) {
      const name = namesByConstant.get(value);
      if (name === 'ACTIVE_ATTRIBUTES') return 0;
      if (name === 'ACTIVE_UNIFORMS') return 1;
      if (name === 'LINK_STATUS' || name === 'VALIDATE_STATUS') return true;
      return true;
    },
    getQueryParameter: () => true,
    getShaderInfoLog: () => '',
    getShaderParameter: () => true,
    getShaderPrecisionFormat: () => ({ precision: 23, rangeMax: 127, rangeMin: 127 }),
    getSupportedExtensions: () => [],
    getUniformLocation: () => ({}),
    isContextLost: () => false,
  };
  return new Proxy(context, {
    get(target, property) {
      if (property in target) return target[property];
      if (typeof property === 'string' && /^[A-Z0-9_]+$/.test(property)) return constant(property);
      if (typeof property === 'string') {
        const noop = () => {};
        target[property] = noop;
        return noop;
      }
      return undefined;
    },
  });
}

async function createActualMinifiedThreeRenderer() {
  if (!minifiedThreeRendererModulePromise) {
    minifiedThreeRendererModulePromise = build({
      bundle: true,
      format: 'esm',
      legalComments: 'none',
      minify: true,
      platform: 'browser',
      stdin: {
        contents: "export { WebGLRenderer } from 'three';",
        loader: 'js',
        resolveDir: process.cwd(),
        sourcefile: 'spaceface-minified-three-probe.mjs',
      },
      target: 'es2022',
      treeShaking: true,
      write: false,
    }).then(async (result) => {
      const code = result.outputFiles[0].text;
      const url = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}#three-r184-minified`;
      return import(url);
    });
  }
  const { WebGLRenderer } = await minifiedThreeRendererModulePromise;
  const canvas = createEventCanvas();
  const context = createDeterministicWebGl2Context(canvas);
  const renderer = new WebGLRenderer({ canvas, context });
  renderer.setSize(4, 4, false);
  return { canvas, renderer };
}

function captureSimulatedRendererInstancedMeshDisposeRegistration(
  renderer,
  scene,
  listener,
  resourceListeners = {},
) {
  const probe = beginAuthoredInstanceMeshDisposeRegistrationProbe(scene, renderer);
  assert.ok(probe?.probe?.isInstancedMesh);
  probe.probe.addEventListener('dispose', listener);
  if (resourceListeners.geometry) {
    probe.geometry.addEventListener('dispose', resourceListeners.geometry);
  }
  if (resourceListeners.material) {
    probe.material.addEventListener('dispose', resourceListeners.material);
  }
  if (resourceListeners.shadowMaterial) {
    probe.material.addEventListener('dispose', resourceListeners.shadowMaterial);
  }
  if (resourceListeners.texture) {
    probe.texture.addEventListener('dispose', resourceListeners.texture);
  }
  if (resourceListeners.renderTarget) {
    probe.renderTarget.addEventListener('dispose', resourceListeners.renderTarget);
  }
  const receipt = endAuthoredInstanceMeshDisposeRegistrationProbe(probe);
  assert.strictEqual(receipt.listener, listener);
  return receipt;
}

function detachPreparedContextLossResources(scene, renderer) {
  const prepared = prepareAuthoredInstancePoolsForContextLoss(scene, renderer);
  const detached = detachStaleWebGlDisposeListeners(prepared.roots, prepared.provenance);
  return { ...prepared, ...detached };
}

test('one-root runtime metadata mirrors GLTFLoader wrapper, name ordering, mesh cache, and binding', () => {
  const assetContract = { assetId: 'fixture_single_root', slot: 'hull' };
  const json = {
    asset: { version: '2.0', extras: { spacefaceAsset: assetContract } },
    scene: 0,
    scenes: [{
      name: 'Single Root',
      extras: { spacefaceAsset: assetContract },
      nodes: [0],
    }],
    nodes: [
      {
        name: 'Parent Root',
        mesh: 0,
        extras: { name: 'extras-overrode-parent', authored: 'parent' },
        children: [1, 2],
      },
      { name: 'SOCKET Collision', extras: { authored: 'named-child' } },
      {
        name: 'Single Parent',
        mesh: 1,
        children: [3, 4, 5, 6],
      },
      { name: 'Single Mesh', extras: { authored: 'single-named-child' } },
      { mesh: 2 },
      { mesh: 2 },
      {
        name: 'MOUNT Engine Left',
        extras: { name: 'extras-overrode-marker', authored: 'override-marker' },
      },
    ],
    meshes: [
      {
        name: 'SOCKET Collision',
        primitives: [
          { attributes: { POSITION: 0 }, material: 0 },
          { attributes: { POSITION: 0 }, material: 0 },
        ],
      },
      {
        name: 'Single Mesh',
        primitives: [{ attributes: { POSITION: 0 }, material: 0 }],
      },
      {
        name: 'Single Mesh',
        primitives: [{ attributes: { POSITION: 0 }, material: 0 }],
      },
    ],
    materials: [{ name: 'Material_Hull' }],
  };

  const scene = sceneFromGlbJson(json);
  assert.equal(scene.isGroup, true, 'GLTFLoader always returns a scene Group');
  assert.equal(scene.name, 'Single_Root', 'scene names are sanitised and reserved before node names');
  assert.deepEqual(scene.userData, { spacefaceAsset: assetContract }, 'scene extras reach userData');
  assert.equal(scene.children.length, 1);
  const parent = scene.children[0];
  assert.equal(parent.name, 'Parent_Root');
  assert.equal(parent.userData.name, 'extras-overrode-parent',
    'node extras override the raw authored userData.name injected by GLTFLoader');
  assert.deepEqual(parent.children.slice(0, 2).map((mesh) => mesh.name), ['SOCKET_Collision_1', 'SOCKET_Collision_2'],
    'named child reserves the unsuffixed name before parent multi-primitive mesh materialisation');
  assert.equal(parent.children[2].name, 'SOCKET_Collision');
  assert.equal(parent.children[2].userData.name, 'SOCKET Collision',
    'named nodes retain the unsanitised authored name in userData when extras do not override it');

  const singleParent = parent.children[3];
  assert.equal(singleParent.name, 'Single_Parent');
  assert.equal(singleParent.userData.name, 'Single Parent');
  assert.equal(singleParent.children[0].name, 'Single_Mesh');
  assert.equal(singleParent.children[0].userData.name, 'Single Mesh');
  assert.equal(singleParent.children[1].name, 'Single_Mesh_2_instance_0',
    'a named single-primitive parent still reserves and discards Single_Mesh_1');
  assert.equal(singleParent.children[2].name, 'Single_Mesh_2_instance_1',
    'shared mesh clones use r184 per-dependency instance suffixes without claiming another unique name');
  assert.notEqual(singleParent.children[1], singleParent.children[2]);
  assert.equal(singleParent.children[1].geometry, singleParent.children[2].geometry);
  assert.equal(singleParent.children[1].material, singleParent.children[2].material);
  assert.equal(singleParent.children[3].name, 'MOUNT_Engine_Left');
  assert.equal(singleParent.children[3].userData.name, 'extras-overrode-marker');

  const sourceUrl = 'assets/ships/release/parts/hulls/fixture_single_root.glb';
  const table = deriveAuthoredRuntimeTable(scene, {
    url: sourceUrl,
    slot: 'hull',
    assetId: assetContract.assetId,
  });
  assert.equal(table.nodeCount, 10, 'runtime table includes scene Group, mesh wrappers, and authored nodes');
  assert.deepEqual(table.primitives.map((entry) => entry.planIndex), [2, 3, 5, 7, 8]);
  assert.deepEqual(table.primitives.map((entry) => entry.name), [
    'SOCKET_Collision_1',
    'SOCKET_Collision_2',
    'Single_Parent',
    'Single_Mesh_2_instance_0',
    'Single_Mesh_2_instance_1',
  ]);
  assert.deepEqual(table.markers.map((entry) => entry.planIndex), [4, 9]);
  assert.equal(table.markers[0].userData.name, 'SOCKET Collision',
    'derived marker metadata retains normal authored node userData.name');
  assert.equal(table.markers[0].userData.authored, 'named-child');
  assert.equal(table.markers[1].userData.name, 'extras-overrode-marker',
    'derived marker metadata retains the node-extras override order');
  assert.equal(table.markers[1].userData.authored, 'override-marker');

  const entries = [];
  const appendPlan = (source, parentIndex = -1) => {
    const planIndex = entries.length;
    entries.push({ source, parentIndex });
    for (const child of source.children) appendPlan(child, planIndex);
  };
  appendPlan(scene);
  const plan = { entries };
  const blueprint = prepareRenderPackageBlueprint({
    assetId: 'sf.render.fixture-single-root',
    runtimeAssetId: assetContract.assetId,
    sourceUrl,
    slot: 'hull',
  }, { scene, asset: json.asset }, { runtime: table }, { plan });
  assert.equal(blueprint.primitives.length, 5);
  assert.deepEqual(blueprint.primitives.map((entry) => entry.name), table.primitives.map((entry) => entry.name));
  assert.equal(blueprint.primitives[0].geometry, parent.children[0].geometry,
    'shipping preparation binds wrapper-shifted runtime indices to the real primitive meshes');
  assert.deepEqual(blueprint.markers.map((entry) => entry.userData.name), [
    'SOCKET Collision',
    'extras-overrode-marker',
  ], 'shipping preparation preserves normal and extras-overridden marker userData.name');
});

test('production package build rejects runtime asset identity drift', async () => {
  await assert.rejects(
    derivePilotSemanticManifest({
      key: 'identity-drift',
      assetId: 'sf.render.identity-drift',
      runtimeAssetId: 'wrong-runtime-id',
      kind: 'place',
      rootNode: 'place_debris_chunk',
      dynamicNameIncludes: [],
    }, 'assets/ships/release/parts/places/place_debris_chunk.glb'),
    /runtime assetId wrong-runtime-id does not match source place_debris_chunk/,
  );
});

test('production package build accepts runtime identity on the exact authored root', async () => {
  const semantic = await derivePilotSemanticManifest({
    key: 'drifter-production-v1',
    assetId: 'sf.render.drifter-production-v1',
    runtimeAssetId: 'SF_DRIFTER_PRODUCTION_V1',
    kind: 'ship',
    rootNode: 'DRIFTER_LOD0_ROOT',
    dynamicNameIncludes: [],
  }, 'assets/ships/release/parts/wholeships/drifter_production_v1.glb');

  assert.equal(semantic.assetId, 'sf.render.drifter-production-v1');
  assert.equal(semantic.semanticNodes[0].node, 'DRIFTER_LOD0_ROOT');
});

test('shipping package binds runtime identity from one exact authored scene root', () => {
  const assetContract = {
    assetId: 'SF_SINGLE_AUTHORED_ROOT',
    contractVersion: 2,
    slot: 'hull',
  };
  const json = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{
      name: 'AUTHORED_ROOT',
      extras: { spacefaceAsset: assetContract },
      mesh: 0,
    }],
    meshes: [{
      name: 'AUTHORED_ROOT',
      primitives: [{ attributes: { POSITION: 0 }, material: 0 }],
    }],
    materials: [{ name: 'Material_Hull' }],
  };
  const scene = sceneFromGlbJson(json);
  const sourceUrl = 'assets/ships/release/parts/wholeships/single_authored_root.glb';
  const table = deriveAuthoredRuntimeTable(scene, {
    url: sourceUrl,
    slot: 'hull',
    assetId: assetContract.assetId,
  });
  const entries = [];
  const appendPlan = (source, parentIndex = -1) => {
    const planIndex = entries.length;
    entries.push({ source, parentIndex });
    for (const child of source.children) appendPlan(child, planIndex);
  };
  appendPlan(scene);

  const blueprint = prepareRenderPackageBlueprint({
    assetId: 'sf.render.single-authored-root',
    runtimeAssetId: assetContract.assetId,
    sourceUrl,
    slot: 'hull',
  }, { scene, asset: json.asset }, { runtime: table }, { plan: { entries } });

  assert.equal(blueprint.assetId, assetContract.assetId);
  assert.equal(blueprint.metadata.slot, 'hull');
});

test('production manifest packages every live whole-ship family and admitted authored place', async () => {
  // Coverage is derived from the release manifest by scripts/generate-render-package-pilots.mjs, so
  // a frozen key list would defeat the point — it could only prove that someone remembered to add an
  // asset. Assert instead that the originally-admitted families are all still packaged, and let
  // `npm run check:render-package-coverage` own the "nothing is missing" half.
  const keys = new Set(RENDER_PACKAGE_PILOTS.map((entry) => entry.key));
  for (const key of [
    'kestrel',
    'ashline-dart',
    'ashline-lode',
    'ashline-rig',
    'helios-lark',
    'helios-cradle',
    'helios-span',
    'helios-trade-hub',
    'ceres-refinery',
    'jump-ring',
    'helios-rock-a',
    'helios-rock-b',
    'helios-rock-c',
    'seamed-asteroid',
    'conveyor-barge',
    'claim-outpost-base',
    'claim-outpost-refinery',
    'claim-outpost-relay',
    'nav-buoy',
    'lane-beacon',
    'station-billboard',
    'memorial-array',
    'debris-chunk',
    'dead-hulk',
    'dock-interior',
    'wasp',
  ]) assert.ok(keys.has(key), `${key} is still packaged`);
  assert.ok(RENDER_PACKAGE_PILOTS.length >= 26, 'coverage never shrinks below the admitted set');

  const wasp = renderPackagePilotForSourceUrl(
    'assets/ships/release/parts/wholeships/wasp_production_v1.glb',
  );
  assert.equal(wasp?.runtimeAssetId, 'SF_WASP_PRODUCTION_V1');
  const tradeHub = renderPackagePilotForSourceUrl(
    'assets/ships/release/parts/places/place_station_trade_hub.glb',
  );
  assert.equal(tradeHub?.runtimeAssetId, 'SF_PLACE_STATION_TRADE_HUB');
  const refinery = renderPackagePilotForSourceUrl(
    'assets/ships/release/parts/places/place_station_refinery.glb',
  );
  assert.equal(refinery?.runtimeAssetId, 'SF_PLACE_STATION_REFINERY');
  const jumpRing = renderPackagePilotForSourceUrl(
    'assets/ships/release/parts/places/place_gate_jump_ring.glb',
  );
  assert.equal(jumpRing?.runtimeAssetId, 'SF_PLACE_GATE_JUMP_RING');
  for (const suffix of ['a', 'b', 'c']) {
    const geology = renderPackagePilotForSourceUrl(
      `assets/ships/release/parts/places/place_asteroid_rock_${suffix}.glb`,
    );
    assert.equal(geology?.runtimeAssetId, `SF_PLACE_HELIOS_ROCK_${suffix.toUpperCase()}`);
  }
  for (const [sourceId, runtimeAssetId] of [
    ['place_asteroid_seamed', 'SF_PLACE_ASTEROID_SEAMED_GEOLOGY_V3'],
    ['place_conveyor_barge', 'SF_PLACE_CONVEYOR_BARGE'],
    ['place_claim_outpost_base', 'SF_PLACE_CLAIM_OUTPOST_BASE'],
    ['place_claim_outpost_refinery', 'SF_PLACE_CLAIM_OUTPOST_REFINERY'],
    ['place_claim_outpost_relay', 'SF_PLACE_CLAIM_OUTPOST_RELAY'],
  ]) {
    const worksite = renderPackagePilotForSourceUrl(
      `assets/ships/release/parts/places/${sourceId}.glb`,
    );
    assert.equal(worksite?.runtimeAssetId, runtimeAssetId);
  }
  for (const [sourceId, runtimeAssetId] of [
    ['place_nav_buoy', 'SF_PLACE_HELIOS_NAV_SPIRE'],
    ['place_lane_beacon', 'SF_PLACE_HELIOS_SUPPORT_GANTRY'],
    ['place_station_billboard', 'SF_PLACE_HELIOS_SUPPORT_DOCK_ARM'],
    ['place_memorial_array', 'SF_PLACE_MEMORIAL_ARRAY'],
  ]) {
    const marker = renderPackagePilotForSourceUrl(
      `assets/ships/release/parts/places/${sourceId}.glb`,
    );
    assert.equal(marker?.runtimeAssetId, runtimeAssetId);
  }

  for (const binding of RENDER_PACKAGE_PILOTS) {
    assert.strictEqual(renderPackagePilotForSourceUrl(binding.sourceUrl), binding);
    assert.strictEqual(renderPackagePilotForSourceUrl(`${binding.sourceUrl}?cache=1`), binding);
    assert.strictEqual(renderPackagePilotForAssetId(binding.assetId), binding);
    const [sourceBytes, metadataBytes] = await Promise.all([
      readFile(binding.sourceUrl),
      readFile(binding.metadataUrl),
    ]);
    const metadata = JSON.parse(metadataBytes.toString('utf8'));
    assert.equal(createHash('sha256').update(sourceBytes).digest('hex'), binding.sourceSha256);
    assert.equal(metadata.assetId, binding.assetId);
    assert.equal(metadata.contentHash, binding.expectedContentHash);
    assert.equal(metadata.provenance.sourceGlb.sha256, binding.sourceSha256);
    assert.ok(metadata.geometry.every((geometry) => geometry.indexed === true),
      `${binding.key} preserves indexed production geometry`);
    if (binding.key === 'helios-trade-hub') {
      assert.ok(metadata.nodes.filter((node) => node.parentId === null).length > 1,
        'scene-root package preserves the authored multi-root hierarchy');
      assert.ok(metadata.anchors.some((anchor) => anchor.nodeName === 'SOCKET_Structure_Core'));
      assert.ok(metadata.collisions.some((collision) => collision.reference === 'COLLISION_HULL'));
    }
  }

  assert.equal(renderPackagePilotForSourceUrl('assets/ships/release/parts/wholeships/pelican.glb'), null);
  assert.equal(renderPackagePilotForAssetId('sf.render.unclaimed'), null);
});

test('production manifest enables the flight-static v3 canary only for Helios trade hub', () => {
  const flightStaticBindings = RENDER_PACKAGE_PILOTS.filter((binding) => binding.flightStaticV3 === true);
  assert.deepEqual(
    flightStaticBindings.map((binding) => binding.key),
    ['helios-trade-hub'],
  );
  const tradeHub = renderPackagePilotForAssetId('sf.render.helios-trade-hub');
  assert.equal(tradeHub?.flightStaticV3, true);
  for (const binding of RENDER_PACKAGE_PILOTS) {
    if (binding.key !== 'helios-trade-hub') assert.notEqual(binding.flightStaticV3, true, binding.key);
  }
});

test('production render-package instances bypass runtime geometry preparation on the place route', async () => {
  const entity = {
    id: 'pilot_debris',
    type: 'fx',
    alive: true,
    radius: 12,
    data: {
      placeId: 'place_debris_chunk',
      placeScale: 1,
    },
  };
  const boundary = buildAuthoredPlaceProp(entity, { releaseMode: true });
  const fallbackRoot = boundary.children[0];
  const scene = new THREE.Scene();
  scene.add(boundary);

  const geometry = new THREE.BoxGeometry(4, 2, 3);
  geometry.clone = () => {
    throw new Error('production package geometry must not be cloned at runtime');
  };
  const material = new THREE.MeshStandardMaterial({ color: 0x7a7168 });
  const tags = Object.freeze({ lod: 'lod0', tint: 'none', instance: true });
  let instances = 0;
  const record = {
    url: 'assets/ships/release/parts/places/place_debris_chunk.glb',
    assetId: 'place_debris_chunk',
    slot: 'place',
    bounds: { size: [4, 2, 3], center: [0, 0, 0] },
    primitives: [{
      key: 'debris:lod0',
      name: 'LOD0_Debris_Material_Hull',
      geometry,
      material,
      matrix: new THREE.Matrix4(),
      tags,
    }],
    markers: [],
    renderPackage: {
      assetId: 'pilot.debris_chunk',
      contentHash: '1'.repeat(64),
      createInstance() {
        instances++;
        const root = new THREE.Group();
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = 'LOD0_Debris_Material_Hull';
        mesh.userData.spacefaceTags = tags;
        root.add(mesh);
        // planNodes is part of the loader's instance contract: the flat instance plan in
        // depth-first pre-order with the root at index 0. partsLibrary specialises by iterating
        // this instead of root.traverse(), which is what keeps per-instance recursive traversal at
        // zero, so a stub that omits it is not a faithful stand-in for a real package instance.
        return { root, planNodes: [root, mesh], dispose() { return true; } };
      },
    },
  };

  const swapped = await upgradeAuthoredPlaceBoundaryForProbe(
    boundary,
    fallbackRoot,
    entity,
    'places/place_debris_chunk.glb',
    {},
    scene,
    { releaseMode: true, loadAuthoredPart: async () => record },
  );

  assert.equal(swapped, true);
  assert.equal(instances, 1);
  const directMeshes = [];
  boundary.traverse((object) => {
    if (object.isMesh && object.userData?.spacefaceRenderPackageDirect === true) directMeshes.push(object);
    assert.notEqual(object.userData?.spacefaceStaticBatch, true);
  });
  assert.equal(directMeshes.length, 1);
  assert.strictEqual(directMeshes[0].geometry, geometry, 'package instance shares its immutable decoded buffer');

  const gatedEntity = { ...entity, id: 'pilot_debris_gated', data: { ...entity.data } };
  const gatedBoundary = buildAuthoredPlaceProp(gatedEntity, { releaseMode: true });
  const gatedFallback = gatedBoundary.children[0];
  const pipelineGate = deferred();
  scene.add(gatedBoundary);
  let gatedSettled = false;
  const gatedAdmission = upgradeAuthoredPlaceBoundaryForProbe(
    gatedBoundary,
    gatedFallback,
    gatedEntity,
    'places/place_debris_chunk.glb',
    {},
    scene,
    {
      releaseMode: true,
      loadAuthoredPart: async () => record,
      overlapAuthoredPipelineCompile: true,
      prepareAuthoredPipelines: async () => pipelineGate.promise,
    },
  );
  gatedAdmission.then(() => { gatedSettled = true; });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(gatedSettled, false,
    'overlapped place admission does not report completion while exact GPU work is pending');
  pipelineGate.resolve({ skipped: false });
  assert.equal(await gatedAdmission, true);
  assert.equal(gatedSettled, true);
});

test('prepared place cleanup failure cannot publish the same-semantic fallback', async () => {
  const entity = {
    id: 'prepared-geology-cleanup-failure',
    type: 'asteroid',
    alive: true,
    radius: 12,
    data: {
      placeId: 'place_debris_chunk',
      placeTargetRadius: 12,
      authoredGeologySkin: true,
    },
  };
  const fallbackRoot = new THREE.Group();
  const boundary = buildAuthoredPlaceProp(entity, { fallbackRoot, releaseMode: true });
  const scene = new THREE.Scene();
  scene.add(boundary);
  const sourceGeometry = new THREE.BoxGeometry(4, 2, 3);
  const sourceMaterial = new THREE.MeshStandardMaterial({ color: 0x7a7168 });
  const record = {
    url: 'assets/ships/release/parts/places/place_debris_chunk.glb',
    assetId: 'place_debris_chunk',
    slot: 'place',
    bounds: { size: [4, 2, 3], center: [0, 0, 0] },
    primitives: [{
      key: 'debris:cleanup-failure',
      name: 'LOD0_Debris_Material_Hull',
      geometry: sourceGeometry,
      material: sourceMaterial,
      matrix: new THREE.Matrix4(),
      tags: Object.freeze({ lod: 'lod0', tint: 'none', instance: true }),
    }],
    markers: [],
  };
  let stagedRoot = null;
  let failingGeometry = null;
  let restoreDispose = null;

  const admission = upgradeAuthoredPlaceBoundaryForProbe(
    boundary,
    fallbackRoot,
    entity,
    'places/place_debris_chunk.glb',
    {},
    scene,
    {
      releaseMode: true,
      deferBoundaryPublication: true,
      loadAuthoredPart: async () => record,
      prepareAuthoredPipelines: async (root) => {
        stagedRoot = root;
        root.traverse((object) => {
          if (!failingGeometry && object.geometry) failingGeometry = object.geometry;
        });
        assert.ok(failingGeometry);
        restoreDispose = failingGeometry.dispose;
        failingGeometry.dispose = () => { throw new Error('injected prepared-place cleanup refusal'); };
        throw new Error('injected prepared-place pipeline failure');
      },
    },
  );

  await assert.rejects(admission, /Prepared authored place cleanup failed/);
  assert.ok(stagedRoot);
  assert.equal(boundary.userData.authoredAssetState, 'compiling-pipelines');
  assert.notEqual(boundary.userData.authoredAssetState, 'same-semantic-fallback-prepared');
  assert.equal(typeof boundary.userData.__disposePreparedAuthoredBoundary, 'function',
    'the failed cleanup remains retryable for the generation manager');

  failingGeometry.dispose = restoreDispose;
  assert.equal(await disposePreparedAuthoredBoundary(boundary), true);
  assert.equal(stagedRoot.children.length, 0);
  assert.equal(boundary.userData.__disposePreparedAuthoredBoundary, undefined);
  scene.remove(boundary);
  sourceGeometry.dispose();
  sourceMaterial.dispose();
});

test('repeated package-backed ship roots promote only eligible rigid surfaces into scene pools', async () => {
  const renderer = {};
  const scene = new THREE.Scene();
  const dynamicBuffers = createDynamicBufferCoordinator(scene);
  const fixture = await packageShipFixture();
  const preparedPoolTargets = [];
  const residentPoolTargets = [];
  const options = {
    releaseMode: true,
    libraryScope: 'render-package-ship-pool-test',
    bootstrapPlan: {},
    loadAuthoredPart: async (url) => {
      assert.match(url, /wholeships\/helios_span\.glb$/);
      return fixture.record;
    },
    prepareAuthoredPipelines: async (subject) => {
      if (subject?.isInstancedMesh) {
        assert.equal(subject.parent, null, 'the exact pool target compiles before scene publication');
        assert.equal(subject.count, 0, 'no pool slot is submitted before exact program admission');
        preparedPoolTargets.push(subject);
      }
      return { skipped: false };
    },
    prepareAuthoredGpuResidency: async (subject) => {
      if (subject?.isInstancedMesh) {
        assert.equal(subject.parent, null, 'the exact pool target remains unpublished through GPU residency');
        assert.equal(subject.count, 0, 'GPU residency precedes every visible pool slot');
        residentPoolTargets.push(subject);
      }
      return { skipped: false };
    },
  };
  const restoreRuntime = installAuthoredAdmissionRuntime(scene, options);
  await preloadAuthoredPartLibrary(renderer, options);

  try {
    const first = await admitPackageShip('package-hauler-a', 0, renderer, scene, options);
    const firstInstance = authoredPackageInstance(first);
    const firstEligible = firstInstance.nodes.get('eligible');
    assert.equal(firstEligible.isMesh, true, 'a unique package surface stays a direct mesh');
    assert.equal(firstEligible.visible, true);
    assert.equal(scene.children.some((object) => object.userData?.spacefaceInstancePool), false,
      'one package root creates no singleton GPU pool');

    const second = await admitPackageShip('package-hauler-b', 40, renderer, scene, options);
    const secondInstance = authoredPackageInstance(second);
    const secondEligible = secondInstance.nodes.get('eligible');
    syncAuthoredInstancePools(scene);
    const pools = scene.children.filter((object) => object.userData?.spacefaceInstancePool);

    assert.equal(pools.length, 1);
    assert.equal(pools[0].count, 2, 'one existing pool owns both repeated authored-root surfaces');
    assert.equal(preparedPoolTargets.length, 1);
    assert.strictEqual(preparedPoolTargets[0], pools[0], 'pipeline admission receives the exact live pool target');
    assert.equal(residentPoolTargets.length, 1);
    assert.strictEqual(residentPoolTargets[0], pools[0], 'GPU residency receives the exact live pool target');
    for (let index = 0; index < 2; index++) {
      const submittedMatrix = new THREE.Matrix4();
      pools[0].getMatrixAt(index, submittedMatrix);
      assert.notEqual(submittedMatrix.determinant(), 0,
        `production pool sync submits repeated authored root slot ${index}`);
    }
    assert.equal(firstInstance.nodes.get('eligible'), firstEligible,
      'promotion preserves the first package semantic-map object identity');
    assert.equal(firstInstance.planNodes.includes(firstEligible), true,
      'promotion preserves first planNodes indexing');
    assert.equal(secondInstance.nodes.get('eligible'), secondEligible);
    assert.equal(secondInstance.planNodes.includes(secondEligible), true);
    for (const proxy of [firstEligible, secondEligible]) {
      assert.equal(proxy.isMesh, false, 'only direct renderer submission is suppressed');
      assert.equal(proxy.visible, true, 'pool visibility retains the authored/LOD-visible proxy state');
      assert.equal(proxy.userData.spacefaceInstanceProxy, true);
      assert.strictEqual(proxy.geometry, fixture.geometry);
      assert.ok(proxy.material, 'proxy retains its final shared material for bounds and texture residency');
      assert.equal(proxy.userData.spacefaceInstancePoolKey, pools[0].userData.spacefaceInstancePoolKey);
    }

    for (const id of fixture.excludedIds) {
      assert.equal(firstInstance.nodes.get(id).isMesh, true, `${id} stays direct on the first root`);
      assert.equal(secondInstance.nodes.get(id).isMesh, true, `${id} stays direct on the repeated root`);
      assert.notEqual(firstInstance.nodes.get(id).userData.spacefaceInstanceProxy, true);
      assert.notEqual(secondInstance.nodes.get(id).userData.spacefaceInstanceProxy, true);
    }
    const secondary = secondInstance.nodes.get(fixture.secondaryId);
    secondary.visible = false;
    syncAuthoredInstancePools(scene);
    assert.equal(secondary.visible, false, 'the real Helios Span damage-secondary transition remains direct');
    assert.equal(secondary.isMesh, true);

    let retiredPoolDisposals = 0;
    pools[0].addEventListener('dispose', () => { retiredPoolDisposals++; });
    scene.remove(second);
    assert.equal(scene.children.some((object) => object.userData?.spacefaceInstancePool), false,
      'dropping below two package owners demotes the survivor and retires its pool');
    assert.equal(firstEligible.isMesh, true);
    assert.equal(firstEligible.visible, true);
    assert.equal(firstEligible.userData.spacefacePackagePoolCandidate, true,
      'the surviving direct mesh becomes the next cross-root candidate');
    assert.equal(dynamicBuffers.getDiagnostics().registeredOwners, 0,
      'unique-owner collapse unregisters the pool dynamic-buffer owner');
    assert.equal(retiredPoolDisposals, 1,
      'empty-pool teardown disposes InstancedMesh-specific GPU state exactly once');
    scene.remove(first);

    const third = await admitPackageShip('package-hauler-c', 80, renderer, scene, options);
    assert.equal(scene.children.some((object) => object.userData?.spacefaceInstancePool), false,
      'same-key re-admission starts direct without reviving a dead singleton pool');
    const fourth = await admitPackageShip('package-hauler-d', 120, renderer, scene, options);
    syncAuthoredInstancePools(scene);
    const readmittedPools = scene.children.filter((object) => object.userData?.spacefaceInstancePool);
    assert.equal(readmittedPools.length, 1, 'same-key repetition creates one clean replacement pool');
    assert.notStrictEqual(readmittedPools[0], pools[0]);
    assert.equal(readmittedPools[0].count, 2);
    assert.equal(dynamicBuffers.getDiagnostics().registeredOwners, 1);
    scene.remove(third, fourth);
    assert.equal(dynamicBuffers.getDiagnostics().registeredOwners, 0);
  } finally {
    for (const child of [...scene.children]) scene.remove(child);
    invalidatePartsLibraryCaches(renderer);
    restoreRuntime();
  }
});

test('hidden sector preparation defers package-pool promotion until exact boundary publication', async () => {
  const renderer = {};
  const scene = new THREE.Scene();
  const dynamicBuffers = createDynamicBufferCoordinator(scene);
  const fixture = await packageShipFixture();
  const preparedPoolTargets = [];
  const options = {
    releaseMode: true,
    libraryScope: 'render-package-hidden-sector-preparation-test',
    bootstrapPlan: {},
    loadAuthoredPart: async () => fixture.record,
    prepareAuthoredPipelines: async (subject) => {
      if (subject?.isInstancedMesh) {
        assert.equal(subject.parent, null);
        assert.equal(subject.count, 0);
        preparedPoolTargets.push(subject);
      }
      return { skipped: false };
    },
    prepareAuthoredGpuResidency: async () => ({ skipped: false }),
  };
  const restoreRuntime = installAuthoredAdmissionRuntime(scene, options);
  await preloadAuthoredPartLibrary(renderer, options);

  try {
    const current = await admitPackageShip('package-current-sector-owner', 0, renderer, scene, options);
    const currentInstance = authoredPackageInstance(current);
    const currentEligible = currentInstance.nodes.get('eligible');
    assert.equal(currentEligible.isMesh, true);

    const incoming = startPackageShip(
      'package-incoming-sector-owner',
      40,
      renderer,
      scene,
      options,
      {
        deferPackagePoolActivation: true,
        deferBoundaryPublication: true,
        overlapAuthoredPipelineCompile: false,
      },
    );
    incoming.visible = false;
    const completion = incoming.userData.authoredUpgradePromise;
    assert.ok(completion && typeof completion.then === 'function');
    assert.strictEqual(
      incoming.userData.requestAuthoredUpgrade(renderer, scene, {
        deferPackagePoolActivation: true,
        deferBoundaryPublication: true,
      }),
      completion,
      'one boundary exposes one stable admission settlement promise',
    );
    const receipt = await completion;
    assert.equal(receipt.error, null);
    assert.equal(receipt.result, true);
    assert.equal(incoming.userData.authoredAssetState, 'authored-prepared');

    const incomingInstance = authoredPackageInstance(incoming);
    const incomingEligible = incomingInstance.nodes.get('eligible');
    assert.equal(currentEligible.isMesh, true,
      'hidden preparation cannot promote the already-live direct candidate');
    assert.equal(incomingEligible.isMesh, true,
      'the prepared owner stays direct until publication activates the pool transaction');
    assert.equal(scene.children.some((object) => object.userData?.spacefaceInstancePool), false);
    assert.equal(dynamicBuffers.getDiagnostics().registeredOwners, 1,
      'the detached GPU backing is range-owned before publication without submitting a draw');
    assert.equal(preparedPoolTargets.length, 1, 'the exact eventual pool target is GPU-prepared once');
    assert.equal(preparedPoolTargets[0].parent, null);
    assert.equal(preparedPoolTargets[0].count, 0);

    assert.equal(publishPreparedAuthoredBoundary(incoming), true);
    assert.equal(incoming.userData.authoredAssetState, 'authored');
    syncAuthoredInstancePools(scene);
    const pools = scene.children.filter((object) => object.userData?.spacefaceInstancePool);
    assert.deepEqual(pools, preparedPoolTargets,
      'publication activates the same prepared target rather than rebuilding it');
    assert.equal(pools[0].count, 1,
      'the hidden incoming owner submits no slot before the final reveal');
    incoming.visible = true;
    syncAuthoredInstancePools(scene);
    assert.equal(pools[0].count, 2);
    assert.equal(dynamicBuffers.getDiagnostics().registeredOwners, 1);
    assert.strictEqual(currentInstance.nodes.get('eligible'), currentEligible);
    assert.strictEqual(incomingInstance.nodes.get('eligible'), incomingEligible);
    assert.equal(currentEligible.isMesh, false);
    assert.equal(incomingEligible.isMesh, false);

    assert.equal(publishPreparedAuthoredBoundary(incoming), true,
      'prepared-boundary publication is idempotent');
    assert.equal(scene.children.filter((object) => object.userData?.spacefaceInstancePool).length, 1);
    scene.remove(incoming);
    assert.equal(currentEligible.isMesh, true,
      'owner removal collapses the pool back to the surviving live direct candidate');
    assert.equal(scene.children.some((object) => object.userData?.spacefaceInstancePool), false);
    scene.remove(current);
  } finally {
    for (const child of [...scene.children]) scene.remove(child);
    invalidatePartsLibraryCaches(renderer);
    restoreRuntime();
  }
});

test('preparing ship cleanup failure remains journaled for generation quarantine and retry', async () => {
  const renderer = {};
  const scene = new THREE.Scene();
  const fixture = await packageShipFixture({ includeAuthoredNavLights: false });
  let stagedRoot = null;
  let failingGeometry = null;
  let restoreGeometryDispose = null;
  let failingNavObject = null;
  let restoreNavObjectDispose = null;
  let navObjectDisposeAttempts = 0;
  let fallbackNavMaterialDisposals = 0;
  let staleNavObjectDisposals = 0;
  let staleGeometryDisposals = 0;
  let preparedRootWasContextVisible = false;
  let failedResourcesWereContextVisible = false;
  let detachedContextListeners = 0;
  const contextDisposeListener = (event) => {
    if (event.target === failingNavObject) staleNavObjectDisposals++;
  };
  const geometryContextDisposeListener = (event) => {
    if (event.target === failingGeometry) staleGeometryDisposals++;
  };
  Object.defineProperty(geometryContextDisposeListener, 'name', { configurable: true, value: 'r' });
  captureSimulatedRendererInstancedMeshDisposeRegistration(
    renderer,
    scene,
    contextDisposeListener,
    { geometry: geometryContextDisposeListener },
  );
  const options = {
    releaseMode: true,
    libraryScope: 'render-package-preparing-cleanup-retry-test',
    bootstrapPlan: {},
    loadAuthoredPart: async () => fixture.record,
    prepareAuthoredPipelines: async (subject) => {
      if (!subject?.isGroup) return { skipped: false };
      stagedRoot = subject;
      const boundsProxy = subject.getObjectByName('GLTFKit_BoundsProxy');
      failingGeometry = boundsProxy?.geometry || null;
      assert.ok(failingGeometry);
      const fallbackNavLights = subject.getObjectByName('GLTFKit_Nav_Lights');
      assert.ok(fallbackNavLights?.isInstancedMesh,
        'a whole-ship package without authored nav tags uses the owner-local fallback light material');
      fallbackNavLights.addEventListener('dispose', contextDisposeListener);
      failingGeometry.addEventListener('dispose', geometryContextDisposeListener);
      failingNavObject = fallbackNavLights;
      restoreNavObjectDispose = fallbackNavLights.dispose.bind(fallbackNavLights);
      fallbackNavLights.dispose = () => {
        navObjectDisposeAttempts++;
        if (navObjectDisposeAttempts === 1) {
          throw new Error('injected preparing ship object cleanup refusal');
        }
        return restoreNavObjectDispose();
      };
      const originalNavMaterialDispose = fallbackNavLights.material.dispose.bind(fallbackNavLights.material);
      fallbackNavLights.material.dispose = () => {
        fallbackNavMaterialDisposals++;
        originalNavMaterialDispose();
      };
      restoreGeometryDispose = failingGeometry.dispose;
      failingGeometry.dispose = () => { throw new Error('injected preparing ship cleanup refusal'); };
      throw new Error('injected preparing ship pipeline failure');
    },
    prepareAuthoredGpuResidency: async () => ({ skipped: false }),
  };
  const restoreRuntime = installAuthoredAdmissionRuntime(scene, options);
  await preloadAuthoredPartLibrary(renderer, options);

  try {
    const boundary = startPackageShip(
      'package-preparing-cleanup-retry',
      0,
      renderer,
      scene,
      options,
      {
        deferPackagePoolActivation: true,
        deferBoundaryPublication: true,
        overlapAuthoredPipelineCompile: false,
      },
    );
    const receipt = await boundary.userData.authoredUpgradePromise;

    assert.ok(stagedRoot);
    assert.ok(receipt.error instanceof AggregateError);
    assert.match(receipt.error.message, /cleanup failed/i);
    assert.equal(typeof boundary.userData.__disposePreparedAuthoredBoundary, 'function',
      'a failed PREPARING cleanup remains owned by the boundary journal');
    assert.equal(stagedRoot.children.length, 0,
      'cleanup exhausts later graph teardown even though one resource disposer failed');
    const contextReceipt = detachPreparedContextLossResources(scene, renderer);
    preparedRootWasContextVisible = contextReceipt.roots.includes(stagedRoot);
    failedResourcesWereContextVisible = contextReceipt.roots.includes(failingNavObject)
      && contextReceipt.roots.includes(failingGeometry);
    detachedContextListeners = contextReceipt.listenersDetached;
    assert.equal(preparedRootWasContextVisible, true,
      'the detached authored root remains discoverable after a cleanup-blocked graph clear');
    assert.equal(failedResourcesWereContextVisible, true,
      'failed owner-local resources remain explicit context-loss roots after graph teardown');
    assert.equal(detachedContextListeners, 2,
      'context loss detaches exact object and geometry callbacks from the blocked prepared owner');
    assert.equal(staleNavObjectDisposals, 0);
    assert.equal(staleGeometryDisposals, 0);
    assert.equal(navObjectDisposeAttempts, 1);
    assert.equal(fallbackNavMaterialDisposals, 1,
      'owner-local fallback material cleanup is not skipped by an earlier resource failure');

    failingGeometry.dispose = restoreGeometryDispose;
    assert.equal(await disposePreparedAuthoredBoundary(boundary), true);
    assert.equal(stagedRoot.children.length, 0);
    assert.equal(navObjectDisposeAttempts, 2);
    assert.equal(fallbackNavMaterialDisposals, 1,
      'retrying the failed journal does not redispose resources that already completed cleanup');
    assert.equal(staleNavObjectDisposals, 0);
    assert.equal(staleGeometryDisposals, 0);
    assert.equal(boundary.userData.__disposePreparedAuthoredBoundary, undefined);
    scene.remove(boundary);
  } finally {
    for (const child of [...scene.children]) scene.remove(child);
    invalidatePartsLibraryCaches(renderer);
    restoreRuntime();
  }
});

test('context loss detaches only the minified Three InstancedMesh listener captured by a private render probe', async () => {
  const webglObjectsSource = await readFile(new URL(
    '../node_modules/three/src/renderers/webgl/WebGLObjects.js',
    import.meta.url,
  ), 'utf8');
  const transformed = await transform(webglObjectsSource, {
    format: 'esm',
    minify: true,
    target: 'es2022',
  });
  const minifiedModuleUrl = `data:text/javascript;base64,${Buffer.from(transformed.code).toString('base64')}`;
  const { WebGLObjects: MinifiedWebGLObjects } = await import(minifiedModuleUrl);

  const renderer = {};
  const scene = new THREE.Scene();
  const geometry = new THREE.SphereGeometry(0.1, 6, 4);
  const material = new THREE.MeshBasicMaterial();
  const navLights = new THREE.InstancedMesh(geometry, material, 2);
  navLights.name = 'GLTFKit_Nav_Lights';
  scene.add(navLights);

  let anonymousForeignDisposals = 0;
  let sameNamedForeignDisposals = 0;
  let asyncForeignDisposals = 0;
  const anonymousForeign = () => { anonymousForeignDisposals++; };
  Object.defineProperty(anonymousForeign, 'name', { configurable: true, value: '' });
  const sameNamedForeign = () => { sameNamedForeignDisposals++; };
  navLights.addEventListener('dispose', anonymousForeign);
  navLights.addEventListener('dispose', sameNamedForeign);

  const releasedObjects = [];
  const removedAttributes = [];
  let frame = 0;
  const createMinifiedObjects = () => MinifiedWebGLObjects(
    { ARRAY_BUFFER: 0x8892 },
    { get: (_object, objectGeometry) => objectGeometry, update() {} },
    {
      update() {},
      remove(attribute) { removedAttributes.push(attribute); },
    },
    { releaseStatesOfObject(object) { releasedObjects.push(object); } },
    { render: { frame: ++frame } },
  );

  const firstObjects = createMinifiedObjects();
  const firstProbe = beginAuthoredInstanceMeshDisposeRegistrationProbe(scene, renderer);
  assert.ok(firstProbe?.probe?.isInstancedMesh);
  firstObjects.update(firstProbe.probe);
  firstObjects.update(navLights);
  const firstExactListener = navLights._listeners.dispose.find((listener) => (
    listener !== anonymousForeign && listener !== sameNamedForeign
  ));
  assert.equal(typeof firstExactListener, 'function');
  assert.notEqual(firstExactListener.name, 'onInstancedMeshDispose',
    'the real esbuild-minified Three registration no longer retains its source function name');
  Object.defineProperty(sameNamedForeign, 'name', {
    configurable: true,
    value: firstExactListener.name,
  });
  assert.equal(sameNamedForeign.name, firstExactListener.name,
    'a foreign listener may share the minified callback name without sharing provenance');
  assert.equal(endAuthoredInstanceMeshDisposeRegistrationProbe(firstProbe).listener, firstExactListener);
  releasedObjects.length = 0;
  removedAttributes.length = 0;

  const firstReceipt = detachPreparedContextLossResources(scene, renderer);
  assert.ok(firstReceipt.roots.includes(scene));
  assert.equal(firstReceipt.listenersDetached, 1);
  assert.equal(navLights.hasEventListener('dispose', anonymousForeign), true);
  assert.equal(navLights.hasEventListener('dispose', sameNamedForeign), true);
  navLights.dispose();
  assert.equal(anonymousForeignDisposals, 1);
  assert.equal(sameNamedForeignDisposals, 1);
  assert.equal(releasedObjects.includes(navLights), false,
    'the old renderer-context callback cannot run during later target disposal');

  const secondObjects = createMinifiedObjects();
  const secondProbe = beginAuthoredInstanceMeshDisposeRegistrationProbe(scene, renderer);
  secondObjects.update(secondProbe.probe);
  secondObjects.update(navLights);
  const secondExactListener = navLights._listeners.dispose.find((listener) => (
    listener !== anonymousForeign && listener !== sameNamedForeign
  ));
  assert.equal(typeof secondExactListener, 'function');
  assert.notStrictEqual(secondExactListener, firstExactListener,
    'a restored renderer generation owns a distinct exact callback identity');
  assert.equal(endAuthoredInstanceMeshDisposeRegistrationProbe(secondProbe).listener, secondExactListener);
  releasedObjects.length = 0;
  removedAttributes.length = 0;

  assert.equal(detachPreparedContextLossResources(scene, renderer).listenersDetached, 1);
  navLights.dispose();
  assert.equal(anonymousForeignDisposals, 2);
  assert.equal(sameNamedForeignDisposals, 2);
  assert.equal(releasedObjects.includes(navLights), false);

  const asyncForeign = () => { asyncForeignDisposals++; };
  await prepareAuthoredVisualPipelines(scene, {
    prepareAuthoredPipelines: async () => {
      await Promise.resolve();
      navLights.addEventListener('dispose', asyncForeign);
      return { skipped: false };
    },
  });
  assert.equal(detachPreparedContextLossResources(scene, renderer).listenersDetached, 0,
    'foreign listeners added during asynchronous admission are never renderer provenance');
  navLights.dispose();
  assert.equal(anonymousForeignDisposals, 3);
  assert.equal(sameNamedForeignDisposals, 3);
  assert.equal(asyncForeignDisposals, 1);
  geometry.dispose();
  material.dispose();
});

test('completed renderer provenance reuses one no-probe receipt without frame allocation', () => {
  const first = endAuthoredInstanceMeshDisposeRegistrationProbe(null);
  const second = endAuthoredInstanceMeshDisposeRegistrationProbe(null);
  const alreadyEnded = endAuthoredInstanceMeshDisposeRegistrationProbe({ ended: true });

  assert.strictEqual(second, first);
  assert.strictEqual(alreadyEnded, first);
  assert.deepEqual(first, { captured: false, listener: null });
  assert.equal(Object.isFrozen(first), true);
});

test('private renderer-generation probe captures actual minified Three disposal producers', async () => {
  const { canvas, renderer } = await createActualMinifiedThreeRenderer();
  const scene = new THREE.Scene();
  const originalShadowState = { ...renderer.shadowMap };
  const priorTarget = new THREE.WebGLRenderTarget(1, 1);
  renderer.setRenderTarget(priorTarget, 4, 2);

  const firstProbe = beginAuthoredInstanceMeshDisposeRegistrationProbe(scene, renderer);
  assert.strictEqual(renderer.getRenderTarget(), priorTarget,
    'the private render target never escapes the capture boundary');
  assert.equal(renderer.getActiveCubeFace(), 4);
  assert.equal(renderer.getActiveMipmapLevel(), 2);
  assert.deepEqual({
    autoUpdate: renderer.shadowMap.autoUpdate,
    enabled: renderer.shadowMap.enabled,
    needsUpdate: renderer.shadowMap.needsUpdate,
  }, {
    autoUpdate: originalShadowState.autoUpdate,
    enabled: originalShadowState.enabled,
    needsUpdate: originalShadowState.needsUpdate,
  },
    'the one-time private shadow path restores renderer shadow state');
  const firstCapture = endAuthoredInstanceMeshDisposeRegistrationProbe(firstProbe);
  assert.equal(firstCapture.complete, true);
  assert.deepEqual(firstCapture.captureErrors, []);
  assert.deepEqual(firstCapture.provenanceStatus.listenerCounts, {
    instancedMeshes: 1,
    geometries: 1,
    materials: 2,
    textures: 1,
    renderTargets: 1,
  });
  const listenerSets = (registration) => ({
    instancedMeshes: [...registration.instancedMeshes],
    geometries: [...registration.geometries],
    materials: [...registration.materials],
    textures: [...registration.textures],
    renderTargets: [...registration.renderTargets],
  });
  const firstListeners = listenerSets(firstCapture.registration);
  const sourceCallbackNames = new Set([
    'onGeometryDispose',
    'onInstancedMeshDispose',
    'onMaterialDispose',
    'onRenderTargetDispose',
    'onTextureDispose',
  ]);
  for (const [kind, listeners] of Object.entries(firstListeners)) {
    for (const listener of listeners) {
      assert.equal(sourceCallbackNames.has(listener.name), false,
        `${kind} uses an opaque identity emitted by the actual minified Three producer`);
    }
  }
  renderer.setRenderTarget(null);
  priorTarget.dispose();

  const texture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  texture.needsUpdate = true;
  const material = new THREE.MeshBasicMaterial({ map: texture, alphaTest: 0.5 });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.5, -0.5, 0,
    0.5, -0.5, 0,
    0, 0.5, 0,
  ], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([
    0, 0,
    1, 0,
    0.5, 1,
  ], 2));
  const target = new THREE.WebGLRenderTarget(1, 1);
  const mesh = new THREE.InstancedMesh(geometry, material, 1);
  mesh.count = 0;
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 10);
  camera.position.set(0, 0, 2);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const light = new THREE.DirectionalLight(0xffffff, 0);
  light.castShadow = true;
  light.position.set(0, 0, 2);
  light.shadow.mapSize.set(1, 1);
  scene.add(mesh, light, light.target);
  let foreignDisposals = 0;
  const foreign = () => { foreignDisposals++; };
  Object.defineProperty(foreign, 'name', {
    configurable: true,
    value: firstListeners.instancedMeshes[0].name,
  });
  const attachForeign = () => {
    for (const resource of [mesh, geometry, material, texture, target]) {
      resource.addEventListener('dispose', foreign);
    }
  };
  attachForeign();
  renderer.shadowMap.enabled = true;
  renderer.setRenderTarget(target);
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);

  const exactResources = (listeners) => [
    [mesh, listeners.instancedMeshes],
    [geometry, listeners.geometries],
    [material, listeners.materials],
    [texture, listeners.textures],
    [target, listeners.renderTargets],
  ];
  for (const [resource, exactListeners] of exactResources(firstListeners)) {
    assert.equal(resource.hasEventListener('dispose', foreign), true);
    for (const listener of exactListeners) {
      assert.equal(resource.hasEventListener('dispose', listener), true,
        'the same actual renderer generation owns the live resource registration');
    }
  }

  const firstPrepared = prepareAuthoredInstancePoolsForContextLoss(scene, renderer);
  const firstDetach = detachStaleWebGlDisposeListeners(
    [...firstPrepared.roots, target],
    firstPrepared.provenance,
  );
  assert.equal(firstDetach.provenanceComplete, true);
  assert.equal(firstDetach.listenersDetached, 6);
  for (const [resource, exactListeners] of exactResources(firstListeners)) {
    assert.equal(resource.hasEventListener('dispose', foreign), true);
    for (const listener of exactListeners) {
      assert.equal(resource.hasEventListener('dispose', listener), false);
    }
  }

  canvas.emit('webglcontextlost', { preventDefault() {} });
  canvas.emit('webglcontextrestored');
  const secondProbe = beginAuthoredInstanceMeshDisposeRegistrationProbe(scene, renderer);
  assert.ok(secondProbe, 'consumed old-generation ownership requires a fresh private probe');
  const secondCapture = endAuthoredInstanceMeshDisposeRegistrationProbe(secondProbe);
  assert.equal(secondCapture.complete, true);
  assert.notStrictEqual(secondCapture.registration, firstCapture.registration,
    'the restored context owns a fresh provenance receipt even when a callback identity is stable');
  assert.deepEqual(secondCapture.provenanceStatus.listenerCounts, {
    instancedMeshes: 1,
    geometries: 1,
    materials: 2,
    textures: 1,
    renderTargets: 1,
  });
  const secondListeners = listenerSets(secondCapture.registration);
  renderer.shadowMap.enabled = true;
  renderer.setRenderTarget(target);
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  for (const [resource, exactListeners] of exactResources(secondListeners)) {
    assert.equal(resource.hasEventListener('dispose', foreign), true);
    for (const listener of exactListeners) {
      assert.equal(resource.hasEventListener('dispose', listener), true,
        'the restored generation re-registers every callback it owns');
    }
  }

  const secondPrepared = prepareAuthoredInstancePoolsForContextLoss(scene, renderer);
  const secondDetach = detachStaleWebGlDisposeListeners(
    [...secondPrepared.roots, target],
    secondPrepared.provenance,
  );
  assert.equal(secondDetach.provenanceComplete, true);
  assert.equal(secondDetach.listenersDetached, 6);
  for (const resource of [mesh, geometry, material, texture, target]) {
    assert.equal(resource.hasEventListener('dispose', foreign), true);
  }

  scene.remove(mesh);
  scene.remove(light, light.target);
  mesh.dispose();
  geometry.dispose();
  material.dispose();
  texture.dispose();
  target.dispose();
  light.shadow.dispose();
  renderer.dispose();
  assert.equal(foreignDisposals, 5,
    'only the same-named foreign callbacks remain when live resources are finally disposed');
});

test('discarding a prepared hidden owner retires its detached pool without touching the live candidate', async () => {
  const renderer = {};
  const scene = new THREE.Scene();
  const dynamicBuffers = createDynamicBufferCoordinator(scene);
  const fixture = await packageShipFixture();
  let preparedTarget = null;
  const options = {
    releaseMode: true,
    libraryScope: 'render-package-hidden-sector-abort-test',
    bootstrapPlan: {},
    loadAuthoredPart: async () => fixture.record,
    prepareAuthoredPipelines: async (subject) => {
      if (subject?.isInstancedMesh) preparedTarget = subject;
      return { skipped: false };
    },
    prepareAuthoredGpuResidency: async () => ({ skipped: false }),
  };
  const restoreRuntime = installAuthoredAdmissionRuntime(scene, options);
  await preloadAuthoredPartLibrary(renderer, options);

  try {
    const current = await admitPackageShip('package-abort-current', 0, renderer, scene, options);
    const currentEligible = authoredPackageInstance(current).nodes.get('eligible');
    const incoming = startPackageShip(
      'package-abort-incoming',
      40,
      renderer,
      scene,
      options,
      {
        deferPackagePoolActivation: true,
        deferBoundaryPublication: true,
        overlapAuthoredPipelineCompile: false,
      },
    );
    incoming.visible = false;
    await incoming.userData.authoredUpgradePromise;
    assert.equal(incoming.userData.authoredAssetState, 'authored-prepared');
    assert.ok(preparedTarget);
    assert.equal(preparedTarget.parent, null);
    assert.equal(preparedTarget.count, 0);
    assert.equal(dynamicBuffers.getDiagnostics().registeredOwners, 1);
    let disposals = 0;
    preparedTarget.addEventListener('dispose', () => { disposals++; });

    scene.remove(incoming);
    assert.equal(disposals, 1, 'the unpublished detached target retires with its hidden owner');
    assert.equal(dynamicBuffers.getDiagnostics().registeredOwners, 0);
    assert.equal(scene.children.some((object) => object.userData?.spacefaceInstancePool), false);
    assert.equal(currentEligible.isMesh, true);
    assert.equal(currentEligible.visible, true);
    assert.equal(currentEligible.userData.spacefacePackagePoolCandidate, true);
    scene.remove(current);
  } finally {
    for (const child of [...scene.children]) scene.remove(child);
    invalidatePartsLibraryCaches(renderer);
    restoreRuntime();
  }
});

test('package pool allocation failure leaves the accepted first surface direct and retryable', async () => {
  const renderer = {};
  const scene = new THREE.Scene();
  const dynamicBuffers = createDynamicBufferCoordinator(scene);
  const fixture = await packageShipFixture();
  const options = {
    releaseMode: true,
    libraryScope: 'render-package-ship-pool-failure-test',
    bootstrapPlan: {},
    loadAuthoredPart: async () => fixture.record,
  };
  await preloadAuthoredPartLibrary(renderer, options);

  try {
    const first = await admitPackageShip('package-failure-a', 0, renderer, scene, options);
    const firstEligible = authoredPackageInstance(first).nodes.get('eligible');
    const descriptor = Object.getOwnPropertyDescriptor(fixture.geometry, 'uuid');
    let reads = 0;
    Object.defineProperty(fixture.geometry, 'uuid', {
      configurable: true,
      get() {
        reads++;
        if (reads === 3) throw new Error('injected second-slot allocation failure');
        return descriptor.value;
      },
    });
    const failed = await requestPackageShip('package-failure-b', 40, renderer, scene, options);
    Object.defineProperty(fixture.geometry, 'uuid', descriptor);

    assert.equal(failed.userData.authoredAssetState, 'unavailable');
    assert.equal(firstEligible.isMesh, true, 'failed repetition never suppresses the accepted direct mesh');
    assert.equal(firstEligible.visible, true);
    assert.equal(firstEligible.userData.spacefacePackagePoolCandidate, true);
    assert.equal(scene.children.some((object) => object.userData?.spacefaceInstancePool), false,
      'partial allocation rolls back its detached chunk');
    assert.equal(dynamicBuffers.getDiagnostics().registeredOwners, 0);

    scene.remove(failed);
    const retry = await admitPackageShip('package-failure-c', 80, renderer, scene, options);
    syncAuthoredInstancePools(scene);
    const pool = scene.children.find((object) => object.userData?.spacefaceInstancePool);
    assert.ok(pool, 'the retained first candidate admits cleanly after the injected failure');
    assert.equal(pool.count, 2);
    scene.remove(first, retry);
    assert.equal(dynamicBuffers.getDiagnostics().registeredOwners, 0);
  } finally {
    for (const child of [...scene.children]) scene.remove(child);
    invalidatePartsLibraryCaches(renderer);
  }
});

test('package pool activation failure rolls back committed matrices and direct mesh identity', async () => {
  const renderer = {};
  const scene = new THREE.Scene();
  const dynamicBuffers = createDynamicBufferCoordinator(scene);
  const fixture = await packageShipFixture();
  let exactTarget = null;
  let injected = false;
  let activationMatrixWrites = 0;
  const options = {
    releaseMode: true,
    libraryScope: 'render-package-ship-pool-activation-failure-test',
    bootstrapPlan: {},
    loadAuthoredPart: async () => fixture.record,
    prepareAuthoredPipelines: async () => ({ skipped: false }),
    prepareAuthoredGpuResidency: async (subject) => {
      if (subject?.isInstancedMesh && !injected) {
        exactTarget = subject;
        injected = true;
        const setMatrixAt = subject.setMatrixAt.bind(subject);
        let failNext = true;
        subject.setMatrixAt = (...args) => {
          activationMatrixWrites++;
          if (failNext) {
            failNext = false;
            throw new Error('injected detached activation matrix commit failure');
          }
          return setMatrixAt(...args);
        };
      }
      return { skipped: false };
    },
  };
  const restoreRuntime = installAuthoredAdmissionRuntime(scene, options);
  await preloadAuthoredPartLibrary(renderer, options);

  try {
    const first = await admitPackageShip('package-activation-a', 0, renderer, scene, options);
    const firstEligible = authoredPackageInstance(first).nodes.get('eligible');
    let sharedGeometryDisposeCalls = 0;
    let sharedMaterialDisposeCalls = 0;
    const sharedGeometryDispose = firstEligible.geometry.dispose;
    const sharedMaterialDispose = firstEligible.material.dispose;
    firstEligible.geometry.dispose = function countedSharedGeometryDispose() {
      sharedGeometryDisposeCalls++;
      return sharedGeometryDispose.call(this);
    };
    firstEligible.material.dispose = function countedSharedMaterialDispose() {
      sharedMaterialDisposeCalls++;
      return sharedMaterialDispose.call(this);
    };
    const failed = await requestPackageShip('package-activation-b', 40, renderer, scene, options);

    assert.equal(failed.userData.authoredAssetState, 'unavailable');
    assert.ok(exactTarget);
    assert.equal(exactTarget.parent, null, 'failed activation never publishes its exact pool target');
    assert.ok(activationMatrixWrites >= 2,
      'the injected activation write fails once and the rollback rewrites the detached zero slot');
    assert.equal(firstEligible.isMesh, true, 'activation failure restores the accepted direct renderer identity');
    assert.equal(firstEligible.visible, true);
    assert.equal(firstEligible.userData.spacefacePackagePoolCandidate, true);
    assert.equal(firstEligible.userData.spacefaceInstancePoolChunk, undefined);
    assert.equal(firstEligible.userData.spacefaceInstancePoolSlot, undefined);
    assert.equal(dynamicBuffers.getDiagnostics().registeredOwners, 0);
    assert.equal(sharedGeometryDisposeCalls, 0,
      'failed sibling preparation never disposes canonical geometry owned by the live ship');
    assert.equal(sharedMaterialDisposeCalls, 0,
      'failed sibling preparation never disposes a shared live material');
    firstEligible.geometry.dispose = sharedGeometryDispose;
    firstEligible.material.dispose = sharedMaterialDispose;

    const source = await readFile(new URL('../src/render/partsLibrary.js', import.meta.url), 'utf8');
    const admissionBody = source.slice(
      source.indexOf('function activateRenderPackagePoolAdmission'),
      source.indexOf('function activatePackageSlotsTransaction'),
    );
    assert.equal((admissionBody.match(/commitInstanceChunkMatrix\(chunk\)/g) || []).length, 0,
      'no unguarded final commit remains after proxy transfer/publication');

    scene.remove(failed);
    const retry = await admitPackageShip('package-activation-c', 80, renderer, scene, options);
    syncAuthoredInstancePools(scene);
    assert.equal(scene.children.filter((object) => object.userData?.spacefaceInstancePool).length, 1,
      'the restored direct candidate remains retryable after activation failure');
    scene.remove(first, retry);
  } finally {
    for (const child of [...scene.children]) scene.remove(child);
    invalidatePartsLibraryCaches(renderer);
    restoreRuntime();
  }
});

test('removing one owner during package pool admission restores the live direct candidate', async () => {
  const renderer = {};
  const scene = new THREE.Scene();
  const dynamicBuffers = createDynamicBufferCoordinator(scene);
  const fixture = await packageShipFixture();
  let exactTarget = null;
  let releasePoolPreparation;
  let gpuResidencyCalls = 0;
  let staleObjectDisposals = 0;
  const contextDisposeListener = (event) => {
    if (event.target === exactTarget) staleObjectDisposals++;
  };
  captureSimulatedRendererInstancedMeshDisposeRegistration(
    renderer,
    scene,
    contextDisposeListener,
  );
  const poolPreparation = new Promise((resolve) => { releasePoolPreparation = resolve; });
  const options = {
    releaseMode: true,
    libraryScope: 'render-package-ship-pool-pending-removal-test',
    bootstrapPlan: {},
    loadAuthoredPart: async () => fixture.record,
    prepareAuthoredPipelines: async (subject) => {
      if (subject?.isInstancedMesh) {
        exactTarget = subject;
        await poolPreparation;
      }
      return { skipped: false };
    },
    prepareAuthoredGpuResidency: async () => {
      gpuResidencyCalls++;
      return { skipped: false };
    },
  };
  const restoreRuntime = installAuthoredAdmissionRuntime(scene, options);
  await preloadAuthoredPartLibrary(renderer, options);

  try {
    const first = await admitPackageShip('package-pending-a', 0, renderer, scene, options);
    const gpuResidencyCallsBeforeIncoming = gpuResidencyCalls;
    const firstEligible = authoredPackageInstance(first).nodes.get('eligible');
    const pending = startPackageShip('package-pending-b', 40, renderer, scene, options);
    for (let turn = 0; turn < 80 && !exactTarget; turn++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    assert.ok(exactTarget, 'the second root reaches exact detached pool admission');
    assert.equal(exactTarget.parent, null);
    assert.equal(exactTarget.count, 0);
    let disposals = 0;
    const disposeExactTarget = exactTarget.dispose.bind(exactTarget);
    exactTarget.dispose = () => {
      disposals++;
      return disposeExactTarget();
    };
    exactTarget.addEventListener('dispose', contextDisposeListener);

    scene.remove(pending);
    assert.equal(firstEligible.isMesh, true);
    assert.equal(firstEligible.visible, true);
    assert.equal(firstEligible.userData.spacefacePackagePoolCandidate, true);
    assert.equal(firstEligible.userData.spacefaceInstancePoolChunk, undefined);
    assert.equal(firstEligible.userData.spacefaceInstancePoolSlot, undefined);
    assert.equal(exactTarget.parent, null);
    assert.equal(disposals, 0, 'logical cancellation cannot dispose a target still owned by GPU prep');
    assert.equal(dynamicBuffers.getDiagnostics().registeredOwners, 1,
      'the backing owner remains valid through the admitted preparation barrier');
    const contextReceipt = detachPreparedContextLossResources(scene, renderer);
    assert.ok(contextReceipt.roots.includes(exactTarget),
      'context loss retains visibility of a logically retired target until its prep barrier settles');
    assert.equal(contextReceipt.listenersDetached, 1);

    releasePoolPreparation();
    await pending.userData.authoredUpgradePromise;
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(disposals, 1, 'the cancelled detached target retires once after GPU prep settles');
    assert.equal(staleObjectDisposals, 0, 'old-context InstancedMesh cleanup was detached before disposal');
    assert.equal(dynamicBuffers.getDiagnostics().registeredOwners, 0);
    assert.equal(gpuResidencyCalls, gpuResidencyCallsBeforeIncoming + 1,
      'owner cancellation after root compile prevents the detached pool from starting residency upload');
    assert.equal(firstEligible.isMesh, true, 'late preparation completion cannot re-promote the survivor');
    assert.equal(scene.children.some((object) => object.userData?.spacefaceInstancePool), false);
    scene.remove(first);
  } finally {
    releasePoolPreparation();
    for (const child of [...scene.children]) scene.remove(child);
    invalidatePartsLibraryCaches(renderer);
    restoreRuntime();
  }
});

test('deferred pool retirement remains discoverable and retryable after object cleanup refusal', async () => {
  const renderer = {};
  const scene = new THREE.Scene();
  const dynamicBuffers = createDynamicBufferCoordinator(scene);
  const fixture = await packageShipFixture();
  const poolPreparation = deferred();
  let exactTarget = null;
  const options = {
    releaseMode: true,
    libraryScope: 'render-package-retirement-cleanup-retry-test',
    bootstrapPlan: {},
    loadAuthoredPart: async () => fixture.record,
    prepareAuthoredPipelines: async (subject) => {
      if (subject?.isInstancedMesh) {
        exactTarget = subject;
        await poolPreparation.promise;
      }
      return { skipped: false };
    },
    prepareAuthoredGpuResidency: async () => ({ skipped: false }),
  };
  const restoreRuntime = installAuthoredAdmissionRuntime(scene, options);
  await preloadAuthoredPartLibrary(renderer, options);

  try {
    const current = await admitPackageShip('package-retirement-current', 0, renderer, scene, options);
    const pending = startPackageShip(
      'package-retirement-pending',
      40,
      renderer,
      scene,
      options,
      {
        deferPackagePoolActivation: true,
        deferBoundaryPublication: true,
        overlapAuthoredPipelineCompile: false,
      },
    );
    pending.visible = false;
    for (let turn = 0; turn < 80 && !exactTarget; turn++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    assert.ok(exactTarget);
    const realDispose = exactTarget.dispose.bind(exactTarget);
    let disposeAttempts = 0;
    exactTarget.dispose = () => {
      disposeAttempts++;
      if (disposeAttempts === 1) throw new Error('injected retired target dispose refusal');
      return realDispose();
    };

    scene.remove(pending);
    poolPreparation.resolve();
    const receipt = await pending.userData.authoredUpgradePromise;
    assert.ok(receipt.error instanceof AggregateError);
    assert.match(receipt.error.message, /cleanup failed/i);
    assert.equal(disposeAttempts, 1);
    assert.ok(detachPreparedContextLossResources(scene, renderer).roots.includes(exactTarget),
      'a failed retired target remains registered for context-loss listener detachment');
    assert.equal(dynamicBuffers.getDiagnostics().registeredOwners, 0,
      'successful earlier cleanup steps are retained while only the failed object disposal retries');
    assert.equal(typeof pending.userData.__disposePreparedAuthoredBoundary, 'function');

    assert.equal(await disposePreparedAuthoredBoundary(pending), true);
    assert.equal(disposeAttempts, 2);
    assert.equal(detachPreparedContextLossResources(scene, renderer).roots.includes(exactTarget), false);
    assert.equal(pending.userData.__disposePreparedAuthoredBoundary, undefined);
    scene.remove(current);
  } finally {
    poolPreparation.resolve();
    for (const child of [...scene.children]) scene.remove(child);
    invalidatePartsLibraryCaches(renderer);
    restoreRuntime();
  }
});

test('removing the current owner during hidden preparation leaves the incoming root direct', async () => {
  const renderer = {};
  const scene = new THREE.Scene();
  const dynamicBuffers = createDynamicBufferCoordinator(scene);
  const fixture = await packageShipFixture();
  const poolPreparation = deferred();
  let exactTarget = null;
  const options = {
    releaseMode: true,
    libraryScope: 'render-package-current-owner-pending-removal-test',
    bootstrapPlan: {},
    loadAuthoredPart: async () => fixture.record,
    prepareAuthoredPipelines: async (subject) => {
      if (subject?.isInstancedMesh) {
        exactTarget = subject;
        await poolPreparation.promise;
      }
      return { skipped: false };
    },
    prepareAuthoredGpuResidency: async () => ({ skipped: false }),
  };
  const restoreRuntime = installAuthoredAdmissionRuntime(scene, options);
  await preloadAuthoredPartLibrary(renderer, options);

  try {
    const current = await admitPackageShip('package-current-pending-remove', 0, renderer, scene, options);
    const incoming = startPackageShip('package-incoming-pending-survivor', 40, renderer, scene, options);
    for (let turn = 0; turn < 80 && !exactTarget; turn++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    assert.ok(exactTarget);
    let disposals = 0;
    exactTarget.addEventListener('dispose', () => { disposals++; });

    scene.remove(current);
    assert.strictEqual(incoming.parent, scene);
    assert.equal(disposals, 0);
    assert.equal(dynamicBuffers.getDiagnostics().registeredOwners, 1);

    poolPreparation.resolve();
    await incoming.userData.authoredUpgradePromise;
    await new Promise((resolve) => setTimeout(resolve, 0));
    const incomingEligible = authoredPackageInstance(incoming).nodes.get('eligible');
    assert.equal(disposals, 1);
    assert.equal(dynamicBuffers.getDiagnostics().registeredOwners, 0);
    assert.equal(incomingEligible.isMesh, true, 'late settlement cannot promote the sole survivor');
    assert.equal(incomingEligible.userData.spacefacePackagePoolCandidate, true);
    assert.equal(scene.children.some((object) => object.userData?.spacefaceInstancePool), false);
    scene.remove(incoming);
  } finally {
    poolPreparation.resolve();
    for (const child of [...scene.children]) scene.remove(child);
    invalidatePartsLibraryCaches(renderer);
    restoreRuntime();
  }
});

test('removing the current owner from a READY hidden pool keeps later publication direct', async () => {
  const renderer = {};
  const scene = new THREE.Scene();
  const dynamicBuffers = createDynamicBufferCoordinator(scene);
  const fixture = await packageShipFixture();
  let exactTarget = null;
  let staleObjectDisposals = 0;
  const minifiedObjectDispose = (event) => {
    if (event.target === exactTarget) staleObjectDisposals++;
  };
  captureSimulatedRendererInstancedMeshDisposeRegistration(
    renderer,
    scene,
    minifiedObjectDispose,
  );
  const options = {
    releaseMode: true,
    libraryScope: 'render-package-ready-current-owner-removal-test',
    bootstrapPlan: {},
    loadAuthoredPart: async () => fixture.record,
    prepareAuthoredPipelines: async (subject) => {
      if (subject?.isInstancedMesh) {
        exactTarget = subject;
        subject.addEventListener('dispose', minifiedObjectDispose);
      }
      return { skipped: false };
    },
    prepareAuthoredGpuResidency: async () => ({ skipped: false }),
  };
  const restoreRuntime = installAuthoredAdmissionRuntime(scene, options);
  await preloadAuthoredPartLibrary(renderer, options);

  try {
    const current = await admitPackageShip('package-ready-current-remove', 0, renderer, scene, options);
    const incoming = startPackageShip(
      'package-ready-incoming-survivor',
      40,
      renderer,
      scene,
      options,
      {
        deferPackagePoolActivation: true,
        deferBoundaryPublication: true,
        overlapAuthoredPipelineCompile: false,
      },
    );
    incoming.visible = false;
    await incoming.userData.authoredUpgradePromise;
    assert.equal(incoming.userData.authoredAssetState, 'authored-prepared');
    assert.ok(exactTarget);
    const incomingEligible = authoredPackageInstance(incoming).nodes.get('eligible');
    assert.equal(detachPreparedContextLossResources(scene, renderer).listenersDetached, 1);

    scene.remove(current);
    assert.equal(dynamicBuffers.getDiagnostics().registeredOwners, 0);
    assert.equal(staleObjectDisposals, 0);
    assert.equal(incomingEligible.isMesh, true);
    assert.equal(publishPreparedAuthoredBoundary(incoming), true);
    incoming.visible = true;
    syncAuthoredInstancePools(scene);
    assert.equal(incoming.userData.authoredAssetState, 'authored');
    assert.equal(incomingEligible.isMesh, true);
    assert.equal(scene.children.some((object) => object.userData?.spacefaceInstancePool), false);
    scene.remove(incoming);
  } finally {
    for (const child of [...scene.children]) scene.remove(child);
    invalidatePartsLibraryCaches(renderer);
    restoreRuntime();
  }
});

async function admitPackageShip(id, x, renderer, scene, options) {
  const boundary = await requestPackageShip(id, x, renderer, scene, options);
  assert.equal(boundary.userData.authoredAssetState, 'authored');
  return boundary;
}

async function requestPackageShip(id, x, renderer, scene, options) {
  const boundary = startPackageShip(id, x, renderer, scene, options);
  for (let turn = 0; turn < 80 && !['authored', 'unavailable'].includes(boundary.userData.authoredAssetState); turn++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return boundary;
}

function startPackageShip(id, x, renderer, scene, options, requestOptions = {}) {
  const entity = {
    id,
    type: 'ship',
    alive: true,
    team: 2,
    factionId: 'faction_union',
    radius: 20,
    pos: { x, z: 0 },
    data: {
      defId: 'ship_mule',
      trafficRole: 'hauler',
      sectorId: 'sector_helios_prime',
    },
  };
  const fallback = new THREE.Group();
  const fallbackHull = new THREE.Group();
  fallbackHull.add(new THREE.Mesh(new THREE.BoxGeometry(1, 0.5, 0.5), new THREE.MeshBasicMaterial()));
  fallback.add(fallbackHull);
  fallback.userData.hull = fallbackHull;
  const boundary = wrapShipWithAuthoredParts(entity, fallback, options);
  entity.mesh = boundary;
  boundary.position.x = x;
  scene.add(boundary);
  boundary.userData.requestAuthoredUpgrade(renderer, scene, requestOptions);
  return boundary;
}

function authoredPackageInstance(boundary) {
  let instance = null;
  boundary.traverse((object) => {
    if (!instance && object.userData?.renderPackageInstance) instance = object.userData.renderPackageInstance;
  });
  assert.ok(instance, 'admitted authored ship exposes its retained package instance');
  return instance;
}

function installAuthoredAdmissionRuntime(scene, options) {
  const previousWindow = globalThis.window;
  globalThis.window = {
    ...(previousWindow || {}),
    SF: {
      state: {
        mode: 'flight',
        render: {
          scene,
          compileObjectPipelines: options.prepareAuthoredPipelines,
          prepareAuthoredGpuResidency: options.prepareAuthoredGpuResidency,
        },
        world: { currentSectorId: 'sector_helios_prime' },
      },
    },
  };
  return () => {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  };
}

async function packageShipFixture({ includeAuthoredNavLights = true } = {}) {
  const heliosMetadata = JSON.parse(await readFile(new URL(
    '../assets/ships/release/render-packages/helios-span/render-package.json', import.meta.url,
  ), 'utf8'));
  const realSecondary = heliosMetadata.runtime.primitives.find((primitive) => (
    primitive.name === 'LOD0_Gun_Assembly' && primitive.tags?.damageRole === 'secondary'
  ));
  assert.ok(realSecondary, 'the production Helios Span package exposes its damage-secondary gun assembly');
  const geometry = new THREE.BoxGeometry(4, 2, 3);
  const opaque = new THREE.MeshStandardMaterial({ color: 0x8090a0, roughness: 0.7, metalness: 0.3 });
  const entries = [{ id: 'eligible', tags: Object.freeze({ lod: 'lod0', tint: 'hull', instance: true }) }];
  const add = (id, tags = {}, configure = null) => entries.push({ id, tags: Object.freeze(tags), configure });
  add('transparent', {}, (mesh) => { mesh.material = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.5 }); });
  add('canopy', { canopy: true });
  add('drive', { drive: 'core' });
  if (includeAuthoredNavLights) add('nav', { damageRole: 'navLight' });
  add('sensor', { damageRole: 'sensor' });
  add('armor', { damageRole: 'armor' });
  add(realSecondary.name, realSecondary.tags);
  add('decal', { decal: true });
  add('layers', {}, (mesh) => { mesh.layers.set(2); });
  add('renderOrder', {}, (mesh) => { mesh.renderOrder = 3; });
  add('customDepth', {}, (mesh) => { mesh.customDepthMaterial = new THREE.MeshDepthMaterial(); });
  add('customDistance', {}, (mesh) => { mesh.customDistanceMaterial = new THREE.MeshDistanceMaterial(); });
  add('morph', {}, (mesh) => { mesh.morphTargetInfluences = [0]; mesh.morphTargetDictionary = { pose: 0 }; });

  const template = new THREE.Group();
  template.name = 'PackageShipRoot';
  const sources = [];
  for (const entry of entries) {
    const mesh = new THREE.Mesh(geometry, opaque);
    mesh.name = entry.id;
    mesh.userData.spacefaceTags = entry.tags;
    if (entry.configure) entry.configure(mesh);
    template.add(mesh);
    sources.push(mesh);
  }
  const renderPackage = {
    assetId: 'sf.render.fixture.helios-span',
    contentHash: '2'.repeat(64),
    createInstance(instanceOptions = {}) {
      const planSources = [template, ...sources];
      const objects = new Array(planSources.length);
      for (let i = 0; i < planSources.length; i++) {
        const source = planSources[i];
        const parentIndex = i === 0 ? -1 : 0;
        const created = instanceOptions.createNode?.({ source, planIndex: i, parentIndex });
        const object = created == null ? source.clone(false) : created;
        objects[i] = object;
        if (parentIndex >= 0) objects[parentIndex].add(object);
      }
      return {
        root: objects[0],
        planNodes: objects,
        nodes: new Map(entries.map((entry, index) => [entry.id, objects[index + 1]])),
        anchors: new Map(),
        dynamicGroups: new Map(),
        dispose() { return true; },
      };
    },
  };
  return {
    geometry,
    secondaryId: realSecondary.name,
    excludedIds: entries.slice(1).map((entry) => entry.id),
    record: {
      url: 'assets/ships/release/parts/wholeships/helios_span.glb',
      assetId: 'SF_WHOLESHIP_HELIOS_SPAN',
      slot: 'hull',
      bounds: { min: [-2, -1, -1.5], max: [2, 1, 1.5], size: [4, 2, 3], center: [0, 0, 0] },
      primitives: entries.map((entry) => ({
        key: `helios-span:${entry.id}`,
        name: entry.id,
        geometry,
        material: sources[entries.indexOf(entry)].material,
        matrix: new THREE.Matrix4(),
        tags: entry.tags,
      })),
      markers: [],
      renderPackage,
    },
  };
}
