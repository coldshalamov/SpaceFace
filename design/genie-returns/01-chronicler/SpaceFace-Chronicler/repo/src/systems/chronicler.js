/**
 * The Chronicler — the simulation's evidence-backed memory, not a second gameplay authority.
 * Owns ONLY state.chronicler. Public events are offers/facts, never reputation/bounty commands.
 * Registry contract: init(ctx), update(dt, state), newGame(), serialize(), deserialize(), destroy().
 */
import { FACT_EVENTS, configFor, freshMemory, clone, finite, increment } from '../chronicler/schema.js';
import { normalizeFact } from '../chronicler/normalize.js';
import { ingestBatch, resolveLineage, pruneMemory } from '../chronicler/ledger.js';
import { buildStoryView, semanticSignature, rankViews, recallText } from '../chronicler/narrative.js';
import { restoreMemory } from '../chronicler/persistence.js';

function priority(f) {
  if (['recovered', 'sold', 'law', 'remedy'].includes(f.stage)) return 100;
  if (['ace', 'rescue', 'wanted'].includes(f.stage)) return 80;
  if (['aftermath', 'binding', 'salvage'].includes(f.stage)) return 70;
  if (f.stage === 'kill') return f.actor.player ? 65 : 20;
  return 40;
}
function due(at, now, cooldown) { return at === null || now - at >= cooldown; }
function storyPacket(view) {
  return { ...clone(view), source: 'chronicler', sourceRef: `${view.id}:r${view.revision}` };
}
function publication(view, text) {
  const sourceRef = `${view.id}:r${view.revision}`;
  return {
    id: sourceRef, eventId: sourceRef, source: 'chronicler', sourceRef,
    storyId: view.id, revision: view.revision, kind: `chronicler-${view.kind}`,
    text, headline: view.title, sectorId: view.sectorId,
    stationId: view.stationIds[view.stationIds.length - 1] || null,
    factionId: view.factionIds[0] || null,
    complete: view.complete,
    // Compact, self-contained citations survive ticker retention independently of archive eviction.
    evidence: view.evidence.filter(f => view.proof.length ? view.proof.includes(f.id) : true)
      .slice(0, 8).map(f => ({ factId: f.id, event: f.sourceEvent, receiptId: f.sourceReceiptId, t: f.t })),
  };
}

