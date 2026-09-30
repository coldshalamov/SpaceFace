// Illustrated industrial surfaces: shape the light, never quantize the texture.
// Runs inside the existing opaque material pass, with no targets, extra draws or textures.
//
// v10-v13 (the Look, 2026-09-30): every constant that decides the vibe is a shared Look
// uniform owned by src/render/look.js (authored in src/data/lookMoods.js), and smooth paint
// gains a clear coat — a sharp second specular lobe (sun glint + mirrored environment) and a
// coloured grazing rim. The pastel albedo lift is gone: paint shows its authored value.
import { Color, Vector3 } from 'three';
import { HULL_LAYOUT_GLSL } from './illustratedHullLayout.js';
import { LOOK_SURFACE_UNIFORMS } from './look.js';
export const ILLUSTRATED_SURFACE_KEY = 'spaceface-illustrated-surface-v13';
const TAG = 'spacefaceIllustratedSurfaceHook';
const LIGHT_NEEDLE = '#include <lights_fragment_end>';
const OUTPUT_NEEDLE = 'vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;';

export const ILLUSTRATED_SURFACE_GLSL = /* glsl */`
  // Recover illumination independently of painted colour. This leaves markings, texture
  // gradients and material differences intact instead of posterizing final RGB.
  float sfPaintLuma = max(dot(diffuseColor.rgb * (1.0 - metalnessFactor), vec3(0.2126, 0.7152, 0.0722)), 0.025);
  vec3 sfLightRgb = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
  float sfLight = dot(sfLightRgb, vec3(0.2126, 0.7152, 0.0722)) / sfPaintLuma;
  // Frequency separation. sfLow is what the SMOOTH hull form receives: the indirect
  // irradiance plus the direct sun term rebuilt with the geometric normal through the same
  // Lambert factor the physical shader used (v9; was: bands keyed on the full perturbed
  // response). The difference sfResidual is everything the surface detail contributes —
  // normal-map scratches, roughness structure, event-light pools — and it passes through
  // unshaped. ALU only: one compile-time-unrolled pass over the directional rig, no
  // texture fetches, no new uniforms, no new program-key tokens.
  vec3 sfLowRgb = reflectedLight.indirectDiffuse;
  #if NUM_DIR_LIGHTS > 0
  for (int sfI = 0; sfI < NUM_DIR_LIGHTS; sfI++) {
    sfLowRgb += directionalLights[sfI].color * saturate(dot(nonPerturbedNormal, directionalLights[sfI].direction)) * BRDF_Lambert(material.diffuseColor);
  }
  #endif
  float sfLow = dot(sfLowRgb, vec3(0.2126, 0.7152, 0.0722)) / sfPaintLuma;
  float sfResidual = sfLight - sfLow;
  // Compress irradiance before shaping it: the sunlit roof receives >1.0 in the live
  // rig. Thresholding raw irradiance below 0.86 left almost the whole fleet in one band.
  // Rounded transitions describe pools of ink, with a broad lacquer light above them.
  // Keyed on sfLow so a scratch can never mint a spurious band edge.
  float sfExposure = sfLow / (0.85 + sfLow);
  float sfWidth = max(fwidth(sfExposure) * 1.25, 0.018);
  float sfPenumbra = smoothstep(0.28 - sfWidth, 0.39 + sfWidth, sfExposure);
  float sfBodyLight = smoothstep(0.47 - sfWidth, 0.56 + sfWidth, sfExposure);
  float sfSunlight = smoothstep(0.65 - sfWidth, 0.70 + sfWidth, sfExposure);
  float sfBands = 0.11 + 0.235 * sfPenumbra + 0.64 * sfBodyLight + 0.64 * sfSunlight;
  // The band share is a Look value (v9 shipped a fixed 0.55): the graphic pools keep the
  // broad read while the true low-frequency response and the full residual keep PBR material
  // response alive — highlights pool on polish, panel relief shades, flashes light.
  // How "finished" the surface is: 1 for smooth dielectric paint, toward 0 for rough stone and
  // for metal. It gates the clear coat below, and it scales the graphic treatment here: the
  // saturated shadow colour and hard light bands are a lacquer look, and on a rough faceted
  // rock they turn every facet into a harlequin patch. Stone keeps a softer, greyer version.
  float sfFinish = (1.0 - 0.85 * metalnessFactor) * (1.0 - smoothstep(0.50, 0.95, roughnessFactor));
  float sfStyle = 0.35 + 0.65 * sfFinish;
  float sfShaped = mix(sfLow, sfBands, sfLookBandMix * sfStyle) + sfResidual;
  vec3 sfInkTint = mix(sfLookShadowTint, sfLookLightTint, sfBodyLight);
  sfInkTint = mix(vec3(dot(sfInkTint, vec3(0.2126, 0.7152, 0.0722))), sfInkTint, sfStyle);
  vec3 sfLightScale = sfInkTint * (sfShaped / max(sfLight, 0.025));
  reflectedLight.directDiffuse *= sfLightScale;
  reflectedLight.indirectDiffuse *= sfLightScale;
  // Geometric normals, not normal-map scratches: contours belong to the hull form.
  float sfFacing = abs(dot(nonPerturbedNormal, geometryViewDir));
  float sfContour = 1.0 - sfLookContour * (1.0 - smoothstep(0.09, 0.38, sfFacing));
  float sfGrazing = clamp(1.0 - sfFacing, 0.0, 1.0);
  // Clear coat. Smooth dielectric paint carries a lacquer layer; rough stone, dry ceramic and
  // bare metal (which already mirrors through its base lobe) do not. The weight comes from
  // the material's own roughness/metalness, so the panel texture's roughness structure
  // breaks the gloss up per plate and no per-material state is needed.
  float sfCoatWeight = sfLookCoat * sfFinish;
  vec3 sfCoatLight = vec3(0.0);
  vec3 sfRimLight = vec3(0.0);
  if (sfCoatWeight > 0.004) {
    // Widen the lobe where the form curves faster than a pixel (bevels at chase zoom), the
    // same geometric anti-aliasing the base lobe uses, so glints do not crawl.
    vec3 sfNormalDelta = max(abs(dFdx(nonPerturbedNormal)), abs(dFdy(nonPerturbedNormal)));
    float sfCoatRough = clamp(sfLookCoatRoughness
      + max(max(sfNormalDelta.x, sfNormalDelta.y), sfNormalDelta.z), 0.06, 1.0);
    float sfCoatAlpha = sfCoatRough * sfCoatRough;
    float sfCoatAlpha2 = sfCoatAlpha * sfCoatAlpha;
    #if NUM_DIR_LIGHTS > 0
    for (int sfJ = 0; sfJ < NUM_DIR_LIGHTS; sfJ++) {
      vec3 sfToLight = directionalLights[sfJ].direction;
      float sfNoL = saturate(dot(nonPerturbedNormal, sfToLight));
      float sfNoH = saturate(dot(nonPerturbedNormal, normalize(sfToLight + geometryViewDir)));
      float sfLobe = sfNoH * sfNoH * (sfCoatAlpha2 - 1.0) + 1.0;
      sfCoatLight += directionalLights[sfJ].color
        * (sfLookCoatSun * sfNoL * 0.25 * sfCoatAlpha2 / (PI * sfLobe * sfLobe));
    }
    #endif
    #ifdef USE_ENVMAP
    sfCoatLight += getIBLRadiance(geometryViewDir, nonPerturbedNormal, sfCoatRough) * sfLookCoatEnv;
    #endif
    // Schlick over a lacquer F0: faint facing the camera, rising to the Look's edge
    // reflectance at the limb (a physical coat reaches 1; a lower cap keeps pale paint
    // from washing out where a wall turns away).
    float sfCoatFresnel = 0.05 + sfLookCoatEdge * pow(sfGrazing, 5.0);
    sfCoatLight *= sfLookCoatTint * (sfCoatWeight * sfCoatFresnel);
    // Edge light: the hull limb picks up the mood's rim hue. Brighter on the unlit side,
    // where it is the only thing separating a dark hull from black space.
    sfRimLight = sfLookRim * (sfLookRimStrength * sfCoatWeight
      * pow(sfGrazing, sfLookRimPower) * (1.0 - 0.55 * sfBodyLight));
  }
`;

