// faction_understory.js — W-UNDERSTORY (build_map §34.5 row 517, bible 02 §10).
//
// The Understory's persistent mark is the garden: a wreck-reef that digests dead mass
// through five persisted growth stages. Done-when:
//   · five persisted growth stages (UNDERSTORY_GARDEN_STAGES, biomass floors)
//   · impacts absorbed in gardens — loose edible mass inside the ring is eaten and grows it
//   · Gardener skiff presence (tends the nearest garden)
//   · the Compost Run (E-26): player-fed mass closes a run per garden
//   · a stage-4+ garden pushes the local tide line (understoryTidePushbackAt — row 520 reads)
//   · Spore Head: a held mass grows a rot-skin (low bounce, sticks on impact)
//   · sporeBloomOnDeath: a dead Understory hull seeds a stage-1 garden where it falls
//
// THE QUIET LEDGER — the smuggler layer a fed reef plugs into:
//   · DEAD-DROP CACHES — a sprouting reef sheds quiet pods on its own clock. A stash
//     pays when the player hauls it home to any garden ring (the reef eats it); it
//     cracks open for less when the player kills it — and the crack costs notice,
//     standing, and a running debt. A consignment is a pod addressed to another
//     reef: deliver it inside the destination ring for the bigger envelope; feed
//     it to the wrong rings and the goods are gone. Wild stashes drop on the
//     player's own line once the network knows their name.
//   · INFORMANT DEBTS — every reef has a named informant. Quiet work done under
//     their eye (feeds, returns, deliveries, verified whispers) accrues what they
//     owe the pilot; when the tab is big enough they pay it in kind — a MARKED
//     stash planted near their reef that cracks for full value, sanctioned.
//     Cracking unmarked caches runs the tab the other way: the network skims a
//     cut off every quiet payout until the debt is square, or the pilot settles
//     it whole over the wire.
//   · WHISPER WIRE — an established reef posts rumors on its own beat. A whisper
//     verifies when the player does the thing it names (feed, run, keep); one
//     nobody acts on sours and costs a little standing.
//   · COVER IDENTITIES — the network sells and grants names. A live cover drinks
//     most of the notice a loud act would raise until the name is spent; when it
//     is ash the pilot wears their own name again. Three live names is the most
//     the quiet will carry.
//   · NOTICE — the reef's own watchfulness, 0..1. Kills on a garden's watch ring
//     and broken seals raise it; quiet time lowers it. Past 'marked' the wire
//     goes dark — no drops, no whispers, worse prices. Saturate it and the
//     network blacklists the name outright: standing burned, covers burned, a
//     blackout while the quiet forgets how to find you.
//   · SHADOW PRICING — every quiet payout rides a per-sector shadow index: the
//     Bloom tide inflates it (hungry times pay), sated reefs deflate it, law heat
//     on the pilot adds a contraband premium, access tier multiplies through, and
//     a marked band takes its cut before the envelope opens.
//
// Deterministic: growth reads entity mass and simTime only; drop/whisper/cover
// rolls draw from hash32 salts and the serializable seq counter; bark picks draw
// from hash32 or state.rng. Money moves only through economy:grantCredits and
// economy:chargeCredits; standing only through faction:repDelta. All quiet-ledger
// state is plain JSON under state.understory — session-scoped like the compost
// ledger, so once-only truth rides the entities: a resolved pod carries
// data.understoryResolved, a finished run rides data.compostRunComplete, and a
// dead id can never cash a record stamped for another occupantGeneration.

import {
  UNDERSTORY_GARDENS,
  UNDERSTORY_GARDEN_STAGES,
  UNDERSTORY_COMPOST_RUN,
  UNDERSTORY_SPORE_HEAD,
  UNDERSTORY_BARKS,
} from '../data/factions/understory.js';
import { hash32 } from '../core/rng.js';
import { readRecentImpulseProvenance } from '../combat/impulseKernel.js';

const FACTION_ID = 'faction_understory';
const EDIBLE = new Set(UNDERSTORY_GARDENS.edibleTypes);
const dist2 = (a, b) => { const dx = a.x - b.x, dz = a.z - b.z; return dx * dx + dz * dz; };

// Normalization helpers — every record field is coerced, never trusted.
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const intOr = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n | 0 : d; };
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v, d = '') => (typeof v === 'string' && v ? v : d);
const clamp01 = (v) => Math.max(0, Math.min(1, Number.isFinite(Number(v)) ? Number(v) : 0));
const frac = (...args) => (hash32(...args) >>> 0) / 4294967296; // deterministic [0,1)

export function stageForBiomass(biomass) {
  const m = Number(biomass) || 0;
  let stage = UNDERSTORY_GARDEN_STAGES[0];
  for (const row of UNDERSTORY_GARDEN_STAGES) if (m >= row.massFloor) stage = row;
  return stage;
}

// ── Quiet-ledger tuning ────────────────────────────────────────────────────────
export const UNDERSTORY_QUIET = Object.freeze({
  // dead-drop caches
  dropStage: 2,               // a reef this stage or better sheds caches
  dropPeriodS: 90,            // each reef's own stash clock
  dropJitterS: 60,            // per-reef jitter so two reefs never chorus
  firstDropS: 25,
  dropTtlS: 420,              // a pod nobody moves goes cold
  maxOpenDrops: 5,            // the wire stays short — scarcity is the trade
  dropLogKeep: 10,            // closed rows kept for the record strip
  dropRadius: 8, dropMass: 12, dropHull: 40,
  dropSpawnPad: 240,          // pods land outside radius + this pad …
  dropSpawnPadRange: 220,     // … scattered across this extra band
  stashBaseCr: 150,           // a plain stash is worth this before shadow pricing
  consignBaseCr: 340,         // addressed work pays more than loose goods
  markedBaseCr: 400,          // an informant's gift is the honest envelope
  consignShare: 0.55,         // of eligible reef sheds, this fraction is addressed
  consignTier: 2,             // Hooded runners get addressed work
  crackFrac: 0.55,            // a broken seal spills this share to the drift
  returnRep: 2, deliverRep: 3, markedReturnRep: 1,
  crackRep: -3,               // breaking a seal is a loud act
  debtPerCrack: 140,          // the toll a cracked seal adds to the pilot's tab
  // the wild stash: the market finds you
  wildDropTier: 1,            // Heard pilots get drops on their own line
  wildDropS: 240,             // sector-level wild stash beat
  wildPad: 700, wildPadRange: 700, // spawn ring around the pilot
  // informant debts
  feedOwedCr: 6,              // per player-fed body, under the reef informant's eye
  stashOwedCr: 30,            // per returned stash
  consignOwedCr: 60,          // per delivered consignment
  whisperOwedCr: 20,          // per verified whisper
  owedTipCr: 240,             // at this tab the informant pays in kind
  maxOpenMarked: 2,           // bounded open gifts
  skimFrac: 0.25,             // while the pilot owes, the network skims this share
  // the whisper wire
  whisperStage: 3,            // established reefs speak
  whisperPeriodS: 120,
  whisperJitterS: 60,
  firstWhisperS: 40,
  whisperTtlS: 360,
  maxOpenWhispers: 4,
  whisperLogKeep: 10,
  whisperPayCr: 140,
  whisperRep: 2,
  sourRep: -2,                // a whisper nobody runs sours on the wire
  // cover identities — names are spent
  coverMax: 3,                // live names the network will carry
  coverLogKeep: 8,            // burned names kept for the record
  coverPool: 0.55,            // notice a fresh name will drink before it dies
  coverSoakFrac: 0.7,         // of each loud act, the name takes this share
  coverDecayBonus: 0.004,     // extra notice decay per second while covered
  coverPriceCr: 550,          // base price of a bought name (tier discounts it)
  coverFloorCr: 150,          // even a Rooted pilot pays this for a name
  // detection-risk escalation
  seenBand: 0.25,             // 'seen' — the reef knows your engine sound
  markedBand: 0.5,            // 'marked' — the wire goes dark on you
  huntedBand: 0.75,           // 'hunted' — prices bleed, nothing posts
  noticeSaturate: 0.99,       // past this the quiet blacklists the name
  noticeDecayPerS: 0.0035,    // quiet work cools the watch — full fade in ~5 min
  killNearGarden: 0.26,       // a witnessed kill on a reef's watch ring
  killUnderstory: 0.4,        // a dead Understory hull anywhere
  crackNotice: 0.3,           // a broken seal
  watchRadius: 1300,          // "on the reef's ring" for witnessed kills
  markedPricePenalty: 0.15,   // shadow price cut while marked
  huntedPricePenalty: 0.4,    // shadow price cut while hunted
  blackoutS: 240,             // after a blacklist the quiet posts nothing
  blacklistRep: -8,           // standing burned with the name
  topTier: 4,                 // Mycelial pilots cool faster
  // shadow pricing inputs
  tidePriceWeight: 0.5,       // a Bloom tide inflates the quiet market
  satePriceWeight: 1 / 3000,  // each sector-biomass tonne deflates it
  satePriceCap: 0.3,
  heatPriceWeight: 0.25,      // law heat on the pilot is a contraband premium
  heatPriceCap: 0.2,
  priceFloor: 0.3, priceCeil: 2.0,
});

// Hidden-market access tiers — favors done for the quiet are the only resume.
export const UNDERSTORY_ACCESS_TIERS = Object.freeze([
  { tier: 0, favors: 0,  id: 'drift',    label: 'Drift',    payMult: 1.0,
    line: 'The reef took what you gave. It does not know your name yet.' },
  { tier: 1, favors: 3,  id: 'heard',    label: 'Heard',    payMult: 1.05,
    line: 'Word of your hands reached the wire. The quiet stashes where you fly.' },
  { tier: 2, favors: 8,  id: 'hooded',   label: 'Hooded',   payMult: 1.15,
    line: 'You are a runner now. Addressed work comes to you.' },
  { tier: 3, favors: 16, id: 'rooted',   label: 'Rooted',   payMult: 1.35,
    line: 'The informants owe you and pay it in kind. The market remembers.' },
  { tier: 4, favors: 30, id: 'mycelial', label: 'Mycelial', payMult: 1.6,
    line: 'You are in the rings now. The quiet hides what it loves.' },
]);

export function understoryAccessTierFor(favors) {
  const f = Math.max(0, intOr(favors));
  let row = UNDERSTORY_ACCESS_TIERS[0];
  for (const t of UNDERSTORY_ACCESS_TIERS) if (f >= t.favors) row = t;
  return row;
}

const DROP_KINDS = new Set(['stash', 'consignment', 'marked']);
const WHISPER_KINDS_ALL = Object.freeze(['feed', 'run', 'keep']);
const WHISPER_KINDS_EARLY = Object.freeze(['feed', 'keep']);
const WHISPER_KINDS = new Set(WHISPER_KINDS_ALL);
const NOTICE_BANDS = Object.freeze(['quiet', 'seen', 'marked', 'hunted']);
const PAID_STAMPS_CAP = 96;
const INFORMANT_CAP = 32; // the fixed name pool is 16 — anything past this is hostile input
// Ledger maps keyed by gardenId: live reefs are a handful per sector; records outlive
// them but a session never passes a few dozen. Past this is hostile input — a live
// garden re-files its row next tick.
const KEYED_LEDGER_CAP = 256;

