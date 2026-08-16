// wingMorale.js - BP-02.1/C12 Wing Morale.
//
// A thin observer over existing combat/AI seams. It does not rebuild squad logic: it reads the
// live AI roster shape already written on entities (`data.ai.squadId` / `preferredRole`) and writes
// only short-lived morale intent flags on those same AI records.

import { THUNDERCHILD, THUNDERCHILD_TITLE_ID } from '../data/titles.js';
import { hash32 } from '../core/rng.js';

const STATE_VERSION = 1;
const SCATTER_S = 8;
const FLEE_CARGO_TTL_S = 75;
const ROLE_LEADER = 'leader';
const ROLE_ESCORT = 'escort';

function ensureState(state) {
  if (!state) return null;
  if (!state.wingMorale || typeof state.wingMorale !== 'object') {
    state.wingMorale = freshState();
  }
  const own = state.wingMorale;
  own.schemaVersion = STATE_VERSION;
  if (!own.brokenSquads || typeof own.brokenSquads !== 'object') own.brokenSquads = {};
  if (!own.scatter || typeof own.scatter !== 'object') own.scatter = {};
  if (!own.enraged || typeof own.enraged !== 'object') own.enraged = {};
  if (!own.blockedSquads || typeof own.blockedSquads !== 'object') own.blockedSquads = {};
  return own;
}

function freshState() {
  return { schemaVersion: STATE_VERSION, brokenSquads: {}, scatter: {}, enraged: {}, blockedSquads: {} };
}

export function wingMoraleState(state) {
  const own = ensureState(state);
  return {
    brokenSquads: { ...(own && own.brokenSquads || {}) },
    scatter: { ...(own && own.scatter || {}) },
    enraged: { ...(own && own.enraged || {}) },
    blockedSquads: { ...(own && own.blockedSquads || {}) },
  };
}

function entityFor(state, id) {
  if (id == null || !state || !state.entities || typeof state.entities.get !== 'function') return null;
  return state.entities.get(id) || null;
}

function aiOf(entity) {
  const data = entity && entity.data;
  return data && data.ai || null;
}

function squadIdOf(entity) {
  const ai = aiOf(entity);
  return ai && (ai.squadId || ai.wingId || ai.formationGroupId) ? String(ai.squadId || ai.wingId || ai.formationGroupId) : null;
}

function roleOf(entity) {
  const ai = aiOf(entity) || {};
  const data = entity && entity.data || {};
  return String(ai.preferredRole || ai.role || ai.encounterRole || data.role || '').toLowerCase();
}

function isLeader(entity) {
  const role = roleOf(entity);
  return role === ROLE_LEADER || role === 'lead' || role === 'captain' || role === 'boss';
}

function isEscort(entity) {
  const role = roleOf(entity);
  return role === ROLE_ESCORT || role === 'guard' || role === 'screen';
}

function liveSquadMembers(state, squadId, includeDead = null) {
  const out = [];
  if (!state || !squadId || !Array.isArray(state.entityList)) return out;
  for (const entity of state.entityList) {
    if (!entity || entity.id === state.playerId || entity.type !== 'ship') continue;
    if (squadIdOf(entity) !== squadId) continue;
    if (entity.alive === false && entity !== includeDead) continue;
    out.push(entity);
  }
  if (includeDead && !out.includes(includeDead) && squadIdOf(includeDead) === squadId) out.push(includeDead);
  return out;
}

function fallbackLeader(members) {
  let best = null;
  for (const entity of members) {
    if (!entity) continue;
    if (!best || massOf(entity) > massOf(best) || (massOf(entity) === massOf(best) && compareId(entity.id, best.id) < 0)) {
      best = entity;
    }
  }
  return best;
}

function massOf(entity) {
  const mass = Number(entity && entity.mass);
  return Number.isFinite(mass) ? mass : 0;
}

