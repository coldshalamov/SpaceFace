// BP-13/B6 Pirate Toll Ladder.
//
// Additive state machine for already-spawned pirate squads with the `toll` doctrine:
// SCAN -> DEMAND -> comply/refuse/timeout. It never spawns ships, never writes credits/heat/rep,
// and routes cargo loss through the cargo system's jettison API.
import { barkFor } from '../data/barks.js';
import { COMMODITIES } from '../data/commodities.js';
import { pirateParleyPlanForEntity } from '../data/pirateDoctrines.js';
import { hash32 } from '../core/rng.js';

const SCAN_TO_DEMAND_S = 2.0;
const DEMAND_WINDOW_S = 5.0;
const BREAK_OFF_S = 18.0;
const VOICE_TTL_S = 1.0;
const TITHE_MIN_PERCENT = 20;
const TITHE_SPAN_PERCENT = 10;

const VALUE_BY_COMMODITY = new Map(COMMODITIES.map((c) => [c.id, Number(c.basePrice) || 1]));

export const pirateParley = {
  name: 'pirateParley',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || {};
    this.registry = ctx.registry || null;
    this._onChoice = (p) => this._choose(p);
    if (this.bus && typeof this.bus.on === 'function') {
      this.bus.on('pirateParley:choose', this._onChoice);
    }
  },

  newGame() {
    if (this.state) this.state.pirateParley = freshState();
  },

  update(_dt, state) {
    if (state.mode && state.mode !== 'flight') return;
    const own = ensureState(state);
    const now = state.simTime || 0;
    const groups = collectParleySquads(state);

    for (const [squadId, members] of groups) {
      let rec = own.squads[squadId];
      if (!rec) {
        rec = startRecord(state, squadId, members[0], now);
        own.squads[squadId] = rec;
        this._speak(rec, 'scan');
        this._emit('pirateParley:started', publicRecord(rec));
      }
      rec.memberIds = members.map((e) => e.id);
      if (rec.phase === 'scan' || rec.phase === 'demand') holdFire(state, rec, members);
    }

    for (const squadId of Object.keys(own.squads)) {
      const rec = own.squads[squadId];
      if (!rec || rec.resolved) continue;
      const members = membersFor(state, rec);
      if (!members.length) {
        rec.resolved = true;
        rec.phase = 'gone';
        continue;
      }
      if (rec.phase === 'scan' && now >= rec.demandAt) {
        rec.phase = 'demand';
        rec.deadlineAt = now + DEMAND_WINDOW_S;
        rec.tithe = chooseTithe(state, rec.squadId);
        holdFire(state, rec, members);
        this._speak(rec, 'demand-cargo');
        this._emit('pirateParley:demand', { ...publicRecord(rec), tithe: { ...rec.tithe } });
      } else if (rec.phase === 'demand' && now >= rec.deadlineAt) {
        this._escalate(rec, 'timeout');
      }
    }
  },

  _choose(payload) {
    if (!payload) return false;
    const state = this.state;
    const own = state && state.pirateParley;
    if (!own || !own.squads) return false;
    const squadId = String(payload.squadId || payload.id || '');
    const rec = own.squads[squadId];
    if (!rec || rec.resolved || rec.phase !== 'demand') return false;
    const choice = String(payload.choice || payload.choiceId || payload.optionId || '').toLowerCase();
    if (choice === 'comply' || choice === 'pay' || choice === 'drop') return this._comply(rec);
    if (choice === 'refuse' || choice === 'attack' || choice === 'fight') return this._escalate(rec, 'refused');
    return false;
  },

  _comply(rec) {
    const state = this.state;
    const now = state.simTime || 0;
    const members = membersFor(state, rec);
    const tithe = rec.tithe || chooseTithe(state, rec.squadId);
    const cargoSys = this.registry && this.registry.get && this.registry.get('cargo');
    const dropped = tithe.commodityId && tithe.qty > 0 && cargoSys && typeof cargoSys.jettison === 'function'
      ? cargoSys.jettison(tithe.commodityId, tithe.qty)
      : 0;
    const actual = { commodityId: tithe.commodityId || null, qty: dropped | 0 };

    rec.phase = 'break-off';
    rec.resolved = true;
    rec.outcome = 'complied';
    rec.tithe = actual;
    rec.breakOffUntil = now + BREAK_OFF_S;

    for (const e of members) breakOff(e, rec, state);
    this._emit('pirateParley:resolved', {
      ...publicRecord(rec),
      outcome: 'complied',
      next: 'break-off',
      tithe: actual,
    });
    return true;
  },

  _escalate(rec, outcome) {
    const state = this.state;
    const members = membersFor(state, rec);
    rec.phase = 'violence';
    rec.resolved = true;
    rec.outcome = outcome || 'refused';
    for (const e of members) makeHostile(e, state, rec);
    this._speak(rec, 'attack');
    this._emit('pirateParley:resolved', {
      ...publicRecord(rec),
      outcome: rec.outcome,
      next: 'violence',
      tithe: rec.tithe ? { ...rec.tithe } : null,
    });
    return true;
  },

  _speak(rec, situation) {
    const text = barkFor(rec.factionId, situation, rec.voiceIndex[situation] || 0);
    const voice = this.helpers && this.helpers.voice;
    if (voice && typeof voice.say === 'function') {
      voice.say({
        channel: 'bark',
        text,
        kind: 'pirateParley',
        ttl: VOICE_TTL_S,
        id: `pirateParley:${rec.squadId}:${situation}`,
        factionId: rec.factionId,
      });
    } else {
      this._emit('toast', { text, kind: 'pirateParley', ttl: VOICE_TTL_S });
    }
    rec.said.push({ situation, text });
    this._emit('pirateParley:voice', {
      squadId: rec.squadId,
      doctrineId: rec.doctrineId,
      situation,
      text,
      factionId: rec.factionId,
    });
  },

  _emit(evt, payload) {
    if (this.bus && typeof this.bus.emit === 'function') this.bus.emit(evt, payload);
  },

  destroy() {
    if (this.bus && this._onChoice && typeof this.bus.off === 'function') {
      this.bus.off('pirateParley:choose', this._onChoice);
    }
    this._onChoice = null;
  },
};

