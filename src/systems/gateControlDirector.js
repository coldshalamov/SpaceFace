// gateControlDirector.js — BP-11 packet A8 "Gate Traffic-Control", the SEEDED DIRECTOR.
// (See design/revamp/detail/A_sector_station.md packet A8.)
//
// Fires a deterministic gate scene on jump:chargeStart (the moment the player commits to a gate
// jump). It CANNOT deadlock the jump: world.js owns the jump timer independently, so this director
// is purely additive comms/credits/spawn during the charge window. The explicit expiry sweep below
// is the "wait N seconds then proceed" fallback made testable — it guarantees BUDGET progress even
// if a jump event is ever missed.
//
// Mirrors encounterDirector's rng discipline (mulberry32(hash32(seed, sectorId, gateTo, dayIndex)))
// and single-writer / spawnBudget contracts:
//   * TOLL: emit economy:chargeCredits {reason:'gate:toll'} — NEVER a direct credit write (economy
//     is the sole writer). Amount is seeded/fixed, never per-frame. Banded (data/gateControl.js) so
//     it never stacks with world's own high-sec 'gate_toll'.
//   * SCAN WING: request(n≤2, wingId) from spawnBudget; spawn team-2 passive patrol (never hostile);
//     release on jump / abort / timeout, and per-entity on entity:destroyed. Never stacks on a gate
//     that already has a live hostile (the ambush-no-stack gate).
//   * HOSTILITY: a wanted player skips the polite scene via scanner.isHostileToPlayer against a
//     synthetic lawful-guard probe (factionId-free — the same read the AI uses). No combatants are
//     spawned here; the AI stack handles a wanted player's actual hostility.
//   * VOICE: exactly one 'comms' line per scene (zero on silent / cooldown).
//   * Per-gate cooldown kills toll-farming / abort-respam double-charges without perturbing the
//     first-scene-of-the-day determinism the spec pins.
//
// Determinism/golden: owns state.gateControl ONLY (not in the sim-snapshot whitelist → invisible to
// the 47-A hash). In 47-A nothing jumps a gate, so this director never fires → fully inert.
//
// noTouch honored: world.js / encounterDirector.js / economy.js / scanner.js / combat.js /
// bindings.js are imported read-only where needed, never edited.

import { hash32, mulberry32 } from '../core/rng.js';
import { planGateScene, WING_MAX } from '../data/gateControl.js';
import { isHostileToPlayer } from './scanner.js';
import { makeShipEntitySpec } from './ships.js';

const DAY_SECONDS = 600;
const REPEAT_COOLDOWN_S = 120;   // min gap between scenes on the SAME gate (anti toll-farm / respam)
const GATE_CLEAR_R = 400;        // a live hostile within this of the gate suppresses the scan wing
const MIN_TTL_S = 20;            // scene budget-fallback floor
const WING_SHIP = 'ship_wasp';
const LAW_TEAM = 2;              // civilian/neutral — scanner returns false for team 2 (never hostile)

// Synthetic lawful-guard probes: isHostileToPlayer(probe, playerTeam, state) reduces to
// isPlayerWanted(state) for a lawful non-{player,0,2}-team entity — the factionId-free "is the
// player in a hostile standing" read. Frozen once; the alt covers the playerTeam===3 edge.
const WANTED_PROBE = Object.freeze({ team: 3, data: Object.freeze({ ai: Object.freeze({ lawful: true }) }) });
const WANTED_PROBE_ALT = Object.freeze({ team: 4, data: Object.freeze({ ai: Object.freeze({ lawful: true }) }) });

