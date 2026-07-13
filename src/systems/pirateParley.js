// BP-13/B6 Pirate Toll Ladder.
//
// Additive state machine for already-spawned pirate squads with the `toll` doctrine:
// SCAN -> DEMAND -> comply/refuse/timeout. It never spawns ships, never writes credits/heat/rep,
// and routes cargo loss through the cargo system's jettison API.
import { barkFor } from '../data/barks.js';
import { COMMODITIES } from '../data/commodities.js';
import { pirateParleyPlanForEntity } from '../data/pirateDoctrines.js';
import { tollAmountFor } from '../data/encounters.js';
import { hash32 } from '../core/rng.js';
import { ActivityKind, RulesOfEngagement, normalizeActivity } from '../ai/doctrine.js';
import { protectedStationAt } from '../ai/engagementAuthority.js';
import { effectiveLawSecurity } from './lawSecurity.js';

const SCAN_TO_DEMAND_S = 2.0;
// Eight seconds is long enough to read a concrete demand and make one deliberate flight decision,
// while remaining short enough to feel like an armed interception rather than a modal negotiation.
const DEMAND_WINDOW_S = 8.0;
const BREAK_OFF_S = 18.0;
const VOICE_TTL_S = 1.0;
const TITHE_MIN_PERCENT = 20;
const TITHE_SPAN_PERCENT = 10;
const BRAKE_TO_COMPLY_HOLD_S = 1.25;
const ESCAPE_RADIUS = 1200;
const MAX_ROBBERY_SECURITY = 0.75;
const PROFIT_MOTIVES = new Set(['assigned_interdiction', 'cargo_extortion', 'toll_collection']);