function freshState() {
  return { squads: {} };
}

function ensureState(state) {
  if (!state.pirateParley || typeof state.pirateParley !== 'object') state.pirateParley = freshState();
  if (!state.pirateParley.squads || typeof state.pirateParley.squads !== 'object') state.pirateParley.squads = {};
  return state.pirateParley;
}

function eligiblePlan(entity) {
  const plan = pirateParleyPlanForEntity(entity);
  if (!plan || !plan.startsParley) return null;
  if (plan.parleyMode !== 'toll' || plan.demandType !== 'tithe') return null;
  return plan;
}

function collectParleySquads(state) {
  const out = new Map();
  const list = Array.isArray(state.entityList) ? state.entityList : [];
  for (const e of list) {
    if (!e || e.alive === false || (e.type !== 'ship' && e.type !== 'drone')) continue;
    const plan = eligiblePlan(e);
    if (!plan) continue;
    const ai = e.data && e.data.ai || {};
    if (ai.parleySuppressed) continue;
    const squadId = String(ai.squadId || ai.encounterId || `entity:${e.id}`);
    if (!out.has(squadId)) out.set(squadId, []);
    out.get(squadId).push(e);
  }
  return out;
}

function startRecord(state, squadId, entity, now) {
  const plan = eligiblePlan(entity);
  const seed = state.meta && state.meta.seed;
  const base = hash32(seed == null ? 0 : seed, squadId, 'pirateParley');
  return {
    squadId,
    doctrineId: plan.doctrineId,
    factionId: entity.factionId || entity.data && entity.data.factionId || 'faction_reach',
    phase: 'scan',
    startedAt: now,
    demandAt: now + SCAN_TO_DEMAND_S,
    deadlineAt: 0,
    breakOffUntil: 0,
    memberIds: [],
    tithe: chooseTithe(state, squadId),
    voiceIndex: {
      scan: hash32(base, 'scan'),
      'demand-cargo': hash32(base, 'demand-cargo'),
      attack: hash32(base, 'attack'),
    },
    said: [],
    resolved: false,
    outcome: null,
  };
}

