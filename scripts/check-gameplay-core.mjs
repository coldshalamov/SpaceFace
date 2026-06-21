import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { Masks } from '../src/core/entity.js';
import { createGameState } from '../src/core/gameState.js';
import { physics } from '../src/core/physics.js';
import { save } from '../src/save/saveSystem.js';
import { cargo } from '../src/systems/cargo.js';
import { mining } from '../src/systems/mining.js';
import { combat } from '../src/systems/combat.js';
import { crafting } from '../src/systems/crafting.js';
import { economy } from '../src/systems/economy.js';
import { flight } from '../src/systems/flight.js';
import { automation } from '../src/systems/automation.js';
import * as FlightDynamics from '../src/core/flightDynamics.js';
import { heat } from '../src/systems/heat.js';
import { missions } from '../src/systems/missions.js';
import { DEFAULTS as INPUT_DEFAULTS } from '../src/systems/input.js';
import { ships, buildSlotList, getDerivedStats, makeShipEntitySpec } from '../src/systems/ships.js';
import { world } from '../src/systems/world.js';
import { SHIPS } from '../src/data/ships.js';
import { NEW_GAME } from '../src/data/newGameDefaults.js';

function makeCargoState() {
  return {
    mode: 'flight',
    playerId: 1,
    simTime: 0,
    meta: { seed: 123, playtimeS: 0 },
    content: {},
    entities: new Map([[1, { id: 1, type: 'ship', alive: true }]]),
    entityList: [],
    player: {
      cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 10, capMass: 10 },
      moduleInventory: [],
    },
  };
}

function checkPickupSingleWriter() {
  const state = makeCargoState();
  const bus = createBus();
  const registry = { get: (name) => (name === 'cargo' ? cargo : null) };
  const ctx = { state, bus, helpers: {}, registry };

  mining.init(ctx);
  cargo.init(ctx);

  bus.emit('pickup:collected', {
    pickupId: 10,
    collectorId: state.playerId,
    kind: 'ore',
    amount: 1,
    commodityId: 'cmdty_ore_iron',
  });
  assert.equal(state.player.cargo.items.cmdty_ore_iron, 1, 'mined pickup should be added once');

  const direct = mining._giveCargo('cmdty_ore_iron', 2, state.playerId);
  assert.equal(direct, 2, 'direct-to-cargo mining should use cargo system writer');
  assert.equal(state.player.cargo.items.cmdty_ore_iron, 3, 'direct-to-cargo should not double add');

  bus.emit('pickup:collected', {
    pickupId: 11,
    collectorId: state.playerId,
    kind: 'module',
    amount: 2,
    commodityId: 'wpn_pulse_laser_s',
  });
  assert.equal(state.player.moduleInventory.length, 2, 'module pickups should enter module inventory');
}

function makeSaveState() {
  return {
    meta: { seed: 99, playtimeS: 5, createdAt: 'test' },
    save: { currentSlot: null },
    player: {
      credits: 0,
      cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 10, capMass: 10 },
    },
    economy: {},
    factions: {},
    world: { currentSectorId: null, sectors: {} },
    missions: { boards: {}, active: [], completedLog: [], nextId: 1 },
    story: { beatIndex: 0 },
    automation: { drones: [], meta: {} },
    crafting: { queues: {} },
    settings: {},
    entityList: [],
  };
}

function checkSaveDelegatesSystemHooks() {
  const state = makeSaveState();
  let missionPayload = null;
  let automationPayload = null;
  const systems = {
    economy: { serialize: () => ({}) },
    factions: { serialize: () => ({}) },
    world: { serialize: () => ({}) },
    missions: {
      serialize: () => ({
        boards: {},
        active: [{ id: 'm1', targetEntityIds: [], needsTargets: true }],
        completedLog: [],
        nextId: 2,
        story: { beatIndex: 1 },
      }),
      deserialize: (data) => { missionPayload = data; },
    },
    automation: {
      serialize: () => ({
        drones: [{ id: 'd1' }],
        meta: { rngSeed: 7 },
        nextId: 4,
      }),
      deserialize: (data) => {
        automationPayload = data;
        state.automation = { ...data, rng: () => 0.25 };
      },
    },
  };

  save.state = state;
  save.registry = { get: (name) => systems[name] || null };
  const data = save.serializeData();

  assert.equal(data.missions.nextId, 2, 'save should use missions.serialize');
  assert.equal(data.missions.missions, undefined, 'mission payload should not use legacy wrapper');
  assert.equal(data.automation.nextId, 4, 'save should use automation.serialize');

  save._restoreMissions({
    missions: { boards: { legacy: true }, active: [], completedLog: [], nextId: 9 },
    story: { beatIndex: 3 },
  });
  assert.equal(missionPayload.boards.legacy, true, 'legacy mission payload should be unwrapped');
  assert.equal(missionPayload.story.beatIndex, 3, 'legacy story payload should be preserved');

  save._restoreAutomation({ drones: [{ id: 'd2', entityIds: [99] }], meta: { rngSeed: 8 }, nextId: 5 });
  assert.equal(automationPayload.nextId, 5, 'automation restore should use automation.deserialize');
  assert.equal(typeof state.automation.rng, 'function', 'automation deserialize should rebuild rng function');
}

function checkSaveDelegatesCraftingHooks() {
  const state = makeSaveState();
  state.crafting = {
    queues: {
      station_alpha: { bpId: 'bp_build_pulse_laser_s', elapsed: 5, total: 20, done: false, stationId: 'station_alpha' },
    },
  };
  const systems = {
    economy: { serialize: () => ({}) },
    factions: { serialize: () => ({}) },
    world: { serialize: () => ({}) },
    missions: { serialize: () => ({ boards: {}, active: [], completedLog: [], nextId: 1, story: { beatIndex: 0 } }) },
    automation: { serialize: () => ({}) },
    crafting,
  };

  crafting.state = state;
  save.state = state;
  save.registry = { get: (name) => systems[name] || null };
  const data = save.serializeData();

  assert.equal(data.crafting.queues.station_alpha.bpId, 'bp_build_pulse_laser_s', 'save should use crafting.serialize');
  assert.equal(data.crafting.queues.station_alpha.elapsed, 5, 'save should preserve queued crafting progress');

  save._restoreCrafting({
    queues: {
      station_beta: { bpId: 'bp_build_cargopod_m', elapsed: 3, total: 20, done: false, stationId: 'station_beta' },
    },
  });
  assert.equal(state.crafting.queues.station_beta.bpId, 'bp_build_cargopod_m', 'crafting restore should use crafting.deserialize');
  assert.equal(state.crafting.queues.station_beta.elapsed, 3, 'crafting restore should preserve queue progress');

  save._restoreCrafting(undefined);
  assert.deepEqual(state.crafting.queues, {}, 'missing legacy crafting payload should clear live crafting queues');
}

function checkSaveScrubsTransientFlightState() {
  const state = makeSaveState();
  const playerShip = {
    id: 7,
    type: 'ship',
    alive: true,
    pos: { x: 12, z: -34, isVector3: true },
    prevPos: { x: 99, z: 99, isVector3: true },
    vel: { x: 45, z: -6, isVector3: true },
    rot: 1.25,
    prevRot: -0.5,
    angVel: 2.75,
    bank: 0.42,
    bankVel: -0.8,
    hull: 88,
    flags: { persistent: true, boosting: true, noInterp: true, invuln: true },
    boost: {
      energy: 63,
      max: 100,
      drainRate: 38,
      regenRate: 22,
      dashImpulse: 160,
      dashCd: 2,
      dashCdT: 0.75,
      _boostHoldT: 0.25,
      _dashCandidate: true,
      _boostArmed: true,
    },
    _flightFrame: { speed: 120, lateralSlip: 90 },
    _wasBoosting: true,
  };
  state.playerId = playerShip.id;
  state.entities = new Map([[playerShip.id, playerShip]]);
  state.entityList = [playerShip];
  save.state = state;
  save.registry = { get: () => null };

  const savedPlayer = save.serializeData().entities.player;

  assert.equal(savedPlayer.pos.x, 12, 'save should keep authoritative player position');
  assert.equal(savedPlayer.vel.x, 45, 'save should keep authoritative player velocity');
  assert.equal(savedPlayer.rot, 1.25, 'save should keep authoritative player heading');
  assert.equal(savedPlayer.hull, 88, 'save should keep persistent player vitals');
  assert.equal(savedPlayer.flags.persistent, true, 'save should keep persistent entity flags');
  assert.equal(savedPlayer.flags.invuln, true, 'save should keep non-flight gameplay flags');
  assert.equal(savedPlayer.flags.boosting, undefined, 'save should drop transient sustained boost flag');
  assert.equal(savedPlayer.flags.noInterp, undefined, 'save should drop transient interpolation flag');
  assert.equal(savedPlayer.boost.energy, 63, 'save should keep public boost resource state');
  assert.equal(savedPlayer.boost.dashCdT, 0.75, 'save should keep public boost cooldown state');
  assert.equal(savedPlayer.boost._boostHoldT, undefined, 'save should drop private boost hold timer');
  assert.equal(savedPlayer.boost._dashCandidate, undefined, 'save should drop private dash gesture state');
  assert.equal(savedPlayer.boost._boostArmed, undefined, 'save should drop private boost edge state');
  assert.equal(savedPlayer.prevPos, undefined, 'save should drop interpolation position history');
  assert.equal(savedPlayer.prevRot, undefined, 'save should drop interpolation rotation history');
  assert.equal(savedPlayer.angVel, undefined, 'save should drop angular velocity so loads do not keep spinning');
  assert.equal(savedPlayer.bank, undefined, 'save should drop decorative bank pose');
  assert.equal(savedPlayer.bankVel, undefined, 'save should drop decorative bank spring velocity');
  assert.equal(savedPlayer._flightFrame, undefined, 'save should drop derived diagnostics frame');
  assert.equal(savedPlayer._wasBoosting, undefined, 'save should drop private flight runtime flags');
}

function checkMissionCompletionAutosaveSeesSettledState() {
  const state = {
    mode: 'flight',
    meta: { seed: 99, playtimeS: 25, createdAt: 'test', lastSavedAt: '' },
    save: { currentSlot: null },
    playerId: 0,
    simTime: 10,
    tick: 3,
    player: {
      credits: 0,
      researchPoints: 0,
      cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 10, capMass: 10 },
      stats: { missionsDone: 0 },
    },
    economy: {},
    factions: {},
    world: { currentSectorId: null, sectors: {} },
    missions: { boards: {}, active: [], completedLog: [], nextId: 2, config: null },
    story: { beatIndex: 0, branch: null, flags: {}, chainProgress: 0 },
    automation: { drones: [], meta: {} },
    settings: {},
    ui: { trackedMissionId: null },
    entities: new Map(),
    entityList: [],
  };
  const mission = {
    id: 'm_autosave',
    type: 'recon_scan',
    factionId: 'faction_scn',
    params: {},
    status: 'active',
    reward_cr: 120,
    collateral_cr: 0,
    riskTier: 1,
    targetEntityIds: [],
    title: 'Scan the Ghost Lane',
  };
  state.missions.active.push(mission);

  const bus = createBus();
  const systems = {
    economy: { serialize: () => ({}) },
    factions: { serialize: () => ({}) },
    world: { serialize: () => ({}) },
    missions,
    automation: { serialize: () => ({}) },
  };
  save.state = state;
  save.bus = bus;
  save.registry = { get: (name) => systems[name] || null };
  missions.init({ state, bus, helpers: {}, registry: save.registry });

  let autosaveData = null;
  bus.on('mission:completed', () => { autosaveData = save.serializeData(); });

  missions._completeMission(mission, 0);

  assert.equal(state.missions.active.length, 0, 'completed mission should leave active missions immediately');
  assert.equal(state.player.researchPoints, 4, 'recon completion should award research points before completion autosave');
  assert.equal(autosaveData.player.researchPoints, 4, 'mission-completed autosave should include research point rewards');
  assert.equal(autosaveData.player.stats.missionsDone, 1, 'mission-completed autosave should include mission stats');
  assert.equal(autosaveData.missions.active.length, 0, 'mission-completed autosave should not persist a completed mission as active');
  assert.equal(autosaveData.missions.completedLog[0].type, 'recon_scan', 'mission-completed autosave should include completion log');
  assert.equal(autosaveData.missions.story.beatIndex, 0, 'mission-completed autosave should include settled story state');
}

