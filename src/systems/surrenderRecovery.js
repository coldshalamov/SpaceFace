// Nonlethal ship recovery.
//
// Surrender, a player-disabled hostile drive, and a genuinely neutral disabled freighter can each
// open a custody opportunity: the player must massline the hull, reel it close, and physically tow
// it into lawful station protection. Drive disable never writes AI intent or simulates surrender;
// an armed hull remains dangerous and a civilian hull stays ballistic. This system owns only compact
// recovery records and entity-facing custody annotations; credits, reputation, markets, cargo, heat,
// and encounter state remain with their canonical owners through events.
import { protectedStationAt } from '../ai/engagementAuthority.js';
import { ActivityKind, RulesOfEngagement, normalizeActivity } from '../ai/doctrine.js';
import { isHostileToPlayer } from './scanner.js';

export const SURRENDER_SECURE_REEL_WU = 60;
export const SURRENDER_ESCAPE_S = 45;
export const CIVILIAN_RECOVERY_WINDOW_S = 75;

const CUSTODY_DESPAWN_S = 1.5;
const ESCAPE_DESPAWN_S = 12;
const RECEIPT_CAP = 32;
// Exact retirement beats a rotating replay window. If a single uninterrupted run ever saturates
// this multi-hour safety budget, new settlements fail closed instead of reopening an old identity.
const RETIRED_RECOVERY_CAP = 1024;
const CIVILIAN_MANIFEST_LINE_CAP = 16;
const CIVILIAN_MANIFEST_QTY_CAP = 512;
const RECOVERY_SURRENDERED = 'surrendered';
const RECOVERY_DRIVE_DISABLED = 'drive_disabled';
const RECOVERY_CIVILIAN_DISABLED = 'civilian_disabled';
const RECOVERY_ENTITY_INSTANCE = Symbol('surrenderRecoveryEntityInstance');

