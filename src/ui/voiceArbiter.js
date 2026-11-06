// Voice Arbiter (GDD pillar 3 — "one voice at a time").
import { isOnboardingTeaching } from '../core/onboardingReadModel.js';
export { isOnboardingTeaching } from '../core/onboardingReadModel.js';
//
// A single PRIORITY QUEUE that arbitrates every spoken/notified channel — toasts, enemy barks,
// market news, story comms — so they never talk over each other. Callers speak through
// ctx.helpers.voice.say({ channel, text, kind, priority, ttl, id }); the arbiter keeps a queue and
// only the single highest-priority active message is surfaced by re-emitting the existing "toast"
// event (its kind/ttl preserved so toasts.js renders it exactly as before).
//
// Design notes:
//   • Channels map to a default priority (story > alert > bark > news > info). An explicit numeric
//     `priority` overrides the channel default.
//   • Only ONE message holds the floor at a time. When it expires (ttl) or is superseded by a
//     higher-priority arrival, the next-best queued message takes the floor.
//   • Lower-priority arrivals queue behind the floor; if they go stale (their ttl elapses while still
//     queued) they are dropped unspoken rather than surfaced late.
//   • Same `id` REPLACES the existing queued/active entry (in-place text/priority update) instead of
//     stacking a duplicate — lets a live readout (e.g. "Shields 40%" → "Shields 20%") update.
//   • Barks are rate-limited so a firefight cannot spam the floor.
//   • During active onboarding, the tutorial owns the transient floor even when its current command
//     is persistent UI rather than an audible line. Only tutorial updates and danger may surface
//     (taste law: danger > tutorial > objective > comms > flavor). Load-bearing story after
//     onboarding is unchanged (story stays at 100; protection is policy-gated).
//
// The pure queue (VoiceQueue) is DOM-free and deterministic (tie-break = insertion order) so it can
// be unit-tested headless. The system wrapper wires it to the bus + a sim clock and is additive: it
// optionally intercepts the legacy "toast" event so old emitters still route through the arbiter,
// WITHOUT double-surfacing (a flag marks arbiter-originated toasts as pass-through).

import { openingInstructionSolo } from './hudAttention.js';
import { emitVoiceDismissFromBinding } from './bindings.js';
import { MAERA_FLIGHT_LINES } from '../data/barks.js';
import { adventureStunts } from '../combat/stuntWitnesses.js';
import { isHostileToPlayer } from '../systems/scanner.js';
import { forEachLivingWorldActor } from '../world/livingWorldViews.js';

// Default priority per channel — higher wins the floor.
//
// Ordering law (spec2/00 §2 pillar 3 / SPEC3-F10 §40): danger > tutorial > objective > comms >
// flavor. 'alert' is the danger channel; a danger-class caller passes an explicit priority
// (DANGER_PRIORITY=110) to sit above 'story' when lives are at stake (see alerts.js). 'story' stays
// 100 (load-bearing: many callers depend on story out-shouting flavor after onboarding). Named
// 'comms' sits between objective and bark/flavor so station/NPC addressed lines are not info-tier
// ambient. tutorial(70)/objective(60) are the one-voice closeout tiers. Do NOT renumber
// story/alert/bark/news/info — 16+ callers reference them by string.
export const CHANNEL_PRIORITY = {
  story:    100,  // story comms — highest by default, must be heard (post-onboarding load-bearing)
  alert:     80,  // urgent gameplay alerts (danger override to DANGER_PRIORITY in alerts.js)
  tutorial:  70,  // first-hour teaching — preempts objective/chatter; protected during onboarding
  objective: 60,  // mission-objective nudges — preempt chatter, yield to tutorial/danger/story
  comms:     55,  // named player-addressed station/NPC lines — objective > comms > flavor
  bark:      50,  // enemy/wingman barks — flavor, rate-limited
  news:      30,  // market / world news
  info:      10,  // ambient info (default)
};

/** Life-critical danger floor override (alerts.js announce). Tops even story. */
export const DANGER_PRIORITY = 110;

const DEFAULT_TTL_MS = 4000;         // matches toasts.js normalizeTtlMs default
const BARK_MIN_GAP_MS = 1500;        // min gap between surfaced barks (firefight anti-spam)

// Normalize a ttl (seconds<=60 → ms, ms passed through) — mirrors toasts.js normalizeTtlMs so a
// message's on-screen lifetime and its stale-drop window agree.
export function normalizeTtlMs(ttl) {
  const n = Number(ttl);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_TTL_MS;
  return n > 60 ? n : n * 1000;
}

function priorityFor(channel, priority) {
  if (Number.isFinite(priority)) return priority;
  const p = CHANNEL_PRIORITY[channel];
  return Number.isFinite(p) ? p : CHANNEL_PRIORITY.info;
}

/** True when an entry is danger-class (alert channel or explicit DANGER_PRIORITY+). */
export function isDangerVoice(entry) {
  if (!entry) return false;
  if (entry.channel === 'alert') return true;
  return Number.isFinite(entry.priority) && entry.priority >= DANGER_PRIORITY;
}

/**
 * Life-critical squelch (danger floor, squelch_danger). The dismiss key must not clear these.
 * Ordinary alert-channel warnings stay dismissable — channel alone is not critical squelch.
 */
export function isCriticalSquelchLine(entry) {
  if (!entry) return false;
  if (entry.critical === true || entry.squelch === 'critical' || entry.squelch === 'danger') return true;
  if (entry.kind === 'danger' || entry.kind === 'squelch_danger') return true;
  return Number.isFinite(entry.priority) && entry.priority >= DANGER_PRIORITY;
}

