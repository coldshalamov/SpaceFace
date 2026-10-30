// faction_choir.js — W-CHOIR (build_map §34.5 row 528, bible 02 §8).
//
// "The relic reports home. The shrine is home." Done-when:
//   · Bell ships pulse resonance on a beat — crystal inside the field hums, then
//     shatters; a shatter hums crystal near it, so thrown crystal chains (E-23)
//   · ribbon VFX: every pulse emits `choir:bellPulse` carrying the ribbon spec
//   · the Carried Relic pings your position to every Choir ship inside a shrine's
//     reach; crack the casing on a rock above impact speed before the shrine
//     radius, or arrive with the choir behind you (E-22)
//   · Bell Head: whatever your Line slams rings, and the ring shatters nearby
//     crystal the same way a Bell does
//   · the mark: cracked relics delivered to a shrine pile up as tribute
//
// The rites grown around those bones (same system, same ledger):
//   · SANCTUARY — a shrine's radius is holy ground. Entering stamps the pilgrim
//     ledger; crossing shrine→shrine inside the window completes a leg and pays
//     the pilgrim's due; stamping every shrine standing completes a circuit.
//     The sanctuary standing is earned ('marked') or forfeited ('banished'):
//     killing the faithful, slaying a bell or a shrine, or crossing a shrine
//     with a sealed relic all enter the sacrilege ledger and banish you —
//     marked pilgrims pass toll-free and their relics do not report.
//   · TITHE — a laden hold crossing a shrine radius owes the keepers a tithe.
//     The marked are waived; the banished pay double; the broke are stinted.
//   · OFFERINGS — jettison a crystal pod beside a shrine or a Bell and the
//     choir takes it up: small offerings buy the Vigil (a consecrated casing —
//     your relic stays silent), mid offerings buy the Chorister tithe (shatters
//     near you yield a devotional), and great offerings buy the Sanctum mark.
//   · PILGRIMS — bounded procession traffic: pilgrim ships walk shrine→shrine;
//     fly the leg beside them and the congregation pays an escort purse.
//   · HERESY — off-note dissenters are marked out of the shrine; the choir wants
//     them silenced and pays a bounty. The ledger is open: an escaped heretic
//     lapses, a slain one resolves. Heretics are the one Choir hull you may kill.
//
// Deterministic: pulse and ping clocks read simTime; spawn picks read state.rng
// or stable hashes; no wall time, no Math.random. The ledger is plain JSON.

import {
  CHOIR_BELLS,
  CHOIR_RIBBONS,
  CHOIR_CARRIED_RELIC,
  CHOIR_BELL_HEAD,
  CHOIR_SHRINE,
} from '../data/factions/choir.js';
import { occupantGenerationOf } from '../core/entity.js';
import { makeShipEntitySpec } from './ships.js';

const FACTION_ID = 'faction_choir';
const dist2 = (a, b) => { const dx = a.x - b.x, dz = a.z - b.z; return dx * dx + dz * dz; };
const touching = (a, b) => dist2(a.pos, b.pos) <= (a.radius + b.radius + 2) ** 2;
// Frozen: velOf hands this out for velocity reads — a write through it must
// throw loudly, never silently poison every later read of a missing `vel`.
const SPEED_ZERO = Object.freeze({ x: 0, z: 0 });
const velOf = (e) => (e && e.vel) || SPEED_ZERO;
const relSpeed = (a, b) => Math.hypot(velOf(a).x - velOf(b).x, velOf(a).z - velOf(b).z);

// ── The rites (tuning, frozen) ────────────────────────────────────────────────
const CHOIR_RITES = Object.freeze({
  // Sanctuary: a shrine's radius is the same reach the relic reports home inside.
  sanctuaryRadius: 800,
  mendPerS: 1.5,               // the marked are knit while they stand in sanctuary
  markedDurS: 600,             // earned sanctuary lasts this long
  banishedDurS: 420,           // sacrilege banishes you this long
  // Pilgrimage: stamps, legs, circuits.
  legWindowS: 300,             // shrine→shrine inside this window is a true leg
  legPurseCr: 90,
  legRep: 2,
  circuitMinShrines: 2,        // one shrine alone is a vigil, not a pilgrimage
  circuitPurseCr: 220,
  circuitRep: 4,
  // Tithe: a laden hold owes the keepers.
  titheMinUnits: 6,
  titheBaseCr: 25,
  tithePerUnitCr: 4,
  titheCapCr: 120,
  titheRep: 2,
  titheBanishedMult: 2,
  // Offerings: crystal pods the choir takes up.
  offeringCommodities: Object.freeze(['cmdty_crystal_lumin', 'cmdty_crystal_silica']),
  offeringRadiusShrine: 720,
  offeringRadiusBell: 620,     // = CHOIR_BELLS.pulseRadius
  offeringMaxPerTick: 4,
  // The three blessings, by offering size.
  vigilMinUnits: 1,            // a consecrated casing — your relic stays silent
  vigilDurS: 180,
  vigilRep: 1,
  choristerMinUnits: 3,        // shatters near you yield a devotional
  choristerDurS: 240,
  choristerRep: 2,
  choristerYieldCr: 160,       // total pool per blessing
  choristerPerShatterCr: 6,
  choristerRadius: 900,
  sanctumMinUnits: 6,          // the mark — sanctuary rights for a while
  sanctumDurS: 300,
  sanctumRep: 3,
  // Pilgrim traffic: a bounded procession cast per sector visit.
  pilgrimMaxLive: 2,
  pilgrimSentPerSector: 3,
  pilgrimSpawnGapS: 75,
  pilgrimSpeed: 42,
  pilgrimEscortRadius: 420,
  pilgrimHailRadius: 900,      // the escort request reaches this far
  pilgrimArriveRadius: 300,
  pilgrimEscortMinS: 8,        // shorter company earns no purse
  pilgrimPurseBaseCr: 40,
  pilgrimPursePerSCr: 2,
  pilgrimPurseCapCr: 220,
  pilgrimEscortRep: 3,
  // Heresy: open dissenter marks, bounded.
  heresyMaxMarks: 4,
  heresyMaxLive: 1,            // one hunted dissenter at a time
  heresyFirstMarkDelayS: 45,
  heresyMarkGapS: 240,
  heresyLapseS: 420,           // a mark this old escapes the liturgy
  heresyFleeSpeed: 55,
  heresyDriftRange: 2400,
  heresyBountyCr: 140,
  heresyRep: 5,
  // Ledger caps.
  tributeRows: 16,
  sacrilegeRows: 16,
  offeringRows: 24,
  legRows: 24,
  paidLegKeys: 48,
  visitKeys: 16,
  titheRows: 24,
  pilgrimLiveRows: 6,
  pilgrimLogRows: 12,
  heresyRows: 8,
});

// The crystals the choir accepts as offerings.
const OFFERING_SET = new Set(CHOIR_RITES.offeringCommodities);

// Procession names — the nth pilgrim of a sector takes the nth canonical hour.
const PILGRIM_NAMES = Object.freeze([
  'PILGRIM · LAUDS', 'PILGRIM · PRIME', 'PILGRIM · TERCE',
  'PILGRIM · SEXT', 'PILGRIM · NONES', 'PILGRIM · VESPERS',
  'PILGRIM · COMPLINE', 'PILGRIM · MATINS',
]);

// Off-note names for the heresy ledger.
const HERETIC_NAMES = Object.freeze([
  'CANTOR VEL, OFF-NOTE', 'SISTER IO OF THE CRACKED BELL',
  'BROTHER ANSEL THE FLAT', 'PREBEND RHO UNRUNG',
  'DEACON MIRA HALF-PSALM', 'OBLATE SEV WHO STOPPED SINGING',
  'CANTOR JUL OF THE WRONG KEY', 'WARDEN BETH UNBLESSED',
]);

const RITES_BARKS = Object.freeze({
  visit: 'The shrine marks your passage.',
  leg: 'One shrine to the next — the road sings between them.',
  circuit: 'The circuit is rung. Every bell knows your name.',
  tithePaid: 'The tithe is received. Travel in the chord.',
  tithePenance: 'Penance is a tithe doubled. The ledger remembers.',
  titheStinted: 'A stinted tithe. The choir hears what you could not give.',
  titheWaived: 'The marked owe nothing. Pass in the song.',
  offering: 'The offering is taken up. The bells answer.',
  vigil: 'Your casing is consecrated. It will not report home.',
  chorister: 'The choir counts your shatters. Every one pays.',
  sanctum: 'The mark is on you. Sanctuary is yours while it holds.',
  sacrilege: 'Sacrilege is written. The Saint keeps ledgers too.',
  banished: 'You are out of the chord. The shrines are closed to you.',
  pilgrimHail: 'Walk with us to the shrine, offworlder. The road is safer shared.',
  pilgrimArrived: 'The pilgrim stands at the shrine. Your company is remembered.',
  pilgrimLost: 'A pilgrim is unmade. The song carries one less voice.',
  heresyMarked: 'An off-note sounds. The choir names the dissenter.',
  heresyResolved: 'The off-note is silenced. The choir pays its bounty.',
  heresyLapsed: 'The dissenter slipped the liturgy. The mark stands open no more.',
});

/** Crystal is a material, not a type — any body stamped crystalline answers the bell. */
export function isCrystal(e) {
  const d = e && e.data;
  if (!d) return false;
  return d.material === 'crystal' || d.substance === 'crystal'
    || d.asteroidType === 'ast_crystalline' || d.typeId === 'ast_crystalline';
}

// ── Normalization helpers ─────────────────────────────────────────────────────
const _num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const _int = (v, d = 0) => Math.max(0, Math.floor(_num(v, d)));
// Only a plain object is JSON-safe ledger state: a Map/Set/class instance would
// accept normalizer writes as invisible properties and serialize to {} on save.
const _obj = (v) => (v && typeof v === 'object' && !Array.isArray(v)
  && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null) ? v : {});
const _str = (v, d = null) => (typeof v === 'string' && v ? v : d);
/** A visit row the pilgrim is standing in right now — unevictable (see _capKeyed). */
const _insideRow = (row) => !!(row && row.inside === true);

/** Keep at most `max` array rows — drop the oldest so the ledger stays bounded. */
function _capArr(arr, max) {
  while (arr.length > max) arr.shift();
  return arr;
}

