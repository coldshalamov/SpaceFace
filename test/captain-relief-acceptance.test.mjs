import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { hash32 } from '../src/core/rng.js';
import { SECTORS } from '../src/data/sectors.js';
import { missions } from '../src/systems/missions.js';
import { syncCaptainStandingOrders } from '../src/systems/captainStandingOrders.js';

function fixture() {
  const state = createGameState(4242), bus = createBus();
  state.mode = 'flight';
  state.story = { beatIndex: 7, branch: 'traders', flags: {}, chainProgress: 0 };
  state.world.currentSectorId = 'sector_helios_prime';
  for (const sector of SECTORS) state.world.sectors[sector.id] = { ...sector, owner: sector.factionId };
  state.factions = Object.fromEntries(['faction_scn', 'faction_mts', 'faction_dmc', 'faction_free'].map(id => [id, { rep: 500 }]));
  state.player.cargo.capVolume = 100;
  state.player.cargo.usedVolume = 0;
  const owner = Object.create(missions);
  owner.init({ state, bus, helpers: { hash32, queryRadius: () => [] }, registry: { get: () => null } });
  state.simTime = 1800;
  state.missions.captainOrderCycles = {};
  const row = { id: 'captain:original', name: 'Dessa Venn', alive: true,
    homeStationId: 'station_helios', outcomes: { rescued: 1 }, orderDueAtS: 1800 };
  state.traffic.captainRoster = [row];
  const board = owner.ensureBoard('station_helios');
  const offer = board.slots.find(candidate => candidate.giverId === row.id);
  assert.ok(offer, 'the actual public board posts the earned relief job');
  const events = [];
  for (const name of ['mission:accepted', 'mission:updated', 'toast', 'economy:chargeCredits']) bus.on(name, payload => events.push({ name, payload }));
  return { state, bus, owner, row, board, offer, events };
}

for (const stale of ['dead', 'rotated']) {
  test(`a displayed relief job refuses ${stale} captain terms before cargo, fees or an active instance`, () => {
    const h = fixture();
    if (stale === 'dead') h.row.alive = false;
    else h.state.missions.captainOrderCycles[h.row.id] = { cycle: 1, dueAtS: 2400 };
    const cargo = structuredClone(h.state.player.cargo), credits = h.state.player.credits;
    assert.equal(h.owner.acceptMission(h.offer.id), false);
    assert.deepEqual(h.state.player.cargo, cargo);
    assert.equal(h.state.player.credits, credits);
    assert.deepEqual(h.state.missions.active, []);
    assert.equal(h.board.slots.some(row => row.id === h.offer.id), false);
    assert.equal(h.events.some(event => event.name === 'mission:accepted' || event.name === 'economy:chargeCredits'), false);
    assert.ok(h.events.some(event => event.name === 'toast' && /captain.*(no longer|newer)/i.test(event.payload.text)));
    assert.equal(h.owner.acceptMission(h.offer.id), false, 'a repeated stale click stays inert');
  });
}

test('an already accepted captain contract keeps its sealed freight and recorded terms after death', () => {
  const h = fixture();
  assert.equal(h.owner.acceptMission(h.offer.id), true);
  const before = JSON.stringify(h.state.missions.active), cargo = structuredClone(h.state.player.cargo);
  h.row.alive = false;
  h.state.missions.captainOrderCycles[h.row.id] = { cycle: 1, dueAtS: 2400 };
  syncCaptainStandingOrders(h.owner, { id: 'station_helios' }, h.board);
  assert.equal(JSON.stringify(h.state.missions.active), before);
  assert.deepEqual(h.state.player.cargo, cargo);
  assert.equal(h.state.missions.active.length, 1);
  assert.equal(h.state.missions.active[0].sourceOfferId, h.offer.id);
});

test('roster eviction keeps earned displayed work available without inventing a death', () => {
  const h = fixture();
  h.state.traffic.captainRoster = [];
  assert.equal(h.owner.acceptMission(h.offer.id), true);
  assert.equal(h.state.missions.active.length, 1);
  assert.equal(h.state.missions.active[0].giverId, h.row.id);
});
