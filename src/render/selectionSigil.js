// src/render/selectionSigil.js — the ORRERY selection sigil.
//
// The action-RPG "this one" marker, as a SpaceFace instrument. INF-045's flat ring said *where* the
// lock is, never what the game thought of it, and a thin torus at 1.18x hull radius reads as debug
// chrome the moment a fight gets busy. This is the successor: a ground-plane astrolabe deck, drawn
// entirely from light, that assembles itself onto a subject and then keeps working.
//
// WHY A SINGLE QUAD AND NOT GEOMETRY. Every element here is an analytic 2D shape in the flight
// plane: rings, arc segments, a graduated scale, radial hairlines, regular polygons, L-brackets.
// A tessellated version would need thousands of vertices to stay crisp at a chase camera and would
// still alias. An SDF fragment program is exact at every zoom, costs one draw call, and — because
// edges antialias against screen derivatives rather than a fixed pixel width — the hairline scale
// keeps its designed weight whether the target is a hull filling the screen or a distant speck.
// This is the same argument the force-surface language makes, applied to a flat object.
//
// WHY IT IS NOT A SOFT CARD. It is a world-space object lying in the flight plane, not a
// camera-facing quad, and it is not a card: there is no radial-alpha blob standing in for the
// object. The wash under the instrument is a designed pool with a crisp inner rim, and every other
// layer is a hard-edged analytic figure.
//
// LAYERING (outermost first). Brackets sit outside a graduated bezel rail; the rail carries a
// 96-division scale and a travelling index arm; two counter-rotating arc cages turn inside it; a
// 48/49 vernier pair beats against itself; the class emblem holds the centre. No two layers share a
// radius band, so nothing z-fights and the eye reads depth from the ordering alone.
//
// CLASS IS SHAPE FIRST, TINT SECOND. hostile/friendly/cargo are three different emblems, so the
// marker is legible in greyscale, under any colour-vision, and to a player who never looks at the
// HUD bracket. Tint reinforces; it never carries the information alone. The class reuses
// `targetBracketShape`, so the world sigil and the DOM lock bracket cannot disagree.
//
// ACCESSIBILITY. `motionReduce` pins every phase to zero and completes the assembly instantly: the
// fully-arranged instrument is strictly MORE information than the animated one, so reduced motion
// loses nothing but movement. `flashReduce` drops hot-core radiance and the travelling acquire
// ring while leaving every figure at full strength. Nothing here dims as an animation channel
// (VFX standard B17): arrival and departure are structural — the layers draw themselves outward
// from the centre and retract inward again.

import * as THREE from 'three';

import { isHostileToPlayer } from '../systems/scanner.js';
// Pure, DOM-free, Three-free policy. The render layer borrowing it is deliberate: the three-way
// classification already has one owner, and a second copy in src/render is how the HUD bracket and
// the world marker slowly start telling the player different stories.
import { targetBracketShape } from '../ui/targetBracket.js';
import { resolveTargetContourEntity } from './targetContour.js';
import { resolveVfxAccessibilityProfile } from './vfxAccessibility.js';


export const SELECTION_SIGIL_RENDER_ORDER = 18;
export const SELECTION_SIGIL_LIFT = 0.5;

/**
 * Radius fit. The instrument is authored in normalized plane units and scaled to the body, so the
 * fit is a fixed multiple rather than slope+bias: that keeps the whole layout scale-invariant,
 * which is why one shader serves a cargo pod and a capital hull. The flat multiple is also what
 * the shader's uHull contract assumes — the marked hull's edge always lands at the same fraction of
 * the instrument, so the socket rim is always exactly on the silhouette.
 */
export const SIGIL_RADIUS_SCALE = 3.0;
export const SIGIL_RADIUS_MIN = 6;
export const SIGIL_RADIUS_MAX = 170;

/** Departure is a structural reverse of the arrival order, not a dissolve. */
export const SIGIL_RETRACT_SECONDS = 0.34;