function membersFor(state, rec) {
  const out = [];
  const ids = Array.isArray(rec.memberIds) ? rec.memberIds : [];
  for (const id of ids) {
    const e = state.entities && state.entities.get && state.entities.get(id);
    if (e && e.alive !== false) out.push(e);
  }
  return out;
}

function holdFire(state, rec, members) {
  for (const e of members) {
    const data = e.data || (e.data = {});
    const ai = data.ai || (data.ai = {});
    ai.passive = true;
    ai.parleySquadId = rec.squadId;
    if (ai.hostileTeams && Array.isArray(ai.hostileTeams)) {
      ai.hostileTeams = ai.hostileTeams.filter((team) => team !== 0 && team !== state.player?.team);
    }
    ai.forcePlayerTarget = false;
    ai.huntPlayer = false;
    data.pirateParley = {
      squadId: rec.squadId,
      phase: rec.phase,
      demandAt: rec.demandAt,
      deadlineAt: rec.deadlineAt || null,
    };
    const intent = data.intent || (data.intent = {});
    intent.fire = false;
    const combat = data.combat || (data.combat = {});
    if (combat.targetId === state.playerId) combat.targetId = null;
    if (combat.lockTarget === state.playerId) combat.lockTarget = null;
  }
}

function breakOff(entity, rec, state) {
  const data = entity.data || (entity.data = {});
  const ai = data.ai || (data.ai = {});
  ai.passive = true;
  ai.forcePlayerTarget = false;
  ai.huntPlayer = false;
  ai.fsm = 'flee';
  ai.parleyBreakOffUntil = rec.breakOffUntil;
  data.pirateParley = {
    squadId: rec.squadId,
    phase: 'break-off',
    breakOffUntil: rec.breakOffUntil,
  };
  const intent = data.intent || (data.intent = {});
  intent.fire = false;
  const combat = data.combat || (data.combat = {});
  if (combat.targetId === state.playerId) combat.targetId = null;
  if (combat.lockTarget === state.playerId) combat.lockTarget = null;
}

function makeHostile(entity, state, rec) {
  const data = entity.data || (entity.data = {});
  const ai = data.ai || (data.ai = {});
  ai.passive = false;
  ai.forcePlayerTarget = true;
  ai.huntPlayer = true;
  ai.fsm = 'attack';
  ai.parleySquadId = rec.squadId;
  const playerTeam = state.player && Number.isFinite(state.player.team) ? state.player.team : 0;
  const teams = new Set(Array.isArray(ai.hostileTeams) ? ai.hostileTeams : []);
  teams.add(playerTeam);
  ai.hostileTeams = [...teams];
  data.pirateParley = {
    squadId: rec.squadId,
    phase: 'violence',
    outcome: rec.outcome || 'refused',
  };
  const combat = data.combat || (data.combat = {});
  combat.targetId = state.playerId;
  const intent = data.intent || (data.intent = {});
  intent.fire = false;
}

function chooseTithe(state, squadId) {
  const items = state.player && state.player.cargo && state.player.cargo.items || {};
  let bestId = null;
  let bestScore = -Infinity;
  for (const id of Object.keys(items).sort()) {
    const qty = Math.floor(Number(items[id]) || 0);
    if (qty <= 0) continue;
    const value = VALUE_BY_COMMODITY.get(id) || 1;
    const score = value * qty;
    if (score > bestScore) {
      bestScore = score;
      bestId = id;
    }
  }
  if (!bestId) return { commodityId: null, qty: 0, percent: 0 };
  const have = Math.floor(Number(items[bestId]) || 0);
  const seed = state.meta && state.meta.seed;
  const percent = TITHE_MIN_PERCENT + (hash32(seed == null ? 0 : seed, squadId, 'tithe') % (TITHE_SPAN_PERCENT + 1));
  const qty = Math.max(1, Math.min(have, Math.ceil(have * percent / 100)));
  return { commodityId: bestId, qty, percent };
}

function publicRecord(rec) {
  return {
    squadId: rec.squadId,
    doctrineId: rec.doctrineId,
    phase: rec.phase,
    startedAt: rec.startedAt,
    demandAt: rec.demandAt,
    deadlineAt: rec.deadlineAt || null,
  };
}

export default pirateParley;
