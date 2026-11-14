// PL-340 Phoebe Echo — "The echo count. Clap (a hull tap) at the Echo's trading post and the
// echo counts back your hull's remaining service life, as a joke that is somehow never wrong |
// Take the joke; or clap all night — the post bans clapping for your hull, and the echo stops
// answering | DRAFT 2026-11-13"
//
// SEAM NOTE (honest): the Echo is sector_phoebe_echo / station_phoebe_echo — the Echo Shrine
// (verified in src/data/frontierRegions/north.js). The clap is physical: a hull tap — bump the
// post at tap pace inside its ring. The echo is the shipped voice seam (helpers.voice.say /
// voice:say) plus a deterministic pure function: serviceLifeEchoes(hull, hullMax) counts hauls
// left from the REAL hull fraction, which is why the joke is somehow never wrong. Clap all night
// (more than clapCapNight taps in one mercy day) and the post bans clapping for your hull until
// dawn — the echo stops answering, the refusal is stamped on the station for anyone to read
// (station.data.plantsPl340Banned).
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM imports.
// - Session state on `this`; destroy()/sector:exit reset the night ledger (RESET not
//   unsubscribe). Bounded per-hull ledgers (tuning.memoryCap); per-tap cooldown.

import { hash32 } from '../../core/rng.js';

export const PL_340_COUNTED_EVENT = 'plants:pl340:counted';
export const PL_340_BANNED_EVENT = 'plants:pl340:banned';

export const ECHO_SENDER = 'THE TRADING POST';
export const BAN_LINE = "The post bans clapping. Echo's done.";

export const ECHO_COUNT_TUNING = Object.freeze({
  plId: 'pl340',
  sectorId: 'sector_phoebe_echo',
  stationId: 'station_phoebe_echo',
  MERCY_DAY_S: 240,          // the tuning day, same constant as sibling mercy modules
  postOffsetWu: 160,
  tapRadiusWu: 40,
  tapSpeedWu: 16,            // a tap: a bump at pace
  tapCooldownS: 12,
  echoMaxHauls: 20,          // the count's ceiling, scaled by hull fraction
  clapCapNight: 3,           // clap all night = more than this in one mercy day
  memoryCap: 6,
});

const finite = (v, f = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : f;
};

/**
 * Pure: the echo's count — remaining service life in hauls, straight off the hull fraction,
 * which is why it is somehow never wrong.
 */
export function serviceLifeEchoes(hull, hullMax, tuning = ECHO_COUNT_TUNING) {
  const h = finite(hull, -1);
  const hm = finite(hullMax, 0);
  if (h < 0 || hm <= 0) return 0;
  const frac = Math.min(1, Math.max(0, h / hm));
  return Math.ceil(frac * tuning.echoMaxHauls);
}

/** Pure: the echo's line — eight words or fewer, counting your hull. */
export function echoLine(echoes) {
  return `Echo: ${Math.max(0, Math.floor(echoes))} hauls left in you.`;
}

/** Pure: is this hull banned from clapping until `until`? */
export function isBannedFor(bannedUntil, hullKey, now) {
  const until = bannedUntil?.get?.(String(hullKey));
  return Number.isFinite(until) && now < until;
}

