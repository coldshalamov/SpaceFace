import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { custodyConsequences } from '../src/systems/custodyConsequences.js';
import { buildEncounterCausality, causalAftermath, causeContractOffer } from '../src/world/encounterCausality.js';
import { kesslerFreightChoice, kesslerFreightReply } from '../src/ui/station/heliosFreightConversation.js';

const STATION = 'station_helios';
const SECTOR = 'sector_helios_prime';
function cause(outcome='robbed', commodityId='cmdty_ore_iron') {
  const c = buildEncounterCausality({ seed: 4242, encounterId: 'raid-one', shapeId: 'opening_hauler_raid', sectorId: SECTOR, zoneId: 'lane' });
  Object.assign(c, { manifestId: 'fm-original', commodityId, totalQty: 7, adoptedWorkingBarge: true });
  return causalAftermath(c, outcome, { tick: 10, t: 5 });
}
function setup(outcome='robbed') {
  const c = cause(outcome);
  const state = { ui: { docked: true, dockedStationId: STATION }, meta: { seed: 4242 }, simTime: 20,
    player: {}, missions: { active: [], boards: { [STATION]: { slots: [] } } },
    aftermathWrecks: { causes: { [c.fingerprint]: c } } };
  const bus = createBus();
  const sys = Object.create(custodyConsequences);
  sys.init({ state, bus, helpers: {} });
  return { c, state, bus, sys };
}

test('Kessler presents the real original-lot recovery posting and follows a partial handback', () => {
  const { c, state, bus, sys } = setup();
  bus.emit('aftermath:custodyFreight', { fingerprint: c.fingerprint, sectorId: SECTOR,
    manifestId: c.manifestId, commodityId: c.commodityId, scatteredQty: 5, forPerson: 'the ore barge' });
  bus.emit('aftermath:custodySurvivor', { fingerprint: c.fingerprint, sectorId: SECTOR, survivorId: 'crew-1' });
  const offers = []; bus.on('mission:offered', offer => offers.push(offer));
  bus.emit('dock:docked', { stationId: STATION });
  assert.equal(offers.length, 1);
  const original = offers[0];
  state.missions.boards[STATION].slots = [original];
  const choice = kesslerFreightChoice(state, STATION);
  assert.ok(choice);
  const before = JSON.stringify(state);
  const reply = kesslerFreightReply(state, STATION, choice.id);
  assert.equal(reply.missionOffer, original, 'the desk surfaces the owner\'s board object');
  assert.match(reply.text, /5u Iron Ore remain unreturned/);
  assert.match(reply.text, /1 survivor still awaiting resolution/);
  assert.equal(JSON.stringify(state), before, 'asking writes no state');

  const mission = { ...original, status: 'active' };
  state.missions.active = [mission];
  assert.match(kesslerFreightReply(state, STATION, choice.id).text, /recovery ticket is open/);
  bus.emit('cargo:delivered', { missionId: mission.id, stationId: STATION, commodityId: c.commodityId, qty: 2 });
  assert.match(kesslerFreightReply(state, STATION, choice.id).text, /3u Iron Ore remain unreturned/);
  state.missions.active = [];
  const remaining = kesslerFreightReply(state, STATION, choice.id);
  assert.equal(remaining.missionOffer, original, 'the existing posting remains work, with its original terms');
  assert.match(remaining.text, /posted for 5u Iron Ore/);
  assert.match(remaining.text, /current outstanding amount is 3u/);
  offers.length = 0; bus.emit('dock:docked', { stationId: STATION });
  state.missions.boards[STATION].slots = [offers[0]];
  assert.equal(kesslerFreightReply(state, STATION, choice.id).missionOffer, offers[0]);
  sys.destroy();
});

test('desk fails closed on stale identity and does not claim a delivery or player credit', () => {
  const { c, state, sys } = setup('defended');
  const choice = kesslerFreightChoice(state, STATION);
  const text = kesslerFreightReply(state, STATION, choice.id).text;
  assert.match(text, /hauler survived/);
  assert.doesNotMatch(text, /you saved|delivered|paid/i);
  const loaded = JSON.parse(JSON.stringify(state));
  assert.equal(kesslerFreightReply(loaded, STATION, choice.id).text, text);
  loaded.ui.docked = false;
  assert.equal(kesslerFreightChoice(loaded, STATION), null);
  assert.equal(kesslerFreightReply(loaded, STATION, choice.id).missionOffer, undefined);
  loaded.ui.docked = true;
  loaded.aftermathWrecks.causes = {};
  assert.equal(kesslerFreightReply(loaded, STATION, choice.id).missionOffer, undefined);
  sys.destroy();
});

test('robbed opening-hauler replacement fallback names recorded ore, without changing generic freight', () => {
  const station = { id: STATION, factionId: 'faction_scn' };
  const ore = causeContractOffer(cause('robbed', 'cmdty_silicate'), station, 4242);
  assert.equal(ore.params.cmdtyId, 'cmdty_silicate');
  const fuel = causeContractOffer(cause('robbed', 'cmdty_fuel_cells'), station, 4242);
  assert.equal(fuel.params.cmdtyId, 'cmdty_fuel_cells');
  const unknown = causeContractOffer(cause('robbed', 'not-a-commodity'), station, 4242);
  assert.equal(unknown, null);
  const other = { ...cause('robbed'), shapeId: 'trader_run' };
  assert.equal(causeContractOffer(other, station, 4242).params.cmdtyId, 'cmdty_fuel_cells');
  assert.notEqual(ore.params.qty, 7, 'the generated replacement order is not presented as an exact loss count');
  assert.match(ore.summary, /not a count of the lost lot/);
});
