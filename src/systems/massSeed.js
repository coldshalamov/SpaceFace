// PQ-011 / SF-11 — Deployable Anchor Mass Seed.
//
// The player launches a contained-mass/frame-lock device into open space. It travels a fixed,
// deterministic ballistic trajectory (bounded deployable), frame-locks into a STATIC Rapier
// anchor through the physics-authority membrane (never an ordinary body with fake astronomical
// mass), serves as a Massline tether anchor for a bounded lifetime, warns before expiry, and
// collapses safely — expiry/destruction while tethered cuts the attachment through the combat
// attachment authority with an exact reason, never leaving a ghost constraint.
//
// Ownership:
//   • Owns the 'massSeed' entity lifecycle and the state.massSeed receipt subtree only.
//   • Tether eligibility is DATA on the entity (data.massSeed.tetherEligible); tetherGameplay
//     stays the only latch authority and reads that flag through its normal attachable gate.
//   • Tether cuts route through kernel.attachments.cut(...) — never direct joint/entity edits.
//   • The locked body is authored via entity.physicsBody (dynamic:false, fixed) and rebuilt by
//     the physics owner on authored material/revision changes; this system never touches Rapier.
//   • Deploy cooldown persists on state.player.massSeed.cooldownUntil (player-blob single writer
//     for this feature). Seed ENTITIES are temporary and never serialize (save policy: normalize
//     away with a clean tether/target release — see _onSaveLoaded).
//
// Determinism: the travel path is a pure function of (deployedAt, spawnPos, dir, travelSpeed,
// travelTimeS) evaluated against state.simTime. No rng, no wall clock, no accumulation drift.
// The 47a golden never presses deploy, so the system is a strict no-op there.

import { MASS_SEED_DEF, MASS_SEED_CUT_REASONS } from '../data/massSeed.js';
import { Masks } from '../core/entity.js';

const TRAVEL_MATERIAL = 'projectile'; // ghost collider family: zero solver contacts in flight
const ANCHOR_MATERIAL = 'rock';       // solid fixed body once frame-locked
const COMBAT_PROFILE_ID = 'combat_profile_tether_anchor';

function defaultRuntime() {
  return {
    schemaVersion: 1,
    phase: 'idle',
    seedId: null,
    ownerId: null,
    deployedAt: 0,
    lockAt: 0,
    activeAt: 0,
    warnAt: 0,
    expireAt: 0,
    collapseAt: 0,
    collapseReason: null,
    spawnPos: { x: 0, z: 0 },
    dir: { x: 1, z: 0 },
    lockPos: { x: 0, z: 0 },
    travelSpeed: MASS_SEED_DEF.travelSpeed,
    travelTimeS: MASS_SEED_DEF.travelTimeS,
    lastDenial: null,
    // Replaced seeds mid-collapse-beat (bounded, oldest force-finished past the cap). The tracked
    // lifecycle fields below belong to the NEWEST seed; without this side slot a replacement
    // deploy would orphan the old entity as an immortal ghost (caught by the cap test).
    dying: [],
  };
}

// Cap on simultaneous collapse beats from replacement spam. One beat is 0.45s; even mashing the
// deploy verb every tick can stack ~27 — the cap force-finishes the oldest so the array and the
// entity count stay bounded regardless of input abuse.
const DYING_CAP = 8;

function ensureRuntime(state) {
  const ms = state.massSeed;
  if (ms && ms.schemaVersion === 1) return ms;
  state.massSeed = defaultRuntime();
  return state.massSeed;
}

function ensurePlayerSeed(state) {
  const player = state.player || (state.player = {});
  const ps = player.massSeed;
  if (ps && Number.isFinite(ps.cooldownUntil)) return ps;
  player.massSeed = { cooldownUntil: 0 };
  return player.massSeed;
}

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function nowOf(state) {
  return Number.isFinite(state.simTime) ? state.simTime : state.tick / 60;
}

// Same aim convention as impulse charges: aim point direction from the player when the cursor
// paints a world point, else the nose. Pure; no allocation.
function deployDirection(player, state) {
  const aw = state.input && state.input.aimWorld;
  if (aw && Number.isFinite(aw.x) && Number.isFinite(aw.z)) {
    const dx = aw.x - player.pos.x;
    const dz = aw.z - player.pos.z;
    const len = Math.hypot(dx, dz);
    if (len > 1e-4) return { x: dx / len, z: dz / len };
  }
  const inp = state.input;
  const angle = Number.isFinite(inp && inp.aimAngle) ? inp.aimAngle : finite(player.rot);
  return { x: Math.cos(angle), z: Math.sin(angle) };
}

