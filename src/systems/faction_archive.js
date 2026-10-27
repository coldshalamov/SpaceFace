// faction_archive.js — W-ARCHIVE (build_map §34.5 row 527, bible 02 §12).
//
// The Archive's weapon is Redaction. Done-when:
//   · Censor frigate: pulses Redaction on a beat — engines and HUD go dark
//   · escape by swinging: clear the field radius early by riding the Line out (E-29)
//   · page drones copy your logs; copied secrets become trade goods later
//   · Index Head: hold the Line and scan — read an object's provenance
//   · reading-room interior (authored spec data)
//   · they never destroy: redaction disables, nothing here kills
//
// THE STACKS — the living layer grown around those bones (same system, same book):
//   · ACCESSIONS — everything the pilot does in reach is filed: redactions ridden
//     out, corrections escaped, pages copied, folios returned, errands run, marks
//     taken. Accessions accrue into DEEDS; deeds climb the standing tiers that
//     scale every price the stacks make.
//   · THE DESK — stand inside the ring of a reading-room station, a censor
//     frigate, or a courier skiff and the Archive trades. It buys back quill
//     folios at a premium — names dearer, forgeries dearest, and a returned lie
//     is burned on receipt. It sells your own copied logs on and pays the
//     royalty a punctilious library owes. It sells suppression: pay to take
//     your page off the shelf before it publishes. Returning pages calms the
//     deserter's notice — the redactor pressure eases.
//   · ERRANDS — the accession board: carry an entry home to the sector that
//     wrote it, recover a lost folio drifting in the field and bring it to any
//     desk, or read a fresh provenance for the stacks with the Index Head. One
//     settle each, ever.
//   · THE BLACK FILE — the Archive never destroys; it annotates. Killing its
//     hulls files marks: annotated pilots are pulsed faster and held darker,
//     drones take their story quicker; enough open marks and you are EXPUNGED —
//     the desk refuses you, the errands stop, the drones will not even record
//     you. Burn a censor and the Archive circulates your file to another
//     faction; burn a reading room and it circulates to all of them. Marks
//     forgive on a long clock; a desk penance strikes one early.
//   · CITATIONS — once-only honors: the first correction, the milestones of
//     copies and reads and errands, the first folio returned.
//   · COURIERS — a bounded cast of acolyte skiffs walking between Archive
//     bodies, each a small mobile desk.
//
// The desk consumes REAL quill folio state: held pages in state.story.quillLedger
// are bought through the same price law the deserter's desk uses, and every
// Archive buyback writes the notice relief back onto that same ledger.
//
// Deterministic: pulse, copy, desk, errand, and courier clocks read simTime;
// picks are hash32 over stable keys — no ambient randomness, no wall time.
// Money only ever moves as economy:grantCredits / economy:chargeCredits
// intents; standing moves as faction:repDelta intents; live-body motion goes
// through queuePhysicsImpulse (page drones keep their shipped kinematics).
// The whole book is plain JSON under state.archive — bounded rows and keyed
// records, normalized in place so a stale or hand-cut save heals on read.
// Entity refs carry id + occupantGeneration + ownership-tag guards; latches
// land before every emit so a listener re-entering can never double-charge.

import {
  ARCHIVE_REDACTION,
  ARCHIVE_PAGE_DRONES,
  ARCHIVE_READING_ROOM,
  ARCHIVE_INDEX_HEAD,
} from '../data/factions/archive.js';
import {
  sanitizeQuillLedger,
  quillFolioPrice,
  quillExposureNow,
  QUILL_ERRANDS,
} from './quill.js';
import { occupantGenerationOf } from '../core/entity.js';
import { queuePhysicsImpulse } from '../core/physicsAuthority.js';
import { hash32 } from '../core/rng.js';

const FACTION_ID = 'faction_archive';
const dist2 = (a, b) => { const dx = a.x - b.x, dz = a.z - b.z; return dx * dx + dz * dz; };

// ── Normalization helpers (the choir convention) ──────────────────────────────
const _num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const _int = (v, d = 0) => Math.max(0, Math.floor(_num(v, d)));
// Only a plain object is JSON-safe ledger state: a Map/Set/class instance would
// accept normalizer writes as invisible properties and serialize to {} on save.
const _obj = (v) => (v && typeof v === 'object' && !Array.isArray(v)
  && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null) ? v : {});
const _str = (v, d = null) => (typeof v === 'string' && v ? v : d);

/** Keep at most `max` array rows — drop the oldest so the ledger stays bounded. */
function _capArr(arr, max) {
  while (arr.length > max) arr.shift();
  return arr;
}

/** Keep at most `max` keys in a keyed record — evict the lowest `at` stamps.
 *  Scalar rows (a bare simTime value, like cited/indexed) rank by their own value. */
function _capKeyed(obj, max, stampKey = 'at') {
  const keys = Object.keys(obj);
  if (keys.length <= max) return obj;
  const rank = (k) => {
    const v = obj[k];
    return v && typeof v === 'object' ? _num(v[stampKey], 0) : _num(v, 0);
  };
  const drop = keys.slice().sort((a, b) => rank(a) - rank(b));
  let overflow = keys.length - max;
  for (const k of drop) {
    if (overflow <= 0) break;
    delete obj[k];
    overflow -= 1;
  }
  return obj;
}

/** Strip non-whitelist keys in place — identity preserved so held refs stay live. */
function _keepKeys(row, keys) {
  for (const k of Object.keys(row)) if (!keys.has(k)) delete row[k];
  return row;
}

// ── THE STACKS: tuning, all frozen ────────────────────────────────────────────
const STACKS = Object.freeze({
  accessionRows: 40,
  citedKeys: 48,
  indexedKeys: 64,
  markRows: 16,
  copiedLogRows: 60,
  liveRows: 6,
  circulateKeys: 8,
});

// Standing tiers — deeds are the only resume the stacks accept. The multiplier
// scales every payout the desk and the board make.
export const ARCHIVE_TIERS = Object.freeze([
  { tier: 0, deeds: 0, id: 'unfiled', label: 'Unfiled', payMult: 1.0,
    line: 'The Stacks have no line for you. Yet.' },
  { tier: 1, deeds: 3, id: 'indexed', label: 'Indexed', payMult: 1.12,
    line: 'Your file has a spine now. The margins remember.' },
  { tier: 2, deeds: 8, id: 'accredited', label: 'Accredited Reader', payMult: 1.28,
    line: 'The reading rooms leave a lamp lit for you.' },
  { tier: 3, deeds: 15, id: 'fellow', label: 'Fellow of the Stacks', payMult: 1.5,
    line: 'The archivists argue over whose shelf you belong on.' },
  { tier: 4, deeds: 26, id: 'edition', label: 'Living Edition', payMult: 1.8,
    line: 'They are copying you now. Both ways.' },
]);

export function archiveTierFor(deeds) {
  const d = Math.max(0, _int(deeds));
  let row = ARCHIVE_TIERS[0];
  for (const t of ARCHIVE_TIERS) if (d >= t.deeds) row = t;
  return row;
}

// ── THE DESK — "a secret for a secret" ────────────────────────────────────────
export const ARCHIVE_DESK = Object.freeze({
  radius: 700,               // stand inside the ring of a desk body and trade
  buyCadenceS: 8,            // one folio per cadence — the desk reads carefully
  premium: 1.3,              // the Archive pays over the street for its pages
  namesPremium: 1.55,        // names cost more — the stacks want them sealed
  forgeryPremium: 2.0,       // forgeries dearest — they pay to take lies off the market
  exposureRelief: 6,         // returning pages calms the deserter's notice
  copyRoyaltyCr: 45,         // a copied log sells; the stacks pay the royalty owed
  copyRoyaltyTierBonus: 0.15,// each standing tier adds this much to the royalty
  copyPublishDelayS: 180,    // a copy sits this long before the stacks sell it
  publishPerTick: 2,
  suppressCostCr: 120,       // buy your own page back off the shelf
  suppressCostGrowth: 1.5,   // each suppression costs more than the last
  offerTtlS: 60,             // a suppression offer stands this long
  penanceCostCr: 300,        // amends: pay to strike one open mark
  penanceRep: 2,
  refuseBarkGapS: 60,
});

// Reading-room identity — presence owns the station service; the sim reads the
// live body: an Archive-flagged station, an authored reading-room marker, a
// catalog station id from the presence row, or a station advertising the room's
// services. Censor frigates and courier skiffs are field desks.
const READING_ROOM_STATIONS = new Set(['station_drift', 'station_tethys', 'station_helios']);
const READING_ROOM_SERVICES = new Set(['reading_room', 'index_desk', 'folio_racks', 'secret_trade']);

// ── THE ERRANDS — the accession board ─────────────────────────────────────────
export const ARCHIVE_ERRANDS = Object.freeze({
  maxOpen: 2,
  postGapS: 55,
  firstPostS: 20,
  deliverTtlS: 900,
  recoverTtlS: 480,
  readTtlS: 360,
  collectRadius: 80,         // touch or tether a lost folio to take it up
  settleRadius: 700,         // any desk ring closes the return
  folioSpawnDist: 1600,
  arriveRadius: 60,
  deliverPayCr: 320, deliverRep: 3,
  recoverPayCr: 260, recoverRep: 3,
  readPayCr: 180, readRep: 2,
  expireRep: -1,             // a page that waited too long costs a little face
});

// Sectors an entry can want carrying home to — the stacks' own shelves plus the
// worlds the sealed pages were written about (the same world the deserter maps).
const ERRAND_SECTORS = Object.freeze([
  'sector_pallas_drift', 'sector_orcus_shadow',
  ...QUILL_ERRANDS.map((e) => e.sectorId),
]);

// ── THE BLACK FILE — they never destroy; they annotate ────────────────────────
export const ARCHIVE_BLACK_FILE = Object.freeze({
  markTtlS: 900,             // the Archive forgets nothing; it forgives on this clock
  expungeAt: 3,              // this many open marks expunge the pilot
  expungedS: 600,
  annotatedS: 240,           // a fresh mark annotates you this long
  annotatedPulseMult: 0.6,   // annotated pilots are pulsed faster
  annotatedDurationMult: 1.5,// and the dark holds them longer
  annotatedCopyMult: 0.6,    // drones take an annotated pilot's story quicker
  droneRep: -3, courierRep: -4, folioRep: -4, archivistRep: -5,
  censorRep: -8, roomRep: -12,
  circulateRep: -4,          // the published file costs with another faction
  roomCirculateRep: -3,      // burning a reading room circulates to all of them
});

// The factions a circulated file lands with — the respectable shelves.
const CIRCULATE_FACTIONS = Object.freeze([
  'faction_scn', 'faction_mts', 'faction_dmc', 'faction_reach',
  'faction_quiet', 'faction_vael', 'faction_free', 'faction_choir',
]);

// ── THE COURIERS — acolyte skiffs walking between Archive bodies ──────────────
export const ARCHIVE_COURIERS = Object.freeze({
  maxLive: 2,
  sentPerSector: 3,
  spawnGapS: 50,
  firstSpawnS: 8,
  speed: 46,
  deskRadius: 420,           // a skiff is a smaller desk
  arriveRadius: 130,
  hailRadius: 800,
  ttlS: 300,
  retryS: 10,
});

const COURIER_NAMES = Object.freeze([
  'SKIFF · RECTO', 'SKIFF · VERSO', 'SKIFF · COLOPHON',
  'SKIFF · MARGINALIA', 'SKIFF · EX LIBRIS', 'SKIFF · GUTTER',
]);

