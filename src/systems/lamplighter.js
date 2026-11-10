// W-SHIFT (row 506, 03 §4.3): LAMPLIGHTER / LL-6 — who relights the dead rim buoys.
// Sedna Dark is the unlit rim: a survey post, no fuel, and a route the dark never let
// anyone finish. A marked robot hull keeps the relight post; tow one of the dead lane
// buoys drifting the rim into its arms and it plants the relit lamp on the old lane
// path — one light per buoy, lowest dark slot first, until the sixth lamp is the last
// buoy and the rim is lit. The lit record is a slot bitmask in story flags, so the
// path survives the save and the return trip; the dead stock is the sector's, and a
// buoy shot to pieces is replaced the way a dead lane marker persists.
//
// WHAT THIS OWNS — the robot hull, the drifting dead stock, the planted lamps, and
// the ambient bodies the lit rim draws (oil pods, lamp-lit wayfarers, snuffers):
// one-off event seams (init / deferred sector-enter / save:loaded / newGame), the
// lit bitmask and rim/gone/keeper receipts in story flags, and the calendar census
// that accepts a settled delivery, keeps the seats honest, walks the robot home
// through the impulse membrane, burns the lamps down, and runs the work wire.
// Nothing here writes entity.vel — the robot and the ambient hulls are live dynamic
// bodies, so steering goes through queuePhysicsImpulse.
//
// THE WORK — a lit rim is a route, and a route costs:
//   · LAMP UPKEEP — every planted lamp burns a charge drawn from the post's oil
//     tank (durable in story.flags). A lamp whose charge empties gutters out:
//     its seat bit clears and the next buoy replants the hole. The machine buys
//     oil — tow a consortium oil pod into the arms, or park in the ring while it
//     siphons a fuel cell a beat out of your hold. It pays for what it burns.
//   · LAMP TENDING — a low lamp within arm's reach takes a cell straight to the
//     wick: park beside a dimming light and the machine tops its charge and pays
//     the tip. Maintenance is a verb, not a menu.
//   · THE LIT ROUTE — light is traffic. While lamps stand, lamp-lit wayfarers
//     come down the lane the dark closed, walk the lit slots to the post, and
//     pay a route due the machine shares with the hand that keeps the lamps.
//     Kill the lights and the traffic turns back for the rim.
//   · THE DARK PUSHES BACK — three or more lamps burning draw snuffers off the
//     rim: hostile hulls that latch to a light and drink its charge. The
//     machine cannot fight; it posts the bounty and pays for cooled hulls.
//   · FAVORS AND GRUDGES — deliveries, oil, cooled snuffers, and tending are
//     deeds; deeds raise the keeper tier that scales every payout. Snuff a lamp
//     or a wayfarer with your own guns and the machine files a grudge: enough
//     of them and it still takes your work but pays nothing — each favor while
//     spurned works the debt down instead. A slot you put out replants cold:
//     no credits, no cheer, ever.
//   · THE ASK WIRE — the machine posts the work it cannot do: oil when the
//     tank runs thin, snuffer bounties while the moths are on the lamps. A
//     verified ask pays and counts; a sour one costs a little regard.
//
// Deterministic: every clock reads simTime, every draw reads hash32 over the
// durable seq; durable truth lives in story.flags (the lit mask, the oil tank,
// the per-slot charges, the keeper record, the grudges, the stamp bag), and the
// session ledgers in state.lamplighter normalize on read and stay bounded.
// Money moves only through economy:grantCredits; standing only through
// faction:repDelta; motion only through queuePhysicsImpulse; once-only stamps
// latch before their emits.
import { LAMPLIGHTER } from '../data/lamplighter.js';
import {
  lamplighterDeadSpot, lamplighterSlotSpot, lamplighterArmable, lamplighterDeadOwed,
  lamplighterLitCount, lamplighterFirstDark, lamplighterMaskSet, lamplighterMaskClear,
  lamplighterDriftHome,
} from '../characters/lamplighterRules.js';
import { deferSectorEnterMaterialization } from '../core/sectorEnterDefer.js';
import { queuePhysicsImpulse } from '../core/physicsAuthority.js';
import { hash32 } from '../core/rng.js';
import { sellableCargoQty, removeCargo } from './cargo.js';

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const intOr = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n | 0 : d; };
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const frac = (...args) => (hash32(...args) >>> 0) / 4294967296; // deterministic [0,1)
const distXZ = (a, b) => Math.hypot(num(a && a.x) - num(b && b.x), num(a && a.z) - num(b && b.z));
const finiteXZ = (v) => Number.isFinite(v && v.x) && Number.isFinite(v && v.z);
/** A seat claim must name a real lane slot. A forged or hand-cut stamp past the
 *  end would still pass a Number.isInteger check — and JS shifts are mod-32, so
 *  slot 99 silently aliases bit 3 of the lit record. Reads bound it to -1. */
const seatIndex = (v) => {
  const i = Number(v);
  return Number.isInteger(i) && i >= 0 && i < LAMPLIGHTER.slotCount ? i : -1;
};

// Sedna Dark is a Helix home sector — the survey post measures everything, and a
// lit lane is a better number. The keeper's regard files under their name.
const RIM_FACTION = 'faction_helix';
const FUEL_CELL = 'cmdty_fuel_cells';

// ── Lamp upkeep: the oil tank, the per-slot charges, the pods and the siphon ──
export const LAMPLIGHTER_UPKEEP = Object.freeze({
  oilCap: 600,            // the post's reservoir, in lamp-seconds of charge
  startOilFrac: 0.5,      // the machine keeps a reserve — a first tank is authored, not earned
  chargePerLamp: 300,     // a planted lamp draws this much from the tank
  pilotCharge: 20,        // a dry tank still plants — the wick carries its own first burn
  burnPerLampPerS: 1,     // charge seconds burned per sim second per lit lamp
  migrateFillFrac: 0.75,  // pre-expansion saves boot their lit lamps at this fill, once
  podOil: 200,            // an oil pod's worth in the tank
  podPayCr: 120,          // the consortium pays the carrier (x tier)
  podRep: 1,
  podBelowFrac: 0.6,      // pods drop while the tank sits under this fill
  podPeriodS: 90, podJitterS: 60,
  podCap: 2,              // live pods on the rim at once
  podSpawnR: 720,         // the drop ring out from the post
  cellOilEach: 60,        // one fuel cell's worth in the tank
  cellPayCr: 30,          // the machine buys what it burns (x tier)
  cellBeatS: 4,           // the siphon draws at most one cell per beat
  cellsPerDeed: 5,        // every fifth cell sold counts as board work
});

// ── Lamp tending: a cell straight to a burning lamp's wick ────────────────────
export const LAMPLIGHTER_TEND = Object.freeze({
  tendR: 110,             // park this close to service a lamp
  lowFrac: 0.75,          // only a lamp under this fill takes a tending
  cellLampCharge: 90,     // charge one cell buys a lamp
  tendBeatS: 4,           // at most one tended cell per beat
  tendTipCr: 25, tendRep: 1,
});

// ── The lit route: wayfarers walk the lane the dark closed ────────────────────
export const LAMPLIGHTER_TRAFFIC = Object.freeze({
  litMin: 1,              // the route lives while any lamp stands
  cap: 2,                 // live wayfarers at once
  basePeriodS: 170,       // inbound clock, divided by the lit count — more light, more traffic
  jitterS: 90,
  speed: 38,
  arriveR: 80,            // waypoint and post acceptance radius
  spawnMargin: 340,       // it drops in beyond the farthest lit lamp
  leaveMargin: 500,       // a turned wayfarer despawns this far past the lane's end
  tollTipCr: 45,          // the route due the machine shares (x tier)
  tollRep: 1,
  hull: 90, radius: 12, mass: 30,
});

// ── The dark pushes back: snuffers that drink lit lamps ───────────────────────
export const LAMPLIGHTER_SNUFFERS = Object.freeze({
  litMin: 3,              // the light has to be worth eating
  cap: 2,                 // live snuffers at once
  periodS: 150,           // inbound clock, divided by lamps past the threshold
  jitterS: 80,
  hull: 70, radius: 9, mass: 18,
  speed: 46,
  siphonR: 64,            // latching ring around a lamp
  siphonPerS: 6,          // charge a latched snuffer drinks per second (~50 s a full lamp)
  siphonBeatS: 6,         // drain-callout beat while latched
  fleeSpeed: 52, leaveMargin: 520,
  bountyCr: 140, bountyRep: 2,
  spawnMargin: 560,       // out of the dark beyond the lane's end
});

// ── The ask wire and the grudge book ──────────────────────────────────────────
export const LAMPLIGHTER_WORK = Object.freeze({
  askAtOilFrac: 0.4,      // the machine posts an oil ask under this fill
  askTtlS: 300,           // an open ask nobody answers sours after this
  askKeep: 8,             // closed asks kept for the record strip
  verifyPayCr: 160, verifyRep: 2,
  sourRep: -1,            // a lead gone cold costs a little regard
  spurnAfter: 3,          // this many grudges and it takes your work but pays nothing
  strikeRep: -4,          // a lamp put out by the pilot's own guns
  wayfarerKillRep: -6,    // a route traveler murdered on the lit lane
});

