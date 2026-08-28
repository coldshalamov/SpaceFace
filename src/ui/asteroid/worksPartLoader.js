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

// The authored cutter. `build_works_rover.py` exports one LOD<n>_Bit mesh per LOD and parents it
// under bit_tip; the blueprint arrives flattened, so the hierarchy is rebuilt here by name.
export const CUTTER_STEM = 'Bit';
export const CUTTER_SOCKET = 'bit_tip';

export const ROVER_HOOKS = Object.freeze([
  'boom_pivot',
  'bit_tip',
  'hopper_fill_0',
  'hopper_fill_1',
  'hopper_fill_2',
  'hopper_fill_3',
  'hopper_fill_4',
  'hopper_lid',
  'lamp_socket',
  'vent_stack',
  'track_L',
  'track_R',
  'scar_plate',
]);

export const CARGO_PORT_HOOKS = Object.freeze([
  'crate_0',
  'crate_1',
  'crate_2',
  'crate_3',
  'crate_4',
  'cradle',
  'pod_root',
  'pod_thruster',
]);

const CONDUIT_KINDS = Object.freeze(['straight', 'corner', 't', 'cross', 'end', 'junction']);

function conduitPart(family, kind) {
  const assetId = `place_works_conduit_${family}_${kind}`;
  return Object.freeze({
    lod0: `assets/ships/release/parts/works/${assetId}.glb`,
    lod1: null,
    slot: 'place',
    hooks: Object.freeze([family === 'power' ? 'powered' : 'flow_mesh']),
  });
}

/**
 * Resolve the live N/E/S/W connectivity mask onto the conduit kit's canonical ports.
 * Bits are siteLogistics' N=1,E=2,S=4,W=8. Canonical authored ports are:
 * end=E, straight=E/W, corner=N/E, T=N/E/W, cross/junction=all four.
 * `service` selects the four-port service-box variant without inventing a port.
 */
export function resolveWorksConduitPiece(family, mask, { service = false } = {}) {
  if (family !== 'power' && family !== 'lane') {
    throw new Error(`[worksPartLoader] unknown conduit family "${family}"`);
  }
  if (!Number.isInteger(mask) || mask < 0 || mask > 15) {
    throw new Error(`[worksPartLoader] conduit mask must be an integer 0..15, got ${mask}`);
  }
  if (mask === 0) return null;

  const arms = (mask & 1) + ((mask >> 1) & 1) + ((mask >> 2) & 1) + ((mask >> 3) & 1);
  let kind = null;
  let rotation = 0;
  if (arms === 1) {
    kind = 'end';
    rotation = ({ 2: 0, 4: -Math.PI / 2, 8: Math.PI, 1: Math.PI / 2 })[mask];
  } else if (arms === 2) {
    if (mask === 10 || mask === 5) {
      kind = 'straight';
      rotation = mask === 10 ? 0 : Math.PI / 2;
    } else {
      kind = 'corner';
      rotation = ({ 3: 0, 6: -Math.PI / 2, 12: Math.PI, 9: Math.PI / 2 })[mask];
    }
  } else if (arms === 3) {
    kind = 't';
    rotation = ({ 11: 0, 7: -Math.PI / 2, 14: Math.PI, 13: Math.PI / 2 })[mask];
  } else {
    kind = service ? 'junction' : 'cross';
  }

  if (!CONDUIT_KINDS.includes(kind) || !Number.isFinite(rotation)) {
    throw new Error(`[worksPartLoader] unresolved conduit mask ${mask}`);
  }
  return Object.freeze({
    family,
    kind,
    mask,
    assetId: `place_works_conduit_${family}_${kind}`,
    rotation,
  });
}

export const WORKS_PARTS = Object.freeze({
  drill_platform: Object.freeze({
    lod0: 'assets/ships/release/parts/places/place_drill_platform.glb',
    lod1: null,
    slot: 'place',
    hooks: Object.freeze([]),
  }),
  rover: Object.freeze({
    lod0: 'assets/ships/release/parts/works/place_works_rover.glb',
    lod1: null,
    slot: 'place',
    hooks: ROVER_HOOKS,
  }),
  cargo_port: Object.freeze({
    lod0: 'assets/ships/release/parts/works/place_works_cargo_port.glb',
    lod1: null,
    slot: 'place',
    hooks: CARGO_PORT_HOOKS,
    siteNodeLod: 'lod2',
  }),
  place_works_conduit_power_straight: conduitPart('power', 'straight'),
  place_works_conduit_power_corner: conduitPart('power', 'corner'),
  place_works_conduit_power_t: conduitPart('power', 't'),
  place_works_conduit_power_cross: conduitPart('power', 'cross'),
  place_works_conduit_power_end: conduitPart('power', 'end'),
  place_works_conduit_power_junction: conduitPart('power', 'junction'),
  place_works_conduit_lane_straight: conduitPart('lane', 'straight'),
  place_works_conduit_lane_corner: conduitPart('lane', 'corner'),
  place_works_conduit_lane_t: conduitPart('lane', 't'),
  place_works_conduit_lane_cross: conduitPart('lane', 'cross'),
  place_works_conduit_lane_end: conduitPart('lane', 'end'),
  place_works_conduit_lane_junction: conduitPart('lane', 'junction'),
});

