/**
 * The drive CONTRAIL — leftover thruster light, left in space along the flown path.
 *
 * WHAT THIS IS
 * ------------
 * The plume (`plasmaRibbons.js`) is the live blast: nozzle-local, about two hull lengths, hot,
 * still firing. This is not a second jet and not a wire growing out of a pin on the hull. It is a
 * ghost of that same blast after it has already been thrown — the same overlapping plasma sheets,
 * born at the exhaust column's real size, cooling along the positions the nozzle actually occupied.
 *
 * The join is physical: while the drive is firing, the newest trail sits inside the jet's volume,
 * as wide as the jet, so they read as one exhaust becoming leftover light. The trail never inherits
 * the ship's current pointing; its tangent is the flown path. That is what stops it reading as a
 * horse's tail welded to the bumper.
 *
 * A vertex may only exist at a position the nozzle actually occupied. Nothing is pushed backwards
 * along the exhaust, because anything pushed backwards would be somewhere the ship has never been.
 */
import * as THREE from 'three';

/** Seconds of leftover light retained. Half the prior 2.5 s window. */
export const TRAIL_SECONDS = 1.2;
/**
 * Hard cap on retained path length, so high speed cannot restore a screen-spanning highway.
 *
 * The last DISSOLVE_WU of this is feather, not trail: the bright section still ends around 60 WU,
 * well inside the 88 WU this was cut back to when it WAS a highway. What the extra span buys is
 * somewhere for the exhaust to come apart, rather than a place for it to stop.
 */
export const MAX_SPAN_WU = 104;
/**
 * World units over which the far end comes apart into wisps.
 *
 * This is in world units, not a fraction, because the terminator it has to land on is in world
 * units. Anything normalised — sample index, fraction of span — rescales every vertex's fade the
 * moment the live sample count changes, and the sample count swings from ~72 when crawling to ~34
 * at cruise. That would drag the dissolve boundary up and down the trail every time you touch the
 * throttle. Floored against short trails in `update()`.
 */
export const DISSOLVE_WU = 34;
/** Path samples retained along the flown history. */
export const SAMPLE_COUNT = 160;
/** Overlapping plasma sheets — the same language as the jet, fewer because the ghost is colder. */
export const SHEET_COUNT = 16;
/** Alias so older call sites and tests keep a stable name. */
export const STRAND_COUNT = SHEET_COUNT;
/** Vertices across each sheet, so the grazing crease can exist. */
export const STRAND_ACROSS = 5;
/** Minimum nozzle movement between recorded history samples, in world units. */
export const MIN_STEP_WU = 0.12;
/** Discontinuity threshold for sector jumps or teleports. */
export const DISCONTINUITY_WU = 160;

const UP = new THREE.Vector3(0, 1, 0);

