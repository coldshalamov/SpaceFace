// Editable deep-field art and projection contracts. No renderer, simulation or ambient RNG.
// Celestial composition remains in sectorVisualProfiles.js / deepFieldStructureRecipes.js.
export const DEEP_FIELD_VOID_SIZE = 32;
export const DEEP_FIELD_FINISHES = Object.freeze({
  core: Object.freeze({ roughness: 0.92, metalness: 0.04, normalStrength: 0.66 }),
  belt: Object.freeze({ roughness: 0.87, metalness: 0.12, normalStrength: 0.82 }),
  fringe: Object.freeze({ roughness: 0.97, metalness: 0.025, normalStrength: 0.74 }),
  anomaly: Object.freeze({ roughness: 0.72, metalness: 0.08, normalStrength: 0.56 }),
});

// A body is the intersection of asymmetric fracture planes, not a flattened sphere.
// [nx, ny, nz, distance] planes need not have unit normals: distance uses the same scale.
// The second body is a sheared splinter, with thickness in every orientation. Both share
// topology at runtime so an instance can select a silhouette without another draw call.
export const DEBRIS_FRACTURE_PLANES = Object.freeze([
  Object.freeze([
    [1, 0, 0, 0.83], [-1, 0, 0, 0.95], [0, 1, 0, 0.77], [0, -1, 0, 0.85],
    [0, 0, 1, 1.03], [0, 0, -1, 0.88], [0.78, 0.65, 0.35, 0.94],
    [-0.60, 0.36, -0.78, 1.02], [0.23, -0.83, 0.69, 0.97],
    [-0.72, -0.48, 0.44, 0.96],
  ].map(Object.freeze)),
  Object.freeze([
    [1, 0, 0, 1.23], [-1, 0, 0, 1.08], [0.30, 1, 0, 0.60],
    [-0.18, -1, 0, 0.70], [0, 0.18, 1, 0.72], [0, -0.12, -1, 0.83],
    [0.80, 0.25, 0.52, 1.02], [-0.65, 0.55, -0.32, 0.92],
    [0.58, -0.55, -0.46, 1.03], [-0.72, -0.25, 0.54, 1.02],
  ].map(Object.freeze)),
]);

/** Project a direction onto a bounded, closed fractured solid. Reuses caller scratch. */
export function projectDebrisVertex(x, y, z, variant = 0, out = [0, 0, 0]) {
  const length = Math.hypot(x, y, z);
  if (!Number.isFinite(length) || length < 1e-12) {
    out[0] = out[1] = out[2] = 0;
    return out;
  }
  x /= length; y /= length; z /= length;
  const planes = DEBRIS_FRACTURE_PLANES[variant === 1 ? 1 : 0];
  let radius = 1.52;
  for (const p of planes) {
    const alignment = p[0] * x + p[1] * y + p[2] * z;
    if (alignment > 1e-9) radius = Math.min(radius, p[3] / alignment);
  }
  // Small coherent bevel, not displacement noise. Large planes still own the form.
  radius *= 0.98 + 0.02 * Math.pow(Math.abs(x * y * z) * 5.196152423, 0.5);
  out[0] = x * radius; out[1] = y * radius; out[2] = z * radius;
  return out;
}

/** Exact RGBA8 mip-chain storage, excluding driver/target metadata. */
export function rgbaMipBytes(size) {
  let side = Math.max(1, Math.floor(Number.isFinite(size) ? size : 1));
  let bytes = 0;
  do { bytes += side * side * 4; side = Math.floor(side / 2); } while (side > 0);
  return bytes;
}

// Three vertices cover the viewport; there is no world-space edge or far-plane intersection.
// Rays use camera rotation only, avoiding cancellation of large translated world positions.
export const DEEP_FIELD_VERTEX = /* glsl */`
  uniform mat4 uSkyProjectionInverse;
  uniform mat4 uSkyCameraWorld;
  varying vec3 vSkyRay;
  void main() {
    vec4 viewRay = uSkyProjectionInverse * vec4(position.xy, 1.0, 1.0);
    vSkyRay = mat3(uSkyCameraWorld) * viewRay.xyz;
    gl_Position = vec4(position.xy, 1.0, 1.0);
  }
`;

export const DEEP_FIELD_FRAGMENT = /* glsl */`
  precision highp float;
  uniform sampler2D uL0;
  uniform sampler2D uL1;
  uniform sampler2D uL2;
  uniform vec2 uRepeat0, uRepeat1, uRepeat2;
  uniform vec2 uOffset0, uOffset1, uOffset2;
  uniform vec3 uGroupOrigin, uDepths;
  uniform float uPlaneSize, uBiasZ;
  uniform vec3 uTintA, uTintB;
  uniform float uNebulaOpacity;
  varying vec3 vSkyRay;

  vec2 uvAtDepth(float depth, vec2 repeatUv, vec2 offsetUv) {
    // Supported chase views look down. The horizon guard in main keeps the division finite.
    float t = (uGroupOrigin.y + depth - cameraPosition.y) / vSkyRay.y;
    vec3 localPoint = (cameraPosition - uGroupOrigin) + vSkyRay * t;
    vec2 planeUv = vec2(localPoint.x / uPlaneSize + 0.5,
      -(localPoint.z - uBiasZ) / uPlaneSize + 0.5);
    return planeUv * repeatUv + offsetUv;
  }
  void main() {
    vec3 color;
    if (vSkyRay.y >= -0.00001) {
      color = texture2D(uL0, vec2(0.5)).rgb;
    } else {
      color = texture2D(uL0, uvAtDepth(uDepths.x, uRepeat0, uOffset0)).rgb;
      // A uniform branch: clear sectors fetch one texture, not three zero-contribution layers.
      // Authored nebula art and wormhole lens resources remain available and unchanged.
      if (uNebulaOpacity > 0.0) {
        vec4 l1 = texture2D(uL1, uvAtDepth(uDepths.y, uRepeat1, uOffset1));
        vec4 l2 = texture2D(uL2, uvAtDepth(uDepths.z, uRepeat2, uOffset2));
        float nebulaAlpha = clamp(l1.a * uNebulaOpacity * 1.35, 0.0, 1.0);
        float wispsAlpha = clamp(l2.a * uNebulaOpacity * 0.55, 0.0, 1.0);
        color = mix(color, l1.rgb * uTintA * 1.15, nebulaAlpha);
        color += l2.rgb * uTintB * wispsAlpha;
      }
    }
    gl_FragColor = vec4(max(color, vec3(0.0)), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
