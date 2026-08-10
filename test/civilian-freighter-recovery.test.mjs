// PQ-047 manifest-hauler Massline recovery production-route regressions.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { ensureCombatState } from '../src/combat/runtime.js';
import { save } from '../src/save/saveSystem.js';
import {
  CIVILIAN_RECOVERY_WINDOW_S,
  SURRENDER_SECURE_REEL_WU,
  surrenderRecovery,
} from '../src/systems/surrenderRecovery.js';

const OBSERVED_EVENTS = Object.freeze([
  'surrender:option',
  'surrender:secured',
  'surrender:recoveryLost',
  'economy:applyTradePressure',
  'economy:grantCredits',
  'faction:repDelta',
  'freight:recovery',
  'freight:recoveryAbandoned',
  'encounter:receipt',
  'law:custodyTransfer',
  'combat:nonlethalResolution',
  'cargo:changed',
]);

function manifest(overrides = {}) {
  return {
    manifestId: 'fm_curtain_47',
    freighterKey: 'curtain-convoy:hauler:0',
    role: 'hauler',
    lines: [
      { commodityId: 'cmdty_food', qty: 5 },
      { commodityId: 'cmdty_fuel_cells', qty: 3 },
    ],
    totalQty: 8,
    ...overrides,
  };
}

function boot({
  seed = 47030,
  team = 2,
  role = 'hauler',
  cargoManifest = manifest(),
  data = {},
  ai = {},
  withSave = false,
} = {}) {
  const voices = [];
  const sim = createSimulation({
    seed,
    systems: withSave ? [surrenderRecovery, save] : [surrenderRecovery],
    helpers: { voice: { say(payload) { voices.push(structuredClone(payload)); return true; } } },
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_tethys_junction';
  const station = sim.spawn({
    type: 'station',
    team: 2,
    factionId: 'faction_scn',
    pos: { x: 0, z: 0 },
    radius: 90,
    data: { stationId: 'station_custody_test', factionId: 'faction_scn', size: 'M' },
  });
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 1200, z: 0 }, vel: { x: 0, z: 0 }, hull: 200, hullMax: 200,
  });
  state.playerId = player.id;
  const raider = sim.spawn({
    type: 'ship', team: 1, factionId: 'faction_reach', pos: { x: 1300, z: 40 },
    data: { ai: { archetype: 'reaver_pirate', passive: false } },
  });
  const freighterData = {
    name: 'MTS Relief Mule',
    role,
    trafficRole: role,
    ...(cargoManifest ? { cargoManifest } : {}),
    ...data,
  };
  freighterData.ai = {
    archetype: 'mule_trader',
    encounterRole: role,
    spawnContext: 'convoy_civilian',
    fsm: 'travel',
    passive: true,
    ...ai,
    ...(data.ai || {}),
  };
  const freighter = sim.spawn({
    type: 'ship',
    team,
    factionId: 'faction_mts',
    pos: { x: 1240, z: 0 },
    vel: { x: 17, z: -6 },
    hull: 52,
    hullMax: 110,
    mass: 140,
    data: {
      ...freighterData,
      intent: { fire: false, fireGroup: null, moveX: 0.42, moveZ: -0.18, boost: false },
      combat: { targetId: null, lockTarget: null },
    },
  });
  if (data.freightCustody !== null) {
    freighter.data.predationIdentityKey = `curtain-convoy:hauler:${freighter.id}`;
    freighter.data.freightCustody = {
      status: 'carrier',
      carrierId: freighter.id,
      carrierIdentityKey: freighter.data.predationIdentityKey,
      encounterId: 'curtain-convoy:47',
      manifestId: cargoManifest && cargoManifest.manifestId || null,
    };
  }
  const events = Object.fromEntries(OBSERVED_EVENTS.map((name) => [name, []]));
  for (const name of OBSERVED_EVENTS) {
    bus.on(name, (payload) => events[name].push(structuredClone(payload)));
  }
  return { sim, state, bus, station, player, raider, freighter, events, voices };
}

function installDisabledDrive(t, target = t.freighter) {
  if (!t.state.combat || typeof t.state.combat !== 'object') t.state.combat = {};
  if (!t.state.combat.entities || typeof t.state.combat.entities !== 'object') t.state.combat.entities = {};
  t.state.combat.entities[String(target.id)] = {
    entityId: target.id,
    capabilities: { drive: false, weapon: false },
    subsystems: {
      subsystem_drive: { id: 'subsystem_drive', destroyed: true, effectiveDisabled: true },
    },
  };
}

function disable(t, { target = t.freighter, attackerId = t.raider.id } = {}) {
  // Production recomputes capabilities first, then synchronously publishes the transition.
  installDisabledDrive(t, target);
  t.bus.emit('combat:subsystemDisabled', {
    attackerId,
    targetId: target.id,
    subsystemId: 'subsystem_drive',
    dependencyDisabled: false,
  });
}

function restore(t, target = t.freighter) {
  const runtime = t.state.combat.entities[String(target.id)];
  runtime.capabilities.drive = true;
  runtime.subsystems.subsystem_drive.destroyed = false;
  runtime.subsystems.subsystem_drive.effectiveDisabled = false;
  t.bus.emit('combat:subsystemEnabled', { targetId: target.id, subsystemId: 'subsystem_drive' });
}

