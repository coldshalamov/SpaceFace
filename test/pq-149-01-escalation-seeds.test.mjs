// PQ-149.01 — witness / spill / flee become delayed, placed, cause-cited escalations.
// Seed 14910. Existing director queue. Never spawn on the player.

import assert from 'node:assert/strict';
import test from 'node:test';

import { DirectorPhase } from '../src/ai/contracts.js';
import {
  EncounterDirector,
  publishEscalationSeeds,
  publishSessionRhythmPhase,
} from '../src/ai/director.js';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import {
  ESCALATION_MAX_DELAY_S,
  ESCALATION_MIN_DELAY_S,
  citedEscalationSeeds,
  encounterDirector,
} from '../src/systems/encounterDirector.js';
import { buildShipLedger } from '../src/systems/shipLedger.js';
import { createTelemetry } from '../src/systems/telemetry.js';

const SEED = 14910;
const SECTOR = 'sector_ceres_belt';
const REFINERY = Object.freeze({ x: -1100, z: 620 });

function refineryGlobal() {
  return sectorLocalToGlobalForSector(REFINERY, SECTOR);
}

function boot() {
  const bus = createBus();
  const state = createGameState(SEED);
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR;
  const origin = refineryGlobal();
  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    isPlayer: true,
    team: 0,
    pos: { x: origin.x, z: origin.z },
    vel: { x: 0, z: 0 },
    data: {},
  };
  state.playerId = player.id;
  state.entities.set(player.id, player);
  state.entityList = [player];
  const director = Object.create(encounterDirector);
  director.init({ state, bus, helpers: {} });
  const telemetry = createTelemetry(bus, state);
  const pressures = [];
  bus.on('economy:applyTradePressure', (payload) => pressures.push(payload));
  return { bus, state, player, director, telemetry, pressures };
}

function emitPlayerActs(bus, state) {
  const origin = refineryGlobal();
  bus.emit('law:witnessChoice', {
    incidentId: 'inc-14910-witness',
    decision: 'split',
    holderId: 21,
    chaserIds: [22],
    anchor: { x: origin.x, z: origin.z },
    reason: 'wreck_hold_and_pursuit',
    sectorId: SECTOR,
    zoneId: 'zone_ceres_refinery',
    attackerId: state.playerId,
    simTime: state.simTime,
  });
  bus.emit('freight:cargoSpilled', {
    encounterId: 'enc-14910-spill',
    custodyId: 'cus-14910',
    manifestId: 'man-14910',
    carrierId: 20,
    cause: 'combat_fire',
    commodityId: 'cmdty_ore_iron',
    qty: 40,
    stationId: 'station_ceres',
    sectorId: SECTOR,
    zoneId: 'zone_ceres_refinery',
    killerId: state.playerId,
    playerCaused: true,
    t: state.simTime,
  });
  bus.emit('ai:flee', {
    entityId: 21,
    reason: 'civilian-violence',
    sectorId: SECTOR,
    zoneId: 'zone_ceres_refinery',
    attackerId: state.playerId,
    playerCaused: true,
  });
}

function stepDirector(director, state, seconds) {
  for (let i = 0; i < seconds; i += 1) {
    state.simTime = (Number(state.simTime) || 0) + 1;
    state.tick = (state.tick | 0) + 1;
    director.update(1, state);
  }
}

function ledgerCited(state) {
  const page = buildShipLedger(state, { page: 0, pageSize: 24 });
  return page.entries.filter((entry) => (
    entry
    && (entry.cause === 'witness' || entry.cause === 'spill' || entry.cause === 'flee')
    && typeof entry.text === 'string'
    && entry.text.includes('because of the ')
  ));
}

test('PQ-149.01 seed 14910: three player acts seed delayed, placed, cause-cited escalations', () => {
  const { bus, state, player, director, telemetry, pressures } = boot();
  try {
    emitPlayerActs(bus, state);
    bus.emit('ai:flee', { entityId: 99, reason: 'hit' });

    const seeded = citedEscalationSeeds(state);
    assert.equal(seeded.length, 3, 'witness, spill, and flee must each mint one seed');
    const causes = new Set(seeded.map((row) => row.cause));
    const beats = new Set(seeded.map((row) => row.beat));
    assert.deepEqual(causes, new Set(['witness', 'spill', 'flee']));
    assert.ok(beats.has('bounty') && beats.has('shortage') && beats.has('rumor'));
    assert.equal(seeded.filter((row) => row.arrived).length, 0, 'escalations must wait out their delay');

    for (const row of seeded) {
      assert.ok(row.delayS >= ESCALATION_MIN_DELAY_S && row.delayS <= ESCALATION_MAX_DELAY_S);
      const dist = Math.hypot(row.place.x - player.pos.x, row.place.z - player.pos.z);
      assert.ok(dist >= 400, `seed ${row.cause} must arrive from a place (dist ${dist}), not the player`);
      assert.notEqual(row.place.zoneId, 'zone_ceres_refinery');
    }

    const beforeLedger = ledgerCited(state);
    assert.equal(beforeLedger.length, 3, 'the ledger cites each cause as soon as the seed is filed');
    for (const row of beforeLedger) {
      assert.ok(row.text.includes('because of the ' + row.cause), row.text);
    }

    stepDirector(director, state, 1);
    assert.equal(citedEscalationSeeds(state).filter((row) => row.arrived).length, 0,
      'one second is not a delay');

    stepDirector(director, state, ESCALATION_MAX_DELAY_S + 1);
    const arrived = citedEscalationSeeds(state).filter((row) => row.arrived === true);
    assert.equal(arrived.length, 3, 'all three seeds must come due after their delay');

    const afterLedger = ledgerCited(state);
    assert.equal(afterLedger.length, 3);
    const citedCauses = new Set(afterLedger.map((row) => row.cause));
    assert.deepEqual(citedCauses, new Set(['witness', 'spill', 'flee']));

    const ring = telemetry.getRecentEvents();
    assert.equal(ring.filter((event) => event.type === 'escalation:seeded').length, 3);
    assert.equal(ring.filter((event) => event.type === 'escalation:arrived').length, 3);
    assert.equal(pressures.length, 1, 'the shortage beat applies trade pressure at the station');
    assert.equal(pressures[0].stationId, 'station_ceres');
    assert.equal(pressures[0].good, 'cmdty_ore_iron');

    console.log('PQ-149.01 cause-cited escalations', JSON.stringify({
      seed: SEED,
      count: arrived.length,
      rows: arrived.map((row) => ({
        cause: row.cause,
        beat: row.beat,
        delayS: row.delayS,
        zoneId: row.place.zoneId,
        arrivedAt: row.arrivedAt,
      })),
    }));
  } finally {
    publishEscalationSeeds([]);
    publishSessionRhythmPhase(null);
    telemetry.dispose();
  }
});

test('PQ-149.01 a seeded bounty is not a hard-counter reinforce', () => {
  try {
    publishEscalationSeeds([{ beat: 'bounty', cause: 'witness' }]);
    const director = new EncounterDirector({
      config: { freezeResults: false, respiteMinTicks: 1, respiteMaxTicks: 2 },
    });
    director.state.phase = DirectorPhase.BUILD;
    director.state.phaseTick = 200;
    director.state.reinforcementBudget = 4;
    director.state.reinforcementCooldown = 0;
    const result = director.update(1, {
      visibleThreat: 1,
      hostileContacts: 6,
      objectiveProgress: 1,
    }, {});
    assert.notEqual(result.command.type, 'request_reinforcement');
  } finally {
    publishEscalationSeeds([]);
    publishSessionRhythmPhase(null);
  }
});
