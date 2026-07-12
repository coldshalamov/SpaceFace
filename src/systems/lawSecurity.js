// lawSecurity.js — jurisdiction, motive, and response authority for live space.
//
// This system closes the gap between the tactical AI's final fire gate and authored encounter
// scripts. Ambient armed ships do not become anonymous murder-tops: valuable cargo can produce a
// toll parley, an empty hold produces watchful neutrality, and the player's first shot produces a
// named retaliation cause. Inside a lawful station's protection volume, actual hostile damage
// dispatches a patrol response that can target criminals even though legacy NPC team numbers are
// shared. Credits/cargo/rep/heat remain with their canonical owners.

import { hash32 } from '../core/rng.js';
import { COMMODITIES } from '../data/commodities.js';
import { ActivityKind, RulesOfEngagement, normalizeActivity } from '../ai/doctrine.js';
import { protectedStationAt } from '../ai/engagementAuthority.js';
import { isPlayerWanted } from './heat.js';
import { makeEnemySpawnSpec } from './combat.js';
import { effectiveRegionalSecurity } from './regionalEcology.js';
import {
  authorityResponsePolicy,
  rankLawfulResponders,
  reserveArrivalPoint,
} from '../law/authorityResponse.js';

export const LAW_SECURITY_VERSION = 2;
export const AMBIENT_TOLL_VALUE_FLOOR = 120;

const RESPONSE_GRACE_S = 6;
const RESPONSE_CLEARANCE = 320;
const RECEIPT_CAP = 24;
const AMBIENT_SCAN_INTERVAL_TICKS = 30;
const LAW_FACTIONS = new Set(['faction_scn', 'faction_mts', 'faction_dmc', 'faction_free']);
const DANGEROUS_CONTEXTS = new Set([
  'zone_hostile', 'encounter', 'interdiction', 'bounty_hunter', 'named_hunter',
  'mission_hostile', 'story_hostile', 'sg06_reinforcement',
]);
const COMMODITY_VALUE = new Map(COMMODITIES.map((row) => [row.id, Math.max(1, Number(row.basePrice) || 1)]));

