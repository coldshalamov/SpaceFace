// Illustrated industrial surfaces: shape the light, never quantize the texture.
// Runs inside the existing opaque material pass, with no targets, extra draws or textures.
import { Color, Vector3 } from 'three';
import { HULL_LAYOUT_GLSL } from './illustratedHullLayout.js';
export const ILLUSTRATED_SURFACE_KEY = 'spaceface-illustrated-surface-v8';
const TAG = 'spacefaceIllustratedSurfaceHook';
const LIGHT_NEEDLE = '#include <lights_fragment_end>';
const OUTPUT_NEEDLE = 'vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;';

export const ILLUSTRATED_SURFACE_GLSL = /* glsl */`
  // Recover illumination independently of painted colour. This leaves markings, texture
  // gradients and material differences intact instead of posterizing final RGB.
  float sfPaintLuma = max(dot(diffuseColor.rgb * (1.0 - metalnessFactor), vec3(0.2126, 0.7152, 0.0722)), 0.025);
  float sfLight = dot(reflectedLight.directDiffuse + reflectedLight.indirectDiffuse, vec3(0.2126, 0.7152, 0.0722)) / sfPaintLuma;
  // Compress irradiance before shaping it: the sunlit roof receives >1.0 in the live
  // rig. Thresholding raw irradiance below 0.86 left almost the whole fleet in one band.
  // Rounded transitions describe pools of ink, with a broad lacquer light above them.
  float sfExposure = sfLight / (0.85 + sfLight);
  float sfWidth = max(fwidth(sfExposure) * 1.25, 0.018);
  float sfPenumbra = smoothstep(0.28 - sfWidth, 0.39 + sfWidth, sfExposure);
  float sfBodyLight = smoothstep(0.47 - sfWidth, 0.56 + sfWidth, sfExposure);
  float sfSunlight = smoothstep(0.65 - sfWidth, 0.70 + sfWidth, sfExposure);
  float sfBands = 0.11 + 0.235 * sfPenumbra + 0.64 * sfBodyLight + 0.64 * sfSunlight;
  // Keep a little continuous light so animation never becomes a hard toon switch.
  float sfShaped = mix(sfLight, sfBands, 0.88);
  vec3 sfInkTint = mix(vec3(0.61, 0.55, 1.13), vec3(1.11, 1.025, 0.88), sfBodyLight);
  vec3 sfLightScale = sfInkTint * (sfShaped / max(sfLight, 0.025));
  reflectedLight.directDiffuse *= sfLightScale;
  reflectedLight.indirectDiffuse *= sfLightScale;
  // Geometric normals, not normal-map scratches: contours belong to the hull form.
  float sfFacing = abs(dot(nonPerturbedNormal, geometryViewDir));
  float sfContour = 1.0 - 0.57 * (1.0 - smoothstep(0.09, 0.38, sfFacing));
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
        float sfAlbedoY = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
        float sfChroma = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b))
          - min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b));
        float sfNeutralPaint = 1.0 - smoothstep(0.70, 1.45, sfChroma / max(sfAlbedoY, 0.02));
        // Pigment carries its own value. Normalizing it to the source's white roof value
        // clips the coloured channels into pastel under the sector key light.
        vec3 sfLacquer = sfPaintPigment * (1.65 * sfAlbedoY / (0.32 + sfAlbedoY));
        diffuseColor.rgb = mix(diffuseColor.rgb, sfLacquer, sfNeutralPaint * sfPaintStrength);
        if (sfLayoutStrength > 0.0) { ${HULL_LAYOUT_GLSL} }
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
      // Illustrated metal retains a small diffuse response so its silhouette and paint read
      // against space even when the reflected environment is nearly black. Texture metal masks
      // still separate materials; the source assets and their calibrated values are untouched.
      .replace('#include <lights_physical_fragment>', 'diffuseColor.rgb = pow(max(diffuseColor.rgb, vec3(0.0)), vec3(0.80));\nmetalnessFactor *= 0.80;\n#include <lights_physical_fragment>')
      .replace(LIGHT_NEEDLE, LIGHT_NEEDLE + '\n' + ILLUSTRATED_SURFACE_GLSL)
      // Ink belongs to paint. Keeping the optical highlight outside it lets a polished edge
      // catch a thin bright accent over the dark contour instead of becoming dead black.
      .replace(OUTPUT_NEEDLE, 'vec3 outgoingLight = totalDiffuse * sfContour + totalSpecular + totalEmissiveRadiance;');
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
