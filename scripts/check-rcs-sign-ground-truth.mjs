#!/usr/bin/env node
// RCS sign, anchored to SIMULATED PHYSICAL MOTION rather than to an input label (atlas packet E-3).
//
// WHAT IS ALREADY COVERED ELSEWHERE, so this file does not repeat it:
//   * `test/rcs-jet-mapping.test.mjs` proves the couple TOPOLOGY (exactly two jets, one bow one
//     stern, opposite hulls) and Newton's third law (exhaust === -push) exhaustively.
//   * `scripts/check-rcs-jet-wiring.mjs` proves the resolved firings reach the production pool and
//     that reduced motion / reduced flash lower cadence instead of removing feedback.
//
// WHAT NEITHER OF THEM CAN PROVE, and this file exists for.
//
// Both files derive their expectations from the INPUT KEY. `rcs-jet-mapping` asserts, in effect,
// "turn = +1 must light the bow PORT jet", justified by a source comment reading "yaw > 0 swings
// the nose to starboard". That comment is a CLAIM. Nothing in the repo checks it against the
// kernel's actual torque. If the yaw sign convention were inverted anywhere between
// `computeYawControl` and `computeFlightTelemetry`, every assertion in that file would still pass —
// input and jets would remain perfectly consistent with each other while both disagreed with the
// direction the hull physically rotates. The player would see the ship pivot one way and the jets
// fire as though it were pivoting the other.
//
// That is precisely the failure mode the packet brief names: "getting it backwards merely relocates
// the original bug while looking fixed."
//
// So this probe never trusts the word "starboard". For each yaw command it:
//   1. integrates the kernel's OWN torque (torque.y / inertia) for one tick,
//   2. measures where the BOW physically moved, in world space, projected onto the starboard axis,
//   3. resolves the RCS firings from the shipped telemetry seam,
//   4. asserts the jet doing the pushing is mounted on the hull OPPOSITE the bow's real motion.
//
// Step 2 is the ground truth. It is derived from mass properties and torque, not from a label, so
// a convention flip anywhere in the chain breaks this check and cannot be absorbed by a matching
// flip in the assertion.
//
// It also runs on the ship the player ACTUALLY spawns in (ship_kestrel -> drive_reaction_s,
// radius 14) rather than the `drive_reaction_m` / radius-6 fixture the sibling suites use.

import assert from 'node:assert/strict';

import { makeShipEntitySpec } from '../src/systems/ships.js';
import { NEW_GAME } from '../src/data/newGameDefaults.js';
import { SHIPS } from '../src/data/ships.js';
import { resolvePropulsionProfile } from '../src/core/flight/propulsionCatalog.js';
import { createPropulsionRuntime, stepPropulsion } from '../src/core/flight/propulsionKernel.js';
import { computeFlightTelemetry } from '../src/core/flight/flightTelemetry.js';
import { resolveActuatorScale, resolveRcsFirings, shipAxes, RCS_DEADBAND } from '../src/render/rcsJets.js';

const DT = 1 / 60;
let checks = 0;
let failures = 0;

function check(label, fn) {
  try {
    fn();
    checks += 1;
    console.log(`  ok  ${label}`);
  } catch (error) {
    failures += 1;
    console.error(`  FAIL  ${label}\n        ${error?.message || error}`);
  }
}

// --------------------------------------------------------------------------------------------
// The real player ship
// --------------------------------------------------------------------------------------------

function playerShip(shipId = NEW_GAME.shipId, fittings = NEW_GAME.fittedModules || []) {
  const spec = makeShipEntitySpec(shipId, {
    team: 0, factionId: 'faction_free', isPlayer: true, player: null, fittings, pos: { x: 0, z: 0 },
  });
  const entity = { ...spec, id: 1, alive: true, vel: { x: 0, z: 0 }, angVel: 0 };
  const profile = resolvePropulsionProfile(entity, { playerId: 1, player: {} });
  return { entity, profile };
}

/** Body assembled with the same precedence as `bodySnapshot` (src/systems/flightV3.js:1143). */
function bodyFor(entity, profile, overrides = {}) {
  const derived = entity.data && entity.data.derived && entity.data.derived.flightModel;
  return {
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    angVel: 0,
    mass: pos(entity.mass, pos(profile.mass, 1)),
    inertia: pos(entity.flightModel && entity.flightModel.inertia, pos(derived && derived.inertia, 1)),
    radius: pos(entity.radius, 6),
    ...overrides,
  };
}

const pos = (v, f) => (Number.isFinite(v) && v > 0 ? v : f);