export const lawSecurity = {
  name: 'lawSecurity',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || {};
    ensureState(this.state);
    this._onDamage = (payload) => this._handleDamage(payload);
    this._onSpawned = (payload) => this._stampAmbient(payload && payload.entity);
    if (this.bus && typeof this.bus.on === 'function') {
      this.bus.on('combat:damage', this._onDamage);
      this.bus.on('entity:spawned', this._onSpawned);
    }
  },

  newGame() {
    if (this.state) this.state.lawSecurity = freshState();
  },

  update(_dt, state) {
    if (state.mode && state.mode !== 'flight') return;
    const own = ensureState(state);
    if ((state.tick | 0) >= (own.nextAmbientScanTick | 0)) {
      own.nextAmbientScanTick = (state.tick | 0) + AMBIENT_SCAN_INTERVAL_TICKS;
      for (const entity of state.entityList || []) this._stampAmbient(entity);
    }
    if ((state.tick | 0) < (own.nextIncidentTick | 0)) return;
    own.nextIncidentTick = (state.tick | 0) + 15;
    for (const key of Object.keys(own.incidents)) this._updateIncident(key, own.incidents[key]);
  },

  _stampAmbient(entity) {
    const state = this.state;
    if (!state || !isArmedNpc(entity, state)) return false;
    const data = entity.data || (entity.data = {});
    const ai = data.ai || (data.ai = {});
    if (ai.escalationPolicyVersion === LAW_SECURITY_VERSION) return false;
    const context = String(ai.spawnContext || ai.context || '').toLowerCase();
    if (context !== 'ambient' || ai.lawful || ai.encounterId || data.encounter || DANGEROUS_CONTEXTS.has(context)) return false;
    if (!isPirateLike(entity)) return false;

    ai.escalationPolicyVersion = LAW_SECURITY_VERSION;
    ai.zoneId = String(ai.zoneId || `ambient:${currentSectorId(state)}`);
    const cargoValue = playerCargoValue(state);
    const security = Number.isFinite(ai.sectorSecurity) ? ai.sectorSecurity : sectorSecurity(state);
    if (cargoValue >= AMBIENT_TOLL_VALUE_FLOOR && security <= 0.75) {
      // pirateParley owns the actual demand/comply/refuse state machine. One shared squad id keeps
      // an ambient group on one voice instead of every ship demanding separately.
      ai.doctrine = 'toll';
      ai.squadId = String(ai.squadId || `ambient_toll:${currentSectorId(state)}:${ai.zoneId}`);
      ai.motive = 'cargo_extortion';
      ai.engagementTrigger = 'demand_pending';
      ai.approachTelegraph = String(ai.approachTelegraph || 'hail_and_scan');
      ai.noFireResponseWindowS = Math.max(0.75, Number(ai.noFireResponseWindowS) || 0);
      return true;
    }

    // No value and no authored danger means no rational reason to attack. The ship remains a real
    // contact and may defend itself after player aggression, but it neither targets nor fires now.
    ai.passive = true;
    ai.motive = cargoValue > 0 ? 'territorial_watch' : 'no_valuable_cargo';
    ai.engagementTrigger = 'player_attack';
    ai.approachTelegraph = String(ai.approachTelegraph || 'warning_pass');
    ai.roe = RulesOfEngagement.HOLD_FIRE;
    ai.activity = normalizeActivity({
      kind: ActivityKind.LOITER,
      reason: `ambient_watch:${ai.motive}`,
      anchor: entity.pos,
      leashRadius: 1800,
      startedTick: state.tick | 0,
    });
    clearTarget(entity, state.playerId);
    return true;
  },

  _handleDamage(payload) {
    const state = this.state;
    if (!state || !payload || !(Number(payload.applied) > 0)) return;
    const attacker = entityById(state, payload.attackerId);
    const target = entityById(state, payload.targetId);
    if (!attacker || !target || attacker.id === target.id) return;
    const player = entityById(state, state.playerId);

    // Shooting a parley squad is an explicit refusal, not an unlabelled hostility transition.
    if (attacker.id === state.playerId && target.data && target.data.ai && target.data.ai.parleySquadId) {
      this._emit('pirateParley:choose', { squadId: target.data.ai.parleySquadId, choice: 'refuse', reason: 'player_attack' });
    }

    if (attacker.id === state.playerId && target.id !== state.playerId) {
      const jurisdiction = protectedStationAt(state, target) || (player && protectedStationAt(state, player));
      if (jurisdiction && (isLawful(target) || isProtectedCivilian(target))) {
        this._openIncident(attacker, target, jurisdiction, isLawful(target) ? 'player_assault' : 'player_piracy');
        return;
      }
      if (isLawful(target)) {
        if (jurisdiction) this._openIncident(attacker, target, jurisdiction, 'player_assault');
        else this._authorizeResponder(target, attacker, null, 'self_defense');
      } else {
        this._retaliate(target, attacker);
      }
      return;
    }

    const targetProtected = target.id === state.playerId || isLawful(target) || isProtectedCivilian(target);
    if (!targetProtected || isLawful(attacker)) return;
    const jurisdiction = protectedStationAt(state, target);
    if (jurisdiction) this._openIncident(attacker, target, jurisdiction,
      target.id === state.playerId || isLawful(target) ? 'hostile_fire' : 'npc_piracy');
    else if (isLawful(target) && target.type !== 'station') this._authorizeResponder(target, attacker, null, 'self_defense');
  },

  _retaliate(victim, attacker) {
    if (!victim || !attacker || isLawful(victim)) return;
    const state = this.state;
    const protection = protectedStationAt(state, attacker);
    const data = victim.data || (victim.data = {});
    const ai = data.ai || (data.ai = {});
    ai.motive = 'self_defense';
    ai.engagementTrigger = 'player_attack';
    ai.retaliationTargetId = attacker.id;
    ai.approachTelegraph = 'return_fire_warning';
    ai.noFireResponseWindowS = 0.75;
    if (protection) {
      ai.passive = true;
      ai.roe = RulesOfEngagement.HOLD_FIRE;
      ai.activity = normalizeActivity({
        kind: ActivityKind.DISENGAGE,
        reason: 'station_jurisdiction:withdraw',
        anchor: victim.pos,
        leashRadius: 1600,
        startedTick: state.tick | 0,
        targetId: null,
      });
      clearTarget(victim, attacker.id);
      this._say('bark', 'Station guns own this lane. We are leaving.', `law:retreat:${victim.id}`, victim.factionId);
      this._recordReceipt({
        cause: 'player_attack', outcome: 'protected_withdrawal', attackerId: attacker.id,
        targetId: victim.id, stationId: protection.stationId,
        text: 'PLAYER FIRED FIRST — target withdrew under station protection.',
      });
      return;
    }
    ai.passive = false;
    ai.roe = RulesOfEngagement.WEAPONS_FREE;
    ai.activity = normalizeActivity({
      kind: ActivityKind.ATTACK_RUN,
      reason: 'retaliation:player_attack',
      anchor: victim.pos,
      leashRadius: 2200,
      startedTick: state.tick | 0,
      targetId: attacker.id,
    });
    const combat = data.combat || (data.combat = {});
    combat.targetId = attacker.id;
    this._say('bark', 'You fired first. Clear our range to disengage.', `law:retaliation:${victim.id}`, victim.factionId);
    this._recordReceipt({
      cause: 'player_attack', outcome: 'retaliation_authorized', attackerId: attacker.id,
      targetId: victim.id, stationId: null,
      text: 'PLAYER FIRED FIRST — self-defense authorized; break contact to disengage.',
    });
  },

  _openIncident(attacker, victim, jurisdiction, cause) {
    const state = this.state;
    const own = ensureState(state);
    const key = `${jurisdiction.stationId}:${attacker.id}`;
    const existing = own.incidents[key];
    if (existing) {
      existing.lastDamageAt = state.simTime || 0;
      existing.victimId = victim.id;
      return existing;
    }
    const incident = {
      id: `law:${hash32(state.meta && state.meta.seed || 1, jurisdiction.stationId, attacker.id, state.tick | 0).toString(16)}`,
      stationId: jurisdiction.stationId,
      stationEntityId: jurisdiction.entityId,
      factionId: jurisdiction.factionId,
      radius: jurisdiction.radius,
      attackerId: attacker.id,
      victimId: victim.id,
      cause,
      startedAt: state.simTime || 0,
      lastDamageAt: state.simTime || 0,
      responderIds: [],
      status: 'distress',
    };
    const policy = authorityResponsePolicy(effectiveLawSecurity(state));
    incident.security = policy.security;
    incident.dispatchDelayS = policy.dispatchDelayS;
    incident.dispatchAt = incident.startedAt + policy.dispatchDelayS;
    incident.responderCap = policy.responderCap;
    incident.reserveAllowed = policy.reserveAllowed;
    incident.challengeWindowS = policy.challengeWindowS;
    own.incidents[key] = incident;
    this._say('alert', `CONTROL: distress logged. Patrol ETA ${policy.dispatchDelayS.toFixed(2)} seconds.`, `law:distress:${incident.id}`, jurisdiction.factionId);
    this._emit('law:distressRaised', publicIncident(incident));
    this._emit('law:incidentOpened', publicIncident(incident));
    this._recordReceipt({
      incidentId: incident.id, cause, outcome: 'distress_received', attackerId: attacker.id,
      targetId: victim.id, stationId: jurisdiction.stationId,
      text: `DISTRESS RECEIVED — patrol dispatch in ${policy.dispatchDelayS.toFixed(2)} seconds.`,
    });
    return incident;
  },

  _respondersFor(incident, victim) {
    const state = this.state;
    const station = entityById(state, incident.stationEntityId) || stationByPublicId(state, incident.stationId);
    const anchor = station && station.pos || victim.pos;
    const candidates = isLawful(victim) && victim.type === 'ship'
      ? [victim, ...(state.entityList || [])]
      : (state.entityList || []);
    const out = rankLawfulResponders(candidates, anchor, {
      aggressorId: incident.attackerId,
      cap: incident.responderCap,
      radius: incident.radius + 1000,
    });
    const reserveCount = incident.reserveAllowed
      ? Math.max(0, incident.responderCap - out.length)
      : 0;
    for (let index = 0; index < reserveCount && typeof this.helpers.spawnEntity === 'function'; index++) {
      const pos = reserveArrivalPoint({
        anchor,
        aggressorPos: entityById(state, incident.attackerId)?.pos,
        jurisdictionRadius: incident.radius,
        seed: state.meta && state.meta.seed || 1,
        incidentId: `${incident.id}:${index}`,
      });
      const spec = makeEnemySpawnSpec('patrol_lawman', 3, pos, {
        factionId: incident.factionId || 'faction_scn',
        motive: 'jurisdiction_enforcement',
        engagementTrigger: 'security_response',
        zoneId: `jurisdiction:${incident.stationId}`,
        approachTelegraph: 'patrol_challenge',
        noFireResponseWindowS: incident.challengeWindowS,
      });
      const spawned = this.helpers.spawnEntity(spec);
      if (spawned) {
        const ai = spawned.data && spawned.data.ai;
        if (ai) ai.spawnContext = 'security_response';
        out.push(spawned);
      }
    }
    return out;
  },

  _dispatchIncident(incident, victim, attacker) {
    const responders = this._respondersFor(incident, victim);
    incident.dispatchedAt = this.state.simTime || 0;
    incident.status = responders.length ? 'responding' : 'monitoring';
    for (const responder of responders) {
      this._authorizeResponder(responder, attacker, incident, 'security_response');
      incident.responderIds.push(responder.id);
    }
    const payload = publicIncident(incident);
    this._emit('law:dispatchStarted', payload);
    if (responders.length) {
      this._say('alert', `CONTROL: ${responders.length} patrol unit${responders.length === 1 ? '' : 's'} intercepting the aggressor.`, `law:dispatch:${incident.id}`, incident.factionId);
      this._recordReceipt({
        incidentId: incident.id, cause: incident.cause, outcome: 'patrol_dispatched',
        attackerId: incident.attackerId, targetId: incident.victimId, stationId: incident.stationId,
        text: `PATROL DISPATCHED — ${responders.length} unit${responders.length === 1 ? '' : 's'} intercepting the aggressor.`,
      });
    } else {
      this._say('alert', 'CONTROL: no patrol in range. Distress remains active.', `law:dispatch:none:${incident.id}`, incident.factionId);
      this._recordReceipt({
        incidentId: incident.id, cause: incident.cause, outcome: 'dispatch_unavailable',
        attackerId: incident.attackerId, targetId: incident.victimId, stationId: incident.stationId,
        text: 'NO PATROL IN RANGE — distress remains active.',
      });
    }
  },

  _authorizeResponder(responder, attacker, incident, motive) {
    if (!responder || !attacker) return;
    const state = this.state;
    const data = responder.data || (responder.data = {});
    const ai = data.ai || (data.ai = {});
    ai.lawful = true;
    ai.passive = false;
    ai.securityTargetId = attacker.id;
    ai.motive = motive === 'self_defense' ? 'self_defense' : 'jurisdiction_enforcement';
    ai.engagementTrigger = motive === 'self_defense' ? 'player_attack' : 'security_response';
    ai.zoneId = incident ? `jurisdiction:${incident.stationId}` : String(ai.zoneId || 'patrol_route');
    ai.approachTelegraph = 'patrol_challenge';
    ai.noFireResponseWindowS = incident ? incident.challengeWindowS : 1;
    ai.roe = RulesOfEngagement.WEAPONS_FREE;
    const anchor = incident
      ? (stationByPublicId(state, incident.stationId)?.pos || responder.pos)
      : responder.pos;
    ai.activity = normalizeActivity({
      kind: ActivityKind.ATTACK_RUN,
      reason: `security_response:${incident ? incident.id : 'self_defense'}`,
      anchor,
      leashRadius: incident ? incident.radius + 900 : 2200,
      startedTick: state.tick | 0,
      targetId: attacker.id,
      encounterId: incident && incident.id,
    });
    const combat = data.combat || (data.combat = {});
    combat.targetId = attacker.id;
    const intent = data.intent || (data.intent = {});
    intent.fire = false;
  },

  _updateIncident(key, incident) {
    if (!incident || !['distress', 'responding', 'monitoring'].includes(incident.status)) return;
    const state = this.state;
    const attacker = entityById(state, incident.attackerId);
    const victim = entityById(state, incident.victimId);
    const station = entityById(state, incident.stationEntityId) || stationByPublicId(state, incident.stationId);
    const now = state.simTime || 0;
    let outcome = null;
    if (!attacker || attacker.alive === false) outcome = 'threat_cleared';
    else if (incident.status === 'distress' && now >= incident.dispatchAt) {
      this._dispatchIncident(incident, victim || station, attacker);
    }
    else if (station && distance2(attacker.pos, station.pos) > Math.pow(incident.radius + RESPONSE_CLEARANCE, 2)
      && now - incident.lastDamageAt >= RESPONSE_GRACE_S
      && !(attacker.id === state.playerId && isPlayerWanted(state))) {
      outcome = 'disengaged';
    }
    if (!outcome) return;
    incident.status = 'resolved';
    incident.outcome = outcome;
    incident.resolvedAt = now;
    for (const id of incident.responderIds) this._clearResponder(entityById(state, id), incident.attackerId);
    delete ensureState(state).incidents[key];
    this._say('info', 'CONTROL: threat clear. Station approach secure.', `law:clear:${incident.id}`, incident.factionId);
    this._emit('law:incidentResolved', publicIncident(incident));
    this._emit('encounter:receipt', {
      encounterId: incident.id,
      shape: 'security_response',
      outcome,
      text: outcome === 'disengaged'
        ? 'CONTACT BROKEN — patrol stood down after the station ring cleared.'
        : 'THREAT CLEARED — station approach secure.',
      t: now,
    });
  },

  _clearResponder(responder, targetId) {
    if (!responder || !isLawful(responder)) return;
    const state = this.state;
    const data = responder.data || (responder.data = {});
    const ai = data.ai || (data.ai = {});
    if (ai.securityTargetId !== targetId) return;
    ai.securityTargetId = null;
    ai.passive = false;
    ai.engagementTrigger = 'wanted_status';
    ai.motive = 'law_enforcement';
    ai.roe = RulesOfEngagement.LAWFUL_WANTED_ONLY;
    ai.activity = normalizeActivity({
      kind: ActivityKind.RETURN_TO_ANCHOR,
      reason: 'security_response:clear',
      anchor: ai.activity && ai.activity.anchor || responder.pos,
      leashRadius: ai.activity && ai.activity.leashRadius || 2600,
      startedTick: state.tick | 0,
    });
    clearTarget(responder, targetId);
  },

  _recordReceipt(receipt) {
    const state = this.state;
    const own = ensureState(state);
    const row = { ...receipt, t: state.simTime || 0, tick: state.tick | 0 };
    own.receipts.push(row);
    while (own.receipts.length > RECEIPT_CAP) own.receipts.shift();
    this._emit('law:incidentReceipt', row);
  },

  _say(channel, text, id, factionId) {
    // The sector-law presenter owns the single visible authority surface from the public lifecycle
    // and receipt events emitted immediately after these calls. Keep the authored line available to
    // telemetry/audio without duplicating it on the global voice floor.
    this._emit('law:voice', { channel, text, id, factionId, kind: 'lawSecurity' });
  },

  _emit(event, payload) {
    if (this.bus && typeof this.bus.emit === 'function') this.bus.emit(event, payload);
  },

  destroy() {
    if (this.bus && typeof this.bus.off === 'function') {
      if (this._onDamage) this.bus.off('combat:damage', this._onDamage);
      if (this._onSpawned) this.bus.off('entity:spawned', this._onSpawned);
    }
    this._onDamage = null;
    this._onSpawned = null;
  },
};

