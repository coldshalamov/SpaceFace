// Local authored irradiance / analytic reflection probes. These are deliberately NOT a
// simulation of dynamic GI or a cubemap of scene geometry. Each ellipsoid carries a low-order
// directional diffuse field and a roughness-filtered spherical radiance lobe, in linear HDR.
// Sampling in the physical shader lights moving/instanced objects without material clones.
import { Color, Matrix4, Vector3, Vector4 } from 'three';
import { NOCTURNE_CONTENT_LIMITS } from '../../data/nocturneLighting.js';

export const NOCTURNE_PROBE_CAPACITY = NOCTURNE_CONTENT_LIMITS.maxProbes;
export const NOCTURNE_PROBE_SHADER_KEY = 'nocturne-local-probes-v1';
const DEFAULT_OPTIONS = Object.freeze({});
const vectors = (Type) => Array.from({ length: NOCTURNE_PROBE_CAPACITY }, () => new Type());
export const NOCTURNE_PROBE_UNIFORMS = Object.freeze({
  sfNocturneProbeCount: { value: 0 },
  sfNocturneViewToWorld: { value: new Matrix4() },
  sfNocturneProbeCenter: { value: vectors(Vector3) },
  sfNocturneProbeInvRadii: { value: vectors(Vector3) },
  sfNocturneProbeDirection: { value: vectors(Vector3) },
  sfNocturneProbeColor: { value: vectors(Color) },
  sfNocturneProbeAmbient: { value: vectors(Color) },
  sfNocturneProbeParams: { value: vectors(Vector4) },
});

export const NOCTURNE_PROBE_PARS_GLSL = /* glsl */`
  uniform int sfNocturneProbeCount;
  uniform mat4 sfNocturneViewToWorld;
  uniform vec3 sfNocturneProbeCenter[4];
  uniform vec3 sfNocturneProbeInvRadii[4];
  uniform vec3 sfNocturneProbeDirection[4];
  uniform vec3 sfNocturneProbeColor[4];
  uniform vec3 sfNocturneProbeAmbient[4];
  // diffuse gain, specular gain, lobe sharpness, enabled
  uniform vec4 sfNocturneProbeParams[4];
`;
export const NOCTURNE_PROBE_SAMPLE_GLSL = /* glsl */`
  // vViewPosition comes from Three's fully transformed vertex path, including instanceMatrix,
  // batching, skinning and morphs. No origin-only approximation for instanced terrain.
  if (sfNocturneProbeCount > 0) {
    vec3 sfProbePosition = (sfNocturneViewToWorld * vec4(-vViewPosition, 1.0)).xyz;
    vec3 sfProbeNormal = normalize(mat3(sfNocturneViewToWorld) * geometryNormal);
    vec3 sfProbeView = normalize(mat3(sfNocturneViewToWorld) * geometryViewDir);
    vec3 sfProbeReflection = reflect(-sfProbeView, sfProbeNormal);
    for (int sfP = 0; sfP < 4; sfP++) {
      if (sfP >= sfNocturneProbeCount) break;
      vec3 sfProbeDelta = (sfProbePosition - sfNocturneProbeCenter[sfP]) * sfNocturneProbeInvRadii[sfP];
      float sfProbeRadius = length(sfProbeDelta);
      // Compact support: no fill or reflections outside the authored region.
      float sfProbeWeight = (1.0 - smoothstep(0.35, 1.0, sfProbeRadius)) * sfNocturneProbeParams[sfP].w;
      vec3 sfProbeAxis = sfNocturneProbeDirection[sfP];
      float sfProbeCosine = max(0.0, 0.5 + 0.5 * dot(sfProbeNormal, sfProbeAxis));
      #if defined(RE_IndirectDiffuse)
        irradiance += sfProbeWeight * sfNocturneProbeParams[sfP].x
          * (sfNocturneProbeAmbient[sfP] + sfNocturneProbeColor[sfP] * sfProbeCosine);
      #endif
      #if defined(RE_IndirectSpecular)
        // Broaden and reduce the lobe as roughness grows; integrated lobe energy stays bounded.
        // This is an authored analytic environment response, not a reflected scene capture.
        float sfProbeRough2 = material.roughness * material.roughness;
        float sfProbeSharp = sfNocturneProbeParams[sfP].z;
        float sfProbeBroadening = 1.0 + sfProbeSharp * sfProbeRough2;
        float sfProbeLobe = exp((dot(sfProbeReflection, sfProbeAxis) - 1.0)
          * sfProbeSharp / sfProbeBroadening) / sfProbeBroadening;
        radiance += sfProbeWeight * sfNocturneProbeParams[sfP].y
          * (sfNocturneProbeColor[sfP] * sfProbeLobe + sfNocturneProbeAmbient[sfP] * 0.15);
      #endif
    }
  }
`;

/** Compose this inside a physical-material onBeforeCompile hook before lights_fragment_end. */
export function installNocturneProbeShader(shader) {
  if (!shader?.fragmentShader || shader.fragmentShader.includes('uniform int sfNocturneProbeCount;')) return false;
  const needle = '#include <lights_fragment_end>';
  if (!shader.fragmentShader.includes(needle)) throw new Error('NOCTURNE probes require Three physical lighting chunks');
  shader.uniforms ??= {};
  Object.assign(shader.uniforms, NOCTURNE_PROBE_UNIFORMS);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\n' + NOCTURNE_PROBE_PARS_GLSL)
    .replace(needle, NOCTURNE_PROBE_SAMPLE_GLSL + '\n' + needle);
  return true;
}

