// PL-335 Kepler Scar — "The dawn line. The chart post carries a fresh chalk of today's safe line
// through the Scar, redrawn every dawn by an anonymous hand | Follow the chalk and add a
// correction if you find one; or chalk a wrong line for fun — visitors chalk over your name for
// a month | DRAFT 2026-11-13"
//
// SEAM NOTE (honest): the Scar is sector_kepler_scar / station_kepler_scar — Scar Bazaar
// (verified in src/data/frontierRegions/west.js). The chart post and the chalk exist only in the
// row, so the post is a story-prop (swarmFloorPad label) and the safe line is a string of CHALK_
// COUNT small chalk buoys whose positions are redrawn every dawn (MERCY_DAY_S) from hash32 — an
// anonymous hand, deterministic. Following the chalk is physical: inside a chalk buoy's radius
// the anonymous hand's line takes a little of your weight (a gentle pull toward the next chalk).
// A correction is physical too: take hull damage in the Scar OFF the line, then reach the next
// chalk within the correction window — the anonymous hand takes your correction and tomorrow's
// line shifts (a deterministic per-day offset). A wrong line is physical: jettison a pod (your
// own — data.playerJettisonOrigin) and let it rest by the chart post: that is chalking a false
// line. Visitors chalk over your name: the chalk gives that hull nothing for a month.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM imports.
// - Session state on `this`; destroy()/sector:exit despawn the owned post + chalk (RESET not
//   unsubscribe). Bounded ledgers (tuning.memoryCap); per-day and per-hull cooldowns.

import { hash32 } from '../../core/rng.js';

export const PL_335_FOLLOWED_EVENT = 'plants:pl335:followed';
export const PL_335_CORRECTION_EVENT = 'plants:pl335:correction';
export const PL_335_FALSE_CHALK_EVENT = 'plants:pl335:falseChalk';

export const CHART_SENDER = 'THE CHART POST';
export const CORRECTION_LINE = 'Chalk takes your correction.';
export const CHALKED_LINE = 'Visitors chalked over your name.';

export const DAWN_LINE_TUNING = Object.freeze({
  plId: 'pl335',
  sectorId: 'sector_kepler_scar',
  stationId: 'station_kepler_scar',
  MERCY_DAY_S: 240,          // the tuning day, same constant as sibling mercy modules
  postOffsetWu: 240,
  chalkCount: 6,
  chalkSpacingWu: 120,
  chalkRadiusWu: 42,
  pullAlongWu: 10,           // the line takes a little of your weight
  correctWindowS: 25,
  correctDays: 3,            // how many dawns your correction steers the line
  falseChalkRadiusWu: 60,
  restSpeedWu: 6,
  chalkedDays: 30,           // a month: visitors chalk over your name
  memoryCap: 6,
});

const finite = (v, f = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : f;
};

/**
 * Pure: today's chalk line through the Scar — anchored off the chart post, redrawn per dawn.
 * `correctionDay` (a day on which a correction was accepted) shifts the line deterministically.
 */
export function chalkLineForDay(postPos, dayIndex, correctionDay = null, tuning = DAWN_LINE_TUNING) {
  const day = Math.floor(finite(dayIndex));
  const h = hash32('plantsPl335line', day);
  const bearing = (h % 3600) / 3600 * Math.PI * 2;
  const swing = ((hash32('plantsPl335swing', day) % 400) - 200) / 200 * tuning.chalkSpacingWu * 0.5;
  let cx = finite(postPos?.x);
  let cz = finite(postPos?.z);
  if (Number.isInteger(correctionDay) && correctionDay >= 0) {
    const dh = hash32('plantsPl335corrected', day, correctionDay);
    cx += ((dh % 200) - 100) / 100 * tuning.chalkSpacingWu * 0.6;
    cz += (((dh >>> 8) % 200) - 100) / 100 * tuning.chalkSpacingWu * 0.6;
  }
  const dirX = Math.cos(bearing);
  const dirZ = Math.sin(bearing);
  const chalk = [];
  for (let i = 0; i < tuning.chalkCount; i++) {
    const along = tuning.postOffsetWu * 0.4 + i * tuning.chalkSpacingWu;
    const side = (i % 2 === 0 ? 1 : -1) * swing;
    chalk.push({ x: cx + dirX * along + dirZ * side, z: cz + dirZ * along - dirX * side });
  }
  return chalk;
}

/** Pure: is a hull currently chalked-over (a month, no help from the line)? */
export function isChalkedOver(chalkedUntil, now) {
  return Number.isFinite(chalkedUntil) && now < chalkedUntil;
}

