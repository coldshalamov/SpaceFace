// Metadata coverage, not a PBR/visual-quality verdict. Forge's current authored finish
// replaces the legacy role marker; one tagged material must not pardon its neighbours.
export function hasTextureRoleDeclaration(material) {
  const extras = material?.getExtras?.() || {};
  const declared = value => value === true || (typeof value === 'string' && value.trim().length > 0);
  if ([extras.textureRole, extras.spacefaceTextureRole, extras.textureRoleMode].some(declared)) return true;
  return extras.spacefaceFinish === 'forge-v1'
    && typeof extras.spacefaceMaterialRole === 'string'
    && extras.spacefaceMaterialRole.trim().length > 0;
}

export function hasUnclassifiedTextures(root) {
  if (!(root.listTextures?.().length > 0)) return false;
  const materials = root.listMaterials?.() || [];
  // Check each material that actually references a texture, including extension-owned
  // texture links. listParents is glTF Transform's graph API and avoids a fixed list of
  // texture channels that would silently miss transmission/clearcoat/etc.
  const textured = new Set();
  const visit = (property, seen, owners) => {
    if (!property || seen.has(property)) return;
    seen.add(property);
    if (materials.includes(property)) { textured.add(property); owners.add(property); return; }
    for (const parent of property.listParents?.() || []) {
      if (parent !== root) visit(parent, seen, owners);
    }
  };
  let orphan = false;
  for (const texture of root.listTextures()) {
    const owners = new Set();
    visit(texture, new Set(), owners);
    if (owners.size === 0) orphan = true;
  }
  // Orphan images are still unexplained data; don't manufacture an all-clear from an
  // empty set of owners. Their removal belongs to the source asset's cleanup pass.
  return orphan || [...textured].some(material => !hasTextureRoleDeclaration(material));
}