const TRAIL_VERT = /* glsl */`
  precision highp float;

  attribute float aSample;
  attribute float aSide;
  attribute float aStrand;

  uniform sampler2D uPathTex;
  uniform sampler2D uStateTex;
  uniform float uSampleCount;
  uniform float uStrandCount;
  uniform float uLive;
  uniform float uTime;
  uniform float uTrailSeconds;

  uniform vec3  uLiveNozzlePos;
  uniform float uIsEmitting;

  uniform float uHeadArc;
  uniform float uSpanWU;
  uniform float uDissolveWU;

  uniform float uRadiusHead;
  uniform float uRadiusTail;
  uniform float uWidthHead;
  uniform float uWidthTail;
  uniform float uFlowRate;
  uniform float uAxialFreq;
  uniform float uCurve;

  varying float vAge;
  varying float vLife;
  varying float vWisp;
  varying float vSide;
  varying float vDrive;
  varying float vBoost;
  varying float vDash;
  varying float vRadiusRatio;
  varying float vTongue;
  varying vec3  vWorldPos;
  varying vec3  vNormal;

  float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    return fract(p * (p + p));
  }

  float hash21(vec2 p) {
    p = fract(p * vec2(0.1031, 0.1030));
    p += dot(p, p.yx + 33.33);
    return fract((p.x + p.y) * p.x);
  }

  float vnoise2D(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float fbm2(vec2 x) {
    return vnoise2D(x) * 0.65 + vnoise2D(x * 2.17 + 11.3) * 0.35;
  }

  vec3 samplePathPos(float slot, out float ageOut, out float driveOut, out float arcOut, out float boostOut, out float dashOut) {
    float idx = clamp(slot, 0.0, max(uLive - 1.0, 0.0));
    float u = (idx + 0.5) / uSampleCount;
    vec4 path = texture2D(uPathTex, vec2(u, 0.5));
    vec4 state = texture2D(uStateTex, vec2(u, 0.5));
    driveOut = state.r;
    arcOut = state.g;
    boostOut = state.b;
    dashOut = state.a;

    if (slot < 0.5 && uIsEmitting > 0.5) {
      ageOut = 0.0;
      return uLiveNozzlePos;
    }

    ageOut = clamp(path.a / max(uTrailSeconds, 0.1), 0.0, 1.0);
    return path.rgb;
  }

  float sheetReach(float sheet) {
    float seed = hash11(sheet * 2.71 + 0.37);
    return 0.58 + seed * 0.42;
  }

  /**
   * How much of this sheet is still there, that many world units back from the nozzle.
   *
   * Staggered per sheet across the dissolve, because the terminator here is the length cap — the
   * same axis this measures. sheetReach staggers on the clock instead, and the clock is not what
   * ends the mesh at cruise, so on its own it leaves the sheets ending on one plane.
   */
  float sheetWisp(float sheet, float behind) {
    float seed = hash11(sheet * 5.17 + 4.31);
    float d = max(uDissolveWU, 0.5);
    float endWU = uSpanWU - d * (0.02 + seed * 0.38);
    float startWU = endWU - d * (0.55 + seed * 0.50);
    return 1.0 - smoothstep(startWU, max(endWU, startWU + 0.25), behind);
  }

  /** World units of flown path between the nozzle and this slot. Stable under speed changes. */
  float arcBehind(float slot) {
    float idx = clamp(slot, 0.0, max(uLive - 1.0, 0.0));
    float u = (idx + 0.5) / uSampleCount;
    return max(uHeadArc - texture2D(uStateTex, vec2(u, 0.5)).g, 0.0);
  }

  /**
   * The mesh carries more sample slots than the path has samples. Every surplus slot clamps onto the
   * last live one, and the first of those loses its tangent to the axis fallback — so a single band
   * splays a ring across the tip at whatever brightness the end happens to hold. Neck the geometry to
   * nothing over the last slot so that band has no area at all; alpha alone leaves a lit disk.
   */
  float edgeKill(float slot) {
    return clamp((uLive - 1.0 - slot) * 0.8, 0.0, 1.0);
  }

  vec3 sheetPoint(
    float slot, float sheet,
    out float ageOut, out float driveOut, out float rrOut, out float lifeOut, out float tongueOut, out float boostOut, out float dashOut, out float wispOut
  ) {
    float arcVal;
    vec3 p = samplePathPos(slot, ageOut, driveOut, arcVal, boostOut, dashOut);

    float aPrev, dPrev, arcPrev, bPrev, hPrev;
    vec3 pPrev = samplePathPos(max(slot - 1.0, 0.0), aPrev, dPrev, arcPrev, bPrev, hPrev);

    float aNext, dNext, arcNext, bNext, hNext;
    vec3 pNext = samplePathPos(min(slot + 1.0, uSampleCount - 1.0), aNext, dNext, arcNext, bNext, hNext);

    vec3 tangent = pNext - pPrev;
    if (dot(tangent, tangent) < 1e-7) tangent = p - pPrev;
    if (dot(tangent, tangent) < 1e-7) tangent = vec3(1.0, 0.0, 0.0);
    tangent = normalize(tangent);

    float reach = sheetReach(sheet);
    lifeOut = ageOut / max(reach, 1e-3);

    float behind = max(uHeadArc - arcVal, 0.0);
    wispOut = sheetWisp(sheet, behind);

    float seedA = hash11(sheet * 7.13 + 1.7);
    float seedB = hash11(sheet * 3.71 + 9.4);
    float flow = arcVal * uAxialFreq - uTime * uFlowRate * (0.82 + seedA * 0.42);
    float evo = uTime * 0.55 + seedB * 47.0;
    tongueOut = fbm2(vec2(flow * 1.35 + 23.0, evo * 1.4));

    // Exhaust comes apart with distance as well as with age, and keyed on age alone the widening
    // never arrived: the length cap retires the path at roughly 46% of its clock, so the trail held
    // very near its birth width right up to the cut. Diffusion length is DISSOLVE_WU.
    float diffuse = 1.0 - exp(-behind / 34.0);
    float spread = max(pow(ageOut, 0.82), diffuse);

    float radial = mix(uRadiusHead, uRadiusTail, spread);
    radial *= 0.90 + seedA * 0.16;
    float meander = (fbm2(vec2(flow * 0.45, evo * 0.7)) - 0.5) * 0.12 * spread;
    // Sheets pull apart as they give out, so the end scatters into separate wisps rather than
    // narrowing to a single point — which would be a sharpened nub, not a dispersal.
    radial *= 1.0 + meander + (1.0 - wispOut) * (0.35 + seedB * 0.55);

    float theta = (sheet / max(uStrandCount, 1.0)) * 6.2831853
      + seedB * 0.31
      + spread * 0.55 * (seedA > 0.5 ? 1.0 : -1.0);

    vec3 ref = normalize(cross(tangent, vec3(0.0, 1.0, 0.0)) + vec3(0.0, 1e-4, 0.0));
    vec3 up = cross(ref, tangent);

    rrOut = radial / max(uRadiusHead, 1e-3);
    radial *= edgeKill(slot);
    return p + ref * (cos(theta) * radial) + up * (sin(theta) * radial);
  }

  void main() {
    float age0, drive0, rr0, life0, tongue0, boost0, dash0, wisp0;
    vec3 p = sheetPoint(aSample, aStrand, age0, drive0, rr0, life0, tongue0, boost0, dash0, wisp0);

    float a1, d1, r1, l1, t1, b1, h1, w1;
    vec3 pPrev = sheetPoint(max(aSample - 1.0, 0.0), aStrand, a1, d1, r1, l1, t1, b1, h1, w1);

    float a2, d2, r2, l2, t2, b2, h2, w2;
    vec3 pNext = sheetPoint(min(aSample + 1.0, uSampleCount - 1.0), aStrand, a2, d2, r2, l2, t2, b2, h2, w2);

    vec3 tangent = normalize(pNext - pPrev + vec3(1e-5));
    vec3 ref = normalize(cross(tangent, vec3(0.0, 1.0, 0.0)) + vec3(0.0, 1e-4, 0.0));
    vec3 up = cross(ref, tangent);

    // Same reasoning as the radius: widen on distance travelled as well as on age, or the sheets
    // stay at birth width all the way to the cut.
    float widthSpread = max(pow(age0, 0.8), 1.0 - exp(-arcBehind(aSample) / 34.0));
    float halfWidth = mix(uWidthHead, uWidthTail, widthSpread) * 0.5;
    halfWidth *= 0.62 + hash11(aStrand * 4.11 + 2.9) * 0.7;
    halfWidth *= 0.78 + tongue0 * 0.45;
    halfWidth *= edgeKill(aSample);

    float twist = widthSpread * 1.15 + aStrand * 2.399 + uTime * 0.18;
    vec3 wide = normalize(ref * cos(twist) + up * sin(twist));
    vec3 sheetN = normalize(cross(tangent, wide));

    float curveAmt = uCurve * (0.4 + 0.7 * vnoise2D(vec2(age0 * 6.0 - uTime * uFlowRate, aStrand * 11.0)));
    float v = aSide;
    vec3 offset = wide * (halfWidth * v) + sheetN * (curveAmt * halfWidth * (v * v - 0.3333));
    vec3 acrossTan = wide * halfWidth + sheetN * (curveAmt * halfWidth * 2.0 * v);

    vec3 world = p + offset;

    vAge = age0;
    vLife = life0;
    vWisp = wisp0;
    vSide = aSide;
    vDrive = drive0;
    vBoost = boost0;
    vDash = dash0;
    vRadiusRatio = max(rr0, 1.0);
    vTongue = tongue0;
    vWorldPos = world;
    vNormal = normalize(cross(tangent, acrossTan));

    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const TRAIL_FRAG = /* glsl */`
  precision highp float;

  uniform vec3  uCoreColor;
  uniform vec3  uMidColor;
  uniform vec3  uEdgeColor;
  uniform float uRadiance;
  uniform float uOpacity;
  uniform float uGrazeGain;
  uniform float uGrazeFloor;
  uniform vec3  uCamPos;

  varying float vAge;
  varying float vLife;
  varying float vWisp;
  varying float vSide;
  varying float vDrive;
  varying float vBoost;
  varying float vDash;
  varying float vRadiusRatio;
  varying float vTongue;
  varying vec3  vWorldPos;
  varying vec3  vNormal;

  void main() {
    vec3 V = normalize(uCamPos - vWorldPos);
    vec3 N = normalize(vNormal);
    float facing = abs(dot(N, V));
    float graze = min(uGrazeGain, 1.0 / max(facing, uGrazeFloor));
    float spec = pow(graze, 2.2);

    float across = 1.0 - pow(abs(vSide), 3.6);
    float dilute = 1.0 / sqrt(max(vRadiusRatio, 1.0));

    // Two things end this trail: the clock, and the length cap. Only the clock used to be faded, and
    // at cruise the cap always wins first — so the mesh was guillotined at near-full density, which
    // is the blunt end. Take whichever terminator is closer. The clock still matters on its own:
    // when the drive goes cold the head stops moving, arc freezes, and age is all that is left.
    float runout = 1.0 - smoothstep(0.55, 1.0, vLife);
    float feather = min(runout, vWisp);

    // How far into giving out this fragment is, by whichever measure got there first.
    float spent = max(1.0 - vWisp, smoothstep(0.35, 0.96, vAge));
    float shred = mix(1.0, vTongue * 1.75, spent);
    float dense = dilute * across * feather * shred * (0.55 + vTongue * 0.7);

    float alpha = clamp(uOpacity * 1.35 * dense * (0.42 + graze * 0.58) * (0.55 + vDrive * 0.55), 0.0, 1.0);
    if (alpha < 0.0015) discard;

    float heat = exp(-vAge * 3.4) * (0.55 + vDrive * 0.55);
    heat *= 1.0 + vBoost * 0.45 + vDash * 1.1;
    // Cooling has to track the dissolve too, or the wisps stay the same colour as the hot section
    // and read as a torn edge rather than an end.
    heat *= 1.0 - 0.72 * spent;
    float sear = exp(-vAge * 7.5);

    vec3 col = mix(uEdgeColor, uMidColor, smoothstep(0.08, 0.62, heat));
    col = mix(col, uCoreColor, smoothstep(0.35, 0.9, sear * (0.45 + vDrive * 0.55)));

    float rad = uRadiance * (0.85 + heat * 1.15 + sear * 0.9 + spec * 0.55 + vDash * 1.4);
    gl_FragColor = vec4(col * rad, alpha);
  }