export function aggressionCauseFor(state, attacker, target) {
  const ai = attacker && attacker.data && attacker.data.ai || {};
  if (!attacker || !target) return 'unknown';
  if (attacker.id === state.playerId) return isLawful(target) ? 'player_assault' : 'player_attack';
  if (ai.securityTargetId === target.id) return 'security_response';
  if (ai.retaliationTargetId === target.id) return 'self_defense';
  if (ai.engagementTrigger === 'explicit_refusal' || ai.engagementTrigger === 'ignored_demand') return 'refused_demand';
  if (ai.motive === 'cargo_extortion') return 'valuable_cargo';
  if (ai.engagementTrigger === 'wanted_status') return 'wanted_status';
  if (ai.encounterId || DANGEROUS_CONTEXTS.has(String(ai.spawnContext || ''))) return 'authored_danger';
  return 'unmotivated';
}

export function playerCargoValue(state) {
  const items = state && state.player && state.player.cargo && state.player.cargo.items || {};
  let total = 0;
  for (const id of Object.keys(items).sort()) {
    total += Math.max(0, Math.floor(Number(items[id]) || 0)) * (COMMODITY_VALUE.get(id) || 1);
  }
  return total;
}

function freshState() {
  return { version: LAW_SECURITY_VERSION, incidents: {}, receipts: [], nextAmbientScanTick: 0, nextIncidentTick: 0 };
}

