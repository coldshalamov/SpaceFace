// PL-336 Orcus Shadow — "The lamp keeper. The keeper lights your dark side free if word says you
// helped anyone else that day — and the keeper hears everything out here | Help somebody first;
// or help nobody and grumble — your dark side stays dark, and the lamp knows why |
// DRAFT 2026-11-13"
//
// SEAM NOTE (honest): the Shadow is sector_orcus_shadow / station_orcus_shadow (verified in
// src/data/frontierRegions/west.js). The lamp exists only in the row, so it is a story-prop buoy
// on the station's dark reach (hash-fixed offset, lampsFlashing/lampFlashUntil — the shipped lamp
// flag). "Word says you helped" needs an observable act of generosity: the honest seam is your
// own jettisoned pod (data.playerJettisonOrigin — lootShards' stamp on your jettisons) coming to
// rest near a civilian hull — you gave someone something, out here, and the keeper hears
// everything. That substitute is stated, not faked: a gift read, no invented help ledger.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM imports.
// - Session state on `this`; destroy()/sector:exit despawn the owned lamp (RESET not
//   unsubscribe). Bounded ledgers (tuning.memoryCap); one light per hull per mercy day.
// - The dark side stays dark: no light is faked for the unhelped; the lamp only records WHY.

import { hash32 } from '../../core/rng.js';

export const PL_336_LIT_EVENT = 'plants:pl336:lit';
export const PL_336_KNOWS_WHY_EVENT = 'plants:pl336:knowsWhy';

export const KEEPER_SENDER = 'THE LAMP KEEPER';
export const LIT_LINE = 'Light for the helper.';
export const KNOWS_WHY_LINE = 'The lamp knows why.';

export const LAMP_KEEPER_TUNING = Object.freeze({
  plId: 'pl336',
  sectorId: 'sector_orcus_shadow',
  stationId: 'station_orcus_shadow',
  MERCY_DAY_S: 240,          // the tuning day, same constant as sibling mercy modules
  lampOffsetWu: 520,         // the dark reach, well past the dock light
  darkReachRadiusWu: 260,
  giftRadiusWu: 90,          // your pod resting this near a civilian is "helped somebody"
  litHoldRadiusWu: 160,      // inside this the lamp lights your dark side
  bumpRadiusWu: 26,
  bumpSpeedWu: 30,           // charging the unlit lamp at pace is a grumble
  lampHoldS: 2,
  memoryCap: 6,
});

const finite = (v, f = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : f;
};

/** Pure: did this hull help anybody on `day` (a gift pod came to rest near a civilian)? */
export function helpedOnDay(helpedDays, hullKey, day) {
  return helpedDays?.get?.(`${hullKey}#${Math.floor(day)}`) === true;
}

/** Pure: the lamp's boolean — lit only for helpers inside the dark reach. */
export function lampShouldLight(helpedDays, hullKey, day, distWu, tuning = LAMP_KEEPER_TUNING) {
  return distWu <= tuning.litHoldRadiusWu && helpedOnDay(helpedDays, hullKey, day);
}

