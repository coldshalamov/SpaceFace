import {
  AI_CONTRACT_VERSION,
  NORMALIZED_THRUSTER_REQUEST_FLAG,
  ObjectiveKind,
  TraceLayer,
  assertAIPorts,
  stableId,
} from './contracts.js';
import { EncounterDirector } from './director.js';
import { ManeuverPlanner } from './maneuver.js';
import { PerceptionMemory, aggregatePerceivedTelemetry } from './perception.js';
import { BehaviorExecutor, ShipUtilitySelector } from './shipDecision.js';
import { SquadCommander } from './squad.js';
import { ExplainabilityTrace } from './trace.js';
import { CombatDoctrineRuntime, normalizeCombatDoctrineId, overrideDirectiveForCombatDoctrine } from './combatDoctrine.js';
import { overrideDirectiveForWingOrder, perceptionForWingOrderCombatDoctrine } from './doctrine.js';
import { normalizeFactionBehaviorProfile } from './factionBehavior.js';
import { shouldOwnerThink } from '../core/activityScheduler.js';

const NORMALIZED_ROSTER_FLAG = '__spacefaceNormalizedAIRoster';
const ROSTER_SIGNATURE_FLAG = '__spacefaceRosterSignature';
const DOCTRINE_REFRESH_TICKS = 3;

/**
 * Five-layer SG-06 tactical AI host.
 *
 * The host deliberately has no authoritative world object. Its only knowledge of ships, targets,
 * tethers, objectives, and hazards arrives through ports.sensors.frameFor() and PerceptionMemory.
 * Combat actions are enumerated and invoked exclusively through the SG-03 action port. Physical
 * control leaves through the SG-02 maneuver port as normalized force/torque requests.
 */
export class TacticalAIStack {
  constructor({ seed = 1, ports, config = {} } = {}) {
    this.seed = (Number(seed) >>> 0) || 1;
    this.ports = assertAIPorts(ports);
    const traceConfig = config.trace === undefined ? { enabled: true, layers: ['behavior'], capacity: 512 } : (config.trace || {});
    this.trace = config.trace instanceof ExplainabilityTrace
      ? config.trace
      : new ExplainabilityTrace(traceConfig);
    this.freezeResults = config.freezeResults !== false;
    const activeTrace = this.trace && this.trace.enabled ? this.trace : null;
    this.memory = new PerceptionMemory({ ...(config.perception || {}), trace: traceForLayer(activeTrace, TraceLayer.PERCEPTION), freezeResults: this.freezeResults });
    this.director = new EncounterDirector({
      config: { ...(config.director || {}), freezeResults: this.freezeResults },
      trace: traceForLayer(activeTrace, TraceLayer.DIRECTOR),
      encounterPort: this.ports.encounter || null,
    });
    this.commander = new SquadCommander({ seed: this.seed, trace: traceForLayer(activeTrace, TraceLayer.SQUAD), config: { ...(config.squad || {}), freezeResults: this.freezeResults } });
    this.selector = new ShipUtilitySelector({ trace: traceForLayer(activeTrace, TraceLayer.UTILITY), config: { ...(config.utility || {}), freezeResults: this.freezeResults } });
    this.executor = new BehaviorExecutor({ actionPort: this.ports.actions, trace: traceForLayer(activeTrace, TraceLayer.BEHAVIOR), config: { ...(config.behavior || {}), freezeResults: this.freezeResults } });
    const maneuverConfig = { ...(config.maneuver || {}), freezeResults: this.freezeResults };
    if (!this.freezeResults && maneuverConfig.includeTrajectory === undefined) maneuverConfig.includeTrajectory = false;
    this.maneuver = new ManeuverPlanner({ seed: this.seed, trace: traceForLayer(activeTrace, TraceLayer.MANEUVER), config: maneuverConfig });
    this.combatDoctrine = new CombatDoctrineRuntime({ seed: this.seed });
    const runtimeConfig = config.runtime && typeof config.runtime === 'object' ? config.runtime : {};
    this.memberBatchSize = normalizeOptionalPositiveInt(runtimeConfig.memberBatchSize);
    this.memberBatchTargetTicks = normalizePositiveInt(runtimeConfig.memberBatchTargetTicks, 1);
    this.memberBatchSpreadTicks = normalizePositiveInt(runtimeConfig.memberBatchSpreadTicks, 1);
    this.memberBatchEnabled = !!this.memberBatchSize || this.memberBatchTargetTicks > 1;
    this.memberCursor = 0;
    this.perceptionCache = new Map();
    this.lastDecisionByEntity = new Map();
    this.perceptionsByEntityScratch = new Map();
    this.orderedMemberScratch = [];
    this.refreshMemberIdsScratch = [];
    this.liveSensorBatchOptions = { ephemeral: true };
    this.seenMemberScratch = new Set();
    this.activeMemberScratch = new Set();
    this.resultSquadsScratch = [];
    this.resultDecisionsScratch = [];
    this.actionContextScratch = { tick: 0, perception: null, directive: null };
    this.liveSquadScratch = new Set();
    this.liveEntityScratch = new Set();
    this.squadSignatures = new Map();
    this.entitySquad = new Map();
    this.lastTick = -1;
    this.lastResult = null;
  }

