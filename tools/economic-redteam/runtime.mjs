// Focused deterministic sim for economic red-team searches.
// Drives the live economy, cargo, faction, ship, mission, crafting, mining, and
// automation writers. It does not mint credits except by assigning the opening
// stake before the first measured action.

import { createSimulation } from '../../src/core/sim.js';
import { SECTORS } from '../../src/data/sectors.js';
import { applyFeatureConfigToMaps, featureConfigFromMaps } from '../../src/data/featureFlags.js';
import { PRODUCTION_FEATURES } from '../../src/runtime/runtimeProfiles.js';
import { economy } from '../../src/systems/economy.js';
import { cargo } from '../../src/systems/cargo.js';
import { factions } from '../../src/systems/factions.js';
import { ships, makeShipEntitySpec } from '../../src/systems/ships.js';
import { missions } from '../../src/systems/missions.js';
import { crafting } from '../../src/systems/crafting.js';
import { mining } from '../../src/systems/mining.js';
import { automation } from '../../src/systems/automation.js';

export const HOME_STATION = 'station_helios';
export const HOME_SECTOR = 'sector_helios_prime';
export const HOME_FACTION = 'faction_scn';
export const OPENING_STAKE_CR = 200_000;
export const IRON = 'cmdty_ore_iron';

const SYSTEMS = [economy, cargo, factions, ships, missions, crafting, mining, automation];

const STATION_INDEX = new Map();
for (const sector of SECTORS) {
  for (const station of sector.stations || []) {
    if (station && station.id) {
      STATION_INDEX.set(station.id, {
        id: station.id,
        name: station.name,
        type: station.type,
        sectorId: sector.id,
        factionId: station.factionId || sector.factionId || null,
        services: Array.isArray(station.services) ? station.services : [],
        security: sector.security,
      });
    }
  }
}

export function stationRecord(stationId) {
  return STATION_INDEX.get(stationId) || null;
}

let featureSnapshot = null;

/** Production combat flags: the salvage bay and kill-loot homing are on for players. */
export function useProductionFeatures() {
  if (!featureSnapshot) featureSnapshot = featureConfigFromMaps();
  applyFeatureConfigToMaps(PRODUCTION_FEATURES);
}

export function restoreFeatureMaps() {
  if (featureSnapshot) applyFeatureConfigToMaps(featureSnapshot);
}

export function bootRedTeam(seed = 1845) {
  useProductionFeatures();
  const sim = createSimulation({
    seed: (Number(seed) >>> 0) || 1,
    systems: SYSTEMS,
  });
  const { state, bus } = sim;
  state.world.currentSectorId = HOME_SECTOR;
  state.world.sectors = Object.fromEntries(SECTORS.map((sector) => [sector.id, sector]));
  state.mode = 'flight';
  state.run.kind = 'adventure';
  state.run.phase = 'inactive';
  bus.emit('game:started');
  const shipSys = sim.registry.get('ships');
  shipSys.newGame();
  const entity = sim.spawn(makeShipEntitySpec('ship_kestrel', {
    isPlayer: true,
    player: state.player,
    pos: { x: 0, z: 0 },
    rot: 0,
  }));
  state.playerId = entity.id;
  shipSys.recomputeEntity(entity.id);
  dockAt(sim, HOME_STATION);
  // Opening stake is scenario setup, not an economy grant. Ledgers start after this write.
  state.player.credits = OPENING_STAKE_CR;
  state.player.debt = 0;
  state.player.bounty = 0;
  return sim;
}

export function econOf(sim) {
  return sim.registry.get('economy');
}

export function dockAt(sim, stationId) {
  const info = stationRecord(stationId);
  const { state, bus } = sim;
  if (info) state.world.currentSectorId = info.sectorId;
  state.ui.docked = true;
  state.ui.dockedStationId = stationId;
  bus.emit('dock:docked', { stationId });
  return info;
}

export function undock(sim) {
  const { state, bus } = sim;
  state.ui.docked = false;
  state.ui.dockedStationId = null;
  bus.emit('dock:undocked');
}

export function holdQty(state, commodityId) {
  const items = state.player && state.player.cargo && state.player.cargo.items;
  return Math.floor(Number(items && items[commodityId]) || 0);
}

export function stockQty(state, stationId, commodityId) {
  const market = state.economy && state.economy.markets && state.economy.markets[stationId];
  const entry = market && market[commodityId];
  return entry ? Number(entry.stock) : null;
}

export function bayQty(state, commodityId) {
  const items = state.player && state.player.salvageBay && state.player.salvageBay.items;
  if (!commodityId) {
    let total = 0;
    if (items) for (const id of Object.keys(items)) total += Math.floor(Number(items[id]) || 0);
    return total;
  }
  return Math.floor(Number(items && items[commodityId]) || 0);
}

/** Units sitting in the live hold, every parked hull, and the salvage bay. */
export function custodyUnits(state) {
  const totals = {};
  const add = (bag) => {
    if (!bag) return;
    for (const id of Object.keys(bag)) {
      const qty = Math.floor(Number(bag[id]) || 0);
      if (qty > 0) totals[id] = (totals[id] || 0) + qty;
    }
  };
  add(state.player && state.player.cargo && state.player.cargo.items);
  add(state.player && state.player.salvageBay && state.player.salvageBay.items);
  const owned = state.player && state.player.ownedShips;
  if (Array.isArray(owned)) {
    for (const ship of owned) add(ship && ship.cargo && ship.cargo.items);
  }
  return totals;
}

export function repOf(state, factionId = HOME_FACTION) {
  const rec = state.factions && state.factions[factionId];
  return rec ? Number(rec.rep) || 0 : 0;
}

export function listenCredits(bus) {
  const rows = [];
  const onChange = (payload) => {
    rows.push({
      delta: Number(payload && payload.delta) || 0,
      reason: payload && payload.reason || '',
      total: Number(payload && payload.total) || 0,
    });
  };
  bus.on('credits:changed', onChange);
  return {
    rows,
    stop() { bus.off('credits:changed', onChange); },
  };
}

export function playerPos(state) {
  const entity = state.entities && state.entities.get(state.playerId);
  const pos = entity && entity.pos;
  return { x: Number(pos && pos.x) || 0, z: Number(pos && pos.z) || 0 };
}
