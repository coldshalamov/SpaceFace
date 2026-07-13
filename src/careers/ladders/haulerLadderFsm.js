// CL-01 Hauler professional ladder — live event adapter (candidate).
// Owns step arming, mission offer authorship, world-pressure intents, and
// live-event → framework signal translation. Never writes credits/cargo/rep/
// heat/story.beatIndex. Rewards flow only through careerLadders → canonical intents.
//
// Not auto-registered. Integration:
//   import { createHaulerLadderSystem, registerHaulerLadder } from './haulerLadderFsm.js';
//   registerHaulerLadder();
//   registry.register(createHaulerLadderSystem());  // lead wires when accepted

import { isPlayerWanted } from '../../systems/heat.js';
import {
  CAREER_LADDER_EVENTS,
  LADDER_STATUS,
  STEP_STATUS,
  assertNoNondeterminism,
  masterSeedOf,
  simTimeOf,
} from './ladderShared.js';
import {
  clearLadderDefinitions,
  createCareerLaddersSystem,
  ensureCareerLaddersState,
  getLadderDefinition,
  registerLadderDefinition,
} from './careerLadders.js';
import { getLadderLeaf } from './ladderSchema.js';
import {
  HAULER_LADDER_CAREER_ID,
  HAULER_LADDER_DEF,
  HAULER_ROLE_HULL_DEF_ID,
  HAULER_LADDER_STORY_PREFIX,
  HAULER_STEP_PARAMS,
  buildHaulerLadderMissionOffer,
  haulerLadderMissionId,
  haulerLadderStepSeed,
  haulerLadderStoryTag,
  pickHaulerInjectEvent,
  validateHaulerLadderDefinition,
} from './haulerLadderDefs.js';

export {
  HAULER_LADDER_CAREER_ID,
  HAULER_LADDER_DEF,
  HAULER_LADDER_STORY_PREFIX,
  HAULER_STEP_PARAMS,
  buildHaulerLadderMissionOffer,
  haulerLadderMissionId,
  haulerLadderStepSeed,
  haulerLadderStoryTag,
  pickHaulerInjectEvent,
  validateHaulerLadderDefinition,
} from './haulerLadderDefs.js';

export { assertNoNondeterminism };

const CAREER_ID = HAULER_LADDER_CAREER_ID;
const ROLE_HULL_STEP_ID = 'role_hull_capstone';

function ownsRoleHull(state) {
  const owned = state && state.player && state.player.ownedShips;
  return Array.isArray(owned) && owned.some((ship) => ship && ship.defId === HAULER_ROLE_HULL_DEF_ID);
}

function reopenLegacyRoleHullCapstone(state) {
  const own = leafOf(state);
  const rt = stepRuntime(own, ROLE_HULL_STEP_ID);
  if (!own || own.status !== LADDER_STATUS.COMPLETED || !rt || rt.status !== STEP_STATUS.PENDING) {
    return own;
  }
  const priorDone = HAULER_LADDER_DEF.steps.slice(0, -1)
    .every((step) => stepRuntime(own, step.id)?.status === STEP_STATUS.DONE);
  if (!priorDone) return own;
  own.status = LADDER_STATUS.ACTIVE;
  own.stepIndex = HAULER_LADDER_DEF.steps.length - 1;
  own.stepId = ROLE_HULL_STEP_ID;
  rt.status = STEP_STATUS.ACTIVE;
  rt.attempts = Math.max(1, rt.attempts | 0);
  rt.activeSinceS = simTimeOf(state);
  return own;
}

/**
 * Register the hauler definition on the shared framework registry.
 * Safe to call once per process; duplicate registration returns ok:false.
 */
export function registerHaulerLadder() {
  const v = validateHaulerLadderDefinition(HAULER_LADDER_DEF);
  if (!v.ok) return { ok: false, reason: 'invalid_definition', errors: v.errors };
  if (getLadderDefinition(CAREER_ID)) {
    return { ok: true, reason: 'already_registered', careerId: CAREER_ID };
  }
  return registerLadderDefinition(HAULER_LADDER_DEF);
}

function emitOn(bus, event, payload) {
  if (bus && typeof bus.emit === 'function' && event) bus.emit(event, payload);
}

function leafOf(state) {
  ensureCareerLaddersState(state);
  return getLadderLeaf(state, CAREER_ID);
}

