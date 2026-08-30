// PQ-131.01 — authored rover wire.
//
// WHY THIS FILE WAS REWRITTEN. The first version of this file was green while both P0 defects
// were live. It asserted that `asteroidRenderer3d.js` CONTAINED the strings `loadWorksPart('rover')`
// and `bindAuthoredRover` — which says nothing about how many times the swap runs — and it drove
// the loader with three invented THREE.BoxGeometry primitives named `LOD*_Merged_Material_Livery`
// plus a hand-written marker per hook. Fake boxes always have whatever hierarchy the fake builds,
// so the test could not see that the release artifact carries NO named cutter mesh at all, and
// source-matching could not see that the rover was being loaded twice per screen session.
//
// So: everything below runs against the real generated artifacts and the real seams.
//   - the release GLB's own node graph proves the cutter exists and hangs beneath `bit_tip`;
//   - the loader is driven by a blueprint decoded from the real part GLB, not from boxes;
//   - the standing-load and single-flight lifecycles are exercised, not described.
//
// Pure per test/AGENTS.md: no DOM, no WebGL, no wall clock. Pixels are still a probe's job.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as THREE from 'three';

import {
  createRoverControlScaffold,
  createSingleFlightMount,
  isolateWorksMeshMaterials,
  validateAuthoredRoverCutters,
  validateAuthoredRoverHooks,
} from '../src/ui/asteroid/asteroidRenderer3d.js';
import {
  createWorksPartLoader,
  recordWorksInstanceResources,
  CUTTER_SOCKET,
  CUTTER_STEM,
  ROVER_HOOKS,
  WORKS_PARTS,
} from '../src/ui/asteroid/worksPartLoader.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SOURCE_GLB = resolve(ROOT, 'assets/ships/parts/works/place_works_rover.glb');
const RELEASE_GLB = resolve(ROOT, 'assets/ships/release/parts/works/place_works_rover.glb');
const PREVIEW_SOURCE = resolve(ROOT, 'src/render/asteroidInteriorPreview.js');
const RENDERER_SOURCE = resolve(ROOT, 'src/ui/asteroid/asteroidRenderer3d.js');
const CUTTER_NAMES = ['LOD0_Bit', 'LOD1_Bit', 'LOD2_Bit'];

test('the pending Rover control scaffold cannot render a procedural stand-in', () => {
  const scaffold = createRoverControlScaffold();
  let meshes = 0;
  scaffold.group.traverse((obj) => { if (obj.isMesh) meshes += 1; });
  assert.equal(scaffold.pending, true);
  assert.equal(scaffold.authored, false);
  assert.equal(meshes, 0, 'the async-load scaffold owns transforms only');
  assert.equal(scaffold.dyn.hopperStages.length, 0);
  assert.equal(scaffold.dyn.wheels.length, 0);
});

test('the retired procedural Rover builder is absent from the live render path', () => {
  assert.doesNotMatch(readFileSync(PREVIEW_SOURCE, 'utf8'), /\bmakeRover\b/);
  assert.doesNotMatch(readFileSync(RENDERER_SOURCE, 'utf8'), /\bmakeRover\b/);
});

test('an authored Rover with a missing runtime hook fails closed', () => {
  const hooks = Object.fromEntries(ROVER_HOOKS.map((name) => [name, new THREE.Object3D()]));
  assert.equal(validateAuthoredRoverHooks(hooks), hooks);
  delete hooks.bit_tip;
  assert.throws(
    () => validateAuthoredRoverHooks(hooks),
    /authored Rover is missing bit_tip/,
  );
});

test('an authored Rover missing any register cutter fails closed', () => {
  const cutters = CUTTER_NAMES.map((name) => Object.assign(new THREE.Object3D(), { name }));
  assert.equal(validateAuthoredRoverCutters(cutters), cutters);
  assert.throws(
    () => validateAuthoredRoverCutters(cutters.slice(0, 2)),
    /authored Rover is missing LOD2_Bit/,
  );
});

