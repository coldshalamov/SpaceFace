/**
 * The drive CONTRAIL — an immutable world-space history of the thruster base.
 *
 * THIS IS A RECORDER, NOT A ROPE
 * ------------------------------
 * Each sample is a fact: while the drive was emitting, the nozzle occupied one exact world-space
 * position at one exact time. After that sample is written, its position and birth state never
 * change. The ship may slow, stop, turn, coast, teleport, or cut thrust; none of those events can
 * pull, advect, re-anchor, reel, stretch, or otherwise rewrite the recorded fact.
 *
 * The only clock that can remove a sample is its own age. Visual intensity and temperature may cool
 * monotonically with that age, but there is no pulse clock, travelling band, current-drive coupling,
 * distance cap, live-head override, or tail cursor. When thrust stops, the burn remains where it was
 * laid down and fades there.
 *
 * The live plume (`plasmaRibbons.js`) is a different object. It is nozzle-local and animated because
 * it represents gas currently leaving the engine. This object represents light already left behind.
 */
import * as THREE from 'three';

/** Seconds an emitted history sample remains alive. */
export const TRAIL_SECONDS = 1.2;
/**
 * Fixed texture/geometry capacity. At normal 60–144 Hz presentation rates this is comfortably above
 * the number of samples that can be born during TRAIL_SECONDS. If an extreme frame rate fills the
 * buffer, new samples are skipped until age creates room; existing history is never deleted to make
 * space, because that would violate time-only retirement.
 */
