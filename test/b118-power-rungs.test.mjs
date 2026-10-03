// B118 — the Range teaches all five powers. Well is 'well_pulls_light'; these four
// rungs land seed, repulsor, cone and skim on the same rail in the same shared flight
// model (drivePlayerStep / getDerivedStats — no separate practice model).
//
// Every exercise is driven through its real verb edge (deploySeed / deployRepulsor /
// toggleCone / toggleSkim), judged on trajectory and contact, and the contrary case
// must produce a fail verdict, not silence. No rng anywhere — authored geometry only.
//
// Run: node --test test/b118-power-rungs.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  RANGE_RAIL_ROWS,
  SEED_PARKS_DRIFT_DRILL_ID,
  REPULSOR_PILES_BERM_DRILL_ID,
  CONE_PLOWS_LANE_DRILL_ID,
  SKIM_COLLECTS_BAND_DRILL_ID,
  POWER_RUNG_IDS,
  createSeedParksDriftRung,
  tickSeedParksDriftDrill,
  createRepulsorBermRung,
  tickRepulsorBermDrill,
  createConeLaneRung,
  tickConeLaneDrill,
  createSkimBandRung,
  tickSkimBandDrill,
  rangeRungIndex,
} from '../src/ui/screens/range.js';
import { POWER_ROSTER, FIELD_DEFS } from '../src/data/fields.js';

const DT = 1 / 60;
const TICK_LIMIT = 40 / DT;

