// W-SHIFT (row 506, 03 §4.3): TALLYHO / CN-2 — the scoreboard robot looking for a crowd.
// A marked scoreboard hull posts over the Rhea Cinder fight ground and rates every
// player kill inside its crowd ring — streaks inside the window score higher, and every
// few rated kills a Pitborn spectator hull drifts in to park at the rail while the board
// runs. Fight where it can watch and the sector fills with an audience.
//
// WHAT THIS OWNS — the board body and its spectator hulls (one-off event seams: init /
// deferred sector-enter / save:loaded / newGame), the rolling streak and rating calls,
// the durable score in story flags, and the spectator rail. Kills stay combat's — the
// board only reads the report.
//
// THE HUNT — tally-ho is the call on spotted quarry, and the board runs it for real:
//   · SPOTTING — a hostile hull inside the crowd ring gets called: the board posts a
//     timed hunt on it and stamps the hull. The purse is bigger for marks that have
//     slipped before — the rail remembers.
//   · QUARRY MEMORY — every mark the board has seen files a durable sighting row:
//     seen / bagged / escaped / poached. A mark with escapes turns wary — its next
//     hunt window is shorter and it bolts almost at once.
//   · FLIGHT — a hunted hull learns to run: after a few seconds being called it
//     bolts for the ring edge, and if it crosses the escape radius the call slips.
//   · RIVAL GUNS — an open hunt left standing draws a licensed Pitborn gun off the
//     rail. It chases the quarry; contact held long enough poaches the kill and the
//     purse goes to the rail, not the pilot. Cooling a licensed gun costs standing.
//   · THE BOUNTY BOARD — standing wants post on a clock: named wants on marks that
//     got away (escalating price) and open wants on any hostile hull in the ring. A
//     player kill in sight claims the best matching want once.
//   · CALLED SHOTS — the pilot may stake a posted hunt; an in-ring finish before the
//     slip pays the stake back doubled on top of the purse. Any other end loses it.
//   · HUNTER STANDING — hunts bagged and wants claimed are deeds; the tier scales
//     every purse the board posts.
//
// Deterministic: every clock reads simTime, every draw reads hash32 over ledger seq;
// state lives in plain JSON under state.tallyho and normalizes on read; spawned hull
// refs are bound by entity id + occupantGeneration + an ownership tag in data.* so a
// recycled id can never collect on a body it is not. Money moves only through
// economy:grantCredits / economy:chargeCredits; standing only through
// faction:repDelta; motion only through queuePhysicsImpulse; once-only stamps latch
// before their emits.
//
// THE CLOCK — the hunt runs off two drivers that never overlap: update() ticks
// the loop on the 2 Hz calendar cohort, and a throttled event pump
// (entity:spawned / entity:killed / sector entry) carries the same clocks for
// burst responsiveness between beats. The pump stamps a simTime watermark and
// yields while a real tick is fresh; every deadline reads simTime, so a sparse
// beat still lands the honest verdict — late notice, never a wrong one.
import { TALLYHO } from '../data/tallyho.js';
import {
  tallyhoRateableKill, tallyhoStreak, tallyhoRateLine, tallyhoScoreFor, tallyhoSpectatorSeat,
  tallyhoInSight,
} from '../characters/tallyhoRules.js';
import { deferSectorEnterMaterialization } from '../core/sectorEnterDefer.js';
import { hash32 } from '../core/rng.js';
import { queuePhysicsImpulse } from '../core/physicsAuthority.js';

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const intOr = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n | 0 : d; };
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v, d = '') => (typeof v === 'string' && v ? v : d);
const frac = (...args) => (hash32(...args) >>> 0) / 4294967296; // deterministic [0,1)
const dist2 = (ax, az, bx, bz) => { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; };

// The rail is Pitborn — the crowd that shows up is their standing call.
const RAIL_FACTION = 'faction_pitborn';

// ── The hunt: spotted quarry, timed calls, the bolt ────────────────────────────
export const TALLYHO_HUNT = Object.freeze({
  scanBeatS: 0.8,           // the board's eye blinks — one candidacy sweep per beat
  pumpMinS: 0.25,           // event beats drive the hunt clock no faster than this
  maxOpenHunts: 3,          // the board runs at most this many calls at once
  huntWindowS: 75,          // an open call slips after this
  waryWindowS: 45,          // a mark that has slipped before gets a shorter call
  waryAfterEscapes: 1,      // one recorded escape marks the strain wary
  reHuntCooldownS: 60,      // a hull the call just closed on is not re-marked inside this
  fleeAfterS: 16,           // a hunted hull bolts after this long under call
  waryFleeAfterS: 4,        // a wary hull bolts almost at once
  fleeSpeed: 46,            // bolt velocity out of the ring
  waryFleeSpeed: 66,
  escapeRadius: 1650,       // this far from the post the quarry has run the ring
  bountyBaseCr: 340,        // posted purse before escalation/standing (× tier mult)
  escapeEscalationCr: 120,  // each recorded escape on the mark raises the purse
  outOfSightPayFrac: 0.5,   // downed outside the crowd ring still pays — halved
  huntRep: 3,               // rail standing for a called kill
  downedRep: 1,
  huntLogKeep: 14,
});

// ── The bounty board: standing wants posted on a clock ─────────────────────────
export const TALLYHO_BOUNTY = Object.freeze({
  firstBountyS: 34,         // the first want lands quickly — the rail is eager
  bountyPeriodS: 110,
  bountyJitterS: 45,
  bountyTtlS: 480,
  maxOpen: 3,
  markedShare: 0.7,         // odds a new want names a remembered mark vs any hostile
  openBountyCr: 220,        // 'any hostile hull in the ring' flat price (× tier mult)
  markBountyBaseCr: 300,    // a named mark's standing price before escalation
  markBountyEscalationCr: 90, // each recorded escape on the mark raises the want
  claimRep: 2,
});

// ── Rival guns: the rail fields licensed hunters on standing calls ─────────────
export const TALLYHO_RIVAL = Object.freeze({
  rivalDelayS: 20,          // a call this old with no kill draws a hired gun
  rivalCap: 2,              // live rail guns at once
  rivalHull: 140, rivalRadius: 13, rivalMass: 30,
  spawnMargin: 180,         // ring-edge standoff for the arrival
  chaseSpeed: 54,
  killR: 90,                // contact range on the quarry
  killS: 6,                 // contact seconds to poach the kill
  leaveSpeed: 60, leaveMargin: 500,
  rivalKillRep: -5,         // cooling a licensed gun costs the rail's regard
});

// ── Called shots: stake your own hunt ──────────────────────────────────────────
export const TALLYHO_BET = Object.freeze({
  stakeCr: 150,
  payoutMult: 2,            // an in-ring finish pays the stake back doubled
});

// ── Hunter standing: deeds into the tier the board posts under ─────────────────
export const TALLYHO_HUNTER_TIERS = Object.freeze([
  { tier: 0, marks: 0,  id: 'unrated',  label: 'Unrated',          payMult: 1.0,
    line: 'The board does not know your name yet.' },
  { tier: 1, marks: 2,  id: 'spotted',  label: 'Spotted',          payMult: 1.1,
    line: 'The rail leans in when you take the ring.' },
  { tier: 2, marks: 6,  id: 'called',   label: 'Called Shot',      payMult: 1.25,
    line: 'CN-2 calls your hunts before you fire.' },
  { tier: 3, marks: 12, id: 'favorite', label: 'Crowd Favorite',   payMult: 1.4,
    line: 'The Pitborn rail bets on you now.' },
  { tier: 4, marks: 20, id: 'apex',     label: 'Apex of the Ring', payMult: 1.6,
    line: 'Quarry learns your engine note. They run sooner.' },
]);

export function tallyhoTierFor(marks) {
  const m = Math.max(0, intOr(marks));
  let row = TALLYHO_HUNTER_TIERS[0];
  for (const t of TALLYHO_HUNTER_TIERS) if (m >= t.marks) row = t;
  return row;
}