export const SIGIL_CLASS = Object.freeze({
  HOSTILE: 'hostile',
  FRIENDLY: 'friendly',
  CARGO: 'cargo',
});

const CLASS_CODE = Object.freeze({ hostile: 0, friendly: 1, cargo: 2 });

const PALETTE = Object.freeze({
  hostile: Object.freeze({ primary: 0xff4a5c, secondary: 0xffa24a }),
  friendly: Object.freeze({ primary: 0x62d2ff, secondary: 0xc9f4ff }),
  cargo: Object.freeze({ primary: 0xffc24d, secondary: 0x74ffb4 }),
});

// A hitch must not teleport the instrument through its own assembly.
const MAX_STEP_SECONDS = 0.1;
const TINT_TAU_SECONDS = 0.09;
// The vernier pointer's mechanism: hold at the mark, snap past it, rock back, hold again.
const VERNIER_DETENTS = 24;
const VERNIER_HOLD_SECONDS = 0.40;
const VERNIER_MOVE_SECONDS = 0.22;

const _primaryTo = new THREE.Color();
const _secondaryTo = new THREE.Color();

/**
 * Classify a subject for the sigil. Shares the HUD's shape policy verbatim.
 * @returns {string} one of SIGIL_CLASS.
 */
export function classifySelectionSubject(entity, hostile) {
  const shape = targetBracketShape(entity, !!hostile);
  return shape === 'bracket-hostile' ? SIGIL_CLASS.HOSTILE
    : shape === 'bracket-cargo' ? SIGIL_CLASS.CARGO
      : SIGIL_CLASS.FRIENDLY;
}

/**
 * The subject rule is INF-045's, unchanged: the live SELECTION wins, and the engaged gun target
 * only subjects when there is no live selection, so the guns never fire at a ship with no mark
 * anywhere. `targetContour.js` owns that rule; this adds the class the emblem and palette need.
 *
 * @returns {{id, x, z, radius, klass}|null} world-space subject, or null when unmarked.
 */
export function resolveSelectionSigil(state) {
  const subject = resolveTargetContourEntity(state);
  if (!subject || !subject.pos) return null;
  const player = (state && state.player) || null;
  return {
    id: subject.id,
    x: subject.pos.x,
    z: subject.pos.z,
    radius: Math.max(2, Number(subject.radius) || 6),
    klass: classifySelectionSubject(subject, isHostileToPlayer(subject, player && player.team, state)),
  };
}

export function sigilRadius(entityRadius) {
  const raw = Number(entityRadius);
  const base = Number.isFinite(raw) && raw > 0 ? raw : 6;
  return Math.min(SIGIL_RADIUS_MAX, Math.max(SIGIL_RADIUS_MIN, base * SIGIL_RADIUS_SCALE));
}

const SIGIL_VERT = /* glsl */`
varying vec2 vP;
void main() {
  vP = position.xz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// `uPhase` carries every animated angle pre-multiplied by motion, so reduced motion is one
// uniform collapsing to zero rather than a dozen branches. `uAge`/`uInstant`/`uRetract` drive the
// structural arrival and departure.
const SIGIL_FRAG = /* glsl */`
precision highp float;
varying vec2 vP;

uniform vec3  uPrimary;
uniform vec3  uSecondary;
uniform float uKlass;
uniform float uPhase;   // packed angle, already scaled by motion
uniform float uStepped; // vernier index angle, already scaled by motion
uniform float uAge;     // seconds since this subject became the subject
uniform float uInstant; // 1.0 under reduced motion: fully arrived, never animating
uniform float uRetract; // 1 held, falling to 0 as the instrument folds itself away
uniform float uFlash;   // 1 normal, lower under flashReduce
uniform float uHull;    // the marked hull's edge, as a fraction of the instrument radius
uniform float uGain;
uniform float uMask;    // debug: 0 = every layer, else a bitmask of layers to draw