// ── The planting purse ────────────────────────────────────────────────────────
export const LAMPLIGHTER_PAY = Object.freeze({
  plantPayCr: 90, plantRep: 2,   // a settled buoy planted (x tier)
  firstLightCr: 150,             // once: the first lamp the route ever got back
  rimPurseCr: 600, rimRep: 4,    // once: THE RIM HOLDS
});

// ── Keeper standing: deeds into the tier the machine posts under ──────────────
export const LAMPLIGHTER_KEEPER_TIERS = Object.freeze([
  { tier: 0, deeds: 0,  id: 'stranger', label: 'A Hull on the Rim',      payMult: 1.0,
    line: 'The machine does not know your engine yet.' },
  { tier: 1, deeds: 3,  id: 'hand',     label: 'Hand of the Post',       payMult: 1.15,
    line: 'LL-6 marks your burn signature. Work is noted.' },
  { tier: 2, deeds: 8,  id: 'keeper',   label: 'Keeper of the Lane',     payMult: 1.35,
    line: 'The lamps answer your name now. The purse adjusts.' },
  { tier: 3, deeds: 16, id: 'warden',   label: 'Warden of the Dark',     payMult: 1.6,
    line: 'The dark keeps receipts. Yours read warm.' },
  { tier: 4, deeds: 30, id: 'rimlit',   label: 'The Lit Route Itself',   payMult: 1.9,
    line: 'You are the reason the route survived. The rim knows.' },
]);

export function lamplighterTierFor(deeds) {
  const d = Math.max(0, intOr(deeds));
  let row = LAMPLIGHTER_KEEPER_TIERS[0];
  for (const t of LAMPLIGHTER_KEEPER_TIERS) if (d >= t.deeds) row = t;
  return row;
}

// ── Board text: the machine speaks in notices and receipts ────────────────────
const OIL_ASK_LINES = Object.freeze([
  'TANK AT A QUARTER OR LESS. OIL PODS DROP ON THE RIM. BRING ONE IN — OR PARK AND SELL ME CELLS.',
  'THE LAMPS DRINK. THE TANK RUNS THIN. OIL WORK POSTED.',
]);
const SNUFFER_ASK_LINES = Object.freeze([
  'MOTHS ON THE LAMPS. COOL THEM — THE POST PAYS THE BOUNTY.',
  'SNUFFERS INBOUND FROM THE DARK. BOUNTY POSTED PER HULL.',
]);
const OILED_LINE = 'OIL TAKEN. THE TANK REMEMBERS WHO CARRIED IT.';
const POD_DROP_LINE = 'CONSORTIUM DROP ON THE RIM — AN OIL POD, PAID ON DELIVERY.';
const SOLD_LINE = 'CELL TAKEN. PAID. THE TANK GROWS.';
const TEND_LINE = 'THE WICK TAKES THE CELL. THE LIGHT HOLDS. PAID.';
const GUTTER_LINES = Object.freeze([
  'A LAMP WENT OUT. THE DARK TOOK A SEAT BACK.',
  'ONE LIGHT LESS. THE HOLE WAITS FOR A BUOY.',
]);
const SIPHONED_LINE = 'A SNUFFER DRANK A LAMP DRY. THE DARK TOOK A SEAT BACK.';
const COLD_REPLANT_LINE = 'THE HOLE YOU MADE IS FILLED. THE LIGHT REMEMBERS WHO PUT IT OUT.';
const GRUDGE_LINES = Object.freeze([
  'THAT LIGHT WAS COUNTED. SO ARE YOU.',
  'THE RIM FILES THE HAND THAT PUTS LIGHTS OUT.',
]);
const WAYFARER_KILLED_LINE = 'A TRAVELER DOWN ON THE LIT LANE. THE ROUTE FILES THE HAND.';
const SPURN_LINE = 'YOUR NAME IS IN THE DARK COLUMN. WORK — DO NOT EXPECT PAY.';
const SPURN_GREET_LINE = 'YOU AGAIN. THE ARMS STILL TAKE WHAT YOU BRING. THE PURSE DOES NOT.';
const AMENDS_LINE = 'WORK WITHOUT PAY COUNTS TOWARD THE LEDGE YOU OWE.';
const FORGIVEN_LINE = 'THE DEBT IS WORKED OFF. THE PURSE OPENS AGAIN.';
const WAYFARER_IN_LINE = 'TRAFFIC ON THE LANE — A WAYFARER WALKS YOUR LIGHTS IN.';
const WAYFARER_PAID_LINE = 'THE WAYFARER PAYS ITS DUE. THE KEEPER TAKES A SHARE.';
const SNUFFER_IN_LINE = 'A MOTH OUT OF THE DARK — IT WILL DRINK WHAT IT REACHES.';
const SNUFFER_DOWN_LINES = Object.freeze([
  'A MOTH COOLED. THE POST PAYS.',
  'SNUFFER DOWN. THE LAMPS KEEP THEIR LIGHT.',
]);
const VERIFY_LINES = Object.freeze([
  'THE WORK IS DONE. THE POST SETTLES.',
  'ASK VERIFIED. PAID, AS POSTED.',
]);
const SOUR_LINES = Object.freeze([
  'THE ASK WENT COLD. THE WIRE REMEMBERS WASTED WORDS.',
  'NOBODY RAN THE POSTED WORK. IT SOURS.',
]);
const WAYFARER_TURNED_LINE = 'THE LANE WENT DARK UNDER IT — THE WAYFARER TURNS BACK.';
const ASK_LAPSED_LINE = 'THE ASK STANDS DOWN. THE MOMENT PASSED.';

const ASK_CAP = 16;
const LOG_CAP = 20;
const PAID_STAMPS_CAP = 96;

/** Evict rows past the cap — closed rows first; a wire holding only open leads
 *  sheds its oldest, since bounded beats immortal even for live rows. */
function capRows(rows, cap) {
  while (rows.length > cap) {
    let i = rows.findIndex((r) => r && r.state !== 'open');
    if (i < 0) i = 0;
    rows.splice(i, 1);
  }
}

function normalizeAsk(a) {
  a.postedAt = num(a.postedAt); a.expiresAt = num(a.expiresAt); a.settledAt = num(a.settledAt);
  a.state = typeof a.state === 'string' && a.state ? a.state : 'open';
  a.how = a.how == null ? null : String(a.how);
  return a;
}

/**
 * Fresh serializable session ledger: the ask wire, the chronicle, and the spawn
 * clocks. Durable truth (the mask, the tank, the charges, the keeper record, the
 * stamp bag) lives in story.flags — this slice is the work-in-progress the next
 * visit re-derives. Anything malformed normalizes or drops.
 */
export function ensureLamplighterState(state) {
  if (!isObj(state.lamplighter)) state.lamplighter = {};
  const t = state.lamplighter;
  if (!Array.isArray(t.asks)) t.asks = [];
  if (!Array.isArray(t.log)) t.log = [];
  t.nextPodAt = num(t.nextPodAt);
  t.nextWayfarerAt = num(t.nextWayfarerAt);
  t.nextSnufferAt = num(t.nextSnufferAt);
  t.cellNextAt = num(t.cellNextAt);
  t.tendNextAt = num(t.tendNextAt);
  // The soured-lead suppression is durable (flags.lamplighter_oilBan for the tank,
  // flags.lamplighter_snufferBan for the bounty) — a session flag would forget the
  // snub across a save boundary and bleed regard again.
  t.asks = t.asks.filter((a) => isObj(a) && typeof a.id === 'string' && typeof a.kind === 'string');
  for (const a of t.asks) normalizeAsk(a);
  capRows(t.asks, ASK_CAP);
  t.log = t.log.filter((l) => isObj(l) && typeof l.id === 'string' && typeof l.kind === 'string');
  if (t.log.length > LOG_CAP) t.log.splice(0, t.log.length - LOG_CAP);
  return t;
}

// ── Reads over the durable flag store ─────────────────────────────────────────
// story.flags.lamplighter_* persists through the story bag — the same envelope
// the lit mask already rides. Session state.lamplighter holds only what a visit
// can re-derive. The reads below normalize so a stale or hand-cut save can never
// sink the tick.

function lampFlags(state) {
  const flags = state && state.story && state.story.flags;
  return flags || null;
}

function lampFlagNum(flags, key, d = 0) {
  const v = flags ? Number(flags[key]) : NaN;
  return Number.isFinite(v) ? v : d;
}

/** The post's oil reservoir (durable). A fresh tank is authored at the starting
 *  reserve — the machine keeps stock, the economy is in keeping it. */
function lampOil(flags) {
  if (!flags) return 0;
  const v = Number(flags.lamplighter_oil);
  if (!Number.isFinite(v)) flags.lamplighter_oil = LAMPLIGHTER_UPKEEP.oilCap * LAMPLIGHTER_UPKEEP.startOilFrac;
  return Math.max(0, Math.min(LAMPLIGHTER_UPKEEP.oilCap, Number(flags.lamplighter_oil) || 0));
}

function lampOilAdd(flags, amt) {
  const cur = lampOil(flags);
  const next = Math.max(0, Math.min(LAMPLIGHTER_UPKEEP.oilCap, cur + num(amt)));
  if (flags) flags.lamplighter_oil = next;
  return next - cur;
}

/** Per-slot burn seconds (durable). A pre-expansion save's lit lamps boot at the
 *  migration fill exactly once — the latch keeps a replayed normalize from
 *  refilling burned-out lamps for free. */
