// Nonlethal ship recovery.
//
// Surrender and a player-disabled drive can each open a custody opportunity: the player must
// massline the hull, reel it close, and physically tow it into lawful station protection. Drive
// disable never writes AI intent or simulates surrender; an armed hull remains dangerous. This
// system owns only compact recovery records and entity-facing custody annotations; credits and
// reputation remain with their canonical economy/faction owners through events.
import { protectedStationAt } from '../ai/engagementAuthority.js';
import { ActivityKind, RulesOfEngagement, normalizeActivity } from '../ai/doctrine.js';
import { isHostileToPlayer } from './scanner.js';

export const SURRENDER_SECURE_REEL_WU = 60;
export const SURRENDER_ESCAPE_S = 45;

const CUSTODY_DESPAWN_S = 1.5;
const ESCAPE_DESPAWN_S = 12;
const RECEIPT_CAP = 32;
const RECOVERY_SURRENDERED = 'surrendered';
const RECOVERY_DRIVE_DISABLED = 'drive_disabled';

export const surrenderRecovery = {
  name: 'surrenderRecovery',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || {};
    ensureState(this.state);
    this._onSurrendered = (payload) => this._register(payload || {}, RECOVERY_SURRENDERED);
    this._onDriveDisabled = (payload) => this._registerDriveDisabled(payload || {});
    this._onLatched = (payload) => this._latched(payload || {});
    this._onReel = (payload) => this._reel(payload || {});
    this._onReleased = (payload) => this._release(payload || {});
    if (this.bus && typeof this.bus.on === 'function') {
      this.bus.on('combat:surrendered', this._onSurrendered);
      this.bus.on('combat:subsystemDisabled', this._onDriveDisabled);
      this.bus.on('tether:latched', this._onLatched);
      this.bus.on('tether:reel', this._onReel);
      this.bus.on('tether:released', this._onReleased);
      this.bus.on('tether:broke', this._onReleased);
    }
  },

  newGame() {
    if (this.state) this.state.surrenderRecovery = freshState();
  },

  update(_dt, state) {
    if (state.mode && state.mode !== 'flight') return;
    const own = ensureState(state);
    // Re-adopt an open saved recovery even though this deliberately transient coordinator is not
    // serialized separately. The entity annotation is part of the normal entity save surface.
    for (const entity of state.entityList || []) {
      const ai = entity && entity.data && entity.data.ai || {};
      const annotation = entity && entity.data && entity.data.surrenderRecovery;
      if (!entity || entity.alive === false || recordForEntity(own, entity.id) || terminalAnnotation(annotation)) continue;
      if (ai.fsm === 'surrender') {
        this._register({ entityId: entity.id, reason: 'saved_surrender', factionId: entity.factionId, type: entity.type }, RECOVERY_SURRENDERED);
      } else if (annotation && annotation.recoveryKind === RECOVERY_DRIVE_DISABLED && driveDisabled(state, entity.id)) {
        this._register({ entityId: entity.id, reason: 'saved_drive_disabled', factionId: entity.factionId, type: entity.type }, RECOVERY_DRIVE_DISABLED, false);
      }
    }

    const now = Number(state.simTime) || 0;
    for (const record of Object.values(own.records)) {
      if (!record || record.resolved) continue;
      const entity = entityFor(state, record.entityId);
      if (!entity || entity.alive === false) {
        record.resolved = true;
        record.phase = 'lost';
        continue;
      }
      if (record.recoveryKind === RECOVERY_DRIVE_DISABLED && !eligibleDriveRecovery(entity, state)) {
        this._loseDriveRecovery(record, entity, now);
        continue;
      }
      if (record.phase === 'secured') {
        const jurisdiction = protectedStationAt(state, entity);
        if (jurisdiction) this._custody(record, entity, jurisdiction, now);
      } else if (Number.isFinite(record.escapeAt) && now >= record.escapeAt) {
        this._escape(record, entity, now);
      }
    }
  },

  _registerDriveDisabled(payload) {
    if (String(payload.subsystemId || '') !== 'subsystem_drive') return null;
    if (payload.attackerId !== this.state.playerId) return null;
    return this._register(payload, RECOVERY_DRIVE_DISABLED, true);
  },

  _register(payload, recoveryKind = RECOVERY_SURRENDERED, requireHostile = false) {
    const state = this.state;
    const entityId = payload.targetId != null
      ? payload.targetId
      : payload.entityId != null ? payload.entityId : payload.id;
    const entity = entityFor(state, entityId);
    if (!eligibleRecovery(entity, state, recoveryKind, requireHostile)) return null;
    const own = ensureState(state);
    const existing = recordForEntity(own, entity.id);
    if (existing) {
      const restartedDriveWindow = recoveryKind === RECOVERY_DRIVE_DISABLED
        && existing.recoveryKind === RECOVERY_DRIVE_DISABLED
        && existing.resolved === true
        && existing.lostReason === 'drive_restored';
      if (!restartedDriveWindow) return existing;
      delete own.records[existing.id];
    }
    const now = Number(state.simTime) || 0;
    const id = `surrender:${entity.id}`;
    const record = {
      id,
      entityId: entity.id,
      squadId: payload.squadId || null,
      factionId: entity.factionId || payload.factionId || null,
      reason: payload.reason || recoveryKind,
      recoveryKind,
      phase: 'awaiting_tether',
      startedAt: now,
      escapeAt: recoveryKind === RECOVERY_SURRENDERED ? now + SURRENDER_ESCAPE_S : null,
      securedAt: null,
      resolvedAt: null,
      resolved: false,
      rewardCr: custodyReward(entity),
    };
    own.records[id] = record;
    annotate(entity, record, initialInstruction(record));
    this._say(record, entity);
    this._emit('surrender:option', publicRecord(record, entity));
    return record;
  },

  _latched(payload) {
    const state = this.state;
    const targetId = payload.targetId;
    const record = recordForEntity(ensureState(state), targetId);
    if (!record || record.resolved || record.phase !== 'awaiting_tether') return false;
    const playerId = payload.actorId != null ? payload.actorId : state.playerId;
    if (playerId !== state.playerId || !activePlayerTether(state, targetId, payload.attachmentId)) return false;
    const entity = entityFor(state, targetId);
    if (!entity || !eligibleActiveRecovery(entity, state, record)) return false;
    record.phase = 'tethered';
    if (entity) annotate(entity, record, 'Hold massline reel until the custody lock engages.');
    return true;
  },

  _reel(payload) {
    const state = this.state;
    if (payload.actorId !== state.playerId || payload.targetId == null) return false;
    const record = recordForEntity(ensureState(state), payload.targetId);
    if (!record || record.resolved || !['awaiting_tether', 'tethered'].includes(record.phase)) return false;
    const after = Number(payload.after);
    if (!Number.isFinite(after) || after > SURRENDER_SECURE_REEL_WU) return false;
    if (!activePlayerTether(state, payload.targetId, payload.attachmentId)) return false;
    const entity = entityFor(state, payload.targetId);
    if (!entity || !eligibleActiveRecovery(entity, state, record)) return false;
    record.phase = 'secured';
    record.securedAt = Number(state.simTime) || 0;
    record.escapeAt = null;
    annotate(entity, record, 'Custody lock secure. Tow this hull into a lawful station ring.');
    this._emit('surrender:secured', publicRecord(record, entity));
    return true;
  },

  _release(payload) {
    const entityId = payload.targetId;
    const record = recordForEntity(ensureState(this.state), entityId);
    if (!record || record.resolved || !['tethered', 'secured'].includes(record.phase)) return false;
    const entity = entityFor(this.state, entityId);
    if (!entity || entity.alive === false) return false;
    record.phase = 'awaiting_tether';
    record.securedAt = null;
    record.escapeAt = record.recoveryKind === RECOVERY_SURRENDERED
      ? (Number(this.state.simTime) || 0) + SURRENDER_ESCAPE_S
      : null;
    annotate(entity, record, record.recoveryKind === RECOVERY_SURRENDERED
      ? 'Custody lock lost. Relatch before this ship escapes.'
      : 'Custody lock lost. Relatch while the drive remains disabled.');
    this._emit('surrender:recoveryLost', publicRecord(record, entity));
    return true;
  },

  _custody(record, entity, jurisdiction, now) {
    if (record.resolved) return false;
    record.resolved = true;
    record.phase = 'custody';
    record.resolvedAt = now;
    record.stationId = jurisdiction.stationId;
    record.authorityFactionId = jurisdiction.factionId || null;
    const data = entity.data || (entity.data = {});
    data.despawnAt = now + CUSTODY_DESPAWN_S;
    annotate(entity, record, 'Custody transferred.');
    const receipt = {
      id: `surrender-custody:${entity.id}`,
      shape: 'surrender_custody',
      outcome: 'custody',
      entityId: entity.id,
      factionId: record.factionId,
      authorityFactionId: record.authorityFactionId,
      stationId: record.stationId,
      credits: record.rewardCr,
      t: now,
      recoveryKind: record.recoveryKind,
      text: record.recoveryKind === RECOVERY_DRIVE_DISABLED
        ? 'CUSTODY TRANSFERRED - disabled hull secured without a kill.'
        : 'CUSTODY TRANSFERRED - surrendered hull secured without a kill.',
    };
    const own = ensureState(this.state);
    own.receipts.push(receipt);
    if (own.receipts.length > RECEIPT_CAP) own.receipts.splice(0, own.receipts.length - RECEIPT_CAP);
    this._emit('economy:grantCredits', {
      amount: record.rewardCr,
      reason: `surrender_custody:${entity.id}`,
      entityId: entity.id,
    });
    if (record.authorityFactionId) {
      this._emit('faction:repDelta', {
        factionId: record.authorityFactionId,
        delta: 2,
        reason: 'surrender_custody',
        entityId: entity.id,
      });
    }
    this._emit('law:custodyTransfer', { ...receipt });
    this._emit('combat:nonlethalResolution', { ...receipt });
    this._emit('encounter:receipt', { ...receipt });
    return true;
  },

  _escape(record, entity, now) {
    if (record.resolved || record.recoveryKind !== RECOVERY_SURRENDERED) return false;
    record.resolved = true;
    record.phase = 'escaped';
    record.resolvedAt = now;
    const data = entity.data || (entity.data = {});
    const ai = data.ai || (data.ai = {});
    const intent = data.intent || (data.intent = {});
    const player = entityFor(this.state, this.state.playerId);
    const away = awayFrom(entity, player);
    ai.fsm = 'flee';
    ai.passive = true;
    ai.forcePlayerTarget = false;
    ai.huntPlayer = false;
    ai.forceFlee = true;
    ai.motiveSatisfied = true;
    ai.pirateDisengaged = true;
    ai.roe = RulesOfEngagement.HOLD_FIRE;
    ai.activity = normalizeActivity({
      kind: ActivityKind.FLEE,
      reason: 'surrender_recovery:window_expired',
      anchor: entity.pos,
      leashRadius: 1800,
      startedTick: this.state.tick | 0,
      targetId: null,
    });
    intent.fire = false;
    intent.fireGroup = null;
    intent.moveX = away.x;
    intent.moveZ = away.z;
    intent.boost = true;
    data.despawnAt = now + ESCAPE_DESPAWN_S;
    annotate(entity, record, 'Surrender window expired; contact escaped.');
    this._emit('surrender:escaped', publicRecord(record, entity));
    return true;
  },

  _loseDriveRecovery(record, entity, now) {
    if (record.resolved) return false;
    record.resolved = true;
    record.phase = 'lost';
    record.resolvedAt = now;
    record.lostReason = 'drive_restored';
    annotate(entity, record, 'Drive restored; nonlethal custody window closed.');
    this._emit('surrender:recoveryLost', publicRecord(record, entity));
    return true;
  },

  _say(record, entity) {
    if (record.spoken) return false;
    record.spoken = true;
    const text = record.recoveryKind === RECOVERY_DRIVE_DISABLED
      ? 'MASSLINE: Drive disabled. Reel the hull inside 60, then tow to station custody.'
      : 'MASSLINE: Reel the yielded ship inside 60, then tow to station custody.';
    const voice = this.helpers && this.helpers.voice;
    if (voice && typeof voice.say === 'function') {
      return voice.say({
        channel: 'info',
        kind: 'surrenderRecovery',
        id: `surrenderRecovery:${record.entityId}`,
        text,
        ttl: 4,
      });
    }
    this._emit('toast', { text, kind: 'info', ttl: 4 });
    return true;
  },

  _emit(event, payload) {
    if (this.bus && typeof this.bus.emit === 'function') this.bus.emit(event, payload);
  },

  destroy() {
    if (this.bus && typeof this.bus.off === 'function') {
      if (this._onSurrendered) this.bus.off('combat:surrendered', this._onSurrendered);
      if (this._onDriveDisabled) this.bus.off('combat:subsystemDisabled', this._onDriveDisabled);
      if (this._onLatched) this.bus.off('tether:latched', this._onLatched);
      if (this._onReel) this.bus.off('tether:reel', this._onReel);
      if (this._onReleased) this.bus.off('tether:released', this._onReleased);
      if (this._onReleased) this.bus.off('tether:broke', this._onReleased);
    }
    this._onSurrendered = this._onDriveDisabled = this._onLatched = this._onReel = this._onReleased = null;
  },
};