function attachAndReel(t, target = t.freighter) {
  const attachmentId = `att_civilian_${target.id}`;
  installCanonicalAttachment(t, target, { attachmentId, restLength: SURRENDER_SECURE_REEL_WU });
  t.state.player.tether = {
    active: true,
    targetId: target.id,
    attachmentId,
    restLength: SURRENDER_SECURE_REEL_WU,
    strain: 0.12,
    phase: 'loaded',
  };
  t.bus.emit('tether:latched', { actorId: t.player.id, targetId: target.id, attachmentId });
  t.bus.emit('tether:reel', {
    actorId: t.player.id,
    targetId: target.id,
    attachmentId,
    before: SURRENDER_SECURE_REEL_WU + 12,
    after: SURRENDER_SECURE_REEL_WU,
  });
}

function installCanonicalAttachment(t, target = t.freighter, {
  attachmentId = `att_civilian_${target.id}`,
  restLength = SURRENDER_SECURE_REEL_WU,
} = {}) {
  const combat = ensureCombatState(t.state);
  combat.attachments.byId[attachmentId] = {
    id: attachmentId,
    defId: 'tether_standard',
    ownerId: t.player.id,
    targetId: target.id,
    state: 'active',
    restLength,
    lastTension: 0,
    lastImpulse: 0,
    physicsHandle: null,
  };
  combat.attachments.nextId = Math.max(combat.attachments.nextId, 2);
  return combat.attachments.byId[attachmentId];
}

function spawnRematerializedFreighter(t, annotation, cargoManifest, x = 1240) {
  const entity = t.sim.spawn({
    type: 'ship', team: 2, factionId: 'faction_mts', pos: { x, z: 0 }, vel: { x: 8, z: 2 },
    hull: 52, hullMax: 110,
    data: {
      role: 'hauler', trafficRole: 'hauler',
      cargoManifest: JSON.parse(JSON.stringify(cargoManifest)),
      surrenderRecovery: JSON.parse(JSON.stringify(annotation)),
      ai: { archetype: 'mule_trader', encounterRole: 'hauler', passive: true, fsm: 'travel' },
      intent: { fire: false, moveX: 0.2, moveZ: 0.1, boost: false },
    },
  });
  installDisabledDrive(t, entity);
  return entity;
}

function oneCivilianReceipt(t, outcome, eventName = 'encounter:receipt') {
  return t.events[eventName].filter((item) => item.shape === 'civilian_freight_recovery'
    && item.outcome === outcome);
}

test('an NPC-caused drive disable opens one timed civilian Massline recovery without taking flight authority', () => {
  const t = boot();
  const before = {
    ai: structuredClone(t.freighter.data.ai),
    intent: structuredClone(t.freighter.data.intent),
    vel: { ...t.freighter.vel },
  };

  disable(t);
  disable(t);

  assert.equal(t.events['surrender:option'].length, 1);
  const option = t.events['surrender:option'][0];
  assert.equal(option.recoveryKind, 'civilian_disabled');
  assert.equal(option.manifestId, 'fm_curtain_47');
  assert.equal(option.freighterKey, 'curtain-convoy:hauler:0');
  assert.equal(option.remainingQty, 8);
  assert.ok(Number.isFinite(option.deadlineAt));
  assert.equal(option.deadlineAt, t.state.simTime + CIVILIAN_RECOVERY_WINDOW_S);
  assert.equal(t.freighter.data.surrenderRecovery.recoveryKind, 'civilian_disabled');
  assert.equal(t.freighter.flags.persistent, true, 'an open recovery keeps the physical hull in real Continue saves');
  assert.deepEqual(t.freighter.data.ai, before.ai);
  assert.deepEqual(t.freighter.data.intent, before.intent);
  assert.deepEqual({ ...t.freighter.vel }, before.vel);
  assert.equal(t.freighter.data.despawnAt, undefined);
});

test('a pre-existing canonical Massline is adopted at disable without requiring a fake relatch', () => {
  const close = boot({ seed: 47031 });
  installCanonicalAttachment(close, close.freighter, { restLength: SURRENDER_SECURE_REEL_WU });
  disable(close);
  assert.equal(close.freighter.data.surrenderRecovery.phase, 'secured');
  assert.equal(close.events['surrender:secured'].length, 0,
    'adopting already-secured geometry does not replay the live transition event');

  const long = boot({ seed: 47032 });
  const attachment = installCanonicalAttachment(long, long.freighter, {
    restLength: SURRENDER_SECURE_REEL_WU + 20,
  });
  disable(long);
  assert.equal(long.freighter.data.surrenderRecovery.phase, 'tethered');
  attachment.restLength = SURRENDER_SECURE_REEL_WU;
  long.bus.emit('tether:reel', {
    actorId: long.player.id,
    targetId: long.freighter.id,
    attachmentId: attachment.id,
    after: SURRENDER_SECURE_REEL_WU,
  });
  assert.equal(long.freighter.data.surrenderRecovery.phase, 'secured');
  assert.equal(long.events['surrender:secured'].length, 1);
});