/** Whether an entry may hold the transient floor under the current presentation policy. */
function canHoldFloor(entry, policy = {}) {
  if (!entry) return false;
  if (isDangerVoice(entry)) return true;
  if (policy.tutorialProtect) return entry.channel === 'tutorial';
  // Opening one-instruction rule (hudAttention): inside the first two minutes with an objective
  // pending, the floor holds only the instruction channels — every other sentence retires until
  // the player has done the thing.
  if (policy.openingSolo) return entry.channel === 'tutorial' || entry.channel === 'objective';
  return true;
}

/**
 * Can `candidate` interrupt `active` under the current policy?
 * Strict priority preemption + optional tutorial protection during onboarding.
 * Pure and deterministic (no wall clock, no RNG).
 */
export function canInterrupt(active, candidate, policy = {}) {
  if (!candidate) return false;
  if (!active) return true;
  if (candidate.priority <= active.priority) return false;
  // First-hour pacing: a held tutorial beat yields only to danger, never to story/flavor/comms.
  if (policy.tutorialProtect && active.channel === 'tutorial' && !isDangerVoice(candidate)) {
    return false;
  }
  return true;
}

// Stable presentation key for a queue entry: its explicit id, else a seq-derived key. Used so a
// presenter (alerts.js top-center floor) can pair each voice:surface with its voice:clear.
function presentationKey(entry) {
  if (!entry) return null;
  return entry.id != null ? String(entry.id) : 'seq:' + entry.seq;
}

// ── Pure, DOM-free priority queue ────────────────────────────────────────────────────────────────
// Deterministic: ordering is by priority DESC, then insertion order (seq) ASC. `now` is injected by
// the caller (sim clock in ms) so there is no hidden time source.
export class VoiceQueue {
  constructor(opts = {}) {
    this._seq = 0;                                   // monotonic insertion counter (tie-break)
    this._items = [];                                // queued, not-yet-surfaced entries
    this._active = null;                             // the single entry holding the floor
    this._barkMinGapMs = Number.isFinite(opts.barkMinGapMs) ? opts.barkMinGapMs : BARK_MIN_GAP_MS;
    this._lastBarkAt = -Infinity;                    // when a bark last took the floor
  }

  // Enqueue a message. Returns the normalized entry (for tests/inspection). `now` is the sim clock.
  // Same-id coalesce: replaces active or queued entry in place (keeps seq; refreshes text/ttl).
  // `resume:false` is an opt-in, one-shot entry: if it is interrupted or suspended before it ever
  // takes the floor it is dropped instead of re-queued, because its moment has passed (the Hull
  // Ghost's flight commentary). Absent the flag, the existing resume-on-interrupt behavior holds.
  enqueue({ channel = 'info', text = '', kind, priority, ttl, id, valid, resume } = {}, now = 0) {
    if (!text) return null;
    const ttlMs = normalizeTtlMs(ttl);
    const entry = {
      id: id != null ? String(id) : null,
      channel,
      text,
      kind: kind || channel || 'info',              // fall back to channel name as toast kind
      priority: priorityFor(channel, priority),
      ttlMs,
      ...(typeof valid === 'function' ? { valid } : {}),
      ...(resume === false ? { resume: false } : {}),
      enqueuedAt: now,
      // One extra bark gap is queue patience, not screen time. Equal-tick barks must not
      // expire together when the first finishes. Backlogged lines still have a finite age.
      expireAt: now + ttlMs + (channel === 'bark' ? this._barkMinGapMs : 0),
      seq: this._seq++,
    };
    // Coalesce (same-id replace): update the existing active or queued entry in place (keep its seq
    // so a live readout does not jump the queue by re-inserting). Deterministic: one id → one slot.
    if (entry.id != null) {
      if (this._active && this._active.id === entry.id) {
        entry.seq = this._active.seq;
        if (channel === 'bark') {
          entry.floorStartedAt = now;
          entry.expireAt = now + ttlMs;
        }
        this._active = entry;
        return entry;
      }
      const qi = this._items.findIndex((e) => e.id === entry.id);
      if (qi >= 0) {
        entry.seq = this._items[qi].seq;
        this._items[qi] = entry;
        return entry;
      }
    }
    this._items.push(entry);
    return entry;
  }

  // Local authority predicates never enter the scalar presentation wire.
  static _valid(entry) {
    if (typeof entry?.valid !== 'function') return true;
    try { return entry.valid() === true; } catch { return false; }
  }

  cancel(id) {
    if (id == null) return false;
    const key = String(id);
    const before = this._items.length;
    this._items = this._items.filter(entry => entry.id !== key);
    const active = this._active?.id === key;
    if (active) this._active = null;
    return active || before !== this._items.length;
  }

  // Compare two entries: higher priority first, then earlier insertion (deterministic tie-break).
  static _cmp(a, b) {
    if (a.priority !== b.priority) return b.priority - a.priority;
    return a.seq - b.seq;
  }

  _pickBest(filterFn) {
    let best = null;
    for (const e of this._items) {
      if (filterFn && !filterFn(e)) continue;
      if (best === null || VoiceQueue._cmp(e, best) < 0) best = e;
    }
    return best;
  }

  /**
   * Interrupt: promote `best` over the current floor. Preempted entry is re-queued (if still live)
   * so a danger cut-in does not permanently drop a tutorial beat. Deterministic: re-queued entry
   * keeps its original seq/expireAt.
   */
  _promote(best, now) {
    const idx = this._items.indexOf(best);
    if (idx >= 0) this._items.splice(idx, 1);
    const prev = this._active;
    this._active = best;
    if (best.channel === 'bark') {
      this._lastBarkAt = now;
      // A delayed line gets its requested reading time. A preempted line retains its
      // original floor deadline when it resumes, so interruptions cannot prolong it forever.
      if (!Number.isFinite(best.floorStartedAt)) {
        best.floorStartedAt = now;
        best.expireAt = now + best.ttlMs;
      }
    }
    // Re-queue the interrupted floor holder unless same-id coalesce already replaced it, it is
    // already past its expire window, or it opted out of resuming (a commentary line whose moment
    // has passed must never re-surface as a second `voice:surface`).
    if (prev && prev !== best && now < prev.expireAt && prev.resume !== false) {
      const sameId = prev.id != null && best.id != null && prev.id === best.id;
      if (!sameId) {
        // Avoid stacking a duplicate id if a same-id copy already sits in the queue.
        const dup = prev.id != null && this._items.some((e) => e.id === prev.id);
        if (!dup) this._items.push(prev);
      }
    }
    return best;
  }