function freshState() {
  return { records: {}, receipts: [] };
}

function ensureState(state) {
  if (!state.surrenderRecovery || typeof state.surrenderRecovery !== 'object') state.surrenderRecovery = freshState();
  if (!state.surrenderRecovery.records || typeof state.surrenderRecovery.records !== 'object') state.surrenderRecovery.records = {};
  for (const record of Object.values(state.surrenderRecovery.records)) {
    if (record && !record.recoveryKind) record.recoveryKind = RECOVERY_SURRENDERED;
  }
  if (!Array.isArray(state.surrenderRecovery.receipts)) state.surrenderRecovery.receipts = [];
  return state.surrenderRecovery;
}

function entityFor(state, id) {
  return id == null || !state.entities || typeof state.entities.get !== 'function' ? null : state.entities.get(id) || null;
}

function recordForEntity(own, entityId) {
  return own && own.records && own.records[`surrender:${entityId}`] || null;
}

function eligibleCommon(entity, state) {
  if (!entity || entity.alive === false || entity.id === state.playerId || !['ship', 'drone'].includes(entity.type)) return false;
  const data = entity.data || {};
  const ai = data.ai || {};
  if (data.isBoss || data.encounterBoss || data.missionBoss || data.aceMemory
    || ai.isBoss || ai.fanatic || ai.ace || ai.moraleImmune || ai.surrenderImmune) return false;
  const authored = [ai.archetype, ai.aiArchetype, ai.role, ai.spawnContext, ai.encounterKind, data.aiArchetype, data.role]
    .filter(Boolean).join(' ').toLowerCase();
  if (/(^|[\s_-])(boss|miniboss|fanatic)([\s_-]|$)/.test(authored)
    || authored.includes('named_hunter') || authored.includes('ace_return')) return false;
  return true;
}

