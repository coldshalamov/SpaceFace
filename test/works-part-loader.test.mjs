// PQ-131.00 — works-context loader seam.
//
// Headless: a mock WebGL2 context + a real THREE.WebGLRenderer, the same pattern as
// test/render-package-pilots.test.mjs. Proves loadWorksPart returns a LOD-aware group with
// named hooks, LOD0 at work / LOD1 at site, colour space matching the main loader
// (sRGB colour, linear ORM/normals), and dispose returns renderer.info geometries/textures
// to the pre-load baseline.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as THREE from 'three';

import {
  CARGO_PORT_HOOKS,
  createWorksPartLoader,
  resolveWorksConduitPiece,
  WORKS_PARTS,
} from '../src/ui/asteroid/worksPartLoader.js';

const FIXTURE_ID = 'works_loader_fixture';
const FIXTURE_URL = 'assets/ships/release/parts/places/place_drill_platform.glb';

test('conduit registry names every released family and fitting', () => {
  for (const family of ['power', 'lane']) {
    for (const kind of ['straight', 'corner', 't', 'cross', 'end', 'junction']) {
      const assetId = `place_works_conduit_${family}_${kind}`;
      const row = WORKS_PARTS[assetId];
      assert.ok(row, assetId);
      assert.equal(row.lod0, `assets/ships/release/parts/works/${assetId}.glb`);
      assert.deepEqual(row.hooks, [family === 'power' ? 'powered' : 'flow_mesh']);
    }
  }
});

test('cargo registry names the released port, dynamic hooks and site LOD2 contract', () => {
  assert.equal(
    WORKS_PARTS.cargo_port.lod0,
    'assets/ships/release/parts/works/place_works_cargo_port.glb',
  );
  assert.deepEqual(WORKS_PARTS.cargo_port.hooks, CARGO_PORT_HOOKS);
  assert.equal(WORKS_PARTS.cargo_port.siteNodeLod, 'lod2');
});

test('every nonzero N/E/S/W mask selects exact canonical ports and rotation', () => {
  const expected = new Map([
    [1, ['end', Math.PI / 2]], [2, ['end', 0]], [4, ['end', -Math.PI / 2]], [8, ['end', Math.PI]],
    [5, ['straight', Math.PI / 2]], [10, ['straight', 0]],
    [3, ['corner', 0]], [6, ['corner', -Math.PI / 2]], [12, ['corner', Math.PI]], [9, ['corner', Math.PI / 2]],
    [11, ['t', 0]], [7, ['t', -Math.PI / 2]], [14, ['t', Math.PI]], [13, ['t', Math.PI / 2]],
    [15, ['cross', 0]],
  ]);
  for (const family of ['power', 'lane']) {
    assert.equal(resolveWorksConduitPiece(family, 0), null);
    for (const [mask, [kind, rotation]] of expected) {
      const row = resolveWorksConduitPiece(family, mask);
      assert.equal(row.kind, kind, `${family} mask ${mask}`);
      assert.equal(row.rotation, rotation, `${family} mask ${mask}`);
      assert.equal(row.assetId, `place_works_conduit_${family}_${kind}`);
    }
    assert.equal(resolveWorksConduitPiece(family, 15, { service: true }).kind, 'junction');
  }
  assert.throws(() => resolveWorksConduitPiece('gas', 2), /unknown conduit family/);
  assert.throws(() => resolveWorksConduitPiece('lane', 16), /integer 0\.\.15/);
});

function createEventCanvas() {
  const listeners = new Map();
  return {
    width: 8,
    height: 8,
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

function createMockRenderer() {
  const canvas = createEventCanvas();
  const context = createDeterministicWebGl2Context(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, context });
  renderer.setSize(8, 8, false);
  return renderer;
}

function snapshotInfo(renderer) {
  return {
    geometries: renderer.info.memory.geometries,
    textures: renderer.info.memory.textures,
  };
}

function makeTexture(colorSpace) {
  const texture = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1);
  texture.colorSpace = colorSpace;
  texture.needsUpdate = true;
  return texture;
}

// Residency replaces BufferGeometry/Texture.dispose with a no-op until its own refcount hits
// zero. The real lease.release() only drops that owner — it does not fire three.js's dispose
// event. renderer.info only decrements when the original disposer runs, and only for geometries
// that were actually drawn (WebGLGeometries.get on first render). A mock that calls
// geometry.dispose() itself, or that never renders, cannot see the live-mine leak.
function installResidencyShield(resource) {
  if (!resource || typeof resource.dispose !== 'function') return resource;
  if (resource.userData && resource.userData.worksTestShielded) return resource;
  resource.userData = { ...(resource.userData || {}), worksTestShielded: true };
  resource.dispose = function protectedDispose() {};
  return resource;
}

