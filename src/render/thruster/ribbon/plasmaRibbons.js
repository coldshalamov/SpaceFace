/**
 * The player drive PLUME. Nozzle-local, about two hull lengths long, and internally animated.
 *
 * WHAT THIS IS NOT, AND WHY
 * ------------------------
 * Four earlier constructions were rejected here. The first two failed on their rendering primitive:
 *
 *   1. Camera-facing sheets — a translucent cone carrying a scrolling stripe texture, plus spark
 *      cards. A flat card has no interior, so strands that pass in front of each other cannot exist
 *      in it (ban B3).
 *   2. Isotropic volumetric raymarching — integrating a smooth density field per pixel can only
 *      produce soft shoulders, which reads as smoke (ban B12).
 *
 * The next two failed on their MODEL, which is the harder mistake and the reason this comment is
 * long:
 *
 *   3. "The plume is the contrail." One object was made to serve as both, so the plume had to be two
 *      seconds long, which is hundreds of world units at cruise. A jet that long is not a jet; it is
 *      a tail welded to the hull and dragged around. The plume and the contrail are separate things
 *      with separate lengths, separate lifetimes and separate causes, and they are separate modules
 *      now — the trail lives in `contrailTrail.js`.
 *   4. Deformation keyed to frozen emission state. Every swirl, wobble and curl was a function of a
 *      parcel's age, and a parcel's age-to-position mapping never changes, so the plume's shape was
 *      constant in the ship's frame. It was a still form being translated and stretched. It read as
 *      exactly that.
 *
 * WHAT THIS IS
 * ------------
 * A steady jet IS anchored to its engine — the shock structure of a real nozzle stands still relative
 * to the bell, and that part was never wrong. What has to move is the gas INSIDE it. So the geometry
 * is a fixed swept form in nozzle-local space, and every feature on it is a function of
 *
 *     flow = axialFraction * axialFreq - time * flowRate
 *
 * which is a travelling wave: structures appear at the lip, run aft, and burn out. A second slow time
 * axis is mixed in so the turbulence EVOLVES rather than only translating, because a field that just
 * scrolls reads as a conveyor belt.
 *
 * Each bright line in the target reference is the fold of a thin sheet seen edge-on: a sheet is
 * brilliant where the view catches its edge, because the optical path through it is long there, and
 * nearly invisible face-on. That grazing term is the whole visual signature and it only exists if the
 * sheet is real geometry with a real normal. Hence sheets, with curved cross-sections, and no cards.
 *
 * Placement is entirely in the vertex shader from a handful of uniforms, so per-frame CPU cost is a
 * pose update regardless of ribbon count.
 */
import * as THREE from 'three';

/** Streamer sheets in the jet. Each has its own flow rate, phase and breakup behaviour. */
export const RIBBON_COUNT = 28;
/**
 * Vertices across each sheet's width.
 *
 * Not a tessellation detail — the reason the effect reads as sheets at all. A two-vertex strip has ONE
 * normal across its whole width, so the grazing term is constant across it and it can only look like a
 * wire. With a curved cross-section the normal rotates from one edge to the other, so a bright crease
 * appears where the surface turns edge-on while the rest stays dim.
 */
export const RIBBON_ACROSS = 5;
/** Stations along the jet axis. */
export const STATION_COUNT = 56;

/**
 * Designed jet length at full drive, in world units. Recipe scale: hull ~8 WU, bell radius ~1.35 WU,
 * so this is a little over two hull lengths — a jet, not a tail. The contrail is what carries length.
 */
export const JET_LENGTH_WU = 17;

const UP = new THREE.Vector3(0, 1, 0);