// ── THE FIELD CAST — censors and page drones on the authored redaction map ──
// Nothing else in the authored world stamps `data.censorFrigate`/`data.pageDrone`:
// presence bodies carry generic `factionPresence` markers and the berth keeper's
// 'censor-frigate' role only chooses a hull. So the stacks seed their own cast
// on home turf, on the courier contract — per-visit sent caps, live caps counted
// by flag across every body in the sector (a foreign-spawned hull still counts),
// a gap clock, and a hull ttl. The expunged are not worth recording, so no new
// drones rise while the file is shut; censors still patrol — the Archive keeps
// its field lit.
export const ARCHIVE_FIELD = Object.freeze({
  sectors: ARCHIVE_REDACTION.sectors, // home turf: the authored redaction map
  firstSpawnS: 12,
  spawnGapS: 40,
  retryS: 12,
  censorsPerSector: 1, censorLiveMax: 1,
  dronesPerSector: 3, droneLiveMax: 2,
  spawnDistMin: 1200, spawnDistMax: 2600,
  ttlS: 420,
});

const FIELD_NAMES = Object.freeze({
  censor: Object.freeze(['CENSOR · CLOSED', 'CENSOR · SEALED', 'CENSOR · REDACT']),
  drone: Object.freeze(['PAGE · RECTO', 'PAGE · VERSO', 'PAGE · FLYLEAF', 'PAGE · GUTTER']),
});

// ── CITATIONS — once-only honors, latched under `cited` ───────────────────────
const CITATIONS = Object.freeze({
  correction_first: { rep: 2, grantCr: 60, line: 'The Archive records the correction. It pays to be interesting.' },
  copies_5: { rep: 3, grantCr: 0, line: 'Five pages of you sit in the stacks. They are well-read.' },
  copies_15: { rep: 4, grantCr: 120, line: 'Fifteen pages. Your file circulates. The stacks pay a stipend.' },
  copies_40: { rep: 5, grantCr: 300, line: 'Forty pages — you are a whole shelf. The stacks honor the donor.' },
  folio_returned_first: { rep: 3, grantCr: 60, line: 'A page came home through you. The stacks note the carrier kindly.' },
  errand_1: { rep: 2, grantCr: 0, line: 'You carried an entry home. The board keeps your name in good ink.' },
  errand_5: { rep: 4, grantCr: 200, line: 'Five errands answered. The archivists no longer check your references.' },
  index_5: { rep: 2, grantCr: 0, line: 'Your reads are on file. The Index remembers who read for it.' },
  index_20: { rep: 4, grantCr: 160, line: 'Twenty provenances filed. You read for the stacks now, whether or not you meant to.' },
  suppression_first: { rep: 1, grantCr: 0, line: 'You bought your own page back. A transaction, not an erasure — the sale is filed.' },
  penance_first: { rep: 2, grantCr: 0, line: 'Amends received. The margin note lightens.' },
});

const STACK_BARKS = Object.freeze({
  deskOpen: 'The desk is open. The stacks already know what you carry.',
  folioBought: 'A page returned. The stacks pay their source.',
  forgeryBurned: 'A lie in a sealed hand. The stacks pay well to burn those.',
  royalty: 'Your page sold. A secret for a secret — the stacks pay their cut.',
  suppressed: 'The page is off the shelf. The Archive keeps the receipt.',
  penance: 'Amends received. The Archive records the correction.',
  errandPosted: 'The board posts an accession. A page wants carrying.',
  errandSettled: 'The entry is filed. The stacks settle their debts.',
  errandExpired: 'A page waited too long. The board closes the request.',
  folioLost: 'A lost page drifts in the field. The board wants it back.',
  folioFound: 'The lost page rides your hold. Any desk will take it.',
  marked: 'The Archive writes your name in a margin.',
  forgiven: 'A margin note fades. The Archive forgives, eventually.',
  expunged: 'You are out of the stacks. Nothing of yours will be kept.',
  amnesty: 'The Archive reopens your file. It never really closed.',
  circulated: 'Your file circulates. Other shelves read it now.',
  courierHail: 'A courier skiff walks the stacks. Its desk travels with it.',
  courierArrived: 'The courier reaches its shelf. A page changes hands.',
  deskRefused: 'The desk is closed to you. The stacks refuse the expunged.',
});

// Row key whitelists — normalization strips anything else so the book stays
// plain JSON even when a save row carries junk from a hand-cut fixture.
const REDACTION_KEYS = new Set(['active', 'censorId', 'censorGen', 'untilSimTime', 'enginesDark', 'hudDark', 'pulsedAt']);
const COPY_KEYS = new Set(['id', 'at', 'tick', 'sectorId', 'tradeGoodId', 'note',
  'published', 'suppressed', 'soldAt', 'royaltyCr', 'suppressCr']);
const ACCESSION_KEYS = new Set(['id', 'kind', 'ref', 'sectorId', 'at']);
const OFFER_KEYS = new Set(['logKey', 'costCr', 'postedAt', 'until']);
const DESK_KEYS = new Set(['nextBuyAt', 'offer', 'foliosBought', 'forgeriesBurned',
  'royaltiesPaid', 'royaltiesCr', 'suppressedCount', 'refusedAt']);
const ERRAND_KEYS = new Set(['id', 'kind', 'sectorId', 'ref', 'folioId', 'folioGen',
  'phase', 'armedAt', 'expiresAt', 'rewardCr']);
const ERRANDS_KEYS = new Set(['seq', 'open', 'done', 'expired', 'nextPostAt']);
const MARK_KEYS = new Set(['id', 'kind', 'victim', 'victimId', 'gen', 'at',
  'forgiven', 'forgiveAt', 'defense']);
const TRAFFIC_LIVE_KEYS = new Set(['name', 'destId', 'destGen', 'hailed']);
const TRAFFIC_KEYS = new Set(['sectorId', 'sent', 'nextSpawnAt', 'live',
  'censorSent', 'droneSent', 'nextFieldAt']);
const ARCHIVE_KEYS = new Set(['redaction', 'copiedLogs', 'droneCopies', 'seq', 'deeds',
  'accessions', 'cited', 'indexed', 'desk', 'errands', 'marks',
  'annotatedUntil', 'expungedUntil', 'circulated', 'traffic']);

const ERRAND_KINDS = new Set(['deliver', 'recover', 'read']);
const MARK_KINDS = new Set(['page_drone', 'courier', 'censor', 'reading_room', 'lost_folio', 'archivist']);

/**
 * Fresh serializable Archive record: the redaction field, copied logs, the writ
 * ledger — plus the stacks: accessions, deeds, the desk, the errand board, the
 * black file, and the courier cast. Every field is plain JSON; absent and
 * malformed slices normalize to the additive default so a pre-stacks save (or a
 * hand-cut fixture) reads clean.
 *
 * Normalization is IN PLACE on purpose: rows and containers keep their identity
 * across calls, because ticks hold references across sub-calls that themselves
 * run ensureArchiveState (a rebuild-the-world normalizer would orphan those
 * refs — a held errand row losing `phase` re-fires a settle; a held mark losing
 * `forgiveAt` forgives nothing).
 */
export function ensureArchiveState(state) {
  if (state.archive !== _obj(state.archive)) state.archive = {};
  const a = _keepKeys(state.archive, ARCHIVE_KEYS);

  // The redaction field — hardened so a hostile save cannot pin the dark on.
  if (a.redaction === undefined) a.redaction = null;
  if (a.redaction != null) {
    if (typeof a.redaction !== 'object' || a.redaction.active !== true) {
      a.redaction = null;
    } else {
      const r = _keepKeys(_obj(a.redaction), REDACTION_KEYS);
      r.active = true;
      // A hand-cut clock cannot pin the dark: the longest a pulse may legally
      // hold is the annotated duration, so anything further out heals to it.
      const maxUntil = _num(state.simTime, 0)
        + ARCHIVE_REDACTION.durationS * ARCHIVE_BLACK_FILE.annotatedDurationMult;
      if (!Number.isFinite(r.untilSimTime)) r.untilSimTime = _num(state.simTime, 0) + ARCHIVE_REDACTION.durationS;
      else r.untilSimTime = Math.min(r.untilSimTime, maxUntil);
      r.censorId = Number.isInteger(r.censorId) ? r.censorId : null;
      r.censorGen = Number.isInteger(r.censorGen) ? r.censorGen : null;
      a.redaction = r;
    }
  }

  // The copied-log book: rows gain the desk's publish/suppress latches. A row
  // that is not a plain object is no page at all — it drops, or a hostile save
  // could mint royalties out of junk.
  if (!Array.isArray(a.copiedLogs)) a.copiedLogs = [];
  const cleanCopies = [];
  for (const row0 of a.copiedLogs) {
    if (row0 !== _obj(row0)) continue;
    const row = _keepKeys(row0, COPY_KEYS);
    row.id = _str(row.id, `copy_${cleanCopies.length + 1}`);
    row.at = _num(row.at, 0);
    row.tick = _int(row.tick);
    row.sectorId = _str(row.sectorId);
    row.tradeGoodId = _str(row.tradeGoodId, ARCHIVE_PAGE_DRONES.copiedTradeGoodId);
    row.note = _str(row.note, 'flight log page');
    row.published = row.published === true;
    row.suppressed = row.suppressed === true;
    row.soldAt = _num(row.soldAt, 0);
    row.royaltyCr = _int(row.royaltyCr);
    row.suppressCr = _int(row.suppressCr);
    cleanCopies.push(row);
  }
  a.copiedLogs = cleanCopies;
  // Bound the book: unpublished and unsuppressed rows are pending money and
  // never evict — closed receipts drop oldest-first.
  if (a.copiedLogs.length > STACKS.copiedLogRows) {
    const live = a.copiedLogs.filter((r) => !r.published && !r.suppressed);
    const closed = a.copiedLogs.filter((r) => r.published || r.suppressed)
      .sort((x, y) => _num(y.soldAt) - _num(x.soldAt) || _num(y.at) - _num(x.at));
    a.copiedLogs = live.concat(closed).slice(0, STACKS.copiedLogRows);
  }
  if (!Number.isFinite(a.droneCopies)) a.droneCopies = 0;
  a.seq = _int(a.seq);
  a.deeds = _int(a.deeds);

  // The accession ledger — the Archive writes everything down.
  if (!Array.isArray(a.accessions)) a.accessions = [];
  const cleanAcc = [];
  for (const row0 of a.accessions) {
    if (row0 !== _obj(row0)) continue;
    const row = _keepKeys(row0, ACCESSION_KEYS);
    row.id = _str(row.id, `acc_${cleanAcc.length + 1}`);
    row.kind = _str(row.kind, 'note');
    row.ref = _str(row.ref);
    row.sectorId = _str(row.sectorId);
    row.at = _num(row.at, 0);
    cleanAcc.push(row);
  }
  a.accessions = _capArr(cleanAcc, STACKS.accessionRows);

  // Once-only latches: citations and distinct index reads, keyed by name.
  const cited = _obj(a.cited);
  for (const k of Object.keys(cited)) cited[k] = _num(cited[k], 0);
  a.cited = _capKeyed(cited, STACKS.citedKeys);
  const indexed = _obj(a.indexed);
  for (const k of Object.keys(indexed)) indexed[k] = _num(indexed[k], 0);
  a.indexed = _capKeyed(indexed, STACKS.indexedKeys);

  // The desk: folio buyback clock, the standing suppression offer, counters.
  const desk = _keepKeys(_obj(a.desk), DESK_KEYS);
  desk.nextBuyAt = _num(desk.nextBuyAt, 0);
  if (desk.offer != null) {
    const offer = _keepKeys(_obj(desk.offer), OFFER_KEYS);
    if (!_str(offer.logKey)) desk.offer = null;
    else {
      offer.costCr = _int(offer.costCr);
      offer.postedAt = _num(offer.postedAt, 0);
      offer.until = _num(offer.until, 0);
      desk.offer = offer;
    }
  }
  desk.foliosBought = _int(desk.foliosBought);
  desk.forgeriesBurned = _int(desk.forgeriesBurned);
  desk.royaltiesPaid = _int(desk.royaltiesPaid);
  desk.royaltiesCr = _int(desk.royaltiesCr);
  desk.suppressedCount = _int(desk.suppressedCount);
  // JSON writes -Infinity as null; keep the never-refused default or the first
  // refusal bark waits out a whole gap before it may speak.
  desk.refusedAt = desk.refusedAt == null ? -Infinity : _num(desk.refusedAt, -Infinity);
  a.desk = desk;

  // The errand board.
  const errands = _keepKeys(_obj(a.errands), ERRANDS_KEYS);
  errands.seq = _int(errands.seq);
  if (!Array.isArray(errands.open)) errands.open = [];
  const open = [];
  for (const row of errands.open) {
    const r = _keepKeys(_obj(row), ERRAND_KEYS);
    if (!_str(r.id) || !ERRAND_KINDS.has(r.kind)) continue; // malformed rows drop
    r.sectorId = _str(r.sectorId);
    r.ref = _str(r.ref);
    r.folioId = Number.isInteger(r.folioId) ? r.folioId : null;
    r.folioGen = Number.isInteger(r.folioGen) ? r.folioGen : null;
    r.phase = r.phase === 'return' ? 'return' : 'seek';
    r.armedAt = _num(r.armedAt, 0);
    r.expiresAt = _num(r.expiresAt, 0);
    r.rewardCr = _int(r.rewardCr);
    open.push(r);
  }
  errands.open = _capArr(open, ARCHIVE_ERRANDS.maxOpen * 2);
  errands.done = _int(errands.done);
  errands.expired = _int(errands.expired);
  errands.nextPostAt = _num(errands.nextPostAt, -1);
  a.errands = errands;

  // The black file. An unprovable mark — not a plain object, or a kind the
  // file never writes — drops rather than counting toward the expunge.
  if (!Array.isArray(a.marks)) a.marks = [];
  const cleanMarks = [];
  for (const row0 of a.marks) {
    if (row0 !== _obj(row0)) continue;
    const row = _keepKeys(row0, MARK_KEYS);
    if (!MARK_KINDS.has(row.kind)) continue;
    row.id = _str(row.id, `mark_${cleanMarks.length + 1}`);
    row.victim = _str(row.victim, 'AN ARCHIVIST');
    row.victimId = Number.isInteger(row.victimId) ? row.victimId : null;
    row.gen = Number.isInteger(row.gen) ? row.gen : null;
    row.at = _num(row.at, 0);
    row.forgiven = row.forgiven === true;
    row.forgiveAt = _num(row.forgiveAt, row.at + ARCHIVE_BLACK_FILE.markTtlS);
    row.defense = row.defense === true;
    cleanMarks.push(row);
  }
  a.marks = _capArr(cleanMarks, STACKS.markRows);
  a.annotatedUntil = _num(a.annotatedUntil, 0);
  a.expungedUntil = _num(a.expungedUntil, 0);
  const circulated = _obj(a.circulated);
  for (const k of Object.keys(circulated)) circulated[k] = _int(circulated[k]);
  a.circulated = _capKeyed(circulated, STACKS.circulateKeys);

  // The bounded casts — courier skiffs and the field hulls share one visit bag.
  const traffic = _keepKeys(_obj(a.traffic), TRAFFIC_KEYS);
  traffic.sectorId = _str(traffic.sectorId);
  traffic.sent = _int(traffic.sent);
  traffic.nextSpawnAt = _num(traffic.nextSpawnAt, -1);
  traffic.censorSent = _int(traffic.censorSent);
  traffic.droneSent = _int(traffic.droneSent);
  traffic.nextFieldAt = _num(traffic.nextFieldAt, -1);
  const live = _obj(traffic.live);
  for (const k of Object.keys(live)) {
    const row = _keepKeys(_obj(live[k]), TRAFFIC_LIVE_KEYS);
    row.name = _str(row.name, 'SKIFF');
    row.destId = Number.isInteger(row.destId) ? row.destId : null;
    row.destGen = Number.isInteger(row.destGen) ? row.destGen : null;
    row.hailed = row.hailed === true;
    live[k] = row;
  }
  traffic.live = _capKeyed(live, STACKS.liveRows);
  a.traffic = traffic;

  return a;
}

