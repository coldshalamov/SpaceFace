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
// E5 — the jet/history appearance boundary. The engine-jet lane owns driveEnvelope.js and landed
// resolveJetHandoff in 145aaf929; the recorder reads it and never writes it.
import { HANDOFF_TERMS, resolveJetHandoff } from './driveEnvelope.js';

/**
 * The jet's own radiance at the handoff station with the drive flat out and no boost or dash,
 * expressed as a multiple of the jet's base radiance. Derived from the jet lane's own published
 * terms so the seam is a reading of the shipped jet, never a second opinion about it.
 *
 * WHY A RATIO AND NOT THE NUMBER. The jet's radiance and the recorder's radiance are not the same
 * quantity: different alpha, different sheet counts, different overdraw. Importing the jet's
 * absolute value would darken the mouth of the wake by roughly eight times. Dividing the live
 * handoff radiance by this reference gives a dimensionless "how hard is the jet handing over"
 * scalar, which is the only radiance number that means anything across the two shaders.
 */
const HANDOFF_ENERGY_REF = (() => {
  const emit = HANDOFF_TERMS.burn * HANDOFF_TERMS.burnWeight * HANDOFF_TERMS.alight;
  const ref = emit + HANDOFF_TERMS.grazeMean * HANDOFF_TERMS.grazeWeight;
  return Number.isFinite(ref) && ref > 1e-4 ? ref : 0.783;
})();

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
export const SHEET_COUNT = 8;
/** Stable alias retained for callers and tests. */
export const STRAND_COUNT = SHEET_COUNT;
/** Vertices across each sheet, allowing a curved luminous cross-section. */
export const STRAND_ACROSS = 7;
/** Minimum movement before another exact nozzle position is committed. */
export const MIN_STEP_WU = 0.12;

/**
 * Curvature-aware sampling. The step gate above shortens as the bell's heading swings, so detail
 * lands on bends instead of being spread evenly along a line that is mostly straight.
 *
 * CURVE_GATE_REF is the turn measure (1 - cos) at which the gate is fully shortened: 0.25 is a
 * heading change of about 41 degrees between consecutive recorded steps, which at any normal frame
 * rate only a genuine hard pivot reaches. CURVE_GATE_MIN_FRACTION is how short the gate may get.
 */
export const CURVE_GATE_REF = 0.25;
export const CURVE_GATE_MIN_FRACTION = 0.3;

/**
 * TUMBLING SHIPS CORKSCREW (PQ-139.04, design/VISION.md "he becomes a projectile").
 *
 * A spun hull's nozzle traces a circle of a few units as the hull yaws, which the recorded history
 * already keeps — but at the chase camera that helix is narrower than the plume itself and reads as
 * nothing. So the recorded point is offset ACROSS the exhaust axis by a spin-driven phase: the
 * offset is zero at rest (bit-identical to before), grows with the spin rate, saturates at a hard
 * tumble, and follows the hull's own phase (the phase advances by angVel * dt), so the helix on
 * screen has the period of the spin a viewer sees. Only the RECORDED point moves; the nozzle that
 * gates sampling (B14) and the plume root are untouched, so a corkscrew never puts the mouth off
 * the bell. Brightness already follows drive (each sample records the drive it was born with).
 *
 * Helm yaw is not tumble. Player turn is capped at 3.8 rad/s (4.56 with coast helm). The old
 * 2 rad/s saturation sat *below* that cap, so pressing either turn key fully opened a 6 WU
 * lateral shove. Opposite yaw signs also flip the flown-line perpendicular, so both arrows
 * offset the same world-X / screen-right way from a +X rest heading. Ordinary flight must
 * record the bell itself; only a real tumble/drift may corkscrew.
 */
export const SPIN_HELIX_REF_RAD_S = 2.0;
export const SPIN_HELIX_AMP_WU = 6.0;
/** Above `PLAYER_TURN_RATE_CAP * COAST_HELM_YAW_MULT` (3.8 * 1.2 = 4.56). */
export const SPIN_HELIX_HELM_DEADZONE_RAD_S = 4.75;

/** Lateral offset (WU) of the recorded point for a spin rate and the accumulated phase. Pure. */
export function spinHelixOffset(spin, phase) {
  const s = Number.isFinite(spin) ? Math.abs(spin) : 0;
  if (!(s > SPIN_HELIX_HELM_DEADZONE_RAD_S)) return 0;
  const amp = Math.min(1, s / SPIN_HELIX_REF_RAD_S) * SPIN_HELIX_AMP_WU;
  return amp > 0 ? amp * Math.sin(phase) : 0;
}

/**
 * Spin the contrail helix is allowed to see. Ordinary owner.angVel is helm yaw and must stay 0.
 * Tumble/drift presentation is the only live caller that may pass a rate through.
 */
export function resolveContrailSpin(owner) {
  if (!owner || !Number.isFinite(owner.angVel)) return 0;
  const mode = owner.presentation && owner.presentation.tumble && owner.presentation.tumble.mode;
  if (mode !== 'tumbling' && mode !== 'drifting') return 0;
  return owner.angVel;
}
/** A teleport/sector jump starts another disconnected history segment; it never erases the old one. */
export const DISCONTINUITY_WU = 160;

