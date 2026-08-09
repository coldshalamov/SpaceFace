// VFX NEXT — GPU-aged instanced substrate.
//
// One class backs sparks, smoke, debris and shock fronts. The trick that makes twelve families
// affordable is that the CPU writes an instance ONCE at spawn and never touches it again: origin,
// velocity, acceleration, drag, birth, life, size ramp, colour ramp, spin and axis all go up in a
// single write, and the vertex shader integrates the ballistic path itself from `uTime`.
//
//   p(t) = origin + vel * tau(t) + 0.5 * accel * t^2,   tau(t) = (1 - e^(-k t)) / k
//
// `tau` is exponential drag solved analytically, so a spark can decelerate believably without a
// per-frame CPU integration loop. k = 0 degrades to straight ballistic motion.
//
// Consequences worth knowing before you extend this:
//   * A live instance CANNOT be steered. Anything that needs to change course mid-life belongs on
//     the ribbon substrate (CPU) or must be re-spawned. This is a deliberate trade: it buys an
//     allocation-free, near-zero-CPU hot path for the 95% of VFX that is genuinely ballistic.
//   * Slot reuse is by expiry time, not by a free list, because the GPU owns the lifetime. The ring
//     cursor plus a priority tiebreak gives graceful saturation: under pressure the cheapest, oldest
//     residents die first and the hero event keeps its instances.
//   * Uploads are dirty-flagged per frame. A frame with no spawns uploads nothing.
//
// Live analogue for a future integrator: src/render/vfx.js `_initPools` / `_spawnParticle` /
// `_spawnSprite` do the same job against PARTICLE_CAP (1500/3000/4000) and SPRITE_CAP (256). This
// file does not import it — the library must stay swappable one effect at a time.

import * as THREE from 'three';

export const KIND_FLASH = 0;
export const KIND_SPARK = 1;
export const KIND_EMBER = 2;
export const KIND_RING = 3;
export const KIND_PUFF = 4;
// FIRE is not a dim FLASH. FLASH forces a white-hot centre, which is correct for a detonation and
// wrong for combustion — burning fuel has no white core, and reusing FLASH for it produced a field
// of small white dots where a fireball belonged.
export const KIND_FIRE = 5;

const VERT_HEAD = /* glsl */`
  uniform float uTime;
  uniform float uSizeScale;

  attribute vec3 aOrigin;
  attribute vec3 aVel;
  attribute vec3 aAccel;
  attribute vec2 aTime;    // x = birth, y = life
  attribute vec2 aSize;    // x = size at birth, y = size at death
  attribute vec3 aColorA;  // core / start
  attribute vec3 aColorB;  // sheath / end
  attribute vec4 aParams;  // x = kind, y = seed, z = spin, w = drag k
  attribute vec3 aAxis;

  varying vec2  vUv;
  varying vec3  vColor;
  varying float vAge;      // 0..1
  varying float vKind;
  varying float vSeed;
  varying float vAlpha;

  // Analytic exponential drag. Guarded so k -> 0 is exactly ballistic, not a division blow-up.
  float tauOf(float t, float k) {
    if (k < 1e-4) return t;
    return (1.0 - exp(-k * t)) / k;
  }
`;