export const gateControlDirector = {
  name: 'gateControlDirector',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || (ctx.helpers = {});
    ensureState(this.state);
    if (this.bus && typeof this.bus.on === 'function') {
      this._onCharge = (p) => this._onChargeStart(p, this.state);
      this._onJump = () => this._resolveScene(this.state, 'jump');
      this._onAbort = () => this._resolveScene(this.state, 'abort');
      this._onGone = (p) => this._onEntityDestroyed(p);
      this._onExit = (p) => this._onSectorExit(p);
      this._onLoaded = () => this._onSaveLoaded();
      this.bus.on('jump:chargeStart', this._onCharge);
      this.bus.on('jump:start', this._onJump);
      this.bus.on('jump:arrive', this._onJump);        // belt-and-braces (resolve if start was missed)
      this.bus.on('jump:chargeAbort', this._onAbort);
      this.bus.on('entity:destroyed', this._onGone);
      this.bus.on('sector:exit', this._onExit);
      this.bus.on('save:loaded', this._onLoaded);
    }
  },

  newGame() { this.state.gateControl = freshState(); },

  // 1 Hz janitor ONLY (mode-independent): the timed fallback that guarantees the wing budget is
  // freed even if a jump event never lands. No pacing pump — the scene is event-driven on charge.
  update(dt, state) {
    const g = ensureState(state);
    g.accum = (g.accum || 0) + dt;
    if (g.accum < 1) return;
    g.accum = 0;
    const now = state.simTime || 0;
    if (g.scene && now >= g.scene.expiresAt) this._resolveScene(state, 'timeout');
  },

  _onChargeStart(p, state) {
    if (!p || p.via !== 'gate') return;                 // drive/hot-jumps get no customs scene
    const g = ensureState(state);
    if (g.scene) this._resolveScene(state, 'superseded'); // defensive: never leak a prior scene's slots
    const sectorId = currentSectorId(state);
    const gateTo = p.targetSectorId;
    if (!sectorId || gateTo == null) return;
    const now = state.simTime || 0;
    const gateKey = `${sectorId}>${gateTo}`;

    // Per-gate cooldown (pure state gate; no RNG) — the anti-respam / anti-double-charge valve.
    const last = g.lastSceneAt[gateKey];
    if (Number.isFinite(last) && now - last < REPEAT_COOLDOWN_S) return;

    const sector = activeSector(state);
    const factionId = sector && sector.factionId || null;
    const security = Number.isFinite(sector && sector.security) ? sector.security : 0.5;
    const wanted = this._isWanted(state);
    const day = Math.floor(now / DAY_SECONDS);
    const scene = planGateScene(state.meta && state.meta.seed, sectorId, gateTo, day, { factionId, security, wanted });
    g.lastSceneAt[gateKey] = now;
    pruneOld(g.lastSceneAt, now);

    // One comms line (zero on silent).
    if (scene.comms) {
      const voice = this.helpers && this.helpers.voice;
      if (voice && typeof voice.say === 'function') {
        voice.say({ channel: 'comms', text: scene.comms, kind: 'gate_control', factionId });
      }
    }
    // Toll → the existing credit path (single-writer). Never a direct write.
    if ((scene.tollAmount | 0) > 0 && this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('economy:chargeCredits', { amount: scene.tollAmount | 0, reason: 'gate:toll' });
    }

    const ttl = Math.max(MIN_TTL_S, (p.chargeNeeded | 0) + 15);
    const live = { key: gateKey, type: scene.type, wingId: null, entityIds: [], sectorId, expiresAt: now + ttl };

    // Optional scan wing.
    if ((scene.scanWing | 0) > 0) this._spawnWing(state, scene, gateKey, day, now, live);
    g.scene = live;
  },

  _spawnWing(state, scene, gateKey, day, now, live) {
    const gatePos = gatePosFor(state, live.sectorId, gateKeyTo(gateKey));
    // Ambush-no-stack: if a live hostile already sits on the gate, this is not a polite checkpoint.
    if (!this._gateClearOfHostiles(state, gatePos)) return;
    const budget = this.helpers && this.helpers.spawnBudget;
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    const wingId = `gatewing:${gateKey}#${day}`;
    const n = Math.min(scene.scanWing | 0, WING_MAX);
    const grant = budget && typeof budget.request === 'function' ? budget.request(n, wingId) : n;
    if (grant <= 0) return;

    live.wingId = wingId;
    const stream = mulberry32(hash32(state.meta && state.meta.seed, wingId));
    let spawned = 0;
    if (typeof spawnEntity === 'function') {
      for (let i = 0; i < grant; i++) {
        try {
          const ang = stream() * Math.PI * 2;
          const r = 60 + stream() * 60;
          const base = gatePos || playerPos(state) || { x: 0, z: 0 };
          const spec = makeShipEntitySpec(WING_SHIP, {
            team: LAW_TEAM,
            factionId: scene.factionId || (activeSector(state) && activeSector(state).factionId) || 'faction_scn',
            pos: { x: base.x + Math.cos(ang) * r, z: base.z + Math.sin(ang) * r },
            ai: { archetype: 'passive', passive: true },
          });
          const ent = spawnEntity(spec);
          if (ent && ent.id != null) {
            ent.data = ent.data || {};
            ent.data.despawnAt = live.expiresAt;        // safety net; resolution brings it forward
            ent.data.gateWingId = wingId;
            live.entityIds.push(ent.id);
            spawned++;
          }
        } catch (_) { /* spec build failed → count as shortfall below */ }
      }
    }
    if (budget && typeof budget.releaseSome === 'function' && spawned < grant) {
      budget.releaseSome(wingId, grant - spawned);      // free unspawned slots immediately
    }
  },

  // Resolve the live scene: despawn any surviving wing ships and release their slots. Idempotent —
  // once released + scene cleared, a later entity:destroyed for those ids is a no-op.
  _resolveScene(state, _why) {
    const g = ensureState(state);
    const scene = g.scene;
    if (!scene) return;
    const now = state.simTime || 0;
    const budget = this.helpers && this.helpers.spawnBudget;
    const n = scene.entityIds.length;
    for (const id of scene.entityIds) {
      const ent = state.entities && state.entities.get ? state.entities.get(id) : null;
      if (ent) { ent.data = ent.data || {}; ent.data.despawnAt = now; }  // bring removal forward
    }
    if (scene.wingId && n > 0 && budget && typeof budget.releaseSome === 'function') {
      budget.releaseSome(scene.wingId, n);
    }
    g.scene = null;
  },

  _onEntityDestroyed(p) {
    const id = p && p.id;
    if (id == null) return;
    const g = ensureState(this.state);
    const scene = g.scene;
    if (!scene || !scene.entityIds.length) return;
    const i = scene.entityIds.indexOf(id);
    if (i === -1) return;
    scene.entityIds.splice(i, 1);
    const budget = this.helpers && this.helpers.spawnBudget;
    if (scene.wingId && budget && typeof budget.releaseSome === 'function') budget.releaseSome(scene.wingId, 1);
  },

  _onSectorExit(p) {
    // Continuous free-flight membership handoff (M2-C1): keep an active gate scene across
    // Voronoi edges. Hard clear only on intentional jump / load / non-continuous exit.
    // spawnBudget self-resets its ledger on hard sector:exit — no releaseSome here.
    if (p && (p.continuous || p.noTeleport)) return;
    const g = ensureState(this.state);
    g.scene = null;
  },

  _onSaveLoaded() { this.state.gateControl = freshState(); },

  // Synthetic-guard hostility read (factionId-free). True ⇒ the player is in a hostile standing.
  _isWanted(state) {
    const playerTeam = playerTeamOf(state);
    const probe = playerTeam === WANTED_PROBE.team ? WANTED_PROBE_ALT : WANTED_PROBE;
    try { return !!isHostileToPlayer(probe, playerTeam, state); } catch (_) { return false; }
  },

  // No live hostile within GATE_CLEAR_R of the gate → the checkpoint is polite (wing may spawn).
  _gateClearOfHostiles(state, gatePos) {
    if (!gatePos) return true;
    const playerTeam = playerTeamOf(state);
    const list = state.entityList || [];
    for (const e of list) {
      if (!e || e.alive === false || e.type !== 'ship') continue;
      const dx = e.pos.x - gatePos.x, dz = e.pos.z - gatePos.z;
      if (dx * dx + dz * dz > GATE_CLEAR_R * GATE_CLEAR_R) continue;
      let hostile = false;
      try { hostile = !!isHostileToPlayer(e, playerTeam, state); } catch (_) { hostile = false; }
      if (hostile) return false;
    }
    return true;
  },

  destroy() {
    if (this.bus && this.bus.off) {
      if (this._onCharge) this.bus.off('jump:chargeStart', this._onCharge);
      if (this._onJump) { this.bus.off('jump:start', this._onJump); this.bus.off('jump:arrive', this._onJump); }
      if (this._onAbort) this.bus.off('jump:chargeAbort', this._onAbort);
      if (this._onGone) this.bus.off('entity:destroyed', this._onGone);
      if (this._onExit) this.bus.off('sector:exit', this._onExit);
      if (this._onLoaded) this.bus.off('save:loaded', this._onLoaded);
    }
    this._onCharge = this._onJump = this._onAbort = this._onGone = this._onExit = this._onLoaded = null;
  },
};