  update(tick, authoredEncounter = {}) {
    if (!Number.isInteger(tick) || tick < 0) throw new RangeError('AI tick must be a non-negative integer');
    if (tick <= this.lastTick) throw new RangeError(`AI tick must advance monotonically (last=${this.lastTick}, next=${tick})`);
    this.lastTick = tick;

    const rosterSource = !this.freezeResults && typeof this.ports.roster.liveListSquads === 'function'
      ? this.ports.roster.liveListSquads(tick)
      : this.ports.roster.listSquads(tick);
    const roster = normalizeRoster(rosterSource, this.freezeResults);
    this._syncRoster(roster);

    const perceptionsByEntity = this.perceptionsByEntityScratch;
    perceptionsByEntity.clear();
    const orderedMembers = uniqueMembers(roster, roster[NORMALIZED_ROSTER_FLAG] === true, this.orderedMemberScratch, this.seenMemberScratch);
    const activeMembers = this.memberBatchEnabled ? this._activeDecisionMembers(orderedMembers, tick) : null;
    let liveFrames = null;
    if (!this.freezeResults && typeof this.ports.sensors.liveFramesFor === 'function') {
      const refreshIds = this.refreshMemberIdsScratch;
      refreshIds.length = 0;
      for (const member of orderedMembers) {
        const cached = this.memberBatchEnabled ? this.perceptionCache.get(member.id) : null;
        if (!this.memberBatchEnabled || !cached || memberRefreshDue(member, tick, activeMembers)) refreshIds.push(member.id);
      }
      liveFrames = this.ports.sensors.liveFramesFor(refreshIds, tick, this.liveSensorBatchOptions);
    }
    for (const member of orderedMembers) {
      let perception = this.memberBatchEnabled ? this.perceptionCache.get(member.id) : null;
      if (!this.memberBatchEnabled || !perception || memberRefreshDue(member, tick, activeMembers)) {
        const frame = liveFrames && liveFrames.has(member.id)
          ? liveFrames.get(member.id)
          : !this.freezeResults && typeof this.ports.sensors.liveFrameFor === 'function'
            ? this.ports.sensors.liveFrameFor(member.id, tick)
          : this.ports.sensors.frameFor(member.id, tick);
        perception = this.memory.observe(member.id, frame, tick);
        if (this.memberBatchEnabled) this.perceptionCache.set(member.id, perception);
      }
      perceptionsByEntity.set(member.id, perception);
    }

    const freeze = this.freezeResults ? Object.freeze : identity;
    const telemetry = aggregatePerceivedTelemetry(perceptionsByEntity.values(), freeze);
    const director = this.director.update(tick, telemetry, authoredEncounter || {});
    const squads = this.freezeResults ? [] : this.resultSquadsScratch;
    const decisions = this.freezeResults ? [] : this.resultDecisionsScratch;
    squads.length = 0;
    decisions.length = 0;

    for (const squadDef of roster) {
      const squadResult = this.commander.update(squadDef.id, tick, perceptionsByEntity, director);
      squads.push(freeze({
        squadId: squadResult.squadId,
        tick: squadResult.tick,
        tactic: squadResult.tactic,
        focusTargetId: squadResult.focusTargetId,
        directives: freeze([...squadResult.directives.values()]),
      }));
      for (const member of squadDef.members) {
        const perception = perceptionsByEntity.get(member.id);
        const squadDirective = squadResult.directives.get(member.id);
        if (!perception || !squadDirective) continue;
        const directive = overrideDirectiveForWingOrder(squadDirective, perception, freeze);
        const doctrineId = normalizeCombatDoctrineId(directive.combatDoctrineId, perception.self && perception.self.combatDoctrineId);
        const retreatOrdered = directive.objective && directive.objective.kind === ObjectiveKind.RETREAT;
        const objectiveKind = directive.objective && directive.objective.kind;
        const combatOrdered = objectiveKind === ObjectiveKind.ENGAGE
          || objectiveKind === ObjectiveKind.FOCUS
          || objectiveKind === ObjectiveKind.TUG;
        // Squad allocation owns the number and kind of committed attackers. Running a combat
        // doctrine for an overflow SCREEN/HOLD member used to replace that reserve objective with
        // FOCUS, allowing ordinary gunners to consume the attacker cap ahead of a specialist.
        if (!combatOrdered && doctrineId) this.combatDoctrine.forget(member.id);
        const doctrinePerception = perceptionForWingOrderCombatDoctrine(perception, directive, freeze);
        const combatDoctrine = doctrineId && combatOrdered ? this.combatDoctrine.update({
          tick, entityId: member.id, doctrineId, perception: doctrinePerception, directive,
        }) : null;
        const priorDecision = this.lastDecisionByEntity.get(member.id);
        if (this.memberBatchEnabled && !retreatOrdered && !memberRefreshDue(member, tick, activeMembers)
          && priorDecision && !doctrineDecisionChanged(priorDecision.combatDoctrine, combatDoctrine)) {
          const cached = retickDecision(priorDecision, tick, combatDoctrine);
          this.ports.maneuver.request(cached.maneuver);
          decisions.push(cached);
          continue;
        }
        const effectiveDirective = combatDoctrine ? overrideDirectiveForCombatDoctrine(directive, combatDoctrine) : directive;
        const actionDefs = this.ports.actions.list(member.id, this._actionContext(tick, perception, effectiveDirective)) || [];
        const current = !this.freezeResults && typeof this.executor.current === 'function'
          ? this.executor.current(member.id)
          : this.executor.inspect(member.id);
        const selected = this.selector.select({
          tick,
          entityId: member.id,
          perception,
          directive: effectiveDirective,
          actionDefs,
          current,
          combatDoctrine,
        });
        const behavior = this.executor.update({ tick, entityId: member.id, selected, directive: effectiveDirective, perception });
        const request = this.maneuver.plan({ tick, entityId: member.id, perception, behavior, directive: effectiveDirective });
        this.ports.maneuver.request(request);
        const decision = freeze({
          entityId: member.id,
          squadId: squadDef.id,
          directive: effectiveDirective,
          action: behavior,
          maneuver: request,
          combatDoctrine,
        });
        if (this.memberBatchEnabled) this.lastDecisionByEntity.set(member.id, decision);
        decisions.push(decision);
      }
    }

    const resultSquads = this.freezeResults ? squads.slice() : squads;
    const resultDecisions = this.freezeResults ? decisions.sort(compareDecisionEntity) : decisions;
    const result = freeze({
      version: AI_CONTRACT_VERSION,
      tick,
      director,
      telemetry,
      squads: freeze(resultSquads),
      decisions: freeze(resultDecisions),
    });
    this.lastResult = result;
    return result;
  }

