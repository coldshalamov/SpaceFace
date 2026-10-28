// NOCTURNE participating media. This is single-scattering radiative transport through bounded
// ellipsoids, not a beam mesh. The pass reads the scene's real depth, integrates Beer-Lambert
// extinction and point/spot irradiance, and reprojects its low-resolution history. Empty space
// has exactly zero optical depth. All GPU/storage budgets are fixed at construction/preset time.
import * as THREE from 'three';

export const NOCTURNE_MEDIA_CAP = 4;
export const NOCTURNE_SCATTER_LIGHT_CAP = 6;
export const NOCTURNE_ATMOSPHERE_QUALITY = Object.freeze({
  integrated: Object.freeze({ scale: 0.25, steps: 12, history: 0.72 }),
  balanced: Object.freeze({ scale: 0.5, steps: 18, history: 0.8 }),
  high: Object.freeze({ scale: 0.5, steps: 28, history: 0.86 }),
});

const MAX_STEPS = 28;
const finite = (v, fallback = 0) => Number.isFinite(v) ? v : fallback;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const component = (v, key, index, fallback = 0) => finite(v?.[key] ?? v?.[index], fallback);

/** CPU reference used by validation and authoring tools; density is extinction per world unit. */
export function beerLambertTransmittance(density, distance) {
  return Math.exp(-Math.max(0, finite(density)) * Math.max(0, finite(distance)));
}

/** Mutates a caller-owned interval; the direction must be unit length in world space. */
export function intersectNocturneMedium(origin, direction, center, radii, out) {
  const rx = component(radii, 'x', 0), ry = component(radii, 'y', 1), rz = component(radii, 'z', 2);
  if (!(rx > 0 && ry > 0 && rz > 0)) { out.near = 0; out.far = 0; return false; }
  const ox = (origin.x - center.x) / rx, oy = (origin.y - center.y) / ry, oz = (origin.z - center.z) / rz;
  const dx = direction.x / rx, dy = direction.y / ry, dz = direction.z / rz;
  const a = dx * dx + dy * dy + dz * dz;
  const b = ox * dx + oy * dy + oz * dz;
  const c = ox * ox + oy * oy + oz * oz - 1;
  const disc = b * b - a * c;
  if (!(a > 0) || disc < 0) { out.near = 0; out.far = 0; return false; }
  const root = Math.sqrt(disc);
  out.near = Math.max(0, (-b - root) / a);
  out.far = Math.max(0, (-b + root) / a);
  return out.far > out.near;
}

export function nocturneAtmosphereQuality(value) {
  if (value === 'high' || value === 'ultra' || value === 'cinematic') return 'high';
  if (value === 'low' || value === 'integrated' || value === 'mobile' || value === 'battery') return 'integrated';
  return 'balanced';
}

export function createAtmosphereCompositeUniforms() {
  return {
    tNocturneScatter: { value: null },
    tNocturneDepth: { value: null },
    tNocturneSceneDepth: { value: null },
    uNocturneAtmosphere: { value: 0 },
    uNocturneTexel: { value: new THREE.Vector2(1, 1) },
    uNocturneNearFar: { value: new THREE.Vector2(0.1, 1000) },
    uNocturneOrthographic: { value: 0 },
  };
}

// Four depth-weighted taps reconstruct scattering independently of RGB scene filtering. History
// depth is logarithmic view distance (RGBA16F), avoiding the precision collapse of raw hardware
// depth stored in a half float. The final HDR sample carries transmittance in alpha.
export const NOCTURNE_ATMOSPHERE_COMPOSITE_GLSL = /* glsl */`
  uniform sampler2D tNocturneScatter;
  uniform sampler2D tNocturneDepth;
  uniform sampler2D tNocturneSceneDepth;
  uniform float uNocturneAtmosphere;
  uniform vec2 uNocturneTexel;
  uniform vec2 uNocturneNearFar;
  uniform float uNocturneOrthographic;
  float nocturneViewDepth(float d) {
    float n = uNocturneNearFar.x, f = uNocturneNearFar.y;
    return mix(n * f / max(f - d * (f - n), 0.00001), n + d * (f - n), uNocturneOrthographic);
  }
  vec4 sampleNocturneAtmosphere(vec2 uv, vec2 depthUv) {
    float depth = texture2D(tNocturneSceneDepth, depthUv).r;
    float viewDepth = nocturneViewDepth(depth);
    vec2 p = uv / uNocturneTexel - 0.5;
    vec2 base = floor(p);
    vec2 f = fract(p);
    vec4 sum = vec4(0.0);
    float total = 0.0;
    for (int i = 0; i < 4; i++) {
      vec2 corner = vec2(float(i - (i / 2) * 2), float(i / 2));
      vec2 tap = clamp((base + corner + 0.5) * uNocturneTexel,
        uNocturneTexel * 0.5, vec2(1.0) - uNocturneTexel * 0.5);
      vec2 h = texture2D(tNocturneDepth, tap).rg;
      float distance = exp2(h.x) - 1.0;
      float edge = exp(-abs(viewDepth - distance) / max(0.5, viewDepth * 0.015));
      // Sky pixels cannot bleed across foreground silhouettes, even at extreme camera far planes.
      edge *= (depth > 0.999999) == (h.y > 0.5) ? 1.0 : 0.0;
      vec2 w = mix(vec2(1.0) - f, f, corner);
      float weight = w.x * w.y * edge;
      sum += texture2D(tNocturneScatter, tap) * weight;
      total += weight;
    }
    // At a thin foreground edge none of the coarse rays may hit the same surface. Failing clear
    // preserves the edge; borrowing a background ray would paint a luminous halo through it.
    return total > 0.0001 ? sum / total : vec4(0.0, 0.0, 0.0, 1.0);
  }
  vec3 composeNocturneAtmosphere(vec3 scene, vec2 uv, vec2 depthUv) {
    if (uNocturneAtmosphere < 0.5) return scene;
    vec4 medium = sampleNocturneAtmosphere(uv, depthUv);
    return scene * clamp(medium.a, 0.0, 1.0) + max(medium.rgb, vec3(0.0));
  }
`;

