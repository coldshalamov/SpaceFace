import * as THREE from 'three';
import { resolveVfxAccessibilityProfile } from '../vfxAccessibility.js';
import { GYRE_SNARE } from '../../data/gyreSnare.js';

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

const MAX_LUMPS = GYRE_SNARE.maxAbsorbRecords; // the member ledger's bound, one source
const MAX_BURSTS = 8; // ballIds watches up to 8 — a grave pile of retired balls keeps every ring
const SPIRAL_COUNT = 96;

// Lump tint per absorbed type — the katamari reads what it ate.
// pickup/payload rows are RESERVED: non-absorbable since wave 22 (the lash tows
// loot, never eats it) — kept so a stale ledger entry can't NaN a tint lookup.
const LUMP_TINT = Object.freeze({
  asteroid: 0x9fb4c8, wreck: 0xc8a06a, pickup: 0x7fe0d8, payload: 0xe0c07f,
});

const CONE_VERT = /* glsl */`
uniform float uTime;
uniform float uPulse;
uniform float uCalm;      // 0 = reduced motion: silhouette stays, ripple displacement off
uniform float uStrain;    // 0..1 — clump strain: adds a high-frequency shiver to the glass
varying vec2 vUv;
varying vec3 vN;
varying vec3 vW;
void main() {
  vUv = uv;
  vec3 p = position;
  float ang = atan(p.z, p.x);
  float ripple = sin(uv.y * 26.0 - uTime * 9.0 + ang * 4.0)
               + 0.55 * sin(uv.y * 47.0 - uTime * 15.0 - ang * 2.0)
               // strain tremble: a high-frequency shiver layered on the metronome
               // waves — under load the GLASS itself reads stressed, not just brighter.
               + uStrain * 0.6 * sin(uv.y * 110.0 - uTime * 60.0 + ang * 6.0);
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
uniform float uCalm;      // reduced motion freezes the traveling shimmer too
varying vec2 vUv;
varying vec3 vN;
varying vec3 vW;
void main() {
  vec3 V = normalize(cameraPosition - vW);
  float ndv = abs(dot(normalize(vN), V));
  float fres = pow(1.0 - ndv, 2.3);
  // Glass needs a hard specular cue, not just shimmer: a sharper grazing lobe plus
  // a thin glint streak traveling around the skin (vUv.x is the cone's angle).
  float lobe = pow(1.0 - ndv, 6.0);
  float glint = pow(abs(sin(vUv.x * 6.2832 - uTime * 2.4 * uCalm)), 24.0);
  float band = 0.5 + 0.5 * sin(vUv.y * 34.0 - uTime * 13.0 * uCalm);
  float band2 = 0.5 + 0.5 * sin(vUv.y * 71.0 - uTime * 23.0 * uCalm);
  float rim = smoothstep(0.80, 1.0, vUv.y);
  float apex = smoothstep(0.20, 0.0, vUv.y);
  float a = uAlpha * (0.05 + fres * 0.38 + lobe * 0.20 + glint * 0.10 + band * band2 * 0.11 + rim * (0.30 + uPulse * 0.45) + apex * 0.22);
  vec3 col = mix(uColGlass, uColHot, clamp(rim * 0.75 + apex * 0.55 + fres * 0.4 + lobe * 0.3 + glint * 0.25 + uPulse * 0.4, 0.0, 1.0));
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
uniform float uCalm;      // reduced motion holds the ring at its rest radius
varying vec2 vUv;
void main() {
  float r = length(vUv);
  float core = smoothstep(1.0, 0.0, r);
  float ring = smoothstep(0.06, 0.0, abs(r - (0.55 + 0.18 * sin(uTime * 5.0 * uCalm))));
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
uniform vec3 uAim;   // beam-local pull target — the HELD core's offset from the maw plane
attribute float aSeed;
varying float vFade;
varying float vGulp;
void main() {
  // Two seed bands in one draw call: ~28% of motes ride a long, slow, dim band
  // spanning nearly the whole glass so the suction reads down the funnel, not just
  // inside the mouth's last 22% (the gulp language at the rim stays untouched).
  float wide = step(0.72, aSeed);
  float t = fract(aSeed * 7.13 + uTime * (0.35 + aSeed * 0.5) * mix(1.0, 0.55, wide));
  // Motes CONVERGE into the mouth: they spawn wide and up-beam of the maw, then run
  // inward/tight as t→1 — the funnel reads as matter being pulled to the gravity well.
  float x = uLen * (mix(0.78, 0.15, wide) + mix(0.22, 0.85, wide) * t);
  float r = uRad * (1.45 - 1.15 * t) * mix(1.0, 0.75, wide);
  float a = aSeed * 6.2832 + uTime * (1.6 + aSeed * 2.2) * mix(1.0, 0.6, wide);
  vec3 p = vec3(x, cos(a) * r, sin(a) * r);
  // While a core is held the well it orbits is off-axis from the maw — bend the
  // funnel's last stretch toward it so the suction arrow points at the real mass.
  p += uAim * smoothstep(0.55, 1.0, t) * (1.0 - wide);
  vFade = smoothstep(0.0, 0.15, t) * mix(1.0, 0.45, wide);
  // Terminal gulp: the mote holds full bright, flashes as the mouth swallows it,
  // then snaps off AT the rim — the swallow beat was invisible when it faded early.
  vGulp = smoothstep(0.82, 1.0, t) * (1.0 - wide);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = uSize * (280.0 / max(1.0, -mv.z));
  gl_Position = projectionMatrix * mv;
}
`;

