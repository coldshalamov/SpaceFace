// Canonical careerLadders authority (CL-00).
// One registered system owns ladder FSM + save. Layered on careerOrigins (non-binding).
// No second mission/story/economy/heat/cargo/rep writer — emits intents only.
// Branch ladders register data definitions via registerLadderDefinition().

import {
  CAREER_LADDER_EVENTS,
  LADDER_STATUS,
  applyLadderSignal,
  createDefinitionRegistry,
  emitIntents,
  emitOn,
  masterSeedOf,
  progressPayload,
  simTimeOf,
  transitionAbandon,
  transitionAccept,
  transitionDecline,
  transitionOffer,
  transitionRecoverStep,
  transitionResolveChoice,
  validateLadderDefinition,
} from './ladderShared.js';
import {
  CAREER_LADDERS_SCHEMA_ID,
  CAREER_LADDERS_SCHEMA_VERSION,
  deserializeCareerLadders,
  ensureCareerLaddersState,
  ensureLadderLeaf,
  getLadderLeaf,
  resetCareerLaddersForNewGame,
  serializeCareerLadders,
} from './ladderSchema.js';

export {
  CAREER_LADDERS_SCHEMA_ID,
  CAREER_LADDERS_SCHEMA_VERSION,
  CAREER_LADDER_EVENTS,
  LADDER_STATUS,
  validateLadderDefinition,
} from './ladderShared.js';

export {
  ensureCareerLaddersState,
  serializeCareerLadders,
  deserializeCareerLadders,
  seedCareerLaddersOnData,
  createEmptyCareerLaddersBlob,
  migrateCareerLaddersBlob,
} from './ladderSchema.js';

/** Process-local definition registry (data-driven; empty until branch packs register). */
const definitions = createDefinitionRegistry();

export function registerLadderDefinition(def) {
  return definitions.register(def);
}

export function getLadderDefinition(careerId) {
  return definitions.get(careerId);
}

export function listLadderDefinitions() {
  return definitions.list();
}

export function clearLadderDefinitions() {
  definitions.clear();
}

function dispatchResult(bus, result) {
  if (!result || !result.ok) return result;
  emitIntents(bus, result.intents);
  if (Array.isArray(result.events)) {
    for (const ev of result.events) {
      if (ev && ev.event) emitOn(bus, ev.event, ev.payload);
    }
  }
  return result;
}

export function getLadderOfferView(state, careerId = null) {
  ensureCareerLaddersState(state);
  const views = definitions.list().map((def) => {
    const own = ensureLadderLeaf(state, def);
    const canAccept = own.status === LADDER_STATUS.OFFERED
      || own.status === LADDER_STATUS.LATENT;
    const canDecline = own.status === LADDER_STATUS.OFFERED;
    return {
      careerId: def.careerId,
      title: def.title,
      status: own.status,
      stepId: own.stepId,
      stepIndex: own.stepIndex,
      canAccept: !!canAccept && own.status !== LADDER_STATUS.COMPLETED
        && own.status !== LADDER_STATUS.ACTIVE
        && own.status !== LADDER_STATUS.ABANDONED,
      canDecline,
      nonBinding: true,
      offerNonce: own.offerNonce,
    };
  });
  if (careerId) return views.find((v) => v.careerId === careerId) || null;
  return { nonBinding: true, offers: views };
}

export function getLadderProgress(state, careerId = null) {
  ensureCareerLaddersState(state);
  const out = {};
  for (const def of definitions.list()) {
    const own = ensureLadderLeaf(state, def);
    out[def.careerId] = progressPayload(own, def, simTimeOf(state));
  }
  // Also expose unregistered saved leaves (Continue parity for orphaned defs).
  const ladders = state.careers && state.careers.ladders;
  if (ladders) {
    for (const key of Object.keys(ladders)) {
      if (key === '__meta' || out[key]) continue;
      const leaf = ladders[key];
      if (leaf && typeof leaf === 'object') {
        out[key] = {
          careerId: leaf.careerId || key,
          status: leaf.status,
          stepId: leaf.stepId,
          stepIndex: leaf.stepIndex,
          nonBinding: true,
          orphan: true,
          simTime: simTimeOf(state),
        };
      }
    }
  }
  return careerId ? (out[careerId] || null) : out;
}

