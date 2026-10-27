// faction_pitborn.js — W-PITBORN (build_map §34.5 row 519, bible 02 §13).
//
// The Pitborn play Katamari as sport. Done-when:
//   · the Cull crowd meter (E-40): style kills fill it, it decays, tiers bark Ma Sprocket
//     lines, the purse scales with the settled score; dressing data (crowd/banners/board)
//   · the Yardmaster: procedurally accreted from the 43 WRECK_AFTERMATH_MODELS pieces and
//     dismantled piece by piece — every stripped piece drops as a keepable wreck body
//   · ballast balls in five sizes; balls accrete contacting junk and visibly bulk
//   · Ballast against Clatter (E-41): biggest junk ball at the horn; the yard names a ball
//   · Magnet Head: the Cull sells it (data + sale hook)
//
// THE BOOK — the pit economy a staked claim plugs into:
//   · CLAIM STAKES — the yard files rings on real rocks. The player buys a deed,
//     leases a ring, or takes a claim on tick; a payload stake marks the ground
//     and drilling inside an owned ring pays pit-gate royalties per unit. Drill
//     inside a yard-held ring and the sabotage ledger files the claim-jump.
//   · EXTRACTION QUOTAS — the pit posts an ore order on a beat; drilled units
//     and player-owned ballast scrap fill it. Over-quota pays a glut bonus;
//     misses file strikes, and three strikes close the book (blacklist).
//   · PIT-DEBT — a financed claim owes the Tally Crew. Miss a period and the
//     note grows vig; collectors close, levy on contact, clamp the claim, and
//     the yard finally writes the pilot off into a blacklist.
//   · DRILL SHARES — buy into the pit itself. Each settled order pays a dividend
//     per share by performance and standing; the price drifts with pit heat.
//   · CLAIM MARKET — the yard lists proven claims and buys deeds back on a
//     deterministic sale delay, minus the yard's cut.
//   · SABOTAGE SUSPICION — jumped claims, burned stakes, broken miners and dead
//     collectors file records in a bounded ledger: warn, fine, blacklist; honest
//     work and time sand it down.
//   · STANDING — deeds done for the yard raise a pit tier that scales every
//     payout the book makes: royalties, quota purses, dividends, sale prices.
//
// Deterministic: every clock reads simTime; posts, asks and sale delays draw
// from hash32 over ids and seqs; collector luck rides a serializable mulberry32
// seed on the debt record; bark picks draw from state.rng. Money moves only
// through economy:grantCredits / economy:chargeCredits; standing only through
// faction:repDelta. All ledger state is plain JSON under state.pitborn;
// once-only stamps ride f.paid, and entity bindings record occupantGeneration
// plus an ownership tag so a recycled id is never the same stake or collector.

import {
  PITBORN_BALLAST_BALLS,
  PITBORN_BALLAST_ACCRETE,
  PITBORN_BALLAST_MATCH,
  PITBORN_CULL,
  PITBORN_YARDMASTER,
  PITBORN_BARKS,
} from '../data/factions/pitborn.js';
import { WRECK_AFTERMATH_MODELS } from '../data/wreckAftermathDressing.js';
import { styleCauseFromKill } from './survivalStyle.js';
import { hash32, drawSeeded } from '../core/rng.js';
import { queuePhysicsImpulse, syncDerivedPhysicsMass } from '../core/physicsAuthority.js';

const FACTION_ID = 'faction_pitborn';
const BALLAST_BY_ID = Object.fromEntries(PITBORN_BALLAST_BALLS.map((b) => [b.id, b]));
const EDIBLE = new Set(PITBORN_BALLAST_ACCRETE.edibleTypes);
const dist2 = (a, b) => { const dx = a.x - b.x, dz = a.z - b.z; return dx * dx + dz * dz; };

// ── The book: claim stakes ─────────────────────────────────────────────────────
// A claim is a filed ring on the rocks — position, radius, proven reserve. Deeds
// are bought, leases expire, financed claims ride the debt book; yard claims
// belong to NPC_OWNER. The stake is a real body: burn it, the filing dies.
export const PITBORN_CLAIM_STAKES = Object.freeze({
  deedCostCr: 900,            // a staked deed, bought outright
  leaseCostCr: 220,           // a ring you rent — it lapses on the clock
  leaseTermS: 480,
  ringR: 520,                 // a filed ring's radius
  stakeHull: 60,
  stakeRadius: 9,
  maxClaims: 10,              // total live claims, player's and the yard's
  maxPlayerClaims: 4,         // the yard will not stake one pilot more than this
  npcMax: 4,                  // yard-held claims at once — the belt is big, not infinite
  npcPostPeriodS: 190,        // the yard files a claim roughly on this beat
  npcPostJitterS: 110,
  firstPostS: 45,             // the yard wants its rings on the board early
  royaltyPerUnitCr: 6,        // pit-gate price per unit pulled from an owned ring
  wildCredit: 0.5,            // wild-rock extraction counts half toward the quota
  scrapPerTonne: 0.4,         // owned ballast accretion feeds the quota at this rate
  deedValueFloor: 0.55,       // resale floor on a deed (fraction of deedCost)
  reservePerUnitCr: 3,        // proven reserve value per unit on sale
  extractedPerUnitCr: 2,      // proved-up value per unit already pulled
  sellYardCut: 0.15,          // the yard's cut when a deed sells on the market
  deedPerUnits: 120,          // extraction milestone: this many owned units is a deed
  repFiled: 1, repSold: 1,
  logKeep: 8,                 // closed claim rows kept for the record strip
});

// ── The pit's order: extraction quotas ─────────────────────────────────────────
// An order posts on a beat and is due a beat later. Fill it — purse plus glut
// bonus; miss it — a strike lands; three live strikes close the book.
export const PITBORN_QUOTA = Object.freeze({
  periodS: 300,               // a new order posts on this beat
  firstPostS: 60,             // the first order comes quickly — the pit is hungry
  windowS: 240,               // an order is due this long after it posts
  baseUnits: 40,              // units demanded at standing tier 0
  unitsPerTier: 18,           // the order grows as the yard learns to trust you
  basePayCr: 260,             // base payout for a met order (× standing mult)
  payPerUnitCr: 4,            // plus this per delivered unit
  overBonusPerUnitCr: 9,      // over-quota units pay a glut bonus
  repMet: 3, repMissed: -3,
  maxStrikes: 3,              // live strikes before the blacklist
  strikeDecayS: 900,          // a strike older than this stops counting
  logKeep: 8,
});

// ── Pit-debt: claims on tick, and the Tally Crew that collects ────────────────
// A financed claim owes the yard the deed price, due on a beat; each missed
// beat adds vig. While missed the Tally Crew flies — hulls that close on the
// player and levy on contact. Overdue long → the claim is clamped; longer →
// written off and blacklisted.
export const PITBORN_DEBT = Object.freeze({
  vigPerPeriod: 0.18,         // the note grows by this fraction each missed period
  periodS: 240,               // a payment is due on this beat
  graceS: 200,                // first payment grace after filing on tick
  earlyDiscount: 0.9,         // settling before the first due date pays this fraction
  warnBeforeS: 60,            // the yard warns this far ahead of the first due date
  clampAfterS: 420,           // overdue this long → the financed claim is clamped
  writeoffAfterS: 900,        // still unpaid → written off + blacklist
  collectorHull: 140,
  collectorRadius: 14, collectorMass: 40,
  spawnR: 900,
  speed: 46,
  collectR: 90,               // a collector this close levies the payment
  collectBeatS: 2.5,          // levies land on this beat while in contact
  levyFraction: 0.34,         // a levy takes at most this much of the principal
  tauntBeatS: 12,             // a broke pilot hears about it on this beat
  collectorCap: 4,            // max hulls the Tally Crew fields for one note
  repPaid: 3, repForeclosed: -6, repWrittenOff: -10,
  repCollectorKilled: -5,
  logKeep: 8,
});

// ── Drill shares: a cut of the pit itself ──────────────────────────────────────
// Shares pay a dividend every settled order, scaled by performance and standing.
// The price drifts with pit heat — an honest number, never a rolled die.
export const PITBORN_SHARES = Object.freeze({
  maxShares: 8,
  basePriceCr: 320,
  dividendBaseCr: 90,         // per share per settled order at performance 1.0
  dividendCapCr: 400,         // per-share payout ceiling — one bell never breaks the yard
  heatMin: 0.2, heatMax: 3.0,
  heatDecay: 0.7,             // each bell keeps this much of the old heat
  heatGain: 0.55,             // plus this much of the bell's performance
  saleYardCut: 0.08,          // the yard's cut when you sell a share back
});

// ── The claim market ───────────────────────────────────────────────────────────
// The yard lists proven claims and buys deeds back. Player listings sell on a
// deterministic delay; stale listings de-list.
export const PITBORN_CLAIM_MARKET = Object.freeze({
  maxListings: 5,
  postPeriodS: 260, postJitterS: 140,
  firstPostS: 150,
  ttlS: 600,                  // an unbought yard listing de-lists
  askBaseCr: 700, askPerReserveCr: 4,
  saleDelayMinS: 90, saleDelaySpanS: 180,   // a player listing sells inside this window
  logKeep: 8,
});

// ── Sabotage suspicion: the yard's memory for dishonest work ──────────────────
// Jumped claims, burned stakes, broken miners, dead collectors — all file a
// record. The score warns, fines, blacklists; honest work and time sand it down.
export const PITBORN_SUSPICION = Object.freeze({
  max: 100,
  decayPerS: 0.05,            // time sands suspicion down, slowly
  drillJump: 24,              // drilling ore out of a filed claim
  stakeKilled: 30,            // burning someone's claim stake
  minerKilled: 18,            // breaking a pitborn hull that never drew on you
  collectorKilled: 26,        // killing a Tally Crew hull
  quotaStrike: 8,             // a missed order reads as a soft welch
  warnAt: 25, fineAt: 55, blacklistAt: 85,
  fineCr: 350, fineRep: -4,
  blacklistS: 420, blacklistRep: -8,
  rearmBelow: 12,             // a stage re-arms once the score falls this far under it
  honestDrop: 6,              // settled orders, clean sales and paid notes sand it down
  logKeep: 16,
});

// ── Yard standing: deeds are the only resume the pit reads ─────────────────────
export const PITBORN_YARD_TIERS = Object.freeze([
  { tier: 0, deeds: 0,  id: 'runt',       label: 'Rock Runt',  payMult: 1.0,
    line: 'New face at the pit gate. Prove the hold.' },
  { tier: 1, deeds: 3,  id: 'pit_hand',   label: 'Pit Hand',   payMult: 1.15,
    line: 'The tally crew nods when you dock. That costs them.' },
  { tier: 2, deeds: 8,  id: 'dredger',    label: 'Dredger',    payMult: 1.35,
    line: 'Your name is on the intake board twice this season.' },
  { tier: 3, deeds: 15, id: 'claim_boss', label: 'Claim Boss', payMult: 1.6,
    line: 'Stakes get filed around YOUR orbits now.' },
  { tier: 4, deeds: 26, id: 'yard_made',  label: 'Yard-Made',  payMult: 1.9,
    line: 'Ma Sprocket pours. The yard is yours, pilot.' },
]);

// The book talks like the yard talks — Ma Sprocket and the tally crew.
export const PITBORN_PIT_BARKS = Object.freeze({
  stakeFiled: 'Stakes in the ground! The pit is yours, pilot — work it honest.',
  leaseFiled: 'A lease! The yard rents the ring, you feed it.',
  financed: 'On tick then! The Tally Crew keeps the book. Pay it clean.',
  yardFiled: 'The yard files a ring. Filed ore is spoken for, pilot.',
  claimJumped: 'EYES UP — that ring is FILED. The yard saw the drill.',
  claimExpired: 'Lease ran out — the ring goes back to the belt.',
  claimBurned: 'Someone torched a filed stake. The yard writes it down.',
  foreclosed: 'Claim clamped! Welchers lose the ring.',
  quotaPosted: "The pit wants ore! Order's on the board — fill it.",
  quotaMet: 'Quota FILLED! The yard pays for a full hold.',
  quotaGlut: "OVER the order! A glut of ore — the yard loves it.",
  quotaMissed: 'The order went thin. Strikes add up, pilot.',
  debtDueSoon: "The note's coming due. The Tally Crew counts better than you.",
  collectorsOut: 'Tally Crew is OUT. They take the payment or the claim.',
  levy: 'The Crew takes what the book says. Pay the rest clean.',
  taunt: 'Empty holds pay nothing — the note still grows.',
  writtenOff: "The book's closed on you — no more pit work till the yard forgets.",
  paid: 'Paid clean! The Tally Crew salutes.',
  shareBought: 'A share of the pit! You eat what the yard eats now.',
  shareSold: 'Share sold — the pit stays hungry without you.',
  dividend: 'The pit pays its own — dividend on the wire.',
  marketListed: 'Proven ground on the board — first come, first drilled.',
  marketSold: 'Sold! The yard takes its cut and wishes you well.',
  warn: "The yard is watching you, pilot. Careful with other people's ore.",
  fined: 'The yard fines what it cannot forgive. Paid from your hold.',
  blacklisted: 'BLACKLIST. No claims, no orders, no shares. Work it off elsewhere.',
  blacklistLifted: 'The yard turns a page. The book is open to you again.',
});

const NPC_OWNER = 'pitborn_yard';   // claim.ownerId for yard-held claims
const PLAYER_OWNER = 'player';
const CLAIM_LIVE = new Set(['open', 'listed']);
const CLAIM_STATES = new Set(['open', 'listed', 'expired', 'burned', 'foreclosed', 'sold', 'lapsed']);
// The board persists only these — 'pending' is an in-tick latch, never a save state.
const LISTING_STATES = new Set(['open', 'sold', 'delisted']);
const PAID_STAMPS_CAP = 96;
const NAMED_BALLS_CAP = 16;

/** A book row answers in the sector it was filed in — bodies do not travel. */
function inSector(row, sectorNow) {
  return !row || row.sectorId == null || sectorNow == null || row.sectorId === sectorNow;
}
function sectorOf(state) {
  return (state && state.world && state.world.currentSectorId) || null;
}

const CLAIM_NAMES = Object.freeze([
  'Big Bertha', "Widow's Cut", 'Tin Fortune', 'The Maw', 'Slag Heap', 'Ore Else',
  'The Dentist', 'Cold Seep', 'Rust Garden', "Mother's Lode", 'Pittance', 'The Comptroller',
  'Nine Fingers', 'The Audit', 'Hollow Prize', 'Dredge Rest', 'The Vig', 'Iron Lung',
]);