/** Keep at most `max` keys in a keyed record — evict the lowest `at` stamps.
 *  Scalar rows (a bare simTime value, like paidLegs) rank by their own value.
 *  `exempt` rows are unevictable — a shrine the pilgrim is still inside must not
 *  lose its `inside` flag, or the next tick re-fires the crossing edge (stamp,
 *  tithe, leg, and circuit) without a real crossing. */
function _capKeyed(obj, max, stampKey = 'at', exempt = null) {
  const keys = Object.keys(obj);
  if (keys.length <= max) return obj;
  const rank = (k) => {
    const v = obj[k];
    return v && typeof v === 'object' ? _num(v[stampKey], 0) : _num(v, 0);
  };
  const drop = keys.filter((k) => !(exempt && exempt(obj[k])));
  drop.sort((a, b) => rank(a) - rank(b));
  let overflow = keys.length - max;
  for (const k of drop) {
    if (overflow <= 0) break;
    delete obj[k];
    overflow -= 1;
  }
  return obj;
}

/** One normalized blessing record: `until` a simTime, `yieldLeft` a credit pool.
 *  Normalizes in place — a caller holding a blessing row must keep the live one. */
function _normBlessing(v) {
  const b = _keepKeys(_obj(v), BLESSING_KEYS);
  const until = _num(b.until, -1);
  if (until < 0) return null;
  b.until = until;
  if (Number.isFinite(Number(b.yieldLeft))) b.yieldLeft = Math.max(0, Number(b.yieldLeft));
  else delete b.yieldLeft;
  return b;
}

// Row key whitelists — normalization strips anything else so the ledger stays
// plain JSON even when a save row carries junk from a hand-cut fixture.
const SACRILEGE_KEYS = new Set(['at', 'kind', 'victim', 'victimId', 'victimGen', 'pos']);
const TRIBUTE_KEYS = new Set(['relicId', 'shrineId', 'at']);
const SANCTUARY_KEYS = new Set(['standing', 'until', 'earned', 'violations']);
const OFFERING_KEYS = new Set(['at', 'units', 'commodityId', 'blessing', 'nearId', 'tick']);
const BLESSING_KEYS = new Set(['until', 'yieldLeft']);
const VISIT_KEYS = new Set(['at', 'inside', 'n', 'seq']);
const LEG_KEYS = new Set(['from', 'to', 'at', 'tick']);
const RECEIPT_KEYS = new Set(['token', 'key', 'due', 'paid', 'kind', 'at']);
const PILGRIM_LIVE_KEYS = new Set(['escortT', 'name', 'requested', 'paid']);
const PILGRIM_LOG_KEYS = new Set(['at', 'kind', 'name']);
const HERESY_KEYS = new Set(['name', 'entityId', 'gen', 'markedAt', 'status', 'resolvedAt', 'bountyPaid']);
const PILGRIMAGE_KEYS = new Set(['lastKey', 'lastVisitAt', 'legs', 'paidLegs', 'visits', 'circuits', 'stampSeq', 'lastCircuitSeq']);
const TITHE_KEYS = new Set(['receipts']);
const PILGRIMS_KEYS = new Set(['sectorId', 'sent', 'live', 'log', 'escorts', 'nextSpawnAt']);
const HERESY_BOOK_KEYS = new Set(['marks', 'resolved', 'nextAt']);
// The root record is whitelisted too: every slice names itself here, so junk a
// hostile save packs at the top level cannot ride the ledger into a new save.
const CHOIR_KEYS = new Set(['shatters', 'tribute', 'alarms', 'sacrilege',
  'sanctuary', 'offerings', 'offeringUnits', 'blessings', 'pilgrimage',
  'tithe', 'pilgrims', 'heresy']);

/** Strip non-whitelist keys in place — identity preserved so held refs stay live. */
function _keepKeys(row, keys) {
  for (const k of Object.keys(row)) if (!keys.has(k)) delete row[k];
  return row;
}

/**
 * Fresh serializable Choir record: shatter count, shrine tribute, the sacrilege
 * ledger — plus sanctuary standing, the pilgrim ledger, the tithe book, the
 * blessing veil, procession traffic, and the heresy marks. Every field is plain
 * JSON; absent and malformed slices normalize to the additive default so a
 * pre-rites save (or a hand-cut fixture) reads clean.
 *
 * Normalization is IN PLACE on purpose: rows and containers keep their identity
 * across calls, because ticks hold references across sub-calls that themselves
 * run ensureChoirState (a rebuild-the-world normalizer would orphan those refs —
 * a held visit row losing `inside` re-fires the entry edge every tick; a held
 * receipt array losing a push double-pays a leg after any interleaved emit).
 */
export function ensureChoirState(state) {
  // Only a plain JSON object can hold the ledger — a Map/Set/class row would
  // accept normalizer writes as invisible properties and serialize to {}.
  if (state.choir !== _obj(state.choir)) state.choir = {};
  const c = _keepKeys(state.choir, CHOIR_KEYS);
  if (!Number.isFinite(c.shatters)) c.shatters = 0;
  if (!Array.isArray(c.tribute)) c.tribute = [];
  for (let i = 0; i < c.tribute.length; i++) {
    const row = _keepKeys(_obj(c.tribute[i]), TRIBUTE_KEYS);
    row.relicId = row.relicId ?? null;
    row.shrineId = row.shrineId ?? null;
    row.at = _num(row.at, 0);
    c.tribute[i] = row;
  }
  _capArr(c.tribute, CHOIR_RITES.tributeRows);
  if (!Number.isFinite(c.alarms)) c.alarms = 0;

  // The sacrilege ledger — what the faithful hold against you.
  if (!Array.isArray(c.sacrilege)) c.sacrilege = [];
  for (let i = 0; i < c.sacrilege.length; i++) {
    const row = _keepKeys(_obj(c.sacrilege[i]), SACRILEGE_KEYS);
    row.at = _num(row.at, 0);
    row.kind = _str(row.kind, 'choir');
    row.victim = _str(row.victim);
    row.victimId = row.victimId ?? null;
    row.pos = row.pos && Number.isFinite(row.pos.x)
      ? { x: _num(row.pos.x), z: _num(row.pos.z) } : null;
    c.sacrilege[i] = row;
  }
  _capArr(c.sacrilege, CHOIR_RITES.sacrilegeRows);

  // Sanctuary standing: 'none' | 'marked' | 'banished'.
  const s = _keepKeys(_obj(c.sanctuary), SANCTUARY_KEYS);
  s.standing = s.standing === 'marked' || s.standing === 'banished' ? s.standing : 'none';
  s.until = _num(s.until, -1);
  s.earned = _int(s.earned);
  s.violations = _int(s.violations);
  c.sanctuary = s;

  // Bell offerings and the blessings they bought.
  if (!Array.isArray(c.offerings)) c.offerings = [];
  for (let i = 0; i < c.offerings.length; i++) {
    const row = _keepKeys(_obj(c.offerings[i]), OFFERING_KEYS);
    row.at = _num(row.at, 0);
    row.units = _int(row.units);
    row.commodityId = _str(row.commodityId, '');
    row.blessing = _str(row.blessing);
    row.nearId = row.nearId ?? null;
    row.tick = _int(row.tick);
    c.offerings[i] = row;
  }
  _capArr(c.offerings, CHOIR_RITES.offeringRows);
  c.offeringUnits = _int(c.offeringUnits);
  const blessings = _obj(c.blessings);
  for (const kind of Object.keys(blessings)) {
    const b = _normBlessing(blessings[kind]);
    if (b) blessings[kind] = b;
    else delete blessings[kind];
  }
  c.blessings = blessings;

  // The pilgrim ledger: shrine stamps, completed legs, paid routes, circuits.
  const pg = _keepKeys(_obj(c.pilgrimage), PILGRIMAGE_KEYS);
  pg.lastKey = _str(pg.lastKey);
  // JSON writes -Infinity as null; _num would coerce that null to 0 and let a
  // restored ledger read "stamped at t=0" — keep the true never-stamped default.
  pg.lastVisitAt = pg.lastVisitAt == null ? -Infinity : _num(pg.lastVisitAt, -Infinity);
  if (!Array.isArray(pg.legs)) pg.legs = [];
  for (let i = 0; i < pg.legs.length; i++) {
    const row = _keepKeys(_obj(pg.legs[i]), LEG_KEYS);
    row.from = _str(row.from, '');
    row.to = _str(row.to, '');
    row.at = _num(row.at, 0);
    row.tick = _int(row.tick);
    pg.legs[i] = row;
  }
  _capArr(pg.legs, CHOIR_RITES.legRows);
  const paidLegs = _obj(pg.paidLegs);
  for (const k of Object.keys(paidLegs)) paidLegs[k] = _num(paidLegs[k], -1);
  pg.paidLegs = _capKeyed(paidLegs, CHOIR_RITES.paidLegKeys, 'at');
  const visits = _obj(pg.visits);
  for (const k of Object.keys(visits)) {
    const row = _keepKeys(_obj(visits[k]), VISIT_KEYS);
    row.at = _num(row.at, -1);
    row.inside = row.inside === true;
    row.n = _int(row.n);
    row.seq = _int(row.seq);
    visits[k] = row;
  }
  pg.visits = _capKeyed(visits, CHOIR_RITES.visitKeys, 'at', _insideRow);
  pg.circuits = _int(pg.circuits);
  pg.stampSeq = _int(pg.stampSeq);
  pg.lastCircuitSeq = _int(pg.lastCircuitSeq);
  c.pilgrimage = pg;

  // The tithe book: one receipt per shrine crossing that owed.
  const t = _keepKeys(_obj(c.tithe), TITHE_KEYS);
  if (!Array.isArray(t.receipts)) t.receipts = [];
  for (let i = 0; i < t.receipts.length; i++) {
    const row = _keepKeys(_obj(t.receipts[i]), RECEIPT_KEYS);
    row.token = _str(row.token, '');
    row.key = _str(row.key, '');
    row.due = _int(row.due);
    row.paid = _int(row.paid);
    row.kind = _str(row.kind, 'paid');
    row.at = _num(row.at, 0);
    t.receipts[i] = row;
  }
  _capArr(t.receipts, CHOIR_RITES.titheRows);
  c.tithe = t;

  // Procession traffic: a bounded cast, per sector visit.
  const pl = _keepKeys(_obj(c.pilgrims), PILGRIMS_KEYS);
  pl.sectorId = _str(pl.sectorId);
  pl.sent = _int(pl.sent);
  const live = _obj(pl.live);
  for (const k of Object.keys(live)) {
    const row = _keepKeys(_obj(live[k]), PILGRIM_LIVE_KEYS);
    row.escortT = Math.max(0, _num(row.escortT, 0));
    row.name = _str(row.name, 'PILGRIM');
    row.requested = row.requested === true;
    row.paid = row.paid === true;
    live[k] = row;
  }
  pl.live = _capKeyed(live, CHOIR_RITES.pilgrimLiveRows, 'escortT');
  if (!Array.isArray(pl.log)) pl.log = [];
  for (let i = 0; i < pl.log.length; i++) {
    const row = _keepKeys(_obj(pl.log[i]), PILGRIM_LOG_KEYS);
    row.at = _num(row.at, 0);
    row.kind = _str(row.kind, 'log');
    row.name = _str(row.name, '');
    pl.log[i] = row;
  }
  _capArr(pl.log, CHOIR_RITES.pilgrimLogRows);
  pl.escorts = _int(pl.escorts);
  pl.nextSpawnAt = _num(pl.nextSpawnAt, -1);
  c.pilgrims = pl;

  // The heresy marks: open dissenter names, silenced or lapsed.
  const h = _keepKeys(_obj(c.heresy), HERESY_BOOK_KEYS);
  if (!Array.isArray(h.marks)) h.marks = [];
  for (let i = 0; i < h.marks.length; i++) {
    const row = _keepKeys(_obj(h.marks[i]), HERESY_KEYS);
    row.name = _str(row.name, 'DISSENTER');
    // Ids and occupant generations are integers — anything else is unprovable
    // identity, so the mark reads as null rather than a string look-alike.
    row.entityId = Number.isInteger(row.entityId) ? row.entityId : null;
    row.gen = Number.isInteger(row.gen) ? row.gen : null;
    row.markedAt = _num(row.markedAt, 0);
    row.status = row.status === 'silenced' || row.status === 'lapsed' ? row.status : 'open';
    row.resolvedAt = row.resolvedAt == null ? null : _num(row.resolvedAt, 0);
    row.bountyPaid = row.bountyPaid === true;
    h.marks[i] = row;
  }
  _capArr(h.marks, CHOIR_RITES.heresyRows);
  h.resolved = _int(h.resolved);
  h.nextAt = _num(h.nextAt, -1);
  c.heresy = h;

  return c;
}

