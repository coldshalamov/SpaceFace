// Row 110 / PB-ECON-E — SF-109 depletion the pilot can read, SF-116 shortage with a named cause,
// SF-119 a zero-capital job on every board. Seed-pinned; no wall clock.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { economy, starvedIndustryNeedFor } from '../src/systems/economy.js';
import { missions } from '../src/systems/missions.js';
import { SECTORS } from '../src/data/sectors.js';

const SEED = 8110;

function stationInfo(id) {
  for (const sector of SECTORS) {
    const station = (sector.stations || []).find((row) => row.id === id);
    if (station) return { ...station, tier: sector.tier || 0, sectorId: sector.id };
  }
  return null;
}

function boot(seed = SEED) {
  const sim = createSimulation({ seed, systems: [missions, economy] });
  const { state } = sim;
  state.mode = 'flight';
  state.onboarding = { active: false, finished: true };
  const player = sim.spawn({ type: 'ship', team: 0, pos: { x: 0, z: 0 }, hull: 100, hullMax: 100, radius: 8 });
  state.playerId = player.id;
  return { sim, state, missionsSys: sim.registry.get('missions'), econ: sim.registry.get('economy') };
}

// SF-109 — an exploited lane changes visibly: the market row's stock climbs and the sell quote
// sags while the player is still deciding whether to run it again. No unexplained collapse —
// the same stock figure the price reads is the one the table prints.
test('SF-109 repeated sells into one station raise its stock and sag its sell quote', () => {
  const { econ, state } = boot();
  const st = 'station_helios';
  const good = 'cmdty_ore_iron';
  const before = econ.quote(st, good, 'sell', 10);
  assert.ok(before.ok && before.unitAvg > 0, 'a baseline quote exists');
  const stockBefore = state.economy.markets[st][good].stock;

  for (let i = 0; i < 6; i++) econ.applyStockPressure(st, good, 'sell', 25);

  const entry = state.economy.markets[st][good];
  const after = econ.quote(st, good, 'sell', 10);
  assert.ok(entry.stock > stockBefore, 'the table’s stock column shows the glut building');
  assert.ok(after.unitAvg < before.unitAvg,
    `the lane visibly pays less as supply arrives (${before.unitAvg} → ${after.unitAvg})`);
  // And the effect is bounded, not a collapse to zero — the price law clamps.
  assert.ok(after.unitAvg > 0);
});

// SF-116 — a regional shortage names the starved industry input that caused it, and delivering
// that input is the remedy. (Deeper contract-level pin: test/nxi-108-shortage-relief.test.mjs.)
test('SF-116 a starving line names its missing input and the deficit to restore it', () => {
  const { econ, state } = boot();
  // station_ceres is the authored refinery the shortage-relief suite already drives.
  const info = stationInfo('station_ceres');
  assert.ok(info, 'route station exists');
  const market = state.economy.markets.station_ceres || econ.ensureMarket('station_ceres');
  // Starve every industry input on the book deterministically — one market write, no rolled event.
  for (const entry of Object.values(market)) if (entry) entry.stock = 1;
  const need = starvedIndustryNeedFor(info.type, info.tier || 0, market);
  assert.ok(need, 'a starved book produces a named need');
  assert.ok(need.inputId, 'the cause is a specific input good');
  assert.ok(need.deficitUnits > 0, 'the remedy is a quantity, not a label');
  // The remedy is physical: delivering that input lifts it out of starvation.
  econ.applyStockPressure('station_ceres', need.inputId, 'sell', need.deficitUnits + 5);
  const after = starvedIndustryNeedFor(info.type, info.tier || 0, market);
  assert.ok(!after || after.inputId !== need.inputId || after.fill >= 0.3,
    'filling the hopper clears the named cause');
});

// SF-119 — every board posts at least one offer a broke pilot can fly: no collateral, no fee,
// no hold requirement, no standing gate. Work, not a bailout.
test('SF-119 a broke pilot with a full hold still finds work on every board', () => {
  const h = boot();
  h.state.player.credits = 0;
  h.state.player.cargo.capVolume = 0;      // damaged capacity: no freight at all
  h.state.player.cargo.usedVolume = 0;
  for (const stationId of ['station_helios', 'station_ceres', 'station_beltout', 'station_forge']) {
    const board = h.missionsSys.ensureBoard(stationId);
    assert.ok(board && board.slots.length > 0, `${stationId} posts a board`);
    const flyable = board.slots.filter((o) => h.missionsSys._zeroCapitalFlyable(o));
    assert.ok(flyable.length >= 1,
      `${stationId} must carry at least one zero-capital job, got ${board.slots.map((o) => o && o.type)}`);
    // The guarantee is acceptance-real, not decorative: accepting it charges nothing.
    const offer = flyable[0];
    const ok = h.missionsSys.acceptMission(offer.id);
    assert.equal(ok, true, `${offer.type} accepts at zero credits and zero hold`);
    const inst = h.state.missions.active[h.state.missions.active.length - 1];
    assert.equal(h.state.player.credits, 0, 'no fee was charged');
    // Clean up for the next station.
    inst.status = 'failed';
    h.state.missions.active.length = 0;
  }
});

test('SF-119 a board that already offers zero-capital work is not padded', () => {
  const h = boot();
  const board = h.missionsSys.ensureBoard('station_helios');
  const count = board.slots.length;
  h.missionsSys._guaranteeRecoveryOffer(stationInfo('station_helios'), board, 0);
  assert.equal(board.slots.length, count, 'no duplicate row when the roll already covers it');
});
