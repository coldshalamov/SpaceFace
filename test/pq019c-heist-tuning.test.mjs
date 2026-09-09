// PQ-019C — pin the tuning selection.
//
// The matrix in `test/fixtures/pq019c-tuning-matrix.json` was committed BEFORE
// `scripts/tune-pq019c-heist.mjs` existed, the runner selected once, and the result was transcribed
// into `src/data/heistMission.js`. This suite is what stops that from quietly drifting afterwards:
// every shipped value must still be a member of its own predeclared candidate list, and the derived
// relationships the objectives depend on must still hold.
//
// A number changed here without re-running the matrix fails these tests. That is the point.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { SIM_DT } from '../src/core/sim.js';
import { LAW_INCIDENT_WITNESS_RADIUS } from '../src/systems/lawSecurity.js';
import { MISSION_TUNING } from '../src/data/missions.js';
import {
  PQ019_CAPSULE, PQ019_FACILITIES, projectPq019FacilitySocket,
} from '../src/data/heistFacilities.js';
import { PQ019C_HEIST_TUNING } from '../src/data/heistMission.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const matrix = JSON.parse(readFileSync(
  path.join(here, 'fixtures', 'pq019c-tuning-matrix.json'), 'utf8',
));

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const socket = (id) => projectPq019FacilitySocket(PQ019_FACILITIES[id]);
const LAUNCHER_TO_CATCHER = dist(socket('heist_launcher'), socket('lawful_catcher'));
const CATCHER_TO_FENCE = dist(socket('lawful_catcher'), socket('fence_receiver'));

/** The selection of record. Transcribed from the runner's output, byte for byte. */
const SELECTED = Object.freeze({
  launchSpeed: 100,
  capsuleMass: 180,
  launchWindowS: 30,
  runWindowTicks: 6000,
  witnessRadius: 550,
  responderLeaseCap: 2,
  escapeRadiusWu: 1800,
  responderLeashWu: 2600,
  escapeHoldTicks: 60,
  payoutCr: 1800,
  recoveryPayoutCr: 900,
  unlaunchedWindowTicks: 3000,
});

test('every shipped value is a member of its own predeclared candidate list', () => {
  const shipped = {
    launchSpeed: PQ019_CAPSULE.launchSpeed,
    capsuleMass: PQ019_CAPSULE.mass,
    launchWindowS: PQ019C_HEIST_TUNING.launchWindowS,
    runWindowTicks: PQ019C_HEIST_TUNING.runWindowTicks,
    responderLeaseCap: PQ019C_HEIST_TUNING.responderLeaseCap,
    responderLeashWu: PQ019C_HEIST_TUNING.responderLeashWu,
    escapeRadiusWu: PQ019C_HEIST_TUNING.escapeRadiusWu,
    escapeHoldTicks: PQ019C_HEIST_TUNING.escapeHoldTicks,
    payoutCr: PQ019C_HEIST_TUNING.payoutCr,
    recoveryPayoutCr: PQ019C_HEIST_TUNING.recoveryPayoutCr,
  };
  for (const [key, value] of Object.entries(shipped)) {
    const dimension = matrix.dimensions[key];
    assert.ok(dimension, `${key} must be a declared matrix dimension`);
    assert.ok(dimension.candidates.includes(value),
      `${key} = ${value} is not in its predeclared candidates [${dimension.candidates}]`);
    assert.equal(value, SELECTED[key], `${key} must be the selected value of record`);
  }
});

test('the witness-radius selection is recorded but NOT applied, and the mirror tracks the owner', () => {
  // `lawSecurity` owns this constant. The matrix's own objective selects 550; this packet does not
  // apply it, because raising an owner's constant from a consumer packet is a shared-change request.
  assert.equal(PQ019C_HEIST_TUNING.witnessRadiusMatrixSelection, SELECTED.witnessRadius);
  assert.equal(PQ019C_HEIST_TUNING.witnessRadiusMirror, LAW_INCIDENT_WITNESS_RADIUS,
    'the mirror must track the live owner constant, so a drift on either side fails here');
  assert.notEqual(PQ019C_HEIST_TUNING.witnessRadiusMirror,
    PQ019C_HEIST_TUNING.witnessRadiusMatrixSelection,
    'the delta is real and is carried as an open row in the receipt');
});

test('the witness radius can never reach the lawful-station protection floor', () => {
  // PQ-019B found the witness gate goes VACUOUS at or above 600 WU: a lawful station is its own
  // witness, so every in-jurisdiction theft is automatically seen and the gate can never deny. If a
  // future edit raises it, this fails here as well as in B's annulus test.
  assert.equal(PQ019C_HEIST_TUNING.witnessRadiusCeiling, 600);
  assert.ok(LAW_INCIDENT_WITNESS_RADIUS < PQ019C_HEIST_TUNING.witnessRadiusCeiling,
    'LAW_INCIDENT_WITNESS_RADIUS must stay under the lawful-station protection floor');
  for (const candidate of matrix.dimensions.witnessRadius.candidates) {
    assert.ok(candidate < 600, `matrix candidate ${candidate} would make the witness gate vacuous`);
  }
});

