// W-CAST-HANDS (row 542, 03 §4.1): Rook's bounty booth — the canon hook "bounties he
// double-bills; physical bounty delivery (tow the wreck to his booth)". A pad ring off
// the Expanse Refinery dock in Charon buys wreck hulls — and now it is a real wreck
// MARKET, not a mailbox:
//
//   • GRADING — the book appraises the hull it is handed: class (fresh kill, battlefield
//     hulk, military plate, ancient derelict, sort debris), whether the salvage pool is
//     still aboard, how warm the loss is, and whether the black box still names a lawful
//     owner. The quote follows the appraisal, stand by stand.
//   • HAGGLING — once the book knows a seller (three delivered hulls), an arriving wreck
//     opens an offer instead of an instant sale: rest the hull to hear the number, hold
//     it at rest to watch Rook sweeten, pull it out of the ring to walk. Walk-offs are
//     remembered and the next opener is worse.
//   • DISPUTED HULLS — a lawful-owned or military hull is hot: Rook pays the book anyway
//     but the slip can get filed with the law (the registry law seam decides; no fake
//     heat writes). The Quiet line pays a premium on exactly those hulls and files
//     nothing — that is what a laundry is for.
//   • COMPETITION — a second ring east of the dock, the Quiet line: lower base rate, no
//     slips, no refusals, no haggling, and a premium on disputed tonnage. Each sale at
//     one pad nudges the other pad's appetite; posted rates drift on a market tick.
//   • REPUTATION — each stand keeps its own book of the player: deals, mass, credits,
//     walk-offs, filings. Standing gates the negotiation counter, Rook's filing
//     discretion, and how much of the Quiet line's skim still applies.
//
// WHAT THIS OWNS — the two pad beacons (spawned/cleared on the same event-driven seams
// as every one-off: init/sector-enter-deferred/save:loaded/newGame), the calendar
// delivery census, the open-offer ledger entries that ride wreck entity data, and the
// market ledger at state.story.rookMarket (state.story serializes wholesale — no schema
// work). Delivery law is still the cradle's: inside the ring AND at rest — a fast pass
// is a flyby, not a sale. The credit grant goes through the economy:grantCredits
// single-writer event; the wreck leaves through removeEntity.
//
// RECEIPTS — the Rook delivery count stays in state.story.flags (the serialized,
// test-covered flag); all richer market state lives in the JSON-safe rookMarket ledger.
// Deterministic: the only randomness is state.rng() drawn at negotiation steps and the
// filing roll; the only clock is state.simTime / state.tick.

import { ROOK_BOOTH } from '../data/rook.js';
import { rookBoothEligible, rookDeliveryCheck, rookPadPosition } from '../characters/rookRules.js';
import { deferSectorEnterMaterialization, deferredEnterNow } from '../core/sectorEnterDefer.js';
import { sectorLocalToGlobalForSector } from '../data/sectorCoordinates.js';
import { hash32 } from '../core/rng.js';
import { isPlayerWanted } from './heat.js';
import { LAWFUL_STATION_FACTIONS } from '../data/factions/index.js';
export function rookBoothSpec() {
  return {
    type: 'beacon',
    pos: rookPadPosition(), vel: { x: 0, z: 0 },
    radius: 12, mass: 1e6, hull: 1, hullMax: 1,
    collides: false, physicsBody: false,
    homeSectorId: ROOK_BOOTH.sectorId,
    data: {
      rookBooth: true, parentType: 'story_prop',
      circuitMark: true, ringRadius: ROOK_BOOTH.padRadius, visualRadius: ROOK_BOOTH.padRadius,
      scanLabel: "Rook's pad · hulls bought by mass",
      scannerSignalKind: 'salvage',
      homeSectorId: ROOK_BOOTH.sectorId,
    },
  };
}

// ── The market ───────────────────────────────────────────────────────────────────
// Two stands share Charon Expanse. Stand rows are intentionally literal here: the file
// that owns the market keeps its own prices, the way each pad keeps its own book.
//
//   rook      — the honest book. Best clean-hull grades, warm/intact bonuses, and the
//               only negotiation counter on the dock. Files disputed hulls to law on a
//               roll, and refuses a pilot flying a posted warrant — paper is the job.
//   quietline — the Quiet's weigh-ring east of the dock apron. Lower base, no bonuses,
//               a premium on disputed/military tonnage (the laundry is the margin),
//               and a skim that only relaxes for sellers it has bought from before.
//               Never files, never refuses, never haggles: the rate is the rate.

const MARKET_TICK_S = 45;          // posted rates recompute on this cadence
const DEMAND_DECAY = 0.8;          // appetite forgets a fifth of itself per tick
const DEMAND_OWN_SALE = -0.02;     // a pad that just ate wants the next hull less
const DEMAND_RIVAL_SALE = 0.04;    // a pad that watched a sale bids hungrier
const DEMAND_MIN = -0.15;
const DEMAND_MAX = 0.25;

