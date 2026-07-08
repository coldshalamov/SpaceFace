// BP-05.1/BARK-01 situational radio cadence.
//
// Observer-only voice surfacing for already-live ship state. It reads AI/contact transitions,
// routes faction-specific lines through voiceArbiter's bark channel, and writes only its own
// state.barkDirector receipt cache so combat/AI/economy behavior stays unchanged.
import { BARK_SITUATIONS, barkFor } from '../data/barks.js';
import { hash32 } from '../core/rng.js';
import { isHostileToPlayer } from './scanner.js';

const BARK_SET = new Set(BARK_SITUATIONS);
const VOICE_TTL_S = 1.2;
const PLAYER_TEAM = 0;

const FLEE_FSMS = new Set(['flee', 'retreat', 'withdraw']);
const ATTACK_FSMS = new Set(['attack', 'strafe', 'engage', 'fight']);
const SCAN_FSMS = new Set(['scan', 'inspect', 'intercept', 'pursue', 'approach', 'patrol']);
const WARN_FSMS = new Set(['warn', 'challenge', 'blockade']);

export const barkDirector = {
  name: 'barkDirector',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || {};
    this._onFlee = (payload) => this._speakFromEvent(payload, 'flee', 'ai:flee');
    this._onReinforcement = (payload) => this._speakFromEvent(payload, 'reinforce', 'ai:reinforcementScheduled');
    if (this.bus && typeof this.bus.on === 'function') {
      this.bus.on('ai:flee', this._onFlee);
      this.bus.on('ai:reinforcementScheduled', this._onReinforcement);
    }
  },

  newGame() {
    if (this.state) this.state.barkDirector = freshState();
  },

  update(_dt, state) {
    if (state.mode && state.mode !== 'flight') return;
    ensureState(state);
    for (const entity of state.entityList || []) {
      const situation = classifyBarkSituation(entity, state);
      if (!situation) continue;
      this._speak(entity, situation, 'state');
    }
  },

  _speakFromEvent(payload, situation, reason) {
    if (!payload || !this.state) return false;
    const entityId = payload.entityId ?? payload.ownerId ?? payload.shipId ?? payload.id;
    if (entityId == null) return false;
    const entity = this.state.entities && this.state.entities.get && this.state.entities.get(entityId);
    if (!entity) return false;
    return this._speak(entity, situation, reason, payload);
  },

  _speak(entity, situation, reason, extra = null) {
    if (!BARK_SET.has(situation) || !entity || !this.state) return false;
    const state = this.state;
    const own = ensureState(state);
    const entityId = String(entity.id);
    const rec = own.entities[entityId] || (own.entities[entityId] = freshEntityRecord(entity));
    if (rec.lastSituation === situation || rec.said[situation]) return false;

    const factionId = factionFor(entity);
    const seed = state.meta && state.meta.seed;
    const index = hash32(seed == null ? 0 : seed, 'barkDirector', entityId, situation);
    const text = barkFor(factionId, situation, index);
    const voice = this.helpers && this.helpers.voice;
    if (!voice || typeof voice.say !== 'function') return false;

    rec.lastSituation = situation;
    rec.said[situation] = true;
    rec.lastSpokenAt = state.simTime || 0;
    rec.history.push({ situation, reason, t: rec.lastSpokenAt, text });
    if (rec.history.length > 8) rec.history.shift();

    const accepted = voice.say({
      channel: 'bark',
      text,
      kind: 'barkDirector',
      ttl: VOICE_TTL_S,
      id: `barkDirector:${entityId}:${situation}`,
      factionId,
    });
    if (accepted) {
      this._emit('barkDirector:voice', {
        entityId: entity.id,
        situation,
        reason,
        text,
        factionId,
        t: rec.lastSpokenAt,
        ...(extra ? { source: extra.sourceEvent || null } : {}),
      });
    }
    return !!accepted;
  },

  _emit(event, payload) {
    if (this.bus && typeof this.bus.emit === 'function') this.bus.emit(event, payload);
  },

  destroy() {
    if (this.bus && typeof this.bus.off === 'function') {
      if (this._onFlee) this.bus.off('ai:flee', this._onFlee);
      if (this._onReinforcement) this.bus.off('ai:reinforcementScheduled', this._onReinforcement);
    }
    this._onFlee = null;
    this._onReinforcement = null;
  },
};

