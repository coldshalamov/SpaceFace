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
