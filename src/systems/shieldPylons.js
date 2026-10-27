// Linked Shield Pylons — Controlled Chaos packet 06.
//
// The pilot deploys ONE physical endpoint, then a second; a thin relation-selective shield panel
// stands between them. The player and permitted allies cross it freely both ways and shoot through
// it; hostile hulls and hostile rounds/beams/blasts/arcs stop at the first real intersection. The
// pair has one energy pool, strains, overloads, recovers or collapses, and tears down atomically.
//
// Ownership (read this before editing):
//   * This system owns the 'shield pylon' lifecycle, the endpoint entities it spawns (type
//     'fieldEmitter', data.shieldPylonEndpoint — the existing deployed-device family: damageable by
//     hostile fire through combat's single damage route, tether-skipped by fields/gyre), and the
//     runtime mirror `state.shieldPylons`. It is the ONE writer of pair energy and the ONE emitter
//     of the contact receipt `shieldPylon:contact`.
//   * Attack paths (projectile sweep in core/physics.js, beam rays in systems/combat.js, blast
//     occlusion in combat/physicalEffects.js, chain hops in combat/attackHit.js) call
//     src/combat/pylonShieldQuery.js — the shared geometry/eligibility read — and merely RECORD an
//     accepted interception into `mirror.inbox`. They never debit. This system drains the inbox once
//     per tick, so a hit is charged exactly once whichever path found it.
//   * Hulls and loose debris are stopped HERE, before physics: a swept disc test against the panel
//     predicts this tick's crossing and an impulse through the physics-command membrane cancels the
//     inbound normal speed. The energy the panel absorbs is that speed's kinetic energy; a ram it
//     cannot afford overloads the pair and the residual speed carries through. Nothing teleports.
//   * Credits move only through the economy's chargeCredits/grantCredits intents (beacon parity).
//
// Determinism: pure functions of (state, simTime, entity poses). No rng draw, no wall clock. The
// system is a strict no-op until a pylon is first deployed (no mirror, no input flag), is NOT in the
// sf-sim curated harness list, and the mirror is a runtime object that never serializes — the
// endpoint entities are not `flags.persistent`, so a save carries neither (save policy: every pair is
// cleared on save:loaded, sector change, new game, death and docking).

import { Masks, occupantGenerationOf } from '../core/entity.js';
import { maxFittedModuleMod } from '../core/fittedModules.js';
import { isHostileForAI } from '../ai/engagementAuthority.js';
import { queuePhysicsImpulse, resolvePhysicsBodySpec, isDynamicPhysicsBodyEntity } from '../core/physicsAuthority.js';
import {
  writePanel, makePanel, sweepDiscVsPanel, sweepDiscVsMovingPanel, distanceToAxis, discTouchesPanel, panelBounds,
} from '../combat/pylonShieldGeometry.js';
import { PYLON_CONTACT, blocksContact, classifyBody, contactEnergy } from '../combat/pylonShieldPolicy.js';
import { setPylonHostilityOracle, pylonMirror, relationOfBody } from '../combat/pylonShieldQuery.js';
import {
  SHIELD_PYLON_DEF as DEF, PYLON_STATES as S, PYLON_RETIRE_REASONS as WHY, PYLON_DENIALS as DENY,
  PYLON_DENIAL_TEXT, PYLON_NEXT_OP,
} from '../data/shieldPylons.js';

const EMITTER_TYPE = 'fieldEmitter';
const EMITTER_MATERIAL = 'projectile'; // ghost collider: projectile sweeps can hit it; ships do not broadphase against it
const SPAWN_AIM_PAD = 6;
const RECALL_AIM_RADIUS = 14;
const BODY_REACH_PAD = 6;

function finite(v, fallback = 0) { return Number.isFinite(v) ? v : fallback; }
function nowOf(state) { return Number.isFinite(state.simTime) ? state.simTime : (state.tick | 0) / 60; }
function lerp(a, b, t) { return a + (b - a) * t; }
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

// ── fitting ───────────────────────────────────────────────────────────────────────────────────

/** How many pairs the fitted projector supports (0 = not fitted). */
export function pylonCapacity(state) {
  return Math.max(0, Math.floor(maxFittedModuleMod(state, 'pylonPairs', 0)));
}

/** Capacity (SP) of a pair at a given span: a long wall is a thin wall. */
export function pylonCapacityForSpan(span) {
  const f = clamp01((span - DEF.minSpan) / Math.max(1, DEF.maxSpan - DEF.minSpan));
  return DEF.capacity * lerp(1, DEF.capacitySpanFloor, f);
}

