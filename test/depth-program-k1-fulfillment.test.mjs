import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import { createGameState } from '../src/core/gameState.js';
import { sectorGlobalOrigin } from '../src/data/sectorCoordinates.js';
import { planFactionPresence } from '../src/data/factionPresence.js';
import { createCombatKernel } from '../src/combat/kernel.js';
import { addCargo } from '../src/systems/cargo.js';
import { factionPresence } from '../src/systems/factionPresence.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { world } from '../src/systems/world.js';
import { save } from '../src/save/saveSystem.js';

function entityFrom(spec, id) {
  return {
    ...spec,
    id,
    alive: true,
    vel: { x: 0, z: 0 },
    angVel: 0,
    flags: {},
  };
}

test('Fulfillment planner produces a deterministic three-ship fixed-route formation', () => {
  const first = planFactionPresence({ sectorId: 'sector_tethys_junction', seed: 0x47a })
    .filter((plan) => plan.factionId === 'faction_fulfillment');
  const replay = planFactionPresence({ sectorId: 'sector_tethys_junction', seed: 0x47a })
    .filter((plan) => plan.factionId === 'faction_fulfillment');
  assert.deepEqual(first, replay);
  assert.equal(first.length, 3);
  assert.deepEqual(first.map((plan) => plan.formationIndex), [0, 1, 2]);
  assert.equal(new Set(first.map((plan) => `${plan.pos.x}:${plan.pos.z}`)).size, 3);
  const origin = sectorGlobalOrigin('sector_tethys_junction');
  assert.equal(first.every((plan) => Math.hypot(plan.pos.x - origin.x, plan.pos.z - origin.z) < 1000), true);
  assert.equal(first.every((plan) => plan.formation === 'line' && plan.formationCount === 3), true);
});