function stepRuntime(own, stepId) {
  if (!own || !own.steps) return null;
  return own.steps[stepId] || null;
}

function activeStepId(own) {
  return own && own.status === LADDER_STATUS.ACTIVE ? own.stepId : null;
}

function ensureStepPayload(own, stepId) {
  const rt = stepRuntime(own, stepId);
  if (!rt) return null;
  if (!rt.payload || typeof rt.payload !== 'object') rt.payload = {};
  return rt.payload;
}

/**
 * Arm a newly active step: seed save-safe payload, optional mission post,
 * optional mission:forceEvent world pressure (economy owns injectEvent).
 */
export function armHaulerStep(state, bus, registry, stepId, opts = {}) {
  const own = leafOf(state);
  if (!own || !stepId) return { ok: false, reason: 'no_leaf' };
  const params = HAULER_STEP_PARAMS[stepId];
  if (!params) return { ok: false, reason: 'unknown_step' };
  const rt = stepRuntime(own, stepId);
  if (!rt) return { ok: false, reason: 'no_step_runtime' };
  const payload = ensureStepPayload(own, stepId);
  if (stepId === ROLE_HULL_STEP_ID) {
    payload.roleHullDefId = HAULER_ROLE_HULL_DEF_ID;
    payload.armedAtS = simTimeOf(state);
    return { ok: true, stepId, missionId: null, payload, intents: [], events: [] };
  }
  const masterSeed = masterSeedOf(state);
  const attempt = rt.attempts | 0;
  const offerNonce = own.offerNonce | 0;
  const stepSeed = haulerLadderStepSeed(masterSeed, stepId, attempt + offerNonce);
  const missionId = payload.missionId
    || haulerLadderMissionId(masterSeed, stepId, attempt, offerNonce);
  const storyTag = haulerLadderStoryTag(stepId);
  const deadlineS = simTimeOf(state) + (params.deadlineSlackS || 300);

  payload.missionId = missionId;
  payload.storyTag = storyTag;
  payload.cmdtyId = params.commodityId || null;
  payload.qty = params.qty || 0;
  payload.originStationId = params.originStationId || null;
  payload.destStationId = params.destStationId || null;
  payload.deadlineS = deadlineS;
  payload.stepSeed = stepSeed;
  payload.armedAtS = simTimeOf(state);
  payload.fragileLotId = params.fragile ? `fragile:${CAREER_ID}:${stepId}:${attempt}` : null;
  payload.buyUnitAvg = payload.buyUnitAvg ?? null;
  payload.sellUnitAvg = payload.sellUnitAvg ?? null;
  payload.buyQty = payload.buyQty || 0;
  payload.sellQty = payload.sellQty || 0;
  payload.eventType = payload.eventType || null;
  payload.eventStationId = payload.eventStationId || null;
  payload.choiceId = rt.choiceId || payload.choiceId || null;
  payload.worldBoomReceipt = payload.worldBoomReceipt || null;

  const intents = [];
  const events = [];

  // World pressure: mission:forceEvent → economy.injectEvent (not a reward intent).
  if (params.injectEvent && !payload.eventInjected) {
    const inject = pickHaulerInjectEvent(stepId, stepSeed);
    if (inject) {
      payload.eventType = inject.type;
      payload.eventStationId = inject.stationId;
      payload.eventInjected = true;
      intents.push({ event: 'mission:forceEvent', payload: inject });
    }
  }

  // Optional mission authority seam — never invent a parallel board.
  if (!opts.skipMission && registry) {
    const missions = typeof registry.get === 'function' ? registry.get('missions') : null;
    if (missions && typeof missions.postAndAcceptAuthoredOffer === 'function') {
      const offer = buildHaulerLadderMissionOffer(state, stepId, attempt, offerNonce, {
        missionId,
        attemptMult: own.attemptMult,
      });
      const posted = missions.postAndAcceptAuthoredOffer(offer);
      if (posted && posted.ok && posted.missionId) {
        payload.missionId = posted.missionId;
        payload.missionPosted = true;
      } else if (posted && !posted.ok) {
        payload.missionPostReason = posted.reason || 'post_failed';
      }
    }
  }

  emitOn(bus, 'toast', {
    text: params.acceptLine,
    kind: 'info',
    ttl: 3.5,
  });

  return { ok: true, stepId, missionId: payload.missionId, payload, intents, events };
}