function selectUrl(entry, register) {
  if (register === 'site') return entry.lod1 || entry.lod0;
  return entry.lod0;
}

function resolveNodeLod(tagsPresent, register, preferredSiteLod = 'lod1') {
  if (register === 'site') {
    for (let i = 0; i < tagsPresent.length; i++) {
      if (tagsPresent[i] === preferredSiteLod) return preferredSiteLod;
    }
    for (let i = 0; i < tagsPresent.length; i++) {
      if (tagsPresent[i] === 'lod1') return 'lod1';
    }
  }
  return 'lod0';
}

function applyLodVisibility(group, register) {
  const tags = group.userData.worksLodTags || [];
  const want = resolveNodeLod(tags, register, group.userData.worksSiteNodeLod || 'lod1');
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

function instantiateBlueprint(blueprint, hookNames, entry) {
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
  root.userData.worksSiteNodeLod = entry && entry.siteNodeLod ? entry.siteNodeLod : 'lod1';

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
  root.userData.worksCutterMeshes = bindWorksHookHierarchy(root, worksHooks);
  return root;
}

// Per-instance clones (a track sampler, a cutter material that must glow alone) are NOT the
// blueprint's shared GPU resources: the lease owns those and hands the same ones to every clone.
// Anything recorded here belongs to exactly one group and dies with it in releaseWorksPart.
export function recordWorksInstanceResources(group, resources) {
  if (!group || !resources) return;
  const list = group.userData.worksInstanceResources
    || (group.userData.worksInstanceResources = []);
  const items = Array.isArray(resources) ? resources : [resources];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item && list.indexOf(item) < 0) list.push(item);
  }
}

const _hookWorld = new THREE.Matrix4();
const _hookInv = new THREE.Matrix4();

function reparentKeepWorld(child, parent) {
  if (!child || !parent || child === parent || child.parent === parent) return;
  child.updateMatrixWorld(true);
  parent.updateMatrixWorld(true);
  _hookWorld.copy(child.matrixWorld);
  parent.add(child);
  _hookInv.copy(parent.matrixWorld).invert();
  child.matrix.copy(_hookInv.multiply(_hookWorld));
  child.matrix.decompose(child.position, child.quaternion, child.scale);
}

function hookStem(name) {
  const raw = String(name || '');
  return raw.replace(/^LOD[012]_/, '');
}