// The reef's informants — fixed names so the owed ledger stays bounded.
const INFORMANT_NAMES = Object.freeze([
  'Loam-Brother Ilex', 'Sister Mildew', 'Kiln-Voice', 'Brother Hypha',
  'Grave-Moss', 'Aunt Silt', 'Uncle Bracken', 'Pale Mycorrhiza',
  'The Compost Elder', 'Wick-of-Loam', 'Sister Peat', 'Brother Morel',
  'Old Rotgut', 'Mother Thallus', 'Fen-Keeper', 'Spore-Mother Ilse',
]);

// Names the network sells and spends — a cover is a disposable identity.
const COVER_NAMES = Object.freeze([
  'Gray Mercy', 'Salt Vagrant', 'Pale Lode', 'The Quiet Hand',
  'Lode Runner', 'Ash Courier', 'Nightsoil', 'Barge Ghost',
  'Cold Peat', 'The Distant Bell', 'Low Candle', 'Moss Vagrant',
  'Hollow Keel', 'Drift Psalm', 'Mud Lantern', 'Stillwater Jane',
]);

const DROP_BARKS = Object.freeze({
  stash: Object.freeze([
    'Something of ours waits in the dark. It is marked for quiet hands.',
    'A cache went into the drift. The reef wants it home.',
  ]),
  consignment: Object.freeze([
    'A package wants moving between the rings. It pays at the far side.',
    'Addressed goods on the wire — the far reef signs for them.',
  ]),
  wild: Object.freeze([
    'A cache is stashed on your line. Look for the quiet pod.',
    'The market finds you. Something waits along your drift.',
  ]),
  delivered: Object.freeze([
    'The goods reached their rings. The network remembers hands.',
    'Signed for. The far reef keeps your name in its rings.',
  ]),
  returned: Object.freeze([
    'Back to the reef. What was lost is compost now — you are paid.',
    'The seal came home unbroken. The quiet settles.',
  ]),
  marked: Object.freeze([
    'pays the debt in kind — a cache is marked for you.',
    'remembers what the quiet owes. A stash, opened, is yours.',
  ]),
  cracked: Object.freeze([
    'You broke our seal. The drift takes its share, and we take your name.',
    'The pod spilled. What the reef loses, your name carries.',
  ]),
  wrongRings: Object.freeze([
    'The goods entered the wrong rings. They are the reef\'s now, not yours.',
  ]),
});

const WHISPER_BARKS = Object.freeze({
  feed: Object.freeze([
    '{name} whispers: the reef is hungry — fed hands get paid.',
    '{name} heard it plain: dead mass lands, and the quiet settles.',
  ]),
  run: Object.freeze([
    '{name} has a package that wants the far rings. Deliveries pay.',
    '{name} says a consignment sits unclaimed. The quiet moves what you carry.',
  ]),
  keep: Object.freeze([
    '{name} lost a cache to the drift — bring it home unopened.',
    '{name} asks: a seal in the cold. Unbroken, it pays.',
  ]),
  verified: Object.freeze([
    '{name} marks the word true. The quiet settles.',
    'The wire was right. {name} pays for true hearing.',
  ]),
  soured: Object.freeze([
    '{name} stops asking. The wire keeps the score.',
    '{name}\'s word went cold. Nobody ran it.',
  ]),
});

const NOTICE_BARKS = Object.freeze({
  seen: 'The reef knows your engine sound now. Quiet hands cool it.',
  marked: 'You are marked on the wire. The quiet posts nothing for you.',
  hunted: 'The quiet hunts your name. Prices bleed and the wire stays dark.',
  blacklisted: 'You are too loud for the quiet. We will not know you for a while.',
  hullDown: Object.freeze([
    'One of ours falls. The reef remembers hands.',
    'That was one of ours. The quiet keeps the count.',
  ]),
  coverNew: Object.freeze([
    'Wear this name. It will spend.',
    'A new name, wet from the rings. Spend it well.',
  ]),
  coverBurned: 'That name is ash now.',
  debtSkimmed: 'The network takes its cut first. The toll remembers.',
});

function informantNameFor(gardenId) {
  return INFORMANT_NAMES[hash32('u-informant', gardenId) % INFORMANT_NAMES.length];
}

function coverNameFor(seq, count) {
  return COVER_NAMES[hash32('u-cover-name', seq, count) % COVER_NAMES.length];
}

// Eight-point compass word for a displacement — the consignment's scan line
// names its bearing so the pod is findable, not just flagged.
function compassWord(dx, dz) {
  const a = Math.atan2(dz, dx); // XZ plane: +x east, +z south — compass reads the chart
  const oct = ((Math.round((a / (Math.PI * 2)) * 8) % 8) + 8) % 8;
  return ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'][oct];
}

/** Fresh serializable Understory record (gardens, compost runs, tide pushback). */
export function ensureUnderstoryState(state) {
  if (!state.understory || typeof state.understory !== 'object' || Array.isArray(state.understory)) {
    state.understory = { gardens: {}, compost: {}, tidePushback: {} };
  }
  const u = state.understory;
  if (!u.gardens || typeof u.gardens !== 'object' || Array.isArray(u.gardens)) u.gardens = {};
  if (!u.compost || typeof u.compost !== 'object' || Array.isArray(u.compost)) u.compost = {};
  if (!u.tidePushback || typeof u.tidePushback !== 'object' || Array.isArray(u.tidePushback)) u.tidePushback = {};
  // ── quiet ledger — all session-scoped plain JSON, like the compost ledger ──
  if (!Array.isArray(u.drops)) u.drops = [];
  if (!Array.isArray(u.whispers)) u.whispers = [];
  if (!Array.isArray(u.covers)) u.covers = [];
  if (!isObj(u.informants)) u.informants = {};
  if (!isObj(u.paid)) u.paid = {};
  u.seq = intOr(u.seq);
  u.favors = intOr(u.favors);
  // u.tier is the high-water mark of announced crossings — never below what the
  // favor count already earned, so a hostile/restored record cannot mute the
  // top-tier decay bonus or re-announce a crossing that already happened.
  u.tier = Math.max(intOr(u.tier), understoryAccessTierFor(u.favors).tier);
  u.notice = clamp01(u.notice);
  u.debtCr = Math.max(0, intOr(u.debtCr));
  u.blackouts = intOr(u.blackouts);
  u.blackoutUntil = num(u.blackoutUntil);
  u.nextWildDropAt = num(u.nextWildDropAt);
  u.freeCoverIssued = !!u.freeCoverIssued;
  // Drop malformed rows outright — a corrupt row must not sink the tick.
  u.drops = u.drops.filter((r) => isObj(r) && typeof r.id === 'string' && DROP_KINDS.has(r.kind));
  u.whispers = u.whispers.filter((r) => isObj(r) && typeof r.id === 'string' && WHISPER_KINDS.has(r.kind));
  // Bound the ledgers on read too: well-formed rows past the live cap plus the
  // kept log are hostile payload — open rows survive first, the closed log sheds
  // its oldest, and the rest go before normalize ever touches them.
  u.drops = boundLedgerRows(u.drops,
    UNDERSTORY_QUIET.maxOpenDrops, UNDERSTORY_QUIET.dropLogKeep);
  u.whispers = boundLedgerRows(u.whispers,
    UNDERSTORY_QUIET.maxOpenWhispers, UNDERSTORY_QUIET.whisperLogKeep);
  u.covers = u.covers.filter((r) => isObj(r) && typeof r.id === 'string' && typeof r.name === 'string');
  for (const r of u.drops) normalizeDropRec(r);
  for (const r of u.whispers) normalizeWhisperRec(r);
  for (const r of u.covers) normalizeCoverRec(r);
  trimCoverLog(u);
  for (const name of Object.keys(u.informants)) {
    const inf = u.informants[name];
    if (!isObj(inf)) { delete u.informants[name]; continue; }
    inf.name = name;
    inf.gardenId = inf.gardenId == null ? null : str(inf.gardenId);
    inf.owedCr = num(inf.owedCr);
    inf.tipsPaid = intOr(inf.tipsPaid);
  }
  // Bound the tab ledger: past the cap, inert names go first and oldest after.
  // Legit informants come from a fixed 16-name pool; anything beyond is hostile.
  if (Object.keys(u.informants).length > INFORMANT_CAP) {
    const names = Object.keys(u.informants);
    const inert = names.filter((n) => !(num(u.informants[n].owedCr) > 0)
      && intOr(u.informants[n].tipsPaid) <= 0);
    let need = names.length - INFORMANT_CAP;
    let i = 0;
    while (need > 0 && i < inert.length) { delete u.informants[inert[i++]]; need--; }
    for (let j = 0; need > 0 && j < names.length; j++) {
      if (u.informants[names[j]] !== undefined) { delete u.informants[names[j]]; need--; }
    }
  }
  // Primitive rows in the garden/compost ledgers go too — a hostile row like 7 or 'x'
  // turns a field write (rec.biomass = …, run.fedMass += …) into a strict-mode
  // TypeError that sinks the whole tick. The row drops; the live garden re-files next tick.
  for (const id of Object.keys(u.gardens)) if (!isObj(u.gardens[id])) delete u.gardens[id];
  for (const id of Object.keys(u.compost)) if (!isObj(u.compost[id])) delete u.compost[id];
  // Keyed ledgers bound on read as well: shadow pricing and the informant walk
  // iterate them, so a fattened payload must not tax every tick. Oldest keys shed.
  boundKeyedLedger(u.gardens, KEYED_LEDGER_CAP);
  boundKeyedLedger(u.compost, KEYED_LEDGER_CAP);
  boundKeyedLedger(u.tidePushback, KEYED_LEDGER_CAP);
  // The once-only stamp ledger is bounded on read as well as on write: a hostile or
  // stale payload past the cap sheds its oldest stamps instead of riding forever.
  const paidKeys = Object.keys(u.paid);
  for (let i = 0; paidKeys.length - i > PAID_STAMPS_CAP; i++) delete u.paid[paidKeys[i]];
  return u;
}

function normalizeDropRec(r) {
  r.entityId = r.entityId == null ? null : r.entityId;
  // gen is a strict-identity token: keep the raw value so a malformed row fails
  // closed (gen '5.9' or NaN must never coalesce into a real occupant's ===).
  r.gen = r.gen == null ? null : r.gen;
  r.gardenId = r.gardenId == null ? null : str(r.gardenId);
  r.destGardenId = r.destGardenId == null ? null : str(r.destGardenId);
  r.informant = r.informant == null ? null : str(r.informant);
  r.sectorId = r.sectorId == null ? null : str(r.sectorId);
  if (!isObj(r.pos)) r.pos = { x: 0, z: 0 };
  r.pos.x = num(r.pos.x); r.pos.z = num(r.pos.z);
  r.valueCr = Math.max(0, num(r.valueCr));
  r.postedAt = num(r.postedAt);
  // A far-future expiresAt would hold an open slot forever — cap to twice the TTL
  // so a hostile row still lapses on the ledger's own clock.
  r.expiresAt = Math.min(num(r.expiresAt), r.postedAt + UNDERSTORY_QUIET.dropTtlS * 2);
  r.settledAt = r.settledAt == null ? null : num(r.settledAt);
  r.state = typeof r.state === 'string' ? r.state : 'lost';
  r.wild = r.wild === true;
  return r;
}

