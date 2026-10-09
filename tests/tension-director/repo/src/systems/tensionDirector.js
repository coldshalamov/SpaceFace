/** SpaceFace adapter. Owns state.tensionDirector ONLY; consumes facts, publishes
 * intent, and exposes an explicit save/debug port. Each factory instance is isolated.
 */
import { TensionDirector, TENSION_STATE_SCHEMA } from '../ai/tensionDirector.js';

export const TENSION_SENSOR_LIMITS = Object.freeze({ live: 16, idsPerLive: 16, pending: 64, combatRange: 2200 });
export const TENSION_EVENTS = Object.freeze({
  policy: 'tension:policy', phase: 'tension:phaseChanged', decision: 'tension:decision',
  chapter: 'tension:chapterChanged', starved: 'tension:starved', reset: 'tension:reset',
  restore: 'tension:restored',
});
const nonnegative = (v, fallback = 0) => Number.isFinite(v) ? Math.max(0, v) : fallback;
const ratio = (current, max) => Math.max(0, Math.min(1, nonnegative(current, max) / Math.max(1, max)));
const timeOf = (state) => Number.isFinite(state?.simTime) && state.simTime >= 0 ? state.simTime : 0;
const entityOf = (state) => state?.entities?.get?.(state.playerId) || null;
const tokenOf = (v) => typeof v === 'string' || typeof v === 'number' ? String(v).slice(0, 90) : '';

export function tensionSuspensionReason(state, player = entityOf(state)) {
  if (state?.settings?.gameplay?.tensionDirector === false) return 'disabled';
  if (state?.run?.kind === 'survival' && state.run.phase !== 'inactive') return 'survival';
  if (state?.paused === true) return 'paused';
  if (state?.mode && state.mode !== 'flight') return 'not_flight';
  if (state?.player?.flags?.docked || state?.ui?.docked) return 'docked';
  if (state?.onboarding?.active && !state.onboarding.finished) return 'tutorial';
  if (!player || player.alive === false || nonnegative(player.hull, 1) <= 0) return 'no_live_player';
  return null;
}

export function readTensionSensors(state) {
  const player = entityOf(state);
  const suspension = tensionSuspensionReason(state, player);
  const hullMax = Math.max(1, nonnegative(player?.hullMax, nonnegative(player?.hull, 1)));
  const shieldMax = nonnegative(player?.shieldMax, nonnegative(player?.shield));
  let liveCombat = 0, nearbyCombat = 0, pendingCombat = 0, pendingCivilian = 0, scanTruncated = false;
  const live = state?.encounterDirector?.live;
  let liveScanned = 0;
  // Never scan the global entity collection. Only bounded, encounter-owned rosters.
  if (!suspension && live && typeof live === 'object') {
    for (const key in live) {
      if (!Object.hasOwn(live, key)) continue;
      if (liveScanned++ >= TENSION_SENSOR_LIMITS.live) { scanTruncated = true; break; }
      const row = live[key];
      if (!row || row.phase === 'done' || row.deck !== 'combat') continue;
      if (row.sectorId && state?.world?.currentSectorId && row.sectorId !== state.world.currentSectorId) continue;
      liveCombat++;
      let near = Number.isFinite(row.lastPlayerExchangeAt)
        && timeOf(state) >= row.lastPlayerExchangeAt && timeOf(state) - row.lastPlayerExchangeAt <= 12;
      const ids = Array.isArray(row.ids) ? row.ids : [];
      if (ids.length > TENSION_SENSOR_LIMITS.idsPerLive) scanTruncated = true;
      for (let i = 0; !near && i < Math.min(ids.length, TENSION_SENSOR_LIMITS.idsPerLive); i++) {
        const e = state.entities.get(ids[i]);
        if (!e || e.alive === false || !e.pos || !player?.pos) continue;
        const dx = e.pos.x - player.pos.x, dz = e.pos.z - player.pos.z;
        // y is presentation-only. A distant scripted enemy does not masquerade as a fight.
        if (Number.isFinite(dx) && Number.isFinite(dz)
          && dx * dx + dz * dz <= TENSION_SENSOR_LIMITS.combatRange ** 2) near = true;
      }
      if (near) nearbyCombat++;
    }
    const pending = Array.isArray(state.encounterDirector.pending) ? state.encounterDirector.pending : [];
    if (pending.length > TENSION_SENSOR_LIMITS.pending) scanTruncated = true;
    for (let i = 0; i < Math.min(pending.length, TENSION_SENSOR_LIMITS.pending); i++) {
      const deck = pending[i]?.deck;
      if (deck === 'combat') pendingCombat++;
      else if (deck === 'civilian') pendingCivilian++;
    }
  }
  return {
    eligible: !suspension, suspension,
    hull: ratio(player?.hull, hullMax), shield: shieldMax > 0 ? ratio(player?.shield, shieldMax) : 1,
    liveCombat, nearbyCombat, pendingCombat, pendingCivilian, scanTruncated,
    profile: state?.settings?.gameplay?.difficulty || 'standard',
    recoveryStance: state?.difficulty?.pacing?.stance === 'recovery',
  };
}

