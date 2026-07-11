import { getPresentationRecipe } from '../presentation/cueRecipes.js';
import { normalizePresentationEvent } from '../presentation/cueSchema.js';
import { damageLayerHierarchy, grammarForDoctrine, isLiveDoctrineId } from '../presentation/combatChoreography.js';

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
    this._doctrineCycles = new Map();
    this._subscriptions = [
      this.bus.on('scenario:beatEntered', (payload) => this._onScenarioBeat(payload || {})),
      this.bus.on('tether:attached', (payload) => this._onTetherAttached(payload || {})),
      this.bus.on('tether:nearBreak', (payload) => this._emitCue('tether.near_break', payload || {}, {
        sourceEvent: 'tether:nearBreak',
        sourceId: payload && payload.actorId,
        targetId: payload && payload.targetId,
        material: 'massline',
        magnitude: Math.max(1, Number(payload && payload.tension) || 0, Number(payload && payload.impulse) || 0),
      })),
      this.bus.on('tether:broken', (payload) => this._emitCue('tether.break', payload || {}, {
        sourceEvent: 'tether:broken',
        sourceId: payload && payload.actorId,
        targetId: payload && payload.targetId,
        material: 'massline',
        magnitude: Math.max(1, Number(payload && payload.tension) || 0, Number(payload && payload.impulse) || 0),
      })),
      // Rung 10 — massline threat feedback, the consume half of masslineThreats' rung-09 emit.
      // One cue; severity (0..1) drives magnitude so adapters scale sting/warn intensity, and the
      // threat kind rides the tags for downstream flavor. Sibling of tether.near_break above.
      this.bus.on('massline:threat', (payload) => this._emitCue('massline.threat', payload || {}, {
        sourceEvent: 'massline:threat',
        targetId: payload && payload.targetId,
        material: 'massline',
        magnitude: Math.max(1, finiteScore(payload && payload.severity) * 100),
        tags: ['threat', payload && payload.kind].filter(Boolean),
      })),
      // Rung 14 — whip-impact feedback, the consume half of masslineImpacts' rung-13 emit. The
      // struck body is the cue target (that's where the crack lands); the whipped mass rides as
      // sourceId. Severity (0..1) drives magnitude so adapters scale the sting, and the rating +
      // latched/slung ride the tags for downstream flavor. Sibling of massline.threat above.
      this.bus.on('tether:whipImpact', (payload) => this._emitCue('tether.whip_impact', payload || {}, {
        sourceEvent: 'tether:whipImpact',
        sourceId: payload && payload.targetId,
        targetId: payload && payload.victimId,
        material: 'massline',
        magnitude: Math.max(1, finiteScore(payload && payload.severity) * 100),
        tags: ['whip', payload && payload.rating, payload && payload.slung ? 'slung' : 'latched'].filter(Boolean),
      })),
      // Prompt 03 — release-rated feedback. Classification tiers map to escalating cues; "messy"
      // intentionally has no recipe, so _emitCue suppresses it (missing_recipe) and no
      // presentation:cue is emitted. The releaseScore drives magnitude so adapters can scale.
      this.bus.on('tether:releaseRated', (payload) => this._onReleaseRated(payload || {})),
      this.bus.on('combat:damage', (payload) => this._onCombatDamage(payload || {})),
      this.bus.on('ai:telegraph', (payload) => this._onDoctrineTelegraph(payload || {})),
      this.bus.on('combat:fire', (payload) => this._onCombatFire(payload || {})),
      this.bus.on('combat:actionStarted', (payload) => this._onCombatActionStarted(payload || {})),
      this.bus.on('projectile:nearMiss', (payload) => this._onProjectileNearMiss(payload || {})),
      this.bus.on('entity:killed', (payload) => this._onEntityKilled(payload || {})),
      this.bus.on('entity:destroyed', (payload) => this._clearDoctrineCyclesFor(payload && payload.id)),
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
    if (this._doctrineCycles) this._doctrineCycles.clear();
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
    const layers = damageLayerHierarchy(payload);
    const hasLayerReceipt = Number.isFinite(payload.shieldDamage) || Number.isFinite(payload.armorDamage) || Number.isFinite(payload.hullDamage);
    if (hasLayerReceipt) {
      this._emitCue('combat.damage.applied', payload, {
        sourceEvent: 'combat:damage',
        sourceId: payload.attackerId,
        targetId: payload.targetId,
        material: payload.dominantLayer || layers[layers.length - 1] || 'damage',
        magnitude: Math.max(1, Number(payload.applied) || Number(payload.amount) || 0),
        tags: layers,
      });
      if (payload.targetId === this.state.playerId || payload.isPlayer) {
        this._emitCue('combat.player.hit', payload, {
          sourceEvent: 'combat:damage',
          sourceId: payload.attackerId,
          targetId: payload.targetId,
          material: payload.dominantLayer || layers[layers.length - 1] || 'damage',
          magnitude: Math.max(1, Number(payload.applied) || Number(payload.amount) || 0),
          tags: layers,
        });
      }
    }
    // Keep the established shield-collapse cue as the terminal receipt for this event; existing
    // headless checks and alert consumers use it as the authoritative break acknowledgement.
    if (payload.brokeShield) {
      this._emitCue('shield.collapse', payload, {
        sourceEvent: 'combat:damage',
        sourceId: payload.attackerId,
        targetId: payload.targetId,
        material: 'shield',
        magnitude: Math.max(1, Number(payload.applied) || Number(payload.amount) || 0),
      });
    }
    const killed = Number(payload.after && payload.after.hull) <= 0 && Number(payload.before && payload.before.hull) > 0;
    this._completeDoctrineCycle(payload.attackerId, payload.targetId, killed ? 'kill' : 'hit', payload);
  },

  _onDoctrineTelegraph(payload) {
    const sourceId = payload.entityId ?? payload.sourceId ?? null;
    const targetId = payload.targetId ?? null;
    const doctrineId = payload.doctrineId || null;
    if (sourceId == null || targetId == null || !isLiveDoctrineId(doctrineId)) return;
    const grammar = grammarForDoctrine(doctrineId);
    const cycle = { sourceId, targetId, doctrineId, grammar, actionEmitted: false, startedTick: currentTick(this.state) };
    this._doctrineCycles.set(sourceId, cycle);
    const common = {
      sourceEvent: 'ai:telegraph',
      sourceId,
      targetId,
      material: 'doctrine',
      sequence: cycle.startedTick,
    };
    this._emitCue('combat.doctrine.setup', payload, {
      ...common,
      tags: [doctrineId, grammar.shape, 'setup'],
    });
    this._emitCue('combat.doctrine.telegraph', payload, {
      ...common,
      magnitude: Math.max(1, Number(payload.durationTicks) || grammar.telegraphTicks),
      tags: [doctrineId, grammar.shape, grammar.telegraphKind, 'telegraph'],
    });
  },

  _onCombatFire(payload) {
    const sourceId = payload.ownerId ?? payload.sourceId ?? null;
    const cycle = sourceId == null ? null : this._doctrineCycles.get(sourceId);
    this._emitDoctrineAction(cycle, { ...payload, pos: payload.origin || payload.pos }, 'combat:fire');
  },

  _onCombatActionStarted(payload) {
    const sourceId = payload.actorId ?? null;
    const cycle = sourceId == null ? null : this._doctrineCycles.get(sourceId);
    if (!cycle || cycle.doctrineId !== 'tether_control_raider' || payload.actionId !== 'action_attach') return;
    const targetId = payload.target && payload.target.entityId;
    if (targetId != null && targetId !== cycle.targetId) return;
    this._emitDoctrineAction(cycle, payload, 'combat:actionStarted');
  },

  _onTetherAttached(payload) {
    this._emitCue('tether.attach', payload, {
      sourceEvent: 'tether:attached',
      sourceId: payload.actorId,
      targetId: payload.targetId,
      material: 'massline',
    });
    const cycle = payload.actorId == null ? null : this._doctrineCycles.get(payload.actorId);
    if (!cycle || cycle.doctrineId !== 'tether_control_raider' || cycle.targetId !== payload.targetId) return;
    // Attachment creation is the tether doctrine's first truthful control outcome. If a legacy
    // producer skipped combat:actionStarted, preserve the full receipt sequence without faking fire.
    this._emitDoctrineAction(cycle, payload, 'tether:attached');
    this._completeDoctrineCycle(payload.actorId, payload.targetId, 'attached', payload, 'tether:attached');
  },

  _emitDoctrineAction(cycle, payload, sourceEvent) {
    if (!cycle || cycle.actionEmitted) return false;
    cycle.actionEmitted = true;
    this._emitCue('combat.doctrine.action', payload, {
      sourceEvent,
      sourceId: cycle.sourceId,
      targetId: cycle.targetId,
      material: 'doctrine',
      sequence: cycle.startedTick,
      tags: [cycle.doctrineId, cycle.grammar.shape, payload.actionId || cycle.grammar.actionKind, 'action'],
    });
    return true;
  },

  _onProjectileNearMiss(payload) {
    this._emitCue('combat.near_miss', payload, {
      sourceEvent: 'projectile:nearMiss',
      sourceId: payload.ownerId,
      targetId: payload.targetId,
      material: payload.damageType || 'projectile',
      magnitude: Math.max(1, Number(payload.distance) || 1),
      sequence: payload.projectileId ?? null,
    });
    this._completeDoctrineCycle(payload.ownerId, payload.targetId, 'near_miss', payload);
  },

  _onEntityKilled(payload) {
    const targetId = payload.id ?? payload.targetId ?? payload.victimId ?? null;
    if (payload.killerId === this.state.playerId) {
      this._emitCue('combat.player.kill', payload, {
        sourceEvent: 'entity:killed',
        sourceId: payload.killerId,
        targetId,
        material: 'kill',
      });
    }
    this._completeDoctrineCycle(payload.killerId, targetId, 'kill', payload);
    this._clearDoctrineCyclesFor(targetId);
  },

  _completeDoctrineCycle(sourceId, targetId, outcome, payload, sourceEvent = null) {
    if (sourceId == null) return false;
    const cycle = this._doctrineCycles.get(sourceId);
    if (!cycle || (targetId != null && cycle.targetId !== targetId)) return false;
    this._emitCue('combat.doctrine.aftermath', payload, {
      sourceEvent: sourceEvent || (outcome === 'near_miss' ? 'projectile:nearMiss' : outcome === 'kill' ? 'entity:killed' : 'combat:damage'),
      sourceId,
      targetId: cycle.targetId,
      material: 'doctrine',
      sequence: cycle.startedTick,
      tags: [cycle.doctrineId, cycle.grammar.shape, cycle.grammar.aftermathKind, outcome, 'aftermath'],
    });
    this._doctrineCycles.delete(sourceId);
    return true;
  },

  _clearDoctrineCyclesFor(entityId) {
    if (entityId == null || !this._doctrineCycles) return;
    this._doctrineCycles.delete(entityId);
    for (const [sourceId, cycle] of this._doctrineCycles) {
      if (cycle.targetId === entityId) this._doctrineCycles.delete(sourceId);
    }
  },

  _onReleaseRated(payload) {
    const cueId = RELEASE_CUE_BY_CLASSIFICATION[payload && payload.classification];
    // "messy" maps to undefined → no recipe → _emitCue suppresses via missing_recipe, so messy
    // releases get no premium feedback, exactly as Prompt 03 requires.
    if (!cueId) return;
    this._emitCue(cueId, payload, {
      sourceEvent: 'tether:releaseRated',
      targetId: payload && payload.targetId,
      material: 'massline',
      magnitude: Math.max(1, finiteScore(payload && payload.releaseScore) * 100),
      tags: ['release', payload && payload.classification],
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

// Prompt 03 — release classification → presentation cue. "messy" is deliberately absent so the
// orchestrator emits no cue for messy releases (no premium feedback).
const RELEASE_CUE_BY_CLASSIFICATION = Object.freeze({
  good: 'tether.release.good',
  clean: 'tether.release.clean',
  razor: 'tether.release.razor',
});

function finiteScore(value) {
  return Number.isFinite(value) ? value : 0;
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
