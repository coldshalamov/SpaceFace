// PQ-152.03 — mid-run twist clauses mutate the contract (PQ-138.04). Seed 15230.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import {
  AUTHORED_SET_PIECES,
  CAPITAL_BOSS_TYPE,
  MISSION_TYPES,
  OFFER_MIX,
  TWIST_CLAUSE_LIVE_TYPES,
} from '../src/data/missions.js';
import {
  TWIST_CLAUSE_IDS,
  TWIST_MUTATIONS,
  attachTwistClauses,
  isTwistCondition,
  missionConditionById,
  serializableMissionCondition,
  QUIET_APPROACH_HOLD_S,
} from '../src/data/missionConditions.js';
import { SECTORS } from '../src/data/sectors.js';
import { contractClausesSystem } from '../src/systems/contractClauses.js';
import { missions } from '../src/systems/missions.js';

const SEED = 15230;
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
  const sim = createSimulation({
    seed,
    systems: [missions, contractClausesSystem],
  });
  const { state } = sim;
  state.mode = 'flight';
  state.player.credits = 250000;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    hull: 200, hullMax: 200, radius: 8,
  });
  state.playerId = player.id;
  const failed = [];
  const toasts = [];
  sim.bus.on('mission:failed', (payload) => failed.push(payload));
  sim.bus.on('toast', (payload) => toasts.push(payload));
  return {
    sim,
    state,
    player,
    failed,
    toasts,
    missionsSys: sim.registry.get('missions'),
  };
}

function step(h, seconds) {
  const ticks = Math.max(1, Math.round(seconds / SIM_DT));
  for (let i = 0; i < ticks; i += 1) h.sim.step(SIM_DT);
}

function twistRow(id) {
  const row = serializableMissionCondition(id);
  assert.ok(row, `twist ${id} must serialize`);
  return row;
}

function originStation() {
  const origin = stationInfo('station_helios');
  assert.ok(origin, 'Helios must exist');
  return origin;
}

function acceptTwisted(h, {
  type,
  twistId,
  destStationId = 'station_forge',
  destSectorId = 'sector_vesta_forge',
  params = {},
  riskTier = 2,
}) {
  const origin = originStation();
  const dest = stationInfo(destStationId) || { id: destStationId, sectorId: destSectorId };
  const offer = {
    id: `offer_twist_${twistId}`,
    type,
    stationId: origin.id,
    factionId: origin.factionId,
    reward_cr: 900,
    collateral_cr: 0,
    riskTier,
    destStationId: dest.id,
    destSectorId: dest.sectorId || destSectorId,
    distance: 1800,
    title: `Twist probe ${twistId}`,
    brief: missionConditionById(twistId).brief,
    params: { ...params, twistClauseId: twistId },
    clauses: [twistRow(twistId)],
    source: 'careerContract',
  };
  const board = h.state.missions.boards[origin.id] || (h.state.missions.boards[origin.id] = {
    refreshEpoch: 0, slots: [],
  });
  board.slots.push(offer);
  assert.equal(h.missionsSys.acceptMission(offer.id), true, `${twistId} must accept`);
  const mission = h.state.missions.active.find((row) => row && row.sourceOfferId === offer.id)
    || h.state.missions.active[h.state.missions.active.length - 1];
  assert.ok(mission, `${twistId} must be active`);
  return mission;
}

function spawnDest(h, stationId, pos) {
  return h.sim.spawn({
    type: 'station',
    pos,
    radius: 60,
    collides: false,
    data: { stationId },
  });
}

function successorOf(h, failedId) {
  return (h.state.missions.active || []).find((row) => row && row.mutatedFromMissionId === failedId);
}

