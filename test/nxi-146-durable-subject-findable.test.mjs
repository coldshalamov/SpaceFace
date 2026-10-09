// NXI-146 — a mission subject demoted to a durable record stays findable: leaving and returning
// re-adopts the rematerialized body by its durable identity, so the active objective is never
// stranded on a recycled runtime entity id — and no live entity id is ever serialized.
import test from 'node:test';
import assert from 'node:assert/strict';

import * as missionData from '../src/data/missions.js';
import { missions } from '../src/systems/missions.js';

class Bus {
  constructor() { this.handlers = new Map(); this.log = []; }
  on(name, fn) { const rows = this.handlers.get(name) || []; rows.push(fn); this.handlers.set(name, rows); }
  emit(name, payload) {
    this.log.push({ name, payload });
    for (const fn of [...(this.handlers.get(name) || [])]) fn(payload);
  }
  of(name) { return this.log.filter((e) => e.name === name).map((e) => e.payload); }
}

function baseState({ seed = 146 } = {}) {
  return {
    meta: { seed, playtimeS: 0 },
    seed,
    tick: 0,
    simTime: 100,
    mode: 'flight',
    playerId: 1,
    player: {
      credits: 500000,
      researchPoints: 0,
      cargo: { items: {}, capVolume: 500, capMass: 500, usedVolume: 0, usedMass: 0 },
      stats: {},
    },
    missions: {
      boards: {},
      active: [],
      completedLog: [],
      receipts: [],
      nextId: 1,
      config: JSON.parse(JSON.stringify(missionData.MISSION_TUNING)),
    },
    story: { beatIndex: 2, branch: null, flags: {}, chainProgress: 0 },
    factions: { faction_scn: { rep: 500 } },
    world: { currentSectorId: 'sector_forge', activeSector: { stations: [] } },
    economy: { markets: {} },
    entities: new Map(),
    entityList: [],
    ui: { docked: false, dockedStationId: null, trackedMissionId: null },
    nav: {},
    settings: { gameplay: { tutorialHints: false } },
  };
}

function boot(state) {
  const bus = new Bus();
  const sys = { ...missions };
  sys.init({ state, bus, helpers: { voice: { say: () => true } }, registry: { get: () => null } });
  return { bus, sys };
}

const RECORD_ID = 'wr_test:m910:mission-target:mission:m910:0';

function writMission() {
  return {
    id: 'm910',
    type: 'bounty_hunt',
    status: 'active',
    needsTargets: true,
    title: 'Writ: Vex Marrow',
    factionId: 'faction_scn',
    stationId: 'station_helios',
    destStationId: 'station_forge',
    destSectorId: 'sector_forge',
    reward_cr: 800,
    collateral_cr: 0,
    objectiveProgress: 0,
    objectiveTarget: 1,
    targetEntityIds: [],
    params: { clearCount: 1, killCount: 0, targetStrength: 1.5 },
    storyTag: null,
    storyTarget: null,
    source: null,
    cause: null,
  };
}

function demotedSubject(id) {
  return {
    id,
    type: 'ship',
    alive: true,
    pos: { x: 120, z: -40 },
    data: {
      missionId: 'm910',
      missionTag: 'm910',
      missionTargetSlot: 0,
      worldRecordId: RECORD_ID,
      identityKey: 'mission:m910:0',
      ai: { name: 'Vex Marrow' },
    },
  };
}

test('NXI-146: leaving and returning re-finds the durable subject at a recycled runtime id', () => {
  const state = baseState();
  const { sys } = boot(state);
  const m = writMission();
  state.missions.active.push(m);

  // Live subject before the leave: the mission owns one stamped target, id 77.
  const live = demotedSubject(77);
  state.entities.set(77, live);
  state.entityList.push(live);
  m.targetEntityIds = [77];

  // Hard leave: the mission-owned body is demoted and the live id reference is dropped.
  sys._onSectorExit({ sectorId: 'sector_forge' });
  assert.equal(live.alive, false, 'the owned body is demoted on the hard leave');
  assert.deepEqual(m.targetEntityIds, [], 'no live id rides out the sector');

  // While away, the runtime id space recycles: 77 re-spawns as an UNRELATED body, and the
  // durable record rematerializes at id 88 (world re-stamps missionId/missionTag from the record).
  const recycled = { id: 77, type: 'ship', alive: true, pos: { x: -300, z: 220 }, data: { defId: 'ship_kestrel' } };
  const rematerialized = demotedSubject(88);
  state.entities.set(77, recycled);
  state.entityList.push(recycled);
  state.entities.set(88, rematerialized);
  state.entityList.push(rematerialized);

  // Return route: sector:enter → spawnTargetsForSector adopts by durable identity, never by id.
  sys.spawnTargetsForSector('sector_forge');

  assert.equal(m.status, 'active', 'the objective survives the round trip');
  assert.deepEqual(m.targetEntityIds, [88], 'the objective re-finds the subject at its new runtime id');
  assert.equal(m.targetEntityIds.includes(77), false, 'the recycled id is not adopted');
  assert.equal(rematerialized.alive, true, 'the durable subject stays alive');
  assert.equal(rematerialized.data.missionId, 'm910', 'durable identity restamped on the new body');
  assert.equal(recycled.alive, true, 'the unrelated recycled body is untouched by the mission');

  // The objective projection resolves through the found subject, not the stale/recycled id.
  const wp = sys._missionWaypoint(m);
  assert.ok(wp, 'the active objective still projects a marker');
  assert.equal(wp.targetEntityId, 88, 'the marker names the found subject');
  assert.deepEqual(wp.pos, { x: 120, z: -40 }, 'the marker sits on the rematerialized body');
});

test('NXI-146 guardrail: the save carries no live target ids', () => {
  const state = baseState();
  const { sys } = boot(state);
  const m = writMission();
  m.targetEntityIds = [88];
  m._escorteeId = 88;
  state.missions.active.push(m);
  const body = demotedSubject(88);
  state.entities.set(88, body);
  state.entityList.push(body);

  const snap = sys.serialize();
  assert.deepEqual(snap.active[0].targetEntityIds, [], 'live entity ids are not serialized');
  assert.equal('_escorteeId' in snap.active[0], false, 'transient escort links are not serialized');
  assert.equal(JSON.stringify(snap).includes('[88]'), false, 'no runtime id leaks into the save payload');
});
