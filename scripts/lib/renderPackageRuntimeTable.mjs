// Build the render-package v2 runtime table offline, from a compiled render.glb.
//
// WHY A RECONSTRUCTED GRAPH INSTEAD OF A REAL DECODE
// --------------------------------------------------
// The runtime table is derived by `deriveAuthoredRuntimeTable`, which is the *same* function the
// runtime semantics live in — there is deliberately no second implementation to drift against. That
// function reads node names, `userData`, the parent chain, slot, and material names. It reads no
// vertex buffers and no texture bytes.
//
// A real GLTFLoader decode would drag in KTX2/BasisU transcoding, which needs a WebGL context and so
// cannot run in the compiler. So we rebuild exactly the node graph GLTFLoader would materialise —
// one scene Group plus one Object3D per glTF node, children in declaration order, `extras` surfaced
// as `userData`, meshes as THREE.Mesh with a placeholder geometry and a material carrying the
// authored *name* — and derive from that. This is the same reconstruction
// `check-render-package-instance-plan.mjs` runs against every shipping package.
//
// The reconstruction cannot silently diverge from the real decode: every table entry carries the
// node's `name` alongside its `planIndex`, and the shipping binder asserts the two agree against the
// flat instance plan built from the genuinely decoded graph. A wrong reconstruction fails loudly on
// first load rather than binding the wrong node.

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import * as THREE from 'three';

import { deriveAuthoredRuntimeTable } from '../../src/render/assetLoader.js';

const GLB_MAGIC = 0x46546c67;

/** Read a GLB container's JSON chunk without touching its binary payload. */
export function readGlbJson(buffer) {
  if (buffer.readUInt32LE(0) !== GLB_MAGIC) throw new Error('not a GLB container');
  const jsonLength = buffer.readUInt32LE(12);
  return JSON.parse(buffer.subarray(20, 20 + jsonLength).toString('utf8'));
}

/**
 * Rebuild the scene graph GLTFLoader would produce for this document.
 *
 * GLTFLoader r184 always returns a Group for a glTF scene, even when the scene declares one root.
 * The flat instance plan's index 0 is that Group. It also reserves the sanitised scene name and
 * assigns scene extras before requesting node dependencies, so mirror that order exactly: getting
 * any of it wrong can shift plan indices or unique node names and bind runtime metadata incorrectly.
 */