function checkLoadDoesNotSpawnTargetsForStaleLiveMissions() {
  const makeVec = (x = 0, z = 0) => ({
    x,
    y: 0,
    z,
    set(nx, ny, nz) { this.x = nx; this.y = ny || 0; this.z = nz; return this; },
    copy(pos) { this.x = pos.x; this.y = pos.y || 0; this.z = pos.z; return this; },
  });
  const state = {
    mode: 'flight',
    meta: { seed: 7, playtimeS: 1, createdAt: 'old', lastSavedAt: '' },
    save: { currentSlot: 'old' },
    playerId: 1,
    simTime: 5,
    tick: 2,
    player: {
      credits: 0,
      cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 10, capMass: 10 },
      ownedShips: [{ defId: 'ship_kestrel', fittings: [] }],
      activeShipIndex: 0,
      moduleInventory: [],
      targetId: null,
      stats: { missionsDone: 0 },
    },
    economy: {},
    factions: {},
    world: { currentSectorId: 'sector_ceres_belt', sectors: {}, activeSector: {}, discovery: {}, pendingSpawns: {} },
    jump: { state: 'IDLE', targetSectorId: null, via: null, chargeT: 0, chargeNeeded: 0, cooldownT: 0 },
    fuel: { current: 100, max: 100 },
    nav: { route: null, autoTravel: false },
    missions: {
      boards: {},
      active: [{
        id: 'm_stale',
        type: 'bounty_hunt',
        factionId: 'faction_scn',
        params: {},
        status: 'active',
        objectiveProgress: 0,
        objectiveTarget: 1,
        reward_cr: 0,
        collateral_cr: 0,
        riskTier: 0,
        destSectorId: 'sector_helios_prime',
        targetEntityIds: [],
        needsTargets: true,
        title: 'Old Target',
      }],
      completedLog: [],
      nextId: 2,
      config: null,
    },
    story: { beatIndex: 0, branch: null, flags: {}, chainProgress: 0 },
    automation: { drones: [], meta: {} },
    settings: {},
    ui: { trackedMissionId: 'm_stale' },
    entities: new Map(),
    entityList: [],
    freeIds: [],
    nextEntityId: 1,
    rng: () => 0.5,
  };
  const bus = createBus();
  const helpers = {
    spawnEntity(spec) {
      const ent = {
        id: state.nextEntityId++,
        ...spec,
        alive: spec.alive !== false,
        flags: spec.flags || {},
        data: spec.data || {},
        pos: makeVec(spec.pos && spec.pos.x, spec.pos && spec.pos.z),
        prevPos: makeVec(spec.pos && spec.pos.x, spec.pos && spec.pos.z),
        vel: makeVec(spec.vel && spec.vel.x, spec.vel && spec.vel.z),
        rot: spec.rot || 0,
        prevRot: spec.rot || 0,
      };
      state.entities.set(ent.id, ent);
      state.entityList.push(ent);
      return ent;
    },
    getEntity(id) { return state.entities.get(id); },
    player() { return state.entities.get(state.playerId); },
    hash32() { return 1; },
    mulberry32() { return () => 0.5; },
  };
  const worldStub = {
    serialize: () => ({}),
    deserialize(data) {
      state.world.currentSectorId = data && data.currentSectorId;
    },
    enterSector(sectorId) {
      state.world.currentSectorId = sectorId;
      bus.emit('sector:enter', { sectorId });
    },
  };
  const registry = {
    get(name) {
      return {
        economy: { serialize: () => ({}), deserialize() {} },
        factions: { serialize: () => ({}), deserialize() {} },
        world: worldStub,
        ships: { recomputeActiveShip() {} },
        cargo: { recompute() {} },
        missions,
        automation: { serialize: () => ({}), deserialize() {} },
      }[name] || null;
    },
  };
  const savedData = {
    meta: { seed: 11, playtimeS: 9, createdAt: 'save', lastSavedAt: 'save' },
    player: {
      credits: 10,
      ownedShips: [{ defId: 'ship_kestrel', fittings: [] }],
      activeShipIndex: 0,
      moduleInventory: [],
      targetId: null,
      stats: { missionsDone: 0 },
    },
    cargo: { items: {}, capVolume: 10, capMass: 10 },
    economy: {},
    factions: {},
    world: { currentSectorId: 'sector_helios_prime' },
    entities: {
      player: {
        type: 'ship',
        alive: true,
        pos: { x: 0, z: 0 },
        vel: { x: 0, z: 0 },
        rot: 0,
        flags: {},
        data: { defId: 'ship_kestrel' },
        hull: 100,
        hullMax: 100,
        shield: 20,
        shieldMax: 20,
        cap: 30,
        capMax: 30,
      },
      persistent: [],
      simTime: 9,
      tick: 4,
    },
    missions: {
      boards: {},
      active: [],
      completedLog: [],
      nextId: 1,
      story: { beatIndex: 0, branch: null, flags: {}, chainProgress: 0 },
    },
    automation: {},
    settings: {},
  };

  save.state = state;
  save.bus = bus;
  save.helpers = helpers;
  save.registry = registry;
  missions.init({ state, bus, helpers, registry });

  save._restore(savedData, 'loaded');

  assert.equal(state.missions.active.length, 0, 'loaded save should restore its empty active mission list');
  assert(!state.entityList.some((e) => e.data && e.data.missionTag === 'm_stale'), 'load should not spawn targets for stale pre-load missions');
  assert.equal(state.ui.trackedMissionId, null, 'load should not keep tracking a stale pre-load mission');
}

function checkLoadRestoresPersistentEntities() {
  const makeVec = (x = 0, z = 0) => ({
    x,
    y: 0,
    z,
    set(nx, ny, nz) { this.x = nx; this.y = ny || 0; this.z = nz; return this; },
    copy(pos) { this.x = pos.x; this.y = pos.y || 0; this.z = pos.z; return this; },
  });
  const state = {
    mode: 'flight',
    timeScale: 1,
    meta: { seed: 7, playtimeS: 1, createdAt: 'old', lastSavedAt: '' },
    save: { currentSlot: 'old' },
    playerId: 1,
    simTime: 5,
    tick: 2,
    player: {
      credits: 0,
      cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 10, capMass: 10 },
      ownedShips: [{ defId: 'ship_kestrel', fittings: [] }],
      activeShipIndex: 0,
      moduleInventory: [],
      targetId: 88,
      stats: { missionsDone: 0 },
    },
    economy: {},
    factions: {},
    world: { currentSectorId: 'sector_ceres_belt', sectors: {}, activeSector: {}, discovery: {}, pendingSpawns: {} },
    missions: { boards: {}, active: [], completedLog: [], nextId: 1, config: null },
    story: { beatIndex: 0, branch: null, flags: {}, chainProgress: 0 },
    automation: { drones: [], meta: {} },
    crafting: { queues: {} },
    settings: {},
    ui: { trackedMissionId: null },
    entities: new Map(),
    entityList: [],
    freeIds: [],
    nextEntityId: 1,
    rng: () => 0.5,
  };
  const stale = { id: 1, type: 'ship', alive: true, pos: makeVec(999, 999), radius: 8, flags: {}, data: {} };
  state.entities.set(stale.id, stale);
  state.entityList.push(stale);
  const bus = createBus();
  const helpers = {
    spawnEntity(spec) {
      const ent = {
        id: state.nextEntityId++,
        ...spec,
        alive: spec.alive !== false,
        flags: Object.assign({}, spec.flags),
        data: spec.data || {},
        pos: makeVec(spec.pos && spec.pos.x, spec.pos && spec.pos.z),
        prevPos: makeVec(spec.pos && spec.pos.x, spec.pos && spec.pos.z),
        vel: makeVec(spec.vel && spec.vel.x, spec.vel && spec.vel.z),
        rot: spec.rot || 0,
        prevRot: spec.rot || 0,
      };
      state.entities.set(ent.id, ent);
      state.entityList.push(ent);
      return ent;
    },
    getEntity(id) { return state.entities.get(id); },
    player() { return state.entities.get(state.playerId); },
    hash32() { return 1; },
    mulberry32() { return () => 0.5; },
  };
  const registry = {
    get(name) {
      return {
        economy: { deserialize() {} },
        factions: { deserialize() {} },
        world: {
          deserialize(data) { state.world.currentSectorId = data && data.currentSectorId; },
          enterSector(sectorId) {
            for (let i = state.entityList.length - 1; i >= 0; i--) {
              const e = state.entityList[i];
              if (e.id === state.playerId) continue;
              state.entities.delete(e.id);
              state.entityList.splice(i, 1);
            }
            state.world.currentSectorId = sectorId;
          },
        },
        ships: { recomputeActiveShip() {} },
        cargo: { recompute() {} },
        automation: { deserialize(data) { state.automation = data || {}; } },
        crafting: { deserialize(data) { state.crafting = data || { queues: {} }; } },
        sectorSim: { deserialize() {} },
      }[name] || null;
    },
  };
  const savedData = {
    meta: { seed: 11, playtimeS: 9, createdAt: 'save', lastSavedAt: 'save' },
    player: {
      credits: 10,
      ownedShips: [{ defId: 'ship_kestrel', fittings: [] }],
      activeShipIndex: 0,
      moduleInventory: [],
      targetId: 88,
      stats: { missionsDone: 0 },
    },
    cargo: { items: {}, capVolume: 10, capMass: 10 },
    economy: {},
    factions: {},
    world: { currentSectorId: 'sector_helios_prime' },
    entities: {
      player: {
        type: 'ship',
        alive: true,
        pos: { x: 5, z: -7 },
        vel: { x: 1, z: 2 },
        rot: 0.25,
        flags: {},
        data: { defId: 'ship_kestrel' },
        hull: 100,
        hullMax: 100,
        shield: 20,
        shieldMax: 20,
        cap: 30,
        capMax: 30,
      },
      persistent: [{
        id: 99,
        type: 'ship',
        alive: true,
        team: 1,
        factionId: 'faction_reavers',
        pos: { x: 120, z: -35 },
        vel: { x: 3, z: 4 },
        rot: 1.5,
        radius: 22,
        hull: 12,
        hullMax: 40,
        armorHp: 3,
        shield: 7,
        cap: 2,
        flags: { persistent: true, invuln: true },
        data: { defId: 'ship_wasp', role: 'target_dummy' },
      }],
      simTime: 9,
      tick: 4,
    },
    missions: { boards: {}, active: [], completedLog: [], nextId: 1, story: { beatIndex: 0 } },
    automation: {},
    crafting: { queues: {} },
    settings: {},
  };

  save.state = state;
  save.bus = bus;
  save.helpers = helpers;
  save.registry = registry;

  save._restore(savedData, 'loaded');

  const restored = state.entityList.find((e) => e.data && e.data.role === 'target_dummy');
  assert(restored, 'load should restore saved persistent entities');
  assert.notEqual(restored.id, 99, 'load should assign persistent entities fresh ids');
  assert.equal(restored.pos.x, 120, 'restored persistent entity should keep position');
  assert.equal(restored.vel.z, 4, 'restored persistent entity should keep velocity');
  assert.equal(restored.rot, 1.5, 'restored persistent entity should keep heading');
  assert.equal(restored.hull, 12, 'restored persistent entity should keep hull');
  assert.equal(restored.armorHp, 3, 'restored persistent entity should keep armor');
  assert.equal(restored.shield, 7, 'restored persistent entity should keep shields');
  assert.equal(restored.flags.persistent, true, 'restored persistent entity should remain persistent');
  assert.equal(restored.flags.invuln, true, 'restored persistent entity should keep gameplay flags');
  assert.equal(restored.flags.noInterp, true, 'restored persistent entity should skip interpolation on load');
  assert.equal(state.player.targetId, null, 'load should still clear stale player target references');
  assert.equal(state.tick, 4, 'load should restore saved sim tick');
  assert(!state.entityList.includes(stale), 'load should clear stale live entities before restore');
}