const VERTEX = /* glsl */`
  out vec2 vUv;
  void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const FRAGMENT = /* glsl */`
  precision highp float;
  in vec2 vUv;
  layout(location = 0) out vec4 outScatter;
  layout(location = 1) out vec4 outDepth;
  uniform sampler2D tDepth;
  uniform sampler2D tHistory;
  uniform sampler2D tHistoryDepth;
  uniform sampler2D tShadow;
  uniform sampler2DShadow tShadowCompare;
  uniform mat4 uInverseViewProjection;
  uniform mat4 uView;
  uniform mat4 uPreviousViewProjection;
  uniform mat4 uPreviousView;
  uniform mat4 uShadowMatrix;
  uniform vec2 uDepthScale;
  uniform vec2 uShadowTexel;
  uniform vec3 uCamera;
  uniform vec4 uMediumCenter[${NOCTURNE_MEDIA_CAP}];
  uniform vec4 uMediumRadii[${NOCTURNE_MEDIA_CAP}];
  uniform vec4 uMediumAlbedo[${NOCTURNE_MEDIA_CAP}];
  uniform vec4 uLightPosition[${NOCTURNE_SCATTER_LIGHT_CAP}];
  uniform vec4 uLightColor[${NOCTURNE_SCATTER_LIGHT_CAP}];
  uniform vec4 uLightDirection[${NOCTURNE_SCATTER_LIGHT_CAP}];
  uniform vec4 uLightShape[${NOCTURNE_SCATTER_LIGHT_CAP}];
  uniform int uMediumCount;
  uniform int uLightCount;
  uniform int uSteps;
  uniform int uShadowLight;
  uniform float uShadowBias;
  uniform float uShadowEncoding;
  uniform float uShadowReversed;
  uniform float uHistory;
  uniform float uFrame;
  uniform float uOrthographic;
  #include <packing>

  vec3 reconstruct(vec2 uv, float depth) {
    vec4 p = uInverseViewProjection * vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    return p.xyz / p.w;
  }
  vec2 mediumInterval(vec3 ro, vec3 rd, int i) {
    vec3 o = (ro - uMediumCenter[i].xyz) / uMediumRadii[i].xyz;
    vec3 d = rd / uMediumRadii[i].xyz;
    float a = dot(d, d), b = dot(o, d), c = dot(o, o) - 1.0;
    float discriminant = b * b - a * c;
    if (discriminant <= 0.0) return vec2(1e20, -1e20);
    float root = sqrt(discriminant);
    return vec2(max(0.0, (-b - root) / a), (-b + root) / a);
  }
  float shadowVisibility(vec3 p) {
    vec4 q = uShadowMatrix * vec4(p, 1.0);
    vec3 s = q.xyz / max(q.w, 0.000001);
    if (q.w <= 0.0 || s.z < 0.0 || s.z > 1.0 || any(lessThan(s.xy, vec2(0.0)))
      || any(greaterThan(s.xy, vec2(1.0)))) return 1.0;
    float compare = s.z + uShadowBias;
    float lit = 0.0;
    for (int k = 0; k < 4; k++) {
      vec2 o = vec2(float(k - (k / 2) * 2), float(k / 2)) - 0.5;
      vec2 uv = s.xy + o * uShadowTexel;
      if (uShadowEncoding > 1.5) lit += texture(tShadowCompare, vec3(uv, compare));
      else {
        vec4 texel = texture(tShadow, uv);
        float depth = uShadowEncoding > 0.5 ? texel.r : unpackRGBAToDepth(texel);
        lit += mix(step(compare, depth), step(depth, compare), uShadowReversed);
      }
    }
    return lit * 0.25;
  }
  float phaseHG(float cosine, float g) {
    float d = max(0.04, 1.0 + g * g - 2.0 * g * cosine);
    return (1.0 - g * g) / (12.5663706144 * d * sqrt(d));
  }
  vec3 illumination(vec3 p, vec3 viewDirection, float g) {
    vec3 light = vec3(0.0);
    for (int j = 0; j < ${NOCTURNE_SCATTER_LIGHT_CAP}; j++) {
      if (j >= uLightCount) break;
      vec3 toLight = uLightPosition[j].xyz - p;
      float distance = length(toLight);
      vec3 L = toLight / max(distance, 0.0001);
      float kind = uLightPosition[j].w;
      float attenuation = 1.0;
      if (kind > 1.5) L = -uLightDirection[j].xyz;
      else {
        float range = uLightShape[j].x;
        float cutoff = range > 0.0 ? pow(clamp(1.0 - pow(distance / range, 4.0), 0.0, 1.0), 2.0) : 1.0;
        attenuation = cutoff / max(pow(distance, uLightShape[j].y), 1.0);
        if (kind > 0.5) {
          float angle = dot(-L, uLightDirection[j].xyz);
          attenuation *= smoothstep(uLightDirection[j].w, max(uLightDirection[j].w + 0.00001, uLightShape[j].z), angle);
        }
      }
      if (j == uShadowLight) attenuation *= shadowVisibility(p);
      light += uLightColor[j].rgb * (uLightColor[j].a * attenuation * phaseHG(dot(L, -viewDirection), g));
    }
    return light;
  }
  void main() {
    float depth = texture(tDepth, vUv * uDepthScale).r;
    vec3 surface = reconstruct(vUv, depth);
    vec3 nearPoint = reconstruct(vUv, 0.0);
    vec3 ro = mix(uCamera, nearPoint, uOrthographic);
    vec3 rd = normalize(surface - ro);
    float surfaceDistance = length(surface - ro);
    float viewDepth = max(0.0, -(uView * vec4(surface, 1.0)).z);
    bool sky = depth > 0.999999;
    outDepth = vec4(log2(1.0 + viewDepth), sky ? 1.0 : 0.0, 0.0, 1.0);
    float enter = 1e20, leave = 0.0;
    for (int i = 0; i < ${NOCTURNE_MEDIA_CAP}; i++) {
      if (i >= uMediumCount) break;
      vec2 interval = mediumInterval(ro, rd, i);
      if (interval.y > interval.x) { enter = min(enter, interval.x); leave = max(leave, interval.y); }
    }
    leave = min(leave, surfaceDistance);
    if (leave <= enter) { outScatter = vec4(0.0, 0.0, 0.0, 1.0); return; }
    float stepSize = (leave - enter) / float(uSteps);
    // Spatially scrambled, deterministic eight-frame sequence. History is invalidated on source
    // changes; the jitter does not mutate simulation RNG or require noise textures.
    float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))) + uFrame * 0.61803398875);
    vec3 scattering = vec3(0.0);
    float transmittance = 1.0, weightedDistance = 0.0, totalWeight = 0.0;
    for (int s = 0; s < ${MAX_STEPS}; s++) {
      if (s >= uSteps || transmittance < 0.008) break;
      float distance = enter + (float(s) + jitter) * stepSize;
      vec3 p = ro + rd * distance;
      float extinction = 0.0, g = 0.0;
      vec3 albedo = vec3(0.0);
      for (int i = 0; i < ${NOCTURNE_MEDIA_CAP}; i++) {
        if (i >= uMediumCount) break;
        vec3 normalized = (p - uMediumCenter[i].xyz) / uMediumRadii[i].xyz;
        float r2 = dot(normalized, normalized);
        float envelope = 1.0 - smoothstep(0.64, 1.0, r2);
        float noise = mix(1.0, 0.6 + 0.4 * sin(p.x * 0.093 + sin(p.z * 0.051)) * sin(p.y * 0.077 + p.z * 0.043), uMediumRadii[i].w);
        float density = uMediumCenter[i].w * envelope * noise;
        extinction += density;
        albedo += uMediumAlbedo[i].rgb * density;
        g += uMediumAlbedo[i].a * density;
      }
      if (extinction <= 0.0000001) continue;
      albedo /= extinction;
      g /= extinction;
      float stepTransmittance = exp(-extinction * stepSize);
      float weight = transmittance * (1.0 - stepTransmittance);
      scattering += illumination(p, rd, g) * albedo * weight;
      weightedDistance += distance * weight;
      totalWeight += weight;
      transmittance *= stepTransmittance;
    }
    vec4 result = vec4(scattering, transmittance);
    if (uHistory > 0.0 && totalWeight > 0.00001) {
      vec3 representative = ro + rd * (weightedDistance / totalWeight);
      vec4 projected = uPreviousViewProjection * vec4(representative, 1.0);
      vec2 uv = projected.xy / max(projected.w, 0.000001) * 0.5 + 0.5;
      if (projected.w > 0.0 && all(greaterThan(uv, vec2(0.002))) && all(lessThan(uv, vec2(0.998)))) {
        vec2 previous = texture(tHistoryDepth, uv).rg;
        float previousDepth = exp2(previous.x) - 1.0;
        float expectedDepth = max(0.0, -(uPreviousView * vec4(surface, 1.0)).z);
        bool matchingSky = sky == (previous.y > 0.5);
        float valid = matchingSky && (sky || abs(previousDepth - expectedDepth) < max(1.0, expectedDepth * 0.025)) ? 1.0 : 0.0;
        vec4 old = texture(tHistory, uv);
        // Radiance/transmittance clamp limits stale illumination at disocclusion boundaries even
        // when a thin occluder is below the depth-history resolution.
        old.rgb = clamp(old.rgb, scattering * 0.6, scattering * 1.4 + vec3(0.00005));
        old.a = clamp(old.a, transmittance - 0.04, transmittance + 0.04);
        result = mix(result, old, uHistory * valid);
      }
    }
    outScatter = result;
  }
