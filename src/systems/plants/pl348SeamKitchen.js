// PL-348 Pallas — "The seam kitchen. Rib Street's cook feeds anyone who worked the seam that day,
// off the books, no receipt | Work, then eat; or claim the meal without working — the cook serves
// you last, forever, and tells the other cooks | DRAFT 2026-11-13"
//
// SEAM NOTE (honest): Pallas Drift is sector_pallas_drift / station_smuggler — Rib Street
// (verified: PALLAS_SHIFT in src/data/pallasWorkShift.js anchors the same station; "Rib Street"
// is the row's name for the drift's working row). The kitchen exists only in the row, so it is a
// story-prop post (beacons.js story-prop shape, swarmFloorPad label). "Worked the seam" has no
// payroll seam to read, so the honest substitute is physical and stated: drifting the working
// row at work pace inside the work ring for the tuning work-window (cumulative per mercy day) —
// yard hands' day. The meal is the shipped outside-dock courtesy in kind (a small hull patch —
// the PL-143 precedent), off the books: no receipt, no economy writes. Claiming without working
// is physical too: into the meal ring with no work day. The cook warns; keep claiming and you
// are served LAST — forever (session-long, the honest scope of "forever") — and the cook tells
// the other cooks: the stamp travels on your hull (data.plantsPl348ServedLast), readable
// anywhere, and the station names you.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM imports.
// - Session state on `this`; destroy()/sector:exit despawn the owned kitchen (RESET not
//   unsubscribe). Bounded per-hull ledgers (tuning.memoryCap); one meal per work day.
// - "Served last" is real: the meal only after the served-last delay, smaller, and named.

import { hash32 } from '../../core/rng.js';

export const PL_348_FED_EVENT = 'plants:pl348:fed';
export const PL_348_CLAIMED_EVENT = 'plants:pl348:claimed';
export const PL_348_LAST_EVENT = 'plants:pl348:servedLast';

export const COOK_SENDER = 'RIB STREET COOK';
export const FED_LINE = 'Off the books. No receipt.';
export const CLAIM_LINE = 'Work first. Then eat.';
export const LAST_LINE = "You're served last. The cooks know.";

export const SEAM_KITCHEN_TUNING = Object.freeze({
  plId: 'pl348',
  sectorId: 'sector_pallas_drift',
  stationId: 'station_smuggler',
  MERCY_DAY_S: 240,          // the tuning day, same constant as sibling mercy modules
  kitchenOffsetWu: 190,
  workRadiusWu: 300,         // the working row: drift inside it
  workSpeedWu: 20,           // work pace: stop-and-go hauling
  workSecondsS: 40,          // a day's work, cumulative
  mealRadiusWu: 52,
  mealHull: 8,               // the meal, in kind
  servedLastDelayS: 30,      // served last: the line ahead of you
  servedLastHull: 3,         // and the pot's been through
  claimCap: 3,               // claims without work before the cook's patience ends
  claimGraceDays: 2,
  claimCooldownS: 30,        // distinct claims, not one long hover
  memoryCap: 6,
});

const finite = (v, f = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : f;
};

/** Pure: has this hull worked the seam on `day`? */
export function hasWorked(worked, hullKey, day) {
  const rec = worked?.get?.(`${String(hullKey)}#${Math.floor(day)}`);
  return rec === true;
}

/** Pure: the fed hull after a meal — capped, never over max. */
export function fedHull(hull, hullMax, amount = SEAM_KITCHEN_TUNING.mealHull) {
  if (!Number.isFinite(hull) || !Number.isFinite(hullMax) || hullMax <= 0) return hull;
  return Math.min(hullMax, hull + amount);
}

/** Pure: is this hull served last right now (session-long once stamped)? */
export function isServedLast(servedLastUntil, hullKey, now) {
  const until = servedLastUntil?.get?.(String(hullKey));
  return until === Infinity || (Number.isFinite(until) && now < until);
}

