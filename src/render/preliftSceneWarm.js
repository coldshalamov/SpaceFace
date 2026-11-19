// Pre-lift program warm for the first-use links that landed inside presented flight on the
// software-GL Adventure route (perf lane impactgc, 6v6 lift..+10 s, both arms):
//   - sf-cause-marks LineBasicMaterial: 11/12 runs, 142-1197 ms (the layer sits at drawRange 0
//     until the first scar, so nothing before the lift ever draws it)
//   - plume:family_industrial_main_plume:core / :distortion: 8/12 and 6/12 runs, 179-974 ms
//     (fleet family plumes share these programs; the fleet is built lazily after the lift)
//   - SF_CommonRock_GeologicalPBR_v5, non-instanced asteroid body: 4/12 runs, 153-366 ms
//   - SF_CommonRock_GeologicalPBR_v5, INSTANCED (SF_CommonRockInstances_v*): on 4bbe545d55 the
//     first pooled rock draw links the instanced variant (the per-body key plus the instancing
//     bit) after the lift — 4 of 7 candidate >150 ms stalls in scenewarm2, 632-1335 ms, and on
//     master too. Pool chunks sit at count 0 / hidden until the first registration, so nothing
//     before the lift draws them.
//   - lane-traffic freighter (visualFactory 'freighter', Mesh<Group<Group<Scene): the illustrated
//     hull (map/normal/roughness), the transparent grime/patch overlay and the canopy
//     MeshPhysicalMaterial link the first time a hauler enters the picture — 8 links per arm in
//     scenewarm2, 3 of 7 candidate >150 ms stalls. Lane traffic spawns ~6 s before the lift or
//     later, after this warm, so the exemplars come from a freighter the renderer's own visual
//     factory builds here: same factory, same module-cached materials, so the played keys. All
//     eight lane variants share one program set (pinned by test).
//   - SF_CommonRock_GeologicalPBR_v5 per-body key with the scene environment (cubeUV envMap,
//     instancing bit clear): scenewarm3 6v6 still linked it post-lift on Asteroid_604 in 3/5
//     candidate runs (250-374 ms) — the warm runs ~15 s before the lift, before any per-body
//     asteroid exists, so findNonInstancedRock found nothing and only the instanced key was warmed.
//     The pooled chunk draws the same shared library material, so a plain Mesh over it with the
//     chunk's attribute layout resolves exactly the per-body key (the two keys differ only in the
//     instancing bit).
// openingEffectWarm.js names the first two, but its sweep is only reached from the opening
// roster warm, which this route never begins (no receipt in any of the 12 verdicts).
//
// The exemplars ride the player plasma warm root (vfx warmupOpeningEffectSubsetForLoading),
// which the first-picture cook already admits strictly before the lift. Exemplars are tiny and
// degenerate: they draw one module-retained degenerate geometry per attribute layout (never the
// live owner's geometry), so a warm window allocates no geometry of its own; materials are either built from the same factory as the
// live owner or are the live material itself, so the warmed key is the played key. Materials
// are never disposed here: disposing would release the linked program.

import * as THREE from 'three';
import { createCauseMarkMaterial } from './vfx/causeMarks.js';
import { ContinuousPlumeSystem } from './thruster/systems/continuousPlume.js';
import { resolveThrusterRecipes } from './thruster/recipes/registry.js';

export const PRELIFT_WARM_ROOT_NAME = 'SF_PreliftSceneWarm';
export const PRELIFT_WARM_ROCK_MATERIAL = 'SF_CommonRock_GeologicalPBR_v5';
export const PRELIFT_WARM_PLUME_PROFILE = 'engine_industrial';
export const PRELIFT_WARM_PLUME_RECIPE_ID = 'family_industrial_main_plume';
export const PRELIFT_WARM_KEYS = Object.freeze(['cause-marks', 'plume', 'rock', 'rock-instanced', 'freighter']);
// The entity the lane-traffic system hands the visual factory (data.parentType 'lane_traffic');
// laneTrafficVisualEntity rewraps it as a neutral ship_mule hauler for any variant.
export const PRELIFT_WARM_FREIGHTER_ENTITY = Object.freeze({
  id: 'prelift-scene-warm:freighter', type: 'freighter', radius: 12, team: 0, factionId: null,
  data: Object.freeze({ parentType: 'lane_traffic', laneVariant: 0 }),
});
export const PRELIFT_WARM_ROCK_INSTANCE_PREFIX = 'SF_CommonRockInstances_';