/**
 * THE GROUND TRUTH.
 *
 * Advance the hull one tick under the kernel's own torque and report, geometrically, which way the
 * BOW is being PUSHED — expressed as a signed displacement along the starboard axis of the frame
 * the ship started in. Nothing here reads an input key or a telemetry sign: only `result.torque.y`,
 * the body's inertia, and where the nose tip physically ends up.
 *
 * TWO DIFFERENT QUANTITIES, and conflating them produces a false failure. Learned the hard way
 * while writing this file, so it is spelled out rather than left as a subtlety:
 *
 *   `driftTotal`     where the bow ACTUALLY goes this tick. Includes existing angular momentum.
 *   `driftFromTorque` where the bow is being ACCELERATED. Torque only (½·α·dt²).
 *
 * A jet must sit opposite the direction it PUSHES, which is `driftFromTorque`. When the assist is
 * arresting an existing spin the two disagree by design: the hull keeps rotating one way
 * (`driftTotal`) while the thrusters shove it the other (`driftFromTorque`), and a jet decelerating
 * a spin correctly sits on the same side the bow is still travelling toward. Anchoring on
 * `driftTotal` would flag that correct behaviour as a defect — which is exactly the kind of
 * confidently-wrong assertion this program keeps having to retract.
 */
function physicalBowDrift(profile, body, input) {
  const runtime = createPropulsionRuntime(profile);
  const result = stepPropulsion({ dt: DT, body, input, profile, runtime, environment: {} });

  const angularAccel = result.torque.y / body.inertia;
  const nextAngVel = body.angVel + angularAccel * DT;
  const nextRot = body.rot + nextAngVel * DT;
  // Rotation attributable to the commanded torque alone, with existing spin removed.
  const rotFromTorque = body.rot + 0.5 * angularAccel * DT * DT;

  const before = shipAxes(body.rot);
  const r = body.radius;
  const bowAt = (rot) => {
    const axes = shipAxes(rot);
    return { x: body.pos.x + axes.fx * r, z: body.pos.z + axes.fz * r };
  };
  const bowBefore = bowAt(body.rot);
  // Project a bow displacement onto the ORIGINAL starboard axis.
  const project = (bow) => (bow.x - bowBefore.x) * before.rx + (bow.z - bowBefore.z) * before.rz;

  return {
    drift: project(bowAt(rotFromTorque)), // the anchor: where the THRUST pushes the bow
    driftTotal: project(bowAt(nextRot)),  // where the bow actually ends up this tick
    result,
    angularAccel,
    nextRot,
  };
}

/** Push the same kernel result through the shipped telemetry seam and the shipped resolver. */
function firingsFrom(result, profile, body) {
  const telemetry = computeFlightTelemetry({ body, profile, control: { telemetry: result.telemetry } });
  const firings = resolveRcsFirings(
    telemetry.actuators,
    { x: body.pos.x, z: body.pos.z, rot: body.rot, radius: body.radius },
    resolveActuatorScale(profile),
  );
  return { firings, actuators: telemetry.actuators };
}

const { entity, profile } = playerShip();

console.log('RCS sign vs physical ground truth — the ship the player actually flies\n');
console.log(
  `  subject: ${entity.data.defId} -> ${profile.id} (${profile.family}), ` +
  `mass ${entity.mass}, radius ${entity.radius}, inertia ${entity.flightModel.inertia.toFixed(3)}\n`
);

// --------------------------------------------------------------------------------------------
// 1. The command actually rotates the hull, and in opposite directions
// --------------------------------------------------------------------------------------------

check('a yaw command produces real torque on the real ship, and inverts with the command', () => {
  const right = physicalBowDrift(profile, bodyFor(entity, profile), { turn: 1 });
  const left = physicalBowDrift(profile, bodyFor(entity, profile), { turn: -1 });
  assert.ok(Math.abs(right.drift) > 1e-9, 'turn = +1 must physically move the bow');
  assert.ok(Math.abs(left.drift) > 1e-9, 'turn = -1 must physically move the bow');
  assert.equal(
    Math.sign(right.drift),
    -Math.sign(left.drift),
    'opposite yaw commands must move the bow in opposite directions'
  );
  assert.ok(
    Math.abs(Math.abs(right.drift) - Math.abs(left.drift)) < 1e-9,
    'a symmetric hull must yaw with equal authority in both directions'
  );
});

// --------------------------------------------------------------------------------------------
// 2. THE ANCHOR — the jet is opposite the direction the bow REALLY goes
// --------------------------------------------------------------------------------------------