test('real subsystem damage drives Fulfillment blackout, routing, cargo-owner removal, and holding waypoint', () => {
  const state = createGameState(0x47a);
  const origin = sectorGlobalOrigin('sector_tethys_junction');
  state.world.currentSectorId = 'sector_tethys_junction';
  state.player.cargo.capVolume = 100;
  state.player.cargo.capMass = 100;
  assert.equal(addCargo(state, 'cmdty_art', 1), 1);
  state.story.persistentCargo = ['cmdty_art'];
  assert.equal(addCargo(state, 'cmdty_munitions', 3), 3);

  const player = entityFrom(makeShipEntitySpec('ship_kestrel', {
    isPlayer: true,
    team: 0,
    pos: { x: origin.x, z: origin.z },
  }), 1);
  player.shield = 0;
  player.shieldMax = 0;
  player.armorHp = 0;
  player.armorMax = 0;
  state.playerId = player.id;
  state.entities.set(player.id, player);
  state.entityList.push(player);

  const bus = createBus();
  const events = [];
  for (const event of [
    'presentation:caption', 'ui:setCourse', 'factionPresence:administrativeRouting',
    'factionPresence:boardingPhase', 'combat:subsystemDisabled', 'combat:subsystemEnabled', 'tether:broken',
  ]) {
    bus.on(event, (payload) => events.push({ event, payload }));
  }
  const helpers = {
    spawnEntity(spec) {
      const entity = entityFrom(spec, state.nextEntityId++ + 10);
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      bus.emit('entity:spawned', { id: entity.id, entity });
      return entity;
    },
  };
  helpers.combatPhysics = { cutAttachment() { return true; } };
  const kernel = createCombatKernel({ state, bus, helpers });
  const worldRuntime = Object.create(world);
  worldRuntime.state = state;
  worldRuntime.bus = bus;
  const registry = {
    get(name) {
      if (name === 'world') return worldRuntime;
      if (name === 'combat') return { ensureKernel() { return kernel; } };
      return null;
    },
  };
  const presence = Object.create(factionPresence);
  presence.init({ state, bus, helpers, registry });
  bus.emit('sector:enter', { sectorId: 'sector_tethys_junction' });
  const convoy = state.entityList.filter((entity) => entity.factionId === 'faction_fulfillment');
  assert.equal(convoy.length, 3);
  const atlas = convoy.find((entity) => entity.data.defId === 'ship_atlas');
  assert.ok(atlas);
  assert.equal(atlas.data.weapons.some((weapon) => weapon.defId === 'wpn_emp_disruptor_m'), true,
    'authored Atlas route members carry the existing EMP fitting through normal ship slots');

  state.simTime = 1;
  presence.update(1 / 60, state);
  const anchorsAtOne = convoy.map((entity) => ({ ...entity.data.ai.activity.anchor }));
  state.simTime = 2;
  presence.update(1 / 60, state);
  const anchorsAtTwo = convoy.map((entity) => ({ ...entity.data.ai.activity.anchor }));
  assert.notDeepEqual(anchorsAtOne, anchorsAtTwo);

  const beforeSynthetic = state.player.cargo.items.cmdty_munitions;
  bus.emit('factionPresence:fulfillmentBoarding', {
    routeId: 'fulfillment_tethys_helios', commodityId: 'cmdty_munitions', quantity: 1,
  });
  assert.equal(state.player.cargo.items.cmdty_munitions, beforeSynthetic, 'synthetic boarding event is not an authority');

  const attacker = convoy[0];
  const provocation = kernel.routeDamage({
    attackerId: player.id,
    targetId: attacker.id,
    packet: { channels: { kinetic: 1 }, penetration: 0, shieldBypass: 0 },
    origin: { kind: 'test', id: 'player_provokes_fulfillment' },
  });
  assert.equal(provocation.ok, true);
  assert.equal(convoy.every((entity) => entity.data.ai.passive === false && entity.team === 1), true,
    'a real combat:damage event provokes the fixed-route convoy in Tethys');
  const provokedKind = attacker.data.ai.activity.kind;
  state.simTime += 0.5;
  presence.update(0.5, state);
  assert.equal(attacker.data.ai.activity.kind, provokedKind,
    'route-anchor updates preserve the offensive activity selected by provocation');

  state.settings.gameplay.difficulty = 'casual';
  const scaledControl = kernel.routeDamage({
    attackerId: atlas.id,
    targetId: player.id,
    packet: {
      channels: { ion: 10 },
      penetration: 0,
      shieldBypass: 1,
      subsystemShare: 1,
      hit: { subsystemId: 'subsystem_weapon' },
      source: { kind: 'legacy', id: 'difficulty-control' },
    },
    origin: { kind: 'test', id: 'difficulty-control' },
  });
  assert.equal(scaledControl.rawTotal, 4,
    'ordinary incoming subsystem damage retains the casual difficulty scale');
  const damage = kernel.routeDamage({
    attackerId: atlas.id,
    targetId: player.id,
    packet: {
      channels: { ion: 45 },
      penetration: 0,
      shieldBypass: 1,
      subsystemShare: 1,
      hit: { subsystemId: 'subsystem_drive' },
      source: { kind: 'weapon', weaponId: 'wpn_emp_disruptor_m' },
    },
    origin: { kind: 'weapon', id: 'wpn_emp_disruptor_m' },
  });
  assert.equal(damage.ok, true);
  assert.equal(damage.rawTotal, 45,
    'difficulty must not inflate or soften the canonical non-lethal EMP verb');
  assert.equal(damage.subsystemResult && damage.subsystemResult.after, 0, JSON.stringify(damage));
  state.tick += 1;
  kernel.prePhysics(1 / 60);
  const disabled = events.find((row) => row.event === 'combat:subsystemDisabled');
  assert.ok(disabled, JSON.stringify(kernel.inspect({ entityId: player.id })));
  assert.equal(disabled.payload.attackerId, atlas.id);
  assert.equal(state.factionPresence.boarding.phase, 'blackout');
  assert.equal(state.player.cargo.items.cmdty_munitions, 3);
  assert.equal(player.vel.x, 0);
  assert.equal(player.vel.z, 0);
  assert.equal(player.angVel, 0);

  state.combat.attachments.byId.att_player_target = {
    id: 'att_player_target', defId: 'attachment_massline', ownerId: attacker.id, targetId: player.id,
    state: 'active', physicsHandle: 99, createdTick: state.tick, brokenTick: null, breakReason: null,
    lastTension: 0, lastImpulse: 0,
  };

  state.simTime += 2;
  presence.update(2, state);
  assert.equal(state.factionPresence.boarding.phase, 'transit');
  assert.equal(state.player.cargo.items.cmdty_art, 1,
    'sorted persistent cargo is skipped rather than consuming the one administrative route attempt');
  assert.equal(state.player.cargo.items.cmdty_munitions, 2);
  state.simTime += 3;
  presence.update(3, state);
  assert.equal(state.factionPresence.boarding.phase, 'wake_pending');
  assert.deepEqual({ x: player.pos.x, z: player.pos.z }, state.factionPresence.boarding.holdingPos);
  assert.deepEqual({ x: player.prevPos.x, z: player.prevPos.z }, state.factionPresence.boarding.holdingPos);
  assert.equal(player.flags.noInterp, true);
  assert.equal(state.combat.attachments.byId.att_player_target.state, 'broken',
    'relocation breaks attachments even when the player is the target rather than owner');
  assert.equal(events.filter((row) => row.event === 'factionPresence:administrativeRouting').length, 1);
  assert.equal(events.find((row) => row.event === 'factionPresence:administrativeRouting').payload.commodityId,
    'cmdty_munitions', 'receipt names the first sorted removable cargo unit');
  assert.equal(events.some((row) => row.event === 'ui:setCourse' && row.payload.waypointKind === 'fulfillment_holding'), true);

  state.tick += 1;
  kernel.prePhysics(1 / 60);
  assert.equal(events.some((row) => row.event === 'combat:subsystemEnabled'
    && row.payload.targetId === player.id && row.payload.subsystemId === 'subsystem_drive'), true);
  assert.equal(state.factionPresence.boarding.phase, 'holding');
  assert.equal(convoy.every((entity) => entity.data.ai.passive === true && entity.team === 2), true);
  assert.equal(events.some((row) => row.event === 'presentation:caption'
    && row.payload.text === 'ROUTING COMPLETE. VARIANCE RESOLVED.'), true);
  assert.deepEqual(
    events.filter((row) => row.event === 'factionPresence:boardingPhase').map((row) => row.payload.phase),
    ['blackout', 'transit', 'wake_pending', 'holding'],
  );

  const saved = presence.serialize();
  assert.equal(saved.boarding.attackerId, undefined);
  assert.equal(saved.boarding.targetId, undefined);
  assert.equal(saved.receipts.some((receipt) => receipt.entityId != null), false);
  const restoredState = createGameState(0x47a);
  restoredState.playerId = 44;
  const restoredEvents = [];
  const restoredBus = createBus();
  restoredBus.on('factionPresence:boardingPhase', (payload) => restoredEvents.push(payload));
  const restored = Object.create(factionPresence);
  restored.init({ state: restoredState, bus: restoredBus, helpers: {}, registry: { get() { return null; } } });
  restored.deserialize(saved);
  assert.deepEqual(restoredState.factionPresence.boarding, state.factionPresence.boarding);
  assert.equal(restoredState.factionPresence.receipts.filter((row) => row.kind === 'administrativeRouting').length, 1);
  assert.equal(restoredEvents.at(-1).phase, 'holding');
});

