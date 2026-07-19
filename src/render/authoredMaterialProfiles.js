const ROLE_RULES = Object.freeze([
  ['glass', /canopy|cockpit.?glass|material_glass|window/i],
  ['geology', /geolog|regolith|asteroid|rock|ore.?matrix/i],
  ['radiator', /radiator|thermal|heat.?sink/i],
  ['docking', /dock|contact.?surface|landing.?pad|berth/i],
  ['ceramic', /ceramic|heat.?shield|refractory|engine.?liner/i],
  ['rubber', /rubber|gasket|hose|tire/i],
  ['repair', /field.?repair|repair.?paint|repair.?green|weld.?patch/i],
  ['service', /service|access|maintenance|utility/i],
  ['drive', /thruster|engine.?glow|drive.?core|drive.?aperture/i],
  ['signal', /material_emissive|emission|nav.?light|cockpit.?display|sensor.?slit|mining.?lens/i],
  ['warning', /warning|hazard|decal.?red/i],
  ['mechanical', /mechanical|machinery|hardware|exposed|brushed.?metal|fastener|pipe/i],
  ['accent', /accent|trim|paint.?secondary/i],
  ['hull', /hull|armor|body.?primary/i],
]);

export function authoredMaterialRole(name) {
  const token = String(name || '');
  for (const [role, pattern] of ROLE_RULES) if (pattern.test(token)) return role;
  return null;
}

export function applyAuthoredMaterialProfile(material, explicitRole = null, options = {}) {
  if (!material || (!material.isMeshStandardMaterial && !material.isMeshPhysicalMaterial)) return false;
  const role = explicitRole || authoredMaterialRole(material.name);
  if (!role) return false;
  material.userData = { ...(material.userData || {}), spacefaceMaterialRole: role };
  material.dithering = true;
  const coverage = inspectAuthoredPbrCoverage(material);
  material.userData.spacefacePbrCoverage = coverage;
  material.userData.spacefacePbrRemasterRequired = !coverage.complete;
  const authoredSurface = coverage.complete;

  if (role === 'hull') {
    if (!authoredSurface) {
      material.roughness = clampFinite(material.roughness, 0.62, 0.9, 0.76);
      material.metalness = clampFinite(material.metalness, 0.08, 0.42, 0.2);
    }
  } else if (role === 'mechanical') {
    if (!authoredSurface) {
      material.roughness = clampFinite(material.roughness, 0.45, 0.72, 0.56);
      material.metalness = clampFinite(material.metalness, 0.55, 0.82, 0.66);
    }
  } else if (role === 'accent') {
    if (!authoredSurface) {
      material.roughness = clampFinite(material.roughness, 0.52, 0.82, 0.66);
      material.metalness = clampFinite(material.metalness, 0.08, 0.45, 0.2);
    }
  } else if (role === 'glass') {
    material.roughness = clampFinite(material.roughness, 0.04, 0.28, 0.12);
    if ('envMapIntensity' in material && !Number.isFinite(Number(material.envMapIntensity))) {
      material.envMapIntensity = 0.65;
    }
  } else if (role === 'drive') {
    if (material.emissive && material.emissive.getHex() !== 0) {
      material.emissiveIntensity = clampFinite(material.emissiveIntensity, 1.4, 3.2, 1.8);
    }
  } else if (role === 'signal') {
    // Authored signal colors communicate function (cyan navigation/display, orange mining/hazard).
    // Preserve both hue and calibrated intensity instead of repainting every emissive as faction accent.
    if (material.emissive && material.emissive.getHex() !== 0) {
      material.emissiveIntensity = clampFinite(material.emissiveIntensity, 0.45, 2.2, 1.0);
    }
  } else if (role === 'warning') {
    material.roughness = clampFinite(material.roughness, 0.42, 0.82, 0.62);
    if (material.emissive && material.emissive.getHex() !== 0) {
      material.emissiveIntensity = clampFinite(material.emissiveIntensity, 0.65, 1.8, 1.0);
    }
  } else if (role === 'geology') {
    if (!authoredSurface) {
      material.roughness = clampFinite(material.roughness, 0.64, 0.96, 0.82);
      material.metalness = clampFinite(material.metalness, 0.0, 0.24, 0.06);
    }
  } else if (role === 'radiator') {
    if (!authoredSurface) {
      material.roughness = clampFinite(material.roughness, 0.48, 0.82, 0.64);
      material.metalness = clampFinite(material.metalness, 0.35, 0.78, 0.58);
    }
  } else if (role === 'docking') {
    if (!authoredSurface) {
      material.roughness = clampFinite(material.roughness, 0.46, 0.82, 0.66);
      material.metalness = clampFinite(material.metalness, 0.48, 0.88, 0.68);
    }
  } else if (role === 'ceramic') {
    if (!authoredSurface) {
      material.roughness = clampFinite(material.roughness, 0.58, 0.92, 0.76);
      material.metalness = clampFinite(material.metalness, 0.0, 0.12, 0.02);
    }
  } else if (role === 'service') {
    if (!authoredSurface) {
      material.roughness = clampFinite(material.roughness, 0.48, 0.84, 0.68);
      material.metalness = clampFinite(material.metalness, 0.18, 0.68, 0.42);
    }
  } else if (role === 'rubber') {
    if (!authoredSurface) {
      material.roughness = clampFinite(material.roughness, 0.72, 0.98, 0.86);
      material.metalness = 0;
    }
  } else if (role === 'repair') {
    if (!authoredSurface) {
      material.roughness = clampFinite(material.roughness, 0.52, 0.88, 0.66);
      material.metalness = clampFinite(material.metalness, 0.0, 0.24, 0.05);
    }
  }
  if (!authoredSurface) {
    applyProceduralPbrFallback(material, role, {
      assetId: options.assetId || null,
      allowTextures: options.allowTextures !== false,
    });
    material.userData.spacefacePbrCoverageAfterFallback = inspectAuthoredPbrCoverage(material);
  }
  material.needsUpdate = true;
  return true;
}

