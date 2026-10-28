// faction_verge.js — W-VERGE (build_map §34.5 row 529, bible 02 §14).
//
// "PRESENT. WITNESS. APPEAL." Done-when:
//   · machine bodies: the row's eight kinds carry bodies (VERGE_MACHINE_BODIES data)
//   · directives land on the glass as one capitalized word (`verge:directive`)
//   · the Appeal (E-30): break a directive and a court convenes at the Appeals
//     Clerk; carry the right object at the right mass into the chamber and the
//     appeal is granted — otherwise the directive holds and a law zone grows
//   · the Sleeping Jury (E-34): twelve dormant jurors; one weighed piece of
//     testimony wakes one juror
//   · the Line-site Class trial: a weighed Measure Engine fragment on your Line
//     records the next Class
//   · machines never destroy: nothing here kills; violations and appeals persist
//
// The border-authority expansion keeps the same grammar. The Verge own the gate
// web, so their law reads like a border patrol that never raises a weapon:
//   · checkpoints: auditors, surveyor prisms and executors post a crossing zone;
//     crossing is logged, the hull is weighed, and repeat challenged crossings
//     escalate from a spoken warning to a manifest scan to an escort to a pursuit
//   · transit permits: an Appeals Clerk sells route authority in three tiers —
//     dwell in the counter ring and the highest tier your standing, record and
//     credit can pay for is written; a violation suspends the permit until the
//     court clears you
//   · manifest scans: a challenged crossing orders the real customs machinery
//     (patrol:proximity → economy.runScan — fines, confiscation and rep land on
//     their own seam); the verdict is logged here as a border incident
//   · border incidents: a bounded, age-faded ledger the treatment level reads —
//     the record fades but never lies
//   · reputation-gated treatment: Unread / Noticed / Measured / Kept drive how
//     the checkpoints answer you, which permits are written, whether escorts are
//     demanded and how far a pursuit will run
//   · escort demands: a flagged hull inside a checkpoint too long is walked to
//     the boundary; riding it out expunges the oldest mark, breaking it opens a
//     pursuit
//   · hot pursuit: an executor leaves its post and chases past the checkpoint
//     edge where ordinary machines hold; outrun it and the crossing is posted as
//     woken law, jump the boundary and the flight is filed so any checkpoint can
//     re-acquire you on return
//
// Deterministic: windows and clocks read simTime; weighing stamps true mass.
// State is plain JSON under state.verge; ensureVergeState normalizes absent or
// malformed input (save:loaded re-runs it). Money and standing only move through
// economy:chargeCredits / economy:grantCredits / faction:repDelta, each guarded
// by a durable receipt key so a tick or a restore can never apply one twice.

import {
  VERGE_MACHINE_BODIES,
  VERGE_DIRECTIVE_WORDS,
  VERGE_APPEAL,
  VERGE_SLEEPING_JURY,
  VERGE_LINE_TRIAL,
  VERGE_BARKS,
} from '../data/factions/vergelayers.js';
import { rankForState } from './factions.js';

const dist2 = (a, b) => { const dx = a.x - b.x, dz = a.z - b.z; return dx * dx + dz * dz; };

// The faction id the standing record and every repDelta intent uses.
const VERGE_FACTION_ID = 'faction_verge_layers';

// ── Border-authority tuning ─────────────────────────────────────────────────────
// One table so the whole layer tunes together; nothing here rolls dice at read time.
export const VERGE_BORDER = Object.freeze({
  checkpointRadius: 700,        // default ring a checkpoint machine posts around itself
  checkpointCap: 64,            // bounded checkpoint ledger (oldest evicted)
  unauthorizedToScan: 2,        // repeat challenged crossings at one ring before a scan is ordered
  unauthorizedToPursuit: 3,     // further challenged crossings post a pursuit
  unauthorizedRepHit: -4,       // faction:repDelta once per new strike plateau
  scanCooldownS: 30,            // per-ring minimum between ordered scans
  scanMinIntervalS: 8,          // global minimum between ordered scans
  scanSecurity: 0.75,           // security handed to the real scan (Verge reads are good, not perfect)
  permitRadius: 320,            // counter ring around an issuer
  permitDwellS: 5,              // hold this long inside the ring to file for a permit
  permitCooldownS: 30,          // an issuer stays quiet this long after a decision
  permitValidS: 20 * 60,        // route authority is sold by the window, not the season
  massFinePerUnit: 8,           // cr per unit of cargo mass over the stamped cap
  massDriftTolerance: 0.5,      // a hull's mass may not disagree with the last weigh by more
  escortRadius: 260,            // hold this close to the warden or the escort is broken
  escortWalkSpeed: 22,          // a walking warden moves no faster than this
  escortDwellS: 4,              // a flagged hull inside a ring this long may be walked
  escortHoldS: 20,              // stationary escort duration (machines that cannot walk)
  escortWalkR: 900,             // a mobile warden walks you this far out before release
  escortMaxS: 60,               // walking escorts release here even short of the walk radius
  escortGraceS: 3,              // tolerated drift outside the escort radius before it counts broken
  escortCooldownS: 60,          // a ring that ran one escort waits before demanding another
  pursuitCatchR: 120,           // an interceptor this close has caught you
  pursuitEscapeR: 3400,         // beyond this the crossing is written and the machine posts back
  pursuitColdS: 120,            // a pursuit with no sighting this long goes cold
  pursuitSubmitR: 320,          // hold this close to any ring to submit
  pursuitSubmitS: 3,            // submission takes this long of held stillness
  pursuitSpeedMult: 2.0,        // pursuit machines run at this multiple of their body speed
  pursuitMaxSpeed: 90,          // and never faster than this
  pursuitFineCr: 900,           // submission/interception fine base (severity scales it)
  returnCap: 16,                // bounded owed-return ledger (wardens displaced cross-sector)
  returnClaimR: 64,             // a post's nameless rematerialized warden answers this near its post
  incidentCap: 32,              // bounded border-incident ledger
  incidentFreshS: 300,          // an incident weighs full for this long
  incidentStaleS: 2400,         // then half until this age; the record remains either way
  permitLogCap: 24,
  receiptCap: 128,              // dedupe keys for once-only money/standing effects
  lawZoneCap: 96,               // shared bag with worldPressure's own cap; never grow past this
  violationCap: 32,             // the court's docket is bounded too
  appealCap: 32,
  cleanStreakForRep: 5,         // this many clean crossings in a row earns a standing note
  watchEscalateAt: 3,           // challenged crossings sector-wide before the Line watches you
  honoredForMeasured: 3,        // this many honored directives reads as proven compliance
});

// Route authority tiers. minRankStep is the factions rank step (0 Unread … 3 Kept);
// wavesScan lets a clean permit holder pass a ring without the manifest read;
// bondReturnCr rides home when a sealed window closes with no violations on it.
export const VERGE_PERMIT_TIERS = Object.freeze([
  Object.freeze({ tier: 1, id: 'transit', minRankStep: 1, feeCr: 240, wavesScan: false }),
  Object.freeze({ tier: 2, id: 'bonded', minRankStep: 1, feeCr: 780, wavesScan: true }),
  Object.freeze({ tier: 3, id: 'sealed', minRankStep: 2, feeCr: 2100, wavesScan: true, bondReturnCr: 420 }),
]);

// Severity weights for the incident ledger; a negative weight is a record that
// reads in the player's favor (supervised passage expunges, an appeal won).
export const VERGE_INCIDENT_KINDS = Object.freeze({
  directive_violation: 2,
  unauthorized_crossing: 2,
  overweight_manifest: 2,
  mass_drift: 1,
  contraband: 4,
  scan_evaded: 2,
  repeat_offender: 2,
  escort_broken: 3,
  pursuit_escape: 4,
  boundary_flight: 3,
  intercepted: 3,
  submitted: 1,
  pursuit_cold: 1,          // the trail went cold — mild, and not the hull's doing
  escorted: -2,
  appeal_won: -1,
});

// Machine voice, same register as VERGE_BARKS: one procedural line per beat.
export const VERGE_BORDER_LINES = Object.freeze({
  logged: 'TRANSIT LOGGED.',
  unauthorized: 'ROUTE AUTHORITY REQUIRED.',
  scanOrder: 'HOLD FOR MANIFEST READING.',
  massFined: 'UNLOGGED MASS. THE SCALE FILES THE DIFFERENCE.',
  massDrift: 'HULL MASS DISAGREES WITH THE RECORD.',
  permitGranted: 'ROUTE AUTHORITY GRANTED.',
  permitDenied: 'TRANSIT AUTHORITY WITHHELD.',
  permitLapsed: 'THE WINDOW CLOSES.',
  permitSuspended: 'AUTHORITY SUSPENDED PENDING THE COURT.',
  permitReinstated: 'AUTHORITY REINSTATED.',
  escortDemand: 'FOLLOW THE WARDEN.',
  escortRelease: 'SUPERVISED PASSAGE COMPLETE.',
  escortBroken: 'ESCORT BROKEN.',
  pursuitOpen: 'PURSUIT POSTED.',
  pursuitEscaped: 'THE CROSSING IS RECORDED.',
  pursuitCrossed: 'BOUNDARY FLIGHT FILED.',
  pursuitResumed: 'PURSUIT REACQUIRED.',
  pursuitSubmitted: 'SUBMISSION ACCEPTED.',
  intercepted: 'INTERCEPT COMPLETE.',
  treatmentKept: 'THE LINE KNOWS THIS HULL.',
  treatmentHostile: 'THE LINE MARKS THIS HULL.',
  cleanStreak: 'PATTERN OF COMPLIANCE NOTED.',
});

// Machine kinds that post a checkpoint ring when no authored ring says otherwise.
const VERGE_CHECKPOINT_KINDS = new Set(['auditor', 'surveyor_prism', 'executor']);
// Machines that write route authority at their counter.
const VERGE_PERMIT_KINDS = new Set(['appeals_clerk', 'auditor']);
// Kinds able to walk an escort or run a pursuit under this file's driver.
// Both machine contracts qualify — the precursor kinematics loop yields a
// body to this file for as long as data.vergeDriven marks it.
const VERGE_WALK_KINDS = new Set(['surveyor_prism', 'executor']);

/** Kind under either contract: flat data.machineKind (this file) or data.machine.kind (precursor layer). */
function vergeMachineKind(e) {
  const d = e && e.data;
  if (!d) return null;
  if (typeof d.machineKind === 'string') return d.machineKind;
  const m = d.machine;
  return m && typeof m.kind === 'string' ? m.kind : null;
}

/** This file drives any body whose kind carries a working speed — the flat
 *  contract (data.machineKind) and the precursor contract (data.machine.kind)
 *  alike. The precursor kinematics loop yields a body while data.vergeDriven
 *  marks it driven; the record sets the flag on acquisition and drops it on
 *  every close path. pursuitMobile === false stays an authored opt-out. */
function vergeMachineIsMobile(e) {
  const d = e && e.data;
  if (!d || d.pursuitMobile === false) return false;
  const kind = vergeMachineKind(e);
  const body = kind && VERGE_MACHINE_BODIES[kind];
  return !!(body && body.speed > 0);
}

/** Take/release motion ownership of a body: while data.vergeDriven is set the
 *  precursor kinematics loop leaves the body to this file's escort/pursuit/
 *  return drivers. Set when a record acquires the body, cleared on close. */
function vergeDrive(e) {
  const d = e && e.data;
  if (d) d.vergeDriven = true;
}
function vergeReleaseDrive(e) {
  const d = e && e.data;
  if (d && d.vergeDriven === true) delete d.vergeDriven;
}

/** Occupant-generation guard: entity ids recycle, a stored (id, gen) pair does not lie. */
function vergeEntityCurrent(state, id, gen) {
  if (id == null || !state || !state.entities || typeof state.entities.get !== 'function') return null;
  const e = state.entities.get(id);
  if (!e || e.alive === false) return null;
  if (gen > 0 && Number.isFinite(e.occupantGeneration) && e.occupantGeneration !== gen) return null;
  return e;
}

