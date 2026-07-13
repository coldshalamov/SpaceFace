// BP-13/B10 Named Crews & Aces.
//
// Durable event layer only: listens for named ace outcomes, records state.aceMemory, and emits the
// station-news seam. It does not spawn ships or change hostility.
import {
  PIRATE_PROMOTION_MAX_TIER,
  aceById,
  aceByName,
  aceFromText,
  newsForAceTransition,
  returnCrewForAce,
  returnLevelBandsForAce,
  returnPlanForAce,
} from '../data/namedAces.js';
import { barkFor } from '../data/barks.js';
import { hash32 } from '../core/rng.js';
import { makeEnemySpawnSpec } from './combat.js';

export const ACE_MEMORY_VERSION = 1;

const META_KEYS = new Set(['schemaVersion', 'news', 'activeReturns']);
const RETURN_CHECK_S = 0.5;

export const aceMemory = {
  name: 'aceMemory',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || {};
    this._subs = [];
    this._returnAccum = 0;
    ensureMemory(this.state);
    this._listen('namedAce:appeared', (p) => this._appeared(p));
    this._listen('namedAce:fled', (p) => this._transition('fled', p));
    this._listen('namedAce:defeated', (p) => this._transition('defeated', p));
    this._listen('encounter:receipt', (p) => this._receipt(p));
    this._listen('entity:destroyed', (p) => this._entityDestroyed(p));
    this._listen('massline:tumbled', (p) => this._flung(p));
  },

  newGame() {
    if (this.state) this.state.aceMemory = freshMemory();
  },

  serialize() {
    return clonePlain(ensureMemory(this.state));
  },

  deserialize(data) {
    if (this.state) this.state.aceMemory = normalizeMemory(data);
  },

  update(dt, state) {
    if (state.mode && state.mode !== 'flight') return;
    this.state = state;
    this._returnAccum = (this._returnAccum || 0) + dt;
    if (this._returnAccum < RETURN_CHECK_S) return;
    this._returnAccum = 0;
    this._processReturns(state);
  },

  destroy() {
    if (Array.isArray(this._subs)) {
      for (const off of this._subs) {
        try { off(); } catch (err) { /* listener cleanup must not throw */ }
      }
      this._subs.length = 0;
    }
  },

  _listen(evt, fn) {
    if (!this.bus || typeof this.bus.on !== 'function') return;
    const off = this.bus.on(evt, fn);
    if (typeof off === 'function') this._subs.push(off);
  },

  _appeared(payload) {
    const ace = resolveAce(payload);
    if (!ace) return;
    const rec = recordFor(ensureMemory(this.state), ace);
    const first = rec.encountered !== true;
    rec.encountered = true;
    rec.encounterCount = (rec.encounterCount | 0) + 1;
    rec.lastSeenAt = nowOf(this.state, payload);
    rec.lastSectorId = sectorOf(this.state, payload);
    if (first) this._emitTransition('encountered', ace, rec);
    if (!rec.signatureSpoken) {
      rec.signatureSpoken = true;
      this._speakSignature(ace);
    }
  },

  _transition(transition, payload) {
    const ace = resolveAce(payload);
    if (!ace) return;
    const memory = ensureMemory(this.state);
    const rec = recordFor(memory, ace);
    const now = nowOf(this.state, payload);
    const sectorId = sectorOf(this.state, payload);
    rec.encountered = true;
    rec.lastSeenAt = now;
    rec.lastSectorId = sectorId;

    if (transition === 'fled') {
      if (rec.defeated === true) return;
      const first = rec.fled !== true;
      rec.fled = true;
      rec.fledAt = now;
      rec.fleeCount = (rec.fleeCount | 0) + 1;
      rec.returnsBigger = true;
      rec.returnScheduled = true;
      rec.returnTier = Math.min(PIRATE_PROMOTION_MAX_TIER, Math.max(1, (rec.returnTier | 0) + 1));
      Object.assign(rec, returnPlanForAce(ace, seedOf(this.state), now));
      if (first) this._completeTransition('fled', ace, rec);
      return;
    }

    if (transition === 'defeated') {
      const first = rec.defeated !== true;
      rec.defeated = true;
      rec.defeatedAt = now;
      rec.returnScheduled = false;
      rec.returnsBigger = false;
      rec.returnAt = null;
      if (first) this._completeTransition('defeated', ace, rec);
    }
  },

  _receipt(payload) {
    if (!payload || payload.shape !== 'named_hunter') return;
    const outcome = payload.outcome === 'killed'
      ? 'defeated'
      : (payload.outcome === 'escaped' ? 'fled' : null);
    if (!outcome) return;
    const ace = resolveAce(payload) || aceFromText(payload.text);
    if (!ace) return;
    this._transition(outcome, { ...payload, aceId: ace.id });
  },

  _flung(payload) {
    const victimId = payload && payload.victimId;
    const entity = victimId != null && this.state && this.state.entities
      ? this.state.entities.get(victimId)
      : null;
    const ace = resolveAceFromEntity(entity);
    if (!ace) return;
    const rec = recordFor(ensureMemory(this.state), ace);
    rec.encountered = true;
    rec.flungCount = (rec.flungCount | 0) + 1;
    rec.lastFlungAt = nowOf(this.state, payload);
    rec.lastFlungCause = String(payload.cause || 'massline');
    rec.lastFlungSpin = Number.isFinite(payload.spin) ? payload.spin : 0;
    rec.lastSeenAt = rec.lastFlungAt;
    rec.lastSectorId = sectorOf(this.state, payload);
    this._emitTransition('flung', ace, rec);
  },

  _processReturns(state) {
    const memory = ensureMemory(state);
    const now = state.simTime || 0;
    for (const [id, rec] of Object.entries(memory)) {
      if (META_KEYS.has(id) || !rec || typeof rec !== 'object') continue;
      if (rec.defeated === true || rec.returnScheduled !== true) continue;
      if (Number.isFinite(rec.nextReturnAttemptAt) && rec.nextReturnAttemptAt > now) continue;
      if (!Number.isFinite(rec.returnAt) || rec.returnAt > now) continue;
      const ace = aceById(id);
      if (!ace) continue;
      this._spawnReturn(ace, rec, now);
    }
  },

  _spawnReturn(ace, rec, now) {
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    const budget = this.helpers && this.helpers.spawnBudget;
    const requestId = `aceReturn:${ace.id}:${rec.returnSeed || 0}:${rec.returnTier || 1}`;
    const crew = returnCrewForAce(ace, rec.returnTier || 1);
    const bands = returnLevelBandsForAce(ace, rec.returnTier || 1);
    const wanted = crew.length;
    emit(this.bus, 'aceMemory:returnRequested', {
      aceId: ace.id,
      aceName: ace.name,
      requestId,
      returnTier: rec.returnTier || 1,
      wanted,
      levelBand: bands.current.slice(),
      previousLevelBand: bands.previous.slice(),
    });

    if (typeof spawnEntity !== 'function') {
      rec.nextReturnAttemptAt = now + 10;
      return;
    }

    let grant = wanted;
    if (budget && typeof budget.request === 'function') {
      grant = budget.request(wanted, requestId);
      if (grant <= 0) {
        rec.nextReturnAttemptAt = now + 10;
        return;
      }
    }

    const spawnedIds = [];
    for (let i = 0; i < crew.length && spawnedIds.length < grant; i++) {
      const ship = crew[i];
      const spec = this._returnShipSpec(ace, rec, requestId, ship, i);
      const entity = spawnEntity(spec);
      if (entity && entity.id != null) {
        spawnedIds.push(entity.id);
        rememberActiveReturn(this.state, entity.id, ace.id, requestId);
      }
    }
    if (budget && typeof budget.releaseSome === 'function' && spawnedIds.length < grant) {
      budget.releaseSome(requestId, grant - spawnedIds.length);
    }
    if (!spawnedIds.length) {
      if (budget && typeof budget.release === 'function') budget.release(requestId);
      rec.nextReturnAttemptAt = now + 10;
      return;
    }

    rec.returnScheduled = false;
    rec.returned = true;
    rec.returnedAt = now;
    rec.returnRequestId = requestId;
    rec.activeReturnIds = spawnedIds.slice();
    rec.levelBand = bands.current.slice();
    rec.previousLevelBand = bands.previous.slice();
    rec.spawnedCount = spawnedIds.length;
    this._speakReturnTaunt(ace, rec, requestId);
    emit(this.bus, 'aceMemory:returnSpawned', {
      aceId: ace.id,
      aceName: ace.name,
      requestId,
      returnTier: rec.returnTier || 1,
      levelBand: bands.current.slice(),
      previousLevelBand: bands.previous.slice(),
      spawnedIds: spawnedIds.slice(),
      t: now,
    });
  },

  _returnShipSpec(ace, rec, requestId, ship, index) {
    const pos = returnPosition(this.state, ace, rec, index);
    const spec = makeEnemySpawnSpec(ship.archetype, ship.level, pos, { factionId: ace.factionId || 'faction_reach' });
    spec.data = spec.data || {};
    spec.data.ai = spec.data.ai || {};
    const ai = spec.data.ai;
    ai.squadId = requestId;
    ai.doctrine = 'scavenger';
    ai.formation = 'wedge';
    ai.spawnContext = 'ace_return';
    ai.encounterKind = 'named_ace_return';
    ai.encounterRole = ship.role;
    ai.forcePlayerTarget = true;
    ai.hostileTeams = [0];
    ai.passive = false;
    if (ship.role === 'boss') {
      ai.name = ace.name;
      spec.data.encounterBoss = true;
      spec.data.bountyCr = (spec.data.bountyCr || 0) + 250 * Math.max(1, rec.returnTier | 0);
    }
    spec.data.aceMemory = {
      aceId: ace.id,
      aceName: ace.name,
      requestId,
      role: ship.role,
      promoted: true,
      returnTier: rec.returnTier || 1,
      level: ship.level,
      gimmickTag: ace.gimmickTag || 'ace',
    };
    return spec;
  },

  _speakReturnTaunt(ace, rec, requestId) {
    if (rec.lastTauntRequestId === requestId) return;
    rec.lastTauntRequestId = requestId;
    const bark = barkFor(
      ace.factionId || 'faction_reach',
      'taunt',
      hash32(seedOf(this.state), ace.id, requestId, 'taunt'),
    );
    const text = `${ace.name}: you should have finished me. ${bark}`;
    const voice = this.helpers && this.helpers.voice;
    if (voice && typeof voice.say === 'function') {
      voice.say({
        channel: 'bark',
        text,
        kind: 'aceMemory',
        id: `aceMemory:${ace.id}:return-taunt`,
        factionId: ace.factionId || 'faction_reach',
        ttl: 2,
      });
    }
    emit(this.bus, 'aceMemory:voice', {
      aceId: ace.id,
      aceName: ace.name,
      situation: 'taunt',
      text,
    });
  },

  _entityDestroyed(payload) {
    const id = payload && payload.id;
    if (id == null || !this.state) return;
    const memory = ensureMemory(this.state);
    const active = memory.activeReturns && memory.activeReturns[String(id)];
    if (!active) return;
    delete memory.activeReturns[String(id)];
    const rec = memory[active.aceId];
    if (rec && Array.isArray(rec.activeReturnIds)) {
      rec.activeReturnIds = rec.activeReturnIds.filter((entityId) => entityId !== id);
    }
    const budget = this.helpers && this.helpers.spawnBudget;
    if (budget && typeof budget.releaseSome === 'function') budget.releaseSome(active.requestId, 1);
  },

  _completeTransition(transition, ace, rec) {
    this._emitTransition(transition, ace, rec);
    this._emitNews(transition, ace, rec);
  },

  _emitTransition(transition, ace, rec) {
    emit(this.bus, 'aceMemory:transition', {
      aceId: ace.id,
      aceName: ace.name,
      crew: ace.crew,
      transition,
      record: clonePlain(rec),
    });
  },

  _emitNews(transition, ace, rec) {
    const headline = newsForAceTransition(ace, transition);
    if (!headline) return;
    const key = `${ace.id}:${transition}`;
    const memory = ensureMemory(this.state);
    memory.news[key] = true;
    emit(this.bus, 'news:headline', {
      headline,
      text: headline,
      kind: `ace-${transition}`,
      aceId: ace.id,
      aceName: ace.name,
      crew: ace.crew,
      sectorId: rec.lastSectorId || null,
    });
  },

  _speakSignature(ace) {
    const voice = this.helpers && this.helpers.voice;
    const payload = {
      channel: 'bark',
      text: ace.signatureBark,
      kind: 'aceMemory',
      id: `aceMemory:${ace.id}:signature`,
      factionId: ace.factionId || 'faction_reach',
      ttl: 2,
    };
    if (voice && typeof voice.say === 'function') voice.say(payload);
    emit(this.bus, 'aceMemory:voice', {
      aceId: ace.id,
      aceName: ace.name,
      situation: 'signature',
      text: ace.signatureBark,
    });
  },
};