const HAGGLE_DEALS = 3;            // the book opens a counter once it knows a seller
const TIER_TWO_DEALS = 8;          // "the book remembers" — better counters, discretion
const HAGGLE_STEP_S = 1.5;         // each full step at rest is one counter check
const HAGGLE_CLOSE_S = 4.5;        // the slip closes and the hull is bought
const OFFER_TTL_S = 90;            // a stamped offer ages off the hull
const WALK_OFF_STEP = 0.06;        // each walked offer deepens the next discount
const WALK_OFF_FLOOR = 0.82;       // the book never reopens below this share of quote
const WANTED_MUTE_S = 60;          // refusal line repeat cooldown
const WARM_WINDOW_S = 300;         // a loss this fresh still smells like a kill

// Intrinsic hull quality — what the wreck IS, priced the same by anyone with eyes.
// Stand policy multiplies on top of this; the grade letter names it for the receipts.
const WRECK_QUALITY = Object.freeze({
  fresh: 1.25, battlefield: 1.0, military: 1.5, ancient: 0.8, debris: 0.85,
});

const ROOK_STAND = Object.freeze({
  id: 'rook',
  sender: ROOK_BOOTH.sender,
  pad: ROOK_BOOTH.pad,
  padRadius: ROOK_BOOTH.padRadius,
  restSpeed: ROOK_BOOTH.restSpeed,
  ratePerMass: ROOK_BOOTH.ratePerMass,
  minPayoutCr: ROOK_BOOTH.minPayoutCr,
  // The fair book: fresh tonnage and military plate grade up, derelicts grade down.
  classMult: Object.freeze({ fresh: 1.25, battlefield: 1.0, military: 1.6, ancient: 0.75, debris: 0.9 }),
  intactBonus: 1.10,             // pool still aboard — the contents ride the hull
  warmBonus: 1.15,
  filesDisputed: true,
  fileChance: 0.6,               // the roll that turns a hot hull into a report
  fileChanceRegular: 0.3,        // tier-2 discretion: for a regular the book mislays slips
  haggles: true,
  refusesWanted: true,
  disputedPremium: 1.0,          // no premium — the filing IS the price of the risk
  skim: 1.0,
  announceFlag: ROOK_BOOTH.announceFlag,
});

const QUIET_STAND = Object.freeze({
  id: 'quietline',
  sender: 'THE QUIET LINE',
  // East of the Expanse dock apron: clear of the station body, clear of the authored
  // belt fields and the lung marker — a second ring you can see from Rook's pad.
  pad: Object.freeze({ x: 1500, z: -900 }),
  padRadius: 70,
  restSpeed: ROOK_BOOTH.restSpeed,
  ratePerMass: 0.15,
  minPayoutCr: 15,
  // Weight, not paperwork: derelicts and clean fresh hulls grade thin here; restricted
  // plate is the only tonnage this line pays up for.
  classMult: Object.freeze({ fresh: 1.05, battlefield: 1.0, military: 1.35, ancient: 0.6, debris: 0.85 }),
  intactBonus: 1.0,
  warmBonus: 1.0,
  filesDisputed: false,
  fileChance: 0,
  fileChanceRegular: 0,
  haggles: false,
  refusesWanted: false,
  disputedPremium: 1.8,          // the laundry pays for the paper risk Rook won't touch
  disputedPremiumRegular: 2.0,
  skim: 0.92,                    // t0: eight points off the top, no slip to argue with
  skimRegular: 0.96,             // t1: the skim relaxes for a name it has paid
  skimBest: 1.0,                 // t2: a known seller is nearly clean money
  announceFlag: 'rook_quiet_announced',
});

export const ROOK_MARKET_STANDS = Object.freeze([ROOK_STAND, QUIET_STAND]);

/** The beacon spec for a market stand's pad. 'rook' is the historical shape verbatim. */
export function rookMarketPadSpec(standId) {
  if (standId === ROOK_STAND.id) return rookBoothSpec();
  if (standId === QUIET_STAND.id) {
    return {
      type: 'beacon',
      pos: sectorLocalToGlobalForSector({ ...QUIET_STAND.pad }, ROOK_BOOTH.sectorId), vel: { x: 0, z: 0 },
      radius: 10, mass: 1e6, hull: 1, hullMax: 1,
      collides: false,
      homeSectorId: ROOK_BOOTH.sectorId,
      data: {
        rookMarketPad: QUIET_STAND.id, parentType: 'story_prop',
        scanLabel: 'a second weigh-ring · hulls bought without a slip',
        scannerSignalKind: 'salvage',
        homeSectorId: ROOK_BOOTH.sectorId,
      },
    };
  }
  return null;
}

// ── Stand book-keeping ───────────────────────────────────────────────────────────

function standById(id) {
  for (const s of ROOK_MARKET_STANDS) if (s.id === id) return s;
  return null;
}

