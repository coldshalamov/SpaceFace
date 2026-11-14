// PL-350 Charon Expanse — "The key wall. The chapel-berth keeps a wall of keys left by travelers
// for anyone stuck out here. Borrow one, return one | Return what you take; or keep a key — the
// wall locks, and your hull is chalked under LOCKS WHY | DRAFT 2026-11-13"
//
// SEAM NOTE (honest): the Expanse is sector_charon_expanse / station_expanse (verified in
// src/data/sectorCompositions.js — the sector's focus station, 'The Broken Procession'). The key
// wall exists only in the row, so it is a story-prop wall post plus KEY_COUNT key props left by
// travelers (beacons.js story-prop shape, named from a fixed table). Borrowing is physical:
// drift a hanging key's ring at borrow pace while stuck — the mercy is the chapel-berth's
// reserve, one real supply pod (the ordinary spawnJettisonedCargoPod route), once per borrow.
// Returning is physical: bring the key back inside the wall's return ring and it re-hangs.
// Keeping is physical too: hold a key past the keep limit (or leave the sector holding it) and
// the wall locks FOR THAT HULL for a season — and the hull is chalked: the wall's stamp reads
// 'LOCKS WHY' with the hull's name (station.data.plantsPl350LocksWhy), visible to everyone.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM imports.
// - Session state on `this`; destroy()/sector:exit despawn the owned wall + keys (RESET not
//   unsubscribe). Bounded ledgers (tuning.memoryCap); one reserve per borrow.
// - NO economy mutations: the reserve is a pod on the ordinary pickup route.

import { hash32 } from '../../core/rng.js';
import { spawnJettisonedCargoPod } from '../lootShards.js';

export const PL_350_BORROWED_EVENT = 'plants:pl350:borrowed';
export const PL_350_RETURNED_EVENT = 'plants:pl350:returned';
export const PL_350_LOCKED_EVENT = 'plants:pl350:locked';

export const WALL_SENDER = 'THE KEY WALL';
export const BORROW_LINE = 'Return what you take.';
export const LOCKED_LINE = 'The wall locked. LOCKS WHY.';

export const PL_350_KEY_NAMES = Object.freeze([
  'the lantern key',
  'the long-walk key',
  'the widow\'s spare',
  'the survey key',
]);

export const KEY_WALL_TUNING = Object.freeze({
  plId: 'pl350',
  sectorId: 'sector_charon_expanse',
  stationId: 'station_expanse',
  MERCY_DAY_S: 240,          // the tuning day, same constant as sibling mercy modules
  wallOffsetWu: 240,
  keyRingRadiusWu: 34,
  borrowSpeedWu: 12,
  stuckSpeedWu: 16,          // the wall serves hulls stuck out here
  stuckRadiusWu: 110,
  returnRadiusWu: 46,
  keepLimitS: 240,           // one mercy day to return what you take
  lockedDays: 90,            // a season
  reserveCommodityId: 'cmdty_salvage_electronics',
  memoryCap: 6,
});

const finite = (v, f = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : f;
};

/** Pure: the key wall's position off the station. */
export function wallPosition(stationPos, tuning = KEY_WALL_TUNING) {
  const h = hash32('plantsPl350wall', tuning.sectorId);
  const bearing = (h % 3600) / 3600 * Math.PI * 2;
  return {
    x: finite(stationPos?.x) + Math.cos(bearing) * tuning.wallOffsetWu,
    z: finite(stationPos?.z) + Math.sin(bearing) * tuning.wallOffsetWu,
  };
}

/** Pure: which key hangs at which hook (deterministic per sector). */
export function keyNameFor(index) {
  const names = PL_350_KEY_NAMES;
  return names[Math.abs(Math.floor(finite(index))) % names.length];
}

/** Pure: is the wall locked for this hull right now? */
export function isLockedFor(lockedUntil, hullKey, now) {
  const until = lockedUntil?.get?.(String(hullKey));
  return Number.isFinite(until) && now < until;
}