export const surrenderRecovery = {
  name: 'surrenderRecovery',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || {};
    this._freshRunPending = false;
    ensureState(this.state);
    this._onSurrendered = (payload) => this._register(payload || {}, RECOVERY_SURRENDERED);
    this._onDriveDisabled = (payload) => this._registerDriveDisabled(payload || {});
    this._onDriveEnabled = (payload) => this._driveEnabled(payload || {});
    this._onLatched = (payload) => this._latched(payload || {});
    this._onReel = (payload) => this._reel(payload || {});
    this._onReleased = (payload) => this._release(payload || {});
    this._onBroke = (payload) => this._release({ ...(payload || {}), reason: 'broke' });
    this._onEntityKilled = (payload) => this._rememberCivilianKiller(payload || {});
    this._onSectorExit = () => this._resolveCivilianBoundary('sector_exit');
    this._onSaveRestoring = () => {
      // NPC entities rematerialize after load. Drop only this transient coordinator; a valid saved
      // entity annotation re-adopts below with its durable manifest identity and original deadline.
      if (this.state) this.state.surrenderRecovery = freshState();
      this._freshRunPending = false;
    };
    this._onGameNew = () => this._beginFreshRun();
    this._onGameStarted = () => this._completeFreshRun();
    if (this.bus && typeof this.bus.on === 'function') {
      this.bus.on('combat:surrendered', this._onSurrendered);
      this.bus.on('combat:subsystemDisabled', this._onDriveDisabled);
      this.bus.on('combat:subsystemEnabled', this._onDriveEnabled);
      this.bus.on('tether:latched', this._onLatched);
      this.bus.on('tether:reel', this._onReel);
      this.bus.on('tether:released', this._onReleased);
      this.bus.on('tether:broke', this._onBroke);
      this.bus.on('entity:killed', this._onEntityKilled);
      this.bus.on('sector:exit', this._onSectorExit);
      this.bus.on('save:restoring', this._onSaveRestoring);
      // The canonical New Game route emits game:new and later game:started. It does not emit the
      // legacy game:newGame signal, and resetRunState deliberately does not know this additive tree.
      this.bus.on('game:new', this._onGameNew);
      this.bus.on('game:started', this._onGameStarted);
    }
  },

  newGame() {
    if (!this.state) return;
    this._resolveCivilianBoundary('reset');
    this.state.surrenderRecovery = freshState();
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
      if (annotation && annotation.recoveryKind === RECOVERY_CIVILIAN_DISABLED
        && driveDisabled(state, entity.id)) {
        this._register({
          entityId: entity.id,
          reason: 'saved_civilian_disabled',
          factionId: entity.factionId,
          type: entity.type,
          savedAnnotation: annotation,
        }, RECOVERY_CIVILIAN_DISABLED, false);
      } else if (annotation && annotation.recoveryKind === RECOVERY_DRIVE_DISABLED
        && driveDisabled(state, entity.id)) {
        this._register({ entityId: entity.id, reason: 'saved_drive_disabled', factionId: entity.factionId, type: entity.type }, RECOVERY_DRIVE_DISABLED, false);
      } else if (ai.fsm === 'surrender') {
        this._register({ entityId: entity.id, reason: 'saved_surrender', factionId: entity.factionId, type: entity.type }, RECOVERY_SURRENDERED);
      }
    }

    const now = Number(state.simTime) || 0;
    for (const record of Object.values(own.records)) {
      if (!record || record.resolved) continue;
      const entity = entityFor(state, record.entityId);
      if (!entity || entity.alive === false) {
        if (record.recoveryKind === RECOVERY_CIVILIAN_DISABLED) {
          this._loseCivilianRecovery(record, entity, now, 'destroyed', {
            killerId: record.pendingKillerId == null ? null : record.pendingKillerId,
          });
        } else {
          record.resolved = true;
          record.phase = 'lost';
        }
        continue;
      }
      if (record.recoveryKind === RECOVERY_DRIVE_DISABLED && !eligibleDriveRecovery(entity, state)) {
        this._loseDriveRecovery(record, entity, now);
        continue;
      }
      if (record.recoveryKind === RECOVERY_CIVILIAN_DISABLED) {
        if (!driveDisabled(state, entity.id)) {
          this._loseCivilianRecovery(record, entity, now, 'drive_restored');
          continue;
        }
        if (!eligibleCivilianRecovery(entity, state, record.manifest)) {
          this._loseCivilianRecovery(record, entity, now, 'identity_invalid');
          continue;
        }
      }
      if (record.phase === 'secured') {
        const jurisdiction = protectedStationAt(state, entity);
        if (jurisdiction) this._custody(record, entity, jurisdiction, now);
      }
      if (!record.resolved && record.recoveryKind === RECOVERY_CIVILIAN_DISABLED
        && Number.isFinite(record.deadlineAt) && now >= record.deadlineAt) {
        this._loseCivilianRecovery(record, entity, now, 'timed_out');
      } else if (!record.resolved && Number.isFinite(record.escapeAt) && now >= record.escapeAt) {
        this._escape(record, entity, now);
      }
    }
  },

  _registerDriveDisabled(payload) {
    if (String(payload.subsystemId || '') !== 'subsystem_drive') return null;
    const entityId = payload.targetId != null ? payload.targetId : payload.entityId;
    const entity = entityFor(this.state, entityId);
    // A manifest civilian is a distinct rescue relation. The disabling blow may come from a raider
    // or another NPC; that must not relax the player-causality gate for ordinary hostile hulls.
    if (eligibleCivilianRecovery(entity, this.state)) {
      return this._register(payload, RECOVERY_CIVILIAN_DISABLED, false);
    }
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
    const manifest = recoveryKind === RECOVERY_CIVILIAN_DISABLED
      ? civilianManifestFor(entity)
      : null;
    const existing = recordForEntity(own, entity.id);
    if (existing) {
      const recycledResolvedInstance = existing.resolved === true
        && entity[RECOVERY_ENTITY_INSTANCE] !== existing.id;
      const restartedDriveWindow = recoveryKind === RECOVERY_DRIVE_DISABLED
        && existing.recoveryKind === RECOVERY_DRIVE_DISABLED
        && existing.resolved === true
        && existing.lostReason === 'drive_restored';
      const recycledCivilianIdentity = recoveryKind === RECOVERY_CIVILIAN_DISABLED
        && existing.recoveryKind === RECOVERY_CIVILIAN_DISABLED
        && existing.resolved === true
        && !(entity.data && entity.data.surrenderRecovery && entity.data.surrenderRecovery.id)
        && manifest && existing.manifest
        && manifest.manifestId !== existing.manifest.manifestId;
      if (!recycledResolvedInstance && !restartedDriveWindow && !recycledCivilianIdentity) return existing;
      delete own.records[recordKeyForEntity(entity.id)];
    }
    const now = Number(state.simTime) || 0;
    const saved = payload.savedAnnotation && typeof payload.savedAnnotation === 'object'
      ? payload.savedAnnotation
      : null;
    if (recoveryKind === RECOVERY_CIVILIAN_DISABLED && saved
      && !validSavedCivilianAnnotation(saved, manifest)) {
      rejectSavedCivilianIdentity(entity, saved, 'invalid_saved_annotation');
      return null;
    }
    const startedTick = recoveryKind === RECOVERY_CIVILIAN_DISABLED && Number.isInteger(saved && saved.startedTick)
      ? saved.startedTick
      : (Number.isInteger(state.tick) ? state.tick : Math.max(0, Math.round(now * 60)));
    const id = recoveryKind === RECOVERY_CIVILIAN_DISABLED
      ? civilianRecoveryId(manifest.manifestId, startedTick)
      : `surrender:${entity.id}`;
    if (recoveryKind === RECOVERY_CIVILIAN_DISABLED) {
      const durableOwner = recordForDurableId(own, id);
      if (durableOwner && durableOwner.entityId !== entity.id) {
        rejectDuplicateCivilianIdentity(entity, id);
        return null;
      }
    }
    const savedDeadline = Number(saved && saved.deadlineAt);
    const deadlineAt = recoveryKind === RECOVERY_CIVILIAN_DISABLED
      ? (saved && Number.isFinite(savedDeadline) && savedDeadline >= 0
          ? savedDeadline
          : now + CIVILIAN_RECOVERY_WINDOW_S)
      : null;
    const restoredPhase = recoveryKind === RECOVERY_CIVILIAN_DISABLED
      ? restoredCivilianPhase(state, entity.id)
      : 'awaiting_tether';
    const record = {
      id,
      entityId: entity.id,
      squadId: payload.squadId || null,
      factionId: entity.factionId || payload.factionId || null,
      sectorId: state.world && state.world.currentSectorId || null,
      reason: payload.reason || recoveryKind,
      recoveryKind,
      phase: restoredPhase,
      startedAt: now,
      startedTick,
      escapeAt: recoveryKind === RECOVERY_SURRENDERED ? now + SURRENDER_ESCAPE_S : null,
      deadlineAt,
      securedAt: restoredPhase === 'secured'
        ? (saved && Number.isFinite(Number(saved.securedAt)) ? Number(saved.securedAt) : now)
        : null,
      resolvedAt: null,
      resolved: false,
      rewardCr: recoveryKind === RECOVERY_CIVILIAN_DISABLED
        ? civilianRecoveryReward(manifest)
        : custodyReward(entity),
      manifest,
      ownedPersistent: recoveryKind === RECOVERY_CIVILIAN_DISABLED
        ? (saved ? saved.ownedPersistent === true : !(entity.flags && entity.flags.persistent === true))
        : false,
    };
    if (recoveryKind === RECOVERY_CIVILIAN_DISABLED) {
      entity.flags = entity.flags || {};
      entity.flags.persistent = true;
    }
    Object.defineProperty(entity, RECOVERY_ENTITY_INSTANCE, {
      value: id,
      configurable: true,
    });
    own.records[recordKeyForEntity(entity.id)] = record;
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
    if (playerId !== state.playerId) return false;
    const attachment = canonicalPlayerAttachment(state, targetId, payload.attachmentId);
    if (!attachment) return false;
    const entity = entityFor(state, targetId);
    if (!entity || !eligibleActiveRecovery(entity, state, record)) return false;
    if (Number.isFinite(Number(attachment.restLength))
      && Number(attachment.restLength) <= SURRENDER_SECURE_REEL_WU) {
      return this._secure(record, entity);
    }
    record.phase = 'tethered';
    if (entity) annotate(entity, record, 'Hold massline reel until the custody lock engages.');
    return true;
  },

  _reel(payload) {
    const state = this.state;
    if (payload.actorId !== state.playerId || payload.targetId == null) return false;
    const record = recordForEntity(ensureState(state), payload.targetId);
    if (!record || record.resolved || !['awaiting_tether', 'tethered'].includes(record.phase)) return false;
    const attachment = canonicalPlayerAttachment(state, payload.targetId, payload.attachmentId);
    if (!attachment || !Number.isFinite(Number(attachment.restLength))
      || Number(attachment.restLength) > SURRENDER_SECURE_REEL_WU) return false;
    const entity = entityFor(state, payload.targetId);
    if (!entity || !eligibleActiveRecovery(entity, state, record)) return false;
    return this._secure(record, entity);
  },

  _secure(record, entity) {
    if (!record || record.resolved || record.phase === 'secured') return false;
    record.phase = 'secured';
    record.securedAt = Number(this.state.simTime) || 0;
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
    if (record.recoveryKind === RECOVERY_CIVILIAN_DISABLED) {
      return this._loseCivilianRecovery(
        record,
        entity,
        Number(this.state.simTime) || 0,
        payload.reason === 'broke' ? 'tether_broke' : 'released',
      );
    }
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
    if (record.recoveryKind === RECOVERY_CIVILIAN_DISABLED) {
      return this._recoverCivilian(record, entity, jurisdiction, now);
    }
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

  _recoverCivilian(record, entity, jurisdiction, now) {
    if (record.resolved || !eligibleCivilianRecovery(entity, this.state, record.manifest)) return false;
    const manifest = civilianManifestFor(entity);
    if (!sameManifestIdentity(manifest, record.manifest)) return false;
    const settled = {
      ...record,
      resolved: true,
      phase: 'recovered',
      resolvedAt: now,
      stationId: jurisdiction.stationId,
      authorityFactionId: jurisdiction.factionId || null,
      manifest,
      rewardCr: civilianRecoveryReward(manifest),
    };
    const receipt = civilianReceipt(settled, entity, now, 'recovered', {
      stationId: settled.stationId,
      authorityFactionId: settled.authorityFactionId,
    });
    // Receipt admission is the idempotency commit point. A restored/corrupt duplicate must not
    // despawn or protect a second hull, apply market supply, grant credits/rep, or publish settlement.
    if (!this._storeReceipt(receipt)) {
      record.resolved = true;
      record.phase = 'lost';
      record.resolvedAt = now;
      record.lostReason = 'duplicate_receipt';
      annotate(entity, record, 'Duplicate freight identity rejected; no settlement applied.');
      releaseOwnedPersistence(entity, record);
      return false;
    }
    Object.assign(record, settled);
    const data = entity.data || (entity.data = {});
    data.despawnAt = now + CUSTODY_DESPAWN_S;
    data.nonlethalCustody = 'civilian_freight_recovery';
    // The transfer is already complete. Use combat's existing invulnerability flag only for the
    // short readable despawn beat so a late projectile cannot turn a successful rescue into a kill.
    entity.flags = entity.flags || {};
    entity.flags.invuln = true;
    annotate(entity, record, 'Freighter and manifest transferred to lawful recovery control.');
    releaseOwnedPersistence(entity, record);

    for (const line of manifest.lines) {
      this._emit('economy:applyTradePressure', {
        stationId: record.stationId,
        good: line.commodityId,
        commodityId: line.commodityId,
        vol: line.qty,
        source: 'civilian_freight_recovery',
        cause: 'civilian_freight_recovery',
        manifestId: manifest.manifestId,
        receiptId: receipt.id,
      });
    }
    if (record.rewardCr > 0) {
      this._emit('economy:grantCredits', {
        amount: record.rewardCr,
        reason: `civilian_freight_recovery:${manifest.manifestId}`,
        entityId: entity.id,
        manifestId: manifest.manifestId,
        receiptId: receipt.id,
      });
    }
    if (record.authorityFactionId) {
      this._emit('faction:repDelta', {
        factionId: record.authorityFactionId,
        delta: 2,
        reason: 'civilian_freight_recovery',
        entityId: entity.id,
        manifestId: manifest.manifestId,
        receiptId: receipt.id,
      });
    }
    this._emit('freight:recovery', { ...receipt });
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

  _driveEnabled(payload) {
    if (String(payload.subsystemId || '') !== 'subsystem_drive') return false;
    const entityId = payload.targetId != null ? payload.targetId : payload.entityId;
    const record = recordForEntity(ensureState(this.state), entityId);
    if (!record || record.resolved || record.recoveryKind !== RECOVERY_CIVILIAN_DISABLED) return false;
    return this._loseCivilianRecovery(
      record,
      entityFor(this.state, entityId),
      Number(this.state.simTime) || 0,
      'drive_restored',
    );
  },

  _rememberCivilianKiller(payload) {
    const entityId = payload.id != null ? payload.id : payload.targetId;
    const record = recordForEntity(ensureState(this.state), entityId);
    if (!record || record.resolved || record.recoveryKind !== RECOVERY_CIVILIAN_DISABLED) return false;
    record.pendingKillerId = payload.killerId == null ? null : payload.killerId;
    return true;
  },

  _loseCivilianRecovery(record, entity, now, outcome, extra = {}) {
    if (!record || record.resolved || record.recoveryKind !== RECOVERY_CIVILIAN_DISABLED) return false;
    const liveManifest = civilianManifestFor(entity);
    const manifest = sameManifestIdentity(liveManifest, record.manifest) ? liveManifest : record.manifest;
    record.resolved = true;
    record.phase = 'lost';
    record.resolvedAt = now;
    record.lostReason = String(outcome || 'abandoned');
    if (manifest) record.manifest = manifest;
    if (entity) annotate(entity, record, civilianLossInstruction(record.lostReason));
    const receipt = civilianReceipt(record, entity, now, record.lostReason, extra);
    releaseOwnedPersistence(entity, record);
    if (!this._storeReceipt(receipt)) return false;
    this._emit('surrender:recoveryLost', publicRecord(record, entity));
    this._emit('freight:recoveryAbandoned', { ...receipt });
    this._emit('encounter:receipt', { ...receipt });
    return true;
  },

  _resolveCivilianBoundary(outcome) {
    if (!this.state) return 0;
    const own = ensureState(this.state);
    const now = Number(this.state.simTime) || 0;
    let resolved = 0;
    for (const record of Object.values(own.records)) {
      if (!record || record.resolved || record.recoveryKind !== RECOVERY_CIVILIAN_DISABLED) continue;
      if (this._loseCivilianRecovery(record, entityFor(this.state, record.entityId), now, outcome)) resolved++;
    }
    return resolved;
  },

  _beginFreshRun() {
    if (!this.state) return;
    this._resolveCivilianBoundary('new_game');
    this.state.surrenderRecovery = freshState();
    this._freshRunPending = true;
  },

  _completeFreshRun() {
    if (!this.state) return;
    if (!this._freshRunPending) this._resolveCivilianBoundary('game_started');
    // resetRunState does not include additive subsystem trees. Reassert the empty run boundary after
    // the canonical game:new -> game:started transition so recycled entity ids cannot inherit state.
    this.state.surrenderRecovery = freshState();
    this._freshRunPending = false;
  },

  _storeReceipt(receipt) {
    if (!receipt || !receipt.id) return false;
    const own = ensureState(this.state);
    const recoveryId = receipt.recoveryId || legacyCivilianRecoveryId(receipt);
    if (recoveryId && own.retiredRecoveryIds.includes(recoveryId)) return false;
    if (own.receipts.some((item) => item && (
      item.id === receipt.id
      || (recoveryId && (
        item.recoveryId === recoveryId
        || (typeof item.id === 'string' && item.id.startsWith(`${recoveryId}:`))
      ))
    ))) return false;
    if (recoveryId) {
      if (own.retiredRecoveryIds.length >= RETIRED_RECOVERY_CAP) return false;
      own.retiredRecoveryIds.push(recoveryId);
    }
    own.receipts.push(receipt);
    if (own.receipts.length > RECEIPT_CAP) own.receipts.splice(0, own.receipts.length - RECEIPT_CAP);
    return true;
  },

  _say(record, entity) {
    if (record.spoken) return false;
    record.spoken = true;
    const text = record.recoveryKind === RECOVERY_CIVILIAN_DISABLED
      ? 'MASSLINE: Civilian drive disabled. Reel inside 60 and tow the manifest to lawful cover.'
      : record.recoveryKind === RECOVERY_DRIVE_DISABLED
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
      if (this._onDriveEnabled) this.bus.off('combat:subsystemEnabled', this._onDriveEnabled);
      if (this._onLatched) this.bus.off('tether:latched', this._onLatched);
      if (this._onReel) this.bus.off('tether:reel', this._onReel);
      if (this._onReleased) this.bus.off('tether:released', this._onReleased);
      if (this._onBroke) this.bus.off('tether:broke', this._onBroke);
      if (this._onEntityKilled) this.bus.off('entity:killed', this._onEntityKilled);
      if (this._onSectorExit) this.bus.off('sector:exit', this._onSectorExit);
      if (this._onSaveRestoring) this.bus.off('save:restoring', this._onSaveRestoring);
      if (this._onGameNew) this.bus.off('game:new', this._onGameNew);
      if (this._onGameStarted) this.bus.off('game:started', this._onGameStarted);
    }
    this._onSurrendered = this._onDriveDisabled = this._onDriveEnabled = null;
    this._onLatched = this._onReel = this._onReleased = this._onBroke = null;
    this._onEntityKilled = this._onSectorExit = this._onSaveRestoring = null;
    this._onGameNew = this._onGameStarted = null;
  },
};