function checkLoadRejectsSaveWithoutPlayerEntity() {
  const state = {
    mode: 'flight',
    timeScale: 1,
    meta: { seed: 7, playtimeS: 1, createdAt: 'old', lastSavedAt: '' },
    save: { currentSlot: 'old' },
    playerId: 1,
    simTime: 5,
    tick: 2,
    player: {
      credits: 50,
      cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 10, capMass: 10 },
    },
    economy: {},
    factions: {},
    world: { currentSectorId: 'sector_helios_prime', sectors: {} },
    missions: { boards: {}, active: [], completedLog: [], nextId: 1, config: null },
    story: { beatIndex: 0 },
    automation: { drones: [], meta: {} },
    settings: {},
    ui: { trackedMissionId: null },
    entities: new Map(),
    entityList: [],
    freeIds: [],
    nextEntityId: 2,
    rng: () => 0.5,
  };
  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    pos: { x: 12, y: 0, z: -4 },
    radius: 4,
    factionId: 'faction_player',
  };
  state.entities.set(1, player);
  state.entityList.push(player);
  const events = [];

  save.state = state;
  save.bus = { emit(event, payload) { events.push({ event, payload }); } };
  save.helpers = {};
  save.registry = { get() { return null; } };

  const ok = save.loadEnvelope({
    fmt: 'spaceface-save',
    version: 1,
    slot: 'bad',
    data: {
      meta: { seed: 9, playtimeS: 9, createdAt: 'bad', lastSavedAt: 'bad' },
      player: { credits: 999 },
      cargo: { items: {}, capVolume: 10, capMass: 10 },
      economy: {},
      factions: {},
      world: { currentSectorId: 'sector_ceres_belt' },
      entities: { persistent: [], simTime: 9, tick: 4 },
      missions: { boards: {}, active: [], completedLog: [], nextId: 1, story: { beatIndex: 0 } },
      automation: {},
      settings: {},
    },
  }, 'bad');

  assert.equal(ok, false, 'save without a player entity should be rejected');
  assert.equal(state.playerId, 1, 'rejected playerless save should not clear the live player id');
  assert.equal(state.entities.get(1), player, 'rejected playerless save should leave live entities untouched');
  assert(events.some((e) => e.event === 'save:error' && e.payload.reason === 'no_player'), 'playerless save should emit no_player');
}

function checkCombatRewardsAndLootKinds() {
  const grants = [];
  const spawned = [];
  const events = [];
  const state = {
    playerId: 1,
    simTime: 42,
    entities: new Map(),
  };
  const killer = { id: 1, type: 'ship', team: 0, alive: true };
  const target = {
    id: 2,
    type: 'ship',
    team: 1,
    alive: true,
    factionId: 'faction_vael',
    pos: { x: 10, z: -5 },
    data: {
      bountyCr: 50,
      lootTableId: 'test_loot',
      shipClass: 'fighter',
      loot: {
        creditsRange: [7, 7],
        guaranteed: [{ id: 'wpn_pulse_laser_s', qtyRange: [1, 1] }],
      },
    },
  };
  state.entities.set(killer.id, killer);
  state.entities.set(target.id, target);

  combat.state = state;
  combat.bus = {
    emit(event, payload) {
      events.push({ event, payload });
      if (event === 'economy:grantCredits') grants.push(payload);
    },
  };
  combat.helpers = {
    spawnEntity(spec) {
      spawned.push(spec);
      return { id: 100 + spawned.length, ...spec };
    },
  };
  combat.rng = () => 0;

  combat.kill(target, killer.id);

  assert.equal(target.alive, false, 'killed target should be marked dead');
  assert(grants.some((g) => g.amount === 50 && g.reason === 'bounty'), 'authored bounty should pay out');
  assert(grants.some((g) => g.amount === 7 && g.reason === 'loot'), 'loot credits should still pay out');
  assert.equal(spawned[0].data.kind, 'module', 'weapon loot should spawn as module pickup');
  assert(events.some((e) => e.event === 'entity:killed' && e.payload.bountyCr === 50), 'kill event should carry bounty');

  const npcGrants = [];
  const npcEvents = [];
  const npcState = {
    playerId: 1,
    simTime: 43,
    entities: new Map(),
  };
  const npcKiller = { id: 99, type: 'ship', team: 1, alive: true };
  const npcTarget = {
    id: 100,
    type: 'ship',
    team: 2,
    alive: true,
    pos: { x: 0, z: 0 },
    data: {
      bountyCr: 50,
      loot: {
        creditsRange: [7, 7],
        guaranteed: [{ id: 'cmdty_scrap_metal', qtyRange: [1, 1] }],
      },
    },
  };
  npcState.entities.set(npcKiller.id, npcKiller);
  npcState.entities.set(npcTarget.id, npcTarget);

  combat.state = npcState;
  combat.bus = {
    emit(event, payload) {
      npcEvents.push({ event, payload });
      if (event === 'economy:grantCredits') npcGrants.push(payload);
    },
  };
  combat.helpers = { spawnEntity: (spec) => spec };
  combat.rng = () => 0;

  combat.kill(npcTarget, npcKiller.id);

  assert.equal(npcGrants.length, 0, 'NPC-on-NPC kills should not pay player bounty or loot credits');
  assert(npcEvents.some((e) => e.event === 'loot:drop' && e.payload.credits === 0), 'NPC-on-NPC loot drop should not show player credits');
}

function checkHeatUsesTargetFactionContext() {
  const makeState = (target) => {
    const state = {
      playerId: 1,
      simTime: 10,
      player: { heat: 0 },
      factions: {
        faction_vael: { aggro: true },
        faction_scn: { aggro: true },
      },
      entities: new Map(),
    };
    const player = { id: 1, type: 'ship', team: 0, alive: true, flags: {}, pos: { x: 0, z: 0 }, data: {} };
    state.entities.set(player.id, player);
    state.entities.set(target.id, target);
    return state;
  };

  const hostile = {
    id: 2,
    type: 'ship',
    team: 1,
    alive: true,
    flags: {},
    factionId: 'faction_vael',
    pos: { x: 10, z: 0 },
    data: { ai: { lawful: false } },
    hull: 100,
    shieldMax: 0,
    shield: 0,
    armorHp: 0,
  };
  const hostileState = makeState(hostile);
  const hostileBus = createBus();
  heat.init({ state: hostileState, bus: hostileBus, helpers: {}, registry: { get() { return null; } } });
  combat.state = hostileState;
  combat.bus = hostileBus;

  combat.onHit({ targetId: hostile.id, ownerId: hostileState.playerId, damage: 5, damageType: 'kinetic', pos: { x: 10, z: 0 } });

  assert.equal(hostileState.player.heat, 0, 'damaging an already-hostile faction should not raise piracy heat');

  const lawman = {
    id: 3,
    type: 'ship',
    team: 1,
    alive: true,
    flags: {},
    factionId: 'faction_scn',
    pos: { x: 20, z: 0 },
    data: { ai: { lawful: true }, shipClass: 'gunship' },
    hull: 100,
  };
  const lawState = makeState(lawman);
  const lawBus = createBus();
  heat.init({ state: lawState, bus: lawBus, helpers: {}, registry: { get() { return null; } } });
  combat.state = lawState;
  combat.bus = lawBus;

  combat.kill(lawman, lawState.playerId);

  assert(lawState.player.heat > 0, 'killing a lawful patrol should raise heat even if its faction is already hostile');
}

function checkInsuredRespawnUsesStationRefundAndCargoLoss() {
  const makeVec = (x, z) => ({
    x,
    y: 0,
    z,
    set(nx, ny, nz) { this.x = nx; this.y = ny || 0; this.z = nz; return this; },
    copy(pos) { this.x = pos.x; this.y = pos.y || 0; this.z = pos.z; return this; },
  });
  const state = {
    playerId: 1,
    simTime: 42,
    player: {
      credits: 100,
      insurance: { rate: 0.6, deductibleCr: 500, insuredModules: true, lastStationId: 'station_helios' },
      ownedShips: [{ defId: 'ship_pelican', fittings: ['mod_cargo_pod_m', 'wpn_pulse_laser_s'] }],
      activeShipIndex: 0,
      cargo: {
        items: { cmdty_ore_iron: 5, cmdty_ice_water: 3 },
        usedVolume: 9.2,
        usedMass: 5.5,
        capVolume: 100,
        capMass: 100,
      },
    },
    entities: new Map(),
    world: {
      currentSectorId: 'sector_helios_prime',
      activeSector: {
        stations: [{ stationId: 'station_helios', pos: { x: 320, z: -80 } }],
      },
    },
  };
  const player = {
    id: 1,
    type: 'ship',
    pos: makeVec(10, 10),
    prevPos: makeVec(10, 10),
    vel: makeVec(5, -3),
    flags: {},
    data: { defId: 'ship_pelican' },
    hull: 0,
    hullMax: 180,
    shield: 0,
    shieldMax: 60,
    cap: 0,
    capMax: 110,
  };
  state.entities.set(player.id, player);
  const events = [];

  combat.state = state;
  combat.bus = { emit: (event, payload) => events.push({ event, payload }) };

  combat.respawnPlayer(player, 99);

  const respawn = events.find((e) => e.event === 'player:respawn');
  const refund = events.find((e) => e.event === 'economy:grantCredits' && e.payload.reason === 'insurance:respawn');
  assert(respawn, 'insured death should emit player:respawn');
  assert(refund, 'insured respawn should emit an insurance refund credit event');
  assert.equal(respawn.payload.stationId, 'station_helios', 'insured respawn should use the last insured station');
  assert.equal(respawn.payload.refundCr, 18400, 'insured respawn should report the net insurance refund');
  assert.equal(refund.payload.amount, 18400, 'insurance refund should route through economy');
  assert.equal(respawn.payload.cargoLost, true, 'insured respawn should report cargo loss');
  assert.equal(respawn.payload.cargoLostQty, 3, 'insured respawn should report lost cargo units');
  assert.equal(state.player.cargo.items.cmdty_ore_iron, 3, 'respawn should lose half of iron cargo');
  assert.equal(state.player.cargo.items.cmdty_ice_water, 2, 'respawn should lose half of ice cargo');
  assert.equal(player.pos.x, 320, 'respawn should move player to the last station x position');
  assert.equal(player.pos.z, -80, 'respawn should move player to the last station z position');
  assert.equal(player.hull, player.hullMax, 'respawn should restore hull');
  assert.equal(player.shield, player.shieldMax, 'respawn should restore shield');
  assert.equal(player.cap, player.capMax, 'respawn should restore capacitor');
}

function checkFailedCargoFitDoesNotDuplicateModules() {
  const atlas = SHIPS.find((s) => s.id === 'ship_atlas');
  const slots = buildSlotList(atlas);
  const cargoSlotIndex = slots.findIndex((s) => s.type === 'cargo' && s.size === 'L');
  assert(cargoSlotIndex >= 0, 'atlas should have an L cargo slot');

  const fittings = new Array(slots.length).fill(null);
  fittings[cargoSlotIndex] = 'mod_cargo_compactor_l';
  const inventoryItem = { instanceId: 'mi_try_expander', defId: 'mod_cargo_expander_l' };
  const state = {
    playerId: 1,
    tick: 10,
    player: {
      ownedShips: [{ defId: 'ship_atlas', fittings }],
      activeShipIndex: 0,
      cargo: {
        items: { cmdty_silicate: 650 },
        usedVolume: 650,
        usedMass: 650,
        capVolume: 678,
        capMass: 999,
      },
      moduleInventory: [inventoryItem],
      researchedNodes: ['tech_bulk_logistics', 'tech_matter_compression'],
      efficiencyMods: { miningYieldMult: 1, shieldRegenMult: 1, energyRegenMult: 1, cargoCapMult: 1, tradeFeeMult: 1 },
    },
    entities: new Map(),
  };
  const events = [];

  ships.state = state;
  ships.bus = { emit: (event, payload) => events.push({ event, payload }) };

  const fitted = ships.fitModule({ slotIndex: cargoSlotIndex, instanceId: inventoryItem.instanceId });

  assert.equal(fitted, false, 'overflowing replacement fit should be rejected');
  assert.equal(fittings[cargoSlotIndex], 'mod_cargo_compactor_l', 'failed fit should restore the previous module');
  assert.deepEqual(state.player.moduleInventory, [inventoryItem], 'failed fit should restore inventory without duplicating the fitted module');
  assert(events.some((e) => e.event === 'toast' && e.payload.kind === 'error'), 'failed fit should notify the player');
}

function checkNewGameOwnedShipDefaultsAreFitted() {
  const state = {
    player: {},
    entities: new Map(),
    playerId: 1,
  };
  const events = [];

  ships.state = state;
  ships.bus = { emit: (event, payload) => events.push({ event, payload }) };

  ships.newGame();

  const owned = state.player.ownedShips[state.player.activeShipIndex];
  assert.equal(owned.defId, NEW_GAME.shipId, 'new game should own the configured starter ship');
  for (const defId of NEW_GAME.fittedModules) {
    assert(owned.fittings.includes(defId), `new game should fit default module ${defId}`);
  }

  const spec = makeShipEntitySpec(owned.defId, {
    team: 0,
    isPlayer: true,
    player: state.player,
    fittings: owned.fittings,
  });
  assert(spec.data.weapons.length >= 1, 'starter player ship should have a weapon runtime');
  assert.equal(spec.data.miningBeam.tierId, 'beam_mk1', 'starter mining laser should resolve to beam_mk1');
  assert.equal(spec.data.derived.cargoCap, NEW_GAME.cargoCapacity, 'starter cargo cap should match new-game data');
}

