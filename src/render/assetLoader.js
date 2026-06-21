// Runtime authored-asset boundary for SpaceFace ship parts.
//
// This module deliberately owns transport, caching and authoring validation — not composition.
// `partsLibrary.js` consumes immutable part blueprints from here and decides where parts mount.
// The game keeps a synchronous visual-factory contract, so loads are started only after a real
// renderer is available; callers always retain their procedural fallback while this Promise resolves.
import * as THREE from '../../vendor/three.module.js';

export const ASSET_AUTHORING_CONTRACT = Object.freeze({
  version: 1,
  coordinates: Object.freeze({ handedness: 'right', forward: '+X', up: '+Y', starboard: '+Z', unit: 'metre' }),
  rootExtras: Object.freeze({
    key: 'spacefaceAsset',
    required: Object.freeze({
      contractVersion: 1,
      slot: 'hull | cockpit | engine | fin',
      forward: '+X', up: '+Y', starboard: '+Z', unit: 'metre',
      normalConvention: 'OpenGL',
      ormChannels: 'R=AO,G=Roughness,B=Metallic',
      textureCompression: 'KTX2/BasisU',
      chamfered: true,
    }),
  }),
  textures: Object.freeze({
    baseColor: 'sRGB',
    normal: 'tangent-space, OpenGL green-up',
    orm: 'AO/Roughness/Metallic packed into R/G/B',
    minResolution: 1024,
    maxResolution: 2048,
    requiredContainer: 'KTX2/BasisU via KHR_texture_basisu',
  }),
  tintRoles: Object.freeze(['hull', 'dark', 'accent', 'thruster', 'none']),
  canopy: Object.freeze({ material: 'MeshPhysicalMaterial', transmission: 0.6, ior: 1.4, clearcoat: 1.0 }),
  topology: Object.freeze({ chamferedOrBeveledRequired: true, reason: 'machined highlights are part of the runtime contract' }),
  runtime: Object.freeze({
    gltfLoader: 'three/addons/loaders/GLTFLoader.js',
    ktx2Loader: 'three/addons/loaders/KTX2Loader.js',
    basisTranscoder: 'vendor/addons/libs/basis/{basis_transcoder.js,basis_transcoder.wasm}',
  }),
  nodeNames: Object.freeze({
    sockets: 'SOCKET_*',
    drive: 'HOOK_DRIVE_FAN | HOOK_DRIVE_CORE | HOOK_DRIVE_PLUME',
    damage: 'HOOK_NAV_* | HOOK_SENSOR_* | HOOK_ARMOR_* | HOOK_SECONDARY_*',
    mounts: 'MOUNT_COCKPIT | MOUNT_ENGINE_* | MOUNT_FIN_*',
    lod: 'LOD0_* | LOD1_* | LOD2_*',
  }),
});

const runtimeByRenderer = new WeakMap();
const warned = new Set();
const _inverseRoot = new THREE.Matrix4();
const _relative = new THREE.Matrix4();
const _bounds = new THREE.Box3();
const _boundsSize = new THREE.Vector3();
const _boundsCenter = new THREE.Vector3();
const _transformPosition = new THREE.Vector3();
const _transformQuaternion = new THREE.Quaternion();
const _transformScale = new THREE.Vector3();
const _recomposed = new THREE.Matrix4();

export class AssetContractError extends Error {
  constructor(url, errors, warnings = []) {
    super(`[assetLoader] ${url} violates the authored-part contract:\n- ${errors.join('\n- ')}`);
    this.name = 'AssetContractError';
    this.url = url;
    this.errors = errors;
    this.warnings = warnings;
  }
}

/**
 * Load and validate one authored GLB part. Failures resolve to null by contract: the caller's
 * procedural part remains authoritative and no entity may disappear because an asset is absent.
 */
export async function loadAuthoredPart(url, options = {}) {
  const { renderer, slot = null, optional = false } = options;
  if (!renderer) return null;

  let runtime;
  try {
    runtime = await runtimeFor(renderer);
  } catch (error) {
    warnOnce('runtime', '[assetLoader] GLTF/KTX2 runtime unavailable; authored parts will use procedural fallbacks', error);
    return null;
  }

  const cacheKey = `${url}::${slot || '*'}`;
  if (!runtime.assets.has(cacheKey)) {
    const task = runtime.gltf.loadAsync(url)
      .then((gltf) => compileBlueprint(url, gltf, slot))
      .catch((error) => {
        runtime.failures.set(cacheKey, error);
        if (error instanceof AssetContractError) {
          warnOnce(cacheKey, error.message);
        } else if (!optional) {
          warnOnce(cacheKey, `[assetLoader] failed to load ${url}; procedural fallback retained`, error);
        }
        return null;
      });
    runtime.assets.set(cacheKey, task);
  }
  return runtime.assets.get(cacheKey);
}

