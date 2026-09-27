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
import { entityIndexVersion, indexedShipLikeScan } from '../world/livingWorldViews.js';


/** Bench A/B: production default ON. Quiet latch skips pirateParley shipLike
 * census (eligiblePlan / robberyEligibility) when no toll-doctrine squads and
 * no unresolved parley records remain. Soft-GPU fps not claimed. Fresh combat
 * residual after #150 pirateDisengage (not pirateDisengage / bounty / salvage /
 * sanctuary / cones / catch-nets). */
let PIRATE_PARLEY_EMPTY_QUIET_LATCH = true;
export function setPirateParleyEmptyQuietLatchForBench(enabled) {
  PIRATE_PARLEY_EMPTY_QUIET_LATCH = enabled !== false;
}
export function getPirateParleyEmptyQuietLatchForBench() {
  return PIRATE_PARLEY_EMPTY_QUIET_LATCH !== false;
}

/** Membership rescan while latched (0.5 s @ 60 Hz). */
const PIRATE_PARLEY_EMPTY_QUIET_RESCAN_TICKS = 30;

function publishPirateParleyQuiet(state, latched) {
  if (!state) return;
  const rt = state.pirateParleyRuntime || (state.pirateParleyRuntime = {});
  rt.emptyQuietLatched = !!latched;
}

function hasUnresolvedParleySquads(own) {
  if (!own || !own.squads) return false;
  for (const squadId of Object.keys(own.squads)) {
    const rec = own.squads[squadId];
    if (rec && !rec.resolved) return true;
  }
  return false;
}

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
// Bribe beats: each watched dump holds fire a little longer (capped), and the paid crew
// mills over the goods before leaving.
const BRIBE_DEADLINE_PUSH_S = 2.0;
const BRIBE_DEADLINE_PUSH_CAP_S = 6.0;
const BRIBE_SCOOP_S = 10.0;
const BRIBE_SCOOP_LEASH = 320;
const BRIBE_SHORTFALL_TTL_S = 1.5;

const VALUE_BY_COMMODITY = new Map(COMMODITIES.map((c) => [c.id, Number(c.basePrice) || 1]));
const LABEL_BY_COMMODITY = new Map(COMMODITIES.map((c) => [c.id, String(c.name || c.id).replace(/^Refined /i, '')]));
const LEGALITY_BY_COMMODITY = new Map(COMMODITIES.map((c) => [c.id, String(c.legality || 'legal')]));
// Hot goods fence well: restricted/contraband lots bribe above face value.
const BRIBE_HOT_MULT = 1.5;

