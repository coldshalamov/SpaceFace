// The living impound lot — CRT-03's posting seam grown into an economy:
// storage fees, a seeded auction the quiet bidder can win, paper disputes,
// redemption windows, the attendant's verbs, the recovery bounty, and the
// kin's ransom on a bought marked hull. Everything keys on the seeded lossId,
// latches before it emits, and stays plain JSON through the ledger's serialize.
import assert from 'node:assert/strict';
import test from 'node:test';

import { combat as combatPrototype } from '../src/systems/combat.js';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { livingHullWithScar } from '../src/core/livingHull.js';
import { hash32 } from '../src/core/rng.js';
import { mintImpoundShadow, tickImpoundGrudge } from '../src/systems/impoundGrudge.js';
import * as lot from '../src/systems/impoundLot.js';
import { lossLedger as lossPrototype } from '../src/systems/lossLedger.js';
import { buildSlotList, ships as shipsPrototype } from '../src/systems/ships.js';
import { SHIPS } from '../src/data/ships.js';

const WASP = SHIPS.find((ship) => ship.id === 'ship_wasp');
const HITCH = SHIPS.find((ship) => ship.id === 'ship_kestrel');
const ECON = lot.IMPOUND_LOT_ECON;
const DAY = ECON.dayS;
const RAW_ID = /\b(?:ship|sector|station|faction|loss)_[a-z0-9_]+\b/i;

function unit(hash) { return (hash >>> 0) / 0xffffffff; }

function boot({ stationId = 'station_helios', credits = 0, docked = false } = {}) {
  const state = createGameState(4242);
  state.mode = 'flight';
  state.simTime = 120;
  state.tick = 7200;
  state.world.currentSectorId = 'sector_helios_prime';
  state.player.credits = credits;
  state.player.heat = 0;
  state.playerId = 1;
  state.player.ownedShips = [{
    defId: HITCH.id,
    fittings: new Array(buildSlotList(HITCH).length).fill(null),
    appearance: null,
  }];
  state.player.activeShipIndex = 0;
  state.ui.docked = docked;
  state.ui.dockedStationId = docked ? stationId : null;
  state.entities.set(1, {
    id: 1,
    alive: true,
    type: 'ship',
    hull: 140,
    shield: 55,
    data: { defId: HITCH.id, fittings: [], sectorId: 'sector_helios_prime' },
  });

  const bus = createBus();
  const all = [];
  const realEmit = bus.emit.bind(bus);
  bus.emit = (name, p) => { all.push({ name, p }); return realEmit(name, p); };
  const of = (name) => all.filter((row) => row.name === name).map((row) => row.p);

  const charges = [];
  const grants = [];
  bus.on('economy:chargeCredits', (p) => { charges.push(p); state.player.credits -= p.amount; });
  bus.on('economy:grantCredits', (p) => { grants.push(p); state.player.credits += p.amount; });

  const ledger = Object.create(lossPrototype);
  ledger.init({ state, bus, helpers: {} });
  const ships = Object.assign({}, shipsPrototype, { _instSeq: 0 });
  ships.init({ state, bus, helpers: {} });
  return { state, bus, ledger, ships, all, of, charges, grants };
}

function dayOf(state) { return Math.floor(state.simTime / DAY); }

function advanceDays(h, n = 1) {
  h.state.simTime += n * DAY;
  h.state.tick += n * 36000;
  h.bus.emit('day:tick', { days: dayOf(h.state), elapsed: n });
}

function dockAt(h, stationId = 'station_helios') {
  h.state.ui.docked = true;
  h.state.ui.dockedStationId = stationId;
  h.bus.emit('dock:docked', { stationId });
}

// The real public seam lossLedger calls — a killed hull with a seeded lossId.
function postLot(h, {
  id = 7, defId = 'ship_wasp', callsign = 'Marrow', lossId = 'loss_t0',
  killedByPlayer = true, factionId = 'faction_reach', livingHull = null,
} = {}) {
  h.state.entities.set(id, {
    id,
    alive: true,
    type: 'ship',
    factionId,
    data: { defId, callsign, sectorId: 'sector_helios_prime', livingHull },
  });
  const entity = h.state.entities.get(id);
  const entry = {
    lossId,
    sectorId: 'sector_helios_prime',
    factionId,
    victimCallsign: callsign,
    killedByPlayer,
    killerId: killedByPlayer ? h.state.playerId : 99,
  };
  const listing = lot.postImpoundListing(h.state, h.bus, { entity, entry });
  h.state.entities.delete(id);
  return listing;
}

// Scan seeded lossIds until one mints the sub-records a test needs — every
// roll keys on the lossId, so probing is just the game's own determinism.
function postWhere(h, pred, { base = 'loss_t', max = 500 } = {}) {
  for (let i = 0; i < max; i += 1) {
    const listing = postLot(h, { lossId: `${base}${i}`, id: 700 + i });
    if (!listing) continue;
    if (pred(listing)) return listing;
    delete h.state.lossLedger.impound;
  }
  return null;
}

function markedHullOwned(h, { defId = 'ship_wasp', lossId = 'loss_r0', callsign = 'Marrow', deaths = 0, tier = 0 } = {}) {
  const def = SHIPS.find((ship) => ship.id === defId);
  lot.ensureImpoundLotWiring(h.state, { bus: h.bus }); // the host seam — no post ran in this boot
  const owned = {
    defId,
    fittings: new Array(buildSlotList(def).length).fill(null),
    appearance: null,
  };
  owned.impoundShadow = mintImpoundShadow({ lossId, callsign }, h.state.simTime);
  assert.ok(owned.impoundShadow, 'a callsign mints a shadow');
  owned.impoundShadow.deaths = deaths;
  owned.impoundShadow.tier = tier;
  h.state.player.ownedShips.push(owned);
  h.state.player.activeShipIndex = h.state.player.ownedShips.length - 1;
  return owned;
}

function ransomYesLossId(i = 0) {
  let n = 0;
  for (let k = 0; k < 500; k += 1) {
    const id = `loss_r${k}`;
    if (unit(hash32(id, 'impound-ransom')) < ECON.ransomChance) {
      if (n === i) return id;
      n += 1;
    }
  }
  return null;
}

function ransomNoLossId() {
  for (let k = 0; k < 500; k += 1) {
    const id = `loss_r${k}`;
    if (unit(hash32(id, 'impound-ransom')) >= ECON.ransomChance) return id;
  }
  return null;
}

