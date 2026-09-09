#!/usr/bin/env node
// Numerical stability of the propulsion kernel at extreme speed — multi-trial (atlas packet E-3).
//
// WHY MULTI-TRIAL. A governor or ramp bug at extreme velocity is rarely reachable by the tidy
// input a hand-written case supplies (full throttle, straight line, from rest). It surfaces when
// throttle, turn, strafe, brake and boost are all moving while the ship is already fast, because
// that is when the governor's error term changes sign inside a tick and when the yaw controller
// and the speed servo fight each other. One scripted trajectory samples one path through that
// space. This probe samples many, from a FIXED SEED so a failure is reproducible by trial index.
//
// WHAT IS BEING GRADED, and why each bound is the number it is:
//
//   1. NOTHING GOES NON-FINITE. Force, torque, velocity and position, every tick. A single NaN in
//      velocity reaches position next tick, and from there the camera, the map readout and the
//      sector-membership test. It is the cheapest catastrophic failure in the engine.
//
//   2. THE TRAVEL CAP NEVER EXCEEDS THE CEILING, under adversarial input — with the drive state
//      flipped mid-burn between off/spooling/engaged/cooldown, the shape a real latch produces
//      when a player taps it, rather than the clean single ramp the unit test drives.
//
//   3. SPEED DOES NOT DIVERGE. Deliberately NOT "speed never exceeds the ceiling": D5 is explicit
//      that drift and newtonian "ARE the ungoverned toy", and the ceiling bounds the assisted
//      GOVERNOR'S CAP, not the hull's velocity. Asserting the ceiling as a speed clamp would be
//      asserting a product that was explicitly rejected. The bound here catches runaway only.
//
//   4. PER-TICK DISPLACEMENT AT THE SANCTIONED CEILING STAYS UNDER HULL SCALE. Graded separately
//      and deterministically, because it is a claim about the PRODUCT's envelope rather than about
//      this probe's adversarial initial conditions. Collision is not a swept test: a ship that
//      moves further than its own radius in one tick can pass through geometry. The bound is the
//      SHIP'S OWN radius from its derived stats — the fixture ships in test/ use radius 6 while the
//      real starter hull is 14, and a constant would grade the wrong ship.
//
//   5. FRAME REBASE STAYS SANE. `FRAME_REBASE_THRESHOLD_WU` is 8192 (src/core/coordinates.js).
//      Reported as ticks-per-rebase so the margin is visible rather than merely asserted.
//
// WHAT THE ADVERSARIAL TRIALS ARE AND ARE NOT EVIDENCE OF. They start the ship at up to 1.5x its
// ceiling and switch assist mode mid-flight, so the peak speeds in the table below are PROBE
// conditions, not speeds the game is claimed to produce organically. They are evidence about
// stability under those conditions; they are not evidence that a player can reach them. Grading a
// hull-tunnelling failure off those numbers would be blaming the product for the probe's setup.
//
// This probe grades the SHIPS THE PLAYER CAN FLY, resolved through the real spawn chain, plus the
// full drive catalogue so a family nobody currently flies cannot rot silently. Catalogue-only rows
// carry an INVENTED mass/radius (no hull resolves to them) and are therefore reported for
// stability only — they are never graded on hull margin, because there is no hull.

import { makeShipEntitySpec } from '../src/systems/ships.js';
import { NEW_GAME } from '../src/data/newGameDefaults.js';
import { SHIPS } from '../src/data/ships.js';
import { PROPULSION_PROFILES, resolvePropulsionProfile } from '../src/core/flight/propulsionCatalog.js';
import {
  createPropulsionRuntime,
  resolveTravelCeiling,
  stepPropulsion,
  TRAVEL_CEILING_ABSOLUTE_WU_S,
  TRAVEL_DRIVE_STATES,
} from '../src/core/flight/propulsionKernel.js';
import { FRAME_REBASE_THRESHOLD_WU } from '../src/core/coordinates.js';
import { TRAVEL_FLAGS } from '../src/data/featureFlags.js';

const DT = 1 / 60;
const TRIALS_PER_SUBJECT = 12;
const TICKS_PER_TRIAL = 1800;      // 30 simulated seconds
const REBASE_TICK_HEADROOM = 64;   // ticks of travel that must fit inside one rebase span

const failures = [];
const warnings = [];
const rows = [];

