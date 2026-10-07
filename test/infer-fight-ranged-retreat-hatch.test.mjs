// INF-fight: the ranged disengager's panic leg is bounded — a pressed patrol re-commits.
//
// Weakness found by looking (seed 4242, ordinary route): ranged_disengager is the majority
// patrol doctrine — 10 of the 14 authored faction profiles fly it (src/data/factionDoctrines.js,
// including faction_scn, the starter-station Concord patrol) plus the lancer_sniper archetype.
// It breaks off on the closing interrupt and its only authored exit demanded
// `distance >= 520 && press < 10` — the player must fully ease off. Any sustained closing speed
// pinned the hull in retreat forever: one telegraphed volley, then a kite chase where the enemy
// never turns to fight again. Every sibling egress leg carries a max-tick clock
// (INTERCEPTOR_EXTEND_MAX law, src/ai/combatDoctrine.js); the ranged retreat now has
// RANGED_RETREAT_MAX_TICKS too.
//
// Authored boundary the clock does NOT lift: inside RANGED_PRESS_FLOOR_WU (140 WU) the closing
// interrupt fires regardless of press speed, so a point-blank chase still pins the panic leg —
// that floor is outside the doctrine's legal volley envelope by design (pinned in scenario F).
//
// Pinned here on fixed seed 4242: volley → panic leg under a lazy chase → bounded leg ends →
// fresh telegraphed volley (the fight resumes), while a HARD press (>55 WU/s) or a point-blank
// chase (<140 WU) still keeps the hull running with guns dark — pressing hard remains the real
// counterplay.

import assert from 'node:assert/strict';

import { ContactKind, ManeuverKind, ObjectiveKind } from '../src/ai/contracts.js';
import { ActivityKind, RulesOfEngagement } from '../src/ai/doctrine.js';
import { CombatDoctrineId, CombatDoctrineRuntime } from '../src/ai/combatDoctrine.js';

const SEED = 4242;

function perception(contactsValue, selfOverrides = {}) {
  return {
    self: {
      ...selfOverrides,
      id: selfOverrides.id ?? 2,
      team: 1,
      pos: { x: selfOverrides.x ?? 0, z: selfOverrides.z ?? 0 },
      vel: { x: selfOverrides.vx ?? 0, z: selfOverrides.vz ?? 0 },
      rot: 0,
      combatDoctrineId: selfOverrides.combatDoctrineId || null,
      activity: {
        kind: selfOverrides.activity || ActivityKind.ATTACK_RUN,
        reason: 'combat_doctrine_test',
        anchor: { x: 0, z: 0 },
        leashRadius: 2600,
        preferredRange: 180,
        startedTick: 0,
      },
      roe: selfOverrides.roe || RulesOfEngagement.WEAPONS_FREE,
    },
    contacts: contactsValue,
    events: [],
  };
}

function shipContact(id, values = {}) {
  return {
    id,
    kind: ContactKind.SHIP,
    alive: values.alive ?? true,
    valid: values.valid ?? true,
    visible: values.visible ?? true,
    ageTicks: values.ageTicks ?? 0,
    hostile: values.hostile ?? true,
    confidence: values.confidence ?? 1,
    threat: values.threat ?? 0.7,
    pos: { x: values.x ?? 400, z: values.z ?? 0 },
    vel: { x: values.vx ?? 0, z: values.vz ?? 0 },
    tethered: values.tethered ?? false,
    operationalMassBand: values.operationalMassBand || 'medium',
    mobilityBand: values.mobilityBand || 'medium',
    cargoBand: values.cargoBand || 'empty',
    tetherabilityBand: values.tetherabilityBand || 'good',
    tags: values.tags || [],
  };
}

const directive = Object.freeze({
  tick: 0,
  squadId: 'fixture',
  memberId: 2,
  role: 'striker',
  tactic: 'standoff_focus',
  focusTargetId: 1,
  objective: Object.freeze({ kind: ObjectiveKind.FOCUS, targetId: 1, reason: 'fixture' }),
  formation: Object.freeze({
    kind: 'wedge', slot: Object.freeze({ x: 0, z: 0 }), velocity: Object.freeze({ x: 0, z: 0 }),
    bound: 170, breakFormation: false, breakReason: null,
  }),
});