export const pl336LampKeeper = {
  name: 'plantsPl336',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._acc = 0;
    this._lampId = null;
    this._helpedDays = new Map();   // `${hullKey}#${day}` -> true (bounded)
    this._litDay = new Map();       // hullKey -> day last lit (bounded)
    this._whyDay = new Map();       // hullKey -> day last told why (bounded)
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
    this._helpedDays.clear();
    this._litDay.clear();
    this._whyDay.clear();
    this.state = null;
    this.bus = null;
    this.helpers = {};
  },

  _resetSession() {
    this._helpedDays.clear();
    this._litDay.clear();
    this._whyDay.clear();
    this._drop();
  },

  _drop() {
    const rm = this.helpers?.removeEntity;
    if (typeof rm === 'function' && this._lampId != null) rm(this._lampId);
    this._lampId = null;
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
      if (data.stationId === LAMP_KEEPER_TUNING.stationId) return e;
    }
    return null;
  },

  _ensureLamp(s, now, pos) {
    const spawn = this.helpers?.spawnEntity;
    if (typeof spawn !== 'function' || pos == null || this._lampId != null) return;
    const ent = spawn({
      type: 'beacon',
      pos, vel: { x: 0, z: 0 },
      radius: 6,
      mass: 1e6,
      hull: 1,
      hullMax: 1,
      homeSectorId: LAMP_KEEPER_TUNING.sectorId,
      data: {
        parentType: 'story_prop',
        scanLabel: 'The lamp keeper\'s lamp — free light for helpers',
        storyPropKind: 'orcus_dark_lamp',
        plantsPl336Lamp: true,
        lampsFlashing: false,
        lampFlashUntil: now,
        swarmFloorPad: { label: 'THE KEEPER\'S LAMP' },
        tetherable: true,
        masslineTetherable: true,
        homeSectorId: LAMP_KEEPER_TUNING.sectorId,
      },
    });
    if (ent && ent.id != null) this._lampId = ent.id;
  },

  _voice(id, text, ttl = 5) {
    if (this.helpers?.voice && typeof this.helpers.voice.say === 'function') {
      this.helpers.voice.say({ channel: 'bark', id, text, kind: 'traffic', ttl });
    } else {
      this.bus?.emit('voice:say', { channel: 'bark', id, text, ttl });
    }
  },

  _popup(id, sender, text, ttl = 6) {
    this.bus?.emit('comms:popup', { id, sender, category: 'traffic', text, ttl, persist: false });
  },

  update(dt, state) {
    const s = state || this.state;
    if (!s || (s.mode && s.mode !== 'flight')) return;
    if (s.world?.currentSectorId !== LAMP_KEEPER_TUNING.sectorId) { this._drop(); return; }
    this._acc += finite(dt);
    if (this._acc < 1) return;                 // 1 Hz — no per-frame work
    this._acc = 0;

    const station = this._station(s);
    if (!station?.pos) return;
    const player = typeof s.entities?.get === 'function' ? s.entities.get(s.playerId) : null;
    if (!player || player.alive === false || !player.pos) return;
    const now = this._now(s);
    const t = LAMP_KEEPER_TUNING;
    const day = Math.floor(now / t.MERCY_DAY_S);
    const hullKey = this._hullKey(s, player);
    const h = hash32('plantsPl336lamp', t.sectorId);
    const bearing = (h % 3600) / 3600 * Math.PI * 2;
    const lampPos = {
      x: station.pos.x + Math.cos(bearing) * t.lampOffsetWu,
      z: station.pos.z + Math.sin(bearing) * t.lampOffsetWu,
    };
    this._ensureLamp(s, now, lampPos);
    const lamp = this._lampId != null && typeof s.entities?.get === 'function'
      ? s.entities.get(this._lampId) : null;
    if (!lamp?.data) return;

    // "Helped somebody": your own pod resting near a civilian hull — the keeper hears everything.
    if (typeof s.entities?.values === 'function') {
      const pods = [];
      const civs = [];
      for (const e of s.entities.values()) {
        if (!e || e.alive === false || !e.pos) continue;
        if (e.data?.playerJettisonOrigin && !e.data.plantsPl336Counted) pods.push(e);
        else if (e.type === 'ship' && e.id !== s.playerId) civs.push(e);
      }
      for (const pod of pods) {
        for (const civ of civs) {
          const d = Math.hypot(pod.pos.x - civ.pos.x, pod.pos.z - civ.pos.z);
          if (d > t.giftRadiusWu) continue;
          pod.data.plantsPl336Counted = true;
          this._helpedDays.set(`${hullKey}#${day}`, true);
          if (this._helpedDays.size > t.memoryCap * 4) {
            this._helpedDays.delete(this._helpedDays.keys().next().value);
          }
          break;
        }
      }
    }

    const dist = Math.hypot(player.pos.x - lampPos.x, player.pos.z - lampPos.z);
    const shouldLight = lampShouldLight(this._helpedDays, hullKey, day, dist, t);
    if (shouldLight) {
      lamp.data.lampsFlashing = true;
      lamp.data.lampFlashUntil = now + t.lampHoldS;
      if (this._litDay.get(hullKey) !== day) {
        this._litDay.set(hullKey, day);
        if (this._litDay.size > t.memoryCap) this._litDay.delete(this._litDay.keys().next().value);
        this.bus?.emit(PL_336_LIT_EVENT, { hullKey, day, t: now });
        this._voice('plants:pl336:lit', LIT_LINE, 5);
        this._popup('plants:pl336:lit', KEEPER_SENDER, LIT_LINE, 6);
        this.bus?.emit('audio:cue', { id: 'confirm', position: { x: lampPos.x, z: lampPos.z }, gain: 0.45, rate: 1 });
      }
    } else {
      // Help nobody: your dark side stays dark. Grumble at the unlit lamp and it knows why.
      lamp.data.lampsFlashing = false;
      lamp.data.lampFlashUntil = now;
      const speed = Math.hypot(finite(player.vel?.x), finite(player.vel?.z));
      if (dist <= t.bumpRadiusWu && speed > t.bumpSpeedWu && this._whyDay.get(hullKey) !== day) {
        this._whyDay.set(hullKey, day);
        if (this._whyDay.size > t.memoryCap) this._whyDay.delete(this._whyDay.keys().next().value);
        const stationData = station.data || (station.data = {});
        stationData.plantsPl336Why = `${hullKey}#${day}`;  // the lamp knows why
        if (lamp.data) lamp.data.plantsPl336Why = 'unhelped';
        this.bus?.emit(PL_336_KNOWS_WHY_EVENT, { hullKey, day, t: now });
        this._voice('plants:pl336:why', KNOWS_WHY_LINE, 5);
        this._popup('plants:pl336:why', KEEPER_SENDER, KNOWS_WHY_LINE, 6);
        this.bus?.emit('audio:cue', { id: 'ui_deny', position: { x: lampPos.x, z: lampPos.z }, gain: 0.4, rate: 0.9 });
      }
    }
  },
};

export const pl336LampKeeperPlant = pl336LampKeeper;
