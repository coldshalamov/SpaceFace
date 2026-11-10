import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { OFFER_MIX, POSITIONAL_OFFER_TYPES, offerMixWeight } from '../src/data/missions.js';
import { offerMixForTier } from '../src/economy/economyMissionTerms.js';
import { SECTORS } from '../src/data/sectors.js';
import { missions } from '../src/systems/missions.js';
import {
  missionBoardDispatchLabel,
  missionOffersFollowUp,
} from '../src/ui/station/screens/contracts.js';

const SECTOR_ID = 'sector_tethys_junction';
const STATION_ID = 'station_tethys';
const JUNCTION_TYPES = new Set([
  'cargo_delivery', 'bulk_trade', 'escort', 'passenger_transport', 'patrol_clear', 'recon_scan',
]);

function stationDef() {
  return SECTORS.find((sector) => sector.id === SECTOR_ID)?.stations
    ?.find((station) => station.id === STATION_ID);
}

function boardFor(seed, simTime = 0) {
  const sim = createSimulation({ seed, systems: [missions], updateOrder: [] });
  sim.state.simTime = simTime;
  const board = structuredClone(sim.registry.get('missions').ensureBoard(STATION_ID));
  sim.dispose();
  return board;
}

test('Tethys remains a trade hub while declaring junction dispatch identity', () => {
  const station = stationDef();
  assert.ok(station);
  assert.equal(station.type, 'trade_hub');
  assert.equal(station.missionProfile, 'contracts_hub');
  assert.equal(station.boardAnchorType, 'escort');
  assert.equal(station.dispatchConflictKey, 'faction_dmc:faction_mts');
  assert.ok(station.services.includes('missions'));
  assert.match(station.chartNote, /convoy|front/i);

  const mix = OFFER_MIX.contracts_hub;
  assert.equal(mix.length, 10);
  assert.ok(mix[5] > OFFER_MIX.trade_hub[5], 'escort work must be denser than a generic trade hub');
  assert.ok(mix[6] > OFFER_MIX.trade_hub[6], 'patrol work must be denser than a generic trade hub');
  assert.ok(mix[9] > OFFER_MIX.trade_hub[9], 'recon work must be denser than a generic trade hub');

  // The generated mirror must carry every authored column — a dropped column reads as
  // "authored-only" (weight 0) while STATION_WORK still rolls the type. Race is the column
  // the generator once dropped: the junction board runs a lane-endpoint course at share 2.
  for (const profile of Object.keys(OFFER_MIX)) {
    const liveMix = offerMixForTier(profile, 0);
    for (const typeId of [...POSITIONAL_OFFER_TYPES,
      'tow_recovery', 'demolition', 'rescue_under_fire', 'race']) {
      assert.equal(offerMixWeight(OFFER_MIX[profile], typeId), offerMixWeight(liveMix, typeId),
        `${profile}.${typeId}: the mirror must match the table the picker reads`);
    }
  }
});

test('every Tethys epoch leads with a convoy and stays junction-work heavy', () => {
  let junctionOffers = 0;
  let ordinaryOffers = 0;
  let maxWrits = 0;

  for (let seed = 1; seed <= 64; seed++) {
    const board = boardFor(seed, (seed % 7) * 601);
    const ordinary = board.slots.filter((offer) => !offer.source && offer.type !== 'heist_intercept');
    assert.ok(ordinary.length >= 5, `seed ${seed} must keep the large contracts board`);
    assert.equal(ordinary[0]?.type, 'escort', `seed ${seed} must lead with a convoy escort`);
    const writs = ordinary.filter((offer) => offer.type === 'bounty_hunt').length;
    if (writs > maxWrits) maxWrits = writs;
    for (const offer of ordinary) {
      ordinaryOffers += 1;
      if (JUNCTION_TYPES.has(offer.type)) junctionOffers += 1;
    }
  }

  // Authored exceptions share the board: the lane-endpoint race column (STATION_WORK race:2)
  // and the D85 entry-writ pin (at most one guaranteed writ, plus a rare roll). Junction work
  // still dominates the ordinary mix — the bar names dominance, not the pre-exceptions share.
  assert.ok(junctionOffers / ordinaryOffers >= 0.60,
    `junction work must dominate ordinary rolls (${junctionOffers}/${ordinaryOffers})`);
  assert.ok(maxWrits <= 2,
    `the entry-writ pin guarantees one accessible writ, not a writ wall (${maxWrits})`);
  assert.deepEqual(boardFor(4242, 1202), boardFor(4242, 1202));
});

test('default Station OS exposes follow-ups and the live Tethys front without writing it', () => {
  assert.equal(missionOffersFollowUp({ type: 'cargo_delivery' }), true);
  assert.equal(missionOffersFollowUp({ type: 'escort' }), false);
  assert.equal(missionOffersFollowUp({ type: 'heist_intercept' }), false);
  assert.equal(missionBoardDispatchLabel({}, 'station_helios', 4), 'LIVE DISPATCH / SELECT A MISSION');

  const state = {
    conflicts: {
      'faction_dmc:faction_mts': { state: 'war', tension: 87.4 },
    },
  };
  const label = missionBoardDispatchLabel(state, STATION_ID, 6);
  assert.match(label, /^JUNCTION DISPATCH \/ 6 LIVE/);
  assert.match(label, /DMC–MTS FRONT WAR/);
  assert.match(label, /87\/100$/);
  assert.deepEqual(state.conflicts['faction_dmc:faction_mts'], { state: 'war', tension: 87.4 });
});