/**
 * Advisory threshold: reported loudly below the hard bound so drift is visible before it fails.
 *
 * D5's engineering justification for the absolute ceiling is the phrase "stays well under
 * hull-radius scale (hull radii are single-digit-to-tens of WU)". A hull spending most of its own
 * radius per tick is not "well under", it is near-tunnelling inside the sanctioned envelope.
 */
const HULL_MARGIN_ADVISORY = 0.75;

/**
 * Hard bound backing the documented claim (2026-08-24 verification-audit repair).
 *
 * The check's own justification is "well under hull-radius"; a tick displacing 85%+ of the hull
 * radius is not that, and past it the custom contact path's swept margin has no headroom against
 * tunnelling. 0.85 is the highest value every live catalog ship honestly clears today; tightening
 * it further is D5's owner's call, but a check that only warned while its justification was
 * violated could never fail (the audit's finding), so the margin is now enforced.
 */
const HULL_MARGIN_HARD = 0.85;

/** Deterministic PRNG (mulberry32) so a failing trial index reproduces exactly. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const positive = (v, f) => (Number.isFinite(v) && v > 0 ? v : f);

/** Player-flyable subjects, resolved through the real spawn chain. */
function playerSubjects() {
  return Object.values(SHIPS).map((shipDef) => {
    const fittings = shipDef.id === NEW_GAME.shipId ? NEW_GAME.fittedModules || [] : [];
    const spec = makeShipEntitySpec(shipDef.id, {
      team: 0, factionId: 'faction_free', isPlayer: true, player: null, fittings, pos: { x: 0, z: 0 },
    });
    const entity = { ...spec, id: 1, alive: true, vel: { x: 0, z: 0 }, angVel: 0 };
    const profile = resolvePropulsionProfile(entity, { playerId: 1, player: {} });
    const derived = entity.data.derived.flightModel;
    return {
      label: `${shipDef.id} (${profile.id})`,
      profile,
      mass: positive(entity.mass, positive(profile.mass, 1)),
      inertia: positive(entity.flightModel && entity.flightModel.inertia, positive(derived && derived.inertia, 1)),
      radius: positive(entity.radius, 6),
      spawned: true,
    };
  });
}

/**
 * Catalogue subjects for families no shipped hull resolves to. Their mass/radius are not from a
 * spawned ship — that is stated on the row rather than hidden, so nobody reads these as evidence
 * about a ship the player flies.
 */
function catalogueSubjects(covered) {
  return Object.values(PROPULSION_PROFILES)
    .filter((profile) => !covered.has(profile.id))
    .map((profile) => ({
      label: `${profile.id} [catalogue only]`,
      profile,
      mass: positive(profile.mass, 20),
      inertia: 40,
      radius: 8,
      spawned: false,
    }));
}

