// SFQ-B043: a shove opens a real gap in a formation; the regroup is visible and finite.
// Acceptance: "A shove opens a usable gap; regroup is visible, finite and does not teleport or
// exceed thrust authority." Seed 4242.
import assert from 'node:assert/strict';
import test from 'node:test';

import { ManeuverKind } from '../src/ai/contracts.js';
import { ManeuverPlanner } from '../src/ai/maneuver.js';

const SEED = 4242;
const SLOT = Object.freeze({ x: 0, z: 0 });
const BOUND = 170;
const REJOIN = BOUND * 0.62;
const STEP = 2;
const DISRUPT_RECOVER_PLUS = 45;

function makeRig({ choreo = false } = {}) {
  const budgets = [];
  const trace = { emit(row) { budgets.push({ tick: row.tick, ...row.context }); } };
  const config = choreo
    ? { squadFrames: { planFor: () => ({ slot: { ...SLOT }, slotVel: { x: 0, z: 0 }, bound: BOUND, speedFraction: 0.8, reason: 'stub' }) } }
    : { squadFrames: false };
  const planner = new ManeuverPlanner({ seed: SEED, trace, config });
  const maneuver = { kind: ManeuverKind.FORMATION, formationSlot: { ...SLOT }, formationBound: BOUND, breakFormation: false,
    formationVelocity: { x: 0, z: 0 }, reason: 'hold_the_line' };
  const directive = { squadId: 'wing-b043', tactic: 'screen', formation: { kind: 'line', slot: { ...SLOT }, bound: BOUND, breakFormation: false } };
  const log = [];
  return {
    planner, budgets, log,
    plan(tick, { pos, vel = { x: 0, z: 0 }, tumbling = false, entityId = 11 }) {
      const perception = {
        tick,
        self: { id: entityId, team: 1, pos: { ...pos }, vel: { ...vel }, rot: 0, radius: 10, energyFraction: 1,
          heatFraction: 0, tumbling, combatDoctrineId: 'interceptor_flyby' },
        contacts: [],
      };
      const request = planner.plan({ entityId, tick, perception, behavior: { maneuver }, directive });
      const row = { tick, request, budget: budgets.filter((b) => b.tick === tick).pop() };
      log.push(row);
      return row;
    },
  };
}

// A member that has settled on its slot, then is shoved out along +x at 120 WU/s and stays out.
function shoveAndCoast(rig, { ticks, outAt = 130 }) {
  let tick = 1;
  rig.plan(tick, { pos: { x: 4, z: 0 } });
  tick += STEP;
  rig.plan(tick, { pos: { x: 4, z: 0 } });
  tick += STEP;
  const kick = rig.plan(tick, { pos: { x: outAt, z: 0 }, vel: { x: 120, z: 0 } });
  const rows = [kick];
  for (let i = 0; i < ticks / STEP; i++) {
    tick += STEP;
    rows.push(rig.plan(tick, { pos: { x: outAt, z: 0 }, vel: { x: 6, z: 0 } }));
  }
  return { kickTick: tick - ticks, rows };
}

const reasonOf = (row) => row.request.reason;

test('a kicked member shakes it off first: no formation chase and no boost during RECOVER', () => {
  const rig = makeRig();
  const { rows } = shoveAndCoast(rig, { ticks: 30 });
  const recover = rows.filter((r) => reasonOf(r) === 'formation_recover');
  assert.ok(recover.length >= 10, `the member holds a visible recover beat (${recover.length} plans)`);
  for (const row of recover) {
    assert.equal(row.request.boost, false, 'no boost while shaking it off');
    assert.equal(row.request.brake, true, 'the drift is killed, not extended');
    assert.ok(row.budget.speedBudget <= rig.planner.config.holdSpeed + 1e-9, 'the speed envelope collapses to hold pace');
  }
  assert.notEqual(reasonOf(rows[0]), 'formation_bound_exceeded', 'the old instant rejoin is gone');
});

test('regroup is commanded at patrol pace, not formation or intercept speed, and then finishes', () => {
  const rig = makeRig();
  const { rows } = shoveAndCoast(rig, { ticks: 200 });
  const regroup = rows.filter((r) => reasonOf(r) === 'formation_regroup');
  assert.ok(regroup.length > 20, `the gap stays open for a while (${regroup.length} plans)`);
  const patrol = rig.planner.config.patrolSpeed;
  for (const row of regroup) {
    assert.ok(row.budget.speedBudget <= patrol + 1e-9, `regroup speed budget ${row.budget.speedBudget} stays within the ${patrol} WU/s patrol envelope`);
    assert.equal(row.request.boost, false);
  }
  assert.ok(patrol < rig.planner.config.formationSpeed, 'patrol pace is below the normal formation rejoin cap');
});

