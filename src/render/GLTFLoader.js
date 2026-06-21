// SpaceFace's deliberately small glTF 2.0 loader.
//
// The project ships without a bundler and cannot assume that three/addons/loaders/GLTFLoader.js is
// available at runtime. This loader implements the exact, standards-based subset emitted by
// tools/art/generate_ship_parts_library.py: binary GLB, indexed triangle primitives, embedded PNGs,
// PBR metallic/roughness materials, texture transforms through ordinary UVs, and node hierarchies.
// It is intentionally failure-explicit: unsupported compression, sparse accessors, or animation data
// throw a useful error so the visual override can retain the procedural fallback.
import * as THREE from 'three';

const COMPONENT = Object.freeze({
  5120: Int8Array,
  5121: Uint8Array,
  5122: Int16Array,
  5123: Uint16Array,
  5125: Uint32Array,
  5126: Float32Array,
});

const ITEMS = Object.freeze({ SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 });
const WRAP = Object.freeze({
  33071: THREE.ClampToEdgeWrapping,
  33648: THREE.MirroredRepeatWrapping,
  10497: THREE.RepeatWrapping,
});
const FILTER = Object.freeze({
  9728: THREE.NearestFilter,
  9729: THREE.LinearFilter,
  9984: THREE.NearestMipmapNearestFilter,
  9985: THREE.LinearMipmapNearestFilter,
  9986: THREE.NearestMipmapLinearFilter,
  9987: THREE.LinearMipmapLinearFilter,
});

function assert(condition, message) {
  if (!condition) throw new Error(`[ShipPartGLTFLoader] ${message}`);
}

function parseGlb(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  assert(view.byteLength >= 20, 'GLB is truncated');
  assert(view.getUint32(0, true) === 0x46546c67, 'bad GLB magic');
  assert(view.getUint32(4, true) === 2, 'only glTF 2.0 is supported');
  assert(view.getUint32(8, true) === view.byteLength, 'GLB declared length does not match payload');

  let offset = 12;
  let json = null;
  let binary = null;
  while (offset + 8 <= view.byteLength) {
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    offset += 8;
    assert(offset + length <= view.byteLength, 'GLB chunk overruns payload');
    if (type === 0x4e4f534a) {
      json = JSON.parse(new TextDecoder().decode(new Uint8Array(arrayBuffer, offset, length)).trim());
    } else if (type === 0x004e4942) {
      binary = new Uint8Array(arrayBuffer, offset, length);
    }
    offset += length;
  }
  assert(json, 'missing JSON chunk');
  assert(binary, 'missing BIN chunk');
  return { json, binary };
}

function createTypedArray(binary, viewDef, accessorDef) {
  assert(!accessorDef.sparse, 'sparse accessors are not supported');
  const Ctor = COMPONENT[accessorDef.componentType];
  assert(Ctor, `unsupported component type ${accessorDef.componentType}`);
  const itemSize = ITEMS[accessorDef.type];
  assert(itemSize, `unsupported accessor type ${accessorDef.type}`);
  const count = accessorDef.count * itemSize;
  const byteOffset = binary.byteOffset + (viewDef.byteOffset || 0) + (accessorDef.byteOffset || 0);
  const elementBytes = Ctor.BYTES_PER_ELEMENT;
  assert(byteOffset % elementBytes === 0, `misaligned accessor at byte ${byteOffset}`);

  if (!viewDef.byteStride || viewDef.byteStride === itemSize * elementBytes) {
    return { array: new Ctor(binary.buffer, byteOffset, count), itemSize };
  }

  // General interleaved fallback. The generated library does not currently need this path, but it
  // makes the loader tolerant of a modeler re-exporting an asset through Blender.
  assert(viewDef.byteStride % elementBytes === 0, 'byteStride is not component-aligned');
  const stride = viewDef.byteStride / elementBytes;
  const source = new Ctor(binary.buffer, byteOffset, (accessorDef.count - 1) * stride + itemSize);
  const packed = new Ctor(count);
  for (let i = 0; i < accessorDef.count; i++) {
    for (let c = 0; c < itemSize; c++) packed[i * itemSize + c] = source[i * stride + c];
  }
  return { array: packed, itemSize };
}

function applySampler(texture, sampler = {}) {
  texture.magFilter = FILTER[sampler.magFilter] || THREE.LinearFilter;
  texture.minFilter = FILTER[sampler.minFilter] || THREE.LinearMipmapLinearFilter;
  texture.wrapS = WRAP[sampler.wrapS] || THREE.RepeatWrapping;
  texture.wrapT = WRAP[sampler.wrapT] || THREE.RepeatWrapping;
  texture.flipY = false;
  texture.needsUpdate = true;
  return texture;
}