/** A checkpoint ring record on an entity, or null when it posts none. */
function vergeCheckpointFor(e) {
  const d = e && e.data;
  if (!d || !e.pos) return null;
  const kind = vergeMachineKind(e);
  const authored = d.vergeCheckpoint && typeof d.vergeCheckpoint === 'object' ? d.vergeCheckpoint : null;
  if (authored && authored.enabled === false) return null;
  if (!authored && !VERGE_CHECKPOINT_KINDS.has(kind)) return null;
  const radius = Number(authored && authored.radius) || VERGE_BORDER.checkpointRadius;
  if (!(radius > 0)) return null;
  return {
    // An authored checkpointId keys the record to the site, not the body — a
    // respawned warden inherits the same ledger entry and its strikes.
    key: typeof d.checkpointId === 'string' && d.checkpointId ? `cp:${d.checkpointId}` : `cp:m${e.id}`,
    radius,
    tier: Number.isFinite(authored && authored.tier) ? authored.tier : 0,
  };
}

/** Fresh serializable Verge record: violations, the court, the jury, law zones, grants. */
export function ensureVergeState(state) {
  if (!state.verge || typeof state.verge !== 'object') {
    state.verge = {
      violations: [], court: null, lawZones: [],
      jurors: Array(VERGE_SLEEPING_JURY.jurorCount).fill(false),
      jurorsAwake: 0, appeals: [], lineClassGrants: 0,
    };
  }
  const v = state.verge;
  // Active records (docket, court, zones) keep their content — the writers cap
  // them; normalize repairs shape only. Ledgers that self-describe as bounded
  // history (incidents, receipts, checkpoints, permitLog) splice on load.
  if (!Array.isArray(v.violations)) v.violations = [];
  if (v.court === undefined) v.court = null;
  else if (v.court !== null) {
    // Only a sitting court survives normalize — convened on a safe-int clerk
    // id. A malformed bench wedges the docket: _recordViolation refuses to
    // convene over a truthy court and _tickAppeal cannot seat a garbage id.
    const c = v.court;
    if (typeof c !== 'object' || Array.isArray(c) || c.convened !== true
        || !Number.isSafeInteger(c.clerkId)) {
      v.court = null;
    } else {
      if (!Number.isFinite(c.clerkGen) || c.clerkGen < 0) c.clerkGen = 0;
      if (!Number.isFinite(c.at)) c.at = 0;
    }
  }
  if (!Array.isArray(v.lawZones)) v.lawZones = [];
  if (!Array.isArray(v.jurors) || v.jurors.length !== VERGE_SLEEPING_JURY.jurorCount) {
    v.jurors = Array(VERGE_SLEEPING_JURY.jurorCount).fill(false);
  } else {
    for (let i = 0; i < v.jurors.length; i++) v.jurors[i] = v.jurors[i] === true;
  }
  // Awake count is derived, never stored truth — a malformed record cannot
  // disagree with the seats.
  v.jurorsAwake = v.jurors.reduce((n, j) => n + (j ? 1 : 0), 0);
  if (!Array.isArray(v.appeals)) v.appeals = [];
  if (!Number.isFinite(v.lineClassGrants)) v.lineClassGrants = 0;

  // ── Border-authority expansion: every field normalized the same way — absent,
  //    malformed or hostile input degrades to the empty record, never throws.
  if (!Number.isSafeInteger(v.seq) || v.seq < 0) v.seq = 0;
  if (!v.checkpoints || typeof v.checkpoints !== 'object' || Array.isArray(v.checkpoints)) v.checkpoints = {};
  else {
    // Bound the ledger and drop entries that cannot be records.
    for (const k of Object.keys(v.checkpoints)) {
      const r = v.checkpoints[k];
      if (!r || typeof r !== 'object' || Array.isArray(r)) delete v.checkpoints[k];
    }
    const live = Object.keys(v.checkpoints);
    if (live.length > VERGE_BORDER.checkpointCap) {
      live.sort((a, b) => (Number(v.checkpoints[a].lastAt) || 0) - (Number(v.checkpoints[b].lastAt) || 0));
      for (let i = 0; i < live.length - VERGE_BORDER.checkpointCap; i++) delete v.checkpoints[live[i]];
    }
  }
  if (!Array.isArray(v.incidents)) v.incidents = [];
  if (v.incidents.length > VERGE_BORDER.incidentCap) {
    v.incidents.splice(0, v.incidents.length - VERGE_BORDER.incidentCap);
  }
  if (!Array.isArray(v.receipts)) v.receipts = [];
  if (v.receipts.length > VERGE_BORDER.receiptCap) {
    v.receipts.splice(0, v.receipts.length - VERGE_BORDER.receiptCap);
  }
  if (!Array.isArray(v.permitLog)) v.permitLog = [];
  if (v.permitLog.length > VERGE_BORDER.permitLogCap) {
    v.permitLog.splice(0, v.permitLog.length - VERGE_BORDER.permitLogCap);
  }
  if (v.permit === undefined) v.permit = null;
  else if (v.permit !== null) {
    const p = v.permit;
    const tierOk = Number.isSafeInteger(p.tier) && p.tier >= 1
      && VERGE_PERMIT_TIERS.some((t) => t.tier === p.tier && t.id === p.tierId);
    if (!tierOk || !Number.isFinite(p.issuedAt) || !Number.isFinite(p.expiresAt)) v.permit = null;
    else {
      if (typeof p.issuerKey !== 'string') p.issuerKey = '';
      if (typeof p.receiptId !== 'string') p.receiptId = '';
      if (p.suspended !== true) p.suspended = false;
    }
  }
  if (!v.scans || typeof v.scans !== 'object' || Array.isArray(v.scans)) {
    v.scans = {
      seq: 0, pendingPatrol: null, pendingKey: null, lastAt: -1e9,
      lastPatrol: null, lastResult: null, lastResultAt: -1e9,
      total: 0, clean: 0, found: 0, evaded: 0,
    };
  } else {
    const s = v.scans;
    if (!Number.isSafeInteger(s.seq) || s.seq < 0) s.seq = 0;
    if (s.pendingPatrol !== null && !Number.isSafeInteger(s.pendingPatrol)) s.pendingPatrol = null;
    if (s.pendingPatrol === null) s.pendingKey = null;
    else if (typeof s.pendingKey !== 'string') s.pendingKey = null;
    if (s.lastPatrol !== null && !Number.isSafeInteger(s.lastPatrol)) s.lastPatrol = null;
    if (typeof s.lastResult !== 'string') s.lastResult = null;
    if (!Number.isFinite(s.lastResultAt)) s.lastResultAt = -1e9;
    if (!Number.isFinite(s.lastAt)) s.lastAt = -1e9;
    for (const k of ['total', 'clean', 'found', 'evaded']) {
      if (!Number.isSafeInteger(s[k]) || s[k] < 0) s[k] = 0;
    }
  }
  if (v.escort === undefined) v.escort = null;
  else if (v.escort !== null) {
    const e = v.escort;
    if (!Number.isSafeInteger(e.machineId) || !Number.isFinite(e.demandedAt)) v.escort = null;
    else {
      if (!Number.isSafeInteger(e.id) || e.id < 0) e.id = 0;
      if (!Number.isFinite(e.gen) || e.gen < 0) e.gen = 0;
      if (e.mode !== 'walk') e.mode = 'hold';
      if (!Number.isFinite(e.untilAt)) e.untilAt = e.demandedAt + VERGE_BORDER.escortHoldS;
      if (!Number.isFinite(e.holdR) || e.holdR <= 0) e.holdR = VERGE_BORDER.escortRadius;
      if (!Number.isFinite(e.originX)) e.originX = 0;
      if (!Number.isFinite(e.originZ)) e.originZ = 0;
      if (!Number.isFinite(e.dirX)) e.dirX = 0;
      if (!Number.isFinite(e.dirZ)) e.dirZ = 0;
      if (!Number.isFinite(e.walkedR)) e.walkedR = 0;
      if (!Number.isFinite(e.graceUsed)) e.graceUsed = 0;
      if (typeof e.sectorId !== 'string') e.sectorId = '';
    }
  }
  if (v.pursuit === undefined) v.pursuit = null;
  else if (v.pursuit !== null) {
    const p = v.pursuit;
    // A 'closed' record is dead weight — _closePursuit always nulls the slot
    // itself, so a surviving closed mark is hostile input; drop it whole.
    if (!Number.isSafeInteger(p.machineId) || !Number.isFinite(p.openedAt)
        || p.status === 'closed') v.pursuit = null;
    else {
      if (!Number.isSafeInteger(p.id) || p.id < 0) p.id = 0;
      if (!Number.isFinite(p.gen) || p.gen < 0) p.gen = 0;
      if (!Number.isFinite(p.originX)) p.originX = 0;
      if (!Number.isFinite(p.originZ)) p.originZ = 0;
      if (!Number.isFinite(p.lastSeenAt)) p.lastSeenAt = p.openedAt;
      if (p.status !== 'crossed') p.status = 'hot';
      if (typeof p.sectorId !== 'string') p.sectorId = '';
      if (!Number.isFinite(p.crossedAt)) p.crossedAt = 0;
      if (!Number.isFinite(p.submitS)) p.submitS = 0;
      if (!Number.isFinite(p.fine) || p.fine < 0) p.fine = VERGE_BORDER.pursuitFineCr;
    }
  }
  // Owed cross-sector returns: a bounded ledger of posts a displaced warden
  // still owes, keyed to the occupant and the site that outlives it. A row
  // that cannot name a post is dead weight — normalize repairs shape only.
  if (!Array.isArray(v.returns)) v.returns = [];
  else {
    v.returns = v.returns.filter((r) => r && typeof r === 'object' && !Array.isArray(r)
      && Number.isSafeInteger(r.machineId)
      && Number.isFinite(r.x) && Number.isFinite(r.z));
    for (const r of v.returns) {
      if (!Number.isFinite(r.gen) || r.gen < 0) r.gen = 0;
      if (typeof r.sectorId !== 'string') r.sectorId = '';
      if (typeof r.key !== 'string') r.key = '';
      if (typeof r.siteId !== 'string') r.siteId = '';
      if (typeof r.kind !== 'string') r.kind = '';
      if (!Number.isFinite(r.at)) r.at = 0;
    }
    if (v.returns.length > VERGE_BORDER.returnCap) {
      v.returns.splice(0, v.returns.length - VERGE_BORDER.returnCap);
    }
  }
  if (!v.watch || typeof v.watch !== 'object' || Array.isArray(v.watch)) {
    v.watch = { unauthorized: 0, cleanStreak: 0, cleanTotal: 0, directivesHonored: 0, level: 0 };
  } else {
    const w = v.watch;
    for (const k of ['unauthorized', 'cleanStreak', 'cleanTotal', 'directivesHonored', 'level']) {
      if (!Number.isSafeInteger(w[k]) || w[k] < 0) w[k] = 0;
    }
  }
  if (!v.treatment || typeof v.treatment !== 'object' || Array.isArray(v.treatment)) {
    v.treatment = { level: 1, sinceAt: 0 };
  } else {
    if (!Number.isSafeInteger(v.treatment.level) || v.treatment.level < 0 || v.treatment.level > 3) {
      v.treatment.level = 1;
    }
    if (!Number.isFinite(v.treatment.sinceAt)) v.treatment.sinceAt = 0;
  }
  return v;
}

