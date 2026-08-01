import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { MISSION_TUNING, SET_PIECE_MISSIONS } from '../src/data/missions.js';
import { SECTORS } from '../src/data/sectors.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { buildSetPieceMissionOffers } from '../src/systems/setPieceMissionOffers.js';
import { missions } from '../src/systems/missions.js';
import { uniqueWrecks } from '../src/systems/uniqueWrecks.js';

const AUDIT_STAGE_BUDGET_S = 1800;
const MODELED_CRUISE_SPEED = 150;
const MODELED_COMBAT_KILL_S = 12;
const MODELED_SCAN_S = 8;
const MODELED_DOCK_S = 10;
const MODELED_CHOICE_S = 2;
const MODELED_BOARD_APPROACH_S = 6;
const MODELED_CROSS_SECTOR_BOARD_APPROACH_S = 45;

const STATION_SECTOR_BY_ID = new Map();
for (const sector of SECTORS) {
  for (const station of sector.stations || []) STATION_SECTOR_BY_ID.set(station.id, sector.id);
}

const NATIVE_OBJECTIVE_EVENTS = new Set([
  'sector:enter',
  'scan:completed',
  'salvage:completed',
  'dock:docked',
  'entity:killed',
  'uniqueWreck:bearingFixed',
  'uniqueWreck:complicationTriggered',
  'uniqueWreck:decisionReady',
  'uniqueWreck:choose',
  'uniqueWreck:resolved',
]);

class AuditBus {
  constructor() {
    this.handlers = new Map();
    this.log = [];
  }

  on(name, fn) {
    const rows = this.handlers.get(name) || [];
    rows.push(fn);
    this.handlers.set(name, rows);
    return () => this.off(name, fn);
  }

  off(name, fn) {
    this.handlers.set(name, (this.handlers.get(name) || []).filter((entry) => entry !== fn));
  }

  emit(name, payload) {
    this.log.push({ name, payload });
    for (const fn of [...(this.handlers.get(name) || [])]) fn(payload);
  }
}

function createAuditState(seed) {
  const player = {
    id: 1,
    type: 'ship',
    team: 0,
    factionId: 'faction_free',
    isPlayer: true,
    alive: true,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    data: {},
  };
  return {
    meta: { seed, playtimeS: 0 },
    seed,
    tick: 0,
    simTime: 0,
    mode: 'flight',
    playerId: player.id,
    player: {
      credits: 500000,
      researchPoints: 0,
      flags: {},
      cargo: {
        items: {},
        capVolume: 500,
        capMass: 500,
        usedVolume: 0,
        usedMass: 0,
      },
      stats: {},
    },
    missions: {
      boards: {},
      active: [],
      completedLog: [],
      receipts: [],
      nextId: 1,
      config: JSON.parse(JSON.stringify(MISSION_TUNING)),
    },
    story: { beatIndex: 0, branch: null, flags: {}, chainProgress: 0 },
    factions: Object.fromEntries([
      'faction_scn',
      'faction_mts',
      'faction_dmc',
      'faction_free',
      'faction_reach',
      'faction_quiet',
      'faction_choir',
    ].map((id) => [id, { rep: 500 }])),
    world: { currentSectorId: 'sector_helios_prime', activeSector: { stations: [] } },
    entities: new Map([[player.id, player]]),
    entityList: [player],
    entityIndex: { byStationId: new Map(), stations: [] },
    ui: { docked: false, dockedStationId: null, trackedMissionId: null },
    nav: {},
    settings: { gameplay: { tutorialHints: false } },
  };
}

