// Stable identity for material-keyed opaque batching.
//
// Per-object material.uuid prevents two ships that share the same authored role from ever
// entering one BatchedMesh. A role/map/uniform fingerprint keeps appearance identical while
// allowing heterogeneous geometry behind one program.

export function materialBatchFingerprint(material) {
  if (!material) return 'missing-material';
  const authored = material.userData && (
    material.userData.spacefaceBatchKey
    || material.userData.spacefaceMaterialRole
    || material.userData.spacefaceSharedRole
  );
  if (authored) return String(authored);

  const maps = [
    'map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap',
    'aoMap', 'alphaMap', 'bumpMap',
  ].map((key) => {
    const tex = material[key];
    if (!tex) return `${key}:0`;
    const image = tex.image;
    const src = tex.userData && (tex.userData.src || tex.userData.url);
    const id = src || tex.uuid || (image && (image.src || image.uuid)) || 'tex';
    return `${key}:${id}`;
  });

  const color = material.color && typeof material.color.getHexString === 'function'
    ? material.color.getHexString()
    : '------';
  const emissive = material.emissive && typeof material.emissive.getHexString === 'function'
    ? material.emissive.getHexString()
    : '------';

  return [
    material.type || 'Material',
    color,
    emissive,
    Number(material.roughness) || 0,
    Number(material.metalness) || 0,
    Number(material.opacity) || 1,
    material.transparent === true ? 1 : 0,
    material.side || 0,
    material.blending || 0,
    material.depthWrite === false ? 0 : 1,
    ...maps,
  ].join('|');
}

export function packageBatchPoolKeyFromMaterial(material) {
  return `package-batched|${materialBatchFingerprint(material)}`;
}

export function stampGeometryBatchKey(geometry, key) {
  if (!geometry) return '';
  const userData = geometry.userData || (geometry.userData = {});
  if (!userData.spacefaceBatchKey) userData.spacefaceBatchKey = String(key);
  return userData.spacefaceBatchKey;
}

export function geometryBatchIdentity(geometry, hint = '') {
  if (!geometry) return 'nogeo';
  const stamped = geometry.userData && geometry.userData.spacefaceBatchKey;
  if (stamped) return String(stamped);
  if (hint) return String(hint);
  return geometry.uuid || 'nogeo';
}

export function instancePoolIdentity(geometry, material, hint = '') {
  const materialKey = material && material.userData && material.userData.spacefaceBatchKey
    || packageBatchPoolKeyFromMaterial(material);
  return `${geometryBatchIdentity(geometry, hint)}|${materialKey}`;
}