const NOISE_GLSL = /* glsl */`
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

  // Smooth 2D value noise over (flow, evolution). Used to DISPLACE geometry and to gate which
  // structures are alight — never sampled as visible art, which is what ban B1 prohibits. The visible
  // art here is sheet geometry read through its grazing term.
  float vnoise2(vec2 x) {
    vec2 i = floor(x);
    vec2 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  // Two octaves. One octave gives a single eddy filling the jet; three costs more than it shows at
  // this on-screen size.
  float fbm2(vec2 x) {
    return vnoise2(x) * 0.65 + vnoise2(x * 2.17 + 11.3) * 0.35;
  }
`;

/**
 * Vertex stage. Places every sheet vertex in world space from the nozzle pose, and hands the fragment
 * stage the sheet normal the grazing term needs.
 */
const RIBBON_VERT = /* glsl */`
  precision highp float;

  attribute float aStation;
  attribute float aSide;
  attribute float aRibbon;

  uniform float uStationCount;
  uniform float uRibbonCount;
  uniform float uTime;

  // Nozzle pose. The jet is built in this frame, which is why it stands still relative to the bell.
  uniform vec3  uNozzlePos;
  uniform vec3  uAft;
  uniform vec3  uSideRef;

  uniform float uJetLength;     // world units, current — this is what grows out of the bell
  uniform float uThroatRadius;
  uniform float uSpread;        // radial billow over the jet's length
  uniform float uCoherence;     // fraction of the length that stays an unbroken column
  uniform float uFlowRate;      // travelling-wave speed: structures per second down the jet
  uniform float uAxialFreq;     // structures along the jet's length
  uniform float uRollAmp;       // vortex roll-up amplitude
  uniform float uSwirl;
  uniform float uWobble;
  uniform float uWidthNear;
  uniform float uWidthFar;
  uniform float uCurve;         // how hard each sheet is curled across its width
  uniform float uBoost;
  uniform float uDash;

  varying float vAxial;         // 0 at the lip, 1 at the designed tip — absolute, for temperature
  varying float vLife;          // 0 at the lip, 1 at THIS sheet's own end — for its run-out
  varying float vRadiusRatio;   // local column radius / throat radius; >= 1
  varying float vTongue;        // 0..1 which structures are currently alight
  varying float vSide;
  varying vec3  vWorldPos;
  varying vec3  vNormal;

  ${NOISE_GLSL}

  /**
   * How far down the jet one sheet gets before it is gone, as a fraction of the jet length.
   *
   * Real shear layers do not all break down at the same station: some strands punch a long way
   * downstream and others are shredded early. Giving every sheet the same reach is what gave the plume
   * a flat back edge — a plane where all the geometry stopped at once, like a chopped haircut. It also
   * wanders slowly in time, so the tail is never at a fixed distance from one frame to the next.
   *
   * Capped at 1.0 so no sheet can extend past the designed jet length.
   */
  float sheetReach(float ribbon) {
    float seed = hash11(ribbon * 2.71 + 0.37);
    float wander = 0.86 + 0.14 * vnoise2(vec2(uTime * 0.5, seed * 61.0));
    return (0.34 + seed * 0.66) * wander;
  }

  /**
   * Centreline of one streamer at a fraction of ITS OWN length. Called three times per vertex so the
   * sheet's own tangent — and therefore its normal, and therefore the grazing term — is exact rather
   * than approximated from the jet axis.
   */
  vec3 streamerPoint(float life, float ribbon, float reach, out float radiusRatio, out float tongue) {
    float seedA = hash11(ribbon * 7.13 + 1.7);
    float seedB = hash11(ribbon * 3.71 + 9.4);
    float seedC = hash11(ribbon * 11.9 + 4.3);

    // Absolute distance along the jet, so shape and heat stay keyed to real distance from the throat.
    // A short sheet is a short sheet; it does not become a squashed copy of a long one.
    float s = life * reach;

    // THE TRAVELLING WAVE. Structures are a function of axial position MINUS time, so they are born at
    // the lip and run aft. Per-streamer rate spread means neighbours shear past one another instead of
    // marching in step. The evo term is a second, slow, independent time axis so the turbulence
    // changes shape as it travels rather than scrolling rigidly like a conveyor belt.
    float flow = s * uAxialFreq - uTime * uFlowRate * (0.82 + seedA * 0.42);
    float evo = uTime * 0.65 + seedC * 47.0;

    // A nozzle throws ONE collimated column; it only shreds once the shear layer at its boundary has
    // had distance to break down. Every sheet therefore leaves the lip at nearly the same tight radius
    // and they overlap into a single dense stream, and per-sheet fan-out is gated behind uCoherence.
    // Fanning them at the lip makes the bell read as a ring of loose wires with a hole up the middle.
    float coreR = uThroatRadius * 0.62 * (0.86 + seedB * 0.28);
    float breakup = smoothstep(uCoherence, min(uCoherence * 3.5 + 0.22, 1.0), s);
    float fan = mix(1.0, 0.30 + seedA * 1.7, breakup);
    float radius = coreR + uSpread * pow(s, 0.7) * fan;

    // Kelvin-Helmholtz roll-up: the shear layer curls into rings that grow as they convect. Amplitude
    // grows downstream, and because it rides the flow term the curls visibly travel.
    float roll = fbm2(vec2(flow, evo)) - 0.5;
    radius *= 1.0 + roll * uRollAmp * breakup;

    // Azimuth: a standing per-sheet swirl plus a travelling meander, so strands hook and fold.
    float theta = (ribbon / max(uRibbonCount, 1.0)) * 6.2831853
      + seedB * 6.2831853
      + uSwirl * s * breakup * (seedA > 0.5 ? 1.0 : -1.0)
      + (fbm2(vec2(flow * 0.6, evo * 0.8)) - 0.5) * uWobble * breakup;

    // Which structures are burning right now. Also travelling, so tongues of flame appear at the lip,
    // run down the jet and burn out — instead of every streamer glowing at a constant value forever,
    // which is what made this read as a still image.
    tongue = fbm2(vec2(flow * 1.35 + 23.0, evo * 1.4));

    // Boost drives the jet longer and tighter rather than fatter: a uniform width multiply is what
    // made boost read as a triangle inflating in place.
    radius *= 1.0 - uBoost * 0.14 + uDash * 0.35;

    radiusRatio = radius / max(uThroatRadius * 0.62, 1e-3);

    vec3 up = cross(uSideRef, uAft);
    return uNozzlePos
      + uAft * (uJetLength * s)
      + uSideRef * (cos(theta) * radius)
      + up * (sin(theta) * radius);
  }

  void main() {
    float ds = 1.0 / max(uStationCount - 1.0, 1.0);
    float life = aStation * ds;
    float reach = sheetReach(aRibbon);

    float rr, tongue, ra, rb, ta, tb;
    vec3 p = streamerPoint(life, aRibbon, reach, rr, tongue);
    vec3 pPrev = streamerPoint(max(life - ds, 0.0), aRibbon, reach, ra, ta);
    vec3 pNext = streamerPoint(min(life + ds, 1.0), aRibbon, reach, rb, tb);

    vec3 tangent = normalize(pNext - pPrev + vec3(1e-5));

    // The sheet's width axis, twisted along its length. The twist is what makes a single strand flash
    // bright where it turns edge-on and fade where it turns face-on, instead of holding one constant
    // brightness like a strip of tape (ban B7). Twist rides the flow so the flashes travel too.
    float seedT = hash11(aRibbon * 5.37 + 4.1);
    float s = life * reach;
    vec3 ref = normalize(cross(tangent, vec3(0.0, 1.0, 0.0)) + vec3(0.0, 1e-4, 0.0));
    vec3 ref2 = cross(ref, tangent);
    float twist = (s * uAxialFreq * 0.5 - uTime * uFlowRate * 0.5) * 1.7 + aRibbon * 2.399;
    vec3 wide = normalize(ref * cos(twist) + ref2 * sin(twist));

    // Sheets widen as the column billows, and the flow term keeps that width breathing.
    float halfWidth = mix(uWidthNear, uWidthFar, pow(s, 0.8)) * 0.5;
    halfWidth *= 0.75 + tongue * 0.5;
    // Sheets are not all the same size to begin with. Identical sheets read as a manufactured fan;
    // a spread of widths is most of what makes a plume look like it has depth in it.
    halfWidth *= 0.55 + hash11(aRibbon * 4.11 + 2.9) * 1.05;
    halfWidth *= 1.0 + uDash * 1.6;

    vec3 sheetN = normalize(cross(tangent, wide));

    // Curl the cross-section, varying along the length AND with the flow, so the bright crease travels
    // down the sheet instead of sitting as a static stripe.
    float curveAmt = uCurve * (0.45 + 1.1 * vnoise2(vec2(s * 6.0 - uTime * uFlowRate, seedT * 31.0)));

    float v = aSide;
    // Quadratic across the width, mean-centred so curling does not shift the sheet bodily.
    vec3 offset = wide * (halfWidth * v) + sheetN * (curveAmt * halfWidth * (v * v - 0.3333));
    // Analytic derivative of that offset gives the true across-width tangent.
    vec3 acrossTan = wide * halfWidth + sheetN * (curveAmt * halfWidth * 2.0 * v);

    vec3 world = p + offset;

    vAxial = s;
    vLife = life;
    vRadiusRatio = max(rr, 1.0);
    vTongue = tongue;
    vSide = aSide;
    vWorldPos = world;
    vNormal = normalize(cross(tangent, acrossTan));

    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

/**
 * Fragment stage.
 *
 * TRANSPARENCY AND BRIGHTNESS ARE DIFFERENT PHYSICAL QUANTITIES AND ARE KEPT APART HERE.
 *
 * Alpha is how much exhaust material is in front of the pixel. It falls only because the material
 * genuinely thins: the column dilutes as it billows out, and the sheet runs out at its rim. Nothing
 * else touches it. Fading a plume up and down with an alpha multiplier tied to the throttle is the
 * cheat that made this read as a decal switching on; real exhaust is opaque where the material is and
 * see-through where it has thinned, and that is all.
 *
 * Radiance is temperature. The gas leaves the throat white-hot and radiates its energy away as it
 * travels. Because the material blends additively, temperature falling to nothing is what makes a cold
 * jet invisible — the plume never needs to be faded out, it needs to be cold.
 */
const RIBBON_FRAG = /* glsl */`
  precision highp float;

  uniform vec3  uCoreColor;
  uniform vec3  uMidColor;
  uniform vec3  uEdgeColor;
  uniform float uRadiance;
  uniform float uOpacity;
  uniform float uGrazeGain;
  uniform float uGrazeFloor;
  uniform vec3  uCamPos;
  uniform float uDrive;
  uniform float uBoost;
  uniform float uDash;
  uniform float uFlicker;

  varying float vAxial;
  varying float vLife;
  varying float vRadiusRatio;
  varying float vTongue;
  varying float vSide;
  varying vec3  vWorldPos;
  varying vec3  vNormal;

  void main() {
    vec3 V = normalize(uCamPos - vWorldPos);
    vec3 N = normalize(vNormal);

    // Optical path through a thin sheet goes as 1/|N·V|: long when edge-on, short when face-on. A real
    // thickness term, so it scales alpha as well as brightness.
    float facing = abs(dot(N, V));
    float graze = min(uGrazeGain, 1.0 / max(facing, uGrazeFloor));

    // ---- how much material is here (alpha) --------------------------------------------------
    // Dilution by billowing: material spread over a column of radius r is thinner by (r0/r)^2.
    float dilute = 1.0 / max(vRadiusRatio * vRadiusRatio, 1.0);
    // The sheet runs out at its rim, so the rim is where you can see through it and the body is not.
    // Deliberately not a gaussian (ban B6) — flat across the body, hard fall at the very edge.
    float across = 1.0 - pow(abs(vSide), 4.0);
    // Mass flow rises with the throttle, so density does too. Held deliberately weak: a firing engine
    // is a firing engine, and the throttle is meant to show up as a longer, wider, hotter jet rather
    // than as the same jet at a different opacity.
    float mflow = 0.72 + uDrive * 0.28;

    // EVERY SHEET RUNS OUT OF MATERIAL BEFORE IT RUNS OUT OF GEOMETRY.
    //
    // This is the fix for the flat chopped-off back edge. Each sheet reaches a different distance, and
    // over the last part of its own length its material thins to literally zero, so it ends on nothing.
    // The plume's tail is then just where a lot of sheets independently happen to run out — a ragged,
    // dissolving front — rather than a plane where the mesh stops (ban B9).
    float runout = 1.0 - smoothstep(0.42, 1.0, vLife);
    // And the far end fragments: the tongue term takes over from the smooth body, so the tail breaks
    // into separate wisps that come and go instead of fading as one solid shape.
    float shred = mix(1.0, vTongue * 1.8, smoothstep(0.2, 0.95, vLife));

    float density = dilute * mflow * (0.55 + vTongue * 0.75) * runout * shred;

    float alpha = clamp(uOpacity * density * across * graze, 0.0, 1.0);
    if (alpha < 0.003) discard;

    // ---- how hot it is (radiance) ------------------------------------------------------------
    // Two spatial scales. The sear term is the short stretch at the lip that is too hot to have a
    // colour; keeping it short stops the tone mapper rendering the whole jet white. The burn term is
    // the luminous body. Both are keyed to axial position, and the jet's LENGTH is what the throttle
    // moves, so a light touch gives a genuinely short jet rather than a full-length faint one.
    float sear = exp(-vAxial * 5.0);
    float burn = exp(-vAxial * 1.5);
    // Combustion is rough, and the tongues are what is actually alight at this instant.
    float alight = 0.35 + vTongue * 1.15;
    float emit = (sear * 1.5 + burn * 1.5) * alight * uFlicker;

    // Temperature ramp. The steps are far apart on purpose: with this many thin additive sheets a
    // narrow ramp averages to pale grey, and the character being aimed at is the distance between a
    // white throat and a deep saturated blue fringe.
    vec3 col = mix(uEdgeColor, uMidColor, smoothstep(0.05, 0.55, burn * alight));
    col = mix(col, uCoreColor, smoothstep(0.30, 0.85, sear * (0.6 + uDrive * 0.55)));
    col = mix(col, uCoreColor, clamp(uDash * 0.8, 0.0, 1.0));

    // HDR headroom on purpose: cores must exceed 1.0 for bloom to have anything to catch (ban B8).
    float rad = uRadiance * (emit + graze * 0.16 + uBoost * 0.40 + uDash * 3.0);
    gl_FragColor = vec4(col * rad, alpha);
  }