function finite(value, fallback) { return Number.isFinite(value) ? value : fallback; }

export class NocturneProbes {
  constructor() {
    this.count = 0;
    this.enabled = true;
    this.uniforms = NOCTURNE_PROBE_UNIFORMS;
    this._reflectionBindings = new Map();
  }
  begin(camera) {
    this.count = 0;
    if (camera?.matrixWorld) this.uniforms.sfNocturneViewToWorld.value.copy(camera.matrixWorld);
  }
  /** Write one already-admitted probe. All arguments are borrowed; no allocations per frame. */
  write(center, radii, profile, power = 1, direction = null) {
    if (this.count >= NOCTURNE_PROBE_CAPACITY || !profile || !this.enabled || !(power > 0)) return false;
    const i = this.count++;
    const u = this.uniforms;
    u.sfNocturneProbeCenter.value[i].copy(center);
    u.sfNocturneProbeInvRadii.value[i].set(1 / Math.max(1, radii.x), 1 / Math.max(1, radii.y), 1 / Math.max(1, radii.z));
    const axis = u.sfNocturneProbeDirection.value[i];
    if (direction) axis.copy(direction); else axis.fromArray(profile.direction || [0, 1, 0]);
    if (axis.lengthSq() < 0.0001) axis.set(0, 1, 0); else axis.normalize();
    u.sfNocturneProbeColor.value[i].set(profile.color ?? 0xffffff);
    u.sfNocturneProbeAmbient.value[i].set(profile.ambient ?? 0);
    u.sfNocturneProbeParams.value[i].set(
      Math.max(0, finite(profile.intensity, 0)) * power,
      Math.max(0, finite(profile.specular, 0)) * power,
      Math.max(1, Math.min(64, finite(profile.sharpness, 12))), 1,
    );
    return true;
  }
  end() { this.uniforms.sfNocturneProbeCount.value = this.enabled ? this.count : 0; }
  clear() { this.count = 0; this.uniforms.sfNocturneProbeCount.value = 0; }

  /**
   * Optional asset contract for an actual externally baked/pre-filtered local reflection.
   * Pass a PMREM CubeUV texture; it is borrowed, never disposed here. Clones are made once at
   * admission to keep another root sharing the material from receiving this environment.
   * This API does not capture scenes or manufacture a claim of captured reflections.
   */
  bindReflection(root, texture, intensity = 1) {
    if (!root?.traverse || !texture?.isTexture) return false;
    this.unbindReflection(root);
    const replacements = [];
    root.traverse((node) => {
      if (!node.material) return;
      const original = node.material;
      const map = (material) => {
        if (!material?.isMeshStandardMaterial && !material?.isMeshPhysicalMaterial) return material;
        const clone = material.clone();
        clone.onBeforeCompile = material.onBeforeCompile;
        clone.customProgramCacheKey = material.customProgramCacheKey;
        clone.envMap = texture;
        clone.envMapIntensity = Math.max(0, finite(intensity, 1));
        return clone;
      };
      const replacement = Array.isArray(original) ? original.map(map) : map(original);
      if (replacement !== original) { node.material = replacement; replacements.push({ node, original, replacement }); }
    });
    this._reflectionBindings.set(root, replacements);
    return replacements.length > 0;
  }
  unbindReflection(root, options = DEFAULT_OPTIONS) {
    const list = this._reflectionBindings.get(root);
    if (!list) return false;
    for (const entry of list) {
      if (entry.node.material === entry.replacement) entry.node.material = entry.original;
      const replacements = Array.isArray(entry.replacement) ? entry.replacement : [entry.replacement];
      const originals = Array.isArray(entry.original) ? entry.original : [entry.original];
      if (options.disposeGpu !== false) for (let i = 0; i < replacements.length; i++) {
        if (replacements[i] !== originals[i]) replacements[i]?.dispose?.();
      }
    }
    this._reflectionBindings.delete(root);
    return true;
  }
  dispose(options = DEFAULT_OPTIONS) {
    for (const root of this._reflectionBindings.keys()) this.unbindReflection(root, options);
    this.clear();
  }
}

/** CPU oracle for spatial support/normal dependence; output uses caller-owned THREE.Color. */
export function sampleNocturneDiffuseProbe(position, normal, center, radii, profile, out) {
  const dx = (position.x - center.x) / Math.max(1, radii.x);
  const dy = (position.y - center.y) / Math.max(1, radii.y);
  const dz = (position.z - center.z) / Math.max(1, radii.z);
  const r = Math.hypot(dx, dy, dz);
  const t = Math.max(0, Math.min(1, (r - 0.35) / 0.65));
  const weight = (1 - t * t * (3 - 2 * t)) * Math.max(0, finite(profile.intensity, 0));
  const dir = profile.direction || [0, 1, 0];
  const length = Math.hypot(dir[0], dir[1], dir[2]) || 1;
  const cosine = Math.max(0, 0.5 + 0.5 * (normal.x * dir[0] + normal.y * dir[1] + normal.z * dir[2]) / length);
  out.set(profile.color ?? 0xffffff).multiplyScalar(cosine * weight);
  // This oracle is called by tools/tests, not by the frame loop.
  out.add(new Color(profile.ambient ?? 0).multiplyScalar(weight));
  return out;
}
