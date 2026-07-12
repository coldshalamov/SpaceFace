const DEFAULT_ALPHA_GLASS_OPACITY = 0.78;

export function canopyOpacityForTransmission(transmission) {
  const value = Number(transmission);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_ALPHA_GLASS_OPACITY;
  return Math.max(0.7, Math.min(0.88, 1 - value * 0.38));
}

/**
 * Replace Three.js screen-space physical transmission on small top-down ship canopies with
 * environment-reflective alpha glass. Physical transmission forces a second opaque scene render;
 * the replacement retains the authored tint, PBR roughness/clearcoat, environment reflection,
 * geometry, and glass silhouette without that duplicate full-scene pass.
 */
export function configureRealtimeCanopyMaterials(root) {
  if (!root || typeof root.traverse !== 'function') return 0;
  const changed = new Set();
  root.traverse((object) => {
    if (!object || !object.isMesh) return;
    const tags = object.userData && object.userData.spacefaceTags || {};
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!isCanopyMaterial(material, tags) || changed.has(material)) continue;
      changed.add(material);
      applyRealtimeCanopyPolicy(material);
    }
  });
  return changed.size;
}

export function applyRealtimeCanopyPolicy(material) {
  if (!material || !(Number(material.transmission) > 0)) return false;
  const sourceTransmission = Number(material.transmission);
  material.userData = {
    ...(material.userData || {}),
    spacefaceCanopyOptics: {
      strategy: 'environment-alpha-glass',
      sourceTransmission,
      sourceIor: Number.isFinite(Number(material.ior)) ? Number(material.ior) : null,
      sourceThickness: Number.isFinite(Number(material.thickness)) ? Number(material.thickness) : null,
    },
  };
  material.transmission = 0;
  material.transparent = true;
  material.opacity = Math.min(
    Number.isFinite(Number(material.opacity)) ? Number(material.opacity) : 1,
    canopyOpacityForTransmission(sourceTransmission),
  );
  material.depthWrite = false;
  if (Number.isFinite(Number(material.envMapIntensity))) {
    material.envMapIntensity = Math.max(1, Number(material.envMapIntensity));
  }
  material.needsUpdate = true;
  return true;
}

function isCanopyMaterial(material, tags) {
  if (!material || !(Number(material.transmission) > 0)) return false;
  if (tags && tags.canopy) return true;
  return /canopy|cockpit.?glass/i.test(String(material.name || ''));
}
