// M2-C1 continuous handoff consumers — free-flight membership must not hard-teardown living systems.
//
// Proves: sector:exit { continuous:true } preserves spawnBudget, encounterDirector live/active,
// escort missions, automation drone entity ids, traffic freighters, and wingmen live ids.
// Critical path is exit+enter (not exit alone): continuous sector:enter must not reseed director
// pressure or wipe pending after a soft exit. ambushSignatures + gateControl preserve on soft
// handoff and hard-reset only intentional exits.
// Hard (non-continuous) sector:exit still tears down. Dead sector:leave is not the consumer seam.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createBus } from '../src/core/eventBus.js';
import { spawnBudget, makeBudgetApi } from '../src/systems/spawnBudget.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { ambushSignatures } from '../src/systems/ambushSignatures.js';
import { gateControlDirector } from '../src/systems/gateControlDirector.js';
import { missions } from '../src/systems/missions.js';
import { traffic } from '../src/systems/traffic.js';
import { wingmen } from '../src/systems/wingmen.js';
import { automation } from '../src/systems/automation.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

const HELIOS = 'sector_helios_prime';
const CERES = 'sector_ceres_belt';

function makeState(seed = 7) {
  return {
    mode: 'flight',
    simTime: 100,
    meta: { seed },
    playerId: 1,
    entities: new Map(),
    entityList: [],
    entityIndex: { dockStations: [], stations: [], byStationId: new Map() },
    world: { currentSectorId: HELIOS, activeSector: { id: HELIOS } },
    missions: { active: [], boards: {}, completed: [], failed: [], completedLog: [], receipts: [] },
    player: { credits: 0, researchPoints: 0, stats: {} },
    automation: {
      drones: [{ id: 'd1', entityIds: [101, 102], homeSectorId: HELIOS }],
      fleet: [
        { id: 'f1', shipDefId: 'ship_wasp', order: 'escort', hp: 1, hullPct: 1, status: 'escort', _liveId: 201 },
      ],
      traders: [],
      outposts: [],
    },
    traffic: { freighters: [], rngSeed: seed },
    spawnBudget: null,
    encounterDirector: null,
    rng: (() => {
      let s = seed >>> 0;
      return () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 0x100000000;
      };
    })(),
  };
}

function liveEncounter(id = 'L1') {
  return {
    id,
    shapeId: 'patrol_sweep',
    shape: { pressureCost: 12 },
    deck: 'combat',
    script: null,
    phase: 'active',
    sectorId: HELIOS,
    zoneId: null,
    tier: 1,
    squadId: 'squad_a',
    ids: [],
  };
}

function bootConsumers(state) {
  const bus = createBus();
  const helpers = {
    spawnEntity(spec) {
      const id = (state._nextId = (state._nextId || 1000) + 1);
      const e = {
        id,
        type: 'ship',
        alive: true,
        pos: { ...(spec.pos || { x: 0, z: 0 }) },
        hull: 100,
        hullMax: 100,
        team: spec.team ?? 2,
        data: { ...(spec.data || {}), ...(spec.ai ? { ai: spec.ai } : {}) },
      };
      if (spec.ai) e.data.ai = { ...(e.data.ai || {}), ...spec.ai };
      state.entities.set(id, e);
      state.entityList.push(e);
      return e;
    },
    removeEntity(id) {
      const e = state.entities.get(id);
      if (e) e.alive = false;
    },
  };
  state.entities.set(1, {
    id: 1, type: 'ship', alive: true, isPlayer: true,
    pos: { x: 0, z: 0 }, hull: 100, hullMax: 100, data: {},
  });
  state.entityList.push(state.entities.get(1));

  const ctx = { state, bus, helpers };
  spawnBudget.init(ctx);
  encounterDirector.init(ctx);
  ambushSignatures.init(ctx);
  gateControlDirector.init(ctx);

  missions.state = state;
  missions.bus = bus;
  missions.helpers = helpers;
  bus.on('sector:exit', (p) => missions._onSectorExit(p));

  bus.on('sector:exit', (p) => {
    if (p && (p.continuous || p.noTeleport)) return;
    for (const g of state.automation.drones) g.entityIds = [];
  });

  traffic.state = state;
  traffic.bus = bus;
  traffic.helpers = helpers;
  traffic._active = [];
  traffic.init(ctx);

  wingmen.state = state;
  wingmen.bus = bus;
  wingmen.helpers = helpers;
  wingmen.init(ctx);

  return { bus, helpers, ctx };
}

