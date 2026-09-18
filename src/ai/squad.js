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
import { normalizeCombatDoctrineId } from './combatDoctrine.js';
import { normalizeFactionBehaviorProfile } from './factionBehavior.js';
import { TWIST_CLAUSES, WING_COMPOSITION_GRAMMAR } from '../data/combatDefs.js';

const DEFAULTS = Object.freeze({
  formation: 'wedge',
  formationSpacing: 72,
  formationBound: 170,
  // Four top-level transitions is the absolute ten-second readability budget. A 150-tick dwell
  // keeps normal tactic changes within that budget while urgent retreat remains immediate.
  minTacticTicks: 150,
  switchMargin: 0.12,
  breakTicks: 90,
  formationTurnPerTick: 0.025,
});

export class SquadCommander {
  constructor({ seed = 1, trace = null, config = {} } = {}) {
    this.seed = seed >>> 0;
    this.trace = trace;
    this.config = Object.freeze({ ...DEFAULTS, ...config });
    this.freeze = config.freezeResults === false ? identity : Object.freeze;
    this.squads = new Map();
  }

  registerSquad(definition) {
    if (!definition || definition.id == null) throw new TypeError('squad id is required');
    if (!Array.isArray(definition.members) || definition.members.length === 0) throw new TypeError('squad requires members');
    const members = definition.members.map((member, index) => normalizeMember(member, index));
    const factionBehavior = normalizeFactionBehaviorProfile(definition.factionBehavior)
      || members.map((member) => member.factionBehavior).find(Boolean)
      || null;
    const state = {
      id: definition.id,
      doctrine: definition.doctrine || 'balanced',
      faction: definition.faction || 'unknown',
      formation: factionBehavior ? factionBehavior.liveFormation : (definition.formation || this.config.formation),
      formationSpacing: Number(definition.formationSpacing) || this.config.formationSpacing,
      formationBound: Number(definition.formationBound) || this.config.formationBound,
      members,
      factionBehavior,
      roles: assignRoles(members),
      composition: resolveWingComposition(definition.id, members, this.seed),
      currentTactic: null,
      tacticSinceTick: -Infinity,
      focusTargetId: null,
      formationHeading: null,
      breakUntil: new Map(),
      breakReason: new Map(),
      lastDirectives: new Map(),
      perceptionsScratch: [],
      contactMergeScratch: new Map(),
      contactsScratch: [],
      tacticCandidatesScratch: [],
      capabilityScratch: new Set(),
      targetAssignmentsScratch: new Map(),
      targetLoadScratch: new Map(),
      hostileTargetsScratch: [],
      assignmentMembersScratch: [],
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
    const perceptions = squad.perceptionsScratch;
    perceptions.length = 0;
    for (const member of squad.members) {
      const perception = perceptionsByMember.get(member.id);
      if (perception && perception.self) perceptions.push(perception);
    }
    const contacts = mergeContacts(perceptions, this.freeze, squad.contactMergeScratch, squad.contactsScratch);
    const focus = selectFocusTarget(perceptions, contacts);
    squad.focusTargetId = focus ? focus.id : null;

    const candidates = this._tacticCandidates(squad, tick, perceptions, contacts, director);
    applyTwistWeights(squad, candidates);
    candidates.sort((a, b) => b.utility - a.utility || a.id.localeCompare(b.id));
    let selected = candidates[0];
    const current = candidates.find((candidate) => candidate.id === squad.currentTactic);
    const dwell = tick - squad.tacticSinceTick;
    const urgentRetreat = (director && director.command && director.command.type === 'order_retreat')
      || profileRetreatRequired(squad, perceptions);
    if (!urgentRetreat && current && dwell < this.config.minTacticTicks && selected.id !== current.id) selected = current;
    else if (!urgentRetreat && current && selected.id !== current.id && selected.utility < current.utility + this.config.switchMargin) selected = current;
    if (selected.id !== squad.currentTactic) {
      squad.currentTactic = selected.id;
      squad.tacticSinceTick = tick;
    }
    const targetAssignments = allocateCombatTargets(squad, selected.id, contacts, focus);

    const leader = chooseLeaderPerception(squad, perceptions);
    if (leader && leader.self) {
      squad.formationHeading = squad.formationHeading == null
        ? leader.self.rot
        : slewAngle(squad.formationHeading, leader.self.rot, this.config.formationTurnPerTick);
    }
    const bestObjective = selectObjectiveContact(contacts);
    const bestTether = selectTetherContact(contacts);
    const directives = new Map();
    const freeze = this.freeze;
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
      const allocationActive = targetAssignments !== null && targetAssignments.has(member.id);
      const assignedTarget = allocationActive ? targetAssignments.get(member.id) : null;
      const objective = objectiveFor(selected.id, role, focus, bestObjective, bestTether, perception,
        assignedTarget, allocationActive, freeze);
      const directive = freeze({
        tick,
        squadId,
        memberId: member.id,
        combatDoctrineId: member.combatDoctrineId,
        factionBehavior: member.factionBehavior || squad.factionBehavior,
        role,
        wingRole: squad.composition ? squad.composition.roles.get(member.id) || null : null,
        twist: squad.composition ? squad.composition.twist : null,
        tactic: selected.id,
        focusTargetId: focus ? focus.id : null,
        objective,
        formation: freeze({
          kind: squad.formation,
          slot: freeze(formationSlot),
          velocity: freeze({
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

    return freeze({
      squadId,
      tick,
      tactic: selected.id,
      focusTargetId: focus ? focus.id : null,
      directives,
    });
  }

  _tacticCandidates(squad, tick, perceptions, contacts, director) {
    const capabilities = capabilitySet(squad, perceptions, squad.capabilityScratch);
    let hostileShips = 0;
    let objectives = 0;
    let firstObjectiveValue = 0;
    let exposedTether = false;
    let memberTetheredOverloads = false;
    for (const contact of contacts) {
      if (contact.kind === ContactKind.SHIP && contact.hostileVotes > 0) hostileShips++;
      else if (contact.kind === ContactKind.OBJECTIVE) {
        if (objectives === 0) firstObjectiveValue = contact.objectiveValue || 0;
        objectives++;
      } else if (contact.kind === ContactKind.TETHER) {
        if (!exposedTether && contact.exposed && contact.confidence >= 0.55 &&
          (contact.ownedBySelf || contact.tags.includes('owned_by_self') || contact.tags.includes('cuttable_by_self'))) {
          exposedTether = true;
        }
        // Only a line an overload dash can actually snap justifies diverting a member. A tether
        // whose break policy ignores ship thrust (the standard player Massline) never resolves
        // the objective, so the member must stay on ordinary combat orders instead.
        if (!memberTetheredOverloads && Array.isArray(contact.tags) && contact.tags.includes('overloadable')
          && squad.members.some((member) => member.id === contact.targetId || member.id === contact.ownerId)) {
          memberTetheredOverloads = true;
        }
      }
    }
    let lowHullTotal = 0;
    let disabledTotal = 0;
    for (const perception of perceptions) {
      lowHullTotal += 1 - perception.self.hullFraction;
      disabledTotal += perception.self.disabled ? 1 : 0;
    }
    const denom = Math.max(1, perceptions.length);
    const lowHull = lowHullTotal / denom;
    const disabled = disabledTotal / denom;
    const outnumbered = saturate((hostileShips - perceptions.length) / denom);
    const jitter = (id) => hashUnit(this.seed, squad.id, id, Math.floor(tick / 600)) * 0.08;
    const candidates = squad.tacticCandidatesScratch || (squad.tacticCandidatesScratch = []);
    candidates.length = 0;
    const push = (id, utility, reason) => candidates.push({ id, utility: saturate(utility + jitter(id)), reason });

    const profile = squad.factionBehavior;
    const pursuit = profile ? profile.pursuitCommitment : 0.5;
    const profileRetreat = profileRetreatRequired(squad, perceptions);
    push('hold_formation', (hostileShips ? 0.18 : 0.56) + (1 - pursuit) * 0.08, 'maintain cohesion while contact picture is weak');
    push('swarm_pincer', hostileShips ? 0.48 + (squad.doctrine === 'scavenger' ? 0.22 : 0) + pursuit * 0.16 : 0, 'split attack vectors around a perceived focus target');
    push('standoff_focus', hostileShips && capabilities.has('ranged') ? 0.5 + (squad.doctrine === 'official' ? 0.2 : 0) + (1 - pursuit) * 0.16 : 0, 'concentrate ranged actions while preserving formation');
    push('screen_tug_steal', objectives && (capabilities.has('tug') || capabilities.has('steal')) ? 0.62 + firstObjectiveValue * 0.2 : 0, 'screen a specialist while contesting the objective');
    push('contain_and_disable', !profileRetreat && hostileShips && capabilities.has('disable')
      ? 0.55 + (squad.doctrine === 'official' ? 0.14 : 0)
        + (profile && profile.disableThenRun ? 0.24 : 0)
        + (profile ? profile.disableChance * 0.2 : 0)
        + pursuit * 0.08
      : 0, profile && profile.destroyTarget === false
      ? 'sampled nonlethal doctrine prioritizes disabling mobility'
      : 'disable mobility before capture or egress');
    push('cut_and_scatter', exposedTether && capabilities.has('counter_tether_cut') ? 0.92 : 0, 'exposed hostile tether can be severed');
    push('overload_and_break', memberTetheredOverloads && capabilities.has('counter_tether_overload') ? 0.96 : 0, 'tethered member has energy and overload capability');
    // Survival cohorts still dodge, flank and break webs. Attrition cannot order them to
    // leave the arena indefinitely and strand a finite round with unreachable survivors.
    if (!perceptions.some(perception => perception.self.moraleImmune)) push('fighting_retreat', (director && director.command && director.command.type === 'order_retreat') || profileRetreat
      ? 1
      : lowHull * 0.62 + disabled * 0.5 + outnumbered * 0.35,
    profileRetreat ? 'sampled hull retreat threshold' : 'explicit director retreat or observed wing attrition');
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
    combatDoctrineId: normalizeCombatDoctrineId(member.combatDoctrineId),
    factionBehavior: normalizeFactionBehaviorProfile(member.factionBehavior),
  });
}

function profileRetreatRequired(squad, perceptions) {
  if (perceptions.some(perception => perception.self.moraleImmune)) return false;
  for (const perception of perceptions) {
    const profile = normalizeFactionBehaviorProfile(perception.self && perception.self.factionBehavior)
      || squad.factionBehavior;
    if (profile && perception.self.hullFraction <= profile.retreatHullFraction) return true;
  }
  return false;
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

// ── encounter composition grammar (wings with roles + one twist clause) ────────
// Data: WING_COMPOSITION_GRAMMAR / TWIST_CLAUSES in src/data/combatDefs.js. A wing resolves to
// at most one composition (first matching row); the twist is seeded from (squadId, seed) so
// every consumer of the same fight sees the same wing grammar.

const IDENTITY_WING_ROLE = Object.freeze({
  swarm_pack: 'flank',
  ranged_disengager: 'kite',
  mine_layer_wake: 'area_denial',
  shield_breaker: 'shield_breaker',
  escort_screen: 'screen',
  field_anchor_controller: 'screen',
});

export function resolveWingComposition(squadId, members, seed = 1) {
  const doctrineIds = members.map((member) => member.combatDoctrineId).filter(Boolean);
  let grammar = null;
  for (const row of WING_COMPOSITION_GRAMMAR) {
    const when = row && row.when;
    if (!when) continue;
    if (members.length < (when.sizeMin || 1)) continue;
    if (when.identityAll) {
      if (!doctrineIds.length || !doctrineIds.every((id) => id === when.identityAll)) continue;
    }
    if (when.identityAny && !doctrineIds.includes(when.identityAny)) continue;
    grammar = row;
    break;
  }
  if (!grammar) return { grammarId: null, twist: null, roles: new Map() };
  const twists = Array.isArray(grammar.twists) ? grammar.twists : [];
  const twist = twists.length
    ? twists[Math.floor(hashUnit(seed, squadId, 'twist', grammar.id) * twists.length) % twists.length]
    : null;
  return { grammarId: grammar.id, twist, roles: assignWingRoles(members, grammar.roles || []) };
}

function assignWingRoles(members, roleCycle) {
  const roles = new Map();
  const pool = members.slice();
  // First pass: identity claims the role it exists to play (the mine-layer takes area_denial,
  // the warden takes screen), in grammar order so earlier slots win contested identities.
  for (const role of roleCycle) {
    const index = pool.findIndex((member) => (IDENTITY_WING_ROLE[member.combatDoctrineId] || 'press') === role);
    if (index >= 0) roles.set(pool.splice(index, 1)[0].id, role);
  }
  // Second pass: everyone else fills the remaining slots in grammar order.
  for (let slot = 0; pool.length; slot++) {
    roles.set(pool.shift().id, roleCycle[slot % roleCycle.length]);
  }
  return roles;
}

function applyTwistWeights(squad, candidates) {
  const twist = squad.composition && squad.composition.twist;
  const clause = twist && TWIST_CLAUSES[twist];
  const weights = clause && clause.weights;
  if (!weights) return;
  for (const candidate of candidates) {
    const delta = weights[candidate.id];
    if (delta) candidate.utility = saturate(candidate.utility + delta);
  }
}

function mergeContacts(perceptions, freeze = Object.freeze, mergeScratch = null, outScratch = null) {
  const merged = mergeScratch || new Map();
  merged.clear();
  for (const perception of perceptions) {
    for (const contact of perception.contacts) {
      // Hazards remain in each member's perception for ManeuverPlanner obstacle avoidance. Squad
      // command consumers only reason about ships, objectives, and tethers, so merging every
      // asteroid/station/wreck across every member is redundant command work.
      if (contact.kind === ContactKind.HAZARD) continue;
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
      const hostile = contact.hostile === true;
      if (hostile) record.hostileVotes++;
      else if (contact.team != null) record.friendlyVotes++;
      if (contact.confidence > record.confidence) Object.assign(record, contact);
    }
  }
  const out = outScratch || [];
  out.length = 0;
  for (const record of merged.values()) {
    record.confidence = saturate(record.confidenceTotal / Math.max(1, record.confidenceSamples));
    out.push(freeze(record));
  }
  merged.clear();
  if (freeze === Object.freeze) {
    out.sort((a, b) => `${a.kind}|${stableId(a.id)}`.localeCompare(`${b.kind}|${stableId(b.id)}`));
  }
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

function objectiveFor(tactic, role, focus, objective, tether, perception, assignedTarget = null,
  allocationActive = false, freeze = Object.freeze) {
  if (tactic === 'fighting_retreat') return freezeObjective(ObjectiveKind.RETREAT, null, 'director_or_attrition', freeze);
  if (tactic === 'cut_and_scatter') return freezeObjective(role === SquadRole.SUPPORT || role === SquadRole.STRIKER ? ObjectiveKind.COUNTER_TETHER_CUT : ObjectiveKind.SCREEN, tether && tether.id, 'exposed_tether', freeze);
  if (tactic === 'overload_and_break') {
    const selfTethered = !!(perception && perception.self && perception.self.tethered);
    if (selfTethered && memberLineOverloadable(perception)) {
      return freezeObjective(ObjectiveKind.COUNTER_TETHER_OVERLOAD, tether && tether.id, 'tethered_member', freeze);
    }
    if (!selfTethered) return freezeObjective(ObjectiveKind.SCREEN, tether && tether.id, 'tethered_member', freeze);
    // A tethered member on an unbreakable line cannot resolve an overload objective. It falls
    // through to the ordinary combat orders below so its doctrine keeps running while held.
  }
  if (tactic === 'screen_tug_steal') {
    if (role === SquadRole.TUG) return freezeObjective(ObjectiveKind.TUG, objective && objective.id, 'assigned_tug', freeze);
    if (role === SquadRole.THIEF) return freezeObjective(ObjectiveKind.STEAL, objective && objective.id, 'assigned_thief', freeze);
    return freezeObjective(ObjectiveKind.SCREEN, objective && objective.id, 'protect_specialist', freeze);
  }
  if (tactic === 'hold_formation') return freezeObjective(ObjectiveKind.HOLD, null, 'weak_contact_picture', freeze);
  // Arena pressure comes from the whole pack. Adventure's two-gun target allocation
  // would otherwise turn every remaining member into a permanent screening spectator.
  if (perception?.self?.arenaPursuit && focus) return freezeObjective(
    tactic === 'contain_and_disable' ? ObjectiveKind.ENGAGE : ObjectiveKind.FOCUS,
    focus.id, 'arena_pursuit', freeze);
  if (allocationActive) {
    if (!assignedTarget) return freezeObjective(ObjectiveKind.SCREEN, focus && focus.id, 'fire_lane_reserve', freeze);
    if (tactic === 'contain_and_disable') return freezeObjective(ObjectiveKind.ENGAGE, assignedTarget.id, 'disable_assignment', freeze);
    return freezeObjective(ObjectiveKind.FOCUS, assignedTarget.id, `${tactic}_assignment`, freeze);
  }
  if (tactic === 'contain_and_disable') return freezeObjective(ObjectiveKind.ENGAGE, focus && focus.id, 'disable_focus', freeze);
  return freezeObjective(ObjectiveKind.FOCUS, focus && focus.id, tactic, freeze);
}

function allocateCombatTargets(squad, tactic, contacts, focus) {
  if (!['swarm_pincer', 'standoff_focus', 'contain_and_disable'].includes(tactic)) return null;
  const targets = squad.hostileTargetsScratch;
  targets.length = 0;
  for (const contact of contacts) {
    if (contact.kind !== ContactKind.SHIP || contact.hostileVotes <= contact.friendlyVotes) continue;
    targets.push(contact);
  }
  targets.sort((a, b) => {
    if (focus) {
      if (a.id === focus.id && b.id !== focus.id) return -1;
      if (b.id === focus.id && a.id !== focus.id) return 1;
    }
    // Twist `focus_the_soft`: the wing guns the lightest hull in reach instead of the loudest
    // threat — mass class ascending, so attrition concentrates on what dies.
    if (squad.composition && squad.composition.twist === 'focus_the_soft') {
      const softDelta = softnessRank(a) - softnessRank(b);
      if (softDelta !== 0) return softDelta;
    }
    const scoreA = finiteTargetPriority(a);
    const scoreB = finiteTargetPriority(b);
    return scoreB - scoreA || stableId(a.id).localeCompare(stableId(b.id));
  });

  const assignments = squad.targetAssignmentsScratch;
  const loads = squad.targetLoadScratch;
  assignments.clear();
  loads.clear();
  for (const member of squad.members) assignments.set(member.id, null);
  const members = squad.assignmentMembersScratch;
  members.length = 0;
  for (const member of squad.members) {
    const role = squad.roles.get(member.id);
    if (role === SquadRole.LEADER || role === SquadRole.STRIKER || role === SquadRole.SUPPORT) members.push(member);
  }
  members.sort((a, b) => {
    // A contain-and-disable squad must put at least one authored disable verb in the fire lane.
    // Otherwise the generic leader/striker ordering can consume a light target's two attacker
    // slots before its disable-capable support member is considered, leaving a nominally
    // non-lethal squad to fire only ordinary weapons forever.
    if (tactic === 'contain_and_disable') {
      const disableRank = Number(!a.capabilities.includes('disable'))
        - Number(!b.capabilities.includes('disable'));
      if (disableRank !== 0) return disableRank;
    }
    return assignmentRoleRank(squad.roles.get(a.id)) - assignmentRoleRank(squad.roles.get(b.id))
      || stableId(a.id).localeCompare(stableId(b.id));
  });

  for (const member of members) {
    let assigned = null;
    for (const target of targets) {
      const load = loads.get(target.id) || 0;
      if (load >= attackerCapacity(target)) continue;
      assigned = target;
      loads.set(target.id, load + 1);
      break;
    }
    assignments.set(member.id, assigned);
  }
  return assignments;
}

function attackerCapacity(contact) {
  if (contact.operationalMassBand === 'capital') return 4;
  if (contact.operationalMassBand === 'heavy') return 3;
  return 2;
}

function finiteTargetPriority(contact) {
  return (Number.isFinite(contact.threat) ? contact.threat : 0) * 4
    + (Number.isFinite(contact.confidence) ? contact.confidence : 0)
    + (contact.tethered ? 0.25 : 0);
}

/** Light, low-mass hulls first — the `focus_the_soft` twist's targeting rank. */
function softnessRank(contact) {
  return Number.isFinite(contact.massClass) ? contact.massClass : 99;
}

function assignmentRoleRank(role) {
  if (role === SquadRole.LEADER) return 0;
  if (role === SquadRole.STRIKER) return 1;
  if (role === SquadRole.SUPPORT) return 2;
  return 3;
}

function selectObjectiveContact(contacts) {
  let best = null;
  for (const contact of contacts) {
    if (contact.kind !== ContactKind.OBJECTIVE) continue;
    if (!best || contact.objectiveValue > best.objectiveValue ||
      (contact.objectiveValue === best.objectiveValue && stableId(contact.id) < stableId(best.id))) {
      best = contact;
    }
  }
  return best;
}

// Whether the line holding this member can realistically be snapped by an overload dash. The
// member's own tether contacts always include its endpoint lines, so an absent contact means the
// tethered flag arrived through merged squad data and counterplay keeps the benefit of the doubt.
function memberLineOverloadable(perception) {
  const selfId = perception && perception.self && perception.self.id;
  const contacts = perception && perception.contacts;
  if (selfId == null || !Array.isArray(contacts)) return true;
  let sawOwnLine = false;
  for (const contact of contacts) {
    if (!contact || contact.kind !== ContactKind.TETHER) continue;
    if (contact.targetId !== selfId && contact.ownerId !== selfId) continue;
    sawOwnLine = true;
    if (Array.isArray(contact.tags) && contact.tags.includes('overloadable')) return true;
  }
  return !sawOwnLine;
}

function selectTetherContact(contacts) {
  let best = null;
  for (const contact of contacts) {
    if (contact.kind !== ContactKind.TETHER) continue;
    if (!best || Number(contact.exposed) > Number(best.exposed) ||
      (contact.exposed === best.exposed && contact.confidence > best.confidence)) {
      best = contact;
    }
  }
  return best;
}

function freezeObjective(kind, targetId, reason, freeze = Object.freeze) {
  return freeze({ kind, targetId: targetId == null ? null : targetId, reason });
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

function capabilitySet(squad, perceptions, scratch = null) {
  const out = scratch || new Set();
  out.clear();
  for (const member of squad.members) for (const capability of member.capabilities) out.add(capability);
  for (const perception of perceptions) for (const capability of perception.self.capabilities) out.add(capability);
  return out;
}

function freezeSquad(squad) {
  return Object.freeze({
    id: squad.id,
    doctrine: squad.doctrine,
    faction: squad.faction,
    formation: squad.formation,
    formationBound: squad.formationBound,
    factionBehavior: squad.factionBehavior,
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

function identity(value) {
  return value;
}
