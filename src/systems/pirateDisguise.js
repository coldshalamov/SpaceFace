// BP-13/B7 Fake-Civilian-Until-Scan.
//
// Listens to the existing scanner pulse event and reveals disguised pirate traffic. Scanner/HUD
// remain unchanged; after reveal, their existing contact readers see ordinary hostile AI fields.
//
// PQ-151.02 — the same system owns the corrupt-port papers wash. Explicit per-pod confirmation at an outlaw berth
// stamps only the chosen nearby pod and takes the reviewed cut. Reputation
// with the port's faction pays the cut down. Credits still move through economy:chargeCredits.
// Heat is not bought off here — WANTED still escapes by leaving the zone or breaking a net.
//
// THE COVER BOOK — the deception layer under the wash:
//   · every disguised hull carries a deterministic quality grade. The scanner still
//     blows a mask on contact, but scans that land close and miss — and a pilot who
//     loiters inside the fray ring — accrue exposure: the mark goes spooked, then bolts.
//   · the player's own cover is a ledger (state.player.pirateCover — the player-record
//     save slice, so the book survives Continue like launderLedger). Deeds witnessed in the
//     open — a blown mask, a "civilian" hull cooled before it was outed, hot papers
//     under a lawful berth's manifest office — file suspicion against the right book:
//     the Reach learns your face, the law flags your papers.
//   · each faction re-reads its file on a beat. Failed checks escalate: a warning,
//     then fines that keep landing while the score stays hot, then the cover burns —
//     the Reach stops pretending inside your ring, the Quiet's wash charges flagged
//     paper prices. Pages turn on their own clock.
//   · outlaw berths answer with bargains: new papers, a burned record, hushed
//     witnesses, cooled marks. Every offer is priced, expires, and pays out exactly
//     once — latches land before any credit or rep event is emitted.
//
// Deterministic: quality, rolls and check beats derive from hash32(meta.seed, …) and
// simTime; no Math.random, no wall clock, no Set/Map/Symbol inside the book. Money
// moves only through economy:grantCredits / economy:chargeCredits; standing only
// through faction:repDelta. Live entity references are guarded by entity id +
// occupantGeneration + a tag stamped on the body itself.
import { revealPirateDisguise, shouldRevealOnScan } from '../data/pirateDisguise.js';
import {
  applyLaunderStamp,
  canLaunderSalvageAtStation,
  isHotLaunderCargo,
  LAUNDER_DOCK_RANGE,
  LAUNDER_LEDGER_MAX,
  launderCutCredits,
  launderCutFrac,
  stationRecordById,
} from '../data/salvageLegality.js';
import { cargoIdentityOf } from '../data/cargoIdentity.js';
import { occupantGenerationOf } from '../core/entity.js';
import { isJettisonedCargoPod } from './lootShards.js';
import { hasTethysBlackMarketAccess, TETHYS_BLACK_MARKET_RUN } from '../data/frontierRumors.js';
import {
  forEachLivingWorldActor,
  indexedShipLikeScan,
  indexedTypeScan,
} from '../world/livingWorldViews.js';
import { hash32 } from '../core/rng.js';

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const intOr = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n | 0 : d; };
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v, d = '') => (typeof v === 'string' && v ? v : d);
const frac = (...args) => (hash32(...args) >>> 0) / 4294967296; // deterministic [0,1)
const dist2 = (a, b) => { const dx = (a.x || 0) - (b.x || 0); const dz = (a.z || 0) - (b.z || 0); return dx * dx + dz * dz; };
const seedOf = (state) => num(state && state.meta && state.meta.seed);

const COVER_STATE_KEY = 'pirateCover';
const PAID_STAMPS_CAP = 128;
const LOG_CAP = 24;
const TRUE_FACTION = 'faction_reach';
const QUIET_FACTION = 'faction_quiet';

// The book's own cadence and drift rates.
export const COVER_TICK = Object.freeze({
  beatS: 0.5,                 // the ledger settles on a half-second beat
  maxStepS: 8,                // a hitch or jump never fast-forwards the book past this
  suspicionCoolPerS: 0.30,    // word of mouth fades on its own clock
  qualityHealPerS: 0.55,      // quiet stretches let the cover read crisp again
  qualityHitFrac: 0.6,        // each filed point of suspicion frays the cover
});

// The player's cover is a 0–100 gauge; the NPC disguise grade rides the same scale.
export const COVER_QUALITY = Object.freeze({
  max: 100,
  thinBelow: 0.4,             // quality fraction under this is a thin mask
  deepFrom: 0.8,              // at this grade they have learned to hold a lie
  launderRestore: 8,          // a papers wash is a small cover repair too
});

// Detection over time and repeated exposure — the NPC side of the book.
export const COVER_SPOOK = Object.freeze({
  spookRadius: 1800,          // a pulse landing this close but missing still rattles them
  frayRadius: 300,            // loitering inside this ring frays the lie on its own
  frayPerS: 1.0,              // exposure per second inside the fray ring
  coolPerS: 0.45,             // exposure bleeds off once the pressure lifts
  nearMissExposure: 1,        // one near-miss pulse is worth this much exposure
  spookBase: 2,               // exposure before the mark telegraphs: base + quality*spookQuality
  spookQuality: 4,
  boltAfter: 3,               // exposure past the telegraph before they bolt for real
});

// Witness tracking — who can carry the tale, and how much it weighs.
export const COVER_WITNESS = Object.freeze({
  radius: 1400,               // actors this close to the deed can carry it
  maxRows: 24,                // the file is short — the oldest rows close first
  ttlS: 360,                  // a witness stops mattering after this
  baseMult: 0.5,              // even unwitnessed word leaks a little
  perRowMult: 0.1,            // each live mouth worsens a check by this
});

// Act kinds and the suspicion each one files.
export const COVER_SUSPICION = Object.freeze({
  outedWitnessed: 7,          // a masked pirate blown while others watched
  spookedOuted: 4,            // a rattled pirate dropping pretense in public
  maskedKill: 24,             // a "civilian" hull cooled before it was outed
  maskedKillSkin: 12,         // the skin they wore counted as a civilian death
  witnessSilenced: 18,        // killing the mouth that filed on you
  seenHot: 9,                 // hot papers under a lawful berth's manifest office
  maxScore: 100,
  bookCap: 12,                // the book tracks this many factions — the coldest file drops
});

// Faction-specific reads: how hot the score must run before a faction re-checks
// you, and how wide the roll window is. The Reach are paranoid; the law is slow
// but heavy.
const SUSPICION_PROFILES = Object.freeze({
  faction_reach: Object.freeze({ warnAt: 18, checkSpread: 55, label: 'the Reach' }),
  faction_scn: Object.freeze({ warnAt: 26, checkSpread: 60, label: 'the Concord' }),
  faction_quiet: Object.freeze({ warnAt: 30, checkSpread: 50, label: 'the Quiet' }),
});
const DEFAULT_PROFILE = Object.freeze({ warnAt: 24, checkSpread: 56, label: 'the locals' });
const OUTLAW_FACTIONS = Object.freeze([TRUE_FACTION, QUIET_FACTION]);

// The beat-check each faction runs while its file on you stays hot.
export const COVER_CHECK = Object.freeze({
  periodS: 6,                 // each faction re-reads your file on this cadence
  base: 0.05, perPoint: 0.006, cap: 0.55,
  qualityFloorMult: 0.45,     // a pristine cover still fails one read in ~twenty
  warnRep: -2, fineRep: -4, burnRep: -8,
  fineBaseCr: 180, finePerPointCr: 6,
  dockPapersGapS: 30,         // one manifest-office check per berth visit window
  visitStampCap: 16,          // per-berth manifest-office stamps the book remembers
});

// What "burned" costs while it lasts.
export const COVER_BURN = Object.freeze({
  windowS: 420,               // a burned face stays burned this long
  markAmbushR: 900,           // a marked pilot: Reach masks drop inside this ring
  flaggedCutMult: 1.5,        // the Quiet's wash charges flagged-paper prices
});

// The fixer's menu at an outlaw berth — bargains that repair the cover.
export const COVER_BARGAIN = Object.freeze({
  maxPosted: 3,               // a berth posts at most this many offers per visit
  ttlS: 240,                  // an offer outlives one long menu browse
  undockGraceS: 8,            // leaving the port closes the window after a breath
  repostGapS: 6,              // re-emitted dock events cannot repost inside this
  newPapersBaseCr: 260, newPapersPerDeficitCr: 4, newPapersAmount: 40,
  burnRecordBaseCr: 220, burnRecordPerPointCr: 7, burnKeepFrac: 0.25,
  hushBaseCr: 200, hushPerRowCr: 90, hushMaxRows: 4,
  coolMarkBaseCr: 320, coolMarkPerSecondCr: 0.5,
  minOfferScore: 15,          // a burn-record only posts while the file is this hot
});

// The lawful tip a witnessed scan reveal pays — once per hull generation.
export const COVER_TIP = Object.freeze({ baseCr: 90, qualityCr: 220, rep: 1 });