// ── state + helpers ──────────────────────────────────────────────────────────────────────────────

function freshState() {
  return { accum: 0, scene: null, lastSceneAt: {} };
}

export function ensureState(state) {
  if (!state.gateControl || typeof state.gateControl !== 'object' || Array.isArray(state.gateControl)) {
    state.gateControl = freshState();
  }
  const g = state.gateControl;
  if (!Number.isFinite(g.accum)) g.accum = 0;
  if (!('scene' in g)) g.scene = null;
  if (!g.lastSceneAt || typeof g.lastSceneAt !== 'object' || Array.isArray(g.lastSceneAt)) g.lastSceneAt = {};
  return g;
}

function pruneOld(map, now) {
  for (const k of Object.keys(map)) {
    if (!Number.isFinite(map[k]) || now - map[k] > 900) delete map[k];
  }
}

function currentSectorId(state) {
  const w = state && state.world;
  return (w && w.currentSectorId) || null;
}

function activeSector(state) {
  const w = state && state.world;
  if (!w) return null;
  // Prefer the live sector def if present; fall back to the sectors table by id.
  if (w.activeSector && (w.activeSector.factionId || Number.isFinite(w.activeSector.security))) return w.activeSector;
  const id = w.currentSectorId;
  return (id && w.sectors && w.sectors[id]) || w.activeSector || null;
}

function gatePosFor(state, sectorId, gateTo) {
  const active = state.world && state.world.activeSector;
  const gates = (active && active.gates) || [];
  for (const gt of gates) {
    if (gt && (gt.to === gateTo || gt.gateTo === gateTo) && gt.pos) return { x: gt.pos.x, z: gt.pos.z };
  }
  return null;
}

function gateKeyTo(gateKey) {
  const i = gateKey.indexOf('>');
  return i >= 0 ? gateKey.slice(i + 1) : gateKey;
}

function playerEntity(state) {
  return state.entities && state.entities.get ? state.entities.get(state.playerId) : null;
}

function playerTeamOf(state) {
  const p = playerEntity(state);
  return p && Number.isFinite(p.team) ? p.team : 1;
}

function playerPos(state) {
  const p = playerEntity(state);
  return p && p.pos ? { x: p.pos.x, z: p.pos.z } : null;
}

export default gateControlDirector;
