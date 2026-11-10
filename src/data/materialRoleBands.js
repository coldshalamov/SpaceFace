// Look unify (design/program/lab/LOOK_UNIFY.md): one band per material role, applied once at material
// admission after the Forge finish or the legacy rescue layers have run. Each band is a clamp, never a
// target value, so anything already inside keeps its authored look. The bands come from
// docs/visual-assets/COLOR_LIGHTING_STANDARD.md §3, with machinery's gloss floor and the env reflection on metal
// pulled in. Before this, bare-metal finishes (r 0.30, m 0.95) under env 1.6–2.55 read as chrome armor
// on 195 of 288 shipped models.
export const MATERIAL_ROLE_BANDS = Object.freeze({
  hull: Object.freeze({ roughness: [0.44, 0.78], metalness: [0, 0.3], env: [0.9, 1.25] }),
  accent: Object.freeze({ roughness: [0.42, 0.78], metalness: [0, 0.3], env: [0.9, 1.2] }),
  warning: Object.freeze({ roughness: [0.45, 0.82], metalness: [0, 0.2], env: [0.8, 1.0] }),
  repair: Object.freeze({ roughness: [0.5, 0.88], metalness: [0, 0.3], env: [0.8, 1.2] }),
  service: Object.freeze({ roughness: [0.5, 0.86], metalness: [0, 0.6], env: [0.9, 1.3] }),
  mechanical: Object.freeze({ roughness: [0.46, 0.75], metalness: [0.5, 0.88], env: [1.0, 1.3] }),
  docking: Object.freeze({ roughness: [0.48, 0.8], metalness: [0.4, 0.85], env: [1.0, 1.3] }),
  radiator: Object.freeze({ roughness: [0.5, 0.85], metalness: [0.3, 0.8], env: [1.0, 1.3] }),
  ceramic: Object.freeze({ roughness: [0.62, 0.95], metalness: [0, 0.1], env: [0.6, 0.8] }),
  rubber: Object.freeze({ roughness: [0.7, 1], metalness: [0, 0.05], env: [0.4, 0.6] }),
  geology: Object.freeze({ roughness: [0.8, 1], metalness: [0, 0.15], env: [0.7, 1.0] }),
  glass: Object.freeze({ roughness: [0.04, 0.22], metalness: [0, 0.1], env: [0.6, 1.1], emissive: [0, 0.25] }),
  // Light sources already carry authored radiance multiplied once by the Look.
  // Re-capping the result erases drive/nav contrast; a floor also powers dark
  // wreck lamps back on. Keep their optical response while recognizing the role.
  drive: Object.freeze({}),
  signal: Object.freeze({}),
});

// Exported Blender roles outside the runtime vocabulary got no profile at all (glTF default r 1, m 1).
export const MATERIAL_ROLE_ALIASES = Object.freeze({
  maintenance_mark: 'accent', heat_affected_alloy: 'mechanical', copper_coil: 'mechanical',
  exposed_alloy: 'mechanical', engine_ceramic: 'ceramic',
});

// Exported roles that contradict the substance the material name states (everyday-kit exports).
export function substanceRoleOverride(name, role) {
  const n = String(name || '');
  // Lamps exported under a paint role glowed as paint and bloomed whole panels (everyday kit `esk_light_*`).
  if (/(^|_)light(_|$)|(^|_)lamp(_|$)/i.test(n) && role !== 'signal' && role !== 'drive') return 'signal';
  if (/(^|_)glass($|_)|glazing|window/i.test(n) && role !== 'glass' && role !== 'signal') return 'glass';
  if (/(^|_)paint(_|$)|enamel/i.test(n) && role === 'mechanical') return 'hull';
  if (/(^|_)scorch($|_)/i.test(n) && (role === 'hull' || role === 'mechanical')) return 'rubber';
  return null;
}

const clamp = (v, [lo, hi]) => Math.max(lo, Math.min(hi, v));

// Palette value ceiling (COLOR_LIGHTING_STANDARD §3: Helios ivory #bfb6a3 is the brightest paint).
// Only flat-colour materials: a textured material's colour factor is a tint over its map.
export const PAINT_VALUE_CEILING_SRGB = 0xbf / 255;
const VALUE_CEILING_ROLES = new Set(['hull', 'accent', 'warning', 'repair', 'service', 'mechanical', 'docking', 'radiator', 'ceramic', 'rubber', 'geology']);
const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const linearToSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

function applyValueCeiling(material, role) {
  // Authored base map, not the procedural fallback the legacy path may have generated.
  const coverage = material.userData && material.userData.spacefacePbrCoverage;
  const authoredMap = coverage ? coverage.baseColor : !!material.map;
  // Illustrated livery paints through its own pigment uniform and its contract keeps the
  // authored colour factor intact, so the ceiling stays off there.
  const livery = material.userData && material.userData.spacefaceIllustratedPigment;
  if (!VALUE_CEILING_ROLES.has(role) || authoredMap || livery || !material.color) return;
  const c = material.color; // linear working space
  const peak = Math.max(linearToSrgb(c.r), linearToSrgb(c.g), linearToSrgb(c.b));
  if (!(peak > PAINT_VALUE_CEILING_SRGB)) return;
  const k = PAINT_VALUE_CEILING_SRGB / peak;
  c.setRGB(srgbToLinear(linearToSrgb(c.r) * k), srgbToLinear(linearToSrgb(c.g) * k), srgbToLinear(linearToSrgb(c.b) * k));
}

export function applyMaterialRoleBand(material, role) {
  const band = MATERIAL_ROLE_BANDS[role];
  if (!band || !material) return false;
  if (band.roughness && Number.isFinite(material.roughness)) material.roughness = clamp(material.roughness, band.roughness);
  if (band.metalness && Number.isFinite(material.metalness)) material.metalness = clamp(material.metalness, band.metalness);
  if (band.env && 'envMapIntensity' in material && Number.isFinite(material.envMapIntensity)) {
    material.envMapIntensity = clamp(material.envMapIntensity, band.env);
  }
  if (band.emissive && material.emissive && material.emissive.getHex() !== 0 && Number.isFinite(material.emissiveIntensity)) {
    material.emissiveIntensity = clamp(material.emissiveIntensity, band.emissive);
  }
  applyValueCeiling(material, role);
  material.userData = { ...(material.userData || {}), spacefaceRoleBand: role };
  return true;
}
