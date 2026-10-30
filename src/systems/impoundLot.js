// One seized hull on a station lot — and everything the yard does to it while
// it sits unsold. The loss ledger and a surrender custody transfer are the only
// posters. Ships buys the listing; law reads the papers. This module does not
// write credits, heat, standing, cargo, or the player's deed record.
//
// The living lot economy, layered on the original posting seam:
//   * Storage fees. The yard bills its cradle by the day and folds the bill
//     into the ask — a hull gets dearer until the fee book caps.
//   * Auctions. Past a seeded delay the yard writes the price down toward a
//     floor, and a quiet bidder (a seeded strike price per hull) takes it the
//     day the ask crosses their paper. The player may bid at the yard: beat
//     the quiet paper and the hull is held at the bid for a pickup window.
//   * Disputes. Some seizures draw paper: a court claim that can pull the
//     hull off the lot entirely, or muscle that breaks into the cradle and
//     leaves a scar. The attendant quiets a claim for a fee.
//   * Redemption. The dead owner's crew or kin may post the yard's ransom
//     before the hull ever sells — a watched lot warns a day early.
//   * The attendant. Every yard keeps a named clerk on the cradle: greeting a
//     dock about the lot's state, haggling once, selling holds and the
//     insider paper, quoting the board.
//   * The recovery bounty. The pilot whose kill stocked the lot collects a
//     cut when the yard finally moves the hull — once, and never on a hull
//     the same pilot bought.
//   * Ransom. impoundGrudge owns the nemesis that follows a bought marked
//     hull; this file owns the kin's counter-offer. Dock a shipyard and the
//     dead owner's people may offer to buy the papers back — accepting pays
//     through the economy grant and puts the shadow to rest as 'ransomed'.
//
// Determinism: every roll keys on the seeded lossId through hash32; clocks are
// simTime days (600 s, matching lossLedger's dayOf). Durable state rides the
// listing itself (lossLedger.serialize carries it whole) and the owned hull's
// impoundShadow.ransom — plain JSON both, normalized on read. Money moves only
// through economy:chargeCredits / economy:grantCredits; once-only payouts
// latch before they emit.

import { hash32 } from '../core/rng.js';
import {
  LIVING_HULL_SCAR_FACINGS,
  livingHullRenown,
  livingHullScars,
  livingHullWithScar,
  normalizeLivingHull,
} from '../core/livingHull.js';
import { LAWFUL_STATION_FACTIONS } from '../data/factions/index.js';
import { deedLine } from '../data/deedPhrases.js';
import { SECTORS } from '../data/sectors.js';
import { SHIPS } from '../data/ships.js';
import { DEED_KINDS, hullPaperDeed } from './deedRecord.js';

const SHIP_BY_ID = new Map(SHIPS.map((ship) => [ship.id, ship]));
const OVERBORE_ACCEL_KEYS = Object.freeze(['mainAccel', 'maxAccel', 'rcsForwardAccel', 'fieldAccel']);
const OVERBORE_MIN = 1.05;
const OVERBORE_MAX = 1.25;
const IMPOUND_ACCEL_MULT = 1.12;
const RAW_ID = /\b(?:ship|sector|station|faction|loss)_[a-z0-9_]+\b/i;

// ── the living lot ────────────────────────────────────────────────────────────
// Schema 2 listings carry the whole economy on the record itself, so the
// ledger's existing serialize() round-trips it untouched.

export const IMPOUND_LOT_SCHEMA = 2;

export const IMPOUND_LOT_ECON = Object.freeze({
  dayS: 600,                        // one in-game day (lossLedger dayOf agrees)
  storageFeePct: 0.018,             // cradle bill per day, share of the posted ask
  storageFeeMinCr: 40,
  storageFeeCapPct: 0.35,           // the yard stops billing past this share
  auctionDelayDays: 3,              // a fresh lot gets this many days at full ask
  auctionStep: 0.88,                // the markdown applied each open day
  auctionFloorPct: 0.45,            // the yard never writes under this share of list
  npcStrikeMinPct: 0.55,            // quiet bidder's paper: 55-90% of list
  npcStrikeSpanPct: 0.35,
  bidHoldDays: 2,                   // a winning bid holds the hull this long
  holdDays: 2,                      // a deposit hold reserves this long
  holdDepositPct: 0.02,
  holdDepositMinCr: 150,
  tipFeePct: 0.015,
  tipFeeMinCr: 120,
  quietFeePct: 0.08,
  quietFeeMinCr: 100,
  haggleMaxAttempts: 2,
  haggleChance: 0.55,
  haggleMinPct: 0.06,
  haggleSpanPct: 0.05,
  disputeChance: 0.3,               // per listing, seeded on the lossId
  disputeResolveDays: 2,            // days filed before the claim lands
  disputeResolveSpan: 2,
  disputePaperShare: 0.45,          // muscle-vs-court split of claims
  disputeReclaimChance: 0.55,       // a landed court claim usually wins
  disputeRaidChance: 0.6,           // a landed muscle claim usually breaks in
  disputeRaidDiscount: 0.8,         // a raid-scarred hull sells cheaper
  quietClaimRep: -2,                // the dead owner's house notices a quieted writ
  redeemChance: 0.35,
  redeemOpenMinDays: 1,
  redeemOpenSpanDays: 3,
  redeemRansomPct: 1.05,            // kin pay over the ask — the yard sells back
  redeemRansomSpan: 0.3,
  ransomChance: 0.45,               // a marked hull draws the kin's offer this often
  ransomPct: 0.38,                  // share of catalog price offered for the papers
  ransomPerDeathCr: 180,            // a defended hull costs the kin more
  ransomPerTierCr: 90,
  ransomMinCr: 400,
  ransomWindowDays: 2,
  recoveryBountyPct: 0.12,          // the yard's cut to the pilot who stocked it
  catchUpDayCap: 30,                // past this the book is just written off
  journalCap: 6,
});
const ECON = IMPOUND_LOT_ECON;
const DAY_S = ECON.dayS;

// The named help on the cradle — same attendant on every visit to the same yard.
const ATTENDANT_CAST = Object.freeze([
  Object.freeze({ name: 'Petra Vole', style: 'clerk' }),
  Object.freeze({ name: 'Ossie Bram', style: 'yardhand' }),
  Object.freeze({ name: 'Linna Far', style: 'kind' }),
  Object.freeze({ name: 'Drewe Caul', style: 'grifter' }),
]);

const LEGAL_CLAIMANTS = Object.freeze([
  'the Halloran estate', 'a dock-court petition', 'the Marlowe Trust', 'a registered next-of-kin',
]);
const PAPER_CLAIMANTS = Object.freeze([
  'a crew calling itself the Red Ledger', 'unregistered salvagers', 'the old outfit',
]);
const KIN_CALLERS = Object.freeze([
  (p) => `${p}'s old crew`,
  (p) => `kin of ${p}`,
  (p) => `the house that lost ${p}`,
  (p) => `the outfit ${p} flew for`,
]);

// ── small deterministic helpers ───────────────────────────────────────────────

function unit(hash) { return (hash >>> 0) / 0xffffffff; }
function dayOf(simTime) { return Math.floor((Number(simTime) || 0) / DAY_S); }

function dockedStationId(state) {
  const ui = state && state.ui;
  if (ui && ui.docked === true && typeof ui.dockedStationId === 'string' && ui.dockedStationId) {
    return ui.dockedStationId;
  }
  const flags = state && state.player && state.player.flags;
  return flags && flags.docked && typeof flags.dockedStationId === 'string'
    ? flags.dockedStationId : null;
}

function playerCredits(state) {
  const p = state && state.player;
  return p && Number.isFinite(p.credits) ? p.credits : 0;
}

function emitLot(state, ctx, name, payload) {
  if (ctx && typeof ctx.emit === 'function') { ctx.emit(name, payload); return true; }
  const bus = (ctx && ctx.bus) || (state && state.bus);
  if (bus && typeof bus.emit === 'function') { bus.emit(name, payload); return true; }
  return false;
}

function speakLot(state, ctx, sender, text, ttl = 8) {
  if (!text || RAW_ID.test(text)) return false;
  return emitLot(state, ctx, 'comms:popup', { sender, text, category: 'ambient', ttl });
}

function toastLot(state, ctx, text, kind = 'info', ttl = 5) {
  if (!text || RAW_ID.test(text)) return false;
  return emitLot(state, ctx, 'toast', { text, kind, ttl });
}

function newsLot(state, ctx, text, lot, kindSuffix, extra = {}) {
  if (!text || RAW_ID.test(text)) return false;
  return emitLot(state, ctx, 'news:publish', {
    text,
    kind: 'impound_lot',
    eventId: `impound-lot:${lot.lossId}:${kindSuffix}`,
    source: 'impoundLot',
    sourceRef: lot.listingId,
    stationId: lot.stationId,
    sectorId: lot.sectorId,
    ...extra,
  });
}

/** The yard's attendant — a face, not a function. Same name on every visit. */
export function impoundAttendantFor(stationId) {
  if (!stationId) return null;
  const who = ATTENDANT_CAST[hash32(String(stationId), 'impound-attendant') % ATTENDANT_CAST.length];
  return Object.freeze({ name: who.name, style: who.style, stationId });
}