// ── Board text: the hunt call and the want sheet ───────────────────────────────
const HUNT_LINES = Object.freeze([
  'TALLY-HO — {mark} ON THE BOARD. {secs} SECONDS.',
  'MARK SEEN: {mark}. DOWN IT WHERE THE RAIL CAN SEE.',
  '{mark} IN THE RING — THE CALL IS OPEN. {secs} ON THE CLOCK.',
]);
const WARY_HUNT_LINE = 'THE ONE THAT GOT AWAY — {mark} IS BACK. IT WILL BOLT EARLY.';
const SLIP_LINES = Object.freeze([
  '{mark} RAN THE RING. THE WIRE KEEPS THE MARK.',
  'COLD — {mark} SLIPPED THE CALL. THE RAIL REMEMBERS.',
]);
const POACH_LINES = Object.freeze([
  'THE GUN GOT THERE FIRST — {mark} PAYS THE RAIL.',
  '{mark} DOWN TO A LICENSED GUN. THE CALL GOES TO THE HOUSE.',
]);
const BOUNTY_LINES = Object.freeze([
  'STANDING WANT — {mark}. {cr} CR IN THE RING.',
  'THE BOARD WANTS {mark} DOWN WHERE IT CAN SEE. {cr} CR.',
]);
const OPEN_BOUNTY_LINES = Object.freeze([
  'OPEN WANT — ANY HOSTILE HULL IN THE RING. {cr} CR.',
  'THE RAIL PAYS {cr} CR FOR A HOSTILE DOWN IN THE RING.',
]);
const PAID_LINE = 'THE CALL STANDS — {mark} DOWN. THE RAIL PAYS.';
const DOWNED_LINE = '{mark} DOWN OUT OF SIGHT — HALF PURSE.';
const RIVAL_DOWNED_LINE = 'YOU COOLED A LICENSED GUN. THE RAIL BOOS.';
const BET_WIN_LINE = 'THE CALLED SHOT PAYS — DOUBLE BACK ON THE STAKE.';

const MAX_SIGHTINGS = 32;
const MAX_HUNT_ROWS = 24;
const MAX_RIVAL_ROWS = 16;
const MAX_BOUNTY_ROWS = 12;
const LOG_CAP = 20;
const PAID_STAMPS_CAP = 96;

/** The quarry's mark: the stable name the board remembers a stripe of hull by. */
export function tallyhoMarkOf(e) {
  const d = (e && e.data) || {};
  const raw = d.callsign || d.name || d.shipClass || (e && e.factionId) || (e && e.type);
  const s = typeof raw === 'string' && raw ? raw : 'hull';
  return s.slice(0, 40);
}

/** Desired XZ velocity from `from` toward `to` at `speed` — pure, testable. */
export function tallyhoSteer(from, to, speed) {
  const dx = num(to && to.x) - num(from && from.x);
  const dz = num(to && to.z) - num(from && from.z);
  const d = Math.hypot(dx, dz) || 1;
  const s = Number.isFinite(speed) ? speed : 0;
  return { x: (dx / d) * s, z: (dz / d) * s };
}

/** Desired XZ velocity directly away from `post` at `speed`. */
export function tallyhoSteerAway(from, post, speed) {
  return tallyhoSteer(post, from, speed);
}

/** A hull the board will call on: a live hostile ship, not ours, not the pilot. */
function tallyhoQuarryCandidate(state, e) {
  if (!e || e.alive === false || e.type !== 'ship') return false;
  if (e.id === state.playerId || e.isPlayer === true) return false;
  const d = e.data || {};
  if (d.tallyho === true || d.tallyhoSpectator === true || d.tallyhoRival === true) return false;
  if (d.tallyhoNoHunt === true || d.parentType === 'story_prop') return false;
  const ai = d.ai;
  if (ai && ai.passive === true) return false;
  if (e.team === 1) return true;
  if (ai && (ai.pirate === true || ai.hostile === true)) return true;
  return false;
}

function normalizeSighting(s) {
  s.seen = intOr(s.seen); s.escaped = intOr(s.escaped);
  s.killed = intOr(s.killed); s.poached = intOr(s.poached);
  s.lastAt = num(s.lastAt); s.wary = s.wary === true;
  return s;
}

function normalizeHunt(h) {
  h.quarryGen = h.quarryGen == null ? null : intOr(h.quarryGen, null);
  h.mark = str(h.mark, 'hull');
  h.sectorId = h.sectorId == null ? null : str(h.sectorId, null);
  h.bountyCr = intOr(h.bountyCr);
  h.postedAt = num(h.postedAt); h.expiresAt = num(h.expiresAt); h.fleeAt = num(h.fleeAt);
  h.settledAt = num(h.settledAt);
  // Authored windows are bounded: a cooked expiry or bolt-clock cannot squat a
  // live call — clamp the span to the widest honest window, not to `now`.
  if (h.expiresAt - h.postedAt > TALLYHO_HUNT.huntWindowS) {
    h.expiresAt = h.postedAt + TALLYHO_HUNT.huntWindowS;
  }
  if (h.fleeAt - h.postedAt > TALLYHO_HUNT.fleeAfterS) {
    h.fleeAt = h.postedAt + TALLYHO_HUNT.fleeAfterS;
  }
  h.fleeing = h.fleeing === true; h.wary = h.wary === true; h.rivalTried = h.rivalTried === true;
  h.bet = intOr(h.bet);
  // A staked marker is authored at exactly one price and pays bet × payoutMult —
  // a cooked save bet cannot out-stake the marker the rail actually takes.
  if (h.bet > TALLYHO_BET.stakeCr) h.bet = TALLYHO_BET.stakeCr;
  h.state = str(h.state, 'open');
  return h;
}

function normalizeRivalRow(r) {
  r.gen = r.gen == null ? null : intOr(r.gen, null);
  r.huntId = r.huntId == null ? null : str(r.huntId, null);
  r.postedAt = num(r.postedAt); r.settledAt = num(r.settledAt);
  r.state = str(r.state, 'open');
  return r;
}

function normalizeBounty(b) {
  b.mark = b.mark == null ? null : str(b.mark, null);
  b.bountyCr = intOr(b.bountyCr);
  b.postedAt = num(b.postedAt); b.expiresAt = num(b.expiresAt); b.settledAt = num(b.settledAt);
  if (b.expiresAt - b.postedAt > TALLYHO_BOUNTY.bountyTtlS) {
    b.expiresAt = b.postedAt + TALLYHO_BOUNTY.bountyTtlS;
  }
  b.state = str(b.state, 'open');
  return b;
}

/** Evict rows past the cap, closed rows first then the oldest — never a live row. */
function capRows(rows, cap) {
  while (rows.length > cap) {
    let i = rows.findIndex((r) => r && r.state !== 'open');
    if (i < 0) i = 0;
    rows.splice(i, 1);
  }
}

/**
 * Fresh serializable TALLY-HO ledger: quarry memory (sightings), timed calls
 * (hunts), the rail's licensed guns (rivals), the standing want sheet (bounties),
 * the verdict log, the once-only stamp bag, and the hunter's standing counters.
 * Anything malformed normalizes or drops — a corrupt save must not sink the tick.
 */
export function ensureTallyhoState(state) {
  if (!isObj(state.tallyho)) state.tallyho = {};
  const t = state.tallyho;
  if (!Array.isArray(t.sightings)) t.sightings = [];
  if (!Array.isArray(t.hunts)) t.hunts = [];
  if (!Array.isArray(t.rivals)) t.rivals = [];
  if (!Array.isArray(t.bounties)) t.bounties = [];
  if (!Array.isArray(t.log)) t.log = [];
  if (!isObj(t.paid)) t.paid = {};
  t.seq = intOr(t.seq);
  t.marks = intOr(t.marks); t.tier = intOr(t.tier);
  t.huntsRun = intOr(t.huntsRun); t.huntsPaid = intOr(t.huntsPaid);
  t.huntsSlipped = intOr(t.huntsSlipped); t.huntsPoached = intOr(t.huntsPoached);
  t.bountiesClaimed = intOr(t.bountiesClaimed); t.rivalsFielded = intOr(t.rivalsFielded);
  t.nextBountyAt = num(t.nextBountyAt);
  t.sightings = t.sightings.filter((s) => isObj(s) && typeof s.mark === 'string' && s.mark);
  for (const s of t.sightings) normalizeSighting(s);
  capRows(t.sightings, MAX_SIGHTINGS);
  // Duplicate row ids are a hostile-save shape: the once-only stamp bag would
  // still block a second grant, but deed and verdict counters would double —
  // the first row wins, the rest drop.
  const huntIds = new Set();
  t.hunts = t.hunts.filter((h) => isObj(h) && typeof h.id === 'string' && h.quarryId != null
    && !huntIds.has(h.id) && huntIds.add(h.id));
  for (const h of t.hunts) normalizeHunt(h);
  capRows(t.hunts, MAX_HUNT_ROWS);
  const rivalIds = new Set();
  t.rivals = t.rivals.filter((r) => isObj(r) && typeof r.id === 'string' && r.entityId != null
    && !rivalIds.has(r.id) && rivalIds.add(r.id));
  for (const r of t.rivals) normalizeRivalRow(r);
  capRows(t.rivals, MAX_RIVAL_ROWS);
  const bountyIds = new Set();
  t.bounties = t.bounties.filter((b) => isObj(b) && typeof b.id === 'string'
    && !bountyIds.has(b.id) && bountyIds.add(b.id));
  for (const b of t.bounties) normalizeBounty(b);
  capRows(t.bounties, MAX_BOUNTY_ROWS);
  t.log = t.log.filter((l) => isObj(l) && typeof l.id === 'string' && typeof l.kind === 'string');
  if (t.log.length > LOG_CAP) t.log.splice(0, t.log.length - LOG_CAP);
  return t;
}

