import test from 'node:test';
import assert from 'node:assert/strict';

import { ContactKind, ManeuverKind } from '../src/ai/contracts.js';
import { ManeuverPlanner } from '../src/ai/maneuver.js';
import { PerceptionMemory } from '../src/ai/perception.js';

test('maneuver contact indexing preserves decisions while reducing repeated contact visits', () => {
  const directive = {
    squadId: 'fixture',
    formation: {
      slot: { x: 0, z: 0 },
      velocity: { x: 0, z: 0 },
      bound: 170,
      breakFormation: true,
    },
  };
  const cases = [
    {
      kind: ManeuverKind.INTERCEPT,
      targetId: 2,
      reason: 'indexed_intercept',
    },
    {
      kind: ManeuverKind.ESCAPE_TETHER,
      targetId: null,
      reason: 'indexed_escape',
    },
    {
      kind: ManeuverKind.RETREAT,
      targetId: null,
      reason: 'indexed_retreat',
    },
  ];

  for (const [caseIndex, maneuver] of cases.entries()) {
    const perception = makePerception();
    const indexed = new ManeuverPlanner({
      seed: 47,
      config: { freezeResults: false, includeTrajectory: false, workCounters: true },
    });
    const legacy = new ManeuverPlanner({
      seed: 47,
      config: { freezeResults: false, includeTrajectory: false, contactIndex: false, workCounters: true },
    });
    for (let tick = 0; tick < 6; tick++) {
      const behavior = { maneuver: { ...maneuver, formationSlot: directive.formation.slot } };
      const expected = legacy.plan({ tick, entityId: `pilot-${caseIndex}`, perception, behavior, directive });
      const actual = indexed.plan({ tick, entityId: `pilot-${caseIndex}`, perception, behavior, directive });
      assert.deepEqual(actual, expected, `${maneuver.kind} must remain behavior-equivalent at tick ${tick}`);
    }

    // Production live snapshots mutate their retained object when a member's sensor batch
    // refreshes. A changed tick/self identity and revision must invalidate the retained index
    // exactly once.
    perception.tick = 6;
    perception.self = { ...perception.self, pos: { x: 4, z: 0 } };
    perception.revision = 2;
    const refreshedBehavior = { maneuver: { ...maneuver, formationSlot: directive.formation.slot } };
    const refreshedExpected = legacy.plan({ tick: 6, entityId: `pilot-${caseIndex}`, perception, behavior: refreshedBehavior, directive });
    const refreshedActual = indexed.plan({ tick: 6, entityId: `pilot-${caseIndex}`, perception, behavior: refreshedBehavior, directive });
    assert.deepEqual(refreshedActual, refreshedExpected, `${maneuver.kind} must remain equivalent after refresh`);

    const indexedWork = indexed.getWorkCounters();
    const legacyWork = legacy.getWorkCounters();
    assert.equal(indexedWork.contactIndexBuilds, 2, `${maneuver.kind} rebuilds only when the snapshot refreshes`);
    assert.ok(indexedWork.indexedContactVisits < legacyWork.legacyContactVisits,
      `${maneuver.kind} visits fewer contacts (${indexedWork.indexedContactVisits} < ${legacyWork.legacyContactVisits})`);
  }
});

test('fresh snapshots rebuild safely across six sensor ticks', () => {
  const directive = makeDirective();
  const indexed = new ManeuverPlanner({
    seed: 47,
    config: { freezeResults: false, includeTrajectory: false, workCounters: true },
  });
  const legacy = new ManeuverPlanner({
    seed: 47,
    config: { freezeResults: false, includeTrajectory: false, contactIndex: false, workCounters: true },
  });
  const behavior = {
    maneuver: {
      kind: ManeuverKind.INTERCEPT,
      targetId: 2,
      formationSlot: directive.formation.slot,
      reason: 'fresh_snapshot_intercept',
    },
  };

  for (let tick = 0; tick < 6; tick++) {
    // This is the frozen PerceptionMemory shape: each observe publishes a new object and
    // contact array, while revision makes the live-snapshot contract explicit as well.
    const perception = makePerception(tick, tick + 1);
    const expected = legacy.plan({ tick, entityId: 'fresh-pilot', perception, behavior, directive });
    const actual = indexed.plan({ tick, entityId: 'fresh-pilot', perception, behavior, directive });
    assert.deepEqual(actual, expected, `fresh snapshot must remain equivalent at tick ${tick}`);
  }

  const indexedWork = indexed.getWorkCounters();
  const legacyWork = legacy.getWorkCounters();
  assert.equal(indexedWork.contactIndexBuilds, 6, 'each distinct sensor snapshot is indexed once');
  assert.ok(indexedWork.indexedContactVisits < legacyWork.legacyContactVisits,
    `fresh snapshots still avoid repeated lane visits (${indexedWork.indexedContactVisits} < ${legacyWork.legacyContactVisits})`);
});