export const massSeed = {
  name: 'massSeed',

  init(ctx) {
    // Re-init hygiene (tetherGameplay parity): a destroy/reinitialize cycle on a reused bus must
    // not stack duplicate lifecycle listeners. _clearSeed is idempotent, but keep the count exact.
    for (const unsubscribe of this._lifecycleUnsubs || []) unsubscribe();
    this._lifecycleUnsubs = [];
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
    this.registry = ctx.registry || null;
    ensureRuntime(ctx.state);
    ensurePlayerSeed(ctx.state);
    if (this.bus && typeof this.bus.on === 'function') {
      // Lifecycle clears: a seed never crosses a sector boundary, a run restart, or a load.
      this._lifecycleUnsubs = [
        this.bus.on('sector:exit', () => this._clearSeed(MASS_SEED_CUT_REASONS.cleared, 'sector_exit')),
        this.bus.on('sector:enter', () => this._clearSeed(MASS_SEED_CUT_REASONS.cleared, 'sector_enter')),
        this.bus.on('game:new', () => this._clearSeed(MASS_SEED_CUT_REASONS.cleared, 'new_game')),
        this.bus.on('save:loaded', () => this._onSaveLoaded()),
      ];
    }
  },

  newGame() {
    this._clearSeed(MASS_SEED_CUT_REASONS.cleared, 'new_game');
    ensurePlayerSeed(this.state).cooldownUntil = 0;
  },

  update(dt, state) {
    const ms = ensureRuntime(state);
    ensurePlayerSeed(state);
    if (state.mode !== 'flight') return;
    this._handleDeploy(state, ms);
    this._tickSeed(state, ms, dt);
  },

  // ── deploy ──────────────────────────────────────────────────────────────────────────────

  _handleDeploy(state, ms) {
    const actions = state.input && state.input.actions;
    if (!actions || !actions.deployMassSeed) return;
    actions.deployMassSeed = false;
    const player = state.entities && state.entities.get ? state.entities.get(state.playerId) : null;
    if (!player || !player.alive) return;
    if (player.flags && player.flags.docked) return;
    if (state.ui && state.ui.screenStack && state.ui.screenStack.length > 0) return;

    const now = nowOf(state);
    const ps = ensurePlayerSeed(state);
    if (now < ps.cooldownUntil) {
      ms.lastDenial = { reason: 'cooldown', at: now, readyAt: ps.cooldownUntil };
      this.bus.emit('massSeed:deployDenied', { reason: 'cooldown', readyAt: ps.cooldownUntil });
      this.bus.emit('toast', {
        text: `Mass seed recharging — ${Math.ceil(ps.cooldownUntil - now)}s`,
        kind: 'warn',
        ttl: 1.6,
      });
      this.bus.emit('audio:cue', { id: 'ui_deny' });
      return;
    }

    // Deterministic replacement: deploying while a seed is live retires it into a bounded
    // collapse beat (the mirror is about to be handed to the new seed, so the old one's beat
    // is tracked in ms.dying — never orphaned).
    if (ms.phase !== 'idle') this._retireLiveSeed(state, ms, MASS_SEED_CUT_REASONS.replaced);

    const dir = deployDirection(player, state);
    const spawnDistance = finite(player.radius, 6) + MASS_SEED_DEF.radius + MASS_SEED_DEF.spawnGap;
    const spawnPos = {
      x: player.pos.x + dir.x * spawnDistance,
      z: player.pos.z + dir.z * spawnDistance,
    };
    const travelDistance = MASS_SEED_DEF.travelSpeed * MASS_SEED_DEF.travelTimeS;
    const lockPos = {
      x: spawnPos.x + dir.x * travelDistance,
      z: spawnPos.z + dir.z * travelDistance,
    };

    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return;
    const deployedAt = now;
    const lockAt = deployedAt + MASS_SEED_DEF.travelTimeS;
    const activeAt = lockAt + MASS_SEED_DEF.lockingS;
    const expireAt = activeAt + MASS_SEED_DEF.anchorTtlS;
    const warnAt = expireAt - MASS_SEED_DEF.warningS;
    const entity = spawnEntity({
      type: 'massSeed',
      pos: { x: spawnPos.x, z: spawnPos.z },
      vel: { x: 0, z: 0 },
      rot: Math.atan2(dir.z, dir.x),
      radius: MASS_SEED_DEF.radius,
      mass: MASS_SEED_DEF.effectiveMass,
      hull: MASS_SEED_DEF.hull,
      hullMax: MASS_SEED_DEF.hull,
      collides: true,
      // Deployed-device category (same family as mines): projectile sweeps may hit it in ANY
      // phase — there is no protected window — while ships never broadphase against it.
      collisionMask: Masks.PROJECTILE,
      physicsBody: {
        dynamic: false,
        ccd: false,
        material: TRAVEL_MATERIAL,
        mass: MASS_SEED_DEF.bodyMass,
        radius: MASS_SEED_DEF.radius,
      },
      team: player.team,
      ownerId: player.id,
      data: {
        kind: 'mass_seed',
        massSeed: true,
        ownerId: player.id,
        combatProfileId: COMBAT_PROFILE_ID,
        // Massline scoring contract seam (src/combat/masslineTargetScoring.js): with
        // effectiveMass >= MASSIVE_ANCHOR_MIN_MASS this classifies the seed as a massive anchor
        // for selection grammar. The Rapier body is FIXED and never sees this number.
        masslineAnchor: true,
        massSeedState: {
          phase: 'travel',
          tetherEligible: false,
          deployedAt,
          lockAt,
          activeAt,
          warnAt,
          expireAt,
        },
      },
    });
    if (!entity) return;

    ms.phase = 'travel';
    ms.seedId = entity.id;
    ms.ownerId = player.id;
    ms.deployedAt = deployedAt;
    ms.lockAt = lockAt;
    ms.activeAt = activeAt;
    ms.warnAt = warnAt;
    ms.expireAt = expireAt;
    ms.collapseAt = 0;
    ms.collapseReason = null;
    ms.spawnPos = spawnPos;
    ms.dir = dir;
    ms.lockPos = lockPos;
    ms.travelSpeed = MASS_SEED_DEF.travelSpeed;
    ms.travelTimeS = MASS_SEED_DEF.travelTimeS;
    ms.lastDenial = null;

    this.bus.emit('massSeed:deployed', {
      seedId: entity.id,
      ownerId: player.id,
      spawnPos: { ...spawnPos },
      lockPos: { ...lockPos },
      lockAt,
      activeAt,
      expireAt,
    });
    this.bus.emit('audio:cue', { id: 'confirm' });
  },

  // ── lifecycle tick ───────────────────────────────────────────────────────────────────────

  _tickSeed(state, ms) {
    this._tickDying(state, ms);
    if (ms.phase === 'idle' || ms.seedId == null) return;
    const entity = state.entities && state.entities.get ? state.entities.get(ms.seedId) : null;
    if (!entity || entity.alive === false) {
      // The entity left the world without a lifecycle clear: destroyed by weapons/blast (the
      // kernel kills on hull 0) or force-killed. Cut the tether with the exact destruction
      // reason before the attachment orphan sweep can rename it.
      this._onSeedEntityLost(state, ms);
      return;
    }
    const now = nowOf(state);
    const seedState = entity.data && entity.data.massSeedState;
    switch (ms.phase) {
      case 'travel': {
        const elapsed = Math.max(0, Math.min(now - ms.deployedAt, ms.travelTimeS));
        const d = ms.travelSpeed * elapsed;
        entity.pos.x = ms.spawnPos.x + ms.dir.x * d;
        entity.pos.z = ms.spawnPos.z + ms.dir.z * d;
        entity.rot = Math.atan2(ms.dir.z, ms.dir.x) + elapsed * MASS_SEED_DEF.travelSpinRadS;
        if (now >= ms.lockAt) this._beginFrameLock(state, ms, entity);
        break;
      }
      case 'locking': {
        if (now >= ms.activeAt) {
          ms.phase = 'active';
          if (seedState) {
            seedState.phase = 'active';
            seedState.tetherEligible = true;
          }
          this.bus.emit('massSeed:locked', {
            seedId: ms.seedId,
            pos: { x: entity.pos.x, z: entity.pos.z },
            expireAt: ms.expireAt,
          });
          this.bus.emit('audio:cue', { id: 'lock_acquired' });
          this.bus.emit('presentation:vfxCue', {
            id: 'massSeed.frameLock',
            lane: 'utility',
            particles: 18,
            lights: 1,
            magnitude: 0.8,
            position: { x: entity.pos.x, z: entity.pos.z },
            material: 'energy',
            sourceId: ms.seedId,
            targetId: null,
            flashReduced: true,
          });
        }
        break;
      }
      case 'active': {
        if (now >= ms.expireAt) { this._beginCollapse(state, ms, MASS_SEED_CUT_REASONS.expired); break; }
        if (now >= ms.warnAt) {
          ms.phase = 'warning';
          if (seedState) seedState.phase = 'warning';
          this.bus.emit('massSeed:warning', {
            seedId: ms.seedId,
            expireAt: ms.expireAt,
            remainingS: ms.expireAt - now,
          });
          this.bus.emit('toast', { text: 'Anchor seed destabilizing', kind: 'warn', ttl: 2.5 });
          this.bus.emit('audio:cue', { id: 'alert' });
        }
        break;
      }
      case 'warning': {
        if (now >= ms.expireAt) this._beginCollapse(state, ms, MASS_SEED_CUT_REASONS.expired);
        break;
      }
      case 'collapsing': {
        if (now >= ms.collapseAt) this._finishCollapse(state, ms, entity);
        break;
      }
      default:
        break;
    }
  },

  _beginFrameLock(state, ms, entity) {
    // Deterministic velocity reconciliation: the frame lock lands EXACTLY on the published lock
    // point with zero residual velocity, then the physics owner rebuilds the body as a solid
    // fixed anchor (ghost → rock triggers the record rebuild through the ordinary spec match).
    entity.pos.x = ms.lockPos.x;
    entity.pos.z = ms.lockPos.z;
    entity.vel.x = 0;
    entity.vel.z = 0;
    entity.angVel = 0;
    entity.rot = Math.atan2(ms.dir.z, ms.dir.x);
    this._authorBodyMaterial(state, entity, ANCHOR_MATERIAL);
    ms.phase = 'locking';
    const seedState = entity.data && entity.data.massSeedState;
    if (seedState) seedState.phase = 'locking';
    this.bus.emit('massSeed:locking', {
      seedId: ms.seedId,
      pos: { x: entity.pos.x, z: entity.pos.z },
      activeAt: ms.activeAt,
    });
  },

  // Mid-life authored-spec mutation. The SG-02 static layer only re-evaluates records on
  // physicsStaticVersion change (entity add/remove), so a material/revision flip alone would
  // NEVER be seen: the anchor body would stay a ghost at the SPAWN pose, and a tether created
  // after lock would span from the lock point to a stale body — instant overload (caught by the
  // anchor-load test). Bumping the version is the sanctioned invalidation: the next physics sync
  // re-evaluates statics, recordMatchesSpec sees the revision/material change, and the record is
  // rebuilt as a solid fixed body at the CURRENT entity.pos. Rare (≤3× per lifecycle) and cheap
  // (fast-path spec match for every other static).
  _authorBodyMaterial(state, entity, material) {
    const body = entity.physicsBody && typeof entity.physicsBody === 'object' ? entity.physicsBody : {};
    if (body.material === material) return;
    entity.physicsBody = {
      ...body,
      schemaVersion: body.schemaVersion || 1,
      dynamic: false,
      ccd: false,
      material,
      mass: MASS_SEED_DEF.bodyMass,
      radius: MASS_SEED_DEF.radius,
      revision: Math.max(0, Math.trunc(finite(body.revision))) + 1,
    };
    const index = state && state.entityIndex;
    if (index && Number.isFinite(index.physicsStaticVersion)) index.physicsStaticVersion++;
  },

  // ── collapse / destroy / clear ───────────────────────────────────────────────────────────

  // Replacement path: the old seed is cut, ghosted, and retired into ms.dying for its 0.45s
  // collapse beat, because the mirror's lifecycle fields are immediately handed to the new seed.
  // (Using _beginCollapse here would orphan the old entity the moment the mirror moved on.)
  _retireLiveSeed(state, ms, reason) {
    const oldId = ms.seedId;
    this._cutSeedTethers(state, oldId, reason);
    const now = nowOf(state);
    const entity = state.entities && state.entities.get ? state.entities.get(oldId) : null;
    if (entity && entity.alive !== false) {
      const seedState = entity.data && entity.data.massSeedState;
      if (seedState) {
        seedState.phase = 'collapsing';
        seedState.tetherEligible = false;
      }
      this._authorBodyMaterial(state, entity, TRAVEL_MATERIAL); // contacts off for the collapse beat
      this.bus.emit('presentation:vfxCue', {
        id: 'massSeed.collapse',
        lane: 'utility',
        particles: 24,
        lights: 1,
        magnitude: 0.9,
        position: { x: entity.pos.x, z: entity.pos.z },
        material: 'energy',
        sourceId: oldId,
        targetId: null,
        flashReduced: true,
      });
    }
    this.bus.emit('massSeed:collapsing', { seedId: oldId, reason });
    if (!Array.isArray(ms.dying)) ms.dying = [];
    ms.dying.push({ id: oldId, despawnAt: now + MASS_SEED_DEF.collapseS, reason });
    while (ms.dying.length > DYING_CAP) this._finishDying(state, ms, ms.dying[0]);
  },

  _tickDying(state, ms) {
    const dying = ms && ms.dying;
    if (!Array.isArray(dying) || dying.length === 0) return;
    const now = nowOf(state);
    for (let i = dying.length - 1; i >= 0; i--) {
      if (now < dying[i].despawnAt) continue;
      this._finishDying(state, ms, dying[i]);
    }
  },

  _finishDying(state, ms, entry) {
    if (ms && Array.isArray(ms.dying)) {
      const index = ms.dying.indexOf(entry);
      if (index >= 0) ms.dying.splice(index, 1);
    }
    const entity = state.entities && state.entities.get ? state.entities.get(entry.id) : null;
    if (entity && entity.alive !== false) entity.alive = false;
    this.bus.emit('massSeed:collapsed', { seedId: entry.id, reason: entry.reason });
  },

  // Force-finish every retired seed (lifecycle clear / tracked-seed loss paths) so a collapse
  // beat never outlives the feature state that owns it — no ghost entities across boundaries.
  _flushDying(state, ms) {
    if (!ms || !Array.isArray(ms.dying)) return;
    for (const entry of [...ms.dying]) this._finishDying(state, ms, entry);
  },

  _attachmentsService() {
    const actions = this.registry && this.registry.get && this.registry.get('actions');
    if (actions && actions.kernel && actions.kernel.attachments) return actions.kernel.attachments;
    const combat = this.registry && this.registry.get && this.registry.get('combat');
    const kernel = combat && typeof combat.ensureKernel === 'function' ? combat.ensureKernel() : combat && combat.kernel;
    return kernel && kernel.attachments ? kernel.attachments : null;
  },

  _cutSeedTethers(state, seedId, reason) {
    const attachments = this._attachmentsService();
    const byId = state.combat && state.combat.attachments && state.combat.attachments.byId;
    if (!attachments || typeof attachments.cut !== 'function' || !byId) return 0;
    let cut = 0;
    for (const attachment of Object.values(byId)) {
      if (!attachment || attachment.state !== 'active' || attachment.targetId !== seedId) continue;
      const result = attachments.cut(attachment.id, null, reason);
      if (result && result.ok) {
        cut++;
        this.bus.emit('massSeed:tetherCut', {
          seedId,
          attachmentId: attachment.id,
          ownerId: attachment.ownerId,
          reason,
        });
      }
    }
    return cut;
  },

  _beginCollapse(state, ms, reason) {
    const entity = state.entities && state.entities.get ? state.entities.get(ms.seedId) : null;
    this._cutSeedTethers(state, ms.seedId, reason);
    const now = nowOf(state);
    ms.phase = 'collapsing';
    ms.collapseReason = reason;
    ms.collapseAt = now + MASS_SEED_DEF.collapseS;
    if (entity && entity.alive !== false) {
      const seedState = entity.data && entity.data.massSeedState;
      if (seedState) {
        seedState.phase = 'collapsing';
        seedState.tetherEligible = false;
      }
      this._authorBodyMaterial(state, entity, TRAVEL_MATERIAL); // contacts off for the collapse beat
      this.bus.emit('presentation:vfxCue', {
        id: 'massSeed.collapse',
        lane: 'utility',
        particles: 24,
        lights: 1,
        magnitude: 0.9,
        position: { x: entity.pos.x, z: entity.pos.z },
        material: 'energy',
        sourceId: ms.seedId,
        targetId: null,
        flashReduced: true,
      });
    }
    this.bus.emit('massSeed:collapsing', { seedId: ms.seedId, reason });
    if (reason === MASS_SEED_CUT_REASONS.expired || reason === MASS_SEED_CUT_REASONS.destroyed) {
      this.bus.emit('audio:cue', { id: 'sfx_explosion_small', gain: 0.45 });
    }
  },

  _finishCollapse(state, ms, entity) {
    const reason = ms.collapseReason || MASS_SEED_CUT_REASONS.expired;
    if (entity && entity.alive !== false) entity.alive = false;
    // Cooldown starts only when the LAST seed actually leaves the field — a replacement deploy
    // already launched its successor and never restarts the clock.
    if (reason !== MASS_SEED_CUT_REASONS.replaced) {
      ensurePlayerSeed(state).cooldownUntil = nowOf(state) + MASS_SEED_DEF.cooldownS;
    }
    this.bus.emit('massSeed:collapsed', { seedId: ms.seedId, reason });
    this._flushDying(state, ms);
    const denial = ms.lastDenial;
    state.massSeed = defaultRuntime();
    state.massSeed.lastDenial = denial;
  },

  _onSeedEntityLost(state, ms) {
    const reason = MASS_SEED_CUT_REASONS.destroyed;
    this._cutSeedTethers(state, ms.seedId, reason);
    // Bounded local cue on death (same pooled id as the expiry collapse): the kill itself may
    // leave no seed-specific visual otherwise. The dead entity is usually still present this
    // tick (pre-sweep); lockPos is the truthful fallback for an already-swept corpse.
    const corpse = state.entities && state.entities.get ? state.entities.get(ms.seedId) : null;
    const pos = corpse && corpse.pos ? corpse.pos : ms.lockPos;
    this.bus.emit('presentation:vfxCue', {
      id: 'massSeed.collapse',
      lane: 'utility',
      particles: 24,
      lights: 1,
      magnitude: 0.9,
      position: { x: pos.x, z: pos.z },
      material: 'energy',
      sourceId: ms.seedId,
      targetId: null,
      flashReduced: true,
    });
    this.bus.emit('massSeed:destroyed', { seedId: ms.seedId, reason });
    this.bus.emit('massSeed:collapsing', { seedId: ms.seedId, reason });
    ensurePlayerSeed(state).cooldownUntil = nowOf(state) + MASS_SEED_DEF.cooldownS;
    this.bus.emit('massSeed:collapsed', { seedId: ms.seedId, reason });
    this.bus.emit('audio:cue', { id: 'sfx_explosion_small', gain: 0.45 });
    this._flushDying(state, ms);
    const denial = ms.lastDenial;
    state.massSeed = defaultRuntime();
    state.massSeed.lastDenial = denial;
  },

  _clearSeed(reason, why) {
    const state = this.state;
    if (!state) return;
    const ms = ensureRuntime(state);
    if (ms.phase === 'idle' || ms.seedId == null) return;
    this._cutSeedTethers(state, ms.seedId, reason);
    const entity = state.entities && state.entities.get ? state.entities.get(ms.seedId) : null;
    if (entity && entity.alive !== false) entity.alive = false;
    this._flushDying(state, ms);
    this.bus.emit('massSeed:cleared', { seedId: ms.seedId, reason, why });
    state.massSeed = defaultRuntime();
  },

  // Save policy: NORMALIZE AWAY. Seed entities never serialize (not the player, not persistent),
  // so a loaded world contains no seed. The restored combat blob may still carry the attachment
  // that targeted the pre-save seed; cut it here with the exact lifecycle reason — before the
  // attachment orphan sweep would otherwise report a bare 'target_lost' — then reset the mirror.
  // Save/Continue therefore never duplicates the seed and never restores an orphan tether.
  _onSaveLoaded() {
    this._clearSeed(MASS_SEED_CUT_REASONS.cleared, 'save_loaded');
  },
};

// Test/consumer seam: is this entity currently a legal Massline latch target? Kept as a pure
// export so tetherGameplay's attachable gate and the focused tests share one truth.
export function isMassSeedTetherEligible(entity) {
  if (!entity || entity.type !== 'massSeed' || entity.alive === false) return false;
  const seedState = entity.data && entity.data.massSeedState;
  return !!(seedState && seedState.tetherEligible === true);
}