export function createChronicler(options = {}) {
  const defaults = configFor(options);
  const shouldObserve = typeof options.shouldObserve === 'function' ? options.shouldObserve : () => true;
  return {
    name: 'chronicler',
    init(ctx) {
      if (!ctx?.state || !ctx.bus || typeof ctx.bus.on !== 'function' || typeof ctx.bus.emit !== 'function') {
        throw new TypeError('Chronicler.init requires { state, bus }');
      }
      this.destroy();
      this._state = ctx.state; this._bus = ctx.bus;
      this._subs = []; this._restoring = false; this._updating = false; this._clockBlocked = false;
      this._adopt(restoreMemory(ctx.state.chronicler, defaults, ctx.state.simTime));
      for (const event of FACT_EVENTS) this._listen(event, p => this.capture(event, p));
      this._listen('game:new', () => this.newGame());
      this._listen('game:newGame', () => this.newGame());
      this._listen('save:restoring', () => { this._restoring = true; });
      this._listen('save:error', () => { this._restoring = false; });
      this._listen('save:loaded', () => {
        // Some save owners replace a whole field, others call deserialize first. Support both.
        if (this._state.chronicler !== this._memory) this.deserialize(this._state.chronicler);
        this._restoring = false; this._clockBlocked = false;
      });
      this._listen('game:started', () => {
        // This fires on Continue too. NEVER erase an archive merely because a game started.
        if (this._state.chronicler !== this._memory) this.deserialize(this._state.chronicler);
      });
      this._listen('dock:docked', p => this.requestRecall({
        context: 'dock', stationId: p?.stationId,
        sectorId: p?.sectorId || this._state.world?.currentSectorId,
      }));
      this._listen('sector:enter', p => this.requestRecall({
        context: 'sector', sectorId: p?.sectorId || p?.id || this._state.world?.currentSectorId,
      }));
      return this;
    },
    _listen(event, fn) {
      const off = this._bus.on(event, fn);
      this._subs.push(typeof off === 'function' ? off : () => this._bus?.off?.(event, fn));
    },
    _adopt(memory) {
      // Derive the graph and every read model before touching live state. Even a structurally
      // malformed narrative fact must not partially replace a healthy archive at a load boundary.
      resolveLineage(memory);
      const views = new Map(memory.stories.map(story => [story.id, buildStoryView(story)]));
      this._memory = memory;
      this._state.chronicler = memory;
      this._seen = new Set(memory.seen);
      this._retainedKeys = new Set([...memory.pending, ...memory.stories.flatMap(s => s.nodes)].map(f => f.dedupe));
      this._nextWake = 0;
      this._views = views;
    },
    _enabled() { return !!this._memory && !this._restoring && shouldObserve(this._state) !== false; },

    /** Public producer/harness entry point; ordinary integration uses the bus subscriptions. */
    capture(event, payload) {
      if (!this._enabled()) return null;
      const m = this._memory;
      if (finite(this._state.simTime) + 1e-9 < m.clock) { this._clockBlocked = true; return null; }
      increment(m.metrics, 'observed');
      const f = normalizeFact(event, payload, this._state);
      if (!f) { increment(m.metrics, 'ignored'); return null; }
      if (f.invalid) { increment(m.metrics, 'invalid'); return null; }
      if (this._seen.has(f.dedupe) || this._retainedKeys.has(f.dedupe)) { increment(m.metrics, 'duplicates'); return null; }
      if (m.pending.length >= m.config.maxPending) {
        let weakest = 0;
        for (let i = 1; i < m.pending.length; i++) {
          if (priority(m.pending[i]) < priority(m.pending[weakest])) weakest = i;
        }
        increment(m.metrics, 'queueDropped');
        if (priority(f) <= priority(m.pending[weakest])) return null;
        const [dropped] = m.pending.splice(weakest, 1);
        this._seen.delete(dropped.dedupe); this._retainedKeys.delete(dropped.dedupe);
        m.seen = m.seen.filter(k => k !== dropped.dedupe);
      }
      if (!Number.isSafeInteger(m.nextFact + 1)) throw new RangeError('Chronicler receipt sequence exhausted');
      f.seq = m.nextFact++; f.id = `ch:f:${f.seq}`;
      this._seen.add(f.dedupe); this._retainedKeys.add(f.dedupe); m.seen.push(f.dedupe);
      while (m.seen.length > m.config.maxSeen) this._seen.delete(m.seen.shift());
      m.pending.push(f);
      return f.id;
    },

    update(_dt, state = this._state) {
      if (!this._memory || this._updating || this._restoring) return 0;
      if (state !== this._state) {
        this._state = state;
        this._adopt(restoreMemory(state.chronicler, defaults, state.simTime));
      } else if (state.chronicler !== this._memory) this.deserialize(state.chronicler);
      if (!this._enabled()) return 0;
      const now = Math.max(0, finite(state.simTime));
      if (now + 1e-9 < this._memory.clock) {
        // A host rewind needs deserialize/newGame. Silently retiming old evidence would lie.
        this._clockBlocked = true;
        return 0;
      }
      this._clockBlocked = false; this._updating = true;
      try {
        const m = this._memory;
        m.clock = now;
        const batch = m.pending.splice(0, m.config.factsPerUpdate);
        if (batch.length) {
          ingestBatch(m, batch);
          this._refreshViews(true);
          pruneMemory(m, this._views, now);
          const retained = new Set(m.stories.map(s => s.id));
          for (const key of this._views.keys()) if (!retained.has(key)) this._views.delete(key);
          this._refreshLinkGauges();
          this._retainedKeys = new Set([...m.pending, ...m.stories.flatMap(s => s.nodes)].map(f => f.dedupe));
          this._nextWake = now;
        }
        // Do not publish an intermediate proof while its later packets are still in the inbox.
        if (m.pending.length === 0 && now >= this._nextWake) {
          this._publish(now);
          if (this._memory === m) this._scheduleWake(now);
        }
        return batch.length;
      } finally { this._updating = false; }
    },
    _refreshLinkGauges() {
      const m = this._memory;
      const statuses = m.stories.flatMap(s => s.nodes.map(f => f.parentStatus));
      m.metrics.unresolvedLinks = statuses.filter(s => s === 'pending' || s === 'capacity').length;
      m.metrics.ambiguousLinks = statuses.filter(s => s === 'ambiguous').length;
      m.metrics.invalidLinks = statuses.filter(s => ['commodity_mismatch', 'custody_mismatch', 'overdrawn_proof'].includes(s)).length;
    },
    _refreshViews(revise) {
      for (const story of this._memory.stories) {
        const view = buildStoryView(story);
        const signature = semanticSignature(view);
        if (revise && signature !== story.signature) {
          story.revision++;
          story.signature = signature;
        }
        view.revision = story.revision;
        this._views.set(story.id, view);
      }
    },
    _emit(event, payload) { this._bus?.emit(event, clone(payload)); },
    _publish(now) {
      const m = this._memory;
      const ranked = rankViews([...this._views.values()], { minScore: m.config.minNewsScore }, now);
      let announcements = 0;
      for (const view of ranked) {
        const story = m.stories.find(s => s.id === view.id);
        if (now - story.updatedAt < m.config.settleSeconds || story.announcedRevision >= story.revision) continue;
        story.announcedRevision = story.revision; // reserve before synchronous callbacks/re-entry
        increment(m.metrics, 'storiesPublished');
        this._emit('chronicler:story', storyPacket(view));
        if (this._memory !== m || !this._bus) return;
        if (++announcements >= 4) break;
      }
      let legends = 0;
      for (const legend of m.legends) {
        if (legend.announced || legend.visibility !== 'public') continue;
        legend.announced = true;
        this._emit('chronicler:legend', legend);
        if (this._memory !== m || !this._bus) return;
        if (++legends >= 2) break;
      }
      if (m.config.publishNews && due(m.cadence.newsAt, now, m.config.newsCooldown)) {
        const view = ranked.find(v => {
          const s = m.stories.find(s => s.id === v.id);
          return now - s.updatedAt >= m.config.settleSeconds && s.newsRevision < s.revision
            && due(s.newsAt, now, m.config.storyCooldown);
        });
        if (view) {
          const story = m.stories.find(s => s.id === view.id);
          story.newsRevision = story.revision; story.newsAt = now; m.cadence.newsAt = now;
          increment(m.metrics, 'newsPublished');
          this._emit('news:publish', publication(view, view.summary));
          if (this._memory !== m || !this._bus) return;
        }
      }
      if (m.config.offerRadio && due(m.cadence.radioAt, now, m.config.radioCooldown)) {
        const view = ranked.find(v => {
          const s = m.stories.find(s => s.id === v.id);
          return now - s.updatedAt >= m.config.recallMinAge && s.radioRevision < s.revision;
        });
        if (view) {
          m.stories.find(s => s.id === view.id).radioRevision = view.revision;
          m.cadence.radioAt = now;
          increment(m.metrics, 'radioOffered');
          this._emit('chronicler:radio', { ...publication(view, recallText(view, now)), channel: 'band' });
        }
      }
    },

    _scheduleWake(now) {
      const m = this._memory;
      let next = Infinity;
      for (const v of this._views.values()) {
        if (v.visibility !== 'public' || v.score < m.config.minNewsScore) continue;
        const s = m.stories.find(s => s.id === v.id);
        const settled = s.updatedAt + m.config.settleSeconds;
        if (s.announcedRevision < s.revision) next = Math.min(next, settled);
        if (m.config.publishNews && s.newsRevision < s.revision) {
          next = Math.min(next, Math.max(settled,
            s.newsAt === null ? 0 : s.newsAt + m.config.storyCooldown,
            m.cadence.newsAt === null ? 0 : m.cadence.newsAt + m.config.newsCooldown));
        }
        if (m.config.offerRadio && s.radioRevision < s.revision) {
          next = Math.min(next, Math.max(s.updatedAt + m.config.recallMinAge,
            m.cadence.radioAt === null ? 0 : m.cadence.radioAt + m.config.radioCooldown));
        }
      }
      if (m.legends.some(l => !l.announced && l.visibility === 'public')) next = now;
      // Only quotas can leave already-due work. Retry at the next fixed tick, not recursively.
      this._nextWake = next <= now ? now + 1 / 60 : next;
    },

    /** Read-only snapshots. A UI/query never advances the simulation or consumes a headline. */
    query(context = {}) {
      if (!this._memory) return [];
      const now = Math.max(0, finite(this._state.simTime));
      const limit = Math.max(0, Math.min(256, Math.floor(finite(context.limit, 12))));
      return clone(rankViews([...this._views.values()], context, now).slice(0, limit));
    },
    getStory(storyId, { includePrivate = false } = {}) {
      const view = this._views?.get(storyId);
      return view && (includePrivate || view.visibility === 'public') ? clone(view) : null;
    },
    getLegends({ includePrivate = false } = {}) {
      return this._memory ? clone(this._memory.legends.filter(l => includePrivate || l.visibility === 'public')) : [];
    },
    recall(context = {}) {
      if (!this._memory) return null;
      const m = this._memory;
      const filter = { ...context, includePrivate: false, minScore: m.config.minNewsScore,
        minAgeSeconds: m.config.recallMinAge, limit: 256 };
      let candidates = this.query(filter);
      if (!candidates.length && context.stationId && context.sectorId) {
        delete filter.stationId;
        candidates = this.query(filter);
      }
      const key = JSON.stringify([context.context || 'recall', context.stationId || null,
        context.sectorId || null, context.actorKey || null, context.factionId || null]);
      const view = candidates.find(v => !m.recallKeys.includes(`${key}:${v.id}:r${v.revision}`));
      if (!view) return null;
      return { ...publication(view, recallText(view, finite(this._state.simTime))),
        context: context.context || 'recall', recallKey: `${key}:${view.id}:r${view.revision}` };
    },
    requestRecall(context = {}) {
      if (!this._enabled()) return null;
      const m = this._memory;
      const now = Math.max(0, finite(this._state.simTime));
      if (now < m.clock || !due(m.cadence.recallAt, now, m.config.recallCooldown)) return null;
      const offer = this.recall(context);
      if (!offer) return null;
      m.cadence.recallAt = now;
      m.recallKeys.push(offer.recallKey);
      if (m.recallKeys.length > 128) m.recallKeys.shift();
      increment(m.metrics, 'recallsOffered');
      this._emit('chronicler:recall', offer);
      return clone(offer);
    },
    diagnostics() {
      if (!this._memory) return { initialized: false };
      const m = this._memory;
      return { initialized: true, restoring: this._restoring, clockBlocked: this._clockBlocked,
        stories: m.stories.length, facts: m.stories.reduce((n, s) => n + s.nodes.length, 0),
        pending: m.pending.length, seen: m.seen.length, profiles: m.profiles.length,
        legends: m.legends.length, config: clone(m.config), ...clone(m.metrics) };
    },
    serialize() { return this._memory ? clone(this._memory) : null; },
    deserialize(data) {
      if (!this._state) throw new Error('Initialize Chronicler before deserialize');
      const candidate = restoreMemory(data, defaults, this._state.simTime);
      this._adopt(candidate); this._clockBlocked = false;
      return true;
    },
    newGame() {
      if (!this._state) return;
      this._adopt(freshMemory(defaults, this._state.simTime));
      this._restoring = false; this._clockBlocked = false;
    },
    destroy() {
      for (const off of this._subs || []) off();
      this._subs = [];
      this._bus = null; this._state = null; this._memory = null;
      this._views = new Map(); this._seen = new Set(); this._retainedKeys = new Set(); this._nextWake = Infinity;
    },
  };
}

export const chronicler = createChronicler();
export default chronicler;