// Transient witness for observers/tests — never persisted, never a latch.
const _lotJournals = new WeakMap();
function lotJournal(state) {
  if (!state || typeof state !== 'object') return { lastListing: null, recent: [] };
  let j = _lotJournals.get(state);
  if (!j) { j = { lastListing: null, recent: [] }; _lotJournals.set(state, j); }
  return j;
}
function journalNote(state, row) {
  const j = lotJournal(state);
  j.recent.push(row);
  while (j.recent.length > ECON.journalCap) j.recent.shift();
}

function openLot(state) {
  const L = state && state.lossLedger;
  const lot = L && L.impound;
  return (lot && typeof lot === 'object' && !Array.isArray(lot)) ? lot : null;
}

// ── seeded sub-records (minted once, deterministic on the lossId) ─────────────

function mintAuction(lot) {
  const opensDay = lot.postDay + ECON.auctionDelayDays
    + (hash32(lot.lossId, 'impound-auction-open') % 2);
  const floor = Math.max(1, Math.round(lot.listPrice * ECON.auctionFloorPct));
  const strike = Math.max(1, Math.round(
    lot.listPrice * (ECON.npcStrikeMinPct
      + unit(hash32(lot.lossId, 'impound-npc-strike')) * ECON.npcStrikeSpanPct),
  ));
  return { opensDay, floor, strike, open: false, steps: 0 };
}

function mintDispute(lot) {
  if (unit(hash32(lot.lossId, 'impound-dispute')) >= ECON.disputeChance) return null;
  const paper = unit(hash32(lot.lossId, 'impound-dispute-kind')) < ECON.disputePaperShare;
  const cast = paper ? PAPER_CLAIMANTS : LEGAL_CLAIMANTS;
  return {
    kind: paper ? 'paper' : 'legal',
    claimant: cast[hash32(lot.lossId, 'impound-dispute-who') % cast.length],
    filedDay: lot.postDay,
    resolveDay: lot.postDay + ECON.disputeResolveDays
      + (hash32(lot.lossId, 'impound-dispute-when') % ECON.disputeResolveSpan),
    outcome: 'pending',
  };
}

function mintRedeem(lot) {
  if (unit(hash32(lot.lossId, 'impound-redeem')) >= ECON.redeemChance) return null;
  const who = KIN_CALLERS[hash32(lot.lossId, 'impound-redeem-who') % KIN_CALLERS.length];
  const claimant = who(lot.callsign || 'the old pilot');
  const opensDay = lot.postDay + ECON.redeemOpenMinDays
    + (hash32(lot.lossId, 'impound-redeem-when') % ECON.redeemOpenSpanDays);
  const ransomCr = Math.max(1, Math.round(
    lot.listPrice * (ECON.redeemRansomPct
      + unit(hash32(lot.lossId, 'impound-redeem-amt')) * ECON.redeemRansomSpan),
  ));
  return { claimant, opensDay, ransomCr, fired: false };
}

/** Fill schema-2 fields in place — fresh posts and old saves share the one path. */
export function normalizeImpoundListing(lot, now) {
  if (!lot || typeof lot !== 'object' || Array.isArray(lot)) return null;
  lot.lotSchema = IMPOUND_LOT_SCHEMA;
  if (!Number.isFinite(lot.postedAt)) lot.postedAt = Number.isFinite(now) ? now : 0;
  // Old-save grace: a listing without an economy cursor opens its book on the
  // day it is first read — fees and windows never bill backwards.
  if (!Number.isFinite(lot.postDay)) lot.postDay = dayOf(lot.postedAt);
  if (!Number.isFinite(lot.econDay)) lot.econDay = lot.postDay;
  const readDay = dayOf(now);
  // A cursor ahead of the day that reads it is corruption, not patience — the
  // book would freeze behind it forever. Legitimate cursors are never future.
  if (lot.postDay > readDay) lot.postDay = readDay;
  if (lot.econDay > readDay) lot.econDay = readDay;
  // A listing still on the lot was never closed: the flag and the ledger
  // deletion are written together, so a live record carrying one is corrupt.
  if (lot.closed != null) lot.closed = null;
  if (!Number.isFinite(lot.listPrice) || lot.listPrice <= 0) {
    lot.listPrice = Math.max(1, Math.round(Number(lot.price) || 1));
  }
  if (!Number.isFinite(lot.ask) || lot.ask <= 0) {
    lot.ask = Math.max(1, Math.round(Number(lot.price) || lot.listPrice));
  }
  lot.fees = Math.max(0, Math.round(Number(lot.fees) || 0));
  lot.haggles = Math.max(0, lot.haggles | 0);
  lot.haggled = lot.haggled === true;
  lot.tip = lot.tip === true;
  lot.watched = lot.watched === true;
  lot.bountyPaid = lot.bountyPaid === true;
  lot.holdDepositPaid = lot.holdDepositPaid === true;
  lot.killedByPlayer = lot.killedByPlayer === true;
  if (!Number.isFinite(lot.greetDay)) lot.greetDay = -1;
  if (lot.auction === undefined) lot.auction = mintAuction(lot);
  else {
    const a = lot.auction;
    if (!a || typeof a !== 'object') lot.auction = mintAuction(lot);
    else {
      if (!Number.isFinite(a.opensDay)) a.opensDay = lot.postDay + ECON.auctionDelayDays;
      // The minted window is postDay + delay (+0..1 jitter); anything later is
      // a corrupt pin that would never open the block.
      if (a.opensDay > lot.postDay + ECON.auctionDelayDays + 1) {
        a.opensDay = lot.postDay + ECON.auctionDelayDays + 1;
      }
      // The floor is a share of list — a floor pinned above it would launch the
      // ask sky-high on the first markdown and the book would sit open forever.
      if (!Number.isFinite(a.floor) || a.floor <= 0 || a.floor > lot.listPrice) {
        a.floor = Math.max(1, Math.round(lot.listPrice * ECON.auctionFloorPct));
      }
      if (!Number.isFinite(a.strike) || a.strike <= 0) a.strike = Math.max(1, Math.round(lot.listPrice * ECON.npcStrikeMinPct));
      // A paper under the floor can never be met — the markdown stalls on the
      // floor and the hull never moves. An unreachable strike is corruption.
      if (a.strike < a.floor) a.strike = a.floor;
      a.open = a.open === true;
      a.steps = Math.max(0, a.steps | 0);
    }
  }
  if (lot.dispute === undefined) lot.dispute = mintDispute(lot);
  else if (lot.dispute !== null && typeof lot.dispute === 'object') {
    const d = lot.dispute;
    if (d.kind !== 'legal' && d.kind !== 'paper') d.kind = 'legal';
    if (typeof d.claimant !== 'string' || !d.claimant) d.claimant = LEGAL_CLAIMANTS[0];
    if (!Number.isFinite(d.filedDay)) d.filedDay = lot.postDay;
    if (d.filedDay > readDay) d.filedDay = readDay;
    if (!Number.isFinite(d.resolveDay)) d.resolveDay = d.filedDay + ECON.disputeResolveDays;
    if (d.resolveDay > d.filedDay + ECON.disputeResolveDays + ECON.disputeResolveSpan) {
      d.resolveDay = d.filedDay + ECON.disputeResolveDays + ECON.disputeResolveSpan;
    }
    if (typeof d.outcome !== 'string' || !d.outcome) d.outcome = 'pending';
  } else lot.dispute = null;
  if (lot.redeem === undefined) lot.redeem = mintRedeem(lot);
  else if (lot.redeem !== null && typeof lot.redeem === 'object') {
    const r = lot.redeem;
    if (typeof r.claimant !== 'string' || !r.claimant) r.claimant = 'the former crew';
    if (!Number.isFinite(r.opensDay)) r.opensDay = lot.postDay + ECON.redeemOpenMinDays;
    if (r.opensDay > lot.postDay + ECON.redeemOpenMinDays + ECON.redeemOpenSpanDays) {
      r.opensDay = lot.postDay + ECON.redeemOpenMinDays + ECON.redeemOpenSpanDays;
    }
    if (!Number.isFinite(r.ransomCr) || r.ransomCr <= 0) r.ransomCr = Math.max(1, Math.round(lot.listPrice * ECON.redeemRansomPct));
    r.fired = r.fired === true;
  } else lot.redeem = null;
  if (!lot.hold || typeof lot.hold !== 'object') lot.hold = null;
  else {
    const h = lot.hold;
    if (!Number.isFinite(h.price) || h.price <= 0 || !Number.isFinite(h.untilDay)) lot.hold = null;
    else {
      h.kind = h.kind === 'bid' ? 'bid' : 'deposit';
      // A hold is minted at placement-day + its window and placement never lies
      // ahead of today — a longer horizon is a corrupt pin that would pause
      // the book forever. Clamp it in; the ordinary lapse path retires it.
      const maxUntil = readDay + Math.max(ECON.bidHoldDays, ECON.holdDays);
      if (h.untilDay > maxUntil) h.untilDay = maxUntil;
    }
  }
  if (!lot.bid || typeof lot.bid !== 'object' || !Number.isFinite(lot.bid.amount)) lot.bid = null;
  priceSync(lot);
  return lot;
}

function priceSync(lot) {
  lot.price = lot.hold && Number.isFinite(lot.hold.price)
    ? Math.max(1, Math.round(lot.hold.price))
    : Math.max(1, Math.round(lot.ask));
  return lot.price;
}

