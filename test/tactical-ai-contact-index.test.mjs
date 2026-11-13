import test from 'node:test';
import assert from 'node:assert/strict';

import { ContactKind, ManeuverKind } from '../src/ai/contracts.js';
import { ManeuverPlanner } from '../src/ai/maneuver.js';
import { PerceptionMemory } from '../src/ai/perception.js';
import { createSimulation } from '../src/core/sim.js';
import { aiPorts } from '../src/systems/aiPorts.js';

test('a replacement hull gets its own live sensor pose and tags when an ID recycles within a tick', t => {
  const sim = createSimulation({ seed: 47, systems: [aiPorts], updateOrder: [] });
  t.after(() => sim.dispose());
  const observer = sim.spawn({ type: 'ship', team: 2, pos: { x: 0, z: 0 } });
  const first = sim.spawn({ type: 'ship', team: 1, pos: { x: 120, z: 0 }, factionId: 'faction_free' });
  const find = () => sim.helpers.aiSensors.liveFrameFor(observer.id, sim.state.tick).contacts
    .find(contact => contact.id === first.id);
  assert.equal(find().pos.x, 120);
  assert.ok(find().tags.includes('faction_free'));
  sim.helpers.removeEntity(first.id, { immediate: true });
  const next = sim.spawn({ type: 'ship', team: 2, pos: { x: 265, z: 0 }, factionId: 'faction_scn' });
  assert.equal(next.id, first.id);
  const contact = find();
  assert.equal(contact.pos.x, 265);
  assert.equal(contact.team, 2);
  assert.ok(contact.tags.includes('faction_scn'));
  assert.ok(!contact.tags.includes('faction_free'));
});

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
  // contacts[0] is the maneuver's own intercept target — a contact-seeking intent deliberately
  // ignores its objective in the obstacle lane — so the reclassified contact is a bystander.
  perception.contacts[1] = {
    ...perception.contacts[1],
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

test('live perception still expires unseen contacts when the current key set shrinks', () => {
  const memory = new PerceptionMemory({ freezeResults: false, memoryTicks: 1 });
  const frame = (contacts) => ({
    self: { id: 'expiry-pilot', team: 1, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0 },
    contacts,
    events: [],
  });
  const contact = (id) => ({ id, kind: 'ship', pos: { x: 50, z: 0 }, vel: { x: 0, z: 0 }, confidence: 1 });

  memory.observe('expiry-pilot', frame([contact('stale')]), 0);
  const current = memory.observe('expiry-pilot', frame([contact('current')]), 2);

  assert.deepEqual(current.contacts.map((row) => row.id), ['current'],
    'the skipped cleanup scan must still prune stale rows after a new key replaces an old one');
  assert.deepEqual([...memory.byEntity.get('expiry-pilot').contacts.keys()], ['ship|s:current']);
});

test('live perception keeps duplicate ordering and expires cold contacts across rewound observations', () => {
  const memory = new PerceptionMemory({ freezeResults: false });
  const frame = (contacts) => ({ self: { id: 'pilot' }, contacts, events: [] });
  const contact = (id, x, tags = []) => ({ id, kind: 'hazard', pos: { x, z: 0 }, confidence: 1, tags });
  const cold = contact('cold', 1, ['cold_dressing']);
  const reported = contact('reported', 2);
  const observe = (tick, ...contacts) => memory.observe('pilot', frame(contacts), tick).contacts;

  observe(0, cold, reported);
  const duplicate = observe(1, reported, contact('reported', 3));
  assert.deepEqual(duplicate.map(({ id, pos, firstSeenTick, lastSeenTick }) => [id, pos.x, firstSeenTick, lastSeenTick]),
    [['reported', 3, 0, 1]], 'duplicate keys count once and the last report wins');

  const reinserted = observe(4, cold, reported);
  assert.deepEqual(reinserted.map(({ id, firstSeenTick }) => [id, firstSeenTick]),
    [['reported', 0], ['cold', 4]], 'an expired key reenters at the end with its own sighting');

  observe(4, reported);
  assert.deepEqual(observe(4, reported).map(({ id }) => id), ['reported'], 'a same-tick omission expires cold geometry');
  observe(10, cold, reported);
  observe(3, cold, reported);
  const row = memory.byEntity.get('pilot').contacts.get('hazard|s:cold');
  assert.equal(row.lastSeenTick, 3, 'a rewind keeps the actual observation tick');

  // A remembered row can carry a future stamp after a rewind or on restore.
  // Ordinary contacts retain that observation until replaced or aged out.
  const future = contact('future', 5);
  const fading = { ...contact('fading', 6), confidence: 0.0799 };
  observe(10, future, cold, fading);
  observe(6, cold);
  assert.ok(memory.byEntity.get('pilot').contacts.has('hazard|s:fading'));
  assert.equal(observe(10, cold).find(({ id }) => id === 'future')?.lastSeenTick, 10);
  assert.ok(!memory.byEntity.get('pilot').contacts.has('hazard|s:fading'), 'revisiting a tick cannot mark an absent row as seen');
  assert.deepEqual(observe(11, reported).map(({ id }) => id), ['reported', 'future']);

  observe(12, cold, reported);
  const restored = memory.byEntity.get('pilot');
  restored.tick = 9;
  delete restored.observedThroughTick; // Restores carry contact stamps, without the runtime high-water mark.
  assert.deepEqual(observe(12, reported).map(({ id }) => id), ['reported', 'future']);
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