/**
 * Emit boom infrastructure consequence once (receipt-gated on step payload).
 * economy owns injectEvent via mission:forceEvent listener.
 */
export function emitInfrastructureBoom(own, stepId, bus) {
  const params = HAULER_STEP_PARAMS[stepId];
  if (!params || !params.boomOnComplete) return { ok: false, reason: 'no_boom' };
  const payload = ensureStepPayload(own, stepId);
  if (!payload) return { ok: false, reason: 'no_payload' };
  const receiptId = `boom:${CAREER_ID}:${stepId}`;
  if (payload.worldBoomReceipt === receiptId) {
    return { ok: true, duplicate: true, receiptId };
  }
  payload.worldBoomReceipt = receiptId;
  const boom = params.boomOnComplete;
  const intent = {
    event: 'mission:forceEvent',
    payload: {
      type: boom.type,
      stationId: boom.stationId,
      commodityId: boom.commodityId || '*',
      duration: boom.durationS,
    },
  };
  emitOn(bus, intent.event, intent.payload);
  return { ok: true, receiptId, intent };
}

function dispatchLadders(ladders, result) {
  // createCareerLaddersSystem already emits intents/events via applySignal/accept.
  return result;
}

function failStep(ladders, code, opts = {}) {
  return dispatchLadders(ladders, ladders.applySignal(CAREER_ID, {
    kind: 'fail',
    code: code || 'failed',
    ...opts,
  }));
}

function completeStep(ladders, bus, state, opts = {}) {
  const beforeId = (() => {
    const own = leafOf(state);
    return own && own.stepId;
  })();
  const result = ladders.applySignal(CAREER_ID, { kind: 'complete', ...opts });
  if (result && result.ok && !result.duplicate) {
    // Infrastructure boom on successful final-step completion.
    if (beforeId === 'lane_infrastructure') {
      const own = leafOf(state);
      emitInfrastructureBoom(own, 'lane_infrastructure', bus);
    }
    // Soft skill proof for alternate unlocks of peer content (framework meta only).
    if (typeof ladders.noteSkillProof === 'function') {
      ladders.noteSkillProof('hauler_step_done', 1);
    }
  }
  return result;
}

function missionMatches(payload, p) {
  if (!payload || !p) return false;
  const missionId = p.missionId || p.id;
  if (payload.missionId && missionId && payload.missionId === missionId) return true;
  const tag = p.storyTag;
  if (payload.storyTag && tag && payload.storyTag === tag) return true;
  if (tag && typeof tag === 'string' && tag.startsWith(HAULER_LADDER_STORY_PREFIX)) {
    return true;
  }
  return false;
}

/**
 * Record buy/sell legs for spread_counterplay from economy:tradeCompleted.
 * Completes when qty + min spread met. Does not write economy state.
 */
export function recordSpreadTrade(state, trade, ladders, bus) {
  const own = leafOf(state);
  const stepId = activeStepId(own);
  if (stepId !== 'spread_counterplay') return { ok: false, reason: 'wrong_step' };
  const params = HAULER_STEP_PARAMS.spread_counterplay;
  const payload = ensureStepPayload(own, stepId);
  if (!payload || !trade) return { ok: false, reason: 'bad_trade' };
  if (trade.commodityId && params.commodityId && trade.commodityId !== params.commodityId) {
    return { ok: false, reason: 'wrong_commodity' };
  }
  const qty = Math.max(0, Math.floor(Number(trade.qty) || 0));
  const unit = Number(trade.unitAvg);
  if (!(qty > 0) || !Number.isFinite(unit)) return { ok: false, reason: 'bad_qty' };

  if (trade.side === 'buy' && trade.stationId === params.originStationId) {
    const prevQty = payload.buyQty || 0;
    const prevAvg = payload.buyUnitAvg;
    const nextQty = prevQty + qty;
    payload.buyUnitAvg = prevQty > 0 && Number.isFinite(prevAvg)
      ? ((prevAvg * prevQty) + (unit * qty)) / nextQty
      : unit;
    payload.buyQty = nextQty;
  } else if (trade.side === 'sell' && trade.stationId === params.destStationId) {
    const prevQty = payload.sellQty || 0;
    const prevAvg = payload.sellUnitAvg;
    const nextQty = prevQty + qty;
    payload.sellUnitAvg = prevQty > 0 && Number.isFinite(prevAvg)
      ? ((prevAvg * prevQty) + (unit * qty)) / nextQty
      : unit;
    payload.sellQty = nextQty;
  } else {
    return { ok: false, reason: 'wrong_side_or_station' };
  }

  return maybeCompleteSpread(state, ladders, bus);
}