const BARGAIN_KINDS = Object.freeze(['new_papers', 'burn_record', 'hush_witness', 'cool_marks']);

const SPOOK_LINES = Object.freeze([
  'Backing off — traffic\'s heavy on this lane.',
  'Course correction. Nothing here worth the holding.',
  'This lane reads loud. Making room.',
  'Static on the scope — falling back a tick.',
]);
const WARN_LINES = Object.freeze([
  'Word is out — {faction} is asking after your papers.',
  '{faction} pulled your manifest twice this shift. They are not done.',
  'A clerk at {faction} just re-read your file. Careful.',
]);
const BURN_LINES = Object.freeze([
  'Your face is burned with {faction}. New papers, or keep your distance.',
  '{faction} stopped pretending. Your cover there is gone.',
  'The file on you went public at {faction}. They know your frame.',
]);
const COOLED_LINES = Object.freeze([
  '{faction} turned a page — the file on you goes cold.',
  'The book at {faction} closes. Old word, old paper.',
]);
const BARGAIN_TOAST = 'The berth has a fixer — cover work on offer.';

function profileFor(factionId) {
  return SUSPICION_PROFILES[factionId] || DEFAULT_PROFILE;
}

function pickLine(lines, seed, key) {
  return lines[hash32(seed, key, 'coverLine') % lines.length];
}

// ── The book ──────────────────────────────────────────────────────────────────
// Row validators — a malformed row drops on ensure; a clean ledger keeps its array
// identity (replacing it every normalize orphans rows filed mid-expression).
const VALID_WITNESS = (r) => isObj(r) && typeof r.id === 'string'
  && (r.entityId != null || r.stationId != null) && typeof r.kind === 'string';
const VALID_OFFER = (r) => isObj(r) && typeof r.id === 'string' && BARGAIN_KINDS.includes(r.kind);
const VALID_LOG = (r) => isObj(r) && typeof r.kind === 'string';
const VALID_PAID = (r) => typeof r === 'string' && r.length > 0;
const dropMalformed = (rows, valid) => (rows.some((r) => !valid(r)) ? rows.filter(valid) : rows);

/** Strip a witness row's ownership tag off its body — a dropped row never leaves a mark. */
function untagWitnessRow(state, row) {
  if (!row || row.entityId == null) return;
  const entities = state && state.entities;
  const e = entities && typeof entities.get === 'function' ? entities.get(row.entityId) : null;
  const tags = e && e.data && e.data.coverWitness;
  if (tags && tags[row.id] != null) delete tags[row.id];
}

/**
 * Fresh serializable cover book under state.player.pirateCover — the player-record
 * slice the save envelope captures and restores (same seat as launderLedger), so the
 * book survives Continue without a new save slot. Bench states with no player record
 * host it on state directly — transient, as every bench book is.
 * Normalizes on every read — a corrupt or partial save lands back in shape.
 */
export function ensureCoverState(state) {
  const host = isObj(state.player) ? state.player : state;
  if (!isObj(host[COVER_STATE_KEY])) {
    host[COVER_STATE_KEY] = {
      quality: COVER_QUALITY.max, suspicion: {}, witnesses: [],
      offers: [], burned: {}, paid: [], log: [], seq: 0, checkSeq: 0,
    };
  }
  const c = host[COVER_STATE_KEY];
  c.quality = Math.max(0, Math.min(COVER_QUALITY.max, num(c.quality, COVER_QUALITY.max)));
  if (!isObj(c.suspicion)) c.suspicion = {};
  for (const fid of Object.keys(c.suspicion)) {
    const rec = c.suspicion[fid];
    if (!isObj(rec) || typeof fid !== 'string' || !fid) { delete c.suspicion[fid]; continue; }
    rec.score = Math.max(0, Math.min(COVER_SUSPICION.maxScore, num(rec.score)));
    rec.stage = Math.max(0, Math.min(3, intOr(rec.stage)));
    rec.lastAt = num(rec.lastAt);
    rec.nextCheckAt = num(rec.nextCheckAt);
    rec.nextFineAt = num(rec.nextFineAt);
  }
  if (!isObj(c.burned)) c.burned = {};
  for (const fid of Object.keys(c.burned)) {
    const b = c.burned[fid];
    if (!isObj(b) || !Number.isFinite(Number(b.until))) { delete c.burned[fid]; continue; }
    b.until = num(b.until);
    b.filedAt = num(b.filedAt);
    b.by = str(b.by, 'checks');
  }
  if (!Array.isArray(c.witnesses)) c.witnesses = [];
  c.witnesses = dropMalformed(c.witnesses, VALID_WITNESS);
  for (const row of c.witnesses) {
    row.filedAt = num(row.filedAt);
    row.staleAt = num(row.staleAt, row.filedAt + COVER_WITNESS.ttlS);
    row.closed = row.closed === true;
    row.gen = row.gen == null ? null : intOr(row.gen, null);
  }
  if (c.witnesses.length > COVER_WITNESS.maxRows) {
    const dropped = c.witnesses.splice(0, c.witnesses.length - COVER_WITNESS.maxRows);
    for (const row of dropped) untagWitnessRow(state, row);
  }
  if (!Array.isArray(c.offers)) c.offers = [];
  c.offers = dropMalformed(c.offers, VALID_OFFER);
  for (const offer of c.offers) {
    offer.costCr = Math.max(0, Math.round(num(offer.costCr)));
    offer.qty = Math.max(0, num(offer.qty));
    offer.postedAt = num(offer.postedAt);
    offer.expiresAt = num(offer.expiresAt, offer.postedAt + COVER_BARGAIN.ttlS);
    offer.state = str(offer.state, 'open');
    if (offer.state !== 'open' && offer.state !== 'taken' && offer.state !== 'expired') offer.state = 'open';
  }
  if (c.offers.length > 12) c.offers.splice(0, c.offers.length - 12);
  if (!Array.isArray(c.paid)) c.paid = [];
  c.paid = dropMalformed(c.paid, VALID_PAID);
  if (c.paid.length > PAID_STAMPS_CAP) c.paid.splice(0, c.paid.length - PAID_STAMPS_CAP);
  if (!Array.isArray(c.log)) c.log = [];
  c.log = dropMalformed(c.log, VALID_LOG);
  for (const row of c.log) { row.at = num(row.at); row.id = str(row.id) || `log:${row.at}`; }
  if (c.log.length > LOG_CAP) c.log.splice(0, c.log.length - LOG_CAP);
  c.seq = intOr(c.seq);
  c.checkSeq = intOr(c.checkSeq);
  // Per-berth visit stamps: the manifest office remembers each berth on its own clock,
  // so hopping A→B→A inside one window cannot re-file or re-fine a stop it already read.
  for (const key of ['seenHotAt', 'papersAt']) {
    const bag = c[key];
    if (!isObj(bag)) { c[key] = {}; continue; }
    for (const sid of Object.keys(bag)) {
      if (typeof sid !== 'string' || !sid || !Number.isFinite(Number(bag[sid]))) delete bag[sid];
      else bag[sid] = num(bag[sid]);
    }
    const ids = Object.keys(bag);
    if (ids.length > COVER_CHECK.visitStampCap) {
      ids.sort((a, b) => (bag[b] - bag[a]) || (a < b ? -1 : a > b ? 1 : 0));
      for (const sid of ids.slice(COVER_CHECK.visitStampCap)) delete bag[sid];
    }
  }
  c.offerStampStation = c.offerStampStation == null ? null : str(c.offerStampStation);
  c.offerStampAt = num(c.offerStampAt, -1e9);
  return c;
}

/** The player's cover against one faction: score, escalation stage, burn state. */
export function coverStandingFor(state, factionId) {
  const c = ensureCoverState(state);
  const rec = c.suspicion[factionId];
  const burned = c.burned[factionId];
  return {
    factionId: factionId || null,
    quality: c.quality,
    score: rec ? rec.score : 0,
    stage: rec ? rec.stage : 0,
    burned: !!burned,
    burnedUntil: burned ? burned.until : 0,
  };
}

/** The live odds of the next check failing — the same read the beat rolls against. */
export function coverCheckChance(state, factionId) {
  const c = ensureCoverState(state);
  const rec = c.suspicion[factionId];
  return checkChance(rec ? rec.score : 0, c.quality, liveWitnessRows(state, c).length, factionId);
}

/** HUD-safe copy of the whole cover book — a snapshot, never the ledger. */
export function coverBoard(state) {
  const c = ensureCoverState(state);
  return {
    quality: c.quality,
    suspicion: Object.keys(c.suspicion).map((factionId) => {
      const r = c.suspicion[factionId];
      return { factionId, score: r.score, stage: r.stage };
    }),
    burned: Object.keys(c.burned).map((factionId) => {
      const b = c.burned[factionId];
      return { factionId, until: b.until, by: b.by };
    }),
    witnesses: c.witnesses.map((r) => ({ ...r })),
    openWitnesses: c.witnesses.filter((r) => r.closed !== true).length,
    offers: c.offers.map((r) => ({ ...r })),
    log: c.log.map((r) => ({ ...r })),
  };
}