function runTrial(subject, trialIndex) {
  const random = rng(0x5f3a01 + trialIndex * 7919 + hash(subject.label));
  const ceiling = resolveTravelCeiling(subject.profile);
  const body = {
    pos: { x: 0, z: 0 },
    // Start already fast: the interesting regime is not the climb, it is being AT speed while the
    // controls move. Up to 1.5x the ceiling, so the overspeed branch is genuinely exercised.
    vel: { x: (random() * 1.5) * ceiling, z: (random() - 0.5) * ceiling },
    rot: (random() - 0.5) * Math.PI * 2,
    angVel: (random() - 0.5) * 4,
    mass: subject.mass,
    inertia: subject.inertia,
    radius: subject.radius,
  };
  let runtime = createPropulsionRuntime(subject.profile);
  let drive = { state: 'engaged', cap: 0 };
  let maxStep = 0;
  let maxSpeed = 0;

  for (let tick = 0; tick < TICKS_PER_TRIAL; tick += 1) {
    // Adversarial, but plausible: every axis moves, and the latch is flipped mid-burn.
    if (tick % 137 === 0) {
      drive = { ...drive, state: TRAVEL_DRIVE_STATES[Math.floor(random() * TRAVEL_DRIVE_STATES.length)] };
    }
    const input = {
      assistMode: random() < 0.8 ? 'assisted' : (random() < 0.5 ? 'drift' : 'newtonian'),
      throttle: random() < 0.15 ? random() : 1,
      strafe: (random() - 0.5) * 2,
      turn: (random() - 0.5) * 2,
      boost: random() < 0.4,
      brake: random() < 0.08,
      travelDrive: drive,
    };

    const result = stepPropulsion({ dt: DT, body, input, profile: subject.profile, runtime, environment: {} });
    runtime = result.runtime;

    const where = `${subject.label} trial ${trialIndex} tick ${tick}`;
    if (!Number.isFinite(result.force.x) || !Number.isFinite(result.force.z)) {
      return fail(`${where}: force went non-finite (${result.force.x}, ${result.force.z})`);
    }
    if (!Number.isFinite(result.torque.y)) {
      return fail(`${where}: torque went non-finite (${result.torque.y})`);
    }

    body.vel.x += (result.force.x / body.mass) * DT;
    body.vel.z += (result.force.z / body.mass) * DT;
    body.angVel += (result.torque.y / body.inertia) * DT;
    body.rot += body.angVel * DT;

    if (!Number.isFinite(body.vel.x) || !Number.isFinite(body.vel.z)) {
      return fail(`${where}: velocity went non-finite (${body.vel.x}, ${body.vel.z})`);
    }

    const speed = Math.hypot(body.vel.x, body.vel.z);
    const step = speed * DT;
    body.pos.x += body.vel.x * DT;
    body.pos.z += body.vel.z * DT;
    if (!Number.isFinite(body.pos.x) || !Number.isFinite(body.pos.z)) {
      return fail(`${where}: position went non-finite (${body.pos.x}, ${body.pos.z})`);
    }

    maxStep = Math.max(maxStep, step);
    maxSpeed = Math.max(maxSpeed, speed);

    if (result.telemetry && Number.isFinite(result.telemetry.travelCap)) {
      const cap = result.telemetry.travelCap;
      if (!Number.isFinite(cap) || cap < 0) return fail(`${where}: travelCap went invalid (${cap})`);
      if (cap > ceiling + 1e-6) return fail(`${where}: travelCap ${cap} exceeded the ceiling ${ceiling}`);
      drive = { ...drive, cap };
    }
  }

  return { maxStep, maxSpeed, ceiling };
}

function fail(message) {
  failures.push(message);
  return null;
}

function hash(text) {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) h = (Math.imul(h, 31) + text.charCodeAt(i)) >>> 0;
  return h;
}

// --------------------------------------------------------------------------------------------

console.log('Propulsion numerical stability at extreme speed — multi-trial\n');
console.log(
  `  ${TRIALS_PER_SUBJECT} trials x ${TICKS_PER_TRIAL} ticks per subject, fixed seed, ` +
  `travel flags forced ON\n`
);

const previousFlags = { ...TRAVEL_FLAGS };
Object.assign(TRAVEL_FLAGS, { travelBurn: true, boostNeverBrakes: true, dashMomentum: true });

