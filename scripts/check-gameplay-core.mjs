import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createBus } from '../src/core/eventBus.js';
import { Masks } from '../src/core/entity.js';
import { createGameState } from '../src/core/gameState.js';
import { createTimeEffects } from '../src/core/timeEffects.js';
import { core } from '../src/core/coreSystem.js';
import { physics } from '../src/core/physics.js';
import { queryNearbyEntities } from '../src/core/spatialQuery.js';
import { scalarHitToDamagePacket } from '../src/combat/damage.js';
import { AI_CONTRACT_VERSION } from '../src/ai/contracts.js';
import { hash32, mulberry32, wrapAngle } from '../src/core/rng.js';
import { audioNearbyHostileCount } from '../src/audio/audioSystem.js';
import { save } from '../src/save/saveSystem.js';
import { cargo, addCargo } from '../src/systems/cargo.js';
import { mining } from '../src/systems/mining.js';
import { combat, UNDOCK_INVULN_S } from '../src/systems/combat.js';
import { weapons } from '../src/systems/weapons.js';
import { countermeasures } from '../src/systems/countermeasures.js';
import { wingmen } from '../src/systems/wingmen.js';
import { crafting } from '../src/systems/crafting.js';
import { economy } from '../src/systems/economy.js';
import { factions } from '../src/systems/factions.js';
import { tickProgram } from '../src/systems/alphabet.js';
import { flight } from '../src/systems/flight.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { resolveHudNavStation } from '../src/ui/hud.js';
import { createUiInput } from '../src/ui/input.js';
import { automation } from '../src/systems/automation.js';
import { ai } from '../src/systems/ai.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { aiEncounter } from '../src/systems/aiEncounter.js';
import { intervention } from '../src/systems/intervention.js';
import { sectorSim } from '../src/systems/sectorSim.js';
import { drill, drillTierReqForOre } from '../src/systems/drill.js';
import { claims } from '../src/systems/claims.js';
import { traffic } from '../src/systems/traffic.js';
import * as FlightDynamics from '../src/core/flightDynamics.js';
import { heat } from '../src/systems/heat.js';
import { missions } from '../src/systems/missions.js';
import { DEFAULTS as INPUT_DEFAULTS, input as inputSystem } from '../src/systems/input.js';
import { autoTargetAssist } from '../src/systems/autoTargetAssist.js';
import {
  toggleAutoTarget,
  createAutoTargetRuntime,
} from '../src/combat/autoTargetMode.js';
import { ships, buildSlotList, fittingsFromDefaultModules, getDerivedStats, makeShipEntitySpec, PLAYER_GIMBAL_ARC } from '../src/systems/ships.js';
import { cycleTarget, targetNearestHostileToPlayer } from '../src/ui/uiRoot.js';
import { weaponHeatSummary } from '../src/ui/weaponHeat.js';
import { world } from '../src/systems/world.js';
import { isHostileToPlayer, SCANNER_CONTACT_RANGE } from '../src/systems/scanner.js';
import { SHIPS } from '../src/data/ships.js';
import { SECTORS } from '../src/data/sectors.js';
import { NEW_GAME } from '../src/data/newGameDefaults.js';
import { spawn47aOpeningScene } from '../src/data/scenarios/47aLiveScene.js';

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

function checkEventBusUsesPooledDispatchSnapshots() {
  const bus = createBus();
  const events = [];
  const late = () => events.push('late');
  let removeSecond = null;
  bus.on('evt', () => {
    events.push('first');
    bus.on('evt', late);
    if (removeSecond) removeSecond();
    bus.emit('nested', {});
  });
  removeSecond = bus.on('evt', () => events.push('second'));
  bus.on('nested', () => events.push('nested'));

  const originalIterator = Set.prototype[Symbol.iterator];
  Set.prototype[Symbol.iterator] = function failEventBusIteratorUse() {
    throw new Error('event bus emit should not allocate listener snapshots through Set iteration');
  };
  try {
    bus.emit('evt', {});
  } finally {
    Set.prototype[Symbol.iterator] = originalIterator;
  }

  assert.deepEqual(events, ['first', 'nested', 'second'],
    'event bus should preserve snapshot dispatch semantics without per-emit spread allocation');
}

function checkCoreBuildsRadarContactIndex() {
  function vec(x, z) {
    return {
      x, y: 0, z,
      copy(p) { this.x = p.x; this.y = p.y || 0; this.z = p.z; return this; },
    };
  }
  function entity(id, type, x, z, extra = {}) {
    return {
      id,
      type,
      alive: true,
      collides: false,
      radius: 4,
      pos: vec(x, z),
      prevPos: vec(x, z),
      rot: 0,
      prevRot: 0,
      bank: 0,
      prevBank: 0,
      data: {},
      ...extra,
    };
  }

  const state = createGameState(97);
  state.entities.clear();
  state.entityList.length = 0;
  state.playerId = 1;
  const player = entity(1, 'ship', 0, 0);
  const asteroid = entity(2, 'asteroid', 100, 0);
  const pickup = entity(3, 'pickup', 10, 0);
  const wreck = entity(4, 'wreck', 30, 0);
  const projectile = entity(5, 'projectile', 40, 0);
  const fx = entity(6, 'fx', 50, 0);
  const payload = entity(7, 'payload', 60, 0);
  for (const e of [player, asteroid, pickup, wreck, projectile, fx, payload]) {
    state.entities.set(e.id, e);
    state.entityList.push(e);
  }

  const bus = createBus();
  core.init({ state, bus, helpers: {} });
  core.preStep(1 / 60, state);

  assert(state.entityIndex && state.entityIndex.__spacefaceEntityIndexV1, 'core should build the typed entity index');
  assert.deepEqual(state.entityIndex.radarAsteroids.map((e) => e.id), [asteroid.id],
    'radar asteroid bucket should contain live asteroids');
  assert(state.entityIndex.radarContacts.includes(player),
    'radar contact bucket may include the player; radar draw skips it without rebuilding the list');
  assert(state.entityIndex.radarContacts.includes(pickup), 'radar contact bucket should include pickups');
  assert(state.entityIndex.radarContacts.includes(wreck), 'radar contact bucket should include wrecks');
  assert(state.entityIndex.radarContacts.includes(payload), 'radar contact bucket should preserve non-projectile gameplay payloads');
  assert(!state.entityIndex.radarContacts.includes(projectile), 'radar contact bucket should exclude projectiles');
  assert(!state.entityIndex.radarContacts.includes(fx), 'radar contact bucket should exclude transient fx');
}

function checkCoreSnapshotsOnlyMovableEntities() {
  function vec(x, z, onCopy = null) {
    return {
      x, y: 0, z,
      copy(p) {
        if (onCopy) onCopy();
        this.x = p.x;
        this.y = p.y || 0;
        this.z = p.z;
        return this;
      },
    };
  }
  function entity(id, type, x, z, extra = {}) {
    return {
      id,
      type,
      alive: true,
      collides: true,
      radius: 4,
      pos: vec(x, z),
      prevPos: vec(x - 1, z - 1),
      rot: 0.25,
      prevRot: -9,
      bank: 0.1,
      prevBank: -9,
      data: {},
      ...extra,
    };
  }

  let movableCopies = 0;
  const state = createGameState(98);
  state.entities.clear();
  state.entityList.length = 0;
  const ship = entity(1, 'ship', 10, 0, { prevPos: vec(0, 0, () => { movableCopies++; }) });
  const projectile = entity(2, 'projectile', 20, 0, { prevPos: vec(0, 0, () => { movableCopies++; }) });
  const asteroid = entity(3, 'asteroid', 100, 0, {
    prevPos: vec(0, 0, () => { throw new Error('static asteroid interpolation snapshot should sleep'); }),
  });
  const station = entity(4, 'station', -100, 0, {
    prevPos: vec(0, 0, () => { throw new Error('static station interpolation snapshot should sleep'); }),
  });
  for (const e of [ship, projectile, asteroid, station]) {
    state.entities.set(e.id, e);
    state.entityList.push(e);
  }

  const bus = createBus();
  core.init({ state, bus, helpers: {} });
  core.preStep(1 / 60, state);

  assert.equal(movableCopies, 2, 'core preStep should snapshot interpolation state only for movable entities');
  assert.equal(ship.prevRot, ship.rot, 'movable ship rotation should still be snapshotted for interpolation');
  assert.equal(projectile.prevRot, projectile.rot, 'movable projectile rotation should still be snapshotted for interpolation');
  assert.equal(asteroid.prevRot, -9, 'static asteroid rotation snapshot should be left untouched');
  assert.equal(station.prevBank, -9, 'static station bank snapshot should be left untouched');
  assert(state.entityIndex.asteroids.includes(asteroid), 'static asteroid should still be indexed');
  assert(state.entityIndex.stations.includes(station), 'static station should still be indexed');
  assert(state.entityIndex.movables.includes(ship), 'movable ship should be in movables index');
  assert(state.entityIndex.movables.includes(projectile), 'movable projectile should be in movables index');
}

function checkCoreEntityIndexIsLifecycleDriven() {
  function vec(x, z) {
    return {
      x, y: 0, z,
      copy(p) { this.x = p.x; this.y = p.y || 0; this.z = p.z; return this; },
    };
  }
  function entity(id, type, x, z, extra = {}) {
    return {
      id,
      type,
      alive: true,
      collides: true,
      radius: 4,
      pos: vec(x, z),
      prevPos: vec(x, z),
      rot: 0,
      prevRot: 0,
      bank: 0,
      prevBank: 0,
      data: {},
      ...extra,
    };
  }

  const state = createGameState(99);
  state.entities.clear();
  state.entityList.length = 0;
  state.nextEntityId = 4;
  const ship = entity(1, 'ship', 0, 0, { data: { weapons: [{ defId: 'wpn_pulse_laser_s' }] } });
  const asteroid = entity(2, 'asteroid', 80, 0);
  const station = entity(3, 'station', -120, 0, { data: { stationId: 'station_test' } });
  for (const e of [ship, asteroid, station]) {
    state.entities.set(e.id, e);
    state.entityList.push(e);
  }

  const bus = createBus();
  const helpers = {};
  core.init({ state, bus, helpers });
  core.preStep(1 / 60, state);
  const index = state.entityIndex;
  const firstVersion = index.version;
  assert(index.asteroids.includes(asteroid), 'lifecycle index should include manually seeded asteroids after initial reconcile');
  assert(index.stations.includes(station), 'lifecycle index should include manually seeded stations after initial reconcile');
  assert(index.weaponShips.includes(ship), 'volatile weapon ship bucket should be populated from live ship data');

  ship.data.weapons = [];
  core.preStep(1 / 60, state);
  assert.equal(index.version, firstVersion, 'unchanged entity membership should not churn entityIndex.version every tick');
  assert(!index.weaponShips.includes(ship), 'volatile weapon ship bucket should refresh without a full entity-list rebuild');

  const spawned = helpers.spawnEntity({
    type: 'asteroid',
    pos: { x: 180, z: 0 },
    radius: 5,
    mass: 200,
    hull: 20,
    hullMax: 20,
    data: { typeId: 'ast_test', oreHP: 20 },
  });
  assert(index.asteroids.includes(spawned), 'spawned static asteroid should be indexed immediately');
  const spawnVersion = index.version;
  core.preStep(1 / 60, state);
  assert.equal(index.version, spawnVersion, 'spawned entity should not force a repeated full-index rebuild');

  spawned.alive = false;
  core.lifetimeSweep(1 / 60, state);
  assert(!index.asteroids.includes(spawned), 'swept static asteroid should be removed from asteroid bucket');
  assert(!index.radarAsteroids.includes(spawned), 'swept static asteroid should be removed from radar asteroid bucket');
}
checkCoreEntityIndexIsLifecycleDriven();

function checkProjectileLaunchFullyInheritsShooterVelocity() {
  const state = createGameState(101);
  state.mode = 'flight';
  const spawned = [];
  weapons.init({
    state,
    bus: createBus(),
    helpers: {
      mulberry32,
      hash32,
      spawnEntity(spec) {
        spawned.push(spec);
        return spec;
      },
    },
  });

  const shooter = {
    id: 1,
    type: 'ship',
    alive: true,
    team: 0,
    factionId: 'faction_free',
    radius: 10,
    pos: { x: 0, z: 0 },
    vel: { x: 1158, z: 0 },
    rot: 0,
    data: {},
  };
  const weapon = { defId: 'wpn_pulse_laser_s' };
  const def = { projSpeed: 320, range: 600, dmg: 8, damageType: 'energy' };

  weapons._spawnProjectile(shooter, weapon, def, 0, null, false, state);

  assert.equal(spawned.length, 1, 'pulse laser fire should spawn one projectile');
  const projectile = spawned[0];
  const relativeForwardSpeed = projectile.vel.x - shooter.vel.x;
  assert(Math.abs(relativeForwardSpeed - def.projSpeed) < 1e-9,
    'projectile should leave the muzzle at weapon speed relative to the firing ship');
  assert(relativeForwardSpeed > 0,
    'fast ships must not overtake their own newly fired bullets');
  assert.equal(projectile.data.maxDistance, def.range,
    'projectile should carry a spatial max distance equal to authored weapon range');
  assert(projectile.ttl <= def.range / Math.hypot(projectile.vel.x, projectile.vel.z) + 1e-9,
    'projectile TTL should account for inherited ship velocity');
}
checkProjectileLaunchFullyInheritsShooterVelocity();

function checkDrillInputAcceptsLiveTetherStandard() {
  const state = {
    mode: 'flight',
    ui: {},
    playerId: 1,
    player: { targetId: 2 },
    entities: new Map([
      [1, { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 } }],
      [2, { id: 2, type: 'asteroid', alive: true, radius: 40, pos: { x: 120, z: 0 } }],
    ]),
    combat: {
      attachments: {
        byId: {
          att_live_tether: {
            id: 'att_live_tether',
            state: 'active',
            ownerId: 1,
            targetId: 2,
            defId: 'tether_standard',
          },
        },
      },
    },
  };
  const bus = createBus();
  const events = [];
  bus.on('ui:drillFadeStart', (payload) => events.push({ type: 'drill', payload }));
  bus.on('toast', (payload) => events.push({ type: 'toast', payload }));
  const screenManager = {
    isOpen: () => false,
    getActiveScreenDef: () => null,
    pushScreen() {},
    popScreen() {},
  };

  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  let keydown = null;
  globalThis.document = {
    addEventListener(type, fn) { if (type === 'keydown') keydown = fn; },
    removeEventListener() {},
  };
  globalThis.window = {
    addEventListener() {},
    removeEventListener() {},
  };
  try {
    const router = createUiInput({ state, bus, registry: { get: () => null } }, screenManager);
    assert.equal(typeof keydown, 'function', 'UI input router should register a keydown handler');
    keydown({
      key: 'b',
      code: 'KeyB',
      target: null,
      preventDefault() {},
      stopPropagation() {},
    });
    router.dispose();
  } finally {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }

  assert(events.some((event) => event.type === 'drill' && event.payload.attachmentId === 'att_live_tether'),
    'B drill input should accept the live tether_standard attachment id');
  assert(!events.some((event) => event.type === 'toast' && /No massline link/.test(event.payload && event.payload.text)),
    'B drill input must not reject a visible live tether_standard massline');
}
checkDrillInputAcceptsLiveTetherStandard();

function checkMiningPickupMagnetUsesSpatialHashForCrowdedScenes() {
  const state = createGameState(90);
  state.entities.clear();
  state.entityList.length = 0;
  state.playerId = 1;
  state.player.magnetRange = 100;
  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    collides: true,
    radius: 6,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    flags: {},
    data: {},
  };
  const pulled = {
    id: 2,
    type: 'pickup',
    alive: true,
    collides: true,
    radius: 2.2,
    pos: { x: 80, z: 0 },
    vel: { x: 0, z: 0 },
    data: { kind: 'ore', amount: 1, commodityId: 'cmdty_ore_iron' },
  };
  const collected = {
    id: 3,
    type: 'pickup',
    alive: true,
    collides: true,
    radius: 2.2,
    pos: { x: 2, z: 0 },
    vel: { x: 0, z: 0 },
    data: { kind: 'ore', amount: 1, commodityId: 'cmdty_ore_iron' },
  };
  const pickups = [pulled, collected];
  for (let i = 0; i < 160; i++) {
    pickups.push({
      id: 10 + i,
      type: 'pickup',
      alive: true,
      collides: true,
      radius: 2.2,
      pos: { x: 5000 + i * 80, z: 0 },
      vel: { x: 0, z: 0 },
      data: { kind: 'ore', amount: 1, commodityId: 'cmdty_ore_iron' },
    });
  }
  for (const e of [player, ...pickups]) {
    state.entities.set(e.id, e);
    state.entityList.push(e);
  }
  state.entityIndex = {
    __spacefaceEntityIndexV1: true,
    pickups,
  };
  const events = [];
  const bus = createBus();
  bus.on('pickup:collected', (payload) => events.push(payload));

  mining.init({ state, bus, helpers: {}, registry: { get() { return null; } } });
  state.spatialHash.rebuild(state.entityList);
  mining._updatePickups(1 / 60, state);

  assert(pulled.vel.x < 0, 'nearby pickup should still magnetize toward the player');
  assert.equal(collected.alive, false, 'overlapping pickup should still collect');
  assert.equal(pickups[2].vel.x, 0, 'far pickup should not be touched by magnet updates');
  assert.equal(events.length, 1, 'magnet collection should still emit exactly one pickup event');
  assert.equal(state.miningRuntime.diagnostics.pickupSpatialQueries, 1, 'crowded pickup magnet should query the spatial hash once');
  assert(state.miningRuntime.diagnostics.pickupCandidates < pickups.length,
    'crowded pickup magnet should avoid scanning every pickup in the sector');
}

function checkMiningBeamTargetUsesSpatialHashForCrowdedFields() {
  const state = createGameState(91);
  state.entities.clear();
  state.entityList.length = 0;
  state.playerId = 1;
  state.input.aimAngle = 0;
  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    collides: true,
    radius: 6,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    flags: {},
    data: {},
  };
  const target = {
    id: 2,
    type: 'asteroid',
    alive: true,
    collides: true,
    radius: 12,
    pos: { x: 120, z: 0 },
    vel: { x: 0, z: 0 },
    data: { typeId: 'ast_common_rock' },
  };
  const mineables = [target];
  for (let i = 0; i < 180; i++) {
    mineables.push({
      id: 10 + i,
      type: 'asteroid',
      alive: true,
      collides: true,
      radius: 12,
      pos: { x: 5000 + i * 90, z: 0 },
      vel: { x: 0, z: 0 },
      data: { typeId: 'ast_common_rock' },
    });
  }
  for (const e of [player, ...mineables]) {
    state.entities.set(e.id, e);
    state.entityList.push(e);
  }
  state.entityIndex = {
    __spacefaceEntityIndexV1: true,
    mineables,
  };

  mining.init({ state, bus: createBus(), helpers: {}, registry: { get() { return null; } } });
  state.spatialHash.rebuild(state.entityList);
  const picked = mining._acquireTarget(player, 240, state);

  assert.equal(picked, target, 'mining beam should still pick the aimed nearby asteroid');
  assert.equal(mining._diag.targetSpatialQueries, 1, 'crowded mining target acquisition should use one spatial query');
  assert(mining._diag.targetCandidates < mineables.length,
    'crowded mining target acquisition should avoid scanning every mineable in the sector');
}