function ensureState(state) {
  if (!state.lawSecurity || typeof state.lawSecurity !== 'object' || Array.isArray(state.lawSecurity)) state.lawSecurity = freshState();
  const own = state.lawSecurity;
  own.version = LAW_SECURITY_VERSION;
  if (!own.incidents || typeof own.incidents !== 'object' || Array.isArray(own.incidents)) own.incidents = {};
  if (!Array.isArray(own.receipts)) own.receipts = [];
  if (!Number.isInteger(own.nextAmbientScanTick)) own.nextAmbientScanTick = 0;
  if (!Number.isInteger(own.nextIncidentTick)) own.nextIncidentTick = 0;
  return own;
}

function isArmedNpc(entity, state) {
  if (!entity || entity.alive === false || entity.id === state.playerId || entity.type !== 'ship') return false;
  return !!(entity.data && entity.data.ai);
}

function isPirateLike(entity) {
  const data = entity && entity.data || {};
  const ai = data.ai || {};
  const words = `${ai.archetype || ''} ${ai.doctrine || ''} ${ai.role || ''} ${data.role || ''} ${entity.factionId || ''}`.toLowerCase();
  return words.includes('pirate') || words.includes('raider') || words.includes('scavenger')
    || words.includes('corsair') || entity.factionId === 'faction_reach';
}

