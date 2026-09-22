// Reference adventure hour for PQ-177.05.
//
// Walks the starter corridor for one sim hour on a fixed seed. At each berth the route opens
// the same contract and market decisions the station screens render, then takes one option
// through the live mission and economy owners. Travel time uses the sector chart distance
// and the mission cruise speed, and the next berth waits for a new mission-board epoch so
// the same posted pair cannot be counted twice.

import { createSimulation } from '../../../src/core/sim.js';
import { NEW_GAME } from '../../../src/data/newGameDefaults.js';
import { MISSION_TUNING } from '../../../src/data/missions.js';
import { SECTORS } from '../../../src/data/sectors.js';
import { cargo } from '../../../src/systems/cargo.js';
import { economy } from '../../../src/systems/economy.js';
import { factions } from '../../../src/systems/factions.js';
import { missions } from '../../../src/systems/missions.js';
import {
  ADVENTURE_DECISION_BAR_PER_HOUR,
  REFERENCE_ADVENTURE_HOUR_S,
  REFERENCE_ADVENTURE_SEED,
  REFERENCE_ADVENTURE_STATIONS,
  adventureDecisionSummary,
  chooseAdventureDecision,
  dismissUnworkableDecision,
  presentSurfaceDecisions,
  stationSectorId,
} from '../../../src/ui/adventureDecisions.js';

const CRUISE_WU_S = MISSION_TUNING.cruiseSpeedRef || 140;
const SECTOR_BY_ID = new Map(SECTORS.map((sector) => [sector.id, sector]));

function travelSeconds(fromStationId, toStationId) {
  const fromSector = stationSectorId(fromStationId);
  const toSector = stationSectorId(toStationId);
  if (!fromSector || !toSector || fromSector === toSector) return 600 / CRUISE_WU_S;
  const from = SECTOR_BY_ID.get(fromSector);
  const to = SECTOR_BY_ID.get(toSector);
  if (!from || !to || !from.position || !to.position) return 1800 / CRUISE_WU_S;
  const dx = to.position.x - from.position.x;
  const dy = to.position.y - from.position.y;
  const wu = Math.min(6000, Math.max(600, 600 + Math.hypot(dx, dy) * 650));
  return wu / CRUISE_WU_S;
}

function pickOption(record) {
  if (record.kind === 'contract') {
    return [...record.options].sort((a, b) => (
      (b.effect.rewardCr || 0) - (a.effect.rewardCr || 0)
      || String(a.id).localeCompare(String(b.id))
    ))[0].id;
  }
  if (record.kind === 'forecast') {
    const hold = record.options.find((option) => option.id === 'hold');
    return hold && hold.effect && hold.effect.forecastUp ? 'hold' : 'sell_now';
  }
  if (record.kind === 'haul') return 'haul';
  if (record.kind === 'repair') return 'repair';
  return record.options[0].id;
}

function dock(sim, stationId) {
  const { state, bus } = sim;
  state.ui.docked = true;
  state.ui.dockedStationId = stationId;
  state.world.currentSectorId = stationSectorId(stationId);
  bus.emit('dock:docked', { stationId });
}

function undock(sim) {
  const { state, bus } = sim;
  bus.emit('dock:undocked', {});
  state.ui.docked = false;
  state.ui.dockedStationId = null;
}

function resolveSurface(sim, stationId, surface, notes) {
  const { state, bus } = sim;
  const economySystem = sim.registry.get('economy');
  for (let step = 0; step < 4; step++) {
    const shown = presentSurfaceDecisions(state, stationId, surface);
    const next = shown.find((record) => record && record.id);
    if (!next) return;
    const optionId = pickOption(next);
    const result = chooseAdventureDecision(state, next.id, optionId, { bus, economy: economySystem });
    if (result && result.ok) {
      notes.push({ stationId, kind: next.kind, optionId, atS: state.simTime });
      // One fork per desk per berth. Taking every leftover pair on the same board
      // is the same visit, not another hour of decisions.
      return;
    }
    dismissUnworkableDecision(state, next.id);
    notes.push({
      stationId,
      kind: next.kind,
      optionId,
      atS: state.simTime,
      unworkable: (result && result.reason) || 'unworkable',
    });
  }
}

/**
 * Play the reference corridor for one sim hour and return the decision metric.
 * @param {number} [seed]
 */
export function runReferenceAdventureHour(seed = REFERENCE_ADVENTURE_SEED) {
  const sim = createSimulation({
    seed,
    systems: [cargo, economy, factions, missions],
    updateOrder: [],
  });
  const { state } = sim;
  state.mode = 'flight';
  sim.registry.get('economy').grantCredits(NEW_GAME.credits, 'new_game_seed');
  const ship = sim.spawn({
    type: 'ship',
    pos: { x: 0, z: 0 },
    radius: 4,
    mass: 12,
    hull: 100,
    hullMax: 100,
    collides: false,
    isPlayer: true,
  });
  state.playerId = ship.id;
  ship.isPlayer = true;
  ship.team = 0;
  ship.flags = ship.flags || { boosting: false, docked: false, invuln: false, noInterp: false };

  const notes = [];
  const refreshS = MISSION_TUNING.refreshSec || 300;
  let stationId = REFERENCE_ADVENTURE_STATIONS[0];
  let cursor = 0;
  let guard = 0;
  while ((Number(state.simTime) || 0) < REFERENCE_ADVENTURE_HOUR_S && guard < 48) {
    guard += 1;
    dock(sim, stationId);
    resolveSurface(sim, stationId, 'contracts', notes);
    resolveSurface(sim, stationId, 'market', notes);
    undock(sim);
    const nextId = REFERENCE_ADVENTURE_STATIONS[(cursor + 1) % REFERENCE_ADVENTURE_STATIONS.length];
    const depart = Number(state.simTime) || 0;
    const arrive = depart + travelSeconds(stationId, nextId);
    const nextEpoch = (Math.floor(depart / refreshS) + 1) * refreshS + 1;
    const landed = Math.max(arrive, nextEpoch);
    if (landed >= REFERENCE_ADVENTURE_HOUR_S) {
      state.simTime = REFERENCE_ADVENTURE_HOUR_S;
      break;
    }
    state.simTime = landed;
    stationId = nextId;
    cursor += 1;
  }
  if ((Number(state.simTime) || 0) < REFERENCE_ADVENTURE_HOUR_S) {
    state.simTime = REFERENCE_ADVENTURE_HOUR_S;
  }

  const summary = adventureDecisionSummary(state);
  sim.dispose();
  return {
    seed,
    route: 'helios-belt-tethys-ceres',
    hourS: REFERENCE_ADVENTURE_HOUR_S,
    bar: ADVENTURE_DECISION_BAR_PER_HOUR,
    interestingDecisionsPerHour: Math.round(summary.perHour * 10) / 10,
    count: summary.count,
    simTimeS: summary.simTimeS,
    byKind: summary.byKind,
    decisions: summary.decisions,
    notes,
  };
}

export function formatAdventureDecisionReport(result) {
  const lines = [
    `Adventure reference route  seed ${result.seed}  ${result.route}`,
    `interestingDecisionsPerHour ${result.interestingDecisionsPerHour}`,
    `bar ${result.bar}`,
    `count ${result.count}  simTimeS ${result.simTimeS}`,
    `byKind ${JSON.stringify(result.byKind)}`,
  ];
  return lines.join('\n');
}
