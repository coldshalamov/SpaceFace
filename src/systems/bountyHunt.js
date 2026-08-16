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
import { hash32 } from '../core/rng.js';
import { makeEnemySpawnSpec } from './combat.js';

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
    this._listen('surrender:secured', (p) => this._onBountySecured(p));
    this._listen('mission:completed', (p) => this._releaseTowPersistence(p));
    this._listen('mission:failed', (p) => this._releaseTowPersistence(p));
    this._listen('mission:expired', (p) => this._releaseTowPersistence(p));
  },

  newGame() {
    if (this.state) this.state.bountyHunt = freshState();
  },

  update(_dt, state) {
    if (!state || (state.mode && state.mode !== 'flight')) return;
    this.state = state;
    ensureState(state);
    this._retryTowInterceptions();
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
      if (byPlayer && String(killed.data.contractTargetId) === String(state.playerId)) {
        emit(this.bus, 'law:activeHunterKilled', {
          hunterEntityId: killed.id,
          contractId: contractIdForHunter(killed),
          factionId: killed.factionId || null,
          sectorId: state.world && state.world.currentSectorId || null,
          t: finite(state.simTime, 0),
        });
      }
      return;
    }

    const contractId = contractIdForQuarryKill(state, payload.id);
    if (contractId) {
      recordOutcome(state, this.bus, contractId, byPlayer ? 'player_helped_hunter' : 'quarry_killed', payload);
    }
  },

  _onBountySecured(payload) {
    if (!payload || payload.entityId == null || !this.state) return null;
    const target = entityFor(this.state, payload.entityId);
    const mission = activeBountyMissionFor(this.state, target);
    if (!mission) return null;
    const existing = mission.captureTowInterception;
    if (existing && existing.missionId === mission.id) {
      if (existing.status === 'pending') this._spawnTowInterceptor(mission, target);
      return existing;
    }
    // The mission is already part of the canonical save surface. Commit the one-shot marker before
    // touching spawn budget so a Continue or duplicate secure event cannot create a second hunter.
    mission.captureTowInterception = {
      missionId: mission.id,
      targetSlot: missionTargetSlot(target),
      status: 'pending',
      requestedAt: finite(this.state.simTime, 0),
      requester: `bounty-tow:${mission.id}`,
      hunterEntityId: null,
    };
    this._spawnTowInterceptor(mission, target);
    return mission.captureTowInterception;
  },

  _retryTowInterceptions() {
    for (const mission of this.state && this.state.missions && this.state.missions.active || []) {
      const rec = mission && mission.captureTowInterception;
      if (!mission || mission.status !== 'active' || mission.type !== 'bounty_hunt' || !rec) continue;
      if (rec.status === 'spawned') {
        const restored = (this.state.entityList || []).find((entity) => (
          entity && entity.alive !== false && entity.data
            && String(entity.data.towInterceptionMissionId) === String(mission.id)
        ));
        if (restored && restored.id !== rec.hunterEntityId) rec.hunterEntityId = restored.id;
        continue;
      }
      if (rec.status !== 'pending') continue;
      const target = exactMissionTarget(this.state, mission, rec.targetSlot);
      if (target) this._spawnTowInterceptor(mission, target);
    }
  },

  _spawnTowInterceptor(mission, target) {
    const state = this.state;
    const rec = mission && mission.captureTowInterception;
    if (!state || !rec || rec.status !== 'pending' || !target || target.alive === false) return false;
    if (!isSecuredByPlayerMassline(state, target)) return false;
    const player = entityFor(state, state.playerId);
    if (!player || player.alive === false || !player.pos) return false;

    const budget = this.helpers && this.helpers.spawnBudget;
    const requester = rec.requester || `bounty-tow:${mission.id}`;
    const grant = budget && typeof budget.request === 'function' ? budget.request(1, requester) : 1;
    if (grant <= 0) return false;

    const seed = hash32(state.meta && state.meta.seed || 1, mission.id, 'tow-interceptor');
    const angle = (seed / 0x100000000) * Math.PI * 2;
    const distance = 520;
    const pos = {
      x: player.pos.x + Math.cos(angle) * distance,
      z: player.pos.z + Math.sin(angle) * distance,
    };
    const level = Math.max(4, 4 + Math.max(0, Math.round(Number(mission.riskTier) || 0)) * 2);
    const authored = makeEnemySpawnSpec('corsair_raider', level, pos, {
      factionId: 'faction_quiet',
      startedTick: state.tick | 0,
    });
    const contract = makeBountyHunterSpec({
      contractId: requester,
      contractTargetId: player.id,
      pos,
      factionId: 'faction_quiet',
    });
    authored.team = contract.team;
    authored.factionId = contract.factionId;
    authored.flags = { ...(authored.flags || {}), persistent: true };
    authored.data = {
      ...(authored.data || {}),
      ...(contract.data || {}),
      towInterceptionMissionId: mission.id,
      towInterceptionTargetSlot: rec.targetSlot,
      missionCaptureTargetId: target.id,
      ai: {
        ...((authored.data && authored.data.ai) || {}),
        ...((contract.data && contract.data.ai) || {}),
      },
    };
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    const hunter = typeof spawnEntity === 'function' ? spawnEntity(authored) : null;
    if (!hunter) {
      if (budget && typeof budget.releaseSome === 'function') budget.releaseSome(requester, 1);
      return false;
    }
    if (budget && typeof budget.bindEntity === 'function') budget.bindEntity(hunter.id, requester);
    normalizeHunter(hunter, state);
    hunter.data.combat = { ...(hunter.data.combat || {}), targetId: player.id, lockTarget: player.id };
    rec.status = 'spawned';
    rec.hunterEntityId = hunter.id;
    rec.spawnedAt = finite(state.simTime, 0);
    emit(this.bus, 'bountyHunt:towIntercepted', {
      missionId: mission.id,
      targetEntityId: target.id,
      hunterEntityId: hunter.id,
      contractId: requester,
      at: rec.spawnedAt,
    });
    return true;
  },

  _releaseTowPersistence(payload) {
    const missionId = payload && payload.missionId;
    if (!missionId || !this.state) return false;
    let changed = false;
    for (const entity of this.state.entityList || []) {
      if (!entity || !entity.data
        || String(entity.data.towInterceptionMissionId) !== String(missionId)) continue;
      if (entity.flags && entity.flags.persistent) {
        delete entity.flags.persistent;
        changed = true;
      }
    }
    return changed;
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

function entityFor(state, id) {
  return id == null || !state || !state.entities || typeof state.entities.get !== 'function'
    ? null : state.entities.get(id) || null;
}

function missionTargetSlot(entity) {
  const slot = Number(entity && entity.data && entity.data.missionTargetSlot);
  return Number.isInteger(slot) && slot >= 0 ? slot : 0;
}

function activeBountyMissionFor(state, entity) {
  if (!state || !entity || entity.id == null) return null;
  const missionId = entity.data && (entity.data.missionId || entity.data.missionTag);
  if (missionId == null) return null;
  return (state.missions && state.missions.active || []).find((mission) => (
    mission && mission.status === 'active' && mission.type === 'bounty_hunt'
      && String(mission.id) === String(missionId)
      && Array.isArray(mission.targetEntityIds)
      && mission.targetEntityIds.includes(entity.id)
  )) || null;
}

function exactMissionTarget(state, mission, targetSlot) {
  for (const entity of state && state.entityList || []) {
    const data = entity && entity.data;
    if (!entity || entity.alive === false || !data) continue;
    if (String(data.missionId || data.missionTag) !== String(mission.id)) continue;
    if (missionTargetSlot(entity) !== targetSlot) continue;
    if ((mission.targetEntityIds || []).includes(entity.id)) return entity;
  }
  return null;
}

function isSecuredByPlayerMassline(state, target) {
  const annotation = target && target.data && target.data.surrenderRecovery;
  if (!annotation || annotation.phase !== 'secured') return false;
  const byId = state && state.combat && state.combat.attachments && state.combat.attachments.byId;
  return !!(byId && Object.values(byId).some((attachment) => (
    attachment && attachment.state === 'active'
      && attachment.ownerId === state.playerId && attachment.targetId === target.id
  )));
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
