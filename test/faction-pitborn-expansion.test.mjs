// faction-pitborn-expansion — the digging economy added to src/systems/faction_pitborn.js.
//
// Proves the book end to end on the real system and the real events:
//   · claim stakes: deeds bought, leases expiring, financed claims on tick; the
//     stake is a real body bound by id + occupantGeneration
//   · extraction quotas: orders post, fills pay the purse + glut bonus, misses
//     file strikes that close the book
//   · pit-debt: vig per missed period, the Tally Crew fields hulls that levy on
//     contact, foreclosure clamps the claim, writeoff blacklists
//   · drill shares: buy at the heat-marked price, dividend on each settled order,
//     sell back under the yard's cut
//   · claim market: yard listings sell, player deeds resell on a delay
//   · sabotage suspicion: jumped drills, burned stakes, dead miners and cooled
//     collectors file records that warn, fine, then blacklist
//   · save-safe + once-only: JSON round-trips keep stamps; money never moves twice
//
// Run: node --test test/faction-pitborn-expansion.test.mjs

import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import {
  pitbornCull,
  ensurePitbornState,
  pitbornBoard,
  pitbornClaimAt,
  pitbornStanding,
  pitbornSharePrice,
  pitbornTierFor,
  PITBORN_CLAIM_STAKES,
  PITBORN_CLAIM_MARKET,
  PITBORN_QUOTA,
  PITBORN_DEBT,
  PITBORN_SHARES,
  PITBORN_SUSPICION,
  PITBORN_YARD_TIERS,
} from '../src/systems/faction_pitborn.js';

const SEED = 4242;
const tick = (s) => Math.ceil(s * 60);

function boot({ credits = 50000 } = {}) {
  const bus = createBus();
  const sim = createSimulation({ seed: SEED, bus, systems: [pitbornCull] });
  const { state } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_ashfall_reach';
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 60000, z: 60000 }, radius: 12, mass: 24,
    hull: 100, hullMax: 100, collides: true,
  });
  state.playerId = player.id;
  state.player.credits = credits;
  const events = { charges: [], grants: [], reps: [], logs: [] };
  bus.on('economy:chargeCredits', (p) => {
    if (!p) return;
    const a = Math.round(p.amount || 0);
    state.player.credits = Math.max(0, Math.round(state.player.credits - a));
    events.charges.push(p);
  });
  bus.on('economy:grantCredits', (p) => {
    if (!p) return;
    state.player.credits = Math.round(state.player.credits + Math.round(p.amount || 0));
    events.grants.push(p);
  });
  bus.on('faction:repDelta', (p) => events.reps.push(p));
  bus.on('comms:log', (p) => events.logs.push(p));
  // The yard files its own rings and listings on a jittered clock; tests pin those
  // clocks far out and drive postings explicitly where they want them.
  const quietYard = () => {
    const pit = ensurePitbornState(state);
    pit.nextClaimPostAt = 1e12;
    pit.nextMarketPostAt = 1e12;
  };
  const spawnRock = (x, z, oreHP = 300, radius = 20) => sim.spawn({
    type: 'asteroid', team: 0, pos: { x, z }, radius, mass: 400,
    hull: oreHP, hullMax: oreHP, collides: true, data: { oreHP },
  });
  return { sim, state, bus, player, events, quietYard, spawnRock };
}

const granted = (events, prefix) =>
  events.grants.filter((g) => String(g.reason || '').startsWith(prefix));
const charged = (events, prefix) =>
  events.charges.filter((c) => String(c.reason || '').startsWith(prefix));
const repTotal = (events, prefix) =>
  events.reps.filter((r) => String(r.reason || '').startsWith(prefix))
    .reduce((a, r) => a + r.delta, 0);

// ── 1. Claim stakes ────────────────────────────────────────────────────────────

test('the book: a deed charges once, plants a bound stake, and reads back', () => {
  const { sim, state, events, quietYard } = boot();
  try {
    quietYard();
    const sys = sim.registry.get('pitbornCull');
    const pit = ensurePitbornState(state);

    const filed = [];
    sim.bus.on('pitborn:claimFiled', (p) => filed.push(p));
    const claim = sys.fileClaim(state, { x: 5000, z: 5000 });
    assert.ok(claim && claim.state === 'open', 'the deed files open');
    assert.equal(claim.kind, 'deed');
    assert.equal(claim.ownerId, 'player');
    assert.equal(charged(events, 'pitborn_claim:').length, 1, 'one charge, one filing');
    assert.equal(charged(events, 'pitborn_claim:')[0].amount, PITBORN_CLAIM_STAKES.deedCostCr);
    assert.equal(filed.length, 1);
    assert.equal(repTotal(events, 'pitborn_claim_filed'), PITBORN_CLAIM_STAKES.repFiled);

    // The stake is a real body bound by id + generation + the claim marker.
    const stake = state.entities.get(claim.markerId);
    assert.ok(stake && stake.alive !== false, 'the stake is a live body');
    assert.equal(stake.data.pitbornStake, true);
    assert.equal(stake.data.pitbornClaimId, claim.id);
    assert.equal(claim.markerGen, stake.occupantGeneration);
    assert.ok(pitbornClaimAt(state, 5000, 5000) === claim, 'the ring answers the lookup');

    // Rings do not overlap; a broke pilot gets a refusal, not a bill.
    const before = state.player.credits;
    assert.equal(sys.fileClaim(state, { x: 5100, z: 5000 }), null, 'overlapping rings refuse');
    assert.equal(state.player.credits, before, 'a refused filing burns nothing');
    state.player.credits = 10;
    assert.equal(sys.fileClaim(state, { x: 20000, z: 20000 }), null, 'no credits, no deed');
    assert.equal(state.player.credits, 10);
    state.player.credits = 50000;

    // The board shows the whole book.
    const board = pitbornBoard(state);
    assert.ok(board.claims.some((c) => c.id === claim.id));
    assert.equal(board.standing.tier, 0);
    assert.ok(pit.claims.length <= PITBORN_CLAIM_STAKES.maxClaims);
  } finally {
    sim.dispose();
  }
});

test('a lease lapses on the yard clock and the stake goes with it', () => {
  const { sim, state, events, quietYard } = boot();
  try {
    quietYard();
    const sys = sim.registry.get('pitbornCull');
    const lapsed = [];
    sim.bus.on('pitborn:claimLapsed', (p) => lapsed.push(p));

    const claim = sys.leaseClaim(state, { x: 9000, z: 9000 });
    assert.ok(claim && claim.kind === 'lease');
    assert.equal(charged(events, 'pitborn_claim:')[0].amount, PITBORN_CLAIM_STAKES.leaseCostCr);
    assert.ok(claim.expiresAt > state.simTime);
    const stakeId = claim.markerId;

    sim.runTicks(tick(PITBORN_CLAIM_STAKES.leaseTermS) + 10);
    assert.equal(claim.state, 'expired', 'the ring goes back to the belt');
    assert.equal(claim.markerId, null);
    const stake = state.entities.get(stakeId);
    assert.ok(!stake || stake.alive === false, 'the stake dies with the filing');
    assert.equal(lapsed.filter((l) => l.claimId === claim.id && l.cause === 'expired').length, 1);
  } finally {
    sim.dispose();
  }
});

// ── 2. Extraction quotas ───────────────────────────────────────────────────────