/** The NPC-side read: a disguise's grade, how frayed it is, where it stands. */
export function disguiseReadFor(state, entity) {
  const data = entity && entity.data;
  const d = data && data.pirateDisguise;
  if (!d || d.disguised !== true) return null;
  const quality = disguiseQualityOf(state, entity, d);
  return {
    quality,
    band: disguiseBand(quality),
    exposure: num(d.exposure),
    spooked: d.spookAnnounced === true,
    blown: data.disguiseBlown === true,
  };
}

export function disguiseBand(quality) {
  if (quality < COVER_QUALITY.thinBelow) return 'thin';
  if (quality >= COVER_QUALITY.deepFrom) return 'deep';
  return 'standard';
}

/** Deterministic 0–1 grade for a disguise, stamped lazily onto the entity data. */
function disguiseQualityOf(state, entity, disguiseRec) {
  const d = disguiseRec || (entity && entity.data && entity.data.pirateDisguise) || null;
  if (!d) return 0.5;
  if (!Number.isFinite(d.quality) || d.quality < 0 || d.quality > 1) {
    d.quality = frac(seedOf(state), 'pirateDisguiseQuality', entity && entity.id);
  }
  return d.quality;
}

function trueFactionOf(entity) {
  const d = entity && entity.data && entity.data.pirateDisguise;
  return (d && d.trueFactionId) || (entity && entity.factionId) || null;
}

function playerEntity(state) {
  return state && state.entities && typeof state.entities.get === 'function'
    ? state.entities.get(state.playerId) : null;
}

function recordCoverLog(state, cover, entry) {
  cover.seq += 1;
  const row = { id: `cov:${cover.seq.toString(36)}`, at: num(state.simTime), ...entry };
  cover.log.unshift(row);
  if (cover.log.length > LOG_CAP) cover.log.length = LOG_CAP;
  return row;
}

/** A witness row is live while the mouth is alive, unrecycled, and still wearing the tag. */
function witnessRowLive(state, row) {
  if (!row || row.closed === true) return false;
  if (num(state && state.simTime) > num(row.staleAt)) return false;
  if (row.stationId != null) return true; // the manifest office is its own witness
  const entities = state && state.entities;
  const e = entities && typeof entities.get === 'function' ? entities.get(row.entityId) : null;
  if (!e || e.alive === false) return false;
  if (row.gen != null && e.occupantGeneration !== row.gen) return false;
  const tags = e.data && e.data.coverWitness;
  return !!(tags && tags[row.id] === true);
}

function liveWitnessRows(state, cover) {
  return cover.witnesses.filter((row) => !row.closed && witnessRowLive(state, row));
}

let nextLaunderQuote = 0; // Runtime-only tokens never rewind with a saved game.