test('posting stamps the living-lot economy and the record stays plain JSON', () => {
  const h = boot();
  const listing = postLot(h, { lossId: 'loss_t0' });
  assert.ok(listing);
  assert.equal(listing.lotSchema, lot.IMPOUND_LOT_SCHEMA);
  assert.equal(listing.listPrice, listing.price);
  assert.equal(listing.ask, listing.price);
  assert.equal(listing.price, 11200);
  assert.equal(listing.postDay, dayOf(h.state));
  assert.equal(listing.econDay, listing.postDay);
  assert.equal(listing.fees, 0);
  assert.equal(listing.killedByPlayer, true);
  assert.ok(listing.auction && Number.isFinite(listing.auction.opensDay));
  assert.ok(listing.auction.strike >= Math.round(listing.listPrice * ECON.npcStrikeMinPct));
  assert.ok(listing.auction.strike <= Math.round(listing.listPrice * (ECON.npcStrikeMinPct + ECON.npcStrikeSpanPct)) + 1);
  assert.equal(listing.dispute === null || listing.dispute.kind === 'legal' || listing.dispute.kind === 'paper', true);
  const round = JSON.parse(JSON.stringify(listing));
  assert.deepEqual(round, listing, 'the whole lot record serializes');
});

test('storage fees accrue once per day and never twice on a replayed tick', () => {
  const h = boot();
  const listing = postWhere(h, (l) => !l.dispute && !l.redeem);
  const perDay = Math.max(ECON.storageFeeMinCr, Math.round(listing.listPrice * ECON.storageFeePct));
  advanceDays(h, 1);
  assert.equal(listing.fees, perDay);
  assert.equal(listing.ask, listing.listPrice + perDay);
  assert.equal(listing.price, listing.ask);
  const snapshot = { fees: listing.fees, ask: listing.ask };
  h.bus.emit('day:tick', { days: dayOf(h.state), elapsed: 1 }); // replayed boundary
  assert.equal(listing.fees, snapshot.fees);
  assert.equal(listing.ask, snapshot.ask);
  advanceDays(h, 1);
  assert.equal(listing.fees, perDay * 2);
  assert.equal(listing.ask, listing.listPrice + perDay * 2);
});

test('the fee book caps — the yard never bills past its share', () => {
  const h = boot();
  const listing = postWhere(h, (l) => !l.dispute && !l.redeem);
  const cap = Math.round(listing.listPrice * ECON.storageFeeCapPct);
  listing.fees = cap - 50; // the book is nearly full — the next day takes the remainder only
  advanceDays(h, 1);
  assert.equal(listing.fees, cap);
  const ask = listing.ask;
  advanceDays(h, 1);
  assert.equal(listing.fees, cap, 'fees stop at the cap');
  assert.ok(listing.ask <= ask, 'the markdown machine takes over after the cap');
});

test('the auction opens on its seeded day and the quiet bidder wins at their strike', () => {
  const h = boot();
  const listing = postWhere(h, (l) => !l.dispute && !l.redeem);
  assert.ok(listing);
  while (dayOf(h.state) < listing.auction.opensDay - 1) advanceDays(h, 1);
  assert.equal(listing.auction.open, false, 'the block stays shut before its day');
  advanceDays(h, 1);
  assert.equal(listing.auction.open, true, 'the block opens on its seeded day');
  let guard = 40;
  while (h.state.lossLedger.impound && guard > 0) { advanceDays(h, 1); guard -= 1; }
  assert.equal(h.state.lossLedger.impound, undefined, 'the quiet bidder takes the hull');
  const won = h.of('impoundLot:auctionWon').at(-1);
  assert.equal(won.winner, 'npc');
  const closed = h.of('impoundLot:closed').at(-1);
  assert.equal(closed.kind, 'npc');
  assert.equal(closed.price, won.price);
  assert.ok(won.price <= listing.auction.strike, 'the paper bought at or under its own line');
  assert.ok(won.price >= 1);
  const line = h.of('news:publish').at(-1).text;
  assert.equal(RAW_ID.test(line), false, line);
});

test('the recovery bounty pays the player once when the yard moves their kill', () => {
  const h = boot();
  const listing = postWhere(h, (l) => !l.dispute && !l.redeem && l.auction.strike >= l.listPrice * 0.8, { base: 'loss_b' });
  assert.ok(listing, 'a high-strike book exists');
  let guard = 40;
  while (h.state.lossLedger.impound && guard > 0) { advanceDays(h, 1); guard -= 1; }
  const bounties = h.grants.filter((p) => p.reason === `impound_lot:recovery:${listing.lossId}`);
  assert.equal(bounties.length, 1, 'the recovery share pays exactly once');
  const won = h.of('impoundLot:auctionWon').at(-1);
  assert.equal(bounties[0].amount, Math.max(1, Math.round(won.price * ECON.recoveryBountyPct)));
});

test('no bounty lands when the player buys the hull themselves', () => {
  const h = boot({ credits: 999999 });
  const listing = postLot(h, { lossId: 'loss_buy0' });
  dockAt(h, 'station_helios');
  h.bus.emit('ui:buyShip', { defId: 'ship_wasp', listingId: listing.listingId });
  assert.equal(h.state.lossLedger.impound, undefined);
  const bounties = h.grants.filter((p) => String(p.reason || '').startsWith('impound_lot:recovery:'));
  assert.equal(bounties.length, 0, 'buying your own kill earns no yard cut');
  const sold = h.of('impoundLot:sold').at(-1);
  assert.equal(sold.lossId, listing.lossId);
  assert.equal(sold.price, listing.price);
});

test('kin redeem the hull on their seeded day — a watched lot warns first', () => {
  const h = boot();
  const listing = postWhere(h, (l) => l.redeem && !l.dispute, { base: 'loss_k' });
  assert.ok(listing, 'a redeemed book exists');
  lot.impoundWatchLot(h.state, h.bus, true);
  while (dayOf(h.state) < listing.redeem.opensDay - 1) advanceDays(h, 1);
  assert.equal(dayOf(h.state), listing.redeem.opensDay - 1, 'the watch tick lands a day early');
  const warn = h.of('toast').filter((p) => /ransom/i.test(p.text));
  assert.ok(warn.length >= 1, 'a watched book warns a day early');
  assert.ok(h.state.lossLedger.impound, 'warning does not sell the hull');
  advanceDays(h, 1); // the window opens — the kin pay the yard
  assert.equal(h.state.lossLedger.impound, undefined);
  const closed = h.of('impoundLot:closed').at(-1);
  assert.equal(closed.kind, 'redeem');
  const bounties = h.grants.filter((p) => p.reason === `impound_lot:recovery:${listing.lossId}`);
  assert.equal(bounties.length, 1, 'a redeemed player-kill still pays the recovery cut');
});

