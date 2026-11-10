import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { ENCOUNTERS } from '../src/data/encounters/index.generated.js';
import { ENEMY_TYPES } from '../src/data/enemies.js';
import { uniqueWreckById } from '../src/data/uniqueWrecks.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { uniqueWrecks, RUMOR_EVENT_BY_CHANNEL } from '../src/systems/uniqueWrecks.js';
import { cargo } from '../src/systems/cargo.js';
import { ships } from '../src/systems/ships.js';

function boot(def, seed = 47211) {
  const sim = createSimulation({ seed, systems: [encounterDirector, uniqueWrecks, cargo, ships] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = def.sectorId;
  state.player.cargo.capVolume = 1000;
  state.player.cargo.capMass = 1e9;
  const player = sim.spawn({
    type: 'ship',
    team: 0,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 10,
    hull: 100,
    hullMax: 100,
    data: { defId: 'ship_kestrel' },
  });
  state.playerId = player.id;
  const events = [];
  for (const name of [
    'uniqueWreck:complicationTriggered',
    'uniqueWreck:encounterRequested',
    'uniqueWreck:encounterActivated',
    'uniqueWreck:storyRewardGranted',
  ]) bus.on(name, (payload) => events.push({ name, payload }));
  return {
    sim,
    state,
    bus,
    events,
    system: sim.registry.get('uniqueWrecks'),
    dispose: () => sim.dispose(),
  };
}

function emitRumor(t, def) {
  const source = def.rumorSources.find((entry) => entry.sourceRef === def.bearingSourceRef);
  assert.ok(source);
  t.bus.emit(RUMOR_EVENT_BY_CHANNEL[source.channelId], {
    wreckId: def.id,
    authoredWreckId: def.id,
    sourceRef: source.sourceRef,
    channelId: source.channelId,
  });
  return t.state.player.uniqueWrecks.bearings[def.id];
}

function liveWreck(t, wreckId) {
  return t.state.entityList.find((entity) => entity.alive !== false
    && entity.data?.uniqueWreckId === wreckId) || null;
}

function fixAndOpenDecision(t, def, record) {
  t.bus.emit('scan:pulse', { pos: record.exactPos });
  assert.equal(record.phase, 'fixed');
  const wreck = liveWreck(t, def.id);
  assert.ok(wreck);
  t.bus.emit('salvage:completed', { wreckId: wreck.id, loot: {} });
  assert.equal(record.phase, 'decision');
}

function liveInstance(t, def, authoredEncounterId) {
  return t.state.encounterDirector.live[`unique-wreck:${def.id}:${authoredEncounterId}`] || null;
}

function countInstances(t, def) {
  const prefix = `unique-wreck:${def.id}:`;
  return Object.keys(t.state.encounterDirector.live).filter((id) => id.startsWith(prefix)).length;
}

test('D11 and D12 pursuers remain direct-only and use the shipped combat roster', () => {
  const enemyIds = new Set(ENEMY_TYPES.map((enemy) => enemy.id));
  const cases = [
    ['unique_wreck_silver_draft_cleaner', 'wreck_mts_silver_draft'],
    ['unique_wreck_cassandra_hardliners', 'wreck_choir_cassandra'],
  ];
  for (const [encounterId, wreckId] of cases) {
    const shape = ENCOUNTERS[encounterId];
    assert.ok(shape);
    assert.equal(shape.weight, 0);
    assert.deepEqual(shape.zoneTypes, []);
    assert.equal(shape.gates?.uniqueWreckOnly, true);
    assert.equal(shape.gates?.uniqueWreckId, wreckId);
    assert.equal(shape.squad.archetypes.every((archetype) => enemyIds.has(archetype)), true);
  }
});

test('D11 seeded cleaner physically arrives at Silver-Draft once and resumes once after load', () => {
  const def = uniqueWreckById('wreck_mts_silver_draft');
  const authoredEncounterId = 'unique_wreck_silver_draft_cleaner';
  const first = boot(def);
  let checkpoint;
  try {
    first.state.simTime = 123;
    const bearing = emitRumor(first, def);
    const timer = Object.values(first.state.player.uniqueWrecks.complications)
      .find((entry) => entry.wreckId === def.id && entry.timerId === 'silver_draft_cleaner');
    assert.equal(timer?.encounterId, authoredEncounterId, 'the seeded deadline names a physical cleaner encounter');

    first.state.simTime = timer.dueAt;
    first.bus.emit('economy:tick', {});
    first.bus.emit('economy:tick', {});
    const live = liveInstance(first, def, authoredEncounterId);
    assert.ok(live, 'the cleaner reaches the live encounter director');
    assert.equal(countInstances(first, def), 1, 'repeat ticks cannot duplicate the cleaner');
    assert.deepEqual(live.plan.zoneCenter, bearing.exactPos, 'the local planning zone composes once to the wreck global position');
    assert.equal(live.plan.ships.every((ship) => Math.hypot(
      ship.pos.x - bearing.exactPos.x,
      ship.pos.z - bearing.exactPos.z,
    ) <= live.plan.zoneRadius), true, 'the cleaner squad materializes at Silver-Draft');
    assert.equal(live.plan.factionId, 'faction_mts');
    checkpoint = first.system.serialize();
  } finally {
    first.dispose();
  }

  const restored = boot(def);
  try {
    restored.system.deserialize(checkpoint);
    restored.bus.emit('save:loaded', {});
    restored.bus.emit('sector:enter', { sectorId: def.sectorId });
    restored.bus.emit('sector:enter', { sectorId: def.sectorId });
    restored.bus.emit('economy:tick', {});
    assert.ok(liveInstance(restored, def, authoredEncounterId), 'Continue restores the unresolved physical pursuit');
    assert.equal(countInstances(restored, def), 1, 'Continue and repeated sector entry keep one cleaner instance');
    assert.equal(
      restored.state.player.uniqueWrecks.complications[`${def.id}:encounter:${authoredEncounterId}`]?.status,
      'active',
    );
  } finally {
    restored.dispose();
  }
});

test('D12 claiming the held Cassandra Treaty materializes Choir hardliners once with a durable receipt', () => {
  const def = uniqueWreckById('wreck_choir_cassandra');
  const authoredEncounterId = 'unique_wreck_cassandra_hardliners';
  const t = boot(def, 47212);
  try {
    const record = emitRumor(t, def);
    fixAndOpenDecision(t, def, record);
    const claim = def.decision.choices.find((choice) => choice.uniqueDrop);
    assert.ok(claim);
    t.bus.emit('uniqueWreck:choose', { wreckId: def.id, choiceId: claim.id });
    t.bus.emit('uniqueWreck:choose', { wreckId: def.id, choiceId: claim.id });
    t.bus.emit('sector:enter', { sectorId: def.sectorId });

    assert.equal(t.state.player.flags['uniqueWreck.cassandraTreaty'], true, 'the treaty is durably held before pursuit');
    assert.equal(t.state.player.uniqueWrecks.storyRewards.unique_cassandra_treaty?.wreckId, def.id);
    const complication = t.state.player.uniqueWrecks.complications[`${def.id}:encounter:${authoredEncounterId}`];
    assert.ok(complication, 'claiming the treaty writes a durable hardliner complication');
    assert.equal(complication.status, 'active');
    const live = liveInstance(t, def, authoredEncounterId);
    assert.ok(live, 'the hardliners reach the live encounter director');
    assert.equal(countInstances(t, def), 1, 'duplicate choices and sector entry cannot duplicate hardliners');
    assert.deepEqual(live.plan.zoneCenter, record.exactPos, 'the hardliner zone composes exactly once into global_v1');
    assert.equal(live.plan.factionId, 'faction_choir');
    assert.equal(
      t.state.player.uniqueWrecks.receipts.some((receipt) => receipt.type === 'encounter_requested'
        && receipt.wreckId === def.id),
      true,
      'the pursuit has a durable encounter-request receipt',
    );
  } finally {
    t.dispose();
  }
});
