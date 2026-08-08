import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RECOVERY_SCENARIO_IDS,
  SANDBOX_CAMERA_CANDIDATES,
  SANDBOX_PHYSICS_LOADOUTS,
  SCENARIO_PRESETS,
  applySandboxSetup,
  buildSandboxLaunchConfig,
  installSandboxGameStartedHook,
  requestSandboxGame,
} from '../src/ui/sandbox/sandboxSetup.js';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { SECTOR_ZONES } from '../src/data/sectorZones.js';
import {
  CERES_ACTIVITY_POCKETS_BY_ID,
  CERES_REFERENCE_ACCEPTANCE_ENTRY,
} from '../src/data/sectorActivityPockets.js';
import { PQ019_HEIST_SECTOR_ID } from '../src/data/heistFacilities.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { TECH_NODES } from '../src/data/tech.js';
import { economy as economyPrototype } from '../src/systems/economy.js';
import { makeShipEntitySpec, ships as shipsPrototype } from '../src/systems/ships.js';

function recoveryPreset(id) {
  return SCENARIO_PRESETS.find((preset) => preset.id === id);
}

function makeContext() {
  const enteredSectors = [];
  const relocations = [];
  const schedules = [];
  const materialized = [];
  const emitted = [];
  const spawned = [];
  const cameraZooms = [];
  let nextEntity = 1;

  const playerEntity = {
    id: 'player',
    type: 'ship',
    pos: { x: 20, z: -30 },
  };
  const entities = new Map([[playerEntity.id, playerEntity]]);
  const systems = new Map([
    ['world', {
      enterSector(sectorId) {
        enteredSectors.push(sectorId);
      },
      relocatePlayerInSector(pose, meta) {
        relocations.push({ pose: { ...pose }, meta: { ...meta } });
        playerEntity.pos.x = pose.x;
        playerEntity.pos.z = pose.z;
        return true;
      },
    }],
    ['heistFacilities', {
      materializeForSector(sectorId) {
        materialized.push(sectorId);
      },
      requestLaunchSchedule(schedule) {
        schedules.push({ ...schedule });
        return true;
      },
    }],
  ]);

  const ctx = {
    state: {
      playerId: playerEntity.id,
      player: {
        credits: 0,
        activeShipIndex: 0,
        ownedShips: [{ defId: 'ship_kestrel', fittings: [] }],
        moduleInventory: [],
        researchedNodes: [],
        researchPoints: 0,
      },
      entities,
      rng: () => 0,
      tick: 41,
      simTime: 12,
      render: {
        cameraCtrl: {
          setZoom(zoom) {
            cameraZooms.push(zoom);
          },
          snapToPlayer() {},
        },
      },
    },
    registry: {
      get(name) {
        return systems.get(name) || null;
      },
    },
    helpers: {
      spawnEntity(spec) {
        const entity = {
          ...spec,
          id: spec.id || `sandbox-test-${nextEntity++}`,
          pos: { ...(spec.pos || { x: 0, z: 0 }) },
          data: { ...(spec.data || {}) },
        };
        entities.set(entity.id, entity);
        spawned.push(entity);
        return entity;
      },
    },
    bus: {
      emit(type, payload) {
        emitted.push({ type, payload });
      },
    },
  };

  return {
    ctx,
    enteredSectors,
    relocations,
    schedules,
    materialized,
    emitted,
    spawned,
    cameraZooms,
  };
}

test('recovery launcher exposes the exact eight named playtest scenarios', () => {
  assert.equal(new Set(RECOVERY_SCENARIO_IDS).size, 8);
  assert.deepEqual(RECOVERY_SCENARIO_IDS, [
    'massline_long_line',
    'massline_short_line',
    'massline_moving_anchor',
    'physics_swarm',
    'ceres_reference_pocket',
    'planet_sling_course',
    'crime_interception',
    'visual_stress_scene',
  ]);

  for (const id of RECOVERY_SCENARIO_IDS) {
    const matches = SCENARIO_PRESETS.filter((preset) => preset.id === id);
    assert.equal(matches.length, 1, `${id} has one launcher card`);
    assert.equal(matches[0].config.scenarioId, id, `${id} preserves its receipt identity`);
    assert.ok(matches[0].config.cameraCandidate, `${id} has repeatable camera framing`);
  }

  assert.deepEqual(SANDBOX_CAMERA_CANDIDATES.map((candidate) => candidate.zoom), [72, 96, 120, 144]);
  assert.deepEqual(SANDBOX_PHYSICS_LOADOUTS.map((loadout) => loadout.id), [
    'starter',
    'impulse',
    'physics_toolkit',
  ]);
});