/**
 * Detached read-model of the Choir standing (HUD/debug/tests): the sanctuary
 * standing, live blessings, pilgrimage progress, and ledger depths. Callers
 * cannot mutate the record — every field is a copied scalar.
 */
export function choirStanding(state) {
  const c = ensureChoirState(state);
  const simTime = _num(state && state.simTime, 0);
  const blessings = {};
  for (const kind of Object.keys(c.blessings)) {
    const b = c.blessings[kind];
    if (b && simTime < b.until) blessings[kind] = { until: b.until, yieldLeft: b.yieldLeft ?? null };
  }
  const openMarks = c.heresy.marks.filter((m) => m.status === 'open').length;
  // The lazy read: a standing whose `until` passed is 'none' even before the
  // decayed row is swept, same as the sim reads it.
  const standing = c.sanctuary.standing !== 'none' && simTime < c.sanctuary.until
    ? c.sanctuary.standing : 'none';
  return {
    standing,
    standingUntil: standing === 'none' ? -1 : c.sanctuary.until,
    blessings,
    // Visits are created for every live shrine the tick sees; only a stamp
    // (n > 0) is a shrine the pilgrim actually entered.
    visitedShrines: Object.values(c.pilgrimage.visits).filter((v) => v && v.n > 0).length,
    legs: c.pilgrimage.legs.length,
    circuits: c.pilgrimage.circuits,
    sacrilege: c.sacrilege.length,
    tribute: c.tribute.length,
    offeringUnits: c.offeringUnits,
    tithesPaid: c.tithe.receipts.filter((r) => r.kind === 'paid' || r.kind === 'penance').length,
    pilgrimsLive: Object.keys(c.pilgrims.live).length,
    escorts: c.pilgrims.escorts,
    heresyOpen: openMarks,
    heresyResolved: c.heresy.resolved,
  };
}

/** True while the named blessing is in force. */
export function choirBlessingActive(state, kind) {
  const b = ensureChoirState(state).blessings[kind];
  return !!(b && _num(state.simTime, 0) < b.until);
}

