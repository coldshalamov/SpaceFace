// BP-13/B16 Bounty Hunter Neutrality.
//
// Keeps contract hunters scanner-neutral while they chase an NPC quarry, then flips the same hunter
// hostile only when contractTargetId is the player. No scanner/combat/director edits.
import {
  BOUNTY_HUNTER_NEUTRAL_CONTEXT,
  BOUNTY_HUNTER_PLAYER_CONTEXT,
  makeBountyHunterSpec,
  makeBountyQuarrySpec,
} from '../data/bountyHunters.js';

export {
  BOUNTY_HUNTER_NEUTRAL_CONTEXT,
  makeBountyHunterSpec,
  makeBountyQuarrySpec,
} from '../data/bountyHunters.js';

const STATE_VERSION = 1;

export const bountyHunt = {
  name: 'bountyHunt',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this._subs = [];
    ensureState(this.state);
    this._listen('entity:killed', (p) => this._onEntityKilled(p));
  },

  newGame() {
    if (this.state) this.state.bountyHunt = freshState();
  },

  update(_dt, state) {
    if (!state || (state.mode && state.mode !== 'flight')) return;
    this.state = state;
    ensureState(state);
    for (const entity of state.entityList || []) {
      if (isBountyHunter(entity)) normalizeHunter(entity, state);
    }
  },

  destroy() {
    for (const off of this._subs || []) {
      try { off(); } catch (err) { /* cleanup must not throw */ }
    }
    this._subs = [];
  },

  _listen(evt, fn) {
    if (!this.bus || typeof this.bus.on !== 'function') return;
    const off = this.bus.on(evt, fn);
    if (typeof off === 'function') this._subs.push(off);
  },

  _onEntityKilled(payload) {
    if (!payload || payload.id == null || !this.state) return;
    const state = this.state;
    const killed = state.entities && state.entities.get && state.entities.get(payload.id);
    const killedRole = killed && killed.data && killed.data.bountyHunt && killed.data.bountyHunt.role;
    const byPlayer = payload.killerId === state.playerId;

    if (killedRole === 'hunter') {
      recordOutcome(state, this.bus, killed.data.bountyHunt.contractId, byPlayer ? 'player_defended_quarry' : 'hunter_killed', payload);
      return;
    }

    const contractId = contractIdForQuarryKill(state, payload.id);
    if (contractId) {
      recordOutcome(state, this.bus, contractId, byPlayer ? 'player_helped_hunter' : 'quarry_killed', payload);
    }
  },
};

export function bountyHunterOutcomeForContract(state, contractId) {
  const own = state && state.bountyHunt;
  const rec = own && own.outcomes && own.outcomes[contractId];
  return rec ? clonePlain(rec) : null;
}

function normalizeHunter(entity, state) {
  const data = entity.data || (entity.data = {});
  const ai = data.ai || (data.ai = {});
  const hunt = data.bountyHunt || (data.bountyHunt = { role: 'hunter' });
  const playerId = state.playerId;
  const targetId = data.contractTargetId;
  const targetsPlayer = targetId != null && targetId === playerId;

  hunt.role = 'hunter';
  hunt.contractId = hunt.contractId || data.contractId || `bounty:${entity.id}`;
  hunt.targetId = targetId;
  hunt.pursuing = false;

  ai.passive = false;
  ai.archetype = ai.archetype || 'hunter';
  if (targetsPlayer) {
    ai.spawnContext = BOUNTY_HUNTER_PLAYER_CONTEXT;
    ai.forcePlayerTarget = true;
    ai.hostileTeams = [0];
    hunt.pursuing = true;
    data.intent = { ...(data.intent || {}), targetId: playerId, mode: 'bounty_player' };
    return;
  }

  ai.spawnContext = BOUNTY_HUNTER_NEUTRAL_CONTEXT;
  ai.forcePlayerTarget = false;
  ai.huntPlayer = false;
  ai.hostileTeams = [];
  const quarry = targetId != null && state.entities && state.entities.get && state.entities.get(targetId);
  if (quarry && quarry.alive !== false) {
    hunt.pursuing = true;
    data.intent = { ...(data.intent || {}), targetId: quarry.id, mode: 'bounty_quarry' };
  }
}

function isBountyHunter(entity) {
  const data = entity && entity.data;
  return !!(data && data.bountyHunt && data.bountyHunt.role === 'hunter');
}

function contractIdForQuarryKill(state, quarryId) {
  for (const entity of state.entityList || []) {
    const data = entity && entity.data;
    if (!data || !data.bountyHunt || data.bountyHunt.role !== 'hunter') continue;
    if (data.contractTargetId === quarryId) return data.bountyHunt.contractId || data.contractId;
  }
  return null;
}

function recordOutcome(state, bus, contractId, outcome, payload) {
  if (!contractId) return;
  const own = ensureState(state);
  if (own.outcomes[contractId]) return;
  const rec = {
    contractId,
    outcome,
    at: state.simTime || 0,
    entityId: payload.id,
    killerId: payload.killerId == null ? null : payload.killerId,
  };
  own.outcomes[contractId] = rec;
  emit(bus, 'bountyHunt:outcome', clonePlain(rec));
}

function freshState() {
  return { schemaVersion: STATE_VERSION, outcomes: {} };
}

function ensureState(state) {
  if (!state.bountyHunt || typeof state.bountyHunt !== 'object') state.bountyHunt = freshState();
  if (!state.bountyHunt.outcomes || typeof state.bountyHunt.outcomes !== 'object') state.bountyHunt.outcomes = {};
  state.bountyHunt.schemaVersion = STATE_VERSION;
  return state.bountyHunt;
}

function emit(bus, evt, payload) {
  if (bus && typeof bus.emit === 'function') bus.emit(evt, payload);
}

function clonePlain(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

export default bountyHunt;
