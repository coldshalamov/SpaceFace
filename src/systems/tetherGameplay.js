// Tether gameplay system (GDD 2.0 §4.3, BUILD_PLAN WS-D1).
// Consumes the locked input action contract and wires the existing SG-03/SG-02 attachment
// service into player flight. SG-02 owns momentum exchange; this system only targets,
// reels, cuts, and emits player-facing gameplay events.
//
// T04/PQ-004: latch eligibility and the visible pre-latch receipt consume the existing T03 scorer.
// Obstruction remains caller-resolved: a physics/terrain owner may provide isMasslineObstructed;
// selection then fails closed and publishes the same blocked reason the latch will consume.
import {
  classifyMasslineIntent,
  rankMasslineTargets,
  stabilizeMasslineSelection,
} from '../combat/masslineTargetScoring.js';
import { automaticMasslineBreakAllowed } from '../combat/attachments.js';
import { queryNearbyEntities } from '../core/spatialQuery.js';
import { isHostileToPlayer } from './scanner.js';
import { massline2Flag } from '../data/featureFlags.js';
import { isMassSeedTetherEligible } from './massSeed.js';

const TETHER_DEF_ID = 'tether_standard';
const STRAIN_EVENT_INTERVAL_S = 0.2;
const RELATCH_COOLDOWN_S = 0.25;   // after cut/break — prevents same-press ghost re-latches
const TAP_CUT_DELAY_S = 0.22;       // legacy direct-action path: hold becomes reel, tap becomes cut
const CAPTURE_SLACK_S = 0.1;
const STRETCH_EPSILON = 0.05;
// Overnight B1: soft latch was pixel-tight at combat speed. Base grace is generous; Flyby Focus
// multiplies further via latchGraceScale(state). Exported for check:overnight:playable.
export const CURSOR_LATCH_GRACE = 36;
export const CURSOR_LATCH_GRACE_MAX = 96;
export const AIM_RAY_GRACE = 22;
export const AIM_RAY_GRACE_MAX = 64;
const ACQUISITION_REFRESH_S = 0.08;
const ACQUISITION_VALID_S = 0.28;
const INTENT_HISTORY_S = 0.28;
const STRONG_TURN_THRESHOLD = 0.42;
const PRECISE_CURSOR_RADIUS = 28;
const SLINGSHOT_STATE_S = 1.0;
const SLINGSHOT_SPEED_MULT = 1.4;
// Presentation load (massline rung 04): phase floors so the cable reads "working" the moment the
// phase says so, even while the physical rating ratio (strain) is still low. strain*2.5 lets real
// tension overtake the floor. tether.load is presentation-only — tether.strain stays the untouched
// physical ratio, while tether.automaticBreakAllowed carries the attachment authority's canonical
// answer about whether that ratio can actually culminate in automatic failure.
const LOAD_STRAIN_GAIN = 2.5;
const LOAD_BASE_BY_PHASE = Object.freeze({ slack: 0, capture: 0.35, loaded: 0.55, overload: 0.9 });
// Authored payloads and loose pickups are sensor bodies: they intentionally do not collide, so the
// collidable-only spatial hash cannot be their sole acquisition source.
const NON_COLLIDING_ACQUISITION_TYPES = new Set(['payload', 'pickup']);
const TRANSIENT_NON_TETHERABLE_TYPES = new Set(['projectile', 'fx']);
const TOW_TARGET_COM_TYPES = new Set(['wreck', 'ship', 'drone', 'payload', 'pickup']);
const LINE_CONTROL_DENIAL_COPY = Object.freeze({
  load_limit: 'line load too high',
  minimum_length: 'minimum line length reached',
  maximum_length: 'maximum line length reached',
  reel_unavailable: 'winch unavailable',
  attachment_missing: 'line no longer attached',
});
const NO_REEL_RESULT = Object.freeze({ changed: false, reason: null, attachment: null });

