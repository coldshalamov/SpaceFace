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

// ---------------------------------------------------------------------------------------------
// Surface roughness breakup.
//
// A Blender audit of every shipped GLB (scripts/gfx-asset-audit.mjs) measured within-material
// roughness variation and found TWENTY assets whose ORM green channel has a standard deviation of
// EXACTLY ZERO — all eleven modular hulls (the kit every NPC ship is assembled from), all six
// engines, two cockpits and two dock interiors. Another 52 sit under 0.10. A constant roughness
// gives a constant specular response, which is why correctly differentiated materials still resolve
// as one plastic surface, and why the `material` axis scored 2/5 in every review round regardless of
// the lighting rig, IBL and grade work.
//
// The authored fix is breakup painted into the ORM green channel, and that remains the right
// long-term answer — it belongs to the asset lanes. This is the renderer-side floor: a broad,
// low-frequency perturbation so a flat map still reads as a surface with zones rather than a
// uniform sheet.
//
// Deliberate choices:
//   * LOW frequency (large soft zones, not grain). High-frequency roughness noise sparkles and
//     aliases at distance, which would be worse than the flat map it replaces.
//   * Injected at `#include <lights_physical_fragment>`, NOT at `roughnessmap_fragment` — the
//     packed-ORM single-sample shader in partsLibrary.js already rewrites that include, and two
//     replacements of the same needle would silently no-op whichever ran second.
//   * ONE shared program cache key, so this adds a single program variant rather than one per
//     material (this project has been burned by shader compile storms before).
//   * Amplitude is small and clamped; assets that already carry authored variation are not harmed.
// The key MUST change whenever the injected shader source changes, or three.js reuses a cached
// program compiled from the OLD source and the new term silently never appears — a change that then
// measures as "no effect" for a reason unrelated to the hypothesis under test.
//
// TWO RENDERER HYPOTHESES FOR THE `material` AXIS WERE TESTED AND BOTH DISCONFIRMED AT n=5:
//   v1  roughness breakup      -> material stayed 2, samples [2,2,2,2,2]
//   v2  + albedo value zones   -> material stayed 2, samples [2,2,2,2,2]  (term since reverted)
// The n=5 roughness-breakup disconfirmation is void: the noise function was injected inside
// main() (illegal GLSL) and the call site never landed, so the term never compiled. Re-measure
// before citing that result again.
// The reviewer's note does not change either: "reads mostly as one matte gray material". It wants
// authored variety per zone — painted metal vs glass vs worn edge, readable at ship size — which is
// texture content, not a shader modulation. Do not spend another round modulating a global here.
export const ROUGHNESS_BREAKUP_KEY = 'spaceface-surface-breakup-v4-file-scope';
const ROUGHNESS_BREAKUP_HOOK_TAG = 'spacefaceRoughnessBreakupHook';
const ROUGHNESS_BREAKUP_ROLES = new Set(['hull', 'mechanical', 'accent', 'ceramic', 'radiator', 'service', 'docking']);

