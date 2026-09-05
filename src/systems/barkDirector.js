// BP-05.1/BARK-01 situational radio cadence.
//
// Observer-only voice surfacing for already-live ship state. It reads AI/contact transitions,
// routes faction-specific lines through voiceArbiter's bark channel, and writes only its own
// state.barkDirector receipt cache so combat/AI/economy behavior stays unchanged.
import { BARK_SITUATIONS, barkFor, hullRecognitionBarkFor } from '../data/barks.js';
import { contactGrammarFor } from '../data/factionContactGrammar.js';
import { hash32 } from '../core/rng.js';
import { isHostileToPlayer } from './scanner.js';
import { shouldOwnerThink } from '../core/activityScheduler.js';
import { tableSimAuthorityWuFromState } from '../render/tabletopPolicy.js';
import { ensureActivityClassified } from '../world/activityRuntime.js';
import { activeHullIdentity } from '../data/hullIdentity.js';
import { livingHullNotoriety } from '../core/livingHull.js';

const BARK_SET = new Set(BARK_SITUATIONS);
const VOICE_TTL_S = 1.2;
const PLAYER_TEAM = 0;
export const POST_COMBAT_SILENCE_S = 8.0;
export const AMBIENT_BASE_GAP_S = 12.0;
export const AMBIENT_GAP_STEP_S = 12.0;
export const AMBIENT_QUIET_STEP_S = 60.0;
export const AMBIENT_MAX_GAP_S = 60.0;

// PQ-142.01 hull recognition. `design/VISION.md` Part II: the ship earns "a reputation by hull —
// until it is my fucking ship." A witness who was in the room when the hull did something says the
// SHIP'S NAME, not "unidentified vessel".
//
// Deliberately exempt from the post-combat silence window: the silence exists so flavour chatter
// does not talk over a fight's tail, and this line IS the tail of the fight — the moment the act
// lands on the hull's name. It carries its own, much longer gap instead.
export const HULL_RECOGNITION_GAP_S = 24.0;
export const HULL_RECOGNITION_TTL_S = 3.0;
/** No witness, no recognition: a hull is only known by somebody who was close enough to see it. */
export const HULL_RECOGNITION_FALLBACK_RANGE_WU = 900;

const FLEE_FSMS = new Set(['flee', 'retreat', 'withdraw']);
const ATTACK_FSMS = new Set(['attack', 'strafe', 'engage', 'fight']);
const SCAN_FSMS = new Set(['scan', 'inspect', 'intercept', 'pursue', 'approach', 'patrol']);
const WARN_FSMS = new Set(['warn', 'challenge', 'blockade']);
const FLAVOR_SITUATIONS = new Set(['patrol-greeting', 'taunt']);