export const tetherGameplay = {
  id: 'tetherGameplay',
  name: 'tetherGameplay',

  init(ctx) {
    for (const unsubscribe of this._acquisitionUnsubs || []) unsubscribe();
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
    this.registry = ctx.registry;
    this._targetScratch = [];
    this._nonCollidingTargetScratch = [];
    this._active = null;
    this._lastStrainT = -Infinity;
    this._noRelatchUntil = -Infinity;
    this._pendingCut = null;
    this._ignoreReleaseCutUntilReelIdle = false;
    this._latchGraceUntil = 0;
    this._reelStrength = 0;
    this._lastLineControlDenial = null;
    this._lastLatchDenial = null;
    this._resetAcquisitionRuntime(this.state);
    const resetAcquisition = () => this._resetAcquisitionRuntime(this.state);
    this._acquisitionUnsubs = typeof this.bus?.on === 'function'
      ? [this.bus.on('save:loaded', resetAcquisition), this.bus.on('game:started', resetAcquisition)]
      : [];
    this._resetPhaseMirror();
  },

  update(dt, state) {
    this._tickSlingshotState(state, dt);
    if (state.mode !== 'flight') { this._resetGestureState(); this._resetPhaseMirror(); this._mirror(state, null, 0); this._clearAcquisitionPreview(state); return; }
    const player = state.entities && state.entities.get ? state.entities.get(state.playerId) : null;
    if (!player || !player.alive || (player.flags && player.flags.docked)) { this._resetGestureState(); this._resetPhaseMirror(); this._mirror(state, null, 0); this._clearAcquisitionPreview(state); return; }

    const kernel = combatKernel(this);
    const attachments = kernel && kernel.attachments;
    if (!attachments) {
      // Readable failure: missing attachment authority must not swallow a latch press silently.
      if (state.input?.actions?.tetherFire) {
        this.bus.emit('tether:latchDenied', { reason: 'attachment_authority_unavailable' });
      }
      this._clearAcquisitionPreview(state);
      return;
    }

    this._reconcileActive(attachments, state);
    this._adoptExisting(attachments, state);
    const actions = state.input?.actions;
    const now = Number.isFinite(state.simTime) ? state.simTime : state.tick / 60;
    const masslineCommand = actions && actions.massline;
    const lineLengthCommand = masslineCommand && masslineCommand.lineControl
      ? finite(masslineCommand.lineLength, 0)
      : finite(actions && actions.reelDelta, 0);
    const reelHeld = lineLengthCommand < 0;

    // The normalized input grammar has already resolved tap vs hold. Execute its cut in this same
    // tether tick; the legacy pending-cut path below remains for old tapes/direct harnesses.
    if (this._active && masslineCommand && masslineCommand.cut) {
      this._cutActive(attachments, state, player, now);
      return;
    }

    // After latch, ignore tap-to-cut until the player has held to reel or a short grace expires —
    // otherwise latch → release → press-again to winch reads as a cut on release.
    if (this._ignoreReleaseCutUntilReelIdle) {
      if (reelHeld) this._ignoreReleaseCutUntilReelIdle = false;
      else if (this._latchGraceUntil > 0 && now >= this._latchGraceUntil) this._ignoreReleaseCutUntilReelIdle = false;
    }

    if (this._active && !this._pendingCut && !this._ignoreReleaseCutUntilReelIdle && actions?.tetherCut) {
      this._pendingCut = {
        attachmentId: this._active.attachmentId,
        targetId: this._active.targetId,
        requestedAt: now,
        firstTick: state.tick,
      };
    }

    if (this._active && this._pendingCut) {
      const releasedAfterPress = !reelHeld && state.tick !== this._pendingCut.firstTick;
      const heldLongEnough = now - this._pendingCut.requestedAt >= TAP_CUT_DELAY_S;
      if (releasedAfterPress) {
        const targetId = this._active.targetId;
        const cutPayload = this._cutPayload(state, player, targetId);
        const result = attachments.cut(this._active.attachmentId, player.id, 'tether_cut');
        // attachment_missing = the orphan sweep already broke it (target died) and reconcile
        // emitted the event — only emit released on a cut WE performed.
        if (result && result.ok) {
          if (cutPayload.slingshot) this._grantSlingshotState(state, SLINGSHOT_STATE_S);
          this.bus.emit('tether:cut', cutPayload);
          this.bus.emit('tether:released', { targetId });
          this.bus.emit('tether:releaseRated', rateRelease(state, targetId));
        }
        this._active = null;
        this._pendingCut = null;
        this._noRelatchUntil = now + RELATCH_COOLDOWN_S;
        this._resetPhaseMirror();
        this._mirror(state, null, 0);
        return;
      }
      // Legacy held-action reel intent cancels pending cut once the tap window expires so release
      // does not cut. Reeling itself is never blocked by pendingCut (see _reelActive below).
      if (reelHeld && heldLongEnough) {
        this._pendingCut = null;
      }
    }

    if (this._active) {
      this._clearAcquisitionPreview(state);
      // Liveness belt-and-braces on the gameplay side: if the target vanished this tick and the
      // service sweep hasn't caught it yet, force the cut ourselves rather than orbit a ghost.
      const target = state.entities.get(this._active.targetId);
      if (!target || target.alive === false) {
        attachments.cut(this._active.attachmentId, player.id, 'target_lost');
        this.bus.emit('tether:broke', { targetId: this._active.targetId });
        this.bus.emit('tether:releaseRated', rateRelease(state, this._active.targetId));
        this._active = null;
        this._pendingCut = null;
        this._ignoreReleaseCutUntilReelIdle = false;
        this._noRelatchUntil = now + RELATCH_COOLDOWN_S;
        this._resetPhaseMirror();
        this._mirror(state, null, 0);
        return;
      }
      const reelResult = lineLengthCommand === 0
        ? NO_REEL_RESULT
        : this._reelActive(attachments, lineLengthCommand, dt, state, player, target);
      this._updateReelStrength(reelHeld, reelResult.changed, dt);
      if (lineLengthCommand !== 0 && !reelResult.changed && reelResult.reason) {
        this._emitLineControlDenied(state, reelResult.reason, lineLengthCommand, reelResult.attachment);
      } else if (lineLengthCommand === 0 || reelResult.changed) {
        this._lastLineControlDenial = null;
      }
      this._emitStrain(attachments, state);
      const att = attachments.get(this._active.attachmentId);
      const phase = this._phaseFor(state, att, dt, this._lastStrainRatio || 0);
      const attDef = attachmentDef(kernel, att && att.defId || this._active.type);
      const automaticBreakAllowed = !!(att && attDef
        && automaticMasslineBreakAllowed(attDef, player, target));
      this._mirror(
        state,
        this._active.targetId,
        this._lastStrainRatio || 0,
        att ? att.restLength : 0,
        phase,
        masslineCommand,
        lineLengthCommand,
        automaticBreakAllowed,
        att && att.tetherPolicy && att.tetherPolicy.headId,
      );
      return;
    }

    this._reelStrength = 0;
    this._resetPhaseMirror();
    this._mirror(state, null, 0);
    const wantsLatch = !!(actions && actions.tetherFire);
    const snareHeadActive = player.data?.derived?.masslineHeadId === 'transverse_snare'
      && massline2Flag('masslineHeadTransverseSnare', state.runtime && state.runtime.features);
    const remoteSnareActive = state.player?.remoteMassline?.active
      && state.player.remoteMassline.kind === 'transverse_snare';
    if (snareHeadActive || remoteSnareActive) {
      // A Transverse Snare press is a separate world-to-world transaction. Do not let it fall
      // through and also create the ordinary player-to-target line. The snare owner consumes the
      // same normalized latch/cut command but never receives reel, thrust, facing, or brake input.
      this._clearAcquisitionPreview(state);
      const snare = this.helpers && this.helpers.masslineSnares;
      if (snare && typeof snare.handleInput === 'function') {
        snare.handleInput({ state, player, wantsLatch, masslineCommand });
      } else if (wantsLatch || (masslineCommand && masslineCommand.cut)) {
        this.bus.emit('tether:latchDenied', { reason: 'snare_authority_unavailable' });
      }
      return;
    }
    if (this.helpers?.masslineSnares?.clearPreview) this.helpers.masslineSnares.clearPreview();
    const def = attachmentDef(kernel, TETHER_DEF_ID);
    // Ctrl-nearest (src/systems/input.js:1074) is an explicit manual override of the scored pick:
    // "not that one — the one I am closest to". It bypasses the receipt entirely, so it must not
    // publish or consume one either.
    const nearestOnly = state.input?.tetherMode === 'nearest';
    // PHYSICAL_PLAY_GRAMMAR §7.1: the candidate is published EVERY tick, pressed or not — "you can
    // see what the Massline will grab before you press, and it updates as you move". The press then
    // consumes exactly the receipt the HUD last rendered, which is the only reason the highlight
    // cannot lie: preview and latch read the same record.
    //
    // "LAST RENDERED" IS LITERAL, AND THE PRESS TICK MUST NOT REBUILD IT.
    // masslineHud sits at index 91 of PRODUCTION_UPDATE_ORDER and this system at 39, so the receipt
    // standing here at the top of tick N is the record that was on screen at the end of tick N-1 —
    // the one the player was looking at when they pressed. Forcing a refresh on the press tick (the
    // old `force = wantsLatch`) rebuilt it first: _refreshAcquisitionPreview skips its 0.08s
    // throttle on force AND on intent.reversed, and a reversal also sets forceSwitch:true, which
    // bypasses the Schmitt hysteresis outright (masslineTargetScoring.js stabilizeMasslineSelection).
    // So the ordinary "swing the other way and grab" latched a body that had never been drawn, and
    // previewMatched could not report it because it compared the rebuild against itself.
    //
    // The press therefore consumes the STANDING receipt. It is rebuilt only when there is nothing
    // on screen to contradict: no receipt at all (cold press — first flight tick, or the tick after
    // a save/new-game reset), a receipt this system did not publish on the immediately preceding
    // tick (so no frame rendered it), or one that has outlived ACQUISITION_VALID_S. The staleness
    // this buys is one frame, and it is paid for below: _consumeAcquisitionReceipt re-checks
    // validUntil and then re-runs validateAcquisitionTarget, so a previewed body that died, left
    // range, or became obstructed between publish and press DENIES instead of latching.
    const tickNow = Math.trunc(finite(state.tick));
    const publishedReceipt = nearestOnly ? null : (state.masslineAcquisition || null);
    const publishedTargetId = publishedReceipt && publishedReceipt.selected
      ? publishedReceipt.selected.targetId
      : null;
    const standingWasRendered = !!publishedReceipt
      && this._lastPreviewTick === tickNow - 1
      && publishedReceipt.validUntil >= now;
    if (!def || nearestOnly) {
      this._clearAcquisitionPreview(state);
    } else {
      if (!wantsLatch || !standingWasRendered) {
        this._refreshAcquisitionPreview(player, def, state, now, !standingWasRendered);
      }
      // Whatever stands now is what masslineHud renders at the end of THIS tick, refreshed or not.
      this._lastPreviewTick = tickNow;
    }
    if (!wantsLatch) return;
    // Readable failure reasons (T04): never fail latch silently. The ORDER below is load-bearing —
    // cooldown outranks a missing def (pinned by T04 §3 in test/tether-latch-eligibility.test.mjs).
    if (now < this._noRelatchUntil) {
      this.bus.emit('tether:latchDenied', { reason: 'cooldown' });
      return;
    }
    if (!def) {
      // Attachment authority's established reason when the def is absent from the catalog.
      this.bus.emit('tether:latchDenied', { reason: 'unknown_attachment_def' });
      return;
    }
    this._lastLatchDenial = null;
    const latch = nearestOnly
      ? this._acquireCommandTarget(player, def, state)
      : this._consumeAcquisitionReceipt(player, def, state, now);
    const target = latch && latch.entity;
    if (!target) {
      const denial = this._lastLatchDenial || { reason: 'no-target' };
      this.bus.emit('tether:latchDenied', denial);
      return;
    }

    // The line always leaves the player's center of mass. A physical constraint attached to a
    // nose socket applies steering torque by itself, which makes latching silently take over yaw.
    const attachWorlds = contextualAttachmentWorlds(player, target, latch.targetWorld);
    const result = attachments.create({
      defId: TETHER_DEF_ID,
      ownerId: player.id,
      targetId: target.id,
      ...attachWorlds,
    });
    if (!result || !result.ok || !result.attachment) {
      // Passthrough of the attachment authority's existing result.reason (e.g. owner_attachment_limit).
      this.bus.emit('tether:latchDenied', {
        reason: (result && result.reason) || 'create_failed',
        targetId: target.id,
      });
      return;
    }

    this._active = {
      attachmentId: result.attachment.id,
      targetId: target.id,
      type: TETHER_DEF_ID,
    };
    this._resetPhaseMirror();
    this._lastStrainT = -Infinity;
    this._ignoreReleaseCutUntilReelIdle = true;
    this._latchGraceUntil = now + 0.55;
    // Truthfulness receipt: the latch reports WHICH rendered candidate it consumed, so a mismatch
    // between what the player saw and what they got is observable rather than a bug report.
    const selectionReceipt = nearestOnly ? null : state.masslineAcquisition;
    const selectedEntry = selectionReceipt && selectionReceipt.selected;
    this.bus.emit('tether:latched', {
      targetId: target.id,
      type: TETHER_DEF_ID,
      selectionReceiptId: (selectionReceipt && selectionReceipt.id) || null,
      context: (selectedEntry && selectedEntry.context)
        || (state.player?.targetId === target.id ? 'selected' : 'nearby'),
      // TRUTHFUL BY CONSTRUCTION. publishedTargetId was read at the TOP of this tick, before the
      // refresh decision above, so it is the candidate the previous frame actually drew — not the
      // receipt this tick built compared against itself, which is what made the old expression
      // structurally incapable of ever reporting false. If a press-tick rebuild is ever
      // reintroduced, this goes false and check-tether-gameplay.mjs / tether-latch-eligibility
      // catch it. A cold or expired receipt has no published candidate to contradict (nothing was
      // on screen), and reports the record it built and consumed in the same tick.
      previewMatched: !!(selectedEntry && selectedEntry.targetId === target.id)
        && (publishedTargetId == null || publishedTargetId === target.id),
    });
    this.bus.emit('camera:shake', { amount: 0.06 });
    // The consumed receipt deliberately SURVIVES this tick. state.player.tether was mirrored
    // inactive earlier in this same tick, so neither the cable nor a stale preview is drawn yet —
    // the latch completes visually on the next frame, where the _active branch above clears the
    // receipt. Keeping it here is what lets a reader (and the live truthfulness probes) compare the
    // rendered candidate against the attachment that was actually created.
  },

  _refreshAcquisitionPreview(player, def, state, now, force = false) {
    const intent = rememberAcquisitionIntent(this, state, player, now);
    if (!force && !intent.reversed && now - this._lastAcquisitionRefreshT < ACQUISITION_REFRESH_S) {
      return state.masslineAcquisition || null;
    }
    this._lastAcquisitionRefreshT = now;
    const snapshot = buildAcquisitionSnapshot(this, player, def, state, intent);
    if (!snapshot.ranked.length) {
      this._acquisitionMemory = null;
      state.masslineAcquisition = emptyAcquisitionReceipt(this, state, now, snapshot.denial || 'no-target');
      return state.masslineAcquisition;
    }

    const stable = stabilizeMasslineSelection(
      snapshot.ranked,
      this._acquisitionMemory,
      now,
      {
        forceId: snapshot.context.forceId,
        forceSwitch: intent.reversed,
      },
    );
    this._acquisitionMemory = stable.memory;
    state.masslineAcquisition = buildAcquisitionReceipt(
      this,
      state,
      now,
      snapshot,
      stable.selected,
      now < this._noRelatchUntil ? 'cooldown' : null,
    );
    return state.masslineAcquisition;
  },

  _consumeAcquisitionReceipt(player, def, state, now) {
    const receipt = state.masslineAcquisition;
    const selected = receipt && receipt.selected;
    if (!selected) {
      this._lastLatchDenial = { reason: receipt?.reason || 'no-target' };
      return null;
    }
    if (!(receipt.validUntil >= now)) {
      this._lastLatchDenial = { reason: 'preview-stale', targetId: selected.targetId };
      invalidateAcquisitionReceipt(state, 'preview-stale');
      return null;
    }
    if (selected.status !== 'ready') {
      this._lastLatchDenial = { reason: selected.reason || selected.status, targetId: selected.targetId };
      return null;
    }

    const target = state.entities && state.entities.get ? state.entities.get(selected.targetId) : null;
    const denial = validateAcquisitionTarget(this, player, target, def, state);
    if (denial) {
      this._lastLatchDenial = { reason: denial, targetId: selected.targetId };
      invalidateAcquisitionReceipt(state, denial);
      return null;
    }
    return { entity: target, targetWorld: surfacePointToward(target, player.pos) };
  },

  // Ctrl-nearest ONLY (state.input.tetherMode === 'nearest'). The default press consumes the scored
  // receipt via _consumeAcquisitionReceipt; this is the deliberate manual escape hatch, so it stays
  // pure geometry with no scoring, no intent, and no hysteresis.
  _acquireCommandTarget(player, def, state) {
    const maxLength = positive(def && def.maxLength, positive(def && def.break && def.break.maxLength, 390));
    const focus = state.player?.flybyFocus;
    if (focus?.active && focus.targetId != null) {
      const focusTarget = state.entities?.get ? state.entities.get(focus.targetId) : null;
      if (!isAuthorizedFocusTarget(state, player, focusTarget)) {
        this._lastLatchDenial = { reason: 'no-target', targetId: focus.targetId, maxLength };
        return null;
      }
    }
    const nearestOnly = state.input?.tetherMode === 'nearest';
    const selectedId = state.player && state.player.targetId;
    const selected = selectedId != null && state.entities?.get ? state.entities.get(selectedId) : null;
    const selectedDenial = validateAcquisitionTarget(this, player, selected, def, state);
    if (!nearestOnly && selected && !selectedDenial) {
      return { entity: selected, targetWorld: surfacePointToward(selected, player.pos) };
    }

    const entities = state.entityList || (state.entities?.values ? Array.from(state.entities.values()) : []);
    let nearest = null;
    let nearestSurfaceDistance = Infinity;
    for (const entity of entities) {
      if (!isAttachable(entity, player.id)) continue;
      if (validateAcquisitionTarget(this, player, entity, def, state)) continue;
      const centerDistance = Math.hypot(entity.pos.x - player.pos.x, entity.pos.z - player.pos.z);
      const surfaceDistance = Math.max(0, centerDistance - Math.max(0, finite(entity.radius)));
      if (surfaceDistance < nearestSurfaceDistance
          || (surfaceDistance === nearestSurfaceDistance && compareEntityIds(entity, nearest) < 0)) {
        nearest = entity;
        nearestSurfaceDistance = surfaceDistance;
      }
    }
    if (!nearest) {
      this._lastLatchDenial = {
        reason: selectedDenial && selected ? selectedDenial : 'no-target',
        targetId: selected && selected.id,
        maxLength,
      };
      return null;
    }
    return { entity: nearest, targetWorld: surfacePointToward(nearest, player.pos) };
  },

  _clearAcquisitionPreview(state) {
    if (state && state.masslineAcquisition) state.masslineAcquisition = null;
    this._acquisitionMemory = null;
    this._lastAcquisitionRefreshT = -Infinity;
    // Nothing stands, so nothing was rendered: the next press is a cold press and must rebuild.
    this._lastPreviewTick = null;
  },

  _resetAcquisitionRuntime(state) {
    if (state) state.masslineAcquisition = null;
    this._acquisitionMemory = null;
    this._acquisitionReceiptSeq = 0;
    this._lastAcquisitionRefreshT = -Infinity;
    this._lastPreviewTick = null;
    this._recentIntent = { turn: 0, moveX: 0, moveZ: 0, at: -Infinity };
    this._lastStrongTurn = { sign: 0, at: -Infinity };
  },

  // Compatibility/test entrypoint. The live update path consumes the continuously visible receipt;
  // direct callers get the same contextual ranking in a one-shot receipt, never a weapon lock.
  _acquireTarget(player, def, state) {
    const now = Number.isFinite(state && state.simTime) ? state.simTime : finite(state && state.tick) / 60;
    this._targetScratch = this._targetScratch || [];
    this._nonCollidingTargetScratch = this._nonCollidingTargetScratch || [];
    this._recentIntent = this._recentIntent || { turn: 0, moveX: 0, moveZ: 0, at: -Infinity };
    this._lastStrongTurn = this._lastStrongTurn || { sign: 0, at: -Infinity };
    const intent = rememberAcquisitionIntent(this, state, player, now);
    const snapshot = buildAcquisitionSnapshot(this, player, def, state, intent);
    if (!snapshot.ranked.length) {
      this._lastLatchDenial = { reason: snapshot.denial || 'no-target' };
      return null;
    }
    const stable = stabilizeMasslineSelection(snapshot.ranked, null, now, {
      forceId: snapshot.context.forceId,
      forceSwitch: true,
    });
    const selected = stable.selected;
    const target = selected && snapshot.byId.get(selected.id);
    const denial = validateAcquisitionTarget(this, player, target, def, state);
    if (denial) {
      this._lastLatchDenial = { reason: denial, targetId: selected && selected.id };
      return null;
    }
    return { entity: target, targetWorld: surfacePointToward(target, player.pos) };
  },

  // Adopt a player-owned active tether we aren't tracking: after save-reload (this._active is
  // system-private and does not persist) or when a scenario script created the attachment. Keeps
  // the mirror/HUD/cable deterministic across reloads — without this, an uninterrupted run and a
  // reloaded run disagree about state.player.tether and the replay hash diverges.
  _adoptExisting(attachments, state) {
    if (this._active || typeof attachments.listForEntity !== 'function') return;
    const owned = attachments.listForEntity(state.playerId, true);
    for (const attachment of owned) {
      if (attachment.ownerId !== state.playerId) continue;
      this._active = {
        attachmentId: attachment.id,
        targetId: attachment.targetId,
        type: attachment.defId,
      };
      this._resetPhaseMirror();
      this._lastStrainT = -Infinity;
      return;
    }
  },

  _reconcileActive(attachments, state) {
    if (!this._active) return;
    const attachment = attachments.get(this._active.attachmentId);
    if (attachment && attachment.state === 'active') return;
    const targetId = this._active.targetId;
    const reason = attachment && attachment.breakReason;
    this._active = null;
    this._pendingCut = null;
    const now = Number.isFinite(state.simTime) ? state.simTime : state.tick / 60;
    this._noRelatchUntil = now + RELATCH_COOLDOWN_S;
    if (reason === 'tether_cut') {
      this.bus.emit('tether:released', { targetId });
      this.bus.emit('tether:releaseRated', rateRelease(state, targetId));
    } else {
      this.bus.emit('tether:broke', { targetId });
      this.bus.emit('tether:releaseRated', rateRelease(state, targetId));
    }
    this._lastStrainT = -Infinity;
    this._resetPhaseMirror();
  },

  _reelActive(attachments, reelDelta, dt, state, player, target) {
    if (!this._active || !Number.isFinite(reelDelta) || reelDelta === 0) return { changed: false, reason: null, attachment: null };
    const attachment = attachments.get(this._active.attachmentId);
    if (!attachment || attachment.state !== 'active') return { changed: false, reason: 'attachment_missing', attachment };
    const kernel = combatKernel(this);
    const def = attachmentDef(kernel, attachment.defId);
    if (!def) return { changed: false, reason: 'unknown_attachment_def', attachment };

    const policy = typeof attachments.reelPolicy === 'function' ? attachments.reelPolicy(attachment.id) : null;
    const reelRate = policy && Number.isFinite(policy.reelRate) ? policy.reelRate : def.reelRate;
    const maxStep = positive(reelRate, 0) * Math.max(0, Number(dt) || 0);
    if (!(maxStep > 0)) return { changed: false, reason: 'reel_unavailable', attachment };
    const requested = clamp(reelDelta, -maxStep, maxStep);
    const minLength = positive(def.minLength, 0);
    const maxLength = positive(def.maxLength, Infinity);
    const before = attachment.restLength || 0;

    // An explicitly breakable extreme-load operation protects its line by denying further reel-in
    // near the physical ceiling; paying out remains available. An ordinary standard Massline does
    // not auto-break, so its nominal rating must never create a fictitious reel-in failure.
    const breakPolicy = policy && policy.break;
    const maxTension = positive(breakPolicy && breakPolicy.maxTension, Infinity);
    const automaticBreakAllowed = automaticMasslineBreakAllowed(def, player, target);
    if (automaticBreakAllowed
        && requested < 0
        && Number.isFinite(maxTension)
        && finite(attachment.lastTension, 0) >= maxTension * 0.9) {
      return { changed: false, reason: 'load_limit', attachment, before, after: before };
    }

    const next = clamp(before + requested, minLength, maxLength);
    const delta = next - before;
    if (Math.abs(delta) <= 1e-6) {
      return {
        changed: false,
        reason: requested < 0 ? 'minimum_length' : 'maximum_length',
        attachment,
        before,
        after: before,
      };
    }
    const result = attachments.reel(attachment.id, delta, minLength);
    if (!result || !result.ok) {
      return { changed: false, reason: result && result.reason || 'reel_rejected', attachment, before, after: before };
    }
    const after = result.attachment && result.attachment.restLength;
    return {
      changed: Number.isFinite(after) && Math.abs(after - before) > 1e-6,
      reason: null,
      attachment: result.attachment || attachment,
      before,
      after: Number.isFinite(after) ? after : before,
    };
  },

  _emitLineControlDenied(state, reason, lineLengthCommand, attachment) {
    const direction = lineLengthCommand < 0 ? 'reel_in' : 'pay_out';
    const key = `${attachment && attachment.id || 'missing'}:${direction}:${reason}`;
    if (this._lastLineControlDenial === key) return;
    this._lastLineControlDenial = key;
    this.bus.emit('tether:lineControlDenied', {
      actorId: state.playerId,
      targetId: this._active && this._active.targetId,
      attachmentId: attachment && attachment.id || this._active && this._active.attachmentId,
      direction,
      reason,
    });
    const verb = direction === 'reel_in' ? 'reel-in' : 'pay-out';
    this.bus.emit('toast', {
      text: `Massline ${verb} blocked: ${LINE_CONTROL_DENIAL_COPY[reason] || String(reason).replaceAll('_', ' ')}`,
      kind: 'warn',
      ttl: 2,
    });
  },

  _updateReelStrength(reelHeld, reeled, dt) {
    const step = Math.max(0, Number(dt) || 0);
    const target = reelHeld ? (reeled ? 1 : 0.42) : 0;
    const rate = target > this._reelStrength ? 9 : 5;
    this._reelStrength += (target - this._reelStrength) * (1 - Math.exp(-rate * step));
    if (!reelHeld && this._reelStrength < 0.01) this._reelStrength = 0;
  },

  _emitStrain(attachments, state) {
    if (!this._active) return;
    const now = Number.isFinite(state.simTime) ? state.simTime : state.tick / 60;
    if (now - this._lastStrainT < STRAIN_EVENT_INTERVAL_S) return;
    const attachment = attachments.get(this._active.attachmentId);
    if (!attachment || attachment.state !== 'active') return;
    const kernel = combatKernel(this);
    const def = attachmentDef(kernel, attachment.defId);
    const policy = typeof attachments.breakPolicy === 'function' ? attachments.breakPolicy(attachment.id) : null;
    const threshold = positive(
      (policy && policy.maxTension) || (def && (def.breakTension || (def.break && def.break.maxTension))),
      0,
    );
    if (!(threshold > 0)) return;
    // SCALE WARNING — read before "fixing" this ratio.
    //
    // strain is normalized against the attachment's break rating, and for tether_standard that
    // rating is breakTension = 10500000 (src/data/combatDefs.js) because the Massline is
    // deliberately near-unbreakable. The consequence is that strain is a very small number in
    // ordinary play: measured with scripts/probe-tether-visual-drive.mjs (640-mass asteroid
    // latched, full main thrust opposing the line for 240 ticks, line HELD) it peaked at ~1e-4,
    // roughly four orders of magnitude below any 0..1 threshold you would naively key off it.
    // That is CORRECT — it is an honest physical ratio against an enormous envelope, not a bug.
    //
    // So: do not rescale it to make a visual or a HUD bar move. Presentation consumers use
    // tether.load / tether.phase (see computeTetherLoad below), which are built for that job.
    // If this scale is ever changed, every threshold keyed to strain must be revisited in the same
    // pass — at minimum src/render/vfx.js _updateTetherCable and src/ui/hud.js:423-425.
    const ratio = Math.max(0, finite(attachment.lastTension) / threshold);
    this._lastStrainT = now;
    this._lastStrainRatio = ratio;
    this.bus.emit('tether:strain', { ratio });
  },

  _phaseFor(state, attachment, dt, strain) {
    if (!attachment || attachment.state !== 'active') return 'slack';
    const telemetry = attachmentTelemetry(this.helpers, attachment, state);
    if (telemetry && telemetry.phase) return normalizePhase(telemetry.phase);

    const player = state.entities && state.entities.get ? state.entities.get(state.playerId) : null;
    const target = state.entities && state.entities.get ? state.entities.get(attachment.targetId) : null;
    if (!player || !target || !player.pos || !target.pos) return strain >= 0.75 ? 'overload' : 'loaded';

    const restLength = positive(attachment.restLength, 0);
    const distance = Math.hypot(target.pos.x - player.pos.x, target.pos.z - player.pos.z);
    const stretch = Math.max(0, distance - restLength);
    const phase = this._phaseMirror || (this._phaseMirror = createPhaseMirror());
    const step = Math.max(0, Number(dt) || 0);
    if (!(stretch > STRETCH_EPSILON)) {
      phase.slackS += step;
      phase.captureT = 0;
      phase.captureActive = false;
      phase.wasTaut = false;
      return 'slack';
    }

    if (!phase.wasTaut && phase.slackS >= CAPTURE_SLACK_S) {
      phase.captureActive = true;
      phase.captureT = 0;
    }
    phase.wasTaut = true;
    phase.slackS = 0;
    const def = attachmentDef(combatKernel(this), attachment.defId);
    const captureS = positive(def && def.spring && def.spring.captureS, 0.35);
    if (phase.captureActive && phase.captureT < captureS) {
      phase.captureT += step;
      if (phase.captureT >= captureS) phase.captureActive = false;
      return 'capture';
    }
    return strain >= 0.75 ? 'overload' : 'loaded';
  },

  _resetPhaseMirror() {
    this._phaseMirror = createPhaseMirror();
  },

  _resetGestureState() {
    this._pendingCut = null;
    this._ignoreReleaseCutUntilReelIdle = false;
    this._latchGraceUntil = 0;
    this._lastLineControlDenial = null;
  },

  _cutActive(attachments, state, player, now) {
    if (!this._active) return false;
    const targetId = this._active.targetId;
    const cutPayload = this._cutPayload(state, player, targetId);
    const result = attachments.cut(this._active.attachmentId, player.id, 'tether_cut');
    if (result && result.ok) {
      if (cutPayload.slingshot) this._grantSlingshotState(state, SLINGSHOT_STATE_S);
      this.bus.emit('tether:cut', cutPayload);
      this.bus.emit('tether:released', { targetId });
      this.bus.emit('tether:releaseRated', rateRelease(state, targetId));
    }
    this._active = null;
    this._pendingCut = null;
    this._ignoreReleaseCutUntilReelIdle = false;
    this._lastLineControlDenial = null;
    this._noRelatchUntil = now + RELATCH_COOLDOWN_S;
    this._resetPhaseMirror();
    this._mirror(state, null, 0);
    return !!(result && result.ok);
  },

  _tickSlingshotState(state, dt) {
    const t = state && state.player && state.player.tether;
    if (!t) return;
    const next = Math.max(0, finite(t.slingshotT, 0) - Math.max(0, finite(dt, 0)));
    t.slingshotT = next;
    t.slingshot = next > 0;
  },

  _grantSlingshotState(state, seconds) {
    const player = state.player || (state.player = {});
    const t = player.tether || (player.tether = { active: false, targetId: null, strain: 0, load: 0, attachmentId: null, restLength: 0, phase: 'slack' });
    t.slingshotT = Math.max(finite(t.slingshotT, 0), positive(seconds, SLINGSHOT_STATE_S));
    t.slingshot = t.slingshotT > 0;
  },

  _cutPayload(state, player, targetId) {
    const vx = finite(player && player.vel && player.vel.x, 0);
    const vz = finite(player && player.vel && player.vel.z, 0);
    const speed = Math.hypot(vx, vz);
    const maxSpeed = positive(player && player.maxSpeed, 120);
    return {
      targetId,
      velocity: { x: vx, z: vz },
      speed,
      slingshot: speed >= maxSpeed * SLINGSHOT_SPEED_MULT,
    };
  },

  // Mirror the tether state onto state.player.tether for HUD/VFX consumers (single-owner rule:
  // they read, we write). null targetId = no tether. restLength lets the cable visual compute
  // real slack (restLength - distance) instead of guessing from strain.
  _mirror(
    state,
    targetId,
    strain,
    restLength = 0,
    phase = 'slack',
    command = null,
    lineLengthCommand = 0,
    automaticBreakAllowed = false,
    headId = null,
  ) {
    const player = state.player || (state.player = {});
    const t = player.tether || (player.tether = { active: false, targetId: null, strain: 0, load: 0, attachmentId: null, restLength: 0, phase: 'slack' });
    t.active = targetId != null;
    t.targetId = targetId;
    t.strain = strain || 0;
    t.restLength = restLength || 0;
    t.phase = t.active ? normalizePhase(phase) : 'slack';
    t.load = t.active ? computeTetherLoad(t.phase, t.strain) : 0;
    t.attachmentId = this._active ? this._active.attachmentId : null;
    t.lineControl = !!(t.active && command && command.lineControl);
    t.lineLengthRate = t.lineControl ? finite(lineLengthCommand, 0) : 0;
    t.orbitDirection = t.lineControl ? finite(command && command.orbitDirection, 0) : 0;
    t.pump = !!(t.lineControl && command && command.pump);
    t.reeling = !!(t.active && lineLengthCommand < 0);
    t.payingOut = !!(t.active && lineLengthCommand > 0);
    t.reelStrength = t.active ? finite(this._reelStrength, 0) : 0;
    // This is a mirror of the attachment authority's decision, not a second policy. Consumers must
    // fail closed: an absent/false flag means load telemetry is informational, never a break alarm.
    t.automaticBreakAllowed = !!(t.active && automaticBreakAllowed);
    // A deployed line snapshots its fitted head policy. Mirror that immutable attachment identity
    // instead of reading the player's current fitting, which may change while this line is active.
    t.headId = t.active && typeof headId === 'string' ? headId : null;
    t.slingshotT = Math.max(0, finite(t.slingshotT, 0));
    t.slingshot = t.slingshotT > 0;
  },
};