// ── mirror ────────────────────────────────────────────────────────────────────────────────────

function ensureMirror(state) {
  let m = pylonMirror(state);
  if (m) return m;
  m = {
    schemaVersion: 1,
    seq: 0,
    pairs: [],
    collapsing: [],
    inbox: [],
    blocking: 0,
    version: 0,
    cooldownUntil: 0,
    lastDenial: null,
    lastContact: null,
  };
  // Query-side caches live on the mirror but must never show up in a snapshot or a hash.
  Object.defineProperty(m, 'relCache', { value: null, writable: true, enumerable: false, configurable: true });
  Object.defineProperty(m, 'relCacheTick', { value: -1, writable: true, enumerable: false, configurable: true });
  state.shieldPylons = m;
  return m;
}

function refOf(entity) {
  return { id: entity.id, life: occupantGenerationOf(entity) };
}

function resolveRef(state, ref) {
  if (!ref) return null;
  const e = state.entities && state.entities.get(ref.id);
  if (!e || e.alive === false) return null;
  return occupantGenerationOf(e) === ref.life ? e : null;
}

// ── placement planning (pure reads; the HUD preview and the deploy share this) ───────────────

function aimPointFor(state, player) {
  const inp = state.input || {};
  const aw = inp.aimWorld;
  let dx; let dz;
  if (aw && Number.isFinite(aw.x) && Number.isFinite(aw.z)) {
    dx = aw.x - player.pos.x; dz = aw.z - player.pos.z;
  } else {
    const angle = Number.isFinite(inp.aimAngle) ? inp.aimAngle : finite(player.rot);
    dx = Math.cos(angle) * 90; dz = Math.sin(angle) * 90;
  }
  let dist = Math.hypot(dx, dz);
  if (dist < 1e-6) { dx = Math.cos(finite(player.rot)); dz = Math.sin(finite(player.rot)); dist = 1; }
  const ux = dx / dist; const uz = dz / dist;
  const minReach = finite(player.radius, 6) + DEF.endpointRadius + SPAWN_AIM_PAD;
  const reach = Math.min(DEF.placeRange, Math.max(minReach, dist));
  return { x: player.pos.x + ux * reach, z: player.pos.z + uz * reach };
}

function siteBlocker(state, x, z, ignoreId) {
  const list = state.entityList || [];
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (!e || e.alive === false || !e.pos || e.id === ignoreId) continue;
    const t = e.type;
    if (t === 'projectile' || t === 'pickup' || t === 'fx' || t === 'bomb') continue;
    if (e.collides === false && t !== 'fieldEmitter') continue;
    const reach = DEF.endpointRadius + finite(e.radius) + DEF.placeClearance;
    const dx = e.pos.x - x; const dz = e.pos.z - z;
    if (dx * dx + dz * dz < reach * reach) return e;
  }
  return null;
}

const PLAN_OWNER = { ownerId: null };

function spanBlocker(state, ownerId, panel) {
  const list = state.entityList || [];
  PLAN_OWNER.ownerId = ownerId;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (!e || e.alive === false || !e.pos) continue;
    const cls = classifyBody(e);
    if (cls === 'exempt') continue;
    if (cls === 'debris' && !isDynamicPhysicsBodyEntity(e)) continue;
    const kind = cls === 'craft' ? PYLON_CONTACT.SHIP : PYLON_CONTACT.DEBRIS;
    if (!blocksContact(kind, relationOfBody(state, PLAN_OWNER, e))) continue;
    if (discTouchesPanel(panel, e.pos.x, e.pos.z, finite(e.radius), 2)) return e;
  }
  return null;
}

function nearestOwnEndpoint(state, m, ownerId, point) {
  if (!m) return null;
  let best = null; let bestD = RECALL_AIM_RADIUS;
  for (const pair of m.pairs) {
    if (pair.ownerId !== ownerId) continue;
    for (const ref of [pair.a, pair.b]) {
      const e = resolveRef(state, ref);
      if (!e) continue;
      const d = Math.hypot(e.pos.x - point.x, e.pos.z - point.z);
      if (d <= bestD) { bestD = d; best = pair; }
    }
  }
  return best;
}

/**
 * What would a deploy press do right now? Pure read; spends nothing, mutates nothing.
 *   { op: 'first' | 'second' | 'recall' | 'denied', ok, reason, text, pos, pair, span }
 * `op` names the NEXT operation: place the first endpoint, link the second, or recall the pair the
 * aim sits on. A denial carries the one reason (`PYLON_DENIALS`) and its player text.
 */