const float TAU = 6.28318530718;
const float PI = 3.14159265359;
float gpx;

// One pixel measured in plane units. Derived from the position gradient rather than fwidth(r),
// which is singular at the centre where the emblem lives.
float gPixel(vec2 p) { return max(length(dFdx(p)), length(dFdy(p))) * 0.75 + 1e-6; }

// Squared, NOT pow(x, 2.0): pow is UNDEFINED in GLSL for a negative base, and every falloff in
// this program is centred on a value the point can be on either side of. On ANGLE/SwiftShader a
// single undefined pow returns NaN, and one NaN term poisons the whole additive accumulator — the
// instrument then renders as one flat saturated plate with its line work barely visible inside it.
float sq(float v) { return v * v; }

// Layer mask. 0 means "draw everything"; otherwise only the set bits draw. Used to bisect which
// figure is responsible for a pixel when the composed picture disagrees with the arithmetic.
float on(float bit) { return uMask < 0.5 ? 1.0 : mod(floor(uMask / bit), 2.0); }

float stroke(float d, float w) { return 1.0 - smoothstep(max(w - gpx, 0.0), w + gpx, d); }
float band(float x, float lo, float hi) {
  return smoothstep(lo - gpx, lo + gpx, x) * (1.0 - smoothstep(hi - gpx, hi + gpx, x));
}

// A graduated scale cut into a ring: N divisions, every 8th one long.
float graduations(float r, float a, float R, float count, float minors, float majors, float w) {
  float seg = TAU / count;
  float u = a / seg;
  float k = floor(u + 0.5);
  float du = abs(u - k) * seg * r;
  float len = mix(minors, majors, 1.0 - step(0.5, abs(mod(k, 8.0))));
  return stroke(du, w) * smoothstep(R - len - gpx, R - len + gpx * 2.0, r)
                     * (1.0 - smoothstep(R - 0.012, R, r));
}

// N arc segments of equal sweep, folded with one modulo instead of N angle tests.
// "half" is a reserved word in GLSL ES, which is why the sweep is called halfSpan.
float arcs(float r, float s, float n, float halfSpan, float R, float w) {
  float seg = TAU / n;
  float t = mod(s + seg * 0.5, seg) - seg * 0.5;
  return stroke(abs(r - R), w) * (1.0 - smoothstep(halfSpan * r - gpx, halfSpan * r + gpx, abs(t) * r));
}

// Radial hairlines: a starburst, a rosette's spokes, a burst ring.
float spokes(float r, float s, float n, float r0, float r1, float w) {
  float seg = TAU / n;
  float t = mod(s + seg * 0.5, seg) - seg * 0.5;
  return stroke(abs(t) * r, w) * band(r, r0, r1);
}

// Exact distance to the boundary of a regular n-gon of circumradius R, rotated by theta.
// Vertex caps included, so a pointed triangle is actually pointed.
float polyEdge(vec2 p, float a, float R, float n, float theta) {
  float seg = TAU / n;
  float k = floor((a - theta) / seg + 0.5);
  float ac = k * seg + theta;
  vec2 nrm = vec2(cos(ac), sin(ac));
  vec2 tng = vec2(-nrm.y, nrm.x);
  float ch = cos(seg * 0.5);
  float sh = sin(seg * 0.5);
  return min(abs(dot(p, nrm) - R * ch),
         min(length(p - R * (nrm * ch - tng * sh)),
             length(p - R * (nrm * ch + tng * sh))));
}

// A radial hairline at an absolute angle, measured as arc length so one pixel width fits it.
float ray(float r, float a, float angle, float r0, float r1, float w) {
  return stroke(abs(mod(a - angle + PI, TAU) - PI) * r, w) * band(r, r0, r1);
}