const update = (runtime, tick, frame) => runtime.update({
  tick, entityId: 'sniper', doctrineId: CombatDoctrineId.RANGED_DISENGAGER,
  perception: frame(), directive,
});

// Contact helpers: hold at standoff (no press), lazy chase (press 30), hard press (press 90).
const standoff = () => perception([shipContact(1, { x: 620, mobilityBand: 'low', threat: 0.95 })]);
const lazyChase = () => perception([shipContact(1, { x: 400, vx: -30, mobilityBand: 'low', threat: 0.95 })]);
const hardChase = () => perception([shipContact(1, { x: 400, vx: -90, mobilityBand: 'low', threat: 0.95 })]);
const pointBlank = () => perception([shipContact(1, { x: 120, mobilityBand: 'low', threat: 0.95 })]);
const chargeIn = () => perception([shipContact(1, { x: 180, vx: -90, mobilityBand: 'low', threat: 0.95 })]);

{
  const runtime = new CombatDoctrineRuntime({ seed: SEED });

  // A — bait one full telegraphed volley at standoff.
  let result = update(runtime, 0, standoff);
  assert.equal(result.phase, 'outer_standoff');
  result = update(runtime, 45, standoff);
  assert.equal(result.phase, 'charge_cue');
  assert.equal(result.telegraphStarted, true, 'the opening volley is telegraphed');
  result = update(runtime, 75, standoff);
  assert.equal(result.phase, 'fire_window');
  assert.equal(result.fireWindow, true);
  result = update(runtime, 93, standoff);
  assert.equal(result.phase, 'reset', 'post-shot dwell before the next cycle');
  result = update(runtime, 111, standoff);
  assert.equal(result.phase, 'outer_standoff', 'the cycle re-arms at standoff');

  // B — a hard charge trips the closing interrupt: the panic leg, guns dark.
  result = update(runtime, 112, chargeIn);
  assert.equal(result.phase, 'retreat');
  assert.equal(result.fireWindow, false, 'the break closes the guns');
  assert.equal(result.maneuverKind, ManeuverKind.RETREAT);

  // C — the kite: a lazy chase (press 30, 400 WU) can never satisfy the old
  // `distance >= 520 && press < 10` exit. The leg must still be bounded.
  for (let tick = 113; tick <= 291; tick++) {
    result = update(runtime, tick, lazyChase);
  }
  assert.equal(result.phase, 'retreat', 'one tick before the clock the hull is still breaking off');
  result = update(runtime, 292, lazyChase);
  assert.equal(result.phase, 'outer_standoff', 'RANGED_RETREAT_MAX_TICKS re-arms the cycle');
  assert.equal(result.maneuverKind, ManeuverKind.ORBIT, 'the re-armed hull resumes its standoff ring');

  // D — the re-commit is a real, telegraphed beat: the fight resumes, not a silent reset.
  result = update(runtime, 337, lazyChase);
  assert.equal(result.phase, 'charge_cue');
  assert.equal(result.telegraphStarted, true, 'the re-armed volley announces itself');
  result = update(runtime, 367, lazyChase);
  assert.equal(result.phase, 'fire_window');
  assert.equal(result.fireWindow, true, 'the pressed patrol answers a lazy chase with a volley');
  assert.equal(result.allowedActionId, 'action_burst');
}

