// WF-02 doctrine divergence — proves the four registered combat doctrine ids produce DISTINCT
// runtime behavior (phases, maneuver kinds, fire outcomes) under byte-identical sensor input,
// and that the field anchor's authored anchor_hold burst window is now real behavior instead of
// a label the runtime discards at the SCREEN-objective and doctrine-fire-phase gates.
import assert from 'node:assert/strict';
import test from 'node:test';

import { ContactKind, ManeuverKind, ObjectiveKind } from '../src/ai/contracts.js';
import {
  ActivityKind,
  RulesOfEngagement,
  canFireByDoctrine,
  normalizeActivity,
} from '../src/ai/doctrine.js';
import {
  CombatDoctrineId,
  CombatDoctrineRuntime,
  overrideDirectiveForCombatDoctrine,
} from '../src/ai/combatDoctrine.js';
import { authorizeAIEngagement } from '../src/ai/engagementAuthority.js';
import { applyAIFiringIntent } from '../src/systems/aiFireIntent.js';

const SEED = 4702;
const DOCTRINES = Object.freeze([
  CombatDoctrineId.INTERCEPTOR_FLYBY,
  CombatDoctrineId.TETHER_CONTROL_RAIDER,
  CombatDoctrineId.FIELD_ANCHOR_CONTROLLER,
  CombatDoctrineId.RANGED_DISENGAGER,
]);

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
    threat: 0.8,
    pos: { x: values.x ?? 400, z: values.z ?? 0 },
    vel: { x: values.vx ?? 0, z: values.vz ?? 0 },
    tethered: false,
    disabled: false,
    operationalMassBand: 'medium',
    mobilityBand: 'medium',
    cargoBand: 'valuable',
    tetherabilityBand: 'good',
    tags: [],
  };
}

function perception(contacts, activityKind = ActivityKind.ATTACK_RUN) {
  return {
    self: {
      id: 2,
      team: 1,
      pos: { x: 0, z: 0 },
      vel: { x: 0, z: 0 },
      rot: 0,
      activity: {
        kind: activityKind,
        reason: 'wf02_divergence_fixture',
        anchor: { x: 0, z: 0 },
        leashRadius: 2600,
        preferredRange: 180,
        startedTick: 0,
      },
      roe: RulesOfEngagement.WEAPONS_FREE,
    },
    contacts,
    events: [],
  };
}

function directive() {
  return Object.freeze({
    tick: 0,
    squadId: 'wf02_fixture',
    memberId: 2,
    role: 'striker',
    tactic: 'standoff_focus',
    focusTargetId: 1,
    objective: Object.freeze({ kind: ObjectiveKind.FOCUS, targetId: 1, reason: 'fixture' }),
    formation: Object.freeze({
      kind: 'wedge',
      slot: Object.freeze({ x: 0, z: 0 }),
      velocity: Object.freeze({ x: 0, z: 0 }),
      bound: 170,
      breakFormation: false,
      breakReason: null,
    }),
  });
}

/** Run one doctrine over a scripted target trajectory; identical frames per tick across runs. */
function runScenario(doctrineId, trajectory, ticks) {
  const runtime = new CombatDoctrineRuntime({ seed: SEED });
  const trace = [];
  for (let tick = 0; tick < ticks; tick++) {
    const { x, vx } = trajectory(tick);
    const snapshot = runtime.update({
      tick,
      entityId: 2,
      doctrineId,
      perception: perception([shipContact(1, { x, vx })]),
      directive: directive(),
    });
    trace.push(snapshot);
  }
  return trace;
}

function transitions(trace) {
  const out = [];
  let last = null;
  for (const row of trace) {
    const key = row
      ? `${row.phase}|${row.maneuverKind}|${row.fireWindow ? 1 : 0}|${row.allowedActionId || ''}`
      : 'null';
    if (key !== last) {
      out.push(key);
      last = key;
    }
  }
  return out;
}

function fireWindows(trace) {
  const windows = [];
  let start = null;
  for (let i = 0; i < trace.length; i++) {
    const firing = !!(trace[i] && trace[i].fireWindow);
    if (firing && start == null) start = i;
    if (!firing && start != null) {
      windows.push({ start, length: i - start });
      start = null;
    }
  }
  if (start != null) windows.push({ start, length: trace.length - start });
  return windows;
}