export const pl350KeyWall = {
  name: 'plantsPl350',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._acc = 0;
    this._wallId = null;
    this._keyIds = [];
    this._holders = new Map();       // hullKey -> { keyId, keyName, borrowedAt } (bounded)
    this._lockedUntil = new Map();   // hullKey -> simTime (bounded)
    this._toldLockAt = new Map();
    this._reserveGiven = new Set();
    this._rehangAt = null;
    const on = (event, fn) => {
      const off = this.bus?.on?.(event, fn);
      if (typeof off === 'function') this._unsubs.push(off);
    };
    on('sector:exit', () => this._drop());
    on('save:loaded', () => this._drop());
    on('game:new', () => this._resetSession());
    on('game:newGame', () => this._resetSession());
  },

  destroy() {
    if (!this._unsubs) { this.state = null; this.bus = null; this.helpers = {}; return; }
    for (const off of this._unsubs) {
      try { off(); } catch (err) { /* cleanup must not throw */ }
    }
    this._unsubs = [];
    this._drop();
    this._holders.clear();
    this._lockedUntil.clear();
    this._toldLockAt.clear();
    this._reserveGiven.clear();
    this.state = null;
    this.bus = null;
    this.helpers = {};
  },

  _resetSession() {
    this._holders.clear();
    this._lockedUntil.clear();
    this._toldLockAt.clear();
    this._reserveGiven.clear();
    this._drop();
  },

  _drop() {
    const rm = this.helpers?.removeEntity;
    if (typeof rm === 'function') {
      if (this._wallId != null) rm(this._wallId);
      for (const id of this._keyIds) rm(id);
    }
    this._wallId = null;
    this._keyIds = [];
  },

  _now(s) {
    return Number.isFinite(s?.simTime) ? s.simTime : (Number.isFinite(s?.tick) ? s.tick / 60 : 0);
  },

  _hullKey(s, ent) {
    return String(ent?.id ?? s?.playerId ?? 'unknown');
  },

  _station(s) {
    const entities = s?.entities;
    if (!entities) return null;
    const list = typeof entities.values === 'function' ? [...entities.values()] : (Array.isArray(entities) ? entities : []);
    for (const e of list) {
      if (!e || e.alive === false || e.type !== 'station') continue;
      const data = e.data || {};
      if (data.isGate === true || data.isWormhole === true) continue;
      if (data.stationId === KEY_WALL_TUNING.stationId) return e;
    }
    return null;
  },

  _ensureWall(s, now) {
    const spawn = this.helpers?.spawnEntity;
    const station = this._station(s);
    if (typeof spawn !== 'function' || !station?.pos) return null;
    const pos = wallPosition(station.pos, KEY_WALL_TUNING);
    if (this._wallId != null) return pos;
    const ent = spawn({
      type: 'beacon',
      pos, vel: { x: 0, z: 0 },
      radius: 6,
      mass: 1e6,
      hull: 1,
      hullMax: 1,
      homeSectorId: KEY_WALL_TUNING.sectorId,
      data: {
        parentType: 'story_prop',
        scanLabel: 'The key wall — keys left by travelers, borrow one, return one',
        storyPropKind: 'chapel_key_wall',
        plantsPl350Wall: true,
        lampsFlashing: true,
        lampFlashUntil: now + 1,
        swarmFloorPad: { label: 'THE KEY WALL' },
        tetherable: true,
        masslineTetherable: true,
        homeSectorId: KEY_WALL_TUNING.sectorId,
      },
    });
    if (ent && ent.id != null) this._wallId = ent.id;
    return pos;
  },

  _ensureKeys(s, now, wallPos) {
    const spawn = this.helpers?.spawnEntity;
    if (typeof spawn !== 'function' || wallPos == null) return;
    if (this._keyIds.length !== PL_350_KEY_NAMES.length) {
      for (let i = 0; i < PL_350_KEY_NAMES.length; i++) {
        const ang = (i / PL_350_KEY_NAMES.length) * Math.PI * 2;
        const ent = spawn({
          type: 'beacon',
          pos: {
            x: wallPos.x + Math.cos(ang) * 22,
            z: wallPos.z + Math.sin(ang) * 22,
          },
          vel: { x: 0, z: 0 },
          radius: 3,
          mass: 1e6,
          hull: 1,
          hullMax: 1,
          homeSectorId: KEY_WALL_TUNING.sectorId,
          data: {
            parentType: 'story_prop',
            scanLabel: `${keyNameFor(i)} — a traveler left it; borrow one, return one`,
            storyPropKind: 'traveler_key',
            plantsPl350Key: i,
            lampsFlashing: true,
            lampFlashUntil: now + 1,
            masslineTetherable: true,
            homeSectorId: KEY_WALL_TUNING.sectorId,
          },
        });
        if (ent && ent.id != null) this._keyIds.push(ent.id);
      }
    }
  },

  _voice(id, text, ttl = 5) {
    if (this.helpers?.voice && typeof this.helpers.voice.say === 'function') {
      this.helpers.voice.say({ channel: 'comms', id, text, kind: 'traffic', ttl });
    } else {
      this.bus?.emit('voice:say', { channel: 'comms', id, text, ttl });
    }
  },

  _popup(id, sender, text, ttl = 6) {
    this.bus?.emit('comms:popup', { id, sender, category: 'traffic', text, ttl, persist: false });
  },

  update(dt, state) {
    const s = state || this.state;
    if (!s || (s.mode && s.mode !== 'flight')) return;
    if (s.world?.currentSectorId !== KEY_WALL_TUNING.sectorId) { this._drop(); return; }
    this._acc += finite(dt);
    if (this._acc < 1) return;                 // 1 Hz — no per-frame work
    this._acc = 0;

    const station = this._station(s);
    if (!station?.pos) return;
    const wallPos = this._ensureWall(s, this._now(s));
    const player = typeof s.entities?.get === 'function' ? s.entities.get(s.playerId) : null;
    if (!wallPos || !player || player.alive === false || !player.pos) return;
    const now = this._now(s);
    const t = KEY_WALL_TUNING;
    const hullKey = this._hullKey(s, player);
    const speed = Math.hypot(finite(player.vel?.x), finite(player.vel?.z));
    this._ensureKeys(s, now, wallPos);

    const held = this._holders.get(hullKey);
    const locked = isLockedFor(this._lockedUntil, hullKey, now);

    // Keep a key: past the keep limit (the lock fires once; the lockout itself guards repeats).
    if (held && !locked && now - held.borrowedAt > t.keepLimitS) {
      this._lockOut(s, now, hullKey, held);
    } else if (held) {
      const wallDist = Math.hypot(player.pos.x - wallPos.x, player.pos.z - wallPos.z);
      // A key is only returnable once it has been carried out from the wall.
      if (wallDist > t.returnRadiusWu * 2) held.leftWall = true;
      // Return what you take: bring the key back inside the return ring.
      if (held.leftWall && wallDist <= t.returnRadiusWu) {
        const keyEnt = typeof s.entities?.get === 'function' ? s.entities.get(held.keyId) : null;
        if (keyEnt?.data) {
          keyEnt.data.plantsPl350Hanging = true;
          keyEnt.data.lampsFlashing = true;
          keyEnt.data.lampFlashUntil = now + 1;
          keyEnt.data.masslineTetherable = true;
        }
        this._holders.delete(hullKey);
        player.data = player.data || {};
        delete player.data.plantsPl350Key;
        this._rehangAt = now;   // a just-returned key needs a beat before it can be borrowed again
        this.bus?.emit(PL_350_RETURNED_EVENT, { hullKey, keyName: held.keyName, t: now });
        this.bus?.emit('audio:cue', { id: 'confirm', position: { x: wallPos.x, z: wallPos.z }, gain: 0.45, rate: 1 });
        return;
      } else if (!locked) {
        // The chapel-berth's reserve, for anyone stuck out here: once per borrow.
        const stuck = Math.hypot(finite(player.hullMax) - finite(player.hull), 0) > 0
          && speed <= t.stuckSpeedWu;
        const nearStuck = Math.hypot(player.pos.x - station.pos.x, player.pos.z - station.pos.z) <= t.stuckRadiusWu;
        if (stuck && nearStuck && !this._reserveGiven.has(held.keyName)) {
          this._reserveGiven.add(held.keyName);
          if (typeof spawnJettisonedCargoPod === 'function') {
            const pod = spawnJettisonedCargoPod(s, {
              commodityId: t.reserveCommodityId,
              amount: 1,
              unitMass: 4,
              radius: 4,
              pos: { x: player.pos.x + 10, z: player.pos.z + 6 },
              vel: { x: 0, z: 0 },
              ownerId: s.playerId,
            }, this.helpers);
            if (pod) {
              pod.data = pod.data || {};
              pod.data.plantsPl350Reserve = { keyName: held.keyName };
              pod.data.scanLabel = 'The chapel-berth reserve — the key wall remembers';
            }
          }
          this.bus?.emit(PL_350_BORROWED_EVENT, { hullKey, keyName: held.keyName, reserve: true, t: now });
        }
      }
    }

    if (locked) {
      const last = this._toldLockAt.get(hullKey) ?? -Infinity;
      if (now - last >= t.MERCY_DAY_S) {
        this._toldLockAt.set(hullKey, now);
        this.bus?.emit(PL_350_LOCKED_EVENT, { hullKey, refused: true, t: now });
        this._voice('plants:pl350:locked', LOCKED_LINE, 5);
        this._popup('plants:pl350:locked', WALL_SENDER, LOCKED_LINE, 6);
        this.bus?.emit('audio:cue', { id: 'ui_deny', position: null, gain: 0.4, rate: 0.9 });
      }
      return;
    }
    if (held) return;   // already holding one

    // Borrow one: drift a hanging key's ring at borrow pace (after the re-hang beat).
    if (Number.isFinite(this._rehangAt) && now - this._rehangAt < 5) return;
    for (const id of this._keyIds) {
      const key = typeof s.entities?.get === 'function' ? s.entities.get(id) : null;
      if (!key || key.alive === false || !key.data || key.data.plantsPl350Hanging === false) continue;
      const d = Math.hypot(player.pos.x - key.pos.x, player.pos.z - key.pos.z);
      if (d > t.keyRingRadiusWu || speed > t.borrowSpeedWu) continue;
      const keyName = keyNameFor(key.data.plantsPl350Key ?? 0);
      key.data.plantsPl350Hanging = false;
      key.data.lampsFlashing = false;
      key.data.lampFlashUntil = now;
      key.data.masslineTetherable = false;
      this._holders.set(hullKey, { keyId: id, keyName, borrowedAt: now });
      if (this._holders.size > t.memoryCap) this._holders.delete(this._holders.keys().next().value);
      player.data = player.data || {};
      player.data.plantsPl350Key = keyName;
      this._reserveGiven.delete(keyName);
      this.bus?.emit(PL_350_BORROWED_EVENT, { hullKey, keyName, borrowedAt: now, t: now });
      this._voice('plants:pl350:borrowed', BORROW_LINE, 5);
      this._popup('plants:pl350:borrowed', WALL_SENDER, BORROW_LINE, 6);
      this.bus?.emit('audio:cue', { id: 'confirm', position: { x: key.pos.x, z: key.pos.z }, gain: 0.4, rate: 1.1 });
      break;
    }
  },

  _lockOut(s, now, hullKey, held) {
    const t = KEY_WALL_TUNING;
    const until = now + t.lockedDays * t.MERCY_DAY_S;
    this._lockedUntil.set(hullKey, until);
    if (this._lockedUntil.size > t.memoryCap) this._lockedUntil.delete(this._lockedUntil.keys().next().value);
    // The key stays taken; the wall locks.
    const station = this._station(s);
    if (station?.data) {
      station.data.plantsPl350LocksWhy = `${held.keyName} — ${hullKey}`;  // chalked under LOCKS WHY
    }
    this.bus?.emit(PL_350_LOCKED_EVENT, { hullKey, keyName: held.keyName, until, t: now });
    this._voice('plants:pl350:locked', LOCKED_LINE, 5);
    this._popup('plants:pl350:locked', WALL_SENDER, LOCKED_LINE, 6);
    this.bus?.emit('audio:cue', { id: 'warning', position: null, gain: 0.5, rate: 0.9 });
  },
};

export const pl350KeyWallPlant = pl350KeyWall;