const VERT_BODY_BILLBOARD = /* glsl */`
  void main() {
    float life = max(aTime.y, 1e-4);
    float t = uTime - aTime.x;
    float age = t / life;
    vAge = age;
    vKind = aParams.x;
    vSeed = aParams.y;
    vUv = uv;

    // Dead instances collapse to a degenerate triangle at the origin: no discard cost, no overdraw.
    if (age < 0.0 || age > 1.0) {
      gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
      vAlpha = 0.0;
      return;
    }

    vec3 wp = aOrigin + aVel * tauOf(t, aParams.w) + 0.5 * aAccel * t * t;

    // Size ramp. Squared ease-out on growth reads as a punch rather than a balloon.
    float size = mix(aSize.x, aSize.y, age * age * (3.0 - 2.0 * age)) * uSizeScale;

    vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 camUp    = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);

    vec2 quad = position.xy;

    if (aParams.x == 1.0) {
      // SPARK: velocity-aligned. Stretch along screen-projected motion so a fast fragment reads as
      // a streak with a direction, not a round dot. This is the single change that most separates
      // "directional kick" from "particle burst".
      //
      // The whole construction stays in 2D inside the camera basis. An earlier version built the
      // side vector with normalize(cross(sr, normalize(cameraPosition - wp))), which is degenerate
      // whenever a particle passes near the camera-position term and produced NaN positions — the
      // quads then vanished entirely, so every spark in the library rendered as nothing while its
      // pool counters, positions and lifetimes all looked perfectly healthy. camRight and camUp are
      // orthonormal, so rotating within their plane needs no cross product and no normalize at all.
      vec3 vel = aVel * exp(-aParams.w * t) + aAccel * t;
      float vr = dot(vel, camRight);
      float vu = dot(vel, camUp);
      float m = length(vec2(vr, vu));
      // Fallback for motion straight along the view axis: a spark coming at the camera has no
      // screen-space direction, so draw it round rather than undefined.
      vec2 dir2 = m > 1e-4 ? vec2(vr, vu) / m : vec2(1.0, 0.0);
      vec2 side2 = vec2(-dir2.y, dir2.x);
      vec3 sr = camRight * dir2.x + camUp * dir2.y;
      vec3 su = camRight * side2.x + camUp * side2.y;
      float speed = length(vel);
      // Foreshorten the stretch by how much of the motion is actually across the screen: a spark
      // flying at the camera should not be drawn as a long streak.
      float across = m / max(speed, 1e-4);
      float stretch = 1.0 + clamp(speed * 0.020, 0.0, 7.0) * across;
      wp += (sr * quad.x * size * stretch) + (su * quad.y * size * 0.85);
    } else {
      float spin = aParams.z * t;
      float cs = cos(spin), sn = sin(spin);
      vec2 r = vec2(quad.x * cs - quad.y * sn, quad.x * sn + quad.y * cs);
      wp += (camRight * r.x + camUp * r.y) * size;
    }

    vColor = mix(aColorA, aColorB, clamp(age * 1.35, 0.0, 1.0));
    vAlpha = 1.0;
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  }
`;

