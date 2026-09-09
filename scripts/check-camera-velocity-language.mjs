// Velocity-language consumption probe for src/render/camera.js (luminous-wake extreme band).
//
// THE DEFECT THIS PINS. velocityLanguage.js publishes camera and provenance-bound speed fields on
// the shared record at
// state.render.velocityLanguage.drive — `cameraLeadWU` (a few WU of camera lead along the velocity
// vector), `shakeScale` (a deliberate REDUCTION of trauma shake at extreme speed), and the bounded
// `exceptionalSpeed` scalar consumed only when the record belongs to the current player. The first two were
// published with ZERO consumers: a grep for them outside velocityLanguage.js found only an unrelated
// LOCAL `shakeScale` in camera.js (the motionReduce factor). A published signal nobody reads is
// indistinguishable from a signal that does not exist, and a future edit that quietly drops either
// field from the record would never surface in gameplay.
//
// This probe asserts three things, in order of how likely they are to rot:
//   1. CONSUMPTION IS WIRED — camera.js imports readVelocityLanguage and reads both fields off the
//      published record (source pattern, like check-camera-trauma.mjs). A reader that re-derives the
//      band from speed becomes a second producer and drifts; the source pattern pins that it does not.
//   2. THE RECORD CARRIES THE CONTRACT — velocityBandDrive publishes cameraLeadWU > 0 and shakeScale
//      < 1 at extreme speed with motionReduce OFF, and cameraLeadWU === 0 with motionReduce ON. The
//      shakeScale is deliberately NOT further scaled by motionReduce (the field leaves it alone so the
//      camera lane's own MOTION_REDUCE_SHAKE_SCALE carries the accessibility reduction); pinning that
//      catches a future "fix" that double-reduces and makes extreme-speed shake imperceptible.
//   3. THE CAMERA ACTUALLY MOVES — the published lead shifts the chase focus along the velocity
//      vector by ~cameraLeadWU at extreme speed, and shifts it by ZERO under motionReduce (the
//      prompt's explicit requirement). Behavioral, deterministic, end-to-end.
//
// The shake reduction is pinned by source pattern + producer value rather than by sampling
// shakeOffset magnitudes: camera.js sources its shake from Math.random() (cosmetic render jitter,
// intentionally not state.rng), so a magnitude-sampling test would be flaky without adding proof the
// source-pattern + producer pins do not already carry.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  CHASE_ZOOM_DEFAULT,
  createChaseCamera,
} from '../src/render/camera.js';
import {
  VELOCITY_BAND,
  VL_BAND3_AT,
  VL_CAMERA_LEAD_WU_MAX,
  VL_TAPER_END,
  publishVelocityLanguage,
  readOwnedExceptionalSpeed,
  velocityBandDrive,
} from '../src/render/velocityLanguage.js';

const ROOT = new URL('../', import.meta.url);
const failures = [];

function check(label, fn) {
  try {
    fn();
    console.log(`ok    ${label}`);
  } catch (error) {
    failures.push(1);
    console.error(`FAIL  ${label}\n      ${error?.message || error}`);
  }
}

// ================================================================================================
// 1. CONSUMPTION IS WIRED (source pattern)
// ================================================================================================
// A published field with no reader is dead. The source pattern proves camera.js reaches through the
// published record rather than re-deriving the band from speed — a reader that derives is a second
// producer, and the whole point of the shared record is that the streaks, the sky and the camera all
// read the SAME band so they cannot drift.
const cameraSrc = readFileSync(new URL('src/render/camera.js', ROOT), 'utf8');

check('camera.js imports readVelocityLanguage (never re-derives the band)', () => {
  assert.match(cameraSrc, /import\s*\{[^}]*readVelocityLanguage[^}]*\}\s*from\s*['"]\.\/velocityLanguage\.js['"]/,
    'camera.js must import readVelocityLanguage from velocityLanguage.js — re-deriving the band is a second producer');
  // And it must CALL it at consume time, not merely import it.
  assert.match(cameraSrc, /readVelocityLanguage\(state\)/,
    'camera.js must call readVelocityLanguage(state) to read the published record');
  assert.match(cameraSrc, /readOwnedExceptionalSpeed\(state\)/,
    'camera.js must consume exceptional speed from the owner-bound shared record');
  assert.doesNotMatch(cameraSrc, /\bp\._flightFrame\b/,
    'camera.js must not re-read physics-earned provenance from the live flight frame');
});

