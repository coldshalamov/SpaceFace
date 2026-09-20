/**
 * PROPULSION VOCABULARY — behavioural tests for how the drive families are BUILT.
 *
 * The existing VP-220 suite proves each family's recipe NUMBERS differ. This one proves the
 * resulting machines do, and pins the four properties that are easy to lose silently:
 *
 *   1. A stationary firing ship shows moving exhaust. Nothing else in the suite asserts it, and
 *      it is the failure that looks fine in a still and wrong the moment you play.
 *   2. The fold arrangement never opens holes between sheets (B19) and never ends every element
 *      at one shared station (B18).
 *   3. RCS and retro read as a force impulse — a packet leaving a shutting valve — not as a short
 *      trail of where the ship has been.
 *   4. Lighting a drive is an event, not the first part of a ramp.
 *
 * Every assertion runs against the shipped law, not a copy of it: the fold field is written once
 * and mirrored in JS and GLSL the same way `axialWidthEnvelope.js` is, so what is measured here
 * is what the fragment stage computes.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  FAMILY_CONSTRUCTION,
  SILHOUETTE_CANDIDATES,
  CONSTRUCTION_LIMITS,
  resolveFamilyConstruction,
  constructionDistance,
  selectedSilhouette,
} from '../src/render/thruster/recipes/familyConstruction.js';
import {
  plumeFoldField,
  plumeInstanceReach,
  plumeThroatAttach,
  plumeCompression,
  bakeFoldProfileRgba,
  PLUME_FOLD_FIELD_GLSL,
} from '../src/render/thruster/materials/plumeFoldField.js';
import {
  FLOW_FLIPBOOK_FRAGMENT,
  FLOW_FLIPBOOK_VERTEX,
  DISTORTION_FRAGMENT,
  createFlowFlipbookMaterial,
} from '../src/render/thruster/materials/flowFlipbookMaterial.js';
import { listThrusterRecipePacks } from '../src/render/thruster/recipes/registry.js';
import {
  ContinuousPlumeSystem,
  entityPhaseOffset,
} from '../src/render/thruster/systems/continuousPlume.js';
import { RcsImpulseSystem } from '../src/render/thruster/systems/rcsImpulse.js';
import {
  integrateDriveState,
  compileDriveRates,
  sampleImpulseEnvelope,
} from '../src/render/thruster/systems/throttleResponse.js';
import {
  integrateRetroSpool,
  retroEnvelopeForDemand,
  retroEnvelopeIsJetLike,
} from '../src/render/thruster/systems/playerRetroVolume.js';
import {
  resolveJetHandoff,
  resolvePlumeShape,
  createDriveEnvelope,
  HANDOFF_STATION,
} from '../src/render/thruster/ribbon/driveEnvelope.js';

const A11Y_OFF = { reducedMotion: false, reducedFlash: false, lowQuality: false, qualityTier: 'high' };
const A11Y_REDUCED = { reducedMotion: true, reducedFlash: true, lowQuality: false, qualityTier: 'high' };
const SOCKETS = [{ x: 0, y: 0, z: 0, ax: -1, ay: 0, az: 0 }];

const PACKS = listThrusterRecipePacks();
const FAMILIES = PACKS.map((p) => p.main.engineFamily);

/** Sample the fold field over a grid, at one moment. */
function foldGrid(c, time, drive = 0.8, boost = 0) {
  const out = [];
  for (let i = 0; i <= 16; i++) {
    for (let j = 0; j <= 12; j++) {
      const along = i / 16;
      const side = (j / 12) * 2 - 1;
      const axialNoise = 0.5 + 0.5 * Math.sin(along * 9.3 + side * 2.1 + 1.7);
      out.push(plumeFoldField(along, side, axialNoise, drive, boost, time, c));
    }
  }
  return out;
}

// ── 1. A stationary firing ship must show unmistakable moving exhaust ────────────────────────

test('a stationary firing ship shows moving exhaust: the clock advances and reaches the shader', () => {
  for (const pack of PACKS) {
    const sys = new ContinuousPlumeSystem(THREE, pack.main, { distortionEnabled: false });
    // The ship never moves and the throttle never changes. The SAME socket object, the same
    // pose, the same drive, for a quarter of a second of frames.
    sys.update(1 / 60, 0.8, SOCKETS, { a11y: A11Y_OFF });
    const batch = sys.layerBatches[0];
    const t0 = batch.material.uniforms.uTime.value;
    const firstOffset = batch.offset.slice(0, 3);
    for (let f = 0; f < 15; f++) sys.update(1 / 60, 0.8, SOCKETS, { a11y: A11Y_OFF });
    const t1 = batch.material.uniforms.uTime.value;
    const lastOffset = batch.offset.slice(0, 3);

    assert.ok(t1 - t0 > 0.2,
      `${pack.profileId}: material clock must advance while parked (${t1 - t0}s)`);
    // Proof that "stationary" is真 stationary: nothing about the pose moved.
    assert.deepEqual(Array.from(lastOffset), Array.from(firstOffset),
      `${pack.profileId}: the test ship must not have moved`);
    assert.ok(batch.writeCount > 0, `${pack.profileId}: the parked drive must still draw`);
    sys.dispose();
  }
});