test('a landed court claim pulls the hull off the lot entirely', () => {
  const h = boot();
  const listing = postWhere(h, (l) => l.dispute && l.dispute.kind === 'legal' && !l.redeem
    && unit(hash32(l.lossId, 'impound-dispute-outcome', l.dispute.resolveDay)) < ECON.disputeReclaimChance,
  { base: 'loss_c' });
  assert.ok(listing, 'a reclaimable court claim exists');
  while (h.state.lossLedger.impound && dayOf(h.state) < listing.dispute.resolveDay) advanceDays(h, 1);
  assert.equal(h.state.lossLedger.impound, undefined, 'the court took the hull');
  const resolved = h.of('impoundLot:disputeResolved').at(-1);
  assert.equal(resolved.outcome, 'reclaimed');
  assert.equal(h.of('impoundLot:closed').at(-1).kind, 'reclaim');
});

test('a landed muscle claim scars the hull and cuts the ask instead', () => {
  const h = boot();
  const listing = postWhere(h, (l) => l.dispute && l.dispute.kind === 'paper' && !l.redeem
    && unit(hash32(l.lossId, 'impound-dispute-outcome', l.dispute.resolveDay)) < ECON.disputeRaidChance,
  { base: 'loss_m' });
  assert.ok(listing, 'a raidable claim exists');
  const scarsBefore = (listing.livingHull.scars || []).length;
  while (dayOf(h.state) < listing.dispute.resolveDay - 1) advanceDays(h, 1);
  const askBefore = listing.ask;
  advanceDays(h, 1); // the claim lands
  assert.ok(h.state.lossLedger.impound, 'a raid does not take the hull — it marks it');
  assert.equal((listing.livingHull.scars || []).length, scarsBefore + 1);
  assert.equal(listing.dispute.outcome, 'raided');
  assert.ok(listing.ask < askBefore, 'the raid discount lands');
  assert.ok(h.of('impoundLot:raided').length === 1);
});

test('the attendant quiets a filed claim for a fee — once, latched before the charge', () => {
  const h = boot({ credits: 999999 });
  const listing = postWhere(h, (l) => l.dispute && l.dispute.kind === 'legal' && !l.redeem
    && l.auction.strike < l.listPrice * 0.6, // the quiet paper can't preempt the claim window
  { base: 'loss_q' });
  assert.ok(listing);
  dockAt(h, 'station_helios');
  const result = lot.impoundQuietClaim(h.state, h.bus);
  assert.equal(result.ok, true);
  assert.equal(listing.dispute.outcome, 'quieted');
  const charge = h.charges.filter((p) => p.reason === `impound_lot:quiet:${listing.lossId}`);
  assert.equal(charge.length, 1);
  const rep = h.of('faction:repDelta');
  assert.equal(rep.length, 1, 'the dead owner\'s house notices a quieted writ');
  assert.equal(rep[0].delta, ECON.quietClaimRep);
  assert.equal(lot.impoundQuietClaim(h.state, h.bus).ok, false, 'a quieted writ is gone');
  while (h.state.lossLedger.impound && dayOf(h.state) < listing.dispute.resolveDay + 1) advanceDays(h, 1);
  assert.ok(h.state.lossLedger.impound, 'a quieted claim never lands');
});

test('haggling lands at most once and the clerk counts the tries', () => {
  const h = boot({ credits: 999999 });
  const att = lot.impoundAttendantFor('station_helios');
  const bias = att.style === 'kind' ? 0.1 : att.style === 'grifter' ? -0.1 : 0;
  const listing = postWhere(h, (l) => !l.hold
    && unit(hash32(l.lossId, 'impound-haggle', 0)) < ECON.haggleChance + bias,
  { base: 'loss_h' });
  assert.ok(listing, 'a charmable book exists');
  assert.equal(lot.impoundHaggle(h.state, h.bus).reason, 'not_at_lot', 'no haggling by comms');
  dockAt(h, 'station_helios');
  const before = listing.ask;
  const res = lot.impoundHaggle(h.state, h.bus);
  assert.equal(res.ok, true);
  assert.ok(listing.ask < before, 'the charm cuts the ask');
  assert.equal(listing.price, listing.ask);
  assert.equal(lot.impoundHaggle(h.state, h.bus).reason, 'already', 'the deal is done once');
});

test('a deposit hold freezes the book until it lapses', () => {
  const h = boot({ credits: 999999 });
  const listing = postWhere(h, (l) => !l.dispute && !l.redeem, { base: 'loss_d' });
  dockAt(h, 'station_helios');
  const res = lot.impoundHoldDeposit(h.state, h.bus);
  assert.equal(res.ok, true);
  assert.equal(listing.hold.kind, 'deposit');
  assert.equal(listing.hold.price, listing.ask);
  assert.equal(listing.price, listing.hold.price, 'the buyer pays the reserved price');
  const fee = h.charges.filter((p) => p.reason === `impound_lot:hold:${listing.lossId}`);
  assert.equal(fee.length, 1);
  assert.equal(lot.impoundHoldDeposit(h.state, h.bus).ok, false, 'one deposit per book');
  advanceDays(h, ECON.holdDays);
  assert.ok(listing.hold, 'the hold still stands inside its window');
  assert.equal(listing.fees, 0, 'a reservation pauses the billing');
  advanceDays(h, 1);
  assert.equal(listing.hold, null, 'the hold lapses on schedule');
  assert.ok(h.of('impoundLot:holdLapsed').length === 1);
});

test('a bid over the quiet paper wins a held hull; a low bid is refused', () => {
  const h = boot({ credits: 999999 });
  const listing = postWhere(h, (l) => !l.dispute && !l.redeem, { base: 'loss_a' });
  dockAt(h, 'station_helios');
  assert.equal(lot.impoundPlaceBid(h.state, h.bus, listing.auction.strike).reason, 'not_auctioned',
    'the block must be open before the yard takes a bid');
  while (dayOf(h.state) < listing.auction.opensDay) advanceDays(h, 1);
  assert.equal(listing.auction.open, true);
  const low = lot.impoundPlaceBid(h.state, h.bus, listing.auction.strike - 1);
  assert.equal(low.reason, 'outbid');
  const win = lot.impoundPlaceBid(h.state, h.bus, listing.auction.strike);
  assert.equal(win.ok, true);
  assert.equal(listing.hold.kind, 'bid');
  assert.equal(listing.price, listing.auction.strike, 'the winner buys at their own paper');
  advanceDays(h, ECON.bidHoldDays + 3);
  assert.ok(h.state.lossLedger.impound || listing.hold === null, 'the machine resumes after the window');
  assert.ok(listing.hold === null || h.state.lossLedger.impound === listing, 'the hull waits out the bid window');
});