function checkAmmoServiceOnlyChargesAcceptedCargo() {
  const state = {
    playerId: 1,
    player: {
      credits: 1000,
      cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 1, capMass: 999 },
    },
  };
  const events = [];
  const bus = {
    on() {},
    emit(event, payload) { events.push({ event, payload }); },
  };

  cargo.init({ state, bus, helpers: {}, registry: { get: (name) => (name === 'cargo' ? cargo : null) } });
  economy.state = state;
  economy.bus = bus;

  economy.handleService({ type: 'ammo', amount: 5 });

  assert.equal(state.player.cargo.items.cmdty_munitions, 1, 'ammo service should add only units that fit');
  assert.equal(state.player.credits, 988, 'ammo service should charge only accepted munitions');
  assert(events.some((e) => e.event === 'cargo:full'), 'partial ammo service should report a full hold');

  const fullState = {
    playerId: 1,
    player: {
      credits: 1000,
      cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 0, capMass: 999 },
    },
  };
  const fullEvents = [];
  const fullBus = {
    on() {},
    emit(event, payload) { fullEvents.push({ event, payload }); },
  };
  cargo.init({ state: fullState, bus: fullBus, helpers: {}, registry: { get: (name) => (name === 'cargo' ? cargo : null) } });
  economy.state = fullState;
  economy.bus = fullBus;

  economy.handleService({ type: 'ammo', amount: 5 });

  assert.equal(fullState.player.cargo.items.cmdty_munitions, undefined, 'full hold should not receive ammo');
  assert.equal(fullState.player.credits, 1000, 'full hold should not be charged for rejected ammo');
  assert(fullEvents.some((e) => e.event === 'toast' && e.payload.kind === 'error'), 'rejected ammo service should notify the player');
}

function checkInsuranceUsesDockedStationId() {
  const state = {
    player: {
      credits: 1000,
      insurance: { rate: 0.6, deductibleCr: 500, insuredModules: false, lastStationId: null },
    },
    ui: { docked: true, dockedStationId: 'station_helios' },
  };
  const events = [];
  economy.state = state;
  economy.bus = { emit(event, payload) { events.push({ event, payload }); } };
  economy._lastDockedStation = null;

  economy.handleService({ type: 'insurance', amount: 1 });

  assert.equal(state.player.insurance.insuredModules, true, 'insurance service should activate coverage');
  assert.equal(state.player.insurance.lastStationId, 'station_helios', 'insurance should remember the actual docked station id');
  assert.equal(state.player.credits, 500, 'insurance should charge the deductible');
  assert(events.some((e) => e.event === 'credits:changed' && e.payload.reason === 'service:insurance'), 'insurance purchase should emit credit change');
}

function checkEconomyRngFollowsCurrentSaveSeed() {
  const makeState = (seed) => ({
    meta: { seed },
    simTime: 0,
    economy: { markets: {}, econEvents: [], econClock: { accumulator: 0, lastTickT: 0, ticksElapsed: 0 }, marketIntel: {} },
    world: { currentSectorId: 'sector_helios_prime', sectors: {} },
    player: {
      credits: 0,
      cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 10, capMass: 10 },
      efficiencyMods: {},
    },
  });
  const helpers = {
    hash32(seed, label) { return ((seed * 1009) + String(label).length) >>> 0; },
    mulberry32(seed) {
      const rng = () => 0.5;
      rng.seed = seed >>> 0;
      return rng;
    },
  };

  const state = makeState(11);
  economy.state = state;
  economy.helpers = helpers;
  economy.bus = { emit() {} };

  economy.resetRng();
  const bootSeed = economy.rng.seed;

  state.meta.seed = 22;
  state.economy = makeState(22).economy;
  economy.newGame();
  assert.notEqual(economy.rng.seed, bootSeed, 'new game should not keep the boot-time economy RNG stream');
  assert.equal(typeof economy.rng.seed, 'number', 'new game should expose the economy stream seed for diagnostics');
  assert.equal(state.economy.rng, economy.rng, 'new game should attach RNG to the replacement economy state');

  economy._rng();
  const saved = economy.serialize();
  const expectedNext = economy._rng();

  const restoredState = makeState(22);
  economy.state = restoredState;
  economy.helpers = helpers;
  economy.bus = { emit() {} };
  economy.deserialize(saved);
  assert.equal(economy._rng(), expectedNext, 'load should continue the serialized economy RNG stream');
  assert.equal(restoredState.economy.rng, economy.rng, 'load should attach RNG to restored economy state');

  const legacyState = makeState(33);
  economy.state = legacyState;
  economy.deserialize({
    markets: {},
    econEvents: [],
    econClock: { accumulator: 0, lastTickT: 0, ticksElapsed: 0 },
    marketIntel: {},
    nextEventId: 9,
  });
  assert.equal(typeof economy.rng.seed, 'number', 'legacy load should seed an economy RNG stream');
  assert.equal(legacyState.economy.rng, economy.rng, 'legacy load should attach RNG to restored economy state');
}

function checkAutomationRngContinuesAfterDeserialize() {
  const makeState = (seed) => ({
    meta: { seed },
    automation: {
      drones: [],
      traders: [],
      outposts: [],
      fleet: [],
      fleetCap: 0,
      balance: {},
      accumulators: { creditBuffer: 0, upkeepDebt: 0 },
      meta: { lastTickTime: 0, totalPassiveEarnedLifetime: 0, lostAssetsLog: [], rngSeed: 0 },
    },
  });

  const state = makeState(44);
  automation.state = state;
  automation.helpers = {};
  automation._normalizeAutomation(state.automation);
  automation._initRng(true);

  automation._rng();
  const saved = automation.serialize();
  const expectedNext = automation._rng();

  const restored = makeState(44);
  automation.state = restored;
  automation.deserialize(saved);
  assert.equal(automation._rng(), expectedNext, 'load should continue the serialized automation RNG stream');
  assert.equal(restored.automation.rng, automation.rng, 'load should attach RNG to restored automation state');
}

function checkCreditWritersRejectNegativeAmounts() {
  const state = {
    player: { credits: 100 },
  };
  const events = [];
  economy.state = state;
  economy.bus = { emit(event, payload) { events.push({ event, payload }); } };

  economy.grantCredits(-25, 'bad:grant');
  assert.equal(state.player.credits, 100, 'negative credit grants should not debit the player');

  economy.chargeCredits(-40, 'bad:charge');
  assert.equal(state.player.credits, 100, 'negative credit charges should not credit the player');

  assert(!events.some((e) => e.payload && (e.payload.reason === 'bad:grant' || e.payload.reason === 'bad:charge')), 'negative credit intents should not emit credits:changed');
}

function checkGateTollRequiresCredits() {
  const makeState = (credits) => ({
    player: { credits, researchedNodes: [] },
    story: { flags: {} },
    world: { currentSectorId: 'sector_ceres_belt', sectors: {} },
    jump: { state: 'IDLE', targetSectorId: null, via: null, chargeT: 0, chargeNeeded: 0, cooldownT: 0 },
    fuel: { current: 100, max: 100 },
  });

  const poorState = makeState(0);
  const poorEvents = [];
  world.state = poorState;
  world.bus = { emit: (event, payload) => poorEvents.push({ event, payload }) };
  world._combatLock = false;

  world._onRequestJump({ targetSectorId: 'sector_helios_prime', via: 'gate' });

  assert.equal(poorState.jump.state, 'IDLE', 'unaffordable gate toll should not start jump charging');
  assert(poorEvents.some((e) => e.event === 'jump:chargeAbort' && e.payload.reason === 'credits'), 'unaffordable gate toll should reject with credits reason');
  assert(!poorEvents.some((e) => e.event === 'economy:chargeCredits'), 'unaffordable gate toll should not emit a partial charge');

  const paidState = makeState(1000);
  const paidEvents = [];
  world.state = paidState;
  world.bus = { emit: (event, payload) => paidEvents.push({ event, payload }) };
  world._combatLock = false;

  world._onRequestJump({ targetSectorId: 'sector_helios_prime', via: 'gate' });

  assert.equal(paidState.jump.state, 'CHARGING', 'affordable gate toll should start jump charging');
  assert(paidEvents.some((e) => e.event === 'economy:chargeCredits' && e.payload.reason === 'gate_toll'), 'affordable gate toll should charge through economy');
}

function makeFlightHarness(overrides = {}) {
  const state = {
    mode: 'flight',
    settings: { controls: { flightMode: 'assisted' }, gameplay: { physicsBackend: 'custom' } },
    ui: { screenStack: [] },
    input: {
      turnIntent: 0,
      moveX: 0,
      moveZ: 0,
      boost: false,
      fire: false,
      fireGroup: null,
      aimWorld: { x: 0, z: 0 },
      aimAngle: 0,
      mouseNdc: { x: 0, y: 0 },
    },
    playerId: 1,
    entities: new Map(),
    entityList: [],
  };
  const ship = {
    id: 1,
    type: 'ship',
    alive: true,
    rot: 0,
    angVel: 0,
    bank: 0,
    bankVel: 0,
    turnRate: 3.0,
    thrust: 120,
    drag: 1.8,
    maxSpeed: 140,
    bankFactor: 1,
    vel: { x: 0, z: 0 },
    flags: {},
    boost: { energy: 0, max: 0, drainRate: 40, regenRate: 18, dashImpulse: 0, dashCd: 3, dashCdT: 0 },
    ...overrides,
  };
  state.entities.set(ship.id, ship);
  state.entityList.push(ship);
  const events = [];
  const listeners = {};
  const bus = {
    emit(event, payload) {
      events.push({ event, payload });
      for (const fn of listeners[event] || []) fn(payload);
    },
    on(event, fn) {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(fn);
    },
  };
  flight.init({ state, bus });
  flight._prevBoost = false;
  return { state, ship, bus, events };
}

function tickPlayerFlight(h, frames = 1, dt = 1 / 60) {
  for (let i = 0; i < frames; i++) flight.applyPlayerIntent(h.ship, dt);
}

function tickFlightSystem(h, frames = 1, dt = 1 / 60) {
  for (let i = 0; i < frames; i++) flight.update(dt, h.state);
}

function checkPlayerBankDoesNotSteerAfterRelease() {
  const h = makeFlightHarness({ bank: 0.45, bankVel: 0 });
  h.state.input.turnIntent = 0;

  tickPlayerFlight(h, 30);

  assert(Math.abs(h.ship.rot) < 0.0001, 'decorative bank should not keep yawing the ship after input release');
  assert(Math.abs(h.ship.bank) < 0.45, 'bank should settle toward level while idle');
}

function checkBankPoseCannotChangePhysicsState() {
  const ship = makeDynamicFlightShip({
    rot: 0.7,
    bank: 0.4,
    bankVel: 0,
    vel: { x: 42, z: -17 },
  });
  const before = { rot: ship.rot, vx: ship.vel.x, vz: ship.vel.z };

  for (let i = 0; i < 30; i++) FlightDynamics.stepBankPose(ship, -1, 1 / 60);
  for (let i = 0; i < 30; i++) FlightDynamics.settleBankPose(ship, 1 / 60);

  assert.equal(ship.rot, before.rot, 'bank pose integration must not alter heading');
  assert.equal(ship.vel.x, before.vx, 'bank pose integration must not alter velocity x');
  assert.equal(ship.vel.z, before.vz, 'bank pose integration must not alter velocity z');
}

function checkPlayerTurnBrakesOnRelease() {
  const h = makeFlightHarness();
  h.state.input.turnIntent = 1;
  tickPlayerFlight(h, 24);
  const rotAtRelease = h.ship.rot;
  assert(h.ship.angVel > 0.5, 'turn input should build a positive yaw rate');
  assert(h.ship.bank > 0, 'right turn should bank right');

  h.state.input.turnIntent = 0;
  tickPlayerFlight(h, 36);

  assert(Math.abs(h.ship.angVel) < 0.01, 'yaw rate should damp nearly to zero after release');
  assert(h.ship.rot - rotAtRelease < 0.12, 'ship should not keep whipping around after release');
  assert(Math.abs(h.ship.bank) < 0.03, 'bank should return to level without lingering list');
}

