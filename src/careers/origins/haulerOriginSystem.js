// Isolated Hauler origin system candidate (M3).
// Codex lead wires into registry; this module must stay self-contained.
// Single-writer discipline: emits intents only for credits/cargo/rep/missions.

import { drawSeeded, hash32 } from '../../core/rng.js';
import { HAULER_ORIGIN_OFFER_COPY, HAULER_CAREER_ID } from './haulerOriginData.js';
import {
  acceptOrigin,
  allowsOtherCareers,
  declineOrigin,
  evaluateStepSignal,
  getHaulerOriginPublicView,
  onFirstDock,
  recordMarketLeg,
  tickHaulerOrigin,
} from './haulerOriginChain.js';
import {
  createHaulerOriginState,
  ensureHaulerOriginState,
  serializeHaulerOriginState,
  applyHaulerOriginSaveBlob,
} from './haulerOriginSchema.js';

function simTimeOf(state) {
  return Number(state && state.simTime) || 0;
}

function seedOf(state) {
  return (state && state.meta && state.meta.seed) || 1;
}

function emitAll(bus, intents) {
  if (!bus || !Array.isArray(intents)) return;
  for (const intent of intents) {
    if (!intent || !intent.event) continue;
    bus.emit(intent.event, intent.payload);
  }
}

/**
 * Create a system-shaped candidate. Not auto-registered.
 * Usage after integration:
 *   registry.register(createHaulerOriginSystem())
 */