// Module-retained so repeated loading windows reuse one material set (and one program each).
let causeMaterial = null;
let plume = null;
let freighterLeaves = null;
let freighterFactory = null;
// scenewarm5: one degenerate geometry per attribute layout, module-retained like the materials and
// shared by every exemplar with that layout (rock, instanced rock, freighter leaves) across loading
// windows. A warm window then allocates no BufferGeometry / Float32Array / GPU buffer of its own, and
// release has nothing left to dispose, so the warm leaves no exemplar garbage for the first
// collection after the lift (scenewarm4 8v8: profiler GC 0-1 s after lift 35.7 vs 19.9 ms/run).
const degenerateGeometries = new Map();
let causeGeometry = null;

function degenerateAttribute(source, vertices) {
  const itemSize = Math.max(1, source.itemSize | 0);
  return new THREE.BufferAttribute(new Float32Array(itemSize * vertices), itemSize, source.normalized === true);
}

// Attribute layout only ({ name, itemSize, normalized }): what the program key reads. Keeping the
// layout instead of the source geometry lets a built-and-dropped source (the freighter) be collected.
function attributeLayout(geometry) {
  const attributes = geometry && geometry.attributes ? geometry.attributes : {};
  return Object.keys(attributes).map((name) => ({ name, itemSize: attributes[name].itemSize,
    normalized: attributes[name].normalized === true }));
}

const DEGENERATE_VERTICES = 3;

function layoutSignature(layout) {
  return layout.map((attr) => `${attr.name}:${Math.max(1, attr.itemSize | 0)}:${attr.normalized === true}`).sort().join(',');
}

// The shared degenerate geometry for a layout (an exemplar's geometry only feeds the program key
// through its attribute names/sizes; it never borrows the live owner's geometry).
function sharedDegenerateGeometry(geometryOrLayout) {
  const layout = Array.isArray(geometryOrLayout) ? geometryOrLayout : attributeLayout(geometryOrLayout);
  const signature = layoutSignature(layout);
  let out = degenerateGeometries.get(signature);
  if (out) return out;
  out = new THREE.BufferGeometry();
  for (const attr of layout) out.setAttribute(attr.name, degenerateAttribute(attr, DEGENERATE_VERTICES));
  out.setDrawRange(0, DEGENERATE_VERTICES);
  out.name = `${PRELIFT_WARM_ROOT_NAME}:degenerate`;
  degenerateGeometries.set(signature, out);
  return out;
}

function sharedCauseGeometry() {
  if (causeGeometry) return causeGeometry;
  causeGeometry = new THREE.BufferGeometry();
  causeGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  causeGeometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(6), 3));
  causeGeometry.setDrawRange(0, 2);
  causeGeometry.name = `${PRELIFT_WARM_ROOT_NAME}:cause-marks`;
  return causeGeometry;
}

function findNonInstancedRock(scene, skip) {
  const stack = scene ? [scene] : [];
  while (stack.length) {
    const node = stack.pop();
    if (!node || node === skip) continue;
    if (node.isMesh && !node.isInstancedMesh && !node.isBatchedMesh && node.material
        && !Array.isArray(node.material) && node.material.name === PRELIFT_WARM_ROCK_MATERIAL
        && node.geometry && node.geometry.attributes && node.geometry.attributes.position
        && Object.keys(node.geometry.morphAttributes || {}).length === 0) {
      return node;
    }
    const children = node.children;
    if (children) for (let i = 0; i < children.length; i++) stack.push(children[i]);
  }
  return null;
}

// The pooled chunk's material when one is already published (its bound material is the one the
// first live registration draws), else the per-body rock material: pooled leaves and per-body
// meshes share the library material, so an InstancedMesh over it resolves the instanced key.
function findInstancedRockSource(scene, skip, fallback) {
  const stack = scene ? [scene] : [];
  while (stack.length) {
    const node = stack.pop();
    if (!node || node === skip) continue;
    if (node.isInstancedMesh && typeof node.name === 'string'
        && node.name.startsWith(PRELIFT_WARM_ROCK_INSTANCE_PREFIX) && node.material
        && !Array.isArray(node.material) && node.material.name === PRELIFT_WARM_ROCK_MATERIAL
        && node.geometry && node.geometry.attributes && node.geometry.attributes.position
        && !node.instanceColor && !node.morphTexture) {
      return { mesh: node, material: node.material, geometry: node.geometry, pooled: true };
    }
    const children = node.children;
    if (children) for (let i = 0; i < children.length; i++) stack.push(children[i]);
  }
  if (fallback) return { mesh: fallback, material: fallback.material, geometry: fallback.geometry, pooled: false };
  return null;
}