test('civilian recovery excludes hostile, nonmanifest, non-hauler, active, boss, ace, and mission hulls', () => {
  const cases = [
    ['hostile', { team: 1, ai: { passive: false } }],
    ['nonmanifest', { cargoManifest: null }],
    ['non-hauler', { role: 'escort' }],
    ['active neutral', { ai: { passive: false } }],
    ['boss', { data: { isBoss: true } }],
    ['ace', { data: { aceMemory: { aceId: 'ace-cinder' } } }],
    ['mission', { data: { missionId: 'mission-escort-1' } }],
  ];
  for (let i = 0; i < cases.length; i++) {
    const [label, options] = cases[i];
    const t = boot({ seed: 47100 + i, ...options });
    disable(t);
    assert.equal(t.events['surrender:option'].length, 0, `${label} must fail closed`);
    assert.equal(t.freighter.data.surrenderRecovery, undefined, `${label} receives no annotation`);
  }

  const hostile = boot({
    seed: 47150,
    team: 1,
    ai: { archetype: 'pirate_raider', spawnContext: 'encounter', passive: false, fsm: 'attack' },
  });
  disable(hostile, { attackerId: hostile.player.id });
  assert.equal(hostile.events['surrender:option'].length, 1,
    'the pre-existing player-caused hostile route remains available');
  assert.equal(hostile.events['surrender:option'][0].recoveryKind, 'drive_disabled');
});

test('existing freight custody must still be the exact carrier relation', () => {
  const cases = [
    ['raider secured', (t) => { t.freighter.data.freightCustody.status = 'raider_secured'; }],
    ['spilled', (t) => { t.freighter.data.freightCustody.status = 'spilled'; }],
    ['wrong carrier id', (t) => { t.freighter.data.freightCustody.carrierId += 100; }],
    ['wrong carrier identity', (t) => { t.freighter.data.freightCustody.carrierIdentityKey = 'other:carrier'; }],
    ['wrong manifest', (t) => { t.freighter.data.freightCustody.manifestId = 'fm_other'; }],
  ];
  for (let index = 0; index < cases.length; index++) {
    const [label, mutate] = cases[index];
    const t = boot({ seed: 47160 + index });
    mutate(t);
    disable(t);
    assert.equal(t.events['surrender:option'].length, 0, label);
    assert.equal(t.freighter.data.surrenderRecovery, undefined, label);
  }
});

test('real latch, reel, and lawful station geometry settle the preserved manifest once through owners', () => {
  const t = boot();
  const before = {
    ai: structuredClone(t.freighter.data.ai),
    intent: structuredClone(t.freighter.data.intent),
    vel: { ...t.freighter.vel },
    credits: t.state.player.credits,
    cargo: structuredClone(t.state.player.cargo),
    factions: structuredClone(t.state.factions),
  };
  disable(t);
  // The cargo-custody owner may have reduced the hold after disable. The recovery receipt trusts
  // conserved live lines, not a stale authored totalQty cache or the initial option snapshot.
  t.freighter.data.cargoManifest.lines[0].qty = 2;
  t.freighter.data.cargoManifest.totalQty = 999;
  attachAndReel(t);
  assert.equal(t.events['surrender:secured'].length, 1);
  assert.equal(t.events['freight:recovery'].length, 0, 'field secure is not a remote settlement');

  t.freighter.pos.x = 120;
  t.freighter.pos.z = 0;
  t.sim.step();

  assert.equal(t.events['freight:recovery'].length, 1);
  const receipt = t.events['freight:recovery'][0];
  assert.equal(receipt.outcome, 'recovered');
  assert.equal(receipt.stationId, 'station_custody_test');
  assert.equal(receipt.manifestId, 'fm_curtain_47');
  assert.equal(receipt.freighterKey, 'curtain-convoy:hauler:0');
  assert.equal(receipt.remainingQty, 5);
  assert.deepEqual(receipt.manifest.lines, [
    { commodityId: 'cmdty_food', qty: 2 },
    { commodityId: 'cmdty_fuel_cells', qty: 3 },
  ]);
  assert.match(receipt.id, /^civilian-recovery:fm_curtain_47:\d+:recovered$/);
  assert.equal(t.events['economy:applyTradePressure'].length, 2);
  assert.deepEqual(t.events['economy:applyTradePressure'].map((event) => [event.good, event.vol]), [
    ['cmdty_food', 2],
    ['cmdty_fuel_cells', 3],
  ]);
  assert.equal(t.events['economy:grantCredits'].length, 1);
  assert.match(t.events['economy:grantCredits'][0].reason, /^civilian_freight_recovery:/);
  assert.doesNotMatch(t.events['economy:grantCredits'][0].reason, /bounty/i);
  assert.equal(t.events['faction:repDelta'].length, 1);
  assert.equal(t.events['faction:repDelta'][0].reason, 'civilian_freight_recovery');
  assert.equal(oneCivilianReceipt(t, 'recovered').length, 1);
  assert.equal(t.events['law:custodyTransfer'].length, 0, 'a rescued civilian is not booked as an offender');
  assert.equal(t.events['combat:nonlethalResolution'].length, 0);
  assert.equal(t.events['cargo:changed'].length, 0);
  assert.equal(t.freighter.alive, true, 'the live hull survives until the ordinary despawn seam runs');
  assert.ok(t.freighter.data.despawnAt > t.state.simTime);
  assert.equal(t.freighter.flags.invuln, true, 'late projectiles cannot reverse a completed transfer');
  assert.equal(t.freighter.data.freightCustody.status, 'carrier',
    'recovery publishes intent; encounter custody remains the sole writer');
  assert.equal(t.freighter.data.freightCustody.manifestId, 'fm_curtain_47');
  assert.deepEqual(t.freighter.data.ai, before.ai);
  assert.deepEqual(t.freighter.data.intent, before.intent);
  assert.deepEqual({ ...t.freighter.vel }, before.vel);
  assert.equal(t.state.player.credits, before.credits, 'economy owner, not recovery, writes the wallet');
  assert.deepEqual(t.state.player.cargo, before.cargo, 'recovery never teleports freight into player cargo');
  assert.deepEqual(t.state.factions, before.factions, 'faction owner, not recovery, writes reputation');
  assert.notEqual(t.freighter.flags.persistent, true, 'terminal recovery releases only its save-retention flag');

  t.bus.emit('combat:subsystemDisabled', {
    attackerId: t.raider.id, targetId: t.freighter.id, subsystemId: 'subsystem_drive',
  });
  t.bus.emit('tether:reel', {
    actorId: t.player.id, targetId: t.freighter.id,
    attachmentId: t.state.player.tether.attachmentId, before: 60, after: 50,
  });
  t.sim.runTicks(20);
  assert.equal(t.events['freight:recovery'].length, 1);
  assert.equal(t.events['economy:grantCredits'].length, 1);
  assert.equal(oneCivilianReceipt(t, 'recovered').length, 1);
});

