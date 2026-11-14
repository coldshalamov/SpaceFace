// PL-346 the Bolus — "The fixed rope. Inside the iris, a rope line runs the safe path through,
// maintained by generations of passers-by, mended with whatever they had | Use it, mend it if
// it's fraying; or cut a length for yourself — your next transit finds the line gone and the
// iris in no mood | DRAFT 2026-11-13"
//
// SEAM NOTE (honest): the Bolus is sector_the_bolus (src/data/theBolus.js — BOLUS_SECTOR_ID,
// BOLUS_MOUTH_POS, BOLUS_COUGH_POS, BOLUS_IRIS_Z are the real layout constants; the iris opens
// on BOLUS_IRIS_PERIOD). The rope exists only in the row, so it is a line of KNOT_COUNT
// story-prop knots strung along the mouth-to-cough path through the iris. Using it is physical:
// inside a knot's ring the rope takes your weight (a gentle pull toward the next knot). Fraying
// is deterministic: one knot a mercy day hangs frayed (lamp dark). Mending is physical: your own
// jettisoned pod of metal resting in the mend ring — "mended with whatever they had" — consumes
// the pod, re-strings the knot, and stamps the mender's hull (standing in the rope's memory).
// Cutting a length is physical too: shear a strung knot at pace. That hull's next transit finds
// the line gone (knots ignore them) and the iris in no mood (capped mood-gusts in the corridor)
// until they mend a fray and stand right again.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM imports.
// - Session state on `this`; destroy()/sector:exit despawn owned knots (RESET not unsubscribe).
// - Bounded ledgers (tuning.memoryCap); gust caps and cooldowns; velocity writes touch only the
//   interacting hull.
// - The rope itself is never permanently destroyed for everyone: cutting is remembered per hull.

import { hash32 } from '../../core/rng.js';
import { BOLUS_SECTOR_ID, BOLUS_MOUTH_POS, BOLUS_COUGH_POS } from '../../data/theBolus.js';

export const PL_346_ROPE_EVENT = 'plants:pl346:rope';
export const PL_346_MENDED_EVENT = 'plants:pl346:mended';
export const PL_346_CUT_EVENT = 'plants:pl346:cut';

export const ROPE_SENDER = 'THE FIXED ROPE';
export const ROPE_LINE = 'Rope holds.';
export const MENDED_LINE = 'Mended. It remembers hands.';
export const CUT_LINE = "Line's gone. Iris is in no mood.";

export const FIXED_ROPE_TUNING = Object.freeze({
  plId: 'pl346',
  sectorId: BOLUS_SECTOR_ID,   // 'sector_the_bolus' — the layout authority's own constant
  MERCY_DAY_S: 240,            // the tuning day, same constant as sibling mercy modules
  knotCount: 6,
  ropeRadiusWu: 55,
  ropePullWu: 12,
  frayRadiusWu: 55,
  cutRadiusWu: 28,
  cutSpeedWu: 80,
  restSpeedWu: 6,
  corridorRadiusWu: 900,       // "inside the iris" — the mouth-to-cough corridor
  moodGustWu: 20,
  moodGustCooldownS: 6,
  moodGustCap: 30,
  memoryCap: 6,
});

const finite = (v, f = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : f;
};

/** Pure: the rope path mouth-to-cough, through the iris. */
export function knotPositions(tuning = FIXED_ROPE_TUNING) {
  const out = [];
  const mx = finite(BOLUS_MOUTH_POS?.x);
  const mz = finite(BOLUS_MOUTH_POS?.z);
  const cx = finite(BOLUS_COUGH_POS?.x);
  const cz = finite(BOLUS_COUGH_POS?.z);
  for (let i = 0; i < tuning.knotCount; i++) {
    const f = (i + 0.5) / tuning.knotCount;
    out.push({ x: mx + (cx - mx) * f, z: mz + (cz - mz) * f });
  }
  return out;
}

/** Pure: which knot is fraying on `day` (maintained by generations of passers-by). */
export function frayedKnotFor(dayIndex, count, tuning = FIXED_ROPE_TUNING) {
  const day = Math.floor(finite(dayIndex));
  const n = Math.max(1, Math.floor(count));
  return hash32('plantsPl346fray', day) % n;
}

/** Pure: is a hull in the rope's bad books right now? */
export function isInNoMood(cutUntil, hullKey, now) {
  const until = cutUntil?.get?.(String(hullKey));
  return Number.isFinite(until) && now < until;
}

