import { getPresentationRecipe } from '../presentation/cueRecipes.js';
import { normalizePresentationEvent } from '../presentation/cueSchema.js';

export const PRESENTATION_ORCHESTRATOR_SCHEMA_VERSION = 1;

const SCENARIO_CUE_TARGET_ACTORS = Object.freeze({
  'scenario.signal.pulse': 'evidence_spindle_47a',
  'scenario.comms.kessler': 'contact_kessler',
  'scenario.comms.denial': 'official_recovery_tug',
  'scenario.objective.priority_split': 'civilian_pod',
  'scenario.branch.resolved': 'evidence_spindle_47a',
});

const DEFAULT_LANE_BUDGETS_PER_TICK = Object.freeze({
  camera: 3,
  vfx: 8,
  audio: 6,
  ui: 6,
  accessibility: 6,
});

export const presentationOrchestrator = {
  name: 'presentationOrchestrator',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this._lastByDedupeKey = new Map();
    this._laneCounts = {};
    this._laneTick = -1;
    this._emitted = 0;
    this._suppressed = 0;
    this._lastCue = null;
    this._subscriptions = [
      this.bus.on('scenario:beatEntered', (payload) => this._onScenarioBeat(payload || {})),
      this.bus.on('tether:attached', (payload) => this._emitCue('tether.attach', payload || {}, {
        sourceEvent: 'tether:attached',
        sourceId: payload && payload.actorId,
        targetId: payload && payload.targetId,
        material: 'massline',
      })),
      this.bus.on('tether:broken', (payload) => this._emitCue('tether.break', payload || {}, {
        sourceEvent: 'tether:broken',
        sourceId: payload && payload.actorId,
        targetId: payload && payload.targetId,
        material: 'massline',
        magnitude: Math.max(1, Number(payload && payload.tension) || 0, Number(payload && payload.impulse) || 0),
      })),
      this.bus.on('combat:damage', (payload) => this._onCombatDamage(payload || {})),
      this.bus.on('combat:subsystemDisabled', (payload) => this._emitCue('subsystem.disabled', payload || {}, {
        sourceEvent: 'combat:subsystemDisabled',
        targetId: payload && payload.targetId,
        subsystemId: payload && payload.subsystemId,
        material: 'subsystem',
      })),
      this.bus.on('scenario:branchResolved', (payload) => this._onScenarioBranchResolved(payload || {})),
      this.bus.on('save:loaded', () => this._resetRuntime()),
    ];
  },

  dispose() {
    while (this._subscriptions && this._subscriptions.length) {
      const unsub = this._subscriptions.pop();
      try { unsub(); } catch (_err) {}
    }
  },

  inspect() {
    return {
      schema: 'spaceface.presentationOrchestratorInspect.v1',
      schemaVersion: PRESENTATION_ORCHESTRATOR_SCHEMA_VERSION,
      emitted: this._emitted || 0,
      suppressed: this._suppressed || 0,
      lastCue: this._lastCue,
      activeDedupeKeys: this._lastByDedupeKey ? this._lastByDedupeKey.size : 0,
    };
  },

  _resetRuntime() {
    if (this._lastByDedupeKey) this._lastByDedupeKey.clear();
    this._laneCounts = {};
    this._laneTick = -1;
    this._lastCue = null;
  },

  _onScenarioBeat(payload) {
    for (const cueId of payload.presentationEventIds || []) {
      if (!cueId.startsWith('scenario.')) continue;
      const actorId = SCENARIO_CUE_TARGET_ACTORS[cueId] || null;
      const targetId = actorId ? resolveActorEntityId(this.state, actorId) : null;
      this._emitCue(cueId, payload, {
        sourceEvent: 'scenario:beatEntered',
        sourceId: payload.scenarioId || null,
        targetId,
        material: cueId.includes('.comms.') ? 'comms' : 'scenario',
        sequence: payload.beatId || null,
        tags: ['beat', payload.beatId].filter(Boolean),
      });
    }
  },

  _onCombatDamage(payload) {
    if (!payload.brokeShield) return;
    this._emitCue('shield.collapse', payload, {
      sourceEvent: 'combat:damage',
      sourceId: payload.attackerId,
      targetId: payload.targetId,
      material: 'shield',
      magnitude: Math.max(1, Number(payload.applied) || Number(payload.amount) || 0),
    });
  },

  _onScenarioBranchResolved(payload) {
    this._emitCue('scenario.branch.resolved', payload, {
      sourceEvent: 'scenario:branchResolved',
      sourceId: payload.scenarioId || null,
      targetId: resolveActorEntityId(this.state, 'evidence_spindle_47a'),
      material: 'branch',
      sequence: payload.branchId || null,
      tags: ['branch', payload.branchId].filter(Boolean),
    });
  },

  _emitCue(cueId, payload, options = {}) {
    const recipe = getPresentationRecipe(cueId);
    if (!recipe) {
      return this._suppress(cueId, payload, options, 'missing_recipe');
    }
    const raw = {
      ...(payload || {}),
      id: cueId,
      sourceId: options.sourceId ?? payload.sourceId ?? payload.attackerId ?? payload.ownerId ?? null,
      targetId: options.targetId ?? payload.targetId ?? payload.combatantId ?? null,
      subsystemId: options.subsystemId ?? payload.subsystemId ?? null,
      material: options.material || recipe.material,
      magnitude: options.magnitude ?? payload.magnitude ?? payload.applied ?? payload.amount ?? 1,
      importance: Math.max(recipe.importance, Number(payload.importance) || 0),
      sequence: options.sequence ?? payload.sequence ?? payload.attachmentId ?? null,
      tags: mergeTags(recipe.tags, options.tags, payload.tags),
      payload: payload || {},
    };
    const event = normalizePresentationEvent(raw, this.state, (this.state && this.state.simTime || 0) * 1000);
    event.recipeVersion = recipe.version;
    event.sourceEvent = options.sourceEvent || null;
    event.lanes = { ...recipe.lanes };
    event.budgets = { ...recipe.budgets };

    const suppressReason = this._suppressionReason(event, recipe);
    if (suppressReason) return this._suppress(cueId, payload, options, suppressReason, event);

    this._recordEmission(event, recipe);
    emitDeferred(this.bus, 'presentation:cue', event);
    return true;
  },

  _suppressionReason(event, recipe) {
    const tick = currentTick(this.state);
    const last = this._lastByDedupeKey.get(event.dedupeKey);
    if (last != null && tick - last < recipe.dedupeWindowTicks) return 'dedupe_window';
    this._resetLaneCountsForTick(tick);
    for (const lane of Object.keys(recipe.lanes || {}).sort()) {
      const limit = DEFAULT_LANE_BUDGETS_PER_TICK[lane] || 1;
      if ((this._laneCounts[lane] || 0) >= limit) return `lane_budget:${lane}`;
    }
    return null;
  },

  _recordEmission(event, recipe) {
    const tick = currentTick(this.state);
    this._resetLaneCountsForTick(tick);
    this._lastByDedupeKey.set(event.dedupeKey, tick);
    for (const lane of Object.keys(recipe.lanes || {}).sort()) {
      this._laneCounts[lane] = (this._laneCounts[lane] || 0) + 1;
    }
    this._emitted++;
    this._lastCue = {
      tick,
      id: event.id,
      dedupeKey: event.dedupeKey,
      sourceEvent: event.sourceEvent,
    };
  },

  _suppress(cueId, payload, options, reason, event = null) {
    this._suppressed++;
    emitDeferred(this.bus, 'presentation:cueSuppressed', {
      id: cueId,
      reason,
      sourceEvent: options.sourceEvent || null,
      dedupeKey: event && event.dedupeKey || null,
      tick: currentTick(this.state),
      payload,
    });
    return false;
  },

  _resetLaneCountsForTick(tick) {
    if (this._laneTick === tick) return;
    this._laneTick = tick;
    this._laneCounts = {};
  },
};

function resolveActorEntityId(state, actorId) {
  const binding = state && state.scenario && state.scenario.actorBindings && state.scenario.actorBindings[actorId];
  return binding && binding.entityId != null ? binding.entityId : null;
}

function mergeTags(...groups) {
  const out = [];
  const seen = new Set();
  for (const group of groups) {
    if (!Array.isArray(group)) continue;
    for (const tag of group) {
      if (typeof tag !== 'string' || !tag || seen.has(tag)) continue;
      seen.add(tag);
      out.push(tag);
    }
  }
  return out;
}

function currentTick(state) {
  return state && Number.isFinite(state.tick) ? state.tick | 0 : 0;
}

function emitDeferred(bus, type, payload) {
  if (bus && typeof bus.queue === 'function') bus.queue(type, payload);
  else if (bus && typeof bus.emit === 'function') bus.emit(type, payload);
}
