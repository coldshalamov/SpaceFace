// WF-02 pressure break: a hurt or heat-soaked fighter diverts to its authored egress phase instead
// of grinding one continuous attack_run, and the posture layer reclassifies the live activity as
// reposition for the duration of the break. Cornered hulls and healthy hulls never break.
import assert from 'node:assert/strict';

import { ContactKind, ManeuverKind } from '../src/ai/contracts.js';
import { ActivityKind, RulesOfEngagement } from '../src/ai/doctrine.js';
import { CombatDoctrineId, CombatDoctrineRuntime } from '../src/ai/combatDoctrine.js';
import { applyEngagementPosture } from '../src/systems/tacticalAI.js';

function shipContact(id, values = {}) {
  return {
    id,
    kind: ContactKind.SHIP,
    alive: true,
    valid: true,
    visible: true,
    ageTicks: 0,
    hostile: true,
    confidence: 1,
    threat: 0.7,
    pos: { x: values.x ?? 400, z: values.z ?? 0 },
    vel: { x: 0, z: 0 },
    tethered: false,
    operationalMassBand: 'medium',
    mobilityBand: 'medium',
    cargoBand: 'empty',
    tetherabilityBand: 'good',
    tags: [],
  };
}

function perception(selfOverrides = {}, contactValues = {}) {
  return {
    self: {
      id: 2,
      team: 1,
      pos: { x: 0, z: 0 },
      vel: { x: 0, z: 0 },
      rot: 0,
      combatDoctrineId: selfOverrides.combatDoctrineId ?? CombatDoctrineId.BRAWLER_COMMIT,
      operationalMassBand: selfOverrides.operationalMassBand ?? 'medium',
      hullFraction: selfOverrides.hullFraction ?? 1,
      heatFraction: selfOverrides.heatFraction ?? 0,
      activity: {
        kind: ActivityKind.ATTACK_RUN,
        reason: 'combat_doctrine_test',
        anchor: { x: 0, z: 0 },
        leashRadius: 2600,
        preferredRange: 180,
        startedTick: 0,
      },
      roe: RulesOfEngagement.WEAPONS_FREE,
    },
    contacts: [shipContact(1, contactValues)],
    events: [],
  };
}

const directive = {};

{
  const runtime = new CombatDoctrineRuntime({ seed: 47 });
  runtime.update({ tick: 0, entityId: 'a', doctrineId: CombatDoctrineId.BRAWLER_COMMIT, perception: perception(), directive });
  runtime.update({ tick: 30, entityId: 'a', doctrineId: CombatDoctrineId.BRAWLER_COMMIT, perception: perception(), directive });
  const healthy = runtime.update({
    tick: 120, entityId: 'a', doctrineId: CombatDoctrineId.BRAWLER_COMMIT, perception: perception(), directive,
  });
  // Asserted INSIDE the live commit fire window (entered at tick 30, age 90) so the hull gate
  // itself is what is being tested — not the fire-window or min-phase gates ahead of it.
  assert.equal(healthy.phase, 'commit', 'setup: the healthy check runs inside the live grind');
  assert.notEqual(healthy.outcome, 'pressure_break', 'a healthy fighter does not break off');
}

