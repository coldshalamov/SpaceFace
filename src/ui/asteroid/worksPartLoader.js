// Authored release-part seam for the Asteroid Works renderer (PQ-131.00).
//
// One loader stack: every fetch goes through createAuthoredAssetLease on the works WebGLRenderer.
// That lease already binds KTX2Loader via detectSupport, shares the Basis transcoder, and admits
// render packages. Do not construct a second KTX2Loader, transcoder path, or meshopt decoder here.
//
// Fail-closed on unknown ids (programmer error). An authored Core has no procedural fallback: a
// load/bind failure resolves to null and the renderer leaves that machine honestly absent. Never
// mutate blueprint materials or geometry.
import * as THREE from 'three';
import {
  createAuthoredAssetLease,
  disposeAuthoredAssetRuntime,
} from '../../render/assetLoader.js';

export const EXTRACTOR_HOOKS = Object.freeze([
  'head_face',
  'belt',
  'lamp',
]);

export const REFINERY_HOOKS = Object.freeze([
  'furnace_slit',
  'stack_vent',
  'lamp',
]);

export const DERRICK_HOOKS = Object.freeze([
  'drum_spin',
  'cable_anchor',
  'lamp_L',
  'lamp_R',
]);

// PQ-131.07. valve_wheel and gauge_needle are transform-only hook children; the lamp owns the
// only mutable lens shell. No other gas-tap surface is runtime-mutable.
export const GAS_TAP_HOOKS = Object.freeze([
  'valve_wheel',
  'gauge_needle',
  'lamp',
]);

// PQ-131.08. gantry_head is the progress-driven pivot (authored +X rail, length 1.4 from the
// export contract); the lamp owns the only mutable lens shell.
export const FABRICATOR_HOOKS = Object.freeze([
  'gantry_head',
  'lamp',
]);

// PQ-131.09. crate_0..4 are the five-stage export stack; pod_root+pod_thruster are the berthed
// courier (thruster is the only mutable emissive surface — it lights during the climb).
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
    lod1: `assets/ships/release/parts/works/${assetId}.glb`,
    slot: 'place',
    hooks: Object.freeze([family === 'power' ? 'powered' : 'flow_mesh']),
    binding: `works-conduit-${family}`,
  });
}