check('the bow jet is mounted OPPOSITE the direction the bow physically travels', () => {
  for (const turn of [1, -1, 0.45, -0.45]) {
    const body = bodyFor(entity, profile);
    const { drift, result } = physicalBowDrift(profile, body, { turn });
    const { firings, actuators } = firingsFrom(result, profile, body);

    assert.ok(Math.abs(actuators.yaw) > RCS_DEADBAND, `turn=${turn}: yaw demand must clear the deadband to be testable`);
    const bowJets = firings.filter((j) => j.station === 'bow');
    assert.equal(bowJets.length, 1, `turn=${turn}: a yaw couple must light exactly one bow jet, got ${bowJets.length}`);

    const bowStarboard = Math.sign(drift);           // +1 the bow really swung to starboard
    const jet = bowJets[0];
    // Newton: to shove the bow to starboard the nozzle must sit on the PORT hull.
    assert.equal(
      jet.side,
      -bowStarboard,
      `turn=${turn}: the bow physically drifted ${bowStarboard > 0 ? 'STARBOARD' : 'PORT'} ` +
      `so the firing jet must sit on the ${bowStarboard > 0 ? 'PORT' : 'STARBOARD'} hull, ` +
      `but the resolver lit side ${jet.side}`
    );
  }
});

check('the stern jet completes the couple on the hull opposite the bow jet', () => {
  for (const turn of [1, -1]) {
    const body = bodyFor(entity, profile);
    const { drift, result } = physicalBowDrift(profile, body, { turn });
    const { firings } = firingsFrom(result, profile, body);
    const bow = firings.find((j) => j.station === 'bow');
    const stern = firings.find((j) => j.station === 'stern');
    assert.ok(bow && stern, `turn=${turn}: a yaw must light one bow and one stern jet`);
    assert.equal(stern.side, -bow.side, `turn=${turn}: bow and stern jets must sit on opposite hulls`);
    // And the stern's push must oppose the bow's — that is what makes it a couple rather than a
    // translation. Checked against the PHYSICAL drift, not against the resolver's own labels.
    const axes = shipAxes(body.rot);
    const bowPush = bow.pushX * axes.rx + bow.pushZ * axes.rz;
    const sternPush = stern.pushX * axes.rx + stern.pushZ * axes.rz;
    assert.equal(Math.sign(bowPush), Math.sign(drift), 'the bow jet must push the way the bow really moved');
    assert.equal(Math.sign(sternPush), -Math.sign(drift), 'the stern jet must push the opposite way');
  }
});

check('the anchor holds at every heading — the resolver is not assuming a fixed world axis', () => {
  // A resolver that treated +Z as "starboard" regardless of attitude would pass at rot = 0 and be
  // wrong everywhere else. Sweeping headings is what makes this a world-space claim.
  for (const rot of [0, 0.6, 1.9, Math.PI, -0.8, -2.7, 5.4]) {
    for (const turn of [1, -1]) {
      const body = bodyFor(entity, profile, { rot });
      const { drift, result } = physicalBowDrift(profile, body, { turn });
      const { firings } = firingsFrom(result, profile, body);
      const bow = firings.find((j) => j.station === 'bow');
      assert.ok(bow, `rot=${rot} turn=${turn}: expected a bow jet`);
      assert.equal(
        bow.side,
        -Math.sign(drift),
        `rot=${rot} turn=${turn}: jet side ${bow.side} contradicts the physical bow drift`
      );
    }
  }
});

check('the anchor holds while the hull is already rotating and translating', () => {
  // Counter-torque (the assist arresting a spin) is the case most likely to invert: the command
  // and the correction point opposite ways, so an implementation that keys off the INPUT rather
  // than the signed demand fires the wrong nozzle exactly here. Note these cases are also where
  // `drift` and `driftTotal` genuinely disagree — see physicalBowDrift's header.
  const cases = [
    { label: 'arresting a starboard spin, no input', input: { turn: 0 }, body: { angVel: 2.4 } },
    { label: 'arresting a port spin, no input', input: { turn: 0 }, body: { angVel: -2.4 } },
    { label: 'yawing against existing spin', input: { turn: -1 }, body: { angVel: 2.0 } },
    { label: 'yawing while cruising', input: { turn: 1 }, body: { vel: { x: 90, z: 40 }, rot: 0.9 } },
  ];
  for (const c of cases) {
    const body = bodyFor(entity, profile, c.body);
    const { drift, result } = physicalBowDrift(profile, body, c.input);
    const { firings, actuators } = firingsFrom(result, profile, body);
    if (Math.abs(actuators.yaw) <= RCS_DEADBAND) continue; // no yaw demand: nothing to anchor
    const bow = firings.find((j) => j.station === 'bow');
    if (!bow) continue; // a pure-translation frame; the couple tests above own that shape
    assert.ok(Math.abs(drift) > 1e-12, `${c.label}: expected measurable bow motion`);
    assert.equal(
      bow.side,
      -Math.sign(drift),
      `${c.label}: jet side ${bow.side} contradicts the physical bow drift ${drift}`
    );
  }
});