{
  const runtime = new CombatDoctrineRuntime({ seed: 47 });
  runtime.update({ tick: 0, entityId: 'b', doctrineId: CombatDoctrineId.BRAWLER_COMMIT, perception: perception(), directive });
  runtime.update({ tick: 30, entityId: 'b', doctrineId: CombatDoctrineId.BRAWLER_COMMIT, perception: perception(), directive });
  const hurt = runtime.update({
    tick: 120, entityId: 'b', doctrineId: CombatDoctrineId.BRAWLER_COMMIT,
    perception: perception({ hullFraction: 0.4 }), directive,
  });
  assert.equal(hurt.outcome, 'pressure_break', 'a hurt fighter breaks off mid-grind, from its live commit fire window');
  assert.equal(hurt.phase, 'breakaway', 'the brawler breaks away, not into the morale death spiral');
  // An approach leg never breaks: pressureBreakDue requires a live fire window, so the re-press
  // always completes before the break decision can even be considered. The target sits beyond
  // the 460wu engine_flare trigger and the phase has outlived PRESSURE_MIN_PHASE_TICKS, so ONLY
  // the fire-window gate stands between this hull and a break.
  const runtime2 = new CombatDoctrineRuntime({ seed: 47 });
  runtime2.update({ tick: 0, entityId: 'b2', doctrineId: CombatDoctrineId.BRAWLER_COMMIT, perception: perception({}, { x: 700 }), directive });
  const approach = runtime2.update({
    tick: 60, entityId: 'b2', doctrineId: CombatDoctrineId.BRAWLER_COMMIT,
    perception: perception({ hullFraction: 0.4 }, { x: 700 }), directive,
  });
  assert.equal(approach.phase, 'ingress', 'setup: still on the approach leg at age 60');
  assert.notEqual(approach.outcome, 'pressure_break', 'no break before the fire window opens');
}

{
  const runtime = new CombatDoctrineRuntime({ seed: 47 });
  runtime.update({ tick: 0, entityId: 'c', doctrineId: CombatDoctrineId.BRAWLER_COMMIT, perception: perception(), directive });
  runtime.update({ tick: 30, entityId: 'c', doctrineId: CombatDoctrineId.BRAWLER_COMMIT, perception: perception(), directive });
  const cornered = runtime.update({
    tick: 120, entityId: 'c', doctrineId: CombatDoctrineId.BRAWLER_COMMIT,
    perception: perception({ hullFraction: 0.15 }), directive,
  });
  // Asserted INSIDE the live commit fire window at age 90 (past PRESSURE_MIN_PHASE_TICKS), so the
  // cornered gate is the only thing refusing the break — delete it and this fails.
  assert.equal(cornered.phase, 'commit', 'setup: the cornered check runs inside the live grind');
  assert.notEqual(cornered.outcome, 'pressure_break', 'cornered hulls stay owned by the morale/flee layer');
}

{
  const runtime = new CombatDoctrineRuntime({ seed: 47 });
  runtime.update({ tick: 0, entityId: 'esc', doctrineId: CombatDoctrineId.ESCORT_SCREEN, perception: perception(), directive });
  runtime.update({ tick: 60, entityId: 'esc', doctrineId: CombatDoctrineId.ESCORT_SCREEN, perception: perception(), directive });
  runtime.update({ tick: 90, entityId: 'esc', doctrineId: CombatDoctrineId.ESCORT_SCREEN, perception: perception(), directive });
  const hurt = runtime.update({
    tick: 150, entityId: 'esc', doctrineId: CombatDoctrineId.ESCORT_SCREEN,
    perception: perception({ hullFraction: 0.4 }), directive,
  });
  assert.equal(hurt.outcome, 'pressure_break', 'a hurt escort breaks off from its live screen_hold fire window');
  assert.equal(hurt.phase, 'regroup');
  // The regroup lull must be owned by the escort's own phase machine: after ESCORT_REGROUP_TICKS
  // (45) the escort transitions regroup → reform and re-commits, never circling in regroup forever.
  const lull = runtime.update({
    tick: 200, entityId: 'esc', doctrineId: CombatDoctrineId.ESCORT_SCREEN,
    perception: perception({ hullFraction: 0.4 }), directive,
  });
  assert.notEqual(lull.outcome, 'pressure_break', 'the regroup lull never re-triggers the break');
  assert.notEqual(lull.phase, 'regroup', 'the escort re-commits through its own phase machine, never circling in regroup');
}

