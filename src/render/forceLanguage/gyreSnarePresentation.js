import * as THREE from 'three';
import { resolveVfxAccessibilityProfile } from '../vfxAccessibility.js';

/**
 * Gyre Snare presentation — the held-verb telekinetic katamari lash.
 *
 * Owns everything visible the sim publishes on `state.gyreSnare`:
 *   - the glassy rippling translucent cone, apex at the ship nose, wide mouth ("maw")
 *     at the gravity basin;
 *   - the maw ring + soft mouth glow where snagged mass is gripped;
 *   - a shader-driven spiral of motes converging into the mouth while the beam pulls;
 *   - the katamari: glassy lumps accreting on the snagged core as it absorbs neighbours;
 *   - the launch burst ring when the clump is bowled forward.
 *
 * Presentation-only: reads the published mirror + entity positions, never writes sim
 * state, never listens for game events it could derive from the mirror. Sleeps (quiet
 * latch) the moment the lash is off and no ball is still flying.
 */

function finite(v, d = 0) { return Number.isFinite(v) ? v : d; }
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

const MAX_LUMPS = 28;        // mirrors GYRE_SNARE.maxAbsorbRecords
const MAX_BURSTS = 4;
const SPIRAL_COUNT = 96;

// Lump tint per absorbed type — the katamari reads what it ate.
const LUMP_TINT = Object.freeze({
  asteroid: 0x9fb4c8, wreck: 0xc8a06a, pickup: 0x7fe0d8, payload: 0xe0c07f,
});

