// PL-155 Fair trade — "The second beacon at Sedna blinks a second pattern, slower. It marks a
// hatch in the dark, out past the last lamp. Whatever you post in comes back as something else,
// about the same weight | Post junk, receive junk; or post something you love; or post nothing"
//
// MECHANIC (physical, no menus): the hatch is a real story-prop in sector_sedna_dark, farther
// out than the second beacon. Jettison a pod (data.playerJettisonOrigin — your own jettisons)
// so it comes to rest inside the hatch ring; after a beat the hatch swallows it and hands back
// a DIFFERENT commodity in a pod of the SAME physics mass (weight-for-weight, honest physics).
// "Something you love" is not a machine-readable fact — anything posted returns as something
// else; that limit is stated, not faked.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
//   The returned junk is hash32(podId)-picked from a fixed junk list.
// - No Three.js, no DOM.
// - Session state on `this`; destroy() unsubscribes, removes owned props, clears bounded Maps.
// - The second beacon blinks SLOWER: its lampsFlashing window is restamped on a long period.
// - One post per pod; the posted-pod ledger is bounded (tuning.memoryCap).

import { hash32 } from '../../core/rng.js';
import { spawnJettisonedCargoPod } from '../lootShards.js';

export const PL_155_TRADE_EVENT = 'plants:pl155:trade';

export const FAIR_TRADE_TUNING = Object.freeze({
  sectorId: 'sector_sedna_dark',
  slowBlinkPeriodS: 6,        // the second pattern, slower
  slowBlinkOnS: 2.2,
  secondBeaconOffsetWu: 120,
  hatchOffsetWu: 520,         // out past the last lamp
  hatchRadiusWu: 60,          // the posting ring
  restSpeedWu: 6,             // a posted pod has stopped
  returnDelayS: 3,            // the hatch takes a beat
  memoryCap: 8,               // bounded post ledger
});

export const PL_155_JUNK = Object.freeze([
  'cmdty_scrap_metal',
  'cmdty_salvage_electronics',
  'cmdty_alloys',
  'cmdty_silicate',
]);

/** The hatch's deterministic junk pick for a posted pod — never the commodity posted in. */
export function returnCommodityFor(podId, postedCommodityId) {
  const roll = hash32('plantsPl155Junk', String(podId));
  const list = PL_155_JUNK;
  const posted = typeof postedCommodityId === 'string' ? postedCommodityId : null;
  const first = roll % list.length;
  if (posted == null || list[first] !== posted) return list[first];
  return list[(first + 1) % list.length]; // something ELSE: step past what you posted
}

export function hatchPositions(anchor, t = FAIR_TRADE_TUNING) {
  return {
    secondBeacon: { x: anchor.x + t.secondBeaconOffsetWu, z: anchor.z },
    hatch: { x: anchor.x + t.hatchOffsetWu, z: anchor.z + t.secondBeaconOffsetWu },
  };
}