  /**
   * Dismiss the active floor immediately (player/system clear). Deterministic: drops active and
   * promotes the next eligible candidate via step(). Returns the newly surfaced entry or null.
   */
  dismiss(now = 0, policy = {}) {
    if (isCriticalSquelchLine(this._active)) return null;
    this._active = null;
    return this.step(now, policy);
  }

  // Advance the queue at time `now`. Drops stale queued entries, expires the active entry, and (if
  // the floor is free or a higher eligible arrival may interrupt) promotes the best eligible queued
  // entry. Returns the entry that should be surfaced THIS tick (newly took the floor), or null if
  // nothing changed / floor still held.
  //
  // `policy.tutorialProtect` — while onboarding is teaching, reserves the floor for tutorial/danger
  // even when the current tutorial command is persistent UI rather than a queued voice line.
  step(now = 0, policy = {}) {
    // Expire the active floor holder.
    if (this._active && (now >= this._active.expireAt || !VoiceQueue._valid(this._active))) this._active = null;

    // Drop stale queued entries (their ttl elapsed before they ever got the floor).
    if (this._items.length) {
      this._items = this._items.filter((e) => now < e.expireAt && VoiceQueue._valid(e));
    }

    // Onboarding may begin while a non-danger line is already holding the floor. Suspend it under
    // its original TTL so the wrapper retracts it now; it may resume only if teaching ends before it
    // becomes stale. This also makes persistent tutorial UI equivalent to a held audible beat.
    // A non-resuming commentary entry is dropped instead, for the same reason as _promote.
    if (this._active && !canHoldFloor(this._active, policy)) {
      const suspended = this._active;
      this._active = null;
      if (now < suspended.expireAt && suspended.resume !== false) this._items.push(suspended);
    }
    if (!this._items.length) return null;

    const active = this._active;
    const barkBlocked = (e) =>
      e.channel === 'bark' && (now - this._lastBarkAt) < this._barkMinGapMs;

    // Best candidate that may take the floor under interrupt policy + bark rate-limit.
    let best = this._pickBest((e) => {
      if (!canHoldFloor(e, policy)) return false;
      if (active && !canInterrupt(active, e, policy)) return false;
      if (barkBlocked(e)) return false;
      return true;
    });

    // Bark rate-limit fallback: if the best was bark-blocked (or no bark-ok candidate), try a
    // non-bark alternate that can still interrupt.
    if (!best) {
      // If there are only bark-blocked items that could otherwise interrupt, hold.
      const anyEligibleIgnoringBark = this._pickBest((e) => {
        if (!canHoldFloor(e, policy)) return false;
        if (active && !canInterrupt(active, e, policy)) return false;
        return true;
      });
      if (!anyEligibleIgnoringBark) return null;
      // Prefer a non-bark that can interrupt.
      best = this._pickBest((e) => {
        if (!canHoldFloor(e, policy)) return false;
        if (e.channel === 'bark') return false;
        if (active && !canInterrupt(active, e, policy)) return false;
        return true;
      });
      if (!best) return null;
    }

    // Floor free, or interrupt allowed — promote.
    if (active && !canInterrupt(active, best, policy)) return null;
    return this._promote(best, now);
  }

  get active() { return this._active; }
  get pending() { return this._items.slice(); }
  get size() { return this._items.length + (this._active ? 1 : 0); }
}

// ── Captain Maera Vols: flight commentary ──────────────────────────────────────────────────────
//
// The Hull Ghost (campaign47a G15) notices what the player actually does and says one authored,
// captioned radio line about it. This is a SESSION-ONLY observer: every field lives on the arbiter
// instance, no GameState/player/story key is added, and nothing enters a save. It reads real events
// the sim already emits, keeps at most one pending submission, and speaks only through the one
// existing voice floor — it never adds a second presenter, priority tier, or audio path.
//
// Admission law (taste law: danger > tutorial > objective > comms > flavor):
//   • ordinary commentary is flavor (bark channel, 54) and waits 45 sim seconds after the last one;
//   • it stays silent while onboarding/opening-solo owns the floor or combat pressure is live;
//   • a genuine warning (rounds across the bow) is danger-class and may always speak;
//   • audio starts on the real `voice:surface`, never on event arrival or enqueue acceptance.

/** Captain Maera Vols — a named contact, not a faction roster entry. */
export const MAERA_CONTACT_ID = 'contact_maera_vols';
const MAERA_CAPTION_NAME = 'Captain Maera Vols';
const MAERA_ORDINARY_PRIORITY = 54;      // above plain bark (50), below comms (55)/objective (60)
const MAERA_ORDINARY_TTL_S = 6;
const MAERA_WARNING_TTL_S = 3;
const MAERA_ORDINARY_GAP_S = 45;         // commentary admission, not a flight/combat tuning value
const MAERA_PRESSURE_HOLD_S = 3;
const MAERA_HOSTILE_PRESSURE_RANGE_WU = 900;
const MAERA_LINE_BY_ID = new Map(MAERA_FLIGHT_LINES.map((line) => [line.id, line]));
const MAERA_ORDER = new Map(MAERA_FLIGHT_LINES.map((line, index) => [line.id, index]));
// Sector-dependent commentary is testimony about a place the player has already left.
const MAERA_PLACE_CATEGORIES = new Set(['sector', 'stunt', 'near_miss', 'line']);