/** The normalized open listing, or null. Reads normalize; they never process days. */
export function impoundListingFor(state) {
  const lot = openLot(state);
  if (!lot) return null;
  return normalizeImpoundListing(lot, Number(state.simTime) || 0);
}

function feePerDay(lot) {
  return Math.max(ECON.storageFeeMinCr, Math.round(lot.listPrice * ECON.storageFeePct));
}
function feeCap(lot) {
  return Math.max(0, Math.round(lot.listPrice * ECON.storageFeeCapPct));
}

// ── the close: every way a hull leaves the lot without the player ────────────

function closeLot(state, ctx, lot, kind, day) {
  if (!lot || lot.closed) return 0;
  lot.closed = kind; // latch before a single emit — the close is once-only
  // A redemption closes at the kin's paper (already latched to meet the ask in
  // runLotDay) — the yard sells back over the ask, it does not discount to them.
  const basis = kind === 'redeem' && lot.redeem && Number.isFinite(lot.redeem.ransomCr)
    ? lot.redeem.ransomCr
    : (lot.hold && Number.isFinite(lot.hold.price) ? lot.hold.price : lot.ask);
  const finalPrice = Math.max(1, Math.round(basis));
  lot.price = finalPrice;
  // Delist before the FIRST emit: while this call is emitting, the record is
  // already off the book. A synchronous re-entrant read — a nested day:tick,
  // impoundListingFor, the board, a verb — finds no live lot, and can never
  // unlatch `closed` (normalize clears it on live records as save corruption)
  // or walk another day engine beat on the dying book.
  if (state && state.lossLedger && state.lossLedger.impound === lot) {
    delete state.lossLedger.impound;
  }
  // The recovery bounty: the pilot whose kill stocked the cradle gets the
  // yard's cut when it finally moves the hull — once, latched before the grant.
  let bounty = 0;
  if (lot.killedByPlayer && !lot.bountyPaid && (kind === 'npc' || kind === 'redeem')) {
    lot.bountyPaid = true;
    bounty = Math.max(1, Math.round(finalPrice * ECON.recoveryBountyPct));
    emitLot(state, ctx, 'economy:grantCredits', {
      amount: bounty,
      reason: `impound_lot:recovery:${lot.lossId}`,
    });
  }
  journalNote(state, {
    lossId: lot.lossId, shipName: lot.shipName, callsign: lot.callsign || null,
    stationName: lot.stationName, kind, day, price: finalPrice,
  });
  emitLot(state, ctx, 'impoundLot:closed', {
    lossId: lot.lossId, kind, price: finalPrice, day, bounty: bounty || undefined,
  });
  const who = lot.callsign ? `, ${lot.callsign},` : '';
  if (kind === 'npc') {
    emitLot(state, ctx, 'impoundLot:auctionWon', { lossId: lot.lossId, winner: 'npc', price: finalPrice, day });
    newsLot(state, ctx, `The used ${lot.shipName}${who} on the ${lot.stationName} lot went to a quiet bidder for ${finalPrice.toLocaleString('en-US')} credits.`, lot, `sold-npc:${day}`);
    if (bounty) toastLot(state, ctx, `The yard posted your recovery share: ${bounty.toLocaleString('en-US')} credits for the hull you provided.`);
  } else if (kind === 'redeem') {
    emitLot(state, ctx, 'impoundLot:redeemed', { lossId: lot.lossId, claimant: lot.redeem && lot.redeem.claimant, price: finalPrice, day });
    const claimant = (lot.redeem && lot.redeem.claimant) || 'the former crew';
    newsLot(state, ctx, `${claimant} paid the yard's price and took the ${lot.shipName}${who} home from ${lot.stationName}.`, lot, `redeem:${day}`);
    if (bounty) toastLot(state, ctx, `The yard posted your recovery share: ${bounty.toLocaleString('en-US')} credits — the hull moved under your nose.`);
  } else if (kind === 'reclaim') {
    emitLot(state, ctx, 'impoundLot:reclaimed', { lossId: lot.lossId, claimant: lot.dispute && lot.dispute.claimant, day });
    const claimant = (lot.dispute && lot.dispute.claimant) || 'the claimant';
    newsLot(state, ctx, `Paper beat the yard's title: ${claimant} pulled the ${lot.shipName}${who} off the ${lot.stationName} lot.`, lot, `reclaim:${day}`);
  } else {
    emitLot(state, ctx, 'impoundLot:writtenOff', { lossId: lot.lossId, day });
    newsLot(state, ctx, `${lot.stationName} wrote the ${lot.shipName}${who} off its book — a hull nobody wants is somebody else's problem now.`, lot, `writtenoff:${day}`);
  }
  return finalPrice;
}

// ── the day engine ────────────────────────────────────────────────────────────

function resolveDispute(state, ctx, lot, day, now) {
  const d = lot.dispute;
  const roll = unit(hash32(lot.lossId, 'impound-dispute-outcome', d.resolveDay));
  if (d.kind === 'legal') {
    if (roll < ECON.disputeReclaimChance) {
      d.outcome = 'reclaimed';
      // Delist before either receipt: a listener that runs a nested day beat
      // inside an emit must find no live book — otherwise the emit announces
      // 'reclaimed' while the closing kind a nested tick lands on ('npc' or
      // 'redeem') writes a different story and pays a different bounty.
      closeLot(state, ctx, lot, 'reclaim', day);
      emitLot(state, ctx, 'impoundLot:disputeResolved', { lossId: lot.lossId, kind: d.kind, outcome: d.outcome, day });
      return;
    }
    d.outcome = 'dismissed';
  } else if (roll < ECON.disputeRaidChance) {
    // Muscle does not file motions — the cradle gets broken into and the hull
    // keeps the mark. The yard sells it cheaper and the claim dies with it.
    d.outcome = 'raided';
    const facing = LIVING_HULL_SCAR_FACINGS[hash32(lot.lossId, 'impound-raid-facing') % LIVING_HULL_SCAR_FACINGS.length];
    lot.livingHull = livingHullWithScar(lot.livingHull, {
      id: `lot-raid:${hash32(lot.lossId, 'impound-raid-scar').toString(36)}`,
      cause: 'weapon',
      surface: 'weapon',
      band: 'heavy',
      facing,
      atT: now,
      tick: state.tick | 0,
      patchedAtT: null,
    }, now);
    lot.ask = Math.max(1, Math.round(lot.ask * ECON.disputeRaidDiscount));
    priceSync(lot); // the refreshed history line quotes the discounted price
    const scars = livingHullScars(lot.livingHull);
    lot.scarSentence = scarSentence(scars);
    const refreshed = impoundHistoryLine(lot);
    if (refreshed && !RAW_ID.test(refreshed)) lot.historyLine = refreshed;
    emitLot(state, ctx, 'impoundLot:raided', { lossId: lot.lossId, day, ask: lot.ask });
    newsLot(state, ctx, `Thieves hit the impound cradle at ${lot.stationName} — the ${lot.shipName} took a fresh scar and the yard cut its ask.`, lot, `raided:${day}`);
    toastLot(state, ctx, `The lot was broken into. The ${lot.shipName} is cheaper now — and worse.`, 'warn');
  } else {
    d.outcome = 'dismissed';
  }
  emitLot(state, ctx, 'impoundLot:disputeResolved', { lossId: lot.lossId, kind: d.kind, outcome: d.outcome, day });
}

function lapseHold(state, ctx, lot, day) {
  const was = lot.hold;
  lot.hold = null;
  priceSync(lot);
  emitLot(state, ctx, 'impoundLot:holdLapsed', { lossId: lot.lossId, kind: was && was.kind, day });
  toastLot(state, ctx, `Your hold on the ${lot.shipName} lapsed — the yard put it back on the board.`, 'warn');
}

