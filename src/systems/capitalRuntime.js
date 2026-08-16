// Arcade Core Plan 20 — Iron Maw physical phase and choice runtime.
//
// HeavyPartsRuntime owns the bodies and the no-thrust hulk transition. This owner reads those
// exact physical children and advances the authored phase recipe; it never invents subsystem HP,
// writes velocity, or substitutes a hull-percentage phase. The end choice likewise resolves only
// through a real industrial-beam extraction, a live Massline displacement, or ordinary combat
// death after the player arms the reactor finish.

import { IRON_MAW_ENEMY_ID } from '../data/heavyFamily.js';

export const CAPITAL_PHASE_RUNTIME_ID = 'capital_phase_runtime_v1';
export const IRON_MAW_PHASE_IDS = Object.freeze({
  screen: 'iron_maw_phase_pd_screen',
  drives: 'iron_maw_phase_drive_kill',
  decision: 'iron_maw_phase_hulk_decision',
});
export const IRON_MAW_CHOICE_IDS = Object.freeze(['board_lite', 'tow', 'destroy']);

const IRON_MAW_RECIPE_ID = 'capital_parts_iron_maw_v1';
const CHOICE_OFFER_INTERVAL_TICKS = 120;
const BOARD_BEAM_THRESHOLD = 240;
const TOW_RESOLUTION_DISTANCE = 320;
const HISTORY_CAP = 8;

function isIronMaw(entity) {
  const data = entity && entity.data;
  return !!(entity && entity.alive !== false && entity.type === 'ship' && data
    && (data.enemyTypeId === IRON_MAW_ENEMY_ID || data.heavyPartRecipeId === IRON_MAW_RECIPE_ID));
}

function boundedHistory(runtime, entry) {
  runtime.history.push(entry);
  while (runtime.history.length > HISTORY_CAP) runtime.history.shift();
}

function ensureCapitalState(entity, tick = 0) {
  if (!isIronMaw(entity)) return null;
  const data = entity.data;
  let runtime = data.capitalRuntime;
  if (!runtime || runtime.schemaVersion !== 1) {
    runtime = data.capitalRuntime = {
      schemaVersion: 1,
      runtimeId: CAPITAL_PHASE_RUNTIME_ID,
      phaseId: IRON_MAW_PHASE_IDS.screen,
      phaseStartedTick: Math.max(0, tick | 0),
      history: [],
      decision: {
        status: 'locked',
        choiceId: null,
        offeredTick: -CHOICE_OFFER_INTERVAL_TICKS,
        origin: null,
        outcome: null,
      },
    };
  }
  if (!Array.isArray(runtime.history)) runtime.history = [];
  if (!runtime.decision || typeof runtime.decision !== 'object') {
    runtime.decision = {
      status: 'locked', choiceId: null,
      offeredTick: -CHOICE_OFFER_INTERVAL_TICKS,
      origin: null, outcome: null,
    };
  }
  return runtime;
}

function destroyedSet(entity) {
  const parts = entity?.data?.heavyPartsRuntime?.parts;
  const out = new Set();
  for (const record of Array.isArray(parts) ? parts : []) if (record && record.destroyed) out.add(record.partId);
  return out;
}

function phaseById(entity, phaseId) {
  return entity?.data?.heavyPartRecipe?.phases?.find((phase) => phase && phase.id === phaseId) || null;
}

function phaseObjectivesDestroyed(entity, phaseId) {
  const phase = phaseById(entity, phaseId);
  const objectives = phase && Array.isArray(phase.objectivePartIds) ? phase.objectivePartIds : [];
  if (!objectives.length) return false;
  const destroyed = destroyedSet(entity);
  return objectives.every((id) => destroyed.has(id));
}

function playerOwnsLiveTow(state, targetId) {
  const direct = state && state.player && state.player.tether;
  if (direct && direct.active === true && direct.targetId === targetId) return true;
  const byId = state?.combat?.attachments?.byId;
  for (const attachment of Object.values(byId || {})) {
    if (!attachment || attachment.state !== 'active' || attachment.targetId !== targetId) continue;
    if (attachment.ownerId === state.playerId
      && (attachment.defId === 'tether_standard' || attachment.defId === 'attachment_massline')) return true;
  }
  return false;
}

