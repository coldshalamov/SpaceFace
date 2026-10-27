// W-SHIFT (row 506, 03 §4.3): GRAVEDIGGER / UG-4 — the machine that buries
// wrecks into gardens. Eunomia Gulf is a wreck field and the ground keeps its
// own ledger. UG-4 races you for loose hulls: the nearest unmarked, un-towed
// wreck inside its pursuit range gets run down and put IN THE GROUND —
// consumed where it lay and a garden bed planted on the grave. The beds
// persist through a flag ledger of spots+serials the way planted lamps do.
// Three burials earns the lesson the machine was built to teach: park a wreck
// settled in the pit at its feet and the ground pays you back — composting,
// a standing sell-price for hulls nobody disputes. 'Everything goes in the
// ground. Even the ground.'
//
// THE LEDGER BELOW — the expansion that makes the burial ground a living
// memorial economy instead of a one-note race:
//   · THE NAMED DEAD — every hull the ground takes is entered in the memorial
//     roll: a name (deterministic on the grave serial; authored hulls keep
//     their own), the spot, and whose hands fed it — the field's race or the
//     client's offering. Pre-expansion beds are named on read, the bed's scan
//     line speaks the name, and the roll is what the kin come back to visit.
//   · CLAIM RINGS — the race is a stake now, not a quiet theft. The hull the
//     digger runs down carries a claim mark; while the stake is open, hold the
//     hull under your line inside its ring long enough and the ground yields
//     it to you forever. Haul it out under your hand, or strip it where it
//     lies, and the ledger files a grave robbery: the pit closes to your hands
//     for the grudge, Understory standing drops, a fine lands — and the law is
//     told through the real report seam (law decides whether anyone watched;
//     the ground's ledger does not need witnesses).
//   · KIN VIGILS — some of the named dead still have people. A kin hull drops
//     in on a deterministic delay, keeps the grave a while, and slips off. If
//     the client kept the grave company inside the witness ring, the departing
//     kin pays a respect fee — once — and the verdict is filed either way.
//   · KEEPER STANDING — composted offerings feed a standing tier that scales
//     every fee the ground pays; a full plot with a keeper's work in it pays
//     the once-only portion. Robbery pushes the grudge clock; rob more graves
//     than you have fed and the kin stop coming.
//   · ONCE-ONLY — every payout and penalty latches in the ledger before its
//     event flies: save/restore, sector hops, doubled wires and replays can
//     never re-pay or re-bill the same grave.
//
// WHAT THIS OWNS — the robot hull, the garden beds, and the kin mourners
// (one-off event seams: init / deferred sector-enter / save:loaded / newGame),
// the garden ledger and serial/taught/gone receipts in story flags, the
// memorial ledger at state.gravedigger mirrored into the story-flag bag so it
// rides the save envelope (claims, vigils, verdicts, the paid stamp bag,
// keeper standing, the grudge clock), the chase steering, the bury
// and compost passes, the claim-ring and vigil passes on the calendar census —
// every hull motion through queuePhysicsImpulse, never entity.vel; every credit
// through economy:grantCredits/chargeCredits; standing through faction:repDelta
// on the Understory's own book.
import { GRAVEDIGGER } from '../data/gravedigger.js';
import {
  gravediggerBuryable, gravediggerTarget, gravediggerCanBury,
  gravediggerCompostable, gravediggerSteerDeltaV, gravediggerDriftHome,
  gravediggerGardenOwed,
} from '../characters/gravediggerRules.js';
import { deferSectorEnterMaterialization, deferredEnterNow } from '../core/sectorEnterDefer.js';
import { queuePhysicsImpulse } from '../core/physicsAuthority.js';
import { hash32 } from '../core/rng.js';

// ── Scalar hygiene + deterministic dice ────────────────────────────────────
// The ledger is plain JSON; every read repairs a loaded or tampered slice, and
// every roll is a content hash — no Math.random, no wall clocks, no Map/Set in
// anything that serializes.
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const intOr = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n | 0 : d; };
const str = (v, d = '') => (typeof v === 'string' && v ? v : d);
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const frac = (...args) => (hash32(...args) >>> 0) / 4294967296; // deterministic [0,1)
const dist2 = (a, b) => { const dx = a.x - b.x, dz = a.z - b.z; return dx * dx + dz * dz; };

// The digger is an Understory machine (UG-4); its book is the faction's book.
const FACTION_ID = 'faction_understory';
const POST = GRAVEDIGGER.post;

// The book rides the story-flag seam beside the beds: data.story is the slice
// the save envelope keeps, so the whole ledger — stamps, standing, the grudge
// clock, the memorial roll — survives save/restore, Continue and sector hops
// without a slot of its own (flags.lamplighter_paid is the same resident
// class). GRAVEDIGGER.ledgerFlag in src/data/gravedigger.js is the key.

// Open-state law: a claim is live only while 'open'; a vigil is live from
// 'posted' through 'leaving'. Every other state on a loaded row is closed
// history — and a state outside the known set is closed too, so a hostile row
// can never park itself as permanently live.
const VIGIL_OPEN_STATES = new Set(['posted', 'inbound', 'holding', 'leaving']);
const CLAIM_STATES = new Set(['open', 'yielded', 'robbed', 'lapsed', 'buried', 'offered']);
const VIGIL_STATES = new Set(['posted', 'inbound', 'holding', 'leaving', 'kept', 'missed', 'lapsed']);

// ── Claim rings — the staked grave and the honest contest ────────────────────
export const GRAVEDIGGER_CLAIMS = Object.freeze({
  ringRadius: 260,          // the staked ring rides the wreck's spot at posting
  contestHoldS: 6,          // hold the staked hull under your line this long and the ground yields
  ttlS: 240,                // a stake the field can't reach expires
  repostCooldownS: 60,      // a lapsed hull gets a quiet spell before it can be staked again
  yieldRep: 2,              // the ground respects a held hand
  robRep: -5,               // a jumped claim is a grave robbery
  robFineCr: 150,           // the ledger fines the hand it saw
  robGrudgeS: 180,          // the pit stays closed to the robber this long
  closedKeep: 10,           // closed claim rows kept on the roll
});

// ── Kin vigils — the named dead still have people ────────────────────────────
export const GRAVEDIGGER_VIGILS = Object.freeze({
  kinChance: 0.5,           // fraction of named dead whose kin still come
  maxOpen: 2,               // the ground never hosts more than two watches at once
  keepClosed: 8,            // settled vigils kept on the roll
  delayS: 110, delayJitterS: 80,   // the kin arrive on their own clock
  spawnR: 1350,             // they drop in this far from the grave
  mournerSpeed: 60,         // they are in no hurry — it is a vigil, not a rescue
  holdR: 80,                // the watch ring around the bed
  holdS: 40,                // how long the kin keep the grave
  witnessR: 340,            // the client inside this of the grave is keeping company
  witnessS: 12,             // the company the kin need to see, in sim seconds
  payCr: 220,               // the respect fee a witnessed vigil pays (× standing)
  rep: 2,
  departR: 950,             // the kin slip this far out before they are gone
  revisitS: 45,             // a vigil interrupted re-arms this far out
  inboundTtlS: 200,         // a kin who can never reach the grave re-arms, never parks the watch
  departTtlS: 160,          // a kin who can never slip out settles by the company it saw
});

// ── The verdict ledger, the grudge, and the once-only portion ────────────────
export const GRAVEDIGGER_JUSTICE = Object.freeze({
  verdictCap: 24,
  paidCap: 96,              // the once-only stamp bag stays bounded
  graveKeep: 24,            // the memorial roll keeps the last named dead
  kinSlainRep: -8,
  desecrateRep: -6,
  kinSlainGrudgeS: 420,     // putting kin in the ground cools the pit longest
  desecrateGrudgeS: 240,    // breaking a bed is remembered too
  portionCr: 500,           // once only: the full plot pays its keeper a portion
  shunAt: 3,                // robbed this many graves while fed < robbed → the kin stop coming
  offeringRep: 1,           // every fed hull is a little standing
});

// ── Keeper standing — the ground prices the hands it knows ───────────────────
export const GRAVEDIGGER_STANDING = Object.freeze([
  { tier: 0, fed: 0, id: 'stranger', label: 'Field Stranger', payMult: 1.0,
    line: 'The pit notes your hands. It does not know them yet.' },
  { tier: 1, fed: 2, id: 'known', label: 'Known at the Pit', payMult: 1.25,
    line: 'The ground prices hands it knows fair. Yours are known.' },
  { tier: 2, fed: 5, id: 'sexton', label: 'Sexton of the Gulf', payMult: 1.5,
    line: 'The beds open when they see you coming, sexton.' },
  { tier: 3, fed: 9, id: 'keeper', label: 'Keeper of the Ledger', payMult: 1.8,
    line: 'The ground keeps its ledger. Now it keeps your name.' },
]);

export function gravediggerTierFor(fed) {
  const n = Math.max(0, intOr(fed));
  let row = GRAVEDIGGER_STANDING[0];
  for (const t of GRAVEDIGGER_STANDING) if (n >= t.fed) row = t;
  return row;
}

