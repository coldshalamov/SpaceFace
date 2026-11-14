// PL-351 Veil Nebula — "The sample pad. Research leaves working mislabeled parts on the public
// pad for locals — take one, it was bound for the recycler | Take one; or clear the pad to sell
// off-station — the pad goes bare, and your next part is labeled wrong in the dangerous way |
// DRAFT 2026-11-13"
//
// SEAM NOTE (honest): the Veil is sector_veil_nebula / station_veil (verified in
// src/data/frontierRegions/east.js and src/data/veilResearchEdge.js — the research edge already
// anchors station_veil). The pad exists only in the row, so it is a story-prop post stocking
// SAMPLES_PER_DAY mislabeled sample crates per dawn (payload crates, flags.persistent, the
// PL-215 crate contract). The mislabel is honest and visible: data.pl351Sample carries {label,
// actual} — the scan label says what it claims to be; the commodity inside is what it is. Taking
// one is physical: fly the take ring; the crate is handed over as a real jettisoned pod. Clearing
// the pad is physical too: take the whole day's stock inside the clear window — you swept it to
// sell off-station. The pad goes BARE (restock suspended for that hull for bareDays, stamped on
// the station), and the NEXT part that hull is handed is labeled wrong in the dangerous way: the
// label claims safe, the content is junk, data.pl351Danger flags the lie.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM imports.
// - Session state on `this`; destroy()/sector:exit withdraw owned pad + crates (RESET not
//   unsubscribe). Bounded per-hull ledgers (tuning.memoryCap).
// - NO economy mutations: the "sell off-station" never happens in-sim; the plant only reads the
//   sweep (takes) as the intent.

import { hash32 } from '../../core/rng.js';
import { spawnJettisonedCargoPod } from '../lootShards.js';

export const PL_351_TAKEN_EVENT = 'plants:pl351:taken';
export const PL_351_CLEARED_EVENT = 'plants:pl351:cleared';
export const PL_351_DANGER_EVENT = 'plants:pl351:danger';

export const PAD_SENDER = 'THE SAMPLE PAD';
export const TAKE_LINE = 'Bound for the recycler. Take one.';
export const CLEARED_LINE = "Pad's bare. Dangerous label for you next.";

export const PL_351_LABELS = Object.freeze([
  Object.freeze({ label: 'inert packing foam', actual: 'cmdty_salvage_electronics' }),
  Object.freeze({ label: 'scratched ballast weights', actual: 'cmdty_control_unit' }),
  Object.freeze({ label: 'spent coolant rags', actual: 'cmdty_microchips' }),
  Object.freeze({ label: 'broken sensor housings', actual: 'cmdty_comp_circuitry' }),
]);

export const SAMPLE_PAD_TUNING = Object.freeze({
  plId: 'pl351',
  sectorId: 'sector_veil_nebula',
  stationId: 'station_veil',
  MERCY_DAY_S: 240,          // the tuning day, same constant as sibling mercy modules
  padOffsetWu: 280,
  takeRadiusWu: 50,
  samplesPerDay: 2,
  clearWindowS: 90,          // sweep the whole stock inside this window and you cleared the pad
  bareDays: 7,
  dangerDays: 30,            // your next part, labeled wrong in the dangerous way
  crateMass: 8,
  memoryCap: 6,
});

const finite = (v, f = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : f;
};

/** Pure: the day's mislabeled samples — the label lies, the commodity does not. */
export function samplesForDay(dayIndex, count, tuning = SAMPLE_PAD_TUNING) {
  const day = Math.floor(finite(dayIndex));
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push(PL_351_LABELS[hash32('plantsPl351sample', day, i) % PL_351_LABELS.length]);
  }
  return out;
}

/** Pure: the dangerous mislabel — the label claims safe, the content is not what it claims. */
export function dangerousSample() {
  return { label: 'inert packing foam', actual: 'cmdty_scrap_metal', danger: true };
}

/** Pure: is this hull's next part still owed the dangerous label? */
export function owesDanger(mislabelUntil, hullKey, now) {
  const until = mislabelUntil?.get?.(String(hullKey));
  return Number.isFinite(until) && now < until;
}

