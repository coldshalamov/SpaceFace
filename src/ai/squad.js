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
    // Survives unregisterSquad. A roster rebuild drops the squad object and
    // would otherwise accept the next body that reuses the leader id.
    this.acceptedLeaderGeneration = new Map();
  }

  registerSquad(definition) {
    if (!definition || definition.id == null) throw new TypeError('squad id is required');
    if (!Array.isArray(definition.members) || definition.members.length === 0) throw new TypeError('squad requires members');
    const members = definition.members.map((member, index) => normalizeMember(member, index));
    const leaderOccupantGeneration = this._rememberedLeaderGeneration(definition.id, members[0].id);
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
      composition: resolveWingComposition(definition.id, members, this.seed, factionBehavior),
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
      // The occupant token accepted for members[0]. A later frame with the same id and a
      // different token is a recycled body, not a new order to follow it.
      // Restored from acceptedLeaderGeneration so a roster rebuild does not clear it.
      leaderOccupantGeneration,
    };
    this.squads.set(definition.id, state);
    return this.inspect(definition.id);
  }

  unregisterSquad(squadId) {
    this.squads.delete(squadId);
  }

  _rememberedLeaderGeneration(squadId, leaderId) {
    const byLeader = this.acceptedLeaderGeneration.get(squadId);
    if (!byLeader || leaderId == null) return null;
    const generation = byLeader.get(leaderId);
    if (generation == null || generation === '') return null;
    return generation;
  }

  _rememberLeaderGeneration(squadId, leaderId, generation) {
    if (leaderId == null || generation == null || generation === '') return;
    let byLeader = this.acceptedLeaderGeneration.get(squadId);
    if (!byLeader) {
      byLeader = new Map();
      this.acceptedLeaderGeneration.set(squadId, byLeader);
    }
    byLeader.set(leaderId, generation);
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
    this._rememberLeaderGeneration(squad.id, squad.members[0].id, squad.leaderOccupantGeneration);
    if (leader && leader.self) {
      squad.formationHeading = squad.formationHeading == null
        ? leader.self.rot
        : slewAngle(squad.formationHeading, leader.self.rot, this.config.formationTurnPerTick);
    }
    const bestObjective = selectObjectiveContact(contacts);
    const bestTether = selectTetherContact(contacts);
    const hostilesPresent = contacts.some((contact) => contact.kind === ContactKind.SHIP && contact.hostileVotes > 0);
    const withdrawal = stepSquadWithdrawal(squad, tick, perceptions, focus, leader);
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
      let formationSlot = formationSlotFor(squad, leader, index, squad.members.length);
      const allocationActive = targetAssignments !== null && targetAssignments.has(member.id);
      const assignedTarget = allocationActive ? targetAssignments.get(member.id) : null;
      let objective = objectiveFor(selected.id, role, focus, bestObjective, bestTether, perception,
        assignedTarget, allocationActive, hostilesPresent, freeze);
      if (withdrawal && member.id === withdrawal.wardId) {
        formationSlot = { x: withdrawal.corridor.x, z: withdrawal.corridor.z };
        objective = freezeObjective(ObjectiveKind.RETREAT, null, 'wounded_corridor', freeze, undefined, {
          flightPoint: freeze({ x: withdrawal.corridor.x, z: withdrawal.corridor.z }),
          cue: withdrawal.announce ? 'fighting_retreat' : null,
        });
      } else if (withdrawal && member.id === withdrawal.coverId) {
        objective = freezeObjective(ObjectiveKind.SCREEN, focus ? focus.id : null, 'covering_withdrawal', freeze,
          targetObservedBySquad(focus));
      } else if (withdrawal && objective.kind === ObjectiveKind.RETREAT) {
        objective = freezeObjective(ObjectiveKind.ENGAGE, focus ? focus.id : null, 'withdrawal_hold', freeze,
          targetObservedBySquad(focus));
      }
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
          breakFormation: breakFormation || (withdrawal && member.id === withdrawal.wardId),
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
      }
    }
    let lowHullTotal = 0;
    let disabledTotal = 0;
    const hostilesPresent = hostileShips > 0;
    for (const perception of perceptions) {
      lowHullTotal += 1 - perception.self.hullFraction;
      disabledTotal += perception.self.disabled ? 1 : 0;
      // Held-member detection lives on each member's own perception frame: the merged squad
      // tether record keeps whichever endpoint fields arrived with the highest-confidence copy,
      // so a member held by a line can be invisible to the merged contact (its targetId then
      // points at another endpoint). Only a line an overload dash can actually snap justifies
      // diverting a member mid-fight; a tether whose break policy ignores ship thrust (the
      // standard player Massline) never resolves the objective while the wing is fighting, so
      // the member must stay on ordinary combat orders instead.
      if (!memberTetheredOverloads && memberShouldOverload(perception, hostilesPresent)) {
        memberTetheredOverloads = true;
      }
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
//
// Authority boundary: the twist clauses are AGGRESSOR flavor. Squads whose sampled faction
// behavior opts out of destruction (non-lethal interdiction, convoys, fixed-route logistics —
// e.g. K1 fulfillment) run authored tactic contracts and never draw one.

export const IDENTITY_WING_ROLE = Object.freeze({
  swarm_pack: 'flank',
  ranged_disengager: 'kite',
  mine_layer_wake: 'area_denial',
  shield_breaker: 'shield_breaker',
  escort_screen: 'screen',
  field_anchor_controller: 'screen',
});

export function resolveWingComposition(squadId, members, seed = 1, factionBehavior = null) {
  const doctrineIds = members.map((member) => member.combatDoctrineId).filter(Boolean);
  if (factionBehavior && factionBehavior.destroyTarget === false) {
    return { grammarId: null, twist: null, roles: new Map() };
  }
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
          // SF-057 bounded-search residual: the merge must carry whether ANY member holds a live
          // sighting this tick, not just the best (possibly stale) positional fix. A merged
          // contact built entirely from memories is a search anchor, not a firing solution.
          liveSightings: 0,
          observationTracked: false,
        };
        merged.set(key, record);
      }
      record.confidenceTotal += contact.confidence;
      record.confidenceSamples++;
      const hostile = contact.hostile === true;
      if (hostile) record.hostileVotes++;
      else if (contact.team != null) record.friendlyVotes++;
      if (contact.visible !== undefined && contact.visible !== null) record.observationTracked = true;
      if (contact.visible === true) record.liveSightings++;
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