export const pl335DawnLine = {
  name: 'plantsPl335',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._acc = 0;
    this._postId = null;
    this._chalkIds = [];
    this._chalkDay = -1;
    this._correction = null;        // { day, hullKey } — accepted correction steers future dawns
    this._damageSeenAt = null;      // hull damage off the line, waiting for the next chalk
    this._followedDay = -1;
    this._chalkedUntil = new Map(); // hullKey -> simTime (bounded)
    this._toldChalkedAt = new Map();
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
    this._chalkedUntil.clear();
    this._toldChalkedAt.clear();
    this.state = null;
    this.bus = null;
    this.helpers = {};
  },

  _resetSession() {
    this._correction = null;
    this._chalkedUntil.clear();
    this._toldChalkedAt.clear();
    this._drop();
  },

  _drop() {
    const rm = this.helpers?.removeEntity;
    if (typeof rm === 'function') {
      if (this._postId != null) rm(this._postId);
      for (const id of this._chalkIds) rm(id);
    }
    this._postId = null;
    this._chalkIds = [];
    this._chalkDay = -1;
    this._damageSeenAt = null;
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
      if (data.stationId === DAWN_LINE_TUNING.stationId) return e;
    }
    return null;
  },

  _ensureProps(s, now, postPos, chalkDay, chalk) {
    const spawn = this.helpers?.spawnEntity;
    if (typeof spawn !== 'function' || postPos == null) return;
    if (this._postId == null) {
      const ent = spawn({
        type: 'beacon',
        pos: postPos, vel: { x: 0, z: 0 },
        radius: 5,
        mass: 1e6,
        hull: 1,
        hullMax: 1,
        homeSectorId: DAWN_LINE_TUNING.sectorId,
        data: {
          parentType: 'story_prop',
          scanLabel: "The chart post — today's safe line, redrawn every dawn",
          storyPropKind: 'scar_chart_post',
          plantsPl335Post: true,
          swarmFloorPad: { label: 'CHART POST' },
          tetherable: true,
          masslineTetherable: true,
          homeSectorId: DAWN_LINE_TUNING.sectorId,
        },
      });
      if (ent && ent.id != null) this._postId = ent.id;
    }
    if (this._chalkDay !== chalkDay) {
      // Redrawn every dawn: restamp the owned chalk buoys, respawn any missing ones.
      const rm = this.helpers?.removeEntity;
      for (const id of this._chalkIds) rm?.(id);
      this._chalkIds = [];
      for (let i = 0; i < chalk.length; i++) {
        const ent = spawn({
          type: 'beacon',
          pos: chalk[i],
          vel: { x: 0, z: 0 },
          radius: 3,
          mass: 1e6,
          hull: 1,
          hullMax: 1,
          homeSectorId: DAWN_LINE_TUNING.sectorId,
          data: {
            parentType: 'story_prop',
            scanLabel: "Fresh chalk — today's safe line",
            storyPropKind: 'scar_chalk_mark',
            plantsPl335Chalk: i,
            lampsFlashing: true,
            lampFlashUntil: now + 1,
            masslineTetherable: true,
            homeSectorId: DAWN_LINE_TUNING.sectorId,
          },
        });
        if (ent && ent.id != null) this._chalkIds.push(ent.id);
      }
      this._chalkDay = chalkDay;
    }
  },

  _chalkEnts(s) {
    if (typeof s?.entities?.get !== 'function') return [];
    const ents = [];
    for (const id of this._chalkIds) {
      const e = s.entities.get(id);
      if (e && e.alive !== false && e.pos) ents.push(e);
    }
    return ents;
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
    if (s.world?.currentSectorId !== DAWN_LINE_TUNING.sectorId) { this._drop(); return; }
    this._acc += finite(dt);
    if (this._acc < 1) return;                 // 1 Hz — no per-frame work
    const step = this._acc;
    this._acc = 0;

    const station = this._station(s);
    if (!station?.pos) return;
    const player = typeof s.entities?.get === 'function' ? s.entities.get(s.playerId) : null;
    if (!player || player.alive === false || !player.pos) return;
    const now = this._now(s);
    const t = DAWN_LINE_TUNING;
    const day = Math.floor(now / t.MERCY_DAY_S);
    const hullKey = this._hullKey(s, player);
    const h = hash32('plantsPl335post', t.sectorId);
    const bearing = (h % 3600) / 3600 * Math.PI * 2;
    const postPos = {
      x: station.pos.x + Math.cos(bearing) * t.postOffsetWu,
      z: station.pos.z + Math.sin(bearing) * t.postOffsetWu,
    };
    const correctedDay = this._correction && now < this._correction.until ? this._correction.day : null;
    const chalk = chalkLineForDay(postPos, day, correctedDay, t);
    this._ensureProps(s, now, postPos, day, chalk);

    const chalked = isChalkedOver(this._chalkedUntil.get(hullKey), now);
    const ents = this._chalkEnts(s);
    let onLineIndex = -1;
    let nearestD = Infinity;
    for (let i = 0; i < ents.length; i++) {
      const d = Math.hypot(player.pos.x - ents[i].pos.x, player.pos.z - ents[i].pos.z);
      if (d < nearestD) { nearestD = d; if (d <= t.chalkRadiusWu) onLineIndex = i; }
    }

    // A wrong line for fun: your own pod resting by the chart post.
    if (!chalked && this._postId != null && typeof s.entities?.values === 'function') {
      const postEnt = s.entities.get(this._postId);
      if (postEnt?.pos) {
        for (const e of s.entities.values()) {
          if (!e || e.alive === false || !e.data?.playerJettisonOrigin || e.data.plantsPl335False) continue;
          const px = finite(e.pos?.x);
          const pz = finite(e.pos?.z);
          const speed = Math.hypot(finite(e.vel?.x), finite(e.vel?.z));
          if (!Number.isFinite(px) || speed > t.restSpeedWu) continue;
          if (Math.hypot(px - postEnt.pos.x, pz - postEnt.pos.z) > t.falseChalkRadiusWu) continue;
          this._falseChalk(s, now, hullKey, e.id, postEnt);
          break;
        }
      }
    }

    if (chalked) {
      // The line gives a chalked-over hull nothing; the post flashes warning instead.
      if (nearestD <= t.chalkRadiusWu * 2) {
        const last = this._toldChalkedAt.get(hullKey) ?? -Infinity;
        if (now - last >= t.MERCY_DAY_S) {
          this._toldChalkedAt.set(hullKey, now);
          this._voice('plants:pl335:chalked', CHALKED_LINE, 5);
          this._popup('plants:pl335:chalked', CHART_SENDER, CHALKED_LINE, 6);
          this.bus?.emit('audio:cue', { id: 'ui_deny', position: null, gain: 0.4, rate: 1 });
        }
      }
      return;
    }

    // Follow the chalk: the anonymous hand's line takes a little of your weight.
    if (onLineIndex >= 0 && onLineIndex < ents.length - 1) {
      const next = ents[onLineIndex + 1].pos;
      const nx = next.x - player.pos.x;
      const nz = next.z - player.pos.z;
      const nd = Math.hypot(nx, nz) || 1;
      player.vel.x += (nx / nd) * t.pullAlongWu * step;
      player.vel.z += (nz / nd) * t.pullAlongWu * step;
      if (this._followedDay !== day) {
        this._followedDay = day;
        this.bus?.emit(PL_335_FOLLOWED_EVENT, { hullKey, day, t: now });
        this.bus?.emit('audio:cue', { id: 'confirm', position: { x: player.pos.x, z: player.pos.z }, gain: 0.35, rate: 1 });
      }
      // Off-line damage waiting on a chalk: reaching the line accepts the correction.
      if (this._damageSeenAt != null && now - this._damageSeenAt <= t.correctWindowS) {
        this._correction = {
          day,
          hullKey,
          until: now + t.correctDays * t.MERCY_DAY_S,
        };
        this._damageSeenAt = null;
        this.bus?.emit(PL_335_CORRECTION_EVENT, { hullKey, day, steersUntil: this._correction.until, t: now });
        this._voice('plants:pl335:correct', CORRECTION_LINE, 5);
        this._popup('plants:pl335:correct', CHART_SENDER, CORRECTION_LINE, 6);
        this.bus?.emit('audio:cue', { id: 'confirm', position: null, gain: 0.5, rate: 1 });
      }
    } else {
      // Found a hard spot off the line: the damage clock starts (a correction candidate).
      const hull = finite(player.hull, -1);
      const hullMax = finite(player.hullMax, 0);
      if (hull >= 0 && hullMax > 0 && this._lastHull != null && hull < this._lastHull - 0.001) {
        this._damageSeenAt = now;
      }
      this._lastHull = hull;
    }
  },

  _falseChalk(s, now, hullKey, podId, postEnt) {
    const t = DAWN_LINE_TUNING;
    // Consume the false chalk: visitors chalk over it — and over your name.
    const ent = typeof s.entities?.get === 'function' ? s.entities.get(podId) : null;
    if (ent?.data) ent.data.plantsPl335False = true;
    if (typeof this.helpers?.removeEntity === 'function') this.helpers.removeEntity(podId);
    this._chalkedUntil.set(hullKey, now + t.chalkedDays * t.MERCY_DAY_S);
    if (this._chalkedUntil.size > t.memoryCap) this._chalkedUntil.delete(this._chalkedUntil.keys().next().value);
    const station = this._station(s);
    if (station?.data) station.data.plantsPl335ChalkedOver = hullKey;
    if (postEnt?.data) postEnt.data.lampsFlashing = true;
    this.bus?.emit(PL_335_FALSE_CHALK_EVENT, { hullKey, podId, chalkedUntil: this._chalkedUntil.get(hullKey), t: now });
    this.bus?.emit('audio:cue', { id: 'warning', position: null, gain: 0.45, rate: 0.9 });
  },
};

export const pl335DawnLinePlant = pl335DawnLine;