async function createTexture(json, binary, textureIndex, colorSpace, cache, objectUrls) {
  if (textureIndex == null) return null;
  const key = `${textureIndex}:${colorSpace || 'linear'}`;
  if (cache.has(key)) return cache.get(key);
  const promise = (async () => {
    const textureDef = json.textures && json.textures[textureIndex];
    assert(textureDef, `missing texture ${textureIndex}`);
    const imageDef = json.images && json.images[textureDef.source];
    assert(imageDef, `missing image ${textureDef.source}`);
    assert(imageDef.bufferView != null, 'only embedded bufferView images are supported');
    const bufferView = json.bufferViews[imageDef.bufferView];
    const start = (bufferView.byteOffset || 0);
    const bytes = binary.slice(start, start + bufferView.byteLength);
    const blob = new Blob([bytes], { type: imageDef.mimeType || 'image/png' });
    const url = URL.createObjectURL(blob);
    objectUrls.push(url);
    const texture = await new THREE.TextureLoader().loadAsync(url);
    texture.name = imageDef.name || `gltf-image-${textureDef.source}`;
    texture.colorSpace = colorSpace || THREE.NoColorSpace;
    texture.anisotropy = 4;
    applySampler(texture, (json.samplers && json.samplers[textureDef.sampler]) || {});
    return texture;
  })();
  cache.set(key, promise);
  return promise;
}

async function createMaterials(json, binary, textureCache, objectUrls) {
  const defs = json.materials || [];
  return Promise.all(defs.map(async (def, index) => {
    const pbr = def.pbrMetallicRoughness || {};
    const ext = def.extensions || {};
    const physical = !!(ext.KHR_materials_transmission || ext.KHR_materials_ior || ext.KHR_materials_clearcoat);
    const Material = physical ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
    const base = pbr.baseColorFactor || [1, 1, 1, 1];
    const material = new Material({
      name: def.name || `gltf-material-${index}`,
      color: new THREE.Color(base[0], base[1], base[2]),
      opacity: base[3] == null ? 1 : base[3],
      roughness: pbr.roughnessFactor == null ? 1 : pbr.roughnessFactor,
      metalness: pbr.metallicFactor == null ? 1 : pbr.metallicFactor,
      transparent: def.alphaMode === 'BLEND' || (base[3] != null && base[3] < 1),
      alphaTest: def.alphaMode === 'MASK' ? (def.alphaCutoff == null ? 0.5 : def.alphaCutoff) : 0,
      side: def.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
    });
    if (material.transparent) material.depthWrite = material.opacity >= 0.98;

    if (pbr.baseColorTexture) {
      material.map = await createTexture(json, binary, pbr.baseColorTexture.index, THREE.SRGBColorSpace, textureCache, objectUrls);
    }
    if (pbr.metallicRoughnessTexture) {
      const orm = await createTexture(json, binary, pbr.metallicRoughnessTexture.index, THREE.NoColorSpace, textureCache, objectUrls);
      material.metalnessMap = orm;
      material.roughnessMap = orm;
    }
    if (def.normalTexture) {
      material.normalMap = await createTexture(json, binary, def.normalTexture.index, THREE.NoColorSpace, textureCache, objectUrls);
      material.normalScale.setScalar(def.normalTexture.scale == null ? 1 : def.normalTexture.scale);
    }
    if (def.occlusionTexture) {
      material.aoMap = await createTexture(json, binary, def.occlusionTexture.index, THREE.NoColorSpace, textureCache, objectUrls);
      material.aoMapIntensity = def.occlusionTexture.strength == null ? 1 : def.occlusionTexture.strength;
    }
    if (def.emissiveFactor) {
      material.emissive = new THREE.Color(def.emissiveFactor[0], def.emissiveFactor[1], def.emissiveFactor[2]);
      material.emissiveIntensity = (ext.KHR_materials_emissive_strength && ext.KHR_materials_emissive_strength.emissiveStrength) || 1;
    }
    if (def.emissiveTexture) {
      material.emissiveMap = await createTexture(json, binary, def.emissiveTexture.index, THREE.SRGBColorSpace, textureCache, objectUrls);
    }
    if (physical) {
      const transmission = ext.KHR_materials_transmission;
      const ior = ext.KHR_materials_ior;
      const clearcoat = ext.KHR_materials_clearcoat;
      if (transmission) material.transmission = transmission.transmissionFactor || 0;
      if (ior && ior.ior) material.ior = ior.ior;
      if (clearcoat) {
        material.clearcoat = clearcoat.clearcoatFactor || 0;
        material.clearcoatRoughness = clearcoat.clearcoatRoughnessFactor || 0;
      }
      material.thickness = 0.02;
    }
    material.userData.gltfExtras = def.extras || {};
    material.needsUpdate = true;
    return material;
  }));
}