const THREE_DEFAULT_PROGRAM_KEY_PARTS = new Set([
  '',
  'MeshStandardMaterial',
  'MeshPhysicalMaterial',
  'MeshBasicMaterial',
  'standard',
  'physical',
  'basic',
]);
const PACKED_ORM_FAMILY_TOKEN = 'spaceface-packed-orm-single-sample-v1';
const ROUGHNESS_BREAKUP_FAMILY_TOKEN = 'spaceface-surface-breakup-v4-file-scope';
const FAMILY_TOKEN_MAX_LENGTH = 96;

function isLeftoverProgramKeyNoise(token) {
  if (!token || THREE_DEFAULT_PROGRAM_KEY_PARTS.has(token)) return true;
  if (token.length > FAMILY_TOKEN_MAX_LENGTH) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) return true;
  // Packed-ORM compose concatenates onBeforeCompile.toString(), which embeds GLSL `|` and quotes.
  // Those fragments mint a program per clone if they survive as family tokens.
  return !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(token);
}

function receiptFamilyTokens(material) {
  const data = material && material.userData;
  if (!data) return [];
  const tokens = [];
  if (data.spacefacePackedOrmSingleSample === true) tokens.push(PACKED_ORM_FAMILY_TOKEN);
  if (data.spacefaceRoughnessBreakup === true) tokens.push(ROUGHNESS_BREAKUP_FAMILY_TOKEN);
  if (data.spacefaceIllustratedSurface) tokens.push(String(data.spacefaceIllustratedSurface));
  return tokens;
}