function attributeSignature(geometry) {
  const attributes = geometry && geometry.attributes ? geometry.attributes : {};
  return Object.keys(attributes).sort()
    .map((name) => `${name}:${attributes[name].itemSize}:${attributes[name].normalized === true}`).join(',');
}

// One leaf per distinct (material, attribute layout, instancing) the built freighter draws.
// Batched/skinned/point/line leaves are skipped: a degenerate copy cannot reproduce them exactly.
function ensureFreighterLeaves(visualFactory) {
  if (freighterLeaves && freighterFactory === visualFactory) return freighterLeaves;
  freighterLeaves = [];
  freighterFactory = visualFactory;
  if (!visualFactory || typeof visualFactory.build !== 'function') return freighterLeaves;
  const built = visualFactory.build({ ...PRELIFT_WARM_FREIGHTER_ENTITY, data: { ...PRELIFT_WARM_FREIGHTER_ENTITY.data } });
  if (!built || typeof built.traverse !== 'function' || built.userData?.visualBuildFailed) return freighterLeaves;
  built.updateMatrixWorld(true);
  const seen = new Set();
  built.traverse((node) => {
    if (!node.isMesh || node.isBatchedMesh || node.isSkinnedMesh || !node.geometry || !node.material
        || Array.isArray(node.material) || !node.geometry.attributes || !node.geometry.attributes.position
        || Object.keys(node.geometry.morphAttributes || {}).length) return;
    const instanced = node.isInstancedMesh === true;
    const flip = node.matrixWorld.determinant() < 0;
    const key = `${node.material.uuid}|${attributeSignature(node.geometry)}|${instanced}|${instanced && !!node.instanceColor}|${flip}|${node.castShadow === true}`;
    if (seen.has(key)) return;
    seen.add(key);
    freighterLeaves.push({ material: node.material, layout: attributeLayout(node.geometry), instanced,
      instanceColor: instanced && !!node.instanceColor, flip,
      castShadow: node.castShadow === true, receiveShadow: node.receiveShadow === true });
  });
  return freighterLeaves;
}

function ensurePlume() {
  if (plume) return plume;
  const recipe = resolveThrusterRecipes(PRELIFT_WARM_PLUME_PROFILE).main;
  if (!recipe || recipe.id !== PRELIFT_WARM_PLUME_RECIPE_ID) return null;
  // Same constructor options as the fleet families (familyFleet.js) except capacity and
  // textures: maps are uniforms, not defines, so they do not change the program key.
  plume = new ContinuousPlumeSystem(THREE, recipe, { textures: {}, maxSockets: 1, distortionEnabled: false });
  plume.group.name = `${PRELIFT_WARM_ROOT_NAME}:plume`;
  return plume;
}

function plumeLayers(system) {
  const layers = [];
  if (system && system.group) {
    for (const child of system.group.children) if (child && child.isMesh) layers.push(child);
  }
  return layers;
}

/**
 * Mount the warm exemplars under `parent` (the plasma warm root) and return
 * { root, receipt, release }. `release()` detaches everything, frees only the per-window instance
 * buffers (degenerate geometries and materials are module-retained and shared) and is idempotent.
 */