export function installRoughnessBreakup(material, { amount = 0.16, scale = 3.5 } = {}) {
  if (!material || (!material.isMeshStandardMaterial && !material.isMeshPhysicalMaterial)) return false;
  // Property names survive minify: true; function names do not (scripts/build-bundle.mjs:85),
  // so a .name comparison is dead in the packaged build.
  const hookInstalled = Object.hasOwn(material, 'onBeforeCompile')
    && material.onBeforeCompile[ROUGHNESS_BREAKUP_HOOK_TAG] === ROUGHNESS_BREAKUP_KEY
    && typeof material.customProgramCacheKey === 'function'
    && String(material.customProgramCacheKey()).includes(ROUGHNESS_BREAKUP_KEY);
  if (hookInstalled) return true;

  const originalOnBeforeCompile = material.onBeforeCompile;
  const originalProgramCacheKey = typeof material.customProgramCacheKey === 'function'
    ? material.customProgramCacheKey()
    : '';

  function roughnessBreakupShader(shader, renderer) {
    if (typeof originalOnBeforeCompile === 'function') {
      originalOnBeforeCompile.call(this, shader, renderer);
    }
    const commonNeedle = '#include <common>';
    if (!shader.fragmentShader.includes(commonNeedle)) {
      // Fail loud rather than silently shipping a no-op: a three.js upgrade that renames this
      // include would otherwise turn the whole effect off with no signal.
      throw new Error('[render] roughness-breakup shader contract changed: missing common');
    }
    shader.fragmentShader = shader.fragmentShader.replace(commonNeedle, [
      commonNeedle,
      // Smooth value noise over the material UV. Two cheap octaves: broad zones plus a softer
      // second band so the result does not read as a single repeating blob.
      'float sfBreakNoise( vec2 p ) {',
      '\tvec2 i = floor( p ); vec2 f = fract( p );',
      '\tf = f * f * ( 3.0 - 2.0 * f );',
      '\tfloat a = fract( sin( dot( i + vec2( 0.0, 0.0 ), vec2( 127.1, 311.7 ) ) ) * 43758.5453 );',
      '\tfloat b = fract( sin( dot( i + vec2( 1.0, 0.0 ), vec2( 127.1, 311.7 ) ) ) * 43758.5453 );',
      '\tfloat c = fract( sin( dot( i + vec2( 0.0, 1.0 ), vec2( 127.1, 311.7 ) ) ) * 43758.5453 );',
      '\tfloat d = fract( sin( dot( i + vec2( 1.0, 1.0 ), vec2( 127.1, 311.7 ) ) ) * 43758.5453 );',
      '\treturn mix( mix( a, b, f.x ), mix( c, d, f.x ), f.y );',
      '}',
    ].join('\n'));

    const needle = '#include <lights_physical_fragment>';
    if (!shader.fragmentShader.includes(needle)) {
      // Fail loud rather than silently shipping a no-op: a three.js upgrade that renames this
      // include would otherwise turn the whole effect off with no signal.
      throw new Error('[render] roughness-breakup shader contract changed: missing lights_physical_fragment');
    }
    shader.fragmentShader = shader.fragmentShader.replace(needle, [
      // vMapUv is declared under USE_MAP, not USE_UV.
      '#ifdef USE_MAP',
      `\tfloat sfBreak = sfBreakNoise( vMapUv * ${scale.toFixed(2)} ) * 0.7`,
      `\t\t+ sfBreakNoise( vMapUv * ${(scale * 2.7).toFixed(2)} ) * 0.3;`,
      `\troughnessFactor = clamp( roughnessFactor + ( sfBreak - 0.5 ) * ${amount.toFixed(3)}, 0.04, 1.0 );`,
      // An albedo VALUE term was tried here and REVERTED. See the note above installRoughnessBreakup:
      // it was disconfirmed at n=5 exactly like the roughness term, and a global brightness multiply
      // on every authored hull is a substantive art-direction change belonging to the asset lanes,
      // not something to ship unilaterally on a hypothesis the measurement rejected.
      '#endif',
      needle,
    ].join('\n'));
  }
  roughnessBreakupShader[ROUGHNESS_BREAKUP_HOOK_TAG] = ROUGHNESS_BREAKUP_KEY;
  material.onBeforeCompile = roughnessBreakupShader;
  material.customProgramCacheKey = () => `${originalProgramCacheKey}|${ROUGHNESS_BREAKUP_KEY}`;
  material.userData = { ...(material.userData || {}), spacefaceRoughnessBreakup: true };
  material.needsUpdate = true;
  return true;
}

// Solid roles that should catch the sector's environment. `glass` is excluded because it already has
// its own authored value below, and emissive-only roles have nothing to reflect with.
const SOLID_ENV_ROLES = new Set(['hull', 'mechanical', 'accent', 'ceramic', 'radiator', 'service', 'docking', 'drive']);
const SOLID_ENV_INTENSITY = 2.1;
const SOLID_ENV_INTENSITY_METAL = 2.8;

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

  // Environment reflection strength for solid surfaces.
  //
  // Independent review's standing `material` note is that ship surfaces read as "a dull, LOW-SPEC gray
  // response". That is diagnostic: albedo, roughness and occlusion are all MODULATORS of a specular
  // response, so when the specular response is near zero they cannot matter — which is exactly what
  // eight measured experiments found (roughness breakup, albedo value zones, a real AO bake, and a
  // per-role repaint all left the axis at 2/5).
  //
  // Only `glass` was ever assigned an envMapIntensity here; every solid role fell through to three's
  // default of 1.0 against a PMREM bake of a mostly-black scene. The bake is NOT fully black — it
  // contains the sector's signature planet — so there is real headroom to recover. Metals get the most
  // because metal has no diffuse response at all: reflection is the only thing that shapes them.
  if (SOLID_ENV_ROLES.has(role) && 'envMapIntensity' in material) {
    material.envMapIntensity = role === 'mechanical' || role === 'drive'
      ? SOLID_ENV_INTENSITY_METAL
      : SOLID_ENV_INTENSITY;
  }

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
  // Broad roughness breakup for the structural roles. See installRoughnessBreakup: twenty shipped
  // assets — every modular hull and every engine — carry a roughness map whose variance is exactly
  // zero, so their specular response is uniform no matter how correct the material split is. Applied
  // to structural surfaces only: glass, emissive/signal and drive apertures are meant to be smooth,
  // and geology already runs its own authored rock surface path.
  if (options.roughnessBreakup !== false && ROUGHNESS_BREAKUP_ROLES.has(role)) {
    installRoughnessBreakup(material);
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

/**
 * `record` is an optional observer, called `(material, role, allowTextures)` for each material this
 * pass configures. It exists so the offline render-package compiler can capture the resolved roles
 * and ship them as data, letting the shipping loader apply profiles by declaration instead of
 * re-running the two scene traversals and the name-based role inference below.
 */
export function configureAuthoredMaterialProfiles(root, { assetId = null, record = null } = {}) {
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
        if (record) record(material, correctionRole, uvMaterials.has(material));
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
      if (record) record(material, role, uvMaterials.has(material));
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