export const barkDirector = {
  name: 'barkDirector',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || {};
    this._onFlee = (payload) => this._speakFromEvent(payload, 'flee', 'ai:flee');
    this._onReinforcement = (payload) => this._speakFromEvent(payload, 'reinforce', 'ai:reinforcementScheduled');
    this._onCombatOutcome = () => this._enterPostCombatSilence();
    // The ship-history owner (systems/ships.js) is the single writer of the living-hull record and
    // republishes it whenever a witnessed act attaches to the hull. Listening to that receipt keeps
    // this observer independent of system init order.
    this._onHullHistory = (payload) => this._speakHullRecognition(payload || {});
    if (this.bus && typeof this.bus.on === 'function') {
      this.bus.on('ai:flee', this._onFlee);
      this.bus.on('ai:reinforcementScheduled', this._onReinforcement);
      this.bus.on('combat:outcome', this._onCombatOutcome);
      this.bus.on('ship:livingHullChanged', this._onHullHistory);
    }
  },

  newGame() {
    if (this.state) this.state.barkDirector = freshState();
  },

  update(_dt, state) {
    if (state.mode && state.mode !== 'flight') return;
    ensureActivityClassified(state);
    ensureState(state);
    const player = state.entities && state.entities.get && state.entities.get(state.playerId);
    const thinkOpts = {
      playerId: state.playerId,
      playerTeam: PLAYER_TEAM,
      origin: player && player.pos,
      authorityRadius: tableSimAuthorityWuFromState(state),
      sleepPeriodTicks: 8,
      activePeriodTicks: 1,
    };
    for (const entity of state.entityList || []) {
      if (!shouldOwnerThink(state.tick, entity, thinkOpts)) continue;
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
    if (this._isSuppressed(entity, situation, rec)) return false;

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

  /**
   * One NPC who was close enough to watch says the hull's name. Returns the receipt it published,
   * or null with a reason recorded on the director's own state slice.
   */
  _speakHullRecognition(payload) {
    const state = this.state;
    if (!state || payload.source !== 'witnessed_kill') return null;
    if (state.mode && state.mode !== 'flight') return null;
    const notoriety = livingHullNotoriety(payload.livingHull);
    if (notoriety < 1) return null;
    const identity = activeHullIdentity(state);
    if (!identity) return null;

    const own = ensureState(state);
    const now = Number(state.simTime) || 0;
    const record = hullRecognitionRecord(own);
    if (Number(record.nextAt) > now) return null;

    const witness = this._nearestWitness();
    if (!witness) return null;

    const voice = this.helpers && this.helpers.voice;
    if (!voice || typeof voice.say !== 'function') return null;
    const factionId = factionFor(witness);
    const seed = state.meta && state.meta.seed;
    const index = hash32(seed == null ? 0 : seed, 'hullRecognition', String(witness.id), notoriety);
    const text = hullRecognitionBarkFor(factionId, index, {
      ship: identity.name,
      class: identity.className,
    });
    const accepted = voice.say({
      channel: 'bark',
      text,
      kind: 'hullRecognition',
      ttl: HULL_RECOGNITION_TTL_S,
      id: `hullRecognition:${witness.id}:${notoriety}`,
      factionId,
    });
    if (!accepted) return null;

    record.lastAt = now;
    record.nextAt = now + HULL_RECOGNITION_GAP_S;
    record.lastEntityId = witness.id;
    record.count = Math.min(Number.MAX_SAFE_INTEGER, (Number(record.count) || 0) + 1);
    const receipt = {
      entityId: witness.id,
      factionId,
      shipName: identity.name,
      shipClass: identity.className,
      shipIndex: identity.index,
      notoriety,
      text,
      t: now,
    };
    this._emit('barkDirector:hullRecognition', receipt);
    return receipt;
  },

  /** Closest eligible NPC hull inside the live authority radius; ties break on the lower id. */
  _nearestWitness() {
    const state = this.state;
    const player = state.entities && state.entities.get && state.entities.get(state.playerId);
    if (!player || !player.pos) return null;
    let radius = Number(tableSimAuthorityWuFromState(state));
    if (!Number.isFinite(radius) || radius <= 0) radius = HULL_RECOGNITION_FALLBACK_RANGE_WU;
    const limit = radius * radius;
    let best = null;
    let bestDistance = Infinity;
    for (const entity of state.entityList || []) {
      if (!eligibleShip(entity, state) || !entity.pos) continue;
      const dx = Number(entity.pos.x) - Number(player.pos.x);
      const dz = Number(entity.pos.z) - Number(player.pos.z);
      const distance = dx * dx + dz * dz;
      if (!Number.isFinite(distance) || distance > limit) continue;
      if (distance < bestDistance || (distance === bestDistance && best && entity.id < best.id)) {
        best = entity;
        bestDistance = distance;
      }
    }
    return best;
  },

  _enterPostCombatSilence() {
    if (!this.state) return false;
    const own = ensureState(this.state);
    const now = this.state.simTime || 0;
    const until = now + POST_COMBAT_SILENCE_S;
    own.postCombatSilenceUntil = Math.max(Number(own.postCombatSilenceUntil) || 0, until);
    const sectorId = currentSectorId(this.state);
    const ambient = ambientRecord(own, sectorId);
    ambient.quietSince = now;
    ambient.nextAt = Math.max(Number(ambient.nextAt) || -Infinity, until);
    this._emit('barkDirector:silence', { sectorId, until, t: now, reason: 'combat:outcome' });
    return true;
  },

  _isSuppressed(entity, situation, rec) {
    const state = this.state;
    const own = ensureState(state);
    const now = state.simTime || 0;
    let until = 0;
    if (FLAVOR_SITUATIONS.has(situation)) until = Number(own.postCombatSilenceUntil) || 0;
    if (until > now) {
      rememberSuppressed(own, entity, situation, now, until, 'post-combat-silence');
      return true;
    }
    if (situation !== 'patrol-greeting') return false;

    const sectorId = currentSectorId(state);
    const ambient = ambientRecord(own, sectorId);
    if (Number(ambient.nextAt) > now) {
      rememberSuppressed(own, entity, situation, now, ambient.nextAt, 'ambient-decay');
      return true;
    }
    const gap = ambientGap(ambient, now);
    ambient.lastAt = now;
    ambient.lastEntityId = entity && entity.id;
    ambient.lastGap = gap;
    ambient.nextAt = now + gap;
    rec.ambientGap = gap;
    return false;
  },

  _emit(event, payload) {
    if (this.bus && typeof this.bus.emit === 'function') this.bus.emit(event, payload);
  },

  destroy() {
    if (this.bus && typeof this.bus.off === 'function') {
      if (this._onFlee) this.bus.off('ai:flee', this._onFlee);
      if (this._onReinforcement) this.bus.off('ai:reinforcementScheduled', this._onReinforcement);
      if (this._onCombatOutcome) this.bus.off('combat:outcome', this._onCombatOutcome);
      if (this._onHullHistory) this.bus.off('ship:livingHullChanged', this._onHullHistory);
    }
    this._onFlee = null;
    this._onReinforcement = null;
    this._onCombatOutcome = null;
    this._onHullHistory = null;
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
  // Demand: explicit AI flags OR faction contact grammar demand types that open with a tithe/cargo ask.
  if (ai.demandCargo || data.demandCargo || data.pirateDemand) return 'demand-cargo';
  const grammar = contactGrammarFor(factionFor(entity));
  if (grammar && grammar.demandType === 'tithe'
    && (WARN_FSMS.has(fsm) || SCAN_FSMS.has(fsm) || ai.openingContact || data.openingContact)) {
    return 'demand-cargo';
  }
  if (WARN_FSMS.has(fsm) || ai.warning || data.zoneWarning || data.customsWarning) return 'warn';
  if (isAttackingPlayer(entity, state, fsm)) return 'attack';
  if (isScanningPlayer(entity, state, fsm)) {
    // Concord grammar: first contact is paperwork (scan), not a taunt.
    if (grammar && grammar.primaryBark === 'scan') return 'scan';
    return 'scan';
  }
  if (ai.taunting || data.taunt) return 'taunt';
  // First passive contact: faction primary bark situation (Quiet terse scan, Reach demand, etc.).
  if (grammar && (ai.openingContact || data.openingContact || ai.firstContact)) {
    return normalizeSituation(grammar.primaryBark) || grammar.primaryBark;
  }
  return null;
}

function freshState() {
  return {
    entities: {},
    postCombatSilenceUntil: 0,
    ambientBySector: {},
    suppressed: [],
    hullRecognition: freshHullRecognition(),
  };
}

// Finite by construction. `postCombatSilenceUntil: 0` is the sibling convention in this same
// slice, and -Infinity does not survive JSON (it reads back as null), so the gate would silently
// change meaning the moment anything serialized this record. `nextAt: 0` reads as "never spoken":
// the gate is `nextAt > now` and sim time is never negative.
function freshHullRecognition() {
  return { lastAt: 0, nextAt: 0, lastEntityId: null, count: 0 };
}

function hullRecognitionRecord(own) {
  if (!own.hullRecognition || typeof own.hullRecognition !== 'object') {
    own.hullRecognition = freshHullRecognition();
  }
  return own.hullRecognition;
}

function ensureState(state) {
  if (!state.barkDirector || typeof state.barkDirector !== 'object') state.barkDirector = freshState();
  if (!state.barkDirector.entities || typeof state.barkDirector.entities !== 'object') state.barkDirector.entities = {};
  if (!state.barkDirector.ambientBySector || typeof state.barkDirector.ambientBySector !== 'object') state.barkDirector.ambientBySector = {};
  if (!Array.isArray(state.barkDirector.suppressed)) state.barkDirector.suppressed = [];
  hullRecognitionRecord(state.barkDirector);
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

function currentSectorId(state) {
  return state && state.world && state.world.currentSectorId || 'unknown';
}

function ambientRecord(own, sectorId) {
  const key = sectorId || 'unknown';
  let rec = own.ambientBySector[key];
  if (!rec || typeof rec !== 'object') {
    rec = {
      quietSince: 0,
      lastAt: -Infinity,
      nextAt: -Infinity,
      lastGap: AMBIENT_BASE_GAP_S,
    };
    own.ambientBySector[key] = rec;
  }
  return rec;
}

function ambientGap(rec, now) {
  const quietAge = Math.max(0, now - (Number(rec.quietSince) || 0));
  const steps = Math.floor(quietAge / AMBIENT_QUIET_STEP_S);
  return Math.min(AMBIENT_MAX_GAP_S, AMBIENT_BASE_GAP_S + steps * AMBIENT_GAP_STEP_S);
}

function rememberSuppressed(own, entity, situation, now, until, reason) {
  own.suppressed.push({
    entityId: entity && entity.id,
    situation,
    reason,
    t: now,
    until,
  });
  if (own.suppressed.length > 16) own.suppressed.shift();
}

export default barkDirector;
