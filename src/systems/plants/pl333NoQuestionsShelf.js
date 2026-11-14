// PL-333 Nyx March — "The no-questions shelf. One shelf at the Fence is stocked with one useful
// thing, free, restocked between visitors, priced only as a rumor | Take it when you need it; or
// resell it at Yune's own counter — the shelf goes dry for you specifically | DRAFT 2026-11-13"
//
// SEAM NOTE (honest): the Fence is sector_nyx_march / station_nyx_march (verified in
// src/data/frontierRegions/west.js; the station's fence contact is Hesper Quill — "Yune's own
// counter" is the Fence's trade counter, reached through the ordinary dock market). The shelf
// exists only in the row, so it is a story-prop post (beacons.js story-prop shape, swarmFloorPad
// label) stocking ONE gift crate per restock. Taking it is physical: fly into the take ring and
// the shelf hands the crate over as a real jettisoned cargo pod (lootShards.spawnJettisonedCargoPod
// — the ordinary pickup route, ownerId = the player). The "rumor price" is a line, never a charge.
//
// THE RESELL SEAM: reselling is the dock market's canonical receipt — bus event
// 'economy:tradeCompleted' with side:'sell', stationId === station_nyx_march, commodityId === the
// gifted commodity (src/systems/economy.js:3493). The plant only READS that receipt; it never
// writes economy. ECONOMY-OWNER HANDOFF: if the economy owner ever wants to price the shelf for
// real, read `station.data.plantsPl333Rumor` — it carries the deterministic rumor price per day.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM imports.
// - Session state on `this`; destroy()/sector:exit withdraw the owned shelf + crate (RESET not
//   unsubscribe: the listener stays, the owned dressing rows go).
// - Bounded ledger (tuning.memoryCap); one gift per restock; freeloader flags carry a grace
//   window and expire (tuning.freopenDays).
// - The bite is specific: the shelf stays dry FOR THAT HULL; other visitors still get theirs.

import { hash32 } from '../../core/rng.js';
import { spawnJettisonedCargoPod } from '../lootShards.js';

export const PL_333_TAKEN_EVENT = 'plants:pl333:taken';
export const PL_333_DRY_EVENT = 'plants:pl333:dry';
export const PL_333_RESTORED_EVENT = 'plants:pl333:restored';

export const SHELF_SENDER = 'THE FENCE SHELF';
export const DRY_LINE = "Shelf's dry. You did that.";

export const PL_333_USEFUL_THINGS = Object.freeze([
  'cmdty_medical',
  'cmdty_food',
  'cmdty_fuel_cells',
  'cmdty_comp_hullplate',
]);

export const SHELF_TUNING = Object.freeze({
  plId: 'pl333',
  sectorId: 'sector_nyx_march',
  stationId: 'station_nyx_march',
  MERCY_DAY_S: 240,          // the tuning day, same constant as sibling mercy modules
  shelfOffsetWu: 210,
  takeRadiusWu: 55,
  restockDelayS: 45,         // restocked between visitors
  rumorSpreadCr: 120,        // the rumor price: never charged, only said
  freeloadDays: 5,           // a MERCY_DAY_S-window the dry flag lasts
  crateMass: 9,
  memoryCap: 6,
});

const finite = (v, f = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : f;
};

/** Pure: the useful thing the shelf stocks for a day, and the rumor price asked of no one. */
export function giftForDay(dayIndex, tuning = SHELF_TUNING) {
  const day = Math.floor(finite(dayIndex));
  const gift = PL_333_USEFUL_THINGS[hash32('plantsPl333gift', day) % PL_333_USEFUL_THINGS.length];
  const rumorCr = 5 + (hash32('plantsPl333rumor', day) % tuning.rumorSpreadCr);
  return { commodityId: gift, rumorCr };
}

/** Pure: the rumor line the shelf asks as its only price (eight words or fewer). */
export function rumorLine(rumorCr) {
  return `No questions. The rumor says ${finite(rumorCr)} credits.`;
}

/** Pure: is a hull currently dried out by its own resell? */
export function isDriedFor(freeloaders, hullKey, now) {
  const until = freeloaders?.get?.(String(hullKey));
  return Number.isFinite(until) && now < until;
}