export async function preloadAuthoredParts(requests, renderer) {
  return Promise.all((requests || []).map((request) => loadAuthoredPart(request.url, { ...request, renderer })));
}

export async function getAuthoredAssetDiagnostic(renderer, url, slot = null) {
  if (!renderer) return null;
  try {
    const runtime = await runtimeFor(renderer);
    return runtime.failures.get(`${url}::${slot || '*'}`) || null;
  } catch (error) {
    return error;
  }
}

export function invalidateAuthoredAsset(renderer, url = null) {
  const runtimePromise = runtimeByRenderer.get(renderer);
  if (!runtimePromise) return;
  runtimePromise.then((runtime) => {
    if (!url) {
      runtime.assets.clear();
      runtime.failures.clear();
      return;
    }
    for (const key of [...runtime.assets.keys()]) if (key.startsWith(`${url}::`)) runtime.assets.delete(key);
    for (const key of [...runtime.failures.keys()]) if (key.startsWith(`${url}::`)) runtime.failures.delete(key);
  }).catch(() => {});
}

function runtimeFor(renderer) {
  let promise = runtimeByRenderer.get(renderer);
  if (!promise) {
    promise = createRuntime(renderer);
    runtimeByRenderer.set(renderer, promise);
  }
  return promise;
}

async function createRuntime(renderer) {
  // This zero-bundle repo ships its own deliberately-small glTF 2.0 loader (src/render/GLTFLoader.js)
  // rather than relying on three/addons or node_modules. KTX2/BasisU decoding is optional: the parts
  // generator embeds PNG textures, and the loader throws on KHR_texture_basisu GLBs, so we only attach
  // a KTX2Loader if one is actually present in vendor/addons (it currently is not). Failure to attach
  // KTX2 simply means BasisU-compressed GLBs won't load — embedded-PNG GLBs work fine.
  const { GLTFLoader } = await import('./GLTFLoader.js');
  const gltf = new GLTFLoader();

  // KTX2/BasisU remains an authoring target, but this zero-bundle runtime does not vendor the
  // decoder yet. Do not dynamically import a missing optional module: browsers report that 404 as
  // a page error, which breaks the visual QA gate even though embedded-PNG GLBs are valid today.
  const ktx2 = null;

  return { gltf, ktx2, assets: new Map(), failures: new Map(), source: './GLTFLoader.js' };
}

