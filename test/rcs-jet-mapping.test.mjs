// Pins the CONSUMER half of the signed actuator seam: which nozzle actually lights.
//
// `check:actuator-telemetry` proves the producer publishes signed demand. It cannot prove the
// renderer reads the sign the right way round — and reading it backwards merely relocates the
// defect instead of fixing it. So this file drives the real propulsion kernel for every drive
// family, pushes the result through the real telemetry seam, and asserts the jets that come out
// the other side sit on the correct hull.
//
// The reported defect is asserted directly and by name: a yaw command must never light both bow
// jets. It must light the bow jet on one side and the stern jet on the other.

import assert from 'node:assert/strict';
import test from 'node:test';

import { computeFlightTelemetry } from '../src/core/flight/flightTelemetry.js';
import { createPropulsionRuntime, stepPropulsion } from '../src/core/flight/propulsionKernel.js';
import { PROPULSION_PROFILES } from '../src/core/flight/propulsionCatalog.js';
import {
  resolveRcsFirings,
  resolveActuatorScale,
  mainDriveDemand,
  shipAxes,
  RCS_DEADBAND,
} from '../src/render/rcsJets.js';

const DT = 1 / 60;
const FAMILY_DRIVES = [
  'drive_reaction_m',
  'drive_gravimetric_m',
  'drive_pulse_plate_m',
  'drive_torch_l',
  'drive_field_sail_m',
];
// Families whose kernel can actually command thrust opposite the nose (mirrors the producer test).
const RETRO_CAPABLE = ['drive_reaction_m', 'drive_gravimetric_m', 'drive_pulse_plate_m', 'drive_torch_l'];

function body(overrides = {}) {
  return { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0, mass: 20, inertia: 40, radius: 6, ...overrides };
}

/** Drive the real kernel, the real telemetry seam, and the real resolver — no hand-built inputs. */
function firingsFor(driveId, input, bodyOverrides = {}, ticks = 1) {
  const profile = PROPULSION_PROFILES[driveId];
  const b = body(bodyOverrides);
  let runtime = createPropulsionRuntime(profile);
  let result = null;
  for (let i = 0; i < ticks; i++) {
    result = stepPropulsion({ dt: DT, body: b, input, profile, runtime });
    runtime = result.runtime;
  }
  const telemetry = computeFlightTelemetry({ body: b, profile, control: { telemetry: result.telemetry } });
  const scale = resolveActuatorScale(profile);
  const firings = resolveRcsFirings(telemetry.actuators, { x: b.pos.x, z: b.pos.z, rot: b.rot, radius: b.radius }, scale);
  return { firings, actuators: telemetry.actuators, scale, profile, body: b };
}

const bow = (f) => f.filter((j) => j.station === 'bow');
const stern = (f) => f.filter((j) => j.station === 'stern');
const port = (f) => f.filter((j) => j.side === -1);
const starboard = (f) => f.filter((j) => j.side === 1);

// ---------------------------------------------------------------------------------------------
// THE DEFECT ITSELF
// ---------------------------------------------------------------------------------------------

test('a yaw command lights the OPPOSITE-side jet, never both bow jets', () => {
  for (const driveId of FAMILY_DRIVES) {
    for (const [turn, label] of [[1, 'starboard'], [-1, 'port']]) {
      const { firings, actuators } = firingsFor(driveId, { turn });
      assert.ok(actuators.yaw !== 0, `${driveId}: turn=${turn} must produce yaw demand to test against`);
      assert.equal(firings.length, 2, `${driveId}: a pure ${label} yaw is a couple — exactly two jets, got ${firings.length}`);

      // THE BUG, asserted by name. Both-bow means a translation was drawn where a couple was
      // commanded: the ship would appear to shove itself backwards while it pivots.
      assert.equal(bow(firings).length, 1, `${driveId}: turn=${turn} lit ${bow(firings).length} BOW jets — a yaw must never fire both`);
      assert.equal(stern(firings).length, 1, `${driveId}: turn=${turn} must light exactly one stern jet`);

      const b = bow(firings)[0];
      const s = stern(firings)[0];
      assert.equal(b.side, -s.side, `${driveId}: turn=${turn} bow and stern jets must sit on OPPOSITE hulls`);

      // yaw > 0 swings the nose to starboard, so the bow is pushed starboard and the jet that
      // does it sits on the PORT hull. Spelled out per direction rather than derived, so a sign
      // flip in the resolver cannot be absorbed by a matching flip in the assertion.
      if (turn === 1) {
        assert.equal(b.side, -1, `${driveId}: yawing to starboard must fire the BOW PORT jet`);
        assert.equal(s.side, 1, `${driveId}: yawing to starboard must fire the STERN STARBOARD jet`);
      } else {
        assert.equal(b.side, 1, `${driveId}: yawing to port must fire the BOW STARBOARD jet`);
        assert.equal(s.side, -1, `${driveId}: yawing to port must fire the STERN PORT jet`);
      }
    }
  }
});

