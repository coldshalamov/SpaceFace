// Rows 482 (ROCK-GUN ledger), 483 (ROCK-KATAMARI Line rating), 484 (ROCK-FLAIL chain),
// 485 (ROCK-ARENAS scale + camera open). Single registered owner of `state.rockCore`.
//
// The rock is the gun: this system publishes the in-run Line rating in tonnes — the total
// mass currently riding the player's lines — and derives three player-visible projections:
//   * unlocked throw class → newly-movable bodies get lit in Line colour (`line:unlocked`)
//   * winch scale → the winch drum on the player's hull visibly grows
//   * arena scale + camera open → the room and the frame widen with the rating
// It also keeps the flail: chained wrecks behind the player, a bounded distance-constraint
// chain of at most LINE_FLAIL_MAX_LINKS links, resolved deterministically post-physics.
// And it files survival waves-1–10 kills into impact/gun/other buckets so the rock-gun
// share is a durable fact, not a vibe.
//
// Determinism: reads state.simTime / state.tick only; no Math.random, no wall clock.
// Presentation is read-only: consumers read state.rockCore and the events below.

import {
  LINE_RATING_THRESHOLDS_T, LINE_RATING_TIER_MAX,
  LINE_THROW_CLASSES, LINE_THROW_RADIUS_MAX,
  lineTierForRating, lineThrowTierForBody, lineUnlockedClass,
  lineArenaScale, lineCameraOpen, lineWinchScale,
  LINE_FLAIL_MAX_LINKS, LINE_FLAIL_MIN_TIER, LINE_FLAIL_SOLVER_PASSES,
  LINE_FLAIL_DAMPING, lineFlailLinkGap,
} from '../data/lineRating.js';
import { rockGunKillBucket, ROCK_GUN_WAVE_MAX } from '../data/rockGunTape.js';

export const ROCK_CORE_EVENTS = Object.freeze({
  ratingChanged: 'line:ratingChanged',
  unlocked: 'line:unlocked',          // {tier, throwClass} — newly-movable class lit
  flailChanged: 'line:flailChanged',  // {links:[entityId]} — chain membership changed
});

const MASSLINE_DEFS = new Set(['attachment_massline', 'tether_standard', 'attachment_flail_link']);

function entityOf(state, id) {
  if (id == null) return null;
  try { return state.entities.get(id) || null; } catch { return null; }
}

function bodyMassT(e) {
  if (!e) return 0;
  if (Number.isFinite(e.rockTonnage)) return e.rockTonnage;
  if (Number.isFinite(e.mass)) return e.mass;
  return 0;
}

/** Bodies currently riding the player's lines — active combat attachments where the player
 * is an endpoint and the other end is a physical body. */
function playerLineBodies(state) {
  const out = [];
  const byId = state?.combat?.attachments?.byId;
  const playerId = state?.playerId;
  if (!byId || playerId == null) return out;
  for (const key in byId) {
    if (!Object.hasOwn(byId, key)) continue;
    const a = byId[key];
    if (!a || a.state !== 'active') continue;
    if (!MASSLINE_DEFS.has(a.defId)) continue;
    const otherId = a.ownerId === playerId ? a.targetId
      : a.targetId === playerId ? a.ownerId : null;
    if (otherId == null) continue;
    const body = entityOf(state, otherId);
    if (body && body.alive !== false && body.pos) out.push(body);
  }
  return out;
}

