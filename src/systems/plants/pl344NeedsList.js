// PL-344 Eunomia Gulf — "The needs list. The Gulf's fence posts a list of small parts the yards
// out here actually need, with a tip above market rate for each | Fill a need; or lowball the
// list — your offers get lowballed back, everywhere on the Gulf | DRAFT 2026-11-13"
//
// SEAM NOTE (honest): the Gulf is sector_eunomia_gulf / station_eunomia (verified in
// src/data/frontierRegions/south.js). The needs list exists only in the row, so it is a story-prop
// post (beacons.js story-prop shape, swarmFloorPad label) with a per-dawn list: two small parts,
// hashed from a fixed REAL commodity table. Filling a need is physical: your own jettisoned pod
// carrying the needed commodity, resting in the fill ring — the pod is consumed and the tip is
// paid IN KIND: a real pod of a better commodity spawned by the post (tip above market rate, as
// goods). NO ECONOMY MUTATIONS: no credits move here; if the economy owner ever wants to pay the
// tip in credits instead, read station.data.plantsPl344Tips — the stamp carries what was owed.
// Lowballing is physical too: drop a pod that is NOT on the list. The Gulf remembers: your legit
// fills still work, but the tips come back lowballed — junk, one unit — until the flag expires.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM imports.
// - Session state on `this`; destroy()/sector:exit despawn the owned post (RESET not
//   unsubscribe). Bounded per-hull ledgers (tuning.memoryCap); one fill per pod.
// - spawnJettisonedCargoPod is the only spawn seam for tips (the ordinary pickup route).

import { hash32 } from '../../core/rng.js';
import { spawnJettisonedCargoPod } from '../lootShards.js';

export const PL_344_FILLED_EVENT = 'plants:pl344:filled';
export const PL_344_LOWBALL_EVENT = 'plants:pl344:lowball';

export const LIST_SENDER = 'THE NEEDS LIST';
export const FILLED_LINE = "Need filled. Tip's above market.";
export const LOWBALL_LINE = 'Lowballed back. Everywhere on the Gulf.';

export const PL_344_SMALL_PARTS = Object.freeze([
  'cmdty_control_unit',
  'cmdty_comp_circuitry',
  'cmdty_microchips',
  'cmdty_electronics',
  'cmdty_comp_hullplate',
  'cmdty_polymers',
]);

export const NEEDS_LIST_TUNING = Object.freeze({
  plId: 'pl344',
  sectorId: 'sector_eunomia_gulf',
  stationId: 'station_eunomia',
  MERCY_DAY_S: 240,          // the tuning day, same constant as sibling mercy modules
  postOffsetWu: 230,
  fillRadiusWu: 60,
  restSpeedWu: 6,
  needsPerDay: 2,
  tipUnits: 2,               // the tip above market rate, in goods
  lowballUnits: 1,           // what a lowballer's tip comes back as
  lowballDays: 3,
  memoryCap: 6,
});

const finite = (v, f = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : f;
};

/** Pure: today's needs list — two small parts the yards actually need, hashed per dawn. */
export function needsForDay(dayIndex, tuning = NEEDS_LIST_TUNING) {
  const day = Math.floor(finite(dayIndex));
  const a = PL_344_SMALL_PARTS[hash32('plantsPl344needA', day) % PL_344_SMALL_PARTS.length];
  let b = PL_344_SMALL_PARTS[hash32('plantsPl344needB', day) % PL_344_SMALL_PARTS.length];
  if (b === a) b = PL_344_SMALL_PARTS[(hash32('plantsPl344needA', day) + 1) % PL_344_SMALL_PARTS.length];
  return Object.freeze([a, b].slice(0, Math.max(1, tuning.needsPerDay)));
}

/** Pure: the tip commodity the list pays for a filled need (above market rate, in goods). */
export function tipCommodityFor(dayIndex) {
  const day = Math.floor(finite(dayIndex));
  const TIPS = Object.freeze(['cmdty_quantum_cores', 'cmdty_medical', 'cmdty_consumer_goods']);
  return TIPS[hash32('plantsPl344tip', day) % TIPS.length];
}

