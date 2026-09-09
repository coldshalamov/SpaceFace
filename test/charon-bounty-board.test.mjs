import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { OFFER_MIX } from '../src/data/missions.js';
import { SECTORS } from '../src/data/sectors.js';
import { missions } from '../src/systems/missions.js';

const CHARON_ID = 'sector_charon_expanse';
const BOARD_ID = 'station_expanse';
const HUNTER_TYPES = new Set(['bounty_hunt', 'patrol_clear', 'salvage_retrieval']);

function stationDef() {
  return SECTORS.find((sector) => sector.id === CHARON_ID)?.stations
    ?.find((station) => station.id === BOARD_ID);
}

function boardFor(seed, simTime = 0) {
  const sim = createSimulation({ seed, systems: [missions], updateOrder: [] });
  sim.state.simTime = simTime;
  const board = structuredClone(sim.registry.get('missions').ensureBoard(BOARD_ID));
  sim.dispose();
  return board;
}

test('Charon keeps refinery semantics while declaring its hunter exchange', () => {
  const station = stationDef();
  assert.ok(station, 'Charon station must exist on the shipped sector graph');
  assert.equal(station.type, 'refinery', 'commodity, industry, and render identity stay refinery');
  assert.equal(station.missionProfile, 'bounty_board');
  assert.equal(station.boardAnchorType, 'bounty_hunt');
  assert.ok(station.services.includes('missions'));
  assert.ok(station.services.includes('scan_tech'));
  assert.match(station.chartNote, /hunter|writ/i);

  const mix = OFFER_MIX.bounty_board;
  assert.ok(Array.isArray(mix));
  assert.equal(mix.length, 10);
  assert.ok(mix[2] > OFFER_MIX.refinery[2], 'bounties must be favored over an ordinary refinery');
  assert.ok(mix[6] > OFFER_MIX.refinery[6], 'patrols must be favored over an ordinary refinery');
  assert.ok(mix[4] > OFFER_MIX.refinery[4], 'salvage must be favored over an ordinary refinery');
});

test('every Charon board epoch carries a deterministic real bounty and hunter-heavy mix', () => {
  let totalOffers = 0;
  let hunterOffers = 0;

  for (let seed = 1; seed <= 128; seed++) {
    const simTime = (seed % 7) * 601;
    const first = boardFor(seed, simTime);
    const replay = boardFor(seed, simTime);
    assert.deepEqual(replay, first, `seed ${seed} board must be deterministic`);
    assert.ok(first.slots.length >= 3, `seed ${seed} must post a usable board`);
    assert.equal(first.slots[0]?.type, 'bounty_hunt', `seed ${seed} must lead with a bounty`);
    assert.ok(first.slots.some((offer) => offer.type === 'bounty_hunt'));
    for (const offer of first.slots) {
      totalOffers += 1;
      if (HUNTER_TYPES.has(offer.type)) hunterOffers += 1;
    }
  }

  assert.ok(hunterOffers / totalOffers >= 0.7,
    `hunter work must dominate the shipped board mix (${hunterOffers}/${totalOffers})`);
});