// ------------------------------------------------------------------ GLB reading

const COMPONENT_BYTES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const COMPONENT_COUNT = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

function readGlb(abs) {
  const buf = readFileSync(abs);
  assert.equal(buf.readUInt32LE(0), 0x46546c67, `GLB magic at ${abs}`);
  const jsonLength = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLength).toString('utf8'));
  let cursor = 20 + jsonLength;
  let bin = null;
  while (cursor + 8 <= buf.length) {
    const chunkLength = buf.readUInt32LE(cursor);
    const chunkType = buf.readUInt32LE(cursor + 4);
    if (chunkType === 0x004e4942) bin = buf.subarray(cursor + 8, cursor + 8 + chunkLength);
    cursor += 8 + chunkLength;
  }
  return { json, bin };
}

function readAccessor(json, bin, index) {
  const accessor = json.accessors[index];
  assert.ok(accessor, `accessor ${index} exists`);
  assert.equal(accessor.sparse, undefined, 'sparse accessors are not used by this asset');
  const view = json.bufferViews[accessor.bufferView];
  assert.ok(!view.extensions, 'this reader only decodes uncompressed buffer views');
  const base = (view.byteOffset || 0) + (accessor.byteOffset || 0);
  const components = COMPONENT_COUNT[accessor.type];
  const bytes = COMPONENT_BYTES[accessor.componentType];
  const stride = view.byteStride || components * bytes;
  const out = new Float64Array(accessor.count * components);
  for (let i = 0; i < accessor.count; i++) {
    for (let c = 0; c < components; c++) {
      const at = base + i * stride + c * bytes;
      if (accessor.componentType === 5126) out[i * components + c] = bin.readFloatLE(at);
      else if (accessor.componentType === 5125) out[i * components + c] = bin.readUInt32LE(at);
      else if (accessor.componentType === 5123) out[i * components + c] = bin.readUInt16LE(at);
      else out[i * components + c] = bin.readUInt8(at);
    }
  }
  return out;
}

/** name -> { index, node, parent, world:Matrix4 } for every node in scene 0. */
function nodeTable(json) {
  const nodes = json.nodes || [];
  const parentOf = new Map();
  nodes.forEach((node, index) => {
    for (const child of node.children || []) parentOf.set(child, index);
  });
  const table = new Map();
  const roots = json.scenes[json.scene || 0].nodes || [];
  const stack = roots.map((index) => [index, new THREE.Matrix4()]);
  while (stack.length) {
    const [index, parentWorld] = stack.pop();
    const node = nodes[index];
    const local = new THREE.Matrix4();
    if (node.matrix) local.fromArray(node.matrix);
    else {
      local.compose(
        new THREE.Vector3().fromArray(node.translation || [0, 0, 0]),
        new THREE.Quaternion().fromArray(node.rotation || [0, 0, 0, 1]),
        new THREE.Vector3().fromArray(node.scale || [1, 1, 1]),
      );
    }
    const world = new THREE.Matrix4().multiplyMatrices(parentWorld, local);
    table.set(node.name, {
      index,
      node,
      parent: parentOf.has(index) ? nodes[parentOf.get(index)].name : null,
      world,
    });
    for (const child of node.children || []) stack.push([child, world]);
  }
  return table;
}

function ancestry(table, name) {
  const chain = [];
  let cursor = name;
  while (cursor) {
    chain.push(cursor);
    cursor = table.get(cursor)?.parent ?? null;
  }
  return chain;
}

function triangleCount(json, node) {
  let total = 0;
  for (const primitive of json.meshes[node.mesh].primitives) {
    const count = primitive.indices != null
      ? json.accessors[primitive.indices].count
      : json.accessors[primitive.attributes.POSITION].count;
    total += count / 3;
  }
  return total;
}

function worldTranslation(entry) {
  return new THREE.Vector3().setFromMatrixPosition(entry.world);
}

