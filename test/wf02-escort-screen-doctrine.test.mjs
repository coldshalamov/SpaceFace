// WF-02 — the escort_screen doctrine: a warden rates hostiles by how hard they press its WARD,
// holds a point on the ward→threat line, and darts only when the threat actually breaches. Also
// pins the full registration chain: contracts view, faction behavior, fire phases, objective
// mapping, the live enemy def, and the ordinary-route spawn pool.
import assert from 'node:assert/strict';
import test from 'node:test';

import { ContactKind, ManeuverKind, ObjectiveKind } from '../src/ai/contracts.js';
import { ActivityKind, RulesOfEngagement, canFireByDoctrine } from '../src/ai/doctrine.js';
import {
  CombatDoctrineId,
  CombatDoctrineRuntime,
  overrideDirectiveForCombatDoctrine,
} from '../src/ai/combatDoctrine.js';
import { ENEMY_TYPES } from '../src/data/enemies.js';
import { SECTOR_ZONES } from '../src/data/sectorZones.js';

const SEED = 4702;
const ESCORT = CombatDoctrineId.ESCORT_SCREEN;

function contact(id, values = {}) {
  return {
    id,
    kind: ContactKind.SHIP,
    alive: true,
    valid: true,
    visible: true,
    ageTicks: 0,
    hostile: values.hostile !== false,
    confidence: 1,
    threat: values.threat ?? 0.8,
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

function perception(selfPos, contacts, activityKind = ActivityKind.SCREEN) {
  return {
    self: {
      id: 2,
      team: 1,
      pos: selfPos,
      vel: { x: 0, z: 0 },
      rot: 0,
      activity: {
        kind: activityKind,
        reason: 'wf02_escort_fixture',
        anchor: { x: 0, z: 0 },
        leashRadius: 2600,
        preferredRange: 150,
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
    squadId: 'wf02_escort_fixture',
    memberId: 2,
    role: 'warden',
    tactic: 'screen_focus',
    focusTargetId: 1,
    objective: Object.freeze({ kind: ObjectiveKind.SCREEN, targetId: 1, reason: 'fixture' }),
    formation: Object.freeze({
      kind: 'line',
      slot: Object.freeze({ x: 0, z: 0 }),
      velocity: Object.freeze({ x: 0, z: 0 }),
      bound: 170,
      breakFormation: false,
      breakReason: null,
    }),
  });
}

// The warden (id 2) at origin; its ward (id 9, friendly) parked at +200; the pressing threat
// (id 1) approaching the ward; a richer, higher-threat hostile loitering far away.
function escortPerception(threatX, farX = 1500) {
  return perception(
    { x: 0, z: 0 },
    [
      contact(1, { x: threatX, vx: -60, threat: 0.5 }),
      contact(7, { x: farX, threat: 0.95 }),
      contact(9, { x: 200, hostile: false, threat: 0.1 }),
    ],
  );
}

test('the escort prefers the hostile pressing its ward over a richer hostile far from it', () => {
  const runtime = new CombatDoctrineRuntime({ seed: SEED });
  const snap = runtime.update({
    tick: 0,
    entityId: 2,
    doctrineId: ESCORT,
    perception: escortPerception(320),
    directive: directive(),
  });
  assert.ok(snap, 'escort doctrine produces a record');
  assert.equal(snap.targetId, 1, 'the ward-pressing threat outranks the far high-threat hostile');
});

test('without a ward the escort fails closed to ordinary threat targeting', () => {
  const runtime = new CombatDoctrineRuntime({ seed: SEED });
  const snap = runtime.update({
    tick: 0,
    entityId: 2,
    doctrineId: ESCORT,
    perception: perception(
      { x: 0, z: 0 },
      [
        contact(1, { x: 400, threat: 0.4 }),
        contact(7, { x: 500, threat: 0.95 }),
      ],
    ),
    directive: directive(),
  });
  assert.equal(snap.targetId, 7, 'no ward: the highest threat wins, nothing crashes');
});

test('the screen machine deploys, holds with live guns, and darts on a ward breach', () => {
  const runtime = new CombatDoctrineRuntime({ seed: SEED });
  let phaseTrace = [];
  let holdSeen = false;
  let dartSeen = false;
  let holdSnapshot = null;
  for (let tick = 0; tick <= 260; tick++) {
    // Threat drives straight at the ward: breach condition becomes true mid-hold.
    const threatX = Math.max(320 - tick * 0.4, 200);
    const snap = runtime.update({
      tick,
      entityId: 2,
      doctrineId: ESCORT,
      perception: escortPerception(threatX),
      directive: directive(),
    });
    if (snap.phase !== phaseTrace[phaseTrace.length - 1]) phaseTrace.push(snap.phase);
    if (snap.phase === 'screen_hold') {
      holdSeen = true;
      holdSnapshot = snap;
    }
    if (snap.phase === 'shield_dart') dartSeen = true;
  }
  assert.ok(phaseTrace.includes('screen_approach'), `approach ran (${phaseTrace.join(' → ')})`);
  assert.ok(phaseTrace.includes('screen_deploy'), `deploy telegraph ran (${phaseTrace.join(' → ')})`);
  assert.ok(holdSeen, `hold ran (${phaseTrace.join(' → ')})`);
  assert.ok(dartSeen, 'the ward breach triggers the shield dart');
  assert.ok(holdSnapshot, 'hold snapshot captured');
  assert.equal(holdSnapshot.fireWindow, true, 'screen_hold is a live gun window');
  assert.equal(holdSnapshot.allowedActionId, 'action_burst');
});

test('screen_hold fires through the doctrine gate and maps to ENGAGE; approach stays SCREEN', () => {
  const base = {
    activity: ActivityKind.SCREEN,
    roe: RulesOfEngagement.WEAPONS_FREE,
    target: { id: 1, alive: true },
    self: { id: 2 },
  };
  assert.equal(canFireByDoctrine({
    ...base,
    objectiveKind: ObjectiveKind.ENGAGE,
    doctrinePhase: 'screen_hold',
    doctrineId: ESCORT,
  }), true, 'the hold is a real gun window');
  assert.equal(canFireByDoctrine({
    ...base,
    objectiveKind: ObjectiveKind.SCREEN,
    doctrinePhase: 'screen_approach',
    doctrineId: ESCORT,
  }), false, 'the approach leg is area denial, not fire');

  const engaged = overrideDirectiveForCombatDoctrine(directive(), {
    doctrineId: ESCORT,
    phase: 'screen_hold',
    targetId: 1,
    actionTargetId: 1,
  });
  assert.equal(engaged.objective.kind, ObjectiveKind.ENGAGE);
  const screening = overrideDirectiveForCombatDoctrine(directive(), {
    doctrineId: ESCORT,
    phase: 'screen_approach',
    targetId: 1,
    actionTargetId: 1,
  });
  assert.equal(screening.objective.kind, ObjectiveKind.SCREEN);
});

test('the warden ships as a live def and rides the ordinary-route vael spawn pool', () => {
  const def = ENEMY_TYPES.find((row) => row.id === 'warden_escort');
  assert.ok(def, 'warden_escort def exists');
  assert.equal(def.combatDoctrineId, 'escort_screen');
  assert.equal(def.factionId, 'faction_vael');

  const pools = [];
  for (const zones of Object.values(SECTOR_ZONES)) {
    const list = Array.isArray(zones) ? zones : zones.zones || [];
    for (const zone of list) {
      const archetypes = zone && zone.presence && zone.presence.archetypes;
      if (Array.isArray(archetypes) && archetypes.includes('warden_escort')) pools.push(zone.id);
    }
  }
  assert.ok(pools.length > 0, `warden_escort reachable from zones: ${pools.join(', ')}`);
});