function freshStandBook(ratePerMass) {
  return {
    deals: 0, massBought: 0, creditsPaid: 0, lastDealT: 0,
    walkOffs: 0, disputesFiled: 0,
    // JSON-safe sentinel: -Infinity serializes to null, and this ledger rides saves.
    wantedMuteT: -1e12,
    demand: 0, postedRate: ratePerMass,
  };
}

/** The market ledger rides state.story wholesale: one JSON-safe block, lazily created,
 *  defensively normalized (an old or odd-shaped save gets its rows filled, never
 *  trusted). Returns null when there is no story block to hang it on. */
function ensureMarket(state) {
  const story = state && state.story;
  if (!story || typeof story !== 'object') return null;
  const m = story.rookMarket && typeof story.rookMarket === 'object' ? story.rookMarket : null;
  // deferredEnterNow, not raw simTime: ensureMarket also runs inside _sync's deferred
  // sector-enter provider, where the cohort contract stamps the EMIT's clock so deferred
  // and inline delivery mint identical ledger times. Outside a drain it IS simTime.
  const nowSim = Number.isFinite(deferredEnterNow(state)) ? deferredEnterNow(state) : 0;
  // m.stands as an array passes the typeof guard but loses named rows on the next JSON
  // round-trip — a wrong-shape stands block rebuilds wholesale like any other bad ledger.
  if (!m || m.schemaVersion !== 1 || !m.stands || typeof m.stands !== 'object' || Array.isArray(m.stands)) {
    story.rookMarket = {
      schemaVersion: 1, offerSeq: 0, lastTickT: nowSim,
      stands: {
        [ROOK_STAND.id]: freshStandBook(ROOK_STAND.ratePerMass),
        [QUIET_STAND.id]: freshStandBook(QUIET_STAND.ratePerMass),
      },
    };
    return story.rookMarket;
  }
  for (const s of ROOK_MARKET_STANDS) {
    const row = m.stands[s.id];
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      m.stands[s.id] = freshStandBook(s.ratePerMass);
      continue;
    }
    for (const [k, v] of Object.entries(standBookTemplate(s))) {
      if (!Number.isFinite(row[k])) row[k] = v;
    }
    // Magnitude is untrusted too: demand and the posted rate it feeds are only ever
    // written inside the attainable band — an out-of-band row is corrupt, not clever.
    if (!(row.demand >= DEMAND_MIN && row.demand <= DEMAND_MAX)) {
      row.demand = Math.min(DEMAND_MAX, Math.max(DEMAND_MIN, row.demand));
    }
    // Legit postedRate = base x (1 + demand in band), 1e-4-rounded — 1e-4 covers the
    // rounding reach at either edge. Anything wider resets to the stand's book rate.
    if (!(row.postedRate >= s.ratePerMass * (1 + DEMAND_MIN) - 1e-4
      && row.postedRate <= s.ratePerMass * (1 + DEMAND_MAX) + 1e-4)) {
      row.postedRate = s.ratePerMass;
    }
  }
  if (!Number.isFinite(m.offerSeq)) m.offerSeq = 0;
  if (!Number.isFinite(m.lastTickT)) m.lastTickT = nowSim;
  // A lastTickT ahead of the sim clock wedges the rate tick forever — legit rows are
  // stamped at or before the sim time that wrote them, so the clamp never touches them.
  else if (m.lastTickT > nowSim) m.lastTickT = nowSim;
  return m;
}

// One frozen default book per stand — ensureMarket enumerates it every tick.
const _standBookTemplates = {};
function standBookTemplate(stand) {
  return _standBookTemplates[stand.id]
    || (_standBookTemplates[stand.id] = Object.freeze(freshStandBook(stand.ratePerMass)));
}

/** Standing tiers: how well a stand's book knows this seller. */
export function rookStandTier(book) {
  const deals = book && Number.isFinite(book.deals) ? book.deals : 0;
  return deals >= TIER_TWO_DEALS ? 2 : deals >= HAGGLE_DEALS ? 1 : 0;
}

// ── Appraisal ────────────────────────────────────────────────────────────────────

function poolIsIntact(d) {
  const pool = d && d.salvagePool;
  if (!pool || typeof pool !== 'object' || Array.isArray(pool)) return false;
  for (const v of Object.values(pool)) {
    const qty = typeof v === 'number' ? v : (v && typeof v === 'object' && Number.isFinite(v.qty) ? v.qty : 0);
    if (qty > 0) return true;
  }
  return false;
}

/** A hull is disputed when the book can still read a lawful name on the plate:
 *  a lawful-station faction owned it, the restricted military class marks it, the
 *  player's own transponder is the killer of record, or another system already
 *  stamped it hot. The pads price that risk in opposite directions. */
function hullIsDisputed(d, playerId) {
  if (!d) return false;
  const owner = d.hulkFactionId || (d.provenance && d.provenance.victimFactionId) || null;
  if (owner && LAWFUL_STATION_FACTIONS.has(owner)) return true;
  if (d.wreckClass === 'military') return true;
  const killer = (d.provenance && d.provenance.killerId) || d.killerId || null;
  if (killer != null && playerId != null && killer === playerId) return true;
  if (d.wanted === true || d.disputed === true || d.lawTagged === true) return true;
  return false;
}