test('snapshot revision invalidates a retained index after same-array replacement and reclassification', () => {
  const perception = makePerception(0, 1);
  const directive = makeDirective();
  const behavior = {
    maneuver: {
      kind: ManeuverKind.INTERCEPT,
      targetId: 2,
      formationSlot: directive.formation.slot,
      reason: 'in_place_reclassification',
    },
  };
  const indexed = new ManeuverPlanner({
    seed: 47,
    config: { freezeResults: false, includeTrajectory: false, workCounters: true },
  });
  const legacy = new ManeuverPlanner({
    seed: 47,
    config: { freezeResults: false, includeTrajectory: false, contactIndex: false, workCounters: true },
  });

  const beforeExpected = legacy.plan({ tick: 0, entityId: 'replacement-pilot', perception, behavior, directive });
  const beforeActual = indexed.plan({ tick: 0, entityId: 'replacement-pilot', perception, behavior, directive });
  assert.deepEqual(beforeActual, beforeExpected, 'initial indexed decision matches the legacy decision');

  // Keep the same perception and contacts array, but replace the entry in place. This changes
  // both category membership and position; a contacts-array identity sentinel alone is stale.
  perception.contacts[0] = {
    ...perception.contacts[0],
    kind: ContactKind.WAYPOINT,
    pos: { x: 18, z: 0 },
    tags: ['solid'],
  };
  perception.revision = 2;

  const afterExpected = legacy.plan({ tick: 1, entityId: 'replacement-pilot', perception, behavior, directive });
  const afterActual = indexed.plan({ tick: 1, entityId: 'replacement-pilot', perception, behavior, directive });
  assert.deepEqual(afterActual, afterExpected,
    'revision invalidation must reclassify the in-place contact before collision/obstacle lanes');
  assert.notDeepEqual(afterActual.forceLocal, beforeActual.forceLocal,
    'the changed category and position must affect the resulting avoidance request');
  assert.equal(indexed.getWorkCounters().contactIndexBuilds, 2,
    'same-array mutation causes one explicit revision rebuild, not per-lane rescans');
});

test('live perception snapshots advance their revision for every accepted sensor batch', () => {
  const memory = new PerceptionMemory({ freezeResults: false });
  const frame = {
    self: {
      id: 'revision-pilot',
      team: 1,
      pos: { x: 0, z: 0 },
      vel: { x: 0, z: 0 },
      rot: 0,
    },
    contacts: [],
    events: [],
  };
  const first = memory.observe('revision-pilot', frame, 0);
  const firstRevision = first.revision;
  const second = memory.observe('revision-pilot', frame, 0);
  assert.equal(second, first, 'live perception retains one snapshot object');
  assert.equal(firstRevision, 1, 'the first accepted batch starts at revision one');
  assert.equal(second.revision, firstRevision + 1,
    'same-tick batches still invalidate indexes through the producer-owned revision');
});

function makeDirective() {
  return {
    squadId: 'fixture',
    formation: {
      slot: { x: 0, z: 0 },
      velocity: { x: 0, z: 0 },
      bound: 170,
      breakFormation: true,
    },
  };
}

function makePerception(tick = 0, revision = 1) {
  return {
    tick,
    revision,
    self: {
      id: 1,
      team: 1,
      pos: { x: 0, z: 0 },
      vel: { x: 0, z: 0 },
      rot: 0,
      radius: 18,
      energyFraction: 1,
      heatFraction: 0,
      operationalMassBand: 'medium',
      activity: { kind: 'attack_run', reason: 'fixture' },
    },
    contacts: [
      {
        id: 2,
        kind: ContactKind.SHIP,
        team: 2,
        alive: true,
        radius: 24,
        pos: { x: 92, z: 0 },
        vel: { x: 0, z: 0 },
        threat: 0.8,
        confidence: 1,
        operationalMassBand: 'medium',
        tags: [],
      },
      {
        id: 3,
        kind: ContactKind.SHIP,
        team: 1,
        alive: true,
        radius: 16,
        pos: { x: 12, z: 8 },
        vel: { x: 0, z: 0 },
        threat: 0.1,
        confidence: 1,
        operationalMassBand: 'light',
        tags: [],
      },
      {
        id: 4,
        kind: ContactKind.HAZARD,
        team: null,
        alive: true,
        radius: 20,
        pos: { x: 50, z: 0 },
        tags: [],
      },
      {
        id: 5,
        kind: ContactKind.TETHER,
        team: 2,
        alive: true,
        radius: 2,
        pos: { x: 25, z: 10 },
        tags: ['massline'],
      },
      {
        id: 6,
        kind: ContactKind.WAYPOINT,
        team: null,
        alive: true,
        radius: 4,
        pos: { x: -30, z: -20 },
        tags: ['solid'],
      },
    ],
    events: [],
  };
}