export function attachPreliftSceneWarm(parent, scene, { visualFactory = null } = {}) {
  const receipt = { causeMarks: false, plumeLayers: 0, plumeRecipe: null, rock: false, rockSource: null,
    rockInstanced: false, rockInstancedSource: null, freighterLeaves: 0 };
  if (!parent || typeof parent.add !== 'function') return { root: null, receipt, release: () => false };
  const root = new THREE.Group();
  root.name = PRELIFT_WARM_ROOT_NAME;
  const ownedInstanced = [];

  if (!causeMaterial) causeMaterial = createCauseMarkMaterial();
  const cause = new THREE.LineSegments(sharedCauseGeometry(), causeMaterial);
  cause.name = `${PRELIFT_WARM_ROOT_NAME}:cause-marks`;
  cause.frustumCulled = false;
  root.add(cause);
  receipt.causeMarks = true;

  const system = ensurePlume();
  const layers = plumeLayers(system);
  if (system && layers.length) {
    for (const mesh of layers) { mesh.count = 1; mesh.visible = true; }
    root.add(system.group);
    receipt.plumeLayers = layers.length;
    receipt.plumeRecipe = system.recipe.id;
  }

  const rock = findNonInstancedRock(scene, parent);
  const inst = findInstancedRockSource(scene, parent, rock);
  // Per-body (non-instanced) key: the live per-body mesh when one exists, else the pooled chunk's
  // shared library material and layout as a plain Mesh (no per-body asteroid exists this early).
  const perBody = rock
    ? { material: rock.material, geometry: rock.geometry, castShadow: rock.castShadow, receiveShadow: rock.receiveShadow,
      source: String((rock.parent && rock.parent.name) || rock.name || '') }
    : (inst && inst.pooled
      ? { material: inst.material, geometry: inst.geometry, castShadow: inst.mesh.castShadow,
        receiveShadow: inst.mesh.receiveShadow, source: `pooled-material:${inst.mesh.name}` }
      : null);
  if (perBody) {
    const mesh = new THREE.Mesh(sharedDegenerateGeometry(perBody.geometry), perBody.material);
    mesh.name = `${PRELIFT_WARM_ROOT_NAME}:rock`;
    mesh.castShadow = perBody.castShadow === true;
    mesh.receiveShadow = perBody.receiveShadow === true;
    mesh.frustumCulled = false;
    root.add(mesh);
    receipt.rock = true;
    receipt.rockSource = perBody.source;
  }

  if (inst) {
    // count 1, identity matrix, degenerate geometry: draws nothing visible but binds the
    // instanceMatrix attribute, so the program carries the instancing define like the pool chunk.
    const mesh = new THREE.InstancedMesh(sharedDegenerateGeometry(inst.geometry), inst.material, 1);
    mesh.setMatrixAt(0, new THREE.Matrix4());
    mesh.count = 1;
    mesh.name = `${PRELIFT_WARM_ROOT_NAME}:rock-instanced`;
    mesh.castShadow = inst.mesh.castShadow === true;
    mesh.receiveShadow = inst.mesh.receiveShadow === true;
    mesh.frustumCulled = false;
    root.add(mesh);
    ownedInstanced.push(mesh);
    receipt.rockInstanced = true;
    receipt.rockInstancedSource = inst.pooled ? String(inst.mesh.name) : 'per-body-material';
  }

  let leaves = [];
  try { leaves = ensureFreighterLeaves(visualFactory); } catch (_) { leaves = []; }
  for (let i = 0; i < leaves.length; i++) {
    const leaf = leaves[i];
    const geo = sharedDegenerateGeometry(leaf.layout);
    let mesh;
    if (leaf.instanced) {
      mesh = new THREE.InstancedMesh(geo, leaf.material, 1);
      mesh.setMatrixAt(0, new THREE.Matrix4());
      if (leaf.instanceColor) mesh.setColorAt(0, new THREE.Color(1, 1, 1));
      mesh.count = 1;
      ownedInstanced.push(mesh);
    } else {
      mesh = new THREE.Mesh(geo, leaf.material);
    }
    if (leaf.flip) mesh.scale.x = -1;
    mesh.name = `${PRELIFT_WARM_ROOT_NAME}:freighter:${i}`;
    mesh.castShadow = leaf.castShadow;
    mesh.receiveShadow = leaf.receiveShadow;
    mesh.frustumCulled = false;
    root.add(mesh);
  }
  receipt.freighterLeaves = leaves.length;

  parent.add(root);
  let released = false;
  const release = () => {
    if (released) return false;
    released = true;
    if (root.parent) root.parent.remove(root);
    if (system && system.group && system.group.parent === root) root.remove(system.group);
    for (const mesh of layers) { mesh.count = 0; mesh.visible = false; }
    // Per-window instance buffers only; the degenerate geometries and materials stay module-retained.
    for (const mesh of ownedInstanced) mesh.dispose();
    root.clear();
    return true;
  };
  return { root, receipt, release };
}

/** Test seam: drop the module-retained exemplar materials. */
export function __resetPreliftSceneWarmForTests() {
  causeMaterial = null;
  plume = null;
  freighterLeaves = null;
  freighterFactory = null;
  for (const geo of degenerateGeometries.values()) geo.dispose();
  degenerateGeometries.clear();
  if (causeGeometry) causeGeometry.dispose();
  causeGeometry = null;
}