test('mirrored yaw commands produce mirrored jets of equal magnitude', () => {
  for (const driveId of FAMILY_DRIVES) {
    const right = firingsFor(driveId, { turn: 1 }).firings;
    const left = firingsFor(driveId, { turn: -1 }).firings;
    for (const station of ['bow', 'stern']) {
      const r = right.find((j) => j.station === station);
      const l = left.find((j) => j.station === station);
      assert.equal(r.side, -l.side, `${driveId}: ${station} jet must swap hulls when the turn inverts`);
      assert.ok(Math.abs(r.intensity - l.intensity) < 1e-9, `${driveId}: ${station} mirrored intensity must match`);
      // Exhaust must invert too, not just the mounting side.
      assert.ok(Math.abs(r.dirX + l.dirX) < 1e-9 && Math.abs(r.dirZ + l.dirZ) < 1e-9,
        `${driveId}: ${station} exhaust direction must invert with the turn`);
    }
  }
});

// ---------------------------------------------------------------------------------------------
// THE GENERAL INVARIANT — stronger than any per-case table
// ---------------------------------------------------------------------------------------------

test("every firing obeys Newton's third law: exhaust is exactly opposite the push", () => {
  const inputs = [
    { turn: 1 }, { turn: -1 }, { strafe: 1 }, { strafe: -1 },
    { throttle: 0, brake: true }, { throttle: 1, turn: -0.5 }, { strafe: 0.8, turn: 0.8 },
    { throttle: -1 }, { turn: 0.3, strafe: -0.4, brake: true },
  ];
  for (const driveId of FAMILY_DRIVES) {
    for (const input of inputs) {
      for (const rot of [0, 0.7, -2.3, Math.PI]) {
        const { firings } = firingsFor(driveId, input, { rot, vel: { x: 25, z: -8 } });
        for (const j of firings) {
          const tag = `${driveId} ${JSON.stringify(input)} rot=${rot} ${j.station}/${j.side}`;
          assert.ok(Math.abs(j.dirX + j.pushX) < 1e-12 && Math.abs(j.dirZ + j.pushZ) < 1e-12,
            `${tag}: exhaust must be the exact negation of the push`);
          assert.ok(Math.abs(Math.hypot(j.pushX, j.pushZ) - 1) < 1e-12, `${tag}: push must be a unit vector`);
          assert.ok(j.intensity > 0 && j.intensity <= 1, `${tag}: intensity must be in (0,1], got ${j.intensity}`);
          assert.ok(Number.isFinite(j.x) && Number.isFinite(j.z), `${tag}: nozzle position must be finite`);
        }
      }
    }
  }
});