function wrapPi(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function steerAt(input, sim, tx, tz, deadband = 0.03) {
  const d = wrapPi(Math.atan2(tz - sim.player.z, tx - sim.player.x) - sim.player.rot);
  if (d > deadband) input.turnRight = true;
  else if (d < -deadband) input.turnLeft = true;
  return d;
}

test('the five POWER_ROSTER verbs all have a live rung on the rail', () => {
  // The roster is the contract of record: every power's drillId maps to a rail row.
  assert.equal(POWER_ROSTER.length, 5);
  for (const id of POWER_RUNG_IDS) {
    assert.ok(rangeRungIndex(id) >= 0, `${id} missing from the rail`);
    const row = RANGE_RAIL_ROWS.find((entry) => entry.id === id);
    assert.ok(row.instruction && row.instruction.length > 10, `${id} needs a spoken instruction`);
    assert.equal(row.rule, row.rule.toUpperCase(), `${id} rule stays authored caps`);
  }
  // The four new rungs append after SF-015's three — every recorded index stays put.
  assert.equal(rangeRungIndex(SEED_PARKS_DRIFT_DRILL_ID), 12);
  assert.equal(rangeRungIndex(REPULSOR_PILES_BERM_DRILL_ID), 13);
  assert.equal(rangeRungIndex(CONE_PLOWS_LANE_DRILL_ID), 14);
  assert.equal(rangeRungIndex(SKIM_COLLECTS_BAND_DRILL_ID), 15);
  assert.equal(rangeRungIndex('well_pulls_light'), 6);
  assert.equal(rangeRungIndex('orbit_before_release'), 11);
});

test('seed_parks_drift clears when the lock-ring catches the lead, fails when it lands behind', () => {
  // ── the clean throw: nose at the intercept point, then the seed verb ────────────
  {
    const sim = createSeedParksDriftRung({ shipId: 'ship_kestrel' });
    let result = { verdict: null };
    let thrown = false;
    for (let tick = 0; tick < TICK_LIMIT && !result.verdict; tick += 1) {
      // Lead the drift: the ring must land where the hulk WILL be at lock (+1.6 s).
      const leadX = sim.hulk.x + sim.hulk.vx * (sim.seedTravelS + 0.35);
      const d = steerAt({ forward: false }, sim, leadX, sim.hulk.z);
      const input = {};
      if (d > 0.03) input.turnRight = true;
      else if (d < -0.03) input.turnLeft = true;
      const deploySeed = !thrown && Math.abs(d) < 0.06;
      if (deploySeed) thrown = true;
      result = tickSeedParksDriftDrill(sim, DT, { input, deploySeed });
    }
    assert.ok(result.verdict, 'the hitch run must reach a verdict');
    assert.equal(result.verdict.kind, 'clear', result.verdict.because || 'the ring never parked the drift');
    assert.equal(sim.hitched, true);
    assert.equal(sim.parked, true);
    assert.ok(sim.hulk.x < sim.spillX, 'the drift stopped short of the spill line');
  }

  // ── the contrary case: throw straight east, behind the drift's line ─────────────
  {
    const sim = createSeedParksDriftRung({ shipId: 'ship_kestrel' });
    sim.player.rot = Math.atan2(sim.hulk.z - sim.player.z + 200, sim.hulk.x - sim.player.x); // aim high, miss the path
    let result = { verdict: null };
    let thrown = false;
    for (let tick = 0; tick < TICK_LIMIT && !result.verdict; tick += 1) {
      const deploySeed = !thrown && tick === 10;
      if (deploySeed) thrown = true;
      result = tickSeedParksDriftDrill(sim, DT, { input: {}, deploySeed });
    }
    assert.ok(result.verdict, 'the miss must resolve');
    assert.equal(result.verdict.kind, 'fail');
    assert.equal(sim.parked, false);
  }

  // ── determinism: the rung re-stages identically ────────────────────────────────
  {
    const a = createSeedParksDriftRung({ shipId: 'ship_kestrel' });
    const b = createSeedParksDriftRung({ shipId: 'ship_kestrel' });
    assert.deepEqual([a.hulk.x, a.hulk.z, a.hulk.vx], [b.hulk.x, b.hulk.z, b.hulk.vx]);
    assert.equal(a.seedTravelS, b.seedTravelS);
  }
});

test('repulsor_piles_berm bowls the pile outward, and a dry drop fails', () => {
  // ── the clean drop: the plow under the pile shoves mass out ─────────────────────
  {
    const sim = createRepulsorBermRung({ shipId: 'ship_kestrel' });
    let result = { verdict: null };
    let dropped = false;
    for (let tick = 0; tick < TICK_LIMIT && !result.verdict; tick += 1) {
      const deployRepulsor = !dropped && tick === 5;
      if (deployRepulsor) dropped = true;
      result = tickRepulsorBermDrill(sim, DT, { input: {}, deployRepulsor });
    }
    assert.ok(result.verdict, 'the berm run must reach a verdict');
    assert.equal(result.verdict.kind, 'clear', result.verdict.because || 'the pile never bowled');
    assert.ok(sim.bermed >= sim.bermNeed);
    // The plow shoved what the ring reached — not a scripted teleport.
    const moved = sim.pile.filter((b) => b.bowled);
    assert.ok(moved.length >= sim.bermNeed);
  }

  // ── the contrary case: never drop the plow ──────────────────────────────────────
  {
    const sim = createRepulsorBermRung({ shipId: 'ship_kestrel' });
    let result = { verdict: null };
    for (let tick = 0; tick < TICK_LIMIT && !result.verdict; tick += 1) {
      result = tickRepulsorBermDrill(sim, DT, { input: {} });
    }
    assert.ok(result.verdict, 'the dry run must resolve');
    assert.equal(result.verdict.kind, 'fail');
    assert.equal(result.verdict.text, 'NO PLOW');
  }
});

test('cone_plows_lane clears with the wedge open and clips with it closed', () => {
  // ── the clean lane: wedge open, hold the corridor ───────────────────────────────
  {
    const sim = createConeLaneRung({ shipId: 'ship_kestrel' });
    let result = { verdict: null };
    let opened = false;
    for (let tick = 0; tick < TICK_LIMIT && !result.verdict; tick += 1) {
      const gate = sim.gates[0];
      const input = { forward: true };
      steerAt(input, sim, gate.x, gate.centerZ, 0.02);
      const toggleCone = !opened && tick === 2;
      if (toggleCone) opened = true;
      result = tickConeLaneDrill(sim, DT, { input, toggleCone });
    }
    assert.ok(result.verdict, 'the lane run must reach a verdict');
    assert.equal(result.verdict.kind, 'clear', result.verdict.because || 'the wedge never opened the lane');
    assert.equal(sim.cone.on, true);
    assert.equal(sim.gates[0].state, 'passed');
  }

  // ── the contrary case: wedge closed, the clutter is a wall ──────────────────────
  {
    const sim = createConeLaneRung({ shipId: 'ship_kestrel' });
    let result = { verdict: null };
    for (let tick = 0; tick < TICK_LIMIT && !result.verdict; tick += 1) {
      result = tickConeLaneDrill(sim, DT, { input: { forward: true } });
    }
    assert.ok(result.verdict, 'the closed-wedge run must resolve');
    assert.equal(result.verdict.kind, 'fail');
    assert.equal(result.verdict.text, 'YOU CLIPPED THE CLUTTER');
    assert.equal(sim.cone.on, false);
  }

  // ── the rung's wedge is the live power's wedge, not a drill-shaped one ─────────
  {
    const sim = createConeLaneRung({ shipId: 'ship_kestrel' });
    assert.equal(sim.cone.halfAngle, FIELD_DEFS.cone.halfAngleRad);
    assert.equal(sim.cone.radius, FIELD_DEFS.cone.radius);
  }
});

test('skim_collects_band harvests the ring with the scoop open', () => {
  // ── the clean graze: scoop open, fly the band ───────────────────────────────────
  {
    const sim = createSkimBandRung({ shipId: 'ship_kestrel' });
    let result = { verdict: null };
    let opened = false;
    for (let tick = 0; tick < TICK_LIMIT && !result.verdict; tick += 1) {
      const p = sim.player;
      const dist = Math.hypot(p.x - sim.bandCenter.x, p.z - sim.bandCenter.z);
      // Fly the ring: nose along the band tangent, correcting the radius gently.
      const angle = Math.atan2(p.z - sim.bandCenter.z, p.x - sim.bandCenter.x);
      let target;
      if (dist > sim.bandR + 40) {
        target = { x: Math.cos(angle) * sim.bandR, z: Math.sin(angle) * sim.bandR };
      } else {
        target = {
          x: sim.bandCenter.x + Math.cos(angle + 0.4) * sim.bandR,
          z: sim.bandCenter.z + Math.sin(angle + 0.4) * sim.bandR,
        };
      }
      const input = { forward: true };
      steerAt(input, sim, target.x, target.z, 0.05);
      const toggleSkim = !opened && tick === 3;
      if (toggleSkim) opened = true;
      result = tickSkimBandDrill(sim, DT, { input, toggleSkim });
    }
    assert.ok(result.verdict, 'the graze must reach a verdict');
    assert.equal(result.verdict.kind, 'clear', result.verdict.because || 'the sheet never fed the hull');
    assert.equal(sim.scoop.on, true);
    assert.ok(sim.collected >= sim.collectNeed);
    const left = sim.motes.filter((m) => !m.collected).length;
    assert.ok(left <= sim.motes.length - sim.collectNeed);
  }

  // ── the contrary case: scoop closed, the band keeps its motes ───────────────────
  {
    const sim = createSkimBandRung({ shipId: 'ship_kestrel' });
    let result = { verdict: null };
    for (let tick = 0; tick < TICK_LIMIT && !result.verdict; tick += 1) {
      const p = sim.player;
      const angle = Math.atan2(p.z - sim.bandCenter.z, p.x - sim.bandCenter.x);
      const target = {
        x: sim.bandCenter.x + Math.cos(angle + 0.4) * sim.bandR,
        z: sim.bandCenter.z + Math.sin(angle + 0.4) * sim.bandR,
      };
      const input = { forward: true };
      steerAt(input, sim, target.x, target.z, 0.05);
      result = tickSkimBandDrill(sim, DT, { input });
    }
    assert.ok(result.verdict, 'the closed-scoop run must resolve');
    assert.equal(result.verdict.kind, 'fail');
    assert.equal(result.verdict.text, 'SCOOP CLOSED');
    assert.equal(sim.collected, 0);
  }

  // ── the sheet is the live power's sheet ─────────────────────────────────────────
  {
    const sim = createSkimBandRung({ shipId: 'ship_kestrel' });
    assert.equal(sim.scoop.halfWidth, FIELD_DEFS.skim.halfWidth);
    assert.equal(sim.scoop.radius, FIELD_DEFS.skim.radius);
  }
});

test('every power rung drives the shared flight model, not a practice model', () => {
  for (const make of [createSeedParksDriftRung, createRepulsorBermRung, createConeLaneRung, createSkimBandRung]) {
    const sim = make({ shipId: 'ship_kestrel' });
    assert.ok(sim.model && Number.isFinite(sim.model.mainAccel) && Number.isFinite(sim.model.maxSpeed),
      `${sim.id} must drive the same derived flight model as the rest of the rail`);
    assert.ok(sim.model.maxSpeed > 0);
  }
});
