// Mission text in the voice of the person giving it (Lane 3 seed). The standing relief run and
// the desk regular's repeat offer used to read as dispatcher prose ("This client will keep a
// route open for you") — the board spoke, not the giver. Both offers now speak first-person in
// the giver's own words, keeping every fact the old prose carried: the goods, the destination,
// the route promise, the three-run relationship.
import test from 'node:test';
import assert from 'node:assert/strict';
import { reliefOfferShape, deskClientName, syncCaptainStandingOrders } from '../src/systems/captainStandingOrders.js';

// The summary templates live inline in syncCaptainStandingOrders; this reads them the way a
// board renders — by running the real sync against a seeded state and reading the slots.
test('the relief run speaks in the rescued captain\'s own voice', async () => {
  const shape = reliefOfferShape('cap-1', 0, 'station_helios');
  assert.ok(shape.dest, 'the shape carries a destination');
  const state = {
    simTime: 5000,
    missions: { standingOrders: [], captainOrderCycles: {} },
    traffic: { captainRoster: [{ id: 'cap-1', name: 'Wren Vahl', alive: true,
      homeStationId: 'station_helios', outcomes: { rescued: 1 } }] },
  };
  const board = { slots: [] };
  const info = { id: 'station_helios', name: 'Helios Station', factionId: 'faction_scn' };
  syncCaptainStandingOrders({ state }, info, board);
  const offer = board.slots.find((s) => s.cause?.tag === 'remembered_captain');
  assert.ok(offer, 'the relief offer syncs');
  assert.match(offer.summary, /Wren Vahl: "/, 'the giver signs the line and speaks first person');
  assert.match(offer.summary, /You pulled my crew out of the black/, 'the rescue is the giver\'s memory, not the board\'s');
  assert.match(offer.summary, /provisions|ice water/, 'the goods are named');
  const destName = shape.dest.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  assert.match(offer.summary, new RegExp(destName), 'the destination is named');
  assert.doesNotMatch(offer.summary, /This client will keep a route open for you/, 'the dispatcher prose is gone');
});

test('the desk regular\'s offer speaks as theirs too', async () => {
  const type = 'cargo_delivery';
  const clientName = deskClientName('station_helios', type);
  const state = {
    simTime: 5000,
    missions: {
      standingOrders: [{ id: `standing:station_helios:${type}`, stationId: 'station_helios',
        type, count: 3, cycle: 0, seen: [], template: { type, reward_cr: 300 } }],
      captainOrderCycles: {},
    },
    traffic: { captainRoster: [] },
  };
  const board = { slots: [] };
  const info = { id: 'station_helios', name: 'Helios Station', factionId: 'faction_scn' };
  syncCaptainStandingOrders({ state }, info, board);
  const offer = board.slots.find((s) => s.cause?.tag === 'standing_client');
  assert.ok(offer, 'the desk offer syncs');
  assert.match(offer.summary, new RegExp(clientName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ': "'),
    'the desk client signs the line');
  assert.match(offer.summary, /Three runs finished/, 'the earned relationship is the giver\'s words');
  assert.match(offer.summary, /cargo delivery/, 'the run is named');
  assert.doesNotMatch(offer.summary, /Three finished runs earned the next one/, 'the board prose is gone');
});
