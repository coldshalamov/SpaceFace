// PL-337 Rhea Cinder — "The honor urn. A coffee urn at the Cinder runs on honor credits: take a
// cup, drop a bolt in the tin | Pay the tin; or skip it daily — the urn runs dry, and the chalk
// explains exactly who dried it | DRAFT 2026-11-13"
//
// SEAM NOTE (honest): the Cinder is sector_rhea_cinder / station_rhea_cinder (verified in
// src/data/frontierRegions/north.js). The urn exists only in the row, so it is a story-prop post
// (beacons.js story-prop shape, swarmFloorPad label). Taking a cup is physical: fly the cup ring
// at cup pace. Paying the tin is physical: jettison a bolt (your own pod —
// data.playerJettisonOrigin) and let it rest in the tin ring; the bolt is consumed into the urn's
// honor count (station.data.plantsPl337Bolts — a namespaced stamp, read by anyone). Honor abuse
// is remembered PER HULL with a cap and a grace window: unpaid takes across the grace window dry
// the urn for that hull specifically, and the chalk on the station names them
// (station.data.plantsPl337Chalk). Paying a bolt while dry wipes the chalk early — honest chalk.
// NO ECONOMY MUTATIONS: honor credits are counted in bolts and stamps, never in the ledger; if
// the economy owner ever prices the urn, read station.data.plantsPl337Bolts.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM imports.
// - Session state on `this`; destroy()/sector:exit despawn the owned urn (RESET not
//   unsubscribe). Bounded per-hull ledgers (tuning.memoryCap); per-cup cooldown.

import { hash32 } from '../../core/rng.js';

export const PL_337_CUP_EVENT = 'plants:pl337:cup';
export const PL_337_PAID_EVENT = 'plants:pl337:paid';
export const PL_337_DRY_EVENT = 'plants:pl337:dry';
export const PL_337_CHALK_WIPED_EVENT = 'plants:pl337:chalkWiped';

export const URN_SENDER = 'THE HONOR URN';
export const CUP_LINE = 'One cup. The tin remembers.';
export const DRY_LINE = "The urn's dry — chalk says who.";

export const HONOR_URN_TUNING = Object.freeze({
  plId: 'pl337',
  sectorId: 'sector_rhea_cinder',
  stationId: 'station_rhea_cinder',
  MERCY_DAY_S: 240,          // the tuning day, same constant as sibling mercy modules
  urnOffsetWu: 190,
  cupRadiusWu: 48,
  cupSpeedWu: 18,            // cup pace: you stop for a cup
  cupCooldownS: 30,
  tinRadiusWu: 55,
  unpaidCap: 3,              // three takes without a bolt
  graceDays: 1,              // the grace window before the chalk
  dryDays: 10,               // the urn runs dry FOR YOU for ten mercy days
  restSpeedWu: 6,
  memoryCap: 6,
});

const finite = (v, f = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : f;
};

/** Pure: honor state for a hull — how many unpaid takes it is carrying. */
export function unpaidTakes(ledger, hullKey) {
  const rec = ledger?.get?.(String(hullKey));
  return rec ? Math.max(0, Math.floor(finite(rec.takes))) : 0;
}

/** Pure: is the urn dry for this hull right now? */
export function isDryFor(dryUntil, hullKey, now) {
  const until = dryUntil?.get?.(String(hullKey));
  return Number.isFinite(until) && now < until;
}