{
  // Capital regression (d5fc57e1): the break lands on the authored broadside_shift beat, and the
  // shift exit releases the egress flightPoint and re-commits — a broken-off capital must never
  // park on a stale steering point in a phase its updater never advances.
  const runtime = new CombatDoctrineRuntime({ seed: 47 });
  const doctrine = CombatDoctrineId.CAPITAL_BROADSIDE;
  const frame = (hullFraction) => perception({ hullFraction, combatDoctrineId: doctrine }, { x: 620 });
  runtime.update({ tick: 0, entityId: 'cap', doctrineId: doctrine, perception: frame(1), directive });
  const fire = runtime.update({ tick: 30, entityId: 'cap', doctrineId: doctrine, perception: frame(1), directive });
  assert.equal(fire.phase, 'broadside_fire', 'setup: capital is in its live salvo window');
  const hurt = runtime.update({ tick: 120, entityId: 'cap', doctrineId: doctrine, perception: frame(0.4), directive });
  assert.equal(hurt.outcome, 'pressure_break', 'a hurt capital breaks off mid-salvo');
  assert.equal(hurt.phase, 'broadside_shift', 'the capital breaks to its authored reposition beat, not a dead retreat');
  const recommit = runtime.update({ tick: 210, entityId: 'cap', doctrineId: doctrine, perception: frame(0.4), directive });
  assert.equal(recommit.phase, 'broadside_charge', 'the shift beat exits on its timer back into the cycle');
  assert.equal(recommit.cycle, 1, 'the capital cycle advanced across the break');
  assert.equal(recommit.flightPoint, null, 'the egress steering point is released on shift exit');
}

{
  // Heavy-mass interceptor regression: flightProfileFor maps heavy/capital interceptor_flyby
  // hulls onto the brawler profile, so the record is advanced by updateBrawler — which has no
  // 'extend' branch. The break must name the PROFILE's egress phase ('breakaway'), or the hull
  // parks in 'extend' forever (e.g. choir cruisers, which fly interceptor_flyby on heavy hulls).
  const runtime = new CombatDoctrineRuntime({ seed: 47 });
  const doctrine = CombatDoctrineId.INTERCEPTOR_FLYBY;
  const frame = (hullFraction, x = 300) => perception({ hullFraction, combatDoctrineId: doctrine, operationalMassBand: 'heavy' }, { x });
  const first = runtime.update({ tick: 0, entityId: 'heavy', doctrineId: doctrine, perception: frame(1), directive });
  assert.equal(first.flightProfile, 'brawler_commit', 'setup: the heavy hull flies the brawler profile');
  runtime.update({ tick: 30, entityId: 'heavy', doctrineId: doctrine, perception: frame(1), directive });
  const hurt = runtime.update({ tick: 120, entityId: 'heavy', doctrineId: doctrine, perception: frame(0.4), directive });
  assert.equal(hurt.outcome, 'pressure_break', 'the hurt heavy interceptor breaks off mid-commit');
  assert.equal(hurt.phase, 'breakaway', 'the break names the profile egress phase its updater actually advances');

  // Pursued-breakaway regression: the target keeps chasing at 500wu (< the 600wu separation
  // gate), so only the max-tick hatch can end the egress. Without it the hull runs from the
  // pursuer forever and never re-commits — the relentless-pursuit failure mode in reverse.
  let reformed = false;
  let brokeAgain = false;
  for (let tick = 121; tick <= 600; tick++) {
    // Pursued at 500wu until the hatch fires; once the hull reforms, the chase closes to 300wu
    // so the approach leg can reach its fire window again.
    const out = runtime.update({ tick, entityId: 'heavy', doctrineId: doctrine, perception: frame(0.4, reformed ? 300 : 500), directive });
    if (out.phase === 'reform') reformed = true;
    if (reformed && out.outcome === 'pressure_break') { brokeAgain = true; break; }
  }
  assert.equal(reformed, true, 'a chased breakaway ends on the max-tick hatch instead of running forever');
  assert.equal(brokeAgain, true, 'after the lull the hull re-presses and can break again');
}