export const pirateDisguise = {
  name: 'pirateDisguise',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || {};
    this._lastBeatAt = null;
    if (this.state) ensureCoverState(this.state);
    this._onScanPulse = (p) => this._scan(p);
    this._launderQuotes = new Map();
    this._launderContext = null;
    // Anything that ends the berth, the sector, or the save invalidates every open quote.
    this._launderResetEvents = ['dock:undocked', 'sector:exit', 'sector:enter', 'game:new', 'game:newGame', 'game:load', 'save:restoring', 'save:loaded'];
    this._onLaunderReset = () => this._invalidateLaunderQuotes();
    this._onDocked = (p) => this._handleDocked(p);
    this._onLaunderIntent = (p) => this.launderAtDock(p);
    this._onEntityKilled = (p) => this._onKilled(p);
    this._onUndocked = (p) => this._handleUndocked(p);
    this._onSaveLoaded = () => this._handleSaveLoaded();
    if (this.bus && typeof this.bus.on === 'function') {
      this.bus.on('scan:pulse', this._onScanPulse);
      this.bus.on('dock:docked', this._onDocked);
      this.bus.on('dock:launder', this._onLaunderIntent);
      for (const event of this._launderResetEvents) this.bus.on(event, this._onLaunderReset);
      this.bus.on('entity:killed', this._onEntityKilled);
      this.bus.on('dock:undocked', this._onUndocked);
      this.bus.on('save:loaded', this._onSaveLoaded);
    }
  },

  /**
   * The cover book settles on its own half-second beat: suspicion cools, the cover
   * gauge drifts, disguises fray under loitering, checks roll, and pages turn.
   * The beat reads the simTime delta, not delivered dt — a catch-up step this
   * near-clock system is skipped on still counts the time that actually passed.
   */
  update(dt, state) {
    const s = state || this.state;
    if (!s) return;
    const now = num(s.simTime);
    if (!Number.isFinite(this._lastBeatAt)) this._lastBeatAt = now;
    const elapsed = now - this._lastBeatAt;
    if (elapsed < 0) { this._lastBeatAt = now; return; } // a rewound clock reseats, never backfills
    if (elapsed < COVER_TICK.beatS) return;
    this._lastBeatAt = now;
    // Normalize at the beat, not the tick: every read/mutation path re-ensures on
    // entry, so the 60 Hz lane pays nothing between half-second settlements.
    this._coverBeat(s, ensureCoverState(s), Math.min(Math.max(elapsed, 0), COVER_TICK.maxStepS));
  },

  _scan(payload) {
    const state = this.state;
    const pos = payload && payload.pos;
    if (!state || !pos) return;
    const cover = ensureCoverState(state);
    const list = indexedShipLikeScan(state);
    for (const entity of list) {
      if (shouldRevealOnScan(entity, pos)) {
        this._blowCover(state, cover, entity, 'scan');
        continue;
      }
      this._nearMiss(state, entity, pos, payload);
    }
  },

  /**
   * The reveal path, shared by scan hits and cover-side bolts. Filing lands before
   * any event so a synchronous listener can never double the receipts.
   */
  _blowCover(state, cover, entity, by) {
    const reveal = revealPirateDisguise(entity, state, { by });
    if (!reveal) return null;
    const d = (entity.data && entity.data.pirateDisguise) || {};
    const quality = disguiseQualityOf(state, entity, d);
    reveal.quality = quality;
    reveal.band = disguiseBand(quality);
    reveal.exposure = num(d.exposure);
    const actId = `act:${(cover.seq += 1).toString(36)}`;
    const witnesses = this._commitWitnesses(state, cover, entity.pos, 'reveal', actId, entity.id);
    reveal.witnesses = witnesses.length;
    this._speak(entity, reveal);
    this._emit('pirateDisguise:revealed', reveal);
    this._afterReveal(state, cover, entity, reveal, actId, witnesses);
    return reveal;
  },

  /**
   * A pulse that lands inside the spook band but misses the reveal radius: the mark
   * does not blow — it sweats. Exposure is latched per pulse so a replayed pulse
   * cannot stack the file.
   */
  _nearMiss(state, entity, pos, payload) {
    const data = entity && entity.data;
    const d = data && data.pirateDisguise;
    if (!d || d.disguised !== true || data.disguiseBlown === true) return;
    if (entity.alive === false || !entity.pos) return;
    if (!shouldRevealOnScan(entity, pos, COVER_SPOOK.spookRadius)) return;
    const pulseKey = Number.isFinite(payload && payload.seq)
      ? payload.seq
      : Math.floor(num(state.simTime) * 4);
    if (d.lastPulseKey === pulseKey) return;
    d.lastPulseKey = pulseKey;
    disguiseQualityOf(state, entity, d);
    d.exposure = num(d.exposure) + COVER_SPOOK.nearMissExposure;
    this._spookCheck(state, entity, d, 'scan');
  },

  /**
   * Escalation on the NPC side: past the telegraph the mark announces itself once —
   * label, bark, event — and past the bolt line it drops the mask for real.
   */
  _spookCheck(state, entity, d, how) {
    disguiseQualityOf(state, entity, d); // a hand-built or restored mask grades before it sweats
    const spookAt = COVER_SPOOK.spookBase + d.quality * COVER_SPOOK.spookQuality;
    const boltAt = spookAt + COVER_SPOOK.boltAfter;
    if (d.exposure >= boltAt) {
      this._boltOut(state, entity, d, how === 'scan' ? 'spooked' : 'rattled');
      return;
    }
    if (d.exposure >= spookAt && d.spookAnnounced !== true) {
      d.spookAnnounced = true;
      const data = isObj(entity.data) ? entity.data : (entity.data = {});
      const ai = isObj(data.ai) ? data.ai : (data.ai = {});
      ai.spooked = true;
      data.trafficLabel = `Erratic ${d.disguiseLabel || 'Hauler'}`;
      const text = pickLine(SPOOK_LINES, seedOf(state), entity.id);
      this._speak(entity, { situation: 'spooked', text });
      this._emit('pirateDisguise:spooked', {
        entityId: entity.id,
        exposure: num(d.exposure),
        quality: d.quality,
        band: disguiseBand(d.quality),
        by: how,
        text,
      });
    }
  },

  /** A mark past the bolt line drops its own mask — the ambush comes early. */
  _boltOut(state, entity, d, by) {
    const cover = ensureCoverState(state);
    const reveal = this._blowCover(state, cover, entity, by);
    if (reveal) this._emit('pirateDisguise:bolted', { entityId: entity.id, by });
    return reveal;
  },

  /**
   * Witnesses, suspicion and the spotter's tip behind a reveal. Witness rows are
   * already committed by the caller; this files the word and pays the read.
   */
  _afterReveal(state, cover, entity, reveal, actId, witnesses) {
    if (witnesses.length > 0) {
      this._emit('pirateDisguise:witnessFiled', {
        actId,
        kind: 'reveal',
        count: witnesses.length,
        entityId: entity.id,
      });
      const trueFaction = trueFactionOf(entity);
      if (trueFaction) {
        this._fileSuspicion(state, cover, trueFaction,
          reveal.by === 'scan' ? 'outed_witnessed' : 'spooked_outed',
          reveal.by === 'scan' ? COVER_SUSPICION.outedWitnessed : COVER_SUSPICION.spookedOuted);
      }
      // The spotter's tip: one lawful mouth pays once per hull generation.
      if (reveal.by !== 'marked') {
        const tipper = witnesses.find((w) => w.factionId
          && w.factionId !== trueFaction && !OUTLAW_FACTIONS.includes(w.factionId));
        if (tipper) this._payTip(state, cover, entity, reveal, tipper);
      }
    }
  },

  /** One lawful witness pays a spotter's tip — latched per entity id + generation. */
  _payTip(state, cover, entity, reveal, tipper) {
    const gen = entity.occupantGeneration == null ? 0 : entity.occupantGeneration;
    const tipKey = `tip:${entity.id}:${gen}`;
    if (cover.paid.includes(tipKey)) return;
    cover.paid.push(tipKey); // the latch lands before the grant — a replay never re-pays
    if (cover.paid.length > PAID_STAMPS_CAP) cover.paid.splice(0, cover.paid.length - PAID_STAMPS_CAP);
    const amount = COVER_TIP.baseCr + Math.round(num(reveal.quality) * COVER_TIP.qualityCr);
    this._emit('economy:grantCredits', { amount, reason: `cover_tip:${entity.id}` });
    this._emit('faction:repDelta', { factionId: tipper.factionId, delta: COVER_TIP.rep, reason: 'cover_tip' });
    this._emit('pirateDisguise:tipPaid', {
      entityId: entity.id, factionId: tipper.factionId, amount, witnessId: tipper.id,
    });
    recordCoverLog(state, cover, { kind: 'tip_paid', factionId: tipper.factionId, entityId: entity.id, amount });
  },

  /**
   * Collect actors in earshot of the deed, stamp each body with the row's tag, and
   * file rows on the book. Returns the committed rows. Deeds with no live mouths
   * file nothing — the empty lane tells no tales.
   */
  _commitWitnesses(state, cover, pos, kind, actId, excludeId) {
    if (!pos) return [];
    return this._tagWitnesses(state, cover, this._liveWitnessesAt(state, pos, excludeId), kind, actId);
  },

  /** Stamp each body with the row's tag and file rows on the book. */
  _tagWitnesses(state, cover, found, kind, actId) {
    const now = num(state.simTime);
    const rows = [];
    for (const e of found) {
      // One row per act per mouth per kind — a doubled commit never double-files.
      const dup = cover.witnesses.some((r) => r.actId === actId && r.kind === kind
        && r.entityId === e.id && r.closed !== true);
      if (dup) continue;
      cover.seq += 1;
      const row = {
        id: `wit:${cover.seq.toString(36)}`,
        actId,
        kind,
        entityId: e.id,
        gen: e.occupantGeneration == null ? null : e.occupantGeneration,
        factionId: trueFactionOf(e),
        filedAt: now,
        staleAt: now + COVER_WITNESS.ttlS,
        closed: false,
      };
      const data = isObj(e.data) ? e.data : (e.data = {});
      const book = isObj(data.coverWitness) ? data.coverWitness : (data.coverWitness = {});
      book[row.id] = true; // the ownership tag rides the body — a recycled id fails the check
      cover.witnesses.push(row);
      rows.push(row);
    }
    while (cover.witnesses.length > COVER_WITNESS.maxRows) {
      const dropped = cover.witnesses.shift();
      this._untagWitness(state, dropped);
    }
    return rows;
  },

  _untagWitness(state, row) {
    untagWitnessRow(state, row);
  },

  /** File suspicion against a faction's book — score in, quality out, event last. */
  _fileSuspicion(state, cover, factionId, kind, amount) {
    if (!factionId || !(amount > 0)) return null;
    let rec = cover.suspicion[factionId];
    if (!isObj(rec)) {
      const ids = Object.keys(cover.suspicion);
      if (ids.length >= COVER_SUSPICION.bookCap) {
        // The book is bounded — the coldest quiet file gives up its slot.
        let coldest = null;
        for (const fid of ids) {
          const other = cover.suspicion[fid];
          if (isObj(other) && other.stage <= 0 && !cover.burned[fid]
            && (!coldest || other.score < cover.suspicion[coldest].score)) coldest = fid;
        }
        if (!coldest) return null;
        delete cover.suspicion[coldest];
      }
      rec = cover.suspicion[factionId] = { score: 0, stage: 0, lastAt: 0, nextCheckAt: 0, nextFineAt: 0 };
    }
    const now = num(state.simTime);
    rec.score = Math.min(COVER_SUSPICION.maxScore, rec.score + amount);
    rec.lastAt = now;
    cover.quality = Math.max(0, cover.quality - amount * COVER_TICK.qualityHitFrac);
    if (!(rec.nextCheckAt > now)) {
      rec.nextCheckAt = now + COVER_CHECK.periodS * (0.5 + frac(seedOf(state), 'checkJitter', factionId));
    }
    recordCoverLog(state, cover, { kind, factionId, amount, score: rec.score });
    this._emit('pirateDisguise:suspicionFiled', {
      factionId, kind, amount, score: rec.score, stage: rec.stage, quality: cover.quality,
    });
    return rec;
  },

  /**
   * entity:killed — two cover stories. A still-masked pirate cooled before it was
   * outed reads as a murdered civilian: the crew knew better, the skin's faction
   * saw worse. And a filed witness who gets silenced closes its rows, at a price.
   */
  _onKilled(payload) {
    const state = this.state;
    if (!state || !payload) return;
    const cover = ensureCoverState(state);
    const entities = state.entities;
    const victim = entities && typeof entities.get === 'function' ? entities.get(payload.id) : null;
    const pos = payload.pos || (victim && victim.pos) || null;

    // A dead mouth closes its file — whoever pulled the trigger. The charge only
    // sticks when this body provably carried the tale: the row's occupant generation
    // matches (or is unprovable on a fixture), the tale is not stale, and the
    // ownership tag still rides the body. A recycled id's stale rows close too,
    // but a stranger's death files no silencing charge.
    let silenced = false;
    if (victim) {
      const tags = victim.data && victim.data.coverWitness;
      for (const row of cover.witnesses) {
        if (row.entityId === victim.id && row.closed !== true) {
          if ((row.gen == null || row.gen === victim.occupantGeneration)
            && num(state.simTime) <= num(row.staleAt)
            && isObj(tags) && tags[row.id] === true) silenced = true;
          row.closed = true;
          this._untagWitness(state, row);
        }
      }
    }

    const isPlayerKill = payload.killerId != null && payload.killerId === state.playerId;
    if (!victim || !isPlayerKill) return;

    const data = victim.data || {};
    const d = data.pirateDisguise;
    const masked = !!(d && d.disguised === true && data.disguiseBlown !== true);
    if (!masked && !silenced) return;

    // Silencing and masked kills only stick when another live mouth carries them.
    const witnesses = pos ? this._liveWitnessesAt(state, pos, victim.id) : [];
    const actId = `act:${(cover.seq += 1).toString(36)}`;
    if (silenced && witnesses.length > 0) {
      const rows = this._tagWitnesses(state, cover, witnesses, 'silencing', actId);
      this._fileSuspicion(state, cover, trueFactionOf(victim), 'witness_silenced', COVER_SUSPICION.witnessSilenced);
      this._emit('pirateDisguise:witnessFiled', { actId, kind: 'silencing', count: rows.length, entityId: victim.id });
    }
    if (masked && witnesses.length > 0) {
      // The corpse keeps its mask, so nothing in the skin dedupes a doubled kill
      // receipt (a second emitter, a re-entrant emit, a replayed bus). Stamp the
      // book the way the spotter tip latches — once per hull generation — before
      // any word is filed or event is emitted.
      const gen = victim.occupantGeneration == null ? 0 : victim.occupantGeneration;
      const killKey = `cover_kill:${victim.id}:${gen}`;
      if (cover.paid.includes(killKey)) return;
      cover.paid.push(killKey);
      if (cover.paid.length > PAID_STAMPS_CAP) cover.paid.splice(0, cover.paid.length - PAID_STAMPS_CAP);
      const rows = this._tagWitnesses(state, cover, witnesses, 'masked_kill', actId);
      this._emit('pirateDisguise:witnessFiled', { actId, kind: 'masked_kill', count: rows.length, entityId: victim.id });
      const trueFaction = d.trueFactionId || TRUE_FACTION;
      this._fileSuspicion(state, cover, trueFaction, 'masked_kill', COVER_SUSPICION.maskedKill);
      const skinFaction = victim.factionId;
      if (skinFaction && skinFaction !== trueFaction) {
        this._fileSuspicion(state, cover, skinFaction, 'civilian_kill', COVER_SUSPICION.maskedKillSkin);
      }
    }
  },

  /** Live actors in earshot of a position — the mouths that would carry a deed. */
  _liveWitnessesAt(state, pos, excludeId) {
    const r2 = COVER_WITNESS.radius * COVER_WITNESS.radius;
    const out = [];
    forEachLivingWorldActor(state, (e) => {
      if (!e || e.id == null || e.id === excludeId || e.id === state.playerId) return;
      if (e.type === 'wreck' || !e.pos) return;
      if (dist2(e.pos, pos) <= r2) out.push(e);
    });
    return out;
  },

  /** Papers are an explicit, per-pod service. Dock/open/quote never charges. */
  _invalidateLaunderQuotes() {
    this._launderQuotes?.clear();
    this._launderContext = null;
  },

  _launderBerth(stationId) {
    const state = this.state;
    const player = state?.entities?.get(state.playerId);
    const station = stationRecordById(stationId);
    if (!player?.alive || state.mode !== 'flight' || state.ui?.docked !== true
        || state.ui.dockedStationId !== stationId) return { reason: 'not_docked' };
    if (!station || !canLaunderSalvageAtStation(station)) return { reason: 'unavailable' };
    if (stationId === TETHYS_BLACK_MARKET_RUN.stationId && !hasTethysBlackMarketAccess(state)) {
      return { reason: 'black_market_locked' };
    }
    const berth = (state.entityIndex?.stations || state.entityList || []).find(e =>
      e?.alive && e.type === 'station' && e.data?.stationId === stationId
      && state.entities.get(e.id) === e);
    if (!berth || occupantGenerationOf(berth) == null || occupantGenerationOf(player) == null) return { reason: 'station_changed' };
    return { player, station, berth };
  },

  launderAtDock(payload = {}) {
    const state = this.state;
    const { action, contextId, requestId, stationId } = payload;
    if (action === 'close') {
      if (contextId === this._launderContext) this._invalidateLaunderQuotes();
      return null;
    }
    if (action !== 'quote' && action !== 'confirm') return null;
    const reply = { stationId, contextId, requestId };
    const fail = (reason, extra) => {
      const denial = { ...reply, accepted: false, reason, source: 'pirateDisguise', ...extra };
      this._emit(action === 'quote' ? 'cargo:launderQuoted' : 'cargo:laundered', denial);
      return denial;
    };
    if (typeof contextId !== 'string' || !contextId || contextId.length > 120
        || typeof requestId !== 'string' || !requestId || requestId.length > 120) return fail('invalid_request');
    const current = this._launderBerth(stationId);
    if (current.reason) { this._invalidateLaunderQuotes(); return fail(current.reason); }
    const { player, station, berth } = current;
    const factionId = station.factionId || 'faction_quiet';
    const reputation = Number.isFinite(state.factions?.[factionId]?.rep) ? state.factions[factionId].rep : 0;
    const cutFrac = launderCutFrac(reputation);
    const cover = ensureCoverState(state);
    // A burned file at this faction reprices the wash; the quote and the confirm read the same flag.
    const flagged = isObj(cover.burned[factionId]) && num(state.simTime) < num(cover.burned[factionId].until);
    const cutFor = (pod) => {
      const base = launderCutCredits(pod.data.commodityId, pod.data.amount, reputation);
      return flagged ? Math.ceil(base * COVER_BURN.flaggedCutMult) : base;
    };
    if (action === 'quote') {
      this._invalidateLaunderQuotes();
      this._launderContext = contextId;
      const quotes = [];
      const nearby = nearbyHotPods(state, player.pos, LAUNDER_DOCK_RANGE).sort((a,b) => Math.hypot(a.pos.x-player.pos.x,a.pos.z-player.pos.z)-Math.hypot(b.pos.x-player.pos.x,b.pos.z-player.pos.z));
      for (const pod of nearby.slice(0, 32)) {
        if (state.entities.get(pod.id) !== pod || occupantGenerationOf(pod) == null) continue;
        const cut = cutFor(pod);
        const quoteId = `papers:${++nextLaunderQuote}`;
        this._launderQuotes.set(quoteId, {
          player, playerGeneration: occupantGenerationOf(player),
          pod, podGeneration: occupantGenerationOf(pod), berth, berthGeneration: occupantGenerationOf(berth),
          sectorId: state.world?.currentSectorId, enterSerial: state.world?.enterSerial,
          stationId, contextId, fingerprint: launderFingerprint(pod), cut, cutFrac, reputation,
        });
        const identity = cargoIdentityOf(pod);
        quotes.push({ quoteId, podId: pod.id, commodityId: pod.data.commodityId,
          amount: pod.data.amount, ownerId: pod.data.ownerId ?? null,
          ownerName: identity?.ownerName ?? null,
          label: pod.data.cargoIdentity?.label || pod.data.label || pod.name || null,
          factionId: pod.data.factionId || pod.data.cargoIdentity?.factionId || null,
          distance: Math.round(Math.hypot(pod.pos.x-player.pos.x,pod.pos.z-player.pos.z)), cut, cutFrac, flagged,
          affordable: Number(state.player.credits) >= cut });
      }
      const result = { ...reply, accepted: true, quotes, truncated: nearby.length > quotes.length, range: LAUNDER_DOCK_RANGE };
      this._emit('cargo:launderQuoted', result);
      return result;
    }
    const quote = this._launderQuotes.get(payload.quoteId);
    // Consume before validation/dispatch. No denial or repeated event can charge this quote later.
    this._launderQuotes.delete(payload.quoteId);
    if (!quote || quote.contextId !== contextId || this._launderContext !== contextId) return fail('stale_quote');
    const pod = quote.pod;
    if (quote.stationId !== stationId || quote.player !== player || quote.berth !== berth
        || quote.playerGeneration !== occupantGenerationOf(player) || quote.berthGeneration !== occupantGenerationOf(berth)
        || state.entities.get(pod.id) !== pod || quote.podGeneration !== occupantGenerationOf(pod)
        || quote.sectorId !== state.world?.currentSectorId || quote.enterSerial !== state.world?.enterSerial
        || !isJettisonedCargoPod(pod) || pod.data.laundered
        || !isHotLaunderCargo(pod.data.commodityId, pod.data.legality)
        || launderFingerprint(pod) !== quote.fingerprint) return fail('cargo_changed');
    if (!finiteLaunderPoint(player.pos) || !finiteLaunderPoint(pod.pos)
        || Math.hypot(pod.pos.x-player.pos.x, pod.pos.z-player.pos.z) > LAUNDER_DOCK_RANGE) return fail('out_of_range');
    const cut = cutFor(pod);
    if (cut !== quote.cut || cutFrac !== quote.cutFrac || reputation !== quote.reputation) return fail('price_changed');
    const credits = Math.max(0, Math.floor(Number(state.player.credits) || 0));
    if (credits < cut) {
      // A short wash says the cut and what the pocket holds, and leaves the pod hot.
      const denial = fail('short', { factionId, cut, credits, reputation });
      this._emit('toast', {
        text: `Papers refused — the cut is ${cut} cr and you are holding ${credits}.`,
        kind: 'warn',
        ttl: 3,
      });
      return denial;
    }
    let stamped, entry, coverRestored = 0;
    const payment = { amount: cut, reason: 'launder:cut', requireFull: true, expectedCredits: credits, result: false,
      commit: () => {
        stamped = [{ podId: pod.id, ...applyLaunderStamp(pod.data, stationId) }];
        entry = recordLaunderLedger(state, { stationId, factionId, cut, cutFrac, reputation, pods: stamped });
        // The wash is also a small cover repair — fresh paper reads fresh.
        coverRestored = Math.min(COVER_QUALITY.launderRestore, COVER_QUALITY.max - cover.quality);
        cover.quality = Math.min(COVER_QUALITY.max, cover.quality + coverRestored);
        return true;
      },
    };
    this._emit('economy:chargeCredits', payment);
    if (payment.result !== true) return fail('payment_unavailable');
    const receipt = { ...reply, accepted: true, source: 'pirateDisguise', stationId,
      factionId, cut, cutFrac, reputation, podIds: [pod.id], pods: stamped,
      receiptId: entry.receiptId, seenAt: entry.seenAt, coverRestored, flagged: flagged === true };
    recordCoverLog(state, cover, { kind: 'laundered', factionId, stationId, cut });
    this._emit('cargo:laundered', receipt);
    this._emit('toast', { text: `Papers washed — cut ${cut} cr`, kind: 'pirateDisguise', ttl: 2 });
    return receipt;
  },

  /**
   * dock:docked — never washes or charges (papers are the explicit dock:launder service):
   * it drops any quote left from a previous berth, then the cover book works the berth:
   * an outlaw port posts fixer offers; a lawful berth reads your papers and files the hot
   * hold it can smell.
   */
  _handleDocked(payload) {
    this._invalidateLaunderQuotes();
    this._dockCoverPass(payload);
  },

  _dockCoverPass(payload) {
    const state = this.state;
    if (!state || !payload) return;
    const cover = ensureCoverState(state);
    const stationId = payload.stationId
      || (payload.station && payload.station.id)
      || null;
    const station = (payload.station && typeof payload.station === 'object')
      ? payload.station
      : (stationRecordById(stationId) || { id: stationId, factionId: payload.factionId });
    const outlaw = canLaunderSalvageAtStation(station) || canLaunderSalvageAtStation(stationId);
    if (outlaw) {
      // A locked berth keeps its fixer quiet too — the wash gate and the book gate agree.
      const stationKey = station.id || stationId;
      if (stationKey !== TETHYS_BLACK_MARKET_RUN.stationId || hasTethysBlackMarketAccess(state)) {
        this._offerBargains(state, cover, stationId, station.factionId || QUIET_FACTION);
      }
      return;
    }
    // A lawful berth: the manifest office reads the hold it can smell.
    const player = state.player;
    if (!player || !stationId) return;
    const origin = launderOrigin(state);
    const factionId = station.factionId || payload.factionId || null;
    if (!factionId || !origin) return;
    const pods = nearbyHotPods(state, origin, LAUNDER_DOCK_RANGE);
    const now = num(state.simTime);
    if (pods.length > 0) {
      // One filing per berth per visit window — a berth-hopping dock cannot re-file
      // a stop the office already read inside the gap.
      if (now - num(cover.seenHotAt[stationId], -1e9) >= COVER_CHECK.dockPapersGapS) {
        cover.seenHotAt[stationId] = now;
        const actId = `act:${(cover.seq += 1).toString(36)}`;
        cover.witnesses.push({
          id: `wit:${(cover.seq += 1).toString(36)}`,
          actId, kind: 'seen_hot', stationId, entityId: null, gen: null,
          factionId, filedAt: now, staleAt: now + COVER_WITNESS.ttlS, closed: false,
        });
        if (cover.witnesses.length > COVER_WITNESS.maxRows) {
          const dropped = cover.witnesses.splice(0, cover.witnesses.length - COVER_WITNESS.maxRows);
          for (const row of dropped) this._untagWitness(state, row);
        }
        this._emit('pirateDisguise:witnessFiled', { actId, kind: 'seen_hot', count: 1, stationId });
        this._fileSuspicion(state, cover, factionId, 'seen_hot', COVER_SUSPICION.seenHot);
      }
    }
    this._papersCheck(state, cover, stationId, factionId);
  },

  /**
   * The manifest office's read: while the berth's file on you is hot, docking runs
   * a deterministic papers check — once per visit window — and a failed read is a
   * fine, not a sermon.
   */
  _papersCheck(state, cover, stationId, factionId) {
    const rec = cover.suspicion[factionId];
    if (!isObj(rec) || rec.score < profileFor(factionId).warnAt) return;
    const now = num(state.simTime);
    // One read per berth per visit window — the latch lands before the roll so a
    // doubled dock, or a berth-hop back inside the gap, never double-fines.
    if (now - num(cover.papersAt[stationId], -1e9) < COVER_CHECK.dockPapersGapS) return;
    cover.papersAt[stationId] = now;
    const roll = frac(seedOf(state), 'papersCheck', factionId, cover.checkSeq);
    cover.checkSeq += 1;
    const live = liveWitnessRows(state, cover).length;
    const p = checkChance(rec.score, cover.quality, live, factionId);
    if (roll >= p) {
      this._emit('toast', {
        text: `${profileFor(factionId).label} manifest office waves you through.`,
        kind: 'pirateDisguise', ttl: 3,
      });
      return;
    }
    const fineCr = COVER_CHECK.fineBaseCr + Math.round(rec.score * COVER_CHECK.finePerPointCr);
    this._emit('economy:chargeCredits', { amount: fineCr, reason: `cover_fine:${factionId}` });
    this._emit('pirateDisguise:papersFined', { stationId, factionId, fineCr, score: rec.score });
    this._emit('toast', {
      text: `Papers flagged — ${profileFor(factionId).label} fines you ${fineCr} cr.`,
      kind: 'warn', ttl: 4,
    });
    recordCoverLog(state, cover, { kind: 'papers_fined', factionId, stationId, amount: fineCr });
  },

  /**
   * An outlaw berth answers a hot book with the fixer's menu. Offers post once per
   * visit — a spammed dock:docked cannot stack the board.
   */
  _offerBargains(state, cover, stationId, portFaction) {
    if (!stationId) return [];
    const now = num(state.simTime);
    if (cover.offerStampStation === stationId && now - cover.offerStampAt < COVER_BARGAIN.repostGapS) {
      return cover.offers.filter((o) => o.state === 'open');
    }
    cover.offerStampStation = stationId;
    cover.offerStampAt = now;
    const posted = [];
    const post = (kind, factionId, costCr, qty) => {
      if (posted.length >= COVER_BARGAIN.maxPosted) return null;
      const dup = cover.offers.some((o) => o.state === 'open' && o.kind === kind
        && o.stationId === stationId && (o.factionId || null) === (factionId || null));
      if (dup) return null;
      cover.seq += 1;
      const offer = {
        id: `bg:${cover.seq.toString(36)}`,
        kind, stationId, factionId: factionId || null,
        costCr: Math.max(1, Math.round(costCr)),
        qty: Math.max(1, Math.round(qty)),
        postedAt: now,
        expiresAt: now + COVER_BARGAIN.ttlS,
        state: 'open',
      };
      cover.offers.push(offer);
      posted.push(offer);
      this._emit('pirateDisguise:bargainOffered', {
        offerId: offer.id, kind, stationId, factionId: factionId || null, costCr: offer.costCr,
      });
      return offer;
    };

    const deficit = COVER_QUALITY.max - cover.quality;
    if (deficit >= 5) {
      post('new_papers', portFaction,
        COVER_BARGAIN.newPapersBaseCr + deficit * COVER_BARGAIN.newPapersPerDeficitCr,
        Math.min(COVER_BARGAIN.newPapersAmount, deficit));
    }
    const live = liveWitnessRows(state, cover).filter((r) => r.entityId != null);
    if (live.length >= 2) {
      post('hush_witness', portFaction,
        COVER_BARGAIN.hushBaseCr + Math.min(live.length, COVER_BARGAIN.hushMaxRows) * COVER_BARGAIN.hushPerRowCr,
        Math.min(live.length, COVER_BARGAIN.hushMaxRows));
    }
    let hottest = null;
    for (const fid of Object.keys(cover.suspicion)) {
      const rec = cover.suspicion[fid];
      if (isObj(rec) && rec.score >= COVER_BARGAIN.minOfferScore
        && (!hottest || rec.score > cover.suspicion[hottest].score)) hottest = fid;
    }
    if (hottest) {
      const rec = cover.suspicion[hottest];
      post('burn_record', hottest,
        COVER_BARGAIN.burnRecordBaseCr + rec.score * COVER_BARGAIN.burnRecordPerPointCr,
        rec.score);
    }
    const burnedIds = Object.keys(cover.burned);
    if (burnedIds.length > 0) {
      const fid = burnedIds[0];
      const left = Math.max(0, cover.burned[fid].until - now);
      post('cool_marks', fid,
        COVER_BARGAIN.coolMarkBaseCr + left * COVER_BARGAIN.coolMarkPerSecondCr, left);
    }
    if (posted.length > 0) {
      this._emit('toast', { text: BARGAIN_TOAST, kind: 'pirateDisguise', ttl: 3 });
    }
    return posted;
  },

  /** Post a bargain offer directly — the fixer's menu is also a public verb. */
  offerCoverBargain(state, spec) {
    if (!state || !spec || !BARGAIN_KINDS.includes(spec.kind)) return null;
    const cover = ensureCoverState(state);
    const now = num(state.simTime);
    cover.seq += 1;
    // A caller-chosen id only stands when it names no existing offer — a collision
    // would leave one of the pair unreachable by takeBargain's id lookup.
    const wantedId = str(spec.id);
    const offer = {
      id: (wantedId && !cover.offers.some((o) => o.id === wantedId)) ? wantedId : `bg:${cover.seq.toString(36)}`,
      kind: spec.kind,
      stationId: spec.stationId || null,
      factionId: spec.factionId || null,
      costCr: Math.max(1, Math.round(num(spec.costCr, 100))),
      qty: Math.max(1, Math.round(num(spec.qty, 1))),
      postedAt: now,
      expiresAt: Number.isFinite(spec.expiresAt) ? spec.expiresAt : now + COVER_BARGAIN.ttlS,
      state: 'open',
    };
    cover.offers.push(offer);
    this._emit('pirateDisguise:bargainOffered', {
      offerId: offer.id, kind: offer.kind, stationId: offer.stationId,
      factionId: offer.factionId, costCr: offer.costCr,
    });
    return offer;
  },

  /**
   * Take a posted bargain. The latch lands before the charge — a replayed take,
   * a re-emitted event, or a restored save can never bill twice.
   */
  takeBargain(state, offerId) {
    if (!state || offerId == null) return null;
    const cover = ensureCoverState(state);
    const offer = cover.offers.find((o) => o.id === offerId);
    if (!offer || offer.state !== 'open') return null;
    const now = num(state.simTime);
    if (now > offer.expiresAt) {
      offer.state = 'expired';
      const denial = { accepted: false, reason: 'expired', offerId };
      this._emit('pirateDisguise:bargain', denial);
      return denial;
    }
    const player = state.player;
    const credits = Math.max(0, Math.floor(Number(player && player.credits) || 0));
    if (offer.costCr > 0 && credits < offer.costCr) {
      const denial = { accepted: false, reason: 'short', offerId, costCr: offer.costCr, credits };
      this._emit('pirateDisguise:bargain', denial);
      return denial;
    }
    if (cover.paid.includes(offer.id)) return { accepted: false, reason: 'already_paid', offerId };
    offer.state = 'taken';            // the latch lands first — re-entrancy bills nothing twice
    offer.takenAt = now;
    cover.paid.push(offer.id);
    if (cover.paid.length > PAID_STAMPS_CAP) cover.paid.splice(0, cover.paid.length - PAID_STAMPS_CAP);
    if (offer.costCr > 0) {
      this._emit('economy:chargeCredits', { amount: offer.costCr, reason: `cover_bargain:${offer.id}` });
    }
    const effect = this._bargainEffect(state, cover, offer);
    const receipt = {
      accepted: true,
      offerId: offer.id,
      kind: offer.kind,
      factionId: offer.factionId,
      costCr: offer.costCr,
      effect,
    };
    recordCoverLog(state, cover, { kind: `bargain_${offer.kind}`, factionId: offer.factionId, amount: offer.costCr });
    this._emit('pirateDisguise:bargain', receipt);
    this._emit('toast', { text: effect.toast, kind: 'pirateDisguise', ttl: 3 });
    return receipt;
  },

  _bargainEffect(state, cover, offer) {
    const now = num(state.simTime);
    switch (offer.kind) {
      case 'new_papers': {
        cover.quality = Math.min(COVER_QUALITY.max, cover.quality + offer.qty);
        return { kind: offer.kind, quality: cover.quality, toast: `New papers — the cover reads ${Math.round(cover.quality)}.` };
      }
      case 'burn_record': {
        const rec = cover.suspicion[offer.factionId];
        if (isObj(rec)) {
          rec.score = Math.max(0, rec.score * COVER_BARGAIN.burnKeepFrac);
          rec.stage = 0;
          rec.nextCheckAt = now + COVER_CHECK.periodS;
        }
        return { kind: offer.kind, factionId: offer.factionId, toast: 'The record burns — the file goes thin.' };
      }
      case 'hush_witness': {
        let hushed = 0;
        for (const row of cover.witnesses) {
          if (hushed >= offer.qty) break;
          if (row.closed || row.entityId == null || !witnessRowLive(state, row)) continue;
          row.closed = true;
          this._untagWitness(state, row);
          hushed += 1;
        }
        return { kind: offer.kind, hushed, toast: `Mouths shut — ${hushed} file${hushed === 1 ? '' : 's'} closed.` };
      }
      case 'cool_marks': {
        const burned = cover.burned[offer.factionId];
        if (isObj(burned)) {
          delete cover.burned[offer.factionId];
          const rec = cover.suspicion[offer.factionId];
          if (isObj(rec)) rec.stage = 0;
          this._emit('pirateDisguise:coverCooled', { factionId: offer.factionId, by: 'bargain' });
        }
        return { kind: offer.kind, factionId: offer.factionId, toast: 'The mark cools — your face fades off their board.' };
      }
      default:
        return { kind: offer.kind, toast: 'The fixer shrugs.' };
    }
  },

  /**
   * The half-second book beat: suspicion cools, the cover drifts, disguises fray
   * under a loitering hull, burned marks turn their page, and hot files re-check.
   */
  _coverBeat(state, cover, step) {
    const now = num(state.simTime);

    // Word of mouth cools on its own clock; quiet stretches let the cover breathe.
    let maxScore = 0;
    for (const fid of Object.keys(cover.suspicion)) {
      const rec = cover.suspicion[fid];
      if (!isObj(rec)) continue;
      if (rec.score > 0) rec.score = Math.max(0, rec.score - COVER_TICK.suspicionCoolPerS * step);
      if (rec.score > maxScore) maxScore = rec.score;
    }
    if (maxScore <= 0 && cover.quality < COVER_QUALITY.max) {
      cover.quality = Math.min(COVER_QUALITY.max, cover.quality + COVER_TICK.qualityHealPerS * step);
    }

    // Witness rows prune: a dead or recycled mouth, or a tale gone stale, closes.
    for (let i = cover.witnesses.length - 1; i >= 0; i--) {
      const row = cover.witnesses[i];
      if (row.closed || !witnessRowLive(state, row)) {
        this._untagWitness(state, row);
        cover.witnesses.splice(i, 1);
      }
    }

    // Offers go stale on their own clock.
    for (const offer of cover.offers) {
      if (offer.state === 'open' && now > offer.expiresAt) offer.state = 'expired';
    }

    // Burned pages turn — the consequence was persistent, not permanent.
    for (const fid of Object.keys(cover.burned)) {
      const b = cover.burned[fid];
      if (!isObj(b) || now >= b.until) {
        delete cover.burned[fid];
        const rec = cover.suspicion[fid];
        if (isObj(rec)) rec.stage = 0;
        recordCoverLog(state, cover, { kind: 'page_turned', factionId: fid });
        this._emit('pirateDisguise:coverCooled', { factionId: fid, by: 'time' });
        this._emit('comms:log', {
          text: pickLine(COOLED_LINES, seedOf(state), `cool:${fid}`).replace('{faction}', profileFor(fid).label),
          speaker: 'The wire',
        });
      }
    }

    // Each hot faction re-reads your file on its own beat.
    const live = liveWitnessRows(state, cover).length;
    for (const fid of Object.keys(cover.suspicion)) {
      const rec = cover.suspicion[fid];
      if (!isObj(rec) || rec.score < profileFor(fid).warnAt) continue;
      if (now < num(rec.nextCheckAt)) continue;
      rec.nextCheckAt = now + COVER_CHECK.periodS; // the next read is scheduled before the roll
      const roll = frac(seedOf(state), 'coverCheck', fid, cover.checkSeq);
      cover.checkSeq += 1;
      if (roll < checkChance(rec.score, cover.quality, live, fid)) {
        this._escalateCover(state, cover, fid, rec, now);
      }
    }

    this._frayWalk(state, cover, step);
  },

  /**
   * A failed read moves the file one stage up: the warning, the fine that keeps
   * landing while the score stays hot, then the burn. Each stage latches before
   * its events so a re-entrant listener cannot double the bill.
   */
  _escalateCover(state, cover, factionId, rec, now) {
    const profile = profileFor(factionId);
    // Burn line: a file this hot does not get another fine — it gets the torch.
    const burnLine = profile.warnAt + profile.checkSpread;
    if (rec.score >= burnLine && rec.stage < 3) {
      rec.stage = 3;
      cover.burned[factionId] = { until: now + COVER_BURN.windowS, filedAt: now, by: 'checks' };
      this._emit('faction:repDelta', { factionId, delta: COVER_CHECK.burnRep, reason: 'cover_burned' });
      this._emit('pirateDisguise:coverBurned', { factionId, score: rec.score, stage: 3, until: cover.burned[factionId].until });
      this._emit('comms:log', {
        text: pickLine(BURN_LINES, seedOf(state), `burn:${factionId}`).replace('{faction}', profile.label),
        speaker: 'The wire',
      });
      recordCoverLog(state, cover, { kind: 'cover_burned', factionId, score: rec.score });
      return;
    }
    if (rec.stage === 3) {
      // The burn is already paid for; a hot file merely extends the mark's clock.
      const burned = cover.burned[factionId];
      if (isObj(burned)) burned.until = Math.max(burned.until, now + COVER_BURN.windowS * 0.5);
      return;
    }
    if (rec.stage === 0) {
      rec.stage = 1;
      this._emit('faction:repDelta', { factionId, delta: COVER_CHECK.warnRep, reason: 'cover_warned' });
      this._emit('pirateDisguise:coverWarned', { factionId, score: rec.score, stage: 1 });
      this._emit('comms:log', {
        text: pickLine(WARN_LINES, seedOf(state), `warn:${factionId}`).replace('{faction}', profile.label),
        speaker: 'The wire',
      });
      recordCoverLog(state, cover, { kind: 'cover_warned', factionId, score: rec.score });
      return;
    }
    // Stage 1 or 2: every failed read is another fine while the score stays hot.
    rec.stage = 2;
    const fineCr = COVER_CHECK.fineBaseCr + Math.round(rec.score * COVER_CHECK.finePerPointCr);
    this._emit('economy:chargeCredits', { amount: fineCr, reason: `cover_fine:${factionId}` });
    this._emit('faction:repDelta', { factionId, delta: COVER_CHECK.fineRep, reason: 'cover_fined' });
    this._emit('pirateDisguise:coverFined', { factionId, score: rec.score, fineCr, stage: 2 });
    this._emit('toast', {
      text: `${profile.label} flagged your papers — ${fineCr} cr.`,
      kind: 'warn', ttl: 4,
    });
    recordCoverLog(state, cover, { kind: 'cover_fined', factionId, amount: fineCr, score: rec.score });
  },

  /**
   * The proximity walk: a pilot who loiters inside the fray ring frays a disguise
   * without ever scanning; a burned Reach mark drops the mask on sight. One pass
   * over the ship-like index per beat — the same walk the scanner does per pulse.
   */
  _frayWalk(state, cover, step) {
    const player = playerEntity(state);
    if (!player || !player.pos) return;
    const frayR2 = COVER_SPOOK.frayRadius * COVER_SPOOK.frayRadius;
    const markR2 = COVER_BURN.markAmbushR * COVER_BURN.markAmbushR;
    const reachBurned = isObj(cover.burned[TRUE_FACTION])
      && num(state.simTime) < num(cover.burned[TRUE_FACTION].until);
    const list = indexedShipLikeScan(state);
    for (const entity of list) {
      const data = entity && entity.data;
      const d = data && data.pirateDisguise;
      if (!d || d.disguised !== true || data.disguiseBlown === true) continue;
      if (entity.alive === false || !entity.pos) continue;
      const dd = dist2(entity.pos, player.pos);
      if (reachBurned && d.trueFactionId === TRUE_FACTION && dd <= markR2) {
        this._boltOut(state, entity, d, 'marked');
        continue;
      }
      if (dd <= frayR2) {
        disguiseQualityOf(state, entity, d);
        d.exposure = num(d.exposure) + COVER_SPOOK.frayPerS * step;
        this._spookCheck(state, entity, d, 'proximity');
      } else if (d.exposure > 0) {
        d.exposure = Math.max(0, d.exposure - COVER_SPOOK.coolPerS * step);
      }
    }
  },

  _handleUndocked() {
    const state = this.state;
    if (!state) return;
    const cover = ensureCoverState(state);
    const graceEnd = num(state.simTime) + COVER_BARGAIN.undockGraceS;
    for (const offer of cover.offers) {
      if (offer.state === 'open' && offer.expiresAt > graceEnd) offer.expiresAt = graceEnd;
    }
  },

  /**
   * save:loaded — the book re-normalizes in place. Every latch is durable JSON and
   * every live ref re-validates on read, so a restore buys no free progress and
   * loses no filed word.
   */
  _handleSaveLoaded() {
    if (!this.state) return;
    this._lastBeatAt = null; // the clock restarts — no beat backlog dumps on restore
    ensureCoverState(this.state);
  },

  _speak(entity, reveal) {
    const voice = this.helpers && this.helpers.voice;
    if (voice && typeof voice.say === 'function') {
      voice.say({
        channel: 'bark',
        text: reveal.text,
        kind: 'pirateDisguise',
        // ttl is the queue stale-drop deadline as well as the floor hold — 1 s expired under
        // the 1.5 s bark gap, so the reveal never spoke when it mattered (a fight just ended).
        ttl: 3,
        id: `pirateDisguise:${entity.id}`,
        factionId: entity.factionId,
      });
    } else {
      this._emit('toast', { text: reveal.text, kind: 'pirateDisguise', ttl: 3 });
    }
    this._emit('pirateDisguise:voice', {
      entityId: entity.id,
      situation: reveal.situation,
      text: reveal.text,
      factionId: entity.factionId,
    });
  },

  _emit(evt, payload) {
    if (this.bus && typeof this.bus.emit === 'function') this.bus.emit(evt, payload);
  },

  destroy() {
    if (this.bus && typeof this.bus.off === 'function') {
      if (this._onScanPulse) this.bus.off('scan:pulse', this._onScanPulse);
      if (this._onDocked) this.bus.off('dock:docked', this._onDocked);
      if (this._onLaunderIntent) this.bus.off('dock:launder', this._onLaunderIntent);
      for (const event of this._launderResetEvents || []) this.bus.off(event, this._onLaunderReset);
      if (this._onEntityKilled) this.bus.off('entity:killed', this._onEntityKilled);
      if (this._onUndocked) this.bus.off('dock:undocked', this._onUndocked);
      if (this._onSaveLoaded) this.bus.off('save:loaded', this._onSaveLoaded);
    }
    this._invalidateLaunderQuotes();
    this._onScanPulse = null;
    this._onDocked = null;
    this._onLaunderReset = null;
    this._onLaunderIntent = null;
    this._onEntityKilled = null;
    this._onUndocked = null;
    this._onSaveLoaded = null;
  },
};