test('release and broken-line outcomes are terminal, distinct, and idempotent', () => {
  for (const [event, outcome] of [['tether:released', 'released'], ['tether:broke', 'tether_broke']]) {
    const t = boot({ seed: event === 'tether:released' ? 47200 : 47201 });
    disable(t);
    attachAndReel(t);
    t.state.player.tether.active = false;
    t.state.player.tether.targetId = null;
    t.bus.emit(event, { targetId: t.freighter.id });
    t.bus.emit(event, { targetId: t.freighter.id });
    assert.equal(t.freighter.data.surrenderRecovery.phase, 'lost');
    assert.equal(t.freighter.data.surrenderRecovery.lostReason, outcome);
    assert.equal(oneCivilianReceipt(t, outcome, 'freight:recoveryAbandoned').length, 1);
    assert.equal(oneCivilianReceipt(t, outcome).length, 1);
    assert.equal(t.events['economy:grantCredits'].length, 0);
  }
});

test('timeout is finite and records loss without escape thrust, intent, velocity, or fake despawn', () => {
  const t = boot({ seed: 47210 });
  const before = {
    ai: structuredClone(t.freighter.data.ai),
    intent: structuredClone(t.freighter.data.intent),
    vel: { ...t.freighter.vel },
  };
  disable(t);
  t.sim.runTicks(Math.ceil((CIVILIAN_RECOVERY_WINDOW_S + 0.2) / SIM_DT));
  assert.equal(oneCivilianReceipt(t, 'timed_out', 'freight:recoveryAbandoned').length, 1);
  assert.equal(t.freighter.data.surrenderRecovery.lostReason, 'timed_out');
  assert.equal(t.freighter.data.despawnAt, undefined);
  assert.deepEqual(t.freighter.data.ai, before.ai);
  assert.deepEqual(t.freighter.data.intent, before.intent);
  assert.deepEqual({ ...t.freighter.vel }, before.vel);
});

test('drive restoration and destruction publish distinct one-shot loss receipts in production order', () => {
  const restored = boot({ seed: 47220 });
  disable(restored);
  restore(restored);
  restore(restored);
  assert.equal(oneCivilianReceipt(restored, 'drive_restored', 'freight:recoveryAbandoned').length, 1);
  assert.equal(restored.freighter.data.surrenderRecovery.lostReason, 'drive_restored');

  const destroyed = boot({ seed: 47221 });
  disable(destroyed);
  // combat.kill flips alive before emitting entity:killed.
  destroyed.freighter.alive = false;
  destroyed.bus.emit('entity:killed', { id: destroyed.freighter.id, killerId: destroyed.raider.id });
  destroyed.bus.emit('entity:killed', { id: destroyed.freighter.id, killerId: destroyed.raider.id });
  destroyed.sim.step();
  assert.equal(oneCivilianReceipt(destroyed, 'destroyed', 'freight:recoveryAbandoned').length, 1);
  assert.equal(oneCivilianReceipt(destroyed, 'destroyed')[0].killerId, destroyed.raider.id);
});

test('sector exit closes the open civilian incident exactly once', () => {
  const t = boot({ seed: 47230 });
  disable(t);
  t.bus.emit('sector:exit', { sectorId: 'sector_tethys_junction' });
  t.bus.emit('sector:exit', { sectorId: 'sector_tethys_junction' });
  assert.equal(oneCivilianReceipt(t, 'sector_exit', 'freight:recoveryAbandoned').length, 1);
  assert.equal(t.freighter.data.surrenderRecovery.lostReason, 'sector_exit');
});

