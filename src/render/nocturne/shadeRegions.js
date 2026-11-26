// Bounded art-direction shade regions in the shared opaque pass.
// Region gains default to zero outside claimed bounds and never emit new GPU shader programs.
// When active on geological rock materials inside Ceres Ninth Mouth, region orientation and
// pocket weights feed per-facet LOOK-04 shade steps while local lamps and emissives stay untouched.
import { Vector3, Vector4 } from 'three';
import { NOCTURNE_PROBE_UNIFORMS } from './probes.js';

export const MAX_SHADE_REGIONS = 8;

export const SHADE_REGION_UNIFORMS = Object.freeze({
  sfShadeEnabled: { value: 0 },
  sfShadeCount: { value: 0 },
  sfShadeCenters: { value: Array.from({ length: MAX_SHADE_REGIONS }, () => new Vector3()), needsUpdate: false },
  sfShadeHalfSizes: { value: Array.from({ length: MAX_SHADE_REGIONS }, () => new Vector3()), needsUpdate: false },
  // x: feather falloff (>0), y: broad pocket floor [0..1], z: facet step bias [-1..1], w: facet contrast [0..1.5]
  sfShadeParams: { value: Array.from({ length: MAX_SHADE_REGIONS }, () => new Vector4(1, 1, 0, 0)), needsUpdate: false },
  // xyz: preferred unit world normal, w: directional selectivity [0..1]
  sfShadeNormals: { value: Array.from({ length: MAX_SHADE_REGIONS }, () => new Vector4(0, 0, 0, 0)), needsUpdate: false },
});

const claims = new Map();

function finiteOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function normalizeNormal(spec) {
  const src = spec?.normal;
  if (!src) return { x: 0, y: 0, z: 0, w: 0 };
  const x = finiteOr(src.x, 0);
  const y = finiteOr(src.y, 0);
  const z = finiteOr(src.z, 0);
  const w = Math.max(0, Math.min(1, finiteOr(src.w, 0)));
  const len = Math.hypot(x, y, z);
  if (!(len > 1e-5) || w <= 0) return { x: 0, y: 0, z: 0, w: 0 };
  return { x: x / len, y: y / len, z: z / len, w };
}

function syncUniforms() {
  const u = SHADE_REGION_UNIFORMS;
  const centers = u.sfShadeCenters.value;
  const halfSizes = u.sfShadeHalfSizes.value;
  const params = u.sfShadeParams.value;
  const normals = u.sfShadeNormals.value;

  let slot = 0;
  for (const entry of claims.values()) {
    if (!entry.enabled || slot >= MAX_SHADE_REGIONS) continue;
    centers[slot].copy(entry.center);
    halfSizes[slot].copy(entry.halfExtents);
    params[slot].set(entry.feather, entry.broadFloor, entry.facetBias, entry.facetContrast);
    normals[slot].set(entry.normal.x, entry.normal.y, entry.normal.z, entry.normal.w);
    slot += 1;
  }

  const enabled = slot > 0;
  u.sfShadeCount.value = slot;
  u.sfShadeEnabled.value = enabled ? 1 : 0;
  // Only the control uniforms matter when the shader's region branch is disabled.
  // Keep the stock upload path for every material draw once any claim is active.
  u.sfShadeCenters.needsUpdate = enabled;
  u.sfShadeHalfSizes.needsUpdate = enabled;
  u.sfShadeParams.needsUpdate = enabled;
  u.sfShadeNormals.needsUpdate = enabled;

  for (let i = slot; i < MAX_SHADE_REGIONS; i += 1) {
    centers[i].set(0, 0, 0);
    halfSizes[i].set(0, 0, 0);
    params[i].set(1, 1, 0, 0);
    normals[i].set(0, 0, 0, 0);
  }
}

