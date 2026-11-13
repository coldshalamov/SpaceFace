// PL-124 The parked light — "Beat the light on the Tethys bypass three times, and one night it
// waits at the far end, dark, beside a small cairn of parts | Take one — it flashes once as you
// do; take them all, and the next run is not a race"
//
// SEAM NOTE (honest): the old racer's bypass is not a coded race, so this plant lays the bypass
// itself in sector_tethys_junction — a start light and a far light, fixed props. Beating the
// light is a real transit: cross from the start ring to the far ring inside par time; three
// beats arm the payoff. On the first night after the third beat, the parked light waits at the
// far end — dark — beside a cairn of five REAL persistent cargo pods (a cairn you can take one
// from). Taking one flashes the light once. Taking all five ends the racing: the bypass counts
// no more beats, and the light does not wait again.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM.
// - Session state on `this`; destroy() unsubscribes, removes owned props, clears Maps.
// - Night comes from the fixed sim clock; beats are cooldown-gated per leg.
// - The cairn pods are spawnJettisonedCargoPod bodies: persistent, tetherable, honest mass.
// - DURABILITY: the race ledger (beats, race-over) is durable truth in story flags
//   (`plantsPl124Beats`, `plantsPl124RaceOver`) — the lamplighter precedent owns durable
//   facts there, so a save+reload cannot evade the greedy-take consequence. The cairn
//   itself is visit truth: session entities, re-materialized with the parked light.

import { hash32 } from '../../core/rng.js';
import { spawnJettisonedCargoPod } from '../lootShards.js';
import { isNightAt } from './pl146FirstCaller.js';

export const PL_124_BEAT_EVENT = 'plants:pl124:beat';
export const PL_124_PARKED_EVENT = 'plants:pl124:parked';
export const PL_124_TAKE_EVENT = 'plants:pl124:take';
export const PL_124_RACE_OVER_EVENT = 'plants:pl124:raceOver';

export const PL_124_BEATS_FLAG = 'plantsPl124Beats';
export const PL_124_RACE_OVER_FLAG = 'plantsPl124RaceOver';

export const PARKED_LIGHT_TUNING = Object.freeze({
  sectorId: 'sector_tethys_junction',
  dayLengthS: 240,
  nightFraction: 0.25,
  bypassLengthWu: 900,
  ringRadiusWu: 60,
  parTimeS: 26,               // beat the light
  legCooldownS: 8,
  beatsNeeded: 3,
  cairnCount: 5,
  crateAmountU: 1,
  crateUnitMass: 12,
  crateRadius: 3,
  flashOnceS: 1.5,
  memoryCap: 12,              // bounded crate ledger
});

export const BYPASS_SALT = 'plantsPl124Bypass';

export function bypassEndsFor(sectorId, t = PARKED_LIGHT_TUNING) {
  const h = hash32(BYPASS_SALT, String(sectorId ?? t.sectorId));
  const x = -600 + (h % 400);
  const z = 300 + ((h >>> 8) % 400);
  return {
    start: { x, z },
    far: { x: x + t.bypassLengthWu, z: z + Math.round(t.bypassLengthWu * 0.2) },
  };
}

