import { ENEMY_MIND_PROFILES, resolveEnemyMindTuning } from '../../data/enemyMindTuning.js';
import { boundedGoal, cleanCopy, compare, keyFor, point, unitValue } from './math.js';
import { authorityFor, hearPeers, observePilot } from './observation.js';
import { advancePlan, choosePlan, makePlan, steerPlan, updateMorale } from './decision.js';

export const ENEMY_MIND_STATE_VERSION = 1;
const TRAITS = Object.freeze(['courage', 'discipline', 'loyalty', 'cunning', 'aggression', 'patience']);
const EPS = 1e-9;

export function createEnemyMindState() {
  return { version: ENEMY_MIND_STATE_VERSION, lastTime: null, lastTick: -1, cursorKey: null,
    pilots: {}, signals: [], pending: [], events: [], eventSequence: 0, stats: {} };
}

/**
 * Serializable state is caller-owned (production: state.enemyMind). This object owns only tuning.
 * All stochastic draws are from the supplied state.rng, seven per newly admitted pilot, in
 * canonical ID order. Decision frequency, radio traffic and diagnostics never consume RNG.
 */
export class EnemyMindRuntime {
  constructor({ tuning = {}, profile = 'crew', profilesByDoctrine = {}, traitsByEntity = {} } = {}) {
    this.tuning = resolveEnemyMindTuning(tuning);
    if (!ENEMY_MIND_PROFILES[profile]) throw new TypeError(`Unknown Enemy Mind profile: ${profile}`);
    this.profile = profile;
    this.profilesByDoctrine = { ...profilesByDoctrine };
    this.traitsByEntity = { ...traitsByEntity };
    for (const value of Object.values(this.profilesByDoctrine)) {
      if (!ENEMY_MIND_PROFILES[value]) throw new TypeError(`Unknown Enemy Mind profile: ${value}`);
    }
    for (const traits of Object.values(this.traitsByEntity)) {
      for (const [key, value] of Object.entries(traits)) {
        if (!TRAITS.includes(key)) throw new TypeError(`Unknown Enemy Mind trait: ${key}`);
        if (!Number.isFinite(value) || value < 0 || value > 1) throw new RangeError(`Trait ${key} must be in [0,1]`);
      }
    }
  }

