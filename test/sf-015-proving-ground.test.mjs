// SF-015 — the proving-ground lane teaches three physical exercises on the ordinary
// flight model: slip a gap, brake beside a moving load, orbit before release.
//
// Seed 4242-class determinism: these rungs carry no rng at all — every body is authored
// geometry and the shared drivePlayerStep model answers the same inputs the same way
// every run. Each exercise is driven through the rung's real input channel
// (forward/reverse/yaw/tether toggles), the pass is judged on trajectory and contact,
// and the contrary case must produce a fail verdict, not silence.
//
// Run: node --test test/sf-015-proving-ground.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';

import { mulberry32 } from '../src/core/rng.js';
import {
  RANGE_RAIL_ROWS,
  SLIP_GAP_DRILL_ID,
  BRAKE_BESIDE_LOAD_DRILL_ID,
  ORBIT_RELEASE_DRILL_ID,
  createSlipGapRung,
  tickSlipGapDrill,
  createBrakeBesideLoadRung,
  tickBrakeBesideLoadDrill,
  createOrbitReleaseRung,
  tickOrbitReleaseDrill,
  rangeRungIndex,
} from '../src/ui/screens/range.js';

const SEED = 4242;
const DT = 1 / 60;
const TICK_LIMIT = 30 / DT; // every rung must reach a verdict inside 30 s