test('the run window cannot expire a run the player was still flying', () => {
  const fullRouteS = (LAUNCHER_TO_CATCHER + CATCHER_TO_FENCE) / PQ019_CAPSULE.launchSpeed;
  const needTicks = Math.ceil(fullRouteS * 2 / SIM_DT);
  assert.ok(PQ019C_HEIST_TUNING.runWindowTicks >= needTicks,
    `run window ${PQ019C_HEIST_TUNING.runWindowTicks} must cover the ${fullRouteS.toFixed(0)}s `
    + `route with 2x margin (>= ${needTicks} ticks)`);
});

test('the launcher leg stays a real interception problem at the selected speed', () => {
  const transitS = LAUNCHER_TO_CATCHER / PQ019_CAPSULE.launchSpeed;
  assert.ok(transitS > 20,
    `launcher->catcher is ${transitS.toFixed(1)}s; under 20s the intercept is a reflex, not a plan`);
});

test('the launch window clears the measured approach with margin', () => {
  // The runner measured Tethys station -> launcher head at 2433 WU against the live cruise
  // reference. Re-derived here from the same live constant so a tuning change to either fails.
  const cruise = MISSION_TUNING.cruiseSpeedRef || 140;
  const approachS = 2433.2 / cruise;
  assert.ok(PQ019C_HEIST_TUNING.launchWindowS >= approachS * 1.25,
    `launch window ${PQ019C_HEIST_TUNING.launchWindowS}s must clear a ${approachS.toFixed(1)}s `
    + 'approach with 25% margin');
});

test('the leash always outlives the escape radius, so pursuit is not decorative', () => {
  assert.ok(
    PQ019C_HEIST_TUNING.responderLeashWu - PQ019C_HEIST_TUNING.escapeRadiusWu >= 600,
    'a leash that releases before escape can latch would make the escape route unreachable',
  );
  assert.ok(PQ019C_HEIST_TUNING.escapeRadiusWu < LAUNCHER_TO_CATCHER,
    'breaking contact must be possible inside the route, not only far outside it');
});

test('the escape hold is at least one second and latches inside the run window', () => {
  const oneSecond = Math.round(1 / SIM_DT);
  assert.ok(PQ019C_HEIST_TUNING.escapeHoldTicks >= oneSecond,
    'one lucky frame must not count as an escape');
  assert.ok(PQ019C_HEIST_TUNING.escapeHoldTicks * 4 <= PQ019C_HEIST_TUNING.runWindowTicks,
    'the hold must latch with room to spare inside the run window');
});

test('the payout beats honest risk-3 work without making it pointless', () => {
  const risk = (MISSION_TUNING.RISK_MULT && MISSION_TUNING.RISK_MULT[3]) || 2.2;
  const boardMax = Math.round(Math.max(...Object.values(MISSION_TUNING.BASE)) * risk);
  assert.ok(PQ019C_HEIST_TUNING.payoutCr > boardMax,
    `${PQ019C_HEIST_TUNING.payoutCr}cr must beat the ${boardMax}cr best ordinary risk-3 contract: `
    + 'this run costs heat, a WANTED flag and a real chance of losing the capsule');
  assert.ok(PQ019C_HEIST_TUNING.payoutCr <= boardMax * 2,
    'more than 2x the honest ceiling would make every other contract pointless');
});

test('the recovery stake is genuinely reduced', () => {
  assert.ok(PQ019C_HEIST_TUNING.recoveryPayoutCr < PQ019C_HEIST_TUNING.payoutCr);
  assert.ok(PQ019C_HEIST_TUNING.recoveryPayoutCr >= PQ019C_HEIST_TUNING.payoutCr / 3,
    'a token payout is not a second chance');
});

test('the unlaunched window outlives an ordinary countdown', () => {
  const countdownTicks = Math.round(PQ019C_HEIST_TUNING.launchWindowS / SIM_DT);
  assert.ok(PQ019C_HEIST_TUNING.unlaunchedWindowTicks > countdownTicks,
    'an unlaunched bound shorter than the countdown would cut off every ordinary run');
  assert.equal(PQ019C_HEIST_TUNING.unlaunchedWindowTicks, SELECTED.unlaunchedWindowTicks);
});

test('the authored recovery policy ships off', () => {
  assert.equal(PQ019C_HEIST_TUNING.recoveryEnabled, false,
    'the packet mandates no recovery; the mechanism exists and is tested, and ships disabled');
});

test('the matrix fixture is intact and still describes what was run', () => {
  assert.equal(matrix.schema, 'spaceface.pq019c.tuningMatrix.v1');
  assert.equal(matrix.runner, 'scripts/tune-pq019c-heist.mjs');
  assert.ok(matrix.seeds.length >= 3, 'a fixed-seed matrix needs more than one seed');
  for (const [name, dimension] of Object.entries(matrix.dimensions)) {
    assert.ok(typeof dimension.objective === 'string' && dimension.objective.length > 20,
      `${name} must state the objective its selection was made under`);
    assert.ok(Array.isArray(dimension.candidates) && dimension.candidates.length >= 3,
      `${name} must offer a real choice`);
    assert.ok(dimension.candidates.includes(dimension.authored),
      `${name}'s authored starting value must itself be a candidate`);
  }
});