function lampCharges(flags) {
  if (!flags) return [];
  let c = flags.lamplighter_charge;
  if (!Array.isArray(c)) {
    c = new Array(LAMPLIGHTER.slotCount).fill(0);
    if (flags.lamplighter_chargeMigrated !== true) {
      const mask = lampFlagNum(flags, LAMPLIGHTER.litFlag);
      for (let i = 0; i < LAMPLIGHTER.slotCount; i += 1) {
        if ((mask & (1 << i)) !== 0) c[i] = LAMPLIGHTER_UPKEEP.chargePerLamp * LAMPLIGHTER_UPKEEP.migrateFillFrac;
      }
      flags.lamplighter_chargeMigrated = true;
    }
    flags.lamplighter_charge = c;
  }
  if (c.length !== LAMPLIGHTER.slotCount) {
    c.length = LAMPLIGHTER.slotCount;
    for (let i = 0; i < LAMPLIGHTER.slotCount; i += 1) if (c[i] == null) c[i] = 0;
  }
  for (let i = 0; i < c.length; i += 1) {
    const v = Number(c[i]);
    c[i] = Number.isFinite(v) && v > 0 ? Math.min(v, LAMPLIGHTER_UPKEEP.chargePerLamp) : 0;
  }
  return c;
}

function lampSeq(flags) {
  const n = intOr(flags && flags.lamplighter_seq);
  if (flags) flags.lamplighter_seq = n + 1;
  return n;
}

function lampStats(flags) {
  if (!flags) return { planted: 0, guttered: 0, pods: 0, cells: 0, tended: 0, downs: 0, ways: 0, lost: 0 };
  if (!isObj(flags.lamplighter_stats)) flags.lamplighter_stats = {};
  const s = flags.lamplighter_stats;
  for (const k of ['planted', 'guttered', 'pods', 'cells', 'tended', 'downs', 'ways', 'lost']) s[k] = intOr(s[k]);
  return s;
}

/** The player's keeper standing: the tier row plus the deeds and grudges behind it. */
export function lamplighterStanding(state) {
  const flags = lampFlags(state);
  const deeds = intOr(flags && flags.lamplighter_deeds);
  const strikes = intOr(flags && flags.lamplighter_strikes);
  const row = lamplighterTierFor(deeds);
  return {
    tier: row.tier, id: row.id, label: row.label, payMult: row.payMult,
    deeds, strikes, spurned: flags ? flags.lamplighter_spurned === true : false,
  };
}

/** Open asks on the wire — copies, oldest first. */
export function lamplighterAsks(state) {
  const t = ensureLamplighterState(state);
  return t.asks.filter((a) => a.state === 'open').map((a) => ({ ...a }));
}

/** A HUD-safe copy of the whole work board: tank, charges, asks, chronicle, standing. */
export function lamplighterBoard(state) {
  const t = ensureLamplighterState(state);
  const flags = lampFlags(state);
  const mask = lampFlagNum(flags, LAMPLIGHTER.litFlag);
  return {
    standing: lamplighterStanding(state),
    litMask: mask, lit: lamplighterLitCount(mask),
    rimLit: flags ? flags[LAMPLIGHTER.rimFlag] === true : false,
    gone: flags ? flags[LAMPLIGHTER.goneFlag] === true : false,
    oil: lampOil(flags), oilCap: LAMPLIGHTER_UPKEEP.oilCap,
    charge: flags ? [...lampCharges(flags)] : [],
    asks: t.asks.map((a) => ({ ...a })),
    log: t.log.map((l) => ({ ...l })),
    stats: { ...lampStats(flags) },
  };
}

// ── Bodies the rim owns ────────────────────────────────────────────────────────

export function lamplighterSpec() {
  return {
    type: 'drone',
    pos: { ...LAMPLIGHTER.post }, vel: { x: 0, z: 0 },
    radius: 10, mass: 30, hull: 250, hullMax: 250,
    homeSectorId: LAMPLIGHTER.sectorId,
    data: {
      lamplighter: true, authoredCharacter: 'lamplighter', parentType: 'story_prop',
      callsign: LAMPLIGHTER.callsign,
      scanLabel: 'LAMPLIGHTER / LL-6 — relights the dead rim buoys',
      scannerSignalKind: 'salvage',
      homeSectorId: LAMPLIGHTER.sectorId,
    },
  };
}

export function lamplighterDeadSpec(index) {
  return {
    type: 'debris',
    pos: { ...lamplighterDeadSpot(index) }, vel: { x: 0, z: 0 },
    radius: 7, mass: 24, hull: 60, hullMax: 60,
    homeSectorId: LAMPLIGHTER.sectorId,
    data: {
      lamplighterDead: true, lamplighterDeadIndex: index, parentType: 'story_prop',
      callsign: 'DEAD LANE BUOY',
      scanLabel: 'dead lane buoy — dark hardware on the unlit lane',
      scannerSignalKind: 'salvage',
      homeSectorId: LAMPLIGHTER.sectorId,
    },
  };
}

export function lamplighterLampSpec(slot) {
  return {
    type: 'debris',
    pos: { ...lamplighterSlotSpot(slot) }, vel: { x: 0, z: 0 },
    radius: 7, mass: 60, hull: 80, hullMax: 80,
    homeSectorId: LAMPLIGHTER.sectorId,
    data: {
      lamplighterLamp: true, lamplighterSlot: slot, parentType: 'story_prop',
      callsign: 'LIT LANE LAMP',
      scanLabel: 'lit lane lamp — the light the dark lost',
      scannerSignalKind: 'anomaly',
      homeSectorId: LAMPLIGHTER.sectorId,
    },
  };
}

/** A consortium oil pod on the drop ring — tow it into the arms like a buoy. The
 *  spot is a deterministic bearing per seq so the rim is the same rim every visit. */
export function lamplighterOilPodSpec(seedSeq) {
  const n = intOr(seedSeq);
  const ang = frac('lamp-pod-ang', n) * Math.PI * 2;
  const r = LAMPLIGHTER_UPKEEP.podSpawnR * (0.75 + frac('lamp-pod-r', n) * 0.5);
  return {
    type: 'payload',
    pos: { x: LAMPLIGHTER.post.x + Math.cos(ang) * r, z: LAMPLIGHTER.post.z + Math.sin(ang) * r },
    vel: { x: 0, z: 0 },
    radius: 8, mass: 14, hull: 40, hullMax: 40,
    homeSectorId: LAMPLIGHTER.sectorId,
    data: {
      lamplighterOil: true, parentType: 'story_prop',
      callsign: 'LAMP OIL',
      scanLabel: 'lamp oil — the consortium\'s standing order, paid on delivery',
      scannerSignalKind: 'salvage',
      homeSectorId: LAMPLIGHTER.sectorId,
    },
  };
}

/** A lamp-lit wayfarer inbound on the route: it drops in beyond the farthest lit
 *  lamp and walks the lit slots down to the post. `lampRoute` rides the body's
 *  data — enumerable, serialized, and meaningless to a recycled id. */
export function lamplighterWayfarerSpec(topSlot, seedSeq) {
  const top = Math.max(0, Math.min(LAMPLIGHTER.slotCount - 1, intOr(topSlot)));
  const spot = lamplighterSlotSpot(top);
  const n = intOr(seedSeq);
  const bearing = LAMPLIGHTER.slotBearing + (frac('lamp-way-a', n) - 0.5) * 0.4;
  const pos = {
    x: spot.x + Math.cos(bearing) * LAMPLIGHTER_TRAFFIC.spawnMargin,
    z: spot.z + Math.sin(bearing) * LAMPLIGHTER_TRAFFIC.spawnMargin,
  };
  const route = [];
  for (let i = top; i >= 0; i -= 1) route.push(i);
  return {
    type: 'ship', team: 0,
    pos, vel: { x: 0, z: 0 }, rot: bearing,
    radius: LAMPLIGHTER_TRAFFIC.radius, mass: LAMPLIGHTER_TRAFFIC.mass,
    hull: LAMPLIGHTER_TRAFFIC.hull, hullMax: LAMPLIGHTER_TRAFFIC.hull, collides: true,
    homeSectorId: LAMPLIGHTER.sectorId,
    data: {
      lamplighterWayfarer: true, parentType: 'story_prop',
      name: 'Lamp-lit hauler', callsign: 'LAMP-LIT HAULER',
      scanLabel: 'lamp-lit wayfarer — the route breathing again',
      scannerSignalKind: 'traffic',
      ai: { passive: true },
      lampRoute: route, lampWp: 0,
      homeSectorId: LAMPLIGHTER.sectorId,
    },
  };
}

/** A snuffer out of the dark — it latches to the nearest lit lamp and drinks its
 *  charge. Passive ai so the census steers it through the impulse membrane. */
