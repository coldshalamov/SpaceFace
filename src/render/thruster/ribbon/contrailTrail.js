/**
 * The drive CONTRAIL — the Snake-style history trail. A different object from the plume, on purpose.
 *
 * WHAT MAKES THIS DIFFERENT FROM THE PLUME
 * ----------------------------------------
 * The plume (`plasmaRibbons.js`) is a jet: nozzle-local, about two hull lengths, hot, anchored to the
 * bell, with gas flowing through it. This is not that. This is a record of WHERE THE NOZZLE HAS BEEN
 * over the last couple of seconds, and it obeys one hard rule:
 *
 *     A contrail vertex may only exist at a position the nozzle actually occupied.
 *
 * There is no aft advection here at all. Nothing is pushed backwards along the exhaust axis, because
 * anything pushed backwards would be somewhere the ship has never been. That is precisely the bug that
 * made the previous attempt read as "a ribbon bolted to the ship and dragged around like a horse's
 * tail" — it was one object trying to be both a jet and a history, so the jet had to be two seconds
 * long, and at cruise two seconds is hundreds of world units.
 *
 * Consequences of the rule, all of which are wanted:
 *   - Parked and thrusting lays down nothing, because the nozzle has not gone anywhere.
 *   - The trail is exactly as long as the distance flown, never a fixed length that snaps into being.
 *   - Turning writes a curve, because the nozzle went round a curve.
 *
 * Samples are only taken while the drive is actually firing, and only once the nozzle has moved a
 * minimum distance, so the trail is a spatial path rather than a pile of coincident samples.
 *
 * The material is cold. A contrail is not burning — it is exhaust condensate catching ambient and star
 * light — so its radiance is low and flat and its visibility comes from how much material is left.
 * Alpha falls only because the condensate genuinely disperses.
 */
import * as THREE from 'three';

/** Seconds of flight history retained. */
export const TRAIL_SECONDS = 2.0;
/** Path samples retained. TRAIL_SECONDS * sample rate, with headroom. */
export const SAMPLE_COUNT = 128;
/** Strands braided along the path. */
export const STRAND_COUNT = 7;
/** Vertices across each strand, so each strand is a curved sheet rather than a flat wire. */
export const STRAND_ACROSS = 3;
/**
 * Minimum nozzle movement between samples, in world units. Below this the ship has not meaningfully
 * gone anywhere, so no sample is written and a hovering ship accumulates no trail.
 */
export const MIN_STEP_WU = 0.12;
/**
 * A jump between sectors moves the ship an enormous distance in one frame. Past this, history is
 * dropped rather than joined, so the trail never draws a line across the map.
 */
export const DISCONTINUITY_WU = 160;

const UP = new THREE.Vector3(0, 1, 0);

