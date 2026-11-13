// Pre-lift program warm for the first-use links that landed inside presented flight on the
// software-GL Adventure route (perf lane impactgc, 6v6 lift..+10 s, both arms):
//   - sf-cause-marks LineBasicMaterial: 11/12 runs, 142-1197 ms (the layer sits at drawRange 0
//     until the first scar, so nothing before the lift ever draws it)
//   - plume:family_industrial_main_plume:core / :distortion: 8/12 and 6/12 runs, 179-974 ms
//     (fleet family plumes share these programs; the fleet is built lazily after the lift)
//   - SF_CommonRock_GeologicalPBR_v5, non-instanced asteroid body: 4/12 runs, 153-366 ms
//     (the instanced variant always links before the lift; the per-body mesh races it)
// openingEffectWarm.js names the first two, but its sweep is only reached from the opening
// roster warm, which this route never begins (no receipt in any of the 12 verdicts).
//
// The exemplars ride the player plasma warm root (vfx warmupOpeningEffectSubsetForLoading),
// which the first-picture cook already admits strictly before the lift. Exemplars are tiny,
// degenerate and own their geometry; materials are either built from the same factory as the
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
export const PRELIFT_WARM_KEYS = Object.freeze(['cause-marks', 'plume', 'rock']);

// Module-retained so repeated loading windows reuse one material set (and one program each).
let causeMaterial = null;
let plume = null;

function degenerateAttribute(source, vertices) {
  const itemSize = Math.max(1, source.itemSize | 0);
  return new THREE.BufferAttribute(new Float32Array(itemSize * vertices), itemSize, source.normalized === true);
}

function layoutClone(geometry, vertices) {
  const out = new THREE.BufferGeometry();
  for (const name of Object.keys(geometry.attributes || {})) {
    out.setAttribute(name, degenerateAttribute(geometry.attributes[name], vertices));
  }
  out.setDrawRange(0, vertices);
  return out;
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
 * { root, receipt, release }. `release()` detaches everything, frees only exemplar-owned
 * geometry and is idempotent.
 */
export function attachPreliftSceneWarm(parent, scene) {
  const receipt = { causeMarks: false, plumeLayers: 0, plumeRecipe: null, rock: false, rockSource: null };
  if (!parent || typeof parent.add !== 'function') return { root: null, receipt, release: () => false };
  const root = new THREE.Group();
  root.name = PRELIFT_WARM_ROOT_NAME;
  const ownedGeometries = [];

  if (!causeMaterial) causeMaterial = createCauseMarkMaterial();
  const causeGeo = new THREE.BufferGeometry();
  causeGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  causeGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(6), 3));
  causeGeo.setDrawRange(0, 2);
  ownedGeometries.push(causeGeo);
  const cause = new THREE.LineSegments(causeGeo, causeMaterial);
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
  if (rock) {
    const geo = layoutClone(rock.geometry, 3);
    ownedGeometries.push(geo);
    const mesh = new THREE.Mesh(geo, rock.material);
    mesh.name = `${PRELIFT_WARM_ROOT_NAME}:rock`;
    mesh.castShadow = rock.castShadow === true;
    mesh.receiveShadow = rock.receiveShadow === true;
    mesh.frustumCulled = false;
    root.add(mesh);
    receipt.rock = true;
    receipt.rockSource = String((rock.parent && rock.parent.name) || rock.name || '');
  }

  parent.add(root);
  let released = false;
  const release = () => {
    if (released) return false;
    released = true;
    if (root.parent) root.parent.remove(root);
    if (system && system.group && system.group.parent === root) root.remove(system.group);
    for (const mesh of layers) { mesh.count = 0; mesh.visible = false; }
    for (const geo of ownedGeometries) geo.dispose();
    root.clear();
    return true;
  };
  return { root, receipt, release };
}

/** Test seam: drop the module-retained exemplar materials. */
export function __resetPreliftSceneWarmForTests() {
  causeMaterial = null;
  plume = null;
}