function emitContinuousHandoff(bus, fromSector, toSector) {
  bus.emit('sector:exit', { sectorId: fromSector, continuous: true, noTeleport: true });
  bus.emit('sector:enter', {
    sectorId: toSector,
    continuous: true,
    noTeleport: true,
    firstVisit: false,
  });
}

test('source: consumers bind sector:exit continuous handoff (no dead sector:leave)', () => {
  for (const rel of [
    'src/systems/spawnBudget.js',
    'src/systems/encounterDirector.js',
    'src/systems/missions.js',
    'src/systems/automation.js',
    'src/systems/traffic.js',
    'src/systems/wingmen.js',
    'src/systems/ambushSignatures.js',
    'src/systems/gateControlDirector.js',
  ]) {
    const src = read(rel);
    assert.match(src, /sector:exit/, rel + ' must listen for sector:exit');
    assert.doesNotMatch(src, /bus\.on\(['"]sector:leave['"]/, rel + ' must not listen for dead sector:leave');
    assert.match(src, /continuous/, rel + ' must branch on continuous handoff');
  }
  const director = read('src/systems/encounterDirector.js');
  assert.match(director, /sector:enter/, 'encounterDirector must listen for sector:enter');
  assert.match(
    director,
    /_onSectorEnter[\s\S]*continuous[\s\S]*noTeleport[\s\S]*return/,
    'encounterDirector continuous enter must early-return (not reseed after soft exit)',
  );
});

test('continuous sector:exit preserves spawnBudget ledger', () => {
  const state = makeState();
  const { bus } = bootConsumers(state);
  const api = makeBudgetApi(state);
  assert.equal(api.request(4, 'enc_live'), 4);
  assert.equal(api.current(), 4);

  bus.emit('sector:exit', { sectorId: HELIOS, continuous: true, noTeleport: true });
  assert.equal(api.current(), 4, 'continuous exit must not reset budget');
  assert.equal(state.spawnBudget.reservations.has('enc_live'), true);

  bus.emit('sector:exit', { sectorId: HELIOS, continuous: false, noTeleport: false });
  assert.equal(api.current(), 0, 'hard exit must reset budget');
});

test('continuous sector:exit preserves encounterDirector live + active', () => {
  const state = makeState();
  const { bus } = bootConsumers(state);
  const dir = state.encounterDirector;
  dir.live = { L1: liveEncounter('L1') };
  dir.pending = [{ shapeId: 'patrol_sweep' }];
  dir.active = { squad_a: { ids: [11], sectorId: HELIOS } };
  dir.plannedKey = 'day1:helios';

  bus.emit('sector:exit', { sectorId: HELIOS, continuous: true, noTeleport: true });
  assert.equal(Object.keys(dir.live).length, 1, 'continuous must keep live encounters');
  assert.equal(dir.pending.length, 1, 'continuous must keep pending');
  assert.equal(Object.keys(dir.active).length, 1, 'continuous must keep active spawn ledger');
  assert.equal(dir.plannedKey, 'day1:helios');

  bus.emit('sector:exit', { sectorId: HELIOS });
  assert.equal(Object.keys(dir.live).length, 0, 'hard exit aborts live');
  assert.equal(dir.pending.length, 0);
  assert.equal(Object.keys(dir.active).length, 0);
  assert.equal(dir.plannedKey, null);
});

test('continuous exit+enter preserves encounterDirector live/pending/pressure (not exit alone)', () => {
  const state = makeState();
  const { bus } = bootConsumers(state);
  const dir = state.encounterDirector;
  dir.live = { L1: liveEncounter('L1') };
  dir.pending = [{ shapeId: 'patrol_sweep', encounterId: 'e1' }];
  dir.active = { squad_a: { ids: [11], sectorId: HELIOS } };
  dir.plannedKey = `${HELIOS}#0`;
  dir.pressure = { combat: 88, civilian: 55 };
  dir.window = [{ t: 50, tier: 'minor' }];
  dir.lastMeaningfulAt = 40;
  dir.lastAmbientAt = 70;
  const pressureBefore = { ...dir.pressure };
  const windowBefore = dir.window.slice();

  emitContinuousHandoff(bus, HELIOS, CERES);

  assert.equal(Object.keys(dir.live).length, 1, 'exit+enter continuous keeps live');
  assert.equal(dir.pending.length, 1, 'exit+enter continuous keeps pending (no replan wipe)');
  assert.equal(Object.keys(dir.active).length, 1, 'exit+enter continuous keeps active ledger');
  assert.equal(dir.plannedKey, `${HELIOS}#0`, 'continuous enter must not replan');
  assert.deepEqual(dir.pressure, pressureBefore, 'continuous enter must not reseed pressure grace');
  assert.deepEqual(dir.window, windowBefore, 'continuous enter must not clear pacing window');
  assert.equal(dir.lastMeaningfulAt, 40, 'continuous enter must not reset meaningful spacing clock');
  assert.equal(dir.lastAmbientAt, 70, 'continuous enter must not reset ambient spacing clock');
});

test('hard sector:enter still reseeds encounterDirector pressure after hard exit', () => {
  const state = makeState();
  const { bus } = bootConsumers(state);
  const dir = state.encounterDirector;
  dir.live = { L1: liveEncounter('L1') };
  dir.pending = [{ shapeId: 'patrol_sweep' }];
  dir.active = { squad_a: { ids: [11], sectorId: HELIOS } };
  dir.plannedKey = 'stale';
  dir.pressure = { combat: 99, civilian: 99 };
  dir.window = [{ t: 1, tier: 'major' }];
  dir.lastMeaningfulAt = 1;

  bus.emit('sector:exit', { sectorId: HELIOS, continuous: false, noTeleport: false });
  bus.emit('sector:enter', { sectorId: CERES, continuous: false, noTeleport: false, firstVisit: true });

  assert.equal(Object.keys(dir.live).length, 0, 'hard exit cleared live before enter');
  assert.notDeepEqual(dir.pressure, { combat: 99, civilian: 99 }, 'hard enter reseeds pressure');
  assert.equal(dir.window.length, 0, 'hard enter clears pacing window');
  assert.equal(dir.lastMeaningfulAt, state.simTime, 'hard enter resets meaningful clock to now');
});

test('continuous exit+enter preserves ambush signature tells; hard exit wipes', () => {
  const state = makeState();
  const { bus } = bootConsumers(state);
  state.ambushSignatures = {
    schemaVersion: 1,
    tells: {
      'ambushTell:e1': {
        id: 'ambushTell:e1',
        encounterId: 'e1',
        shapeId: 'ambush_mine',
        active: true,
        sectorId: HELIOS,
        pos: { x: 10, z: 20 },
        scanned: false,
      },
    },
    lastScan: { tellId: 'ambushTell:e1' },
  };

  emitContinuousHandoff(bus, HELIOS, CERES);
  assert.ok(state.ambushSignatures.tells['ambushTell:e1'], 'continuous handoff keeps tell');
  assert.equal(state.ambushSignatures.tells['ambushTell:e1'].active, true);
  assert.equal(state.ambushSignatures.lastScan.tellId, 'ambushTell:e1');

  bus.emit('sector:exit', { sectorId: CERES, continuous: false, noTeleport: false });
  assert.deepEqual(state.ambushSignatures.tells, {}, 'hard exit wipes tells');
  assert.equal(state.ambushSignatures.lastScan, null);
});

test('continuous exit+enter preserves gate control scene; hard exit clears', () => {
  const state = makeState();
  const { bus } = bootConsumers(state);
  state.gateControl = {
    accum: 0,
    scene: {
      key: `${HELIOS}>${CERES}`,
      type: 'toll',
      wingId: 'gatewing:test',
      entityIds: [501],
      sectorId: HELIOS,
      expiresAt: 200,
    },
    lastSceneAt: { [`${HELIOS}>${CERES}`]: 90 },
  };

  emitContinuousHandoff(bus, HELIOS, CERES);
  assert.ok(state.gateControl.scene, 'continuous handoff keeps active gate scene');
  assert.equal(state.gateControl.scene.wingId, 'gatewing:test');
  assert.deepEqual(state.gateControl.scene.entityIds, [501]);
  assert.equal(state.gateControl.lastSceneAt[`${HELIOS}>${CERES}`], 90);

  bus.emit('sector:exit', { sectorId: CERES, continuous: false, noTeleport: false });
  assert.equal(state.gateControl.scene, null, 'hard exit clears gate scene');
});

test('continuous sector:exit does not fail escort on dest leave; hard exit does', () => {
  const state = makeState();
  state.entities.set(55, {
    id: 55, type: 'ship', alive: true, pos: { x: 10, z: 10 },
    data: { escortee: true },
  });
  state.entityList.push(state.entities.get(55));
  const escort = {
    id: 'm_escort_1',
    type: 'escort',
    title: 'Escort test',
    status: 'active',
    destSectorId: HELIOS,
    destStationId: 'station_helios',
    stationId: 'station_helios',
    factionId: null,
    reward_cr: 100,
    collateral_cr: 0,
    needsTargets: true,
    targetEntityIds: [55],
    _escorteeId: 55,
    objectiveProgress: 0,
    objectiveTarget: 1,
  };
  state.missions.active.push(escort);

  const { bus } = bootConsumers(state);
  state.missions.active = [escort];

  bus.emit('sector:exit', { sectorId: HELIOS, continuous: true, noTeleport: true });
  assert.equal(escort.status, 'active', 'continuous leave of dest must not fail escort');
  assert.equal(escort._escorteeId, 55, 'continuous must keep escortee id');
  assert.deepEqual(escort.targetEntityIds, [55]);

  bus.emit('sector:exit', { sectorId: HELIOS, continuous: false });
  assert.notEqual(escort.status, 'active', 'hard leave of dest with live escortee fails escort');
});

test('continuous sector:exit preserves automation drone entity ids', () => {
  const state = makeState();
  const { bus } = bootConsumers(state);
  assert.deepEqual(state.automation.drones[0].entityIds, [101, 102]);

  bus.emit('sector:exit', { sectorId: HELIOS, continuous: true, noTeleport: true });
  assert.deepEqual(state.automation.drones[0].entityIds, [101, 102], 'continuous keeps drone ids');

  bus.emit('sector:exit', { sectorId: HELIOS });
  assert.deepEqual(state.automation.drones[0].entityIds, [], 'hard exit clears drone ids');
});

test('continuous sector:exit preserves traffic freighters; hard exit cleans up', () => {
  const state = makeState();
  const { bus, helpers } = bootConsumers(state);
  const ent = helpers.spawnEntity({
    type: 'ship', team: 2, pos: { x: 50, z: 50 },
    data: { trafficRole: 'hauler', trafficLabel: 'Cargo Hauler' },
  });
  traffic._active = [ent.id];
  state.traffic.freighters = [{
    id: ent.id, role: 'hauler', targetId: null, waitT: 0, nextTradeT: 5, orbitPhase: 0,
  }];

  bus.emit('sector:exit', { sectorId: HELIOS, continuous: true, noTeleport: true });
  assert.equal(state.traffic.freighters.length, 1, 'continuous preserves freighter records');
  assert.equal(ent.alive, true, 'continuous must not despawn freighters via traffic');

  bus.emit('sector:exit', { sectorId: HELIOS });
  assert.equal(state.traffic.freighters.length, 0, 'hard exit cleans freighters');
  assert.equal(ent.alive, false, 'hard exit despawns freighters');
});

test('continuous sector:exit preserves wingmen live ids; hard exit despawns', () => {
  const state = makeState();
  const live = {
    id: 201, type: 'ship', alive: true, team: 0,
    pos: { x: 20, z: 20 }, hull: 100, hullMax: 100,
    data: { isWingman: true },
  };
  state.entities.set(201, live);
  state.entityList.push(live);
  state.automation.fleet[0]._liveId = 201;

  const { bus } = bootConsumers(state);
  state.automation.fleet[0]._liveId = 201;

  bus.emit('sector:exit', { sectorId: HELIOS, continuous: true, noTeleport: true });
  assert.equal(state.automation.fleet[0]._liveId, 201, 'continuous keeps wingman live id');
  assert.equal(live.alive, true);

  bus.emit('sector:exit', { sectorId: HELIOS, continuous: false });
  assert.equal(state.automation.fleet[0]._liveId, null, 'hard exit clears wingman live id');
  assert.equal(live.alive, false);
});

test('noTeleport alone is treated as continuous handoff for budget', () => {
  const state = makeState();
  const { bus } = bootConsumers(state);
  const api = makeBudgetApi(state);
  api.request(3, 'x');
  bus.emit('sector:exit', { sectorId: HELIOS, continuous: false, noTeleport: true });
  assert.equal(api.current(), 3, 'noTeleport alone must preserve budget');
});

// ── Adversarial: live automation drones mid-task across continuous membership ─────────────────

function bootAutomationOnly(state) {
  const bus = createBus();
  const helpers = {
    spawnEntity(spec) {
      const id = (state._nextId = (state._nextId || 2000) + 1);
      const e = {
        id,
        type: spec.type || 'drone',
        alive: true,
        pos: { ...(spec.pos || { x: 0, z: 0 }) },
        vel: { x: 0, z: 0 },
        rot: spec.rot || 0,
        angVel: 0,
        hull: spec.hull ?? 40,
        hullMax: spec.hullMax ?? 40,
        team: spec.team ?? 0,
        radius: spec.radius ?? 2,
        mass: spec.mass ?? 6,
        maxSpeed: spec.maxSpeed ?? 40,
        drag: spec.drag ?? 1.4,
        collides: spec.collides !== undefined ? spec.collides : false,
        data: { ...(spec.data || {}) },
      };
      state.entities.set(id, e);
      state.entityList.push(e);
      return e;
    },
    removeEntity(id) {
      const e = state.entities.get(id);
      if (e) e.alive = false;
    },
    getEntity(id) { return state.entities.get(id); },
    player() { return state.entities.get(state.playerId); },
  };
  state.entities.set(1, {
    id: 1, type: 'ship', alive: true, isPlayer: true,
    pos: { x: 0, z: 0 }, hull: 100, hullMax: 100, data: {},
  });
  state.entityList.push(state.entities.get(1));
  state.player = state.player || { credits: 50000, researchPoints: 0, stats: {}, droneTierCap: 3 };
  state.player.droneTierCap = state.player.droneTierCap || 3;
  state.player.cargo = state.player.cargo || {
    capVolume: 100, usedVolume: 0, items: {},
  };
  automation.init({ state, bus, helpers, registry: { get() { return null; } } });
  return { bus, helpers };
}

function seedMidTaskDrone(state, opts = {}) {
  const e1 = {
    id: 101, type: 'drone', alive: true, team: 0,
    pos: { x: 12, z: 8 }, vel: { x: 2, z: 1 }, rot: 0.4, angVel: 0,
    hull: 40, hullMax: 40, data: { kind: 'mining_drone', groupId: 'd_mid', targetAstId: null },
  };
  const e2 = {
    id: 102, type: 'drone', alive: true, team: 0,
    pos: { x: 14, z: 6 }, vel: { x: 1.5, z: 0.5 }, rot: 0.2, angVel: 0,
    hull: 40, hullMax: 40, data: { kind: 'mining_drone', groupId: 'd_mid', targetAstId: null },
  };
  state.entities.set(101, e1);
  state.entities.set(102, e2);
  state.entityList.push(e1, e2);
  const group = {
    id: 'd_mid',
    defId: 'drone_mk1',
    count: 2,
    tier: 1,
    sectorId: HELIOS,
    homeSectorId: HELIOS,
    fieldId: null,
    oreType: 'cmdty_ore_iron',
    originPos: { x: 12, z: 8 },
    buffer: 17.5,
    bufferCap: 60,
    fuel: 200,
    fuelMax: 240,
    durability: 40,
    durabilityMax: 40,
    autoReturn: false,
    status: 'program',
    ratePerMin: 0,
    entityIds: [101, 102],
    ownerId: 'player',
    program: { templateId: 'mine_to_depot' },
    // Mid MOVE-to-depot step after mining filled cargo latch — continuous cross must not soft-reset.
    programState: { pc: 1, waitT: 0, cargoWasFull: true },
    ...opts,
  };
  state.automation.drones = [group];
  return { group, e1, e2 };
}

test('adversarial: mid-task drone continuous crossing retains identity/task/route/progress/cargo', () => {
  const state = makeState();
  const { bus } = bootAutomationOnly(state);
  const { group, e1, e2 } = seedMidTaskDrone(state);
  const snap = {
    entityIds: group.entityIds.slice(),
    buffer: group.buffer,
    fuel: group.fuel,
    program: { ...group.program },
    programState: { ...group.programState },
    ownerId: group.ownerId,
    pos1: { x: e1.pos.x, z: e1.pos.z },
    pos2: { x: e2.pos.x, z: e2.pos.z },
  };

  // Membership handoff (world continuous path): exit soft + enter soft + bubble id change.
  bus.emit('sector:exit', { sectorId: HELIOS, continuous: true, noTeleport: true });
  state.world.currentSectorId = CERES;
  state.world.activeSector = { id: CERES };
  bus.emit('sector:enter', {
    sectorId: CERES, continuous: true, noTeleport: true, firstVisit: false,
  });

  // Regression for DEF soft-reset at former _updateDrones sectorId mismatch release path.
  automation.update(1 / 60, state);

  const g = state.automation.drones[0];
  assert.ok(g, 'drone group retained');
  assert.equal(g.id, 'd_mid', 'identity retained');
  assert.deepEqual(g.entityIds, snap.entityIds, 'live entity ids retained (no soft clear)');
  assert.equal(e1.alive, true, 'drone hull 1 remains alive');
  assert.equal(e2.alive, true, 'drone hull 2 remains alive');
  assert.equal(g.program.templateId, snap.program.templateId, 'task/template retained');
  // Soft-reset signature would be: entityIds wiped + hulls killed + program re-seeded at pc=0.
  // Natural MOVE completion may advance pc 1→2 in the same tick — that is progress, not reset.
  assert.ok(
    g.programState
      && (g.programState.pc === snap.programState.pc || g.programState.pc === snap.programState.pc + 1),
    'program route progress retained or advanced naturally (not soft-reset to 0)',
  );
  assert.equal(g.programState.cargoWasFull, true, 'cargo latch retained');
  assert.equal(g.buffer, snap.buffer, 'buffer/cargo progress retained');
  assert.equal(g.ownerId, snap.ownerId, 'ownership retained');
  assert.equal(g.sectorId, CERES, 'sector membership updated on continuous handoff');
  // No duplicate spawn wave after membership adopt.
  assert.equal(g.entityIds.length, 2, 'no duplicate spawn on continuous enter/update');
  assert.equal(state.entities.get(101).pos.x, snap.pos1.x, 'entity pose not rebuilt from spawn');
});

test('adversarial: hard sector exit tears down live mid-task drone entities', () => {
  const state = makeState();
  const { bus } = bootAutomationOnly(state);
  const { group, e1, e2 } = seedMidTaskDrone(state);

  bus.emit('sector:exit', { sectorId: HELIOS, continuous: false, noTeleport: false });

  assert.deepEqual(group.entityIds, [], 'hard exit clears drone entity ids');
  assert.equal(e1.alive, false, 'hard exit despawns live drone 1');
  assert.equal(e2.alive, false, 'hard exit despawns live drone 2');
  // Ledger group itself remains (recall/loss paths remove groups); only live hulls teardown.
  assert.equal(state.automation.drones[0].id, 'd_mid');
  assert.equal(state.automation.drones[0].program.templateId, 'mine_to_depot');
  assert.equal(state.automation.drones[0].buffer, 17.5, 'hard exit does not wipe abstract buffer ledger');
});

test('adversarial: continuous handoff does not re-spawn when live drones already present', () => {
  const state = makeState();
  const { bus, helpers } = bootAutomationOnly(state);
  const { group } = seedMidTaskDrone(state);
  let spawnCalls = 0;
  const realSpawn = helpers.spawnEntity;
  helpers.spawnEntity = (spec) => {
    spawnCalls++;
    return realSpawn(spec);
  };

  emitContinuousHandoff(bus, HELIOS, CERES);
  state.world.currentSectorId = CERES;
  automation.update(1 / 60, state);
  // Force the spawn gate the same way a re-enter would.
  automation._spawnDroneEntities(group, { durabilityMax: 40, deployRange: 350 });

  assert.equal(spawnCalls, 0, 'no spawnEntity while live drones exist');
  assert.deepEqual(group.entityIds, [101, 102]);
});
