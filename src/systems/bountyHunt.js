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
import {
  hunterTrickById,
  hunterTrickForContract,
} from '../data/hunterTricks.js';

export {
  BOUNTY_HUNTER_NEUTRAL_CONTEXT,
  makeBountyHunterSpec,
  makeBountyQuarrySpec,
} from '../data/bountyHunters.js';
export {
  HUNTER_TRICKS,
  HUNTER_TRICK_IDS,
  hunterTrickById,
  hunterTrickForContract,
} from '../data/hunterTricks.js';

const STATE_VERSION = 1;

export const bountyHunt = {
  name: 'bountyHunt',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || {};
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
      if (isBountyHunter(entity)) {
        normalizeHunter(entity, state);
        tickHunterTrick(entity, state, this.bus, this.helpers);
      }
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

export function bountyHunterTrickStateFor(state, hunterId) {
  const entity = state && state.entities && state.entities.get && state.entities.get(hunterId);
  const rt = entity && entity.data && entity.data.bountyHunt && entity.data.bountyHunt.trickState;
  return rt ? clonePlain(rt) : null;
}

function normalizeHunter(entity, state) {
  const data = entity.data || (entity.data = {});
  const ai = data.ai || (data.ai = {});
  const hunt = data.bountyHunt || (data.bountyHunt = { role: 'hunter' });
  const playerId = state.playerId;
  const targetId = data.contractTargetId;
  const targetsPlayer = targetId != null && targetId === playerId;
  ensureHunterTrick(entity, state);

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

function ensureHunterTrick(entity, state) {
  const data = entity.data || (entity.data = {});
  const hunt = data.bountyHunt || (data.bountyHunt = { role: 'hunter' });
  const contractId = hunt.contractId || data.contractId || `bounty:${entity.id}`;
  const explicit = hunt.trickId || data.hunterTrick || data.trick || null;
  const seed = state && state.meta && state.meta.seed || 1;
  const trick = hunterTrickById(explicit) || hunterTrickForContract(contractId, seed);
  hunt.trickId = trick.id;
  if (!hunt.trickState || hunt.trickState.trickId !== trick.id) {
    hunt.trickState = {
      trickId: trick.id,
      phase: 'idle',
      counterWindowS: trick.counterWindowS,
      telegraphedAt: null,
      activatesAt: null,
      activatedAt: null,
      readyAt: 0,
      activationCount: 0,
      lastVerb: null,
    };
  }
  return { trick, rt: hunt.trickState };
}

function tickHunterTrick(entity, state, bus, helpers) {
  const data = entity.data || {};
  const hunt = data.bountyHunt;
  if (!hunt || hunt.role !== 'hunter' || !hunt.pursuing) return;
  const { trick, rt } = ensureHunterTrick(entity, state);
  const now = finite(state && state.simTime, 0);

  if (rt.phase === 'cooldown' && now >= finite(rt.readyAt, 0)) {
    rt.phase = 'idle';
  }

  if (rt.phase === 'telegraphing') {
    if (now + 1e-6 >= finite(rt.activatesAt, now)) activateHunterTrick(entity, state, trick, rt, bus);
    return;
  }

  if (rt.phase !== 'idle') return;
  if (now < finite(rt.readyAt, 0)) return;
  startHunterTrickTelegraph(entity, state, trick, rt, bus, helpers);
}

function startHunterTrickTelegraph(entity, state, trick, rt, bus, helpers) {
  const now = finite(state && state.simTime, 0);
  rt.phase = 'telegraphing';
  rt.counterWindowS = trick.counterWindowS;
  rt.telegraphedAt = now;
  rt.activatesAt = now + trick.counterWindowS;
  rt.activatedAt = null;
  rt.lastVerb = clonePlain(trick.verb);
  const payload = {
    entityId: entity.id,
    contractId: contractIdForHunter(entity),
    trickId: trick.id,
    telegraph: trick.telegraph,
    at: now,
    activatesAt: rt.activatesAt,
    counterWindowS: trick.counterWindowS,
    verb: clonePlain(trick.verb),
  };
  emit(bus, 'bountyHunt:trickTelegraph', payload);
  const voice = helpers && helpers.voice;
  if (voice && typeof voice.say === 'function') {
    voice.say({
      channel: 'bark',
      kind: 'bounty_hunter_trick',
      factionId: entity.factionId || null,
      text: trick.telegraph,
    });
  }
}

function activateHunterTrick(entity, state, trick, rt, bus) {
  const now = finite(state && state.simTime, 0);
  const payload = {
    entityId: entity.id,
    contractId: contractIdForHunter(entity),
    trickId: trick.id,
    at: now,
    verb: clonePlain(trick.verb),
  };
  applyHunterTrick(entity, state, trick, payload);
  rt.phase = 'cooldown';
  rt.activatedAt = now;
  rt.readyAt = now + trick.cooldownS;
  rt.activationCount = (rt.activationCount || 0) + 1;
  rt.lastVerb = clonePlain(trick.verb);
  emit(bus, 'bountyHunt:trickActivated', payload);
}

function applyHunterTrick(entity, state, trick, payload) {
  const data = entity.data || (entity.data = {});
  const intent = data.intent || (data.intent = {});
  intent.trickVerb = trick.verb.kind;
  intent.trickId = trick.id;
  intent.trickActivatedAt = payload.at;

  switch (trick.id) {
    case 'emergency-jump-spool':
      applyEmergencyJump(entity, state, payload);
      break;
    case 'tether-cutter':
      intent.tetherCut = true;
      break;
    case 'mine-dropper':
      intent.fire = true;
      intent.weaponId = 'mine_dropper';
      break;
    case 'phase-jammer':
      data.cm = { ...(data.cm || {}), effectT: 1.4, effect: { cfg: { kind: 'ecm' } } };
      break;
    case 'shield-turtle':
      entity.shield = Math.min(finite(entity.shieldMax, 0), finite(entity.shield, 0) + Math.max(10, finite(entity.shieldMax, 0) * 0.35));
      break;
    case 'ram-plate':
      intent.ramPlate = true;
      break;
    case 'decoy-clone':
      intent.decoyClone = true;
      break;
    default:
      break;
  }
}

function applyEmergencyJump(entity, state, payload) {
  const target = targetForHunter(entity, state);
  let dx = Math.cos(entity.rot || 0);
  let dz = Math.sin(entity.rot || 0);
  if (target && target.pos) {
    dx = entity.pos.x - target.pos.x;
    dz = entity.pos.z - target.pos.z;
  }
  const len = Math.hypot(dx, dz) || 1;
  const dist = 420;
  const before = { x: entity.pos.x, z: entity.pos.z };
  entity.pos.x += (dx / len) * dist;
  entity.pos.z += (dz / len) * dist;
  entity.vel.x = 0;
  entity.vel.z = 0;
  payload.from = roundPos(before);
  payload.to = roundPos(entity.pos);
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

function targetForHunter(entity, state) {
  const targetId = entity && entity.data && entity.data.contractTargetId;
  return targetId != null && state && state.entities && state.entities.get && state.entities.get(targetId);
}

function contractIdForHunter(entity) {
  const data = entity && entity.data || {};
  const hunt = data.bountyHunt || {};
  return hunt.contractId || data.contractId || `bounty:${entity && entity.id}`;
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

function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function roundPos(pos) {
  return {
    x: Math.round(finite(pos && pos.x, 0) * 1000) / 1000,
    z: Math.round(finite(pos && pos.z, 0) * 1000) / 1000,
  };
}

export default bountyHunt;