// Scenario A — standoff: target drifts in from 640 wu and parks at 460 wu (closing 36 wu/s).
const STANDOFF_TICKS = 620;
const standoff = (tick) => (tick <= 300
  ? { x: 640 - 0.6 * tick, vx: -36 }
  : { x: 460, vx: 0 });

// Scenario B — pressure: target charges straight in at 120 wu/s from 640 wu.
const PRESSURE_TICKS = 300;
const pressure = (tick) => ({ x: 640 - 2 * tick, vx: -120 });

test('all four doctrine ids produce pairwise-distinct phase/maneuver/fire signatures from identical frames', () => {
  const signatures = new Map();
  for (const doctrineId of DOCTRINES) {
    signatures.set(doctrineId, transitions(runScenario(doctrineId, standoff, STANDOFF_TICKS)));
  }
  for (let a = 0; a < DOCTRINES.length; a++) {
    for (let b = a + 1; b < DOCTRINES.length; b++) {
      assert.notDeepEqual(signatures.get(DOCTRINES[a]), signatures.get(DOCTRINES[b]),
        `${DOCTRINES[a]} and ${DOCTRINES[b]} resolved to the same behavior signature`);
    }
  }
});

test('standoff fire discipline diverges: anchor holds one sustained window, ranged volleys in short cycles', () => {
  const anchor = runScenario(CombatDoctrineId.FIELD_ANCHOR_CONTROLLER, standoff, STANDOFF_TICKS);
  const ranged = runScenario(CombatDoctrineId.RANGED_DISENGAGER, standoff, STANDOFF_TICKS);
  const interceptor = runScenario(CombatDoctrineId.INTERCEPTOR_FLYBY, standoff, STANDOFF_TICKS);
  const raider = runScenario(CombatDoctrineId.TETHER_CONTROL_RAIDER, standoff, STANDOFF_TICKS);

  const anchorWindows = fireWindows(anchor);
  assert.equal(anchorWindows.length, 1, 'anchor commits to exactly one sustained hold window');
  assert.ok(anchorWindows[0].length >= 120, `anchor hold window is sustained, got ${anchorWindows[0].length} ticks`);
  const anchorHold = anchor[anchorWindows[0].start];
  assert.equal(anchorHold.phase, 'anchor_hold');
  assert.equal(anchorHold.maneuverKind, ManeuverKind.HOLD);
  assert.equal(anchorHold.allowedActionId, 'action_burst', 'anchor hold advertises the canonical burst verb');
  assert.equal(anchorHold.faceTarget, true, 'anchor keeps its fixed guns aligned while holding');
  assert.equal(anchorHold.preferredRange, 460, 'anchor engages from its authored 460 wu hold ring');

  const rangedWindows = fireWindows(ranged);
  assert.ok(rangedWindows.length >= 3, `ranged produces repeated volley windows, got ${rangedWindows.length}`);
  for (const window of rangedWindows) {
    assert.ok(window.length <= 19, `ranged volleys stay short, got ${window.length} ticks`);
  }
  for (let i = 1; i < rangedWindows.length; i++) {
    const gap = rangedWindows[i].start - (rangedWindows[i - 1].start + rangedWindows[i - 1].length);
    assert.ok(gap >= 60, `ranged volleys are separated by telegraphed repositioning, got ${gap} ticks`);
  }
  const rangedFire = ranged[rangedWindows[0].start];
  assert.equal(rangedFire.phase, 'fire_window');
  assert.equal(rangedFire.preferredRange, 620, 'ranged engages from its authored 620 wu standoff ring');

  assert.equal(fireWindows(interceptor).length, 0,
    'a 460 wu standoff never enters the interceptor 420 wu strike envelope');
  assert.equal(fireWindows(raider).length, 0, 'the tether raider never opens a weapon window');
});