check('camera.js reads drive.cameraLeadWU off the published record', () => {
  assert.match(cameraSrc, /vl\.drive\.cameraLeadWU/,
    'camera.js must read vl.drive.cameraLeadWU — the published lead field');
  // The read must be finite-screened: a non-finite published value would otherwise displace the focus
  // by Infinity WU. The sibling readers in spaceBackground.js screen the same way.
  assert.match(cameraSrc, /Number\.isFinite\(vl\.drive\.cameraLeadWU\)/,
    'camera.js must screen vl.drive.cameraLeadWU for finiteness before applying it');
});

check('camera.js reads drive.shakeScale and MULTIPLIES it into the shake amplitude', () => {
  assert.match(cameraSrc, /vl\.drive\.shakeScale/,
    'camera.js must read vl.drive.shakeScale — the published shake-reduction field');
  assert.match(cameraSrc, /Number\.isFinite\(vl\.drive\.shakeScale\)/,
    'camera.js must screen vl.drive.shakeScale for finiteness before applying it');
  // The reduction must MULTIPLY the shake, not merely be read. A read that does not flow into the
  // amplitude is a no-op consumption — the defect this probe exists for.
  assert.match(cameraSrc, /shakeScale\s*=\s*motionScale\s*\*\s*bandShake|shakeScale\s*=\s*bandShake\s*\*\s*motionScale/,
    'camera.js must compose drive.shakeScale into the shake amplitude (motionReduce × bandShake)');
});

// ================================================================================================
// 2. THE RECORD CARRIES THE CONTRACT (producer values)
// ================================================================================================
// What the camera reads is what the field publishes. These pins are the contract the consumer above
// depends on. check-speed-lines pins the ramps themselves; this section pins the SPECIFIC values the
// camera lane cares about at the specific operating points the camera lane runs at.
const MAX_SPEED = 120; // representative hull combat speed

check('extreme speed (motionReduce OFF) publishes a positive camera lead and reduced shake', () => {
  const d = velocityBandDrive(VL_TAPER_END * MAX_SPEED, MAX_SPEED, false, false);
  assert.equal(d.band, VELOCITY_BAND.EXTREME, 'taper-end speed must classify as band 3');
  assert.ok(d.cameraLeadWU > 0,
    `camera lead must be positive at extreme speed, got ${d.cameraLeadWU}`);
  assert.ok(d.cameraLeadWU <= VL_CAMERA_LEAD_WU_MAX,
    `camera lead ${d.cameraLeadWU} must respect the ${VL_CAMERA_LEAD_WU_MAX} WU ceiling`);
  // STRICT reduction — the prompt's explicit requirement. Equal-to-1 would mean the reduction is
  // nominal only, which is the failure mode this pin exists to catch.
  assert.ok(d.shakeScale < 1,
    `shake must be STRICTLY reduced at extreme speed, got ${d.shakeScale}`);
  assert.ok(d.shakeScale > 0,
    `shake must not be fully zeroed by the band (the camera's own motionReduce carries that), got ${d.shakeScale}`);
});

check('motionReduce forces cameraLeadWU to ZERO (the prompt requirement)', () => {
  // The field zeroes the lead under motionReduce. The camera lane reads the record as-is, so this is
  // what makes the lead respect motionReduce end-to-end — without re-deriving or second-guessing.
  const full = velocityBandDrive(VL_TAPER_END * MAX_SPEED, MAX_SPEED, false, false);
  const reduced = velocityBandDrive(VL_TAPER_END * MAX_SPEED, MAX_SPEED, false, true);
  assert.ok(full.cameraLeadWU > 0, 'lead must be positive without motionReduce (precondition)');
  assert.equal(reduced.cameraLeadWU, 0,
    'motionReduce must force cameraLeadWU to exactly 0 — the camera reads this verbatim');
});

check('shakeScale is NOT further reduced by motionReduce (the camera lane owns that)', () => {
  // velocityLanguage.js deliberately leaves shakeScale UNSCALED by motionReduce: the field applies MR
  // to every channel that moves the vestibular system EXCEPT this one, because shakeScale is already
  // a reduction and the camera's own MOTION_REDUCE_SHAKE_SCALE is what carries the accessibility pass.
  // A future edit that folds MR into shakeScale would double-reduce and make extreme-speed shake
  // imperceptible — and because the two reductions live in different files, the bug would be invisible
  // to any test that reads only one of them.
  const full = velocityBandDrive(VL_TAPER_END * MAX_SPEED, MAX_SPEED, false, false);
  const reduced = velocityBandDrive(VL_TAPER_END * MAX_SPEED, MAX_SPEED, false, true);
  assert.equal(full.shakeScale, reduced.shakeScale,
    `shakeScale must be identical with/without motionReduce (got ${full.shakeScale} vs ${reduced.shakeScale}); ` +
    'the camera lane composes its own MOTION_REDUCE_SHAKE_SCALE on top');
});