function compileBlueprint(url, gltf, expectedSlot) {
  const scene = gltf && gltf.scene;
  if (!scene || !scene.isObject3D) throw new AssetContractError(url, ['GLB has no default scene']);

  const errors = [];
  const warnings = [];
  const metadata = readAssetMetadata(gltf, scene);
  validateAssetMetadata(metadata, expectedSlot, errors);

  if (gltf.animations && gltf.animations.length) {
    errors.push('baked animation clips are forbidden; expose named HOOK_* nodes and let game state drive motion');
  }

  validateRootTransform(scene, errors);
  scene.updateMatrixWorld(true);
  _inverseRoot.copy(scene.matrixWorld).invert();
  const primitives = [];
  const markers = [];
  const globalChamferAssertion = metadata.chamfered === true || finitePositive(metadata.bevelRadiusM);

  scene.traverse((node) => {
    if (node === scene) return;
    const tags = collectTags(node, scene);
    if (tags.tint && !ASSET_AUTHORING_CONTRACT.tintRoles.includes(String(tags.tint).toLowerCase())) {
      errors.push(`${label(node)} declares unknown tint role "${tags.tint}"`);
    }
    if (tags.damageRole && !['navLight', 'sensor', 'armor', 'secondary'].includes(tags.damageRole)) {
      errors.push(`${label(node)} declares unknown damage role "${tags.damageRole}"`);
    }
    if (tags.socketForward && (!Array.isArray(tags.socketForward) || tags.socketForward.length !== 3 ||
      !tags.socketForward.every(Number.isFinite) || Math.hypot(...tags.socketForward) < 1e-6)) {
      errors.push(`${label(node)} socket forward must be a finite non-zero [x,y,z] vector`);
    }
    const normalizedName = String(node.name || '').toUpperCase().replace(/[\s-]+/g, '_');
    if (normalizedName.startsWith('HOOK_') && !tags.drive && !tags.damageRole) {
      errors.push(`${label(node)} uses an unknown HOOK_* name`);
    }

    _relative.multiplyMatrices(_inverseRoot, node.matrixWorld);
    validateNodeTransform(node, _relative, errors);
    if (node.isLight || node.isCamera) {
      errors.push(`${label(node)} embeds a ${node.isLight ? 'light' : 'camera'}; parts may contain only geometry and contract nodes`);
      return;
    }
    if (node.isLine || node.isPoints) {
      errors.push(`${label(node)} is a ${node.isLine ? 'line' : 'points'} primitive; ship parts must use triangle meshes`);
      return;
    }
    if (node.isMesh) {
      if (tags.socket || tags.mount) {
        errors.push(`${label(node)} uses ${tags.socket ? 'SOCKET_*' : 'MOUNT_*'} on renderable geometry; author an empty transform marker instead`);
      }
      if (node.isSkinnedMesh) errors.push(`${label(node)} is skinned; modular ship parts must be rigid`);
      if (node.isInstancedMesh) errors.push(`${label(node)} is pre-instanced; GLTFKit owns runtime instance pools`);
      if (node.morphTargetInfluences && node.morphTargetInfluences.length) errors.push(`${label(node)} uses morph targets; bind game-state hooks instead`);
      if (Array.isArray(node.material)) errors.push(`${label(node)} uses a material array; split it into one primitive per material for deterministic instancing`);
      if (!node.geometry || !node.material || Array.isArray(node.material)) return;

      const canopy = tags.canopy || isCanopy(node);
      const material = canopy ? makeCanopyMaterial(node.material) : node.material;
      if (canopy) node.material = material;
      validatePrimitive(node, material, canopy, gltf, metadata, errors, warnings);
      preserveSharedGpuResource(node.geometry);
      preserveSharedGpuResource(material);
      preserveMaterialTextures(material);

      primitives.push(Object.freeze({
        key: `${url}#${node.uuid}`,
        name: node.name || `Primitive_${primitives.length}`,
        geometry: node.geometry,
        material,
        matrix: _relative.clone(),
        tags: Object.freeze({ ...tags, canopy }),
      }));
    } else if (isContractMarker(node, tags)) {
      markers.push(Object.freeze({
        name: node.name || `Marker_${markers.length}`,
        matrix: _relative.clone(),
        tags: Object.freeze(tags),
        userData: Object.freeze({ ...node.userData }),
      }));
    }
  });

  if (!primitives.length) errors.push('part contains no mesh primitives');
  for (const primitive of primitives) {
    if (!globalChamferAssertion && primitive.tags.chamfered !== true && !finitePositive(primitive.tags.bevelRadiusM)) {
      errors.push(`${primitive.name} lacks a chamfer/bevel assertion (asset or inherited node extras: spaceface.chamfered=true or bevelRadiusM>0)`);
    }
  }

  validateHookSurface(expectedSlot || metadata.slot, primitives, markers, errors);

  _bounds.setFromObject(scene);
  _bounds.getSize(_boundsSize);
  _bounds.getCenter(_boundsCenter);
  if (![..._boundsSize.toArray(), ..._boundsCenter.toArray()].every(Number.isFinite) || _boundsSize.lengthSq() <= 0) {
    errors.push('part bounds are empty or non-finite');
  }

  const maxAxis = Math.max(_boundsSize.x, _boundsSize.y, _boundsSize.z, 1e-6);
  if (_boundsCenter.length() > maxAxis * 0.75) {
    warnings.push('pivot is far outside the visible bounds; mount placement may be surprising');
  }

  if (errors.length) throw new AssetContractError(url, errors, warnings);

  const ktx2Textures = new Set();
  for (const primitive of primitives) {
    for (const texture of materialTextures(primitive.material)) {
      if (isKtx2Texture(texture, gltf, metadata)) ktx2Textures.add(texture.uuid);
    }
  }

  return Object.freeze({
    url,
    assetId: metadata.assetId || fileStem(url),
    slot: expectedSlot || metadata.slot || null,
    metadata: Object.freeze({ ...metadata }),
    primitives: Object.freeze(primitives),
    markers: Object.freeze(markers),
    bounds: Object.freeze({
      min: Object.freeze(sceneBoundsArray(_bounds.min)),
      max: Object.freeze(sceneBoundsArray(_bounds.max)),
      size: Object.freeze(sceneBoundsArray(_boundsSize)),
      center: Object.freeze(sceneBoundsArray(_boundsCenter)),
    }),
    report: Object.freeze({
      warnings: Object.freeze(warnings),
      primitiveCount: primitives.length,
      markerCount: markers.length,
      ktx2TextureCount: ktx2Textures.size,
    }),
  });
}