function resolveAce(payload) {
  if (!payload) return null;
  return aceById(payload.aceId || payload.id || payload.captainId)
    || aceByName(payload.aceName || payload.name)
    || aceFromText(payload.text || payload.headline || '');
}

function resolveAceFromEntity(entity) {
  if (!entity || !entity.data) return null;
  const data = entity.data;
  const memory = data.aceMemory || {};
  const ai = data.ai || {};
  return aceById(memory.aceId || data.aceId || ai.aceId)
    || aceByName(memory.aceName || data.aceName || ai.name || data.name)
    || aceFromText(data.callsign || data.name || ai.name || '');
}

function freshMemory() {
  return { schemaVersion: ACE_MEMORY_VERSION, news: {}, activeReturns: {} };
}

function ensureMemory(state) {
  if (!state) return freshMemory();
  state.aceMemory = normalizeMemory(state.aceMemory);
  return state.aceMemory;
}

function normalizeMemory(input) {
  const out = freshMemory();
  if (!input || typeof input !== 'object') return out;
  out.news = clonePlain(input.news || {});
  out.activeReturns = clonePlain(input.activeReturns || {});
  if (input.aces && typeof input.aces === 'object') {
    for (const [id, rec] of Object.entries(input.aces)) out[id] = normalizeRecord(id, rec);
  }
  for (const [id, rec] of Object.entries(input)) {
    if (META_KEYS.has(id) || id === 'aces') continue;
    if (!rec || typeof rec !== 'object') continue;
    out[id] = normalizeRecord(id, rec);
  }
  return out;
}

