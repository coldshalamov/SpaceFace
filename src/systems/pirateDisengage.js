// BP-13/B8 Intentional combat exits.
//
// Trigger layer only: detects lawful patrol pressure, bad robbery economics, critical damage, and
// wing collapse, waits a short nerve beat, then supplies existing AI-facing surrender/flee fields
// and one readable bark. Authored bosses, aces, fanatics, and named hunters remain exempt.
import { barkFor } from '../data/barks.js';
import { pirateDoctrineForEntity } from '../data/pirateDoctrines.js';
import { hash32 } from '../core/rng.js';
import { ActivityKind, RulesOfEngagement, normalizeActivity } from '../ai/doctrine.js';
import { massline2Flag } from '../data/featureFlags.js';

const PATROL_RADIUS = 900;
const NERVE_DELAY_S = 1.0;
const FLEE_DURATION_S = 18.0;
const PLAYER_TEAM = 0;
const SURRENDER_HULL_FRACTION = 0.16;
const DAMAGE_RETREAT_HULL_FRACTION = 0.28;
const WING_LOSS_HULL_FRACTION = 0.62;
const WING_LOSS_LIVE_RATIO = 0.5;
// Massline tumble morale (Wave M2 §3.4): the fling-shock window and the "already worn" bar a crew
// must be under for a squadmate's tumble to break them (healthy crews shrug one tumble off).
const TUMBLE_MORALE_WINDOW_S = 8;
const TUMBLE_RETREAT_HULL_FRACTION = 0.8;

export const pirateDisengage = {
  name: 'pirateDisengage',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || {};
  },

  newGame() {
    if (this.state) this.state.pirateDisengage = freshState();
  },

  update(_dt, state) {
    if (state.mode && state.mode !== 'flight') return;
    const own = ensureState(state);
    const now = state.simTime || 0;
    const patrols = lawfulPatrols(state);
    const squads = combatantSquads(state);
    for (const [squadId, members] of squads) {
      let rec = own.squads[squadId];
      if (rec && rec.disengaged) continue;
      const baseline = Math.max(own.baselines[squadId] || 0, members.length);
      own.baselines[squadId] = baseline;
      const patrol = nearestPatrol(members, patrols);
      const decision = moraleDecision(members, state, baseline, patrol);
      if (!decision) {
        if (rec && !rec.disengaged) delete own.squads[squadId];
        continue;
      }
      const { reason, outcome, threat } = decision;
      if (!rec) {
        rec = {
          squadId,
          patrolId: patrol ? patrol.id : null,
          reason,
          outcome,
          firstSeenAt: now,
          triggerAt: now + NERVE_DELAY_S,
          disengaged: false,
          spoken: false,
        };
        own.squads[squadId] = rec;
      } else if (rec.reason !== reason || rec.outcome !== outcome) {
        rec.reason = reason;
        rec.outcome = outcome;
        rec.firstSeenAt = now;
        rec.triggerAt = now + NERVE_DELAY_S;
      }
      rec.memberIds = members.map((e) => e.id);
      rec.patrolId = patrol ? patrol.id : null;
      rec.reason = reason;
      rec.outcome = outcome;
      if (now < rec.triggerAt) continue;
      if (outcome === 'surrendered') this._surrender(rec, members, now, state);
      else this._disengage(rec, members, threat, now, state);
    }
  },

  _disengage(rec, members, threat, now, state) {
    rec.disengaged = true;
    rec.disengagedAt = now;
    rec.until = now + FLEE_DURATION_S;
    for (const entity of members) markFleeing(entity, threat, rec, state);
    this._speak(rec, members[0] || null);
    this._emit('pirateDisengage:triggered', {
      squadId: rec.squadId,
      patrolId: rec.patrolId,
      memberIds: rec.memberIds.slice(),
      reason: rec.reason,
      outcome: 'fled',
      t: now,
    });
  },

  _surrender(rec, members, now, state) {
    rec.disengaged = true;
    rec.disengagedAt = now;
    rec.until = now + FLEE_DURATION_S;
    rec.outcome = 'surrendered';
    for (const entity of members) {
      markSurrendered(entity, rec, state);
      this._emit('combat:surrendered', {
        entityId: entity.id,
        squadId: rec.squadId,
        reason: rec.reason,
        factionId: entity.factionId || null,
        type: entity.type,
        t: now,
      });
    }
    this._speak(rec, members[0] || null);
    this._emit('pirateDisengage:triggered', {
      squadId: rec.squadId,
      patrolId: rec.patrolId,
      memberIds: rec.memberIds.slice(),
      reason: rec.reason,
      outcome: 'surrendered',
      t: now,
    });
  },

  _speak(rec, entity) {
    if (rec.spoken) return;
    rec.spoken = true;
    const seed = this.state && this.state.meta && this.state.meta.seed;
    const factionId = entity && entity.factionId || 'faction_reach';
    const situation = rec.outcome === 'surrendered' ? 'surrender' : 'flee';
    const text = decisionBark(rec, entity, seed);
    const voice = this.helpers && this.helpers.voice;
    if (voice && typeof voice.say === 'function') {
      voice.say({
        channel: 'bark',
        text,
        kind: 'pirateDisengage',
        ttl: 1,
        id: `pirateDisengage:${rec.squadId}`,
        factionId,
      });
    } else {
      this._emit('toast', { text, kind: 'pirateDisengage', ttl: 1 });
    }
    this._emit('pirateDisengage:voice', {
      squadId: rec.squadId,
      patrolId: rec.patrolId,
      situation,
      reason: rec.reason,
      text,
      factionId,
    });
  },

  _emit(evt, payload) {
    if (this.bus && typeof this.bus.emit === 'function') this.bus.emit(evt, payload);
  },
};