export function createRockCoreSystem() {
  return {
    name: 'rockCore',
    init(ctx) {
      if (!ctx?.state || !ctx?.bus?.on || !ctx.bus.emit) throw new TypeError('rockCore requires state and event bus');
      this.state = ctx.state;
      this.bus = ctx.bus;
      this._unsubs = [];
      this.state.rockCore = {
        schema: 1,
        ratingT: 0,
        tier: 0,
        throwClass: LINE_THROW_CLASSES[0],
        unlockedClass: LINE_THROW_CLASSES[0],
        unlockedTier: 0,
        lineBodies: 0,
        flail: { links: [] },
        arenaScale: lineArenaScale(0),
        cameraOpen: lineCameraOpen(0),
        winchScale: lineWinchScale(0),
        killLedger: { impact: 0, gun: 0, other: 0, waves: ROCK_GUN_WAVE_MAX },
      };
      this._unsubs.push(this.bus.on('entity:killed', (p) => this._onKill(p)));
      this._unsubs.push(this.bus.on('game:new', () => this._resetLedger()));
      // Row 484: tetherGameplay offers a second catch to the flail before denying on the
      // per-owner line limit. Mutating offer.accepted is the synchronous handshake.
      this._unsubs.push(this.bus.on('massline:flailOffer', (p) => {
        if (p && p.accepted !== true) p.accepted = this.chainFlailLink(p.targetId);
      }));
      this._unsubs.push(this.bus.on('tether:released', (p) => {
        if (p && p.targetId != null) this.releaseFlailLink(p.targetId);
      }));
    },

    _resetLedger() {
      const rc = this.state?.rockCore;
      if (rc) rc.killLedger = { impact: 0, gun: 0, other: 0, waves: ROCK_GUN_WAVE_MAX };
    },

    _onKill(payload) {
      const state = this.state;
      if (!state || !payload) return;
      // Only waves 1–10 of a survival run count toward the rock-gun share.
      const run = state.run;
      if (!run || run.kind !== 'survival') return;
      const wave = Number.isFinite(run.wave) ? run.wave : null;
      if (wave != null && (wave < 1 || wave > ROCK_GUN_WAVE_MAX)) return;
      // Player-attributed kills only: the pilot's rock, the pilot's physics.
      const playerCaused = payload.presentation?.playerCaused === true
        || payload.killerId === state.playerId
        || payload.ownerId === state.playerId;
      if (!playerCaused) return;
      const bucket = rockGunKillBucket(payload);
      state.rockCore.killLedger[bucket]++;
    },

    update(_dt, state = this.state) {
      const rc = state?.rockCore;
      if (!rc) return;
      const playerId = state.playerId;
      const player = entityOf(state, playerId);

      // ── 483: rating = tonnes riding the Line ──────────────────────────────
      const bodies = playerLineBodies(state);
      // The flail chain also rides the Line — its wrecks count toward the rating.
      const seen = new Set(bodies.map((b) => b.id));
      for (const link of rc.flail.links) {
        const b = entityOf(state, link.id);
        if (b && b.alive !== false && !seen.has(b.id)) { bodies.push(b); seen.add(b.id); }
      }
      let tonnes = 0;
      for (const b of bodies) tonnes += bodyMassT(b);
      rc.lineBodies = bodies.length;
      const ratingT = Math.round(tonnes * 10) / 10;
      const tier = lineTierForRating(ratingT);
      if (ratingT !== rc.ratingT || tier !== rc.tier) {
        const prevTier = rc.tier;
        rc.ratingT = ratingT;
        rc.tier = tier;
        rc.throwClass = LINE_THROW_CLASSES[tier];
        rc.arenaScale = lineArenaScale(tier);
        rc.cameraOpen = lineCameraOpen(tier);
        rc.winchScale = lineWinchScale(tier);
        if (tier > prevTier) {
          // Newly-movable class: paint it in Line colour (presentation reads this + event).
          rc.unlockedClass = lineUnlockedClass(tier);
          rc.unlockedTier = tier;
          this.bus.emit(ROCK_CORE_EVENTS.unlocked, Object.freeze({
            tier, throwClass: rc.unlockedClass,
            radiusMax: LINE_THROW_RADIUS_MAX[tier], ratingT,
          }));
        }
        this.bus.emit(ROCK_CORE_EVENTS.ratingChanged, Object.freeze({
          ratingT, tier, bodies: bodies.length,
          thresholdsT: LINE_RATING_THRESHOLDS_T[tier] ?? null,
        }));
      }
      // Published for the camera composition floor + arena dressing (read-only consumers).
      rc.cameraZoomFloor = rc.cameraOpen;
      rc.arenaRadiusScale = rc.arenaScale;
      rc.winchDrumScale = rc.winchScale;

      // ── 484: flail chain membership + bounded constraint solve ────────────
      this._tickFlail(state, rc, player, tier);
    },

    /** A body qualifies for chaining when the Line can move it (tier gate), it is a physical
     * wreck/rock, and it is not already the active throw or already a link. */
    _flailCandidate(state, rc, entityId) {
      if (rc.flail.links.length >= LINE_FLAIL_MAX_LINKS) return false;
      if (rc.flail.links.some((l) => l.id === entityId)) return false;
      const b = entityOf(state, entityId);
      if (!b || b.alive === false || !b.pos) return false;
      return lineThrowTierForBody(b) >= 1; // boulder-class and up chain as wreck links
    },

    /** Chain a body onto the Line. Called by tetherGameplay's massline offer path (event
     * `massline:flailOffer`) and directly in tests; bounded at five links. */
    chainFlailLink(entityId) {
      const rc = this.state?.rockCore;
      if (!rc || rc.tier < LINE_FLAIL_MIN_TIER) return false;
      if (!this._flailCandidate(this.state, rc, entityId)) return false;
      const b = entityOf(this.state, entityId);
      rc.flail.links.push({ id: entityId, gapWu: lineFlailLinkGap(b) });
      this.bus.emit(ROCK_CORE_EVENTS.flailChanged, Object.freeze({
        links: Object.freeze(rc.flail.links.map((l) => l.id)),
      }));
      return true;
    },

    releaseFlailLink(entityId) {
      const rc = this.state?.rockCore;
      if (!rc) return false;
      const idx = rc.flail.links.findIndex((l) => l.id === entityId);
      if (idx < 0) return false;
      rc.flail.links.splice(idx, 1);
      this.bus.emit(ROCK_CORE_EVENTS.flailChanged, Object.freeze({
        links: Object.freeze(rc.flail.links.map((l) => l.id)),
      }));
      return true;
    },

    _tickFlail(state, rc, player, tier) {
      const links = rc.flail.links;
      if (!links.length) return;
      // Prune dead/freed links — a released or destroyed wreck leaves the chain.
      for (let i = links.length - 1; i >= 0; i--) {
        const b = entityOf(state, links[i].id);
        if (!b || b.alive === false || !b.pos) { links.splice(i, 1); }
      }
      // Below chaining tier the Line can't hold wrecks: shed links, keep the event honest.
      if (tier < LINE_FLAIL_MIN_TIER && links.length) {
        links.length = 0;
        this.bus.emit(ROCK_CORE_EVENTS.flailChanged, Object.freeze({ links: Object.freeze([]) }));
        return;
      }
      if (!player || !player.pos) return;
      // Distance-constraint chain: link i follows link i-1's body (player anchors link 0).
      // Bounded iterations; damping keeps five links stable at 60 Hz fixed step.
      for (let pass = 0; pass < LINE_FLAIL_SOLVER_PASSES; pass++) {
        let anchor = player;
        for (const link of links) {
          const b = entityOf(state, link.id);
          if (!b || !b.pos) continue;
          const dx = b.pos.x - anchor.pos.x;
          const dz = b.pos.z - anchor.pos.z;
          const dist = Math.hypot(dx, dz);
          const gap = link.gapWu;
          if (dist > gap && dist > 1e-6) {
            const over = (dist - gap) / dist;
            const corrX = dx * over, corrZ = dz * over;
            b.pos.x -= corrX;
            b.pos.z -= corrZ;
            // Bleed radial velocity so the link settles instead of ringing.
            if (b.vel) {
              const nx = dx / dist, nz = dz / dist;
              const vr = (b.vel.x || 0) * nx + (b.vel.z || 0) * nz;
              if (vr > 0) { b.vel.x -= vr * nx * (1 - LINE_FLAIL_DAMPING); b.vel.z -= vr * nz * (1 - LINE_FLAIL_DAMPING); }
            }
          }
          anchor = b;
        }
      }
    },

    destroy() {
      for (const u of this._unsubs || []) if (typeof u === 'function') u();
      this._unsubs = null;
      this.state = null;
      this.bus = null;
    },
  };
}

export const rockCore = createRockCoreSystem();