test('the pit order posts, a wild-rock fill pays purse + rep, and dividends only fire once', () => {
  const { sim, state, bus, events, quietYard, spawnRock } = boot();
  try {
    quietYard();
    const sys = sim.registry.get('pitbornCull');
    const pit = ensurePitbornState(state);
    const settled = [];
    bus.on('pitborn:quotaSettled', (p) => settled.push(p));
    bus.on('pitborn:dividend', (p) => settled.push({ dividend: p }));

    sim.runTicks(tick(PITBORN_QUOTA.firstPostS) + 10);
    assert.ok(pit.quota && pit.quota.state === 'open', 'the order posts on the beat');
    const want = pit.quota.wantUnits;
    assert.ok(want >= PITBORN_QUOTA.baseUnits);

    // Wild rock: half credit. Feed exactly the order.
    const rock = spawnRock(30000, 30000, 500);
    bus.emit('drill:end', { asteroidId: rock.id, yieldUnits: want * 2 });
    assert.equal(pit.quota.gotUnits, want, 'wild extraction counts half');
    assert.equal(pit.extractedTotal, want);

    pit.quota.dueAt = state.simTime + 0.5;
    sim.runTicks(60);
    const bell = settled.find((s) => s.quotaId);
    assert.ok(bell && bell.met === true, 'a full hold settles met');
    const purse = granted(events, 'pitborn_quota:');
    assert.equal(purse.length, 1, 'the purse lands once');
    assert.ok(purse[0].amount >= PITBORN_QUOTA.basePayCr + want * PITBORN_QUOTA.payPerUnitCr);
    assert.equal(repTotal(events, 'pitborn_quota_met'), PITBORN_QUOTA.repMet);
    assert.equal(pit.quota, null, 'the settled order leaves the board');
    assert.equal(pit.quotaLog.length, 1);
  } finally {
    sim.dispose();
  }
});

test('a missed order files a strike and suspicion; three strikes close the book', () => {
  const { sim, state, bus, events, quietYard } = boot();
  try {
    quietYard();
    const sys = sim.registry.get('pitbornCull');
    const pit = ensurePitbornState(state);
    bus.emit('drill:end', { asteroidId: null, yieldUnits: 0 }); // no-op sanity

    for (let i = 0; i < PITBORN_QUOTA.maxStrikes; i++) {
      sim.runTicks(tick(PITBORN_QUOTA.firstPostS) + 10);
      pit.nextQuotaAt = state.simTime; // the next order posts on the next beat
      sim.runTicks(2);
      assert.ok(pit.quota && pit.quota.state === 'open', `order ${i + 1} posts`);
      pit.quota.dueAt = state.simTime; // starve it — the bell rings now
      sim.runTicks(2);
      assert.equal(pit.strikes, i + 1);
    }
    assert.ok(pit.blacklistedUntil > state.simTime, 'three strikes close the book');
    assert.equal(repTotal(events, 'pitborn_quota_missed'), PITBORN_QUOTA.repMissed * 3);
    assert.ok(repTotal(events, 'pitborn_blacklist') <= PITBORN_SUSPICION.blacklistRep);
    assert.ok(pit.suspicionLog.some((r) => r.kind === 'quota_strike'));

    // The pit stops offering work; filings refuse.
    const before = state.player.credits;
    sim.runTicks(tick(PITBORN_QUOTA.periodS));
    assert.equal(pit.quota, null, 'no order posts while the book is closed');
    assert.equal(sys.fileClaim(state, { x: 40000, z: 40000 }), null);
    assert.equal(state.player.credits, before, 'a refused filing burns nothing');
  } finally {
    sim.dispose();
  }
});

// ── 3. Pit-debt and the Tally Crew ─────────────────────────────────────────────

test('a claim on tick posts a note; early settlement pays the discount once', () => {
  const { sim, state, events, quietYard } = boot();
  try {
    quietYard();
    const sys = sim.registry.get('pitbornCull');
    const pit = ensurePitbornState(state);
    const posted = [], settled = [];
    sim.bus.on('pitborn:debtPosted', (p) => posted.push(p));
    sim.bus.on('pitborn:debtSettled', (p) => settled.push(p));

    const claim = sys.fileClaimOnTick(state, { x: 15000, z: 15000 });
    assert.ok(claim && claim.financed === true, 'the deed rides the book');
    assert.equal(posted.length, 1);
    const debt = pit.debt;
    assert.ok(debt && debt.state === 'open');
    assert.equal(debt.principal, PITBORN_CLAIM_STAKES.deedCostCr);
    assert.equal(debt.claimId, claim.id);

    // One note at a time.
    assert.equal(sys.fileClaimOnTick(state, { x: 30000, z: 30000 }), null);

    // Early: pay ceil(balance * earlyDiscount), the discount clears with it.
    const due = Math.ceil(debt.balance * PITBORN_DEBT.earlyDiscount);
    const paid = sys.payDebt(state);
    assert.equal(paid, due);
    assert.equal(debt.state === 'open', false);
    assert.equal(settled.length, 1);
    assert.equal(settled[0].how, 'early');
    assert.equal(repTotal(events, 'pitborn_debt_paid'), PITBORN_DEBT.repPaid);
    assert.equal(pit.debt, null, 'the settled note leaves the ledger');
    assert.equal(pit.debtLog.length, 1);
  } finally {
    sim.dispose();
  }
});

test('missed beats grow vig once each and the Tally Crew levies on contact', () => {
  const { sim, state, bus, events, quietYard } = boot();
  try {
    quietYard();
    const sys = sim.registry.get('pitbornCull');
    const pit = ensurePitbornState(state);
    const escalated = [], levies = [], settled = [];
    bus.on('pitborn:debtEscalated', (p) => escalated.push(p));
    bus.on('pitborn:collectorsOut', (p) => escalated.push({ out: p }));
    bus.on('pitborn:levyCollected', (p) => levies.push(p));
    bus.on('pitborn:debtSettled', (p) => settled.push(p));

    const claim = sys.fileClaimOnTick(state, { x: 25000, z: 25000 });
    const debt = pit.debt;
    debt.dueAt = state.simTime - 1; // one beat overdue right now
    const balance0 = debt.balance;
    sim.runTicks(5);
    assert.equal(debt.missed, 1, 'one crossed beat, one vig');
    assert.equal(debt.balance, Math.round(balance0 + debt.principal * PITBORN_DEBT.vigPerPeriod));
    assert.equal(debt.stage, 1);
    sim.runTicks(5);
    assert.equal(debt.missed, 1, 'the same beat never bills twice');

    // The crew is out — hulls tagged to the note, generation-bound.
    assert.ok(pit.collectors.length >= 1, 'the Tally Crew flies');
    for (const row of pit.collectors) {
      const e = state.entities.get(row.entityId);
      assert.ok(e && e.data.pitbornCollector === true && e.data.pitbornDebtId === debt.id);
      assert.equal(row.gen, e.occupantGeneration, 'the row is bound to this occupant');
    }

    // Contact levies the note down, on a beat — never free money.
    const collector = state.entities.get(pit.collectors[0].entityId);
    collector.pos.x = state.entities.get(state.playerId).pos.x + 40;
    collector.pos.z = state.entities.get(state.playerId).pos.z;
    sim.runTicks(tick(PITBORN_DEBT.collectBeatS) + 4);
    assert.ok(levies.length >= 1, 'contact levies');
    assert.ok(levies[0].amount <= Math.ceil(debt.principal * PITBORN_DEBT.levyFraction));
    assert.equal(levies[0].amount, charged(events, 'pitborn_levy:')[0].amount);

    // Force the rest down and the crew is recalled.
    debt.balance = 1;
    sim.runTicks(tick(PITBORN_DEBT.collectBeatS) + 10);
    assert.ok(settled.some((s) => s.how === 'collected'), 'the levy settles the note');
    assert.equal(pit.collectors.length, 0, 'the crew is recalled');
    const corpse = state.entities.get(collector.id);
    assert.ok(!corpse || corpse.alive === false, 'collector hulls despawn on settle');
    assert.ok(claim.state === 'open', 'a paid note keeps the claim');
  } finally {
    sim.dispose();
  }
});