export const vergeCourt = {
  name: 'vergeCourt',
  // serialize() already returns a fresh deep clone — the envelope's defensive
  // copy would only clone a clone.
  saveSnapshotOwned: true,

  init(ctx) {
    this.ctx = ctx; this.state = ctx.state; this.bus = ctx.bus;
    ensureVergeState(this.state);
    this._unsubs = [];
    const on = (event, fn) => {
      const off = this.bus && typeof this.bus.on === 'function' ? this.bus.on(event, fn) : null;
      if (typeof off === 'function') this._unsubs.push(off);
    };
    // A restore must never double-apply and must never trust stale shape.
    on('save:loaded', () => ensureVergeState(this.state));
    // A dead warden cannot hold an escort or run a pursuit; the record closes honest.
    on('entity:killed', (p) => this._onEntityKilled(p));
    // The boundary: jumping with a live escort breaks it; jumping with a live
    // pursuit files boundary flight and posts law where you crossed.
    on('jump:start', (p) => this._onJumpStart(p));
    on('sector:enter', (p) => this._onSectorEnter(p));
    // Scan verdicts route back through the real customs seam's events.
    on('player:scannedByPatrol', (p) => this._onScannedByPatrol(p));
    on('contraband:scanned', (p) => this._onContrabandScanned(p));
  },

  destroy() {
    for (const off of this._unsubs || []) {
      try { off && off(); } catch { /* listener hygiene */ }
    }
    this._unsubs = [];
  },

  // ── persistence: the whole record rides the save as one plain-JSON bag ──────
  // Paid permits, the incident ledger, the receipt dedupe keys, the court and
  // the live marks all survive a save boundary — a paid window must not vanish
  // and a laundered record is not a record at all.
  serialize() {
    const state = this.state;
    if (!state) return {};
    return JSON.parse(JSON.stringify(ensureVergeState(state)));
  },

  deserialize(data) {
    const state = this.state;
    if (!state) return;
    state.verge = (data && typeof data === 'object' && !Array.isArray(data)) ? data : null;
    // The same normalize the save:loaded listener re-runs on the restore seam —
    // absent, malformed or hostile input heals to the fresh record, never wedges.
    return ensureVergeState(state);
  },

  // ── shared record helpers ─────────────────────────────────────────────────────

  _nextId(state, prefix) {
    const v = ensureVergeState(state);
    v.seq += 1;
    return `${prefix}_${v.seq}`;
  },

  /** Once-only guard for money/standing effects — same-session and restore safe. */
  _receipt(state, key) {
    const v = ensureVergeState(state);
    if (v.receipts.indexOf(key) >= 0) return false;
    v.receipts.push(key);
    while (v.receipts.length > VERGE_BORDER.receiptCap) v.receipts.shift();
    return true;
  },

  _checkpointRec(state, key) {
    const v = ensureVergeState(state);
    let rec = v.checkpoints[key];
    if (!rec) {
      const keys = Object.keys(v.checkpoints);
      if (keys.length >= VERGE_BORDER.checkpointCap) {
        let oldest = null, oldestAt = Infinity;
        for (const k of keys) {
          const at = Number(v.checkpoints[k] && v.checkpoints[k].lastAt) || 0;
          if (at < oldestAt) { oldestAt = at; oldest = k; }
        }
        if (oldest != null) delete v.checkpoints[oldest];
      }
      rec = v.checkpoints[key] = { crossings: 0, unauthorized: 0, strikes: 0, lastAt: 0 };
    }
    for (const k of ['crossings', 'unauthorized', 'strikes']) {
      if (!Number.isSafeInteger(rec[k]) || rec[k] < 0) rec[k] = 0;
    }
    if (!Number.isFinite(rec.lastAt)) rec.lastAt = 0;
    return rec;
  },

  _fileIncident(state, kind, machine, note) {
    const v = ensureVergeState(state);
    const incident = {
      id: this._nextId(state, 'inc'),
      kind: String(kind),
      weight: VERGE_INCIDENT_KINDS[kind] != null ? VERGE_INCIDENT_KINDS[kind] : 1,
      at: state.simTime,
      sectorId: (state.world && state.world.currentSectorId) || null,
      machineId: machine ? machine.id : null,
      note: typeof note === 'string' ? note : '',
    };
    v.incidents.push(incident);
    while (v.incidents.length > VERGE_BORDER.incidentCap) v.incidents.shift();
    this.bus.emit('verge:incident', {
      incident: { ...incident }, weight: incident.weight, tick: state.tick,
    });
    return incident;
  },

  /** Freshness-weighted severity the treatment level reads — the record fades. */
  _incidentWeight(state) {
    const v = ensureVergeState(state);
    const now = Number(state.simTime) || 0;
    let w = 0;
    for (const inc of v.incidents) {
      const age = now - (Number(inc.at) || 0);
      if (age < 0) continue;
      if (age <= VERGE_BORDER.incidentFreshS) w += Number(inc.weight) || 0;
      else if (age <= VERGE_BORDER.incidentStaleS) w += (Number(inc.weight) || 0) * 0.5;
    }
    return w;
  },

  _inLawZone(v, pos) {
    if (!pos) return false;
    for (const z of v.lawZones) {
      if (!z || !Number.isFinite(z.x) || !Number.isFinite(z.z) || !(z.r > 0)) continue;
      const dx = pos.x - z.x, dz = pos.z - z.z;
      if (dx * dx + dz * dz <= z.r * z.r) return true;
    }
    return false;
  },

  _pushLawZone(state, x, z, r) {
    const v = ensureVergeState(state);
    if (v.lawZones.length >= VERGE_BORDER.lawZoneCap) return false;
    v.lawZones.push({ x, z, r, at: state.simTime });
    return true;
  },

  _log(state, text, speaker) {
    this.bus.emit('comms:log', { text, speaker: speaker || 'Verge machine' });
  },

  _sayDirective(state, machine, directive) {
    const word = VERGE_DIRECTIVE_WORDS[directive] || `${directive}.`;
    this.bus.emit('verge:directive', {
      machineId: machine.id, directive, word, tick: state.tick,
    });
    this._log(state, word);
  },

  // ── treatment: Unread / Noticed / Measured / Kept as border posture ───────────
  _tickTreatment(state) {
    const v = ensureVergeState(state);
    const player = state.entities.get(state.playerId);
    const rank = rankForState(state, VERGE_FACTION_ID);
    const severity = this._incidentWeight(state);
    const violations = v.violations.length;
    const inLaw = !!(player && player.pos && this._inLawZone(v, player.pos));
    const permit = v.permit;
    const permitLive = !!(permit && !permit.suspended && state.simTime < permit.expiresAt);

    // Challenged crossings raise the watch; the Line knows repeat hulls.
    const newWatch = v.watch.unauthorized >= VERGE_BORDER.watchEscalateAt * 2 ? 2
      : v.watch.unauthorized >= VERGE_BORDER.watchEscalateAt ? 1 : 0;
    if (newWatch !== v.watch.level) v.watch.level = newWatch;

    let level;
    if (rank.step <= 0 || violations >= 3 || severity >= 8 || (inLaw && violations > 0)) {
      level = 0; // the Line marks this hull
    } else if ((rank.step >= 3 && violations === 0) || (permitLive && permit.tier >= 3)) {
      level = 3; // kept: route authority is assumed
    } else if ((rank.step >= 2 && violations === 0)
        || (permitLive && permit.tier >= 2)
        || (v.watch.directivesHonored >= VERGE_BORDER.honoredForMeasured
            && violations === 0 && severity <= 1)) {
      level = 2; // measured: a proven-compliant or paid-up hull reads lighter
    } else {
      level = 1; // watched: the default border answer
    }

    if (level !== v.treatment.level) {
      const from = v.treatment.level;
      v.treatment.level = level;
      v.treatment.sinceAt = state.simTime;
      this.bus.emit('verge:treatmentChanged', { from, to: level, tick: state.tick });
      if (level === 0) this._log(state, VERGE_BORDER_LINES.treatmentHostile, 'Verge checkpoint');
      else if (level === 3) this._log(state, VERGE_BORDER_LINES.treatmentKept, 'Verge checkpoint');
    }
    return v.treatment.level;
  },

  // ── checkpoints: crossing is logged, weighed and answered ─────────────────────
  _tickCheckpoints(state, dt) {
    const v = ensureVergeState(state);
    const player = state.entities.get(state.playerId);
    if (!player || player.alive === false || !player.pos) return;
    if (player.flags && player.flags.docked === true) return;
    const level = v.treatment.level;

    for (const m of state.entityList) {
      if (!m || m.alive === false || m.id === player.id) continue;
      const cp = vergeCheckpointFor(m);
      if (!cp) continue;
      const d = m.data;
      const inside = dist2(player.pos, m.pos) <= cp.radius * cp.radius;
      const wasInside = d.cpInside === true;
      if (inside && !wasInside) {
        d.cpInside = true;
        this._checkpointEnter(state, v, m, d, cp, player, level);
      } else if (!inside && wasInside) {
        d.cpInside = false;
        d.escortDwell = 0;
        this._checkpointRec(state, cp.key).lastAt = state.simTime;
      }
      // Escort evaluation runs on dwell inside the ring, not on the edge.
      if (inside) this._maybeEscort(state, v, m, d, player, level, dt);
    }
  },

  _checkpointEnter(state, v, m, d, cp, player, level) {
    const rec = this._checkpointRec(state, cp.key);
    rec.crossings += 1;
    rec.lastAt = state.simTime;

    // The ring weighs every hull that crosses — the same stamp the engines write.
    player.data = player.data || {};
    const priorMass = player.data.weighedMass;
    player.data.weighedMass = player.mass;
    player.data.weighedBy = m.id;
    player.data.weighedAt = state.simTime;
    this.bus.emit('verge:massWeighed', {
      engineId: m.id, entityId: player.id, mass: player.mass, tick: state.tick,
    });
    // Mass that changed since the last weigh reads as an unlogged refit.
    if (Number.isFinite(priorMass) && Math.abs(player.mass - priorMass) > VERGE_BORDER.massDriftTolerance) {
      this._fileIncident(state, 'mass_drift', m,
        `hull mass ${Math.round(priorMass)} → ${Math.round(player.mass)}`);
      this._log(state, VERGE_BORDER_LINES.massDrift, 'Checkpoint');
    }

    // Unlogged mass on the manifest: the scale files the difference, once per crossing.
    const cargo = state.player && state.player.cargo;
    const overMass = cargo && Number(cargo.usedMass) > Number(cargo.capMass)
      ? Number(cargo.usedMass) - Number(cargo.capMass) : 0;
    if (overMass > 0 && this._receipt(state, `massfine:${cp.key}:${rec.crossings}`)) {
      const fine = Math.max(1, Math.round(overMass * VERGE_BORDER.massFinePerUnit));
      this.bus.emit('economy:chargeCredits', { amount: fine, reason: 'verge:manifest_fine' });
      this.bus.emit('verge:manifestFined', {
        key: cp.key, machineId: m.id, amount: fine, overMass: Math.round(overMass * 10) / 10,
        tick: state.tick,
      });
      this._fileIncident(state, 'overweight_manifest', m, `over ${Math.round(overMass)} mass`);
      this._sayDirective(state, m, 'ISOLATE');
      this._log(state, VERGE_BORDER_LINES.massFined, 'Checkpoint');
    }

    const permit = v.permit;
    const permitLive = !!(permit && !permit.suspended && state.simTime < permit.expiresAt);
    const marked = v.violations.length > 0 || level === 0;
    const needsPermit = cp.tier > 0;
    // On the watchlist every ring reads strict; a live permit answers the watch.
    const cleared = !marked && (needsPermit
      ? (permitLive && permit.tier >= cp.tier)
      : (v.watch.level < 2 || permitLive));

    if (cleared) {
      rec.strikes = 0;
      v.watch.cleanStreak += 1;
      v.watch.cleanTotal += 1;
      this.bus.emit('verge:checkpointCleared', {
        key: cp.key, machineId: m.id, permitTier: permitLive ? permit.tier : 0, tick: state.tick,
      });
      this._log(state, VERGE_BORDER_LINES.logged, 'Checkpoint');
      this._cleanStreakRep(state, v);
      return;
    }

    // Challenged: an unpermitted crossing at a strict ring, or any marked hull.
    rec.unauthorized += 1;
    v.watch.unauthorized += 1;
    v.watch.cleanStreak = 0;
    rec.strikes += 1;
    this.bus.emit('verge:checkpointChallenged', {
      key: cp.key, machineId: m.id, strikes: rec.strikes,
      permitted: permitLive, tier: cp.tier, tick: state.tick,
    });
    if (needsPermit && !permitLive) this._log(state, VERGE_BORDER_LINES.unauthorized, 'Checkpoint');
    else this._log(state, VERGE_BORDER_LINES.scanOrder, 'Checkpoint');

    if (!(marked || rec.strikes >= VERGE_BORDER.unauthorizedToScan)) return;

    this._fileIncident(state, rec.strikes >= VERGE_BORDER.unauthorizedToPursuit ? 'repeat_offender' : 'unauthorized_crossing', m,
      `crossing ${rec.crossings}, strike ${rec.strikes}`);
    if (this._receipt(state, `cp_rep:${cp.key}:${rec.strikes}`)) {
      this.bus.emit('faction:repDelta', {
        factionId: VERGE_FACTION_ID, delta: VERGE_BORDER.unauthorizedRepHit,
        reason: 'verge:unauthorized_crossing',
      });
    }
    const wavesScan = permitLive && !marked
      && VERGE_PERMIT_TIERS.some((t) => t.tier === permit.tier && t.wavesScan === true);
    if (!wavesScan) this._orderScan(state, v, m, cp.key, true);
    if (rec.strikes >= VERGE_BORDER.unauthorizedToPursuit && !v.pursuit) {
      this._openPursuit(state, v, m, 'repeat_crossings');
    }
  },

  _cleanStreakRep(state, v) {
    if (v.watch.cleanStreak <= 0) return;
    if (v.watch.cleanStreak % VERGE_BORDER.cleanStreakForRep !== 0) return;
    // Lifetime clean crossings key the receipt — a broken streak earns its note again.
    const streakNo = Math.floor(v.watch.cleanTotal / VERGE_BORDER.cleanStreakForRep);
    if (!this._receipt(state, `streak:${streakNo}`)) return;
    this.bus.emit('faction:repDelta', {
      factionId: VERGE_FACTION_ID, delta: 1, reason: 'verge:clean_transit',
    });
    this._log(state, VERGE_BORDER_LINES.cleanStreak, 'Verge checkpoint');
  },

  // ── manifest scans through the real customs seam ──────────────────────────────
  _orderScan(state, v, m, key, ringCooldown) {
    const s = v.scans;
    // runScan answers in the same dispatch; a pending marker older than a beat
    // means no customs listener heard us — void it so the border never jams.
    if (s.pendingPatrol !== null && state.simTime - s.lastAt > 1) {
      this._resolvePendingScan(state, 'void');
    }
    if (s.pendingPatrol !== null) return false;               // one read outstanding is enough
    if (state.simTime - s.lastAt < VERGE_BORDER.scanMinIntervalS) return false;
    const d = m.data || {};
    if (ringCooldown && Number.isFinite(d.cpScanAt)
        && state.simTime < d.cpScanAt + VERGE_BORDER.scanCooldownS) return false;
    if (ringCooldown) d.cpScanAt = state.simTime;
    s.seq += 1;
    s.pendingPatrol = m.id;
    s.pendingKey = key;
    s.lastAt = state.simTime;
    s.total += 1;
    this.bus.emit('verge:checkpointScan', { key, machineId: m.id, seq: s.seq, tick: state.tick });
    this._sayDirective(state, m, 'HOLD');
    this._log(state, VERGE_BORDER_LINES.scanOrder, 'Checkpoint');
    // economy.runScan answers synchronously: player:scannedByPatrol always and
    // contraband:scanned when the read finds cargo — the listeners below close
    // s.pendingPatrol inside this same dispatch.
    this.bus.emit('patrol:proximity', {
      patrolId: m.id, factionId: VERGE_FACTION_ID,
      security: VERGE_BORDER.scanSecurity, source: 'verge_checkpoint',
    });
    return true;
  },

  _resolvePendingScan(state, result) {
    const v = ensureVergeState(state);
    const s = v.scans;
    if (s.pendingPatrol === null) return null;
    const out = { patrolId: s.pendingPatrol, key: s.pendingKey, result };
    s.pendingPatrol = null;
    s.pendingKey = null;
    s.lastPatrol = out.patrolId;
    s.lastResult = result;
    s.lastResultAt = state.simTime;
    if (result === 'clean') s.clean += 1;
    else if (result === 'evaded') s.evaded += 1;
    else if (result === 'found') s.found += 1;
    this.bus.emit('verge:scanLogged', {
      key: out.key, patrolId: out.patrolId, result, tick: state.tick,
    });
    return out;
  },

  _onScannedByPatrol(p) {
    const state = this.state;
    if (!state || !p || p.patrolId == null) return;
    const v = ensureVergeState(state);
    if (v.scans.pendingPatrol !== p.patrolId) return;
    if (!p.hasContraband) {
      this._resolvePendingScan(state, 'clean');
    } else if (p.detected === false) {
      this._resolvePendingScan(state, 'evaded');
      const machine = vergeEntityCurrent(state, p.patrolId, 0);
      this._fileIncident(state, 'scan_evaded', machine, 'manifest read evaded');
    } else {
      // Detected (or a hand-emitted packet): the contraband:scanned tail files it.
      this._resolvePendingScan(state, 'found');
    }
  },

  _onContrabandScanned(p) {
    const state = this.state;
    if (!state || !p || p.patrolId == null) return;
    const v = ensureVergeState(state);
    const s = v.scans;
    // Correlate to the scan this system ordered. runScan emits scannedByPatrol
    // first, so the pending marker may already be resolved into lastPatrol —
    // either slot counts, but only inside the same sim tick.
    let correlated = false;
    if (s.pendingPatrol === p.patrolId) {
      this._resolvePendingScan(state, 'found');
      correlated = true;
    } else if (s.lastPatrol === p.patrolId && s.lastResult === 'found'
        && s.lastResultAt === state.simTime) {
      correlated = true;
    }
    if (!correlated) return;
    s.lastResult = 'logged';   // consume: a second same-tick packet cannot double-file
    if (p.found === false) return;
    const machine = vergeEntityCurrent(state, p.patrolId, 0);
    const fine = Number.isFinite(p.fine) ? Math.round(p.fine) : 0;
    this._fileIncident(state, 'contraband', machine,
      `${Array.isArray(p.confiscated) ? p.confiscated.length : 0} lots, fine ${fine}`);
  },

  // ── permits: route authority written at the counter ───────────────────────────
  _permitIssuer(e) {
    const d = e && e.data;
    if (!d) return null;
    const kind = vergeMachineKind(e);
    if (d.permitIssuer !== true && !VERGE_PERMIT_KINDS.has(kind)) return null;
    const radius = Number(d.permitRadius) || VERGE_BORDER.permitRadius;
    return { radius };
  },

  _tickPermits(state, dt) {
    const v = ensureVergeState(state);
    const player = state.entities.get(state.playerId);
    if (!player || player.alive === false || !player.pos) return;

    // The window runs out on its own: lapse once, speak once.
    const permit = v.permit;
    if (permit && state.simTime >= permit.expiresAt) {
      const tier = VERGE_PERMIT_TIERS.find((t) => t.tier === permit.tier);
      const expired = permit;
      v.permit = null;
      this.bus.emit('verge:permitLapsed', { tierId: expired.tierId, tier: expired.tier, tick: state.tick });
      this._log(state, VERGE_BORDER_LINES.permitLapsed, 'Permit counter');
      // A sealed window closed clean: the bond rides home. Once per permit.
      if (tier && tier.bondReturnCr && v.violations.length === 0
          && this._receipt(state, `bond:${expired.receiptId}`)) {
        this.bus.emit('economy:grantCredits', { amount: tier.bondReturnCr, reason: 'verge:bond_return' });
        this.bus.emit('faction:repDelta', {
          factionId: VERGE_FACTION_ID, delta: 2, reason: 'verge:permit_clean',
        });
      }
    }

    if (player.flags && player.flags.docked === true) return;
    for (const m of state.entityList) {
      if (!m || m.alive === false || m.id === player.id || !m.pos) continue;
      const issuer = this._permitIssuer(m);
      if (!issuer) continue;
      const d = m.data;
      const inside = dist2(player.pos, m.pos) <= issuer.radius * issuer.radius;
      if (!inside) {
        if (d.permitDwell) d.permitDwell = 0;
        if (d.permitGreeted) d.permitGreeted = false;
        continue;
      }
      if (Number.isFinite(d.permitCooldownUntil) && state.simTime < d.permitCooldownUntil) continue;
      if (!d.permitGreeted) {
        d.permitGreeted = true;
        const rank = rankForState(state, VERGE_FACTION_ID);
        this._log(state,
          `PERMIT COUNTER. STANDING: ${String(rank.name || 'UNREAD').toUpperCase()}. HOLD FOR FILING.`,
          'Permit counter');
      }
      d.permitDwell = (Number(d.permitDwell) || 0) + dt;
      if (d.permitDwell < VERGE_BORDER.permitDwellS) continue;
      d.permitDwell = 0;
      d.permitCooldownUntil = state.simTime + VERGE_BORDER.permitCooldownS;
      this._resolvePermit(state, v, m);
    }
  },

  _resolvePermit(state, v, m) {
    const rank = rankForState(state, VERGE_FACTION_ID);
    const credits = Number(state.player && state.player.credits) || 0;
    const held = v.permit && state.simTime < v.permit.expiresAt ? v.permit : null;
    const topTier = VERGE_PERMIT_TIERS[VERGE_PERMIT_TIERS.length - 1];
    let result;
    let grant = null;
    if (v.violations.length > 0) {
      result = 'record';
    } else {
      // The counter writes the highest tier your standing and credit can pay for.
      for (const t of VERGE_PERMIT_TIERS) {
        if (held && t.tier <= held.tier) continue;      // a counter never writes down
        if (rank.step < t.minRankStep) continue;
        if (credits < t.feeCr) continue;
        grant = t;
      }
      if (grant) result = 'granted';
      else if (held && held.tier >= topTier.tier) result = 'served';
      else if (held) {
        const higher = VERGE_PERMIT_TIERS.filter((t) => t.tier > held.tier);
        result = !higher.length ? 'served'
          : rank.step < higher[0].minRankStep ? 'standing' : 'credit';
      } else {
        result = rank.step < VERGE_PERMIT_TIERS[0].minRankStep ? 'standing' : 'credit';
      }
    }

    const receiptId = this._nextId(state, 'per');
    v.permitLog.push({
      id: receiptId, result, at: state.simTime,
      tierId: grant ? grant.id : null, issuerId: m.id,
    });
    while (v.permitLog.length > VERGE_BORDER.permitLogCap) v.permitLog.shift();

    if (result === 'granted') {
      // The fee leaves through the sole writer's seam — receipt-guarded so no
      // replayed tick or restored permit can charge the window twice.
      if (!this._receipt(state, `permit:${receiptId}`)) return;
      this.bus.emit('economy:chargeCredits', { amount: grant.feeCr, reason: 'verge:permit' });
      v.permit = {
        tier: grant.tier, tierId: grant.id,
        issuedAt: state.simTime, expiresAt: state.simTime + VERGE_BORDER.permitValidS,
        issuerKey: typeof m.data.checkpointId === 'string' ? m.data.checkpointId : `m${m.id}`,
        suspended: false, receiptId,
      };
      this.bus.emit('verge:permitGranted', {
        tier: grant.tier, tierId: grant.id, fee: grant.feeCr,
        expiresAt: v.permit.expiresAt, issuerId: m.id, tick: state.tick,
      });
      this._log(state, `${VERGE_BORDER_LINES.permitGranted} ${grant.id.toUpperCase()} CLASS.`, 'Permit counter');
    } else {
      this.bus.emit('verge:permitDenied', {
        reason: result, issuerId: m.id, rankStep: rank.step, tick: state.tick,
      });
      const reason = result === 'record' ? 'OUTSTANDING VIOLATION. THE COURT ANSWERS FIRST.'
        : result === 'credit' ? 'CREDIT INSUFFICIENT FOR THE WINDOW.'
          : result === 'served' ? 'AUTHORITY ALREADY WRITTEN.'
            : 'STANDING UNREAD.';
      this._log(state, `${VERGE_BORDER_LINES.permitDenied} ${reason}`, 'Permit counter');
    }
  },

  // ── escorts: a flagged hull is walked to the boundary ─────────────────────────
  _maybeEscort(state, v, m, d, player, level, dt) {
    if (v.escort || v.pursuit) return;
    if (level > 1) return;                                    // measured and kept are never walked
    if (v.violations.length === 0 && this._incidentWeight(state) <= 0) return;
    const kind = vergeMachineKind(m);
    if (d.escortCapable === false) return;
    if (!VERGE_WALK_KINDS.has(kind) && kind !== 'auditor') return;
    if (Number.isFinite(d.escortUntil) && state.simTime < d.escortUntil) return;
    d.escortDwell = (Number(d.escortDwell) || 0) + dt;
    if (d.escortDwell < VERGE_BORDER.escortDwellS) return;

    // Demand issued: walk escorts head away from the ring; hold escorts stay.
    const mobile = vergeMachineIsMobile(m) && VERGE_WALK_KINDS.has(kind);
    const dx = player.pos.x - m.pos.x, dz = player.pos.z - m.pos.z;
    const dist = Math.hypot(dx, dz) || 1;
    // A warden that cannot hold the hull cannot demand it: precursor-driven
    // machines orbit or shadow at their own standoff (an executor holds 500,
    // past the default 260), and a demand issued out of radius would break the
    // escort through no fault of the hull. The dwell stays banked — the demand
    // lands on the first tick the body is actually in range.
    const holdR = Number(d.escortRadius) || VERGE_BORDER.escortRadius;
    if (dist > holdR) return;
    d.escortDwell = 0;
    v.escort = {
      id: (v.seq += 1), machineId: m.id, gen: m.occupantGeneration || 0,
      demandedAt: state.simTime,
      untilAt: state.simTime + (mobile ? VERGE_BORDER.escortMaxS : VERGE_BORDER.escortHoldS),
      holdR,
      originX: m.pos.x, originZ: m.pos.z,
      dirX: dx / dist, dirZ: dz / dist,
      walkedR: 0, graceUsed: 0, mode: mobile ? 'walk' : 'hold',
      sectorId: (state.world && state.world.currentSectorId) || '',
    };
    // A warden that leaves its post owes a return — record it once so later
    // displacement never rewrites where home is.
    if (v.escort.mode === 'walk' && !Number.isFinite(d.returnPostX)) {
      d.returnPostX = m.pos.x;
      d.returnPostZ = m.pos.z;
    }
    // A walking escort drives this body — the precursor kinematics loop yields
    // it while the flag stands (dropped on every close path below). The debt is
    // lodged in the ledger now: a warden that unloads mid-walk still owes it.
    if (v.escort.mode === 'walk') {
      vergeDrive(m);
      this._upsertReturnOwed(state, m);
    }
    this.bus.emit('verge:escortDemanded', {
      escortId: v.escort.id, machineId: m.id, mode: v.escort.mode,
      holdR: v.escort.holdR, tick: state.tick,
    });
    this._sayDirective(state, m, 'HOLD');
    this._log(state, VERGE_BORDER_LINES.escortDemand, 'Verge warden');
  },

  _tickEscort(state, dt) {
    const v = ensureVergeState(state);
    const esc = v.escort;
    if (!esc) return;
    const player = state.entities.get(state.playerId);
    const machine = vergeEntityCurrent(state, esc.machineId, esc.gen);
    if (!machine || !machine.pos || !player || player.alive === false || !player.pos) {
      vergeReleaseDrive(machine);                               // a surviving body owes no claim
      if (machine) this._markReturnToPost(state, machine);             // a walked warden still owes its post
      v.escort = null;                                          // orphaned — the record closes honest
      return;
    }
    // The border does not board: a docked hull's escort waits at the pier —
    // deadline included, so a berth can't idle out a hold and call it served.
    if (player.flags && player.flags.docked === true) {
      if (Number.isFinite(esc.untilAt)) esc.untilAt += dt;
      return;
    }
    const inside = dist2(player.pos, machine.pos) <= esc.holdR * esc.holdR;
    if (!inside) {
      esc.graceUsed += dt;
      if (esc.graceUsed >= VERGE_BORDER.escortGraceS) {
        this._breakEscort(state, v, esc, machine, player);
        return;
      }
    } else {
      esc.graceUsed = Math.max(0, esc.graceUsed - dt * 0.5);
    }

    // A walking warden leaves its post and drifts you outward; machines whose
    // kind cannot move (or are authored out) hold instead.
    if (esc.mode === 'walk' && vergeMachineIsMobile(machine)) {
      const step = VERGE_BORDER.escortWalkSpeed * dt;
      machine.pos.x += esc.dirX * step;
      machine.pos.z += esc.dirZ * step;
      // Distance walked is derived, not accumulated — a pushed warden still counts honest.
      esc.walkedR = Math.hypot(machine.pos.x - esc.originX, machine.pos.z - esc.originZ);
    }

    // Released only while the hull is still inside the warden's radius —
    // drifting outside inside the grace window is a break in progress, not a
    // completed passage earning the expunge.
    const done = inside && (esc.mode === 'walk'
      ? (esc.walkedR >= VERGE_BORDER.escortWalkR || state.simTime >= esc.untilAt)
      : state.simTime >= esc.untilAt);
    if (!done) return;

    // Released: supervised passage expunges the oldest mark.
    v.escort = null;
    vergeReleaseDrive(machine);
    machine.data = machine.data || {};
    machine.data.escortUntil = state.simTime + VERGE_BORDER.escortCooldownS;
    this._markReturnToPost(state, machine);
    if (v.violations.length) v.violations.shift();
    this._fileIncident(state, 'escorted', machine, 'supervised passage complete');
    this.bus.emit('verge:escortReleased', {
      escortId: esc.id, machineId: machine.id, mode: esc.mode, tick: state.tick,
    });
    if (this._receipt(state, `escort_rel:${esc.id}`)) {
      this.bus.emit('faction:repDelta', {
        factionId: VERGE_FACTION_ID, delta: 2, reason: 'verge:escort_complied',
      });
    }
    this._log(state, VERGE_BORDER_LINES.escortRelease, 'Verge warden');
  },

  _breakEscort(state, v, esc, machine, player) {
    v.escort = null;
    vergeReleaseDrive(machine);
    machine.data = machine.data || {};
    machine.data.escortUntil = state.simTime + VERGE_BORDER.escortCooldownS;
    this._markReturnToPost(state, machine);
    this._fileIncident(state, 'escort_broken', machine, 'left the warden\'s radius');
    this.bus.emit('verge:escortBroken', {
      escortId: esc.id, machineId: machine.id, tick: state.tick,
    });
    if (this._receipt(state, `escort_brk:${esc.id}`)) {
      this.bus.emit('faction:repDelta', {
        factionId: VERGE_FACTION_ID, delta: -6, reason: 'verge:escort_broken',
      });
    }
    this._log(state, VERGE_BORDER_LINES.escortBroken, 'Verge warden');
    // Breaking escort records a violation on the same docket the directives use.
    this._recordViolation(state, machine, player, 'ESCORT');
    this._openPursuit(state, v, machine, 'escort_broken');
  },

  // ── pursuit: the warden runs past the ring where ordinary law stops ───────────
  _openPursuit(state, v, machine, cause) {
    if (v.pursuit) {
      // One posted pursuit at a time; a second cause refreshes the sighting.
      v.pursuit.lastSeenAt = state.simTime;
      return v.pursuit;
    }
    // The chase leaves a post behind — record where it was before it moves.
    const mx = machine.pos ? machine.pos.x : 0;
    const mz = machine.pos ? machine.pos.z : 0;
    const md = machine.data;
    if (md && !Number.isFinite(md.returnPostX)) {
      md.returnPostX = mx;
      md.returnPostZ = mz;
    }
    // The debt outlives the body: a warden that unloads mid-chase still owes
    // its post — the ledger holds what the entity cannot.
    this._upsertReturnOwed(state, machine);
    const severity = this._incidentWeight(state);
    v.pursuit = {
      id: (v.seq += 1), machineId: machine.id, gen: machine.occupantGeneration || 0,
      originX: mx, originZ: mz,
      openedAt: state.simTime, lastSeenAt: state.simTime,
      status: 'hot',
      sectorId: (state.world && state.world.currentSectorId) || '',
      crossedAt: 0, submitS: 0,
      fine: Math.max(1, Math.round(VERGE_BORDER.pursuitFineCr * (1 + Math.max(0, severity) * 0.25))),
    };
    machine.data = machine.data || {};
    machine.data.pursuitId = v.pursuit.id;
    // A posted pursuit drives a mobile body — the precursor loop yields it.
    if (vergeMachineIsMobile(machine)) vergeDrive(machine);
    this.bus.emit('verge:pursuitOpened', {
      pursuitId: v.pursuit.id, machineId: machine.id, cause, tick: state.tick,
    });
    this._log(state, VERGE_BORDER_LINES.pursuitOpen, 'Verge warden');
    return v.pursuit;
  },

  _closePursuit(state, v) {
    const p = v.pursuit;
    if (!p) return;
    p.status = 'closed';
    v.pursuit = null;
    const m = vergeEntityCurrent(state, p.machineId, p.gen);
    // Clear only our own mark — a recycled or re-claimed body keeps its claim.
    if (m && m.data && m.data.pursuitId === p.id) delete m.data.pursuitId;
    vergeReleaseDrive(m);
    this._markReturnToPost(state, m);
  },

  /** The post a warden owes, lodged in the persisted ledger — a warden that
   *  unloads with its sector keeps the debt on the record, not the body, so a
   *  rematerialized cast can still answer it. One row per post: an occupant
   *  re-borrowing its own post refreshes the row instead of stacking it. */
  _upsertReturnOwed(state, m) {
    if (!vergeMachineIsMobile(m) || !m.pos) return null;
    const v = ensureVergeState(state);
    const d = m.data || {};
    const anchor = d.machine && d.machine.anchor;
    const x = Number.isFinite(d.returnPostX) ? d.returnPostX
      : (anchor && Number.isFinite(anchor.x) ? anchor.x : m.pos.x);
    const z = Number.isFinite(d.returnPostZ) ? d.returnPostZ
      : (anchor && Number.isFinite(anchor.z) ? anchor.z : m.pos.z);
    const gen = Number.isFinite(m.occupantGeneration) ? m.occupantGeneration : 0;
    const cp = vergeCheckpointFor(m);
    const key = cp ? cp.key : '';
    const siteId = (d.machine && typeof d.machine.siteId === 'string' && d.machine.siteId)
      || (typeof d.checkpointId === 'string' && d.checkpointId) || '';
    const kind = vergeMachineKind(m) || '';
    const sectorId = (typeof m.homeSectorId === 'string' && m.homeSectorId)
      || (typeof d.homeSectorId === 'string' && d.homeSectorId)
      || (typeof d.sectorId === 'string' && d.sectorId)
      || (state.world && state.world.currentSectorId) || '';
    let rec = null;
    for (const r of v.returns) {
      if (r.machineId === m.id && r.gen === gen) { rec = r; break; }
      // Same post under an earlier identity — one debt per post.
      if (key && r.key === key) { rec = r; break; }
      if (siteId && r.siteId === siteId && r.kind === kind
          && (r.x - x) * (r.x - x) + (r.z - z) * (r.z - z)
              <= VERGE_BORDER.returnClaimR * VERGE_BORDER.returnClaimR) { rec = r; break; }
    }
    if (!rec) {
      rec = { machineId: m.id, gen, sectorId, key, siteId, kind, x, z, at: state.simTime };
      v.returns.push(rec);
      while (v.returns.length > VERGE_BORDER.returnCap) v.returns.shift();
    } else {
      rec.machineId = m.id; rec.gen = gen;
      if (key) rec.key = key;
      if (siteId) rec.siteId = siteId;
      if (kind) rec.kind = kind;
      if (sectorId) rec.sectorId = sectorId;
      rec.x = x; rec.z = z; rec.at = state.simTime;
    }
    return rec;
  },

  /** A served or voided return leaves the ledger — matched to the occupant that
   *  answered it, so a stale row never frees a different post's debt. */
  _dropReturnOwed(state, m) {
    const v = ensureVergeState(state);
    if (!m || !v.returns.length) return;
    const gen = Number.isFinite(m.occupantGeneration) ? m.occupantGeneration : 0;
    for (let i = v.returns.length - 1; i >= 0; i--) {
      if (v.returns[i].machineId === m.id && v.returns[i].gen === gen) v.returns.splice(i, 1);
    }
  },

  /** The post's current occupant answers a persisted return — never a bare id
   *  recycle: the claim needs the authored site key, the site + kind, or the
   *  post itself. A busy or already-homeward warden cannot be claimed. */
  _findReturnClaimant(state, v, r) {
    let best = null, bestScore = Infinity;
    for (const m of state.entityList) {
      if (!m || m.alive === false || !m.pos || !m.data) continue;
      if (!vergeMachineIsMobile(m)) continue;
      const d = m.data;
      if (d.returnToPost === true || d.vergeDriven === true || d.pursuitId != null) continue;
      if ((v.escort && v.escort.machineId === m.id)
          || (v.pursuit && v.pursuit.machineId === m.id && v.pursuit.status === 'hot')) continue;
      const kind = vergeMachineKind(m);
      let rank;
      const cp = vergeCheckpointFor(m);
      if (r.key && cp && cp.key === r.key) {
        rank = 0;                                            // the authored site key
      } else {
        const siteId = (d.machine && d.machine.siteId) || d.checkpointId || '';
        if (r.siteId && siteId === r.siteId && (!r.kind || kind === r.kind)) {
          rank = 1;                                          // same site, same kind
        } else {
          if (!r.kind || kind !== r.kind) continue;
          if (dist2(m.pos, r) > VERGE_BORDER.returnClaimR * VERGE_BORDER.returnClaimR) continue;
          rank = 2;                                          // a nameless warden at the post
        }
      }
      // Nearest post wins among equal claims — anchor is the authored post.
      const anchor = d.machine && d.machine.anchor;
      const ax = anchor && Number.isFinite(anchor.x) ? anchor.x : m.pos.x;
      const az = anchor && Number.isFinite(anchor.z) ? anchor.z : m.pos.z;
      const score = rank * 1e12 + (ax - r.x) * (ax - r.x) + (az - r.z) * (az - r.z);
      if (score < bestScore) { bestScore = score; best = m; }
    }
    return best;
  },

  /** A warden that chased or walked owes its post a return — set the drift home
   *  and lodge the debt in the ledger so a sector unload cannot void it.
   *  No-op for machines the precursor layer owns or a missing/cold reference. */
  _markReturnToPost(state, machine) {
    if (!vergeMachineIsMobile(machine)) return;
    const d = machine.data;
    if (Number.isFinite(d.returnPostX) && Number.isFinite(d.returnPostZ)) d.returnToPost = true;
    this._upsertReturnOwed(state, machine);
  },

  // Mobile wardens drift back to the post they left — never while a live escort
  // or pursuit still owns them. The ledger reconciles first: a warden displaced
  // across a sector unload re-answers its post when the cast rematerializes —
  // the same occupant by (id, gen), a rematerialized one by the post's site
  // identity; a bare id recycle never satisfies the debt.
  _tickReturnToPost(state, dt) {
    const v = ensureVergeState(state);
    if (v.returns.length) {
      const curSector = state.world && state.world.currentSectorId;
      for (const r of v.returns) {
        let m = vergeEntityCurrent(state, r.machineId, r.gen);
        if (m && (!m.pos || !vergeMachineIsMobile(m))) m = null; // a body that cannot drift serves nothing
        if (!m && (!r.sectorId || r.sectorId === curSector)) {
          m = this._findReturnClaimant(state, v, r);
        }
        if (!m || !m.pos) continue;
        // The debt moves to the warden that answered it — completion drops it.
        r.machineId = m.id;
        r.gen = Number.isFinite(m.occupantGeneration) ? m.occupantGeneration : 0;
        const d = m.data;
        if (!Number.isFinite(d.returnPostX) || !Number.isFinite(d.returnPostZ)) {
          d.returnPostX = r.x; d.returnPostZ = r.z;
        }
        d.returnToPost = true;
      }
    }
    for (const m of state.entityList) {
      if (!m || m.alive === false || !m.pos) continue;
      const d = m.data;
      if (!d || d.returnToPost !== true) continue;
      if (!Number.isFinite(d.returnPostX) || !Number.isFinite(d.returnPostZ)
          || !vergeMachineIsMobile(m)) {
        delete d.returnPostX; delete d.returnPostZ; delete d.returnToPost;
        vergeReleaseDrive(m);                                  // no drive, no claim
        this._dropReturnOwed(state, m);                        // the debt is void, not owed
        continue;
      }
      // Only a record that still drives the body holds it here — a 'crossed'
      // pursuit is carried by the file, so its warden is free to post back.
      if ((v.escort && v.escort.machineId === m.id)
          || (v.pursuit && v.pursuit.machineId === m.id && v.pursuit.status === 'hot')) continue;
      const dx = d.returnPostX - m.pos.x, dz = d.returnPostZ - m.pos.z;
      const dist = Math.hypot(dx, dz);
      const step = VERGE_MACHINE_BODIES[vergeMachineKind(m)].speed * dt;
      if (!(dist > step)) {
        m.pos.x = d.returnPostX; m.pos.z = d.returnPostZ;
        delete d.returnPostX; delete d.returnPostZ; delete d.returnToPost;
        vergeReleaseDrive(m);
        this._dropReturnOwed(state, m);                        // the post is answered
        continue;
      }
      vergeDrive(m); // the drift home is this file's drive — the other loop yields
      m.pos.x += (dx / dist) * step;
      m.pos.z += (dz / dist) * step;
    }
  },

  _tickPursuit(state, dt) {
    const v = ensureVergeState(state);
    const p = v.pursuit;
    if (!p) return;
    const player = state.entities.get(state.playerId);
    if (!player || player.alive === false || !player.pos) return;
    // The border does not board: a docked hull's pursuit hovers, it does not pounce.
    if (player.flags && player.flags.docked === true) return;

    // A filed crossing waits at the border: coming back inside any ring resumes it.
    if (p.status === 'crossed') {
      for (const m of state.entityList) {
        if (!m || m.alive === false) continue;
        const cp = vergeCheckpointFor(m);
        if (!cp) continue;
        if (dist2(player.pos, m.pos) > cp.radius * cp.radius) continue;
        // The file moves to the warden that re-acquired — sector and mark both,
        // so a stale claim never rides a ring this pursuit no longer names.
        const prev = vergeEntityCurrent(state, p.machineId, p.gen);
        if (prev && prev.data && prev.data.pursuitId === p.id) delete prev.data.pursuitId;
        vergeReleaseDrive(prev);
        if (prev) this._markReturnToPost(state, prev);                 // the superseded warden goes home
        p.status = 'hot';
        p.machineId = m.id;
        p.gen = m.occupantGeneration || 0;
        p.sectorId = (state.world && state.world.currentSectorId) || p.sectorId;
        p.originX = m.pos.x; p.originZ = m.pos.z;
        p.lastSeenAt = state.simTime;
        p.submitS = 0;                                        // stillness does not bank across a re-acquire
        m.data.pursuitId = p.id;
        if (vergeMachineIsMobile(m)) vergeDrive(m);
        this.bus.emit('verge:pursuitResumed', { pursuitId: p.id, machineId: m.id, tick: state.tick });
        this._log(state, VERGE_BORDER_LINES.pursuitResumed, 'Verge warden');
        break;
      }
      return;
    }

    let machine = vergeEntityCurrent(state, p.machineId, p.gen);
    if (machine && !machine.pos) machine = null;              // a body with no place cannot chase
    const distToPlayer = machine ? Math.hypot(player.pos.x - machine.pos.x, player.pos.z - machine.pos.z) : Infinity;
    const distToOrigin = Math.hypot(player.pos.x - p.originX, player.pos.z - p.originZ);

    // A hot pursuit whose warden vanished across a boundary is not an escape
    // and not a cold trail — the hull crossed out from under it: a recovery
    // teleport, or a sector:enter emit that lands after this tick already saw
    // the world's new sector. File the same flight the boundary listeners
    // write; the shared receipt keeps it once either way.
    if (!machine && state.world && typeof state.world.currentSectorId === 'string'
        && state.world.currentSectorId !== p.sectorId) {
      p.status = 'crossed';
      p.crossedAt = state.simTime;
      this._fileIncident(state, 'boundary_flight', null,
        `flight to ${state.world.currentSectorId}`);
      this._pushLawZone(state, player.pos.x, player.pos.z, VERGE_APPEAL.lawZoneRadius);
      if (this._receipt(state, `pursuit_flight:${p.id}`)) {
        this.bus.emit('faction:repDelta', {
          factionId: VERGE_FACTION_ID, delta: -8, reason: 'verge:border_flight',
        });
      }
      this.bus.emit('verge:pursuitCrossed', {
        pursuitId: p.id, from: p.sectorId || null, to: state.world.currentSectorId,
        tick: state.tick,
      });
      this._log(state, VERGE_BORDER_LINES.pursuitCrossed, 'Verge warden');
      return;
    }

    if (machine) {
      p.lastSeenAt = state.simTime;
      // The warden runs past its ring — a mobile body is kinematic here under
      // vergeDriven; a posted pursuit on an immobile warden waits at the ring.
      if (vergeMachineIsMobile(machine) && distToPlayer > VERGE_BORDER.pursuitCatchR) {
        const body = VERGE_MACHINE_BODIES[vergeMachineKind(machine)];
        const speed = Math.min(body.speed * VERGE_BORDER.pursuitSpeedMult, VERGE_BORDER.pursuitMaxSpeed);
        const step = Math.min(speed * dt, distToPlayer - VERGE_BORDER.pursuitCatchR + 1);
        machine.pos.x += ((player.pos.x - machine.pos.x) / distToPlayer) * step;
        machine.pos.z += ((player.pos.z - machine.pos.z) / distToPlayer) * step;
      }
      // Intercepted: the warden is on you — a forced manifest read and the fine.
      if (distToPlayer <= VERGE_BORDER.pursuitCatchR) {
        this._fileIncident(state, 'intercepted', machine, 'intercept complete');
        this._orderScan(state, v, machine, `pursuit:${machine.id}`, false);
        if (this._receipt(state, `pursuit_fine:${p.id}`)) {
          this.bus.emit('economy:chargeCredits', {
            amount: Math.max(1, Math.round(p.fine)), reason: 'verge:pursuit_fine',
          });
        }
        this.bus.emit('verge:pursuitIntercepted', {
          pursuitId: p.id, machineId: machine.id, fine: Math.round(p.fine), tick: state.tick,
        });
        this._log(state, VERGE_BORDER_LINES.intercepted, 'Verge warden');
        this._closePursuit(state, v);
        return;
      }
    }

    // Escaped past the leash — or the warden is gone and the trail is cold.
    if (distToOrigin > VERGE_BORDER.pursuitEscapeR
        || (!machine && state.simTime - p.lastSeenAt > VERGE_BORDER.pursuitColdS)) {
      const escaped = distToOrigin > VERGE_BORDER.pursuitEscapeR;
      this._fileIncident(state, escaped ? 'pursuit_escape' : 'pursuit_cold', machine,
        escaped ? 'crossed the leash' : 'pursuit went cold');
      if (escaped) {
        this._pushLawZone(state, player.pos.x, player.pos.z, VERGE_APPEAL.lawZoneRadius);
        if (this._receipt(state, `pursuit_esc:${p.id}`)) {
          this.bus.emit('faction:repDelta', {
            factionId: VERGE_FACTION_ID, delta: -8, reason: 'verge:border_flight',
          });
        }
        this.bus.emit('verge:pursuitEscaped', {
          pursuitId: p.id, at: { x: player.pos.x, z: player.pos.z }, tick: state.tick,
        });
        this._log(state, VERGE_BORDER_LINES.pursuitEscaped, 'Verge warden');
      } else {
        this.bus.emit('verge:pursuitCold', { pursuitId: p.id, tick: state.tick });
      }
      this._closePursuit(state, v);
      return;
    }

    // Voluntary submission: hold near-still beside any ring and the fine settles it.
    let nearRing = false;
    for (const m of state.entityList) {
      if (!m || m.alive === false) continue;
      const cp = vergeCheckpointFor(m);
      if (!cp) continue;
      if (dist2(player.pos, m.pos) > VERGE_BORDER.pursuitSubmitR * VERGE_BORDER.pursuitSubmitR) continue;
      nearRing = true;
      const speed2 = player.vel ? player.vel.x * player.vel.x + player.vel.z * player.vel.z : 0;
      if (speed2 > 4) { p.submitS = 0; break; }
      p.submitS += dt;
      if (p.submitS >= VERGE_BORDER.pursuitSubmitS) {
        this._fileIncident(state, 'submitted', m, 'voluntary submission accepted');
        if (this._receipt(state, `pursuit_fine:${p.id}`)) {
          this.bus.emit('economy:chargeCredits', {
            amount: Math.max(1, Math.round(p.fine)), reason: 'verge:pursuit_fine',
          });
        }
        this.bus.emit('verge:pursuitSubmitted', {
          pursuitId: p.id, machineId: m.id, fine: Math.round(p.fine), tick: state.tick,
        });
        this._log(state, VERGE_BORDER_LINES.pursuitSubmitted, 'Verge warden');
        this._closePursuit(state, v);
        return;
      }
      break;
    }
    // Stillness held beside no ring is no submission — leaving the ring drops the count.
    if (!nearRing) p.submitS = 0;
  },

  // ── boundary and lifecycle listeners ──────────────────────────────────────────
  _onEntityKilled(p) {
    const state = this.state;
    if (!state || !p) return;
    const id = p.id != null ? p.id : p.entityId;
    if (id == null) return;
    const v = ensureVergeState(state);
    // Dead wardens cannot hold what they posted; a recycled id must still match.
    if (v.escort && v.escort.machineId === id
        && vergeEntityCurrent(state, id, v.escort.gen) === null) {
      v.escort = null;
    }
    if (v.pursuit && v.pursuit.machineId === id
        && vergeEntityCurrent(state, id, v.pursuit.gen) === null) {
      this._closePursuit(state, v);
    }
    if (v.scans.pendingPatrol === id) this._resolvePendingScan(state, 'void');
    // A dead body's drive claim dies with it — a recycled slot must not inherit
    // a stale flag over the precursor kinematics loop.
    const killed = state.entities.get(id);
    if (killed && killed.data && killed.data.vergeDriven === true) delete killed.data.vergeDriven;
  },

  _onJumpStart(p) {
    const state = this.state;
    if (!state || !p) return;
    // Only the player's departure breaks an escort or files a flight — a
    // foreign jump packet touching these events must not write the record.
    if (p.playerId != null && state.playerId != null && p.playerId !== state.playerId) return;
    const v = ensureVergeState(state);
    const player = state.entities.get(state.playerId);
    // Jumping with a warden on your wing breaks the escort on the way out.
    if (v.escort) {
      const esc = v.escort;
      v.escort = null;
      const machine = vergeEntityCurrent(state, esc.machineId, esc.gen);
      vergeReleaseDrive(machine);
      if (machine) this._markReturnToPost(state, machine);
      this._fileIncident(state, 'escort_broken', machine, 'jumped with the warden posted');
      this.bus.emit('verge:escortBroken', {
        escortId: esc.id, machineId: esc.machineId, tick: state.tick,
      });
      if (this._receipt(state, `escort_brk:${esc.id}`)) {
        this.bus.emit('faction:repDelta', {
          factionId: VERGE_FACTION_ID, delta: -6, reason: 'verge:escort_broken',
        });
      }
      if (machine && player && player.pos) {
        this._recordViolation(state, machine, player, 'ESCORT');
        this._openPursuit(state, v, machine, 'escort_broken');
      }
    }
    // Jumping with a pursuit posted files boundary flight — the crossing is the record.
    if (v.pursuit && v.pursuit.status === 'hot') {
      const pu = v.pursuit;
      pu.status = 'crossed';
      pu.crossedAt = state.simTime;
      // The warden does not follow: release the drive, lift the stale claim and
      // send it home — otherwise a vergeDriven body freezes mid-chase forever.
      const warden = vergeEntityCurrent(state, pu.machineId, pu.gen);
      if (warden) {
        if (warden.data && warden.data.pursuitId === pu.id) delete warden.data.pursuitId;
        vergeReleaseDrive(warden);
        this._markReturnToPost(state, warden);
      }
      this._fileIncident(state, 'boundary_flight', null, `flight to ${p.to || 'the far side'}`);
      if (p.fromPos && Number.isFinite(p.fromPos.x) && Number.isFinite(p.fromPos.z)) {
        this._pushLawZone(state, p.fromPos.x, p.fromPos.z, VERGE_APPEAL.lawZoneRadius);
      }
      if (this._receipt(state, `pursuit_flight:${pu.id}`)) {
        this.bus.emit('faction:repDelta', {
          factionId: VERGE_FACTION_ID, delta: -8, reason: 'verge:border_flight',
        });
      }
      this.bus.emit('verge:pursuitCrossed', {
        pursuitId: pu.id, from: p.from || pu.sectorId, to: p.to || null, tick: state.tick,
      });
      this._log(state, VERGE_BORDER_LINES.pursuitCrossed, 'Verge warden');
    }
  },

  _onSectorEnter(p) {
    const state = this.state;
    if (!state || !p || !p.sectorId) return;
    const v = ensureVergeState(state);
    const player = state.entities.get(state.playerId);
    // No warden crosses the boundary with you — and a border crossed mid-escort
    // is a broken escort, with the same record the jump path writes. A record
    // posted in THIS sector (a same-sector re-enter, or one written before
    // escorts carried a sector) is no crossing — it closes quiet instead of
    // inventing a flight the hull never flew.
    if (v.escort) {
      const esc = v.escort;
      const hasSector = typeof esc.sectorId === 'string' && esc.sectorId !== '';
      if (hasSector && esc.sectorId === p.sectorId) {
        // Same-sector re-enter: the escort stands; the tick orphans it honest
        // if the body did not survive the rematerialize.
      } else if (!hasSector) {
        v.escort = null;
        const oldWarden = vergeEntityCurrent(state, esc.machineId, esc.gen);
        vergeReleaseDrive(oldWarden);
        if (oldWarden) this._markReturnToPost(state, oldWarden);
      } else {
        v.escort = null;
        const machine = vergeEntityCurrent(state, esc.machineId, esc.gen);
        vergeReleaseDrive(machine);
        if (machine) this._markReturnToPost(state, machine);
        this._fileIncident(state, 'escort_broken', machine,
          'crossed the boundary with the warden posted');
        this.bus.emit('verge:escortBroken', {
          escortId: esc.id, machineId: esc.machineId, tick: state.tick,
        });
        if (this._receipt(state, `escort_brk:${esc.id}`)) {
          this.bus.emit('faction:repDelta', {
            factionId: VERGE_FACTION_ID, delta: -6, reason: 'verge:escort_broken',
          });
        }
        if (player && player.pos) {
          this._recordViolation(state, machine, player, 'ESCORT');
          if (machine) {
            // The warden is still in the cast (a contiguous corridor keeps both
            // sectors live) — the chase continues as an ordinary pursuit.
            this._openPursuit(state, v, machine, 'escort_broken');
          } else if (!v.pursuit) {
            // The warden unloaded with the sector — post the pursuit hot at the
            // escort's sector so the crossing block below files the same flight
            // a jump would: the record lands identical either way over the edge.
            const severity = this._incidentWeight(state);
            v.pursuit = {
              id: (v.seq += 1), machineId: esc.machineId, gen: esc.gen,
              originX: esc.originX, originZ: esc.originZ,
              openedAt: state.simTime, lastSeenAt: state.simTime,
              status: 'hot', sectorId: esc.sectorId, crossedAt: 0, submitS: 0,
              fine: Math.max(1, Math.round(VERGE_BORDER.pursuitFineCr * (1 + Math.max(0, severity) * 0.25))),
            };
            this.bus.emit('verge:pursuitOpened', {
              pursuitId: v.pursuit.id, machineId: esc.machineId,
              cause: 'escort_broken', tick: state.tick,
            });
          }
        }
      }
    }
    // Machines are sector-scoped: a hot pursuit's warden stayed behind — the
    // pursuit keeps its 'crossed' mark until a ring here re-acquires it. A
    // boundary crossed without a jump (free flight over a Voronoi edge emits
    // no jump:start) files the same flight the jump path does — the receipts
    // are shared, so a transition that fires both still files once.
    if (v.pursuit && v.pursuit.status === 'hot' && p.sectorId !== v.pursuit.sectorId) {
      const pu = v.pursuit;
      pu.status = 'crossed';
      pu.crossedAt = state.simTime;
      // The warden stayed behind in a live corridor: release its drive and post
      // its return — a crossed pursuit is carried by the file, not the body.
      const warden = vergeEntityCurrent(state, pu.machineId, pu.gen);
      if (warden) {
        if (warden.data && warden.data.pursuitId === pu.id) delete warden.data.pursuitId;
        vergeReleaseDrive(warden);
        this._markReturnToPost(state, warden);
      }
      this._fileIncident(state, 'boundary_flight', null, `flight to ${p.sectorId}`);
      if (player && player.pos) {
        this._pushLawZone(state, player.pos.x, player.pos.z, VERGE_APPEAL.lawZoneRadius);
      }
      if (this._receipt(state, `pursuit_flight:${pu.id}`)) {
        this.bus.emit('faction:repDelta', {
          factionId: VERGE_FACTION_ID, delta: -8, reason: 'verge:border_flight',
        });
      }
      this.bus.emit('verge:pursuitCrossed', {
        pursuitId: pu.id, from: pu.sectorId || null, to: p.sectorId, tick: state.tick,
      });
      this._log(state, VERGE_BORDER_LINES.pursuitCrossed, 'Verge warden');
    }
    if (v.scans.pendingPatrol !== null) this._resolvePendingScan(state, 'void');
  },

  // ── Directives: one capitalized word on the glass, a window, a verdict ──────────
  _tickDirectives(state, dt) {
    const v = ensureVergeState(state);
    const player = state.entities.get(state.playerId);
    if (!player || player.alive === false || !player.pos) return;
    // The border does not board: a docked hull cannot comply, so its window
    // waits at the pier instead of running out under it.
    const docked = !!(player.flags && player.flags.docked === true);
    for (const m of state.entityList) {
      if (!m || m.alive === false || !m.pos || typeof m.data?.vergeDirective !== 'string') continue;
      const d = m.data;
      if (docked) {
        if (Number.isFinite(d.directiveIssuedAt)) d.directiveIssuedAt += dt;
        continue;
      }
      const radius = Number(d.directiveRadius) || 400;
      const inside = dist2(player.pos, m.pos) <= radius * radius;
      if (inside && !Number.isFinite(d.directiveIssuedAt)) {
        d.directiveIssuedAt = state.simTime;
        const word = VERGE_DIRECTIVE_WORDS[d.vergeDirective] || `${d.vergeDirective}.`;
        this.bus.emit('verge:directive', {
          machineId: m.id, directive: d.vergeDirective, word, tick: state.tick,
        });
        this.bus.emit('comms:log', { text: word, speaker: 'Verge machine' });
      }
      if (!inside && Number.isFinite(d.directiveIssuedAt)) {
        // Left inside the window: only a leave-grammar word counts the honor —
        // stepping out of a HOLD or a WITNESS window is nobody's compliance.
        d.directiveIssuedAt = undefined;
        if (d.vergeDirective === 'VACATE') {
          d.directiveHonored = true;
          v.watch.directivesHonored += 1;
        }
      }
      // VACATE is the timed directive: still inside past the window is a violation.
      if (inside && d.vergeDirective === 'VACATE' && Number.isFinite(d.directiveIssuedAt)
          && state.simTime >= d.directiveIssuedAt + (Number(d.directiveWindowS) || 8)) {
        d.directiveIssuedAt = undefined;
        this._recordViolation(state, m, player);
      }
    }
  },

  _recordViolation(state, machine, player, directive) {
    if (!player || !player.pos) return;
    const v = ensureVergeState(state);
    // machine may be null — a boundary break can outlive the warden's entity.
    const machineId = machine ? machine.id : null;
    const dir = directive !== undefined
      ? directive
      : (machine && machine.data ? machine.data.vergeDirective : undefined);
    if (v.violations.length < VERGE_BORDER.violationCap) {
      v.violations.push({
        directive: dir, machineId,
        violatorId: player.id, at: state.simTime,
      });
    }
    player.data = player.data || {};
    player.data.directiveViolated = true;
    // A violation suspends written route authority until the court answers.
    if (v.permit && !v.permit.suspended && state.simTime < v.permit.expiresAt) {
      v.permit.suspended = true;
      this.bus.emit('verge:permitSuspended', { tierId: v.permit.tierId, tick: state.tick });
      this._log(state, VERGE_BORDER_LINES.permitSuspended, 'Verge checkpoint');
    }
    // An escort break already filed its own incident; the docket records once.
    if (dir !== 'ESCORT') {
      this._fileIncident(state, 'directive_violation', machine, String(dir || 'order'));
    }
    this.bus.emit('verge:directiveViolated', {
      directive: dir, machineId, tick: state.tick,
    });
    // The court convenes at the nearest living Appeals Clerk. A malformed or
    // dead-seated court record must not lock the bench — only a sitting court
    // blocks a new convening.
    const clerk = this._nearestMachine(state, player.pos, 'appeals_clerk');
    if (clerk && !(v.court && v.court.convened === true)) {
      v.court = {
        convened: true, clerkId: clerk.id,
        clerkGen: clerk.occupantGeneration || 0, at: state.simTime,
      };
      this.bus.emit('verge:courtConvened', { clerkId: clerk.id, tick: state.tick });
      this.bus.emit('comms:log', { text: VERGE_BARKS.appealHeard, speaker: 'Appeals Clerk' });
    }
  },

  _nearestMachine(state, pos, kind) {
    let best = null, bestD = Infinity;
    for (const e of state.entityList) {
      if (!e || e.alive === false || vergeMachineKind(e) !== kind) continue;
      if (!e.pos) continue;
      const d = dist2(e.pos, pos);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  },

  // ── Measure Engines weigh everything: true mass is the only testimony ──────────
  _tickMeasureEngines(state) {
    for (const m of state.entityList) {
      if (!m || m.alive === false || vergeMachineKind(m) !== 'measure') continue;
      const readR = Number(m.data.readR) || 500;
      for (const e of state.entityList) {
        if (!e || e.alive === false || e.id === m.id) continue;
        if (vergeMachineKind(e) != null) continue; // machines do not weigh machines
        if (!Number.isFinite(e.mass) || !e.pos || !m.pos) continue;
        if (dist2(e.pos, m.pos) > readR * readR) continue;
        e.data = e.data || {};
        // The record already says the truth — re-stamping would only trade the
        // stamp back and forth between engines and every other reader of the
        // Measure contract (tare writes the same fields), plus a comms line
        // every tick. A stale stamp — mass changed since — does get re-read.
        if (Number.isFinite(e.data.weighedMass) && e.data.weighedMass === e.mass) continue;
        e.data.weighedMass = e.mass;
        e.data.weighedBy = m.id;
        e.data.weighedAt = state.simTime;
        this.bus.emit('verge:massWeighed', {
          engineId: m.id, entityId: e.id, mass: e.mass, tick: state.tick,
        });
        this.bus.emit('comms:log', { text: VERGE_BARKS.massCorrect, speaker: 'Measure Engine' });
      }
    }
  },

  // ── E-30: the Appeal — weighed evidence in the Exception Chamber ───────────────
  _tickAppeal(state) {
    const v = ensureVergeState(state);
    if (!v.court || v.court.convened !== true) return;
    const player = state.entities.get(state.playerId);
    let clerk = vergeEntityCurrent(state, v.court.clerkId, v.court.clerkGen);
    if (!clerk || !clerk.pos || vergeMachineKind(clerk) !== 'appeals_clerk') {
      // The seated clerk is dead, unloaded, or the id recycled under a new
      // occupant — the court adjourns to the nearest living clerk, and with no
      // clerk at all it stands down; the next violation convenes a fresh one.
      const next = player && player.pos
        ? this._nearestMachine(state, player.pos, 'appeals_clerk') : null;
      if (!next) { v.court = null; return; }
      clerk = next;
      v.court.clerkId = clerk.id;
      v.court.clerkGen = clerk.occupantGeneration || 0;
    }
    if (!player || player.alive === false || !player.pos) return;
    if (player.flags && player.flags.docked === true) return; // the chamber is stood in, not docked through
    const chamberR2 = VERGE_APPEAL.chamberRadius ** 2;
    if (dist2(player.pos, clerk.pos) > chamberR2) return; // you must stand in the chamber
    for (const e of state.entityList) {
      if (!e || e.alive === false || !e.pos || e.data?.evidence !== true) continue;
      if (Number.isFinite(e.data.judgedAt)) continue;
      if (dist2(e.pos, clerk.pos) > chamberR2) continue;
      e.data.judgedAt = state.simTime;
      const diff = Math.abs(e.mass - VERGE_APPEAL.evidenceMass);
      if (diff <= VERGE_APPEAL.evidenceMassTolerance) {
        v.violations.shift(); // the oldest charge is struck
        if (v.appeals.length < VERGE_BORDER.appealCap) {
          v.appeals.push({ result: 'granted', evidenceId: e.id, at: state.simTime });
        }
        v.court = null;
        player.data = player.data || {};
        player.data.directiveViolated = false;
        // A granted appeal reinstates suspended route authority — same verdict,
        // but never speaks for a window the lapse already closed this tick.
        if (v.permit && v.permit.suspended && state.simTime < v.permit.expiresAt) {
          v.permit.suspended = false;
          this.bus.emit('verge:permitReinstated', { tierId: v.permit.tierId, tick: state.tick });
          this._log(state, VERGE_BORDER_LINES.permitReinstated, 'Appeals Clerk');
        }
        this._fileIncident(state, 'appeal_won', clerk, 'the court weighed and granted');
        this.bus.emit('verge:appealGranted', {
          clerkId: clerk.id, evidenceId: e.id, mass: e.mass, tick: state.tick,
        });
        this.bus.emit('comms:log', { text: VERGE_BARKS.massCorrect, speaker: 'Appeals Clerk' });
      } else {
        if (v.appeals.length < VERGE_BORDER.appealCap) {
          v.appeals.push({ result: 'denied', evidenceId: e.id, mass: e.mass, at: state.simTime });
        }
        this._pushLawZone(state, clerk.pos.x, clerk.pos.z, VERGE_APPEAL.lawZoneRadius);
        this.bus.emit('verge:appealDenied', {
          clerkId: clerk.id, evidenceId: e.id, mass: e.mass,
          wanted: VERGE_APPEAL.evidenceMass, tick: state.tick,
        });
        this.bus.emit('comms:log', { text: VERGE_BARKS.massIncorrect, speaker: 'Appeals Clerk' });
      }
      return; // the court weighs one object per beat
    }
  },

  // ── E-34: the Sleeping Jury — one weighed testimony per juror ──────────────────
  _tickJury(state) {
    const v = ensureVergeState(state);
    for (const jury of state.entityList) {
      if (!jury || jury.alive === false || vergeMachineKind(jury) !== 'sleeping_jury') continue;
      const r2 = VERGE_SLEEPING_JURY.testimonyRadius ** 2;
      for (const e of state.entityList) {
        if (!e || e.alive === false || !e.pos || e.data?.testimony !== true) continue;
        if (e.data.testimonyConsumed === true) continue;
        if (VERGE_SLEEPING_JURY.requiresWeighedObject && !Number.isFinite(e.data.weighedMass)) continue;
        if (dist2(e.pos, jury.pos) > r2) continue;
        const seat = v.jurors.indexOf(false);
        if (seat < 0) break; // all twelve are awake
        v.jurors[seat] = true;
        v.jurorsAwake += 1;
        e.data.testimonyConsumed = true;
        e.data.testimonyFor = jury.id;
        this.bus.emit('verge:jurorWoke', {
          juryId: jury.id, juror: seat, awake: v.jurorsAwake, tick: state.tick,
        });
        this.bus.emit('comms:log', { text: VERGE_SLEEPING_JURY.wakeLine, speaker: 'Sleeping Jury' });
      }
    }
  },

  // ── The Line-site Class trial: a weighed Measure fragment records a Class ───────
  _tickLineTrial(state) {
    const v = ensureVergeState(state);
    const player = state.entities.get(state.playerId);
    if (!player) return;
    const tether = player.tether || state.player?.tether;
    const held = tether && tether.active ? state.entities.get(tether.targetId) : null;
    if (!held || held.alive === false) return;
    held.data = held.data || {};
    const hd = held.data;
    if (hd.typeId !== VERGE_LINE_TRIAL.fragmentTypeId) return;
    if (!Number.isFinite(hd.weighedMass)) return; // the engine must have weighed it first
    if (hd.trialConsumed === true) return;
    hd.trialConsumed = true;
    v.lineClassGrants += VERGE_LINE_TRIAL.trialClassStep;
    this.bus.emit('verge:lineTrialPassed', {
      holderId: player.id, fragmentId: held.id,
      grant: VERGE_LINE_TRIAL.trialClassStep, tick: state.tick,
    });
    this.bus.emit('comms:log', { text: VERGE_LINE_TRIAL.trialLine, speaker: 'Measure Engine' });
  },

  update(dt, state) {
    ensureVergeState(state);
    this._tickDirectives(state, dt);
    this._tickMeasureEngines(state);
    this._tickAppeal(state);
    this._tickJury(state);
    this._tickLineTrial(state);
    // Border authority: posture first so the rings answer with the standing in hand.
    this._tickTreatment(state);
    this._tickCheckpoints(state, dt);
    this._tickPermits(state, dt);
    this._tickEscort(state, dt);
    this._tickPursuit(state, dt);
    this._tickReturnToPost(state, dt);
  },
};

/** Read model for glass, tests and neighbors: posture, permit, ledger, live marks. */
export function vergeBorderStatus(state) {
  const v = ensureVergeState(state);
  const permitLive = !!(v.permit && !v.permit.suspended
    && Number.isFinite(v.permit.expiresAt) && (state.simTime || 0) < v.permit.expiresAt);
  const fresh = [];
  const now = Number(state.simTime) || 0;
  // The same fade the treatment posture reads: full weight while fresh, half
  // while stale, and a future-dated or shelf-worn record reads nothing at all.
  let incidentWeight = 0;
  for (const inc of v.incidents) {
    const age = now - (Number(inc.at) || 0);
    if (age < 0) continue;
    if (age <= VERGE_BORDER.incidentStaleS) fresh.push(inc);
    if (age <= VERGE_BORDER.incidentFreshS) incidentWeight += Number(inc.weight) || 0;
    else if (age <= VERGE_BORDER.incidentStaleS) incidentWeight += (Number(inc.weight) || 0) * 0.5;
  }
  const lastPermit = v.permitLog.length ? v.permitLog[v.permitLog.length - 1] : null;
  return {
    treatment: v.treatment.level,
    rank: rankForState(state, VERGE_FACTION_ID),
    watchLevel: v.watch.level,
    unauthorizedCrossings: v.watch.unauthorized,
    cleanStreak: v.watch.cleanStreak,
    directivesHonored: v.watch.directivesHonored,
    permit: v.permit ? {
      tier: v.permit.tier, tierId: v.permit.tierId,
      live: permitLive, suspended: v.permit.suspended === true,
      expiresAt: v.permit.expiresAt,
    } : null,
    lastPermitDecision: lastPermit ? { result: lastPermit.result, tierId: lastPermit.tierId } : null,
    checkpoints: Object.keys(v.checkpoints).length,
    incidents: v.incidents.length,
    freshIncidents: fresh.length,
    incidentWeight,
    scans: { total: v.scans.total, clean: v.scans.clean, found: v.scans.found, evaded: v.scans.evaded },
    escort: v.escort ? { id: v.escort.id, machineId: v.escort.machineId, mode: v.escort.mode } : null,
    pursuit: v.pursuit ? {
      id: v.pursuit.id, machineId: v.pursuit.machineId, status: v.pursuit.status,
      sectorId: v.pursuit.sectorId, crossedAt: v.pursuit.crossedAt,
    } : null,
    violations: v.violations.length,
  };
}

export { VERGE_MACHINE_BODIES };
export default vergeCourt;