check('exceptional speed is published on the same owner-bound v1 record', () => {
  const state = { playerId: 7 };
  const drive = velocityBandDrive(2 * MAX_SPEED, MAX_SPEED, false, false, true);
  const node = publishVelocityLanguage(state, drive, null);
  assert.equal(node.schema, 'velocity_language_v1');
  assert.equal(node.ownerId, 7);
  assert.equal(readOwnedExceptionalSpeed(state), 0.5);
  node.ownerId = 8;
  assert.equal(readOwnedExceptionalSpeed(state), 0, 'stale player records must fail closed');
  node.ownerId = 7;
  node.drive.exceptionalSpeed = Infinity;
  assert.equal(readOwnedExceptionalSpeed(state), 0, 'non-finite shared scalars must fail closed');
});

// ================================================================================================
// 3. THE CAMERA ACTUALLY MOVES (behavioral, end-to-end)
// ================================================================================================
// The lead is applied as an offset along the velocity vector inside the existing lookahead block. To
// isolate it from the ordinary lookahead, lookAhead is pinned to 0 so the only velocity-axis bias is
// the published lead. The focus is damped, so we measure the STEADY-STATE offset between focus.x and
// player.x — the damping lag is identical across runs with the same velocity, so it cancels in the
// comparison and the residual is exactly the published lead.
const FOV = 50;
const TILT = 60;
const DT = 1 / 60;
const SETTLE_FRAMES = 180; // lerp 6 → focus is within ~1e-4 of target after 3s

globalThis.window = { innerWidth: 1600, innerHeight: 900 };

function makePlayer() {
  return {
    id: 1,
    type: 'ship',
    alive: true,
    hull: 100,
    team: 0,
    pos: { x: 0, z: 0 },
    // High +X velocity: the ship is well above the 1 WU/s threshold that gates the lookahead block,
    // and the velocity vector is along +X so the lead must displace the focus in +X.
    vel: { x: 900, z: 0 },
    radius: 7,
    maxSpeed: MAX_SPEED,
    bank: 0,
  };
}

function makeState(motionReduce, drive) {
  const player = makePlayer();
  const state = {
    playerId: 1,
    entities: new Map([[1, player]]),
    player: { cruise: null, tether: { active: false, targetId: null } },
    settings: { video: { fov: FOV, motionReduce } },
    // lookAhead 0: the only velocity-axis focus bias is the published camera lead.
    camera: { zoom: 72, tilt: TILT, lookAhead: 0, lerp: 6, trauma: 0 },
    input: { aimWorld: null },
    world: { frameOrigin: { x: 0, z: 0 }, frameOriginSeq: 0 },
  };
  if (drive) publishVelocityLanguage(state, drive, null);
  return { state, player };
}

// Steady-state focus offset along the velocity axis (focus.x − player.x), averaged over the tail of
// the run to absorb the residual damping oscillation. The player is moving at constant velocity, so
// the raw offset includes a constant damping lag; AVERAGING is fine because the lag is the same across
// runs with the same velocity, and cancels in any difference.
function steadyFocusOffset(state, camera) {
  camera.snapToPlayer();
  // Warm up: let the damping reach steady state.
  for (let i = 0; i < SETTLE_FRAMES; i++) camera.follow(DT);
  // Sample the tail.
  let sum = 0;
  const samples = 30;
  for (let i = 0; i < samples; i++) {
    camera.follow(DT);
    const p = state.entities.get(state.playerId);
    sum += state.camera.focus.x - p.pos.x;
  }
  return sum / samples;
}

function cameraDistance(state, camera) {
  return camera.obj.position.distanceTo(state.camera.focus);
}

function makeZoomEnvelopeState(speed, physicsEarned, motionReduce = false, recordOwnerId = 1) {
  const { state, player } = makeState(motionReduce, null);
  state.camera.zoom = CHASE_ZOOM_DEFAULT;
  player.vel.x = speed;
  // Camera deliberately consumes the prior render frame's owner-bound record. A conflicting live
  // flight frame must not become a second provenance producer in this lane.
  player._flightFrame = { governor: { physicsEarned: !physicsEarned } };
  const drive = velocityBandDrive(speed, MAX_SPEED, false, motionReduce, physicsEarned);
  publishVelocityLanguage(state, drive, null);
  state.render.velocityLanguage.ownerId = recordOwnerId;
  return { state, player, camera: createChaseCamera(state) };
}