/** One economy day on the lot. Returns false when the hull is gone. */
function runLotDay(state, ctx, lot, day, now) {
  if (openLot(state) !== lot) return false;
  if (lot.hold && day > lot.hold.untilDay) lapseHold(state, ctx, lot, day);
  if (lot.hold) return true; // a reservation pauses the whole machine

  // Redemption: the dead owner's people buy the hull back before the market can.
  if (lot.redeem && !lot.redeem.fired) {
    if (day >= lot.redeem.opensDay) {
      lot.redeem.fired = true;
      lot.redeem.ransomCr = Math.max(lot.redeem.ransomCr, Math.round(lot.ask)); // kin meet the ask
      closeLot(state, ctx, lot, 'redeem', day);
      return false;
    }
    if (lot.redeem.opensDay - day === 1 && lot.watched) {
      toastLot(state, ctx, `Word on the wire: ${lot.redeem.claimant} scraped together the ransom. The ${lot.shipName} leaves the lot tomorrow.`, 'warn');
    }
  }

  // The filed claim lands.
  if (lot.dispute && lot.dispute.outcome === 'pending' && day >= lot.dispute.resolveDay) {
    resolveDispute(state, ctx, lot, day, now);
    if (openLot(state) !== lot) return false;
  }

  // The cradle bill: posting day is free, then it counts.
  if (day > lot.postDay) {
    const cap = feeCap(lot);
    const fee = Math.max(0, Math.min(feePerDay(lot), cap - lot.fees));
    if (fee > 0) {
      lot.fees += fee;
      lot.ask += fee;
      emitLot(state, ctx, 'impoundLot:feesAccrued', { lossId: lot.lossId, fee, fees: lot.fees, ask: lot.ask, day });
    }
  }

  // The markdown machine.
  if (!lot.auction.open && day >= lot.auction.opensDay) {
    lot.auction.open = true;
    emitLot(state, ctx, 'impoundLot:auctionOpened', { lossId: lot.lossId, ask: lot.ask, floor: lot.auction.floor, day });
    newsLot(state, ctx, `${lot.stationName} put the used ${lot.shipName} on the block — the yard writes the price down until somebody takes it.`, lot, `auction:${day}`);
  }
  if (lot.auction.open) {
    // The markdown must move every open day: Math.round stalls below ~5 credits
    // (round(4*0.88) === 4), which would pin a tiny-price book above its floor
    // and strike forever — the block never closes and the single lot wedges
    // every future post. Force a credit of progress while above the floor.
    // A markdown only ever writes the price down: a haggled ask already under the floor
    // stays where the attendant agreed it, never climbs back to the floor overnight.
    lot.ask = Math.min(lot.ask,
      Math.max(lot.auction.floor, Math.min(lot.ask - 1, Math.round(lot.ask * ECON.auctionStep))));
    lot.auction.steps += 1;
    emitLot(state, ctx, 'impoundLot:markdown', { lossId: lot.lossId, ask: lot.ask, step: lot.auction.steps, day });
    if (lot.ask <= lot.auction.strike) {
      closeLot(state, ctx, lot, 'npc', day);
      return false;
    }
  }
  priceSync(lot);
  return true;
}

/** The lot's clock — one call per day:tick (or an explicit test/host beat). */
export function tickImpoundLot(state, ctx) {
  if (!state) return;
  ensureImpoundLotWiring(state, ctx);
  const now = Number(state.simTime) || 0;
  const today = dayOf(now);
  const lot = openLot(state);
  if (lot) {
    normalizeImpoundListing(lot, now);
    lotJournal(state).lastListing = lot;
    const backlog = today - lot.econDay;
    if (backlog > ECON.catchUpDayCap) {
      // A book this stale is not walked day by day — the yard cleared it.
      closeLot(state, ctx, lot, 'written_off', today);
    } else {
      while (openLot(state) === lot && lot.econDay < today) {
        const d = lot.econDay + 1;
        lot.econDay = d; // latch the day before it processes — replays never double
        if (!runLotDay(state, ctx, lot, d, now)) break;
      }
    }
  }
  tickRansomLapse(state, ctx, today);
}

// ── the attendant's verbs (docked at the lot's own yard) ─────────────────────

function atLot(state, lot) {
  return dockedStationId(state) === lot.stationId;
}

const HAGGLE_LINES = Object.freeze([
  (a, p) => `Fine — ${p.toLocaleString('en-US')} and you stop touching my desk.`,
  (a, p) => `${p.toLocaleString('en-US')}, and I never saw you haggle.`,
  (a, p) => `Take it at ${p.toLocaleString('en-US')} before the quiet bidder notices.`,
]);
const HAGGLE_NO_LINES = Object.freeze([
  (a) => `The price is the price. The cradle is not a market stall.`,
  (a) => `No. And asking twice costs you the first answer.`,
]);

/** One charm attempt per listing that lands; two tries before the clerk cools. */
export function impoundHaggle(state, ctx) {
  ensureImpoundLotWiring(state, ctx);
  const lot = impoundListingFor(state);
  if (!lot) return { ok: false, reason: 'no_lot' };
  if (!atLot(state, lot)) return { ok: false, reason: 'not_at_lot' };
  if (lot.hold) return { ok: false, reason: 'held' };
  if (lot.haggled) return { ok: false, reason: 'already' };
  const att = impoundAttendantFor(lot.stationId);
  if (lot.haggles >= ECON.haggleMaxAttempts) return { ok: false, reason: 'attendant_done' };
  const attempt = lot.haggles;
  lot.haggles = attempt + 1;
  const bias = att && att.style === 'kind' ? 0.1 : att && att.style === 'grifter' ? -0.1 : 0;
  const roll = unit(hash32(lot.lossId, 'impound-haggle', attempt));
  if (roll < ECON.haggleChance + bias) {
    lot.haggled = true;
    const skim = att && att.style === 'grifter' ? 0.02 : 0;
    const disc = ECON.haggleMinPct + skim
      + unit(hash32(lot.lossId, 'impound-haggle-amt', attempt)) * ECON.haggleSpanPct;
    lot.ask = Math.max(Math.round(lot.auction.floor * 0.75), Math.round(lot.ask * (1 - disc)));
    priceSync(lot);
    const line = HAGGLE_LINES[hash32(lot.lossId, 'impound-haggle-line', attempt) % HAGGLE_LINES.length](att && att.name, lot.price);
    speakLot(state, ctx, att ? att.name : 'Lot attendant', line);
    emitLot(state, ctx, 'impoundLot:haggled', { lossId: lot.lossId, price: lot.price, attendant: att && att.name });
    return { ok: true, price: lot.price };
  }
  const line = HAGGLE_NO_LINES[hash32(lot.lossId, 'impound-haggle-no', attempt) % HAGGLE_NO_LINES.length](att && att.name);
  speakLot(state, ctx, att ? att.name : 'Lot attendant', line);
  emitLot(state, ctx, 'impoundLot:haggleRefused', { lossId: lot.lossId, attemptsLeft: ECON.haggleMaxAttempts - lot.haggles });
  return { ok: false, reason: 'refused', attemptsLeft: ECON.haggleMaxAttempts - lot.haggles };
}

/** Sealed bid on the open block: beat the quiet paper and the hull is yours. */
export function impoundPlaceBid(state, ctx, amount) {
  ensureImpoundLotWiring(state, ctx);
  const lot = impoundListingFor(state);
  if (!lot) return { ok: false, reason: 'no_lot' };
  if (!atLot(state, lot)) return { ok: false, reason: 'not_at_lot' };
  if (!lot.auction.open) return { ok: false, reason: 'not_auctioned' };
  if (lot.hold) return { ok: false, reason: 'held' };
  const bid = Math.round(Number(amount));
  if (!Number.isFinite(bid) || bid <= 0) return { ok: false, reason: 'bad_amount' };
  if (playerCredits(state) < bid) return { ok: false, reason: 'thin_wallet' };
  const day = dayOf(state.simTime);
  lot.bid = { amount: bid, day, by: 'player' };
  if (bid >= lot.auction.strike) {
    lot.hold = { kind: 'bid', price: bid, untilDay: day + ECON.bidHoldDays };
    priceSync(lot);
    emitLot(state, ctx, 'impoundLot:auctionWon', { lossId: lot.lossId, winner: 'player', price: bid, untilDay: lot.hold.untilDay });
    toastLot(state, ctx, `Bid accepted — the ${lot.shipName} holds for you at ${bid.toLocaleString('en-US')} for ${ECON.bidHoldDays} days. Pick it up at this yard.`);
    return { ok: true, hold: { ...lot.hold } };
  }
  emitLot(state, ctx, 'impoundLot:bidLost', { lossId: lot.lossId, amount: bid, ask: lot.ask });
  const att = impoundAttendantFor(lot.stationId);
  speakLot(state, ctx, att ? att.name : 'Lot attendant',
    `The quiet paper covers that. Bid over it or go home.`);
  return { ok: false, reason: 'outbid' };
}

/** Earnest money to freeze the book: the hull waits at today's ask. */
export function impoundHoldDeposit(state, ctx) {
  ensureImpoundLotWiring(state, ctx);
  const lot = impoundListingFor(state);
  if (!lot) return { ok: false, reason: 'no_lot' };
  if (!atLot(state, lot)) return { ok: false, reason: 'not_at_lot' };
  if (lot.hold) return { ok: false, reason: 'held' };
  if (lot.holdDepositPaid) return { ok: false, reason: 'already' };
  const fee = Math.max(ECON.holdDepositMinCr, Math.round(lot.ask * ECON.holdDepositPct));
  if (playerCredits(state) < fee) return { ok: false, reason: 'thin_wallet', fee };
  const day = dayOf(state.simTime);
  lot.holdDepositPaid = true; // the earnest money is spent either way — latch first
  lot.hold = { kind: 'deposit', price: lot.ask, untilDay: day + ECON.holdDays };
  priceSync(lot);
  emitLot(state, ctx, 'economy:chargeCredits', { amount: fee, reason: `impound_lot:hold:${lot.lossId}` });
  emitLot(state, ctx, 'impoundLot:held', { lossId: lot.lossId, kind: 'deposit', price: lot.hold.price, untilDay: lot.hold.untilDay, fee });
  return { ok: true, fee, hold: { ...lot.hold } };
}