function isLawful(entity) {
  if (!entity) return false;
  const ai = entity.data && entity.data.ai || {};
  return ai.lawful === true || (entity.type === 'station' && LAW_FACTIONS.has(entity.factionId));
}

function isProtectedCivilian(entity) {
  if (!entity || entity.type !== 'ship') return false;
  const data = entity.data || {};
  const ai = data.ai || {};
  const role = String(data.trafficRole || ai.role || ai.archetype || '').toLowerCase();
  return entity.team === 2 || ai.spawnContext === 'convoy_civilian'
    || ['hauler', 'courier', 'miner', 'trader', 'civilian', 'fleeing_trader'].some((word) => role.includes(word));
}

function entityById(state, id) {
  return id == null || !state || !state.entities || typeof state.entities.get !== 'function' ? null : state.entities.get(id) || null;
}

function stationByPublicId(state, stationId) {
  for (const entity of state.entityList || []) {
    if (!entity || entity.type !== 'station') continue;
    const id = entity.data && entity.data.stationId || entity.stationId || entity.id;
    if (String(id) === String(stationId)) return entity;
  }
  return null;
}

function clearTarget(entity, targetId) {
  if (!entity) return;
  const data = entity.data || (entity.data = {});
  const combat = data.combat || (data.combat = {});
  if (targetId == null || combat.targetId === targetId) combat.targetId = null;
  if (targetId == null || combat.lockTarget === targetId) combat.lockTarget = null;
  const intent = data.intent || (data.intent = {});
  intent.fire = false;
  intent.fireGroup = null;
}

