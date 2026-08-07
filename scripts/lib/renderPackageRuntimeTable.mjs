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
// one Object3D per glTF node, children in declaration order, `extras` surfaced as `userData`, meshes
// as THREE.Mesh with a placeholder geometry and a material carrying the authored *name* — and derive
// from that. This is the same reconstruction `check-render-package-instance-plan.mjs` already runs
// against all 26 shipping packages.
//
// The reconstruction cannot silently diverge from the real decode: every table entry carries the
// node's `name` alongside its `planIndex`, and the shipping binder asserts the two agree against the
// flat instance plan built from the genuinely decoded graph. A wrong reconstruction fails loudly on
// first load rather than binding the wrong node.

import { readFile } from 'node:fs/promises';

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
 * Multi-root scenes matter: GLTFLoader returns a Group wrapping the roots, and the flat instance
 * plan's index 0 is that Group. A single-root scene has no wrapper. Getting this wrong shifts every
 * plan index by one, so it mirrors the loader's rule exactly.
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
  // The node claims its name FIRST, then its mesh. So for a single-primitive mesh — where the node
  // *is* the mesh and is renamed to the node name afterwards — the node keeps the raw authored name
  // and the mesh's suffixed name is discarded. Mesh-derived names only survive on multi-primitive
  // meshes, whose sibling Meshes take `name`, `name_1`, `name_2`, … in primitive order.
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
  const buildMeshObject = (meshIndex, nodeIsNamed) => {
    const meshDef = meshes[meshIndex] || {};
    const primitives = meshDef.primitives || [];
    const single = primitives.length === 1;
    const built = primitives.map((primitive) => {
      const mesh = new THREE.Mesh(geometryFor(primitive), materialFor(primitive));
      // A single-primitive mesh *becomes* the node and is renamed to the node's name, so its own
      // name never reaches the runtime and must not consume a slot the node already took. Only
      // multi-primitive siblings — and an unnamed node's lone mesh — keep mesh-derived names.
      if (!single || !nodeIsNamed) mesh.name = claimName(meshDef.name || `mesh_${meshIndex}`);
      if (meshDef.extras) mesh.userData = { ...meshDef.extras };
      return mesh;
    });
    if (built.length === 1) return built[0];
    const group = new THREE.Group();
    for (const mesh of built) group.add(mesh);
    return group;
  };

  const build = (index) => {
    const record = nodes[index];
    // Reserve the node's name before its mesh dependency, exactly as GLTFLoader does.
    const nodeName = record.name ? claimName(record.name) : '';
    const object = record.mesh === undefined
      ? new THREE.Object3D()
      : buildMeshObject(record.mesh, !!record.name);
    if (record.name) object.name = nodeName;
    if (record.extras) object.userData = { ...object.userData, ...record.extras };
    applyNodeTransform(object, record);
    for (const child of record.children || []) object.add(build(child));
    return object;
  };

  const sceneRecord = (json.scenes || [])[json.scene ?? 0];
  const roots = (sceneRecord && sceneRecord.nodes) || [];
  if (roots.length === 1) return build(roots[0]);
  const scene = new THREE.Group();
  scene.name = (sceneRecord && sceneRecord.name) || 'Scene';
  for (const root of roots) scene.add(build(root));
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