function rememberAcquisitionIntent(host, state, player, now) {
  const inp = state && state.input || {};
  const turn = clamp(finite(inp.turnIntent), -1, 1);
  const moveX = clamp(finite(inp.moveX), -1, 1);
  const moveZ = clamp(finite(inp.moveZ), -1, 1);
  const active = Math.abs(turn) > 0.06 || Math.abs(moveX) > 0.06 || Math.abs(moveZ) > 0.06;
  if (active) {
    host._recentIntent.turn = turn;
    host._recentIntent.moveX = moveX;
    host._recentIntent.moveZ = moveZ;
    host._recentIntent.at = now;
  }
  const recent = active || now - host._recentIntent.at <= INTENT_HISTORY_S
    ? host._recentIntent
    : { turn: 0, moveX: 0, moveZ: 0, at: -Infinity };
  const strongSign = Math.abs(turn) >= STRONG_TURN_THRESHOLD ? Math.sign(turn) : 0;
  const reversed = strongSign !== 0
    && host._lastStrongTurn.sign !== 0
    && strongSign !== host._lastStrongTurn.sign
    && now - host._lastStrongTurn.at <= INTENT_HISTORY_S;
  if (strongSign !== 0) {
    host._lastStrongTurn.sign = strongSign;
    host._lastStrongTurn.at = now;
  }
  return {
    turn: recent.turn,
    moveX: recent.moveX,
    moveZ: recent.moveZ,
    dir: intentWorldDirection(player, recent),
    reversed,
  };
}