function checkPlayerGimbalBears360Degrees() {
  const state = createGameState(198);
  state.mode = 'flight';
  state.playerId = 1;
  const rearAim = Math.PI;
  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    collides: true,
    radius: 8,
    team: 0,
    rot: 0,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    cap: 100,
    flags: {},
    data: {
      weapons: [{
        defId: 'wpn_pulse_laser_s',
        facing: 'front',
        facingAngle: 0,
        gimbalArc: PLAYER_GIMBAL_ARC,
        muzzleOffset: [0.8, 0],
        _cooldown: 0,
        _heat: 0,
        projSpeed: 360,
        range: 600,
        rof: 4,
        energyCost: 1,
        dmg: 8,
      }],
      combat: {},
      derived: { cap: 100 },
    },
  };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.input.fire = true;
  state.input.aimAngle = rearAim;

  const spawned = [];
  weapons.init({
    state,
    bus: createBus(),
    helpers: {
      getEntity: (id) => state.entities.get(id) || null,
      spawnEntity(spec) { spawned.push(spec); return { id: 99, ...spec }; },
      hash32,
      mulberry32,
    },
  });

  const mount = player.data.weapons[0];
  const hardpointDir = weapons._hardpointDir(player, mount, rearAim, 0);
  assert(Math.abs(wrapAngle(hardpointDir - rearAim)) < 0.05,
    'player fixed mount should fire toward a rear/side aim direction, not clamp to nose-forward');
  assert.equal(PLAYER_GIMBAL_ARC, Math.PI, 'player gimbal arc must allow full hull rotation');

  weapons.update(1 / 60, state);
  assert.equal(spawned.length, 1, '_serviceShip tick must spawn when firing with rear aim');
  const shotDir = Math.atan2(spawned[0].vel.z, spawned[0].vel.x);
  assert(Math.abs(wrapAngle(shotDir - rearAim)) < 0.15,
    'projectile spawn direction from _serviceShip must match rear aim, not nose-forward');
  console.log(`[PASS] 360-gimbal hardpointDir=${hardpointDir.toFixed(3)} shotDir=${shotDir.toFixed(3)} rearAim=${rearAim.toFixed(3)}`);
}

function checkRetiredAutoTargetFlagCannotOwnAimOrTrigger() {
  const state = createGameState(199);
  state.mode = 'flight';
  state.playerId = 1;
  state.player.targetId = 2;
  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    collides: true,
    radius: 8,
    team: 0,
    rot: 0,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    cap: 100,
    flags: {},
    data: {
      weapons: [{
        defId: 'wpn_pulse_laser_s',
        facing: 'front',
        facingAngle: 0,
        gimbalArc: PLAYER_GIMBAL_ARC,
        muzzleOffset: [0.8, 0],
        _cooldown: 0,
        _heat: 0,
        projSpeed: 360,
        range: 600,
        rof: 4,
        energyCost: 1,
        dmg: 8,
      }],
      combat: {},
      derived: { cap: 100 },
    },
  };
  const hostile = {
    id: 2,
    type: 'ship',
    alive: true,
    collides: true,
    radius: 8,
    team: 1,
    pos: { x: 0, z: -220 },
    vel: { x: 0, z: 0 },
    data: { ai: { fsm: 'attack' }, combat: { targetId: 1 } },
  };
  state.entities.set(player.id, player);
  state.entities.set(hostile.id, hostile);
  state.entityList.push(player, hostile);
  state.input.autoFire = true;
  state.input.fire = false;
  state.input.aimAngle = 0;

  const spawned = [];
  weapons.init({
    state,
    bus: createBus(),
    helpers: {
      getEntity: (id) => state.entities.get(id) || null,
      spawnEntity(spec) { spawned.push(spec); return { id: 99, ...spec }; },
      hash32,
      mulberry32,
    },
  });
  weapons.update(1 / 60, state);
  assert.equal(spawned.length, 0, 'the retired auto-target flag must never hold the trigger');

  state.input.fire = true;
  weapons.update(1 / 60, state);
  assert.equal(spawned.length, 1, 'manual fire must still spawn a projectile');
  const shotDir = Math.atan2(spawned[0].vel.z, spawned[0].vel.x);
  const towardHostile = Math.atan2(hostile.pos.z - player.pos.z, hostile.pos.x - player.pos.x);
  assert(Math.abs(wrapAngle(shotDir - state.input.aimAngle)) < 0.2,
    'manual fire must follow the independent weapon cursor even if an old input snapshot contains autoFire=true');
  assert(Math.abs(wrapAngle(shotDir - towardHostile)) > 1,
    'the retired flag must not silently restore persistent locked-target aim');
  console.log(`[PASS] retired-autoTarget-inert spawned=${spawned.length} shotDir=${shotDir.toFixed(3)} cursor=${state.input.aimAngle.toFixed(3)}`);
}

function installBrowserStubs() {
  const saved = {
    document: globalThis.document,
    window: globalThis.window,
    addEventListener: globalThis.addEventListener,
    removeEventListener: globalThis.removeEventListener,
    innerWidth: globalThis.innerWidth,
    innerHeight: globalThis.innerHeight,
    performance: globalThis.performance,
  };
  globalThis.document = {
    getElementById: () => null,
    addEventListener() {},
    removeEventListener() {},
    body: { classList: { contains: () => false } },
  };
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  globalThis.addEventListener = () => {};
  globalThis.removeEventListener = () => {};
  globalThis.innerWidth = 800;
  globalThis.innerHeight = 600;
  globalThis.performance = { now: () => 1000 };
  return saved;
}

function restoreBrowserStubs(saved) {
  globalThis.document = saved.document;
  globalThis.window = saved.window;
  globalThis.addEventListener = saved.addEventListener;
  globalThis.removeEventListener = saved.removeEventListener;
  globalThis.innerWidth = saved.innerWidth;
  globalThis.innerHeight = saved.innerHeight;
  globalThis.performance = saved.performance;
}

function initShippedAutoTargetSystems(state, bus) {
  const inputSys = Object.create(inputSystem);
  inputSystem.init.call(inputSys, {
    state,
    bus,
    helpers: { raycastToPlane: (ndc) => ({ x: ndc.x * 300, z: ndc.y * 300 }) },
  });
  inputSys._screen = { x: 520, y: 200, active: true };
  inputSys._ndc = { x: 0.3, y: 1 / 3 };
  inputSys._lastKbmMs = performance.now();
  inputSys._keys = Object.create(null);
  const assistSys = Object.create(autoTargetAssist);
  autoTargetAssist.init.call(assistSys, { state, bus, helpers: {} });
  return { inputSys, assistSys };
}

function runShippedAutoTargetTick(state, dt, ctx) {
  ctx.inputSys.update(dt, state);
  ctx.assistSys.update(dt, state);
}

function checkAutoTargetAssistReinitNoListenerLeak() {
  const saved = installBrowserStubs();
  const listeners = [];
  const origAdd = globalThis.addEventListener;
  const origRemove = globalThis.removeEventListener;
  globalThis.addEventListener = (type, fn, opts) => {
    if (type === 'keydown' || type === 'keyup') listeners.push({ type, fn, opts });
    return origAdd(type, fn, opts);
  };
  globalThis.removeEventListener = (type, fn, opts) => {
    const idx = listeners.findIndex((l) => l.type === type && l.fn === fn);
    if (idx >= 0) listeners.splice(idx, 1);
    return origRemove(type, fn, opts);
  };
  try {
    const state = createGameState(206);
    const bus = createBus();
    const sys = Object.create(autoTargetAssist);
    autoTargetAssist.init.call(sys, { state, bus, helpers: {} });
    assert.equal(listeners.length, 2, 'first init must register keydown+keyup listeners');
    autoTargetAssist.init.call(sys, { state, bus, helpers: {} });
    assert.equal(listeners.length, 2, 're-init must destroy old listeners before attaching new ones');
    autoTargetAssist.destroy.call(sys);
    assert.equal(listeners.length, 0, 'destroy must remove capture-phase listeners');
    console.log('[PASS] autoTargetAssist-reinit listener count stable after destroy');
  } finally {
    globalThis.addEventListener = origAdd;
    globalThis.removeEventListener = origRemove;
    restoreBrowserStubs(saved);
  }
}

function checkPursuitSelectionPreservesCursorAndManualAxes() {
  const saved = installBrowserStubs();
  try {
    const state = createGameState(200);
    state.mode = 'flight';
    state.settings = { gameplay: { controlScheme: 'pilot' }, controls: { bindings: {} } };
    state.playerId = 1;
    state.player.targetId = 2;
    state.input.pointerScreen = { x: 520, y: 200, active: true };
    const player = {
      id: 1, type: 'ship', alive: true, team: 0,
      pos: { x: 0, z: 0 }, rot: 0, vel: { x: 0, z: 0 },
    };
    const hostile = {
      id: 2, type: 'ship', alive: true, team: 1,
      pos: { x: 220, z: 0 }, vel: { x: 0, z: 0 },
      data: { ai: { fsm: 'attack' }, combat: { targetId: 1 } },
    };
    state.entities.set(1, player);
    state.entities.set(2, hostile);
    state.entityList.push(player, hostile);

    const bus = createBus();
    const emits = [];
    bus.on('*', () => {});
    const origEmit = bus.emit.bind(bus);
    bus.emit = (event, payload) => { emits.push({ event, payload }); return origEmit(event, payload); };
    const ctx = initShippedAutoTargetSystems(state, bus);
    assert.equal(toggleAutoTarget(state, bus, createAutoTargetRuntime()), true,
      'G owner must select the current ship target');
    runShippedAutoTargetTick(state, 1 / 60, ctx);

    const hostileAim = Math.atan2(hostile.pos.z - player.pos.z, hostile.pos.x - player.pos.x);
    const cursorAngle = Math.atan2(100, 90);
    assert.equal(state.input.aimWorld.x, 90, 'shipped tick must keep aimWorld.x on the cursor ray');
    assert(Math.abs(state.input.aimWorld.z - 100) < 1e-9, 'shipped tick must keep aimWorld.z on the cursor ray');
    assert(Math.abs(wrapAngle(state.input.aimAngle - cursorAngle)) < 0.02,
      'pursuit assist must not take weapon aim from the cursor');
    assert(Math.abs(wrapAngle(state.input.aimAngle - hostileAim)) > 0.5,
      'locked target pursuit must not imply locked weapon aim');
    assert.equal(state.input.moveX, 0, 'pursuit must not synthesize manual strafe axes');
    assert.equal(state.input.moveZ, 0, 'pursuit must not synthesize manual throttle axes');
    assert.equal(state.input.turnIntent, 0, 'pursuit must not synthesize yaw axes');
    assert.equal(state.input.pursuitSlot.active, true);
    assert.equal(emits.filter((e) => e.event === 'ui:targetNearestHostileToCursor').length, 0,
      'shipped pursuit tick must never emit cursor-nearest target acquisition');
    assert.equal(emits.filter((e) => e.event === 'ui:targetNearestHostileToPlayer').length, 0,
      'shipped pursuit tick must preserve the player-selected lock without quiet refresh');

    console.log(`[PASS] shipped-pursuit-input aimAngle=${state.input.aimAngle.toFixed(3)} cursor=${cursorAngle.toFixed(3)} target=${hostileAim.toFixed(3)} manualAxes=0`);
  } finally {
    restoreBrowserStubs(saved);
  }
}

function checkTargetCycleHostilesOnly() {
  const state = createGameState(201);
  state.playerId = 1;
  const player = {
    id: 1, type: 'ship', alive: true, team: 0, pos: { x: 0, z: 0 },
  };
  const nearHostile = {
    id: 2, type: 'ship', alive: true, team: 1, pos: { x: 120, z: 0 },
    data: { ai: { fsm: 'attack' }, combat: { targetId: 1 } },
  };
  const farHostile = {
    id: 3, type: 'ship', alive: true, team: 1, pos: { x: 280, z: 0 },
    data: { ai: { fsm: 'attack' }, combat: { targetId: 1 } },
  };
  const trader = {
    id: 4, type: 'ship', alive: true, team: 2, pos: { x: 60, z: 0 },
    data: { ai: { passive: true } },
  };
  state.entities.set(1, player);
  state.entities.set(2, nearHostile);
  state.entities.set(3, farHostile);
  state.entities.set(4, trader);
  state.entityList.push(player, nearHostile, farHostile, trader);

  targetNearestHostileToPlayer(state, null, { quiet: true });
  assert.equal(state.player.targetId, nearHostile.id,
    'nearest-hostile selection should pick the closest hostile to the player');

  cycleTarget(state, 1, null);
  assert.equal(state.player.targetId, farHostile.id,
    'Tab cycle should advance only among nearby hostiles');
  assert.notEqual(state.player.targetId, trader.id,
    'Tab cycle must skip non-hostile contacts');

  const beyondWeaponHostile = {
    id: 5, type: 'ship', alive: true, team: 1, pos: { x: 1500, z: 0 },
    data: { ai: { fsm: 'attack' }, combat: { targetId: 1 } },
  };
  state.entities.set(5, beyondWeaponHostile);
  state.entityList.push(beyondWeaponHostile);
  state.player.targetId = beyondWeaponHostile.id;
  targetNearestHostileToPlayer(state, null, { quiet: true });
  assert.equal(state.player.targetId, beyondWeaponHostile.id,
    'quiet refresh must preserve Tab-selected lock while it stays alive');
  targetNearestHostileToPlayer(state, null, { quiet: true });
  assert.equal(state.player.targetId, beyondWeaponHostile.id,
    'repeated quiet refresh must not clobber Tab selection');

  beyondWeaponHostile.alive = false;
  targetNearestHostileToPlayer(state, null, { quiet: true });
  assert.equal(state.player.targetId, nearHostile.id,
    'quiet refresh must re-acquire nearest hostile when the Tab lock dies');
  console.log(`[PASS] target-cycle scannerRange=${SCANNER_CONTACT_RANGE} preservedTab=5 then refresh->${state.player.targetId}`);
}

function checkPursuitGToggleSelectsCurrentLock() {
  const state = createGameState(203);
  state.playerId = 1;
  state.player.targetId = 2;
  const player = { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0 };
  const target = { id: 2, type: 'ship', alive: true, pos: { x: 240, z: 0 }, vel: { x: 0, z: 0 }, rot: 0 };
  state.entities.set(player.id, player);
  state.entities.set(target.id, target);
  const bus = createBus();
  const toasts = [];
  bus.on('toast', (t) => toasts.push(t));

  toggleAutoTarget(state, bus, createAutoTargetRuntime());
  assert.equal(state.input.autoFire, false, 'the persisted legacy action must never enable weapon autoaim');
  assert.equal(state.input.pursuitSlot.active, true, 'G must enable the pursuit slot');
  assert.equal(state.input.pursuitSlot.targetId, target.id, 'G must use the existing player-selected lock');
  assert(toasts.some((t) => /Pursuit assist ON.*movement keys release/.test(t.text)),
    'toggle must explain slot adjustment and instant manual release');
  toggleAutoTarget(state, bus, createAutoTargetRuntime());
  assert.equal(state.input.pursuitSlot.active, false, 'second G press must disable pursuit');
  console.log('[PASS] g-pursuit-toggle selects current lock and never owns weapon aim');
}

