/**
 * THE FOLD FIELD — one shared law for the bright creases that make a plume read as sheets.
 *
 * WHAT A CREASE IS
 * ----------------
 * A plasma sheet is brilliant where the view catches its edge, because the optical path through
 * it is long there, and nearly invisible face-on. Every bright line in the reference image is a
 * fold of a sheet seen edge-on. The player jet gets that for free: it is real curved geometry with
 * a real normal, so `1/|N·V|` does the work. The fleet drives cannot — they are instanced shells,
 * and one shell cannot contain the several sheets that would fold across each other inside it.
 *
 * So the fold arrangement INSIDE the shell is authored here, as a field: where the ridges are,
 * how sharp each one is, whether alternate ridges are paired, how the pattern travels or beats,
 * and where it shreds. The shell's own `1/|N·V|` grazing term (the vertex stage's `vGrazing`)
 * still supplies the view response; this supplies the structure the view response acts on.
 *
 * WHY IT IS ONE LAW AND NOT A STACK
 * ---------------------------------
 * The fragment stage already carried a filament pattern — an azimuthal sine with a hardcoded
 * count, applied only to the broad roles. It was the right idea with no vocabulary in it: every
 * family got five filaments at the same depth. This replaces that expression rather than sitting
 * on top of it. Adding a second fold pattern beside the first is exactly what the surrounding
 * file warns produces four plumes stacked on one axis.
 *
 * WHY IT IS MIRRORED IN JS
 * ------------------------
 * Same contract as `axialWidthEnvelope.js`: the GLSL below and the JS above it are the same
 * algebra, so a node test can assert a property of the shipped shader without a GPU. The one
 * that matters most is E3's: at a FIXED ship pose and a FIXED throttle, the field must still
 * change with time. A stationary firing ship has to show moving exhaust, and that is checkable
 * here rather than only in a screenshot.
 *
 * Numerically the two agree to float32 tolerance: every term is a bounded trig or power of a
 * small argument, deliberately avoiding the large-multiplier hash idiom whose low bits differ
 * between a float32 GPU and float64 JS.
 */

import { resolveFamilyConstruction } from '../recipes/familyConstruction.js';

const TAU = 6.283185307179586;
const PI = 3.141592653589793;

