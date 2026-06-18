import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { save } from '../src/save/saveSystem.js';
import { cargo } from '../src/systems/cargo.js';
import { mining } from '../src/systems/mining.js';
import { combat } from '../src/systems/combat.js';
import { crafting } from '../src/systems/crafting.js';
import { economy } from '../src/systems/economy.js';
import { heat } from '../src/systems/heat.js';
import { missions } from '../src/systems/missions.js';
import { ships, buildSlotList, makeShipEntitySpec } from '../src/systems/ships.js';
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
  assert.equal(economy.rng.seed, helpers.hash32(22, 'economy'), 'new game should seed economy RNG from the current run seed');
  assert.equal(state.economy.rng, economy.rng, 'new game should attach RNG to the replacement economy state');

  state.meta.seed = 33;
  economy.deserialize({
    markets: {},
    econEvents: [],
    econClock: { accumulator: 0, lastTickT: 0, ticksElapsed: 0 },
    marketIntel: {},
    nextEventId: 9,
  });
  assert.equal(economy.rng.seed, helpers.hash32(33, 'economy'), 'load should reseed economy RNG from the restored save seed');
  assert.equal(state.economy.rng, economy.rng, 'load should attach RNG to restored economy state');
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
checkMissionCompletionAutosaveSeesSettledState();
checkLoadDoesNotSpawnTargetsForStaleLiveMissions();
checkLoadRejectsSaveWithoutPlayerEntity();
checkCombatRewardsAndLootKinds();
checkHeatUsesTargetFactionContext();
checkInsuredRespawnUsesStationRefundAndCargoLoss();
checkFailedCargoFitDoesNotDuplicateModules();
checkNewGameOwnedShipDefaultsAreFitted();
checkAmmoServiceOnlyChargesAcceptedCargo();
checkInsuranceUsesDockedStationId();
checkEconomyRngFollowsCurrentSaveSeed();
checkCreditWritersRejectNegativeAmounts();
checkGateTollRequiresCredits();
checkSpawnRequestAmbushContract();

console.log('Core gameplay checks OK');