test('a valid JSON-rematerialized annotation re-adopts durable manifest identity on a new entity id', () => {
  const t = boot({ seed: 47240 });
  disable(t);
  const originalId = t.freighter.id;
  const annotation = JSON.parse(JSON.stringify(t.freighter.data.surrenderRecovery));
  const manifestCopy = JSON.parse(JSON.stringify(t.freighter.data.cargoManifest));
  const stableRecordId = annotation.id;
  t.bus.emit('save:restoring', { slot: 'continue' });
  assert.deepEqual(t.state.surrenderRecovery, { records: {}, receipts: [], retiredRecoveryIds: [] });
  t.freighter.alive = false;
  const rematerialized = spawnRematerializedFreighter(t, annotation, manifestCopy);
  rematerialized.data.ai.fsm = 'surrender';
  assert.notEqual(rematerialized.id, originalId);
  t.sim.step();
  const record = t.state.surrenderRecovery.records[`surrender:${rematerialized.id}`];
  assert.ok(record, 'the entity annotation rebuilds the transient coordinator');
  assert.equal(record.id, stableRecordId);
  assert.equal(record.recoveryKind, 'civilian_disabled',
    'an explicit saved civilian recovery outranks an overlapping surrender FSM');
  assert.equal(record.manifest.manifestId, manifestCopy.manifestId);
  assert.equal(record.manifest.freighterKey, manifestCopy.freighterKey);
  assert.equal(record.deadlineAt, annotation.deadlineAt);

  attachAndReel(t, rematerialized);
  rematerialized.pos.x = 100;
  t.sim.step();
  assert.equal(t.events['freight:recovery'].length, 1);
  assert.equal(t.events['freight:recovery'][0].id, `${stableRecordId}:recovered`);
  assert.equal(t.events['freight:recovery'][0].entityId, rematerialized.id);
});

test('invalid saved civilian annotations fail closed once and release only recovery-owned persistence', () => {
  const t = boot({ seed: 47241 });
  disable(t);
  const annotation = JSON.parse(JSON.stringify(t.freighter.data.surrenderRecovery));
  const manifestCopy = JSON.parse(JSON.stringify(t.freighter.data.cargoManifest));
  annotation.deadlineAt = -1;
  t.bus.emit('save:restoring', { slot: 'continue' });
  t.freighter.alive = false;
  const rematerialized = spawnRematerializedFreighter(t, annotation, manifestCopy);
  assert.equal(rematerialized.flags.persistent, undefined);
  rematerialized.flags.persistent = true;

  t.sim.step();
  t.sim.step();
  assert.equal(Object.keys(t.state.surrenderRecovery.records).length, 0);
  assert.equal(rematerialized.data.surrenderRecovery.phase, 'lost');
  assert.equal(rematerialized.data.surrenderRecovery.lostReason, 'invalid_saved_annotation');
  assert.equal(rematerialized.data.surrenderRecovery.ownedPersistent, false);
  assert.notEqual(rematerialized.flags.persistent, true);
  assert.equal(t.events['surrender:option'].length, 1, 'only the original live recovery published an option');
});

test('invalid saved recovery relinquishes C ownership without dropping an active freight-custody handoff', () => {
  const t = boot({ seed: 472415 });
  disable(t);
  const annotation = JSON.parse(JSON.stringify(t.freighter.data.surrenderRecovery));
  const manifestCopy = JSON.parse(JSON.stringify(t.freighter.data.cargoManifest));
  annotation.deadlineAt = -1;
  t.bus.emit('save:restoring', { slot: 'continue' });
  t.freighter.alive = false;
  const rematerialized = spawnRematerializedFreighter(t, annotation, manifestCopy);
  rematerialized.flags.persistent = true;
  rematerialized.data.freightCustodyPersistence = {
    custodyId: 'freight-custody:handoff-fixture',
    role: 'carrier',
  };

  t.sim.step();
  assert.equal(rematerialized.data.surrenderRecovery.phase, 'lost');
  assert.equal(rematerialized.data.surrenderRecovery.ownedPersistent, false);
  assert.equal(rematerialized.flags.persistent, true);
  assert.equal(rematerialized.data.freightCustodyPersistence.custodyId,
    'freight-custody:handoff-fixture');
});

test('real save Continue preserves the open disabled hull and re-adopts its recovery', () => {
  const t = boot({
    seed: 47242,
    withSave: true,
    // Unit B owns convoy custody remapping; this owner-level save proof covers a manifest civilian
    // without optional encounter custody metadata through the actual save/combat entity pipeline.
    data: { freightCustody: null },
  });
  disable(t);
  const oldEntityId = t.freighter.id;
  const oldRecoveryId = t.freighter.data.surrenderRecovery.id;
  const saveSystem = t.sim.registry.get('save');
  const envelope = saveSystem.serialize('civilian-recovery-continue');
  const savedFreighter = envelope.data.entities.persistent.find((entity) => (
    entity.data && entity.data.cargoManifest && entity.data.cargoManifest.manifestId === 'fm_curtain_47'
  ));
  assert.ok(savedFreighter, 'the open recovery marks its physical NPC for the canonical entity save');
  assert.ok(envelope.data.combat.entities.some((runtime) => (
    runtime.entityRef?.kind === 'persistent' && runtime.entityRef.saveId === String(oldEntityId)
  )),
    'the canonical combat save carries the disabled subsystem state for the persistent hull');

  assert.equal(saveSystem.loadEnvelope(JSON.parse(JSON.stringify(envelope)), 'civilian-recovery-continue'), true);
  const restored = t.state.entityList.find((entity) => entity && entity.alive
    && entity.data?.cargoManifest?.manifestId === 'fm_curtain_47');
  assert.ok(restored, 'Continue rematerializes the same manifest-bearing recovery hull');
  assert.equal(restored.data.surrenderRecovery.id, oldRecoveryId);
  assert.equal(restored.flags.persistent, true);
  const runtime = t.state.combat.entities[String(restored.id)];
  assert.equal(runtime.capabilities.drive, false);
  assert.equal(runtime.subsystems.subsystem_drive.effectiveDisabled, true);

  t.sim.step();
  const record = t.state.surrenderRecovery.records[`surrender:${restored.id}`];
  assert.ok(record, 'the real post-load update re-adopts the saved annotation');
  assert.equal(record.id, oldRecoveryId);
  assert.equal(record.deadlineAt, restored.data.surrenderRecovery.deadlineAt);
});