function validateRootTransform(scene, errors) {
  const eps = 1e-6;
  const identityRotation = Math.abs(scene.quaternion.x) < eps && Math.abs(scene.quaternion.y) < eps &&
    Math.abs(scene.quaternion.z) < eps && Math.abs(scene.quaternion.w - 1) < eps;
  const identityScale = Math.abs(scene.scale.x - 1) < eps && Math.abs(scene.scale.y - 1) < eps &&
    Math.abs(scene.scale.z - 1) < eps;
  if (scene.position.lengthSq() > eps * eps || !identityRotation || !identityScale) {
    errors.push('default scene root transform must be identity; author orientation/scale into child nodes in metres');
  }
}

function readAssetMetadata(gltf, scene) {
  const sources = [
    scene.userData && scene.userData.spacefaceAsset,
    scene.userData && scene.userData.spaceface,
    gltf.userData && gltf.userData.spacefaceAsset,
    gltf.asset && gltf.asset.extras && (gltf.asset.extras.spacefaceAsset || gltf.asset.extras.spaceface),
  ];
  return { ...(sources.find((v) => v && typeof v === 'object') || {}) };
}

function validateAssetMetadata(meta, expectedSlot, errors) {
  if (meta.contractVersion !== ASSET_AUTHORING_CONTRACT.version) {
    errors.push(`spacefaceAsset.contractVersion must equal ${ASSET_AUTHORING_CONTRACT.version}`);
  }
  if (!meta.assetId || typeof meta.assetId !== 'string') {
    errors.push('spacefaceAsset.assetId must be a stable non-empty string');
  }
  const allowedSlots = ['hull', 'cockpit', 'engine', 'fin'];
  if (!allowedSlots.includes(meta.slot)) {
    errors.push(`spacefaceAsset.slot must be one of ${allowedSlots.join(', ')}`);
  } else if (expectedSlot && meta.slot !== expectedSlot) {
    errors.push(`spacefaceAsset.slot must equal requested slot "${expectedSlot}"`);
  }
  if (meta.forward !== '+X' || meta.up !== '+Y' || meta.starboard !== '+Z') {
    errors.push('coordinate extras must declare forward="+X", up="+Y", starboard="+Z"');
  }
  if (!(meta.unit === 'metre' || meta.unit === 'meter' || meta.metresPerUnit === 1 || meta.metersPerUnit === 1)) {
    errors.push('unit extras must declare metres (unit="metre" or metresPerUnit=1)');
  }
  if (String(meta.normalConvention || '').toLowerCase() !== 'opengl') {
    errors.push('spacefaceAsset.normalConvention must be "OpenGL" (green-up)');
  }
  if (normalizeToken(meta.ormChannels) !== 'r=ao,g=roughness,b=metallic') {
    errors.push('spacefaceAsset.ormChannels must be "R=AO,G=Roughness,B=Metallic"');
  }
  if (normalizeToken(meta.textureCompression) !== 'ktx2/basisu') {
    errors.push('spacefaceAsset.textureCompression must be "KTX2/BasisU"');
  }
}

