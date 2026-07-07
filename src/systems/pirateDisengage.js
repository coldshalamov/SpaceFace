// BP-13/B8 Break-Off-When-Patrol-Arrives.
//
// Trigger layer only: detects lawful patrol pressure near active pirate squads, waits a short nerve
// beat, then supplies existing AI-facing flee fields and one flee bark. It does not spawn, despawn,
// or edit SG-06/combat/encounter code.
import { barkFor } from '../data/barks.js';
import { pirateDoctrineForEntity } from '../data/pirateDoctrines.js';
import { hash32 } from '../core/rng.js';

const PATROL_RADIUS = 900;
const NERVE_DELAY_S = 1.0;
const FLEE_DURATION_S = 18.0;
const PLAYER_TEAM = 0;

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
    if (!patrols.length) return;

    const squads = pirateSquads(state);
    for (const [squadId, members] of squads) {
      let rec = own.squads[squadId];
      if (rec && rec.disengaged) continue;
      const patrol = nearestPatrol(members, patrols);
      if (!patrol) continue;
      if (!rec) {
        rec = {
          squadId,
          patrolId: patrol.id,
          firstSeenAt: now,
          triggerAt: now + NERVE_DELAY_S,
          disengaged: false,
          spoken: false,
        };
        own.squads[squadId] = rec;
      }
      rec.memberIds = members.map((e) => e.id);
      rec.patrolId = patrol.id;
      if (now < rec.triggerAt) continue;
      this._disengage(rec, members, patrol, now, state);
    }
  },

  _disengage(rec, members, patrol, now, state) {
    rec.disengaged = true;
    rec.disengagedAt = now;
    rec.until = now + FLEE_DURATION_S;
    for (const entity of members) markFleeing(entity, patrol, rec, state);
    this._speak(rec, members[0] || null);
    this._emit('pirateDisengage:triggered', {
      squadId: rec.squadId,
      patrolId: rec.patrolId,
      memberIds: rec.memberIds.slice(),
      reason: 'lawful-patrol-nearby',
      t: now,
    });
  },

  _speak(rec, entity) {
    if (rec.spoken) return;
    rec.spoken = true;
    const seed = this.state && this.state.meta && this.state.meta.seed;
    const factionId = entity && entity.factionId || 'faction_reach';
    const text = barkFor(factionId, 'flee', hash32(seed == null ? 0 : seed, rec.squadId, 'pirateDisengageFlee'));
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
      situation: 'flee',
      text,
      factionId,
    });
  },

  _emit(evt, payload) {
    if (this.bus && typeof this.bus.emit === 'function') this.bus.emit(evt, payload);
  },
};

function freshState() {
  return { squads: {} };
}

function ensureState(state) {
  if (!state.pirateDisengage || typeof state.pirateDisengage !== 'object') state.pirateDisengage = freshState();
  if (!state.pirateDisengage.squads || typeof state.pirateDisengage.squads !== 'object') state.pirateDisengage.squads = {};
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

function pirateSquads(state) {
  const out = new Map();
  for (const entity of state.entityList || []) {
    if (!isActivePirate(entity, state)) continue;
    const ai = entity.data && entity.data.ai || {};
    if (ai.pirateDisengaged === true) continue;
    const squadId = String(ai.squadId || ai.encounterId || `entity:${entity.id}`);
    if (!out.has(squadId)) out.set(squadId, []);
    out.get(squadId).push(entity);
  }
  return out;
}

function isActivePirate(entity, state) {
  if (!entity || entity.alive === false || (entity.type !== 'ship' && entity.type !== 'drone')) return false;
  if (entity.id === state.playerId || entity.team === PLAYER_TEAM || entity.team === 2) return false;
  const data = entity.data || {};
  const ai = data.ai || {};
  if (!ai || ai.lawful || ai.passive) return false;
  const doctrine = pirateDoctrineForEntity(entity);
  const words = `${ai.doctrine || ''} ${ai.archetype || ''} ${ai.role || ''} ${data.role || ''} ${data.encounterKind || ''}`.toLowerCase();
  return !!doctrine || words.includes('pirate') || words.includes('raider') || words.includes('scavenger');
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

function dist2(a, b) {
  const dx = (a.pos && a.pos.x || 0) - (b.pos && b.pos.x || 0);
  const dz = (a.pos && a.pos.z || 0) - (b.pos && b.pos.z || 0);
  return dx * dx + dz * dz;
}

function markFleeing(entity, patrol, rec, state) {
  const data = entity.data || (entity.data = {});
  const ai = data.ai || (data.ai = {});
  ai.fsm = 'flee';
  ai.forcePlayerTarget = false;
  ai.huntPlayer = false;
  ai.pirateDisengaged = true;
  ai.disengageUntil = rec.until;
  if (Array.isArray(ai.hostileTeams)) ai.hostileTeams = ai.hostileTeams.filter((team) => team !== PLAYER_TEAM);
  const combat = data.combat || (data.combat = {});
  if (combat.targetId === state.playerId) combat.targetId = null;
  if (combat.lockTarget === state.playerId) combat.lockTarget = null;
  const intent = data.intent || (data.intent = {});
  intent.fire = false;
  const away = fleeVector(entity, patrol);
  intent.moveX = away.x;
  intent.moveZ = away.z;
  data.pirateDisengage = {
    squadId: rec.squadId,
    patrolId: rec.patrolId,
    phase: 'flee',
    reason: 'lawful-patrol-nearby',
    until: rec.until,
  };
}

function fleeVector(entity, patrol) {
  const dx = (entity.pos && entity.pos.x || 0) - (patrol.pos && patrol.pos.x || 0);
  const dz = (entity.pos && entity.pos.z || 0) - (patrol.pos && patrol.pos.z || 0);
  const len = Math.hypot(dx, dz) || 1;
  return { x: dx / len, z: dz / len };
}

export default pirateDisengage;