test('overdue long enough clamps the claim; longer still writes the pilot off', () => {
  const { sim, state, bus, events, quietYard } = boot();
  try {
    quietYard();
    const sys = sim.registry.get('pitbornCull');
    const pit = ensurePitbornState(state);
    const foreclosed = [], written = [];
    bus.on('pitborn:claimForeclosed', (p) => foreclosed.push(p));
    bus.on('pitborn:debtWrittenOff', (p) => written.push(p));

    const claim = sys.fileClaimOnTick(state, { x: 35000, z: 35000 });
    const debt = pit.debt;
    state.player.credits = 0; // an empty hold pays no levy — the note stays open
    debt.dueAt = state.simTime - 1;
    sim.runTicks(5);
    assert.equal(debt.stage, 1, 'the crew flies first');

    // Clamp: overdue past clampAfterS takes the financed ring back. The first
    // miss was stamped near epoch, so the honest clock carries it.
    sim.runTicks(tick(PITBORN_DEBT.clampAfterS) + 20);
    assert.equal(debt.stage, 2);
    assert.equal(claim.state, 'foreclosed', 'the welcher loses the ring');
    assert.equal(foreclosed.length, 1);
    assert.equal(repTotal(events, 'pitborn_claim_foreclosed'), PITBORN_DEBT.repForeclosed);

    // Writeoff: the book closes and the blacklist opens.
    sim.runTicks(tick(PITBORN_DEBT.writeoffAfterS - PITBORN_DEBT.clampAfterS) + 20);
    assert.equal(written.length, 1);
    assert.equal(repTotal(events, 'pitborn_debt_written_off'), PITBORN_DEBT.repWrittenOff);
    assert.ok(pit.blacklistedUntil > state.simTime);
    assert.equal(sys.fileClaim(state, { x: 45000, z: 45000 }), null, 'the book is closed to you');
  } finally {
    sim.dispose();
  }
});

// ── 4. Drill shares ────────────────────────────────────────────────────────────

test('drill shares: buy at marked price, the bell pays a dividend once, sell under par', () => {
  const { sim, state, bus, events, quietYard, spawnRock } = boot();
  try {
    quietYard();
    const sys = sim.registry.get('pitbornCull');
    const pit = ensurePitbornState(state);
    const dividends = [];
    bus.on('pitborn:dividend', (p) => dividends.push(p));

    const price = pitbornSharePrice(state);
    const share = sys.buyShare(state);
    assert.ok(share && share.price === price);
    assert.equal(charged(events, 'pitborn_share_buy')[0].amount, price);
    assert.equal(pit.shares.length, 1);
    assert.equal(repTotal(events, 'pitborn_share'), 0, 'paper is not a rep move');

    // Settle a full order — the bell pays the paper.
    sim.runTicks(tick(PITBORN_QUOTA.firstPostS) + 10);
    const rock = spawnRock(30000, 30000, 500);
    bus.emit('drill:end', { asteroidId: rock.id, yieldUnits: pit.quota.wantUnits * 2 });
    pit.quota.dueAt = state.simTime + 0.5;
    sim.runTicks(60);
    assert.equal(dividends.length, 1, 'one bell, one dividend');
    assert.equal(dividends[0].shares, 1);
    const divGrant = granted(events, 'pitborn_dividend:');
    assert.equal(divGrant.length, 1, 'the dividend grant lands once');
    assert.equal(divGrant[0].amount, dividends[0].totalCr);
    assert.ok(divGrant[0].amount <= PITBORN_SHARES.dividendCapCr);

    // A replayed settle cannot re-pay: restore the book and tick again.
    state.pitborn = JSON.parse(JSON.stringify(state.pitborn));
    sim.runTicks(120);
    assert.equal(dividends.length, 1, 'the same bell never pays twice');
    assert.equal(granted(events, 'pitborn_dividend:').length, 1);

    const payout = sys.sellShare(state);
    assert.equal(payout, Math.round(pitbornSharePrice(state) * (1 - PITBORN_SHARES.saleYardCut)),
      'the yard buys back under the marked price, minus its cut');
    assert.equal(granted(events, 'pitborn_share_sell:').length, 1);
    // `pit` still names the pre-round-trip book — the live one is what sold the share.
    assert.equal(ensurePitbornState(state).shares.length, 0);
  } finally {
    sim.dispose();
  }
});

// ── 5. The claim market ────────────────────────────────────────────────────────

test('the market: a yard listing sells to the pilot; a deed resells on the delay', () => {
  const { sim, state, bus, events, quietYard, spawnRock } = boot();
  try {
    quietYard();
    const sys = sim.registry.get('pitbornCull');
    const pit = ensurePitbornState(state);
    const bought = [], sold = [];
    bus.on('pitborn:marketBought', (p) => bought.push(p));
    bus.on('pitborn:claimSold', (p) => sold.push(p));

    // The yard lists proven ground anchored to a real rock.
    const rock = spawnRock(50000, 50000, 600, 30);
    const listing = sys._postMarketListing(state);
    assert.ok(listing && listing.state === 'open' && listing.source === 'yard');
    assert.equal(listing.anchorId, rock.id);
    assert.equal(listing.anchorGen, rock.occupantGeneration);

    const claim = sys.buyMarketClaim(state, listing.id);
    assert.ok(claim && claim.ownerId === 'player' && claim.kind === 'deed');
    assert.equal(charged(events, 'pitborn_market:')[0].amount, listing.askCr);
    assert.equal(listing.state, 'sold');
    assert.equal(listing.claimId, claim.id);
    assert.equal(bought.length, 1);
    assert.equal(claim.anchorId, rock.id, 'the deed rides its rock');

    // List it back: the sale lands on the deterministic delay, minus the cut.
    const reListed = sys.listClaimForSale(state, claim.id);
    assert.ok(reListed && reListed.source === 'player');
    assert.equal(claim.state, 'listed');
    reListed.sellAt = state.simTime; // the yard's clock says now
    sim.runTicks(3);
    assert.equal(sold.length, 1);
    assert.equal(sold[0].payoutCr, Math.round(reListed.askCr * (1 - PITBORN_CLAIM_STAKES.sellYardCut)));
    assert.equal(granted(events, 'pitborn_sale:').length, 1);
    assert.equal(claim.state, 'sold');
  } finally {
    sim.dispose();
  }
});

// ── 6. Sabotage suspicion and the blacklist ────────────────────────────────────