/** World-space bounds of one uncompressed mesh node. */
function worldBounds(json, bin, entry) {
  const box = new THREE.Box3();
  const point = new THREE.Vector3();
  for (const primitive of json.meshes[entry.node.mesh].primitives) {
    const positions = readAccessor(json, bin, primitive.attributes.POSITION);
    for (let i = 0; i < positions.length; i += 3) {
      point.set(positions[i], positions[i + 1], positions[i + 2]).applyMatrix4(entry.world);
      box.expandByPoint(point);
    }
  }
  return box;
}

// ------------------------------------------------------------------ the artifacts

assert.ok(
  existsSync(SOURCE_GLB),
  `the combined works rover part is missing at ${SOURCE_GLB}; run `
  + 'blender --background --python tools/blender/build_works_rover.py -- --combine-only',
);
// No fallback to the source artifact. The runtime loads RELEASE, and a check that quietly
// retargets to a convenient stand-in is how corrupt release assets survived here before.
assert.ok(
  existsSync(RELEASE_GLB),
  `the works rover RELEASE part is missing at ${RELEASE_GLB}; run `
  + 'node scripts/build-place-release-assets.mjs --ids place_works_rover',
);

const source = readGlb(SOURCE_GLB);
const release = readGlb(RELEASE_GLB);
const sourceNodes = nodeTable(source.json);
const releaseNodes = nodeTable(release.json);

// ------------------------------------------------------------------ registration

test('WORKS_PARTS.rover resolves to the works release part and lists every runtime hook', () => {
  assert.ok(WORKS_PARTS.rover, 'rover id must be registered');
  assert.equal(
    WORKS_PARTS.rover.lod0,
    'assets/ships/release/parts/works/place_works_rover.glb',
  );
  assert.equal(WORKS_PARTS.rover.slot, 'place');
  assert.deepEqual([...WORKS_PARTS.rover.hooks], [...ROVER_HOOKS]);
  assert.equal(ROVER_HOOKS.length, 13);
  assert.ok(ROVER_HOOKS.includes(CUTTER_SOCKET), 'bit_tip is one of the runtime hooks');
});

// ------------------------------------------------------------------ the release artifact

test('the RELEASE part carries a named cutter mesh per LOD beneath bit_tip', () => {
  const extras = release.json.asset?.extras?.spacefaceAsset || {};
  assert.equal(extras.assetId, 'place_works_rover');
  assert.equal(extras.slot, 'place');
  assert.equal(extras.cutterSocket, CUTTER_SOCKET, 'the contract must name the cutter socket');
  assert.deepEqual(
    [...(extras.cutterMeshes || [])].sort(), [...CUTTER_NAMES].sort(),
    'the contract must name one cutter mesh per LOD',
  );

  const socket = releaseNodes.get(CUTTER_SOCKET);
  assert.ok(socket, `${CUTTER_SOCKET} must be a node in the release part`);
  assert.equal(socket.node.mesh, undefined, `${CUTTER_SOCKET} must stay an empty transform marker`);
  assert.equal(
    socket.node.extras?.spacefaceSocket, true,
    `${CUTTER_SOCKET} must keep its socket marker so the loader admits it as a hook`,
  );
  assert.deepEqual(
    ancestry(releaseNodes, CUTTER_SOCKET),
    [CUTTER_SOCKET, 'boom_pivot', 'place_works_rover'],
    'the cutter socket hangs off the boom, so the boom swing carries the cutter',
  );

  for (const name of CUTTER_NAMES) {
    const entry = releaseNodes.get(name);
    assert.ok(entry, `${name} must survive the release build (meshopt + quantization + KTX2)`);
    assert.notEqual(entry.node.mesh, undefined, `${name} must be a real mesh, not a marker`);
    assert.equal(
      entry.parent, CUTTER_SOCKET,
      `${name} must be parented to ${CUTTER_SOCKET}; parented to the arm it can never turn`,
    );
    assert.ok(triangleCount(release.json, entry.node) > 0, `${name} must carry geometry`);
  }
});