function createMaeraCommentary() {
  return {
    usedLineIds: new Set(),      // spent: delivered, interrupted, or stale-dropped this session
    pending: new Map(),          // lineId -> copied scalar event evidence (never an object ref)
    attachedTargets: new Set(),  // target ids the PLAYER latched (release has only targetId)
    submittedId: null,           // the one line currently in the queue
    lastNormalAtS: -Infinity,    // last ordinary line that actually reached the floor
    pressureUntilS: -Infinity,   // combat pressure deadline (sim seconds)
    delivered: new Map(),        // lineId -> the evidence record that produced the spoken line
  };
}

// ── System wrapper ──────────────────────────────────────────────────────────────────────────────
export const voiceArbiter = {
  name: 'voiceArbiter',

  init(ctx) {
    this.bus = ctx.bus;
    this.state = ctx.state;
    this.queue = new VoiceQueue();
    this._passThrough = false;                        // guards against re-arbitrating our own toasts
    this._activeKey = null;                           // presentation key of the current floor holder
    this._presentSig = null;                          // id+text of the presented floor (dedupe re-emit)
    // Re-initialization must not stack a second set of commentary observers on the same owner.
    this._maeraReleaseListeners();
    this._maera = createMaeraCommentary();

    const say = (msgOrChannel, text, opts) => {
      const msg = typeof msgOrChannel === 'string'
        ? { channel: msgOrChannel, text, ...(opts || {}) }
        : msgOrChannel;
      if (!msg || !msg.text) return false;
      const activeBefore = this.queue.active;
      const entry = this.queue.enqueue(msg, this._now());
      if (!entry) return false;
      if (!VoiceQueue._valid(entry)) {
        this.queue.cancel(entry.id);
        this._flushPresentation(null);
        return false;
      }
      // Docking can pause the fixed-tick loop immediately after an authority event. When a live
      // readout replaces the CURRENT floor under the same stable id, refresh its presenter now;
      // no queue step, priority decision, or preemption is involved. Normal new arrivals still
      // wait for update() so the arbiter remains the sole ordering authority.
      if (activeBefore && entry.id != null && activeBefore.id === entry.id) {
        this._flushPresentation(null);
      }
      return true;
    };
    if (ctx.helpers) {
      ctx.helpers.voice = {
        say,
        cancel: (id) => {
          const removed = this.queue.cancel(id);
          if (removed) this._flushPresentation(null);
          return removed;
        },
        // Deterministic floor control for presenters/tests (sim-time only).
        dismiss: () => {
          const policy = this._policy();
          const surfaced = this.queue.dismiss(this._now(), policy);
          // Force presentation refresh on next update; clear immediately so UI retracts.
          this._flushPresentation(surfaced);
          return !!surfaced || !this.queue.active;
        },
      };
    }
    this.bus.on('voice:say', say);
    this.bus.on('voice:dismiss', () => {
      if (!this.queue) return;
      if (isCriticalSquelchLine(this.queue.active)) return;
      const policy = this._policy();
      const active = this.queue.active;
      // A player dismissal clears the pill once — but never a critical squelch (danger class),
      // and not the tutorial floor while onboarding still owns it. Channel alone is not
      // critical squelch (isCriticalSquelchLine), so ordinary alert-channel warnings clear.
      if (active && policy.tutorialProtect && active.channel === 'tutorial') return;
      const surfaced = this.queue.dismiss(this._now(), policy);
      this._flushPresentation(surfaced);
    });
    // The UI key router does not own F6. The registered binding emits voice:dismiss from here.
    if (this._onVoiceDismissKey && typeof document !== 'undefined' && document.removeEventListener) {
      document.removeEventListener('keydown', this._onVoiceDismissKey);
    }
    this._onVoiceDismissKey = (ev) => {
      if (this.bus) emitVoiceDismissFromBinding(this.bus, ev);
    };
    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('keydown', this._onVoiceDismissKey);
    }

    // Optionally intercept legacy "toast" emitters so they route through the arbiter too. We must not
    // double-surface: toasts we ourselves re-emit carry _fromVoice and are ignored here. We cannot
    // cancel the legacy toast (bus has no interception), so instead the arbiter simply ALSO queues a
    // copy — de-duped by identical text within a short window is left to toasts.js grouping. To keep
    // strictly "one voice", legacy emitters SHOULD migrate to voice.say; this hook is a soft bridge
    // that is inert unless enabled to avoid changing golden telemetry.
    // (Left disabled by default: enabling would surface each legacy toast twice unless the emitter is
    // also updated. Kept as an explicit opt-in so 47a golden output is untouched.)
    this._maeraInstallListeners();
  },

  newGame() {
    this.queue = new VoiceQueue();
    this._lastSurfacedId = null;
    this._activeKey = null;
    this._presentSig = null;
    // A fresh run starts a fresh commentary session: new lines may be spoken again.
    this._maeraResetRuntime({ keepUsed: false });
  },

  /** Registry teardown: release the listeners this owner installed. */
  destroy() {
    this._maeraReleaseListeners();
    if (this._onVoiceDismissKey && typeof document !== 'undefined' && document.removeEventListener) {
      document.removeEventListener('keydown', this._onVoiceDismissKey);
    }
    this._onVoiceDismissKey = null;
  },

  _now() {
    // Sim clock in ms. state.simTime is seconds (see beacons.js); fall back to 0 headless.
    const t = this.state && this.state.simTime;
    return Number.isFinite(t) ? t * 1000 : 0;
  },

  _policy() {
    return {
      tutorialProtect: isOnboardingTeaching(this.state),
      openingSolo: openingInstructionSolo(this.state),
    };
  },

  // ── Hull Ghost commentary (session-only) ─────────────────────────────────────────────────────

  _maeraNowS() {
    const s = this.state;
    if (!s) return 0;
    if (Number.isFinite(s.simTime)) return s.simTime;
    return Number.isFinite(s.tick) ? s.tick / 60 : 0;
  },

  _maeraSectorId() {
    const id = this.state && this.state.world && this.state.world.currentSectorId;
    return typeof id === 'string' && id ? id : null;
  },

  _maeraPlayer() {
    const s = this.state;
    if (!s || s.playerId == null || !s.entities || typeof s.entities.get !== 'function') return null;
    const player = s.entities.get(s.playerId);
    if (!player || player.alive === false) return null;
    return player;
  },

  _maeraPlayerAlive() {
    return this._maeraPlayer() != null;
  },

  /** Flying, not docked, not in a menu: the only place a hull line makes sense. */
  _maeraInFlight() {
    const state = this.state;
    if (!state || state.mode !== 'flight') return false;
    if (state.ui && state.ui.docked === true) return false;
    return true;
  },

  _maeraInstallListeners() {
    if (!this.bus || typeof this.bus.on !== 'function') return;
    this._maeraReleaseListeners();
    const unsubs = [];
    const events = new Set(['combat:damage']);
    for (const line of MAERA_FLIGHT_LINES) events.add(line.event);
    for (const event of events) {
      unsubs.push(this.bus.on(event, (payload) => this._maeraObserve(event, payload)));
    }
    // Delivery is owned by the real floor: the caption that reached the screen is the one and only
    // moment the radio opens.
    unsubs.push(this.bus.on('voice:surface', (payload) => this._maeraOnSurface(payload)));
    unsubs.push(this.bus.on('save:loaded', () => this._maeraOnSaveLoaded()));
    unsubs.push(this.bus.on('sector:exit', (payload) => this._maeraOnSectorExit(payload)));
    unsubs.push(this.bus.on('game:new', () => this.newGame()));
    this._maeraUnsubs = unsubs;
  },

  _maeraReleaseListeners() {
    const unsubs = this._maeraUnsubs;
    this._maeraUnsubs = null;
    if (!Array.isArray(unsubs)) return;
    for (const off of unsubs) {
      try { if (typeof off === 'function') off(); } catch { /* a dead bus is already gone */ }
    }
  },

  _maeraResetRuntime({ keepUsed = false } = {}) {
    const c = this._maera;
    if (!c) return;
    if (!keepUsed) c.usedLineIds.clear();
    c.pending.clear();
    c.attachedTargets.clear();
    c.submittedId = null;
    c.lastNormalAtS = -Infinity;
    c.pressureUntilS = -Infinity;
    if (!keepUsed) c.delivered.clear();
  },

  // ── observation: copy scalars, never retain an event or entity object ────────────────────────
  _maeraObserve(event, payload) {
    const state = this.state;
    const c = this._maera;
    if (!state || !c) return;
    // Adventure only: swarm/survival/lab runs leave the radio silent.
    if (!adventureStunts(state)) return;
    if (!this._maeraPlayerAlive()) return;
    // Docking/menus are not flight observations. Only departure and an actual sale may be
    // captured here and held until flight resumes.
    if (!this._maeraInFlight() && event !== 'dock:undocked' && event !== 'economy:tradeCompleted') return;
    const nowS = this._maeraNowS();
    const p = payload || {};

    if (event === 'combat:damage') {
      if (p.targetId !== state.playerId) return;
      if (p.attackerId === state.playerId) return;
      c.pressureUntilS = Math.max(c.pressureUntilS, nowS + MAERA_PRESSURE_HOLD_S);
      this._maeraCancelOrdinary();
      return;
    }

    if (event === 'sector:enter') {
      if (typeof p.sectorId !== 'string' || !p.sectorId) return;
      const line = MAERA_FLIGHT_LINES.find((l) => l.event === 'sector:enter' && l.sectorId === p.sectorId);
      if (!line) return;
      this._maeraRecord(line, event, { sectorId: p.sectorId }, nowS);
      return;
    }

    if (event === 'dock:undocked') {
      // Leaving the berth is the first time the hull is hers to fly again.
      const line = MAERA_FLIGHT_LINES.find((l) => l.event === 'dock:undocked');
      if (line) this._maeraRecord(line, event, {}, nowS);
      return;
    }

    if (event === 'tether:attached') {
      if (p.targetId == null) return;
      // The attachment service reports the hull it bound and, when another hull flies it, the
      // controller. Either being the player makes this the player's line.
      if (p.actorId !== state.playerId && p.controllerId !== state.playerId) return;
      const targetId = String(p.targetId);
      c.attachedTargets.add(targetId);
      const line = MAERA_FLIGHT_LINES.find((l) => l.event === 'tether:attached');
      if (line) this._maeraRecord(line, event, { targetId }, nowS);
      return;
    }

    if (event === 'tether:released') {
      if (p.targetId == null) return;
      const targetId = String(p.targetId);
      // Release payloads carry only the target: speak only for a target THIS player latched.
      if (!c.attachedTargets.delete(targetId)) return;
      const line = MAERA_FLIGHT_LINES.find((l) => l.event === 'tether:released');
      if (line) this._maeraRecord(line, event, { targetId }, nowS);
      return;
    }

    if (event === 'pickup:collected') {
      if (p.collectorId !== state.playerId) return;
      if (!(Number(p.amount) > 0)) return;
      if (p.commodityId == null || p.commodityId === '') return;
      const line = MAERA_FLIGHT_LINES.find((l) => l.event === 'pickup:collected');
      if (line) this._maeraRecord(line, event, { commodityId: String(p.commodityId), amount: Number(p.amount) }, nowS);
      return;
    }

    if (event === 'economy:tradeCompleted') {
      if (p.side !== 'sell') return;
      if (!(Number(p.qty) > 0)) return;
      const line = MAERA_FLIGHT_LINES.find((l) => l.event === 'economy:tradeCompleted');
      if (line) this._maeraRecord(line, event, { commodityId: p.commodityId == null ? null : String(p.commodityId), qty: Number(p.qty) }, nowS);
      return;
    }

    if (event === 'story:beatAdvanced') {
      const fromIndex = Number(p.fromIndex);
      const toIndex = Number(p.toIndex);
      if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex)) return;
      if (!(toIndex > fromIndex)) return; // only a forward transition is a story beat
      const line = MAERA_FLIGHT_LINES.find((l) => l.event === 'story:beatAdvanced' && l.storyToIndex === toIndex);
      if (!line) return;
      this._maeraRecord(line, event, { storyFromIndex: fromIndex, storyToIndex: toIndex }, nowS);
      return;
    }

    if (event === 'stunt:trickDetected') {
      if (p.actorId !== state.playerId) return;
      if (p.amendment === true) return;
      if (p.episodeId == null || p.episodeId === '') return; // a stunt without an episode is noise
      const trickId = typeof p.trickId === 'string' ? p.trickId : '';
      const specific = trickId
        ? MAERA_FLIGHT_LINES.find((l) => l.event === 'stunt:trickDetected' && l.trickId === trickId)
        : null;
      // One event selects one line: a specific trick takes precedence over the generic reaction.
      const line = specific || MAERA_FLIGHT_LINES.find((l) => l.event === 'stunt:trickDetected' && !l.trickId);
      if (line) this._maeraRecord(line, event, { trickId, episodeId: String(p.episodeId) }, nowS);
      return;
    }

    if (event === 'projectile:nearMiss') {
      if (p.targetId !== state.playerId) return;
      if (p.projectileId == null) return;
      const speed = Number(p.speed);
      const distance = Number(p.distance);
      if (!Number.isFinite(speed) || speed <= 0) return;
      if (!Number.isFinite(distance) || distance <= 0) return;
      c.pressureUntilS = Math.max(c.pressureUntilS, nowS + MAERA_PRESSURE_HOLD_S);
      this._maeraCancelOrdinary();
      const line = MAERA_FLIGHT_LINES.find((l) => l.event === 'projectile:nearMiss');
      if (line) this._maeraRecord(line, event, {
        projectileId: String(p.projectileId),
        ownerId: p.ownerId == null ? null : String(p.ownerId),
        speed,
        distance,
      }, nowS);
      return;
    }
  },

  _maeraRecord(line, sourceEvent, extra, nowS) {
    const c = this._maera;
    if (!c || !line) return false;
    if (c.usedLineIds.has(line.id)) return false;
    if (c.pending.has(line.id)) return false;
    if (c.submittedId === line.id) return false;
    const maxAgeS = Number.isFinite(line.maxAgeS) ? line.maxAgeS : 300;
    const record = {
      lineId: line.id,
      sourceEvent,
      category: line.category,
      eventKey: `${sourceEvent}#${(this.state && this.state.tick) | 0}:${line.id}`,
      sectorId: line.event === 'sector:enter' && extra && extra.sectorId ? extra.sectorId : this._maeraSectorId(),
      observedAtS: nowS,
      expiresAtS: nowS + maxAgeS,
      ...extra,
    };
    c.pending.set(line.id, record);
    return true;
  },

  // ── admission: at most one commentary entry, ordered by when the moment happened ─────────────
  _maeraAdmit(nowS, policy) {
    const c = this._maera;
    if (!c || !this.queue) return;
    this._maeraPrune(nowS);
    const engaged = !!c.submittedId || c.pending.size > 0;
    if (this._maeraPressure(nowS, engaged)) this._maeraCancelOrdinary();

    if (c.submittedId && !this._maeraQueueHolds(c.submittedId)) {
      // It left the queue without surfacing (stale, policy-invalidated, or preempted). A missed
      // moment is never a later repeat: retire it for the rest of the session.
      this._maeraRetire(c.submittedId);
    }
    if (!c.pending.size) return;

    let candidates = [...c.pending.values()].filter((rec) => this._maeraCanSubmit(rec, nowS, policy));
    if (!candidates.length) return;
    if (c.submittedId && this._maeraQueueHolds(c.submittedId)) {
      const current = MAERA_LINE_BY_ID.get(c.submittedId);
      // One commentary entry at a time. Only a genuine warning may displace an ordinary one, and
      // the displaced ordinary is retired by _maeraSubmit (never replayed).
      if (!current || current.warning === true) return;
      candidates = candidates.filter((rec) => {
        const line = MAERA_LINE_BY_ID.get(rec.lineId);
        return !!(line && line.warning === true);
      });
      if (!candidates.length) return;
    }
    candidates.sort((a, b) => (a.observedAtS - b.observedAtS) || (MAERA_ORDER.get(a.lineId) - MAERA_ORDER.get(b.lineId)));
    this._maeraSubmit(candidates[0], nowS);
  },

  _maeraPrune(nowS) {
    const c = this._maera;
    if (!c) return;
    const sectorId = this._maeraSectorId();
    for (const [lineId, rec] of [...c.pending]) {
      const stale = nowS >= rec.expiresAtS;
      const leftPlace = MAERA_PLACE_CATEGORIES.has(rec.category)
        && rec.sectorId && sectorId && rec.sectorId !== sectorId;
      if (!stale && !leftPlace) continue;
      if (c.submittedId === lineId) this._maeraRetire(lineId);
      else c.pending.delete(lineId);
    }
  },

  _maeraCanSubmit(rec, nowS, policy) {
    const c = this._maera;
    const line = MAERA_LINE_BY_ID.get(rec.lineId);
    if (!c || !line) return false;
    if (c.usedLineIds.has(line.id)) return false;
    if (nowS >= rec.expiresAtS) return false;
    if (!this._maeraPlayerAlive()) return false;
    if (!this._maeraInFlight()) return false; // a docked line waits for the ship to fly
    if (line.warning === true) return true;              // danger outranks tutorial and pressure
    if (nowS < c.pressureUntilS) return false;
    if (policy && (policy.tutorialProtect || policy.openingSolo)) return false;
    if (nowS - c.lastNormalAtS < MAERA_ORDINARY_GAP_S) return false;
    return true;
  },

  _maeraPressure(nowS, observeHostiles) {
    const c = this._maera;
    if (!c) return false;
    if (nowS < c.pressureUntilS) return true;
    if (!observeHostiles) return false;
    if (!this._maeraHostilePressure()) return false;
    c.pressureUntilS = Math.max(c.pressureUntilS, nowS + MAERA_PRESSURE_HOLD_S);
    return true;
  },

  // A living hostile that is already pointed at the player holds the room. Reads the same target
  // fields barkDirector reads; the range is a commentary admission value, not a combat tuning one.
  _maeraHostilePressure() {
    const state = this.state;
    const player = this._maeraPlayer();
    if (!state || !player || !player.pos) return false;
    let pressured = false;
    forEachLivingWorldActor(state, (entity) => {
      if (pressured || !entity || entity.id === player.id || !entity.pos) return;
      const dx = Number(entity.pos.x) - Number(player.pos.x);
      const dz = Number(entity.pos.z) - Number(player.pos.z);
      if (!Number.isFinite(dx) || !Number.isFinite(dz)) return;
      if (Math.hypot(dx, dz) > MAERA_HOSTILE_PRESSURE_RANGE_WU) return;
      const data = entity.data || {};
      const combat = data.combat || null;
      const ai = data.ai || null;
      const intent = data.intent || null;
      const targeting = !!((combat && (combat.targetId === state.playerId || combat.lockTarget === state.playerId))
        || (ai && (ai.forcePlayerTarget === true || ai.huntPlayer === true))
        || (intent && intent.fire === true));
      if (!targeting) return;
      if (isHostileToPlayer(entity, player.team, state)) pressured = true;
    });
    return pressured;
  },

  _maeraSubmit(rec, nowS) {
    const c = this._maera;
    const line = MAERA_LINE_BY_ID.get(rec.lineId);
    if (!c || !line || !this.queue) return false;
    if (c.submittedId) {
      const current = MAERA_LINE_BY_ID.get(c.submittedId);
      if (current && current.warning === true) return false; // don't stack warnings
      this._maeraRetire(c.submittedId);
    }
    const warning = line.warning === true;
    const entry = this.queue.enqueue({
      channel: warning ? 'alert' : 'bark',
      priority: warning ? DANGER_PRIORITY : MAERA_ORDINARY_PRIORITY,
      kind: warning ? 'hullGhostWarning' : 'hullGhost',
      ttl: warning ? MAERA_WARNING_TTL_S : MAERA_ORDINARY_TTL_S,
      id: `maera:${line.id}`,
      text: `${MAERA_CAPTION_NAME}: ${line.text}`,
      resume: false,
      valid: warning ? () => this._maeraWarningValid() : () => this._maeraOrdinaryValid(),
    }, this._now());
    if (!entry) return false;
    c.submittedId = line.id;
    return true;
  },

  // Local authority predicates: a queued ordinary line cannot take the floor after pressure or
  // tutorial policy changed, and a captioned warning never fires off the ship.
  _maeraOrdinaryValid() {
    if (!this._maeraInFlight() || !this._maeraPlayerAlive()) return false;
    const policy = this._policy();
    if (policy.tutorialProtect || policy.openingSolo) return false;
    return !this._maeraPressure(this._maeraNowS(), true);
  },

  _maeraWarningValid() {
    return this._maeraInFlight() && this._maeraPlayerAlive();
  },

  _maeraQueueHolds(lineId) {
    const q = this.queue;
    if (!q || !lineId) return false;
    const id = `maera:${lineId}`;
    if (q.active && String(q.active.id) === id) return true;
    return q.pending.some((entry) => entry && String(entry.id) === id);
  },

  _maeraRetire(lineId) {
    const c = this._maera;
    if (!c || !lineId) return false;
    const id = `maera:${lineId}`;
    const removed = this.queue ? this.queue.cancel(id) : false;
    c.pending.delete(lineId);
    c.usedLineIds.add(lineId);
    if (c.submittedId === lineId) c.submittedId = null;
    if (removed) this._flushPresentation(null);
    return true;
  },

  /** Combat pressure begins: an ordinary Maera line loses its moment permanently. Never any other
   *  owner's entry, and never a warning. */
  _maeraCancelOrdinary() {
    const c = this._maera;
    if (!c || !c.submittedId) return;
    const line = MAERA_LINE_BY_ID.get(c.submittedId);
    if (!line || line.warning === true) return;
    this._maeraRetire(c.submittedId);
  },

  // ── delivery: exactly once, on the real floor ───────────────────────────────────────────────
  _maeraOnSurface(payload) {
    const c = this._maera;
    if (!c || !payload || payload.id == null) return;
    const key = String(payload.id);
    if (!key.startsWith('maera:')) return;
    const lineId = key.slice('maera:'.length);
    if (c.submittedId !== lineId) return;
    if (c.usedLineIds.has(lineId)) return;
    const active = this.queue && this.queue.active;
    if (!active || String(active.id) !== key) return; // only the actual floor counts
    const line = MAERA_LINE_BY_ID.get(lineId);
    if (!line) return;
    const record = c.pending.get(lineId) || null;
    c.usedLineIds.add(lineId);
    c.pending.delete(lineId);
    c.submittedId = null;
    if (record) c.delivered.set(lineId, { ...record });
    const warning = line.warning === true;
    if (!warning) c.lastNormalAtS = this._maeraNowS();
    if (this.bus) {
      this.bus.emit('barkDirector:voice', {
        factionId: MAERA_CONTACT_ID,
        situation: warning ? 'warn' : 'patrol-greeting',
        text: line.text,
        importance: warning ? 1 : 0.3,
      });
    }
  },

  // ── lifecycle ───────────────────────────────────────────────────────────────────────────────
  _maeraOnSaveLoaded() {
    const c = this._maera;
    if (!c) return;
    if (this.queue) {
      const ids = new Set();
      if (this.queue.active && String(this.queue.active.id || '').startsWith('maera:')) {
        ids.add(String(this.queue.active.id).slice('maera:'.length));
      }
      for (const entry of this.queue.pending) {
        if (entry && String(entry.id || '').startsWith('maera:')) ids.add(String(entry.id).slice('maera:'.length));
      }
      for (const id of ids) this.queue.cancel(`maera:${id}`);
      if (ids.size) this._flushPresentation(null);
    }
    // A loaded save is a new present: stale evidence and deadlines go, but the lines this running
    // session already spent stay spent, so a Continue cannot replay them.
    c.pending.clear();
    c.attachedTargets.clear();
    c.submittedId = null;
    c.lastNormalAtS = -Infinity;
    c.pressureUntilS = -Infinity;
  },

  _maeraOnSectorExit(payload) {
    const c = this._maera;
    if (!c) return;
    c.attachedTargets.clear();
    const exiting = payload && typeof payload.sectorId === 'string' ? payload.sectorId : null;
    if (!exiting) return;
    for (const [lineId, rec] of [...c.pending]) {
      if (!MAERA_PLACE_CATEGORIES.has(rec.category)) continue;
      if (rec.sectorId !== exiting) continue;
      if (c.submittedId === lineId) this._maeraRetire(lineId);
      else c.pending.delete(lineId);
    }
  },

  // Shared presentation path for update() and dismiss() so clear/surface stay one floor.
  _flushPresentation(surfaced) {
    if (!this.bus) return;
    const prevKey = this._activeKey || null;
    const active = this.queue && this.queue.active;
    const activeKey = active ? presentationKey(active) : null;

    if (prevKey && prevKey !== activeKey) {
      this.bus.emit('voice:clear', { id: prevKey });
    }

    const presentSig = active ? activeKey + '\u0001' + active.text : null;
    if (active && presentSig !== this._presentSig) {
      this.bus.emit('voice:surface', {
        id: activeKey,
        channel: active.channel,
        priority: active.priority,
        text: active.text,
        kind: active.kind,
        ttl: active.ttlMs / 1000,
      });
    }
    this._activeKey = activeKey;
    this._presentSig = presentSig;

    if (surfaced) {
      this._passThrough = true;
      this.bus.emit('toast', {
        text: surfaced.text,
        kind: surfaced.kind,
        ttl: surfaced.ttlMs / 1000,
        _fromVoice: true,
      });
      this._passThrough = false;
    } else if (!active && prevKey) {
      // Dismiss with empty queue: presentation already cleared above.
    }
  },

  update(dt, state) {
    if (!this.queue) return;
    if (state) this.state = state;
    const now = this._now();
    const policy = this._policy();
    // Maera's commentary is admitted BEFORE the queue steps, so a line whose moment is now takes
    // this tick's floor through the ordinary priority decision — never around it.
    this._maeraAdmit(this._maeraNowS(), policy);
    const prevKey = this._activeKey || null;
    const surfaced = this.queue.step(now, policy);
    const active = this.queue.active;
    const activeKey = active ? presentationKey(active) : null;

    // Floor released (its ttl elapsed) or replaced (a higher-priority arrival preempted it): retract
    // the old presentation FIRST so the top-center presenter (alerts.js) never shows two floors.
    if (prevKey && prevKey !== activeKey) {
      this.bus.emit('voice:clear', { id: prevKey });
    }

    // Present the current floor whenever its identity OR text changed. This covers a fresh promotion
    // AND an in-place same-id update (a live readout, or a tutorial followup replacing its beat line
    // under a stable id) — the presenter must re-render either way.
    const presentSig = active ? activeKey + '\u0001' + active.text : null;
    if (active && presentSig !== this._presentSig) {
      // The single top-center one-voice attention line (spec2/06). alerts.js renders it; toasts.js
      // suppresses the _fromVoice mirror below so this is never double-surfaced.
      this.bus.emit('voice:surface', {
        id: activeKey,
        channel: active.channel,
        priority: active.priority,
        text: active.text,
        kind: active.kind,
        ttl: active.ttlMs / 1000,
      });
    }
    this._activeKey = activeKey;
    this._presentSig = presentSig;

    if (surfaced) {
      // Re-emit as a normal toast — BYTE-IDENTICAL to the pre-one-voice behavior (only on a fresh
      // floor promotion, never on an in-place text update) so the golden telemetry + the
      // check-one-voice system-wrapper contract are untouched. toasts.js ignores _fromVoice (renders
      // nothing), keeping the toast purely as arbiter-origin telemetry/fallback. Preserve kind + ttl
      // (seconds; the toast layer treats sub-60 values as seconds).
      this._passThrough = true;
      this.bus.emit('toast', {
        text: surfaced.text,
        kind: surfaced.kind,
        ttl: surfaced.ttlMs / 1000,
        _fromVoice: true,
      });
      this._passThrough = false;
    }
  },
};