test('claim-jumping files sabotage; the score warns, fines, then blacklists', () => {
  const { sim, state, bus, events, quietYard, spawnRock } = boot();
  try {
    quietYard();
    const sys = sim.registry.get('pitbornCull');
    const pit = ensurePitbornState(state);
    const jumped = [], fined = [], warned = [], blacked = [];
    bus.on('pitborn:claimJumped', (p) => jumped.push(p));
    bus.on('pitborn:suspicionWarned', (p) => warned.push(p));
    bus.on('pitborn:fined', (p) => fined.push(p));
    bus.on('pitborn:blacklisted', (p) => blacked.push(p));

    // The yard files a ring; drilling inside it is jumping.
    const yard = sys._fileClaim(state, {
      x: 55000, z: 55000, kind: 'deed', ownerId: 'pitborn_yard',
      reserve: 400, charge: false,
    });
    assert.ok(yard && yard.state === 'open');
    const rock = spawnRock(yard.pos.x + 50, yard.pos.z, 400);

    // Jump it once: the stolen units are the claim's record and a ledger row.
    bus.emit('drill:end', { asteroidId: rock.id, yieldUnits: 20 });
    assert.equal(yard.stolen, 20);
    assert.equal(jumped.length, 1);
    assert.ok(pit.suspicion >= PITBORN_SUSPICION.drillJump);
    assert.ok(pit.suspicionLog.some((r) => r.kind === 'drill_jump'));
    assert.equal(pit.extractedTotal, 0, 'jumped ore never counts as honest work');

    // Keep jumping until the book escalates — each stage fires once.
    let guard = 0;
    while (pit.suspicion < PITBORN_SUSPICION.warnAt && guard++ < 20) {
      bus.emit('drill:end', { asteroidId: rock.id, yieldUnits: 5 });
    }
    assert.equal(warned.length, 1, 'one warning bark');
    while (pit.suspicion < PITBORN_SUSPICION.fineAt && guard++ < 40) {
      bus.emit('drill:end', { asteroidId: rock.id, yieldUnits: 5 });
    }
    assert.equal(fined.length, 1, 'one fine');
    assert.equal(charged(events, 'pitborn_fine').length, 1);
    assert.equal(repTotal(events, 'pitborn_sabotage_fine'), PITBORN_SUSPICION.fineRep);
    while (pit.suspicion < PITBORN_SUSPICION.blacklistAt && guard++ < 60) {
      bus.emit('drill:end', { asteroidId: rock.id, yieldUnits: 5 });
    }
    assert.equal(blacked.length, 1, 'one blacklisting');
    assert.ok(pit.blacklistedUntil > state.simTime);
    assert.equal(repTotal(events, 'pitborn_blacklist'), PITBORN_SUSPICION.blacklistRep);
    assert.ok(sys.buyShare(state) === null, 'blacklisted pilots hold no paper');

    // The page turns on its own clock.
    pit.blacklistedUntil = state.simTime + 0.2;
    sim.runTicks(30);
    assert.equal(pit.blacklistedUntil, 0);
    assert.ok(events.logs.some((l) => /turns a page/i.test(l.text)));
  } finally {
    sim.dispose();
  }
});

test('burned stakes, dead miners and cooled collectors all reach the book', () => {
  const { sim, state, bus, events, quietYard, player } = boot();
  try {
    quietYard();
    const sys = sim.registry.get('pitbornCull');
    const pit = ensurePitbornState(state);

    // Burn a yard-held stake: the filing dies and the torch is filed by name.
    const yard = sys._fileClaim(state, {
      x: 58000, z: 58000, kind: 'deed', ownerId: 'pitborn_yard',
      reserve: 300, charge: false,
    });
    const stake = state.entities.get(yard.markerId);
    bus.emit('entity:killed', { id: stake.id, killerId: player.id, type: 'payload' });
    assert.equal(yard.state, 'burned', 'the ring dies with its marker');
    assert.ok(pit.suspicionLog.some((r) => r.kind === 'stake_killed'));
    assert.ok(repTotal(events, 'pitborn_stake_burned') < 0);

    // A dead Tally Crew hull clears its row and files collector_killed.
    const claim = sys.fileClaimOnTick(state, { x: 44000, z: 44000 });
    const debt = pit.debt;
    debt.dueAt = state.simTime - 1;
    sim.runTicks(5);
    assert.ok(pit.collectors.length >= 1);
    const colRow = pit.collectors[0];
    const col = state.entities.get(colRow.entityId);
    bus.emit('entity:killed', { id: col.id, killerId: player.id, type: 'ship' });
    assert.ok(!pit.collectors.some((r) => r.entityId === col.id), 'the row closes');
    assert.ok(pit.suspicionLog.some((r) => r.kind === 'collector_killed'));
    assert.equal(repTotal(events, 'pitborn_collector_killed'), PITBORN_DEBT.repCollectorKilled);
    assert.ok(debt.state === 'open', 'the note still stands');
    assert.ok(claim.financed);

    // An unprovoked pitborn hull is a broken miner; a hostile one is fair work.
    const miner = sim.spawn({
      type: 'ship', team: 1, factionId: 'faction_pitborn',
      pos: { x: 0, z: 0 }, radius: 10, mass: 20, hull: 20, hullMax: 20, collides: true,
      data: {},
    });
    const susBefore = pit.suspicion;
    bus.emit('entity:killed', {
      id: miner.id, killerId: player.id, type: 'ship', factionId: 'faction_pitborn',
    });
    assert.ok(pit.suspicion > susBefore, 'miner_killed files');
    const sus2 = pit.suspicion;
    const hostile = sim.spawn({
      type: 'ship', team: 1, factionId: 'faction_pitborn',
      pos: { x: 0, z: 0 }, radius: 10, mass: 20, hull: 20, hullMax: 20, collides: true,
      data: {},
    });
    bus.emit('entity:killed', {
      id: hostile.id, killerId: player.id, type: 'ship',
      factionId: 'faction_pitborn', targetHostileToPlayer: true,
    });
    assert.equal(pit.suspicion, sus2, 'a hull that drew first files nothing');
  } finally {
    sim.dispose();
  }
});

// ── 7. Recycling, once-only, save-safety ───────────────────────────────────────

test('a recycled entity id never steals a filing — the yard re-stakes its own ground', () => {
  const { sim, state, quietYard } = boot();
  try {
    quietYard();
    const sys = sim.registry.get('pitbornCull');

    const claim = sys.fileClaim(state, { x: 12000, z: 12000 });
    const stake = state.entities.get(claim.markerId);
    assert.ok(stake && stake.alive !== false);

    // A foreign occupant of a recycled marker id is not the stake — the filing
    // is not buried, the yard re-files its own marker on the claim's ground.
    const impostor = sim.spawn({
      type: 'payload', team: 1, factionId: 'faction_pitborn',
      pos: { x: 0, z: 0 }, radius: 9, mass: 14, hull: 60, hullMax: 60,
      collides: true, data: { pitbornStake: true, pitbornClaimId: 'claim:wrong' },
    });
    claim.markerId = impostor.id;
    claim.markerGen = (impostor.occupantGeneration ?? 1) + 1000;
    sim.runTicks(3);
    assert.equal(claim.state, 'open', 'a foreign occupant never buries the filing');
    assert.notEqual(claim.markerId, impostor.id, 'the yard re-stakes its own ground');
    const refiled = state.entities.get(claim.markerId);
    assert.ok(refiled && refiled.alive !== false);
    assert.equal(refiled.data.pitbornClaimId, claim.id);
    assert.equal(claim.markerGen, refiled.occupantGeneration);

    // Save restore re-stamps generations and can re-issue ids: a live body still
    // wearing the claim's tag is the same stake — re-bind, never lapse.
    const claim2 = sys.fileClaim(state, { x: 24000, z: 24000 });
    claim2.markerGen = (claim2.markerGen ?? 1) + 1000; // a stale generation, same body
    sim.runTicks(3);
    assert.equal(claim2.state, 'open');
    const stake2 = state.entities.get(claim2.markerId);
    assert.equal(claim2.markerGen, stake2.occupantGeneration, 'a restamp re-binds');

    // And a marker that simply vanished — sector wipe, restore, cleanup — is
    // re-filed, not grieved. Only a burn closes the book on a filing.
    const claim3 = sys.fileClaim(state, { x: 36000, z: 36000 });
    const gone = claim3.markerId;
    state.entities.get(gone).alive = false; // removed without a kill event
    sim.runTicks(3);
    assert.equal(claim3.state, 'open');
    assert.notEqual(claim3.markerId, gone);
    assert.ok(state.entities.get(claim3.markerId)?.data?.pitbornClaimId === claim3.id);
  } finally {
    sim.dispose();
  }
});