function intentWorldDirection(player, intent) {
  const rot = finite(player && player.rot);
  const fx = Math.cos(rot);
  const fz = Math.sin(rot);
  const rx = -fz;
  const rz = fx;
  const forward = Math.max(0.35, Math.max(0, finite(intent && intent.moveZ)));
  const lateral = finite(intent && intent.moveX) + finite(intent && intent.turn) * 1.05;
  const x = fx * forward + rx * lateral;
  const z = fz * forward + rz * lateral;
  const length = Math.hypot(x, z);
  return length > 1e-6 ? { x: x / length, z: z / length } : { x: fx, z: fz };
}

function buildAcquisitionSnapshot(host, player, def, state, intent) {
  const maxLength = positive(def && def.maxLength, positive(def && def.break && def.break.maxLength, 390));
  const focus = state.player && state.player.flybyFocus;
  const focusTarget = focus && focus.active && focus.targetId != null && state.entities?.get
    ? state.entities.get(focus.targetId)
    : null;
  if (focus && focus.active && !isAuthorizedFocusTarget(state, player, focusTarget)) {
    return emptyAcquisitionSnapshot('no-target', intent);
  }
  const focusId = focusTarget ? focusTarget.id : null;
  const selectedPayloadId = masslineSelectedPayloadTargetId(state);
  const routeId = masslineRouteTargetId(state);
  const nearby = queryNearbyEntities(
    state,
    player.pos,
    maxLength + CURSOR_LATCH_GRACE_MAX,
    host._targetScratch || (host._targetScratch = []),
    state.entityList || [],
  );
  const candidates = nearby === state.entityList ? [...nearby] : [...nearby];
  appendNonCollidingAttachableCandidates(
    candidates,
    state.entityList || [],
    player,
    maxLength,
    host._nonCollidingTargetScratch || (host._nonCollidingTargetScratch = []),
  );
  appendExactCandidate(candidates, selectedPayloadId != null && state.entities?.get
    ? state.entities.get(selectedPayloadId) : null);
  appendExactCandidate(candidates, focusTarget);
  appendExactCandidate(candidates, routeId != null && state.entities?.get ? state.entities.get(routeId) : null);

  const attachable = [];
  const byId = new Map();
  for (const entity of candidates) {
    if (!isAttachable(entity, player.id) || byId.has(entity.id)) continue;
    const distance = Math.hypot(entity.pos.x - player.pos.x, entity.pos.z - player.pos.z);
    const exactAuthority = entity.id === focusId || entity.id === routeId;
    if (!exactAuthority && distance > maxLength + Math.max(0, finite(entity.radius))) continue;
    attachable.push(entity);
    byId.set(entity.id, entity);
  }
  attachable.sort(compareEntityIds);
  if (!attachable.length) return emptyAcquisitionSnapshot('no-target', intent);

  const aim = aimWorldFor(player, state, maxLength);
  const cursorActive = acquisitionCursorActive(state);
  const cursorPrecisionOf = (entity) => cursorActive ? preciseCursorScore(entity, aim) : 0;
  const hostileOf = (entity) => isHostileToPlayer(entity, player.team, state);
  const context = classifyMasslineIntent(player, attachable, {
    focusId,
    selectedId: selectedPayloadId,
    routeId,
    turnIntent: intent.turn,
    moveZ: intent.moveZ,
    intentDir: intent.dir,
    cursorPrecisionOf,
    isHostile: hostileOf,
  });
  const ranked = rankMasslineTargets(player, attachable, {
    maxRange: maxLength,
    context,
    intentDir: intent.dir,
    cursorPrecisionOf,
    isHostile: hostileOf,
    isObstructed: (entity) => masslineObstructed(host, state, player, entity),
    ownershipOf: (entity) => masslineScoringOwnership(entity, player, state),
    reachAllowanceOf: (entity) => Math.max(0, Number(entity && entity.radius) || 0),
  });
  return { ranked, byId, context, intent, aim, maxLength, denial: null };
}

