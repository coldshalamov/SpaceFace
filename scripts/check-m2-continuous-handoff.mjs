#!/usr/bin/env node
// M2-C1 continuous handoff acceptance (synthetic, deterministic).
//
// Proves free-flight sector:exit { continuous:true | noTeleport:true } is a membership handoff:
//   - spawnBudget ledger preserved
//   - encounterDirector live/pending/active preserved across exit+enter (not exit alone)
//   - continuous sector:enter does not reseed pressure / wipe pending after soft exit
//   - ambushSignatures tells + gateControl scene preserved on continuous handoff
//   - escort missions not failed on dest leave
//   - automation drone entityIds preserved
//   - traffic freighters preserved (no forced cleanup)
//   - wingmen live ids preserved
// Hard (non-continuous) exit still tears down. Dead sector:leave is not used.
//
// Run: node scripts/check-m2-continuous-handoff.mjs
// Also: node --test test/m2-continuous-handoff*.test.mjs

import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { createBus } from '../src/core/eventBus.js';
import { spawnBudget, makeBudgetApi } from '../src/systems/spawnBudget.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { ambushSignatures } from '../src/systems/ambushSignatures.js';
import { gateControlDirector } from '../src/systems/gateControlDirector.js';
import { missions } from '../src/systems/missions.js';
import { traffic } from '../src/systems/traffic.js';
import { wingmen } from '../src/systems/wingmen.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const HELIOS = 'sector_helios_prime';
const CERES = 'sector_ceres_belt';

function section(name) {
  console.log(`  · ${name}`);
}

