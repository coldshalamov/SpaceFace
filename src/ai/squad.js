import {
  ContactKind,
  ObjectiveKind,
  SquadRole,
  TraceLayer,
  clamp,
  distance2,
  hashUnit,
  saturate,
  stableId,
  wrapAngle,
} from './contracts.js';

const DEFAULTS = Object.freeze({
  formation: 'wedge',
  formationSpacing: 72,
  formationBound: 170,
  minTacticTicks: 120,
  switchMargin: 0.12,
  breakTicks: 90,
  formationTurnPerTick: 0.025,
});

export class SquadCommander {
  constructor({ seed = 1, trace = null, config = {} } = {}) {
    this.seed = seed >>> 0;
    this.trace = trace;
    this.config = Object.freeze({ ...DEFAULTS, ...config });
    this.squads = new Map();
  }

  registerSquad(definition) {
    if (!definition || definition.id == null) throw new TypeError('squad id is required');
    if (!Array.isArray(definition.members) || definition.members.length === 0) throw new TypeError('squad requires members');
    const members = definition.members.map((member, index) => normalizeMember(member, index));
    const state = {
      id: definition.id,
      doctrine: definition.doctrine || 'balanced',
      faction: definition.faction || 'unknown',
      formation: definition.formation || this.config.formation,
      formationSpacing: Number(definition.formationSpacing) || this.config.formationSpacing,
      formationBound: Number(definition.formationBound) || this.config.formationBound,
      members,
      roles: assignRoles(members),
      currentTactic: null,
      tacticSinceTick: -Infinity,
      focusTargetId: null,
      formationHeading: null,
      breakUntil: new Map(),
      breakReason: new Map(),
      lastDirectives: new Map(),
    };
    this.squads.set(definition.id, state);
    return this.inspect(definition.id);
  }

  unregisterSquad(squadId) {
    this.squads.delete(squadId);
  }

  update(squadId, tick, perceptionsByMember, director = null) {
    const squad = this.squads.get(squadId);
    if (!squad) throw new Error(`unknown squad: ${squadId}`);
    const perceptions = squad.members
      .map((member) => perceptionsByMember.get(member.id))
      .filter((value) => value && value.self);
    const contacts = mergeContacts(perceptions);
    const focus = selectFocusTarget(perceptions, contacts);
    squad.focusTargetId = focus ? focus.id : null;

    const candidates = this._tacticCandidates(squad, tick, perceptions, contacts, director);
    candidates.sort((a, b) => b.utility - a.utility || a.id.localeCompare(b.id));
    let selected = candidates[0];
    const current = candidates.find((candidate) => candidate.id === squad.currentTactic);
    const dwell = tick - squad.tacticSinceTick;
    if (current && dwell < this.config.minTacticTicks && selected.id !== current.id) selected = current;
    else if (current && selected.id !== current.id && selected.utility < current.utility + this.config.switchMargin) selected = current;
    if (selected.id !== squad.currentTactic) {
      squad.currentTactic = selected.id;
      squad.tacticSinceTick = tick;
    }

    const leader = chooseLeaderPerception(squad, perceptions);
    if (leader && leader.self) {
      squad.formationHeading = squad.formationHeading == null
        ? leader.self.rot
        : slewAngle(squad.formationHeading, leader.self.rot, this.config.formationTurnPerTick);
    }
    const directives = new Map();
    for (let index = 0; index < squad.members.length; index++) {
      const member = squad.members[index];
      const perception = perceptionsByMember.get(member.id) || null;
      const role = squad.roles.get(member.id);
      const explicitBreak = detectExplicitBreak(member.id, perception, director, selected.id, role);
      if (explicitBreak) {
        squad.breakUntil.set(member.id, tick + this.config.breakTicks);
        squad.breakReason.set(member.id, explicitBreak);
      }
      const breakFormation = (squad.breakUntil.get(member.id) || -1) >= tick;
      if (!breakFormation) squad.breakReason.delete(member.id);
      const formationSlot = formationSlotFor(squad, leader, index, squad.members.length);
      const objective = objectiveFor(selected.id, role, focus, contacts, perception);
      const directive = Object.freeze({
        tick,
        squadId,
        memberId: member.id,
        role,
        tactic: selected.id,
        focusTargetId: focus ? focus.id : null,
        objective,
        formation: Object.freeze({
          kind: squad.formation,
          slot: Object.freeze(formationSlot),
          velocity: Object.freeze({
            x: leader && leader.self ? leader.self.vel.x : 0,
            z: leader && leader.self ? leader.self.vel.z : 0,
          }),
          bound: squad.formationBound,
          breakFormation,
          breakReason: breakFormation ? squad.breakReason.get(member.id) || 'explicit_break' : null,
        }),
      });
      directives.set(member.id, directive);
      squad.lastDirectives.set(member.id, directive);
    }

    if (this.trace) {
      this.trace.emit({
        tick,
        layer: TraceLayer.SQUAD,
        squadId,
        decision: 'select_tactic_and_orders',
        selected: {
          id: selected.id,
          utility: selected.utility,
          focusTargetId: focus ? focus.id : null,
          formation: squad.formation,
        },
        candidates,
        context: {
          doctrine: squad.doctrine,
          members: squad.members.map((member) => ({ id: member.id, role: squad.roles.get(member.id) })),
          hostileContacts: contacts.filter((contact) => contact.hostileVotes > 0).length,
          tetherContacts: contacts.filter((contact) => contact.kind === ContactKind.TETHER).length,
          directorPhase: director && director.phase,
        },
      });
    }

    return Object.freeze({
      squadId,
      tick,
      tactic: selected.id,
      focusTargetId: focus ? focus.id : null,
      directives,
    });
  }