export function inspectAuthoredPbrCoverage(material) {
  const coverage = {
    baseColor: !!material?.map,
    normalDetail: !!(material?.normalMap || material?.bumpMap),
    roughnessVariation: !!material?.roughnessMap,
    metallicVariation: !!material?.metalnessMap,
    ambientOcclusion: !!material?.aoMap,
  };
  coverage.complete = coverage.baseColor
    && coverage.normalDetail
    && coverage.roughnessVariation
    && coverage.metallicVariation;
  return Object.freeze(coverage);
}

export function configureAuthoredMaterialProfiles(root, { assetId = null } = {}) {
  const configured = new Set();
  const uvMaterials = new Set();
  const roles = {};
  if (!root || typeof root.traverse !== 'function') return { materials: 0, roles };
  root.traverse((object) => {
    if (!object?.geometry?.getAttribute?.('uv')) return;
    const materials = Array.isArray(object.material) ? object.material : (object.material ? [object.material] : []);
    for (const material of materials) if (material) uvMaterials.add(material);
  });
  root.traverse((object) => {
    const materials = Array.isArray(object && object.material)
      ? object.material
      : (object && object.material ? [object.material] : []);
    for (const material of materials) {
      if (!material || configured.has(material)) continue;
      const correctionRole = applyAssetSpecificCorrection(material, assetId, uvMaterials.has(material));
      if (correctionRole) {
        configured.add(material);
        roles[correctionRole] = (roles[correctionRole] || 0) + 1;
        continue;
      }
      // GLTFLoader exposes glTF material extras through userData. Preserve a Blender-authored
      // semantic role verbatim; name and asset inference are compatibility fallbacks only.
      const role = exportedMaterialRole(material)
        || authoredMaterialRole(material.name)
        || inferredAssetMaterialRole(material, assetId);
      if (!role || !applyAuthoredMaterialProfile(material, role, {
        assetId,
        allowTextures: uvMaterials.has(material),
      })) continue;
      configured.add(material);
      roles[role] = (roles[role] || 0) + 1;
    }
  });
  return { materials: configured.size, roles };
}

function exportedMaterialRole(material) {
  const raw = material && material.userData && material.userData.spacefaceMaterialRole;
  if (typeof raw !== 'string') return null;
  const role = raw.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return role || null;
}

function inferredAssetMaterialRole(material, assetId) {
  if (material?.emissiveMap || (material?.emissive && material.emissive.getHex() !== 0)) return 'signal';
  const token = String(assetId || '').toLowerCase();
  if (/asteroid|(?:^|[_-])rock(?:[_-]|$)|ore/.test(token)) return 'geology';
  if (/engine|weapon|turret|equipment|module|wreck|debris|greeble|skid/.test(token)) return 'mechanical';
  if (/station|place_|hull|ship|kestrel|wasp|pelican|armor|cockpit|fin|pod/.test(token)) return 'hull';
  return null;
}

function applyAssetSpecificCorrection(material, assetId, allowTextures) {
  if (
    String(assetId || '').toLowerCase() !== 'place_asteroid_rock_a'
    || String(material?.name || '').toLowerCase() !== 'material_warm'
    || material.emissiveMap
    || !material.emissive
    || material.emissive.getHex() === 0
  ) return null;

  material.userData = {
    ...(material.userData || {}),
    spacefaceMaterialRole: 'geology',
    spacefaceEmissionCorrection: 'unmasked-rock-emission-suppressed',
    authoredEmissiveHex: material.emissive.getHex(),
    authoredEmissiveIntensity: Number(material.emissiveIntensity) || 0,
  };
  const coverage = inspectAuthoredPbrCoverage(material);
  material.userData.spacefacePbrCoverage = coverage;
  material.userData.spacefacePbrRemasterRequired = !coverage.complete;
  if (!coverage.complete) {
    material.roughness = clampFinite(material.roughness, 0.64, 0.96, 0.82);
    material.metalness = clampFinite(material.metalness, 0.0, 0.24, 0.06);
    applyProceduralPbrFallback(material, 'geology', { assetId, allowTextures });
    material.userData.spacefacePbrCoverageAfterFallback = inspectAuthoredPbrCoverage(material);
  }
  material.emissive.setHex(0x000000);
  material.emissiveIntensity = 0;
  material.dithering = true;
  material.needsUpdate = true;
  return 'geology';
}

function clampFinite(value, min, max, fallback) {
  const number = Number(value);
  return Math.max(min, Math.min(max, Number.isFinite(number) ? number : fallback));
}
import { applyProceduralPbrFallback } from './proceduralPbrFallback.js';