test('a laterally-pushing jet always sits on the hull OPPOSITE the push', () => {
  // The generalised form of the bug: whatever the blend, a jet that shoves the ship starboard
  // must be mounted to port. Checked in world space at several headings so the resolver cannot
  // be passing by treating +Z as "starboard" regardless of attitude.
  for (const driveId of FAMILY_DRIVES) {
    for (const input of [{ turn: 1 }, { turn: -1 }, { strafe: 1 }, { strafe: -1 }, { strafe: 0.6, turn: -0.9 }]) {
      for (const rot of [0, 1.1, -0.4, 2.9]) {
        const { firings } = firingsFor(driveId, input, { rot });
        const axes = shipAxes(rot);
        for (const j of firings) {
          if (j.role === 'reverse-left' || j.role === 'reverse-right') continue; // longitudinal, symmetric pair
          const pushStarboard = j.pushX * axes.rx + j.pushZ * axes.rz;
          assert.ok(Math.abs(pushStarboard) > 1e-9, 'a lateral jet must have a lateral push');
          assert.equal(Math.sign(pushStarboard), -j.side,
            `${driveId} ${JSON.stringify(input)} rot=${rot}: jet on side ${j.side} pushes the wrong way`);
        }
      }
    }
  }
});

// ---------------------------------------------------------------------------------------------
// TRANSLATION, MAIN AND REVERSE
// ---------------------------------------------------------------------------------------------

test('strafing lights the pair on one hull — a translation, with no yaw couple', () => {
  for (const driveId of FAMILY_DRIVES) {
    for (const [strafe, pushedSide, firingSide] of [[1, 'starboard', -1], [-1, 'port', 1]]) {
      const { firings, actuators } = firingsFor(driveId, { strafe });
      if (Math.abs(actuators.lateral) < 1e-9) continue; // family cannot strafe; covered by the shape test
      assert.equal(firings.length, 2, `${driveId}: strafe=${strafe} must be a two-jet translation`);
      assert.equal(bow(firings).length, 1, `${driveId}: strafe must use one bow jet`);
      assert.equal(stern(firings).length, 1, `${driveId}: strafe must use one stern jet`);
      const sides = firings.map((j) => j.side);
      assert.deepEqual(sides, [firingSide, firingSide],
        `${driveId}: pushing ${pushedSide} must fire BOTH jets on the opposite hull, not a diagonal`);
      // Equal magnitude on both ends is what makes it a pure translation rather than a turn.
      assert.ok(Math.abs(firings[0].intensity - firings[1].intensity) < 1e-9,
        `${driveId}: a pure strafe must load bow and stern equally, or it would yaw`);
    }
  }
});

test('braking lights BOTH bow retros, exhausting along the nose', () => {
  const moving = { vel: { x: 40, z: 0 } }; // rot 0, so +X is straight down the nose
  for (const driveId of RETRO_CAPABLE) {
    const { firings, actuators } = firingsFor(driveId, { throttle: 0, brake: true }, moving);
    assert.ok(actuators.reverse > 0, `${driveId}: brake must produce reverse demand`);
    const retros = firings.filter((j) => j.role === 'reverse-left' || j.role === 'reverse-right');
    // This is the ONE case where both bow jets are correct: a longitudinal push has no side.
    assert.equal(retros.length, 2, `${driveId}: braking must fire the symmetric bow pair`);
    assert.deepEqual(retros.map((j) => j.side).sort(), [-1, 1], `${driveId}: one retro per hull`);
    for (const j of retros) {
      assert.ok(j.dirX > 0.85, `${driveId}: retro exhaust must leave forward (+X hemisphere at rot 0), got ${j.dirX}`);
      assert.ok(j.x > 0, `${driveId}: retros must be mounted forward of the CoM, got x=${j.x}`);
    }
    assert.ok(Math.abs(retros[0].intensity - retros[1].intensity) < 1e-9, `${driveId}: retro pair must be balanced`);
    assert.ok(Math.abs(retros[0].dirZ + retros[1].dirZ) < 1e-9, `${driveId}: retro pair must splay symmetrically`);
  }
});