`;

function vectorArray(size) { return Array.from({ length: size }, () => new THREE.Vector4()); }

/**
 * Inputs are render-space coordinates and read-only mutable records. setMedia/setLights retain
 * the arrays; callers may reuse their storage. Lights must be real Three point/spot/directional
 * objects. A ready shadowed spot is pinned, then the strongest contributions are selected. Only one
 * spot's already-rendered shadow map is sampled; other sources are explicitly unshadowed.
 */
export function createNocturneAtmosphere(renderer, width, height, options = {}) {
  let quality = nocturneAtmosphereQuality(options.quality);
  let policy = NOCTURNE_ATMOSPHERE_QUALITY[quality];
  let enabled = options.enabled !== false;
  let disposed = false;
  let media = null, lights = null;
  let W = Math.max(1, width | 0), H = Math.max(1, height | 0);
  let lowW = Math.max(1, Math.ceil(W * policy.scale)), lowH = Math.max(1, Math.ceil(H * policy.scale));
  let supported = false, unsupportedReason = null;
  const capabilities = renderer?.capabilities;
  const gl = renderer?.getContext?.();
  try {
    supported = !!(capabilities?.isWebGL2 && gl?.getExtension?.('EXT_color_buffer_float'));
    unsupportedReason = supported ? null : 'WebGL2 and EXT_color_buffer_float required';
  } catch (_) { unsupportedReason = 'WebGL capability unavailable'; }
  let historyValid = false, historyReason = 'initial', frame = 0, writeIndex = 0;
  let historyRejects = 0, renderedFrames = 0, vacuumFrames = 0, generation = 0;
  let active = false, lastMediaCount = -1, lastLightCount = -1;
  let shadowedLightId = null, previousDepthTexture = null;
  const targets = [];
  const emptyTexture = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat);
  emptyTexture.needsUpdate = true;
  // A sampler2DShadow must always bind a comparison depth texture, even when its branch is idle.
  // The native vendored renderer uses these; older Three releases used packed RGBA depth.
  const emptyShadowTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
  emptyShadowTexture.compareFunction = THREE.LessEqualCompare;
  emptyShadowTexture.minFilter = THREE.NearestFilter;
  emptyShadowTexture.magFilter = THREE.NearestFilter;
  emptyShadowTexture.needsUpdate = true;
  const uniforms = {
    tDepth: { value: emptyTexture }, tHistory: { value: emptyTexture },
    tHistoryDepth: { value: emptyTexture }, tShadow: { value: emptyTexture },
    tShadowCompare: { value: emptyShadowTexture },
    uInverseViewProjection: { value: new THREE.Matrix4() }, uView: { value: new THREE.Matrix4() },
    uPreviousViewProjection: { value: new THREE.Matrix4() }, uPreviousView: { value: new THREE.Matrix4() },
    uShadowMatrix: { value: new THREE.Matrix4() }, uDepthScale: { value: new THREE.Vector2(1, 1) },
    uShadowTexel: { value: new THREE.Vector2(1, 1) }, uCamera: { value: new THREE.Vector3() },
    uMediumCenter: { value: vectorArray(NOCTURNE_MEDIA_CAP) },
    uMediumRadii: { value: vectorArray(NOCTURNE_MEDIA_CAP) },
    uMediumAlbedo: { value: vectorArray(NOCTURNE_MEDIA_CAP) },
    uLightPosition: { value: vectorArray(NOCTURNE_SCATTER_LIGHT_CAP) },
    uLightColor: { value: vectorArray(NOCTURNE_SCATTER_LIGHT_CAP) },
    uLightDirection: { value: vectorArray(NOCTURNE_SCATTER_LIGHT_CAP) },
    uLightShape: { value: vectorArray(NOCTURNE_SCATTER_LIGHT_CAP) },
    uMediumCount: { value: 0 }, uLightCount: { value: 0 }, uSteps: { value: policy.steps },
    uShadowLight: { value: -1 }, uShadowBias: { value: 0 },
    uShadowEncoding: { value: 0 }, uShadowReversed: { value: 0 },
    uHistory: { value: 0 }, uFrame: { value: 0 }, uOrthographic: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    name: 'NOCTURNE:SingleScattering', glslVersion: THREE.GLSL3,
    vertexShader: VERTEX, fragmentShader: FRAGMENT, uniforms,
    depthTest: false, depthWrite: false, toneMapped: false, blending: THREE.NoBlending,
  });
  const geometry = new THREE.PlaneGeometry(2, 2);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  const scene = new THREE.Scene();
  scene.matrixWorldAutoUpdate = false;
  scene.add(mesh);
  const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  quadCamera.matrixWorldAutoUpdate = false;
  const viewProjection = new THREE.Matrix4();
  const priorProjection = new THREE.Matrix4();
  const priorCameraPosition = new THREE.Vector3();
  const priorCameraQuaternion = new THREE.Quaternion();
  const worldPosition = new THREE.Vector3(), targetPosition = new THREE.Vector3(), direction = new THREE.Vector3();
  const cameraQuaternion = new THREE.Quaternion();
  const clearColor = new THREE.Color();
  const previousViewport = new THREE.Vector4(), previousScissor = new THREE.Vector4();
  // Snapshots permit cheap source-change rejection without strings, traversal or temporary arrays.
  const snapshot = new Float64Array(NOCTURNE_MEDIA_CAP * 12 + NOCTURNE_SCATTER_LIGHT_CAP * 16);
  snapshot.fill(NaN);
  const selectedIndices = new Int16Array(NOCTURNE_SCATTER_LIGHT_CAP);
  const selectedScores = new Float64Array(NOCTURNE_SCATTER_LIGHT_CAP);
  const selectedLightIds = new Float64Array(NOCTURNE_SCATTER_LIGHT_CAP);
  selectedLightIds.fill(-1);
  let snapshotCursor = 0, sourcesChanged = false;
  let output = emptyTexture, outputDepth = emptyTexture;

  function invalidateHistory(reason = 'requested') {
    historyValid = false;
    historyReason = reason;
    historyRejects++;
    generation++;
  }

  function saveValue(value, tolerance = 0.00001) {
    if (!Number.isFinite(snapshot[snapshotCursor]) || Math.abs(snapshot[snapshotCursor] - value) > tolerance) sourcesChanged = true;
    snapshot[snapshotCursor++] = value;
    return value;
  }

  function allocateTargets() {
    for (const target of targets) target.dispose();
    targets.length = 0;
    output = emptyTexture; outputDepth = emptyTexture;
    if (!supported || disposed) return;
    for (let i = 0; i < 2; i++) {
      const target = new THREE.WebGLRenderTarget(lowW, lowH, {
        count: 2, type: THREE.HalfFloatType, format: THREE.RGBAFormat,
        minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
        depthBuffer: false, stencilBuffer: false, generateMipmaps: false,
      });
      target.texture.name = `NOCTURNE:ScatteringHistory${i}`;
      target.textures[1].name = `NOCTURNE:DepthHistory${i}`;
      // Bilinear depth history can invent an occluder at silhouettes. Color is filtered only after
      // the matching depth taps establish a correspondence.
      target.textures[1].minFilter = THREE.NearestFilter;
      target.textures[1].magFilter = THREE.NearestFilter;
      targets.push(target);
    }
    writeIndex = 0;
    invalidateHistory('resources-created');
  }
  allocateTargets();

  function syncMedia() {
    let count = 0;
    snapshotCursor = 0;
    sourcesChanged = false;
    if (media) for (let i = 0; i < media.length && count < NOCTURNE_MEDIA_CAP; i++) {
      const m = media[i];
      if (!m || m.enabled === false) continue;
      const density = clamp(finite(m.density) * Math.max(0, finite(m.extinction, 1)), 0, 1);
      const rx = component(m.radii, 'x', 0), ry = component(m.radii, 'y', 1), rz = component(m.radii, 'z', 2);
      if (!(density > 0 && rx > 0 && ry > 0 && rz > 0)) continue;
      const c = uniforms.uMediumCenter.value[count], r = uniforms.uMediumRadii.value[count], a = uniforms.uMediumAlbedo.value[count];
      c.set(saveValue(component(m.center, 'x', 0), 0.01), saveValue(component(m.center, 'y', 1), 0.01),
        saveValue(component(m.center, 'z', 2), 0.01), saveValue(density));
      r.set(saveValue(rx), saveValue(ry), saveValue(rz), saveValue(clamp(finite(m.noise), 0, 1)));
      a.set(saveValue(clamp(component(m.color, 'r', 0, 1), 0, 1)), saveValue(clamp(component(m.color, 'g', 1, 1), 0, 1)),
        saveValue(clamp(component(m.color, 'b', 2, 1), 0, 1)), saveValue(clamp(finite(m.anisotropy, 0.25), -0.7, 0.7)));
      count++;
    }
    if (count !== lastMediaCount) sourcesChanged = true;
    lastMediaCount = count;
    uniforms.uMediumCount.value = count;
    return count;
  }

  function syncLights() {
    let count = 0;
    snapshotCursor = NOCTURNE_MEDIA_CAP * 12;
    uniforms.uShadowLight.value = -1;
    uniforms.tShadow.value = emptyTexture;
    uniforms.tShadowCompare.value = emptyShadowTexture;
    shadowedLightId = null;
    selectedIndices.fill(-1); selectedScores.fill(-Infinity);
    let pinned = -1;
    if (lights) for (let i = 0; i < lights.length; i++) {
      const light = lights[i];
      if (light?.isSpotLight && light.visible !== false && light.intensity > 0 && light.castShadow && light.shadow?.map?.texture) { pinned = i; break; }
    }
    const firstVacancy = pinned < 0 ? 0 : 1;
    if (pinned >= 0) { selectedIndices[0] = pinned; selectedScores[0] = Infinity; }
    if (lights) for (let i = 0; i < lights.length; i++) {
      const light = lights[i];
      if (i === pinned || !light || light.visible === false || !(light.intensity > 0)
        || (!light.isPointLight && !light.isSpotLight && !light.isDirectionalLight)) continue;
      light.getWorldPosition(worldPosition);
      const distanceSquared = Math.max(25, worldPosition.distanceToSquared(uniforms.uCamera.value));
      const range = Math.max(1, finite(light.distance, 500));
      const influence = light.isDirectionalLight ? 1 : Math.min(1, range * range / distanceSquared);
      let score = light.intensity * Math.max(light.color.r, light.color.g, light.color.b)
        * influence / (light.isDirectionalLight ? 1 : distanceSquared);
      score *= 1 + Math.max(0, finite(light.userData?.nocturnePriority)) * 0.2;
      for (let j = 0; j < selectedLightIds.length; j++) if (selectedLightIds[j] === light.id) { score *= 1.15; break; }
      let insert = -1;
      for (let j = firstVacancy; j < selectedIndices.length; j++) {
        if (score > selectedScores[j]) { insert = j; break; }
      }
      if (insert < 0) continue;
      for (let j = selectedIndices.length - 1; j > insert; j--) {
        selectedIndices[j] = selectedIndices[j - 1]; selectedScores[j] = selectedScores[j - 1];
      }
      selectedIndices[insert] = i; selectedScores[insert] = score;
    }
    selectedLightIds.fill(-1);
    for (let i = 0; i < selectedIndices.length; i++) {
      const selected = selectedIndices[i];
      if (selected < 0) continue;
      const light = lights[selected];
      selectedLightIds[count] = light.id;
      light.getWorldPosition(worldPosition);
      direction.set(0, 0, -1);
      if (light.target) { light.target.getWorldPosition(targetPosition); direction.subVectors(targetPosition, worldPosition).normalize(); }
      const p = uniforms.uLightPosition.value[count], c = uniforms.uLightColor.value[count];
      const d = uniforms.uLightDirection.value[count], shape = uniforms.uLightShape.value[count];
      p.set(saveValue(worldPosition.x, 0.15), saveValue(worldPosition.y, 0.15), saveValue(worldPosition.z, 0.15),
        saveValue(light.isDirectionalLight ? 2 : light.isSpotLight ? 1 : 0));
      c.set(saveValue(light.color.r), saveValue(light.color.g), saveValue(light.color.b),
        saveValue(light.intensity, Math.max(0.01, light.intensity * 0.025)));
      const angle = finite(light.angle, Math.PI / 3), penumbra = finite(light.penumbra, 0);
      d.set(saveValue(direction.x, 0.002), saveValue(direction.y, 0.002), saveValue(direction.z, 0.002), saveValue(Math.cos(angle)));
      shape.set(saveValue(Math.max(0, finite(light.distance))), saveValue(Math.max(0, finite(light.decay, 2))),
        saveValue(Math.cos(angle * (1 - penumbra))), saveValue(light.id));
      if (uniforms.uShadowLight.value < 0 && light.isSpotLight && light.castShadow && light.shadow?.map?.texture && light.shadow.matrix) {
        uniforms.uShadowLight.value = count;
        const nativeDepth = light.shadow.map.depthTexture;
        const comparison = nativeDepth && nativeDepth.compareFunction != null;
        uniforms.tShadow.value = comparison ? emptyTexture : nativeDepth || light.shadow.map.texture;
        uniforms.tShadowCompare.value = comparison ? nativeDepth : emptyShadowTexture;
        uniforms.uShadowEncoding.value = comparison ? 2 : nativeDepth ? 1 : 0;
        uniforms.uShadowReversed.value = nativeDepth?.compareFunction === THREE.GreaterEqualCompare ? 1 : 0;
        uniforms.uShadowMatrix.value.copy(light.shadow.matrix);
        uniforms.uShadowTexel.value.set(1 / light.shadow.map.width, 1 / light.shadow.map.height);
        uniforms.uShadowBias.value = finite(light.shadow.bias);
        shadowedLightId = light.id;
      }
      count++;
    }
    if (count !== lastLightCount) sourcesChanged = true;
    lastLightCount = count;
    uniforms.uLightCount.value = count;
  }

  function render(depthTexture, camera, uvScale = null) {
    active = false;
    if (disposed || !enabled || !supported || !depthTexture || !camera || targets.length !== 2) return null;
    if (syncMedia() === 0) { vacuumFrames++; historyValid = false; historyReason = 'vacuum'; return null; }
    // Both post routes share one pass. Even at equal sizes they can have different depth content;
    // a new depth source must never inherit the other route's temporal accumulation.
    if (previousDepthTexture && previousDepthTexture !== depthTexture) invalidateHistory('depth-source-changed');
    previousDepthTexture = depthTexture;
    camera.getWorldPosition(uniforms.uCamera.value);
    syncLights();
    if (sourcesChanged) invalidateHistory('sources-changed');
    camera.getWorldQuaternion(cameraQuaternion);
    if (historyValid && (priorCameraPosition.distanceToSquared(uniforms.uCamera.value) > 900
      || Math.abs(priorCameraQuaternion.dot(cameraQuaternion)) < 0.965
      || !priorProjection.equals(camera.projectionMatrix))) invalidateHistory('camera-cut-or-projection');
    viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    uniforms.uInverseViewProjection.value.copy(viewProjection).invert();
    uniforms.uView.value.copy(camera.matrixWorldInverse);
    uniforms.uOrthographic.value = camera.isOrthographicCamera ? 1 : 0;
    uniforms.uDepthScale.value.set(uvScale?.x ?? 1, uvScale?.y ?? 1);
    uniforms.tDepth.value = depthTexture;
    uniforms.uFrame.value = frame++ % 8;
    uniforms.uHistory.value = historyValid ? policy.history : 0;
    const write = targets[writeIndex], read = targets[1 - writeIndex];
    uniforms.tHistory.value = historyValid ? read.texture : emptyTexture;
    uniforms.tHistoryDepth.value = historyValid ? read.textures[1] : emptyTexture;
    const previousTarget = renderer.getRenderTarget();
    const previousAutoClear = renderer.autoClear;
    renderer.getViewport(previousViewport);
    renderer.getScissor(previousScissor);
    const previousScissorTest = renderer.getScissorTest();
    const previousAlpha = renderer.getClearAlpha();
    renderer.getClearColor(clearColor);
    try {
      renderer.autoClear = false;
      renderer.setRenderTarget(write);
      renderer.setViewport(0, 0, lowW, lowH);
      renderer.setScissorTest(false);
      renderer.render(scene, quadCamera);
      output = write.texture; outputDepth = write.textures[1];
      active = true;
      renderedFrames++;
      historyValid = true;
      uniforms.uPreviousViewProjection.value.copy(viewProjection);
      uniforms.uPreviousView.value.copy(camera.matrixWorldInverse);
      priorProjection.copy(camera.projectionMatrix);
      priorCameraPosition.copy(uniforms.uCamera.value);
      priorCameraQuaternion.copy(cameraQuaternion);
      writeIndex = 1 - writeIndex;
      return output;
    } finally {
      renderer.autoClear = previousAutoClear;
      renderer.setRenderTarget(previousTarget);
      renderer.setViewport(previousViewport);
      renderer.setScissor(previousScissor);
      renderer.setScissorTest(previousScissorTest);
      renderer.setClearColor(clearColor, previousAlpha);
      uniforms.tDepth.value = emptyTexture;
      uniforms.tHistory.value = emptyTexture;
      uniforms.tHistoryDepth.value = emptyTexture;
      uniforms.tShadow.value = emptyTexture;
      uniforms.tShadowCompare.value = emptyShadowTexture;
    }
  }

  function setSize(w, h) {
    const nextW = Math.max(1, w | 0), nextH = Math.max(1, h | 0);
    if (nextW === W && nextH === H) return;
    W = nextW; H = nextH;
    lowW = Math.max(1, Math.ceil(W * policy.scale)); lowH = Math.max(1, Math.ceil(H * policy.scale));
    for (const target of targets) target.setSize(lowW, lowH);
    invalidateHistory('resize');
  }

  function setQuality(value) {
    const next = nocturneAtmosphereQuality(value);
    if (quality === next) return;
    quality = next; policy = NOCTURNE_ATMOSPHERE_QUALITY[quality];
    uniforms.uSteps.value = policy.steps;
    lowW = Math.max(1, Math.ceil(W * policy.scale)); lowH = Math.max(1, Math.ceil(H * policy.scale));
    for (const target of targets) target.setSize(lowW, lowH);
    invalidateHistory('quality-change');
  }

  function bindComposite(targetUniforms, depthTexture, camera, fallbackTexture = emptyTexture) {
    const u = targetUniforms;
    u.uNocturneAtmosphere.value = active ? 1 : 0;
    u.tNocturneScatter.value = active ? output : fallbackTexture;
    u.tNocturneDepth.value = active ? outputDepth : fallbackTexture;
    u.tNocturneSceneDepth.value = active ? depthTexture : fallbackTexture;
    u.uNocturneTexel.value.set(1 / lowW, 1 / lowH);
    if (camera) {
      u.uNocturneNearFar.value.set(camera.near, camera.far);
      u.uNocturneOrthographic.value = camera.isOrthographicCamera ? 1 : 0;
    }
  }

  async function prepareResources(yieldToMain = () => Promise.resolve()) {
    if (!supported || disposed) return;
    const previousTarget = renderer.getRenderTarget();
    try {
      for (const target of targets) { await yieldToMain(); renderer.initRenderTarget(target); }
      await yieldToMain();
      renderer.setRenderTarget(targets[0]);
      renderer.compile(scene, quadCamera);
      // Admit the private fullscreen geometry while loading. With zero media this is a neutral
      // disposable offscreen draw; first entry into a dusty location must not upload new buffers.
      renderer.render(scene, quadCamera);
    } finally { renderer.setRenderTarget(previousTarget); }
  }

  function rebuild() {
    if (disposed) return;
    previousDepthTexture = null;
    try { supported = !!(renderer.capabilities?.isWebGL2 && renderer.getContext()?.getExtension('EXT_color_buffer_float')); }
    catch (_) { supported = false; }
    unsupportedReason = supported ? null : 'WebGL2 and EXT_color_buffer_float required';
    allocateTargets();
    emptyTexture.needsUpdate = true;
    emptyShadowTexture.needsUpdate = true;
    invalidateHistory('context-restored');
  }

  function getDiagnostics() {
    return {
      enabled, supported, unsupportedReason, active, quality, width: lowW, height: lowH,
      steps: policy.steps, media: uniforms.uMediumCount.value, lights: uniforms.uLightCount.value,
      mediaCap: NOCTURNE_MEDIA_CAP, lightCap: NOCTURNE_SCATTER_LIGHT_CAP,
      passes: active ? 1 : 0, targets: targets.length, textures: targets.length * 2,
      estimatedTargetBytes: targets.length * 2 * lowW * lowH * 8,
      historyValid, historyRejects, historyReason, generation, renderedFrames, vacuumFrames,
      shadowedLightId, shadowMode: shadowedLightId == null ? 'unshadowed' : 'one-selected-spot-pcf',
      shadowEncoding: shadowedLightId == null ? null : ['packed-rgba', 'native-depth', 'native-depth-comparison'][uniforms.uShadowEncoding.value],
      model: 'single-scattering-beer-lambert-local-ellipsoids',
      gpuAcceptance: 'unmeasured',
    };
  }

  function dispose({ disposeGpu = true } = {}) {
    if (disposed) return;
    disposed = true; active = false; historyValid = false;
    if (disposeGpu) for (const target of targets) target.dispose();
    targets.length = 0;
    if (disposeGpu) { material.dispose(); geometry.dispose(); emptyTexture.dispose(); emptyShadowTexture.dispose(); }
    media = null; lights = null; previousDepthTexture = null;
    output = emptyTexture; outputDepth = emptyTexture;
    uniforms.tDepth.value = null; uniforms.tHistory.value = null; uniforms.tHistoryDepth.value = null;
    uniforms.tShadow.value = null; uniforms.tShadowCompare.value = null;
    selectedIndices.fill(-1); selectedLightIds.fill(-1);
  }

  return {
    render, setSize, setQuality, bindComposite, prepareResources, rebuild, getDiagnostics, dispose,
    invalidateHistory,
    setMedia(value) { media = Array.isArray(value) ? value : null; },
    setLights(value) { lights = Array.isArray(value) ? value : null; },
    setEnabled(value) { const next = value !== false; if (next !== enabled) { enabled = next; active = false; invalidateHistory('enabled-change'); } },
    openingProgramMaterials() { return supported && !disposed ? [material] : []; },
    contextLossResources() { return [...targets, geometry, material, emptyTexture, emptyShadowTexture]; },
    get texture() { return output; },
    get depthTexture() { return outputDepth; },
    get active() { return active; },
    get supported() { return supported; },
    get lowWidth() { return lowW; },
    get lowHeight() { return lowH; },
  };
}