/** Pure: what a lowballer's fill pays instead — the cheapest thing on the shelf. */
export function lowballCommodityFor() {
  return 'cmdty_scrap_metal';
}

/** Pure: is this hull lowballed on the Gulf right now? */
export function isLowballed(lowballedUntil, hullKey, now) {
  const until = lowballedUntil?.get?.(String(hullKey));
  return Number.isFinite(until) && now < until;
}

export const pl344NeedsList = {
  name: 'plantsPl344',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._acc = 0;
    this._postId = null;
    this._postDay = -1;
    this._filledPods = new Set();   // pods already consumed this pass
    this._lowballedUntil = new Map(); // hullKey -> simTime (bounded)
    this._toldLowballAt = new Map();
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
    this._lowballedUntil.clear();
    this._toldLowballAt.clear();
    this.state = null;
    this.bus = null;
    this.helpers = {};
  },

  _resetSession() {
    this._lowballedUntil.clear();
    this._toldLowballAt.clear();
    this._drop();
  },

  _drop() {
    const rm = this.helpers?.removeEntity;
    if (typeof rm === 'function' && this._postId != null) rm(this._postId);
    this._postId = null;
    this._postDay = -1;
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
      if (data.stationId === NEEDS_LIST_TUNING.stationId) return e;
    }
    return null;
  },

  _ensurePost(s, now, day, needs) {
    const spawn = this.helpers?.spawnEntity;
    const station = this._station(s);
    if (typeof spawn !== 'function' || !station?.pos) return null;
    if (this._postId != null && this._postDay === day) {
      const post = s.entities?.get?.(this._postId);
      return post?.pos ?? null;
    }
    if (this._postId != null) {
      this.helpers?.removeEntity?.(this._postId);
      this._postId = null;
    }
    const h = hash32('plantsPl344post', NEEDS_LIST_TUNING.sectorId);
    const bearing = (h % 3600) / 3600 * Math.PI * 2;
    const pos = {
      x: station.pos.x + Math.cos(bearing) * NEEDS_LIST_TUNING.postOffsetWu,
      z: station.pos.z + Math.sin(bearing) * NEEDS_LIST_TUNING.postOffsetWu,
    };
    const listLine = needs.map((c) => c.replace('cmdty_', '').replace(/_/g, ' ')).join(', ');
    const ent = spawn({
      type: 'beacon',
      pos, vel: { x: 0, z: 0 },
      radius: 5,
      mass: 1e6,
      hull: 1,
      hullMax: 1,
      homeSectorId: NEEDS_LIST_TUNING.sectorId,
      data: {
        parentType: 'story_prop',
        scanLabel: `The needs list — the yards want: ${listLine}. Tip above market.`,
        storyPropKind: 'gulf_needs_list',
        plantsPl344Post: true,
        plantsPl344List: needs,
        swarmFloorPad: { label: 'THE NEEDS LIST' },
        masslineTetherable: true,
        homeSectorId: NEEDS_LIST_TUNING.sectorId,
      },
    });
    if (ent && ent.id != null) {
      this._postId = ent.id;
      this._postDay = day;
      const stationData = station.data || (station.data = {});
      stationData.plantsPl344Needs = needs;   // the yards read this
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
    if (s.world?.currentSectorId !== NEEDS_LIST_TUNING.sectorId) { this._drop(); return; }
    this._acc += finite(dt);
    if (this._acc < 1) return;                 // 1 Hz — no per-frame work
    this._acc = 0;

    const station = this._station(s);
    if (!station?.pos) return;
    const now = this._now(s);
    const t = NEEDS_LIST_TUNING;
    const day = Math.floor(now / t.MERCY_DAY_S);
    const needs = needsForDay(day, t);
    const pos = this._ensurePost(s, now, day, needs);
    const player = typeof s.entities?.get === 'function' ? s.entities.get(s.playerId) : null;
    if (!pos || !player || player.alive === false || !player.pos) return;
    const hullKey = this._hullKey(s, player);
    const lowballed = isLowballed(this._lowballedUntil, hullKey, now);

    // Offers: your own pods resting in the fill ring.
    if (typeof s.entities?.values === 'function') {
      for (const e of s.entities.values()) {
        if (!e || e.alive === false || !e.data?.playerJettisonOrigin || this._filledPods.has(e.id)) continue;
        const px = finite(e.pos?.x);
        const pz = finite(e.pos?.z);
        const espeed = Math.hypot(finite(e.vel?.x), finite(e.vel?.z));
        if (!Number.isFinite(px) || espeed > t.restSpeedWu) continue;
        if (Math.hypot(px - pos.x, pz - pos.z) > t.fillRadiusWu) continue;
        const commodityId = typeof e.data?.commodityId === 'string' ? e.data.commodityId : null;
        if (!commodityId) continue;
        this._filledPods.add(e.id);
        if (needs.includes(commodityId)) {
          // Fill a need: the tip above market rate, paid in goods by the post.
          if (typeof this.helpers?.removeEntity === 'function') this.helpers.removeEntity(e.id);
          const tipCommodity = lowballed ? lowballCommodityFor() : tipCommodityFor(day);
          const units = lowballed ? t.lowballUnits : t.tipUnits;
          let tipId = null;
          if (typeof spawnJettisonedCargoPod === 'function') {
            const tip = spawnJettisonedCargoPod(s, {
              commodityId: tipCommodity,
              amount: units,
              unitMass: 3,
              radius: 4,
              pos: { x: pos.x + 14, z: pos.z + 6 },
              vel: { x: 0, z: 0 },
              ownerId: s.playerId,
            }, this.helpers);
            if (tip) {
              tip.data = tip.data || {};
              tip.data.plantsPl344Tip = { day, forNeed: commodityId, lowballed };
              tip.data.scanLabel = lowballed
                ? 'The list pays you back lowballed — junk'
                : "The list's tip — above market rate";
              tipId = tip.id ?? null;
            }
          }
          const sd = station.data || (station.data = {});
          sd.plantsPl344Tips = (sd.plantsPl344Tips || 0) + 1;
          this.bus?.emit(PL_344_FILLED_EVENT, { hullKey, need: commodityId, tipCommodity, units, tipId, lowballed, t: now });
          if (lowballed) {
            const last = this._toldLowballAt.get(hullKey) ?? -Infinity;
            if (now - last >= t.MERCY_DAY_S) {
              this._toldLowballAt.set(hullKey, now);
              this._voice('plants:pl344:lowball', LOWBALL_LINE, 5);
              this._popup('plants:pl344:lowball', LIST_SENDER, LOWBALL_LINE, 6);
            }
            this.bus?.emit('audio:cue', { id: 'ui_deny', position: { x: pos.x, z: pos.z }, gain: 0.4, rate: 0.9 });
          } else {
            this._voice('plants:pl344:filled', FILLED_LINE, 5);
            this._popup('plants:pl344:filled', LIST_SENDER, FILLED_LINE, 6);
            this.bus?.emit('audio:cue', { id: 'confirm', position: { x: pos.x, z: pos.z }, gain: 0.5, rate: 1 });
          }
        } else {
          // Lowball the list: an offer the yards never asked for.
          if (typeof this.helpers?.removeEntity === 'function') this.helpers.removeEntity(e.id);
          const until = now + t.lowballDays * t.MERCY_DAY_S;
          this._lowballedUntil.set(hullKey, until);
          if (this._lowballedUntil.size > t.memoryCap) this._lowballedUntil.delete(this._lowballedUntil.keys().next().value);
          const sd = station.data || (station.data = {});
          sd.plantsPl344Lowball = hullKey;    // everywhere on the Gulf reads this
          this.bus?.emit(PL_344_LOWBALL_EVENT, { hullKey, offered: commodityId, until, t: now });
          this._voice('plants:pl344:lowball', LOWBALL_LINE, 5);
          this._popup('plants:pl344:lowball', LIST_SENDER, LOWBALL_LINE, 6);
          this.bus?.emit('audio:cue', { id: 'warning', position: { x: pos.x, z: pos.z }, gain: 0.45, rate: 0.9 });
        }
        break;
      }
    }
  },
};

export const pl344NeedsListPlant = pl344NeedsList;