export function claimShadeRegion(spec = {}) {
  const key = spec && spec.id != null ? String(spec.id) : 'default';
  const token = {};
  const normal = normalizeNormal(spec);
  const half = spec?.halfExtents || {};
  const entry = {
    token,
    key,
    center: new Vector3(
      finiteOr(spec?.center?.x, 0),
      finiteOr(spec?.center?.y, 0),
      finiteOr(spec?.center?.z, 0),
    ),
    halfExtents: new Vector3(
      Math.max(0, finiteOr(half.x, 1)),
      Math.max(0, finiteOr(half.y, 1)),
      Math.max(0, finiteOr(half.z, 1)),
    ),
    feather: Math.max(1e-4, finiteOr(spec?.feather, 1)),
    broadFloor: Math.max(0, Math.min(1, finiteOr(spec?.broadFloor, 1))),
    facetBias: Math.max(-1, Math.min(1, finiteOr(spec?.facetBias, 0))),
    facetContrast: Math.max(0, Math.min(1.5, finiteOr(spec?.facetContrast, 1))),
    normal,
    enabled: false,
  };
  claims.set(key, entry);
  syncUniforms();

  return {
    update(center, enabled = true, patch = null) {
      if (claims.get(key)?.token !== token) return;
      const valid = Boolean(
        center
        && Number.isFinite(center.x)
        && Number.isFinite(center.y)
        && Number.isFinite(center.z),
      );
      if (valid) entry.center.set(center.x, center.y, center.z);
      if (patch && typeof patch === 'object') {
        if (patch.halfExtents) {
          entry.halfExtents.set(
            Math.max(0, finiteOr(patch.halfExtents.x, entry.halfExtents.x)),
            Math.max(0, finiteOr(patch.halfExtents.y, entry.halfExtents.y)),
            Math.max(0, finiteOr(patch.halfExtents.z, entry.halfExtents.z)),
          );
        }
        if (patch.feather != null) entry.feather = Math.max(1e-4, finiteOr(patch.feather, entry.feather));
        if (patch.broadFloor != null) entry.broadFloor = Math.max(0, Math.min(1, finiteOr(patch.broadFloor, entry.broadFloor)));
        if (patch.facetBias != null) entry.facetBias = Math.max(-1, Math.min(1, finiteOr(patch.facetBias, entry.facetBias)));
        if (patch.facetContrast != null) entry.facetContrast = Math.max(0, Math.min(1.5, finiteOr(patch.facetContrast, entry.facetContrast)));
        if (patch.normal != null) entry.normal = normalizeNormal(patch);
      }
      entry.enabled = Boolean(enabled && valid);
      syncUniforms();
    },
    release() {
      if (claims.get(key)?.token !== token) return;
      claims.delete(key);
      syncUniforms();
    },
  };
}

// CPU oracle mirroring SHADE_REGION_GAIN_GLSL for boundary/facet unit checks.
export function evaluateShadeRegions(position, worldNormal = null) {
  if (SHADE_REGION_UNIFORMS.sfShadeEnabled.value < 0.5 || !position) {
    return { gain: 0, broadFloor: 1, facetBias: 0, facetContrast: 0 };
  }
  const count = Math.min(MAX_SHADE_REGIONS, Math.max(0, SHADE_REGION_UNIFORMS.sfShadeCount.value | 0));
  if (count <= 0) return { gain: 0, broadFloor: 1, facetBias: 0, facetContrast: 0 };

  const centers = SHADE_REGION_UNIFORMS.sfShadeCenters.value;
  const halfSizes = SHADE_REGION_UNIFORMS.sfShadeHalfSizes.value;
  const params = SHADE_REGION_UNIFORMS.sfShadeParams.value;
  const normals = SHADE_REGION_UNIFORMS.sfShadeNormals.value;

  const hasNormal = Boolean(
    worldNormal
    && Number.isFinite(worldNormal.x)
    && Number.isFinite(worldNormal.y)
    && Number.isFinite(worldNormal.z),
  );
  const nx = hasNormal ? worldNormal.x : 0;
  const ny = hasNormal ? worldNormal.y : 0;
  const nz = hasNormal ? worldNormal.z : 0;
  const nLen = hasNormal ? Math.hypot(nx, ny, nz) : 0;

  let maxGain = 0;
  let weightSum = 0;
  let floorAccum = 0;
  let biasAccum = 0;
  let contrastAccum = 0;

  for (let i = 0; i < count; i += 1) {
    const c = centers[i];
    const h = halfSizes[i];
    const p = params[i];
    const n = normals[i];
    const edge = Math.min(
      h.x - Math.abs(position.x - c.x),
      h.y - Math.abs(position.y - c.y),
      h.z - Math.abs(position.z - c.z),
    );
    if (edge <= 0) continue;
    const t = Math.max(0, Math.min(1, edge / Math.max(1e-4, p.x)));
    const boxWeight = t * t * (3 - 2 * t);
    let align = 1;
    if (n.w > 0 && nLen > 1e-5) {
      const dot = (nx * n.x + ny * n.y + nz * n.z) / nLen;
      const posDot = Math.max(0, Math.min(1, 0.5 + 0.5 * dot));
      align = (1 - n.w) + n.w * posDot;
    }
    const g = boxWeight * align;
    if (g > maxGain) maxGain = g;
    if (g > 0) {
      weightSum += g;
      floorAccum += g * p.y;
      biasAccum += g * p.z;
      contrastAccum += g * p.w;
    }
  }

  if (weightSum <= 1e-5 || maxGain <= 0) {
    return { gain: 0, broadFloor: 1, facetBias: 0, facetContrast: 0 };
  }
  const gain = Math.max(0, Math.min(1, maxGain));
  return {
    gain,
    broadFloor: 1 - (1 - floorAccum / weightSum) * gain,
    facetBias: (biasAccum / weightSum) * gain,
    facetContrast: (contrastAccum / weightSum) * gain,
  };
}