export const capitalRuntime = {
  name: 'capitalRuntime',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    if (!this.bus || typeof this.bus.on !== 'function') return;
    this._unsubs.push(this.bus.on('entity:spawned', ({ entity } = {}) => {
      if (isIronMaw(entity)) this._evaluate(entity, 'spawn');
    }));
    this._unsubs.push(this.bus.on('heavyPart:detached', ({ parentId } = {}) => {
      const parent = this.helpers.getEntity?.(parentId);
      if (isIronMaw(parent)) this._evaluate(parent, 'part_detached');
    }));
    this._unsubs.push(this.bus.on('heavy:disabled', ({ parentId } = {}) => {
      const parent = this.helpers.getEntity?.(parentId);
      if (isIronMaw(parent)) this._evaluate(parent, 'heavy_disabled');
    }));
    this._unsubs.push(this.bus.on('encounter:choose', (payload) => this._choose(payload || {})));
    this._unsubs.push(this.bus.on('heavy:beamExtracted', (payload) => this._beamExtracted(payload || {})));
    this._unsubs.push(this.bus.on('entity:killed', (payload) => this._killed(payload || {})));
  },

  destroy() {
    for (const off of this._unsubs || []) if (typeof off === 'function') off();
    this._unsubs = [];
  },

  update(_dt, state) {
    const ships = state.entityIndex?.ships || state.entityList || [];
    for (const entity of ships) {
      if (!isIronMaw(entity)) continue;
      const runtime = this._evaluate(entity, 'tick');
      if (!runtime || runtime.phaseId !== IRON_MAW_PHASE_IDS.decision) continue;
      const decision = runtime.decision;
      if (decision.status === 'pending') this._offer(entity, runtime);
      if (decision.status === 'active' && decision.choiceId === 'tow') this._tickTow(entity, runtime);
    }
  },

  _evaluate(entity, reason) {
    const runtime = ensureCapitalState(entity, this.state.tick);
    if (!runtime) return null;
    let advanced = true;
    while (advanced) {
      advanced = false;
      if (runtime.phaseId === IRON_MAW_PHASE_IDS.screen
        && phaseObjectivesDestroyed(entity, IRON_MAW_PHASE_IDS.screen)) {
        this._transition(entity, runtime, IRON_MAW_PHASE_IDS.drives, reason);
        advanced = true;
      } else if (runtime.phaseId === IRON_MAW_PHASE_IDS.drives
        && phaseObjectivesDestroyed(entity, IRON_MAW_PHASE_IDS.drives)) {
        this._transition(entity, runtime, IRON_MAW_PHASE_IDS.decision, reason);
        runtime.decision.status = runtime.decision.status === 'locked' ? 'pending' : runtime.decision.status;
        entity.data.capitalChoicePending = runtime.decision.status === 'pending';
        advanced = true;
      }
    }
    return runtime;
  },

  _transition(entity, runtime, nextPhaseId, reason) {
    if (runtime.phaseId === nextPhaseId) return false;
    const fromPhaseId = runtime.phaseId;
    runtime.phaseId = nextPhaseId;
    runtime.phaseStartedTick = this.state.tick | 0;
    boundedHistory(runtime, {
      fromPhaseId,
      toPhaseId: nextPhaseId,
      tick: this.state.tick | 0,
      reason: String(reason || 'physical_objectives'),
    });
    this.bus.emit('capital:phaseChanged', {
      entityId: entity.id,
      runtimeId: CAPITAL_PHASE_RUNTIME_ID,
      fromPhaseId,
      toPhaseId: nextPhaseId,
      tick: this.state.tick | 0,
      reason: String(reason || 'physical_objectives'),
    });
    return true;
  },

  _offer(entity, runtime) {
    const decision = runtime.decision;
    const tick = this.state.tick | 0;
    if (tick - (decision.offeredTick | 0) < CHOICE_OFFER_INTERVAL_TICKS) return false;
    decision.offeredTick = tick;
    const encounterId = `capital:iron-maw:${entity.id}`;
    this.bus.emit('encounter:choiceOffered', {
      encounterId,
      kind: 'capital_hulk_decision',
      title: 'IRON MAW — OPEN HULK',
      options: [
        { id: 'board_lite', label: 'Cut into the breach' },
        { id: 'tow', label: 'Take the hulk under tow' },
        { id: 'destroy', label: 'Arm the reactor finish' },
      ],
    });
    return true;
  },

  _choose(payload) {
    const match = /^capital:iron-maw:(.+)$/.exec(String(payload.encounterId || ''));
    if (!match || !IRON_MAW_CHOICE_IDS.includes(payload.choiceId)) return false;
    const entity = this.helpers.getEntity?.(numericOrString(match[1]));
    const runtime = ensureCapitalState(entity, this.state.tick);
    if (!runtime || runtime.phaseId !== IRON_MAW_PHASE_IDS.decision
      || runtime.decision.status !== 'pending') return false;
    const decision = runtime.decision;
    decision.status = 'active';
    decision.choiceId = payload.choiceId;
    decision.startedTick = this.state.tick | 0;
    decision.origin = { x: entity.pos.x, z: entity.pos.z };
    entity.data.capitalChoicePending = false;
    entity.data.beamExtractableHeavy = payload.choiceId === 'board_lite';
    if (payload.choiceId === 'board_lite') {
      entity.data.heavyExtractionThreshold = BOARD_BEAM_THRESHOLD;
      entity.data.heavyExtractionMode = 'capital_board_lite';
      entity.data.heavyExtractionPayloadType = 'iron_maw_boarding_salvage';
      entity.data.heavyExtractionSalvagePool = {
        cmdty_scrap_metal: 24,
        cmdty_salvage_electronics: 12,
        cmdty_quantum_cores: 1,
      };
    }
    if (payload.choiceId === 'destroy') {
      entity.data.capitalReactorFinishAuthorized = true;
      this.bus.emit('capital:reactorArmed', {
        entityId: entity.id,
        position: { x: entity.pos.x, z: entity.pos.z },
        tick: this.state.tick | 0,
      });
    }
    this.bus.emit('capital:choiceStarted', {
      entityId: entity.id,
      choiceId: payload.choiceId,
      tick: this.state.tick | 0,
    });
    return true;
  },

  _beamExtracted(payload) {
    const entity = this.helpers.getEntity?.(payload.targetId);
    const runtime = ensureCapitalState(entity, this.state.tick);
    if (!runtime || runtime.decision.status !== 'active'
      || runtime.decision.choiceId !== 'board_lite'
      || payload.mode !== 'capital_board_lite') return false;
    return this._resolve(entity, runtime, 'boarded', {
      payloadId: payload.payloadId,
      actorId: payload.minerId,
    });
  },

  _tickTow(entity, runtime) {
    if (!playerOwnsLiveTow(this.state, entity.id)) return false;
    const origin = runtime.decision.origin || entity.pos;
    const distance = Math.hypot(entity.pos.x - origin.x, entity.pos.z - origin.z);
    if (distance < TOW_RESOLUTION_DISTANCE) return false;
    return this._resolve(entity, runtime, 'towed', {
      actorId: this.state.playerId,
      distance,
    });
  },

  _killed(payload) {
    const entity = this.helpers.getEntity?.(payload.id);
    const runtime = entity && entity.data && entity.data.capitalRuntime;
    if (!runtime || runtime.decision?.choiceId !== 'destroy') return false;
    runtime.decision.status = 'resolved';
    runtime.decision.outcome = 'destroyed';
    runtime.decision.resolvedTick = this.state.tick | 0;
    this.bus.emit('capital:reactorCookOff', {
      entityId: entity.id,
      actorId: payload.killerId == null ? null : payload.killerId,
      position: { x: entity.pos.x, z: entity.pos.z },
      tick: this.state.tick | 0,
    });
    return true;
  },

  _resolve(entity, runtime, outcome, extra = {}) {
    if (runtime.decision.status === 'resolved') return false;
    runtime.decision.status = 'resolved';
    runtime.decision.outcome = outcome;
    runtime.decision.resolvedTick = this.state.tick | 0;
    entity.data.beamExtractableHeavy = false;
    entity.data.capitalResolution = outcome;
    this.bus.emit('capital:resolved', {
      entityId: entity.id,
      choiceId: runtime.decision.choiceId,
      outcome,
      tick: this.state.tick | 0,
      ...extra,
    });
    this.bus.emit('boss:resolved', {
      entityId: entity.id,
      outcome,
      killerId: extra.actorId == null ? null : extra.actorId,
    });
    this.bus.emit('encounter:resolved', {
      encounterId: `capital:iron-maw:${entity.id}`,
      kind: 'capital_hulk_decision',
      result: outcome,
      choiceId: runtime.decision.choiceId,
    });
    return true;
  },
};

function numericOrString(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && String(numeric) === String(value) ? numeric : value;
}

export const _test = Object.freeze({
  BOARD_BEAM_THRESHOLD,
  TOW_RESOLUTION_DISTANCE,
  ensureCapitalState,
  phaseObjectivesDestroyed,
  playerOwnsLiveTow,
});

export default capitalRuntime;
