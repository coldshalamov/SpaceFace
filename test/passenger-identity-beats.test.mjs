// A1 "passengers are people": every procedural passenger offer mints a stable person — a name
// and a one-line "why I'm traveling" derived from (seed, offerId), never ambient randomness.
// The board names the fare, they speak when they board (undock), once mid-run (destination
// sector crossing), and the settlement receipt quotes them. The fugitive trap names the person.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { SECTORS } from '../src/data/sectors.js';
import { missions } from '../src/systems/missions.js';
import { attachTrap, moralTrapSystem } from '../src/systems/moralTrap.js';

const SEED = 4242;
const ALL_STATION_IDS = Object.freeze(
  SECTORS.flatMap((s) => (s.stations || []).map((st) => st.id))
    .filter((id) => id !== 'station_helios'),
);

function boot(seed = SEED) {
  const sim = createSimulation({
    seed,
    systems: [missions, moralTrapSystem],
  });
  const { state } = sim;
  state.mode = 'flight';
  state.player.credits = 250000;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    hull: 200, hullMax: 200, radius: 8,
  });
  state.playerId = player.id;
  return { sim, state, player, missionsSys: sim.registry.get('missions') };
}

function boardAt(h, stationId, epoch) {
  h.state.simTime = epoch * 600;
  const board = h.missionsSys.ensureBoard(stationId);
  return (board && Array.isArray(board.slots)) ? board.slots : [];
}

function passengerOffersAt(h, stationId, epoch) {
  return boardAt(h, stationId, epoch).filter((o) => o && o.type === 'passenger_transport');
}

test('seed-4242 boards mint named passengers — distinct, stable, with a why-line', () => {
  const h = boot(SEED);
  const paxes = [];
  for (const stationId of ALL_STATION_IDS) {
    for (let epoch = 0; epoch < 4; epoch += 1) {
      for (const offer of passengerOffersAt(h, stationId, epoch)) {
        const pax = offer.params && offer.params.passenger;
        assert.ok(pax, 'every procedural passenger offer carries a minted identity');
        assert.ok(pax.name && typeof pax.name === 'string' && pax.name.includes(' '),
          `passenger has a full name, got "${pax.name}"`);
        assert.ok(pax.why && pax.why.length > 8, 'the fare has a reason for traveling');
        assert.ok(!offer.brief.includes('Quiet trip, quiet fee'),
          'the generic one-sentence passenger brief is gone');
        paxes.push({ id: offer.id, name: pax.name, why: pax.why, title: offer.title });
      }
    }
  }
  assert.ok(paxes.length >= 5, `the route posts passenger work (${paxes.length} offers)`);
  const uniqueNames = new Set(paxes.map((p) => p.name));
  assert.ok(uniqueNames.size > paxes.length / 2,
    `fares are distinct people (${uniqueNames.size} names across ${paxes.length} offers)`);
  assert.ok(paxes.some((p) => p.title.includes(p.name)),
    'the board row names the passenger');
  // Stability: the same seed + station + epoch reproduces the same person bit-for-bit.
  const again = boot(SEED);
  for (const stationId of ALL_STATION_IDS.slice(0, 3)) {
    const a = passengerOffersAt(h, stationId, 2).map((o) => o.params.passenger);
    const b = passengerOffersAt(again, stationId, 2).map((o) => o.params.passenger);
    assert.deepEqual(b, a, 'the same board reproduces the same passengers');
  }
});

test('an accepted passenger contract carries the person through to the instance', () => {
  const h = boot(SEED);
  let offer = null;
  for (const stationId of ALL_STATION_IDS) {
    for (let epoch = 0; epoch < 6 && !offer; epoch += 1) {
      offer = passengerOffersAt(h, stationId, epoch)[0] || null;
    }
    if (offer) break;
  }
  assert.ok(offer, 'a passenger offer exists on the route');
  assert.equal(h.missionsSys.acceptMission(offer.id), true, 'the contract accepts');
  const mission = h.state.missions.active.find((m) => m && m.sourceOfferId === offer.id);
  assert.ok(mission, 'the accepted offer becomes an active mission');
  assert.deepEqual(mission.params.passenger, offer.params.passenger,
    'the minted person rides the instance (_instanceFromOffer params copy)');
});

