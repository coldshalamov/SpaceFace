// Moral traps go live: generation-time attach on ordinary boards, the trap riding the
// accepted instance, and the mid-run reveal resolving through shipped consequence channels.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { MORAL_TRAPS, TRAP_IDS, trapFitsOfferType } from '../src/data/moralTraps.js';
import { SECTORS } from '../src/data/sectors.js';
import { missions } from '../src/systems/missions.js';
import { attachTrap, moralTrapSystem } from '../src/systems/moralTrap.js';

const SEED = 4242;
const NON_HELIOS_STATIONS = Object.freeze([
  'station_beltout',
  'station_forge',
  'station_veil',
  'station_smuggler',
  'station_coalition',
  'station_tethys',
]);
const HELIOS_TRAP_IDS = new Set(['cargo_is_weapons', 'passenger_is_fugitive']);

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

test('ordinary boards carry seeded traps — present, rare, and type-fitted', () => {
  let offers = 0;
  let trapped = 0;
  const seenTrapIds = new Set();
  for (const stationId of NON_HELIOS_STATIONS) {
    for (let epoch = 0; epoch < 16; epoch += 1) {
      const h = boot(SEED);
      for (const offer of boardAt(h, stationId, epoch)) {
        offers += 1;
        if (!offer || !offer.trap) continue;
        trapped += 1;
        seenTrapIds.add(offer.trap.id);
        const trap = MORAL_TRAPS[offer.trap.id];
        assert.ok(trap, `trap id ${offer.trap.id} must be authored`);
        assert.ok(trapFitsOfferType(trap, offer.type),
          `${offer.trap.id} must fit offer type ${offer.type}`);
        assert.ok(!offer.source && !offer.storyTag,
          'procedural traps never ride authored or contract offers');
      }
    }
  }
  assert.ok(trapped > 0, 'no trap attached across 96 non-Helios boards');
  assert.ok(seenTrapIds.size >= 2, 'more than one trap kind reaches the board');
  assert.ok(trapped / offers < 0.5, `traps stay a treat (${trapped}/${offers})`);
});

test('Helios keeps exactly its authored teaching trap — never a procedural second lie', () => {
  const h = boot(SEED);
  const trapped = [];
  for (let epoch = 0; epoch < 8; epoch += 1) {
    for (const offer of boardAt(h, 'station_helios', epoch)) {
      if (offer && offer.trap) trapped.push(offer);
    }
    const perBoard = boardAt(h, 'station_helios', epoch).filter((o) => o && o.trap);
    assert.ok(perBoard.length <= 1, 'Helios boards carry at most one trap');
  }
  assert.ok(trapped.length > 0, 'Helios boards must actually seed the authored trap');
  for (const offer of trapped) {
    assert.ok(HELIOS_TRAP_IDS.has(offer.trap.id),
      `Helios trap must be the authored beat, got ${offer.trap.id}`);
  }
});

test('a trapped offer accepted carries its trap into the active instance', () => {
  const h = boot(SEED);
  let trappedOffer = null;
  for (const stationId of NON_HELIOS_STATIONS) {
    for (let epoch = 0; epoch < 16 && !trappedOffer; epoch += 1) {
      trappedOffer = boardAt(h, stationId, epoch).find((o) => o && o.trap) || null;
      if (trappedOffer) break;
    }
    if (trappedOffer) break;
  }
  assert.ok(trappedOffer, 'a trapped offer must exist somewhere on the route');
  assert.equal(h.missionsSys.acceptMission(trappedOffer.id), true, 'the trapped offer accepts');
  const mission = h.state.missions.active
    .find((m) => m && m.sourceOfferId === trappedOffer.id);
  assert.ok(mission, 'the accepted offer becomes an active mission');
  assert.equal(mission.trap.id, trappedOffer.trap.id,
    'the trap rides the instance — the mid-run reveal can find it');
});

test('the reveal fires once mid-run and the choice resolves through shipped channels', () => {
  const h = boot(SEED);
  const events = [];
  for (const name of ['moralTrap:revealed', 'moralTrap:resolved', 'faction:repDelta', 'economy:grantCredits', 'mission:abandon']) {
    h.sim.bus.on(name, (p) => events.push({ evt: name, p }));
  }
  const mission = {
    id: 'm_trap_probe', type: 'cargo_delivery', stationId: 'station_forge',
    status: 'active', reward_cr: 900, params: {},
    trap: MORAL_TRAPS.ore_is_mass_grave,
  };
  h.state.missions.active.push(mission);
  h.sim.bus.emit('sector:enter', { sectorId: 'sector_vesta_forge' });
  assert.equal(mission._trapRevealed, true);
  assert.equal(events.filter((e) => e.evt === 'moralTrap:revealed').length, 1);
  h.sim.bus.emit('sector:enter', { sectorId: 'sector_vesta_forge' });
  assert.equal(events.filter((e) => e.evt === 'moralTrap:revealed').length, 1,
    'the reveal fires exactly once');

  // 'reweigh' is a settle:'end' option — rep lands, then the contract breaks through missions'
  // own abandon path (no parallel teardown, no double-dip on a second choose event).
  h.sim.bus.emit('moralTrap:choose', { missionId: mission.id, optionId: 'reweigh' });
  const repDelta = events.find((e) => e.evt === 'faction:repDelta');
  assert.ok(repDelta, 'the reweigh choice emits a rep consequence');
  assert.equal(repDelta.p.factionId, 'faction_dmc');
  assert.equal(repDelta.p.delta, 16);
  assert.ok(events.some((e) => e.evt === 'mission:abandon' && e.p.missionId === mission.id),
    'an end-fork choice settles the contract through mission:abandon');
  assert.equal(mission._trapResolved, true);
  const repCount = events.filter((e) => e.evt === 'faction:repDelta').length;
  h.sim.bus.emit('moralTrap:choose', { missionId: mission.id, optionId: 'reweigh' });
  assert.equal(events.filter((e) => e.evt === 'faction:repDelta').length, repCount,
    'a duplicated choose event cannot re-apply the consequence');
});