// ── Normalization helpers — every record field is coerced, never trusted ───────
function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
function str(v, d = '') { return typeof v === 'string' && v ? v : d; }
function intOr(v, d = 0) { const n = Number(v); return Number.isFinite(n) ? n | 0 : d; }
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const frac = (...args) => (hash32(...args) >>> 0) / 4294967296; // deterministic [0,1)

/** Drop the oldest closed rows past the keep count — bounded ledger discipline. */
function gcClosedRows(rows, keepClosed) {
  let closed = 0;
  for (const r of rows) if (r && !CLAIM_LIVE.has(r.state)) closed++;
  let excess = closed - keepClosed;
  if (excess <= 0) return;
  for (let i = 0; i < rows.length && excess > 0; i++) {
    const r = rows[i];
    if (r && !CLAIM_LIVE.has(r.state)) { rows.splice(i, 1); i--; excess--; }
  }
}

function claimNameFor(id) { return CLAIM_NAMES[hash32('pitclaim-name', id) % CLAIM_NAMES.length]; }

function normalizeClaim(c) {
  if (!isObj(c.pos)) c.pos = { x: 0, z: 0 };
  c.pos.x = num(c.pos.x); c.pos.z = num(c.pos.z);
  c.ringR = num(c.ringR, PITBORN_CLAIM_STAKES.ringR);
  c.ownerId = str(c.ownerId, NPC_OWNER);
  c.name = str(c.name) || claimNameFor(c.id);
  c.kind = c.kind === 'lease' ? 'lease' : 'deed';
  c.filedAt = num(c.filedAt);
  c.expiresAt = num(c.expiresAt);             // only leases read it; deeds ignore
  // A lease with no clock would rent forever — bill it from filing day.
  if (c.kind === 'lease' && !(c.expiresAt > 0)) c.expiresAt = c.filedAt + PITBORN_CLAIM_STAKES.leaseTermS;
  c.closedAt = num(c.closedAt);
  c.reserve = Math.max(0, num(c.reserve));
  c.extracted = Math.max(0, num(c.extracted));
  c.stolen = Math.max(0, num(c.stolen));      // units a claim-jumper pulled
  c.state = str(c.state);
  // A state outside the book's vocabulary (a non-string or a smuggled value) is
  // a closed row — never a live filing the default would quietly resurrect.
  if (!CLAIM_STATES.has(c.state)) c.state = 'lapsed';
  c.anchorId = c.anchorId == null ? null : c.anchorId;
  c.anchorGen = c.anchorGen == null ? null : c.anchorGen;
  c.markerId = c.markerId == null ? null : c.markerId;
  c.markerGen = c.markerGen == null ? null : c.markerGen;
  c.financed = c.financed === true;
  c.saleId = c.saleId == null ? null : str(c.saleId);
  c.sectorId = c.sectorId == null ? null : str(c.sectorId, null);
  return c;
}

function normalizeListing(l) {
  if (!isObj(l.pos)) l.pos = { x: 0, z: 0 };
  l.pos.x = num(l.pos.x); l.pos.z = num(l.pos.z);
  l.ringR = num(l.ringR, PITBORN_CLAIM_STAKES.ringR);
  l.reserve = Math.max(0, num(l.reserve));
  l.askCr = Math.max(0, Math.round(num(l.askCr)));
  l.seller = str(l.seller, 'the yard');
  l.source = l.source === 'player' ? 'player' : 'yard';
  l.claimId = l.claimId == null ? null : str(l.claimId);
  l.anchorId = l.anchorId == null ? null : l.anchorId;
  l.anchorGen = l.anchorGen == null ? null : l.anchorGen;
  l.listedAt = num(l.listedAt);
  l.expiresAt = num(l.expiresAt);
  l.sellAt = num(l.sellAt);
  l.state = str(l.state);
  // A state outside the board's vocabulary (e.g. a smuggled 'listed', a persisted
  // 'pending', or no state at all) counts live to the ledger GC but is never
  // processed — the row would be a zombie selling a free ring. Close it on load.
  if (!LISTING_STATES.has(l.state)) l.state = 'delisted';
  l.sectorId = l.sectorId == null ? null : str(l.sectorId, null);
  return l;
}

function normalizeQuota(q) {
  q.wantUnits = Math.max(1, num(q.wantUnits, PITBORN_QUOTA.baseUnits));
  q.gotUnits = Math.max(0, num(q.gotUnits));
  q.postedAt = num(q.postedAt);
  q.dueAt = num(q.dueAt, q.postedAt + PITBORN_QUOTA.windowS);
  q.state = str(q.state);
  // The order slot only persists 'open' explicitly — a stateless or foreign row
  // is an already-rung bell, never a live order that files a phantom strike.
  if (q.state !== 'open') q.state = 'missed';
  return q;
}

function normalizeDebt(d) {
  d.claimId = d.claimId == null ? null : str(d.claimId);
  d.principal = Math.max(0, Math.round(num(d.principal)));
  d.balance = Math.max(0, Math.round(num(d.balance)));
  d.postedAt = num(d.postedAt);
  d.dueAt = num(d.dueAt, d.postedAt + PITBORN_DEBT.graceS);
  d.firstMissedAt = num(d.firstMissedAt);
  // A stage-1+ note with no recorded first miss would foreclose instantly on load.
  if (d.stage >= 1 && !(d.firstMissedAt > 0)) d.firstMissedAt = num(d.dueAt);
  d.missed = Math.max(0, intOr(d.missed));
  d.stage = Math.max(0, Math.min(3, intOr(d.stage)));
  d.spawned = Math.max(0, intOr(d.spawned));
  d.seed = intOr(d.seed, hash32('pitdebt', d.id) || 1);
  d.state = str(d.state);
  // The note slot only persists 'open' explicitly, and the system only writes
  // stages 0–2 — a stateless row, a foreign word, or a stage-3 corpse is a dead
  // note. Left 'open' it would levy nothing yet still warn, file a foreclosure
  // rep hit, blacklist on writeoff, and wedge the one-note seat forever.
  if (d.state !== 'open' || d.stage >= 3) d.state = 'written';
  return d;
}

/** Fresh serializable Pitborn record: crowd meter, leaderboard, named balls, the match. */
export function ensurePitbornState(state) {
  if (!isObj(state.pitborn)) {
    state.pitborn = {
      crowd: { score: 0, tier: 'cold', peak: 0 },
      leaderboard: [], namedBalls: [], ballastMatch: null,
    };
  }
  const p = state.pitborn;
  if (!isObj(p.crowd)) p.crowd = { score: 0, tier: 'cold', peak: 0 };
  // The meter is a number or it is nothing — a NaN/string score would wedge
  // award/decay/settle for the rest of the session.
  p.crowd.score = Math.max(0, Math.min(PITBORN_CULL.crowdMax, num(p.crowd.score)));
  p.crowd.peak = Math.max(p.crowd.score, Math.min(PITBORN_CULL.crowdMax, num(p.crowd.peak)));
  p.crowd.tier = crowdTierFor(p.crowd.score).id;
  if (!Array.isArray(p.leaderboard)) p.leaderboard = [];
  if (p.leaderboard.length > 16) p.leaderboard = p.leaderboard.slice(-16);
  if (!Array.isArray(p.namedBalls)) p.namedBalls = [];
  if (p.namedBalls.length > NAMED_BALLS_CAP) p.namedBalls = p.namedBalls.slice(-NAMED_BALLS_CAP);
  if (p.ballastMatch === undefined || !isObj(p.ballastMatch)) p.ballastMatch = null;
  // ── The book: claim stakes, quotas, pit-debt, shares, market, suspicion ──
  p.seq = Math.max(0, intOr(p.seq));
  p.deeds = Math.max(0, intOr(p.deeds));
  p.tier = Math.max(0, intOr(p.tier));
  p.suspicion = Math.max(0, Math.min(PITBORN_SUSPICION.max, num(p.suspicion)));
  p.suspicionStage = Math.max(0, Math.min(3, intOr(p.suspicionStage)));
  p.blacklistedUntil = Math.max(0, num(p.blacklistedUntil));
  p.heat = Math.max(PITBORN_SHARES.heatMin, Math.min(PITBORN_SHARES.heatMax, num(p.heat, 1)));
  p.extractedTotal = Math.max(0, num(p.extractedTotal));
  // The milestone mark can never stand ahead of the work it counts — a forged
  // mark would suppress every deed the pit owes the pilot from here on.
  p.extractionDeedMark = Math.max(0, Math.min(
    Math.floor(p.extractedTotal / PITBORN_CLAIM_STAKES.deedPerUnits),
    num(p.extractionDeedMark)));
  p.strikes = Math.max(0, intOr(p.strikes));
  p.lastStrikeAt = num(p.lastStrikeAt);
  p.nextClaimPostAt = num(p.nextClaimPostAt);
  p.nextQuotaAt = num(p.nextQuotaAt);
  p.nextMarketPostAt = num(p.nextMarketPostAt);
  if (!Array.isArray(p.suspicionLog)) p.suspicionLog = [];
  if (!Array.isArray(p.claims)) p.claims = [];
  if (!Array.isArray(p.market)) p.market = [];
  if (!Array.isArray(p.shares)) p.shares = [];
  if (!Array.isArray(p.collectors)) p.collectors = [];
  if (!Array.isArray(p.quotaLog)) p.quotaLog = [];
  if (!Array.isArray(p.debtLog)) p.debtLog = [];
  if (!isObj(p.paid)) p.paid = {};
  if (p.quota === undefined) p.quota = null;
  if (p.debt === undefined) p.debt = null;
  // Drop malformed rows outright — a corrupt row must not sink the tick.
  p.claims = p.claims.filter((c) => isObj(c) && typeof c.id === 'string').map(normalizeClaim);
  // Duplicate ids are the same filing twice on paper — the first row stands.
  // And rings the belt cannot hold close on load: a hostile save never
  // out-numbers the yard's own maxClaims cap, nor the pilot's maxPlayerClaims.
  const seenClaims = new Set();
  let liveClaims = 0, livePlayerClaims = 0;
  p.claims = p.claims.filter((c) => {
    if (seenClaims.has(c.id)) return false;
    seenClaims.add(c.id);
    if (CLAIM_LIVE.has(c.state)) {
      liveClaims += 1;
      if (c.ownerId === PLAYER_OWNER) livePlayerClaims += 1;
      if (liveClaims > PITBORN_CLAIM_STAKES.maxClaims
          || livePlayerClaims > PITBORN_CLAIM_STAKES.maxPlayerClaims) c.state = 'lapsed';
    }
    return true;
  });
  gcClosedRows(p.claims, PITBORN_CLAIM_STAKES.logKeep);
  p.market = p.market.filter((l) => isObj(l) && typeof l.id === 'string').map(normalizeListing);
  const seenListings = new Set();
  let openListings = 0;
  p.market = p.market.filter((l) => {
    if (seenListings.has(l.id)) return false;
    seenListings.add(l.id);
    if (l.state === 'open') {
      openListings += 1;
      if (openListings > PITBORN_CLAIM_MARKET.maxListings) l.state = 'delisted';
    }
    return true;
  });
  gcClosedRows(p.market, PITBORN_CLAIM_MARKET.logKeep);
  // Paper without a marked buy price was never issued — an id alone must not
  // mint a dividend seat. Duplicates and surplus lots drop like the rest.
  const seenShares = new Set();
  p.shares = p.shares.filter((s) => isObj(s) && typeof s.id === 'string'
    && Number.isFinite(Number(s.price)) && !seenShares.has(s.id) && seenShares.add(s.id));
  if (p.shares.length > PITBORN_SHARES.maxShares) p.shares.length = PITBORN_SHARES.maxShares;
  for (const s of p.shares) { s.price = num(s.price); s.boughtAt = num(s.boughtAt); }
  p.suspicionLog = p.suspicionLog.filter((r) => isObj(r) && typeof r.id === 'string');
  p.quotaLog = p.quotaLog.filter((r) => isObj(r) && typeof r.id === 'string');
  p.debtLog = p.debtLog.filter((r) => isObj(r) && typeof r.id === 'string');
  if (p.suspicionLog.length > PITBORN_SUSPICION.logKeep) p.suspicionLog = p.suspicionLog.slice(-PITBORN_SUSPICION.logKeep);
  if (p.quotaLog.length > PITBORN_QUOTA.logKeep) p.quotaLog = p.quotaLog.slice(-PITBORN_QUOTA.logKeep);
  if (p.debtLog.length > PITBORN_DEBT.logKeep) p.debtLog = p.debtLog.slice(-PITBORN_DEBT.logKeep);
  const seenCollectors = new Set();
  p.collectors = p.collectors.filter((r) => {
    if (!isObj(r) || r.entityId == null || typeof r.debtId !== 'string') return false;
    if (seenCollectors.has(r.entityId)) return false; // one hull, one field slot
    seenCollectors.add(r.entityId);
    return true;
  });
  if (p.quota != null && (!isObj(p.quota) || typeof p.quota.id !== 'string')) p.quota = null;
  else if (p.quota) normalizeQuota(p.quota);
  if (p.debt != null && (!isObj(p.debt) || typeof p.debt.id !== 'string')) p.debt = null;
  else if (p.debt) normalizeDebt(p.debt);
  // A closed singleton never re-opens — the logs keep its history, the slot stays live.
  if (p.quota && p.quota.state !== 'open') p.quota = null;
  if (p.debt && p.debt.state !== 'open') p.debt = null;
  // Ids mint from p.seq alone — a seq behind the rows it issued re-issues live
  // ids; a runaway seq only skips numbers. Heal it past every suffix seen.
  let maxSeq = p.seq;
  const bumpSeq = (v) => {
    const m = typeof v === 'string' ? /:(\d+)$/.exec(v) : null;
    if (m) maxSeq = Math.max(maxSeq, Number(m[1]) + 1);
  };
  for (const c of p.claims) { bumpSeq(c.id); bumpSeq(c.saleId); }
  for (const l of p.market) { bumpSeq(l.id); bumpSeq(l.claimId); }
  for (const s of p.shares) bumpSeq(s.id);
  for (const r of p.suspicionLog) bumpSeq(r.id);
  for (const r of p.quotaLog) bumpSeq(r.id);
  for (const r of p.debtLog) bumpSeq(r.id);
  for (const r of p.collectors) bumpSeq(r.debtId);
  if (p.quota) bumpSeq(p.quota.id);
  if (p.debt) bumpSeq(p.debt.id);
  p.seq = maxSeq;
  // A 'listed' deed whose market row is gone (a stale save, a GC'd board) can
  // never finish selling — the ring reopens rather than wedge a claim slot
  // forever on a board entry that does not exist.
  const liveListings = new Set();
  for (const l of p.market) {
    if (l && l.state === 'open' && l.source === 'player') {
      if (l.claimId != null) liveListings.add(l.claimId);
      liveListings.add(l.id);
    }
  }
  for (const c of p.claims) {
    if (c && c.state === 'listed' && c.ownerId === PLAYER_OWNER
        && !liveListings.has(c.id) && !liveListings.has(c.saleId)) c.state = 'open';
  }
  return p;
}