function freshState() {
  return { squads: {}, baselines: {} };
}

function ensureState(state) {
  if (!state.pirateDisengage || typeof state.pirateDisengage !== 'object') state.pirateDisengage = freshState();
  if (!state.pirateDisengage.squads || typeof state.pirateDisengage.squads !== 'object') state.pirateDisengage.squads = {};
  if (!state.pirateDisengage.baselines || typeof state.pirateDisengage.baselines !== 'object') state.pirateDisengage.baselines = {};
  return state.pirateDisengage;
}

function lawfulPatrols(state) {
  const out = [];
  for (const entity of state.entityList || []) {
    if (!entity || entity.alive === false || (entity.type !== 'ship' && entity.type !== 'drone')) continue;
    const ai = entity.data && entity.data.ai || {};
    const context = String(ai.spawnContext || ai.context || '').toLowerCase();
    const archetype = String(ai.archetype || ai.role || '').toLowerCase();
    if (ai.lawful === true && (context.includes('patrol') || archetype.includes('patrol') || ai.doctrine === 'official')) {
      out.push(entity);
    }
  }
  return out;
}

function combatantSquads(state) {
  const out = new Map();
  for (const entity of state.entityList || []) {
    if (!isActiveCombatant(entity, state)) continue;
    const ai = entity.data && entity.data.ai || {};
    if (ai.pirateDisengaged === true) continue;
    const squadId = String(ai.squadId || ai.encounterId || `entity:${entity.id}`);
    if (!out.has(squadId)) out.set(squadId, []);
    out.get(squadId).push(entity);
  }
  return out;
}

function isActiveCombatant(entity, state) {
  if (!entity || entity.alive === false || (entity.type !== 'ship' && entity.type !== 'drone')) return false;
  if (entity.id === state.playerId || entity.team === PLAYER_TEAM || entity.team === 2) return false;
  const data = entity.data || {};
  const ai = data.ai || {};
  if (!ai || ai.lawful || ai.passive || moraleExempt(entity)) return false;
  const doctrine = pirateDoctrineForEntity(entity);
  const words = `${ai.doctrine || ''} ${ai.archetype || ''} ${ai.role || ''} ${data.role || ''} ${data.encounterKind || ''}`.toLowerCase();
  const pirate = !!doctrine || words.includes('pirate') || words.includes('raider') || words.includes('scavenger');
  if (pirate) return true;
  const combat = data.combat || {};
  const playerTeam = entityFor(state, state.playerId)?.team ?? PLAYER_TEAM;
  return ai.forcePlayerTarget === true
    || ai.huntPlayer === true
    || combat.targetId === state.playerId
    || combat.lockTarget === state.playerId
    || Array.isArray(ai.hostileTeams) && ai.hostileTeams.includes(playerTeam);
}