/**
 * JET HANDOFF (E5). The live jet's material runs out around `HANDOFF_STATION` of its designed
 * length, so the jet physically covers the newest stretch of the flown line. The overlap the
 * recorder flares across is measured in that jet's own terminal width: a short, controlled join
 * rather than a length guessed in seconds. Walking is bounded so a hitch cannot turn the seam into
 * an unbounded scan.
 */
export const SEAM_SPAN_WIDTHS = 2.2;
export const SEAM_WALK_LIMIT = 48;
/** Hard ceiling on the overlap as a fraction of the history's life: the seam is a join, not a mood. */
export const SEAM_MAX_LIFE_FRACTION = 0.3;

/**
 * Smallest half-width, in world units per unit of camera distance, that a sheet is allowed to
 * project to. Sized for a 1080-line frame at a 60 degree vertical field: one pixel spans about
 * 0.00107 * distance world units there, so 0.0009 holds a sheet at roughly 1.7 px across.
 *
 * Below a pixel an additive sheet stops covering pixel centres reliably and crawls — the classic
 * thin-line sparkle. The fix is to widen the geometry and divide the radiance by exactly the same
 * factor, so the wake keeps its integrated light instead of gaining energy into the bloom pass.
 * Brightness is preserved; only the sampling is repaired. It never shortens or dims the history.
 */