export function classifyBarkSituation(entity, state) {
  if (!eligibleShip(entity, state)) return null;
  const data = entity.data || {};
  const ai = data.ai || {};
  const explicit = normalizeSituation(ai.barkSituation || data.barkSituation || data.radioSituation);
  if (explicit) return explicit;

  const fsm = String(ai.fsm || ai.state || ai.mode || '').toLowerCase();
  if (FLEE_FSMS.has(fsm) || ai.forceFlee === true) return 'flee';
  if (ai.requestingReinforcement || ai.reinforcing || data.reinforcements) return 'reinforce';
  if (ai.demandCargo || data.demandCargo || data.pirateDemand) return 'demand-cargo';
  if (WARN_FSMS.has(fsm) || ai.warning || data.zoneWarning || data.customsWarning) return 'warn';
  if (isAttackingPlayer(entity, state, fsm)) return 'attack';
  if (isScanningPlayer(entity, state, fsm)) return 'scan';
  if (ai.taunting || data.taunt) return 'taunt';
  return null;
}

function freshState() {
  return { entities: {} };
}

function ensureState(state) {
  if (!state.barkDirector || typeof state.barkDirector !== 'object') state.barkDirector = freshState();
  if (!state.barkDirector.entities || typeof state.barkDirector.entities !== 'object') state.barkDirector.entities = {};
  return state.barkDirector;
}

function freshEntityRecord(entity) {
  return {
    entityId: entity && entity.id,
    factionId: factionFor(entity),
    lastSituation: null,
    lastSpokenAt: -Infinity,
    said: {},
    history: [],
  };
}

function eligibleShip(entity, state) {
  if (!entity || entity.alive === false) return false;
  if (entity.type !== 'ship' && entity.type !== 'drone') return false;
  if (state && entity.id === state.playerId) return false;
  if (entity.team === PLAYER_TEAM) return false;
  const data = entity.data || {};
  const ai = data.ai || {};
  if (data.barkDirectorSuppressed || ai.barkDirectorSuppressed) return false;
  return !!(data.ai || data.combat || data.intent || data.barkSituation || data.radioSituation);
}

function normalizeSituation(value) {
  const situation = String(value || '').trim();
  return BARK_SET.has(situation) ? situation : null;
}

function factionFor(entity) {
  return entity && (entity.factionId || entity.data && entity.data.factionId) || 'faction_free';
}

function playerTeam(state) {
  const player = state && state.entities && state.entities.get && state.entities.get(state.playerId);
  return player && Number.isFinite(player.team) ? player.team : PLAYER_TEAM;
}

function targetsPlayer(entity, state) {
  const data = entity.data || {};
  const ai = data.ai || {};
  const combat = data.combat || {};
  const playerId = state && state.playerId;
  return playerId != null && (
    combat.targetId === playerId ||
    combat.lockTarget === playerId ||
    ai.forcePlayerTarget === true ||
    ai.huntPlayer === true
  );
}

function isAttackingPlayer(entity, state, fsm) {
  const data = entity.data || {};
  const intent = data.intent || {};
  const targeting = targetsPlayer(entity, state);
  if (targeting && ATTACK_FSMS.has(fsm)) return true;
  if (intent.fire === true && (targeting || isHostileToPlayer(entity, playerTeam(state), state))) return true;
  return false;
}

function isScanningPlayer(entity, state, fsm) {
  const data = entity.data || {};
  const ai = data.ai || {};
  const targeting = targetsPlayer(entity, state);
  if (SCAN_FSMS.has(fsm) && (targeting || ai.lawful || isHostileToPlayer(entity, playerTeam(state), state))) return true;
  if (targeting && !isAttackingPlayer(entity, state, fsm)) return true;
  if (isHostileToPlayer(entity, playerTeam(state), state) && !isAttackingPlayer(entity, state, fsm)) return true;
  return false;
}

export default barkDirector;