function finiteLaunderPoint(pos) {
  return !!pos && Number.isFinite(pos.x) && Number.isFinite(pos.z);
}

function launderFingerprint(pod) {
  const data = pod.data;
  return JSON.stringify([cargoIdentityOf(pod), pod.name, data.commodityId, data.amount, data.legality, data.laundered,
    data.ownerId, data.ownerName, data.label, data.factionId, data.ownership, data.cargoIdentity, data.salvagePool]);
}

/**
 * The deterministic read a faction's check rolls against: score over the warn line,
 * discounted by a clean cover and by how many mouths still carry the word.
 */
function checkChance(score, quality, liveWitnessCount, factionId) {
  const profile = profileFor(factionId);
  const over = Math.max(0, num(score) - profile.warnAt);
  let p = COVER_CHECK.base + over * COVER_CHECK.perPoint;
  p *= COVER_CHECK.qualityFloorMult + (1 - COVER_CHECK.qualityFloorMult) * (1 - Math.max(0, Math.min(100, num(quality, 100))) / 100);
  p *= Math.min(1, COVER_WITNESS.baseMult + liveWitnessCount * COVER_WITNESS.perRowMult);
  return Math.min(COVER_CHECK.cap, Math.max(0, p));
}

function launderOrigin(state) {
  const entity = state && state.entities && typeof state.entities.get === 'function'
    ? state.entities.get(state.playerId)
    : null;
  if (entity && entity.pos) return entity.pos;
  return null;
}