function checkPlayerBankSignFollowsTurnDirection() {
  const right = makeFlightHarness();
  right.state.input.turnIntent = 1;
  tickPlayerFlight(right, 18);
  assert(right.ship.bank > 0, 'right turn should produce positive bank');

  const left = makeFlightHarness();
  left.state.input.turnIntent = -1;
  tickPlayerFlight(left, 18);
  assert(left.ship.bank < 0, 'left turn should produce negative bank');
}

function checkPlayerTurnRateIsCappedForReadableControl() {
  const h = makeFlightHarness({ turnRate: 99 });
  h.state.input.turnIntent = 1;
  tickPlayerFlight(h, 90);

  assert(h.ship.angVel <= 3.81, 'extreme ship stats should still respect the player turn-rate cap');
}

function checkFlightAssistDampsLateralSlip() {
  const h = makeFlightHarness({ rot: 0, vel: { x: 80, z: 80 } });
  h.state.input.moveZ = 1;
  tickPlayerFlight(h, 60);

  assert(Math.abs(h.ship.vel.z) < 24, 'flight assist should strongly damp sideways slip while thrusting');
  assert(h.ship.vel.x > 50, 'flight assist should preserve forward momentum instead of killing all motion');
}

function checkReverseInputActsAsBrake() {
  const h = makeFlightHarness({ rot: 0, vel: { x: 100, z: 0 } });
  h.state.input.moveZ = -1;
  tickPlayerFlight(h, 60);

  assert(h.ship.vel.x < 0, 'holding reverse should brake through forward speed into controlled reverse thrust');
  assert(Math.abs(h.ship.vel.z) < 0.001, 'reverse braking should not introduce lateral drift');
}

function checkDiagonalVelocityIsNotAHeadingAttractor() {
  const startRot = Math.PI / 7;
  const h = makeFlightHarness({ rot: startRot, bank: 0.42, vel: { x: 90, z: 90 } });
  h.state.input.turnIntent = 0;
  h.state.input.moveZ = 0;

  tickPlayerFlight(h, 120);

  assert(Math.abs(h.ship.rot - startRot) < 0.0001, 'diagonal drift and bank should not steer the nose toward a hidden attractor');
  assert(Math.abs(h.ship.bank) < 0.001, 'bank should fully settle instead of listing indefinitely');
}

function checkHoldBoostDoesNotSpendDashEnergy() {
  const baseline = makeFlightHarness({
    boost: { energy: 100, max: 100, drainRate: 38, regenRate: 22, dashImpulse: 150, dashCd: 2, dashCdT: 0 },
  });
  baseline.state.input.moveZ = 1;
  tickPlayerFlight(baseline, 40);
  const baselineSpeed = Math.hypot(baseline.ship.vel.x, baseline.ship.vel.z);

  const h = makeFlightHarness({
    boost: { energy: 100, max: 100, drainRate: 38, regenRate: 22, dashImpulse: 150, dashCd: 2, dashCdT: 0 },
  });
  h.state.input.moveZ = 1;
  h.state.input.boost = true;

  tickPlayerFlight(h, 40);

  assert.equal(h.ship.flags.boosting, true, 'holding boost should keep sustained boost active while energy remains');
  assert.equal(h.ship.boost.dashCdT, 0, 'holding boost should not trigger the tap-dash cooldown');
  assert(h.ship.boost.energy > 70 && h.ship.boost.energy < 80, 'holding boost should spend sustained drain, not the dash energy chunk');
  assert(Math.hypot(h.ship.vel.x, h.ship.vel.z) > baselineSpeed * 1.45, 'holding boost should produce an obvious sustained speed gain');
}

function checkTapBoostStillDashes() {
  const h = makeFlightHarness({
    boost: { energy: 100, max: 100, drainRate: 38, regenRate: 22, dashImpulse: 150, dashCd: 2, dashCdT: 0 },
  });
  h.state.input.boost = true;
  tickPlayerFlight(h, 4);
  h.state.input.boost = false;
  tickPlayerFlight(h, 1);

  assert.equal(h.ship.flags.boosting, false, 'released boost should not leave sustained boost active');
  assert(h.ship.boost.dashCdT > 1.8, 'quick boost tap should trigger dash cooldown on release');
  assert(h.ship.boost.energy < 10, 'quick boost tap should pay the dash energy cost');
  assert(Math.hypot(h.ship.vel.x, h.ship.vel.z) > 100, 'quick boost tap should apply a visible dash impulse');
}

function checkInterruptedBoostTapDoesNotDashAfterDocking() {
  const h = makeFlightHarness({
    boost: { energy: 100, max: 100, drainRate: 38, regenRate: 22, dashImpulse: 150, dashCd: 2, dashCdT: 0 },
  });
  h.state.input.boost = true;
  tickPlayerFlight(h, 4);
  const speedBeforeInterrupt = Math.hypot(h.ship.vel.x, h.ship.vel.z);

  h.ship.flags.docked = true;
  h.state.input.boost = false;
  tickFlightSystem(h, 1);
  h.ship.flags.docked = false;
  tickFlightSystem(h, 1);

  assert.equal(h.ship.boost.dashCdT, 0, 'interrupted boost tap should not arm a delayed dash cooldown');
  assert.equal(h.ship.boost._dashCandidate, false, 'interrupted boost tap should clear the dash candidate');
  assert.equal(flight._prevBoost, false, 'interrupted boost tap should clear the held-boost edge state');
  assert(Math.hypot(h.ship.vel.x, h.ship.vel.z) < speedBeforeInterrupt + 10, 'interrupted boost tap should not apply a delayed dash impulse');
  assert(!h.events.some((e) => e.event === 'ship:dash'), 'interrupted boost tap should not emit a delayed dash event');
}

function checkInterruptedBoostTapDoesNotDashWhenControlsBlocked() {
  const h = makeFlightHarness({
    boost: { energy: 100, max: 100, drainRate: 38, regenRate: 22, dashImpulse: 150, dashCd: 2, dashCdT: 0 },
  });
  h.state.input.boost = true;
  tickPlayerFlight(h, 4);
  const speedBeforeInterrupt = Math.hypot(h.ship.vel.x, h.ship.vel.z);

  h.state.ui.screenStack.push('pause');
  h.state.input.boost = false;
  tickFlightSystem(h, 1);
  h.state.ui.screenStack.length = 0;
  tickFlightSystem(h, 1);

  assert.equal(h.ship.boost.dashCdT, 0, 'blocked controls should not arm a delayed dash cooldown');
  assert.equal(h.ship.boost._dashCandidate, false, 'blocked controls should clear boost tap candidates');
  assert.equal(flight._prevBoost, false, 'blocked controls should clear held-boost edge state');
  assert(Math.hypot(h.ship.vel.x, h.ship.vel.z) < speedBeforeInterrupt + 10, 'blocked controls should not apply a delayed dash impulse');
  assert(!h.events.some((e) => e.event === 'ship:dash'), 'blocked controls should not emit a delayed dash event');
}

function checkHeldBoostThroughBlockedControlsDoesNotDashOnRelease() {
  const h = makeFlightHarness({
    boost: { energy: 100, max: 100, drainRate: 38, regenRate: 22, dashImpulse: 150, dashCd: 2, dashCdT: 0 },
  });
  h.state.input.boost = true;
  tickPlayerFlight(h, 4);
  const speedBeforeInterrupt = Math.hypot(h.ship.vel.x, h.ship.vel.z);

  h.state.ui.screenStack.push('pause');
  h.state.input.boost = false; // input system zeros controls while a modal owns the keyboard
  tickFlightSystem(h, 1);

  h.state.ui.screenStack.length = 0;
  h.state.input.boost = true; // physical key is still held when the modal closes
  tickFlightSystem(h, 1);
  h.state.input.boost = false;
  tickFlightSystem(h, 1);

  assert.equal(h.ship.boost.dashCdT, 0, 'holding boost through blocked controls should not create a fresh tap-dash cooldown on release');
  assert.equal(h.ship.boost._dashCandidate, false, 'holding boost through blocked controls should keep dash candidates cleared');
  assert.equal(flight._prevBoost, false, 'releasing a suppressed boost hold should clear held-boost edge state');
  assert(Math.hypot(h.ship.vel.x, h.ship.vel.z) < speedBeforeInterrupt + 12, 'holding boost through blocked controls should not apply a delayed dash impulse');
  assert(!h.events.some((e) => e.event === 'ship:dash'), 'holding boost through blocked controls should not emit a delayed dash event');
}

function checkSaveLoadClearsBoostTapGesture() {
  const h = makeFlightHarness({
    boost: { energy: 100, max: 100, drainRate: 38, regenRate: 22, dashImpulse: 150, dashCd: 2, dashCdT: 0 },
  });
  h.state.input.boost = true;
  tickPlayerFlight(h, 4);
  const speedBeforeLoad = Math.hypot(h.ship.vel.x, h.ship.vel.z);

  h.bus.emit('save:loaded', { slot: 'regression' });
  h.state.input.boost = false;
  tickPlayerFlight(h, 1);

  assert.equal(h.ship.boost.dashCdT, 0, 'save load should not convert a stale boost tap into a dash');
  assert.equal(h.ship.boost._dashCandidate, false, 'save load should clear stale boost tap candidates');
  assert.equal(flight._prevBoost, false, 'save load should clear stale held-boost edge state');
  assert(Math.hypot(h.ship.vel.x, h.ship.vel.z) < speedBeforeLoad + 10, 'save load should not apply a delayed dash impulse');
  assert(!h.events.some((e) => e.event === 'ship:dash'), 'save load should not emit a delayed dash event');
}

function checkFlightRuntimeResetClearsBoostSuppression() {
  flight._prevBoost = true;
  flight._suppressBoostUntilRelease = true;

  const h = makeFlightHarness({
    boost: { energy: 100, max: 100, drainRate: 38, regenRate: 22, dashImpulse: 150, dashCd: 2, dashCdT: 0 },
  });
  h.state.input.boost = true;
  tickPlayerFlight(h, 4);
  h.state.input.boost = false;
  tickPlayerFlight(h, 1);

  assert(h.ship.boost.dashCdT > 1.8, 'flight init should clear stale boost suppression so fresh sessions can dash');
  assert(h.events.some((e) => e.event === 'ship:dash'), 'flight init should not inherit stale no-dash state');

  h.ship.boost.dashCdT = 0;
  h.ship.boost.energy = 100;
  h.state.input.boost = true;
  tickPlayerFlight(h, 4);
  h.bus.emit('game:started', {});
  h.state.input.boost = false;
  tickPlayerFlight(h, 1);

  assert.equal(h.ship.boost.dashCdT, 0, 'game start should clear in-progress boost gestures before flight resumes');
  assert.equal(flight._suppressBoostUntilRelease, false, 'game start should leave boost suppression reset');
}

function checkFlightSystemNormalizesMissingRuntimeBags() {
  const h = makeFlightHarness({ flags: undefined, vel: undefined, boost: undefined });
  h.state.input.turnIntent = 1;
  h.state.input.moveZ = 1;

  tickPlayerFlight(h, 1);

  assert(h.ship.flags && typeof h.ship.flags === 'object', 'player flight should recreate a missing flags bag');
  assert.equal(h.ship.flags.boosting, false, 'player flight should write a normalized boosting flag');
  assert(Number.isFinite(h.ship.vel.x) && Number.isFinite(h.ship.vel.z), 'player flight should recreate a finite velocity vector');
  assert(h.ship.boost && typeof h.ship.boost === 'object', 'player flight should recreate a missing boost resource bag');

  const npc = makeDynamicFlightShip({ id: 2, flags: undefined, vel: undefined });
  assert.doesNotThrow(
    () => flight.applyIntent(npc, { aimAngle: 0.5, moveX: 0.2, moveZ: 1, boost: true }, 1 / 60),
    'NPC flight should not crash if an older spawned ship lacks runtime flags or velocity',
  );
  assert(npc.flags && npc.flags.boosting === true, 'NPC flight should normalize and update the boosting flag');
  assert(Number.isFinite(npc.vel.x) && Number.isFinite(npc.vel.z), 'NPC flight should normalize missing velocity');

  const drifter = makeDynamicFlightShip({ id: 3, flags: undefined, vel: undefined });
  assert.doesNotThrow(
    () => flight.applyDrag(drifter, 1 / 60),
    'intent-less drifting ships should normalize missing velocity instead of crashing',
  );
  assert(drifter.flags && typeof drifter.flags === 'object', 'intent-less drifting ships should recreate a missing flags bag');
  assert(Number.isFinite(drifter.vel.x) && Number.isFinite(drifter.vel.z), 'intent-less drifting ships should normalize finite velocity');

  const partialBoost = makeFlightHarness({ boost: { energy: 20 } });
  partialBoost.state.input.moveZ = 1;
  tickPlayerFlight(partialBoost, 2);

  assert(Number.isFinite(partialBoost.ship.boost.energy), 'partial boost resources should not poison energy with NaN');
  assert(Number.isFinite(partialBoost.ship.boost.max), 'partial boost resources should get a finite max');
  assert(Number.isFinite(partialBoost.ship.boost.regenRate), 'partial boost resources should get a finite regen rate');
  assert(Number.isFinite(partialBoost.ship.boost.drainRate), 'partial boost resources should get a finite drain rate');
  assert(Number.isFinite(partialBoost.ship.boost.dashCdT), 'partial boost resources should get a finite dash cooldown timer');
}