test('fine-tune overrides clone frozen presets and clamp human inputs', () => {
  const base = recoveryPreset('physics_swarm').config;
  const before = base.physicsSwarm;
  const config = buildSandboxLaunchConfig(base, {
    cameraCandidate: 'physics_study',
    physicsLoadout: 'impulse',
    enemyCount: 99.8,
    masslineEnabled: true,
    lineLength: 5,
    anchorMass: 2_000_000,
  });

  assert.notEqual(config, base);
  assert.notEqual(config.physicsSwarm, before);
  assert.equal(before.lightCount, 10, 'frozen preset stays unchanged');
  assert.equal(config.physicsSwarm.lightCount, 18);
  assert.equal(config.physicsSwarm.mediumCount, 2);
  assert.equal(config.physicsSwarm.lightCount + config.physicsSwarm.mediumCount, 20);
  assert.equal(config.cameraCandidate, 'physics_study');
  assert.equal(config.physicsLoadout, 'impulse');
  assert.deepEqual(config.masslineRange, { distance: 60, mass: 1_000_000 });
});

test('physics swarm enemy override is a clamped total that preserves authored mediums when possible', () => {
  const base = recoveryPreset('physics_swarm').config;
  const cases = [
    { override: -1, light: 0, medium: 0, total: 0 },
    { override: 0, light: 0, medium: 0, total: 0 },
    { override: 1, light: 0, medium: 1, total: 1 },
    { override: 2, light: 0, medium: 2, total: 2 },
    { override: 3, light: 1, medium: 2, total: 3 },
    { override: 20, light: 18, medium: 2, total: 20 },
    { override: 99.8, light: 18, medium: 2, total: 20 },
  ];

  for (const expected of cases) {
    const config = buildSandboxLaunchConfig(base, { enemyCount: expected.override });
    assert.equal(config.physicsSwarm.lightCount, expected.light, `light count for ${expected.override}`);
    assert.equal(config.physicsSwarm.mediumCount, expected.medium, `medium count for ${expected.override}`);
    assert.equal(
      config.physicsSwarm.lightCount + config.physicsSwarm.mediumCount,
      expected.total,
      `composed total for ${expected.override}`,
    );
  }
});

