// Head money: an ordinary board bounty writ pays the hunter's overhead on top of the wage quote
// (src/data/missions.js BOUNTY_HEAD_MONEY, wired in missions._rollOffer). Pinned here:
//   1. the premium table is a bounded taper (never a discount, never above the band-safe ceiling);
//   2. the re-quote keeps reward and expected-net in agreement and leaves tier/risk alone (D59);
//   3. a rolled board writ carries the premium, the paid number equals the quoted number, and
//      every other type on the same board is quoted exactly as before.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { economy as economySystem } from '../src/systems/economy.js';
import { cargo as cargoSystem } from '../src/systems/cargo.js';
import { ships as shipsSystem } from '../src/systems/ships.js';
import { factions as factionsSystem } from '../src/systems/factions.js';
import { missions as missionsSystem } from '../src/systems/missions.js';
import { quoteMissionEconomics } from '../src/economy/economyMissionTerms.js';
import {
  BOUNTY_HEAD_MONEY,
  MISSION_TUNING,
  bountyHeadMoneyMult,
  withBountyHeadMoney,
} from '../src/data/missions.js';

const SEED = 0x0D59D59;
const REFRESH_S = MISSION_TUNING.refreshSec || 300;

test('head money table is a bounded taper: a premium at the foothold, none at the top', () => {
  const table = BOUNTY_HEAD_MONEY.payMultByTier;
  assert.equal(table.length, 5, 'one entry per bounty pay tier');
  for (const mult of table) assert.ok(mult >= 1 && mult <= 1.3, `premium ${mult} outside 1..1.3`);
  for (let i = 1; i < table.length; i += 1) assert.ok(table[i] <= table[i - 1], 'premium never grows with the wage');
  assert.ok(table[1] > 1, 'the specialist rate carries a premium');
  assert.equal(table[table.length - 1], 1, 'the top rate carries none (D59 runaway lives there)');
  assert.equal(bountyHeadMoneyMult(99), 1, 'a tier past the table reads the last entry');
  assert.equal(bountyHeadMoneyMult(-3), table[0]);
  assert.equal(bountyHeadMoneyMult(Number.NaN), table[0]);
});

test('withBountyHeadMoney re-quotes reward and expected net together and leaves tier and risk alone', () => {
  const terms = quoteMissionEconomics({
    type: 'bounty_hunt', tier: 1, riskTier: 1, distance: 1800, params: { targetStrength: 1.8 },
  });
  const paid = withBountyHeadMoney(terms, terms.tier);
  const mult = bountyHeadMoneyMult(terms.tier);
  assert.equal(paid.headMoneyMult, mult);
  assert.equal(paid.rewardCr, Math.ceil(terms.rewardCr * mult));
  assert.ok(paid.rewardCr > terms.rewardCr);
  assert.equal(paid.tier, terms.tier);
  assert.equal(paid.riskTier, terms.riskTier);
  assert.equal(paid.deadlineS, terms.deadlineS);
  // Expected net still follows E[net] = p*(reward + other) - operating - inputs - failure.
  const expected = paid.successProbability * (paid.rewardCr + paid.otherRevenueCr)
    - paid.operatingCr - paid.suppliedInputsCr - paid.failureLossCr;
  assert.ok(Math.abs(paid.expectedNetCr - expected) < 1e-6, `expectedNetCr ${paid.expectedNetCr} vs ${expected}`);
  assert.ok(paid.expectedNetCrPerHour > terms.expectedNetCrPerHour);
  assert.equal(terms.headMoneyMult, undefined, 'the input quote is never mutated');

  const top = quoteMissionEconomics({
    type: 'bounty_hunt', tier: 4, riskTier: 4, distance: 1800, params: { targetStrength: 3 },
  });
  assert.equal(withBountyHeadMoney(top, top.tier), top, 'no premium returns the quote itself');
  assert.equal(withBountyHeadMoney(null, 1), null);
});

function bootBoards() {
  const sim = createSimulation({
    seed: SEED,
    systems: [economySystem, cargoSystem, shipsSystem, factionsSystem, missionsSystem],
  });
  const state = sim.state;
  state.mode = 'flight';
  state.meta = state.meta || {};
  state.meta.seed = SEED;
  for (const id of ['economy', 'ships', 'factions', 'missions']) {
    const system = sim.registry.get(id);
    if (system && typeof system.newGame === 'function') system.newGame();
  }
  return { sim, state, missions: sim.registry.get('missions') };
}

/** The featured board slot multiplies the advertised reward after pricing; the quote sits under it. */
const quotedReward = (offer) => (offer.featured ? offer.featured.baseRewardCr : offer.reward_cr);

function plainRolled(slot) {
  return Boolean(slot && !slot.source
    && !String(slot.storyTag || '').startsWith('campaign47a:')
    && !String(slot.storyTag || '').startsWith('origin.')
    && !String(slot.id || '').startsWith('offer_sp1_')
    && !String(slot.id || '').startsWith('starter-')
    && slot.economyTerms);
}

test('a rolled board bounty carries head money; the paid number is the quoted number; other types are untouched', () => {
  const ctx = bootBoards();
  const bounties = [];
  const others = [];
  for (let epoch = 0; epoch < 30; epoch += 1) {
    ctx.state.simTime = epoch * REFRESH_S + 1;
    const board = ctx.missions.ensureBoard('station_helios');
    for (const slot of (board && board.slots) || []) {
      if (!plainRolled(slot)) continue;
      (slot.type === 'bounty_hunt' ? bounties : others).push(slot);
    }
  }
  assert.ok(bounties.length > 0, 'helios board rolls a plain bounty within 30 epochs');
  assert.ok(others.length > 0, 'the same boards roll other work');
  for (const offer of bounties) {
    const terms = offer.economyTerms;
    assert.equal(terms.headMoneyMult, bountyHeadMoneyMult(terms.tier), `${offer.id} carries its tier's premium`);
    assert.equal(quotedReward(offer), terms.rewardCr, `${offer.id} advertises the quoted reward`);
  }
  for (const offer of others) {
    assert.equal(offer.economyTerms.headMoneyMult, undefined, `${offer.type} is not a bounty`);
    assert.equal(quotedReward(offer), offer.economyTerms.rewardCr);
  }
});