function createGeometries(json, binary) {
  const accessorCache = new Map();
  function attribute(index) {
    if (accessorCache.has(index)) return accessorCache.get(index);
    const def = json.accessors[index];
    assert(def && def.bufferView != null, `missing accessor ${index}`);
    const packed = createTypedArray(binary, json.bufferViews[def.bufferView], def);
    const attr = new THREE.BufferAttribute(packed.array, packed.itemSize, !!def.normalized);
    accessorCache.set(index, attr);
    return attr;
  }

  return (json.meshes || []).map((meshDef, meshIndex) => {
    const primitives = meshDef.primitives || [];
    return primitives.map((primitive, primitiveIndex) => {
      assert((primitive.mode == null ? 4 : primitive.mode) === 4, 'only TRIANGLES primitives are supported');
      const geometry = new THREE.BufferGeometry();
      const attributes = primitive.attributes || {};
      for (const [semantic, accessorIndex] of Object.entries(attributes)) {
        const name = semantic === 'POSITION' ? 'position'
          : semantic === 'NORMAL' ? 'normal'
          : semantic === 'TANGENT' ? 'tangent'
          : semantic === 'TEXCOORD_0' ? 'uv'
          : semantic === 'TEXCOORD_1' ? 'uv1'
          : null;
        if (name) geometry.setAttribute(name, attribute(accessorIndex));
      }
      assert(geometry.getAttribute('position'), `mesh ${meshIndex}/${primitiveIndex} has no POSITION`);
      if (primitive.indices != null) geometry.setIndex(attribute(primitive.indices));
      if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
      if (geometry.getAttribute('uv') && !geometry.getAttribute('uv1')) {
        geometry.setAttribute('uv1', geometry.getAttribute('uv'));
      }
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      geometry.name = meshDef.name || `gltf-mesh-${meshIndex}`;
      geometry.userData.gltfExtras = meshDef.extras || {};
      return { geometry, materialIndex: primitive.material == null ? 0 : primitive.material };
    });
  });
}

function instantiateMesh(meshPrimitives, materials, name) {
  if (meshPrimitives.length === 1) {
    const p = meshPrimitives[0];
    const mesh = new THREE.Mesh(p.geometry, materials[p.materialIndex]);
    mesh.name = name;
    return mesh;
  }
  const group = new THREE.Group();
  group.name = name;
  meshPrimitives.forEach((p, i) => {
    const mesh = new THREE.Mesh(p.geometry, materials[p.materialIndex]);
    mesh.name = `${name}_primitive_${i}`;
    group.add(mesh);
  });
  return group;
}

function createNodes(json, geometries, materials) {
  const defs = json.nodes || [];
  const nodes = defs.map((def, i) => {
    const object = def.mesh == null
      ? new THREE.Object3D()
      : instantiateMesh(geometries[def.mesh], materials, def.name || `gltf-node-${i}`);
    object.name = def.name || `gltf-node-${i}`;
    if (def.translation) object.position.fromArray(def.translation);
    if (def.rotation) object.quaternion.fromArray(def.rotation);
    if (def.scale) object.scale.fromArray(def.scale);
    object.userData = { ...object.userData, ...(def.extras || {}), gltfNodeIndex: i };
    return object;
  });
  defs.forEach((def, i) => {
    for (const child of def.children || []) nodes[i].add(nodes[child]);
  });
  return nodes;
}

export class GLTFLoader {
  constructor(manager = THREE.DefaultLoadingManager) {
    this.manager = manager;
  }

  load(url, onLoad, onProgress, onError) {
    this.loadAsync(url, onProgress).then(onLoad).catch((error) => {
      if (onError) onError(error);
      else console.error(error);
    });
  }

  async loadAsync(url, onProgress) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`[ShipPartGLTFLoader] ${response.status} loading ${url}`);
    const buffer = await response.arrayBuffer();
    if (onProgress) onProgress({ loaded: buffer.byteLength, total: buffer.byteLength, lengthComputable: true });
    return this.parseAsync(buffer, url);
  }

  async parseAsync(arrayBuffer, sourceUrl = '') {
    const { json, binary } = parseGlb(arrayBuffer);
    assert(!(json.extensionsRequired || []).some((name) => name === 'KHR_draco_mesh_compression' || name === 'EXT_meshopt_compression'),
      'compressed mesh extensions are not supported by the ship-parts loader');
    const textureCache = new Map();
    const objectUrls = [];
    try {
      const materials = await createMaterials(json, binary, textureCache, objectUrls);
      const geometries = createGeometries(json, binary);
      const nodes = createNodes(json, geometries, materials);
      const scenes = (json.scenes || [{ nodes: [] }]).map((sceneDef, i) => {
        const scene = new THREE.Group();
        scene.name = sceneDef.name || `gltf-scene-${i}`;
        for (const nodeIndex of sceneDef.nodes || []) scene.add(nodes[nodeIndex]);
        scene.userData.gltfExtras = sceneDef.extras || {};
        return scene;
      });
      const scene = scenes[json.scene || 0] || scenes[0];
      scene.userData.gltfAsset = json.asset || {};
      scene.userData.sourceUrl = sourceUrl;
      return { scene, scenes, parser: { json } };
    } finally {
      // Textures are fully uploaded by TextureLoader before its promise resolves; object URLs can go.
      for (const url of objectUrls) URL.revokeObjectURL(url);
    }
  }
}
