// PQ-030 / SF-28 — Transverse Snare.
//
// A fitted head redirects the ordinary Massline press into one free-target, world-to-world rope.
// The player chooses its center and orientation with the existing aim point; this owner spawns two
// fixed, shootable endpoints and asks SG-02 to connect them. A sufficiently fast eligible body must
// physically cross the visible segment before one endpoint is atomically rebound to that body.
// There is no radius slow, aim lock, velocity write, steering assist, brake, or hidden pilot.

import { lineSweepContact } from './masslineImpacts.js';
import { isHostileToPlayer } from './scanner.js';
import { queryNearbyEntities } from '../core/spatialQuery.js';
import { Masks } from '../core/entity.js';
import { massline2Flag } from '../data/featureFlags.js';

export const TRANSVERSE_SNARE_DEF_ID = 'attachment_transverse_snare';
export const TRANSVERSE_SNARE_HEAD_ID = 'transverse_snare';

const PREVIEW_MIN_RANGE = 60;
const PREVIEW_MAX_RANGE = 300;
const SNARE_HALF_LENGTH = 80;
const SNARE_ARM_S = 0.35;
const SNARE_TTL_S = 14;
const SNARE_QUERY_TRAVEL_PAD = 32;
const SNARE_AI_HAZARD_RADIUS = 18;
const SNARE_ANCHOR_RADIUS = 2.4;
const SNARE_ANCHOR_HULL = 28;
const SNARE_ANCHOR_BODY_MASS = 40;
const SNARE_MAX_TENSION = 5400;
const ANCHOR_PROFILE_ID = 'combat_profile_tether_anchor';

export function resolveTransverseSnarePreview(player, aimWorld, out = null) {
  if (!player || !player.pos) return null;
  const preview = out || {
    headId: TRANSVERSE_SNARE_HEAD_ID,
    center: { x: 0, z: 0 },
    source: { x: 0, z: 0 },
    target: { x: 0, z: 0 },
    direction: { x: 1, z: 0 },
    valid: true,
    publishedTick: null,
  };
  const px = finite(player.pos.x);
  const pz = finite(player.pos.z);
  const ax = finite(aimWorld && aimWorld.x, px + Math.cos(finite(player.rot)) * PREVIEW_MIN_RANGE);
  const az = finite(aimWorld && aimWorld.z, pz + Math.sin(finite(player.rot)) * PREVIEW_MIN_RANGE);
  const rawDx = ax - px;
  const rawDz = az - pz;
  const rawLength = Math.hypot(rawDx, rawDz);
  const facingX = Math.cos(finite(player.rot));
  const facingZ = Math.sin(finite(player.rot));
  const dx = rawLength > 1e-4 ? rawDx / rawLength : facingX;
  const dz = rawLength > 1e-4 ? rawDz / rawLength : facingZ;
  const range = clamp(rawLength, PREVIEW_MIN_RANGE, PREVIEW_MAX_RANGE);
  const cx = px + dx * range;
  const cz = pz + dz * range;
  const nx = -dz;
  const nz = dx;

  preview.headId = TRANSVERSE_SNARE_HEAD_ID;
  preview.center.x = cx;
  preview.center.z = cz;
  preview.source.x = cx + nx * SNARE_HALF_LENGTH;
  preview.source.z = cz + nz * SNARE_HALF_LENGTH;
  preview.target.x = cx - nx * SNARE_HALF_LENGTH;
  preview.target.z = cz - nz * SNARE_HALF_LENGTH;
  preview.direction.x = dx;
  preview.direction.z = dz;
  preview.valid = true;
  return preview;
}