// --------------------------------------------------------------------------------------------
// 3. The published telemetry sign agrees with the physics it claims to describe
// --------------------------------------------------------------------------------------------

check('actuators.yaw carries the SIGN of the real angular acceleration, not just its magnitude', () => {
  // This is the forwarding seam RC-3 was about. If it ever publishes an unsigned magnitude again,
  // presentation has to guess from input keys — which is the original defect.
  for (const turn of [1, -1, 0.3, -0.3]) {
    const body = bodyFor(entity, profile);
    const { result, angularAccel } = physicalBowDrift(profile, body, { turn });
    const { actuators } = firingsFrom(result, profile, body);
    assert.ok(Math.abs(angularAccel) > 1e-9, `turn=${turn}: expected real angular acceleration`);
    assert.equal(
      Math.sign(actuators.yaw),
      Math.sign(angularAccel),
      `turn=${turn}: published yaw sign ${Math.sign(actuators.yaw)} disagrees with the physical ` +
      `angular acceleration sign ${Math.sign(angularAccel)}`
    );
  }
});

check('every published actuator channel stays finite and bounded on the real ship', () => {
  const inputs = [
    { turn: 1 }, { turn: -1 }, { strafe: 1 }, { strafe: -1 }, { throttle: 1 },
    { throttle: 1, turn: -0.6 }, { brake: true }, { throttle: -1 }, { turn: 0.7, strafe: -0.5, brake: true },
  ];
  for (const input of inputs) {
    for (const bodyOverrides of [{}, { vel: { x: 300, z: -120 }, rot: 1.3 }, { angVel: 3.1 }]) {
      const body = bodyFor(entity, profile, bodyOverrides);
      const { result } = physicalBowDrift(profile, body, input);
      const { firings, actuators } = firingsFrom(result, profile, body);
      for (const [channel, value] of Object.entries(actuators)) {
        if (typeof value !== 'number') continue;
        assert.ok(
          Number.isFinite(value),
          `${JSON.stringify(input)}: actuator channel "${channel}" went non-finite (${value})`
        );
      }
      for (const jet of firings) {
        const tag = `${JSON.stringify(input)} ${jet.station}/${jet.side}`;
        assert.ok(jet.intensity > 0 && jet.intensity <= 1, `${tag}: intensity ${jet.intensity} outside (0,1]`);
        assert.ok(Number.isFinite(jet.x) && Number.isFinite(jet.z), `${tag}: nozzle position went non-finite`);
        assert.ok(
          Math.abs(Math.hypot(jet.pushX, jet.pushZ) - 1) < 1e-12,
          `${tag}: push must remain a unit vector`
        );
      }
    }
  }
});

// --------------------------------------------------------------------------------------------
// 4. Every player-flyable hull, not just the starter
// --------------------------------------------------------------------------------------------

check('the anchor holds for every hull the player can buy', () => {
  for (const shipDef of Object.values(SHIPS)) {
    const subject = playerShip(shipDef.id, []);
    for (const turn of [1, -1]) {
      const body = bodyFor(subject.entity, subject.profile);
      const { drift, result } = physicalBowDrift(subject.profile, body, { turn });
      const { firings, actuators } = firingsFrom(result, subject.profile, body);
      if (Math.abs(actuators.yaw) <= RCS_DEADBAND) continue;
      const bow = firings.find((j) => j.station === 'bow');
      if (!bow) continue;
      assert.ok(Math.abs(drift) > 1e-12, `${shipDef.id}: turn=${turn} produced no bow motion`);
      assert.equal(
        bow.side,
        -Math.sign(drift),
        `${shipDef.id}: turn=${turn} jet side ${bow.side} contradicts the physical bow drift`
      );
    }
  }
});

console.log('');
if (failures > 0) {
  console.error(`RCS sign ground truth FAILED — ${failures} of ${checks + failures} checks failed.`);
  process.exit(1);
}
console.log(`All ${checks} RCS sign ground-truth checks PASSED.`);