export const pl348SeamKitchen = {
  name: 'plantsPl348',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._acc = 0;
    this._kitchenId = null;
    this._worked = new Map();        // `${hullKey}#${day}` -> true (bounded)
    this._workSeconds = new Map();   // hullKey -> { day, seconds } (bounded)
    this._mealsDay = new Map();      // hullKey -> day of last meal (bounded)
    this._claims = new Map();        // hullKey -> { windowStart, count } (bounded)
    this._lastClaimAt = new Map();   // hullKey -> simTime of last counted claim (bounded)
    this._servedLastUntil = new Map();
    this._toldLastAt = new Map();
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
    this._worked.clear();
    this._workSeconds.clear();
    this._mealsDay.clear();
    this._claims.clear();
    this._lastClaimAt.clear();
    this._servedLastUntil.clear();
    this._toldLastAt.clear();
    this.state = null;
    this.bus = null;
    this.helpers = {};
  },

  _resetSession() {
    this._worked.clear();
    this._workSeconds.clear();
    this._mealsDay.clear();
    this._claims.clear();
    this._lastClaimAt.clear();
    this._servedLastUntil.clear();
    this._toldLastAt.clear();
    this._drop();
  },

  _drop() {
    const rm = this.helpers?.removeEntity;
    if (typeof rm === 'function' && this._kitchenId != null) rm(this._kitchenId);
    this._kitchenId = null;
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
      if (data.stationId === SEAM_KITCHEN_TUNING.stationId) return e;
    }
    return null;
  },

  _ensureKitchen(s, now) {
    const spawn = this.helpers?.spawnEntity;
    const station = this._station(s);
    if (typeof spawn !== 'function' || !station?.pos) return null;
    const h = hash32('plantsPl348kitchen', SEAM_KITCHEN_TUNING.sectorId);
    const bearing = (h % 3600) / 3600 * Math.PI * 2;
    const pos = {
      x: station.pos.x + Math.cos(bearing) * SEAM_KITCHEN_TUNING.kitchenOffsetWu,
      z: station.pos.z + Math.sin(bearing) * SEAM_KITCHEN_TUNING.kitchenOffsetWu,
    };
    if (this._kitchenId != null) return pos;
    const ent = spawn({
      type: 'beacon',
      pos, vel: { x: 0, z: 0 },
      radius: 5,
      mass: 1e6,
      hull: 1,
      hullMax: 1,
      homeSectorId: SEAM_KITCHEN_TUNING.sectorId,
      data: {
        parentType: 'story_prop',
        scanLabel: "The seam kitchen — Rib Street's cook feeds anyone who worked the seam",
        storyPropKind: 'rib_street_kitchen',
        plantsPl348Kitchen: true,
        lampsFlashing: true,
        lampFlashUntil: now + 1,
        swarmFloorPad: { label: 'THE SEAM KITCHEN' },
        tetherable: true,
        masslineTetherable: true,
        homeSectorId: SEAM_KITCHEN_TUNING.sectorId,
      },
    });
    if (ent && ent.id != null) this._kitchenId = ent.id;
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
    if (s.world?.currentSectorId !== SEAM_KITCHEN_TUNING.sectorId) { this._drop(); return; }
    this._acc += finite(dt);
    if (this._acc < 1) return;                 // 1 Hz — no per-frame work
    const step = this._acc;
    this._acc = 0;

    const station = this._station(s);
    if (!station?.pos) return;
    const pos = this._ensureKitchen(s, this._now(s));
    const player = typeof s.entities?.get === 'function' ? s.entities.get(s.playerId) : null;
    if (!pos || !player || player.alive === false || !player.pos) return;
    const now = this._now(s);
    const t = SEAM_KITCHEN_TUNING;
    const hullKey = this._hullKey(s, player);
    const day = Math.floor(now / t.MERCY_DAY_S);
    const speed = Math.hypot(finite(player.vel?.x), finite(player.vel?.z));

    // Work the seam: stop-and-go pace inside the working row, cumulative per day —
    // hovering at the cook's counter is not work, and she says so.
    const kitchenDist = Math.hypot(player.pos.x - pos.x, player.pos.z - pos.z);
    const inWorkRow = Math.hypot(player.pos.x - station.pos.x, player.pos.z - station.pos.z) <= t.workRadiusWu
      && kitchenDist > t.mealRadiusWu * 2;
    if (inWorkRow && speed <= t.workSpeedWu) {
      const rec = this._workSeconds.get(hullKey);
      const entry = rec && rec.day === day ? rec : { day, seconds: 0 };
      entry.seconds += step;
      this._workSeconds.set(hullKey, entry);
      if (this._workSeconds.size > t.memoryCap) this._workSeconds.delete(this._workSeconds.keys().next().value);
      if (entry.seconds >= t.workSecondsS && !hasWorked(this._worked, hullKey, day)) {
        this._worked.set(`${hullKey}#${day}`, true);
        if (this._worked.size > t.memoryCap * 4) this._worked.delete(this._worked.keys().next().value);
        this.bus?.emit(PL_348_FED_EVENT, { hullKey, day, worked: true, t: now }); // work receipt event
      }
    }

    const dist = Math.hypot(player.pos.x - pos.x, player.pos.z - pos.z);
    if (dist > t.mealRadiusWu) return;
    const servedLast = isServedLast(this._servedLastUntil, hullKey, now);
    const worked = hasWorked(this._worked, hullKey, day);

    if (!worked) {
      // Claim the meal without working.
      const lastClaim = this._lastClaimAt.get(hullKey) ?? -Infinity;
      if (now - lastClaim < t.claimCooldownS) return;
      this._lastClaimAt.set(hullKey, now);
      const claimRec = this._claims.get(hullKey);
      const claim = claimRec && now - claimRec.windowStart <= t.claimGraceDays * t.MERCY_DAY_S
        ? claimRec : { windowStart: now, count: 0 };
      claim.count += 1;
      this._claims.set(hullKey, claim);
      if (this._claims.size > t.memoryCap) this._claims.delete(this._claims.keys().next().value);
      if (servedLast) {
        const last = this._toldLastAt.get(hullKey) ?? -Infinity;
        if (now - last >= t.MERCY_DAY_S) {
          this._toldLastAt.set(hullKey, now);
          this.bus?.emit(PL_348_LAST_EVENT, { hullKey, refused: true, t: now });
          this._voice('plants:pl348:last', LAST_LINE, 5);
          this._popup('plants:pl348:last', COOK_SENDER, LAST_LINE, 6);
          this.bus?.emit('audio:cue', { id: 'ui_deny', position: { x: pos.x, z: pos.z }, gain: 0.4, rate: 0.9 });
        }
        return;
      }
      if (claim.count <= t.claimCap) {
        this.bus?.emit(PL_348_CLAIMED_EVENT, { hullKey, claims: claim.count, t: now });
        this._voice('plants:pl348:claim', CLAIM_LINE, 5);
        this._popup('plants:pl348:claim', COOK_SENDER, CLAIM_LINE, 6);
        this.bus?.emit('audio:cue', { id: 'ui_deny', position: { x: pos.x, z: pos.z }, gain: 0.35, rate: 1 });
      } else {
        // The cook serves you last, forever, and tells the other cooks.
        this._servedLastUntil.set(hullKey, Infinity);
        if (this._servedLastUntil.size > t.memoryCap) this._servedLastUntil.delete(this._servedLastUntil.keys().next().value);
        const sd = station.data || (station.data = {});
        sd.plantsPl348ServedLast = hullKey;      // the cook tells the row
        player.data = player.data || {};
        player.data.plantsPl348ServedLast = true; // the stamp travels with the hull
        this.bus?.emit(PL_348_LAST_EVENT, { hullKey, until: Infinity, claims: claim.count, t: now });
        this._voice('plants:pl348:last', LAST_LINE, 5);
        this._popup('plants:pl348:last', COOK_SENDER, LAST_LINE, 6);
        this.bus?.emit('audio:cue', { id: 'warning', position: { x: pos.x, z: pos.z }, gain: 0.5, rate: 0.9 });
      }
      return;
    }

    // Work, then eat: off the books, no receipt. Served-last hulls wait at the back.
    if (servedLast) {
      if (this._mealWaitStart == null) this._mealWaitStart = now;
      if (now - this._mealWaitStart < t.servedLastDelayS) return;
    }
    if (this._mealsDay.get(hullKey) === day) return;
    this._mealsDay.set(hullKey, day);
    if (this._mealsDay.size > t.memoryCap) this._mealsDay.delete(this._mealsDay.keys().next().value);
    this._mealWaitStart = null;
    const portion = servedLast ? t.servedLastHull : t.mealHull;
    player.hull = fedHull(player.hull, player.hullMax, portion);
    this.bus?.emit(PL_348_FED_EVENT, { hullKey, day, fed: true, portion, servedLast, t: now });
    this._voice('plants:pl348:fed', FED_LINE, 5);
    this._popup('plants:pl348:fed', COOK_SENDER, FED_LINE, 6);
    this.bus?.emit('audio:cue', { id: 'confirm', position: { x: pos.x, z: pos.z }, gain: 0.5, rate: 1 });
  },
};

export const pl348SeamKitchenPlant = pl348SeamKitchen;