function emptyAcquisitionSnapshot(denial, intent) {
  return {
    ranked: [],
    byId: new Map(),
    context: { id: 'precision-pick', label: 'PICK', source: 'none', forceId: null },
    intent,
    aim: null,
    maxLength: 390,
    denial,
  };
}

function buildAcquisitionReceipt(host, state, now, snapshot, selectedRecord, overrideReason = null) {
  const selected = acquisitionReceiptEntry(snapshot, selectedRecord, overrideReason);
  const alternatives = snapshot.ranked
    .filter((record) => !selectedRecord || record.id !== selectedRecord.id)
    .slice(0, 3)
    .map((record) => acquisitionReceiptEntry(snapshot, record, null));
  return {
    schemaVersion: 1,
    id: `massline-acquisition:${++host._acquisitionReceiptSeq}`,
    publishedTick: Math.max(0, Math.trunc(finite(state && state.tick))),
    publishedAt: now,
    validUntil: now + ACQUISITION_VALID_S,
    selected,
    alternatives,
    intent: {
      turn: snapshot.intent.turn,
      moveX: snapshot.intent.moveX,
      moveZ: snapshot.intent.moveZ,
      source: snapshot.context.source,
    },
    reason: selected ? selected.reason : 'no-target',
  };
}

function emptyAcquisitionReceipt(host, state, now, reason) {
  return {
    schemaVersion: 1,
    id: `massline-acquisition:${++host._acquisitionReceiptSeq}`,
    publishedTick: Math.max(0, Math.trunc(finite(state && state.tick))),
    publishedAt: now,
    validUntil: now + ACQUISITION_VALID_S,
    selected: null,
    alternatives: [],
    intent: null,
    reason,
  };
}

