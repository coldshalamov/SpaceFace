// A single bounded authored shade region in the existing opaque pass. This is a
// local art-direction field, not geometry occlusion or a claim of a closed cave.
// Local physical lamps and emission stay independent of broad exterior lighting.
import { Vector3 } from 'three';
import { NOCTURNE_PROBE_UNIFORMS } from './probes.js';

export const SHADE_REGION_UNIFORMS = Object.freeze({
  sfShadeEnabled: { value: 0 },
  sfShadeCenter: { value: new Vector3() },
  sfShadeHalfSize: { value: new Vector3() },
  sfShadeFalloff: { value: 1 },
  sfShadeFloor: { value: 1 },
});
let owner = null;
export function claimShadeRegion(spec) {
  const token = {}; owner = token;
  SHADE_REGION_UNIFORMS.sfShadeHalfSize.value.set(spec.halfExtents.x, spec.halfExtents.y, spec.halfExtents.z);
  SHADE_REGION_UNIFORMS.sfShadeFalloff.value = spec.feather;
  SHADE_REGION_UNIFORMS.sfShadeFloor.value = spec.broadFloor;
  SHADE_REGION_UNIFORMS.sfShadeEnabled.value = 0;
  return {
    update(center, enabled) {
      if (owner !== token) return;
      const valid = Number.isFinite(center?.x) && Number.isFinite(center?.y) && Number.isFinite(center?.z);
      SHADE_REGION_UNIFORMS.sfShadeEnabled.value = enabled && valid ? 1 : 0;
      if (valid) SHADE_REGION_UNIFORMS.sfShadeCenter.value.copy(center);
    },
    release() {
      if (owner !== token) return;
      owner = null; SHADE_REGION_UNIFORMS.sfShadeEnabled.value = 0;
    },
  };
}
// CPU equivalent for boundary/coordinate tests, not a simulation lighting rule.
export function shadeRegionGain(position, center) {
  const u = SHADE_REGION_UNIFORMS, h = u.sfShadeHalfSize.value;
  const edge = Math.min(h.x - Math.abs(position.x - center.x), h.y - Math.abs(position.y - center.y),
    h.z - Math.abs(position.z - center.z));
  const t = Math.max(0, Math.min(1, edge / u.sfShadeFalloff.value));
  return 1 - (1 - u.sfShadeFloor.value) * t * t * (3 - 2 * t);
}
export function installShadeRegionShader(shader) {
  if (shader.fragmentShader.includes('uniform float sfShadeEnabled;')) return;
  Object.assign(shader.uniforms, SHADE_REGION_UNIFORMS);
  // This shared matrix is refreshed by Nocturne's existing per-camera probe pass.
  shader.uniforms.sfNocturneViewToWorld = NOCTURNE_PROBE_UNIFORMS.sfNocturneViewToWorld;
  shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
    uniform float sfShadeEnabled;
    uniform vec3 sfShadeCenter;
    uniform vec3 sfShadeHalfSize;
    uniform float sfShadeFalloff;
    uniform float sfShadeFloor;
  `);
}
export const SHADE_REGION_GAIN_GLSL = /* glsl */`
  if (sfShadeEnabled > 0.5) {
    vec3 sfShadePosition = (sfNocturneViewToWorld * vec4(-vViewPosition, 1.0)).xyz;
    vec3 sfShadeEdge = sfShadeHalfSize - abs(sfShadePosition - sfShadeCenter);
    float sfShadeWeight = smoothstep(0.0, sfShadeFalloff, min(sfShadeEdge.x, min(sfShadeEdge.y, sfShadeEdge.z)));
    sfShadeGain = mix(1.0, sfShadeFloor, sfShadeWeight);
  }
`;