test('three beats fire on an undock -> cross -> dock cycle', () => {
  const h = boot(SEED);
  let offer = null;
  for (const stationId of ALL_STATION_IDS) {
    for (let epoch = 0; epoch < 6 && !offer; epoch += 1) {
      offer = passengerOffersAt(h, stationId, epoch)[0] || null;
    }
    if (offer) break;
  }
  assert.ok(offer, 'a passenger offer exists on the route');
  assert.equal(h.missionsSys.acceptMission(offer.id), true);
  const mission = h.state.missions.active.find((m) => m && m.sourceOfferId === offer.id);
  const pax = mission.params.passenger;
  const popups = [];
  h.sim.bus.on('comms:popup', (p) => popups.push(p));

  // Beat 1 — boarding line on undock, once.
  h.sim.bus.emit('dock:undocked', {});
  const board = popups.filter((p) => p.sender === pax.name);
  assert.equal(board.length, 1, 'the passenger speaks once when they board');
  assert.ok(board[0].text.length > 8);
  h.sim.bus.emit('dock:undocked', {});
  assert.equal(popups.filter((p) => p.sender === pax.name).length, 1,
    'a repeated undock does not re-board the passenger');

  // Beat 2 — one mid-run line on the destination-sector crossing.
  h.sim.bus.emit('sector:enter', { sectorId: mission.destSectorId });
  assert.equal(popups.filter((p) => p.sender === pax.name).length, 2,
    'the passenger speaks once mid-run');
  h.state.simTime += 30;
  h.missionsSys.update(0.5, h.state);
  h.sim.bus.emit('sector:enter', { sectorId: mission.destSectorId });
  assert.equal(popups.filter((p) => p.sender === pax.name).length, 2,
    'the mid-run beat fires exactly once across both seams');

  // Beat 3 — the settlement receipt quotes them.
  const beforeDock = popups.length;
  h.sim.bus.emit('dock:docked', { stationId: mission.destStationId });
  const receipt = popups.slice(beforeDock)
    .find((p) => p.text && p.text.includes(pax.name));
  assert.ok(receipt, 'settlement emits a receipt that quotes the fare by name');
  assert.equal(mission.status, 'completed', 'the run settles normally');
});

test('the fugitive reveal is about the named person, not "the passenger"', () => {
  const h = boot(SEED);
  const paxOffers = [];
  for (const stationId of ALL_STATION_IDS) {
    for (let epoch = 0; epoch < 3; epoch += 1) {
      paxOffers.push(...passengerOffersAt(h, stationId, epoch));
    }
  }
  assert.ok(paxOffers.length > 0, 'the route posts passenger work');
  let named = 0;
  for (const offer of paxOffers) {
    // A passenger offer's only fitting trap is passenger_is_fugitive; sweep seeds until the
    // low-probability roll attaches one, then the reveal must carry the minted name.
    for (let seed = 0; seed < 300; seed += 1) {
      const stamped = attachTrap(offer, seed);
      if (!stamped.trap) continue;
      assert.equal(stamped.trap.id, 'passenger_is_fugitive');
      const name = offer.params.passenger.name;
      assert.ok(stamped.trap.revealLine.includes(name),
        `the reveal names ${name}, got: ${stamped.trap.revealLine}`);
      assert.ok(stamped.trap.patrolRevealLine.includes(name),
        'the witnessed reveal names them too');
      assert.ok(stamped.trap.choice.prompt.includes(name),
        'the fork prompt names them');
      named += 1;
      break;
    }
  }
  assert.ok(named > 0, `at least one fugitive reveal fired and named its person (${named})`);
});