  inspect(query = {}) {
    const entityId = query.entityId;
    const squadId = query.squadId;
    const traceQuery = query.trace || {};
    return Object.freeze({
      version: AI_CONTRACT_VERSION,
      tick: this.lastTick,
      dependencyContract: Object.freeze({
        sensors: 'sensor frames only',
        actions: 'SG-03 ActionDef port only',
        maneuver: 'SG-02 physical request port only',
      }),
      director: this.director.inspect(),
      squads: squadId == null ? this.commander.inspect() : this.commander.inspect(squadId),
      perception: entityId == null ? this.memory.inspect() : this.memory.inspect(entityId),
      behavior: entityId == null ? this.executor.inspect() : this.executor.inspect(entityId),
      maneuver: entityId == null ? this.maneuver.inspect() : this.maneuver.inspect(entityId),
      combatDoctrine: this.combatDoctrine.inspect(entityId),
      trace: this.trace.query({
        ...traceQuery,
        entityId: entityId === undefined ? traceQuery.entityId : entityId,
        squadId: squadId === undefined ? traceQuery.squadId : squadId,
      }),
      lastResult: this.lastResult,
    });
  }

  forgetEntity(entityId) {
    this.memory.forgetEntity(entityId);
    this.executor.forget(entityId);
    this.maneuver.forget(entityId);
    this.combatDoctrine.forget(entityId);
    this.perceptionCache.delete(entityId);
    this.lastDecisionByEntity.delete(entityId);
    this.entitySquad.delete(entityId);
  }