export function maybeCompleteSpread(state, ladders, bus) {
  const own = leafOf(state);
  const stepId = activeStepId(own);
  if (stepId !== 'spread_counterplay') return { ok: false, reason: 'wrong_step' };
  const params = HAULER_STEP_PARAMS.spread_counterplay;
  const payload = ensureStepPayload(own, stepId);
  if (!payload) return { ok: false, reason: 'no_payload' };
  const need = params.qty || 0;
  if ((payload.buyQty || 0) < need || (payload.sellQty || 0) < need) {
    return { ok: true, reason: 'legs_incomplete', payload };
  }
  const buy = payload.buyUnitAvg;
  const sell = payload.sellUnitAvg;
  if (!Number.isFinite(buy) || !Number.isFinite(sell)) {
    return { ok: false, reason: 'missing_avg' };
  }
  const minSell = buy * (1 + (params.minSpreadPct || 0));
  if (sell <= minSell) {
    return { ok: true, reason: 'spread_not_closed', buy, sell, minSell };
  }
  return completeStep(ladders, bus, state);
}

/**
 * Create a system-shaped candidate. Not auto-registered into registry.
 * Expects careerLadders either injected via opts.ladders or created locally
 * (tests). Live integration reuses the registered careerLadders singleton.
 */
export function createHaulerLadderSystem(opts = {}) {
  const system = {
    name: 'haulerLadder',
    careerId: CAREER_ID,
    state: null,
    bus: null,
    registry: null,
    ladders: opts.ladders || null,
    _subs: null,
    _ownsLadders: false,

    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus || null;
      this.registry = ctx.registry || null;
      this._subs = [];

      registerHaulerLadder();

      if (!this.ladders) {
        // Prefer registry-owned careerLadders when present.
        const fromReg = this.registry && typeof this.registry.get === 'function'
          ? this.registry.get('careerLadders')
          : null;
        if (fromReg && typeof fromReg.applySignal === 'function') {
          this.ladders = fromReg;
          this._ownsLadders = false;
        } else {
          this.ladders = createCareerLaddersSystem();
          this.ladders.init({ state: this.state, bus: this.bus, registry: this.registry });
          this._ownsLadders = true;
        }
      } else if (typeof this.ladders.init === 'function' && !this.ladders.state) {
        this.ladders.init({ state: this.state, bus: this.bus, registry: this.registry });
      }

      ensureCareerLaddersState(this.state);
      // Ensure leaf exists after registration.
      if (this.ladders && typeof this.ladders.getProgress === 'function') {
        this.ladders.getProgress(CAREER_ID);
      }

      const bus = this.bus;
      if (!bus || typeof bus.on !== 'function') return;

      this._listen('game:started', () => this.newGame());
      this._listen('game:new', () => this.newGame());
      this._listen('save:loaded', () => {
        ensureCareerLaddersState(this.state);
        this._syncRoleHullCapstone();
      });
      this._listen('ship:purchased', (p) => {
        if (p && p.defId === HAULER_ROLE_HULL_DEF_ID) this._syncRoleHullCapstone();
      });

      // Framework UI intents (career:ladder:*).
      this._listen(CAREER_LADDER_EVENTS.ACCEPT, (p) => {
        if (!p || p.careerId === CAREER_ID || !p.careerId) this.accept(p || {});
      });
      this._listen(CAREER_LADDER_EVENTS.DECLINE, (p) => {
        if (!p || p.careerId === CAREER_ID || !p.careerId) this.decline();
      });
      this._listen(CAREER_LADDER_EVENTS.ABANDON, (p) => {
        if (!p || p.careerId === CAREER_ID || !p.careerId) this.abandon();
      });
      this._listen(CAREER_LADDER_EVENTS.CHOOSE, (p) => {
        if (p && (p.careerId === CAREER_ID || !p.careerId) && p.choiceId) {
          this.choose(p.choiceId, p);
        }
      });

      // Live mission / economy / cargo / heat / traffic-adjacent seams.
      this._listen('mission:completed', (p) => this._onMissionCompleted(p));
      this._listen('mission:failed', (p) => this._onMissionFailed(p));
      this._listen('mission:expired', (p) => this._onMissionFailed({ ...p, reason: 'deadline' }));
      this._listen('economy:tradeCompleted', (p) => this._onTrade(p));
      this._listen('dock:docked', (p) => this._onDocked(p));
      this._listen('entity:killed', (p) => this._onEntityKilled(p));
      this._listen('heat:changed', (p) => this._onHeatChanged(p));
      this._listen('cargo:fragileLost', (p) => this._onFragileLost(p));
      this._listen('mining:bulkHaulDelivered', (p) => this._onBulkHaul(p));

      // Soft offer after hauler origin completion (non-binding).
      this._listen('career:origin:completed', (p) => {
        if (p && p.careerId === CAREER_ID) this.offer({ ignorePrereqs: false });
      });

      // Arm when framework emits step active for this career.
      this._listen(CAREER_LADDER_EVENTS.STEP_ACTIVE, (p) => {
        if (p && p.careerId === CAREER_ID && p.stepId) {
          this._armActiveStep(p.stepId);
          if (p.stepId === ROLE_HULL_STEP_ID) this._syncRoleHullCapstone();
        }
      });
      this._syncRoleHullCapstone();
    },

    newGame() {
      if (!this.state) return;
      // Framework newGame owns leaf wipe when careerLadders is registered;
      // when we own a local ladders instance, reset via its API.
      if (this._ownsLadders && this.ladders && typeof this.ladders.newGame === 'function') {
        this.ladders.newGame();
      }
      ensureCareerLaddersState(this.state);
    },

    update(_dt, state) {
      if (state) this.state = state;
      if (!this.state || !this.ladders) return;
      if (typeof this.ladders.update === 'function' && this._ownsLadders) {
        this.ladders.update(_dt, this.state);
      }
      this._tickDeadline();
    },

    getView() {
      if (!this.ladders) return null;
      const progress = this.ladders.getProgress(CAREER_ID);
      const offer = this.ladders.getOfferView(CAREER_ID);
      const own = leafOf(this.state);
      const stepId = own && own.stepId;
      const params = stepId ? HAULER_STEP_PARAMS[stepId] : null;
      return {
        careerId: CAREER_ID,
        title: HAULER_LADDER_DEF.title,
        nonBinding: true,
        progress,
        offer,
        stepId,
        dialogue: params ? {
          acceptLine: params.acceptLine,
          successLine: params.successLine,
          failLine: params.failLine,
          recoveryLine: params.recoveryLine,
        } : null,
        payload: stepId && own && own.steps && own.steps[stepId]
          ? own.steps[stepId].payload
          : null,
      };
    },

    offer(opts = {}) {
      if (!this.ladders) return { ok: false, reason: 'no_ladders' };
      return this.ladders.offer(CAREER_ID, opts);
    },

    accept(opts = {}) {
      if (!this.ladders) return { ok: false, reason: 'no_ladders' };
      const result = this.ladders.accept(CAREER_ID, opts);
      if (result && result.ok && result.stepId) {
        this._armActiveStep(result.stepId, opts);
      }
      return result;
    },

    decline() {
      if (!this.ladders) return { ok: false, reason: 'no_ladders' };
      return this.ladders.decline(CAREER_ID);
    },

    abandon() {
      if (!this.ladders) return { ok: false, reason: 'no_ladders' };
      return this.ladders.abandon(CAREER_ID);
    },

    choose(choiceId, opts = {}) {
      if (!this.ladders) return { ok: false, reason: 'no_ladders' };
      return this.ladders.choose(CAREER_ID, choiceId, opts);
    },

    recover(opts = {}) {
      if (!this.ladders) return { ok: false, reason: 'no_ladders' };
      const result = this.ladders.recover(CAREER_ID, opts);
      if (result && result.ok) {
        const own = leafOf(this.state);
        if (own && own.stepId) this._armActiveStep(own.stepId, { skipMission: false });
      }
      return result;
    },

    applySignal(signal, opts = {}) {
      if (!this.ladders) return { ok: false, reason: 'no_ladders' };
      const before = leafOf(this.state);
      const beforeStepId = before && before.stepId;
      const result = this.ladders.applySignal(CAREER_ID, signal, opts);
      if (result && result.ok && signal && signal.kind === 'complete' && !result.duplicate) {
        // Infrastructure boom when the step that just completed was lane_infrastructure.
        if (beforeStepId === 'lane_infrastructure' || signal.stepId === 'lane_infrastructure') {
          emitInfrastructureBoom(before, 'lane_infrastructure', this.bus);
        }
      }
      return result;
    },

    serialize() {
      if (this.ladders && typeof this.ladders.serialize === 'function') {
        return this.ladders.serialize();
      }
      return null;
    },

    deserialize(blob) {
      if (this.ladders && typeof this.ladders.deserialize === 'function') {
        return this.ladders.deserialize(blob);
      }
      return null;
    },

    destroy() {
      for (const off of this._subs || []) {
        try { off(); } catch (_) { /* best-effort */ }
      }
      this._subs = [];
      if (this._ownsLadders && this.ladders && typeof this.ladders.destroy === 'function') {
        this.ladders.destroy();
      }
    },

    _listen(event, handler) {
      if (!this.bus || typeof this.bus.on !== 'function') return;
      const off = this.bus.on(event, handler);
      if (typeof off === 'function') this._subs.push(off);
    },

    _armActiveStep(stepId, opts = {}) {
      const result = armHaulerStep(this.state, this.bus, this.registry, stepId, opts);
      if (result && result.ok && Array.isArray(result.intents)) {
        for (const intent of result.intents) {
          emitOn(this.bus, intent.event, intent.payload);
        }
      }
      return result;
    },

    _syncRoleHullCapstone() {
      if (!this.state || !this.ladders) return { ok: false, reason: 'missing' };
      const own = reopenLegacyRoleHullCapstone(this.state);
      if (!own || own.status !== LADDER_STATUS.ACTIVE || own.stepId !== ROLE_HULL_STEP_ID) {
        return { ok: true, reason: 'inactive' };
      }
      if (!ownsRoleHull(this.state)) return { ok: true, reason: 'not_owned' };
      return this.ladders.applySignal(CAREER_ID, {
        kind: 'complete',
        receiptId: `step_done:${CAREER_ID}:${ROLE_HULL_STEP_ID}:${HAULER_ROLE_HULL_DEF_ID}`,
      });
    },

    _tickDeadline() {
      const own = leafOf(this.state);
      const stepId = activeStepId(own);
      if (!stepId) return;
      const payload = ensureStepPayload(own, stepId);
      if (!payload || !Number.isFinite(payload.deadlineS)) return;
      if (simTimeOf(this.state) > payload.deadlineS) {
        failStep(this.ladders, 'deadline');
      }
    },

    _onMissionCompleted(p) {
      const own = leafOf(this.state);
      const stepId = activeStepId(own);
      if (!stepId) return;
      const payload = ensureStepPayload(own, stepId);
      if (!missionMatches(payload, p)) return;
      // Spread step prefers trade legs; mission complete is optional alternate.
      if (stepId === 'spread_counterplay') {
        const r = maybeCompleteSpread(this.state, this.ladders, this.bus);
        if (r && r.ok && r.reason === 'spread_not_closed') return;
        if (r && r.ok && !r.reason) return;
        // If legs incomplete, ignore mission complete for this step.
        return;
      }
      // WANTED gate on convoy / lane tax.
      const params = HAULER_STEP_PARAMS[stepId];
      if (params && params.heatGate && isPlayerWanted(this.state)) {
        failStep(this.ladders, 'heat_spiked');
        return;
      }
      if (params && params.fragile && payload.fragileLost) {
        failStep(this.ladders, 'cargo_cracked');
        return;
      }
      completeStep(this.ladders, this.bus, this.state);
    },

    _onMissionFailed(p) {
      const own = leafOf(this.state);
      const stepId = activeStepId(own);
      if (!stepId) return;
      const payload = ensureStepPayload(own, stepId);
      if (!missionMatches(payload, p) && !(p && p.force)) return;
      const reason = (p && p.reason) || 'failed';
      let code = reason;
      if (reason === 'escortee_lost') code = 'escortee_destroyed';
      else if (reason === 'escort_abandoned') code = 'escort_abandoned';
      else if (reason === 'deadline' || reason === 'expired') code = 'deadline';
      else if (reason === 'abandoned') code = 'abandoned';
      failStep(this.ladders, code);
    },

    _onTrade(p) {
      const own = leafOf(this.state);
      const stepId = activeStepId(own);
      if (stepId === 'spread_counterplay') {
        recordSpreadTrade(this.state, p, this.ladders, this.bus);
        return;
      }
      // Broker desk may optionally track trade legs; primary gate is mission complete.
      if (stepId === 'broker_desk' && p) {
        const payload = ensureStepPayload(own, stepId);
        if (payload && p.side === 'buy') {
          payload.buyUnitAvg = Number(p.unitAvg) || payload.buyUnitAvg;
          payload.buyQty = (payload.buyQty || 0) + (Math.floor(Number(p.qty) || 0));
        }
        if (payload && p.side === 'sell') {
          payload.sellUnitAvg = Number(p.unitAvg) || payload.sellUnitAvg;
          payload.sellQty = (payload.sellQty || 0) + (Math.floor(Number(p.qty) || 0));
        }
      }
    },

    _onDocked(_p) {
      // Soft offer when latent + origin complete / skill proof.
      const own = leafOf(this.state);
      if (!own) return;
      if (own.status === LADDER_STATUS.LATENT || own.status === LADDER_STATUS.DECLINED) {
        this.offer({ ignorePrereqs: false });
      }
    },

    _onEntityKilled(p) {
      const own = leafOf(this.state);
      const stepId = activeStepId(own);
      if (stepId !== 'bonded_convoy') return;
      const payload = ensureStepPayload(own, stepId);
      if (!payload) return;
      const killedId = p && (p.id != null ? p.id : p.entityId);
      // Escortee match: stored id, or entity marked escortee for our mission.
      if (payload.escorteeId != null && killedId === payload.escorteeId) {
        failStep(this.ladders, 'escortee_destroyed');
        return;
      }
      const data = p && p.data;
      if (data && data.escortee && (
        data.missionTag === payload.missionId
        || data.missionId === payload.missionId
      )) {
        failStep(this.ladders, 'escortee_destroyed');
      }
    },

    _onHeatChanged(_p) {
      const own = leafOf(this.state);
      const stepId = activeStepId(own);
      if (!stepId) return;
      const params = HAULER_STEP_PARAMS[stepId];
      if (!params || !params.heatGate) return;
      if (isPlayerWanted(this.state)) {
        failStep(this.ladders, 'heat_spiked');
      }
    },

    _onFragileLost(p) {
      const own = leafOf(this.state);
      const stepId = activeStepId(own);
      if (stepId !== 'risk_lane_tax') return;
      const payload = ensureStepPayload(own, stepId);
      if (!payload) return;
      // Any fragile loss during bonded lane tax voids the step (fragile lot track).
      payload.fragileLost = true;
      payload.fragileLostReceipt = p && typeof p === 'object'
        ? { t: p.t, totalQty: p.totalQty, items: p.items }
        : true;
      failStep(this.ladders, 'cargo_cracked');
    },

    _onBulkHaul(p) {
      const own = leafOf(this.state);
      const stepId = activeStepId(own);
      if (stepId !== 'lane_infrastructure') return;
      const payload = ensureStepPayload(own, stepId);
      if (!payload) return;
      // Accept bulk haul delivered when dest matches or storyTag matches.
      const destOk = !p || !p.stationId || p.stationId === payload.destStationId;
      const tagOk = !p || !p.storyTag || p.storyTag === payload.storyTag
        || (typeof p.storyTag === 'string' && p.storyTag.startsWith(HAULER_LADDER_STORY_PREFIX));
      if (destOk && tagOk) {
        completeStep(this.ladders, this.bus, this.state);
      }
    },
  };

  return system;
}

/** Singleton candidate instance (mirrors origin export style). */
export const haulerLadder = createHaulerLadderSystem();

/**
 * Test helper: clear framework defs (call carefully — shared process registry).
 * Prefer per-test clearLadderDefinitions from careerLadders in harnesses.
 */
export function _testOnlyClearHaulerRegistration() {
  clearLadderDefinitions();
}

export function isHaulerLadderActive(state) {
  const own = leafOf(state);
  return !!(own && own.status === LADDER_STATUS.ACTIVE);
}

export function getHaulerLadderLeaf(state) {
  return leafOf(state);
}

export function getHaulerStepStatus(state, stepId) {
  const own = leafOf(state);
  const rt = stepRuntime(own, stepId);
  return rt ? rt.status : null;
}

// Re-export step status constants for tests.
export { LADDER_STATUS, STEP_STATUS, CAREER_LADDER_EVENTS };