function checkDefaultProfessionalFlightSettings() {
  const state = createGameState(123);

  assert.equal(state.settings.controls.flightMode, 'assisted', 'assisted flight mode should be the default');
  assert.equal(state.settings.gameplay.physicsBackend, 'custom', 'custom physics backend should remain the default');
  assert.deepEqual(INPUT_DEFAULTS.BINDINGS.strafeLeft, ['KeyQ'], 'Q should default to left lateral thruster');
  assert.deepEqual(INPUT_DEFAULTS.BINDINGS.strafeRight, ['KeyE'], 'E should default to right lateral thruster');
}

function checkLegacySettingsRestoreKeepsFlightDefaults() {
  const state = createGameState(321);
  save.state = state;
  save._restoreSettings({
    gameplay: { difficulty: 'veteran' },
    controls: { bindings: null },
  });

  assert.equal(state.settings.gameplay.difficulty, 'veteran', 'legacy settings restore should still apply known gameplay fields');
  assert.equal(state.settings.gameplay.physicsBackend, 'custom', 'legacy settings restore should preserve default physics backend');
  assert.equal(state.settings.controls.flightMode, 'assisted', 'legacy settings restore should preserve default assisted flight mode');
}

function checkSettingsRestoreSanitizesFlightOptions() {
  const state = createGameState(322);
  save.state = state;
  save._restoreSettings({
    gameplay: { physicsBackend: 'raw-rigidbody' },
    controls: {
      flightMode: 'diagonal-attractor',
      bindings: {
        forward: 'KeyI',
        reverse: ['KeyK', 47, null],
        strafeLeft: [],
      },
    },
  });

  assert.equal(state.settings.gameplay.physicsBackend, 'custom', 'invalid saved physics backend should fall back to custom');
  assert.equal(state.settings.controls.flightMode, 'assisted', 'invalid saved flight mode should fall back to assisted');
  assert.deepEqual(state.settings.controls.bindings.forward, ['KeyI'], 'string saved bindings should normalize to arrays');
  assert.deepEqual(state.settings.controls.bindings.reverse, ['KeyK'], 'saved bindings should drop non-string entries');
  assert.equal(state.settings.controls.bindings.strafeLeft, undefined, 'empty saved bindings should reset that action to default');

  const pollutedBefore = Object.prototype.spacefacePolluted;
  save._restoreSettings(JSON.parse('{"__proto__":{"spacefacePolluted":true},"controls":{"flightMode":"drift","bindings":{"__proto__":["KeyP"],"constructor":["KeyC"],"forward":"KeyI"}},"gameplay":{"physicsBackend":"custom"}}'));
  assert.equal(Object.prototype.spacefacePolluted, pollutedBefore, 'settings restore should ignore prototype mutation keys');
  assert.equal(Object.prototype.hasOwnProperty.call(state.settings.controls.bindings, '__proto__'), false, 'control bindings should not preserve __proto__ entries');
  assert.equal(Object.prototype.hasOwnProperty.call(state.settings.controls.bindings, 'constructor'), false, 'control bindings should not preserve constructor entries');

  save._restoreSettings({
    gameplay: { physicsBackend: 'rapier' },
    controls: { flightMode: 'newtonian', bindings: null },
  });
  assert.equal(state.settings.gameplay.physicsBackend, 'rapier', 'valid saved Rapier backend should restore');
  assert.equal(state.settings.controls.flightMode, 'newtonian', 'valid saved flight mode should restore');
  assert.equal(state.settings.controls.bindings, null, 'null bindings should keep default binding semantics');
}

function checkProfessionalFlightApiExists() {
  for (const name of ['resolveFlightProfile', 'stepPlayerFlight', 'stepNpcFlight', 'computeFlightFrame']) {
    assert.equal(typeof FlightDynamics[name], 'function', `flightDynamics.${name} should be exported`);
  }
}

function checkFlightProfileExposesCanonicalStats() {
  const ship = makeDynamicFlightShip({
    flightClass: 'hauler',
    flightModel: {
      flightClass: 'hauler',
      mass: 123,
      inertia: 456,
      mainAccel: 78,
      reverseAccel: 39,
      strafeAccel: 21,
      angularAccel: 12,
      angularBrake: 34,
      maxYawRate: 1.7,
      linearDrag: 0.8,
      lateralDrag: 0.3,
      assistStrength: 0.9,
      reverseBrake: 1.4,
      maxSpeed: 111,
      boostMult: 2.4,
      bankMax: 0.44,
      bankFactor: 0.5,
    },
  });
  const profile = FlightDynamics.resolveFlightProfile(ship, modeState('assisted'));

  for (const key of [
    'mass',
    'inertia',
    'mainAccel',
    'reverseAccel',
    'strafeAccel',
    'angularAccel',
    'angularBrake',
    'maxYawRate',
    'linearDrag',
    'lateralDrag',
    'assistStrength',
    'reverseBrake',
    'boostMult',
    'bankMax',
    'bankFactor',
  ]) {
    assert.equal(typeof profile[key], 'number', `flight profile should expose canonical numeric ${key}`);
  }

  assert.equal(profile.mass, 123, 'flight profile should expose authored mass without callers digging into profile.model');
  assert.equal(profile.inertia, 456, 'flight profile should expose authored inertia without callers digging into profile.model');
  const frame = FlightDynamics.computeFlightFrame(ship, profile);
  assert.equal(frame.mass, 123, 'flight frame should carry profile mass for diagnostics/camera/VFX consumers');
  assert.equal(frame.inertia, 456, 'flight frame should carry profile inertia for diagnostics/camera/VFX consumers');
  assert.equal(frame.assistStrength, 0.9, 'flight frame should carry assist strength for diagnostics');
}

function checkFlightDynamicsRejectsNonFiniteInputs() {
  const nullProfile = FlightDynamics.resolveFlightProfile(null, modeState('assisted'));
  assert(Number.isFinite(nullProfile.mainAccel), 'missing flight entity should resolve a finite fallback profile');
  assert(Number.isFinite(nullProfile.bankFactor), 'missing flight entity should resolve finite fallback bank tuning');

  const badModel = {
    mass: Number.NaN,
    inertia: Number.NaN,
    mainAccel: Number.NaN,
    reverseAccel: Number.NaN,
    strafeAccel: Number.NaN,
    angularAccel: Number.NaN,
    angularBrake: Number.NaN,
    maxYawRate: Number.NaN,
    linearDrag: Number.NaN,
    lateralDrag: Number.NaN,
    assistStrength: Number.NaN,
    reverseBrake: Number.NaN,
    maxSpeed: Number.NaN,
    boostMult: Number.NaN,
    boostMaxSpeedMult: Number.NaN,
    normalMaxSpeedMult: Number.NaN,
    bankMax: Number.NaN,
    bankFactor: Number.NaN,
  };
  const ship = makeDynamicFlightShip({
    rot: Number.NaN,
    angVel: Number.NaN,
    turnRate: Number.NaN,
    thrust: Number.NaN,
    drag: Number.NaN,
    maxSpeed: Number.NaN,
    mass: Number.NaN,
    bankFactor: Number.NaN,
    vel: { x: Number.NaN, z: Number.NaN },
    flightModel: badModel,
  });
  const profile = FlightDynamics.resolveFlightProfile(ship, modeState('assisted'));

  for (const key of [
    'mass',
    'inertia',
    'mainAccel',
    'reverseAccel',
    'strafeAccel',
    'angularAccel',
    'angularBrake',
    'maxYawRate',
    'linearDrag',
    'lateralDrag',
    'assistStrength',
    'reverseBrake',
    'maxSpeed',
    'boostMult',
    'boostMaxSpeedMult',
    'normalMaxSpeedMult',
    'bankMax',
    'bankFactor',
  ]) {
    assert(Number.isFinite(profile[key]), `malformed flight stats should resolve finite profile.${key}`);
  }

  const diagnostics = FlightDynamics.stepPlayerFlight(
    ship,
    { turnIntent: Number.NaN, moveX: Number.NaN, moveZ: Number.NaN, boost: false },
    1 / 60,
    profile,
  );
  assert(Number.isFinite(ship.rot), 'malformed player turn input should not poison heading');
  assert(Number.isFinite(ship.angVel), 'malformed player turn input should not poison yaw velocity');
  assert(Number.isFinite(ship.vel.x) && Number.isFinite(ship.vel.z), 'malformed player thrust input should not poison velocity');
  assert(Number.isFinite(ship.bank), 'malformed player turn input should not poison bank pose');
  assert(Number.isFinite(diagnostics.speed), 'malformed player input should still produce finite diagnostics');

  const npc = makeDynamicFlightShip({ vel: { x: 20, z: Number.NaN } });
  const npcProfile = FlightDynamics.resolveFlightProfile(npc, modeState('assisted'));
  FlightDynamics.stepNpcFlight(
    npc,
    { aimAngle: Number.NaN, moveX: Number.NaN, moveZ: Number.NaN, boost: true },
    1 / 60,
    npcProfile,
  );
  assert(Number.isFinite(npc.rot), 'malformed NPC aim should not poison heading');
  assert(Number.isFinite(npc.vel.x) && Number.isFinite(npc.vel.z), 'malformed NPC thrust input should not poison velocity');
}

function makeDynamicFlightShip(overrides = {}) {
  return {
    id: 1,
    type: 'ship',
    alive: true,
    rot: 0,
    angVel: 0,
    bank: 0,
    bankVel: 0,
    turnRate: 3.0,
    thrust: 120,
    drag: 1.8,
    maxSpeed: 140,
    bankFactor: 1,
    mass: 20,
    vel: { x: 0, z: 0 },
    flags: {},
    data: {},
    ...overrides,
  };
}

function modeState(mode) {
  return {
    settings: {
      controls: { flightMode: mode },
      gameplay: { physicsBackend: 'custom' },
    },
  };
}

function runProfileSlip(mode) {
  const ship = makeDynamicFlightShip({ rot: 0, vel: { x: 0, z: 90 } });
  const profile = FlightDynamics.resolveFlightProfile(ship, modeState(mode));
  const input = { moveX: 0, moveZ: 0, turnIntent: 0, boost: false };
  for (let i = 0; i < 60; i++) FlightDynamics.stepPlayerFlight(ship, input, 1 / 60, profile);
  return Math.abs(ship.vel.z);
}

function checkFlightModesHaveDistinctAssist() {
  const assisted = runProfileSlip('assisted');
  const drift = runProfileSlip('drift');
  const newtonian = runProfileSlip('newtonian');

  assert(assisted < drift, 'assisted mode should damp sideways slip more than drift mode');
  assert(drift < newtonian, 'drift mode should damp sideways slip more than newtonian mode');
  assert(assisted < 35, 'assisted mode should converge strongly toward the intended heading');
  assert(newtonian > 60, 'newtonian mode should preserve most lateral inertia');
}

function checkStrafeThrustersUseMoveXWithoutYaw() {
  const ship = makeDynamicFlightShip({ rot: 0 });
  const profile = FlightDynamics.resolveFlightProfile(ship, modeState('assisted'));
  const input = { moveX: 1, moveZ: 0, turnIntent: 0, boost: false };
  for (let i = 0; i < 45; i++) FlightDynamics.stepPlayerFlight(ship, input, 1 / 60, profile);

  assert(Math.abs(ship.rot) < 0.0001, 'lateral thrusters should not rotate the nose');
  assert(ship.vel.z > 12, 'moveX should accelerate along the ship-local right axis');
}