test('real save Continue re-derives a secured civilian tow from the restored Massline state', () => {
  const t = boot({
    seed: 47243,
    withSave: true,
    data: { freightCustody: null },
  });
  disable(t);
  const attachmentId = `att_civilian_${t.freighter.id}`;
  installCanonicalAttachment(t, t.freighter, { attachmentId, restLength: SURRENDER_SECURE_REEL_WU });
  t.state.player.tether = {
    active: false,
    targetId: null,
    attachmentId: null,
    restLength: 0,
    strain: 0,
    phase: 'slack',
  };
  t.bus.emit('tether:latched', { actorId: t.player.id, targetId: t.freighter.id });
  assert.equal(t.freighter.data.surrenderRecovery.phase, 'secured');
  const recoveryId = t.freighter.data.surrenderRecovery.id;
  const saveSystem = t.sim.registry.get('save');
  const envelope = saveSystem.serialize('civilian-recovery-secured-continue');

  assert.equal(saveSystem.loadEnvelope(
    JSON.parse(JSON.stringify(envelope)),
    'civilian-recovery-secured-continue',
  ), true);
  const restored = t.state.entityList.find((entity) => entity && entity.alive
    && entity.data?.cargoManifest?.manifestId === 'fm_curtain_47');
  assert.ok(restored);
  const restoredAttachment = t.state.combat.attachments.byId[attachmentId];
  assert.ok(restoredAttachment);
  assert.equal(restoredAttachment.ownerId, t.state.playerId);
  assert.equal(restoredAttachment.targetId, restored.id);
  assert.ok(restoredAttachment.restLength <= SURRENDER_SECURE_REEL_WU);

  t.sim.step();
  const record = t.state.surrenderRecovery.records[`surrender:${restored.id}`];
  assert.ok(record);
  assert.equal(record.id, recoveryId);
  assert.equal(record.phase, 'secured');
  assert.equal(restored.data.surrenderRecovery.phase, 'secured');
  assert.match(restored.data.surrenderRecovery.instruction, /Custody lock secure/);
});

test('duplicate JSON rematerializations have one durable owner and cannot settle twice', () => {
  const t = boot({ seed: 47245 });
  disable(t);
  const annotation = JSON.parse(JSON.stringify(t.freighter.data.surrenderRecovery));
  const manifestCopy = JSON.parse(JSON.stringify(t.freighter.data.cargoManifest));
  t.bus.emit('save:restoring', { slot: 'continue' });
  t.freighter.alive = false;

  const canonical = spawnRematerializedFreighter(t, annotation, manifestCopy, 1240);
  const duplicate = spawnRematerializedFreighter(t, annotation, manifestCopy, 1260);
  duplicate.flags.persistent = true;
  duplicate.data.freightCustodyPersistence = {
    custodyId: 'freight-custody:duplicate-fixture',
    role: 'carrier',
  };
  t.sim.step();

  const durableRecords = Object.values(t.state.surrenderRecovery.records)
    .filter((record) => record && record.id === annotation.id);
  assert.equal(durableRecords.length, 1);
  assert.equal(durableRecords[0].entityId, canonical.id, 'stable entity-list order owns the identity');
  assert.equal(duplicate.data.surrenderRecovery.phase, 'lost');
  assert.equal(duplicate.data.surrenderRecovery.lostReason, 'duplicate_identity');
  assert.equal(duplicate.flags.persistent, true,
    'duplicate rejection relinquishes C without deleting B custody persistence');
  assert.equal(duplicate.data.surrenderRecovery.ownedPersistent, false);

  attachAndReel(t, canonical);
  canonical.pos.x = 100;
  duplicate.pos.x = 110;
  t.sim.step();
  assert.equal(t.events['freight:recovery'].length, 1);
  assert.equal(t.events['economy:grantCredits'].length, 1);
  assert.equal(t.events['faction:repDelta'].length, 1);
  assert.equal(t.events['economy:applyTradePressure'].length, 2);
  assert.equal(oneCivilianReceipt(t, 'recovered').length, 1);

  attachAndReel(t, duplicate);
  t.sim.step();
  assert.equal(t.events['freight:recovery'].length, 1, 'the rejected duplicate cannot publish recovery');
  assert.equal(t.events['economy:grantCredits'].length, 1);
  assert.equal(t.events['faction:repDelta'].length, 1);
  assert.equal(t.events['economy:applyTradePressure'].length, 2);
  assert.equal(oneCivilianReceipt(t, 'recovered').length, 1);
});