export function lamplighterSnufferSpec(seedSeq) {
  const n = intOr(seedSeq);
  const a = LAMPLIGHTER.slotBearing + (frac('lamp-snuf-a', n) - 0.5) * 0.9;
  const r = LAMPLIGHTER.slotSpacing * LAMPLIGHTER.slotCount + LAMPLIGHTER_SNUFFERS.spawnMargin
    + frac('lamp-snuf-r', n) * 220;
  return {
    type: 'ship', team: 1,
    pos: { x: LAMPLIGHTER.post.x + Math.cos(a) * r, z: LAMPLIGHTER.post.z + Math.sin(a) * r },
    vel: { x: 0, z: 0 }, rot: a + Math.PI,
    radius: LAMPLIGHTER_SNUFFERS.radius, mass: LAMPLIGHTER_SNUFFERS.mass,
    hull: LAMPLIGHTER_SNUFFERS.hull, hullMax: LAMPLIGHTER_SNUFFERS.hull, collides: true,
    homeSectorId: LAMPLIGHTER.sectorId,
    data: {
      lamplighterSnuffer: true, parentType: 'story_prop',
      name: 'Snuffer', callsign: 'SNUFFER',
      scanLabel: 'snuffer — a moth that drinks lit lamps',
      scannerSignalKind: 'hostile',
      ai: { passive: true, hostile: true },
      homeSectorId: LAMPLIGHTER.sectorId,
    },
  };
}