test('a stationary firing ship shows moving exhaust: the field itself changes, every family', () => {
  for (const family of FAMILIES) {
    const c = resolveFamilyConstruction(family);
    const a = foldGrid(c, 0);
    const b = foldGrid(c, 0.25);
    let sum = 0;
    let max = 0;
    for (let i = 0; i < a.length; i++) {
      const d = Math.abs(a[i] - b[i]);
      sum += d;
      if (d > max) max = d;
    }
    const mean = sum / a.length;
    // Thresholds sit well under the slowest family's measured values (plasma_ring: mean 0.176,
    // max 0.473) and well over anything a frozen field could produce.
    assert.ok(mean > 0.08,
      `${family}: exhaust must MOVE at a fixed pose and throttle (mean change ${mean.toFixed(4)})`);
    assert.ok(max > 0.25,
      `${family}: exhaust must move visibly somewhere (max change ${max.toFixed(3)})`);
  }
});

test('reduced motion calms the exhaust without freezing it', () => {
  for (const family of FAMILIES) {
    const c = resolveFamilyConstruction(family);
    // The fragment feeds the fold field a clock scaled by mix(1.0, 0.35, uReducedMotion).
    const a = foldGrid(c, 0);
    const slow = foldGrid(c, 0.25 * 0.35);
    let moved = 0;
    for (let i = 0; i < a.length; i++) moved += Math.abs(a[i] - slow[i]);
    assert.ok(moved / a.length > 0.02,
      `${family}: reduced motion must slow the exhaust, not stop it`);
  }
});

// ── 2. The arrangement: separation without holes, and no shared terminal plane ────────────────

