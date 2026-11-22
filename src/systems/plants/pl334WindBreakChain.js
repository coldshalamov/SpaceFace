// PL-334 Hyperion Cut — "The wind-break chain. At the Cut's worst reach somebody keeps a queue of
// chained handles so small hulls can pull through hand over hand | Use a handle, let go at the
// mark; or skip the chain — handles stop being chained, and the wind argues with you alone |
// DRAFT 2026-11-13"
//
// SEAM NOTE (honest): the Cut is sector_hyperion_cut / station_hyperion_cut (verified in
// src/data/frontierRegions/west.js). The chain exists only in the row, so it is a line of
// CHAIN_COUNT story-prop handles (beacons.js story-prop shape, masslineTetherable, lampsFlashing),
// strung across the Cut's worst reach at hash-fixed offsets. Using a handle is physical: fly into
// a handle's radius at pull pace and the chain takes the strain — a gentle deterministic pull
// along the chain toward the mark (last handle), capped per handle. Skipping is physical too:
// crossing the reach above skip pace without touching a handle breaks the chain for a window —
// the handles unchain (masslineTetherable off, lamps dark) — and "the wind argues with you
// alone": gust impulses bite only the hull that skipped, while the chain is broken.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM imports.
// - Session state on `this`; destroy()/sector:exit despawn owned handles (RESET not unsubscribe).
// - Bounded ledgers (tuning.memoryCap); per-handle and per-hull cooldowns; gusts capped and
//   cooldown-gated.
// - Velocity writes touch only the interacting hull, never another system's writer.

import { hash32 } from '../../core/rng.js';
import { queuePlayerImpulse } from './playerImpulse.js';

export const PL_334_HANDLED_EVENT = 'plants:pl334:handled';
export const PL_334_MARK_EVENT = 'plants:pl334:mark';
export const PL_334_SKIP_EVENT = 'plants:pl334:skip';

export const CHAIN_SENDER = 'THE WIND-BREAK CHAIN';
export const HANDLED_LINE = 'Hand over hand. Let go at the mark.';
export const SKIP_LINE = 'The wind argues with you alone.';

export const WIND_BREAK_TUNING = Object.freeze({
  plId: 'pl334',
  sectorId: 'sector_hyperion_cut',
  stationId: 'station_hyperion_cut',
  MERCY_DAY_S: 240,          // the tuning day, same constant as sibling mercy modules
  chainCount: 5,
  chainSpacingWu: 130,
  reachOffsetWu: 420,
  handleRadiusWu: 45,
  markRadiusWu: 55,
  pullSpeedMaxWu: 26,        // pull pace: small hulls, hand over hand
  pullAlongWu: 14,           // the chain takes the strain: gentle deterministic pull per tick-second
  handleCooldownS: 8,
  skipSpeedWu: 90,           // blasting the reach above this pace skips the chain
  skipGraceS: 20,            // crossing without any handle use inside this window skips it
  chainBrokenS: 3 * 240,     // handles stop being chained: three mercy days
  gustCooldownS: 5,
  gustCountCap: 24,          // bounded gusts per broken window per hull
  memoryCap: 6,
});

const finite = (v, f = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : f;
};

/** Pure: the chain's anchor off the station, and each handle position (last handle = the mark). */
export function chainPositions(stationPos, tuning = WIND_BREAK_TUNING) {
  const h = hash32('plantsPl334chain', tuning.sectorId);
  const bearing = (h % 3600) / 3600 * Math.PI * 2;
  const ax = finite(stationPos?.x) + Math.cos(bearing) * tuning.reachOffsetWu;
  const az = finite(stationPos?.z) + Math.sin(bearing) * tuning.reachOffsetWu;
  const dirX = Math.cos(bearing + Math.PI / 2);
  const dirZ = Math.sin(bearing + Math.PI / 2);
  const handles = [];
  for (let i = 0; i < tuning.chainCount; i++) {
    const along = (i - (tuning.chainCount - 1) / 2) * tuning.chainSpacingWu;
    handles.push({ x: ax + dirX * along, z: az + dirZ * along });
  }
  return { anchor: { x: ax, z: az }, handles };
}

/** Pure: is the chain broken (handles unchained) at `now`? */
export function isChainBroken(brokenUntil, now) {
  return Number.isFinite(brokenUntil) && now < brokenUntil;
}

