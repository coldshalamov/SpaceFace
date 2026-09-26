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
import { mineLayerWakePoint } from '../ai/mineLayerVerb.js';
import { chaffDecoyPoint } from './countermeasures.js';
import { entityIndexVersion, indexedShipLikeScan } from '../world/livingWorldViews.js';

/** Bench A/B: production default ON. Quiet latch skips bountyHunt shipLike census
 * when no live bounty hunters remain. Soft-GPU fps not claimed. Fresh law/wanted-
 * adjacent residual after #148 salvage (not salvage/sanctuary/cones/catch-nets). */
let BOUNTY_HUNT_EMPTY_QUIET_LATCH = true;
export function setBountyHuntEmptyQuietLatchForBench(enabled) {
  BOUNTY_HUNT_EMPTY_QUIET_LATCH = enabled !== false;
}
export function getBountyHuntEmptyQuietLatchForBench() {
  return BOUNTY_HUNT_EMPTY_QUIET_LATCH !== false;
}

/** Membership rescan while latched (0.5 s @ 60 Hz). */
const BOUNTY_HUNT_EMPTY_QUIET_RESCAN_TICKS = 30;

function publishBountyHuntQuiet(state, latched) {
  if (!state) return;
  const rt = state.bountyHuntRuntime || (state.bountyHuntRuntime = {});
  rt.emptyQuietLatched = !!latched;
}


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
    this.registry = ctx.registry || null;
    this._subs = [];
    this._huntersQuiet = null;
    this._hunterWakeSeq = 0;
    ensureState(this.state);
    this._listen('entity:killed', (p) => this._onEntityKilled(p));
    this._listen('entity:spawned', (p) => this._onEntitySpawned(p));
  },

  /** External wake when a hunter role is stamped without a fresh spawn index bump. */
  noteHunterWake() {
    this._hunterWakeSeq = (this._hunterWakeSeq | 0) + 1;
    this._huntersQuiet = null;
  },

  _onEntitySpawned(payload) {
    const entity = payload && payload.entity;
    if (!isBountyHunter(entity)) return;
    this.noteHunterWake();
  },

  newGame() {
    if (this.state) this.state.bountyHunt = freshState();
  },

  update(_dt, state) {
    if (!state || (state.mode && state.mode !== 'flight')) return;
    this.state = state;
    ensureState(state);
    // Quiet open flight: no live bounty hunters still paid a full shipLike
    // census (isBountyHunter / normalize / trick) every tick. Latch when the
    // census stays empty; wake on membership, hunter spawn/tag, or 0.5 s rescan.
    // Soft-GPU fps not claimed. Fresh bounty residual after #148 salvage.
    if (BOUNTY_HUNT_EMPTY_QUIET_LATCH !== false) {
      const membership = entityIndexVersion(state);
      const tick = state.tick | 0;
      const wakeSeq = this._hunterWakeSeq | 0;
      const quiet = this._huntersQuiet;
      if (quiet
        && membership != null
        && quiet.membership === membership
        && quiet.wakeSeq === wakeSeq
        && ((tick - (quiet.armedTick | 0)) < BOUNTY_HUNT_EMPTY_QUIET_RESCAN_TICKS)) {
        publishBountyHuntQuiet(state, true);
        return;
      }
    } else if (this._huntersQuiet) {
      this._huntersQuiet = null;
    }

    let anyHunter = false;
    for (const entity of indexedShipLikeScan(state)) {
      if (isBountyHunter(entity)) {
        anyHunter = true;
        normalizeHunter(entity, state);
        tickHunterTrick(entity, state, this);
      }
    }
    if (BOUNTY_HUNT_EMPTY_QUIET_LATCH !== false) {
      if (!anyHunter) {
        const membership = entityIndexVersion(state);
        if (membership != null) {
          this._huntersQuiet = {
            membership,
            wakeSeq: this._hunterWakeSeq | 0,
            armedTick: state.tick | 0,
          };
          publishBountyHuntQuiet(state, true);
        }
      } else {
        this._huntersQuiet = null;
        publishBountyHuntQuiet(state, false);
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

function tickHunterTrick(entity, state, host) {
  const data = entity.data || {};
  const hunt = data.bountyHunt;
  if (!hunt || hunt.role !== 'hunter' || !hunt.pursuing) return;
  const { trick, rt } = ensureHunterTrick(entity, state);
  const now = finite(state && state.simTime, 0);

  // A wake-mine trail keeps seeding after activation, on the mine-layer cadence.
  if ((rt.mineDropsLeft || 0) > 0 && now + 1e-6 >= finite(rt.nextMineAt, now)) {
    if (dropTrickMine(entity, host)) rt.mineDropsLeft -= 1;
    rt.nextMineAt = now + finite(rt.mineCadenceS, 0.7);
  }

  if (rt.phase === 'cooldown' && now >= finite(rt.readyAt, 0)) {
    rt.phase = 'idle';
  }

  if (rt.phase === 'telegraphing') {
    if (now + 1e-6 < finite(rt.activatesAt, now)) return;
    if (trick.interruptsOnDamage && telegraphInterrupted(entity, rt)) {
      fizzleHunterTrick(entity, state, trick, rt, host.bus);
      return;
    }
    activateHunterTrick(entity, state, trick, rt, host);
    return;
  }

  if (rt.phase !== 'idle') return;
  if (now < finite(rt.readyAt, 0)) return;
  startHunterTrickTelegraph(entity, state, trick, rt, host.bus, host.helpers);
}

// Damage during the telegraph fizzles tricks whose telegraph says so (the jump spool's
// "interrupt before the flash" is a real counter, not flavor text).
function telegraphInterrupted(entity, rt) {
  return finite(entity.hull, 0) < finite(rt.telegraphHull, 0)
    || finite(entity.shield, 0) < finite(rt.telegraphShield, 0);
}

function fizzleHunterTrick(entity, state, trick, rt, bus) {
  const now = finite(state && state.simTime, 0);
  rt.phase = 'cooldown';
  rt.activatedAt = null;
  rt.readyAt = now + trick.cooldownS * 0.5;
  emit(bus, 'bountyHunt:trickFizzled', {
    entityId: entity.id,
    contractId: contractIdForHunter(entity),
    trickId: trick.id,
    reason: 'damage_interrupt',
    at: now,
  });
}

function startHunterTrickTelegraph(entity, state, trick, rt, bus, helpers) {
  const now = finite(state && state.simTime, 0);
  rt.phase = 'telegraphing';
  rt.counterWindowS = trick.counterWindowS;
  rt.telegraphedAt = now;
  rt.activatesAt = now + trick.counterWindowS;
  rt.activatedAt = null;
  rt.telegraphHull = finite(entity.hull, 0);
  rt.telegraphShield = finite(entity.shield, 0);
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

function activateHunterTrick(entity, state, trick, rt, host) {
  const now = finite(state && state.simTime, 0);
  const payload = {
    entityId: entity.id,
    contractId: contractIdForHunter(entity),
    trickId: trick.id,
    at: now,
    verb: clonePlain(trick.verb),
  };
  applyHunterTrick(entity, state, trick, payload, rt, host);
  rt.phase = 'cooldown';
  rt.activatedAt = now;
  rt.readyAt = now + trick.cooldownS;
  rt.activationCount = (rt.activationCount || 0) + 1;
  rt.lastVerb = clonePlain(trick.verb);
  emit(host.bus, 'bountyHunt:trickActivated', payload);
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
  for (const entity of indexedShipLikeScan(state)) {
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