function checkFlightFrameReportsLocalMotion() {
  const ship = makeDynamicFlightShip({ rot: 0, vel: { x: 50, z: 20 } });
  const profile = FlightDynamics.resolveFlightProfile(ship, modeState('assisted'));
  const frame = FlightDynamics.computeFlightFrame(ship, profile);

  assert.equal(Math.round(frame.speed), 54, 'flight frame should report scalar speed');
  assert.equal(Math.round(frame.forwardSpeed), 50, 'flight frame should report ship-local forward speed');
  assert.equal(Math.round(frame.lateralSpeed), 20, 'flight frame should report ship-local lateral speed');
  assert(frame.slipAngle > 0.35 && frame.slipAngle < 0.45, 'flight frame should report slip angle');
}

function checkShipDerivedStatsIncludeFlightModelOrdering() {
  const player = { efficiencyMods: { miningYieldMult: 1, shieldRegenMult: 1, energyRegenMult: 1, cargoCapMult: 1, tradeFeeMult: 1 } };
  const directFighter = getDerivedStats('ship_wasp', [], player);
  const directHauler = getDerivedStats('ship_atlas', [], player);
  const directCapital = getDerivedStats('ship_colossus', [], player);

  assert(directFighter.flightModel, 'derived stats should include a canonical flightModel block');
  assert(directHauler.flightModel, 'hauler derived stats should include flightModel');
  assert(directCapital.flightModel, 'capital ship derived stats should include flightModel');
  assert(directFighter.flightModel.angularAccel > directHauler.flightModel.angularAccel, 'fighters should have higher angular acceleration than heavy haulers');
  assert(directFighter.flightModel.mainAccel > directHauler.flightModel.mainAccel, 'fighters should accelerate harder than heavy haulers');
  assert(directHauler.flightModel.inertia > directFighter.flightModel.inertia, 'heavy haulers should carry more rotational inertia');
  assert(directCapital.flightModel.mainAccel < directHauler.flightModel.mainAccel, 'capital ships should accelerate more slowly than heavy haulers');
  assert(directCapital.flightModel.angularAccel < directHauler.flightModel.angularAccel, 'capital ships should turn more slowly than heavy haulers');
  assert(directCapital.flightModel.maxYawRate < directHauler.flightModel.maxYawRate, 'capital ships should have a lower yaw ceiling than heavy haulers');
  assert(directCapital.flightModel.inertia > directHauler.flightModel.inertia, 'capital ships should have the most stable/heavy rotational inertia');
}

function checkAuthoredFlightModelIsNotClassTunedTwice() {
  const ship = makeDynamicFlightShip({
    flightClass: 'fighter',
    flightModel: {
      flightClass: 'fighter',
      mainAccel: 101,
      reverseAccel: 55,
      strafeAccel: 42,
      angularAccel: 33,
      angularBrake: 66,
      maxYawRate: 2.5,
      linearDrag: 1.7,
      lateralDrag: 0.4,
      assistStrength: 1.2,
      maxSpeed: 123,
      bankMax: 0.5,
      bankFactor: 0.75,
    },
  });
  const profile = FlightDynamics.resolveFlightProfile(ship, modeState('assisted'));

  assert.equal(profile.mainAccel, 101, 'authored flightModel mainAccel should not get a second class multiplier');
  assert.equal(profile.angularAccel, 33, 'authored flightModel angularAccel should not get a second class multiplier');
  assert.equal(profile.angularBrake, 66, 'authored flightModel angularBrake should not get a second class multiplier');
  assert.equal(profile.strafeAccel, 42, 'authored flightModel strafeAccel should not get a second class multiplier');
}

function checkAuthoredFlightModelPreservesExplicitZeroes() {
  const ship = makeDynamicFlightShip({
    turnRate: 9,
    thrust: 200,
    maxSpeed: 300,
    bankFactor: 1,
    flightModel: {
      flightClass: 'fighter',
      mainAccel: 0,
      reverseAccel: 0,
      strafeAccel: 0,
      angularAccel: 0,
      angularBrake: 0,
      maxYawRate: 0,
      maxSpeed: 0,
      boostMult: 0,
      boostMaxSpeedMult: 0,
      normalMaxSpeedMult: 0,
      bankMax: 0,
    },
  });
  const profile = FlightDynamics.resolveFlightProfile(ship, modeState('assisted'));

  assert.equal(profile.maxYawRate, 0, 'authored maxYawRate:0 should not fall back to turnRate');
  assert.equal(profile.mainAccel, 0, 'authored mainAccel:0 should disable main thrust');
  assert.equal(profile.reverseAccel, 0, 'authored reverseAccel:0 should disable reverse thrust');
  assert.equal(profile.strafeAccel, 0, 'authored strafeAccel:0 should disable lateral thrust');
  assert.equal(profile.maxSpeed, 0, 'authored maxSpeed:0 should not fall back to hull maxSpeed');
  assert.equal(profile.boostMult, 0, 'authored boostMult:0 should not fall back to boost defaults');
  assert.equal(profile.boostMaxSpeedMult, 0, 'authored boostMaxSpeedMult:0 should not fall back to boost defaults');
  assert.equal(profile.normalMaxSpeedMult, 0, 'authored normalMaxSpeedMult:0 should not fall back to defaults');
  assert.equal(profile.bankMax, 0, 'authored bankMax:0 should disable bank pose');

  FlightDynamics.stepPlayerFlight(ship, { turnIntent: 1, moveX: 1, moveZ: 1, boost: false }, 1 / 60, profile);
  assert.equal(ship.bank, 0, 'bankMax:0 should keep visual bank disabled under turn input');
}

function checkNpcFlightPreservesExplicitZeroControllerTuning() {
  const ship = makeDynamicFlightShip({ rot: 0 });
  const profile = FlightDynamics.resolveFlightProfile(ship, modeState('assisted'));
  const diagnostics = FlightDynamics.stepNpcFlight(ship, { aimAngle: 0.1, moveX: 0, moveZ: 0, boost: false }, 1 / 60, profile, { softAngle: 0 });

  assert.equal(diagnostics.turnIntent, 1, 'explicit NPC softAngle:0 should request a full-rate correction instead of falling back');
  assert.equal(diagnostics.targetYawRate, profile.maxYawRate, 'explicit NPC softAngle:0 should use the profile yaw limit');

  const bankShip = makeDynamicFlightShip({ angVel: 0.05 });
  FlightDynamics.npcBankPose(bankShip, 0, 1);
  assert(bankShip.bank > 0.3, 'explicit NPC bank turnRate:0 should use the epsilon denominator instead of falling back to 3');
}

function checkDockAndGateRangeTransitionsAreIndependent() {
  const events = [];
  const state = {
    playerId: 1,
    entities: new Map(),
    entityList: [],
  };
  const player = { id: 1, type: 'ship', alive: true, radius: 10, pos: { x: 0, z: 0 } };
  const station = { id: 2, type: 'station', alive: true, radius: 60, pos: { x: 40, z: 0 }, data: { stationId: 'station_test', dockRadius: 80 } };
  const gate = { id: 3, type: 'station', alive: true, radius: 80, pos: { x: -40, z: 0 }, data: { isGate: true, gateTo: 'sector_next', name: 'Test Gate', dockRadius: 80 } };
  for (const e of [player, station, gate]) {
    state.entities.set(e.id, e);
    state.entityList.push(e);
  }

  physics.init({ state, bus: { emit(event, payload) { events.push({ event, payload }); } } });
  physics.updateDockRange(state);

  assert(events.some((e) => e.event === 'dock:range' && e.payload.inRange), 'station range enter should emit');
  assert(events.some((e) => e.event === 'gate:range' && e.payload.inRange), 'gate range enter should emit in the same update');
}

function checkSweptShipStaticCollisionStaysOutsideObstacle() {
  const state = { entityList: [] };
  const ship = {
    id: 1,
    type: 'ship',
    alive: true,
    collides: true,
    radius: 2,
    pos: { x: 12, z: 0 },
    prevPos: { x: -12, z: 0 },
    vel: { x: 720, z: 0 },
    collisionMask: Masks.ASTEROID,
  };
  const asteroid = {
    id: 2,
    type: 'asteroid',
    alive: true,
    collides: true,
    radius: 4,
    pos: { x: 0, z: 0 },
    collisionMask: Masks.SHIP,
  };
  state.entityList.push(ship, asteroid);

  physics.init({ state, bus: { emit() {} } });
  physics.sweepShipStatics(1 / 30, state);

  assert(ship.pos.x < -6, 'swept collision should keep the ship just outside the obstacle contact');
  assert(ship.vel.x < 0, 'swept collision should correct inbound velocity away from the obstacle');
  assert.equal(physics._diag.sweptShipContacts, 1, 'swept collision should report the contact for diagnostics');
}

function checkSweptShipStaticCollisionUsesEitherMask() {
  const state = { entityList: [] };
  const ship = {
    id: 1,
    type: 'ship',
    alive: true,
    collides: true,
    radius: 2,
    pos: { x: 12, z: 0 },
    prevPos: { x: -12, z: 0 },
    vel: { x: 720, z: 0 },
    collisionMask: 0,
  };
  const asteroid = {
    id: 2,
    type: 'asteroid',
    alive: true,
    collides: true,
    radius: 4,
    pos: { x: 0, z: 0 },
    collisionMask: Masks.SHIP,
  };
  state.entityList.push(ship, asteroid);

  physics.init({ state, bus: { emit() {} } });
  physics.sweepShipStatics(1 / 30, state);

  assert.equal(physics._diag.sweptShipContacts, 1, 'swept collision should honor static-side collision masks');
  assert(ship.pos.x < -6, 'static-side mask should still prevent high-speed tunneling through obstacles');
}

function checkSweptShipStaticCollisionUsesEntryPointForGlancingHit() {
  const state = { entityList: [] };
  const ship = {
    id: 1,
    type: 'ship',
    alive: true,
    collides: true,
    radius: 2,
    pos: { x: 20, z: 7 },
    prevPos: { x: -20, z: 7 },
    vel: { x: 1200, z: 0 },
    collisionMask: Masks.ASTEROID,
  };
  const asteroid = {
    id: 2,
    type: 'asteroid',
    alive: true,
    collides: true,
    radius: 8,
    pos: { x: 0, z: 0 },
    collisionMask: Masks.SHIP,
  };
  state.entityList.push(ship, asteroid);

  physics.init({ state, bus: { emit() {} } });
  physics.sweepShipStatics(1 / 30, state);

  assert(ship.pos.x < -6, 'glancing swept collision should stop at the first entry point, not the closest point');
  assert(Math.abs(ship.pos.z - 7) < 0.05, 'glancing swept collision should preserve the motion lane at contact');
  const nx = ship.pos.x / Math.hypot(ship.pos.x, ship.pos.z);
  const nz = ship.pos.z / Math.hypot(ship.pos.x, ship.pos.z);
  assert(ship.vel.x * nx + ship.vel.z * nz >= 0, 'glancing swept collision should reflect inbound normal velocity');
}

function checkSweptShipStaticCollisionUsesEarliestObstacle() {
  const state = { entityList: [] };
  const ship = {
    id: 1,
    type: 'ship',
    alive: true,
    collides: true,
    radius: 2,
    pos: { x: 24, z: 0 },
    prevPos: { x: -24, z: 0 },
    vel: { x: 1440, z: 0 },
    collisionMask: Masks.ASTEROID | Masks.STATION,
  };
  const farStation = {
    id: 2,
    type: 'station',
    alive: true,
    collides: true,
    radius: 4,
    pos: { x: 12, z: 0 },
    collisionMask: Masks.SHIP,
    data: { stationId: 'far_station', dockRadius: 40 },
  };
  const nearAsteroid = {
    id: 3,
    type: 'asteroid',
    alive: true,
    collides: true,
    radius: 4,
    pos: { x: 0, z: 0 },
    collisionMask: Masks.SHIP,
  };
  state.entityList.push(ship, farStation, nearAsteroid);

  physics.init({ state, bus: { emit() {} } });
  physics.sweepShipStatics(1 / 30, state);

  assert.equal(physics._diag.sweptShipContacts, 1, 'swept ship/static CCD should resolve only the earliest obstacle in a tick');
  assert(ship.pos.x < -6, 'earliest swept obstacle should be the nearer asteroid, independent of entity order');
  assert(ship.vel.x < -300, 'earliest obstacle material should control the response, not a farther station listed first');
}