function normalizeWhisperRec(r) {
  r.gardenId = r.gardenId == null ? null : str(r.gardenId);
  r.gardenEntityId = r.gardenEntityId == null ? null : r.gardenEntityId;
  r.gen = r.gen == null ? null : r.gen; // strict === guard, same as drop recs
  r.informant = r.informant == null ? null : str(r.informant);
  r.sectorId = r.sectorId == null ? null : str(r.sectorId);
  if (!isObj(r.pos)) r.pos = { x: 0, z: 0 };
  r.pos.x = num(r.pos.x); r.pos.z = num(r.pos.z);
  r.postedAt = num(r.postedAt);
  // Unbound rows answer only to their clock — a far-future expiresAt would jam an
  // open wire slot indefinitely. Same fail-closed cap as the drop ledger.
  r.expiresAt = Math.min(num(r.expiresAt), r.postedAt + UNDERSTORY_QUIET.whisperTtlS * 2);
  r.settledAt = r.settledAt == null ? null : num(r.settledAt);
  r.state = typeof r.state === 'string' ? r.state : 'lapsed';
  return r;
}

/**
 * Bound a ledger array to the live cap plus the kept log: every open row stays,
 * the newest closed rows stay to fill the log, and the rest go. Matches the
 * live-write discipline (_gcClosed sheds oldest closed first) on the read side.
 */
function boundLedgerRows(rows, maxOpen, keepClosed) {
  const cap = maxOpen + keepClosed;
  if (!Array.isArray(rows) || rows.length <= cap) return rows;
  const open = rows.filter((r) => r.state === 'open');
  if (open.length >= cap) return open.slice(-cap);
  const closed = rows.filter((r) => r.state !== 'open');
  return open.concat(closed.slice(-(cap - open.length)));
}

/** Bound a keyed ledger — string keys keep insertion order, so the oldest shed. */
function boundKeyedLedger(obj, cap) {
  const keys = Object.keys(obj);
  for (let i = 0; keys.length - i > cap; i++) delete obj[keys[i]];
}

/** Keep the name log bounded — burned names go first, then the oldest row. */
function trimCoverLog(u) {
  while (u.covers.length > UNDERSTORY_QUIET.coverLogKeep) {
    const i = u.covers.findIndex((c) => c && c.burned === true);
    u.covers.splice(i >= 0 ? i : 0, 1);
  }
}

function normalizeCoverRec(r) {
  r.integrity = Math.max(0, Math.min(UNDERSTORY_QUIET.coverPool, num(r.integrity)));
  r.acquiredAt = num(r.acquiredAt);
  r.how = typeof r.how === 'string' ? r.how : 'earned';
  r.burned = r.burned === true;
  r.burnedAt = r.burnedAt == null ? null : num(r.burnedAt);
  return r;
}

/**
 * Additive per-garden quiet-ledger fields: the reef's named informant and its own
 * stash/whisper clocks. Older records (and hand-built harness rows) get the fields
 * lazily, deterministically from the garden id.
 */
function normalizeGardenRec(state, gardenId, rec) {
  rec.biomass = num(rec.biomass);
  rec.fedMass = num(rec.fedMass);
  rec.fedByPlayer = num(rec.fedByPlayer);
  rec.seededAt = num(rec.seededAt);
  rec.informant = str(rec.informant) || informantNameFor(gardenId);
  if (!Number.isFinite(rec.nextDropAt)) {
    rec.nextDropAt = num(state.simTime) + UNDERSTORY_QUIET.firstDropS
      + frac('u-drop-first', gardenId) * UNDERSTORY_QUIET.dropJitterS;
  }
  if (!Number.isFinite(rec.nextWhisperAt)) {
    rec.nextWhisperAt = num(state.simTime) + UNDERSTORY_QUIET.firstWhisperS
      + frac('u-whisper-first', gardenId) * UNDERSTORY_QUIET.whisperJitterS;
  }
  return rec;
}

/** Live garden entities in the active sector (data.understoryGarden === true). */
export function gardenEntities(state) {
  const out = [];
  for (const e of state.entityList) {
    // The pos guard is load-bearing downstream: every reader runs dist2 on it, and a
    // pos-less row would throw inside the tick rather than fail closed.
    if (e && e.alive !== false && e.pos && e.data && e.data.understoryGarden === true) out.push(e);
  }
  return out;
}

/** Spawn a garden body. Returns the entity. */
export function spawnGarden(state, helpers, { x, z, sectorId = null, biomass = 0, gardenId = null }) {
  const stage = stageForBiomass(biomass);
  const id = gardenId || `garden:${state.tick}:${Math.floor(state.rng() * 1e9)}`;
  const e = helpers.spawnEntity({
    type: 'garden', team: 0, factionId: FACTION_ID,
    pos: { x, z }, vel: { x: 0, z: 0 }, rot: 0,
    radius: stage.radius, mass: 8000, hull: 1e9, hullMax: 1e9,
    collides: true, flags: { persistent: true },
    data: {
      understoryGarden: true, gardenId: id, gardenStage: stage.stage, gardenStageId: stage.id,
      gardenBiomass: biomass, sectorId: sectorId || state.world?.currentSectorId || null,
      name: stage.label, scannable: true,
      scanLabel: `UNDERSTORY GARDEN · ${stage.label.toUpperCase()} · stage ${stage.stage}/5`,
      // Spongy contact dressing for the physics/material lanes (low restitution is the
      // faction's "absorbed" signature — the garden eats what lands, it does not bounce it).
      restitutionMult: 0.05, softImpact: true,
    },
  });
  const u = ensureUnderstoryState(state);
  u.gardens[id] = {
    sectorId: e.data.sectorId, stage: stage.stage, biomass,
    x, z, fedByPlayer: 0, fedMass: 0, seededAt: state.simTime,
  };
  return e;
}

/** Biomass → stage write on both the entity and the persisted record. Returns stage row. */
function syncGardenStage(state, e, rec) {
  const stage = stageForBiomass(rec.biomass);
  const prevStage = e.data.gardenStage | 0;
  e.data.gardenBiomass = rec.biomass;
  e.data.gardenStage = stage.stage;
  e.data.gardenStageId = stage.id;
  e.radius = stage.radius;
  e.data.name = stage.label;
  e.data.scanLabel = `UNDERSTORY GARDEN · ${stage.label.toUpperCase()} · stage ${stage.stage}/5`;
  rec.stage = stage.stage;
  if (stage.stage > prevStage) return { grew: true, stage };
  return { grew: false, stage };
}

/**
 * Bloom tide pushback contributed by Understory gardens in a sector (row 520 contract).
 * A garden of stage 4 or higher pushes the local tide line; returns >= 0.
 */
export function understoryTidePushbackAt(state, sectorId) {
  const u = ensureUnderstoryState(state);
  let push = 0;
  for (const id of Object.keys(u.gardens)) {
    const g = u.gardens[id];
    if (g && g.sectorId === sectorId && g.stage >= UNDERSTORY_GARDENS.tidePushbackStage) {
      push += UNDERSTORY_GARDENS.tidePushbackPerGarden;
    }
  }
  return push;
}

function pickBark(state, lines) {
  if (!Array.isArray(lines) || !lines.length) return '';
  return lines[Math.floor(state.rng() * lines.length) % lines.length];
}

// ── Quiet-ledger readers ───────────────────────────────────────────────────────

/** The pilot's Understory access: tier row fields plus the favor count behind it. */
export function understoryAccess(state) {
  const u = ensureUnderstoryState(state);
  const row = understoryAccessTierFor(u.favors);
  return { tier: row.tier, id: row.id, label: row.label, payMult: row.payMult, favors: intOr(u.favors) };
}

/** The reef's watchfulness band for a notice scalar: quiet < seen < marked < hunted. */
export function understoryNoticeBand(notice) {
  const n = num(notice);
  if (n >= UNDERSTORY_QUIET.huntedBand) return 'hunted';
  if (n >= UNDERSTORY_QUIET.markedBand) return 'marked';
  if (n >= UNDERSTORY_QUIET.seenBand) return 'seen';
  return 'quiet';
}

/**
 * Black-market shadow pricing: the per-sector multiplier every quiet payout rides.
 * Deterministic — the Bloom tide inflates it, sated reefs deflate it, law heat on
 * the pilot adds a contraband premium, and the pilot's own band takes its cut.
 * Bounded to [priceFloor, priceCeil]. Access tier multiplies on top at pay time.
 */
export function understoryShadowPrice(state, sectorId) {
  const u = ensureUnderstoryState(state);
  const tide = num(state.worldPressure && state.worldPressure.tide
    && state.worldPressure.tide[sectorId]);
  let biomass = 0;
  for (const id of Object.keys(u.gardens)) {
    const g = u.gardens[id];
    if (g && g.sectorId === sectorId) biomass += num(g.biomass);
  }
  const sated = Math.min(UNDERSTORY_QUIET.satePriceCap, biomass * UNDERSTORY_QUIET.satePriceWeight);
  const heat = num(state.player && state.player.heat);
  const heatPremium = Math.min(UNDERSTORY_QUIET.heatPriceCap, heat * UNDERSTORY_QUIET.heatPriceWeight);
  const band = understoryNoticeBand(u.notice);
  const bandPenalty = band === 'marked' ? UNDERSTORY_QUIET.markedPricePenalty
    : band === 'hunted' ? UNDERSTORY_QUIET.huntedPricePenalty : 0;
  const raw = 1 + tide * UNDERSTORY_QUIET.tidePriceWeight + heatPremium - sated - bandPenalty;
  return Math.max(UNDERSTORY_QUIET.priceFloor, Math.min(UNDERSTORY_QUIET.priceCeil, raw));
}

/** The pilot's live cover name — newest unburned cover or null. A copy. */
export function understoryActiveCover(state) {
  const u = ensureUnderstoryState(state);
  for (let i = u.covers.length - 1; i >= 0; i--) {
    const c = u.covers[i];
    if (c && c.burned !== true) {
      return { id: c.id, name: c.name, integrity: num(c.integrity), how: c.how };
    }
  }
  return null;
}

/**
 * Snapshot of the whole quiet ledger for a market screen or prompt adapter:
 * access tier, notice band, shadow price, live covers, informant tabs, open
 * drops and open whispers. All copies — the wire is read, not held.
 */