function assertMutated(h, mission, twistId) {
  const descriptor = TWIST_MUTATIONS[twistId];
  assert.ok(descriptor, `${twistId} must have a mutation descriptor`);
  assert.equal(h.failed.length, 1, `${twistId} still emits one mission:failed`);
  assert.equal(h.failed[0].missionId, mission.id);
  assert.ok(h.failed[0].mutatedToMissionId, `${twistId} must mutate, not dead-end`);
  assert.equal(h.failed[0].mutationTag, descriptor.tag);
  const failedToasts = h.toasts.filter((row) => /^Mission FAILED:/.test(String(row.text || '')));
  assert.equal(failedToasts.length, 0, `${twistId} must not scold — PQ-138.04 toast names the follow-up`);
  const next = successorOf(h, mission.id);
  assert.ok(next, `${twistId} must leave a live successor`);
  assert.equal(next.status, 'active');
  assert.equal(next.type, descriptor.type);
  assert.equal(next.mutationTag, descriptor.tag);
  assert.notEqual(next.id, mission.id);
  assert.equal((h.state.missions.active || []).includes(mission), false);
  return next;
}

function scanBoards(seed = SEED) {
  const found = new Map(TWIST_CLAUSE_IDS.map((id) => [id, []]));
  for (const stationId of ROUTE_STATIONS) {
    for (let epoch = 0; epoch < 16; epoch += 1) {
      const h = boot(seed);
      h.state.simTime = epoch * 600;
      const board = h.missionsSys.ensureBoard(stationId);
      if (board && Array.isArray(board.slots)) {
        for (const offer of board.slots) {
          for (const row of offer && offer.clauses || []) {
            const id = row && (row.conditionId || row.id);
            if (found.has(id)) {
              found.get(id).push({
                stationId,
                epoch,
                type: offer.type,
                title: offer.title,
                brief: offer.brief,
              });
            }
          }
        }
      }
      h.sim.dispose();
    }
  }
  return found;
}

test('catalog: five twist clauses, authored catalog stays 10, capital boss stays its own type', () => {
  assert.equal(TWIST_CLAUSE_IDS.length, 5);
  assert.deepEqual([...TWIST_CLAUSE_IDS], [
    'escort_turns', 'cargo_volatile', 'buyer_is_the_law', 'wreck_wakes', 'pods_are_bait',
  ]);
  for (const id of TWIST_CLAUSE_IDS) {
    const def = missionConditionById(id);
    assert.ok(def && def.twist === true, `${id} is a twist`);
    assert.equal(isTwistCondition(def), true);
    assert.equal(def.kind, 'forbid');
    assert.equal(def.onBreach, 'fail');
    assert.ok(TWIST_MUTATIONS[id], `${id} mutates rather than voids`);
    assert.deepEqual([...def.appliesTo], [...TWIST_CLAUSE_LIVE_TYPES[id]]);
  }
  assert.equal(AUTHORED_SET_PIECES.length, 10, 'AUTHORED_SET_PIECES stays 10');
  assert.equal(MISSION_TYPES.some((row) => row.type === CAPITAL_BOSS_TYPE), true);
  assert.equal(MISSION_TYPES.filter((row) => row.type === 'authored_set_piece').length, 1);
  assert.equal(MISSION_TYPES[MISSION_TYPES.length - 1].type, 'heist_intercept');
  const mixLen = Object.values(OFFER_MIX).map((row) => {
    const positional = Array.isArray(row) ? row.length : 0;
    return positional;
  });
  assert.ok(mixLen.every((n) => n === 10), 'OFFER_MIX positional rows stay 10 long');
});

test('attachTwistClauses uses its own seed stream and leaves a term-free offer untouched', () => {
  const offer = {
    id: 'mo_twist_free',
    type: 'recon_scan',
    riskTier: 0,
    params: { scanTargets: 2 },
  };
  const out = attachTwistClauses(offer, SEED);
  assert.equal(out, offer, 'ineligible offers return the original object');

  const helios = {
    id: 'mo_helios_cargo_1',
    type: 'cargo_delivery',
    stationId: 'station_helios',
    riskTier: 3,
    params: { cmdtyId: 'cmdty_food', qty: 8 },
  };
  assert.equal(attachTwistClauses(helios, SEED), helios, 'Helios boards stay twist-free');

  const cargo = {
    id: 'mo_twist_cargo_1',
    type: 'cargo_delivery',
    riskTier: 3,
    params: { cmdtyId: 'cmdty_food', qty: 8 },
  };
  const a = attachTwistClauses(cargo, SEED);
  const b = attachTwistClauses(cargo, SEED);
  assert.deepEqual(a.clauses, b.clauses);
  assert.deepEqual(a.params && a.params.twistClauseId, b.params && b.params.twistClauseId);
});