test('the insider tip sells once and opens the quiet paper on the board', () => {
  const h = boot({ credits: 999999 });
  const listing = postLot(h, { lossId: 'loss_i0' });
  dockAt(h, 'station_helios');
  const before = lot.impoundLotBoard(h.state);
  assert.equal(before.auction.strike, null, 'the strike is insider paper');
  const res = lot.impoundInsiderTip(h.state, h.bus);
  assert.equal(res.ok, true);
  assert.equal(res.tip.npcStrike, listing.auction.strike);
  const charge = h.charges.filter((p) => p.reason === `impound_lot:tip:${listing.lossId}`);
  assert.equal(charge.length, 1);
  assert.equal(lot.impoundInsiderTip(h.state, h.bus).reason, 'already', 'the paper is sold once');
  const after = lot.impoundLotBoard(h.state);
  assert.equal(after.auction.strike, listing.auction.strike);
});

test('the attendant greets a dock once a day and only at the lot yard', () => {
  const h = boot();
  const listing = postLot(h, { lossId: 'loss_g0' });
  dockAt(h, 'station_helios');
  const greets = h.of('impoundLot:greeted');
  assert.equal(greets.length, 1);
  assert.equal(greets[0].attendant, lot.impoundAttendantFor('station_helios').name);
  h.bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.equal(h.of('impoundLot:greeted').length, 1, 'same day, same greeting');
  dockAt(h, 'station_forge');
  assert.equal(h.of('impoundLot:greeted').length, 1, 'a foreign yard has no word of the lot');
  advanceDays(h, 1);
  dockAt(h, 'station_helios');
  assert.equal(h.of('impoundLot:greeted').length, 2, 'a new day, a new greeting');
  assert.ok(listing.greetDay >= 0);
});

test('the board is a copy that gates the insider intel honestly', () => {
  const h = boot();
  const listing = postWhere(h, (l) => l.redeem, { base: 'loss_p' });
  const board = lot.impoundLotBoard(h.state);
  assert.equal(board.open, true);
  assert.equal(board.lossId, listing.lossId);
  assert.equal(board.redeem.opensDay, null, 'redeem timing is intel, not a gift');
  board.ask = 1;
  board.auction.strike = 1;
  board.dispute = { bogus: true };
  const fresh = lot.impoundLotBoard(h.state);
  assert.equal(fresh.ask, listing.ask, 'mutating the board cannot reach the book');
  lot.impoundWatchLot(h.state, h.bus, true);
  assert.equal(lot.impoundLotBoard(h.state).redeem.opensDay, listing.redeem.opensDay,
    'a watcher earns the window without paying the clerk');
});

test('the kin offer a ransom when a marked hull docks a shipyard', () => {
  const h = boot();
  const lossId = ransomYesLossId();
  markedHullOwned(h, { lossId, deaths: 2, tier: 1 });
  dockAt(h, 'station_helios');
  const offers = h.of('impoundLot:ransomOffer');
  assert.equal(offers.length, 1, 'the offer is minted once');
  const shadow = h.state.player.ownedShips.at(-1).impoundShadow;
  assert.equal(shadow.ransom.state, 'offered');
  const expected = Math.max(ECON.ransomMinCr, Math.round(
    WASP.price * ECON.ransomPct + ECON.ransomPerDeathCr * 2 + ECON.ransomPerTierCr * 1,
  ));
  assert.equal(shadow.ransom.amount, expected);
  assert.equal(offers[0].amount, expected);
  assert.equal(shadow.ransom.stationId, 'station_helios');
  const comms = h.of('comms:popup').filter((p) => /papers|credits/i.test(p.text));
  assert.ok(comms.length >= 1, 'the attendant speaks the offer');
});

test('the gate is honest — a book the kin never come for latches as none', () => {
  const h = boot();
  markedHullOwned(h, { lossId: ransomNoLossId() });
  dockAt(h, 'station_helios');
  assert.equal(h.of('impoundLot:ransomOffer').length, 0);
  const shadow = h.state.player.ownedShips.at(-1).impoundShadow;
  assert.equal(shadow.ransom.state, 'none');
  advanceDays(h, 2);
  dockAt(h, 'station_helios');
  assert.equal(shadow.ransom.state, 'none', 'a dead latch never re-rolls');
});

test('accepting the ransom pays once and buries the grudge for good', () => {
  const h = boot();
  const owned = markedHullOwned(h, { lossId: ransomYesLossId() });
  const shadow = owned.impoundShadow;
  dockAt(h, 'station_helios');
  const offer = h.of('impoundLot:ransomOffer').at(-1);
  const creditsBefore = h.state.player.credits;
  const res = lot.impoundAcceptRansom(h.state, h.bus);
  assert.equal(res.ok, true);
  assert.equal(res.amount, offer.amount);
  assert.equal(shadow.ransom.state, 'paid');
  assert.equal(shadow.resolved, 'ransomed');
  assert.equal(shadow.nextAt, null);
  assert.equal(owned.impoundRansom.amount, offer.amount);
  const grants = h.grants.filter((p) => p.reason === `impound_lot:ransom:${shadow.lossId}`);
  assert.equal(grants.length, 1);
  assert.equal(h.state.player.credits, creditsBefore + offer.amount);
  assert.equal(lot.impoundAcceptRansom(h.state, h.bus).ok, false, 'the kin do not pay twice');
  // The grudge reads 'ransomed' as dead paper — its tick stays silent.
  const before = h.all.length;
  tickImpoundGrudge(h.state, { bus: h.bus });
  const grudgeEvents = h.all.slice(before).filter((row) => row.name.startsWith('impoundGrudge:'));
  assert.equal(grudgeEvents.length, 0, 'a ransomed hull never surfaces again');
});

test('a ransom is refused at its own berth and the collector hears the answer', () => {
  const h = boot();
  const owned = markedHullOwned(h, { lossId: ransomYesLossId() });
  const shadow = owned.impoundShadow;
  dockAt(h, 'station_helios'); // the offer is minted at this berth
  assert.equal(h.of('impoundLot:ransomOffer').length, 1);
  dockAt(h, 'station_forge'); // a yard that is not the offer's berth
  const away = lot.impoundAcceptRansom(h.state, h.bus);
  assert.equal(away.reason, 'wrong_berth', 'the papers only trade at the named berth');
  dockAt(h, 'station_helios');
  const nextAtBefore = shadow.nextAt;
  const no = lot.impoundDeclineRansom(h.state, h.bus);
  assert.equal(no.ok, true);
  assert.equal(shadow.ransom.state, 'refused');
  assert.ok(shadow.nextAt <= nextAtBefore, 'a refusal is heard — the hunt comes sooner');
  assert.equal(shadow.resolved, null, 'the grudge stays open');
  assert.equal(h.grants.length, 0, 'a refusal pays nothing');
});