function compareId(a, b) {
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

function fleeCargoVector(entity, rec) {
  const vx = Number(entity && entity.vel && entity.vel.x) || 0;
  const vz = Number(entity && entity.vel && entity.vel.z) || 0;
  const speed = Math.hypot(vx, vz);
  let baseX = speed > 0.5 ? -vx / speed : 0;
  let baseZ = speed > 0.5 ? -vz / speed : 0;
  if (speed <= 0.5 && rec && rec.breakPos && entity && entity.pos) {
    baseX = entity.pos.x - rec.breakPos.x;
    baseZ = entity.pos.z - rec.breakPos.z;
    const length = Math.hypot(baseX, baseZ);
    if (length > 1e-6) { baseX /= length; baseZ /= length; }
  }
  const seed = hash32(rec && rec.squadId || '', entity && entity.id, rec && rec.tick || 0, 'flee-cargo');
  if (Math.hypot(baseX, baseZ) <= 1e-6) {
    const fallback = (seed / 0x100000000) * Math.PI * 2;
    baseX = Math.cos(fallback); baseZ = Math.sin(fallback);
  }
  const jitter = ((hash32(seed, 'jitter') / 0x100000000) - 0.5) * 0.5;
  const c = Math.cos(jitter), s = Math.sin(jitter);
  return { x: baseX * c - baseZ * s, z: baseX * s + baseZ * c };
}

function killedId(payload) {
  return payload && (payload.id != null ? payload.id : payload.entityId);
}

function targetId(payload) {
  return payload && (payload.targetId != null ? payload.targetId : payload.entityId != null ? payload.entityId : payload.id);
}

function isCommsSubsystem(subsystemId) {
  const id = String(subsystemId || '').toLowerCase();
  return id.includes('comm') || id.includes('sensor');
}

function wardFor(state, escort, payload) {
  const ai = aiOf(escort) || {};
  const data = escort && escort.data || {};
  const explicit = ai.wardId || ai.guardTargetId || ai.escortTargetId || data.wardId || data.guardTargetId || data.escortTargetId;
  const entity = entityFor(state, explicit);
  if (entity) return entity;
  const killer = entityFor(state, payload && payload.killerId);
  if (killer && killer.alive !== false && killer.id !== escort.id) return killer;
  return null;
}

function thunderchildHolder(state) {
  const title = state && state.story && state.story.titles && state.story.titles.byId
    && state.story.titles.byId[THUNDERCHILD_TITLE_ID];
  if (!title || title.status !== 'held' || !title.holderKey || !Array.isArray(state.entityList)) return null;
  return state.entityList.find((entity) => entity && entity.alive !== false && entity.data
    && entity.data.worldRecordId === title.holderKey) || null;
}

function thunderchildAuraApplies(state, entity) {
  const holder = thunderchildHolder(state);
  if (!holder || !entity || holder.id === entity.id || holder.team == null || holder.team !== entity.team
    || !holder.pos || !entity.pos) return false;
  const dx = holder.pos.x - entity.pos.x;
  const dz = holder.pos.z - entity.pos.z;
  return dx * dx + dz * dz <= THUNDERCHILD.aura.radius * THUNDERCHILD.aura.radius;
}

export const wingMorale = {
  name: 'wingMorale',

  init(ctx) {
    this.state = ctx && ctx.state;
    this.bus = ctx && ctx.bus;
    this.helpers = ctx && ctx.helpers || {};
    ensureState(this.state);
    this._onKilled = (payload) => this._onEntityKilled(payload || {});
    this._onSubsystemDisabled = (payload) => this._onSubsystem(payload || {});
    this._onNewGame = () => this.newGame();
    if (this.bus && typeof this.bus.on === 'function') {
      this.bus.on('entity:killed', this._onKilled);
      this.bus.on('combat:subsystemDisabled', this._onSubsystemDisabled);
      this.bus.on('game:newGame', this._onNewGame);
    }
  },

  newGame() {
    if (this.state) this.state.wingMorale = freshState();
  },

  update(_dt, state) {
    const own = ensureState(state);
    const now = state && state.simTime || 0;
    for (const entityId of Object.keys(own.scatter)) {
      const rec = own.scatter[entityId];
      if (!rec || now < rec.until) continue;
      const entity = entityFor(state, Number(entityId));
      if (entity && entity.data) {
        const ai = entity.data.ai || (entity.data.ai = {});
        if (ai.wingMorale && ai.wingMorale.reason === rec.reason) delete ai.wingMorale;
        if (ai.forceFlee === true && ai._wingMoraleUntil === rec.until) delete ai.forceFlee;
        if (ai._wingMoraleUntil === rec.until) delete ai._wingMoraleUntil;
        if (ai._moraleUntil === rec.until) delete ai._moraleUntil;
        if (entity.data.morale === 'scattered') delete entity.data.morale;
      }
      delete own.scatter[entityId];
    }
  },

  _onEntityKilled(payload) {
    const state = this.state;
    const entity = entityFor(state, killedId(payload));
    if (!entity || entity.id === state.playerId) return null;
    const squadId = squadIdOf(entity);
    if (squadId) this._maybeBreakSquad(entity, squadId, payload);
    if (isEscort(entity)) this._maybeEnrageWard(entity, payload);
    return null;
  },

  _maybeBreakSquad(killed, squadId, payload) {
    const state = this.state;
    const own = ensureState(state);
    const members = liveSquadMembers(state, squadId, killed);
    if (members.length < 2) return null;
    const explicitLeader = members.find(isLeader);
    const leader = explicitLeader || fallbackLeader(members);
    if (!leader || leader.id !== killed.id) return null;
    if (own.brokenSquads[squadId]) return own.brokenSquads[squadId];

    const now = state.simTime || 0;
    const until = now + SCATTER_S;
    const survivors = members.filter((entity) => entity && entity.id !== killed.id && entity.alive !== false);
    if (!survivors.length) return null;
    const rec = {
      squadId,
      leaderId: killed.id,
      survivorIds: survivors.map((entity) => entity.id),
      reason: 'leader_killed',
      tick: state.tick || 0,
      t: now,
      until,
      breakPos: payload && payload.pos
        ? { x: Number(payload.pos.x) || 0, z: Number(payload.pos.z) || 0 }
        : null,
    };
    own.brokenSquads[squadId] = rec;
    for (const survivor of survivors) this._scatter(survivor, rec, payload);
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('ai:formationBroken', { groupId: squadId, squadId, leaderId: killed.id, reason: rec.reason });
      this.bus.emit('wingMorale:broken', { ...rec });
    }
    this._sayBroken(squadId);
    return rec;
  },

  _scatter(entity, rec, payload) {
    const state = this.state;
    const own = ensureState(state);
    const data = entity.data || (entity.data = {});
    const ai = data.ai || (data.ai = {});
    const intent = data.intent || (data.intent = {});
    const auraActive = thunderchildAuraApplies(state, entity);
    const until = rec.t + SCATTER_S * (auraActive ? 1 - THUNDERCHILD.aura.morale : 1);
    ai.forceFlee = true;
    ai.fsm = 'flee';
    ai._wingMoraleUntil = until;
    ai._moraleUntil = until;
    ai._scatterFrom = payload && payload.pos ? { x: payload.pos.x || 0, z: payload.pos.z || 0 } : null;
    ai.wingMorale = {
      squadId: rec.squadId,
      reason: rec.reason,
      leaderId: rec.leaderId,
      until,
      auraTitleId: auraActive ? THUNDERCHILD_TITLE_ID : null,
    };
    data.morale = 'scattered';
    intent.fire = false;
    intent.fireGroup = null;
    intent.boost = true;
    own.scatter[entity.id] = {
      squadId: rec.squadId,
      reason: rec.reason,
      until,
      auraTitleId: auraActive ? THUNDERCHILD_TITLE_ID : null,
    };
    this._dumpFleeCargo(entity, rec);
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('ai:flee', {
        entityId: entity.id,
        squadId: rec.squadId,
        reason: 'wingMorale:leaderDown',
        until,
        auraTitleId: auraActive ? THUNDERCHILD_TITLE_ID : null,
      });
    }
  },

  _dumpFleeCargo(entity, rec) {
    const data = entity && entity.data;
    const reserve = data && data.fleeCargo;
    const qty = Math.max(0, Math.floor(Number(reserve && reserve.qty) || 0));
    const commodityId = reserve && typeof reserve.commodityId === 'string' ? reserve.commodityId : '';
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (!data || !commodityId || qty <= 0 || reserve.dumped === true || typeof spawnEntity !== 'function') return null;
    const dir = fleeCargoVector(entity, rec);
    const distance = Math.max(3, Number(entity.radius) || 0) + 4;
    const speed = 18;
    const pickup = spawnEntity({
      type: 'pickup',
      pos: { x: entity.pos.x + dir.x * distance, z: entity.pos.z + dir.z * distance },
      vel: {
        x: (Number(entity.vel && entity.vel.x) || 0) + dir.x * speed,
        z: (Number(entity.vel && entity.vel.z) || 0) + dir.z * speed,
      },
      radius: Math.max(2, Math.min(3.5, 1.8 + qty * 0.35)),
      mass: Math.max(4, qty * 4),
      collides: true,
      flags: { persistent: true },
      data: {
        kind: 'cargo', commodityId, amount: qty,
        despawnAt: (this.state.simTime || 0) + FLEE_CARGO_TTL_S,
        fleeCargoDump: {
          schemaVersion: 1, sourceEntityId: entity.id, squadId: rec.squadId,
          leaderId: rec.leaderId, tick: rec.tick,
        },
      },
    });
    if (!pickup) return null;
    reserve.qty = 0;
    reserve.dumped = true;
    reserve.dumpedAt = this.state.simTime || 0;
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('wingMorale:cargoDumped', {
        entityId: entity.id, pickupId: pickup.id == null ? null : pickup.id,
        commodityId, amount: qty, squadId: rec.squadId,
      });
    }
    return pickup;
  },

  _sayBroken(squadId) {
    const voice = this.helpers && this.helpers.voice;
    if (!voice || typeof voice.say !== 'function') return false;
    return voice.say({
      channel: 'info',
      kind: 'combat',
      id: `wingMorale:${squadId}:broken`,
      text: 'SQUAD BROKEN',
      ttl: 2,
    });
  },

  _maybeEnrageWard(escort, payload) {
    const state = this.state;
    const ward = wardFor(state, escort, payload);
    if (!ward || ward.id === escort.id) return null;
    const own = ensureState(state);
    const data = ward.data || (ward.data = {});
    const ai = data.ai || (data.ai = {});
    ai.enraged = true;
    ai.focusTargetId = payload && payload.killerId != null ? payload.killerId : ai.focusTargetId || null;
    ai.wingMorale = { reason: 'escort_lost', escortId: escort.id, at: state.simTime || 0 };
    data.morale = 'enraged';
    const rec = {
      wardId: ward.id,
      escortId: escort.id,
      killerId: payload && payload.killerId != null ? payload.killerId : null,
      tick: state.tick || 0,
      t: state.simTime || 0,
    };
    own.enraged[ward.id] = rec;
    if (this.bus && typeof this.bus.emit === 'function') this.bus.emit('wingMorale:enraged', { ...rec });
    return rec;
  },

  _onSubsystem(payload) {
    if (!isCommsSubsystem(payload.subsystemId)) return null;
    const entity = entityFor(this.state, targetId(payload));
    const squadId = squadIdOf(entity);
    if (!entity || !squadId) return null;
    const members = liveSquadMembers(this.state, squadId);
    if (!members.length) return null;
    const own = ensureState(this.state);
    const rec = {
      squadId,
      entityId: entity.id,
      subsystemId: String(payload.subsystemId || ''),
      tick: this.state.tick || 0,
      t: this.state.simTime || 0,
    };
    own.blockedSquads[squadId] = rec;
    for (const member of members) {
      const data = member.data || (member.data = {});
      const ai = data.ai || (data.ai = {});
      ai.reinforcementBlocked = true;
      ai.requestingReinforcement = false;
      data.reinforcements = null;
    }
    if (this.bus && typeof this.bus.emit === 'function') this.bus.emit('wingMorale:reinforcementBlocked', { ...rec });
    return rec;
  },

  destroy() {
    if (this.bus && typeof this.bus.off === 'function') {
      if (this._onKilled) this.bus.off('entity:killed', this._onKilled);
      if (this._onSubsystemDisabled) this.bus.off('combat:subsystemDisabled', this._onSubsystemDisabled);
      if (this._onNewGame) this.bus.off('game:newGame', this._onNewGame);
    }
    this._onKilled = this._onSubsystemDisabled = this._onNewGame = null;
  },
};

export default wingMorale;