export function createCareerLaddersSystem() {
  return {
    name: 'careerLadders',
    state: null,
    bus: null,
    registry: null,
    _subs: null,

    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus || null;
      this.registry = ctx.registry || null;
      this._subs = [];
      ensureCareerLaddersState(this.state);
      // Hydrate leaves for any already-registered definitions.
      for (const def of definitions.list()) ensureLadderLeaf(this.state, def);

      this._listen(CAREER_LADDER_EVENTS.ACCEPT, (payload) => {
        if (payload && payload.careerId) this.accept(payload.careerId, payload);
      });
      this._listen(CAREER_LADDER_EVENTS.DECLINE, (payload) => {
        if (payload && payload.careerId) this.decline(payload.careerId);
      });
      this._listen(CAREER_LADDER_EVENTS.ABANDON, (payload) => {
        if (payload && payload.careerId) this.abandon(payload.careerId);
      });
      this._listen(CAREER_LADDER_EVENTS.CHOOSE, (payload) => {
        if (payload && payload.careerId && payload.choiceId) {
          this.choose(payload.careerId, payload.choiceId, payload);
        }
      });
    },

    newGame() {
      if (!this.state) return;
      resetCareerLaddersForNewGame(this.state, definitions.list());
    },

    update(_dt, state) {
      if (state) this.state = state;
      if (!this.state) return;
      // Framework tick: auto-open recovery when cooldown elapsed (deterministic, simTime only).
      const t = simTimeOf(this.state);
      for (const def of definitions.list()) {
        const own = getLadderLeaf(this.state, def.careerId);
        if (!own) continue;
        if (own.status === LADDER_STATUS.RECOVERING
          && Number.isFinite(own.recoverReadyAtS)
          && t >= own.recoverReadyAtS) {
          // Do not auto-accept recovery — leave ready; branch systems may call recover.
          // Emitting progress once is enough for UI; avoid spam via flag.
          if (!own.flags) own.flags = {};
          if (!own.flags._recoverReadyEmitted) {
            own.flags._recoverReadyEmitted = true;
            emitOn(this.bus, CAREER_LADDER_EVENTS.PROGRESS, progressPayload(own, def, t));
          }
        } else if (own.status === LADDER_STATUS.ACTIVE && own.flags) {
          own.flags._recoverReadyEmitted = false;
        }
      }
    },

    serialize() {
      return serializeCareerLadders(this.state, definitions);
    },

    deserialize(blob) {
      return deserializeCareerLadders(this.state, blob, {
        getDef: (id) => definitions.get(id),
      });
    },

    registerDefinition(def) {
      const result = registerLadderDefinition(def);
      if (result.ok && this.state) ensureLadderLeaf(this.state, definitions.get(def.careerId));
      return result;
    },

    getDefinition(careerId) {
      return definitions.get(careerId);
    },

    getOfferView(careerId) {
      return getLadderOfferView(this.state, careerId);
    },

    getProgress(careerId) {
      return getLadderProgress(this.state, careerId);
    },

    /** Soft-offer a ladder (e.g. after origin complete or skill proof). */
    offer(careerId, opts = {}) {
      const def = definitions.get(careerId);
      if (!def) return { ok: false, reason: 'unknown_career' };
      const own = ensureLadderLeaf(this.state, def);
      const result = transitionOffer(own, def, simTimeOf(this.state), {
        state: this.state,
        ...opts,
      });
      return dispatchResult(this.bus, result);
    },

    accept(careerId, opts = {}) {
      const def = definitions.get(careerId);
      if (!def) return { ok: false, reason: 'unknown_career' };
      const own = ensureLadderLeaf(this.state, def);
      // Allow accept from latent by auto-offering first (station rail convenience).
      if (own.status === LADDER_STATUS.LATENT || own.status === LADDER_STATUS.DECLINED) {
        transitionOffer(own, def, simTimeOf(this.state), {
          state: this.state,
          ignorePrereqs: !!opts.ignorePrereqs,
          force: own.status === LADDER_STATUS.DECLINED,
        });
      }
      const result = transitionAccept(own, def, simTimeOf(this.state), {
        state: this.state,
        stepIndex: opts.stepIndex,
        stepId: opts.stepId,
        ignorePrereqs: !!opts.ignorePrereqs,
        allowFromLatent: true,
      });
      return dispatchResult(this.bus, result);
    },

    decline(careerId) {
      const def = definitions.get(careerId);
      if (!def) return { ok: false, reason: 'unknown_career' };
      const own = ensureLadderLeaf(this.state, def);
      return dispatchResult(this.bus, transitionDecline(own, def, simTimeOf(this.state)));
    },

    abandon(careerId) {
      const def = definitions.get(careerId);
      if (!def) return { ok: false, reason: 'unknown_career' };
      const own = ensureLadderLeaf(this.state, def);
      return dispatchResult(this.bus, transitionAbandon(own, def, simTimeOf(this.state)));
    },

    choose(careerId, choiceId, opts = {}) {
      const def = definitions.get(careerId);
      if (!def) return { ok: false, reason: 'unknown_career' };
      const own = ensureLadderLeaf(this.state, def);
      return dispatchResult(
        this.bus,
        transitionResolveChoice(own, def, simTimeOf(this.state), choiceId, opts),
      );
    },

    recover(careerId, opts = {}) {
      const def = definitions.get(careerId);
      if (!def) return { ok: false, reason: 'unknown_career' };
      const own = ensureLadderLeaf(this.state, def);
      return dispatchResult(
        this.bus,
        transitionRecoverStep(own, def, simTimeOf(this.state), opts),
      );
    },

    /**
     * Apply a generic signal (complete/fail/recover/choice/…).
     * Branch live adapters call this; framework stays role-agnostic.
     */
    applySignal(careerId, signal, opts = {}) {
      const def = definitions.get(careerId);
      if (!def) return { ok: false, reason: 'unknown_career' };
      const own = ensureLadderLeaf(this.state, def);
      const result = applyLadderSignal(own, def, signal, simTimeOf(this.state), {
        state: this.state,
        ...opts,
      });
      return dispatchResult(this.bus, result);
    },

    /** Record skill-proof counters used by soft-unlock prerequisites (framework-owned meta only). */
    noteSkillProof(key, delta = 1) {
      const ladders = ensureCareerLaddersState(this.state);
      if (!ladders || !ladders.__meta) return;
      if (!ladders.__meta.skillProof || typeof ladders.__meta.skillProof !== 'object') {
        ladders.__meta.skillProof = {};
      }
      const k = String(key || '');
      if (!k) return;
      ladders.__meta.skillProof[k] = (Number(ladders.__meta.skillProof[k]) || 0) + (Number(delta) || 0);
    },

    destroy() {
      for (const off of this._subs || []) {
        try { off(); } catch (_) { /* best-effort */ }
      }
      this._subs = [];
    },

    _listen(event, handler) {
      if (!this.bus || typeof this.bus.on !== 'function') return;
      const off = this.bus.on(event, handler);
      if (typeof off === 'function') this._subs.push(off);
    },
  };
}

/** Singleton system instance registered by the registry (mirrors careerOrigins export style). */
export const careerLadders = createCareerLaddersSystem();

// Touch masterSeedOf so tree-shakers keep the import available for tests/extensions.
void masterSeedOf;