/** The clerk's real product: who holds paper on the hull and when it lands. */
export function impoundInsiderTip(state, ctx) {
  ensureImpoundLotWiring(state, ctx);
  const lot = impoundListingFor(state);
  if (!lot) return { ok: false, reason: 'no_lot' };
  if (!atLot(state, lot)) return { ok: false, reason: 'not_at_lot' };
  if (lot.tip) return { ok: false, reason: 'already' };
  const fee = Math.max(ECON.tipFeeMinCr, Math.round(lot.listPrice * ECON.tipFeePct));
  if (playerCredits(state) < fee) return { ok: false, reason: 'thin_wallet', fee };
  lot.tip = true; // latch before the charge emit
  emitLot(state, ctx, 'economy:chargeCredits', { amount: fee, reason: `impound_lot:tip:${lot.lossId}` });
  const tip = {
    npcStrike: lot.auction.strike,
    auctionOpensDay: lot.auction.opensDay,
    dispute: lot.dispute ? { kind: lot.dispute.kind, claimant: lot.dispute.claimant, resolveDay: lot.dispute.resolveDay } : null,
    redeem: lot.redeem ? { claimant: lot.redeem.claimant, opensDay: lot.redeem.opensDay } : null,
  };
  emitLot(state, ctx, 'impoundLot:tip', { lossId: lot.lossId, ...tip, fee });
  const att = impoundAttendantFor(lot.stationId);
  // The clerk speaks in days from today — the book's internal day index is not a date.
  const redeemIn = tip.redeem ? Math.max(0, tip.redeem.opensDay - dayOf(state.simTime)) : 0;
  const redeemWhen = redeemIn <= 0 ? 'any day now' : redeemIn === 1 ? 'tomorrow' : `in about ${redeemIn} days`;
  const redeemText = tip.redeem ? ` And ${tip.redeem.claimant} comes for it ${redeemWhen}.` : '';
  speakLot(state, ctx, att ? att.name : 'Lot attendant',
    `Between us: the quiet paper tops out at ${tip.npcStrike.toLocaleString('en-US')}.${redeemText}`);
  return { ok: true, fee, tip };
}

/** Pay the clerk to lose a filed claim — the dead owner's house notices anyway. */
export function impoundQuietClaim(state, ctx) {
  ensureImpoundLotWiring(state, ctx);
  const lot = impoundListingFor(state);
  if (!lot) return { ok: false, reason: 'no_lot' };
  if (!atLot(state, lot)) return { ok: false, reason: 'not_at_lot' };
  const d = lot.dispute;
  if (!d || d.outcome !== 'pending') return { ok: false, reason: 'no_dispute' };
  const fee = Math.max(ECON.quietFeeMinCr, Math.round(lot.listPrice * ECON.quietFeePct));
  if (playerCredits(state) < fee) return { ok: false, reason: 'thin_wallet', fee };
  d.outcome = 'quieted'; // latch before the charge emit — the writ is dead either way
  emitLot(state, ctx, 'economy:chargeCredits', { amount: fee, reason: `impound_lot:quiet:${lot.lossId}` });
  if (d.kind === 'legal' && (lot.victimFactionId || lot.factionId)) {
    emitLot(state, ctx, 'faction:repDelta', {
      factionId: lot.victimFactionId || lot.factionId,
      delta: ECON.quietClaimRep,
      reason: 'impound_lot_quieted_claim',
    });
  }
  emitLot(state, ctx, 'impoundLot:disputeQuieted', { lossId: lot.lossId, claimant: d.claimant, fee });
  const att = impoundAttendantFor(lot.stationId);
  speakLot(state, ctx, att ? att.name : 'Lot attendant',
    `The writ is lost somewhere under a stamp. If anyone asks, the cradle was always clean.`);
  return { ok: true, fee };
}

/** Watch the book: the wire warns before a redemption window opens. */
export function impoundWatchLot(state, ctx, on = true) {
  ensureImpoundLotWiring(state, ctx);
  const lot = impoundListingFor(state);
  if (!lot) return { ok: false, reason: 'no_lot' };
  lot.watched = on !== false;
  emitLot(state, ctx, 'impoundLot:watched', { lossId: lot.lossId, watched: lot.watched });
  return { ok: true, watched: lot.watched };
}

// ── ransom: the kin's counter-offer on a bought marked hull ──────────────────

function activeMarkedHull(state) {
  const p = state && state.player;
  if (!p || !Array.isArray(p.ownedShips)) return null;
  const idx = Number.isInteger(p.activeShipIndex) ? p.activeShipIndex : 0;
  const owned = p.ownedShips[idx];
  const shadow = owned && owned.impoundShadow;
  return shadow && typeof shadow === 'object' ? { owned, shadow, index: idx } : null;
}

const RANSOM_STATES = Object.freeze({ none: 1, offered: 1, paid: 1, lapsed: 1, refused: 1 });

const RANSOM_OFFER_LINES = Object.freeze([
  (claimant, callsign, amount) => `${claimant} left word at the yard: ${amount.toLocaleString('en-US')} credits for ${callsign}'s papers, clean. Decide at this berth.`,
  (claimant, callsign, amount) => `Someone is asking after ${callsign}'s hull — ${claimant}. They will pay ${amount.toLocaleString('en-US')} credits for the deed back, no questions.`,
]);
const RANSOM_PAID_LINES = Object.freeze([
  (claimant, callsign) => `${claimant} took the papers and went quiet. ${callsign}'s hull flies clean now — nobody's debt rides it.`,
  (claimant, callsign) => `Done, says ${claimant}. The lot book on ${callsign} is closed.`,
]);
const RANSOM_DECLINED_LINES = Object.freeze([
  (claimant, callsign) => `${claimant} heard the answer. The papers on ${callsign} stay hot.`,
]);

function maybeOfferRansom(state, ctx, stationId, day) {
  const marked = activeMarkedHull(state);
  if (!marked) return;
  const { owned, shadow } = marked;
  if (shadow.resolved) return;
  const ransom = shadow.ransom;
  if (ransom != null) {
    // A foreign record — a ransom that is not one of the five words — is dead
    // paper, not a coin flip: heal it to the same 'none' latch save:loaded
    // writes, or the offer machine wedges for the rest of the session (lapse
    // only knows 'offered', the verbs only read states, and the mint below
    // would never run again).
    if (typeof ransom !== 'object' || !RANSOM_STATES[ransom.state]) {
      shadow.ransom = { state: 'none' };
      return;
    }
    // A standing offer re-announces at its own berth, once per day — never
    // after the window has closed (the lapse tick may simply not have run yet).
    if (ransom.state === 'offered' && ransom.stationId === stationId
      && ransom.announcedDay !== day && day <= ransom.untilDay) {
      ransom.announcedDay = day;
      const line = RANSOM_OFFER_LINES[hash32(shadow.lossId, 'impound-ransom-line') % RANSOM_OFFER_LINES.length];
      speakLot(state, ctx, 'Lot attendant', line(ransom.claimant, shadow.priorCallsign, ransom.amount));
      emitLot(state, ctx, 'impoundLot:ransomOffer', {
        lossId: shadow.lossId, amount: ransom.amount, untilDay: ransom.untilDay, stationId,
      });
    }
    return;
  }
  const station = stationById(stationId);
  if (!station || !Array.isArray(station.services) || !station.services.includes('shipyard')) return;
  if (unit(hash32(shadow.lossId, 'impound-ransom')) >= ECON.ransomChance) {
    shadow.ransom = { state: 'none' }; // dead latch — the kin never come for this hull
    return;
  }
  const def = SHIP_BY_ID.get(owned.defId);
  const catalog = def && Number.isFinite(def.price) ? def.price : 1000;
  const amount = Math.max(ECON.ransomMinCr, Math.round(
    catalog * ECON.ransomPct
    + ECON.ransomPerDeathCr * (shadow.deaths | 0)
    + ECON.ransomPerTierCr * (shadow.tier | 0),
  ));
  const claimant = KIN_CALLERS[hash32(shadow.lossId, 'impound-kin') % KIN_CALLERS.length](shadow.priorCallsign || 'the old pilot');
  shadow.ransom = {
    state: 'offered',
    amount,
    offerDay: day,
    untilDay: day + ECON.ransomWindowDays,
    stationId,
    claimant,
    announcedDay: day,
  };
  const line = RANSOM_OFFER_LINES[hash32(shadow.lossId, 'impound-ransom-line') % RANSOM_OFFER_LINES.length];
  speakLot(state, ctx, 'Lot attendant', line(claimant, shadow.priorCallsign, amount));
  emitLot(state, ctx, 'impoundLot:ransomOffer', { lossId: shadow.lossId, amount, untilDay: shadow.ransom.untilDay, stationId });
}

function tickRansomLapse(state, ctx, today) {
  const p = state && state.player;
  const ships = p && Array.isArray(p.ownedShips) ? p.ownedShips : [];
  for (const owned of ships) {
    const shadow = owned && owned.impoundShadow;
    const ransom = shadow && shadow.ransom;
    if (!ransom || ransom.state !== 'offered') continue;
    // The window is minted as offerDay + ransomWindowDays; a record that
    // promises further out is a foreign pin that would never lapse (save:loaded
    // clamps the same bound — the tick heals it live too).
    const maxUntil = (Number.isFinite(ransom.offerDay) ? ransom.offerDay : today)
      + ECON.ransomWindowDays;
    if (Number.isFinite(ransom.untilDay) && ransom.untilDay > maxUntil) ransom.untilDay = maxUntil;
    if (today <= ransom.untilDay) continue;
    ransom.state = 'lapsed';
    emitLot(state, ctx, 'impoundLot:ransomLapsed', { lossId: shadow.lossId });
    toastLot(state, ctx, `${ransom.claimant || 'The kin'} stopped waiting — the paper offer is gone.`);
  }
}