function checkPursuitNeverRefreshesPlayerSelectedLock() {
  const saved = installBrowserStubs();
  try {
    const state = createGameState(202);
    state.mode = 'flight';
    state.settings = { gameplay: { controlScheme: 'pilot' }, controls: { bindings: {} } };
    state.playerId = 1;
    state.input.pointerScreen = { x: 400, y: 300, active: true };
    const player = { id: 1, type: 'ship', alive: true, team: 0, pos: { x: 0, z: 0 }, rot: 0, vel: { x: 0, z: 0 } };
    const nearHostile = {
      id: 2, type: 'ship', alive: true, team: 1, pos: { x: 100, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
      data: { ai: { fsm: 'attack' }, combat: { targetId: 1 } },
    };
    const farHostile = {
      id: 3, type: 'ship', alive: true, team: 1, pos: { x: 400, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
      data: { ai: { fsm: 'attack' }, combat: { targetId: 1 } },
    };
    state.entities.set(1, player);
    state.entities.set(2, nearHostile);
    state.entities.set(3, farHostile);
    state.entityList.push(player, nearHostile, farHostile);

    const bus = createBus();
    const allEmits = [];
    const origEmit = bus.emit.bind(bus);
    bus.emit = (event, payload) => {
      allEmits.push({ event, payload });
      return origEmit(event, payload);
    };
    state.player.targetId = nearHostile.id;
    cycleTarget(state, 1, null);
    assert.equal(state.player.targetId, farHostile.id, 'Tab should advance from nearest to farther hostile');

    const ctx = initShippedAutoTargetSystems(state, bus);
    assert.equal(toggleAutoTarget(state, bus, ctx.assistSys._runtime), true);
    for (let i = 0; i < 5; i++) runShippedAutoTargetTick(state, 0.13, ctx);
    assert.equal(state.player.targetId, farHostile.id,
      'shipped pursuit ticks must not clobber the Tab-selected targetId');
    assert.equal(state.input.pursuitSlot.targetId, farHostile.id,
      'the selected slot must remain attached to the same player lock');
    assert.equal(state.input.aimWorld.x, 90,
      'weapon aim must remain on the independent cursor ray');
    assert.equal(emitsCount(allEmits, 'ui:targetNearestHostileToCursor'), 0,
      'pursuit must never emit cursor-nearest acquisition');
    assert.equal(emitsCount(allEmits, 'ui:targetNearestHostileToPlayer'), 0,
      'pursuit must never emit a quiet target refresh');
    console.log(`[PASS] pursuit-preserves-tab targetId=${state.player.targetId} refreshCalls=0`);
  } finally {
    restoreBrowserStubs(saved);
  }
}

function emitsCount(emits, event) {
  return emits.filter((e) => e.event === event).length;
}

function checkWeaponHeatHudSummary() {
  assert.deepEqual(weaponHeatSummary(null), { frac: 0, pct: 0, overheated: false, armed: false },
    'empty loadout should report unarmed weapon heat');
  const warm = weaponHeatSummary([
    { _heat: 36, heatMax: 100 },
    { _heat: 72, heatMax: 100 },
  ]);
  assert.equal(warm.pct, 72, 'HUD heat should track the hottest weapon mount');
  assert.equal(warm.overheated, false, 'sub-max heat must not flag overheated');
  const pegged = weaponHeatSummary([{ _heat: 100, heatMax: 100 }]);
  assert.equal(pegged.pct, 100, 'pegged weapon heat should read 100%');
  assert.equal(pegged.overheated, true, 'pegged weapon heat must flag overheated');

  const hudSrc = readFileSync(new URL('../src/ui/hud.js', import.meta.url), 'utf8');
  assert.match(hudSrc, /weaponHeatSummary\(p\.data && p\.data\.weapons\)/,
    'flight HUD bottom-left HEAT bar must aggregate weapon-instance heat');
  assert.doesNotMatch(hudSrc, /p\.data\.heat/,
    'flight HUD must not read the dead p.data.heat field for the weapon heat bar');
  console.log(`[PASS] weapon-heat-hud warm=${warm.pct}% pegged=${pegged.pct}% overheated=${pegged.overheated}`);
}

function checkNpcFireAtPlayerRequiresRadarVisibility() {
  const run = (x) => {
    const state = createGameState(97);
    state.mode = 'flight';
    state.entities.clear();
    state.entityList.length = 0;
    state.playerId = 1;
    state.ui.radarRange = 4000;
    const player = {
      id: 1,
      type: 'ship',
      alive: true,
      collides: true,
      radius: 8,
      team: 0,
      pos: { x: 0, z: 0 },
      vel: { x: 0, z: 0 },
      rot: 0,
      flags: {},
      data: { weapons: [], combat: {} },
    };
    const attacker = {
      id: 2,
      type: 'ship',
      alive: true,
      collides: true,
      radius: 8,
      team: 1,
      pos: { x, z: 0 },
      vel: { x: 0, z: 0 },
      rot: Math.PI,
      cap: 100,
      flags: {},
      data: {
        weapons: [{ defId: 'wpn_pulse_laser_s' }],
        combat: { targetId: player.id },
        intent: { fire: true, aimAngle: Math.PI },
        ai: { fsm: 'attack' },
      },
    };
    state.entities.set(player.id, player);
    state.entities.set(attacker.id, attacker);
    state.entityList.push(player, attacker);
    state.entityIndex = { __spacefaceEntityIndexV1: true, ships: [player, attacker] };
    const spawned = [];
    weapons.init({
      state,
      bus: createBus(),
      helpers: {
        getEntity: (id) => state.entities.get(id) || null,
        spawnEntity(spec) { spawned.push(spec); return spec; },
        hash32,
        mulberry32,
      },
    });
    weapons.update(1 / 60, state);
    return spawned.length;
  };

  assert.equal(run(4500), 0, 'NPCs targeting the player should not fire from outside compact radar range');
  assert.equal(run(1200), 1, 'NPCs targeting the player should still fire once they are visible on radar');
}

function checkSharedSpatialQueryUsesActiveHashAndFallback() {
  const state = createGameState(94);
  state.entities.clear();
  state.entityList.length = 0;
  const near = {
    id: 1,
    type: 'ship',
    alive: true,
    collides: true,
    radius: 4,
    pos: { x: 8, z: 0 },
  };
  const far = {
    id: 2,
    type: 'ship',
    alive: true,
    collides: true,
    radius: 4,
    pos: { x: 800, z: 0 },
  };
  state.entityList.push(near, far);
  state.spatialHash.rebuild(state.entityList);
  const out = [];

  const spatial = queryNearbyEntities(state, { x: 0, z: 0 }, 32, out, state.entityList);
  assert.equal(spatial, out, 'shared spatial query should reuse caller scratch when the hash is active');
  assert(spatial.includes(near), 'shared spatial query should include nearby collidables');
  assert(!spatial.includes(far), 'shared spatial query should exclude far collidables when the hash is active');

  state.spatialHash.deactivate();
  const fallback = queryNearbyEntities(state, { x: 0, z: 0 }, 32, out, state.entityList);
  assert.equal(fallback, state.entityList, 'shared spatial query should return the fallback source when the hash is inactive');
}

function checkSpatialHashCachesStaticLayer() {
  function vec(x, z) {
    return {
      x, y: 0, z,
      copy(p) { this.x = p.x; this.y = p.y || 0; this.z = p.z; return this; },
    };
  }
  function entity(id, type, x, z, extra = {}) {
    return {
      id,
      type,
      alive: true,
      collides: true,
      radius: type === 'station' ? 42 : 8,
      pos: vec(x, z),
      prevPos: vec(x, z),
      vel: vec(0, 0),
      rot: 0,
      prevRot: 0,
      bank: 0,
      prevBank: 0,
      data: {},
      ...extra,
    };
  }

  const state = createGameState(95);
  state.entities.clear();
  state.entityList.length = 0;
  state.nextEntityId = 4;
  const ship = entity(1, 'ship', 0, 0);
  const asteroid = entity(2, 'asteroid', 96, 0);
  const station = entity(3, 'station', -120, 0, { data: { stationId: 'station_spatial_cache' } });
  for (const e of [ship, asteroid, station]) {
    state.entities.set(e.id, e);
    state.entityList.push(e);
  }

  const helpers = {};
  core.init({ state, bus: createBus(), helpers });
  core.preStep(1 / 60, state);
  physics._rebuildSpatialHash(state);
  const hash = state.spatialHash;
  const staticRebuilds = hash.diagnostics.rebuilds;
  const dynamicRebuilds = hash.diagnostics.dynamicRebuilds;
  const staticBuckets = hash.diagnostics.staticBuckets;
  assert(staticBuckets > 0, 'spatial hash should build a static layer for asteroids/stations');
  assert(hash.diagnostics.dynamicBuckets > 0, 'spatial hash should build a dynamic layer for ships/projectiles/pickups');

  const out = [];
  hash.queryRadius(0, 0, 180, out, { countDiagnostics: false });
  assert(out.includes(ship), 'layered spatial query should include dynamic ships');
  assert(out.includes(asteroid), 'layered spatial query should include static asteroids');
  assert(out.includes(station), 'layered spatial query should include static stations');

  ship.pos.x = 24;
  physics._rebuildSpatialHash(state);
  assert.equal(hash.diagnostics.rebuilds, staticRebuilds,
    'unchanged static colliders should not rebuild the static broadphase layer each tick');
  assert.equal(hash.diagnostics.dynamicRebuilds, dynamicRebuilds + 1,
    'dynamic broadphase layer should still refresh moving colliders');
  assert.equal(hash.diagnostics.staticBuckets, staticBuckets,
    'static broadphase bucket count should stay cached across dynamic refreshes');

  const spawned = helpers.spawnEntity({
    type: 'asteroid',
    pos: { x: 0, z: 160 },
    radius: 10,
    mass: 200,
    hull: 20,
    hullMax: 20,
    data: { typeId: 'ast_test', oreHP: 20 },
  });
  core.preStep(1 / 60, state);
  physics._rebuildSpatialHash(state);
  assert(hash.diagnostics.rebuilds > staticRebuilds,
    'adding a static collider should invalidate and rebuild the static broadphase layer');
  out.length = 0;
  hash.queryRadius(0, 0, 180, out, { countDiagnostics: false });
  assert(out.includes(spawned), 'layered spatial query should include newly spawned static colliders after invalidation');
}

function checkCoreBuildsPhysicsBodyIndexForSg02Layers() {
  function vec(x, z) {
    return {
      x, y: 0, z,
      copy(p) { this.x = p.x; this.y = p.y || 0; this.z = p.z; return this; },
    };
  }
  function entity(id, type, x, z, extra = {}) {
    return {
      id,
      type,
      alive: true,
      collides: true,
      radius: type === 'station' ? 42 : 8,
      pos: vec(x, z),
      prevPos: vec(x, z),
      vel: vec(0, 0),
      rot: 0,
      prevRot: 0,
      bank: 0,
      prevBank: 0,
      data: {},
      ...extra,
    };
  }

  const state = createGameState(196);
  state.entities.clear();
  state.entityList.length = 0;
  const ship = entity(1, 'ship', 0, 0);
  const wreck = entity(2, 'wreck', 48, 0);
  const asteroid = entity(3, 'asteroid', 96, 0);
  const station = entity(4, 'station', -120, 0, { data: { stationId: 'station_sg02_index' } });
  const visualOnly = entity(5, 'fx', 0, 96, { collides: false });
  const tetherPayload = entity(6, 'payload', 32, 32, { collides: false, data: { tetherPayload: true } });
  const beacon = entity(7, 'beacon', 64, 32, { collides: false });
  for (const e of [ship, wreck, asteroid, station, visualOnly, tetherPayload, beacon]) {
    state.entities.set(e.id, e);
    state.entityList.push(e);
  }

  core.init({ state, bus: createBus(), helpers: {} });
  core.preStep(1 / 60, state);

  assert(state.entityIndex.physicsDynamics.includes(ship), 'SG-02 physics index should classify ships as dynamic bodies');
  assert(state.entityIndex.physicsDynamics.includes(wreck), 'SG-02 physics index should classify dynamic wreck bodies separately from spatial statics');
  assert(state.entityIndex.physicsStatics.includes(asteroid), 'SG-02 physics index should keep asteroids as fixed collision bodies');
  assert(state.entityIndex.physicsStatics.includes(station), 'SG-02 physics index should keep stations as fixed collision bodies');
  assert(!state.entityIndex.physicsDynamics.includes(visualOnly), 'SG-02 physics index should skip non-colliding visual-only entities');
  assert(!state.entityIndex.physicsStatics.includes(visualOnly), 'SG-02 physics index should skip non-colliding visual-only fixed bodies');
  assert(state.entityIndex.physicsDynamics.includes(tetherPayload), 'SG-02 physics index should keep authored dynamic payload roles even when gameplay collisions are disabled');
  assert(state.entityIndex.physicsStatics.includes(beacon), 'SG-02 physics index should keep non-FX gameplay bodies in the fixed body layer for deterministic compatibility');
  assert.deepEqual(state.entityIndex.physicsBodies, [ship, wreck, asteroid, station, tetherPayload, beacon],
    'SG-02 physics index should preserve entity-order body creation while excluding visual-only fx');
  assert(state.entityIndex.physicsStaticVersion > 0, 'SG-02 physics static layer should expose an invalidation version');
}

function checkSg02ProductionSyncUsesIndexedBodyLayers() {
  const staticBody = { id: 1, alive: true, type: 'asteroid' };
  const dynamicBody = { id: 2, alive: true, type: 'ship' };
  const state = {
    entityList: nonIterableEntityList(2, 'SG-02 production sync should use indexed physics body layers'),
    entityIndex: {
      __spacefaceEntityIndexV1: true,
      ready: true,
      physicsBodies: [staticBody, dynamicBody],
      physicsStatics: [staticBody],
      physicsDynamics: [dynamicBody],
      physicsStaticVersion: 7,
    },
  };
  const previous = physics._sg02;
  const calls = [];
  physics._sg02 = {
    syncFromEntityLayers(statics, dynamics, version, ordered) {
      calls.push({ statics, dynamics, version, ordered });
    },
    syncFromEntities() {
      throw new Error('SG-02 production sync should not fall back to full entityList iteration when indexed layers are ready');
    },
  };
  try {
    physics._syncSg02DynamicAuthorityEntities(state);
  } finally {
    physics._sg02 = previous || null;
  }
  assert.equal(calls.length, 1, 'SG-02 production sync should call the layered body sync path');
  assert.equal(calls[0].statics, state.entityIndex.physicsStatics, 'SG-02 production sync should pass indexed fixed bodies');
  assert.equal(calls[0].dynamics, state.entityIndex.physicsDynamics, 'SG-02 production sync should pass indexed dynamic bodies');
  assert.equal(calls[0].version, 7, 'SG-02 production sync should pass the static invalidation version');
  assert.equal(calls[0].ordered, state.entityIndex.physicsBodies, 'SG-02 production sync should pass entity-ordered physics bodies for deterministic static refreshes');
}

function checkAutomationNearestAsteroidUsesSpatialCandidates() {
  const state = createGameState(96);
  state.entities.clear();
  state.entityList.length = 0;

  const near = {
    id: 1,
    type: 'asteroid',
    alive: true,
    collides: true,
    radius: 12,
    pos: { x: 120, z: 0 },
    data: { typeId: 'ast_common_rock' },
  };
  const asteroids = [near];
  for (let i = 0; i < 180; i++) {
    asteroids.push({
      id: 10 + i,
      type: 'asteroid',
      alive: true,
      collides: true,
      radius: 12,
      pos: { x: 5000 + i * 90, z: 0 },
      data: { typeId: 'ast_common_rock' },
    });
  }
  for (const e of asteroids) {
    state.entities.set(e.id, e);
    state.entityList.push(e);
  }
  state.entityIndex = {
    __spacefaceEntityIndexV1: true,
    asteroids,
  };

  automation.init({ state, bus: createBus(), helpers: {}, registry: { get() { return null; } } });
  state.spatialHash.rebuild(state.entityList);
  const picked = automation._nearestAsteroid({ x: 0, z: 0 }, 450);

  assert.equal(picked, near, 'automation nearest asteroid should still pick the nearby rock');
  assert.equal(automation._diag.asteroidSpatialQueries, 1,
    'crowded automation asteroid lookup should query nearby asteroids through the spatial hash');
  assert(automation._diag.asteroidCandidates < asteroids.length,
    'crowded automation asteroid lookup should avoid scanning every asteroid in the sector');
}

function checkAlphabetProgramBeaconResolutionUsesIndexedSpatialCandidates() {
  const state = createGameState(97);
  state.entities.clear();
  state.entityList.length = 0;
  state.playerId = 1;
  state.player = state.player || {};
  state.player.cargo = { items: {}, usedVolume: 0, capVolume: 40 };
  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    collides: true,
    radius: 6,
    pos: { x: 0, z: 0 },
    data: {},
  };
  const depot = {
    id: 2,
    type: 'station',
    alive: true,
    collides: true,
    radius: 40,
    pos: { x: 90, z: 0 },
    data: { stationId: 'station_test_depot' },
  };
  const nearRock = {
    id: 3,
    type: 'asteroid',
    alive: true,
    collides: true,
    radius: 12,
    pos: { x: 160, z: 0 },
    data: { typeId: 'ast_common_rock' },
  };
  const asteroids = [nearRock];
  for (let i = 0; i < 180; i++) {
    asteroids.push({
      id: 10 + i,
      type: 'asteroid',
      alive: true,
      collides: true,
      radius: 12,
      pos: { x: 5000 + i * 80, z: 0 },
      data: { typeId: 'ast_common_rock' },
    });
  }
  for (const e of [player, depot, ...asteroids]) {
    state.entities.set(e.id, e);
    state.entityList.push(e);
  }
  state.entityIndex = {
    __spacefaceEntityIndexV1: true,
    dockStations: [depot],
    stations: [depot],
    mineables: asteroids,
    asteroids,
    byStationId: new Map([[depot.data.stationId, depot]]),
  };
  state.spatialHash.rebuild(state.entityList);

  const originalEntityList = state.entityList;
  state.entityList = {
    length: originalEntityList.length,
    [Symbol.iterator]() {
      throw new Error('alphabet beacon resolution should not iterate the full entityList');
    },
  };

  try {
    const diagnostics = {};
    const group = {
      program: { templateId: 'mine_to_depot' },
      programState: { pc: 3, waitT: 0, cargoWasFull: false },
      deployRange: 450,
      originPos: { x: 0, z: 0 },
    };
    let steeredBeacon = null;
    tickProgram(group, {
      state,
      helpers: {},
      group,
      diagnostics,
      steerTo(beacon) { steeredBeacon = beacon; return true; },
      mineIntoCargo() {},
      sellMinedCargo() {},
    }, 1 / 60);
    assert.equal(steeredBeacon && steeredBeacon.entity, nearRock,
      'program field beacon should still resolve to the nearby asteroid');
    assert.equal(diagnostics.alphabetSpatialQueries, 1,
      'program field beacon should query nearby asteroid candidates through the spatial hash');
    assert(diagnostics.alphabetCandidates < asteroids.length,
      'program field beacon should avoid scanning every asteroid in the sector');

    group.programState.pc = 1;
    steeredBeacon = null;
    tickProgram(group, {
      state,
      helpers: {},
      group,
      diagnostics: {},
      steerTo(beacon) { steeredBeacon = beacon; return true; },
      mineIntoCargo() {},
      sellMinedCargo() {},
    }, 1 / 60);
    assert.equal(steeredBeacon && steeredBeacon.entity, depot,
      'program depot beacon should use the indexed dock station list');
  } finally {
    state.entityList = originalEntityList;
  }
}

function checkHudNavStationUsesIndexedLookup() {
  const station = {
    id: 2,
    type: 'station',
    alive: true,
    pos: { x: 120, z: -40 },
    data: { stationId: 'station_hud_nav' },
  };
  const state = {
    entityList: nonIterableEntityList(1, 'HUD nav station lookup should use entityIndex.byStationId instead of iterating entityList'),
    entityIndex: {
      __spacefaceEntityIndexV1: true,
      version: 3,
      byStationId: new Map([[station.data.stationId, station]]),
      stations: [station],
      dockStations: [station],
    },
  };

  assert.equal(resolveHudNavStation(state, station.data.stationId), station,
    'HUD nav station lookup should resolve the live station from byStationId');
  assert.equal(resolveHudNavStation(state, 'station_missing'), null,
    'HUD nav station lookup should return null for an indexed miss without scanning entityList');

  const fallbackStation = { ...station, id: 3, data: { stationId: 'station_hud_nav_fallback' } };
  const staleStation = { ...station, alive: false, data: { stationId: fallbackStation.data.stationId } };
  assert.equal(resolveHudNavStation({
    entityList: nonIterableEntityList(2, 'HUD nav station lookup should stay inside indexed station buckets'),
    entityIndex: {
      __spacefaceEntityIndexV1: true,
      version: 4,
      byStationId: new Map([[fallbackStation.data.stationId, staleStation]]),
      stations: [],
      dockStations: [fallbackStation],
    },
  }, fallbackStation.data.stationId), fallbackStation,
    'HUD nav station lookup should recover from stale byStationId entries using indexed station buckets');
}

function checkAudioThreatScanUsesSpatialShipCandidates() {
  const state = createGameState(98);
  state.entities.clear();
  state.entityList.length = 0;
  state.playerId = 1;
  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    collides: true,
    radius: 8,
    team: 0,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    flags: {},
    data: {},
  };
  const friend = {
    id: 2,
    type: 'ship',
    alive: true,
    collides: true,
    radius: 8,
    team: 0,
    pos: { x: 120, z: 0 },
    vel: { x: 0, z: 0 },
    data: {},
  };
  const deadHostile = {
    id: 3,
    type: 'ship',
    alive: false,
    collides: true,
    radius: 8,
    team: 1,
    pos: { x: 160, z: 0 },
    vel: { x: 0, z: 0 },
    data: {},
  };
  const ships = [player, friend, deadHostile];
  for (let i = 0; i < 3; i++) {
    ships.push({
      id: 10 + i,
      type: 'ship',
      alive: true,
      collides: true,
      radius: 8,
      team: 1,
      pos: { x: 220 + i * 80, z: 0 },
      vel: { x: 0, z: 0 },
      data: {},
    });
  }
  for (let i = 0; i < 180; i++) {
    ships.push({
      id: 100 + i,
      type: 'ship',
      alive: true,
      collides: true,
      radius: 8,
      team: 1,
      pos: { x: 5000 + i * 90, z: 0 },
      vel: { x: 0, z: 0 },
      data: {},
    });
  }
  for (const e of ships) {
    state.entities.set(e.id, e);
    state.entityList.push(e);
  }
  state.entityIndex = {
    __spacefaceEntityIndexV1: true,
    ships,
  };
  state.spatialHash.rebuild(state.entityList);

  const originalEntityList = state.entityList;
  state.entityList = nonIterableEntityList(originalEntityList.length,
    'audio threat scan should use spatial/indexed ship candidates instead of iterating entityList');
  try {
    const scratch = [];
    assert.equal(audioNearbyHostileCount(state, player, 1200, scratch, 3), 3,
      'audio threat scan should still count nearby live hostiles');
    assert(scratch.length < ships.length,
      'audio threat scan should keep the active spatial candidate list smaller than all ships');
    assert.equal(state.spatialHash.diagnostics.queries, 1,
      'audio threat scan should query the spatial hash when it is active');

    state.spatialHash.deactivate();
    assert.equal(audioNearbyHostileCount(state, player, 1200, scratch, 3), 3,
      'audio threat scan should fall back to the indexed ship bucket without scanning entityList');
  } finally {
    state.entityList = originalEntityList;
  }
}

function checkAiTargetSelectionReusesSpatialScratch() {
  const state = createGameState(99);
  state.mode = 'flight';
  state.entities.clear();
  state.entityList.length = 0;
  state.playerId = 1;
  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    collides: true,
    radius: 8,
    team: 0,
    pos: { x: 240, z: 0 },
    vel: { x: 0, z: 0 },
    data: {},
  };
  const npc = {
    id: 2,
    type: 'ship',
    alive: true,
    collides: true,
    radius: 8,
    team: 1,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    data: {
      ai: { archetype: 'swarmer' },
      combat: {},
    },
  };
  const farShips = [];
  for (let i = 0; i < 120; i++) {
    farShips.push({
      id: 10 + i,
      type: 'ship',
      alive: true,
      collides: true,
      radius: 8,
      team: 0,
      pos: { x: 5000 + i * 90, z: 0 },
      vel: { x: 0, z: 0 },
      data: {},
    });
  }
  const ships = [player, npc, ...farShips];
  for (const e of ships) {
    state.entities.set(e.id, e);
    state.entityList.push(e);
  }
  state.entityIndex = {
    __spacefaceEntityIndexV1: true,
    aiShips: [npc],
    ships,
    collidables: ships,
  };

  let calls = 0;
  let firstScratch = null;
  const helpers = {
    queryRadius(pos, radius, out) {
      calls += 1;
      assert(out, 'AI target selection should pass reusable scratch to queryRadius');
      if (firstScratch == null) firstScratch = out;
      assert.equal(out, firstScratch, 'AI target selection should reuse the same query scratch across retargets');
      out.length = 0;
      out.push(player, npc, ...farShips);
      return out;
    },
  };
  ai.init({ state, bus: createBus(), helpers });

  const arch = { sensor: 500, attackR: 300, pref: 180 };
  state.world.currentSectorId = 'sector_pallas_drift';
  state.world.sectors.sector_pallas_drift = { security: 0.35, tier: 2 };
  npc.data.ai.sectorSecurity = 0.35;
  npc.data.ai.sectorTier = 2;
  state.world.activeSector = { gates: [], hazards: [] };
  assert.equal(ai._selectTarget(npc, npc.data, state, player, arch), null,
    'ambient pirates in unsafe sectors should not acquire a neutral player outside lane danger');
  state.world.activeSector = { gates: [{ pos: { x: -1000, z: 0 } }], hazards: [] };
  assert.equal(ai._selectTarget(npc, npc.data, state, player, arch), player,
    'ambient pirates may acquire the player inside an unsafe lane danger pocket');
  npc.data.ai.sectorSecurity = 0.72;
  npc.data.ai.sectorTier = 1;
  state.world.currentSectorId = 'sector_ceres_belt';
  state.world.sectors.sector_ceres_belt = { security: 0.72, tier: 1 };
  state.world.activeSector = { gates: [{ pos: { x: -1000, z: 0 } }], hazards: [] };
  assert.equal(ai._selectTarget(npc, npc.data, state, player, arch), null,
    'ambient pirates in lawful station space should not acquire the player from sensor range alone');
  ai._addThreat(npc.id, player.id, 10);
  assert.equal(ai._selectTarget(npc, npc.data, state, player, arch), player,
    'AI target selection should still acquire the player after real threat is established');
  assert.equal(calls, 4, 'AI target selection should query spatial candidates on each retarget');
}