function settleCameraDistance(state, camera, frames = 360) {
  camera.snapToPlayer();
  for (let i = 0; i < frames; i++) camera.follow(DT);
  return cameraDistance(state, camera);
}

check('extreme-speed lead shifts the chase focus along the velocity vector by ~cameraLeadWU', () => {
  const extremeDrive = velocityBandDrive(VL_TAPER_END * MAX_SPEED, MAX_SPEED, false, false);
  assert.ok(extremeDrive.cameraLeadWU > 0, 'precondition: extreme drive must publish a lead');

  // With the lead published.
  const withLead = makeState(false, extremeDrive);
  const camWith = createChaseCamera(withLead.state);
  const offsetWith = steadyFocusOffset(withLead.state, camWith);

  // Without the lead (band 0: cameraLeadWU === 0, same player velocity).
  const silentDrive = velocityBandDrive(0.5 * MAX_SPEED, MAX_SPEED, false, false);
  assert.equal(silentDrive.cameraLeadWU, 0, 'precondition: band-0 drive must publish no lead');
  const withoutLead = makeState(false, silentDrive);
  const camWithout = createChaseCamera(withoutLead.state);
  // Same player velocity in both runs so the damping lag cancels in the difference.
  const offsetWithout = steadyFocusOffset(withoutLead.state, camWithout);

  const delta = offsetWith - offsetWithout;
  // The lead is applied verbatim along the unit velocity vector, so the residual should be very close
  // to the published cameraLeadWU. A loose bound (±25%) absorbs the residual damping oscillation
  // without weakening the assertion that the lead is REAL and of the designed magnitude.
  assert.ok(delta > extremeDrive.cameraLeadWU * 0.75 && delta < extremeDrive.cameraLeadWU * 1.25,
    `focus shifted ${delta.toFixed(3)} WU along velocity; expected ~${extremeDrive.cameraLeadWU.toFixed(3)} ` +
    `(offsetWith=${offsetWith.toFixed(3)} offsetWithout=${offsetWithout.toFixed(3)})`);
  // And the sign is correct — lead is FORWARDS along the velocity vector (+X here), never backwards.
  assert.ok(delta > 0, 'camera lead must shift the focus FORWARDS along the velocity vector');
});

check('physics-earned overspeed opens farther than ordinary max thrust, then returns smoothly', () => {
  const ordinary = makeZoomEnvelopeState(MAX_SPEED, false);
  const ordinaryDistance = settleCameraDistance(ordinary.state, ordinary.camera);

  const earned = makeZoomEnvelopeState(MAX_SPEED * 2, true);
  const earnedDistance = settleCameraDistance(earned.state, earned.camera);
  assert.ok(earnedDistance >= ordinaryDistance * 1.12,
    `physics-earned 2x speed should open at least 12% farther (${earnedDistance.toFixed(3)} vs ` +
    `${ordinaryDistance.toFixed(3)} WU)`);

  publishVelocityLanguage(
    earned.state,
    velocityBandDrive(MAX_SPEED * 2, MAX_SPEED, false, false, false),
    null,
  );
  const returnSamples = [];
  for (let i = 0; i < 60; i++) {
    earned.camera.follow(DT);
    returnSamples.push(cameraDistance(earned.state, earned.camera));
  }
  assert.ok(returnSamples[0] > earnedDistance * 0.98,
    'clearing earned provenance must ease rather than snap the camera inward on one frame');
  assert.ok(returnSamples[12] < earnedDistance - 0.5 && returnSamples[12] > ordinaryDistance,
    'the return should make visible progress while retaining an intermediate composition');
  for (let i = 1; i < returnSamples.length; i++) {
    assert.ok(returnSamples[i] <= returnSamples[i - 1] + 0.02,
      `return path must not rebound outward (${returnSamples[i - 1].toFixed(3)} -> ` +
      `${returnSamples[i].toFixed(3)} WU at sample ${i})`);
  }
  for (let i = 0; i < 360; i++) earned.camera.follow(DT);
  const settledReturn = cameraDistance(earned.state, earned.camera);
  assert.ok(Math.abs(settledReturn - ordinaryDistance) < 0.5,
    `camera should settle back to ordinary framing (${settledReturn.toFixed(3)} vs ` +
    `${ordinaryDistance.toFixed(3)} WU)`);
});