export function createHaulerOriginSystem() {
  const system = {
    name: 'haulerOrigin',
    careerId: HAULER_CAREER_ID,

    init(ctx) {
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      const own = ensureHaulerOriginState(this.state);
      if (own && !own.rngSeed) {
        own.rngSeed = hash32(seedOf(this.state), 'haulerOrigin') >>> 0;
      }

      const bus = this.bus;
      if (!bus) return;

      bus.on('dock:docked', (p) => this._onDocked(p && p.stationId));
      bus.on('game:started', () => this.newGame());
      bus.on('game:new', () => this.newGame());
      bus.on('save:loaded', () => {
        ensureHaulerOriginState(this.state);
      });

      // Mission authority feedback.
      bus.on('mission:completed', (p) => this._onMissionCompleted(p));
      bus.on('mission:failed', (p) => this._onMissionFailed(p));
      bus.on('mission:abandoned', (p) => this._onMissionFailed({ ...p, reason: 'abandoned' }));

      // Player origin UI intents (station hub / onboarding seam).
      bus.on('career:hauler:accept', () => this.accept());
      bus.on('career:hauler:decline', () => this.decline());
      bus.on('career:origin:accept', (p) => {
        if (p && p.careerId && p.careerId !== HAULER_CAREER_ID) return;
        if (!p || !p.careerId || p.careerId === HAULER_CAREER_ID) this.accept();
      });
      bus.on('career:origin:decline', (p) => {
        if (p && p.careerId && p.careerId !== HAULER_CAREER_ID) return;
        if (!p || !p.careerId || p.careerId === HAULER_CAREER_ID) this.decline();
      });

      // Economy trade receipts (prefer detailed afterTrade-style if present).
      bus.on('economy:trade', (p) => this._onTrade(p));
      bus.on('ui:buy', (p) => this._onTrade({ ...p, side: 'buy' }));
      bus.on('ui:sell', (p) => this._onTrade({ ...p, side: 'sell' }));

      // Manual delivery bridge when missions board is not yet integrated.
      bus.on('career:hauler:delivered', (p) => {
        const result = evaluateStepSignal(this.state, {
          kind: 'manual_delivery',
          stationId: p && p.stationId,
          missionPaid: !!(p && p.missionPaid),
        }, simTimeOf(this.state));
        if (result.ok) emitAll(this.bus, result.intents);
      });

      bus.on('career:hauler:checkSpread', () => {
        const result = evaluateStepSignal(this.state, { kind: 'market_spread' }, simTimeOf(this.state));
        if (result.ok) emitAll(this.bus, result.intents);
      });
    },

    newGame() {
      if (!this.state) return;
      if (!this.state.careers || typeof this.state.careers !== 'object') this.state.careers = {};
      if (!this.state.careers.origins || typeof this.state.careers.origins !== 'object') {
        this.state.careers.origins = {};
      }
      this.state.careers.origins.hauler = createHaulerOriginState();
      const own = ensureHaulerOriginState(this.state);
      own.rngSeed = hash32(seedOf(this.state), 'haulerOrigin') >>> 0;
    },

    update(_dt, state) {
      const st = state || this.state;
      if (!st) return;
      const result = tickHaulerOrigin(st, simTimeOf(st));
      if (result && result.ok && result.kind === 'step_failed') {
        emitAll(this.bus, result.intents);
      }
    },

    /** @returns {object|null} public view for UI integration */
    getView() {
      return getHaulerOriginPublicView(this.state);
    },

    allowsOtherCareers() {
      return allowsOtherCareers(this.state);
    },

    serialize() {
      return serializeHaulerOriginState(this.state);
    },

    applySave(blob) {
      return applyHaulerOriginSaveBlob(this.state, blob);
    },

    accept() {
      const result = acceptOrigin(this.state, simTimeOf(this.state));
      if (result.ok) emitAll(this.bus, result.intents);
      return result;
    },

    decline() {
      const result = declineOrigin(this.state, simTimeOf(this.state));
      if (result.ok) {
        this.bus && this.bus.emit('toast', {
          text: HAULER_ORIGIN_OFFER_COPY.toastDecline,
          kind: 'info',
          ttl: 3,
        });
        this.bus && this.bus.emit('career:origin:declined', {
          careerId: HAULER_CAREER_ID,
          nonBinding: true,
        });
      }
      return result;
    },

    _onDocked(stationId) {
      try {
        const own = ensureHaulerOriginState(this.state);
        // Draw once so rng seed advances deterministically if future variety is added.
        if (own) drawSeeded(own, 'rngSeed', hash32(seedOf(this.state), 'haulerOrigin'));

        const result = onFirstDock(this.state, stationId, simTimeOf(this.state));
        if (!result.ok || !result.offer) return;
        if (result.reason === 'already_offered') return;

        this.bus.emit('career:origin:offered', result.offer);
        this.bus.emit('toast', {
          text: HAULER_ORIGIN_OFFER_COPY.toastOffer,
          kind: 'info',
          ttl: 4,
        });
      } catch (err) {
        console.error('[haulerOrigin] dock:docked', err);
      }
    },

    _onMissionCompleted(p) {
      const own = ensureHaulerOriginState(this.state);
      if (!own || own.status !== 'active' || !own.activeContract) return;
      const missionId = p && (p.missionId || p.id);
      if (missionId && missionId !== own.activeContract.missionId) return;
      // If storyTag present, require origin tag match when provided.
      if (p && p.storyTag && own.activeContract.stepId &&
          !String(p.storyTag).includes(own.activeContract.stepId)) {
        // soft: still accept id match
      }
      const result = evaluateStepSignal(this.state, {
        kind: 'mission_completed',
        missionId,
        missionPaid: true, // missions.js already settled reward + collateral
      }, simTimeOf(this.state));
      if (result.ok) emitAll(this.bus, result.intents);
    },

    _onMissionFailed(p) {
      const own = ensureHaulerOriginState(this.state);
      if (!own || own.status !== 'active' || !own.activeContract) return;
      const missionId = p && (p.missionId || p.id);
      if (missionId && missionId !== own.activeContract.missionId) return;
      const result = evaluateStepSignal(this.state, {
        kind: 'mission_failed',
        reason: (p && p.reason) || 'mission_failed',
        missionId,
      }, simTimeOf(this.state));
      if (result.ok) emitAll(this.bus, result.intents);
    },

    _onTrade(p) {
      if (!p) return;
      const own = ensureHaulerOriginState(this.state);
      if (!own || own.status !== 'active' || !own.activeContract) return;
      if (own.activeContract.stepId !== 'market_spread') return;
      const side = p.side === 'sell' ? 'sell' : (p.side === 'buy' ? 'buy' : null);
      if (!side) return;
      const commodityId = p.commodityId || p.good;
      if (commodityId && commodityId !== own.activeContract.commodityId) return;

      const stationId = p.stationId
        || (this.state.ui && this.state.ui.dockedStationId)
        || (this.state.player && this.state.player.dockedStationId)
        || null;

      recordMarketLeg(this.state, side, {
        stationId,
        commodityId: commodityId || own.activeContract.commodityId,
        qty: p.qty || p.amount || 0,
        unitPrice: p.unitPrice || p.unitAvg || p.price || 0,
        total: p.total || p.realCost || p.realGross || 0,
        source: 'economy_trade',
      }, simTimeOf(this.state));

      // Auto-check spread when both legs present.
      if (own.marketLegs.buy && own.marketLegs.sell) {
        const result = evaluateStepSignal(this.state, { kind: 'market_spread' }, simTimeOf(this.state));
        if (result.ok) emitAll(this.bus, result.intents);
      }
    },
  };

  return system;
}

/** Default singleton export for registry-style integration. */
export const haulerOriginSystem = createHaulerOriginSystem();

export default haulerOriginSystem;