export function createPl124ParkedLight() {
  return {
    name: 'plantsPl124',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._startId = null;
      this._farId = null;
      this._legStartAt = null;
      this._lastBeatAt = -Infinity;
      this._beats = 0;
      this._armedNight = false;
      this._parkedId = null;
      this._crateIds = new Set();
      this._taken = 0;
      this._flashedOnce = false;
      this._raceOver = false;
      // Durable race ledger (lamplighter precedent: durable truth lives in story flags):
      // beats and race-over survive a save+reload, so the greedy take cannot be evaded.
      const flags = this._flags?.() ?? this.state?.story?.flags ?? null;
      this._beats = Math.max(this._beats, Math.max(0, Number(flags?.[PL_124_BEATS_FLAG]) || 0));
      if (flags?.[PL_124_RACE_OVER_FLAG] === true) this._raceOver = true;
      const on = (event, fn) => {
        const off = this.bus?.on?.(event, fn);
        if (typeof off === 'function') this._unsubs.push(off);
      };
      on('pickup:collected', (p = {}) => this._onPickup(p));
      on('sector:exit', () => this._drop());
      on('save:loaded', () => this._drop());
      on('game:new', () => this._resetSession());
      on('game:newGame', () => this._resetSession());
    },

    destroy() {
      for (const off of this._unsubs || []) {
        try { off(); } catch (err) { /* cleanup must not throw */ }
      }
      this._unsubs = [];
      this._resetSession();
    },

    _resetSession() {
      this._drop(true);
    },

    _drop(hard) {
      const rm = this.helpers?.removeEntity;
      if (typeof rm === 'function') {
        if (this._startId != null) rm(this._startId);
        if (this._farId != null) rm(this._farId);
        if (this._parkedId != null) rm(this._parkedId);
        for (const id of this._crateIds || []) rm(id);
      }
      this._startId = null;
      this._farId = null;
      this._parkedId = null;
      this._crateIds?.clear();
      this._legStartAt = null;
      this._armedNight = false;
      if (hard) {
        this._beats = 0;
        this._taken = 0;
        this._raceOver = false;
        this._flashedOnce = false;
        this._lastBeatAt = -Infinity;
      }
    },

    _now() {
      const s = this.state;
      return Number.isFinite(s?.simTime) ? s.simTime : (Number.isFinite(s?.tick) ? s.tick / 60 : 0);
    },

    _flags() {
      const flags = this.state?.story?.flags;
      return flags ? flags : (this.state?.story ? (this.state.story.flags = {}) : null);
    },

    _ensure(state) {
      const spawn = this.helpers?.spawnEntity;
      if (typeof spawn !== 'function' || this._startId != null) return;
      const t = PARKED_LIGHT_TUNING;
      const { start, far } = bypassEndsFor(state.world?.currentSectorId, t);
      const mk = (pos, label) => spawn({
        type: 'beacon',
        pos,
        vel: { x: 0, z: 0 },
        radius: 5,
        mass: 1e6,
        hull: 1,
        hullMax: 1,
        homeSectorId: t.sectorId,
        data: {
          parentType: 'story_prop',
          storyPropKind: 'plants_bypass_light',
          plantsPl124Light: true,
          scanLabel: label,
          lampsFlashing: true,
        },
      });
      const s1 = mk(start, 'The Tethys bypass — the start light');
      const s2 = mk(far, 'The Tethys bypass — the far light');
      if (s1 && s1.id != null) this._startId = s1.id;
      if (s2 && s2.id != null) this._farId = s2.id;
    },

    _player(state) {
      return state?.entities?.get ? state.entities.get(state.playerId) : null;
    },

    _spawnParked(state, far) {
      const spawn = this.helpers?.spawnEntity;
      if (typeof spawn !== 'function' || this._parkedId != null) return;
      const t = PARKED_LIGHT_TUNING;
      const now = this._now();
      const light = spawn({
        type: 'beacon',
        pos: { x: far.x + 18, z: far.z + 18 },
        vel: { x: 0, z: 0 },
        radius: 4,
        mass: 1e6,
        hull: 1,
        hullMax: 1,
        homeSectorId: t.sectorId,
        data: {
          parentType: 'story_prop',
          storyPropKind: 'plants_parked_racer_light',
          plantsPl124Parked: true,
          scanLabel: 'The old racer\u2019s light — parked, dark, waiting',
          swarmFloorPad: { label: 'Parked, dark' },
          lampsFlashing: false, // dark: it waits
        },
      });
      if (light && light.id != null) this._parkedId = light.id;
      // A small cairn of parts: five real pods you can take one from.
      for (let i = 0; i < t.cairnCount; i += 1) {
        const ang = (Math.PI * 2 * i) / t.cairnCount + hash32('plantsPl124Cairn', i) % 7 / 7;
        const pod = spawnJettisonedCargoPod(state, {
          commodityId: 'cmdty_scrap_metal',
          amount: t.crateAmountU,
          unitMass: t.crateUnitMass,
          radius: t.crateRadius,
          pos: { x: far.x + 34 + Math.cos(ang) * 9, z: far.z + 34 + Math.sin(ang) * 9 },
          vel: { x: 0, z: 0 },
          ownerId: null,
        }, this.helpers);
        if (pod && pod.id != null) {
          pod.data = pod.data || {};
          pod.data.plantsPl124Cairn = true;
          pod.data.scanLabel = 'Part of the cairn — take one, or take them all';
          pod.data.swarmFloorPad = { label: 'Cairn part' };
          pod.data.masslineTetherable = true;
          this._crateIds.add(pod.id);
        }
      }
      this._armedNight = false;
      this.bus?.emit('comms:popup', {
        id: `plants:pl124:parked:${Math.round(now)}`,
        sender: 'The far end',
        category: 'story',
          text: 'At the far end: a light waits, dark.',
        ttl: 9,
        persist: false,
      });
      this.bus?.emit(PL_124_PARKED_EVENT, { lightId: this._parkedId, crates: this._crateIds.size, t: now });
    },

    _onPickup(payload) {
      if (!this._crateIds.has(payload.pickupId)) return;
      if (payload.collectorId !== this.state?.playerId) return;
      this._crateIds.delete(payload.pickupId);
      this._taken += 1;
      const now = this._now();
      const t = PARKED_LIGHT_TUNING;
      const light = this._parkedId != null && this.state?.entities?.get
        ? this.state.entities.get(this._parkedId) : null;
      if (light?.data && !this._flashedOnce) {
        // Take one — it flashes once as you do.
        this._flashedOnce = true;
        light.data.lampsFlashing = true;
        light.data.lampFlashUntil = now + t.flashOnceS;
      }
      this.bus?.emit(PL_124_TAKE_EVENT, { taken: this._taken, cratesLeft: this._crateIds.size, t: now });
      if (this._crateIds.size === 0) {
        // Take them all, and the next run is not a race.
        this._raceOver = true;
        const flags = this._flags();
        if (flags) flags[PL_124_RACE_OVER_FLAG] = true;
        if (light?.data) {
          light.data.lampsFlashing = false;
          light.data.lampFlashUntil = now;
        }
        this.bus?.emit('comms:popup', {
          id: `plants:pl124:raceover:${Math.round(now)}`,
          sender: 'The far end',
          category: 'story',
          text: 'The next run is not a race.',
          ttl: 9,
          persist: false,
        });
        this.bus?.emit(PL_124_RACE_OVER_EVENT, { taken: this._taken, t: now });
      }
    },

    update(dt, state) {
      const s = state || this.state;
      if (!s || s.mode !== 'flight') return;
      if (s.world?.currentSectorId !== PARKED_LIGHT_TUNING.sectorId) return;
      this._ensure(s);
      const now = this._now();
      const t = PARKED_LIGHT_TUNING;
      const { start, far } = bypassEndsFor(s.world?.currentSectorId, t);
      const player = this._player(s);
      const parkedReady = this._beats >= t.beatsNeeded && this._parkedId == null && !this._raceOver;
      // The parked light waits on the first night after the third beat.
      if (parkedReady && !this._armedNight) this._armedNight = true;
      if (this._armedNight && this._parkedId == null && !this._raceOver && isNightAt(now, t)) {
        this._spawnParked(s, far);
      }
      if (!player?.pos) return;
      // The parked light's one flash decays back to dark.
      const light = this._parkedId != null && s.entities?.get ? s.entities.get(this._parkedId) : null;
      if (light?.data && light.data.lampsFlashing === true
        && Number.isFinite(light.data.lampFlashUntil) && now >= light.data.lampFlashUntil) {
        light.data.lampsFlashing = false;
      }
      // Beating the light: start ring, then far ring, under par, cooldown-gated.
      if (this._raceOver) return;
      const sx = Number(player.pos.x), sz = Number(player.pos.z);
      const atStart = Math.hypot(sx - start.x, sz - start.z) <= t.ringRadiusWu;
      const atFar = Math.hypot(sx - far.x, sz - far.z) <= t.ringRadiusWu;
      if (atStart) {
        if (this._legStartAt == null) this._legStartAt = now;
        return;
      }
      if (atFar && this._legStartAt != null && now - this._legStartAt <= t.parTimeS
          && now - this._lastBeatAt >= t.legCooldownS) {
        this._legStartAt = null;
        this._lastBeatAt = now;
        this._beats += 1;
        const flags = this._flags();
        if (flags) flags[PL_124_BEATS_FLAG] = this._beats;
        this.bus?.emit('audio:cue', { id: 'confirm' });
        this.bus?.emit(PL_124_BEAT_EVENT, { beats: this._beats, needed: t.beatsNeeded, t: now });
      } else if (atFar) {
        this._legStartAt = null;
      }
    },
  };
}

export const pl124ParkedLight = createPl124ParkedLight();