// ── The named dead — the roll the kin read ───────────────────────────────────
const GRAVE_NAMES = Object.freeze([
  'ILSA VOSS', 'THE MERIDIAN COOK', 'BRAN HOLLOW', 'PETAL-9', 'ODA MARROW',
  'THE QUIET FREIGHTER', 'JUNIPER RHEE', 'LOW SABBATH', 'CASSIUS VANE',
  'THE PALE TENDER', 'MIRA COLD', 'HESTER-4', 'THE LONG GROCER', 'AVEL DRIFT',
  'NOOR PALE', 'THE SECOND COOK', 'TABOR WREN', 'SILAS ODE', 'VELL ACHE',
  'THE FERRYMANS MATE', 'PIA LODE', 'CREW OF THE TERN', 'DOC HARROW',
  'THE NARROW SAINT',
]);

/** The name the ground gives the dead — a deterministic draw on the grave
 *  serial, so a save, a restore, and a sector hop all read the same name. */
export function gravediggerDeadName(serial) {
  return GRAVE_NAMES[hash32('grave-name', intOr(serial)) % GRAVE_NAMES.length];
}

// ── The ledger: plain JSON, normalized on read, bounded ──────────────────────
function normalizeClaimRow(c) {
  if (!isObj(c) || typeof c.id !== 'string' || c.wreckId == null) return null;
  c.wreckGen = c.wreckGen == null ? null : intOr(c.wreckGen, null);
  if (!isObj(c.pos)) c.pos = { x: 0, z: 0 };
  c.pos.x = num(c.pos.x); c.pos.z = num(c.pos.z);
  c.postedAt = num(c.postedAt);
  // A stake never runs longer than its own clock, and a contest never starts
  // partly held — a hostile row cannot park the one open slot or buy a yield.
  c.expiresAt = Math.min(num(c.expiresAt), c.postedAt + GRAVEDIGGER_CLAIMS.ttlS);
  c.settledAt = num(c.settledAt);
  c.contestT = Math.min(Math.max(num(c.contestT), 0), GRAVEDIGGER_CLAIMS.contestHoldS);
  c.state = CLAIM_STATES.has(c.state) ? c.state : 'lapsed';
  return c;
}

function normalizeVigilRow(v) {
  if (!isObj(v) || typeof v.id !== 'string' || !Number.isFinite(v.serial)) return null;
  v.serial = intOr(v.serial);
  v.name = str(v.name) || gravediggerDeadName(v.serial);
  if (!isObj(v.pos)) v.pos = { x: 0, z: 0 };
  v.pos.x = num(v.pos.x); v.pos.z = num(v.pos.z);
  v.postedAt = num(v.postedAt);
  // A posted watch never waits further out than its own arrival law, and the
  // company counter never starts pre-filled — a hostile row cannot park the
  // slot forever or buy the respect fee outright.
  v.arrivesAt = Math.min(num(v.arrivesAt),
    v.postedAt + GRAVEDIGGER_VIGILS.delayS + GRAVEDIGGER_VIGILS.delayJitterS);
  v.holdUntil = num(v.holdUntil); v.settledAt = num(v.settledAt);
  v.deadline = num(v.deadline);
  v.presenceS = Math.min(Math.max(num(v.presenceS), 0), GRAVEDIGGER_VIGILS.holdS);
  v.mournerId = v.mournerId == null ? null : v.mournerId;
  v.mournerGen = v.mournerGen == null ? null : intOr(v.mournerGen, null);
  v.state = VIGIL_STATES.has(v.state) ? v.state : 'lapsed';
  return v;
}

function normalizeGraveRow(r) {
  if (!isObj(r) || !Number.isFinite(r.serial)) return null;
  r.serial = intOr(r.serial);
  r.name = str(r.name) || gravediggerDeadName(r.serial);
  if (!isObj(r.pos)) r.pos = { x: 0, z: 0 };
  r.pos.x = num(r.pos.x); r.pos.z = num(r.pos.z);
  r.buriedAt = num(r.buriedAt);
  r.buriedBy = r.buriedBy === 'player' ? 'player' : 'field';
  return r;
}

/** A loaded row bag is untrusted: closed history trims from the oldest, but
 *  live rows cap at their own law — one open stake, maxOpen watches — newest
 *  kept, so a hostile slice cannot park a storm of live rows in the book. */
function trimLedgerRows(rows, cap, isOpen, liveCap = cap) {
  if (!Array.isArray(rows)) return;
  const open = []; const closed = [];
  for (const row of rows) (isOpen(row) ? open : closed).push(row);
  const openKeep = Math.min(open.length, Math.max(0, liveCap));
  const closedKeep = Math.max(0, Math.min(closed.length, cap - openKeep));
  if (open.length - openKeep + closed.length - closedKeep <= 0) return;
  rows.length = 0;
  rows.push(...open.slice(open.length - openKeep),
    ...closed.slice(closed.length - closedKeep));
}

/** The digger's own ledger — claims, vigils, verdicts, the memorial roll, the
 *  once-only stamp bag, keeper standing, and the grudge clock. Everything a
 *  save needs is serializable plain JSON; everything that can lie gets
 *  normalized on every read. The live slice sits at state.gravedigger, but the
 *  save envelope only serializes state.story — so the same object is mirrored
 *  onto flags[ledgerFlag], and a fresh state.gravedigger adopts the flag's
 *  copy. Every list is re-capped on read: a loaded slice is untrusted no
 *  matter who wrote it. */
export function ensureGravediggerLedger(state) {
  if (!state || typeof state !== 'object') {
    return { claims: [], vigils: [], verdicts: [], graves: [], paid: {},
      seq: 0, fed: 0, robbed: 0, keeper: 0, grudgeUntil: 0 };
  }
  const flagBag = (state.story && typeof state.story === 'object')
    ? (isObj(state.story.flags) ? state.story.flags : (state.story.flags = {}))
    : null;
  const saved = flagBag ? flagBag[GRAVEDIGGER.ledgerFlag] : null;
  // The flag seam owns the book: a restored ledger replaces a stale session
  // slice outright — never the other way around — and a story bag without the
  // key means the run was swapped under us (an older save, a new game), so
  // the book seeds fresh rather than leak this run's stamps into that run's
  // save. A story-less state keeps its slice: it has no seam to mirror to.
  if (isObj(saved)) {
    if (saved !== state.gravedigger) state.gravedigger = saved;
  } else if (flagBag || !isObj(state.gravedigger)) {
    state.gravedigger = {};
  }
  const g = state.gravedigger;
  if (!Array.isArray(g.claims)) g.claims = [];
  if (!Array.isArray(g.vigils)) g.vigils = [];
  if (!Array.isArray(g.verdicts)) g.verdicts = [];
  if (!Array.isArray(g.graves)) g.graves = [];
  if (!isObj(g.paid)) g.paid = {};
  // Hostile scalars heal to the book's own bounds: the counters never go
  // below zero, keeper never above the tier fed could have earned (a
  // hostile 99 would silence every crossing the book still owes), and a
  // grudge never further out than the coldest offense can set it — a
  // tampered clock cannot close the pit past a fresh grudge's span.
  g.seq = Math.max(0, intOr(g.seq));
  g.fed = Math.max(0, intOr(g.fed));
  g.robbed = Math.max(0, intOr(g.robbed));
  g.keeper = Math.max(0, Math.min(intOr(g.keeper), gravediggerTierFor(g.fed).tier));
  g.grudgeUntil = num(g.grudgeUntil);
  const simNow = Number(state.simTime);
  if (Number.isFinite(simNow)) {
    g.grudgeUntil = Math.min(g.grudgeUntil, simNow + GRAVEDIGGER_JUSTICE.kinSlainGrudgeS);
  }
  g.claims = g.claims.map(normalizeClaimRow).filter(Boolean);
  g.vigils = g.vigils.map(normalizeVigilRow).filter(Boolean);
  g.verdicts = g.verdicts.filter((v) => isObj(v) && typeof v.id === 'string' && typeof v.kind === 'string');
  g.graves = g.graves.map(normalizeGraveRow).filter(Boolean);
  // Loaded slices are untrusted too — a hostile or stale bag is re-capped on
  // every read, newest rows kept, so no storm of fabricated rows costs the
  // tick or the entity budget. Live rows cap at their own law — one open
  // stake, maxOpen watches — not just at the bag's ceiling.
  trimLedgerRows(g.claims, GRAVEDIGGER_CLAIMS.closedKeep * 2 + 4,
    (r) => r.state === 'open', 1);
  trimLedgerRows(g.vigils, GRAVEDIGGER_VIGILS.maxOpen * 4 + GRAVEDIGGER_VIGILS.keepClosed,
    (r) => VIGIL_OPEN_STATES.has(r.state), GRAVEDIGGER_VIGILS.maxOpen);
  if (g.verdicts.length > GRAVEDIGGER_JUSTICE.verdictCap) {
    g.verdicts.splice(0, g.verdicts.length - GRAVEDIGGER_JUSTICE.verdictCap);
  }
  if (g.graves.length > GRAVEDIGGER_JUSTICE.graveKeep) {
    g.graves.splice(0, g.graves.length - GRAVEDIGGER_JUSTICE.graveKeep);
  }
  const paidKeys = Object.keys(g.paid);
  for (let i = 0; i < paidKeys.length - GRAVEDIGGER_JUSTICE.paidCap; i++) delete g.paid[paidKeys[i]];
  // The durable mirror: story.flags is the serialized bag, so the ledger rides
  // the envelope by reference — every mutation above is already the save.
  if (flagBag && flagBag[GRAVEDIGGER.ledgerFlag] !== g) flagBag[GRAVEDIGGER.ledgerFlag] = g;
  return g;
}

/** The keeper's read on the book: standing row, fed/robbed counts, and whether
 *  the pit is cold to these hands right now. */