test('the release cutter sits on the cutter axis, so spinning it turns the tool in place', () => {
  // Ground truth comes from the uncompressed source part, which this reader can decode; the
  // release build re-centres each mesh under KHR_mesh_quantization, so the release node origin is
  // asserted against that measured axis rather than against a copied number.
  const sourceCutter = sourceNodes.get('LOD0_Bit');
  assert.ok(sourceCutter, 'LOD0_Bit must exist in the combined source part');
  const bounds = worldBounds(source.json, source.bin, sourceCutter);
  const size = new THREE.Vector3();
  bounds.getSize(size);
  const centre = new THREE.Vector3();
  bounds.getCenter(centre);

  assert.ok(
    size.x > size.y * 1.5 && size.x > size.z * 1.5,
    `the cutter's long axis must be +X (measured ${size.x.toFixed(3)} x ${size.y.toFixed(3)} `
    + `x ${size.z.toFixed(3)}); the runtime spins it about local X`,
  );

  const sourceOrigin = worldTranslation(sourceCutter);
  assert.ok(
    Math.hypot(sourceOrigin.y - centre.y, sourceOrigin.z - centre.z) < 2e-3,
    `the authored cutter origin ${sourceOrigin.toArray()} must lie on its own axis; an origin off `
    + 'the axis makes the spin an orbit',
  );

  for (const name of CUTTER_NAMES) {
    const origin = worldTranslation(releaseNodes.get(name));
    assert.ok(
      Math.hypot(origin.y - centre.y, origin.z - centre.z) < 2e-3,
      `${name} left the cutter axis in the release build (${origin.toArray()})`,
    );
    assert.ok(
      origin.x >= bounds.min.x - 1e-2 && origin.x <= bounds.max.x + 1e-2,
      `${name} origin ${origin.x} is outside the cutter's own axial span`,
    );
  }
});

test('the release build preserved every cutter triangle and every semantic hook', () => {
  for (const name of CUTTER_NAMES) {
    assert.equal(
      triangleCount(release.json, releaseNodes.get(name).node),
      triangleCount(source.json, sourceNodes.get(name).node),
      `${name} triangle count drifted between the source part and the release part`,
    );
  }
  for (const hook of ROVER_HOOKS) {
    assert.ok(releaseNodes.has(hook), `hook ${hook} must be a node in the release part`);
  }
  for (const lod of ['LOD0_', 'LOD1_', 'LOD2_']) {
    assert.ok(
      [...releaseNodes.keys()].some((name) => name.startsWith(lod)),
      `${lod}* meshes must survive; assetLoader tags LOD by node-name prefix`,
    );
  }
});

// ------------------------------------------------------------------ the loader, on the real part

/**
 * The blueprint shape createAuthoredAssetLease hands back: primitives and markers flattened to
 * world matrices. Built here from the REAL combined part so the loader is exercised against the
 * artifact's own node names, transforms and LOD tags.
 */
function blueprintFromPart() {
  const { json, bin } = source;
  const materials = new Map();
  const primitives = [];
  const markers = [];
  const owned = [];
  for (const [name, entry] of sourceNodes) {
    if (name === 'COLLISION_HULL') continue;
    const lod = entry.node.extras?.spacefaceLod || entry.node.extras?.spaceface?.lod || null;
    if (entry.node.mesh == null) {
      if (entry.node.extras?.spacefaceSocket !== true) continue;
      markers.push({ name, matrix: entry.world.clone(), tags: { socket: true } });
      continue;
    }
    const primitive = json.meshes[entry.node.mesh].primitives[0];
    const positions = readAccessor(json, bin, primitive.attributes.POSITION);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(positions), 3));
    owned.push(geometry);
    let material = materials.get(primitive.material);
    if (!material) {
      material = new THREE.MeshStandardMaterial({ name: json.materials[primitive.material].name });
      materials.set(primitive.material, material);
      owned.push(material);
    }
    primitives.push({ name, geometry, material, matrix: entry.world.clone(), tags: { lod } });
  }
  return { assetId: 'place_works_rover', primitives, markers, owned };
}