/** Sell the dead owner's papers back — the hull stays, the debt does not. */
export function impoundAcceptRansom(state, ctx) {
  ensureImpoundLotWiring(state, ctx);
  const marked = activeMarkedHull(state);
  if (!marked) return { ok: false, reason: 'no_marked_hull' };
  const { owned, shadow } = marked;
  if (shadow.resolved) return { ok: false, reason: 'already_closed' };
  const ransom = shadow.ransom;
  const day = dayOf(state.simTime);
  if (!ransom || ransom.state !== 'offered') return { ok: false, reason: 'no_offer' };
  if (day > ransom.untilDay) {
    // Latch, then file the same receipt the lapse tick would — listeners
    // tracking the open offer must see it close either way.
    ransom.state = 'lapsed';
    emitLot(state, ctx, 'impoundLot:ransomLapsed', { lossId: shadow.lossId });
    return { ok: false, reason: 'lapsed' };
  }
  // The papers trade only at the berth the offer names — a stationless record
  // (a forged or healed offer) has no berth to trade at, even while undocked.
  if (typeof ransom.stationId !== 'string' || !ransom.stationId
    || dockedStationId(state) !== ransom.stationId) {
    return { ok: false, reason: 'wrong_berth', stationId: ransom.stationId };
  }
  if (shadow.liveId != null) return { ok: false, reason: 'collector_active' };
  const now = Number(state.simTime) || 0;
  // A minted offer always clears ransomMinCr; a record carrying less (or a
  // non-number) is foreign — the kin's paper still pays its floor, never NaN.
  if (!Number.isFinite(ransom.amount) || ransom.amount <= 0) ransom.amount = ECON.ransomMinCr;
  // Latch before a single emit — the kin pay once, replay or not.
  ransom.state = 'paid';
  ransom.paidDay = day;
  owned.impoundRansom = { lossId: shadow.lossId, amount: ransom.amount, at: now, stationId: ransom.stationId };
  // 'ransomed' is a terminal word on the papers: the grudge's own tick reads a
  // resolved shadow as dead paper and never surfaces again. Live refs are
  // refused above, so nothing hot is left standing in the sky.
  shadow.resolved = 'ransomed';
  shadow.resolvedAt = now;
  shadow.nextAt = null;
  shadow.offer = null;
  shadow.mode = null;
  emitLot(state, ctx, 'economy:grantCredits', { amount: ransom.amount, reason: `impound_lot:ransom:${shadow.lossId}` });
  emitLot(state, ctx, 'impoundLot:ransomPaid', { lossId: shadow.lossId, amount: ransom.amount, stationId: ransom.stationId });
  const line = RANSOM_PAID_LINES[hash32(shadow.lossId, 'impound-ransom-paid') % RANSOM_PAID_LINES.length];
  speakLot(state, ctx, 'Lot attendant', line(ransom.claimant, shadow.priorCallsign));
  newsLot(state, ctx, `${ransom.claimant} bought the papers on the marked ${owned.defId ? (SHIP_BY_ID.get(owned.defId) || {}).name || 'hull' : 'hull'} back outright. Some debts end in credits after all.`,
    { lossId: shadow.lossId, listingId: null, stationId: ransom.stationId, sectorId: null }, `ransom:${day}`);
  return { ok: true, amount: ransom.amount };
}

/** Tell the kin no — the papers stay hot and the collector stays on schedule. */
export function impoundDeclineRansom(state, ctx) {
  ensureImpoundLotWiring(state, ctx);
  const marked = activeMarkedHull(state);
  if (!marked) return { ok: false, reason: 'no_marked_hull' };
  const { shadow } = marked;
  const ransom = shadow.ransom;
  if (!ransom || ransom.state !== 'offered') return { ok: false, reason: 'no_offer' };
  const now = Number(state.simTime) || 0;
  const day = dayOf(now);
  if (day > ransom.untilDay) {
    ransom.state = 'lapsed';
    emitLot(state, ctx, 'impoundLot:ransomLapsed', { lossId: shadow.lossId });
    return { ok: false, reason: 'lapsed' };
  }
  if (typeof ransom.stationId !== 'string' || !ransom.stationId
    || dockedStationId(state) !== ransom.stationId) {
    return { ok: false, reason: 'wrong_berth', stationId: ransom.stationId };
  }
  ransom.state = 'refused';
  emitLot(state, ctx, 'impoundLot:ransomDeclined', { lossId: shadow.lossId });
  const line = RANSOM_DECLINED_LINES[hash32(shadow.lossId, 'impound-ransom-no') % RANSOM_DECLINED_LINES.length];
  speakLot(state, ctx, 'Lot attendant', line(ransom.claimant, shadow.priorCallsign));
  // A refusal is heard: if the grudge has a next pass booked, it comes sooner.
  if (Number.isFinite(shadow.nextAt)) shadow.nextAt = Math.min(shadow.nextAt, now + 150);
  return { ok: true };
}

// ── the board: a HUD-safe snapshot of the whole lot ──────────────────────────

export function impoundLotBoard(state) {
  const now = Number(state && state.simTime) || 0;
  const day = dayOf(now);
  const j = lotJournal(state);
  const marked = activeMarkedHull(state);
  const ransom = marked && marked.shadow && marked.shadow.ransom && typeof marked.shadow.ransom === 'object'
    ? {
      state: marked.shadow.ransom.state || null,
      amount: marked.shadow.ransom.amount || 0,
      untilDay: Number.isFinite(marked.shadow.ransom.untilDay) ? marked.shadow.ransom.untilDay : null,
      stationId: marked.shadow.ransom.stationId || null,
      claimant: marked.shadow.ransom.claimant || null,
      resolved: marked.shadow.resolved || null,
    }
    : (marked && marked.shadow ? { state: null, resolved: marked.shadow.resolved || null } : null);
  const board = {
    day,
    open: false,
    atLot: false,
    attendant: null,
    listingId: null,
    lossId: null,
    ransom,
    recent: j.recent.map((row) => ({ ...row })),
  };
  const lot = impoundListingFor(state);
  if (!lot) return board;
  board.open = true;
  board.atLot = dockedStationId(state) === lot.stationId;
  board.attendant = impoundAttendantFor(lot.stationId);
  board.listingId = lot.listingId;
  board.lossId = lot.lossId;
  board.defId = lot.defId;
  board.shipName = lot.shipName;
  board.callsign = lot.callsign || null;
  board.stationId = lot.stationId;
  board.stationName = lot.stationName;
  board.source = lot.source;
  board.price = lot.price;
  board.ask = lot.ask;
  board.listPrice = lot.listPrice;
  board.fees = lot.fees;
  board.feePerDay = feePerDay(lot);
  board.feeCap = feeCap(lot);
  board.postDay = lot.postDay;
  board.econDay = lot.econDay;
  board.watched = lot.watched;
  board.tip = lot.tip;
  board.haggled = lot.haggled;
  board.hagglesLeft = Math.max(0, ECON.haggleMaxAttempts - lot.haggles);
  board.historyLine = lot.historyLine || null;
  // The desk's own prices, computed by the same formulas its verbs charge.
  board.tipFeeCr = Math.max(ECON.tipFeeMinCr, Math.round(lot.listPrice * ECON.tipFeePct));
  board.holdFeeCr = Math.max(ECON.holdDepositMinCr, Math.round(lot.ask * ECON.holdDepositPct));
  board.quietFeeCr = Math.max(ECON.quietFeeMinCr, Math.round(lot.listPrice * ECON.quietFeePct));
  board.holdDepositPaid = lot.holdDepositPaid;
  board.hold = lot.hold ? { ...lot.hold } : null;
  board.bid = lot.bid ? { ...lot.bid } : null;
  board.auction = {
    open: lot.auction.open,
    opensDay: lot.auction.opensDay,
    floor: lot.auction.floor,
    strike: lot.tip ? lot.auction.strike : null, // the quiet paper is the clerk's product
    daysToOpen: Math.max(0, lot.auction.opensDay - day),
  };
  board.dispute = lot.dispute
    ? {
      kind: lot.dispute.kind,
      claimant: lot.dispute.claimant,
      filedDay: lot.dispute.filedDay,
      resolveDay: lot.tip ? lot.dispute.resolveDay : null, // the landing day is the clerk's product
      outcome: lot.dispute.outcome,
    }
    : null;
  board.redeem = lot.redeem && !lot.redeem.fired
    ? {
      claimant: lot.redeem.claimant,
      opensDay: (lot.tip || lot.watched) ? lot.redeem.opensDay : null, // timing is intel
      daysToOpen: (lot.tip || lot.watched) ? Math.max(0, lot.redeem.opensDay - day) : null,
    }
    : null;
  return board;
}

// ── dock, purchase and save seams ─────────────────────────────────────────────

const GREET_REDEEM = (lot) => `word is ${lot.redeem.claimant} scraped together a ransom for this one — it will not sit long.`;
const GREET_DISPUTE = (lot) => `careful with the ${lot.shipName} — ${lot.dispute.claimant} filed paper on it.`;
const GREET_AUCTION = (lot) => `the ${lot.shipName} is being written down by the day. Somebody quiet already has paper in.`;
const GREET_FRESH = (lot) => `fresh cradle on the lot — a ${lot.shipName}, still warm. The fees start counting tomorrow.`;

