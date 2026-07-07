// BP-02.1/C9 Kills-Less-Central Outcomes.
//
// Observer-only combat receipts. Records one terminal outcome per hostile and emits seams that
// future economy/rep systems can consume; it never writes credits, cargo, rep, AI, or combat state.
import { isHostileToPlayer } from './scanner.js';

const STATE_VERSION = 1;
const MAX_OUTCOMES = 64;
const DISABLE_OUTCOME_SUBSYSTEMS = new Set([
  'subsystem_drive',
  'subsystem_weapon',
  'subsystem_tether_spool',
  'subsystem_power',
]);

function ensureState(state) {
  if (!state.combatOutcome || typeof state.combatOutcome !== 'object') {
    state.combatOutcome = { schemaVersion: STATE_VERSION, outcomes: [], byEntity: {} };
  }
  if (!Array.isArray(state.combatOutcome.outcomes)) state.combatOutcome.outcomes = [];
  if (!state.combatOutcome.byEntity || typeof state.combatOutcome.byEntity !== 'object') {
    state.combatOutcome.byEntity = {};
  }
  state.combatOutcome.schemaVersion = STATE_VERSION;
  return state.combatOutcome;
}

function playerTeam(state) {
  const player = state && state.entities && state.entities.get && state.entities.get(state.playerId);
  return player && player.team != null ? player.team : 0;
}

function entityFor(state, entityId) {
  return state && state.entities && state.entities.get ? state.entities.get(entityId) : null;
}

function isShipLike(entity, payload = null) {
  const type = (entity && entity.type) || (payload && payload.type);
  return type === 'ship' || type === 'drone';
}

function isCandidate(entity, state, payload = null) {
  const id = entity && entity.id != null ? entity.id : payload && payload.id;
  if (id == null || id === state.playerId) return false;
  if (!isShipLike(entity, payload)) return false;
  if (!entity) return !!(payload && payload.killerId === state.playerId);
  const team = playerTeam(state);
  const data = entity.data || {};
  const ai = data.ai || {};
  if (isHostileToPlayer(entity, team, state)) return true;
  if (ai.forceFlee || ai.fsm === 'flee') return true;
  if (Array.isArray(ai.hostileTeams) && ai.hostileTeams.includes(team)) return true;
  if (data.encounter) return true;
  return false;
}

function outcomeText(record) {
  const label = record.label || record.victimClass || 'target';
  switch (record.outcome) {
    case 'fled': return `${label} fled the fight.`;
    case 'disabled': return `${label} disabled; capture window open.`;
    case 'surrendered': return `${label} surrendered.`;
    case 'killed': return `${label} destroyed.`;
    default: return `${label} resolved.`;
  }
}

function compactRecord(state, entity, payload, outcome, reason) {
  const data = entity && entity.data || {};
  const id = entity && entity.id != null ? entity.id : payload && (payload.entityId || payload.id);
  return {
    schemaVersion: STATE_VERSION,
    entityId: id,
    outcome,
    reason: reason || outcome,
    tick: state.tick || 0,
    t: Number(state.simTime || 0),
    sectorId: state.world && state.world.currentSectorId || null,
    killerId: payload && payload.killerId != null ? payload.killerId : null,
    factionId: (entity && entity.factionId) || (payload && payload.factionId) || data.factionId || null,
    victimClass: (payload && payload.victimClass) || data.shipClass || data.class || (entity && entity.type) || null,
    label: data.name || data.shipName || data.callsign || data.callSign || (payload && payload.label) || null,
    bountyCr: Math.max(0, Math.round(Number((payload && payload.bountyCr) || data.bountyCr || 0) || 0)),
    sourceEvent: payload && payload.sourceEvent || null,
  };
}