test('a continue-fork choice marks rep now, pays at settlement, and keeps the run', () => {
  const h = boot(SEED);
  const events = [];
  for (const name of ['faction:repDelta', 'economy:grantCredits', 'mission:abandon', 'moralTrap:resolved']) {
    h.sim.bus.on(name, (p) => events.push({ evt: name, p }));
  }
  const mission = {
    id: 'm_trap_honor', type: 'cargo_delivery', stationId: 'station_forge',
    status: 'active', reward_cr: 900, params: {},
    trap: MORAL_TRAPS.cargo_is_weapons,
  };
  h.state.missions.active.push(mission);
  h.sim.bus.emit('moralTrap:choose', { missionId: mission.id, optionId: 'deliver' });
  const repDelta = events.find((e) => e.evt === 'faction:repDelta');
  assert.ok(repDelta, "the 'deliver' choice marks the faction that noticed");
  assert.equal(repDelta.p.factionId, 'faction_quiet');
  assert.equal(events.filter((e) => e.evt === 'economy:grantCredits').length, 0,
    'continue-fork pay arrives at contract settlement, never as a double upfront grant');
  assert.equal(events.filter((e) => e.evt === 'mission:abandon').length, 0,
    'the honor fork keeps the contract running');
  assert.equal(mission.status, 'active');
  assert.equal(mission._trapResolved, true);
});

test('an end-fork bounty choice pays once and ends the contract', () => {
  const h = boot(SEED);
  const events = [];
  for (const name of ['faction:repDelta', 'economy:grantCredits', 'mission:abandon']) {
    h.sim.bus.on(name, (p) => events.push({ evt: name, p }));
  }
  const mission = {
    id: 'm_trap_bounty', type: 'passenger_transport', stationId: 'station_forge',
    status: 'active', reward_cr: 1200, params: {},
    trap: MORAL_TRAPS.passenger_is_fugitive,
  };
  h.state.missions.active.push(mission);
  h.sim.bus.emit('moralTrap:choose', { missionId: mission.id, optionId: 'turn_in' });
  const grant = events.find((e) => e.evt === 'economy:grantCredits');
  assert.ok(grant, 'turn_in pays the bounty now');
  assert.equal(grant.p.amount, 1800, 'the bounty is 1.5x the contract reward');
  const repDelta = events.find((e) => e.evt === 'faction:repDelta');
  assert.equal(repDelta.p.delta, -15, 'the Frontier remembers the name');
  assert.ok(events.some((e) => e.evt === 'mission:abandon' && e.p.missionId === mission.id),
    'the contract ends — the passenger is gone');
});

test('same seed and epoch reproduce the same board trap ids', () => {
  const a = boot(SEED);
  const b = boot(SEED);
  const trapsOf = (h) => boardAt(h, 'station_forge', 3)
    .filter((o) => o && o.trap).map((o) => `${o.id}:${o.trap.id}`);
  assert.deepEqual(trapsOf(a), trapsOf(b));
});

test('attachTrap guards: helios, story, and already-trapped offers pass through unchanged', () => {
  const base = { id: 'o1', type: 'cargo_delivery', stationId: 'station_helios' };
  assert.equal(attachTrap(base, 1), base);
  const story = { id: 'o2', type: 'cargo_delivery', source: 'careerContract' };
  assert.equal(attachTrap(story, 1), story);
  const trapped = { id: 'o3', type: 'cargo_delivery', trap: { id: 'air_is_owed' } };
  assert.equal(attachTrap(trapped, 1), trapped);
});

test('expired missions do not reveal', () => {
  const h = boot(SEED);
  const mission = {
    id: 'm_dead', type: 'cargo_delivery', stationId: 'station_forge',
    status: 'failed', reward_cr: 900, params: {},
    trap: MORAL_TRAPS.air_is_owed,
  };
  h.state.missions.active.push(mission);
  let revealed = 0;
  h.sim.bus.on('moralTrap:revealed', () => { revealed += 1; });
  h.sim.bus.emit('sector:enter', { sectorId: 'sector_vesta_forge' });
  assert.equal(revealed, 0);
  assert.equal(mission._trapRevealed, undefined);
});
