// PL-275 The tip jar that tips back — Tethys (design/program/INFERENCE_PLANTS.md, row PL-275).
// "The tip jar that tips back. Leave something in the fitting berth's jar and your next
// repair comes back with a free pressure wash already done."
// What the player can do: Tip kindly; or fish coins back out — washes become minimum
// service, for you alone.
//
// SEAM NOTE (honest): the fitting berth is the docking ring of the REAL Tethys trade hub
// (station_tethys, sector_tethys_junction); the jar is a chalked prop at a fixed hash
// bearing. Tipping is physical: a jettisoned cargo pod drifting inside the tip range for
// tuning.depositS drops into the jar (the pod is consumed by the jar, not by cargo code).
// The wash is triggered by the real dock:range gate on the player's next visit while the
// jar is armed: steam cue + a hull stamp (data.plantsPl275WashedUntil) + one line. Fishing
// the coins back out is a real hard impact on the jar while it holds a tip. After that,
// washes read as minimum service — denial + label change — for the tipping hull alone.
// NO economy writes anywhere: a wash is a cue and a stamp, never a credits mutation.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only; arm day and service day are pure clock
//   math. No Math.random(), no Date.now().
// - No Three.js, no DOM. Bounded memory: the stingy-hull ledger Map capped at memoryCap.
// - Session state on `this`; destroy() unsubscribes all + despawns owned props.
// - Durable receipts are flag-borne (state.story.flags.plantsPl275Stingy), pl199 pattern.

import { hash32 } from '../../core/rng.js';
import { BUBBLE_MULTIPLIERS } from '../../data/stationBubbles.js';
import { plantStationById as stationOf } from '../plantEntityViews.js';

export const PL_275_TIP_EVENT = 'plants:pl275:tip';
export const PL_275_WASH_EVENT = 'plants:pl275:wash';
export const PL_275_MIN_EVENT = 'plants:pl275:minimum';
export const PL_275_FISHED_EVENT = 'plants:pl275:fished';

export const TIP_JAR_TUNING = Object.freeze({
  stationId: 'station_tethys',
  sectorId: 'sector_tethys_junction',
  dayLengthS: 240,
  jarRadiusMult: BUBBLE_MULTIPLIERS.docking, // 2.4x — the fitting berth apron
  tipRangeWu: 30,
  depositS: 4,                 // a pod inside the range this long drops in
  washImpulseGate: 90,         // fishing the coins back is a real hit
  jarRadius: 5,
  memoryCap: 8,
  sender: 'Fitting berth',
});

export const JAR_SALT = 'plantsPl275Jar';
export const WASH_LINE = 'The wash was already done when you landed.';
export const MIN_LINE = 'Minimum service. The jar remembers fingers.';

/** The jar's fixed spot on the fitting-berth apron, hash-derived bearing. */
export function jarPointFor(station, t = TIP_JAR_TUNING) {
  const a = (hash32(JAR_SALT, (station.data && station.data.stationId) || station.id) % 6283) / 1000;
  const base = Number.isFinite(station.data?.dockRadius) && station.data.dockRadius > 0
    ? station.data.dockRadius
    : (station.size === 'L' ? 90 : station.size === 'S' ? 60 : 72);
  const r = base * t.jarRadiusMult;
  return { x: station.pos.x + Math.cos(a) * r, z: station.pos.z + Math.sin(a) * r };
}

/** Day index of the shared plant clock. */
export function jarDayOf(simTime, t = TIP_JAR_TUNING) {
  return Math.floor((Number.isFinite(simTime) ? simTime : 0) / Math.max(1, t.dayLengthS));
}

