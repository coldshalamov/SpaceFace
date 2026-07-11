// Voice Arbiter (GDD pillar 3 — "one voice at a time").
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
//   • During active onboarding, a held tutorial line cannot be preempted by non-danger story/flavor
//     (taste law: danger > tutorial > objective > comms > flavor). Load-bearing story after
//     onboarding is unchanged (story stays at 100; protection is policy-gated).
//
// The pure queue (VoiceQueue) is DOM-free and deterministic (tie-break = insertion order) so it can
// be unit-tested headless. The system wrapper wires it to the bus + a sim clock and is additive: it
// optionally intercepts the legacy "toast" event so old emitters still route through the arbiter,
// WITHOUT double-surfacing (a flag marks arbiter-originated toasts as pass-through).

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

/** Onboarding is actively teaching (not finished). Used by the system wrapper for policy. */
export function isOnboardingTeaching(state) {
  const ob = state && state.onboarding;
  return !!(ob && ob.active && !ob.finished);
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
  enqueue({ channel = 'info', text = '', kind, priority, ttl, id } = {}, now = 0) {
    if (!text) return null;
    const ttlMs = normalizeTtlMs(ttl);
    const entry = {
      id: id != null ? String(id) : null,
      channel,
      text,
      kind: kind || channel || 'info',              // fall back to channel name as toast kind
      priority: priorityFor(channel, priority),
      ttlMs,
      enqueuedAt: now,
      expireAt: now + ttlMs,                         // stale-drop deadline while queued
      seq: this._seq++,
    };
    // Coalesce (same-id replace): update the existing active or queued entry in place (keep its seq
    // so a live readout does not jump the queue by re-inserting). Deterministic: one id → one slot.
    if (entry.id != null) {
      if (this._active && this._active.id === entry.id) {
        entry.seq = this._active.seq;
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
    if (best.channel === 'bark') this._lastBarkAt = now;
    // Re-queue the interrupted floor holder unless same-id coalesce already replaced it, or it is
    // already past its expire window.
    if (prev && prev !== best && now < prev.expireAt) {
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
    this._active = null;
    return this.step(now, policy);
  }

  // Advance the queue at time `now`. Drops stale queued entries, expires the active entry, and (if
  // the floor is free or a higher eligible arrival may interrupt) promotes the best eligible queued
  // entry. Returns the entry that should be surfaced THIS tick (newly took the floor), or null if
  // nothing changed / floor still held.
  //
  // `policy.tutorialProtect` — when true, a held tutorial line yields only to danger (not story/
  // flavor). Set by the system wrapper while onboarding is teaching.
  step(now = 0, policy = {}) {
    // Expire the active floor holder.
    if (this._active && now >= this._active.expireAt) this._active = null;

    // Drop stale queued entries (their ttl elapsed before they ever got the floor).
    if (this._items.length) {
      this._items = this._items.filter((e) => now < e.expireAt);
    }
    if (!this._items.length) return null;

    const active = this._active;
    const barkBlocked = (e) =>
      e.channel === 'bark' && (now - this._lastBarkAt) < this._barkMinGapMs;

    // Best candidate that may take the floor under interrupt policy + bark rate-limit.
    let best = this._pickBest((e) => {
      if (active && !canInterrupt(active, e, policy)) return false;
      if (barkBlocked(e)) return false;
      return true;
    });

    // Bark rate-limit fallback: if the best was bark-blocked (or no bark-ok candidate), try a
    // non-bark alternate that can still interrupt.
    if (!best) {
      // If there are only bark-blocked items that could otherwise interrupt, hold.
      const anyEligibleIgnoringBark = this._pickBest((e) => {
        if (active && !canInterrupt(active, e, policy)) return false;
        return true;
      });
      if (!anyEligibleIgnoringBark) return null;
      // Prefer a non-bark that can interrupt.
      best = this._pickBest((e) => {
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

    const say = (msgOrChannel, text, opts) => {
      const msg = typeof msgOrChannel === 'string'
        ? { channel: msgOrChannel, text, ...(opts || {}) }
        : msgOrChannel;
      if (!msg || !msg.text) return false;
      this.queue.enqueue(msg, this._now());
      return true;
    };
    if (ctx.helpers) {
      ctx.helpers.voice = {
        say,
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
      const policy = this._policy();
      const surfaced = this.queue.dismiss(this._now(), policy);
      this._flushPresentation(surfaced);
    });

    // Optionally intercept legacy "toast" emitters so they route through the arbiter too. We must not
    // double-surface: toasts we ourselves re-emit carry _fromVoice and are ignored here. We cannot
    // cancel the legacy toast (bus has no interception), so instead the arbiter simply ALSO queues a
    // copy — de-duped by identical text within a short window is left to toasts.js grouping. To keep
    // strictly "one voice", legacy emitters SHOULD migrate to voice.say; this hook is a soft bridge
    // that is inert unless enabled to avoid changing golden telemetry.
    // (Left disabled by default: enabling would surface each legacy toast twice unless the emitter is
    // also updated. Kept as an explicit opt-in so 47a golden output is untouched.)
  },

  newGame() {
    this.queue = new VoiceQueue();
    this._lastSurfacedId = null;
    this._activeKey = null;
    this._presentSig = null;
  },

  _now() {
    // Sim clock in ms. state.simTime is seconds (see beacons.js); fall back to 0 headless.
    const t = this.state && this.state.simTime;
    return Number.isFinite(t) ? t * 1000 : 0;
  },

  _policy() {
    return { tutorialProtect: isOnboardingTeaching(this.state) };
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