function createMockRenderer() {
  return {
    domElement: { width: 8, height: 8, style: {}, addEventListener() {}, removeEventListener() {}, setAttribute() {} },
    info: { memory: { geometries: 0, textures: 0 }, render: { triangles: 0, calls: 0 }, programs: [] },
    capabilities: { isWebGL2: true },
    getContext() { return {}; },
    render() {},
    dispose() {},
  };
}

/** A lease that resolves the real blueprint, counts its loads, and can be held open. */
function createCountingLease(blueprint, { gate = null } = {}) {
  const lease = {
    loads: [],
    isActive: () => true,
    async load(url) {
      lease.loads.push(url);
      if (gate) await gate;
      return blueprint;
    },
    release() { return 0; },
  };
  return lease;
}

test('loadWorksPart binds every hook and parents the cutter to bit_tip, keeping its world pose', async () => {
  const blueprint = blueprintFromPart();
  const renderer = createMockRenderer();
  const lease = createCountingLease(blueprint);
  const loader = createWorksPartLoader({ renderer, lease });

  const group = await loader.loadWorksPart('rover');
  assert.ok(group, 'the rover must resolve from the real part blueprint');
  assert.deepEqual(lease.loads, [WORKS_PARTS.rover.lod0]);
  assert.equal(group.userData.worksPartId, 'rover');

  const hooks = group.userData.worksHooks;
  for (const hook of ROVER_HOOKS) {
    assert.ok(hooks[hook], `hook ${hook} must resolve to a node`);
    assert.equal(hooks[hook].name, hook);
  }
  assert.equal(
    hooks[CUTTER_SOCKET].parent, hooks.boom_pivot,
    'bit_tip must hang off boom_pivot so the arm carries the cutter',
  );

  const cutters = group.userData.worksCutterMeshes || [];
  assert.equal(cutters.length, CUTTER_NAMES.length, 'one bound cutter mesh per LOD');
  for (const mesh of cutters) {
    assert.equal(CUTTER_STEM, mesh.name.replace(/^LOD[012]_/, ''));
    assert.equal(
      mesh.parent, hooks[CUTTER_SOCKET],
      `${mesh.name} must be parented to ${CUTTER_SOCKET}, not to the boom`,
    );
    const authored = new THREE.Vector3().setFromMatrixPosition(
      sourceNodes.get(mesh.name).world,
    );
    const bound = mesh.getWorldPosition(new THREE.Vector3());
    assert.ok(
      bound.distanceTo(authored) < 1e-4,
      `${mesh.name} moved during hierarchy binding: authored ${authored.toArray()} `
      + `vs bound ${bound.toArray()}`,
    );
  }

  const tags = group.userData.worksLodTags || [];
  for (const tag of ['lod0', 'lod1', 'lod2']) assert.ok(tags.includes(tag), `${tag} tag`);

  const visible = () => {
    const seen = {};
    group.traverse((obj) => { if (obj.isMesh) seen[obj.name] = obj.visible; });
    return seen;
  };
  const atWork = visible();
  assert.equal(atWork.LOD0_Bit, true, 'the work register draws the LOD0 cutter');
  assert.equal(atWork.LOD1_Bit, false);
  loader.setRegister('site');
  const atSite = visible();
  assert.equal(atSite.LOD0_Bit, false);
  assert.equal(atSite.LOD1_Bit, true, 'the site register draws the LOD1 cutter');

  await loader.dispose('test');
});

// ------------------------------------------------------------------ one standing load