export function createLamplighter() {
  return {
    name: 'lamplighter',
    init(ctx) {
      this.destroy();
      this.state = ctx.state; this.bus = ctx.bus; this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._announced = false;
      ensureLamplighterState(this.state);
      const on = (event, fn) => {
        const off = this.bus?.on(event, fn); if (typeof off === 'function') this._unsubs.push(off);
      };
      const resetVisit = () => { this._announced = false; };
      on('sector:enter', (p) => {
        resetVisit();
        if (deferSectorEnterMaterialization(this.state, p, this._cookProvider)) return;
        this._sync();
      });
      this._cookProvider = () => { this._sync(); };
      (this.helpers.sectorCookProviders || (this.helpers.sectorCookProviders = []))
        .push(this._cookProvider);
      on('save:loaded', () => { resetVisit(); this._sync(); });
      on('game:newGame', () => { resetVisit(); this._sync(); });
      on('entity:killed', (p) => this._onKilled(p));
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
      const flags = this.state?.story?.flags;
      return flags ? flags : (this.state?.story ? (this.state.story.flags = {}) : null);
    },
    _adventure() {
      const run = this.state?.run;
      return (!run || !run.kind || run.kind === 'adventure' || run.kind === 'campaign')
        && this.state?.world?.currentSectorId === LAMPLIGHTER.sectorId;
    },
    _entity(id) {
      const s = this.state;
      return s?.entities?.get?.(id) || (s?.entityList || []).find((e) => e && e.id === id) || null;
    },
    _robot() {
      for (const e of this.state?.entityList || []) {
        if (e?.alive && e.data?.lamplighter === true) return e;
      }
      return null;
    },
    _deadAlive() {
      return (this.state?.entityList || []).filter((e) => e?.alive && e.data?.lamplighterDead === true);
    },
    _lampsAlive() {
      return (this.state?.entityList || []).filter((e) => e?.alive && e.data?.lamplighterLamp === true);
    },
    /** Live ambient bodies by ownership tag — the census never holds ids across a
     *  pass, so a recycled id can never inherit an errand it did not spawn. */
    _ambient(tag) {
      return (this.state?.entityList || []).filter((e) => e?.alive && e.data?.[tag] === true);
    },
    /** Slot → live lamp entity. Seats key on the data stamp, never entity ids —
     *  and only a real slot claims a seat; a forged stamp is just a lit hull. */
    _lampsBySlot() {
      const map = new Map();
      for (const lamp of this._lampsAlive()) {
        const slot = seatIndex(lamp.data?.lamplighterSlot);
        if (slot >= 0) map.set(slot, lamp);
      }
      return map;
    },
    _litMask() {
      const flags = this._flags();
      return flags ? (Number(flags[LAMPLIGHTER.litFlag]) || 0) : 0;
    },
    _strikes(flags) { return intOr(flags && flags.lamplighter_strikes); },
    /** The spurn is a durable latch, not a threshold read: crossing it opens the
     *  debt, and only working the strikes back to zero closes it — one favor
     *  never buys the purse back open. */
    _spurned(flags) { return flags ? flags.lamplighter_spurned === true : false; },
    _snuffed(flags) { return intOr(flags && flags.lamplighter_snuffed); },
    _tierMult(flags) { return lamplighterTierFor(flags && flags.lamplighter_deeds).payMult; },
    _removeOwned() {
      for (const e of this.state?.entityList || []) {
        if (e?.alive && (e.data?.lamplighter === true || e.data?.lamplighterDead === true
            || e.data?.lamplighterLamp === true || e.data?.lamplighterOil === true
            || e.data?.lamplighterSnuffer === true || e.data?.lamplighterWayfarer === true)) {
          this.helpers?.removeEntity?.(e.id);
        }
      }
    },
    /** The ambient bodies only exist while a keeper holds the post — a dead
     *  machine's rim owes no errands, no traffic, and no pods. */
    _orphanAmbient() {
      for (const e of this.state?.entityList || []) {
        if (e?.alive && (e.data?.lamplighterOil === true
            || e.data?.lamplighterSnuffer === true || e.data?.lamplighterWayfarer === true)) {
          this.helpers?.removeEntity?.(e.id, { reason: 'lamplighter_orphaned' });
        }
      }
    },
    _say(id, text, ttl = 7) {
      this.bus?.emit('comms:popup', {
        id, sender: LAMPLIGHTER.sender, category: 'story', text, ttl, persist: false,
      });
    },
    _logText(text) {
      if (typeof text === 'string' && text) this.bus?.emit('comms:log', { text, speaker: 'LL-6' });
    },
    /** Once-only stamp bag on the durable flags: money and rep never move twice,
     *  across re-entry, replay, or a save boundary. Insertion order evicts. */
    _paidOnce(flags, key) {
      if (!flags) return false;
      if (!isObj(flags.lamplighter_paid)) flags.lamplighter_paid = {};
      if (flags.lamplighter_paid[key] != null) return false;
      flags.lamplighter_paid[key] = num(this.state?.simTime);
      const keys = Object.keys(flags.lamplighter_paid);
      for (let i = 0; i < keys.length - PAID_STAMPS_CAP; i++) delete flags.lamplighter_paid[keys[i]];
      return true;
    },
    _grant(state, amount, reason) {
      const n = Math.round(num(amount));
      if (!Number.isSafeInteger(n) || n <= 0) return;
      this.bus?.emit('economy:grantCredits', { amount: n, reason });
    },
    _rep(state, delta, reason) {
      const d = num(delta);
      if (!Number.isFinite(d) || d === 0) return;
      this.bus?.emit('faction:repDelta', { factionId: RIM_FACTION, delta: d, reason });
    },
    _pick(lines, salt = 0) {
      if (!Array.isArray(lines) || !lines.length) return '';
      const flags = this._flags();
      return lines[hash32('lamp-line', salt, flags ? intOr(flags.lamplighter_seq) : 0) % lines.length];
    },
    /** A chronicle row on the session log — the board strip a HUD can read. */
    _logRow(state, t, flags, kind, slot, detail) {
      const id = `ll:${lampSeq(flags)}`;
      t.log.push({ id, kind, slot: slot == null ? null : intOr(slot), detail: detail ?? null, at: num(state.simTime) });
      while (t.log.length > LOG_CAP) t.log.shift();
      this.bus?.emit('lamplighter:logged', { logId: id, kind, slot: slot ?? null, tick: state.tick });
      return id;
    },
    /** Board work counted: deeds raise the keeper tier; the tier scales every purse. */
    _deed(state, flags, kind, refId) {
      flags.lamplighter_deeds = intOr(flags.lamplighter_deeds) + 1;
      const deeds = intOr(flags.lamplighter_deeds);
      const row = lamplighterTierFor(deeds);
      this.bus?.emit('lamplighter:favor', { kind, ref: refId ?? null, deeds, tier: row.tier, tick: state.tick });
      if (row.tier > intOr(flags.lamplighter_tier)) {
        flags.lamplighter_tier = row.tier;
        this.bus?.emit('lamplighter:keeperTier', {
          tier: row.tier, id: row.id, label: row.label, deeds, tick: state.tick,
        });
        this.bus?.emit('toast', { text: `KEEPER STANDING — ${row.label.toUpperCase()}`, kind: 'good', tone: 'info', ttl: 4 });
        this._logText(row.line);
      }
    },
    /** The favor/grudge seam: while spurned the machine still takes the work but
     *  pays nothing — each favor works the debt down one strike instead. Returns
     *  'paid' or 'amends' so callers can answer honestly. */
    _favor(state, flags, kind, refId, { payCr = 0, rep = 0, deed = false } = {}) {
      if (this._spurned(flags)) {
        flags.lamplighter_strikes = Math.max(0, this._strikes(flags) - 1);
        const left = this._strikes(flags);
        this.bus?.emit('lamplighter:amends', { kind, strikesLeft: left, tick: state.tick });
        if (left <= 0) {
          flags.lamplighter_spurned = false;
          this._say(`lamplighter_forgiven_${lampSeq(flags)}`, FORGIVEN_LINE, 8);
          this.bus?.emit('lamplighter:forgiven', { strikesLeft: left, tick: state.tick });
          this._logText(FORGIVEN_LINE);
        } else {
          this._say(`lamplighter_amends_${left}`, AMENDS_LINE, 7);
        }
        return 'amends';
      }
      if (payCr > 0) this._grant(state, payCr * this._tierMult(flags), `lamplighter_${kind}:${refId ?? 'work'}`);
      if (rep !== 0) this._rep(state, rep, `lamplighter_${kind}`);
      if (deed) this._deed(state, flags, kind, refId);
      return 'paid';
    },
    /** The grudge book: a strike files, the regard slips, and past the spurn
     *  threshold the machine answers work with silence on the purse. */
    _strike(state, flags, kind, repDelta = LAMPLIGHTER_WORK.strikeRep) {
      flags.lamplighter_strikes = this._strikes(flags) + 1;
      const strikes = this._strikes(flags);
      this._rep(state, repDelta, `lamplighter_${kind}`);
      this.bus?.emit('lamplighter:grudge', { kind, strikes, tick: state.tick });
      if (strikes >= LAMPLIGHTER_WORK.spurnAfter && flags.lamplighter_spurned !== true) {
        flags.lamplighter_spurned = true; // latch before the emit
        this.bus?.emit('lamplighter:spurned', { strikes, tick: state.tick });
        this._say(`lamplighter_spurn_${strikes}`, SPURN_LINE, 9);
        this._logText(SPURN_LINE);
      } else {
        this._say(`lamplighter_grudge_${strikes}`, this._pick(GRUDGE_LINES, strikes), 7);
      }
    },
    /** Steer a live dynamic body toward a desired velocity — mass·dv through the
     *  impulse membrane, never a vel write. */
    _steer(state, e, desired) {
      const mass = num(e && e.mass, 0);
      if (!e || e.alive === false || !(mass > 0) || !desired) return false;
      const vx = finiteXZ(e.vel) ? e.vel.x : 0;
      const vz = finiteXZ(e.vel) ? e.vel.z : 0;
      const jx = (num(desired.x) - vx) * mass;
      const jz = (num(desired.z) - vz) * mass;
      if (!Number.isFinite(jx) || !Number.isFinite(jz)) return false;
      return queuePhysicsImpulse(e, { x: jx, z: jz }, { tick: num(state.tick) }) === true;
    },
    _seek(from, to, speed) {
      const dx = num(to && to.x) - num(from && from.x);
      const dz = num(to && to.z) - num(from && from.z);
      const d = Math.hypot(dx, dz) || 1;
      const s = num(speed);
      return { x: (dx / d) * s, z: (dz / d) * s };
    },
    /** The two housekeeping passes that keep the rim honest: materialize a lamp on
     *  every lit slot no live lamp occupies (the occupied-seat check — a restored
     *  lamp claiming its slot never gets a twin), and top up the drifting dead
     *  stock for whatever the arms consumed or violence destroyed. Seats and stock
     *  indexes key on data stamps, never entity ids. */
    _housekeep() {
      if (!this.helpers.spawnEntity) return;
      const mask = this._litMask();
      const claimed = new Set();
      for (const lamp of this._lampsAlive()) {
        const slot = seatIndex(lamp.data?.lamplighterSlot);
        if (slot >= 0) claimed.add(slot);
      }
      for (let i = 0; i < LAMPLIGHTER.slotCount; i += 1) {
        if ((mask & (1 << i)) !== 0 && !claimed.has(i)) {
          this.helpers.spawnEntity(lamplighterLampSpec(i));
        }
      }
      const owed = lamplighterDeadOwed(this._deadAlive().length, lamplighterLitCount(mask));
      if (owed <= 0) return;
      const taken = new Set();
      for (const dead of this._deadAlive()) {
        const idx = Number(dead.data?.lamplighterDeadIndex);
        if (Number.isInteger(idx)) taken.add(idx);
      }
      for (let i = 0, spawned = 0; i < LAMPLIGHTER.deadCount && spawned < owed; i += 1) {
        if (taken.has(i)) continue;
        this.helpers.spawnEntity(lamplighterDeadSpec(i));
        spawned += 1;
      }
    },
    _sync() {
      if (!this.state?.story) return;
      if (!this._adventure()) { this._removeOwned(); return; }
      const flags = this._flags();
      const gone = flags?.[LAMPLIGHTER.goneFlag] === true;
      // The robot never respawns once killed — the lamps it planted stay lit anyway;
      // they are the rim's furniture, not the robot's breath.
      if (!gone && !this._robot()) this.helpers.spawnEntity && this.helpers.spawnEntity(lamplighterSpec());
      this._housekeep();
      // One hail per arrival, in-memory like the scale deck's price board: a returning
      // pilot hears the ask again; a finished rim answers with its own line; a name
      // in the dark column hears what it earned.
      if (!gone && !this._announced) {
        this._announced = true;
        const done = lamplighterLitCount(this._litMask()) >= LAMPLIGHTER.slotCount;
        const cold = this._spurned(flags);
        this._say('lamplighter_announce', cold ? SPURN_GREET_LINE
          : done ? LAMPLIGHTER.rimLine : LAMPLIGHTER.announce, 9);
      }
    },

    // ── The ask wire: posted work the machine cannot do itself ─────────────────
    _openAsk(t, kind) {
      for (const a of t.asks) if (a && a.state === 'open' && a.kind === kind) return a;
      return null;
    },
    _postAsk(state, t, flags, kind) {
      const id = `ask:${kind}:${lampSeq(flags)}`;
      const ask = {
        id, kind, postedAt: num(state.simTime),
        expiresAt: num(state.simTime) + LAMPLIGHTER_WORK.askTtlS, state: 'open',
      };
      t.asks.push(ask);
      this.bus?.emit('lamplighter:askPosted', { askId: id, kind, tick: state.tick });
      const lines = kind === 'oil' ? OIL_ASK_LINES : SNUFFER_ASK_LINES;
      this._say(`lamplighter_ask_${id}`, this._pick(lines, lampSeq(flags)), 8);
      this._logRow(state, t, flags, `ask_${kind}`, null, 'posted');
      return ask;
    },
    /** Verify the open ask of a kind — once-only, latched before the emit. The
     *  favor seam scales base pay by the keeper tier itself; callers pass base
     *  rates and the receipt reports what actually moved. */
    _verifyAsk(state, t, flags, kind, how) {
      const a = this._openAsk(t, kind);
      if (!a) return false;
      a.state = 'verified'; a.how = how; a.settledAt = num(state.simTime);
      // Receipt rate reads the pre-deed tier — the same rate the grant inside
      // _favor applies — so a deed that bumps the standing here never double-pays.
      const pay = Math.round(LAMPLIGHTER_WORK.verifyPayCr * this._tierMult(flags));
      const outcome = this._favor(state, flags, `ask_${kind}`, a.id,
        { payCr: LAMPLIGHTER_WORK.verifyPayCr, rep: LAMPLIGHTER_WORK.verifyRep, deed: true });
      this.bus?.emit('lamplighter:askVerified', {
        askId: a.id, kind, how, payCr: outcome === 'paid' ? pay : 0, tick: state.tick,
      });
      this._say(`lamplighter_verified_${a.id}`, this._pick(VERIFY_LINES, lampSeq(flags)), 6);
      this._logRow(state, t, flags, `ask_${kind}`, null, `verified:${how}`);
      this._gcClosed(t.asks, LAMPLIGHTER_WORK.askKeep);
      return true;
    },
    _lapseAsks(state, t, flags, cause) {
      for (const a of t.asks) {
        if (!a || a.state !== 'open') continue;
        a.state = 'lapsed'; a.settledAt = num(state.simTime);
        this.bus?.emit('lamplighter:askLapsed', { askId: a.id, kind: a.kind, cause, tick: state.tick });
        this._logRow(state, t, flags, `ask_${a.kind}`, null, `lapsed:${cause}`);
      }
      this._gcClosed(t.asks, LAMPLIGHTER_WORK.askKeep);
    },
    _gcClosed(rows, keepClosed) {
      let closed = 0;
      for (const r of rows) if (r && r.state !== 'open') closed++;
      let excess = closed - keepClosed;
      for (let i = 0; i < rows.length && excess > 0; i++) {
        const r = rows[i];
        if (r && r.state !== 'open') { rows.splice(i, 1); i--; excess--; }
      }
    },
    _tickAsks(state, t, flags) {
      // Post what the machine cannot do: oil when the tank is thin, bounty while moths feed.
      // A soured ask stays down while the lead it named still stands — the oil ask
      // waits for the tank to recover, the bounty for the dark to call its moths
      // home — otherwise a pilot who ignores the wire would bleed regard forever.
      const oilLow = lampOil(flags) <= LAMPLIGHTER_UPKEEP.oilCap * LAMPLIGHTER_WORK.askAtOilFrac;
      if (!oilLow) flags.lamplighter_oilBan = false;
      if (oilLow && flags.lamplighter_oilBan !== true && !this._openAsk(t, 'oil')) {
        this._postAsk(state, t, flags, 'oil');
      }
      const moths = this._ambient('lamplighterSnuffer').length;
      // The infestation passing re-arms the wire: a new wave is a new lead.
      if (moths === 0) flags.lamplighter_snufferBan = false;
      if (moths > 0 && flags.lamplighter_snufferBan !== true && !this._openAsk(t, 'snuffers')) {
        this._postAsk(state, t, flags, 'snuffers');
      }
      for (const a of [...t.asks]) {
        if (!a || a.state !== 'open') continue;
        // A bounty with nothing left to hunt stands down clean — no sour.
        if (a.kind === 'snuffers' && moths === 0) {
          a.state = 'lapsed'; a.settledAt = num(state.simTime);
          this.bus?.emit('lamplighter:askLapsed', {
            askId: a.id, kind: a.kind, cause: 'clear', tick: state.tick,
          });
          this._say(`lamplighter_lapse_${a.id}`, ASK_LAPSED_LINE, 5);
          this._logRow(state, t, flags, `ask_${a.kind}`, null, 'lapsed:clear');
          continue;
        }
        if (num(state.simTime) < num(a.expiresAt)) continue;
        a.state = 'soured'; a.settledAt = num(state.simTime);
        if (a.kind === 'oil') flags.lamplighter_oilBan = true; // durable — survives the save
        if (a.kind === 'snuffers') flags.lamplighter_snufferBan = true; // the same durable snub
        if (this._paidOnce(flags, `sour:${a.id}`)) {
          this._rep(state, LAMPLIGHTER_WORK.sourRep, 'lamplighter_ask_soured');
        }
        this.bus?.emit('lamplighter:askSoured', { askId: a.id, kind: a.kind, tick: state.tick });
        this._say(`lamplighter_sour_${a.id}`, this._pick(SOUR_LINES, lampSeq(flags)), 6);
        this._logRow(state, t, flags, `ask_${a.kind}`, null, 'soured');
      }
      this._gcClosed(t.asks, LAMPLIGHTER_WORK.askKeep);
    },

    // ── Lamp upkeep: burn, gutter, refill ──────────────────────────────────────
    /** A lamp's charge empties — the seat goes dark honestly: the bit clears, the
     *  body leaves, and the hole waits for the next buoy like any vandalized lamp. */
    _gutterSlot(state, t, flags, slot, cause) {
      // A seat goes dark exactly once — the transition is the latch. A stale
      // census seat (a second snuffer latched mid-pass, a kill the burn pass
      // already filed) must not re-fire the gutter, the stat, or the chronicle.
      // The bound runs first: a seat name outside the lane is nobody's seat.
      slot = seatIndex(slot);
      if (slot < 0 || (this._litMask() & (1 << slot)) === 0) return;
      const lamp = this._lampsBySlot().get(slot) || null;
      flags[LAMPLIGHTER.litFlag] = lamplighterMaskClear(this._litMask(), slot);
      lampCharges(flags)[slot] = 0;
      if (lamp) this.helpers?.removeEntity?.(lamp.id, { reason: 'lamplighter_guttered' });
      const lit = lamplighterLitCount(flags[LAMPLIGHTER.litFlag]);
      const stats = lampStats(flags); stats.guttered += 1;
      this.bus?.emit('lamplighter:guttered', { slot, cause, lit, tick: state.tick });
      this._say(`lamplighter_gutter_${slot}_${lit}_${stats.guttered}`,
        cause === 'siphoned' ? SIPHONED_LINE : this._pick(GUTTER_LINES, slot), 7);
      this._logRow(state, t, flags, 'guttered', slot, cause);
    },
    _tickBurn(state, t, flags, dt) {
      const mask = this._litMask();
      if (!mask) return;
      const seats = this._lampsBySlot();
      const charge = lampCharges(flags);
      for (let i = 0; i < LAMPLIGHTER.slotCount; i += 1) {
        if ((mask & (1 << i)) === 0) continue;
        const lamp = seats.get(i);
        if (!lamp) continue; // a lit seat still materializing burns nothing yet
        charge[i] = num(charge[i]) - LAMPLIGHTER_UPKEEP.burnPerLampPerS * dt;
        if (lamp.data) lamp.data.lampCharge = Math.max(0, charge[i]); // scanner readout
        if (charge[i] <= 0) this._gutterSlot(state, t, flags, i, 'burned');
      }
    },

    // ── The ambient rim: oil pods, wayfarers, snuffers ─────────────────────────
    _tickAmbient(state, t, flags, robot, dt) {
      if (state.mode !== 'flight') return;
      const mask = this._litMask();
      const lit = lamplighterLitCount(mask);
      const seats = this._lampsBySlot();

      // The consortium's drops: oil pods land on the drop ring while the tank runs low.
      const pods = this._ambient('lamplighterOil');
      if (lampOil(flags) <= LAMPLIGHTER_UPKEEP.oilCap * LAMPLIGHTER_UPKEEP.podBelowFrac
          && pods.length < LAMPLIGHTER_UPKEEP.podCap
          && num(state.simTime) >= num(t.nextPodAt)) {
        const n = lampSeq(flags);
        t.nextPodAt = num(state.simTime) + LAMPLIGHTER_UPKEEP.podPeriodS
          + frac('lamp-pod-gap', n) * LAMPLIGHTER_UPKEEP.podJitterS;
        const pod = this.helpers.spawnEntity ? this.helpers.spawnEntity(lamplighterOilPodSpec(n)) : null;
        if (pod) {
          this.bus?.emit('lamplighter:oilPodDropped', { podId: pod.id, tick: state.tick });
          this._say(`lamplighter_podd_${n}`, POD_DROP_LINE, 6);
        }
      }

      // The lit route: wayfarers come down the lane while any lamp stands.
      const ways = this._ambient('lamplighterWayfarer');
      if (lit >= LAMPLIGHTER_TRAFFIC.litMin && ways.length < LAMPLIGHTER_TRAFFIC.cap
          && num(state.simTime) >= num(t.nextWayfarerAt)) {
        let topLit = -1;
        for (let i = LAMPLIGHTER.slotCount - 1; i >= 0; i -= 1) {
          if ((mask & (1 << i)) !== 0) { topLit = i; break; }
        }
        const n = lampSeq(flags);
        t.nextWayfarerAt = num(state.simTime) + LAMPLIGHTER_TRAFFIC.basePeriodS / Math.max(1, lit)
          + frac('lamp-way-gap', n) * LAMPLIGHTER_TRAFFIC.jitterS;
        const w = this.helpers.spawnEntity
          ? this.helpers.spawnEntity(lamplighterWayfarerSpec(topLit, n)) : null;
        if (w) {
          this.bus?.emit('lamplighter:wayfarerInbound', { wayfarerId: w.id, topSlot: topLit, tick: state.tick });
          this._say(`lamplighter_wayin_${n}`, WAYFARER_IN_LINE, 6);
        }
      }
      for (const w of ways) this._walkWayfarer(state, t, flags, w, lit);

      // The dark pushes back: snuffers hunt the light past the threshold.
      const snuffs = this._ambient('lamplighterSnuffer');
      if (lit >= LAMPLIGHTER_SNUFFERS.litMin && snuffs.length < LAMPLIGHTER_SNUFFERS.cap
          && num(state.simTime) >= num(t.nextSnufferAt)) {
        const n = lampSeq(flags);
        t.nextSnufferAt = num(state.simTime)
          + LAMPLIGHTER_SNUFFERS.periodS / Math.max(1, lit - LAMPLIGHTER_SNUFFERS.litMin + 1)
          + frac('lamp-snuf-gap', n) * LAMPLIGHTER_SNUFFERS.jitterS;
        const e = this.helpers.spawnEntity ? this.helpers.spawnEntity(lamplighterSnufferSpec(n)) : null;
        if (e) {
          this.bus?.emit('lamplighter:snufferInbound', { snufferId: e.id, tick: state.tick });
          this._say(`lamplighter_snufin_${n}`, SNUFFER_IN_LINE, 6);
        }
      }
      for (const e of snuffs) this._huntSnuffer(state, t, flags, e, seats, dt);
    },

    /** A wayfarer walks its route: the lit slots down to the post, where the due
     *  pays the keeper's share once — the latch rides the body itself. If the
     *  lane dies under it, it turns for the rim and leaves the census. */
    _walkWayfarer(state, t, flags, w, lit) {
      const wd = w.data || (w.data = {});
      if (lit <= 0) {
        this._steer(state, w, this._seek(LAMPLIGHTER.post, w.pos, LAMPLIGHTER_SNUFFERS.fleeSpeed));
        if (distXZ(w.pos, LAMPLIGHTER.post)
            > LAMPLIGHTER.slotSpacing * LAMPLIGHTER.slotCount + LAMPLIGHTER_TRAFFIC.leaveMargin) {
          this.helpers?.removeEntity?.(w.id, { reason: 'lamplighter_wayfarer_turned' });
          this.bus?.emit('lamplighter:wayfarerTurned', { wayfarerId: w.id, tick: state.tick });
          this._say(`lamplighter_turned_${w.id}`, WAYFARER_TURNED_LINE, 6);
        }
        return;
      }
      const route = Array.isArray(wd.lampRoute) ? wd.lampRoute : [];
      const wp = intOr(wd.lampWp);
      const target = wp < route.length ? lamplighterSlotSpot(route[wp]) : LAMPLIGHTER.post;
      if (distXZ(w.pos, target) <= LAMPLIGHTER_TRAFFIC.arriveR) {
        if (wp < route.length) { wd.lampWp = wp + 1; return; }
        if (wd.lampPaid !== true) {
          wd.lampPaid = true; // latch before the emit — the due pays once, on this body
          const outcome = this._favor(state, flags, 'toll', w.id,
            { payCr: LAMPLIGHTER_TRAFFIC.tollTipCr, rep: LAMPLIGHTER_TRAFFIC.tollRep, deed: false });
          const stats = lampStats(flags); stats.ways += 1;
          this.bus?.emit('lamplighter:wayfarerArrived', {
            wayfarerId: w.id,
            // deed:false never bumps the tier, so the post-favor read is the
            // granted rate — and a spurned purse reports zero honestly.
            tollCr: outcome === 'paid'
              ? Math.round(LAMPLIGHTER_TRAFFIC.tollTipCr * this._tierMult(flags)) : 0,
            tick: state.tick,
          });
          this._say(`lamplighter_waydue_${stats.ways}`, WAYFARER_PAID_LINE, 5);
          this._logRow(state, t, flags, 'wayfarer', null, 'arrived');
        }
        this.helpers?.removeEntity?.(w.id, { reason: 'lamplighter_wayfarer_arrived' });
        return;
      }
      this._steer(state, w, this._seek(w.pos, target, LAMPLIGHTER_TRAFFIC.speed));
    },

    /** A snuffer hunts the nearest live lamp; latched in the siphon ring it drinks
     *  the seat's charge faster than the burn. Nothing lit — it flees the rim. */
    _huntSnuffer(state, t, flags, e, seats, dt) {
      const ed = e.data || (e.data = {});
      let target = null, best = Infinity;
      for (const lamp of seats.values()) {
        if (!lamp || lamp.alive === false) continue; // a stale seat map can hold a corpse
        const dx = num(lamp.pos.x) - num(e.pos.x), dz = num(lamp.pos.z) - num(e.pos.z);
        const d2 = dx * dx + dz * dz;
        if (d2 < best) { best = d2; target = lamp; }
      }
      if (!target) {
        this._steer(state, e, this._seek(LAMPLIGHTER.post, e.pos, LAMPLIGHTER_SNUFFERS.fleeSpeed));
        if (distXZ(e.pos, LAMPLIGHTER.post)
            > LAMPLIGHTER.slotSpacing * LAMPLIGHTER.slotCount + LAMPLIGHTER_SNUFFERS.leaveMargin) {
          this.helpers?.removeEntity?.(e.id, { reason: 'lamplighter_snuffer_left' });
        }
        return;
      }
      const slot = seatIndex(target.data?.lamplighterSlot);
      if (Math.sqrt(best) > LAMPLIGHTER_SNUFFERS.siphonR) {
        this._steer(state, e, this._seek(e.pos, target.pos, LAMPLIGHTER_SNUFFERS.speed));
        return;
      }
      this._steer(state, e, { x: 0, z: 0 }); // latched: damp against the lamp
      if (slot < 0) return;
      const charge = lampCharges(flags);
      charge[slot] = num(charge[slot]) - LAMPLIGHTER_SNUFFERS.siphonPerS * dt;
      if (target.data) target.data.lampCharge = Math.max(0, charge[slot]);
      if (num(state.simTime) >= num(ed.lampSipAt, -Infinity)) {
        ed.lampSipAt = num(state.simTime) + LAMPLIGHTER_SNUFFERS.siphonBeatS;
        this.bus?.emit('lamplighter:lampSiphoned', {
          snufferId: e.id, slot, charge: Math.max(0, charge[slot]), tick: state.tick,
        });
      }
      if (charge[slot] <= 0) this._gutterSlot(state, t, flags, slot, 'siphoned');
    },

    // ── The pilot's service: sell it cells, tend its lamps ─────────────────────
    /** One fuel cell out of the hold — the canonical cargo writer, guarded so a
     *  fixture without a hold simply sells nothing. */
    _takeCell(state) {
      const cargo = state && state.player && state.player.cargo;
      if (!isObj(cargo) || !isObj(cargo.items)) return 0;
      if (sellableCargoQty(state, FUEL_CELL) < 1) return 0;
      return removeCargo(state, FUEL_CELL, 1);
    },
    _tickPlayerService(state, t, flags, robot) {
      const playerId = state.playerId ?? state.player?.id;
      const player = playerId != null ? this._entity(playerId) : null;
      // A corpse parked in the ring is not a pilot — the hold is not a fuel pump.
      if (!player || player.alive === false || !finiteXZ(player.pos)) return;
      // The purse stays shut while a name sits in the dark column — no fuel, no tips.
      if (this._spurned(flags)) return;
      const playerR = num(player.radius);
      // Parked in the arm ring: the machine draws a cell a beat and pays for it.
      if (num(state.simTime) >= num(t.cellNextAt)
          && distXZ(player.pos, robot.pos) <= LAMPLIGHTER.armRadius + playerR
          && lampOil(flags) <= LAMPLIGHTER_UPKEEP.oilCap - 1
          && this._takeCell(state) > 0) {
        t.cellNextAt = num(state.simTime) + LAMPLIGHTER_UPKEEP.cellBeatS;
        lampOilAdd(flags, LAMPLIGHTER_UPKEEP.cellOilEach);
        const stats = lampStats(flags); stats.cells += 1;
        const deed = stats.cells % LAMPLIGHTER_UPKEEP.cellsPerDeed === 0;
        this._favor(state, flags, 'cell', `cell:${stats.cells}`,
          { payCr: LAMPLIGHTER_UPKEEP.cellPayCr, rep: 0, deed });
        this.bus?.emit('lamplighter:oilSold', {
          cells: stats.cells, oil: lampOil(flags), tick: state.tick,
        });
        this._say(`lamplighter_cells_${stats.cells}`, SOLD_LINE, 5);
        this._verifyAsk(state, t, flags, 'oil', 'cells');
        this._logRow(state, t, flags, 'oiled', null, 'cells');
      }
      // Beside a low lamp: a cell straight to the wick, on the same beat.
      if (num(state.simTime) < num(t.tendNextAt)) return;
      const charge = lampCharges(flags);
      const seats = this._lampsBySlot();
      for (const [slot, lamp] of seats) {
        if (charge[slot] >= LAMPLIGHTER_UPKEEP.chargePerLamp * LAMPLIGHTER_TEND.lowFrac) continue;
        if (distXZ(player.pos, lamp.pos) > LAMPLIGHTER_TEND.tendR + playerR) continue;
        if (this._takeCell(state) <= 0) break;
        t.tendNextAt = num(state.simTime) + LAMPLIGHTER_TEND.tendBeatS;
        charge[slot] = Math.min(LAMPLIGHTER_UPKEEP.chargePerLamp,
          charge[slot] + LAMPLIGHTER_TEND.cellLampCharge);
        const stats = lampStats(flags); stats.tended += 1;
        this._favor(state, flags, 'tend', `slot:${slot}`,
          { payCr: LAMPLIGHTER_TEND.tendTipCr, rep: LAMPLIGHTER_TEND.tendRep, deed: true });
        this.bus?.emit('lamplighter:lampTended', {
          lampId: lamp.id, slot, charge: charge[slot], tick: state.tick,
        });
        this._say(`lamplighter_tend_${slot}_${stats.tended}`, TEND_LINE, 5);
        this._logRow(state, t, flags, 'tended', slot, null);
        break;
      }
    },

    // ── The arm ring: one settled delivery per census ──────────────────────────
    /** An oil pod the arms will take — flagged stock of the drop, physically
     *  present, and settled inside the ring. Same door the buoys use. */
    _podArmable(e, post) {
      if (!e || e.alive === false || e.data?.lamplighterOil !== true) return false;
      if (!finiteXZ(e.pos) || !finiteXZ(post)) return false;
      const speed = finiteXZ(e.vel) ? Math.hypot(e.vel.x, e.vel.z) : 0;
      if (speed > 30) return false;
      return Math.hypot(e.pos.x - post.x, e.pos.z - post.z) <= LAMPLIGHTER.armRadius;
    },
    _acceptPod(state, t, flags, e) {
      const key = `pod:${e.id}:${e.occupantGeneration ?? 0}`;
      const fresh = this._paidOnce(flags, key); // latch before any emit
      this.helpers?.removeEntity?.(e.id, { reason: 'lamplighter_oiled' });
      if (!fresh) return; // a recycled body carrying an old id pays nothing twice
      lampOilAdd(flags, LAMPLIGHTER_UPKEEP.podOil);
      const stats = lampStats(flags); stats.pods += 1;
      this._favor(state, flags, 'oil', key,
        { payCr: LAMPLIGHTER_UPKEEP.podPayCr, rep: LAMPLIGHTER_UPKEEP.podRep, deed: true });
      this.bus?.emit('lamplighter:oiled', { podId: e.id, oil: lampOil(flags), tick: state.tick });
      this._say(`lamplighter_oiled_${stats.pods}`, OILED_LINE, 6);
      this._verifyAsk(state, t, flags, 'oil', 'pod');
      this._logRow(state, t, flags, 'oiled', null, 'pod');
    },
    _acceptBuoy(state, t, flags, e, mask, slot) {
      this.helpers?.removeEntity?.(e.id, { reason: 'lamplighter_planted' });
      flags[LAMPLIGHTER.litFlag] = lamplighterMaskSet(mask, slot);
      if (this.helpers.spawnEntity) this.helpers.spawnEntity(lamplighterLampSpec(slot));
      // The wick draws its charge from the tank; a dry tank still plants — the
      // wick carries its own first burn and gutters early for it.
      const charge = lampCharges(flags);
      let drawn = Math.min(lampOil(flags), LAMPLIGHTER_UPKEEP.chargePerLamp);
      if (drawn < LAMPLIGHTER_UPKEEP.pilotCharge) drawn = LAMPLIGHTER_UPKEEP.pilotCharge;
      charge[slot] = drawn;
      lampOilAdd(flags, -drawn);
      const stats = lampStats(flags); stats.planted += 1;
      const lit = lamplighterLitCount(flags[LAMPLIGHTER.litFlag]);
      // A slot the pilot put out replants cold — the light comes back; the cheer
      // and the credit do not. It is still work: while spurned it works the debt.
      const cold = (this._snuffed(flags) & (1 << slot)) !== 0;
      this.bus?.emit('lamplighter:planted', {
        slot, lit, charge: drawn, coldReplant: cold, tick: state.tick,
      });
      if (lit >= LAMPLIGHTER.slotCount) {
        flags[LAMPLIGHTER.rimFlag] = true;
        this._say('lamplighter_rim', LAMPLIGHTER.rimLine, 9);
        if (this._paidOnce(flags, 'rim')) {
          // The receipt reports what _favor actually grants — the pre-deed tier,
          // and nothing while the purse is spurned (same convention as askVerified).
          const purse = Math.round(LAMPLIGHTER_PAY.rimPurseCr * this._tierMult(flags));
          const outcome = this._favor(state, flags, 'rim', 'rim',
            { payCr: LAMPLIGHTER_PAY.rimPurseCr, rep: LAMPLIGHTER_PAY.rimRep, deed: true });
          this.bus?.emit('lamplighter:rimPaid', { payCr: outcome === 'paid' ? purse : 0, tick: state.tick });
        }
      } else if (cold) {
        this._say(`lamplighter_cold_${slot}_${lit}`, COLD_REPLANT_LINE, 6);
        this._favor(state, flags, 'replant', `slot:${slot}`, { payCr: 0, rep: 0, deed: false });
      } else {
        this._say(`lamplighter_lit_${slot}_${lit}`, LAMPLIGHTER.litLine, 6);
        const bonus = lit === 1 && this._paidOnce(flags, 'first') ? LAMPLIGHTER_PAY.firstLightCr : 0;
        this._favor(state, flags, 'plant', `slot:${slot}`,
          { payCr: LAMPLIGHTER_PAY.plantPayCr + bonus, rep: LAMPLIGHTER_PAY.plantRep, deed: true });
      }
      this._logRow(state, t, flags, 'planted', slot, cold ? 'cold_replant' : null);
    },
    _acceptArms(state, t, flags, robot) {
      const mask = this._litMask();
      const dark = lamplighterFirstDark(mask);
      for (const e of state.entityList || []) {
        if (!e || e === robot) continue;
        if (this._podArmable(e, robot.pos)) { this._acceptPod(state, t, flags, e); return; }
        if (dark < 0 || !lamplighterArmable(e, robot.pos)) continue;
        this._acceptBuoy(state, t, flags, e, mask, dark);
        return; // one delivery per census — the rest of the stock waits its turn
      }
    },

    /** Kill reports read the victim by id — the emitter marks it dead before the bus
     *  hears it, so a live-only scan never sees its own corpse. A dead lamp clears its
     *  seat bit and spends its charge (the light really goes out; the stock replaces
     *  the raw material). A lamp put out by the pilot's own guns files a grudge and
     *  marks the seat — it will replant cold. A dead snuffer pays the posted bounty
     *  to the pilot's hand, once per body. A dead wayfarer on the lit lane is a
     *  murder the route files. A dead robot sets the durable gone flag, lapses the
     *  wire, and files its own last line, once. */
    _onKilled(p) {
      if (!this._adventure() || !p) return;
      const victim = this._entity(p.id);
      // Every entity:killed emitter fires after alive=false — a live lookup means
      // the wire's id was recycled onto a new body and this is a stale or
      // duplicated receipt, not a death (gravedigger's own guard). Its tags would
      // settle the new body's seats and debts, never the victim's.
      if (!victim || !victim.data || victim.alive !== false) return;
      const flags = this._flags();
      const state = this.state;
      const playerId = state?.playerId ?? state?.player?.id;
      const byPlayer = p.killerId != null && p.killerId === playerId;
      if (victim.data.lamplighter === true) {
        if (flags && flags[LAMPLIGHTER.goneFlag] !== true) {
          flags[LAMPLIGHTER.goneFlag] = true;
          this._say('lamplighter_gone', LAMPLIGHTER.goneLine, 9);
          if (this._adventure()) this._lapseAsks(state, ensureLamplighterState(state), flags, 'gone');
        }
        return;
      }
      if (victim.data.lamplighterLamp === true) {
        const slot = seatIndex(victim.data.lamplighterSlot);
        if (flags && slot >= 0) {
          // A seat already replanted to a live lamp is not this corpse's to
          // darken — a stale receipt never puts out the body that filled the hole.
          const seatHeld = this._lampsBySlot().has(slot);
          const wasLit = (this._litMask() & (1 << slot)) !== 0;
          if (wasLit && !seatHeld) {
            flags[LAMPLIGHTER.litFlag] = lamplighterMaskClear(this._litMask(), slot);
            lampCharges(flags)[slot] = 0;
            // The grudge files once per body — a re-reported kill rides the
            // same id:generation once-key the bounty book uses.
            if (byPlayer && this._paidOnce(flags, `lampsnuffed:${p.id}:${victim.occupantGeneration ?? 0}`)) {
              flags.lamplighter_snuffed = this._snuffed(flags) | (1 << slot);
              this._strike(state, flags, 'snuffed');
              this._logRow(state, ensureLamplighterState(state), flags, 'snuffed', slot, null);
            }
          }
        }
        return;
      }
      if (victim.data.lamplighterSnuffer === true) {
        if (!flags) return;
        const t = ensureLamplighterState(state);
        // A body goes down once — the report rides the id:generation key and the
        // first wire to file settles the stat, the emit, and the chronicle.
        if (!this._paidOnce(flags, `snufferdown:${p.id}:${victim.occupantGeneration ?? 0}`)) return;
        const stats = lampStats(flags); stats.downs += 1;
        let bounty = 0;
        if (byPlayer) {
          const purse = Math.round(LAMPLIGHTER_SNUFFERS.bountyCr * this._tierMult(flags));
          const outcome = this._favor(state, flags, 'bounty', `snuffer:${p.id}`,
            { payCr: LAMPLIGHTER_SNUFFERS.bountyCr, rep: LAMPLIGHTER_SNUFFERS.bountyRep, deed: true });
          bounty = outcome === 'paid' ? purse : 0; // the receipt reports what moved
          this._verifyAsk(state, t, flags, 'snuffers', 'cooled');
          this._say(`lamplighter_snufdown_${stats.downs}`, this._pick(SNUFFER_DOWN_LINES, stats.downs), 6);
        }
        this.bus?.emit('lamplighter:snufferDowned', {
          snufferId: p.id, killerId: p.killerId ?? null, byPlayer, bountyCr: bounty, tick: state.tick,
        });
        this._logRow(state, t, flags, 'snuffer_downed', null, byPlayer ? 'player' : 'other');
        return;
      }
      if (victim.data.lamplighterWayfarer === true) {
        if (!flags) return;
        // The route loses the hauler once — a replayed or second-wire report for
        // the same body counts nothing twice, whichever killerId it carried.
        if (!this._paidOnce(flags, `waylost:${p.id}:${victim.occupantGeneration ?? 0}`)) return;
        const stats = lampStats(flags); stats.lost += 1;
        this.bus?.emit('lamplighter:wayfarerLost', {
          wayfarerId: p.id, killerId: p.killerId ?? null, byPlayer, tick: state.tick,
        });
        if (byPlayer) {
          this._strike(state, flags, 'wayfarer', LAMPLIGHTER_WORK.wayfarerKillRep);
          this._say(`lamplighter_waylost_${stats.lost}`, WAYFARER_KILLED_LINE, 7);
        }
        this._logRow(state, ensureLamplighterState(state), flags, 'wayfarer_lost', null,
          byPlayer ? 'player' : 'other');
      }
    },
    /** The calendar census: walk the robot home if it was shoved off the post
     *  (impulse-membrane steering, never a vel write), keep the seats and the stock
     *  honest, burn the lit seats down, post and expire the wire, run the ambient
     *  rim the light draws, take the pilot's oil and tending, and accept the first
     *  settled delivery inside the arm ring — a buoy plants the lowest dark slot,
     *  an oil pod feeds the tank. One delivery per pass, whichever came first. */
    update(dt, state) {
      const s = state || this.state;
      if (!s || !this._adventure()) return;
      const t = ensureLamplighterState(s);
      this._housekeep();
      const robot = this._robot();
      if (!robot || !robot.pos) { this._orphanAmbient(); return; }
      const dv = lamplighterDriftHome(robot);
      if (dv && robot.mass > 0) {
        queuePhysicsImpulse(robot, { x: dv.x * robot.mass, z: dv.z * robot.mass }, { tick: s.tick });
      }
      const flags = this._flags();
      if (!flags) return;
      // The gone flag owns the machine: a flagged-out post owes no wire, no
      // ambient rim, and no arm accepts — the lamps it planted stay lit anyway.
      if (flags[LAMPLIGHTER.goneFlag] === true) { this._orphanAmbient(); return; }
      const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
      this._tickBurn(s, t, flags, step);
      this._tickAsks(s, t, flags);
      this._tickAmbient(s, t, flags, robot, step);
      this._tickPlayerService(s, t, flags, robot);
      this._acceptArms(s, t, flags, robot);
    },
  };
}

export const lamplighter = createLamplighter();