export const pl351SamplePad = {
  name: 'plantsPl351',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._acc = 0;
    this._padId = null;
    this._crateIds = [];
    this._stockDay = -1;
    this._takes = new Map();        // hullKey -> { day, times: [simTime] } (bounded)
    this._bareUntil = new Map();    // hullKey -> simTime (bounded)
    this._mislabelUntil = new Map();// hullKey -> simTime (bounded)
    this._toldClearAt = new Map();
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
    this._takes.clear();
    this._bareUntil.clear();
    this._mislabelUntil.clear();
    this._toldClearAt.clear();
    this.state = null;
    this.bus = null;
    this.helpers = {};
  },

  _resetSession() {
    this._takes.clear();
    this._bareUntil.clear();
    this._mislabelUntil.clear();
    this._toldClearAt.clear();
    this._drop();
  },

  _drop() {
    const rm = this.helpers?.removeEntity;
    if (typeof rm === 'function') {
      if (this._padId != null) rm(this._padId);
      for (const id of this._crateIds) rm(id);
    }
    this._padId = null;
    this._crateIds = [];
    this._stockDay = -1;
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
      if (data.stationId === SAMPLE_PAD_TUNING.stationId) return e;
    }
    return null;
  },

  _padPosition(stationPos) {
    const h = hash32('plantsPl351pad', SAMPLE_PAD_TUNING.sectorId);
    const bearing = (h % 3600) / 3600 * Math.PI * 2;
    return {
      x: finite(stationPos?.x) + Math.cos(bearing) * SAMPLE_PAD_TUNING.padOffsetWu,
      z: finite(stationPos?.z) + Math.sin(bearing) * SAMPLE_PAD_TUNING.padOffsetWu,
    };
  },

  _ensurePad(s, now) {
    const spawn = this.helpers?.spawnEntity;
    const station = this._station(s);
    if (typeof spawn !== 'function' || !station?.pos) return null;
    const pos = this._padPosition(station.pos);
    if (this._padId != null) return pos;
    const ent = spawn({
      type: 'beacon',
      pos, vel: { x: 0, z: 0 },
      radius: 7,
      mass: 1e6,
      hull: 1,
      hullMax: 1,
      homeSectorId: SAMPLE_PAD_TUNING.sectorId,
      data: {
        parentType: 'story_prop',
        scanLabel: 'The sample pad — research leaves mislabeled parts for locals',
        storyPropKind: 'veil_sample_pad',
        plantsPl351Pad: true,
        swarmFloorPad: { label: 'SAMPLE PAD — TAKE ONE' },
        tetherable: true,
        masslineTetherable: true,
        homeSectorId: SAMPLE_PAD_TUNING.sectorId,
      },
    });
    if (ent && ent.id != null) this._padId = ent.id;
    return pos;
  },

  _stockDayCrates(s, now, day, pos, hullKey) {
    const spawn = this.helpers?.spawnEntity;
    if (typeof spawn !== 'function' || pos == null) return;
    const bare = Number.isFinite(this._bareUntil.get(hullKey)) && now < this._bareUntil.get(hullKey);
    if (bare) return;   // the pad goes bare for a sweeper
    const samples = samplesForDay(day, SAMPLE_PAD_TUNING.samplesPerDay);
    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i];
      const ent = spawn({
        type: 'payload',
        pos: { x: pos.x + 12 + i * 18, z: pos.z + 8 },
        vel: { x: 0, z: 0 },
        radius: 5,
        mass: SAMPLE_PAD_TUNING.crateMass,
        hull: 20,
        hullMax: 20,
        physicsBody: { mass: SAMPLE_PAD_TUNING.crateMass },
        flags: { persistent: true },
        homeSectorId: SAMPLE_PAD_TUNING.sectorId,
        data: {
          masslineTetherable: true,
          scanLabel: `Mislabeled sample — says "${sample.label}"`,
          plantsPl351Sample: { day, label: sample.label, actual: sample.actual },
          swarmFloorPad: { label: 'SAYS: RECYCLER BOUND' },
          homeSectorId: SAMPLE_PAD_TUNING.sectorId,
        },
      });
      if (ent && ent.id != null) this._crateIds.push(ent.id);
    }
    this._stockDay = day;
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
    if (s.world?.currentSectorId !== SAMPLE_PAD_TUNING.sectorId) { this._drop(); return; }
    this._acc += finite(dt);
    if (this._acc < 1) return;                 // 1 Hz — no per-frame work
    this._acc = 0;

    const station = this._station(s);
    if (!station?.pos) return;
    const pos = this._ensurePad(s, this._now(s));
    const player = typeof s.entities?.get === 'function' ? s.entities.get(s.playerId) : null;
    if (!pos || !player || player.alive === false || !player.pos) return;
    const now = this._now(s);
    const t = SAMPLE_PAD_TUNING;
    const hullKey = this._hullKey(s, player);
    const day = Math.floor(now / t.MERCY_DAY_S);

    // Prune destroyed crates out of the ledger each pass — a dead id must never hold the
    // restock check hostage (combat debris dies where it sits; the id would linger forever).
    if (this._crateIds.length > 0 && typeof s.entities?.get === 'function') {
      this._crateIds = this._crateIds.filter((id) => {
        const e = s.entities.get(id);
        return e != null && e.alive !== false;
      });
    }

    // Restock per dawn: the pad's day stock (bare for a sweeper until the flag expires).
    if (this._stockDay !== day && this._crateIds.length === 0) {
      this._stockDayCrates(s, now, day, pos, hullKey);
    }

    // Take one: fly the take ring over a stocked crate.
    for (let i = 0; i < this._crateIds.length; i++) {
      const crate = this._crateIds[i] != null && typeof s.entities?.get === 'function'
        ? s.entities.get(this._crateIds[i]) : null;
      if (!crate || crate.alive === false || !crate.data?.plantsPl351Sample || !crate.pos) continue;
      const d = Math.hypot(player.pos.x - crate.pos.x, player.pos.z - crate.pos.z);
      if (d > t.takeRadiusWu) continue;

      const sample = crate.data.plantsPl351Sample;
      const rec = this._takes.get(hullKey);
      const entry = rec && rec.day === day ? rec : { day, times: [] };
      entry.times.push(now);
      entry.times = entry.times.filter((ts) => now - ts <= t.clearWindowS);
      this._takes.set(hullKey, entry);
      if (this._takes.size > t.memoryCap) this._takes.delete(this._takes.keys().next().value);

      // Clear the pad: the whole day's stock inside the clear window — swept to sell off-station.
      const cleared = entry.times.length >= t.samplesPerDay;
      if (cleared) {
        this._bareUntil.set(hullKey, now + t.bareDays * t.MERCY_DAY_S);
        if (this._bareUntil.size > t.memoryCap) this._bareUntil.delete(this._bareUntil.keys().next().value);
        this._mislabelUntil.set(hullKey, now + t.dangerDays * t.MERCY_DAY_S);
        if (this._mislabelUntil.size > t.memoryCap) this._mislabelUntil.delete(this._mislabelUntil.keys().next().value);
        const sd = station.data || (station.data = {});
        sd.plantsPl351Bare = hullKey;
        const last = this._toldClearAt.get(hullKey) ?? -Infinity;
        if (now - last >= t.MERCY_DAY_S) {
          this._toldClearAt.set(hullKey, now);
          this.bus?.emit(PL_351_CLEARED_EVENT, { hullKey, bareUntil: this._bareUntil.get(hullKey), t: now });
          this._voice('plants:pl351:cleared', CLEARED_LINE, 5);
          this._popup('plants:pl351:cleared', PAD_SENDER, CLEARED_LINE, 6);
          this.bus?.emit('audio:cue', { id: 'warning', position: null, gain: 0.5, rate: 0.9 });
        }
      }

      // Hand the crate over as a real pod — the ordinary pickup route.
      if (typeof this.helpers?.removeEntity === 'function') this.helpers.removeEntity(crate.id);
      this._crateIds.splice(i, 1);
      const dangerous = owesDanger(this._mislabelUntil, hullKey, now) && !sample.danger;
      const commodity = dangerous ? dangerousSample().actual : sample.actual;
      let podId = null;
      if (typeof spawnJettisonedCargoPod === 'function') {
        const pod = spawnJettisonedCargoPod(s, {
          commodityId: commodity,
          amount: 1,
          unitMass: t.crateMass,
          radius: 4,
          pos: { x: player.pos.x + 10, z: player.pos.z + 6 },
          vel: { x: 0, z: 0 },
          ownerId: s.playerId,
        }, this.helpers);
        if (pod) {
          pod.data = pod.data || {};
          if (dangerous) {
            pod.data.plantsPl351Danger = true;   // labeled wrong in the dangerous way
            pod.data.scanLabel = 'DANGER: the label lies — says "inert packing foam"';
          } else {
            pod.data.scanLabel = `Mislabeled sample — was bound for the recycler (says "${sample.label}")`;
          }
          podId = pod.id ?? null;
        }
      }
      this.bus?.emit(PL_351_TAKEN_EVENT, {
        hullKey, label: sample.label, actual: commodity, dangerous, cleared, podId, t: now,
      });
      if (!cleared) {
        this._voice('plants:pl351:take', TAKE_LINE, 5);
        this._popup('plants:pl351:take', PAD_SENDER, TAKE_LINE, 6);
        this.bus?.emit('audio:cue', { id: 'confirm', position: { x: pos.x, z: pos.z }, gain: 0.45, rate: 1 });
        if (dangerous) {
          this.bus?.emit(PL_351_DANGER_EVENT, { hullKey, podId, t: now });
        }
      } else {
        // The dangerous hand-over IS the bite; still count the take.
        if (dangerous) this.bus?.emit(PL_351_DANGER_EVENT, { hullKey, podId, t: now });
      }
      break;
    }
  },
};

export const pl351SamplePadPlant = pl351SamplePad;