  _tacticCandidates(squad, tick, perceptions, contacts, director) {
    const capabilities = capabilitySet(squad, perceptions);
    const hostileShips = contacts.filter((contact) => contact.kind === ContactKind.SHIP && contact.hostileVotes > 0);
    const objectives = contacts.filter((contact) => contact.kind === ContactKind.OBJECTIVE);
    const exposedTether = contacts.some((contact) => contact.kind === ContactKind.TETHER && contact.exposed && contact.confidence >= 0.55 && (contact.ownedBySelf || contact.tags.includes('owned_by_self') || contact.tags.includes('cuttable_by_self')));
    const memberTethered = perceptions.some((perception) => perception.self.tethered);
    const lowHull = average(perceptions.map((perception) => 1 - perception.self.hullFraction));
    const disabled = average(perceptions.map((perception) => perception.self.disabled ? 1 : 0));
    const outnumbered = saturate((hostileShips.length - perceptions.length) / Math.max(1, perceptions.length));
    const jitter = (id) => hashUnit(this.seed, squad.id, id, Math.floor(tick / 600)) * 0.08;
    const candidates = [];
    const push = (id, utility, reason) => candidates.push({ id, utility: saturate(utility + jitter(id)), reason });

    push('hold_formation', hostileShips.length ? 0.18 : 0.56, 'maintain cohesion while contact picture is weak');
    push('swarm_pincer', hostileShips.length ? 0.48 + (squad.doctrine === 'scavenger' ? 0.22 : 0) : 0, 'split attack vectors around a perceived focus target');
    push('standoff_focus', hostileShips.length && capabilities.has('ranged') ? 0.5 + (squad.doctrine === 'official' ? 0.2 : 0) : 0, 'concentrate ranged actions while preserving formation');
    push('screen_tug_steal', objectives.length && (capabilities.has('tug') || capabilities.has('steal')) ? 0.62 + objectives[0].objectiveValue * 0.2 : 0, 'screen a specialist while contesting the objective');
    push('contain_and_disable', hostileShips.length && capabilities.has('disable') ? 0.55 + (squad.doctrine === 'official' ? 0.14 : 0) : 0, 'official wing disables mobility before capture');
    push('cut_and_scatter', exposedTether && capabilities.has('counter_tether_cut') ? 0.92 : 0, 'exposed hostile tether can be severed');
    push('overload_and_break', memberTethered && capabilities.has('counter_tether_overload') ? 0.96 : 0, 'tethered member has energy and overload capability');
    push('fighting_retreat', director && director.command && director.command.type === 'order_retreat' ? 1 : lowHull * 0.62 + disabled * 0.5 + outnumbered * 0.35, 'explicit director retreat or observed wing attrition');
    return candidates;
  }

  inspect(squadId = null) {
    if (squadId != null) {
      const squad = this.squads.get(squadId);
      return squad ? freezeSquad(squad) : null;
    }
    const out = {};
    for (const id of [...this.squads.keys()].sort(idSort)) out[String(id)] = freezeSquad(this.squads.get(id));
    return Object.freeze(out);
  }
}

