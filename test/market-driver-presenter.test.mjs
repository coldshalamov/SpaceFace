import assert from 'node:assert/strict';
import test from 'node:test';

import { COMMODITIES } from '../src/data/commodities.js';
import {
  marketQuoteValue,
  presentMarketDrivers,
} from '../src/ui/marketDriverPresenter.js';

const weapons = COMMODITIES.find((commodity) => commodity.id === 'cmdty_weapons');

function warState() {
  return {
    conflicts: { 'faction_reach:faction_scn': { state: 'war', tension: 90 } },
    sectorSim: {
      field: {
        nodes: {
          sector_helios_prime: {
            danger: 0.72, pricePressure: 0.18,
            influence: { faction_scn: 0.55, faction_reach: 0.45 },
            dominantFactionId: 'faction_scn', dominantInfluence: 0.55, contestMargin: 0.10,
            trend: { danger: 0.01, pricePressure: 0.003, influence: 0 },
            driver: { danger: 'contested_space', pricePressure: 'route_scarcity', influence: 'border_contest' },
          },
        },
      },
    },
    world: { sectors: { sector_helios_prime: { owner: 'faction_scn' } } },
  };
}

test('canonical quote helper prefers live lastBuy/lastSell values', () => {
  const entry = { buy: 999, sell: 998, lastBuy: 137, lastSell: 121 };
  assert.equal(marketQuoteValue(entry, weapons, 'buy'), 137);
  assert.equal(marketQuoteValue(entry, weapons, 'sell'), 121);
});

test('driver presenter explains structural, geographic, conflict, and cycle forces', () => {
  const drivers = presentMarketDrivers({
    state: warState(),
    stationId: 'station_helios',
    commodity: weapons,
    entry: {
      role: 'consume',
      demandMult: 1.22,
      demandDrivers: [{
        id: 'war-footing', label: 'War footing', shortLabel: 'War · weapons ↑',
        explanation: 'Active fighting raises demand for weapon systems.', direction: 'up', delta: 0.22,
      }],
    },
    cycle: { regime: 'rising', family: 'rising' },
  });

  assert.deepEqual(drivers.primary.map((driver) => driver.id), ['role', 'geography', 'conflict', 'cycle']);
  assert.deepEqual(drivers.primary.map((driver) => driver.shortLabel), [
    'Role · demand ↑',
    'Core · tight',
    'War · weapons ↑',
    'Cycle · Rising',
  ]);
  assert.equal(new Set(drivers.primary.map((driver) => `${driver.shortLabel}|${driver.label}`)).size, 4,
    'the expanded ribbon should add meaning rather than repeat the compact label');
  assert.ok(drivers.primary.every((driver) => driver.explanation && driver.direction),
    'every compact visual driver has a non-color explanation and explicit direction');
  assert.match(drivers.accessibleSummary, /war/i);
  assert.match(drivers.sectorContext.label, /sector/i,
    'sector-wide pressure is labeled as sector context rather than a commodity forecast');
});

test('driver presenter explains every stacked persistent demand cause', () => {
  const drivers = presentMarketDrivers({
    state: warState(),
    stationId: 'station_helios',
    commodity: weapons,
    entry: {
      role: 'consume',
      demandMult: 1.26,
      demandDrivers: [
        {
          id: 'war-footing', label: 'War footing', shortLabel: 'War · military ↑',
          explanation: 'War raises military demand.', direction: 'up', delta: 0.22,
        },
        {
          id: 'blockade-relief', label: 'Blockade pressure', shortLabel: 'Blockade · supply ↑',
          explanation: 'A blockade disrupts supply.', direction: 'up', delta: 0.04,
        },
      ],
    },
    cycle: { regime: 'stable', family: 'stable' },
  });

  const conflict = drivers.primary.find((driver) => driver.id === 'conflict');
  assert.match(conflict.shortLabel, /war/i);
  assert.match(conflict.shortLabel, /blockade/i);
  assert.match(conflict.explanation, /war raises military demand/i);
  assert.match(conflict.explanation, /blockade disrupts supply/i);
  assert.match(drivers.accessibleSummary, /war raises military demand/i);
  assert.match(drivers.accessibleSummary, /blockade disrupts supply/i);
});

test('driver presenter prefers runtime station role and security overrides', () => {
  const state = warState();
  state.content = {
    sectors: [{
      id: 'sector_helios_prime',
      security: 0.2,
      stations: [{ id: 'station_helios', type: 'blackmarket' }],
    }],
  };
  const drivers = presentMarketDrivers({
    state,
    stationId: 'station_helios',
    commodity: weapons,
    entry: { role: 'consume', demandMult: 1, demandDrivers: [] },
    cycle: { regime: 'stable', family: 'stable' },
  });

  assert.match(drivers.primary[0].label, /blackmarket/i);
  assert.equal(drivers.primary[1].shortLabel, 'Frontier · wide');
});