/** The player's hunter standing: the tier row plus the deed count behind it. */
export function tallyhoStanding(state) {
  const t = ensureTallyhoState(state);
  const row = tallyhoTierFor(t.marks);
  return { tier: row.tier, id: row.id, label: row.label, payMult: row.payMult, marks: t.marks };
}

/** A HUD-safe copy of the whole hunt board: calls, guns, wants, memory, verdicts. */
export function tallyhoBoard(state) {
  const t = ensureTallyhoState(state);
  return {
    standing: tallyhoStanding(state),
    huntsRun: t.huntsRun, huntsPaid: t.huntsPaid,
    huntsSlipped: t.huntsSlipped, huntsPoached: t.huntsPoached,
    bountiesClaimed: t.bountiesClaimed, rivalsFielded: t.rivalsFielded,
    sightings: t.sightings.map((s) => ({ ...s })),
    hunts: t.hunts.map((h) => ({ ...h })),
    rivals: t.rivals.map((r) => ({ ...r })),
    bounties: t.bounties.map((b) => ({ ...b })),
    log: t.log.map((l) => ({ ...l })),
  };
}

/** Open hunts — copies, oldest first. The HUD's running calls. */
export function tallyhoOpenHunts(state) {
  return tallyhoBoard(state).hunts.filter((h) => h.state === 'open');
}

/** Open standing wants — copies, oldest first. The HUD's want sheet. */
export function tallyhoOpenBounties(state) {
  return tallyhoBoard(state).bounties.filter((b) => b.state === 'open');
}

export function tallyhoSpec() {
  return {
    type: 'drone',
    pos: { ...TALLYHO.post }, vel: { x: 0, z: 0 },
    radius: 12, mass: 40, hull: 250, hullMax: 250,
    homeSectorId: TALLYHO.sectorId,
    data: {
      tallyho: true, authoredCharacter: 'tallyho', parentType: 'story_prop',
      callsign: TALLYHO.callsign,
      scanLabel: 'TALLYHO / CN-2 — scoreboard, wants a crowd',
      scannerSignalKind: 'salvage',
      homeSectorId: TALLYHO.sectorId,
    },
  };
}