function normalizeMember(member, index) {
  if (!member || member.id == null) throw new TypeError(`squad member ${index} requires id`);
  return Object.freeze({
    id: member.id,
    preferredRole: member.preferredRole || null,
    capabilities: Object.freeze(Array.isArray(member.capabilities) ? [...new Set(member.capabilities)].sort() : []),
  });
}

function assignRoles(members) {
  const roles = new Map();
  const unassigned = members.slice();
  const leader = unassigned.shift();
  roles.set(leader.id, SquadRole.LEADER);
  const claim = (role, capability) => {
    const index = unassigned.findIndex((member) => member.preferredRole === role || member.capabilities.includes(capability));
    if (index >= 0) roles.set(unassigned.splice(index, 1)[0].id, role);
  };
  claim(SquadRole.TUG, 'tug');
  claim(SquadRole.THIEF, 'steal');
  claim(SquadRole.SCREEN, 'screen');
  claim(SquadRole.SUPPORT, 'ranged');
  for (const member of unassigned) roles.set(member.id, SquadRole.STRIKER);
  return roles;
}

function mergeContacts(perceptions) {
  const merged = new Map();
  for (const perception of perceptions) {
    for (const contact of perception.contacts) {
      const key = `${contact.kind}|${stableId(contact.id)}`;
      let record = merged.get(key);
      if (!record) {
        record = {
          ...contact,
          confidenceTotal: 0,
          confidenceSamples: 0,
          hostileVotes: 0,
          friendlyVotes: 0,
        };
        merged.set(key, record);
      }
      record.confidenceTotal += contact.confidence;
      record.confidenceSamples++;
      if (contact.team != null && contact.team !== perception.self.team) record.hostileVotes++;
      else if (contact.team != null) record.friendlyVotes++;
      if (contact.confidence > record.confidence) Object.assign(record, contact);
    }
  }
  const out = [];
  for (const record of merged.values()) {
    record.confidence = saturate(record.confidenceTotal / Math.max(1, record.confidenceSamples));
    out.push(Object.freeze(record));
  }
  out.sort((a, b) => `${a.kind}|${stableId(a.id)}`.localeCompare(`${b.kind}|${stableId(b.id)}`));
  return out;
}

function selectFocusTarget(perceptions, contacts) {
  let best = null;
  let bestScore = -Infinity;
  for (const contact of contacts) {
    if (contact.kind !== ContactKind.SHIP || contact.hostileVotes <= contact.friendlyVotes) continue;
    let distanceScore = 0;
    for (const perception of perceptions) distanceScore += 1 / (1 + distance2(perception.self.pos, contact.pos) / 500);
    const score = contact.confidence * 0.25 + contact.threat * 0.4 + distanceScore / Math.max(1, perceptions.length) * 0.25 + (contact.tethered ? 0.1 : 0);
    if (score > bestScore || (score === bestScore && stableId(contact.id) < stableId(best && best.id))) {
      bestScore = score;
      best = contact;
    }
  }
  return best;
}

function chooseLeaderPerception(squad, perceptions) {
  const leaderId = squad.members[0].id;
  return perceptions.find((perception) => perception.self.id === leaderId) || perceptions[0] || null;
}

function formationSlotFor(squad, leaderPerception, index, count) {
  const leader = leaderPerception && leaderPerception.self;
  const base = leader ? leader.pos : { x: 0, z: 0 };
  const rot = Number.isFinite(squad.formationHeading) ? squad.formationHeading : (leader ? leader.rot : 0);
  if (index === 0) return { x: base.x, z: base.z };
  const spacing = squad.formationSpacing;
  let localX = 0, localZ = 0;
  if (squad.formation === 'line') {
    localX = (index - (count - 1) / 2) * spacing;
    localZ = -spacing;
  } else if (squad.formation === 'ring') {
    const angle = (index - 1) / Math.max(1, count - 1) * Math.PI * 2;
    localX = Math.cos(angle) * spacing;
    localZ = Math.sin(angle) * spacing;
  } else {
    const rank = Math.ceil(index / 2);
    const side = index % 2 === 0 ? 1 : -1;
    localX = side * rank * spacing * 0.72;
    localZ = -rank * spacing;
  }
  const c = Math.cos(rot), s = Math.sin(rot);
  return { x: base.x + c * localZ - s * localX, z: base.z + s * localZ + c * localX };
}