function checkTrafficUsesEntityIndexesForStationsAndAsteroids() {
  const state = createGameState(100);
  state.mode = 'flight';
  state.entities.clear();
  state.entityList.length = 0;
  const station = {
    id: 1,
    type: 'station',
    alive: true,
    collides: true,
    radius: 40,
    factionId: 'faction_free',
    pos: { x: 0, z: 0 },
    data: { stationId: 'station_traffic_indexed' },
  };
  const gate = {
    id: 2,
    type: 'station',
    alive: true,
    collides: true,
    radius: 40,
    factionId: 'faction_free',
    pos: { x: 1000, z: 0 },
    data: { isGate: true, stationId: 'gate_should_not_route_traffic' },
  };
  const rock = {
    id: 3,
    type: 'asteroid',
    alive: true,
    collides: true,
    radius: 14,
    pos: { x: 220, z: 0 },
    data: { typeId: 'ast_common_rock' },
  };
  const miner = {
    id: 4,
    type: 'ship',
    alive: true,
    collides: true,
    radius: 8,
    factionId: 'faction_free',
    team: 2,
    pos: { x: 0, z: 0 },
    rot: 0,
    data: { ai: { passive: true }, combat: {} },
  };
  const asteroids = [rock];
  for (let i = 0; i < 120; i++) {
    asteroids.push({
      id: 10 + i,
      type: 'asteroid',
      alive: true,
      collides: true,
      radius: 14,
      pos: { x: 5000 + i * 80, z: 0 },
      data: { typeId: 'ast_common_rock' },
    });
  }
  for (const e of [station, gate, rock, miner, ...asteroids.slice(1)]) {
    state.entities.set(e.id, e);
    state.entityList.push(e);
  }
  state.entityIndex = {
    __spacefaceEntityIndexV1: true,
    dockStations: [station],
    stations: [station, gate],
    gates: [gate],
    asteroids,
  };
  traffic.init({ state, bus: createBus(), helpers: {} });
  state.traffic.freighters = [{
    id: miner.id,
    role: 'miner',
    targetId: -1,
    waitT: 0,
    nextTradeT: 0,
  }];

  const originalEntityList = state.entityList;
  state.entityList = nonIterableEntityList(originalEntityList.length,
    'traffic should use entityIndex buckets instead of iterating or filtering entityList during flight updates');
  try {
    assert.equal(traffic._sectorStations(), state.entityIndex.dockStations,
      'traffic station lookup should reuse the indexed non-gate station bucket');
    traffic.update(1 / 60, state);
  } finally {
    state.entityList = originalEntityList;
  }

  assert(asteroids.some((entry) => entry.id === state.traffic.freighters[0].targetId),
    'miner traffic should select an indexed live asteroid without a full-world filter allocation');
  assert.equal(miner.data.intent.fire, false, 'traffic miner should still publish passive movement intent');
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
  state.aiEncounter = {
    schemaVersion: AI_CONTRACT_VERSION,
    nextSeq: 42,
    commands: [{ seq: 41, type: 'request_reinforcement', packageId: 'fixture_wing_pair' }],
    owner: { lastAppliedSeq: 40, pendingReinforcements: [{ id: 'stale' }] },
  };
  const data = save.serializeData();

  assert.equal(data.missions.nextId, 2, 'save should use missions.serialize');
  assert.equal(data.missions.missions, undefined, 'mission payload should not use legacy wrapper');
  assert.equal(data.automation.nextId, 4, 'save should use automation.serialize');
  assert.equal(data.aiEncounter, undefined, 'save should not persist transient SG-06 encounter state');

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

// Claims (claimed bases + their modules) were previously NOT serialized — a documented TODO that
// meant a player's bases vanished on reload. Now claims.serialize()/deserialize() capture state.claims
// and the save system delegates to them. The module-level _nextClaimId counter is NOT serialized —
// deserialize re-derives it from the highest restored claim id, which is robust to legacy saves and
// direct edits. Guards the wiring end-to-end.
function checkClaimsSerializeAndReload() {
  const state = makeSaveState();
  const systems = {
    economy: { serialize: () => ({}) },
    factions: { serialize: () => ({}) },
    world: { serialize: () => ({}) },
    missions: { serialize: () => ({ boards: {}, active: [], completedLog: [], nextId: 1, story: { beatIndex: 0 } }) },
    automation: { serialize: () => ({}) },
    crafting: { serialize: () => ({}) },
    sectorSim: { serialize: () => ({}) },
    claims,
  };

  claims.state = state;
  save.state = state;
  save.registry = { get: (name) => systems[name] || null };

  // Seed a claimed body with modules built on it (the real persisted shape).
  state.claims = { bodies: [] };
  claims.newGame();
  state.claims.bodies.push({
    id: 'claim_1', sectorId: 'sector_pallas_drift', poiId: 'poi_colony', name: 'Pallas Moon',
    size: 'M', slots: 3, modules: ['mod_depot', 'mod_refinery'], linkedStationId: 'station_pallas',
    x: 100, z: -50, claimedAt: 500,
  });

  // Serialize captures the body (no counter — it's re-derived on load).
  const data = save.serializeData();
  assert.ok(data.claims && Array.isArray(data.claims.bodies), 'save should include a claims.bodies array');
  assert.equal(data.claims.bodies.length, 1, 'save should capture the claimed body');
  assert.equal(data.claims.bodies[0].poiId, 'poi_colony', 'saved body should keep its POI linkage');
  assert.deepEqual(data.claims.bodies[0].modules, ['mod_depot', 'mod_refinery'], 'saved body should keep its built modules');

  // Deserialize restores into a fresh state (simulating reload).
  state.claims = { bodies: [] };
  claims.deserialize(data.claims);
  assert.equal(state.claims.bodies.length, 1, 'reload should restore the claimed body');
  assert.equal(state.claims.bodies[0].id, 'claim_1', 'restored body keeps its id');
  assert.deepEqual(state.claims.bodies[0].modules, ['mod_depot', 'mod_refinery'], 'restored body keeps its modules');
  assert.equal(state.claims.bodies[0].linkedStationId, 'station_pallas', 'restored body keeps its teleporter link');

  // Missing/legacy payload (pre-serialization saves) degrades cleanly, not crash.
  claims.deserialize(undefined);
  assert.deepEqual(state.claims.bodies, [], 'missing claims payload should clear to empty, not crash');

  // The id counter re-derives past the highest restored claim id, so the next claim() can't collide.
  // Observe by restoring a high-id body, then claiming a fresh one and checking its id is higher.
  claims.newGame();
  claims.deserialize({ bodies: [{ id: 'claim_7', poiId: 'poi_x', modules: [] }] });
  state.player = { credits: 999999, researchedNodes: ['tech_outpost_charter'] };
  // claim() needs a POI; call it directly and inspect the assigned id.
  state.world = { currentSectorId: 'sector_pallas_drift' };
  claims.bus = { emit() {} };
  claims.claim({ id: 'poi_new', name: 'New', size: 'M', pos: { x: 0, z: 0 } });
  const newId = state.claims.bodies[state.claims.bodies.length - 1].id;
  assert.ok(newId && /^claim_(\d+)$/.test(newId) && parseInt(newId.slice(6), 10) >= 8,
    'next claim id (' + newId + ') must be > the highest restored id (claim_7) — no collision');
}

function checkNewGameHooksClearTransientRuntimeState() {
  const state = createGameState(222);
  const bus = createBus();
  const ctx = { state, bus, helpers: {}, registry: { get() { return null; } } };

  crafting.init(ctx);
  aiEncounter.init(ctx);
  intervention.init(ctx);
  sectorSim.init(ctx);
  drill.init(ctx);
  claims.init(ctx);
  traffic.init(ctx);

  state.crafting.queues.station_alpha = { bpId: 'bp_build_pulse_laser_s', elapsed: 19, total: 20, done: false };
  state.aiEncounter = {
    schemaVersion: AI_CONTRACT_VERSION,
    nextSeq: 12,
    commands: [{ seq: 11, type: 'request_reinforcement', packageId: 'fixture_wing_pair' }],
    owner: { lastAppliedSeq: 10, pendingReinforcements: [{ id: 'old', dueTick: 0 }], spawned: [{ id: 'old_spawn' }] },
  };
  state.interventions = [{ id: 'old_intervention', wreckEntityId: 999 }];
  state.interventionMeta = { rngSeed: 1234 };
  state.drill = { active: true, asteroidId: 'old_rock' };
  state.claims.bodies.push({ id: 'claim_old', poiId: 'poi_old', modules: [] });
  state.traffic.freighters.push({ id: 88 });
  state.sectorSim.meta.rngSeed = hash32(111, 'sectorSim') >>> 0;

  state.meta.seed = 333;
  for (const sys of [crafting, aiEncounter, intervention, sectorSim, drill, claims, traffic]) sys.newGame();

  assert.deepEqual(state.crafting.queues, {}, 'new game should clear crafting queues');
  assert.deepEqual(state.aiEncounter.commands, [], 'new game should clear pending AI encounter commands');
  assert.deepEqual(state.aiEncounter.owner.pendingReinforcements, [], 'new game should clear scheduled AI reinforcements');
  assert.deepEqual(state.interventions, [], 'new game should clear active interventions');
  assert.equal(state.interventionMeta.rngSeed, hash32(333, 'intervention') >>> 0, 'intervention rng should follow new seed');
  assert.equal(state.drill, null, 'new game should close active drill sessions');
  assert.deepEqual(state.claims.bodies, [], 'new game should clear claimed bodies');
  assert.deepEqual(state.traffic.freighters, [], 'new game should clear traffic runtime records');
  assert.equal(state.traffic.rngSeed, hash32(333, 'traffic', 'boot') >>> 0, 'traffic rng should follow new seed');
  assert.equal(state.sectorSim.meta.rngSeed, hash32(333, 'sectorSim') >>> 0, 'sector sim rng should follow new seed');
}

function checkDrillRewardsUseCanonicalCommodities() {
  const state = createGameState(44);
  const bus = createBus();
  const ctx = { state, bus, helpers: {}, registry: { get() { return null; } } };
  cargo.init(ctx);
  drill.init(ctx);
  state.player.cargo.capVolume = 100;
  state.player.cargo.capMass = 100;

  for (const ore of ['cmdty_silicate', 'cmdty_ice_water']) {
    state.drill = {
      asteroidId: 'test_rock',
      field: [[
        { type: 'empty', hp: 0, maxHp: 0, ore: null, hazard: false },
        { type: 'vein', hp: 1, maxHp: 1, ore, yieldU: 2, hazard: false },
      ]],
      avatar: { col: 0, row: 0 },
      drillDir: null,
      accumulator: 0,
      gasHits: 0,
      yieldLog: {},
      active: true,
    };
    const before = state.player.cargo.items[ore] || 0;
    drill.drillVertical(1, 1);
    assert.equal(state.player.cargo.items[ore], before + 2, `drill should award ${ore}`);
    assert.equal(state.drill.yieldLog[ore], 2, `drill yield log should record ${ore}`);
  }
}

function checkDrillOreTierReqIsStablePerOre() {
  const state = createGameState(77);
  const bus = createBus();
  const ctx = { state, bus, helpers: {}, registry: { get() { return null; } } };
  drill.init(ctx);

  assert.equal(drillTierReqForOre('cmdty_ore_iron'), 1, 'tier-0 ore should need MK1');
  assert.equal(drillTierReqForOre('cmdty_ore_bronzium'), 2, 'nickel ore should always need MK2');
  assert.equal(drillTierReqForOre('cmdty_ore_copper'), 2, 'copper should always need MK2');
  assert.equal(drillTierReqForOre('cmdty_gem_ruby'), 4, 'tier-4 gems should need MK4');

  for (const asteroidId of ['shallow_vein_test', 'deep_vein_test', 'mixed_depth_rock']) {
    drill.begin(asteroidId);
    const field = state.drill?.field;
    assert.ok(field, `drill field should generate for ${asteroidId}`);
    for (let c = 0; c < field.length; c++) {
      for (let r = 0; r < field[c].length; r++) {
        const tile = field[c][r];
        if (!tile || tile.type !== 'vein' || !tile.ore) continue;
        assert.equal(
          tile.tierReq,
          drillTierReqForOre(tile.ore),
          `${tile.ore} at col ${c} row ${r} in ${asteroidId} should use ore-based tier gate`,
        );
      }
    }
    drill.end();
  }
}

function checkClaimRefineryOutputsCanonicalCommodities() {
  const state = createGameState(55);
  const bus = createBus();
  const ctx = { state, bus, helpers: {}, registry: { get() { return null; } } };
  cargo.init(ctx);
  claims.init(ctx);
  state.player.cargo.capVolume = 100;
  state.player.cargo.capMass = 100;
  addCargo(state, 'cmdty_silicate', 2);
  claims._tickRefinery({ _refineAcc: 0 }, 2);

  assert.equal(state.player.cargo.items.cmdty_silicate, undefined, 'claim refinery should consume silicate');
  assert.equal(state.player.cargo.items.cmdty_polymers, 1, 'claim refinery should grant a canonical output commodity');
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
    physicsBody: {
      schemaVersion: 1,
      mass: 42,
      inertiaY: 77,
      radius: 9,
      dynamic: true,
      ccd: true,
      revision: 3,
      thrusters: [{ id: 'drive-port', health: 0.5, forward: 1, reverse: 0.8, strafe: 0.4, yaw: 0.7 }],
    },
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
  assert.equal(savedPlayer.angVel, 2.75, 'save should keep authoritative yaw-rate for SG-02 dynamic bodies');
  assert.equal(savedPlayer.hull, 88, 'save should keep persistent player vitals');
  assert.equal(savedPlayer.physicsBody.mass, 42, 'save should keep authored dynamic body mass');
  assert.equal(savedPlayer.physicsBody.thrusters[0].health, 0.5, 'save should keep dynamic thruster damage state');
  assert.equal(savedPlayer.flags.persistent, true, 'save should keep persistent entity flags');
  assert.equal(savedPlayer.flags.invuln, undefined, 'save should drop transient player dock/launch protection');
  assert.equal(savedPlayer.flags.boosting, undefined, 'save should drop transient sustained boost flag');
  assert.equal(savedPlayer.flags.noInterp, undefined, 'save should drop transient interpolation flag');
  assert.equal(savedPlayer.boost.energy, 63, 'save should keep public boost resource state');
  assert.equal(savedPlayer.boost.dashCdT, 0.75, 'save should keep public boost cooldown state');
  assert.equal(savedPlayer.boost._boostHoldT, undefined, 'save should drop private boost hold timer');
  assert.equal(savedPlayer.boost._dashCandidate, undefined, 'save should drop private dash gesture state');
  assert.equal(savedPlayer.boost._boostArmed, undefined, 'save should drop private boost edge state');
  assert.equal(savedPlayer.prevPos, undefined, 'save should drop interpolation position history');
  assert.equal(savedPlayer.prevRot, undefined, 'save should drop interpolation rotation history');
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
    aiEncounter: {
      schemaVersion: AI_CONTRACT_VERSION,
      nextSeq: 99,
      commands: [{ seq: 98, type: 'request_reinforcement', packageId: 'fixture_wing_pair' }],
      owner: {
        lastAppliedSeq: 97,
        pendingReinforcements: [{ id: 'stale_reinforcement', dueTick: 1 }],
        spawned: [{ id: 'stale_spawn' }],
      },
    },
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
  assert.deepEqual(
    state.aiEncounter,
    { schemaVersion: AI_CONTRACT_VERSION, nextSeq: 1, commands: [] },
    'load should clear transient SG-06 encounter commands and owner state',
  );
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

function checkLoadRepairsMalformedPlayerSaveIntoPlayableShip() {
  const state = createGameState(123);
  state.mode = 'menu';
  createTimeEffects(state).set('fixture:menu', { scale: 0 });
  const events = [];
  const makeVec = (x = 0, z = 0) => ({
    x, y: 0, z,
    set(nx, ny, nz) { this.x = nx; this.y = ny || 0; this.z = nz; return this; },
    copy(pos) { this.x = pos.x || 0; this.y = pos.y || 0; this.z = pos.z || 0; return this; },
  });
  const helpers = {
    spawnEntity(spec) {
      const ent = {
        id: state.nextEntityId++,
        ...spec,
        alive: spec.alive !== false,
        flags: Object.assign({}, spec.flags || {}),
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
  };
  const registry = {
    get(name) {
      return {
        economy: { deserialize() {} },
        factions: { deserialize() {} },
        world: {
          deserialize(data) {
            state.world.currentSectorId = data && data.currentSectorId;
            if (data && data.fuel) state.fuel = data.fuel;
          },
          enterSector(sectorId) { state.world.currentSectorId = sectorId; },
        },
        ships: { recomputeActiveShip() {} },
        cargo: { recompute() {} },
        automation: { deserialize() {} },
        crafting: { deserialize() {} },
        sectorSim: { deserialize() {} },
        claims: { deserialize() {} },
      }[name] || null;
    },
  };

  save.state = state;
  save.bus = { emit(event, payload) { events.push({ event, payload }); } };
  save.helpers = helpers;
  save.registry = registry;

  const ok = save.loadEnvelope({
    fmt: 'spaceface-save',
    version: 5,
    slot: 'bad-latest',
    data: {
      meta: { seed: 44, playtimeS: 0, createdAt: 'bad', lastSavedAt: 'bad' },
      player: { credits: 123, ownedShips: [], activeShipIndex: 99 },
      cargo: { items: {}, capVolume: 0, capMass: 0 },
      economy: {},
      factions: {},
      world: { currentSectorId: null, fuel: { current: 0, max: 0 } },
      entities: {
        player: {
          type: 'ship',
          alive: false,
          pos: { x: 12, z: -4 },
          vel: { x: 0, z: 0 },
          data: {},
          hull: 0,
          hullMax: 0,
          shield: 0,
          shieldMax: 0,
          cap: 0,
          capMax: 0,
        },
        persistent: [],
        simTime: 0,
        tick: 0,
      },
      missions: { boards: {}, active: [], completedLog: [], nextId: 1, story: { beatIndex: 0 } },
      automation: {},
      crafting: { queues: {} },
      settings: {},
    },
  }, 'bad-latest');

  assert.equal(ok, true, 'repairable malformed player save should load');
  const player = state.entities.get(state.playerId);
  assert(player, 'repaired save should create a player entity');
  assert.equal(player.alive, true, 'repaired player entity should be alive');
  assert.equal(player.type, 'ship', 'repaired player entity should be a ship');
  assert.equal(player.data.defId, NEW_GAME.shipId, 'repaired save should fall back to the canonical starter ship');
  assert(player.hull > 0 && player.hullMax > 0, 'repaired player should have nonzero hull');
  assert(player.capMax > 0, 'repaired player should have a capacitor');
  assert(Array.isArray(player.data.weapons) && player.data.weapons.length > 0, 'repaired player should have a starter weapon');
  assert.equal(state.world.currentSectorId, NEW_GAME.startingSectorId, 'malformed world save should fall back to the starting sector');
  assert(state.fuel.current > 0 && state.fuel.max > 0, 'malformed fuel save should be repaired to a playable tank');
  assert.equal(state.mode, 'flight', 'repaired save should enter flight only after a playable ship exists');
}

function checkSaveLoadDefersFlightWhenAuthoredVisualGateExists() {
  const state = createGameState(124);
  state.mode = 'menu';
  createTimeEffects(state).set('fixture:menu', { scale: 0 });
  const events = [];
  let finalizePayload = null;
  const makeVec = (x = 0, z = 0) => ({
    x, y: 0, z,
    set(nx, ny, nz) { this.x = nx; this.y = ny || 0; this.z = nz; return this; },
    copy(pos) { this.x = pos.x || 0; this.y = pos.y || 0; this.z = pos.z || 0; return this; },
  });
  const helpers = {
    spawnEntity(spec) {
      const ent = {
        id: state.nextEntityId++,
        ...spec,
        alive: spec.alive !== false,
        flags: Object.assign({}, spec.flags || {}),
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
    finalizeLoadedGame(payload) {
      finalizePayload = payload;
      assert.equal(state.mode, 'loading', 'load finalizer should see loading mode until authored visuals are ready');
      assert.equal(state.timeScale, 0, 'load finalizer should see the sim frozen until authored visuals are ready');
    },
  };
  const registry = {
    get(name) {
      return {
        economy: { deserialize() {} },
        factions: { deserialize() {} },
        world: {
          deserialize(data) {
            state.world.currentSectorId = data && data.currentSectorId;
            if (data && data.fuel) state.fuel = data.fuel;
          },
          enterSector(sectorId) { state.world.currentSectorId = sectorId; },
        },
        ships: { recomputeActiveShip() {} },
        cargo: { recompute() {} },
        automation: { deserialize() {} },
        crafting: { deserialize() {} },
        sectorSim: { deserialize() {} },
        claims: { deserialize() {} },
      }[name] || null;
    },
  };

  save.state = state;
  save.bus = { emit(event, payload) { events.push({ event, payload }); } };
  save.helpers = helpers;
  save.registry = registry;

  const ok = save.loadEnvelope({
    fmt: 'spaceface-save',
    version: 5,
    slot: 'visual-gated',
    data: {
      meta: { seed: 44, playtimeS: 0, createdAt: 'gate', lastSavedAt: 'gate' },
      player: { credits: 123, ownedShips: [], activeShipIndex: 99 },
      cargo: { items: {}, capVolume: 0, capMass: 0 },
      economy: {},
      factions: {},
      world: { currentSectorId: null, fuel: { current: 0, max: 0 } },
      entities: {
        player: {
          type: 'ship',
          alive: false,
          pos: { x: 12, z: -4 },
          vel: { x: 0, z: 0 },
          data: {},
          hull: 0,
          hullMax: 0,
          shield: 0,
          shieldMax: 0,
          cap: 0,
          capMax: 0,
        },
        persistent: [],
        simTime: 0,
        tick: 0,
      },
      missions: { boards: {}, active: [], completedLog: [], nextId: 1, story: { beatIndex: 0 } },
      automation: {},
      crafting: { queues: {} },
      settings: {},
    },
  }, 'visual-gated');

  assert.equal(ok, true, 'visual-gated repaired save should load');
  assert.deepEqual(finalizePayload, { slot: 'visual-gated' }, 'save restore should hand the slot to the authored visual finalizer');
  assert.equal(state.mode, 'loading', 'visual-gated load should not enter flight before the finalizer releases it');
  assert.equal(state.timeScale, 0, 'visual-gated load should keep simulation frozen before authored visuals are ready');
  assert(events.some((e) => e.event === 'mode:changed' && e.payload.mode === 'loading'),
    'visual-gated load should publish loading mode instead of a transient flight frame');
  assert(events.some((e) => e.event === 'save:loaded' && e.payload.visualGatePending === true),
    'save:loaded should tell runtime listeners that authored visual finalization is pending');
}

function checkLoadRejectsUnrepairablePlayerEntityBeforeRestore() {
  const state = createGameState(321);
  state.mode = 'flight';
  state.playerId = 77;
  const livePlayer = { id: 77, type: 'ship', alive: true, pos: { x: 1, z: 2 }, data: { defId: 'ship_kestrel' } };
  state.entities.set(livePlayer.id, livePlayer);
  state.entityList.push(livePlayer);
  const events = [];

  save.state = state;
  save.bus = { emit(event, payload) { events.push({ event, payload }); } };
  save.helpers = {
    spawnEntity() { throw new Error('restore should not spawn for invalid player save'); },
    getEntity(id) { return state.entities.get(id); },
  };
  save.registry = { get() { throw new Error('restore should not reach registry for invalid player save'); } };

  const ok = save.loadEnvelope({
    fmt: 'spaceface-save',
    version: 5,
    slot: 'bad-station',
    data: {
      meta: { seed: 55 },
      player: { credits: 0 },
      cargo: {},
      world: { currentSectorId: 'sector_helios_prime' },
      entities: { player: { type: 'station', pos: { x: 0, z: 0 } }, persistent: [] },
      missions: {},
      automation: {},
      settings: {},
    },
  }, 'bad-station');

  assert.equal(ok, false, 'unrepairable non-ship player save should be rejected');
  assert.equal(state.playerId, 77, 'rejected invalid save should not clear player id');
  assert.equal(state.entities.get(77), livePlayer, 'rejected invalid save should leave live entity graph untouched');
  assert(events.some((e) => e.event === 'save:error' && e.payload.reason === 'invalid_player'), 'invalid save should emit invalid_player');
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

function checkCombatPrefersAuthoredProjectilePacket() {
  const events = [];
  const state = {
    playerId: 1,
    tick: 12,
    simTime: 0.2,
    meta: { seed: 123 },
    entities: new Map(),
    entityList: [],
    combat: { beams: [], threatTables: new Map() },
  };
  const attacker = {
    id: 1,
    type: 'ship',
    team: 0,
    alive: true,
    flags: {},
    pos: { x: 0, z: 0 },
    data: {},
  };
  const target = {
    id: 2,
    type: 'ship',
    team: 1,
    alive: true,
    flags: {},
    pos: { x: 40, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 8,
    mass: 10,
    hull: 150,
    hullMax: 150,
    shield: 0,
    shieldMax: 0,
    armorHp: 0,
    armorMax: 0,
    armorFlat: 0,
    data: { combatProfileId: 'combat_profile_standard_ship', derived: { damageReductionMult: 1 } },
  };
  for (const entity of [attacker, target]) {
    state.entities.set(entity.id, entity);
    state.entityList.push(entity);
  }

  combat.state = state;
  combat.bus = { emit(event, payload) { events.push({ event, payload }); } };
  combat.helpers = {};
  combat.registry = { get() { return null; } };
  combat.kernel = null;

  combat.onHit({
    targetId: target.id,
    ownerId: attacker.id,
    damage: 999,
    damageType: 'kinetic',
    pos: { x: 40, z: 0 },
    damagePacket: scalarHitToDamagePacket({ damage: 10, damageType: 'energy', penetration: 0.25 }),
    weaponId: 'wpn_packet_fixture',
  });

  const routed = state.combat.trace.events.find((event) => event.kind === 'damage.routed');
  assert.equal(routed.origin.kind, 'weapon', 'authored projectile packet should route as weapon-origin damage');
  assert.equal(routed.origin.id, 'wpn_packet_fixture', 'weapon-origin trace should preserve weapon id');
  assert.equal(routed.rawTotal, 10, 'combat should prefer the canonical packet over legacy scalar damage');
  assert(Math.abs(routed.channels.thermal - 7.2) < 1e-9, 'energy packet should preserve thermal split');
  assert(Math.abs(routed.channels.ion - 2.8) < 1e-9, 'energy packet should preserve ion split');
  assert(target.hull < target.hullMax, 'authored projectile packet should apply real damage');
  assert(events.some((e) => e.event === 'combat:damage' && e.payload.origin.kind === 'weapon'), 'combat damage event should expose weapon-origin metadata');

  combat.kernel = null;
}

function checkBeamDamageUsesSpatialCandidatesForCrowdedScenes() {
  const state = createGameState(95);
  state.entities.clear();
  state.entityList.length = 0;
  state.combat = { beams: [], threatTables: new Map() };
  const events = [];
  const attacker = {
    id: 1,
    type: 'ship',
    team: 0,
    alive: true,
    collides: true,
    flags: {},
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 8,
    hull: 100,
    hullMax: 100,
    shield: 0,
    shieldMax: 0,
    cap: 100,
    capMax: 100,
    data: {},
  };
  const target = {
    id: 2,
    type: 'ship',
    team: 1,
    alive: true,
    collides: true,
    flags: {},
    pos: { x: 100, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 8,
    hull: 100,
    hullMax: 100,
    shield: 0,
    shieldMax: 0,
    cap: 100,
    capMax: 100,
    armorHp: 0,
    armorMax: 0,
    armorFlat: 0,
    data: { combatProfileId: 'combat_profile_standard_ship', derived: { damageReductionMult: 1 } },
  };
  const damageables = [attacker, target];
  for (let i = 0; i < 180; i++) {
    damageables.push({
      id: 10 + i,
      type: 'ship',
      team: 1,
      alive: true,
      collides: true,
      flags: {},
      pos: { x: 5000 + i * 90, z: 0 },
      vel: { x: 0, z: 0 },
      radius: 8,
      hull: 100,
      hullMax: 100,
      shield: 0,
      shieldMax: 0,
      cap: 100,
      capMax: 100,
      armorHp: 0,
      armorMax: 0,
      armorFlat: 0,
      data: { combatProfileId: 'combat_profile_standard_ship', derived: { damageReductionMult: 1 } },
    });
  }
  for (const e of damageables) {
    state.entities.set(e.id, e);
    state.entityList.push(e);
  }
  state.entityIndex = {
    __spacefaceEntityIndexV1: true,
    ships: damageables,
    damageables,
  };
  state.combat.beams.push({
    ownerId: attacker.id,
    weaponId: 'wpn_beam_fixture',
    from: { x: 0, z: 0 },
    to: { x: 200, z: 0 },
    dpsThisTick: 10,
    dmgType: 'energy',
    damagePacket: scalarHitToDamagePacket({ damage: 10, damageType: 'energy' }),
  });

  combat.init({
    state,
    bus: { on() {}, emit(event, payload) { events.push({ event, payload }); } },
    helpers: {},
    registry: { get() { return null; } },
  });
  state.spatialHash.rebuild(state.entityList);
  combat.update(1 / 60, state);

  assert(target.hull < target.hullMax, 'beam damage should still hit the closest target on the ray');
  assert.equal(state.combatRuntime.diagnostics.beamSpatialQueries, 1,
    'crowded beam damage should query nearby damageables through the spatial hash');
  assert(state.combatRuntime.diagnostics.beamCandidates < damageables.length,
    'crowded beam damage should avoid scanning every damageable entity in the sector');
  assert(events.some((e) => e.event === 'combat:damage' && e.payload.targetId === target.id),
    'beam spatial path should still emit combat damage for the hit target');
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
  combat.kernel = null;

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

function checkWantedHeatUsesVisibleSearchZoneDecay() {
  const state = createGameState(98);
  state.mode = 'flight';
  state.simTime = 0;
  state.entities.clear();
  state.entityList.length = 0;
  state.playerId = 1;
  state.player.heat = 0;
  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    flags: {},
    radius: 8,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    data: {},
  };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  const events = [];
  const bus = createBus();
  bus.on('heat:changed', (payload) => events.push(payload));
  heat.init({ state, bus, helpers: {}, registry: { get() { return null; } } });

  heat._raise(0.48, 'test heat');
  const zone = state.player.heatZone;
  const startLevel = zone.level;
  assert(zone.active, 'wanted heat should create a visible heat search zone');
  assert(startLevel > 1, 'test heat should start above level one');
  assert(zone.radius > 0 && zone.radius <= state.ui.radarRange,
    'heat search radius should fit inside the compact radar scale');

  player.pos.x = zone.center.x + zone.radius + 80;
  heat.update(zone.clearAfterS - 0.1, state);
  assert.equal(state.player.heatZone.level, startLevel,
    'heat should not drop before the outside-zone timer completes');
  heat.update(0.2, state);
  assert.equal(state.player.heatZone.level, startLevel - 1,
    'heat should drop one level after escaping the visible heat radius');

  for (let i = 0; i < 40 && state.player.heat > 0; i++) {
    state.simTime += 1;
    heat.update(1, state);
  }
  assert.equal(state.player.heat, 0, 'remaining heat should clear after staying outside the heat radius');
  assert.equal(state.player.heatZone.active, false, 'heat zone should disappear once WANTED heat is gone');
  assert(events.some((e) => e.level === 0 && e.value === 0),
    'clearing the final heat level should emit a clean heat:changed event');
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
  assert.equal(respawn.payload.refundCr, 14200, 'insured respawn should report the net insurance refund');
  assert.equal(refund.payload.amount, 14200, 'insurance refund should route through economy');
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

function checkRespawnUsesReachableSectorStationWhenLastDockIsElsewhere() {
  const makeVec = (x, z) => ({
    x,
    y: 0,
    z,
    set(nx, ny, nz) { this.x = nx; this.y = ny || 0; this.z = nz; return this; },
    copy(pos) { this.x = pos.x; this.y = pos.y || 0; this.z = pos.z; return this; },
  });
  const state = {
    playerId: 1,
    simTime: 77,
    player: {
      credits: 100,
      insurance: { rate: 0.6, deductibleCr: 500, insuredModules: false, lastStationId: 'station_helios' },
      ownedShips: [{ defId: 'ship_pelican', fittings: [] }],
      activeShipIndex: 0,
      cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 100, capMass: 100 },
    },
    entities: new Map(),
    entityList: [],
    world: {
      currentSectorId: 'sector_tethys_junction',
      activeSector: {
        stations: [{ id: 22, stationId: 'station_tethys' }],
      },
    },
  };
  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    pos: makeVec(900, 900),
    prevPos: makeVec(900, 900),
    vel: makeVec(12, -4),
    flags: {},
    data: { defId: 'ship_pelican' },
    hull: 0,
    hullMax: 180,
    shield: 0,
    shieldMax: 60,
    cap: 0,
    capMax: 110,
  };
  const liveStation = {
    id: 22,
    type: 'station',
    alive: true,
    pos: { x: -240, z: 510 },
    data: { stationId: 'station_tethys' },
  };
  state.entities.set(player.id, player);
  state.entities.set(liveStation.id, liveStation);
  state.entityList.push(player, liveStation);
  state.entityIndex = { byStationId: new Map([[liveStation.data.stationId, liveStation]]), stations: [liveStation] };
  const events = [];

  combat.state = state;
  combat.bus = { emit: (event, payload) => events.push({ event, payload }) };

  combat.respawnPlayer(player, 99);

  const respawn = events.find((e) => e.event === 'player:respawn');
  assert(respawn, 'normal death should emit player:respawn');
  assert.equal(respawn.payload.stationId, 'station_tethys', 'respawn should not report an unreachable previous-sector station');
  assert.equal(player.pos.x, -240, 'respawn should use the current sector live station x position');
  assert.equal(player.pos.z, 510, 'respawn should use the current sector live station z position');
  assert.equal(player.vel.x, 0, 'respawn should clear stale ship velocity');
  assert.equal(player.vel.z, 0, 'respawn should clear stale ship velocity');
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
  assert(NEW_GAME.fittedModules.includes('wpn_pulse_laser_s'), 'new-game source loadout should explicitly include the starter weapon');
  for (const defId of NEW_GAME.fittedModules) {
    assert(owned.fittings.includes(defId), `new game should fit default module ${defId}`);
  }
  assert.deepEqual(
    owned.fittings,
    fittingsFromDefaultModules(NEW_GAME.shipId, NEW_GAME.fittedModules),
    'new game should use the canonical default fitting resolver',
  );

  const spec = makeShipEntitySpec(owned.defId, {
    team: 0,
    isPlayer: true,
    player: state.player,
    fittings: owned.fittings,
  });
  assert(spec.data.weapons.length >= 1, 'starter player ship should have a weapon runtime');
  assert.equal(spec.data.weapons[0].defId, 'wpn_pulse_laser_s', 'starter weapon runtime should come from the explicit fitting');
  assert(spec.data.fittings.includes('wpn_pulse_laser_s'), 'render-facing loadout should expose the starter weapon fitting');
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

function checkRefuelServiceOnlyChargesAffordableFuel() {
  const state = {
    player: { credits: 200 },
    fuel: { current: 40, max: 100 },
  };
  const events = [];
  economy.state = state;
  economy.bus = { emit(event, payload) { events.push({ event, payload }); } };

  economy.handleService({ type: 'refuel', amount: 60 });

  assert.equal(state.player.credits, 2, 'partial refuel should charge only affordable fuel units');
  assert.equal(state.fuel.current, 73, 'partial refuel should add only affordable fuel units');
  assert(events.some((e) => e.event === 'fuel:changed' && e.payload.current === 73), 'partial refuel should emit fuel change');
  assert(events.some((e) => e.event === 'toast' && e.payload.kind === 'warn' && /Partial refuel/.test(e.payload.text)), 'partial refuel should notify as partial');

  const poorState = {
    player: { credits: 5 },
    fuel: { current: 40, max: 100 },
  };
  const poorEvents = [];
  economy.state = poorState;
  economy.bus = { emit(event, payload) { poorEvents.push({ event, payload }); } };

  economy.handleService({ type: 'refuel', amount: 60 });

  assert.equal(poorState.player.credits, 5, 'unaffordable refuel should not charge below one fuel unit');
  assert.equal(poorState.fuel.current, 40, 'unaffordable refuel should not change fuel');
  assert(poorEvents.some((e) => e.event === 'toast' && e.payload.kind === 'error'), 'unaffordable refuel should notify the player');
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
  economy._eventAccumulator = 37.25;
  const saved = economy.serialize();
  assert.equal(saved.eventAccumulator, 37.25, 'save should include the economy event scheduler accumulator');
  const expectedNext = economy._rng();

  const restoredState = makeState(22);
  economy.state = restoredState;
  economy.helpers = helpers;
  economy.bus = { emit() {} };
  economy.deserialize(saved);
  assert.equal(economy._rng(), expectedNext, 'load should continue the serialized economy RNG stream');
  assert.equal(economy.serialize().eventAccumulator, 37.25, 'load should continue the economy event scheduler accumulator');
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
  assert.equal(economy.serialize().eventAccumulator, 0, 'legacy load should default missing economy event accumulator to zero');
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
    nav: { route: null, autoTravel: false, waypoint: null, autopilot: { active: false, target: null, targetEntityId: null, label: '', arrivalRadius: 36, status: 'idle' } },
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
    pos: { x: 0, z: 0 },
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

function checkFlightLoopsUseShipLikeIndex() {
  const h = makeFlightHarness();
  const npc = makeDynamicFlightShip({ id: 2, data: {}, flags: {}, vel: { x: 25, z: 0 } });
  h.state.entities.set(npc.id, npc);
  h.state.entityIndex = {
    __spacefaceEntityIndexV1: true,
    shipLike: [h.ship, npc],
  };
  const originalLegacyList = h.state.entityList;
  h.state.entityList = nonIterableEntityList(originalLegacyList.length);
  try {
    flight.update(1 / 60, h.state);
  } finally {
    h.state.entityList = originalLegacyList;
  }
  assert(npc.vel.x < 25, 'legacy flight should still damp indexed NPC craft');

  const v3Craft = makeDynamicFlightShip({ id: 3, bank: 0.4, data: {}, flags: {} });
  const v3State = {
    mode: 'flight',
    settings: { gameplay: { physicsBackend: 'custom' } },
    entities: new Map(),
    playerId: 99,
    entityList: nonIterableEntityList(1),
    entityIndex: {
      __spacefaceEntityIndexV1: true,
      shipLike: [v3Craft],
    },
  };
  flightV3.init({ state: v3State, bus: { on() {}, emit() {} } });
  flightV3._warnedBackend = true;
  flightV3.update(1 / 60, v3State);
  assert(v3Craft.bank < 0.4, 'flight V3 fallback banking should settle indexed craft');
}

function nonIterableEntityList(length, message = 'system should use entity indexes instead of iterating entityList') {
  return {
    length,
    [Symbol.iterator]() {
      throw new Error(message);
    },
  };
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

function checkReverseThrustCueHasAngledNozzles() {
  const h = makeFlightHarness({ rot: 0, vel: { x: 80, z: 0 } });
  h.state.input.moveZ = -1;
  tickPlayerFlight(h, 1);

  const cue = h.events.find((entry) => entry.event === 'ship:thrust');
  assert(cue, 'reverse input should emit a ship:thrust cue for VFX');
  assert(cue.payload.reverse > 0, 'reverse thrust cue should expose reverse strength');
  const nozzles = cue.payload.nozzles || [];
  const left = nozzles.find((n) => n.role === 'reverse-left');
  const right = nozzles.find((n) => n.role === 'reverse-right');
  assert(left && right, 'reverse thrust cue should include two angled forward nozzles');
  assert(Math.abs(left.angle - Math.PI * 0.75) < 0.001, 'left reverse nozzle should use the 45-degree forward-left primitive angle');
  assert(Math.abs(right.angle + Math.PI * 0.75) < 0.001, 'right reverse nozzle should use the 45-degree forward-right primitive angle');
}

function checkAutopilotBoostsTowardClearCourse() {
  const h = makeFlightHarness({
    boost: { energy: 100, max: 100, drainRate: 20, regenRate: 18, dashImpulse: 0, dashCd: 3, dashCdT: 0 },
  });
  h.state.nav.autopilot = {
    active: true,
    target: { x: 1200, z: 0 },
    targetEntityId: null,
    label: 'Test fix',
    arrivalRadius: 36,
    status: 'armed',
  };

  tickFlightSystem(h, 1);

  assert.equal(h.state.input.boost, true, 'autopilot should boost on a clear aligned long course');
  assert(h.ship.vel.x > 0, 'autopilot should accelerate toward the selected local fix');
  assert.equal(h.ship.flags.boosting, true, 'autopilot boost should flow through the normal boost resource path');
}

function checkAutopilotCounterThrustsBeforeArrival() {
  const h = makeFlightHarness({ pos: { x: 455, z: 0 }, vel: { x: 125, z: 0 } });
  h.state.nav.autopilot = {
    active: true,
    target: { x: 520, z: 0 },
    targetEntityId: null,
    label: 'Close fix',
    arrivalRadius: 36,
    status: 'armed',
  };

  tickFlightSystem(h, 1);

  assert.equal(h.state.input.brake, true, 'autopilot should enter brake mode inside the stopping envelope');
  assert(h.state.input.moveZ < 0, 'autopilot brake should use reverse thrust against forward velocity');
  assert(h.ship.vel.x < 125, 'autopilot counter-thrust should reduce closing speed instead of flying through the fix');
}

function checkAutopilotAvoidsBlockingObstacle() {
  const h = makeFlightHarness();
  h.state.nav.autopilot = {
    active: true,
    target: { x: 1000, z: 0 },
    targetEntityId: null,
    label: 'Far fix',
    arrivalRadius: 36,
    status: 'armed',
  };
  const rock = {
    id: 2,
    type: 'asteroid',
    alive: true,
    pos: { x: 220, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 90,
  };
  h.state.entities.set(rock.id, rock);
  h.state.entityList.push(rock);

  tickFlightSystem(h, 1);

  assert(Math.abs(h.state.input.turnIntent) > 0.05 || Math.abs(h.state.input.moveX) > 0.05,
    'autopilot should steer around a blocking obstacle on the course line');
  assert.notEqual(h.state.nav.autopilot.status, 'cruising', 'autopilot status should expose active obstacle avoidance');
}

function checkAutopilotWorksAcrossFlightModes() {
  for (const mode of ['assisted', 'drift', 'newtonian']) {
    const cruise = makeFlightHarness({
      boost: { energy: 100, max: 100, drainRate: 20, regenRate: 18, dashImpulse: 0, dashCd: 3, dashCdT: 0 },
    });
    cruise.state.settings.controls.flightMode = mode;
    cruise.state.nav.autopilot = {
      active: true,
      target: { x: 900, z: 0 },
      targetEntityId: null,
      label: `${mode} fix`,
      arrivalRadius: 36,
      status: 'armed',
    };

    tickFlightSystem(cruise, 1);

    assert.equal(cruise.ship._flightFrame.mode, mode, `autopilot should resolve the ${mode} flight profile`);
    assert(cruise.state.input.moveZ > 0, `autopilot should apply forward thrust in ${mode}`);
    assert(cruise.ship.vel.x > 0, `autopilot should accelerate toward the target in ${mode}`);

    const brake = makeFlightHarness({ pos: { x: 455, z: 0 }, vel: { x: 125, z: 0 } });
    brake.state.settings.controls.flightMode = mode;
    brake.state.nav.autopilot = {
      active: true,
      target: { x: 520, z: 0 },
      targetEntityId: null,
      label: `${mode} close fix`,
      arrivalRadius: 36,
      status: 'armed',
    };

    tickFlightSystem(brake, 1);

    assert.equal(brake.ship._flightFrame.mode, mode, `autopilot brake should resolve the ${mode} flight profile`);
    assert.equal(brake.state.input.brake, true, `autopilot should brake near arrival in ${mode}`);
    assert(brake.state.input.moveZ < 0, `autopilot brake should use reverse thrust in ${mode}`);
    assert(brake.ship.vel.x < 125, `autopilot should reduce closing speed in ${mode}`);
  }
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
  assert.equal(state.settings.gameplay.physicsBackend, 'rapier-dynamic', 'SG-02 dynamic physics should be the default backend');
  assert.equal(state.settings.gameplay.aiBackend, 'sg06-tactical', 'SG-06 tactical AI should be the default backend');
  assert.deepEqual(INPUT_DEFAULTS.BINDINGS.strafeLeft, ['KeyQ'], 'Q should default to left lateral thruster');
  assert.deepEqual(INPUT_DEFAULTS.BINDINGS.strafeRight, ['KeyE'], 'E should default to right lateral thruster');
  assert.deepEqual(INPUT_DEFAULTS.SCHEMES['helm-assist'].forward, ['KeyW', 'ArrowUp'], 'Helm Assist ArrowUp should fly forward');
  assert.deepEqual(INPUT_DEFAULTS.SCHEMES['helm-assist'].reverse, ['KeyS', 'ArrowDown'], 'Helm Assist ArrowDown should fly reverse');
  assert.deepEqual(INPUT_DEFAULTS.SCHEMES['helm-assist'].strafeLeft, ['KeyA', 'ArrowLeft'], 'Helm Assist ArrowLeft should strafe left by default');
  assert.deepEqual(INPUT_DEFAULTS.SCHEMES['helm-assist'].strafeRight, ['KeyD', 'ArrowRight'], 'Helm Assist ArrowRight should strafe right by default');
}

function checkLegacySettingsRestoreKeepsFlightDefaults() {
  const state = createGameState(321);
  save.state = state;
  save._restoreSettings({
    gameplay: { difficulty: 'veteran' },
    controls: { bindings: null },
  });

  assert.equal(state.settings.gameplay.difficulty, 'veteran', 'legacy settings restore should still apply known gameplay fields');
  assert.equal(state.settings.gameplay.physicsBackend, 'rapier-dynamic', 'legacy settings restore should preserve default SG-02 dynamic physics');
  assert.equal(state.settings.gameplay.aiBackend, 'sg06-tactical', 'legacy settings restore should preserve default SG-06 tactical AI');
  assert.equal(state.settings.controls.flightMode, 'assisted', 'legacy settings restore should preserve default assisted flight mode');
}

function checkSettingsRestoreSanitizesFlightOptions() {
  const state = createGameState(322);
  save.state = state;
  save._restoreSettings({
    gameplay: { physicsBackend: 'raw-rigidbody', aiBackend: 'stringly-ghost' },
    controls: {
      flightMode: 'diagonal-attractor',
      bindings: {
        forward: 'KeyI',
        reverse: ['KeyK', 47, null],
        strafeLeft: [],
      },
    },
  });

  assert.equal(state.settings.gameplay.physicsBackend, 'rapier-dynamic', 'invalid saved physics backend should fall back to SG-02 dynamic');
  assert.equal(state.settings.gameplay.aiBackend, 'sg06-tactical', 'invalid saved AI backend should fall back to SG-06 tactical');
  assert.equal(state.settings.controls.flightMode, 'assisted', 'invalid saved flight mode should fall back to assisted');
  assert.deepEqual(state.settings.controls.bindings.forward, ['KeyI'], 'string saved bindings should normalize to arrays');
  assert.deepEqual(state.settings.controls.bindings.reverse, ['KeyK'], 'saved bindings should drop non-string entries');
  assert.equal(state.settings.controls.bindings.strafeLeft, undefined, 'empty saved bindings should reset that action to default');

  const pollutedBefore = Object.prototype.spacefacePolluted;
  save._restoreSettings(JSON.parse('{"__proto__":{"spacefacePolluted":true},"controls":{"flightMode":"drift","bindings":{"__proto__":["KeyP"],"constructor":["KeyC"],"forward":"KeyI"}},"gameplay":{"physicsBackend":"custom"}}'));
  assert.equal(Object.prototype.spacefacePolluted, pollutedBefore, 'settings restore should ignore prototype mutation keys');
  assert.equal(Object.prototype.hasOwnProperty.call(state.settings.controls.bindings, '__proto__'), false, 'control bindings should not preserve __proto__ entries');
  assert.equal(Object.prototype.hasOwnProperty.call(state.settings.controls.bindings, 'constructor'), false, 'control bindings should not preserve constructor entries');
  assert.equal(state.settings.gameplay.physicsBackend, 'rapier-dynamic', 'saved legacy physics backend should canonicalize to SG-02 dynamic');
  assert.equal(state.settings.gameplay.aiBackend, 'sg06-tactical', 'missing saved AI backend should canonicalize to SG-06 tactical');
  assert.equal(state.settings.gameplay.flightBackend, 'v3', 'missing saved flight backend should canonicalize to Flight V3');

  save._restoreSettings({
    gameplay: { physicsBackend: 'rapier' },
    controls: { flightMode: 'newtonian', bindings: null },
  });
  assert.equal(state.settings.gameplay.physicsBackend, 'rapier-dynamic', 'saved Rapier observer backend should canonicalize to SG-02 dynamic');
  assert.equal(state.settings.gameplay.aiBackend, 'sg06-tactical', 'missing saved AI backend should stay canonical');
  assert.equal(state.settings.gameplay.flightBackend, 'v3', 'missing saved flight backend should stay canonical');
  assert.equal(state.settings.controls.flightMode, 'newtonian', 'valid saved flight mode should restore');
  assert.equal(state.settings.controls.bindings, null, 'null bindings should keep default binding semantics');

  save._restoreSettings({
    gameplay: { physicsBackend: 'rapier-dynamic', aiBackend: 'sg06-tactical', flightBackend: 'v3' },
    controls: { flightMode: 'assisted', bindings: null },
  });
  assert.equal(state.settings.gameplay.physicsBackend, 'rapier-dynamic', 'valid saved SG-02 dynamic backend should restore');
  assert.equal(state.settings.gameplay.aiBackend, 'sg06-tactical', 'valid saved SG-06 tactical AI backend should restore');
  assert.equal(state.settings.gameplay.flightBackend, 'v3', 'valid saved Flight V3 backend should restore');
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

function checkPhysicsIntegratesOnlyIndexedMovables() {
  const ship = {
    id: 1,
    type: 'ship',
    alive: true,
    pos: { x: 0, z: 0 },
    vel: { x: 10, z: 0 },
  };
  const projectile = {
    id: 2,
    type: 'projectile',
    alive: true,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: -30 },
  };
  const asteroid = {
    id: 3,
    type: 'asteroid',
    alive: true,
    pos: { x: 100, z: 0 },
    vel: { x: 999, z: 999 },
  };
  const station = {
    id: 4,
    type: 'station',
    alive: true,
    pos: { x: -100, z: 0 },
    vel: { x: -999, z: -999 },
  };
  const state = {
    bounds: null,
    entityList: nonIterableEntityList(4, 'physics integrate should use entityIndex.movables instead of iterating entityList'),
    entityIndex: {
      __spacefaceEntityIndexV1: true,
      movables: [ship, projectile],
      asteroids: [asteroid],
      stations: [station],
    },
  };

  physics.integrate(1, state);

  assert.equal(ship.pos.x, 10, 'indexed ship should still integrate position');
  assert.equal(projectile.pos.z, -30, 'indexed projectile should still integrate position');
  assert.equal(asteroid.pos.x, 100, 'static asteroid should not be integrated by the movables path');
  assert.equal(station.pos.x, -100, 'static station should not be integrated by the movables path');
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
    data: {
      damage: 7,
      damageType: 'energy',
      weaponId: 'wpn_packet_fixture',
      damagePacket: scalarHitToDamagePacket({ damage: 7, damageType: 'energy', penetration: 0.25 }),
    },
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
  const hitEvent = events.find((e) => e.event === 'projectile:hit' && e.payload.targetId === target.id);
  assert(hitEvent, 'swept projectile should emit hit event with damage payload');
  assert.equal(hitEvent.payload.damage, 7, 'swept projectile should preserve scalar compatibility damage');
  assert.equal(hitEvent.payload.damageType, 'energy', 'swept projectile should preserve scalar compatibility damage type');
  assert.equal(hitEvent.payload.weaponId, 'wpn_packet_fixture', 'swept projectile should preserve weapon id');
  assert.equal(hitEvent.payload.damagePacket.penetration, 0.25, 'swept projectile should preserve authored packet penetration');
  assert(Math.abs(hitEvent.payload.damagePacket.channels.thermal - 5.04) < 1e-9, 'swept projectile packet should preserve thermal split');
  assert(Math.abs(hitEvent.payload.damagePacket.channels.ion - 1.96) < 1e-9, 'swept projectile packet should preserve ion split');
  assert.equal(hitEvent.payload.damagePacket.hit.pos.x, hitEvent.payload.pos.x, 'swept projectile packet should carry impact X');
  assert.equal(hitEvent.payload.damagePacket.hit.pos.z, hitEvent.payload.pos.z, 'swept projectile packet should carry impact Z');
  assert.equal(physics._diag.sweptProjectileHits, 1, 'swept projectile should report the hit for diagnostics');
}

function checkSweptProjectileCannotHitPastMaxDistance() {
  const events = [];
  const state = { entityList: [] };
  const projectile = {
    id: 1,
    type: 'projectile',
    alive: true,
    collides: true,
    radius: 1,
    ownerId: 99,
    pos: { x: 640, z: 0 },
    prevPos: { x: 590, z: 0 },
    vel: { x: 1500, z: 0 },
    collisionMask: Masks.SHIP,
    data: {
      damage: 7,
      damageType: 'energy',
      weaponId: 'wpn_range_fixture',
      spawnPos: { x: 0, z: 0 },
      maxDistance: 600,
    },
  };
  const target = {
    id: 2,
    type: 'ship',
    alive: true,
    collides: true,
    radius: 7,
    pos: { x: 620, z: 0 },
    vel: { x: 0, z: 0 },
    collisionMask: Masks.PROJECTILE,
  };
  state.entityList.push(projectile, target);

  physics.init({ state, bus: { emit(event, payload) { events.push({ event, payload }); } } });
  physics.sweepProjectiles(1 / 30, state);

  assert.equal(projectile.alive, false, 'projectile should expire when its swept path reaches maxDistance');
  assert.equal(events.some((e) => e.event === 'projectile:hit'), false,
    'projectile should not hit a target beyond its authored maxDistance');
  assert(projectile.pos.x <= 600 + 1e-9,
    'expired projectile should clamp to its maxDistance boundary');
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

function checkPickupCollectionUsesSpatialHashForCrowdedScenes() {
  const events = [];
  const state = createGameState(89);
  state.entities.clear();
  state.entityList.length = 0;
  const pickups = [];
  const shipLike = [];

  const player = {
    id: 1000,
    type: 'ship',
    alive: true,
    collides: true,
    radius: 6,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    collisionMask: Masks.PICKUP,
  };
  const drone = {
    id: 1001,
    type: 'drone',
    alive: true,
    collides: true,
    radius: 5,
    pos: { x: 3000, z: 0 },
    vel: { x: 0, z: 0 },
    collisionMask: Masks.PICKUP,
  };
  const nearPlayer = {
    id: 1,
    type: 'pickup',
    alive: true,
    collides: true,
    radius: 2,
    pos: { x: 4, z: 0 },
    collisionMask: Masks.SHIP | Masks.DRONE,
    data: { kind: 'ore', amount: 1, commodityId: 'cmdty_ore_iron' },
  };
  const nearDrone = {
    id: 2,
    type: 'pickup',
    alive: true,
    collides: true,
    radius: 2,
    pos: { x: 3003, z: 0 },
    collisionMask: Masks.SHIP | Masks.DRONE,
    data: { kind: 'ore', amount: 1, commodityId: 'cmdty_ore_iron' },
  };
  pickups.push(nearPlayer, nearDrone);
  shipLike.push(player, drone);

  for (let i = 0; i < 160; i++) {
    pickups.push({
      id: 10 + i,
      type: 'pickup',
      alive: true,
      collides: true,
      radius: 2,
      pos: { x: 10000 + i * 96, z: 0 },
      collisionMask: Masks.SHIP | Masks.DRONE,
      data: { kind: 'ore', amount: 1, commodityId: 'cmdty_ore_iron' },
    });
  }

  for (const e of [...shipLike, ...pickups]) {
    state.entities.set(e.id, e);
    state.entityList.push(e);
  }
  state.entityIndex = {
    __spacefaceEntityIndexV1: true,
    pickups,
    shipLike,
  };

  physics.init({ state, bus: { emit(event, payload) { events.push({ event, payload }); } } });
  state.spatialHash.rebuild(state.entityList);
  physics.collectPickups(state);

  assert.equal(nearPlayer.alive, false, 'near player pickup should still collect through the spatial path');
  assert.equal(nearDrone.alive, false, 'near drone pickup should still collect through the spatial path');
  assert.equal(pickups[2].alive, true, 'far pickups should remain uncollected');
  assert.equal(events.filter((e) => e.event === 'pickup:collected').length, 2, 'spatial pickup path should emit one event per collected pickup');
  assert(physics._diag.pickupSpatialQueries > 0, 'crowded pickup collection should use spatial hash queries');
  assert(physics._diag.pickupPairChecks < pickups.length * shipLike.length, 'spatial pickup collection should avoid the full pickup x collector scan');
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

function distance2(a, b) {
  const dx = (a && a.x || 0) - (b && b.x || 0);
  const dz = (a && a.z || 0) - (b && b.z || 0);
  return dx * dx + dz * dz;
}

function checkAmbientHostileSpawnSafetyContract() {
  const state = {
    mode: 'flight',
    meta: { seed: 321, playtimeS: 0 },
    playerId: 1,
    player: { ownedShips: [], activeShipIndex: 0, researchedNodes: [] },
    entities: new Map([[1, {
      id: 1,
      type: 'ship',
      alive: true,
      team: 0,
      pos: { x: 0, y: 0, z: 0 },
      prevPos: { x: 0, y: 0, z: 0, copy(pos) { this.x = pos.x; this.y = pos.y || 0; this.z = pos.z; return this; } },
      vel: { x: 0, z: 0 },
      rot: 0,
      prevRot: 0,
      flags: {},
      data: {},
    }]]),
    entityList: [],
    freeIds: [],
    rng: () => 0.5,
    world: { sectors: {}, currentSectorId: null, activeSector: null, discovery: {}, pendingSpawns: {}, rng: () => 0.5 },
    bounds: {},
    jump: { state: 'IDLE', targetSectorId: null, via: null, chargeT: 0, chargeNeeded: 0, cooldownT: 0 },
    fuel: { current: 100, max: 100 },
  };
  for (const s of SECTORS) state.world.sectors[s.id] = { ...s, owner: s.factionId };
  const spawned = [];
  const bus = createBus();
  const helpers = {
    spawnEntity(spec) {
      const ent = { id: 2000 + spawned.length, alive: true, pos: spec.pos || { x: 0, z: 0 }, data: spec.data || {}, ...spec };
      state.entities.set(ent.id, ent);
      state.entityList.push(ent);
      spawned.push(ent);
      return ent;
    },
    hash32,
    mulberry32(seed) {
      let a = (seed >>> 0) || 1;
      return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    },
  };
  world.init({ state, bus, helpers, registry: { get() { return null; } } });
  traffic.init({ state, bus, helpers, registry: { get() { return null; } } });

  world.enterSector('sector_helios_prime');
  assert.equal(spawned.filter((e) => e.data && e.data.ai && e.data.ai.spawnContext === 'ambient').length, 0,
    'starter sector should not spawn ambient hostiles');
  const heliosTraffic = spawned.filter((e) => e.data && e.data.trafficRole);
  assert(heliosTraffic.length > 0, 'starter sector may spawn neutral traffic without painting it as enemy pressure');
  assert.deepEqual(heliosTraffic.filter((e) => e.data.trafficRole === 'pirate').map((e) => e.id), [],
    'starter sector traffic must not include passive red-raider roles');
  assert.deepEqual(heliosTraffic.filter((e) => isHostileToPlayer(e, 0, state)).map((e) => e.id), [],
    'starter sector traffic must not read as player-hostile on radar or overview');

  spawned.length = 0;
  world.enterSector('sector_ceres_belt');
  const lawfulPatrols = spawned.filter((e) => e.data && e.data.ai && e.data.ai.spawnContext === 'patrol');
  const namedZoneHostiles = spawned.filter((e) => e.data && e.data.ai && e.data.ai.spawnContext === 'zone_hostile');
  assert(lawfulPatrols.length > 0, 'lawful station sectors should retain non-player-hunting patrol presence');
  assert(lawfulPatrols.every((e) => e.data.ai.lawful === true && !isHostileToPlayer(e, 0, state)),
    'clean-player patrol presence must stay lawful and non-hostile');
  assert(namedZoneHostiles.length > 0, 'Ceres danger should remain authored into named pirate zones');
  assert(namedZoneHostiles.every((e) => e.data.ai.zoneId && isHostileToPlayer(e, 0, state)),
    'named pirate-zone presence should remain intentionally hostile and geographically legible');
  const stations = state.world.activeSector.stations || [];
  const gates = state.world.activeSector.gates || [];
  const player = state.entities.get(state.playerId);
  for (const enemy of namedZoneHostiles) {
    for (const station of stations) {
      assert(distance2(enemy.pos, station.pos) >= 1000 * 1000,
        'ambient hostiles must not spawn inside station safe space');
    }
    for (const gate of gates) {
      assert(distance2(enemy.pos, gate.pos) >= 800 * 800,
        'ambient hostiles must not spawn on the arrival/gate safe bubble');
    }
    assert(!player || distance2(enemy.pos, player.pos) >= 1200 * 1200,
      'named-zone hostiles must not spawn on top of the arriving player');
  }
}

function check47aLiveColdStartCombatantsAreDormant() {
  const state = createGameState(47);
  state.mode = 'flight';
  state.entities.clear();
  state.entityList.length = 0;
  state.playerId = 0;
  let nextId = 1;
  const helpers = {
    spawnEntity(spec) {
      const ent = {
        id: nextId++,
        alive: spec.alive !== false,
        type: spec.type,
        team: spec.team,
        factionId: spec.factionId,
        pos: { x: spec.pos && spec.pos.x || 0, y: 0, z: spec.pos && spec.pos.z || 0 },
        prevPos: { x: spec.pos && spec.pos.x || 0, y: 0, z: spec.pos && spec.pos.z || 0, copy(pos) { this.x = pos.x; this.y = pos.y || 0; this.z = pos.z; return this; } },
        vel: { x: spec.vel && spec.vel.x || 0, z: spec.vel && spec.vel.z || 0 },
        rot: spec.rot || 0,
        radius: spec.radius || 1,
        data: spec.data || {},
        flags: spec.flags || {},
      };
      state.entities.set(ent.id, ent);
      state.entityList.push(ent);
      return ent;
    },
  };
  const player = helpers.spawnEntity(makeShipEntitySpec('ship_kestrel', {
    team: 0,
    factionId: 'faction_free',
    isPlayer: true,
    player: state.player,
    pos: { x: 0, z: 0 },
  }));
  state.playerId = player.id;

  const scene = spawn47aOpeningScene({ state, helpers, liveColdStartSafe: true });
  for (const key of ['interceptor', 'harasser', 'thief', 'recoveryTug']) {
    const entity = scene[key];
    assert(entity, `47-A live cold start should spawn ${key} actor`);
    assert.equal(entity.team, 0, `${key} should start neutral/friendly in the live cold open`);
    assert.equal(entity.factionId, 'faction_free', `${key} should not read as an immediate hostile faction`);
    assert.equal(entity.data.ai.liveColdStartSafe, true, `${key} should be marked for live cold-start activation`);
    assert.equal(entity.data.ai.passive, true, `${key} should be passive before its scenario beat`);
    assert.equal(entity.data.combat.targetId, null, `${key} should not target the player before its scenario beat`);
    assert(distance2(entity.pos, player.pos) >= 1500 * 1500, `${key} should hold outside the spawn threat bubble`);
  }
}

function checkWorldHazardsReuseScratchSets() {
  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    pos: { x: 0, z: 0 },
    hull: 50,
  };
  const state = {
    playerId: 1,
    entities: new Map([[1, player]]),
    world: {
      activeSector: {
        hazards: [
          { center: { x: 0, z: 0 }, radius: 100, type: 'radiation', intensity: 0.5 },
        ],
      },
    },
  };
  const events = [];
  world.state = state;
  world.bus = { emit(event, payload) { events.push({ event, payload }); } };
  world._hazardSet = new Set();
  world._hazardNextSet = new Set();
  const setA = world._hazardSet;
  const setB = world._hazardNextSet;

  world._tickHazards(1, state);
  assert.equal(events.filter((e) => e.event === 'hazard:enter').length, 1, 'entering a hazard should still emit once');
  assert(player.hull < 50, 'radiation hazard should still drain hull while inside');
  assert([setA, setB].includes(world._hazardSet), 'hazard current set should be one of the reusable runtime sets');
  assert([setA, setB].includes(world._hazardNextSet), 'hazard scratch set should be one of the reusable runtime sets');

  player.pos.x = 500;
  const OriginalSet = globalThis.Set;
  globalThis.Set = class FailingSet extends OriginalSet {
    constructor(...args) {
      super(...args);
      throw new Error('world hazard ticking should reuse scratch Sets instead of allocating per frame');
    }
  };
  try {
    world._tickHazards(1 / 60, state);
  } finally {
    globalThis.Set = OriginalSet;
  }

  assert.equal(events.filter((e) => e.event === 'hazard:exit').length, 1, 'leaving a hazard should still emit once');
  assert.equal(world._hazardSet.size, 0, 'hazard current set should be empty after leaving the only hazard');
  assert([setA, setB].includes(world._hazardSet), 'hazard current set should still be reused after exit');
  assert([setA, setB].includes(world._hazardNextSet), 'hazard scratch set should still be reused after exit');
}

function checkFactionPowerUsesEntityIndexes() {
  const hauler = {
    id: 1,
    type: 'ship',
    alive: true,
    factionId: 'faction_reach',
    data: { ai: { passive: true } },
  };
  const escort = {
    id: 2,
    type: 'ship',
    alive: true,
    factionId: 'faction_reach',
    data: { ai: { passive: false } },
  };
  const station = {
    id: 3,
    type: 'station',
    alive: true,
    factionId: 'faction_scn',
    data: {},
  };
  const gate = {
    id: 4,
    type: 'station',
    alive: true,
    factionId: 'faction_scn',
    data: { isGate: true },
  };
  const state = {
    factions: {
      faction_reach: { power: 10, aggro: false },
      faction_scn: { power: 10, aggro: false },
    },
    world: {
      sectors: {
        sector_indexed: { owner: 'faction_reach' },
      },
    },
    entityList: nonIterableEntityList(4, 'faction power recompute should use entity indexes instead of iterating entityList'),
    entityIndex: {
      __spacefaceEntityIndexV1: true,
      ships: [hauler, escort],
      stations: [station, gate],
    },
  };

  factions.state = state;
  factions.bus = { emit() {} };
  factions._recomputeFactionPower(state);

  assert.equal(state.factions.faction_reach.power, 11.5,
    'faction power should count indexed passive haulers plus owned territory');
  assert.equal(state.factions.faction_scn.power, 9,
    'faction power should count indexed stations while ignoring gate infrastructure');
}

checkPickupSingleWriter();
checkEventBusUsesPooledDispatchSnapshots();
checkCoreBuildsRadarContactIndex();
checkCoreSnapshotsOnlyMovableEntities();
checkMiningPickupMagnetUsesSpatialHashForCrowdedScenes();
checkMiningBeamTargetUsesSpatialHashForCrowdedFields();
checkNpcFireAtPlayerRequiresRadarVisibility();
checkSharedSpatialQueryUsesActiveHashAndFallback();
checkSpatialHashCachesStaticLayer();
checkCoreBuildsPhysicsBodyIndexForSg02Layers();
checkSg02ProductionSyncUsesIndexedBodyLayers();
checkAutomationNearestAsteroidUsesSpatialCandidates();
checkAlphabetProgramBeaconResolutionUsesIndexedSpatialCandidates();
checkHudNavStationUsesIndexedLookup();
checkAudioThreatScanUsesSpatialShipCandidates();
checkAiTargetSelectionReusesSpatialScratch();
checkTrafficUsesEntityIndexesForStationsAndAsteroids();
checkSaveDelegatesSystemHooks();
checkSaveDelegatesCraftingHooks();
checkClaimsSerializeAndReload();
checkNewGameHooksClearTransientRuntimeState();
checkDrillRewardsUseCanonicalCommodities();
checkDrillOreTierReqIsStablePerOre();
checkClaimRefineryOutputsCanonicalCommodities();
checkSaveScrubsTransientFlightState();
checkMissionCompletionAutosaveSeesSettledState();
checkLoadDoesNotSpawnTargetsForStaleLiveMissions();
checkLoadRestoresPersistentEntities();
checkLoadRejectsSaveWithoutPlayerEntity();
checkLoadRepairsMalformedPlayerSaveIntoPlayableShip();
checkSaveLoadDefersFlightWhenAuthoredVisualGateExists();
checkLoadRejectsUnrepairablePlayerEntityBeforeRestore();
checkCombatRewardsAndLootKinds();
checkCombatPrefersAuthoredProjectilePacket();
checkBeamDamageUsesSpatialCandidatesForCrowdedScenes();
checkHeatUsesTargetFactionContext();
checkWantedHeatUsesVisibleSearchZoneDecay();
checkInsuredRespawnUsesStationRefundAndCargoLoss();
checkRespawnUsesReachableSectorStationWhenLastDockIsElsewhere();
checkFailedCargoFitDoesNotDuplicateModules();
checkNewGameOwnedShipDefaultsAreFitted();
checkAmmoServiceOnlyChargesAcceptedCargo();
checkRefuelServiceOnlyChargesAffordableFuel();
checkInsuranceUsesDockedStationId();
checkEconomyRngFollowsCurrentSaveSeed();
checkAutomationRngContinuesAfterDeserialize();
checkCreditWritersRejectNegativeAmounts();
checkGateTollRequiresCredits();
checkFlightLoopsUseShipLikeIndex();
checkPlayerBankDoesNotSteerAfterRelease();
checkBankPoseCannotChangePhysicsState();
checkPlayerTurnBrakesOnRelease();
checkPlayerBankSignFollowsTurnDirection();
checkPlayerTurnRateIsCappedForReadableControl();
checkFlightAssistDampsLateralSlip();
checkReverseInputActsAsBrake();
checkReverseThrustCueHasAngledNozzles();
checkAutopilotBoostsTowardClearCourse();
checkAutopilotCounterThrustsBeforeArrival();
checkAutopilotAvoidsBlockingObstacle();
checkAutopilotWorksAcrossFlightModes();
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
checkPhysicsIntegratesOnlyIndexedMovables();
checkSweptShipStaticCollisionStaysOutsideObstacle();
checkSweptShipStaticCollisionUsesEitherMask();
checkSweptShipStaticCollisionUsesEntryPointForGlancingHit();
checkSweptShipStaticCollisionUsesEarliestObstacle();
checkCollisionMaterialsProduceDistinctSweptResponses();
checkSweptProjectileCollisionHitsAlongSegment();
checkSweptProjectileCannotHitPastMaxDistance();
checkBroadPhasePairKeysDoNotCollideForHighEntityIds();
checkBroadPhaseProjectileIsConsumedOnlyOnce();
checkPickupCollectionUsesSpatialHashForCrowdedScenes();
checkSpawnRequestAmbushContract();
checkAmbientHostileSpawnSafetyContract();
check47aLiveColdStartCombatantsAreDormant();
checkWorldHazardsReuseScratchSets();
checkFactionPowerUsesEntityIndexes();

// Dreadnought boss (dreadnought_boss, "Iron Maw") was authored in data + render but had ZERO
// makeEnemySpawnSpec call sites — the marquee T4 fight was invisible. This guards the wiring:
// it spawns on entry to a sector authored with a poi_boss POI, carries the boss tags the kill
// handler reads, and does NOT respawn once defeated (tracked in the deterministic discovery
// overlay, so it survives sector re-entry and save reload). Non-boss sectors must not spawn one.
function checkDreadnoughtBossSpawnsAndStaysDefeated() {
  function makeWorldHarness() {
    const state = {
      mode: 'flight',
      meta: { seed: 777, playtimeS: 0 },
      playerId: 1,
      player: { ownedShips: [], activeShipIndex: 0, researchedNodes: [] },
      entities: new Map([[1, {
        id: 1, type: 'ship', alive: true,
        pos: { x: 0, y: 0, z: 0 }, prevPos: { x: 0, y: 0, z: 0, copy(p) { this.x = p.x; this.y = p.y || 0; this.z = p.z; return this; } },
        vel: { x: 0, z: 0 }, rot: 0, prevRot: 0, flags: {}, data: {},
      }]]),
      entityList: [],
      rng: () => 0.5,
      world: { sectors: {}, currentSectorId: null, activeSector: null, discovery: {}, pendingSpawns: {}, rng: () => 0.5 },
      bounds: {},
      jump: { state: 'IDLE', targetSectorId: null, via: null, chargeT: 0, chargeNeeded: 0, cooldownT: 0 },
      fuel: { current: 100, max: 100 },
    };
    // Seed the live sector graph (world.init copies SECTORS in if empty, but enterSector needs it
    // populated before init runs its discovery init — match main.js by pre-filling).
    for (const s of SECTORS) state.world.sectors[s.id] = { ...s, owner: s.factionId };

    const spawned = [];
    const bossEvents = [];
    const bus = createBus();
    const helpers = {
      spawnEntity(spec) {
        const ent = { id: 1000 + spawned.length, alive: true, pos: spec.pos || { x: 0, z: 0 }, data: spec.data || {}, ...spec };
        state.entities.set(ent.id, ent);
        spawned.push(ent);
        return ent;
      },
      getEntity(id) { return state.entities.get(id) || null; },
      hash32: hash32,
      mulberry32(seed) {
        let a = (seed >>> 0) || 1;
        return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
      },
    };
    const registry = { get() { return null; } };
    world.init({ state, bus, helpers, registry });
    bus.on('boss:defeated', (p) => bossEvents.push(p));
    return { state, bus, helpers, spawned, bossEvents };
  }

  // 1. Entering Ashfall Reach (the sector authored with poi_boss) spawns exactly one dreadnought.
  const ctx = makeWorldHarness();
  world.enterSector('sector_ashfall_reach');
  const activeBosses1 = ctx.spawned.filter((e) => e.data && e.data.isBoss);
  assert.equal(activeBosses1.length, 1, 'Ashfall Reach entry should spawn exactly one dreadnought boss');
  const boss = activeBosses1[0];
  assert.equal(boss.data.bossPoiId, 'poi_boss', 'boss entity should carry its poi_boss linkage');
  assert.equal(boss.data.bossSectorId, 'sector_ashfall_reach', 'boss entity should carry its sector linkage');
  assert.ok(ctx.state.world.activeSector.boss, 'activeSector should record the live boss handle');
  assert.equal(ctx.state.world.activeSector.boss.entityId, boss.id, 'activeSector.boss.entityId should match the spawned boss');

  // 2. Killing the boss marks the POI defeated in the discovery overlay + emits boss:defeated.
  ctx.bus.emit('entity:killed', { id: boss.id, killerId: 1, type: 'ship', pos: { x: boss.pos.x, z: boss.pos.z }, victimClass: 'capital' });
  const disc = ctx.state.world.discovery['sector_ashfall_reach'];
  assert.ok(disc && disc.pois && disc.pois['poi_boss'] && disc.pois['poi_boss'].bossDefeated,
    'boss death should mark poi_boss.bossDefeated in the discovery overlay');
  assert.ok(!ctx.state.world.activeSector.boss, 'activeSector.boss handle should clear after defeat');
  assert.equal(ctx.bossEvents.length, 1, 'boss death should emit exactly one boss:defeated');
  assert.equal(ctx.bossEvents[0].poiId, 'poi_boss', 'boss:defeated should carry the poi id');

  // 3. Re-entering the sector does NOT respawn the boss (stays defeated — survives reload).
  const beforeCount = ctx.spawned.length;
  world.enterSector('sector_ashfall_reach');
  const newBosses = ctx.spawned.slice(beforeCount).filter((e) => e.data && e.data.isBoss);
  assert.equal(newBosses.length, 0, 'defeated boss must not respawn on sector re-entry');

  // 4. A fresh harness (new save) on the same sector DOES spawn the boss (defeat is per-save).
  const ctx2 = makeWorldHarness();
  world.enterSector('sector_ashfall_reach');
  const freshBosses = ctx2.spawned.filter((e) => e.data && e.data.isBoss);
  assert.equal(freshBosses.length, 1, 'a new save should spawn the boss fresh (defeat is per-save, not global)');

  // 5. A non-boss sector never spawns one.
  const ctx3 = makeWorldHarness();
  world.enterSector('sector_helios_prime');
  const heliosBosses = ctx3.spawned.filter((e) => e.data && e.data.isBoss);
  assert.equal(heliosBosses.length, 0, 'a sector without a poi_boss POI must not spawn a dreadnought');
}
checkDreadnoughtBossSpawnsAndStaysDefeated();

// Countermeasures (P1-7): chaff diverts in-flight missiles targeting the deploying ship to a decoy;
// ECM zeros missile turnRate (jamming). Guards the actual interception behavior, not just the wiring
// (check-countermeasures.mjs pins the contract). Runs the countermeasures system headlessly against
// a missile + ship + attacker and asserts the missile is neutralized.
function checkCountermeasuresInterceptMissiles() {
  function makeShip(id, x, z, fittings) {
    return { id, type: 'ship', alive: true, pos: { x, y: 0, z }, prevPos: { x, y: 0, z }, vel: { x: 0, z: 0 }, rot: 0,
      data: { fittings, combat: { lockTarget: null, lockProgress: 0 } } };
  }
  function makeMissile(id, targetId, x, z) {
    return { id, type: 'projectile', alive: true, pos: { x, y: 0, z }, prevPos: { x, y: 0, z },
      vel: { x: 1, z: 0 }, rot: 0,
      data: { kind: 'missile', targetId, turnRate: 3.0, projSpeed: 200, armed: true } };
  }
  function boot(fittings) {
    const state = {
      mode: 'flight', simTime: 1, playerId: 1,
      entities: new Map(), entityList: [],
      input: { deployCountermeasure: false },
      ui: { screenStack: [] },
      entityIndex: { __spacefaceEntityIndexV1: true, ships: [], projectiles: [] },
      rng: () => 0.0, // deterministic RNG stub (< divertPct → chaff diversion always happens)
    };
    const player = makeShip(1, 0, 0, fittings);
    const attacker = makeShip(2, 400, 0, []);
    attacker.data.combat.lockTarget = 1; attacker.data.combat.lockProgress = 0.9;
    const missile = makeMissile(10, 1, 200, 0); // targeting player, closing
    state.entities.set(1, player); state.entities.set(2, attacker); state.entities.set(10, missile);
    state.entityList = nonIterableEntityList(3, 'countermeasures should use entity indexes instead of iterating entityList');
    state.entityIndex.ships = [player, attacker];
    state.entityIndex.projectiles = [missile];
    const events = [];
    countermeasures.state = state;
    countermeasures.bus = { emit: (e, p) => events.push({ e, p }) };
    countermeasures.helpers = { getEntity: (id) => state.entities.get(id) };
    return { state, player, attacker, missile, events };
  }

  // CHAFF: deploy → missile targeting player diverts to decoy + attacker lock breaks.
  {
    const ctx = boot(['mod_chaff_dispenser_m']);
    ctx.state.input.deployCountermeasure = true;
    countermeasures.update(0.016, ctx.state);
    assert.equal(ctx.state.input.deployCountermeasure, false, 'deploy flag should be consumed');
    assert.ok(ctx.player.data.cm && ctx.player.data.cm.effect, 'chaff effect should be active after deploy');
    assert.ok(ctx.player.data.cm.cooldownT > 0, 'chaff should start its cooldown');
    // The lock on the player should be broken (lockBreakPct 1.0 → lockProgress 0).
    assert.ok(ctx.attacker.data.combat.lockProgress < 0.01 && ctx.attacker.data.combat.lockTarget == null,
      'chaff should fully break the attacker missile lock');
    // Run the effect-application tick: the missile should divert to the decoy. The deterministic
    // state.rng stub returns 0.0 (< divertPct 0.85) so diversion always happens in the test.
    countermeasures.update(0.016, ctx.state);
    assert.equal(ctx.missile.data.targetId !== 1, true, 'chaff should divert the missile away from the player');
    assert.equal(ctx.missile.data.diverted, true, 'diverted missile should be flagged');
    // A second deploy while on cooldown is a no-op.
    ctx.state.input.deployCountermeasure = true;
    const cdBefore = ctx.player.data.cm.cooldownT;
    countermeasures.update(0.016, ctx.state);
    assert.ok(ctx.player.data.cm.cooldownT <= cdBefore, 'chaff on cooldown should not reset the timer');
  }

  // ECM: deploy → missile turnRate zeroed (jammed) for the effect duration, restored after.
  {
    const ctx = boot(['mod_ecm_jammer_l']);
    ctx.state.input.deployCountermeasure = true;
    countermeasures.update(0.016, ctx.state);
    assert.ok(ctx.player.data.cm && ctx.player.data.cm.effect.cfg.kind === 'ecm', 'ECM effect active');
    countermeasures.update(0.016, ctx.state); // apply jam
    assert.equal(ctx.missile.data.turnRate, 0, 'ECM should zero the missile turnRate (jam guidance)');
    assert.ok(ctx.missile.data._jammedTurnRate === 3.0, 'ECM should store the original turnRate for restore');
    // Tick past the effect duration (4.0s) → jam restores.
    for (let i = 0; i < 300; i++) countermeasures.update(0.016, ctx.state);
    assert.equal(ctx.missile.data.turnRate, 3.0, 'ECM jam should restore turnRate when the effect expires');
    assert.equal(ctx.missile.data._jammedTurnRate, undefined, 'restore should clear the _jammedTurnRate marker');
  }

  // No countermeasure equipped → deploy is a silent no-op (no crash, no effect).
  {
    const ctx = boot([]);
    ctx.state.input.deployCountermeasure = true;
    countermeasures.update(0.016, ctx.state);
    assert.ok(!ctx.player.data.cm || !ctx.player.data.cm.effect, 'no countermeasure equipped → no effect');
    assert.equal(ctx.missile.data.targetId, 1, 'missile should keep tracking the player with no countermeasure');
  }

  // AI auto-deploy: a countermeasure-equipped NPC should react to a ship locking onto it without
  // scanning the full world entity list.
  {
    const ctx = boot([]);
    ctx.player.data.combat.lockTarget = 2;
    ctx.player.data.combat.lockProgress = 0.9;
    ctx.attacker.data.fittings = ['mod_chaff_dispenser_m'];
    ctx.missile.data.targetId = 99;
    countermeasures.update(0.016, ctx.state);
    assert.ok(ctx.attacker.data.cm && ctx.attacker.data.cm.effect,
      'AI ship should auto-deploy a countermeasure when another ship is locking it');
    assert.equal(ctx.player.data.combat.lockTarget, null,
      'AI chaff should break the hostile lock using indexed ship candidates');
  }
}
checkCountermeasuresInterceptMissiles();

function checkCountermeasureEffectsUseSpatialProjectileQueries() {
  const state = createGameState(92);
  state.mode = 'flight';
  state.entities.clear();
  state.entityList.length = 0;
  state.playerId = 1;
  state.input.deployCountermeasure = false;

  const ship = {
    id: 1,
    type: 'ship',
    alive: true,
    collides: true,
    radius: 8,
    pos: { x: 0, z: 0 },
    data: {
      cm: {
        cooldownT: 0,
        effectT: 1,
        effect: { cfg: { kind: 'ecm', radius: 120, turnRateMult: 0 }, decoyId: null },
      },
    },
  };
  const nearMissile = {
    id: 2,
    type: 'projectile',
    alive: true,
    collides: true,
    radius: 2,
    pos: { x: 80, z: 0 },
    data: { kind: 'missile', targetId: ship.id, turnRate: 3 },
  };
  const projectiles = [nearMissile];
  for (let i = 0; i < 180; i++) {
    projectiles.push({
      id: 10 + i,
      type: 'projectile',
      alive: true,
      collides: true,
      radius: 2,
      pos: { x: 5000 + i * 90, z: 0 },
      data: { kind: 'missile', targetId: ship.id, turnRate: 3 },
    });
  }
  for (const e of [ship, ...projectiles]) {
    state.entities.set(e.id, e);
    state.entityList.push(e);
  }
  state.entityIndex = {
    __spacefaceEntityIndexV1: true,
    projectiles,
  };

  countermeasures.init({ state, bus: { emit() {} }, helpers: {} });
  state.spatialHash.rebuild(state.entityList);
  countermeasures.update(1 / 60, state);

  assert.equal(nearMissile.data.turnRate, 0, 'near missile should still be jammed by ECM');
  assert.equal(projectiles[1].data.turnRate, 3, 'far missiles should not be touched by the local ECM effect');
  assert.equal(state.countermeasureRuntime.diagnostics.effectSpatialQueries, 1,
    'countermeasure effect should query nearby projectiles through the spatial hash');
  assert(state.countermeasureRuntime.diagnostics.projectileCandidates < projectiles.length,
    'countermeasure effect should avoid scanning every projectile in the sector');
}
checkCountermeasureEffectsUseSpatialProjectileQueries();

// Wingmen (P1-8): fleet ledger entries spawn as LIVE team-0 entities on sector enter, sync hull
// back to the ledger, and route death through onHitAsset so the fleet entry is removed. Guards the
// "wingmen are flyable, not passive ledger entries" contract behaviorally.
function checkWingmenSpawnAsLiveEntities() {
  let nextEntId = 5000;
  function boot(fleet) {
    const state = {
      mode: 'flight', simTime: 1, playerId: 1,
      entities: new Map(), entityList: [],
      automation: { fleet: fleet.slice() },
      ui: { screenStack: [] },
      entityIndex: { projectiles: [] },
    };
    // Player entity for spawn positioning.
    state.entities.set(1, { id: 1, type: 'ship', alive: true, pos: { x: 0, y: 0, z: 0 }, data: {} });
    const events = [];
    wingmen.state = state;
    wingmen.bus = { emit: (e, p) => events.push({ e, p }) };
    wingmen._fleetRef = null;
    wingmen._fleetSourceRows = [];
    wingmen._fleetSourceIds = [];
    wingmen._orderedFleet = [];
    wingmen._orderRuntime = new Map();
    wingmen.helpers = {
      spawnEntity(spec) {
        const e = { id: nextEntId++, type: 'ship', alive: true,
          pos: spec.pos || { x: 0, z: 0 }, hull: 100, hullMax: 100, data: spec.data || {}, team: spec.team };
        state.entities.set(e.id, e);
        state.entityList.push(e);
        return e;
      },
      getEntity: (id) => state.entities.get(id) || null,
    };
    return { state, events };
  }

  // 1. sector:enter spawns a live entity per fleet entry, tagged team 0 + isWingman.
  const ctx = boot([
    { id: 'f1', shipDefId: 'ship_wasp', order: 'escort', hp: 1, hullPct: 1, status: 'escort' },
    { id: 'f2', shipDefId: 'ship_pelican', order: 'attack', hp: 1, hullPct: 1, status: 'attack' },
  ]);
  // (init registers bus listeners — not needed for this direct-call test; state/bus/helpers are set by boot.)
  wingmen._spawnWingmen();
  const f1 = ctx.state.automation.fleet[0];
  const f2 = ctx.state.automation.fleet[1];
  assert.ok(f1._liveId, 'fleet entry f1 should get a _liveId after spawn');
  assert.ok(f2._liveId, 'fleet entry f2 should get a _liveId after spawn');
  const e1 = ctx.state.entities.get(f1._liveId);
  const e2 = ctx.state.entities.get(f2._liveId);
  assert.ok(e1 && e1.alive, 'f1 wingman should be a live entity');
  assert.ok(e2 && e2.alive, 'f2 wingman should be a live entity');
  assert.equal(e1.team, 0, 'wingman must be team 0 (player-aligned — AI targets team-1 hostiles)');
  assert.equal(e1.data.isWingman, true, 'wingman entity must be flagged isWingman');
  assert.equal(e2.data.ai && e2.data.ai.archetype, 'pirate', 'attack-order wingman should use the pirate (aggressive) archetype');

  // 2. update syncs hull% back to the ledger.
  e1.hull = 40; // take damage
  wingmen.update(0.016, ctx.state);
  assert.ok(Math.abs(f1.hullPct - 0.4) < 0.01, 'fleet hullPct should sync from live entity hull (40/100 = 0.4)');

  // 3. Wingman death → combat:hitAsset emitted + fleet entry removed.
  e1.alive = false;
  wingmen.update(0.016, ctx.state);
  assert.ok(ctx.events.some((ev) => ev.e === 'combat:hitAsset' && ev.p && ev.p.assetKind === 'fleet'),
    'wingman death must emit combat:hitAsset {assetKind:"fleet"} so automation.onHitAsset removes the ledger entry');

  // 4. Hard sector:exit despawns remaining wingmen (clears _liveId). Continuous handoffs skip
  // _despawnWingmen; this path exercises the intentional jump/load teardown.
  const beforeCount = ctx.state.entityList.filter((e) => e.data && e.data.isWingman && e.alive).length;
  assert.ok(beforeCount >= 1, 'at least one wingman should still be alive before hard sector:exit');
  wingmen._despawnWingmen();
  for (const fs of ctx.state.automation.fleet) {
    assert.ok(!fs._liveId, 'hard sector:exit should clear _liveId on all fleet entries');
  }

  // 5. Empty fleet → no spawn, no crash.
  const ctx2 = boot([]);
  wingmen.state = ctx2.state;
  wingmen._spawnWingmen();
  assert.equal(ctx2.state.entityList.length, 0, 'empty fleet should spawn nothing');
}
checkWingmenSpawnAsLiveEntities();

// Ironman difficulty is advertised as "permadeath" in the New Game UI, but the runtime previously
// respawned identically for all difficulties — a false-advertised feature. Now combat.kill() on
// Ironman emits game:over and leaves the player dead instead of respawning. Guards the contract.
function checkIronmanDeathEndsTheRun() {
  const makeVec = (x, z) => ({ x, y: 0, z, set(nx, ny, nz) { this.x = nx; this.y = ny || 0; this.z = nz; return this; }, copy(p) { this.x = p.x; this.y = p.y || 0; this.z = p.z; return this; } });
  function makePlayer() {
    return { id: 1, type: 'ship', alive: true, pos: makeVec(10, 10), prevPos: makeVec(10, 10), vel: makeVec(0, 0), flags: {}, data: { defId: 'ship_pelican' }, hull: 0, hullMax: 180, shield: 0, shieldMax: 60, cap: 0, capMax: 110 };
  }
  function bootCombat(difficulty) {
    const state = {
      playerId: 1, simTime: 42,
      settings: { gameplay: { difficulty } },
      combat: {},
      player: { credits: 100, insurance: { rate: 0.6, deductibleCr: 500, insuredModules: false, lastStationId: 'station_helios' }, ownedShips: [{ defId: 'ship_pelican', fittings: [] }], activeShipIndex: 0, cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 100, capMass: 100 } },
      entities: new Map(),
      world: { currentSectorId: 'sector_helios_prime', activeSector: { stations: [{ stationId: 'station_helios', pos: { x: 320, z: -80 } }] } },
    };
    const player = makePlayer();
    state.entities.set(player.id, player);
    const events = [];
    combat.state = state;
    combat.bus = { emit: (event, payload) => events.push({ event, payload }) };
    return { state, player, events };
  }

  // Ironman: kill emits game:over + player:death, does NOT respawn, leaves the entity dead.
  const iron = bootCombat('ironman');
  combat.kill(iron.player, 99);
  assert(iron.events.some((e) => e.event === 'game:over'), 'ironman death must emit game:over');
  assert(iron.events.some((e) => e.event === 'player:death'), 'ironman death must still emit player:death (for the death banner/VFX)');
  assert(!iron.events.some((e) => e.event === 'player:respawn'), 'ironman death must NOT respawn');
  assert.equal(iron.player.alive, false, 'ironman death must leave the player entity dead');
  assert.equal(iron.player.hull, 0, 'ironman death must NOT heal the player');

  // Non-Ironman difficulties freeze on the recoverable after-action screen. Consequences and
  // respawn happen only after the player chooses recovery; death itself never auto-accepts them.
  for (const diff of ['casual', 'standard', 'veteran']) {
    const run = bootCombat(diff);
    combat.kill(run.player, 99);
    const defeat = run.events.find((e) => e.event === 'game:over');
    assert.equal(defeat && defeat.payload.recoverable, true, `${diff} death must offer recoverable after-action choice`);
    assert(!run.events.some((e) => e.event === 'player:respawn'), `${diff} death must not auto-accept recovery consequences`);
    assert.equal(run.player.alive, false, `${diff} player stays defeated until recovery is chosen`);
    const recovered = combat.recoverPendingPlayer({ source: 'gameplay_core_fixture' });
    assert.equal(recovered.ok, true, `${diff} recovery choice must resolve the pending defeat`);
    assert(run.events.some((e) => e.event === 'player:respawn'), `${diff} recovery choice must respawn at the lawful dock`);
    assert.equal(run.player.alive, true, `${diff} chosen recovery must leave the player alive`);
  }
}
checkIronmanDeathEndsTheRun();

function checkCleanSpawnAndDockedSafety() {
  const vec = (x, z) => ({
    x, y: 0, z,
    set(nx, ny, nz) { this.x = nx; this.y = ny || 0; this.z = nz; return this; },
    copy(p) { this.x = p.x; this.y = p.y || 0; this.z = p.z; return this; },
  });
  const makeShip = (id, team, x, z, data = {}) => ({
    id,
    type: 'ship',
    alive: true,
    team,
    pos: vec(x, z),
    vel: vec(0, 0),
    rot: 0,
    radius: 14,
    mass: 120,
    hull: 120,
    hullMax: 120,
    shield: 80,
    shieldMax: 80,
    cap: 100,
    capMax: 100,
    flags: {},
    data,
  });

  const player = makeShip(1, 0, 0, 0, { defId: 'ship_kestrel' });
  const patrol = makeShip(2, 1, 120, 0, { ai: { lawful: true }, weapons: ['wpn_pulse_laser_s'] });
  const trader = makeShip(3, 2, 160, 0, { ai: { passive: true, archetype: 'trader' } });
  const pirate = makeShip(4, 1, 240, 0, { ai: { archetype: 'pirate' }, weapons: ['wpn_pulse_laser_s'] });
  const state = {
    mode: 'flight',
    tick: 10,
    simTime: 20,
    meta: { seed: 777 },
    playerId: player.id,
    player: { heat: 0 },
    ui: { docked: false },
    settings: { gameplay: {} },
    entities: new Map(),
    entityList: [],
    entityIndex: { __spacefaceEntityIndexV1: true, ready: true, collidables: [], aiShips: [] },
    combat: { entities: {}, attachments: { byId: {} }, trace: { events: [] } },
    ai: {},
  };
  for (const e of [player, patrol, trader, pirate]) {
    state.entities.set(e.id, e);
    state.entityList.push(e);
    state.entityIndex.collidables.push(e);
    if (e !== player) state.entityIndex.aiShips.push(e);
  }

  const helpers = {};
  aiPorts.init({ state, bus: createBus(), helpers });
  const frame = helpers.aiSensors.liveFrameFor(player.id, state.tick);
  const contacts = new Map(frame.contacts.map((contact) => [contact.id, contact]));
  assert.equal(contacts.get(patrol.id).hostile, false, 'clean player should not see lawful patrols as hostile');
  assert.equal(contacts.get(patrol.id).threat, 0, 'clean lawful patrols should not contribute hostile threat');
  assert.equal(contacts.get(trader.id).hostile, false, 'traders near spawn should not be hostile contacts');
  assert.equal(contacts.get(trader.id).threat, 0, 'traders near spawn should not contribute hostile threat');
  assert.equal(contacts.get(pirate.id).hostile, true, 'explicit pirate contacts remain hostile');
  assert.equal(isHostileToPlayer(patrol, player.team, state), false, 'HUD/radar should not paint clean lawful patrols red');
  assert.equal(isHostileToPlayer(trader, player.team, state), false, 'HUD/radar should not paint traders red');
  assert.equal(isHostileToPlayer(pirate, player.team, state), true, 'HUD/radar should still paint pirates red');

  const combatBus = createBus();
  const emitted = [];
  const originalEmit = combatBus.emit.bind(combatBus);
  combatBus.emit = (event, payload) => {
    emitted.push({ event, payload });
    return originalEmit(event, payload);
  };
  combat.init({ state, bus: combatBus, helpers: {}, registry: null });
  combatBus.emit('dock:docked', { stationId: 'station_helios' });
  assert.equal(player.flags.docked, true, 'dock:docked should mark the player dock-protected');
  assert.equal(player.flags.invuln, true, 'docked player should be invulnerable');
  assert.equal(player._invulnUntil, Infinity, 'docked player protection should not expire while still docked');
  const beforeHull = player.hull;
  const hit = combat.onHit({ targetId: player.id, ownerId: pirate.id, damage: 999, damageType: 'kinetic', pos: { x: 0, z: 0 } });
  assert.equal(hit.reason, 'target_docked', 'incoming damage against a docked player should be rejected');
  assert.equal(player.hull, beforeHull, 'docked player hull should not change when hit');
  assert.equal(emitted.some((item) => item.event === 'camera:shake'), false, 'rejected docked hits should not shake the camera');
  player.flags.docked = false;
  player.flags.invuln = false;
  state.ui.docked = true;
  const routed = combat.ensureKernel().routeDamage({
    attackerId: pirate.id,
    targetId: player.id,
    packet: scalarHitToDamagePacket({ damage: 999, damageType: 'kinetic', pos: { x: 0, z: 0 } }),
    origin: { kind: 'test', id: 'ui-docked-route-damage' },
  });
  assert.equal(routed.reason, 'target_docked', 'direct routed damage must also respect UI docked state');
  assert.equal(player.hull, beforeHull, 'direct routed damage must not change docked player hull');
  state.ui.docked = false;
  combatBus.emit('dock:undocked', {});
  assert.equal(player.flags.docked, false, 'dock:undocked should clear docked protection');
  assert.equal(player.flags.invuln, true, 'undocking should grant a short launch grace window');
  assert.equal(player._invulnUntil, state.simTime + UNDOCK_INVULN_S,
    'undock grace should use the canonical eight-second safety window');
}
checkCleanSpawnAndDockedSafety();
checkPlayerGimbalBears360Degrees();
checkRetiredAutoTargetFlagCannotOwnAimOrTrigger();
checkAutoTargetAssistReinitNoListenerLeak();
checkPursuitSelectionPreservesCursorAndManualAxes();
checkTargetCycleHostilesOnly();
checkPursuitGToggleSelectsCurrentLock();
checkPursuitNeverRefreshesPlayerSelectedLock();
checkWeaponHeatHudSummary();

console.log('Core gameplay checks OK');