  step({ memory, rng, simTime, tick, roster, perceptionsByEntity, directivesByEntity }) {
    assertState(memory);
    if (typeof rng !== 'function') throw new TypeError('Enemy Mind requires state.rng()');
    if (!Number.isFinite(simTime) || simTime < 0) throw new RangeError('Enemy Mind requires nonnegative state.simTime');
    if (!Number.isInteger(tick) || tick < 0) throw new RangeError('Enemy Mind requires a nonnegative simulation tick');
    if (memory.lastTime != null && (simTime < memory.lastTime - EPS || tick < memory.lastTick)) throw new RangeError('Enemy Mind clock moved backwards; restore its snapshot with the world');
    if (tick === memory.lastTick) {
      if (simTime !== memory.lastTime) throw new RangeError('Same tick with a different simulation time');
      return cachedOutput(memory);
    }
    if (!Array.isArray(roster) || !(perceptionsByEntity instanceof Map) || !(directivesByEntity instanceof Map)) throw new TypeError('Enemy Mind requires roster and perception/directive Maps');
    const tuning = this.tuning;
    const stats = { pilots: 0, overflow: 0, thinks: 0, reflexes: 0, contactReads: 0, contactsTruncated: 0,
      radioReads: 0, signalsSent: 0, rngDraws: 0, maxThinkAge: 0, decisionsChanged: 0 };
    const dt = memory.lastTime == null ? 0 : Math.max(0, simTime - memory.lastTime);
    const entries = canonicalEntries(roster);
    const live = new Set(entries.map((entry) => entry.key));
    // Removal stops a mind, but its already-transmitted report lives until TTL. No death oracle.
    for (const key of Object.keys(memory.pilots)) {
      if (!live.has(key)) delete memory.pilots[key];
    }
    memory.pending = memory.pending.filter((signal) => live.has(signal.key));
    deliverRadio(memory, simTime, tuning);
    const active = [];
    const observations = new Map();
    const heard = new Map();
    for (const entry of entries) {
      const perception = perceptionsByEntity.get(entry.member.id);
      const directive = directivesByEntity.get(entry.member.id);
      const authority = authorityFor(entry.member, perception, directive);
      if (authority === 'none' || authority === 'reserved') {
        const previous = memory.pilots[entry.key];
        if (previous) { previous.output = null; previous.plan = null; }
        continue;
      }
      if (active.length >= tuning.maxPilots) {
        stats.overflow++;
        if (memory.pilots[entry.key]) memory.pilots[entry.key].output = null;
        continue;
      }
      let record = memory.pilots[entry.key];
      if (!record || record.squadKey !== entry.squadKey) {
        record = this._admit(entry, rng, simTime, stats, record);
        memory.pilots[entry.key] = record;
      }
      active.push(record);
      const obs = observePilot(record, entry.member, perception, directive, simTime, tick, tuning, stats);
      observations.set(record.key, obs);
      const peers = hearPeers(record, obs, memory.signals, simTime, tuning, stats);
      heard.set(record.key, peers);
      updateMorale(record, obs, peers, dt, tuning);
      record.output = null;
    }
    stats.pilots = active.length;
    // Bound dormant personality retention as well as active cognition. Active records win.
    const activeKeys = new Set(active.map((record) => record.key));
    let retained = active.length;
    for (const key of Object.keys(memory.pilots).sort(compare)) {
      if (activeKeys.has(key)) continue;
      if (retained >= tuning.maxPilots) delete memory.pilots[key];
      else retained++;
    }
    memory.pending = memory.pending.filter((signal) => activeKeys.has(signal.key));

    // O(N) emergency/freshness lane runs independently of the bounded utility-planning queue.
    // Cold-start excess pilots coast safely until serviced; they do not get free attacks.
    const reflex = new Set();
    for (const record of active) {
      const obs = observations.get(record.key), peers = heard.get(record.key);
      const old = record.plan;
      let forced = null;
      if (obs.disabled) forced = { verb: 'regroup', score: 2, reason: 'drive_unavailable' };
      else if (obs.authority === 'retreat' || obs.hull <= tuning.criticalHull) forced = { verb: 'withdraw', score: 2, reason: obs.authority === 'retreat' ? 'retreat_order' : 'critical_hull' };
      else if (record.fear >= tuning.panicFear && record.traits.discipline < 0.46) forced = { verb: 'panic', score: 1.8, reason: 'discipline_broken' };
      else if (!obs.target && old && old.verb !== 'withdraw' && old.verb !== 'panic' && old.verb !== 'regroup') forced = { verb: 'regroup', score: 1.4, reason: 'contact_not_current' };
      if (forced && (!old || old.verb !== forced.verb || old.targetId !== (obs.known?.id ?? null))) {
        this._commit(memory, record, forced, obs, peers, simTime, tick, stats);
        stats.reflexes++;
      }
      if (forced) {
        reflex.add(record.key);
        record.lastThinkAt = simTime;
        record.nextThinkAt = simTime + tuning.thinkInterval;
      }
      if (advancePlan(record, obs, simTime, tuning)) {
        emitFact(memory, tuning, 'phase', record, simTime, tick, { reason: record.plan.reason });
      }
    }
    // Round-robin by stable key, saved with the world. A hot pilot cannot starve the last ship.
    const start = nextIndex(active, memory.cursorKey);
    for (let offset = 0; offset < active.length && stats.thinks < tuning.maxThinksPerUpdate; offset++) {
      const record = active[(start + offset) % active.length];
      if (reflex.has(record.key) || simTime + EPS < record.nextThinkAt) continue;
      const obs = observations.get(record.key), peers = heard.get(record.key);
      const choice = choosePlan(record, obs, peers, simTime, tuning);
      const plan = record.plan;
      const changed = !plan || plan.verb !== choice.verb || plan.targetId !== (obs.known?.id ?? null)
        || plan.chargeId !== (choice.charge?.id ?? null) || simTime + EPS >= plan.endsAt;
      if (changed) this._commit(memory, record, choice, obs, peers, simTime, tick, stats);
      else if (choice.reason === 'overcommitted_under_pressure' && plan.reason !== choice.reason) {
        plan.reason = choice.reason;
        emitFact(memory, tuning, 'mistake', record, simTime, tick, { reason: choice.reason });
      }
      record.lastThinkAt = simTime;
      record.nextThinkAt = simTime + tuning.thinkInterval;
      memory.cursorKey = record.key;
      stats.thinks++;
    }

    const outputs = new Map();
    for (const record of active) {
      const obs = observations.get(record.key), peers = heard.get(record.key);
      const output = steerPlan(record, obs, peers, simTime, tuning) || coldStartOutput(record, obs, simTime, tuning);
      output.goal = boundedGoal(output.goal, obs.pos, tuning.maxGoalDistance);
      output.tick = tick;
      Object.freeze(output.goal);
      Object.freeze(output);
      record.output = output;
      stats.maxThinkAge = Math.max(stats.maxThinkAge, simTime - (record.lastThinkAt ?? record.admittedAt));
      outputs.set(record.id, output);
      if (record.plan && simTime + EPS >= record.nextSignalAt) {
        postSignal(memory, record, obs, simTime, tuning);
        record.nextSignalAt = simTime + tuning.signalInterval;
        stats.signalsSent++;
      }
    }
    memory.lastTime = simTime;
    memory.lastTick = tick;
    memory.stats = stats;
    return outputs;
  }