const FRAG_ADDITIVE = /* glsl */`
  varying vec2  vUv;
  varying vec3  vColor;
  varying float vAge;
  varying float vKind;
  varying float vSeed;
  varying float vAlpha;

  uniform float uIntensity;

  float hash11(float p) { return fract(sin(p * 78.233) * 43758.5453); }

  void main() {
    if (vAlpha <= 0.0) discard;
    vec2 p = vUv * 2.0 - 1.0;
    float d = length(p);
    float a = 0.0;
    vec3 c = vColor;

    if (vKind == 0.0) {
      // FLASH — punch-out core. A tight white centre inside a saturated sheath, decaying fast.
      // The 6th-power inner term is what keeps the centre reading as white-hot at gameplay scale
      // instead of turning into a uniform coloured blob once bloom is applied.
      float core = pow(max(0.0, 1.0 - d), 6.0);
      float halo = pow(max(0.0, 1.0 - d), 2.2);
      a = (halo * 0.55 + core * 1.6) * pow(1.0 - vAge, 2.4);
      c = mix(c, vec3(1.0, 0.97, 0.92), core * 0.9);
    } else if (vKind == 1.0) {
      // SPARK — hot head, fading tail. uv.x runs along the stretch axis.
      float along = vUv.x;
      float across = abs(p.y);
      // NOTE: smoothstep(hi, lo, x) is UNDEFINED in GLSL when edge0 >= edge1 — it is not a
      // supported way to invert a ramp. ANGLE/D3D returns ~0 here, which made every spark in the
      // library render at the right size, in the right place, with the right motion, and fully
      // invisible. Always write the inversion explicitly.
      float body = 1.0 - smoothstep(0.15, 1.0, across);
      float head = pow(along, 3.0);
      a = body * (0.30 + head * 1.5) * pow(1.0 - vAge, 1.5);
      c = mix(c, vec3(1.0, 0.95, 0.85), head * 0.7);
    } else if (vKind == 2.0) {
      // EMBER — small persistent cinder. Deterministic flicker keyed off the instance seed so the
      // aftermath field twinkles without ever looking like a uniform dot grid.
      float flick = 0.62 + 0.38 * sin(vAge * 34.0 + hash11(vSeed) * 30.0);
      a = pow(max(0.0, 1.0 - d), 3.5) * flick * (1.0 - vAge * vAge);
    } else if (vKind == 5.0) {
      // FIRE — combustion body. No white core; the heat is in the colour ramp, and the edge is
      // broken by a cheap two-lobe noise so a cluster of these reads as one ragged fireball rather
      // than as a bag of circles.
      float ang = atan(p.y, p.x);
      float wobble = 0.72
        + 0.18 * sin(ang * 3.0 + vSeed * 27.0)
        + 0.10 * sin(ang * 7.0 - vSeed * 13.0 + vAge * 4.0);
      float body = 1.0 - smoothstep(wobble * 0.20, wobble, d);
      // Fast bloom in, slow ragged decay: fire catches instantly and gutters out.
      float burn = smoothstep(0.0, 0.08, vAge) * pow(1.0 - vAge, 1.9);
      a = body * burn * 0.85;
      c = mix(c, vec3(1.0, 0.78, 0.32), pow(max(0.0, 1.0 - d * 1.6), 3.0) * 0.55);
    } else {
      // RING — SDF annulus. Radius eases outward, wall thins as it expands: a pressure front, not
      // a growing circle. Sharpness is what makes it survive bloom.
      float r = 0.42 + 0.55 * (1.0 - pow(1.0 - vAge, 2.0));
      float w = mix(0.30, 0.045, vAge);
      a = (1.0 - smoothstep(0.0, w, abs(d - r))) * pow(1.0 - vAge, 1.6);
      c = mix(vec3(1.0, 0.96, 0.90), c, smoothstep(0.0, 0.35, vAge));
    }

    a *= uIntensity;
    if (a <= 0.002) discard;
    gl_FragColor = vec4(c * a, a);
  }
`;

const FRAG_SMOKE = /* glsl */`
  varying vec2  vUv;
  varying vec3  vColor;
  varying float vAge;
  varying float vSeed;
  varying float vAlpha;

  uniform float uIntensity;

  // Cheap value noise. Three octaves is enough to break the circle silhouette, which is the only
  // job here — smoke that stays a perfect disc reads as a sprite, and reads as a sprite instantly.
  float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1, 0)), f.x),
               mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), f.x), f.y);
  }

  void main() {
    if (vAlpha <= 0.0) discard;
    vec2 p = vUv * 2.0 - 1.0;
    float d = length(p);
    float n = vnoise(vUv * 3.4 + vSeed * 17.0) * 0.55
            + vnoise(vUv * 7.1 - vSeed * 9.0) * 0.30
            + vnoise(vUv * 15.0 + vSeed * 3.0) * 0.15;
    // Two-term edge: a soft radial falloff MULTIPLIED by the noise-broken cutoff. The falloff is
    // what stops a puff reading as a flat disc — with the cutoff alone, smoke at gameplay scale is
    // a hard-edged cardboard circle that occludes the event it is supposed to sit behind.
    float falloff = pow(max(0.0, 1.0 - d), 1.8);
    float edge = 1.0 - smoothstep(0.25, 1.0, d * 1.12 + (n - 0.5) * 0.9);
    // Smoke arrives fast and leaves slowly — the reverse feels like the effect is being cancelled.
    float fade = smoothstep(0.0, 0.10, vAge) * (1.0 - smoothstep(0.35, 1.0, vAge));
    float a = falloff * edge * fade * uIntensity * 0.13;
    if (a <= 0.004) discard;
    // Smoke is the DARK PLATE the hot layers read against, not a light source. Overlapping puffs
    // accumulate, so a per-puff alpha that looks reasonable alone becomes a pale translucent dome
    // at twenty of them — which is the "translucent geometry plus bloom" look this library exists
    // to replace. Keep each puff faint and let the stack do the work.
    gl_FragColor = vec4(vColor * (0.30 + 0.45 * (1.0 - vAge)), a);
  }
`;

