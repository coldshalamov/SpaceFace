// PQ-152.01 — ten authored set pieces on the route. Seed 15210.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import {
  AUTHORED_SET_PIECES,
  AUTHORED_SET_PIECE_HEADLINE,
  AUTHORED_SET_PIECE_SOURCE,
  AUTHORED_SET_PIECE_TYPE,
  MISSION_TYPES,
  OFFER_MIX,
  SET_PIECE_MISSIONS,
  validateAuthoredSetPieceCatalog,
} from '../src/data/missions.js';
import { AUTHORED_SET_PIECE_ENCOUNTERS } from '../src/data/encounters/set-piece-authored.js';
import { SECTORS } from '../src/data/sectors.js';
import { missions } from '../src/systems/missions.js';

const SEED = 15210;
const ROUTE_STATIONS = Object.freeze([
  'station_helios',
  'station_beltout',
  'station_forge',
  'station_veil',
  'station_smuggler',
  'station_coalition',
  'station_tethys',
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
  const found = new Map(AUTHORED_SET_PIECES.map((row) => [row.id, []]));
  for (const stationId of ROUTE_STATIONS) {
    const h = boot(seed);
    const board = h.missionsSys.ensureBoard(stationId);
    for (const offer of board && board.slots || []) {
      const id = offer && offer.params && offer.params.authoredSetPieceId;
      if (id && found.has(id)) {
        found.get(id).push({
          stationId,
          title: offer.title,
          methods: offer.params.completionMethods,
          source: offer.source,
          type: offer.type,
        });
      }
    }
    h.sim.dispose();
  }
  return found;
}

function roleOf(entity) {
  return entity && entity.data && entity.data.physicalRole || null;
}

function targetsByRole(h, mission, role) {
  return (mission.targetEntityIds || []).map((id) => h.state.entities.get(id)).filter((e) => (
    e && e.alive !== false && roleOf(e) === role
  ));
}

function destStation(h, mission) {
  let station = [...h.state.entities.values()].find((e) => (
    e && e.type === 'station' && e.data && e.data.stationId === mission.destStationId
  ));
  if (station) return station;
  return h.sim.spawn({
    type: 'station',
    pos: { x: 80, z: 40 },
    radius: 40,
    data: { stationId: mission.destStationId, dockRadius: 80 },
  });
}

function acceptAuthored(h, definition) {
  const dest = stationInfo(definition.destStationId);
  const origin = stationInfo(definition.startStationId);
  assert.ok(dest && origin, `${definition.id} stations must exist`);
  h.state.world.currentSectorId = dest.sectorId;
  const board = h.missionsSys.ensureBoard(origin.id);
  const offer = (board.slots || []).find((row) => (
    row && row.params && row.params.authoredSetPieceId === definition.id
  ));
  assert.ok(offer, `${definition.id} must post on ${origin.id}`);
  offer.collateral_cr = 0;
  const ok = h.missionsSys.acceptMission(offer.id);
  assert.equal(ok, true, `${definition.id} must accept`);
  const mission = h.state.missions.active.find((row) => (
    row.params && row.params.authoredSetPieceId === definition.id
  ));
  assert.ok(mission, `${definition.id} must be active`);
  h.missionsSys._ensureMissionTargets(mission);
  return mission;
}

function completeBy(h, mission, drive) {
  destStation(h, mission);
  drive(mission);
  assert.equal(h.state.missions.active.some((row) => row.id === mission.id), false,
    `${mission.params.authoredSetPieceId} should have left the active list`);
  const receipt = h.completed.find((row) => row.missionId === mission.id);
  assert.ok(receipt, `${mission.params.authoredSetPieceId} must emit mission:completed`);
  return receipt;
}

const DRIVES = Object.freeze({
  wrecking_ball: {
    wrecking_ball(h, mission) {
      const tower = targetsByRole(h, mission, 'demolition_tower')[0];
      h.sim.bus.emit('tether:whipImpact', {
        victimId: tower.id, targetId: h.player.id, rating: 'solid', relSpeed: 80,
      });
    },
    cut_down(h, mission) {
      const tower = targetsByRole(h, mission, 'demolition_tower')[0];
      h.sim.bus.emit('entity:killed', {
        id: tower.id, killerId: h.state.playerId, type: 'wreck',
      });
    },
  },
  pod_rescue: {
    stage_tow(h, mission) {
      const pod = targetsByRole(h, mission, 'life_pod')[0];
      h.sim.bus.emit('tether:latched', { targetId: pod.id });
      h.sim.bus.emit('dock:docked', { stationId: mission.destStationId });
    },
    corridor_pull(h, mission) {
      const pod = targetsByRole(h, mission, 'life_pod')[0];
      for (const escort of targetsByRole(h, mission, 'rescue_escort')) {
        escort.alive = false;
        h.sim.bus.emit('entity:killed', {
          id: escort.id, killerId: h.state.playerId, type: 'ship',
        });
      }
      h.sim.bus.emit('tether:reel', {
        actorId: h.state.playerId, targetId: pod.id, after: 40,
      });
    },
  },
  long_tow: {
    tow_in(h, mission) {
      const core = targetsByRole(h, mission, 'slag_core')[0];
      h.sim.bus.emit('tether:latched', { targetId: core.id });
      h.sim.bus.emit('dock:docked', { stationId: mission.destStationId });
    },
    sling_in(h, mission) {
      const core = targetsByRole(h, mission, 'slag_core')[0];
      core.pos = { x: 80, z: 40 };
      h.sim.bus.emit('massline:throw', { payloadId: core.id, aimTargetId: null });
    },
  },
  convoy_defence: {
    recatch_pods(h, mission) {
      const pod = targetsByRole(h, mission, 'cargo_pod')[0];
      h.sim.bus.emit('tether:latched', { targetId: pod.id });
      h.sim.bus.emit('dock:docked', { stationId: mission.destStationId });
    },
    drive_off(h, mission) {
      for (const raider of targetsByRole(h, mission, 'convoy_raider')) {
        raider.alive = false;
        h.sim.bus.emit('entity:killed', {
          id: raider.id, killerId: h.state.playerId, type: 'ship',
        });
      }
    },
  },
  station_door_jam: {
    park_the_hulk(h, mission) {
      const hulk = targetsByRole(h, mission, 'jam_hulk')[0];
      hulk.pos = { x: 80, z: 40 };
      h.sim.bus.emit('massline:throw', { payloadId: hulk.id, aimTargetId: null });
    },
    swing_the_wedge(h, mission) {
      const hulk = targetsByRole(h, mission, 'jam_hulk')[0];
      h.sim.bus.emit('tether:whipImpact', {
        victimId: hulk.id, targetId: h.player.id, rating: 'solid', relSpeed: 70,
      });
    },
  },
  impound_break: {
    slip_the_gap(h, mission) {
      const lock = targetsByRole(h, mission, 'cradle_lock')[0];
      h.sim.bus.emit('tether:reel', {
        actorId: h.state.playerId, targetId: lock.id, after: 30,
      });
    },
    breach_the_lock(h, mission) {
      const lock = targetsByRole(h, mission, 'cradle_lock')[0];
      h.sim.bus.emit('tether:whipImpact', {
        victimId: lock.id, targetId: h.player.id, rating: 'crushing', relSpeed: 90,
      });
    },
  },
  ace_duel: {
    throw_the_ace(h, mission) {
      const ace = targetsByRole(h, mission, 'ace_pilot')[0];
      h.sim.bus.emit('massline:throw', { payloadId: ace.id, aimTargetId: ace.id });
    },
    outgun_the_ace(h, mission) {
      const ace = targetsByRole(h, mission, 'ace_pilot')[0];
      h.sim.bus.emit('entity:killed', {
        id: ace.id, killerId: h.state.playerId, type: 'ship',
      });
    },
  },
  reef_clearance: {
    bowl_the_chain(h, mission) {
      const mine = targetsByRole(h, mission, 'reef_mine')[0];
      const iron = targetsByRole(h, mission, 'bowl_mass')[0];
      h.sim.bus.emit('massline:throw', { payloadId: iron.id, aimTargetId: mine.id });
    },
    reel_the_line(h, mission) {
      const mine = targetsByRole(h, mission, 'reef_mine')[0];
      h.sim.bus.emit('tether:reel', {
        actorId: h.state.playerId, targetId: mine.id, after: 25,
      });
    },
  },
  loud_heist: {
    yank_the_hatch(h, mission) {
      const hatch = targetsByRole(h, mission, 'vault_hatch')[0];
      h.sim.bus.emit('tether:reel', {
        actorId: h.state.playerId, targetId: hatch.id, after: 20,
      });
    },
    smash_the_door(h, mission) {
      const hatch = targetsByRole(h, mission, 'vault_hatch')[0];
      h.sim.bus.emit('tether:whipImpact', {
        victimId: hatch.id, targetId: h.player.id, rating: 'solid', relSpeed: 85,
      });
    },
  },
  ore_crusher: {
    feed_the_jaws(h, mission) {
      const jaws = targetsByRole(h, mission, 'crusher_jaws')[0];
      h.sim.bus.emit('massline:throw', { payloadId: jaws.id, aimTargetId: jaws.id });
    },
    cut_the_belt(h, mission) {
      const belt = targetsByRole(h, mission, 'crusher_belt')[0];
      h.sim.bus.emit('tether:whipImpact', {
        victimId: belt.id, targetId: h.player.id, rating: 'solid', relSpeed: 60,
      });
    },
  },
});

test('PQ-152.01 catalog is ten physical headlines with two solutions', () => {
  const validation = validateAuthoredSetPieceCatalog();
  assert.equal(validation.ok, true, validation.errors.join('; '));
  assert.equal(AUTHORED_SET_PIECES.length, 10);
  assert.equal(SET_PIECE_MISSIONS.length, 5, 'SP1 chains stay five');
  for (const row of AUTHORED_SET_PIECES) {
    assert.match(row.title, AUTHORED_SET_PIECE_HEADLINE);
    assert.equal(row.methods.length, 2);
    assert.ok(AUTHORED_SET_PIECE_ENCOUNTERS[row.id], `${row.id} must have actors and a place`);
    assert.ok(row.twistClauseId, `${row.id} needs a twist clause`);
    assert.notEqual(row.startStationId, 'station_helios');
  }
  const ids = MISSION_TYPES.map((row) => row.type);
  assert.ok(ids.includes(AUTHORED_SET_PIECE_TYPE));
  assert.equal(ids[ids.length - 1], 'heist_intercept', 'heist stays last / structural zero');
  assert.equal(OFFER_MIX.trade_hub.length, 10, 'positional mix stays ten columns');
  assert.equal(OFFER_MIX.trade_hub.tow_recovery, 0, 'Helios trade_hub physical weight stays 0');
  assert.equal(OFFER_MIX.military.demolition, 0);
  assert.equal(OFFER_MIX.bounty_board.tow_recovery, 0);
  assert.equal(OFFER_MIX.contracts_hub.demolition, 0);
});

test('PQ-152.01 seed 15210 posts all ten authored set pieces on the route', () => {
  const found = scanBoards(SEED);
  const helios = boot(SEED);
  const heliosBoard = helios.missionsSys.ensureBoard('station_helios');
  const heliosAuthored = (heliosBoard.slots || []).filter((row) => row.source === AUTHORED_SET_PIECE_SOURCE);
  helios.sim.dispose();
  assert.equal(heliosAuthored.length, 0, 'Helios must not grow an authored set-piece row');
  for (const row of AUTHORED_SET_PIECES) {
    const hits = found.get(row.id);
    assert.ok(hits.length > 0, `${row.id} must appear on a route board on seed ${SEED}`);
    assert.equal(hits[0].title, row.title);
    assert.deepEqual(hits[0].methods, row.methods);
    assert.equal(hits[0].type, AUTHORED_SET_PIECE_TYPE);
  }
});

test('PQ-152.01 each authored set piece completes by both methods', () => {
  for (const definition of AUTHORED_SET_PIECES) {
    const drives = DRIVES[definition.id];
    assert.ok(drives, `${definition.id} needs both method drives`);
    for (const method of definition.methods) {
      const h = boot(SEED);
      const mission = acceptAuthored(h, definition);
      const primary = targetsByRole(h, mission, definition.primaryRole);
      assert.ok(primary.length >= 1, `${definition.id} must spawn ${definition.primaryRole}`);
      const receipt = completeBy(h, mission, () => {
        const drive = drives[method];
        assert.ok(typeof drive === 'function', `${definition.id}/${method} drive missing`);
        drive(h, mission);
      });
      assert.equal(receipt.completionMethod, method, `${definition.id} ${method}`);
      assert.equal(receipt.type, AUTHORED_SET_PIECE_TYPE);
      h.sim.dispose();
    }
  }
});