function freshState() {
  return { records: {}, receipts: [], retiredRecoveryIds: [] };
}

function ensureState(state) {
  if (!state.surrenderRecovery || typeof state.surrenderRecovery !== 'object') state.surrenderRecovery = freshState();
  if (!state.surrenderRecovery.records || typeof state.surrenderRecovery.records !== 'object') state.surrenderRecovery.records = {};
  for (const record of Object.values(state.surrenderRecovery.records)) {
    if (record && !record.recoveryKind) record.recoveryKind = RECOVERY_SURRENDERED;
  }
  if (!Array.isArray(state.surrenderRecovery.receipts)) state.surrenderRecovery.receipts = [];
  if (!Array.isArray(state.surrenderRecovery.retiredRecoveryIds)) {
    state.surrenderRecovery.retiredRecoveryIds = [];
  }
  for (const receipt of state.surrenderRecovery.receipts) {
    const recoveryId = receipt && (receipt.recoveryId || legacyCivilianRecoveryId(receipt));
    if (recoveryId && !state.surrenderRecovery.retiredRecoveryIds.includes(recoveryId)
      && state.surrenderRecovery.retiredRecoveryIds.length < RETIRED_RECOVERY_CAP) {
      state.surrenderRecovery.retiredRecoveryIds.push(recoveryId);
    }
  }
  return state.surrenderRecovery;
}