function gradeLetter(quality) {
  return quality >= 1.4 ? 'prime cut'
    : quality >= 1.08 ? 'clean book'
      : quality >= 0.9 ? 'book hull' : 'thin scrap';
}

/** Read the hull's real state into an appraisal: intrinsic quality and grade, the
 *  stand's posted quote for it, and whether the black box makes it disputed. Pure over
 *  (stand, entity, simTime, playerId) — the market ledger supplies only postedRate. */
function appraiseHull(stand, e, state, book) {
  const d = e && e.data ? e.data : {};
  const cls = typeof d.wreckClass === 'string' ? d.wreckClass : null;
  const qualityBase = cls && WRECK_QUALITY[cls] != null ? WRECK_QUALITY[cls] : 1.0;
  const intact = poolIsIntact(d);
  // aftermath.t is the cloned marker's kill stamp (simTime); provenance carries tick,
  // not t — kept last so a forward-compat stamp still reads, without unit-mixing ticks.
  const killedAt = Number.isFinite(d.killedAt) ? d.killedAt
    : (d.aftermath && Number.isFinite(d.aftermath.t) ? d.aftermath.t
      : (d.provenance && Number.isFinite(d.provenance.t) ? d.provenance.t : null));
  const now = Number.isFinite(state && state.simTime) ? state.simTime : 0;
  // killedAt 0 is the no-stamp fallback, not a fresh kill — only a real stamp is warm.
  const warm = killedAt != null && killedAt > 0 && now - killedAt <= WARM_WINDOW_S && now >= killedAt;
  const disputed = hullIsDisputed(d, state && state.playerId);
  const quality = qualityBase
    * (intact ? 1.10 : 1.0)
    * (warm ? 1.15 : 1.0);
  // Stand pricing: posted rate x the stand's own grade table x its policy levers.
  const classMult = cls && stand.classMult[cls] != null ? stand.classMult[cls] : 1.0;
  const tier = rookStandTier(book);
  const disputeMult = disputed
    ? (stand.id === QUIET_STAND.id && tier >= 2
      ? (stand.disputedPremiumRegular || stand.disputedPremium || 1)
      : (stand.disputedPremium || 1))
    : 1;
  const posted = Number.isFinite(book && book.postedRate) ? book.postedRate : stand.ratePerMass;
  const mass = Number.isFinite(e && e.mass) && e.mass > 0 ? e.mass : 0;
  const quote = Math.max(stand.minPayoutCr, Math.round(
    mass * posted * classMult
    * (intact ? stand.intactBonus : 1)
    * (warm ? stand.warmBonus : 1)
    * disputeMult,
  ));
  return {
    classId: cls,
    intact, warm, disputed,
    quality, gradeId: gradeLetter(quality),
    quoteCr: quote,
  };
}

// ── The system ───────────────────────────────────────────────────────────────────