export const choirResonance = {
  name: 'choirResonance',

  init(ctx) {
    this.ctx = ctx; this.state = ctx.state; this.bus = ctx.bus; this.helpers = ctx.helpers;
    this._pulseAt = new Map(); // bellId -> next pulse simTime (dead ids pruned at scan)
    this._ringAt = new Map();  // holderId -> last Bell Head ring simTime (same)
    // The kill ear is subscribed once per bus: a repeated init must not double-arm
    // it — a duplicated listener would charge a pilgrim's loss to the player twice.
    if (this._killEarBus !== this.bus) {
      // A different bus means the old ear is orphaned on a dead channel — drop it
      // or a kill on the old bus would still charge this run.
      if (this._subs) {
        for (const off of this._subs) { try { off(); } catch (_) { /* stale unsub */ } }
      }
      this._killEarBus = this.bus;
      this._subs = [
        this.bus.on('entity:killed', (p) => this._onKilled(p)),
      ];
    }
    this._bellSpoke = new Set(); // bellIds whose first pulse already spoke the pulse line
    ensureChoirState(this.state);
  },

  // Save slot: the whole ledger is plain JSON (sanctuary, pilgrim stamps, paid legs,
  // tithe receipts, blessings, heresy marks) — Continue must not re-arm a "pay once"
  // latch. Additive: an older save with no Choir bag restores to the fresh default.
  serialize() {
    if (!this.state) return {};
    return JSON.parse(JSON.stringify(ensureChoirState(this.state)));
  },

  deserialize(data) {
    if (!this.state) return undefined;
    this.state.choir = _obj(data) === data && data ? JSON.parse(JSON.stringify(data)) : null;
    return ensureChoirState(this.state);
  },

  /** Hum a crystal: it answers the resonance for `humS`, then lets go. */
  _hum(e, simTime, humS) {
    e.data = e.data || {};
    if (e.data.choirShattered === true) return; // dead to the rite — never re-hum
    if (Number.isFinite(e.data.choirHumAt)) return; // already singing
    e.data.choirHumAt = simTime;
    e.data.choirHumDur = humS;
  },

  /** One pulse out of a Bell (or a Bell Head ring): hum every crystal in reach. */
  _pulse(state, sourceId, pos, radius, humS, kind) {
    for (const e of state.entityList) {
      if (!e || e.alive === false || !isCrystal(e)) continue;
      if (dist2(e.pos, pos) <= radius * radius) this._hum(e, state.simTime, humS);
    }
    this.bus.emit('choir:bellPulse', {
      kind, sourceId, pos: { x: pos.x, z: pos.z }, radius,
      ribbons: { count: CHOIR_RIBBONS.ribbonCount, palette: CHOIR_RIBBONS.palette },
      tick: state.tick,
    });
  },

  /** Crystal whose hum has run its duration shatters — and hums its neighbours.
   *  Reverse index walk: no per-tick copy of the list, and shards appended at
   *  the tail mid-pass land on already-visited indices (they cannot re-shatter
   *  this tick — they carry no hum stamp anyway). */
  _shatterCrystal(state, dt) {
    const list = state.entityList;
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i];
      if (!e || e.alive === false || !isCrystal(e) || e.data.choirShattered === true) continue;
      const humAt = e.data.choirHumAt;
      if (!Number.isFinite(humAt)) continue;
      const dur = Number(e.data.choirHumDur) || CHOIR_BELLS.humDurationS;
      if (state.simTime < humAt + dur) continue;
      const c = ensureChoirState(state);
      c.shatters += 1;
      // The shatter latch lands before the event speaks: this body is dead to
      // the rite now, so a listener re-entering the tick — or a later pulse
      // re-humming the corpse before the sweep collects it — cannot break it
      // a second time.
      e.data.choirShattered = true;
      delete e.data.choirHumAt;
      delete e.data.choirHumDur;
      const pos = { x: e.pos.x, z: e.pos.z };
      this.bus.emit('choir:crystalShattered', {
        entityId: e.id, pos, shards: CHOIR_BELLS.shatterShardCount, tick: state.tick,
      });
      // The chain: a shattering crystal hums any crystal close enough to hear it.
      for (const n of state.entityList) {
        if (!n || n.alive === false || n.id === e.id || !isCrystal(n)) continue;
        if (dist2(n.pos, pos) <= CHOIR_BELLS.chainRadius * CHOIR_BELLS.chainRadius) {
          this._hum(n, state.simTime, CHOIR_BELLS.chainHumS);
        }
      }
      this.helpers.removeEntity(e.id, { reason: 'choir_resonance' });
      // The Chorister tithe: while the blessing holds, a shatter near you pays
      // a devotional from its pool — small, real, and bounded by the pool.
      this._devotionalYield(state, pos);
    }
  },

  // ── Bells (E-23) ───────────────────────────────────────────────────────────────
  _tickBells(state) {
    for (const e of state.entityList) {
      if (!e) continue;
      // A dead bell's throttle row is dead weight — prune it as it is seen, and
      // hard-bound the Map so a long session cannot grow it without limit.
      if (!this._bellSpoke) this._bellSpoke = new Set();
      if (e.alive === false) { this._pulseAt.delete(e.id); this._bellSpoke.delete(e.id); continue; }
      if (e.data?.choirBell !== true) continue;
      // Swept-and-gone ids can outlive their sighting; a hard cap keeps the
      // Map bounded even if prune-on-death never observes them.
      if (this._pulseAt.size > 512) this._pulseAt.clear();
      if (this._bellSpoke.size > 512) this._bellSpoke.clear();
      const at = this._pulseAt.get(e.id) ?? -1;
      if (state.simTime >= at) {
        this._pulseAt.set(e.id, state.simTime + CHOIR_BELLS.pulsePeriodS);
        this._pulse(state, e.id, e.pos, CHOIR_BELLS.pulseRadius, CHOIR_BELLS.humDurationS, 'bell');
        // The bell speaks once when it first rings in your presence — not on every 6 s
        // beat, and never with the relic alarm's "The shrine is home." sentence.
        if (!this._bellSpoke.has(e.id)) {
          this._bellSpoke.add(e.id);
          this.bus.emit('comms:log', { text: CHOIR_BELLS.pulseLine, speaker: 'Ascendant Choir' });
        }
      }
    }
  },

  // ── The Carried Relic (E-22) ───────────────────────────────────────────────────
  _tickRelics(state) {
    const c = ensureChoirState(state);
    // The Vigil blessing and the sanctuary mark both still the report — a
    // consecrated casing does not tell the shrine where you are.
    const muted = this._relicMuted(state);
    for (const relic of state.entityList) {
      if (!relic || relic.alive === false || relic.data?.carriedRelic !== true) continue;
      const rd = relic.data;
      // Crack first: a hard enough meeting with a solid body opens the casing.
      if (rd.casingCracked !== true) {
        for (const b of state.entityList) {
          if (!b || b.alive === false || b.id === relic.id) continue;
          if (b.type !== 'asteroid' && b.type !== 'wreck' && b.type !== 'debris') continue;
          if (!touching(relic, b)) continue;
          if (relSpeed(relic, b) < CHOIR_CARRIED_RELIC.crackImpactSpeed) continue;
          rd.casingCracked = true;
          this.bus.emit('choir:relicCracked', { relicId: relic.id, tick: state.tick });
          this.bus.emit('comms:log', { text: CHOIR_CARRIED_RELIC.crackLine, speaker: 'Ascendant Choir' });
          break;
        }
      }
      // Shrine reach: it pings the carrier's position to every Choir ship.
      const shrine = this._nearestShrine(state, relic.pos);
      if (!shrine) continue;
      const d2shrine = dist2(relic.pos, shrine.pos);
      if (rd.casingCracked !== true && !muted) {
        if (d2shrine <= CHOIR_CARRIED_RELIC.pingRadius ** 2
            && state.simTime >= (rd.lastPingAt ?? -Infinity) + CHOIR_CARRIED_RELIC.pingPeriodS) {
          rd.lastPingAt = state.simTime;
          for (const s of state.entityList) {
            if (!s || s.alive === false || s.factionId !== FACTION_ID) continue;
            s.data = s.data || {};
            s.data.relicPing = { x: relic.pos.x, z: relic.pos.z, at: state.simTime };
          }
          this.bus.emit('choir:relicPing', {
            relicId: relic.id, pos: { x: relic.pos.x, z: relic.pos.z }, tick: state.tick,
          });
          this.bus.emit('comms:log', { text: CHOIR_CARRIED_RELIC.sealedLine, speaker: 'Ascendant Choir' });
        }
        // Cross the shrine radius sealed — the whole choir is behind you.
        if (d2shrine <= CHOIR_CARRIED_RELIC.shrineRadius ** 2 && rd.alarmRaised !== true) {
          rd.alarmRaised = true;
          c.alarms += 1;
          for (const s of state.entityList) {
            if (!s || s.alive === false || s.factionId !== FACTION_ID) continue;
            s.data = s.data || {};
            s.data.relicHunt = { targetId: relic.id, at: state.simTime };
          }
          this.bus.emit('choir:relicAlarm', {
            relicId: relic.id, shrineId: shrine.id, tick: state.tick,
          });
          this.bus.emit('comms:log', { text: CHOIR_CARRIED_RELIC.alarmLine, speaker: 'Ascendant Choir' });
          // A sealed relic in the shrine's heart is sacrilege — the ledger keeps it,
          // and the congregation banishes the carrier until the mark burns off.
          this._noteSacrilege(state, {
            kind: 'sealed_relic', victim: 'THE SHRINE', victimId: relic.id,
            // The gen travels with the row: a null victimGen reads as replay in
            // _onKilled's dedup and would pardon a real kill on the recycled id.
            victimGen: occupantGenerationOf(relic) ?? null,
            pos: { x: relic.pos.x, z: relic.pos.z },
          });
        }
      } else if (d2shrine <= CHOIR_CARRIED_RELIC.shrineRadius ** 2 && rd.tributed !== true
          && rd.casingCracked === true) {
        // Delivered cracked: the shrine piles up what you brought.
        rd.tributed = true;
        c.tribute.push({ relicId: relic.id, shrineId: shrine.id, at: state.simTime });
        _capArr(c.tribute, CHOIR_RITES.tributeRows);
        this.bus.emit('choir:tribute', {
          relicId: relic.id, shrineId: shrine.id, tick: state.tick,
        });
      }
    }
  },

  _nearestShrine(state, pos) {
    let best = null, bestD = Infinity;
    for (const e of state.entityList) {
      if (!e || e.alive === false || e.data?.choirShrine !== true) continue;
      const d = dist2(e.pos, pos);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  },

  // ── Bell Head: whatever your Line slams rings ──────────────────────────────────
  _bellHeads(state) {
    for (const holder of state.entityList) {
      if (!holder) continue;
      if (holder.alive === false) { this._ringAt.delete(holder.id); continue; }
      if (holder.data?.lineHeadId !== CHOIR_BELL_HEAD.id) continue;
      if (this._ringAt.size > 512) this._ringAt.clear();
      const tether = holder.tether || (holder.id === state.playerId ? state.player?.tether : null);
      const held = tether && tether.active ? state.entities.get(tether.targetId) : null;
      if (!held || held.alive === false) continue;
      const lastRing = this._ringAt.get(holder.id) ?? -Infinity;
      if (state.simTime - lastRing < CHOIR_BELL_HEAD.ringCooldownS) continue;
      // The slam: the held object meets anything solid at ring speed.
      for (const b of state.entityList) {
        if (!b || b.alive === false || b.id === held.id || b.id === holder.id) continue;
        if (b.type === 'shard' || b.type === 'vfx') continue;
        if (!touching(held, b)) continue;
        if (relSpeed(held, b) < CHOIR_BELL_HEAD.ringMinImpactSpeed) continue;
        this._ringAt.set(holder.id, state.simTime);
        this._pulse(state, holder.id, held.pos, CHOIR_BELL_HEAD.ringRadius,
          CHOIR_BELL_HEAD.humDurationS, 'head');
        this.bus.emit('choir:bellHeadRing', {
          holderId: holder.id, heldId: held.id, hitId: b.id,
          pos: { x: held.pos.x, z: held.pos.z }, tick: state.tick,
        });
        break;
      }
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // THE RITES — sanctuary, tithe, offerings, pilgrims, heresy.
  // ═══════════════════════════════════════════════════════════════════════════

  _player(state) {
    const p = state.entities && state.entities.get ? state.entities.get(state.playerId) : null;
    return p && p.alive !== false ? p : null;
  },

  /** Every live shrine body in the sector. */
  _shrines(state) {
    const out = [];
    for (const e of state.entityList) {
      if (e && e.alive !== false && e.data?.choirShrine === true) out.push(e);
    }
    return out;
  },

  /**
   * A shrine's ledger key: authored identity first (world record, station id,
   * name) so a rematerialized shrine keeps its book; the raw entity id is the
   * last resort and marks the visit as seat-of-the-moment.
   */
  _shrineKey(shrine) {
    const d = shrine && shrine.data;
    return _str(d && (d.worldRecordId || d.stationId || d.shrineId || d.name))
      || `shrine#${shrine ? shrine.id : 0}`;
  },

  /** A standing in force right now, or 'none'. Lazy read: an expired standing
   *  counts as 'none' even before the decayed row is swept. */
  _standing(state) {
    const s = ensureChoirState(state).sanctuary;
    return s.standing !== 'none' && state.simTime < s.until ? s.standing : 'none';
  },

  /** The relic is quiet while the Vigil or the sanctuary mark holds. */
  _relicMuted(state) {
    return this._blessingActive(state, 'vigil') || this._standing(state) === 'marked';
  },

  _blessingActive(state, kind) {
    const b = ensureChoirState(state).blessings[kind];
    return !!(b && state.simTime < b.until);
  },

  /**
   * Grant a blessing: `until` refreshes, pools reset — a renewed offering is a
   * renewed grace. Emits `choir:blessing`; expiry speaks `choir:blessingEnded`.
   */
  grantBlessing(state, kind, durS, extra = null) {
    const c = ensureChoirState(state);
    const until = _num(state.simTime, 0) + Math.max(1, _num(durS, 60));
    const b = { until };
    if (extra && Number.isFinite(extra.yieldLeft)) b.yieldLeft = Math.max(0, extra.yieldLeft);
    c.blessings[kind] = b;
    this.bus.emit('choir:blessing', { kind, until, tick: state.tick });
    return b;
  },

  /** Expire blessings whose `until` has passed — once each. */
  _tickBlessings(state) {
    const c = ensureChoirState(state);
    for (const kind of Object.keys(c.blessings)) {
      const b = c.blessings[kind];
      if (!b || state.simTime < b.until) continue;
      delete c.blessings[kind];
      this.bus.emit('choir:blessingEnded', { kind, tick: state.tick });
    }
  },

  /**
   * Set the sanctuary standing and speak the transition. Earned marks count;
   * violations burn a held mark straight through to banished.
   */
  _setStanding(state, standing, durS) {
    const c = ensureChoirState(state);
    const s = c.sanctuary;
    if (s.standing === standing && state.simTime < s.until) {
      s.until = Math.max(s.until, state.simTime + durS);
      // A renewal is not a transition — no `choir:sanctuary` — but the pilot's
      // visible mark must still track the extended clock.
      const holder = this._player(state);
      if (holder) {
        holder.data = holder.data || {};
        if (standing === 'marked') holder.data.choirMarked = { until: s.until };
        else delete holder.data.choirMarked;
      }
      return s;
    }
    s.standing = standing;
    s.until = state.simTime + Math.max(0, _num(durS, 0));
    if (standing === 'marked') s.earned += 1;
    // The pilot's visible mark lands before the transition speaks.
    const player = this._player(state);
    if (player) {
      player.data = player.data || {};
      player.data.choirMarked = standing === 'marked' ? { until: s.until } : undefined;
      if (player.data.choirMarked === undefined) delete player.data.choirMarked;
    }
    this.bus.emit('choir:sanctuary', { standing, until: s.until, tick: state.tick });
    return s;
  },

  /** Write a sacrilege row, banish the offender, and speak it. */
  _noteSacrilege(state, { kind, victim = null, victimId = null, victimGen = null, pos = null }) {
    const c = ensureChoirState(state);
    c.sacrilege.push({
      at: state.simTime, kind, victim, victimId, victimGen,
      pos: pos && Number.isFinite(pos.x) ? { x: pos.x, z: pos.z } : null,
    });
    _capArr(c.sacrilege, CHOIR_RITES.sacrilegeRows);
    c.sanctuary.violations += 1;
    this._setStanding(state, 'banished', CHOIR_RITES.banishedDurS);
    this.bus.emit('choir:sacrilege', { kind, victim, victimId, tick: state.tick });
    this.bus.emit('comms:log', { text: RITES_BARKS.sacrilege, speaker: 'Ascendant Choir' });
    this.bus.emit('comms:log', { text: RITES_BARKS.banished, speaker: 'Shrine Cantor' });
  },

  // ── Sanctuary: stamps, legs, circuits, tithe, the mend ───────────────────────

  _tickSanctuary(state, dt) {
    const c = ensureChoirState(state);
    const s = c.sanctuary;
    // Standing decay: a spent mark or a served banishment returns to 'none'.
    if (s.standing !== 'none' && state.simTime >= s.until) {
      s.standing = 'none';
      s.until = -1;
      const player = this._player(state);
      if (player && player.data && player.data.choirMarked) delete player.data.choirMarked;
      this.bus.emit('choir:sanctuary', { standing: 'none', until: -1, tick: state.tick });
    }
    const player = this._player(state);
    if (!player) return;
    const r2 = CHOIR_RITES.sanctuaryRadius * CHOIR_RITES.sanctuaryRadius;
    for (const shrine of this._shrines(state)) {
      const key = this._shrineKey(shrine);
      const pg = c.pilgrimage;
      const v = pg.visits[key] || (pg.visits[key] = { at: -1, inside: false, n: 0 });
      const inside = dist2(player.pos, shrine.pos) <= r2;
      const crossing = inside && !v.inside;
      // The edge latches before it speaks: a listener that re-enters this tick
      // while the crossing events fly must already read `inside` true, or the
      // same crossing stamps the ledger a second time.
      v.inside = inside;
      if (crossing) {
        // The crossing edge: stamp the ledger, then levy the tithe.
        const firstEver = v.n === 0;
        v.at = state.simTime;
        v.n += 1;
        const seq = this._stampVisit(state, key);
        this._assessTithe(state, key, seq);
        this.bus.emit('choir:pilgrimVisit', { shrineKey: key, shrineId: shrine.id, tick: state.tick });
        if (firstEver) {
          this.bus.emit('comms:log', { text: RITES_BARKS.visit, speaker: 'Shrine Cantor' });
        }
      }
      // The marked mend inside sanctuary — small, quiet, real.
      if (inside && s.standing === 'marked'
          && Number.isFinite(player.hull) && Number.isFinite(player.hullMax)
          && player.hull < player.hullMax) {
        player.hull = Math.min(player.hullMax, player.hull + CHOIR_RITES.mendPerS * dt);
      }
    }
    _capKeyed(c.pilgrimage.visits, CHOIR_RITES.visitKeys, 'at', _insideRow);
  },

  /**
   * A shrine stamp: maybe completes a leg, maybe a circuit. Returns the stamp's
   * sequence number — a monotonically increasing crossing id that survives
   * circuit ledger resets, so the tithe token it feeds can never collide with
   * a receipt an earlier epoch wrote under the same `key#n`.
   */
  _stampVisit(state, key) {
    const c = ensureChoirState(state);
    const pg = c.pilgrimage;
    pg.stampSeq += 1;
    const seq = pg.stampSeq;
    // The stamp's seq lands on the live visit row BEFORE the circuit test reads
    // it — this crossing is a stamp of the current lap, not the last one.
    const stampedRow = pg.visits[key];
    if (stampedRow) stampedRow.seq = seq;
    const from = pg.lastKey;
    if (from && from !== key && state.simTime - pg.lastVisitAt <= CHOIR_RITES.legWindowS) {
      const legKey = `${from}>${key}`;
      pg.legs.push({ from, to: key, at: state.simTime, tick: state.tick });
      _capArr(pg.legs, CHOIR_RITES.legRows);
      // The purse latch lands before the leg speaks: each ordered route pays
      // once, ever — a listener re-entering on the events below must find the
      // ledger already settled, and a save/restore cannot replay it.
      const firstLeg = !Number.isFinite(pg.paidLegs[legKey]);
      if (firstLeg) {
        pg.paidLegs[legKey] = state.simTime;
        _capKeyed(pg.paidLegs, CHOIR_RITES.paidLegKeys, 'at');
      }
      this.bus.emit('choir:pilgrimLeg', { from, to: key, tick: state.tick });
      this.bus.emit('comms:log', { text: RITES_BARKS.leg, speaker: 'Ascendant Choir' });
      if (firstLeg) {
        this.bus.emit('economy:grantCredits', { amount: CHOIR_RITES.legPurseCr, reason: 'choir_pilgrim_leg' });
        this.bus.emit('faction:repDelta', {
          factionId: FACTION_ID, delta: CHOIR_RITES.legRep, reason: 'choir_pilgrim_leg',
        });
      }
      // A circuit: every shrine standing stamped SINCE the last completion.
      // The re-stamp a reset leaves behind carries the closing stamp's own seq,
      // so it is spent — without this gate the carried stamp rang a fresh
      // circuit on every single crossing after the first, forever.
      const shrines = this._shrines(state);
      if (shrines.length >= CHOIR_RITES.circuitMinShrines
          && shrines.every((sh) => {
            const row = pg.visits[this._shrineKey(sh)];
            return row && row.n > 0 && row.seq > pg.lastCircuitSeq;
          })) {
        // The lap resets — but EVERY shrine the pilgrim is still inside keeps
        // its crossing edge. Re-stamping only the completing shrine let a second
        // overlapping shrine's row lose `inside` and re-fire entry (the stamp,
        // the tithe, and this circuit) on the very next tick — two shrines with
        // overlapping radii rang the whole circuit every tick the pilgrim stood
        // in their overlap.
        const player = this._player(state);
        const r2 = CHOIR_RITES.sanctuaryRadius * CHOIR_RITES.sanctuaryRadius;
        pg.lastCircuitSeq = seq;
        for (const sh of shrines) {
          const k = this._shrineKey(sh);
          if (player && dist2(player.pos, sh.pos) <= r2) {
            // The closing stamp's seq, so this kept row cannot count toward
            // the circuit it just closed.
            pg.visits[k] = { at: state.simTime, inside: true, n: 1, seq };
          } else {
            delete pg.visits[k];
          }
        }
        pg.circuits += 1;
        this.bus.emit('choir:circuitComplete', { shrines: shrines.length, tick: state.tick });
        this.bus.emit('comms:log', { text: RITES_BARKS.circuit, speaker: 'Ascendant Choir' });
        this.bus.emit('economy:grantCredits', { amount: CHOIR_RITES.circuitPurseCr, reason: 'choir_circuit' });
        this.bus.emit('faction:repDelta', {
          factionId: FACTION_ID, delta: CHOIR_RITES.circuitRep, reason: 'choir_circuit',
        });
        // The circuit rings the mark on you — sanctuary rights are earned, not bought.
        this._setStanding(state, 'marked', CHOIR_RITES.markedDurS);
      }
    }
    pg.lastKey = key;
    pg.lastVisitAt = state.simTime;
    return seq;
  },

  /** The levy: a laden hold crossing sanctuary owes the keepers. */
  _assessTithe(state, key, seq) {
    const c = ensureChoirState(state);
    const visit = c.pilgrimage.visits[key];
    const token = `${key}#${Number.isFinite(seq) ? seq : (visit ? visit.n : 0)}`;
    if (c.tithe.receipts.some((r) => r.token === token)) return; // one levy per crossing
    const items = state.player && state.player.cargo && state.player.cargo.items;
    let units = 0;
    if (items && typeof items === 'object') {
      for (const id of Object.keys(items)) units += Math.max(0, Math.floor(Number(items[id]) || 0));
    }
    if (units < CHOIR_RITES.titheMinUnits) return; // an empty hold owes nothing
    const standing = this._standing(state);
    const base = Math.min(
      CHOIR_RITES.titheCapCr,
      CHOIR_RITES.titheBaseCr + CHOIR_RITES.tithePerUnitCr * units,
    );
    const due = standing === 'banished' ? base * CHOIR_RITES.titheBanishedMult : base;

    // The receipt is the dedup latch — it lands in the book BEFORE any of the
    // rite's events speak, so a listener that re-enters on `titheAssessed` or
    // the economy intent finds this levy already settled and cannot charge it
    // a second time.
    let kind = 'paid';
    let paid = 0;
    if (standing === 'marked') {
      kind = 'waived';
    } else {
      const credits = Math.max(0, Math.floor(Number(state.player && state.player.credits) || 0));
      paid = Math.min(due, credits); // the broke are stinted, not zeroed out by math
      if (paid < due) kind = 'stinted';
      else if (standing === 'banished') kind = 'penance';
    }
    c.tithe.receipts.push({ token, key, due, paid, kind, at: state.simTime });
    _capArr(c.tithe.receipts, CHOIR_RITES.titheRows);

    this.bus.emit('choir:titheAssessed', { shrineKey: key, due, units, tick: state.tick });
    if (kind === 'waived') {
      this.bus.emit('comms:log', { text: RITES_BARKS.titheWaived, speaker: 'Shrine Cantor' });
    } else {
      if (paid > 0) {
        this.bus.emit('economy:chargeCredits', { amount: paid, reason: `choir_tithe:${key}` });
      }
      if (kind === 'stinted') {
        this.bus.emit('comms:log', { text: RITES_BARKS.titheStinted, speaker: 'Shrine Cantor' });
      } else {
        this.bus.emit('comms:log', {
          text: kind === 'penance' ? RITES_BARKS.tithePenance : RITES_BARKS.tithePaid,
          speaker: 'Shrine Cantor',
        });
        this.bus.emit('faction:repDelta', {
          factionId: FACTION_ID, delta: CHOIR_RITES.titheRep, reason: `choir_tithe:${key}`,
        });
      }
    }
    this.bus.emit('choir:tithePaid', { shrineKey: key, amount: paid, due, kind, tick: state.tick });
  },

  // ── Offerings: jettisoned crystal the choir takes up ─────────────────────────

  /**
   * Scan for player-owned jettisoned crystal pods resting near a shrine or a
   * Bell; the choir consumes them and answers with a blessing tiered by the
   * offering's size.
   */
  _tickOfferings(state) {
    const c = ensureChoirState(state);
    const player = this._player(state);
    const r2shrine = CHOIR_RITES.offeringRadiusShrine ** 2;
    const r2bell = CHOIR_RITES.offeringRadiusBell ** 2;
    // Altars are scanned once per tick, not once per pod: the shrine list and the
    // live bell list are the same for every candidate.
    const altars = this._shrines(state);
    const bells = [];
    for (const b of state.entityList) {
      if (b && b.alive !== false && b.data?.choirBell === true) bells.push(b);
    }
    let consumed = 0;
    for (const pod of state.entityList) {
      if (consumed >= CHOIR_RITES.offeringMaxPerTick) break;
      if (!pod || pod.alive === false || pod.type !== 'payload') continue;
      const d = pod.data;
      const isJettison = d && (d.jettisonedCargo === true || d.payloadType === 'jettisoned_cargo');
      if (!isJettison || !OFFERING_SET.has(d.commodityId)) continue;
      const units = Math.max(0, Math.floor(Number(d.amount) || 0));
      if (units <= 0) continue;
      // Attribution: an offering must come from the pilot's own hold.
      if (!player || d.ownerId !== player.id) continue;
      // Near a shrine, or near a Bell — both are altars.
      let near = null;
      for (const sh of altars) {
        if (dist2(pod.pos, sh.pos) <= r2shrine) { near = sh; break; }
      }
      if (!near) {
        for (const b of bells) {
          if (dist2(pod.pos, b.pos) <= r2bell) { near = b; break; }
        }
      }
      if (!near) continue;
      const kind = units >= CHOIR_RITES.sanctumMinUnits ? 'sanctum'
        : units >= CHOIR_RITES.choristerMinUnits ? 'chorister'
        : units >= CHOIR_RITES.vigilMinUnits ? 'vigil' : null;
      if (!kind) continue;
      consumed += 1;
      c.offerings.push({
        at: state.simTime, units, commodityId: d.commodityId,
        blessing: kind, nearId: near.id, tick: state.tick,
      });
      _capArr(c.offerings, CHOIR_RITES.offeringRows);
      c.offeringUnits += units;
      this.helpers.removeEntity(pod.id, { reason: 'choir_offering' });
      this.bus.emit('choir:offering', {
        units, commodityId: d.commodityId, blessing: kind,
        nearId: near.id, pos: { x: pod.pos.x, z: pod.pos.z }, tick: state.tick,
      });
      this.bus.emit('comms:log', { text: RITES_BARKS.offering, speaker: 'Ascendant Choir' });
      if (kind === 'vigil') {
        this.grantBlessing(state, 'vigil', CHOIR_RITES.vigilDurS);
        this.bus.emit('comms:log', { text: RITES_BARKS.vigil, speaker: 'Shrine Cantor' });
        this.bus.emit('faction:repDelta', { factionId: FACTION_ID, delta: CHOIR_RITES.vigilRep, reason: 'choir_offering:vigil' });
      } else if (kind === 'chorister') {
        this.grantBlessing(state, 'chorister', CHOIR_RITES.choristerDurS, { yieldLeft: CHOIR_RITES.choristerYieldCr });
        this.bus.emit('comms:log', { text: RITES_BARKS.chorister, speaker: 'Shrine Cantor' });
        this.bus.emit('faction:repDelta', { factionId: FACTION_ID, delta: CHOIR_RITES.choristerRep, reason: 'choir_offering:chorister' });
      } else {
        this.grantBlessing(state, 'sanctum', CHOIR_RITES.sanctumDurS);
        this._setStanding(state, 'marked', CHOIR_RITES.sanctumDurS);
        this.bus.emit('comms:log', { text: RITES_BARKS.sanctum, speaker: 'Shrine Cantor' });
        this.bus.emit('faction:repDelta', { factionId: FACTION_ID, delta: CHOIR_RITES.sanctumRep, reason: 'choir_offering:sanctum' });
      }
    }
  },

  /** The Chorister tithe: a shatter near you yields a devotional from the pool. */
  _devotionalYield(state, pos) {
    if (!this._blessingActive(state, 'chorister')) return;
    const c = ensureChoirState(state);
    const b = c.blessings.chorister;
    const player = this._player(state);
    if (!player || dist2(player.pos, pos) > CHOIR_RITES.choristerRadius ** 2) return;
    const grant = Math.min(CHOIR_RITES.choristerPerShatterCr, Math.max(0, b.yieldLeft || 0));
    if (grant <= 0) return;
    b.yieldLeft -= grant;
    this.bus.emit('economy:grantCredits', { amount: grant, reason: 'choir_chorister_devotional' });
    this.bus.emit('choir:devotionalYield', { amount: grant, pos: { x: pos.x, z: pos.z }, tick: state.tick });
  },

  // ── The kill ear: sacrilege, pilgrim loss, heresy resolved ──────────────────

  _onKilled(p) {
    const state = this.state;
    if (!p || !state) return;
    const victim = state.entities && state.entities.get ? state.entities.get(p.id) : null;
    // A kill receipt names a dead body — every real emitter flips `alive` before
    // the wire. A receipt for a still-living occupant is stale: the id it names
    // was recycled after the death it describes, and nothing may be written
    // against the living body now holding it.
    if (victim && victim.alive !== false) return;
    if (victim && !victim.data) victim.data = {};
    const vd = (victim && victim.data) || {};
    // One death, one booking: a duplicated or replayed entity:killed for a body
    // the ear already wrote up must not charge the ledger twice — the heresy
    // mark carries its own dedup; the other paths latch on the body itself.
    if (vd.choirKillSeen === true) return;
    const byPlayer = p.killerId != null && p.killerId === state.playerId;
    const factionId = p.factionId || (victim && victim.factionId) || null;

    // A heretic: the one Choir hull you may kill. The ledger resolves the mark.
    if (vd.choirHeretic === true || this._openMarkFor(state, p.id)) {
      vd.choirKillSeen = true;
      this._resolveHeresy(state, p.id, byPlayer, victim);
      return;
    }
    // A pilgrim: loss is always sung; player-caused loss is sacrilege.
    if (vd.choirPilgrim === true) {
      vd.choirKillSeen = true;
      const name = _str(vd.pilgrimName, 'PILGRIM');
      this._notePilgrimLost(state, p.id, name, byPlayer, victim);
      if (byPlayer) {
        this.bus.emit('faction:repDelta', { factionId: FACTION_ID, delta: -8, reason: 'choir_sacrilege:pilgrim' });
        this._noteSacrilege(state, {
          kind: 'pilgrim', victim: name, victimId: p.id,
          // Pilgrim ids recycle fast (arrival/orphaned/sweep all free them) —
          // without the gen this null row would read as replay and suppress a
          // genuinely later kill on the recycled id.
          victimGen: victim ? occupantGenerationOf(victim) ?? null : null, pos: p.pos,
        });
      }
      return;
    }
    if (!byPlayer || factionId !== FACTION_ID) return;
    // Dedup by id AND occupant generation: a replayed receipt names the same
    // body the book already mourned, while a recycled id landing on a new dead
    // chorister is a genuinely second kill and must book again.
    const prior = ensureChoirState(state).sacrilege.find((r) => r.victimId === p.id);
    if (prior) {
      const gen = victim ? occupantGenerationOf(victim) : null;
      // Same body, swept corpse, or unprovable either way — read as replay.
      if (victim == null || prior.victimGen == null || prior.victimGen === gen) return;
    }
    vd.choirKillSeen = true;
    // The faithful: bells and shrines are the deep sacrilege; the rest are choir.
    const kind = vd.choirShrine === true ? 'shrine'
      : vd.choirBell === true ? 'bell' : 'chorister';
    const loss = kind === 'shrine' ? CHOIR_SHRINE.sacrilegeRepLoss
      : kind === 'bell' ? Math.round(CHOIR_SHRINE.sacrilegeRepLoss * 0.6) : -8;
    const name = _str(vd.name || vd.scanLabel, kind === 'shrine' ? 'THE SHRINE' : kind === 'bell' ? 'A BELL' : 'A CHORISTER');
    this.bus.emit('faction:repDelta', { factionId: FACTION_ID, delta: loss, reason: `choir_sacrilege:${kind}` });
    this._noteSacrilege(state, {
      kind, victim: name, victimId: p.id,
      victimGen: victim ? occupantGenerationOf(victim) ?? null : null, pos: p.pos,
    });
  },

  /** The open mark hunting this entity id (generation-checked when provable). */
  _openMarkFor(state, entityId) {
    const c = ensureChoirState(state);
    for (const m of c.heresy.marks) {
      if (m.status !== 'open' || m.entityId !== entityId) continue;
      const e = state.entities && state.entities.get ? state.entities.get(entityId) : null;
      if (e && m.gen != null && occupantGenerationOf(e) !== m.gen) continue; // recycled id
      return m;
    }
    return null;
  },

  // ── Pilgrims: the bounded procession ─────────────────────────────────────────

  _tickPilgrims(state, dt) {
    const c = ensureChoirState(state);
    const pl = c.pilgrims;
    const sectorId = _str(state.world && state.world.currentSectorId);
    if (pl.sectorId !== sectorId) {
      pl.sectorId = sectorId;
      pl.sent = 0;
      pl.nextSpawnAt = -1;
      pl.live = {};
    }
    const shrines = this._shrines(state);
    const player = this._player(state);

    // Presence sweep: live records name bodies that must still be pilgrims.
    const seen = new Set();
    const pilgrims = [];
    for (const e of state.entityList) {
      if (!e || e.alive === false || e.data?.choirPilgrim !== true) continue;
      const key = `${e.id}:${occupantGenerationOf(e) ?? 'x'}`;
      seen.add(key);
      pilgrims.push({ e, key });
    }
    for (const key of Object.keys(pl.live)) {
      if (!seen.has(key)) delete pl.live[key];
    }

    // Spawn: a procession walks only where two shrines stand, and the cast is
    // bounded — `sentPerSector` pilgrims per sector visit, never more live
    // than `pilgrimMaxLive`, on a gap clock that survives the save.
    if (shrines.length >= 2 && player && pilgrims.length < CHOIR_RITES.pilgrimMaxLive
        && pl.sent < CHOIR_RITES.pilgrimSentPerSector) {
      if (pl.nextSpawnAt < 0) pl.nextSpawnAt = state.simTime; // first procession walks now
      if (state.simTime >= pl.nextSpawnAt) {
        // The gap clock latches before the spawn speaks: `entity:spawned` and
        // `choir:pilgrimSpawn` fly inside _spawnPilgrim, so a listener stepping
        // this system mid-emit must already find the gate pushed out — an
        // unlatched clock reads due again and mints a second pilgrim in one
        // tick.
        pl.nextSpawnAt = state.simTime + CHOIR_RITES.pilgrimSpawnGapS;
        const spawned = this._spawnPilgrim(state, shrines);
        if (spawned) {
          pl.sent += 1;
        } else {
          pl.nextSpawnAt = state.simTime + 5; // failed spawn: breathe, retry
        }
      }
    }

    // March, hail, escort, arrive.
    for (const { e, key } of pilgrims) {
      // The live record tracks only what the walk itself needs — the
      // destination is re-proven against the body's own stamps every tick.
      const rec = pl.live[key] || (pl.live[key] = {
        escortT: 0,
        name: _str(e.data.pilgrimName, 'PILGRIM'), requested: false, paid: false,
      });
      const dest = state.entities.get(e.data.pilgrimDestId);
      const destOk = dest && dest.alive !== false && dest.data?.choirShrine === true
        && (e.data.pilgrimDestGen == null || occupantGenerationOf(dest) === e.data.pilgrimDestGen);
      if (!destOk) {
        // The shrine it walked to is gone: the pilgrim despawns into the verse.
        this.helpers.removeEntity(e.id, { reason: 'pilgrim_orphaned' });
        delete pl.live[key];
        continue;
      }
      const d2dest = dist2(e.pos, dest.pos);
      // The request: come close and the pilgrim asks you to walk the leg.
      if (!rec.requested && player
          && dist2(e.pos, player.pos) <= CHOIR_RITES.pilgrimHailRadius ** 2) {
        rec.requested = true;
        this.bus.emit('choir:escortRequest', { entityId: e.id, name: rec.name, tick: state.tick });
        this.bus.emit('comms:log', { text: RITES_BARKS.pilgrimHail, speaker: rec.name });
      }
      // Escort accrues while you fly the last leg beside them.
      if (player && d2dest > CHOIR_RITES.pilgrimArriveRadius ** 2
          && dist2(e.pos, player.pos) <= CHOIR_RITES.pilgrimEscortRadius ** 2) {
        rec.escortT += dt;
      }
      if (d2dest <= CHOIR_RITES.pilgrimArriveRadius ** 2) {
        this._pilgrimArrive(state, e, rec, key);
        continue;
      }
      this._marchToward(state, e, dest.pos, CHOIR_RITES.pilgrimSpeed, dt, 'pilgrim');
    }
    _capKeyed(pl.live, CHOIR_RITES.pilgrimLiveRows, 'escortT');
  },

  /** Spawn one pilgrim at shrine A bound for shrine B (A ≠ B, rng-picked). */
  _spawnPilgrim(state, shrines) {
    if (typeof this.helpers.spawnEntity !== 'function') return null;
    const rng = typeof state.rng === 'function' ? state.rng : () => 0.5;
    // A sim rng answers [0,1); a foreign or broken one must never mint an
    // out-of-range pick — any draw outside the range falls back to mid.
    const roll = () => {
      const v = rng();
      return Number.isFinite(v) && v >= 0 && v < 1 ? v : 0.5;
    };
    const a = shrines[Math.floor(roll() * shrines.length)];
    const others = shrines.filter((s) => s !== a);
    if (!a || !others.length) return null;
    const b = others[Math.floor(roll() * others.length)];
    if (!b) return null;
    const c = ensureChoirState(state);
    const name = PILGRIM_NAMES[c.pilgrims.sent % PILGRIM_NAMES.length];
    const spec = makeShipEntitySpec('ship_mule', {
      team: 2, factionId: FACTION_ID,
      pos: { x: a.pos.x + (a.radius || 60) + 80, z: a.pos.z + 40 },
      ai: { archetype: 'passive', passive: true, spawnContext: 'convoy_civilian' },
    });
    spec.flags = { persistent: true };
    Object.assign(spec.data, {
      choirPilgrim: true,
      pilgrimName: name,
      pilgrimDestId: b.id,
      pilgrimDestGen: occupantGenerationOf(b),
      pilgrimDestKey: this._shrineKey(b),
      pilgrimFromKey: this._shrineKey(a),
      scannable: true,
      scanLabel: `${name} — walking the circuit, asks company`,
      trafficRole: 'shuttle',
    });
    const e = this.helpers.spawnEntity(spec);
    if (e) {
      this.bus.emit('choir:pilgrimSpawn', {
        entityId: e.id, name, from: this._shrineKey(a), to: this._shrineKey(b), tick: state.tick,
      });
    }
    return e;
  },

  /**
   * Move a procession body toward a point. npcJobs drives the real route when
   * it is present; without it the body marches kinematically at a fixed gait —
   * deterministic either way.
   */
  _marchToward(state, e, dest, speed, dt, tag) {
    if (!e || e.alive === false || !dest) return;
    if (e.data && e.data.jobId) return; // a real job owns the flying
    if (this.helpers.npcJobs && typeof this.helpers.npcJobs.assign === 'function' && e.data) {
      const jobId = this.helpers.npcJobs.assign(e, {
        kind: 'hauler', sectorId: state.world?.currentSectorId, speed,
        route: [{ id: `${tag}-from`, pos: { x: e.pos.x, z: e.pos.z } },
          { id: `${tag}-dest`, pos: { x: dest.x, z: dest.z }, label: _str(e.data.scanLabel, 'the shrine') }],
        payload: { [tag]: true },
      });
      if (jobId) { e.data.jobId = jobId; return; }
    }
    // Writes must land on a velocity the entity owns — never on SPEED_ZERO,
    // the shared read fallback velOf hands out for missing `vel`.
    const v = e.vel || (e.vel = { x: 0, z: 0 });
    const dx = dest.x - e.pos.x, dz = dest.z - e.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    const step = Math.min(d, speed * dt);
    e.pos.x += (dx / d) * step;
    e.pos.z += (dz / d) * step;
    v.x = (dx / d) * speed;
    v.z = (dz / d) * speed;
  },

  /** Arrival: the procession docks; the escort purse settles, once. */
  _pilgrimArrive(state, e, rec, key) {
    const c = ensureChoirState(state);
    const pl = c.pilgrims;
    const escorted = rec.escortT >= CHOIR_RITES.pilgrimEscortMinS;
    // The whole arrival latches before it speaks: the purse flag, the log row,
    // the live record, and the body itself all close BEFORE the first event
    // flies. A listener stepping this system mid-emit must find no living
    // arrival left to settle — the dead body drops out of the presence sweep,
    // so the log row and `choir:pilgrimArrived` can never be spoken twice.
    const firstSettle = !rec.paid;
    rec.paid = true; // once-only: the same arrival can never settle twice
    let purse = 0;
    if (firstSettle && escorted) {
      purse = Math.min(
        CHOIR_RITES.pilgrimPurseCapCr,
        CHOIR_RITES.pilgrimPurseBaseCr + Math.round(rec.escortT * CHOIR_RITES.pilgrimPursePerSCr),
      );
      pl.escorts += 1;
    }
    pl.log.push({ at: state.simTime, kind: 'arrived', name: rec.name });
    _capArr(pl.log, CHOIR_RITES.pilgrimLogRows);
    delete pl.live[key];
    this.helpers.removeEntity(e.id, { reason: 'pilgrim_arrived' });
    if (purse > 0) {
      this.bus.emit('economy:grantCredits', { amount: purse, reason: 'choir_escort_purse' });
      this.bus.emit('faction:repDelta', {
        factionId: FACTION_ID, delta: CHOIR_RITES.pilgrimEscortRep, reason: 'choir_escort',
      });
      this.bus.emit('choir:escortComplete', {
        entityId: e.id, name: rec.name, escortT: rec.escortT, purseCr: purse, tick: state.tick,
      });
    }
    this.bus.emit('choir:pilgrimArrived', {
      entityId: e.id, name: rec.name, escorted, tick: state.tick,
    });
    this.bus.emit('comms:log', { text: RITES_BARKS.pilgrimArrived, speaker: rec.name });
  },

  _notePilgrimLost(state, entityId, name, byPlayer, victim = null) {
    const c = ensureChoirState(state);
    c.pilgrims.log.push({ at: state.simTime, kind: byPlayer ? 'slain' : 'lost', name });
    _capArr(c.pilgrims.log, CHOIR_RITES.pilgrimLogRows);
    // Close the dead walk's live record — by exact `id:gen` key when the body
    // proves its generation, so a pilgrim already reincarnated on the recycled
    // id keeps its own book; only an unprovable corpse takes the prefix sweep.
    const gen = victim ? occupantGenerationOf(victim) : null;
    const prefix = `${entityId}:`;
    for (const key of Object.keys(c.pilgrims.live)) {
      if (gen != null ? key === `${prefix}${gen}` : key.startsWith(prefix)) {
        delete c.pilgrims.live[key];
      }
    }
    this.bus.emit('choir:pilgrimLost', { entityId, name, byPlayer, tick: state.tick });
    this.bus.emit('comms:log', { text: RITES_BARKS.pilgrimLost, speaker: 'Ascendant Choir' });
  },

  // ── Heresy: the off-note marks ───────────────────────────────────────────────

  /**
   * Mark a body as a dissenter — encounter scripts and the system both use it.
   * The mark is generation-proofed so a recycled id cannot inherit the name.
   */
  markHeretic(entity, name = null) {
    const state = this.state;
    if (!entity || entity.alive === false) return null;
    // Idempotent on a live mark: re-naming the same heretic must not mint a
    // second open row — the duplicate would only linger and lapse later, and a
    // generation-checked lookup is what makes a recycled id safe here.
    const existing = this._openMarkFor(state, entity.id);
    if (existing) {
      entity.data = entity.data || {};
      entity.data.choirHeretic = true;
      entity.data.hereticName = entity.data.hereticName || existing.name;
      return existing;
    }
    entity.data = entity.data || {};
    entity.data.choirHeretic = true;
    const c = ensureChoirState(state);
    const mark = {
      name: _str(name, HERETIC_NAMES[c.heresy.marks.length % HERETIC_NAMES.length]),
      entityId: entity.id,
      gen: occupantGenerationOf(entity),
      markedAt: state.simTime, status: 'open', resolvedAt: null, bountyPaid: false,
    };
    entity.data.hereticName = mark.name;
    c.heresy.marks.push(mark);
    _capArr(c.heresy.marks, CHOIR_RITES.heresyRows);
    // The choir hunts the off-note: every faithful hull carries the mark's target.
    for (const s of state.entityList) {
      if (!s || s.alive === false || s.factionId !== FACTION_ID || s.id === entity.id) continue;
      s.data = s.data || {};
      s.data.heresyHunt = { targetId: entity.id, at: state.simTime };
    }
    this.bus.emit('choir:heresyMarked', { entityId: entity.id, name: mark.name, tick: state.tick });
    this.bus.emit('comms:log', { text: RITES_BARKS.heresyMarked, speaker: 'Ascendant Choir' });
    return mark;
  },

  _tickHeresy(state, dt) {
    const c = ensureChoirState(state);
    const h = c.heresy;
    if (h.nextAt < 0) h.nextAt = state.simTime + CHOIR_RITES.heresyFirstMarkDelayS;
    const shrines = this._shrines(state);
    let openLive = 0;
    for (const m of h.marks) {
      if (m.status !== 'open') continue;
      const e = m.entityId != null && state.entities && state.entities.get
        ? state.entities.get(m.entityId) : null;
      const live = e && e.alive !== false && e.data?.choirHeretic === true
        && (m.gen == null || occupantGenerationOf(e) === m.gen);
      if (!live) {
        // The body slipped away without a silencing kill — despawned, recycled,
        // or struck down by a hand the kill ear never heard. The mark closes
        // the same way an escape does: lapsed, and spoken, never silently.
        m.status = 'lapsed';
        m.resolvedAt = state.simTime;
        this.bus.emit('choir:heresyLapsed', { entityId: m.entityId, name: m.name, tick: state.tick });
        this.bus.emit('comms:log', { text: RITES_BARKS.heresyLapsed, speaker: 'Ascendant Choir' });
        continue;
      }
      if (state.simTime - m.markedAt > CHOIR_RITES.heresyLapseS) {
        // The dissenter slipped the liturgy — the mark stands open no more.
        m.status = 'lapsed';
        m.resolvedAt = state.simTime;
        this.bus.emit('choir:heresyLapsed', { entityId: m.entityId, name: m.name, tick: state.tick });
        this.bus.emit('comms:log', { text: RITES_BARKS.heresyLapsed, speaker: 'Ascendant Choir' });
        this.helpers.removeEntity(e.id, { reason: 'heretic_lapsed' });
        continue;
      }
      openLive += 1;
      this._marchHeretic(state, e, dt);
    }
    // A shrine marks a new dissenter on a long clock — never more than one live
    // hunted mark, never beyond the bounded ledger.
    if (shrines.length && openLive < CHOIR_RITES.heresyMaxLive && state.simTime >= h.nextAt
        && h.marks.filter((m) => m.status === 'open').length < CHOIR_RITES.heresyMaxMarks) {
      // The mark clock latches before the spawn speaks: `entity:spawned` flies
      // inside _spawnHeretic while no new mark row exists yet — a listener
      // re-entering this tick would find the gate still open and spawn again,
      // descending without bound because marks only grow after each spawn
      // returns. Push the clock out first and the gate is already shut.
      h.nextAt = state.simTime + CHOIR_RITES.heresyMarkGapS;
      const heretic = this._spawnHeretic(state, shrines);
      if (heretic) this.markHeretic(heretic);
    }
  },

  /** A fallen cantor steps out of the shrine and drifts off-note. */
  _spawnHeretic(state, shrines) {
    if (typeof this.helpers.spawnEntity !== 'function') return null;
    const rng = typeof state.rng === 'function' ? state.rng : () => 0.5;
    // Same draw discipline as _spawnPilgrim: a broken rng must never mint an
    // out-of-range pick or a NaN bearing that poisons the body's position.
    const roll = () => {
      const v = rng();
      return Number.isFinite(v) && v >= 0 && v < 1 ? v : 0.5;
    };
    const shrine = shrines[Math.floor(roll() * shrines.length)];
    if (!shrine) return null;
    // Flee bearing: deterministic away-from-shrine drift, tilted by the roll.
    const a = roll() * Math.PI * 2;
    const fx = Math.cos(a), fz = Math.sin(a);
    const spec = makeShipEntitySpec('ship_wasp', {
      team: 2, factionId: FACTION_ID,
      pos: { x: shrine.pos.x + fx * ((shrine.radius || 60) + 90), z: shrine.pos.z + fz * ((shrine.radius || 60) + 90) },
      ai: { archetype: 'passive', passive: true, spawnContext: 'convoy_civilian' },
    });
    spec.flags = { persistent: true };
    Object.assign(spec.data, {
      hereticFlee: {
        x: shrine.pos.x + fx * CHOIR_RITES.heresyDriftRange,
        z: shrine.pos.z + fz * CHOIR_RITES.heresyDriftRange,
      },
      scannable: true,
      scanLabel: 'OFF-NOTE — a marked dissenter, bounty on the silence',
      trafficRole: 'heretic',
    });
    return this.helpers.spawnEntity(spec);
  },

  /** The dissenter flees its shrine; reaching the point only extends the drift. */
  _marchHeretic(state, e, dt) {
    const d = e.data && e.data.hereticFlee;
    if (!d || !Number.isFinite(d.x) || !Number.isFinite(d.z)) return;
    if (dist2(e.pos, d) <= 100 * 100) {
      // Re-extend the drift the same way out — it never stops running. A body
      // parked exactly on the point has no bearing to extend (len 0 re-extends
      // to the same spot forever): fall back to a stable per-id heading so the
      // drift cannot stall into a statue.
      let dx = e.pos.x - d.x, dz = e.pos.z - d.z;
      let len = Math.hypot(dx, dz);
      if (len < 1) {
        const bearing = ((Number.isFinite(e.id) ? e.id : 0) % 16) / 16 * Math.PI * 2;
        dx = Math.cos(bearing); dz = Math.sin(bearing); len = 1;
      }
      e.data.hereticFlee = {
        x: d.x + (dx / len) * CHOIR_RITES.heresyDriftRange,
        z: d.z + (dz / len) * CHOIR_RITES.heresyDriftRange,
      };
      return;
    }
    this._marchToward(state, e, d, CHOIR_RITES.heresyFleeSpeed, dt, 'heretic');
  },

  /** Resolve a mark: silenced (bounty if the player did it) — once per mark. */
  _resolveHeresy(state, entityId, byPlayer, victim) {
    const c = ensureChoirState(state);
    let mark = this._openMarkFor(state, entityId);
    if (!mark) {
      // A settled mark for this same body means the kill is a replay — mint no
      // second row, pay no second bounty. An unprovable pair reads as the same
      // body and stays conservative; only a provably different generation is a
      // new dissenter wearing a recycled id.
      const victimGen = victim ? occupantGenerationOf(victim) : null;
      const settled = c.heresy.marks.find((m) => m.entityId === entityId
        && m.status !== 'open'
        && (m.gen == null || victimGen == null || m.gen === victimGen));
      if (settled) return;
      // An unmarked heretic (encounter-authored): write the resolved record so
      // the ledger still tells the story and the kill is never double-counted.
      mark = {
        name: _str(victim && victim.data && victim.data.hereticName, 'DISSENTER'),
        entityId, gen: victimGen,
        markedAt: state.simTime, status: 'open', resolvedAt: null, bountyPaid: false,
      };
      c.heresy.marks.push(mark);
      _capArr(c.heresy.marks, CHOIR_RITES.heresyRows);
    }
    if (mark.status !== 'open') return; // already settled — no second bounty
    mark.status = 'silenced';
    mark.resolvedAt = state.simTime;
    c.heresy.resolved += 1;
    if (byPlayer && !mark.bountyPaid) {
      mark.bountyPaid = true;
      this.bus.emit('economy:grantCredits', { amount: CHOIR_RITES.heresyBountyCr, reason: 'choir_heresy_bounty' });
      this.bus.emit('faction:repDelta', { factionId: FACTION_ID, delta: CHOIR_RITES.heresyRep, reason: 'choir_heresy_silenced' });
      this.bus.emit('comms:log', { text: RITES_BARKS.heresyResolved, speaker: 'Ascendant Choir' });
    }
    this.bus.emit('choir:heresyResolved', {
      entityId, name: mark.name, byPlayer, bountyCr: byPlayer ? CHOIR_RITES.heresyBountyCr : 0,
      tick: state.tick,
    });
  },

  update(dt, state) {
    ensureChoirState(state);
    this._tickBells(state);
    this._shatterCrystal(state, dt);
    this._bellHeads(state);
    this._tickBlessings(state);
    // Sector-scale rites only move while the player is flying: a heresy mark
    // must never lapse with zero player agency because the player was docked.
    if (state.mode !== 'flight') return;
    this._tickRelics(state);
    this._tickSanctuary(state, dt);
    this._tickOfferings(state);
    this._tickPilgrims(state, dt);
    this._tickHeresy(state, dt);
  },
};

export { CHOIR_SHRINE };
export default choirResonance;