test('a lapsed offer is gone for good — the window is real', () => {
  const h = boot();
  const owned = markedHullOwned(h, { lossId: ransomYesLossId() });
  const shadow = owned.impoundShadow;
  dockAt(h, 'station_helios');
  advanceDays(h, ECON.ransomWindowDays + 1);
  assert.equal(shadow.ransom.state, 'lapsed');
  assert.equal(h.of('impoundLot:ransomLapsed').length, 1);
  dockAt(h, 'station_helios');
  assert.equal(shadow.ransom.state, 'lapsed', 'the kin do not re-offer');
  assert.equal(lot.impoundAcceptRansom(h.state, h.bus).reason, 'no_offer');
  assert.equal(h.grants.length, 0);
});

test('a live collector blocks the paper trade — no paying while hunted', () => {
  const h = boot();
  const owned = markedHullOwned(h, { lossId: ransomYesLossId() });
  const shadow = owned.impoundShadow;
  dockAt(h, 'station_helios');
  shadow.liveId = 44; // the nemesis is in the sky — generation-tagged, so stale ids cannot fake it
  const res = lot.impoundAcceptRansom(h.state, h.bus);
  assert.equal(res.reason, 'collector_active');
  assert.equal(h.grants.length, 0);
  assert.equal(shadow.ransom.state, 'offered', 'the offer survives the refused trade');
});

test('save:loaded restores the book and the ransom without free progress', () => {
  const h = boot();
  const listing = postWhere(h, (l) => !l.dispute && !l.redeem, { base: 'loss_s' });
  advanceDays(h, 2);
  const owned = markedHullOwned(h, { lossId: ransomYesLossId() });
  dockAt(h, 'station_helios');
  const saved = {
    impound: JSON.parse(JSON.stringify(listing)),
    shadow: JSON.parse(JSON.stringify(owned.impoundShadow)),
    econDay: listing.econDay,
    fees: listing.fees,
  };
  assert.equal(saved.impound.lotSchema, lot.IMPOUND_LOT_SCHEMA);
  assert.equal(saved.shadow.ransom.state, 'offered');

  const h2 = boot();
  h2.state.simTime = h.state.simTime;
  h2.state.tick = h.state.tick;
  h2.state.lossLedger.impound = saved.impound;
  const owned2 = { defId: 'ship_wasp', fittings: [], appearance: null, impoundShadow: saved.shadow };
  h2.state.player.ownedShips.push(owned2);
  h2.state.player.activeShipIndex = 1;
  lot.ensureImpoundLotWiring(h2.state, { bus: h2.bus });
  h2.bus.emit('save:loaded', {});
  const restored = h2.state.lossLedger.impound;
  assert.equal(restored.econDay, saved.econDay, 'the fee cursor survives — no skipped days');
  assert.equal(restored.fees, saved.fees, 'fees already billed stay billed');
  assert.equal(owned2.impoundShadow.ransom.state, 'offered', 'the offer survives the envelope');
  advanceDays(h2, 1);
  assert.equal(restored.fees, saved.fees + Math.max(ECON.storageFeeMinCr, Math.round(restored.listPrice * ECON.storageFeePct)),
    'billing resumes exactly where the save left it — no free day, no double day');
});

test('a schema-1 listing normalizes with the book opening on read day', () => {
  const h = boot();
  const listing = postLot(h, { lossId: 'loss_o2' }); // seeded clean — no claim, no kin
  delete h.state.lossLedger.impound;
  // A legacy record: the CRT-03 shape with none of the economy fields.
  const legacy = JSON.parse(JSON.stringify(listing));
  for (const key of ['lotSchema', 'postedAt', 'postDay', 'econDay', 'listPrice', 'ask', 'fees', 'hold',
    'bid', 'tip', 'watched', 'haggles', 'haggled', 'bountyPaid', 'holdDepositPaid', 'greetDay',
    'killedByPlayer', 'killerId', 'victimFactionId', 'auction', 'dispute', 'redeem', 'closed']) {
    delete legacy[key];
  }
  h.state.lossLedger.impound = legacy;
  // The first read is the grace day — the book opens there, never retroactively.
  advanceDays(h, 3);
  const norm = h.state.lossLedger.impound;
  assert.ok(norm, 'a normalized legacy book stays on the lot');
  assert.equal(norm.postDay, dayOf(h.state), 'the grace day is the first day the book is read');
  assert.equal(norm.econDay, norm.postDay);
  assert.equal(norm.fees, 0, 'no retro fees from before the save');
  assert.equal(norm.listPrice, 11200, 'the list price reads off the old ask');
  const perDay = Math.max(ECON.storageFeeMinCr, Math.round(norm.listPrice * ECON.storageFeePct));
  advanceDays(h, 2);
  assert.equal(h.state.lossLedger.impound.fees, perDay * 2,
    'billing counts forward from the grace day only');
});

test('a month-stale book is written off once, not walked day by day', () => {
  const h = boot();
  const listing = postLot(h, { lossId: 'loss_w0' });
  h.state.simTime += (ECON.catchUpDayCap + 5) * DAY;
  h.bus.emit('day:tick', { days: dayOf(h.state), elapsed: ECON.catchUpDayCap + 5 });
  assert.equal(h.state.lossLedger.impound, undefined);
  const closed = h.of('impoundLot:closed');
  assert.equal(closed.length, 1);
  assert.equal(closed[0].kind, 'written_off');
  h.bus.emit('day:tick', { days: dayOf(h.state), elapsed: 0 });
  assert.equal(h.of('impoundLot:closed').length, 1, 'a written book closes once');
});

test('verbs refuse malformed books and wrong berths without touching the economy', () => {
  const h = boot();
  assert.equal(lot.impoundHaggle(h.state, h.bus).reason, 'no_lot');
  assert.equal(lot.impoundPlaceBid(h.state, h.bus, 500).reason, 'no_lot');
  assert.equal(lot.impoundHoldDeposit(h.state, h.bus).reason, 'no_lot');
  assert.equal(lot.impoundInsiderTip(h.state, h.bus).reason, 'no_lot');
  assert.equal(lot.impoundQuietClaim(h.state, h.bus).reason, 'no_lot');
  const listing = postLot(h, { lossId: 'loss_x0' });
  dockAt(h, 'station_forge');
  assert.equal(lot.impoundHaggle(h.state, h.bus).reason, 'not_at_lot');
  assert.equal(lot.impoundInsiderTip(h.state, h.bus).reason, 'not_at_lot');
  assert.equal(lot.impoundPlaceBid(h.state, h.bus, 'garbage').reason, 'not_at_lot');
  assert.equal(h.charges.length, 0, 'a refused verb spends nothing');
  assert.ok(listing.price === 11200, 'the book is untouched');
});