function acquisitionReceiptEntry(snapshot, record, overrideReason) {
  if (!record) return null;
  const target = snapshot.byId.get(record.id);
  const contextReason = record.reasons && record.reasons.context;
  const statusReason = overrideReason || reasonForScoringRecord(record);
  const nextReady = snapshot.ranked.find((candidate) => candidate.id !== record.id && candidate.score > 0);
  const gap = record.score > 0 ? record.score - finite(nextReady && nextReady.score) : 0;
  const exact = snapshot.context.forceId != null && snapshot.context.forceId === record.id;
  return {
    targetId: record.id,
    targetType: target && target.type || 'unknown',
    targetLabel: masslineTargetLabel(target),
    context: snapshot.context.id,
    intentLabel: snapshot.context.label,
    confidence: clamp01((exact ? 0.62 : 0.42) + record.score * 0.32 + Math.max(0, gap) * 0.7),
    score: record.score,
    rating: record.rating,
    status: statusReason ? statusForReason(statusReason) : 'ready',
    reason: statusReason,
    reasons: record.reasons,
  };
}

function reasonForScoringRecord(record) {
  if (!record || record.score > 0) return null;
  if (record.rating === 'protected') return 'protected';
  if (record.rating === 'blocked') return 'blocked';
  const gate = record.reasons && record.reasons.gate;
  // 'degenerate distance' means the body is co-located with the ship to within 1e-6, so the pure
  // scorer cannot compute a bearing and declines to rank it. That is a numerical limit, not a
  // gameplay one — a body you are physically overlapping is the least ambiguous grab there is, and
  // validateAcquisitionTarget (the physical eligibility authority) accepts it. Report READY and let
  // the latch's own revalidation be the judge, rather than inventing an 'invalid-target' denial the
  // player cannot act on.
  if (gate === 'degenerate distance') return null;
  return 'out-of-range';
}

function statusForReason(reason) {
  if (reason === 'protected') return 'protected';
  if (reason === 'blocked') return 'blocked';
  if (reason === 'out-of-range') return 'out-of-range';
  if (reason === 'cooldown') return 'cooldown';
  return 'invalid';
}

function validateAcquisitionTarget(host, player, target, def, state) {
  if (!isAttachable(target, player && player.id)) return 'target-lost';
  const maxLength = positive(def && def.maxLength, positive(def && def.break && def.break.maxLength, 390));
  const distance = Math.hypot(target.pos.x - player.pos.x, target.pos.z - player.pos.z);
  if (distance > maxLength + Math.max(0, finite(target.radius))) return 'out-of-range';
  if (masslineObstructed(host, state, player, target)) return 'blocked';
  return null;
}

function invalidateAcquisitionReceipt(state, reason) {
  const receipt = state && state.masslineAcquisition;
  if (!receipt || !receipt.selected) return;
  state.masslineAcquisition = {
    ...receipt,
    selected: {
      ...receipt.selected,
      status: statusForReason(reason),
      reason,
    },
    reason,
  };
}

function masslineObstructed(host, state, player, target) {
  const check = host && host.helpers && host.helpers.isMasslineObstructed;
  if (typeof check !== 'function') return false;
  try {
    return check({ state, player, target }) === true;
  } catch (_) {
    return true;
  }
}

// A GUN SOLUTION IS NOT A CURSOR. masslineTargetScoring.js:39-41 forbids weapon-aim coupling BY
// CONTRACT — cursor proximity is opt-in player intent, never reticle state — and the precision-pick
// profile puts 0.34 on the cursor axis, enough to decide the pick on its own.
//
// combat/autoTargetMode.tickAutoTarget OVERWRITES state.input.aimWorld with the weapon lead point
// for the whole time auto-target is held (autoTargetMode.js:146-149), and stamps state.input.autoAim
// as the provenance marker for exactly that write — the same marker weapons.js:167 already reads to
// re-solve per mount, and which is cleared the moment auto-target stops driving the aim. Without
// this gate, holding auto-target silently steered Massline acquisition onto whatever the guns had
// locked: measured on a two-anchor scene, steering intent selected the turn-side rock under
// 'massive-anchor-sling' with cursor 0.000, and holding auto-target on the OTHER rock flipped the
// context to 'precision-pick' with cursor 1.000 and moved the selection onto the gun target.
// Fail closed: while the aim point belongs to the guns, the cursor axis contributes nothing at all
// and steering intent decides, which is the contract's own answer.
function weaponSynthesisedAim(state) {
  const marker = state && state.input && state.input.autoAim;
  return !!(marker && typeof marker === 'object' && marker.targetId != null);
}