export function understoryMarket(state) {
  const u = ensureUnderstoryState(state);
  const access = understoryAccess(state);
  const sectorId = (state.world && state.world.currentSectorId) || null;
  return {
    access,
    favors: intOr(u.favors),
    notice: num(u.notice),
    band: understoryNoticeBand(u.notice),
    blackedOut: num(state.simTime) < num(u.blackoutUntil),
    blackoutUntil: num(u.blackoutUntil),
    shadowPrice: understoryShadowPrice(state, sectorId),
    debtCr: intOr(u.debtCr),
    canConsign: access.tier >= UNDERSTORY_QUIET.consignTier,
    cover: understoryActiveCover(state),
    covers: u.covers.map((c) => ({
      id: c.id, name: c.name, integrity: num(c.integrity),
      burned: c.burned === true, how: c.how,
    })),
    informants: Object.keys(u.informants).map((n) => {
      const inf = u.informants[n];
      return { name: n, owedCr: num(inf.owedCr), tipsPaid: intOr(inf.tipsPaid) };
    }),
    drops: u.drops.filter((r) => r.state === 'open').map((r) => ({
      id: r.id, kind: r.kind, pos: { ...r.pos }, sectorId: r.sectorId,
      valueCr: num(r.valueCr), destGardenId: r.destGardenId, wild: r.wild === true,
      expiresAt: num(r.expiresAt),
    })),
    whispers: u.whispers.filter((w) => w.state === 'open').map((w) => ({
      id: w.id, kind: w.kind, gardenId: w.gardenId, informant: w.informant,
      sectorId: w.sectorId, expiresAt: num(w.expiresAt),
    })),
  };
}