test('a screen session holds exactly one standing rover, however many callers arm it', async () => {
  const blueprint = blueprintFromPart();
  const renderer = createMockRenderer();
  let openGate = null;
  const gate = new Promise((res) => { openGate = res; });
  const lease = createCountingLease(blueprint, { gate });
  const loader = createWorksPartLoader({ renderer, lease });

  // The exact race the .00 receipt caught: renderer setup arms the swap, begin() arms it again,
  // and the first load has not resolved yet.
  const fromSetup = loader.loadStandingPart('rover');
  const fromBegin = loader.loadStandingPart('rover');
  assert.equal(lease.loads.length, 1, 'the second caller must join the load already in flight');

  openGate();
  const [a, b] = await Promise.all([fromSetup, fromBegin]);
  assert.ok(a, 'the standing load resolves a group');
  assert.equal(a, b, 'both callers receive the same standing group');

  const later = await loader.loadStandingPart('rover');
  assert.equal(later, a, 'a caller arriving after the load settled reuses the standing group');
  assert.equal(lease.loads.length, 1, 'a settled standing load must never take a second lease');

  const stats = loader.stats();
  assert.equal(stats.loaded, 1, 'exactly one works load for one screen session');
  assert.equal(stats.released, 0);
  assert.equal(stats.failed, 0);
  assert.equal(stats.standing, 1);

  loader.releaseWorksPart(a);
  loader.releaseWorksPart(a);
  const afterRelease = loader.stats();
  assert.equal(afterRelease.released, 1, 'retiring the same rover twice is idempotent');
  assert.equal(afterRelease.standing, 0, 'a released group must not stay standing');
  assert.equal(a.parent, null, 'a released group is detached from the scene');

  const rearmed = await loader.loadStandingPart('rover');
  assert.notEqual(rearmed, a, 'after a release the next arm is a real load');
  assert.equal(lease.loads.length, 2);
  assert.equal(loader.stats().loaded, 2);

  await loader.dispose('test');
});

test('instance clones are retired by releaseWorksPart; blueprint resources are not', async () => {
  const blueprint = blueprintFromPart();
  const renderer = createMockRenderer();
  const loader = createWorksPartLoader({ renderer, lease: createCountingLease(blueprint) });
  const group = await loader.loadStandingPart('rover');

  // What bindAuthoredRover does: clone the shared atlas material so cutter heat and tread scroll
  // belong to this instance alone.
  const shared = group.userData.worksCutterMeshes[0].material;
  const clone = shared.clone();
  let cloneDisposed = 0;
  clone.addEventListener('dispose', () => { cloneDisposed += 1; });
  let sharedDisposed = 0;
  shared.addEventListener('dispose', () => { sharedDisposed += 1; });
  recordWorksInstanceResources(group, [clone]);

  loader.releaseWorksPart(group);
  assert.equal(cloneDisposed, 1, 'the per-instance clone dies with the group that made it');
  assert.equal(
    sharedDisposed, 0,
    'the blueprint material is the lease\'s to retire, not this instance\'s',
  );

  await loader.dispose('test');
});

