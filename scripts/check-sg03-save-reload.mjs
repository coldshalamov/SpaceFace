import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { makeEntity } from '../src/core/entity.js';
import { createGameState } from '../src/core/gameState.js';
import { physics } from '../src/core/physics.js';
import { getCombatKernel } from '../src/combat/kernel.js';
import { save } from '../src/save/saveSystem.js';
import { CURRENT_VERSION } from '../src/data/saveVersion.js';

const DT = 1 / 60;

const source = makeHarness(0x4703);
source.state.mode = 'flight';
source.state.settings.gameplay.physicsBackend = 'rapier-dynamic';
source.state.world.currentSectorId = 'sector_47a_mass_discrepancy';
source.state.player.ownedShips = [{ defId: 'ship_kestrel', fittings: ['wpn_pulse_laser_s'] }];
source.state.player.activeShipIndex = 0;

const player = source.helpers.spawnEntity(makeCombatShipSpec({ team: 0, x: 0, role: 'player' }));
const target = source.helpers.spawnEntity(makeCombatShipSpec({ team: 1, x: 42, role: 'massline_target', persistent: true }));
source.state.playerId = player.id;

initCombatRuntime(source);
await ensurePhysicsReady(source);

requestAndStep(source, 0, { actorId: player.id, actionId: 'action_dash', source: { kind: 'player' } });
step(source, 1);
requestAndStep(source, 2, { actorId: player.id, actionId: 'action_attach', targetId: target.id, source: { kind: 'player' } });
step(source, 3);

const attachmentId = Object.keys(source.state.combat.attachments.byId)[0];
assert(attachmentId, 'attach should create a semantic Massline attachment before save');

requestAndStep(source, 4, { actorId: player.id, actionId: 'action_reel', attachmentId, source: { kind: 'player' } });
source.kernel.routeDamage({
  attackerId: target.id,
  targetId: player.id,
  packet: { channels: { ion: 3 }, penetration: 0, statuses: [{ id: 'status_ionized', stacks: 1 }] },
  origin: { kind: 'test', id: 'sg03-save-reload-active-status' },
});
step(source, 5);
source.kernel.routeDamage({
  attackerId: target.id,
  targetId: player.id,
  packet: { channels: { ion: 2 }, penetration: 0, statuses: [{ id: 'status_ionized', stacks: 1 }] },
  origin: { kind: 'test', id: 'sg03-save-reload-pending-status' },
});

const sourceRuntime = source.state.combat.entities[String(player.id)];
assert(sourceRuntime, 'player combat runtime should exist before save');
assert.equal(sourceRuntime.statuses.status_ionized.attackerId, target.id, 'active status should carry pre-save attacker id');
assert.equal(sourceRuntime.pendingStatuses[0].attackerId, target.id, 'pending status should carry pre-save attacker id');
assert(source.state.combat.statusNextPendingSeq > sourceRuntime.pendingStatuses[0].seq,
  'status pending sequence cursor should stay ahead of pending status records');
assert.equal(source.state.combat.actions.activeByActor[String(player.id)].actionId, 'action_reel',
  'save fixture should capture an active reel action');

const saved = withSaveRuntime(source, () => save.serialize('sg03-combat'));
assert.equal(saved.version, CURRENT_VERSION, 'SG-03 combat save should use the current save schema');
assert(saved.data.combat && saved.data.combat.schemaVersion === 1, 'save should include a versioned combat subtree');
assert.equal(saved.data.combat.attachments.byId[attachmentId].ownerRef.kind, 'player',
  'saved attachment should use semantic owner refs instead of raw ids');
assert.equal(saved.data.combat.attachments.byId[attachmentId].targetRef.saveId, String(target.id),
  'saved attachment should remember the persistent target save id for remap');
assert.equal(saved.data.combat.attachments.byId[attachmentId].physicsHandle, undefined,
  'saved attachment must not persist SG-02/Rapier handles');
assert.equal(saved.data.combat.statusNextPendingSeq, source.state.combat.statusNextPendingSeq,
  'save should persist the SG-03 pending-status sequence cursor');

const restored = makeHarness(0x9999, { spawnInterloperOnEnter: true });
const ok = withSaveRuntime(restored, () => save.loadEnvelope(saved, 'sg03-combat'));
assert.equal(ok, true, 'SG-03 combat save envelope should load');