test('physics swarm preset uses production economy and ships writers to unlock and fit the Hornet toolkit', () => {
  const state = createGameState(0x50a6);
  const bus = createBus();
  const economy = Object.create(economyPrototype);
  const ships = Object.create(shipsPrototype);
  const systems = new Map([['economy', economy], ['ships', ships]]);
  const helpers = {
    spawnEntity(spec) {
      const entity = {
        ...spec,
        id: state.nextEntityId++,
        alive: true,
        pos: { ...(spec.pos || { x: 0, z: 0 }) },
        data: { ...(spec.data || {}) },
      };
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
  };
  const registry = { get: (name) => systems.get(name) || null };
  const ctx = { state, bus, helpers, registry };
  const creditChanges = [];
  const toasts = [];
  bus.on('credits:changed', (payload) => creditChanges.push(payload));
  bus.on('toast', (payload) => toasts.push(payload));

  economy.init(ctx);
  ships.init(ctx);
  ships.newGame();
  const starter = state.player.ownedShips[0];
  const player = helpers.spawnEntity(makeShipEntitySpec(starter.defId, {
    isPlayer: true,
    player: state.player,
    fittings: starter.fittings,
    appearance: starter.appearance,
    livingHull: starter.livingHull,
    pos: { x: 0, z: 0 },
  }));
  state.playerId = player.id;

  const preset = recoveryPreset('physics_swarm');
  applySandboxSetup(ctx, preset.config);

  const active = state.player.ownedShips[state.player.activeShipIndex];
  const toolkit = SANDBOX_PHYSICS_LOADOUTS.find((loadout) => loadout.id === 'physics_toolkit');
  assert.equal(active.defId, 'ship_hornet');
  assert.deepEqual(toolkit.itemIds.filter((defId) => active.fittings.includes(defId)), toolkit.itemIds);
  assert.equal(state.player.credits, preset.config.credits, 'tech charges retain the requested launch balance');
  assert.equal(state.player.researchedNodes.length, TECH_NODES.length, 'the full production tech tree unlocks');
  assert.ok(state.player.researchedNodes.includes('tech_graviton_drives'));

  const remainingTechCost = TECH_NODES.reduce((sum, node) => sum + node.cost.credits, 0);
  assert.ok(creditChanges.some((entry) => (
    entry.reason === 'sandbox:tech-budget' && entry.delta === remainingTechCost
  )), 'the canonical economy writer provisions the exact remaining tech-credit budget');
  assert.deepEqual(
    toasts.filter((entry) => entry && entry.kind === 'error'),
    [],
    'unlock-all never surfaces false prerequisite failures while walking the production tree',
  );
});

test('sandbox hook applies the Ceres acceptance entry once and clears a later failed launch', () => {
  const bus = createBus();
  const state = createGameState(0xc3e5);
  const economy = Object.create(economyPrototype);
  const ships = Object.create(shipsPrototype);
  const toasts = [];
  const newGames = [];
  const enteredSectors = [];
  const relocations = [];
  const cameraZooms = [];
  const shipCalls = [];
  const systems = new Map([
    ['economy', economy],
    ['ships', ships],
    ['world', {
      enterSector(sectorId) { enteredSectors.push(sectorId); },
      relocatePlayerInSector(pose, meta) {
        relocations.push({ pose: { ...pose }, meta: { ...meta } });
        return true;
      },
    }],
  ]);
  const helpers = {
    spawnEntity(spec) {
      const entity = {
        ...spec,
        id: state.nextEntityId++,
        alive: true,
        pos: { ...(spec.pos || { x: 0, z: 0 }) },
        data: { ...(spec.data || {}) },
      };
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
  };
  const ctx = {
    state,
    registry: { get: (name) => systems.get(name) || null },
    helpers,
    bus,
  };
  economy.init(ctx);
  ships.init(ctx);
  ships.newGame();
  const starter = state.player.ownedShips[0];
  assert.equal(starter.defId, 'ship_kestrel', 'ordinary New Game still owns the Kestrel default');
  const player = helpers.spawnEntity(makeShipEntitySpec(starter.defId, {
    isPlayer: true,
    player: state.player,
    fittings: starter.fittings,
    appearance: starter.appearance,
    livingHull: starter.livingHull,
    pos: { x: 0, z: 0 },
  }));
  state.playerId = player.id;
  state.render.cameraCtrl = {
    setZoom(zoom) { cameraZooms.push(zoom); },
    snapToPlayer() {},
  };
  for (const method of ['buyShip', 'setActiveShip', 'grantModule', 'unfitModule', 'fitModule']) {
    const original = ships[method].bind(ships);
    ships[method] = (...args) => {
      shipCalls.push({ method, args });
      return original(...args);
    };
  }
  bus.on('toast', (payload) => toasts.push(payload));
  bus.on('game:new', (payload) => newGames.push(payload));
  installSandboxGameStartedHook(bus, ctx);

  const entry = CERES_REFERENCE_ACCEPTANCE_ENTRY;
  const preset = recoveryPreset('ceres_reference_pocket');
  requestSandboxGame(bus, preset.config);
  assert.deepEqual(newGames, [{}], 'the launcher enters through the public game:new route');
  bus.emit('game:started', {});

  const active = state.player.ownedShips[state.player.activeShipIndex];
  const pocket = CERES_ACTIVITY_POCKETS_BY_ID[entry.pocketId];
  const zone = SECTOR_ZONES[entry.sectorId].find((row) => row.id === pocket.activityAnchor.zoneId);
  const expected = sectorLocalToGlobalForSector({
    x: zone.center.x + entry.entryOffset.x,
    z: zone.center.z + entry.entryOffset.z,
  }, entry.sectorId);
  assert.equal(active.defId, entry.shipId);
  assert.deepEqual(entry.itemIds.filter((defId) => active.fittings.includes(defId)), entry.itemIds);
  assert.deepEqual(enteredSectors, [entry.sectorId]);
  assert.deepEqual(relocations, [{
    pose: { x: expected.x, z: expected.z, heading: 0 },
    meta: { reason: `sandbox:${pocket.activityAnchor.zoneId}` },
  }]);
  assert.deepEqual(cameraZooms, [entry.cameraZoomWU]);
  assert.equal(shipCalls.some((call) => call.method === 'buyShip'), true);
  assert.equal(shipCalls.some((call) => call.method === 'setActiveShip'), true);
  assert.deepEqual(
    shipCalls.filter((call) => call.method === 'grantModule').map((call) => call.args[0].defId),
    entry.itemIds,
    'the acceptance entry grants only its named physics toolkit',
  );

  const toastCount = toasts.length;
  requestSandboxGame(bus, { scenarioId: 'physics_swarm' });
  bus.emit('game:startFailed', { error: 'synthetic launch failure' });
  bus.emit('game:started', {});

  assert.equal(toasts.length, toastCount,
    'ordinary start cannot consume config from the failed Sandbox launch');
});

test('Ceres preset derives its anchor-local entry from the activity contract', () => {
  const h = makeContext();
  const preset = recoveryPreset('ceres_reference_pocket');
  applySandboxSetup(h.ctx, preset.config);

  const entry = CERES_REFERENCE_ACCEPTANCE_ENTRY;
  const pocket = CERES_ACTIVITY_POCKETS_BY_ID[entry.pocketId];
  const zone = SECTOR_ZONES[entry.sectorId].find((item) => item.id === pocket.activityAnchor.zoneId);
  const expected = sectorLocalToGlobalForSector({
    x: zone.center.x + entry.entryOffset.x,
    z: zone.center.z + entry.entryOffset.z,
  }, entry.sectorId);

  assert.equal(preset.config.shipId, entry.shipId);
  assert.equal(preset.config.physicsLoadout, entry.loadoutId);
  assert.equal(preset.config.unlockAllTech, true);
  assert.equal(Object.hasOwn(preset.config, 'grantAllModules'), false);
  assert.equal(Object.hasOwn(preset.config, 'credits'), false);
  assert.equal(preset.config.spawnAtZoneId, pocket.activityAnchor.zoneId);
  assert.deepEqual(preset.config.spawnAtZoneOffset, entry.entryOffset);
  assert.deepEqual(h.enteredSectors, [entry.sectorId]);
  assert.deepEqual(h.relocations, [{
    pose: { x: expected.x, z: expected.z, heading: 0 },
    meta: { reason: `sandbox:${pocket.activityAnchor.zoneId}` },
  }]);
  assert.deepEqual(h.cameraZooms, [entry.cameraZoomWU]);
  assert.equal(h.emitted.at(-1).payload.text, 'Sandbox: Ceres Reference Pocket ready');
});

test('physical-play presets compose production spawns, relocation and launch scheduling', async (t) => {
  await t.test('physics swarm creates the requested hostiles and collision anchors', () => {
    const h = makeContext();
    applySandboxSetup(h.ctx, {
      scenarioId: 'physics_swarm',
      physicsSwarm: { lightCount: 3, mediumCount: 2, anchorCount: 2 },
      cameraCandidate: 'wide_gameplay',
    });

    assert.equal(h.spawned.filter((entity) => entity.data.sandboxCollisionAnchor).length, 2);
    assert.equal(h.spawned.filter((entity) => entity.type === 'ship').length, 5);
    assert.equal(h.spawned.length, 7);
    assert.deepEqual(h.cameraZooms, [120]);
  });

  await t.test('Massline static and moving targets keep their requested physical traits', () => {
    const staticHarness = makeContext();
    applySandboxSetup(staticHarness.ctx, {
      masslineRange: { distance: 220, mass: 1800, preAttach: false },
    });
    assert.equal(staticHarness.spawned[0].data.sandboxMasslineAnchor, true);
    assert.equal(staticHarness.spawned[0].mass, 1800);
    assert.equal(staticHarness.spawned[0].pos.x, 240);

    const movingHarness = makeContext();
    applySandboxSetup(movingHarness.ctx, {
      masslineRange: { distance: 170, movingTarget: true, preAttach: false },
    });
    assert.equal(movingHarness.spawned[0].data.sandboxMovingTarget, true);
    assert.deepEqual(movingHarness.spawned[0].vel, { x: 0, z: 42 });
  });

  await t.test('planet course uses Tethys and ordinary physical anchors', () => {
    const h = makeContext();
    applySandboxSetup(h.ctx, recoveryPreset('planet_sling_course').config);
    assert.deepEqual(h.enteredSectors, ['sector_tethys_junction']);
    assert.equal(h.relocations.at(-1).meta.reason, 'sandbox:planet_sling_course');
    assert.equal(h.spawned.filter((entity) => entity.data.sandboxCollisionAnchor).length, 2);
    assert.deepEqual(h.cameraZooms, [144]);
  });

  await t.test('crime interception stages the real facility owner on simulation time', () => {
    const h = makeContext();
    applySandboxSetup(h.ctx, recoveryPreset('crime_interception').config);
    assert.deepEqual(h.enteredSectors, [PQ019_HEIST_SECTOR_ID]);
    assert.deepEqual(h.materialized, [PQ019_HEIST_SECTOR_ID]);
    assert.deepEqual(h.schedules, [{
      scheduleId: 'sandbox-crime-41',
      launchAtSimT: 20,
    }]);
    assert.equal(h.relocations.at(-1).meta.reason, 'sandbox:crime_interception');
  });
});