`;

function buildTrailGeometry(T, sheets, samples, across) {
  const verts = sheets * samples * across;
  const sample = new Float32Array(verts);
  const side = new Float32Array(verts);
  const strand = new Float32Array(verts);
  const position = new Float32Array(verts * 3);

  let v = 0;
  for (let r = 0; r < sheets; r++) {
    for (let s = 0; s < samples; s++) {
      for (let k = 0; k < across; k++) {
        sample[v] = s;
        side[v] = across <= 1 ? 0 : (k / (across - 1)) * 2 - 1;
        strand[v] = r;
        v++;
      }
    }
  }

  const quads = sheets * (samples - 1) * (across - 1);
  const index = new Uint32Array(quads * 6);
  let i = 0;
  for (let r = 0; r < sheets; r++) {
    for (let s = 0; s < samples - 1; s++) {
      const rowA = (r * samples + s) * across;
      const rowB = (r * samples + s + 1) * across;
      for (let k = 0; k < across - 1; k++) {
        const a = rowA + k;
        const b = rowA + k + 1;
        const c = rowB + k;
        const d = rowB + k + 1;
        index[i++] = a; index[i++] = b; index[i++] = c;
        index[i++] = b; index[i++] = d; index[i++] = c;
      }
    }
  }

  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.BufferAttribute(position, 3));
  geo.setAttribute('aSample', new T.BufferAttribute(sample, 1));
  geo.setAttribute('aSide', new T.BufferAttribute(side, 1));
  geo.setAttribute('aStrand', new T.BufferAttribute(strand, 1));
  geo.setIndex(new T.BufferAttribute(index, 1));
  return geo;
}

function makePathTexture(T, data, samples) {
  const tex = new T.DataTexture(data, samples, 1, T.RGBAFormat, T.FloatType);
  tex.magFilter = T.LinearFilter;
  tex.minFilter = T.LinearFilter;
  tex.wrapS = T.ClampToEdgeWrapping;
  tex.wrapT = T.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

export function createContrailMaterial(T, opts = {}) {
  const coreCol = opts.coreColor || [1.0, 0.99, 0.97];
  const midCol = opts.midColor || [0.10, 0.62, 1.0];
  const edgeCol = opts.edgeColor || [0.02, 0.10, 0.78];

  return new T.ShaderMaterial({
    uniforms: {
      uPathTex: { value: null },
      uStateTex: { value: null },
      uSampleCount: { value: SAMPLE_COUNT },
      uStrandCount: { value: SHEET_COUNT },
      uLive: { value: 0 },
      uTime: { value: 0 },
      uTrailSeconds: { value: TRAIL_SECONDS },

      uLiveNozzlePos: { value: new T.Vector3() },
      uIsEmitting: { value: 0 },

      uHeadArc: { value: 0 },
      uSpanWU: { value: MAX_SPAN_WU },
      uDissolveWU: { value: DISSOLVE_WU },

      uRadiusHead: { value: opts.radiusHead != null ? opts.radiusHead : 1.42 },
      uRadiusTail: { value: opts.radiusTail != null ? opts.radiusTail : 2.15 },
      uWidthHead: { value: opts.widthHead != null ? opts.widthHead : 1.55 },
      uWidthTail: { value: opts.widthTail != null ? opts.widthTail : 2.45 },
      uFlowRate: { value: 2.15 },
      uAxialFreq: { value: 0.085 },
      uCurve: { value: 1.25 },

      uCoreColor: { value: new T.Color(coreCol[0], coreCol[1], coreCol[2]) },
      uMidColor: { value: new T.Color(midCol[0], midCol[1], midCol[2]) },
      uEdgeColor: { value: new T.Color(edgeCol[0], edgeCol[1], edgeCol[2]) },

      uRadiance: { value: 1.45 },
      uOpacity: { value: 0.062 },
      uGrazeGain: { value: 5.2 },
      uGrazeFloor: { value: 0.22 },
      uCamPos: { value: new T.Vector3() },
    },
    vertexShader: TRAIL_VERT,
    fragmentShader: TRAIL_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: T.AdditiveBlending,
    side: T.DoubleSide,
    toneMapped: false,
  });
}

/**
 * One contrail. Owns one nozzle's flown path and the leftover plasma sheets along it.
 *
 * Sample 0 is always the newest. While emitting, it tracks the live nozzle position so the ghost
 * stays inside the jet; its tangent still comes from the path, never from the hull's current pose.
 */
export class ContrailTrail {
  constructor(T = THREE, opts = {}) {
    this.THREE = T;
    this.strands = opts.sheets || opts.strands || SHEET_COUNT;
    this.samples = opts.samples || SAMPLE_COUNT;
    this.across = opts.across || STRAND_ACROSS;
    this.trailSeconds = opts.trailSeconds || TRAIL_SECONDS;
    this.maxSpanWU = opts.maxSpanWU != null ? opts.maxSpanWU : MAX_SPAN_WU;

    this.geometry = buildTrailGeometry(T, this.strands, this.samples, this.across);
    this.material = createContrailMaterial(T, opts);
    this.material.uniforms.uSampleCount.value = this.samples;
    this.material.uniforms.uStrandCount.value = this.strands;
    this.material.uniforms.uTrailSeconds.value = this.trailSeconds;
    this._defaultCoreColor = this.material.uniforms.uCoreColor.value.clone();
    this._defaultMidColor = this.material.uniforms.uMidColor.value.clone();
    this._defaultEdgeColor = this.material.uniforms.uEdgeColor.value.clone();
    this._tintBase = new T.Color();
    this._tintWhite = new T.Color(1, 0.99, 0.97);
    this._tintKey = null;

    this.mesh = new T.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.visible = false;

    this._path = new Float32Array(this.samples * 4);
    this._state = new Float32Array(this.samples * 4);
    this._live = 0;
    this._time = 0;
    this._isEmitting = false;

    this._pathTex = makePathTexture(T, this._path, this.samples);
    this._stateTex = makePathTexture(T, this._state, this.samples);
    this.material.uniforms.uPathTex.value = this._pathTex;
    this.material.uniforms.uStateTex.value = this._stateTex;
  }

  attach(parent) {
    if (parent && this.mesh.parent !== parent) parent.add(this.mesh);
  }

  reset() {
    this._live = 0;
    this._isEmitting = false;
    this.mesh.visible = false;
  }

  liveSampleCount() {
    return this._live;
  }

  setTint(color = null) {
    const key = color == null ? '' : String(color);
    if (key === this._tintKey) return false;
    this._tintKey = key;
    const uniforms = this.material.uniforms;
    if (!key) {
      uniforms.uCoreColor.value.copy(this._defaultCoreColor);
      uniforms.uMidColor.value.copy(this._defaultMidColor);
      uniforms.uEdgeColor.value.copy(this._defaultEdgeColor);
      return true;
    }
    this._tintBase.set(key);
    uniforms.uCoreColor.value.copy(this._tintBase).lerp(this._tintWhite, 0.72);
    uniforms.uMidColor.value.copy(this._tintBase).lerp(this._tintWhite, 0.12);
    uniforms.uEdgeColor.value.copy(this._tintBase).multiplyScalar(0.42);
    return true;
  }

  _copySample(dst, src) {
    this._path[dst] = this._path[src];
    this._path[dst + 1] = this._path[src + 1];
    this._path[dst + 2] = this._path[src + 2];
    this._path[dst + 3] = this._path[src + 3];
    this._state[dst] = this._state[src];
    this._state[dst + 1] = this._state[src + 1];
    this._state[dst + 2] = this._state[src + 2];
    this._state[dst + 3] = this._state[src + 3];
  }

  /** Ages every sample and retires the ones past TRAIL_SECONDS. */
  _age(dt) {
    let kept = 0;
    for (let i = 0; i < this._live; i++) {
      const src = i * 4;
      const age = this._path[src + 3] + dt;
      if (age >= this.trailSeconds) continue;
      if (kept !== i) this._copySample(kept * 4, src);
      this._path[kept * 4 + 3] = age;
      kept++;
    }
    this._live = kept;
  }

  _trimSpan() {
    if (this._live < 2) return;
    const headArc = this._state[1];
    while (this._live > 2) {
      const last = (this._live - 1) * 4;
      if (headArc - this._state[last + 1] <= this.maxSpanWU) break;
      this._live -= 1;
    }
  }

  /** Inserts a sample at the head, shifting the rest back one slot. */
  _push(x, y, z, drive, arc, boost, dash) {
    const n = Math.min(this._live + 1, this.samples);
    for (let i = n - 1; i > 0; i--) this._copySample(i * 4, (i - 1) * 4);
    this._path[0] = x;
    this._path[1] = y;
    this._path[2] = z;
    this._path[3] = 0;
    this._state[0] = drive;
    this._state[1] = arc;
    this._state[2] = boost;
    this._state[3] = dash;
    this._live = n;
  }

  /**
   * @param {number} dt seconds
   * @param {{x:number,y:number,z:number}|null} nozzle world position of the exhaust source
   * @param {object} env drive envelope; reads drive, emitFloor, throatRadius, boost, dash
   */
  update(dt, nozzle, env) {
    const d = Math.max(0, dt || 0);
    this._time += d;
    this._age(d);

    const drive = Math.max(0, Math.min(1.4, (env && env.drive != null ? env.drive : env && env.spool) || 0));
    const floor = env && env.emitFloor != null ? env.emitFloor : 0.02;
    const boost = Math.max(0, (env && env.boost) || 0);
    const dash = Math.max(0, (env && env.dash) || 0);
    const isEmitting = !!(nozzle && drive > floor);
    this._isEmitting = isEmitting;

    const u = this.material.uniforms;

    if (isEmitting) {
      u.uLiveNozzlePos.value.set(nozzle.x, nozzle.y, nozzle.z);
      u.uIsEmitting.value = 1.0;

      if (this._live === 0) {
        this._push(nozzle.x, nozzle.y, nozzle.z, drive, 0, boost, dash);
      } else {
        const dx = nozzle.x - this._path[0];
        const dy = nozzle.y - this._path[1];
        const dz = nozzle.z - this._path[2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist > DISCONTINUITY_WU) {
          this._live = 0;
          this._push(nozzle.x, nozzle.y, nozzle.z, drive, 0, boost, dash);
        } else if (dist >= MIN_STEP_WU) {
          this._push(nozzle.x, nozzle.y, nozzle.z, drive, this._state[1] + dist, boost, dash);
        } else {
          this._path[0] = nozzle.x;
          this._path[1] = nozzle.y;
          this._path[2] = nozzle.z;
          this._path[3] = 0;
          this._state[0] = drive;
          this._state[2] = boost;
          this._state[3] = dash;
        }
      }
    } else {
      u.uIsEmitting.value = 0.0;
    }

    this._trimSpan();

    if (this._live < 2) {
      this.mesh.visible = false;
      return;
    }

    const last = (this._live - 1) * 4;
    for (let i = this._live; i < this.samples; i++) {
      const s = i * 4;
      this._path[s] = this._path[last];
      this._path[s + 1] = this._path[last + 1];
      this._path[s + 2] = this._path[last + 2];
      this._path[s + 3] = this.trailSeconds;
      this._state[s] = 0;
      this._state[s + 1] = this._state[last + 1];
      this._state[s + 2] = 0;
      this._state[s + 3] = 0;
    }

    this._pathTex.needsUpdate = true;
    this._stateTex.needsUpdate = true;

    u.uLive.value = this._live;
    u.uTime.value = this._time % 3600;

    // The dissolve is measured back from the nozzle along the flown path, so it lands on the real end
    // of the mesh whichever terminator produced it. Floored against short trails: crawling, the whole
    // retained path can be ~24 WU, and a fixed 34 WU dissolve would erase nearly all of it.
    const headArc = this._state[1];
    const spanArc = Math.max(headArc - this._state[(this._live - 1) * 4 + 1], 0.001);
    u.uHeadArc.value = headArc;
    u.uSpanWU.value = spanArc;
    u.uDissolveWU.value = Math.min(DISSOLVE_WU, spanArc * 0.45);

    const throat = env && env.throatRadius != null ? env.throatRadius : 0;
    if (throat > 0.05) {
      u.uRadiusHead.value = throat * 1.08;
      u.uRadiusTail.value = throat * 1.08 + 0.72;
      u.uWidthHead.value = Math.max(1.45, throat * 1.12);
    }

    if (env && env.trailRadiance != null) u.uRadiance.value = env.trailRadiance;
    if (env && env.trailOpacity != null) u.uOpacity.value = env.trailOpacity;
    this.mesh.visible = true;
  }

  setCamera(camera) {
    if (!camera) return;
    this.material.uniforms.uCamPos.value.copy(camera.position);
  }

  /** Newest-first copy of the flown path, for tests and probes. */
  samplePositions() {
    const out = [];
    for (let i = 0; i < this._live; i++) {
      const s = i * 4;
      out.push({ x: this._path[s], y: this._path[s + 1], z: this._path[s + 2], age: this._path[s + 3] });
    }
    return out;
  }

  inspect() {
    let span = 0;
    if (this._live > 1) {
      const b = (this._live - 1) * 4;
      const dx = this._path[0] - this._path[b];
      const dy = this._path[1] - this._path[b + 1];
      const dz = this._path[2] - this._path[b + 2];
      span = Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    return {
      construction: 'path-history-sheets',
      element: 'contrail',
      strands: this.strands,
      sheets: this.strands,
      samples: this.samples,
      liveSamples: this._live,
      trailSeconds: this.trailSeconds,
      spanWU: span,
      maxSpanWU: this.maxSpanWU,
      dissolveWU: this.material.uniforms.uDissolveWU.value,
      advectsAft: false,
      grazing: true,
      visible: !!this.mesh.visible,
    };
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
    this._pathTex.dispose();
    this._stateTex.dispose();
    if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
  }
}

export const __testables = { buildTrailGeometry, UP };