export function planPylonDeploy(state) {
  const deny = (reason, extra = null) => ({ op: 'denied', ok: false, reason, text: PYLON_DENIAL_TEXT[reason], pos: null, pair: null, span: 0, ...extra });
  if (!state || state.mode !== 'flight') return deny(DENY.mode);
  const capacity = pylonCapacity(state);
  if (!(capacity > 0)) return deny(DENY.notFitted);
  const player = state.entities && state.entities.get(state.playerId);
  if (!player || player.alive === false || !player.pos) return deny(DENY.mode);
  if (player.flags && player.flags.docked) return deny(DENY.mode);
  const m = pylonMirror(state);
  const aim = aimPointFor(state, player);
  const recall = nearestOwnEndpoint(state, m, player.id, aim);
  if (recall) return { op: 'recall', ok: true, reason: null, text: null, pos: aim, pair: recall, span: recall.span || 0 };
  const now = nowOf(state);
  if (m && now < m.cooldownUntil) return deny(DENY.cooldown);
  const unpaired = m ? m.pairs.find((p) => p.ownerId === player.id && p.state === S.UNPAIRED) || null : null;
  if (!unpaired) {
    const live = m ? m.pairs.filter((p) => p.ownerId === player.id).length : 0;
    if (live >= capacity) return deny(DENY.capacity);
  }
  if (finite(state.player && state.player.credits) < DEF.endpointCostCredits) return deny(DENY.funds);
  if (siteBlocker(state, aim.x, aim.z, null)) return deny(DENY.clearance);
  if (!unpaired) return { op: 'first', ok: true, reason: null, text: null, pos: aim, pair: null, span: 0 };
  const first = resolveRef(state, unpaired.a);
  if (!first) return deny(DENY.clearance);
  const span = Math.hypot(aim.x - first.pos.x, aim.z - first.pos.z);
  if (span < DEF.minSpan) return deny(DENY.tooClose, { span });
  if (span > DEF.maxSpan) return deny(DENY.tooFar, { span });
  const panel = makePanel(first.pos.x, first.pos.z, aim.x, aim.z, DEF.halfThickness);
  if (spanBlocker(state, player.id, panel)) return deny(DENY.occupiedSpan, { span });
  return { op: 'second', ok: true, reason: null, text: null, pos: aim, pair: unpaired, span };
}

/** The label the next press earns, for the HUD pill: names the operation, never a generic "use". */
export function pylonNextOperation(state) {
  const capacity = pylonCapacity(state);
  if (!(capacity > 0)) return { id: 'unfitted', label: PYLON_NEXT_OP.unfitted, ok: false };
  const plan = planPylonDeploy(state);
  if (plan.op === 'recall') return { id: 'recall', label: 'RECALL PAIR', ok: true };
  if (plan.op === 'second') return { id: 'second', label: PYLON_NEXT_OP.second, ok: true, span: plan.span };
  if (plan.op === 'first') return { id: 'first', label: PYLON_NEXT_OP.first, ok: true };
  if (plan.reason === DENY.capacity) return { id: 'full', label: PYLON_NEXT_OP.full, ok: false };
  const m = pylonMirror(state);
  const unpaired = m && m.pairs.some((p) => p.state === S.UNPAIRED);
  return { id: unpaired ? 'second' : 'first', label: unpaired ? PYLON_NEXT_OP.second : PYLON_NEXT_OP.first, ok: false, reason: plan.reason };
}

// ── the system ────────────────────────────────────────────────────────────────────────────────