test('the book survives a save round-trip: stamps hold, clocks pick up once', () => {
  const { sim, state, bus, events, quietYard } = boot();
  try {
    quietYard();
    const sys = sim.registry.get('pitbornCull');
    let warns = 0;
    bus.on('pitborn:debtDueSoon', () => { warns += 1; });

    const claim = sys.fileClaimOnTick(state, { x: 16000, z: 16000 });
    const debt = ensurePitbornState(state).debt;

    // Round-trip through JSON mid-note, then run into the warn window.
    state.pitborn = JSON.parse(JSON.stringify(state.pitborn));
    const debt2 = ensurePitbornState(state).debt;
    assert.deepEqual({ ...debt2 }, { ...debt }, 'the note serializes clean');
    debt2.dueAt = state.simTime + PITBORN_DEBT.warnBeforeS - 10;
    sim.runTicks(tick(20));
    assert.equal(warns, 1, 'the warn stamp fires once');
    // Another round-trip past the same window still fires nothing.
    state.pitborn = JSON.parse(JSON.stringify(state.pitborn));
    sim.runTicks(tick(30));
    assert.equal(warns, 1, 'a restored stamp never re-warns');

    // Missing beats accrue once per crossed period — and never twice.
    const d = ensurePitbornState(state).debt;
    const before = d.balance;
    const missedBefore = d.missed;
    d.dueAt = state.simTime - 1;
    sim.runTicks(3);
    const afterFirst = d.balance;
    const expected = Math.round(before + d.principal * PITBORN_DEBT.vigPerPeriod);
    assert.equal(afterFirst, expected, 'one period crossed, one vig');
    assert.equal(d.missed, missedBefore + 1);
    sim.runTicks(3);
    assert.equal(ensurePitbornState(state).debt.balance, expected, 'no phantom vig');
    assert.ok(claim.financed);
  } finally {
    sim.dispose();
  }
});

test('malformed book rows drop on ensure and the ledger stays plain JSON', () => {
  const { sim, state } = boot();
  try {
    state.pitborn = {
      crowd: 'junk', claims: [{ nope: 1 }, 'x', { id: 'claim:1', pos: 'bad', ringR: 'z' }],
      market: [null, { id: 'lst:1' }],
      shares: [{ nope: 2 }, { id: 'share:1' }, { id: 'share:2', price: 320 }],
      collectors: [{ entityId: 9 }, { entityId: 9, debtId: 'debt:1' }],
      quota: { nope: true }, debt: { id: 7 }, suspicion: 999, deeds: 'three',
      paid: null, suspicionLog: [{ id: 's:1' }, 42],
    };
    const pit = ensurePitbornState(state);
    assert.equal(pit.claims.length, 1, 'malformed rows drop');
    assert.equal(typeof pit.claims[0].pos.x, 'number');
    assert.equal(pit.market.length, 1);
    assert.equal(pit.market[0].state, 'delisted', 'a stateless row never opens on the board');
    assert.equal(pit.shares.length, 1, 'id-less and price-less paper drops');
    assert.equal(pit.shares[0].id, 'share:2');
    assert.equal(pit.collectors.length, 1, 'rows need a debtId');
    assert.equal(pit.quota, null, 'id-less quota drops');
    assert.equal(pit.debt, null, 'non-string debt id drops');
    assert.equal(pit.suspicion, PITBORN_SUSPICION.max, 'the score clamps');
    assert.equal(pit.deeds, 0);
    assert.ok(pit.paid && typeof pit.paid === 'object');
    assert.equal(pit.suspicionLog.length, 1);
    JSON.parse(JSON.stringify(pit)); // the whole book is serializable
  } finally {
    sim.dispose();
  }
});

test('a levy re-entered by payDebt settles the note once — never the pre-levy figure twice', () => {
  const { sim, state, bus, events, quietYard } = boot();
  try {
    quietYard();
    const sys = sim.registry.get('pitbornCull');
    const pit = ensurePitbornState(state);
    const settled = [];
    bus.on('pitborn:debtSettled', (p) => settled.push(p));

    sys.fileClaimOnTick(state, { x: 22000, z: 22000 });
    const debt = pit.debt;
    debt.dueAt = state.simTime - 1; // one beat overdue — the Crew flies
    sim.runTicks(5);
    assert.equal(debt.stage, 1);
    assert.ok(pit.collectors.length >= 1, 'a hull is out');
    const note = debt.balance; // principal plus the one vig it already grew

    // Park the collector on the player, then re-enter a full payoff from inside
    // the levy's charge emit. The balance is already debited when the wire
    // moves, so the nested payment settles only what the levy left standing.
    const collector = state.entities.get(pit.collectors[0].entityId);
    collector.pos.x = state.entities.get(state.playerId).pos.x + 40;
    collector.pos.z = state.entities.get(state.playerId).pos.z;
    let nested = false;
    bus.on('economy:chargeCredits', (p) => {
      if (!nested && String(p.reason || '').startsWith('pitborn_levy:')) {
        nested = true;
        sys.payDebt(state); // re-entrant payoff mid-levy
      }
    });
    sim.runTicks(tick(PITBORN_DEBT.collectBeatS) + 4);
    assert.equal(nested, true, 'the levy charge actually fired');
    assert.equal(settled.length, 1, 'the note settles exactly once');
    const levied = charged(events, 'pitborn_levy:').reduce((a, c) => a + c.amount, 0);
    const paid = charged(events, 'pitborn_debt:').reduce((a, c) => a + c.amount, 0);
    assert.ok(levied > 0 && paid > 0, 'both the levy and the payoff moved money');
    assert.equal(levied + paid, note, 'levy plus payoff never exceeds the note');
  } finally {
    sim.dispose();
  }
});

test('a financed filing re-entered from claimFiled leaves one note and one live deed', () => {
  const { sim, state, bus, quietYard } = boot();
  try {
    quietYard();
    const sys = sim.registry.get('pitbornCull');
    const pit = ensurePitbornState(state);
    const filedIds = [];
    let nestedCalled = false, nested = null;
    bus.on('pitborn:claimFiled', (p) => {
      filedIds.push(p.claimId);
      if (!nestedCalled && p.financed === true && p.ownerId === 'player') {
        nestedCalled = true;
        nested = sys.fileClaimOnTick(state, { x: 46000, z: 46000 });
      }
    });
    const outer = sys.fileClaimOnTick(state, { x: 20000, z: 20000 });
    assert.equal(outer, null, 'the unnoted filing lapses instead of stealing the note');
    assert.ok(nested && nested.state === 'open' && nested.financed === true,
      'the re-entrant filing holds the one seat');
    assert.equal(pit.debt.state, 'open');
    assert.equal(pit.debt.claimId, nested.id, 'the note names the filing that kept it');
    assert.equal(pit.claims.find((c) => c.id === filedIds[0]).state, 'lapsed',
      'the first deed is buried, not orphaned');
    const liveFinanced = pit.claims.filter((c) => c.financed === true && c.state === 'open');
    assert.equal(liveFinanced.length, 1, 'one financed deed, one note');
  } finally {
    sim.dispose();
  }
});