test('creases darken the interior but never open a hole between sheets (B19)', () => {
  for (const family of FAMILIES) {
    const c = resolveFamilyConstruction(family);
    let min = Infinity;
    let max = -Infinity;
    for (let t = 0; t < 8; t++) {
      for (const v of foldGrid(c, t * 0.137, 1, 1)) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    assert.ok(min > 0.15,
      `${family}: the dark interior must still carry material (min ${min.toFixed(3)})`);
    assert.ok(max / min > 1.8,
      `${family}: a crease must be visibly brighter than its interior (contrast ${(max / min).toFixed(2)})`);
  }
});

test('per-instance extent varies and can only ever shorten (B18, B9)', () => {
  for (const family of FAMILIES) {
    const c = resolveFamilyConstruction(family);
    const seen = [];
    for (let s = 0; s < 64; s++) {
      const reach = plumeInstanceReach(s * 0.137, c.reachSpread);
      assert.ok(reach <= 1 + 1e-9,
        `${family}: reach must never push material past the mesh end (${reach})`);
      assert.ok(reach >= 1 - c.reachSpread - 1e-9,
        `${family}: reach must stay inside the authored spread (${reach})`);
      seen.push(reach);
    }
    const spread = Math.max(...seen) - Math.min(...seen);
    assert.ok(spread > c.reachSpread * 0.7,
      `${family}: instances must not all end at the same station (observed spread ${spread.toFixed(3)})`);
  }
});

test('two ships of one family do not animate in lockstep', () => {
  const a = entityPhaseOffset(101);
  const b = entityPhaseOffset(102);
  assert.notEqual(a, b, 'different hulls must get different phases');
  assert.equal(entityPhaseOffset(101), a, 'a hull keeps its phase across frames');
  assert.equal(entityPhaseOffset(null), 0, 'the no-entity path stays at the legacy phase');
  assert.ok(a >= 0 && a < 1 && b >= 0 && b < 1, 'phase stays normalized');
  // And it reaches the instance data the shader reads.
  const pack = PACKS[0];
  const sys = new ContinuousPlumeSystem(THREE, pack.main, { maxSockets: 8, distortionEnabled: false });
  const stateA = { plumeDrive: 0, boostBlend: 0, ignition: 0 };
  const stateB = { plumeDrive: 0, boostBlend: 0, ignition: 0 };
  sys.beginUpdate(A11Y_OFF);
  sys.writeEntity(1 / 60, 0.8, SOCKETS, { entityId: 101 }, stateA, 4);
  sys.writeEntity(1 / 60, 0.8, SOCKETS, { entityId: 102 }, stateB, 4);
  sys.endUpdate(1 / 60);
  const batch = sys.layerBatches[0];
  assert.ok(batch.writeCount >= 2, 'both ships wrote an instance');
  assert.notEqual(batch.params[2], batch.params[4 + 2],
    'two hulls of one family must not share a phase');
  sys.dispose();
});

// ── 3. Families are different machines, not one machine at several sizes ─────────────────────

test('every live family pair differs on several construction axes', () => {
  for (let i = 0; i < FAMILIES.length; i++) {
    for (let j = i + 1; j < FAMILIES.length; j++) {
      const d = constructionDistance(FAMILIES[i], FAMILIES[j]);
      assert.ok(d.differing >= 4,
        `${FAMILIES[i]} vs ${FAMILIES[j]}: only ${d.differing} build axes differ (${d.differs})`);
    }
  }
});

test('disciplined and loaded drives are opposites, not neighbours', () => {
  const vector = resolveFamilyConstruction('vector');
  const industrial = resolveFamilyConstruction('industrial');
  assert.ok(vector.foldCount < industrial.foldCount, 'a loaded torch carries more sheets');
  assert.ok(vector.creaseSharp > industrial.creaseSharp, 'a disciplined crease is harder');
  assert.ok(vector.shellArc < industrial.shellArc, 'a needle wraps less than a barrel');
  assert.ok(vector.throatBite > industrial.throatBite, 'a disciplined mouth is welded to the lip');
  assert.ok(vector.mouthLobes < industrial.mouthLobes, 'a loaded mouth breaks into lobes');
  assert.ok(vector.reachSpread < industrial.reachSpread, 'a loaded torch tears off raggedly');
  assert.ok(vector.foldTravel > industrial.foldTravel, 'a disciplined drive runs faster and cleaner');
  assert.ok(vector.foldBreak < industrial.foldBreak, 'a disciplined drive stays parallel longer');

  // And that difference is visible in the mouth, at the mouth, before anything else resolves.
  let disciplinedRange = 0;
  let loadedRange = 0;
  for (let j = 0; j <= 20; j++) {
    const side = (j / 20) * 2 - 1;
    disciplinedRange = Math.max(disciplinedRange, plumeThroatAttach(0.02, side, vector));
    loadedRange = Math.max(loadedRange, plumeThroatAttach(0.02, side, industrial));
  }
  let loadedMin = Infinity;
  for (let j = 0; j <= 20; j++) {
    const side = (j / 20) * 2 - 1;
    loadedMin = Math.min(loadedMin, plumeThroatAttach(0.02, side, industrial));
  }
  assert.ok(loadedRange / loadedMin > 1.4,
    'an industrial mouth must show lobes and notches across its width');
  assert.ok(disciplinedRange > loadedRange * 0.95,
    'a disciplined mouth sears harder at the lip than a loaded one');
});

test('the unusual families do not read as reaction drives', () => {
  const resonator = resolveFamilyConstruction('resonator');
  const ring = resolveFamilyConstruction('plasma_ring');
  const ion = resolveFamilyConstruction('ion_small');
  assert.equal(ion.foldBeatHz, 0, 'a reaction drive does not beat in place');
  assert.ok(resonator.foldBeatHz > 0.5, 'the field drive beats');
  assert.ok(resonator.foldTravel < ion.foldTravel * 0.35,
    'the field drive must not look like it is throwing mass');
  assert.equal(ion.foldAnnulus, 0, 'a reaction drive is a solid column');
  assert.ok(ring.foldAnnulus > 0.3, 'the capital drive is a hollow sleeve');

  // The sleeve must actually be hollow: the crease band sits away from the centreline.
  let centre = 0;
  let band = 0;
  for (let t = 0; t < 6; t++) {
    centre += plumeFoldField(0.4, 0.02, 0.5, 1, 0, t * 0.2, ring);
    band += plumeFoldField(0.4, ring.foldAnnulus, 0.5, 1, 0, t * 0.2, ring);
  }
  assert.ok(band > centre * 1.05,
    `the ring's plasma must sit off the centreline (band ${band.toFixed(2)} vs centre ${centre.toFixed(2)})`);
});

test('the three-silhouette prototype record is complete and one candidate is wired per group', () => {
  for (const group of ['disciplined', 'loaded', 'unusual']) {
    const list = SILHOUETTE_CANDIDATES[group];
    assert.ok(Array.isArray(list) && list.length >= 3,
      `${group}: three candidates must be recorded`);
    const chosen = list.filter((c) => c.selected);
    assert.ok(chosen.length >= 1, `${group}: one candidate must be selected`);
    for (const candidate of list) {
      assert.ok(candidate.motion && candidate.motion.length > 40,
        `${group}/${candidate.id}: the motion must be described`);
      assert.ok(candidate.why && candidate.why.length > 40,
        `${group}/${candidate.id}: a selected candidate needs a reason and a rejected one needs a cause`);
    }
    assert.ok(selectedSilhouette(group), `${group}: the selected candidate must resolve`);
  }
  // Every wired family names a silhouette that exists in the record.
  const ids = new Set();
  for (const group of Object.keys(SILHOUETTE_CANDIDATES)) {
    for (const candidate of SILHOUETTE_CANDIDATES[group]) ids.add(candidate.id);
  }
  for (const family of FAMILIES) {
    const c = resolveFamilyConstruction(family);
    assert.ok(ids.has(c.silhouette), `${family}: silhouette ${c.silhouette} is not in the record`);
  }
});

test('construction values are clamped to their stated limits', () => {
  for (const family of Object.keys(FAMILY_CONSTRUCTION)) {
    const c = resolveFamilyConstruction(family);
    for (const [key, [lo, hi]] of Object.entries(CONSTRUCTION_LIMITS)) {
      assert.ok(Number.isFinite(c[key]), `${family}.${key} must be a number`);
      assert.ok(c[key] >= lo && c[key] <= hi,
        `${family}.${key} = ${c[key]} is outside [${lo}, ${hi}]`);
    }
  }
  // An unknown family must not crash the renderer; it falls back to the disciplined reading.
  const fallback = resolveFamilyConstruction('engine_that_does_not_exist');
  assert.ok(fallback.foldCount > 0 && fallback.shellArc > 0);
});

// ── 4. RCS and retro read as a force impulse ─────────────────────────────────────────────────

test('an RCS pulse throws a packet: the head leaves while the collar shuts', () => {
  for (const pack of PACKS) {
    const c = resolveFamilyConstruction(pack.rcs.engineFamily);
    const imp = c.impulse;
    // The head's position over the pulse, as the fragment computes it.
    const headAt = (pulse) => {
      const t = Math.max(0, Math.min(1, (pulse - imp.headLaunch) / Math.max(1e-6, 1 - imp.headLaunch)));
      return imp.headTravel * (t * t * (3 - 2 * t));
    };
    const early = headAt(0.25);
    const late = headAt(0.85);
    assert.ok(late > early + 0.25,
      `${pack.profileId}: the overpressure head must travel out along the jet (${early} -> ${late})`);
    // The collar is a valve, so it shuts well before the pulse is over.
    assert.ok(imp.collarHold < 0.6,
      `${pack.profileId}: the collar must shut inside the pulse (hold ${imp.collarHold})`);
    assert.ok(imp.collarLift > 0.5, `${pack.profileId}: the collar must actually flash`);
  }
});

test('an RCS jet holds its reach and does not retract into its nozzle', () => {
  for (const pack of PACKS) {
    const rcs = new RcsImpulseSystem(THREE, pack.rcs);
    rcs.fire([0, 0, 0], [1, 0, 0], 1);
    let peakLength = 0;
    let lengthAtLowEnvelope = 0;
    let lowEnvelope = 1;
    let sawPulseAdvance = false;
    let lastPulse = -1;
    for (let f = 0; f < 60; f++) {
      const result = rcs.update(1 / 60, A11Y_OFF);
      if (result.activeSlotCount === 0) break;
      const slot = rcs.pool.slots[0];
      if (slot.length > peakLength) peakLength = slot.length;
      if (slot.envelope < lowEnvelope && slot.envelope > 0.05) {
        lowEnvelope = slot.envelope;
        lengthAtLowEnvelope = slot.length;
      }
      if (slot.pulse > lastPulse) sawPulseAdvance = true;
      lastPulse = slot.pulse;
      assert.ok(slot.pulse >= 0 && slot.pulse <= 1, 'the pulse clock stays normalized');
    }
    assert.ok(sawPulseAdvance, `${pack.profileId}: the pulse clock must advance`);
    assert.ok(peakLength > 0, `${pack.profileId}: the impulse must reach`);
    assert.ok(lengthAtLowEnvelope >= peakLength * 0.98,
      `${pack.profileId}: reach must be HELD as pressure drops, not pulled back in `
      + `(${lengthAtLowEnvelope} vs peak ${peakLength})`);
    rcs.dispose();
  }
});

test('two RCS taps carry two independent clocks', () => {
  const rcs = new RcsImpulseSystem(THREE, PACKS[0].rcs);
  rcs.fire([0, 0, 0], [1, 0, 0], 1);
  for (let f = 0; f < 6; f++) rcs.update(1 / 60, A11Y_OFF);
  rcs.fire([5, 0, 0], [1, 0, 0], 1);
  rcs.update(1 / 60, A11Y_OFF);
  const pulses = new Set();
  for (let i = 0; i < rcs.pool.activeSlotCount; i++) pulses.add(rcs.pool.slots[i].pulse);
  assert.ok(pulses.size >= 2,
    'a rapid double tap must show two heads at two distances, not one smeared glow');
  rcs.dispose();
});

test('a shutting valve blows down rather than dimming at a constant rate', () => {
  const timing = { attack: 0.02, sustain: 0.05, release: 0.2 };
  const total = timing.attack + timing.sustain + timing.release;
  const start = timing.attack + timing.sustain;
  const quarter = sampleImpulseEnvelope(start + timing.release * 0.25, timing);
  const half = sampleImpulseEnvelope(start + timing.release * 0.5, timing);
  const threeQuarter = sampleImpulseEnvelope(start + timing.release * 0.75, timing);
  assert.ok(quarter < 0.65, `pressure must drop hard at first (${quarter})`);
  assert.ok(half > 0.15 && half < 0.35, `and then linger (${half})`);
  // Strictly decreasing, so nothing can read as a re-ignition.
  assert.ok(quarter > half && half > threeQuarter, 'the release is monotonic');
  assert.equal(sampleImpulseEnvelope(total + 0.01, timing), 0, 'and it genuinely ends');
});

test('the brake bites on engagement and relaxes into the held jet', () => {
  const volume = { spool: 0, bite: 0 };
  let peakBite = 0;
  for (let f = 0; f < 6; f++) {
    integrateRetroSpool(volume, 1, 1 / 60);
    if (volume.bite > peakBite) peakBite = volume.bite;
  }
  assert.ok(peakBite > 0.5, `standing on the brake must punch (${peakBite})`);
  for (let f = 0; f < 40; f++) integrateRetroSpool(volume, 1, 1 / 60);
  assert.equal(volume.bite, 0, 'and the punch must be over while the brake is still held');
  assert.ok(volume.spool > 0.85, 'the held brake stays lit');

  // Easing on must NOT bite: the transient is a rate event, not a level.
  const eased = { spool: 0, bite: 0 };
  let easedPeak = 0;
  for (let f = 0; f < 120; f++) {
    integrateRetroSpool(eased, Math.min(1, f / 110), 1 / 60);
    if (eased.bite > easedPeak) easedPeak = eased.bite;
  }
  assert.ok(easedPeak < 0.05, `easing onto the brake must not punch (${easedPeak})`);
  assert.ok(eased.spool > 0.8, 'but it still ends up braking');
});

test('the bite is heat and collimation, never reach: the jet-likeness contract holds', () => {
  for (const drive of [0.05, 0.4, 1, 1.4]) {
    for (const bite of [0, 0.5, 1]) {
      const env = retroEnvelopeForDemand(drive, null, bite);
      assert.ok(retroEnvelopeIsJetLike(env),
        `retro at drive ${drive} bite ${bite} must still read as a jet`);
    }
  }
  const cold = retroEnvelopeForDemand(1, null, 0);
  const hot = retroEnvelopeForDemand(1, null, 1);
  assert.equal(hot.lengthWU, cold.lengthWU, 'the bite must not stretch the jet');
  assert.ok(hot.radiance > cold.radiance * 1.2, 'the bite is heat');
  assert.ok(hot.spread < cold.spread, 'the bite collimates');
  // Reduced flash damps the punch's brightness but never removes the event.
  const damped = retroEnvelopeForDemand(1, { reducedFlash: true }, 1);
  assert.ok(damped.radiance < hot.radiance, 'reduced flash damps the punch');
  assert.ok(damped.boost > 0.5, 'but the structural punch survives it');
});

// ── 5. Spool, boost and release feel like machinery ──────────────────────────────────────────

test('lighting a drive is an event, not the first part of a ramp', () => {
  const rates = { driveRise: 9.5, driveFall: 4.2, boostRise: 8.5, boostFall: 3.6 };
  compileDriveRates(PACKS[0].main, rates);

  const thrown = { plumeDrive: 0, boostBlend: 0, ignition: 0 };
  let peak = 0;
  for (let f = 0; f < 8; f++) {
    integrateDriveState(thrown, 1, 1, 1 / 60, rates);
    if (thrown.ignition > peak) peak = thrown.ignition;
  }
  assert.ok(peak > 0.25, `throwing the taps open must produce a transient (${peak})`);
  for (let f = 0; f < 60; f++) integrateDriveState(thrown, 1, 1, 1 / 60, rates);
  assert.equal(thrown.ignition, 0, 'and it must be over while the drive is still running');
  assert.ok(thrown.plumeDrive > 0.9, 'the drive itself stays up');

  const eased = { plumeDrive: 0, boostBlend: 0, ignition: 0 };
  let easedPeak = 0;
  for (let f = 0; f < 180; f++) {
    const t = Math.min(1, f / 170);
    integrateDriveState(eased, t, t, 1 / 60, rates);
    if (eased.ignition > easedPeak) easedPeak = eased.ignition;
  }
  assert.ok(easedPeak < 0.08, `easing the throttle up must not fire the transient (${easedPeak})`);
});

test('the ignition transient is spent on structure, so reduced flash still sees the engine commit', () => {
  const sys = new ContinuousPlumeSystem(THREE, PACKS[0].main, { distortionEnabled: false });
  const calm = { plumeDrive: 0.9, boostBlend: 0, ignition: 0 };
  const lit = { plumeDrive: 0.9, boostBlend: 0, ignition: 1 };
  sys.beginUpdate(A11Y_REDUCED);
  sys.writeEntity(1 / 60, 0.9, SOCKETS, { entityId: 1 }, calm, 4);
  sys.endUpdate(1 / 60);
  const calmLength = sys.pool.slots[0].length;
  const calmDrive = sys.pool.slots[0].throttle;
  sys.beginUpdate(A11Y_REDUCED);
  sys.writeEntity(1 / 60, 0.9, SOCKETS, { entityId: 1 }, lit, 4);
  sys.endUpdate(1 / 60);
  const litLength = sys.pool.slots[0].length;
  const litDrive = sys.pool.slots[0].throttle;
  assert.ok(litLength > calmLength * 1.1,
    'ignition must overshoot the jet, under reduced flash as much as without it');
  assert.ok(litDrive > calmDrive + 0.2, 'and sharpen its structure');
  sys.dispose();
});

test('boost drives the arrangement harder rather than just brighter', () => {
  for (const family of FAMILIES) {
    const c = resolveFamilyConstruction(family);
    if (c.foldTravel <= 0.05) continue; // a standing beat has nothing to speed up
    // Boost speeds the fold travel, so the field at a fixed point diverges faster with boost on.
    let calm = 0;
    let boosted = 0;
    for (let i = 0; i <= 12; i++) {
      const along = i / 12;
      calm += Math.abs(
        plumeFoldField(along, 0.3, 0.5, 1, 0, 0, c) - plumeFoldField(along, 0.3, 0.5, 1, 0, 0.08, c),
      );
      boosted += Math.abs(
        plumeFoldField(along, 0.3, 0.5, 1, 1, 0, c) - plumeFoldField(along, 0.3, 0.5, 1, 1, 0.08, c),
      );
    }
    assert.ok(boosted > calm * 1.05,
      `${family}: boost must change the flow, not only the brightness (${calm.toFixed(3)} -> ${boosted.toFixed(3)})`);
  }
});

// ── 6. Fleet integration: sockets, turns, stop/start, speed, crowding ────────────────────────

test('fleet drives follow their sockets through turns, stops and restarts', () => {
  const pack = PACKS[2];
  const sys = new ContinuousPlumeSystem(THREE, pack.main, { maxSockets: 4, distortionEnabled: false });
  const sockets = [{ x: 10, y: 0, z: -4, ax: -1, ay: 0, az: 0 }];
  sys.update(1 / 60, 0.9, sockets, { a11y: A11Y_OFF });
  const batch = sys.layerBatches[0];
  assert.equal(batch.offset[0], 10, 'the jet is written at its socket');
  assert.equal(batch.offset[2], -4);
  assert.equal(batch.axisScale[0], -1, 'and along its socket axis');

  // A turn: the socket swings 90 degrees. The jet must follow the CURRENT axis.
  sockets[0].ax = 0;
  sockets[0].az = -1;
  sockets[0].x = 12;
  sys.update(1 / 60, 0.9, sockets, { a11y: A11Y_OFF });
  assert.equal(batch.axisScale[0], 0, 'the jet turns with the hull');
  assert.equal(batch.axisScale[2], -1);
  assert.equal(batch.offset[0], 12, 'and stays on the moving socket');

  // Stop: no drive, no idle floor on this family, nothing drawn.
  for (let f = 0; f < 90; f++) sys.update(1 / 60, 0, sockets, { a11y: A11Y_OFF });
  const stoppedDrive = sys.pool._driveState.plumeDrive;
  assert.ok(stoppedDrive < 0.02, `a stopped drive must go cold (${stoppedDrive})`);

  // Restart: it comes back, and it comes back through a spool rather than in one frame.
  sys.update(1 / 60, 1, sockets, { a11y: A11Y_OFF });
  const firstFrame = sys.pool._driveState.plumeDrive;
  assert.ok(firstFrame > 0 && firstFrame < 0.4,
    `a restart must spool, not snap (${firstFrame})`);
  for (let f = 0; f < 60; f++) sys.update(1 / 60, 1, sockets, { a11y: A11Y_OFF });
  assert.ok(sys.pool._driveState.plumeDrive > 0.9, 'and then reach full');
  sys.dispose();
});

test('a crowd of ships all draw, all differ, and cost no per-frame allocation', () => {
  const pack = PACKS[0];
  const sys = new ContinuousPlumeSystem(THREE, pack.main, { maxSockets: 32, distortionEnabled: false });
  const states = [];
  for (let i = 0; i < 12; i++) states.push({ plumeDrive: 0, boostBlend: 0, ignition: 0 });
  const socket = [{ x: 0, y: 0, z: 0, ax: -1, ay: 0, az: 0 }];

  let result = null;
  for (let f = 0; f < 4; f++) {
    sys.beginUpdate(A11Y_OFF);
    for (let i = 0; i < states.length; i++) {
      socket[0].x = i * 30;
      // High speed: the hull is moving fast and the drive is wide open.
      sys.writeEntity(1 / 60, 1, socket, { entityId: 700 + i, speedDrive: 1, boost: 1 }, states[i], 2);
    }
    result = sys.endUpdate(1 / 60);
  }
  assert.equal(result.entityWrites, 12, 'every ship in the crowd wrote');
  assert.equal(result.frameAllocations, 0, 'and the steady-state write path allocated nothing');

  const phases = new Set();
  for (let i = 0; i < sys.pool.activeCount; i++) phases.add(sys.pool.slots[i].phase);
  assert.ok(phases.size >= 12,
    `a crowd must not be one plume copied ${sys.pool.activeCount} times (${phases.size} distinct phases)`);
  sys.dispose();
});

// ── 7. The shipped shader carries the law, and the authoring source shares it ────────────────

test('the GLSL mirror carries every term the JS law does', () => {
  for (const fn of ['plumeInstanceReach', 'plumeThroatAttach', 'plumeCompression', 'plumeFoldField']) {
    assert.ok(PLUME_FOLD_FIELD_GLSL.includes(`float ${fn}(`), `GLSL is missing ${fn}`);
    assert.ok(FLOW_FLIPBOOK_FRAGMENT.includes(`${fn}(`), `the fragment stage never calls ${fn}`);
  }
  for (const u of [
    'uFoldCount', 'uCreaseDepth', 'uCreaseSharp', 'uCreaseBias', 'uFoldTravel', 'uFoldPitch',
    'uFoldBreak', 'uFoldBeatHz', 'uFoldAnnulus', 'uThroatBite', 'uMouthLobes',
    'uCompressionPitch', 'uCompressionDepth', 'uReachSpread',
  ]) {
    assert.ok(FLOW_FLIPBOOK_FRAGMENT.includes(`uniform float ${u};`),
      `the fragment stage never declares ${u}`);
  }
  // The trap that has broken this file before: a backtick inside a GLSL template literal
  // terminates the surrounding JS string and the module stops parsing.
  for (const [name, src] of [
    ['vertex', FLOW_FLIPBOOK_VERTEX],
    ['fragment', FLOW_FLIPBOOK_FRAGMENT],
    ['distortion', DISTORTION_FRAGMENT],
    ['fold field', PLUME_FOLD_FIELD_GLSL],
  ]) {
    assert.ok(!src.includes('`'), `${name} GLSL must not contain a backtick`);
  }
});

test('each family binds its own construction, and the distortion encoder stays flat', () => {
  for (const pack of PACKS) {
    const sys = new ContinuousPlumeSystem(THREE, pack.main, { distortionEnabled: false });
    const c = resolveFamilyConstruction(pack.main.engineFamily);
    for (const batch of sys.layerBatches) {
      const u = batch.material.uniforms;
      if (batch.role === 'distortion') {
        assert.equal(u.uShellArc.value, 0, 'the distortion encoder has no silhouette to curve');
        continue;
      }
      assert.equal(u.uFoldCount.value, c.foldCount, `${pack.profileId}/${batch.role} fold count`);
      assert.equal(u.uShellArc.value, c.shellArc, `${pack.profileId}/${batch.role} shell arc`);
      assert.equal(u.uThroatBite.value, c.throatBite, `${pack.profileId}/${batch.role} throat bite`);
      assert.equal(u.uReachSpread.value, c.reachSpread, `${pack.profileId}/${batch.role} reach spread`);
      // A continuous drive must never be able to read the impulse construction.
      assert.equal(u.uHeadDepth.value, 0, 'a main drive has no impulse head');
      assert.equal(u.uCollarLift.value, 0, 'a main drive has no valve collar');
    }
    sys.dispose();
  }
  // And the RCS materials do carry it.
  const rcs = new RcsImpulseSystem(THREE, PACKS[0].rcs);
  const impulse = resolveFamilyConstruction(PACKS[0].rcs.engineFamily).impulse;
  for (const batch of rcs.layerBatches) {
    assert.equal(batch.material.uniforms.uHeadTravel.value, impulse.headTravel);
    assert.equal(batch.material.uniforms.uImpulseJet.value, 1);
  }
  rcs.dispose();
});

test('the shell arc never exceeds the span the vertex stage can place', () => {
  // halfChord = sin(arcSpan): past a right angle the arc radius inflates instead of the width.
  for (const family of Object.keys(FAMILY_CONSTRUCTION)) {
    const c = resolveFamilyConstruction(family);
    assert.ok(c.shellArc > 0 && c.shellArc < Math.PI / 2,
      `${family}: shell arc ${c.shellArc} would invert the cross-section`);
  }
  const mat = createFlowFlipbookMaterial(THREE, { role: 'core', engineFamily: 'plasma_ring' });
  assert.ok(mat.uniforms.uShellArc.value > 1, 'the capital drive wraps further than the needle');
  assert.equal(mat.userData.engineFamily, 'plasma_ring');
  mat.dispose();
});

test('the fold profile bake is deterministic and tells the families apart', () => {
  const a = bakeFoldProfileRgba('vector', { width: 48, height: 24 });
  const b = bakeFoldProfileRgba('vector', { width: 48, height: 24 });
  assert.deepEqual(Array.from(a.data), Array.from(b.data), 'the same family bakes the same bytes');
  const industrial = bakeFoldProfileRgba('industrial', { width: 48, height: 24 });
  let differing = 0;
  for (let i = 0; i < a.data.length; i++) {
    if (a.data[i] !== industrial.data[i]) differing += 1;
  }
  assert.ok(differing > a.data.length * 0.25,
    `two machines must bake to visibly different sheets (${differing}/${a.data.length} bytes differ)`);
  assert.equal(a.width, 48);
  assert.equal(a.height, 24);
});

test('the nozzle shock train stays near the lip instead of laddering the jet', () => {
  for (const family of FAMILIES) {
    const c = resolveFamilyConstruction(family);
    let nearSwing = 0;
    let farSwing = 0;
    for (let i = 0; i <= 40; i++) {
      const near = plumeCompression(i / 40 * 0.25, c);
      const far = plumeCompression(0.6 + (i / 40) * 0.4, c);
      nearSwing = Math.max(nearSwing, Math.abs(near - 1));
      farSwing = Math.max(farSwing, Math.abs(far - 1));
    }
    if (c.compressionDepth <= 0.001) continue;
    assert.ok(nearSwing > farSwing * 3,
      `${family}: compression cells must decay downstream (${nearSwing.toFixed(3)} vs ${farSwing.toFixed(3)})`);
  }
});

// ── 8. The E5 boundary the history lane consumes ─────────────────────────────────────────────

test('the jet/history boundary is allocation-free and tracks the live jet', () => {
  const recipe = {
    ribbon: { jetLength: 17, throatRadius: 1.32, spread: 1.7, radiance: 1.55 },
    volume: { coreColor: [1, 0.99, 0.97], midColor: [0.14, 0.62, 1], edgeColor: [0.02, 0.1, 0.72] },
  };
  const env = createDriveEnvelope();
  env.spool = 1;
  const shape = resolvePlumeShape(env, {
    jetLength: 17, throatRadius: 1.32, spread: 1.7, radiance: 1.55, opacity: 0.115,
  }, {});
  shape.time = 0;

  const a = resolveJetHandoff(recipe, shape);
  const widthFull = a.widthWU;
  const radianceFull = a.radiance;
  assert.ok(widthFull > 1, 'the boundary has a real width');
  assert.ok(radianceFull > 0, 'and a real radiance');
  assert.equal(a.foldCount, 12);
  assert.ok(HANDOFF_STATION > 0.5 && HANDOFF_STATION < 1,
    'the boundary sits inside the jet, not at its dead far vertex');

  // One reused record, as documented — a consumer must copy, not retain.
  const b = resolveJetHandoff(recipe, { ...shape, drive: 0.2, spread: 0.5, radiance: 0.6 });
  assert.equal(a, b, 'the handoff must not allocate per call');
  assert.ok(b.widthWU < widthFull, 'a lighter jet hands over a narrower boundary');
  assert.ok(b.radiance < radianceFull, 'and a colder one');

  // A dead drive hands over no light.
  const dark = resolveJetHandoff(recipe, { drive: 0, boost: 0, dash: 0, radiance: 1.55, time: 0 });
  assert.equal(dark.radiance, 0, 'an unlit drive hands over nothing to blend with');

  // The flow phase actually advances with the jet's clock, so the history has something to
  // line its own structure up with.
  const p0 = resolveJetHandoff(recipe, { ...shape, time: 0 }).flowPhase;
  const p1 = resolveJetHandoff(recipe, { ...shape, time: 0.1 }).flowPhase;
  assert.notEqual(p0, p1, 'the boundary carries where the travelling wave has got to');
  for (const p of [p0, p1]) assert.ok(p >= 0 && p < 1, 'the phase stays wrapped');
});