export const pl333NoQuestionsShelf = {
  name: 'plantsPl333',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._acc = 0;
    this._shelfId = null;
    this._crateId = null;
    this._restockAt = 0;
    this._lastGiftDay = -1;
    this._freeloaders = new Map();   // hullKey -> dry-until simTime (bounded)
    this._toldDryAt = new Map();     // hullKey -> last dry line simTime (bounded)
    const on = (event, fn) => {
      const off = this.bus?.on?.(event, fn);
      if (typeof off === 'function') this._unsubs.push(off);
    };
    on('sector:exit', () => this._drop());
    on('save:loaded', () => this._drop());
    on('game:new', () => this._resetSession());
    on('game:newGame', () => this._resetSession());
    // Read-only receipt watch: reselling the gift at Yune's own counter.
    on('economy:tradeCompleted', (p) => this._onTrade(p));
  },

  destroy() {
    if (!this._unsubs) { this.state = null; this.bus = null; this.helpers = {}; return; }
    for (const off of this._unsubs) {
      try { off(); } catch (err) { /* cleanup must not throw */ }
    }
    this._unsubs = [];
    this._drop();
    this._freeloaders.clear();
    this._toldDryAt.clear();
    this.state = null;
    this.bus = null;
    this.helpers = {};
  },

  _resetSession() {
    this._freeloaders.clear();
    this._toldDryAt.clear();
    this._drop();
  },

  _drop() {
    const rm = this.helpers?.removeEntity;
    if (typeof rm === 'function') {
      if (this._crateId != null) rm(this._crateId);
      if (this._shelfId != null) rm(this._shelfId);
    }
    this._crateId = null;
    this._shelfId = null;
    this._lastGiftDay = -1;
    this._restockAt = 0;
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
      if (data.stationId === SHELF_TUNING.stationId) return e;
    }
    return null;
  },

  _shelfPosition(stationPos) {
    const h = hash32('plantsPl333pos', SHELF_TUNING.sectorId);
    const bearing = (h % 3600) / 3600 * Math.PI * 2;
    return {
      x: finite(stationPos?.x) + Math.cos(bearing) * SHELF_TUNING.shelfOffsetWu,
      z: finite(stationPos?.z) + Math.sin(bearing) * SHELF_TUNING.shelfOffsetWu,
    };
  },

  _ensureShelf(s, now) {
    const spawn = this.helpers?.spawnEntity;
    const station = this._station(s);
    if (typeof spawn !== 'function' || !station?.pos) return null;
    const pos = this._shelfPosition(station.pos);
    if (this._shelfId != null) return pos;
    const ent = spawn({
      type: 'beacon',
      pos, vel: { x: 0, z: 0 },
      radius: 5,
      mass: 1e6,
      hull: 1,
      hullMax: 1,
      homeSectorId: SHELF_TUNING.sectorId,
      data: {
        parentType: 'story_prop',
        scanLabel: 'The no-questions shelf — one useful thing, free',
        storyPropKind: 'no_questions_shelf',
        plantsPl333Shelf: true,
        swarmFloorPad: { label: 'NO-QUESTIONS SHELF' },
        tetherable: true,
        masslineTetherable: true,
        homeSectorId: SHELF_TUNING.sectorId,
      },
    });
    if (ent && ent.id != null) this._shelfId = ent.id;
    return pos;
  },

  _stockCrate(s, now, pos, day, dried) {
    const spawn = this.helpers?.spawnEntity;
    if (typeof spawn !== 'function' || pos == null || this._crateId != null) return;
    if (dried) return; // the shelf goes dry for this hull specifically: no crate is stocked
    const gift = giftForDay(day);
    const ent = spawn({
      type: 'payload',
      pos: { x: pos.x + 14, z: pos.z + 4 },
      vel: { x: 0, z: 0 },
      radius: 5,
      mass: SHELF_TUNING.crateMass,
      hull: 20,
      hullMax: 20,
      physicsBody: { mass: SHELF_TUNING.crateMass },
      flags: { persistent: true },
      homeSectorId: SHELF_TUNING.sectorId,
      data: {
        masslineTetherable: true,
        scanLabel: 'From the no-questions shelf — take it when you need it',
        plantsPl333Gift: { day, commodityId: gift.commodityId, rumorCr: gift.rumorCr },
        swarmFloorPad: { label: 'TAKE IT, FREE' },
        homeSectorId: SHELF_TUNING.sectorId,
      },
    });
    if (ent && ent.id != null) {
      this._crateId = ent.id;
      this.bus?.emit(PL_333_RESTORED_EVENT, { crateId: ent.id, day, commodityId: gift.commodityId, t: now });
    }
  },

  _onTrade(p) {
    const s = this.state;
    if (!s || !p || p.side !== 'sell') return;
    if (p.stationId !== SHELF_TUNING.stationId) return;
    const now = this._now(s);
    const player = typeof s.entities?.get === 'function' ? s.entities.get(s.playerId) : null;
    const hullKey = this._hullKey(s, player);
    // Only a fresh gift bites: the sold lot must match a gift this hull took.
    const taken = this._giftsTakenBy(hullKey);
    if (!taken.includes(p.commodityId)) return;
    const t = SHELF_TUNING;
    const until = now + t.freeloadDays * t.MERCY_DAY_S;
    this._freeloaders.set(hullKey, until);
    if (this._freeloaders.size > t.memoryCap) {
      this._freeloaders.delete(this._freeloaders.keys().next().value);
    }
    const station = this._station(s);
    if (station?.data) station.data.plantsPl333DryFor = hullKey;
    this.bus?.emit(PL_333_DRY_EVENT, { hullKey, commodityId: p.commodityId, until, t: now });
    this._sayDry(hullKey, now);
    // The stocked crate comes off the shelf for a reseller.
    if (this._crateId != null && typeof this.helpers?.removeEntity === 'function') {
      this.helpers.removeEntity(this._crateId);
      this._crateId = null;
    }
  },

  _giftsTakenBy(hullKey) {
    this._giftLog = this._giftLog || new Map(); // hullKey -> last gifted commodity (bounded)
    const v = this._giftLog.get(hullKey);
    return v ? [v] : [];
  },

  _sayDry(hullKey, now) {
    const last = this._toldDryAt.get(hullKey) ?? -Infinity;
    if (now - last < SHELF_TUNING.MERCY_DAY_S) return;
    this._toldDryAt.set(hullKey, now);
    this._voice('plants:pl333:dry', DRY_LINE, 5);
    this._popup('plants:pl333:dry', SHELF_SENDER, DRY_LINE, 6);
    this.bus?.emit('audio:cue', { id: 'ui_deny', position: null, gain: 0.4, rate: 1 });
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
    if (s.world?.currentSectorId !== SHELF_TUNING.sectorId) { this._drop(); return; }
    this._acc += finite(dt);
    if (this._acc < 1) return;                 // 1 Hz — no per-frame work
    this._acc = 0;

    const now = this._now(s);
    const t = SHELF_TUNING;
    const pos = this._ensureShelf(s, now);
    const player = typeof s.entities?.get === 'function' ? s.entities.get(s.playerId) : null;
    if (!pos || !player || player.alive === false || !player.pos) return;

    const hullKey = this._hullKey(s, player);
    const dried = isDriedFor(this._freeloaders, hullKey, now);
    const day = Math.floor(now / t.MERCY_DAY_S);

    // Restock: one gift, restocked between visitors — never for a dried hull.
    if (this._crateId == null && now >= this._restockAt) {
      this._stockCrate(s, now, pos, day, dried);
    }

    // Take it when you need it: fly the take ring and the shelf hands the crate over.
    const crate = this._crateId != null && typeof s.entities?.get === 'function'
      ? s.entities.get(this._crateId) : null;
    if (crate?.pos && crate.data?.plantsPl333Gift) {
      const d = Math.hypot(player.pos.x - crate.pos.x, player.pos.z - crate.pos.z);
      if (d <= t.takeRadiusWu) {
        const { commodityId, rumorCr } = crate.data.plantsPl333Gift;
        if (typeof this.helpers?.removeEntity === 'function') this.helpers.removeEntity(crate.id);
        this._crateId = null;
        this._restockAt = now + t.restockDelayS;
        this._giftLog = this._giftLog || new Map();
        this._giftLog.set(hullKey, commodityId);
        if (this._giftLog.size > t.memoryCap) this._giftLog.delete(this._giftLog.keys().next().value);
        let podId = null;
        if (typeof spawnJettisonedCargoPod === 'function') {
          const pod = spawnJettisonedCargoPod(s, {
            commodityId,
            amount: 1,
            unitMass: t.crateMass,
            radius: 4,
            pos: { x: player.pos.x + 10, z: player.pos.z + 6 },
            vel: { x: 0, z: 0 },
            ownerId: s.playerId,
          }, this.helpers);
          if (pod) {
            pod.data = pod.data || {};
            pod.data.plantsPl333Carried = { day, commodityId, rumorCr };
            pod.data.scanLabel = 'From the no-questions shelf';
            podId = pod.id ?? null;
          }
        }
        const line = rumorLine(rumorCr);
        this.bus?.emit(PL_333_TAKEN_EVENT, { hullKey, commodityId, rumorCr, podId, t: now });
        this._voice('plants:pl333:rumor', line, 5);
        this._popup('plants:pl333:rumor', SHELF_SENDER, line, 6);
        this.bus?.emit('audio:cue', { id: 'confirm', position: { x: pos.x, z: pos.z }, gain: 0.5, rate: 1 });
        if (stationStampable(this._station(s))) {
          this._station(s).data.plantsPl333Rumor = { day, rumorCr };
        }
      }
    }
  },
};

function stationStampable(station) {
  return !!station?.data;
}

export const pl333NoQuestionsShelfPlant = pl333NoQuestionsShelf;