/**
 * Map the simulation's N/E/S/W connectivity mask onto the exact authored conduit ports.
 * The source kit is +X-forward: end=E, straight=E/W, corner=N/E, and T=N/E/W.
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
  let kind;
  let rotation = 0;
  if (arms === 1) {
    kind = 'end';
    rotation = ({ 1: Math.PI / 2, 2: 0, 4: -Math.PI / 2, 8: Math.PI })[mask];
  } else if (arms === 2) {
    if (mask === 5 || mask === 10) {
      kind = 'straight';
      rotation = mask === 5 ? Math.PI / 2 : 0;
    } else {
      kind = 'corner';
      rotation = ({ 3: 0, 6: -Math.PI / 2, 9: Math.PI / 2, 12: Math.PI })[mask];
    }
  } else if (arms === 3) {
    kind = 't';
    rotation = ({ 7: -Math.PI / 2, 11: 0, 13: Math.PI / 2, 14: Math.PI })[mask];
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
  // PQ-131.01 authored mine rig. One combined release GLB carries both the detailed
  // LOD0/work and reduced LOD1/site roots; the register selects the matching tagged meshes.
  place_works_rover: Object.freeze({
    lod0: 'assets/ships/release/parts/works/place_works_rover.glb',
    lod1: 'assets/ships/release/parts/works/place_works_rover.glb',
    slot: 'place',
    hooks: Object.freeze([
      'boom_pivot', 'bit_tip',
      'hopper_fill_0', 'hopper_fill_1', 'hopper_fill_2', 'hopper_fill_3', 'hopper_fill_4',
      'hopper_lid', 'lamp_socket', 'vent_stack', 'track_L', 'track_R', 'scar_plate',
    ]),
  }),
  // PQ-131.02. The combined release GLB contains only work (LOD0) and site (LOD1) meshes;
  // LOD2 remains in authoring/evidence output and must never become a live fallback.
  place_works_massline_core: Object.freeze({
    lod0: 'assets/ships/release/parts/works/place_works_massline_core.glb',
    lod1: 'assets/ships/release/parts/works/place_works_massline_core.glb',
    slot: 'place',
    hooks: Object.freeze(['ring_spin', 'lamp']),
    binding: 'massline-core',
  }),
  // PQ-131.03. The selected release has exactly the two live Works registers:
  // LOD0/work and LOD1/site. LOD2 remains in authoring/evidence only.
  place_works_extractor: Object.freeze({
    lod0: 'assets/ships/release/parts/works/place_works_extractor.glb',
    lod1: 'assets/ships/release/parts/works/place_works_extractor.glb',
    slot: 'place',
    hooks: EXTRACTOR_HOOKS,
    binding: 'works-extractor',
  }),
  // PQ-131.04. The reviewed full source retains LOD2 for authoring/evidence, while the selected
  // release has exactly the work (LOD0) and site (LOD1) registers used by Asteroid Works.
  place_works_refinery: Object.freeze({
    lod0: 'assets/ships/release/parts/works/place_works_refinery.glb',
    lod1: 'assets/ships/release/parts/works/place_works_refinery.glb',
    slot: 'place',
    hooks: REFINERY_HOOKS,
    binding: 'works-refinery',
  }),
  // PQ-131.05. The source remains the reviewed three-LOD authoring artifact; this release carries
  // only the two live Works registers and restores the real winch/cable/lamp pivots after package
  // flattening. There is no procedural Derrick fallback.
  place_works_derrick: Object.freeze({
    lod0: 'assets/ships/release/parts/works/place_works_derrick.glb',
    lod1: 'assets/ships/release/parts/works/place_works_derrick.glb',
    slot: 'place',
    hooks: DERRICK_HOOKS,
    binding: 'works-derrick',
  }),
  // PQ-131.07. The selected release carries exactly the work (LOD0) and site (LOD1) registers;
  // LOD2 remains authoring/evidence-only. There is no procedural gas tap fallback.
  place_works_gas_tap: Object.freeze({
    lod0: 'assets/ships/release/parts/works/place_works_gas_tap.glb',
    lod1: 'assets/ships/release/parts/works/place_works_gas_tap.glb',
    slot: 'place',
    hooks: GAS_TAP_HOOKS,
    binding: 'works-gas-tap',
  }),
  // PQ-131.08. Same selected-runtime law: LOD0/work and LOD1/site only, no procedural fallback.
  place_works_fabricator: Object.freeze({
    lod0: 'assets/ships/release/parts/works/place_works_fabricator.glb',
    lod1: 'assets/ships/release/parts/works/place_works_fabricator.glb',
    slot: 'place',
    hooks: FABRICATOR_HOOKS,
    binding: 'works-fabricator',
  }),
  // PQ-131.09. Same selected-runtime law: LOD0/work and LOD1/site only, no procedural fallback.
  place_works_cargo_port: Object.freeze({
    lod0: 'assets/ships/release/parts/works/place_works_cargo_port.glb',
    lod1: 'assets/ships/release/parts/works/place_works_cargo_port.glb',
    slot: 'place',
    hooks: CARGO_PORT_HOOKS,
    binding: 'works-cargo-port',
  }),
  ...Object.fromEntries(['power', 'lane'].flatMap((family) => CONDUIT_KINDS.map((kind) => [
    `place_works_conduit_${family}_${kind}`,
    conduitPart(family, kind),
  ]))),
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
    const semanticVisible = obj.userData.worksSemanticVisibility === true
      ? obj.userData.worksSemanticVisible !== false
      : true;
    const lod = obj.userData.worksLod;
    if (!lod) {
      obj.visible = semanticVisible;
      return;
    }
    obj.visible = lod === want && semanticVisible;
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
    for (let i = 0; i < recorded.length; i++) {
      const resource = recorded[i];
      if (resource && resource.userData?.worksInstanceOwned !== true) into.add(resource);
    }
  }
  group.traverse((obj) => {
    if (obj.geometry && obj.userData?.worksInstanceOwned !== true) into.add(obj.geometry);
    const mats = Array.isArray(obj.material) ? obj.material : (obj.material ? [obj.material] : []);
    for (let i = 0; i < mats.length; i++) {
      const mat = mats[i];
      if (!mat) continue;
      if (mat.userData?.worksInstanceOwned !== true) {
        into.add(mat);
        collectMaterialTextures(mat, into);
      }
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

function disposeInstanceOwnedResources(group) {
  const disposed = new Set();
  group.traverse((obj) => {
    const mats = Array.isArray(obj.material) ? obj.material : (obj.material ? [obj.material] : []);
    for (const material of mats) {
      if (!material || material.userData?.worksInstanceOwned !== true) continue;
      for (const key of Object.keys(material)) {
        const texture = material[key];
        if (!texture || texture.isTexture !== true || texture.userData?.worksInstanceOwned !== true) continue;
        if (!disposed.has(texture)) {
          disposed.add(texture);
          disposeRendererBoundResource(texture);
        }
      }
      if (!disposed.has(material)) {
        disposed.add(material);
        disposeRendererBoundResource(material);
      }
    }
  });
}

function cloneMaterialForInstance(material, primitiveName, binding) {
  if (!material || typeof material.clone !== 'function') return material;
  // Conduit atlas materials are immutable template resources. The renderer clones only the named
  // powered/flow hook shells per connected component; cloning every body here would defeat atlas
  // sharing and makes it too easy for a live network update to drift into static surfacing.
  if (/^works-conduit-(power|lane)$/u.test(binding || '')) return material;
  // The Derrick's authored atlas is permanent structural surfacing. Only its two hooded-lamp
  // lenses carry live status; giving frame, drum, cable, or hood shells per-instance would both
  // waste residency and invite accidental palette mutation.
  if (binding === 'works-derrick' && !/^LOD[01]_lamp_[LR]_lens$/u.test(primitiveName || '')) {
    return material;
  }
  // The gas tap's authored atlas is permanent structural surfacing. Only its hooded lamp glass
  // carries live status; plate, valve, wheel, gauge, and hose shells stay shared blueprint
  // resources so a live network update cannot drift into static surfacing or palette mutation.
  if (binding === 'works-gas-tap' && !/^LOD[01]_lamp$/u.test(primitiveName || '')) {
    return material;
  }
  // The fabricator's authored atlas is permanent structural surfacing. Only its hooded lamp glass
  // carries live status (authored names are camel-cased: LOD0_Lamp); frame, bed, rail, and gantry
  // shells stay shared blueprint resources.
  if (binding === 'works-fabricator' && !/^LOD[01]_Lamp$/u.test(primitiveName || '')) {
    return material;
  }
  // The cargo port's atlas is permanent structural surfacing. Only the courier's thruster bell
  // lights (during the climb); frame, cradle, crates, and pod hulls stay shared blueprint resources.
  if (binding === 'works-cargo-port' && !/^LOD[01]_pod_thruster$/u.test(primitiveName || '')) {
    return material;
  }
  // Runtime status can only mutate these authored state surfaces. The furnace jacket, stack,
  // tank, and their atlas-backed materials remain shared blueprint resources across instances.
  if (/^LOD[01]_refinery$/i.test(primitiveName || '')) return material;
  const clone = material.clone();
  clone.userData = { ...(clone.userData || {}), worksInstanceOwned: true };
  // The extractor's belt scrolls its atlas sampler. Keep that sampler per instance
  // just as the Rover keeps its track sampler, so no live machine changes a cached
  // blueprint or another Extractor's belt phase.
  if (!/(?:track|belt)/i.test(primitiveName || '')) return clone;
  for (const key of Object.keys(clone)) {
    const texture = clone[key];
    if (!texture || texture.isTexture !== true || typeof texture.clone !== 'function') continue;
    const instanceTexture = texture.clone();
    instanceTexture.userData = { ...(instanceTexture.userData || {}), worksInstanceOwned: true };
    instanceTexture.wrapS = THREE.RepeatWrapping;
    clone[key] = instanceTexture;
  }
  return clone;
}

function maxMatrixDelta(a, b) {
  let delta = 0;
  for (let i = 0; i < 16; i++) delta = Math.max(delta, Math.abs(a.elements[i] - b.elements[i]));
  return delta;
}

function attachPreservingWorld(parent, child) {
  parent.updateWorldMatrix(true, false);
  child.updateWorldMatrix(true, false);
  const before = child.matrixWorld.clone();
  parent.attach(child);
  child.updateWorldMatrix(true, false);
  if (maxMatrixDelta(before, child.matrixWorld) > 1e-6) {
    throw new Error(`[worksPartLoader] hook reparent moved ${child.name}`);
  }
}

// GLTF runtime tables intentionally flatten primitive and marker nodes. The Core's source hierarchy
// matters: its race meshes rotate under ring_spin and its lamp meshes own their per-instance shell
// under lamp. Reconstruct only this exported hierarchy after instantiation; do not generalize it to
// unrelated works assets that have different hook ownership.
export function bindMasslineCoreHookHierarchy(group) {
  const hooks = group?.userData?.worksHooks || {};
  const ring = hooks.ring_spin;
  const lamp = hooks.lamp;
  if (!ring || !lamp) throw new Error('[worksPartLoader] Massline Core is missing ring_spin or lamp marker');
  const bindings = [
    [ring, 'LOD0_massline_core_spin'],
    [ring, 'LOD1_massline_core_spin'],
    [lamp, 'LOD0_massline_core_lamp'],
    [lamp, 'LOD1_massline_core_lamp'],
  ];
  const bound = [];
  for (const [parent, name] of bindings) {
    const child = group.getObjectByName(name);
    if (!child) throw new Error(`[worksPartLoader] Massline Core is missing ${name}`);
    attachPreservingWorld(parent, child);
    bound.push(name);
  }
  group.userData.worksCoreBoundMeshes = bound;
  group.userData.worksCoreHooks = Object.freeze({ ring_spin: ring, lamp });
  return group.userData.worksCoreHooks;
}

// Render packages flatten the authored scene into primitive world matrices. The Extractor's
// working head, conveyor, and lamp therefore need their authored pivots reconstructed before
// the renderer animates them. attachPreservingWorld makes this a world-pose-preserving operation.
export function bindWorksExtractorHookHierarchy(group) {
  const hooks = group?.userData?.worksHooks || {};
  const head = hooks.head_face;
  const belt = hooks.belt;
  const lamp = hooks.lamp;
  if (!head || !belt || !lamp) {
    throw new Error('[worksPartLoader] Extractor is missing head_face, belt, or lamp marker');
  }
  const bindings = [
    [head, 'LOD0_head'],
    [head, 'LOD1_head'],
    [belt, 'LOD0_belt'],
    [belt, 'LOD1_belt'],
    [lamp, 'LOD0_lamp'],
    [lamp, 'LOD0_lamp_lens'],
    [lamp, 'LOD1_lamp'],
    [lamp, 'LOD1_lamp_lens'],
  ];
  const bound = [];
  for (const [parent, name] of bindings) {
    const child = group.getObjectByName(name);
    if (!child) throw new Error(`[worksPartLoader] Extractor is missing ${name}`);
    attachPreservingWorld(parent, child);
    bound.push(name);
  }
  group.userData.worksExtractorBoundMeshes = bound;
  group.userData.worksExtractorHooks = Object.freeze({ head_face: head, belt, lamp });
  return group.userData.worksExtractorHooks;
}

// The release package flattens primitive world matrices. Restore only the Refinery's stateful
// slit and lens pivots beneath their authored markers; stack_vent intentionally remains an exposed
// stationary marker for runtime light placement and no static jacket/stack/tank mesh is reparented.
export function bindWorksRefineryHookHierarchy(group) {
  const hooks = group?.userData?.worksHooks || {};
  const furnace = hooks.furnace_slit;
  const stack = hooks.stack_vent;
  const lamp = hooks.lamp;
  if (!furnace || !stack || !lamp) {
    throw new Error('[worksPartLoader] Refinery is missing furnace_slit, stack_vent, or lamp marker');
  }
  const bindings = [
    [furnace, 'LOD0_furnace_slit'],
    [furnace, 'LOD1_furnace_slit'],
    [lamp, 'LOD0_lamp_lens'],
    [lamp, 'LOD1_lamp_lens'],
  ];
  const bound = [];
  for (const [parent, name] of bindings) {
    const child = group.getObjectByName(name);
    if (!child) throw new Error(`[worksPartLoader] Refinery is missing ${name}`);
    attachPreservingWorld(parent, child);
    bound.push(name);
  }
  group.userData.worksRefineryBoundMeshes = bound;
  group.userData.worksRefineryHooks = Object.freeze({ furnace_slit: furnace, stack_vent: stack, lamp });
  return group.userData.worksRefineryHooks;
}

// The released package stores primitive matrices flat. Reattach only the authored functional
// Derrick children under their concrete pivots, preserving every visible world pose while making
// drum spin, umbilical origin, and lens-only status updates meaningful in the permanent route.
export function bindWorksDerrickHookHierarchy(group) {
  const hooks = group?.userData?.worksHooks || {};
  const drum = hooks.drum_spin;
  const cable = hooks.cable_anchor;
  const lampL = hooks.lamp_L;
  const lampR = hooks.lamp_R;
  if (!drum || !cable || !lampL || !lampR) {
    throw new Error('[worksPartLoader] Derrick is missing drum_spin, cable_anchor, lamp_L, or lamp_R marker');
  }
  const bindings = [
    [drum, 'LOD0_drum'], [drum, 'LOD1_drum'],
    [cable, 'LOD0_cable'], [cable, 'LOD1_cable'],
    [lampL, 'LOD0_lamp_L'], [lampL, 'LOD0_lamp_L_lens'],
    [lampL, 'LOD1_lamp_L'], [lampL, 'LOD1_lamp_L_lens'],
    [lampR, 'LOD0_lamp_R'], [lampR, 'LOD0_lamp_R_lens'],
    [lampR, 'LOD1_lamp_R'], [lampR, 'LOD1_lamp_R_lens'],
  ];
  const bound = [];
  for (const [parent, name] of bindings) {
    const child = group.getObjectByName(name);
    if (!child) throw new Error(`[worksPartLoader] Derrick is missing ${name}`);
    attachPreservingWorld(parent, child);
    bound.push(name);
  }
  group.userData.worksDerrickBoundMeshes = bound;
  group.userData.worksDerrickHooks = Object.freeze({
    drum_spin: drum, cable_anchor: cable, lamp_L: lampL, lamp_R: lampR,
  });
  return group.userData.worksDerrickHooks;
}

// The release package flattens primitive matrices. Reattach the authored wheel, needle, and lamp
// glass under their pivots, preserving every visible world pose, so wheel spin, needle rotation,
// and lens-only status updates are meaningful. Plate/valve/hose meshes stay on the root.
export function bindWorksGasTapHookHierarchy(group) {
  const hooks = group?.userData?.worksHooks || {};
  const wheel = hooks.valve_wheel;
  const needle = hooks.gauge_needle;
  const lamp = hooks.lamp;
  if (!wheel || !needle || !lamp) {
    throw new Error('[worksPartLoader] Gas tap is missing valve_wheel, gauge_needle, or lamp marker');
  }
  const bindings = [
    [wheel, 'LOD0_valve_wheel'], [wheel, 'LOD1_valve_wheel'],
    [needle, 'LOD0_gauge_needle'], [needle, 'LOD1_gauge_needle'],
    [lamp, 'LOD0_lamp'], [lamp, 'LOD1_lamp'],
  ];
  const bound = [];
  for (const [parent, name] of bindings) {
    const child = group.getObjectByName(name);
    if (!child) throw new Error(`[worksPartLoader] Gas tap is missing ${name}`);
    attachPreservingWorld(parent, child);
    bound.push(name);
  }
  group.userData.worksGasTapBoundMeshes = bound;
  group.userData.worksGasTapHooks = Object.freeze({
    valve_wheel: wheel, gauge_needle: needle, lamp,
  });
  return group.userData.worksGasTapHooks;
}

// PQ-131.08. The authored file already parents LOD0/LOD1_Gantry under the gantry_head pivot and
// LOD0/LOD1_Lamp under the lamp pivot; the release pipeline may flatten primitive matrices, so
// reattach when needed while preserving every visible world pose. The head slides the authored
// +X rail (contract: base -0.7, travel 1.4) as build progress; only lamp lenses are mutable.
export function bindWorksFabricatorHookHierarchy(group) {
  const hooks = group?.userData?.worksHooks || {};
  const head = hooks.gantry_head;
  const lamp = hooks.lamp;
  if (!head || !lamp) {
    throw new Error('[worksPartLoader] Fabricator is missing gantry_head or lamp marker');
  }
  const bindings = [
    [head, 'LOD0_Gantry'], [head, 'LOD1_Gantry'],
    [lamp, 'LOD0_Lamp'], [lamp, 'LOD1_Lamp'],
  ];
  const bound = [];
  for (const [parent, name] of bindings) {
    const child = group.getObjectByName(name);
    if (!child) throw new Error(`[worksPartLoader] Fabricator is missing ${name}`);
    if (child.parent !== parent) attachPreservingWorld(parent, child);
    bound.push(name);
  }
  group.userData.worksFabricatorBoundMeshes = bound;
  group.userData.worksFabricatorHooks = Object.freeze({
    gantry_head: head, lamp,
  });
  return group.userData.worksFabricatorHooks;
}

// PQ-131.09. The authored file already parents each LOD pair under its hook pivot; the release
// pipeline may flatten primitive matrices, so reattach when needed while preserving world pose.
export function bindWorksCargoPortHookHierarchy(group) {
  const hooks = group?.userData?.worksHooks || {};
  const names = ['cradle', 'crate_0', 'crate_1', 'crate_2', 'crate_3', 'crate_4', 'pod_root', 'pod_thruster'];
  const bound = {};
  for (const hookName of names) {
    const pivot = hooks[hookName];
    if (!pivot) throw new Error(`[worksPartLoader] Cargo port is missing ${hookName} marker`);
    // The berthed pod's authored meshes are named LOD[01]_pod under the pod_root pivot.
    const meshBase = hookName === 'pod_root' ? 'pod'
      : (hookName === 'pod_thruster' ? 'pod_thruster' : hookName);
    for (const lod of ['LOD0_', 'LOD1_']) {
      const child = group.getObjectByName(`${lod}${meshBase}`);
      if (!child) throw new Error(`[worksPartLoader] Cargo port is missing ${lod}${meshBase}`);
      if (child.parent !== pivot) attachPreservingWorld(pivot, child);
    }
    bound[hookName] = pivot;
  }
  group.userData.worksCargoPortBoundMeshes = names;
  group.userData.worksCargoPortHooks = Object.freeze(bound);
  return group.userData.worksCargoPortHooks;
}

function instantiateBlueprint(blueprint, hookNames, binding) {
  const root = new THREE.Group();
  root.name = blueprint.assetId || 'worksPart';
  root.userData.worksClone = true;

  const tagSeen = Object.create(null);
  const tagsPresent = [];
  let untagged = 0;
  const gpuResources = new Set();

  for (const prim of blueprint.primitives) {
    // A blueprint is cache/residency-owned. Clone only the material shell per instance so
    // state-driven lamp/bit/track updates cannot mutate another Rover or the cached source.
    const material = cloneMaterialForInstance(prim.material, prim.name, binding);
    const mesh = new THREE.Mesh(prim.geometry, material);
    mesh.name = prim.name;
    prim.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.worksShared = true;
    if (/(?:^|_)hopper_fill_[0-4]$/u.test(prim.name || '')) {
      mesh.userData.worksSemanticVisibility = true;
      mesh.userData.worksSemanticVisible = true;
    }
    const lod = (prim.tags && prim.tags.lod) || null;
    mesh.userData.worksLod = lod;
    if (!lod) untagged += 1;
    else if (!tagSeen[lod]) {
      tagSeen[lod] = true;
      tagsPresent.push(lod);
    }
    if (prim.geometry) gpuResources.add(prim.geometry);
    if (material) gpuResources.add(material);
    collectMaterialTextures(material, gpuResources);
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
  // A topology transaction owns these short-lived template retains. They are intentionally
  // separate from `live`: every cell gets a disposable clone, while a generation loads each
  // selected conduit URL once and shares the immutable atlas-backed blueprint.
  const conduitTemplates = new Map();

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
      conduitTemplateCount: conduitTemplates.size,
      conduitTemplateReferences: [...conduitTemplates.values()]
        .reduce((total, record) => total + record.refs, 0),
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
    if (group.userData?.worksReleased === true) return;
    group.userData.worksReleased = true;
    const idx = live.indexOf(group);
    if (idx >= 0) live.splice(idx, 1);
    disposeInstanceOwnedResources(group);
    releaseClone(group);
    released += 1;
  }

  function instantiateLoadedBlueprint(blueprint, entry, id, url, requestedRegister) {
    const hookNames = (entry.hooks || []).slice();
    if (blueprint.assetId && hookNames.indexOf(blueprint.assetId) < 0) {
      hookNames.push(blueprint.assetId);
    }
    const group = instantiateBlueprint(blueprint, hookNames, entry.binding);
    try {
      if (entry.binding === 'massline-core') bindMasslineCoreHookHierarchy(group);
      if (entry.binding === 'works-extractor') bindWorksExtractorHookHierarchy(group);
      if (entry.binding === 'works-refinery') bindWorksRefineryHookHierarchy(group);
      if (entry.binding === 'works-derrick') bindWorksDerrickHookHierarchy(group);
      if (entry.binding === 'works-gas-tap') bindWorksGasTapHookHierarchy(group);
      if (entry.binding === 'works-fabricator') bindWorksFabricatorHookHierarchy(group);
      if (entry.binding === 'works-cargo-port') bindWorksCargoPortHookHierarchy(group);
    } catch (error) {
      console.error('[worksPartLoader] authored part binding failed', error);
      disposeInstanceOwnedResources(group);
      releaseClone(group);
      failed += 1;
      return null;
    }
    applyLodVisibility(group, requestedRegister);
    group.userData.worksPartId = id;
    group.userData.worksUrl = url;
    group.userData.worksRequestedRegister = requestedRegister;
    live.push(group);
    loaded += 1;
    const tags = group.userData.worksLodTags || [];
    if (!tags.includes('lod1')) lod1Missing += 1;
    return group;
  }

  /**
   * Acquire one resident immutable blueprint per conduit asset URL for a topology generation.
   * A returned handle creates isolated cell clones; callers must release its clones before calling
   * `release()`.  This makes a stale generation unable to mutate or retain the next one.
   */
  async function acquireWorksConduitTemplates(ids, options = {}) {
    if (!Array.isArray(ids) || !ids.length) return null;
    if (new Set(ids).size !== ids.length) {
      throw new Error('[worksPartLoader] conduit template ids must be unique');
    }
    if (closed || !lease.isActive()) return null;
    const retained = [];
    const byId = new Map();
    const releaseRetained = () => {
      for (let i = retained.length - 1; i >= 0; i--) {
        const record = retained[i];
        if (record.refs > 0) record.refs -= 1;
        if (record.refs === 0 && conduitTemplates.get(record.url) === record) {
          conduitTemplates.delete(record.url);
        }
      }
      retained.length = 0;
    };
    try {
      for (const id of ids) {
        const entry = table[id];
        if (!entry || !/^works-conduit-(power|lane)$/u.test(entry.binding || '')) {
          throw new Error(`[worksPartLoader] ${id} is not an authored conduit part`);
        }
        const url = selectUrl(entry, register);
        let record = conduitTemplates.get(url);
        if (!record) {
          record = {
            id,
            entry,
            url,
            refs: 0,
            blueprint: null,
            promise: null,
          };
          record.promise = Promise.resolve(lease.load(url, {
            slot: entry.slot || 'place',
            optional: true,
            ...(options || {}),
          })).then((blueprint) => {
            if (!blueprint || !Array.isArray(blueprint.primitives)) {
              throw new Error(`[worksPartLoader] conduit template ${id} resolved no mesh primitives`);
            }
            record.blueprint = blueprint;
            return blueprint;
          });
          conduitTemplates.set(url, record);
        }
        record.refs += 1;
        retained.push(record);
        const blueprint = await record.promise;
        if (closed || !lease.isActive()) throw new Error('[worksPartLoader] conduit loader retired');
        if (!blueprint || !record.blueprint) {
          throw new Error(`[worksPartLoader] conduit template ${id} is unavailable`);
        }
        byId.set(id, record);
      }
    } catch (error) {
      failed += 1;
      releaseRetained();
      throw error;
    }

    let templateReleased = false;
    return Object.freeze({
      ids: Object.freeze(ids.slice()),
      instantiate(id) {
        if (templateReleased || closed || !lease.isActive()) return null;
        const record = byId.get(id);
        if (!record || !record.blueprint) return null;
        return instantiateLoadedBlueprint(record.blueprint, record.entry, id, record.url, register);
      },
      release() {
        if (templateReleased) return false;
        templateReleased = true;
        releaseRetained();
        return true;
      },
    });
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

    // Rover/Core combined release files carry both live LOD roots.  A register
    // flip while that one URL is pending must consume the returned blueprint at
    // the current register, not spend the retry budget reloading identical
    // bytes and then leave the machine absent on a second flip.  Distinct LOD
    // URLs still retry so the selected source actually changes.
    if (register !== requestedRegister && selectUrl(entry, register) !== url) {
      if (attempt >= 1) return null;
      return loadWorksPart(id, options, attempt + 1);
    }
    return instantiateLoadedBlueprint(blueprint, entry, id, url, register);
  }

  function dispose(reason = 'works-screen-exit') {
    if (closed) return 0;
    closed = true;
    const gpu = new Set();
    for (let i = 0; i < live.length; i++) collectGroupGpuResources(live[i], gpu);
    while (live.length) releaseWorksPart(live[live.length - 1]);
    conduitTemplates.clear();
    lease.release(reason);
    for (const resource of gpu) disposeRendererBoundResource(resource);
    return disposeAuthoredAssetRuntime(renderer);
  }

  return Object.freeze({
    loadWorksPart,
    acquireWorksConduitTemplates,
    releaseWorksPart,
    setRegister,
    stats,
    dispose,
  });
}