function acquisitionCursorActive(state) {
  if (weaponSynthesisedAim(state)) return false;
  const pointer = state && state.input && state.input.pointerScreen;
  const ndc = state && state.input && state.input.mouseNdc;
  // Direct/headless harnesses and gamepad aim both publish aimWorld without reliable pointer
  // provenance. Precision still requires the aim point to land inside a narrow surface envelope;
  // a broad idle cursor elsewhere contributes zero and cannot beat steering intent.
  return !!(pointer && pointer.active)
    || Math.hypot(finite(ndc && ndc.x), finite(ndc && ndc.y)) > 0.08
    || !!(state && state.input && state.input.aimWorld);
}

function preciseCursorScore(entity, aim) {
  if (!entity || !entity.pos || !aim) return 0;
  const miss = Math.max(0,
    Math.hypot(aim.x - entity.pos.x, aim.z - entity.pos.z) - Math.max(0, finite(entity.radius)));
  return clamp01(1 - miss / PRECISE_CURSOR_RADIUS);
}

function masslineRouteTargetId(state) {
  const waypointId = state && state.nav && state.nav.waypoint && state.nav.waypoint.targetEntityId;
  if (waypointId != null) return waypointId;
  const autopilotId = state && state.nav && state.nav.autopilot && state.nav.autopilot.targetEntityId;
  return autopilotId != null ? autopilotId : null;
}

function masslineSelectedPayloadTargetId(state) {
  const selectedId = state && state.player && state.player.targetId;
  const selected = selectedId != null && state.entities?.get ? state.entities.get(selectedId) : null;
  // A released World Site payload is explicitly exposed through the scanner target cycle. Honor
  // that deliberate player selection ahead of an inactive/stale navigation receipt so Tab + Space
  // is a complete public delivery interaction.
  if (selected?.alive !== false
      && selected?.data?.role === 'world_site_payload'
      && selected.data.worldSiteTargetable === true) {
    return selectedId;
  }
  return null;
}

function appendExactCandidate(candidates, entity) {
  if (!entity || candidates.some((candidate) => candidate && candidate.id === entity.id)) return;
  candidates.push(entity);
}

function masslineTargetLabel(target) {
  const data = target && target.data;
  const label = data && (data.displayName || data.name || data.label);
  if (typeof label === 'string' && label.trim()) return label.trim();
  const type = target && target.type || 'target';
  return type === 'asteroid' ? 'Anchor' : type.charAt(0).toUpperCase() + type.slice(1);
}

/** Resolve physical world anchors once at latch time. The player endpoint is always COM so the
 * rope cannot become an attitude controller. Dynamic tow payloads also use COM; large static
 * anchors retain the selected surface point so the cable meets the visible object. */
export function contextualAttachmentWorlds(player, target, acquiredTargetWorld) {
  const targetWorld = target && TOW_TARGET_COM_TYPES.has(target.type)
    ? { x: target.pos.x, y: 0, z: target.pos.z }
    : acquiredTargetWorld;
  return {
    sourceWorld: { x: player.pos.x, y: 0, z: player.pos.z },
    targetWorld,
  };
}

function combatKernel(host) {
  const actions = host.registry && host.registry.get && host.registry.get('actions');
  if (actions && actions.kernel) return actions.kernel;
  const combat = host.registry && host.registry.get && host.registry.get('combat');
  return combat && combat.kernel ? combat.kernel : null;
}

function attachmentDef(kernel, id) {
  return kernel && kernel.catalog && kernel.catalog.attachments && kernel.catalog.attachments.get(id) || null;
}

function attachmentTelemetry(helpers, attachment, state) {
  const physics = helpers && helpers.combatPhysics;
  if (!physics || typeof physics.getAttachmentTelemetry !== 'function') return null;
  try {
    return physics.getAttachmentTelemetry({
      attachmentId: attachment.id,
      physicsHandle: attachment.physicsHandle,
      tick: state && state.tick,
    });
  } catch (_) {
    return null;
  }
}

function normalizePhase(value) {
  if (value === 'capture' || value === 'loaded' || value === 'overload') return value;
  return 'slack';
}

// Presentation load (rung 04): 0..1 "how worked is the line" for HUD/VFX ordinary glow.
// load = clamp(max(strain * LOAD_STRAIN_GAIN, LOAD_BASE_BY_PHASE[phase]), 0, 1)
// Guarantees: inactive/slack ≈ 0 (no floor, strain ~0), capture ≥ 0.35 the moment the line goes
// taut, loaded ≥ 0.55 even at low strain, overload ≥ 0.9. Never mutates strain.
export function computeTetherLoad(phase, strain) {
  const base = LOAD_BASE_BY_PHASE[normalizePhase(phase)] || 0;
  const s = Number.isFinite(strain) && strain > 0 ? strain : 0;
  return clamp(Math.max(s * LOAD_STRAIN_GAIN, base), 0, 1);
}