function makeBlueprint() {
  const map = makeTexture(THREE.SRGBColorSpace);
  const normal = makeTexture(THREE.NoColorSpace);
  const orm = makeTexture(THREE.NoColorSpace);
  const material = new THREE.MeshStandardMaterial({
    map,
    normalMap: normal,
    aoMap: orm,
  });
  const lod0 = new THREE.BoxGeometry(1, 1, 1);
  const lod1 = new THREE.BoxGeometry(0.7, 0.7, 0.7);
  installResidencyShield(lod0);
  installResidencyShield(lod1);
  installResidencyShield(map);
  installResidencyShield(normal);
  installResidencyShield(orm);
  installResidencyShield(material);
  const identity = new THREE.Matrix4();
  return {
    assetId: FIXTURE_ID,
    primitives: [
      {
        name: 'LOD0_Body',
        geometry: lod0,
        material,
        matrix: identity.clone(),
        tags: { lod: 'lod0' },
      },
      {
        name: 'LOD1_Body',
        geometry: lod1,
        material,
        matrix: identity.clone(),
        tags: { lod: 'lod1' },
      },
    ],
    markers: [
      { name: 'boom_pivot', matrix: identity.clone() },
      { name: 'lamp_socket', matrix: identity.clone() },
    ],
    resources: { lod0, lod1, map, normal, orm, material },
  };
}

function makeCargoBlueprint() {
  const material = new THREE.MeshStandardMaterial();
  const identity = new THREE.Matrix4();
  const at = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
  const primitives = [];
  const resources = { material };
  for (const lod of [0, 1, 2]) {
    for (const stem of ['Body', 'pod', 'pod_thruster', 'crate_0']) {
      const geometry = new THREE.BoxGeometry(1, 1, 1);
      installResidencyShield(geometry);
      resources[`lod${lod}${stem}`] = geometry;
      primitives.push({
        name: `LOD${lod}_${stem}`,
        geometry,
        material,
        matrix: identity.clone(),
        tags: { lod: `lod${lod}` },
      });
    }
  }
  installResidencyShield(material);
  return {
    assetId: 'place_works_cargo_port',
    primitives,
    markers: [
      { name: 'crate_0', matrix: at(-0.4, 0, 0) },
      { name: 'crate_1', matrix: at(-0.2, 0, 0) },
      { name: 'crate_2', matrix: identity.clone() },
      { name: 'crate_3', matrix: at(0.2, 0, 0) },
      { name: 'crate_4', matrix: at(0.4, 0, 0) },
      { name: 'cradle', matrix: identity.clone() },
      { name: 'pod_root', matrix: at(0, 0.1, 0) },
      { name: 'pod_thruster', matrix: at(0, 0.1, -0.2) },
    ],
    resources,
  };
}

function meshVisibility(group) {
  const rows = {};
  group.traverse((obj) => {
    if (obj.isMesh) rows[obj.name] = obj.visible;
  });
  return rows;
}

function inspectColourSpace(group) {
  const rows = [];
  group.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    const mat = obj.material;
    rows.push({
      name: obj.name,
      map: mat.map ? mat.map.colorSpace : null,
      normal: mat.normalMap ? mat.normalMap.colorSpace : null,
      orm: mat.aoMap ? mat.aoMap.colorSpace : null,
    });
  });
  return rows;
}

test('worksPartLoader uses the shared authored lease and never spins its own KTX2 stack', () => {
  const src = readFileSync(new URL('../src/ui/asteroid/worksPartLoader.js', import.meta.url), 'utf8');
  assert.match(src, /createAuthoredAssetLease/);
  assert.match(src, /disposeAuthoredAssetRuntime/);
  assert.doesNotMatch(src, /new\s+KTX2Loader/);
  assert.doesNotMatch(src, /setTranscoderPath/);
  assert.doesNotMatch(src, /meshopt_decoder/);
  assert.equal(
    WORKS_PARTS.drill_platform.lod0,
    'assets/ships/release/parts/places/place_drill_platform.glb',
  );
});

test('createWorksPartLoader requires a renderer', () => {
  assert.throws(() => createWorksPartLoader({}), /renderer is required/);
});