const VALUE_BY_COMMODITY = new Map(COMMODITIES.map((c) => [c.id, Number(c.basePrice) || 1]));
const LABEL_BY_COMMODITY = new Map(COMMODITIES.map((c) => [c.id, String(c.name || c.id).replace(/^Refined /i, '')]));

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
        rec.demand = chooseDemand(state, rec.squadId, rec.tithe);
        holdFire(state, rec, members);
        this._speak(rec, 'demand-cargo');
        this._emit('pirateParley:demand', {
          ...publicRecord(rec),
          demand: { ...rec.demand },
          tithe: { ...rec.tithe },
        });
      } else if (rec.phase === 'demand') {
        const player = state.entities && state.entities.get && state.entities.get(state.playerId);
        // Raw brake is the held control; actions.brake preserves scripted/edge-trigger fixtures.
        const braking = !!(state.input && (state.input.brake
          || state.input.actions && state.input.actions.brake));
        if (braking) {
          if (rec.brakeSince == null) rec.brakeSince = now;
          if (now - rec.brakeSince >= BRAKE_TO_COMPLY_HOLD_S) {
            this._comply(rec);
            continue;
          }
        } else rec.brakeSince = null;
        if (player && outsideSquadRange(player, members, ESCAPE_RADIUS)) {
          this._escape(rec);
          continue;
        }
        if (now >= rec.deadlineAt) this._escalate(rec, 'timeout');
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
    if (choice === 'refuse' || choice === 'attack' || choice === 'fight') {
      const cause = payload.reason === 'player_attack' ? 'player_attack' : 'refused';
      return this._escalate(rec, cause);
    }
    // RUN is an acknowledged intent, not an instant teleport or ceasefire. The deterministic
    // spatial rule below still owns success: clear every squad member by ESCAPE_RADIUS before the
    // deadline. Until then the pirates continue holding fire and the player keeps full flight control.
    if (choice === 'run' || choice === 'flee' || choice === 'escape') {
      rec.choice = 'run';
      return true;
    }
    return false;
  },

  _comply(rec) {
    const state = this.state;
    const now = state.simTime || 0;
    const members = membersFor(state, rec);
    const tithe = rec.tithe || chooseTithe(state, rec.squadId);
    const demand = rec.demand || chooseDemand(state, rec.squadId, tithe);
    const payment = settleDemand(this, state, rec, demand, tithe);

    // A broke or already-emptied target is no longer a rational prize. A profit crew leaves rather
    // than converting failed collection into an unexplained execution.
    if (!payment || payment.amount <= 0) return this._unprofitable(rec, members, now);

    rec.phase = 'break-off';
    rec.resolved = true;
    rec.choice = rec.choice || 'comply';
    rec.outcome = 'complied';
    rec.payment = payment;
    rec.tithe = payment.kind === 'cargo'
      ? { commodityId: payment.commodityId, qty: payment.amount }
      : tithe;
    rec.breakOffUntil = now + BREAK_OFF_S;

    for (const e of members) breakOff(e, rec, state);
    this._emit('pirateParley:resolved', {
      ...publicRecord(rec),
      outcome: 'complied',
      next: 'break-off',
      payment: { ...payment },
      tithe: rec.tithe ? { ...rec.tithe } : null,
    });
    return true;
  },

  _unprofitable(rec, members, now) {
    rec.phase = 'break-off';
    rec.resolved = true;
    rec.choice = rec.choice || 'comply';
    rec.outcome = 'unprofitable';
    rec.payment = null;
    rec.breakOffUntil = now + BREAK_OFF_S;
    for (const entity of members) breakOff(entity, rec, this.state);
    this._emit('pirateParley:resolved', {
      ...publicRecord(rec),
      outcome: rec.outcome,
      next: 'break-off',
      payment: null,
      tithe: null,
    });
    return true;
  },

  _escalate(rec, outcome) {
    const state = this.state;
    const members = membersFor(state, rec);
    rec.phase = 'violence';
    rec.resolved = true;
    rec.outcome = outcome || 'refused';
    rec.choice = rec.outcome === 'timeout' ? null : 'refuse';
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

  _escape(rec) {
    const state = this.state;
    const now = state.simTime || 0;
    const members = membersFor(state, rec);
    rec.phase = 'break-off';
    rec.resolved = true;
    rec.choice = 'run';
    rec.outcome = 'evaded';
    rec.payment = null;
    rec.breakOffUntil = now + BREAK_OFF_S;
    for (const entity of members) breakOff(entity, rec, state);
    this._emit('pirateParley:resolved', {
      ...publicRecord(rec),
      outcome: 'evaded',
      next: 'break-off',
      payment: null,
      tithe: null,
    });
    return true;
  },

  _speak(rec, situation) {
    const text = situation === 'demand-cargo'
      ? demandInstruction(rec)
      : barkFor(rec.factionId, situation, rec.voiceIndex[situation] || 0);
    // The scan is a transient hail and may own the arbiter floor. Demand and attack are already
    // represented by the actionable parley strip / outcome receipt; surfacing the same sentence on
    // the global floor would violate one-voice. Their pirateParley:voice events still feed telemetry
    // and any future audio-only presenter without creating a second text surface.
    const ownsActionSurface = situation === 'demand-cargo' || situation === 'attack';
    if (!ownsActionSurface) {
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
  const ai = entity && entity.data && entity.data.ai || {};
  if (ai.motive && !PROFIT_MOTIVES.has(String(ai.motive))) return null;
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
    const eligibility = robberyEligibility(state, e);
    if (!eligibility.ok) {
      suppressRobbery(e, state, eligibility.reason);
      continue;
    }
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
  const tithe = chooseTithe(state, squadId);
  return {
    squadId,
    hailerId: entity && entity.id || null,
    doctrineId: plan.doctrineId,
    factionId: entity.factionId || entity.data && entity.data.factionId || 'faction_reach',
    phase: 'scan',
    startedAt: now,
    demandAt: now + SCAN_TO_DEMAND_S,
    deadlineAt: 0,
    breakOffUntil: 0,
    memberIds: [],
    tithe,
    demand: chooseDemand(state, squadId, tithe),
    voiceIndex: {
      scan: hash32(base, 'scan'),
      'demand-cargo': hash32(base, 'demand-cargo'),
      attack: hash32(base, 'attack'),
    },
    said: [],
    resolved: false,
    outcome: null,
    choice: null,
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
    ai.motive = 'cargo_extortion';
    ai.engagementTrigger = 'demand_pending';
    ai.zoneId = String(ai.zoneId || `parley:${rec.squadId}`);
    ai.approachTelegraph = 'hail_and_scan';
    ai.noFireResponseWindowS = Math.max(1, Number(ai.noFireResponseWindowS) || 0);
    ai.roe = RulesOfEngagement.HOLD_FIRE;
    ai.activity = normalizeActivity({
      kind: ActivityKind.HAIL_HOLD,
      reason: `pirate_parley:${rec.phase}`,
      anchor: e.pos,
      leashRadius: ESCAPE_RADIUS + 600,
      startedTick: state.tick | 0,
      deadlineTick: rec.deadlineAt ? Math.round(rec.deadlineAt * 60) : null,
      targetId: state.playerId,
      encounterId: rec.squadId,
    });
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
  ai.motiveSatisfied = true;
  ai.engagementTrigger = 'parley_resolved';
  ai.roe = RulesOfEngagement.HOLD_FIRE;
  ai.activity = normalizeActivity({
    kind: ActivityKind.DISENGAGE,
    reason: `pirate_parley:${rec.outcome || 'break_off'}`,
    anchor: entity.pos,
    leashRadius: ESCAPE_RADIUS + 600,
    startedTick: state.tick | 0,
    encounterId: rec.squadId,
  });
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
  ai.motiveSatisfied = false;
  ai.motive = 'cargo_extortion';
  ai.engagementTrigger = rec.outcome === 'player_attack'
    ? 'player_attack'
    : rec.outcome === 'refused' ? 'explicit_refusal' : 'ignored_demand';
  ai.zoneId = String(ai.zoneId || `parley:${rec.squadId}`);
  ai.approachTelegraph = 'attack_bark';
  ai.noFireResponseWindowS = 1;
  ai.roe = RulesOfEngagement.WEAPONS_FREE;
  ai.activity = normalizeActivity({
    kind: ActivityKind.ATTACK_RUN,
    reason: `pirate_parley:${rec.outcome || 'refused'}`,
    anchor: entity.pos,
    leashRadius: ESCAPE_RADIUS + 1000,
    startedTick: state.tick | 0,
    targetId: state.playerId,
    encounterId: rec.squadId,
  });
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

function chooseDemand(state, squadId, tithe = chooseTithe(state, squadId)) {
  const cargoValue = playerCargoValue(state);
  const credits = Math.max(0, Math.floor(Number(state.player && state.player.credits) || 0));
  const creditAmount = Math.min(credits, tollAmountFor(cargoValue));
  const seed = state.meta && state.meta.seed;
  const creditTurn = (hash32(seed == null ? 0 : seed, squadId, 'demand_kind') & 1) === 0;
  if (creditTurn && creditAmount > 0) {
    return { kind: 'credits', amount: creditAmount, commodityId: null, qty: 0, percent: 0 };
  }
  return {
    kind: 'cargo',
    amount: Math.max(0, Math.floor(Number(tithe.qty) || 0)),
    commodityId: tithe.commodityId || null,
    qty: Math.max(0, Math.floor(Number(tithe.qty) || 0)),
    percent: Math.max(0, Math.floor(Number(tithe.percent) || 0)),
  };
}

function settleDemand(system, state, rec, demand, tithe) {
  if (demand.kind === 'credits') {
    const amount = Math.max(0, Math.floor(Number(demand.amount) || 0));
    const before = Math.max(0, Math.floor(Number(state.player && state.player.credits) || 0));
    if (amount > 0 && before >= amount && system.bus && typeof system.bus.emit === 'function') {
      system.bus.emit('economy:chargeCredits', { amount, reason: `pirate_toll:${rec.squadId}` });
      const after = Math.max(0, Math.floor(Number(state.player && state.player.credits) || 0));
      if (before - after === amount) return { kind: 'credits', amount, commodityId: null };
    }
  }
  const cargoSys = system.registry && system.registry.get && system.registry.get('cargo');
  const dropped = tithe.commodityId && tithe.qty > 0 && cargoSys && typeof cargoSys.jettison === 'function'
    ? cargoSys.jettison(tithe.commodityId, tithe.qty)
    : 0;
  return dropped > 0
    ? { kind: 'cargo', amount: dropped | 0, commodityId: tithe.commodityId }
    : null;
}

function robberyEligibility(state, entity) {
  const player = state.entities && state.entities.get && state.entities.get(state.playerId);
  if (!player) return { ok: false, reason: 'no_profitable_target' };
  if (protectedStationAt(state, player) || protectedStationAt(state, entity)) {
    return { ok: false, reason: 'jurisdiction_avoidance' };
  }
  if (effectiveLawSecurity(state) > MAX_ROBBERY_SECURITY) {
    return { ok: false, reason: 'jurisdiction_avoidance' };
  }
  if (playerCargoValue(state) <= 0) return { ok: false, reason: 'no_profitable_target' };
  return { ok: true, reason: 'profitable_deep_space_target' };
}

function suppressRobbery(entity, state, reason) {
  const data = entity.data || (entity.data = {});
  const ai = data.ai || (data.ai = {});
  ai.parleySuppressed = true;
  ai.passive = true;
  ai.forcePlayerTarget = false;
  ai.huntPlayer = false;
  ai.motive = reason;
  ai.motiveSatisfied = true;
  ai.engagementTrigger = 'player_attack';
  ai.roe = RulesOfEngagement.HOLD_FIRE;
  ai.fsm = reason === 'jurisdiction_avoidance' ? 'flee' : 'hold';
  ai.activity = normalizeActivity({
    kind: reason === 'jurisdiction_avoidance' ? ActivityKind.DISENGAGE : ActivityKind.LOITER,
    reason: `pirate_parley:suppressed:${reason}`,
    anchor: entity.pos,
    leashRadius: ESCAPE_RADIUS + 600,
    startedTick: state.tick | 0,
  });
  const intent = data.intent || (data.intent = {});
  intent.fire = false;
  intent.fireGroup = null;
  const combat = data.combat || (data.combat = {});
  if (combat.targetId === state.playerId) combat.targetId = null;
  if (combat.lockTarget === state.playerId) combat.lockTarget = null;
}

function playerCargoValue(state) {
  const items = state.player && state.player.cargo && state.player.cargo.items || {};
  let total = 0;
  for (const id of Object.keys(items).sort()) {
    total += Math.max(0, Math.floor(Number(items[id]) || 0)) * (VALUE_BY_COMMODITY.get(id) || 1);
  }
  return total;
}

function publicRecord(rec) {
  return {
    squadId: rec.squadId,
    hailerId: rec.hailerId || null,
    memberIds: Array.isArray(rec.memberIds) ? rec.memberIds.slice() : [],
    doctrineId: rec.doctrineId,
    factionId: rec.factionId,
    phase: rec.phase,
    startedAt: rec.startedAt,
    demandAt: rec.demandAt,
    deadlineAt: rec.deadlineAt || null,
    demand: rec.demand ? { ...rec.demand } : null,
    choice: rec.choice || null,
    escapeRadius: ESCAPE_RADIUS,
  };
}

function outsideSquadRange(player, members, radius) {
  if (!player || !player.pos || !members.length) return false;
  const limit2 = radius * radius;
  for (const member of members) {
    const dx = player.pos.x - member.pos.x;
    const dz = player.pos.z - member.pos.z;
    if (dx * dx + dz * dz <= limit2) return false;
  }
  return true;
}

function demandInstruction(rec) {
  if (rec.demand && rec.demand.kind === 'credits') {
    return `REACH: Brake to transfer ${rec.demand.amount | 0} credits. Clear 1200 to run.`;
  }
  const tithe = rec.tithe || {};
  const qty = Math.max(0, Math.floor(Number(tithe.qty) || 0));
  const label = LABEL_BY_COMMODITY.get(tithe.commodityId) || 'cargo';
  return `REACH: Brake to yield ${qty} ${label}. Clear 1200 to run.`;
}

export default pirateParley;