test('end to end: kill, watch the block, tip, win the paper, buy at the held price, then take the kin\'s coin', () => {
  const h = boot({ credits: 999999 });
  // A hull whose seeded book has no claim and whose papers the kin want back.
  const listing = postWhere(h, (l) => !l.dispute && !l.redeem
    && unit(hash32(l.lossId, 'impound-ransom')) < ECON.ransomChance,
  { base: 'loss_e' });
  assert.ok(listing, 'a clean buyable book with a ransom gate exists');
  lot.impoundWatchLot(h.state, h.bus, true);
  while (dayOf(h.state) < listing.auction.opensDay) advanceDays(h, 1);
  dockAt(h, 'station_helios');
  const tip = lot.impoundInsiderTip(h.state, h.bus);
  assert.equal(tip.ok, true);
  const bid = tip.tip.npcStrike;
  const win = lot.impoundPlaceBid(h.state, h.bus, bid);
  assert.equal(win.ok, true);
  h.bus.emit('ui:buyShip', { defId: 'ship_wasp', listingId: listing.listingId });
  const bought = h.state.player.ownedShips.at(-1);
  assert.equal(bought.rapSheet.id, listing.deed.id, 'the bought hull keeps the listed papers');
  const buyCharge = h.charges.filter((p) => p.reason === 'buyShip:ship_wasp').at(-1);
  assert.equal(buyCharge.amount, bid, 'the yard charges the held bid, not the ask');
  assert.ok(bought.impoundShadow, 'the shadow follows the hull');
  assert.equal(h.of('impoundLot:sold').at(-1).lossId, listing.lossId);
  h.state.player.activeShipIndex = h.state.player.ownedShips.length - 1;
  dockAt(h, 'station_helios'); // the marked hull's first berth under the new owner
  const offer = h.of('impoundLot:ransomOffer').at(-1);
  assert.ok(offer, 'the kin surface once the marked hull is aboard');
  const paid = lot.impoundAcceptRansom(h.state, h.bus);
  assert.equal(paid.ok, true);
  assert.equal(bought.impoundShadow.resolved, 'ransomed');
});

test('the whole flow stays deterministic — same seeds, same book, same money', () => {
  const run = () => {
    const h = boot({ credits: 999999 });
    const listing = postLot(h, { lossId: 'loss_det0' });
    advanceDays(h, 6);
    dockAt(h, 'station_helios');
    return {
      listing: JSON.parse(JSON.stringify(h.state.lossLedger.impound || listing)),
      events: h.all.map((row) => ({ name: row.name, p: JSON.parse(JSON.stringify(row.p ?? null)) })),
      charges: h.charges.length,
      grants: h.grants.length,
    };
  };
  const a = run();
  const b = run();
  assert.deepEqual(b.listing, a.listing, 'the book is seeded, not rolled');
  assert.deepEqual(b.events.map((e) => e.name), a.events.map((e) => e.name), 'the event order is seeded');
  assert.equal(b.charges, a.charges);
  assert.equal(b.grants, a.grants);
});

test('a book that arrives by restore still lives — the lot clock is wired at init, not only at post', () => {
  // First session: a real post, then the exact envelope the save carries out.
  const h = boot();
  const listing = postWhere(h, (l) => !l.dispute && !l.redeem, { base: 'loss_r2' });
  assert.ok(listing);
  const saved = JSON.parse(JSON.stringify(h.ledger.serialize()));

  // Second session: no post ever runs here. If the lot's bus seams were only
  // wired by postImpoundListing, this restored book would sit frozen forever —
  // no fees, no greeting, no sold note. The whole economy has to live anyway.
  const h2 = boot();
  h2.state.simTime = h.state.simTime;
  h2.state.tick = h.state.tick;
  h2.ledger.deserialize(saved);
  h2.bus.emit('save:loaded', {});
  const restored = h2.state.lossLedger.impound;
  assert.ok(restored, 'the envelope hands the lot to the new session');
  advanceDays(h2, 1);
  const perDay = Math.max(ECON.storageFeeMinCr, Math.round(restored.listPrice * ECON.storageFeePct));
  assert.equal(restored.fees, perDay, 'a restored book bills its days');
  dockAt(h2, 'station_helios');
  assert.equal(h2.of('impoundLot:greeted').length, 1, 'a restored book still greets its yard');
  h2.state.player.credits = 999999;
  h2.bus.emit('ui:buyShip', { defId: 'ship_wasp', listingId: restored.listingId });
  assert.equal(h2.of('impoundLot:sold').length, 1, 'a restored book still files its sale');
});

test('a restored marked hull still draws the kin at a shipyard berth', () => {
  // No post this session — only init wiring can carry the dock beat that mints
  // the kin's counter-offer on a bought marked hull.
  const h = boot();
  const owned = {
    defId: 'ship_wasp', fittings: [], appearance: null,
    impoundShadow: mintImpoundShadow({ lossId: ransomYesLossId(3), callsign: 'Marrow' }, h.state.simTime),
  };
  h.state.player.ownedShips.push(owned);
  h.state.player.activeShipIndex = h.state.player.ownedShips.length - 1;
  dockAt(h, 'station_helios');
  assert.equal(owned.impoundShadow.ransom && owned.impoundShadow.ransom.state, 'offered');
  assert.equal(h.of('impoundLot:ransomOffer').length, 1);
});

test('redemption closes at the kin\'s paper — over the ask, never under', () => {
  const h = boot();
  // A seeded ransom clearly above the day's ask makes the defect visible: the
  // yard must take the kin's higher paper, not the marked-down board price.
  const listing = postWhere(h, (l) => l.redeem && !l.dispute
    && l.redeem.ransomCr > l.listPrice * 1.15, { base: 'loss_k2' });
  assert.ok(listing, 'a redeem book priced over the ask exists');
  while (h.state.lossLedger.impound && dayOf(h.state) < listing.redeem.opensDay) advanceDays(h, 1);
  assert.equal(h.state.lossLedger.impound, undefined, 'the kin take the hull');
  const redeemed = h.of('impoundLot:redeemed').at(-1);
  assert.ok(redeemed, 'the redemption receipt is filed');
  assert.equal(redeemed.price, Math.round(listing.redeem.ransomCr), 'the kin pay their own paper');
  assert.ok(redeemed.price > Math.round(listing.ask), 'the paper beats the board ask');
  assert.equal(h.of('impoundLot:closed').at(-1).price, redeemed.price, 'the close and the receipt agree');
});