export function sceneFromGlbJson(json) {
  const nodes = json.nodes || [];
  const meshes = json.meshes || [];
  const materials = json.materials || [];

  // Material profiles gate texture-bearing roles on whether the mesh actually has UVs
  // (`geometry.getAttribute('uv')`). The placeholder geometry carries no vertex data, so mirror only
  // that one fact from the glTF accessor declaration — otherwise every material would resolve as
  // untextured offline and the shipped roles would disagree with what the runtime would have chosen.
  const geometryFor = (primitive) => {
    const geometry = new THREE.BufferGeometry();
    if (primitive.attributes && primitive.attributes.TEXCOORD_0 !== undefined) {
      geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(0), 2));
    }
    return geometry;
  };

  const materialFor = (primitive) => {
    const source = primitive.material === undefined ? null : materials[primitive.material];
    const material = new THREE.MeshStandardMaterial();
    if (source) {
      material.name = source.name || '';
      if (source.extras) material.userData = { ...source.extras };
    }
    return material;
  };

  // GLTFLoader sanitises names before use; tags are derived from names, so the reconstruction has to
  // apply the same transformation or a tag can differ from what ships.
  const sanitize = (name) => String(name || '').replace(/\s/g, '_').replace(/[[\].:/]/g, '');

  // GLTFLoader.createUniqueName appends _1, _2, … to repeated names. It matters here because a
  // package's runtime node names are what tags are derived from and what the binder asserts against.
  //
  // The ordering is settled by GLTFLoader's own comment at loadNode:
  //   "reserve node's name before its dependencies, so the root has the intended name."
  // loadNode then requests child nodes synchronously while loadMesh names materialise asynchronously.
  // Reserve the whole node tree first, then claim mesh names in dependency order. Even a named
  // single-primitive node still consumes its mesh name before _loadNodeShallow overwrites the final
  // object.name. Shared mesh dependencies consume names once and clone the already-named object.
  const namesUsed = new Map();
  const claimName = (name) => {
    const sanitized = sanitize(name);
    if (!sanitized) return sanitized;
    if (!namesUsed.has(sanitized)) {
      namesUsed.set(sanitized, 0);
      return sanitized;
    }
    const next = namesUsed.get(sanitized) + 1;
    namesUsed.set(sanitized, next);
    return `${sanitized}_${next}`;
  };

  /**
   * Mirror GLTFLoader.loadMesh: one Mesh per glTF primitive, and when a mesh has more than one
   * primitive the result is a Group wrapping them. That extra Group/Mesh layer is real — it is part
   * of the decoded scene and therefore part of the flat instance plan — so omitting it would shift
   * every subsequent plan index. Child meshes take their userData from the MESH def; the node def's
   * extras land on the node itself.
   */
  const meshReferences = new Map();
  for (const record of nodes) {
    if (record?.mesh === undefined) continue;
    meshReferences.set(record.mesh, (meshReferences.get(record.mesh) || 0) + 1);
  }
  const meshDependencies = new Map();
  const meshUses = new Map();

  const buildMeshDependency = (meshIndex) => {
    if (meshDependencies.has(meshIndex)) return meshDependencies.get(meshIndex);
    const meshDef = meshes[meshIndex] || {};
    const primitives = meshDef.primitives || [];
    const built = primitives.map((primitive) => {
      const mesh = new THREE.Mesh(geometryFor(primitive), materialFor(primitive));
      mesh.name = claimName(meshDef.name || `mesh_${meshIndex}`);
      if (meshDef.extras) mesh.userData = { ...meshDef.extras };
      return mesh;
    });
    const dependency = built.length === 1 ? built[0] : new THREE.Group();
    if (built.length !== 1) {
      for (const mesh of built) dependency.add(mesh);
    }
    meshDependencies.set(meshIndex, dependency);
    return dependency;
  };

  const meshObjectForNode = (meshIndex) => {
    const dependency = buildMeshDependency(meshIndex);
    if ((meshReferences.get(meshIndex) || 0) <= 1) return dependency;
    const object = dependency.clone(true);
    const use = meshUses.get(meshIndex) || 0;
    meshUses.set(meshIndex, use + 1);
    object.name += `_instance_${use}`;
    return object;
  };

  const reserveNode = (index) => {
    const record = nodes[index];
    const nodeName = record.name ? claimName(record.name) : '';
    return {
      record,
      nodeName,
      children: (record.children || []).map(reserveNode),
    };
  };

  const materializeNode = ({ record, nodeName, children }) => {
    const object = record.mesh === undefined
      ? new THREE.Object3D()
      : meshObjectForNode(record.mesh);
    if (record.name) {
      object.userData.name = record.name;
      object.name = nodeName;
    }
    if (record.extras && typeof record.extras === 'object') Object.assign(object.userData, record.extras);
    applyNodeTransform(object, record);
    for (const child of children) object.add(materializeNode(child));
    return object;
  };

  const sceneRecord = (json.scenes || [])[json.scene ?? 0];
  const roots = (sceneRecord && sceneRecord.nodes) || [];
  const scene = new THREE.Group();
  if (sceneRecord?.name) scene.name = claimName(sceneRecord.name);
  if (sceneRecord?.extras && typeof sceneRecord.extras === 'object') {
    scene.userData = { ...sceneRecord.extras };
  }
  const reservedRoots = roots.map(reserveNode);
  for (const root of reservedRoots) scene.add(materializeNode(root));
  return scene;
}

function applyNodeTransform(object, record) {
  if (Array.isArray(record.matrix) && record.matrix.length === 16) {
    object.matrix.fromArray(record.matrix);
    object.matrix.decompose(object.position, object.quaternion, object.scale);
    object.matrixAutoUpdate = true;
    return;
  }
  if (Array.isArray(record.translation)) object.position.fromArray(record.translation);
  if (Array.isArray(record.rotation)) object.quaternion.fromArray(record.rotation);
  if (Array.isArray(record.scale)) object.scale.fromArray(record.scale);
}

/**
 * Derive the runtime table for one compiled render.glb.
 *
 * `bounds` from this pass are geometry-free and therefore meaningless — the placeholder geometry has
 * no vertices. Real bounds come from the compiler's own per-primitive bounds, which it computes from
 * the actual accessors, and are grafted on by the caller via `boundsOverride`.
 */
export async function buildRuntimeTableForRenderGlb(renderGlbPath, options = {}) {
  const json = readGlbJson(await readFile(renderGlbPath));
  const scene = sceneFromGlbJson(json);
  const assetExtras = json.asset?.extras || {};
  const table = deriveAuthoredRuntimeTable(scene, {
    url: options.url || '',
    slot: options.slot || null,
    legacyPart: (assetExtras.spacefaceAsset?.legacyPart ?? assetExtras.legacyPart) === true,
    // Material-role inference is assetId-sensitive, and the rebuilt scene root carries node extras
    // rather than the glTF asset extras readAssetMetadata would consult, so pass it explicitly.
    assetId: options.assetId || assetExtras.spacefaceAsset?.assetId || assetExtras.assetId || null,
  });
  if (options.boundsOverride) table.bounds = options.boundsOverride;
  return table;
}

/**
 * Seal a motion-bank reference into the runtime table (ANI-00 authored rigid-part motion).
 *
 * A compiled package that still carries MOTION_ pivots is telling the runtime "these nodes are
 * owned by an authored clip bank" — so the bank MUST exist and MUST describe this exact node
 * graph. Every binding node must be present in the compiled package and its sealed rest pose
 * must match the compiled local transform (within float drift); the uri/sha256/bytes are then
 * sealed under runtimeHash. Fails closed: MOTION_ pivots with no usable bank are a build error,
 * never a silent runtime skip.
 *
 * Shared by the package compiler and the release/bundle verifier so the expected runtime table
 * is derived the same way on both sides of the equality check.
 */