test('main-drive demand is reported from physics, and retro-only braking darkens the main nozzle', () => {
  for (const driveId of RETRO_CAPABLE) {
    const thrusting = firingsFor(driveId, { throttle: 1 });
    const md = mainDriveDemand(thrusting.actuators, thrusting.scale);
    assert.ok(md.main > 0, `${driveId}: full throttle must report main demand, got ${md.main}`);
    assert.equal(md.retroOnly, false, `${driveId}: thrusting is not retro-only`);
    // No RCS jet may be drawn for main thrust — that is the plume's job, a different vocabulary.
    assert.equal(thrusting.firings.length, 0, `${driveId}: pure forward thrust must emit no RCS jets`);

    const braking = firingsFor(driveId, { throttle: 0, brake: true }, { vel: { x: 40, z: 0 } });
    const bd = mainDriveDemand(braking.actuators, braking.scale);
    assert.equal(bd.main, 0, `${driveId}: a braking ship must report zero main demand`);
    assert.equal(bd.retroOnly, true, `${driveId}: braking must mark the main nozzle dark`);
  }
  assert.equal(mainDriveDemand(null, null), null, 'a missing actuator block must not fabricate a zero');
});

// ---------------------------------------------------------------------------------------------
// CONTINUITY — the data is continuous, so the picture must be too
// ---------------------------------------------------------------------------------------------

test('the resolver maps demand to intensity continuously, not as an on/off switch', () => {
  // Continuity is the RESOLVER's contract, so it is swept directly here. The kernel's own
  // saturation behaviour is a separate fact, pinned in the next test.
  const scale = resolveActuatorScale(PROPULSION_PROFILES.drive_reaction_m);
  const pose = { x: 0, z: 0, rot: 0, radius: 6 };
  let previous = 0;
  for (const frac of [0.1, 0.25, 0.5, 0.75, 1]) {
    const firings = resolveRcsFirings({ lateral: scale.strafe * frac, yaw: 0, reverse: 0 }, pose, scale);
    assert.equal(firings.length, 2, `frac=${frac} must resolve to a translation pair`);
    const level = firings[0].intensity;
    assert.ok(level > previous, `frac=${frac}: intensity must rise with demand (${previous} -> ${level})`);
    assert.ok(Math.abs(level - frac) < 1e-9, `frac=${frac}: intensity must track the authority fraction linearly`);
    previous = level;
  }
  // Over-demand saturates rather than overflowing into an unbounded, over-bright jet.
  const hot = resolveRcsFirings({ lateral: scale.strafe * 9, yaw: 0, reverse: 0 }, pose, scale);
  assert.equal(hot[0].intensity, 1, 'intensity must clamp at 1, never exceed it');

  // Below the deadband nothing is drawn, so a trimming assist cannot strobe one pixel per frame.
  assert.equal(resolveRcsFirings({ lateral: scale.strafe * 0.001 }, pose, scale).length, 0,
    'sub-deadband demand must draw nothing');
  assert.ok(RCS_DEADBAND > 0 && RCS_DEADBAND < 0.2, 'the deadband must be small enough to stay honest');
});

test('yaw intensity distinguishes entering a turn from arresting one', () => {
  // The kernel's yaw controller is bang-bang: any stick deflection commands full torque, so
  // normalising by `yawAccel` would peg every yaw jet at 1 and discard the only real gradient
  // there is. Arresting a spin draws on `yawBrake`, which is genuinely stronger — and that is
  // what the pilot should see. This test is why `yawAuthority` exists.
  const entering = firingsFor('drive_reaction_m', { turn: 1 }, { angVel: 0 });
  // No turn key at all — the ship is simply spinning, and assist is stopping it.
  const arresting = firingsFor('drive_reaction_m', { turn: 0 }, { angVel: 2.4 });
  assert.equal(entering.firings.length, 2);
  assert.equal(arresting.firings.length, 2);

  const enter = entering.firings[0].intensity;
  const arrest = arresting.firings[0].intensity;
  assert.ok(arrest > enter + 0.1,
    `arresting a spin must burn visibly harder than entering one (enter=${enter}, arrest=${arrest})`);
  assert.ok(enter > 0.3 && enter < 0.95,
    `entering a turn must sit mid-scale, not pegged — got ${enter}. A pegged value means the yaw scale is wrong.`);
  assert.ok(arrest <= 1, 'peak yaw must still respect the ceiling');

  // And the direction is the one no input key could have supplied: the ship is rotating toward
  // starboard, so the counter-torque is to PORT and the bow jet sits on the STARBOARD hull —
  // the exact opposite of what "which way is the stick held" would have drawn.
  assert.equal(arresting.actuators.yaw < 0, true, 'arresting a starboard spin is a port-ward torque');
  assert.equal(bow(arresting.firings)[0].side, 1, 'arresting a starboard spin fires the BOW STARBOARD jet');
  assert.equal(bow(entering.firings)[0].side, -1, 'entering a starboard turn fires the BOW PORT jet');
});