export function createTallyho() {
  return {
    name: 'tallyho',
    init(ctx) {
      this.destroy();
      this.state = ctx.state; this.bus = ctx.bus; this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._streak = 0;
      this._lastKillAt = -Infinity;
      this._ratedSinceSpectator = 0;
      this._nextScanAt = -Infinity;
      this._lastTickAt = -Infinity;
      const on = (event, fn) => {
        const off = this.bus?.on(event, fn); if (typeof off === 'function') this._unsubs.push(off);
      };
      const reset = () => {
        this._streak = 0; this._lastKillAt = -Infinity;
        this._ratedSinceSpectator = 0; this._nextScanAt = -Infinity;
        // Re-arm the pump: a load can pull simTime backward and a stale
        // watermark would silence the event lane until the clock caught up.
        this._lastTickAt = -Infinity;
      };
      on('sector:enter', (p) => {
        reset();
        // A call never outlives the sector: quarry bodies do not cross sectors,
        // so every still-open call from an earlier visit lapses cold here.
        this._lapseAllHunts();
        if (deferSectorEnterMaterialization(this.state, p, this._cookProvider)) return;
        this._sync();
      });
      this._cookProvider = () => { this._sync(); };
      (this.helpers.sectorCookProviders || (this.helpers.sectorCookProviders = []))
        .push(this._cookProvider);
      on('save:loaded', () => { reset(); this._sync(); });
      on('game:newGame', () => { reset(); this._sync(); });
      on('entity:killed', (p) => this._onKilled(p));
      // Spawn wires also carry the hunt clock: the 2 Hz calendar tick is the
      // steady beat and the pump fills the gaps around it. Every verdict reads
      // simTime, so a sparse beat still settles the honest outcome; a real
      // update() stamps the watermark fresh each step and the pump yields to
      // it, so the lanes never double-step.
      on('entity:spawned', () => this._pump());
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
        && this.state?.world?.currentSectorId === TALLYHO.sectorId;
    },
    _board() {
      for (const e of this.state?.entityList || []) {
        if (e?.alive && e.data?.tallyho === true) return e;
      }
      return null;
    },
    _spectators() {
      return (this.state?.entityList || []).filter((e) => e?.alive && e.data?.tallyhoSpectator === true);
    },
    _removeOwned() {
      for (const e of this.state?.entityList || []) {
        if (e?.alive && (e.data?.tallyho === true || e.data?.tallyhoSpectator === true
            || e.data?.tallyhoRival === true)) {
          this.helpers?.removeEntity?.(e.id);
        }
      }
    },
    _sync() {
      if (!this.state?.story) return;
      if (!this._adventure()) { this._removeOwned(); return; }
      if (!this._board() && this.helpers.spawnEntity) this.helpers.spawnEntity(tallyhoSpec());
      const flags = this._flags();
      if (flags && flags[TALLYHO.announceFlag] !== true) {
        flags[TALLYHO.announceFlag] = true;
        this.bus?.emit('comms:popup', {
          id: 'tallyho_announce', sender: TALLYHO.sender, category: 'story',
          text: TALLYHO.announce, ttl: 9, persist: false,
        });
      }
      this._pump(); // arrival is a beat too — the board reads the room it entered
    },
    /** The board rates a kill on the spot — the crowd hears it live. Spectators arrive
     *  on the same pass: the rail fills while the score runs. The same kill wire also
     *  settles the hunt layer: calls resolve by who shot, a rail gun going down files
     *  against the pilot, and an in-sight kill claims the best matching standing want. */
    _onKilled(p) {
      if (!this._adventure() || !p) return;
      const state = this.state;
      const t = ensureTallyhoState(state);
      const victim = (state.entities && typeof state.entities.get === 'function')
        ? state.entities.get(p.id) : null;
      const playerId = state?.playerId ?? state?.player?.id;
      const byPlayer = p.killerId != null && p.killerId === playerId;
      // Crowd casualties file consequence even with the board dead — the rail saw it.
      this._onCrowdKilled(state, t, p, victim, byPlayer);
      this._onRivalKilled(state, t, p, victim, byPlayer);
      const hunt = this._openHuntFor(state, t, p.id, victim);
      if (hunt) this._resolveHuntKill(state, t, hunt, p, victim, byPlayer);
      this._pump(); // a kill wire is also a beat — due clocks settle on it
      const board = this._board();
      if (!board) return;
      // Own crowd by DATA FLAG, not aliveness: combat marks the victim dead before
      // entity:killed emits, so a live-only spectator scan would let a player kill
      // parked INSIDE the ring rate — shooting the audience must never score.
      // A flagged corpse still in the list holds its id until the sweep frees it,
      // and a recycled id only re-enters selfIds if the new occupant is also ours.
      const selfIds = new Set([board.id]);
      for (const e of this.state?.entityList || []) {
        if (e && e.data && (e.data.tallyho === true || e.data.tallyhoSpectator === true
            || e.data.tallyhoRival === true)) selfIds.add(e.id);
      }
      if (!tallyhoRateableKill(p, playerId, selfIds)) return;
      // One wire per body: everything past this gate — score, streak, the rail's
      // seats, quarry memory, and standing-want claims — spends the wire's say-so.
      // A replayed entity:killed for the same occupant must not run it twice, so
      // the tail rides the same id + generation proof the ledger rows do.
      const victimGen = p.occupantGeneration != null ? p.occupantGeneration
        : (victim && victim.occupantGeneration != null ? victim.occupantGeneration : 'x');
      if (!this._paidOnce(t, `rate:${p.id}:${victimGen}`)) return;
      const now = Number(this.state?.simTime) || 0;
      const s = tallyhoStreak(this._streak, this._lastKillAt, now);
      this._streak = s.count; this._lastKillAt = now;
      const flags = this._flags();
      if (flags) {
        flags[TALLYHO.scoreFlag] = (Number(flags[TALLYHO.scoreFlag]) || 0) + tallyhoScoreFor(s.count);
        flags[TALLYHO.ratedFlag] = (Number(flags[TALLYHO.ratedFlag]) || 0) + 1;
      }
      this.bus?.emit('comms:popup', {
        id: `tallyho_rate_${p.id}`, sender: TALLYHO.sender, category: 'story',
        text: tallyhoRateLine(s.count), ttl: 5, persist: false,
      });
      const score = tallyhoScoreFor(s.count);
      this._ratedSinceSpectator += score;
      if (this._ratedSinceSpectator >= TALLYHO.ratedKillsPerSpectator
          && this._spectators().length < TALLYHO.spectatorCap && this.helpers.spawnEntity) {
        this._ratedSinceSpectator -= TALLYHO.ratedKillsPerSpectator;
        // Next seat = one past the highest LIVE seat, never the live count: a dead
        // rail-sitter's chair stays empty and the new arrival does not spawn
        // coincident with the survivor. The stamped seat rides data.*, so a
        // save:loaded restore keeps the rail's occupancy honest too.
        let nextSeat = 0;
        for (const e of this._spectators()) {
          const s = Number(e.data && e.data.tallyhoSeat);
          if (Number.isInteger(s) && s >= nextSeat) nextSeat = s + 1;
        }
        const seat = tallyhoSpectatorSeat(nextSeat);
        this.helpers.spawnEntity({
          type: 'drone',
          pos: seat, vel: { x: 0, z: 0 },
          radius: 8, mass: 20, hull: 100, hullMax: 100,
          homeSectorId: TALLYHO.sectorId,
          data: {
            tallyhoSpectator: true, tallyhoSeat: nextSeat, parentType: 'story_prop',
            callsign: 'PITBORN RAIL',
            scanLabel: 'Pitborn spectator — came for the score',
            scannerSignalKind: 'salvage',
            homeSectorId: TALLYHO.sectorId,
          },
        });
      }
      // The board remembers what it watched die — memory feeds the want sheet.
      // Each BODY files once: the durable bagged tag or a settled hunt row for
      // this occupant means a replayed kill wire cannot double the count.
      const mark = victim ? tallyhoMarkOf(victim) : (p.victimClass || p.factionId || 'hull');
      const sight = this._sighting(state, t, mark);
      const bagged = !!(victim && victim.data && victim.data.tallyhoBagged === true);
      const settledForBody = t.hunts.some((h) => h.quarryId === p.id
        && (h.state === 'paid' || h.state === 'downed' || h.state === 'poached')
        && (h.quarryGen == null || !victim || victim.occupantGeneration === h.quarryGen));
      if (!bagged && !settledForBody) {
        if (victim && victim.data) victim.data.tallyhoBagged = true;
        sight.seen += 1;
        if (!hunt) sight.killed += 1; // a resolved call already counted its bag
        sight.lastAt = now;
      }
      this._claimBounties(state, t, p, victim, mark);
    },

    // ── The hunt layer ───────────────────────────────────────────────────────

    /** The open hunt row pinning this body — id + generation are the identity proof
     *  on the kill wire; a tag naming a DIFFERENT call disqualifies, but a missing
     *  tag alone does not (the tick path is stricter — an untagged body goes cold). */
    _openHuntFor(state, t, entityId, ent) {
      if (entityId == null) return null;
      for (const h of t.hunts) {
        if (h.state !== 'open' || h.quarryId !== entityId) continue;
        if (h.quarryGen != null && (!ent || ent.occupantGeneration !== h.quarryGen)) continue;
        if (ent && ent.data && ent.data.tallyhoHuntId != null && ent.data.tallyhoHuntId !== h.id) continue;
        return h;
      }
      return null;
    },

    /** The live body behind a hunt row: same id, same occupant, same sector,
     *  still tagged. Calls never outlive the sector their quarry lived in. A
     *  corrupt position cannot be adjudicated — the call goes cold, never a
     *  phantom verdict measured against (0,0). */
    _quarryEnt(state, h) {
      if (h.sectorId != null && h.sectorId !== state?.world?.currentSectorId) return null;
      const e = state?.entities?.get ? state.entities.get(h.quarryId) : null;
      if (!e || e.alive === false || !e.pos) return null;
      if (!Number.isFinite(e.pos.x) || !Number.isFinite(e.pos.z)) return null;
      if (e.data?.tallyhoHuntId !== h.id) return null;
      if (h.quarryGen != null && e.occupantGeneration !== h.quarryGen) return null;
      return e;
    },

    /** The live body behind a rival row: same id, same occupant, still tagged. */
    _rivalEnt(state, r) {
      const e = state?.entities?.get ? state.entities.get(r.entityId) : null;
      if (!e || e.alive === false) return null;
      if (!e.pos || !Number.isFinite(e.pos.x) || !Number.isFinite(e.pos.z)) return null;
      if (e.data?.tallyhoRivalId !== r.id) return null;
      if (r.gen != null && e.occupantGeneration !== r.gen) return null;
      return e;
    },

    /** The durable quarry-memory row for a mark — created once, filed live. */
    _sighting(state, t, mark) {
      let s = t.sightings.find((x) => x.mark === mark);
      if (!s) {
        s = { mark, seen: 0, escaped: 0, killed: 0, poached: 0, wary: false, lastAt: 0 };
        t.sightings.push(s);
        capRows(t.sightings, MAX_SIGHTINGS);
        this.bus?.emit('tallyho:sightingFiled', { mark, tick: state?.tick });
      }
      return s;
    },

    /** Once-only stamp bag for money/rep side-effects keyed by a content id. */
    _paidOnce(t, key) {
      if (!isObj(t.paid)) t.paid = {};
      if (t.paid[key] != null) return false;
      t.paid[key] = num(this.state && this.state.simTime);
      const keys = Object.keys(t.paid);
      for (let i = 0; i <= keys.length - PAID_STAMPS_CAP; i++) delete t.paid[keys[i]];
      return true;
    },

    _tierMult(t) { return tallyhoTierFor(t.marks).payMult; },

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
      this.bus?.emit('faction:repDelta', { factionId: RAIL_FACTION, delta: d, reason });
    },

    _boardLog(state, t, kind, mark, detail) {
      const rec = {
        id: `TL${t.seq++}`, kind, mark: mark ?? null,
        detail: detail ?? null, at: num(state.simTime),
      };
      t.log.push(rec);
      while (t.log.length > LOG_CAP) t.log.shift();
      this.bus?.emit('tallyho:ledgerFiled', {
        rowId: rec.id, kind, mark: rec.mark, tick: state.tick,
      });
      return rec;
    },

    _boardSay(state, id, text, ttl = 6) {
      if (typeof text !== 'string' || !text) return;
      this.bus?.emit('comms:popup', {
        id, sender: TALLYHO.sender, category: 'story', text, ttl, persist: false,
      });
    },

    _pick(lines, salt) {
      if (!Array.isArray(lines) || !lines.length) return '';
      return lines[hash32('tallyho-line', salt) % lines.length];
    },

    /** A finished piece of called work: count it, raise the tier when it crosses. */
    _markDeed(state, t, kind, ref) {
      t.marks = (t.marks | 0) + 1;
      const row = tallyhoTierFor(t.marks);
      this.bus?.emit('tallyho:deed', {
        kind, ref: ref ?? null, marks: t.marks, tier: row.tier, tick: state.tick,
      });
      if (row.tier > (t.tier | 0)) {
        t.tier = row.tier;
        this.bus?.emit('tallyho:standing', {
          tier: row.tier, id: row.id, label: row.label, marks: t.marks, tick: state.tick,
        });
        this.bus?.emit('toast', {
          text: `THE RAIL KNOWS YOU — ${row.label.toUpperCase()}`,
          kind: 'good', tone: 'info', ttl: 4,
        });
        this._boardSay(state, `tallyho_tier_${row.tier}`, row.line, 7);
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

    // ── Spotting: the board calls tally-ho on a hostile in the ring ────────────
    _postHunt(state, t, quarry) {
      const now = num(state.simTime);
      const mark = tallyhoMarkOf(quarry);
      const sight = this._sighting(state, t, mark);
      sight.seen += 1; sight.lastAt = now;
      const wary = sight.escaped >= TALLYHO_HUNT.waryAfterEscapes || sight.wary === true;
      const windowS = wary ? TALLYHO_HUNT.waryWindowS : TALLYHO_HUNT.huntWindowS;
      const bountyCr = Math.round(
        (TALLYHO_HUNT.bountyBaseCr + sight.escaped * TALLYHO_HUNT.escapeEscalationCr)
        * this._tierMult(t));
      const hunt = {
        id: `hunt:${t.seq++}`,
        quarryId: quarry.id, quarryGen: quarry.occupantGeneration ?? null,
        mark, sectorId: state.world?.currentSectorId || null,
        bountyCr, postedAt: now, expiresAt: now + windowS,
        fleeAt: now + (wary ? TALLYHO_HUNT.waryFleeAfterS : TALLYHO_HUNT.fleeAfterS),
        fleeing: false, wary, rivalTried: false, bet: 0, state: 'open',
      };
      // The tag rides the hull — enumerable data so a save carries the call.
      if (quarry.data) {
        quarry.data.tallyhoHuntId = hunt.id;
        quarry.data.tallyhoMark = mark;
      }
      t.hunts.push(hunt);
      t.huntsRun += 1;
      capRows(t.hunts, MAX_HUNT_ROWS);
      this.bus?.emit('tallyho:huntPosted', {
        huntId: hunt.id, quarryId: hunt.quarryId, mark, bountyCr,
        expiresAt: hunt.expiresAt, wary, tick: state.tick,
      });
      const line = wary
        ? WARY_HUNT_LINE
        : this._pick(HUNT_LINES, `hunt:${hunt.id}:${t.seq}`);
      this._boardSay(state, `tallyho_call_${hunt.id}`,
        line.replace('{mark}', mark).replace('{secs}', String(Math.round(windowS))));
      return hunt;
    },

    // ── Call resolution: one latch, one verdict, once-only money ───────────────
    _closeHunt(state, t, hunt, outcome, ctx = {}) {
      if (!hunt || hunt.state !== 'open') return false;
      hunt.state = outcome; // LATCH FIRST — kill-wire re-entry must not re-resolve.
      hunt.settledAt = num(state.simTime);
      const sight = this._sighting(state, t, hunt.mark);
      const quarry = state.entities?.get ? state.entities.get(hunt.quarryId) : null;
      if (quarry && quarry.data && quarry.data.tallyhoHuntId === hunt.id) {
        quarry.data.tallyhoHuntId = null;
        quarry.data.tallyhoBolt = null;
        // The hull that lived is not instantly re-called — a real cooldown.
        quarry.data.tallyhoHuntedAt = hunt.settledAt;
        if (outcome === 'paid' || outcome === 'downed' || outcome === 'poached') {
          // The body filed its bag — a replayed kill wire must not re-count it.
          quarry.data.tallyhoBagged = true;
        }
      }
      const mark = hunt.mark;
      if (outcome === 'paid' || outcome === 'downed') {
        t.huntsPaid += 1;
        sight.killed += 1;
        const pay = outcome === 'paid'
          ? Math.round(hunt.bountyCr)
          : Math.round(hunt.bountyCr * TALLYHO_HUNT.outOfSightPayFrac);
        if (this._paidOnce(t, `hunt:${hunt.id}`)) {
          this._grant(state, pay, `tallyho_hunt:${hunt.id}`);
          this._rep(state, outcome === 'paid' ? TALLYHO_HUNT.huntRep : TALLYHO_HUNT.downedRep,
            outcome === 'paid' ? 'tallyho_hunt_paid' : 'tallyho_hunt_downed');
        }
        if (hunt.bet > 0) {
          if (outcome === 'paid') {
            if (this._paidOnce(t, `bet:${hunt.id}`)) {
              const win = hunt.bet * TALLYHO_BET.payoutMult;
              this._grant(state, win, `tallyho_bet_win:${hunt.id}`);
              this.bus?.emit('tallyho:betPaid', {
                huntId: hunt.id, stake: hunt.bet, payCr: win, tick: state.tick,
              });
              this._boardSay(state, `tallyho_bet_${hunt.id}`, BET_WIN_LINE, 5);
            }
          } else {
            this.bus?.emit('tallyho:betLost', {
              huntId: hunt.id, stake: hunt.bet, how: 'out_of_sight', tick: state.tick,
            });
          }
        }
        this._boardLog(state, t, outcome === 'paid' ? 'hunt_paid' : 'hunt_downed', mark,
          outcome === 'paid' ? `bagged in the ring for ${pay} cr` : `downed out of sight for ${pay} cr`);
        this.bus?.emit(outcome === 'paid' ? 'tallyho:huntPaid' : 'tallyho:huntDowned', {
          huntId: hunt.id, quarryId: hunt.quarryId, mark, payCr: pay, tick: state.tick,
        });
        this._boardSay(state, `tallyho_purse_${hunt.id}`,
          (outcome === 'paid' ? PAID_LINE : DOWNED_LINE).replace('{mark}', mark));
        this._markDeed(state, t, 'hunt', hunt.id);
      } else if (outcome === 'poached') {
        t.huntsPoached += 1;
        sight.poached += 1;
        if (hunt.bet > 0) {
          this.bus?.emit('tallyho:betLost', {
            huntId: hunt.id, stake: hunt.bet, how: 'poached', tick: state.tick,
          });
        }
        this._boardLog(state, t, 'hunt_poached', mark, 'the licensed gun collected');
        this.bus?.emit('tallyho:huntPoached', {
          huntId: hunt.id, quarryId: hunt.quarryId, mark,
          rivalId: ctx.rivalId ?? null, entityId: ctx.entityId ?? null, tick: state.tick,
        });
        this._boardSay(state, `tallyho_poach_${hunt.id}`,
          this._pick(POACH_LINES, `poach:${hunt.id}`).replace('{mark}', mark));
      } else if (outcome === 'slipped') {
        t.huntsSlipped += 1;
        sight.escaped += 1;
        if (sight.escaped >= TALLYHO_HUNT.waryAfterEscapes) sight.wary = true;
        if (hunt.bet > 0) {
          this.bus?.emit('tallyho:betLost', {
            huntId: hunt.id, stake: hunt.bet, how: 'slipped', tick: state.tick,
          });
        }
        this._boardLog(state, t, 'hunt_slipped', mark, 'ran the ring — the wire keeps the mark');
        this.bus?.emit('tallyho:huntSlipped', {
          huntId: hunt.id, quarryId: hunt.quarryId, mark, tick: state.tick,
        });
        this._boardSay(state, `tallyho_slip_${hunt.id}`,
          this._pick(SLIP_LINES, `slip:${hunt.id}`).replace('{mark}', mark));
      } else { // 'cold' — the quarry is gone with no verdict to file
        if (hunt.bet > 0) {
          this.bus?.emit('tallyho:betLost', {
            huntId: hunt.id, stake: hunt.bet, how: 'cold', tick: state.tick,
          });
        }
        this._boardLog(state, t, 'hunt_cold', mark, 'the call went cold');
        this.bus?.emit('tallyho:huntCold', {
          huntId: hunt.id, quarryId: hunt.quarryId, mark, tick: state.tick,
        });
      }
      this._gcClosed(t.hunts, TALLYHO_HUNT.huntLogKeep);
      return true;
    },

    /** A kill report lands on a called hull — resolve by who swung it. */
    _resolveHuntKill(state, t, hunt, p, victim, byPlayer) {
      if (byPlayer) {
        const pos = p.pos || (victim && victim.pos) || null;
        this._closeHunt(state, t, hunt, tallyhoInSight(pos) ? 'paid' : 'downed', { pos });
        return;
      }
      // A licensed gun on this call collects for the rail. The killer's number
      // alone is not the gun: a silently swept gun's id can be re-issued before
      // its row retires, so the poach verdict binds the occupant's generation
      // and tag the same way _rivalEnt does — a recycled id goes cold, never
      // pays a phantom rail.
      const killer = state.entities?.get ? state.entities.get(p.killerId) : null;
      const rival = t.rivals.find((r) => r.state === 'open' && r.huntId === hunt.id
        && r.entityId === p.killerId
        && (r.gen == null || (killer && killer.occupantGeneration === r.gen))
        && (!killer || !killer.data || killer.data.tallyhoRivalId == null
          || killer.data.tallyhoRivalId === r.id));
      if (rival) {
        this._closeHunt(state, t, hunt, 'poached', { rivalId: rival.id, entityId: rival.entityId });
        rival.state = 'done';
        rival.settledAt = num(state.simTime);
        const gun = state.entities?.get ? state.entities.get(rival.entityId) : null;
        if (gun && gun.data) { gun.data.done = true; gun.data.holdT = 0; }
        return;
      }
      this._closeHunt(state, t, hunt, 'cold');
    },

    /** Sector hop / board loss: every open call lapses cold — the quarry is gone. */
    _lapseAllHunts() {
      const state = this.state;
      if (!state) return;
      const t = ensureTallyhoState(state);
      for (const h of t.hunts.slice()) {
        if (h.state === 'open') this._closeHunt(state, t, h, 'cold');
      }
      for (const r of t.rivals.slice()) {
        if (r.state !== 'open') continue;
        r.state = 'left'; r.settledAt = num(state.simTime);
        // Stand the gun down too — its call is over wherever the jump landed.
        const gun = state.entities?.get ? state.entities.get(r.entityId) : null;
        if (gun && gun.data?.tallyhoRivalId === r.id
            && (r.gen == null || gun.occupantGeneration === r.gen)) {
          this.helpers?.removeEntity?.(r.entityId, { reason: 'tallyho_rival_left' });
        }
        this.bus?.emit('tallyho:rivalLeft', {
          rivalId: r.id, entityId: r.entityId, tick: state.tick,
        });
      }
    },

    // ── Rival guns ─────────────────────────────────────────────────────────────
    _postRival(state, t, hunt, quarry) {
      if (typeof this.helpers?.spawnEntity !== 'function') return null;
      const now = num(state.simTime);
      const rowId = `rival:${t.seq++}`;
      // The gun comes over the rail on the far side of its quarry's bearing.
      const bearing = frac('rival-bearing', hunt.id, t.seq) * Math.PI * 2;
      const r = TALLYHO.crowdRadius + TALLYHO_RIVAL.spawnMargin;
      const gunNo = (t.rivalsFielded | 0) + 1;
      const e = this.helpers.spawnEntity({
        type: 'ship', team: 2, factionId: RAIL_FACTION,
        pos: {
          x: TALLYHO.post.x + Math.cos(bearing) * r,
          z: TALLYHO.post.z + Math.sin(bearing) * r,
        },
        vel: { x: 0, z: 0 }, rot: bearing + Math.PI / 2,
        radius: TALLYHO_RIVAL.rivalRadius, mass: TALLYHO_RIVAL.rivalMass,
        hull: TALLYHO_RIVAL.rivalHull, hullMax: TALLYHO_RIVAL.rivalHull, collides: true,
        homeSectorId: TALLYHO.sectorId,
        data: {
          tallyhoRival: true, tallyhoRivalId: rowId, tallyhoHuntId: hunt.id,
          tallyhoQuarryId: hunt.quarryId, parentType: 'story_prop',
          callsign: `RAIL GUN ${gunNo}`, name: `Rail gun ${gunNo}`,
          scanLabel: `Pitborn licensed gun — running the board's call on ${hunt.mark}`,
          scannerSignalKind: 'salvage', shipRole: 'hunter', holdT: 0,
          ai: { passive: true, lawful: true },
          homeSectorId: TALLYHO.sectorId,
        },
      });
      if (!e || e.id == null) return null; // a refused spawn files no row
      const row = {
        id: rowId, huntId: hunt.id, entityId: e.id,
        gen: e.occupantGeneration ?? null, postedAt: now, state: 'open',
      };
      t.rivals.push(row);
      t.rivalsFielded += 1;
      capRows(t.rivals, MAX_RIVAL_ROWS);
      this.bus?.emit('tallyho:rivalPosted', {
        rivalId: rowId, entityId: e.id, huntId: hunt.id, mark: hunt.mark, tick: state.tick,
      });
      this._boardSay(state, `tallyho_gun_${rowId}`,
        `THE RAIL SENDS A GUN — ${hunt.mark} IS MARKET.`);
      return row;
    },

    /** Physics writes go through the authority queue only — impulse = Δv × mass.
     *  One correction per body per sim tick: an event beat and the calendar tick
     *  can both fire inside one physics step, and a second queued impulse reads
     *  the same pre-solve velocity and applies the correction twice — a lurch
     *  past the desired speed the next beat then has to swing back. The stamp
     *  lives in a WeakMap so it never rides a save or a corpse copy. */
    _drive(state, e, desired) {
      if (!e || e.alive === false) return false;
      const tick = num(state.tick);
      const stamps = this._driveStamps || (this._driveStamps = new WeakMap());
      if (stamps.get(e) === tick) return false;
      const mass = num(e.mass, 1) || 1;
      const jx = (num(desired.x) - num(e.vel && e.vel.x)) * mass;
      const jz = (num(desired.z) - num(e.vel && e.vel.z)) * mass;
      if (jx === 0 && jz === 0) return false;
      if (queuePhysicsImpulse(e, { x: jx, z: jz }, { tick }) !== true) return false;
      stamps.set(e, tick);
      return true;
    },

    /** The gun holds contact long enough and takes the kill — the rail collects. */
    _poach(state, t, hunt, quarry, row, gun) {
      // Latch the verdict before the kill emit re-enters this system.
      this._closeHunt(state, t, hunt, 'poached', { rivalId: row.id, entityId: gun.id });
      row.state = 'done';
      row.settledAt = num(state.simTime);
      if (gun.data) { gun.data.done = true; gun.data.holdT = 0; }
      // Route the kill through the command seam first so lifetime bookkeeping
      // (_killerId, corpse policy) sees the same death the report describes.
      this.bus?.emit('entity:kill', { id: quarry.id, killerId: gun.id });
      quarry.alive = false; // core-less fixtures have no entity:kill listener
      this.bus?.emit('entity:killed', {
        id: quarry.id, killerId: gun.id, type: quarry.type,
        pos: { x: num(quarry.pos && quarry.pos.x), z: num(quarry.pos && quarry.pos.z) },
        factionId: quarry.factionId ?? null,
        victimClass: quarry.data?.shipClass || quarry.type,
        targetHostileToPlayer: true,
      });
    },

    /** A rail gun goes down: close its row; a player hand files the consequence. */
    _onRivalKilled(state, t, p, victim, byPlayer) {
      const tag = victim?.data?.tallyhoRivalId;
      // A retiring gun is still a licensed gun — 'done' rows file the same way.
      const row = t.rivals.find((r) => (r.state === 'open' || r.state === 'done')
        && r.entityId === p.id
        && (r.gen == null || (victim && victim.occupantGeneration === r.gen))
        && (tag == null || tag === r.id));
      if (!row) return;
      row.state = 'downed';
      row.settledAt = num(state.simTime);
      if (!byPlayer) return;
      if (this._paidOnce(t, `rivaldown:${row.id}`)) {
        this._rep(state, TALLYHO_RIVAL.rivalKillRep, 'tallyho_rival_downed');
      }
      this._boardLog(state, t, 'rival_downed', tallyhoMarkOf(victim), 'the pilot cooled a licensed gun');
      this.bus?.emit('tallyho:rivalDowned', {
        rivalId: row.id, entityId: p.id, huntId: row.huntId, tick: state.tick,
      });
      this._boardSay(state, `tallyho_gundown_${row.id}`, RIVAL_DOWNED_LINE);
    },

    /** The board or its audience under fire: the rail files the pilot's name —
     *  once per body, so a replayed kill wire cannot re-file the consequence. */
    _onCrowdKilled(state, t, p, victim, byPlayer) {
      if (!byPlayer || !victim) return;
      const d = victim.data || {};
      const isBoard = d.tallyho === true;
      const isSpectator = d.tallyhoSpectator === true;
      if (!isBoard && !isSpectator) return;
      const gen = victim.occupantGeneration ?? 0;
      const key = isBoard ? `board:${p.id}:${gen}` : `crowd:${p.id}:${gen}`;
      if (!this._paidOnce(t, key)) return;
      this._rep(state, isBoard ? -8 : -3,
        isBoard ? 'tallyho_board_downed' : 'tallyho_audience_downed');
      this._boardLog(state, t, isBoard ? 'board_downed' : 'audience_downed',
        isBoard ? TALLYHO.callsign : 'PITBORN RAIL',
        isBoard ? 'the board itself broke' : 'a spectator took fire');
      this.bus?.emit(isBoard ? 'tallyho:boardDowned' : 'tallyho:audienceDowned',
        { entityId: p.id, tick: state.tick });
    },

    // ── The want sheet: standing bounties on a clock ───────────────────────────
    _tickBounties(state, t) {
      const now = num(state.simTime);
      if (!Number.isFinite(t.nextBountyAt) || t.nextBountyAt <= 0) {
        t.nextBountyAt = now + TALLYHO_BOUNTY.firstBountyS;
      } else if (t.nextBountyAt - now
          > TALLYHO_BOUNTY.bountyPeriodS + TALLYHO_BOUNTY.bountyJitterS) {
        // A cooked horizon would starve the sheet forever — re-arm one period out.
        t.nextBountyAt = now + TALLYHO_BOUNTY.bountyPeriodS;
      }
      const openCount = t.bounties.reduce((n, b) => n + (b.state === 'open' ? 1 : 0), 0);
      if (now >= t.nextBountyAt && openCount < TALLYHO_BOUNTY.maxOpen) {
        t.nextBountyAt = now + TALLYHO_BOUNTY.bountyPeriodS
          + frac('bounty-gap', t.seq) * TALLYHO_BOUNTY.bountyJitterS;
        this._postBounty(state, t);
      }
      for (const b of t.bounties) {
        if (b.state !== 'open' || now < num(b.expiresAt)) continue;
        b.state = 'cold';
        b.settledAt = now;
        this.bus?.emit('tallyho:bountyCold', {
          bountyId: b.id, mark: b.mark, tick: state.tick,
        });
      }
      this._gcClosed(t.bounties, TALLYHO_BOUNTY.maxOpen * 2);
    },

    _postBounty(state, t) {
      const now = num(state.simTime);
      const known = t.sightings.filter((s) => s.seen > 0);
      const mult = this._tierMult(t);
      let mark = null;
      let bountyCr = Math.round(TALLYHO_BOUNTY.openBountyCr * mult);
      // Named wants prefer the marks that got away — the rail hates a cold trail.
      const eligible = known
        .filter((s) => !t.bounties.some((b) => b.state === 'open' && b.mark === s.mark))
        .sort((a, b) => (b.escaped - a.escaped) || (a.mark < b.mark ? -1 : 1));
      if (eligible.length && frac('bounty-pick', t.seq) < TALLYHO_BOUNTY.markedShare) {
        const row = eligible[hash32('bounty-mark', t.seq) % eligible.length];
        mark = row.mark;
        bountyCr = Math.round(
          (TALLYHO_BOUNTY.markBountyBaseCr + row.escaped * TALLYHO_BOUNTY.markBountyEscalationCr)
          * mult);
      }
      const b = {
        id: `bty:${t.seq++}`, mark, bountyCr,
        postedAt: now, expiresAt: now + TALLYHO_BOUNTY.bountyTtlS, state: 'open',
      };
      t.bounties.push(b);
      capRows(t.bounties, MAX_BOUNTY_ROWS);
      this.bus?.emit('tallyho:bountyPosted', {
        bountyId: b.id, mark, bountyCr, expiresAt: b.expiresAt, tick: state.tick,
      });
      const lines = mark ? BOUNTY_LINES : OPEN_BOUNTY_LINES;
      this._boardSay(state, `tallyho_want_${b.id}`,
        this._pick(lines, `want:${b.id}`)
          .replace('{mark}', mark || '').replace('{cr}', String(bountyCr)));
      return b;
    },

    /** A player kill in sight claims the best matching open want — once each.
     *  The sheet pays for HOSTILE hulls: lawful blood in the ring still rates
     *  on the board, but no want signs for it. The payload's first-hit truth
     *  leads; where the wire did not carry it, the body answers. */
    _claimBounties(state, t, p, victim, mark) {
      const flagged = p && typeof p.targetHostileToPlayer === 'boolean'
        ? p.targetHostileToPlayer : null;
      const bodyHostile = !!(victim
        && (victim.team === 1
          || victim.data?.ai?.pirate === true || victim.data?.ai?.hostile === true));
      if ((flagged ?? bodyHostile) !== true) return false;
      let best = null;
      for (const b of t.bounties) {
        if (b.state !== 'open') continue;
        if (b.mark != null && b.mark !== mark) continue;
        if (!best || num(b.bountyCr) > num(best.bountyCr)) best = b;
      }
      if (!best) return false;
      best.state = 'claimed'; // latch before any emit — a doubled wire cannot re-claim
      best.settledAt = num(state.simTime);
      t.bountiesClaimed += 1;
      const pay = Math.round(num(best.bountyCr));
      if (this._paidOnce(t, `bounty:${best.id}`)) {
        this._grant(state, pay, `tallyho_bounty:${best.id}`);
        this._rep(state, TALLYHO_BOUNTY.claimRep, 'tallyho_bounty_claimed');
      }
      this._boardLog(state, t, 'bounty_claimed', best.mark || mark,
        `the standing want paid ${pay} cr`);
      this.bus?.emit('tallyho:bountyClaimed', {
        bountyId: best.id, mark: best.mark || mark, victimId: p.id, payCr: pay, tick: state.tick,
      });
      this._markDeed(state, t, 'bounty', best.id);
      return true;
    },

    /** Called shot: the pilot stakes this open call; the ring decides it. Returns
     *  the staked credits, or 0 when the window/board is not taking it. */
    callShot(state, huntId) {
      const s = state || this.state;
      const t = ensureTallyhoState(s);
      const hunt = t.hunts.find((h) => h.id === huntId && h.state === 'open');
      if (!hunt || hunt.bet > 0) return 0;
      const credits = num(s.player && s.player.credits);
      if (credits < TALLYHO_BET.stakeCr) return 0;
      hunt.bet = TALLYHO_BET.stakeCr; // latch before the charge emit
      this._charge(s, TALLYHO_BET.stakeCr, `tallyho_bet:${hunt.id}`);
      this.bus?.emit('tallyho:betPosted', {
        huntId: hunt.id, stake: hunt.bet, tick: s.tick,
      });
      this._boardSay(s, `tallyho_stake_${hunt.id}`,
        `THE RAIL TAKES YOUR MARKER — ${TALLYHO_BET.stakeCr} CR ON YOUR OWN CALL.`, 5);
      return hunt.bet;
    },

    // ── The hunt tick ──────────────────────────────────────────────────────────
    _tickHunts(state, dt, t) {
      const now = num(state.simTime);
      const board = this._board();
      const escape2 = TALLYHO_HUNT.escapeRadius * TALLYHO_HUNT.escapeRadius;
      // Resolve every open call: gone → cold, window/run-out → slipped, else bolt.
      // Snapshot the rows — _closeHunt's closed-row GC splices this same array,
      // and a skipped call would quietly survive the hop or the window.
      for (const h of t.hunts.slice()) {
        if (h.state !== 'open') continue;
        const quarry = this._quarryEnt(state, h);
        if (!quarry) { this._closeHunt(state, t, h, 'cold'); continue; }
        if (now >= num(h.expiresAt)
            || dist2(quarry.pos.x, quarry.pos.z, TALLYHO.post.x, TALLYHO.post.z) > escape2) {
          this._closeHunt(state, t, h, 'slipped');
          continue;
        }
        if (h.fleeing !== true && now >= num(h.fleeAt)) {
          h.fleeing = true;
          this.bus?.emit('tallyho:quarryFleeing', {
            huntId: h.id, quarryId: h.quarryId, mark: h.mark, tick: state.tick,
          });
          this._boardSay(state, `tallyho_bolt_${h.id}`,
            `IT BOLTS — ${h.mark} RUNNING THE RING.`, 4);
        }
        if (h.fleeing === true) {
          const speed = h.wary ? TALLYHO_HUNT.waryFleeSpeed : TALLYHO_HUNT.fleeSpeed;
          const bolt = tallyhoSteerAway(quarry.pos, TALLYHO.post, speed);
          if (quarry.data) quarry.data.tallyhoBolt = { x: bolt.x, z: bolt.z };
          this._drive(state, quarry, bolt);
        }
      }
      if (!board) return; // a dead board calls nothing new — the calls stand
      // Spot: one candidacy sweep per beat, capped open calls, flight mode only.
      if (state.mode === 'flight' && now >= num(this._nextScanAt, -Infinity)) {
        this._nextScanAt = now + TALLYHO_HUNT.scanBeatS;
        let open = t.hunts.reduce((n, h) => n + (h.state === 'open' ? 1 : 0), 0);
        if (open < TALLYHO_HUNT.maxOpenHunts) {
          for (const e of state.entityList || []) {
            if (open >= TALLYHO_HUNT.maxOpenHunts) break;
            if (!tallyhoQuarryCandidate(state, e)) continue;
            if (!tallyhoInSight(e.pos)) continue;
            const d = e.data || (e.data = {});
            const tag = d.tallyhoHuntId;
            if (tag != null) {
              // A live tag skips; a stale tag (no open row — recycled or loaded
              // body) clears so the hull can be called again honestly.
              const live = t.hunts.some((h) => h.state === 'open' && h.id === tag
                && h.quarryId === e.id);
              if (live) continue;
              d.tallyhoHuntId = null;
            }
            if (now - num(d.tallyhoHuntedAt, -Infinity) < TALLYHO_HUNT.reHuntCooldownS) continue;
            this._postHunt(state, t, e);
            open += 1;
          }
        }
      }
      // Standing calls draw the rail's licensed guns. Snapshot like the resolve
      // pass above: _postRival's spawn wire can re-enter _closeHunt's GC and
      // splice this same array mid-loop.
      for (const h of t.hunts.slice()) {
        if (h.state !== 'open' || h.rivalTried === true) continue;
        if (now - num(h.postedAt) < TALLYHO_RIVAL.rivalDelayS) continue;
        const liveGuns = t.rivals.reduce((n, r) => n + (r.state === 'open' ? 1 : 0), 0);
        if (liveGuns >= TALLYHO_RIVAL.rivalCap) continue;
        const quarry = this._quarryEnt(state, h);
        if (!quarry) continue;
        h.rivalTried = true; // latch before the spawn — a call fields one gun ever
        this._postRival(state, t, h, quarry);
      }
    },

    _tickRivals(state, dt, t) {
      const leave2 = (TALLYHO_HUNT.escapeRadius + TALLYHO_RIVAL.leaveMargin) ** 2;
      // Snapshot like the hunt passes: _poach's kill wire re-enters this system,
      // and ensureTallyhoState's capRows can splice this same array mid-loop.
      for (const row of t.rivals.slice()) {
        if (row.state !== 'open' && row.state !== 'done') continue;
        const gun = this._rivalEnt(state, row);
        if (!gun) {
          // No body to drive: an open row lost its gun, a done row's ship is gone.
          row.state = row.state === 'open' ? 'gone' : 'left';
          row.settledAt = num(state.simTime);
          continue;
        }
        const gd = gun.data || (gun.data = {});
        const hunt = row.state === 'open'
          ? (t.hunts.find((h) => h.id === row.huntId) || null) : null;
        const quarry = hunt && hunt.state === 'open' ? this._quarryEnt(state, hunt) : null;
        if (row.state === 'done' || !quarry) {
          // The call it ran is over — the gun retires past the ring and deships.
          gd.done = true;
          this._drive(state, gun,
            tallyhoSteerAway(gun.pos, TALLYHO.post, TALLYHO_RIVAL.leaveSpeed));
          if (dist2(gun.pos.x, gun.pos.z, TALLYHO.post.x, TALLYHO.post.z) > leave2) {
            this.helpers?.removeEntity?.(gun.id, { reason: 'tallyho_rival_left' });
            row.state = 'left';
            row.settledAt = num(state.simTime);
            this.bus?.emit('tallyho:rivalLeft', {
              rivalId: row.id, entityId: gun.id, tick: state.tick,
            });
          }
          continue;
        }
        const chase = tallyhoSteer(gun.pos, quarry.pos, TALLYHO_RIVAL.chaseSpeed);
        gd.tallyhoChase = { x: chase.x, z: chase.z };
        this._drive(state, gun, chase);
        if (dist2(gun.pos.x, gun.pos.z, quarry.pos.x, quarry.pos.z)
            <= TALLYHO_RIVAL.killR * TALLYHO_RIVAL.killR) {
          gd.holdT = num(gd.holdT) + dt;
          if (gd.holdT >= TALLYHO_RIVAL.killS) this._poach(state, t, hunt, quarry, row, gun);
        } else if (gd.holdT) {
          gd.holdT = 0;
        }
      }
      // Orphan sweep: a live tagged hull with no open or retiring row is the
      // rail's litter — a loaded save restores the tag but never the occupant's
      // generation, so the row goes 'gone' while the hull stays parked forever.
      // The tag is tallyho's ownership marker: stand it down and deship it.
      // No gun was ever fielded → nothing tagged can exist → skip the walk.
      if (t.rivals.length === 0) return;
      for (const e of state.entityList || []) {
        const d = e && e.data;
        if (!e || e.alive === false || d?.tallyhoRival !== true) continue;
        const row = t.rivals.find((r) => r.id === d.tallyhoRivalId
          && (r.state === 'open' || r.state === 'done'));
        if (row) continue; // a live call or its fly-out retirement owns the hull
        if (d.done !== true) { d.done = true; d.tallyhoHuntId = null; d.holdT = 0; }
        this.helpers?.removeEntity?.(e.id, { reason: 'tallyho_rival_orphan' });
      }
    },

    /** A bus beat drives the same clocks a fixed tick would. The 2 Hz calendar
     *  tick is the steady beat — spawn and kill wires pump the gaps around it
     *  for burst responsiveness. Sparse beats still land honest verdicts because
     *  every deadline reads simTime; only the notice is late. The watermark
     *  stands the pump down wherever a real tick drives (a live update()
     *  refreshes it every step), so the lanes never overlap. */
    _pump() {
      const state = this.state;
      if (!state || !this._adventure()) return;
      const now = num(state.simTime);
      const last = num(this._lastTickAt, -Infinity);
      if (!(now - last >= TALLYHO_HUNT.pumpMinS)) return;
      this._lastTickAt = now;
      // Contact time accumulates on the real gap; the first beat after a reset
      // has no honest gap to bill, so dt is 0 rather than the whole backlog.
      const dt = Number.isFinite(last) ? Math.max(now - last, 0) : 0;
      const t = ensureTallyhoState(state);
      this._tickHunts(state, dt, t);
      this._tickRivals(state, dt, t);
      if (state.mode === 'flight' && this._board()) this._tickBounties(state, t);
    },

    update(dt, state) {
      if (!this.state && state) this.state = state;
      if (!this._adventure()) return;
      const t = ensureTallyhoState(state);
      const now = num(state.simTime);
      const last = num(this._lastTickAt, -Infinity);
      this._lastTickAt = now; // the watermark: the pump yields
      // Bill only the span no beat has covered yet. The registry hands a
      // calendar owner the elapsed sim time since ITS last firing — on the
      // double-driven lane that span can already carry a pump beat, and
      // re-billing it would double-count rival contact seconds (the gun
      // poached early on event bursts). The watermark gap is the honest share;
      // with no pump between ticks it equals the elapsed dt exactly.
      const bill = Number.isFinite(last) ? Math.max(now - last, 0) : 0;
      this._tickHunts(state, bill, t);
      this._tickRivals(state, bill, t);
      if (state.mode === 'flight' && this._board()) this._tickBounties(state, t);
    },

    // ── persistence: hunts, bounties, rival rows and open bets ride the save as one
    // plain-JSON bag. Without it a Continue keeps the bet's charge and drops the bet.
    saveSnapshotOwned: true,

    serialize() {
      if (!this.state) return {};
      return JSON.parse(JSON.stringify(ensureTallyhoState(this.state)));
    },

    deserialize(data) {
      if (!this.state) return undefined;
      // An absent or corrupt bag (a pre-key save) restores to a fresh board.
      this.state.tallyho = isObj(data) ? JSON.parse(JSON.stringify(data)) : null;
      return ensureTallyhoState(this.state);
    },
  };
}

export const tallyho = createTallyho();
