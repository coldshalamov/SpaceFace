// Ashcache fences salvage (INFERENCE-18).
//
// Ruined Cache Station is the tier-4 endgame salvage sector's only berth, a
// blackmarket-type station whose chartNote promises "buys what shouldn't exist" —
// but it was the only blackmarket station whose services lacked 'black_market'.
// That dead-ended the Pitborn "Yards and Fences" presence node (services: [])
// and refused salvage-rights redemption with "pitborn yard only" at the
// sector whose own stunt loop mints them. One data token revives the fence.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { SECTORS } from '../src/data/sectors.js';
import { presenceServiceForStation } from '../src/data/factionPresence.js';
import { canLaunderSalvageAtStation } from '../src/data/salvageLegality.js';
import { economy, SERVICE_PRICES } from '../src/systems/economy.js';

const STATION_ID = 'station_ashcache';

test('the sector salvage capital actually runs a black market', () => {
  const station = SECTORS.find((s) => s.id === 'sector_ashfall_reach').stations
    .find((s) => s.id === STATION_ID);
  assert.ok(station, 'Ruined Cache Station exists');
  assert.equal(station.type, 'blackmarket');
  assert.ok(station.services.includes('black_market'),
    'a blackmarket-type station carries the black_market service token');
  assert.ok(station.repGated, 'the door still vets standing');
  assert.ok(canLaunderSalvageAtStation(STATION_ID),
    'pod laundering keeps working on the same record');
});

test('the Pitborn node derives a fence at Ashcache, not an empty service record', () => {
  const presence = presenceServiceForStation(STATION_ID, { faction_pitborn: 0 });
  assert.ok(presence, 'the Yards and Fences node answers for ashcache');
  assert.equal(presence.factionId, 'faction_pitborn');
  assert.ok(presence.services.includes('fence'), 'black_market service derives the fence');
  assert.equal(presence.available, true, 'rep 0 is welcome at the fence');
});

test('salvage rights redeem at the fence on the live economy path', () => {
  const sim = createSimulation({ seed: 0x15504, systems: [economy], updateOrder: [] });
  try {
    const { state, bus } = sim;
    state.ui = { docked: true, dockedStationId: STATION_ID };
    state.factions = { faction_pitborn: { rep: 0 } };
    state.player.credits = 500;
    state.player.salvageRights = 4;
    const repDeltas = [];
    const completed = [];
    const toasts = [];
    bus.on('faction:repDelta', (p) => repDeltas.push(p));
    bus.on('service:completed', (p) => completed.push(p));
    bus.on('toast', (p) => toasts.push(p));

    bus.emit('ui:service', { type: 'redeem_rights' });
    assert.equal(state.player.salvageRights, 0, 'the fence cashes the whole purse');
    assert.equal(state.player.credits, 500 + 4 * SERVICE_PRICES.salvageRightCr,
      'each right pays out through the single-writer credit grant');
    assert.equal(repDeltas.length, 1);
    assert.equal(repDeltas[0].factionId, 'faction_pitborn');
    assert.equal(repDeltas[0].delta, 4);
    assert.equal(completed[0].type, 'redeem_rights');
    assert.equal(completed[0].stationId, STATION_ID);
    assert.ok(toasts.every((t) => !/Pitborn yard only|redeem at a Pitborn yard/i.test(t.text || '')),
      'no yard-only refusal at the fence');
  } finally {
    sim.dispose();
    economy._instance = null;
  }
});