test('real rover lamp preparation isolates every LOD from the shared hull atlas', async () => {
  const blueprint = blueprintFromPart();
  const renderer = createMockRenderer();
  const loader = createWorksPartLoader({ renderer, lease: createCountingLease(blueprint) });
  const group = await loader.loadStandingPart('rover');
  const lamps = [];
  const hull = [];
  group.traverse((obj) => {
    if (!obj.isMesh) return;
    if (/Lamp/.test(obj.name) && !/Boom/.test(obj.name)) lamps.push(obj);
    else if (/Livery|Steel|Glass/.test(obj.name)) hull.push(obj);
  });
  assert.equal(lamps.length, 3, 'the real combined part carries one merged lamp mesh per LOD');
  assert.ok(hull.length > 0, 'the real combined part exposes non-lamp atlas consumers');

  const sharedAtlas = lamps[0].material;
  assert.ok(hull.some((mesh) => mesh.material === sharedAtlas), 'precondition: lamp and hull share the atlas');
  const instanceOwned = [];
  const isolated = isolateWorksMeshMaterials(lamps, instanceOwned);
  assert.equal(isolated.length, lamps.length);
  assert.equal(instanceOwned.length, lamps.length);
  assert.ok(lamps.every((mesh) => mesh.material !== sharedAtlas), 'every LOD lamp gets an instance clone');
  assert.ok(hull.some((mesh) => mesh.material === sharedAtlas), 'hull remains on the blueprint atlas');

  for (const material of isolated) material.emissiveIntensity = 0.55;
  assert.equal(sharedAtlas.emissiveIntensity, 1, 'lamp power never mutates the shared hull atlas');
  recordWorksInstanceResources(group, instanceOwned);
  loader.releaseWorksPart(group);
  loader.releaseWorksPart(group);
  assert.equal(loader.stats().released, 1, 'double release remains one retirement after material preparation');

  await loader.dispose('test');
});

test('a failed authored load reports a named diagnostic and returns no substitute', async () => {
  const renderer = createMockRenderer();
  const lease = {
    isActive: () => true,
    async load() { throw new Error('release part 404'); },
    release() { return 0; },
  };
  const loader = createWorksPartLoader({ renderer, lease });
  const errors = [];
  const realError = console.error;
  console.error = (...args) => { errors.push(args); };
  let group;
  try {
    group = await loader.loadStandingPart('rover');
  } finally {
    console.error = realError;
  }

  assert.equal(group, null, 'a load failure resolves null; the renderer must not install a substitute');
  const stats = loader.stats();
  assert.equal(stats.failed, 1);
  assert.equal(stats.standing, 0, 'a failed load must not occupy the standing slot');
  assert.ok(stats.lastError, 'the failure is reported on stats(), not swallowed');
  assert.equal(stats.lastError.id, 'rover');
  assert.equal(stats.lastError.url, WORKS_PARTS.rover.lod0);
  assert.match(stats.lastError.message, /release part 404/);
  assert.equal(errors.length, 1, 'and it is loud on the console exactly once');

  await loader.dispose('test');
});

// ------------------------------------------------------------------ the renderer's mount latch

test('the renderer mount latch runs once while in flight and once after it stands', async () => {
  let runs = 0;
  let openGate = null;
  const gate = new Promise((res) => { openGate = res; });
  const mount = createSingleFlightMount(async () => {
    runs += 1;
    await gate;
    return { standing: true };
  });

  const fromSetup = mount.invoke();
  const fromBegin = mount.invoke();
  assert.equal(runs, 1, 'a second arm while the first is in flight must not start a second mount');
  openGate();
  const [a, b] = await Promise.all([fromSetup, fromBegin]);
  assert.equal(a, b, 'both arms observe the same mount');

  await mount.invoke();
  assert.equal(runs, 1, 'once the swap stands, later arms are a no-op');
  assert.equal(mount.armed, true);

  mount.reset();
  assert.equal(mount.armed, false, 'teardown retires the latch');
});

test('the mount latch re-arms after a miss and after a throw', async () => {
  let runs = 0;
  let result = null;
  const mount = createSingleFlightMount(async () => {
    runs += 1;
    if (result instanceof Error) throw result;
    return result;
  });

  assert.equal(await mount.invoke(), null);
  assert.equal(runs, 1);
  assert.equal(mount.armed, false, 'a miss must not latch; begin() has to be able to retry');

  result = new Error('lease died');
  await assert.rejects(() => mount.invoke(), /lease died/);
  assert.equal(runs, 2);
  assert.equal(mount.armed, false, 'a throw must not latch either');

  result = { standing: true };
  assert.deepEqual(await mount.invoke(), { standing: true });
  assert.equal(runs, 3);
  assert.equal(mount.armed, true, 'a swap that stood is latched');

  await mount.invoke();
  assert.equal(runs, 3);
});