export const shieldPylons = {
  name: 'shieldPylons',

  init(ctx) {
    for (const off of this._subs || []) { if (typeof off === 'function') off(); }
    this._subs = [];
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
    this._lastPressTick = -1;
    setPylonHostilityOracle(isHostileForAI);
    if (this.bus && typeof this.bus.on === 'function') {
      const clear = (reason) => () => this._clearAll(reason);
      // A pair never crosses a boundary: the endpoints are not persistent, so a save carries neither
      // the bodies nor the wall (policy: cleared on load, never restored as a free full-strength shield).
      this._subs = [
        this.bus.on('sector:exit', clear(WHY.cleared)),
        this.bus.on('sector:enter', clear(WHY.cleared)),
        this.bus.on('game:new', clear(WHY.cleared)),
        this.bus.on('save:loaded', clear(WHY.cleared)),
        this.bus.on('player:death', clear(WHY.ownerLost)),
        this.bus.on('dock:docked', clear(WHY.cleared)),
      ];
    }
  },

  destroy() {
    for (const off of this._subs || []) { if (typeof off === 'function') off(); }
    this._subs = [];
    setPylonHostilityOracle(null);
  },

  newGame() { this._clearAll(WHY.cleared); },

  update(dt, state) {
    const acts = state.input && state.input.actions;
    const pressed = !!(acts && acts.deployShieldPylon);
    if (pressed) acts.deployShieldPylon = false;
    let m = pylonMirror(state);
    if (!m && !pressed) return; // never deployed: a strict no-op
    if (state.mode !== 'flight') return;
    const now = nowOf(state);
    if (pressed && this._lastPressTick !== state.tick) {
      this._lastPressTick = state.tick; // one press, one spend, whichever input layer raised it
      this._deploy(state, now);
    }
    m = pylonMirror(state);
    if (!m) return;
    this._tick(state, m, dt, now);
  },

  // ── deployment ──────────────────────────────────────────────────────────────────────────────

  _deploy(state, now) {
    const plan = planPylonDeploy(state);
    if (!plan.ok) { this._deny(state, plan); return; }
    const player = state.entities.get(state.playerId);
    if (plan.op === 'recall') {
      this._retire(state, ensureMirror(state), plan.pair, WHY.recalled, now, { refundUnpaired: true });
      return;
    }
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return;
    const m = ensureMirror(state);
    // Spend exactly once, only after every check passed: a rejected placement costs nothing.
    this.bus.emit('economy:chargeCredits', { amount: DEF.endpointCostCredits, reason: 'shield_pylon_endpoint' });
    let pair = plan.pair;
    const role = pair ? 'B' : 'A';
    if (!pair) {
      pair = {
        id: `pyl_${++m.seq}`,
        ownerId: player.id,
        state: S.UNPAIRED,
        a: null, b: null,
        createdAt: now, linkedAt: 0, activeAt: 0, expireAt: now + DEF.unpairedLifetimeS, warnAt: 0,
        energy: 0, capacity: 0, pending: 0, lastHitAt: -1e9,
        overloadUntil: 0, recoverUntil: 0, warned: false,
        span: 0, panel: null, prevPanel: null, bounds: null, moving: false,
        strained: false, spent: DEF.endpointCostCredits,
      };
      m.pairs.push(pair);
    } else {
      pair.spent += DEF.endpointCostCredits;
    }
    advanceEntityIdPastOccupied(state);
    const entity = spawnEntity({
      type: EMITTER_TYPE,
      pos: { x: plan.pos.x, z: plan.pos.z },
      vel: { x: 0, z: 0 },
      rot: 0,
      radius: DEF.endpointRadius,
      hull: DEF.endpointHull,
      hullMax: DEF.endpointHull,
      collides: true,
      collisionMask: Masks.PROJECTILE,
      physicsBody: { dynamic: false, ccd: false, material: EMITTER_MATERIAL, mass: DEF.endpointMass, radius: DEF.endpointRadius },
      team: player.team,
      ownerId: player.id,
      ttl: DEF.unpairedLifetimeS + DEF.linkS + DEF.lifetimeS + 4, // hard backstop; the system retires first
      data: {
        kind: 'shield_pylon',
        shieldPylonEndpoint: true,
        pairId: pair.id,
        role,
        ownerId: player.id,
        radius: DEF.endpointRadius,
      },
    });
    if (!entity) {
      // Nothing was placed: undo the pair we just opened and give the credits back.
      if (role === 'A') m.pairs.splice(m.pairs.indexOf(pair), 1);
      this.bus.emit('economy:grantCredits', { amount: DEF.endpointCostCredits, reason: 'shield_pylon_refund' });
      return;
    }
    m.cooldownUntil = now + DEF.deployCooldownS;
    m.lastDenial = null;
    if (role === 'A') {
      pair.a = refOf(entity);
      m.version++;
      this.bus.emit('shieldPylon:placed', { pairId: pair.id, role, ownerId: player.id, pos: { x: entity.pos.x, z: entity.pos.z }, tick: state.tick });
      this.bus.emit('toast', { text: 'Pylon placed - aim and press again to link the second', kind: 'info', ttl: 2.2 });
      this.bus.emit('audio:cue', { id: 'confirm' });
      return;
    }
    pair.b = refOf(entity);
    pair.state = S.LINKING;
    pair.linkedAt = now;
    pair.activeAt = now + DEF.linkS;
    pair.expireAt = pair.activeAt + DEF.lifetimeS;
    const first = resolveRef(state, pair.a);
    for (const e of [first, entity]) { if (e) e.ttl = DEF.linkS + DEF.occupiedWaitS + DEF.lifetimeS + DEF.collapseS + 4; }
    this._refreshPose(state, pair, true);
    pair.capacity = pylonCapacityForSpan(pair.span);
    pair.energy = 0;
    m.version++;
    this.bus.emit('shieldPylon:placed', { pairId: pair.id, role, ownerId: player.id, pos: { x: entity.pos.x, z: entity.pos.z }, tick: state.tick });
    this.bus.emit('shieldPylon:linking', {
      pairId: pair.id, ownerId: player.id, activeAt: pair.activeAt, span: pair.span,
      a: { x: pair.panel.ax, z: pair.panel.az }, b: { x: pair.panel.bx, z: pair.panel.bz }, tick: state.tick,
    });
    this.bus.emit('toast', { text: `Pylons linking - the wall stands in ${DEF.linkS.toFixed(1)}s`, kind: 'good', ttl: 2.2 });
    this.bus.emit('audio:cue', { id: 'confirm' });
  },

  _deny(state, plan) {
    const m = pylonMirror(state);
    const now = nowOf(state);
    const rec = { reason: plan.reason, at: now };
    if (m) m.lastDenial = rec;
    this.bus.emit('shieldPylon:denied', { reason: plan.reason, text: plan.text, tick: state.tick });
    this.bus.emit('toast', { text: plan.text || 'Pylon refused', kind: 'warn', ttl: 2 });
    this.bus.emit('audio:cue', { id: 'ui_deny' });
  },

  // ── per-tick lifecycle ──────────────────────────────────────────────────────────────────────

  _tick(state, m, dt, now) {
    const pairs = m.pairs;
    // 1. Identity and pose. A pair whose endpoint or owner is gone tears down as one.
    for (let i = pairs.length - 1; i >= 0; i--) {
      const pair = pairs[i];
      const owner = state.entities.get(pair.ownerId);
      if (!owner || owner.alive === false) { this._retire(state, m, pair, WHY.ownerLost, now); continue; }
      const a = resolveRef(state, pair.a);
      const b = pair.b ? resolveRef(state, pair.b) : null;
      if (!a || (pair.b && !b)) { this._retire(state, m, pair, WHY.endpointDestroyed, now); continue; }
      if (pair.b) {
        this._refreshPose(state, pair, false);
        if (pair.span > DEF.maxSpan * DEF.snapSpanScale) { this._retire(state, m, pair, WHY.snapped, now); continue; }
        const cap = pylonCapacityForSpan(pair.span);
        if (pair.capacity !== cap) {
          pair.capacity = cap;
          if (pair.energy > cap) pair.energy = cap;
        }
      }
    }
    // 2. The single debit: drain what the attack paths and the hull pass accepted.
    this._drainInbox(state, m, now);
    // 3. State machine, regeneration, hull interception.
    for (let i = pairs.length - 1; i >= 0; i--) {
      const pair = pairs[i];
      if (pair.state === S.RETIRED) continue;
      this._advance(state, m, pair, dt, now);
    }
    let blocking = 0;
    for (const pair of pairs) if (pair.state === S.ACTIVE || pair.state === S.STRAINED) blocking++;
    if (blocking !== m.blocking) { m.blocking = blocking; m.version++; }
    // 4. Hull and debris interception for every pair that can block this tick.
    if (m.blocking > 0) this._interceptBodies(state, m, dt, now);
    // 5. Presenter-only collapse records age out.
    for (let i = m.collapsing.length - 1; i >= 0; i--) if (now >= m.collapsing[i].until) m.collapsing.splice(i, 1);
  },

  /**
   * Publish the pair's footprint from its live endpoint bodies. `panel` is this tick's pose,
   * `prevPanel` last tick's (equal while the endpoints stand still); `moving` tells the attack paths
   * whether to use the moving-panel sweep.
   */
  _refreshPose(state, pair, first) {
    const a = resolveRef(state, pair.a);
    const b = resolveRef(state, pair.b);
    if (!a || !b) return;
    if (first || !pair.panel) {
      pair.panel = makePanel(a.pos.x, a.pos.z, b.pos.x, b.pos.z, DEF.halfThickness);
      pair.prevPanel = makePanel(a.pos.x, a.pos.z, b.pos.x, b.pos.z, DEF.halfThickness);
      pair.moving = false;
    } else {
      const cur = pair.panel;
      writePanel(pair.prevPanel, cur.ax, cur.az, cur.bx, cur.bz, cur.h);
      writePanel(cur, a.pos.x, a.pos.z, b.pos.x, b.pos.z, DEF.halfThickness);
      pair.moving = Math.hypot(cur.ax - pair.prevPanel.ax, cur.az - pair.prevPanel.az) > 1e-6
        || Math.hypot(cur.bx - pair.prevPanel.bx, cur.bz - pair.prevPanel.bz) > 1e-6;
    }
    pair.span = pair.panel.len;
    pair.bounds = panelBounds(pair.panel, DEF.endpointRadius + BODY_REACH_PAD, pair.bounds);
  },

  _drainInbox(state, m, now) {
    const inbox = m.inbox;
    if (inbox.length === 0) { for (const p of m.pairs) p.pending = 0; return; }
    const byId = new Map();
    for (const p of m.pairs) { byId.set(p.id, p); p.pending = 0; }
    for (let i = 0; i < inbox.length; i++) {
      const rec = inbox[i];
      const pair = byId.get(rec.pairId);
      if (!pair || pair.state === S.RETIRED) continue;
      // A panel already offline/arming absorbs nothing: the interception was decided against an
      // earlier state, so the charge is clamped to what is left.
      const before = pair.energy;
      pair.energy = Math.max(0, pair.energy - rec.amount);
      pair.lastHitAt = now;
      const spent = before - pair.energy;
      m.lastContact = { pairId: pair.id, kind: rec.kind, at: now, x: rec.x, z: rec.z };
      this.bus.emit('shieldPylon:contact', {
        pairId: pair.id, kind: rec.kind, amount: spent, requested: rec.amount,
        x: rec.x, z: rec.z, nx: rec.nx, nz: rec.nz,
        energyFrac: pair.capacity > 0 ? pair.energy / pair.capacity : 0,
        sourceId: rec.sourceId != null ? rec.sourceId : null,
        tick: state.tick,
      });
    }
    inbox.length = 0;
  },

  _advance(state, m, pair, dt, now) {
    switch (pair.state) {
      case S.UNPAIRED:
        if (now >= pair.expireAt) this._retire(state, m, pair, WHY.expired, now);
        return;
      case S.LINKING: {
        if (now < pair.activeAt) return;
        // The arming beat holds while a body the wall would stop is inside the span.
        if (spanBlocker(state, pair.ownerId, pair.panel)) {
          if (now - pair.activeAt > DEF.occupiedWaitS) this._retire(state, m, pair, WHY.occupied, now);
          return;
        }
        pair.state = S.ACTIVE;
        pair.energy = pair.capacity;
        pair.expireAt = now + DEF.lifetimeS;
        pair.warnAt = pair.expireAt - DEF.warnS;
        m.version++;
        this.bus.emit('shieldPylon:active', { pairId: pair.id, ownerId: pair.ownerId, expireAt: pair.expireAt, capacity: pair.capacity, tick: state.tick });
        return;
      }
      case S.ACTIVE:
      case S.STRAINED: {
        if (now >= pair.expireAt) { this._retire(state, m, pair, WHY.expired, now); return; }
        if (!pair.warned && now >= pair.warnAt) {
          pair.warned = true;
          this.bus.emit('shieldPylon:warning', { pairId: pair.id, expireAt: pair.expireAt, remainingS: pair.expireAt - now, tick: state.tick });
        }
        if (pair.energy <= 0) { this._overload(state, m, pair, now); return; }
        // Quiet time restores the pool; sustained pressure does not.
        if (now - pair.lastHitAt >= DEF.regenDelayS && pair.energy < pair.capacity) {
          pair.energy = Math.min(pair.capacity, pair.energy + DEF.regenPerS * (pair.capacity / DEF.capacity) * dt);
        }
        const frac = pair.capacity > 0 ? pair.energy / pair.capacity : 0;
        if (pair.state === S.ACTIVE && frac <= DEF.strainedFrac) {
          pair.state = S.STRAINED;
          this.bus.emit('shieldPylon:strained', { pairId: pair.id, energyFrac: frac, tick: state.tick });
        } else if (pair.state === S.STRAINED && frac > DEF.strainedFrac + 0.1) {
          pair.state = S.ACTIVE;
        }
        return;
      }
      case S.OVERLOADED:
        if (now >= pair.expireAt) { this._retire(state, m, pair, WHY.expired, now); return; }
        if (now >= pair.overloadUntil) {
          pair.state = S.RECOVERING;
          pair.recoverUntil = now + DEF.recoverS;
          m.version++;
        }
        return;
      case S.RECOVERING:
        if (now >= pair.expireAt) { this._retire(state, m, pair, WHY.expired, now); return; }
        if (now < pair.recoverUntil) return;
        // Do not come back online around a hull that the wall would then have to shove.
        if (spanBlocker(state, pair.ownerId, pair.panel) && now - pair.recoverUntil < DEF.occupiedWaitS) return;
        pair.state = S.ACTIVE;
        pair.energy = pair.capacity * DEF.recoverEnergyFrac;
        pair.lastHitAt = now;
        m.version++;
        this.bus.emit('shieldPylon:recovered', { pairId: pair.id, energyFrac: DEF.recoverEnergyFrac, tick: state.tick });
        return;
      default:
    }
  },

  _overload(state, m, pair, now) {
    pair.state = S.OVERLOADED;
    pair.energy = 0;
    pair.overloadUntil = now + DEF.overloadS;
    m.version++;
    this.bus.emit('shieldPylon:overloaded', {
      pairId: pair.id, ownerId: pair.ownerId, until: pair.overloadUntil, tick: state.tick,
      a: { x: pair.panel.ax, z: pair.panel.az }, b: { x: pair.panel.bx, z: pair.panel.bz },
    });
    this.bus.emit('toast', { text: 'Pylon wall overloaded - offline', kind: 'warn', ttl: 2.2 });
  },

  /** Atomic teardown: the wall, both endpoints and any queued charges leave together. Idempotent. */
  _retire(state, m, pair, reason, now, opts = null) {
    if (!pair || pair.state === S.RETIRED) return false;
    const wasUnpaired = pair.state === S.UNPAIRED;
    let snapshot = pair.panel ? { ax: pair.panel.ax, az: pair.panel.az, bx: pair.panel.bx, bz: pair.panel.bz, h: pair.panel.h } : null;
    if (!snapshot) {
      // An unpaired endpoint collapses as a lone post (a degenerate footprint at its body).
      const lone = resolveRef(state, pair.a);
      if (lone) snapshot = { ax: lone.pos.x, az: lone.pos.z, bx: lone.pos.x, bz: lone.pos.z, h: DEF.halfThickness };
    }
    const energyFrac = pair.capacity > 0 ? pair.energy / pair.capacity : 0;
    pair.state = S.RETIRED;
    pair.retireReason = reason;
    const index = m.pairs.indexOf(pair);
    if (index >= 0) m.pairs.splice(index, 1);
    for (const ref of [pair.a, pair.b]) {
      const e = resolveRef(state, ref);
      if (e) e.alive = false;
    }
    // Charges queued against a pair that no longer exists never land on anything else.
    if (m.inbox.length) m.inbox = m.inbox.filter((rec) => rec.pairId !== pair.id);
    if (snapshot) {
      m.collapsing.push({ pairId: pair.id, reason, at: now, until: now + DEF.collapseS, energyFrac, ...snapshot });
      if (m.collapsing.length > 8) m.collapsing.shift();
    }
    m.version++;
    if (opts && opts.refundUnpaired && wasUnpaired && pair.spent > 0) {
      this.bus.emit('economy:grantCredits', { amount: pair.spent, reason: 'shield_pylon_recall' });
    }
    this.bus.emit('shieldPylon:retired', {
      pairId: pair.id, reason, ownerId: pair.ownerId, wasUnpaired, energyFrac, ...(snapshot || {}), tick: state.tick,
    });
    if (reason === WHY.endpointDestroyed || reason === WHY.expired || reason === WHY.snapped || reason === WHY.occupied) {
      const text = reason === WHY.endpointDestroyed ? 'Pylon destroyed - the wall collapses'
        : reason === WHY.expired ? 'Pylon wall expired'
          : reason === WHY.snapped ? 'Pylons stretched too far - the wall snaps'
            : 'Pylon wall could not form - a body held the span';
      this.bus.emit('toast', { text, kind: 'warn', ttl: 2.2 });
    }
    return true;
  },

  _clearAll(reason) {
    const state = this.state;
    const m = pylonMirror(state);
    if (!m) return;
    const now = nowOf(state);
    for (const pair of [...m.pairs]) this._retire(state, m, pair, reason, now);
    m.pairs.length = 0;
    m.inbox.length = 0;
    m.collapsing.length = 0;
    m.blocking = 0;
    m.version++;
  },

  // ── hulls and loose debris ──────────────────────────────────────────────────────────────────

  _interceptBodies(state, m, dt, now) {
    const list = state.entityList || [];
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e || e.alive === false || !e.pos || !e.vel) continue;
      const cls = classifyBody(e);
      if (cls === 'exempt') continue;
      if (cls === 'debris' && !isDynamicPhysicsBodyEntity(e)) continue;
      const radius = finite(e.radius);
      const kind = cls === 'craft' ? PYLON_CONTACT.SHIP : PYLON_CONTACT.DEBRIS;
      const speed = Math.hypot(e.vel.x, e.vel.z);
      for (let k = 0; k < m.pairs.length; k++) {
        const pair = m.pairs[k];
        if (pair.state !== S.ACTIVE && pair.state !== S.STRAINED) continue;
        if (!(pair.energy - pair.pending > 0)) continue;
        const reach = DEF.halfThickness + radius + 2 * speed * dt + DEF.interceptBandPad;
        if (distanceToAxis(pair.panel, e.pos.x, e.pos.z) > reach) continue;
        if (!blocksContact(kind, relationOfBody(state, pair, e))) continue;
        this._stopBody(state, m, pair, e, kind, radius, dt, now);
      }
    }
  },

  _stopBody(state, m, pair, e, kind, radius, dt, now) {
    const x0 = e.pos.x; const z0 = e.pos.z;
    const x1 = x0 + e.vel.x * dt; const z1 = z0 + e.vel.z * dt;
    const hit = pair.moving
      ? sweepDiscVsMovingPanel(HULL_HIT, pair.prevPanel, pair.panel, x0, z0, x1, z1, radius)
      : sweepDiscVsPanel(HULL_HIT, pair.panel, x0, z0, x1, z1, radius);
    if (!hit) return;
    const nx = HULL_HIT.nx; const nz = HULL_HIT.nz;
    const vn = e.vel.x * nx + e.vel.z * nz;
    const spec = resolvePhysicsBodySpec(e);
    const mass = spec && spec.mass > 0 ? spec.mass : 1;
    if (HULL_HIT.startInside) {
      // Overlapping the footprint (an overload let it through, or something shoved it in): push out
      // toward the nearest face at a bounded speed. Not a teleport and not an attack.
      const want = DEF.pushOutSpeed;
      if (vn < want) {
        const dv = want - vn;
        queuePhysicsImpulse(e, { x: nx * mass * dv, z: nz * mass * dv }, PYLON_IMPULSE);
      }
      return;
    }
    if (!(vn < 0)) return; // not closing on the wall
    const available = pair.energy - pair.pending;
    const cost = contactEnergy(kind, { mass, dv: -vn }, DEF);
    let newVn = 0;
    let charged = cost;
    if (cost > available) {
      // A ram the pair cannot afford: it absorbs what it has, the pair overloads, and the body keeps
      // the kinetic energy that was left over. Energy-conserving, bounded, no teleport.
      const keKept = Math.max(0, 0.5 * mass * vn * vn - available * DEF.shipEnergyDiv);
      newVn = -Math.sqrt(2 * keKept / mass);
      charged = available;
    }
    const dv = newVn - vn; // positive: along the outward normal
    if (dv > 0) queuePhysicsImpulse(e, { x: nx * mass * dv, z: nz * mass * dv }, PYLON_IMPULSE);
    if (charged > 0) {
      m.inbox.push({
        pairId: pair.id, kind, amount: charged, x: HULL_HIT.x, z: HULL_HIT.z, nx, nz, tick: state.tick, bodyId: e.id,
      });
      pair.pending += charged;
    }
  },
};

const HULL_HIT = { t: 0, cx: 0, cz: 0, x: 0, z: 0, nx: 0, nz: 1, side: 0, startInside: false, part: '' };
const PYLON_IMPULSE = Object.freeze({ tag: 'shield_pylon', externalEffect: false });

/**
 * Reserved-id spawns (tests, authored hulls) do not bump nextEntityId. Skip occupied ids before an
 * endpoint spawn so it can never replace the player or a pinned target (same guard the field emitter
 * uses; this is not a second id allocator).
 */
function advanceEntityIdPastOccupied(state) {
  if (!state || !state.entities || typeof state.entities.has !== 'function') return;
  if (Array.isArray(state.freeIds) && state.freeIds.length > 0) {
    state.freeIds = state.freeIds.filter((id) => Number.isSafeInteger(id) && id > 0 && !state.entities.has(id));
  }
  let next = Number.isSafeInteger(state.nextEntityId) && state.nextEntityId > 0 ? state.nextEntityId : 1;
  while (state.entities.has(next)) next += 1;
  state.nextEntityId = next;
}