function legacyCivilianRecoveryId(receipt) {
  if (!receipt || receipt.shape !== 'civilian_freight_recovery' || typeof receipt.id !== 'string') return null;
  const splitAt = receipt.id.lastIndexOf(':');
  if (splitAt <= 0) return null;
  const recoveryId = receipt.id.slice(0, splitAt);
  return recoveryId.startsWith('civilian-recovery:') ? recoveryId : null;
}

function entityFor(state, id) {
  return id == null || !state.entities || typeof state.entities.get !== 'function' ? null : state.entities.get(id) || null;
}

function recordForEntity(own, entityId) {
  return own && own.records && own.records[recordKeyForEntity(entityId)] || null;
}

function recordForDurableId(own, durableId) {
  if (!own || !own.records || !durableId) return null;
  for (const record of Object.values(own.records)) {
    if (record && record.id === durableId) return record;
  }
  return null;
}

function recordKeyForEntity(entityId) {
  return `surrender:${entityId}`;
}

function rejectDuplicateCivilianIdentity(entity, durableId) {
  if (!entity) return;
  const data = entity.data || (entity.data = {});
  const previous = data.surrenderRecovery && typeof data.surrenderRecovery === 'object'
    ? data.surrenderRecovery
    : {};
  relinquishAnnotatedPersistence(entity, previous);
  data.surrenderRecovery = {
    ...previous,
    id: durableId,
    recoveryKind: RECOVERY_CIVILIAN_DISABLED,
    phase: 'lost',
    lostReason: 'duplicate_identity',
    ownedPersistent: false,
    instruction: 'Duplicate freight identity rejected; this hull cannot settle recovery.',
  };
}