test('pressure response diverges under identical closing frames: ranged kites while the anchor stands ground', () => {
  const anchor = runScenario(CombatDoctrineId.FIELD_ANCHOR_CONTROLLER, pressure, PRESSURE_TICKS);
  const ranged = runScenario(CombatDoctrineId.RANGED_DISENGAGER, pressure, PRESSURE_TICKS);
  const interceptor = runScenario(CombatDoctrineId.INTERCEPTOR_FLYBY, pressure, PRESSURE_TICKS);
  const raider = runScenario(CombatDoctrineId.TETHER_CONTROL_RAIDER, pressure, PRESSURE_TICKS);

  // Shared tick 100: the target is 440 wu out, closing at 120 wu/s, in every run.
  assert.equal(ranged[100].phase, 'retreat', 'ranged breaks off under closing pressure');
  assert.equal(ranged[100].maneuverKind, ManeuverKind.RETREAT);
  assert.equal(ranged[100].fireWindow, false);
  assert.equal(anchor[100].phase, 'anchor_hold', 'anchor stands its field hold under the same pressure');
  assert.equal(anchor[100].maneuverKind, ManeuverKind.HOLD);
  assert.equal(anchor[100].fireWindow, true);
  assert.equal(interceptor[100].phase, 'ingress', 'interceptor is still committing to its run at 440 wu');
  assert.equal(raider[100].phase, 'flank', 'raider is still flanking toward attach range at 440 wu');

  // The anchor's counterplay stays intact: getting inside 220 wu forces it off its hold.
  const recoverTick = anchor.findIndex((row) => row && row.phase === 'recover');
  assert.ok(recoverTick > 100, 'anchor eventually yields its hold');
  assert.ok(640 - 2 * recoverTick < 220, 'anchor yields only once the target is inside its 220 wu inner band');
  assert.equal(anchor[recoverTick].maneuverKind, ManeuverKind.RETREAT);
});

test('anchor_hold now overrides the squad directive to ENGAGE and passes the doctrine fire gate', () => {
  const anchor = runScenario(CombatDoctrineId.FIELD_ANCHOR_CONTROLLER, standoff, STANDOFF_TICKS);
  const hold = anchor.find((row) => row && row.phase === 'anchor_hold');
  const spool = anchor.find((row) => row && row.phase === 'field_spool');
  assert.ok(hold && spool, 'scenario reaches both telegraph and hold phases');

  const holdDirective = overrideDirectiveForCombatDoctrine(directive(), hold);
  assert.equal(holdDirective.objective.kind, ObjectiveKind.ENGAGE,
    'anchor_hold is an engagement, not a screen, so the fire adapters stop discarding it');
  const spoolDirective = overrideDirectiveForCombatDoctrine(directive(), spool);
  assert.equal(spoolDirective.objective.kind, ObjectiveKind.SCREEN,
    'the telegraph and approach keep reading as area control');

  for (const activityKind of [ActivityKind.ATTACK_RUN, ActivityKind.SCREEN]) {
    const frame = perception([shipContact(1, { x: 460 })], activityKind);
    assert.equal(canFireByDoctrine({
      activity: frame.self.activity,
      roe: frame.self.roe,
      objectiveKind: holdDirective.objective.kind,
      target: { id: 1, alive: true },
      self: frame.self,
    }), true, `anchor_hold fire is legal under the ${activityKind} activity`);
    assert.equal(canFireByDoctrine({
      activity: frame.self.activity,
      roe: frame.self.roe,
      objectiveKind: spoolDirective.objective.kind,
      target: { id: 1, alive: true },
      self: frame.self,
    }), false, `${activityKind}: the field_spool telegraph still cannot fire`);
  }
});

test('the anchor doctrine runs under its authored screen/weapons_free activity combo', () => {
  const runtime = new CombatDoctrineRuntime({ seed: SEED });
  const snapshot = runtime.update({
    tick: 0,
    entityId: 2,
    doctrineId: CombatDoctrineId.FIELD_ANCHOR_CONTROLLER,
    perception: perception([shipContact(1, { x: 600 })], ActivityKind.SCREEN),
    directive: directive(),
  });
  assert.ok(snapshot, 'screen/weapons_free is a consumed combo, not a discarded label');
  assert.equal(snapshot.phase, 'approach');
});