test('a pre-admitted stable receipt blocks every settlement side effect', () => {
  const t = boot({ seed: 47246 });
  disable(t);
  const record = t.state.surrenderRecovery.records[`surrender:${t.freighter.id}`];
  const receiptId = `${record.id}:recovered`;
  t.state.surrenderRecovery.receipts.push({ id: receiptId, shape: 'civilian_freight_recovery' });

  attachAndReel(t);
  t.freighter.pos.x = 100;
  t.sim.step();

  assert.equal(t.events['freight:recovery'].length, 0);
  assert.equal(t.events['economy:grantCredits'].length, 0);
  assert.equal(t.events['faction:repDelta'].length, 0);
  assert.equal(t.events['economy:applyTradePressure'].length, 0);
  assert.equal(oneCivilianReceipt(t, 'recovered').length, 0);
  assert.equal(t.freighter.data.despawnAt, undefined);
  assert.notEqual(t.freighter.flags && t.freighter.flags.invuln, true);
  assert.equal(t.freighter.data.freightCustody.status, 'carrier');
  assert.equal(t.freighter.data.surrenderRecovery.phase, 'lost');
  assert.equal(t.freighter.data.surrenderRecovery.lostReason, 'duplicate_receipt');
  assert.equal(t.state.surrenderRecovery.receipts.filter((item) => item.id === receiptId).length, 1);
});

test('one durable civilian recovery identity cannot settle under a conflicting terminal outcome', () => {
  const t = boot({ seed: 47247 });
  disable(t);
  const record = t.state.surrenderRecovery.records[`surrender:${t.freighter.id}`];
  t.state.surrenderRecovery.receipts.push({
    id: `${record.id}:released`,
    recoveryId: record.id,
    shape: 'civilian_freight_recovery',
    outcome: 'released',
  });

  attachAndReel(t);
  t.freighter.pos.x = 100;
  t.sim.step();

  assert.equal(t.events['freight:recovery'].length, 0);
  assert.equal(t.events['economy:grantCredits'].length, 0);
  assert.equal(t.events['faction:repDelta'].length, 0);
  assert.equal(t.events['economy:applyTradePressure'].length, 0);
  assert.equal(t.freighter.data.surrenderRecovery.lostReason, 'duplicate_receipt');
  assert.equal(t.state.surrenderRecovery.receipts.length, 1);
});

test('retired recovery identity remains closed after visible receipt eviction and numeric-id reuse', () => {
  const t = boot({ seed: 472475 });
  disable(t);
  const staleAnnotation = JSON.parse(JSON.stringify(t.freighter.data.surrenderRecovery));
  const staleManifest = JSON.parse(JSON.stringify(t.freighter.data.cargoManifest));
  const retiredId = staleAnnotation.id;
  const recycledId = t.freighter.id;
  attachAndReel(t);
  t.bus.emit('tether:released', { targetId: recycledId, reason: 'player_release' });
  assert.ok(t.state.surrenderRecovery.retiredRecoveryIds.includes(retiredId));

  t.freighter.alive = false;
  t.sim.step();
  const replacementManifest = manifest({
    manifestId: 'fm_curtain_47_cap_replacement',
    freighterKey: 'curtain-convoy:hauler:cap-replacement',
  });
  const replacement = t.sim.spawn({
    type: 'ship', team: 2, factionId: 'faction_mts', pos: { x: 1220, z: 0 }, vel: { x: 0, z: 0 },
    data: {
      role: 'hauler', trafficRole: 'hauler', cargoManifest: replacementManifest,
      ai: { archetype: 'mule_trader', encounterRole: 'hauler', passive: true, fsm: 'travel' },
      intent: { fire: false, moveX: 0, moveZ: 0, boost: false },
    },
  });
  assert.equal(replacement.id, recycledId);
  disable(t, { target: replacement, attackerId: t.raider.id });
  assert.notEqual(t.state.surrenderRecovery.records[`surrender:${recycledId}`].id, retiredId);

  t.state.surrenderRecovery.receipts = Array.from({ length: 32 }, (_, index) => ({
    id: `fixture-visible-receipt:${index}`,
    shape: 'fixture',
  }));
  assert.equal(t.state.surrenderRecovery.receipts.some((receipt) => receipt.recoveryId === retiredId), false);
  const stale = spawnRematerializedFreighter(t, staleAnnotation, staleManifest, 1400);
  t.sim.step();
  assert.equal(stale.data.surrenderRecovery.id, retiredId);

  attachAndReel(t, stale);
  stale.pos.x = 100;
  t.sim.step();
  assert.equal(t.events['freight:recovery'].length, 0);
  assert.equal(t.events['economy:grantCredits'].length, 0);
  assert.equal(stale.data.surrenderRecovery.lostReason, 'duplicate_receipt');
  assert.ok(t.state.surrenderRecovery.retiredRecoveryIds.includes(retiredId));
});

test('retired identity saturation is bounded and fails closed instead of rotating replay protection', () => {
  const t = boot({ seed: 472476 });
  const system = t.sim.registry.get('surrenderRecovery');
  for (let index = 0; index < 1024; index++) {
    const recoveryId = `civilian-recovery:fixture-cap-${index}:0`;
    assert.equal(system._storeReceipt({
      id: `${recoveryId}:released`,
      recoveryId,
      shape: 'civilian_freight_recovery',
      outcome: 'released',
    }), true);
  }
  const overflowId = 'civilian-recovery:fixture-cap-overflow:0';
  assert.equal(system._storeReceipt({
    id: `${overflowId}:released`,
    recoveryId: overflowId,
    shape: 'civilian_freight_recovery',
    outcome: 'released',
  }), false);
  assert.equal(t.state.surrenderRecovery.retiredRecoveryIds.length, 1024);
  assert.equal(t.state.surrenderRecovery.receipts.length, 32);
});