export const MIN_PROJECTED_HALF_WIDTH = 0.0009;

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
  // Ring head. Recorded facts never move between texels; only this cursor moves, so inserting the
  // newest fact is one texel write instead of shuffling the whole retained window down by one.
  uniform float uHead;
  // The history's own clock: advanced only by update(dt), so a paused game pauses the fade.
  // path.a stores each sample's birth on this clock; age is derived on the GPU so the texture
  // contents do not change as time passes.
  uniform float uNow;

  uniform float uRadiusHead;
  uniform float uRadiusTail;
  uniform float uWidthHead;
  uniform float uWidthTail;
  uniform float uCurve;
  uniform float uMinPxWidth;
  uniform vec3  uCamPos;

  // E5 seam. uSeamAge is the normalized age at which the overlap with the live jet has fully
  // handed over; zero disables the whole seam and the recorder draws its own mouth.
  uniform float uSeamAge;
  uniform float uSeamHalfWidth;

  varying float vAge;
  varying float vLife;
  varying float vSide;
  varying float vDrive;
  varying float vBoost;
  varying float vDash;
  varying float vStaticTexture;
  varying float vCore;
  varying float vSeam;
  varying float vWidthGain;
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
    // Logical index (0 = newest) to physical ring texel. Every clamp/neighbour decision above and
    // below stays in logical space; the ring is a storage detail and nothing else may see it.
    float ring = mod(uHead + idx, uSampleCount);
    float u = (ring + 0.5) / uSampleCount;
    vec4 path = texture2D(uPathTex, vec2(u, 0.5));
    vec4 state = texture2D(uStateTex, vec2(u, 0.5));
    posOut = path.rgb;
    ageOut = clamp((uNow - path.a) / max(uTrailSeconds, 0.001), 0.0, 1.0);
    driveOut = state.r;
    boostOut = state.g;
    dashOut = state.b;
    segmentOut = state.a;
  }

  float sameSegment(float a, float b) {
    return 1.0 - step(0.25, abs(a - b));
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

    // NEAR REVERSAL. When the ship flies back down its own line the central difference cancels and
    // the old code snapped the tangent to world +X, which threw one ring of the sheath sideways at
    // the cusp. Fall back to the one-sided differences, which still describe the real line there.
    vec3 tangent = pNext - pPrev;
    if (dot(tangent, tangent) < 1e-7) tangent = p - pPrev;
    if (dot(tangent, tangent) < 1e-7) tangent = pNext - p;
    if (dot(tangent, tangent) < 1e-7) tangent = vec3(1.0, 0.0, 0.0);
    tangent = normalize(tangent);

    vec3 ref = cross(tangent, vec3(0.0, 1.0, 0.0));
    if (dot(ref, ref) < 1e-7) ref = cross(tangent, vec3(1.0, 0.0, 0.0));
    ref = normalize(ref);
    // FRAME CONTINUITY, and a warning. cross(tangent, up) on a horizontal path is (-tz, 0, tx),
    // which already rotates smoothly with the tangent: there is no discontinuity to repair on an
    // ordinary turn, only at a true cusp, and the one-sided fallback above covers that.
    //
    // Do NOT pin this vector's sign to a world axis to make the frame a function of the line rather
    // than of the direction it was flown. That was tried here and reverted. The sign flips whenever
    // tz crosses zero, which on a circle is twice a revolution at the plus and minus X headings,
    // and it rotates the whole sheath by pi between two CONSECUTIVE rows. The index buffer joins
    // each sheet to itself across those rows, so every quad then spans the tube's diameter:
    // measured as a frame step of 2.0 against 0.02 for the construction kept below. Additively
    // blended that is a bright knot on every turn, which is the case the owner cares most about.
    vec3 up = normalize(cross(ref, tangent));

    // CURVATURE. 1 - cos(turn) between the incoming and outgoing chords: 0 straight, 2 reversed.
    // The local radius of the bend follows from it, and a tube wider than that radius folds through
    // its own inside edge on a hard turn. Bounding the lateral reach by the bend keeps a fast turn a
    // clean cord instead of a crumpled one. It is a local guard on a real bend, never a global trim.
    vec3 chordIn = p - pPrev;
    vec3 chordOut = pNext - p;
    float lenIn = length(chordIn);
    float lenOut = length(chordOut);
    float turn = 0.0;
    if (lenIn > 1e-5 && lenOut > 1e-5) {
      turn = 1.0 - clamp(dot(chordIn / lenIn, chordOut / lenOut), -1.0, 1.0);
    }
    float bendRadius = turn > 1e-4
      ? (0.5 * (lenIn + lenOut)) / sqrt(2.0 * turn)
      : 1.0e6;
    float bendReach = max(0.35, bendRadius * 0.85);

    // Every geometric variation is keyed to immutable data: recorded world position, segment and
    // sheet id. There is deliberately no time uniform and no age-driven position deformation.
    float sheetSeed = hash11(aStrand * 7.13 + segment * 0.37 + 1.7);
    // Continuous, world-fixed folds. Independent hashes per sample made straight flight
    // look like stacked rectangular splinters. Nothing here moves an old path or adds a clock.
    float worldSeed = 0.5 + 0.5 * sin(dot(p, vec3(0.037, 0.021, 0.053)) + aStrand * 2.3 + segment * 0.11);
    float staticTexture = 0.5 + 0.5 * sin(dot(p, vec3(0.061, 0.033, 0.047)) + aStrand * 3.1 + segment * 0.7);

    // Four interlaced wakes with space BETWEEN them. A constant-radius sixteen-sheet tube
    // saturated into a ruler-straight white bar. These long folds are fixed to the recorded
    // positions, so turning or releasing thrust never drags an old curl along with the ship.
    // The first strand pair is the BURN CORE: pinched onto the recorded line itself, so the wake
    // has a searing heart exactly where the bell flew, corded around by the outer sheets. Every
    // offset below is still a function of immutable per-sheet seed, never of age or time.
    float isCore = 1.0 - step(1.5, aStrand);
    float braid = floor(aStrand / 2.0);
    float flowCoordinate = dot(p, vec3(0.073, 0.019, 0.051));

    // BIRTH WIDTH. The size uniforms describe the bell at FULL drive; every sample then carries the
    // drive it was recorded with, and the shipped throat shape is base * (0.72 + drive * 0.28).
    // Reconstructing the width from the sample's own drive is what stops the whole retained wake
    // from inflating and deflating with the live throttle: that breathing changed the thickness of
    // light already laid down, which is the same class of lie as moving it. A sample born at full
    // burn stays a fat searing cord after the pilot eases off; one born at a touch stays thin.
    float birthScale = 0.72 + clamp(drive, 0.0, 1.0) * 0.28;

    float radius = mix(uRadiusHead, uRadiusTail, worldSeed) * (0.55 + sheetSeed * 0.38);
    radius = mix(radius, uRadiusHead * 0.16, isCore);
    radius *= birthScale;
    float theta = braid * 1.5707963 + flowCoordinate
      + sin(flowCoordinate * 0.53 + braid * 1.7) * 0.65
      + mod(aStrand, 2.0) * 0.26;

    float halfWidth = mix(uWidthHead, uWidthTail, 0.18 + staticTexture * 0.66) * 0.5;
    halfWidth *= 0.62 + sheetSeed * 0.5;
    halfWidth = mix(halfWidth, uWidthHead * 0.34, isCore);
    halfWidth *= birthScale;

    // E5 SEAM. The live jet covers the newest stretch of the flown line, so over that short overlap
    // the recorded mouth takes the jet's terminal cross-section and opens out of it. The scale is
    // deliberately seed-free and shared by every sheet: scaling each sheet to the same outer radius
    // would collapse the braid into one ring at the mouth and hand the frame a second bright head,
    // which is exactly the join E5 forbids. Nothing here touches a recorded POSITION.
    float seam = uSeamAge > 0.0 ? 1.0 - smoothstep(0.0, uSeamAge, age) : 0.0;
    float nominalOuter = (uRadiusHead * 0.92 + uWidthHead * 0.5) * birthScale;
    float seamScale = clamp(uSeamHalfWidth / max(nominalOuter, 0.05), 0.35, 3.0);
    float seamK = mix(1.0, seamScale, seam);
    radius *= seamK;
    halfWidth *= seamK;

    // Bound the lateral reach by the local bend so a fast turn cannot fold through its inside edge.
    radius = min(radius, bendReach);
    halfWidth = min(halfWidth, bendReach * 0.6);

    // Collapse both rows surrounding a segment break. This prevents the fixed index buffer from
    // drawing a bridge across a teleport or a period when the engine was not emitting. Rows beyond
    // the live range never reach the shader: the draw range covers live sample boundaries only.
    float segmentEdge = 1.0 - max(1.0 - prevSame, 1.0 - nextSame);
    radius *= segmentEdge;
    halfWidth *= segmentEdge;

    // EDGE STABILITY. A sheet thinner than a pixel stops covering pixel centres reliably and
    // crawls. Widen it to a stable footprint and hand the fragment stage the exact factor, which it
    // divides back out of the radiance: same integrated light over the same screen area, so the
    // wake keeps its brightness instead of gaining energy into the bloom pass as it recedes.
    float wantedHalf = halfWidth;
    float floorHalf = length(uCamPos - p) * uMinPxWidth;
    halfWidth = max(halfWidth, floorHalf * segmentEdge);
    vWidthGain = halfWidth > 1e-5 ? clamp(wantedHalf / halfWidth, 0.06, 1.0) : 1.0;

    vec3 center = p + ref * (cos(theta) * radius) + up * (sin(theta) * radius);

    float twist = theta + 0.8 + sin(flowCoordinate * 0.7 + braid) * 1.1;
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
    vCore = isCore;
    vSeam = seam;
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

  // E5 seam: the jet's terminal colour, its hand-over energy as a multiple of its own full-drive
  // reference, and the structural motif it is handing across (fold count and registration).
  uniform vec3  uSeamColor;
  uniform float uSeamEnergy;
  uniform float uSeamFoldCount;
  uniform float uSeamPhase;

  varying float vAge;
  varying float vLife;
  varying float vSide;
  varying float vDrive;
  varying float vBoost;
  varying float vDash;
  varying float vStaticTexture;
  varying float vCore;
  varying float vSeam;
  varying float vWidthGain;
  varying vec3  vWorldPos;
  varying vec3  vNormal;

  void main() {
    vec3 V = normalize(uCamPos - vWorldPos);
    vec3 N = normalize(vNormal);
    float facing = abs(dot(N, V));
    float graze = min(uGrazeGain, 1.0 / max(facing, uGrazeFloor));
    float spec = smoothstep(1.4, 4.8, graze);

    // Cross-section folds. Across the seam the recorder adopts the jet's own motif — its fold count
    // and its registration — so the structure crossing the join is one pattern rather than two that
    // happen to meet. This is a surface highlight: it reads the handoff's phase, it never moves a
    // recorded position, and the phase itself only advances when a new fact is written.
    float fold = 0.5 + 0.5 * cos(vSide * 4.3 + vStaticTexture * 2.0);
    float seamFold = 0.5 + 0.5 * cos(vSide * uSeamFoldCount * 0.5 + uSeamPhase * 6.2831853);
    fold = mix(fold, seamFold, vSeam * 0.8);
    float across = (1.0 - smoothstep(0.68, 1.0, abs(vSide))) * (0.48 + 0.95 * fold * fold);

    // TIME IS THE ONLY TERMINATOR. This is monotonic in sample age and contains no spatial length,
    // current drive, speed, pulse phase, or current-nozzle term.
    float life = pow(max(1.0 - vLife, 0.0), 1.35);
    float filament = 0.72 + vStaticTexture * 0.48;
    float birthEnergy = 0.55 + vDrive * 0.45 + vBoost * 0.18 + vDash * 0.34;
    float density = across * life * filament * birthEnergy * (1.0 + vCore * 0.6);

    float alpha = clamp(uOpacity * 2.0 * density * (0.6 + spec * 1.1), 0.0, 1.0);
    if (alpha < 0.0015) discard;

    // Cooling is also monotonic in age. Birth state is immutable metadata; the ship's current
    // throttle can never brighten or dim an old sample. The sear phase is stretched so the burn
    // reads as a white gash that then cools through cyan to the blue fringe over its full life —
    // a hole burned in space taking about a second to close, not a tenth-of-a-second spark.
    float heat = exp(-vAge * 3.4) * birthEnergy;
    float sear = exp(-vAge * mix(9.0, 4.5, vCore)) * birthEnergy;
    // ONE HEAD, NOT TWO (E5). The recorder's own sear peaks at age zero — right where the live jet
    // is already burning its head. Two independently bright heads read as a join. Standing the
    // recorder's sear down across the overlap leaves the jet as the single bright mouth, and the
    // history opens out of it instead of starting again.
    sear *= 1.0 - vSeam * 0.85;
    vec3 col = mix(uEdgeColor, uMidColor, smoothstep(0.08, 0.62, heat));
    col = mix(col, uCoreColor, smoothstep(0.35, 0.9, sear));
    // The pinned core strands hold their sear longest: the line stays white-hearted after the
    // surrounding sheets have cooled to colour.
    col = mix(col, uCoreColor * 1.05, vCore * smoothstep(0.10, 0.75, sear + heat * 0.45));
    // Colour progression is commensurable across the two shaders, so it is matched outright.
    col = mix(col, uSeamColor, vSeam * 0.85);

    float rad = uRadiance * life
      * (0.9 + heat * 0.85 + sear * 1.15 + spec * 1.25 + vStaticTexture * 0.18 + vCore * 1.6);
    // Radiance is NOT commensurable across the two shaders (different alpha, sheet count and
    // overdraw), so the jet's absolute value is never imported — only how hard it is handing over,
    // as a multiple of its own full-drive reference. Boost and dash therefore brighten the join
    // exactly as far as they brighten the jet, and the wake beyond the overlap is untouched.
    rad *= mix(1.0, uSeamEnergy, vSeam);
    // Divide back out the widening the vertex stage applied to hold a stable screen footprint.
    rad *= vWidthGain;
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

  // Quads are grouped by sample boundary, not by sheet: every quad joining rows s and s + 1 sits in
  // one contiguous block, so drawRange can limit the draw to the live prefix's boundaries and dead
  // sample rows never reach the vertex shader at all.
  const quads = sheets * (samples - 1) * (across - 1);
  const index = new Uint32Array(quads * 6);
  let i = 0;
  for (let s = 0; s < samples - 1; s++) {
    for (let r = 0; r < sheets; r++) {
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
  const edgeCol = opts.edgeColor || [0.12, 0.07, 0.70];

  return new T.ShaderMaterial({
    uniforms: {
      uPathTex: { value: null },
      uStateTex: { value: null },
      uSampleCount: { value: SAMPLE_COUNT },
      uStrandCount: { value: SHEET_COUNT },
      uLive: { value: 0 },
      uTrailSeconds: { value: TRAIL_SECONDS },
      uNow: { value: 0 },
      uHead: { value: 0 },

      // The wake is a tight corded sheath around a searing core, roughly bell-radius — it must
      // read as something the nozzle emitted, never as a field the ship is dragging alongside it.
      uRadiusHead: { value: opts.radiusHead != null ? opts.radiusHead : 1.25 },
      uRadiusTail: { value: opts.radiusTail != null ? opts.radiusTail : 1.95 },
      uWidthHead: { value: opts.widthHead != null ? opts.widthHead : 1.3 },
      uWidthTail: { value: opts.widthTail != null ? opts.widthTail : 1.8 },
      uCurve: { value: 1.25 },

      uCoreColor: { value: new T.Color(coreCol[0], coreCol[1], coreCol[2]) },
      uMidColor: { value: new T.Color(midCol[0], midCol[1], midCol[2]) },
      uEdgeColor: { value: new T.Color(edgeCol[0], edgeCol[1], edgeCol[2]) },

      uRadiance: { value: 2.4 },
      uOpacity: { value: 0.1 },
      uGrazeGain: { value: 5.2 },
      uGrazeFloor: { value: 0.22 },
      uCamPos: { value: new T.Vector3() },
      uMinPxWidth: { value: MIN_PROJECTED_HALF_WIDTH },

      // E5 seam, all resolved from the jet lane's own handoff record. uSeamAge 0 means "no jet is
      // handing over", and every seam term then falls out of the shader.
      uSeamAge: { value: 0 },
      uSeamHalfWidth: { value: 0 },
      uSeamEnergy: { value: 1 },
      uSeamFoldCount: { value: HANDOFF_TERMS.foldCount },
      uSeamPhase: { value: 0 },
      uSeamColor: { value: new T.Color(midCol[0], midCol[1], midCol[2]) },
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
 * One nozzle's immutable emission history. Logical index 0 is the newest fact.
 *
 * Storage is a RING. A fact is written once, into one texel, and stays in that texel until its own
 * age retires it — it is never copied, shifted or compacted. The newest-first ordering the rest of
 * the class speaks in is produced by a cursor (`_head`), and the shader turns a logical index into
 * a texel with one `mod`. The previous layout shifted the whole retained window down by one slot on
 * every recorded sample, which the 2026-09-16 quality audit named as this family's open cost.
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

    // path: x, y, z, birth time on the trail's own clock (see uNow)
    this._path = new Float32Array(this.samples * 4);
    // state: birth drive, birth boost, birth dash, immutable segment id
    this._state = new Float32Array(this.samples * 4);
    this._live = 0;
    // Texel holding the newest live fact. Logical index i lives at (_head + i) % samples.
    this._head = 0;
    this._now = 0;
    this._dirty = false;
    this._isEmitting = false;
    this._segmentId = 0;
    this._capacitySkips = 0;
    // The corkscrew's phase, advanced by the hull's spin; the last RAW nozzle point that gated a
    // sample (the recorded point may sit off it by the helix offset).
    this._helixPhase = 0;
    this._gateX = 0;
    this._gateY = 0;
    this._gateZ = 0;
    // Heading of the last recorded step on the raw bell track, for curvature-aware gating only.
    this._dirX = 0;
    this._dirZ = 0;
    this._hasDir = false;
    // E5: the handoff's flow registration, latched on the frames a fact is actually recorded. The
    // recorder deliberately has no clock of its own, so the seam's motif advances with EMISSION,
    // never with time: a parked ship's seam is perfectly still.
    this._seamPhase = 0;
    this._recorded = false;

    this._pathTex = makePathTexture(T, this._path, this.samples);
    this._stateTex = makePathTexture(T, this._state, this.samples);
    this.material.uniforms.uPathTex.value = this._pathTex;
    this.material.uniforms.uStateTex.value = this._stateTex;
    this.geometry.setDrawRange(0, 0);
  }

  attach(parent) {
    if (parent && this.mesh.parent !== parent) parent.add(this.mesh);
  }

  reset() {
    this._helixPhase = 0;
    this._gateX = 0; this._gateY = 0; this._gateZ = 0;
    this._live = 0;
    this._head = 0;
    this._dirty = false;
    this._isEmitting = false;
    this._segmentId = 0;
    this._capacitySkips = 0;
    this._seamPhase = 0;
    this._recorded = false;
    this._dirX = 0; this._dirZ = 0; this._hasDir = false;
    this.material.uniforms.uLive.value = 0;
    this.material.uniforms.uHead.value = 0;
    this.material.uniforms.uSeamAge.value = 0;
    this.geometry.setDrawRange(0, 0);
    this.mesh.visible = false;
  }

  liveSampleCount() {
    return this._live;
  }

  /** Float offset of logical sample `i` (0 = newest) inside the ring. */
  _slot(i) {
    const n = this.samples;
    return (((this._head + i) % n) + n) % n;
  }

  /**
   * Advances the history clock and retires samples whose own lifetime expired. The oldest live fact
   * is always at logical index `_live - 1`, so expiry is a contiguous tail trim: no surviving fact
   * is moved, rewritten or aged in place — the GPU derives age from uNow.
   */
  _age(dt) {
    this._now += dt;
    let live = this._live;
    while (live > 0
      && this._now - this._path[this._slot(live - 1) * 4 + 3] >= this.trailSeconds) live--;
    this._live = live;
  }

  /**
   * Inserts one immutable fact at the newest texel. Existing live samples are never evicted to make
   * space and never move; in the pathological full-buffer case the new fact is skipped until age
   * frees a texel, because evicting a young fact to fit a younger one is not time-only retirement.
   */
  _push(x, y, z, drive, boost, dash, segment) {
    if (this._live >= this.samples) {
      this._capacitySkips++;
      return false;
    }
    const n = this.samples;
    this._head = (this._head - 1 + n) % n;
    const s = this._head * 4;
    this._path[s] = x;
    this._path[s + 1] = y;
    this._path[s + 2] = z;
    this._path[s + 3] = this._now;
    this._state[s] = drive;
    this._state[s + 1] = boost;
    this._state[s + 2] = dash;
    this._state[s + 3] = segment;
    this._live++;
    this._dirty = true;
    return true;
  }

  /**
   * Re-express every retained fact in a rebased render frame (E2, floating origin).
   *
   * This is NOT a mutation of the record. The render frame is re-pegged every 8192 WU, and a point
   * that does not move with it is describing a different place afterwards. Shifting by the frame
   * delta is what keeps the recorded fact the SAME world position; leaving it alone is what would
   * move it. Without this the whole player wake pops out of existence at every rebase and regrows
   * over the next second and a bit.
   */
  reproject(dx, dz) {
    const ox = Number.isFinite(dx) ? dx : 0;
    const oz = Number.isFinite(dz) ? dz : 0;
    if (ox === 0 && oz === 0) return;
    for (let i = 0; i < this._live; i++) {
      const s = this._slot(i) * 4;
      this._path[s] += ox;
      this._path[s + 2] += oz;
    }
    this._gateX += ox;
    this._gateZ += oz;
    if (this._live > 0) this._dirty = true;
  }

  /**
   * Resolve the jet/history appearance boundary (E5) and the overlap it is handed across.
   *
   * The overlap is measured along the RECORDED path, not in seconds: the jet covers the newest
   * stretch of the flown line, and how long that took depends on how fast the ship was going. The
   * walk is bounded and stops at a segment break, so a teleport or a thrust gap never lets the seam
   * reach across into a disconnected burn.
   */
  _resolveSeam(env) {
    const u = this.material.uniforms;
    if (!env || this._live < 2 || !this._isEmitting) {
      u.uSeamAge.value = 0;
      return;
    }
    const handoff = (env.jetHandoff && Number.isFinite(env.jetHandoff.widthWU))
      ? env.jetHandoff
      : resolveJetHandoff(env.recipe || null, env);
    const widthWU = Number.isFinite(handoff.widthWU) ? Math.max(0, handoff.widthWU) : 0;
    if (!(widthWU > 0.05)) {
      u.uSeamAge.value = 0;
      return;
    }

    const span = widthWU * SEAM_SPAN_WIDTHS;
    const head = this._slot(0) * 4;
    const segment = this._state[head + 3];
    let px = this._path[head];
    let py = this._path[head + 1];
    let pz = this._path[head + 2];
    let walked = 0;
    let seamBirth = this._path[head + 3];
    const limit = Math.min(SEAM_WALK_LIMIT, this._live);
    for (let i = 1; i < limit; i++) {
      const s = this._slot(i) * 4;
      if (Math.abs(this._state[s + 3] - segment) >= 0.25) break;
      const qx = this._path[s];
      const qy = this._path[s + 1];
      const qz = this._path[s + 2];
      walked += Math.hypot(qx - px, qy - py, qz - pz);
      px = qx; py = qy; pz = qz;
      seamBirth = this._path[s + 3];
      if (walked >= span) break;
    }

    const seamAge = Math.max(0, this._now - seamBirth);
    const capped = Math.min(seamAge, this.trailSeconds * SEAM_MAX_LIFE_FRACTION);
    u.uSeamAge.value = capped / this.trailSeconds;
    u.uSeamHalfWidth.value = widthWU * 0.5;
    const base = Number.isFinite(env.radiance) && env.radiance > 1e-4 ? env.radiance : 1;
    const energy = Number.isFinite(handoff.radiance)
      ? handoff.radiance / (base * HANDOFF_ENERGY_REF)
      : 1;
    u.uSeamEnergy.value = Math.max(0.15, Math.min(3, energy));
    if (this._recorded && Number.isFinite(handoff.flowPhase)) this._seamPhase = handoff.flowPhase;
    if (Number.isFinite(handoff.foldCount)) u.uSeamFoldCount.value = Math.max(1, handoff.foldCount);
    const rgb = handoff.colorRGB;
    if (rgb && rgb.length >= 3) {
      u.uSeamColor.value.setRGB(
        Number.isFinite(rgb[0]) ? rgb[0] : 0,
        Number.isFinite(rgb[1]) ? rgb[1] : 0,
        Number.isFinite(rgb[2]) ? rgb[2] : 0,
      );
    }
    u.uSeamPhase.value = this._seamPhase;
  }

  _publish(env) {
    const u = this.material.uniforms;
    // Texture bytes change only when a fact is recorded or reset. Aging and expiry move only the
    // uNow/uLive uniforms and the draw range — a fading trail uploads nothing.
    if (this._dirty) {
      this._pathTex.needsUpdate = true;
      this._stateTex.needsUpdate = true;
      this._dirty = false;
    }
    u.uLive.value = this._live;
    u.uNow.value = this._now;
    u.uHead.value = this._head;
    this.geometry.setDrawRange(0,
      Math.max(0, this._live - 1) * this.strands * (this.across - 1) * 6);

    const throat = env && env.throatRadius != null ? env.throatRadius : 0;
    if (throat > 0.05) {
      // Head sized to the bell, not to the hull: the burn exits the throat, so its mouth is the
      // throat's own width. The sheath loosens downstream but stays a cord, not a gauze tube.
      //
      // THESE UNIFORMS DESCRIBE THE BELL AT FULL DRIVE, NOT THE BELL RIGHT NOW. The live throat is
      // `base * (0.72 + drive * 0.28)`, so dividing that shape back out recovers the drive-free
      // base; the vertex stage then re-applies each SAMPLE's own recorded drive. Writing the live
      // throat straight in, as this did, inflated and deflated the entire retained wake with the
      // throttle — light already laid down changing thickness, which is the same class of untruth
      // as moving it. The width a sample is born with is now part of the record.
      const driveNorm = Math.max(0, Math.min(1,
        (env && env.drive != null ? env.drive : env && env.spool) || 0));
      const baseThroat = throat / Math.max(0.72 + driveNorm * 0.28, 0.2);
      u.uRadiusHead.value = baseThroat * 0.92;
      u.uRadiusTail.value = baseThroat * 0.92 + 0.6;
      u.uWidthHead.value = Math.max(1.1, baseThroat * 0.95);
      u.uWidthTail.value = u.uWidthHead.value * 1.4;
    }
    if (env && env.trailRadiance != null) u.uRadiance.value = env.trailRadiance;
    if (env && env.trailOpacity != null) u.uOpacity.value = env.trailOpacity;

    this._resolveSeam(env);

    this.mesh.visible = this._live >= 2;
  }

  /**
   * @param {number} dt seconds
   * @param {{x:number,y:number,z:number}|null} nozzle current world position of the exhaust source
   * @param {object} env immutable birth-state source; reads drive/spool, emitFloor, boost and dash
   */
  update(dt, nozzle, env) {
    const d = Math.max(0, dt || 0);
    this._recorded = false;
    this._age(d);

    const drive = Math.max(0, Math.min(1.4,
      (env && env.drive != null ? env.drive : env && env.spool) || 0));
    const floor = env && env.emitFloor != null ? env.emitFloor : 0.02;
    const boost = Math.max(0, (env && env.boost) || 0);
    const dash = Math.max(0, (env && env.dash) || 0);
    const spin = env && Number.isFinite(env.spin) ? env.spin : 0;
    if (spin !== 0) this._helixPhase += spin * d;
    const wasEmitting = this._isEmitting;
    const isEmitting = !!(nozzle && drive > floor);
    this._isEmitting = isEmitting;

    if (isEmitting) {
      const x = Number.isFinite(nozzle.x) ? nozzle.x : 0;
      const y = Number.isFinite(nozzle.y) ? nozzle.y : 0;
      const z = Number.isFinite(nozzle.z) ? nozzle.z : 0;
      // Across the FLOWN LINE in the flight plane (the perpendicular of the bell's own movement since
      // the last recorded sample — never the exhaust axis, which this history must not know about):
      // the recorded point rides the helix, the gate below reads the raw nozzle, so a spun ship
      // samples when its bell moves, not when the helix turns. The first sample of a segment has no
      // movement to be across, and records where the bell is.
      const helix = spinHelixOffset(spin, this._helixPhase);
      let rx = x;
      let rz = z;
      if (helix !== 0 && this._live > 0 && wasEmitting) {
        const mx = x - this._gateX;
        const mz = z - this._gateZ;
        const ml = Math.hypot(mx, mz);
        if (ml > 1e-9) {
          rx = x - (mz / ml) * helix;
          rz = z + (mx / ml) * helix;
        }
      }

      const record = (segment, stepX, stepZ, stepLen) => {
        if (this._push(rx, y, rz, drive, boost, dash, segment)) {
          this._gateX = x; this._gateY = y; this._gateZ = z;
          // Heading of the step just committed, on the RAW bell track. Used only to decide where
          // the next sample is worth taking; it never moves a recorded point.
          if (stepLen > 1e-9) {
            this._dirX = stepX / stepLen;
            this._dirZ = stepZ / stepLen;
            this._hasDir = true;
          }
          // E5: the seam's motif advances with emission, never with a clock. The handoff is
          // resolved once per frame in _resolveSeam, which latches its phase only when this is set.
          this._recorded = true;
          return true;
        }
        return false;
      };

      if (this._live === 0) {
        this._hasDir = false;
        record(this._segmentId, 0, 0, 0);
      } else if (!wasEmitting) {
        // A period with no burn is not part of the burn history, even when the ship barely moved.
        // Start a disconnected segment rather than drawing a false bridge through that interval.
        const nextSegment = this._segmentId + 1;
        this._hasDir = false;
        if (record(nextSegment, 0, 0, 0)) this._segmentId = nextSegment;
      } else {
        const dx = x - this._gateX;
        const dy = y - this._gateY;
        const dz = z - this._gateZ;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (dist > DISCONTINUITY_WU) {
          // Keep old history in place and begin another segment at the new world position.
          const nextSegment = this._segmentId + 1;
          this._hasDir = false;
          if (record(nextSegment, 0, 0, 0)) this._segmentId = nextSegment;
        } else {
          // CURVATURE-AWARE SAMPLING. The step gate exists so a ship holding station cannot grind
          // out a pile of samples in one spot. But a slow, hard turn also moves very little per
          // frame, and a flat gate spent those frames recording nothing — so the tightest, most
          // interesting part of a pivot came out as the straightest part of the line.
          //
          // The gate now shortens with how far the bell's heading has swung since the last recorded
          // step, so detail lands where the line actually bends. Three properties keep this honest:
          // the turn is read off the RAW bell track (never the helix-offset recorded point, so a
          // spun hull samples exactly where an unspun one does), it can only ever ADD a sample that
          // the bell genuinely occupied, and the one-sample-per-update ceiling is unchanged — so
          // this buys detail on bends without raising the peak cost by a single vertex.
          let gate = MIN_STEP_WU;
          if (this._hasDir && dist > 1e-9) {
            const turn = 1 - Math.max(-1, Math.min(1,
              (dx / dist) * this._dirX + (dz / dist) * this._dirZ));
            const bend = Math.max(0, Math.min(1, turn / CURVE_GATE_REF));
            gate = MIN_STEP_WU * (1 - bend * (1 - CURVE_GATE_MIN_FRACTION));
          }
          if (dist >= gate) record(this._segmentId, dx, dz, dist);
          // Below the gate: do nothing. In particular, never move or rejuvenate sample 0.
        }
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
    const head = this._slot(0) * 4;
    const segment = this._state[head + 3];
    let back = -1;
    const limit = Math.min(4, this._live);
    for (let i = 1; i < limit; i++) {
      const s = this._slot(i) * 4;
      if (Math.abs(this._state[s + 3] - segment) < 0.25) back = s;
      else break;
    }
    if (back < 0) return false;
    const dx = this._path[back] - this._path[head];
    const dy = this._path[back + 1] - this._path[head + 1];
    const dz = this._path[back + 2] - this._path[head + 2];
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
      const s = this._slot(i) * 4;
      out.push({
        x: this._path[s],
        y: this._path[s + 1],
        z: this._path[s + 2],
        age: Math.max(0, this._now - this._path[s + 3]),
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
      const h = this._slot(0) * 4;
      const b = this._slot(this._live - 1) * 4;
      chord = Math.hypot(
        this._path[h] - this._path[b],
        this._path[h + 1] - this._path[b + 1],
        this._path[h + 2] - this._path[b + 2],
      );
      for (let i = 1; i < this._live; i++) {
        const a = this._slot(i - 1) * 4;
        const c = this._slot(i) * 4;
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
      // Storage shape and the E5 join, for probes and the cost note.
      storage: 'ring',
      ringHead: this._head,
      sampleShifts: 0,
      birthWidth: true,
      jetSeam: this.material.uniforms.uSeamAge.value > 0,
      jetSeamAgeFraction: this.material.uniforms.uSeamAge.value,
      jetSeamHalfWidthWU: this.material.uniforms.uSeamHalfWidth.value,
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