test('a corrupt book heals its day cursors — nothing can pin the machine shut', () => {
  const h = boot();
  const listing = postWhere(h, (l) => !l.dispute && !l.redeem, { base: 'loss_c2' });
  assert.ok(listing);
  const today = dayOf(h.state);
  const far = today + 99999;
  // A hostile book: every cursor pinned ahead of the clock, a zombie close
  // flag on a live listing, a hold that outlives its window, a claim that
  // never lands.
  listing.postDay = far;
  listing.econDay = far;
  listing.closed = 'npc';
  listing.auction.opensDay = far + 10;
  listing.hold = { kind: 'deposit', price: 1, untilDay: far + 20 };
  listing.dispute = {
    kind: 'legal', claimant: 'the Halloran estate',
    filedDay: far, resolveDay: far + 99, outcome: 'pending',
  };
  const healed = lot.impoundListingFor(h.state);
  assert.equal(healed, listing);
  assert.equal(healed.postDay, today, 'a forward postDay folds back to read day');
  assert.equal(healed.econDay, today, 'a forward econDay folds back to read day');
  assert.equal(healed.closed, null, 'a live book was never closed');
  assert.ok(healed.auction.opensDay <= today + ECON.auctionDelayDays + 1,
    'the block opens on a real day');
  assert.ok(healed.dispute.resolveDay
    <= healed.dispute.filedDay + ECON.disputeResolveDays + ECON.disputeResolveSpan,
    'a filed claim still lands inside its window');
  assert.ok(healed.hold.untilDay <= today + Math.max(ECON.bidHoldDays, ECON.holdDays),
    'a pinned hold is bounded by the honest window');
  // The healed book lives: the clamped hold retires through the real lapse
  // seam and the machine eventually moves the hull — a corrupt pin cannot
  // wedge it shut.
  let guard = 40;
  while (h.state.lossLedger.impound && guard > 0) { advanceDays(h, 1); guard -= 1; }
  assert.equal(h.state.lossLedger.impound, undefined, 'the healed book still resolves');
  assert.ok(h.of('impoundLot:holdLapsed').length >= 1, 'the hold lapsed through the real seam');
});

test('a nested day beat inside the close emit cannot unlatch or reprocess the dying book', () => {
  const h = boot();
  const listing = postWhere(h, (l) => l.redeem && !l.dispute, { base: 'loss_re' });
  assert.ok(listing, 'a redeem book exists');
  const redeemDay = listing.redeem.opensDay;
  // Jump so the redeem close lands mid-catch-up with a day of book still
  // behind it. The recovery bounty emit inside closeLot is the re-entrancy
  // window: a nested tick must find the record already delisted — a live
  // record carrying `closed` would be "healed" back open and billed again.
  h.state.simTime = (redeemDay + 1) * DAY;
  let reentered = 0;
  h.bus.on('economy:grantCredits', (p) => {
    if (String(p && p.reason || '').startsWith('impound_lot:recovery:')) {
      reentered += 1;
      lot.tickImpoundLot(h.state, { bus: h.bus });
    }
  });
  h.bus.emit('day:tick', { days: dayOf(h.state), elapsed: redeemDay + 1 });
  assert.ok(reentered >= 1, 'the re-entrant window was exercised');
  assert.equal(h.state.lossLedger.impound, undefined);
  const closed = h.of('impoundLot:closed');
  assert.equal(closed.length, 1, 'the hull closes once even under a nested beat');
  assert.equal(closed[0].kind, 'redeem');
  assert.equal(h.of('impoundLot:redeemed').length, 1);
  const lateFees = h.of('impoundLot:feesAccrued').filter((p) => p.day > redeemDay);
  assert.equal(lateFees.length, 0, 'the book never bills a day past its own close');
  const bounties = h.grants.filter((p) => p.reason === `impound_lot:recovery:${listing.lossId}`);
  assert.equal(bounties.length, 1, 'the recovery share still pays exactly once');
});

test('a corrupt non-record impound never wedges the yard — the next hull still posts', () => {
  const h = boot();
  h.state.lossLedger.impound = ['not', 'a', 'listing'];
  assert.equal(lot.impoundListingFor(h.state), null, 'an array is not a listing');
  const listing = postLot(h, { lossId: 'loss_arr0' });
  assert.ok(listing, 'the corrupt slot heals — the new hull posts');
  assert.equal(h.state.lossLedger.impound, listing);
  h.state.lossLedger.impound = 42;
  const second = postLot(h, { lossId: 'loss_arr1' });
  assert.ok(second, 'a primitive slot heals the same way');
});

test('a ransom refused past its window files the same lapse receipt the tick would', () => {
  const h = boot();
  const owned = markedHullOwned(h, { lossId: ransomYesLossId(1) });
  const shadow = owned.impoundShadow;
  dockAt(h, 'station_helios');
  assert.equal(shadow.ransom.state, 'offered');
  // Cross the window without a day:tick — the verb itself discovers the lapse
  // and must announce it: a listener tracking the open offer cannot be left
  // holding a dead row.
  h.state.simTime += (ECON.ransomWindowDays + 1) * DAY;
  const res = lot.impoundAcceptRansom(h.state, h.bus);
  assert.equal(res.reason, 'lapsed');
  assert.equal(shadow.ransom.state, 'lapsed');
  assert.equal(h.of('impoundLot:ransomLapsed').length, 1, 'the lapse is announced once');
  assert.equal(h.grants.length, 0);
  const again = lot.impoundAcceptRansom(h.state, h.bus);
  assert.equal(again.reason, 'no_offer');
  assert.equal(h.of('impoundLot:ransomLapsed').length, 1, 'no second receipt');
});

test('a paper offer with no named berth never trades — the berth gate is real', () => {
  const h = boot();
  const owned = markedHullOwned(h, { lossId: ransomYesLossId(2) });
  const shadow = owned.impoundShadow;
  dockAt(h, 'station_helios');
  assert.equal(shadow.ransom.state, 'offered');
  shadow.ransom.stationId = null; // a forged open ticket — no named berth
  h.state.ui.docked = false;
  h.state.ui.dockedStationId = null;
  const res = lot.impoundAcceptRansom(h.state, h.bus);
  assert.equal(res.reason, 'wrong_berth', 'an offer that names no berth trades nowhere');
  assert.equal(h.grants.length, 0);
  assert.equal(shadow.ransom.state, 'offered', 'the offer survives the refused trade');
  assert.equal(lot.impoundDeclineRansom(h.state, h.bus).reason, 'wrong_berth',
    'a refusal needs the named berth too');
});

test('a book whose paper can never be met heals — floor and strike stay reachable', () => {
  const h = boot();
  const listing = postWhere(h, (l) => !l.dispute && !l.redeem, { base: 'loss_sf' });
  assert.ok(listing);
  listing.auction.strike = 1;   // forged paper under any possible markdown
  listing.auction.floor = 1e9;  // forged floor that would launch the ask sky-high
  const healed = lot.impoundListingFor(h.state);
  assert.ok(healed.auction.floor <= healed.listPrice, 'the floor is a share of list, not a wall');
  assert.ok(healed.auction.strike >= healed.auction.floor, 'the quiet paper is reachable');
  let guard = 40;
  while (h.state.lossLedger.impound && guard > 0) { advanceDays(h, 1); guard -= 1; }
  assert.equal(h.state.lossLedger.impound, undefined, 'the healed book still resolves');
  assert.equal(h.of('impoundLot:closed').at(-1).kind, 'npc', 'the quiet bidder takes it at the floor');
});

