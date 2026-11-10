import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { custodyConsequences } from '../src/systems/custodyConsequences.js';
import { missions } from '../src/systems/missions.js';
import { buildEncounterCausality, causalAftermath } from '../src/world/encounterCausality.js';
import { kesslerFreightChoice, kesslerFreightReply } from '../src/ui/station/heliosFreightConversation.js';

const STATION = 'station_helios', SECTOR = 'sector_helios_prime';
function postedRaid(t) {
  const cause = buildEncounterCausality({ seed: 4242, encounterId: 'raid-one',
    shapeId: 'opening_hauler_raid', sectorId: SECTOR, zoneId: 'lane' });
  Object.assign(cause, { manifestId: 'real-ore', commodityId: 'cmdty_ore_iron', totalQty: 7 });
  const aftermath = causalAftermath(cause, 'hauler_destroyed', { tick: 10, t: 5 });
  const state = { ui: { docked: true, dockedStationId: STATION }, meta: { seed: 4242 }, simTime: 20,
    player: {}, missions: { active: [], receipts: [], boards: { [STATION]: { refreshEpoch: 0, slots: [] } } },
    aftermathWrecks: { causes: { [cause.fingerprint]: aftermath } } };
  const bus = createBus(), custody = Object.create(custodyConsequences);
  custody.init({ state, bus, helpers: {} });
  t.after(() => custody.destroy());
  const boardOwner = Object.create(missions);
  Object.assign(boardOwner, { state, bus, _epoch: () => 0,
    ensureBoard: () => state.missions.boards[STATION] });
  const postingResults = [], transactions = [];
  bus.on('mission:offered', offer => postingResults.push(boardOwner._onExternalBoardOffer(offer)));
  for (const name of ['economy:grantCredits', 'cargo:delivered', 'mission:accepted']) {
    bus.on(name, event => transactions.push([name, event]));
  }
  function spill(qty) { bus.emit('aftermath:custodyFreight', {
    fingerprint: cause.fingerprint, sectorId: SECTOR, manifestId: cause.manifestId,
    commodityId: cause.commodityId, scatteredQty: qty,
  }); }
  spill(3); bus.emit('dock:docked', { stationId: STATION });
  const offer = state.missions.boards[STATION].slots[0];
  spill(7); bus.emit('dock:docked', { stationId: STATION });
  const choice = kesslerFreightChoice(state, STATION);
  const row = state.player.custodyLedger.raidAftermath[`raid:${cause.fingerprint}`];
  return { state, bus, custody, postingResults, transactions, offer, choice, row };
}

test('real cumulative spill 3 -> 7 retains the exact posting with truthful posted/current terms', (t) => {
  const r = postedRaid(t);
  assert.deepEqual(r.postingResults, [true, false], 'real board owner retains one posting');
  assert.equal(r.offer.params.qty, 3);
  assert.equal(r.row.lines[0].qty, 7);
  const before = JSON.stringify(r.state);
  const reply = kesslerFreightReply(r.state, STATION, r.choice.id);
  assert.equal(reply.missionOffer, r.offer);
  assert.match(reply.text, /posted for 3u Iron Ore/);
  assert.match(reply.text, /current outstanding amount is 7u/);
  assert.match(reply.text, /partial returns are accepted/);
  assert.equal(JSON.stringify(r.state), before);
  assert.deepEqual(r.transactions, []);
  assert.equal(r.state.missions.boards[STATION].slots.length, 1);

  const resumed = JSON.parse(JSON.stringify(r.state));
  assert.equal(kesslerFreightReply(resumed, STATION, r.choice.id).missionOffer,
    resumed.missions.boards[STATION].slots[0]);
  assert.equal(kesslerFreightReply(resumed, STATION, r.choice.id).text, reply.text);

  // Accepting/delivery remains the custody owner's business, not the conversation's.
  const mission = { ...structuredClone(r.offer), id: 'accepted-recovery', sourceOfferId: r.offer.id, status: 'active' };
  r.state.missions.active = [mission];
  assert.equal(kesslerFreightReply(r.state, STATION, r.choice.id).missionOffer, undefined);
  assert.match(kesslerFreightReply(r.state, STATION, r.choice.id).text, /recovery ticket is open/);
  assert.equal(r.custody.prepareRecoveryDelivery(mission), true);
  assert.equal(mission.params.qty, 7);
  r.bus.emit('cargo:delivered', { missionId: mission.id, stationId: STATION,
    commodityId: 'cmdty_ore_iron', qty: 2 });
  assert.equal(r.row.lines[0].returnedQty, 2);
  assert.match(kesslerFreightReply(r.state, STATION, r.choice.id).text, /5u Iron Ore remain unreturned/);
  r.state.missions.active = [];
  r.state.missions.receipts = [{ source: 'custodyRecovery', sourceOfferId: r.offer.id, outcome: 'completed' }];
  assert.equal(kesslerFreightReply(r.state, STATION, r.choice.id).missionOffer, undefined,
    'a consumed posting cannot be offered again even if a stale board copy survives');
  r.state.missions.boards[STATION].slots = [];
  r.bus.emit('dock:docked', { stationId: STATION });
  const next = r.state.missions.boards[STATION].slots[0];
  assert.notEqual(next.id, r.offer.id);
  assert.equal(next.params.qty, 5);
  assert.equal(kesslerFreightReply(r.state, STATION, r.choice.id).missionOffer, next);
  r.row.lines[0].returnedQty = 7;
  r.row.status = 'settled';
  assert.equal(kesslerFreightReply(r.state, STATION, r.choice.id).missionOffer, undefined);
  assert.match(kesslerFreightReply(r.state, STATION, r.choice.id).text, /recorded freight has been returned/);
});

test('foreign, ambiguous, malformed or retired ticket identities never become a Kessler handoff', (t) => {
  const r = postedRaid(t), pristine = JSON.stringify(r.state);
  const mutations = [
    state => { state.missions.boards[STATION].slots[0].cause.fingerprint = 'raid:another'; },
    state => { state.missions.boards[STATION].slots[0].cause.manifestId = 'another-lot'; },
    state => { state.missions.boards[STATION].slots[0].cause.tag = 'restitution'; },
    state => { state.missions.boards[STATION].slots[0].params.cmdtyId = 'cmdty_fuel_cells'; },
    state => { state.missions.boards[STATION].slots[0].stationId = 'station_tethys'; },
    state => { state.missions.boards[STATION].slots[0].destSectorId = 'sector_ceres_belt'; },
    state => { state.missions.boards[STATION].slots[0].type = 'salvage_retrieval'; },
    state => { state.missions.boards[STATION].slots[0].params.qty = 0; },
    state => { state.missions.boards[STATION].slots.push({ ...state.missions.boards[STATION].slots[0], id: 'duplicate' }); },
    state => { state.missions.receipts.push({ source: 'custodyRecovery', sourceOfferId: r.offer.id, outcome: 'completed' }); },
    state => { const row = Object.values(state.player.custodyLedger.raidAftermath)[0]; row.lines.push({ ...row.lines[0] }); },
  ];
  for (const mutate of mutations) {
    const state = JSON.parse(pristine); mutate(state);
    const before = JSON.stringify(state);
    assert.equal(kesslerFreightReply(state, STATION, r.choice.id).missionOffer, undefined);
    assert.equal(JSON.stringify(state), before);
  }
  assert.equal(kesslerFreightReply(r.state, STATION, 'helios_freight:stale-cause').missionOffer, undefined);
});