export function createTipJar() {
  return {
    name: 'plantsPl275',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._jarId = null;
      this._jarPoint = null;
      this._tips = 0;              // pods in the jar right now
      this._armedDay = -1;         // day the wash was earned
      this._washedDay = -1;        // day the wash was actually done
      this._pendingPod = null;     // pod id counting down into the jar
      this._pendingSince = null;
      this._fishedAt = null;
      this._stingy = new Map();    // hullId -> true, capped ledger
      const on = (event, fn) => {
        const off = this.bus?.on?.(event, fn);
        if (typeof off === 'function') this._unsubs.push(off);
      };
      on('physics:impact', (p = {}) => this._onImpact(p));
      on('dock:range', (p) => this._onDock(p));
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
      this._drop();
      this._stingy?.clear();
    },

    _drop() {
      if (this._jarId != null) this.helpers?.removeEntity?.(this._jarId);
      this._jarId = null;
      this._jarPoint = null;
      this._tips = 0;
      this._armedDay = -1;
      this._washedDay = -1;
      this._pendingPod = null;
      this._pendingSince = null;
      this._fishedAt = null;
    },

    _now() {
      const s = this.state;
      return Number.isFinite(s?.simTime) ? s.simTime : (Number.isFinite(s?.tick) ? s.tick / 60 : 0);
    },

    _flags() {
      const s = this.state;
      return s && s.story ? (s.story.flags || (s.story.flags = {})) : null;
    },

    _popup(id, sender, text, ttl = 8) {
      this.bus?.emit('comms:popup', { id, sender, category: 'traffic', text, ttl, persist: false });
    },

    _cue(id, gain = 0.45, rate) {
      const payload = { id, gain };
      if (rate != null) payload.rate = rate;
      this.bus?.emit('audio:cue', payload);
    },

    _emit(type, payload) {
      this.bus?.emit(type, payload);
    },

    _get(id) {
      return this.state?.entities?.get ? this.state.entities.get(id) : null;
    },

    _isStingy(hullId) {
      if (this._flags()?.plantsPl275Stingy) return true;
      return this._stingy.has(String(hullId));
    },

    _ensureJar(station) {
      const spawn = this.helpers?.spawnEntity;
      if (typeof spawn !== 'function' || this._jarId != null) return;
      const point = jarPointFor(station);
      this._jarPoint = point;
      const jar = spawn({
        type: 'beacon',
        pos: { x: point.x, z: point.z },
        vel: { x: 0, z: 0 },
        radius: TIP_JAR_TUNING.jarRadius,
        mass: 1e6,
        hull: 1,
        hullMax: 1,
        homeSectorId: TIP_JAR_TUNING.sectorId,
        data: {
          parentType: 'story_prop',
          storyPropKind: 'plants_tip_jar',
          plantsPl275Jar: true,
          placeId: 'place_cargo_pod_standard',
          everydaySpaceKit: true,
          scanLabel: 'The fitting berth\u2019s tip jar — it tips back',
          swarmFloorPad: { label: 'TIP JAR' },
        },
      });
      this._jarId = jar && jar.id != null ? jar.id : null;
    },

    _onImpact(p) {
      const s = this.state;
      if (!s || !p || this._jarId == null) return;
      const jar = [p.aId, p.bId]
        .map((id) => (id != null ? this._get(id) : null))
        .find((e) => e && e.data && e.data.plantsPl275Jar === true);
      if (!jar) return;
      if ((Number(p.impulse) || 0) < TIP_JAR_TUNING.washImpulseGate) return;
      if (this._tips <= 0) return;
      const now = this._now();
      // Fished the coins back out: the jar empties, and washes turn minimum — for you alone.
      this._tips = 0;
      this._armedDay = -1;
      this._fishedAt = now;
      const key = String(s.playerId);
      if (this._stingy.size >= TIP_JAR_TUNING.memoryCap) this._stingy.clear();
      this._stingy.set(key, true);
      const flags = this._flags();
      if (flags) flags.plantsPl275Stingy = true;
      const jarEnt = this._get(this._jarId);
      if (jarEnt?.data) jarEnt.data.swarmFloorPad = { label: 'TIP JAR \u2014 LIGHT' };
      this._cue('ui_deny', 0.5);
      this._popup(`plants:pl275:fished:${Math.round(now)}`, TIP_JAR_TUNING.sender,
        'Coins back out of a tip jar. The whole berth watched.');
      this._emit(PL_275_FISHED_EVENT, { hullId: s.playerId, t: now });
    },

    _onDock(p) {
      const s = this.state;
      if (!s || !p || p.shipId == null) return;            // ignore shipId-less UI re-emits
      if (((p.stationId) || '') !== TIP_JAR_TUNING.stationId || p.inRange !== true) return;
      if (p.shipId !== s.playerId) return;
      const now = this._now();
      const day = jarDayOf(now);
      const stingy = this._isStingy(p.shipId);
      if (stingy) {
        if (this._washedDay !== day) {
          this._washedDay = day;
          this._cue('ui_deny', 0.4);
          this._popup(`plants:pl275:min:${Math.round(now)}`, TIP_JAR_TUNING.sender, MIN_LINE);
          this._emit(PL_275_MIN_EVENT, { hullId: p.shipId, day, t: now });
        }
        return;
      }
      if (this._armedDay === day && this._washedDay !== day) {
        // Your next repair comes back with a free pressure wash already done.
        this._washedDay = day;
        const player = this._get(p.shipId);
        if (player?.data) player.data.plantsPl275WashedUntil = now + 60;
        this._cue('sfx_vent_chime', 0.5, 1.3);
        this._popup(`plants:pl275:wash:${Math.round(now)}`, TIP_JAR_TUNING.sender, WASH_LINE);
        this._emit(PL_275_WASH_EVENT, { hullId: p.shipId, day, t: now });
      }
    },

    update(dt, state) {
      const s = state || this.state;
      if (!s || s.mode !== 'flight') return;
      if (s.world?.currentSectorId !== TIP_JAR_TUNING.sectorId) { this._drop(); return; }
      const station = stationOf(s, TIP_JAR_TUNING.stationId);
      if (!station?.pos) { this._drop(); return; }
      const now = this._now();
      const t = TIP_JAR_TUNING;
      this._ensureJar(station);
      if (!this._jarPoint) return;

      // A pod drifting inside the tip range for depositS drops into the jar.
      if (this._pendingPod != null) {
        const pod = this._get(this._pendingPod);
        if (!pod || pod.alive === false || !pod.pos
            || Math.hypot(pod.pos.x - this._jarPoint.x, pod.pos.z - this._jarPoint.z) > t.tipRangeWu * 1.4) {
          this._pendingPod = null;   // drifted out: not a tip
          this._pendingSince = null;
        } else if (now - this._pendingSince >= t.depositS) {
          this.helpers?.removeEntity?.(this._pendingPod);
          this._pendingPod = null;
          this._pendingSince = null;
          this._tips += 1;
          this._armedDay = jarDayOf(now);
          const jarEnt = this._get(this._jarId);
          if (jarEnt?.data) jarEnt.data.swarmFloorPad = { label: `TIP JAR (${this._tips})` };
          this._cue('confirm', 0.4);
          this._emit(PL_275_TIP_EVENT, { tips: this._tips, armedDay: this._armedDay, t: now });
        }
      }
      if (this._pendingPod == null && s.entities && typeof s.entities.values === 'function') {
        for (const e of s.entities.values()) {
          if (!e || e.alive === false || e.type !== 'payload' || !e.pos) continue;
          const d = e.data || {};
          if (!d.commodityId) continue;                    // jettisoned cargo pods only
          if (Math.hypot(e.pos.x - this._jarPoint.x, e.pos.z - this._jarPoint.z) <= t.tipRangeWu) {
            this._pendingPod = e.id;
            this._pendingSince = now;
            break;
          }
        }
      }
    },
  };
}

export const tipJarPlant = createTipJar();
