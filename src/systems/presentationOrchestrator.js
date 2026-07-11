import { getPresentationRecipe } from '../presentation/cueRecipes.js';
import { normalizePresentationEvent } from '../presentation/cueSchema.js';
import { damageLayerHierarchy, grammarForDoctrine, isLiveDoctrineId } from '../presentation/combatChoreography.js';
import { classifyDrillWarning, fieldDepletionBand, seamQualityTag } from '../presentation/miningChoreography.js';
import {
  arrivalHeading,
  cruiseDropCueId,
  jumpFailureTag,
  sectorPaletteTag,
  travelSequence,
} from '../presentation/travelChoreography.js';

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
    this._miningCycle = null;
    this._lastMiningCargoTick = -Infinity;
    this._travelCycle = null;
    this._travelRecoveryPending = null;
    this._lastCorridorSequence = null;
    this._lastTravelSectorId = null;
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
      this.bus.on('cruise:charging', (payload) => this._onTravelCruiseCharging(payload || {})),
      this.bus.on('cruise:engaged', (payload) => this._onTravelCruiseEngaged(payload || {})),
      this.bus.on('cruise:dropped', (payload) => this._onTravelCruiseDropped(payload || {})),
      this.bus.on('gate:range', (payload) => this._onTravelGateRange(payload || {})),
      this.bus.on('world:membership', (payload) => this._onTravelMembership(payload || {})),
      this.bus.on('jump:chargeStart', (payload) => this._onTravelJumpChargeStart(payload || {})),
      this.bus.on('jump:chargeTick', (payload) => this._onTravelJumpChargeTick(payload || {})),
      this.bus.on('jump:start', (payload) => this._onTravelJumpCommitted(payload || {})),
      this.bus.on('jump:chargeAbort', (payload) => this._onTravelJumpFailed(payload || {})),
      this.bus.on('jump:arrive', (payload) => this._onTravelJumpArrive(payload || {})),
      this.bus.on('sector:discovered', (payload) => this._onTravelSectorDiscovered(payload || {})),
      this.bus.on('interdiction:triggered', (payload) => this._onTravelInterdiction(payload || {})),
      this.bus.on('scan:pulse', (payload) => this._onMiningSurveyPulse(payload || {})),
      this.bus.on('scan:completed', (payload) => this._onMiningSurveyResolved(payload || {})),
      this.bus.on('mining:start', (payload) => this._onMiningStart(payload || {})),
      this.bus.on('mining:stop', (payload) => this._onMiningStop(payload || {})),
      this.bus.on('mining:tick', (payload) => this._onMiningTick(payload || {})),
      this.bus.on('mining:yield', () => { this._lastMiningCargoTick = currentTick(this.state); }),
      this.bus.on('asteroid:chunked', (payload) => this._onMiningFracture(payload || {})),
      this.bus.on('mining:richCoreExposed', (payload) => this._onMiningRichCore('mining.rich_core.exposed', 'mining:richCoreExposed', payload || {})),
      this.bus.on('mining:richCoreChargeStart', (payload) => this._onMiningRichCore('mining.rich_core.charge', 'mining:richCoreChargeStart', payload || {})),
      this.bus.on('mining:richCoreCompleted', (payload) => this._onMiningRichCore('mining.rich_core.completed', 'mining:richCoreCompleted', payload || {})),
      this.bus.on('mining:richCoreFizzle', (payload) => this._onMiningRichCore('mining.rich_core.fizzle', 'mining:richCoreFizzle', payload || {})),
      this.bus.on('mining:bulkRequiresTether', (payload) => this._onMiningBulkRequiresTether(payload || {})),
      this.bus.on('pickup:collected', (payload) => this._onMiningPickupCollected(payload || {})),
      this.bus.on('cargo:massSettled', (payload) => this._onMiningCargoMass(payload || {})),
      this.bus.on('cargo:full', (payload) => this._onMiningCargoFull(payload || {})),
      this.bus.on('fieldDepletion:changed', (payload) => this._onMiningFieldAftermath(payload || {})),
      this.bus.on('drill:warn', (payload) => this._onMiningDrillWarning(payload || {})),
      this.bus.on('sector:enter', (payload) => {
        this._resetMiningRuntime();
        this._onTravelSectorEnter(payload || {});
      }),
      this.bus.on('combat:subsystemDisabled', (payload) => this._emitCue('subsystem.disabled', payload || {}, {
        sourceEvent: 'combat:subsystemDisabled',
        targetId: payload && payload.targetId,
        subsystemId: payload && payload.subsystemId,
        material: 'subsystem',
      })),
      this.bus.on('scenario:branchResolved', (payload) => this._onScenarioBranchResolved(payload || {})),
      this.bus.on('game:new', () => this._resetRuntime()),
      this.bus.on('game:started', () => this._resetRuntime()),
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
    this._resetMiningRuntime();
    this._resetTravelRuntime();
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
    const target = this.state && this.state.entities && this.state.entities.get(payload.targetId);
    if (target && target.data && target.data.isChunk) {
      this._emitCue('mining.chunk.mass_engaged', payload, {
        sourceEvent: 'tether:attached',
        sourceId: payload.actorId,
        targetId: payload.targetId,
        material: 'bulk_chunk',
        magnitude: Math.max(1, Number(target.data.bulkMassU) || Number(target.mass) || 1),
        sequence: payload.attachmentId ?? null,
        tags: ['tether', 'mass_engaged'],
      });
    }
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

  _onTravelCruiseCharging(payload) {
    this._resumeTravel('cruise:charging', payload, payload.playerId ?? this.state.playerId);
    this._emitCue('travel.cruise.charging', payload, {
      sourceEvent: 'cruise:charging',
      sourceId: payload.playerId ?? this.state.playerId,
      material: 'cruise',
      sequence: currentTick(this.state),
      tags: ['cruise', 'charging'],
    });
  },

  _onTravelCruiseEngaged(payload) {
    this._emitCue('travel.cruise.engaged', payload, {
      sourceEvent: 'cruise:engaged',
      sourceId: payload.playerId ?? this.state.playerId,
      material: 'cruise',
      sequence: currentTick(this.state),
      tags: ['cruise', 'engaged'],
    });
  },

  _onTravelCruiseDropped(payload) {
    const cueId = cruiseDropCueId(payload.reason);
    const sourceId = payload.playerId ?? this.state.playerId;
    this._emitCue(cueId, payload, {
      sourceEvent: 'cruise:dropped',
      sourceId,
      material: 'cruise',
      sequence: currentTick(this.state),
      tags: ['cruise', payload.reason || 'unknown', payload.was || 'unknown'],
    });
    if (cueId === 'travel.cruise.interrupted') {
      this._travelRecoveryPending = { reason: payload.reason || 'interrupted', sequence: currentTick(this.state) };
    }
  },

  _onTravelGateRange(payload) {
    if (!payload.inRange || payload.gateId == null) return;
    this._emitCue('travel.gate.approach', payload, {
      sourceEvent: 'gate:range',
      sourceId: payload.shipId ?? this.state.playerId,
      targetId: payload.gateId,
      material: 'gate',
      sequence: payload.gateTo || payload.gateId,
      tags: ['approach', 'gate', payload.gateTo].filter(Boolean),
    });
  },

  _onTravelMembership(payload) {
    if (!(payload.noTeleport || payload.reason === 'free_flight')) return;
    const from = payload.previousSectorId || (this.state.world && this.state.world.currentSectorId) || null;
    const to = payload.sectorId || null;
    if (!to || from === to) return;
    const sequence = travelSequence(from, to, 'continuous');
    this._lastCorridorSequence = sequence;
    const sector = this.state.world && this.state.world.sectors && this.state.world.sectors[to];
    this._emitCue('travel.corridor.continuity', payload, {
      sourceEvent: 'world:membership',
      sourceId: this.state.playerId,
      targetId: to,
      material: 'corridor',
      sequence,
      tags: ['corridor', 'continuous', from, to, sectorPaletteTag(sector)].filter(Boolean),
    });
  },

  _onTravelJumpChargeStart(payload) {
    const from = this.state.world && this.state.world.currentSectorId || null;
    const to = payload.targetSectorId || null;
    const via = payload.via || 'gate';
    this._resumeTravel('jump:chargeStart', payload, to);
    const sequence = `${travelSequence(from, to, via)}@${currentTick(this.state)}`;
    this._travelCycle = {
      from,
      to,
      via,
      sequence,
      commitWindow: false,
      committed: false,
      entry: null,
      interdicted: false,
    };
    this._emitCue('travel.jump.aligning', payload, {
      sourceEvent: 'jump:chargeStart',
      sourceId: this.state.playerId,
      targetId: to,
      material: 'jump_drive',
      magnitude: Math.max(1, Number(payload.chargeNeeded) || 0),
      sequence,
      tags: ['alignment', via, from, to].filter(Boolean),
    });
  },

  _onTravelJumpChargeTick(payload) {
    const cycle = this._travelCycle;
    const progress = Number(payload.progress) || 0;
    if (!cycle || cycle.commitWindow || progress < 0.72) return;
    cycle.commitWindow = true;
    this._emitCue('travel.jump.commit_window', payload, {
      sourceEvent: 'jump:chargeTick',
      sourceId: this.state.playerId,
      targetId: cycle.to,
      material: 'jump_drive',
      magnitude: Math.max(1, progress),
      sequence: cycle.sequence,
      tags: ['commit', 'anticipation', cycle.via],
    });
  },

  _onTravelJumpCommitted(payload) {
    const cycle = this._travelCycle || {
      from: payload.from || null,
      to: payload.to || null,
      via: payload.via || 'jump',
      sequence: `${travelSequence(payload.from, payload.to, payload.via)}@${currentTick(this.state)}`,
      commitWindow: true,
      committed: false,
      entry: null,
      interdicted: false,
    };
    this._travelCycle = cycle;
    if (cycle.committed) return;
    cycle.committed = true;
    const enriched = { ...payload, position: payload.fromPos || payload.position || null };
    this._emitCue('travel.jump.committed', enriched, {
      sourceEvent: 'jump:start',
      sourceId: this.state.playerId,
      targetId: cycle.to,
      material: 'jump_drive',
      sequence: cycle.sequence,
      tags: ['commit', 'no_return', cycle.via, cycle.from, cycle.to].filter(Boolean),
    });
    this._emitCue('travel.transition.continuity', enriched, {
      sourceEvent: 'jump:start',
      sourceId: cycle.from,
      targetId: cycle.to,
      material: 'jump_drive',
      sequence: cycle.sequence,
      tags: ['continuity', cycle.via, cycle.from, cycle.to].filter(Boolean),
    });
  },

  _onTravelJumpFailed(payload) {
    const cycle = this._travelCycle;
    const targetId = cycle && cycle.to || null;
    const reason = payload.reason || 'unknown';
    const sequence = cycle && cycle.sequence || `failure@${currentTick(this.state)}`;
    this._emitCue('travel.jump.failed', payload, {
      sourceEvent: 'jump:chargeAbort',
      sourceId: this.state.playerId,
      targetId,
      material: 'jump_drive',
      sequence,
      tags: ['failure', jumpFailureTag(reason), reason],
    });
    this._travelRecoveryPending = { reason, sequence };
    this._travelCycle = null;
  },

  _onTravelSectorDiscovered(payload) {
    const to = payload.sectorId || null;
    const cycle = this._travelCycle;
    const from = cycle && cycle.from || this._lastTravelSectorId || null;
    if (!to || !from || to === from) return;
    const sequence = cycle && cycle.sequence || travelSequence(from, to, 'discovery');
    this._emitCue('travel.discovery.mapped', payload, {
      sourceEvent: 'sector:discovered',
      sourceId: this.state.playerId,
      targetId: to,
      material: 'discovery',
      sequence,
      tags: ['discovery', 'mapped', from, to].filter(Boolean),
    });
  },

  _onTravelSectorEnter(payload) {
    const sectorId = payload.sectorId || null;
    if (!sectorId) return;
    const continuous = !!(payload.continuous || payload.noTeleport);
    const cycle = this._travelCycle;
    if (!continuous && (!cycle || cycle.to !== sectorId)) {
      this._lastTravelSectorId = sectorId;
      return;
    }
    const sequence = continuous
      ? (this._lastCorridorSequence || travelSequence(null, sectorId, 'continuous'))
      : cycle.sequence;
    const player = this.state.entities && this.state.entities.get
      ? this.state.entities.get(this.state.playerId)
      : null;
    const heading = continuous && player && Number.isFinite(player.rot)
      ? player.rot
      : arrivalHeading(payload);
    const position = continuous && player && player.pos
      ? { x: player.pos.x, y: player.pos.y || 0, z: player.pos.z }
      : (payload.entryPoint || null);
    const enriched = {
      ...payload,
      position,
      heading,
      direction: { x: Math.cos(heading), z: Math.sin(heading) },
    };
    if (cycle && !continuous) cycle.entry = { sectorId, position, heading };
    this._emitCue('travel.arrival.oriented', enriched, {
      sourceEvent: 'sector:enter',
      sourceId: this.state.playerId,
      targetId: sectorId,
      material: 'arrival',
      sequence,
      tags: ['arrival', 'oriented', continuous ? 'continuous' : cycle.via],
    });
    this._emitCue('travel.arrival.sector_identity', enriched, {
      sourceEvent: 'sector:enter',
      sourceId: this.state.playerId,
      targetId: sectorId,
      material: 'sector',
      sequence,
      tags: ['arrival', 'sector_identity', sectorPaletteTag(payload.sector), payload.firstVisit ? 'first_visit' : 'return'].filter(Boolean),
    });
    this._lastTravelSectorId = sectorId;
  },

  _onTravelInterdiction(payload) {
    const cycle = this._travelCycle;
    if (cycle) cycle.interdicted = true;
    const sectorId = payload.sectorId || cycle && cycle.to || null;
    const enriched = { ...payload, position: payload.spawnPos || payload.position || null };
    this._emitCue('travel.interdiction.triggered', enriched, {
      sourceEvent: 'interdiction:triggered',
      sourceId: sectorId,
      targetId: this.state.playerId,
      material: 'interdiction',
      magnitude: Math.max(1, Number(payload.ambushCount) || 1),
      sequence: cycle && cycle.sequence || `${sectorId || 'unknown'}@${currentTick(this.state)}`,
      tags: ['interdiction', 'contested', `ambush_${Math.max(0, Number(payload.ambushCount) || 0)}`],
    });
  },

  _onTravelJumpArrive(payload) {
    const cycle = this._travelCycle;
    const sectorId = payload.sectorId || cycle && cycle.to || null;
    const contested = !!(payload.interdicted || cycle && cycle.interdicted);
    const cueId = contested ? 'travel.aftermath.contested' : 'travel.aftermath.clear';
    const enriched = { ...payload, position: payload.toPos || payload.position || null };
    this._emitCue(cueId, enriched, {
      sourceEvent: 'jump:arrive',
      sourceId: this.state.playerId,
      targetId: sectorId,
      material: 'arrival',
      magnitude: Math.max(1, Number(payload.ambushCount) || 0),
      sequence: cycle && cycle.sequence || `${sectorId || 'unknown'}@${currentTick(this.state)}`,
      tags: ['aftermath', contested ? 'contested' : 'clear', cycle && cycle.via].filter(Boolean),
    });
    if (contested) {
      this._travelRecoveryPending = { reason: 'interdiction', sequence: cycle && cycle.sequence || currentTick(this.state) };
    }
    this._travelCycle = null;
  },

  _resumeTravel(sourceEvent, payload, targetId) {
    const pending = this._travelRecoveryPending;
    if (!pending) return false;
    this._emitCue('travel.recovery.resumed', payload, {
      sourceEvent,
      sourceId: this.state.playerId,
      targetId: targetId ?? null,
      material: 'travel_recovery',
      sequence: pending.sequence,
      tags: ['recovery', 'resumed', pending.reason].filter(Boolean),
    });
    this._travelRecoveryPending = null;
    return true;
  },

  _resetTravelRuntime() {
    this._travelCycle = null;
    this._travelRecoveryPending = null;
    this._lastCorridorSequence = null;
    this._lastTravelSectorId = null;
  },

  _onMiningSurveyPulse(payload) {
    this._emitCue('mining.survey.pulse', payload, {
      sourceEvent: 'scan:pulse',
      sourceId: this.state.playerId,
      material: 'survey',
      sequence: currentTick(this.state),
    });
  },

  _onMiningSurveyResolved(payload) {
    const found = payload.found || {};
    this._emitCue('mining.survey.resolved', payload, {
      sourceEvent: 'scan:completed',
      sourceId: this.state.playerId,
      material: 'survey',
      magnitude: Math.max(1, Number(found.asteroids) || 0),
      sequence: payload.sectorId || currentTick(this.state),
      tags: [`asteroids_${Math.max(0, Number(found.asteroids) || 0)}`],
    });
  },

  _onMiningStart(payload) {
    const sourceId = payload.minerId ?? this.state.playerId;
    const targetId = payload.targetId ?? null;
    if (targetId == null) return;
    this._miningCycle = {
      sourceId,
      targetId,
      startedTick: currentTick(this.state),
      active: true,
      lastSeamQuality: null,
      fractureAnticipated: false,
    };
    this._emitCue('mining.extraction.locked', payload, {
      sourceEvent: 'mining:start',
      sourceId,
      targetId,
      material: 'mining_beam',
      sequence: this._miningCycle.startedTick,
    });
  },

  _onMiningStop(payload) {
    const cycle = this._miningCycle;
    if (!cycle || (payload.targetId != null && payload.targetId !== cycle.targetId)) return;
    cycle.active = false;
  },

  _onMiningTick(payload) {
    const cycle = this._miningCycle;
    if (!cycle) return;
    const quality = seamQualityTag(payload);
    if (quality !== cycle.lastSeamQuality) {
      cycle.lastSeamQuality = quality;
      this._emitCue('mining.seam.quality', payload, {
        sourceEvent: 'mining:tick',
        sourceId: cycle.sourceId,
        targetId: cycle.targetId,
        material: 'seam',
        magnitude: Math.max(0.01, Number(payload.yieldMult) || 0.35),
        sequence: quality,
        tags: [quality],
      });
    }
    if (cycle.fractureAnticipated) return;
    const target = this.state && this.state.entities && this.state.entities.get(cycle.targetId);
    const data = target && target.data;
    const hp = Number(data && data.oreHP);
    const hpMax = Number(data && data.oreHPMax);
    if (!(hpMax > 0) || hp / hpMax > 0.2) return;
    cycle.fractureAnticipated = true;
    this._emitCue('mining.fracture.anticipation', payload, {
      sourceEvent: 'mining:tick',
      sourceId: cycle.sourceId,
      targetId: cycle.targetId,
      material: 'asteroid',
      magnitude: Math.max(0, 1 - hp / hpMax),
      sequence: cycle.startedTick,
      tags: ['fracture', 'imminent'],
    });
  },

  _onMiningFracture(payload) {
    const cycle = this._miningCycle;
    const sourceId = payload.minerId ?? (cycle && cycle.sourceId) ?? this.state.playerId;
    const targetId = payload.parentId ?? (cycle && cycle.targetId) ?? null;
    if (targetId == null) return;
    this._emitCue('mining.fracture.released', payload, {
      sourceEvent: 'asteroid:chunked',
      sourceId,
      targetId,
      material: 'asteroid',
      sequence: targetId,
      tags: ['fracture', 'chunks'],
    });
  },

  _onMiningRichCore(cueId, sourceEvent, payload) {
    const cycle = this._miningCycle;
    const targetId = payload.asteroidId ?? (cycle && cycle.targetId) ?? null;
    if (targetId == null) return;
    this._emitCue(cueId, payload, {
      sourceEvent,
      sourceId: payload.minerId ?? (cycle && cycle.sourceId) ?? this.state.playerId,
      targetId,
      material: 'rich_core',
      magnitude: Math.max(1, Number(payload.qty) || Number(payload.multiplier) || 1),
      sequence: targetId,
      tags: [payload.commodityId, cueId.split('.').at(-1)].filter(Boolean),
    });
  },

  _onMiningBulkRequiresTether(payload) {
    this._emitCue('mining.chunk.tether_required', payload, {
      sourceEvent: 'mining:bulkRequiresTether',
      sourceId: this.state.playerId,
      targetId: payload.asteroidId,
      material: 'bulk_chunk',
      magnitude: Math.max(1, Number(payload.massU) || 1),
      sequence: payload.asteroidId ?? null,
      tags: [payload.commodityId, 'tether_required'].filter(Boolean),
    });
  },

  _onMiningPickupCollected(payload) {
    if (payload.collectorId !== this.state.playerId) return;
    if (payload.kind !== 'ore' && payload.kind !== 'cargo') return;
    this._lastMiningCargoTick = currentTick(this.state);
  },

  _onMiningCargoMass(payload) {
    const tick = currentTick(this.state);
    if (tick - this._lastMiningCargoTick > 2) return;
    const cargo = payload.cargo || {};
    const cap = Math.max(0, Number(cargo.capVolume) || 0);
    const used = Math.max(0, Number(payload.usedU) || Number(cargo.usedVolume) || 0);
    const ratio = cap > 0 ? Math.min(1, used / cap) : 0;
    const band = ratio >= 0.9 ? 'heavy' : ratio >= 0.6 ? 'loaded' : 'light';
    this._emitCue('mining.cargo.mass_settled', payload, {
      sourceEvent: 'cargo:massSettled',
      sourceId: this.state.playerId,
      targetId: this._miningCycle && this._miningCycle.targetId,
      material: 'cargo',
      magnitude: Math.max(1, Number(payload.massT) || Number(cargo.usedMass) || 0),
      sequence: band,
      tags: [band, `load_${Math.round(ratio * 10)}`],
    });
  },

  _onMiningCargoFull(payload) {
    const tick = currentTick(this.state);
    const activeMining = !!(this._miningCycle && this._miningCycle.active);
    if (!activeMining && tick - this._lastMiningCargoTick > 2) return;
    this._emitCue('mining.cargo.full', payload, {
      sourceEvent: 'cargo:full',
      sourceId: this.state.playerId,
      targetId: this._miningCycle && this._miningCycle.targetId,
      material: 'cargo',
      sequence: payload.commodityId || 'hold',
      tags: [payload.commodityId, 'full'].filter(Boolean),
    });
  },

  _onMiningFieldAftermath(payload) {
    if (payload.reason !== 'asteroid_destroyed') return;
    const band = fieldDepletionBand(payload.depleted);
    this._emitCue('mining.field.aftermath', payload, {
      sourceEvent: 'fieldDepletion:changed',
      sourceId: this.state.playerId,
      targetId: payload.fieldId || null,
      material: 'field',
      magnitude: Math.max(0, Number(payload.depleted) || 0),
      sequence: band,
      tags: [band, payload.sectorId].filter(Boolean),
    });
  },

  _onMiningDrillWarning(payload) {
    const kind = classifyDrillWarning(payload.text);
    if (!kind) return;
    const cueId = kind === 'overheated' ? 'mining.heat.overheated'
      : kind === 'vent_ready' ? 'mining.vent.ready'
        : 'mining.cargo.full';
    this._emitCue(cueId, payload, {
      sourceEvent: 'drill:warn',
      sourceId: this.state.playerId,
      material: kind === 'cargo_full' ? 'cargo' : 'drill_heat',
      sequence: kind,
      tags: ['drill', kind],
    });
  },

  _resetMiningRuntime() {
    this._miningCycle = null;
    this._lastMiningCargoTick = -Infinity;
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