try {
  const players = playerSubjects();
  const covered = new Set(players.map((s) => s.profile.id));
  const subjects = [...players, ...catalogueSubjects(covered)];

  for (const subject of subjects) {
    let worstStep = 0;
    let worstSpeed = 0;
    let ceiling = 0;
    for (let trial = 0; trial < TRIALS_PER_SUBJECT; trial += 1) {
      const outcome = runTrial(subject, trial);
      if (!outcome) break;
      worstStep = Math.max(worstStep, outcome.maxStep);
      worstSpeed = Math.max(worstSpeed, outcome.maxSpeed);
      ceiling = outcome.ceiling;
    }

    // The PRODUCT claim: displacement per tick at the drive's own sanctioned ceiling. Deterministic
    // and independent of this probe's adversarial starting velocity.
    const ceilingStep = ceiling * DT;
    const rebaseTicks = ceilingStep > 0 ? FRAME_REBASE_THRESHOLD_WU / ceilingStep : Infinity;
    rows.push({
      label: subject.label,
      spawned: subject.spawned,
      ceiling,
      ceilingStep,
      worstSpeed,
      worstStep,
      radius: subject.radius,
      rebaseTicks,
      hullMargin: subject.spawned ? ceilingStep / subject.radius : null,
    });

    if (subject.spawned && !(ceilingStep / subject.radius < HULL_MARGIN_HARD)) {
      failures.push(
        `${subject.label}: a tick at the sanctioned ceiling displaces ` +
        `${((ceilingStep / subject.radius) * 100).toFixed(0)}% of the hull radius ` +
        `(${ceilingStep.toFixed(2)} of ${subject.radius} WU). Hard bound is ${(HULL_MARGIN_HARD * 100).toFixed(0)}% of hull ` +
        `radius: the check's own justification is "well under hull-radius scale", and beyond this the ` +
        `swept contact margin has no tunnelling headroom.`
      );
    } else if (subject.spawned && ceilingStep / subject.radius >= HULL_MARGIN_ADVISORY) {
      warnings.push(
        `${subject.label}: a tick at the sanctioned ceiling displaces ` +
        `${((ceilingStep / subject.radius) * 100).toFixed(0)}% of the hull radius ` +
        `(${ceilingStep.toFixed(2)} of ${subject.radius} WU) — above the ${(HULL_MARGIN_ADVISORY * 100).toFixed(0)}% advisory, ` +
        `still under the ${(HULL_MARGIN_HARD * 100).toFixed(0)}% hard bound.`
      );
    }
    if (subject.spawned && !(ceilingStep < subject.radius)) {
      failures.push(
        `${subject.label}: at its own ceiling ${ceiling.toFixed(1)} WU/s a tick displaces ` +
        `${ceilingStep.toFixed(3)} WU, at or beyond the hull radius ${subject.radius} WU — ` +
        `collision geometry can be tunnelled inside the sanctioned envelope`
      );
    }
    if (!(rebaseTicks >= REBASE_TICK_HEADROOM)) {
      failures.push(
        `${subject.label}: only ${rebaseTicks.toFixed(1)} ticks at the ceiling fit inside the ` +
        `${FRAME_REBASE_THRESHOLD_WU} WU rebase span (need >= ${REBASE_TICK_HEADROOM})`
      );
    }
    if (ceiling > TRAVEL_CEILING_ABSOLUTE_WU_S) {
      failures.push(`${subject.label}: resolved ceiling ${ceiling} breaks the absolute engineering bound`);
    }
    // Runaway guard. Generous on purpose — it must catch divergence without asserting the ceiling
    // is a velocity clamp, which D5 explicitly says it is not.
    if (!(worstSpeed < ceiling * 8)) {
      failures.push(
        `${subject.label}: speed diverged under adversarial input — peaked at ${worstSpeed.toFixed(1)} WU/s ` +
        `against a ceiling of ${ceiling.toFixed(1)}`
      );
    }
  }
} finally {
  Object.assign(TRAVEL_FLAGS, previousFlags);
}

// --------------------------------------------------------------------------------------------
// Evidence table — the margins, printed, so "it passed" is not the only thing on the record.
// --------------------------------------------------------------------------------------------

const pad = (v, n) => String(v).padEnd(n);
const num = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '∞');
console.log(
  `  ${pad('subject', 36)}${pad('ceiling', 9)}${pad('step@ceil', 11)}${pad('hull r', 8)}` +
  `${pad('margin', 9)}${pad('ticks/rebase', 13)}${pad('adversarial peak', 17)}`
);
console.log(`  ${'-'.repeat(103)}`);
for (const row of rows) {
  const margin = row.hullMargin === null ? '  n/a' : `${(row.hullMargin * 100).toFixed(0)}%`;
  console.log(
    `  ${pad(row.label, 36)}${pad(num(row.ceiling, 1), 9)}${pad(num(row.ceilingStep, 2), 11)}` +
    `${pad(row.spawned ? num(row.radius, 1) : '—', 8)}${pad(margin, 9)}` +
    `${pad(num(row.rebaseTicks, 0), 13)}${pad(`${num(row.worstSpeed, 0)} WU/s`, 17)}`
  );
}

const graded = rows.filter((r) => r.hullMargin !== null);
const worst = graded.reduce((a, b) => (b.hullMargin > a.hullMargin ? b : a), graded[0]);
console.log(
  `\n  tightest hull margin at the sanctioned ceiling: ${worst.label} — a tick displaces ` +
  `${(worst.hullMargin * 100).toFixed(0)}% of its own hull radius`
);
console.log(
  '  (the "adversarial peak" column is this probe\'s stress condition, NOT a speed the game is\n' +
  '   claimed to produce; the ceiling bounds the assisted governor cap, not drift/newtonian velocity)'
);

console.log('');

if (failures.length > 0) {
  for (const message of failures) console.error(`  FAIL  ${message}`);
  console.error(`\nPropulsion extreme-speed stability FAILED — ${failures.length} problem(s).`);
  process.exit(1);
}
console.log(`Propulsion extreme-speed stability PASSED across ${rows.length} subjects.`);
