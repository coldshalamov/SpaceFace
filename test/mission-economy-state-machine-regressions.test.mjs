import test from 'node:test';
import assert from 'node:assert/strict';

import { missions as missionsBase } from '../src/systems/missions.js';
import { MISSION_TUNING } from '../src/data/missions.js';

class Bus {
  constructor() {
    this.events = [];
  }

  on() {}

  emit(type, payload) {
    this.events.push({ type, payload });
  }
}

function stateWithActiveMissions(count) {
  return {
    meta: { seed: 'mission-regression-seed' },
    missions: {
      nextId: 1,
      active: Array.from({ length: count }, (_, index) => ({
        id: `m_${index + 1}`,
        status: 'active',
        type: 'escort',
        title: `Active mission ${index + 1}`,
        stationId: 'station_helios',
        destStationId: 'station_helios',
        params: {},
        objectiveProgress: 0,
        objectiveTarget: 1,
        targetEntityIds: [],
      })),
      boards: {},
      receipts: [],
      completedLog: [],
      config: { ...MISSION_TUNING, maxActive: 8 },
    },
    player: {
      credits: 1000,
      reputation: {},
      uniqueWrecks: { bearings: {} },
      cargo: { items: {}, capVolume: 100, usedVolume: 0, capMass: 100, usedMass: 0, richLots: [] },
    },
    playerId: 1,
    entities: new Map(),
    entityList: [],
    nav: { waypoint: null },
    ui: { trackedMissionId: null },
    story: {},
  };
}

test('mission failure replacement uses the retiring slot at max active capacity', () => {
  const state = stateWithActiveMissions(8);
  const bus = new Bus();
  const system = Object.create(missionsBase);
  system.state = state;
  system.bus = bus;
  system.trackMission = () => true;
  system._ensureMissionTargets = () => {};
  system._refreshNavigation = () => {};

  const failedMission = state.missions.active.at(-1);
  system._failMission(failedMission, state.missions.active.length - 1, 'escortee_lost');

  assert.equal(state.missions.active.length, state.missions.config.maxActive);
  assert.equal(state.missions.active.some((mission) => mission.id === failedMission.id), false);
  const successor = state.missions.active.find((mission) => mission.mutationTag === 'salvage');
  assert.ok(successor, 'failure should post and accept a salvage successor');
  assert.equal(successor.mutatedFromMissionId, failedMission.id);
  assert.equal(bus.events.filter(({ type }) => type === 'mission:accepted').length, 1);
});