function occupantGenerationOf(self) {
  if (!self || self.occupantGeneration == null || self.occupantGeneration === '') return null;
  return self.occupantGeneration;
}

function leaderSelfAccepted(self, acceptedGeneration) {
  if (!self || self.alive === false) return false;
  if (acceptedGeneration == null) return true;
  const generation = occupantGenerationOf(self);
  // A frame that drops the token after one was accepted is not the same body.
  if (generation == null) return false;
  return Object.is(generation, acceptedGeneration);
}

function chooseLeaderPerception(squad, perceptions) {
  const leaderId = squad.members[0].id;
  const accepted = squad.leaderOccupantGeneration;
  let other = null;
  let matched = null;
  for (const perception of perceptions) {
    const self = perception && perception.self;
    if (!self) continue;
    if (self.id !== leaderId) {
      if (!other) other = perception;
      continue;
    }
    // Death, or a new occupant on the leader's id, is not a steering target.
    // Do not fall through to this same body via the first-perception fallback.
    if (!leaderSelfAccepted(self, accepted)) continue;
    matched = perception;
    break;
  }
  if (matched) {
    const generation = occupantGenerationOf(matched.self);
    if (generation != null) squad.leaderOccupantGeneration = generation;
  }
  return matched || other || null;
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
  allocationActive = false, hostilesPresent = false, freeze = Object.freeze) {
  if (tactic === 'fighting_retreat') return freezeObjective(ObjectiveKind.RETREAT, null, 'director_or_attrition', freeze);
  if (tactic === 'cut_and_scatter') return freezeObjective(role === SquadRole.SUPPORT || role === SquadRole.STRIKER ? ObjectiveKind.COUNTER_TETHER_CUT : ObjectiveKind.SCREEN, tether && tether.id, 'exposed_tether', freeze);
  if (tactic === 'overload_and_break') {
    const selfTethered = !!(perception && perception.self && perception.self.tethered);
    if (selfTethered && memberShouldOverload(perception, hostilesPresent)) {
      return freezeObjective(ObjectiveKind.COUNTER_TETHER_OVERLOAD, tether && tether.id, 'tethered_member', freeze);
    }
    if (!selfTethered) return freezeObjective(ObjectiveKind.SCREEN, tether && tether.id, 'tethered_member', freeze);
    // A tethered member whose line cannot snap under ship thrust while the wing is fighting
    // cannot resolve an overload objective. It falls through to the ordinary combat orders
    // below so its doctrine keeps running while held.
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
    focus.id, 'arena_pursuit', freeze, targetObservedBySquad(focus));
  if (allocationActive) {
    if (!assignedTarget) return freezeObjective(ObjectiveKind.SCREEN, focus && focus.id, 'fire_lane_reserve', freeze,
      targetObservedBySquad(focus));
    if (tactic === 'contain_and_disable') return freezeObjective(ObjectiveKind.ENGAGE, assignedTarget.id, 'disable_assignment',
      freeze, targetObservedBySquad(assignedTarget));
    return freezeObjective(ObjectiveKind.FOCUS, assignedTarget.id, `${tactic}_assignment`, freeze,
      targetObservedBySquad(assignedTarget));
  }
  if (tactic === 'contain_and_disable') return freezeObjective(ObjectiveKind.ENGAGE, focus && focus.id, 'disable_focus',
    freeze, targetObservedBySquad(focus));
  return freezeObjective(ObjectiveKind.FOCUS, focus && focus.id, tactic, freeze, targetObservedBySquad(focus));
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

// Whether the member is the held endpoint of a line rather than its owner. A member anchoring a
// tether of its own is the holder, not the held — it keeps working its own capture plan instead
// of being diverted into an escape that was never aimed at it. The member's own contact frame
// always includes its endpoint lines, so a tethered flag without a visible own-target line keeps
// the benefit of the doubt (the same convention memberLineOverloadable uses).
function memberHeldByForeignLine(perception) {
  const self = perception && perception.self;
  const selfId = self && self.id;
  if (selfId == null || !self.tethered) return false;
  const contacts = perception.contacts;
  if (!Array.isArray(contacts)) return true;
  let sawOwnLine = false;
  for (const contact of contacts) {
    if (!contact || contact.kind !== ContactKind.TETHER) continue;
    if (contact.targetId !== selfId && contact.ownerId !== selfId) continue;
    sawOwnLine = true;
    if (contact.targetId === selfId) return true;
  }
  return !sawOwnLine;
}

// Whether a held member should divert into the canonical overload-dash escape. A line that can
// actually snap under ship thrust always justifies it. A line whose break policy ignores thrust
// — the standard player Massline — still justifies it while the wing is not in a firefight: an
// idle held member works the rope loose as the authored counterplay beat, but a fighting member
// keeps its combat orders so tethering a hostile cannot permanently disarm it.
function memberShouldOverload(perception, hostilesPresent) {
  if (!memberHeldByForeignLine(perception)) return false;
  if (memberLineOverloadable(perception)) return true;
  return !hostilesPresent;
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

function freezeObjective(kind, targetId, reason, freeze = Object.freeze, targetObserved, extra) {
  const out = { kind, targetId: targetId == null ? null : targetId, reason };
  // SF-057: absent = observation not tracked (legacy/non-squad producers); false = the squad's
  // merged contact is memory only — members may fly the search leg but must not fire on it.
  if (targetObserved !== undefined) out.targetObserved = targetObserved;
  if (extra && extra.flightPoint) out.flightPoint = extra.flightPoint;
  if (extra && extra.cue) out.cue = extra.cue;
  return freeze(out);
}

const WITHDRAWAL_HULL = 0.35;
const WITHDRAWAL_REACH = 640;
const WITHDRAWAL_COMMIT_TICKS = 180;
const WITHDRAWAL_ESCAPE = 720;
const WITHDRAWAL_ARRIVE = 48;
const WITHDRAWAL_STALL_TICKS = 90;
const WITHDRAWAL_BLOCK = 36;
const WITHDRAWAL_REPLAN_CAP = 2;

function stepSquadWithdrawal(squad, tick, perceptions, focus, leaderPerception) {
  // An accepted escape stays released while the ward remains clear. Without the latch a ward
  // parked on its corridor or beyond the threat's reach is re-committed on the next decision
  // tick, and the covering ship is re-drafted forever onto a retreat that already succeeded —
  // plus a fresh announcement every re-commit. The latch clears when the ward's escape no
  // longer holds (it drifted back into the fight or was disabled), making it a live ward again.
  const released = squad.releasedWards || (squad.releasedWards = new Map());
  for (const [releasedId, corridor] of released) {
    if (!releasedWardStillEscaped(releasedId, corridor, perceptions, focus)) released.delete(releasedId);
  }
  const wounded = [];
  for (const perception of perceptions) {
    const self = perception && perception.self;
    if (!self || self.alive === false || self.disabled) continue;
    if (!(self.hullFraction <= WITHDRAWAL_HULL)) continue;
    if (released.has(self.id)) continue;
    wounded.push(perception);
  }
  wounded.sort((a, b) => a.self.hullFraction - b.self.hullFraction
    || String(a.self.id).localeCompare(String(b.self.id)));
  const ward = wounded[0] || null;
  const previous = squad.withdrawalCommit || null;
  if (!ward) {
    squad.withdrawalCommit = null;
    return null;
  }
  const wardId = ward.self.id;
  const leaderRejected = retreatLeaderRejected(squad, leaderPerception);
  const sameWard = previous && previous.wardId === wardId;
  const escaped = sameWard && wardEscaped(ward, previous, focus);
  const coverGone = sameWard && previous.coverId != null && !covererHealthy(perceptions, previous.coverId, wardId);
  const blocked = sameWard && corridorBlocked(perceptions, previous.corridor, focus);
  const stalled = sameWard && tick - (previous.stillSince || previous.sinceTick) >= WITHDRAWAL_STALL_TICKS;
  const expired = sameWard && tick - previous.sinceTick > WITHDRAWAL_COMMIT_TICKS;
  const leaderMoved = sameWard && previous.anchorLeaderGeneration != null && leaderRejected
    && previous.anchorLeaderGeneration !== squad.leaderOccupantGeneration;
  if (escaped) {
    released.set(previous.wardId, previous.corridor);
    squad.withdrawalCommit = null;
    return null;
  }
  let replan = !sameWard || coverGone || blocked || stalled || expired || leaderMoved;
  if (sameWard && (previous.replans || 0) >= WITHDRAWAL_REPLAN_CAP && (blocked || stalled)) replan = false;
  if (!replan) {
    const dist = pointDistance(ward.self.pos, previous.corridor);
    if (dist + 8 < (previous.lastDist || Infinity)) {
      previous.lastDist = dist;
      previous.stillSince = tick;
    }
    previous.announce = false;
    if (!covererHealthy(perceptions, previous.coverId, wardId)) {
      const cover = chooseWithdrawalCover(perceptions, wardId, squad);
      previous.coverId = cover ? cover.self.id : null;
    }
    return previous;
  }
  const salt = sameWard ? (previous.replans || 0) + 1 : 0;
  const corridor = chooseWithdrawalCorridor(ward, perceptions, focus, squad, leaderPerception, salt);
  if (!corridor) {
    squad.withdrawalCommit = null;
    return null;
  }
  const cover = chooseWithdrawalCover(perceptions, wardId, squad);
  const commit = {
    wardId,
    coverId: cover ? cover.self.id : null,
    corridor,
    sinceTick: tick,
    stillSince: tick,
    lastDist: pointDistance(ward.self.pos, corridor),
    replans: salt,
    announce: true,
    anchorLeaderId: squad.members[0] && squad.members[0].id,
    anchorLeaderGeneration: squad.leaderOccupantGeneration,
  };
  squad.withdrawalCommit = commit;
  return commit;
}

function retreatLeaderRejected(squad, leaderPerception) {
  const leaderId = squad.members[0] && squad.members[0].id;
  const self = leaderPerception && leaderPerception.self;
  if (!self || self.alive === false || self.id !== leaderId) return true;
  return !leaderSelfAccepted(self, squad.leaderOccupantGeneration);
}

function wardEscaped(ward, commit, focus) {
  if (pointDistance(ward.self.pos, commit.corridor) <= WITHDRAWAL_ARRIVE) return true;
  if (focus && focus.pos && pointDistance(ward.self.pos, focus.pos) >= WITHDRAWAL_ESCAPE) return true;
  return false;
}

// A released ward stays out of ward selection while the same escape criteria still hold: it is
// sitting on the corridor it was given, or it is beyond the threat's reach. A ward missing from
// the picture is departed — released for good. A ward that left its corridor and is inside the
// threat's reach again is a live wounded member once more and earns a fresh commitment.
function releasedWardStillEscaped(wardId, corridor, perceptions, focus) {
  for (const perception of perceptions) {
    const self = perception && perception.self;
    if (!self || self.id !== wardId) continue;
    if (self.alive === false || self.disabled === true) return false;
    if (corridor && pointDistance(self.pos, corridor) <= WITHDRAWAL_ARRIVE) return true;
    return !!(focus && focus.pos && pointDistance(self.pos, focus.pos) >= WITHDRAWAL_ESCAPE);
  }
  return true;
}

function covererHealthy(perceptions, coverId, wardId) {
  if (coverId == null || coverId === wardId) return false;
  for (const perception of perceptions) {
    const self = perception && perception.self;
    if (!self || self.id !== coverId) continue;
    return self.alive !== false && !self.disabled && self.hullFraction > WITHDRAWAL_HULL;
  }
  return false;
}

function corridorBlocked(perceptions, corridor, focus) {
  if (!corridor) return true;
  for (const perception of perceptions) {
    for (const contact of perception.contacts || []) {
      if (!contact || contact.alive === false || !contact.pos) continue;
      if (contact.kind !== ContactKind.SHIP || contact.hostile !== true) continue;
      if (focus && contact.id === focus.id && pointDistance(contact.pos, corridor) <= WITHDRAWAL_BLOCK) return true;
      if (pointDistance(contact.pos, corridor) <= WITHDRAWAL_BLOCK) return true;
    }
  }
  return false;
}

function chooseWithdrawalCover(perceptions, wardId, squad) {
  const healthy = [];
  for (const perception of perceptions) {
    const self = perception && perception.self;
    if (!self || self.id === wardId || self.alive === false || self.disabled) continue;
    if (!(self.hullFraction > WITHDRAWAL_HULL)) continue;
    healthy.push(perception);
  }
  healthy.sort((a, b) => {
    const roleA = squad.roles.get(a.self.id) === SquadRole.SCREEN ? 0 : 1;
    const roleB = squad.roles.get(b.self.id) === SquadRole.SCREEN ? 0 : 1;
    if (roleA !== roleB) return roleA - roleB;
    return String(a.self.id).localeCompare(String(b.self.id));
  });
  return healthy[0] || null;
}

function chooseWithdrawalCorridor(ward, perceptions, focus, squad, leaderPerception, salt) {
  const leaderId = squad.members[0] && squad.members[0].id;
  const leaderRejected = retreatLeaderRejected(squad, leaderPerception);
  let hazard = null;
  for (const perception of perceptions) {
    for (const contact of perception.contacts || []) {
      if (!contact || contact.kind !== ContactKind.HAZARD || contact.visible !== true) continue;
      if (contact.alive === false || !contact.pos) continue;
      if (contact.id === leaderId && leaderRejected) continue;
      hazard = contact;
      break;
    }
    if (hazard) break;
  }
  const threat = focus && focus.pos ? focus.pos : null;
  if (hazard && threat) {
    const dx = hazard.pos.x - threat.x;
    const dz = hazard.pos.z - threat.z;
    const len = Math.hypot(dx, dz) || 1;
    return pushCorridorOut(ward.self.pos, {
      x: hazard.pos.x + (dx / len) * 80,
      z: hazard.pos.z + (dz / len) * 80,
      id: `hazard:${hazard.id}:${salt}`,
    });
  }
  const origin = ward.self.pos || { x: 0, z: 0 };
  let ax = Math.cos(ward.self.rot || 0);
  let az = Math.sin(ward.self.rot || 0);
  if (threat) {
    const dx = origin.x - threat.x;
    const dz = origin.z - threat.z;
    const len = Math.hypot(dx, dz) || 1;
    ax = dx / len;
    az = dz / len;
  }
  const side = salt % 2 === 0 ? 1 : -1;
  if (leaderPerception && leaderPerception.self && leaderRejected) {
    const leaderPos = leaderPerception.self.pos;
    const parked = {
      x: origin.x + ax * WITHDRAWAL_REACH + (-az) * side * 80,
      z: origin.z + az * WITHDRAWAL_REACH + ax * side * 80,
    };
    if (leaderPos && pointDistance(parked, leaderPos) < 24) {
      return {
        x: parked.x - leaderPos.x,
        z: parked.z - leaderPos.z,
        id: `away:${ward.self.id}:${salt}`,
      };
    }
  }
  return pushCorridorOut(origin, {
    x: origin.x + ax * WITHDRAWAL_REACH + (-az) * side * 80,
    z: origin.z + az * WITHDRAWAL_REACH + ax * side * 80,
    id: `away:${ward.self.id}:${salt}`,
  });
}

function pushCorridorOut(origin, point) {
  const from = origin || { x: 0, z: 0 };
  const dx = point.x - (from.x || 0);
  const dz = point.z - (from.z || 0);
  const dist = Math.hypot(dx, dz);
  const minDist = WITHDRAWAL_ARRIVE + 120;
  if (dist >= minDist) return point;
  const scale = minDist / (dist || 1);
  return { ...point, x: (from.x || 0) + dx * scale, z: (from.z || 0) + dz * scale };
}

function pointDistance(a, b) {
  if (!a || !b) return Infinity;
  return Math.hypot((a.x || 0) - (b.x || 0), (a.z || 0) - (b.z || 0));
}

/** Whether the merged contact carries a live squad sighting this tick. Untracked contact sources
 *  stay undefined so fixture producers that never publish `visible` keep their pre-SF-057 shape.
 *  A dispatched mark is deliberately NOT a sighting: it authorizes maneuver on the assignment
 *  (doctrine.js marks it so the responder can fly its orders), but fire still requires a member
 *  to actually see the target — the report may be stale, and the fire gate resolves the LIVE
 *  entity position. */
function targetObservedBySquad(contact) {
  if (!contact || contact.observationTracked !== true) return undefined;
  return contact.liveSightings > 0;
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