/** Shared per-instance storage + ring allocation. Subclass-free: geometry and material are injected. */
export class GpuAgedSubstrate {
  constructor({ name, capacity, geometry, material, sizeScale = 1 }) {
    this.name = name;
    this.capacity = capacity;
    this._cursor = 0;
    this._expiry = new Float32Array(capacity);   // world time at which the slot frees
    this._priority = new Float32Array(capacity); // higher survives eviction
    this._dirty = false;
    this._live = 0;

    const geo = new THREE.InstancedBufferGeometry();
    geo.index = geometry.index;
    geo.attributes.position = geometry.attributes.position;
    geo.attributes.uv = geometry.attributes.uv;
    if (geometry.attributes.normal) geo.attributes.normal = geometry.attributes.normal;
    geo.instanceCount = 0;

    const mk = (items) => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(capacity * items), items);
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    this.aOrigin = mk(3); this.aVel = mk(3); this.aAccel = mk(3);
    this.aTime = mk(2); this.aSize = mk(2);
    this.aColorA = mk(3); this.aColorB = mk(3);
    this.aParams = mk(4); this.aAxis = mk(3);

    geo.setAttribute('aOrigin', this.aOrigin);
    geo.setAttribute('aVel', this.aVel);
    geo.setAttribute('aAccel', this.aAccel);
    geo.setAttribute('aTime', this.aTime);
    geo.setAttribute('aSize', this.aSize);
    geo.setAttribute('aColorA', this.aColorA);
    geo.setAttribute('aColorB', this.aColorB);
    geo.setAttribute('aParams', this.aParams);
    geo.setAttribute('aAxis', this.aAxis);
    // Instances are placed by the shader; the CPU never knows the bounds, so cull manually.
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    this.geometry = geo;
    this.material = material;
    this.material.uniforms.uSizeScale.value = sizeScale;
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    this.mesh.name = `vfxnext:${name}`;