const TRAIL_VERT = /* glsl */`
  precision highp float;

  attribute float aSample;
  attribute float aSide;
  attribute float aStrand;

  uniform sampler2D uPathTex;   // rgb = world position the nozzle occupied, a = age in seconds
  uniform sampler2D uStateTex;  // r = drive at the time, g = arc length, ba = unused
  uniform float uSampleCount;
  uniform float uStrandCount;
  uniform float uLive;          // samples actually written; beyond this the strip is collapsed
  uniform float uTime;

  uniform float uHeadRadius;    // strand offset from the path at birth
  uniform float uTailRadius;    // strand offset once fully dispersed
  uniform float uWidthHead;
  uniform float uWidthTail;
  uniform float uDrift;         // slow azimuthal drift, radians per second
  uniform float uCurve;

  varying float vAge;           // 0 at the newest sample, 1 at retirement
  varying float vSide;
  varying float vDrive;
  varying float vRadiusRatio;
  varying vec3  vWorldPos;
  varying vec3  vNormal;

  float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    return fract(p * (p + p));
  }

  float vnoise(float x) {
    float i = floor(x);
    float f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(hash11(i), hash11(i + 1.0), f);
  }

  /**
   * Centreline of one strand at a path sample. Called three times per vertex so the strand's own
   * tangent — and so its normal, and so its grazing term — is exact.
   *
   * The path position is READ and never displaced along the exhaust axis. Lateral dispersal is the
   * only offset applied, and it is symmetric about the path, so the strand stays on the flown line.
   */
  vec3 strandPoint(float slot, float strand, out float ageOut, out float driveOut, out float rrOut) {
    float idx = min(slot, max(uLive - 1.0, 0.0));
    float u = (idx + 0.5) / uSampleCount;
    vec4 path = texture2D(uPathTex, vec2(u, 0.5));
    vec4 state = texture2D(uStateTex, vec2(u, 0.5));

    float ageN = clamp(path.a / ${TRAIL_SECONDS.toFixed(3)}, 0.0, 1.0);
    ageOut = ageN;
    driveOut = state.r;

    // Local frame from the flown path itself, so the braid follows the curve the ship actually flew.
    float du = 1.0 / uSampleCount;
    vec3 ahead = texture2D(uPathTex, vec2(max(u - du, 0.0), 0.5)).rgb;
    vec3 behind = texture2D(uPathTex, vec2(min(u + du, 1.0), 0.5)).rgb;
    vec3 tangent = ahead - behind;
    if (dot(tangent, tangent) < 1e-8) tangent = vec3(1.0, 0.0, 0.0);
    tangent = normalize(tangent);
    vec3 side = normalize(cross(tangent, vec3(0.0, 1.0, 0.0)) + vec3(0.0, 1e-4, 0.0));
    vec3 up = cross(side, tangent);

    float seed = hash11(strand * 7.13 + 1.7);
    // Condensate keeps spreading after it is laid down, so the braid opens with age. Widening rather
    // than narrowing is what makes it read as dispersal: a strand that narrows with age converges on a
    // one-pixel line and reads as a ruled line drawn across the screen.
    float radius = mix(uHeadRadius, uTailRadius, pow(ageN, 0.7)) * (0.35 + seed * 1.3);
    // Meander in the plane normal to the path, seeded per strand and drifting slowly in time so the
    // braid keeps moving after the ship has left it.
    float theta = (strand / max(uStrandCount, 1.0)) * 6.2831853
      + seed * 6.2831853
      + uDrift * (uTime * 0.35 + ageN * 2.0)
      + (vnoise(state.g * 0.35 + seed * 29.0) - 0.5) * 2.4;

    rrOut = radius / max(uHeadRadius, 1e-3);
    return path.rgb + side * (cos(theta) * radius) + up * (sin(theta) * radius);
  }

  void main() {
    float age0, drive0, rr0, a1, d1, r1, a2, d2, r2;
    vec3 p = strandPoint(aSample, aStrand, age0, drive0, rr0);
    vec3 pPrev = strandPoint(max(aSample - 1.0, 0.0), aStrand, a1, d1, r1);
    vec3 pNext = strandPoint(min(aSample + 1.0, uSampleCount - 1.0), aStrand, a2, d2, r2);

    vec3 tangent = normalize(pNext - pPrev + vec3(1e-5));

    vec3 ref = normalize(cross(tangent, vec3(0.0, 1.0, 0.0)) + vec3(0.0, 1e-4, 0.0));
    vec3 ref2 = cross(ref, tangent);
    float twist = age0 * 5.3 + aStrand * 2.399 + uTime * 0.4;
    vec3 wide = normalize(ref * cos(twist) + ref2 * sin(twist));

    float halfWidth = mix(uWidthHead, uWidthTail, pow(age0, 0.8)) * 0.5;

    vec3 sheetN = normalize(cross(tangent, wide));
    float curveAmt = uCurve * (0.4 + 0.9 * vnoise(age0 * 9.0 + aStrand * 13.0));

    float v = aSide;
    vec3 offset = wide * (halfWidth * v) + sheetN * (curveAmt * halfWidth * (v * v - 0.3333));
    vec3 acrossTan = wide * halfWidth + sheetN * (curveAmt * halfWidth * 2.0 * v);

    vec3 world = p + offset;

    vAge = age0;
    vSide = aSide;
    vDrive = drive0;
    vRadiusRatio = max(rr0, 1.0);
    vWorldPos = world;
    vNormal = normalize(cross(tangent, acrossTan));

    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const TRAIL_FRAG = /* glsl */`
  precision highp float;

  uniform vec3  uColor;
  uniform vec3  uWarmColor;
  uniform float uRadiance;
  uniform float uOpacity;
  uniform float uGrazeGain;
  uniform float uGrazeFloor;
  uniform vec3  uCamPos;

  varying float vAge;
  varying float vSide;
  varying float vDrive;
  varying float vRadiusRatio;
  varying vec3  vWorldPos;
  varying vec3  vNormal;

  void main() {
    vec3 V = normalize(uCamPos - vWorldPos);
    vec3 N = normalize(vNormal);
    float facing = abs(dot(N, V));
    float graze = min(uGrazeGain, 1.0 / max(facing, uGrazeFloor));

    // Alpha is material, and the only reason it falls is that the condensate disperses. The braid also
    // spreads, which dilutes it geometrically, and each strand runs out at its own rim.
    // Mild. Squeezing dispersal and dilution too hard leaves only a narrow band of ages visible, and a
    // narrow band of ages along a path IS a line — which is how this ended up reading as bright wire
    // instead of as spreading exhaust.
    float dilute = 1.0 / sqrt(max(vRadiusRatio, 1.0));
    float disperse = pow(max(1.0 - vAge, 0.0), 1.1);
    float across = 1.0 - pow(abs(vSide), 4.0);
    // The freshest samples sit inside the jet, which is drawing that same gas far brighter. Holding the
    // trail off until the gas is behind the jet is what keeps the two from reading as one continuous
    // object running out of the hull.
    float onset = smoothstep(0.0, 0.06, vAge);
    float alpha = clamp(uOpacity * dilute * disperse * across * onset * graze * (0.45 + vDrive * 0.75), 0.0, 1.0);
    if (alpha < 0.002) discard;

    // Cold. A contrail is not burning, so it has no emission of its own; this is condensate catching
    // ambient and star light, with a little residual heat in the section nearest the jet.
    float residual = exp(-vAge * 14.0);
    vec3 col = mix(uColor, uWarmColor, residual * 0.7);
    float rad = uRadiance * (0.5 + graze * 0.18 + residual * 0.9);
    gl_FragColor = vec4(col * rad, alpha);
  }