export const pirateParley = {
  name: 'pirateParley',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || {};
    this.registry = ctx.registry || null;
    this._subs = [];
    this._parleyQuiet = null;
    this._parleyWakeSeq = 0;
    this._onChoice = (p) => this._choose(p);
    if (this.bus && typeof this.bus.on === 'function') {
      this.bus.on('pirateParley:choose', this._onChoice);
    }
    // In-kind bribes: a voluntary dump during DEMAND pays the toll without braking.
    this._listen('cargo:jettisoned', (p) => this._onJettisoned(p || {}));
    this._listen('entity:spawned', (p) => this._onEntitySpawned(p));
    // Boundary wakes: newGame() is not dispatched on the live route (this system is
    // not in FRESH_RUN_SYSTEMS), so save/run/sector transitions arrive only here.
    this._listen('save:loaded', () => this.noteParleyWake());
    this._listen('game:new', () => this.noteParleyWake());
    this._listen('game:newGame', () => this.noteParleyWake());
    this._listen('sector:enter', () => this.noteParleyWake());
  },

  /** External wake when a toll doctrine is stamped without a fresh spawn index bump. */
  noteParleyWake() {
    this._parleyWakeSeq = (this._parleyWakeSeq | 0) + 1;
    this._parleyQuiet = null;
  },

  _onEntitySpawned(payload) {
    const entity = payload && payload.entity;
    if (!eligiblePlan(entity)) return;
    this.noteParleyWake();
  },

  _listen(evt, fn) {
    if (!this.bus || typeof this.bus.on !== 'function') return;
    const off = this.bus.on(evt, fn);
    if (typeof off === 'function') this._subs.push(off);
  },

  newGame() {
    if (this.state) this.state.pirateParley = freshState();
    this._parleyQuiet = null;
    this._parleyWakeSeq = 0;
    publishPirateParleyQuiet(this.state, false);
  },

  update(_dt, state) {
    if (state.mode && state.mode !== 'flight') return;
    const own = ensureState(state);
    const now = state.simTime || 0;
    // Quiet open flight: no toll-doctrine / unresolved parley squads still paid a
    // full shipLike census (eligiblePlan / robberyEligibility / Map alloc) every
    // tick. Latch when both stay empty; wake on membership, toll spawn/tag, or
    // 0.5 s rescan. Soft-GPU fps not claimed. Fresh combat residual after #150.
    if (PIRATE_PARLEY_EMPTY_QUIET_LATCH !== false) {
      const membership = entityIndexVersion(state);
      const tick = state.tick | 0;
      const wakeSeq = this._parleyWakeSeq | 0;
      const quiet = this._parleyQuiet;
      if (quiet
        && membership != null
        && quiet.membership === membership
        && quiet.wakeSeq === wakeSeq
        && !hasUnresolvedParleySquads(own)
        && ((tick - (quiet.armedTick | 0)) < PIRATE_PARLEY_EMPTY_QUIET_RESCAN_TICKS)) {
        publishPirateParleyQuiet(state, true);
        return;
      }
    } else if (this._parleyQuiet) {
      this._parleyQuiet = null;
      publishPirateParleyQuiet(state, false);
    }

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
      } else if (rec.phase === 'scooping') {
        if (now >= (rec.scoopUntil || 0)) this._finishScoop(rec);
      }
    }

    if (PIRATE_PARLEY_EMPTY_QUIET_LATCH !== false) {
      const emptyGroups = !groups || groups.size === 0;
      const unresolved = hasUnresolvedParleySquads(own);
      if (emptyGroups && !unresolved) {
        const membership = entityIndexVersion(state);
        if (membership != null) {
          this._parleyQuiet = {
            membership,
            wakeSeq: this._parleyWakeSeq | 0,
            armedTick: state.tick | 0,
          };
          publishPirateParleyQuiet(state, true);
        } else {
          this._parleyQuiet = null;
          publishPirateParleyQuiet(state, false);
        }
      } else {
        this._parleyQuiet = null;
        publishPirateParleyQuiet(state, false);
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
    // The cargo settlement below dumps the tithe through cargo.jettison, which emits
    // cargo:jettisoned. That settlement dump is not a player bribe — suppress the listener.
    this._settling = true;
    let payment;
    try {
      payment = settleDemand(this, state, rec, demand, tithe);
    } finally {
      this._settling = false;
    }

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

  // Voluntary dumps during DEMAND are in-kind bribes. Whole units, oldest demand first,
  // overflow to the next gang: the goods are already floating in space, so no brake hold
  // is needed — dump and keep flying. Each watched dump also holds fire a little longer.
  _onJettisoned(payload) {
    if (this._settling) return;
    const state = this.state;
    if (!state || state.mode !== 'flight') return;
    let remaining = Math.floor(Number(payload.amount) || 0);
    if (remaining <= 0) return;
    const commodityId = typeof payload.commodityId === 'string' ? payload.commodityId : null;
    const baseUnit = (commodityId && VALUE_BY_COMMODITY.get(commodityId)) || 1;
    const hot = commodityId && LEGALITY_BY_COMMODITY.get(commodityId) !== 'legal';
    const unitValue = hot ? baseUnit * BRIBE_HOT_MULT : baseUnit;
    if (!(unitValue > 0)) return;
    const own = state.pirateParley;
    if (!own || !own.squads) return;
    const now = state.simTime || 0;
    const targets = Object.values(own.squads)
      .filter((rec) => rec && !rec.resolved && rec.phase === 'demand' && membersFor(state, rec).length)
      .sort((a, b) => (a.deadlineAt || 0) - (b.deadlineAt || 0));
    if (!targets.length) return;
    const player = state.entities && state.entities.get && state.entities.get(state.playerId);
    const dropAt = player && player.pos
      ? { x: Number(player.pos.x) || 0, z: Number(player.pos.z) || 0 }
      : null;
    for (const rec of targets) {
      if (remaining <= 0) break;
      const outstanding = outstandingBribeValue(rec);
      if (outstanding <= 0) {
        // Nothing was actually demanded (the hold emptied before the demand landed).
        // Same as a broke brake-comply: not a prize, the crew leaves.
        this._unprofitable(rec, membersFor(state, rec), now);
        continue;
      }
      const short = outstanding - (Math.max(0, Number(rec.bribeValue) || 0));
      if (short <= 0) continue;
      const take = Math.min(remaining, Math.ceil(short / unitValue));
      if (take <= 0) continue;
      remaining -= take;
      rec.bribeValue = Math.max(0, Number(rec.bribeValue) || 0) + take * unitValue;
      rec.bribeUnits = Math.max(0, Math.floor(Number(rec.bribeUnits) || 0)) + take;
      if (!Array.isArray(rec.bribeLots)) rec.bribeLots = [];
      rec.bribeLots.push({ commodityId, amount: take, value: take * unitValue, at: now });
      if (dropAt) rec.bribeAt = { ...dropAt };
      const pushable = BRIBE_DEADLINE_PUSH_CAP_S - (Number(rec.bribeExtension) || 0);
      if (pushable > 0 && rec.deadlineAt) {
        const push = Math.min(BRIBE_DEADLINE_PUSH_S, pushable);
        rec.deadlineAt += push;
        rec.bribeExtension = (Number(rec.bribeExtension) || 0) + push;
        holdFire(state, rec, membersFor(state, rec));
      }
      if (rec.bribeValue >= outstanding) {
        this._bribed(rec);
      } else {
        this._speakShortfall(rec, outstanding - rec.bribeValue);
      }
    }
  },

  // A short dump answers itself: how much more the crew wants. Bounded (one line per
  // dump, player-caused) and off the demand strip — the strip is one-shot.
  _speakShortfall(rec, shortValue) {
    const demand = rec.demand;
    let text;
    if (demand && demand.kind === 'credits') {
      text = `Still short ${Math.ceil(shortValue)} cr worth.`;
    } else {
      const tithe = rec.tithe || {};
      const unit = (tithe.commodityId && VALUE_BY_COMMODITY.get(tithe.commodityId)) || 1;
      const label = LABEL_BY_COMMODITY.get(tithe.commodityId) || 'cargo';
      text = `Still short ${Math.max(1, Math.ceil(shortValue / unit))} ${label}.`;
    }
    const voice = this.helpers && this.helpers.voice;
    if (voice && typeof voice.say === 'function') {
      voice.say({
        channel: 'bark',
        text,
        kind: 'pirateParley',
        ttl: BRIBE_SHORTFALL_TTL_S,
        id: `pirateParley:${rec.squadId}:bribe-short`,
        factionId: rec.factionId,
      });
    } else {
      this._emit('toast', { text, kind: 'pirateParley', ttl: BRIBE_SHORTFALL_TTL_S });
    }
  },

  // The dumped goods covered the demand. Identical receipt shape to brake-comply
  // (outcome complied, cargo payment) so the prompt receipt renders; choice 'bribe'
  // records how it was paid. Voice stays off the floor — the resolution receipt owns
  // the surface, same as the attack path. The deal is done at once, but the crew mills
  // over the goods before leaving — the receipt emits now, the record closes later.
  // The pods stay floating (same as brake-comply): re-scooping your own bribe mid-scoop
  // is allowed. The pirates consider themselves paid; what happens to the pods is physics.
  _bribed(rec) {
    const state = this.state;
    const now = state.simTime || 0;
    const members = membersFor(state, rec);
    const payment = {
      kind: 'cargo',
      amount: Math.max(0, Math.floor(Number(rec.bribeUnits) || 0)),
      commodityId: dominantBribeLot(rec),
    };
    rec.phase = 'scooping';
    rec.resolved = false;
    rec.choice = 'bribe';
    rec.outcome = 'complied';
    rec.payment = payment;
    rec.scoopUntil = now + BRIBE_SCOOP_S;
    for (const e of members) scoopBribe(e, rec, state);
    const text = String(rec.factionId || '').includes('vael')
      ? 'VAEL: Customs accepts your contribution. Move along.'
      : 'REACH: That covers it. Clear the lane.';
    rec.said.push({ situation: 'bribe-taken', text });
    this._emit('pirateParley:voice', {
      squadId: rec.squadId,
      doctrineId: rec.doctrineId,
      situation: 'bribe-taken',
      text,
      factionId: rec.factionId,
    });
    this._emit('pirateParley:resolved', {
      ...publicRecord(rec),
      outcome: 'complied',
      next: 'break-off',
      payment: { ...payment },
      tithe: rec.tithe ? { ...rec.tithe } : null,
    });
    return true;
  },

  // The scoop window elapsed: the paid crew leaves. The receipt already went out at
  // bribe time, so this closes the record silently.
  _finishScoop(rec) {
    const state = this.state;
    const now = state.simTime || 0;
    const members = membersFor(state, rec);
    rec.phase = 'break-off';
    rec.resolved = true;
    rec.breakOffUntil = now + BREAK_OFF_S;
    for (const e of members) breakOff(e, rec, state);
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
    for (const off of this._subs || []) {
      try { off(); } catch (err) { /* cleanup must not throw */ }
    }
    this._subs = [];
    if (this.bus && this._onChoice && typeof this.bus.off === 'function') {
      this.bus.off('pirateParley:choose', this._onChoice);
    }
    this._onChoice = null;
    this._parleyQuiet = null;
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
  const list = indexedShipLikeScan(state);
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
    bribeValue: 0,
    bribeUnits: 0,
    bribeLots: [],
    bribeAt: null,
    bribeExtension: 0,
    scoopUntil: 0,
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

function scoopBribe(entity, rec, state) {
  const data = entity.data || (entity.data = {});
  const ai = data.ai || (data.ai = {});
  const anchor = rec.bribeAt && Number.isFinite(rec.bribeAt.x) && Number.isFinite(rec.bribeAt.z)
    ? { x: rec.bribeAt.x, z: rec.bribeAt.z }
    : { x: entity.pos.x, z: entity.pos.z };
  ai.passive = true;
  ai.forcePlayerTarget = false;
  ai.huntPlayer = false;
  ai.fsm = 'hold';
  ai.motiveSatisfied = true;
  ai.engagementTrigger = 'parley_bribed';
  ai.roe = RulesOfEngagement.HOLD_FIRE;
  ai.activity = normalizeActivity({
    kind: ActivityKind.LOITER,
    reason: 'pirate_parley:scoop_bribe',
    anchor,
    leashRadius: BRIBE_SCOOP_LEASH,
    startedTick: state.tick | 0,
    encounterId: rec.squadId,
  });
  data.pirateParley = {
    squadId: rec.squadId,
    phase: 'scooping',
    scoopUntil: rec.scoopUntil,
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
    // A credit demand that cannot settle must not dump the hold. Cargo tithe is a different demand.
    return null;
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

function outstandingBribeValue(rec) {
  const demand = rec.demand;
  if (demand && demand.kind === 'credits') return Math.max(0, Math.floor(Number(demand.amount) || 0));
  const tithe = rec.tithe || {};
  const qty = Math.max(0, Math.floor(Number(tithe.qty) || 0));
  const unit = (tithe.commodityId && VALUE_BY_COMMODITY.get(tithe.commodityId)) || 1;
  return qty * unit;
}

function dominantBribeLot(rec) {
  let best = null;
  let bestValue = -Infinity;
  for (const lot of Array.isArray(rec.bribeLots) ? rec.bribeLots : []) {
    const value = Number(lot.value) || 0;
    if (value > bestValue) {
      bestValue = value;
      best = lot.commodityId || null;
    }
  }
  return best;
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