function validatePrimitive(node, material, canopy, gltf, metadata, errors, warnings) {
  const prefix = label(node);
  const geometry = node.geometry;
  if (!geometry.getAttribute('position')) errors.push(`${prefix} has no positions`);
  if (!geometry.getAttribute('normal')) errors.push(`${prefix} has no vertex normals`);
  if (!geometry.getAttribute('uv')) errors.push(`${prefix} has no UV0 for baseColor/normal maps`);
  if (material.normalMap && !geometry.getAttribute('tangent')) {
    errors.push(`${prefix} has a normal map but no authored tangent attribute`);
  }

  if (!material.isMeshStandardMaterial && !material.isMeshPhysicalMaterial) {
    errors.push(`${prefix} material must be MeshStandardMaterial or MeshPhysicalMaterial`);
    return;
  }

  const map = material.map;
  const normal = material.normalMap;
  const ao = material.aoMap;
  const rough = material.roughnessMap;
  const metal = material.metalnessMap;
  if (!map) errors.push(`${prefix} is missing baseColor map`);
  if (!normal) errors.push(`${prefix} is missing tangent-space normal map`);
  if (!ao || !rough || !metal) errors.push(`${prefix} is missing packed ORM assignments (aoMap + roughnessMap + metalnessMap)`);

  if (map && map.colorSpace !== THREE.SRGBColorSpace) errors.push(`${prefix} baseColor map is not tagged sRGB`);
  if (normal) {
    if (normal.colorSpace === THREE.SRGBColorSpace) errors.push(`${prefix} normal map must be linear/non-color data`);
    if (material.normalMapType !== THREE.TangentSpaceNormalMap) errors.push(`${prefix} normal map is not tangent-space`);
    if (material.normalScale && material.normalScale.y < 0) errors.push(`${prefix} normal map is DirectX green-down; export OpenGL green-up`);
  }
  if (ao && ao.colorSpace === THREE.SRGBColorSpace) errors.push(`${prefix} ORM map must be linear/non-color data`);
  if (ao && rough && metal && !(sameTexture(ao, rough) && sameTexture(rough, metal))) {
    errors.push(`${prefix} AO, roughness and metallic must share one packed ORM texture`);
  } else if (ao && rough && metal && !(sameTextureSampling(ao, rough) && sameTextureSampling(rough, metal))) {
    errors.push(`${prefix} packed ORM channels must use the same UV set and texture transform`);
  }
  if (ao && !(geometry.getAttribute('uv1') || geometry.getAttribute('uv'))) {
    errors.push(`${prefix} has no UV channel usable by AO`);
  }

  for (const [role, texture] of [['baseColor', map], ['normal', normal], ['ORM', ao]]) {
    if (!texture) continue;
    const size = textureSize(texture);
    if (!size) {
      errors.push(`${prefix} ${role} texture dimensions are not inspectable`);
    } else if (size.width < 1024 || size.height < 1024 || size.width > 2048 || size.height > 2048) {
      errors.push(`${prefix} ${role} texture must be 1K–2K; got ${size.width}x${size.height}`);
    }
    if (!isKtx2Texture(texture, gltf, metadata)) {
      errors.push(`${prefix} ${role} texture is not KTX2/BasisU (KHR_texture_basisu)`);
    }
  }

  if (canopy) {
    if (!material.isMeshPhysicalMaterial) errors.push(`${prefix} canopy did not normalize to MeshPhysicalMaterial`);
    if (Math.abs(material.transmission - 0.6) > 0.001) errors.push(`${prefix} canopy transmission must be 0.6`);
    if (Math.abs(material.ior - 1.4) > 0.001) errors.push(`${prefix} canopy ior must be 1.4`);
    if (Math.abs(material.clearcoat - 1.0) > 0.001) errors.push(`${prefix} canopy clearcoat must be 1.0`);
  } else if (material.transparent && material.opacity < 1) {
    warnings.push(`${prefix} is alpha-blended; only canopies/plumes should normally require per-ship sorting`);
  }
}

function validateHookSurface(slot, primitives, markers, errors) {
  // Render hooks must resolve to renderable primitives. Empty marker nodes are valid sockets, but an
  // empty HOOK_DRIVE_* marker would leave shipKit with nothing to animate or damage.
  if (!primitives.some((entry) => entry.tags.lod === 'lod0')) {
    errors.push('part mesh primitives expose no LOD0_* node or spaceface.lod="lod0" tag');
  }
  if (slot === 'engine') {
    for (const role of ['fan', 'core', 'plume']) {
      const count = primitives.filter((entry) => entry.tags.drive === role).length;
      if (count !== 1) {
        errors.push(`engine mesh must expose exactly one HOOK_DRIVE_${role.toUpperCase()}; found ${count}`);
      }
    }
  }
  if (slot === 'cockpit' && !primitives.some((entry) => entry.tags.canopy)) {
    errors.push('cockpit part contains no CANOPY_/glass mesh for the physical-glass contract');
  }

  const socketNames = new Set();
  const mountKeys = new Set();
  const mountCounts = { cockpit: 0, engine: 0, fin: 0 };
  for (const marker of markers) {
    if (marker.tags.socket) {
      if (socketNames.has(marker.name)) errors.push(`duplicate socket marker "${marker.name}"`);
      socketNames.add(marker.name);
    }
    if (marker.tags.mount) {
      const mountKey = `${marker.tags.mount}:${marker.tags.mountKey || marker.name}`;
      if (mountKeys.has(mountKey)) errors.push(`duplicate assembly mount "${mountKey}"`);
      mountKeys.add(mountKey);
    }
    if (marker.tags.mount && Object.hasOwn(mountCounts, marker.tags.mount)) mountCounts[marker.tags.mount]++;
  }
  const totalMounts = Object.values(mountCounts).reduce((sum, count) => sum + count, 0);
  if (slot !== 'hull' && totalMounts) errors.push('MOUNT_* assembly markers are valid only in hull parts');
  if (slot === 'hull') {
    if (mountCounts.cockpit > 1) errors.push(`hull exposes ${mountCounts.cockpit} cockpit mounts; at most one is allowed`);
    if (mountCounts.engine > 4) errors.push(`hull exposes ${mountCounts.engine} engine mounts; at most four are allowed`);
    if (mountCounts.fin > 4) errors.push(`hull exposes ${mountCounts.fin} fin mounts; at most four are allowed`);
  }
}