{
  // E — hard press stays the counterplay, by preemption rather than by the clock: the closing
  // interrupt's early return (distance < 140 || press > 55) exits before the retreat branch is
  // ever reached, so under a CONSTANT press 90 the hatch never fires and the hull simply stays
  // in the panic leg — zero transitions, guns dark. The clock only matters for presses the
  // interrupt tolerates (press <= 55 at range >= 140); because it keeps growing through the
  // leg, the re-arm lands the moment a hard press eases (pinned in scenario G).
  const runtime = new CombatDoctrineRuntime({ seed: SEED });
  update(runtime, 0, standoff);
  update(runtime, 45, standoff);
  update(runtime, 75, standoff);
  update(runtime, 93, standoff);
  update(runtime, 111, standoff);
  let result = update(runtime, 112, chargeIn);
  assert.equal(result.phase, 'retreat');
  for (let tick = 113; tick <= 712; tick++) {
    result = update(runtime, tick, hardChase);
    assert.ok(result.phase === 'retreat' || result.phase === 'outer_standoff',
      `hard press must deny the re-commit; got ${result.phase} at tick ${tick}`);
    assert.equal(result.fireWindow, false, 'no volley while the press is hard');
    assert.equal(result.telegraph, null, 'no telegraph while the press is hard');
  }
}

{
  // F — the authored panic floor the clock does not lift: distance < RANGED_PRESS_FLOOR_WU
  // (140) trips the closing interrupt regardless of press speed, so a point-blank chase with
  // ZERO closing speed still pins the panic leg. Outside the volley envelope by design.
  const runtime = new CombatDoctrineRuntime({ seed: SEED });
  update(runtime, 0, standoff);
  update(runtime, 45, standoff);
  update(runtime, 75, standoff);
  update(runtime, 93, standoff);
  update(runtime, 111, standoff);
  let result = update(runtime, 112, chargeIn);
  assert.equal(result.phase, 'retreat');
  for (let tick = 113; tick <= 512; tick++) {
    result = update(runtime, tick, pointBlank);
    assert.ok(result.phase === 'retreat' || result.phase === 'outer_standoff',
      `point-blank chase must keep the panic leg pinned; got ${result.phase} at tick ${tick}`);
    assert.equal(result.fireWindow, false, 'no volley from inside the panic floor');
    assert.equal(result.telegraph, null, 'no telegraph from inside the panic floor');
  }
}

{
  // G — the re-arm releases a stale egress point: a disabled-target break (a destroyTarget:false
  // profile spared its prey) pins this leg via beginEgress with a flightPoint 960 WU out. When
  // the spared hull repairs, the interrupt tolerates the frame and the grown clock re-arms the
  // cycle at once — and the stale point must be released, because a set flightPoint outranks
  // every maneuver in the planner (src/ai/maneuver.js desiredForIntent): without the release
  // the re-committed volley steers for the stale point mid-telegraph.
  const runtime = new CombatDoctrineRuntime({ seed: SEED });
  const updateDisabled = (tick) => runtime.update({
    tick, entityId: 'sniper', doctrineId: CombatDoctrineId.RANGED_DISENGAGER,
    perception: standoff(), directive, disabledNonlethalTargetId: 1,
  });
  let result = updateDisabled(0);
  assert.equal(result.phase, 'retreat', 'a disabled-target break pins the panic leg');
  assert.ok(result.flightPoint != null && Number.isFinite(result.flightPoint.x),
    'the pin carries a 960-WU egress flightPoint');
  for (let tick = 1; tick <= 312; tick++) updateDisabled(tick);
  // The spared hull repairs: press 30 at 400 WU is tolerated, and the clock grown through the
  // disable re-arms the cycle on the first post-repair tick.
  result = update(runtime, 313, lazyChase);
  assert.equal(result.phase, 'outer_standoff', 'the hatch re-arms the cycle after repair');
  assert.equal(result.flightPoint, null, 'the stale egress point is released at the re-arm');
  result = update(runtime, 358, lazyChase);
  assert.equal(result.phase, 'charge_cue');
  assert.equal(result.telegraphStarted, true, 'the re-committed volley announces itself');
  assert.equal(result.flightPoint, null, 'the telegraph steers on its own maneuver');
  result = update(runtime, 388, lazyChase);
  assert.equal(result.phase, 'fire_window');
  assert.equal(result.allowedActionId, 'action_burst');
  assert.equal(result.flightPoint, null, 'the volley flies on its own maneuver');
}