function rejectSavedCivilianIdentity(entity, annotation, reason) {
  if (!entity) return;
  relinquishAnnotatedPersistence(entity, annotation);
  const data = entity.data || (entity.data = {});
  data.surrenderRecovery = {
    ...(annotation && typeof annotation === 'object' ? annotation : {}),
    recoveryKind: RECOVERY_CIVILIAN_DISABLED,
    phase: 'lost',
    lostReason: reason,
    ownedPersistent: false,
    instruction: 'Invalid saved freight recovery rejected; this hull cannot settle recovery.',
  };
}

function relinquishAnnotatedPersistence(entity, annotation) {
  if (!entity || !annotation || annotation.ownedPersistent !== true) return false;
  annotation.ownedPersistent = false;
  const handoff = entity.data && entity.data.freightCustodyPersistence;
  if (handoff && typeof handoff === 'object') return false;
  if (entity.flags) delete entity.flags.persistent;
  return true;
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

function eligibleCivilianRecovery(entity, state, expectedManifest = null) {
  if (!eligibleCommon(entity, state) || entity.type !== 'ship' || entity.team !== 2
    || !driveDisabled(state, entity.id)) return false;
  const data = entity.data || {};
  const ai = data.ai || {};
  if (isHostileToPlayer(entity, playerTeam(state), state)) return false;
  if (ai.passive !== true) return false;
  if (data.missionId != null || data.missionTargetSlot != null || data.contractId != null
    || data.isMissionTarget === true || ai.missionId != null || ai.missionTarget === true) return false;
  const authoredRole = [data.trafficRole, data.role, ai.encounterRole, ai.role]
    .find((value) => typeof value === 'string' && value.trim());
  if (!authoredRole || !/(^|[\s_-])(hauler|freight|freighter)([\s_-]|$)/i.test(authoredRole)) return false;
  const manifest = civilianManifestFor(entity);
  if (!manifest || !sameManifestIdentity(manifest, expectedManifest || manifest)) return false;
  const custody = data.freightCustody;
  if (custody && (
    custody.status !== 'carrier'
    || custody.carrierId !== entity.id
    || custody.manifestId !== manifest.manifestId
    || (data.predationIdentityKey && custody.carrierIdentityKey !== data.predationIdentityKey)
  )) return false;
  return manifest.totalQty > 0;
}

function eligibleRecovery(entity, state, recoveryKind, requireHostile = false) {
  if (recoveryKind === RECOVERY_CIVILIAN_DISABLED) return eligibleCivilianRecovery(entity, state);
  if (recoveryKind === RECOVERY_DRIVE_DISABLED) return eligibleDriveRecovery(entity, state, requireHostile);
  return eligibleSurrender(entity, state);
}

function eligibleActiveRecovery(entity, state, record) {
  return record.recoveryKind === RECOVERY_CIVILIAN_DISABLED
    ? eligibleCivilianRecovery(entity, state, record.manifest)
    : eligibleRecovery(entity, state, record.recoveryKind, false);
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
  return !!(annotation && ['custody', 'recovered', 'escaped', 'lost'].includes(annotation.phase));
}

function restoredCivilianPhase(state, targetId) {
  const attachment = canonicalPlayerAttachment(state, targetId);
  if (!attachment) return 'awaiting_tether';
  const restLength = Number(attachment.restLength);
  return Number.isFinite(restLength) && restLength <= SURRENDER_SECURE_REEL_WU
    ? 'secured'
    : 'tethered';
}

function canonicalPlayerAttachment(state, targetId, attachmentId = null) {
  const byId = state && state.combat && state.combat.attachments && state.combat.attachments.byId;
  if (!byId || typeof byId !== 'object') return null;
  const expectedId = attachmentId == null ? null : String(attachmentId);
  const candidates = Object.values(byId)
    .filter((attachment) => attachment && attachment.state === 'active'
      && attachment.ownerId === state.playerId && attachment.targetId === targetId
      && (expectedId == null || String(attachment.id) === expectedId))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return candidates[0] || null;
}

function custodyReward(entity) {
  const bounty = Math.max(0, Math.round(Number(entity && entity.data && entity.data.bountyCr) || 0));
  return Math.max(75, Math.min(1200, Math.round(bounty * 0.6)));
}

function civilianRecoveryReward(manifest) {
  const qty = Math.max(0, Math.floor(Number(manifest && manifest.totalQty) || 0));
  return Math.max(90, Math.min(600, 90 + qty * 6));
}

function civilianManifestFor(entity) {
  const raw = entity && entity.data && entity.data.cargoManifest;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const manifestId = boundedIdentity(raw.manifestId);
  const freighterKey = boundedIdentity(raw.freighterKey);
  if (!manifestId || !freighterKey || !Array.isArray(raw.lines)
    || raw.lines.length > CIVILIAN_MANIFEST_LINE_CAP) return null;
  const lines = [];
  let totalQty = 0;
  for (const rawLine of raw.lines) {
    if (!rawLine || typeof rawLine !== 'object') return null;
    const commodityId = boundedIdentity(rawLine.commodityId);
    const rawQty = Number(rawLine.qty);
    if (!commodityId || !Number.isFinite(rawQty) || rawQty < 0 || !Number.isInteger(rawQty)) return null;
    if (rawQty === 0) continue;
    const qty = rawQty;
    totalQty += qty;
    if (totalQty > CIVILIAN_MANIFEST_QTY_CAP) return null;
    lines.push({ commodityId, qty });
  }
  lines.sort((a, b) => a.commodityId.localeCompare(b.commodityId));
  return {
    manifestId,
    freighterKey,
    role: boundedIdentity(raw.role) || 'hauler',
    lines,
    totalQty,
  };
}

function boundedIdentity(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text ? text.slice(0, 160) : null;
}

function sameManifestIdentity(a, b) {
  return !!(a && b && a.manifestId === b.manifestId && a.freighterKey === b.freighterKey);
}

function validSavedCivilianAnnotation(annotation, manifest) {
  if (!annotation || annotation.recoveryKind !== RECOVERY_CIVILIAN_DISABLED || !manifest) return false;
  return boundedIdentity(annotation.manifestId) === manifest.manifestId
    && boundedIdentity(annotation.freighterKey) === manifest.freighterKey
    && Number.isInteger(annotation.startedTick) && annotation.startedTick >= 0
    && Number.isFinite(Number(annotation.deadlineAt)) && Number(annotation.deadlineAt) >= 0;
}

function civilianRecoveryId(manifestId, startedTick) {
  const tick = Math.max(0, Math.floor(Number(startedTick) || 0));
  return `civilian-recovery:${manifestId}:${tick}`;
}

function civilianReceipt(record, entity, now, outcome, extra = {}) {
  const manifest = record.manifest || civilianManifestFor(entity) || {
    manifestId: null, freighterKey: null, role: 'hauler', lines: [], totalQty: 0,
  };
  return {
    id: `${record.id}:${outcome}`,
    recoveryId: record.id,
    shape: 'civilian_freight_recovery',
    outcome,
    recoveryKind: RECOVERY_CIVILIAN_DISABLED,
    entityId: entity && entity.id != null ? entity.id : record.entityId,
    factionId: record.factionId || entity && entity.factionId || null,
    authorityFactionId: extra.authorityFactionId || record.authorityFactionId || null,
    stationId: extra.stationId || record.stationId || null,
    sectorId: record.sectorId || null,
    manifestId: manifest.manifestId,
    freighterKey: manifest.freighterKey,
    manifest: cloneManifest(manifest),
    remainingQty: manifest.totalQty,
    credits: outcome === 'recovered' ? record.rewardCr : 0,
    killerId: extra.killerId == null ? null : extra.killerId,
    startedTick: record.startedTick,
    startedAt: record.startedAt,
    deadlineAt: record.deadlineAt,
    securedAt: record.securedAt,
    t: now,
    text: civilianReceiptText(outcome),
  };
}

function cloneManifest(manifest) {
  return {
    manifestId: manifest.manifestId,
    freighterKey: manifest.freighterKey,
    role: manifest.role,
    lines: manifest.lines.map((line) => ({ commodityId: line.commodityId, qty: line.qty })),
    totalQty: manifest.totalQty,
  };
}

function civilianReceiptText(outcome) {
  if (outcome === 'recovered') return 'FREIGHT RECOVERED - civilian hull and remaining manifest transferred alive.';
  if (outcome === 'drive_restored') return 'FREIGHT RECOVERY CLOSED - civilian drive restored before transfer.';
  if (outcome === 'timed_out') return 'FREIGHT RECOVERY LOST - disabled civilian was not secured in time.';
  if (outcome === 'destroyed') return 'FREIGHT RECOVERY LOST - disabled civilian was destroyed.';
  if (outcome === 'sector_exit') return 'FREIGHT RECOVERY ABANDONED - pilot left the incident sector.';
  if (outcome === 'new_game' || outcome === 'game_started' || outcome === 'reset') {
    return 'FREIGHT RECOVERY ABANDONED - run boundary closed the incident.';
  }
  if (outcome === 'tether_broke') return 'FREIGHT RECOVERY ABANDONED - the Massline connection broke.';
  return 'FREIGHT RECOVERY ABANDONED - the Massline connection was released.';
}

function civilianLossInstruction(outcome) {
  if (outcome === 'drive_restored') return 'Drive restored; civilian recovery window closed.';
  if (outcome === 'timed_out') return 'Civilian recovery window expired without inventing escape thrust.';
  if (outcome === 'destroyed') return 'Civilian recovery failed; freighter destroyed.';
  if (outcome === 'sector_exit') return 'Civilian recovery abandoned on sector departure.';
  if (outcome === 'new_game' || outcome === 'game_started' || outcome === 'reset') return 'Civilian recovery closed at run reset.';
  if (outcome === 'identity_invalid') return 'Civilian manifest identity changed; recovery closed.';
  if (outcome === 'tether_broke') return 'Civilian recovery abandoned when the Massline broke.';
  return 'Civilian recovery abandoned when the Massline was released.';
}

function annotate(entity, record, instruction) {
  const data = entity.data || (entity.data = {});
  data.surrenderRecovery = {
    id: record.id,
    recoveryKind: record.recoveryKind,
    phase: record.phase,
    instruction,
    escapeAt: record.escapeAt,
    deadlineAt: record.deadlineAt,
    startedTick: record.startedTick,
    stationId: record.stationId || null,
    rewardCr: record.rewardCr,
    lostReason: record.lostReason || null,
    manifestId: record.manifest && record.manifest.manifestId || null,
    freighterKey: record.manifest && record.manifest.freighterKey || null,
    manifest: record.manifest ? cloneManifest(record.manifest) : null,
    ownedPersistent: record.ownedPersistent === true,
  };
}

function releaseOwnedPersistence(entity, record) {
  if (!entity || !record || record.ownedPersistent !== true) return false;
  record.ownedPersistent = false;
  const data = entity.data || {};
  if (data.surrenderRecovery && data.surrenderRecovery.id === record.id) {
    data.surrenderRecovery.ownedPersistent = false;
  }
  // Freight custody may have adopted the same live carrier after C opened its recovery. Its marker
  // is an explicit persistence handoff: keep the flag until that coordinator reaches a terminal
  // outcome, while relinquishing C's ownership immediately.
  if (data.freightCustodyPersistence && typeof data.freightCustodyPersistence === 'object') return false;
  if (!entity.flags) return false;
  delete entity.flags.persistent;
  return true;
}

function publicRecord(record, entity) {
  return {
    id: record.id,
    entityId: record.entityId,
    label: entity && entity.data && (entity.data.name || entity.data.shipName || entity.data.callsign)
      || (record.recoveryKind === RECOVERY_CIVILIAN_DISABLED
        ? 'Disabled civilian freighter'
        : record.recoveryKind === RECOVERY_DRIVE_DISABLED ? 'Disabled ship' : 'Surrendered ship'),
    recoveryKind: record.recoveryKind,
    phase: record.phase,
    reason: record.reason,
    rewardCr: record.rewardCr,
    escapeAt: record.escapeAt,
    deadlineAt: record.deadlineAt,
    manifestId: record.manifest && record.manifest.manifestId || null,
    freighterKey: record.manifest && record.manifest.freighterKey || null,
    remainingQty: record.manifest && record.manifest.totalQty || 0,
    secureReel_wu: SURRENDER_SECURE_REEL_WU,
    instruction: entity && entity.data && entity.data.surrenderRecovery && entity.data.surrenderRecovery.instruction || null,
    lostReason: record.lostReason || null,
  };
}

function initialInstruction(record) {
  if (record.phase === 'secured') {
    return 'Custody lock secure. Tow this hull into a lawful station ring.';
  }
  if (record.phase === 'tethered') {
    return 'Hold massline reel until the custody lock engages.';
  }
  if (record.recoveryKind === RECOVERY_CIVILIAN_DISABLED) {
    return 'Civilian drive disabled. Latch with massline. Reel inside 60. Tow the manifest to lawful cover.';
  }
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