function checkCollisionMaterialsProduceDistinctSweptResponses() {
  const runSweep = (type) => {
    const state = { entityList: [] };
    const ship = {
      id: 1,
      type: 'ship',
      alive: true,
      collides: true,
      radius: 2,
      pos: { x: 12, z: 0 },
      prevPos: { x: -12, z: 0 },
      vel: { x: 720, z: 0 },
      collisionMask: Masks.ASTEROID | Masks.STATION,
    };
    const obstacle = {
      id: 2,
      type,
      alive: true,
      collides: true,
      radius: 4,
      pos: { x: 0, z: 0 },
      collisionMask: Masks.SHIP,
      data: type === 'station' ? { stationId: 'station_test', dockRadius: 40 } : {},
    };
    state.entityList.push(ship, obstacle);
    physics.init({ state, bus: { emit() {} } });
    physics.sweepShipStatics(1 / 30, state);
    return { ship, contacts: physics._diag.sweptShipContacts };
  };

  const station = runSweep('station');
  const asteroid = runSweep('asteroid');

  assert.equal(station.contacts, 1, 'station swept hull contact should be reported');
  assert.equal(asteroid.contacts, 1, 'asteroid swept hull contact should be reported');
  assert(station.ship.vel.x < 0, 'station material should still stop inward motion instead of letting ships coast through');
  assert(asteroid.ship.vel.x < station.ship.vel.x, 'asteroid material should rebound harder than station hull material');
  assert(Math.abs(station.ship.vel.x) < Math.abs(asteroid.ship.vel.x) * 0.45, 'station material should be visibly softer than asteroid material');
}

function checkSweptProjectileCollisionHitsAlongSegment() {
  const events = [];
  const state = { entityList: [] };
  const projectile = {
    id: 1,
    type: 'projectile',
    alive: true,
    collides: true,
    radius: 1,
    ownerId: 99,
    pos: { x: 14, z: 0 },
    prevPos: { x: -14, z: 0 },
    vel: { x: 840, z: 0 },
    collisionMask: Masks.SHIP,
    data: { damage: 7, damageType: 'kinetic' },
  };
  const target = {
    id: 2,
    type: 'ship',
    alive: true,
    collides: true,
    radius: 4,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    collisionMask: Masks.PROJECTILE,
  };
  state.entityList.push(projectile, target);

  physics.init({ state, bus: { emit(event, payload) { events.push({ event, payload }); } } });
  physics.sweepProjectiles(1 / 30, state);

  assert.equal(projectile.alive, false, 'swept projectile should be consumed on hit');
  assert(events.some((e) => e.event === 'projectile:hit' && e.payload.targetId === target.id && e.payload.damage === 7), 'swept projectile should emit hit event with damage payload');
  assert.equal(physics._diag.sweptProjectileHits, 1, 'swept projectile should report the hit for diagnostics');
}

function checkBroadPhasePairKeysDoNotCollideForHighEntityIds() {
  const events = [];
  const state = createGameState(77);
  state.entities.clear();
  state.entityList.length = 0;
  const entities = [
    {
      id: 1,
      type: 'projectile',
      alive: true,
      collides: true,
      radius: 3,
      ownerId: 500,
      pos: { x: 0, z: 0 },
      vel: { x: 0, z: 0 },
      collisionMask: Masks.SHIP,
      data: { damage: 3 },
    },
    {
      id: 200006,
      type: 'ship',
      alive: true,
      collides: true,
      radius: 4,
      pos: { x: 0, z: 0 },
      vel: { x: 0, z: 0 },
      collisionMask: Masks.PROJECTILE,
    },
    {
      id: 2,
      type: 'projectile',
      alive: true,
      collides: true,
      radius: 3,
      ownerId: 501,
      pos: { x: 200, z: 0 },
      vel: { x: 0, z: 0 },
      collisionMask: Masks.SHIP,
      data: { damage: 5 },
    },
    {
      id: 100003,
      type: 'ship',
      alive: true,
      collides: true,
      radius: 4,
      pos: { x: 200, z: 0 },
      vel: { x: 0, z: 0 },
      collisionMask: Masks.PROJECTILE,
    },
  ];
  for (const e of entities) {
    state.entities.set(e.id, e);
    state.entityList.push(e);
  }

  physics.init({ state, bus: { emit(event, payload) { events.push({ event, payload }); } } });
  state.spatialHash.rebuild(state.entityList);
  physics.collide(1 / 60, state);

  const hits = events.filter((e) => e.event === 'projectile:hit');
  assert.equal(hits.length, 2, 'broad-phase pair de-dupe should not alias distinct high-id collision pairs');
  assert(hits.some((e) => e.payload.targetId === 200006 && e.payload.damage === 3), 'first high-id collision pair should resolve');
  assert(hits.some((e) => e.payload.targetId === 100003 && e.payload.damage === 5), 'second high-id collision pair should resolve');
}

function checkBroadPhaseProjectileIsConsumedOnlyOnce() {
  const events = [];
  const state = createGameState(88);
  state.entities.clear();
  state.entityList.length = 0;
  const projectile = {
    id: 10,
    type: 'projectile',
    alive: true,
    collides: true,
    radius: 4,
    ownerId: 999,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    collisionMask: Masks.SHIP,
    data: { damage: 11 },
  };
  const targetA = {
    id: 11,
    type: 'ship',
    alive: true,
    collides: true,
    radius: 5,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    collisionMask: Masks.PROJECTILE,
  };
  const targetB = {
    id: 12,
    type: 'ship',
    alive: true,
    collides: true,
    radius: 5,
    pos: { x: 1, z: 0 },
    vel: { x: 0, z: 0 },
    collisionMask: Masks.PROJECTILE,
  };
  for (const e of [projectile, targetA, targetB]) {
    state.entities.set(e.id, e);
    state.entityList.push(e);
  }

  physics.init({ state, bus: { emit(event, payload) { events.push({ event, payload }); } } });
  state.spatialHash.rebuild(state.entityList);
  physics.collide(1 / 60, state);

  const hits = events.filter((e) => e.event === 'projectile:hit');
  assert.equal(hits.length, 1, 'one broad-phase projectile should be consumed by only one target in a dense overlap');
  assert.equal(projectile.alive, false, 'broad-phase projectile should be marked consumed after the first hit');
}

function checkSpawnRequestAmbushContract() {
  const state = {
    mode: 'flight',
    meta: { seed: 123, playtimeS: 0 },
    playerId: 1,
    player: { ownedShips: [], activeShipIndex: 0 },
    entities: new Map([[1, {
      id: 1,
      type: 'ship',
      alive: true,
      pos: { x: 100, y: 0, z: -20 },
      prevPos: { x: 100, y: 0, z: -20, copy(pos) { this.x = pos.x; this.y = pos.y || 0; this.z = pos.z; return this; } },
      vel: { x: 0, z: 0 },
      rot: 0,
      prevRot: 0,
      flags: {},
      data: {},
    }]]),
    entityList: [],
    rng: () => 0.5,
    world: {
      sectors: {},
      currentSectorId: 'sector_ceres_belt',
      activeSector: { stations: [], fields: [], hazards: [], pois: [], gates: [], enemies: [] },
      discovery: {},
      pendingSpawns: {},
      rng: () => 0.5,
    },
    bounds: {},
    jump: { state: 'IDLE', targetSectorId: null, via: null, chargeT: 0, chargeNeeded: 0, cooldownT: 0 },
    fuel: { current: 100, max: 100 },
  };
  const spawned = [];
  const events = [];
  const bus = createBus();
  bus.on('interdiction:triggered', (p) => events.push(p));
  const helpers = {
    spawnEntity(spec) {
      const ent = { id: 1000 + spawned.length, ...spec };
      spawned.push(spec);
      return ent;
    },
    hash32() { return 7; },
    mulberry32() { return () => 0.5; },
  };

  world.init({ state, bus, helpers, registry: { get() { return null; } } });

  bus.emit('spawn:request', {
    entityType: 'pirate',
    sectorId: 'sector_ceres_belt',
    tags: ['ambush', 'trader_kill'],
    refId: 'au_live',
  });

  assert.equal(state.world.activeSector.enemies.length, 1, 'active-sector pirate spawn request should spawn an ambush');
  assert.equal(spawned[0].type, 'ship', 'ambush request should resolve to a spawned ship spec');
  assert(events.some((e) => e.sectorId === 'sector_ceres_belt' && e.ambushCount === 1), 'spawn request should emit ambush telemetry');

  bus.emit('spawn:request', {
    entityType: 'pirate',
    sectorId: 'sector_helios_prime',
    tags: ['ambush', 'trader_kill'],
    refId: 'au_queued',
  });

  assert.equal(state.world.pendingSpawns.sector_helios_prime.length, 1, 'off-sector spawn request should be queued by sector');
  assert.equal(world.serialize().pendingSpawns.sector_helios_prime[0].refId, 'au_queued', 'queued spawn request should serialize with world overlay');

  world.enterSector('sector_helios_prime');

  assert.equal(state.world.pendingSpawns.sector_helios_prime, undefined, 'queued spawn request should be consumed on sector entry');
  assert.equal(state.world.activeSector.enemies.length, 1, 'queued pirate request should materialize when the sector loads');
}

checkPickupSingleWriter();
checkSaveDelegatesSystemHooks();
checkSaveDelegatesCraftingHooks();
checkSaveScrubsTransientFlightState();
checkMissionCompletionAutosaveSeesSettledState();
checkLoadDoesNotSpawnTargetsForStaleLiveMissions();
checkLoadRestoresPersistentEntities();
checkLoadRejectsSaveWithoutPlayerEntity();
checkCombatRewardsAndLootKinds();
checkHeatUsesTargetFactionContext();
checkInsuredRespawnUsesStationRefundAndCargoLoss();
checkFailedCargoFitDoesNotDuplicateModules();
checkNewGameOwnedShipDefaultsAreFitted();
checkAmmoServiceOnlyChargesAcceptedCargo();
checkInsuranceUsesDockedStationId();
checkEconomyRngFollowsCurrentSaveSeed();
checkAutomationRngContinuesAfterDeserialize();
checkCreditWritersRejectNegativeAmounts();
checkGateTollRequiresCredits();
checkPlayerBankDoesNotSteerAfterRelease();
checkBankPoseCannotChangePhysicsState();
checkPlayerTurnBrakesOnRelease();
checkPlayerBankSignFollowsTurnDirection();
checkPlayerTurnRateIsCappedForReadableControl();
checkFlightAssistDampsLateralSlip();
checkReverseInputActsAsBrake();
checkDiagonalVelocityIsNotAHeadingAttractor();
checkHoldBoostDoesNotSpendDashEnergy();
checkTapBoostStillDashes();
checkInterruptedBoostTapDoesNotDashAfterDocking();
checkInterruptedBoostTapDoesNotDashWhenControlsBlocked();
checkHeldBoostThroughBlockedControlsDoesNotDashOnRelease();
checkSaveLoadClearsBoostTapGesture();
checkFlightRuntimeResetClearsBoostSuppression();
checkFlightSystemNormalizesMissingRuntimeBags();
checkDefaultProfessionalFlightSettings();
checkLegacySettingsRestoreKeepsFlightDefaults();
checkSettingsRestoreSanitizesFlightOptions();
checkProfessionalFlightApiExists();
checkFlightProfileExposesCanonicalStats();
checkFlightDynamicsRejectsNonFiniteInputs();
checkFlightModesHaveDistinctAssist();
checkStrafeThrustersUseMoveXWithoutYaw();
checkFlightFrameReportsLocalMotion();
checkShipDerivedStatsIncludeFlightModelOrdering();
checkAuthoredFlightModelIsNotClassTunedTwice();
checkAuthoredFlightModelPreservesExplicitZeroes();
checkNpcFlightPreservesExplicitZeroControllerTuning();
checkDockAndGateRangeTransitionsAreIndependent();
checkSweptShipStaticCollisionStaysOutsideObstacle();
checkSweptShipStaticCollisionUsesEitherMask();
checkSweptShipStaticCollisionUsesEntryPointForGlancingHit();
checkSweptShipStaticCollisionUsesEarliestObstacle();
checkCollisionMaterialsProduceDistinctSweptResponses();
checkSweptProjectileCollisionHitsAlongSegment();
checkBroadPhasePairKeysDoNotCollideForHighEntityIds();
checkBroadPhaseProjectileIsConsumedOnlyOnce();
checkSpawnRequestAmbushContract();

console.log('Core gameplay checks OK');
