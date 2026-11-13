// PL-207 The welder's sparks — "Wherever something is being fixed there are sparks, and
// behind the mask, Slate. Leave anything broken by the sparks overnight. Come back to it
// mended; leave something stolen, and it comes back mended and engraved with its owner's tag"
//
// A seeded chance meeting: Slate (a welder stranger) works at a broken prop with sparks
// (periodic vent-chime audio + lamp flash on the work spot). What the player "leaves" is
// read from real stamps on real pods resting inside the stash ring:
// - mended: a pod the PLAYER jettisoned — it carries the ordinary jettison path's
//   data.playerJettisonOrigin stamp (only that producer can mint it),
// - stolen: a pod whose owner stamp names somebody else (an NPC-spilled pod dragged here
//   under tether, data.ownerId != the player, no player-origin stamp) — it comes back
//   mended AND engraved (data.engravedTag = the owner's tag) with one comms line.
// "Resting" means slow enough to stay put (restSpeedWu): left, not still in tow.
//
// Invariants:
// - Deterministic: state.simTime / state.meta.seed / hash32 only; no Math.random/Date.now.
// - No Three.js / DOM imports. Slate never moves; sparks are audio + lamp stamps.
// - Physical: the broken prop is a real 'debris' body; stashes are real jettisoned pods
//   read by their production stamps, never by test-only APIs.
// - Bounded Maps capped by tuning.memoryCap; bounded stash ledger (evicts oldest).
// - Nothing runs while docked; gates/wormholes excluded; the player is never the NPC.

import { makeShipEntitySpec } from '../ships.js';
import { spawnJettisonedCargoPod } from '../lootShards.js';
import { hash32 } from '../../core/rng.js';

export const WELDERS_SPARKS_EVENT = 'plants:weldersSparks';

export const WELDERS_SPARKS_TUNING = Object.freeze({
  plId: 'pl207',
  spawnChancePct: 50,
  sparkRangeWu: 90,            // the stash ring around Slate's work spot
  restSpeedWu: 12,             // "left" = resting, not still in tow
  repairNightS: 120,           // "overnight": session-scale stand-in for a sim day
  sparkIntervalS: 4,           // the sparks tick while Slate works
  maxStashRows: 4,             // bounded ledger, evicts oldest
  podCommodityId: 'cmdty_ore_copper',
  podAmount: 1,
  podRadius: 5,
  strangerTtlS: 1200,
  memoryCap: 16,
});

export const WELDERS_SPARKS_CALLSIGN = 'SLATE';
export const WELDERS_SPARKS_MENDED_LINE = 'Mended overnight. Good as new.';
export const WELDERS_SPARKS_ENGRAVED_LINE = 'Mended. Engraved: owner tag.';

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Pure stash classification from real production stamps: what has the player left in the
 * ring? 'mine' = a pod carrying the ordinary jettison path's player-origin stamp;
 * 'stolen' = a pod whose owner stamp names somebody else (no player-origin stamp — it got
 * here under tow). Null when the pod is not resting in the ring at all.
 */
export function classifyStashPod(podEntity, slatePos, playerId, tuning = WELDERS_SPARKS_TUNING) {
  if (!podEntity || podEntity.alive === false || !podEntity.pos || !slatePos) return null;
  const dx = finite(podEntity.pos.x) - finite(slatePos.x);
  const dz = finite(podEntity.pos.z) - finite(slatePos.z);
  if (!(Math.hypot(dx, dz) <= tuning.sparkRangeWu)) return null;
  const speed = Math.hypot(finite(podEntity.vel && podEntity.vel.x), finite(podEntity.vel && podEntity.vel.z));
  if (speed > tuning.restSpeedWu) return null; // still in tow: not "left"
  const d = podEntity.data || {};
  if (d.playerJettisonOrigin) return 'mine';
  const ownerId = d.ownerId;
  if (ownerId != null && playerId != null && ownerId !== playerId) return 'stolen';
  return null;
}