function bindWorksHookHierarchy(root, hooks) {
  if (!hooks) return [];
  const meshes = [];
  root.traverse((obj) => {
    if (obj.isMesh) meshes.push(obj);
  });
  const boom = hooks.boom_pivot;
  const bit = hooks[CUTTER_SOCKET];
  if (bit && boom) reparentKeepWorld(bit, boom);
  const podRoot = hooks.pod_root;
  const podThruster = hooks.pod_thruster;
  if (podThruster && podRoot) reparentKeepWorld(podThruster, podRoot);
  const cutters = [];
  for (let i = 0; i < meshes.length; i++) {
    const mesh = meshes[i];
    const stem = hookStem(mesh.name);
    if (stem === CUTTER_STEM) {
      // The cutter hangs off the socket the runtime spins, never off the arm: a cutter parented
      // to boom_pivot swings with the boom but can never turn on its own axis.
      reparentKeepWorld(mesh, bit || boom || root);
      cutters.push(mesh);
      continue;
    }
    if (stem === 'pod') {
      reparentKeepWorld(mesh, podRoot || root);
      continue;
    }
    if (hooks[stem]) {
      reparentKeepWorld(mesh, hooks[stem]);
      continue;
    }
    if (/_Boom$/.test(mesh.name) || /Bit/i.test(mesh.name)) {
      reparentKeepWorld(mesh, boom || root);
    }
  }
  return cutters;
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
  let lastError = null;
  const live = [];
  // A teardown/mount race may hand the same group to two retirement paths. Releasing twice must
  // not inflate diagnostics or walk/dispose instance resources a second time.
  const releasedGroups = new WeakSet();
  // id -> { promise, group }. One screen session holds at most ONE standing load per id, and
  // every concurrent caller joins the SAME promise. Without this, two call sites racing the
  // same async mount each take a lease, and the loser's group is dropped without release —
  // observed as worksStats.loaded: 2 / released: 0 in the PQ-131.00 receipt.
  const standing = new Map();

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
      live: live.length,
      standing: standing.size,
      lastError,
    };
  }

  function setRegister(next) {
    if (next !== 'work' && next !== 'site') {
      throw new Error(`[worksPartLoader] register must be 'work' or 'site', got ${next}`);
    }
    register = next;
    for (let i = 0; i < live.length; i++) applyLodVisibility(live[i], register);
  }

  function forgetStanding(group) {
    for (const [id, record] of standing) {
      if (record.group === group) {
        standing.delete(id);
        return;
      }
    }
  }

  function releaseWorksPart(group) {
    if (!group || releasedGroups.has(group)) return false;
    releasedGroups.add(group);
    const idx = live.indexOf(group);
    if (idx >= 0) live.splice(idx, 1);
    forgetStanding(group);
    const owned = group.userData ? group.userData.worksInstanceResources : null;
    releaseClone(group);
    if (Array.isArray(owned)) {
      // Instance-owned clones die with the instance. The blueprint's shared geometry, materials
      // and textures belong to the lease and are retired once, in dispose().
      for (let i = 0; i < owned.length; i++) disposeRendererBoundResource(owned[i]);
      owned.length = 0;
    }
    released += 1;
    return true;
  }

  function failLoad(id, url, error) {
    failed += 1;
    lastError = {
      id,
      url,
      message: error && error.message ? error.message : String(error),
    };
    // Loud on purpose. The authored rover is not accepted yet, so the caller keeps its procedural
    // fallback and the screen stays playable — but a silent null here is exactly how a dead
    // authored asset hid behind a working picture for weeks. Name it every time.
    console.error(`[worksPartLoader] authored works part "${id}" did not load from ${url}`, error);
    return null;
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
    } catch (error) {
      return failLoad(id, url, error);
    }
    if (!lease.isActive() || closed) return null;
    if (!blueprint || !Array.isArray(blueprint.primitives)) {
      return failLoad(id, url, new Error('the lease resolved no mesh primitives'));
    }

    if (register !== requestedRegister) {
      if (attempt >= 1) return null;
      return loadWorksPart(id, options, attempt + 1);
    }

    const hookNames = (entry.hooks || []).slice();
    if (blueprint.assetId && hookNames.indexOf(blueprint.assetId) < 0) {
      hookNames.push(blueprint.assetId);
    }
    const group = instantiateBlueprint(blueprint, hookNames, entry);
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

  // The lifecycle a screen session must use for anything it keeps on camera. Concurrent callers
  // share one promise and one group; a caller that arrives after the load settled gets the same
  // standing group back instead of taking a second lease.
  function loadStandingPart(id, options = {}) {
    const existing = standing.get(id);
    if (existing) return existing.promise;
    const record = { promise: null, group: null };
    record.promise = loadWorksPart(id, options).then(
      (group) => {
        if (!group) {
          if (standing.get(id) === record) standing.delete(id);
          return null;
        }
        record.group = group;
        group.userData.worksStanding = id;
        return group;
      },
      (error) => {
        if (standing.get(id) === record) standing.delete(id);
        throw error;
      },
    );
    standing.set(id, record);
    return record.promise;
  }

  function standingPart(id) {
    const record = standing.get(id);
    return record ? record.group : null;
  }

  function dispose(reason = 'works-screen-exit') {
    if (closed) return 0;
    closed = true;
    standing.clear();
    const gpu = new Set();
    for (let i = 0; i < live.length; i++) collectGroupGpuResources(live[i], gpu);
    while (live.length) releaseWorksPart(live[live.length - 1]);
    lease.release(reason);
    for (const resource of gpu) disposeRendererBoundResource(resource);
    return disposeAuthoredAssetRuntime(renderer);
  }

  return Object.freeze({
    loadWorksPart,
    loadStandingPart,
    standingPart,
    releaseWorksPart,
    setRegister,
    stats,
    dispose,
  });
}
