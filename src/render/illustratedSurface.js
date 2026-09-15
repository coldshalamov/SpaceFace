// Illustrated industrial surfaces: shape the light, never quantize the texture.
// Runs inside the existing opaque material pass, with no targets, extra draws or textures.
export const ILLUSTRATED_SURFACE_KEY = 'spaceface-illustrated-surface-v3';
const TAG = 'spacefaceIllustratedSurfaceHook';
const LIGHT_NEEDLE = '#include <lights_fragment_end>';
const OUTPUT_NEEDLE = 'vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;';

export const ILLUSTRATED_SURFACE_GLSL = /* glsl */`
  // Recover illumination independently of painted colour. This leaves markings, texture
  // gradients and material differences intact instead of posterizing final RGB.
  float sfPaintLuma = max(dot(diffuseColor.rgb * (1.0 - metalnessFactor), vec3(0.2126, 0.7152, 0.0722)), 0.025);
  float sfLight = dot(reflectedLight.directDiffuse + reflectedLight.indirectDiffuse, vec3(0.2126, 0.7152, 0.0722)) / sfPaintLuma;
  float sfWidth = max(fwidth(sfLight) * 1.25, 0.025);
  float sfBands = 0.16
    + 0.20 * smoothstep(0.22 - sfWidth, 0.22 + sfWidth, sfLight)
    + 0.28 * smoothstep(0.48 - sfWidth, 0.48 + sfWidth, sfLight)
    + 0.36 * smoothstep(0.82 - sfWidth, 0.82 + sfWidth, sfLight);
  // The continuous component keeps rotating hulls smooth across the painted terminators.
  float sfShaped = mix(sfLight, sfBands, 0.68);
  vec3 sfInkTint = mix(vec3(0.78, 0.90, 1.12), vec3(1.06, 1.015, 0.94), smoothstep(0.18, 0.72, sfLight));
  vec3 sfLightScale = sfInkTint * (sfShaped / max(sfLight, 0.025));
  reflectedLight.directDiffuse *= sfLightScale;
  reflectedLight.indirectDiffuse *= sfLightScale;
  // Geometric normals, not normal-map scratches: contours belong to the hull form.
  float sfFacing = abs(dot(nonPerturbedNormal, geometryViewDir));
  float sfContour = 1.0 - 0.30 * (1.0 - smoothstep(0.08, 0.30, sfFacing));
`;

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
    shader.fragmentShader = shader.fragmentShader
      // Illustrated metal retains a small diffuse response so its silhouette and paint read
      // against space even when the reflected environment is nearly black. Texture metal masks
      // still separate materials; the source assets and their calibrated values are untouched.
      .replace('#include <lights_physical_fragment>', 'diffuseColor.rgb = pow(max(diffuseColor.rgb, vec3(0.0)), vec3(0.80));\nmetalnessFactor *= 0.80;\n#include <lights_physical_fragment>')
      .replace(LIGHT_NEEDLE, LIGHT_NEEDLE + '\n' + ILLUSTRATED_SURFACE_GLSL)
      .replace(OUTPUT_NEEDLE, 'vec3 outgoingLight = (totalDiffuse + totalSpecular) * sfContour + totalEmissiveRadiance;');
  }
  Object.assign(illustratedSurfaceShader, previousHook);
  illustratedSurfaceShader[TAG] = ILLUSTRATED_SURFACE_KEY;
  material.onBeforeCompile = illustratedSurfaceShader;
  material.customProgramCacheKey = () => `${previousKey}|${ILLUSTRATED_SURFACE_KEY}`;
  material.userData.spacefaceIllustratedSurface = ILLUSTRATED_SURFACE_KEY;
  material.needsUpdate = true;
  return true;
}