export function crowdTierFor(score) {
  let tier = PITBORN_CULL.tiers[0];
  for (const t of PITBORN_CULL.tiers) if (score >= t.at) tier = t;
  return tier;
}

/** The Cull purse at a crowd score — style pays. */
export function cullPurseFor(score) {
  return Math.round(PITBORN_CULL.purseBase + Math.max(0, score) * PITBORN_CULL.pursePerPoint);
}

/** Yard standing tier row for a deed count — the pit's only resume. */
export function pitbornTierFor(deeds) {
  const d = Math.max(0, intOr(deeds));
  let row = PITBORN_YARD_TIERS[0];
  for (const t of PITBORN_YARD_TIERS) if (d >= t.deeds) row = t;
  return row;
}

/** The player's yard standing: current tier row plus the deed count behind it. */
export function pitbornStanding(state) {
  const p = ensurePitbornState(state);
  const row = pitbornTierFor(p.deeds);
  return { tier: row.tier, id: row.id, label: row.label, payMult: row.payMult, deeds: p.deeds };
}

/** Suspicion stage: 0 clean · 1 warned · 2 fined · 3 blacklist threshold. */
export function pitbornSuspicionStageFor(score) {
  const s = num(score);
  if (s >= PITBORN_SUSPICION.blacklistAt) return 3;
  if (s >= PITBORN_SUSPICION.fineAt) return 2;
  if (s >= PITBORN_SUSPICION.warnAt) return 1;
  return 0;
}

/** The pit's marked share price — drifts with heat, never a rolled die. */
export function pitbornSharePrice(state) {
  const p = ensurePitbornState(state);
  return Math.max(1, Math.round(PITBORN_SHARES.basePriceCr * (0.6 + 0.35 * p.heat)));
}

/** The live claim whose ring contains (x,z), or null — "FILED" checks for pilots. */
export function pitbornClaimAt(state, x, z) {
  const p = ensurePitbornState(state);
  const px = num(x), pz = num(z);
  const sectorNow = sectorOf(state);
  for (const c of p.claims) {
    if (!c || !CLAIM_LIVE.has(c.state) || !inSector(c, sectorNow)) continue;
    const rr = c.ringR;
    const dx = px - c.pos.x, dz = pz - c.pos.z;
    if (dx * dx + dz * dz <= rr * rr) return c;
  }
  return null;
}

/** Sale value of a player deed on the market — floor plus proven ground, by heat. */
export function pitbornClaimSaleValue(state, claim) {
  const p = ensurePitbornState(state);
  if (!claim || !CLAIM_LIVE.has(claim.state)) return 0;
  const base = PITBORN_CLAIM_STAKES.deedCostCr * PITBORN_CLAIM_STAKES.deedValueFloor
    + num(claim.reserve) * PITBORN_CLAIM_STAKES.reservePerUnitCr
    + num(claim.extracted) * PITBORN_CLAIM_STAKES.extractedPerUnitCr;
  return Math.max(1, Math.round(base * (0.85 + 0.15 * p.heat)));
}

/** Snapshot of the whole book for a HUD/pit-board screen — copies, never live rows. */
export function pitbornBoard(state) {
  const p = ensurePitbornState(state);
  return {
    standing: pitbornStanding(state),
    suspicion: p.suspicion,
    suspicionStage: p.suspicionStage,
    blacklisted: p.blacklistedUntil > num(state.simTime),
    blacklistedUntil: p.blacklistedUntil,
    heat: p.heat,
    sharePrice: pitbornSharePrice(state),
    shareCount: p.shares.length,
    extractedTotal: p.extractedTotal,
    strikes: p.strikes,
    claims: p.claims.map((c) => ({ ...c, pos: { ...c.pos } })),
    market: p.market.map((l) => ({ ...l, pos: { ...l.pos } })),
    quota: p.quota ? { ...p.quota } : null,
    debt: p.debt ? { ...p.debt } : null,
    collectors: p.collectors.length,
    suspicionLog: p.suspicionLog.map((r) => ({ ...r })),
    quotaLog: p.quotaLog.map((r) => ({ ...r })),
    debtLog: p.debtLog.map((r) => ({ ...r })),
  };
}

/** Spawn a ballast ball in one of the five authored sizes. */
export function spawnBallastBall(state, helpers, { sizeId, x, z, ownerId = null }) {
  const spec = BALLAST_BY_ID[sizeId] || PITBORN_BALLAST_BALLS[0];
  return helpers.spawnEntity({
    type: 'junk', team: 1, factionId: FACTION_ID,
    pos: { x: num(x), z: num(z) }, vel: { x: 0, z: 0 }, rot: 0,
    radius: spec.radius, mass: spec.mass, hull: spec.mass * 4, hullMax: spec.mass * 4,
    collides: true,
    data: {
      ballastBall: true, ballastSizeId: spec.id, baseRadius: spec.radius,
      accretedMass: 0, ownerId, name: spec.label, scannable: true,
      scanLabel: `BALLAST · ${spec.label.toUpperCase()} · accrete it bigger`,
    },
  });
}

/** Spawn the Yardmaster, procedurally accreted: one piece per aftermath model, seeded. */
export function spawnYardmaster(state, helpers, { x, z, seed = null }) {
  const rng = () => state.rng();
  // Seeded shuffle of the 43 aftermath models — every Yardmaster is a different colossus.
  const pool = WRECK_AFTERMATH_MODELS.slice();
  if (seed != null) {
    // Deterministic order from the caller's seed without touching state.rng.
    let s = seed >>> 0 || 1;
    const draw = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 0xffffffff; };
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(draw() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  } else {
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  }
  const pieces = pool.slice(0, PITBORN_YARDMASTER.pieceCount).map((m, i) => ({
    idx: i, modelId: m.id, kind: m.kind, label: m.label, hull: PITBORN_YARDMASTER.pieceHull,
    longestM: m.longestM || 10, attached: true,
  }));
  const totalMass = pieces.reduce((a, pc) => a + 20 + (pc.longestM || 10), 0);
  const e = helpers.spawnEntity({
    type: 'ship', team: 1, factionId: FACTION_ID,
    pos: { x: num(x), z: num(z) }, vel: { x: 0, z: 0 }, rot: 0,
    radius: 320, mass: totalMass, hull: pieces.length * PITBORN_YARDMASTER.pieceHull,
    hullMax: pieces.length * PITBORN_YARDMASTER.pieceHull, collides: true,
    flags: { persistent: true },
    data: {
      yardmaster: true, name: PITBORN_YARDMASTER.name, role: 'yardmaster-capital',
      scannable: true,
      scanLabel: `YARDMASTER · ${pieces.length} accreted pieces · strip it, keep the pieces`,
      pieces,
    },
  });
  return e;
}