/** The dock seam: greet at the lot's own yard, offer the ransom at any yard. */
export function noteImpoundLotDocked(state, ctx, p) {
  if (!state) return;
  ensureImpoundLotWiring(state, ctx);
  const stationId = typeof p === 'string' ? p : (p && p.stationId);
  const now = Number(state.simTime) || 0;
  const day = dayOf(now);
  const lot = impoundListingFor(state);
  if (lot) {
    lotJournal(state).lastListing = lot;
    if (stationId && stationId === lot.stationId && lot.greetDay !== day) {
      lot.greetDay = day; // one greeting a day — latch before the popup
      const att = impoundAttendantFor(lot.stationId);
      const pick = lot.redeem && !lot.redeem.fired && lot.redeem.opensDay - day <= 1
        ? GREET_REDEEM
        : lot.dispute && lot.dispute.outcome === 'pending'
          ? GREET_DISPUTE
          : lot.auction.open
            ? GREET_AUCTION
            : GREET_FRESH;
      speakLot(state, ctx, att ? att.name : 'Lot attendant', pick(lot));
      emitLot(state, ctx, 'impoundLot:greeted', { lossId: lot.lossId, stationId, attendant: att && att.name, day });
    }
  }
  maybeOfferRansom(state, ctx, stationId, day);
}

/** The purchase seam: the ledger's listing is gone by the time ship:purchased
 *  emits — the journal still holds the deed it was sold under. */
export function noteImpoundLotShipPurchased(state, ctx, payload) {
  const j = lotJournal(state);
  const last = j && j.lastListing;
  if (!last || !payload) return;
  const rap = payload.rapSheet;
  const matched = (rap && last.deed && rap.id === last.deed.id)
    || (payload.history != null && payload.history === last.historyLine);
  if (!matched) return;
  const day = dayOf(state && state.simTime);
  journalNote(state, {
    lossId: last.lossId, shipName: last.shipName, callsign: last.callsign || null,
    stationName: last.stationName, kind: 'sold', day,
    price: Number.isFinite(payload.price) ? payload.price : last.price,
  });
  emitLot(state, ctx, 'impoundLot:sold', {
    lossId: last.lossId, defId: payload.defId || last.defId,
    price: Number.isFinite(payload.price) ? payload.price : last.price, day,
  });
}

/** save:loaded — restore the listing's transients without a day of free
 *  progress: the cursor stays where the save left it and resumes on the next
 *  day:tick; ransom records normalize but never re-roll. */
export function noteImpoundLotSaveLoaded(state, ctx) {
  if (!state) return;
  ensureImpoundLotWiring(state, ctx);
  const now = Number(state.simTime) || 0;
  const lot = openLot(state);
  if (lot) {
    normalizeImpoundListing(lot, now);
    lotJournal(state).lastListing = lot;
  }
  const p = state.player;
  const ships = p && Array.isArray(p.ownedShips) ? p.ownedShips : [];
  for (const owned of ships) {
    const shadow = owned && owned.impoundShadow;
    if (!shadow || typeof shadow !== 'object' || shadow.ransom == null) continue;
    const r = shadow.ransom;
    if (typeof r !== 'object' || !RANSOM_STATES[r.state]) {
      shadow.ransom = { state: 'none' };
      continue;
    }
    r.amount = Math.max(0, Math.round(Number(r.amount) || 0));
    const today = dayOf(now);
    // An offer mints at a past day with untilDay = offerDay + the window —
    // a record promising later than that is corrupt and would wedge the
    // berth gate or never lapse, so it is clamped into the honest window.
    r.offerDay = Number.isFinite(r.offerDay) ? Math.min(r.offerDay, today) : today;
    r.untilDay = Number.isFinite(r.untilDay)
      ? Math.min(r.untilDay, r.offerDay + ECON.ransomWindowDays)
      : r.offerDay;
    if (typeof r.stationId !== 'string' || !r.stationId) r.stationId = null;
    if (typeof r.claimant !== 'string' || !r.claimant) r.claimant = 'the former crew';
  }
}

/** Wire the lot's clocks onto the bus — once per state. postImpoundListing does
 *  this on every post; the exported notes/verbs self-wire for bare harnesses,
 *  matching the grudge's own listener pattern. */
const _lotWired = new WeakSet();
export function ensureImpoundLotWiring(state, ctx) {
  if (!state || typeof state !== 'object' || _lotWired.has(state)) return;
  const bus = (ctx && ctx.bus) || (ctx && typeof ctx.on === 'function' ? ctx : null) || state.bus;
  if (!bus || typeof bus.on !== 'function') return;
  _lotWired.add(state);
  const host = { bus, emit: (n, p) => bus.emit(n, p) };
  bus.on('day:tick', () => tickImpoundLot(state, host));
  bus.on('dock:docked', (p) => noteImpoundLotDocked(state, host, p));
  bus.on('save:loaded', () => noteImpoundLotSaveLoaded(state, host));
  bus.on('ship:purchased', (p) => noteImpoundLotShipPurchased(state, host, p));
  // The attendant's desk on the Shipworks screen answers with this one intent; the verbs
  // re-check the berth, the book and the wallet before anything moves.
  bus.on('impoundLot:deskIntent', (p) => runImpoundDeskIntent(state, host, p));
}

// Why the desk said no, in the attendant's words. A verb that speaks its own refusal
// line (haggle, losing bid) needs no second receipt.
const DESK_REFUSALS = Object.freeze({
  no_lot: 'The lot is empty — that hull has already left the book.',
  not_at_lot: 'That desk is at the yard holding the hull. Dock there to deal.',
  held: 'The hull is already on hold — the book is frozen until it lapses.',
  already: 'The desk has already done that for this hull.',
  attendant_done: 'The attendant is done haggling over this hull.',
  not_auctioned: 'The block is not open yet — sealed bids wait for the auction.',
  bad_amount: 'That is not a bid the desk can write down.',
  thin_wallet: 'Not enough credits for that at the desk.',
  no_dispute: 'No filed claim is pending on this hull.',
  no_marked_hull: 'The hull you are flying carries no dead owner\'s papers.',
  already_closed: 'The papers on this hull are already settled.',
  no_offer: 'Nobody is offering for these papers right now.',
  lapsed: 'The offer lapsed — the kin stopped waiting.',
  wrong_berth: 'The kin left word at another yard. Answer them there.',
  collector_active: 'Not while their collector is still out there hunting this hull.',
});

/** Route one desk intent to its verb. Returns the verb's own result. */
export function runImpoundDeskIntent(state, ctx, p) {
  const verb = p && typeof p.verb === 'string' ? p.verb : '';
  let out;
  switch (verb) {
    case 'haggle': out = impoundHaggle(state, ctx); break;
    case 'bid': out = impoundPlaceBid(state, ctx, p.amount); break;
    case 'hold': out = impoundHoldDeposit(state, ctx); break;
    case 'tip': out = impoundInsiderTip(state, ctx); break;
    case 'quiet': out = impoundQuietClaim(state, ctx); break;
    case 'watch': out = impoundWatchLot(state, ctx, p.on !== false); break;
    case 'acceptRansom': out = impoundAcceptRansom(state, ctx); break;
    case 'declineRansom': out = impoundDeclineRansom(state, ctx); break;
    default: return null;
  }
  if (out && out.ok === false && out.reason !== 'refused' && out.reason !== 'outbid') {
    toastLot(state, ctx, DESK_REFUSALS[out.reason] || 'The desk turned that down.', 'warn', 4);
  } else if (out && out.ok && verb === 'hold') {
    toastLot(state, ctx, `Hold placed — the hull waits at ${Number(out.hold && out.hold.price || 0).toLocaleString('en-US')} credits for ${ECON.holdDays} days.`);
  } else if (out && out.ok && verb === 'watch') {
    toastLot(state, ctx, out.watched ? 'The wire will warn you before anyone redeems this hull.' : 'You stopped watching the book.');
  }
  emitLot(state, ctx, 'impoundLot:deskAnswered', { verb, ok: !!(out && out.ok), reason: out && out.reason || null });
  return out;
}

/** Stamp the economy fields on a fresh listing — the durable twin of
 *  normalizeImpoundListing's old-save repair. */
function stampLotEconomy(state, listing, entry) {
  const now = Number(state.simTime) || 0;
  listing.lotSchema = IMPOUND_LOT_SCHEMA;
  listing.postedAt = now;
  listing.postDay = dayOf(now);
  listing.econDay = listing.postDay;
  listing.listPrice = listing.price;
  listing.ask = listing.price;
  listing.fees = 0;
  listing.hold = null;
  listing.bid = null;
  listing.tip = false;
  listing.watched = false;
  listing.haggles = 0;
  listing.haggled = false;
  listing.bountyPaid = false;
  listing.holdDepositPaid = false;
  listing.greetDay = -1;
  listing.closed = null;
  listing.killedByPlayer = !!(entry && entry.killedByPlayer === true);
  listing.killerId = entry && entry.killerId != null ? entry.killerId : null;
  listing.victimFactionId = (entry && entry.factionId) || null;
  listing.auction = mintAuction(listing);
  listing.dispute = mintDispute(listing);
  listing.redeem = mintRedeem(listing);
  return listing;
}