export function createPl155FairTrade() {
  return {
    name: 'plantsPl155',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._beaconId = null;
      this._hatchId = null;
      this._posted = new Map();     // podId -> postedAt (bounded)
      this._returns = new Map();    // podId -> returnAt
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
        if (this._beaconId != null) rm(this._beaconId);
        if (this._hatchId != null) rm(this._hatchId);
      }
      this._beaconId = null;
      this._hatchId = null;
      this._posted?.clear();
      this._returns?.clear();
      if (hard) { /* nothing durable */ }
    },

    _now() {
      const s = this.state;
      return Number.isFinite(s?.simTime) ? s.simTime : (Number.isFinite(s?.tick) ? s.tick / 60 : 0);
    },

    _entities(state) {
      const ents = state?.entities;
      if (!ents) return [];
      if (typeof ents.values === 'function') return [...ents.values()];
      if (Array.isArray(ents)) return ents;
      return [];
    },

    _sectorAnchor(sectorId) {
      const h = hash32('plantsPl155Anchor', String(sectorId ?? FAIR_TRADE_TUNING.sectorId));
      return { x: -300 + (h % 800), z: -800 + ((h >>> 8) % 800) };
    },

    _ensure(state) {
      const spawn = this.helpers?.spawnEntity;
      if (typeof spawn !== 'function' || this._hatchId != null) return;
      const t = FAIR_TRADE_TUNING;
      const now = this._now();
      const { secondBeacon, hatch } = hatchPositions(this._sectorAnchor(state.world?.currentSectorId), t);
      const beacon = spawn({
        type: 'beacon',
        pos: secondBeacon,
        vel: { x: 0, z: 0 },
        radius: 5,
        mass: 1e6,
        hull: 1,
        hullMax: 1,
        homeSectorId: t.sectorId,
        data: {
          parentType: 'story_prop',
          storyPropKind: 'plants_fair_trade_second_beacon',
          plantsPl155Beacon: true,
          scanLabel: 'The second beacon — a second pattern, slower',
          lampsFlashing: true,
          lampFlashUntil: now + t.slowBlinkOnS,
        },
      });
      if (beacon && beacon.id != null) this._beaconId = beacon.id;
      const hatchEnt = spawn({
        type: 'beacon',
        pos: hatch,
        vel: { x: 0, z: 0 },
        radius: 7,
        mass: 1e6,
        hull: 1,
        hullMax: 1,
        homeSectorId: t.sectorId,
        data: {
          parentType: 'story_prop',
          storyPropKind: 'plants_fair_trade_hatch',
          plantsPl155Hatch: true,
          scanLabel: 'The hatch — out past the last lamp. Post in; take out.',
          swarmFloorPad: { label: 'The hatch' },
          tetherable: true,
          masslineTetherable: true,
        },
      });
      if (hatchEnt && hatchEnt.id != null) this._hatchId = hatchEnt.id;
    },

    update(dt, state) {
      const s = state || this.state;
      if (!s || s.mode !== 'flight') return;
      if (s.world?.currentSectorId !== FAIR_TRADE_TUNING.sectorId) return;
      this._ensure(s);
      const now = this._now();
      const t = FAIR_TRADE_TUNING;
      // The second pattern, slower: restamp the blink on the long period.
      const beacon = this._beaconId != null && s.entities?.get ? s.entities.get(this._beaconId) : null;
      if (beacon?.data) {
        const phase = ((now % t.slowBlinkPeriodS) + t.slowBlinkPeriodS) % t.slowBlinkPeriodS;
        const on = phase < t.slowBlinkOnS;
        beacon.data.lampsFlashing = on;
        beacon.data.lampFlashUntil = now + (on ? t.slowBlinkOnS - phase : t.slowBlinkPeriodS - phase);
      }
      const hatch = this._hatchId != null && s.entities?.get ? s.entities.get(this._hatchId) : null;
      if (!hatch?.pos) return;
      const hx = Number(hatch.pos.x);
      const hz = Number(hatch.pos.z);
      if (!Number.isFinite(hx) || !Number.isFinite(hz)) return;
      // Watch the ring: your own jettisoned pods, parked inside, are posted.
      for (const e of this._entities(s)) {
        if (!e || e.alive === false || e.id === s.playerId) continue;
        if (!e.data?.playerJettisonOrigin || e.data.plantsPl155Posted) continue;
        const px = Number(e.pos?.x);
        const pz = Number(e.pos?.z);
        if (!Number.isFinite(px) || !Number.isFinite(pz)) continue;
        const speed = Math.hypot(Number(e.vel?.x) || 0, Number(e.vel?.z) || 0);
        if (Math.hypot(px - hx, pz - hz) > t.hatchRadiusWu || speed > t.restSpeedWu) continue;
        if (!this._posted.has(e.id) && this._posted.size < t.memoryCap) {
          e.data.plantsPl155Posted = true;
          this._posted.set(e.id, now);
          this._returns.set(e.id, now + t.returnDelayS);
        }
      }
      // The hatch returns something else, about the same weight.
      for (const [podId, at] of this._returns) {
        if (now < at) continue;
        this._returns.delete(podId);
        const pod = s.entities?.get ? s.entities.get(podId) : null;
        if (!pod || pod.alive === false) { this._posted.delete(podId); continue; }
        const mass = Number(pod.physicsBody?.mass ?? pod.mass) || 0;
        const commodity = returnCommodityFor(podId, pod.data?.commodityId);
        const pos = { x: pod.pos?.x, z: pod.pos?.z };
        this.helpers?.removeEntity?.(podId);
        this._posted.delete(podId);
        let returnedId = null;
        if (typeof spawnJettisonedCargoPod === 'function' && Number.isFinite(pos.x)) {
          const back = spawnJettisonedCargoPod(s, {
            commodityId: commodity,
            amount: 1,
            unitMass: Math.max(0.5, mass), // weight-for-weight: the return pod carries the same mass
            radius: 3,
            pos: { x: pos.x + 12, z: pos.z + 8 },
            vel: { x: 0, z: 0 },
            ownerId: null,
          }, this.helpers);
          if (back) {
            back.data = back.data || {};
            back.data.plantsPl155Return = true;
            back.data.scanLabel = `From the hatch — ${commodity.replace('cmdty_', '').replace(/_/g, ' ')}, about the same weight`;
            back.data.swarmFloorPad = { label: 'From the hatch' };
            returnedId = back.id ?? null;
          }
        }
        this.bus?.emit('audio:cue', { id: 'sfx_vent_chime', position: { x: hx, z: hz }, gain: 0.4 });
        this.bus?.emit(PL_155_TRADE_EVENT, {
          postedPodId: podId,
          postedMass: mass,
          returnedCommodity: commodity,
          returnedId,
          t: now,
        });
      }
    },
  };
}

export const pl155FairTrade = createPl155FairTrade();