  _admit(entry, rng, now, stats, previous = null) {
    // Reassignment keeps the same pilot personality and consumes no additional world RNG.
    let traits = previous?.traits;
    let initiative = previous?.initiative;
    let side = previous?.side;
    if (!traits) {
      const profileName = this.profilesByDoctrine[entry.member.combatDoctrineId] || this.profile;
      const profile = ENEMY_MIND_PROFILES[profileName];
      const overrides = this.traitsByEntity[entry.key] || this.traitsByEntity[String(entry.member.id)] || {};
      traits = {};
      for (const key of TRAITS) {
        const variation = draw(rng); // one draw per trait, even when authored
        traits[key] = unitValue(overrides[key] ?? (profile[key] + (variation - 0.5) * 0.28));
      }
      initiative = draw(rng);
      side = initiative < 0.5 ? -1 : 1;
      stats.rngDraws += 7;
    }
    return {
      key: entry.key, id: entry.member.id, squadKey: entry.squadKey, squadId: entry.squadId,
      traits, initiative, side, admittedAt: now, fear: previous?.fear || 0, shock: 0, support: 0,
      lastHull: previous?.lastHull ?? 1, observedAt: null, frameTick: null, frameAt: null,
      lastTarget: null, contactCursor: 0, targetSlot: null, plan: null, planSerial: previous?.planSerial || 0, scores: [], output: null,
      baitReadyAt: now, nextThinkAt: now, lastThinkAt: null, nextSignalAt: now,
    };
  }

  _commit(memory, record, choice, obs, peers, now, tick, stats) {
    record.plan = makePlan(record, choice, obs, peers, now, this.tuning);
    emitFact(memory, this.tuning, 'decision', record, now, tick, { reason: choice.reason });
    if (choice.read) emitFact(memory, this.tuning, 'pursuit_read', record, now, tick,
      { chargeId: choice.read.peer.id, alignment: choice.read.alignment, observedSpeed: choice.read.speed });
    stats.decisionsChanged++;
  }

  inspect(memory, entityId = null) {
    assertState(memory);
    return cleanCopy(entityId == null ? memory : memory.pilots[keyFor(entityId)] || null);
  }

  forget(memory, entityId) {
    assertState(memory);
    const key = keyFor(entityId);
    delete memory.pilots[key];
    memory.pending = memory.pending.filter((signal) => signal.key !== key);
    // Leave delivered reports to expire: other pilots have not necessarily seen the loss.
  }
}