function sectorById(sectorId) {
  return SECTORS.find((sector) => sector.id === sectorId) || null;
}

function stationById(stationId) {
  if (!stationId) return null;
  for (const sector of SECTORS) {
    const station = (sector.stations || []).find((row) => row.id === stationId);
    if (station) return station;
  }
  return null;
}

function shipyardIn(sectorId) {
  const sector = sectorById(sectorId);
  if (!sector) return null;
  return (sector.stations || []).find((station) => Array.isArray(station.services)
    && station.services.includes('shipyard')) || null;
}

function plainWords(value) {
  if (typeof value !== 'string') return null;
  const clean = value.replace(/\s+/g, ' ').trim();
  if (!clean || clean.length > 40 || clean.includes('_')) return null;
  if (/[a-z][A-Z]/.test(clean)) return null;
  return clean;
}

function scarSentence(scars) {
  if (!scars || scars.length === 0) return '';
  const oldest = scars[0];
  const blow = oldest.cause === 'slam' ? 'impact' : 'weapon';
  const mark = `${oldest.band} ${blow} mark on the ${oldest.facing}`;
  if (scars.length === 1) return `It carries a ${mark}.`;
  return `It carries ${scars.length} marks, the oldest a ${mark}.`;
}

function recoverySentence(sectorId) {
  const sector = sectorById(sectorId);
  const name = sector && sector.name;
  if (!name) return null;
  return `Papers say the hull was recovered near ${name}.`;
}

/** Forward acceleration for one owned hull whose thrusters were bored out.
 *  The catalog profile stays frozen; the copy is what flight reads. */
export function derivedWithOverbore(derived, accelMult) {
  const mult = Number(accelMult);
  if (!derived || typeof derived !== 'object' || !Number.isFinite(mult) || !(mult > 1)) return derived;
  const scale = Math.min(OVERBORE_MAX, Math.max(OVERBORE_MIN, mult));
  const next = { ...derived };
  if (derived.propulsion && typeof derived.propulsion === 'object') {
    const propulsion = { ...derived.propulsion };
    for (const key of OVERBORE_ACCEL_KEYS) {
      if (typeof propulsion[key] === 'number') propulsion[key] *= scale;
    }
    next.propulsion = propulsion;
  }
  if (derived.flightModel && typeof derived.flightModel === 'object') {
    const flightModel = { ...derived.flightModel };
    if (typeof flightModel.mainAccel === 'number') flightModel.mainAccel *= scale;
    next.flightModel = flightModel;
  }
  if (typeof derived.thrust === 'number') next.thrust = derived.thrust * scale;
  return next;
}

export function impoundHistoryLine(listing) {
  if (!listing || !listing.stationName || !listing.shipName) return '';
  const price = Math.max(0, Math.round(Number(listing.price) || 0)).toLocaleString('en-US');
  const who = listing.callsign ? `, ${listing.callsign},` : '';
  const scar = listing.scarSentence ? `${listing.scarSentence} ` : '';
  const deed = listing.deedLine ? `${listing.deedLine} ` : '';
  return `${listing.stationName} has a used ${listing.shipName}${who} for ${price} credits. ${scar}${deed}The thrusters were bored out, so it pulls harder than a stock hull.`;
}

/** Papers law may file. Unknown kinds and lines that name a raw id are refused.
 *  Does not write heat, credits, or the player's record. */
export function acceptHullPapers(deed, line) {
  if (!deed || typeof deed !== 'object' || !DEED_KINDS[deed.kind]) return null;
  if (typeof line !== 'string') return null;
  const text = line.trim();
  if (!text || RAW_ID.test(text)) return null;
  const spec = DEED_KINDS[deed.kind];
  return Object.freeze({
    id: String(deed.id || ''),
    kind: deed.kind,
    line: text,
    label: typeof deed.label === 'string' && deed.label.trim() ? deed.label.trim() : spec.label,
    sectorId: deed.sectorId || null,
    factionId: deed.factionId || null,
  });
}

function papersForHull(hull, entry, entity, sectorId, simTime, tick) {
  const renown = livingHullRenown(hull);
  const kill = renown.find((act) => act && act.act === 'kill') || null;
  const lossKey = entry && entry.lossId ? String(entry.lossId) : String(entity && entity.id);
  const id = `papers:${hash32(lossKey, 'hull-papers').toString(36)}`;
  if (kill && kill.factionId && kill.sectorId) {
    const kind = LAWFUL_STATION_FACTIONS.has(kill.factionId) ? 'kill_lawful' : 'kill_outlaw';
    const deed = hullPaperDeed({
      id,
      kind,
      t: simTime,
      tick,
      sectorId: kill.sectorId,
      factionId: kill.factionId,
      subject: null,
    });
    const line = deed ? deedLine(deed, { voice: 'neutral' }) : null;
    if (!deed || !line) return null;
    return { deed, line };
  }
  const factionId = (entity && entity.factionId) || (entry && entry.factionId) || null;
  const kind = factionId && LAWFUL_STATION_FACTIONS.has(factionId) ? 'kill_lawful' : 'kill_outlaw';
  const line = recoverySentence(sectorId);
  if (!line) return null;
  const deed = hullPaperDeed({
    id,
    kind,
    t: simTime,
    tick,
    sectorId,
    factionId,
    subject: null,
    label: 'Recovered hull',
  });
  return deed ? { deed, line } : null;
}

/**
 * Post the single open lot listing, or return null when a listing is already
 * up, the hull is not a priced catalog ship, or the sector has no shipyard.
 * `recovery` marks a surrender; a kill with no scar of its own gets one death mark.
 */
export function postImpoundListing(state, bus, { entity, entry, recovery } = {}) {
  if (!state || !state.lossLedger || !entity || entity.id === state.playerId) return null;
  if (recovery && entity.alive === false) return null;
  // Same shape gate as openLot: a non-record impound (array, primitive) is not a
  // listing — overwriting it heals the slot rather than wedging every future post.
  const open = state.lossLedger.impound;
  if (open && typeof open === 'object' && !Array.isArray(open)) return null;
  const data = entity.data || {};
  if (data.factionPresence && data.factionPresence.factionId === 'faction_understory') return null;
  const def = SHIP_BY_ID.get(data.defId);
  const catalogPrice = def && Number(def.price);
  if (!def || !def.name || !Number.isFinite(catalogPrice) || catalogPrice <= 0) return null;
  const sectorId = (entry && entry.sectorId) || data.sectorId
    || (state.world && state.world.currentSectorId) || null;
  const custody = recovery && stationById(recovery.stationId);
  const custodyYard = custody && Array.isArray(custody.services) && custody.services.includes('shipyard')
    ? custody : null;
  const station = custodyYard || shipyardIn(sectorId);
  if (!station || !station.name || !sectorId) return null;
  const lossId = entry && entry.lossId ? String(entry.lossId) : null;
  if (!lossId) return null;

  const simTime = Number(state.simTime) || 0;
  const tick = state.tick | 0;
  let hull = normalizeLivingHull(data.livingHull, simTime);
  const source = recovery ? 'surrender' : 'loss';
  if (source === 'loss' && livingHullScars(hull).length === 0) {
    const facing = LIVING_HULL_SCAR_FACINGS[hash32(lossId, 'impound-scar') % LIVING_HULL_SCAR_FACINGS.length];
    hull = livingHullWithScar(hull, {
      id: `impound-mark:${hash32(lossId, 'impound-mark').toString(36)}`,
      cause: 'weapon',
      surface: 'weapon',
      band: 'heavy',
      facing,
      atT: simTime,
      tick,
      patchedAtT: null,
    }, simTime);
  }
  const papers = papersForHull(hull, entry, entity, sectorId, simTime, tick);
  if (!papers) return null;
  const callsign = plainWords(data.callsign)
    || plainWords(entry && entry.victimCallsign)
    || plainWords(data.name)
    || plainWords(entry && entry.victimName);
  const named = callsign && callsign !== def.name ? callsign : null;
  const scars = livingHullScars(hull);
  const listing = {
    listingId: `impound:${hash32(lossId, 'impound-lot').toString(36)}`,
    lossId,
    defId: def.id,
    shipName: def.name,
    callsign: named,
    stationId: station.id,
    stationName: station.name,
    sectorId,
    price: Math.max(1, Math.round(catalogPrice * 0.4)),
    livingHull: hull,
    deed: papers.deed,
    deedLine: papers.line,
    scarSentence: scarSentence(scars),
    quirk: Object.freeze({ kind: 'overbored', accelMult: IMPOUND_ACCEL_MULT }),
    source,
  };
  listing.historyLine = impoundHistoryLine(listing);
  if (!listing.historyLine || RAW_ID.test(listing.historyLine)) return null;
  state.lossLedger.impound = listing;
  stampLotEconomy(state, listing, entry);
  lotJournal(state).lastListing = listing;
  ensureImpoundLotWiring(state, bus ? { bus } : null);
  if (bus && bus.emit) {
    bus.emit('news:publish', {
      text: listing.historyLine,
      kind: 'impound_lot',
      eventId: listing.listingId,
      source: 'lossLedger',
      sourceRef: listing.listingId,
      stationId: station.id,
      sectorId,
    });
  }
  return listing;
}