function nearbyHotPods(state, origin, range) {
  if (!finiteLaunderPoint(origin)) return [];
  const list = indexedTypeScan(state, 'payloads');
  const reach = Number(range);
  const reach2 = reach * reach;
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const entity = list[i];
    if (!isJettisonedCargoPod(entity) || !finiteLaunderPoint(entity.pos) || !entity.data
        || !Number.isSafeInteger(entity.data.amount) || entity.data.amount <= 0) continue;
    if (entity.data.laundered) continue;
    if (!isHotLaunderCargo(entity.data.commodityId, entity.data.legality)) continue;
    const dx = (entity.pos.x || 0) - (origin.x || 0);
    const dz = (entity.pos.z || 0) - (origin.z || 0);
    if (dx * dx + dz * dz > reach2) continue;
    out.push(entity);
  }
  return out;
}

function recordLaunderLedger(state, spec) {
  const player = state.player;
  if (!Array.isArray(player.launderLedger)) player.launderLedger = [];
  const ledger = player.launderLedger;
  const seed = (Number(state.meta && state.meta.seed) >>> 0) || 1;
  // The ledger truncates to a fixed cap, so its length is not a sequence — carry the max seq forward.
  let seq = 0;
  for (let i = 0; i < ledger.length; i++) seq = Math.max(seq, Number(ledger[i] && ledger[i].seq) || 0);
  seq += 1;
  const entry = {
    receiptId: `launder:${seed.toString(36)}:${seq.toString(36)}`,
    seq,
    stationId: spec.stationId || null,
    factionId: spec.factionId || null,
    side: 'launder',
    cut: Math.max(0, Math.round(Number(spec.cut) || 0)),
    cutFrac: Number(spec.cutFrac) || 0,
    reputation: Number(spec.reputation) || 0,
    pods: spec.pods || [],
    seenAt: Math.max(0, Number(state.simTime) || 0),
  };
  ledger.unshift(entry);
  if (ledger.length > LAUNDER_LEDGER_MAX) ledger.length = LAUNDER_LEDGER_MAX;
  return entry;
}

export default pirateDisguise;
