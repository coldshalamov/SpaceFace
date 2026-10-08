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
uniform float uStrain;    // 0..1 — clump strain: WARNS the hue (chromatic, not motion — NOT calm-gated)
uniform float uTremble;   // 0..1 — strain * calm: the high-frequency shiver (motion — calm-gated)
uniform float uLeanZ;     // local-units lateral bend: the glass flexes toward the
                          // orbiting clump instead of the mouth sliding off a
                          // rigid silhouette (rim takes full lean, nose none)
varying vec2 vUv;
varying vec3 vN;
varying vec3 vW;
void main() {
  vUv = uv;
  vec3 p = position;
  // The lash flexes: lateral displacement grows from the nose's fixed anchor to
  // the rim, so the mouth seats on the mass because the cone tip REACHES for it.
  p.z += uLeanZ * smoothstep(0.25, 1.0, uv.y);
  float ang = atan(p.z, p.x);
  float ripple = sin(uv.y * 26.0 - uTime * 9.0 + ang * 4.0)
               + 0.55 * sin(uv.y * 47.0 - uTime * 15.0 - ang * 2.0)
               // strain tremble: a high-frequency shiver layered on the metronome
               // waves — under load the GLASS itself reads stressed, not just brighter.
               + uTremble * 0.6 * sin(uv.y * 110.0 - uTime * 60.0 + ang * 6.0);
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
uniform vec3 uColWarn;    // strain warn wash — 'about to tear' chromatic read
uniform float uTime;
uniform float uAlpha;
uniform float uPulse;
uniform float uCalm;      // reduced motion freezes the traveling shimmer too
uniform float uStrain;    // raw strain — hue warn is a color read, NOT calm-gated
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
  // The streak's PHASE rides uCalm — but so must its amplitude: under reduced
  // motion a frozen full-bright glint would sit as two permanent vertical seams
  // the animated cone never shows. mix(0.3, 1.0) leaves a faint static sheen.
  float glint = pow(abs(sin(vUv.x * 6.2832 - uTime * 2.4 * uCalm)), 24.0) * mix(0.3, 1.0, uCalm);
  float band = 0.5 + 0.5 * sin(vUv.y * 34.0 - uTime * 13.0 * uCalm);
  float band2 = 0.5 + 0.5 * sin(vUv.y * 71.0 - uTime * 23.0 * uCalm);
  // Same calm contract as the glint: frozen full-contrast interference bands
  // bake permanent axial stripes onto a cone the animated version never shows
  // — fold the product down to an even sheen under reduced motion.
  float bands = mix(0.25, band * band2, uCalm);
  float rim = smoothstep(0.80, 1.0, vUv.y);
  float apex = smoothstep(0.20, 0.0, vUv.y);
  float a = uAlpha * (0.05 + fres * 0.38 + lobe * 0.20 + glint * 0.10 + bands * 0.11 + rim * (0.30 + uPulse * 0.45) + apex * 0.22);
  vec3 col = mix(uColGlass, uColHot, clamp(rim * 0.75 + apex * 0.55 + fres * 0.4 + lobe * 0.3 + glint * 0.25 + uPulse * 0.4, 0.0, 1.0));
  // Strain warning = a warm wash toward uColWarn, not the near-identical rim
  // white — 'about to tear' is chromatic, not just kinetic. Raw strain (not
  // calm-gated): a color read is not motion, reduced-motion users keep it.
  // Warn reads rim-ward: the tear happens at the maw — the stressed mouth glows
  // amber while the apex stays glass, so 'about to slip' is localized not ambient.
  col = mix(col, uColWarn, uStrain * 0.45 * smoothstep(0.35, 1.0, vUv.y));
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
  // The +0.9 phase seats the reduced-motion static ring mid-breathe (r≈0.69)
  // instead of pinning it at sin(0)=0.55 — the frozen silhouette sits at the
  // oscillation's visual center, not its smallest radius.
  float ring = smoothstep(0.06, 0.0, abs(r - (0.55 + 0.18 * sin(uTime * 5.0 * uCalm + 0.9))));
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
uniform float uSwirl; // eased stir sign from the sim — the drawn funnel reverses with
                     // a -1 snag, matching the basin's real re-stir (never a flip)
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
  float a = aSeed * 6.2832 + uTime * (1.6 + aSeed * 2.2) * mix(1.0, 0.6, wide) * uSwirl;
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
    // toLocal is REQUIRED — the only producer supplies one (vfx falls back to
    // _toLocalXZ). Asserting crashes a helper-less/test host uniformly at
    // construction instead of whichever element happens to draw first.
    if (typeof toLocal !== 'function') throw new Error('GyreSnarePresentation requires a toLocal projector');
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
    this._wakeEase = 0;      // smoothstep'd ramp — read outside the beam block by the basin-glow pool
    this._beamWasOn = false;
    this._closing = false;   // close-ramp: non-launch ends ease the glass out over ~250 ms
    this._closeT = 0;
    this._closeSpan = 0.25;  // ramp seconds — a strain break snaps down in ~120 ms instead
    this._closeK = 0;        // last k*k of the ramp — the clump group shrinks on it
    this._closeSeeds = null; // each element's last live alpha /flashCalm — the ramp starts continuous
    this._closeTear = false; // 'strained' close: the freed clump whips away — rubble rides its track
    this._tearFade = null;   // seconds left on the k² rubble fade once the torn track ends (no one-frame de-rez)
    this._clumpKick = 0;     // absorb squash-pop on the clump (sibling of _discKick on the maw)
    this._moteKick = 0;      // absorb gulp: the mote spiral's own clock surges for a beat
    this._gulpDirX = 0;      // newest member's approach dir (world frame) — the funnel
    this._gulpDirZ = 0;      // dips toward the hit side while _moteKick is hot
    this._moteT = 0;         // spiral uTime accumulator — decoupled so a gulp doesn't rewind motes

    // The authored palette in src/data/gyreSnare.js is the single source of truth —
    // hex literals here drifted from it once already (maw disc vs palette.maw).
    const P = GYRE_SNARE.palette;
    const glass = P.glass, hot = P.rim;
    // Kept for per-spot hue grading — a body on the verge of snagging warms
    // toward rim-hot while a courtesy-tug loiterer stays flat glass.
    this._colGlass = new THREE.Color(glass);
    this._colHot = new THREE.Color(hot);
    this._colWarn = new THREE.Color(P.warn);
    this._colMaw = new THREE.Color(P.maw);

    // ── beam group: origin at the nose, +X along the beam ───────────────────
    this._beam = new THREE.Group();
    this._beam.visible = false;
    this._beam.name = 'SF_GyreSnare_beam';

    this._coneMat = new THREE.ShaderMaterial({
      vertexShader: CONE_VERT, fragmentShader: CONE_FRAG,
      uniforms: {
        uTime: { value: 0 }, uPulse: { value: 0 }, uCalm: { value: 1 }, uStrain: { value: 0 }, uTremble: { value: 0 },
        uLeanZ: { value: 0 },
        uColWarn: { value: new THREE.Color(P.warn) },
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
    // The skin must bend with the glass or the lean reads as the rim sliding off
    // the cone's own silhouette — same uv-graded displacement, its own uniform
    // (the skin scales z by coilR*0.97 vs the rim's coilR, so drawn-matched lean
    // needs its own denominator).
    this._bodyLeanU = { value: 0 };
    const bodyLeanU = this._bodyLeanU;
    this._bodyMat.onBeforeCompile = (sh) => {
      sh.uniforms.uLeanZ = bodyLeanU;
      sh.vertexShader = 'uniform float uLeanZ;\n' + sh.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n\ttransformed.z += uLeanZ * smoothstep(0.25, 1.0, uv.y);'
      );
    };
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
        uAim: { value: new THREE.Vector3() }, uSwirl: { value: 1 },
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

    // ── absorb contact glints: a brief additive spark where each meal actually
    // stuck. The mouth gulps on every absorb, but on a capped clump the skin is
    // ~60 wu from the maw — the contact point deserves its own flash. Pooled 2
    // deep; a fast feed reuses the stalest slot. Rides the clump group so the
    // spark sits in the same space the lump pops into (clump-local gulp angle).
    this._glints = [];
    for (let i = 0; i < 2; i++) {
      const gm = new THREE.MeshBasicMaterial({
        color: new THREE.Color(P.hot), transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      });
      const g = new THREE.Mesh(new THREE.CircleGeometry(1, 20), gm);
      g.rotation.x = -Math.PI / 2; // flat on the play plane, like the basin glows
      g.visible = false;
      this._clump.add(g);
      this._glints.push({ mesh: g, t: 0 });
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

    // ── secondary katamari overlay ─────────────────────────────────────────
    // One bounded group (veil + ≤6 lumps) riding the soonest-dying secondary ball —
    // a second thrown katamari flew its whole 9 s as a bare collider. The launch
    // meta's serialized member slice (pub.balls[].members) lets it wear rubble too.
    this._secGroup = new THREE.Group();
    this._secGroup.visible = false;
    this._secGroup.frustumCulled = false;
    this._secVeilMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(glass), transparent: true, opacity: 0.07,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this._secVeil = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), this._secVeilMat);
    this._secGroup.add(this._secVeil);
    this._secLumps = [];
    this._secId = null;   // which balls[] id the overlay currently tracks
    this._secIdHash = 0;  // written after the first bob read — 0 keeps the seed benign
    this._secN = -1;      // lump ledger size last laid out (rebuild key)
    scene.add(this._secGroup);

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

    // Basin edge during HOLD: the pull lane keeps dragging bodies through the
    // cone while the suck annulus owns the shared halo around the clump — a
    // second, fainter ring keeps the two-zone gravity story drawn.
    this._basinHaloMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(glass), transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    this._basinHalo = new THREE.Mesh(haloGeo, this._basinHaloMat);
    this._basinHalo.visible = false;
    this._basinHalo.frustumCulled = false;
    scene.add(this._basinHalo);

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
    this._secGraveT = null;    // >0 while a secondary ball's lumps scatter into its grave
    this._launchKick = 0;      // armed veil surge on the thrown ball — ~0.7 s tail off thrownBeat
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

  _addLump(member, i, instant = false) {
    let slot = null;
    for (const l of this._lumps) if (!l.used) { slot = l; break; }
    if (!slot) {
      if (this._lumps.length >= MAX_LUMPS) return;
      // Seed on the member's own identity, not its ledger index — a want<have
      // rebuild re-adds the same members and their silhouettes should survive
      // it instead of re-jittering into new rocks.
      let h = 31;
      const tp = member.type || '';
      for (let c = 0; c < tp.length; c++) h = ((h * 31) + tp.charCodeAt(c)) | 0;
      const seed = Math.abs(h + Math.round(finite(member.mass) * 7)
        + Math.round(finite(member.nx) * 977) + Math.round(finite(member.nz) * 1291)) | 0;
      const geo = jitterGeometry(new THREE.IcosahedronGeometry(1, 1), 0.28, seed);
      slot = { mesh: new THREE.Mesh(geo), used: false, baseScale: 1, spawnT: 0 };
      this._clump.add(slot.mesh);
      this._lumps.push(slot);
    }
    slot.used = true;
    // grow-in: lumps swell in over ~150 ms, not pop. Same-tick absorbs stagger
    // ~45 ms apart (per-frame counter, reset in update) — spawn in the FUTURE so
    // later lumps literally bloom later: a dense feed lands as a wave of arrivals,
    // oldest first, not N lumps in lockstep (nor reverse — a past spawnT would
    // arrive already grown). Capped so a long feed never delays beyond ~0.4 s.
    slot.spawnT = instant ? this.time
      : this.time + Math.min(this._spawnStagger || 0, 8) * 0.045;
    if (!instant) this._spawnStagger = (this._spawnStagger || 0) + 1;
    // The body the lump replaces vanished THIS tick — seed at nearly half scale so
    // the eye tracks the meal continuously instead of the mesh popping out first.
    // A ledger rebuild isn't a meal: `instant` restores full scale so the same
    // ball doesn't visibly re-bloom in place.
    slot.spawnScale = instant ? 1 : 0.45;
    const m = slot.mesh;
    m.material = this._lumpMaterial(member.type);
    // Katamari compaction: the member ledger caps at MAX_LUMPS but the ball keeps
    // growing — lumps scale WITH the clump so 28 chunks still carpet a capped 60 wu
    // shell instead of leaving most of the sphere bare past the ledger's bound.
    const r = Math.max(0.35, finite(member.radius, 2) * 0.62)
      * Math.min(3, Math.max(1, finite(this._clumpRadius, 12) / 14));
    slot.baseScale = r;
    m.scale.setScalar(r * (slot.spawnScale || 0.45));
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
    // Seed at the contact point, not inside the silhouette: the sim removed the victim
    // at clumpRadius + memberRadius + absorbEpsilonWu, so the lump pops in where the
    // body actually vanished — a capped ball doesn't teleport the meal ~16 wu inward.
    const touch = finite(this._clumpRadius) + finite(member.radius, 0) + GYRE_SNARE.absorbEpsilonWu;
    if (instant) {
      // A rebuild isn't a meal: seed the fly-in at the seat itself so the same
      // ball doesn't visibly re-travel from its rim (a phantom meal).
      slot.fromX = m.position.x;
      slot.fromZ = m.position.z;
    } else {
      slot.fromX = finite(member.nx, 0) * touch;
      slot.fromZ = finite(member.nz, 0) * touch;
    }
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
    // Contact sparks are clump children too — a cleared ledger resets them, or a
    // stale-t glint ghosts back at its old seat on the next hold.
    for (const g of this._glints) { g.t = 0; g.mesh.visible = false; }
  }

  // Contact glints decay wherever the clump still draws — the live beam block
  // AND the grave/tear-follow path both feed this, so a spark caught mid-fade
  // by a drop or tear finishes its falloff instead of freezing on the skin.
  _decayGlints(sdt, flashCalm) {
    for (const g2 of this._glints) {
      if (g2.t <= 0) continue;
      g2.t *= Math.exp(-sdt * 10);
      if (g2.t < 0.02) { g2.t = 0; g2.mesh.visible = false; continue; }
      if (g2.t > 0.5 && g2.a0 != null) {
        const la = g2.a0 - (this._clumpSpin - g2.spin0);
        g2.mesh.position.set(Math.cos(la) * g2.r, 0.35, Math.sin(la) * g2.r);
      }
      g2.mesh.material.opacity = g2.t * 0.5 * flashCalm;
      g2.mesh.visible = true;
    }
  }

  // Grave scatter: instead of the k² deflate, each lump flings out along its own
  // seat direction on a per-lump stagger — katamari payoff reads as rubble.
  _scatterLumps(e) {
    for (const l of this._lumps) {
      if (!l.used || !l.basePos) continue;
      const stag = ((l.bobPhase || 0) % 1.5) / 1.5 * 0.4;
      const tt = Math.min(1, Math.max(0, e * 1.4 - stag));
      const bl = Math.hypot(l.basePos.x, l.basePos.z) || 1;
      // Floor + scale: a small ball still flings its rubble ~1.3 clump-radii clear
      // of the silhouette (16 wu min) — a capped moon scatters ~78 wu.
      const out = tt * Math.max(16, finite(this._clumpRadius, 8) * 1.3);
      l.mesh.position.set(
        l.basePos.x + (l.basePos.x / bl) * out,
        l.basePos.y + tt * 2.5,
        l.basePos.z + (l.basePos.z / bl) * out);
      l.mesh.scale.setScalar(Math.max(0.001, (l.baseScale || 1) * (1 - tt * 0.7)));
    }
  }

  _fireBurst(x, z, r, calm = 1, dir = null, rate = 1.7) {
    // Steal the MOST-decayed slot, not slot 0 — a full pool mid-expansion would
    // otherwise always cut the same ring.
    let slot = this._bursts[0];
    for (const b of this._bursts) if (b.t > slot.t) slot = b;
    slot.t = 0;
    slot.r = r;
    // Climax beats linger: the throw/tear rings run slower (rate ~1.1 → ~0.9 s)
    // than the routine catch/coil bloom (~0.59 s) so the payoff outlives it.
    slot.rate = rate;
    slot.stretch = dir ? 1.9 : 1;
    // The two brightest flashes in the vocabulary respect reduced-flash like
    // everything else — scale the ring's alpha, not just its lifespan.
    slot.mesh.material.uniforms.uCalm.value = calm;
    const p = this.toLocal(x, z, this._nose);
    slot.mesh.position.set(p.x, 0.4, p.z);
    // A directed burst stretches its ring along the throw axis — the payoff
    // aims downrange instead of blooming radially. rotation.z spins the plane
    // in its own XY before the X-tilt lays it flat, so the stretch lands on
    // world (dir.x, dir.z).
    slot.mesh.rotation.z = dir ? Math.atan2(-dir.z, dir.x) : 0;
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
      r: finite(b.r, 8), ttl01: b.ttl01, mass: b.mass, alpha, vl,
    };
  }

  // Shared streak painter — one flat quad trailing a flying ball along its travel.
  // spec {x,z,dx,dz,r,ttl01,mass,alpha,wind} or null → the slot hides.
  // ttl01 drives the last-~2.3 s expiry fade so the ribbon telegraphs the grave;
  // wind gathers the streak during the coil; massFade reads the throw at range.
  _drawTrail(mesh, mat, spec, flashCalm) {
    // Below ~5 wu/s the ball has no heading left — a stalled ricochet dragging a
    // 6 wu streak on a frozen launchDir reads as a directional lie, so hide it.
    if (!spec || spec.vl < 5) {
      if (mesh.visible) mesh.visible = false;
      return;
    }
    const lp = this.toLocal(spec.x, spec.z, this._ballPt);
    // Streak length reads SPEED, not size: a ricochet-stalled ball dragging a
    // 30 wu ribbon lies about its flight — 40 wu at bowl speed down to a 6 wu
    // whisper when the ball has no heading left.
    // The cap relaxes with payload: a capped moon's width (bounded at 48 below)
    // must stay SHORTER than its streak or the ribbon reads as a slab, not a
    // streak — 40 wu + 0.4·r keeps length ≥ width at every ball size.
    const trailLen = Math.max(6, Math.min(40 + 0.4 * finite(spec.r), finite(spec.vl) * 0.12));
    mesh.position.set(lp.x - spec.dx * trailLen * 0.5, 0.55, lp.z - spec.dz * trailLen * 0.5);
    mesh.rotation.y = Math.atan2(-spec.dz, spec.dx);
    mesh.scale.set(trailLen, 1, Math.max(3, Math.min(48, spec.r * 1.15, trailLen)));
    const ttl01 = Math.max(0, Math.min(1, finite(spec.ttl01, 1)));
    // Alpha floor: a pebble's 9 s flight keeps a readable streak at range — the
    // throw's mass still grades the shimmer but can't drop the ribbon to ~0.2.
    const massFade = 0.8 + 0.3 * Math.min(1, finite(spec.mass) / GYRE_SNARE.maxClumpMass);
    // Proportional floor: a pebble keeps ~85% of its slot alpha — readable at
    // range without flattening the primary/secondary streak hierarchy.
    mat.uniforms.uAlpha.value = Math.max(spec.alpha * massFade, spec.alpha * 0.85) * flashCalm
      * (1 - (spec.wind || 0)) * (0.3 + 0.7 * Math.min(1, ttl01 / 0.25));
    mesh.visible = true;
  }

  update(dt, state = {}) {
    if (this.disposed) return;
    this._spawnStagger = 0; // same-tick absorbs stagger their grow-in per lump
    const mirror = state.gyreSnare;
    const phase = mirror && mirror.phase ? mirror.phase : 'off';
    const live = phase !== 'off' || (mirror && mirror.launchedId != null)
      || (mirror && mirror.balls && mirror.balls.length > 0); // a secondary ball still flying keeps the streak alive
    // A mid-flight ball-death burst must keep ticking after the mirror goes quiet —
    // early-returning here froze the ring at t≈0.03 as a faint glow stuck at the grave.
    // The close-ramp owns the quiet window too: latching _quiet on the first dead frame
    // strangled the ramp after ~1 tick, leaving a ghost cone + frozen clump on screen.
    if (!live && this._quiet && !this._closing && this._deathT <= 0 && !this._bursts.some((b) => b.t < 1) && this._tearFade == null && this._secGraveT == null) return;
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

    // The snag's victim-side confirmation: the basin hot-glow dies the same tick
    // the rock becomes the core — bloom one ring where it was grabbed so 'the
    // rock got grabbed' lands AT the rock, not only as a lump flying inward.
    if (this._lastPhase === 'beaming' && phase === 'holding' && mirror.corePos) {
      // mirror.clumpRadius, not the cached field — it refreshes later in update(),
      // so on a fresh snag the field is still stale and every catch would bloom
      // the 6 wu floor regardless of what was grabbed. Sizing at ~1.5×R keeps the
      // verb's biggest early beat in parity with the ring language (the basin
      // glow it replaces already spans ~2.6× the body's radius).
      this._fireBurst(finite(mirror.corePos.x), finite(mirror.corePos.z),
        Math.max(6, finite(mirror.clumpRadius, 8) * 1.5), flashCalm);
    }
    this._lastPhase = phase;

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
      // OFF→beam edge: ease the cone in over ~150 ms instead of popping full-alpha
      // in one frame — the glass opens with the wake shimmer, plus a pulse bump.
      // Hoisted before the mesh writes: drawLen below needs the ramp this frame.
      if (!this._beamWasOn) {
        this._beamWasOn = true;
        this._closing = false; // a re-wake mid-fade cancels the ramp cleanly
        this._wakeRamp = 0;
        this._coneMat.uniforms.uPulse.value = Math.max(this._coneMat.uniforms.uPulse.value, 0.4);
      }
      this._wakeRamp = Math.min(1, this._wakeRamp + sdt / 0.15);
      // Member, not a block local: the basin-glow pool lives past this block's
      // brace — a const here threw ReferenceError on every frame a spot existed.
      const wakeEase = this._wakeEase = this._wakeRamp * this._wakeRamp * (3 - 2 * this._wakeRamp); // smoothstep
      // The beam projects: the glass GROWS nose→maw over the ignition ramp instead
      // of fading in already-extended — a lash that shoots out to its reach.
      const drawLen = len * Math.max(0.12, wakeEase);
      // The ~100 ms coil responds geometrically, not just in the pulse floor: the
      // funnel tapers ~7% and the mouth cocks aft a few wu — the glass visibly
      // tenses against the payload it's about to sling.
      const windup = phase === 'launching' ? clamp01(finite(mirror.launchWindup01)) : 0;
      const coilR = endR * (1 - windup * 0.07);
      const coilBack = windup * Math.min(6, endR * 0.5);
      this._cone.scale.set(coilR, drawLen - coilBack, coilR);
      this._coneBody.scale.set(coilR * 0.97, drawLen - coilBack, coilR * 0.97);
      this._maw.position.set(drawLen - coilBack, 0, 0);
      // The mouth gulps geometrically: each absorb kick dilates ring + disc, not just
      // their opacity — the verb's face visibly swallows. During the coil the maw
      // engorges off launchWindup01 — the mouth swells full before it blows.
      // Iris-in: the mouth opens with the glass's 150 ms wake projection instead
      // of a pre-formed ring sliding down the cone — scale eases 0.5→1 with it.
      const iris = 0.5 + 0.5 * wakeEase;
      this._maw.scale.setScalar(endR * iris * (1 + 0.12 * this._discKick + 0.16 * windup)); // uniform — the torus circle spans local X and Y
      this._disc.position.set(drawLen + 1.5 - coilBack, 0, 0);
      this._disc.scale.setScalar(endR * 0.96 * iris * (1 + 0.12 * this._discKick + 0.10 * windup));
      // Maw lean: the mouth seats ON the orbiting mass — _leanZ is the clump's
      // beam-local offset (pre-dip, meal-side excluded), already computed for the
      // funnel's uAim. Gating it on holdLag01 hid the whole lean on a healthy
      // orbit: a capped clump circling ±72 wu read dead-center. Now it rides the
      // seat offset itself — drag still exaggerates it since lag adds to the offset.
      const lagLean = Math.max(-11, Math.min(11, (this._leanZ || 0) * 0.10));
      this._maw.position.z += lagLean;
      this._disc.position.z += lagLean;
      // The GLASS flexes to reach that seat — uLeanZ is the same lean in cone-local
      // units (divided by the mesh's z scale) so the rim's drawn offset equals the
      // mouth's exactly; the skin carries it via its own material hook.
      this._coneMat.uniforms.uLeanZ.value = lagLean / Math.max(1e-4, coilR);
      this._bodyLeanU.value = lagLean / Math.max(1e-4, coilR * 0.97);
      // The coil also raises the cone's pulse floor — the glass visibly tenses while it
      // winds back, legible at combat range where a subtle maw choke alone was too quiet.
      const holding = phase === 'holding';
      // The throw is the payoff beat — the glass keeps HOLD-phase tension through
      // the coil + burst instead of relaxing back to the weaker beaming floor.
      const tense = holding || phase === 'launching';
      const strain = clamp01(finite(mirror.strain01));
      // strain01 hard-zeroes at the LAUNCH flip by sim contract (pinned). Rather
      // than popping the amber off in one frame, the warn channels ride a ~100 ms
      // decayed copy: follows raw strain while held, fades through the close.
      if (holding) this._strainVis = strain;
      else this._strainVis = (this._strainVis || 0) * Math.exp(-sdt * 10);
      const strainW = Math.max(strain, this._strainVis || 0);
      // The capacitor dying thins the glass itself — a lash <8 s from dry fades up to
      // 30% in-world, not just in the pill (same telegraph language as the ball's ·Ns).
      const fuseS = finite(mirror.fuseS);
      const fuseDim = fuseS > 0 && fuseS < GYRE_SNARE.fuseWarnVisS
        ? 0.7 + 0.3 * (fuseS / GYRE_SNARE.fuseWarnVisS) : 1;
      this._fuseDim = fuseDim; // basin glows run outside this branch — they read the cached dim
      // The verb's face reads the payload too: a 2000 t moon loads the mouth + glass
      // brighter than a 6 t pebble — escalation lands before FULL ever fires.
      // HOLD-gated: pub.clumpMass also carries a still-FLYING ball's frozen mass
      // (the ridingBall publish feeds HUD/lumps through a fresh BEAM), so without
      // the gate a searching funnel would thrum as if loaded. The LAUNCH dim already
      // spends the glass — only a held payload earns the loaded read.
      const massFrac = holding ? Math.min(1, finite(mirror.clumpMass) / Math.max(1, finite(mirror.maxClumpMass, 1))) : 0;
      this._coneMat.uniforms.uTime.value = this.time;
      this._coneMat.uniforms.uCalm.value = calm;
      // A thrown lash is SPENT glass: during the burst no pull lane runs, so the
      // cone dims ~28% — but the ~100 ms COIL stays full-bright and taut (its own
      // tension language), and the spent dim lands only as the sling releases.
      const spent = phase === 'launching' && finite(mirror.launchBurst01) > 0 ? 0.72 : 1;
      this._lastSpent = spent; // the close-ramp's mote pace reads the last live spend
      this._coneMat.uniforms.uAlpha.value = (tense ? 0.62 : 0.42) * spent * flashCalm * wakeEase * fuseDim;
      // The normal-blend skin sits under the additive glass at a whisper — just enough
      // for the cone to occlude background glow and read as a surface, not a hologram.
      // A whisper floor keeps the silhouette readable when additive blowout washes
      // the glass out against a bright nebula/planet backdrop (fades with the wake ramp).
      this._bodyMat.opacity = Math.max(
        0.1 * flashCalm * wakeEase * fuseDim * spent * (tense ? 1.2 : 0.8),
        0.035 * flashCalm * wakeEase,
      );
      // Per-second decay like _discKick — a per-frame *0.9 halves the flash on 144 Hz
      // panels vs 60 Hz ones, so the snag/launch flash length must ride dt, not frames.
      // Single canonical writer: the decayed carry maxes against the strain
      // floor and the coil floor — the glass visibly tenses while it winds
      // back, legible at combat range where a subtle maw choke alone was too quiet.
      this._coneMat.uniforms.uPulse.value = Math.max(
        this._coneMat.uniforms.uPulse.value * Math.exp(-sdt * 6.3),
        strainW * 0.7,
        windup * 0.55, // coil tension: the glass winds up with the spring
        massFrac * 0.1, // payload tension: a loaded lash thrums higher than an empty one
      );
      // uStrain (hue warn) keeps RAW strain — a color read is not motion, so
      // reduced-motion must not mute the 'about to tear' telegraph. uTremble
      // (vertex shiver) is the motion term — that one IS calm-gated.
      this._coneMat.uniforms.uStrain.value = strainW;
      this._coneMat.uniforms.uTremble.value = strainW * calm;
      // Absorb pulse: each katamari hit kicks the maw disc + ring — the mouth flashes
      // as it feeds, so swallow reads visually even before the lump grows in.
      const absorbsNow = finite(mirror.absorbs, 0);
      if (absorbsNow > this._absorbSeen) {
        // The gulp grades by meal size — audio pitch + pad strength already scale,
        // and a wreck swallowing into the ball should land visibly harder than a
        // pebble. ~0.9 on a 4 wu rock, saturating at 1.5 from ~13 wu up.
        const mealK = Math.min(1.5, 0.6 + finite(mirror.absorbR, 4) * 0.07);
        // Retriggers ADD, capped — a dense feed's third meal still visibly bumps
        // instead of smearing into one sustained kick (the pad thumps discretely;
        // the glass keeps time with it). 2.0 ceiling bounds the additive blowout.
        this._discKick = Math.min(2.0, this._discKick + mealK);
        this._clumpKick = Math.min(2.0, this._clumpKick + mealK);
        this._moteKick = Math.min(2.0, this._moteKick + mealK);
        // The swallow ripples up the WHOLE glass, not just the mouth: a floor bump
        // on the shared pulse so each meal visibly travels the cone's surface.
        this._coneMat.uniforms.uPulse.value = Math.max(this._coneMat.uniforms.uPulse.value, 0.2);
        // The gulp lands on the side the mass actually hit — the member ledger's
        // approach direction (world frame) biases the funnel's aim while the kick lasts.
        this._gulpDirX = finite(mirror.absorbDir && mirror.absorbDir.x);
        this._gulpDirZ = finite(mirror.absorbDir && mirror.absorbDir.z);
        // And the existing lumps shiver on the hit side — capture the gulp angle in
        // CLUMP space at impact so the ripple weights each lump by angular proximity
        // (rotation.y = -clumpSpin → local angle = world angle - clumpSpin).
        this._gulpLocalA = Math.atan2(this._gulpDirZ, this._gulpDirX) - this._clumpSpin;
        // Contact spark at the skin the meal hit — same clump-local seat the
        // fly-in lump uses, so the flash blooms exactly where the stick happened.
        let gs = this._glints[0];
        for (const g2 of this._glints) if (g2.t < gs.t) gs = g2;
        const gr = Math.max(2, this._clumpRadius * 0.9);
        gs.mesh.position.set(Math.cos(this._gulpLocalA) * gr, 0.35, Math.sin(this._gulpLocalA) * gr);
        gs.mesh.scale.setScalar(2 + this._clumpRadius * 0.18);
        // World-pin the bright half: a capped ball tumbles ~3 rad/s and would drag
        // 'the spark where it stuck' ~0.3 rad around the skin. Counter-rotate the
        // local angle by the spin delta so the contact flash holds its azimuth.
        gs.a0 = this._gulpLocalA;
        gs.spin0 = this._clumpSpin;
        gs.r = gr;
        gs.t = 1;
      }
      if (absorbsNow < this._absorbSeen) this._absorbSeen = 0; // new clump ledger
      this._absorbSeen = absorbsNow;
      this._discKick *= Math.exp(-sdt * 4.2);
      this._clumpKick *= Math.exp(-sdt * 6);
      this._moteKick *= Math.exp(-sdt * 5);
      // Contact glints burn ~100 ms to half-brightness and die out over ~400 ms
      // (exp(-10·dt) from 1 to the 0.02 cutoff) — fast enough that a sustained
      // feed strobes along the rim instead of smearing into one glow.
      this._decayGlints(sdt, flashCalm);
      // The mouth rides the same ignition ramp + dying-cap dim as the glass — a ring
      // that pops at full alpha a frame early or stays bright under a dying fuse
      // contradicts the telegraph the cone is making.
      // `spent` joins the lash's LAUNCH dim so the mouth fades with the glass it sits on
      // through the post-thrownBeat burst instead of glowing on a dead funnel.
      this._mawMat.opacity = Math.min(1, (0.4 + (holding ? 0.25 : 0) + massFrac * 0.08 + strainW * 0.3 + this._discKick * 0.35) * spent * flashCalm * fuseDim * wakeEase);
      // The tear happens AT the mouth — the chromatic warn the cone washes
      // rim-ward lands on its brightest element too, not just the glass skin:
      // ring + disc warm toward amber as the clump nears slipping.
      this._mawMat.color.copy(this._colHot).lerp(this._colWarn, strainW * 0.6);
      this._discMat.uniforms.uCol.value.copy(this._colMaw).lerp(this._colWarn, strainW * 0.6);
      // The mouth shivers too: glass, clump and funnel all tremble under strain
      // while the ring stayed geometrically calm — the tear's tremor belongs at
      // the rim where the snap actually happens, not only in its color.
      this._maw.scale.multiplyScalar(1 + 0.03 * strainW * Math.sin(this.time * 31) * calm);
      // Net anticipation: absorbables already inside the cone make the mouth glow
      // brighter before the catch — "×N IN NET" through the glass itself.
      const net = Math.min(3, finite(mirror.basinCount, 0));
      this._discMat.uniforms.uTime.value = this.time;
      this._discMat.uniforms.uCalm.value = calm;
      // Searching-breathe: an idle lash still reads "active gravity well" — a slow
      // ~0.8 Hz shimmer on the empty disc (silenced once mass is in the net: the +N
      // anticipation owns that brighter read). BEAM-only: the coil borrows this
      // formula through 'launching', and a breathing idle shimmer through the
      // draw would fight the windup swell + spent dim.
      this._discMat.uniforms.uAlpha.value = Math.min(1.2, (holding ? 0.9 : 0.55 + net * 0.12 + (net === 0 && phase === 'beaming' ? 0.05 * Math.sin(this.time * 5.03) : 0)) + this._discKick * 0.5) * flashCalm * fuseDim * wakeEase;
      // Reduced-motion keeps a STATIC mote scatter instead of hiding the funnel
      // outright — the frozen motes still read "matter is being pulled" where
      // visible=false left the cone with no suction signifier at all.
      this._spiral.visible = true;
      // Strain hurries the funnel too — the glass shivers and the clump trembles,
      // so the spiral's metronome pace would otherwise betray the about-to-tear read.
      // `spent` slows the funnel with the glass it feeds — a dead lane that still
      // inhales at full gulp speed through the ~0.2 s LAUNCH betrays the thrown read.
      // The funnel holds its breath through the draw: launchWindup01 pins at 1.0
      // through the coil + burst, so motes stall instead of inhaling at full gulp
      // while the glass visibly winds back for an outward throw.
      if (calm !== 0) this._moteT += sdt * (1 + this._moteKick * 1.8 + net * 0.45 + strainW * 1.5)
        * spent * (1 - Math.min(1, finite(mirror.launchWindup01)));
      this._spiralMat.uniforms.uTime.value = this._moteT;
      // The funnel rides the same coil transform as the glass — without it the
      // frozen gulp point floats ~6 wu past the retracted rim and the scatter
      // sits ~7% proud of the tapered cone for the whole ~100 ms draw.
      this._spiralMat.uniforms.uLen.value = drawLen - coilBack;
      this._spiralMat.uniforms.uRad.value = coilR * spent; // narrows with the spent lash AND the taper
      // Aim the funnel's endpoint at the held core's beam-local offset: while a mass
      // is tethered it orbits ±75 wu off the maw plane, and the suction arrow should
      // point at the gravity well it really feeds — not an empty plane.
      // Beam frame: +x = nose→maw (dx,dz)/len; local ẑ maps to (-dz,dx)/len.
      // Lerp toward the target instead of snapping — the moment the coil engages the
      // funnel eases back to the maw over ~0.1 s rather than unbending in one frame.
      const aimT = this._aimTarget || (this._aimTarget = new THREE.Vector3());
      // corePos publishes live through the coil (rt.coreId clears only at
      // _finishLaunch), so the funnel keeps aiming at the ball it is winding
      // back — unbending to the empty plane while the payload visibly drags
      // ~24 wu aft of the maw reads as the suction losing its target.
      if ((holding || phase === 'launching') && mirror.corePos) {
        const cl = this.toLocal(finite(mirror.corePos.x), finite(mirror.corePos.z), this._corePt);
        const ox = cl.x - mL.x, oz = cl.z - mL.z;
        const inv = len > 0 ? 1 / len : 0;
        const bx = dx * inv, bz = dz * inv;
        aimT.set(ox * bx + oz * bz, 0, -ox * bz + oz * bx);
        this._leanZ = aimT.z; // pre-dip clump offset — the maw lean rides the drag
                             // alone, not the meal's hit side (two signals, one glass)
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
        // Decay, not zero — uAim eases back over ~0.1 s and a hard-zeroed leanZ
        // snapped the maw/disc to center in one frame while the funnel still
        // visibly unbent.
        this._leanZ = (this._leanZ || 0) * Math.exp(-sdt * 8);
      }
      this._spiralMat.uniforms.uAim.value.lerp(aimT, 1 - Math.exp(-sdt * 8));
      // The drawn vortex stirs the way the sim's basin actually does — swirlBlend is
      // already eased sim-side (~0.5 s re-stir), so this needs no extra smoothing.
      this._spiralMat.uniforms.uSwirl.value = finite(mirror.swirlBlend, 1);
      // Dying-cap honesty reaches the funnel too — motes thin with the glass's own
      // fuse telegraph instead of inhaling full-bright on a lash <8 s from dry.
      // flashCalm rides here too — the mote gulp can brighten ~3.4x at the rim,
      // the vocabulary's third-brightest flash; reduced-flash can't skip it.
      this._spiralMat.uniforms.uFade.value = spent * fuseDim * flashCalm;
      // The motes converge INTO the rim the warn wash targets — a funnel feeding
      // cool-white sparks into an amber mouth contradicts the tear read. Warm them
      // with the same decayed strain (lighter weight than the rim — moving motes
      // don't need to scream it).
      this._spiralMat.uniforms.uCol.value.copy(this._colGlass).lerp(this._colWarn, strainW * 0.4);
      // The gravity zone is legible space before the first body enters it AND
      // through the hold — the basin pull lane drags bodies to the maw in both
      // phases, so _basinHalo owns the pull edge: brighter while searching (it
      // is the only ring then), fainter once the suck annulus takes the bright
      // read on snag. (_halo stays suck-ring-only — drawing the basin edge on
      // it here was dead code: the cx==null branch force-hides it every frame.)
      if (phase === 'beaming' || phase === 'holding') {
        this._basinHalo.position.set(mL.x, 0.42, mL.z);
        this._basinHalo.scale.setScalar(finite(GYRE_SNARE.basinRadius, 86)
          * (1 + (phase === 'beaming' ? 0.035 : 0.02) * Math.sin(this.time * 1.7) * calm));
        this._basinHaloMat.opacity = (phase === 'beaming' ? 0.06 * wakeEase : 0.03) * flashCalm;
        this._basinHalo.visible = true;
      } else if (this._basinHalo.visible) {
        this._basinHalo.visible = false;
      }
    } else {
      // The gulp kicks decay on the close path too — a drop/tear mid-feed followed
      // by a fast re-beam would otherwise carry a stale gulp into the new funnel's
      // first frames (the mouth/disc kicks own ~24% and ~+1.0 of leftover surge).
      this._discKick *= Math.exp(-sdt * 4.2);
      this._clumpKick *= Math.exp(-sdt * 6);
      this._moteKick *= Math.exp(-sdt * 5);
      // Close-ramp: every close (release, strain break, post-launch) eases the glass
      // down over ~0.25 s instead of popping — the collapse is part of the payoff.
      if (this._beamWasOn) {
        this._beamWasOn = false;
        this._closing = true;
        this._closeT = 0;
        // The ramp seeds from each element's LAST LIVE alpha — a flat seed stepped
        // the maw ~+37% brighter on an empty-beam release (up to ~2× under a dying
        // fuse) for the first frame of the collapse. /flashCalm so the ramp's own
        // flashCalm multiply lands frame-0 exactly on the last live value.
        const calmA = flashCalm > 1e-4 ? 1 / flashCalm : 0;
        this._closeSeeds = {
          cone: this._coneMat.uniforms.uAlpha.value * calmA,
          body: this._bodyMat.opacity * calmA,
          maw: this._mawMat.opacity * calmA,
          disc: this._discMat.uniforms.uAlpha.value * calmA,
          // The scene-level rings ride the same ramp — a ring that pops out
          // mid-collapse while every sibling fades breaks the close's one
          // language. (Invisible rings seed dead — an opacity seed never
          // re-shows a ring the live path already hid.)
          grip: this._gripMat.opacity * calmA,
          halo: this._haloMat.opacity * calmA,
          basinHalo: this._basinHaloMat.opacity * calmA,
        };
        // A strain break is a TEAR, not a polite release: the glass snaps down in
        // ~120 ms (half the normal ramp) and a ring blooms where the core slipped —
        // the sim publishes the drop reason so the close reads it. Every other close
        // (release, post-launch, boundary) keeps the ~250 ms ease.
        // 'strained' AND 'core_lost' close like tears — a clump shot apart in
        // the grip reads as a shatter, not the calm release ramp. core_lost has
        // no body to whip (it died), so its burst blooms radially at the spot.
        const tornClose = mirror.dropReason === 'strained' || mirror.dropReason === 'core_lost';
        // Three close speeds, three stories: tear ~120 ms (snaps), spent sling
        // ~150 ms (the launch's glass drops fast — the ball already left),
        // polite release ~250 ms.
        this._closeSpan = tornClose ? 0.12 : (mirror.dropReason === 'launched' ? 0.15 : 0.25);
        this._closeTear = tornClose;
        if (tornClose) {
          // The verb's biggest loss beat outlives the routine bloom like the throw
          // does (rate 1.1 → ~0.9 s) and stretches along the parting whip the sim
          // just applied — the same directed payoff the thrownBeat ring gets.
          const tdx = finite(mirror.tornDir && mirror.tornDir.x),
            tdz = finite(mirror.tornDir && mirror.tornDir.z);
          this._fireBurst(finite(mirror.corePos.x), finite(mirror.corePos.z),
            Math.max(6, finite(mirror.clumpRadius, 8) * 1.4), flashCalm,
            Math.hypot(tdx, tdz) > 0.01 ? { x: tdx, z: tdz } : null, 1.1);
        }
      }
      if (this._closing) {
        this._closeT += sdt;
        const k = Math.max(0, 1 - this._closeT / (this._closeSpan || 0.25));
        const kk = k * k;
        // The dying funnel keeps its last pace — a post-launch close inhaling at full
        // pre-spend speed while the glass collapses would betray the spent read.
        if (calm !== 0) this._moteT += sdt * (this._lastSpent == null ? 1 : this._lastSpent);
        this._spiralMat.uniforms.uTime.value = this._moteT;
        this._spiralMat.uniforms.uFade.value = kk; // the scatter fades on the same 250ms ramp as the glass
        this._coneMat.uniforms.uTime.value = this.time;
        this._coneMat.uniforms.uAlpha.value = (this._closeSeeds || { cone: 0.42 }).cone * kk * flashCalm;
        this._coneMat.uniforms.uPulse.value *= Math.exp(-sdt * 9);
        this._coneMat.uniforms.uStrain.value *= Math.exp(-sdt * 9); // warn dies with the ramp
        this._coneMat.uniforms.uTremble.value *= Math.exp(-sdt * 9); // tremble dies with the ramp
        // The mouth's warn tint rides the same decay — a polite release that ended
        // warm shouldn't freeze an amber ring while the glass neutralizes. A tear
        // keeps it: the slipped ball's mouth stays hot through the snap.
        if (!this._closeTear) {
          const sDecay = this._coneMat.uniforms.uStrain.value;
          this._mawMat.color.copy(this._colHot).lerp(this._colWarn, sDecay * 0.6);
          this._discMat.uniforms.uCol.value.copy(this._colMaw).lerp(this._colWarn, sDecay * 0.6);
        }
        // flashCalm rides every close-ramp alpha too — a reduced-flash user shouldn't
        // get a brighter 250 ms tail than those elements ever show while live. The
        // seeds are the last live alphas (fallbacks keep the old flat ramp).
        const sd = this._closeSeeds || { cone: 0.42, body: 0.1, maw: 0.55, disc: 0.55, grip: 0, halo: 0, basinHalo: 0 };
        this._bodyMat.opacity = sd.body * kk * flashCalm;
        this._mawMat.opacity = sd.maw * kk * flashCalm;
        this._discMat.uniforms.uAlpha.value = sd.disc * kk * flashCalm;
        this._gripMat.opacity = sd.grip * kk * flashCalm;
        this._haloMat.opacity = sd.halo * kk * flashCalm;
        this._basinHaloMat.opacity = sd.basinHalo * kk * flashCalm;
        this._closeK = kk; // the clump block below shrinks the freed ball on the same ramp
        this._spiral.visible = true; // static scatter under reduced-motion too
        if (k <= 0) {
          this._closing = false; this._beam.visible = false; this._spiral.visible = false;
          this._grip.visible = false; this._halo.visible = false; this._basinHalo.visible = false;
        }
        // _closeTear survives the 120 ms glass ramp — the rubble follows the torn
        // body for its published ~0.5 s track and clears on tornId, not on k.
      } else {
        // No ramp to ride: the basin/pull rings are scene-level children — they
        // die with the beam, never parked under the quiet latch.
        this._grip.visible = false;
        this._halo.visible = false;
        this._basinHalo.visible = false;
        if (this._beam.visible) {
          this._beam.visible = false;
          this._spiral.visible = false; // spiral now stays visible through closing — hide it on the rare non-ramp off
          this._closeK = 0;
        }
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
    } else if (mirror.launchedId != null && mirror.ballPos) {
      cx = mirror.ballPos.x; cz = mirror.ballPos.z;
      // The tumble tracks the flight — a ricochet-stalled ball barely spins; a
      // clean bowl tumbles at full rate (2.6 at authored launch speed).
      const bs = Math.hypot(finite(mirror.ballVx), finite(mirror.ballVz));
      spinRate = 2.6 * Math.max(0.15, Math.min(1, bs / (GYRE_SNARE.launchSpeed || 520)));
    }

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
        // r is frozen at the last tracked tick — correct, not a bug: the launch
        // freezes the clump ledger, so a flying ball can never outgrow its ring.
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
    // The hottest glow is reserved for the strongest ABSORBABLE — a courtesy-tugged
    // pickup topping the k-sort would otherwise fake "about to be grabbed".
    const hotIdx = spots ? spots.findIndex((s) => s && s.abs) : -1;
    for (let i = 0; i < this._basinGlows.length; i++) {
      const g = this._basinGlows[i];
      const s = spots && i < spots.length ? spots[i] : null;
      if (!s || !this.toLocal) { g.visible = false; continue; }
      const lp = this.toLocal(finite(s.x), finite(s.z), this._spotPt);
      g.position.set(lp.x, 0.35, lp.z);
      g.scale.setScalar(Math.max(1.5, finite(s.r, 3) * 2.6)
        * (1 + 0.08 * Math.sin(this.time * 4 + i * 1.7) * calm));
      // Opacity rides the pull strength the sim published (k = lane accel share):
      // a body at the basin's heart burns brighter than one fading at the lip —
      // and warms toward rim-hot in hue, so 'about to be grabbed' reads at a glance.
      // wakeEase gates them too: the sim's pull is live on frame one but the glass
      // takes ~150 ms to project — glows must not outrun the drawn rim.
      g.material.opacity = (0.06 + 0.14 * finite(s.k, 0.5)) * flashCalm * this._wakeEase * (this._fuseDim || 1);
      g.material.color.copy(this._colGlass).lerp(this._colHot, Math.min(1, finite(s.k, 0.5) * 1.3));
      // The strongest ABSORBABLE puller burns hottest — the rock about to cross
      // snagRadius. A courtesy-tugged pickup/mine/projectile can top the k sort
      // but can never be caught; upgrading it would promise a grab that can't
      // happen (plain k-lerp for everyone when nothing edible is inside).
      if (i === hotIdx) {
        g.material.color.lerp(this._colHot, 0.4);
        g.material.opacity = Math.min(0.3, g.material.opacity * 1.6);
      }
      g.visible = true;
    }

    if (cx == null) {
      // Sparks keep burning through the close the same way they did in the beam —
      // a glint caught mid-fade by a drop/tear finishes instead of freezing on
      // the riding rubble (its world-pinned seat still holds via a0/spin0).
      this._decayGlints(sdt, flashCalm);
      // A thrown ball's rubble shrinks INTO its grave over ~0.25 s (the k² language of
      // the close-ramp) instead of teleporting out under the blooming ring.
      // Adoption retirements (ballGrave === false: the body went to another lane
      // still live) skip the scatter like the ring — flinging rubble under a
      // still-flying ball reads as a mid-air burst for a body that never died.
      if (this._ballId != null && !this._closing && this._deathT <= 0) {
        if (mirror.ballGrave !== false) this._deathT = 0.25;
        else this._clearLumps();
      }
      if (this._deathT > 0) {
        this._deathT -= sdt;
        const k = Math.max(0, this._deathT / 0.25);
        // Rubble scatters on the grave, not a shrinking ball — the lumps fling
        // along their seat dirs while the group fades via the lumps' own shrink.
        this._scatterLumps(1 - k);
        this._clump.visible = this._deathT > 0;
        if (this._deathT <= 0) this._clearLumps();
      } else if (this._closeTear) {
        if (mirror.tornId != null) {
          // Tear follow: the freed core whips off on its parting snap and the rubble
          // RIDES it — the sim publishes the body's live pos for ~0.5 s (tornPos).
          // The lash visibly LOSES the ball instead of the rubble de-rezzing while
          // the grown body plainly still flies. Shrinks gently as it leaves.
          const p = this.toLocal(finite(mirror.tornPos.x), finite(mirror.tornPos.z), this._nose);
          this._clump.position.set(p.x, 0.6, p.z);
          this._clumpSpin += sdt * spinRate;
          this._clump.rotation.y = -this._clumpSpin;
          this._clump.scale.multiplyScalar(Math.exp(-sdt * 1.5));
          this._veilMat.opacity *= Math.exp(-sdt * 4);
          this._veil.visible = this._veilMat.opacity > 0.004;
          this._clump.visible = true;
        } else if (this._tearFade == null) {
          // Track just ended: ease the rubble out on the k² language of every
          // other close (~0.2 s) instead of de-rezzing in one frame mid-flight.
          this._tearFade = 0.2;
        } else {
          this._tearFade -= sdt;
          const k = Math.max(0, this._tearFade / 0.2);
          this._scatterLumps(1 - k); // same scatter language as the grave deflate
          this._veilMat.opacity *= Math.exp(-sdt * 6);
          this._veil.visible = this._veilMat.opacity > 0.004;
          this._clump.visible = this._tearFade > 0;
          if (this._tearFade <= 0) {
            this._closeTear = false; this._tearFade = null;
            this._clump.visible = false; this._clearLumps();
          }
        }
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
      // While the close ramp runs it owns the rings' alphas — an instant hide
      // here would pop them out mid-collapse while every sibling fades on kk.
      if (!this._closing) {
        this._grip.visible = false;
        this._halo.visible = false;
        this._basinHalo.visible = false;
      }
      if (phase === 'off' && this._ballId == null && !this._closing && this._deathT <= 0) this._clearLumps();
    } else {
      this._deathT = 0;
      this._closeTear = false; // a re-beam mid-tear-follow hands the clump group to the new core
      this._tearFade = null;
      const p = this.toLocal(cx, cz, this._nose);
      this._clump.visible = true;
      // Loose zero-G also drifts UP: a slow ±0.3 wu bob seeded on the clump's orbit
      // phase breaks the rigid-hover look — lumps bob internally already; the ball
      // itself was the only rigid body in the composition. calm-gated like the bob.
      this._clump.position.set(
        p.x, 0.6 + Math.sin(this.time * 0.7 + finite(mirror.orbitSeed)) * 0.3 * calm, p.z);
      // Feed squash-pop: each absorb compresses the clump ~12% then SPRINGS back —
      // sin(π·kick) peaks mid-decay so the tail rebounds ~+4% oversize before
      // settling: a snap, not a monotone squash. (Also clears cancelled ramp shrink.)
      this._clump.scale.setScalar(
        1 - 0.12 * this._clumpKick + 0.10 * Math.sin(this._clumpKick * Math.PI));
      // Coil wind: the payload visibly compresses through the ~100 ms draw — a
      // drawn spring, not a passive ball waiting for the burst. DIRECTIONAL in
      // the world launch frame: squash ALONG launchDir, bulge perpendicular —
      // applied per-lump in the placement pass (the group keeps tumbling
      // untouched; rotating the group onto the throw line left the squash axis
      // at clumpSpin+α — arbitrary tumble phase — plus a ≤180° position snap
      // at coil start/end). The y bulge stays on the group scale.
      const wind = clamp01(finite(mirror.launchWindup01));
      if (wind > 0) this._clump.scale.y *= (1 + 0.05 * wind);
      this._clumpSpin += sdt * spinRate;
      this._clump.rotation.y = -this._clumpSpin;
      // launchDir in the clump's LOCAL frame — the group renders R_y(−spin), so
      // world→local is R_y(+spin). The placement loop squashes each lump's
      // offset along this axis: the cinch pins to the throw line in world
      // space under any tumble phase.
      this._coilLd = null;
      if (wind > 0 && mirror.launchDir) {
        const dxw = finite(mirror.launchDir.x), dzw = finite(mirror.launchDir.z);
        const dl = Math.hypot(dxw, dzw) || 1;
        const cs = Math.cos(this._clumpSpin), sn = Math.sin(this._clumpSpin);
        this._coilLd = { x: (dxw / dl) * cs + (dzw / dl) * sn, z: -(dxw / dl) * sn + (dzw / dl) * cs };
      }
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
      // The thrown ball reads ARMED, not just a rock + ribbon: an ~0.7 s surge
      // off the thrownBeat latch brightens the veil and warms it toward rim-hot
      // (strain/clumpKick/fullGlow are all dead channels once it's flying).
      this._launchKick *= Math.exp(-sdt * 4);
      const armed = Math.min(1, this._launchKick);
      this._veilMat.opacity = (0.085 + clamp01(finite(mirror.strain01)) * 0.05 + this._clumpKick * 0.05 + fullGlow + armed * 0.1) * flashCalm;
      // Warn reaches the veil too — the ball is the object the player is actually
      // watching when strain climbs; cone/maw/disc already warm (strain * 0.6).
      this._veilMat.color.copy(this._colGlass).lerp(this._colWarn, clamp01(finite(mirror.strain01)) * 0.4)
        .lerp(this._colHot, armed * 0.6);
      this._veil.visible = this._veilMat.opacity > 0.004;
      // Strain tremble: under load the held rubble visibly quivers — the core mesh
      // stays physics-true while its swarm shakes, which is exactly "about to slip".
      const tremble = (phase === 'holding' ? clamp01(finite(mirror.strain01)) : 0) * calm;
      if (tremble > 0) {
        this._clump.position.x += (Math.sin(this.time * 47) * 0.7 + Math.sin(this.time * 31 + 1.7) * 0.3) * tremble * 1.4;
        this._clump.position.z += Math.cos(this.time * 41 + 0.6) * tremble * 1.1;
      }
      // Expiry telegraph on the payload itself: inside ballTtlWarnS the flying
      // ball's rubble + veil shimmer loose — the katamari tells its own grave,
      // not just its fading ribbon and the HUD countdown.
      if (mirror.launchedId != null && phase !== 'holding') {
        const warnK = clamp01(1 - finite(mirror.ballTtlLeftS, 99) / Math.max(0.5, GYRE_SNARE.ballTtlWarnS));
        if (warnK > 0) {
          const shimmer = 0.5 + 0.5 * Math.sin(this.time * 26);
          this._veilMat.opacity += warnK * shimmer * 0.06 * flashCalm;
          this._clump.position.x += Math.sin(this.time * 43) * warnK * 0.35 * calm;
          this._clump.position.z += Math.cos(this.time * 37 + 1.2) * warnK * 0.35 * calm;
        }
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
          // Steer by the ball's LIVE velocity like the secondary ribbons do — a
          // ricocheted primary must streak along its new heading, not the frozen
          // launchDir it left on. At rest (or a pre-publish tick) fall back to
          // launchDir rather than the +X degenerate arrow.
          const vx = finite(mirror.ballVx), vz = finite(mirror.ballVz);
          const vl = Math.hypot(vx, vz);
          let dx, dz;
          if (vl > 1e-3) { dx = vx / vl; dz = vz / vl; }
          else {
            const dir = mirror.launchDir;
            const dl = Math.hypot(finite(dir && dir.x, 1), finite(dir && dir.z, 0)) || 1;
            dx = finite(dir && dir.x, 1) / dl; dz = finite(dir && dir.z, 0) / dl;
          }
          _t1 = {
            x: mirror.ballPos.x, z: mirror.ballPos.z, dx, dz,
            // vl rides the literal too — _drawTrail stall-hides and length-scales
            // off it, and dropping it pinned the primary's ribbon at the 6 wu stub
            // while a same-speed secondary drew the full streak.
            vl,
            r: finite(mirror.ballClumpRadius, this._clumpRadius),
            ttl01: mirror.ballTtl01, mass: mirror.ballMass,
            // The coil retracts the ribbon (wind), but the burst RE-GROWS it:
            // windup01 pins at 1.0 through the burst, so burst01 unwinds the
            // wind factor — the ball's first ~83 ms of flight isn't bare.
            alpha: 0.3,
            wind: finite(mirror.launchWindup01) * (1 - finite(mirror.launchBurst01)),
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
      const winding = phase === 'launching' && finite(mirror.launchBurst01) === 0;
      if (phase === 'holding' || winding) {
        const wind = winding ? clamp01(finite(mirror.launchWindup01)) : 0;
        const gL = this.toLocal(cx, cz, this._ballPt);
        const mL2 = this.toLocal(finite(mirror.maw && mirror.maw.x), finite(mirror.maw && mirror.maw.z), this._mawPt);
        if (winding && mirror.launchDir && mirror.nose) {
          // The glass pins to the FROZEN launchDir frame through the coil — anchor
          // the spoke's root on the drawn maw (nose + launchDir·len, len chasing
          // the ball's tail like the beam) or a mid-coil yaw detaches the line's
          // root from the mouth by tens of wu.
          const nL2 = this.toLocal(finite(mirror.nose.x), finite(mirror.nose.z), this._spokeN || (this._spokeN = { x: 0, z: 0 }));
          const dl = Math.hypot(finite(mirror.launchDir.x, 1), finite(mirror.launchDir.z, 0)) || 1;
          const dux = finite(mirror.launchDir.x, 1) / dl, duz = finite(mirror.launchDir.z, 0) / dl;
          const axial = (gL.x - nL2.x) * dux + (gL.z - nL2.z) * duz;
          const drawLen = Math.max(1, Math.hypot(mL2.x - nL2.x, mL2.z - nL2.z), axial);
          mL2.x = nL2.x + dux * drawLen;
          mL2.z = nL2.z + duz * drawLen;
        }
        const gx = gL.x - mL2.x, gz = gL.z - mL2.z;
        const gd = Math.max(1, Math.hypot(gx, gz));
        // Ride the same vertical bob as the clump's heart — a flat spoke at y=0.55
        // visibly separated from the ball's drift by up to 0.3 wu.
        this._grip.position.set(
          mL2.x + gx * 0.5,
          0.6 + Math.sin(this.time * 0.7 + finite(mirror.orbitSeed)) * 0.3 * calm,
          mL2.z + gz * 0.5,
        );
        this._grip.rotation.y = Math.atan2(-gz, gx);
        const strain = clamp01(finite(mirror.strain01));
        // Grip width flickers under strain — the spoke trembles with the held rubble.
        this._grip.scale.set(gd, 1, 2.2 * (1 + strain * 0.35 * Math.sin(this.time * 37) * calm) * (1 - wind * 0.45));
        this._gripMat.opacity = (0.14 + strain * 0.3 + this._discKick * 0.2 + wind * 0.4) * flashCalm;
        this._grip.visible = true;
      } else if (!this._closing && this._grip.visible) {
        this._grip.visible = false;
      }

      // Gravity halo while held: the suck radius drawn faintly around the ball so
      // "within a radius of the held mass" is legible space, not just pull behavior.
      // It dims out as the clump saturates — at cap the suck lane is disabled and the
      // ring would advertise a dead well.
      const capFade = Math.max(0, 1 - finite(mirror.clumpMass) / Math.max(1, finite(mirror.maxClumpMass, 1)));
      if (phase === 'holding' && capFade > 0.03) {
        // The drawn reach IS the sim's annulus — pub.suckRadius carries the
        // floor-banded, basin-capped formula so a data tuning edit can't desync
        // the ring from the pull it advertises (clumpRadius floor covers the
        // first-publish tick before the mirror fills).
        const suckR = finite(mirror.suckRadius, 0) || this._clumpRadius;
        this._halo.position.set(p.x, 0.42, p.z);
        this._halo.scale.setScalar(suckR * (1 + 0.035 * Math.sin(this.time * 1.7) * calm));
        this._haloMat.opacity = (0.1 + this._discKick * 0.12) * flashCalm * Math.min(1, capFade * 1.6);
        this._halo.visible = true;
      } else if (!this._closing && this._halo.visible) {
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
      if (want < have) { this._clearLumps(); for (let i = 0; i < want; i++) this._addLump(members[i], i, true); }
      // Grow-in: a fresh lump swells 0.45→1× over ~150 ms — katamari stick lands visibly.
      for (const l of this._lumps) {
        if (!l.used) continue;
        const g = Math.min(1, Math.max(0, (this.time - l.spawnT) / 0.15));
        // Hit-side squash: the gulp kick compresses lumps near the impact azimuth
        // (~20%) while the far side holds — the ball dents where it was struck
        // instead of shrinking uniformly.
        let sq = 1;
        if (this._moteKick > 0.01 && l.basePos) {
          const laS = Math.atan2(l.basePos.z, l.basePos.x);
          sq = 1 - 0.2 * this._moteKick * Math.max(0, Math.cos(laS - (this._gulpLocalA || 0)));
        }
        l.mesh.scale.setScalar(l.baseScale * ((l.spawnScale || 0.45) + (1 - (l.spawnScale || 0.45)) * g) * sq);
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
          // Absorb shiver: while the gulp kick is hot the whole ball jolts — each lump
          // rides outward along its own seat dir, weighted by angular proximity to the
          // side the meal hit. The katamari reacts where it was struck, not just grows.
          if (this._moteKick > 0.01) {
            const la = Math.atan2(l.basePos.z, l.basePos.x);
            const prox = 0.35 + 0.65 * Math.max(0, Math.cos(la - (this._gulpLocalA || 0)));
            const sh = this._moteKick * prox * l.baseScale * 0.35 * calm;
            l.mesh.position.x += Math.cos(la) * sh;
            l.mesh.position.z += Math.sin(la) * sh;
          }
          // Coil cinch: squash the rubble ALONG the throw line — the offset
          // component parallel to the local launch dir compresses while the
          // perpendicular bulges. Per-lump (not a group scale+rotation) so the
          // squash axis stays pinned to launchDir in world space at any tumble.
          if (this._coilLd) {
            const kP = 1 - 0.10 * wind; const kN = 1 + 0.07 * wind;
            const tp = l.mesh.position.x * this._coilLd.x + l.mesh.position.z * this._coilLd.z;
            l.mesh.position.x = this._coilLd.x * tp * kP + (l.mesh.position.x - this._coilLd.x * tp) * kN;
            l.mesh.position.z = this._coilLd.z * tp * kP + (l.mesh.position.z - this._coilLd.z * tp) * kN;
          }
        }
        // And it tumbles: a quiet per-lump yaw/roll drift (staggered at spawn) sells
        // levitating debris on large clumps where each lump is individually readable.
        l.mesh.rotation.y += sdt * l.tumbleRate * calm;
        l.mesh.rotation.x += sdt * l.tumbleRate * 0.6 * calm * Math.sin(l.tumblePhase);
      }
    }
    this._ballId = mirror.launchedId;

    // Secondary katamari overlay: the soonest-dying secondary ball wears a light
    // version of the rubble language — a veil + ≤6 lumps off the serialized
    // member slice the sim publishes on pub.balls[].members. Rebuilt only when
    // the tracked ball or its ledger size changes; rides the live branch AND the
    // "nothing held, secondaries still flying" branch alike.
    {
      const sb = mirror.balls && mirror.balls.length ? mirror.balls[0] : null;
      if (sb) this._secGraveT = null; // a fresh ball takes the slot — cancel the grave
      const sbm = sb && Array.isArray(sb.members) ? sb.members : null;
      if (sb && Number.isFinite(sb.x) && this.toLocal) {
        const lp = this.toLocal(sb.x, sb.z, this._ballPt);
        // String ids hash like the member-lump seed — finite(id)%7 folds every
        // non-numeric id to 0 and locksteps the bob phase across secondaries.
        // Computed BEFORE position.set — reading the previous ball's hash made
        // the first frame after a secondary swap bob on a stale phase.
        let sbh = 0;
        const sids = String(sb.id);
        for (let c2 = 0; c2 < sids.length; c2++) sbh = ((sbh * 31) + sids.charCodeAt(c2)) | 0;
        this._secIdHash = sbh;
        // Same loose-rubble drift as the primary clump — secondaries bob on the
        // group's own orbit-seeded phase, not flat at 0.6 like a HUD overlay.
        this._secGroup.position.set(lp.x,
          0.6 + Math.sin(this.time * 0.7 + (Math.abs(this._secIdHash) % 7)) * 0.3 * calm, lp.z);
        const ballR = Math.max(2.5, finite(sb.r, 8));
        this._secR = ballR; // grave scatter flings off this radius
        this._secVeil.scale.setScalar(ballR * 1.22);
        // Mass-graded like its siblings — a capped secondary katamari flies with
        // more than a pebble's whisper veil. And it telegraphs its quiet grave:
        // the same 0.55→1 sag the rumble envelope + HUD ·Ns keep inside
        // ballTtlWarnS — the drawn veil was the one lane that stayed flat.
        const secTtlWarn = clamp01(finite(sb.ttlS, 99) / Math.max(0.5, GYRE_SNARE.ballTtlWarnS));
        this._secVeilMat.opacity = (0.05 + 0.04 * Math.min(1, finite(sb.mass) / GYRE_SNARE.maxClumpMass)) * (0.55 + 0.45 * secTtlWarn) * flashCalm;
        // Rebuild key is (id, member-count): launch-meta members are FROZEN at
        // throw, so sbm.length only moves on a re-adopt — a live-members refactor
        // would silently never re-lay-out the lumps if this stayed id-only.
        if (this._secId !== sb.id || this._secN !== (sbm ? sbm.length : 0)) {
          this._secId = sb.id;
          this._secN = sbm ? sbm.length : 0;
          for (let i = 0; i < this._secLumps.length; i++) this._secLumps[i].visible = false;
          // Radius-graded: a capped 60 wu secondary still reads as a katamari
          // (~11 lumps) instead of the sparse 6 a pebble needs — bounded at 12.
          const n = Math.min(this._secN, Math.min(12, 4 + Math.floor(this._secR / 8)));
          for (let i = 0; i < n; i++) {
            const member = sbm[i];
            let lm = this._secLumps[i];
            if (!lm) {
              lm = new THREE.Mesh(
                jitterGeometry(new THREE.IcosahedronGeometry(1, 1), 0.28, 53 + i * 7919));
              this._secLumps.push(lm);
              this._secGroup.add(lm);
            }
            lm.material = this._lumpMaterial(member.type);
            // Same compaction language as the primary lumps — chunks scale with
            // the ball so a capped secondary still carpets its own shell.
            const r = Math.max(0.35, finite(member.radius, 2) * 0.62)
              * Math.min(3, Math.max(1, ballR / 14));
            lm.scale.setScalar(r);
            const spread = Math.max(0, ballR - r * 0.45);
            lm.position.set(
              finite(member.nx, 0) * spread,
              ((i * 0.61803398875) % 1 - 0.5) * r * 1.1,
              finite(member.nz, 0) * spread);
            // Levitating bob like the primary's lumps — seat + amplitude pinned at
            // build time so the sway never drifts the rubble apart over a flight.
            lm.userData.baseY = lm.position.y;
            lm.userData.bobAmp = r * 0.15;
            lm.visible = true;
          }
        }
        // The whole group tumbles like the primary's rubble — levitating debris,
        // not a rigid wheel — and each lump drifts on its own index-seeded axes
        // so the rubble doesn't rotate as one body (frozen under reduced-motion).
        // The group's tumble grades by THIS ball's speed like the primary's — a
        // ricochet-stalled secondary barely spins; a clean bowl keeps pace.
        const sbv = Math.hypot(finite(sb.vx), finite(sb.vz));
        this._secGroup.rotation.y += sdt * 2.6 * Math.max(0.15, Math.min(1, sbv / (GYRE_SNARE.launchSpeed || 520))) * calm;
        for (let i = 0; i < this._secLumps.length; i++) {
          if (!this._secLumps[i].visible) continue;
          const lm = this._secLumps[i];
          lm.rotation.y += sdt * (0.35 + i * 0.17) * calm;
          lm.rotation.x += sdt * (0.21 + i * 0.11) * calm;
          if (lm.userData.baseY !== undefined) {
            // Per-lump bob rate like the primary's (golden-ratio spread) — the
            // overlay rubble shouldn't bob in lockstep on a 6-lump read either.
            lm.position.y = lm.userData.baseY
              + Math.sin(this.time * (1.9 + ((i * 0.61803398875) % 1) * 0.8) + i * 1.7)
                * (lm.userData.bobAmp || 0) * calm;
          }
        }
        this._secGroup.visible = true;
      } else if (this._secGroup.visible && this._secGraveT == null) {
        // Same grave language as the primary clump: a brief scatter before the
        // de-rez — a second katamari shouldn't vanish the frame its ring blooms.
        this._secGraveT = 0.15;
        for (const lm of this._secLumps) {
          const bl = Math.hypot(lm.position.x, lm.position.z) || 1;
          lm.userData.scatX = lm.position.x / bl;
          lm.userData.scatZ = lm.position.z / bl;
        }
      }
      // Secondary grave scatter — decays independent of whether a new ball
      // replaced the slot (a fresh sb cancels it via the branch above).
      if (this._secGraveT != null) {
        this._secGraveT -= sdt;
        // Same formula as the primary's _scatterLumps — one grave language.
        const fling = Math.max(16, finite(this._secR, 8) * 1.3) / 0.15;
        for (const lm of this._secLumps) {
          lm.position.x += (lm.userData.scatX || 0) * fling * sdt;
          lm.position.y += 1.5 * sdt;
          lm.position.z += (lm.userData.scatZ || 0) * fling * sdt;
          lm.scale.multiplyScalar(Math.exp(-sdt * 4));
        }
        this._secVeilMat.opacity *= Math.exp(-sdt * 12);
        if (this._secGraveT <= 0) {
          this._secGraveT = null;
          this._secGroup.visible = false;
          this._secId = null;
        }
      }
    }

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
        this._fireBurst(fx, fz, Math.max(6, finite(mirror.clumpRadius, 8) * 1.1), flashCalm, null, 1.1);
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
      this._launchKick = 1; // the freed ball's veil surges armed for ~0.7 s
      const bx = mirror.ballPos ? finite(mirror.ballPos.x) : finite(mirror.corePos && mirror.corePos.x);
      const bz = mirror.ballPos ? finite(mirror.ballPos.z) : finite(mirror.corePos && mirror.corePos.z);
      const br = Math.max(6, finite(mirror.ballClumpRadius, finite(mirror.clumpRadius, 8)) * 2.2);
      this._fireBurst(bx, bz, br, flashCalm, mirror.launchDir, 1.1);
      this._coneMat.uniforms.uPulse.value = 1;
    }

    // ── bursts ───────────────────────────────────────────────────────────────
    for (const b of this._bursts) {
      if (b.t >= 1) { if (b.mesh.visible) b.mesh.visible = false; continue; }
      b.t = Math.min(1, b.t + sdt * (b.rate || 1.7));
      const s = b.r * (0.25 + b.t * 1.6);
      b.mesh.scale.set(s * (b.stretch || 1), s, 1);
      b.mesh.material.uniforms.uT.value = b.t;
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.scene.remove(this._beam, this._clump, this._trail, this._trail2, this._grip, this._halo, this._basinHalo, this._secGroup);
    this._secVeil.geometry.dispose(); this._secVeilMat.dispose();
    for (const m of this._secLumps) m.geometry.dispose(); // lump MATERIALS stay shared via _lumpMats
    this._halo.geometry.dispose(); this._haloMat.dispose();
    this._basinHaloMat.dispose(); // shares haloGeo (disposed on the line above)
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
    if (this._glints) {
      for (const g of this._glints) { g.mesh.geometry.dispose(); g.mesh.material.dispose(); }
    }
  }
}