initCombatRuntime(restored);
await ensurePhysicsReady(restored);
restored.kernel.postPhysics(DT);

const restoredPlayer = restored.state.entities.get(restored.state.playerId);
const restoredTarget = restored.state.entityList.find((entity) => entity.data && entity.data.scenarioRole === 'massline_target');
assert(restoredPlayer, 'load should restore the player entity');
assert(restoredTarget, 'load should restore the persistent Massline target');
assert.notEqual(restoredTarget.id, target.id, 'fixture should force persistent target id remapping');

const restoredAttachment = restored.state.combat.attachments.byId[attachmentId];
assert(restoredAttachment, 'load should restore the semantic attachment');
assert.equal(restoredAttachment.ownerId, restoredPlayer.id, 'attachment owner should remap to the loaded player id');
assert.equal(restoredAttachment.targetId, restoredTarget.id, 'attachment target should remap to the loaded persistent target id');
assert(restoredAttachment.physicsHandle, 'post-load reconcile should recreate the SG-02 physical rope handle');
assert.equal(restored.physics._sg02.diagnostics().attachments, 1, 'SG-02 owner should contain the reconciled physical rope');

const restoredActive = restored.state.combat.actions.activeByActor[String(restoredPlayer.id)];
assert(restoredActive, 'active action should restore under the loaded actor id');
assert.equal(restoredActive.actionId, 'action_reel', 'active reel should survive save/load');
assert.equal(restoredActive.target.attachmentId, attachmentId, 'active reel should still target the restored attachment');
assert.equal(restored.state.combat.actions.cooldownReadyTickByActor[String(restoredPlayer.id)].action_attach,
  source.state.combat.actions.cooldownReadyTickByActor[String(player.id)].action_attach,
  'cooldowns should survive under the remapped actor id');

const restoredRuntime = restored.state.combat.entities[String(restoredPlayer.id)];
assert.equal(restoredRuntime.heat, sourceRuntime.heat, 'combat heat should survive save/load');
assert.equal(restoredRuntime.statuses.status_ionized.attackerId, restoredTarget.id,
  'active status attacker id should remap to the loaded target id');
assert.equal(restoredRuntime.pendingStatuses[0].attackerId, restoredTarget.id,
  'pending status attacker id should remap to the loaded target id');
assert(restored.state.combat.statusNextPendingSeq > restoredRuntime.pendingStatuses[0].seq,
  'load should restore the status sequence cursor beyond pending status records');
assert(!restored.state.combat.trace.events.some((event) => String(event.reason || '').includes('physics_port_unavailable')),
  'post-load reconcile should not produce missing physics-port trace noise');

requestAndStep(restored, 6, { actorId: restoredPlayer.id, actionId: 'action_sling', attachmentId, source: { kind: 'player' } });
step(restored, 7);
requestAndStep(restored, 8, { actorId: restoredPlayer.id, actionId: 'action_cut', attachmentId, source: { kind: 'player' } });

assert.equal(restored.state.combat.attachments.byId[attachmentId].state, 'broken',
  'restored attachment should continue through the authored cut action');
assert.equal(restored.physics._sg02.diagnostics().attachments, 0,
  'cut should remove the reconciled physical rope from SG-02');

disposeHarness(source);
disposeHarness(restored);

console.log('SG-03 save/reload combat persistence checks OK');

function initCombatRuntime(harness) {
  const ctx = {
    state: harness.state,
    bus: harness.bus,
    helpers: harness.helpers,
    registry: harness.registry,
  };
  harness.physics = Object.create(physics);
  harness.physics.init(ctx);
  harness.kernel = getCombatKernel(ctx);
}

async function ensurePhysicsReady(harness) {
  harness.physics.update(DT, harness.state);
  if (harness.physics._sg02Init) await harness.physics._sg02Init;
  harness.physics.update(DT, harness.state);
  assert(harness.physics._sg02, 'rapier-dynamic owner should initialize for SG-03 save/reload fixture');
}

function requestAndStep(harness, tick, request) {
  harness.state.tick = tick;
  harness.state.simTime = tick * DT;
  harness.helpers.requestCombatAction(request);
  step(harness, tick);
}

function step(harness, tick) {
  harness.state.tick = tick;
  harness.state.simTime = tick * DT;
  harness.kernel.prePhysics(DT);
  harness.physics.update(DT, harness.state);
  harness.kernel.postPhysics(DT);
}