// ---------------------------------------------------------------------------------------------
// THE POINT OF THE WHOLE SEAM: jets that no input key could have predicted
// ---------------------------------------------------------------------------------------------

test('assist counter-thrust fires jets with NO pilot translation input at all', () => {
  // A ship sliding sideways under assist is trimmed by real RCS the pilot never asked for. The
  // old renderer read input keys, so these jets were silent — the ship looked like it was being
  // dragged sideways by nothing. This is the case that proves the seam is doing real work.
  const { firings, actuators } = firingsFor('drive_reaction_m', { throttle: 1 }, { vel: { x: 10, z: 30 } });
  assert.equal(actuators.assist.reason, 'slip-assist', 'precondition: the kernel must be trimming slip');
  assert.equal(actuators.manual.lateral, 0, 'precondition: the pilot is NOT pressing strafe');
  assert.ok(Math.abs(actuators.lateral) > 0, 'assist must still produce lateral demand');
  assert.ok(firings.length >= 1, 'assist-only lateral demand must light real jets');
  for (const j of firings) {
    assert.ok(j.intensity > 0, 'an assist jet must be visible');
  }
});

test('a blended strafe-and-yaw loads one end and unloads the other, instead of fighting itself', () => {
  // A lookup table lights four jets here, two of them opposed. The resolver sums the demand at
  // each end: the bow works harder, the stern falls silent. That is what a real quad does.
  const { firings } = firingsFor('drive_reaction_m', { strafe: 1, turn: 1 });
  const bowJets = bow(firings);
  const sternJets = stern(firings);
  assert.equal(bowJets.length, 1, 'the loaded end must fire exactly one jet');
  assert.equal(bowJets[0].side, -1, 'both demands push the bow to starboard, so the port jet fires');
  assert.ok(bowJets[0].intensity > 0.9, 'the loaded jet carries the summed demand and saturates');
  // The two demands do not cancel exactly — a full strafe and a full turn are different amounts of
  // authority — so the stern is UNLOADED rather than silent. Asserting exact silence here would be
  // asserting a coincidence; what matters is that the stern is not fighting the bow.
  assert.ok(sternJets.length <= 1, 'the unloaded end must never fire more than one jet');
  if (sternJets.length) {
    assert.ok(sternJets[0].intensity < bowJets[0].intensity * 0.6,
      `the cancelled end must be visibly unloaded (bow=${bowJets[0].intensity}, stern=${sternJets[0].intensity})`);
  }
  // Exact cancellation is the resolver's own contract, so it is asserted directly: equal and
  // opposite normalized demand at one end must produce silence, never two opposed jets.
  const scale = resolveActuatorScale(PROPULSION_PROFILES.drive_reaction_m);
  const balanced = resolveRcsFirings(
    { lateral: scale.strafe * 0.5, yaw: scale.yaw * 0.5, reverse: 0 },
    { x: 0, z: 0, rot: 0, radius: 6 }, scale
  );
  assert.equal(balanced.length, 1, 'perfectly opposed demand at the stern must leave exactly one jet lit');
  assert.equal(balanced[0].station, 'bow', 'the surviving jet is the loaded bow');
  assert.ok(Math.abs(balanced[0].intensity - 1) < 1e-9, 'the bow carries the full summed demand');
  // Sanity: neither hull ever carries two lateral jets at once.
  assert.ok(port(firings).length <= 2 && starboard(firings).length <= 2, 'no hull may stack jets without bound');
});