function collectTags(node, scene) {
  const chain = [];
  for (let current = node; current && current !== scene; current = current.parent) chain.push(current);
  const tags = {};
  for (let i = chain.length - 1; i >= 0; i--) applyNodeTags(tags, chain[i]);

  // Sockets and assembly mounts describe one transform, not a subtree. Keep render-state tags
  // inheritable, but require these marker tags to be declared on the marker node itself.
  const local = {};
  applyNodeTags(local, node);
  for (const key of ['socket', 'socketRole', 'socketForward', 'mount', 'mountKey']) {
    if (Object.hasOwn(local, key)) tags[key] = local[key];
    else delete tags[key];
  }
  return tags;
}

function applyNodeTags(tags, node) {
  const data = node.userData || {};
  const sf = data.spaceface && typeof data.spaceface === 'object' ? data.spaceface : {};
  const name = String(node.name || '').toUpperCase().replace(/[\s-]+/g, '_');

  const lodMatch = /^LOD([012])(?:_|$)/.exec(name);
  if (lodMatch) tags.lod = `lod${lodMatch[1]}`;
  if (name.startsWith('SOCKET_')) {
    tags.socket = true;
    tags.socketRole = sf.role || data.role || socketRoleFromName(name);
  }
  const mountMatch = /^MOUNT_(COCKPIT|ENGINE|FIN)(?:_|$)/.exec(name);
  if (mountMatch) {
    tags.mount = mountMatch[1].toLowerCase();
    tags.mountKey = name.slice('MOUNT_'.length).toLowerCase();
  }
  if (name.includes('HOOK_DRIVE_FAN')) tags.drive = 'fan';
  if (name.includes('HOOK_DRIVE_CORE')) tags.drive = 'core';
  if (name.includes('HOOK_DRIVE_PLUME')) tags.drive = 'plume';
  if (name.includes('HOOK_NAV_') || name.includes('HOOK_NAVLIGHT')) tags.damageRole = 'navLight';
  if (name.includes('HOOK_SENSOR_')) tags.damageRole = 'sensor';
  if (name.includes('HOOK_ARMOR_')) tags.damageRole = 'armor';
  if (name.includes('HOOK_SECONDARY_')) tags.damageRole = 'secondary';
  if (name.includes('CANOPY') || name.includes('COCKPIT_GLASS')) tags.canopy = true;
  if (name.includes('DECAL')) tags.decal = true;

  const hook = sf.hook || data.spacefaceHook;
  if (typeof hook === 'string') applyHookString(tags, hook);
  if (sf.lod || data.spacefaceLod) tags.lod = normalizeLod(sf.lod || data.spacefaceLod);
  if (sf.tint || data.spacefaceTint) tags.tint = sf.tint || data.spacefaceTint;
  if (sf.damageRole || data.damageRole) tags.damageRole = normalizeDamageRole(sf.damageRole || data.damageRole);
  if (sf.socket === true || data.spacefaceSocket === true) tags.socket = true;
  if (sf.mount || data.spacefaceMount) {
    const mount = String(sf.mount || data.spacefaceMount).toLowerCase();
    if (['cockpit', 'engine', 'fin'].includes(mount)) tags.mount = mount;
    tags.mountKey = String(sf.mountKey || data.spacefaceMountKey || mount).toLowerCase();
  }
  if (sf.role || data.role) tags.socketRole = sf.role || data.role;
  if (Array.isArray(sf.forward || data.forward)) tags.socketForward = [...(sf.forward || data.forward)];
  if (sf.instance === false || data.spacefaceInstance === false) tags.instance = false;
  if (sf.canopy === true) tags.canopy = true;
  if (sf.decal === true) tags.decal = true;
  if (sf.chamfered === true || data.chamfered === true) tags.chamfered = true;
  if (finitePositive(sf.bevelRadiusM || data.bevelRadiusM)) tags.bevelRadiusM = Number(sf.bevelRadiusM || data.bevelRadiusM);
}