function objectiveFor(tactic, role, focus, contacts, perception) {
  const objective = contacts
    .filter((contact) => contact.kind === ContactKind.OBJECTIVE)
    .sort((a, b) => b.objectiveValue - a.objectiveValue || stableId(a.id).localeCompare(stableId(b.id)))[0] || null;
  const tether = contacts
    .filter((contact) => contact.kind === ContactKind.TETHER)
    .sort((a, b) => Number(b.exposed) - Number(a.exposed) || b.confidence - a.confidence)[0] || null;

  if (tactic === 'fighting_retreat') return freezeObjective(ObjectiveKind.RETREAT, null, 'director_or_attrition');
  if (tactic === 'cut_and_scatter') return freezeObjective(role === SquadRole.SUPPORT || role === SquadRole.STRIKER ? ObjectiveKind.COUNTER_TETHER_CUT : ObjectiveKind.SCREEN, tether && tether.id, 'exposed_tether');
  if (tactic === 'overload_and_break') return freezeObjective(perception && perception.self.tethered ? ObjectiveKind.COUNTER_TETHER_OVERLOAD : ObjectiveKind.SCREEN, tether && tether.id, 'tethered_member');
  if (tactic === 'screen_tug_steal') {
    if (role === SquadRole.TUG) return freezeObjective(ObjectiveKind.TUG, objective && objective.id, 'assigned_tug');
    if (role === SquadRole.THIEF) return freezeObjective(ObjectiveKind.STEAL, objective && objective.id, 'assigned_thief');
    return freezeObjective(ObjectiveKind.SCREEN, objective && objective.id, 'protect_specialist');
  }
  if (tactic === 'hold_formation') return freezeObjective(ObjectiveKind.HOLD, null, 'weak_contact_picture');
  if (tactic === 'contain_and_disable') return freezeObjective(ObjectiveKind.ENGAGE, focus && focus.id, 'disable_focus');
  return freezeObjective(ObjectiveKind.FOCUS, focus && focus.id, tactic);
}

function freezeObjective(kind, targetId, reason) {
  return Object.freeze({ kind, targetId: targetId == null ? null : targetId, reason });
}

function detectExplicitBreak(memberId, perception, director, tactic, role) {
  if (director && director.command && director.command.type === 'order_retreat') return 'director_retreat';
  if (perception && perception.self.disabled) return 'member_disabled';
  if (tactic === 'fighting_retreat') return 'fighting_retreat';
  if (tactic === 'swarm_pincer' && role !== SquadRole.LEADER && role !== SquadRole.SCREEN) return 'pincer_attack';
  if (tactic === 'screen_tug_steal' && (role === SquadRole.TUG || role === SquadRole.THIEF)) return 'objective_run';
  if (tactic === 'cut_and_scatter' && (role === SquadRole.SUPPORT || role === SquadRole.STRIKER)) return 'counter_tether_cut';
  if (perception && perception.self.tethered && tactic === 'overload_and_break') return 'counter_tether';
  if (perception && perception.events.some((event) => event.type === 'formation_break' && (event.targetId == null || event.targetId === memberId))) return 'authored_break';
  return null;
}

function capabilitySet(squad, perceptions) {
  const out = new Set();
  for (const member of squad.members) for (const capability of member.capabilities) out.add(capability);
  for (const perception of perceptions) for (const capability of perception.self.capabilities) out.add(capability);
  return out;
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function freezeSquad(squad) {
  return Object.freeze({
    id: squad.id,
    doctrine: squad.doctrine,
    faction: squad.faction,
    formation: squad.formation,
    formationBound: squad.formationBound,
    currentTactic: squad.currentTactic,
    tacticSinceTick: squad.tacticSinceTick,
    focusTargetId: squad.focusTargetId,
    formationHeading: squad.formationHeading,
    members: Object.freeze(squad.members.map((member) => Object.freeze({ ...member, role: squad.roles.get(member.id) }))),
    directives: Object.freeze([...squad.lastDirectives.values()]),
  });
}

function slewAngle(current, target, maxStep) {
  const delta = wrapAngle(target - current);
  return wrapAngle(current + clamp(delta, -maxStep, maxStep));
}

function idSort(a, b) {
  return stableId(a).localeCompare(stableId(b));
}