function smoothstep(edge0, edge1, x) {
  if (!(edge1 > edge0)) return x >= edge1 ? 1 : 0;
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function mix(a, b, t) {
  return a + (b - a) * t;
}

function step(edge, x) {
  return x < edge ? 0 : 1;
}

/**
 * THE FOLD CLOCK, and why it is integrated on the CPU.
 *
 * The obvious way to make creases run faster under throttle is to scale the time term:
 * `phase = ... - uTime * rate * (0.55 + drive * 0.75)`. That is frequency modulation without
 * phase integration, and it is wrong in a way that only shows up after the game has been running
 * for a while. `uTime` is unbounded, so changing the rate multiplies the WHOLE elapsed time by a
 * different number and the phase jumps by the difference. Measured on the ion drive: a 0.3 -> 1.0
 * spool moves the crease phase by 5 rad one second into a session, 633 rad two minutes in, and
 * 6333 rad twenty minutes in. Every spool, every boost tap and every ignition transient would
 * scrub a hundred creases past the eye in a third of a second, worse the longer you played.
 *
 * The old soft filament pattern had the same shape and got away with it because smooth noise
 * hides a scrub. Sharp creases do not — they are exactly the structure that makes a scrub visible.
 *
 * So the rate is integrated into a clock on the CPU, once per material per frame, and the shader
 * reads a phase that only ever moves forward at the current speed. Throttle and boost still reach
 * the fragment directly, but only for things that are instantaneous by nature: how sharp the
 * crease is and how deep the interior goes.
 *
 * @param {number} drive effective throttle 0..1+
 * @param {number} boost boost blend 0..1
 * @param {boolean} reducedMotion calm the flow without freezing it
 * @returns {number} clock units per second
 */
export function foldClockRate(drive, boost, reducedMotion) {
  const d = Math.max(0, Math.min(1.4, drive || 0));
  const b = Math.max(0, Math.min(1, boost || 0));
  return (0.55 + d * 0.75) * (1 + b * 0.5) * (reducedMotion ? 0.35 : 1);
}

/**
 * How much of the family's extent spread a role is allowed to spend.
 *
 * The hot core is the last thing to shred: it is the collimated part. The cold outer material is
 * what tears off early. Scaling the spread by role rather than hashing each role separately also
 * guarantees the ordering — a core can never end up SHORTER than the vapor wrapped around it,
 * which would draw a hot stub inside a longer cold sleeve.
 *
 * @param {number} layerRole 0 core, 1 inner, 2 sheath, 3 vapor
 */
export function plumeRoleReachScale(layerRole) {
  const r = Math.max(0, Math.min(3, layerRole || 0));
  return 0.3 + (r / 3) * 0.7;
}

/**
 * Per-instance extent, in [1 - reachSpread * roleScale, 1].
 *
 * B18 is "uniform extent across all elements of an effect, so they all end at the same place".
 * Every instance of a role used to end at exactly the same station, so a fleet drive had a flat
 * chopped back edge and two ships of one family were pixel-identical. This shortens each instance
 * by its own amount, seeded from the instance's own phase — which is now per-socket AND per-entity.
 *
 * The seed deliberately excludes the role, so every layer of one instance draws the SAME hash and
 * the role scale alone decides how much of it each spends. That is what keeps the core inside its
 * own sheath.
 *
 * It can only ever SHORTEN. A reach above 1 would push material at the mesh's own end, which is
 * the hard cut-off B9 rejects; the mesh end must always be somewhere the material has finished.
 *
 * @param {number} seed the instance's phase
 * @param {number} reachSpread construction `reachSpread`, already multiplied by the role scale
 */
export function plumeInstanceReach(seed, reachSpread) {
  const spread = Math.max(0, Math.min(0.5, reachSpread || 0));
  return 1 - spread * (0.5 + 0.5 * Math.sin(seed * 12.9898 + 4.1));
}

/**
 * Throat attachment. Where the exhaust meets the bell and how the mouth is built.
 *
 * A disciplined drive welds its column to the lip: full material immediately, a hard sear, no
 * stand-off. A loaded drive stands off and breaks into lobes before the column opens, which is
 * the single strongest tell that one machine is working harder than the other — it is legible
 * before you can resolve anything else about the plume.
 *
 * @param {number} along axial fraction, 0 at the lip
 * @param {number} side shell cross-section coordinate, about -1..1
 * @param {{throatBite:number, mouthLobes:number}} c construction
 */
export function plumeThroatAttach(along, side, c) {
  const mouthZone = 1 - smoothstep(0, 0.22, along);
  const lobe = 0.5 + 0.5 * Math.cos(side * c.mouthLobes * PI);
  const broken = mix(1, 0.42 + 0.72 * lobe, (1 - c.throatBite) * mouthZone);
  const weld = 1 + c.throatBite * 0.55 * mouthZone;
  return broken * weld;
}

/**
 * Standing compression cells imposed by the nozzle itself.
 *
 * Deliberately NOT a travelling term and deliberately decayed within a few units of the lip. A
 * shock train that survives far downstream reads as a rung ladder — the striped cone this whole
 * construction exists to avoid — while the couple of diamonds a real nozzle shows near its throat
 * is structure the eye reads as machinery.
 */
export function plumeCompression(along, c) {
  return 1 + c.compressionDepth * Math.cos(along * c.compressionPitch) * Math.exp(-along * 3.2);
}

/**
 * The fold field itself. Returns a multiplier on the sheet's brightness.
 *
 * Bounded below by `1 - creaseDepth`, so a crease can never open a hole between sheets: the
 * interior darkens, it does not disappear. Spreading a fixed amount of material into separated
 * bright lines with gaps between them is B19, and the floor is what prevents it.
 *
 * @param {number} along axial fraction 0..1
 * @param {number} side shell cross-section coordinate, about -1..1
 * @param {number} axialNoise the fragment's existing axial breakup field, 0..1
 * @param {number} drive effective throttle 0..1+ (sharpens the crease; does NOT scale the clock)
 * @param {number} boost boost blend 0..1 (same)
 * @param {number} foldTime the integrated fold clock, in clock units — see foldClockRate. Both
 *   the travelling wave and the standing beat ride it, so opening the taps speeds them together
 *   without any term multiplying elapsed time.
 * @param {object} c construction from resolveFamilyConstruction
 */
export function plumeFoldField(along, side, axialNoise, drive, boost, foldTime, c) {
  const beatOn = step(0.001, c.foldBeatHz);
  // The beat rides the same integrated clock as the travel, so a field drive under load beats
  // harder and faster without the elapsed-time scrub that scaling the clock in here would cause.
  const beat = Math.sin(foldTime * TAU * c.foldBeatHz);

  // Where the crease band sits across the shell. Zero is a solid column; a non-zero annulus puts
  // the ridges off the centreline, so the plume has an inner edge as well as an outer one.
  const ringD = (Math.abs(side) - c.foldAnnulus) * 2.6;
  const ringBand = Math.exp(-(ringD * ringD));
  const ring = mix(1, 0.35 + 1.35 * ringBand, step(0.001, c.foldAnnulus));

  // Travelling wave: position minus time, so ridges are born at the lip and run aft. The beat
  // term rocks the whole arrangement in place instead, which is what a field drive does — it is
  // still position-minus-time plus a slow evolution, never a frozen image (E3, B16).
  const phase = side * c.foldCount * PI
    + along * c.foldPitch * TAU
    - foldTime * c.foldTravel * TAU
    + beat * 1.15 * beatOn;

  const wave = 0.5 + 0.5 * Math.cos(phase);
  // Throttle sharpens the crease. An engine under load has harder shear layers, so the bright
  // line narrows and the interior between ridges darkens as the taps open — the structural read
  // of the throttle, distinct from the plume simply getting longer.
  const sharp = Math.max(1, c.creaseSharp * (0.72 + drive * 0.42) * (1 + boost * 0.18));
  let crease = Math.pow(Math.max(wave, 0), sharp);

  // Alternate ridges weighted: two hot sheets interleaved with two cool ones reads as a paired
  // drive sharing one throat.
  crease *= Math.max(0, 1 + c.creaseBias * Math.cos(phase * 0.5));

  // Downstream the arrangement stops being an arrangement. Each ridge is shredded by the axial
  // field at its own rate, so the cooling reaches break off individually rather than together.
  crease *= mix(1, 0.3 + 1.35 * axialNoise, c.foldBreak * smoothstep(0.22, 0.92, along));

  const depth = c.creaseDepth * (1 + 0.45 * beat * beatOn);
  const amount = Math.max(0, Math.min(0.78, depth));
  return (1 - amount) + amount * Math.min(crease * ring * 1.45, 1.9);
}

/**
 * GLSL for the same three laws. Must stay algebraically equivalent to the JS above.
 *
 * Injected into the flow/flipbook fragment stage. Reads the construction uniforms the material
 * binds once at creation: uFoldCount, uCreaseDepth, uCreaseSharp, uCreaseBias, uFoldTravel,
 * uFoldPitch, uFoldBreak, uFoldBeatHz, uFoldAnnulus, uThroatBite, uMouthLobes,
 * uCompressionPitch, uCompressionDepth, uReachSpread.
 */
export const PLUME_FOLD_FIELD_GLSL = /* glsl */`
// Shared fold field (must match plumeFoldField.js)
// uFoldTime is the INTEGRATED fold clock. Nothing in here may multiply it by drive or boost:
// scaling an unbounded elapsed time is frequency modulation without phase integration, and it
// scrubs hundreds of creases past the eye on every spool once a session has been running a while.
float plumeRoleReachScale(float layerRole) {
  return 0.3 + clamp(layerRole, 0.0, 3.0) / 3.0 * 0.7;
}

float plumeInstanceReach(float seed, float roleScale) {
  float spread = clamp(uReachSpread * roleScale, 0.0, 0.5);
  return 1.0 - spread * (0.5 + 0.5 * sin(seed * 12.9898 + 4.1));
}

float plumeThroatAttach(float along, float side) {
  float mouthZone = 1.0 - smoothstep(0.0, 0.22, along);
  float lobe = 0.5 + 0.5 * cos(side * uMouthLobes * 3.14159265);
  float broken = mix(1.0, 0.42 + 0.72 * lobe, (1.0 - uThroatBite) * mouthZone);
  float weld = 1.0 + uThroatBite * 0.55 * mouthZone;
  return broken * weld;
}

float plumeCompression(float along) {
  return 1.0 + uCompressionDepth * cos(along * uCompressionPitch) * exp(-along * 3.2);
}

float plumeFoldField(float along, float side, float axialNoise, float drive, float boost, float t) {
  float beatOn = step(0.001, uFoldBeatHz);
  float beat = sin(t * 6.28318531 * uFoldBeatHz);

  float ringD = (abs(side) - uFoldAnnulus) * 2.6;
  float ringBand = exp(-(ringD * ringD));
  float ring = mix(1.0, 0.35 + 1.35 * ringBand, step(0.001, uFoldAnnulus));

  float phase = side * uFoldCount * 3.14159265
    + along * uFoldPitch * 6.28318531
    - t * uFoldTravel * 6.28318531
    + beat * 1.15 * beatOn;

  float wave = 0.5 + 0.5 * cos(phase);
  float sharp = max(1.0, uCreaseSharp * (0.72 + drive * 0.42) * (1.0 + boost * 0.18));
  float crease = pow(max(wave, 0.0), sharp);
  crease *= max(0.0, 1.0 + uCreaseBias * cos(phase * 0.5));
  crease *= mix(1.0, 0.3 + 1.35 * axialNoise, uFoldBreak * smoothstep(0.22, 0.92, along));

  float depth = clamp(uCreaseDepth * (1.0 + 0.45 * beat * beatOn), 0.0, 0.78);
  return (1.0 - depth) + depth * min(crease * ring * 1.45, 1.9);
}
`;

/**
 * AUTHORING / BAKE SOURCE.
 *
 * The construction table is the editable source of a family's fold arrangement, and this renders
 * it: an RGBA sheet of one family's fold field over (along × side) at a chosen moment, so the
 * numbers can be looked at as a picture rather than argued about as a list. Pair it with
 * `../textures/encodePng.js` to write a PNG for review, or diff two families' sheets to see
 * whether a construction change actually changed the machine.
 *
 * Pure and deterministic: the same family, size and time always produce the same bytes. Nothing
 * on the render path calls it — it is an authoring tool that shares the shipped law rather than
 * a second implementation that can drift from it.
 *
 * @param {string} family engineFamily id
 * @param {{width?:number, height?:number, time?:number, drive?:number, boost?:number}} opts
 * @returns {{width:number, height:number, data:Uint8Array}} RGBA8, row-major, top row = the lip
 */
export function bakeFoldProfileRgba(family, opts = {}) {
  const width = Math.max(8, Math.min(1024, opts.width || 256));
  const height = Math.max(8, Math.min(1024, opts.height || 128));
  const time = Number.isFinite(opts.time) ? opts.time : 0;
  const drive = Number.isFinite(opts.drive) ? opts.drive : 1;
  const boost = Number.isFinite(opts.boost) ? opts.boost : 0;
  const c = resolveFamilyConstruction(family);
  const data = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y++) {
    const side = (y / (height - 1)) * 2 - 1;
    for (let x = 0; x < width; x++) {
      const along = x / (width - 1);
      // A mild deterministic stand-in for the fragment's axial breakup field, so the bake shows
      // the shredding the family actually applies rather than a clean pattern it never draws.
      const axialNoise = 0.5 + 0.5 * Math.sin(along * 9.3 + side * 2.1 + 1.7);
      const fold = plumeFoldField(along, side, axialNoise, drive, boost, time, c);
      const attach = plumeThroatAttach(along, side, c);
      const cells = plumeCompression(along, c);
      const v = Math.max(0, Math.min(1, (fold * attach * cells) / 2.6));
      const i = (y * width + x) * 4;
      // R = the fold field alone, G = with the mouth, B = the full product, A = opaque.
      data[i] = Math.round(Math.max(0, Math.min(1, fold / 1.9)) * 255);
      data[i + 1] = Math.round(Math.max(0, Math.min(1, attach / 1.8)) * 255);
      data[i + 2] = Math.round(v * 255);
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}