  _activeDecisionMembers(orderedMembers, tick) {
    const selected = this.activeMemberScratch;
    selected.clear();
    const count = orderedMembers.length;
    if (count === 0) {
      this.memberCursor = 0;
      return selected;
    }
    const configured = this.memberBatchSize || Math.ceil(count / this.memberBatchTargetTicks);
    const batchSize = Math.max(1, Math.min(count, configured));
    if (this.memberBatchSpreadTicks > 1 && this.memberBatchSize) {
      const phase = tick % this.memberBatchSpreadTicks;
      if (phase < batchSize) selected.add(orderedMembers[(this.memberCursor + phase) % count].id);
      if (phase === this.memberBatchSpreadTicks - 1) {
        this.memberCursor = (this.memberCursor + batchSize) % count;
      }
      return this._sleepInactiveMembers(selected, orderedMembers, tick);
    }
    if (batchSize >= count) {
      this.memberCursor = 0;
      for (const member of orderedMembers) selected.add(member.id);
      return this._sleepInactiveMembers(selected, orderedMembers, tick);
    }
    for (let offset = 0; offset < batchSize; offset++) {
      selected.add(orderedMembers[(this.memberCursor + offset) % count].id);
    }
    this.memberCursor = (this.memberCursor + batchSize) % count;
    this._sleepInactiveMembers(selected, orderedMembers, tick);
    return selected;
  }

  _sleepInactiveMembers(selected, orderedMembers, tick) {
    const player = this.ports && this.ports.world && typeof this.ports.world.player === 'function'
      ? this.ports.world.player()
      : null;
    const origin = player && player.pos ? player.pos : null;
    const playerId = player && player.id;
    const playerTeam = player && player.team;
    for (const member of orderedMembers) {
      if (!selected.has(member.id)) continue;
      if (normalizeCombatDoctrineId(member.combatDoctrineId) != null) continue;
      const owner = {
        id: member.id,
        isPlayer: member.id === playerId,
        team: member.team,
        alive: member.alive !== false,
        pos: member.pos || (member.self && member.self.pos) || null,
        ai: { combatant: !!member.combatDoctrineId, passive: member.passive === true },
      };
      if (!shouldOwnerThink(tick, owner, {
        playerId,
        playerTeam,
        origin,
        authorityRadius: 1400,
        sleepPeriodTicks: 8,
        activePeriodTicks: 1,
      })) {
        selected.delete(member.id);
      }
    }
    return selected;
  }

  _actionContext(tick, perception, directive) {
    if (this.freezeResults) return Object.freeze({ tick, perception, directive });
    const context = this.actionContextScratch;
    context.tick = tick;
    context.perception = perception;
    context.directive = directive;
    return context;
  }