test('Fulfillment incident semantics survive the real save envelope without transient entity ids', () => {
  const source = saveHarness(0x47a);
  source.presence.deserialize({
    sequence: 7,
    receipts: [{ sequence: 7, kind: 'administrativeRouting', entityId: 999, attackerId: 12, targetId: 1 }],
    boarding: {
      id: 'fulfillment_boarding_save_contract',
      phase: 'transit',
      routeId: 'fulfillment_tethys_helios',
      subsystemId: 'subsystem_drive',
      startedAt: 40,
      phaseStartedAt: 42,
      holdingPos: { x: 120, z: -80 },
      routed: true,
      attackerId: 999,
      targetId: source.state.playerId,
    },
  });
  const envelope = source.saveRuntime.serialize('k1_fulfillment');
  assert.ok(envelope.data.factionPresence, 'synchronous save envelope includes factionPresence');
  assert.equal(source.saveRuntime._saveCapturePlan().some(([key]) => key === 'factionPresence'), true,
    'bounded incremental capture includes the same semantic payload');
  assert.equal(envelope.data.factionPresence.boarding.attackerId, undefined);
  assert.equal(envelope.data.factionPresence.boarding.targetId, undefined);
  assert.equal(envelope.data.factionPresence.receipts[0].entityId, undefined);
  assert.equal(envelope.data.factionPresence.active, undefined);

  const restored = saveHarness(0x999);
  const phases = [];
  restored.bus.on('factionPresence:boardingPhase', (payload) => phases.push(payload));
  assert.equal(restored.saveRuntime.loadEnvelope(structuredClone(envelope), 'k1_fulfillment'), true);
  assert.deepEqual(restored.state.factionPresence.boarding, envelope.data.factionPresence.boarding);
  assert.equal(Object.values(restored.state.factionPresence.active).every((row) => restored.state.entities.has(row.entityId)), true,
    'world re-entry binds fresh runtime ids instead of restoring stale actor ids');
  assert.equal(phases.some((payload) => payload.phase === 'transit'), true,
    'restore rehydrates the semantic phase against the current player/run');
});

function saveHarness(seed) {
  const state = createGameState(seed);
  state.world.currentSectorId = 'sector_tethys_junction';
  const bus = createBus();
  const helpers = {};
  const coreRuntime = Object.create(core);
  const presence = Object.create(factionPresence);
  const worldRuntime = {
    serialize() { return { currentSectorId: state.world.currentSectorId }; },
    deserialize(data = {}) { state.world.currentSectorId = data.currentSectorId || 'sector_tethys_junction'; },
    enterSector(sectorId) {
      state.world.currentSectorId = sectorId;
      bus.emit('sector:enter', { sectorId });
    },
    relocatePlayerInSector(entryPoint) {
      const player = state.entities.get(state.playerId);
      if (!player) return false;
      player.pos.x = entryPoint.x;
      player.pos.z = entryPoint.z;
      player.prevPos.copy(player.pos);
      player.vel.setScalar(0);
      player.angVel = 0;
      player.flags.noInterp = true;
      return true;
    },
  };
  const registry = {
    get(name) {
      if (name === 'core') return coreRuntime;
      if (name === 'factionPresence') return presence;
      if (name === 'world') return worldRuntime;
      if (name === 'ships') return { recomputeActiveShip() {} };
      if (name === 'cargo') return { recompute() {} };
      return null;
    },
  };
  const ctx = { state, bus, helpers, registry };
  coreRuntime.init(ctx);
  presence.init(ctx);
  const player = helpers.spawnEntity(makeShipEntitySpec('ship_kestrel', {
    isPlayer: true,
    team: 0,
    pos: { x: 0, z: 0 },
  }));
  state.playerId = player.id;
  const saveRuntime = Object.create(save);
  saveRuntime.init(ctx);
  return { state, bus, helpers, presence, saveRuntime };
}