export const masslineSnares = {
  id: 'masslineSnares',
  name: 'masslineSnares',

  init(ctx) {
    for (const unsubscribe of this._lifecycleUnsubs || []) unsubscribe();
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || {};
    this.registry = ctx.registry || null;
    this._deployment = null;
    this._preview = resolveTransverseSnarePreview(
      { pos: { x: 0, z: 0 }, rot: 0 },
      { x: PREVIEW_MIN_RANGE, z: 0 },
    );
    this._candidateScratch = [];
    this._queryCenter = { x: 0, z: 0 };
    this._previewSequence = 0;
    this._api = Object.freeze({
      handleInput: (payload) => this.handleInput(payload),
      hasActive: () => !!this._deployment,
      clearPreview: () => this._clearPreview(this.state),
    });
    this.helpers.masslineSnares = this._api;
    this._lifecycleUnsubs = typeof this.bus?.on === 'function'
      ? [
          this.bus.on('sector:exit', () => this._clearDeployment('sector_exit')),
          this.bus.on('sector:enter', () => this._clearDeployment('sector_enter')),
          this.bus.on('game:new', () => this._clearDeployment('new_game')),
          this.bus.on('game:started', () => this._clearDeployment('game_started')),
          this.bus.on('save:loaded', () => this._clearDeployment('save_loaded', false, false)),
        ]
      : [];
  },

  destroy() {
    for (const unsubscribe of this._lifecycleUnsubs || []) unsubscribe();
    this._lifecycleUnsubs = [];
    if (this.helpers && this.helpers.masslineSnares === this._api) delete this.helpers.masslineSnares;
    this._api = null;
  },

  handleInput({ state = this.state, player, wantsLatch = false, masslineCommand = null } = {}) {
    if (!state || !player || !player.alive) return false;
    if (this._deployment) {
      this._clearPreview(state);
      if ((masslineCommand && masslineCommand.cut) || wantsLatch) {
        this._clearDeployment('player_cut');
      }
      return true;
    }
    if (!transverseSnareFitted(player, state)) {
      this._clearPreview(state);
      return false;
    }

    if (wantsLatch) {
      const standing = state.player && state.player.masslineSnarePreview;
      const preview = standing && standing.valid && standing.publishedTick === state.tick - 1
        ? standing
        : this._publishPreview(state, player);
      this._deploy(state, player, preview);
      return true;
    }
    this._publishPreview(state, player);
    return true;
  },

  update(dt, state) {
    const deployment = this._deployment;
    if (!deployment) return;
    const player = entity(state, state.playerId);
    if (state.mode !== 'flight' || !player || !player.alive || player.flags?.docked) {
      this._clearDeployment('flight_exit');
      return;
    }

    const now = nowOf(state);
    if (now >= deployment.expiresAt) {
      this._clearDeployment('expired');
      return;
    }

    const attachments = this._attachments();
    if (!attachments) {
      this._clearDeployment('attachment_authority_unavailable', false);
      return;
    }

    let source = entity(state, deployment.sourceId);
    let target = entity(state, deployment.targetId);
    if (!source || !target || source.alive === false || target.alive === false) {
      this._clearDeployment('endpoint_destroyed');
      return;
    }

    if (!deployment.attachmentId) {
      // The endpoints spawn after physics has already run on the press tick. Wait exactly one
      // fixed tick so the existing physics owner can admit both fixed bodies before joint create.
      if (state.tick <= deployment.spawnTick) {
        this._mirror(state, deployment, null, 'deploying');
        return;
      }
      const created = attachments.create({
        defId: TRANSVERSE_SNARE_DEF_ID,
        ownerId: source.id,
        targetId: target.id,
        controllerId: state.playerId,
        controlMode: TRANSVERSE_SNARE_HEAD_ID,
        sourceWorld: source.pos,
        targetWorld: target.pos,
      });
      if (!created || !created.ok || !created.attachment) {
        this._deny(state, (created && created.reason) || 'create_failed');
        this._clearDeployment('deploy_failed', false);
        return;
      }
      deployment.attachmentId = created.attachment.id;
      deployment.armedAt = now + SNARE_ARM_S;
      this.bus?.emit('massline:snareArmed', {
        attachmentId: deployment.attachmentId,
        sourceId: source.id,
        targetId: target.id,
        armedAt: deployment.armedAt,
      });
    }

    const attachment = attachments.get(deployment.attachmentId);
    if (!attachment || attachment.state !== 'active') {
      this._clearDeployment(attachment?.breakReason || 'line_broken', false);
      return;
    }

    source = entity(state, attachment.ownerId);
    target = entity(state, attachment.targetId);
    if (!source || !target || source.alive === false || target.alive === false) {
      this._clearDeployment('endpoint_destroyed');
      return;
    }

    if (!deployment.caughtId && now >= deployment.armedAt) {
      this._scanCrossings(dt, state, player, deployment, attachment, source, target);
    }
    const phase = deployment.caughtId
      ? (attachment.nearBreakWarned ? 'overload' : 'caught')
      : (now >= deployment.armedAt ? 'armed' : 'deploying');
    this._mirror(state, deployment, attachment, phase);
  },

  _publishPreview(state, player) {
    const preview = resolveTransverseSnarePreview(player, state.input && state.input.aimWorld, this._preview);
    preview.publishedTick = state.tick;
    preview.receiptId = `snare_preview_${++this._previewSequence}`;
    ensurePlayerState(state).masslineSnarePreview = preview;
    return preview;
  },

  _deploy(state, player, preview) {
    if (!preview || !preview.valid || this._deployment) return false;
    const spawn = this.helpers && this.helpers.spawnEntity;
    if (typeof spawn !== 'function') {
      this._deny(state, 'spawn_authority_unavailable');
      return false;
    }
    const deploymentId = `snare_${state.tick}_${this._previewSequence}`;
    const source = spawn(snareAnchorSpec(preview.source, player, deploymentId, 'A'));
    const target = spawn(snareAnchorSpec(preview.target, player, deploymentId, 'B'));
    const sentinel = spawn({
      type: 'masslineSnare',
      // AI-only spatial sentinel. The authored endpoints plus cable are the complete player-facing
      // geometry; allowing renderer reconciliation to build a generic fallback here would add a
      // false solid object at the line centre.
      _noMesh: true,
      pos: { x: preview.center.x, z: preview.center.z },
      vel: { x: 0, z: 0 },
      // Deliberately imperfect avoidance: AI notices the crossing's center, not an invisible
      // 160-wu collision disc that would make the line safer than it visibly is.
      radius: SNARE_AI_HAZARD_RADIUS,
      mass: 0,
      hull: 1,
      hullMax: 1,
      // Spatially admitted with a zero collision mask: AI sees one bounded HAZARD contact spanning
      // the armed segment, while physics can never resolve it as a solid disc or hidden slow field.
      collides: true,
      collisionMask: 0,
      physicsBody: false,
      team: player.team,
      ownerId: player.id,
      ttl: SNARE_TTL_S,
      data: {
        kind: 'transverse_snare_hazard',
        deploymentId,
        sourceId: source && source.id,
        targetId: target && target.id,
        segmentHalfLength: SNARE_HALF_LENGTH,
      },
    });
    if (!source || !target) {
      if (source) source.alive = false;
      if (target) target.alive = false;
      if (sentinel) sentinel.alive = false;
      this._deny(state, 'endpoint_spawn_failed');
      return false;
    }

    const now = nowOf(state);
    this._deployment = {
      id: deploymentId,
      anchorAId: source.id,
      anchorBId: target.id,
      sourceId: source.id,
      targetId: target.id,
      sentinelId: sentinel && sentinel.id,
      attachmentId: null,
      caughtId: null,
      spawnTick: state.tick,
      armedAt: Infinity,
      expiresAt: now + SNARE_TTL_S,
    };
    this._clearPreview(state);
    this._mirror(state, this._deployment, null, 'deploying');
    this.bus?.emit('massline:snareDeployed', {
      deploymentId,
      sourceId: source.id,
      targetId: target.id,
      expiresAt: this._deployment.expiresAt,
    });
    this.bus?.emit('ai:telegraph', {
      kind: 'transverse_snare',
      actorId: player.id,
      sourceId: source.id,
      targetId: target.id,
      pos: { x: preview.center.x, z: preview.center.z },
      radius: SNARE_HALF_LENGTH,
      armedAt: now + SNARE_ARM_S,
      expiresAt: this._deployment.expiresAt,
    });
    return true;
  },

  _scanCrossings(dt, state, player, deployment, attachment, source, target) {
    const dx = finite(target.pos.x) - finite(source.pos.x);
    const dz = finite(target.pos.z) - finite(source.pos.z);
    this._queryCenter.x = finite(source.pos.x) + dx * 0.5;
    this._queryCenter.z = finite(source.pos.z) + dz * 0.5;
    const queryRadius = Math.hypot(dx, dz) * 0.5 + SNARE_QUERY_TRAVEL_PAD;
    const fallback = state.entityIndex?.ready && Array.isArray(state.entityIndex.shipLike)
      ? state.entityIndex.shipLike
      : (state.entityList || []);
    const candidates = queryNearbyEntities(
      state,
      this._queryCenter,
      queryRadius,
      this._candidateScratch,
      fallback,
    );

    let selected = null;
    let selectedContact = null;
    for (const candidate of candidates) {
      const contact = snareContact(state, player, source, target, candidate, dt);
      if (!contact) continue;
      if (!selected || compareIds(candidate.id, selected.id) < 0) {
        selected = candidate;
        selectedContact = contact;
      }
    }
    // Released site payloads intentionally use non-colliding sensor bodies, so they do not appear
    // in the spatial hash. The dedicated payload index is small and bounded by authored sites.
    const payloads = state.entityIndex?.ready && Array.isArray(state.entityIndex.payloads)
      ? state.entityIndex.payloads
      : null;
    if (payloads) {
      for (const candidate of payloads) {
        const cx = finite(candidate?.pos?.x) - this._queryCenter.x;
        const cz = finite(candidate?.pos?.z) - this._queryCenter.z;
        if (cx * cx + cz * cz > queryRadius * queryRadius) continue;
        const contact = snareContact(state, player, source, target, candidate, dt);
        if (!contact) continue;
        if (!selected || compareIds(candidate.id, selected.id) < 0) {
          selected = candidate;
          selectedContact = contact;
        }
      }
    }
    if (!selected || !selectedContact) return;
    this._catch(state, deployment, attachment, source, target, selected, selectedContact);
  },

  _catch(state, deployment, attachment, source, target, victim, contact) {
    const attachments = this._attachments();
    if (!attachments) return;
    const sourceDistance = Math.hypot(contact.pos.x - source.pos.x, contact.pos.z - source.pos.z);
    const targetDistance = Math.hypot(contact.pos.x - target.pos.x, contact.pos.z - target.pos.z);
    const keepSource = sourceDistance <= targetDistance;
    const keptAnchor = keepSource ? source : target;
    const retiredAnchor = keepSource ? target : source;
    const result = attachments.rebind(attachment.id, state.playerId, {
      ownerId: keptAnchor.id,
      targetId: victim.id,
      controllerId: state.playerId,
      controlMode: TRANSVERSE_SNARE_HEAD_ID,
      sourceWorld: keptAnchor.pos,
      targetWorld: contact.pos,
    });
    if (!result || !result.ok || !result.attachment) return;

    retiredAnchor.alive = false;
    const sentinel = entity(state, deployment.sentinelId);
    if (sentinel) sentinel.alive = false;
    deployment.sourceId = result.attachment.ownerId;
    deployment.targetId = result.attachment.targetId;
    deployment.sentinelId = null;
    deployment.caughtId = victim.id;
    this.bus?.emit('massline:snareCaught', {
      deploymentId: deployment.id,
      attachmentId: result.attachment.id,
      anchorId: keptAnchor.id,
      targetId: victim.id,
      transverseSpeed: contact.transverseSpeed,
      pos: contact.pos,
    });
  },

  _mirror(state, deployment, attachment, phase) {
    const mirror = ensureRemoteMirror(state);
    mirror.active = true;
    mirror.kind = TRANSVERSE_SNARE_HEAD_ID;
    mirror.headId = TRANSVERSE_SNARE_HEAD_ID;
    mirror.phase = phase;
    mirror.sourceId = attachment ? attachment.ownerId : deployment.sourceId;
    mirror.targetId = attachment ? attachment.targetId : deployment.targetId;
    mirror.attachmentId = attachment ? attachment.id : deployment.attachmentId;
    mirror.caughtId = deployment.caughtId;
    mirror.expiresAt = deployment.expiresAt;
    mirror.restLength = finite(attachment && attachment.restLength);
    mirror.strain = attachment ? clamp(finite(attachment.lastTension) / SNARE_MAX_TENSION, 0, 2) : 0;
    mirror.load = clamp(mirror.strain, 0, 1);
    mirror.automaticBreakAllowed = true;
  },

  _clearDeployment(reason, cutAttachment = true, killEndpoints = true) {
    const state = this.state;
    const deployment = this._deployment;
    if (deployment) {
      const attachments = this._attachments();
      if (cutAttachment && deployment.attachmentId && attachments) {
        attachments.cut(deployment.attachmentId, state.playerId, reason === 'player_cut' ? 'tether_cut' : reason);
      }
      if (killEndpoints) {
        killEntity(state, deployment.anchorAId);
        killEntity(state, deployment.anchorBId);
        killEntity(state, deployment.sentinelId);
      }
      if (reason === 'player_cut') {
        this.bus?.emit('massline:snareCut', { attachmentId: deployment.attachmentId, reason });
      } else if (reason) {
        this.bus?.emit('massline:snareEnded', { attachmentId: deployment.attachmentId, reason });
      }
    }
    this._deployment = null;
    this._clearPreview(state);
    clearRemoteMirror(state, reason);
  },

  _clearPreview(state) {
    const playerState = ensurePlayerState(state);
    playerState.masslineSnarePreview = null;
  },

  _deny(state, reason) {
    ensureRemoteMirror(state).lastDenial = { reason, tick: state.tick };
    this.bus?.emit('tether:latchDenied', { reason: `snare_${reason}` });
  },

  _attachments() {
    const actions = this.registry?.get && this.registry.get('actions');
    if (actions?.kernel?.attachments) return actions.kernel.attachments;
    const combat = this.registry?.get && this.registry.get('combat');
    return combat?.kernel?.attachments || null;
  },
};