test('loadWorksPart returns LOD-aware hooks and dispose restores renderer.info baseline', async () => {
  const renderer = createMockRenderer();
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(31, 1, 0.1, 100);
  camera.position.z = 5;
  scene.add(new THREE.AmbientLight(0xffffff, 1));

  renderer.render(scene, camera);
  const baseline = snapshotInfo(renderer);

  const blueprint = makeBlueprint();
  let released = 0;
  const lease = {
    isActive: () => true,
    async load(url) {
      assert.equal(url, FIXTURE_URL);
      return blueprint;
    },
    release() {
      released += 1;
      // Real lease.release() only drops the residency owner. It must not be the thing that
      // returns renderer.info to baseline — three.js already registered these on first draw.
      return 0;
    },
  };

  const loader = createWorksPartLoader({
    renderer,
    lease,
    registry: {
      [FIXTURE_ID]: Object.freeze({
        lod0: FIXTURE_URL,
        lod1: null,
        slot: 'place',
        hooks: Object.freeze(['boom_pivot', 'lamp_socket']),
      }),
    },
  });

  await assert.rejects(
    () => loader.loadWorksPart('not-a-works-part'),
    /unknown works part id/,
  );

  const group = await loader.loadWorksPart(FIXTURE_ID);
  assert.ok(group, 'loadWorksPart must return a group');
  assert.equal(group.userData.worksPartId, FIXTURE_ID);
  assert.equal(group.userData.worksNodeLod, 'lod0');
  assert.ok(group.userData.worksHooks.boom_pivot, 'named hook boom_pivot');
  assert.ok(group.userData.worksHooks.lamp_socket, 'named hook lamp_socket');
  assert.equal(group.userData.worksHooks.boom_pivot.name, 'boom_pivot');

  const workVis = meshVisibility(group);
  assert.equal(workVis.LOD0_Body, true, 'LOD0 visible at the work register');
  assert.equal(workVis.LOD1_Body, false, 'LOD1 hidden at the work register');

  const colours = inspectColourSpace(group);
  assert.ok(colours.length >= 1);
  for (const row of colours) {
    assert.equal(row.map, THREE.SRGBColorSpace, `${row.name} baseColor must be sRGB`);
    assert.notEqual(row.normal, THREE.SRGBColorSpace, `${row.name} normal must be linear`);
    assert.notEqual(row.orm, THREE.SRGBColorSpace, `${row.name} ORM must be linear`);
  }

  scene.add(group);
  renderer.render(scene, camera);
  const mounted = snapshotInfo(renderer);
  assert.ok(
    mounted.geometries > baseline.geometries,
    `mounted geometries must rise above baseline so dispose is proven to deregister GPU-bound `
      + `geometry, not merely drop an unregistered CPU object `
      + `(baseline=${JSON.stringify(baseline)} mounted=${JSON.stringify(mounted)})`,
  );

  loader.setRegister('site');
  assert.equal(group.userData.worksNodeLod, 'lod1');
  const siteVis = meshVisibility(group);
  assert.equal(siteVis.LOD0_Body, false, 'LOD0 hidden at the site register');
  assert.equal(siteVis.LOD1_Body, true, 'LOD1 visible at the site register');
  renderer.render(scene, camera);

  scene.remove(group);
  await loader.dispose('works-screen-exit');
  assert.equal(released, 1, 'lease.release must run on screen exit');
  const after = snapshotInfo(renderer);
  assert.equal(after.geometries, baseline.geometries, 'geometries must return to baseline');
  assert.equal(after.textures, baseline.textures, 'textures must return to baseline');

  const closed = await loader.loadWorksPart(FIXTURE_ID);
  assert.equal(closed, null, 'load after dispose is a no-op');

  renderer.dispose();
});

test('cargo instances are distinct, preserve pod hierarchy, use site LOD2 and release idempotently', async () => {
  const renderer = createMockRenderer();
  const blueprint = makeCargoBlueprint();
  let loads = 0;
  let leaseReleases = 0;
  const lease = {
    isActive: () => true,
    async load(url) {
      loads += 1;
      assert.equal(url, WORKS_PARTS.cargo_port.lod0);
      return blueprint;
    },
    release() { leaseReleases += 1; },
  };
  const loader = createWorksPartLoader({ renderer, lease });

  const first = await loader.loadWorksPart('cargo_port');
  const second = await loader.loadWorksPart('cargo_port');
  assert.notEqual(first, second, 'installed ports require independent live groups');
  assert.equal(loads, 2, 'cargo must not use the rover standing-instance cache');

  const hooks = first.userData.worksHooks;
  assert.equal(hooks.pod_thruster.parent, hooks.pod_root, 'thruster marker follows pod_root');
  const nodes = {};
  first.traverse((node) => { if (node.name) nodes[node.name] = node; });
  for (const lod of [0, 1, 2]) {
    assert.equal(nodes[`LOD${lod}_pod`].parent, hooks.pod_root, `LOD${lod} pod follows pod_root`);
    assert.equal(
      nodes[`LOD${lod}_pod_thruster`].parent,
      hooks.pod_thruster,
      `LOD${lod} thruster mesh follows nested thruster hook`,
    );
    assert.equal(nodes[`LOD${lod}_crate_0`].parent, hooks.crate_0, `LOD${lod} freight follows crate hook`);
  }

  loader.setRegister('site');
  assert.equal(first.userData.worksNodeLod, 'lod2');
  assert.equal(nodes.LOD0_Body.visible, false);
  assert.equal(nodes.LOD1_Body.visible, false);
  assert.equal(nodes.LOD2_Body.visible, true);

  assert.equal(loader.releaseWorksPart(first), true);
  assert.equal(loader.releaseWorksPart(first), false, 'double release is an idempotent no-op');
  loader.dispose('cargo-test-exit');
  assert.equal(leaseReleases, 1);
  assert.equal(loader.stats().live, 0);
  renderer.dispose();
});