export async function sealMotionBankRef(pilot, metadata, { repoRoot } = {}) {
  const motionNodes = (metadata.nodes || [])
    .filter((node) => String(node.nodeName || '').startsWith('MOTION_'));
  const bankPath = join(repoRoot, 'assets/ships/motions', `${pilot.key}.motion.json`);
  if (motionNodes.length === 0) return null;
  if (!existsSync(bankPath)) {
    throw new Error(
      `${pilot.key}: compiled GLB declares ${motionNodes.length} MOTION_ pivot(s) but no bank exists at ${bankPath}`,
    );
  }
  const bankBytes = await readFile(bankPath);
  let bank;
  try {
    bank = JSON.parse(bankBytes.toString('utf8'));
  } catch (error) {
    throw new Error(`${pilot.key}: motion bank is not valid JSON: ${error.message}`);
  }
  if (bank.schema !== 'spaceface.rigidMotionBank.v1' || !Array.isArray(bank.bindings)) {
    throw new Error(`${pilot.key}: motion bank schema mismatch at ${bankPath}`);
  }
  const EPS = 1e-4;
  const near = (a, b) => Math.abs((a || 0) - (b || 0)) <= EPS;
  const byName = new Map((metadata.nodes || []).map((node) => [node.nodeName, node]));
  for (const binding of bank.bindings) {
    const node = byName.get(binding.node);
    if (!node) {
      throw new Error(`${pilot.key}: bank binding ${binding.node} has no node in the compiled package`);
    }
    const trs = decomposeLocalTrs(node.localTransform);
    const rest = binding.restPose || {};
    const restT = rest.translation || [0, 0, 0];
    const restS = rest.scale || [1, 1, 1];
    const restR = rest.rotation || [0, 0, 0, 1];
    if (!restT.every((v, i) => near(v, trs.t[i])) || !restS.every((v, i) => near(v, trs.s[i]))) {
      throw new Error(
        `${pilot.key}: bank rest pose for ${binding.node} drifts from the compiled GLB local transform`,
      );
    }
    // q ≡ -q: compare absolute components.
    if (!restR.every((v, i) => near(Math.abs(v), Math.abs(trs.q[i])))) {
      throw new Error(
        `${pilot.key}: bank rest rotation for ${binding.node} drifts from the compiled GLB local transform`,
      );
    }
  }
  return {
    uri: `assets/ships/motions/${pilot.key}.motion.json`,
    sha256: createHash('sha256').update(bankBytes).digest('hex'),
    bytes: bankBytes.length,
    rigId: bank.rigId,
  };
}

function decomposeLocalTrs(m) {
  const t = [m[12], m[13], m[14]];
  const c0 = [m[0], m[1], m[2]];
  const c1 = [m[4], m[5], m[6]];
  const c2 = [m[8], m[9], m[10]];
  const s = [len3(c0), len3(c1), len3(c2)];
  const det = c0[0] * (c1[1] * c2[2] - c1[2] * c2[1])
    - c0[1] * (c1[0] * c2[2] - c1[2] * c2[0])
    + c0[2] * (c1[0] * c2[1] - c1[1] * c2[0]);
  if (det < 0) s[0] = -s[0];
  const r00 = c0[0] / s[0]; const r01 = c1[0] / s[1]; const r02 = c2[0] / s[2];
  const r10 = c0[1] / s[0]; const r11 = c1[1] / s[1]; const r12 = c2[1] / s[2];
  const r20 = c0[2] / s[0]; const r21 = c1[2] / s[1]; const r22 = c2[2] / s[2];
  const trace = r00 + r11 + r22;
  let x; let y; let z; let w;
  if (trace > 0) {
    const k = Math.sqrt(trace + 1) * 2;
    w = k / 4; x = (r21 - r12) / k; y = (r02 - r20) / k; z = (r10 - r01) / k;
  } else if (r00 > r11 && r00 > r22) {
    const k = Math.sqrt(1 + r00 - r11 - r22) * 2;
    w = (r21 - r12) / k; x = k / 4; y = (r01 + r10) / k; z = (r02 + r20) / k;
  } else if (r11 > r22) {
    const k = Math.sqrt(1 + r11 - r00 - r22) * 2;
    w = (r02 - r20) / k; x = (r01 + r10) / k; y = k / 4; z = (r12 + r21) / k;
  } else {
    const k = Math.sqrt(1 + r22 - r00 - r11) * 2;
    w = (r10 - r01) / k; x = (r02 + r20) / k; y = (r12 + r21) / k; z = k / 4;
  }
  return { t, s, q: [x, y, z, w] };
}

function len3(v) {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}