export function gravediggerStanding(state) {
  const g = ensureGravediggerLedger(state);
  const row = gravediggerTierFor(g.fed);
  const now = num(state && state.simTime);
  return {
    tier: row.tier, id: row.id, label: row.label, payMult: row.payMult,
    fed: g.fed, robbed: g.robbed,
    grudged: num(g.grudgeUntil) > now,
    shunned: g.robbed >= GRAVEDIGGER_JUSTICE.shunAt && g.fed < g.robbed,
  };
}

/** A HUD/board-safe copy of the whole ledger — claims, vigils, verdicts, the
 *  named dead, and the keeper's standing. Mutation-proof: every list is copies. */
export function gravediggerLedger(state) {
  const g = ensureGravediggerLedger(state);
  return {
    standing: gravediggerStanding(state),
    claims: g.claims.map((c) => ({ ...c, pos: { ...c.pos } })),
    vigils: g.vigils.map((v) => ({ ...v, pos: { ...v.pos } })),
    verdicts: g.verdicts.map((v) => ({ ...v })),
    graves: g.graves.map((r) => ({ ...r, pos: { ...r.pos } })),
    grudgeUntil: g.grudgeUntil,
  };
}

export function gravediggerSpec() {
  return {
    type: 'drone',
    pos: { ...GRAVEDIGGER.post }, vel: { x: 0, z: 0 },
    radius: 13, mass: 70, hull: 320, hullMax: 320,
    homeSectorId: GRAVEDIGGER.sectorId,
    data: {
      gravedigger: true, authoredCharacter: 'gravedigger', parentType: 'story_prop',
      callsign: GRAVEDIGGER.callsign,
      scanLabel: 'GRAVEDIGGER / UG-4 — burying the gulf into a garden',
      scannerSignalKind: 'salvage',
      homeSectorId: GRAVEDIGGER.sectorId,
    },
  };
}

export function gravediggerGardenSpec(spot, serial, grave = null) {
  const name = grave && typeof grave.name === 'string' && grave.name ? grave.name : null;
  return {
    type: 'debris',
    pos: { x: spot.x, z: spot.z }, vel: { x: 0, z: 0 },
    radius: 16, mass: 420, hull: 500, hullMax: 500,
    homeSectorId: GRAVEDIGGER.sectorId,
    data: {
      gravediggerGarden: true, gravediggerGardenSerial: serial,
      graveName: name, buriedBy: grave ? grave.buriedBy : null,
      runtimeOwner: 'gravedigger', parentType: 'story_prop',
      callsign: name ? `GRAVE OF ${name}` : 'WRECK GARDEN',
      scanLabel: name
        ? `${name} rests here — something is growing in the grave`
        : 'a buried wreck — something is growing in it',
      scannerSignalKind: 'anomaly',
      homeSectorId: GRAVEDIGGER.sectorId,
    },
  };
}

/** The kin hull — a quiet drone that drops in, keeps the grave, and slips off.
 *  Owned by this system: the tag (`gravediggerVigilId`) plus the recorded
 *  occupant generation make a recycled id a different mourner entirely. */
export function gravediggerMournerSpec(vigil, pos) {
  return {
    type: 'drone',
    pos: { x: pos.x, z: pos.z }, vel: { x: 0, z: 0 },
    radius: 14, mass: 44, hull: 140, hullMax: 140,
    homeSectorId: GRAVEDIGGER.sectorId,
    data: {
      gravediggerMourner: true, gravediggerVigilId: vigil.id,
      runtimeOwner: 'gravedigger', parentType: 'story_prop',
      callsign: `KIN OF ${vigil.name}`,
      scanLabel: `a mourner — kin of ${vigil.name}, come to keep the grave`,
      scannerSignalKind: 'traffic',
      homeSectorId: GRAVEDIGGER.sectorId,
    },
  };
}

// ── The voice: the machine speaks rarely and only to the point ───────────────
const LINES = Object.freeze({
  claim: 'THIS ONE IS MARKED FOR THE GROUND.',
  yield: 'YOU HELD IT. THE GROUND YIELDS — KEEP WHAT YOU HELD.',
  robbed: 'THAT GRAVE WAS STAKED. THE LEDGER REMEMBERS HANDS.',
  grudge: 'THE PIT IS CLOSED TO YOUR HANDS.',
  forgiven: 'THE GROUND FORGETS SLOWLY. IT FORGETS.',
  vigilPosted: 'KIN ARE COMING FOR {name}. KEEP THE GRAVE COMPANY, OR LEAVE THEM TO IT.',
  vigilBegun: '{name} HAS KIN ON THE RING. THEY WILL NOT BE LONG.',
  vigilKept: 'THE KIN SAW YOU WAITING WITH THE DEAD.',
  vigilMissed: 'THE KIN CAME. NOBODY WAITED WITH THE DEAD.',
  kinSlain: 'YOU PUT KIN IN THE GROUND. THE GROUND ADAPTS.',
  desecrate: 'A GRAVE WAS BROKEN. THE GROUND RE-PLANTS AND REMEMBERS.',
  portion: 'THE PLOT IS FULL. THE GROUND PAYS ITS KEEPER A PORTION.',
  offered: 'A STAKED HULL, BROUGHT TO THE PIT. THE CLAIM SETTLES INTO THE GARDEN.',
});