section('static: consumers use sector:exit + continuous branch');
const CONSUMERS = [
  'src/systems/spawnBudget.js',
  'src/systems/encounterDirector.js',
  'src/systems/missions.js',
  'src/systems/automation.js',
  'src/systems/traffic.js',
  'src/systems/wingmen.js',
  'src/systems/ambushSignatures.js',
  'src/systems/gateControlDirector.js',
];
for (const rel of CONSUMERS) {
  assert.ok(existsSync(join(ROOT, rel)), `${rel} must exist`);
  const src = read(rel);
  assert.match(src, /sector:exit/, `${rel} must reference sector:exit`);
  assert.doesNotMatch(src, /bus\.on\(\s*['"]sector:leave['"]/, `${rel} must not bus.on sector:leave`);
  assert.match(src, /continuous/, `${rel} must branch on continuous`);
}
{
  const director = read('src/systems/encounterDirector.js');
  assert.match(director, /sector:enter/, 'encounterDirector must reference sector:enter');
  assert.match(
    director,
    /_onSectorEnter[\s\S]*continuous[\s\S]*noTeleport[\s\S]*return/,
    'encounterDirector continuous enter must early-return so soft-exit state is not reseeds',
  );
}

function makeState(seed = 11) {
  return {
    mode: 'flight',
    simTime: 50,
    meta: { seed },
    playerId: 1,
    entities: new Map(),
    entityList: [],
    entityIndex: { dockStations: [], stations: [], byStationId: new Map() },
    world: { currentSectorId: HELIOS, activeSector: { id: HELIOS } },
    missions: { active: [], boards: {}, completed: [], failed: [], completedLog: [], receipts: [] },
    player: { credits: 0, researchPoints: 0, stats: {} },
    automation: {
      drones: [{ id: 'd1', entityIds: [301, 302] }],
      fleet: [{ id: 'f1', shipDefId: 'ship_wasp', order: 'escort', hp: 1, hullPct: 1, status: 'escort', _liveId: 401 }],
      traders: [],
      outposts: [],
    },
    traffic: { freighters: [], rngSeed: seed },
    spawnBudget: null,
    encounterDirector: null,
    _nextId: 900,
  };
}

function liveEnc(id) {
  return {
    id, shapeId: 'patrol_sweep', shape: { pressureCost: 10 }, deck: 'combat',
    script: null, phase: 'active', sectorId: HELIOS, squadId: 's1', tier: 1, zoneId: null, ids: [],
  };
}

function boot(state) {
  const bus = createBus();
  const helpers = {
    spawnEntity(spec) {
      const id = ++state._nextId;
      const e = {
        id, type: 'ship', alive: true,
        pos: { ...(spec.pos || { x: 0, z: 0 }) },
        hull: 100, hullMax: 100,
        team: spec.team ?? 2,
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
  };
  const player = {
    id: 1, type: 'ship', alive: true, isPlayer: true,
    pos: { x: 0, z: 0 }, hull: 100, hullMax: 100, data: {},
  };
  state.entities.set(1, player);
  state.entityList.push(player);

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

  return { bus, helpers };
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

section('behavioral: continuous exit+enter preserves living state');
{
  const state = makeState();
  const { bus, helpers } = boot(state);
  const api = makeBudgetApi(state);
  api.request(5, 'live_fight');

  const dir = state.encounterDirector;
  dir.live = { L1: liveEnc('L1') };
  dir.pending = [{ shapeId: 'patrol_sweep' }];
  dir.active = { s1: { ids: [1], sectorId: HELIOS } };
  dir.plannedKey = 'k1';
  dir.pressure = { combat: 77, civilian: 44 };
  dir.window = [{ t: 20, tier: 'minor' }];
  dir.lastMeaningfulAt = 12;
  const pressureBefore = { ...dir.pressure };

  state.entities.set(55, { id: 55, type: 'ship', alive: true, pos: { x: 1, z: 1 }, data: {} });
  const escort = {
    id: 'esc1', type: 'escort', title: 'Escort', status: 'active', destSectorId: HELIOS,
    stationId: 'station_helios', factionId: null, reward_cr: 50, collateral_cr: 0,
    needsTargets: true, targetEntityIds: [55], _escorteeId: 55,
    objectiveProgress: 0, objectiveTarget: 1,
  };
  state.missions.active = [escort];

  const freighter = helpers.spawnEntity({ team: 2, pos: { x: 40, z: 0 }, data: { trafficRole: 'hauler' } });
  traffic._active = [freighter.id];
  state.traffic.freighters = [{ id: freighter.id, role: 'hauler', targetId: null, waitT: 0, nextTradeT: 3, orbitPhase: 0 }];

  const wing = {
    id: 401, type: 'ship', alive: true, team: 0,
    pos: { x: 5, z: 5 }, hull: 100, hullMax: 100, data: { isWingman: true },
  };
  state.entities.set(401, wing);
  state.entityList.push(wing);
  state.automation.fleet[0]._liveId = 401;

  state.ambushSignatures = {
    schemaVersion: 1,
    tells: { 'ambushTell:e1': { id: 'ambushTell:e1', encounterId: 'e1', active: true, pos: { x: 1, z: 2 } } },
    lastScan: null,
  };
  state.gateControl = {
    accum: 0,
    scene: { key: 'h>c', type: 'scan', wingId: 'gw1', entityIds: [9], sectorId: HELIOS, expiresAt: 999 },
    lastSceneAt: { 'h>c': 10 },
  };

  emitContinuousHandoff(bus, HELIOS, CERES);

  assert.equal(api.current(), 5, 'budget preserved on continuous exit+enter');
  assert.equal(Object.keys(dir.live).length, 1, 'live encounters preserved across exit+enter');
  assert.equal(dir.pending.length, 1, 'pending preserved across exit+enter');
  assert.equal(Object.keys(dir.active).length, 1, 'active ledger preserved across exit+enter');
  assert.equal(dir.plannedKey, 'k1', 'continuous enter must not replan');
  assert.deepEqual(dir.pressure, pressureBefore, 'continuous enter must not reseed pressure');
  assert.equal(dir.window.length, 1, 'continuous enter must not clear pacing window');
  assert.equal(dir.lastMeaningfulAt, 12, 'continuous enter must not reset spacing clocks');
  assert.equal(escort.status, 'active', 'escort not failed on continuous dest leave');
  assert.equal(escort._escorteeId, 55);
  assert.deepEqual(state.automation.drones[0].entityIds, [301, 302]);
  assert.equal(state.traffic.freighters.length, 1);
  assert.equal(freighter.alive, true);
  assert.equal(state.automation.fleet[0]._liveId, 401);
  assert.equal(wing.alive, true);
  assert.ok(state.ambushSignatures.tells['ambushTell:e1'], 'ambush tells preserved on continuous handoff');
  assert.ok(state.gateControl.scene, 'gate scene preserved on continuous handoff');
  assert.equal(state.gateControl.scene.wingId, 'gw1');
}

section('behavioral: hard exit tears down');
{
  const state = makeState();
  const { bus, helpers } = boot(state);
  const api = makeBudgetApi(state);
  api.request(3, 'x');

  const dir = state.encounterDirector;
  dir.live = { L1: liveEnc('L1') };
  dir.pending = [1];
  dir.active = { s1: { ids: [] } };
  dir.plannedKey = 'k';

  state.entities.set(55, { id: 55, type: 'ship', alive: true, pos: { x: 0, z: 0 }, data: {} });
  const escort = {
    id: 'esc1', type: 'escort', title: 'Escort', status: 'active', destSectorId: HELIOS,
    stationId: 'station_helios', factionId: null, reward_cr: 50, collateral_cr: 0,
    needsTargets: true, targetEntityIds: [55], _escorteeId: 55,
    objectiveProgress: 0, objectiveTarget: 1,
  };
  state.missions.active = [escort];

  const freighter = helpers.spawnEntity({ team: 2, pos: { x: 1, z: 1 }, data: {} });
  traffic._active = [freighter.id];
  state.traffic.freighters = [{ id: freighter.id, role: 'hauler', targetId: null, waitT: 0, nextTradeT: 1, orbitPhase: 0 }];

  const wing = {
    id: 401, type: 'ship', alive: true, team: 0,
    pos: { x: 0, z: 0 }, hull: 100, hullMax: 100, data: { isWingman: true },
  };
  state.entities.set(401, wing);
  state.entityList.push(wing);
  state.automation.fleet[0]._liveId = 401;

  state.ambushSignatures = {
    schemaVersion: 1,
    tells: { t1: { id: 't1', active: true } },
    lastScan: { tellId: 't1' },
  };
  state.gateControl = {
    accum: 0,
    scene: { key: 'x', type: 'toll', wingId: null, entityIds: [], sectorId: HELIOS, expiresAt: 1 },
    lastSceneAt: {},
  };

  bus.emit('sector:exit', { sectorId: HELIOS, continuous: false, noTeleport: false });

  assert.equal(api.current(), 0, 'budget reset on hard exit');
  assert.equal(Object.keys(dir.live).length, 0);
  assert.equal(dir.pending.length, 0);
  assert.equal(Object.keys(dir.active).length, 0);
  assert.equal(dir.plannedKey, null);
  assert.notEqual(escort.status, 'active', 'hard dest leave fails escort');
  assert.deepEqual(state.automation.drones[0].entityIds, []);
  assert.equal(state.traffic.freighters.length, 0);
  assert.equal(freighter.alive, false);
  assert.equal(state.automation.fleet[0]._liveId, null);
  assert.equal(wing.alive, false);
  assert.deepEqual(state.ambushSignatures.tells, {}, 'hard exit wipes ambush tells');
  assert.equal(state.gateControl.scene, null, 'hard exit clears gate scene');
}

section('behavioral: hard exit+enter reseeds director pressure');
{
  const state = makeState();
  const { bus } = boot(state);
  const dir = state.encounterDirector;
  dir.pressure = { combat: 99, civilian: 99 };
  dir.window = [{ t: 1, tier: 'major' }];
  dir.lastMeaningfulAt = 1;
  dir.pending = [{ shapeId: 'patrol_sweep' }];
  dir.plannedKey = 'stale';

  bus.emit('sector:exit', { sectorId: HELIOS, continuous: false, noTeleport: false });
  bus.emit('sector:enter', { sectorId: CERES, continuous: false, noTeleport: false, firstVisit: true });

  assert.notDeepEqual(dir.pressure, { combat: 99, civilian: 99 }, 'hard enter reseeds pressure');
  assert.equal(dir.window.length, 0, 'hard enter clears pacing window');
  assert.equal(dir.lastMeaningfulAt, state.simTime, 'hard enter resets meaningful clock');
}

section('node:test test/m2-continuous-handoff*.test.mjs');
{
  const r = spawnSync(process.execPath, ['--test', 'test/m2-continuous-handoff.test.mjs'], {
    cwd: ROOT,
    encoding: 'utf8',
    env: process.env,
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  assert.equal(r.status, 0, 'm2-continuous-handoff unit tests must pass');
}

console.log('M2 continuous handoff OK — continuous exit+enter preserves living systems (incl. director pressure/pending, ambush, gate); hard exit tears down; no sector:leave.');
