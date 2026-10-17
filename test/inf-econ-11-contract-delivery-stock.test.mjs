import test from 'node:test';
import assert from 'node:assert/strict';
import { economyScenario, STATION, GOOD } from './helpers/infEconomyScenario.mjs';

test('ECON-11 seed 4242: a ten-unit contract delivery raises the receiving listing by exactly ten', () => {
  const h = economyScenario();
  try {
    const offer = {
      id: 'inf-econ-11', type: 'cargo_delivery', source: 'board', title: 'Freight run',
      stationId: 'station_helios', factionId: 'faction_dmc', destStationId: STATION,
      destSectorId: 'sector_ceres_belt', distance: 900, reward_cr: 1000, collateral_cr: 0,
      riskTier: 1, preloadedCargo: true, time_limit_s: 600, duration_s: 600,
      params: { cmdtyId: GOOD, qty: 10, cargoValue: 140, fValue: 1.0175, taskTime: 20, passengers: 0 },
      expiresAtEpoch: 4, storyTag: null,
    };
    h.state.missions.boards.station_helios = { slots: [offer] };
    assert.equal(h.missionSystem.acceptMission(offer.id), true);
    assert.equal(h.state.player.cargo.items[GOOD], 10);
    const before = h.market[GOOD].stock;
    h.bus.emit('dock:docked', { stationId: STATION });
    assert.equal(h.market[GOOD].stock, before + 10);
    assert.equal(h.state.player.cargo.items[GOOD] || 0, 0);
    assert.equal(h.state.missions.active.length, 0);
    h.bus.emit('dock:docked', { stationId: STATION });
    assert.equal(h.market[GOOD].stock, before + 10, 'redocking cannot mint another delivery');
  } finally { h.sim.dispose(); }
});