{
  // Ranged dead-band regression: the charge floor must meet the 300wu retreat trigger. Parked at
  // 350wu — too close to fire under the old 420 floor, too far to flee — the disengager orbited
  // in outer_standoff forever.
  const runtime = new CombatDoctrineRuntime({ seed: 47 });
  const doctrine = CombatDoctrineId.RANGED_DISENGAGER;
  const frame = () => perception({ combatDoctrineId: doctrine }, { x: 350 });
  runtime.update({ tick: 0, entityId: 'rng', doctrineId: doctrine, perception: frame(), directive });
  let fired = false;
  for (let tick = 1; tick <= 200; tick++) {
    const out = runtime.update({ tick, entityId: 'rng', doctrineId: doctrine, perception: frame(), directive });
    if (out.phase === 'fire_window') { fired = true; break; }
  }
  assert.equal(fired, true, 'a disengager holding at 350wu still reaches its fire window');
}

{
  const entity = {
    data: {
      ai: {
        passive: false,
        roe: 'weapons_free',
        activity: {
          kind: ActivityKind.ATTACK_RUN,
          reason: 'combat_doctrine_test',
          preferredRange: 180,
          startedTick: 0,
        },
      },
    },
  };
  const state = { tick: 500 };
  applyEngagementPosture(entity, { doctrineId: CombatDoctrineId.BRAWLER_COMMIT, phase: 'breakaway', preferredRange: 320 }, state);
  assert.equal(entity.data.ai.activity.kind, 'reposition', 'the egress break reads as reposition, not attack_run');
  assert.ok(String(entity.data.ai.activity.reason).startsWith('combat_doctrine:'), 'the posture is traceable to its doctrine phase');
  assert.equal(entity.data.ai.postureBaseActivity.kind, ActivityKind.ATTACK_RUN, 'the authored activity is kept for re-commit');

  applyEngagementPosture(entity, null, state);
  assert.equal(entity.data.ai.activity.kind, ActivityKind.ATTACK_RUN, 're-commit hands the authored activity back');
  assert.equal(entity.data.ai.postureBaseActivity, undefined, 'the posture stash is cleared after re-commit');

  // A break in flight plus another writer replacing the activity (non-posture reason) must not
  // clobber the stash: re-commit has to hand back the ORIGINAL authored activity.
  applyEngagementPosture(entity, { doctrineId: CombatDoctrineId.BRAWLER_COMMIT, phase: 'breakaway', preferredRange: 320 }, state);
  const stashed = entity.data.ai.postureBaseActivity;
  entity.data.ai.activity = { kind: 'scan_approach', reason: 'other_writer', preferredRange: 400, startedTick: 500 };
  applyEngagementPosture(entity, { doctrineId: CombatDoctrineId.BRAWLER_COMMIT, phase: 'breakaway', preferredRange: 320 }, state);
  assert.equal(entity.data.ai.postureBaseActivity, stashed, 'an interloping activity never overwrites the stash');
  assert.equal(entity.data.ai.activity.kind, 'scan_approach', 'the interloping activity is left alone');
  applyEngagementPosture(entity, null, state);
  assert.equal(entity.data.ai.postureBaseActivity, undefined, 'the stash still clears on re-commit');
  assert.equal(entity.data.ai.activity.kind, 'scan_approach', 'a foreign activity is not replaced by the stash');

  const fleeing = {
    data: {
      ai: {
        passive: false,
        roe: 'weapons_free',
        activity: { kind: 'flee', reason: 'morale_flee', preferredRange: 0, startedTick: 0 },
      },
    },
  };
  applyEngagementPosture(fleeing, { doctrineId: CombatDoctrineId.BRAWLER_COMMIT, phase: 'breakaway', preferredRange: 320 }, state);
  assert.equal(fleeing.data.ai.activity.kind, 'flee', 'survival orders outrank the posture break');
}