  _syncRoster(roster) {
    const liveSquads = this.liveSquadScratch;
    const liveEntities = this.liveEntityScratch;
    liveSquads.clear();
    liveEntities.clear();

    // Production roster entries already carry exact signatures. When both membership maps still
    // match, avoid re-registering every entity on every tactical decision. Validate duplicates and
    // stale map entries before returning so the fast path preserves the full sync's fail-closed
    // behavior for malformed or changed rosters.
    let stable = roster[NORMALIZED_ROSTER_FLAG] === true
      && roster.length === this.squadSignatures.size;
    if (stable) {
      rosterLoop: for (const squad of roster) {
        const signature = squad && squad[ROSTER_SIGNATURE_FLAG];
        if (liveSquads.has(squad.id)
          || typeof signature !== 'string'
          || this.squadSignatures.get(squad.id) !== signature) {
          stable = false;
          break;
        }
        liveSquads.add(squad.id);
        for (const member of squad.members) {
          if (liveEntities.has(member.id) || this.entitySquad.get(member.id) !== squad.id) {
            stable = false;
            break rosterLoop;
          }
          liveEntities.add(member.id);
        }
      }
      if (stable && liveEntities.size === this.entitySquad.size) return;
    }

    liveSquads.clear();
    liveEntities.clear();
    for (const squad of roster) {
      liveSquads.add(squad.id);
      const signature = rosterSignature(squad);
      if (this.squadSignatures.get(squad.id) !== signature) {
        if (this.squadSignatures.has(squad.id)) this.commander.unregisterSquad(squad.id);
        this.commander.registerSquad(squad);
        this.squadSignatures.set(squad.id, signature);
      }
      for (const member of squad.members) {
        if (liveEntities.has(member.id)) throw new Error(`AI entity ${member.id} appears in more than one squad`);
        liveEntities.add(member.id);
        this.entitySquad.set(member.id, squad.id);
      }
    }
    for (const squadId of [...this.squadSignatures.keys()]) {
      if (liveSquads.has(squadId)) continue;
      this.commander.unregisterSquad(squadId);
      this.squadSignatures.delete(squadId);
    }
    for (const entityId of [...this.entitySquad.keys()]) {
      if (!liveEntities.has(entityId)) this.forgetEntity(entityId);
    }
  }
}

function normalizeRoster(value, freezeResults = true) {
  if (!Array.isArray(value)) throw new TypeError('ports.roster.listSquads() must return an array');
  if (value[NORMALIZED_ROSTER_FLAG] === true) return value;
  const freeze = freezeResults ? Object.freeze : identity;
  return value.map((squad, squadIndex) => {
    if (!squad || squad.id == null) throw new TypeError(`squad ${squadIndex} requires id`);
    if (!Array.isArray(squad.members) || squad.members.length === 0) throw new TypeError(`squad ${squad.id} requires members`);
    const members = squad.members.map((member, memberIndex) => {
      const normalized = (member != null && typeof member === 'object') ? member : { id: member };
      if (normalized.id == null) throw new TypeError(`squad ${squad.id} member ${memberIndex} requires id`);
      return freeze({
        id: normalized.id,
        preferredRole: normalized.preferredRole || null,
        capabilities: freeze(Array.isArray(normalized.capabilities) ? [...new Set(normalized.capabilities)].sort() : []),
        combatDoctrineId: normalizeCombatDoctrineId(normalized.combatDoctrineId),
        factionBehavior: normalizeFactionBehaviorProfile(normalized.factionBehavior),
      });
    });
    return freeze({
      id: squad.id,
      doctrine: squad.doctrine || 'balanced',
      faction: squad.faction || 'unknown',
      formation: squad.formation || 'wedge',
      formationSpacing: finitePositive(squad.formationSpacing, 72),
      formationBound: finitePositive(squad.formationBound, 170),
      factionBehavior: normalizeFactionBehaviorProfile(squad.factionBehavior),
      members: freeze(members),
    });
  }).sort((a, b) => stableId(a.id).localeCompare(stableId(b.id)));
}

function uniqueMembers(roster, alreadySorted = false, out = null, seen = null) {
  const members = out || [];
  const seenIds = seen || new Set();
  members.length = 0;
  seenIds.clear();
  for (const squad of roster) {
    for (const member of squad.members) {
      const key = stableId(member.id);
      if (seenIds.has(key)) continue;
      seenIds.add(key);
      members.push(member);
    }
  }
  return alreadySorted ? members : members.sort((a, b) => stableId(a.id).localeCompare(stableId(b.id)));
}