function recordFor(memory, ace) {
  const existing = memory[ace.id];
  const rec = normalizeRecord(ace.id, existing, ace);
  memory[ace.id] = rec;
  return rec;
}

function normalizeRecord(id, input, ace = null) {
  const source = ace || aceById(id) || {};
  const rec = input && typeof input === 'object' ? clonePlain(input) : {};
  rec.id = rec.id || id;
  rec.name = rec.name || source.name || id;
  rec.crew = rec.crew || source.crew || 'Unknown Crew';
  rec.gimmickTag = rec.gimmickTag || source.gimmickTag || 'ace';
  rec.encountered = rec.encountered === true;
  rec.fled = rec.fled === true;
  rec.defeated = rec.defeated === true;
  rec.returnScheduled = rec.returnScheduled === true;
  rec.returnsBigger = rec.returnsBigger === true;
  rec.encounterCount = rec.encounterCount | 0;
  rec.fleeCount = rec.fleeCount | 0;
  rec.flungCount = rec.flungCount | 0;
  rec.returnTier = rec.returnTier | 0;
  return rec;
}

function seedOf(state) {
  return state && state.meta && Number.isFinite(state.meta.seed) ? state.meta.seed >>> 0 : 0;
}

function nowOf(state, payload) {
  if (payload && Number.isFinite(payload.t)) return Number(payload.t);
  return state && Number.isFinite(state.simTime) ? state.simTime : 0;
}