export const combatOutcome = {
  name: 'combatOutcome',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || {};
    ensureState(this.state);

    this._onKilled = (payload) => this._killed(payload || {});
    this._onFlee = (payload) => this._flee(payload || {});
    this._onDisabled = (payload) => this._disabled(payload || {});
    this._onSurrendered = (payload) => this._surrendered(payload || {});
    if (this.bus && typeof this.bus.on === 'function') {
      this.bus.on('entity:killed', this._onKilled);
      this.bus.on('ai:flee', this._onFlee);
      this.bus.on('combat:subsystemDisabled', this._onDisabled);
      this.bus.on('combat:surrendered', this._onSurrendered);
    }
  },

  update(_dt, state) {
    const own = ensureState(state);
    const list = Array.isArray(state.entityList) ? state.entityList : [];
    for (const entity of list) {
      if (!entity || !entity.alive || own.byEntity[entity.id]) continue;
      const ai = entity.data && entity.data.ai;
      if (ai && (ai.forceFlee || ai.fsm === 'flee') && isCandidate(entity, state)) {
        this._record(entity, { entityId: entity.id, sourceEvent: 'forceFlee' }, 'fled', ai.forceFlee ? 'forceFlee' : 'fsm:flee');
      }
    }
  },

  _killed(payload) {
    const entity = entityFor(this.state, payload.id);
    if (!isCandidate(entity, this.state, payload)) return;
    this._record(entity, { ...payload, sourceEvent: 'entity:killed' }, 'killed', 'entity:killed');
  },

  _flee(payload) {
    const entityId = payload.entityId != null ? payload.entityId : payload.id;
    const entity = entityFor(this.state, entityId);
    if (!entity || !isCandidate(entity, this.state, payload)) return;
    this._record(entity, { ...payload, entityId, sourceEvent: 'ai:flee' }, 'fled', 'ai:flee');
  },

  _disabled(payload) {
    const entityId = payload.entityId != null ? payload.entityId : payload.id;
    const subsystemId = String(payload.subsystemId || '');
    if (!DISABLE_OUTCOME_SUBSYSTEMS.has(subsystemId)) return;
    const entity = entityFor(this.state, entityId);
    if (!entity || !isCandidate(entity, this.state, payload)) return;
    this._record(entity, { ...payload, entityId, sourceEvent: 'combat:subsystemDisabled' }, 'disabled', subsystemId);
  },

  _surrendered(payload) {
    const entityId = payload.entityId != null ? payload.entityId : payload.id;
    const entity = entityFor(this.state, entityId);
    if (!entity || !isCandidate(entity, this.state, payload)) return;
    this._record(entity, { ...payload, entityId, sourceEvent: 'combat:surrendered' }, 'surrendered', 'combat:surrendered');
  },

  _record(entity, payload, outcome, reason) {
    const state = this.state;
    const own = ensureState(state);
    const id = entity && entity.id != null ? entity.id : payload && (payload.entityId || payload.id);
    if (id == null || own.byEntity[id]) return null;
    const record = compactRecord(state, entity, payload, outcome, reason);
    own.byEntity[id] = record;
    own.outcomes.push(record);
    if (own.outcomes.length > MAX_OUTCOMES) own.outcomes.splice(0, own.outcomes.length - MAX_OUTCOMES);
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('combat:outcome', record);
      this.bus.emit('combat:outcomeConsequence', {
        entityId: record.entityId,
        outcome: record.outcome,
        reason: record.reason,
        factionId: record.factionId,
        sectorId: record.sectorId,
        t: record.t,
      });
    }
    this._speak(record);
    return record;
  },

  _speak(record) {
    const voice = this.helpers && this.helpers.voice;
    if (!voice || typeof voice.say !== 'function') return false;
    return voice.say({
      channel: 'info',
      kind: 'combat',
      id: `combatOutcome:${record.entityId}`,
      text: outcomeText(record),
      ttl: 2,
    });
  },

  destroy() {
    if (this.bus && typeof this.bus.off === 'function') {
      if (this._onKilled) this.bus.off('entity:killed', this._onKilled);
      if (this._onFlee) this.bus.off('ai:flee', this._onFlee);
      if (this._onDisabled) this.bus.off('combat:subsystemDisabled', this._onDisabled);
      if (this._onSurrendered) this.bus.off('combat:surrendered', this._onSurrendered);
    }
    this._onKilled = this._onFlee = this._onDisabled = this._onSurrendered = null;
  },
};

export function combatOutcomeForEntity(state, entityId) {
  const own = ensureState(state);
  return own.byEntity[entityId] || null;
}

export default combatOutcome;