function moraleExempt(entity) {
  const data = entity && entity.data || {};
  const ai = data.ai || {};
  if (data.isBoss === true || data.encounterBoss === true || data.missionBoss === true
    || data.aceMemory || data.storyTargetId || data.missionTag || data.missionId
    || ai.isBoss === true || ai.fanatic === true || ai.ace === true
    || ai.moraleImmune === true || ai.surrenderImmune === true) return true;
  const authored = [
    ai.archetype, ai.aiArchetype, ai.role, ai.preferredRole, ai.encounterRole,
    ai.spawnContext, ai.encounterKind, ai.engagementTrigger, data.aiArchetype,
    data.role, data.storyTargetRole, data.encounterKind,
  ].filter(Boolean).join(' ').toLowerCase();
  return /(^|[\s_-])(boss|miniboss|fanatic)([\s_-]|$)/.test(authored)
    || authored.includes('named_hunter')
    || authored.includes('ace_return')
    || authored.includes('named_ace');
}

function nearestPatrol(members, patrols) {
  let best = null;
  let bestD2 = Infinity;
  const limit2 = PATROL_RADIUS * PATROL_RADIUS;
  for (const member of members) {
    for (const patrol of patrols) {
      const d2 = dist2(member, patrol);
      if (d2 <= limit2 && d2 < bestD2) {
        bestD2 = d2;
        best = patrol;
      }
    }
  }
  return best;
}

function moraleDecision(members, state, baseline, patrol) {
  const player = entityFor(state, state.playerId);
  if (patrol) return { reason: 'lawful-patrol-nearby', outcome: 'fled', threat: patrol };
  if (badProfitRisk(members, state)) return { reason: 'profit-risk-bad', outcome: 'fled', threat: player };

  const average = averageHullFraction(members);
  // Massline tumble morale (Wave M2 §3.4, flag massline2.tumble — OFF headless so this file's
  // deterministic contract check is untouched): a squadmate physically flung into a helpless spin
  // inside the last few seconds is a morale shock. Healthy crews shrug ONE tumble off; a crew
  // already worn below the retreat-adjacent bar breaks and leaves — routing an enemy by yeeting
  // his wingman is a story, not a kill. Deterministic (no RNG); relentless narrative combatants
  // keep their authored contract.
  if (massline2Flag('tumble') && !members.some(isRelentlessNarrativeCombatant)
    && average <= TUMBLE_RETREAT_HULL_FRACTION && squadTumbledRecently(members, state)) {
    return { reason: 'massline-tumbled', outcome: 'fled', threat: player };
  }
  // Authored vendettas retain their distinct dramatic contract. Explicit boss/ace/fanatic cases
  // are already filtered by moraleExempt; this narrower exception preserves the existing hunter
  // behavior without making every ordinary hostile suicidal.
  const relentless = members.some(isRelentlessNarrativeCombatant);
  if (!relentless && average <= SURRENDER_HULL_FRACTION) {
    return { reason: 'damage-critical', outcome: 'surrendered', threat: player };
  }
  if (!relentless && average <= DAMAGE_RETREAT_HULL_FRACTION) {
    return { reason: 'damage-retreat', outcome: 'fled', threat: player };
  }
  if (baseline > 1
    && members.length / baseline <= WING_LOSS_LIVE_RATIO
    && average <= WING_LOSS_HULL_FRACTION) {
    const outcome = average <= SURRENDER_HULL_FRACTION ? 'surrendered' : 'fled';
    return { reason: 'wing-loss', outcome, threat: player };
  }
  return null;
}

function dist2(a, b) {
  const dx = (a.pos && a.pos.x || 0) - (b.pos && b.pos.x || 0);
  const dz = (a.pos && a.pos.z || 0) - (b.pos && b.pos.z || 0);
  return dx * dx + dz * dz;
}

// True when any squadmate carries a fresh tumble stamp (written by systems/tumbleStates.js at
// tumble entry; durable past recovery so the shock window outlives the spin itself).
function squadTumbledRecently(members, state) {
  const now = state.simTime || 0;
  for (const m of members) {
    const at = m && m.data && m.data.tumbledAt;
    if (Number.isFinite(at) && now - at <= TUMBLE_MORALE_WINDOW_S) return true;
  }
  return false;
}

