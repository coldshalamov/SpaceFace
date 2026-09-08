// PQ-152.00 — tow_recovery, demolition, rescue_under_fire appear on route
// boards and each completes by two physical methods. Seed 15200.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import {
  MISSION_TYPES,
  OFFER_MIX,
  PHYSICAL_MISSION_TYPES,
} from '../src/data/missions.js';
import { SECTORS } from '../src/data/sectors.js';
import { missions } from '../src/systems/missions.js';

const SEED = 15200;
const TYPES = PHYSICAL_MISSION_TYPES;
const METHODS = Object.freeze({
  tow_recovery: Object.freeze(['tow_in', 'sling_in']),
  demolition: Object.freeze(['wrecking_ball', 'cut_down']),
  rescue_under_fire: Object.freeze(['stage_tow', 'corridor_pull']),
});

const ROUTE_STATIONS = Object.freeze([
  'station_helios',
  'station_beltout',
  'station_forge',
  'station_veil',
  'station_smuggler',
  'station_coalition',
]);

function stationInfo(id) {
  for (const sector of SECTORS) {
    const station = (sector.stations || []).find((row) => row.id === id);
    if (station) return { ...station, sectorId: sector.id };
  }
  return null;
}

function boot(seed = SEED) {
  const sim = createSimulation({ seed, systems: [missions], updateOrder: [] });
  const { state } = sim;
  state.mode = 'flight';
  state.player.credits = 250000;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, hull: 200, hullMax: 200, radius: 8,
  });
  state.playerId = player.id;
  const completed = [];
  sim.bus.on('mission:completed', (p) => completed.push(p));
  return {
    sim,
    state,
    player,
    completed,
    missionsSys: sim.registry.get('missions'),
  };
}

function scanBoards(seed = SEED) {
  const found = new Map(TYPES.map((type) => [type, []]));
  for (const stationId of ROUTE_STATIONS) {
    for (let epoch = 0; epoch < 12; epoch += 1) {
      const h = boot(seed);
      h.state.simTime = epoch * 600;
      const board = h.missionsSys.ensureBoard(stationId);
      h.sim.dispose();
      if (!board || !Array.isArray(board.slots)) continue;
      for (const offer of board.slots) {
        if (offer && found.has(offer.type)) {
          found.get(offer.type).push({
            stationId,
            epoch,
            title: offer.title,
            brief: offer.brief,
            offerId: offer.id,
          });
        }
      }
    }
  }
  return found;
}

function forceOffer(h, type, destStationId) {
  const dest = stationInfo(destStationId);
  const origin = stationInfo('station_helios');
  assert.ok(dest && origin, 'route stations must exist');
  h.state.world.currentSectorId = dest.sectorId;
  const offer = h.missionsSys._rollOffer(type, {
    id: origin.id,
    name: origin.name,
    type: origin.type,
    size: origin.size || 'L',
    factionId: origin.factionId,
    sectorId: origin.sectorId,
  }, () => 0.25, 0, 0, { attachConditions: false });
  assert.ok(offer, `${type} must roll`);
  offer.destStationId = dest.id;
  offer.destSectorId = dest.sectorId;
  offer.collateral_cr = 0;
  const board = h.state.missions.boards[origin.id] || (h.state.missions.boards[origin.id] = {
    refreshEpoch: 0, slots: [],
  });
  board.slots.push(offer);
  const ok = h.missionsSys.acceptMission(offer.id);
  assert.equal(ok, true, `${type} must accept`);
  const mission = h.state.missions.active.find((row) => row.type === type);
  assert.ok(mission, `${type} must be active`);
  h.missionsSys._ensureMissionTargets(mission);
  return mission;
}

function destStation(h, mission) {
  let station = [...h.state.entities.values()].find((e) => (
    e && e.type === 'station' && e.data && e.data.stationId === mission.destStationId
  ));
  if (station) return station;
  station = h.sim.spawn({
    type: 'station',
    pos: { x: 80, z: 40 },
    radius: 40,
    data: { stationId: mission.destStationId, dockRadius: 80 },
  });
  return station;
}

function roleOf(entity) {
  return entity && entity.data && entity.data.physicalRole || null;
}

function targetsByRole(h, mission, role) {
  return (mission.targetEntityIds || []).map((id) => h.state.entities.get(id)).filter((e) => (
    e && e.alive !== false && roleOf(e) === role
  ));
}

function completeBy(h, mission, drive) {
  destStation(h, mission);
  drive(mission);
  assert.equal(h.state.missions.active.some((row) => row.id === mission.id), false,
    `${mission.type} should have left the active list`);
  const receipt = h.completed.find((row) => row.missionId === mission.id);
  assert.ok(receipt, `${mission.type} must emit mission:completed`);
  return receipt;
}