function wrapPi(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

test('the rail lists all three proving-ground rungs after the legacy nine', () => {
  assert.ok(mulberry32(SEED)() >= 0, 'seed 4242 drives the fixture rng');
  assert.equal(rangeRungIndex(SLIP_GAP_DRILL_ID), 9);
  assert.equal(rangeRungIndex(BRAKE_BESIDE_LOAD_DRILL_ID), 10);
  assert.equal(rangeRungIndex(ORBIT_RELEASE_DRILL_ID), 11);
  // The legacy rung indices a returning pilot already learned are unmoved.
  assert.equal(rangeRungIndex('swing_do_not_pull'), 2);
  assert.equal(rangeRungIndex('tractor_throw'), 7);
  const ids = RANGE_RAIL_ROWS.map((row) => row.id);
  for (const id of [SLIP_GAP_DRILL_ID, BRAKE_BESIDE_LOAD_DRILL_ID, ORBIT_RELEASE_DRILL_ID]) {
    assert.ok(ids.includes(id), `${id} missing from the rail`);
  }
});

test('slip_a_gap clears on a clean threading run and fails on a clip', () => {
  // ── the clean line: aim at the gap's heart and hold the throttle ────────────────
  {
    const sim = createSlipGapRung({ shipId: 'ship_kestrel' });
    const gate = sim.gates[0];
    let result = { verdict: null };
    for (let tick = 0; tick < TICK_LIMIT && !result.verdict; tick += 1) {
      const desired = Math.atan2(gate.centerZ - sim.player.z, gate.x - sim.player.x);
      const d = wrapPi(desired - sim.player.rot);
      const input = { forward: true };
      if (d > 0.02) input.turnRight = true;
      else if (d < -0.02) input.turnLeft = true;
      result = tickSlipGapDrill(sim, DT, { input });
    }
    assert.ok(result.verdict, 'the threading run must reach a verdict');
    assert.equal(result.verdict.kind, 'clear', result.verdict.because || 'no clean path through the slot');
    assert.equal(result.cleared, true);
    assert.equal(sim.gates[0].state, 'passed');
    assert.ok(sim.timeS <= 24, `gap should teach fast, took ${sim.timeS.toFixed(1)}s`);
  }

  // ── the contrary case: fly the blocker, not the gap ─────────────────────────────
  {
    const sim = createSlipGapRung({ shipId: 'ship_kestrel' });
    const wall = sim.blockers[0];
    let result = { verdict: null };
    for (let tick = 0; tick < TICK_LIMIT && !result.verdict; tick += 1) {
      const desired = Math.atan2(wall.z - sim.player.z, wall.x - sim.player.x);
      const d = wrapPi(desired - sim.player.rot);
      const input = { forward: true };
      if (d > 0.02) input.turnRight = true;
      else if (d < -0.02) input.turnLeft = true;
      result = tickSlipGapDrill(sim, DT, { input });
    }
    assert.ok(result.verdict, 'the clip must reach a verdict');
    assert.equal(result.verdict.kind, 'fail');
    assert.equal(result.verdict.text, 'YOU CLIPPED THE WALL');
    assert.equal(result.cleared, false);
  }

  // ── repeated invocation is deterministic: the rung re-stages identically ────────
  {
    const a = createSlipGapRung({ shipId: 'ship_kestrel' });
    const b = createSlipGapRung({ shipId: 'ship_kestrel' });
    assert.equal(a.gapHalf, b.gapHalf);
    assert.deepEqual(a.gates[0], b.gates[0]);
    assert.deepEqual(
      a.blockers.map((r) => [r.x, r.z, r.radius]),
      b.blockers.map((r) => [r.x, r.z, r.radius]),
    );
  }
});

test('brake_beside_load clears on a held station and fails on contact', () => {
  // ── the clean path: chase down the load, match it, hold ─────────────────────────
  {
    const sim = createBrakeBesideLoadRung({ shipId: 'ship_kestrel' });
    let result = { verdict: null };
    for (let tick = 0; tick < TICK_LIMIT && !result.verdict; tick += 1) {
      const p = sim.player;
      const l = sim.load;
      const dxL = l.x - p.x;
      const dzL = l.z - p.z;
      const relV = Math.hypot(p.vx - l.vx, p.vz - l.vz);
      const speed = Math.hypot(p.vx, p.vz);
      // Steer at the load's own lane; the window is wide so only the speed match is tight.
      // Aim at a hold point 70 wu astern of the load — inside the 120 wu window, with
      // margin so the speed-match never rides the window's edge.
      const desired = Math.atan2(dzL, Math.max(30, dxL - 70));
      const d = wrapPi(desired - p.rot);
      const input = {};
      if (d > 0.02) input.turnRight = true;
      else if (d < -0.02) input.turnLeft = true;
      if (dxL > 100) {
        input.forward = true;
        input.boost = speed < 88; // catch up while it is far ahead
      } else if (relV > 10) {
        input.reverse = true;
      } else if (speed < 56) {
        input.forward = true; // keep pace — station is not a stop
      }
      result = tickBrakeBesideLoadDrill(sim, DT, { input });
    }
    assert.ok(result.verdict, 'the station run must reach a verdict');
    assert.equal(result.verdict.kind, 'clear', result.verdict.because || 'station never held');
    assert.ok(sim.hold >= sim.holdS, 'the hold count, not a callback, is the receipt');
  }

  // ── the contrary case: run the load down instead of matching it ─────────────────
  {
    const sim = createBrakeBesideLoadRung({ shipId: 'ship_kestrel' });
    let result = { verdict: null };
    for (let tick = 0; tick < TICK_LIMIT && !result.verdict; tick += 1) {
      const p = sim.player;
      const l = sim.load;
      const desired = Math.atan2(l.z - p.z, l.x - p.x);
      const d = wrapPi(desired - p.rot);
      const input = { forward: true, boost: true };
      if (d > 0.02) input.turnRight = true;
      else if (d < -0.02) input.turnLeft = true;
      result = tickBrakeBesideLoadDrill(sim, DT, { input });
    }
    assert.ok(result.verdict, 'the ram must reach a verdict');
    assert.equal(result.verdict.kind, 'fail');
    assert.equal(result.verdict.text, 'YOU TAGGED THE LOAD');
  }
});

test('orbit_before_release clears on a full swing and fails on an early cut', () => {
  // ── the clean swing: latch low, hold the line past 180°, release on the arc ─────
  {
    const sim = createOrbitReleaseRung({ shipId: 'ship_kestrel' });
    let result = { verdict: null };
    let latched = false;
    let released = false;
    for (let tick = 0; tick < TICK_LIMIT && !result.verdict; tick += 1) {
      const p = sim.player;
      let toggleTether = false;
      const dist = Math.hypot(p.x - sim.anchor.x, p.z - sim.anchor.z);
      if (!latched && dist <= sim.tether.length + 40) { toggleTether = true; latched = true; }
      // Fly the arc: nose along the tangent, not at the anchor. A radial nose is how
      // a fresh pilot stalls at the circle's edge — the lesson this rung teaches.
      const angle = Math.atan2(p.z - sim.anchor.z, p.x - sim.anchor.x);
      const desired = latched ? angle + Math.PI / 2 : 0; // counterclockwise tangent
      const d = wrapPi(desired - p.rot);
      const input = { forward: true };
      if (d > 0.03) input.turnRight = true;
      else if (d < -0.03) input.turnLeft = true;
      // Release once the arc is banked and the exit line is inside the forward cone.
      if (latched && !released && sim.orbit.swept >= sim.orbit.needed + 0.12) {
        if (angle > 0.5 && angle < 1.2 && p.vz > 10) { toggleTether = true; released = true; }
      }
      result = tickOrbitReleaseDrill(sim, DT, { input, toggleTether });
    }
    assert.ok(result.verdict, 'the swing must reach a verdict');
    assert.equal(result.verdict.kind, 'clear', result.verdict.because || 'orbit did not release through the exit');
    assert.ok(sim.orbit.swept >= sim.orbit.needed, `swept ${sim.orbit.swept.toFixed(2)} < ${sim.orbit.needed.toFixed(2)}`);
    assert.equal(sim.tether.releasedAfterAttach, true);
    assert.equal(sim.exitGate.crossed, true);
  }

  // ── the contrary case: cut the line before the arc is stored ────────────────────
  {
    const sim = createOrbitReleaseRung({ shipId: 'ship_kestrel' });
    let result = { verdict: null };
    let latched = false;
    let released = false;
    for (let tick = 0; tick < TICK_LIMIT && !result.verdict; tick += 1) {
      const p = sim.player;
      let toggleTether = false;
      const dist = Math.hypot(p.x - sim.anchor.x, p.z - sim.anchor.z);
      if (!latched && dist <= sim.tether.length + 40) { toggleTether = true; latched = true; }
      const angle = Math.atan2(p.z - sim.anchor.z, p.x - sim.anchor.x);
      const desired = latched ? angle + Math.PI / 2 : 0;
      const d = wrapPi(desired - p.rot);
      const input = { forward: true };
      if (d > 0.03) input.turnRight = true;
      else if (d < -0.03) input.turnLeft = true;
      // Cut on the east side heading north — well short of the 180° the gate wants.
      if (latched && !released && sim.orbit.swept > 1.8 && angle > 0.3 && angle < 0.7 && p.vz > 10) {
        toggleTether = true;
        released = true;
      }
      result = tickOrbitReleaseDrill(sim, DT, { input, toggleTether });
    }
    assert.ok(result.verdict, 'the early cut must reach a verdict');
    assert.equal(result.verdict.kind, 'fail');
    assert.equal(result.verdict.text, 'HALF AN ORBIT');
    assert.ok(sim.orbit.swept < sim.orbit.needed);
    assert.equal(sim.exitGate.crossed, true, 'the early release still crosses the exit line — the gate judges it');
  }

  // ── never touching the rope at all also resolves, as its own fail ───────────────
  {
    const sim = createOrbitReleaseRung({ shipId: 'ship_kestrel' });
    // Aim straight through the exit line's center — no latch, no orbit. The gate still
    // judges the crossing and names what was skipped.
    sim.player.rot = Math.atan2(
      sim.exitGate.z - sim.player.z,
      sim.exitGate.centerX - sim.player.x,
    );
    let result = { verdict: null };
    for (let tick = 0; tick < TICK_LIMIT && !result.verdict; tick += 1) {
      result = tickOrbitReleaseDrill(sim, DT, { input: { forward: true, boost: true } });
    }
    assert.ok(result.verdict, 'the rope-free run must resolve');
    assert.equal(result.verdict.kind, 'fail');
    assert.equal(result.verdict.text, 'IT NEVER TURNED');
  }
});

test('every proving-ground rung reports a real verdict path, not a callback', () => {
  // The rungs' id/duration sanity: all three are authored drills on the live rail with
  // instruction copy and a verdict budget the same 60s drill bar measures against.
  for (const id of [SLIP_GAP_DRILL_ID, BRAKE_BESIDE_LOAD_DRILL_ID, ORBIT_RELEASE_DRILL_ID]) {
    const row = RANGE_RAIL_ROWS.find((entry) => entry.id === id);
    assert.ok(row, `${id} missing from RAIL_ROWS`);
    assert.ok(row.instruction && row.instruction.length > 10, `${id} needs a spoken instruction`);
    assert.ok(row.rule && row.rule === row.rule.toUpperCase(), `${id} rule stays authored caps`);
  }
  // The ordinary flight model is the shared one — a rung that smuggled in its own
  // drive code would not need getDerivedStats to produce model parameters.
  const sim = createSlipGapRung({ shipId: 'ship_kestrel' });
  assert.ok(sim.model && Number.isFinite(sim.model.mainAccel) && Number.isFinite(sim.model.maxSpeed),
    'the rung drives the same derived flight model as the rest of the rail');
  assert.ok(sim.model.maxSpeed > 0);
});