test('the member rejoins in finite time when it can, then normal formation resumes', () => {
  const rig = makeRig();
  let tick = 1;
  rig.plan(tick, { pos: { x: 3, z: 0 } });
  tick += STEP;
  rig.plan(tick, { pos: { x: 3, z: 0 } });
  tick += STEP;
  rig.plan(tick, { pos: { x: 140, z: 0 }, vel: { x: 110, z: 0 } });
  const kickTick = tick;
  let x = 140;
  let regrouped = false;
  let rejoinedAt = null;
  while (tick < kickTick + 600 && rejoinedAt == null) {
    tick += STEP;
    // The hull flies back at the capped pace the planner asked for (never faster than 32 WU/s).
    if (tick - kickTick > DISRUPT_RECOVER_PLUS) x = Math.max(60, x - 32 * (STEP / 60));
    const row = rig.plan(tick, { pos: { x, z: 0 }, vel: { x: -20, z: 0 } });
    if (reasonOf(row) === 'formation_regroup') regrouped = true;
    if (regrouped && x <= REJOIN) rejoinedAt = tick;
  }
  assert.ok(regrouped, 'the regroup beat ran');
  assert.ok(rejoinedAt != null && rejoinedAt - kickTick < 480, `it closed inside the hard limit (${rejoinedAt - kickTick} ticks)`);
  tick += STEP;
  const after = rig.plan(tick, { pos: { x: 50, z: 0 }, vel: { x: -5, z: 0 } });
  assert.ok(!['formation_regroup', 'formation_recover', 'formation_broken'].includes(reasonOf(after)),
    'inside the bound the member is an ordinary formation member again');
});
test('a member that cannot close the gap breaks formation after the hard limit', () => {
  const rig = makeRig();
  const { rows, kickTick } = shoveAndCoast(rig, { ticks: 560 });
  const broken = rows.filter((r) => reasonOf(r) === 'formation_broken');
  assert.ok(broken.length > 0, 'the member breaks formation');
  assert.ok(broken[0].tick - kickTick >= 470 && broken[0].tick - kickTick <= 490,
    `at the 8 s hard limit (${broken[0].tick - kickTick} ticks)`);
  assert.ok(!rows.some((r) => r.tick > broken[0].tick && reasonOf(r) === 'formation_bound_exceeded'),
    'a broken member no longer chases its slot');
});

test('a tumble that just ended opens the gap the same way a kick does', () => {
  const rig = makeRig();
  rig.plan(1, { pos: { x: 3, z: 0 } });
  const t1 = rig.plan(3, { pos: { x: 160, z: 0 }, vel: { x: 40, z: 0 }, tumbling: true });
  assert.equal(reasonOf(t1), 'decontrolled_tumble', 'a tumbling self still holds');
  const out = rig.plan(5, { pos: { x: 162, z: 0 }, vel: { x: 40, z: 0 }, tumbling: false });
  assert.equal(reasonOf(out), 'formation_recover', 'the instant the tumble clears the member recovers instead of snapping back');
  assert.equal(out.request.boost, false);
  let tick = 5;
  let regroup = false;
  for (let i = 0; i < 60; i++) {
    tick += STEP;
    if (reasonOf(rig.plan(tick, { pos: { x: 162, z: 0 }, vel: { x: 4, z: 0 } })) === 'formation_regroup') regroup = true;
  }
  assert.ok(regroup, 'then it regroups at patrol pace');
});

test('undisturbed members are unchanged: a slow drift out of the bound still rejoins the old way', () => {
  const rig = makeRig();
  let reasons = new Set();
  let x = 0;
  for (let tick = 1; tick < 400; tick += STEP) {
    x = Math.min(150, x + 0.6);
    reasons.add(reasonOf(rig.plan(tick, { pos: { x, z: 0 }, vel: { x: 18, z: 0 } })));
  }
  for (const reason of reasons) assert.ok(!reason.startsWith('formation_re') && reason !== 'formation_broken', reason);
  assert.ok(reasons.has('formation_bound_exceeded'), 'the unchanged rejoin path is still the one that fires');
  const steady = makeRig();
  const seen = new Set();
  for (let tick = 1; tick < 100; tick += STEP) seen.add(reasonOf(steady.plan(tick, { pos: { x: 6, z: 0 } })));
  assert.deepEqual([...seen], ['hold_the_line']);
});

test('a choreographed member is gated the same way relative to its frame slot', () => {
  const rig = makeRig({ choreo: true });
  const { rows } = shoveAndCoast(rig, { ticks: 120 });
  assert.ok(rows.some((r) => reasonOf(r) === 'formation_recover'), 'recover beat');
  const regroup = rows.filter((r) => reasonOf(r) === 'formation_regroup');
  assert.ok(regroup.length > 10, 'regroup beat');
  for (const row of regroup) {
    assert.ok(row.budget.speedBudget <= rig.planner.config.patrolSpeed + 1e-9, 'choreo regroup also stays at patrol pace');
  }
  const late = makeRig({ choreo: true });
  const { rows: longRows } = shoveAndCoast(late, { ticks: 560 });
  assert.ok(longRows.some((r) => reasonOf(r) === 'formation_broken'), 'and breaks formation after the hard limit');
});

test('the planner never writes a pose or a velocity', () => {
  const rig = makeRig();
  const frozenPos = Object.freeze({ x: 130, z: 0 });
  const frozenVel = Object.freeze({ x: 120, z: 0 });
  rig.plan(1, { pos: { x: 4, z: 0 } });
  const perception = {
    tick: 3,
    self: Object.freeze({ id: 11, team: 1, pos: frozenPos, vel: frozenVel, rot: 0, radius: 10, energyFraction: 1, heatFraction: 0 }),
    contacts: [],
  };
  assert.doesNotThrow(() => rig.planner.plan({
    entityId: 11, tick: 3, perception,
    behavior: { maneuver: { kind: ManeuverKind.FORMATION, formationSlot: { ...SLOT }, formationBound: BOUND, breakFormation: false } },
    directive: { squadId: 'wing-b043', tactic: 'screen', formation: { kind: 'line' } },
  }));
});

test('the same shove sequence plans identically twice', () => {
  const run = () => {
    const rig = makeRig();
    const { rows } = shoveAndCoast(rig, { ticks: 300 });
    return JSON.stringify(rows.map((r) => [r.tick, r.request.reason, r.request.forceLocal, r.request.boost, r.request.brake]));
  };
  assert.equal(run(), run());
});
