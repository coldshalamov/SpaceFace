// Authored release-part seam for the Asteroid Works renderer (PQ-131.00).
//
// One loader stack: every fetch goes through createAuthoredAssetLease on the works WebGLRenderer.
// That lease already binds KTX2Loader via detectSupport, shares the Basis transcoder, and admits
// render packages. Do not construct a second KTX2Loader, transcoder path, or meshopt decoder here.
//
// Fail-closed on unknown ids (programmer error). Fail-open on assets: a load failure resolves to
// null and the caller keeps its procedural mesh. Never mutate blueprint materials or geometry.
import * as THREE from 'three';
import {
  createAuthoredAssetLease,
  disposeAuthoredAssetRuntime,
} from '../../render/assetLoader.js';

export const WORKS_PARTS = Object.freeze({
  drill_platform: Object.freeze({
    lod0: 'assets/ships/release/parts/places/place_drill_platform.glb',
    lod1: null,
    slot: 'place',
    hooks: Object.freeze([]),
  }),
});

function selectUrl(entry, register) {
  if (register === 'site') return entry.lod1 || entry.lod0;
  return entry.lod0;
}

function resolveNodeLod(tagsPresent, register) {
  if (register === 'site') {
    for (let i = 0; i < tagsPresent.length; i++) {
      if (tagsPresent[i] === 'lod1') return 'lod1';
    }
  }
  return 'lod0';
}

function applyLodVisibility(group, register) {
  const tags = group.userData.worksLodTags || [];
  const want = resolveNodeLod(tags, register);
  group.userData.worksNodeLod = want;
  group.traverse((obj) => {
    if (!obj.isMesh) return;
    const lod = obj.userData.worksLod;
    if (!lod) {
      obj.visible = true;
      return;
    }
    obj.visible = lod === want;
  });
}

function collectMaterialTextures(material, into) {
  if (!material) return;
  for (const key in material) {
    if (!Object.prototype.hasOwnProperty.call(material, key)) continue;
    const value = material[key];
    if (value && value.isTexture && !value.isRenderTargetTexture) into.add(value);
  }
}

function collectGroupGpuResources(group, into) {
  if (!group) return;
  const recorded = group.userData && group.userData.worksGpuResources;
  if (Array.isArray(recorded)) {
    for (let i = 0; i < recorded.length; i++) if (recorded[i]) into.add(recorded[i]);
  }
  group.traverse((obj) => {
    if (obj.geometry) into.add(obj.geometry);
    const mats = Array.isArray(obj.material) ? obj.material : (obj.material ? [obj.material] : []);
    for (let i = 0; i < mats.length; i++) {
      const mat = mats[i];
      if (!mat) continue;
      into.add(mat);
      collectMaterialTextures(mat, into);
    }
  });
}

// Residency no-ops resource.dispose until its refcount hits zero. Three.js only decrements
// renderer.info from the original disposer, and only after first draw. Call that disposer
// so GPU-registered geometry cannot outlive this loader.
function disposeRendererBoundResource(resource) {
  if (!resource || typeof resource.dispose !== 'function') return;
  const proto = Object.getPrototypeOf(resource);
  const inherited = proto && typeof proto.dispose === 'function' ? proto.dispose : null;
  if (inherited && resource.dispose !== inherited) inherited.call(resource);
  else resource.dispose();
}

function instantiateBlueprint(blueprint, hookNames) {
  const root = new THREE.Group();
  root.name = blueprint.assetId || 'worksPart';
  root.userData.worksClone = true;

  const tagSeen = Object.create(null);
  const tagsPresent = [];
  let untagged = 0;
  const gpuResources = new Set();

  for (const prim of blueprint.primitives) {
    const mesh = new THREE.Mesh(prim.geometry, prim.material);
    mesh.name = prim.name;
    prim.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.worksShared = true;
    const lod = (prim.tags && prim.tags.lod) || null;
    mesh.userData.worksLod = lod;
    if (!lod) untagged += 1;
    else if (!tagSeen[lod]) {
      tagSeen[lod] = true;
      tagsPresent.push(lod);
    }
    if (prim.geometry) gpuResources.add(prim.geometry);
    if (prim.material) gpuResources.add(prim.material);
    collectMaterialTextures(prim.material, gpuResources);
    root.add(mesh);
  }
  tagsPresent.sort();
  root.userData.worksLodTags = tagsPresent;
  root.userData.worksUntaggedMeshes = untagged;
  root.userData.worksGpuResources = [...gpuResources];

  for (const marker of blueprint.markers || []) {
    const node = new THREE.Object3D();
    node.name = marker.name;
    marker.matrix.decompose(node.position, node.quaternion, node.scale);
    root.add(node);
  }

  const found = Object.create(null);
  root.traverse((obj) => {
    if (obj.name && found[obj.name] === undefined) found[obj.name] = obj;
  });
  const worksHooks = {};
  for (let i = 0; i < hookNames.length; i++) {
    const name = hookNames[i];
    worksHooks[name] = found[name] || null;
  }
  root.userData.worksHooks = worksHooks;
  return root;
}