test('a listed deed that burns takes its board row down with it', () => {
  const { sim, state, bus, events, quietYard } = boot();
  try {
    quietYard();
    const sys = sim.registry.get('pitbornCull');
    const claim = sys.fileClaim(state, { x: 26000, z: 26000 });
    const listing = sys.listClaimForSale(state, claim.id);
    assert.ok(listing && listing.state === 'open' && claim.state === 'listed');
    const delisted = [];
    bus.on('pitborn:marketDelisted', (p) => delisted.push(p));

    // Somebody torches the stake: the filing dies and the board row follows
    // in the same breath, not at the sell clock.
    const stake = state.entities.get(claim.markerId);
    bus.emit('entity:killed', { id: stake.id, killerId: 'npc_9', type: 'payload' });
    assert.equal(claim.state, 'lapsed');
    assert.equal(listing.state, 'delisted', 'the board row dies with the filing');
    assert.ok(delisted.some((d) => d.listingId === listing.id));
    assert.equal(granted(events, 'pitborn_sale:').length, 0, 'a dead ring never pays out');
    sim.runTicks(tick(PITBORN_CLAIM_MARKET.saleDelayMinS + PITBORN_CLAIM_MARKET.saleDelaySpanS) + 10);
    assert.equal(granted(events, 'pitborn_sale:').length, 0, 'and stays dead past the sell clock');
  } finally {
    sim.dispose();
  }
});

test('stale board states normalize: zombie listings die, orphaned listed deeds reopen', () => {
  const { sim, state } = boot();
  try {
    state.pitborn = {
      claims: [
        { id: 'claim:1', state: 'listed', ownerId: 'player', saleId: 'lst:gone', kind: 'deed' },
        { id: 'claim:2', state: 'listed', ownerId: 'player', saleId: 'lst:1', kind: 'deed' },
      ],
      market: [
        { id: 'lst:1', state: 'open', source: 'player', claimId: 'claim:2' },
        { id: 'lst:2', state: 'listed' }, // not a state the board speaks
      ],
    };
    const pit = ensurePitbornState(state);
    assert.equal(pit.claims.find((c) => c.id === 'claim:1').state, 'open',
      'a listed deed with no live listing reopens');
    assert.equal(pit.claims.find((c) => c.id === 'claim:2').state, 'listed',
      'a listed deed with a live listing stays listed');
    assert.equal(pit.market.find((l) => l.id === 'lst:2').state, 'delisted',
      'a row in a foreign state is collected, not zombied');
    assert.equal(pit.market.find((l) => l.id === 'lst:1').state, 'open');
  } finally {
    sim.dispose();
  }
});

test('a claim row in a foreign state closes — never resurrects open', () => {
  const { sim, state } = boot();
  try {
    state.pitborn = {
      claims: [
        { id: 'claim:1', state: 'open', ownerId: 'player' },
        { id: 'claim:2', state: 5 },                 // a number is not a filing
        { id: 'claim:3' },                           // no state at all
        { id: 'claim:4', state: 'pending' },         // a listing word, not a claim word
      ],
    };
    const pit = ensurePitbornState(state);
    assert.equal(pit.claims.find((c) => c.id === 'claim:1').state, 'open');
    for (const id of ['claim:2', 'claim:3', 'claim:4']) {
      assert.equal(pit.claims.find((c) => c.id === id).state, 'lapsed',
        `${id}: a foreign state is collected, never live`);
    }
  } finally {
    sim.dispose();
  }
});

test('a share buy latches the lot before the charge wire moves', () => {
  const { sim, state, bus, events, quietYard } = boot();
  try {
    quietYard();
    const sys = sim.registry.get('pitbornCull');
    const pit = ensurePitbornState(state);
    let seenDuringEmit = null;
    bus.on('economy:chargeCredits', (p) => {
      if (String(p.reason || '') === 'pitborn_share_buy') {
        seenDuringEmit = ensurePitbornState(state).shares.length; // the book mid-emit
      }
    });
    const share = sys.buyShare(state);
    assert.ok(share);
    assert.equal(seenDuringEmit, 1, 'the lot is on the book before money moves');
    assert.equal(pit.shares.length, 1);
    assert.equal(charged(events, 'pitborn_share_buy').length, 1, 'one share, one charge');
  } finally {
    sim.dispose();
  }
});

test('an off-sector listing refuses the buy without delisting the board row', () => {
  const { sim, state, bus, events, quietYard, spawnRock } = boot();
  try {
    quietYard();
    const sys = sim.registry.get('pitbornCull');
    spawnRock(50000, 50000, 600, 30);
    const listing = sys._postMarketListing(state);
    assert.ok(listing && listing.state === 'open');
    listing.sectorId = 'sector_far_away'; // filed under another sky

    const refused = [], delisted = [];
    bus.on('pitborn:refused', (p) => refused.push(p));
    bus.on('pitborn:marketDelisted', (p) => delisted.push(p));
    const creditsBefore = state.player.credits;
    assert.equal(sys.buyMarketClaim(state, listing.id), null,
      'the board answers in the listing’s own sector');
    assert.equal(listing.state, 'open', 'a cross-sector buy never buries the row');
    assert.equal(delisted.length, 0, 'no delist event either');
    assert.equal(state.player.credits, creditsBefore, 'no money moved');
    assert.ok(refused.some((r) => r.reason === 'wrong_sector'));
    sim.runTicks(3);
    assert.equal(listing.state, 'open', 'the row survives the next tick too');
  } finally {
    sim.dispose();
  }
});

test('a dead rock still names its ring — jumped or owned ore is booked, not wild', () => {
  const { sim, state, bus, events, quietYard, spawnRock } = boot();
  try {
    quietYard();
    const sys = sim.registry.get('pitbornCull');
    const pit = ensurePitbornState(state);

    // The yard holds an unanchored ring; the rock inside it dies mid-session.
    // removeEntity only flags alive=false — the corpse still names the ring.
    const yard = sys._fileClaim(state, {
      x: 57000, z: 57000, kind: 'deed', ownerId: 'pitborn_yard',
      reserve: 400, charge: false,
    });
    const rock = spawnRock(yard.pos.x + 40, yard.pos.z, 400);
    rock.alive = false;
    bus.emit('drill:end', { asteroidId: rock.id, yieldUnits: 25 });
    assert.equal(yard.stolen, 25, 'a corpse still names its filed ring');
    assert.equal(yard.reserve, 375);
    assert.ok(pit.suspicionLog.some((r) => r.kind === 'drill_jump'),
      'jumping a dead filed rock still files the sabotage ledger');

    // And the pilot's own ring pays full credit, royalty, and honest bookkeeping
    // even when the drilled rock is a corpse at session end.
    const mine = sys.fileClaim(state, { x: 15000, z: 15000 });
    const rock2 = spawnRock(mine.pos.x + 30, mine.pos.z, 200);
    rock2.alive = false;
    const reserveBefore = mine.reserve;
    const totalBefore = pit.extractedTotal;
    bus.emit('drill:end', { asteroidId: rock2.id, yieldUnits: 10 });
    assert.equal(mine.extracted, 10, 'owned extraction books against the ring');
    assert.equal(mine.reserve, Math.max(0, reserveBefore - 10));
    assert.equal(pit.extractedTotal, totalBefore + 10, 'full credit, never the wild half');
    assert.equal(granted(events, `pitborn_royalty:${mine.id}`).length, 1,
      'the pit gate pays the royalty on a dead rock too');
  } finally {
    sim.dispose();
  }
});

// ── 8. Hostile loads: normalization must never mint live rows ────────────────

