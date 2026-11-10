// Shared, side-effect-free normalization for the parts-manifest checker.
// Runtime asset loading prefers the canonical spacefaceAsset contract while older
// generated parts keep manifest-facing fields in asset.extras. Keep both sources
// visible to the checker instead of treating the nested contract as opaque.

const QUANTIZED_COMPONENTS = new Map([
  [5120, { signed: true, max: 127 }],
  [5121, { signed: false, max: 255 }],
  [5122, { signed: true, max: 32767 }],
  [5123, { signed: false, max: 65535 }],
]);

function isRecord(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function nestedContract(extras) {
  if (!isRecord(extras)) return null;
  if (isRecord(extras.spacefaceAsset)) return extras.spacefaceAsset;
  if (isRecord(extras.spaceface)) return extras.spaceface;
  return null;
}

function mergeMetadataSources(sources) {
  return sources.reduce((merged, source) => {
    if (!isRecord(source)) return merged;
    return { ...merged, ...source };
  }, {});
}

/**
 * Flatten the canonical contract into the field names used by the manifest
 * checks while retaining legacy asset.extras fields as fallbacks.
 */
export function normalizeManifestAssetMetadata(extras, canonical = undefined) {
  const root = isRecord(extras) ? extras : {};
  const contract = isRecord(canonical) ? canonical : nestedContract(root);
  const metadata = { ...root, ...(contract || {}) };
  if (contract) {
    metadata.forwardAxis = contract.forward ?? contract.forwardAxis ?? metadata.forwardAxis;
    metadata.upAxis = contract.up ?? contract.upAxis ?? metadata.upAxis;
    metadata.starboardAxis = contract.starboard ?? contract.starboardAxis ?? metadata.starboardAxis;
    metadata.unit = contract.unit ?? metadata.unit;
  }
  return metadata;
}

/**
 * Match the runtime loader's source precedence: a scene-level canonical
 * contract is richer than the asset-level copy, with asset extras retained for
 * legacy manifest fields such as priority and boundsDimensionsM.
 */
export function resolveManifestAssetMetadata(gltf) {
  const assetExtras = isRecord(gltf?.asset?.extras) ? gltf.asset.extras : {};
  const scene = gltf?.scenes?.[gltf?.scene ?? 0] || gltf?.scenes?.[0];
  const sceneExtras = isRecord(scene?.extras) ? scene.extras : {};
  const assetContract = nestedContract(assetExtras);
  const sceneContract = nestedContract(sceneExtras);
  const merged = mergeMetadataSources([
    assetExtras,
    assetContract,
    sceneExtras,
    sceneContract,
  ]);
  return normalizeManifestAssetMetadata(merged, sceneContract || assetContract);
}

/**
 * The works loader intentionally stores place-prefab files under works/.
 * Keep the manifest category as places while accepting that published path.
 */
export function manifestPartPathMatchesCategory(part) {
  const category = String(part?.category || '');
  const file = String(part?.file || '').replaceAll('\\', '/');
  if (file.startsWith(`${category}/`)) return true;
  return category === 'places'
    && String(part?.id || '').startsWith('place_works_')
    && file.startsWith('works/');
}

function decodeNormalizedComponent(value, component) {
  if (!component.signed) return value / component.max;
  return Math.max(-1, value / component.max);
}

/**
 * Return POSITION accessor bounds in the physical normalized coordinate space.
 * KHR_mesh_quantization integer POSITION min/max values are stored as the
 * normalized integer domain (for example +/-32767), even when Meshopt keeps
 * the decoded fallback buffer out of the GLB. The checker must dequantize those
 * bounds before applying node transforms.
 */
export function decodedAccessorBounds(gltf, accessor) {
  if (!Array.isArray(accessor?.min) || !Array.isArray(accessor?.max)
      || accessor.min.length !== 3 || accessor.max.length !== 3) return null;

  const component = QUANTIZED_COMPONENTS.get(accessor.componentType);
  const quantized = (gltf?.extensionsUsed || []).includes('KHR_mesh_quantization')
    || (gltf?.extensionsRequired || []).includes('KHR_mesh_quantization');
  if (!quantized || !accessor.normalized || !component) {
    return { min: [...accessor.min], max: [...accessor.max] };
  }

  return {
    min: accessor.min.map((value) => decodeNormalizedComponent(value, component)),
    max: accessor.max.map((value) => decodeNormalizedComponent(value, component)),
  };
}