function releaseClone(group) {
  if (!group) return;
  if (group.parent) group.parent.remove(group);
  const stack = [group];
  while (stack.length) {
    const node = stack.pop();
    const children = node.children;
    for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]);
    node.children.length = 0;
  }
}

export function createWorksPartLoader({ renderer, registry, lease: injectedLease } = {}) {
  if (!renderer) throw new Error('[worksPartLoader] renderer is required');
  const table = registry || WORKS_PARTS;
  // Production always binds createAuthoredAssetLease (shared KTX2). injectedLease is the headless proof seam.
  const lease = injectedLease || createAuthoredAssetLease(renderer, {
    ownerId: 'asteroid-works',
    role: 'preview',
  });

  let register = 'work';
  let closed = false;
  let loaded = 0;
  let failed = 0;
  let released = 0;
  let lod1Missing = 0;
  const live = [];

  function stats() {
    let untaggedMeshes = 0;
    for (let i = 0; i < live.length; i++) {
      untaggedMeshes += live[i].userData.worksUntaggedMeshes || 0;
    }
    return {
      loaded,
      failed,
      released,
      register,
      lod1Missing,
      untaggedMeshes,
    };
  }

  function setRegister(next) {
    if (next !== 'work' && next !== 'site') {
      throw new Error(`[worksPartLoader] register must be 'work' or 'site', got ${next}`);
    }
    register = next;
    for (let i = 0; i < live.length; i++) applyLodVisibility(live[i], register);
  }

  function releaseWorksPart(group) {
    if (!group) return;
    const idx = live.indexOf(group);
    if (idx >= 0) live.splice(idx, 1);
    releaseClone(group);
    released += 1;
  }

  async function loadWorksPart(id, options = {}, attempt = 0) {
    if (closed || !lease.isActive()) return null;
    const entry = table[id];
    if (!entry) throw new Error(`[worksPartLoader] unknown works part id "${id}"`);

    const requestedRegister = register;
    const url = selectUrl(entry, requestedRegister);

    let blueprint = null;
    try {
      blueprint = await lease.load(url, {
        slot: entry.slot || 'place',
        optional: true,
        ...(options || {}),
      });
    } catch {
      failed += 1;
      return null;
    }
    if (!lease.isActive() || closed) return null;
    if (!blueprint || !Array.isArray(blueprint.primitives)) {
      failed += 1;
      return null;
    }

    if (register !== requestedRegister) {
      if (attempt >= 1) return null;
      return loadWorksPart(id, options, attempt + 1);
    }

    const hookNames = (entry.hooks || []).slice();
    if (blueprint.assetId && hookNames.indexOf(blueprint.assetId) < 0) {
      hookNames.push(blueprint.assetId);
    }
    const group = instantiateBlueprint(blueprint, hookNames);
    applyLodVisibility(group, requestedRegister);
    group.userData.worksPartId = id;
    group.userData.worksUrl = url;
    group.userData.worksRequestedRegister = requestedRegister;
    live.push(group);
    loaded += 1;
    const tags = group.userData.worksLodTags || [];
    let hasLod1 = false;
    for (let i = 0; i < tags.length; i++) {
      if (tags[i] === 'lod1') { hasLod1 = true; break; }
    }
    if (!hasLod1) lod1Missing += 1;
    return group;
  }

  function dispose(reason = 'works-screen-exit') {
    if (closed) return 0;
    closed = true;
    const gpu = new Set();
    for (let i = 0; i < live.length; i++) collectGroupGpuResources(live[i], gpu);
    while (live.length) releaseWorksPart(live[live.length - 1]);
    lease.release(reason);
    for (const resource of gpu) disposeRendererBoundResource(resource);
    return disposeAuthoredAssetRuntime(renderer);
  }

  return Object.freeze({
    loadWorksPart,
    releaseWorksPart,
    setRegister,
    stats,
    dispose,
  });
}