`;

/** Builds the static sheet mesh. Only indices and per-vertex ids — all placement is in the shader. */
function buildRibbonGeometry(T, ribbons, stations, across = RIBBON_ACROSS) {
  const verts = ribbons * stations * across;
  const station = new Float32Array(verts);
  const side = new Float32Array(verts);
  const ribbon = new Float32Array(verts);
  // position is required by three's attribute plumbing but is fully overwritten in the vertex shader;
  // the mesh disables frustum culling since its real bounds live on the GPU.
  const position = new Float32Array(verts * 3);

  let v = 0;
  for (let r = 0; r < ribbons; r++) {
    for (let s = 0; s < stations; s++) {
      for (let k = 0; k < across; k++) {
        station[v] = s;
        side[v] = across <= 1 ? 0 : (k / (across - 1)) * 2 - 1;
        ribbon[v] = r;
        v++;
      }
    }
  }

  const quads = ribbons * (stations - 1) * (across - 1);
  const index = new Uint32Array(quads * 6);
  let i = 0;
  for (let r = 0; r < ribbons; r++) {
    for (let s = 0; s < stations - 1; s++) {
      const rowA = (r * stations + s) * across;
      const rowB = (r * stations + s + 1) * across;
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
  geo.setAttribute('aStation', new T.BufferAttribute(station, 1));
  geo.setAttribute('aSide', new T.BufferAttribute(side, 1));
  geo.setAttribute('aRibbon', new T.BufferAttribute(ribbon, 1));
  geo.setIndex(new T.BufferAttribute(index, 1));
  return geo;
}

export function createPlasmaRibbonMaterial(T, opts = {}) {
  const core = opts.coreColor || [1.0, 0.99, 0.97];
  // Red is held very low in the mid and edge tones on purpose. These are additive HDR values and
  // radiance pushes green and blue past 1.0, so the tone mapper compresses those channels while red
  // stays put — the surviving red is what decides how saturated the plume reads. Lift red anywhere
  // near green and the whole thing desaturates to pale grey on the way through ACES.
  const mid = opts.midColor || [0.09, 0.55, 1.0];
  const edge = opts.edgeColor || [0.015, 0.08, 0.86];
  return new T.ShaderMaterial({
    uniforms: {
      uStationCount: { value: STATION_COUNT },
      uRibbonCount: { value: RIBBON_COUNT },
      uTime: { value: 0 },
      uNozzlePos: { value: new T.Vector3() },
      uAft: { value: new T.Vector3(-1, 0, 0) },
      uSideRef: { value: new T.Vector3(0, 0, 1) },
      // Scale reference (recipe): hull ~8 WU long, bell radius ~1.35 WU, designed jet ~17 WU opening
      // to roughly a third of its length across. These are that geometry, not free parameters.
      uJetLength: { value: JET_LENGTH_WU },
      uThroatRadius: { value: 1.32 },
      uSpread: { value: 2.3 },
      uCoherence: { value: 0.24 },
      // Structures per jet length, and how many of them pass a fixed point each second. Together these
      // set the visible flow speed. Too slow reads as a still image; too fast reads as strobing.
      uAxialFreq: { value: 3.2 },
      uFlowRate: { value: 2.6 },
      uRollAmp: { value: 0.55 },
      uSwirl: { value: 1.9 },
      uWobble: { value: 2.2 },
      // Sheets have to be wide enough that neighbours OVERLAP, everywhere. Narrow sheets do not read
      // as separate strands, they read as wires: each one becomes a bright line with a gap either side
      // and the plume turns into pen-and-ink. Overlapping sheets build a continuous volume, and what
      // the eye then picks out is the creases where individual sheets turn edge-on.
      uWidthNear: { value: 0.75 },
      uWidthFar: { value: 3.2 },
      uCurve: { value: 1.5 },
      uDrive: { value: 0 },
      uBoost: { value: 0 },
      uDash: { value: 0 },
      uFlicker: { value: 1 },
      uCoreColor: { value: new T.Color(core[0], core[1], core[2]) },
      uMidColor: { value: new T.Color(mid[0], mid[1], mid[2]) },
      uEdgeColor: { value: new T.Color(edge[0], edge[1], edge[2]) },
      // Opacity is per-sheet and RIBBON_COUNT sheets overlap additively, so this is roughly a
      // twentieth of what a single-layer effect would use. Set it at single-layer values and the jet
      // saturates to a white sausage before any structure can be seen.
      uRadiance: { value: 0.85 },
      uOpacity: { value: 0.028 },
      uGrazeGain: { value: 4.5 },
      uGrazeFloor: { value: 0.16 },
      uCamPos: { value: new T.Vector3() },
    },
    vertexShader: RIBBON_VERT,
    fragmentShader: RIBBON_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: T.AdditiveBlending,
    side: T.DoubleSide,
    toneMapped: false,
  });
}

/**
 * One drive plume. Owns its sheet mesh; holds no history, because history is the contrail's job.
 */
export class PlasmaRibbonPlume {
  constructor(T = THREE, opts = {}) {
    this.THREE = T;
    this.ribbons = opts.ribbons || RIBBON_COUNT;
    this.stations = opts.stations || STATION_COUNT;
    this.across = opts.across || RIBBON_ACROSS;

    this.geometry = buildRibbonGeometry(T, this.ribbons, this.stations, this.across);
    this.material = createPlasmaRibbonMaterial(T, opts);
    this.material.uniforms.uStationCount.value = this.stations;
    this.material.uniforms.uRibbonCount.value = this.ribbons;
    this.jetLength = opts.jetLength != null ? opts.jetLength : JET_LENGTH_WU;

    this.mesh = new T.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.mesh.visible = false;

    this._aft = new T.Vector3(-1, 0, 0);
    this._sideRef = new T.Vector3(0, 0, 1);
    this._time = 0;
  }

  attach(parent) {
    if (parent && this.mesh.parent !== parent) parent.add(this.mesh);
  }

  reset() {
    this._time = 0;
    this.mesh.visible = false;
  }

  /**
   * @param {number} dt seconds
   * @param {{x:number,y:number,z:number,aftX:number,aftZ:number}} nozzle world pose; aft is the
   *   direction exhaust leaves along
   * @param {object} env drive envelope: { spool, drive, boost, dash, jetLength, ... }
   */
  update(dt, nozzle, env) {
    const d = Math.max(0, dt || 0);
    this._time += d;

    const drive = Math.max(0, Math.min(1.4, (env && env.drive != null ? env.drive : env && env.spool) || 0));
    if (!nozzle || drive <= 0.002) {
      this.mesh.visible = false;
      return;
    }

    const u = this.material.uniforms;
    u.uNozzlePos.value.set(nozzle.x, nozzle.y, nozzle.z);
    this._aft.set(nozzle.aftX || 0, 0, nozzle.aftZ || 0);
    if (this._aft.lengthSq() < 1e-8) this._aft.set(-1, 0, 0);
    this._aft.normalize();
    // Stable perpendicular. The jet lies in the XZ plane, so world up is never parallel to aft.
    this._sideRef.crossVectors(this._aft, UP).normalize();
    u.uAft.value.copy(this._aft);
    u.uSideRef.value.copy(this._sideRef);

    u.uTime.value = this._time % 3600;
    u.uDrive.value = drive;
    u.uBoost.value = env.boost || 0;
    u.uDash.value = env.dash || 0;

    // Length is the throttle's primary consequence: this is the jet growing out of the bell.
    u.uJetLength.value = env.jetLength != null ? env.jetLength : this.jetLength * drive;

    // Combustion roughness. Two incommensurate frequencies so it never reads as a periodic pulse.
    u.uFlicker.value = 1
      + 0.055 * Math.sin(this._time * 37.1)
      + 0.035 * Math.sin(this._time * 61.7 + 1.3);

    if (env.throatRadius != null) u.uThroatRadius.value = env.throatRadius;
    if (env.spread != null) u.uSpread.value = env.spread;
    if (env.radiance != null) u.uRadiance.value = env.radiance;
    if (env.opacity != null) u.uOpacity.value = env.opacity;
    this.mesh.visible = true;
  }

  setCamera(camera) {
    if (!camera) return;
    this.material.uniforms.uCamPos.value.copy(camera.position);
  }

  inspect() {
    return {
      construction: 'swept-ribbon-sheets',
      element: 'plume',
      ribbons: this.ribbons,
      stations: this.stations,
      // Nozzle-local and short by construction. A plume that carries flight history is the mistake
      // this split exists to prevent, so there is deliberately no history here to report.
      jetLength: this.material.uniforms.uJetLength.value,
      animated: 'travelling-wave',
      grazing: true,
      visible: !!this.mesh.visible,
    };
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
    if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
  }
}

export const __testables = { buildRibbonGeometry, UP, NOISE_GLSL };