function normalizeDamageRole(value) {
  const token = String(value || '').replace(/[._ -]+/g, '').toLowerCase();
  if (token === 'navlight' || token === 'nav') return 'navLight';
  if (token === 'sensor' || token === 'sensorslit') return 'sensor';
  if (token === 'armor' || token === 'armour') return 'armor';
  if (token === 'secondary') return 'secondary';
  return String(value || '');
}

function applyHookString(tags, value) {
  const hook = value.toLowerCase();
  if (hook === 'drive.fan') tags.drive = 'fan';
  else if (hook === 'drive.core') tags.drive = 'core';
  else if (hook === 'drive.plume') tags.drive = 'plume';
  else if (hook === 'damage.navlight') tags.damageRole = 'navLight';
  else if (hook === 'damage.sensor') tags.damageRole = 'sensor';
  else if (hook === 'damage.armor') tags.damageRole = 'armor';
  else if (hook === 'damage.secondary') tags.damageRole = 'secondary';
}

function makeCanopyMaterial(source) {
  const physical = new THREE.MeshPhysicalMaterial({
    name: source.name || 'Authored_Canopy',
    color: source.color ? source.color.clone() : new THREE.Color(0xffffff),
    map: source.map || null,
    normalMap: source.normalMap || null,
    normalMapType: source.normalMapType,
    normalScale: source.normalScale ? source.normalScale.clone() : new THREE.Vector2(1, 1),
    aoMap: source.aoMap || null,
    aoMapIntensity: source.aoMapIntensity == null ? 1 : source.aoMapIntensity,
    roughnessMap: source.roughnessMap || null,
    metalnessMap: source.metalnessMap || null,
    roughness: source.roughness == null ? 0.12 : source.roughness,
    metalness: source.metalness == null ? 0 : source.metalness,
    emissive: source.emissive ? source.emissive.clone() : new THREE.Color(0x000000),
    emissiveMap: source.emissiveMap || null,
    emissiveIntensity: source.emissiveIntensity == null ? 1 : source.emissiveIntensity,
    transmission: 0.6,
    ior: 1.4,
    clearcoat: 1.0,
    clearcoatRoughness: 0.08,
    thickness: 0.08,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    side: source.side,
  });
  physical.userData = { ...(source.userData || {}), spacefaceCanopy: true };
  return physical;
}

function preserveSharedGpuResource(resource) {
  if (!resource || resource.userData && resource.userData.spacefaceSharedAsset) return resource;
  resource.userData = { ...(resource.userData || {}), spacefaceSharedAsset: true };
  if (typeof resource.dispose === 'function') resource.dispose = () => {};
  return resource;
}

function preserveMaterialTextures(material) {
  for (const texture of materialTextures(material)) preserveSharedGpuResource(texture);
}

function materialTextures(material) {
  const result = [];
  const seen = new Set();
  for (const value of Object.values(material || {})) {
    if (value && value.isTexture && !seen.has(value.uuid)) {
      seen.add(value.uuid);
      result.push(value);
    }
  }
  return result;
}

function textureSize(texture) {
  const image = texture && (texture.image || texture.source && texture.source.data);
  if (image && Number.isFinite(image.width) && Number.isFinite(image.height)) {
    return { width: image.width, height: image.height };
  }
  if (image && image.data && Number.isFinite(image.data.width) && Number.isFinite(image.data.height)) {
    return { width: image.data.width, height: image.data.height };
  }
  if (texture && texture.mipmaps && texture.mipmaps[0]) {
    const mip = texture.mipmaps[0];
    if (Number.isFinite(mip.width) && Number.isFinite(mip.height)) return { width: mip.width, height: mip.height };
  }
  return null;
}