test('PQ-152.00 physical types join the catalog and OFFER_MIX named weights', () => {
  const ids = MISSION_TYPES.map((row) => row.type);
  for (const type of TYPES) {
    assert.ok(ids.includes(type), `${type} must be in MISSION_TYPES`);
    assert.equal(MISSION_TYPES.find((row) => row.type === type).proceduralWeight, undefined);
  }
  assert.equal(ids[ids.length - 1], 'heist_intercept', 'heist stays last / structural zero');
  assert.equal(OFFER_MIX.trade_hub.length, 10, 'positional mix stays ten columns');
  assert.ok(OFFER_MIX.mining.tow_recovery > 0);
  assert.ok(OFFER_MIX.fab.demolition > 0);
  assert.ok(OFFER_MIX.research.rescue_under_fire > 0);
  assert.equal(OFFER_MIX.trade_hub.tow_recovery, 0);
  assert.equal(OFFER_MIX.military.demolition, 0);
  assert.equal(OFFER_MIX.bounty_board.tow_recovery, 0);
  assert.equal(OFFER_MIX.contracts_hub.demolition, 0);
});

test('PQ-152.00 seed 15200 posts all three types on route boards', () => {
  const found = scanBoards(SEED);
  for (const type of TYPES) {
    const hits = found.get(type);
    assert.ok(hits.length > 0, `${type} must appear on a route board on seed ${SEED}`);
    assert.match(hits[0].title, type === 'tow_recovery'
      ? /Tow /i
      : type === 'demolition' ? /Knock down/i : /Pull /i);
    assert.ok(hits[0].brief, `${type} board row must carry a physical brief`);
  }
});

test('PQ-152.00 tow_recovery completes by tow_in and sling_in', () => {
  for (const method of METHODS.tow_recovery) {
    const h = boot(SEED);
    const mission = forceOffer(h, 'tow_recovery', 'station_ceres');
    const cores = targetsByRole(h, mission, 'slag_core');
    assert.equal(cores.length, 1, 'tow mission must spawn the slag core');
    const receipt = completeBy(h, mission, () => {
      const core = cores[0];
      if (method === 'tow_in') {
        h.sim.bus.emit('tether:latched', { targetId: core.id });
        h.sim.bus.emit('dock:docked', { stationId: mission.destStationId });
      } else {
        core.pos = { x: 80, z: 40 };
        h.sim.bus.emit('massline:throw', { payloadId: core.id, aimTargetId: null });
      }
    });
    assert.equal(receipt.completionMethod, method);
    assert.equal(receipt.type, 'tow_recovery');
    h.sim.dispose();
  }
});

test('PQ-152.00 demolition completes by wrecking_ball and cut_down', () => {
  for (const method of METHODS.demolition) {
    const h = boot(SEED);
    const mission = forceOffer(h, 'demolition', 'station_coalition');
    const towers = targetsByRole(h, mission, 'demolition_tower');
    assert.equal(towers.length, 1, 'demolition must spawn the tower');
    const receipt = completeBy(h, mission, () => {
      const tower = towers[0];
      if (method === 'wrecking_ball') {
        h.sim.bus.emit('tether:whipImpact', {
          victimId: tower.id, targetId: h.player.id, rating: 'solid', relSpeed: 80,
        });
      } else {
        h.sim.bus.emit('entity:killed', {
          id: tower.id, killerId: h.state.playerId, type: 'wreck',
        });
      }
    });
    assert.equal(receipt.completionMethod, method);
    assert.equal(receipt.type, 'demolition');
    h.sim.dispose();
  }
});

test('PQ-152.00 rescue_under_fire completes by stage_tow and corridor_pull', () => {
  for (const method of METHODS.rescue_under_fire) {
    const h = boot(SEED);
    const mission = forceOffer(h, 'rescue_under_fire', 'station_coalition');
    const pods = targetsByRole(h, mission, 'life_pod');
    const escorts = targetsByRole(h, mission, 'rescue_escort');
    assert.ok(pods.length >= 1, 'rescue must spawn life pods');
    assert.ok(escorts.length >= 1, 'rescue must spawn hostiles');
    const receipt = completeBy(h, mission, () => {
      const pod = pods[0];
      if (method === 'stage_tow') {
        h.sim.bus.emit('tether:latched', { targetId: pod.id });
        h.sim.bus.emit('dock:docked', { stationId: mission.destStationId });
      } else {
        for (const escort of escorts) {
          escort.alive = false;
          h.sim.bus.emit('entity:killed', {
            id: escort.id, killerId: h.state.playerId, type: 'ship',
            physicalRole: 'rescue_escort',
          });
        }
        h.sim.bus.emit('tether:reel', {
          actorId: h.state.playerId, targetId: pod.id, after: 40,
        });
      }
    });
    assert.equal(receipt.completionMethod, method);
    assert.equal(receipt.type, 'rescue_under_fire');
    h.sim.dispose();
  }
});