export const SAMPLE_COUNT = 384;
/** Overlapping plasma sheets around the recorded centerline. */
export const SHEET_COUNT = 16;
/** Stable alias retained for callers and tests. */
export const STRAND_COUNT = SHEET_COUNT;
/** Vertices across each sheet, allowing a curved luminous cross-section. */
export const STRAND_ACROSS = 5;
/** Minimum movement before another exact nozzle position is committed. */
export const MIN_STEP_WU = 0.12;
/** A teleport/sector jump starts another disconnected history segment; it never erases the old one. */
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
  uniform float uTrailSeconds;

  uniform float uRadiusHead;
  uniform float uRadiusTail;
  uniform float uWidthHead;
  uniform float uWidthTail;
  uniform float uCurve;

  varying float vAge;
  varying float vLife;
  varying float vSide;
  varying float vDrive;
  varying float vBoost;
  varying float vDash;
  varying float vStaticTexture;
  varying vec3  vWorldPos;
  varying vec3  vNormal;

  float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    return fract(p * (p + p));
  }

  float hash31(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }

  void samplePath(
    float slot,
    out vec3 posOut,
    out float ageOut,
    out float driveOut,
    out float boostOut,
    out float dashOut,
    out float segmentOut
  ) {
    float idx = clamp(slot, 0.0, max(uLive - 1.0, 0.0));
    float u = (idx + 0.5) / uSampleCount;
    vec4 path = texture2D(uPathTex, vec2(u, 0.5));
    vec4 state = texture2D(uStateTex, vec2(u, 0.5));
    posOut = path.rgb;
    ageOut = clamp(path.a / max(uTrailSeconds, 0.001), 0.0, 1.0);
    driveOut = state.r;
    boostOut = state.g;
    dashOut = state.b;
    segmentOut = state.a;
  }

  float sameSegment(float a, float b) {
    return 1.0 - step(0.25, abs(a - b));
  }

  /** Slots outside the live sample range carry no area. */
  float liveMask(float slot) {
    return 1.0 - step(uLive - 0.5, slot);
  }

  void main() {
    vec3 p;
    float age;
    float drive;
    float boost;
    float dash;
    float segment;
    samplePath(aSample, p, age, drive, boost, dash, segment);

    vec3 pPrev;
    float agePrev;
    float drivePrev;
    float boostPrev;
    float dashPrev;
    float segmentPrev;
    samplePath(max(aSample - 1.0, 0.0), pPrev, agePrev, drivePrev, boostPrev, dashPrev, segmentPrev);

    vec3 pNext;
    float ageNext;
    float driveNext;
    float boostNext;
    float dashNext;
    float segmentNext;
    samplePath(min(aSample + 1.0, max(uLive - 1.0, 0.0)), pNext, ageNext, driveNext, boostNext, dashNext, segmentNext);

    float hasPrev = step(0.5, aSample);
    float hasNext = step(aSample + 1.5, uLive);
    float prevSame = mix(1.0, sameSegment(segment, segmentPrev), hasPrev);
    float nextSame = mix(1.0, sameSegment(segment, segmentNext), hasNext);

    if (prevSame < 0.5) pPrev = p;
    if (nextSame < 0.5) pNext = p;

    vec3 tangent = pNext - pPrev;
    if (dot(tangent, tangent) < 1e-7) tangent = vec3(1.0, 0.0, 0.0);
    tangent = normalize(tangent);

    vec3 ref = cross(tangent, vec3(0.0, 1.0, 0.0));
    if (dot(ref, ref) < 1e-7) ref = cross(tangent, vec3(1.0, 0.0, 0.0));
    ref = normalize(ref);
    vec3 up = normalize(cross(ref, tangent));

    // Every geometric variation is keyed to immutable data: recorded world position, segment and
    // sheet id. There is deliberately no time uniform and no age-driven position deformation.
    float sheetSeed = hash11(aStrand * 7.13 + segment * 0.37 + 1.7);
    float worldSeed = hash31(floor(p * 0.31) + vec3(aStrand * 0.17, segment * 0.11, 9.4));
    float staticTexture = hash31(p * 0.067 + vec3(aStrand * 3.1, segment * 0.7, 17.0));

    float radius = mix(uRadiusHead, uRadiusTail, 0.20 + worldSeed * 0.62);
    radius *= 0.90 + sheetSeed * 0.16;
    float theta = (aStrand / max(uStrandCount, 1.0)) * 6.2831853
      + (worldSeed - 0.5) * 0.42;

    // Collapse both rows surrounding a segment break. This prevents the fixed index buffer from
    // drawing a bridge across a teleport or a period when the engine was not emitting.
    float segmentEdge = 1.0 - max(1.0 - prevSame, 1.0 - nextSame);
    // "active" is a reserved word in GLSL ES; a driver may refuse to compile it.
    float liveFactor = liveMask(aSample) * segmentEdge;
    radius *= liveFactor;

    vec3 center = p + ref * (cos(theta) * radius) + up * (sin(theta) * radius);

    float halfWidth = mix(uWidthHead, uWidthTail, 0.18 + staticTexture * 0.66) * 0.5;
    halfWidth *= 0.68 + sheetSeed * 0.64;
    halfWidth *= liveFactor;

    float twist = aStrand * 2.399 + worldSeed * 1.3 + segment * 0.071;
    vec3 wide = normalize(ref * cos(twist) + up * sin(twist));
    vec3 sheetN = normalize(cross(tangent, wide));

    float v = aSide;
    float curveAmt = uCurve * (0.72 + staticTexture * 0.42);
    vec3 offset = wide * (halfWidth * v)
      + sheetN * (curveAmt * halfWidth * (v * v - 0.3333));
    vec3 acrossTan = wide * halfWidth
      + sheetN * (curveAmt * halfWidth * 2.0 * v);

    vec3 world = center + offset;

    vAge = age;
    vLife = age;
    vSide = aSide;
    vDrive = drive;
    vBoost = boost;
    vDash = dash;
    vStaticTexture = staticTexture;
    vWorldPos = world;
    vNormal = normalize(cross(tangent, acrossTan + vec3(1e-6)));

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
  varying float vSide;
  varying float vDrive;
  varying float vBoost;
  varying float vDash;
  varying float vStaticTexture;
  varying vec3  vWorldPos;
  varying vec3  vNormal;

  void main() {
    vec3 V = normalize(uCamPos - vWorldPos);
    vec3 N = normalize(vNormal);
    float facing = abs(dot(N, V));
    float graze = min(uGrazeGain, 1.0 / max(facing, uGrazeFloor));
    float spec = pow(graze, 2.0);

    float across = 1.0 - pow(abs(vSide), 3.6);

    // TIME IS THE ONLY TERMINATOR. This is monotonic in sample age and contains no spatial length,
    // current drive, speed, pulse phase, or current-nozzle term.
    float life = pow(max(1.0 - vLife, 0.0), 1.35);
    float filament = 0.72 + vStaticTexture * 0.48;
    float birthEnergy = 0.55 + vDrive * 0.45 + vBoost * 0.18 + vDash * 0.34;
    float density = across * life * filament * birthEnergy;

    float alpha = clamp(uOpacity * 1.35 * density * (0.46 + graze * 0.54), 0.0, 1.0);
    if (alpha < 0.0015) discard;

    // Cooling is also monotonic in age. Birth state is immutable metadata; the ship's current
    // throttle can never brighten or dim an old sample.
    float heat = exp(-vAge * 3.4) * birthEnergy;
    float sear = exp(-vAge * 7.5) * birthEnergy;
    vec3 col = mix(uEdgeColor, uMidColor, smoothstep(0.08, 0.62, heat));
    col = mix(col, uCoreColor, smoothstep(0.35, 0.9, sear));

    float rad = uRadiance * life
      * (0.78 + heat * 0.95 + sear * 0.62 + spec * 0.42 + vStaticTexture * 0.18);
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
      uTrailSeconds: { value: TRAIL_SECONDS },

      uRadiusHead: { value: opts.radiusHead != null ? opts.radiusHead : 1.42 },
      uRadiusTail: { value: opts.radiusTail != null ? opts.radiusTail : 2.15 },
      uWidthHead: { value: opts.widthHead != null ? opts.widthHead : 1.55 },
      uWidthTail: { value: opts.widthTail != null ? opts.widthTail : 2.45 },
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
 * One nozzle's immutable emission history. Sample 0 is newest; existing samples may shift buffer
 * slots as newer facts are inserted, but their world positions and birth state never change.
 */
export class ContrailTrail {
  constructor(T = THREE, opts = {}) {
    this.THREE = T;
    this.strands = opts.sheets || opts.strands || SHEET_COUNT;
    this.samples = opts.samples || SAMPLE_COUNT;
    this.across = opts.across || STRAND_ACROSS;
    this.trailSeconds = opts.trailSeconds || TRAIL_SECONDS;

    this.geometry = buildTrailGeometry(T, this.strands, this.samples, this.across);
    this.material = createContrailMaterial(T, opts);
    this.material.uniforms.uSampleCount.value = this.samples;
    this.material.uniforms.uStrandCount.value = this.strands;
    this.material.uniforms.uTrailSeconds.value = this.trailSeconds;

    this.mesh = new T.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.visible = false;

    // path: x, y, z, age seconds
    this._path = new Float32Array(this.samples * 4);
    // state: birth drive, birth boost, birth dash, immutable segment id
    this._state = new Float32Array(this.samples * 4);
    this._live = 0;
    this._isEmitting = false;
    this._segmentId = 0;
    this._capacitySkips = 0;

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
    this._segmentId = 0;
    this._capacitySkips = 0;
    this.material.uniforms.uLive.value = 0;
    this.mesh.visible = false;
  }

  liveSampleCount() {
    return this._live;
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

  /** Ages every sample and retires it only when its own lifetime expires. */
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

  /**
   * Inserts one immutable fact at the newest slot. Existing live samples are never evicted to make
   * space; in the pathological full-buffer case the new fact is skipped until age frees a slot.
   */
  _push(x, y, z, drive, boost, dash, segment) {
    if (this._live >= this.samples) {
      this._capacitySkips++;
      return false;
    }
    const n = this._live + 1;
    for (let i = n - 1; i > 0; i--) this._copySample(i * 4, (i - 1) * 4);
    this._path[0] = x;
    this._path[1] = y;
    this._path[2] = z;
    this._path[3] = 0;
    this._state[0] = drive;
    this._state[1] = boost;
    this._state[2] = dash;
    this._state[3] = segment;
    this._live = n;
    return true;
  }

  _fillUnused() {
    if (this._live <= 0) return;
    const last = (this._live - 1) * 4;
    for (let i = this._live; i < this.samples; i++) {
      const s = i * 4;
      this._path[s] = this._path[last];
      this._path[s + 1] = this._path[last + 1];
      this._path[s + 2] = this._path[last + 2];
      this._path[s + 3] = this.trailSeconds;
      this._state[s] = 0;
      this._state[s + 1] = 0;
      this._state[s + 2] = 0;
      this._state[s + 3] = this._state[last + 3];
    }
  }

  _publish(env) {
    const u = this.material.uniforms;
    if (this._live > 0) {
      this._fillUnused();
      this._pathTex.needsUpdate = true;
      this._stateTex.needsUpdate = true;
    }
    u.uLive.value = this._live;

    const throat = env && env.throatRadius != null ? env.throatRadius : 0;
    if (throat > 0.05) {
      u.uRadiusHead.value = throat * 1.08;
      u.uRadiusTail.value = throat * 1.08 + 0.72;
      u.uWidthHead.value = Math.max(1.45, throat * 1.12);
    }
    if (env && env.trailRadiance != null) u.uRadiance.value = env.trailRadiance;
    if (env && env.trailOpacity != null) u.uOpacity.value = env.trailOpacity;

    this.mesh.visible = this._live >= 2;
  }

  /**
   * @param {number} dt seconds
   * @param {{x:number,y:number,z:number}|null} nozzle current world position of the exhaust source
   * @param {object} env immutable birth-state source; reads drive/spool, emitFloor, boost and dash
   */
  update(dt, nozzle, env) {
    const d = Math.max(0, dt || 0);
    this._age(d);

    const drive = Math.max(0, Math.min(1.4,
      (env && env.drive != null ? env.drive : env && env.spool) || 0));
    const floor = env && env.emitFloor != null ? env.emitFloor : 0.02;
    const boost = Math.max(0, (env && env.boost) || 0);
    const dash = Math.max(0, (env && env.dash) || 0);
    const wasEmitting = this._isEmitting;
    const isEmitting = !!(nozzle && drive > floor);
    this._isEmitting = isEmitting;

    if (isEmitting) {
      const x = Number.isFinite(nozzle.x) ? nozzle.x : 0;
      const y = Number.isFinite(nozzle.y) ? nozzle.y : 0;
      const z = Number.isFinite(nozzle.z) ? nozzle.z : 0;

      if (this._live === 0) {
        this._push(x, y, z, drive, boost, dash, this._segmentId);
      } else if (!wasEmitting) {
        // A period with no burn is not part of the burn history, even when the ship barely moved.
        // Start a disconnected segment rather than drawing a false bridge through that interval.
        const nextSegment = this._segmentId + 1;
        if (this._push(x, y, z, drive, boost, dash, nextSegment)) this._segmentId = nextSegment;
      } else {
        const dx = x - this._path[0];
        const dy = y - this._path[1];
        const dz = z - this._path[2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (dist > DISCONTINUITY_WU) {
          // Keep old history in place and begin another segment at the new world position.
          const nextSegment = this._segmentId + 1;
          if (this._push(x, y, z, drive, boost, dash, nextSegment)) this._segmentId = nextSegment;
        } else if (dist >= MIN_STEP_WU) {
          this._push(x, y, z, drive, boost, dash, this._segmentId);
        }
        // Below MIN_STEP_WU: do nothing. In particular, never move or rejuvenate sample 0.
      }
    }

    this._publish(env);
  }

  setCamera(camera) {
    if (camera) this.material.uniforms.uCamPos.value.copy(camera.position);
  }

  /**
   * Unit direction from the newest recorded sample into its own history segment. False when there is
   * no same-segment neighbour. This is a read-only description of history, never a hull heading.
   */
  headAftDirection(out) {
    if (!out || this._live < 2) return false;
    const segment = this._state[3];
    let back = -1;
    const limit = Math.min(4, this._live);
    for (let i = 1; i < limit; i++) {
      if (Math.abs(this._state[i * 4 + 3] - segment) < 0.25) back = i * 4;
      else break;
    }
    if (back < 0) return false;
    const dx = this._path[back] - this._path[0];
    const dy = this._path[back + 1] - this._path[1];
    const dz = this._path[back + 2] - this._path[2];
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 1e-5) return false;
    out.x = dx / len;
    out.y = dy / len;
    out.z = dz / len;
    return true;
  }

  /** History has no pulse clock, so the only valid compatibility gain is steady. */
  bandFlash() {
    return 1;
  }

  /** Newest-first copy of immutable centerline facts, for tests and probes. */
  samplePositions() {
    const out = [];
    for (let i = 0; i < this._live; i++) {
      const s = i * 4;
      out.push({
        x: this._path[s],
        y: this._path[s + 1],
        z: this._path[s + 2],
        age: this._path[s + 3],
        drive: this._state[s],
        boost: this._state[s + 1],
        dash: this._state[s + 2],
        segment: this._state[s + 3],
      });
    }
    return out;
  }

  inspect() {
    let chord = 0;
    let pathLength = 0;
    if (this._live > 1) {
      const b = (this._live - 1) * 4;
      chord = Math.hypot(
        this._path[0] - this._path[b],
        this._path[1] - this._path[b + 1],
        this._path[2] - this._path[b + 2],
      );
      for (let i = 1; i < this._live; i++) {
        const a = (i - 1) * 4;
        const c = i * 4;
        if (Math.abs(this._state[a + 3] - this._state[c + 3]) >= 0.25) continue;
        pathLength += Math.hypot(
          this._path[a] - this._path[c],
          this._path[a + 1] - this._path[c + 1],
          this._path[a + 2] - this._path[c + 2],
        );
      }
    }
    return {
      construction: 'immutable-worldline-sheets',
      element: 'contrail',
      strands: this.strands,
      sheets: this.strands,
      samples: this.samples,
      liveSamples: this._live,
      trailSeconds: this.trailSeconds,
      spanWU: chord,
      visibleSpanWU: pathLength,
      retention: 'time-only',
      sampleCenters: 'immutable-world-space',
      temporalModulation: false,
      distanceTrim: false,
      liveHeadOverride: false,
      advectsAft: false,
      grazing: true,
      emitting: this._isEmitting,
      segmentId: this._segmentId,
      capacitySkips: this._capacitySkips,
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
export default ContrailTrail;