/**
 * Keep shader-family tokens (packed-ORM, breakup, illustration). Drop Three type names,
 * UUID uniqueness, and onBeforeCompile source so a new hull paint binds textures without
 * minting a program.
 */
export function canonicalizeSurfaceProgramFamilyKey(previousKey, extraToken) {
  const seen = new Set();
  const parts = [];
  const push = (value) => {
    const token = String(value || '').trim();
    if (isLeftoverProgramKeyNoise(token) || seen.has(token)) return;
    seen.add(token);
    parts.push(token);
  };
  for (const piece of String(previousKey || '').split('|')) push(piece);
  push(extraToken);
  return parts.join('|');
}

/**
 * Rewrite leftover unique keys on Standard/Physical materials after compose clones.
 * ShaderMaterial identities stay untouched. Does not force needsUpdate — first bind
 * happens before first compile so the family key is the one that compiles.
 */
export function canonicalizeInstalledSurfaceProgramKey(material) {
  if (!material || (!material.isMeshStandardMaterial && !material.isMeshPhysicalMaterial)) return false;
  const current = typeof material.customProgramCacheKey === 'function'
    ? String(material.customProgramCacheKey() || '')
    : '';
  const compileSource = typeof material.onBeforeCompile === 'function'
    ? String(material.onBeforeCompile.toString() || '')
    : '';
  const source = current && current === compileSource ? '' : current;
  let next = canonicalizeSurfaceProgramFamilyKey(source);
  for (const token of receiptFamilyTokens(material)) {
    next = canonicalizeSurfaceProgramFamilyKey(next, token);
  }
  if (typeof material.customProgramCacheKey === 'function' && next === current) return false;
  material.customProgramCacheKey = () => next;
  return true;
}

export function canonicalizeObjectSurfaceProgramKeys(root) {
  if (!root) return 0;
  let changed = 0;
  const visit = (material) => {
    if (canonicalizeInstalledSurfaceProgramKey(material)) changed += 1;
  };
  if (typeof root.traverse === 'function') {
    root.traverse((object) => {
      const list = Array.isArray(object.material) ? object.material
        : object.material ? [object.material] : [];
      for (const material of list) visit(material);
    });
    return changed;
  }
  visit(root);
  return changed;
}