function markFleeing(entity, patrol, rec, state) {
  const data = entity.data || (entity.data = {});
  const ai = data.ai || (data.ai = {});
  ai.fsm = 'flee';
  ai.passive = true;
  ai.forcePlayerTarget = false;
  ai.huntPlayer = false;
  ai.pirateDisengaged = true;
  ai.disengageUntil = rec.until;
  ai.engagementTrigger = 'risk_disengage';
  ai.roe = RulesOfEngagement.HOLD_FIRE;
  ai.activity = normalizeActivity({
    kind: ActivityKind.FLEE,
    reason: `pirate_disengage:${rec.reason}`,
    anchor: entity.pos,
    leashRadius: PATROL_RADIUS * 2,
    startedTick: state.tick | 0,
    targetId: null,
  });
  if (rec.reason === 'profit-risk-bad') ai.motiveSatisfied = true;
  if (Array.isArray(ai.hostileTeams)) ai.hostileTeams = ai.hostileTeams.filter((team) => team !== PLAYER_TEAM);
  const combat = data.combat || (data.combat = {});
  if (combat.targetId === state.playerId) combat.targetId = null;
  if (combat.lockTarget === state.playerId) combat.lockTarget = null;
  const intent = data.intent || (data.intent = {});
  intent.fire = false;
  intent.fireGroup = null;
  const away = fleeVector(entity, patrol);
  intent.moveX = away.x;
  intent.moveZ = away.z;
  data.pirateDisengage = {
    squadId: rec.squadId,
    patrolId: rec.patrolId,
    phase: 'flee',
    reason: rec.reason,
    until: rec.until,
  };
}

function markSurrendered(entity, rec, state) {
  const data = entity.data || (entity.data = {});
  const ai = data.ai || (data.ai = {});
  ai.fsm = 'surrender';
  ai.passive = true;
  ai.forcePlayerTarget = false;
  ai.huntPlayer = false;
  ai.pirateDisengaged = true;
  ai.disengageUntil = rec.until;
  ai.motiveSatisfied = true;
  ai.engagementTrigger = 'combat_surrender';
  ai.roe = RulesOfEngagement.HOLD_FIRE;
  ai.activity = normalizeActivity({
    kind: ActivityKind.DISENGAGE,
    reason: `combat_surrender:${rec.reason}`,
    anchor: entity.pos,
    leashRadius: 0,
    startedTick: state.tick | 0,
    targetId: null,
  });
  if (Array.isArray(ai.hostileTeams)) ai.hostileTeams = ai.hostileTeams.filter((team) => team !== PLAYER_TEAM);
  const combat = data.combat || (data.combat = {});
  combat.targetId = null;
  combat.lockTarget = null;
  const intent = data.intent || (data.intent = {});
  intent.fire = false;
  intent.fireGroup = null;
  intent.moveX = 0;
  intent.moveZ = 0;
  intent.boost = false;
  data.pirateDisengage = {
    squadId: rec.squadId,
    patrolId: rec.patrolId,
    phase: 'surrender',
    reason: rec.reason,
    until: rec.until,
  };
}

function badProfitRisk(members, state) {
  if (!members.length || !members.every(isProfitMotivated)) return false;
  const player = entityFor(state, state.playerId);
  if (!player || player.alive === false || hullFraction(player) < 0.35) return false;
  const average = members.reduce((sum, entity) => sum + hullFraction(entity), 0) / members.length;
  return average <= 0.38;
}

function isProfitMotivated(entity) {
  const ai = entity && entity.data && entity.data.ai || {};
  return ai.motive === 'cargo_extortion' || ai.motive === 'toll_collection';
}

function isRelentlessNarrativeCombatant(entity) {
  const ai = entity && entity.data && entity.data.ai || {};
  return ai.motive === 'personal_vendetta';
}

function averageHullFraction(members) {
  return members.length
    ? members.reduce((sum, entity) => sum + hullFraction(entity), 0) / members.length
    : 1;
}

function hullFraction(entity) {
  const max = Math.max(1, Number(entity && entity.hullMax) || 1);
  return Math.max(0, Math.min(1, (Number(entity && entity.hull) || 0) / max));
}

function entityFor(state, id) {
  return id == null || !state.entities || typeof state.entities.get !== 'function'
    ? null
    : state.entities.get(id) || null;
}

function fleeVector(entity, patrol) {
  const dx = (entity.pos && entity.pos.x || 0) - (patrol && patrol.pos && patrol.pos.x || 0);
  const dz = (entity.pos && entity.pos.z || 0) - (patrol && patrol.pos && patrol.pos.z || 0);
  const len = Math.hypot(dx, dz) || 1;
  return { x: dx / len, z: dz / len };
}

function decisionBark(rec, entity, seed) {
  if (rec.outcome === 'surrendered') return 'Weapons cold. We yield.';
  if (rec.reason === 'damage-retreat') return "Drive's failing. Breaking off.";
  if (rec.reason === 'wing-loss') return "Wing broken. We're pulling out.";
  const factionId = entity && entity.factionId || 'faction_reach';
  return barkFor(factionId, 'flee', hash32(seed == null ? 0 : seed, rec.squadId, 'pirateDisengageFlee'));
}

export default pirateDisengage;