export const pl334WindBreakChain = {
  modes: ['flight'],
  name: 'plantsPl334',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._acc = 0;
    this._handleIds = [];
    this._brokenUntil = null;
    this._lastHandledAt = new Map();   // handleIndex -> simTime (bounded by chainCount)
    this._handledThisPass = false;
    this._passWindowStart = null;
    this._skipHulls = new Map();       // hullKey -> { since, gusts } (bounded)
    this._toldSkipAt = new Map();      // hullKey -> simTime (bounded)
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
    this._skipHulls.clear();
    this._toldSkipAt.clear();
    this._lastHandledAt.clear();
    this.state = null;
    this.bus = null;
    this.helpers = {};
  },

  _resetSession() {
    this._skipHulls.clear();
    this._toldSkipAt.clear();
    this._drop();
  },

  _drop() {
    const rm = this.helpers?.removeEntity;
    if (typeof rm === 'function') {
      for (const id of this._handleIds) rm(id);
    }
    this._handleIds = [];
    this._brokenUntil = null;
    this._handledThisPass = false;
    this._passWindowStart = null;
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
      if (data.stationId === WIND_BREAK_TUNING.stationId) return e;
    }
    return null;
  },

  _ensureChain(s, now, positions) {
    const spawn = this.helpers?.spawnEntity;
    if (typeof spawn !== 'function' || positions == null) return;
    if (this._handleIds.length !== WIND_BREAK_TUNING.chainCount) {
      const broken = isChainBroken(this._brokenUntil, now);
      for (let i = 0; i < WIND_BREAK_TUNING.chainCount; i++) {
        const isMark = i === WIND_BREAK_TUNING.chainCount - 1;
        const ent = spawn({
          type: 'beacon',
          pos: positions.handles[i],
          vel: { x: 0, z: 0 },
          radius: 4,
          mass: 1e6,
          hull: 1,
          hullMax: 1,
          homeSectorId: WIND_BREAK_TUNING.sectorId,
          data: {
            parentType: 'story_prop',
            scanLabel: isMark ? 'The mark — let go' : 'A chained handle — pull through hand over hand',
            storyPropKind: 'wind_break_handle',
            plantsPl334Handle: i,
            lampsFlashing: !broken,
            lampFlashUntil: now + 1,
            swarmFloorPad: { label: isMark ? 'THE MARK' : 'CHAINED HANDLE' },
            tetherable: !broken,
            masslineTetherable: !broken,
            homeSectorId: WIND_BREAK_TUNING.sectorId,
          },
        });
        if (ent && ent.id != null) this._handleIds.push(ent.id);
      }
    }
  },

  _handleEnts(s) {
    if (typeof s?.entities?.get !== 'function') return [];
    const ents = [];
    for (const id of this._handleIds) {
      const e = s.entities.get(id);
      if (e && e.alive !== false && e.data) ents.push(e);
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
    if (s.world?.currentSectorId !== WIND_BREAK_TUNING.sectorId) { this._drop(); return; }
    this._acc += finite(dt);
    if (this._acc < 1) return;                 // 1 Hz — no per-frame work
    const step = this._acc;
    this._acc = 0;

    const station = this._station(s);
    if (!station?.pos) return;
    const player = typeof s.entities?.get === 'function' ? s.entities.get(s.playerId) : null;
    if (!player || player.alive === false || !player.pos) return;
    const now = this._now(s);
    const t = WIND_BREAK_TUNING;
    const positions = chainPositions(station.pos, t);
    this._ensureChain(s, now, positions);

    const hullKey = this._hullKey(s, player);
    const speed = Math.hypot(finite(player.vel?.x), finite(player.vel?.z));
    const ents = this._handleEnts(s);
    if (!ents.length) return;

    // Chain state flips: crossing the reach above skip pace with no handle use breaks the chain.
    const nearChain = ents.some((e) => Math.hypot(player.pos.x - e.pos.x, player.pos.z - e.pos.z) <= t.handleRadiusWu * 3);
    const broken = isChainBroken(this._brokenUntil, now);
    if (!this._handledThisPass && nearChain) {
      if (this._passWindowStart == null) this._passWindowStart = now;
      if (!broken && speed > t.skipSpeedWu && now - this._passWindowStart <= t.skipGraceS) {
        this._breakChain(s, now, hullKey);
      }
    }
    if (this._passWindowStart != null && now - this._passWindowStart > t.skipGraceS) {
      this._passWindowStart = null;
      if (!nearChain) this._handledThisPass = false;
    }

    // Handle use: pull pace inside a handle's radius — the chain takes the strain.
    for (const e of ents) {
      const idx = e.data.plantsPl334Handle ?? 0;
      const d = Math.hypot(player.pos.x - e.pos.x, player.pos.z - e.pos.z);
      const chained = e.data.masslineTetherable === true;
      const lastUse = this._lastHandledAt.get(idx) ?? -Infinity;
      if (d <= t.handleRadiusWu && speed <= t.pullSpeedMaxWu && chained && now - lastUse >= t.handleCooldownS) {
        this._lastHandledAt.set(idx, now);
        this._handledThisPass = true;
        this._passWindowStart = null;
        // Pull along the chain toward the mark: deterministic, capped, small — through
        // the membrane (the handles are the visible source), never a raw vel write.
        const mark = positions.handles[t.chainCount - 1];
        const mx = mark.x - player.pos.x;
        const mz = mark.z - player.pos.z;
        const md = Math.hypot(mx, mz) || 1;
        queuePlayerImpulse(s, player, (mx / md) * t.pullAlongWu * step, (mz / md) * t.pullAlongWu * step,
          'plantsPl334HandlePull', { continuous: true, dt: step });
        if (idx === t.chainCount - 1) {
          this.bus?.emit(PL_334_MARK_EVENT, { hullKey, t: now });
          this.bus?.emit('audio:cue', { id: 'confirm', position: { x: e.pos.x, z: e.pos.z }, gain: 0.5, rate: 1 });
        } else if (now - (this._toldHandledAt ?? -Infinity) >= t.handleCooldownS) {
          this._toldHandledAt = now;
          this.bus?.emit(PL_334_HANDLED_EVENT, { hullKey, handleIndex: idx, t: now });
          this._voice('plants:pl334:handled', HANDLED_LINE, 5);
          this._popup('plants:pl334:handled', CHAIN_SENDER, HANDLED_LINE, 6);
          this.bus?.emit('audio:cue', { id: 'confirm', position: { x: e.pos.x, z: e.pos.z }, gain: 0.4, rate: 1 });
        }
      }
    }

    // The wind argues with you alone: gusts bite only hulls that skipped, while broken.
    const brokenNow = isChainBroken(this._brokenUntil, now);   // fresh: the break may have fired this tick
    if (brokenNow && this._skipHulls.has(hullKey)) {
      const rec = this._skipHulls.get(hullKey);
      const lastGust = rec.lastGust ?? -Infinity;
      if (nearChain && rec.gusts < t.gustCountCap && now - lastGust >= t.gustCooldownS) {
        rec.lastGust = now;
        rec.gusts += 1;
        // R23: the wind argues aloud now — no invisible shove on the hull.
        this.bus?.emit('audio:cue', { id: 'warning', position: { x: player.pos.x, z: player.pos.z }, gain: 0.35, rate: 0.9 });
      }
    } else if (!brokenNow) {
      this._skipHulls.delete(hullKey);
    }
  },

  _breakChain(s, now, hullKey) {
    const t = WIND_BREAK_TUNING;
    this._brokenUntil = now + t.chainBrokenS;
    // Handles stop being chained.
    for (const e of this._handleEnts(s)) {
      e.data.masslineTetherable = false;
      e.data.tetherable = false;
      e.data.lampsFlashing = false;
      e.data.lampFlashUntil = now;
    }
    this._skipHulls.set(hullKey, { since: now, gusts: 0, lastGust: -Infinity });
    if (this._skipHulls.size > t.memoryCap) this._skipHulls.delete(this._skipHulls.keys().next().value);
    const station = this._station(s);
    if (station?.data) station.data.plantsPl334SkippedBy = hullKey;
    const last = this._toldSkipAt.get(hullKey) ?? -Infinity;
    if (now - last >= t.MERCY_DAY_S) {
      this._toldSkipAt.set(hullKey, now);
      this._voice('plants:pl334:skip', SKIP_LINE, 5);
      this._popup('plants:pl334:skip', CHAIN_SENDER, SKIP_LINE, 6);
    }
    this.bus?.emit(PL_334_SKIP_EVENT, { hullKey, brokenUntil: this._brokenUntil, t: now });
  },
};

export const pl334WindBreakChainPlant = pl334WindBreakChain;