test('the final engagement authority admits exactly one fire phase per doctrine', () => {
  const cases = [
    ['field_anchor_controller', 'anchor_hold', true],
    ['field_anchor_controller', 'field_spool', false],
    ['field_anchor_controller', 'approach', false],
    ['field_anchor_controller', 'recover', false],
    ['ranged_disengager', 'fire_window', true],
    ['ranged_disengager', 'outer_standoff', false],
    ['interceptor_flyby', 'strike', true],
    ['interceptor_flyby', 'extend', false],
    ['tether_control_raider', 'control', false],
    ['tether_control_raider', 'attach_window', false],
  ];
  for (const [doctrineId, phase, expected] of cases) {
    const state = authorityState(doctrineId);
    const result = authorizeAIEngagement({
      state,
      self: state.entities.get(2),
      target: state.entities.get(1),
      tick: state.tick,
      objectiveReason: `combat_doctrine:${doctrineId}:${phase}`,
      hostile: true,
      recentlyDamaged: false,
    });
    assert.equal(result.ok, expected,
      `${doctrineId}:${phase} expected ${expected ? 'authorized' : 'denied'}, got ${result.reason}`);
    if (!expected) assert.equal(result.reason, 'doctrine_fire_window');
  }
});

test('the fire-intent adapter emits live fire for anchor_hold and keeps the telegraph cold', () => {
  for (const [phase, expected] of [['anchor_hold', true], ['field_spool', false]]) {
    const state = authorityState('field_anchor_controller');
    const anchor = state.entities.get(2);
    const snapshot = Object.freeze({
      doctrineId: 'field_anchor_controller',
      phase,
      targetId: 1,
      actionTargetId: 1,
      cycle: 0,
      phaseStartedTick: 120,
      fireWindow: phase === 'anchor_hold',
      maneuverKind: phase === 'anchor_hold' ? ManeuverKind.HOLD : ManeuverKind.HOLD,
      allowedActionId: phase === 'anchor_hold' ? 'action_burst' : null,
    });
    const decision = {
      entityId: 2,
      directive: overrideDirectiveForCombatDoctrine(directive(), snapshot),
      combatDoctrine: snapshot,
      action: { actionId: phase === 'anchor_hold' ? 'action_burst' : null, targetId: 1 },
    };
    applyAIFiringIntent(decision, state);
    assert.equal(anchor.data.intent.fire, expected,
      `${phase} fire intent expected ${expected}`);
  }
});

test('same seed and frames replay byte-identical divergence traces', () => {
  for (const doctrineId of DOCTRINES) {
    assert.deepEqual(
      runScenario(doctrineId, standoff, STANDOFF_TICKS),
      runScenario(doctrineId, standoff, STANDOFF_TICKS),
      `${doctrineId} trace must be deterministic`,
    );
  }
});

function authorityState(doctrineId) {
  const player = {
    id: 1, type: 'ship', alive: true, team: 0,
    pos: { x: 460, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 12,
    data: { ai: {}, intent: {} },
  };
  const actor = {
    id: 2, type: 'ship', alive: true, team: 1,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 18,
    data: {
      ai: {
        passive: false,
        hostileTeams: [0],
        motive: 'area_control_interdiction',
        engagementTrigger: 'player_in_anchor_radius',
        zoneId: 'zone_ceres_anchor_lane',
        approachTelegraph: 'field_spool',
        noFireResponseWindowS: 1,
        combatDoctrineId: doctrineId,
        activity: normalizeActivity({
          kind: ActivityKind.SCREEN,
          reason: 'wf02_authority_fixture',
          anchor: { x: 0, z: 0 },
          leashRadius: 2600,
          startedTick: 100,
        }),
        roe: RulesOfEngagement.WEAPONS_FREE,
      },
      intent: { fire: false },
      combat: {},
      weapons: [{ projSpeed: 400 }],
    },
  };
  const entities = new Map([[1, player], [2, actor]]);
  return {
    tick: 160,
    simTime: 700,
    playerId: 1,
    player: { heat: 0 },
    world: { currentSectorId: 'sector_ceres_belt' },
    entities,
    entityList: [...entities.values()],
    combat: { trace: { events: [] } },
  };
}