function snareAnchorSpec(pos, player, deploymentId, endpoint) {
  return {
    type: 'masslineSnareAnchor',
    pos: { x: pos.x, z: pos.z },
    vel: { x: 0, z: 0 },
    rot: endpoint === 'A' ? 0 : Math.PI,
    radius: SNARE_ANCHOR_RADIUS,
    mass: SNARE_ANCHOR_BODY_MASS,
    hull: SNARE_ANCHOR_HULL,
    hullMax: SNARE_ANCHOR_HULL,
    collides: true,
    collisionMask: Masks.PROJECTILE,
    physicsBody: {
      dynamic: false,
      ccd: false,
      material: 'massline_sensor',
      mass: SNARE_ANCHOR_BODY_MASS,
      radius: SNARE_ANCHOR_RADIUS,
    },
    team: player.team,
    ownerId: player.id,
    ttl: SNARE_TTL_S + 1,
    data: {
      kind: 'transverse_snare_anchor',
      combatProfileId: ANCHOR_PROFILE_ID,
      deploymentId,
      endpoint,
    },
  };
}

function snareContact(state, player, source, target, candidate, dt) {
  if (!candidate || !candidate.alive || !candidate.pos || !candidate.vel) return null;
  if (candidate.id === player.id || candidate.id === source.id || candidate.id === target.id) return null;
  if (candidate.type === 'ship' || candidate.type === 'drone') {
    if (!isHostileToPlayer(candidate, player.team, state)) return null;
  } else if (candidate.type !== 'payload') {
    return null;
  }
  return lineSweepContact(source, target, candidate, dt);
}