// Structural arrival and departure. Each layer owns a front that sweeps out from the centre on
// acquire and back in on release, offset by its own delay so the instrument draws itself in a
// designed order rather than one uniform expansion. Both terms run 0 (folded) to 1 (arrived); the
// lower front wins, so a layer is only as far out as the slower of the two.
float frontOf(float delay, float dur) {
  if (uInstant > 0.5) return 1.30;
  float arrive = smoothstep(delay, delay + dur, uAge);
  // At rest (uRetract == 1) this must be 1, not 0: the instrument is ARRIVED. It falls as uRetract
  // drops, and the per-layer delay staggers which bands go first, so release un-draws inward.
  float depart = 1.0 - smoothstep(0.0, 0.42, (1.0 - uRetract) * 1.35 - delay * 1.90);
  return min(arrive, depart) * 1.30;
}
// Presence gate for a layer front, plus the hot leading edge the front paints while it travels.
// Written as 1 - smoothstep(lo, hi, r) with lo < hi: smoothstep is UNDEFINED when edge0 >= edge1,
// and the natural-looking 'smoothstep(f + w, f - w, r)' is exactly that reversed form. On ANGLE it
// returned a value that leaked the emblem's penumbra across the whole plane as a flat plate.
float gate(float r, float f) { return 1.0 - smoothstep(f - 0.045, f + 0.045, r); }
float lead(float r, float f) { float d = (r - f) / 0.020; return exp(-sq(d)) * uFlash; }