test('a null or empty actuator block resolves to no jets rather than throwing', () => {
  const pose = { x: 10, z: -4, rot: 0.5, radius: 6 };
  const scale = resolveActuatorScale(PROPULSION_PROFILES.drive_reaction_m);
  assert.deepEqual(resolveRcsFirings(null, pose, scale), []);
  assert.deepEqual(resolveRcsFirings({}, pose, scale), []);
  assert.deepEqual(resolveRcsFirings({ lateral: 0, yaw: 0, reverse: 0 }, pose, scale), []);
  assert.deepEqual(resolveRcsFirings({ lateral: NaN, yaw: NaN, reverse: NaN }, pose, scale), []);
  assert.deepEqual(resolveRcsFirings({ yaw: 1 }, null, scale), []);
});

test('a supplied output reuses firing records and channel descriptors across active and idle frames', () => {
  const pose = { x: 10, z: -4, rot: 0.5, radius: 6 };
  const scale = resolveActuatorScale(PROPULSION_PROFILES.drive_reaction_m);
  const out = [];
  resolveRcsFirings({ lateral: 0, yaw: scale.yaw, reverse: 0 }, pose, scale, out);
  assert.equal(out.length, 2);
  const first = out[0];
  const second = out[1];
  const firstChannels = first.channels;
  const secondChannels = second.channels;

  resolveRcsFirings({ lateral: 0, yaw: 0, reverse: 0 }, pose, scale, out);
  assert.equal(out.length, 0, 'idle frame publishes no live firings');
  resolveRcsFirings({ lateral: 0, yaw: scale.yaw, reverse: 0 }, pose, scale, out);
  assert.equal(out[0], first, 'first firing record must survive an idle frame');
  assert.equal(out[1], second, 'second firing record must survive an idle frame');
  assert.equal(out[0].channels, firstChannels, 'channel descriptors are immutable shared records');
  assert.equal(out[1].channels, secondChannels, 'channel descriptors are immutable shared records');

  const demand = { main: 0, reverse: 0, retroOnly: false };
  assert.equal(mainDriveDemand({ main: scale.main, reverse: 0 }, scale, demand), demand,
    'main-drive demand must support an allocation-free supplied output');
  assert.equal(demand.main, 1);
  assert.equal(demand.retroOnly, false);
});

test('every drive family resolves a usable scale, including the ones with no authored accels', () => {
  for (const driveId of FAMILY_DRIVES) {
    const scale = resolveActuatorScale(PROPULSION_PROFILES[driveId]);
    for (const key of ['main', 'reverse', 'strafe', 'yaw']) {
      assert.ok(Number.isFinite(scale[key]) && scale[key] > 0,
        `${driveId}: ${key} scale must be finite and positive, got ${scale[key]} — a zero would saturate or hide every jet`);
    }
  }
  // The sail authors none of the translation accels; it must still get the shared fallback.
  const sail = resolveActuatorScale(PROPULSION_PROFILES.drive_field_sail_m);
  assert.ok(sail.strafe > 0 && sail.main > 0, 'the sail must fall back rather than divide by zero');
  assert.ok(resolveActuatorScale(undefined).yaw > 0, 'a missing profile must not produce NaN jets');
});

test('nozzle positions rotate with the hull instead of being baked in world axes', () => {
  // rot = PI/2 points the nose along +Z, so starboard becomes -X. If the resolver had world-space
  // constants anywhere, this is where it breaks.
  const { firings } = firingsFor('drive_reaction_m', { turn: 1 }, { rot: Math.PI / 2 });
  const b = bow(firings)[0];
  const s = stern(firings)[0];
  assert.ok(b.z > 0, 'the bow jet must be forward of the CoM, which is now +Z');
  assert.ok(s.z < 0, 'the stern jet must be aft, which is now -Z');
  // Bow is pushed starboard; at this heading starboard is -X.
  assert.ok(b.pushX < -0.99, `bow push must be -X at rot=PI/2, got ${b.pushX}`);
  assert.ok(b.x > 0, 'the bow PORT jet must sit on +X, which is port at this heading');
});