function transverseSnareFitted(player, state) {
  return player?.data?.derived?.masslineHeadId === TRANSVERSE_SNARE_HEAD_ID
    && massline2Flag('masslineHeadTransverseSnare', state.runtime && state.runtime.features);
}

function ensurePlayerState(state) {
  if (!state.player || typeof state.player !== 'object') state.player = {};
  return state.player;
}

function ensureRemoteMirror(state) {
  const player = ensurePlayerState(state);
  if (!player.remoteMassline || typeof player.remoteMassline !== 'object') {
    player.remoteMassline = {
      active: false,
      kind: null,
      headId: null,
      phase: 'idle',
      sourceId: null,
      targetId: null,
      attachmentId: null,
      caughtId: null,
      expiresAt: null,
      restLength: 0,
      strain: 0,
      load: 0,
      automaticBreakAllowed: true,
      lastEndReason: null,
      lastDenial: null,
    };
  }
  return player.remoteMassline;
}

function clearRemoteMirror(state, reason = null) {
  const mirror = ensureRemoteMirror(state);
  mirror.active = false;
  mirror.kind = null;
  mirror.headId = null;
  mirror.phase = 'idle';
  mirror.sourceId = null;
  mirror.targetId = null;
  mirror.attachmentId = null;
  mirror.caughtId = null;
  mirror.expiresAt = null;
  mirror.restLength = 0;
  mirror.strain = 0;
  mirror.load = 0;
  mirror.lastEndReason = reason;
  return mirror;
}

function killEntity(state, id) {
  const target = id == null ? null : entity(state, id);
  if (target) target.alive = false;
}

function entity(state, id) {
  return id == null || !state?.entities?.get ? null : state.entities.get(id) || null;
}

function nowOf(state) {
  return Number.isFinite(state.simTime) ? state.simTime : finite(state.tick) / 60;
}

function compareIds(a, b) {
  if (Number.isFinite(a) && Number.isFinite(b)) return a - b;
  const left = String(a);
  const right = String(b);
  return left < right ? -1 : left > right ? 1 : 0;
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