function currentSectorId(state) {
  return state && state.world && state.world.currentSectorId || 'unknown';
}

function sectorSecurity(state) {
  return effectiveLawSecurity(state);
}

export function effectiveLawSecurity(state) {
  const id = currentSectorId(state);
  const sec = state && state.world && state.world.sectors && state.world.sectors[id];
  const baseline = Number.isFinite(sec && sec.security) ? sec.security : 0.5;
  return effectiveRegionalSecurity(state, id, baseline);
}

function distance2(a, b) {
  const dx = Number(a && a.x) - Number(b && b.x);
  const dz = Number(a && a.z) - Number(b && b.z);
  return dx * dx + dz * dz;
}

function publicIncident(incident) {
  return {
    id: incident.id,
    stationId: incident.stationId,
    factionId: incident.factionId,
    attackerId: incident.attackerId,
    victimId: incident.victimId,
    cause: incident.cause,
    status: incident.status,
    outcome: incident.outcome || null,
    responderIds: incident.responderIds.slice(),
    startedAt: incident.startedAt,
    dispatchAt: incident.dispatchAt || null,
    dispatchedAt: incident.dispatchedAt || null,
    dispatchDelayS: incident.dispatchDelayS || null,
    responderCap: incident.responderCap || 0,
    security: incident.security,
    resolvedAt: incident.resolvedAt || null,
  };
}

export default lawSecurity;
