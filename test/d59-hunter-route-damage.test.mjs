// D59 regression — the hunter route priced itself out of its healthy band because bounty pay
// escalated with standing and destination risk while every contract completed in a fraction of
// its priced duration (2026-09-26 live fingerprint: 5043-5775 cr/min against the 400 cr/min
// healthy ceiling; standing walked priced wages 10k→48k cr/hr, board rewards reached ~9-16k per
// ~90 s loop, and the priced expectedDurationS of 368-452 s overshot the real loop 4-7x).
// Two levers, pinned separately so neither can silently return:
//   1. Work model: the hunt's priced task work is the approach+fight (taskS 30 at reference
//      strength, scaled by mark strength), not a 150 s siege that re-paid the same loop.
//   2. Pay class: a bounty prices at the boarding board's local rate (board sector tier/danger);
//      standing and the destination's danger escalate the mark (offer.riskTier), never the priced
//      tier/risk the wage is read from.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { economy as economySystem } from '../src/systems/economy.js';
import { cargo as cargoSystem } from '../src/systems/cargo.js';
import { ships as shipsSystem } from '../src/systems/ships.js';
import { factions as factionsSystem } from '../src/systems/factions.js';
import { missions as missionsSystem } from '../src/systems/missions.js';
import { priceProceduralOffer } from '../src/economy/economyMissionTerms.js';
import { ECONOMY_BALANCE } from '../src/data/economyDerived.js';
import { MISSION_TUNING } from '../src/data/missions.js';

const SEED = 0x0D59D59;
const REFRESH_S = MISSION_TUNING.refreshSec || 300;

function isPlainBounty(slot) {
  return Boolean(slot && slot.type === 'bounty_hunt'
    && !String(slot.storyTag || '').startsWith('campaign47a:')
    && !String(slot.storyTag || '').startsWith('origin.')
    && !String(slot.id || '').startsWith('offer_sp1_'));
}

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

/** Scan successive deterministic board epochs at one station; return plain bounty offers. */
function scanBountyOffers(ctx, stationId, fromEpoch, epochs) {
  const found = [];
  for (let e = fromEpoch; e < fromEpoch + epochs; e += 1) {
    ctx.state.simTime = e * REFRESH_S + 1;
    const board = ctx.missions.ensureBoard(stationId);
    for (const slot of (board && board.slots) || []) {
      if (isPlainBounty(slot)) found.push(slot);
    }
    if (found.length) break;
  }
  return found;
}

test('D59 work model: the hunt prices as approach+fight, not a 150 s siege', () => {
  const taskS = ECONOMY_BALANCE.mission.work.bounty_hunt.taskS;
  // Data-grounded kill at reference strength: ~25 s approach + EHP/DPS fight (~8 s floor on the
  // route's combat adapters). The old 150 s taskS priced 4-7x more time than the real loop.
  assert.ok(taskS <= 40, `bounty_hunt taskS ${taskS} re-inflates priced duration vs the real loop`);
});

test('D59 pay class: standing escalates the bounty mark, the board-local rate prices the pay', () => {
  const ctx = bootBoards();
  // Helios Prime board: sector tier 0, danger 0 -> anchored pay tier/risk 1 (the bounty floor).
  const low = scanBountyOffers(ctx, 'station_helios', 0, 12);
  assert.ok(low.length > 0, 'helios board must roll a plain bounty offer within 12 epochs');
  for (const offer of low) {
    assert.equal(offer.economyTerms.riskTier, 1, 'pay risk anchors at the bounty floor');
    assert.equal(offer.economyTerms.tier, 1, 'pay tier anchors at the board-local rate');
  }

  // Standing to the top of the ladder (rep >= 400 -> standingWorkTier 4): the offer's own
  // riskTier (spawn strength) must escalate, while the priced tier/risk stay board-local.
  ctx.state.factions.faction_scn.rep = 500;
  const high = scanBountyOffers(ctx, 'station_helios', 20, 24);
  assert.ok(high.length > 0, 'helios board must roll a plain bounty offer at high standing');
  for (const offer of high) {
    assert.equal(offer.riskTier, 4, 'the mark itself must escalate with standing');
    assert.equal(offer.economyTerms.riskTier, 1,
      `priced risk walked to ${offer.economyTerms.riskTier} with standing (D59 pays the mark, not the rate)`);
    assert.equal(offer.economyTerms.tier, 1,
      `priced tier walked to ${offer.economyTerms.tier} with standing (D59 pays the mark, not the rate)`);
  }
});

test('D59 scope: non-bounty board pricing keeps the sector-max tier walk', () => {
  // The tier pin is additive; every other type must still price at max(sector tiers, risk).
  const quote = priceProceduralOffer({
    type: 'cargo_delivery', info: { sectorTier: 2 }, dest: { sectorTier: 1 },
    riskTier: 2, distance: 1800, params: {},
  });
  assert.equal(quote.tier, 2, 'cargo pricing must keep pricing the sector-max tier');
});