check('motionReduce suppresses the earned pullback but retains ordinary max-speed framing', () => {
  const ordinary = makeZoomEnvelopeState(MAX_SPEED, false);
  const ordinaryDistance = settleCameraDistance(ordinary.state, ordinary.camera);
  const earnedReduced = makeZoomEnvelopeState(MAX_SPEED * 2, true, false);
  assert.equal(earnedReduced.state.render.velocityLanguage.drive.exceptionalSpeed, 0.5,
    'precondition: prior frame carries an earned midpoint scalar');
  // Accessibility changes before feel publishes its next record. Camera must consult the current
  // setting and suppress this one-frame-old earned scalar immediately, retaining ordinary framing.
  earnedReduced.state.settings.video.motionReduce = true;
  const earnedReducedDistance = settleCameraDistance(earnedReduced.state, earnedReduced.camera);
  assert.ok(Math.abs(earnedReducedDistance - ordinaryDistance) < 0.5,
    `motionReduce should suppress only the earned extension and retain ordinary max framing ` +
    `(${earnedReducedDistance.toFixed(3)} vs ${ordinaryDistance.toFixed(3)} WU)`);
});

check('stale exceptional records never transfer between player owners', () => {
  const ordinary = makeZoomEnvelopeState(MAX_SPEED * 2, false);
  const ordinaryDistance = settleCameraDistance(ordinary.state, ordinary.camera);
  const stale = makeZoomEnvelopeState(MAX_SPEED * 2, true, false, 2);
  const staleDistance = settleCameraDistance(stale.state, stale.camera);
  assert.ok(Math.abs(staleDistance - ordinaryDistance) < 0.5,
    `mismatched record owner must retain ordinary framing (${staleDistance.toFixed(3)} vs ` +
    `${ordinaryDistance.toFixed(3)} WU)`);
});

check('camera lead is ZERO under motionReduce (the prompt requirement, end-to-end)', () => {
  // motionReduce forces the published cameraLeadWU to 0 (section 2). The camera reads the record
  // verbatim, so the focus offset under motionReduce must equal the no-lead offset exactly — proving
  // the lead respects motionReduce without the camera lane re-deriving or second-guessing the field.
  const extremeMRDrive = velocityBandDrive(VL_TAPER_END * MAX_SPEED, MAX_SPEED, false, true);
  assert.equal(extremeMRDrive.cameraLeadWU, 0, 'precondition: motionReduce drive must publish lead 0');

  const mrState = makeState(true, extremeMRDrive);
  const mrCam = createChaseCamera(mrState.state);
  const mrOffset = steadyFocusOffset(mrState.state, mrCam);

  // The silent baseline (band 0, no motionReduce) from the previous check is the no-lead reference.
  // Under motionReduce the focus offset equals it: the lead contributed nothing.
  const silentDrive = velocityBandDrive(0.5 * MAX_SPEED, MAX_SPEED, false, false);
  const silentState = makeState(false, silentDrive);
  const silentCam = createChaseCamera(silentState.state);
  const silentOffset = steadyFocusOffset(silentState.state, silentCam);

  const delta = mrOffset - silentOffset;
  assert.ok(Math.abs(delta) < 0.5,
    `motionReduce focus offset ${mrOffset.toFixed(3)} differs from no-lead baseline ${silentOffset.toFixed(3)} ` +
    `by ${delta.toFixed(3)} — camera lead must contribute ZERO under motionReduce`);
});

check('absent record (nothing published) leaves the focus and shake untouched', () => {
  // Fail-safe: if feel.js has not yet published (first frame, docked, or a future code path that skips
  // the publisher), readVelocityLanguage returns null and the camera must fall back to lead 0 and
  // shakeScale 1 — ordinary chase behaviour, not a crash and not a stuck lead.
  const { state, player } = makeState(false, null);
  assert.equal(state.render, undefined, 'precondition: nothing published');
  const cam = createChaseCamera(state);
  cam.snapToPlayer();
  for (let i = 0; i < 30; i++) cam.follow(DT);
  // focus must stay near the player (no spurious lead) — within the safe-rect clamp distance.
  const offset = Math.abs(state.camera.focus.x - player.pos.x);
  assert.ok(offset < 1.0,
    `with no published record the focus offset ${offset.toFixed(3)} must be ~0 (no stuck lead)`);
  // And trauma shake must still work: set trauma, tick, observe a non-zero shakeOffset.
  state.camera.trauma = 1;
  cam.follow(DT);
  const mag = Math.hypot(state.camera.shakeOffset.x, state.camera.shakeOffset.z);
  assert.ok(mag > 0, 'with no published record the shake must still apply (shakeScale falls back to 1)');
});

// ================================================================================================
if (failures.length > 0) {
  console.error(`\nFAIL check:camera:velocity-language — ${failures.length} failing group(s)`);
  process.exit(1);
}
console.log('\nPASS check:camera:velocity-language');