export function createRookBooth() {
  return {
    name: 'rookBooth',
    init(ctx) {
      // Singleton re-init retires the old listener set and provider first (ravel/docket law).
      this.destroy();
      this.state = ctx.state; this.bus = ctx.bus; this.helpers = ctx.helpers || {};
      this.registry = ctx.registry || null;
      this._unsubs = [];
      const on = (event, fn) => {
        const off = this.bus?.on(event, fn); if (typeof off === 'function') this._unsubs.push(off);
      };
      on('sector:enter', (p) => {
        if (deferSectorEnterMaterialization(this.state, p, this._cookProvider)) return;
        this._sync();
      });
      this._cookProvider = () => { this._sync(); };
      (this.helpers.sectorCookProviders || (this.helpers.sectorCookProviders = []))
        .push(this._cookProvider);
      on('save:loaded', () => this._sync());
      on('game:newGame', () => this._sync());
      this._sync();
    },
    destroy() {
      for (const off of this._unsubs || []) off();
      this._unsubs = [];
      const providers = this.helpers?.sectorCookProviders;
      if (Array.isArray(providers)) {
        const i = providers.indexOf(this._cookProvider);
        if (i >= 0) providers.splice(i, 1);
      }
      const queue = this.state?.render?.deferredEnterMaterializers;
      if (Array.isArray(queue)) {
        for (let i = queue.length - 1; i >= 0; i--) {
          if (queue[i] && queue[i].provider === this._cookProvider) queue.splice(i, 1);
        }
      }
      this._cookProvider = null;
      this._removeOwned();
      this.registry = null;
    },
    _flags(s = this.state) {
      const flags = s?.story?.flags;
      return flags ? flags : (s?.story ? (s.story.flags = {}) : null);
    },
    _adventure(s = this.state) {
      const run = s?.run;
      return (!run || !run.kind || run.kind === 'adventure' || run.kind === 'campaign')
        && s?.world?.currentSectorId === ROOK_BOOTH.sectorId;
    },
    _padFor(standId) {
      for (const e of this.state?.entityList || []) {
        if (!e?.alive) continue;
        if (standId === ROOK_STAND.id && e.data?.rookBooth === true) return e;
        if (e.data?.rookMarketPad === standId) return e;
      }
      return null;
    },
    _removeOwned() {
      for (const e of this.state?.entityList || []) {
        if (!e?.alive) continue;
        if (e.data?.rookBooth === true || typeof e.data?.rookMarketPad === 'string') {
          this.helpers?.removeEntity?.(e.id);
        }
      }
    },
    _roll(s) {
      return typeof s?.rng === 'function' ? s.rng() : 0.5;
    },
    _popup(id, sender, text, ttl = 8) {
      this.bus?.emit('comms:popup', {
        id, sender, category: 'story', text, ttl, persist: false,
      });
    },
    _maybeAnnounceQuiet(s, flags, market) {
      // The line does not hail a hull it has never seen sell: the second ring speaks up
      // only after the book has bought one — then once ever, flag-latched like Rook's.
      if (!flags || flags[QUIET_STAND.announceFlag] === true) return;
      const book = market && market.stands && market.stands[ROOK_STAND.id];
      if (!book || !(book.deals >= 1)) return;
      flags[QUIET_STAND.announceFlag] = true;
      this._popup('rook_quiet_announce', QUIET_STAND.sender,
        'A second ring weighs hulls east of the dock. No slips, no questions, no haggling — '
        + 'the rate is the rate, and it never reads a warrant.', 9);
    },
    _sync() {
      if (!this.state?.story) return;
      if (!this._adventure()) { this._removeOwned(); return; }
      if (this.helpers.spawnEntity) {
        for (const stand of ROOK_MARKET_STANDS) {
          if (!this._padFor(stand.id)) this.helpers.spawnEntity(rookMarketPadSpec(stand.id));
        }
      }
      const flags = this._flags();
      if (flags && flags[ROOK_BOOTH.announceFlag] !== true) {
        flags[ROOK_BOOTH.announceFlag] = true;
        this.bus?.emit('comms:popup', {
          id: 'rook_booth_announce', sender: ROOK_BOOTH.sender, category: 'story',
          text: ROOK_BOOTH.announce, ttl: 9, persist: false,
        });
      }
      this._maybeAnnounceQuiet(this.state, flags, ensureMarket(this.state));
    },
    /** Posted-rate drift: sales push demand through the ledger, the tick decays it and
     *  reposts. Deterministic — the only inputs are recorded sales and simTime. */
    _tickMarket(s, now) {
      const market = ensureMarket(s);
      if (!market) return null;
      if (now - market.lastTickT < MARKET_TICK_S) return market;
      market.lastTickT = now;
      let changed = false;
      const rates = {};
      for (const stand of ROOK_MARKET_STANDS) {
        const book = market.stands[stand.id];
        book.demand *= DEMAND_DECAY;
        if (Math.abs(book.demand) < 0.005) book.demand = 0;
        const clamped = Math.min(DEMAND_MAX, Math.max(DEMAND_MIN, book.demand));
        const posted = Math.round(stand.ratePerMass * (1 + clamped) * 1e4) / 1e4;
        if (posted !== book.postedRate) { book.postedRate = posted; changed = true; }
        rates[stand.id] = book.postedRate;
      }
      if (changed) this.bus?.emit('wreckMarket:rates', { rates });
      return market;
    },
    /** Which stand's ring holds this wreck right now, if any. Returns the stand plus
     *  the live arrival check so the caller sweeps geometry once. */
    _ringSpot(e) {
      for (const stand of ROOK_MARKET_STANDS) {
        const pad = sectorLocalToGlobalForSector(stand.pad, ROOK_BOOTH.sectorId);
        const check = rookDeliveryCheck(e, pad, stand.padRadius, stand.restSpeed);
        if (check.inZone) return { stand, check };
      }
      return null;
    },
    _openOffer(d) {
      const o = d && d.rookOffer;
      return o && typeof o === 'object' && !Array.isArray(o) ? o : null;
    },
    /** An offer dies when its hull leaves the pad's ring (a walk-off — the book prices
     *  the seller's impatience into the next opener), ages past its TTL (no fault — the
     *  hull was simply elsewhere), or the pad went dark under a warrant. */
    _lapseOffer(s, e, d, reason, market) {
      const offer = this._openOffer(d);
      if (!offer) return;
      delete d.rookOffer;
      const stand = standById(offer.stand) || ROOK_STAND;
      if (reason === 'walked') {
        d.rookWalkOffs = (Number.isFinite(d.rookWalkOffs) ? d.rookWalkOffs : 0) + 1;
        const book = market && market.stands && market.stands[stand.id];
        if (book) book.walkOffs += 1;
      }
      this.bus?.emit('rookWreck:offerLapsed', {
        entityId: e.id, standId: stand.id, quoteCr: offer.quoteCr,
        walkOffs: Number.isFinite(d.rookWalkOffs) ? d.rookWalkOffs : 0, reason,
      });
      if (reason === 'walked') {
        this._popup(`rook_walk_${e.id}_${offer.seq || 0}`, stand.sender,
          'Walked. The number is off the pad — the next one opens thinner.', 6);
      }
    },
    /** The negotiation counter. An open offer accrues dwell only while the hull rests
     *  inside its own pad's ring; each step is one seeded sweeten roll, and the slip
     *  closes when the dwell runs out. The player's verbs are hold or haul — the book
     *  does the talking. */
    _negotiate(s, e, d, stand, book, offer, now, dt, appraisal) {
      // Stripped mid-negotiation: the posted quote priced the pool aboard, and the
      // slip must not pay for freight the seller already pocketed.
      if (offer.intactPriced && appraisal && !appraisal.intact) {
        offer.quoteCr = Math.max(stand.minPayoutCr, Math.round(offer.quoteCr / stand.intactBonus));
        offer.intactPriced = false;
      }
      offer.dwell = (Number.isFinite(offer.dwell) ? offer.dwell : 0) + Math.max(0, dt || 0);
      const tier = rookStandTier(book);
      const maxRounds = tier >= 2 ? 3 : 2;
      while (offer.rounds < maxRounds && offer.dwell >= offer.nextStepAt) {
        offer.rounds += 1;
        offer.nextStepAt = (Number.isFinite(offer.nextStepAt) ? offer.nextStepAt : 0) + HAGGLE_STEP_S;
        const chance = tier >= 2 ? 0.75 : 0.6;
        if (this._roll(s) < chance) {
          const gain = 0.05 + this._roll(s) * 0.07;
          const next = Math.max(offer.quoteCr + 1, Math.round(offer.quoteCr * (1 + gain)));
          if (next !== offer.quoteCr) {
            offer.quoteCr = next;
            this.bus?.emit('rookWreck:countered', {
              entityId: e.id, standId: stand.id, quoteCr: next, rounds: offer.rounds,
            });
            this._popup(`rook_counter_${e.id}_${offer.seq}_${offer.rounds}`, stand.sender,
              `Fine. ${next} cr — the hull talks better than you do. Hold it or haul it.`, 7);
          }
        }
      }
      if (offer.dwell >= offer.closeAt) {
        const payout = Number.isFinite(offer.quoteCr) ? offer.quoteCr : appraisal.quoteCr;
        this._closeSale(s, e, d, stand, book, appraisal, payout, offer.rounds);
        return true;
      }
      return false;
    },
    /** The shared consumption tail — the latch, the grant, the receipt line, the
     *  delivered event, the canonical salvage:completed marker retire, the take. Order
     *  is the landed one: the book stamps the claim before it pays, and the hull is
     *  still resolvable when the consumption receipt lands so the law's black-box
     *  discovery sees the body it is reading about. */
    _closeSale(s, e, d, stand, book, appraisal, payoutCr, rounds) {
      delete d.rookOffer;
      d.rookClaimed = true;
      const now = Number.isFinite(s.simTime) ? s.simTime : 0;
      const mass = Number.isFinite(e.mass) && e.mass > 0 ? e.mass : 0;
      book.deals += 1;
      book.massBought += mass;
      book.creditsPaid += payoutCr;
      book.lastDealT = now;
      // Demand ripple: this pad's appetite eases, the other pad's sharpens — the market
      // heard what just crossed a ring.
      const market = ensureMarket(s);
      book.demand = Math.max(DEMAND_MIN, Math.min(DEMAND_MAX, book.demand + DEMAND_OWN_SALE));
      if (market) {
        for (const other of ROOK_MARKET_STANDS) {
          if (other.id === stand.id) continue;
          const row = market.stands[other.id];
          row.demand = Math.max(DEMAND_MIN, Math.min(DEMAND_MAX, row.demand + DEMAND_RIVAL_SALE));
        }
      }
      this.bus?.emit('economy:grantCredits', { amount: payoutCr, reason: 'rook:booth' });
      const flags = this._flags(s);
      let count = book.deals;
      const deliveredMarkerId = d.markerId || (d.provenance && d.provenance.markerId) || null;
      // The receipt names the hull the book took (a marked Cinder Wasp reads "Kite · marked
      // Wasp: …"), so the pilot sees WHICH body was weighed, not just a number.
      const hullName = deliveredMarkerId
        ? this.registry?.get?.('aftermathWrecks')?._markerById?.(deliveredMarkerId)?.victimLabel : null;
      const named = hullName ? `${String(hullName).slice(0, 80)}: ` : '';
      if (stand.id === ROOK_STAND.id && flags) {
        // The serialized book-count flag stays Rook's own — the receipt text and the
        // first-hull line key off it exactly as they always did.
        count = (Number(flags[ROOK_BOOTH.countFlag]) || 0) + 1;
        flags[ROOK_BOOTH.countFlag] = count;
        this._popup(`rook_receipt_${e.id}`, ROOK_BOOTH.sender,
          named + (count === 1 ? ROOK_BOOTH.firstReceipt : ROOK_BOOTH.receipt)
            .replace('{cr}', String(payoutCr)));
      } else {
        this._popup(`rook_receipt_${e.id}`, stand.sender,
          `${named}Weighed ${appraisal.gradeId}. ${payoutCr} cr — and no slip exists to argue with.`, 8);
      }
      if (appraisal.disputed && stand.id === ROOK_STAND.id) {
        this._fileDisputedHull(s, e, appraisal, book);
      }
      this.bus?.emit('rookWreck:delivered', {
        entityId: e.id, mass, payoutCr, count, markerId: deliveredMarkerId,
        source: stand.id === ROOK_STAND.id ? 'rook:booth' : `rook:booth:${stand.id}`,
        sectorId: ROOK_BOOTH.sectorId,
        pos: { x: e.pos.x, z: e.pos.z },
        standId: stand.id, gradeId: appraisal.gradeId, quality: Math.round(appraisal.quality * 100) / 100,
        intact: appraisal.intact, warm: appraisal.warm, disputed: appraisal.disputed,
        haggleRounds: rounds || 0, classId: appraisal.classId || null,
      });
      // The booth takes the hull through the canonical consumption receipt, not a silent
      // delete: a durable aftermath marker retires on salvage:completed instead of
      // rematerializing the sold body on the next enter (the respawn would return
      // latch-free — an infinite re-sell), and every other listener (recovery calls,
      // law discovery, world pressure) settles the wreck like a strip did.
      this.bus?.emit('salvage:completed', {
        wreckId: e.id,
        markerId: d.markerId || (d.provenance && d.provenance.markerId) || null,
        loot: {},
        pos: { x: e.pos.x, z: e.pos.z },
        radius: Number.isFinite(e.radius) ? e.radius : 0,
        source: stand.id === ROOK_STAND.id ? 'rook:booth' : `rook:booth:${stand.id}`,
      });
      this.helpers.removeEntity(e.id);
    },
    /** The book buys a hot hull at book price — and then the slip can get filed. The
     *  report goes through the law owner's intake (witnesses and jurisdiction decide;
     *  there is no heat write here — a quiet dock files into a void and the denial is
     *  the honest outcome). The roll is seeded; tier-2 regulars get the book's
     *  discretion at half the chance. */
    _fileDisputedHull(s, e, appraisal, book) {
      const tier = rookStandTier(book);
      const chance = tier >= 2 ? ROOK_STAND.fileChanceRegular : ROOK_STAND.fileChance;
      if (this._roll(s) >= chance) return;
      const d = e.data || {};
      const markerId = d.markerId || (d.provenance && d.provenance.markerId) || null;
      const payloadStableId = markerId || `wreck_hull:${e.id}`;
      const tick = Number.isInteger(s.tick) && s.tick >= 0 ? s.tick : 0;
      const reportId = `rook:file:${payloadStableId}:${tick}:${hash32(e.id, 'rook').toString(36)}`;
      let receipt = null;
      let fileFault = false;
      try {
        const law = this.registry && typeof this.registry.get === 'function'
          ? this.registry.get('lawSecurity') : null;
        receipt = law && typeof law.reportIncident === 'function'
          ? law.reportIncident({
            reportId,
            kind: 'payload_theft',
            offenderStableId: 'player',
            offenderEntityId: s.playerId == null ? null : s.playerId,
            payloadStableId,
            causalTick: tick,
            pos: { x: e.pos.x, z: e.pos.z },
          }) : null;
      } catch (_) {
        // A faulting law owner is the same void as an absent one — the slip is priced,
        // and a throw here must never strand the sale mid-flight (the latch and the
        // grant already landed; the hull still has to retire through the receipts).
        fileFault = true;
      }
      const accepted = receipt && receipt.accepted === true;
      if (accepted) book.disputesFiled += 1;
      this.bus?.emit('rookWreck:disputeFiled', {
        entityId: e.id, standId: ROOK_STAND.id, reportId,
        accepted: receipt ? accepted : null,
        incidentReceiptId: receipt && receipt.incidentReceiptId || null,
        reason: receipt && receipt.accepted === false ? receipt.reason || 'denied' : (receipt ? null : (fileFault ? 'fault' : 'no_law')),
      });
      if (accepted) {
        this._popup(`rook_filed_${e.id}`, ROOK_BOOTH.sender,
          'The book filed the hull. If the dock was watching, the paper already moved.', 8);
      }
    },
    /** A wanted pilot gets a dark pad at Rook's — the book does not deal under a posted
     *  warrant. Muted so the census cannot spam the line every tick. */
    _refuseWanted(s, e, book, now) {
      if (now - (Number.isFinite(book.wantedMuteT) ? book.wantedMuteT : -1e12) < WANTED_MUTE_S) return;
      book.wantedMuteT = now;
      this.bus?.emit('rookWreck:padRefused', {
        entityId: e.id, standId: ROOK_STAND.id, reason: 'wanted',
      });
      this._popup(`rook_wanted_${e.id}`, ROOK_BOOTH.sender,
        "Pad's dark while a warrant rides you. The east ring doesn't read papers — it pays worse.", 8);
    },
    /** Fresh arrival at a stand that negotiates: stamp the appraisal on the hull as an
     *  open offer and say the number. The next opener remembers walks. */
    _postOffer(s, e, d, stand, market, appraisal, now) {
      const walks = Number.isFinite(d.rookWalkOffs) ? d.rookWalkOffs : 0;
      const opener = Math.max(stand.minPayoutCr, Math.round(
        appraisal.quoteCr * Math.max(WALK_OFF_FLOOR, 1 - WALK_OFF_STEP * walks)));
      const seq = ++market.offerSeq;
      d.rookOffer = {
        stand: stand.id, quoteCr: opener, postedAt: now, dwell: 0,
        intactPriced: appraisal && appraisal.intact === true,
        nextStepAt: HAGGLE_STEP_S, closeAt: HAGGLE_CLOSE_S, rounds: 0, seq,
      };
      this.bus?.emit('rookWreck:appraised', {
        entityId: e.id, standId: stand.id, quoteCr: opener, gradeId: appraisal.gradeId,
        classId: appraisal.classId || null, disputed: appraisal.disputed,
        intact: appraisal.intact, warm: appraisal.warm, offerSeq: seq,
      });
      const warn = appraisal.disputed
        ? ' The black box still reads a lawful name — the book files what it buys.'
        : '';
      this._popup(`rook_quote_${e.id}_${seq}`, stand.sender,
        `Hold it steady. Book reads ${appraisal.gradeId} — I open at ${opener} cr.${warn}`, 8);
    },
    /** The calendar delivery pass: any eligible wreck at rest inside a market ring is
     *  freight on the pad — towed, shoved or drifted, the book does not ask how it got
     *  there. What the book does with it depends on the stand that owns the ring, the
     *  hull's grade, and whether the seller's name is in the book. */
    update(dt, state) {
      const s = state || this.state;
      if (!s || !this._adventure(s)) return;
      // No take, no pay: without the removal seam the latch would swallow the hull and the
      // grant would land on a body still sitting in the ring.
      if (typeof this.helpers?.removeEntity !== 'function') return;
      const flags = this._flags(s);
      if (!flags) return;
      const now = Number.isFinite(s.simTime) ? s.simTime : 0;
      const market = this._tickMarket(s, now);
      if (!market) return;
      this._maybeAnnounceQuiet(s, flags, market);
      const wanted = isPlayerWanted(s);
      for (const e of s.entityList || []) {
        if (!rookBoothEligible(e)) continue;
        const d = e.data || (e.data = {});
        const offer = this._openOffer(d);
        const spot = this._ringSpot(e);
        if (!spot) {
          // Out of every ring: an open offer dies as a walk-off the book remembers.
          if (offer) this._lapseOffer(s, e, d, 'walked', market);
          continue;
        }
        const { stand, check } = spot;
        if (offer && offer.stand !== stand.id) {
          // Hauled across the dock to the other pad mid-negotiation — the offer lapses,
          // and this pad counts it as a fresh arrival below.
          this._lapseOffer(s, e, d, 'walked', market);
        }
        if (!check.arrived) continue; // inside the yard but still moving — no sale, no lapse
        const liveOffer = this._openOffer(d);
        if (stand.refusesWanted && wanted) {
          if (liveOffer) this._lapseOffer(s, e, d, 'warrant', market);
          this._refuseWanted(s, e, market.stands[stand.id], now);
          continue;
        }
        const book = market.stands[stand.id];
        const appraisal = appraiseHull(stand, e, s, book);
        if (liveOffer) {
          if (now - liveOffer.postedAt > OFFER_TTL_S) {
            this._lapseOffer(s, e, d, 'stale', market);
          } else {
            this._negotiate(s, e, d, stand, book, liveOffer, now, dt, appraisal);
            continue;
          }
        }
        const tier = rookStandTier(book);
        if (stand.haggles && tier >= 1) {
          this._postOffer(s, e, d, stand, market, appraisal, now);
          continue;
        }
        // Take-it-or-leave-it: the quiet line's only posture, and Rook's toward a hull
        // whose seller the book does not know yet. The skim is the quiet line's cut —
        // the quote on the slip is what the scale said, not what the hand pays.
        const skim = stand.id === QUIET_STAND.id
          ? (tier >= 2 ? stand.skimBest : tier >= 1 ? stand.skimRegular : stand.skim)
          : 1;
        const payout = Math.max(stand.minPayoutCr, Math.round(appraisal.quoteCr * skim));
        this._closeSale(s, e, d, stand, book, appraisal, payout, 0);
        this._maybeAnnounceQuiet(s, flags, market);
      }
    },
  };
}

export const rookBooth = createRookBooth();