// Release rating (Prompt 02). Reads state.player.masslineTelemetry, which masslineTelemetry.js
// writes immediately after tetherGameplay in UPDATE_ORDER. Because telemetry runs after this
// system, at cut time the subtree reflects the most recent observed tick — exactly what the spec
// means by "use the current state.player.masslineTelemetry if available." If telemetry is absent
// (no system ran, fresh state, etc.) we still emit a release rating with classification "messy"
// and zeroed numeric fields, per spec.
//
// sourceId — WHY IT IS HERE, do not drop it. A release rating is a judgement of the PLAYER'S
// technique; the tethered body is the cue's target, but the player is its source. The presentation
// pipeline reads that: presentationOrchestrator._emitCue falls back to payload.sourceId, and
// cueSchema.inferRelevance returns 0.88 for "the player is the source". Without it the cue has no
// identity at all and falls through to the DISTANCE table (0.72/0.52/0.28/0.08), which lands under
// presentationAdapters.PLAYER_LANE_RELEVANCE_FLOOR (0.8) — so the HUD toast AND the accessibility
// caption for every clean release were silently dropped at every distance. That is the bug
// scripts/check-massline-release-feedback.mjs caught: the "no double-toast" assertion was counting
// ZERO. Grammar rule 2: if the player cannot see it, it does not exist.
export function rateRelease(state, targetId) {
  const telemetry = state && state.player && state.player.masslineTelemetry;
  const sourceId = state && state.playerId != null ? state.playerId : null;
  if (!telemetry) {
    return {
      targetId,
      sourceId,
      classification: 'messy',
      releaseScore: 0,
      radialSpeed: 0,
      tangentialSpeed: 0,
      angularSpeed: 0,
      strain: 0,
      distance: 0,
      restLength: 0,
      playerSpeed: 0,
      maxStrainSinceLatch: 0,
      maxTangentialSpeedSinceLatch: 0,
      maxAngularSpeedSinceLatch: 0,
    };
  }

  const strain = finite(telemetry.strain, 0);
  const absTangential = Math.abs(finite(telemetry.tangentialSpeed, 0));
  const absRadial = Math.abs(finite(telemetry.radialSpeed, 0));
  const tangentQuality = absTangential / Math.max(absTangential + absRadial, 1e-6);
  const usefulLoad = clamp01(strain / 0.65);
  const overloadPenalty = clamp01((strain - 0.85) / 0.35);
  const releaseScore = clamp01(tangentQuality * usefulLoad * (1 - overloadPenalty));

  let classification;
  if (releaseScore >= 0.85) classification = 'razor';
  else if (releaseScore >= 0.65) classification = 'clean';
  else if (releaseScore >= 0.35) classification = 'good';
  else classification = 'messy';

  return {
    targetId,
    sourceId,
    classification,
    releaseScore,
    radialSpeed: finite(telemetry.radialSpeed, 0),
    tangentialSpeed: finite(telemetry.tangentialSpeed, 0),
    angularSpeed: finite(telemetry.angularSpeed, 0),
    strain,
    distance: finite(telemetry.distance, 0),
    restLength: finite(telemetry.restLength, 0),
    playerSpeed: finite(telemetry.playerSpeed, 0),
    maxStrainSinceLatch: finite(telemetry.maxStrainSinceLatch, 0),
    maxTangentialSpeedSinceLatch: finite(telemetry.maxTangentialSpeedSinceLatch, 0),
    maxAngularSpeedSinceLatch: finite(telemetry.maxAngularSpeedSinceLatch, 0),
  };
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function createPhaseMirror() {
  return { slackS: CAPTURE_SLACK_S, captureT: 0, captureActive: false, wasTaut: false };
}

function aimWorldFor(player, state, range) {
  const aim = state.input?.aimWorld;
  if (Number.isFinite(aim?.x) && Number.isFinite(aim?.z)) return { x: aim.x, z: aim.z };
  const angle = Number.isFinite(state.input?.aimAngle) ? state.input.aimAngle : (player.rot || 0);
  return {
    x: player.pos.x + Math.cos(angle) * range,
    z: player.pos.z + Math.sin(angle) * range,
  };
}

// Massline is a physical command, not a catalog verb. New world-object types do not need a
// separate eligibility-list edit before a player can deliberately attach to them.
export function isAttachable(entity, playerId) {
  if (!entity || !entity.alive || !entity.pos || entity.id === playerId) return false;
  if (!Number.isFinite(entity.pos.x) || !Number.isFinite(entity.pos.z)) return false;
  if (entity.data?.masslineTetherable === false || entity.flags?.masslineTetherable === false) return false;
  const explicitlyTetherable = entity.data?.masslineTetherable === true
    || entity.flags?.masslineTetherable === true;
  if (!explicitlyTetherable && TRANSIENT_NON_TETHERABLE_TYPES.has(entity.type)) return false;
  // A Mass Seed is ineligible before frame lock (travelling/locking/collapsing): it publishes
  // its own eligibility so a premature latch can never attach to a still-moving deployable.
  if (entity.type === 'massSeed') return isMassSeedTetherEligible(entity);
  return true;
}

/**
 * Runtime ownership resolution for T03 rankMasslineTargets (T04).
 * - own: player-owned deployables / wingman-tagged craft
 * - station: station-class entities (gated protected)
 * - hostile: existing isHostileToPlayer resolution
 * - ally: friendly-team ships/drones (eligible but damped by the scorer)
 * - neutral: everything else (asteroids, wrecks, passive traffic, …)
 */
function resolveMasslineOwnership(entity, player, state) {
  if (!entity) return 'neutral';
  if (entity.type === 'station') return 'station';
  // PQ-011: the player's own Mass Seed is the ONE own-deployable that must stay latch-eligible —
  // anchoring to your seed is the feature's point. It scores as neutral (no own-protection gate,
  // no ally damping); the phase gate in isAttachable still keeps it ineligible before lock.
  if (entity.type === 'massSeed') return 'neutral';

  const playerId = player && player.id;
  const ownerId = entity.ownerId ?? entity.data?.ownerId ?? entity.data?.owner ?? null;
  if (playerId != null && ownerId != null && ownerId === playerId) return 'own';
  if (entity.data?.isWingman === true) return 'own';
  if (entity.data?.echoOfPlayer === true) return 'own';

  if (isHostileToPlayer(entity, player && player.team, state)) return 'hostile';

  if ((entity.type === 'ship' || entity.type === 'drone')
      && player
      && entity.team === player.team
      && entity.id !== playerId) {
    return 'ally';
  }

  return 'neutral';
}

/**
 * Ownership as the SCORER may use it — a ranking signal only, never an eligibility gate.
 *
 * masslineTargetScoring gates 'own' and 'station' to rating 'protected' ("you cannot throw what you
 * are"). That gate is a real part of the pure scorer's contract and stays intact there, but it is
 * not the rule this game runs on: commit 4d00867e made Massline attachment purely physical ("a
 * physical command, not a catalog verb"), and the shipped behaviour is that you CAN deliberately
 * haul your own wingman, anchor to your own deployable, or swing off a station — anchoring to a big
 * immovable body is core play, not an error. Feeding those two values through would silently delete
 * that affordance the moment the scorer went live.
 *
 * So: eligibility stays where it belongs (isAttachable + range + obstruction, resolved by
 * validateAcquisitionTarget), and the scorer sees only the ranking half — an ally is still damped
 * below a comparable hostile, a hostile still gets its bonus.
 */
function masslineScoringOwnership(entity, player, state) {
  const ownership = resolveMasslineOwnership(entity, player, state);
  return ownership === 'own' || ownership === 'station' ? 'neutral' : ownership;
}

function appendNonCollidingAttachableCandidates(candidates, entities, player, maxLength, scratch) {
  scratch.length = 0;
  for (const entity of entities) {
    if (!isAttachable(entity, player.id)) continue;
    if (entity.collides !== false || !NON_COLLIDING_ACQUISITION_TYPES.has(entity.type)) continue;
    const dx = entity.pos.x - player.pos.x;
    const dz = entity.pos.z - player.pos.z;
    if (Math.hypot(dx, dz) > maxLength + (entity.radius || 0)) continue;
    scratch.push(entity);
  }
  scratch.sort(compareEntityIds);
  const seen = new Set(candidates.map((entity) => entity.id));
  for (const entity of scratch) {
    if (seen.has(entity.id)) continue;
    candidates.push(entity);
    seen.add(entity.id);
  }
  return candidates;
}

function compareEntityIds(a, b) {
  if (Number.isFinite(a.id) && Number.isFinite(b.id)) return a.id - b.id;
  if (Number.isFinite(a.id)) return -1;
  if (Number.isFinite(b.id)) return 1;
  const aId = String(a.id);
  const bId = String(b.id);
  return aId < bId ? -1 : aId > bId ? 1 : 0;
}

function isAuthorizedFocusTarget(state, player, target) {
  if (!isAttachable(target, player?.id)) return false;
  if (target.type !== 'ship' && target.type !== 'drone') return false;
  const training = target.data?.onboardingTraining === true
    && target.data?.trainingFocusEligible === true;
  return training || isHostileToPlayer(target, player?.team, state);
}

/** Presentation/play scale: Flyby Focus and future assists widen latch without changing physics. */
export function latchGraceScale(state) {
  const focus = state && state.player && state.player.flybyFocus;
  if (focus && focus.active) return Math.max(1, Number(focus.latchScale) || 2.4);
  return 1;
}

export function cursorAimScore(entity, aim, player, ux, uz, rayLength, state = null) {
  const radius = Math.max(0, finite(entity && entity.radius));
  const dxAim = aim.x - entity.pos.x;
  const dzAim = aim.z - entity.pos.z;
  const aimDistance = Math.hypot(dxAim, dzAim);
  const surfaceMiss = Math.max(0, aimDistance - radius);
  const scale = latchGraceScale(state);
  const cursorGrace = Math.min(CURSOR_LATCH_GRACE_MAX * scale, (CURSOR_LATCH_GRACE + radius * 0.85) * scale);
  if (surfaceMiss <= cursorGrace) {
    return {
      score: surfaceMiss * 2 + Math.max(0, Math.hypot(entity.pos.x - player.pos.x, entity.pos.z - player.pos.z) - radius) * 0.015,
      targetWorld: surfacePointToward(entity, aim),
    };
  }

  const dx = entity.pos.x - player.pos.x;
  const dz = entity.pos.z - player.pos.z;
  const along = dx * ux + dz * uz;
  if (along < -radius || along > rayLength + radius) return { score: Infinity, targetWorld: null };
  const perp = Math.abs(dx * uz - dz * ux);
  const rayGrace = Math.min(AIM_RAY_GRACE_MAX * scale, (AIM_RAY_GRACE + radius * 0.7) * scale);
  if (Math.max(0, perp - radius) > rayGrace) return { score: Infinity, targetWorld: null };
  const closest = {
    x: player.pos.x + ux * clamp(along, 0, rayLength),
    z: player.pos.z + uz * clamp(along, 0, rayLength),
  };
  return {
    score: 1000 + Math.max(0, perp - radius) * 12 + along * 0.04,
    targetWorld: surfacePointToward(entity, closest),
  };
}

function surfacePointToward(entity, worldPoint) {
  const radius = Math.max(0, finite(entity && entity.radius));
  if (!(radius > 0) || !worldPoint) return { x: entity.pos.x, y: 0, z: entity.pos.z };
  const dx = finite(worldPoint.x, entity.pos.x) - entity.pos.x;
  const dz = finite(worldPoint.z, entity.pos.z) - entity.pos.z;
  const d = Math.hypot(dx, dz);
  if (!(d > 1e-6)) return { x: entity.pos.x, y: 0, z: entity.pos.z };
  const contactRadius = radius * 0.72;
  return {
    x: entity.pos.x + dx / d * contactRadius,
    y: 0,
    z: entity.pos.z + dz / d * contactRadius,
  };
}

function clamp(value, lo, hi) {
  return Math.max(lo, Math.min(hi, value));
}

function positive(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}
