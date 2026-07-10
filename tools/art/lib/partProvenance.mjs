export function generatorForAuthoringMethod(method) {
  if (method === 'blender_mcp') {
    return 'SpaceFace tools/art/blender/author_place_archetype.py - Blender-authored place archetype';
  }
  if (method === 'blender_generic') {
    return 'SpaceFace tools/art/blender/export_sprint_part.py -> tools/blender/spaceface_export.py + tools/art/finalize_part.mjs - Blender-authored generic asset';
  }
  if (method == null || method === 'procedural_fallback') {
    return 'SpaceFace tools/art/generate_ship_parts_library.py - procedural ship parts library v3';
  }
  throw new Error(`unsupported authoring method '${method}'`);
}

export function isBlenderAuthoringMethod(method) {
  return method === 'blender_mcp' || method === 'blender_generic';
}

export function applyPartProvenance(gltf, {
  authoringMethod,
  authoringEntry = null,
  sfAsset,
  assetExtras,
  textureRoleContract,
}) {
  gltf.asset = gltf.asset || {};
  const previousGenerator = gltf.asset.generator;
  const previousAssetExtras = gltf.asset.extras || {};
  const previousSourceProvenance = previousAssetExtras.sourceProvenance || {};
  const sceneIndex = gltf.scene ?? 0;
  const scene = gltf.scenes?.[sceneIndex];
  if (!scene) throw new Error(`cannot stamp provenance: scene ${sceneIndex} does not exist`);
  const previousSceneExtras = scene.extras || {};

  gltf.asset.version = '2.0';
  gltf.asset.generator = generatorForAuthoringMethod(authoringMethod);
  gltf.asset.extras = {
    ...previousAssetExtras,
    ...assetExtras,
    spacefaceAsset: {
      ...(previousAssetExtras.spacefaceAsset || {}),
      ...sfAsset,
    },
    sourceProvenance: {
      ...previousSourceProvenance,
      priorGenerator: previousSourceProvenance.priorGenerator ?? previousGenerator ?? '<unknown>',
      authoringMethod: authoringMethod || 'procedural_fallback',
      ...(authoringEntry?.blend_path ? { blendPath: authoringEntry.blend_path } : {}),
      ...(textureRoleContract ? {
        textureRoleContractVersion: textureRoleContract.version,
        textureRoleMode: textureRoleContract.mode,
      } : {}),
    },
  };
  scene.extras = {
    ...previousSceneExtras,
    spacefaceAsset: {
      ...(previousSceneExtras.spacefaceAsset || {}),
      ...sfAsset,
    },
  };
  return gltf;
}