function assertState(memory) {
  if (!memory || memory.version !== ENEMY_MIND_STATE_VERSION || !memory.pilots
    || !Array.isArray(memory.signals) || !Array.isArray(memory.pending) || !Array.isArray(memory.events)) {
    throw new TypeError('Invalid Enemy Mind snapshot (expected version 1)');
  }
}
function draw(rng) {
  const value = rng();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError('state.rng() must return [0,1)');
  return value;
}
function canonicalEntries(roster) {
  const entries = [], seen = new Set();
  for (const squad of roster) {
    const squadKey = keyFor(squad.id);
    if (!Array.isArray(squad.members)) throw new TypeError('Squad members must be an array');
    for (const member of squad.members) {
      const key = keyFor(member.id);
      if (seen.has(key)) throw new Error(`Duplicate Enemy Mind member ${key}`);
      seen.add(key);
      entries.push({ key, squadKey, squadId: squad.id, member });
    }
  }
  return entries.sort((a, b) => compare(a.key, b.key));
}
function nextIndex(records, cursorKey) {
  if (!cursorKey) return 0;
  const index = records.findIndex((record) => compare(record.key, cursorKey) > 0);
  return index < 0 ? 0 : index;
}
function deliverRadio(memory, now, tuning) {
  const latest = new Map(memory.signals.filter((s) => s.expiresAt >= now).map((s) => [s.key, s]));
  const pending = [];
  for (const signal of memory.pending) {
    if (signal.deliverAt <= now + EPS) {
      if (signal.expiresAt >= now && (!latest.has(signal.key) || latest.get(signal.key).sentAt <= signal.sentAt)) latest.set(signal.key, signal);
    } else pending.push(signal);
  }
  // Churn cannot create an unbounded afterlife of radio messages. Keep newest reports,
  // then canonicalize scan order; truncation is conservative under extreme fleet sizes.
  memory.signals = [...latest.values()].sort((a, b) => b.sentAt - a.sentAt || compare(a.key, b.key))
    .slice(0, tuning.maxPilots).sort((a, b) => compare(a.key, b.key));
  memory.pending = pending;
}
function postSignal(memory, record, obs, now, tuning) {
  // Keep at most the first in-flight packet and the newest successor per sender. Coalescing
  // never pushes the first packet's delivery time forward, even under extreme tuning.
  const existing = memory.pending.filter((signal) => signal.key === record.key);
  if (existing.length >= 2) memory.pending = memory.pending.filter((signal) => signal !== existing[existing.length - 1]);
  memory.pending.push({
    key: record.key, id: record.id, squadKey: record.squadKey, squadId: record.squadId,
    team: obs.team, pos: point(obs.pos), vel: point(obs.vel), hull: obs.hull,
    verb: record.plan.verb, phase: record.plan.phase, chargeId: record.plan.chargeId,
    targetId: record.plan.targetId, bid: record.initiative,
    sentAt: now, deliverAt: now + tuning.radioLatency, expiresAt: now + tuning.radioTTL,
  });
}
function emitFact(memory, tuning, kind, record, now, tick, details) {
  const event = { sequence: ++memory.eventSequence, kind, simTime: now, tick,
    entityId: record.id, squadId: record.squadId, serial: record.plan.serial,
    targetId: record.plan.targetId, chargeId: record.plan.chargeId, startedAt: record.plan.startedAt,
    verb: record.plan.verb, phase: record.plan.phase, fear: record.fear, ...details };
  memory.events.push(event);
  if (memory.events.length > tuning.maxEvents) memory.events.splice(0, memory.events.length - tuning.maxEvents);
}
function cachedOutput(memory) {
  const outputs = new Map();
  for (const key of Object.keys(memory.pilots).sort(compare)) {
    const record = memory.pilots[key];
    if (record.output) outputs.set(record.id, record.output);
  }
  return outputs;
}
function coldStartOutput(record, obs, now, tuning) {
  return { entityId: record.id, serial: 0, verb: 'regroup', phase: 'awaiting_think',
    reason: 'bounded_planning_queue', targetId: null, chargeId: null, goal: point(obs.pos),
    maneuverKind: 'formation', faceTarget: false, ownManeuver: true, fireAllowed: false,
    emergency: false, fear: record.fear, confidence: 0, startedAt: now, phaseAt: now,
    tellUntil: now, validUntil: now + tuning.maxSensorAge };
}