function createHelpers(state) {
  let nextEntityId = 1000;
  return {
    hash32,
    mulberry32,
    player: () => state.entities.get(state.playerId),
    voice: { say: () => true },
    spawnEntity(spec) {
      const entity = {
        id: nextEntityId++,
        alive: true,
        pos: { x: Number(spec.pos && spec.pos.x) || 0, z: Number(spec.pos && spec.pos.z) || 0 },
        vel: { x: Number(spec.vel && spec.vel.x) || 0, z: Number(spec.vel && spec.vel.z) || 0 },
        rot: Number(spec.rot) || 0,
        ...spec,
        data: { ...(spec.data || {}) },
      };
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
  };
}

function offersForChain(state, chainId, stageIndex = null) {
  return Object.values(state.missions.boards || {})
    .flatMap((board) => board && board.slots || [])
    .filter((offer) => offer && offer.source === 'setPieceMission'
      && offer.cause && offer.cause.chainId === chainId
      && (stageIndex == null || offer.cause.stageIndex === stageIndex));
}

function acceptedForFingerprint(state, fingerprint) {
  return state.missions.active.find((mission) => (
    mission && mission.cause && mission.cause.fingerprint === fingerprint
  )) || null;
}

function ensureStation(state, stationId, distance = 1000) {
  if (!stationId) return null;
  const existing = state.entityIndex.byStationId.get(stationId);
  if (existing) return existing;
  const station = {
    id: `audit_station_${stationId}`,
    type: 'station',
    alive: true,
    pos: { x: Math.max(300, Number(distance) || 1000), z: 0 },
    vel: { x: 0, z: 0 },
    data: { stationId, dockRadius: 80 },
  };
  state.entities.set(station.id, station);
  state.entityList.push(station);
  state.entityIndex.byStationId.set(stationId, station);
  state.entityIndex.stations.push(station);
  return station;
}

function advanceClock(state, missionSystem, seconds, perStep = null) {
  let remaining = Math.max(0, Number(seconds) || 0);
  while (remaining > 0) {
    const dt = Math.min(1, remaining);
    state.simTime += dt;
    state.meta.playtimeS += dt;
    state.tick += Math.max(1, Math.round(dt * 60));
    missionSystem.update(dt, state);
    if (perStep) perStep(dt);
    remaining -= dt;
  }
}

function travelToObjective(state, missionSystem, bus, mission) {
  const travelS = Math.max(4, Math.ceil((Number(mission.distance) || 0) / MODELED_CRUISE_SPEED));
  advanceClock(state, missionSystem, travelS);
  const changedSector = state.world.currentSectorId !== mission.destSectorId;
  state.world.currentSectorId = mission.destSectorId;
  if (changedSector) bus.emit('sector:enter', { sectorId: mission.destSectorId, continuous: true });
  return travelS;
}

function approachMissionBoard(state, missionSystem, bus, offer) {
  const sectorId = STATION_SECTOR_BY_ID.get(offer.stationId);
  assert.ok(sectorId, `${offer.stationId}: authored board belongs to a real sector`);
  const changedSector = state.world.currentSectorId !== sectorId;
  const elapsedS = changedSector
    ? MODELED_CROSS_SECTOR_BOARD_APPROACH_S : MODELED_BOARD_APPROACH_S;
  advanceClock(state, missionSystem, elapsedS);
  state.world.currentSectorId = sectorId;
  if (changedSector) bus.emit('sector:enter', { sectorId, continuous: true });
  ensureStation(state, offer.stationId, 600);
  bus.emit('dock:docked', { stationId: offer.stationId });
  return elapsedS;
}

function countDriverSettlementShortcuts() {
  const source = readFileSync(new URL(import.meta.url), 'utf8');
  const forbiddenCalls = [
    '_completeMission',
    '_failMission',
    '_expireMission',
    '_recordMissionReceipt',
    'advanceSetPieceMission',
    'settleActiveStage',
  ];
  return forbiddenCalls.reduce((count, name) => {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return count + (source.match(new RegExp(`${escaped}\\s*\\(`, 'g')) || []).length;
  }, 0);
}

function driveEscort(state, missionSystem, bus, mission) {
  const station = ensureStation(state, mission.destStationId, mission.distance);
  if (state.world.currentSectorId !== mission.destSectorId) {
    state.world.currentSectorId = mission.destSectorId;
    bus.emit('sector:enter', { sectorId: mission.destSectorId, continuous: true });
  }
  const escort = state.entities.get(mission._escorteeId);
  assert.ok(escort && escort.alive, 'escort stage spawns a live mission-tagged ship');
  let elapsed = 0;
  while (!mission._escorteeArrived && elapsed < AUDIT_STAGE_BUDGET_S) {
    advanceClock(state, missionSystem, 1, () => {
      const dx = station.pos.x - escort.pos.x;
      const dz = station.pos.z - escort.pos.z;
      const distance = Math.hypot(dx, dz);
      if (distance <= 1) return;
      const step = Math.min(180, distance);
      escort.pos.x += dx / distance * step;
      escort.pos.z += dz / distance * step;
    });
    elapsed += 1;
  }
  assert.equal(mission._escorteeArrived, true, 'escort reaches the real destination dock ring');
  advanceClock(state, missionSystem, MODELED_DOCK_S);
  bus.emit('dock:docked', { stationId: mission.destStationId });
  return elapsed + MODELED_DOCK_S;
}

function driveLongRead(state, missionSystem, bus, mission) {
  const objective = mission.params && mission.params.setPieceObjective;
  const wreckId = mission.params && mission.params.wreckId;
  const record = state.player.uniqueWrecks && state.player.uniqueWrecks.bearings[wreckId];
  assert.ok(record, `${objective}: native rumor carrier created a durable bearing`);
  if (objective === 'long_read_rumor_survey') {
    const elapsed = travelToObjective(state, missionSystem, bus, mission) + MODELED_SCAN_S * 2;
    advanceClock(state, missionSystem, MODELED_SCAN_S * 2);
    record.phase = 'fixed';
    record.fixedAtS = state.simTime;
    bus.emit('uniqueWreck:bearingFixed', { wreckId, sectorId: mission.destSectorId, phase: 'fixed' });
    return elapsed;
  }
  if (objective === 'long_read_salvage') {
    const elapsed = travelToObjective(state, missionSystem, bus, mission) + 18;
    advanceClock(state, missionSystem, 18);
    bus.emit('uniqueWreck:complicationTriggered', { wreckId, kind: 'duration_audit_complication' });
    record.phase = 'decision';
    record.decisionReadyAtS = state.simTime;
    bus.emit('uniqueWreck:decisionReady', { wreckId, sectorId: mission.destSectorId, phase: 'decision' });
    return elapsed;
  }
  assert.fail(`unexpected active Long Read objective ${objective}`);
}

function driveOrdinaryObjective(state, missionSystem, bus, mission) {
  if (mission.params && String(mission.params.setPieceObjective || '').startsWith('long_read_')) {
    return driveLongRead(state, missionSystem, bus, mission);
  }

  let elapsed = travelToObjective(state, missionSystem, bus, mission);
  if (mission.type === 'recon_scan') {
    const count = Math.max(1, Number(mission.objectiveTarget) || 1);
    for (let index = 0; index < count; index += 1) {
      advanceClock(state, missionSystem, MODELED_SCAN_S);
      elapsed += MODELED_SCAN_S;
      bus.emit('scan:completed', { targetId: null, auditIndex: index });
    }
    return elapsed;
  }
  if (mission.type === 'patrol_clear') {
    assert.equal(mission.targetEntityIds.length, mission.objectiveTarget,
      'patrol stage spawns the exact tagged siege screen');
    for (const id of [...mission.targetEntityIds]) {
      advanceClock(state, missionSystem, MODELED_COMBAT_KILL_S);
      elapsed += MODELED_COMBAT_KILL_S;
      const target = state.entities.get(id);
      if (target) target.alive = false;
      bus.emit('entity:killed', { id, killerId: state.playerId });
    }
    return elapsed;
  }
  if (mission.params && mission.params.setPieceObjective === 'investigation_recover_box') {
    advanceClock(state, missionSystem, 30);
    elapsed += 30;
    const wreck = {
      id: `duration_audit_wreck_${mission.cause.fingerprint}`,
      type: 'wreck',
      alive: true,
      pos: { x: 600, z: 0 },
      vel: { x: 0, z: 0 },
      data: { salvagePool: { cmdty_salvage_electronics: 1 } },
    };
    state.entities.set(wreck.id, wreck);
    state.entityList.push(wreck);
    bus.emit('salvage:completed', {
      wreckId: wreck.id,
      loot: { cmdty_salvage_electronics: 1 },
      source: 'modeled-native-wreck-salvage',
    });
    return elapsed;
  }
  if (mission.type === 'escort') return driveEscort(state, missionSystem, bus, mission);
  if (['cargo_delivery', 'passenger_transport', 'salvage_retrieval', 'smuggling_run'].includes(mission.type)) {
    ensureStation(state, mission.destStationId, mission.distance);
    advanceClock(state, missionSystem, MODELED_DOCK_S);
    elapsed += MODELED_DOCK_S;
    bus.emit('dock:docked', { stationId: mission.destStationId });
    return elapsed;
  }
  assert.fail(`duration audit has no native driver for ${mission.type}`);
}

function selectedOffer(offers, branchId) {
  if (offers.length === 1) return offers[0];
  const selected = offers.find((offer) => offer.cause && offer.cause.branchId === branchId);
  assert.ok(selected, `authored branch ${branchId} is posted on the normal board`);
  return selected;
}

async function auditRoute(archetypeId, branchId, seed, startEpoch) {
  const state = createAuditState(seed);
  const bus = new AuditBus();
  const helpers = createHelpers(state);
  const registry = { get: () => null };
  const wreckSystem = { ...uniqueWrecks };
  wreckSystem.init({ state, bus, helpers, registry });
  const missionSystem = { ...missions };
  missionSystem.init({ state, bus, helpers, registry });

  const opening = buildSetPieceMissionOffers(state, {
    archetypeId,
    startEpoch,
    stageIndex: 0,
    branchId: null,
    attempt: 0,
  })[0];
  assert.ok(opening, `${archetypeId}: opening compiles`);
  const chainId = opening.cause.chainId;
  bus.emit('mission:offered', JSON.parse(JSON.stringify(opening)));

  const definition = SET_PIECE_MISSIONS.find((entry) => entry.id === archetypeId);
  const branch = definition.branches.find((entry) => entry.id === branchId);
  const expectedStageCount = definition.commonStages.length + branch.stages.length;
  const stageRows = [];
  let branchChoiceCount = 0;

  for (let stageIndex = 0; stageIndex < expectedStageCount; stageIndex += 1) {
    const offers = offersForChain(state, chainId, stageIndex);
    assert.ok(offers.length === 1 || offers.length === 2,
      `${archetypeId}/${branchId}/stage-${stageIndex}: normal board has one stage or two branch siblings`);
    if (offers.length === 2) branchChoiceCount += 1;
    const offer = selectedOffer(offers, branchId);
    const stageStartS = state.simTime;
    const eventStart = bus.log.length;
    const boardApproachS = approachMissionBoard(state, missionSystem, bus, offer);
    assert.ok(offersForChain(state, chainId, stageIndex).some((candidate) => candidate.id === offer.id),
      `${archetypeId}/${branchId}/${offer.cause.stageId}: board approach keeps the posting reachable`);
    advanceClock(state, missionSystem, MODELED_CHOICE_S);
    const acceptEventStart = bus.log.length;
    bus.emit('ui:acceptMission', { missionId: offer.id });
    const objectiveStartS = state.simTime;
    const boardAccepted = bus.log.slice(acceptEventStart).some((entry) => (
      entry.name === 'mission:accepted'
      && entry.payload && entry.payload.causeFingerprint === offer.cause.fingerprint
    ));

    const active = acceptedForFingerprint(state, offer.cause.fingerprint);
    const authoredDeadlineS = Number(offer.duration_s);
    const deadlineS = Number.isFinite(authoredDeadlineS) && authoredDeadlineS > 0
      ? authoredDeadlineS : AUDIT_STAGE_BUDGET_S;
    const deadlineSource = Number.isFinite(authoredDeadlineS) && authoredDeadlineS > 0
      ? 'authored' : 'audit-budget';
    if (active) driveOrdinaryObjective(state, missionSystem, bus, active);

    assert.equal(acceptedForFingerprint(state, offer.cause.fingerprint), null,
      `${archetypeId}/${branchId}/${offer.cause.stageId}: native objective events settle the active row`);
    const receipt = state.missions.receipts.find((row) => (
      row && row.chainId === chainId && row.stageIndex === stageIndex && row.outcome === 'completed'
    ));
    assert.ok(receipt, `${archetypeId}/${branchId}/${offer.cause.stageId}: canonical completion receipt`);
    const elapsedS = Math.round((state.simTime - stageStartS) * 1000) / 1000;
    const objectiveElapsedS = Math.round((state.simTime - objectiveStartS) * 1000) / 1000;
    stageRows.push({
      stageIndex,
      stageId: offer.cause.stageId,
      branchId: offer.cause.branchId || null,
      elapsedS,
      objectiveElapsedS,
      deadlineS,
      deadlineSource,
      distanceU: Math.max(0, Number(offer.distance) || 0),
      boardStationId: offer.stationId,
      boardApproachS,
      boardAccepted,
      nativeEvents: [...new Set(bus.log.slice(eventStart)
        .map((entry) => entry.name)
        .filter((name) => NATIVE_OBJECTIVE_EVENTS.has(name)))],
    });
  }

  const terminalStageIndex = expectedStageCount - 1;
  const terminalReceiptCount = state.missions.receipts.filter((row) => (
    row && row.chainId === chainId && row.stageIndex === terminalStageIndex && row.outcome === 'completed'
  )).length;
  const nativeEvents = [...new Set(bus.log.map((entry) => entry.name)
    .filter((name) => NATIVE_OBJECTIVE_EVENTS.has(name)))];
  return {
    archetypeId,
    branchId,
    chainId,
    status: offersForChain(state, chainId).length === 0 && state.missions.active.length === 0
      ? 'completed' : 'unresolved',
    elapsedS: Math.round(state.simTime * 1000) / 1000,
    deadlineBreaches: stageRows.filter((stage) => stage.objectiveElapsedS > stage.deadlineS).length,
    branchChoiceCount,
    terminalReceiptCount,
    travelLineCount: bus.log.filter((entry) => entry.name === 'mission:setPieceTravelLine').length,
    combatKillCount: bus.log.filter((entry) => entry.name === 'entity:killed'
      && entry.payload && entry.payload.killerId === state.playerId).length,
    modeledDistanceU: stageRows.reduce((sum, stage) => sum + stage.distanceU, 0),
    sectorTransitions: bus.log.filter((entry) => entry.name === 'sector:enter').length,
    nativeEvents,
    stageRows,
  };
}

export async function runSp1NativeDurationAudit() {
  const driverShortcutCount = countDriverSettlementShortcuts();
  const routes = [];
  let ordinal = 0;
  for (const definition of SET_PIECE_MISSIONS) {
    for (const branch of definition.branches) {
      routes.push(await auditRoute(definition.id, branch.id, 4700 + ordinal, 40 + ordinal));
      ordinal += 1;
    }
  }
  return {
    schemaVersion: 1,
    claim: 'native-objective-event audit; modeled travel/action time, not a human playtime claim',
    driverShortcutCount,
    routes,
  };
}

async function main() {
  const report = await runSp1NativeDurationAudit();
  const authoredRouteCount = SET_PIECE_MISSIONS.reduce((sum, definition) => (
    sum + (definition.branches || []).length
  ), 0);
  assert.equal(report.driverShortcutCount, 0, 'duration driver must not call settlement helpers directly');
  assert.equal(report.routes.length, authoredRouteCount, 'duration audit must cover every authored branch');
  for (const route of report.routes) {
    assert.equal(route.status, 'completed');
    assert.equal(route.deadlineBreaches, 0);
    assert.equal(route.branchChoiceCount, 1);
    assert.equal(route.terminalReceiptCount, 1);
    console.log(`ok   ${route.archetypeId}/${route.branchId} ${route.elapsedS}s ${route.stageRows.length} stages`);
  }
  console.log(`PASS SP1 native duration audit (${report.routes.length}/${authoredRouteCount} routes)`);
  console.log(report.claim);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.error(error && error.stack || error);
    process.exitCode = 1;
  });
}