test('seed 15230 boards carry all five twist clauses', () => {
  const found = scanBoards(SEED);
  const counts = {};
  for (const id of TWIST_CLAUSE_IDS) {
    counts[id] = found.get(id).length;
    assert.ok(counts[id] >= 1, `${id} must appear on seed ${SEED} boards (saw ${counts[id]})`);
    const heliosHits = found.get(id).filter((row) => row.stationId === 'station_helios');
    assert.equal(heliosHits.length, 0, `${id} must stay off Helios`);
  }
  console.log(`PQ-152.03 seed ${SEED} twist counts`, counts);
});

test('escort_turns mutates into a live hunt', () => {
  const h = boot();
  const mission = acceptTwisted(h, { type: 'escort', twistId: 'escort_turns', params: { targetStrength: 1 } });
  const escort = h.sim.spawn({
    type: 'ship', team: 0, pos: { x: 40, z: 0 }, hull: 80, hullMax: 80, radius: 10,
    data: { escortee: true, intent: { moveX: 0, moveZ: 0, fire: false } },
  });
  mission._escorteeId = escort.id;
  mission.targetEntityIds = [escort.id];
  escort.team = 1;
  escort.data.escortTurned = true;
  step(h, 1.6);
  const next = assertMutated(h, mission, 'escort_turns');
  assert.equal(next._escorteeId, escort.id, 'the turned hull stays the hunt target');
  assert.equal(escort.alive !== false, true, 'mutation does not kill the escort');
  h.sim.dispose();
});

test('cargo_volatile mutates into a live recovery', () => {
  const h = boot();
  const mission = acceptTwisted(h, {
    type: 'cargo_delivery',
    twistId: 'cargo_volatile',
    params: { cmdtyId: 'cmdty_fuel_cells', qty: 6 },
  });
  h.sim.bus.emit('cargo:volatileSlam', {
    class: 'explosive',
    podId: 9,
    appliedImpulse: 40,
  });
  assertMutated(h, mission, 'cargo_volatile');
  h.sim.dispose();
});

test('buyer_is_the_law mutates into a live reroute', () => {
  const h = boot();
  const mission = acceptTwisted(h, {
    type: 'cargo_delivery',
    twistId: 'buyer_is_the_law',
    destStationId: 'station_forge',
    params: { cmdtyId: 'cmdty_food', qty: 8 },
  });
  spawnDest(h, 'station_forge', { x: 200, z: 0 });
  h.player.pos = { x: 180, z: 0 };
  step(h, QUIET_APPROACH_HOLD_S + 0.6);
  const next = assertMutated(h, mission, 'buyer_is_the_law');
  assert.equal(next.destStationId, 'station_helios', 'sting reroutes to the offering berth');
  h.sim.dispose();
});

test('wreck_wakes mutates into a live hunt', () => {
  const h = boot();
  const mission = acceptTwisted(h, {
    type: 'salvage_retrieval',
    twistId: 'wreck_wakes',
    params: { cmdtyId: 'cmdty_scrap_metal', qty: 3 },
  });
  const wreck = h.sim.spawn({
    type: 'wreck', pos: { x: 80, z: 0 }, hull: 40, hullMax: 40, radius: 12,
  });
  mission.targetEntityIds = [wreck.id];
  h.sim.bus.emit('physics:impact', {
    aId: h.state.playerId,
    bId: wreck.id,
    playerInvolved: true,
    dp: 20,
  });
  assertMutated(h, mission, 'wreck_wakes');
  h.sim.dispose();
});

test('pods_are_bait mutates into a live field-clear', () => {
  const h = boot();
  const mission = acceptTwisted(h, {
    type: 'rescue_under_fire',
    twistId: 'pods_are_bait',
    destStationId: 'station_forge',
    params: { targetStrength: 1 },
  });
  spawnDest(h, 'station_forge', { x: 160, z: 0 });
  h.player.pos = { x: 140, z: 0 };
  step(h, QUIET_APPROACH_HOLD_S + 0.6);
  assertMutated(h, mission, 'pods_are_bait');
  h.sim.dispose();
});