const CONE_VERT = /* glsl */`
uniform float uTime;
uniform float uPulse;
uniform float uCalm;      // 0 = reduced motion: silhouette stays, ripple displacement off
varying vec2 vUv;
varying vec3 vN;
varying vec3 vW;
void main() {
  vUv = uv;
  vec3 p = position;
  float ang = atan(p.z, p.x);
  float ripple = sin(uv.y * 26.0 - uTime * 9.0 + ang * 4.0)
               + 0.55 * sin(uv.y * 47.0 - uTime * 15.0 - ang * 2.0);
  float amp = (0.014 + 0.05 * uv.y) * (1.0 + uPulse * 1.6) * uCalm;
  vec2 radial = p.xz;
  float rl = max(length(radial), 1e-4);
  p.xz += (radial / rl) * ripple * amp;
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vW = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const CONE_FRAG = /* glsl */`
uniform vec3 uColGlass;
uniform vec3 uColHot;
uniform float uTime;
uniform float uAlpha;
uniform float uPulse;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vW;
void main() {
  vec3 V = normalize(cameraPosition - vW);
  float ndv = abs(dot(normalize(vN), V));
  float fres = pow(1.0 - ndv, 2.3);
  float band = 0.5 + 0.5 * sin(vUv.y * 34.0 - uTime * 13.0);
  float band2 = 0.5 + 0.5 * sin(vUv.y * 71.0 - uTime * 23.0);
  float rim = smoothstep(0.80, 1.0, vUv.y);
  float apex = smoothstep(0.20, 0.0, vUv.y);
  float a = uAlpha * (0.05 + fres * 0.38 + band * band2 * 0.11 + rim * (0.30 + uPulse * 0.45) + apex * 0.22);
  vec3 col = mix(uColGlass, uColHot, clamp(rim * 0.75 + apex * 0.55 + fres * 0.4 + uPulse * 0.4, 0.0, 1.0));
  gl_FragColor = vec4(col, a);
}
`;

const DISC_VERT = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv * 2.0 - 1.0;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const DISC_FRAG = /* glsl */`
uniform vec3 uCol;
uniform float uAlpha;
uniform float uTime;
varying vec2 vUv;
void main() {
  float r = length(vUv);
  float core = smoothstep(1.0, 0.0, r);
  float ring = smoothstep(0.06, 0.0, abs(r - (0.55 + 0.18 * sin(uTime * 5.0))));
  gl_FragColor = vec4(uCol, uAlpha * (core * core * 0.5 + ring * 0.35));
}
`;

// Spiral motes: everything positional is computed in the vertex shader off uTime, so the
// CPU never touches buffers after upload. Local X is the beam axis (0=nose, uLen=maw).
const SPIRAL_VERT = /* glsl */`
uniform float uTime;
uniform float uLen;
uniform float uRad;
uniform float uSize;
attribute float aSeed;
varying float vFade;
void main() {
  float t = fract(aSeed * 7.13 + uTime * (0.35 + aSeed * 0.5));
  // Motes CONVERGE into the mouth: they spawn wide and up-beam of the maw, then run
  // inward/tight as t→1 — the funnel reads as matter being pulled to the gravity well.
  float x = uLen * (0.78 + 0.22 * t);               // up-beam → maw plane as t advances
  float r = uRad * (1.45 - 1.15 * t);               // wide orbit → tight at the mouth
  float a = aSeed * 6.2832 + uTime * (1.6 + aSeed * 2.2);
  vec3 p = vec3(x, cos(a) * r, sin(a) * r);
  vFade = smoothstep(0.0, 0.15, t) * (1.0 - smoothstep(0.75, 1.0, t));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = uSize * (280.0 / max(1.0, -mv.z));
  gl_Position = projectionMatrix * mv;
}
`;

const SPIRAL_FRAG = /* glsl */`
uniform vec3 uCol;
varying float vFade;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d = dot(c, c);
  if (d > 1.0) discard;
  gl_FragColor = vec4(uCol, vFade * (1.0 - d) * 0.8);
}
`;

const BURST_VERT = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv * 2.0 - 1.0;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const BURST_FRAG = /* glsl */`
uniform vec3 uCol;
uniform float uT;         // 0..1 burst age
varying vec2 vUv;
void main() {
  float r = length(vUv);
  float edge = smoothstep(0.10, 0.0, abs(r - uT));
  float inner = smoothstep(1.0, 0.0, r) * 0.25 * (1.0 - uT);
  float a = (edge * 0.85 + inner) * (1.0 - uT) * (1.0 - uT);
  gl_FragColor = vec4(uCol, a);
}
`;

function jitterGeometry(geo, amt, seed) {
  const pos = geo.attributes.position;
  let s = seed | 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) | 0; return ((s >>> 9) & 0xffff) / 0xffff - 0.5; };
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(i,
      pos.getX(i) + rnd() * amt,
      pos.getY(i) + rnd() * amt,
      pos.getZ(i) + rnd() * amt);
  }
  geo.computeVertexNormals();
  return geo;
}

export class GyreSnarePresentation {
  constructor(scene, { toLocal = null } = {}) {
    this.scene = scene;
    this.toLocal = toLocal;
    this.disposed = false;
    this.time = 0;
    this._phase = 'off';
    this._quiet = true;
    this._absorbSeen = 0;
    this._ballId = null;
    this._clumpRadius = 0;
    this._discKick = 0;

    const glass = 0xdff1ff, hot = 0xf6fcff;

    // ── beam group: origin at the nose, +X along the beam ───────────────────
    this._beam = new THREE.Group();
    this._beam.visible = false;
    this._beam.name = 'SF_GyreSnare_beam';

    this._coneMat = new THREE.ShaderMaterial({
      vertexShader: CONE_VERT, fragmentShader: CONE_FRAG,
      uniforms: {
        uTime: { value: 0 }, uPulse: { value: 0 }, uCalm: { value: 1 },
        uColGlass: { value: new THREE.Color(glass) },
        uColHot: { value: new THREE.Color(hot) },
        uAlpha: { value: 0.55 },
      },
      transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide,
    });
    // Unit cylinder: apex (small) at -Y, mouth (unit radius) at +Y — then rotated so +Y→+X,
    // scaled x/z to mouth radius, y to beam length, offset so the apex sits at the group origin.
    const coneGeo = new THREE.CylinderGeometry(1, 0.045, 1, 36, 14, true);
    coneGeo.translate(0, 0.5, 0);           // apex at local origin, mouth at y=1
    this._cone = new THREE.Mesh(coneGeo, this._coneMat);
    this._cone.rotation.z = -Math.PI / 2;   // cylinder +Y → beam +X
    this._cone.frustumCulled = false;       // scaled per frame; bounding sphere lies
    this._beam.add(this._cone);

    // Maw ring — torus encircling the beam mouth, normal along +X.
    this._mawMat = new THREE.MeshBasicMaterial({
      color: hot, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this._maw = new THREE.Mesh(new THREE.TorusGeometry(1, 0.045, 8, 48), this._mawMat);
    this._maw.rotation.y = Math.PI / 2;
    this._beam.add(this._maw);

    // Mouth glow — soft disc behind the ring.
    this._discMat = new THREE.ShaderMaterial({
      vertexShader: DISC_VERT, fragmentShader: DISC_FRAG,
      uniforms: { uCol: { value: new THREE.Color(0xe8f4ff) }, uAlpha: { value: 0.8 }, uTime: { value: 0 } },
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    this._disc = new THREE.Mesh(new THREE.CircleGeometry(1, 32), this._discMat);
    this._disc.rotation.y = Math.PI / 2;
    this._beam.add(this._disc);

    // Spiral motes.
    const seeds = new Float32Array(SPIRAL_COUNT);
    for (let i = 0; i < SPIRAL_COUNT; i++) seeds[i] = (i * 0.61803398875) % 1;
    const spiralGeo = new THREE.BufferGeometry();
    spiralGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPIRAL_COUNT * 3), 3));
    spiralGeo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    this._spiralMat = new THREE.ShaderMaterial({
      vertexShader: SPIRAL_VERT, fragmentShader: SPIRAL_FRAG,
      uniforms: {
        uTime: { value: 0 }, uLen: { value: 1 }, uRad: { value: 1 },
        uSize: { value: 3.4 }, uCol: { value: new THREE.Color(glass) },
      },
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this._spiral = new THREE.Points(spiralGeo, this._spiralMat);
    this._spiral.frustumCulled = false;
    this._beam.add(this._spiral);
    scene.add(this._beam);

    // ── katamari clump ───────────────────────────────────────────────────────
    this._clump = new THREE.Group();
    this._clump.visible = false;
    this._clump.name = 'SF_GyreSnare_clump';
    this._lumps = [];   // {mesh, used}
    this._lumpMats = {};
    this._clumpSpin = 0;
    scene.add(this._clump);

    // ── launch bursts ────────────────────────────────────────────────────────
    this._bursts = [];
    for (let i = 0; i < MAX_BURSTS; i++) {
      const mat = new THREE.ShaderMaterial({
        vertexShader: BURST_VERT, fragmentShader: BURST_FRAG,
        uniforms: { uCol: { value: new THREE.Color(hot) }, uT: { value: 1 } },
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
      m.rotation.x = -Math.PI / 2;   // flat on the play plane
      m.visible = false;
      this.scene.add(m);
      this._bursts.push({ mesh: m, t: 1, r: 1 });
    }

    this._nose = { x: 0, z: 0 };
    this._mawPt = { x: 0, z: 0 };
  }

  _lumpMaterial(type) {
    let mat = this._lumpMats[type];
    if (!mat) {
      mat = new THREE.MeshStandardMaterial({
        color: LUMP_TINT[type] || 0xbccbd8,
        roughness: 0.35, metalness: 0.25,
        transparent: true, opacity: 0.85,
        emissive: 0x9fc4e0, emissiveIntensity: 0.22,
      });
      this._lumpMats[type] = mat;
    }
    return mat;
  }

  _addLump(member, i) {
    let slot = null;
    for (const l of this._lumps) if (!l.used) { slot = l; break; }
    if (!slot) {
      if (this._lumps.length >= MAX_LUMPS) return;
      const geo = jitterGeometry(new THREE.IcosahedronGeometry(1, 1), 0.28, 31 + i * 7919);
      slot = { mesh: new THREE.Mesh(geo), used: false, baseScale: 1, spawnT: 0 };
      this._clump.add(slot.mesh);
      this._lumps.push(slot);
    }
    slot.used = true;
    slot.spawnT = this.time;         // grow-in: lumps swell in over ~150 ms, not pop
    const m = slot.mesh;
    m.material = this._lumpMaterial(member.type);
    const r = Math.max(0.35, finite(member.radius, 2) * 0.62);
    slot.baseScale = r;
    m.scale.setScalar(r * 0.2);
    const spread = Math.max(0, finite(this._clumpRadius) - r * 0.45);
    m.position.set(
      finite(member.nx, 0) * spread,
      ((i * 0.61803398875) % 1 - 0.5) * r * 1.1,
      finite(member.nz, 0) * spread,
    );
    m.rotation.set(i * 1.7, i * 2.3, i * 0.9);
    m.visible = true;
  }

  _clearLumps() {
    for (const l of this._lumps) { l.used = false; l.mesh.visible = false; }
  }

  _fireBurst(x, z, r) {
    let slot = this._bursts[0];
    for (const b of this._bursts) if (b.t >= 1) { slot = b; break; }
    slot.t = 0;
    slot.r = r;
    const p = this.toLocal ? this.toLocal(x, z, this._nose) : (this._nose.x = x, this._nose.z = z, this._nose);
    slot.mesh.position.set(p.x, 0.4, p.z);
    slot.mesh.visible = true;
  }

  update(dt, state = {}) {
    if (this.disposed) return;
    const mirror = state.gyreSnare;
    const phase = mirror && mirror.phase ? mirror.phase : 'off';
    const live = phase !== 'off' || (mirror && mirror.launchedId != null);
    if (!live && this._quiet) return;
    if (!live) { this._quiet = true; }
    else this._quiet = false;

    const clock = Number.isFinite(state.simTime) ? state.simTime : this.time + dt;
    if (clock < this.time) this._clearLumps();   // restored sim rewound the clock
    this.time = clock;

    // The canonical VFX accessibility read: motionReduce lives under settings.video,
    // flashReduce under video or accessibility — never hand-roll the fallback order.
    const profile = resolveVfxAccessibilityProfile(state.settings);
    const reducedMotion = profile.id === 'reduced-motion' || profile.id === 'reduced-motion-and-flash';
    const reducedFlash = profile.id === 'reduced-flash' || profile.id === 'reduced-motion-and-flash';
    const calm = reducedMotion ? 0 : 1;
    const flashCalm = reducedFlash ? 0.55 : 1;

    // ── beam ─────────────────────────────────────────────────────────────────
    if (phase === 'beaming' || phase === 'holding' || phase === 'launching') {
      const nx = finite(mirror.nose && mirror.nose.x);
      const nz = finite(mirror.nose && mirror.nose.z);
      const mx = finite(mirror.maw && mirror.maw.x);
      const mz = finite(mirror.maw && mirror.maw.z);
      const nL = this.toLocal(nx, nz, this._nose);
      const mL = this.toLocal(mx, mz, this._mawPt);
      const dx = mL.x - nL.x, dz = mL.z - nL.z;
      const len = Math.max(1, Math.hypot(dx, dz));
      const endR = Math.max(0.5, finite(mirror.endRadius, len * 0.25));

      this._beam.visible = true;
      this._beam.position.set(nL.x, 0.6, nL.z);
      this._beam.rotation.y = -Math.atan2(dz, dx);
      this._cone.scale.set(endR, len, endR);
      this._maw.position.set(len, 0, 0);
      this._maw.scale.setScalar(endR); // uniform — the torus circle spans local X and Y
      this._disc.position.set(len + 1.5, 0, 0);
      this._disc.scale.setScalar(endR * 0.96);

      const holding = phase === 'holding';
      const strain = clamp01(finite(mirror.strain01));
      this._coneMat.uniforms.uTime.value = this.time;
      this._coneMat.uniforms.uCalm.value = calm;
      this._coneMat.uniforms.uAlpha.value = (holding ? 0.62 : 0.42) * flashCalm;
      // Per-second decay like _discKick — a per-frame *0.9 halves the flash on 144 Hz
      // panels vs 60 Hz ones, so the snag/launch flash length must ride dt, not frames.
      this._coneMat.uniforms.uPulse.value = Math.max(
        this._coneMat.uniforms.uPulse.value * Math.exp(-dt * 6.3),
        strain * 0.7,
      );
      // Absorb pulse: each katamari hit kicks the maw disc + ring — the mouth flashes
      // as it feeds, so swallow reads visually even before the lump grows in.
      const absorbsNow = finite(mirror.absorbs, 0);
      if (absorbsNow > this._absorbSeen) this._discKick = 1;
      if (absorbsNow < this._absorbSeen) this._absorbSeen = 0; // new clump ledger
      this._absorbSeen = absorbsNow;
      this._discKick *= Math.exp(-dt * 4.2);
      this._mawMat.opacity = Math.min(1, (0.4 + (holding ? 0.25 : 0) + strain * 0.3 + this._discKick * 0.35) * flashCalm);
      this._discMat.uniforms.uTime.value = this.time;
      this._discMat.uniforms.uAlpha.value = Math.min(1.2, (holding ? 0.9 : 0.55) + this._discKick * 0.5) * flashCalm;
      this._spiral.visible = calm !== 0;
      this._spiralMat.uniforms.uTime.value = this.time;
      this._spiralMat.uniforms.uLen.value = len;
      this._spiralMat.uniforms.uRad.value = endR;
    } else {
      this._beam.visible = false;
    }

    // ── clump ────────────────────────────────────────────────────────────────
    // Hold: lumps ride the core's orbit slot. Launch: they keep riding the free ball
    // until the mirror stops tracking it.
    let cx = null, cz = null, spinRate = 0.9;
    if (phase === 'holding' && mirror.corePos) { cx = mirror.corePos.x; cz = mirror.corePos.z; }
    else if (mirror.launchedId != null && mirror.ballPos) { cx = mirror.ballPos.x; cz = mirror.ballPos.z; spinRate = 2.6; }

    if (cx == null) {
      this._clump.visible = false;
      if (phase === 'off' && this._ballId == null) this._clearLumps();
    } else {
      const p = this.toLocal(cx, cz, this._nose);
      this._clump.visible = true;
      this._clump.position.set(p.x, 0.6, p.z);
      this._clumpSpin += dt * spinRate;
      this._clump.rotation.y = -this._clumpSpin;
      this._clumpRadius = finite(mirror.clumpRadius, this._clumpRadius);
      this._ballId = mirror.launchedId;

      const members = mirror.members;
      const want = Array.isArray(members) ? Math.min(members.length, MAX_LUMPS) : 0;
      let have = 0;
      for (const l of this._lumps) if (l.used) have++;
      for (let i = have; i < want; i++) this._addLump(members[i], i);
      // If the sim restarted the ledger (new core), rebuild.
      if (want < have) { this._clearLumps(); for (let i = 0; i < want; i++) this._addLump(members[i], i); }
      // Grow-in: a fresh lump swells 0.2→1× over ~150 ms — katamari stick lands visibly.
      for (const l of this._lumps) {
        if (!l.used) continue;
        const g = Math.min(1, Math.max(0, (this.time - l.spawnT) / 0.15));
        l.mesh.scale.setScalar(l.baseScale * (0.2 + 0.8 * g));
      }
    }
    if (mirror.launchedId == null) this._ballId = null;

    // ── phase transitions ────────────────────────────────────────────────────
    if (phase !== this._phase) {
      // The grip is the payoff: entering HOLD flashes the cone hard, matching the snag
      // audio bite + haptic that already fire on the same edge.
      if (phase === 'holding') this._coneMat.uniforms.uPulse.value = 0.9;
      if (phase === 'launching' && cx != null) {
        this._fireBurst(mirror.corePos.x, mirror.corePos.z, Math.max(6, finite(mirror.clumpRadius, 8) * 2.2));
        this._coneMat.uniforms.uPulse.value = 1;
      }
      // A live bowling ball keeps its frozen member ledger — the lumps ride the throw.
      // Only drop them when the mirror itself stopped tracking a ball.
      if (phase === 'off' && mirror.launchedId == null) this._clearLumps();
      this._phase = phase;
    }

    // ── bursts ───────────────────────────────────────────────────────────────
    for (const b of this._bursts) {
      if (b.t >= 1) { if (b.mesh.visible) b.mesh.visible = false; continue; }
      b.t = Math.min(1, b.t + dt * 1.7);
      const s = b.r * (0.25 + b.t * 1.6);
      b.mesh.scale.setScalar(s);
      b.mesh.material.uniforms.uT.value = b.t;
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.scene.remove(this._beam, this._clump);
    for (const b of this._bursts) this.scene.remove(b.mesh);
    this._cone.geometry.dispose();
    this._maw.geometry.dispose();
    this._disc.geometry.dispose();
    this._spiral.geometry.dispose();
    this._coneMat.dispose(); this._mawMat.dispose(); this._discMat.dispose(); this._spiralMat.dispose();
    for (const l of this._lumps) l.mesh.geometry.dispose();
    for (const k in this._lumpMats) this._lumpMats[k].dispose();
    for (const b of this._bursts) { b.mesh.geometry.dispose(); b.mesh.material.dispose(); }
  }
}