export const pl346FixedRope = {
  name: 'plantsPl346',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._acc = 0;
    this._knotIds = [];
    this._frayDay = -1;
    this._cutUntil = new Map();    // hullKey -> until they mend (simTime = +Inf until then)
    this._menders = new Map();     // hullKey -> simTime mended at (bounded)
    this._gusts = new Map();       // hullKey -> { count, lastGust } (bounded)
    this._toldCutAt = new Map();
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
    this._cutUntil.clear();
    this._menders.clear();
    this._gusts.clear();
    this._toldCutAt.clear();
    this._saidHold = null;
    this.state = null;
    this.bus = null;
    this.helpers = {};
  },

  _resetSession() {
    this._cutUntil.clear();
    this._menders.clear();
    this._gusts.clear();
    this._toldCutAt.clear();
    this._saidHold = null;   // a new game restarts simTime: no stale beat may silence the line
    this._drop();
  },

  _drop() {
    const rm = this.helpers?.removeEntity;
    if (typeof rm === 'function') {
      for (const id of this._knotIds) rm(id);
    }
    this._knotIds = [];
    this._frayDay = -1;
  },

  _now(s) {
    return Number.isFinite(s?.simTime) ? s.simTime : (Number.isFinite(s?.tick) ? s.tick / 60 : 0);
  },

  _hullKey(s, ent) {
    return String(ent?.id ?? s?.playerId ?? 'unknown');
  },

  _ensureKnots(s, now, day) {
    const spawn = this.helpers?.spawnEntity;
    if (typeof spawn !== 'function') return;
    const positions = knotPositions(FIXED_ROPE_TUNING);
    if (this._knotIds.length !== FIXED_ROPE_TUNING.knotCount) {
      const fray = frayedKnotFor(day, FIXED_ROPE_TUNING.knotCount);
      for (let i = 0; i < FIXED_ROPE_TUNING.knotCount; i++) {
        const isFrayed = i === fray;
        const ent = spawn({
          type: 'beacon',
          pos: positions[i],
          vel: { x: 0, z: 0 },
          radius: 4,
          mass: 1e6,
          hull: 1,
          hullMax: 1,
          homeSectorId: FIXED_ROPE_TUNING.sectorId,
          data: {
            parentType: 'story_prop',
            scanLabel: isFrayed
              ? 'A fraying knot — mend it with whatever you had'
              : 'The fixed rope — the safe path through, use it',
            storyPropKind: 'bolus_rope_knot',
            plantsPl346Knot: i,
            plantsPl346Strung: true,
            plantsPl346Fray: isFrayed,
            lampsFlashing: !isFrayed,
            lampFlashUntil: now + 1,
            masslineTetherable: true,
            swarmFloorPad: { label: isFrayed ? 'FRAYED KNOT' : 'THE FIXED ROPE' },
            homeSectorId: FIXED_ROPE_TUNING.sectorId,
          },
        });
        if (ent && ent.id != null) this._knotIds.push(ent.id);
      }
      this._frayDay = day;
    } else if (this._frayDay !== day) {
      const fray = frayedKnotFor(day, FIXED_ROPE_TUNING.knotCount);
      for (let i = 0; i < this._knotIds.length; i++) {
        const e = s.entities?.get?.(this._knotIds[i]);
        if (!e?.data) continue;
        const isFrayed = i === fray && e.data.plantsPl346Strung !== false;
        e.data.plantsPl346Fray = isFrayed;
        e.data.lampsFlashing = !isFrayed;
        e.data.lampFlashUntil = now + 1;
        e.data.scanLabel = isFrayed
          ? 'A fraying knot — mend it with whatever you had'
          : 'The fixed rope — the safe path through, use it';
      }
      this._frayDay = day;
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
    if (s.world?.currentSectorId !== FIXED_ROPE_TUNING.sectorId) { this._drop(); return; }
    this._acc += finite(dt);
    if (this._acc < 1) return;                 // 1 Hz — no per-frame work
    const step = this._acc;
    this._acc = 0;

    const player = typeof s.entities?.get === 'function' ? s.entities.get(s.playerId) : null;
    if (!player || player.alive === false || !player.pos) return;
    const now = this._now(s);
    const t = FIXED_ROPE_TUNING;
    const day = Math.floor(now / t.MERCY_DAY_S);
    const hullKey = this._hullKey(s, player);
    const speed = Math.hypot(finite(player.vel?.x), finite(player.vel?.z));
    this._ensureKnots(s, now, day);

    // Mend it if it's fraying: your own metal pod resting in the fray ring.
    if (typeof s.entities?.values === 'function') {
      for (const id of this._knotIds) {
        const knot = s.entities.get(id);
        if (!knot || knot.alive === false || !knot.data || !knot.pos) continue;
        const frayIdx = frayedKnotFor(day, t.knotCount);
        if (knot.data.plantsPl346Knot !== frayIdx || knot.data.plantsPl346Strung === false) continue;
        for (const e of s.entities.values()) {
          if (!e || e.alive === false || !e.data?.playerJettisonOrigin || e.data.plantsPl346Spent) continue;
          const metal = e.data?.commodityId === 'cmdty_alloys' || e.data?.commodityId === 'cmdty_scrap_metal'
            || e.data?.commodityId === 'cmdty_refined_metals';
          if (!metal) continue;
          const px = finite(e.pos?.x);
          const pz = finite(e.pos?.z);
          const espeed = Math.hypot(finite(e.vel?.x), finite(e.vel?.z));
          if (!Number.isFinite(px) || espeed > t.restSpeedWu) continue;
          if (Math.hypot(px - knot.pos.x, pz - knot.pos.z) > t.frayRadiusWu) continue;
          // Mended with whatever they had.
          if (typeof this.helpers?.removeEntity === 'function') this.helpers.removeEntity(e.id);
          knot.data.plantsPl346Fray = false;
          knot.data.lampsFlashing = true;
          knot.data.lampFlashUntil = now + 1;
          knot.data.plantsPl346MendedBy = hullKey;
          this._menders.set(hullKey, now);
          if (this._menders.size > t.memoryCap) this._menders.delete(this._menders.keys().next().value);
          // Standing right again: mending lifts the no-mood bite.
          this._cutUntil.delete(hullKey);
          this._gusts.delete(hullKey);
          this.bus?.emit(PL_346_MENDED_EVENT, { hullKey, knotId: id, day, t: now });
          this._voice('plants:pl346:mended', MENDED_LINE, 5);
          this._popup('plants:pl346:mended', ROPE_SENDER, MENDED_LINE, 6);
          this.bus?.emit('audio:cue', { id: 'confirm', position: { x: knot.pos.x, z: knot.pos.z }, gain: 0.5, rate: 1.1 });
          break;
        }
        break;
      }
    }

    const inNoMood = isInNoMood(this._cutUntil, hullKey, now);
    let nearRope = false;
    for (let i = 0; i < this._knotIds.length; i++) {
      const knot = this._knotIds[i] != null && typeof s.entities?.get === 'function'
        ? s.entities.get(this._knotIds[i]) : null;
      if (!knot || knot.alive === false || !knot.data || !knot.pos) continue;
      const d = Math.hypot(player.pos.x - knot.pos.x, player.pos.z - knot.pos.z);
      const strung = knot.data.plantsPl346Strung !== false;
      const frayed = knot.data.plantsPl346Fray === true;
      if (d <= t.ropeRadiusWu) nearRope = true;

      // Cut a length for yourself: shear a strung knot at pace.
      if (strung && d <= t.cutRadiusWu && speed >= t.cutSpeedWu && !inNoMood) {
        knot.data.plantsPl346Strung = false;
        knot.data.lampsFlashing = false;
        knot.data.lampFlashUntil = now;
        knot.data.masslineTetherable = false;
        knot.data.scanLabel = 'A cut rope end — somebody took a length';
        // Your next transit finds the line gone and the iris in no mood.
        this._cutUntil.set(hullKey, now + 365 * t.MERCY_DAY_S);
        if (this._cutUntil.size > t.memoryCap) this._cutUntil.delete(this._cutUntil.keys().next().value);
        this._gusts.set(hullKey, { count: 0, lastGust: -Infinity });
        if (this._gusts.size > t.memoryCap) this._gusts.delete(this._gusts.keys().next().value);
        const last = this._toldCutAt.get(hullKey) ?? -Infinity;
        if (now - last >= t.MERCY_DAY_S) {
          this._toldCutAt.set(hullKey, now);
          this.bus?.emit(PL_346_CUT_EVENT, { hullKey, knotId: knot.id, t: now });
          this._voice('plants:pl346:cut', CUT_LINE, 5);
          this._popup('plants:pl346:cut', ROPE_SENDER, CUT_LINE, 6);
          this.bus?.emit('audio:cue', { id: 'warning', position: null, gain: 0.5, rate: 0.9 });
        }
        continue;
      }

      // Use it: the rope takes your weight toward the next knot — not for the no-mood hulls.
      if (strung && !frayed && d <= t.ropeRadiusWu && !inNoMood && i < this._knotIds.length - 1) {
        const next = knotPositions(t)[i + 1];
        const nx = next.x - player.pos.x;
        const nz = next.z - player.pos.z;
        const nd = Math.hypot(nx, nz) || 1;
        player.vel.x += (nx / nd) * t.ropePullWu * step;
        player.vel.z += (nz / nd) * t.ropePullWu * step;
        if (!this._saidHold || now - this._saidHold >= t.MERCY_DAY_S) {
          this._saidHold = now;
          this.bus?.emit(PL_346_ROPE_EVENT, { hullKey, knotIndex: i, t: now });
          this._voice('plants:pl346:rope', ROPE_LINE, 4);
        }
      }
    }

    // The iris in no mood: capped mood-gusts for cutters inside the corridor.
    if (inNoMood && nearRope) {
      const rec = this._gusts.get(hullKey);
      if (rec && rec.count < t.moodGustCap && now - rec.lastGust >= t.moodGustCooldownS) {
        rec.lastGust = now;
        rec.count += 1;
        const h = hash32('plantsPl346gust', Math.floor(now));
        const ang = (h % 628) / 100;
        player.vel.x += Math.cos(ang) * t.moodGustWu * step;
        player.vel.z += Math.sin(ang) * t.moodGustWu * step;
      }
    }
  },
};

export const pl346FixedRopePlant = pl346FixedRope;