function disposeHarness(harness) {
  if (harness.kernel && typeof harness.kernel.dispose === 'function') harness.kernel.dispose();
  if (harness.physics && typeof harness.physics._disableSg02DynamicAuthority === 'function') {
    harness.physics._disableSg02DynamicAuthority();
  }
}

function withSaveRuntime(harness, fn) {
  save.state = harness.state;
  save.bus = harness.bus;
  save.helpers = harness.helpers;
  save.registry = harness.registry;
  return fn();
}

function makeHarness(seed, options = {}) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_47a_mass_discrepancy';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  const bus = createBus();
  const helpers = {
    spawnEntity(spec = {}) {
      const entity = makeEntity(spec);
      entity.id = state.nextEntityId++;
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      bus.emit('entity:spawned', { id: entity.id, type: entity.type, entity });
      return entity;
    },
    getEntity(id) {
      return state.entities.get(id) || null;
    },
  };

  const worldStub = {
    serialize() {
      return { currentSectorId: state.world.currentSectorId };
    },
    deserialize(data = {}) {
      state.world.currentSectorId = data.currentSectorId || 'sector_47a_mass_discrepancy';
    },
    enterSector(sectorId) {
      state.world.currentSectorId = sectorId;
      if (options.spawnInterloperOnEnter) {
        helpers.spawnEntity({
          type: 'asteroid',
          alive: true,
          collides: true,
          radius: 6,
          mass: 200,
          pos: { x: -120, z: 80 },
          vel: { x: 0, z: 0 },
          rot: 0,
          flags: {},
          data: { scenarioRole: 'restore_interloper' },
        });
      }
      const player = state.entities.get(state.playerId);
      if (player) {
        player.pos.set(999, 0, 999);
        player.prevPos.copy(player.pos);
        player.vel.set(0, 0, 0);
        player.rot = -2;
        player.prevRot = -2;
        player.angVel = 0;
      }
      bus.emit('sector:enter', { sectorId });
    },
  };

  const missionsStub = {
    serialize() {
      return { boards: {}, active: [], completedLog: [], nextId: 1, story: state.story };
    },
    deserialize(data = {}) {
      state.missions.boards = data.boards || {};
      state.missions.active = Array.isArray(data.active) ? data.active : [];
      state.missions.completedLog = Array.isArray(data.completedLog) ? data.completedLog : [];
      state.missions.nextId = data.nextId || 1;
      if (data.story) state.story = data.story;
    },
    spawnTargetsForSector() {},
  };

  const registry = {
    get(name) {
      return {
        economy: { serialize: () => ({}), deserialize() {} },
        factions: { serialize: () => ({}), deserialize() {} },
        world: worldStub,
        ships: { recomputeActiveShip() {} },
        cargo: { recompute() {} },
        missions: missionsStub,
        automation: { serialize: () => state.automation, deserialize(data) { state.automation = data || state.automation; } },
        crafting: { serialize: () => state.crafting, deserialize(data) { state.crafting = data || { queues: {} }; } },
        sectorSim: { serialize: () => state.sectorSim, deserialize(data) { state.sectorSim = data || state.sectorSim; } },
      }[name] || null;
    },
  };

  return { state, bus, helpers, registry, kernel: null, physics: null };
}

function makeCombatShipSpec({ team, x, role, persistent = false }) {
  return {
    type: 'ship',
    alive: true,
    collides: true,
    radius: 12,
    mass: 28,
    flightModel: { inertia: 88 },
    pos: { x, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    angVel: 0,
    team,
    factionId: `faction_sg03_${team}`,
    hull: 150,
    hullMax: 150,
    armorHp: 40,
    armorMax: 40,
    armorFlat: 2,
    shield: 50,
    shieldMax: 50,
    cap: 100,
    capMax: 100,
    capRegen: 5,
    lastDamageT: -1e9,
    flags: persistent ? { persistent: true } : {},
    data: {
      scenarioRole: role,
      derived: { damageReductionMult: 1 },
      combatProfileId: 'combat_profile_standard_ship',
    },
    physicsBody: {
      schemaVersion: 1,
      radius: 12,
      mass: 28,
      inertiaY: 88,
      dynamic: true,
      ccd: true,
      revision: 0,
    },
  };
}