test('stateless and out-of-vocabulary singletons never open orders or notes', () => {
  const { sim, state, events, quietYard } = boot();
  try {
    quietYard();
    const sys = sim.registry.get('pitbornCull');
    state.pitborn = {
      quota: { id: 'quota:9', wantUnits: 5, dueAt: 0 }, // no state — not an order
      debt: { id: 'debt:9' },                          // no state — not a note
    };
    let pit = ensurePitbornState(state);
    assert.equal(pit.quota, null, 'a stateless order is an already-rung bell');
    assert.equal(pit.debt, null, 'a stateless note is a dead note');

    // A stage-3 'open' note is outside the system's vocabulary too — it must
    // not wedge the one-note seat the pilot still owns.
    state.pitborn = { debt: { id: 'debt:4', state: 'open', stage: 3, balance: 500 } };
    pit = ensurePitbornState(state);
    assert.equal(pit.debt, null, 'a stage the book never wrote is a dead note');
    sim.runTicks(30);
    assert.equal(pit.suspicionLog.length, 0, 'a forged row files no suspicion');
    assert.equal(events.charges.length + events.grants.length, 0, 'no money moves');
    const claim = sys.fileClaimOnTick(state, { x: 21000, z: 21000 });
    assert.ok(claim && claim.financed, 'the note seat heals instead of wedging');
  } finally {
    sim.dispose();
  }
});

test('id minting, ledger caps and paper all heal under a hostile load', () => {
  const { sim, state, quietYard } = boot();
  try {
    quietYard();
    const sys = sim.registry.get('pitbornCull');
    const yardClaims = Array.from({ length: 9 }, (_, i) => ({
      id: `claim:${10 + i}`, state: 'open', ownerId: 'pitborn_yard',
      pos: { x: i * 9000, z: -90000 }, reserve: 10,
    }));
    const playerClaims = Array.from({ length: 5 }, (_, i) => ({
      id: `claim:${30 + i}`, state: 'open', ownerId: 'player',
      pos: { x: i * 9000, z: 90000 }, reserve: 10,
    }));
    state.pitborn = {
      claims: [...yardClaims, ...playerClaims,
        { id: 'claim:10', state: 'open', ownerId: 'pitborn_yard' }], // a dup id
      market: Array.from({ length: 8 }, (_, i) => ({
        id: `lst:${40 + i}`, state: 'open', source: 'yard', expiresAt: 1e12,
      })),
      shares: [
        ...Array.from({ length: 10 }, (_, i) => ({ id: `share:${50 + i}`, price: 300 })),
        { id: 'share:50', price: 300 }, // dup
        { id: 'share:99' },             // no marked price — never issued
      ],
      seq: 0, // the counter behind every id the book already minted
    };
    const pit = ensurePitbornState(state);
    assert.equal(pit.claims.filter((c) => c.id === 'claim:10').length, 1, 'dup ids collapse');
    const live = pit.claims.filter((c) => c.state === 'open' || c.state === 'listed');
    assert.ok(live.length <= PITBORN_CLAIM_STAKES.maxClaims,
      `the belt holds ${live.length} live rings, capped at ${PITBORN_CLAIM_STAKES.maxClaims}`);
    assert.ok(live.filter((c) => c.ownerId === 'player').length <= PITBORN_CLAIM_STAKES.maxPlayerClaims,
      'the pilot never holds more rings than the yard stakes');
    assert.ok(pit.market.filter((l) => l.state === 'open').length <= PITBORN_CLAIM_MARKET.maxListings,
      'the board never carries more open listings than it posts');
    assert.equal(pit.shares.length, PITBORN_SHARES.maxShares, 'surplus paper trims to the cap');
    assert.ok(pit.shares.every((s) => Number.isFinite(s.price)), 'every lot carries a price');
    assert.equal(new Set(pit.shares.map((s) => s.id)).size, pit.shares.length, 'no dup lots');

    // A seq behind the rows it already issued must not re-issue a live id —
    // heal it past every suffix on the book before the next filing mints.
    state.pitborn = {
      claims: [{ id: 'claim:0', state: 'open', ownerId: 'pitborn_yard', pos: { x: 1, z: 1 } }],
      seq: 0,
    };
    ensurePitbornState(state);
    const claim = sys._fileClaim(state, {
      x: 30000, z: 30000, kind: 'deed', ownerId: 'pitborn_yard', charge: false,
    });
    assert.ok(claim, 'the yard files on a healed counter');
    assert.notEqual(claim.id, 'claim:0', `fresh id ${claim.id} never re-issues a live one`);
  } finally {
    sim.dispose();
  }
});

test('a re-issued anchor id re-binds by ground instead of burying the filing', () => {
  const { sim, state, quietYard, spawnRock } = boot();
  try {
    quietYard();
    const sys = sim.registry.get('pitbornCull');
    const rock = spawnRock(62000, 62000, 400);
    const claim = sys._fileClaim(state, {
      x: rock.pos.x, z: rock.pos.z, kind: 'deed', ownerId: 'pitborn_yard',
      anchorId: rock.id, anchorGen: rock.occupantGeneration, charge: false,
    });
    assert.ok(claim && claim.state === 'open');
    const oldId = rock.id;

    // Save restore re-issues the body's id: the old rock is gone, a fresh one
    // sits on the same ground. The filing must ride it, not lapse.
    rock.alive = false;
    const fresh = spawnRock(rock.pos.x, rock.pos.z, 400);
    assert.notEqual(fresh.id, oldId);
    sim.runTicks(3);
    assert.equal(claim.state, 'open', 'the filing survives the id swap');
    assert.equal(claim.anchorId, fresh.id, 'the ring re-binds to the same-spot rock');
    assert.equal(claim.anchorGen, fresh.occupantGeneration);
  } finally {
    sim.dispose();
  }
});

test('a kill wire on a retired stake is salvage, never sabotage of the live filing', () => {
  const { sim, state, bus, quietYard } = boot();
  try {
    quietYard();
    const sys = sim.registry.get('pitbornCull');
    const lapsed = [];
    bus.on('pitborn:claimLapsed', (p) => lapsed.push(p));
    const claim = sys.fileClaim(state, { x: 14000, z: 14000 });
    const retired = claim.markerId;

    // The stake despawns without a kill (sector sweep, restore) — the filing
    // re-stakes its own ground. The corpse still wears the claim's tag.
    state.entities.get(retired).alive = false;
    sim.runTicks(3);
    assert.equal(claim.state, 'open');
    assert.notEqual(claim.markerId, retired, 'a fresh bound stake stands');

    // A late kill wire naming the retired id must not bury the live filing.
    bus.emit('entity:killed', { id: retired, killerId: 'npc_9', type: 'payload' });
    assert.equal(claim.state, 'open', 'the filing answers only its bound stake');
    assert.equal(lapsed.filter((l) => l.claimId === claim.id).length, 0);
    sim.runTicks(3);
    assert.equal(claim.state, 'open');
  } finally {
    sim.dispose();
  }
});