    this._scratchColorA = new THREE.Color();
    this._scratchColorB = new THREE.Color();
  }

  /** Claim a slot. Prefers an expired one; otherwise evicts the lowest-priority resident so a hero
   *  event is never starved by ambient chaff. Returns -1 only if every resident outranks `priority`,
   *  which is the correct outcome — a dropped low-value spawn beats a stolen high-value one. */
  _claim(now, priority) {
    const cap = this.capacity;
    let worst = -1, worstPriority = priority;
    for (let n = 0; n < cap; n++) {
      const i = this._cursor;
      this._cursor = (this._cursor + 1) % cap;
      if (this._expiry[i] <= now) { return i; }
      if (this._priority[i] < worstPriority) { worstPriority = this._priority[i]; worst = i; }
    }
    return worst;
  }

  /** Allocation-free spawn. Every argument is a scalar for exactly that reason — a vector object
   *  per particle is how a "pooled" system quietly starts allocating again. */
  spawn(now, {
    x, y, z, vx = 0, vy = 0, vz = 0, ax = 0, ay = 0, az = 0,
    life = 1, size0 = 1, size1 = 1, colorA = 0xffffff, colorB = 0xffffff,
    kind = KIND_FLASH, seed = 0, spin = 0, drag = 0, priority = 0,
    axisX = 0, axisY = 1, axisZ = 0,
  }) {
    const i = this._claim(now, priority);
    if (i < 0) return -1;

    const i3 = i * 3, i2 = i * 2, i4 = i * 4;
    const o = this.aOrigin.array, v = this.aVel.array, ac = this.aAccel.array;
    o[i3] = x; o[i3 + 1] = y; o[i3 + 2] = z;
    v[i3] = vx; v[i3 + 1] = vy; v[i3 + 2] = vz;
    ac[i3] = ax; ac[i3 + 1] = ay; ac[i3 + 2] = az;

    const t = this.aTime.array; t[i2] = now; t[i2 + 1] = life;
    const s = this.aSize.array; s[i2] = size0; s[i2 + 1] = size1;

    const ca = this._scratchColorA.set(colorA);
    const cb = this._scratchColorB.set(colorB);
    const A = this.aColorA.array, B = this.aColorB.array;
    A[i3] = ca.r; A[i3 + 1] = ca.g; A[i3 + 2] = ca.b;
    B[i3] = cb.r; B[i3 + 1] = cb.g; B[i3 + 2] = cb.b;

    const p = this.aParams.array;
    p[i4] = kind; p[i4 + 1] = seed; p[i4 + 2] = spin; p[i4 + 3] = drag;

    const ax3 = this.aAxis.array;
    ax3[i3] = axisX; ax3[i3 + 1] = axisY; ax3[i3 + 2] = axisZ;

    this._expiry[i] = now + life;
    this._priority[i] = priority;
    this._dirty = true;
    if (i + 1 > this.geometry.instanceCount) this.geometry.instanceCount = i + 1;
    return i;
  }

  /** Per-frame: upload only if something spawned, and refresh the live count for the cost readout. */
  update(now) {
    this.material.uniforms.uTime.value = now;
    if (this._dirty) {
      this.aOrigin.needsUpdate = true; this.aVel.needsUpdate = true; this.aAccel.needsUpdate = true;
      this.aTime.needsUpdate = true; this.aSize.needsUpdate = true;
      this.aColorA.needsUpdate = true; this.aColorB.needsUpdate = true;
      this.aParams.needsUpdate = true; this.aAxis.needsUpdate = true;
      this._dirty = false;
    }
    let live = 0;
    const cap = this.geometry.instanceCount;
    for (let i = 0; i < cap; i++) if (this._expiry[i] > now) live++;
    this._live = live;
  }

  get live() { return this._live; }

  clear() {
    this._expiry.fill(0);
    this._priority.fill(0);
    this.geometry.instanceCount = 0;
    this._live = 0;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}

function billboardGeometry() {
  // A unit quad in the XY plane; the vertex shader supplies orientation and scale.
  const g = new THREE.PlaneGeometry(1, 1, 1, 1);
  return g;
}

export function createSparkSubstrate(capacity = 2048) {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uSizeScale: { value: 1 }, uIntensity: { value: 1 },
    },
    vertexShader: VERT_HEAD + VERT_BODY_BILLBOARD,
    fragmentShader: FRAG_ADDITIVE,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
  });
  return new GpuAgedSubstrate({ name: 'sparks', capacity, geometry: billboardGeometry(), material });
}

export function createSmokeSubstrate(capacity = 256) {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uSizeScale: { value: 1 }, uIntensity: { value: 1 },
    },
    vertexShader: VERT_HEAD + VERT_BODY_BILLBOARD,
    fragmentShader: FRAG_SMOKE,
    transparent: true,
    blending: THREE.NormalBlending,
    depthWrite: false,
    depthTest: true,
  });
  const sub = new GpuAgedSubstrate({ name: 'smoke', capacity, geometry: billboardGeometry(), material });
  // Behind the additive buckets: smoke is the dark plate the hot layers read against.
  sub.mesh.renderOrder = 9;
  return sub;
}