/** Damage uses the maximum protection pool, not the remaining pool. Losing hull
 * therefore cannot artificially amplify the next identical damage sample.
 */
export function normalizePlayerDamage(state, payload) {
  if (!payload || state?.playerId == null) return null;
  const player = entityOf(state);
  if (!player) return null;
  // applied=0 is authoritative; do NOT fall back to requested damage after invulnerability.
  const amount = payload.applied !== undefined ? payload.applied : payload.amount;
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const targetId = payload.targetId;
  if (targetId === state.playerId || (targetId == null && payload.isPlayer === true)) {
    const cap = Math.max(1,
      nonnegative(player.hullMax, nonnegative(player.hull, 1))
      + nonnegative(player.shieldMax, nonnegative(player.shield))
      + nonnegative(player.armorMax, nonnegative(player.armorHp)));
    return { kind: 'incoming', amount: Math.min(4, amount / cap) };
  }
  if ((payload.attackerId ?? payload.ownerId) === state.playerId) return { kind: 'combat' };
  return null;
}

export function createTensionDirectorSystem({ emitDecisions = true } = {}) {
  return {
    name: 'tensionDirector',
    init(ctx) {
      if (!ctx?.state || !ctx?.bus?.on || !ctx.bus.emit) throw new TypeError('tensionDirector requires state and event bus');
      if (this._unsubs) this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this._helpers = ctx.helpers || null;
      this._restoring = false;
      this._outgoingState = null;
      this._unsubs = [];
      let restoreError = null;
      try {
        this._engine = new TensionDirector({ now: timeOf(this.state), snapshot: this.state.tensionDirector || null });
      } catch (error) {
        this._engine = new TensionDirector({ now: timeOf(this.state) });
        restoreError = error.message;
      }
      if (this._engine.state.lastUpdateAt > timeOf(this.state)) {
        this._engine = new TensionDirector({ now: timeOf(this.state) });
        restoreError = 'snapshot_clock_ahead';
      }
      this.state.tensionDirector = this._engine.state;
      this._port = Object.freeze({
        inspect: (options) => this._engine.inspect(options),
        serialize: () => this._engine.snapshot(),
        restore: (snapshot) => this.restore(snapshot),
        reset: () => this.newGame(),
        // For confirmed trade/mission/physical interactions without a public bus receipt.
        // The owner calls this ONLY after its ordinary transaction actually succeeds.
        observe: (fact) => this._observe(fact, true),
      });
      if (this._helpers) this._helpers.tensionDirector = this._port;
      const on = (name, handler) => this._unsubs.push(this.bus.on(name, handler));
      on('combat:damage', (p) => this._observe(normalizePlayerDamage(this.state, p)));
      on('entity:killed', (p) => {
        if (!p) return;
        const id = p.id ?? p.entityId;
        if (id === this.state.playerId) this._observe({ kind: 'defeat', token: `death:${this.state.tick ?? timeOf(this.state)}` }, true);
        else if ((p.killerId ?? p.ownerId) === this.state.playerId) this._observe({ kind: 'kill', token: tokenOf(id) });
      });
      on('mining:yield', (p) => {
        if (p?.minerId === this.state.playerId && nonnegative(p.qty, 1) > 0) this._observe({ kind: 'mining' });
      });
      on('tether:attached', (p) => {
        if (p?.ownerId === this.state.playerId) this._observe({ kind: 'tether' });
      });
      on('pickup:collected', (p) => {
        // Unknown ownership is not evidence of player salvage. The helper port covers
        // old producers with no collector ID; do not count ambient NPC pickups as progress.
        if ((p?.collectorId ?? p?.playerId) === this.state.playerId) {
          this._observe({ kind: 'salvage', token: tokenOf(p.pickupId ?? p.id) });
        }
      });
      on('sector:enter', (p) => {
        const sector = tokenOf(p?.sectorId);
        if (sector && (!this.state.world?.currentSectorId || sector === this.state.world.currentSectorId)) {
          this._observe({ kind: 'exploration', token: `sector:${sector}` });
        }
      });
      on('poi:discovered', (p) => {
        if (p?.playerId != null && p.playerId !== this.state.playerId) return;
        if (p?.sectorId && this.state.world?.currentSectorId && p.sectorId !== this.state.world.currentSectorId) return;
        const id = tokenOf(p?.poiId ?? p?.id);
        if (id) this._observe({ kind: 'exploration', token: `poi:${id}` });
      });
      on('encounter:telegraph', (p) => {
        if (!this._inSector(p)) return;
        this._observe({ kind: 'offered', token: tokenOf(p?.encounterId), shape: p?.kind });
      });
      on('encounter:spawned', (p) => {
        if (!this._inSector(p) || !Number.isFinite(p?.count) || p.count <= 0) return;
        this._observe({ kind: 'delivered', token: tokenOf(p.encounterId), shape: p.kind });
      });
      on('encounter:resolved', (p) => {
        if (!this._inSector(p)) return;
        this._observe({ kind: 'resolved', token: tokenOf(p?.encounterId), combat: p?.deck === 'combat' });
      });
      on('game:new', () => this.newGame());
      on('save:restoring', () => {
        this._restoring = true;
        this._outgoingState = this.state.tensionDirector;
        this._engine.state.policy = null; // disable old policy throughout a transport boundary
      });
      on('save:error', () => { this._restoring = false; this._outgoingState = null; });
      on('save:loaded', (p) => {
        // Without save integration, reset honestly. Never carry the outgoing world's
        // model into a different save merely because its schema looks valid.
        const incoming = p?.tensionDirector
          || (this.state.tensionDirector !== this._outgoingState ? this.state.tensionDirector : null);
        this._restoring = false;
        this._outgoingState = null;
        if (incoming?.schema === TENSION_STATE_SCHEMA) {
          try { this.restore(incoming); return; } catch { /* explicit non-exact reset below */ }
        }
        this._reset('load_without_compatible_snapshot');
      });
      if (restoreError) this.bus.emit(TENSION_EVENTS.reset, { reason: 'invalid_initial_snapshot', detail: restoreError });
    },

    _inSector(payload) {
      return !!payload && (!payload.sectorId || !this.state.world?.currentSectorId
        || payload.sectorId === this.state.world.currentSectorId);
    },

    _observe(fact, allowDocked = false) {
      if (!fact || !this._engine || this._restoring) return false;
      const reason = tensionSuspensionReason(this.state);
      const docksideFact = allowDocked && ['trade', 'mission', 'defeat'].includes(fact.kind);
      const allowedBoundary = reason === 'docked' || reason === 'not_flight'
        || (reason === 'no_live_player' && fact.kind === 'defeat');
      if (reason && !(docksideFact && allowedBoundary)) return false;
      // A successful optional transaction must not let callers inject NaN or arbitrary history.
      return this._engine.observe(timeOf(this.state), fact);
    },

    update(_dt, state = this.state) {
      if (!this._engine || this._restoring) return;
      if (state !== this.state) throw new Error('tensionDirector instance cannot update a different GameState');
      const now = timeOf(state);
      if (now < this._engine.state.lastUpdateAt) this._reset('clock_rewind_without_snapshot');
      // O(1) every fixed tick; the bounded roster scan/histogram only run at 1 Hz.
      const reason = tensionSuspensionReason(state);
      if (reason) {
        this._engine.advance(now, { eligible: false, suspension: reason });
        return;
      }
      if (this._engine.state.suspension === null
        && now - this._engine.state.lastDecisionAt < 1 - 1e-8) {
        this._engine.state.lastUpdateAt = now;
        return;
      }
      const result = this._engine.advance(now, readTensionSensors(state));
      if (!result) return;
      // Detached receipts: bus subscribers cannot edit the policy subsequently read by spawns.
      this.bus.emit(TENSION_EVENTS.policy, Object.freeze({ ...result.policy, recentShapes: Object.freeze(result.policy.recentShapes.slice()) }));
      if (result.phaseChange) this.bus.emit(TENSION_EVENTS.phase, Object.freeze({ ...result.phaseChange }));
      if (result.chapterChange) this.bus.emit(TENSION_EVENTS.chapter, Object.freeze({ ...result.chapterChange, simTime: now }));
      if (result.starvation) this.bus.emit(TENSION_EVENTS.starved, Object.freeze({ ...result.starvation }));
      if (emitDecisions && result.diagnostic) this.bus.emit(TENSION_EVENTS.decision, Object.freeze({ ...result.diagnostic }));
    },

    restore(snapshot) {
      const restored = new TensionDirector({ now: timeOf(this.state), snapshot });
      if (restored.state.lastUpdateAt > timeOf(this.state)) throw new RangeError('restore simulation clock before the tension snapshot');
      this._engine = restored;
      this.state.tensionDirector = restored.state;
      this.bus.emit(TENSION_EVENTS.restore, { exact: true, simTime: timeOf(this.state), sequence: restored.state.sequence });
    },

    _reset(reason) {
      this._engine = new TensionDirector({ now: timeOf(this.state) });
      this.state.tensionDirector = this._engine.state;
      this.bus.emit(TENSION_EVENTS.reset, { reason, simTime: timeOf(this.state) });
    },

    newGame() {
      if (!this.state) return;
      this._restoring = false;
      this._outgoingState = null;
      this._reset('new_game');
    },

    destroy() {
      for (const unsub of this._unsubs || []) if (typeof unsub === 'function') unsub();
      this._unsubs = null;
      if (this._helpers?.tensionDirector === this._port) delete this._helpers.tensionDirector;
      if (this._engine) this._engine.state.policy = null;
      this._engine = null;
      this._port = null;
      this._helpers = null;
      this.bus = null;
      this.state = null;
    },
  };
}

export const tensionDirector = createTensionDirectorSystem();