test('a player-source listing never vendors the yard’s own ring', () => {
  const { sim, state, events, quietYard } = boot();
  try {
    quietYard();
    const sys = sim.registry.get('pitbornCull');
    const pit = ensurePitbornState(state);
    const yard = sys._fileClaim(state, {
      x: 56000, z: 56000, kind: 'deed', ownerId: 'pitborn_yard',
      reserve: 300, charge: false,
    });
    // A board row that names a yard claim is a forgery — it delists, it never sells.
    pit.market.push({
      id: 'lst:forged', pos: { ...yard.pos }, ringR: yard.ringR, reserve: 300,
      askCr: 50000, seller: 'the pilot', source: 'player', claimId: yard.id,
      anchorId: null, anchorGen: null, listedAt: state.simTime, expiresAt: 0,
      sellAt: state.simTime, state: 'open', sectorId: null,
    });
    sim.runTicks(3);
    assert.equal(yard.state, 'open', 'the yard keeps its ring');
    const row = pit.market.find((l) => l.id === 'lst:forged');
    assert.equal(row.state, 'delisted');
    assert.equal(granted(events, 'pitborn_sale:').length, 0, 'no purse for forged paper');
    assert.equal(repTotal(events, 'pitborn_claim_sold'), 0);
  } finally {
    sim.dispose();
  }
});

test('the filing gate refuses garbage coordinates instead of minting an origin deed', () => {
  const { sim, state, events, quietYard } = boot();
  try {
    quietYard();
    const sys = sim.registry.get('pitbornCull');
    const refused = [];
    sim.bus.on('pitborn:refused', (p) => refused.push(p));
    const before = state.player.credits;
    assert.equal(sys.fileClaim(state, {}), null, 'no coordinates, no filing');
    assert.equal(sys.fileClaim(state, { x: 'west', z: 5 }), null, 'a word is not a place');
    assert.equal(sys.fileClaim(state, { x: NaN, z: 0 }), null);
    assert.equal(state.player.credits, before, 'refused filings burn nothing');
    assert.equal(charged(events, 'pitborn_claim:').length, 0);
    assert.ok(refused.every((r) => r.reason === 'bad_position'));
    assert.equal(ensurePitbornState(state).claims.length, 0);
  } finally {
    sim.dispose();
  }
});

test('an expired yard listing refuses the buy before money moves', () => {
  const { sim, state, bus, events, quietYard, spawnRock } = boot();
  try {
    quietYard();
    const sys = sim.registry.get('pitbornCull');
    spawnRock(52000, 52000, 600, 30);
    const listing = sys._postMarketListing(state);
    assert.ok(listing && listing.state === 'open');
    listing.expiresAt = state.simTime - 1; // the yard's ttl ran out last tick
    const refused = [];
    bus.on('pitborn:refused', (p) => refused.push(p));
    const before = state.player.credits;
    assert.equal(sys.buyMarketClaim(state, listing.id), null);
    assert.equal(state.player.credits, before, 'the stale row never charges');
    assert.equal(charged(events, 'pitborn_market:').length, 0);
    assert.ok(refused.some((r) => r.reason === 'expired'));
    sim.runTicks(3);
    assert.equal(listing.state, 'delisted', 'the tick collects the stale row');
  } finally {
    sim.dispose();
  }
});

test('a hostile colossus and a crooked ballast ball never sink the tick', () => {
  const { sim, state } = boot();
  try {
    const sys = sim.registry.get('pitbornCull');
    // A yardmaster-shaped hull whose pieces are not an array — damage must not throw.
    const colossus = sim.spawn({
      type: 'ship', team: 1, factionId: 'faction_pitborn',
      pos: { x: 0, z: 0 }, radius: 320, mass: 900, hull: 3440, hullMax: 3440,
      collides: true, data: { yardmaster: true, pieces: 'not-an-array' },
    });
    sim.runTicks(2);
    colossus.hull = 100; // real damage — the strip path runs on hostile data
    assert.doesNotThrow(() => sim.runTicks(2));

    // Pieces with junk entries: real pieces strip, junk never counts.
    const colossus2 = sim.spawn({
      type: 'ship', team: 1, factionId: 'faction_pitborn',
      pos: { x: 1000, z: 0 }, radius: 320, mass: 900, hull: 3440, hullMax: 3440,
      collides: true,
      data: {
        yardmaster: true,
        pieces: [42, 'x', { attached: true, modelId: 'm1', idx: 0, label: 'Bit' }],
      },
    });
    sim.runTicks(2);
    colossus2.hull = 100;
    sim.runTicks(2);
    assert.ok(!colossus2.alive || colossus2.alive === false || colossus2.data.pieces[2].attached === false,
      'the one real piece strips without a wedge');

    // A ballast ball that lost its authored baseRadius still feeds clean.
    const ball = sim.spawn({
      type: 'junk', team: 1, pos: { x: 0, z: 0 }, radius: 10, mass: 10,
      hull: 40, hullMax: 40, collides: true,
      data: { ballastBall: true, accretedMass: 0 },
    });
    sim.spawn({
      type: 'debris', team: 0, pos: { x: 12, z: 0 }, radius: 5, mass: 10,
      hull: 10, hullMax: 10, collides: true, data: {},
    });
    assert.doesNotThrow(() => sim.runTicks(2));
    assert.ok(Number.isFinite(ball.radius) && Number.isFinite(ball.mass),
      'the ball heals its radius and mass instead of writing NaN');
    assert.ok(ball.mass > 10, 'the feed still lands');
  } finally {
    sim.dispose();
  }
});

test('a drill receipt naming a non-rock books wild ground, never a filed ring', () => {
  const { sim, state, bus, quietYard } = boot();
  try {
    quietYard();
    const sys = sim.registry.get('pitbornCull');
    const pit = ensurePitbornState(state);
    const yard = sys._fileClaim(state, {
      x: 61000, z: 61000, kind: 'deed', ownerId: 'pitborn_yard',
      reserve: 400, charge: false,
    });
    const stake = state.entities.get(yard.markerId);
    // The receipt names the claim's own stake — payload, not rock.
    bus.emit('drill:end', { asteroidId: stake.id, yieldUnits: 20 });
    assert.equal(yard.stolen, 0, 'a stake is never jumped ore');
    assert.equal(yard.reserve, 400);
    assert.equal(pit.extractedTotal, 10, 'a non-rock reads as wild ground');
    assert.ok(!pit.suspicionLog.some((r) => r.kind === 'drill_jump'),
      'and files no claim-jump on the sabotage ledger');
  } finally {
    sim.dispose();
  }
});

test('yard standing: deeds climb the tiers and scale every payout the book makes', () => {
  const { sim, state, bus, events, quietYard, spawnRock } = boot();
  try {
    quietYard();
    const sys = sim.registry.get('pitbornCull');
    const pit = ensurePitbornState(state);
    const tiers = [];
    bus.on('pitborn:tier', (p) => tiers.push(p));

    assert.equal(pitbornTierFor(PITBORN_YARD_TIERS[0].deeds).tier, 0);
    pit.deeds = PITBORN_YARD_TIERS[1].deeds; // stand the pilot up a tier for the read
    const standing = pitbornStanding(state);
    assert.equal(standing.tier, 1);
    assert.ok(standing.payMult > 1);

    // A quota bell at tier 1 pays the multiplied purse.
    sim.runTicks(tick(PITBORN_QUOTA.firstPostS) + 10);
    const rock = spawnRock(32000, 32000, 500);
    bus.emit('drill:end', { asteroidId: rock.id, yieldUnits: pit.quota.wantUnits * 2 });
    pit.quota.dueAt = state.simTime + 0.5;
    sim.runTicks(60);
    const purse = granted(events, 'pitborn_quota:')[0];
    const base = PITBORN_QUOTA.basePayCr + pit.quotaLog[0].gotUnits * PITBORN_QUOTA.payPerUnitCr;
    assert.ok(purse.amount >= Math.round(base * standing.payMult),
      'standing scales the purse');
    // The settle itself filed a deed — the count climbs.
    assert.ok(pit.deeds > PITBORN_YARD_TIERS[1].deeds);
  } finally {
    sim.dispose();
  }
});