function sectorOf(state, payload) {
  if (payload && payload.sectorId) return payload.sectorId;
  return state && state.world && state.world.currentSectorId || null;
}

function returnPosition(state, ace, rec, index) {
  const player = state && state.entities && state.entities.get(state.playerId);
  const anchor = player && player.pos || { x: 0, z: 0 };
  const seed = seedOf(state);
  const h = hash32(seed, ace.id, rec.returnSeed || 0, 'return-pos', index | 0);
  const angle = (h / 0x100000000) * Math.PI * 2;
  const radius = index === 0 ? 900 : 120 + index * 35;
  const bossH = hash32(seed, ace.id, rec.returnSeed || 0, 'return-pos', 0);
  const bossAngle = (bossH / 0x100000000) * Math.PI * 2;
  const center = {
    x: anchor.x + Math.cos(bossAngle) * 900,
    z: anchor.z + Math.sin(bossAngle) * 900,
  };
  if (index === 0) return center;
  return {
    x: center.x + Math.cos(angle) * radius,
    z: center.z + Math.sin(angle) * radius,
  };
}

function rememberActiveReturn(state, entityId, aceId, requestId) {
  const memory = state && state.aceMemory && typeof state.aceMemory === 'object'
    ? state.aceMemory
    : ensureMemory(state);
  if (!memory.activeReturns || typeof memory.activeReturns !== 'object') memory.activeReturns = {};
  memory.activeReturns[String(entityId)] = { aceId, requestId };
}

function emit(bus, evt, payload) {
  if (bus && typeof bus.emit === 'function') bus.emit(evt, payload);
}

function clonePlain(v) {
  if (v == null) return v;
  return JSON.parse(JSON.stringify(v));
}

export default aceMemory;