function rosterSignature(squad) {
  if (squad && typeof squad === 'object' && typeof squad[ROSTER_SIGNATURE_FLAG] === 'string') return squad[ROSTER_SIGNATURE_FLAG];
  return JSON.stringify({
    id: squad.id,
    doctrine: squad.doctrine,
    faction: squad.faction,
    formation: squad.formation,
    formationSpacing: squad.formationSpacing,
    formationBound: squad.formationBound,
    members: squad.members.map((member) => ({
      id: stableId(member.id),
      preferredRole: member.preferredRole,
      capabilities: member.capabilities,
      combatDoctrineId: member.combatDoctrineId,
      factionBehavior: member.factionBehavior,
    })),
  });
}

function finitePositive(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function identity(value) {
  return value;
}

function compareDecisionEntity(a, b) {
  const ak = stableId(a && a.entityId);
  const bk = stableId(b && b.entityId);
  return ak < bk ? -1 : (ak > bk ? 1 : 0);
}

function retickDecision(decision, tick, doctrine = decision && decision.combatDoctrine) {
  if (!decision || !decision.maneuver) return decision;
  const maneuver = retickManeuver(decision.maneuver, tick);
  const combatDoctrine = clearCachedDoctrineEdges(doctrine);
  if (maneuver === decision.maneuver && combatDoctrine === decision.combatDoctrine && decision.tick === tick) return decision;
  if (!Object.isFrozen(decision)) {
    decision.tick = tick;
    decision.maneuver = maneuver;
    decision.combatDoctrine = combatDoctrine;
    return decision;
  }
  return {
    ...decision,
    tick,
    maneuver,
    combatDoctrine,
  };
}

function doctrineDecisionChanged(previous, next) {
  if (!previous && !next) return false;
  if (!previous || !next) return true;
  return next.telegraphStarted === true
    || next.phaseChanged === true
    || previous.doctrineId !== next.doctrineId
    || previous.phase !== next.phase
    || previous.targetId !== next.targetId
    || previous.actionId !== next.actionId
    || previous.fireWindow !== next.fireWindow
    || previous.maneuverKind !== next.maneuverKind;
}

function clearCachedDoctrineEdges(doctrine) {
  if (!doctrine || (doctrine.telegraphStarted !== true && doctrine.phaseChanged !== true)) return doctrine;
  if (!Object.isFrozen(doctrine)) {
    doctrine.telegraphStarted = false;
    doctrine.phaseChanged = false;
    return doctrine;
  }
  return Object.freeze({ ...doctrine, telegraphStarted: false, phaseChanged: false });
}

function doctrineRefreshDue(member, tick) {
  if (!member || normalizeCombatDoctrineId(member.combatDoctrineId) == null) return false;
  const id = member.id;
  let bucket = 0;
  if (typeof id === 'number' && Number.isFinite(id)) {
    bucket = Math.abs(Math.floor(id)) % DOCTRINE_REFRESH_TICKS;
  } else {
    const text = stableId(id);
    let hash = 2166136261;
    for (let index = 0; index < text.length; index++) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    bucket = hash % DOCTRINE_REFRESH_TICKS;
  }
  return bucket === tick % DOCTRINE_REFRESH_TICKS;
}

function memberRefreshDue(member, tick, activeMembers) {
  return normalizeCombatDoctrineId(member && member.combatDoctrineId) != null
    ? doctrineRefreshDue(member, tick)
    : activeMembers.has(member.id);
}

function retickManeuver(request, tick) {
  if (!request || request.tick === tick) return request;
  if (!Object.isFrozen(request)) {
    request.tick = tick;
    return request;
  }
  const next = { ...request, tick };
  Object.defineProperty(next, NORMALIZED_THRUSTER_REQUEST_FLAG, { value: true });
  return next;
}

function normalizeOptionalPositiveInt(value) {
  if (value === undefined || value === null) return null;
  return normalizePositiveInt(value, null);
}

function normalizePositiveInt(value, fallback) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.floor(value));
}

function traceForLayer(trace, layer) {
  if (!trace || !trace.enabled) return null;
  if (trace.layers && !trace.layers.has(layer)) return null;
  return trace;
}