export const pl337HonorUrn = {
  modes: ['flight'],
  name: 'plantsPl337',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._acc = 0;
    this._urnId = null;
    this._ledger = new Map();     // hullKey -> { takes, firstTakeAt } (bounded)
    this._dryUntil = new Map();   // hullKey -> simTime (bounded)
    this._toldDryAt = new Map();  // hullKey -> simTime (bounded)
    this._lastCupAt = -Infinity;
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
    this._ledger.clear();
    this._dryUntil.clear();
    this._toldDryAt.clear();
    this.state = null;
    this.bus = null;
    this.helpers = {};
  },

  _resetSession() {
    this._ledger.clear();
    this._dryUntil.clear();
    this._toldDryAt.clear();
    this._drop();
  },

  _drop() {
    const rm = this.helpers?.removeEntity;
    if (typeof rm === 'function' && this._urnId != null) rm(this._urnId);
    this._urnId = null;
    this._lastCupAt = -Infinity;
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
      if (data.stationId === HONOR_URN_TUNING.stationId) return e;
    }
    return null;
  },

  _ensureUrn(s, now) {
    const spawn = this.helpers?.spawnEntity;
    const station = this._station(s);
    if (typeof spawn !== 'function' || !station?.pos) return null;
    const h = hash32('plantsPl337urn', HONOR_URN_TUNING.sectorId);
    const bearing = (h % 3600) / 3600 * Math.PI * 2;
    const pos = {
      x: station.pos.x + Math.cos(bearing) * HONOR_URN_TUNING.urnOffsetWu,
      z: station.pos.z + Math.sin(bearing) * HONOR_URN_TUNING.urnOffsetWu,
    };
    if (this._urnId != null) return pos;
    const ent = spawn({
      type: 'beacon',
      pos, vel: { x: 0, z: 0 },
      radius: 5,
      mass: 1e6,
      hull: 1,
      hullMax: 1,
      homeSectorId: HONOR_URN_TUNING.sectorId,
      data: {
        parentType: 'story_prop',
        scanLabel: 'The honor urn — take a cup, drop a bolt in the tin',
        storyPropKind: 'cinder_honor_urn',
        plantsPl337Urn: true,
        swarmFloorPad: { label: 'HONOR URN — TIN' },
        tetherable: true,
        masslineTetherable: true,
        homeSectorId: HONOR_URN_TUNING.sectorId,
      },
    });
    if (ent && ent.id != null) this._urnId = ent.id;
    return pos;
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
    if (s.world?.currentSectorId !== HONOR_URN_TUNING.sectorId) { this._drop(); return; }
    this._acc += finite(dt);
    if (this._acc < 1) return;                 // 1 Hz — no per-frame work
    this._acc = 0;

    const station = this._station(s);
    if (!station?.pos) return;
    const pos = this._ensureUrn(s, this._now(s));
    const player = typeof s.entities?.get === 'function' ? s.entities.get(s.playerId) : null;
    if (!pos || !player || player.alive === false || !player.pos) return;
    const now = this._now(s);
    const t = HONOR_URN_TUNING;
    const hullKey = this._hullKey(s, player);
    const speed = Math.hypot(finite(player.vel?.x), finite(player.vel?.z));
    const dist = Math.hypot(player.pos.x - pos.x, player.pos.z - pos.z);

    // Pay the tin: your own bolt resting in the tin ring drops in.
    if (typeof s.entities?.values === 'function') {
      for (const e of s.entities.values()) {
        if (!e || e.alive === false || !e.data?.playerJettisonOrigin || e.data.plantsPl337InTin) continue;
        const px = finite(e.pos?.x);
        const pz = finite(e.pos?.z);
        const espeed = Math.hypot(finite(e.vel?.x), finite(e.vel?.z));
        if (!Number.isFinite(px) || espeed > t.restSpeedWu) continue;
        if (Math.hypot(px - pos.x, pz - pos.z) > t.tinRadiusWu) continue;
        if (typeof this.helpers?.removeEntity === 'function') this.helpers.removeEntity(e.id);
        const sd = station.data || (station.data = {});
        sd.plantsPl337Bolts = (sd.plantsPl337Bolts || 0) + 1;
        const wasDry = isDryFor(this._dryUntil, hullKey, now);
        const rec = this._ledger.get(hullKey);
        if (rec) { rec.takes = 0; rec.firstTakeAt = null; }
        if (wasDry) {
          // Honest chalk: pay while dry and the chalk is wiped early.
          this._dryUntil.delete(hullKey);
          const sd2 = station.data;
          if (sd2 && sd2.plantsPl337Chalk === hullKey) sd2.plantsPl337Chalk = null;
          this.bus?.emit(PL_337_CHALK_WIPED_EVENT, { hullKey, bolts: sd.plantsPl337Bolts, t: now });
        }
        this.bus?.emit(PL_337_PAID_EVENT, { hullKey, bolts: sd.plantsPl337Bolts, wipedChalk: wasDry, t: now });
        this.bus?.emit('audio:cue', { id: 'confirm', position: { x: pos.x, z: pos.z }, gain: 0.45, rate: 1.1 });
        break;
      }
    }

    const dry = isDryFor(this._dryUntil, hullKey, now);
    if (dist <= t.cupRadiusWu && speed <= t.cupSpeedWu) {
      if (dry) {
        const last = this._toldDryAt.get(hullKey) ?? -Infinity;
        if (now - last >= t.MERCY_DAY_S) {
          this._toldDryAt.set(hullKey, now);
          this.bus?.emit(PL_337_DRY_EVENT, { hullKey, t: now });
          this._voice('plants:pl337:dry', DRY_LINE, 5);
          this._popup('plants:pl337:dry', URN_SENDER, DRY_LINE, 6);
          this.bus?.emit('audio:cue', { id: 'ui_deny', position: { x: pos.x, z: pos.z }, gain: 0.4, rate: 0.9 });
        }
        return;
      }
      if (now - this._lastCupAt >= t.cupCooldownS) {
        this._lastCupAt = now;
        const rec = this._ledger.get(hullKey) || { takes: 0, firstTakeAt: null };
        if (rec.takes === 0) rec.firstTakeAt = now;
        rec.takes += 1;
        this._ledger.set(hullKey, rec);
        if (this._ledger.size > t.memoryCap) this._ledger.delete(this._ledger.keys().next().value);
        this.bus?.emit(PL_337_CUP_EVENT, { hullKey, takes: rec.takes, t: now });
        this._voice('plants:pl337:cup', CUP_LINE, 5);
        this._popup('plants:pl337:cup', URN_SENDER, CUP_LINE, 6);
        this.bus?.emit('audio:cue', { id: 'confirm', position: { x: pos.x, z: pos.z }, gain: 0.4, rate: 1 });
        // Skip it daily: the cap crossed inside the grace window dries the urn for you.
        const graceS = t.graceDays * t.MERCY_DAY_S;
        if (rec.takes >= t.unpaidCap && rec.firstTakeAt != null && now - rec.firstTakeAt <= graceS) {
          this._dryUntil.set(hullKey, now + t.dryDays * t.MERCY_DAY_S);
          if (this._dryUntil.size > t.memoryCap) this._dryUntil.delete(this._dryUntil.keys().next().value);
          const sd = station.data || (station.data = {});
          sd.plantsPl337Chalk = hullKey;   // the chalk explains exactly who dried it
          this.bus?.emit(PL_337_DRY_EVENT, { hullKey, chalked: true, until: this._dryUntil.get(hullKey), t: now });
        }
      }
    }
  },
};

export const pl337HonorUrnPlant = pl337HonorUrn;