function eligibleSurrender(entity, state) {
  if (!eligibleCommon(entity, state)) return false;
  const ai = entity.data && entity.data.ai || {};
  return ai.fsm === 'surrender' && ai.passive === true;
}

function eligibleDriveRecovery(entity, state, requireHostile = false) {
  if (!eligibleCommon(entity, state) || !driveDisabled(state, entity.id)) return false;
  return !requireHostile || isHostileToPlayer(entity, playerTeam(state), state);
}

function eligibleRecovery(entity, state, recoveryKind, requireHostile = false) {
  return recoveryKind === RECOVERY_DRIVE_DISABLED
    ? eligibleDriveRecovery(entity, state, requireHostile)
    : eligibleSurrender(entity, state);
}

function eligibleActiveRecovery(entity, state, record) {
  return eligibleRecovery(entity, state, record.recoveryKind, false);
}

function driveDisabled(state, entityId) {
  const runtime = state && state.combat && state.combat.entities
    ? state.combat.entities[String(entityId)]
    : null;
  const drive = runtime && runtime.subsystems && runtime.subsystems.subsystem_drive;
  return !!(drive && drive.effectiveDisabled === true && runtime.capabilities && runtime.capabilities.drive === false);
}

function playerTeam(state) {
  const player = entityFor(state, state.playerId);
  return player && player.team != null ? player.team : 0;
}