test('same-run numeric id reuse with a different manifest opens a fresh recovery identity', () => {
  const t = boot({ seed: 47248 });
  disable(t);
  const recycledId = t.freighter.id;
  const oldRecoveryId = t.freighter.data.surrenderRecovery.id;
  t.freighter.alive = false;
  t.bus.emit('entity:killed', { id: recycledId, killerId: t.raider.id });
  t.sim.step();

  const nextManifest = manifest({
    manifestId: 'fm_curtain_47_replacement',
    freighterKey: 'curtain-convoy:hauler:replacement',
  });
  const next = t.sim.spawn({
    type: 'ship', team: 2, factionId: 'faction_mts', pos: { x: 1220, z: 0 }, vel: { x: 4, z: 0 },
    data: {
      role: 'hauler', trafficRole: 'hauler', cargoManifest: nextManifest,
      ai: { archetype: 'mule_trader', encounterRole: 'hauler', passive: true, fsm: 'travel' },
      intent: { fire: false, moveX: 0, moveZ: 0, boost: false },
    },
  });
  assert.equal(next.id, recycledId, 'the core allocator reused the removed freighter id in the same run');
  disable(t, { target: next, attackerId: t.raider.id });

  assert.equal(t.events['surrender:option'].length, 2);
  const record = t.state.surrenderRecovery.records[`surrender:${recycledId}`];
  assert.equal(record.manifest.manifestId, nextManifest.manifestId);
  assert.notEqual(record.id, oldRecoveryId);
  assert.equal(next.data.surrenderRecovery.id, record.id);
});

test('resolved generic recovery cannot block a fresh civilian that reuses its numeric entity id', () => {
  const t = boot({ seed: 47249 });
  const recycledId = t.freighter.id;
  delete t.freighter.data.cargoManifest;
  delete t.freighter.data.freightCustody;
  t.freighter.team = 1;
  t.freighter.data.ai.fsm = 'surrender';
  t.freighter.data.ai.passive = true;
  t.bus.emit('combat:surrendered', {
    entityId: recycledId,
    reason: 'fixture_generic_surrender',
    factionId: t.freighter.factionId,
    type: 'ship',
  });
  assert.equal(t.state.surrenderRecovery.records[`surrender:${recycledId}`].recoveryKind, 'surrendered');
  t.freighter.alive = false;
  t.sim.step();

  const nextManifest = manifest({
    manifestId: 'fm_after_generic_reuse',
    freighterKey: 'curtain-convoy:hauler:after-generic',
  });
  const next = t.sim.spawn({
    type: 'ship', team: 2, factionId: 'faction_mts', pos: { x: 1220, z: 0 }, vel: { x: 0, z: 0 },
    data: {
      role: 'hauler', trafficRole: 'hauler', cargoManifest: nextManifest,
      ai: { archetype: 'mule_trader', encounterRole: 'hauler', passive: true, fsm: 'travel' },
      intent: { fire: false, moveX: 0, moveZ: 0, boost: false },
    },
  });
  assert.equal(next.id, recycledId);
  disable(t, { target: next, attackerId: t.raider.id });

  const record = t.state.surrenderRecovery.records[`surrender:${recycledId}`];
  assert.equal(record.recoveryKind, 'civilian_disabled');
  assert.equal(record.manifest.manifestId, nextManifest.manifestId);
  assert.equal(next.data.surrenderRecovery.id, record.id);
});

test('canonical same-instance game:new then game:started resets records before a recycled id is reused', () => {
  const t = boot({ seed: 47250 });
  disable(t);
  const recycledId = t.freighter.id;
  assert.ok(t.state.surrenderRecovery.records[`surrender:${recycledId}`]);

  // Production dispatch order: game:new starts the transition; game:started closes it later.
  t.bus.emit('game:new', { seed: 47251 });
  t.bus.emit('game:started', {});
  assert.deepEqual(t.state.surrenderRecovery, { records: {}, receipts: [], retiredRecoveryIds: [] });
  assert.equal(oneCivilianReceipt(t, 'new_game', 'freight:recoveryAbandoned').length, 1);

  t.freighter.alive = false;
  t.sim.step();
  const next = t.sim.spawn({
    type: 'ship', team: 2, factionId: 'faction_mts', pos: { x: 1200, z: 0 }, vel: { x: 0, z: 0 },
    data: {
      role: 'hauler', trafficRole: 'hauler', cargoManifest: manifest(),
      ai: { archetype: 'mule_trader', encounterRole: 'hauler', passive: true, fsm: 'travel' },
      intent: { fire: false, moveX: 0, moveZ: 0, boost: false },
    },
  });
  assert.equal(next.id, recycledId, 'the core allocator actually reused the numeric id');
  disable(t, { target: next, attackerId: t.raider.id });
  assert.equal(t.events['surrender:option'].length, 2, 'the fresh run can open a new record for the reused id');
  assert.equal(t.events['surrender:option'][1].recoveryKind, 'civilian_disabled');
});