export const weldersSparksPlant = {
  name: 'plants207',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._owned = new Map();
    this._memory = new Map(); // slate spot row + stash rows + collected ledger
    this._accum = 0;
    const on = (event, fn) => {
      const off = this.bus.on(event, fn);
      if (typeof off === 'function') this._unsubs.push(off);
    };
    on('sector:enter', (p) => this._onSectorEnter(p));
    on('sector:exit', () => this._reset('sector_exit'));
    on('save:loaded', () => this._reset('save_loaded'));
    on('game:new', () => this._reset('game_new'));
    on('game:newGame', () => this._reset('game_new_game'));
  },

  update(dt) {
    const s = this.state;
    if (!s || !this.bus) return;
    this._accum += finite(dt, 0);
    if (this._accum < 1) return;
    this._accum = 0;
    const now = finite(s.simTime, 0);
    this._sweepExpired(now);
    if (!this._flight()) return;
    const spot = this._memory.get('spot');
    if (!spot) return;

    // The sparks: periodic audio + a lamp stamp on the work spot.
    if (now - spot.lastSparkAt >= WELDERS_SPARKS_TUNING.sparkIntervalS) {
      spot.lastSparkAt = now;
      const prop = this._entity(spot.brokenPropId);
      if (prop) {
        prop.data.lampsFlashing = true;
        prop.data.lampFlashUntil = now + 0.5;
      }
      this._cue('sfx_vent_chime', spot.pos, 0.45, 1);
    }

    // Register anything broken left by the sparks (pods inside the ring).
    this._stepStash(spot, now);
    // Mend whatever has been overnight.
    this._stepMend(spot, now);
  },

  destroy() {
    for (const off of this._unsubs || []) off();
    this._unsubs = [];
    this._despawnOwned();
    if (this._memory) this._memory.clear();
  },

  // ---- internals ----

  _flight() {
    return !!this.state && (this.state.mode == null || this.state.mode === 'flight');
  },

  _now() {
    return finite(this.state && this.state.simTime, 0);
  },

  _player() {
    const s = this.state;
    return s && s.entities && typeof s.entities.get === 'function' ? s.entities.get(s.playerId) : null;
  },

  _entity(id) {
    const s = this.state;
    if (id == null || !s) return null;
    if (s.entities && typeof s.entities.get === 'function') return s.entities.get(id) || null;
    if (Array.isArray(s.entityList)) return s.entityList.find((e) => e && e.id === id) || null;
    return null;
  },

  _capMemory() {
    while (this._memory.size >= WELDERS_SPARKS_TUNING.memoryCap) {
      this._memory.delete(this._memory.keys().next().value);
    }
  },

  _spawnSlate(pos) {
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return null;
    const spec = makeShipEntitySpec('ship_hawser', {
      team: 2, factionId: 'faction_free', pos: { x: pos.x, z: pos.z },
      ai: { archetype: 'welder', passive: true },
    });
    const ent = spawnEntity(spec);
    if (!ent || ent.id == null) return null;
    ent.data = ent.data || {};
    ent.data.plants = { ...(ent.data.plants || {}), [WELDERS_SPARKS_TUNING.plId]: { role: 'slate', welder: true } };
    ent.data.callsign = WELDERS_SPARKS_CALLSIGN;
    this._owned.set(ent.id, { kind: 'slate', expiresAt: this._now() + WELDERS_SPARKS_TUNING.strangerTtlS });
    return ent;
  },

  _spawnBrokenProp(pos) {
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return null;
    const ent = spawnEntity({
      type: 'debris',
      pos: { x: pos.x + 24, z: pos.z },
      vel: { x: 0, z: 0 },
      radius: 10,
      mass: 60,
      hull: 20,
      hullMax: 120,
      data: {
        parentType: 'story_prop',
        scanLabel: 'Something broken — Slate is fixing it',
        storyPropKind: 'welder_work',
        broken: true,
        masslineTetherable: true,
      },
    });
    if (!ent || ent.id == null) return null;
    this._owned.set(ent.id, { kind: 'broken_prop', expiresAt: this._now() + WELDERS_SPARKS_TUNING.strangerTtlS });
    return ent;
  },

  _onSectorEnter(p) {
    this._reset('sector_enter');
    if (!this._flight()) return;
    const s = this.state;
    const sectorId = (p && p.sectorId) || (s.world && s.world.currentSectorId) || 's1';
    const seed = (s.meta && s.meta.seed) != null ? s.meta.seed : 1;
    if (hash32(seed, sectorId, 'pl207', 'spawn') % 100 >= WELDERS_SPARKS_TUNING.spawnChancePct) return;
    const player = this._player();
    const base = player && player.pos ? player.pos : { x: 0, z: 0 };
    const slate = this._spawnSlate({ x: base.x + 420, z: base.z + 120 });
    if (!slate) return;
    const prop = this._spawnBrokenProp({ x: base.x + 420, z: base.z + 120 });
    this._capMemory();
    this._memory.set('spot', {
      slateId: slate.id,
      brokenPropId: prop ? prop.id : null,
      pos: { x: base.x + 420, z: base.z + 120 },
      lastSparkAt: this._now(),
    });
  },

  _stepStash(spot, now) {
    const s = this.state;
    if (!Array.isArray(s.entityList)) return;
    let stashCount = 0;
    for (const [k, v] of this._memory) {
      if (typeof k === 'string' && k.startsWith('stash:')) stashCount += 1;
    }
    for (const e of s.entityList) {
      if (stashCount >= WELDERS_SPARKS_TUNING.maxStashRows) break;
      if (!e || e.alive === false || !e.data) continue;
      if (this._memory.has(`stash:${e.id}`)) continue;
      const kind = classifyStashPod(e, spot.pos, s.playerId);
      if (!kind) continue;
      const stolen = kind === 'stolen';
      const d = e.data;
      this._capMemory();
      this._memory.set(`stash:${e.id}`, {
        podId: e.id,
        stashedAt: now,
        stolen,
        ownerTag: stolen ? String(d.ownerName || d.ownerId) : null,
        hull: finite(e.hull, 20),
      });
      stashCount += 1;
      this.bus.emit(WELDERS_SPARKS_EVENT, { kind: 'stashed', podId: e.id, stolen, t: now });
    }
  },

  _stepMend(spot, now) {
    for (const [k, row] of [...this._memory]) {
      if (typeof k !== 'string' || !k.startsWith('stash:')) continue;
      if (now - row.stashedAt < WELDERS_SPARKS_TUNING.repairNightS) continue;
      const pod = this._entity(row.podId);
      if (!pod || pod.alive === false) { this._memory.delete(k); continue; }
      // Mended: hull restored to whole and the stamp set.
      pod.hull = Math.max(finite(pod.hullMax, finite(pod.hull, 20)), finite(pod.hull, 20));
      pod.data.plants = { ...(pod.data.plants || {}), [WELDERS_SPARKS_TUNING.plId]: { role: 'mended' } };
      this._cue('confirm', pod.pos, 0.8, 1);
      if (row.stolen) {
        // Mended and engraved with its owner's tag.
        pod.data.engravedTag = row.ownerTag;
        this._comms(`plants:${WELDERS_SPARKS_TUNING.plId}:engraved:${now}`, WELDERS_SPARKS_CALLSIGN, WELDERS_SPARKS_ENGRAVED_LINE, 6);
        this.bus.emit(WELDERS_SPARKS_EVENT, { kind: 'mended_engraved', podId: row.podId, ownerTag: row.ownerTag, t: now });
      } else {
        this._comms(`plants:${WELDERS_SPARKS_TUNING.plId}:mended:${now}`, WELDERS_SPARKS_CALLSIGN, WELDERS_SPARKS_MENDED_LINE, 6);
        this.bus.emit(WELDERS_SPARKS_EVENT, { kind: 'mended', podId: row.podId, t: now });
      }
      this._memory.delete(k);
    }
  },

  _remove(id) {
    if (id == null) return;
    this._owned.delete(id);
    if (this.helpers && typeof this.helpers.removeEntity === 'function') this.helpers.removeEntity(id);
  },

  _sweepExpired(now) {
    for (const [id, row] of this._owned) {
      if (Number.isFinite(row.expiresAt) && now >= row.expiresAt) this._remove(id);
    }
  },

  _despawnOwned() {
    if (this.helpers && typeof this.helpers.removeEntity === 'function') {
      for (const id of [...(this._owned ? this._owned.keys() : [])]) this.helpers.removeEntity(id);
    }
    if (this._owned) this._owned.clear();
  },

  _reset(reason) {
    this._despawnOwned();
    if (this._memory) this._memory.clear();
    if (this.bus && reason === 'sector_exit') {
      this.bus.emit(WELDERS_SPARKS_EVENT, { kind: 'reset', reason, t: this._now() });
    }
  },

  _comms(id, sender, text, ttl) {
    this.bus.emit('comms:popup', { id, sender, category: 'traffic', text, ttl });
  },

  _cue(id, pos, gain = 0.8, rate = 1) {
    this.bus.emit('audio:cue', { id, position: pos ? { x: pos.x, z: pos.z } : null, gain, rate });
  },
};