void main() {
  gpx = gPixel(vP);
  vec2 p = vP;
  float r = length(p);
  float a = atan(p.y, p.x);

  float fWash    = frontOf(0.00, 0.42);
  float fEmblem  = frontOf(0.07, 0.44);
  float fCage    = frontOf(0.13, 0.40);
  float fRail    = frontOf(0.17, 0.42);
  float fVernier = frontOf(0.21, 0.36);
  float fIndex   = frontOf(0.28, 0.40);
  float fBracket = frontOf(0.34, 0.38);

  // One packed phase drives every rotor. Packed angles share a base so nothing can drift out of the
  // relationship the design intends: index leads, cages counter, emblem barely creeps, vernier beats.
  float ph = uPhase;
  float aIndex  = ph;
  float aCageA  = ph * 0.70;
  float aCageB  = -ph * 1.28;
  float aEmblem = ph * 0.202;
  float aVern   = ph * 1.85;
  float breath  = 1.0 + 0.030 * sin(ph * 3.307);

  vec3 L = vec3(0.0);

  // -- ground bed ---------------------------------------------------------------------------------
  // A TIGHT halo hugging each crisp line, not a field. A first pass filled a wide disc and the
  // result was a flat saturated plate that buried the ship, the graduations and the emblem under
  // one dead colour — the exact "flat and plain" failure the VFX standard bans. Light has to
  // BELONG to a line here; the gaussian is a supporting term around crisp geometry, never the
  // object's own edge and never a fill.
  L += uPrimary * (0.13 * exp(-sq((r - 0.860) / 0.030))
                 + 0.10 * exp(-sq((r - uHull * 1.02) / 0.026))) * gate(r, fWash) * on(1.0);

  // The socket rim: a hard hairline drawn exactly on the marked hull's own silhouette. This is the
  // contact between instrument and body, and the only line here that has to be exact.
  L += uPrimary * stroke(abs(r - uHull * 1.02), 0.0065) * gate(r, fWash) * 1.15 * on(1.0);

  // -- class emblem -------------------------------------------------------------------------------
  // Three emblems, one per class, each a different figure, so the marker reads without colour.
  float emblem = 0.0;
  if (uKlass < 0.5) {
    // Hostile: a hexagram — two interlocking triangles — inside a twelve-point burst.
    emblem = max(polyEdge(p, a, 0.415, 3.0, 0.0), polyEdge(p, a, 0.415, 3.0, PI / 3.0));
    emblem = max(emblem, spokes(r, a - aEmblem, 12.0, 0.345, 0.400, 0.0055) * 0.80);
  } else if (uKlass < 1.5) {
    // Friendly: a hexagon rosette — hexagon, six spokes, and a closed hub hexagon.
    emblem = polyEdge(p, a, 0.420, 6.0, aEmblem);
    emblem = max(emblem, spokes(r, a - aEmblem, 6.0, 0.350, 0.395, 0.0050) * 0.85);
    emblem = max(emblem, polyEdge(p, a, 0.375, 6.0, -aEmblem) * 0.85);
  } else {
    // Cargo: two squares at 45 degrees — an eight-point star — around a smaller square hub.
    emblem = max(polyEdge(p, a, 0.420, 4.0, aEmblem), polyEdge(p, a, 0.420, 4.0, aEmblem + PI / 4.0));
    emblem = max(emblem, polyEdge(p, a, 0.375, 4.0, aEmblem) * 0.80);
  }
  // The emblem is the instrument's focal point and the hottest thing in it: the eye must land on the
  // shape before it reads any of the graduations.
  float ge = gate(r, fEmblem);
  L += uPrimary * emblem * ge * (2.60 * uFlash + 0.80) * on(2.0);
  L += uPrimary * lead(r, fEmblem) * 0.90;

  // -- arc cages ----------------------------------------------------------------------------------
  float cage = max(arcs(r, a - aCageA, 3.0, 0.646, 0.730, 0.0058),
                   arcs(r, a - aCageB, 3.0, 0.400, 0.628, 0.0044) * 0.70);
  float gc = gate(r, fCage);
  L += uSecondary * cage * gc * 0.92 * on(4.0);
  L += uSecondary * lead(r, fCage) * 0.50;

  // -- vernier pair -------------------------------------------------------------------------------
  // Two graduated combs, 48 and 49, drifting against each other. They fall into alignment once
  // every ~49 s and slide apart again: a real measuring instrument, and the one motion here the
  // player can never predict, which is what keeps a static-looking instrument alive.
  float vern = max(graduations(r, a, 0.556, 48.0, 0.026, 0.050, 0.0020),
                   graduations(r, a - aVern, 0.556, 49.0, 0.026, 0.050, 0.0020) * 0.72);
  float gv = gate(r, fVernier);
  L += uSecondary * vern * gv * 0.80 * on(8.0);
  L += uPrimary * ray(r, a, uStepped, 0.470, 0.585, 0.011) * gv * 1.25;
  L += uPrimary * stroke(abs(r - 0.470), 0.006) * 0.55 * gv;

  // -- bezel rail, 96-division scale, travelling index arm ------------------------------------------
  float gr = gate(r, fRail);
  L += uPrimary * (stroke(abs(r - 0.860), 0.0050) * 1.30
                 + graduations(r, a, 0.860, 96.0, 0.030, 0.062, 0.0022) * 0.85) * gr * on(16.0);
  L += uPrimary * lead(r, fRail) * 0.70;

  float gi = gate(r, fIndex);
  // Two fainter arms trailing the index, so it reads as travelling rather than parked.
  float arm = ray(r, a, aIndex, 0.700, 0.905, 0.0095);
  float trail = ray(r, a, aIndex - 0.115, 0.760, 0.860, 0.0050) * 0.42
              + ray(r, a, aIndex - 0.215, 0.800, 0.860, 0.0040) * 0.24;
  float pip = 1.0 - smoothstep(0.030 - gpx, 0.030 + gpx, length(p - vec2(cos(aIndex), sin(aIndex)) * 0.905));
  L += uPrimary * (arm * 1.55 + trail * 0.90 + pip * 1.90) * gi * uFlash;

  // -- corner brackets ----------------------------------------------------------------------------
  // Folded into one quadrant with a modulo, so four L-brackets cost one evaluation.
  float seg = TAU / 4.0;
  float tq = mod(a + seg * 0.5, seg) - seg * 0.5;
  float qx = r * cos(tq) * breath;
  float qy = r * sin(tq) * breath;
  float br = max(stroke(abs(abs(qy) - 0.020), 0.0080) * band(qx, 0.790, 0.945),
                 stroke(abs(abs(qx) - 0.945), 0.0080) * band(qy, 0.790, 0.945));
  L += uPrimary * br * gate(r, fBracket) * 1.20 * on(32.0);

  // -- travelling acquire ring --------------------------------------------------------------------
  // A structure that expands and dies, not an opacity ramp: the one moment the instrument is
  // explicitly locking on. Suppressed under reduced motion and softened under flashReduce.
  if (uInstant < 0.5 && uAge < 0.55) {
    float e = clamp(uAge / 0.46, 0.0, 1.0);
    float rr = mix(0.10, 1.01, 1.0 - pow(1.0 - e, 2.4));
    L += uPrimary * stroke(abs(r - rr), 0.014) * sin(PI * e) * 1.10 * uFlash;
  }

  // Outside the inscribed circle the plane is empty space. Cut it so the quad's corners cost
  // nothing and the instrument can never show a square edge at any zoom.
  if (r > 0.995) discard;
  // Diagnostic taps (uMask > 90): show one intermediate as greyscale so a composed picture that
  // disagrees with the arithmetic can be attributed instead of argued about.
  if (uMask > 90.5) {
    float v = 0.0;
    if (uMask < 91.5) v = gpx * 60.0;                 // 91: pixel footprint in plane units
    else if (uMask < 92.5) v = emblem;                 // 92: the class figure
    else if (uMask < 93.5) v = ge;                    // 93: the emblem's presence gate
    else if (uMask < 94.5) v = polyEdge(p, a, 0.415, 3.0, 0.0) * 4.0;   // 94: raw polygon edge distance
    else if (uMask < 95.5) v = spokes(r, a, 12.0, 0.345, 0.400, 0.0055); // 95: the burst spokes
    else v = stroke(abs(r - 0.860), 0.0050) * 2.0;     // 96: one rail stroke, as a control
    gl_FragColor = vec4(vec3(v), 1.0);
    return;
  }
  gl_FragColor = vec4(L * uGain, 1.0);
}
`;


export class SelectionSigil {
  constructor(scene = null) {
    const geometry = new THREE.PlaneGeometry(2, 2, 1, 1);
    geometry.rotateX(-Math.PI / 2);
    const material = new THREE.ShaderMaterial({
      name: 'sf-selection-sigil',
      uniforms: {
        uPrimary: { value: new THREE.Color(PALETTE.friendly.primary) },
        uSecondary: { value: new THREE.Color(PALETTE.friendly.secondary) },
        uKlass: { value: CLASS_CODE.friendly },
        uPhase: { value: 0 },
        uStepped: { value: 0 },
        uAge: { value: 1 },
        uInstant: { value: 0 },
        uRetract: { value: 1 },
        uFlash: { value: 1 },
        uHull: { value: 1 / SIGIL_RADIUS_SCALE },
        uMask: { value: 0 },
        uGain: { value: 1 },
      },
      vertexShader: SIGIL_VERT,
      fragmentShader: SIGIL_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      // rtScene is linear HDR and a raw ShaderMaterial never receives three's tonemapping chunk,
      // so this program writes linear radiance deliberately: the rails sit near 1.0 and the hot
      // figures run past 2.0, which is what the selective bright-pass feeds on. Nothing is clamped
      // flat, and nothing is authored as a flat bright sticker either.
      toneMapped: false,
    });
    // A planar additive surface cannot contribute from a back-face pass. See planarAdditivePolicy.
    material.forceSinglePass = true;

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'sf-selection-sigil';
    mesh.frustumCulled = false;
    mesh.renderOrder = SELECTION_SIGIL_RENDER_ORDER;
    mesh.visible = false;
    if (scene && typeof scene.add === 'function') scene.add(mesh);

    this.mesh = mesh;
    this._u = material.uniforms;
    this._x = 0;
    this._z = 0;
    this._radius = 0;
    this._id = null;
    this._klass = SIGIL_CLASS.FRIENDLY;
    this._tintTarget = null;
    this._tintSettled = false;
    this._clock = 0;
    this._age = 0;
    this._retract = 1;
    this._vernierHold = 0;
    this._vernierMove = 1;
    this._vernierIndex = 0;
    this._accessibilityId = '';
    this._disposed = false;
  }

  _applyAccessibility(settings) {
    const profile = resolveVfxAccessibilityProfile(settings);
    if (profile.id === this._accessibilityId) return;
    this._accessibilityId = profile.id;
    const reducedMotion = profile.id === 'reduced-motion' || profile.id === 'reduced-motion-and-flash';
    this._u.uInstant.value = reducedMotion ? 1 : 0;
    // flashOpacityScale is the shared authored answer for "this much less radiance". Identity —
    // every figure, every graduation, the whole emblem — is untouched by it.
    this._u.uFlash.value = profile.flashOpacityScale;
  }

  _tint(klass, dt) {
    const palette = PALETTE[klass] || PALETTE[SIGIL_CLASS.FRIENDLY];
    this._u.uKlass.value = CLASS_CODE[klass] != null ? CLASS_CODE[klass] : CLASS_CODE.friendly;
    // The authored class is true the moment it is handed over; only the PALETTE eases. Diagnostics
    // and the emblem branch must never lag a frame behind what the player is actually locked on.
    this._klass = klass;
    if (this._tintTarget === klass && this._tintSettled) return;
    _primaryTo.set(palette.primary);
    _secondaryTo.set(palette.secondary);
    this._tintTarget = klass;
    if (dt <= 0) {
      this._u.uPrimary.value.copy(_primaryTo);
      this._u.uSecondary.value.copy(_secondaryTo);
      this._tintSettled = true;
      return;
    }
    // Exponential ease ONTO the palette, with k derived from dt so the move takes the same wall
    // time at 30 fps and 144 fps. Interpolating from a one-time snapshot instead is the trap: with
    // a fixed from, a fixed to and a fixed k, lerp returns one constant intermediate colour every
    // frame and the tint stalls one step from the target forever.
    const k = 1 - Math.exp(-dt / TINT_TAU_SECONDS);
    this._u.uPrimary.value.lerp(_primaryTo, k);
    this._u.uSecondary.value.lerp(_secondaryTo, k);
    this._tintSettled = Math.max(
      Math.abs(this._u.uPrimary.value.r - _primaryTo.r),
      Math.abs(this._u.uSecondary.value.g - _secondaryTo.g),
    ) < 1 / 255;
  }

  // The vernier pointer's mechanism. It holds at a mark, snaps one detent past it with a mechanical
  // overshoot, rocks back, and holds again — the instrument has a moving part, not only rotors.
  _stepVernier(dt) {
    const detent = (Math.PI * 2) / VERNIER_DETENTS;
    if (this._u.uInstant.value > 0.5) {
      this._u.uStepped.value = this._vernierIndex * detent;
      return;
    }
    this._vernierHold += dt;
    if (this._vernierHold >= VERNIER_HOLD_SECONDS) {
      this._vernierHold -= VERNIER_HOLD_SECONDS;
      this._vernierIndex = (this._vernierIndex + 1) % VERNIER_DETENTS;
      this._vernierMove = 0;
    }
    if (this._vernierMove < 1) {
      this._vernierMove = Math.min(1, this._vernierMove + dt / VERNIER_MOVE_SECONDS);
      const x = this._vernierMove - 1;
      const c1 = 1.70158;
      const c3 = c1 + 1;
      const eased = 1 + c3 * x * x * x + c1 * x * x;
      this._u.uStepped.value = (this._vernierIndex - 1) * detent + eased * detent;
    }
  }


  /**
   * Track a subject. Called every frame it exists, so it also advances the instrument's clock.
   * @param {{id:*, radius:number, klass:string}} subject resolved by resolveSelectionSigil.
   * @param {number} x local-frame X (the caller keeps its own rebase scratch).
   * @param {number} z local-frame Z.
   * @param {number} dt presentation-frame seconds.
   * @param {object|null} settings game settings, for the shared accessibility profile.
   * @returns {boolean} false when the mark is refused (bad fix, or disposed).
   */
  setSubject(subject, x, z, dt = 0, settings = null) {
    if (this._disposed || !this.mesh) return false;
    if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
    const step = Math.min(Math.max(Number(dt) || 0, 0), MAX_STEP_SECONDS);
    const klass = subject && (subject.klass === SIGIL_CLASS.HOSTILE || subject.klass === SIGIL_CLASS.CARGO)
      ? subject.klass
      : SIGIL_CLASS.FRIENDLY;

    this._applyAccessibility(settings);
    // A new subject re-runs the whole arrival. The instrument is born on the new body rather than
    // sliding across the sector, so a retarget reads as a fresh acquisition, not a teleport.
    if (!subject || subject.id !== this._id) {
      this._age = 0;
      this._vernierHold = 0;
      this._vernierMove = 1;
    }
    this._retract = 1;
    this._clock += step;
    this._age += step;

    const radius = sigilRadius(subject && subject.radius);
    this._id = subject ? subject.id : null;
    this._x = x;
    this._z = z;
    this._radius = radius;
    this.mesh.position.set(x, SELECTION_SIGIL_LIFT, z);
    this.mesh.scale.set(radius, 1, radius);
    this._tint(klass, step);

    this._u.uPhase.value = this._clock * 0.62;
    this._u.uAge.value = this._age;
    this._u.uRetract.value = 1;
    this._stepVernier(step);
    this.mesh.visible = true;
    return true;
  }

  /**
   * Begin (or continue) folding the instrument away. Structural, not a dissolve: each layer's
   * front runs back inward in the reverse of its arrival, then the mesh is hidden outright.
   */
  clear(dt = 0, settings = null) {
    if (this._disposed || !this.mesh || !this.mesh.visible) return;
    this._applyAccessibility(settings);
    const step = Math.min(Math.max(Number(dt) || 0, 0), MAX_STEP_SECONDS);
    // Reduced motion reaches every state instantly. A fold nothing can see is just a delayed
    // disappearance, so the mark goes now.
    if (this._u.uInstant.value > 0.5 || step <= 0) {
      this._retract = 1;
      this._id = null;
      this._age = 0;
      this.mesh.visible = false;
      return;
    }
    this._retract -= step / SIGIL_RETRACT_SECONDS;
    if (this._retract <= 0) {
      this._retract = 1;
      this._id = null;
      this._age = 0;
      this.mesh.visible = false;
      return;
    }
    this._clock += step;
    this._u.uPhase.value = this._clock * 0.62;
    this._u.uAge.value = this._age;
    this._u.uRetract.value = this._retract;
    this._stepVernier(step);
  }

  /** World rebase: the local frame moved under the marker; keep it on the same body. */
  reproject(dx, dz) {
    if (this._disposed || !this.mesh) return;
    if (!dx && !dz) return;
    this._x += dx;
    this._z += dz;
    this.mesh.position.x = this._x;
    this.mesh.position.z = this._z;
  }

  inspect() {
    return {
      schema: 'spaceface.selection-sigil.v1',
      visible: !!(this.mesh && this.mesh.visible),
      renderOrder: this.mesh ? this.mesh.renderOrder : null,
      klass: this._klass,
      radius: this._radius,
      x: this._x,
      z: this._z,
    };
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    if (this.mesh) {
      this.mesh.removeFromParent();
      if (this.mesh.geometry) this.mesh.geometry.dispose();
      if (this.mesh.material) this.mesh.material.dispose();
      this.mesh = null;
    }
    this._u = null;
  }
}
