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

function perception(selfOverrides = {}) {
  return {
    self: {
      id: 2,
      team: 1,
      pos: { x: 0, z: 0 },
      vel: { x: 0, z: 0 },
      rot: 0,
      combatDoctrineId: CombatDoctrineId.BRAWLER_COMMIT,
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
    contacts: [shipContact(1)],
    events: [],
  };
}

const directive = {};

{
  const runtime = new CombatDoctrineRuntime({ seed: 47 });
  runtime.update({ tick: 0, entityId: 'a', doctrineId: CombatDoctrineId.BRAWLER_COMMIT, perception: perception(), directive });
  const healthy = runtime.update({
    tick: 120, entityId: 'a', doctrineId: CombatDoctrineId.BRAWLER_COMMIT, perception: perception(), directive,
  });
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
  // An approach leg never breaks: pressureBreakDue requires a live fire window, so the opening
  // pass always completes before the break decision can even be considered.
  const runtime2 = new CombatDoctrineRuntime({ seed: 47 });
  runtime2.update({ tick: 0, entityId: 'b2', doctrineId: CombatDoctrineId.BRAWLER_COMMIT, perception: perception(), directive });
  const approach = runtime2.update({
    tick: 10, entityId: 'b2', doctrineId: CombatDoctrineId.BRAWLER_COMMIT,
    perception: perception({ hullFraction: 0.4 }), directive,
  });
  assert.notEqual(approach.outcome, 'pressure_break', 'no break before the fire window opens');
}

{
  const runtime = new CombatDoctrineRuntime({ seed: 47 });
  runtime.update({ tick: 0, entityId: 'c', doctrineId: CombatDoctrineId.BRAWLER_COMMIT, perception: perception(), directive });
  const cornered = runtime.update({
    tick: 120, entityId: 'c', doctrineId: CombatDoctrineId.BRAWLER_COMMIT,
    perception: perception({ hullFraction: 0.15 }), directive,
  });
  assert.notEqual(cornered.outcome, 'pressure_break', 'cornered hulls stay owned by the morale/flee layer');
  const opening = runtime.update({
    tick: 10, entityId: 'c', doctrineId: CombatDoctrineId.BRAWLER_COMMIT,
    perception: perception({ hullFraction: 0.4 }), directive,
  });
  assert.notEqual(opening.outcome, 'pressure_break', 'the opening beat always commits before any break');
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