export const understoryGardens = {
  name: 'understoryGardens',

  init(ctx) {
    this.destroy(); // Reinitialisation must not duplicate bus listeners.
    this.ctx = ctx; this.state = ctx.state; this.bus = ctx.bus; this.helpers = ctx.helpers;
    this._subs = [
      this.bus.on('entity:killed', (p) => this._onKilled(p)),
      // A release off the pilot's Line stamps the last handler — a set-down or a
      // snapped-line loss the reef later eats is still the pilot's delivery
      // (mines/lootShards do the same for their own bodies).
      this.bus.on('tether:released', (p) => this._onLineRelease(p)),
      this.bus.on('tether:broke', (p) => this._onLineRelease(p)),
      // Quiet-market intents a prompt/desk adapter can raise without importing the file.
      this.bus.on('understory:buyCover', () => this._onBuyCover()),
      this.bus.on('understory:payDebt', () => this._onPayDebt()),
    ];
    ensureUnderstoryState(this.state);
  },

  destroy() {
    for (const off of this._subs || []) {
      try { if (typeof off === 'function') off(); } catch { /* listener hygiene */ }
    }
    this._subs = [];
  },

  /**
   * tether:released / tether:broke — the pilot let this body go (deliberately or
   * by a snapped line). The mark lives on the body itself (serialized with it,
   * like the resolved stamp) so a set-down the reef eats minutes later still
   * counts as delivered. Only edible mass and tagged pods take the mark.
   */
  _onLineRelease(p) {
    const state = this.state;
    if (!p || !state || p.targetId == null) return;
    const e = state.entities && state.entities.get ? state.entities.get(p.targetId) : null;
    if (!e || e.alive === false || !e.data) return;
    if (e.data.understoryCacheId == null && !this.isEdible(e)) return;
    e.data.lastThrowerId = state.playerId;
  },

  /** sporeBloomOnDeath: a dead Understory hull seeds a stage-1 garden where it falls. */
  _onKilled(p) {
    if (!p) return;
    const state = this.state;
    // The quiet ledger answers first: a tagged pod dying is a crack or a loss, and a
    // witnessed kill moves the notice needle. Then the reef's own bloom rule stands.
    this._resolveDropKilled(state, p);
    this._noticeOnKill(state, p);
    if (UNDERSTORY_GARDENS.deathSeedsGarden !== true) return;
    const e = state.entities.get(p.id);
    if (!e || e.factionId !== FACTION_ID || e.data?.understoryGarden === true) return;
    // Same load-bearing pos guard gardenEntities carries: a malformed hull row
    // must fail closed in the kill dispatch, not seed a NaN reef at the origin.
    if (!e.pos || !Number.isFinite(e.pos.x) || !Number.isFinite(e.pos.z)) return;
    this.seedGardenAt(e.pos.x, e.pos.z, e.data?.sectorId || this.state.world?.currentSectorId);
  },

  /** Seed a stage-1 garden unless one already overlaps the spot. Returns entity or null. */
  seedGardenAt(x, z, sectorId = null) {
    for (const g of gardenEntities(this.state)) {
      if (dist2(g.pos, { x, z }) <= g.radius * g.radius) return null;
    }
    const e = spawnGarden(this.state, this.helpers, { x, z, sectorId });
    this.bus.emit('understory:gardenSeeded', {
      gardenId: e.data.gardenId, entityId: e.id, pos: { x, z }, tick: this.state.tick,
    });
    return e;
  },

  /** Is this body food for the slow rot? Living ships, stations and machines are not. */
  isEdible(e) {
    if (!e || e.alive === false || !e.data || !e.pos) return false;
    if (e.data.understoryGarden === true || e.factionId === FACTION_ID) return false;
    if (e.id === this.state.playerId) return false;
    return EDIBLE.has(e.type);
  },

  /** Was this mass player-delivered (flung/towed)? The Compost Run credits on that. */
  _playerFed(e) {
    return this._playerHandled(this.state, e);
  },

  /**
   * The wider player-handling check the quiet ledger credits on: a flung stamp
   * ('player' literal included — encounter scripts write it and frontier honors it),
   * the impulse provenance a real massline throw/sling release leaves on the body
   * (the canonical thrown-credit record the kill lanes read — held for the whole
   * flight of a payload-class body, and never touching entity.data), or the pod
   * riding the pilot's live Line (player record or player entity — both spellings,
   * both requiring the line to be active).
   */
  _playerHandled(state, e) {
    const d = e && e.data;
    if (d && (d.lastThrowerId === state.playerId || d.thrownBy === state.playerId
        || d.thrownBy === 'player')) return true;
    const prov = readRecentImpulseProvenance(e, state.tick);
    if (prov && prov.actorId === state.playerId) return true;
    const pTether = state.player && state.player.tether;
    if (pTether && pTether.active !== false && pTether.targetId === e.id) return true;
    const pEnt = state.entities.get(state.playerId);
    if (pEnt && pEnt.tether && pEnt.tether.active !== false && pEnt.tether.targetId === e.id) return true;
    return false;
  },

  /** One digestion pass for a garden: eat every edible body inside the padded ring. */
  _digest(e, rec) {
    const s = this.state;
    const reach = e.radius * UNDERSTORY_GARDENS.absorbPadding;
    for (const prey of s.entityList) {
      if (prey === e || !this.isEdible(prey)) continue;
      const pr = Number(prey.radius) || 0;
      if (dist2(prey.pos, e.pos) > (reach + pr) * (reach + pr)) continue;
      const fedMass = Math.max(0, Number(prey.mass) || 0);
      const gained = fedMass * UNDERSTORY_GARDENS.digestionYield;
      rec.biomass += gained;
      rec.fedMass += fedMass;
      const byPlayer = this._playerFed(prey);
      if (byPlayer) rec.fedByPlayer += fedMass;
      // A tagged cache pod resolves on the meal — the reef eats it either way, and who
      // delivered it decides whether the envelope opens. Once-only: the resolved stamp
      // rides the pod's own serialized data, so a session reset cannot re-mint it.
      if (prey.data.understoryCacheId != null && prey.data.understoryResolved !== true) {
        prey.data.understoryResolved = true;
        this._resolveDropEaten(s, e, rec, prey, byPlayer);
      }
      this.helpers.removeEntity(prey.id, { reason: 'understory_garden' });
      this.bus.emit('understory:gardenFed', {
        gardenId: e.data.gardenId, entityId: e.id, eatenId: prey.id, eatenType: prey.type,
        fedMass, gained, byPlayer, tick: s.tick,
      });
      if (byPlayer) {
        this._creditCompost(e, rec, fedMass);
        // The quiet ledger credits real feeds: a 'feed' whisper verifies, and the reef's
        // informant owes the pilot a little more under their name.
        const u = ensureUnderstoryState(s);
        this._verifyWhispers(s, 'feed', 'fed');
        this._oweInformantByName(s, u, rec.informant, UNDERSTORY_QUIET.feedOwedCr, e.data.gardenId);
      }
    }
  },

  /** E-26 the Compost Run: player-fed mass accrues until the run closes. */
  _creditCompost(e, rec, fedMass) {
    const s = this.state, u = ensureUnderstoryState(s);
    // The run ledger is session-only (state.understory is not serialized), but the completed
    // stamp rides the garden's persistent entity data — a save/continue cannot re-mint the reward.
    let run = u.compost[e.data.gardenId];
    if (!isObj(run)) {
      u.compost[e.data.gardenId] = run = {
        gardenId: e.data.gardenId, fedMass: 0, complete: e.data.compostRunComplete === true,
      };
    }
    // The entity stamp is the persistent truth — re-read it every credit so a
    // session row that forgot the finish cannot re-mint the reward.
    run.fedMass = num(run.fedMass);
    run.complete = run.complete === true || e.data.compostRunComplete === true;
    if (run.complete) return;
    run.fedMass += fedMass;
    if (run.fedMass >= UNDERSTORY_COMPOST_RUN.targetMass) {
      run.complete = true;
      run.completedAt = s.simTime;
      e.data.compostRunComplete = true;
      this.bus.emit('understory:compostRunComplete', {
        gardenId: e.data.gardenId, entityId: e.id, fedMass: run.fedMass, tick: s.tick,
      });
      this.bus.emit('comms:log', { text: UNDERSTORY_BARKS.runComplete, speaker: 'The Understory' });
      this.bus.emit('toast', { text: `COMPOST RUN COMPLETE — ${rec.fedByPlayer | 0}t fed`, kind: 'good', ttl: 4 });
      this.bus.emit('faction:repDelta', { factionId: FACTION_ID, delta: UNDERSTORY_COMPOST_RUN.repReward, reason: 'compost_run' });
      this.bus.emit('economy:grantCredits', {
        amount: Math.round(run.fedMass * UNDERSTORY_COMPOST_RUN.creditPerTonne),
        reason: 'understory_compost_run',
      });
    }
  },

  /** Gardener skiffs tend the nearest garden — a slow presence orbit, never a chase. */
  _tendGardeners() {
    const s = this.state, gardens = gardenEntities(s);
    if (!gardens.length) return;
    for (const e of s.entityList) {
      if (!e || e.alive === false || !e.pos || e.factionId !== FACTION_ID || e.data?.understoryGarden) continue;
      if (e.data?.role !== 'gardener-skiff' && e.data?.shipRole !== 'gardener-skiff') continue;
      let best = null, bestD2 = Infinity;
      for (const g of gardens) {
        const d2 = dist2(e.pos, g.pos);
        if (d2 < bestD2) { bestD2 = d2; best = g; }
      }
      if (!best) continue;
      const orbit = best.radius + 60;
      const d = Math.sqrt(bestD2) || 1;
      const err = d - orbit;
      const ux = (best.pos.x - e.pos.x) / d, uz = (best.pos.z - e.pos.z) / d;
      const speed = Math.max(-14, Math.min(14, err * 0.05));
      e.vel.x = ux * speed - uz * 6;
      e.vel.z = uz * speed + ux * 6;
    }
  },

  /** Rebuild persisted tide pushback (row 520 reads both the record and the reader). */
  _syncTidePushback() {
    const s = this.state, u = ensureUnderstoryState(s);
    const next = {};
    for (const id of Object.keys(u.gardens)) {
      const g = u.gardens[id];
      if (g && g.sectorId && g.stage >= UNDERSTORY_GARDENS.tidePushbackStage) {
        next[g.sectorId] = (next[g.sectorId] || 0) + UNDERSTORY_GARDENS.tidePushbackPerGarden;
      }
    }
    u.tidePushback = next;
  },

  /**
   * Spore Head: a mass held on the Line by a `head_spore` carrier grows a rot-skin —
   * low restitution and stick-on-impact (glue ammunition). Deterministic hold time.
   */
  _sporeHead() {
    const s = this.state;
    for (const holder of s.entityList) {
      if (!holder || holder.alive === false || holder.data?.lineHeadId !== UNDERSTORY_SPORE_HEAD.id) continue;
      const tether = holder.tether || (holder.id === s.playerId ? s.player?.tether : null);
      const target = tether && tether.active ? s.entities.get(tether.targetId) : null;
      if (!target || target.alive === false) continue;
      const d = target.data || (target.data = {});
      if (d.sporeSkin === true) continue;
      // Integer tick count — a float accumulate can land 4.0 as 3.9999… and never take.
      d.sporeSkinTicks = (d.sporeSkinTicks | 0) + 1;
      if (d.sporeSkinTicks >= Math.ceil(UNDERSTORY_SPORE_HEAD.growS * 60)) {
        d.sporeSkin = true;
        d.restitutionMult = UNDERSTORY_SPORE_HEAD.heldEffect.restitutionMult;
        d.sticksOnImpact = UNDERSTORY_SPORE_HEAD.heldEffect.sticksOnImpact;
        this.bus.emit('understory:sporeSkin', { entityId: target.id, holderId: holder.id, tick: s.tick });
        this.bus.emit('toast', { text: 'SPORE SKIN — it will stick to whatever it hits', kind: 'info', ttl: 3 });
      }
    }
  },

  // ── THE QUIET LEDGER ──────────────────────────────────────────────────────────

  /** One quiet deed: count it, raise the access tier when the count crosses. */
  _favor(state, kind, refId) {
    const u = ensureUnderstoryState(state);
    u.favors = intOr(u.favors) + 1;
    const row = understoryAccessTierFor(u.favors);
    this.bus.emit('understory:favor', {
      kind, ref: refId ?? null, favors: u.favors, tier: row.tier, tick: state.tick,
    });
    if (row.tier > intOr(u.tier)) {
      u.tier = row.tier;
      this.bus.emit('understory:accessTier', {
        tier: row.tier, id: row.id, label: row.label, favors: u.favors, tick: state.tick,
      });
      this.bus.emit('toast', { text: `UNDERSTORY ACCESS — ${row.label.toUpperCase()}`, kind: 'good', ttl: 4 });
      this._log(state, row.line);
      // The first real standing earns a name on the house — the network names you.
      if (row.tier >= 1 && u.freeCoverIssued !== true) {
        const cover = this._pushCoverRecord(state, 'earned');
        if (cover) { u.freeCoverIssued = true; this._announceCover(state, cover); }
      }
    }
  },

  _grant(state, amount, reason) {
    const n = Math.round(num(amount));
    if (!Number.isSafeInteger(n) || n <= 0) return;
    this.bus.emit('economy:grantCredits', { amount: n, reason });
  },

  _rep(state, delta, reason) {
    const d = num(delta);
    if (!Number.isFinite(d) || d === 0) return;
    this.bus.emit('faction:repDelta', { factionId: FACTION_ID, delta: d, reason });
  },

  /**
   * The quiet market's pay pipe: base credits × access payMult × the sector's shadow
   * index. While the pilot owes the network a debt the toll skims its share first —
   * the skim is a real debit, emitted and bounded, never a silent haircut.
   */
  _quietPay(state, u, baseCr, reasonTag, sectorId) {
    const mult = understoryAccess(state).payMult * understoryShadowPrice(state, sectorId);
    const gross = Math.max(0, Math.round(num(baseCr) * mult));
    let skim = 0;
    if (intOr(u.debtCr) > 0 && gross > 0) {
      skim = Math.min(intOr(u.debtCr), Math.round(gross * UNDERSTORY_QUIET.skimFrac));
      if (skim > 0) {
        u.debtCr = Math.max(0, intOr(u.debtCr) - skim);
        this.bus.emit('understory:debtChanged', {
          debtCr: u.debtCr, delta: -skim, cause: 'skim', tick: state.tick,
        });
        if (u.debtCr <= 0) this._announceDebtSquared(state);
        else this._log(state, NOTICE_BARKS.debtSkimmed);
      }
    }
    const net = gross - skim;
    this._grant(state, net, reasonTag);
    return { gross, skim, net };
  },

  /** A running toll the pilot owes the network. */
  _addDebt(state, u, amount, cause) {
    const delta = Math.max(0, Math.round(num(amount)));
    if (delta <= 0) return;
    u.debtCr = intOr(u.debtCr) + delta;
    this.bus.emit('understory:debtChanged', {
      debtCr: u.debtCr, delta, cause: cause || null, tick: state.tick,
    });
  },

  _announceDebtSquared(state) {
    this.bus.emit('understory:debtSquared', { at: num(state.simTime), tick: state.tick });
    this._log(state, 'The toll is paid. The network forgets the arithmetic.');
  },

  /** Once-only stamp for side-effects keyed by a content id — bounded ledger. */
  _paidOnce(u, key) {
    if (!isObj(u.paid)) u.paid = {};
    if (u.paid[key] != null) return false;
    u.paid[key] = num(this.state && this.state.simTime);
    const keys = Object.keys(u.paid);
    if (keys.length > PAID_STAMPS_CAP) delete u.paid[keys[0]]; // insertion order is eviction order
    return true;
  },

  _log(state, text, speaker = 'The Understory') {
    if (typeof text !== 'string' || !text) return;
    this.bus.emit('comms:log', { text, speaker });
  },

  /** Deterministic bark pick — hash-salted, so bare harnesses without rng stay honest. */
  _pickLine(lines, salt) {
    if (!Array.isArray(lines) || !lines.length) return '';
    const tick = this.state ? this.state.tick : 0;
    const i = Math.floor(frac('u-bark', salt, tick) * lines.length) % lines.length;
    return lines[i];
  },

  /**
   * Quiet work accrues to the named informant's tab — they settle it in kind.
   * `gardenId` is optional context: the informant remembers which reef the deed
   * was done under, so the payback can plant there later.
   */
  _oweInformantByName(state, u, name, cr, gardenId) {
    const who = str(name);
    if (!who || !(num(cr) > 0)) return;
    const inf = u.informants[who] || (u.informants[who] = { name: who, gardenId: null, owedCr: 0, tipsPaid: 0 });
    inf.owedCr = num(inf.owedCr) + num(cr);
    if (inf.gardenId == null && gardenId != null) inf.gardenId = str(gardenId) || null;
  },

  // ── Dead-drop caches ─────────────────────────────────────────────────────────

  /**
   * Spawn a quiet pod outside an anchor's absorb ring and file its record.
   * opts: { kind, anchor:{x,z,radius}, sectorId, gardenId, destGardenId, destName,
   *         informant, wild }. Returns the record.
   */
  _spawnDrop(state, u, opts) {
    const kind = DROP_KINDS.has(opts.kind) ? opts.kind : 'stash';
    const id = `drop:${u.seq++}`;
    const base = kind === 'consignment' ? UNDERSTORY_QUIET.consignBaseCr
      : kind === 'marked' ? UNDERSTORY_QUIET.markedBaseCr
      : UNDERSTORY_QUIET.stashBaseCr;
    const valueCr = Math.max(1, Math.round(base * (0.85 + frac('u-drop-val', id) * 0.5)));
    const ang = frac('u-drop-ang', id, u.seq) * Math.PI * 2;
    const pad = (opts.wild === true ? UNDERSTORY_QUIET.wildPad : UNDERSTORY_QUIET.dropSpawnPad)
      + frac('u-drop-r', id)
      * (opts.wild === true ? UNDERSTORY_QUIET.wildPadRange : UNDERSTORY_QUIET.dropSpawnPadRange);
    const r = (Number(opts.anchor && opts.anchor.radius) || 0) + pad;
    const pos = {
      x: num(opts.anchor && opts.anchor.x) + Math.cos(ang) * r,
      z: num(opts.anchor && opts.anchor.z) + Math.sin(ang) * r,
    };
    // The pod stays inside the sector's charted edge when the world names one.
    const boundR = Number(state.bounds && state.bounds.radius);
    if (Number.isFinite(boundR) && boundR > 0) {
      const d = Math.hypot(pos.x, pos.z);
      if (d > boundR * 0.95) { const s = (boundR * 0.95) / d; pos.x *= s; pos.z *= s; }
    }
    let label;
    if (kind === 'consignment' && opts.destPos) {
      const dx = num(opts.destPos.x) - pos.x, dz = num(opts.destPos.z) - pos.z;
      const leg = Math.round(Math.hypot(dx, dz));
      label = `UNDERSTORY CONSIGNMENT · bound ${compassWord(dx, dz)} ${leg}m for the far reef`;
    } else if (kind === 'consignment') {
      label = `UNDERSTORY CONSIGNMENT · bound for ${str(opts.destName, 'the far reef').toUpperCase()}`;
    } else if (kind === 'marked') {
      label = `MARKED CACHE · ${str(opts.informant, 'the informant')} pays in kind — yours to open`;
    } else {
      label = 'QUIET CACHE · the reef takes it home, or a gun opens it cheaper';
    }
    const e = this.helpers.spawnEntity({
      type: 'payload', team: 0, factionId: null,
      pos, vel: { x: 0, z: 0 }, rot: ang,
      radius: UNDERSTORY_QUIET.dropRadius, mass: UNDERSTORY_QUIET.dropMass,
      hull: UNDERSTORY_QUIET.dropHull, hullMax: UNDERSTORY_QUIET.dropHull,
      collides: true, flags: { persistent: true },
      data: {
        understoryDrop: true, understoryCacheId: id, cacheKind: kind,
        destGardenId: opts.destGardenId || null, sectorId: opts.sectorId || null,
        name: label, scannable: true, scanLabel: label,
      },
    });
    const rec = {
      id, kind, entityId: e.id, gen: e.occupantGeneration ?? null,
      gardenId: opts.gardenId || null, destGardenId: opts.destGardenId || null,
      informant: opts.informant || null, sectorId: opts.sectorId || null,
      pos: { x: pos.x, z: pos.z }, valueCr,
      postedAt: num(state.simTime), expiresAt: num(state.simTime) + UNDERSTORY_QUIET.dropTtlS,
      state: 'open', wild: opts.wild === true,
    };
    u.drops.push(rec);
    this.bus.emit('understory:dropStashed', {
      dropId: id, kind, entityId: e.id, gardenId: rec.gardenId, destGardenId: rec.destGardenId,
      informant: rec.informant, sectorId: rec.sectorId, pos: { ...rec.pos },
      valueCr, expiresAt: rec.expiresAt, wild: rec.wild, tick: state.tick,
    });
    return rec;
  },

  _tickDrops(state, u, gardens) {
    const band = understoryNoticeBand(u.notice);
    const blackedOut = num(state.simTime) < num(u.blackoutUntil);
    const wireOpen = band !== 'marked' && band !== 'hunted' && !blackedOut;
    let openCount = u.drops.reduce((n, r) => n + (r.state === 'open' ? 1 : 0), 0);

    // ── Shed: each reef posts on its own clock; wild stashes find the pilot. ──
    if (state.mode === 'flight' && wireOpen) {
      const tier = understoryAccessTierFor(u.favors).tier;
      for (const e of gardens) {
        if (openCount >= UNDERSTORY_QUIET.maxOpenDrops) break;
        if ((e.data.gardenStage | 0) < UNDERSTORY_QUIET.dropStage) continue;
        const rec = u.gardens[e.data.gardenId];
        if (!rec) continue;
        if (num(state.simTime) < num(rec.nextDropAt)) continue;
        rec.nextDropAt = num(state.simTime) + UNDERSTORY_QUIET.dropPeriodS
          + frac('u-drop-gap', e.data.gardenId, u.seq) * UNDERSTORY_QUIET.dropJitterS;
        if (u.drops.some((r) => r.state === 'open' && r.gardenId === e.data.gardenId)) continue;
        // Addressed work needs a second live reef to be bound for; a lone reef stashes.
        const others = gardens.filter((g) => g !== e && g.data && g.data.gardenId);
        let kind = 'stash', dest = null;
        if (tier >= UNDERSTORY_QUIET.consignTier && others.length
            && frac('u-consign', e.data.gardenId, u.seq) < UNDERSTORY_QUIET.consignShare) {
          dest = others[hash32('u-destpick', e.data.gardenId, u.seq) % others.length];
          kind = 'consignment';
        }
        this._spawnDrop(state, u, {
          kind, anchor: { x: e.pos.x, z: e.pos.z, radius: e.radius },
          sectorId: rec.sectorId || e.data.sectorId,
          gardenId: e.data.gardenId,
          destGardenId: dest && dest.data.gardenId,
          destName: dest && dest.data.name,
          destPos: dest && { x: dest.pos.x, z: dest.pos.z },
          informant: rec.informant,
        });
        openCount++;
        this._log(state, this._pickLine(
          kind === 'consignment' ? DROP_BARKS.consignment : DROP_BARKS.stash, e.data.gardenId));
      }
      // The wild stash: once the pilot is Heard, the market finds their line.
      if (!(num(u.nextWildDropAt) > 0)) {
        u.nextWildDropAt = num(state.simTime) + UNDERSTORY_QUIET.wildDropS;
      } else if (tier >= UNDERSTORY_QUIET.wildDropTier && openCount < UNDERSTORY_QUIET.maxOpenDrops
          && num(state.simTime) >= num(u.nextWildDropAt)) {
        u.nextWildDropAt = num(state.simTime) + UNDERSTORY_QUIET.wildDropS
          + frac('u-wild-gap', u.seq) * UNDERSTORY_QUIET.wildDropS * 0.5;
        const pe = state.entities.get(state.playerId);
        if (pe && pe.alive !== false && pe.pos) {
          this._spawnDrop(state, u, {
            kind: 'stash', wild: true,
            anchor: { x: pe.pos.x, z: pe.pos.z, radius: Number(pe.radius) || 12 },
            sectorId: state.world && state.world.currentSectorId || null,
          });
          openCount++;
          this._log(state, this._pickLine(DROP_BARKS.wild, 'wild'));
        }
      }
    }

    // ── Resolve: gone pods, expiry, and orphans a session restore left behind. ──
    for (const rec of u.drops) {
      if (rec.state !== 'open') continue;
      const pod = state.entities.get(rec.entityId);
      const ok = pod && pod.alive !== false
        && (rec.gen == null || pod.occupantGeneration === rec.gen)
        && pod.data && pod.data.understoryCacheId === rec.id
        && pod.data.understoryResolved !== true;
      if (!ok) {
        rec.state = 'lost';
        rec.settledAt = num(state.simTime);
        this.bus.emit('understory:dropLapsed', {
          dropId: rec.id, kind: rec.kind, cause: 'pod_lost', tick: state.tick,
        });
        continue;
      }
      if (num(state.simTime) >= num(rec.expiresAt)) {
        rec.state = 'expired';
        rec.settledAt = num(state.simTime);
        pod.data.understoryResolved = true;
        this.helpers.removeEntity(pod.id, { reason: 'understory_cache_expired' });
        this.bus.emit('understory:dropLapsed', {
          dropId: rec.id, kind: rec.kind, cause: 'expired', tick: state.tick,
        });
      }
    }
    // A tagged pod with no open record is a restored leftover or an already-settled row —
    // stamp it once so it is ordinary mass, never a second resolution.
    for (const e of state.entityList) {
      const d = e && e.data;
      if (!d || d.understoryCacheId == null || d.understoryResolved === true) continue;
      // The open row must name THIS occupant — an id alone is not enough: a reset
      // seq reuses drop:n ordinals, and the stale pod under an old body must stamp.
      const hasOpen = u.drops.some((r) => r.state === 'open'
        && r.id === d.understoryCacheId
        && r.entityId === e.id
        && (r.gen == null || r.gen === e.occupantGeneration));
      if (!hasOpen) d.understoryResolved = true;
    }
    this._gcClosed(u.drops, UNDERSTORY_QUIET.dropLogKeep);
  },

  /** A garden ate a tagged pod — delivery, return, or the wrong rings. */
  _resolveDropEaten(state, garden, grec, pod, byPlayer) {
    const u = ensureUnderstoryState(state);
    const rec = u.drops.find((r) => r.state === 'open'
      && r.id === pod.data.understoryCacheId
      && r.entityId === pod.id
      && (r.gen == null || r.gen === pod.occupantGeneration));
    if (!rec) return; // session-forgotten: an ordinary meal, nothing owed
    const gardenId = garden.data.gardenId;
    rec.settledAt = num(state.simTime);
    if (rec.kind === 'consignment' && gardenId !== rec.destGardenId) {
      rec.state = 'lost';
      this.bus.emit('understory:dropLapsed', {
        dropId: rec.id, kind: rec.kind, cause: 'wrong_rings', tick: state.tick,
      });
      this._log(state, this._pickLine(DROP_BARKS.wrongRings, rec.id));
      return;
    }
    if (byPlayer !== true) {
      rec.state = 'absorbed'; // drifted in on its own — the reef quietly takes it back
      this.bus.emit('understory:dropLapsed', {
        dropId: rec.id, kind: rec.kind, cause: 'absorbed', tick: state.tick,
      });
      return;
    }
    const sectorId = rec.sectorId || grec.sectorId
      || (state.world && state.world.currentSectorId) || null;
    if (rec.kind === 'consignment') {
      rec.state = 'delivered';
      // The deed counts before the wire pays — a crossing delivery settles at
      // the rate it just earned.
      this._favor(state, 'deliver', rec.id);
      const paid = this._quietPay(state, u, rec.valueCr, `understory_drop_${rec.kind}:${rec.id}`, sectorId);
      this._rep(state, UNDERSTORY_QUIET.deliverRep, 'understory_consignment');
      this._verifyWhispers(state, 'run', 'delivered');
      this._oweInformantByName(
        state, u, rec.informant || grec.informant,
        UNDERSTORY_QUIET.consignOwedCr, rec.gardenId || gardenId,
      );
      this.bus.emit('understory:dropDelivered', {
        dropId: rec.id, gardenId, destGardenId: rec.destGardenId,
        payCr: paid.net, skimCr: paid.skim, tick: state.tick,
      });
      this._log(state, this._pickLine(DROP_BARKS.delivered, rec.id));
    } else {
      const marked = rec.kind === 'marked';
      rec.state = 'returned';
      this._favor(state, 'return', rec.id);
      const paid = this._quietPay(state, u, rec.valueCr, `understory_drop_${rec.kind}:${rec.id}`, sectorId);
      this._rep(state, marked ? UNDERSTORY_QUIET.markedReturnRep : UNDERSTORY_QUIET.returnRep,
        'understory_cache_return');
      this._verifyWhispers(state, 'keep', 'returned');
      this._oweInformantByName(state, u, grec.informant, UNDERSTORY_QUIET.stashOwedCr, gardenId);
      this.bus.emit('understory:dropReturned', {
        dropId: rec.id, kind: rec.kind, gardenId,
        payCr: paid.net, skimCr: paid.skim, tick: state.tick,
      });
      this._log(state, marked
        ? `${str(rec.informant, 'The informant')}'s gift returns to the reef — the quiet settles.`
        : this._pickLine(DROP_BARKS.returned, rec.id));
    }
    this._gcClosed(u.drops, UNDERSTORY_QUIET.dropLogKeep);
  },

  /** A tagged pod died — a sanctioned gift opens, or a broken seal costs. */
  _resolveDropKilled(state, p) {
    const victim = state.entities.get(p.id);
    const d = victim && victim.data;
    if (!d || d.understoryCacheId == null || d.understoryResolved === true) return;
    const u = ensureUnderstoryState(state);
    const rec = u.drops.find((r) => r.state === 'open'
      && r.id === d.understoryCacheId
      && r.entityId === victim.id
      && (r.gen == null || r.gen === victim.occupantGeneration));
    d.understoryResolved = true;
    if (!rec) return; // session-forgotten pod: goods to the drift, nothing owed
    const byPlayer = p.killerId != null && p.killerId === state.playerId;
    rec.settledAt = num(state.simTime);
    if (byPlayer !== true) {
      rec.state = 'lost';
      this.bus.emit('understory:dropLapsed', {
        dropId: rec.id, kind: rec.kind, cause: 'destroyed', tick: state.tick,
      });
      return;
    }
    rec.state = 'cracked';
    const sanctioned = rec.kind === 'marked';
    const paid = this._quietPay(
      state, u,
      rec.valueCr * (sanctioned ? 1 : UNDERSTORY_QUIET.crackFrac),
      `understory_drop_crack:${rec.id}`, rec.sectorId,
    );
    if (sanctioned) {
      this._log(state, `${str(rec.informant, 'The informant')}'s gift opens — the quiet pays its debts.`);
    } else {
      this._addDebt(state, u, UNDERSTORY_QUIET.debtPerCrack, 'crack');
      this._raiseNotice(state, u, UNDERSTORY_QUIET.crackNotice, 'crack');
      if (this._paidOnce(u, `crackrep:${rec.id}`)) {
        this._rep(state, UNDERSTORY_QUIET.crackRep, 'understory_cache_cracked');
      }
      this._log(state, this._pickLine(DROP_BARKS.cracked, rec.id));
    }
    this.bus.emit('understory:dropCracked', {
      dropId: rec.id, kind: rec.kind, byPlayer: true, sanctioned,
      payCr: paid.net, skimCr: paid.skim, tick: state.tick,
    });
    this._gcClosed(u.drops, UNDERSTORY_QUIET.dropLogKeep);
  },

  // ── The whisper wire: rumors that verify or sour ────────────────────────────

  _postWhisper(state, u, e, rec) {
    const tier = understoryAccessTierFor(u.favors).tier;
    const kinds = tier >= UNDERSTORY_QUIET.consignTier ? WHISPER_KINDS_ALL : WHISPER_KINDS_EARLY;
    const kind = kinds[hash32('u-whisper-kind', e.data.gardenId, u.seq) % kinds.length];
    const w = {
      id: `whisper:${u.seq++}`, kind,
      gardenId: e.data.gardenId, gardenEntityId: e.id, gen: e.occupantGeneration ?? null,
      informant: rec.informant, sectorId: rec.sectorId || e.data.sectorId,
      pos: { x: e.pos.x, z: e.pos.z },
      postedAt: num(state.simTime), expiresAt: num(state.simTime) + UNDERSTORY_QUIET.whisperTtlS,
      state: 'open',
    };
    u.whispers.push(w);
    this.bus.emit('understory:whisperPosted', {
      whisperId: w.id, kind, gardenId: w.gardenId, informant: w.informant,
      sectorId: w.sectorId, pos: { ...w.pos }, expiresAt: w.expiresAt, tick: state.tick,
    });
    const line = this._pickLine(WHISPER_BARKS[kind] || WHISPER_BARKS.feed, w.id);
    this._log(state, line.replace('{name}', str(w.informant, 'A quiet voice')));
    return w;
  },

  _tickWhispers(state, u, gardens) {
    const band = understoryNoticeBand(u.notice);
    const blackedOut = num(state.simTime) < num(u.blackoutUntil);
    const wireOpen = band !== 'marked' && band !== 'hunted' && !blackedOut;

    // Post on each reef's own clock — one open whisper per reef, a bounded wire.
    if (state.mode === 'flight' && wireOpen) {
      for (const e of gardens) {
        if ((e.data.gardenStage | 0) < UNDERSTORY_QUIET.whisperStage) continue;
        const rec = u.gardens[e.data.gardenId];
        if (!rec) continue;
        if (num(state.simTime) < num(rec.nextWhisperAt)) continue;
        rec.nextWhisperAt = num(state.simTime) + UNDERSTORY_QUIET.whisperPeriodS
          + frac('u-whisper-gap', e.data.gardenId, u.seq) * UNDERSTORY_QUIET.whisperJitterS;
        const openForGarden = u.whispers.some((w) => w.state === 'open' && w.gardenId === e.data.gardenId);
        const openCount = u.whispers.reduce((n, w) => n + (w.state === 'open' ? 1 : 0), 0);
        if (openForGarden || openCount >= UNDERSTORY_QUIET.maxOpenWhispers) continue;
        this._postWhisper(state, u, e, rec);
      }
    }

    // Sour what nobody ran, and lapse what a dead reef can no longer vouch for.
    // An unbound row (no garden entity was recorded) answers only to its clock.
    for (const w of u.whispers) {
      if (w.state !== 'open') continue;
      const g = w.gardenEntityId != null ? state.entities.get(w.gardenEntityId) : null;
      const gardenAlive = w.gardenEntityId == null
        ? true
        : (g != null && g.alive !== false && (w.gen == null || g.occupantGeneration === w.gen));
      if (num(state.simTime) < num(w.expiresAt) && gardenAlive) continue;
      w.state = gardenAlive ? 'soured' : 'lapsed';
      w.settledAt = num(state.simTime);
      if (w.state === 'soured') {
        if (this._paidOnce(u, `sour:${w.id}`)) {
          this._rep(state, UNDERSTORY_QUIET.sourRep, 'understory_whisper_soured');
        }
        const line = this._pickLine(WHISPER_BARKS.soured, w.id);
        this._log(state, line.replace('{name}', str(w.informant, 'A quiet voice')));
      }
      // A lapse is not a sour: a dead reef cost the pilot no standing, so it goes
      // out on its own name — parallel to understory:dropLapsed, not soured.
      this.bus.emit(w.state === 'soured' ? 'understory:whisperSoured' : 'understory:whisperLapsed', {
        whisperId: w.id, kind: w.kind, gardenId: w.gardenId,
        cause: w.state, tick: state.tick,
      });
    }
    this._gcClosed(u.whispers, UNDERSTORY_QUIET.whisperLogKeep);
  },

  /** Verify the oldest open whisper of a kind — the pilot did the named thing. */
  _verifyWhispers(state, kind, how) {
    const u = ensureUnderstoryState(state);
    for (const w of u.whispers) {
      if (w.state !== 'open' || w.kind !== kind) continue;
      w.state = 'verified';
      w.how = how;
      w.settledAt = num(state.simTime);
      // Same law as the drop path: the deed counts before the wire pays, so a whisper
      // that crosses an access tier settles at the rate it just earned.
      this._favor(state, 'whisper', w.id);
      const paid = this._quietPay(state, u, UNDERSTORY_QUIET.whisperPayCr,
        `understory_whisper:${w.id}`, w.sectorId);
      this._rep(state, UNDERSTORY_QUIET.whisperRep, 'understory_whisper_verified');
      this._oweInformantByName(state, u, w.informant, UNDERSTORY_QUIET.whisperOwedCr, w.gardenId);
      this.bus.emit('understory:whisperVerified', {
        whisperId: w.id, kind, gardenId: w.gardenId, informant: w.informant,
        how, payCr: paid.net, skimCr: paid.skim, tick: state.tick,
      });
      const line = this._pickLine(WHISPER_BARKS.verified, w.id);
      this._log(state, line.replace('{name}', str(w.informant, 'A quiet voice')));
      return true;
    }
    return false;
  },

  // ── Informant debts: the tab settles in kind ────────────────────────────────

  _tickInformants(state, u, gardens) {
    if (state.mode !== 'flight') return;
    if (num(state.simTime) < num(u.blackoutUntil)) return;
    // A marked stash is still a drop — past 'marked' the wire plants nothing for
    // the pilot; the tab keeps its count until the name cools below the mark.
    const band = understoryNoticeBand(u.notice);
    if (band === 'marked' || band === 'hunted') return;
    let openMarked = u.drops.reduce((n, r) => n + (r.state === 'open' && r.kind === 'marked' ? 1 : 0), 0);
    for (const name of Object.keys(u.informants)) {
      const inf = u.informants[name];
      if (!isObj(inf) || num(inf.owedCr) < UNDERSTORY_QUIET.owedTipCr) continue;
      if (openMarked >= UNDERSTORY_QUIET.maxOpenMarked) break;
      // The gift plants at the informant's reef — the live garden first, its record after.
      let anchor = null, sectorId = null, gardenId = null;
      const live = gardens.find((e) => {
        const g = u.gardens[e.data && e.data.gardenId];
        return g && g.informant === name;
      });
      if (live) {
        anchor = { x: live.pos.x, z: live.pos.z, radius: live.radius };
        gardenId = live.data.gardenId;
        sectorId = live.data.sectorId;
      } else {
        const gid = str(inf.gardenId);
        const g = gid ? u.gardens[gid] : null;
        const here = (state.world && state.world.currentSectorId) || null;
        // The gift plants at the informant's own reef — a dead reef's last spot in this
        // sector is honest, but a record from another sector would materialize the pod
        // at wrong-sector coordinates inside this space. The tab simply waits.
        if (!isObj(g) || !Number.isFinite(g.x) || !Number.isFinite(g.z)) continue;
        if (here != null && g.sectorId != null && g.sectorId !== here) continue;
        anchor = { x: num(g.x), z: num(g.z), radius: stageForBiomass(num(g.biomass)).radius };
        gardenId = gid;
        sectorId = g.sectorId || here;
      }
      inf.owedCr = num(inf.owedCr) - UNDERSTORY_QUIET.owedTipCr;
      inf.tipsPaid = intOr(inf.tipsPaid) + 1;
      const rec = this._spawnDrop(state, u, {
        kind: 'marked', anchor, sectorId, gardenId, informant: name,
      });
      openMarked++;
      this.bus.emit('understory:markedStash', {
        informant: name, dropId: rec.id, entityId: rec.entityId,
        pos: { ...rec.pos }, sectorId, valueCr: rec.valueCr, tick: state.tick,
      });
      const line = this._pickLine(DROP_BARKS.marked, name);
      this._log(state, `${name} ${line}`);
    }
  },

  // ── Detection-risk escalation: the reef's own watchfulness ─────────────────

  _noticeOnKill(state, p) {
    if (p.killerId == null || p.killerId !== state.playerId) return;
    const victim = state.entities.get(p.id);
    if (!victim || victim.type !== 'ship') return;
    const u = ensureUnderstoryState(state);
    if (victim.factionId === FACTION_ID) {
      if (victim.data && victim.data.understoryGarden === true) return; // a reef is not a hull
      this._raiseNotice(state, u, UNDERSTORY_QUIET.killUnderstory, 'understory_hull');
      this._log(state, this._pickLine(NOTICE_BARKS.hullDown, victim.id));
      return;
    }
    // Any kill inside a garden's watch ring — the reef saw the gun.
    const pos = (p.pos && Number.isFinite(p.pos.x)) ? p.pos : victim.pos;
    if (!pos) return;
    for (const g of gardenEntities(state)) {
      const reach = UNDERSTORY_QUIET.watchRadius + (Number(g.radius) || 0);
      if (dist2(pos, g.pos) <= reach * reach) {
        this._raiseNotice(state, u, UNDERSTORY_QUIET.killNearGarden, 'watched_kill');
        return;
      }
    }
  },

  /**
   * Raise the notice needle. A live cover name drinks its share first; overflow lands
   * on the pilot. Band crossings emit once; saturation calls the blacklist down.
   */
  _raiseNotice(state, u, amount, cause) {
    if (!(Number.isFinite(amount) && amount > 0)) return;
    let applied = amount;
    const cover = this._activeCoverRec(u);
    if (cover) {
      const soak = Math.min(applied * UNDERSTORY_QUIET.coverSoakFrac, num(cover.integrity));
      if (soak > 0) {
        cover.integrity = Math.max(0, num(cover.integrity) - soak);
        applied -= soak;
      }
      if (num(cover.integrity) <= 0) this._burnCover(state, cover, 'spent');
    }
    const before = num(u.notice);
    const after = clamp01(before + applied);
    u.notice = after;
    const bBefore = understoryNoticeBand(before), bAfter = understoryNoticeBand(after);
    if (bAfter !== bBefore) {
      this.bus.emit('understory:noticeChanged', {
        notice: after, band: bAfter, prevBand: bBefore, cause: cause || null, tick: state.tick,
      });
      if (NOTICE_BANDS.indexOf(bAfter) > NOTICE_BANDS.indexOf(bBefore)) {
        this._log(state, NOTICE_BARKS[bAfter] || NOTICE_BARKS.seen);
        if (bAfter === 'marked' || bAfter === 'hunted') {
          this.bus.emit('toast', {
            text: bAfter === 'marked'
              ? 'THE QUIET MARKS YOU — the wire goes dark'
              : 'THE QUIET HUNTS YOUR NAME — prices bleed',
            kind: 'warn', ttl: 5,
          });
        }
      }
    }
    if (after >= UNDERSTORY_QUIET.noticeSaturate) this._blacklist(state, u, cause);
  },

  /** The blacklist: sustained saturation and the quiet forgets how to find you. */
  _blacklist(state, u, cause) {
    u.blackouts = intOr(u.blackouts) + 1;
    u.blackoutUntil = num(state.simTime) + UNDERSTORY_QUIET.blackoutS;
    u.notice = UNDERSTORY_QUIET.markedBand * 0.9;
    for (const c of u.covers) {
      if (c && c.burned !== true) this._burnCover(state, c, 'blacklist');
    }
    if (this._paidOnce(u, `blacklist:${u.blackouts}`)) {
      this._rep(state, UNDERSTORY_QUIET.blacklistRep, 'understory_blacklisted');
    }
    this.bus.emit('understory:blacklisted', {
      blackouts: u.blackouts, until: u.blackoutUntil, cause: cause || null, tick: state.tick,
    });
    this._log(state, NOTICE_BARKS.blacklisted);
    this.bus.emit('toast', {
      text: 'BLACKLISTED — the quiet will not know you for a while', kind: 'error', ttl: 6,
    });
  },

  /** Decay the watch. A live cover cools it faster; the top tier cools it fastest. */
  _tickNotice(state, dt) {
    const u = ensureUnderstoryState(state);
    const before = num(u.notice);
    if (!(before > 0)) return;
    let decay = UNDERSTORY_QUIET.noticeDecayPerS * dt;
    if (this._activeCoverRec(u)) decay += UNDERSTORY_QUIET.coverDecayBonus * dt;
    // Recompute from the favor count — the stored u.tier only moves inside _favor,
    // so a favor tally raised by any other path would cool at the wrong rate.
    if (understoryAccessTierFor(u.favors).tier >= UNDERSTORY_QUIET.topTier) decay *= 1.5;
    const after = clamp01(before - decay);
    u.notice = after;
    const bBefore = understoryNoticeBand(before), bAfter = understoryNoticeBand(after);
    if (bAfter !== bBefore) {
      this.bus.emit('understory:noticeChanged', {
        notice: after, band: bAfter, prevBand: bBefore, cause: 'decay', tick: state.tick,
      });
    }
  },

  // ── Cover identities: names are spent ───────────────────────────────────────

  _activeCoverRec(u) {
    for (let i = u.covers.length - 1; i >= 0; i--) {
      const c = u.covers[i];
      if (c && c.burned !== true) return c;
    }
    return null;
  },

  /** File a new cover — the record only; the caller announces after payment clears. */
  _pushCoverRecord(state, how) {
    const u = ensureUnderstoryState(state);
    const live = u.covers.reduce((n, c) => n + (c && c.burned !== true ? 1 : 0), 0);
    if (live >= UNDERSTORY_QUIET.coverMax) return null;
    const rec = {
      id: `cover:${u.seq++}`, name: coverNameFor(u.seq, u.covers.length),
      integrity: UNDERSTORY_QUIET.coverPool, acquiredAt: num(state.simTime),
      how: how === 'bought' ? 'bought' : 'earned', burned: false, burnedAt: null,
    };
    u.covers.push(rec);
    trimCoverLog(u);
    return rec;
  },

  _announceCover(state, rec) {
    this.bus.emit('understory:coverIssued', {
      coverId: rec.id, name: rec.name, how: rec.how, tick: state.tick,
    });
    this.bus.emit('toast', { text: `NEW NAME — ${rec.name.toUpperCase()}`, kind: 'good', ttl: 4 });
    this._log(state, this._pickLine(NOTICE_BARKS.coverNew, rec.id));
  },

  _burnCover(state, cover, cause) {
    if (!cover || cover.burned === true) return;
    cover.burned = true;
    cover.burnedAt = num(state.simTime);
    this.bus.emit('understory:coverBurned', {
      coverId: cover.id, name: cover.name, cause: cause || null, tick: state.tick,
    });
    this._log(state, `${cover.name} is ash. ${NOTICE_BARKS.coverBurned}`);
  },

  /** understory:buyCover — a bought name rides the exact-payment wire. */
  _onBuyCover() {
    const state = this.state;
    if (!state) return;
    const u = ensureUnderstoryState(state);
    // During a blackout the quiet does not deal at all — no name gets sold to a
    // name it refuses to know.
    if (num(state.simTime) < num(u.blackoutUntil)) {
      this.bus.emit('toast', {
        text: 'The quiet will not know you for a while', kind: 'warn', ttl: 4,
      });
      return;
    }
    const live = u.covers.reduce((n, c) => n + (c && c.burned !== true ? 1 : 0), 0);
    if (live >= UNDERSTORY_QUIET.coverMax) {
      this.bus.emit('toast', {
        text: 'The quiet will not carry another of your names', kind: 'warn', ttl: 4,
      });
      return;
    }
    const price = Math.max(UNDERSTORY_QUIET.coverFloorCr,
      Math.round(UNDERSTORY_QUIET.coverPriceCr * (2 - understoryAccess(state).payMult)));
    // Mirrored normalizeCredits read — the exact-payment wire compares against it verbatim.
    const credits = Math.max(0, Math.min(Number.MAX_SAFE_INTEGER,
      Math.round(num(state.player && state.player.credits))));
    if (!(credits >= price)) {
      this.bus.emit('toast', { text: 'Not enough credits for a name', kind: 'warn', ttl: 3 });
      return;
    }
    let issued = null;
    const charge = {
      amount: price, reason: 'understory_cover', requireFull: true,
      expectedCredits: credits,
      commit: () => { issued = this._pushCoverRecord(state, 'bought'); return issued != null; },
    };
    this.bus.emit('economy:chargeCredits', charge);
    if (charge.result === true && issued) {
      this._announceCover(state, issued);
    } else if (charge.result !== true) {
      this.bus.emit('toast', { text: 'The quiet desk does not deal at this hour', kind: 'warn', ttl: 3 });
    }
  },

  /** understory:payDebt — the toll settles whole, over the wire, or not at all. */
  _onPayDebt() {
    const state = this.state;
    if (!state) return;
    const u = ensureUnderstoryState(state);
    const debt = intOr(u.debtCr);
    if (debt <= 0) {
      this.bus.emit('toast', { text: 'You owe the quiet nothing', kind: 'info', ttl: 3 });
      return;
    }
    const credits = Math.max(0, Math.min(Number.MAX_SAFE_INTEGER,
      Math.round(num(state.player && state.player.credits))));
    if (credits < debt) {
      this.bus.emit('toast', {
        text: `The toll is ${debt} cr — paid whole or not at all`, kind: 'warn', ttl: 4,
      });
      return;
    }
    const charge = {
      amount: debt, reason: 'understory_debt_toll', requireFull: true,
      expectedCredits: credits,
      commit: () => { u.debtCr = 0; return true; },
    };
    this.bus.emit('economy:chargeCredits', charge);
    if (charge.result === true) {
      // The skim path reports every toll movement — the whole settle must too, or
      // a listener tracking the running tab never sees it close.
      this.bus.emit('understory:debtChanged', {
        debtCr: 0, delta: -debt, cause: 'settled', tick: state.tick,
      });
      this._announceDebtSquared(state);
      this.bus.emit('toast', { text: 'TOLL PAID — the network forgets', kind: 'good', ttl: 4 });
    } else if (charge.result !== true) {
      this.bus.emit('toast', { text: 'The quiet desk does not deal at this hour', kind: 'warn', ttl: 3 });
    }
  },

  /** Drop the oldest closed rows past the keep count — bounded ledger discipline. */
  _gcClosed(rows, keepClosed) {
    let closed = 0;
    for (const r of rows) if (r && r.state !== 'open') closed++;
    let excess = closed - keepClosed;
    if (excess <= 0) return;
    for (let i = 0; i < rows.length && excess > 0; i++) {
      const r = rows[i];
      if (r && r.state !== 'open') { rows.splice(i, 1); i--; excess--; }
    }
  },

  update(dt, state) {
    const u = ensureUnderstoryState(state);
    const gardens = gardenEntities(state);
    for (const e of gardens) {
      // A reef without a gardenId has no ledger identity — skip it rather than
      // merge its biomass into a shared 'undefined' record.
      if (!e.data.gardenId) continue;
      const rec = isObj(u.gardens[e.data.gardenId]) ? u.gardens[e.data.gardenId]
        : (u.gardens[e.data.gardenId] = {
          sectorId: e.data.sectorId || state.world?.currentSectorId || null,
          stage: e.data.gardenStage | 0, biomass: Number(e.data.gardenBiomass) || 0,
          x: e.pos.x, z: e.pos.z, fedByPlayer: 0, fedMass: 0, seededAt: state.simTime,
        });
      normalizeGardenRec(state, e.data.gardenId, rec);
      rec.x = e.pos.x; rec.z = e.pos.z;
      if (!rec.sectorId) rec.sectorId = e.data.sectorId || state.world?.currentSectorId || null;
      this._digest(e, rec);
      const { grew, stage } = syncGardenStage(state, e, rec);
      if (grew) {
        this.bus.emit('understory:gardenStage', {
          gardenId: e.data.gardenId, entityId: e.id, stage: stage.stage, stageId: stage.id,
          tick: state.tick,
        });
        this.bus.emit('comms:log', { text: pickBark(state, UNDERSTORY_BARKS.stageUp), speaker: 'The Understory' });
      }
    }
    this._tendGardeners();
    this._sporeHead();
    this._syncTidePushback();
    // The quiet ledger ticks after the reefs answer: drops spawn and lapse, the wire
    // posts and sours, informants settle their tabs, and the watch cools or escalates.
    this._tickDrops(state, u, gardens);
    this._tickWhispers(state, u, gardens);
    this._tickInformants(state, u, gardens);
    this._tickNotice(state, dt);
  },
};

export default understoryGardens;