`;

function buildTrailGeometry(T, strands, samples, across) {
  const verts = strands * samples * across;
  const sample = new Float32Array(verts);
  const side = new Float32Array(verts);
  const strand = new Float32Array(verts);
  const position = new Float32Array(verts * 3);

  let v = 0;
  for (let r = 0; r < strands; r++) {
    for (let s = 0; s < samples; s++) {
      for (let k = 0; k < across; k++) {
        sample[v] = s;
        side[v] = across <= 1 ? 0 : (k / (across - 1)) * 2 - 1;
        strand[v] = r;
        v++;
      }
    }
  }

  const quads = strands * (samples - 1) * (across - 1);
  const index = new Uint32Array(quads * 6);
  let i = 0;
  for (let r = 0; r < strands; r++) {
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

export function createContrailMaterial(T, opts = {}) {
  const cold = opts.color || [0.06, 0.34, 0.95];
  const warm = opts.warmColor || [0.34, 0.78, 1.0];
  return new T.ShaderMaterial({
    uniforms: {
      uPathTex: { value: null },
      uStateTex: { value: null },
      uSampleCount: { value: SAMPLE_COUNT },
      uStrandCount: { value: STRAND_COUNT },
      uLive: { value: 0 },
      uTime: { value: 0 },
      // Starts near the flown line and opens out as the condensate spreads.
      uHeadRadius: { value: 0.9 },
      uTailRadius: { value: 9.0 },
      // Strands must be wide enough to overlap. Narrow strands read as bright wires — pen-and-ink
      // rather than dispersing exhaust — which is the single thing that made the last pass look cheap.
      uWidthHead: { value: 0.9 },
      uWidthTail: { value: 7.0 },
      uDrift: { value: 0.9 },
      uCurve: { value: 1.2 },
      uColor: { value: new T.Color(cold[0], cold[1], cold[2]) },
      uWarmColor: { value: new T.Color(warm[0], warm[1], warm[2]) },
      // Far below the jet. This is cold condensate catching starlight; if it competes with the jet for
      // brightness then the jet stops being the thing the eye goes to and the pair read as one tail.
      uRadiance: { value: 0.20 },
      uOpacity: { value: 0.008 },
      uGrazeGain: { value: 3.6 },
      uGrazeFloor: { value: 0.2 },
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
 * One contrail. Owns the nozzle's flown path and the braid drawn along it.
 *
 * Sample 0 is always the newest, so the shader can treat sample index as age order.
 */
export class ContrailTrail {
  constructor(T = THREE, opts = {}) {
    this.THREE = T;
    this.strands = opts.strands || STRAND_COUNT;
    this.samples = opts.samples || SAMPLE_COUNT;
    this.across = opts.across || STRAND_ACROSS;

    this.geometry = buildTrailGeometry(T, this.strands, this.samples, this.across);
    this.material = createContrailMaterial(T, opts);
    this.material.uniforms.uSampleCount.value = this.samples;
    this.material.uniforms.uStrandCount.value = this.strands;

    this.mesh = new T.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.visible = false;

    this._path = new Float32Array(this.samples * 4);   // x, y, z, age
    this._state = new Float32Array(this.samples * 4);  // drive, arcLength, 0, 0
    this._live = 0;
    this._time = 0;

    this._pathTex = new T.DataTexture(this._path, this.samples, 1, T.RGBAFormat, T.FloatType);
    this._pathTex.needsUpdate = true;
    this._stateTex = new T.DataTexture(this._state, this.samples, 1, T.RGBAFormat, T.FloatType);
    this._stateTex.needsUpdate = true;
    this.material.uniforms.uPathTex.value = this._pathTex;
    this.material.uniforms.uStateTex.value = this._stateTex;
  }

  attach(parent) {
    if (parent && this.mesh.parent !== parent) parent.add(this.mesh);
  }

  reset() {
    this._live = 0;
    this.mesh.visible = false;
  }

  /** Ages every sample and retires the ones past TRAIL_SECONDS. */
  _age(dt) {
    let kept = 0;
    for (let i = 0; i < this._live; i++) {
      const src = i * 4;
      const age = this._path[src + 3] + dt;
      if (age >= TRAIL_SECONDS) continue;
      const d = kept * 4;
      if (kept !== i) {
        this._path[d] = this._path[src];
        this._path[d + 1] = this._path[src + 1];
        this._path[d + 2] = this._path[src + 2];
        this._state[d] = this._state[src];
        this._state[d + 1] = this._state[src + 1];
      }
      this._path[d + 3] = age;
      kept++;
    }
    this._live = kept;
  }

  /** Inserts a sample at the head, shifting the rest back one slot. */
  _push(x, y, z, drive, arc) {
    const n = Math.min(this._live + 1, this.samples);
    for (let i = n - 1; i > 0; i--) {
      const d = i * 4;
      const s = (i - 1) * 4;
      this._path[d] = this._path[s];
      this._path[d + 1] = this._path[s + 1];
      this._path[d + 2] = this._path[s + 2];
      this._path[d + 3] = this._path[s + 3];
      this._state[d] = this._state[s];
      this._state[d + 1] = this._state[s + 1];
    }
    this._path[0] = x;
    this._path[1] = y;
    this._path[2] = z;
    this._path[3] = 0;
    this._state[0] = drive;
    this._state[1] = arc;
    this._live = n;
  }

  /**
   * @param {number} dt seconds
   * @param {{x:number,y:number,z:number}} nozzle world position of the exhaust source
   * @param {object} env drive envelope; only `drive` and `emitFloor` are read
   */
  update(dt, nozzle, env) {
    const d = Math.max(0, dt || 0);
    this._time += d;
    this._age(d);

    const drive = Math.max(0, Math.min(1.4, (env && env.drive != null ? env.drive : env && env.spool) || 0));
    const floor = env && env.emitFloor != null ? env.emitFloor : 0.02;

    if (nozzle && drive > floor) {
      if (this._live === 0) {
        this._push(nozzle.x, nozzle.y, nozzle.z, drive, 0);
      } else {
        const dx = nozzle.x - this._path[0];
        const dy = nozzle.y - this._path[1];
        const dz = nozzle.z - this._path[2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist > DISCONTINUITY_WU) {
          // Sector jump. Joining across it would rule a line over the whole map.
          this._live = 0;
          this._push(nozzle.x, nozzle.y, nozzle.z, drive, 0);
        } else if (dist >= MIN_STEP_WU) {
          this._push(nozzle.x, nozzle.y, nozzle.z, drive, this._state[1] + dist);
        }
      }
    }

    // A trail needs two samples to have a direction. One sample means the nozzle has been in exactly
    // one place, and one place is not a path.
    if (this._live < 2) {
      this.mesh.visible = false;
      return;
    }

    // Slots past the live count are parked on the oldest live sample at retirement age, so the tail of
    // the strip collapses onto itself instead of running to the world origin.
    const last = (this._live - 1) * 4;
    for (let i = this._live; i < this.samples; i++) {
      const s = i * 4;
      this._path[s] = this._path[last];
      this._path[s + 1] = this._path[last + 1];
      this._path[s + 2] = this._path[last + 2];
      this._path[s + 3] = TRAIL_SECONDS;
      this._state[s] = 0;
      this._state[s + 1] = this._state[last + 1];
    }

    this._pathTex.needsUpdate = true;
    this._stateTex.needsUpdate = true;

    const u = this.material.uniforms;
    u.uLive.value = this._live;
    u.uTime.value = this._time % 3600;
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
      const a = 0;
      const b = (this._live - 1) * 4;
      const dx = this._path[a] - this._path[b];
      const dy = this._path[a + 1] - this._path[b + 1];
      const dz = this._path[a + 2] - this._path[b + 2];
      span = Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    return {
      construction: 'path-history-braid',
      element: 'contrail',
      strands: this.strands,
      samples: this.samples,
      liveSamples: this._live,
      trailSeconds: TRAIL_SECONDS,
      // End-to-end distance of the retained path. Bounded by how far the ship actually flew, never by
      // an exhaust velocity, because nothing here advects.
      spanWU: span,
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