function terminalAnnotation(annotation) {
  return !!(annotation && ['custody', 'escaped', 'lost'].includes(annotation.phase));
}

function activePlayerTether(state, targetId, attachmentId) {
  const tether = state.player && state.player.tether;
  if (!tether || tether.active !== true || tether.targetId !== targetId) return false;
  if (attachmentId != null && tether.attachmentId != null && tether.attachmentId !== attachmentId) return false;
  return true;
}

function custodyReward(entity) {
  const bounty = Math.max(0, Math.round(Number(entity && entity.data && entity.data.bountyCr) || 0));
  return Math.max(75, Math.min(1200, Math.round(bounty * 0.6)));
}

function annotate(entity, record, instruction) {
  const data = entity.data || (entity.data = {});
  data.surrenderRecovery = {
    id: record.id,
    recoveryKind: record.recoveryKind,
    phase: record.phase,
    instruction,
    escapeAt: record.escapeAt,
    stationId: record.stationId || null,
    rewardCr: record.rewardCr,
  };
}

function publicRecord(record, entity) {
  return {
    id: record.id,
    entityId: record.entityId,
    label: entity && entity.data && (entity.data.name || entity.data.shipName || entity.data.callsign)
      || (record.recoveryKind === RECOVERY_DRIVE_DISABLED ? 'Disabled ship' : 'Surrendered ship'),
    recoveryKind: record.recoveryKind,
    phase: record.phase,
    reason: record.reason,
    rewardCr: record.rewardCr,
    escapeAt: record.escapeAt,
    secureReel_wu: SURRENDER_SECURE_REEL_WU,
    instruction: entity && entity.data && entity.data.surrenderRecovery && entity.data.surrenderRecovery.instruction || null,
    lostReason: record.lostReason || null,
  };
}

function initialInstruction(record) {
  return record.recoveryKind === RECOVERY_DRIVE_DISABLED
    ? 'Drive disabled. Latch with massline. Reel inside 60. Tow to station custody.'
    : 'Latch with massline. Reel inside 60. Tow to station custody.';
}

function awayFrom(entity, player) {
  const dx = (entity.pos && entity.pos.x || 0) - (player && player.pos && player.pos.x || 0);
  const dz = (entity.pos && entity.pos.z || 0) - (player && player.pos && player.pos.z || 0);
  const length = Math.hypot(dx, dz) || 1;
  return { x: dx / length, z: dz / length };
}

export default surrenderRecovery;