export const pl340EchoCount = {
  name: 'plantsPl340',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._acc = 0;
    this._postId = null;
    this._postIdDay = -1;
    this._claps = new Map();       // hullKey -> { day, count, lastTapAt } (bounded)
    this._bannedUntil = new Map(); // hullKey -> dawn simTime (bounded)
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
    this._claps.clear();
    this._bannedUntil.clear();
    this.state = null;
    this.bus = null;
    this.helpers = {};
  },

  _resetSession() {
    this._claps.clear();
    this._bannedUntil.clear();
    this._drop();
  },

  _drop() {
    const rm = this.helpers?.removeEntity;
    if (typeof rm === 'function' && this._postId != null) rm(this._postId);
    this._postId = null;
    this._postIdDay = -1;
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
      if (data.stationId === ECHO_COUNT_TUNING.stationId) return e;
    }
    return null;
  },

  _ensurePost(s, now, day) {
    const spawn = this.helpers?.spawnEntity;
    const station = this._station(s);
    if (typeof spawn !== 'function' || !station?.pos) return null;
    if (this._postId != null && this._postIdDay === day) {
      const post = s.entities?.get?.(this._postId);
      return post?.pos ?? null;
    }
    if (this._postId != null) {
      this.helpers?.removeEntity?.(this._postId);
      this._postId = null;
    }
    const h = hash32('plantsPl340post', ECHO_COUNT_TUNING.sectorId);
    const bearing = (h % 3600) / 3600 * Math.PI * 2;
    const pos = {
      x: station.pos.x + Math.cos(bearing) * ECHO_COUNT_TUNING.postOffsetWu,
      z: station.pos.z + Math.sin(bearing) * ECHO_COUNT_TUNING.postOffsetWu,
    };
    const ent = spawn({
      type: 'beacon',
      pos, vel: { x: 0, z: 0 },
      radius: 5,
      mass: 1e6,
      hull: 1,
      hullMax: 1,
      homeSectorId: ECHO_COUNT_TUNING.sectorId,
      data: {
        parentType: 'story_prop',
        scanLabel: "The Echo's trading post — tap it and the echo counts your hull",
        storyPropKind: 'echo_trade_post',
        plantsPl340Post: true,
        swarmFloorPad: { label: 'THE ECHO POST — TAP' },
        tetherable: true,
        masslineTetherable: true,
        homeSectorId: ECHO_COUNT_TUNING.sectorId,
      },
    });
    if (ent && ent.id != null) {
      this._postId = ent.id;
      this._postIdDay = day;
    }
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
    if (s.world?.currentSectorId !== ECHO_COUNT_TUNING.sectorId) { this._drop(); return; }
    this._acc += finite(dt);
    if (this._acc < 1) return;                 // 1 Hz — no per-frame work
    this._acc = 0;

    const station = this._station(s);
    if (!station?.pos) return;
    const now = this._now(s);
    const t = ECHO_COUNT_TUNING;
    const day = Math.floor(now / t.MERCY_DAY_S);
    const pos = this._ensurePost(s, now, day);
    const player = typeof s.entities?.get === 'function' ? s.entities.get(s.playerId) : null;
    if (!pos || !player || player.alive === false || !player.pos) return;
    const hullKey = this._hullKey(s, player);
    const speed = Math.hypot(finite(player.vel?.x), finite(player.vel?.z));
    const dist = Math.hypot(player.pos.x - pos.x, player.pos.z - pos.z);

    if (isBannedFor(this._bannedUntil, hullKey, now)) {
      const last = this._lastBanSaid ?? -Infinity;
      if (dist <= t.tapRadiusWu * 2 && now - last >= t.MERCY_DAY_S) {
        this._lastBanSaid = now;
        this.bus?.emit(PL_340_BANNED_EVENT, { hullKey, refused: true, t: now });
        this._voice('plants:pl340:banned', BAN_LINE, 5);
        this._popup('plants:pl340:banned', ECHO_SENDER, BAN_LINE, 6);
        this.bus?.emit('audio:cue', { id: 'ui_deny', position: { x: pos.x, z: pos.z }, gain: 0.4, rate: 0.9 });
      }
      return;
    }

    // A hull tap: bump the post at pace.
    if (dist <= t.tapRadiusWu && speed >= t.tapSpeedWu) {
      const rec = this._claps.get(hullKey);
      const lastTap = rec?.lastTapAt ?? -Infinity;
      if (now - lastTap < t.tapCooldownS) return;
      const entry = rec && rec.day === day ? rec : { day, count: 0 };
      entry.lastTapAt = now;
      entry.count += 1;
      this._claps.set(hullKey, entry);
      if (this._claps.size > t.memoryCap) this._claps.delete(this._claps.keys().next().value);
      if (entry.count > t.clapCapNight) {
        // Clap all night: banned until dawn, and the echo stops answering.
        const dawn = (day + 1) * t.MERCY_DAY_S;
        this._bannedUntil.set(hullKey, dawn);
        if (this._bannedUntil.size > t.memoryCap) this._bannedUntil.delete(this._bannedUntil.keys().next().value);
        const sd = station.data || (station.data = {});
        sd.plantsPl340Banned = hullKey;
        this.bus?.emit(PL_340_BANNED_EVENT, { hullKey, until: dawn, claps: entry.count, t: now });
        this._voice('plants:pl340:banned', BAN_LINE, 5);
        this._popup('plants:pl340:banned', ECHO_SENDER, BAN_LINE, 6);
        this.bus?.emit('audio:cue', { id: 'ui_deny', position: { x: pos.x, z: pos.z }, gain: 0.45, rate: 0.9 });
        return;
      }
      const echoes = serviceLifeEchoes(player.hull, player.hullMax, t);
      const line = echoLine(echoes);
      this.bus?.emit(PL_340_COUNTED_EVENT, { hullKey, echoes, hull: finite(player.hull), hullMax: finite(player.hullMax), t: now });
      this._voice('plants:pl340:counted', line, 5);
      this._popup('plants:pl340:counted', ECHO_SENDER, line, 6);
      this.bus?.emit('audio:cue', { id: 'sfx_vent_chime', position: { x: pos.x, z: pos.z }, gain: 0.4, rate: 1.3 });
    }
  },
};

export const pl340EchoCountPlant = pl340EchoCount;