function isKtx2Texture(texture, gltf, metadata) {
  if (!texture || normalizeToken(metadata && metadata.textureCompression) !== 'ktx2/basisu') return false;
  const parser = gltf && gltf.parser;
  if (!parser || !parser.associations || !parser.json || !parser.json.textures) return false;

  let association = parser.associations.get(texture);
  // GLTFLoader clones textures when a material selects a non-zero texCoord. Older/newer revisions do
  // not all preserve the association on that clone, so recover it only through the identical source.
  // This remains exact per texture definition — it does not accept a GLB merely because some other
  // texture happened to use BasisU.
  if (!association) {
    for (const [candidate, mapping] of parser.associations) {
      if (candidate && candidate.isTexture && sameTexture(candidate, texture)) {
        association = mapping;
        break;
      }
    }
  }
  const textureIndex = association && Number.isInteger(association.textures) ? association.textures : null;
  const definition = textureIndex != null ? parser.json.textures[textureIndex] : null;
  return !!(definition && definition.extensions && definition.extensions.KHR_texture_basisu);
}

function normalizeToken(value) {
  return String(value == null ? '' : value).replace(/\s+/g, '').toLowerCase();
}

function sameTexture(a, b) {
  return a === b || (a && b && (
    (a.source && a.source === b.source) ||
    (a.image && a.image === b.image)
  ));
}

function sameTextureSampling(a, b) {
  if (!sameTexture(a, b)) return false;
  if ((a.channel || 0) !== (b.channel || 0) || a.flipY !== b.flipY || a.wrapS !== b.wrapS || a.wrapT !== b.wrapT) return false;
  if (a.matrixAutoUpdate) a.updateMatrix();
  if (b.matrixAutoUpdate) b.updateMatrix();
  const ae = a.matrix.elements;
  const be = b.matrix.elements;
  for (let i = 0; i < ae.length; i++) if (Math.abs(ae[i] - be[i]) > 1e-6) return false;
  return true;
}

function validateNodeTransform(node, matrix, errors) {
  matrix.decompose(_transformPosition, _transformQuaternion, _transformScale);
  const scale = [_transformScale.x, _transformScale.y, _transformScale.z];
  if (!scale.every(Number.isFinite) || scale.some((value) => Math.abs(value) < 1e-6)) {
    errors.push(`${label(node)} has a zero or non-finite transform scale`);
    return;
  }
  if (scale.some((value) => value < 0) || matrix.determinant() <= 0) {
    errors.push(`${label(node)} uses mirrored/negative scale; apply transforms and export real mirrored topology so instancing preserves winding`);
    return;
  }
  _recomposed.compose(_transformPosition, _transformQuaternion, _transformScale);
  const a = matrix.elements;
  const b = _recomposed.elements;
  for (let i = 0; i < 16; i++) {
    if (Math.abs(a[i] - b[i]) > 1e-5) {
      errors.push(`${label(node)} contains shear; apply parent transforms before export so hook and mount TRS remain exact`);
      break;
    }
  }
}

function isContractMarker(node, tags) {
  return !!(tags.socket || tags.mount || tags.drive || tags.damageRole || /^(HOOK|MOUNT)_/i.test(node.name || ''));
}

function isCanopy(node) {
  const materialName = node.material && !Array.isArray(node.material) ? node.material.name : '';
  return /(canopy|cockpit[_ -]?glass|windscreen)/i.test(`${node.name || ''} ${materialName || ''}`);
}

function socketRoleFromName(name) {
  if (name.includes('WEAPON')) return 'weapon';
  if (name.includes('MINING')) return 'mining';
  if (name.includes('ENGINE')) return 'engine';
  if (name.includes('TRAIL')) return 'vfx';
  if (name.includes('CAMERA')) return 'camera';
  if (name.includes('CARGO')) return 'cargo';
  if (name.includes('UTILITY')) return 'utility';
  return 'attachment';
}

function normalizeLod(value) {
  const match = String(value || '').toLowerCase().match(/[012]/);
  return match ? `lod${match[0]}` : null;
}

function finitePositive(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0;
}

function label(node) {
  return `mesh "${node.name || node.uuid}"`;
}

function fileStem(url) {
  const name = String(url).split('/').pop() || 'authored_part';
  return name.replace(/\.[^.]+$/, '');
}

function sceneBoundsArray(vector) {
  return [vector.x, vector.y, vector.z];
}

function warnOnce(key, message, error) {
  if (warned.has(key)) return;
  warned.add(key);
  if (error) console.warn(message, error);
  else console.warn(message);
}