const SPIRAL_FRAG = /* glsl */`
uniform vec3 uCol;
uniform float uFade;    // close-ramp gate — motes die WITH the glass, not past it
varying float vFade;
varying float vGulp;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d = dot(c, c);
  if (d > 1.0) discard;
  // Gulp = brighten into the swallow (peak ~3x near the rim) then cut dead at t→1.
  float a = vFade * (1.0 + 2.4 * vGulp) * (1.0 - smoothstep(0.88, 1.0, vGulp));
  gl_FragColor = vec4(uCol, a * (1.0 - d) * 0.8 * uFade);
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
uniform float uCalm;      // flash-accessibility scale — the burst respects reduced-flash
varying vec2 vUv;
void main() {
  float r = length(vUv);
  float edge = smoothstep(0.10, 0.0, abs(r - uT));
  float inner = smoothstep(1.0, 0.0, r) * 0.25 * (1.0 - uT);
  float a = (edge * 0.85 + inner) * (1.0 - uT) * (1.0 - uT);
  gl_FragColor = vec4(uCol, a * uCalm);
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
    this._lastBall = null;   // last tracked ballPos + radius — feeds the ball-death burst
    this._clumpRadius = 0;
    this._discKick = 0;
    this._wakeRamp = 1;      // 0→1 over ~150 ms on the OFF→beam edge — the glass "opens" with the shimmer
    this._beamWasOn = false;
    this._closing = false;   // close-ramp: non-launch ends ease the glass out over ~250 ms
    this._closeT = 0;
    this._closeSpan = 0.25;  // ramp seconds — a strain break snaps down in ~120 ms instead
    this._closeK = 0;        // last k*k of the ramp — the clump group shrinks on it
    this._clumpKick = 0;     // absorb squash-pop on the clump (sibling of _discKick on the maw)
    this._moteKick = 0;      // absorb gulp: the mote spiral's own clock surges for a beat
    this._gulpDirX = 0;      // newest member's approach dir (world frame) — the funnel
    this._gulpDirZ = 0;      // dips toward the hit side while _moteKick is hot
    this._moteT = 0;         // spiral uTime accumulator — decoupled so a gulp doesn't rewind motes

    // The authored palette in src/data/gyreSnare.js is the single source of truth —
    // hex literals here drifted from it once already (maw disc vs palette.maw).
    const P = GYRE_SNARE.palette;
    const glass = P.glass, hot = P.rim;

    // ── beam group: origin at the nose, +X along the beam ───────────────────
    this._beam = new THREE.Group();
    this._beam.visible = false;
    this._beam.name = 'SF_GyreSnare_beam';

    this._coneMat = new THREE.ShaderMaterial({
      vertexShader: CONE_VERT, fragmentShader: CONE_FRAG,
      uniforms: {
        uTime: { value: 0 }, uPulse: { value: 0 }, uCalm: { value: 1 }, uStrain: { value: 0 },
        uColGlass: { value: new THREE.Color(glass) },
        uColHot: { value: new THREE.Color(hot) },
        uAlpha: { value: 0.55 },
      },
      transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide,
    });
    // Unit cylinder: apex (small) at -Y, mouth (unit radius) at +Y — then rotated so +Y→+X,
    // scaled x/z to mouth radius, y to beam length, offset so the apex sits at the group origin.
    // 40 height segments: the strain shiver sweeps ~17 cycles down the cone —
    // under ~22 at Nyquist it aliased into incoherent sparkle instead of a tremble.
    const coneGeo = new THREE.CylinderGeometry(1, 0.045, 1, 36, 40, true);
    coneGeo.translate(0, 0.5, 0);           // apex at local origin, mouth at y=1
    this._cone = new THREE.Mesh(coneGeo, this._coneMat);
    this._cone.rotation.z = -Math.PI / 2;   // cylinder +Y → beam +X
    this._cone.frustumCulled = false;       // scaled per frame; bounding sphere lies
    this._beam.add(this._cone);

    // Glass body under the additive rim: pure glow sells "light" but reads flat — a
    // whisper of normal-blend surface gives the cone a physical skin the rim sits on.
    this._bodyMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(glass), transparent: true, opacity: 0,
      depthWrite: false, side: THREE.DoubleSide,
    });
    this._coneBody = new THREE.Mesh(coneGeo, this._bodyMat);
    this._coneBody.rotation.z = -Math.PI / 2;
    this._coneBody.frustumCulled = false;
    this._beam.add(this._coneBody);

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
      uniforms: { uCol: { value: new THREE.Color(P.maw) }, uAlpha: { value: 0.8 }, uTime: { value: 0 }, uCalm: { value: 1 } },
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
        uTime: { value: 0 }, uLen: { value: 1 }, uRad: { value: 1 }, uFade: { value: 1 },
        uAim: { value: new THREE.Vector3() },
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
    // Glass veil over the held core: a whisper additive shell around the ball's
    // heart — the sim's data.gyreCore flag is pull-immunity, but the eye needs the
    // same answer: THIS rock belongs to the lash, not a vanilla asteroid among
    // glass lumps. Rides the clump group so it orbits/shrinks with the rubble.
    this._veilMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(glass), transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this._veil = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), this._veilMat);
    this._veil.visible = false;
    this._clump.add(this._veil);
    scene.add(this._clump);

    // ── launch bursts ────────────────────────────────────────────────────────
    this._bursts = [];
    for (let i = 0; i < MAX_BURSTS; i++) {
      const mat = new THREE.ShaderMaterial({
        vertexShader: BURST_VERT, fragmentShader: BURST_FRAG,
        uniforms: { uCol: { value: new THREE.Color(P.hot) }, uT: { value: 1 }, uCalm: { value: 1 } },
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
      m.rotation.x = -Math.PI / 2;   // flat on the play plane
      m.visible = false;
      this.scene.add(m);
      this._bursts.push({ mesh: m, t: 1, r: 1 });
    }

    // ── bowling-ball streak: a fading additive ribbon trailing the thrown clump so its
    // flight reads at range (the whoosh dies ~2 s in; the grave burst only fires at 9 s).
    const trailGeo = new THREE.PlaneGeometry(1, 1);
    trailGeo.rotateX(-Math.PI / 2);   // bake flat-on-plane so rotation.y aims cleanly
    this._trailMat = new THREE.ShaderMaterial({
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying vec2 vUv; uniform vec3 uCol; uniform float uAlpha; void main(){ float a = pow(vUv.x, 1.6) * uAlpha; gl_FragColor = vec4(uCol, a); }',
      uniforms: { uCol: { value: new THREE.Color(glass) }, uAlpha: { value: 0 } },
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    this._trail = new THREE.Mesh(trailGeo, this._trailMat);
    this._trail.visible = false;
    this._trail.frustumCulled = false;
    scene.add(this._trail);
    // A second ribbon slot: the soonest-dying secondary ball streaks too — a
    // second bowl mid-flight was invisible for its whole 9 s but the grave pop.
    this._trail2Mat = this._trailMat.clone();
    this._trail2 = new THREE.Mesh(trailGeo, this._trail2Mat);
    this._trail2.visible = false;
    this._trail2.frustumCulled = false;
    scene.add(this._trail2);

    // Grip-spoke: a faint tether from the maw ring to the orbiting clump so the ball
    // visibly circles a held point, not bare space. Opacity rides strain — the tether
    // tightens as the clump nears the slip point.
    const gripGeo = new THREE.PlaneGeometry(1, 1);
    gripGeo.rotateX(-Math.PI / 2);
    this._gripMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(glass), transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    this._grip = new THREE.Mesh(gripGeo, this._gripMat);
    this._grip.visible = false;
    this._grip.frustumCulled = false;
    scene.add(this._grip);

    // Gravity halo: a faint flat ring marking the clump's suck radius so the
    // held ball reads as the gravity source it is, not just a circling rock.
    const haloGeo = new THREE.RingGeometry(0.96, 1.0, 72);
    haloGeo.rotateX(-Math.PI / 2);
    this._haloMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(glass), transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    this._halo = new THREE.Mesh(haloGeo, this._haloMat);
    this._halo.visible = false;
    this._halo.frustumCulled = false;
    scene.add(this._halo);

    // Basin pull glows: a faint flat brighten on each body the cone is actually
    // dragging this tick — "increases gravity" reads on the victim itself, not
    // just on the funnel motes. One pool slot per sim-published basinSpot.
    this._basinGlows = [];
    const spotGeo = new THREE.CircleGeometry(1, 24);
    spotGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < GYRE_SNARE.basinSpotMax; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(glass), transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      });
      const g = new THREE.Mesh(spotGeo, mat);
      g.visible = false;
      g.frustumCulled = false;
      scene.add(g);
      this._basinGlows.push(g);
    }
    this._spotPt = { x: 0, z: 0 };

    this._nose = { x: 0, z: 0 };
    this._mawPt = { x: 0, z: 0 };
    this._ballPt = { x: 0, z: 0 };
    this._corePt = { x: 0, z: 0 };
    this._throwBeat = false;   // latched once per launch: the big ring blooms on the sim's thrownBeat tick
    this._lastGraveTick = -1;  // graves dedupe — one bloom per sim tick, not per render frame
    this._deathT = 0;          // >0 while a dead ball's rubble dissolves into its grave (~0.25 s)
  }

  _lumpMaterial(type) {
    let mat = this._lumpMats[type];
    if (!mat) {
      mat = new THREE.MeshStandardMaterial({
        color: LUMP_TINT[type] || GYRE_SNARE.palette.lump,
        roughness: 0.35, metalness: 0.25,
        transparent: true, opacity: 0.85,
        emissive: GYRE_SNARE.palette.lumpGlow, emissiveIntensity: 0.22,
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
    // Katamari compaction: the member ledger caps at MAX_LUMPS but the ball keeps
    // growing — lumps scale WITH the clump so 28 chunks still carpet a capped 60 wu
    // shell instead of leaving most of the sphere bare past the ledger's bound.
    const r = Math.max(0.35, finite(member.radius, 2) * 0.62)
      * Math.min(3, Math.max(1, finite(this._clumpRadius, 12) / 14));
    slot.baseScale = r;
    m.scale.setScalar(r * 0.2);
    const spread = Math.max(0, finite(this._clumpRadius) - r * 0.45);
    m.position.set(
      finite(member.nx, 0) * spread,
      ((i * 0.61803398875) % 1 - 0.5) * r * 1.1,
      finite(member.nz, 0) * spread,
    );
    // Loose-rubble drift: each lump bobs in place around its spawn seat so the clump
    // reads as levitating debris in zero-G, not a rigid flywheel.
    (slot.basePos || (slot.basePos = new THREE.Vector3())).copy(m.position);
    // Fly-in: the lump enters along the direction its victim approached from, starting
    // on the clump's rim and easing into its seat — the stick is a motion, not a pop.
    slot.fromX = finite(member.nx, 0) * finite(this._clumpRadius) * 0.95;
    slot.fromZ = finite(member.nz, 0) * finite(this._clumpRadius) * 0.95;
    slot.bobPhase = i * 2.39;
    slot.bobRate = 1.15 + ((i * 0.61803398875) % 1) * 0.9;
    // Loose zero-G debris also TUMBLES — a slow per-lump spin rate staggered on the
    // same golden-ratio spread as bobRate so big clumps never read as a rigid wheel.
    slot.tumbleRate = 0.25 + ((i * 0.75487766624) % 1) * 0.55;
    slot.tumblePhase = i * 1.13;
    m.rotation.set(i * 1.7, i * 2.3, i * 0.9);
    m.visible = true;
  }

  _clearLumps() {
    for (const l of this._lumps) { l.used = false; l.mesh.visible = false; }
  }

  _fireBurst(x, z, r, calm = 1) {
    // Steal the MOST-decayed slot, not slot 0 — a full pool mid-expansion would
    // otherwise always cut the same ring.
    let slot = this._bursts[0];
    for (const b of this._bursts) if (b.t > slot.t) slot = b;
    slot.t = 0;
    slot.r = r;
    // The two brightest flashes in the vocabulary respect reduced-flash like
    // everything else — scale the ring's alpha, not just its lifespan.
    slot.mesh.material.uniforms.uCalm.value = calm;
    const p = this.toLocal ? this.toLocal(x, z, this._nose) : (this._nose.x = x, this._nose.z = z, this._nose);
    slot.mesh.position.set(p.x, 0.4, p.z);
    slot.mesh.visible = true;
  }

  // A pub.balls entry → trail spec for _drawTrail (dir from live velocity; a ball
  // resting at spawn is a degenerate — arrow it +X rather than NaN the rotation).
  _ballTrailSpec(b, alpha) {
    if (!b || !Number.isFinite(b.x) || !Number.isFinite(b.z)) return null;
    const vl = Math.hypot(finite(b.vx), finite(b.vz));
    return {
      x: b.x, z: b.z,
      dx: vl > 1e-3 ? finite(b.vx) / vl : 1,
      dz: vl > 1e-3 ? finite(b.vz) / vl : 0,
      r: finite(b.r, 8), ttl01: b.ttl01, mass: b.mass, alpha,
    };
  }

  // Shared streak painter — one flat quad trailing a flying ball along its travel.
  // spec {x,z,dx,dz,r,ttl01,mass,alpha,wind} or null → the slot hides.
  // ttl01 drives the last-~1.1 s expiry fade so the ribbon telegraphs the grave;
  // wind gathers the streak during the coil; massFade reads the throw at range.
  _drawTrail(mesh, mat, spec, flashCalm) {
    if (!spec) {
      if (mesh.visible) mesh.visible = false;
      return;
    }
    const lp = this.toLocal(spec.x, spec.z, this._ballPt);
    const trailLen = Math.max(30, spec.r * 3.2);
    mesh.position.set(lp.x - spec.dx * trailLen * 0.5, 0.55, lp.z - spec.dz * trailLen * 0.5);
    mesh.rotation.y = Math.atan2(-spec.dz, spec.dx);
    mesh.scale.set(trailLen, 1, Math.max(3, spec.r * 1.15));
    const ttl01 = Math.max(0, Math.min(1, finite(spec.ttl01, 1)));
    const massFade = 0.65 + 0.5 * Math.min(1, finite(spec.mass) / GYRE_SNARE.maxClumpMass);
    mat.uniforms.uAlpha.value = spec.alpha * massFade * flashCalm
      * (1 - (spec.wind || 0)) * (0.3 + 0.7 * Math.min(1, ttl01 / 0.12));
    mesh.visible = true;
  }

  update(dt, state = {}) {
    if (this.disposed) return;
    const mirror = state.gyreSnare;
    const phase = mirror && mirror.phase ? mirror.phase : 'off';
    const live = phase !== 'off' || (mirror && mirror.launchedId != null)
      || (mirror && mirror.balls && mirror.balls.length > 0); // a secondary ball still flying keeps the streak alive
    // A mid-flight ball-death burst must keep ticking after the mirror goes quiet —
    // early-returning here froze the ring at t≈0.03 as a faint glow stuck at the grave.
    // The close-ramp owns the quiet window too: latching _quiet on the first dead frame
    // strangled the ramp after ~1 tick, leaving a ghost cone + frozen clump on screen.
    if (!live && this._quiet && !this._closing && this._deathT <= 0 && !this._bursts.some((b) => b.t < 1)) return;
    if (!live) { this._quiet = true; }
    else this._quiet = false;

    const clock = Number.isFinite(state.simTime) ? state.simTime : this.time + dt;
    // Restored sim rewound the clock — the ledger AND every phase accumulator go back
    // to zero, or the first post-restore gulp dedupes against a pre-rewind _absorbSeen
    // and clump/motes snap against their frozen phase.
    if (clock < this.time) { this._clearLumps(); this._absorbSeen = 0; this._clumpSpin = 0; this._moteT = 0; }
    const sdt = Math.max(0, clock - this.time);  // sim-domain delta — every accumulator
    this.time = clock;                           // below rides the same clock as the sim,
                                                 // so bullet-time/pause freeze the lash

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
      let dx = mL.x - nL.x, dz = mL.z - nL.z;
      let len = Math.max(1, Math.hypot(dx, dz));
      const endR = Math.max(0.5, finite(mirror.endRadius, len * 0.25));
      if (phase === 'launching' && mirror.launchedId != null && mirror.ballPos) {
        // The lash follows through: as the clump exits, the beam pins to the FROZEN launch
        // heading and the maw chases the ball's tail along it — a mid-throw yaw can't
        // visibly diverge the glass from the streak the ball is actually flying.
        const dir = mirror.launchDir;
        const dl = Math.hypot(finite(dir && dir.x, 1), finite(dir && dir.z, 0)) || 1;
        dx = finite(dir && dir.x, 1) / dl;
        dz = finite(dir && dir.z, 0) / dl;
        const bL = this.toLocal(finite(mirror.ballPos.x), finite(mirror.ballPos.z), this._ballPt);
        const axial = (bL.x - nL.x) * dx + (bL.z - nL.z) * dz;
        if (axial > len) len = axial;
      }

      this._beam.visible = true;
      this._beam.position.set(nL.x, 0.6, nL.z);
      this._beam.rotation.y = -Math.atan2(dz, dx);
      this._cone.scale.set(endR, len, endR);
      this._coneBody.scale.set(endR * 0.97, len, endR * 0.97);
      this._maw.position.set(len, 0, 0);
      // The mouth gulps geometrically: each absorb kick dilates ring + disc, not just
      // their opacity — the verb's face visibly swallows. During the coil the maw
      // engorges off launchWindup01 — the mouth swells full before it blows.
      const windup = phase === 'launching' ? clamp01(finite(mirror.launchWindup01)) : 0;
      this._maw.scale.setScalar(endR * (1 + 0.12 * this._discKick + 0.16 * windup)); // uniform — the torus circle spans local X and Y
      this._disc.position.set(len + 1.5, 0, 0);
      this._disc.scale.setScalar(endR * 0.96 * (1 + 0.12 * this._discKick + 0.10 * windup));
      // The coil also raises the cone's pulse floor — the glass visibly tenses while it
      // winds back, legible at combat range where a subtle maw choke alone was too quiet.
      const holding = phase === 'holding';
      const strain = clamp01(finite(mirror.strain01));
      // OFF→beam edge: ease the cone in over ~150 ms instead of popping full-alpha in one
      // frame — the glass opens with the wake shimmer, plus a small pulse bump.
      if (!this._beamWasOn) {
        this._beamWasOn = true;
        this._closing = false; // a re-wake mid-fade cancels the ramp cleanly
        this._wakeRamp = 0;
        this._coneMat.uniforms.uPulse.value = Math.max(this._coneMat.uniforms.uPulse.value, 0.4);
      }
      this._wakeRamp = Math.min(1, this._wakeRamp + sdt / 0.15);
      const wakeEase = this._wakeRamp * this._wakeRamp * (3 - 2 * this._wakeRamp); // smoothstep
      // The capacitor dying thins the glass itself — a lash <8 s from dry fades up to
      // 30% in-world, not just in the pill (same telegraph language as the ball's ·Ns).
      const fuseS = finite(mirror.fuseS);
      const fuseDim = fuseS > 0 && fuseS < GYRE_SNARE.fuseWarnVisS
        ? 0.7 + 0.3 * (fuseS / GYRE_SNARE.fuseWarnVisS) : 1;
      this._coneMat.uniforms.uTime.value = this.time;
      this._coneMat.uniforms.uCalm.value = calm;
      this._coneMat.uniforms.uAlpha.value = (holding ? 0.62 : 0.42) * flashCalm * wakeEase * fuseDim;
      // The normal-blend skin sits under the additive glass at a whisper — just enough
      // for the cone to occlude background glow and read as a surface, not a hologram.
      this._bodyMat.opacity = 0.1 * flashCalm * wakeEase * fuseDim * (holding ? 1.2 : 0.8);
      // Per-second decay like _discKick — a per-frame *0.9 halves the flash on 144 Hz
      // panels vs 60 Hz ones, so the snag/launch flash length must ride dt, not frames.
      // Single canonical writer: the decayed carry maxes against the strain
      // floor and the coil floor — the glass visibly tenses while it winds
      // back, legible at combat range where a subtle maw choke alone was too quiet.
      this._coneMat.uniforms.uPulse.value = Math.max(
        this._coneMat.uniforms.uPulse.value * Math.exp(-sdt * 6.3),
        strain * 0.7,
        windup * 0.55, // coil tension: the glass winds up with the spring
      );
      this._coneMat.uniforms.uStrain.value = strain * calm;
      // Absorb pulse: each katamari hit kicks the maw disc + ring — the mouth flashes
      // as it feeds, so swallow reads visually even before the lump grows in.
      const absorbsNow = finite(mirror.absorbs, 0);
      if (absorbsNow > this._absorbSeen) {
        this._discKick = 1; this._clumpKick = 1; this._moteKick = 1;
        // The gulp lands on the side the mass actually hit — the member ledger's
        // approach direction (world frame) biases the funnel's aim while the kick lasts.
        this._gulpDirX = finite(mirror.absorbDir && mirror.absorbDir.x);
        this._gulpDirZ = finite(mirror.absorbDir && mirror.absorbDir.z);
      }
      if (absorbsNow < this._absorbSeen) this._absorbSeen = 0; // new clump ledger
      this._absorbSeen = absorbsNow;
      this._discKick *= Math.exp(-sdt * 4.2);
      this._clumpKick *= Math.exp(-sdt * 6);
      this._moteKick *= Math.exp(-sdt * 5);
      // The mouth rides the same ignition ramp + dying-cap dim as the glass — a ring
      // that pops at full alpha a frame early or stays bright under a dying fuse
      // contradicts the telegraph the cone is making.
      this._mawMat.opacity = Math.min(1, (0.4 + (holding ? 0.25 : 0) + strain * 0.3 + this._discKick * 0.35) * flashCalm * fuseDim * wakeEase);
      // Net anticipation: absorbables already inside the cone make the mouth glow
      // brighter before the catch — "×N IN NET" through the glass itself.
      const net = Math.min(3, finite(mirror.basinCount, 0));
      this._discMat.uniforms.uTime.value = this.time;
      this._discMat.uniforms.uCalm.value = calm;
      this._discMat.uniforms.uAlpha.value = Math.min(1.2, (holding ? 0.9 : 0.55 + net * 0.12) + this._discKick * 0.5) * flashCalm * fuseDim * wakeEase;
      // Reduced-motion keeps a STATIC mote scatter instead of hiding the funnel
      // outright — the frozen motes still read "matter is being pulled" where
      // visible=false left the cone with no suction signifier at all.
      this._spiral.visible = true;
      // Strain hurries the funnel too — the glass shivers and the clump trembles,
      // so the spiral's metronome pace would otherwise betray the about-to-tear read.
      if (calm !== 0) this._moteT += sdt * (1 + this._moteKick * 1.8 + net * 0.45 + strain * 1.5);
      this._spiralMat.uniforms.uTime.value = this._moteT;
      this._spiralMat.uniforms.uLen.value = len;
      this._spiralMat.uniforms.uRad.value = endR;
      // Aim the funnel's endpoint at the held core's beam-local offset: while a mass
      // is tethered it orbits ±75 wu off the maw plane, and the suction arrow should
      // point at the gravity well it really feeds — not an empty plane.
      // Beam frame: +x = nose→maw (dx,dz)/len; local ẑ maps to (-dz,dx)/len.
      // Lerp toward the target instead of snapping — the moment the coil engages the
      // funnel eases back to the maw over ~0.1 s rather than unbending in one frame.
      const aimT = this._aimTarget || (this._aimTarget = new THREE.Vector3());
      if (holding && mirror.corePos) {
        const cl = this.toLocal(finite(mirror.corePos.x), finite(mirror.corePos.z), this._corePt);
        const ox = cl.x - mL.x, oz = cl.z - mL.z;
        const inv = len > 0 ? 1 / len : 0;
        const bx = dx * inv, bz = dz * inv;
        aimT.set(ox * bx + oz * bz, 0, -ox * bz + oz * bx);
        // Gulp dip: while the absorb kick is hot the funnel leans toward the side the
        // meal hit (world dir → beam-local, same transform as the core offset above).
        if (this._moteKick > 0.02 && (this._gulpDirX || this._gulpDirZ)) {
          const gx = this._gulpDirX * bx + this._gulpDirZ * bz;
          const gz = -this._gulpDirX * bz + this._gulpDirZ * bx;
          aimT.x += gx * this._moteKick * 0.6;
          aimT.z += gz * this._moteKick * 0.6;
        }
      } else {
        aimT.set(0, 0, 0);
      }
      this._spiralMat.uniforms.uAim.value.lerp(aimT, 1 - Math.exp(-sdt * 8));
      this._spiralMat.uniforms.uFade.value = 1;
    } else {
      // Close-ramp: every close (release, strain break, post-launch) eases the glass
      // down over ~0.25 s instead of popping — the collapse is part of the payoff.
      if (this._beamWasOn) {
        this._beamWasOn = false;
        this._closing = true;
        this._closeT = 0;
        // A strain break is a TEAR, not a polite release: the glass snaps down in
        // ~120 ms (half the normal ramp) and a ring blooms where the core slipped —
        // the sim publishes the drop reason so the close reads it. Every other close
        // (release, post-launch, boundary) keeps the ~250 ms ease.
        this._closeSpan = mirror.dropReason === 'strained' ? 0.12 : 0.25;
        if (mirror.dropReason === 'strained') {
          this._fireBurst(finite(mirror.corePos.x), finite(mirror.corePos.z),
            Math.max(6, finite(mirror.clumpRadius, 8) * 1.4), flashCalm);
        }
      }
      if (this._closing) {
        this._closeT += sdt;
        const k = Math.max(0, 1 - this._closeT / (this._closeSpan || 0.25));
        const kk = k * k;
        if (calm !== 0) this._moteT += sdt; // motes keep spiraling while they die (frozen under reduced-motion, same as live)
        this._spiralMat.uniforms.uTime.value = this._moteT;
        this._spiralMat.uniforms.uFade.value = kk; // the scatter fades on the same 250ms ramp as the glass
        this._coneMat.uniforms.uTime.value = this.time;
        this._coneMat.uniforms.uAlpha.value = 0.42 * kk * flashCalm;
        this._coneMat.uniforms.uPulse.value *= Math.exp(-sdt * 9);
        this._coneMat.uniforms.uStrain.value *= Math.exp(-sdt * 9); // tremble dies with the ramp
        // flashCalm rides every close-ramp alpha too — a reduced-flash user shouldn't
        // get a brighter 250 ms tail than those elements ever show while live.
        this._bodyMat.opacity = 0.1 * kk * flashCalm;
        this._mawMat.opacity = 0.55 * kk * flashCalm;
        this._discMat.uniforms.uAlpha.value = 0.55 * kk * flashCalm;
        this._closeK = kk; // the clump block below shrinks the freed ball on the same ramp
        this._spiral.visible = true; // static scatter under reduced-motion too
        if (k <= 0) { this._closing = false; this._beam.visible = false; this._spiral.visible = false; }
      } else if (this._beam.visible) {
        this._beam.visible = false;
        this._spiral.visible = false; // spiral now stays visible through closing — hide it on the rare non-ramp off
        this._closeK = 0;
      }
    }

    // ── clump ────────────────────────────────────────────────────────────────
    // Hold: lumps ride the core's orbit slot. Launch: they keep riding the free ball
    // until the mirror stops tracking it.
    // Clump overlay rides the body's real spin when held (the tumble servo parks it
    // near 0.55 rad/s), falling back to the authored drift only while that publishes.
    let cx = null, cz = null, spinRate = 0.9;
    if (phase === 'holding' && mirror.corePos) {
      cx = mirror.corePos.x; cz = mirror.corePos.z;
      const w = finite(mirror.coreAngVel);
      // Signed: an external torque that flips the core's tumble should flip the
      // rubble overlay's orbit too, not leave it revolving against its own spin.
      spinRate = Math.min(3, 0.35 + Math.abs(w) * 0.85) * (w < 0 ? -1 : 1);
    } else if (mirror.launchedId != null && mirror.ballPos) { cx = mirror.ballPos.x; cz = mirror.ballPos.z; spinRate = 2.6; }

    // The flying ball's grave is tracked off ballPos only — a newly held core must
    // never poison where the OLD ball died (previously cx could be the held core).
    if (mirror.launchedId != null && mirror.ballPos) {
      const lb = this._lastBall || (this._lastBall = { x: 0, z: 0, r: 0 });
      lb.x = mirror.ballPos.x; lb.z = mirror.ballPos.z;
      lb.r = Math.max(1, finite(mirror.ballClumpRadius, this._clumpRadius));
    }
    // Ball-death fires the moment the tracker drops it — even mid-hold, so a ball
    // dying while a new clump orbits still gets its grave burst at its own spot.
    // Adoption retirements (launchedId dropped with ballGrave=false: a foreign owner
    // kept the live body) get no ring — the shatter must not bloom under a live ball.
    if (this._ballId != null && mirror.launchedId == null && this._lastBall) {
      if (mirror.ballGrave !== false) {
        this._fireBurst(this._lastBall.x, this._lastBall.z, Math.max(6, this._lastBall.r * 1.6), flashCalm);
      }
      this._lastBall = null;
    }
    // Non-primary graves: a second ball retired on a quiet TTL gets its own ring at
    // its own spot — the sim publishes {x,z,r} only on the retire tick. Dedupe on
    // state.tick: the list persists across render frames within a tick, so a 144 Hz
    // panel would otherwise bloom the same grave 2-3 times (each burst steals a slot).
    if (Array.isArray(mirror.graves) && mirror.graves.length
      && state.tick !== this._lastGraveTick) {
      this._lastGraveTick = state.tick;
      for (let i = 0; i < mirror.graves.length; i++) {
        const g = mirror.graves[i];
        this._fireBurst(finite(g.x), finite(g.z), Math.max(6, finite(g.r, 6) * 1.6), flashCalm);
      }
    }

    // Victim-side gravity read: each body the cone is dragging this tick gets a
    // faint flat brighten — "increases gravity" lands on the rock, not just the
    // funnel motes. Sim caps the ledger at the pool size.
    const spots = Array.isArray(mirror.basinSpots) ? mirror.basinSpots : null;
    for (let i = 0; i < this._basinGlows.length; i++) {
      const g = this._basinGlows[i];
      const s = spots && i < spots.length ? spots[i] : null;
      if (!s || !this.toLocal) { g.visible = false; continue; }
      const lp = this.toLocal(finite(s.x), finite(s.z), this._spotPt);
      g.position.set(lp.x, 0.35, lp.z);
      g.scale.setScalar(Math.max(1.5, finite(s.r, 3) * 2.6)
        * (1 + 0.08 * Math.sin(this.time * 4 + i * 1.7) * calm));
      // Opacity rides the pull strength the sim published (k = lane accel share):
      // a body at the basin's heart burns brighter than one fading at the lip.
      g.material.opacity = (0.06 + 0.14 * finite(s.k, 0.5)) * flashCalm;
      g.visible = true;
    }

    if (cx == null) {
      // A thrown ball's rubble shrinks INTO its grave over ~0.25 s (the k² language of
      // the close-ramp) instead of teleporting out under the blooming ring.
      if (this._ballId != null && !this._closing && this._deathT <= 0) this._deathT = 0.25;
      if (this._deathT > 0) {
        this._deathT -= sdt;
        const k = Math.max(0, this._deathT / 0.25);
        this._clump.scale.setScalar(Math.max(0.001, k * k));
        this._clump.visible = this._deathT > 0;
        if (this._deathT <= 0) this._clearLumps();
      } else if (this._closing && this._clump.visible && this._closeK > 0) {
        this._clump.scale.setScalar(Math.max(0.001, this._closeK));
      } else {
        this._clump.visible = false;
      }
      this._lastBall = null;
      // No held clump and no primary: the two streak slots still serve the
      // soonest-dying secondaries instead of every surviving ball flying bare
      // (pub.balls is ttlS-sorted — [0] dies first).
      {
        const _bs = Array.isArray(mirror.balls) ? mirror.balls : [];
        this._drawTrail(this._trail, this._trailMat, this._ballTrailSpec(_bs[0], 0.3), flashCalm);
        this._drawTrail(this._trail2, this._trail2Mat, this._ballTrailSpec(_bs[1], 0.22), flashCalm);
      }
      this._grip.visible = false;
      this._halo.visible = false;
      if (phase === 'off' && this._ballId == null && !this._closing && this._deathT <= 0) this._clearLumps();
    } else {
      this._deathT = 0;
      const p = this.toLocal(cx, cz, this._nose);
      this._clump.visible = true;
      this._clump.position.set(p.x, 0.6, p.z);
      // Feed squash-pop: each absorb compresses the clump ~12% for ~120 ms — "mass
      // landed" reads on the payload, not just the mouth flash. (The assignment also
      // clears any cancelled close-ramp shrink — a fresh cx means the ramp died.)
      this._clump.scale.setScalar(1 - 0.12 * this._clumpKick);
      this._clumpSpin += sdt * spinRate;
      this._clump.rotation.y = -this._clumpSpin;
      this._clumpRadius = finite(mirror.clumpRadius, this._clumpRadius);
      // Core veil: the held/grown ball's glass skin — swells with clump radius and
      // breathes faintly with strain, so the ball's heart reads as lash material.
      const veilR = Math.max(2.5, this._clumpRadius * 1.22);
      this._veil.scale.setScalar(veilR);
      // Saturated payload: at cap the suck halo deliberately fades out, so the ball
      // itself carries the FULL read — the veil hot-pulses and the rubble's emissive
      // climbs, landing the cap on the thing the player is watching, not just the pill.
      const fullGlow = holding && finite(mirror.clumpMass) >= Math.max(1, finite(mirror.maxClumpMass, 1))
        ? 0.05 + 0.02 * Math.sin(this.time * 3.4) * calm : 0;
      this._veilMat.opacity = (0.085 + clamp01(finite(mirror.strain01)) * 0.05 + this._clumpKick * 0.05 + fullGlow) * flashCalm;
      this._veil.visible = this._veilMat.opacity > 0.004;
      // Strain tremble: under load the held rubble visibly quivers — the core mesh
      // stays physics-true while its swarm shakes, which is exactly "about to slip".
      const tremble = (phase === 'holding' ? clamp01(finite(mirror.strain01)) : 0) * calm;
      if (tremble > 0) {
        this._clump.position.x += (Math.sin(this.time * 47) * 0.7 + Math.sin(this.time * 31 + 1.7) * 0.3) * tremble * 1.4;
        this._clump.position.z += Math.cos(this.time * 41 + 0.6) * tremble * 1.1;
      }
      // Flight ribbons: two stretched flat quads behind flying balls. The PRIMARY
      // rides the frozen launchDir + the coil gate (its streak gathers while the
      // wind-up holds it); once it retires the slot hands its ribbon to the
      // soonest-dying secondary instead of going dark while balls still streak
      // (pub.balls is ttlS-sorted — [0] dies first). Anchored at each ball's own
      // position, not p — a re-snag mid-flight must not steal a stale heading.
      {
        const _balls = Array.isArray(mirror.balls) ? mirror.balls : [];
        let _t1 = null; let _t1id = null;
        if (mirror.launchedId != null && mirror.ballPos) {
          const dir = mirror.launchDir;
          const dl = Math.hypot(finite(dir && dir.x, 1), finite(dir && dir.z, 0)) || 1;
          _t1 = {
            x: mirror.ballPos.x, z: mirror.ballPos.z,
            dx: finite(dir && dir.x, 1) / dl, dz: finite(dir && dir.z, 0) / dl,
            r: finite(mirror.ballClumpRadius, this._clumpRadius),
            ttl01: mirror.ballTtl01, mass: mirror.ballMass,
            alpha: 0.3, wind: finite(mirror.launchWindup01),
          };
          _t1id = mirror.launchedId;
        } else {
          _t1 = this._ballTrailSpec(_balls[0], 0.3);
          _t1id = _t1 ? _balls[0].id : null;
        }
        this._drawTrail(this._trail, this._trailMat, _t1, flashCalm);
        // Slot two serves the soonest-dying ball not already drawn — a second
        // bowl was invisible for its whole flight until the grave burst.
        const _b2 = _balls.find((b) => b && b.id !== _t1id) || null;
        this._drawTrail(this._trail2, this._trail2Mat, this._ballTrailSpec(_b2, 0.22), flashCalm);
      }

      // Grip-spoke: while the clump is held, draw the faint tether maw→clump so the
      // orbiting mass visibly rides a held point; strain visibly tightens the line.
      // The ~100 ms coil keeps the spoke drawn — the slingshot's most taut beat was
      // stretching a bare ball. The line thins + brightens as the wind-up peaks and
      // cuts at thrownBeat (the burst's first tick), not when the phase flag drops.
      const winding = phase === 'launching' && !mirror.thrownBeat;
      if (phase === 'holding' || winding) {
        const wind = winding ? clamp01(finite(mirror.launchWindup01)) : 0;
        const gL = this.toLocal(cx, cz, this._ballPt);
        const mL2 = this.toLocal(finite(mirror.maw && mirror.maw.x), finite(mirror.maw && mirror.maw.z), this._mawPt);
        const gx = gL.x - mL2.x, gz = gL.z - mL2.z;
        const gd = Math.max(1, Math.hypot(gx, gz));
        this._grip.position.set(mL2.x + gx * 0.5, 0.55, mL2.z + gz * 0.5);
        this._grip.rotation.y = Math.atan2(-gz, gx);
        const strain = clamp01(finite(mirror.strain01));
        // Grip width flickers under strain — the spoke trembles with the held rubble.
        this._grip.scale.set(gd, 1, 2.2 * (1 + strain * 0.35 * Math.sin(this.time * 37) * calm) * (1 - wind * 0.45));
        this._gripMat.opacity = (0.14 + strain * 0.3 + this._discKick * 0.2 + wind * 0.4) * flashCalm;
        this._grip.visible = true;
      } else if (this._grip.visible) {
        this._grip.visible = false;
      }

      // Gravity halo while held: the suck radius drawn faintly around the ball so
      // "within a radius of the held mass" is legible space, not just pull behavior.
      // It dims out as the clump saturates — at cap the suck lane is disabled and the
      // ring would advertise a dead well.
      const capFade = Math.max(0, 1 - finite(mirror.clumpMass) / Math.max(1, finite(mirror.maxClumpMass, 1)));
      if (phase === 'holding' && capFade > 0.03) {
        // Drawn reach must track the sim's suck annulus exactly — band + mass gain,
        // clamped at 1.5× the basin like _suckRadius so the halo never advertises more.
        const suckR = Math.min(
          finite(GYRE_SNARE.basinRadius, 86) * 1.5,
          this._clumpRadius * (1 + finite(GYRE_SNARE.suckBandMassGain, 0.5))
            + finite(GYRE_SNARE.suckBandWidth, 88));
        this._halo.position.set(p.x, 0.42, p.z);
        this._halo.scale.setScalar(suckR * (1 + 0.035 * Math.sin(this.time * 1.7) * calm));
        this._haloMat.opacity = (0.1 + this._discKick * 0.12) * flashCalm * Math.min(1, capFade * 1.6);
        this._halo.visible = true;
      } else if (this._halo.visible) {
        this._halo.visible = false;
      }

      // The shared lump materials glow hotter at cap — same saturated-payload tell
      // as the veil pulse above, carried by every merged chunk.
      const lumpGlow = fullGlow > 0 ? 0.4 + 0.12 * Math.sin(this.time * 3.4) * calm : 0.22;
      for (const k in this._lumpMats) this._lumpMats[k].emissiveIntensity = lumpGlow;
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
        // Zero-G rubble: a quiet per-lump bob (±15% of its own size, plus a hair of
        // lateral sway) keeps each chunk reading as debris in loose formation rather
        // than part of a rigid wheel. Frozen under reduced-motion like the spiral.
        if (l.basePos) {
          const bob = Math.sin(this.time * l.bobRate + l.bobPhase) * l.baseScale * 0.15 * calm;
          const sway = Math.sin(this.time * l.bobRate * 0.63 + l.bobPhase * 2.1) * l.baseScale * 0.06 * calm;
          // Entry path: rim → seat over ~0.3 s (ease-out), fading the bob in as it lands.
          const ft = Math.min(1, Math.max(0, (this.time - l.spawnT) / 0.3));
          const fe = 1 - (1 - ft) * (1 - ft);
          l.mesh.position.set(
            l.basePos.x + (l.fromX - l.basePos.x) * (1 - fe) + sway * fe,
            l.basePos.y + bob * fe,
            l.basePos.z + (l.fromZ - l.basePos.z) * (1 - fe) - sway * 0.7 * fe,
          );
        }
        // And it tumbles: a quiet per-lump yaw/roll drift (staggered at spawn) sells
        // levitating debris on large clumps where each lump is individually readable.
        l.mesh.rotation.y += sdt * l.tumbleRate * calm;
        l.mesh.rotation.x += sdt * l.tumbleRate * 0.6 * calm * Math.sin(l.tumblePhase);
      }
    }
    this._ballId = mirror.launchedId;

    // ── phase transitions ────────────────────────────────────────────────────
    if (phase !== this._phase) {
      // The grip is the payoff: entering HOLD flashes the cone hard AND gulps the
      // mouth — the disc kick + mote surge that an absorb gets, on the catch itself.
      if (phase === 'holding') {
        this._coneMat.uniforms.uPulse.value = 0.9;
        this._discKick = 1;
        this._moteKick = 1;
      }
      if (phase === 'launching') {
        // Coil-engage flare only — HALF-size: the big shatter blooms at the throw
        // itself (thrownBeat, below), matching where gyre:thrown/shake/recoil land.
        // Position: the tracked clump, else the ball mirror — a core that died on the
        // release edge shouldn't mute the vocabulary (mirror.launchedId is the marker).
        const fx = cx != null ? cx : finite(mirror.ballPos.x, finite(mirror.corePos.x));
        const fz = cx != null ? cz : finite(mirror.ballPos.z, finite(mirror.corePos.z));
        this._fireBurst(fx, fz, Math.max(6, finite(mirror.clumpRadius, 8) * 1.1), flashCalm);
        this._coneMat.uniforms.uPulse.value = Math.max(this._coneMat.uniforms.uPulse.value, 0.5);
        this._throwBeat = false;
      }
      // A live bowling ball keeps its frozen member ledger — the lumps ride the throw.
      // Only drop them when the mirror itself stopped tracking a ball (and no death
      // dissolve is still playing them out).
      if (phase === 'off' && mirror.launchedId == null && this._deathT <= 0) this._clearLumps();
      this._phase = phase;
    }

    // The throw beat: the big ring blooms on the sim's thrownBeat flag — the FIRST
    // burst tick, where gyre:thrown, the pad thump, camera shake and the Newton kick
    // all land. Gating on windup01 alone fired a frame early (windup01 hits its end
    // on the decrement tick, a tick before the first impulse).
    if (phase === 'launching' && !this._throwBeat && mirror.thrownBeat === true) {
      this._throwBeat = true;
      const bx = mirror.ballPos ? finite(mirror.ballPos.x) : finite(mirror.corePos && mirror.corePos.x);
      const bz = mirror.ballPos ? finite(mirror.ballPos.z) : finite(mirror.corePos && mirror.corePos.z);
      const br = Math.max(6, finite(mirror.ballClumpRadius, finite(mirror.clumpRadius, 8)) * 2.2);
      this._fireBurst(bx, bz, br, flashCalm);
      this._coneMat.uniforms.uPulse.value = 1;
    }

    // ── bursts ───────────────────────────────────────────────────────────────
    for (const b of this._bursts) {
      if (b.t >= 1) { if (b.mesh.visible) b.mesh.visible = false; continue; }
      b.t = Math.min(1, b.t + sdt * 1.7);
      const s = b.r * (0.25 + b.t * 1.6);
      b.mesh.scale.setScalar(s);
      b.mesh.material.uniforms.uT.value = b.t;
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.scene.remove(this._beam, this._clump, this._trail, this._trail2, this._grip, this._halo);
    this._halo.geometry.dispose(); this._haloMat.dispose();
    this._veil.geometry.dispose(); this._veilMat.dispose();
    this._trail.geometry.dispose(); this._trailMat.dispose();
    // _trail2 shares _trail's geometry (already disposed) — only its cloned material is its own.
    this._trail2Mat.dispose();
    this._grip.geometry.dispose(); this._gripMat.dispose();
    this._bodyMat.dispose();
    for (const b of this._bursts) this.scene.remove(b.mesh);
    this._cone.geometry.dispose();
    this._maw.geometry.dispose();
    this._disc.geometry.dispose();
    this._spiral.geometry.dispose();
    this._coneMat.dispose(); this._mawMat.dispose(); this._discMat.dispose(); this._spiralMat.dispose();
    for (const l of this._lumps) l.mesh.geometry.dispose();
    for (const k in this._lumpMats) this._lumpMats[k].dispose();
    for (const b of this._bursts) { b.mesh.geometry.dispose(); b.mesh.material.dispose(); }
    if (this._basinGlows && this._basinGlows.length) {
      this._basinGlows[0].geometry.dispose();
      for (const g of this._basinGlows) this.scene.remove(g);
      for (const g of this._basinGlows) g.material.dispose();
    }
  }
}