export function shadeRegionGainAt(position, worldNormal = null) {
  return evaluateShadeRegions(position, worldNormal).gain;
}

export function installShadeRegionShader(shader) {
  if (!shader || shader.fragmentShader.includes('uniform float sfShadeEnabled;')) return;
  shader.uniforms ??= {};
  Object.assign(shader.uniforms, SHADE_REGION_UNIFORMS);
  // Shared camera view->world transform updated per frame by Nocturne's probe pass.
  shader.uniforms.sfNocturneViewToWorld = NOCTURNE_PROBE_UNIFORMS.sfNocturneViewToWorld;
  const viewToWorldDecl = shader.fragmentShader.includes('uniform mat4 sfNocturneViewToWorld;')
    ? ''
    : 'uniform mat4 sfNocturneViewToWorld;\n    ';
  shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
    #ifndef SF_MAX_SHADE_REGIONS
    #define SF_MAX_SHADE_REGIONS ${MAX_SHADE_REGIONS}
    #endif
    ${viewToWorldDecl}uniform float sfShadeEnabled;
    uniform float sfShadeCount;
    uniform vec3 sfShadeCenters[ SF_MAX_SHADE_REGIONS ];
    uniform vec3 sfShadeHalfSizes[ SF_MAX_SHADE_REGIONS ];
    uniform vec4 sfShadeParams[ SF_MAX_SHADE_REGIONS ];
    uniform vec4 sfShadeNormals[ SF_MAX_SHADE_REGIONS ];
  `);
}

// Expects sfFacetWorldNormal (unit world-space facet normal) and initializes
// sfShadeRegionGain (0 outside claimed regions), sfShadeBroadFloor (1 outside),
// sfShadeFacetBias (0 outside), and sfShadeFacetContrast (0 outside).
export const SHADE_REGION_GAIN_GLSL = /* glsl */`
  float sfShadeRegionGain = 0.0;
  float sfShadeBroadFloor = 1.0;
  float sfShadeFacetBias = 0.0;
  float sfShadeFacetContrast = 0.0;
  if (sfShadeEnabled > 0.5 && sfShadeCount > 0.5) {
    vec3 sfShadePosition = (sfNocturneViewToWorld * vec4(-vViewPosition, 1.0)).xyz;
    float sfShadeWeightSum = 0.0;
    float sfShadeFloorAcc = 0.0;
    float sfShadeBiasAcc = 0.0;
    float sfShadeContrastAcc = 0.0;
    for (int sfSi = 0; sfSi < SF_MAX_SHADE_REGIONS; sfSi++) {
      if (float(sfSi) >= sfShadeCount - 0.5) break;
      vec3 sfShadeEdge = sfShadeHalfSizes[sfSi] - abs(sfShadePosition - sfShadeCenters[sfSi]);
      float sfShadeMinEdge = min(sfShadeEdge.x, min(sfShadeEdge.y, sfShadeEdge.z));
      if (sfShadeMinEdge > 0.0) {
        vec4 sfSp = sfShadeParams[sfSi];
        float sfBoxWeight = smoothstep(0.0, max(sfSp.x, 0.0001), sfShadeMinEdge);
        vec4 sfSn = sfShadeNormals[sfSi];
        float sfAlign = 1.0;
        if (sfSn.w > 0.0) {
          float sfPosDot = clamp(0.5 + 0.5 * dot(sfFacetWorldNormal, sfSn.xyz), 0.0, 1.0);
          sfAlign = (1.0 - sfSn.w) + sfSn.w * sfPosDot;
        }
        float sfG = sfBoxWeight * sfAlign;
        sfShadeRegionGain = max(sfShadeRegionGain, sfG);
        if (sfG > 0.0) {
          sfShadeWeightSum += sfG;
          sfShadeFloorAcc += sfG * sfSp.y;
          sfShadeBiasAcc += sfG * sfSp.z;
          sfShadeContrastAcc += sfG * sfSp.w;
        }
      }
    }
    if (sfShadeWeightSum > 0.00001 && sfShadeRegionGain > 0.0) {
      sfShadeRegionGain = clamp(sfShadeRegionGain, 0.0, 1.0);
      sfShadeBroadFloor = 1.0 - (1.0 - sfShadeFloorAcc / sfShadeWeightSum) * sfShadeRegionGain;
      sfShadeFacetBias = (sfShadeBiasAcc / sfShadeWeightSum) * sfShadeRegionGain;
      sfShadeFacetContrast = (sfShadeContrastAcc / sfShadeWeightSum) * sfShadeRegionGain;
    } else {
      sfShadeRegionGain = 0.0;
    }
  }
`;