/** True while the player is inside a live redaction: engines and HUD are dark. */
export function isRedacted(state) {
  const a = ensureArchiveState(state);
  return !!(a.redaction && a.redaction.active);
}

/** What the HUD/flight lanes read: darkness means momentum and the Line only. */
export function redactionBlackout(state) {
  const a = ensureArchiveState(state);
  if (!a.redaction || !a.redaction.active) return { enginesDark: false, hudDark: false };
  return { enginesDark: ARCHIVE_REDACTION.enginesDark, hudDark: ARCHIVE_REDACTION.hudDark };
}

/**
 * Detached read-model of the pilot's standing with the stacks: the tier row,
 * open marks, annotation/expunge clocks, desk totals. Callers cannot mutate
 * the record — every field is a copied scalar.
 */
export function archiveStanding(state) {
  const a = ensureArchiveState(state);
  const simTime = _num(state && state.simTime, 0);
  const tier = archiveTierFor(a.deeds);
  const openMarks = a.marks.filter((m) => m.forgiven !== true).length;
  return {
    tier: tier.tier, id: tier.id, label: tier.label, payMult: tier.payMult,
    deeds: a.deeds,
    accessions: a.accessions.length,
    indexedCount: Object.keys(a.indexed).length,
    citedCount: Object.keys(a.cited).length,
    openMarks,
    annotated: simTime < a.annotatedUntil,
    annotatedUntil: a.annotatedUntil,
    expunged: simTime < a.expungedUntil,
    expungedUntil: a.expungedUntil,
    foliosBought: a.desk.foliosBought,
    forgeriesBurned: a.desk.forgeriesBurned,
    royaltiesPaid: a.desk.royaltiesPaid,
    royaltiesCr: a.desk.royaltiesCr,
    suppressedCount: a.desk.suppressedCount,
    errandsDone: a.errands.done,
    errandsOpen: a.errands.open.length,
    couriersLive: Object.keys(a.traffic.live).length,
    copiedLogs: a.copiedLogs.length,
    droneCopies: a.droneCopies,
  };
}

/** A HUD/board snapshot of the whole book — copies, never the live rows. */
export function archiveBoard(state) {
  const a = ensureArchiveState(state);
  return {
    standing: archiveStanding(state),
    accessions: a.accessions.map((r) => ({ ...r })),
    errands: a.errands.open.map((r) => ({ ...r })),
    marks: a.marks.map((r) => ({ ...r })),
    offer: a.desk.offer ? { ...a.desk.offer } : null,
    copiedLogs: a.copiedLogs.map((r) => ({ ...r })),
  };
}

