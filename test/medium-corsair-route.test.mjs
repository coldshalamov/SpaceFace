import test from 'node:test';
import assert from 'node:assert/strict';

import { ensureCombatState } from '../src/combat/runtime.js';
import { createSimulation } from '../src/core/sim.js';
import { COMBAT_FLAGS } from '../src/data/featureFlags.js';
import { ENCOUNTERS } from '../src/data/encounters.js';
import { save } from '../src/save/saveSystem.js';
import { actions } from '../src/systems/actions.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { cargo } from '../src/systems/cargo.js';
import { collisionConsequences } from '../src/systems/collisionConsequences.js';
import { combat } from '../src/systems/combat.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { physics } from '../src/core/physics.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { surrenderRecovery } from '../src/systems/surrenderRecovery.js';
import { createTacticalAISystem } from '../src/systems/tacticalAI.js';

const SECTOR_ID = 'sector_tethys_junction';
const STATION_ID = 'st_tethys_hub';
const ANCHOR = Object.freeze({ x: 6200, z: 4800 });

async function boot(seed, { withSave = false } = {}) {
  const tactical = createTacticalAISystem();
  const physicsSystem = Object.create(physics);
  const aiPortsSystem = Object.create(aiPorts);
  const actionsSystem = Object.create(actions);
  const combatSystem = Object.create(combat);
  const collisionSystem = Object.create(collisionConsequences);
  const recoverySystem = Object.create(surrenderRecovery);
  const cargoSystem = Object.create(cargo);
  const budgetSystem = Object.create(spawnBudget);
  const directorSystem = Object.create(encounterDirector);
  const saveSystem = withSave ? Object.create(save) : null;
  const systems = [
    tactical, physicsSystem, aiPortsSystem, actionsSystem, combatSystem, collisionSystem,
    recoverySystem, cargoSystem, budgetSystem, directorSystem,
  ];
  if (saveSystem) systems.push(saveSystem);
  const sim = createSimulation({
    seed,
    systems,
    updateOrder: [
      tactical, actionsSystem, aiPortsSystem, physicsSystem, collisionSystem, combatSystem,
      recoverySystem, cargoSystem, directorSystem,
    ],
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR_ID;
  state.story.beatIndex = 7;
  state.world.activeSector = {
    stations: [{ id: STATION_ID, pos: { x: ANCHOR.x + 1200, z: ANCHOR.z }, name: 'Tethys Hub' }],
  };
  const player = sim.spawn({
    type: 'ship', team: 0, factionId: 'faction_free',
    pos: { x: ANCHOR.x - 700, z: ANCHOR.z }, vel: { x: 0, z: 0 },
    radius: 8, mass: 25, hull: 240, hullMax: 240,
    data: { intent: {}, ai: {}, derived: { ramDamageDealtMult: 4 } },
  });
  state.playerId = player.id;
  sim.spawn({
    type: 'station', team: 2, factionId: 'faction_mts',
    pos: { x: ANCHOR.x + 1200, z: ANCHOR.z }, radius: 42,
    data: { stationId: STATION_ID, factionId: 'faction_mts', sectorId: SECTOR_ID, dockRadius: 72 },
  });
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  assert.equal(await sim.registry.get('physics').prepareBackend(state, { reset: true }), true);
  const eventNames = [
    'freight:cargoTowAttached', 'freight:cargoSpilled', 'freight:raiderEscaped',
    'freight:custodyReceipt', 'pickup:collected', 'entity:killed', 'medium:retreatStarted',
  ];
  const events = Object.fromEntries(eventNames.map((name) => [name, []]));
  for (const name of eventNames) bus.on(name, (payload) => events[name].push(structuredClone(payload)));
  return { sim, state, bus, player, events, director: sim.registry.get('encounterDirector') };
}

function fire(h, suffix = '') {
  const encounterId = `plan13:corsair-cargo${suffix}`;
  assert.deepEqual(h.director.requestAuthoredEncounter({
    shapeId: 'corsair_cargo_cut', encounterId, sectorId: SECTOR_ID,
    anchor: { ...ANCHOR }, zoneType: 'trade_lane', zoneRadius: 800, force: true,
  }), { ok: true, encounterId });
  return h.state.encounterDirector.live[encounterId];
}

function actors(h, live) {
  return {
    carrier: h.state.entities.get(live.data.predationTargetId),
    raider: h.state.entities.get(live.data.predationRaiderId),
  };
}

function disableCarrier(h, live) {
  const pair = actors(h, live);
  const runtime = ensureCombatState(h.state).entities[String(pair.carrier.id)] || {};
  runtime.entityId = pair.carrier.id;
  runtime.capabilities = { ...(runtime.capabilities || {}), drive: false, weapon: true };
  runtime.subsystems = runtime.subsystems || {};
  runtime.subsystems.subsystem_drive = {
    ...(runtime.subsystems.subsystem_drive || {}), id: 'subsystem_drive', effectiveDisabled: true,
  };
  h.state.combat.entities[String(pair.carrier.id)] = runtime;
  h.bus.emit('combat:subsystemDisabled', {
    attackerId: pair.raider.id,
    targetId: pair.carrier.id,
    subsystemId: 'subsystem_drive',
  });
  return pair;
}

function physicalPods(h, live) {
  return live.ids
    .filter((id) => live.roles[id] === 'freight_pod')
    .map((id) => h.state.entities.get(id))
    .filter((entity) => entity && entity.alive !== false);
}

function assertConserved(record) {
  const looseQty = record.pods.reduce((sum, pod) => sum + (pod.status === 'live' ? pod.qty : 0), 0);
  assert.equal(
    record.carrierQty + looseQty + record.playerCollectedQty + record.raiderSecuredQty
      + record.stationRecoveredQty + record.deliveredQty + record.lostQty,
    record.initialQty,
  );
}

function collectThroughPhysics(h, pod) {
  const before = h.state.player.cargo.items[pod.data.commodityId] || 0;
  const qty = pod.data.amount;
  assert.equal(h.sim.registry.get('physics')._applyPickupCollection(
    pod, h.player, h.bus, h.state,
  ), true);
  assert.equal(h.state.player.cargo.items[pod.data.commodityId], before + qty);
  return qty;
}

function waitForTow(h, live, maxSeconds = 75) {
  const record = live.data.freightCargoCustody;
  for (let second = 0; second < maxSeconds && !record.corsairTowAttachmentId; second++) {
    h.sim.runTicks(60);
  }
  const raider = actors(h, live).raider;
  assert.ok(record.corsairTowAttachmentId, `the Corsair reaches and grapples the real pod: ${JSON.stringify({
    terminal: record.terminal,
    escaped: record.raiderEscaped,
    secured: record.raiderSecuredQty,
    pods: record.pods.map((pod) => ({ status: pod.status, entityId: pod.entityId, qty: pod.qty })),
    raider: raider && {
      alive: raider.alive, pos: { x: raider.pos.x, z: raider.pos.z },
      ai: raider.data?.ai, tow: raider.data?.corsairCargoTow,
    },
    attachments: h.state.combat?.attachments?.byId,
  })}`);
  return record;
}

test('ordinary encounter catalog and director guarantee one live Corsair cargo-cut actor', async () => {
  const shape = ENCOUNTERS.corsair_cargo_cut;
  assert.ok(shape.weight > 0);
  assert.equal(shape.gates.externalOnly, undefined);
  assert.ok(shape.zoneTypes.includes('trade_lane'));
  const h = await boot(0x13c0_0001);
  const live = fire(h, ':reachability');
  const { carrier, raider } = actors(h, live);
  assert.equal(carrier.data.lootTableId, 'mule_trader');
  assert.equal(raider.data.lootTableId, 'corsair_raider');
  assert.equal(h.director.entsOf(live, 'raider').filter((entity) => (
    entity.data?.lootTableId === 'corsair_raider'
  )).length, 1);
});

test('tow break keeps the stolen pod physical and recovers cargo the naive escape loses', async () => {
  const intended = await boot(0x13c0_0002);
  const intendedLive = fire(intended, ':stable');
  const { raider } = disableCarrier(intended, intendedLive);
  const intendedRecord = waitForTow(intended, intendedLive);
  const towed = physicalPods(intended, intendedLive).find((entity) => (
    entity.data?.freightCustodyPod?.status === 'raider_towed'
  ));
  assert.ok(towed);
  const samePodId = towed.id;
  const attachment = intended.state.combat.attachments.byId[intendedRecord.corsairTowAttachmentId];
  assert.equal(attachment.state, 'active');
  assert.equal(attachment.ownerId, raider.id);
  assert.equal(attachment.targetId, towed.id);
  assert.equal(attachment.controlMode, 'corsair_cargo_tow');

  const playerLine = intended.sim.registry.get('combat').ensureKernel().attachments.create({
    defId: 'tether_standard', ownerId: intended.player.id, targetId: raider.id,
    controlMode: 'player_counter_line', actionInstanceId: 'plan13:corsair-counter',
  });
  assert.equal(playerLine.ok, true);
  intended.sim.runTicks(61);
  const spilled = physicalPods(intended, intendedLive).find((entity) => entity.id === samePodId);
  assert.ok(spilled, 'breaking the tow frees the exact existing physical pod');
  assert.equal(spilled.data.freightCustodyPod.status, 'live', JSON.stringify({
    tick: intended.state.tick,
    playerLine: intended.state.combat.attachments.byId[playerLine.attachment.id],
    corsairLine: intended.state.combat.attachments.byId[intendedRecord.corsairTowAttachmentId],
    secured: intendedRecord.raiderSecuredQty,
  }));
  assert.equal(intendedRecord.raiderSecuredQty, 0);
  const recoveredQty = collectThroughPhysics(intended, spilled);
  assert.ok(recoveredQty > 0);
  assertConserved(intendedRecord);

  const naive = await boot(0x13c0_0002);
  const naiveLive = fire(naive, ':stable');
  disableCarrier(naive, naiveLive);
  const naiveRecord = waitForTow(naive, naiveLive);
  for (let second = 0; second < 40 && !naiveRecord.raiderEscaped; second++) naive.sim.runTicks(60);
  assert.equal(naiveRecord.raiderEscaped, true);
  assert.equal(naiveRecord.playerCollectedQty, 0);
  assert.ok(intendedRecord.playerCollectedQty > naiveRecord.playerCollectedQty,
    'the intended physical counter recovers manifest units while passive pursuit loses all towed units');
  assertConserved(naiveRecord);
});

test('a production collision slam releases the full towed burst once from the same body', async () => {
  const previous = COMBAT_FLAGS.weaponImpulseConsequences;
  COMBAT_FLAGS.weaponImpulseConsequences = true;
  try {
    const h = await boot(0x13c0_0003);
    const live = fire(h, ':stable');
    const { raider } = disableCarrier(h, live);
    const record = waitForTow(h, live);
    const towed = physicalPods(h, live).find((entity) => (
      entity.data?.freightCustodyPod?.status === 'raider_towed'
    ));
    const towedId = towed.id;
    const towedQty = towed.data.amount;
    assert.ok(record.escapeStartedAt != null, 'the physical slam happens after the tow has begun fleeing');
    raider.hull = 1;
    raider.armorHp = 0;
    raider.shield = 0;
    h.player.vel.set(120, 0, 0);

    h.bus.emit('physics:impact', {
      consequenceKernelVersion: 1,
      tick: h.state.tick,
      aId: raider.id,
      bId: h.player.id,
      causalActorId: h.player.id,
      impulse: 5000,
      pos: { x: raider.pos.x, z: raider.pos.z },
      normal: { x: -1, z: 0 },
    });

    assert.equal(raider.alive, false);
    const kill = h.events['entity:killed'].find((event) => event.id === raider.id);
    assert.equal(kill.presentation.cause, 'ship_collision');
    const released = physicalPods(h, live).filter((entity) => entity.id === towedId);
    assert.equal(released.length, 1);
    assert.equal(released[0].data.amount, towedQty);
    assert.equal(released[0].data.freightCustodyPod.status, 'live');
    assert.equal(record.raiderSecuredQty, 0);
    assert.equal(record.pods.filter((pod) => pod.status === 'live').length, 1);
    assert.equal(h.events['freight:cargoSpilled'].filter((event) => event.physicalReuse === true).length, 1);
    h.bus.emit('entity:killed', { id: raider.id, killerId: h.player.id, pos: { ...raider.pos } });
    assert.equal(h.events['freight:cargoSpilled'].filter((event) => event.physicalReuse === true).length, 1);
    assertConserved(record);
  } finally {
    COMBAT_FLAGS.weaponImpulseConsequences = previous;
  }
});

test('open Corsair tow survives a real save/Continue without duplicating custody', async () => {
  const before = await boot(0x13c0_0004, { withSave: true });
  const live = fire(before, ':stable');
  disableCarrier(before, live);
  const record = waitForTow(before, live);
  const envelope = before.sim.registry.get('save').serialize('medium-corsair-tow');
  const persistedTowPods = envelope.data.entities.persistent.filter((entity) => (
    entity.data?.freightCustodyPod?.status === 'raider_towed'
  ));
  assert.equal(persistedTowPods.length, 1);

  const after = await boot(0x13c0_9004, { withSave: true });
  assert.equal(after.sim.registry.get('save').loadEnvelope(
    JSON.parse(JSON.stringify(envelope)), 'medium-corsair-tow',
  ), true);
  assert.equal(await after.sim.registry.get('physics').prepareBackend(
    after.state, { reset: true },
  ), true);
  // The director owns two bounded post-Continue passes because entity physics handles are rebuilt
  // after save:loaded. Exercise that production ordering instead of invoking restore metadata.
  after.sim.runTicks(2);
  const resumed = after.state.encounterDirector.live[live.id];
  assert.ok(resumed);
  const resumedRecord = resumed.data.freightCargoCustody;
  assert.equal(resumedRecord.raiderSecuredQty, record.raiderSecuredQty);
  assert.equal(resumedRecord.pods.filter((pod) => pod.status === 'raider_towed').length, 1);
  const resumedTowPods = physicalPods(after, resumed).filter((entity) => (
    entity.data?.freightCustodyPod?.status === 'raider_towed'
  ));
  assert.equal(resumedTowPods.length, 1);
  const resumedAttachment = after.state.combat.attachments.byId[resumedRecord.corsairTowAttachmentId];
  assert.equal(resumedAttachment?.state, 'active');
  assert.equal(resumedAttachment?.ownerId, resumed.data.predationRaiderId);
  assert.equal(resumedAttachment?.targetId, resumedTowPods[0].id);
  assert.notEqual(resumedAttachment?.physicsHandle, null);
  assert.equal(after.events['freight:custodyReceipt'].length, 0);
  assertConserved(resumedRecord);
  after.sim.runTicks(1);
  assert.equal(after.events['freight:cargoSpilled'].length, 0,
    'the restored active rope is not misread as a tow break');
  assertConserved(resumedRecord);
});