test('a kill through the real ledger path still posts and runs the living book', () => {
  const h = boot();
  h.state.entities.set(7, {
    id: 7,
    alive: true,
    type: 'ship',
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    factionId: 'faction_reach',
    data: {
      defId: 'ship_wasp',
      callsign: 'Marrow',
      sectorId: 'sector_helios_prime',
      livingHull: livingHullWithScar(null, {
        id: 'scar-bow', cause: 'weapon', surface: 'weapon', band: 'heavy',
        facing: 'bow', atT: 40, tick: 2400, patchedAtT: null,
      }, 40),
    },
  });
  combatPrototype.kill.call({ state: h.state, bus: h.bus }, h.state.entities.get(7), 1);
  const listing = h.state.lossLedger.impound;
  assert.ok(listing, 'the ledger posts through the real entity:killed path');
  assert.equal(listing.lotSchema, lot.IMPOUND_LOT_SCHEMA);
  advanceDays(h, 1);
  assert.ok(listing.fees > 0 || h.state.lossLedger.impound == null,
    'the day clock runs on the posted book');
});

test('the reclaim receipt emits after the book is delisted — a nested beat cannot reclose it', () => {
  const h = boot();
  const listing = postWhere(h, (l) => l.dispute && l.dispute.kind === 'legal' && !l.redeem
    && unit(hash32(l.lossId, 'impound-dispute-outcome', l.dispute.resolveDay)) < ECON.disputeReclaimChance,
  { base: 'loss_rc' });
  assert.ok(listing, 'a reclaimable court claim exists');
  const resolveDay = listing.dispute.resolveDay;
  let nested = 0;
  h.bus.on('impoundLot:disputeResolved', (p) => {
    if (!p || p.outcome !== 'reclaimed' || nested > 0) return;
    nested += 1;
    // The old emit ran while the book was still live: a nested beat marches the
    // remaining day engine and can close it under a different kind — an
    // adversarial paper + an open block makes the very next day an 'npc' sale
    // that also pays the recovery share the court claim denies.
    listing.auction.strike = 1e9;
    listing.auction.opensDay = 0;
    h.bus.emit('day:tick', { days: dayOf(h.state), elapsed: 0 });
  });
  // Land the claim with one more day still behind the cursor, so the nested
  // beat has a real day left to run if the book is still live inside the emit.
  h.state.simTime = (resolveDay + 1) * DAY;
  h.bus.emit('day:tick', { days: resolveDay + 1, elapsed: resolveDay + 1 });
  assert.equal(nested, 1, 'the re-entrant window was exercised');
  assert.equal(h.state.lossLedger.impound, undefined);
  const closed = h.of('impoundLot:closed');
  assert.equal(closed.length, 1, 'the hull leaves the lot once');
  assert.equal(closed[0].kind, 'reclaim', 'the court takes the hull — the nested beat cannot sell it first');
  assert.equal(h.of('impoundLot:auctionWon').length, 0, 'no quiet-bidder win on a reclaimed book');
  const bounties = h.grants.filter((p) => String(p.reason || '').startsWith('impound_lot:recovery:'));
  assert.equal(bounties.length, 0, 'a reclaimed hull pays no recovery share');
});

test('the buy seam charges the healed book price — a forged price field cannot undercut the ask', () => {
  const h = boot({ credits: 999999 });
  const listing = postLot(h, { lossId: 'loss_fp0' });
  dockAt(h, 'station_helios');
  listing.price = 1; // a foreign write — the raw record diverges from its ask
  h.bus.emit('ui:buyShip', { defId: 'ship_wasp', listingId: listing.listingId });
  const charge = h.charges.filter((p) => p.reason === 'buyShip:ship_wasp').at(-1);
  assert.ok(charge, 'the purchase went through');
  assert.equal(charge.amount, listing.ask, 'the yard charges the book, not the chit');
  assert.equal(listing.price, listing.ask, 'the quote read the normalized price');
  assert.equal(h.state.lossLedger.impound, undefined);
});

test('a tiny-price book cannot stall the markdown — the block always walks to its floor', () => {
  const h = boot();
  const listing = postWhere(h, (l) => !l.dispute && !l.redeem, { base: 'loss_ti' });
  assert.ok(listing);
  // Hostile arithmetic: prices small enough that round(ask * 0.88) === ask.
  // Without a progress floor the ask would sit at 4 forever — strike 1 never
  // met — and the single lot wedges every future post.
  listing.listPrice = 4;
  listing.ask = 4;
  listing.price = 4;
  listing.auction = { opensDay: dayOf(h.state) + 1, floor: 1, strike: 1, open: false, steps: 0 };
  let guard = 40;
  while (h.state.lossLedger.impound && guard > 0) { advanceDays(h, 1); guard -= 1; }
  assert.equal(h.state.lossLedger.impound, undefined, 'the block walks the ask down a credit a day and sells');
  assert.equal(h.of('impoundLot:closed').at(-1).kind, 'npc', 'the quiet paper takes it at the floor');
});

test('a foreign ransom state word heals to the dead latch instead of wedging the offer', () => {
  const h = boot();
  const owned = markedHullOwned(h, { lossId: ransomYesLossId(4) });
  const shadow = owned.impoundShadow;
  shadow.ransom = { state: 'bogus', amount: 900 }; // a foreign write — not one of the five words
  dockAt(h, 'station_helios');
  assert.equal(shadow.ransom.state, 'none', 'the dead latch heals the wedge');
  assert.equal(h.of('impoundLot:ransomOffer').length, 0, 'dead paper draws no counter-offer');
  dockAt(h, 'station_helios');
  assert.equal(shadow.ransom.state, 'none', 'the latch never re-rolls');
});

test('a pinned ransom window still lapses — the offer cannot stand forever', () => {
  const h = boot();
  const owned = markedHullOwned(h, { lossId: ransomYesLossId(5) });
  const shadow = owned.impoundShadow;
  dockAt(h, 'station_helios');
  assert.equal(shadow.ransom.state, 'offered');
  shadow.ransom.untilDay = dayOf(h.state) + 9999; // a foreign pin far past the minted window
  advanceDays(h, ECON.ransomWindowDays + 1);
  assert.equal(shadow.ransom.state, 'lapsed', 'the pin folds back into the honest window');
  assert.equal(h.of('impoundLot:ransomLapsed').length, 1);
  dockAt(h, 'station_helios');
  assert.equal(shadow.ransom.state, 'lapsed', 'the kin do not re-offer');
});
