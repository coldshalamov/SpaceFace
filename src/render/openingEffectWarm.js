// Combat/engine effect programs that first-link inside presented flight on software GL.
// Measured family (perf lane tw4-tw7 + fx0 draw attribution, both arms, post-lift links >700 ms):
//   - liquid-plasma strand mesh (unnamed ShaderMaterial under `sf-liquid-plasma-root`), up to 2.7 s
//   - SF_ExplosionRupture_material-transport (2.2 s), SF_ActionPrimitiveMatter (1.5 s),
//     SF_FilteredForceParticleTransport (1.2 s), SF_ArcadePhysicalShardMaterial (1.1 s)
//   - thruster plume layers `plume:<family>:core|distortion` (0.8-1.9 s)
//   - engine trail surfaces (`SF_TrailStreakInstances`, `SF_RibbonTrail`, unnamed ShaderMaterials)
// The opening warm touches one live instance of each through the exact-target pass while the
// loading shell owns the picture, so the ANGLE link is paid behind the veil, not in a frame.

export const OPENING_EFFECT_ROOT_NAMES = Object.freeze([
  'sf-liquid-plasma-root',
  'SF_TrailStreakInstances',
  'SF_RibbonTrail',
  'SF_VFX_explosion_rupture',
  'sf-overflow-jets',
]);

export const OPENING_EFFECT_MATERIAL_RE = /^(SF_ExplosionRupture_material-transport|SF_ActionPrimitiveMatter|SF_FilteredForceParticleTransport|SF_ArcadePhysicalShardMaterial|plume:[^:]+:(core|distortion))$/;

function materialsOf(object) {
  if (!object || !object.material) return [];
  return Array.isArray(object.material) ? object.material : [object.material];
}

/**
 * Returns one touch subject per distinct effect program family found under `scene`:
 * [{ key, subject }]. Root-named effects dedupe by root name; material-matched effects dedupe
 * by material name (every ship's plume of one family shares a program). `seen` (a Set of keys)
 * lets a repeated sweep skip families it already touched.
 */
export function collectOpeningEffectSubjects(scene, seen = new Set()) {
  const out = [];
  if (!scene || typeof scene.traverse !== 'function') return out;
  const rootNames = new Set(OPENING_EFFECT_ROOT_NAMES);
  const visit = (object, insideRoot) => {
    if (!object) return;
    const name = String(object.name || '');
    let inside = insideRoot;
    if (!insideRoot && rootNames.has(name)) {
      const key = `root:${name}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ key, subject: object });
      }
      inside = true;
    }
    if (!inside) {
      for (const material of materialsOf(object)) {
        const materialName = String(material && material.name || '');
        if (!OPENING_EFFECT_MATERIAL_RE.test(materialName)) continue;
        const key = `material:${materialName}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ key, subject: object });
      }
    }
    const children = object.children || [];
    for (let i = 0; i < children.length; i++) visit(children[i], inside);
  };
  visit(scene, false);
  return out;
}
