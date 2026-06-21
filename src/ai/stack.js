import { AI_CONTRACT_VERSION, assertAIPorts, stableId } from './contracts.js';
import { EncounterDirector } from './director.js';
import { ManeuverPlanner } from './maneuver.js';
import { PerceptionMemory, aggregatePerceivedTelemetry } from './perception.js';
import { BehaviorExecutor, ShipUtilitySelector } from './shipDecision.js';
import { SquadCommander } from './squad.js';
import { ExplainabilityTrace } from './trace.js';

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
    this.trace = config.trace instanceof ExplainabilityTrace
      ? config.trace
      : new ExplainabilityTrace(config.trace || {});
    this.memory = new PerceptionMemory({ ...(config.perception || {}), trace: this.trace });
    this.director = new EncounterDirector({
      config: config.director || {},
      trace: this.trace,
      encounterPort: this.ports.encounter || null,
    });
    this.commander = new SquadCommander({ seed: this.seed, trace: this.trace, config: config.squad || {} });
    this.selector = new ShipUtilitySelector({ trace: this.trace, config: config.utility || {} });
    this.executor = new BehaviorExecutor({ actionPort: this.ports.actions, trace: this.trace, config: config.behavior || {} });
    this.maneuver = new ManeuverPlanner({ seed: this.seed, trace: this.trace, config: config.maneuver || {} });
    this.squadSignatures = new Map();
    this.entitySquad = new Map();
    this.lastTick = -1;
    this.lastResult = null;
  }

  update(tick, authoredEncounter = {}) {
    if (!Number.isInteger(tick) || tick < 0) throw new RangeError('AI tick must be a non-negative integer');
    if (tick <= this.lastTick) throw new RangeError(`AI tick must advance monotonically (last=${this.lastTick}, next=${tick})`);
    this.lastTick = tick;

    const roster = normalizeRoster(this.ports.roster.listSquads(tick));
    this._syncRoster(roster);

    const perceptionsByEntity = new Map();
    const orderedMembers = uniqueMembers(roster);
    for (const member of orderedMembers) {
      const frame = this.ports.sensors.frameFor(member.id, tick);
      perceptionsByEntity.set(member.id, this.memory.observe(member.id, frame, tick));
    }

    const telemetry = aggregatePerceivedTelemetry([...perceptionsByEntity.values()]);
    const director = this.director.update(tick, telemetry, authoredEncounter || {});
    const squads = [];
    const decisions = [];

    for (const squadDef of roster) {
      const squadResult = this.commander.update(squadDef.id, tick, perceptionsByEntity, director);
      squads.push(Object.freeze({
        squadId: squadResult.squadId,
        tick: squadResult.tick,
        tactic: squadResult.tactic,
        focusTargetId: squadResult.focusTargetId,
        directives: Object.freeze([...squadResult.directives.values()]),
      }));
      for (const member of squadDef.members) {
        const perception = perceptionsByEntity.get(member.id);
        const directive = squadResult.directives.get(member.id);
        if (!perception || !directive) continue;
        const actionDefs = this.ports.actions.list(member.id, Object.freeze({ tick, perception, directive })) || [];
        const current = this.executor.inspect(member.id);
        const selected = this.selector.select({
          tick,
          entityId: member.id,
          perception,
          directive,
          actionDefs,
          current,
        });
        const behavior = this.executor.update({ tick, entityId: member.id, selected, directive, perception });
        const request = this.maneuver.plan({ tick, entityId: member.id, perception, behavior, directive });
        this.ports.maneuver.request(request);
        decisions.push(Object.freeze({
          entityId: member.id,
          squadId: squadDef.id,
          directive,
          action: behavior,
          maneuver: request,
        }));
      }
    }

    const result = Object.freeze({
      version: AI_CONTRACT_VERSION,
      tick,
      director,
      telemetry,
      squads: Object.freeze(squads.slice()),
      decisions: Object.freeze(decisions.sort((a, b) => stableId(a.entityId).localeCompare(stableId(b.entityId)))),
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
    this.entitySquad.delete(entityId);
  }

  _syncRoster(roster) {
    const liveSquads = new Set();
    const liveEntities = new Set();
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

function normalizeRoster(value) {
  if (!Array.isArray(value)) throw new TypeError('ports.roster.listSquads() must return an array');
  return value.map((squad, squadIndex) => {
    if (!squad || squad.id == null) throw new TypeError(`squad ${squadIndex} requires id`);
    if (!Array.isArray(squad.members) || squad.members.length === 0) throw new TypeError(`squad ${squad.id} requires members`);
    const members = squad.members.map((member, memberIndex) => {
      const normalized = (member != null && typeof member === 'object') ? member : { id: member };
      if (normalized.id == null) throw new TypeError(`squad ${squad.id} member ${memberIndex} requires id`);
      return Object.freeze({
        id: normalized.id,
        preferredRole: normalized.preferredRole || null,
        capabilities: Object.freeze(Array.isArray(normalized.capabilities) ? [...new Set(normalized.capabilities)].sort() : []),
      });
    });
    return Object.freeze({
      id: squad.id,
      doctrine: squad.doctrine || 'balanced',
      faction: squad.faction || 'unknown',
      formation: squad.formation || 'wedge',
      formationSpacing: finitePositive(squad.formationSpacing, 72),
      formationBound: finitePositive(squad.formationBound, 170),
      members: Object.freeze(members),
    });
  }).sort((a, b) => stableId(a.id).localeCompare(stableId(b.id)));
}

function uniqueMembers(roster) {
  const out = [];
  const seen = new Set();
  for (const squad of roster) {
    for (const member of squad.members) {
      const key = stableId(member.id);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(member);
    }
  }
  return out.sort((a, b) => stableId(a.id).localeCompare(stableId(b.id)));
}

function rosterSignature(squad) {
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
    })),
  });
}

function finitePositive(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