export const archiveRedaction = {
  name: 'archiveRedaction',

  init(ctx) {
    this.ctx = ctx; this.state = ctx.state; this.bus = ctx.bus; this.helpers = ctx.helpers;
    this._pulseAt = new Map(); // censorId -> next pulse simTime
    this._deskHinted = false;  // runtime: one desk-open bark per sector visit
    this._expungedWas = false; // runtime: amnesty speaks once per expunge lapse
    // The kill/restore/enter ears subscribe once per bus: a repeated init must
    // not double-arm — a duplicated listener would file two marks for one kill.
    if (this._killEarBus !== this.bus) {
      if (this._subs) {
        for (const off of this._subs) { try { off(); } catch (_) { /* stale unsub */ } }
      }
      this._killEarBus = this.bus;
      this._subs = [
        this.bus.on('entity:killed', (p) => this._onKilled(p)),
        this.bus.on('sector:enter', (p) => this._onSectorEnter(p)),
        this.bus.on('save:loaded', () => this._afterRestore()),
      ];
    }
    ensureArchiveState(this.state);
  },

  destroy() {
    for (const off of this._subs || []) { try { off && off(); } catch (_) { /* listener hygiene */ } }
    this._subs = [];
    this._killEarBus = null;
  },

  // ── persistence: marks, errands, copied logs and the reading-room book ride the
  // save as one plain-JSON bag. Without it a Continue launders every black-file mark.
  saveSnapshotOwned: true,

  serialize() {
    if (!this.state) return {};
    return JSON.parse(JSON.stringify(ensureArchiveState(this.state)));
  },

  deserialize(data) {
    if (!this.state) return undefined;
    // An absent or corrupt bag (a pre-key save) restores to a fresh book.
    this.state.archive = _obj(data) === data ? JSON.parse(JSON.stringify(data)) : null;
    return ensureArchiveState(this.state);
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Shared reads
  // ═══════════════════════════════════════════════════════════════════════════

  _player(state) {
    const p = state.entities && state.entities.get ? state.entities.get(state.playerId) : null;
    return p && p.alive !== false ? p : null;
  },

  _log(state, text, speaker = 'The Archive') {
    this.bus.emit('comms:log', { text, speaker });
  },

  /**
   * The desk identity of a body: a reading-room station, a censor frigate, a
   * courier skiff, or an authored desk marker. Null for everything else.
   */
  _deskKind(e) {
    if (!e || e.alive === false) return null;
    const d = e.data || {};
    if (d.archiveCourier === true) return 'courier';
    if (d.censorFrigate === true) return 'censor';
    if (d.archiveDesk === true || d.archiveReadingRoom === true) return 'station';
    if (e.type === 'station') {
      if (e.factionId === FACTION_ID || d.factionId === FACTION_ID) return 'station';
      if (READING_ROOM_STATIONS.has(d.stationId)) return 'station';
      const services = Array.isArray(d.services) ? d.services : [];
      if (services.some((s) => READING_ROOM_SERVICES.has(s))) return 'station';
    }
    return null;
  },

  /** Every live desk body in the sector, nearest-first to the player. */
  _scanDesks(state) {
    const out = [];
    const player = this._player(state);
    for (const e of state.entityList) {
      const kind = this._deskKind(e);
      if (!kind) continue;
      const reach = (kind === 'courier' ? ARCHIVE_COURIERS.deskRadius : ARCHIVE_DESK.radius)
        + (Number(e.radius) || 0);
      out.push({ e, kind, reach, d2: player ? dist2(player.pos, e.pos) : Infinity });
    }
    out.sort((x, y) => x.d2 - y.d2);
    return out;
  },

  /** The desk ring the pilot is standing in, or null — the desk trades by proximity. */
  _deskInRange(state, desks = null) {
    const list = desks || this._scanDesks(state);
    const player = this._player(state);
    if (!player) return null;
    for (const d of list) if (d.d2 <= d.reach * d.reach) return d;
    return null;
  },

  /** The deserter's ledger — peek-heal only: absent stays absent (the desk has
   *  no business minting the rim's book), a live section heals on read. */
  _quillLedger(state) {
    const raw = state.story && state.story.quillLedger;
    if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
    if (raw.schema === 1 && Array.isArray(raw.folios)) return raw;
    const clean = sanitizeQuillLedger(raw);
    if (!clean) return null;
    state.story.quillLedger = clean;
    return clean;
  },

  /** An accession row — the Archive writes it down. No rep, no money, just ink. */
  _accession(state, kind, refId = null) {
    const a = ensureArchiveState(state);
    a.seq += 1;
    a.accessions.push({
      id: `acc_${a.seq}`, kind, ref: _str(refId),
      sectorId: _str(state.world && state.world.currentSectorId), at: state.simTime,
    });
    _capArr(a.accessions, STACKS.accessionRows);
  },

  /** A deed: the accession plus the count that climbs the tiers. */
  _deed(state, kind, refId = null) {
    const a = ensureArchiveState(state);
    const before = archiveTierFor(a.deeds).tier;
    a.deeds += 1;
    this._accession(state, kind, refId);
    const after = archiveTierFor(a.deeds);
    if (after.tier !== before) {
      this.bus.emit('archive:tier', { tier: after.tier, id: after.id, label: after.label, tick: state.tick });
      this._log(state, after.line);
    }
    return after;
  },

  /** A once-only citation: latch first, then the honors. */
  _cite(state, key) {
    const a = ensureArchiveState(state);
    if (a.cited[key] != null) return false;
    const spec = CITATIONS[key];
    if (!spec) return false;
    a.cited[key] = state.simTime;
    _capKeyed(a.cited, STACKS.citedKeys);
    if (spec.grantCr > 0) {
      this.bus.emit('economy:grantCredits', { amount: spec.grantCr, reason: `archive:cite:${key}` });
    }
    if (spec.rep) {
      this.bus.emit('faction:repDelta', { factionId: FACTION_ID, delta: spec.rep, reason: `archive:cite:${key}` });
    }
    this.bus.emit('archive:cited', { key, rep: spec.rep, grantCr: spec.grantCr, tick: state.tick });
    if (spec.line) this._log(state, spec.line);
    return true;
  },

  _grant(state, amount, reason) {
    const a = Math.max(0, Math.round(Number(amount) || 0));
    if (a <= 0) return;
    this.bus.emit('economy:grantCredits', { amount: a, reason });
  },

  /**
   * Exact-payment request (the NXB-009 envelope, the borrowedSun convention):
   * a refusal must cost nothing. The sole credits writer validates the balance,
   * runs `commit` — which performs the service latch — and only then lands the
   * charge. Short money, a stale expectedCredits, or a missing listener writes
   * nothing. Returns true when the sale committed.
   */
  _chargeExact(state, amount, reason, commit) {
    const a = Math.max(0, Math.round(Number(amount) || 0));
    if (a <= 0 || typeof commit !== 'function') return false;
    const charge = {
      amount: a, reason, requireFull: true,
      expectedCredits: Math.max(0, Math.round(_num(state.player && state.player.credits, 0))),
      commit,
    };
    this.bus.emit('economy:chargeCredits', charge);
    return charge.result === true;
  },

  _rep(state, delta, reason) {
    const d = Math.round(Number(delta) || 0);
    if (!d) return;
    this.bus.emit('faction:repDelta', { factionId: FACTION_ID, delta: d, reason });
  },

  /** The open black-file marks — forgiven rows are history, not trouble. */
  _openMarks(state) {
    return ensureArchiveState(state).marks.filter((m) => m.forgiven !== true);
  },

  /** The Archive's present opinion of the pilot: annotated and/or expunged. */
  _blackFile(state) {
    const a = ensureArchiveState(state);
    return {
      annotated: state.simTime < a.annotatedUntil,
      expunged: state.simTime < a.expungedUntil,
      open: this._openMarks(state).length,
    };
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Redaction (E-29) — annotated pilots are pulsed faster and held darker
  // ═══════════════════════════════════════════════════════════════════════════

  _tickCensors(state) {
    const a = ensureArchiveState(state);
    const player = state.entities.get(state.playerId);
    if (!player || player.alive === false) return;
    const annotated = state.simTime < a.annotatedUntil;
    const period = annotated
      ? ARCHIVE_REDACTION.pulsePeriodS * ARCHIVE_BLACK_FILE.annotatedPulseMult
      : ARCHIVE_REDACTION.pulsePeriodS;
    for (const e of state.entityList) {
      // The cadence latch keys id + occupant generation — a dead censor's
      // recycled id must not inherit the old hull's pulse beat.
      const key = e ? `${e.id}:${occupantGenerationOf(e) ?? 'x'}` : null;
      if (!e || e.alive === false) { if (key) this._pulseAt.delete(key); continue; }
      if (e.data?.censorFrigate !== true) continue;
      if (this._pulseAt.size > 512) this._pulseAt.clear();
      const at = this._pulseAt.get(key) ?? -1;
      const d2 = dist2(e.pos, player.pos);
      const r = ARCHIVE_REDACTION.pulseRadius;
      if (state.simTime >= at && d2 <= r * r) {
        this._pulseAt.set(key, state.simTime + period);
        this._redact(state, player, e);
      }
    }
    // Escape: out past the field radius + bonus and the dark lifts early — you swung out.
    const red = a.redaction;
    if (red && red.active) {
      const censor = red.censorId != null ? state.entities.get(red.censorId) : null;
      // The body the field came from is proven by generation: a dead censor's
      // recycled id must not stand in as the pulser — a stranger that far away
      // would read as a swing-out and pay the correction it did not earn.
      const genOk = red.censorGen == null
        || (censor != null && occupantGenerationOf(censor) === red.censorGen);
      const gone = !censor || censor.alive === false || !genOk;
      const escaped = !gone
        && dist2(player.pos, censor.pos) > (ARCHIVE_REDACTION.pulseRadius + ARCHIVE_REDACTION.escapeRadiusBonus) ** 2;
      if (gone || escaped || state.simTime >= red.untilSimTime) {
        this._lift(state, escaped && state.simTime < red.untilSimTime);
      }
    } else if (player.data
        && (player.data.redacted === true || player.data.enginesDark === true)) {
      // The book holds no live field but the body still wears the dark — a
      // hand-cut save (or a dropped redaction record) can pin the crumbs
      // exactly the way it can pin untilSimTime. Clear them quietly: a heal
      // is not a lift, so no archive:redactionLifted speaks for a field that
      // never stood this session.
      player.data.redacted = false;
      player.data.enginesDark = false;
    }
  },

  _redact(state, player, censor) {
    const a = ensureArchiveState(state);
    const fresh = !(a.redaction && a.redaction.active); // re-pulses are ink already filed
    const annotated = state.simTime < a.annotatedUntil;
    const dur = annotated
      ? ARCHIVE_REDACTION.durationS * ARCHIVE_BLACK_FILE.annotatedDurationMult
      : ARCHIVE_REDACTION.durationS;
    a.redaction = {
      active: true, censorId: censor.id, censorGen: occupantGenerationOf(censor),
      untilSimTime: state.simTime + dur,
      enginesDark: ARCHIVE_REDACTION.enginesDark, hudDark: ARCHIVE_REDACTION.hudDark,
      pulsedAt: state.simTime,
    };
    player.data = player.data || {};
    player.data.redacted = true;
    player.data.enginesDark = ARCHIVE_REDACTION.enginesDark;
    if (fresh) this._accession(state, 'redacted', `censor_${censor.id}`);
    this.bus.emit('archive:redacted', {
      censorId: censor.id, untilSimTime: a.redaction.untilSimTime,
      enginesDark: ARCHIVE_REDACTION.enginesDark, hudDark: ARCHIVE_REDACTION.hudDark, tick: state.tick,
    });
    this.bus.emit('comms:log', { text: ARCHIVE_REDACTION.pulseLine, speaker: 'Archive censor' });
    this.bus.emit('toast', { text: 'REDACTED — engines dark. Swing.', tone: 'warn' });
  },

  _lift(state, escaped) {
    const a = ensureArchiveState(state);
    const player = state.entities.get(state.playerId);
    if (player && player.data) { player.data.redacted = false; player.data.enginesDark = false; }
    const was = a.redaction;
    a.redaction = null;
    this.bus.emit('archive:redactionLifted', { escaped, censorId: was?.censorId ?? null, tick: state.tick });
    if (escaped) {
      this.bus.emit('comms:log', { text: ARCHIVE_REDACTION.escapeLine, speaker: 'Archive censor' });
      this.bus.emit('toast', { text: 'CLEAR — the Archive took notes anyway', tone: 'info' });
      // A swing-out is a deed the stacks genuinely respect.
      this._accession(state, 'correction', was?.censorId != null ? `censor_${was.censorId}` : null);
      this._deed(state, 'correction_deed', null);
      this._cite(state, 'correction_first');
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Page drones — copy your logs; the copies publish later and pay a royalty.
  // The annotated get copied faster; the expunged are not worth recording.
  // ═══════════════════════════════════════════════════════════════════════════

  _tickPageDrones(state, dt) {
    const a = ensureArchiveState(state);
    const player = state.entities.get(state.playerId);
    if (!player || player.alive === false) return;
    const file = this._blackFile(state);
    const copyTime = file.annotated
      ? ARCHIVE_PAGE_DRONES.copyTimeS * ARCHIVE_BLACK_FILE.annotatedCopyMult
      : ARCHIVE_PAGE_DRONES.copyTimeS;
    for (const e of state.entityList) {
      if (!e || e.alive === false || !e.data?.pageDrone) continue;
      const d = Math.sqrt(dist2(e.pos, player.pos)) || 1;
      // Expunged: the Archive has no use for your story — the drones leave.
      if (file.expunged && !e.data.departing) {
        e.data.departing = true;
        if (e.data.expungeNoted !== true) {
          e.data.expungeNoted = true;
          this._log(state, 'The Archive has no use for your story. The drones withdraw.');
        }
      }
      const copies = e.data.droneCopies || 0;
      if (copies >= ARCHIVE_PAGE_DRONES.maxCopiesPerDrone || e.data.departing) {
        // Full notebook — it leaves.
        e.data.departing = true;
        const dx = e.pos.x - player.pos.x, dz = e.pos.z - player.pos.z;
        e.vel.x = (dx / d) * ARCHIVE_PAGE_DRONES.approachSpeed;
        e.vel.z = (dz / d) * ARCHIVE_PAGE_DRONES.approachSpeed;
        e.pos.x += e.vel.x * dt; e.pos.z += e.vel.z * dt;
        if (d > ARCHIVE_PAGE_DRONES.departRange) this.helpers.removeEntity(e.id, { reason: 'page_drone_departed' });
        continue;
      }
      if (d > ARCHIVE_PAGE_DRONES.copyRange) {
        const dx = player.pos.x - e.pos.x, dz = player.pos.z - e.pos.z;
        e.vel.x = (dx / d) * ARCHIVE_PAGE_DRONES.approachSpeed;
        e.vel.z = (dz / d) * ARCHIVE_PAGE_DRONES.approachSpeed;
        e.pos.x += e.vel.x * dt; e.pos.z += e.vel.z * dt;
        continue;
      }
      // In range: it holds and copies.
      e.vel.x = player.vel.x; e.vel.z = player.vel.z;
      e.data.copyT = (Number(e.data.copyT) || 0) + dt;
      if (e.data.copyT >= copyTime) {
        e.data.copyT = 0;
        e.data.droneCopies = copies + 1;
        a.droneCopies += 1;
        a.copiedLogs.push({
          id: `copy_${a.droneCopies}`,
          at: state.simTime, tick: state.tick, sectorId: state.world?.currentSectorId || null,
          tradeGoodId: ARCHIVE_PAGE_DRONES.copiedTradeGoodId,
          note: `flight log page ${a.droneCopies}`,
          published: false, suppressed: false, soldAt: 0, royaltyCr: 0, suppressCr: 0,
        });
        this._accession(state, 'copied', `drone_${e.id}`);
        this.bus.emit('archive:logCopied', {
          droneId: e.id, copies: a.droneCopies, tick: state.tick,
        });
        this.bus.emit('comms:log', { text: ARCHIVE_PAGE_DRONES.copyLine, speaker: 'Archive' });
        if (a.droneCopies >= 40) this._cite(state, 'copies_40');
        else if (a.droneCopies >= 15) this._cite(state, 'copies_15');
        else if (a.droneCopies >= 5) this._cite(state, 'copies_5');
      }
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Index Head — a provenance read is filed; distinct reads are deeds
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Index Head: hold the Line on an object for scanTimeS and read its provenance —
   * owners, mass record, where it has been. The investigation tool for Books 5–7.
   * A read on a body the stacks have not indexed yet is filed as a deed — the
   * Index remembers who read for it.
   */
  _indexHead(state, dt) {
    for (const holder of state.entityList) {
      if (!holder || holder.alive === false || holder.data?.lineHeadId !== ARCHIVE_INDEX_HEAD.id) continue;
      const tether = holder.tether || (holder.id === state.playerId ? state.player?.tether : null);
      const target = tether && tether.active ? state.entities.get(tether.targetId) : null;
      const d = holder.data;
      if (!target || target.alive === false) { if (d.indexScanT) d.indexScanT = 0; continue; }
      d.indexScanT = (Number(d.indexScanT) || 0) + dt;
      // id + generation: a recycled target id is a new object, not a rescan.
      const scanKey = `${target.id}:${occupantGenerationOf(target) ?? 'x'}`;
      if (d.indexScanT >= ARCHIVE_INDEX_HEAD.scanTimeS && d.indexScanId !== scanKey) {
        d.indexScanId = scanKey;
        const record = this.provenanceScan(state, target);
        this.bus.emit('archive:indexRead', { holderId: holder.id, targetId: target.id, record, tick: state.tick });
        this.bus.emit('comms:log', {
          text: `INDEX: ${record.label} — ${record.owners.length} owner(s), mass ${record.mass}t${record.provenance ? `, ${record.provenance}` : ''}`,
          speaker: 'Index Head',
        });
        if (holder.id === state.playerId) this._fileIndexRead(state, target, record);
      }
    }
  },

  /** The provenance record an Index Head reads off a held object. */
  provenanceScan(state, target) {
    const d = target.data || {};
    const owners = [];
    if (d.ownerId != null) owners.push(d.ownerId);
    if (d.lastThrowerId != null && !owners.includes(d.lastThrowerId)) owners.push(d.lastThrowerId);
    if (d.thrownBy != null && !owners.includes(d.thrownBy)) owners.push(d.thrownBy);
    if (target.factionId && !owners.includes(target.factionId)) owners.push(target.factionId);
    if (d.provenance && typeof d.provenance === 'object') {
      for (const o of Array.isArray(d.provenance.owners) ? d.provenance.owners : []) {
        if (!owners.includes(o)) owners.push(o);
      }
    }
    return {
      entityId: target.id,
      label: d.name || d.typeId || target.type,
      mass: Number(target.mass) || 0,
      owners,
      worldRecordId: d.worldRecordId || null,
      provenance: d.provenance?.summary || d.pieceLabel || null,
      scannedAt: state.simTime,
    };
  },

  /**
   * File an index read: a body worth shelving has a durable key (world record,
   * manifest marker, authored provenance) — reads without one are noted by the
   * Index but earn no deed, or the board would pay for pointing at rocks.
   */
  _fileIndexRead(state, target, record) {
    const a = ensureArchiveState(state);
    const d = target.data || {};
    const key = _str(d.worldRecordId || d.markerId || d.aftermathMarkerId
      || (d.provenance && d.provenance.markerId) || null);
    if (key && a.indexed[key] == null) {
      a.indexed[key] = state.simTime;
      _capKeyed(a.indexed, STACKS.indexedKeys);
      this._deed(state, 'indexed', key);
      this.bus.emit('archive:indexFiled', { key, entityId: target.id, tick: state.tick });
      const n = Object.keys(a.indexed).length;
      if (n >= 20) this._cite(state, 'index_20');
      else if (n >= 5) this._cite(state, 'index_5');
    }
    // An open 'read' errand resolves on any fresh read — the Index did the work.
    const er = a.errands.open.find((r) => r.kind === 'read');
    if (er) this._settleErrand(state, er, 'read');
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // THE DESK — buyback, royalties, suppression, penance. Proximity is the verb.
  // ═══════════════════════════════════════════════════════════════════════════

  _tickDesk(state, desks) {
    const a = ensureArchiveState(state);
    const file = this._blackFile(state);
    const player = this._player(state);
    const desk = this._deskInRange(state, desks);
    if (desk && !this._deskHinted) {
      this._deskHinted = true;
      this._log(state, STACK_BARKS.deskOpen, 'Brother Index');
    }
    // The expunged get refused — the desk speaks the refusal on a gap clock.
    if (desk && file.expunged) {
      if (state.simTime - a.desk.refusedAt >= ARCHIVE_DESK.refuseBarkGapS) {
        a.desk.refusedAt = state.simTime;
        this.bus.emit('archive:deskRefused', { entityId: desk.e.id, tick: state.tick });
        this._log(state, STACK_BARKS.deskRefused);
      }
      return; // no trades, no offers — the stacks refuse the expunged
    }
    // Royalties post whether or not the pilot is at the desk — the stacks are
    // punctilious about money owed, and the sale is theirs to make.
    this._publishCopies(state, a);
    if (!desk || !player) return;
    this._buyFolios(state, a, desk);
    this._offerSuppression(state, a);
  },

  /** Copied logs age onto the open market — each sells once and pays a cut. */
  _publishCopies(state, a) {
    const tier = archiveTierFor(a.deeds).tier;
    let published = 0;
    for (const row of a.copiedLogs) {
      if (published >= ARCHIVE_DESK.publishPerTick) break;
      if (row.published === true || row.suppressed === true) continue;
      if (state.simTime - row.at < ARCHIVE_DESK.copyPublishDelayS) continue;
      // The royalty latch lands before the money speaks — a listener re-entering
      // on the grant can never publish the same page twice.
      row.published = true;
      row.soldAt = state.simTime;
      row.royaltyCr = Math.max(1, Math.round(
        ARCHIVE_DESK.copyRoyaltyCr * (1 + ARCHIVE_DESK.copyRoyaltyTierBonus * tier)));
      a.desk.royaltiesPaid += 1;
      a.desk.royaltiesCr += row.royaltyCr;
      this._grant(state, row.royaltyCr, 'archive:royalty');
      this._accession(state, 'published', row.id);
      this.bus.emit('archive:copyPublished', {
        logId: row.id, royaltyCr: row.royaltyCr, note: row.note, tick: state.tick,
      });
      this._log(state, `${STACK_BARKS.royalty} (${row.note}: ${row.royaltyCr}cr)`);
      published += 1;
    }
  },

  /**
   * The buyback: held quill folios are pages that belong in the stacks, and the
   * Archive pays over the street for them — names dearer, forgeries dearest.
   * A returned forgery is burned on receipt; every buyback writes notice relief
   * back onto the deserter's own ledger — the redactor pressure eases.
   */
  _buyFolios(state, a, desk) {
    const now = state.simTime;
    if (now < a.desk.nextBuyAt) return;
    const ledger = this._quillLedger(state);
    if (!ledger) return;
    let best = null; let bestPrice = -1;
    for (const f of ledger.folios) {
      if (!f || f.status !== 'held') continue;
      const p = quillFolioPrice(f, ledger, now);
      if (p > bestPrice) { best = f; bestPrice = p; }
    }
    if (!best) return;
    a.desk.nextBuyAt = now + ARCHIVE_DESK.buyCadenceS;
    const kind = best.kind === 'names' || best.kind === 'forgery' ? best.kind : 'manifest';
    const premium = kind === 'forgery' ? ARCHIVE_DESK.forgeryPremium
      : kind === 'names' ? ARCHIVE_DESK.namesPremium : ARCHIVE_DESK.premium;
    const tier = archiveTierFor(a.deeds);
    const pay = Math.max(1, Math.round(bestPrice * premium * tier.payMult));
    // Latch before the emit fan-out: the page is the Archive's the moment the
    // desk agrees — a re-entrant listener finds status 'sold' and moves on.
    ledger.saleSeq = (Math.floor(Number(ledger.saleSeq) || 0)) + 1;
    best.status = 'sold';
    best.soldAt = now;
    best.priceCr = pay;
    best.grantedCr = pay;
    best.saleSeq = ledger.saleSeq;
    best.buyer = 'the Archive';
    ledger.sold = (Math.floor(Number(ledger.sold) || 0)) + 1;
    ledger.earnedCr = (Math.floor(Number(ledger.earnedCr) || 0)) + pay;
    a.desk.foliosBought += 1;
    const forgery = best.forged === true || best.kind === 'forgery';
    if (forgery) {
      best.burned = true;
      a.desk.forgeriesBurned += 1;
    }
    // Returning pages calms the deserter's notice — one buyback, one relief.
    ledger.exposure = Math.max(0, quillExposureNow(ledger, now) - ARCHIVE_DESK.exposureRelief);
    ledger.exposureAt = now;
    this._grant(state, pay, `archive:folio:${kind}`);
    this.bus.emit('archive:folioBought', {
      folioId: best.id, kind: best.kind, priceCr: pay, burned: forgery,
      deskKind: desk.kind, tick: state.tick,
    });
    this._log(state, forgery ? STACK_BARKS.forgeryBurned : STACK_BARKS.folioBought);
    if (forgery) this._rep(state, 2, 'archive:forgery_returned');
    this._deed(state, 'folio_returned', best.id);
    this._cite(state, 'folio_returned_first');
    // A page's home wants the accession carried — arm the delivery.
    this._armDeliverErrand(state, best.sectorId, best.id);
  },

  /** The suppression offer: the oldest unpublished page can come off the shelf. */
  _offerSuppression(state, a) {
    const first = a.copiedLogs.find((r) => r.published !== true && r.suppressed !== true);
    if (!first) { if (a.desk.offer) a.desk.offer = null; return; }
    const logKey = first.id;
    const offer = a.desk.offer;
    if (offer && offer.logKey === logKey && offer.until > state.simTime) return;
    if (offer && offer.logKey === logKey && offer.until <= state.simTime
        && state.simTime - offer.until < ARCHIVE_DESK.offerTtlS) return; // breathe, re-offer
    a.desk.offer = {
      logKey,
      costCr: this._suppressCost(a),
      postedAt: state.simTime,
      until: state.simTime + ARCHIVE_DESK.offerTtlS,
    };
    this.bus.emit('archive:suppressOffered', {
      logKey, costCr: a.desk.offer.costCr, until: a.desk.offer.until, tick: state.tick,
    });
  },

  _suppressCost(a) {
    return Math.round(ARCHIVE_DESK.suppressCostCr
      * Math.pow(ARCHIVE_DESK.suppressCostGrowth, a.desk.suppressedCount));
  },

  /**
   * Buy your own page back off the shelf — the standing offer, or any live
   * unpublished row by id. Desk-gated; the charge is the Archive's price and
   * the suppression is permanent for that page.
   */
  archiveSuppressCopy(state, logKey = null) {
    const a = ensureArchiveState(state);
    if (!this._deskInRange(state)) return null;
    if (state.simTime < a.expungedUntil) return null;
    const key = _str(logKey) || (a.desk.offer && a.desk.offer.logKey) || null;
    if (!key) return null;
    const row = a.copiedLogs.find((r) => r.id === key && r.published !== true && r.suppressed !== true);
    if (!row) return null;
    const cost = this._suppressCost(a);
    // The latch lives inside the exact-payment commit: the sole writer proves
    // the balance, then the page latches suppressed and the charge lands — or
    // nothing happens at all. A thin wallet cannot take a page off the shelf
    // for free, and a doubled request still suppresses once: the latch inside
    // commit refuses its second run.
    const paid = this._chargeExact(state, cost, 'archive:suppress', () => {
      if (row.suppressed === true) return false;
      row.suppressed = true;
      row.suppressCr = cost;
      row.soldAt = state.simTime;
      a.desk.suppressedCount += 1;
      if (a.desk.offer && a.desk.offer.logKey === key) a.desk.offer = null;
      return true;
    });
    if (!paid) return null;
    this._accession(state, 'suppressed', key);
    this._cite(state, 'suppression_first');
    this.bus.emit('archive:copySuppressed', { logId: key, costCr: cost, tick: state.tick });
    this._log(state, STACK_BARKS.suppressed);
    return row;
  },

  /**
   * Amends: at a desk, pay the penance and the oldest open mark forgives early.
   * If the expunge was riding on that mark, the file reopens with it.
   */
  archiveDoPenance(state) {
    const a = ensureArchiveState(state);
    if (!this._deskInRange(state)) return null;
    const mark = a.marks.find((m) => m.forgiven !== true);
    if (!mark) return null;
    // Amends are an exact payment too: the forgiveness latches inside the
    // charge commit, so a thin wallet strikes no marks for free.
    const paid = this._chargeExact(state, ARCHIVE_DESK.penanceCostCr, 'archive:penance', () => {
      if (mark.forgiven === true) return false;
      mark.forgiven = true;
      mark.forgiveAt = state.simTime;
      return true;
    });
    if (!paid) return null;
    this._rep(state, ARCHIVE_DESK.penanceRep, 'archive:penance');
    this._accession(state, 'penance', mark.id);
    this._cite(state, 'penance_first');
    this.bus.emit('archive:penance', { markId: mark.id, costCr: ARCHIVE_DESK.penanceCostCr, tick: state.tick });
    this._log(state, STACK_BARKS.penance);
    // If the expunge is now under-subscribed, the file reopens with the payment.
    if (state.simTime < a.expungedUntil
        && this._openMarks(state).length < ARCHIVE_BLACK_FILE.expungeAt) {
      a.expungedUntil = state.simTime;
      // The penance speaks its own amnesty — clear the transition latch before
      // the emit, or the next _tickMarks reads the same reopening as a lapse
      // and voices archive:amnesty a second time.
      this._expungedWas = false;
      this.bus.emit('archive:amnesty', { cause: 'penance', tick: state.tick });
      this._log(state, STACK_BARKS.amnesty);
    }
    return mark;
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // THE ERRANDS — the accession board: carry, recover, read
  // ═══════════════════════════════════════════════════════════════════════════

  _tickErrands(state, desks) {
    const a = ensureArchiveState(state);
    const er = a.errands;
    const now = state.simTime;
    const player = this._player(state);

    // Expiry first — a page that waited too long closes the request.
    for (let i = er.open.length - 1; i >= 0; i--) {
      const row = er.open[i];
      if (now < row.expiresAt) continue;
      // The lost page drifts home with its request — an errand body must never
      // outlive its row, or a stale "the board wants it back" lie keeps
      // scanning (and burning it would file a mark over a closed request).
      if (row.kind === 'recover' && row.phase === 'seek' && row.folioId != null) {
        const folio = state.entities.get && state.entities.get(row.folioId);
        if (folio && folio.data?.archiveLostFolio === true
            && folio.data?.archiveErrandId === row.id
            && (row.folioGen == null || occupantGenerationOf(folio) === row.folioGen)) {
          this.helpers.removeEntity(folio.id, { reason: 'archive_errand_lapsed' });
        }
      }
      er.open.splice(i, 1);
      er.expired += 1;
      this._accession(state, 'errand_expired', row.id);
      this._rep(state, ARCHIVE_ERRANDS.expireRep, 'archive:errand_expired');
      this.bus.emit('archive:errandExpired', { errandId: row.id, kind: row.kind, tick: state.tick });
      this._log(state, STACK_BARKS.errandExpired, 'Brother Index');
    }

    // The recover board's field half: a lost folio waits to be taken up, a
    // carried one waits for a desk ring.
    for (let i = er.open.length - 1; i >= 0; i--) {
      const row = er.open[i];
      if (row.kind !== 'recover') continue;
      if (row.phase === 'seek') {
        const folio = row.folioId != null && state.entities.get
          ? state.entities.get(row.folioId) : null;
        const folioOk = folio && folio.alive !== false
          && folio.data && folio.data.archiveLostFolio === true && folio.data.archiveErrandId === row.id
          && (row.folioGen == null || occupantGenerationOf(folio) === row.folioGen);
        if (!folioOk) {
          // The page drifted back to the stacks — or was burned (the kill ear
          // files the burn; the row closes here either way).
          er.open.splice(i, 1);
          er.expired += 1;
          this.bus.emit('archive:errandExpired', { errandId: row.id, kind: row.kind, cause: 'lost', tick: state.tick });
          continue;
        }
        if (!player) continue;
        const tether = player.tether || state.player?.tether;
        const tethered = !!(tether && tether.active && tether.targetId === folio.id);
        const close = dist2(player.pos, folio.pos) <= ARCHIVE_ERRANDS.collectRadius ** 2;
        if (tethered || close) {
          // Taken up: the page rides the hold; the body leaves the field.
          row.phase = 'return';
          this.helpers.removeEntity(folio.id, { reason: 'archive_folio_carried' });
          this.bus.emit('archive:folioRecovered', { errandId: row.id, folioId: folio.id, tick: state.tick });
          this._log(state, STACK_BARKS.folioFound, 'Brother Index');
        }
        continue;
      }
      // phase 'return': any desk ring closes the carry.
      if (player && this._deskInRange(state, desks)) {
        this._settleErrand(state, row, 'recovered');
      }
    }

    // Posting: the board keeps room for one more while a desk is in reach.
    if (er.nextPostAt < 0) er.nextPostAt = now + ARCHIVE_ERRANDS.firstPostS;
    if (er.open.length >= ARCHIVE_ERRANDS.maxOpen || now < er.nextPostAt) return;
    if (!player || !this._deskInRange(state, desks)) return;
    er.nextPostAt = now + ARCHIVE_ERRANDS.postGapS;
    // The kind cycles deterministically off the board seq: a carry, a field
    // recovery, a read for the stacks — in turn, never two of one kind open.
    const kinds = ['deliver', 'recover', 'read'];
    const have = new Set(er.open.map((r) => r.kind));
    const free = kinds.filter((k) => !have.has(k));
    if (!free.length) return;
    const kind = free[hash32('archive-errand-kind', er.seq, Math.floor(now)) % free.length];
    this._postErrand(state, kind, desks);
  },

  /** Post one errand row; recover also drops the lost folio into the field. */
  _postErrand(state, kind, desks) {
    const a = ensureArchiveState(state);
    const er = a.errands;
    er.seq += 1;
    const now = state.simTime;
    const row = {
      id: `err_${er.seq}`, kind, sectorId: null, ref: null,
      folioId: null, folioGen: null, phase: 'seek',
      armedAt: now, expiresAt: 0, rewardCr: 0,
    };
    if (kind === 'deliver') {
      const sectorId = state.world && state.world.currentSectorId;
      const pool = ERRAND_SECTORS.filter((s) => s !== sectorId);
      row.sectorId = pool[hash32('archive-errand-sector', er.seq) % pool.length] || 'sector_pallas_drift';
      row.rewardCr = ARCHIVE_ERRANDS.deliverPayCr;
      row.expiresAt = now + ARCHIVE_ERRANDS.deliverTtlS;
    } else if (kind === 'recover') {
      const host = desks && desks.find((d) => d.kind !== 'courier');
      const anchor = (host && host.e) || (desks && desks[0] && desks[0].e) || null;
      if (!anchor || typeof this.helpers.spawnEntity !== 'function') return;
      const bearing = (hash32(row.id, 'archive-folio-bearing') % 6283) / 1000;
      const dist = ARCHIVE_ERRANDS.folioSpawnDist;
      const spec = {
        type: 'payload', factionId: FACTION_ID,
        pos: { x: anchor.pos.x + Math.cos(bearing) * dist, z: anchor.pos.z + Math.sin(bearing) * dist },
        vel: { x: 0, z: 0 }, radius: 7, mass: 6, hull: 24, hullMax: 24, collides: true,
        data: {
          archiveLostFolio: true, archiveErrandId: row.id,
          scannable: true, scanLabel: 'LOST FOLIO — a page out of the stacks, drifting',
          name: 'Lost Folio',
        },
      };
      const folio = this.helpers.spawnEntity(spec);
      if (!folio) return;
      row.folioId = folio.id;
      row.folioGen = occupantGenerationOf(folio);
      row.rewardCr = ARCHIVE_ERRANDS.recoverPayCr;
      row.expiresAt = now + ARCHIVE_ERRANDS.recoverTtlS;
      this._log(state, STACK_BARKS.folioLost, 'Brother Index');
    } else { // 'read'
      row.rewardCr = ARCHIVE_ERRANDS.readPayCr;
      row.expiresAt = now + ARCHIVE_ERRANDS.readTtlS;
    }
    er.open.push(row);
    this.bus.emit('archive:errandPosted', {
      errandId: row.id, kind, sectorId: row.sectorId, rewardCr: row.rewardCr,
      expiresAt: row.expiresAt, tick: state.tick,
    });
    if (kind !== 'recover') this._log(state, STACK_BARKS.errandPosted, 'Brother Index');
  },

  /** A buyback arms the page's journey home — carried entries ride the board. */
  _armDeliverErrand(state, sectorId, folioId) {
    const a = ensureArchiveState(state);
    const er = a.errands;
    const target = _str(sectorId);
    if (!target || target === (state.world && state.world.currentSectorId)) return;
    if (er.open.length >= ARCHIVE_ERRANDS.maxOpen) return;
    if (er.open.some((r) => r.kind === 'deliver' && r.sectorId === target && r.ref === _str(folioId))) return;
    er.seq += 1;
    const row = {
      id: `err_${er.seq}`, kind: 'deliver', sectorId: target, ref: _str(folioId),
      folioId: null, folioGen: null, phase: 'seek',
      armedAt: state.simTime, expiresAt: state.simTime + ARCHIVE_ERRANDS.deliverTtlS,
      rewardCr: ARCHIVE_ERRANDS.deliverPayCr,
    };
    er.open.push(row);
    this.bus.emit('archive:errandPosted', {
      errandId: row.id, kind: 'deliver', sectorId: target, rewardCr: row.rewardCr,
      expiresAt: row.expiresAt, tick: state.tick,
    });
    this._log(state, `The accession rides with you. Carry it home to ${target.replace('sector_', '').replace(/_/g, ' ')}.`, 'Brother Index');
  },

  /**
   * Settle an errand — once. The row leaves the open board BEFORE the purse and
   * the events speak, so a re-entrant listener finds the request already closed.
   */
  _settleErrand(state, row, how) {
    const a = ensureArchiveState(state);
    const i = a.errands.open.indexOf(row);
    if (i < 0) return;
    a.errands.open.splice(i, 1); // the latch: settled rows are out of the board
    a.errands.done += 1;
    const tier = archiveTierFor(a.deeds);
    const pay = Math.max(1, Math.round(row.rewardCr * tier.payMult));
    const rep = row.kind === 'deliver' ? ARCHIVE_ERRANDS.deliverRep
      : row.kind === 'recover' ? ARCHIVE_ERRANDS.recoverRep : ARCHIVE_ERRANDS.readRep;
    this._grant(state, pay, `archive:errand:${row.kind}`);
    this._rep(state, rep, `archive:errand_${row.kind}`);
    this._deed(state, `errand_${row.kind}`, row.id);
    this._cite(state, 'errand_1');
    if (a.errands.done >= 5) this._cite(state, 'errand_5');
    this.bus.emit('archive:errandSettled', {
      errandId: row.id, kind: row.kind, how, payCr: pay, tick: state.tick,
    });
    this._log(state, STACK_BARKS.errandSettled, 'Brother Index');
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // THE BLACK FILE — marks, annotation, expunge, circulation, forgiveness
  // ═══════════════════════════════════════════════════════════════════════════

  _onKilled(p) {
    const state = this.state;
    if (!p || !state) return;
    const victim = state.entities && state.entities.get ? state.entities.get(p.id) : null;
    // A kill receipt names a dead body — every real emitter flips `alive` before
    // the wire. A receipt for a still-living occupant is stale: the id it names
    // was recycled after the death it describes.
    if (victim && victim.alive !== false) return;
    if (victim && !victim.data) victim.data = {};
    const vd = (victim && victim.data) || {};
    if (vd.archiveKillSeen === true) return; // one death, one booking
    const byPlayer = p.killerId != null && p.killerId === state.playerId;

    // A burned lost folio: the page it carried is gone — close its errand, and
    // if the pilot struck it, file the burn. A page is the Archive's property.
    if (vd.archiveLostFolio === true) {
      vd.archiveKillSeen = true;
      const a = ensureArchiveState(state);
      const errandId = _str(vd.archiveErrandId);
      const row = a.errands.open.find((r) => r.id === errandId);
      if (row) {
        a.errands.open.splice(a.errands.open.indexOf(row), 1);
        a.errands.expired += 1;
        this.bus.emit('archive:errandExpired', { errandId: row.id, kind: row.kind, cause: 'burned', tick: state.tick });
      }
      if (byPlayer) {
        this._fileMark(state, {
          kind: 'lost_folio', victim: 'A LOST FOLIO', victimId: p.id,
          gen: victim ? occupantGenerationOf(victim) : null,
          delta: ARCHIVE_BLACK_FILE.folioRep, defense: false,
        });
      }
      return;
    }

    if (!byPlayer) return;
    const factionId = p.factionId || (victim && victim.factionId) || null;
    const isRoom = !!(victim && victim.type === 'station'
      && (victim.factionId === FACTION_ID || vd.archiveReadingRoom === true
        || READING_ROOM_STATIONS.has(vd.stationId)));
    const isArchive = vd.censorFrigate === true || vd.pageDrone === true
      || vd.archiveCourier === true || isRoom || factionId === FACTION_ID;
    if (!isArchive) return;

    // Dedup by id AND occupant generation: a replayed receipt names the same
    // body the file already wrote up, while a recycled id landing on a new dead
    // archivist is a genuinely second mark and must book again.
    const a = ensureArchiveState(state);
    const gen = victim ? occupantGenerationOf(victim) : null;
    const prior = a.marks.find((m) => m.victimId === p.id);
    if (prior) {
      if (victim == null || prior.gen == null || prior.gen === gen) return;
    }
    vd.archiveKillSeen = true;

    const defense = p.targetHostileToPlayer === true; // it drew first — the file notes it
    const half = (v) => Math.round(v / 2);
    if (isRoom) {
      // Burning an archive unites the galaxy: the file circulates to every shelf.
      this._fileMark(state, {
        kind: 'reading_room', victim: _str(vd.name || vd.stationId, 'A READING ROOM'),
        victimId: p.id, gen,
        delta: defense ? half(ARCHIVE_BLACK_FILE.roomRep) : ARCHIVE_BLACK_FILE.roomRep,
        defense,
      });
      for (const fid of CIRCULATE_FACTIONS) {
        this.bus.emit('faction:repDelta', {
          factionId: fid, delta: ARCHIVE_BLACK_FILE.roomCirculateRep, reason: 'archive:file_circulated',
        });
        a.circulated[fid] = (a.circulated[fid] || 0) + 1;
      }
      this.bus.emit('archive:fileCirculated', {
        factions: CIRCULATE_FACTIONS.length, cause: 'reading_room', tick: state.tick,
      });
      this._log(state, 'You burned a reading room. Every shelf reads your name now.');
      return;
    }
    const kind = vd.censorFrigate === true ? 'censor'
      : vd.pageDrone === true ? 'page_drone'
      : vd.archiveCourier === true ? 'courier' : 'archivist';
    const delta = kind === 'censor' ? ARCHIVE_BLACK_FILE.censorRep
      : kind === 'page_drone' ? ARCHIVE_BLACK_FILE.droneRep
      : kind === 'courier' ? ARCHIVE_BLACK_FILE.courierRep : ARCHIVE_BLACK_FILE.archivistRep;
    this._fileMark(state, {
      kind, victimId: p.id, gen,
      victim: _str(vd.name || vd.callsign || vd.scanLabel,
        kind === 'censor' ? 'A CENSOR' : kind === 'page_drone' ? 'A PAGE DRONE'
          : kind === 'courier' ? 'A COURIER SKIFF' : 'AN ARCHIVIST'),
      delta: defense ? half(delta) : delta, defense,
    });
    if (kind === 'censor' && !defense) {
      // The Archive publishes your file where it hurts — one shelf, hashed off the kill.
      const fid = CIRCULATE_FACTIONS[hash32('archive-circulate', p.id, a.seq) % CIRCULATE_FACTIONS.length];
      this.bus.emit('faction:repDelta', {
        factionId: fid, delta: ARCHIVE_BLACK_FILE.circulateRep, reason: 'archive:file_circulated',
      });
      a.circulated[fid] = (a.circulated[fid] || 0) + 1;
      this.bus.emit('archive:fileCirculated', { factions: 1, factionId: fid, cause: 'censor', tick: state.tick });
      this._log(state, STACK_BARKS.circulated);
    }
  },

  /**
   * File a mark: the row lands, the annotation arms, the rep moves, the events
   * speak — in that order, so a listener re-entering reads the file already
   * written. Enough open marks and the stacks expunge the pilot.
   */
  _fileMark(state, { kind, victim, victimId = null, gen = null, delta = -5, defense = false }) {
    const a = ensureArchiveState(state);
    a.seq += 1;
    const mark = {
      id: `mark_${a.seq}`, kind, victim, victimId, gen,
      at: state.simTime, forgiven: false,
      forgiveAt: state.simTime + ARCHIVE_BLACK_FILE.markTtlS, defense,
    };
    a.marks.push(mark);
    _capArr(a.marks, STACKS.markRows);
    a.annotatedUntil = Math.max(a.annotatedUntil, state.simTime + ARCHIVE_BLACK_FILE.annotatedS);
    this._accession(state, 'marked', mark.id);
    this._rep(state, delta, `archive:mark_${kind}`);
    this.bus.emit('archive:marked', {
      markId: mark.id, kind, victim, delta, defense, tick: state.tick,
    });
    this.bus.emit('archive:annotated', { until: a.annotatedUntil, tick: state.tick });
    this._log(state, STACK_BARKS.marked);
    // The expunge: too many open marks and the stacks close entirely.
    const open = this._openMarks(state).length;
    if (open >= ARCHIVE_BLACK_FILE.expungeAt && state.simTime >= a.expungedUntil) {
      a.expungedUntil = state.simTime + ARCHIVE_BLACK_FILE.expungedS;
      this.bus.emit('archive:expunged', { until: a.expungedUntil, openMarks: open, tick: state.tick });
      this._log(state, STACK_BARKS.expunged);
    }
    return mark;
  },

  /** The file's own clock: marks forgive, the expunge's lapse speaks amnesty. */
  _tickMarks(state) {
    const a = ensureArchiveState(state);
    for (const m of a.marks) {
      if (m.forgiven === true) continue;
      if (state.simTime < m.forgiveAt) continue;
      m.forgiven = true;
      this.bus.emit('archive:markForgiven', { markId: m.id, kind: m.kind, tick: state.tick });
      this._log(state, STACK_BARKS.forgiven);
    }
    const expunged = state.simTime < a.expungedUntil;
    if (this._expungedWas === true && !expunged && a.expungedUntil > 0) {
      if (this._openMarks(state).length >= ARCHIVE_BLACK_FILE.expungeAt) {
        // The marks still stand — the file stays shut. No amnesty, no bark,
        // just the door staying closed until the last note forgives out.
        a.expungedUntil = state.simTime + ARCHIVE_BLACK_FILE.expungedS;
        this.bus.emit('archive:expunged', {
          until: a.expungedUntil, openMarks: this._openMarks(state).length, tick: state.tick,
        });
      } else {
        this.bus.emit('archive:amnesty', { cause: 'lapse', tick: state.tick });
        this._log(state, STACK_BARKS.amnesty);
      }
    }
    this._expungedWas = state.simTime < a.expungedUntil;
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // THE COURIERS — a bounded cast walking between Archive bodies, each a desk
  // ═══════════════════════════════════════════════════════════════════════════

  _tickCouriers(state, dt, desks) {
    const a = ensureArchiveState(state);
    const tr = a.traffic;
    const sectorId = _str(state.world && state.world.currentSectorId);
    if (tr.sectorId !== sectorId) {
      tr.sectorId = sectorId;
      tr.sent = 0;
      tr.nextSpawnAt = -1;
      tr.live = {};
      // The field cast shares the visit bag: a fresh sector reseeds its books.
      tr.censorSent = 0;
      tr.droneSent = 0;
      tr.nextFieldAt = -1;
    }
    // Presence sweep: live records name bodies that must still be couriers.
    const seen = new Set();
    const couriers = [];
    for (const e of state.entityList) {
      if (!e || e.alive === false || e.data?.archiveCourier !== true) continue;
      const key = `${e.id}:${occupantGenerationOf(e) ?? 'x'}`;
      seen.add(key);
      couriers.push({ e, key });
    }
    for (const key of Object.keys(tr.live)) {
      if (!seen.has(key)) delete tr.live[key];
    }

    // Spawn: a cast walks only where a desk stands, bounded per sector visit.
    const player = this._player(state);
    if (desks.length && player && couriers.length < ARCHIVE_COURIERS.maxLive
        && tr.sent < ARCHIVE_COURIERS.sentPerSector) {
      if (tr.nextSpawnAt < 0) tr.nextSpawnAt = state.simTime + ARCHIVE_COURIERS.firstSpawnS;
      if (state.simTime >= tr.nextSpawnAt) {
        // Latch the beat before the spawn's emit fan-out — a listener
        // re-entering the tick finds the clock already moved.
        tr.nextSpawnAt = state.simTime + ARCHIVE_COURIERS.spawnGapS;
        const spawned = this._spawnCourier(state, desks);
        if (spawned) tr.sent += 1;
        else tr.nextSpawnAt = state.simTime + ARCHIVE_COURIERS.retryS;
      }
    }

    // Walk, hail, arrive.
    for (const { e, key } of couriers) {
      const rec = tr.live[key] || (tr.live[key] = {
        name: _str(e.data.courierName, 'SKIFF'), destId: null, destGen: null, hailed: false,
      });
      if (e.data.courierUntil != null && state.simTime > e.data.courierUntil) {
        this.helpers.removeEntity(e.id, { reason: 'courier_route_done' });
        delete tr.live[key];
        continue;
      }
      // The destination is re-proven against the body's own stamps every tick.
      let dest = rec.destId != null && state.entities.get ? state.entities.get(rec.destId) : null;
      let destOk = dest && dest.alive !== false
        && (rec.destGen == null || occupantGenerationOf(dest) === rec.destGen);
      if (!destOk) {
        const next = this._pickCourierDest(state, e, desks);
        if (!next) {
          this.helpers.removeEntity(e.id, { reason: 'courier_orphaned' });
          delete tr.live[key];
          continue;
        }
        rec.destId = next.id;
        rec.destGen = occupantGenerationOf(next);
        dest = next;
        destOk = true;
      }
      // The hail: come close once and the skiff speaks for its desk.
      if (!rec.hailed && player
          && dist2(e.pos, player.pos) <= ARCHIVE_COURIERS.hailRadius ** 2) {
        rec.hailed = true;
        this.bus.emit('archive:courierHail', { entityId: e.id, name: rec.name, tick: state.tick });
        this._log(state, STACK_BARKS.courierHail, rec.name);
      }
      const d = Math.sqrt(dist2(e.pos, dest.pos));
      if (d <= ARCHIVE_COURIERS.arriveRadius) {
        // Docked: the page changes hands, the skiff leaves the cast.
        this.helpers.removeEntity(e.id, { reason: 'courier_arrived' });
        delete tr.live[key];
        this.bus.emit('archive:courierArrived', { entityId: e.id, name: rec.name, tick: state.tick });
        this._log(state, STACK_BARKS.courierArrived, rec.name);
        continue;
      }
      // Homing delta-v through the impulse membrane — the same steer the
      // redactor flies; the courier's vel stays the membrane's, never ours.
      const want = ARCHIVE_COURIERS.speed * Math.min(1, d / (ARCHIVE_COURIERS.arriveRadius * 2));
      const vx = Number.isFinite(e.vel && e.vel.x) ? e.vel.x : 0;
      const vz = Number.isFinite(e.vel && e.vel.z) ? e.vel.z : 0;
      if (e.mass > 0 && d > 0) {
        queuePhysicsImpulse(e, {
          x: (((dest.pos.x - e.pos.x) / d) * want - vx) * e.mass,
          z: (((dest.pos.z - e.pos.z) / d) * want - vz) * e.mass,
        }, { tick: state.tick });
      }
    }
    _capKeyed(tr.live, STACKS.liveRows);
  },

  /** The courier's next shelf: an Archive body that is not the courier itself. */
  _pickCourierDest(state, courier, desks) {
    const bodies = [];
    for (const d of desks) {
      if (d.e && d.e !== courier && d.e.alive !== false && d.kind !== 'courier') bodies.push(d.e);
    }
    for (const e of state.entityList) {
      if (!e || e === courier || e.alive === false || e.data?.archiveCourier === true) continue;
      if (e.factionId === FACTION_ID || e.data?.censorFrigate === true || e.data?.pageDrone === true) {
        if (!bodies.includes(e)) bodies.push(e);
      }
    }
    if (!bodies.length) return null;
    return bodies[hash32('archive-courier-dest', courier.id, Math.floor(state.simTime)) % bodies.length];
  },

  /** Spawn one skiff beside a desk, bound for another Archive body. */
  _spawnCourier(state, desks) {
    if (typeof this.helpers.spawnEntity !== 'function') return null;
    const a = ensureArchiveState(state);
    const tr = a.traffic;
    const src = desks[hash32('archive-courier-src', tr.sectorId, tr.sent) % desks.length];
    if (!src || !src.e) return null;
    const name = COURIER_NAMES[tr.sent % COURIER_NAMES.length];
    const angle = (hash32('archive-courier-angle', tr.sectorId, tr.sent) % 6283) / 1000;
    const off = (Number(src.e.radius) || 40) + 70;
    const spec = {
      type: 'drone', factionId: FACTION_ID,
      pos: { x: src.e.pos.x + Math.cos(angle) * off, z: src.e.pos.z + Math.sin(angle) * off },
      vel: { x: 0, z: 0 }, radius: 7, mass: 10, hull: 40, hullMax: 40, collides: true,
      homeSectorId: tr.sectorId,
      data: {
        archiveCourier: true, courierSeq: tr.sent,
        courierName: name, courierUntil: state.simTime + ARCHIVE_COURIERS.ttlS,
        callsign: name, scannable: true,
        scanLabel: `${name} — an acolyte skiff walking the stacks; its desk travels with it`,
        scannerSignalKind: 'archive',
      },
    };
    const e = this.helpers.spawnEntity(spec);
    if (!e) return null;
    const dest = this._pickCourierDest(state, e, desks);
    const key = `${e.id}:${occupantGenerationOf(e) ?? 'x'}`;
    tr.live[key] = {
      name, hailed: false,
      destId: dest ? dest.id : null,
      destGen: dest ? occupantGenerationOf(dest) : null,
    };
    this.bus.emit('archive:courierSpawn', {
      entityId: e.id, name, sectorId: tr.sectorId, tick: state.tick,
    });
    return e;
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // THE FIELD CAST — censors and page drones, seeded where the stacks hold
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * The Archive's field cast walks the home sectors: one censor frigate and a
   * pair of page drones at most, seeded off the pilot on deterministic bearings.
   * The desk, the pulse ear, the copy ear, and the kill ear already read these
   * flags — this tick is the writer that makes them true in the live world.
   */
  _tickFieldCast(state) {
    const a = ensureArchiveState(state);
    const tr = a.traffic;
    const sectorId = _str(state.world && state.world.currentSectorId);
    const player = this._player(state);
    // Presence sweep: live caps count every flagged body in the sector, cast or
    // foreign — a hull someone else fielded still fills the Archive's book.
    let liveCensors = 0; let liveDrones = 0;
    for (const e of state.entityList) {
      if (!e || e.alive === false) continue;
      const d = e.data || {};
      // Cast hulls age out anywhere they happen to stand — a body carried out
      // of its home sector still expires instead of drifting forever.
      if (d.archiveFieldCast === true && d.fieldUntil != null
          && state.simTime > _num(d.fieldUntil, 0)) {
        this.helpers.removeEntity(e.id, { reason: 'archive_field_ttl' });
        continue;
      }
      if (d.censorFrigate === true) liveCensors += 1;
      else if (d.pageDrone === true) liveDrones += 1;
    }
    if (ARCHIVE_FIELD.sectors.indexOf(sectorId) < 0 || !player) return;
    const file = this._blackFile(state);
    const wantCensor = liveCensors < ARCHIVE_FIELD.censorLiveMax
      && tr.censorSent < ARCHIVE_FIELD.censorsPerSector;
    // The drones will not even record the expunged — none rise while the file
    // is shut, and the ones already out turn for home on the copy ear's own rule.
    const wantDrone = !file.expunged && liveDrones < ARCHIVE_FIELD.droneLiveMax
      && tr.droneSent < ARCHIVE_FIELD.dronesPerSector;
    if (!wantCensor && !wantDrone) return;
    if (tr.nextFieldAt < 0) tr.nextFieldAt = state.simTime + ARCHIVE_FIELD.firstSpawnS;
    if (state.simTime < tr.nextFieldAt) return;
    // The censor is the patrol — it answers first when a slot is open.
    const kind = wantCensor ? 'censor' : 'drone';
    const seq = wantCensor ? tr.censorSent : tr.droneSent;
    // Latch the beat before the spawn's emit — same contract as the couriers.
    tr.nextFieldAt = state.simTime + ARCHIVE_FIELD.spawnGapS;
    const spawned = this._spawnFieldHull(state, kind, seq);
    if (spawned) { if (wantCensor) tr.censorSent += 1; else tr.droneSent += 1; }
    else tr.nextFieldAt = state.simTime + ARCHIVE_FIELD.retryS;
  },

  /** One cast hull on a deterministic bearing, out past the pulse radius. */
  _spawnFieldHull(state, kind, seq) {
    if (typeof this.helpers.spawnEntity !== 'function') return null;
    const tr = ensureArchiveState(state).traffic;
    const player = this._player(state);
    if (!player) return null;
    const bearing = (hash32('archive-field-bearing', tr.sectorId, kind, seq) % 6283) / 1000;
    const span = Math.max(1, ARCHIVE_FIELD.spawnDistMax - ARCHIVE_FIELD.spawnDistMin);
    const dist = ARCHIVE_FIELD.spawnDistMin
      + (hash32('archive-field-dist', tr.sectorId, kind, seq) % span);
    const pos = {
      x: player.pos.x + Math.cos(bearing) * dist,
      z: player.pos.z + Math.sin(bearing) * dist,
    };
    const names = FIELD_NAMES[kind] || FIELD_NAMES.drone;
    const name = names[seq % names.length];
    const until = state.simTime + ARCHIVE_FIELD.ttlS;
    const spec = kind === 'censor' ? {
      type: 'ship', team: 1, factionId: FACTION_ID,
      pos, vel: { x: 0, z: 0 }, radius: 20, mass: 80, hull: 500, hullMax: 500,
      collides: true, homeSectorId: tr.sectorId,
      data: {
        censorFrigate: true, role: 'censor-frigate', name: 'Censor Frigate',
        callsign: name, scannable: true,
        scanLabel: 'CENSOR FRIGATE — it never destroys; it seals',
        scannerSignalKind: 'archive',
        archiveFieldCast: true, fieldUntil: until,
      },
    } : {
      type: 'drone', team: 1, factionId: FACTION_ID,
      pos, vel: { x: 0, z: 0 }, radius: 5, mass: 2, hull: 10, hullMax: 10,
      collides: true, homeSectorId: tr.sectorId,
      data: {
        pageDrone: true, name: 'Page Drone',
        callsign: name, scannable: true,
        scanLabel: 'PAGE DRONE — it is only here to read you',
        scannerSignalKind: 'archive',
        archiveFieldCast: true, fieldUntil: until,
      },
    };
    const e = this.helpers.spawnEntity(spec);
    if (!e) return null;
    this.bus.emit('archive:fieldCastSpawn', {
      entityId: e.id, kind, sectorId: tr.sectorId, tick: state.tick,
    });
    return e;
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Seams: sector entry resolves deliveries; restore rebinds, never re-pays
  // ═══════════════════════════════════════════════════════════════════════════

  _onSectorEnter(p) {
    const state = this.state;
    if (!state || !p || typeof p.sectorId !== 'string') return;
    this._deskHinted = false; // the next desk speaks fresh
    const a = ensureArchiveState(state);
    // Arrival IS the delivery: the carried entry resolves where it was wanted.
    for (let i = a.errands.open.length - 1; i >= 0; i--) {
      const row = a.errands.open[i];
      if (row.kind === 'deliver' && row.sectorId === p.sectorId) {
        this._settleErrand(state, row, 'delivered');
      }
    }
  },

  /**
   * Runs on save:loaded, after every restore seam has settled — respawned bodies
   * exist by then, so recorded occupant generations rebind to the live hulls
   * that still carry the matching tags. A row whose body is truly gone keeps
   * its cold generation, so the tick expires the errand honestly instead of
   * adopting an impostor at a recycled id. Nothing here grants progress.
   */
  _afterRestore() {
    const state = this.state;
    if (!state) return;
    const a = ensureArchiveState(state);
    const get = (id) => (state.entities && id != null ? state.entities.get(id) : null);
    for (const row of a.errands.open) {
      if (row.kind !== 'recover' || row.phase !== 'seek' || row.folioId == null) continue;
      const e = get(row.folioId);
      if (e && e.data && e.data.archiveLostFolio === true && e.data.archiveErrandId === row.id) {
        row.folioGen = occupantGenerationOf(e) ?? row.folioGen;
      }
    }
    // Courier live records key on id:generation — a restore re-stamps both, so
    // the bag is bleed-over from the pre-load session. The presence sweep would
    // drop them anyway; clearing here keeps the first post-load tick cheap.
    a.traffic.live = {};
    // The amnesty latch is a transition detector over the book, and a restore
    // swaps the book mid-flight: re-baseline it. A file already shut (or
    // already closed) in the loaded save is a state, not an edge — without
    // this the first post-load tick voices a phantom archive:amnesty.
    this._expungedWas = state.simTime < a.expungedUntil;
  },

  update(dt, state) {
    ensureArchiveState(state);
    this._tickCensors(state);
    this._tickPageDrones(state, dt);
    this._indexHead(state, dt);
    // The file's clock always runs — forgiveness and amnesty are the Archive's,
    // never the pilot's, so they keep time docked or flying.
    this._tickMarks(state);
    // Sector-scale business only moves while the pilot is flying: an errand
    // must never lapse with zero agency because the pilot was docked.
    if (state.mode !== 'flight') return;
    const desks = this._scanDesks(state);
    this._tickDesk(state, desks);
    this._tickErrands(state, desks);
    this._tickCouriers(state, dt, desks);
    this._tickFieldCast(state);
  },
};

export { ARCHIVE_READING_ROOM };
export default archiveRedaction;