/** Chain existing packed-ORM/breakup hooks. One version key for every colour and hull. */
export function installIllustratedSurface(material) {
  if (!material || (!material.isMeshStandardMaterial && !material.isMeshPhysicalMaterial)
      || material.transparent || material.opacity < 1 || material.transmission > 0) return false;
  if (material.onBeforeCompile?.[TAG] === ILLUSTRATED_SURFACE_KEY) return true;
  const previousHook = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey?.() || '';
  function illustratedSurfaceShader(shader, renderer) {
    previousHook?.call(this, shader, renderer);
    if (!shader.fragmentShader.includes(LIGHT_NEEDLE) || !shader.fragmentShader.includes(OUTPUT_NEEDLE)) {
      throw new Error('[render] illustrated surface: physical lighting shader contract changed');
    }
    const pigment = this.userData?.spacefaceIllustratedPigment;
    shader.uniforms ??= {};
    // Shared objects, not copies: look.js writes one value and every hull program reads it.
    Object.assign(shader.uniforms, LOOK_SURFACE_UNIFORMS);
    shader.uniforms.sfPaintPigment = { value: new Color(pigment?.color || '#ffffff') };
    shader.uniforms.sfPaintStrength = { value: pigment?.strength || 0 };
    const layout = this.userData?.spacefaceHullLayout;
    shader.uniforms.sfLayoutKind = { value: layout?.kind || 0 };
    shader.uniforms.sfLayoutStrength = { value: layout?.strength || 0 };
    shader.uniforms.sfLayoutAccent = { value: new Color(layout?.accent || '#ffffff') };
    shader.uniforms.sfHullCenter = { value: new Vector3().fromArray(layout?.center || [0, 0, 0]) };
    shader.uniforms.sfHullSize = { value: new Vector3().fromArray(layout?.size || [1, 1, 1]) };
    if (shader.vertexShader) shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 sfHullPosition;\nvarying vec3 vSfHullPosition;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSfHullPosition = sfHullPosition;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float sfLookAlbedoGamma;
        uniform float sfLookAlbedoSaturation;
        uniform float sfLookBandMix;
        uniform float sfLookContour;
        uniform float sfLookCoat;
        uniform float sfLookCoatRoughness;
        uniform float sfLookCoatEnv;
        uniform float sfLookCoatSun;
        uniform float sfLookCoatEdge;
        uniform float sfLookPaintCeiling;
        uniform float sfLookRimStrength;
        uniform float sfLookRimPower;
        uniform vec3 sfLookShadowTint;
        uniform vec3 sfLookLightTint;
        uniform vec3 sfLookCoatTint;
        uniform vec3 sfLookRim;
        uniform vec3 sfPaintPigment;
        uniform float sfPaintStrength;
        uniform float sfLayoutKind;
        uniform float sfLayoutStrength;
        uniform vec3 sfLayoutAccent;
        uniform vec3 sfHullCenter;
        uniform vec3 sfHullSize;
        varying vec3 vSfHullPosition;
      `)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float sfSurfaceRelief = 0.0;
        // Materials carrying neither pigment nor layout produce only identity contributions
        // here (mix(c, x, 0) == c), so the whole chain skips under one uniform-coherent
        // predicate — no new program key, no per-pixel branch. Layout still reads
        // sfAlbedoY/sfNeutralPaint, so the shared terms sit inside the disjunction.
        if (sfPaintStrength > 0.0 || sfLayoutStrength > 0.0) {
          float sfAlbedoY = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
          float sfChroma = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b))
            - min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b));
          float sfNeutralPaint = 1.0 - smoothstep(0.70, 1.45, sfChroma / max(sfAlbedoY, 0.02));
          if (sfPaintStrength > 0.0) {
            // Pigment carries its own value. Normalizing it to the source's white roof value
            // clips the coloured channels into pastel under the sector key light.
            float sfDepthTone = 1.0 - 0.10 * smoothstep(0.12, 0.60, 1.0 - sfAlbedoY);
            vec3 sfLacquer = sfPaintPigment * ((1.65 * sfAlbedoY / (0.32 + sfAlbedoY)) * sfDepthTone);
            diffuseColor.rgb = mix(diffuseColor.rgb, sfLacquer, sfNeutralPaint * sfPaintStrength);
          }
          if (sfLayoutStrength > 0.0) { ${HULL_LAYOUT_GLSL} }
        }
      `)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        // Recessed paint-panel joints catch light through the existing material normal. Their
        // relief disappears before becoming subpixel; source normal-map manufacture remains.
        if (sfLayoutStrength > 0.0) {
          vec3 sfDx = dFdx(-vViewPosition), sfDy = dFdy(-vViewPosition);
          vec3 sfR1 = cross(sfDy, normal), sfR2 = cross(normal, sfDx);
          float sfDet = dot(sfDx, sfR1);
          vec3 sfGradient = sign(sfDet) * (dFdx(sfSurfaceRelief) * sfR1 + dFdy(sfSurfaceRelief) * sfR2);
          normal = normalize(max(abs(sfDet), 0.000001) * normal - sfGradient);
        }
      `)
      // Paint value and chroma are Look values: gamma 1 shows the authored albedo (the retired
      // pass lifted it by pow 0.80 into pastel), saturation deepens colour at constant luminance.
      // Illustrated metal retains a small diffuse response so its silhouette and paint read
      // against space even when the reflected environment is nearly black. Texture metal masks
      // still separate materials; the source assets and their calibrated values are untouched.
      .replace('#include <lights_physical_fragment>', `
        diffuseColor.rgb = pow(max(diffuseColor.rgb, vec3(0.0)), vec3(sfLookAlbedoGamma));
        diffuseColor.rgb = max(mix(vec3(dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722))),
          diffuseColor.rgb, sfLookAlbedoSaturation), vec3(0.0));
        metalnessFactor *= 0.80;
        #include <lights_physical_fragment>`)
      .replace(LIGHT_NEEDLE, LIGHT_NEEDLE + '\n' + ILLUSTRATED_SURFACE_GLSL)
      // The contour belongs to paint. The coat and the rim sit outside it, so a polished edge
      // catches a bright accent over the dark contour instead of becoming dead black.
      // Paint never emits: lit pigment rolls off under the Look's ceiling, which sits below the
      // bloom threshold, so a sunlit ivory wall keeps its form instead of glowing. Coat, rim,
      // specular and lamps are light and stay free to bloom.
      .replace(OUTPUT_NEEDLE, `
        vec3 sfPaint = totalDiffuse * sfContour;
        float sfPaintY = dot(sfPaint, vec3(0.2126, 0.7152, 0.0722));
        // Gloss needs headroom: on pigment already near the ceiling (sunlit ivory) the coat and
        // rim fade, or a pale wall would stack them into a glowing white slab.
        float sfHeadroom = 1.0 - 0.72 * smoothstep(sfLookPaintCeiling * 0.45, sfLookPaintCeiling, sfPaintY);
        float sfKnee = sfLookPaintCeiling * 0.6;
        if (sfPaintY > sfKnee) {
          float sfOver = sfPaintY - sfKnee;
          float sfRoom = sfLookPaintCeiling - sfKnee;
          sfPaint *= (sfKnee + sfOver * sfRoom / (sfOver + sfRoom)) / sfPaintY;
        }
        vec3 outgoingLight = sfPaint + (sfCoatLight + sfRimLight) * sfHeadroom + totalSpecular + totalEmissiveRadiance;`);
  }
  Object.assign(illustratedSurfaceShader, previousHook);
  illustratedSurfaceShader[TAG] = ILLUSTRATED_SURFACE_KEY;
  material.onBeforeCompile = illustratedSurfaceShader;
  const familyKey = canonicalizeSurfaceProgramFamilyKey(previousKey, ILLUSTRATED_SURFACE_KEY);
  material.customProgramCacheKey = () => familyKey;
  material.userData.spacefaceIllustratedSurface = ILLUSTRATED_SURFACE_KEY;
  material.needsUpdate = true;
  return true;
}