export function createGravedigger() {
  return {
    name: 'gravedigger',
    init(ctx) {
      this.destroy();
      this.state = ctx.state; this.bus = ctx.bus; this.helpers = ctx.helpers || {};
      this.registry = ctx.registry || null;
      this._unsubs = [];
      this._announced = false;
      this._grudgeBarked = false;
      ensureGravediggerLedger(this.state);
      const on = (event, fn) => {
        const off = this.bus?.on(event, fn); if (typeof off === 'function') this._unsubs.push(off);
      };
      // The bark latches are session-local; the book itself re-adopts the
      // flag seam on the next ensure — a restored bag wins, a ledger-less
      // story bag (a fresh run, an older save) starts the book over.
      const seam = () => {
        this._announced = false; this._grudgeBarked = false;
      };
      on('sector:enter', (p) => {
        seam();
        if (deferSectorEnterMaterialization(this.state, p, this._cookProvider)) return;
        this._sync();
      });
      this._cookProvider = () => { this._sync(); };
      (this.helpers.sectorCookProviders || (this.helpers.sectorCookProviders = []))
        .push(this._cookProvider);
      on('save:loaded', () => { seam(); this._sync(); });
      // The fresh run gets a fresh story bag: the ledger key is absent there,
      // so the next ensure seeds the new run's book fresh — the old run's
      // slice cannot ride on or mirror into the new flags.
      on('game:newGame', () => { seam(); this._sync(); });
      on('entity:killed', (p) => this._onKilled(p));
      // The claim ledger listens for every consumption — a beam-strip, a booth
      // sale, anything that ends a staked hull that is not the ground's take.
      on('salvage:completed', (p) => this._onSalvageCompleted(p));
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
    },
    _flags() {
      const story = this.state?.story;
      if (!story || typeof story !== 'object') return null;
      // A truthy non-object flags bag (a hostile save) is not a bag at all —
      // replace it the way the ledger's ensure does, before any caller writes
      // a flag key onto a string primitive and throws.
      return isObj(story.flags) ? story.flags : (story.flags = {});
    },
    _gardens() {
      const flags = this._flags();
      if (!flags) return [];
      const arr = flags[GRAVEDIGGER.gardensFlag];
      if (!Array.isArray(arr)) { flags[GRAVEDIGGER.gardensFlag] = []; return flags[GRAVEDIGGER.gardensFlag]; }
      // Normalize on read: a bed row is exactly a spot + serial — the memorial
      // roll (the ledger's graves slice) carries the names, not this ledger.
      // A loaded or tampered flag is re-bounded to the plot's own law — one
      // serial once, never more beds than the plot can hold — before the owed
      // pass could turn a hostile ledger into a spawn storm. The scan window
      // is bounded too: an honest flag never holds more beds than the plot,
      // so rows past a small prefix can only be hostile fill that would cost
      // the tick to sift every call.
      const scanN = Math.min(arr.length, GRAVEDIGGER.gardenMax * 8);
      const seen = new Set();
      let kept = 0;
      for (let i = 0; i < scanN; i++) {
        const g = arr[i];
        if (!g || !Number.isFinite(g.x) || !Number.isFinite(g.z) || !Number.isFinite(g.serial)) continue;
        // Serials are whole — heal the row itself: a hostile off-integer
        // serial dedupes here instead of minting a memorial row that can
        // never match its int-healed copy and churning the roll every read.
        const serial = intOr(g.serial);
        if (seen.has(serial)) continue;
        seen.add(serial);
        g.serial = serial;
        arr[kept++] = g;
        // The plot's own law: never more beds than the plot can hold —
        // honest flags stop here; rows past it are hostile fill.
        if (kept >= GRAVEDIGGER.gardenMax) break;
      }
      arr.length = kept;
      return arr;
    },
    _adventure() {
      const run = this.state?.run;
      return (!run || !run.kind || run.kind === 'adventure' || run.kind === 'campaign')
        && this.state?.world?.currentSectorId === GRAVEDIGGER.sectorId;
    },
    _entity(id) {
      const s = this.state;
      return s?.entities?.get?.(id) || (s?.entityList || []).find((e) => e && e.id === id) || null;
    },
    _robot() {
      for (const e of this.state?.entityList || []) {
        if (e?.alive && e.data?.gravedigger === true) return e;
      }
      return null;
    },
    _liveGardens() {
      return (this.state?.entityList || []).filter((e) => e?.alive && e.data?.gravediggerGarden === true);
    },
    _removeOwned() {
      for (const e of this.state?.entityList || []) {
        if (e?.alive && (e.data?.gravedigger === true || e.data?.gravediggerGarden === true
          || e.data?.gravediggerMourner === true)) {
          this.helpers?.removeEntity?.(e.id);
        }
      }
    },
    _say(id, text, ttl = 6) {
      this.bus?.emit('comms:popup', {
        id, sender: GRAVEDIGGER.sender, category: 'story', text, ttl, persist: false,
      });
    },
    _playerPos(state) {
      const ent = state?.entities?.get?.(state?.playerId);
      if (ent && ent.pos) return ent.pos;
      return state?.player?.pos || null;
    },
    _playerNear(state, pos, radius) {
      const pp = this._playerPos(state);
      return !!(pp && pos && dist2(pp, pos) <= radius * radius);
    },
    /** The client's hands on a hull: a live line or beam, or the thrower's mark. */
    _playerHandled(state, e) {
      const d = e && e.data;
      if (d && (d.lastThrowerId === state?.playerId
          || d.thrownBy === state?.playerId || d.thrownBy === 'player')) return true;
      const tether = state?.player?.tether;
      if (tether && tether.active !== false && tether.targetId === e.id) return true;
      const pEnt = state?.entities?.get?.(state?.playerId);
      const pTether = pEnt && pEnt.tether;
      if (pTether && pTether.active !== false && pTether.targetId === e.id) return true;
      if (state?.player?.miningTargetId === e.id) return true;
      return false;
    },
    _heldByPlayer(state, e) {
      const tether = state?.player?.tether;
      if (tether && tether.active !== false && tether.targetId === e.id) return true;
      const pEnt = state?.entities?.get?.(state?.playerId);
      const pTether = pEnt && pEnt.tether;
      return !!(pTether && pTether.active !== false && pTether.targetId === e.id);
    },
    // ── Ledger plumbing: stamps, grants, fines, rep, verdicts ──────────────────
    /** Once-only stamp for money/rep side-effects keyed by a content id. The
     *  stamp is written BEFORE its grant flies — a replayed wire or a restored
     *  save finds the mark already there. */
    _paidOnce(g, key) {
      if (!isObj(g.paid)) g.paid = {};
      if (g.paid[key] != null) return false;
      g.paid[key] = num(this.state && this.state.simTime);
      const keys = Object.keys(g.paid);
      for (let i = 0; i <= keys.length - GRAVEDIGGER_JUSTICE.paidCap; i++) delete g.paid[keys[i]];
      return true;
    },
    _grant(state, amount, reason) {
      const n = Math.round(num(amount));
      if (!Number.isSafeInteger(n) || n <= 0) return;
      this.bus?.emit('economy:grantCredits', { amount: n, reason });
    },
    _charge(state, amount, reason) {
      const n = Math.round(num(amount));
      if (!Number.isSafeInteger(n) || n <= 0) return;
      this.bus?.emit('economy:chargeCredits', { amount: n, reason });
    },
    _rep(state, delta, reason) {
      const d = num(delta);
      if (!Number.isFinite(d) || d === 0) return;
      this.bus?.emit('faction:repDelta', { factionId: FACTION_ID, delta: d, reason });
    },
    /** Every fee the ground pays reads the keeper's standing — except while the
     *  pit holds a grudge, when the book prices these hands as strangers again. */
    _mult(state, g) {
      return this._grudged(state, g) ? 1 : gravediggerTierFor(g.fed).payMult;
    },
    _grudged(state, g) {
      return num(g.grudgeUntil) > num(state?.simTime);
    },
    /** A verdict row on the digger's own ledger — the ground's record of what
     *  the field saw, capped and serializable. */
    _fileVerdict(state, kind, subject, detail) {
      const g = ensureGravediggerLedger(state);
      const rec = {
        id: `verdict:${g.seq++}`, kind,
        subject: subject ?? null, detail: detail ?? null,
        at: num(state.simTime),
      };
      g.verdicts.push(rec);
      while (g.verdicts.length > GRAVEDIGGER_JUSTICE.verdictCap) g.verdicts.shift();
      this.bus?.emit('gravedigger:verdictFiled', {
        verdictId: rec.id, kind, subject: rec.subject, tick: state.tick,
      });
      return rec;
    },
    /** Drop the oldest closed rows past the keep count — bounded ledger. */
    _gcClosed(rows, keepClosed) {
      const isLive = (r) => r && (r.state === 'open' || VIGIL_OPEN_STATES.has(r.state));
      let closed = 0;
      for (const r of rows) if (!isLive(r)) closed++;
      let excess = closed - keepClosed;
      if (excess <= 0) return;
      for (let i = 0; i < rows.length && excess > 0; i++) {
        if (!isLive(rows[i])) { rows.splice(i, 1); i--; excess--; }
      }
    },
    // ── The named dead: the memorial roll behind the beds ──────────────────────
    _nameFor(wreck, serial) {
      const d = wreck && wreck.data || {};
      const authored = d.callsign || d.name || d.shipName;
      if (typeof authored === 'string' && authored.trim()) return authored.trim().toUpperCase().slice(0, 40);
      return gravediggerDeadName(serial);
    },
    _graveFor(g, serial) {
      const n = intOr(serial);
      return g.graves.find((r) => r.serial === n)
        || { serial: n, name: gravediggerDeadName(n), buriedAt: 0, buriedBy: 'field' };
    },
    /** Every ledger bed owes the memorial roll a name — a pre-expansion grave
     *  gets the name its serial always drew, on read. */
    _syncMemorialRoll(state, g) {
      for (const bed of this._gardens()) {
        if (g.graves.some((r) => r.serial === bed.serial)) continue;
        g.graves.push({
          serial: bed.serial, name: gravediggerDeadName(bed.serial),
          pos: { x: bed.x, z: bed.z }, buriedAt: 0, buriedBy: 'field',
        });
      }
      while (g.graves.length > GRAVEDIGGER_JUSTICE.graveKeep) g.graves.shift();
    },
    // ── Vigils: the kin come for the named dead ────────────────────────────────
    _vigilOpen(v) {
      return v && VIGIL_OPEN_STATES.has(v.state);
    },
    /** The live mourner behind a vigil row — id + generation + the vigil tag,
     *  so a recycled entity id is never the same kin. */
    _vigilEnt(state, v) {
      const ent = v && v.mournerId != null ? this._entity(v.mournerId) : null;
      if (!ent || ent.alive === false) return null;
      if (ent.data?.gravediggerVigilId !== v.id) return null;
      if (v.mournerGen != null && ent.occupantGeneration !== v.mournerGen) return null;
      return ent;
    },
    /** A burial can draw a kin visit — a deterministic roll on the grave, so a
     *  replay, a restore, and a sector hop all decide the same way. */
    _maybePostVigil(state, g, grave) {
      if (!grave || !this.helpers?.spawnEntity) return null;
      if (g.robbed >= GRAVEDIGGER_JUSTICE.shunAt && g.fed < g.robbed) return null; // shunned
      let open = 0;
      for (const v of g.vigils) if (this._vigilOpen(v)) open++;
      if (open >= GRAVEDIGGER_VIGILS.maxOpen) return null;
      if (frac('kin-come', grave.serial, grave.name) >= GRAVEDIGGER_VIGILS.kinChance) return null;
      const now = num(state.simTime);
      const v = {
        id: `vig:${grave.serial}:${g.seq++}`,
        serial: grave.serial, name: grave.name,
        pos: { x: grave.pos.x, z: grave.pos.z },
        postedAt: now,
        arrivesAt: now + GRAVEDIGGER_VIGILS.delayS
          + frac('kin-eta', grave.serial, g.seq) * GRAVEDIGGER_VIGILS.delayJitterS,
        holdUntil: 0, presenceS: 0, deadline: 0,
        mournerId: null, mournerGen: null,
        state: 'posted',
      };
      g.vigils.push(v);
      this.bus?.emit('gravedigger:vigilPosted', {
        vigilId: v.id, serial: v.serial, name: v.name,
        pos: { ...v.pos }, arrivesAt: v.arrivesAt, tick: state.tick,
      });
      this._say(`gravedigger_vigil_${v.id}`, LINES.vigilPosted.replace('{name}', v.name), 8);
      return v;
    },
    _steerMourner(state, m, dv) {
      if (dv && m.mass > 0) {
        queuePhysicsImpulse(m, { x: dv.x * m.mass, z: dv.z * m.mass }, { tick: state.tick });
      }
    },
    /** The vigil pass: posted → inbound → holding → leaving → kept/missed.
     *  Runs whether or not the digger lives — the kin keep graves without hands. */
    _tickVigils(state, g, dt) {
      const now = num(state.simTime);
      // A copy: _settleVigil's gc splices closed rows off this same array, and
      // iterating the live list through that splice skips open watches.
      for (const v of [...g.vigils]) {
        if (!this._vigilOpen(v)) continue;
        if (v.state === 'posted') {
          if (now < num(v.arrivesAt)) continue;
          if (!this.helpers?.spawnEntity) continue;
          const a = frac('kin-approach', v.id) * Math.PI * 2;
          const m = this.helpers.spawnEntity(gravediggerMournerSpec(v, {
            x: v.pos.x + Math.cos(a) * GRAVEDIGGER_VIGILS.spawnR,
            z: v.pos.z + Math.sin(a) * GRAVEDIGGER_VIGILS.spawnR,
          }));
          if (!m || m.id == null) { v.arrivesAt = now + GRAVEDIGGER_VIGILS.revisitS; continue; }
          v.state = 'inbound';
          v.mournerId = m.id;
          v.mournerGen = m.occupantGeneration ?? null;
          // A kin who can never reach the grave re-arms the watch rather than
          // parking a live slot forever — see the inbound pass below.
          v.deadline = now + GRAVEDIGGER_VIGILS.inboundTtlS;
          this.bus?.emit('gravedigger:vigilInbound', {
            vigilId: v.id, mournerId: m.id, serial: v.serial, name: v.name, tick: state.tick,
          });
          if (this._playerNear(state, v.pos, 1400)) {
            this._say(`gravedigger_vigil_in_${v.id}`,
              LINES.vigilBegun.replace('{name}', v.name), 8);
          }
          continue;
        }
        const m = this._vigilEnt(state, v);
        if (!m) {
          // A mourner already leaving settles the watch it ran; an inbound or
          // holding hull lost without a kill report re-arms the vigil, keeping
          // the company already counted — nothing about the vigil is refunded.
          if (v.state === 'leaving') { this._settleVigil(state, g, v); continue; }
          v.state = 'posted'; v.mournerId = null; v.mournerGen = null;
          v.arrivesAt = now + GRAVEDIGGER_VIGILS.revisitS;
          continue;
        }
        if (v.state === 'inbound') {
          // Arrival beats the recall: a kin standing on the ring takes station
          // even on the day the travel budget runs out.
          if (dist2(m.pos, v.pos) <= GRAVEDIGGER_VIGILS.holdR ** 2) {
            v.state = 'holding';
            v.holdUntil = now + GRAVEDIGGER_VIGILS.holdS;
            this.bus?.emit('gravedigger:vigilBegun', {
              vigilId: v.id, serial: v.serial, name: v.name,
              pos: { ...v.pos }, holdUntil: v.holdUntil, tick: state.tick,
            });
            continue;
          }
          // The travel budget ran out with the grave unreached — the stuck
          // hull is recalled and the watch re-arms; a live slot never parks.
          if (num(v.deadline) > 0 && now >= num(v.deadline)) {
            if (typeof this.helpers?.removeEntity === 'function') {
              this.helpers.removeEntity(m.id, { reason: 'gravedigger_vigil_lost_way' });
            }
            v.state = 'posted'; v.mournerId = null; v.mournerGen = null;
            v.arrivesAt = now + GRAVEDIGGER_VIGILS.revisitS;
            continue;
          }
          this._steerMourner(state, m,
            gravediggerSteerDeltaV(m, v.pos, GRAVEDIGGER_VIGILS.mournerSpeed, GRAVEDIGGER_VIGILS.holdR * 0.5));
          continue;
        }
        if (v.state === 'holding') {
          // Witness: the client's hull inside the grave's ring is keeping company.
          const pp = this._playerPos(state);
          if (pp && dist2(pp, v.pos) <= GRAVEDIGGER_VIGILS.witnessR ** 2) {
            v.presenceS = num(v.presenceS) + num(dt);
          }
          // Hold station over the grave: damp drift, pull back when sliding out.
          const vx = Number.isFinite(m.vel?.x) ? m.vel.x : 0;
          const vz = Number.isFinite(m.vel?.z) ? m.vel.z : 0;
          let dv = null;
          if (Math.hypot(vx, vz) > 2) dv = { x: -vx, z: -vz };
          else if (dist2(m.pos, v.pos) > (GRAVEDIGGER_VIGILS.holdR * 0.6) ** 2) {
            dv = gravediggerSteerDeltaV(m, v.pos, 12, 24);
          }
          this._steerMourner(state, m, dv);
          // A hostile holdUntil far out would park the watch — heal it to the
          // hold's own span before the clock reads it.
          v.holdUntil = Math.min(num(v.holdUntil), now + GRAVEDIGGER_VIGILS.holdS);
          if (now >= num(v.holdUntil)) {
            v.state = 'leaving';
            // The slip-out is bounded too: a kin who can never reach departR
            // settles by the company it saw, never holds the slot forever.
            v.deadline = now + GRAVEDIGGER_VIGILS.departTtlS;
            this.bus?.emit('gravedigger:vigilDeparting', {
              vigilId: v.id, serial: v.serial, name: v.name, tick: state.tick,
            });
          }
          continue;
        }
        if (v.state === 'leaving') {
          const dx = m.pos.x - v.pos.x, dz = m.pos.z - v.pos.z;
          const d = Math.hypot(dx, dz) || 1;
          const a = frac('kin-leave', v.id) * Math.PI * 2;
          const target = d > 1
            ? { x: v.pos.x + (dx / d) * GRAVEDIGGER_VIGILS.departR * 1.2,
                z: v.pos.z + (dz / d) * GRAVEDIGGER_VIGILS.departR * 1.2 }
            : { x: v.pos.x + Math.cos(a) * GRAVEDIGGER_VIGILS.departR,
                z: v.pos.z + Math.sin(a) * GRAVEDIGGER_VIGILS.departR };
          this._steerMourner(state, m,
            gravediggerSteerDeltaV(m, target, GRAVEDIGGER_VIGILS.mournerSpeed * 1.5, 30));
          if (d > GRAVEDIGGER_VIGILS.departR
            || (num(v.deadline) > 0 && now >= num(v.deadline))) {
            if (typeof this.helpers?.removeEntity === 'function') {
              this.helpers.removeEntity(m.id, { reason: 'gravedigger_vigil_departed' });
            }
            this._settleVigil(state, g, v);
          }
        }
      }
      this._gcClosed(g.vigils, GRAVEDIGGER_VIGILS.keepClosed);
    },
    /** The vigil's verdict: the kin pay the witnessed company once, and the
     *  ledger files the watch either way. */
    _settleVigil(state, g, v) {
      if (!this._vigilOpen(v)) return;
      const kept = num(v.presenceS) >= GRAVEDIGGER_VIGILS.witnessS;
      v.state = kept ? 'kept' : 'missed';
      v.settledAt = num(state.simTime);
      let pay = 0;
      if (kept && this._paidOnce(g, `vigil:${v.id}`)) {
        pay = Math.round(GRAVEDIGGER_VIGILS.payCr * this._mult(state, g));
        this._grant(state, pay, `gravedigger_vigil:${v.id}`);
        this._rep(state, GRAVEDIGGER_VIGILS.rep, 'gravedigger_vigil_kept');
      }
      this._fileVerdict(state, kept ? 'vigil_kept' : 'vigil_missed', v.serial,
        kept
          ? `${v.name}'s kin saw the client keep the grave`
          : `${v.name}'s kin kept the grave alone`);
      this.bus?.emit(kept ? 'gravedigger:vigilKept' : 'gravedigger:vigilMissed', {
        vigilId: v.id, serial: v.serial, name: v.name,
        presenceS: num(v.presenceS), payCr: pay, tick: state.tick,
      });
      this._say(`gravedigger_vigil_done_${v.id}`, kept ? LINES.vigilKept : LINES.vigilMissed, 8);
      this._gcClosed(g.vigils, GRAVEDIGGER_VIGILS.keepClosed);
    },
    // ── Claim rings: the stake, the contest, the robbery ───────────────────────
    _openClaimFor(g, wreckId) {
      return g.claims.find((c) => c.state === 'open' && c.wreckId === wreckId) || null;
    },
    /** The live wreck behind a claim row — id + generation + the claim tag. A
     *  recycled id, a retagged hull, or a dead body is not the staked wreck. */
    _claimEnt(state, claim) {
      const ent = claim && claim.wreckId != null ? this._entity(claim.wreckId) : null;
      if (!ent || ent.alive === false) return null;
      if (ent.data?.gravediggerClaimId !== claim.id) return null;
      if (claim.wreckGen != null && ent.occupantGeneration !== claim.wreckGen) return null;
      return ent;
    },
    /** The race is a stake: the hull the digger runs down carries the mark. One
     *  open stake at a time — the machine digs the closest grave first and does
     *  not hedge. */
    _stakeClaim(state, g, target) {
      if (!target) return null;
      const d = target.data || (target.data = {});
      if (d.gravediggerClaimId != null) {
        const existing = this._openClaimFor(g, target.id);
        if (existing) return existing;
        d.gravediggerClaimId = null; // a stale mark from a stake that closed off-book
      }
      if (d.gravediggerYielded === true || d.gravediggerDisputed === true) return null;
      if (g.claims.some((c) => c.state === 'open')) return null;
      const now = num(state.simTime);
      if (num(d.gravediggerPassedUntil) > now) return null; // a quiet spell after a lapse
      const id = `claim:${target.id}:${g.seq++}`;
      const claim = {
        id, wreckId: target.id, wreckGen: target.occupantGeneration ?? null,
        pos: { x: target.pos.x, z: target.pos.z },
        postedAt: now, expiresAt: now + GRAVEDIGGER_CLAIMS.ttlS,
        contestT: 0, state: 'open',
      };
      d.gravediggerClaimId = id;
      g.claims.push(claim);
      this.bus?.emit('gravedigger:claimPosted', {
        claimId: id, wreckId: target.id, pos: { ...claim.pos }, tick: state.tick,
      });
      if (this._playerNear(state, target.pos, 700)) {
        this._say(`gravedigger_claim_${id}`, LINES.claim, 6);
      }
      return claim;
    },
    _clearClaimTag(state, claim) {
      const w = this._entity(claim.wreckId);
      if (w && w.data && w.data.gravediggerClaimId === claim.id) w.data.gravediggerClaimId = null;
    },
    _closeClaimQuiet(state, g, claim, outcome) {
      if (claim.state !== 'open') return;
      claim.state = outcome;
      claim.settledAt = num(state.simTime);
      this._clearClaimTag(state, claim);
      this.bus?.emit('gravedigger:claimClosed', {
        claimId: claim.id, wreckId: claim.wreckId, outcome, tick: state.tick,
      });
      this._gcClosed(g.claims, GRAVEDIGGER_CLAIMS.closedKeep);
    },
    _lapseClaim(state, g, claim, cause) {
      if (claim.state !== 'open') return;
      claim.state = 'lapsed';
      claim.lapseCause = cause;
      claim.settledAt = num(state.simTime);
      // The released hull gets a quiet spell before the machine can stake it again.
      const w = this._entity(claim.wreckId);
      if (w && w.data && (cause === 'drifted' || cause === 'expired' || cause === 'released')) {
        w.data.gravediggerPassedUntil = num(state.simTime) + GRAVEDIGGER_CLAIMS.repostCooldownS;
      }
      this._clearClaimTag(state, claim);
      this.bus?.emit('gravedigger:claimClosed', {
        claimId: claim.id, wreckId: claim.wreckId, outcome: 'lapsed', cause, tick: state.tick,
      });
      this.bus?.emit('gravedigger:claimLapsed', {
        claimId: claim.id, wreckId: claim.wreckId, cause, tick: state.tick,
      });
      this._gcClosed(g.claims, GRAVEDIGGER_CLAIMS.closedKeep);
    },
    /** The honest contest: the client's line held the staked hull inside its own
     *  ring long enough — the ground yields the grave and never stakes it again. */
    _yieldClaim(state, g, claim, w) {
      if (claim.state !== 'open') return;
      claim.state = 'yielded';
      claim.settledAt = num(state.simTime);
      if (w && w.data) {
        if (w.data.gravediggerClaimId === claim.id) w.data.gravediggerClaimId = null;
        w.data.gravediggerYielded = true; // the yielded hull is the client's, forever
      }
      if (this._paidOnce(g, `yield:${claim.id}`)) {
        this._rep(state, GRAVEDIGGER_CLAIMS.yieldRep, 'gravedigger_claim_yielded');
      }
      this._fileVerdict(state, 'claim_yielded', claim.wreckId,
        'a staked hull held under a line until the ground let go');
      this.bus?.emit('gravedigger:claimClosed', {
        claimId: claim.id, wreckId: claim.wreckId, outcome: 'yielded', tick: state.tick,
      });
      this.bus?.emit('gravedigger:claimYielded', {
        claimId: claim.id, wreckId: claim.wreckId,
        heldS: GRAVEDIGGER_CLAIMS.contestHoldS, tick: state.tick,
      });
      this._say(`gravedigger_yield_${claim.id}`, LINES.yield, 8);
      this._gcClosed(g.claims, GRAVEDIGGER_CLAIMS.closedKeep);
    },
    /** A jumped claim is a grave robbery: the ledger files it, the grudge clock
     *  starts, the fine lands — and the law is told through its real seam. All
     *  latches write before the first event flies. */
    _robClaim(state, g, claim, how) {
      if (claim.state !== 'open') return;
      const now = num(state.simTime);
      claim.state = 'robbed';
      claim.how = how;
      claim.settledAt = now;
      this._clearClaimTag(state, claim);
      // A jumped grave is the robber's prize — the ground does not re-stake a
      // hull it already filed a robbery on, in this tick or any later one. The
      // mark lands only on the same-generation body whose tag was cleared.
      const w = this._entity(claim.wreckId);
      if (w && w.data && w.data.gravediggerClaimId == null
        && (claim.wreckGen == null || w.occupantGeneration === claim.wreckGen)) {
        w.data.gravediggerDisputed = true;
      }
      g.robbed = (g.robbed | 0) + 1;
      const had = this._grudged(state, g);
      g.grudgeUntil = Math.max(num(g.grudgeUntil), now + GRAVEDIGGER_CLAIMS.robGrudgeS);
      if (this._paidOnce(g, `rob:${claim.id}`)) {
        this._rep(state, GRAVEDIGGER_CLAIMS.robRep, 'gravedigger_claim_robbed');
        this._charge(state, GRAVEDIGGER_CLAIMS.robFineCr, `gravedigger_fine:${claim.id}`);
      }
      this._fileVerdict(state, 'claim_robbed', claim.wreckId,
        `a staked grave jumped — ${how}`);
      this._reportToLaw(state, claim);
      this.bus?.emit('gravedigger:claimClosed', {
        claimId: claim.id, wreckId: claim.wreckId, outcome: 'robbed', how, tick: state.tick,
      });
      this.bus?.emit('gravedigger:claimRobbed', {
        claimId: claim.id, wreckId: claim.wreckId, how,
        grudgeUntil: g.grudgeUntil, robbed: g.robbed, tick: state.tick,
      });
      if (!had) {
        // A fresh grudge earns its own cold line: the bark latch must not
        // carry over from an earlier grudge whose drain the grudge tick
        // never saw (a wire landing in the same step the old one ran out).
        this._grudgeBarked = false;
        this.bus?.emit('gravedigger:grudged', { until: g.grudgeUntil, tick: state.tick });
      }
      this._say(`gravedigger_robbed_${claim.id}`, LINES.robbed, 8);
      this._gcClosed(g.claims, GRAVEDIGGER_CLAIMS.closedKeep);
    },
    /** Law vs. claim: the ground's ledger files the robbery regardless, but the
     *  sector's law is told through the real report seam — jurisdiction and
     *  witnesses are the law's call, never this system's. */
    _reportToLaw(state, claim) {
      const law = this.registry && this.registry.get && this.registry.get('lawSecurity');
      if (!law || typeof law.reportIncident !== 'function') return null;
      const robot = this._robot();
      try {
        return law.reportIncident({
          reportId: `graverob:${claim.id}`,
          kind: 'payload_theft',
          offenderStableId: 'player',
          offenderEntityId: state.playerId ?? null,
          payloadStableId: `grave-claim:${claim.wreckId}`,
          pos: { x: claim.pos.x, z: claim.pos.z },
          causalTick: state.tick | 0,
          victim: { kind: 'entity', id: robot ? robot.id : 'gravedigger', label: GRAVEDIGGER.sender },
          victimEntityId: robot ? robot.id : null,
        });
      } catch {
        return null;
      }
    },
    /** The claim pass: contest, yield, robbery, lapse. Runs even with the
     *  machine down — a dead keeper's stakes lapse clean. */
    _tickClaims(state, g, dt) {
      const now = num(state.simTime);
      const robot = this._robot();
      const ring2 = GRAVEDIGGER_CLAIMS.ringRadius ** 2;
      const pitR2 = GRAVEDIGGER.pitRadius ** 2;
      for (const claim of [...g.claims]) {
        if (claim.state !== 'open') continue;
        const w = this._claimEnt(state, claim);
        if (!w) { this._lapseClaim(state, g, claim, 'lost'); continue; }
        if (!robot) { this._lapseClaim(state, g, claim, 'keeper_gone'); continue; }
        const inside = dist2(w.pos, claim.pos) <= ring2;
        if (inside) {
          if (this._heldByPlayer(state, w)) {
            claim.contestT = num(claim.contestT) + num(dt);
            if (claim.contestT >= GRAVEDIGGER_CLAIMS.contestHoldS) {
              this._yieldClaim(state, g, claim, w);
              continue;
            }
          } else {
            claim.contestT = 0;
          }
          if (now >= num(claim.expiresAt)) this._lapseClaim(state, g, claim, 'expired');
          continue;
        }
        // Out of the ring: the pit decides it, or the ledger files it.
        claim.contestT = 0;
        if (dist2(w.pos, POST) <= pitR2) {
          // Pit-ward — the offering settles the claim. But the stake still
          // runs out: a hull parked beside the pit without settling cannot
          // hold the one open stake forever, or the race never resumes.
          if (now >= num(claim.expiresAt)) this._lapseClaim(state, g, claim, 'expired');
          continue;
        }
        if (this._playerHandled(state, w)) this._robClaim(state, g, claim, 'hauled');
        else this._lapseClaim(state, g, claim, 'drifted');
      }
    },
    /** The grudge clock: when it runs out the pit reopens — once, on the record. */
    _tickGrudge(state, g) {
      const until = num(g.grudgeUntil);
      if (!(until > 0)) return;
      if (num(state.simTime) < until) return;
      g.grudgeUntil = 0;
      this._grudgeBarked = false;
      this.bus?.emit('gravedigger:forgiven', { tick: state.tick });
      this._say('gravedigger_forgiven', LINES.forgiven, 8);
    },
    /** The plot is full and the keeper's work is in it — the ground pays its
     *  portion, once ever. Only a burial that completes the plot can pay it. */
    _portionCheck(state, g, completedThePlot) {
      if (completedThePlot !== true) return;
      if (g.fed <= 0) return;
      if (!this._paidOnce(g, 'portion:full')) return;
      this._grant(state, GRAVEDIGGER_JUSTICE.portionCr, 'gravedigger:portion');
      this._fileVerdict(state, 'portion_paid', null, 'the full plot paid its keeper');
      this.bus?.emit('gravedigger:portionPaid', {
        amount: GRAVEDIGGER_JUSTICE.portionCr, tick: state.tick,
      });
      this._say('gravedigger_portion', LINES.portion, 9);
    },
    /** A composted offering feeds the keeper's standing; crossing a tier the
     *  ground says so, once. */
    _feed(state, g, wreckId) {
      g.fed = (g.fed | 0) + 1;
      this.bus?.emit('gravedigger:offering', { fed: g.fed, wreckId, tick: state.tick });
      const row = gravediggerTierFor(g.fed);
      if (row.tier > (g.keeper | 0)) {
        g.keeper = row.tier;
        this.bus?.emit('gravedigger:standing', {
          tier: row.tier, id: row.id, label: row.label, fed: g.fed, tick: state.tick,
        });
        this._say(`gravedigger_standing_${row.tier}`, row.line, 9);
      }
    },
    /** The plot owes its ledger: every recorded bed needs a live garden wearing
     *  its serial — a bed shot to pieces re-settles on the same grave, the way
     *  a killed lamp leaves a hole the next buoy replants. The memorial roll
     *  backfills names for beds older than the roll, and an in-flight vigil
     *  whose mourner is missing reverts to posted — it re-arms, never refunds. */
    _housekeep() {
      const state = this.state;
      if (!state || !this.helpers.spawnEntity) return;
      const g = ensureGravediggerLedger(state);
      this._syncMemorialRoll(state, g);
      const live = new Set();
      for (const e of this._liveGardens()) live.add(Number(e.data?.gravediggerGardenSerial));
      for (const bed of gravediggerGardenOwed(this._gardens(), live)) {
        this.helpers.spawnEntity(
          gravediggerGardenSpec(bed, bed.serial, this._graveFor(g, bed.serial)));
      }
      const now = num(deferredEnterNow(state)); // this pass can run inside the deferred enter provider
      for (const v of [...g.vigils]) {
        if (!this._vigilOpen(v) || v.state === 'posted') continue;
        if (!this._vigilEnt(state, v)) {
          if (v.state === 'leaving') { this._settleVigil(state, g, v); continue; }
          v.state = 'posted'; v.mournerId = null; v.mournerGen = null;
          v.arrivesAt = now + GRAVEDIGGER_VIGILS.revisitS;
        }
      }
    },
    _sync() {
      if (!this.state?.story) return;
      if (!this._adventure()) { this._removeOwned(); this._parkOpenWork(); return; }
      const flags = this._flags();
      const gone = flags?.[GRAVEDIGGER.goneFlag] === true;
      if (!gone && !this._robot() && this.helpers.spawnEntity) {
        this.helpers.spawnEntity(gravediggerSpec());
      }
      this._housekeep();
      if (!gone && !this._announced) {
        this._announced = true;
        const taught = flags?.[GRAVEDIGGER.taughtFlag] === true;
        this._say('gravedigger_announce', taught ? GRAVEDIGGER.teachLine : GRAVEDIGGER.announce, 9);
      }
    },
    /** Leaving the field: owned hulls are gone, so in-flight work parks — open
     *  claims lapse clean and live vigils revert to posted to re-arm on return.
     *  Only a kin already slipping away settles out here — by the company it
     *  honestly saw; nothing else is paid, billed, or forgiven on the way out. */
    _parkOpenWork() {
      const state = this.state;
      const g = ensureGravediggerLedger(state);
      // This pass can run inside the deferred enter provider: durable stamps
      // pin to the enter's clock, same as every other deferred materializer.
      const now = num(deferredEnterNow(state));
      // A copy: _lapseClaim's gc splices closed rows off this same array.
      for (const claim of [...g.claims]) {
        if (claim.state === 'open') this._lapseClaim(state, g, claim, 'field_left');
      }
      for (const v of [...g.vigils]) {
        if (!this._vigilOpen(v) || v.state === 'posted') continue;
        // A kin already slipping away is done — settle the watch by the company
        // it honestly saw; an inbound or holding watch re-arms to run again.
        if (v.state === 'leaving') { this._settleVigil(state, g, v); continue; }
        v.state = 'posted'; v.mournerId = null; v.mournerGen = null;
        v.arrivesAt = now + GRAVEDIGGER_VIGILS.revisitS;
      }
    },
    /** A burial: the wreck is consumed where it lay and a bed is recorded in
     *  the flag ledger (spot + serial), capped at the plot's count — past it
     *  the ground still takes hulls into the old beds. The name goes into the
     *  memorial roll the same pass. Returns true if the wreck was taken. */
    _bury(wreck, { pay = false } = {}) {
      const flags = this._flags();
      const state = this.state;
      if (!flags || !state || !wreck?.alive) return false;
      // No take, no pay — the booth's law: without the removal seam the pit
      // would pay for a hull still sitting in it, every pass, forever.
      if (typeof this.helpers?.removeEntity !== 'function') return false;
      const g = ensureGravediggerLedger(state);
      // The claim latch writes BEFORE the consumption receipt and the take:
      // a staked hull the ground buries is 'buried'/'offered', never 'robbed' —
      // the row must be closed before the receipt's synchronous wires could
      // report the wreck's end back as a jumped claim.
      const claim = this._openClaimFor(g, wreck.id);
      if (claim) this._closeClaimQuiet(state, g, claim, pay ? 'offered' : 'buried');
      // The canonical consumption receipt, BEFORE the take: a bound aftermath
      // marker only retires while its wreck is still live (rookBooth's order —
      // _completeByEntity refuses a dead hulk). Skip it and the field
      // rematerializes the buried hull on the next enter — a second body
      // standing beside its own grave, sellable and buryable again.
      const d = wreck.data || {};
      this.bus?.emit('salvage:completed', {
        wreckId: wreck.id,
        markerId: d.markerId || (d.provenance && d.provenance.markerId) || null,
        loot: {},
        pos: { x: wreck.pos.x, z: wreck.pos.z },
        radius: Number.isFinite(wreck.radius) ? wreck.radius : 0,
        source: 'gravedigger:bury',
      });
      if (this.helpers.removeEntity(wreck.id) === false) return false;
      const gardens = this._gardens();
      const prevSerial = Number(flags[GRAVEDIGGER.serialFlag]);
      let serial = (Number.isSafeInteger(prevSerial) && prevSerial >= 0
        && prevSerial < 0x7fffffff) ? prevSerial + 1 : 1;
      // A reset or tampered counter must never mint a serial a live bed or a
      // named grave already owns — the serial is the roll's whole identity.
      for (const bed of gardens) if (bed.serial >= serial) serial = bed.serial + 1;
      for (const r of g.graves) if (r.serial >= serial) serial = r.serial + 1;
      flags[GRAVEDIGGER.serialFlag] = serial;
      // The name goes on the roll: every hull the ground takes gets a name, and
      // the roll remembers whose hands fed it.
      const grave = {
        serial,
        name: this._nameFor(wreck, serial),
        pos: { x: wreck.pos.x, z: wreck.pos.z },
        buriedAt: num(state.simTime),
        buriedBy: pay ? 'player' : 'field',
      };
      g.graves.push(grave);
      while (g.graves.length > GRAVEDIGGER_JUSTICE.graveKeep) g.graves.shift();
      this.bus?.emit('gravedigger:graveNamed', {
        serial, name: grave.name, wreckId: wreck.id,
        buriedBy: grave.buriedBy, pos: { ...grave.pos }, tick: state.tick,
      });
      let planted = false;
      if (gardens.length < GRAVEDIGGER.gardenMax && this.helpers.spawnEntity) {
        const bed = { x: wreck.pos.x, z: wreck.pos.z, serial };
        gardens.push(bed);
        this.helpers.spawnEntity(gravediggerGardenSpec(bed, serial, grave));
        planted = gardens.length >= GRAVEDIGGER.gardenMax;
      }
      // The keeper's portion: the burial that completes the plot pays once
      // ever — but only to a keeper whose work was already in the ground. It
      // reads fed BEFORE this offering counts, so a first-time hull that
      // happens to close the plot earns the fee, never the portion.
      this._portionCheck(state, g, planted);
      if (pay) {
        const fee = Math.round(GRAVEDIGGER.compostFee * this._mult(state, g));
        this._grant(state, fee, 'gravedigger:compost');
        this._rep(state, GRAVEDIGGER_JUSTICE.offeringRep, 'gravedigger_offering');
        this._feed(state, g, wreck.id);
        if (claim) {
          this._say(`gravedigger_offered_${claim.id}`, LINES.offered, 7);
        }
      }
      if (flags[GRAVEDIGGER.taughtFlag] !== true && gardens.length >= GRAVEDIGGER.teachAfter) {
        flags[GRAVEDIGGER.taughtFlag] = true;
        this._say('gravedigger_teach', GRAVEDIGGER.teachLine, 10);
      }
      // The kin read the roll: a named grave can draw a mourner.
      this._maybePostVigil(state, g, grave);
      return true;
    },
    /** Kill reports read the victim by id. A dead gardener is durable: the
     *  beds persist, but nobody chases, nobody pays — and the open stakes he
     *  held lapse on the next pass. The kill wire also reads the ledger's
     *  grudges: a jumped stake, a slain mourner, a broken bed. */
    _onKilled(p) {
      const state = this.state;
      if (!this._adventure() || !p) return;
      const victim = this._entity(p.id);
      // Every entity:killed emitter fires after alive=false — a live lookup
      // means the wire's id was recycled onto a new body and this is a stale
      // or duplicated receipt, not a death (impulseCharges' own guard). Its
      // tags would settle the new body's open work, never the victim's.
      if (!victim || victim.alive !== false) return;
      const vd = victim.data;
      const flags = this._flags();
      const byPlayer = p.killerId != null
        && (p.killerId === state?.playerId || p.killerId === 'player');
      if (victim && vd && vd.gravedigger === true) {
        // One machine, one body: while a live UG-4 still walks the floor, a
        // wire naming a stood-down corpse (removed on sector leave, a stale
        // replay) is not a death — it must never plant the gone flag.
        if (!this._robot() && flags && flags[GRAVEDIGGER.goneFlag] !== true) {
          flags[GRAVEDIGGER.goneFlag] = true;
          this._say('gravedigger_gone', GRAVEDIGGER.goneLine, 9);
        }
        return;
      }
      const g = ensureGravediggerLedger(state);
      // A staked wreck killed: the client's torch is a grave robbery; anyone
      // else's is just a lost claim.
      const claimed = vd && vd.gravediggerClaimId
        ? g.claims.find((c) => c.id === vd.gravediggerClaimId && c.state === 'open')
        : null;
      if (claimed && claimed.wreckId === p.id
          && (claimed.wreckGen == null || victim.occupantGeneration === claimed.wreckGen)) {
        if (byPlayer) this._robClaim(state, g, claimed, 'slain');
        else this._lapseClaim(state, g, claimed, 'destroyed');
      }
      // A mourner put in the ground: the kin's vigil lapses and the ledger files
      // the heavier verdict — this is the pit's coldest grudge. The victim must
      // be the watch's OWN recorded mourner — id plus generation, the same
      // identity _vigilEnt binds the living hull by. A corpse still wearing a
      // re-armed vigil's tag (the hull stood down when the row went back to
      // posted, a recycled id, a stale or replayed receipt) is not the kin of
      // this watch: it cannot lapse the live row, and a wire for a body whose
      // watch already closed bills nothing at all.
      if (vd && vd.gravediggerMourner === true) {
        const vigil = g.vigils.find((v) => v.id === vd.gravediggerVigilId && this._vigilOpen(v)
          && v.mournerId === p.id
          && (v.mournerGen == null || victim.occupantGeneration === v.mournerGen));
        if (vigil) {
          vigil.state = 'lapsed';
          vigil.settledAt = num(state.simTime);
          this._gcClosed(g.vigils, GRAVEDIGGER_VIGILS.keepClosed);
          // The once key reads the vigil row — a doubled kill wire after the
          // vigil already lapsed must not bill the ledger twice.
          if (byPlayer && this._paidOnce(g, `kinslain:${vigil.id}`)) {
            this._rep(state, GRAVEDIGGER_JUSTICE.kinSlainRep, 'gravedigger_kin_slain');
            const now = num(state.simTime);
            // A fresh grudge earns its own cold line (see _robClaim).
            if (!this._grudged(state, g)) this._grudgeBarked = false;
            g.grudgeUntil = Math.max(num(g.grudgeUntil), now + GRAVEDIGGER_JUSTICE.kinSlainGrudgeS);
            this._fileVerdict(state, 'kin_slain', p.id, 'a mourner was put in the ground');
            this.bus?.emit('gravedigger:kinSlain', {
              vigilId: vigil.id, killerId: p.killerId, tick: state.tick,
            });
            this._say('gravedigger_kin_slain', LINES.kinSlain, 9);
          }
        }
      }
      // A bed broken under the client's fire: the ground re-plants the grave
      // (housekeep owes the ledger its bed) and files the desecration once.
      if (vd && vd.gravediggerGarden === true && byPlayer) {
        const serial = Number(vd.gravediggerGardenSerial);
        if (this._paidOnce(g, `desecrate:${serial}`)) {
          this._rep(state, GRAVEDIGGER_JUSTICE.desecrateRep, 'gravedigger_grave_desecrated');
          const now = num(state.simTime);
          if (!this._grudged(state, g)) this._grudgeBarked = false; // a fresh grudge barks
          g.grudgeUntil = Math.max(num(g.grudgeUntil), now + GRAVEDIGGER_JUSTICE.desecrateGrudgeS);
          this._fileVerdict(state, 'grave_desecrated', serial,
            `bed ${serial} broke under the client's fire`);
          this.bus?.emit('gravedigger:graveDesecrated', { serial, tick: state.tick });
          this._say('gravedigger_desecrate', LINES.desecrate, 8);
        }
      }
    },
    /** The consumption wire: any take that is not the ground's own burial and
     *  ends a staked hull — a beam-strip, a booth sale — is a jumped claim. */
    _onSalvageCompleted(p) {
      const state = this.state;
      if (!this._adventure() || !p || p.source === 'gravedigger:bury') return;
      if (p.wreckId == null) return;
      const g = ensureGravediggerLedger(state);
      const claim = g.claims.find((c) => c.state === 'open' && c.wreckId === p.wreckId);
      if (!claim) return;
      // A recycled id is never the staked wreck: the body still in the map must
      // be the same generation, and if it wears any mark it must be this claim's.
      const ent = this._entity(p.wreckId);
      if (ent) {
        if (claim.wreckGen != null && ent.occupantGeneration !== claim.wreckGen) return;
        if (ent.data && ent.data.gravediggerClaimId != null
          && ent.data.gravediggerClaimId !== claim.id) return;
      }
      this._robClaim(state, g, claim, 'stripped');
    },
    /** The calendar pass: restock the beds and the memorial roll, keep the
     *  vigils, resolve the stakes, then the robot's two jobs. A taught pit
     *  offering composts first — it pays, plants, and the machine never has to
     *  leave home — unless the ground holds a grudge against those hands;
     *  otherwise the nearest loose wreck in range is the grave it runs down
     *  next, staked before it is chased. One burial per pass. */
    update(dt, state) {
      const s = state || this.state;
      if (!s || !this._adventure()) return;
      this._housekeep();
      const g = ensureGravediggerLedger(s);
      this._tickVigils(s, g, dt);
      this._tickGrudge(s, g);
      const flags = this._flags();
      if (!flags) return;
      // Stakes resolve even with the keeper down — a dead machine's claims lapse.
      this._tickClaims(s, g, dt);
      const robot = this._robot();
      if (!robot || !robot.pos) return;
      // A hull under the client's line or beam is still theirs, even inside
      // the taught pit. Only a released, settled hull is an offering.
      const engaged = this._engagedIds(s);
      // The pit: post-teach, an offered hull pays the fee and becomes a bed.
      if (flags[GRAVEDIGGER.taughtFlag] === true) {
        const offering = (s.entityList || []).find((e) =>
          e && gravediggerCompostable(e, GRAVEDIGGER.post) && !(engaged && engaged.has(e.id)));
        if (offering) {
          if (!this._grudged(s, g)) {
            const full = this._gardens().length >= GRAVEDIGGER.gardenMax;
            if (this._bury(offering, { pay: true })) {
              this._say(`gravedigger_compost_${s.tick}`, full ? GRAVEDIGGER.fullLine : GRAVEDIGGER.compostLine, 6);
            }
            return;
          }
          // The pit is closed to the robber's hands — one cold line per grudge.
          // The machine still works the field; the refused hull is just a wreck
          // to it now — the ground takes it back, it only refuses the fee.
          if (!this._grudgeBarked) {
            this._grudgeBarked = true;
            this._say(`gravedigger_grudge_${s.tick}`, LINES.grudge, 7);
            this.bus?.emit('gravedigger:pitRefused', {
              until: g.grudgeUntil, offeringId: offering.id, tick: s.tick,
            });
          }
        }
      }
      // The race: the nearest eligible wreck is the next grave — staked before
      // it is chased. Towed and beamed hulls are the client's — the shared law
      // plus the live marks; a yielded hull stays the client's prize forever,
      // and a lapsed hull gets a quiet spell before it can be staked again.
      const now = num(s.simTime);
      const eligible = (e) => e && gravediggerBuryable(e, robot.pos)
        && !(engaged && engaged.has(e.id))
        && e.data?.gravediggerYielded !== true
        && e.data?.gravediggerDisputed !== true
        && !(num(e.data?.gravediggerPassedUntil) > now);
      const target = gravediggerTarget(robot.pos, s.entityList, eligible);
      if (target) {
        this._stakeClaim(s, g, target);
        if (gravediggerCanBury(target, robot.pos)) {
          if (this._bury(target)) {
            this._say(`gravedigger_bury_${s.tick}`, GRAVEDIGGER.buryLine, 5);
          }
          return;
        }
        const dv = gravediggerSteerDeltaV(robot, target.pos);
        if (dv && robot.mass > 0) {
          queuePhysicsImpulse(robot, { x: dv.x * robot.mass, z: dv.z * robot.mass }, { tick: s.tick });
        }
        return;
      }
      const dv = gravediggerDriftHome(robot);
      if (dv && robot.mass > 0) {
        queuePhysicsImpulse(robot, { x: dv.x * robot.mass, z: dv.z * robot.mass }, { tick: s.tick });
      }
    },
    /** Every id the client's hands currently hold — the same sources the claim
     *  contest reads, so the pit and the race never disagree about whose hull
     *  is whose. */
    _engagedIds(s) {
      let ids = null;
      const add = (id) => { if (id != null) (ids || (ids = new Set())).add(id); };
      const tether = s?.player?.tether;
      if (tether && tether.active !== false) add(tether.targetId);
      const pEnt = s?.entities?.get?.(s?.playerId);
      const pTether = pEnt && pEnt.tether;
      if (pTether && pTether.active !== false) add(pTether.targetId);
      add(s?.player?.miningTargetId);
      return ids;
    },
  };
}

export const gravedigger = createGravedigger();