export const pitbornCull = {
  name: 'pitbornCull',

  init(ctx) {
    this.destroy(); // re-init never stacks a second set of bus listeners
    this.ctx = ctx; this.state = ctx.state; this.bus = ctx.bus; this.helpers = ctx.helpers;
    this._subs = [
      this.bus.on('entity:killed', (p) => this._onKilled(p)),
      this.bus.on('drill:end', (p) => this._onDrillEnd(p)),
    ];
    this._yardHull = new Map(); // entityId -> last hull, for piece-strip deltas
    ensurePitbornState(this.state);
  },

  destroy() {
    for (const off of this._subs || []) { try { off && off(); } catch (_) { /* unsubscribe only */ } }
    this._subs = [];
    this._yardHull = new Map();
  },

  // ── The book: shared plumbing ────────────────────────────────────────────────
  _log(state, text, speaker = PITBORN_BARKS.announcer) {
    if (typeof text !== 'string' || !text) return;
    this.bus.emit('comms:log', { text, speaker });
  },

  /** Once-only stamp for money/rep side-effects keyed by a content id. */
  _paidOnce(p, key) {
    if (!isObj(p.paid)) p.paid = {};
    if (p.paid[key] != null) return false;
    p.paid[key] = num(this.state && this.state.simTime);
    const keys = Object.keys(p.paid);
    // Trim back to the cap in one pass — a stamp book loaded far over budget
    // shrinks here rather than shedding a single key per stamp forever.
    for (let i = 0; i + PAID_STAMPS_CAP < keys.length; i++) delete p.paid[keys[i]];
    return true;
  },

  _credits(state) { return num(state.player && state.player.credits); },

  _grant(state, amount, reason) {
    const n = Math.round(num(amount));
    if (!Number.isSafeInteger(n) || n <= 0) return;
    this.bus.emit('economy:grantCredits', { amount: n, reason });
  },

  _charge(state, amount, reason) {
    const n = Math.round(num(amount));
    if (!Number.isSafeInteger(n) || n <= 0) return;
    this.bus.emit('economy:chargeCredits', { amount: n, reason });
  },

  _rep(state, delta, reason) {
    const d = num(delta);
    if (!Number.isFinite(d) || d === 0) return;
    this.bus.emit('faction:repDelta', { factionId: FACTION_ID, delta: d, reason });
  },

  _tierMult(p) { return pitbornTierFor(p.deeds).payMult; },

  /** A finished piece of yard work: count it, raise the tier when it crosses. */
  _deed(state, kind, refId) {
    const p = ensurePitbornState(state);
    p.deeds = (p.deeds | 0) + 1;
    const row = pitbornTierFor(p.deeds);
    this.bus.emit('pitborn:deed', {
      kind, ref: refId ?? null, deeds: p.deeds, tier: row.tier, tick: state.tick,
    });
    if (row.tier > (p.tier | 0)) {
      p.tier = row.tier;
      this.bus.emit('pitborn:tier', {
        tier: row.tier, id: row.id, label: row.label, deeds: p.deeds, tick: state.tick,
      });
      this.bus.emit('toast', {
        text: `YARD STANDING — ${row.label.toUpperCase()}`, kind: 'good', ttl: 4,
      });
      this._log(state, row.line);
    }
  },

  /** Honest work sands the sabotage ledger down a notch. */
  _honestWork(state) {
    const p = ensurePitbornState(state);
    p.suspicion = Math.max(0, p.suspicion - PITBORN_SUSPICION.honestDrop);
  },

  /** Refuse a book API — one toast, one event, and a false the caller can read. */
  _refuse(state, reason, text) {
    this.bus.emit('pitborn:refused', { reason, tick: state.tick });
    if (text) this.bus.emit('toast', { text, kind: 'error', ttl: 3 });
    return null;
  },

  _isBlacklisted(state) {
    const p = ensurePitbornState(state);
    return p.blacklistedUntil > num(state.simTime);
  },

  /** Drop the oldest closed rows past the keep count — bounded ledger discipline. */
  _gcClosed(rows, keepClosed) { gcClosedRows(rows, keepClosed); },

  // ── The Cull crowd meter (E-40) ──────────────────────────────────────────────────
  _onKilled(p) {
    if (!p) return;
    this._onKilledBook(p); // the book reads every kill wire — crowd is the player's show only
    if (p.killerId !== this.state.playerId) return;
    // Authored style kinds ('catch', 'multikill', 'impact', 'ballastFeed') score their own
    // row before the generic family lookup can flatten them.
    const authored = typeof p.styleCause === 'string' && PITBORN_CULL.stylePoints[p.styleCause] != null
      ? p.styleCause : null;
    const cause = authored || styleCauseFromKill(p) || 'kill';
    // The yard reads causes in its own register: a collision kill is an impact kill.
    const style = PITBORN_CULL.stylePoints[cause] != null ? cause
      : cause === 'collision' || cause === 'terrain' ? 'impact'
      : 'kill';
    this.awardCrowdStyle(this.state, style, PITBORN_CULL.stylePoints[style], p);
  },

  /** Style lands on the meter — the arena rates you live. */
  awardCrowdStyle(state, cause, points, payload = null) {
    const pit = ensurePitbornState(state);
    const before = crowdTierFor(pit.crowd.score);
    pit.crowd.score = Math.min(PITBORN_CULL.crowdMax, pit.crowd.score + Math.max(0, points || 0));
    pit.crowd.peak = Math.max(pit.crowd.peak, pit.crowd.score);
    const tier = crowdTierFor(pit.crowd.score);
    pit.crowd.tier = tier.id;
    this.bus.emit('pitborn:crowdStyle', {
      cause, points, score: pit.crowd.score, tier: tier.id, tick: state.tick,
    });
    if (tier !== before) {
      const line = tier.id === 'count'
        ? "COUNT 'EM! COUNT 'EM!"
        : PITBORN_BARKS.crowdUp[Math.floor(state.rng() * PITBORN_BARKS.crowdUp.length)];
      this.bus.emit('comms:log', { text: line, speaker: PITBORN_BARKS.announcer });
      this.bus.emit('pitborn:crowdTier', { tier: tier.id, score: pit.crowd.score, tick: state.tick });
    }
    // The scoreboard redraws crowd score and purse for the arena dressing lane.
    this.bus.emit('pitborn:scoreboard', {
      score: pit.crowd.score, tier: tier.id, purse: cullPurseFor(pit.crowd.score), tick: state.tick,
    });
    return pit.crowd.score;
  },

  /** Settle the Cull: record the run on the yard leaderboard and pay the purse.
   *  An unrated house pays nothing — a repeat settle never mints a second purse. */
  settleCull(state, { killed = 0 } = {}) {
    const pit = ensurePitbornState(state);
    const score = num(pit.crowd.score);
    if (score <= 0) {
      pit.crowd.score = 0;
      pit.crowd.tier = 'cold';
      return 0;
    }
    const purse = cullPurseFor(score);
    pit.leaderboard.push({
      score: Math.round(score), peak: Math.round(pit.crowd.peak),
      purse, kills: killed, settledAt: state.simTime,
    });
    while (pit.leaderboard.length > 16) pit.leaderboard.shift();
    // Latch before emit: the meter is dead before the wire moves — a settle
    // re-entered from a listener sees a cold house and pays nothing.
    pit.crowd.score = 0;
    pit.crowd.peak = 0; // the next run's high-water is its own
    pit.crowd.tier = 'cold';
    this.bus.emit('pitborn:cullSettled', {
      score, purse, kills: killed, tick: state.tick,
    });
    this.bus.emit('economy:grantCredits', { amount: purse, reason: 'pitborn_cull_purse' });
    return purse;
  },

  // ── Ballast balls ──────────────────────────────────────────────────────────────
  _accreteBalls(state) {
    for (const ball of state.entityList) {
      if (!ball || ball.alive === false || ball.data?.ballastBall !== true) continue;
      const reach = ball.radius + 6;
      for (const prey of state.entityList) {
        if (prey === ball || !prey || prey.alive === false || !EDIBLE.has(prey.type)) continue;
        // Claim stakes are payloads — edible by type, but a filed ring is not junk feed.
        if (prey.data?.ballastBall === true || prey.data?.pitbornStake === true) continue;
        const rr = reach + (Number(prey.radius) || 0);
        if (dist2(prey.pos, ball.pos) > rr * rr) continue;
        const gained = Math.max(0, Number(prey.mass) || 0) * PITBORN_BALLAST_ACCRETE.yield;
        ball.data.accretedMass = Math.max(0, num(ball.data.accretedMass)) + gained;
        ball.mass = Math.max(0, num(ball.mass)) + gained;
        // A ball that lost its authored baseRadius heals off its live radius —
        // never write NaN back into the body's collider.
        ball.data.baseRadius = Math.max(1, num(ball.data.baseRadius, ball.radius));
        ball.radius = ball.data.baseRadius + ball.data.accretedMass * PITBORN_BALLAST_ACCRETE.radiusPerMass;
        // The authored body hears the growth — collider radius and mass stay honest
        // on the Rapier side, not just on the entity record.
        syncDerivedPhysicsMass(ball, ball.mass, undefined, ball.radius);
        this.helpers.removeEntity(prey.id, { reason: 'ballast_accreted' });
        this.bus.emit('pitborn:ballastAccreted', {
          ballId: ball.id, eatenId: prey.id, gained, accretedMass: ball.data.accretedMass,
          tick: state.tick,
        });
        // A player-owned ball feeding the yard counts the scrap toward the pit's order.
        if (state.playerId != null && ball.data.ownerId === state.playerId && gained > 0) {
          this._creditExtraction(state, gained * PITBORN_CLAIM_STAKES.scrapPerTonne, null, 'ballast');
        }
      }
    }
  },

  // ── E-41 Ballast vs Clatter ────────────────────────────────────────────────────
  startBallastMatch(state, { playerBallId = null } = {}) {
    const pit = ensurePitbornState(state);
    const ballEnt = playerBallId != null ? state.entities.get(playerBallId) : null;
    pit.ballastMatch = {
      playerBallId,
      playerBallGen: ballEnt ? ballEnt.occupantGeneration ?? null : null,
      clatterMass: PITBORN_BALLAST_MATCH.clatterSeededBonus,
      hornAt: state.simTime + PITBORN_BALLAST_MATCH.matchS,
      over: false, winner: null, purse: 0,
    };
    this.bus.emit('pitborn:ballastStart', { hornAt: pit.ballastMatch.hornAt, tick: state.tick });
    this.bus.emit('comms:log', { text: PITBORN_BARKS.ballastStart, speaker: PITBORN_BARKS.announcer });
    return pit.ballastMatch;
  },

  _tickBallastMatch(state, dt) {
    const match = ensurePitbornState(state).ballastMatch;
    if (!match || match.over) return;
    // Hostile clocks and masses heal: a NaN horn still sounds, a NaN ball still weighs.
    match.clatterMass = num(match.clatterMass, PITBORN_BALLAST_MATCH.clatterSeededBonus)
      + PITBORN_BALLAST_MATCH.clatterAccretePerS * num(dt, 1 / 60);
    match.hornAt = num(match.hornAt, num(state.simTime) + PITBORN_BALLAST_MATCH.matchS);
    const ball = match.playerBallId != null ? state.entities.get(match.playerBallId) : null;
    // The id alone is not the ball — generation and the ballast tag keep a
    // recycled occupant from standing in at weigh-in.
    const sameBall = ball && ball.alive !== false && ball.data?.ballastBall === true
      && (match.playerBallGen == null || ball.occupantGeneration === match.playerBallGen);
    // ball.mass already carries every accreted tonne (the feed adds it there) —
    // counting accretedMass again would double the player's weigh-in.
    const playerMass = sameBall ? num(ball.mass) : 0;
    match.playerMass = playerMass;
    if (state.simTime >= match.hornAt) {
      match.over = true;
      match.winner = playerMass > match.clatterMass ? 'player' : PITBORN_BALLAST_MATCH.rival;
      this.bus.emit('pitborn:ballastHorn', {
        winner: match.winner, playerMass, clatterMass: match.clatterMass, tick: state.tick,
      });
      this.bus.emit('comms:log', { text: PITBORN_BALLAST_MATCH.hornLine, speaker: PITBORN_BARKS.announcer });
      if (match.winner === 'player') {
        const name = `Ball of ${state.player?.callsign || 'the Pilot'}`;
        const named = ensurePitbornState(state).namedBalls;
        named.push({ name, mass: playerMass, namedAt: state.simTime });
        while (named.length > NAMED_BALLS_CAP) named.shift();
        this.bus.emit('comms:log', { text: PITBORN_BALLAST_MATCH.winLine, speaker: PITBORN_BARKS.announcer });
        this.bus.emit('pitborn:ballastNamed', { name, ballId: match.playerBallId, tick: state.tick });
      } else {
        this.bus.emit('comms:log', { text: PITBORN_BALLAST_MATCH.loseLine, speaker: PITBORN_BARKS.announcer });
      }
    }
  },

  // ── The Yardmaster, dismantled piece by piece ──────────────────────────────────
  _tickYardmasters(state) {
    const live = new Set();
    for (const e of state.entityList) {
      if (!e || e.alive === false || !e.data?.yardmaster) continue;
      live.add(e.id);
      // Rows are bound to an occupant, not an id: a recycled id never inherits the
      // previous colossus's hull and mints phantom strip damage.
      const rec = this._yardHull.get(e.id);
      const last = rec && rec.gen === e.occupantGeneration ? rec.hull : e.hull;
      this._yardHull.set(e.id, { gen: e.occupantGeneration ?? null, hull: e.hull });
      const dmg = Math.max(0, (Number(last) || 0) - (Number(e.hull) || 0));
      if (dmg <= 0) continue;
      const pieces = Array.isArray(e.data.pieces) ? e.data.pieces : [];
      // Damage strips the outermost attached pieces — one per pieceHull of real damage,
      // always at least one per hit. You keep what falls off.
      const strip = Math.max(PITBORN_YARDMASTER.stripPerHit || 1, Math.floor(dmg / PITBORN_YARDMASTER.pieceHull));
      let stripped = 0;
      for (const piece of pieces) {
        if (stripped >= strip) break;
        if (!isObj(piece) || !piece.attached) continue;
        piece.attached = false;
        stripped += 1;
        const a = state.rng() * Math.PI * 2;
        const r = PITBORN_YARDMASTER.pieceScatterR * (0.3 + state.rng() * 0.7);
        this.helpers.spawnEntity({
          type: 'debris', team: 0,
          pos: { x: e.pos.x + Math.cos(a) * r, z: e.pos.z + Math.sin(a) * r },
          vel: { x: Math.cos(a) * 14, z: Math.sin(a) * 14 },
          radius: 12, mass: 20, hull: 30, hullMax: 30, collides: true,
          data: {
            yardmasterPiece: true, modelId: piece.modelId, pieceIdx: piece.idx,
            name: piece.label, scannable: true,
            scanLabel: `YARDMASTER PIECE · ${piece.label} · salvageable`,
          },
        });
      }
      if (stripped > 0) {
        const left = pieces.filter((pc) => isObj(pc) && pc.attached).length;
        this.bus.emit('pitborn:yardmasterStripped', {
          entityId: e.id, stripped, piecesLeft: left, tick: state.tick,
        });
        if (left <= 0) {
          this.helpers.removeEntity(e.id, { reason: 'yardmaster_dismantled' });
          this.bus.emit('pitborn:yardmasterDown', { entityId: e.id, tick: state.tick });
          this.bus.emit('comms:log', { text: "Yardmaster's stripped! Yard owes you a drink.", speaker: PITBORN_BARKS.announcer });
        }
      }
    }
    // Dead and dismantled colossi leave no ledger behind — the map stays bounded.
    for (const id of this._yardHull.keys()) if (!live.has(id)) this._yardHull.delete(id);
  },

  // ══ THE BOOK — claim stakes, quotas, pit-debt, shares, market, suspicion ══

  // ── Claim stakes ─────────────────────────────────────────────────────────────
  _claimById(p, id) {
    if (id == null) return null;
    for (const c of p.claims) if (c && c.id === id) return c;
    return null;
  },

  _liveClaims(p) { return p.claims.filter((c) => c && CLAIM_LIVE.has(c.state)); },

  _playerClaims(p) {
    return p.claims.filter((c) => c && CLAIM_LIVE.has(c.state) && c.ownerId === PLAYER_OWNER);
  },

  /** The live asteroid nearest a spot while one sits inside the ring — the
   *  same-ground rock a filing re-binds to when restore re-issues ids. */
  _anchorAt(state, pos, ringR) {
    let best = null, bestD2 = Infinity;
    const r2 = ringR * ringR;
    for (const e of state.entityList) {
      if (!e || e.alive === false || e.type !== 'asteroid' || !e.pos) continue;
      const d2 = dist2(e.pos, pos);
      if (d2 <= r2 && d2 < bestD2) { best = e; bestD2 = d2; }
    }
    return best;
  },

  /** The claim an asteroid belongs to — anchored claims win, then ring containment. */
  _claimForAsteroid(state, ent) {
    // A corpse is still the drilled rock: removeEntity only flags alive=false and
    // the body stays mapped until the sweep, so its position names the ring
    // honestly. Only an id the map no longer holds resolves nothing.
    if (!ent) return null;
    const p = ensurePitbornState(state);
    const sectorNow = sectorOf(state);
    let ring = null;
    for (const c of p.claims) {
      if (!c || !CLAIM_LIVE.has(c.state) || !inSector(c, sectorNow)) continue;
      if (c.anchorId != null && c.anchorId === ent.id
          && (c.anchorGen == null || ent.occupantGeneration === c.anchorGen)) return c;
      if (!ring) {
        const rr = c.ringR + (Number(ent.radius) || 0);
        if (dist2(ent.pos, c.pos) <= rr * rr) ring = c;
      }
    }
    return ring;
  },

  /** Proven reserve inside a ring: the sum of oreHP the rocks still carry. */
  _reserveAt(state, x, z, ringR) {
    let reserve = 0;
    const pos = { x: num(x), z: num(z) };
    for (const e of state.entityList) {
      if (!e || e.alive === false || e.type !== 'asteroid') continue;
      const rr = ringR + (Number(e.radius) || 0);
      if (dist2(e.pos, pos) > rr * rr) continue;
      const d = e.data || {};
      reserve += Math.max(0, num(d.oreHP, num(e.radius) * 3));
    }
    return reserve;
  },

  /** Spawn the payload stake that marks a claim — burn it and the filing dies. */
  _spawnStake(state, claim) {
    // A filing closed mid-flight (a charge listener lapsed it, a hostile row
    // slipped past the gate) never gets a marker to orphan on the field.
    if (!claim || !CLAIM_LIVE.has(claim.state)) return null;
    const stake = this.helpers.spawnEntity({
      type: 'payload', team: 1, factionId: FACTION_ID,
      pos: { x: claim.pos.x, z: claim.pos.z }, vel: { x: 0, z: 0 }, rot: 0,
      radius: PITBORN_CLAIM_STAKES.stakeRadius, mass: 14,
      hull: PITBORN_CLAIM_STAKES.stakeHull, hullMax: PITBORN_CLAIM_STAKES.stakeHull,
      collides: true,
      data: {
        pitbornStake: true, pitbornClaimId: claim.id,
        ownerId: claim.ownerId === PLAYER_OWNER ? state.playerId : claim.ownerId,
        name: `Claim stake — ${claim.name}`, scannable: true,
        scanLabel: `FILED CLAIM · ${claim.name.toUpperCase()} · ${
          claim.ownerId === PLAYER_OWNER ? 'your ring' : 'yard-held — drilling jumps it'}`,
        masslineTetherable: true,
      },
    });
    claim.markerId = stake.id;
    claim.markerGen = stake.occupantGeneration ?? null;
    return stake;
  },

  /** The filing gate: a refusal reason, or null when the ring is clear. The
   *  blacklist binds the pilot only — the yard keeps filing its own claims. */
  _filingBlock(state, x, z, ownerId) {
    const p = ensurePitbornState(state);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return 'bad_position';
    if (ownerId === PLAYER_OWNER && this._isBlacklisted(state)) return 'blacklist';
    if (ownerId === PLAYER_OWNER && this._playerClaims(p).length >= PITBORN_CLAIM_STAKES.maxPlayerClaims) {
      return 'max_claims';
    }
    if (this._liveClaims(p).length >= PITBORN_CLAIM_STAKES.maxClaims) return 'claims_full';
    // Rings do not overlap: a new stake must clear every filed ring in THIS sector.
    const sectorNow = sectorOf(state);
    for (const c of this._liveClaims(p)) {
      if (!inSector(c, sectorNow)) continue;
      const rr = c.ringR + PITBORN_CLAIM_STAKES.ringR;
      const dx = x - c.pos.x, dz = z - c.pos.z;
      if (dx * dx + dz * dz < rr * rr) return 'already_filed';
    }
    return null;
  },

  /** File a claim ring — kind 'deed' (bought, permanent) or 'lease' (expires).
   *  The stake is a real body; the ring is the law. Returns the claim or null. */
  _fileClaim(state, { x, z, kind = 'deed', ownerId = PLAYER_OWNER, financed = false,
    anchorId = null, anchorGen = null, reserve = null, charge = true, fromListing = null,
    sectorId = null }) {
    const p = ensurePitbornState(state);
    // Garbage coordinates are a refusal, not a deed at the origin — num() would
    // otherwise mint a filed ring at (0,0) for a caller that passed nothing.
    const px = num(x), pz = num(z);
    const block = (Number.isFinite(Number(x)) && Number.isFinite(Number(z)))
      ? this._filingBlock(state, px, pz, ownerId) : 'bad_position';
    if (block) {
      // The yard's own posts fail quiet — refused events and toasts are for the pilot.
      if (ownerId !== PLAYER_OWNER) return null;
      return this._refuse(state, block, block === 'blacklist' ? PITBORN_PIT_BARKS.blacklisted
        : block === 'max_claims' ? 'The yard will not stake one pilot twice that.'
        : block === 'claims_full' ? 'The belt is spoken for — nothing left to file.'
        : block === 'already_filed' ? 'That ground is filed. Stakes do not overlap.'
        : 'Nowhere to stake.');
    }
    const cost = kind === 'lease' ? PITBORN_CLAIM_STAKES.leaseCostCr
      : financed ? 0 : PITBORN_CLAIM_STAKES.deedCostCr;
    if (charge && cost > 0 && this._credits(state) < cost) {
      return this._refuse(state, 'credits', `Need ${cost - Math.floor(this._credits(state))} more cr to file.`);
    }
    const id = `claim:${p.seq++}`;
    const claim = {
      id,
      name: claimNameFor(id),
      pos: { x: px, z: pz }, ringR: PITBORN_CLAIM_STAKES.ringR,
      ownerId, kind, financed,
      filedAt: num(state.simTime), closedAt: 0,
      expiresAt: kind === 'lease' ? num(state.simTime) + PITBORN_CLAIM_STAKES.leaseTermS : 0,
      reserve: reserve != null ? Math.max(0, num(reserve)) : this._reserveAt(state, px, pz, PITBORN_CLAIM_STAKES.ringR),
      extracted: 0, stolen: 0, state: 'open',
      anchorId, anchorGen, markerId: null, markerGen: null,
      saleId: fromListing, sectorId: sectorId != null ? sectorId : sectorOf(state),
    };
    // The filing lands before money moves — a charge listener re-entering here
    // sees the ring taken (already_filed) instead of paying for a second stake.
    p.claims.push(claim);
    if (charge && cost > 0) this._charge(state, cost, `pitborn_claim:${kind}`);
    this._spawnStake(state, claim);
    this.bus.emit('pitborn:claimFiled', {
      claimId: claim.id, name: claim.name, kind, ownerId, financed,
      pos: { ...claim.pos }, ringR: claim.ringR, reserve: claim.reserve,
      anchorId, tick: state.tick,
    });
    if (ownerId === PLAYER_OWNER) {
      this._rep(state, PITBORN_CLAIM_STAKES.repFiled, 'pitborn_claim_filed');
      this._log(state, kind === 'lease' ? PITBORN_PIT_BARKS.leaseFiled
        : financed ? PITBORN_PIT_BARKS.financed : PITBORN_PIT_BARKS.stakeFiled);
    } else {
      this._log(state, `${claim.name}: ${PITBORN_PIT_BARKS.yardFiled}`);
    }
    return claim;
  },

  /** Buy a staked deed at (x,z) — permanent ground until the stake burns. */
  fileClaim(state, { x, z } = {}) {
    return this._fileClaim(state, { x, z, kind: 'deed', ownerId: PLAYER_OWNER, charge: true });
  },

  /** Lease a ring at (x,z) — cheaper, and it lapses on the yard's clock. */
  leaseClaim(state, { x, z } = {}) {
    return this._fileClaim(state, { x, z, kind: 'lease', ownerId: PLAYER_OWNER, charge: true });
  },

  /** Take a claim on tick: no credits now, the deed price goes on the book. */
  fileClaimOnTick(state, { x, z } = {}) {
    const p = ensurePitbornState(state);
    if (p.debt && p.debt.state === 'open') {
      return this._refuse(state, 'debt_open', 'One note at a time — the Tally Crew insists.');
    }
    const claim = this._fileClaim(state, { x, z, kind: 'deed', ownerId: PLAYER_OWNER, financed: true, charge: false });
    if (!claim) return null;
    // The note is the filing's other half: a claimFiled listener that took the
    // book's one seat mid-filing leaves this ring unnoted — lapse it rather
    // than fly a financed deed the Tally Crew cannot see (or overwrite theirs).
    if (p.debt && p.debt.state === 'open') {
      this._lapseClaim(state, claim, 'lapsed');
      return null;
    }
    p.debt = normalizeDebt({
      id: `debt:${p.seq++}`,
      claimId: claim.id,
      principal: PITBORN_CLAIM_STAKES.deedCostCr,
      balance: PITBORN_CLAIM_STAKES.deedCostCr,
      postedAt: num(state.simTime),
      dueAt: num(state.simTime) + PITBORN_DEBT.graceS,
      firstMissedAt: 0, missed: 0, stage: 0, spawned: 0,
      seed: hash32('pitdebt', claim.id) || 1, state: 'open',
    });
    this.bus.emit('pitborn:debtPosted', {
      debtId: p.debt.id, claimId: claim.id, principal: p.debt.principal,
      dueAt: p.debt.dueAt, tick: state.tick,
    });
    return claim;
  },

  /** Close a live claim — expired, burned, foreclosed, sold, or its stake lost. */
  _lapseClaim(state, claim, cause, killerId = null) {
    const p = ensurePitbornState(state);
    if (!claim || !CLAIM_LIVE.has(claim.state)) return;
    claim.state = cause === 'expired' ? 'expired'
      : cause === 'burned' ? 'burned'
      : cause === 'foreclosed' ? 'foreclosed'
      : cause === 'sold' ? 'sold' : 'lapsed';
    claim.closedAt = num(state.simTime);
    const marker = claim.markerId != null ? state.entities.get(claim.markerId) : null;
    if (marker && marker.alive !== false && marker.data
        && marker.data.pitbornClaimId === claim.id
        && (claim.markerGen == null || marker.occupantGeneration === claim.markerGen)) {
      marker.data.pitbornClaimId = null;
      this.helpers.removeEntity(marker.id, { reason: `pitborn_claim_${cause}` });
    }
    claim.markerId = null; claim.markerGen = null;
    // A deed on the board dies with the filing — its open listing delists in
    // the same breath instead of lingering as a stale row until sellAt.
    const delisted = [];
    for (const l of p.market) {
      if (l && l.state === 'open' && l.source === 'player'
          && (l.claimId === claim.id || l.id === claim.saleId)) {
        l.state = 'delisted';
        delisted.push(l);
      }
    }
    this.bus.emit('pitborn:claimLapsed', {
      claimId: claim.id, name: claim.name, cause, ownerId: claim.ownerId,
      killerId: killerId ?? null, tick: state.tick,
    });
    for (const l of delisted) {
      this.bus.emit('pitborn:marketDelisted', {
        listingId: l.id, claimId: claim.id, tick: state.tick,
      });
    }
    if (cause === 'expired' && claim.ownerId === PLAYER_OWNER) {
      this._log(state, PITBORN_PIT_BARKS.claimExpired);
    }
    this._gcClosed(p.claims, PITBORN_CLAIM_STAKES.logKeep);
  },

  /** A live body still wearing the claim's tag — a restored stake under a fresh
   *  occupant generation, possibly re-issued a different id. */
  _findTaggedStake(state, claimId) {
    for (const e of state.entityList) {
      if (!e || e.alive === false || !e.data) continue;
      if (e.data.pitbornStake === true && e.data.pitbornClaimId === claimId) return e;
    }
    return null;
  },

  /** Claim bookkeeping per tick: leases lapse on the yard clock anywhere; the
   *  entity bindings only answer in their own sector. Save restore and sector
   *  regen re-stamp occupant generations and re-issue ids — a same-tag body or a
   *  same-spot rock is re-bound, and a stake that vanished without a kill is
   *  re-filed. Only a burn buries a filing, and burns route through _onKilledBook. */
  _tickClaims(state) {
    const p = ensurePitbornState(state);
    const sectorNow = sectorOf(state);
    // Snapshot the live rows — lapsing runs the ledger GC, which splices the array.
    for (const c of this._liveClaims(p)) {
      if (c.kind === 'lease' && c.expiresAt > 0 && state.simTime >= c.expiresAt) {
        this._lapseClaim(state, c, 'expired');
        continue;
      }
      // The ledger travels; the bodies don't. Off-sector filings sleep.
      if (!inSector(c, sectorNow)) continue;
      if (c.anchorId != null) {
        const anchor = state.entities.get(c.anchorId);
        let sameAnchor = anchor && anchor.alive !== false
          && (c.anchorGen == null || anchor.occupantGeneration === c.anchorGen);
        if (!sameAnchor && anchor && anchor.alive !== false && anchor.type === 'asteroid'
            && dist2(anchor.pos, c.pos) <= c.ringR * c.ringR) {
          // The same rock back under a fresh generation — re-bind, never lapse.
          c.anchorGen = anchor.occupantGeneration ?? null;
          sameAnchor = true;
        }
        if (!sameAnchor) {
          // A restore can re-issue the id too — the filing re-binds to a
          // same-spot rock rather than dying over bookkeeping.
          const rock = this._anchorAt(state, c.pos, c.ringR);
          if (rock) {
            c.anchorId = rock.id;
            c.anchorGen = rock.occupantGeneration ?? null;
            sameAnchor = true;
          }
        }
        if (!sameAnchor) { this._lapseClaim(state, c, 'anchor_lost'); continue; }
        // The filed ring rides its rock — the chart position stays honest.
        const bound = state.entities.get(c.anchorId);
        c.pos.x = bound.pos.x; c.pos.z = bound.pos.z;
      }
      const marker = c.markerId != null ? state.entities.get(c.markerId) : null;
      const sameStake = marker && marker.alive !== false
        && marker.data && marker.data.pitbornClaimId === c.id
        && (c.markerGen == null || marker.occupantGeneration === c.markerGen);
      if (sameStake) continue;
      const tagged = this._findTaggedStake(state, c.id);
      if (tagged) {
        c.markerId = tagged.id;
        c.markerGen = tagged.occupantGeneration ?? null;
      } else {
        this._spawnStake(state, c);
      }
    }
  },

  /** The yard files its own claims on real rocks, on a jittered clock. */
  _tickClaimPosts(state) {
    const p = ensurePitbornState(state);
    if (state.mode !== 'flight') return;
    if (!Number.isFinite(p.nextClaimPostAt) || p.nextClaimPostAt <= 0) {
      p.nextClaimPostAt = num(state.simTime) + PITBORN_CLAIM_STAKES.firstPostS;
      return;
    }
    if (state.simTime < p.nextClaimPostAt) return;
    p.nextClaimPostAt = num(state.simTime) + PITBORN_CLAIM_STAKES.npcPostPeriodS
      + frac('pitclaim-gap', p.seq, state.tick) * PITBORN_CLAIM_STAKES.npcPostJitterS;
    const npcCount = this._liveClaims(p).filter((c) => c.ownerId !== PLAYER_OWNER).length;
    if (npcCount >= PITBORN_CLAIM_STAKES.npcMax || this._liveClaims(p).length >= PITBORN_CLAIM_STAKES.maxClaims) return;
    const anchor = this._pickAnchorAsteroid(state, `post:${p.seq}`);
    if (!anchor) return; // no unstaked rock in the belt — try again next beat
    const d = anchor.data || {};
    this._fileClaim(state, {
      x: anchor.pos.x, z: anchor.pos.z, kind: 'deed', ownerId: NPC_OWNER,
      anchorId: anchor.id, anchorGen: anchor.occupantGeneration ?? null,
      reserve: Math.max(0, num(d.oreHP, num(anchor.radius) * 3)), charge: false,
    });
  },

  /** Pick a deterministic asteroid to file on: the highest hash-ranked live rock
   *  no live claim or open listing covers. Same belt, same pick. */
  _pickAnchorAsteroid(state, salt) {
    const p = ensurePitbornState(state);
    const sectorNow = sectorOf(state);
    let best = null, bestKey = -1;
    for (const e of state.entityList) {
      if (!e || e.alive === false || e.type !== 'asteroid') continue;
      // The rock must clear every filed ring in this sector — the same gate
      // _fileClaim enforces, so a pick here can never be refused there.
      let covered = false;
      for (const c of p.claims) {
        if (!c || !CLAIM_LIVE.has(c.state) || !inSector(c, sectorNow)) continue;
        const rr = c.ringR + PITBORN_CLAIM_STAKES.ringR;
        if (dist2(e.pos, c.pos) < rr * rr) { covered = true; break; }
      }
      if (covered) continue;
      let listed = false;
      for (const l of p.market) {
        if (!l || l.state !== 'open' || l.anchorId == null) continue;
        if (l.anchorId === e.id && (l.anchorGen == null || e.occupantGeneration === l.anchorGen)) {
          listed = true; break;
        }
      }
      if (listed) continue;
      const key = hash32('pitborn-anchor', e.id, salt) >>> 0;
      if (key > bestKey) { bestKey = key; best = e; }
    }
    return best;
  },

  // ── Extraction: drill receipts and the quota feed ────────────────────────────
  /** A drill session closed — the rock's id names whose ring it was. Own ring:
   *  full credit plus pit-gate royalty. Wild rock: half credit. Filed yard
   *  ground: claim-jumping — the sabotage ledger files it, not the order. */
  _onDrillEnd(result) {
    const state = this.state;
    if (!state || !result) return;
    const units = Math.max(0, Math.floor(num(result.yieldUnits)));
    if (units <= 0) return;
    const rock = result.asteroidId != null ? state.entities.get(result.asteroidId) : null;
    // A drill receipt names a rock — anything else (a stake, a hull, a swept id)
    // reads as wild ground, never as somebody's filed ring.
    const ent = rock && rock.type === 'asteroid' ? rock : null;
    const claim = ent ? this._claimForAsteroid(state, ent) : null;
    if (claim && claim.ownerId !== PLAYER_OWNER) {
      claim.stolen = Math.max(0, num(claim.stolen)) + units;
      claim.reserve = Math.max(0, num(claim.reserve) - units); // jumped ore still left the ring
      this._fileSuspicion(state, 'drill_jump', PITBORN_SUSPICION.drillJump,
        `${claim.name} — ${units}u jumped`);
      this.bus.emit('pitborn:claimJumped', {
        claimId: claim.id, name: claim.name, units,
        asteroidId: ent ? ent.id : null, tick: state.tick,
      });
      this._log(state, PITBORN_PIT_BARKS.claimJumped);
      return;
    }
    const credit = claim ? units : units * PITBORN_CLAIM_STAKES.wildCredit;
    if (claim) {
      claim.extracted = Math.max(0, num(claim.extracted)) + units;
      claim.reserve = Math.max(0, num(claim.reserve) - units);
      const royalty = Math.round(units * PITBORN_CLAIM_STAKES.royaltyPerUnitCr * this._tierMult(ensurePitbornState(state)));
      if (royalty > 0) this._grant(state, royalty, `pitborn_royalty:${claim.id}`);
      this.bus.emit('pitborn:claimExtracted', {
        claimId: claim.id, name: claim.name, units, extracted: claim.extracted,
        reserve: claim.reserve, royaltyCr: royalty, tick: state.tick,
      });
    }
    this._creditExtraction(state, credit, claim, 'drill');
  },

  /** Extraction credit: the quota hears about it, the lifetime tally grows, and
   *  every deedPerUnits of owned-ring work is a deed on the board. Honest work. */
  _creditExtraction(state, units, claim, source) {
    const p = ensurePitbornState(state);
    const u = Math.max(0, num(units));
    if (u <= 0) return;
    p.extractedTotal = num(p.extractedTotal) + u;
    if (p.quota && p.quota.state === 'open') {
      p.quota.gotUnits = num(p.quota.gotUnits) + u;
      this.bus.emit('pitborn:quotaProgress', {
        quotaId: p.quota.id, gotUnits: p.quota.gotUnits, wantUnits: p.quota.wantUnits,
        source, claimId: claim ? claim.id : null, tick: state.tick,
      });
    }
    // Milestone deeds: extraction on ground you filed reads as real dredging.
    const mark = Math.floor(p.extractedTotal / PITBORN_CLAIM_STAKES.deedPerUnits);
    if (mark > num(p.extractionDeedMark)) {
      p.extractionDeedMark = mark;
      this._deed(state, 'extraction', claim ? claim.id : null);
    }
  },

  // ── The pit's order: extraction quotas ───────────────────────────────────────
  _tickQuota(state) {
    const p = ensurePitbornState(state);
    const now = num(state.simTime);
    if (!Number.isFinite(p.nextQuotaAt) || p.nextQuotaAt <= 0) {
      p.nextQuotaAt = now + PITBORN_QUOTA.firstPostS;
    }
    const q = p.quota;
    if (q && q.state === 'open' && now >= q.dueAt) this._settleQuota(state);
    if ((!p.quota || p.quota.state !== 'open') && now >= p.nextQuotaAt) {
      if (this._isBlacklisted(state)) {
        p.nextQuotaAt = now + PITBORN_QUOTA.periodS; // the pit is closed to you
      } else if (state.mode === 'flight') {
        this._postQuota(state);
      } else {
        p.nextQuotaAt = now + 30; // orders wait for a flying pilot
      }
    }
  },

  _postQuota(state) {
    const p = ensurePitbornState(state);
    const now = num(state.simTime);
    const tier = pitbornTierFor(p.deeds).tier;
    const wantUnits = Math.max(1, Math.round(
      PITBORN_QUOTA.baseUnits + PITBORN_QUOTA.unitsPerTier * tier
        + frac('quota', p.seq, tier) * PITBORN_QUOTA.unitsPerTier * 0.5,
    ));
    p.quota = normalizeQuota({
      id: `quota:${p.seq++}`,
      wantUnits, gotUnits: 0,
      postedAt: now, dueAt: now + PITBORN_QUOTA.windowS, state: 'open',
    });
    p.nextQuotaAt = now + PITBORN_QUOTA.periodS;
    this.bus.emit('pitborn:quotaPosted', {
      quotaId: p.quota.id, wantUnits, dueAt: p.quota.dueAt, tick: state.tick,
    });
    this._log(state, PITBORN_PIT_BARKS.quotaPosted);
  },

  /** The bell: pay a met order (plus glut bonus) or file a strike. Then dividend. */
  _settleQuota(state) {
    const p = ensurePitbornState(state);
    const q = p.quota;
    if (!q || q.state !== 'open') return;
    const now = num(state.simTime);
    const perf = q.wantUnits > 0 ? q.gotUnits / q.wantUnits : 0;
    const met = q.gotUnits >= q.wantUnits;
    q.state = met ? 'met' : 'missed';
    q.settledAt = now;
    // Pit heat reads the bell honestly — performance feeds the share price.
    p.heat = Math.max(PITBORN_SHARES.heatMin, Math.min(PITBORN_SHARES.heatMax,
      p.heat * PITBORN_SHARES.heatDecay + perf * PITBORN_SHARES.heatGain));
    let pay = 0;
    if (met) {
      const over = Math.max(0, q.gotUnits - q.wantUnits);
      pay = Math.round((PITBORN_QUOTA.basePayCr + q.gotUnits * PITBORN_QUOTA.payPerUnitCr
        + over * PITBORN_QUOTA.overBonusPerUnitCr) * this._tierMult(p));
      this._grant(state, pay, `pitborn_quota:${q.id}`);
      this._rep(state, PITBORN_QUOTA.repMet, 'pitborn_quota_met');
      this._honestWork(state);
      this._deed(state, 'quota', q.id);
      this._log(state, over > 0 ? PITBORN_PIT_BARKS.quotaGlut : PITBORN_PIT_BARKS.quotaMet);
    } else {
      if (now - num(p.lastStrikeAt) > PITBORN_QUOTA.strikeDecayS) p.strikes = 0;
      p.strikes = (p.strikes | 0) + 1;
      p.lastStrikeAt = now;
      this._rep(state, PITBORN_QUOTA.repMissed, 'pitborn_quota_missed');
      this._fileSuspicion(state, 'quota_strike', PITBORN_SUSPICION.quotaStrike,
        `order ${q.id} — ${q.gotUnits}/${q.wantUnits}u`);
      this._log(state, PITBORN_PIT_BARKS.quotaMissed);
      if (p.strikes >= PITBORN_QUOTA.maxStrikes) this._blacklist(state, 'quota_strikes');
    }
    this.bus.emit('pitborn:quotaSettled', {
      quotaId: q.id, met, gotUnits: q.gotUnits, wantUnits: q.wantUnits,
      payCr: pay, strikes: p.strikes, heat: p.heat, tick: state.tick,
    });
    p.quotaLog.push({ id: q.id, met, gotUnits: q.gotUnits, wantUnits: q.wantUnits, payCr: pay, at: now });
    while (p.quotaLog.length > PITBORN_QUOTA.logKeep) p.quotaLog.shift();
    this._payDividend(state, perf);
    p.quota = null;
  },

  // ── Pit-debt and the Tally Crew ───────────────────────────────────────────────
  /** Pay the note down (default: the full due). Early settlement — before the
   *  first missed period — pays a discounted balance. Returns credits levied. */
  payDebt(state, amount = null) {
    const p = ensurePitbornState(state);
    const debt = p.debt;
    if (!debt || debt.state !== 'open') return 0;
    const early = debt.stage === 0 && num(state.simTime) < num(debt.dueAt);
    const due = early ? Math.ceil(debt.balance * PITBORN_DEBT.earlyDiscount) : debt.balance;
    const want = amount == null ? due : Math.max(0, Math.round(num(amount)));
    const pay = Math.min(want, due, Math.max(0, Math.floor(this._credits(state))));
    if (pay <= 0) return 0;
    // Latch before emit: the balance drops before the charge leaves the wire —
    // a payment re-entered from a charge listener settles only what remains.
    debt.balance = Math.max(0, debt.balance - pay);
    this._charge(state, pay, `pitborn_debt:${debt.id}`);
    this.bus.emit('pitborn:debtPaid', {
      debtId: debt.id, amount: pay, balance: debt.balance, early, tick: state.tick,
    });
    if (debt.balance <= 0 || (early && pay >= due)) {
      debt.balance = 0; // an early-in-full settlement clears the discount remainder too
      this._settleDebt(state, debt, early ? 'early' : 'paid');
    }
    return pay;
  },

  /** The debt clock: warn, then vig on every missed beat, then clamp, then write off. */
  _tickDebt(state, dt) {
    const p = ensurePitbornState(state);
    const debt = p.debt;
    if (!debt || debt.state !== 'open') { this._tickCollectors(state, dt); return; }
    const now = num(state.simTime);
    if (debt.stage === 0 && now >= num(debt.dueAt) - PITBORN_DEBT.warnBeforeS
        && this._paidOnce(p, `warn:${debt.id}`)) {
      this._log(state, PITBORN_PIT_BARKS.debtDueSoon, 'Tally Crew');
      this.bus.emit('pitborn:debtDueSoon', { debtId: debt.id, dueAt: debt.dueAt, tick: state.tick });
    }
    // Each crossed period is a missed beat: the note grows vig and the Crew flies.
    // Capped per tick — a long gap still catches up, just over several ticks.
    let catchup = 0;
    while (debt.state === 'open' && now >= num(debt.dueAt) && debt.stage <= 1 && catchup < 8) {
      catchup += 1;
      debt.missed = intOr(debt.missed) + 1;
      debt.balance = Math.round(debt.balance + debt.principal * PITBORN_DEBT.vigPerPeriod);
      if (debt.stage === 0) {
        debt.stage = 1;
        debt.firstMissedAt = now;
        this._log(state, PITBORN_PIT_BARKS.collectorsOut, 'Tally Crew');
      }
      if (state.mode === 'flight') this._dispatchCollectors(state, debt);
      this.bus.emit('pitborn:debtEscalated', {
        debtId: debt.id, stage: debt.stage, missed: debt.missed,
        balance: debt.balance, tick: state.tick,
      });
      debt.dueAt = num(debt.dueAt) + PITBORN_DEBT.periodS;
    }
    if (debt.state === 'open' && debt.stage === 1 && Number.isFinite(debt.firstMissedAt)
        && now >= debt.firstMissedAt + PITBORN_DEBT.clampAfterS) {
      debt.stage = 2;
      const claim = this._claimById(p, debt.claimId);
      if (claim && CLAIM_LIVE.has(claim.state)) this._lapseClaim(state, claim, 'foreclosed');
      this._rep(state, PITBORN_DEBT.repForeclosed, 'pitborn_claim_foreclosed');
      this.bus.emit('pitborn:claimForeclosed', {
        debtId: debt.id, claimId: debt.claimId, balance: debt.balance, tick: state.tick,
      });
      this._log(state, PITBORN_PIT_BARKS.foreclosed, 'Tally Crew');
    }
    if (debt.state === 'open' && debt.stage === 2 && Number.isFinite(debt.firstMissedAt)
        && now >= debt.firstMissedAt + PITBORN_DEBT.writeoffAfterS) {
      this._writeoffDebt(state, debt);
    }
    // A note that went overdue while the pilot was docked (or between player
    // entities) fields the Crew the moment the ship flies again — not one vig
    // beat later. Idempotent: live rows and the spawned cap bound the dispatch.
    if (debt.state === 'open' && debt.stage >= 1 && state.mode === 'flight') {
      this._dispatchCollectors(state, debt);
    }
    this._tickCollectors(state, dt);
  },

  /** Field Tally Crew hulls up to the note's due pressure — bounded and tagged. */
  _dispatchCollectors(state, debt) {
    const p = ensurePitbornState(state);
    const player = state.entities.get(state.playerId);
    if (!player || player.alive === false) return;
    const live = p.collectors.filter((r) => {
      const e = state.entities.get(r.entityId);
      return r.debtId === debt.id && e && e.alive !== false
        && (r.gen == null || e.occupantGeneration === r.gen)
        && e.data?.pitbornDebtId === debt.id;
    }).length;
    const want = Math.min(debt.missed, PITBORN_DEBT.collectorCap);
    let spawnedThis = 0;
    for (let i = live; i < want && debt.spawned < PITBORN_DEBT.collectorCap; i++) {
      const ang = drawSeeded(debt, 'seed', hash32('pitdebt', debt.id) || 1) * Math.PI * 2;
      const ring = PITBORN_DEBT.spawnR + drawSeeded(debt, 'seed', 1) * 300;
      const e = this.helpers.spawnEntity({
        type: 'ship', team: 1, factionId: FACTION_ID,
        pos: { x: player.pos.x + Math.cos(ang) * ring, z: player.pos.z + Math.sin(ang) * ring },
        vel: { x: 0, z: 0 }, rot: ang + Math.PI / 2,
        radius: PITBORN_DEBT.collectorRadius, mass: PITBORN_DEBT.collectorMass,
        hull: PITBORN_DEBT.collectorHull, hullMax: PITBORN_DEBT.collectorHull, collides: true,
        data: {
          pitbornCollector: true, pitbornDebtId: debt.id,
          name: 'Tally Crew', shipRole: 'debt_collector',
          ai: { archetype: 'collector', passive: true, fsm: 'patrol' },
          scannable: true,
          scanLabel: `TALLY CREW · collecting ${debt.balance} cr — pay or run`,
        },
      });
      debt.spawned = intOr(debt.spawned) + 1;
      spawnedThis += 1;
      p.collectors.push({ entityId: e.id, gen: e.occupantGeneration ?? null, debtId: debt.id });
    }
    if (spawnedThis > 0) {
      this.bus.emit('pitborn:collectorsOut', {
        debtId: debt.id, count: live + spawnedThis, balance: debt.balance, tick: state.tick,
      });
    }
  },

  /** Collector hulls close on the player and levy on contact — repo men, not killers. */
  _tickCollectors(state, dt) {
    const p = ensurePitbornState(state);
    // Reconcile the roster first: dead, despawned or recycled ids drop out. A hull
    // that vanished without a kill (despawn, sector wipe, save restore) hands its
    // field slot back — kills splice their row in _onKilledBook before this sweep
    // ever sees them, so the Crew's lifetime cap stays spent by the dead.
    for (let i = p.collectors.length - 1; i >= 0; i--) {
      const row = p.collectors[i];
      const e = state.entities.get(row.entityId);
      const same = e && e.alive !== false
        && (row.gen == null || e.occupantGeneration === row.gen)
        && e.data?.pitbornDebtId === row.debtId;
      if (!same) {
        p.collectors.splice(i, 1);
        if (p.debt && p.debt.id === row.debtId) {
          p.debt.spawned = Math.max(0, intOr(p.debt.spawned) - 1);
        }
      }
    }
    const player = state.entities.get(state.playerId);
    if (!player || player.alive === false) return;
    const collect2 = (PITBORN_DEBT.collectR + (Number(player.radius) || 12)) ** 2;
    // Snapshot: a levy can settle the note mid-loop and _despawnCollectors splices
    // this same array — never steer against a mutating roster.
    for (const row of p.collectors.slice()) {
      const e = state.entities.get(row.entityId);
      if (!e) continue;
      const debt = p.debt && p.debt.id === row.debtId && p.debt.state === 'open' ? p.debt : null;
      if (!debt || debt.stage < 1) {
        // Orphaned by a closed note — the Crew slips back to the yard and despawns.
        const ed = e.data || (e.data = {});
        ed.orphanedAt = num(ed.orphanedAt, state.simTime);
        this._steerCollector(state, e, 0.98);
        if (state.simTime - ed.orphanedAt > 30) {
          e.data.pitbornDebtId = null;
          this.helpers.removeEntity(e.id, { reason: 'pitborn_collector_orphaned' });
        }
        continue;
      }
      const dx = player.pos.x - e.pos.x, dz = player.pos.z - e.pos.z;
      const dist = Math.hypot(dx, dz) || 1;
      if (dist > PITBORN_DEBT.collectR) {
        const s = PITBORN_DEBT.speed * Math.min(1, dist / 300);
        this._steerCollector(state, e, 0, (dx / dist) * s, (dz / dist) * s);
      } else {
        this._steerCollector(state, e, 0.9);
      }
      const ed = e.data || (e.data = {});
      if (dist2(e.pos, player.pos) <= collect2 && state.simTime >= num(ed.nextLevyAt)) {
        ed.nextLevyAt = num(state.simTime) + PITBORN_DEBT.collectBeatS;
        const levyCap = Math.ceil(debt.principal * PITBORN_DEBT.levyFraction);
        const levy = Math.min(debt.balance, levyCap, Math.max(0, Math.floor(this._credits(state))));
        if (levy > 0) {
          // Latch before emit: the balance drops before the charge leaves the
          // wire — a payment re-entered from a charge listener settles only
          // what remains instead of paying the pre-levy figure a second time.
          debt.balance = Math.max(0, debt.balance - levy);
          this._charge(state, levy, `pitborn_levy:${debt.id}`);
          this.bus.emit('pitborn:levyCollected', {
            debtId: debt.id, collectorId: e.id, amount: levy,
            balance: debt.balance, tick: state.tick,
          });
          this._log(state, PITBORN_PIT_BARKS.levy, 'Tally Crew');
          if (debt.balance <= 0) this._settleDebt(state, debt, 'collected');
        } else if (state.simTime >= num(ed.nextTauntAt)) {
          ed.nextTauntAt = num(state.simTime) + PITBORN_DEBT.tauntBeatS;
          this._log(state, PITBORN_PIT_BARKS.taunt, 'Tally Crew');
        }
      }
    }
  },

  /** Collector motion crosses the physics membrane as Δv×mass — the same seam
   *  every chaser uses (tallyho._drive). e.vel writes are dead on a Rapier body.
   *  `damp` scales the current velocity; explicit wantX/wantZ set a desired velocity. */
  _steerCollector(state, e, damp = 0, wantX = null, wantZ = null) {
    if (!e || e.alive === false) return;
    const vx = num(e.vel && e.vel.x), vz = num(e.vel && e.vel.z);
    const tx = wantX == null ? vx * damp : wantX;
    const tz = wantZ == null ? vz * damp : wantZ;
    const mass = Math.max(1, num(e.mass, PITBORN_DEBT.collectorMass));
    const jx = (tx - vx) * mass, jz = (tz - vz) * mass;
    if (jx !== 0 || jz !== 0) {
      queuePhysicsImpulse(e, { x: jx, z: jz }, { tick: num(state.tick), provenance: 'pitborn_collector' });
    }
  },

  /** The note is settled: collectors recalled, the deed lands, suspicion eases. */
  _settleDebt(state, debt, how) {
    const p = ensurePitbornState(state);
    if (!debt || debt.state !== 'open') return;
    debt.state = 'paid';
    debt.how = how;
    debt.settledAt = num(state.simTime);
    this._despawnCollectors(state, debt.id, 'pitborn_debt_settled');
    this._rep(state, PITBORN_DEBT.repPaid, 'pitborn_debt_paid');
    this._honestWork(state);
    this._deed(state, 'debt', debt.id);
    this.bus.emit('pitborn:debtSettled', {
      debtId: debt.id, how, claimId: debt.claimId, tick: state.tick,
    });
    this._log(state, PITBORN_PIT_BARKS.paid, 'Tally Crew');
    p.debtLog.push({
      id: debt.id, claimId: debt.claimId, principal: debt.principal,
      missed: debt.missed, outcome: how, at: num(state.simTime),
    });
    while (p.debtLog.length > PITBORN_DEBT.logKeep) p.debtLog.shift();
    if (p.debt === debt) p.debt = null;
  },

  /** Written off: the yard closes the book and the blacklist opens. */
  _writeoffDebt(state, debt) {
    const p = ensurePitbornState(state);
    if (!debt || debt.state !== 'open') return;
    debt.state = 'written';
    debt.settledAt = num(state.simTime);
    this._despawnCollectors(state, debt.id, 'pitborn_debt_written_off');
    this._rep(state, PITBORN_DEBT.repWrittenOff, 'pitborn_debt_written_off');
    this.bus.emit('pitborn:debtWrittenOff', {
      debtId: debt.id, claimId: debt.claimId, balance: debt.balance, tick: state.tick,
    });
    this._log(state, PITBORN_PIT_BARKS.writtenOff, 'Tally Crew');
    p.debtLog.push({
      id: debt.id, claimId: debt.claimId, principal: debt.principal,
      missed: debt.missed, outcome: 'written', at: num(state.simTime),
    });
    while (p.debtLog.length > PITBORN_DEBT.logKeep) p.debtLog.shift();
    this._blacklist(state, 'debt_written_off');
    if (p.debt === debt) p.debt = null;
  },

  /** Recall the Crew — every live hull tagged to this note despawned. */
  _despawnCollectors(state, debtId, reason) {
    const p = ensurePitbornState(state);
    for (let i = p.collectors.length - 1; i >= 0; i--) {
      const row = p.collectors[i];
      if (row.debtId !== debtId) continue;
      const e = state.entities.get(row.entityId);
      if (e && e.alive !== false && e.data?.pitbornDebtId === debtId
          && (row.gen == null || e.occupantGeneration === row.gen)) {
        e.data.pitbornDebtId = null;
        this.helpers.removeEntity(e.id, { reason });
      }
      p.collectors.splice(i, 1);
    }
  },

  // ── Drill shares: a cut of the pit ─────────────────────────────────────────────
  /** Buy a share of the pit at the marked price. Returns the lot row or null. */
  buyShare(state) {
    const p = ensurePitbornState(state);
    if (this._isBlacklisted(state)) return this._refuse(state, 'blacklist', PITBORN_PIT_BARKS.blacklisted);
    if (p.shares.length >= PITBORN_SHARES.maxShares) {
      return this._refuse(state, 'max_shares', 'The pit has no more paper for you.');
    }
    const price = pitbornSharePrice(state);
    if (this._credits(state) < price) {
      return this._refuse(state, 'credits', `Need ${price - Math.floor(this._credits(state))} more cr for a share.`);
    }
    const share = { id: `share:${p.seq++}`, price, boughtAt: num(state.simTime) };
    // The lot is on the book before money moves — a buy re-entered from the
    // charge wire counts this paper instead of minting a second one on the sly.
    p.shares.push(share);
    this._charge(state, price, 'pitborn_share_buy');
    this.bus.emit('pitborn:shareBought', {
      shareId: share.id, price, shares: p.shares.length, heat: p.heat, tick: state.tick,
    });
    this._log(state, PITBORN_PIT_BARKS.shareBought);
    return share;
  },

  /** Sell the oldest share back at the marked price, minus the yard's cut. */
  sellShare(state) {
    const p = ensurePitbornState(state);
    if (!p.shares.length) return this._refuse(state, 'no_shares', 'You hold no pit paper.');
    const share = p.shares.shift();
    const price = pitbornSharePrice(state);
    const payout = Math.round(price * (1 - PITBORN_SHARES.saleYardCut));
    this._grant(state, payout, `pitborn_share_sell:${share.id}`);
    this.bus.emit('pitborn:shareSold', {
      shareId: share.id, price, payoutCr: payout, shares: p.shares.length,
      heat: p.heat, tick: state.tick,
    });
    this._log(state, PITBORN_PIT_BARKS.shareSold);
    return payout;
  },

  /** The bell pays the paper: dividend per share by performance and standing. */
  _payDividend(state, perf) {
    const p = ensurePitbornState(state);
    if (!p.shares.length) return;
    const per = Math.min(PITBORN_SHARES.dividendCapCr,
      Math.round(PITBORN_SHARES.dividendBaseCr * Math.max(0, perf) * this._tierMult(p)));
    if (per <= 0) return;
    const total = per * p.shares.length;
    this._grant(state, total, `pitborn_dividend:${p.quota ? p.quota.id : p.seq}`);
    this.bus.emit('pitborn:dividend', {
      perShareCr: per, shares: p.shares.length, totalCr: total,
      performance: perf, heat: p.heat, tick: state.tick,
    });
    this._log(state, PITBORN_PIT_BARKS.dividend);
  },

  // ── The claim market ───────────────────────────────────────────────────────────
  _tickMarket(state) {
    const p = ensurePitbornState(state);
    const now = num(state.simTime);
    if (!Number.isFinite(p.nextMarketPostAt) || p.nextMarketPostAt <= 0) {
      p.nextMarketPostAt = now + PITBORN_CLAIM_MARKET.firstPostS;
    }
    if (state.mode === 'flight' && now >= p.nextMarketPostAt) {
      p.nextMarketPostAt = now + PITBORN_CLAIM_MARKET.postPeriodS
        + frac('pitmkt-gap', p.seq, state.tick) * PITBORN_CLAIM_MARKET.postJitterS;
      const yardListings = p.market.filter((l) => l.state === 'open' && l.source === 'yard').length;
      if (p.market.filter((l) => l.state === 'open').length < PITBORN_CLAIM_MARKET.maxListings
          && yardListings < 3) {
        this._postMarketListing(state);
      }
    }
    const sectorNow = sectorOf(state);
    for (const l of p.market) {
      if (!l || l.state !== 'open') continue;
      if (l.source === 'yard') {
        if (now >= l.expiresAt) {
          l.state = 'delisted';
          this.bus.emit('pitborn:marketDelisted', { listingId: l.id, tick: state.tick });
          continue;
        }
        // The rock check only answers in the listing's own sector; restore and
        // regen re-stamp generations — and can re-issue ids — on the same rocks.
        if (l.anchorId != null && inSector(l, sectorNow)) {
          const anchor = state.entities.get(l.anchorId);
          let sameAnchor = anchor && anchor.alive !== false
            && (l.anchorGen == null || anchor.occupantGeneration === l.anchorGen);
          if (!sameAnchor && anchor && anchor.alive !== false && anchor.type === 'asteroid'
              && dist2(anchor.pos, l.pos) <= l.ringR * l.ringR) {
            l.anchorGen = anchor.occupantGeneration ?? null;
            sameAnchor = true;
          }
          if (!sameAnchor) {
            const rock = this._anchorAt(state, l.pos, l.ringR);
            if (rock) {
              l.anchorId = rock.id;
              l.anchorGen = rock.occupantGeneration ?? null;
              sameAnchor = true;
            }
          }
          if (!sameAnchor) {
            l.state = 'delisted';
            this.bus.emit('pitborn:marketDelisted', { listingId: l.id, tick: state.tick });
            continue;
          }
        }
      } else if (l.source === 'player' && now >= l.sellAt) {
        this._sellPlayerListing(state, l);
      }
    }
    this._gcClosed(p.market, PITBORN_CLAIM_MARKET.logKeep);
  },

  /** The yard lists proven ground — a real rock, a real reserve, an ask. */
  _postMarketListing(state) {
    const p = ensurePitbornState(state);
    const now = num(state.simTime);
    const anchor = this._pickAnchorAsteroid(state, `mkt:${p.seq}`);
    if (!anchor) return null;
    const d = anchor.data || {};
    const reserve = Math.max(0, num(d.oreHP, num(anchor.radius) * 3));
    const listing = {
      id: `lst:${p.seq++}`,
      pos: { x: anchor.pos.x, z: anchor.pos.z },
      ringR: PITBORN_CLAIM_STAKES.ringR, reserve,
      askCr: Math.round(PITBORN_CLAIM_MARKET.askBaseCr + reserve * PITBORN_CLAIM_MARKET.askPerReserveCr),
      seller: 'the yard', source: 'yard', claimId: null,
      anchorId: anchor.id, anchorGen: anchor.occupantGeneration ?? null,
      listedAt: now, expiresAt: now + PITBORN_CLAIM_MARKET.ttlS, sellAt: 0,
      sectorId: sectorOf(state), state: 'open',
    };
    p.market.push(listing);
    this.bus.emit('pitborn:marketListed', {
      listingId: listing.id, pos: { ...listing.pos }, ringR: listing.ringR,
      reserve, askCr: listing.askCr, seller: listing.seller, tick: state.tick,
    });
    this._log(state, PITBORN_PIT_BARKS.marketListed);
    return listing;
  },

  /** Buy a listed claim — the yard's proven ring becomes your deed. */
  buyMarketClaim(state, listingId) {
    const p = ensurePitbornState(state);
    if (this._isBlacklisted(state)) return this._refuse(state, 'blacklist', PITBORN_PIT_BARKS.blacklisted);
    const l = p.market.find((x) => x && x.id === listingId && x.state === 'open' && x.source === 'yard');
    if (!l) return this._refuse(state, 'no_listing', 'That listing is off the board.');
    // A listing past its ttl is off the board — the next tick collects it; the
    // buy does not get to race the yard's own expiry. Yard rows always carry a
    // positive ttl, so a forged expiresAt <= 0 reads as already run out, the
    // same way the market tick collects it.
    if (num(state.simTime) >= l.expiresAt) {
      return this._refuse(state, 'expired', 'That listing ran out — the yard pulled it.');
    }
    // The board answers in the listing's own sector — a buy from elsewhere
    // would plant the stake under the wrong sky, and the anchor check below
    // would read a body it cannot see as a dead rock. Refuse, never delist.
    if (!inSector(l, sectorOf(state))) {
      return this._refuse(state, 'wrong_sector', 'That listing answers in its own sector.');
    }
    if (l.anchorId != null) {
      const anchor = state.entities.get(l.anchorId);
      let same = anchor && anchor.alive !== false
        && (l.anchorGen == null || anchor.occupantGeneration === l.anchorGen);
      if (!same && anchor && anchor.alive !== false && anchor.type === 'asteroid'
          && dist2(anchor.pos, l.pos) <= l.ringR * l.ringR) {
        l.anchorGen = anchor.occupantGeneration ?? null;
        same = true;
      }
      if (!same) {
        // Restore re-issues ids as well as generations — re-bind by ground.
        const rock = this._anchorAt(state, l.pos, l.ringR);
        if (rock) {
          l.anchorId = rock.id;
          l.anchorGen = rock.occupantGeneration ?? null;
          same = true;
        }
      }
      if (!same) {
        l.state = 'delisted';
        this.bus.emit('pitborn:marketDelisted', { listingId: l.id, tick: state.tick });
        return this._refuse(state, 'listing_lapsed', 'The rock is gone — the listing with it.');
      }
    }
    if (this._credits(state) < l.askCr) {
      return this._refuse(state, 'credits', `Need ${l.askCr - Math.floor(this._credits(state))} more cr for that claim.`);
    }
    // The filing gate runs BEFORE money moves — a refused filing never burns credits.
    const block = this._filingBlock(state, l.pos.x, l.pos.z, PLAYER_OWNER);
    if (block) return this._refuse(state, block, 'That ring cannot be filed now.');
    // Latch before emit: the listing leaves the board before the charge, so a
    // buyer re-entered from a charge or filing listener cannot sell it twice.
    l.state = 'pending';
    this._charge(state, l.askCr, `pitborn_market:${l.id}`);
    const claim = this._fileClaim(state, {
      x: l.pos.x, z: l.pos.z, kind: 'deed', ownerId: PLAYER_OWNER,
      anchorId: l.anchorId, anchorGen: l.anchorGen, reserve: l.reserve,
      charge: false, fromListing: l.id, sectorId: l.sectorId,
    });
    if (!claim) {
      // The gate passed but the filing still failed — wire the ask straight back
      // and put the listing back on the board.
      l.state = 'open';
      this._grant(state, l.askCr, `pitborn_market_refund:${l.id}`);
      return null;
    }
    l.state = 'sold';
    l.claimId = claim.id;
    this.bus.emit('pitborn:marketBought', {
      listingId: l.id, claimId: claim.id, askCr: l.askCr, tick: state.tick,
    });
    return claim;
  },

  /** List a player deed for sale — it sells on the yard's clock, minus the cut. */
  listClaimForSale(state, claimId) {
    const p = ensurePitbornState(state);
    if (this._isBlacklisted(state)) return this._refuse(state, 'blacklist', PITBORN_PIT_BARKS.blacklisted);
    const claim = this._claimById(p, claimId);
    if (!claim || claim.state !== 'open' || claim.ownerId !== PLAYER_OWNER) {
      return this._refuse(state, 'no_claim', 'Only an open deed of yours sells on the board.');
    }
    if (claim.kind !== 'deed') {
      return this._refuse(state, 'lease_not_sold', 'A lease is rented ground — nothing to sell.');
    }
    if (claim.financed && p.debt && p.debt.state === 'open' && p.debt.claimId === claim.id) {
      return this._refuse(state, 'financed', 'The note on this claim is still open.');
    }
    const now = num(state.simTime);
    const askCr = pitbornClaimSaleValue(state, claim);
    const delay = PITBORN_CLAIM_MARKET.saleDelayMinS
      + frac('pitsale', claim.id, p.seq) * PITBORN_CLAIM_MARKET.saleDelaySpanS;
    claim.state = 'listed';
    claim.saleId = `lst:${p.seq}`;
    const listing = {
      id: claim.saleId, pos: { ...claim.pos }, ringR: claim.ringR,
      reserve: claim.reserve, askCr,
      seller: 'the pilot', source: 'player', claimId: claim.id,
      anchorId: claim.anchorId, anchorGen: claim.anchorGen,
      listedAt: now, expiresAt: 0, sellAt: now + delay, state: 'open',
      sectorId: claim.sectorId || null,
    };
    p.seq += 1;
    p.market.push(listing);
    this.bus.emit('pitborn:marketListed', {
      listingId: listing.id, claimId: claim.id, askCr, sellAt: listing.sellAt,
      seller: listing.seller, tick: state.tick,
    });
    return listing;
  },

  /** A player listing clears: the yard wires the price minus its cut. */
  _sellPlayerListing(state, l) {
    const p = ensurePitbornState(state);
    // Only a live board row sells — a re-entered settle or a detached row the
    // market never held moves no money.
    if (!l || l.state !== 'open' || !p.market.includes(l)) return;
    const claim = this._claimById(p, l.claimId);
    // And only the pilot's own deed cashes out — a listing that names a yard
    // ring vendors somebody else's ground for the pilot's purse.
    if (!claim || claim.ownerId !== PLAYER_OWNER || !CLAIM_LIVE.has(claim.state)) {
      l.state = 'delisted';
      this.bus.emit('pitborn:marketDelisted', { listingId: l.id, claimId: l.claimId, tick: state.tick });
      return;
    }
    l.state = 'sold';
    const payout = Math.round(l.askCr * (1 - PITBORN_CLAIM_STAKES.sellYardCut));
    this._lapseClaim(state, claim, 'sold');
    this._grant(state, payout, `pitborn_sale:${l.id}`);
    this._rep(state, PITBORN_CLAIM_STAKES.repSold, 'pitborn_claim_sold');
    this._honestWork(state);
    this._deed(state, 'claim_sold', claim.id);
    this.bus.emit('pitborn:claimSold', {
      listingId: l.id, claimId: claim.id, askCr: l.askCr, payoutCr: payout, tick: state.tick,
    });
    this._log(state, PITBORN_PIT_BARKS.marketSold);
  },

  // ── Sabotage suspicion: the yard's memory for dishonest work ──────────────────
  /** File a suspicion record — the score moves, the ledger keeps the row. */
  _fileSuspicion(state, kind, amount, detail) {
    const p = ensurePitbornState(state);
    const amt = Math.max(0, num(amount));
    p.suspicion = Math.min(PITBORN_SUSPICION.max, p.suspicion + amt);
    const rec = {
      id: `sus:${p.seq++}`, kind: str(kind, 'unknown'), amount: amt,
      detail: detail == null ? null : String(detail), at: num(state.simTime),
      score: p.suspicion,
    };
    p.suspicionLog.push(rec);
    while (p.suspicionLog.length > PITBORN_SUSPICION.logKeep) p.suspicionLog.shift();
    this.bus.emit('pitborn:suspicionFiled', {
      recordId: rec.id, kind: rec.kind, amount: amt,
      suspicion: p.suspicion, detail: rec.detail, tick: state.tick,
    });
    this._checkSuspicionStage(state);
    return rec;
  },

  /** Stage crossings fire once each upward trip — a barked warning, then a fine
   *  paid from the hold, then the blacklist. The stage re-arms once the score
   *  sands back below its band; the yard forgives, slowly. */
  _checkSuspicionStage(state) {
    const p = ensurePitbornState(state);
    const stage = pitbornSuspicionStageFor(p.suspicion);
    const bands = [0, PITBORN_SUSPICION.warnAt, PITBORN_SUSPICION.fineAt, PITBORN_SUSPICION.blacklistAt];
    if (stage > p.suspicionStage) {
      p.suspicionStage = stage;
      if (stage === 1) {
        this._log(state, PITBORN_PIT_BARKS.warn);
        this.bus.emit('pitborn:suspicionWarned', { suspicion: p.suspicion, tick: state.tick });
      } else if (stage === 2) {
        this._charge(state, PITBORN_SUSPICION.fineCr, 'pitborn_fine');
        this._rep(state, PITBORN_SUSPICION.fineRep, 'pitborn_sabotage_fine');
        this._log(state, PITBORN_PIT_BARKS.fined);
        this.bus.emit('pitborn:fined', {
          fineCr: PITBORN_SUSPICION.fineCr, suspicion: p.suspicion, tick: state.tick,
        });
      } else if (stage >= 3) {
        this._blacklist(state, 'suspicion');
      }
    } else if (stage < p.suspicionStage
        && p.suspicion <= bands[p.suspicionStage] - PITBORN_SUSPICION.rearmBelow) {
      p.suspicionStage = stage;
    }
  },

  /** The book closes: no claims, no orders, no shares until the yard forgets. */
  _blacklist(state, cause) {
    const p = ensurePitbornState(state);
    const until = num(state.simTime) + PITBORN_SUSPICION.blacklistS;
    if (until <= p.blacklistedUntil) return; // already serving a longer stretch
    p.blacklistedUntil = until;
    // Keyed by the expiry so a second blacklisting after a lift still files its rep.
    if (this._paidOnce(p, `blacklist:${until}`)) {
      this._rep(state, PITBORN_SUSPICION.blacklistRep, `pitborn_blacklist:${cause || 'unknown'}`);
    }
    this.bus.emit('pitborn:blacklisted', {
      cause: cause || 'unknown', until, suspicion: p.suspicion, tick: state.tick,
    });
    this.bus.emit('toast', { text: 'PITBORN BLACKLIST — the book is closed', kind: 'warn', ttl: 5 });
    this._log(state, PITBORN_PIT_BARKS.blacklisted);
  },

  /** Suspicion decays with quiet time; the blacklist lifts on its own clock. */
  _tickSuspicion(state, dt) {
    const p = ensurePitbornState(state);
    if (p.suspicion > 0) {
      p.suspicion = Math.max(0, p.suspicion - PITBORN_SUSPICION.decayPerS * dt);
    }
    if (p.blacklistedUntil > 0 && state.simTime >= p.blacklistedUntil) {
      p.blacklistedUntil = 0;
      p.strikes = Math.min(p.strikes, 1); // the yard turns a page, not a full pardon
      this.bus.emit('pitborn:blacklistLifted', { tick: state.tick });
      this._log(state, PITBORN_PIT_BARKS.blacklistLifted);
    }
    this._checkSuspicionStage(state);
  },

  // ── The kill wire, read by the book ────────────────────────────────────────────
  /** Stakes burned, collectors cooled, miners murdered — the book's half of every
   *  kill. Runs for ALL kills; consequences only for the player's own work. The
   *  crowd meter stays player-gated in _onKilled above. */
  _onKilledBook(p) {
    const state = this.state;
    if (!state || p.id == null) return;
    const f = ensurePitbornState(state);
    const victim = state.entities.get(p.id);
    const vd = victim && victim.data;
    const byPlayer = p.killerId != null && p.killerId === state.playerId;

    // A claim stake burned — the filing dies with the marker. The player's torch
    // on someone else's ring is sabotage, filed by name.
    let claim = vd && vd.pitbornClaimId != null ? this._claimById(f, vd.pitbornClaimId) : null;
    // The id-only fallback is the last resort — and it still must not burn a filing
    // for a recycled occupant when the corpse is readable and its generation says no.
    if (!claim) {
      claim = f.claims.find((c) => c.markerId === p.id && CLAIM_LIVE.has(c.state)
        && (c.markerGen == null || (victim && victim.occupantGeneration === c.markerGen))) || null;
    }
    // Only the bound stake buries the filing. A retired marker's corpse still
    // wears the claim's tag until the sweep — a late or duplicated kill wire on
    // it, or any body merely carrying the tag, is salvage, not sabotage. The
    // filing re-stakes its own ground when the burn was real.
    const boundStake = claim && claim.markerId === p.id
      && (claim.markerGen == null || (victim && victim.occupantGeneration === claim.markerGen));
    if (claim && CLAIM_LIVE.has(claim.state) && boundStake) {
      const sabotage = byPlayer && claim.ownerId !== PLAYER_OWNER;
      this._lapseClaim(state, claim, sabotage ? 'burned' : 'stake_lost', p.killerId ?? null);
      if (sabotage) {
        this._fileSuspicion(state, 'stake_killed', PITBORN_SUSPICION.stakeKilled,
          `${claim.name} stake burned`);
        this._rep(state, -2, 'pitborn_stake_burned');
        this._log(state, PITBORN_PIT_BARKS.claimBurned);
      }
    }
    if (vd && vd.pitbornClaimId != null) vd.pitbornClaimId = null;

    // A Tally Crew hull cooled — the row closes; killing one yourself files the
    // sabotage ledger, and the note still stands.
    if (vd && vd.pitbornDebtId != null) {
      const debtId = vd.pitbornDebtId;
      const idx = f.collectors.findIndex((r) => r.entityId === p.id && r.debtId === debtId
        && (r.gen == null || victim.occupantGeneration === r.gen));
      if (idx >= 0) f.collectors.splice(idx, 1);
      this.bus.emit('pitborn:collectorDown', {
        debtId, collectorId: p.id, byPlayer, tick: state.tick,
      });
      if (byPlayer) {
        this._fileSuspicion(state, 'collector_killed', PITBORN_SUSPICION.collectorKilled,
          `Tally Crew hull down on note ${debtId}`);
        this._rep(state, PITBORN_DEBT.repCollectorKilled, 'pitborn_collector_killed');
      }
    }

    // A pitborn miner broken unprovoked — the yardmaster invites stripping and a
    // hostile hull drew first; neither files suspicion.
    if (byPlayer && victim && victim.type === 'ship'
        && (victim.factionId === FACTION_ID || p.factionId === FACTION_ID)
        && vd?.yardmaster !== true && vd?.pitbornCollector !== true
        && p.targetHostileToPlayer !== true) {
      this._fileSuspicion(state, 'miner_killed', PITBORN_SUSPICION.minerKilled,
        `pitborn hull ${p.id} broken`);
    }
  },

  update(dt, state) {
    const pit = ensurePitbornState(state);
    // The crowd cools between moments of style.
    if (pit.crowd.score > 0) {
      pit.crowd.score = Math.max(0, pit.crowd.score - PITBORN_CULL.decayPerS * dt);
      pit.crowd.tier = crowdTierFor(pit.crowd.score).id;
    }
    this._accreteBalls(state);
    this._tickBallastMatch(state, dt);
    this._tickYardmasters(state);
    // ── The book ──
    this._tickClaims(state);
    this._tickClaimPosts(state);
    this._tickQuota(state);
    this._tickDebt(state, dt);
    this._tickMarket(state);
    this._tickSuspicion(state, dt);
  },
};

export default pitbornCull;
