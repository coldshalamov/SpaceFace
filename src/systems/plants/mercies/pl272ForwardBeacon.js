// PL-272 The forward beacon — "An anonymous drop cache in an empty stretch refills only if the
// last taker left something behind | Leave something forward; or take clean twice — the beacon
// stops refilling, and the chalk names you as why"
//
// Seam (verified): the beacon + its stock pods are REAL story-prop bodies in an empty stretch
// of sector_sedna_dark, anchored far off the verified poi_claim_far_ledger
// (src/data/claimableBodies.js). Stock items are cargo pods via spawnJettisonedCargoPod
// (src/systems/lootShards.js) — collected on the ordinary pickup route; taking one is observed
// through pickup:collected (combat.js / mining.js emit it for pod collection). "Leaving
// something forward" is physical: any of YOUR jettisoned pods (data.playerJettisonOrigin —
// the same stamp spawnJettisonedCargoPod applies) at rest inside the cache ring counts.
//
// The bite is proportional: one clean take is fine — the cache simply waits for a giver. Take
// clean TWICE in a row (two takes with nothing left in between) and the beacon stops refilling
// forever: its lamp dies, the chalk names you, and anyone can scan why.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only; hash32 picks the stock item.
//   No Math.random(), no Date.now(). No Three.js, no DOM.
// - Session state on `this`; destroy() unsubscribes, removes owned props, clears bounded Maps.
//   Durable verdicts ride story flags (`plantsPl272*`). Props respawn on sector re-entry.
// - One refill in flight at a time (refillDelayS); the take ledger is bounded (memoryCap).
// - No economy mutation: stock and gifts are physical pods; no credits anywhere.

import { hash32 } from '../../../core/rng.js';
import { spawnJettisonedCargoPod } from '../../lootShards.js';

export const PL_272_TAKE_EVENT = 'plants:pl272:take';
export const PL_272_LEFT_EVENT = 'plants:pl272:leftForward';
export const PL_272_STOPPED_EVENT = 'plants:pl272:stopped';

export const FORWARD_BEACON_TUNING = Object.freeze({
  sectorId: 'sector_sedna_dark',
  poiX: -2600,                // verified claim-site POI poi_claim_far_ledger (sector-local)
  poiZ: -1700,
  beaconOffsetWu: 1800,       // an empty stretch, far from anything
  cacheRadiusWu: 40,
  refillDelayS: 300,          // the beacon refills a while after a taker leaves something
  stockMax: 2,                // one item waiting, one refill in the pipe at most
  cleanTakeLimit: 2,          // take clean twice in a row: the beacon quits on you
  stockCmdtys: ['cmdty_scrap_metal', 'cmdty_alloys', 'cmdty_fuel_cells'],
  restSpeedWu: 6,
  memoryCap: 8,               // bounded take ledger
});

export const PL_272_STOPPED_FLAG = 'plantsPl272Stopped';
export const PL_272_STOPPED_BY = 'plantsPl272StoppedBy';

/** Pure: the beacon's position — a hash32 offset off the real POI, stable per POI. */
export function beaconPos(t = FORWARD_BEACON_TUNING) {
  const roll = hash32('plantsPl272Beacon', t.poiX, t.poiZ);
  const ang = (roll % 3600) * (Math.PI * 2) / 3600;
  const rad = t.beaconOffsetWu * (0.9 + ((roll >>> 8) % 30) / 100);
  return { x: t.poiX + Math.cos(ang) * rad, z: t.poiZ + Math.sin(ang) * rad };
}

/** Pure: the deterministic stock pick for drop n. */
export function stockItemFor(dropCount, t = FORWARD_BEACON_TUNING) {
  const roll = hash32('plantsPl272Stock', dropCount);
  return t.stockCmdtys[roll % t.stockCmdtys.length];
}

/** Pure: the beacon's prop spec; the chalk changes what everyone scans. */
export function beaconSpec(pos, stoppedBy = null) {
  return {
    type: 'beacon',
    pos: { x: pos.x, z: pos.z },
    vel: { x: 0, z: 0 },
    radius: 6,
    mass: 1e6,
    hull: 1,
    hullMax: 1,
    flags: { persistent: true },
    data: {
      parentType: 'story_prop',
      storyPropKind: 'plants_forward_beacon',
      plantsPl272Beacon: true,
      scanLabel: stoppedBy == null
        ? 'An anonymous drop cache. It refills only if the last taker left something.'
        : 'Dead. The chalk names the hull that took clean twice.',
      swarmFloorPad: { label: stoppedBy == null ? 'Forward beacon' : 'Quit on you' },
      lampLit: stoppedBy == null,
      chalkedBy: stoppedBy,
      masslineTetherable: true,
    },
  };
}

export function createPl272ForwardBeacon() {
  return {
    name: 'plantsPl272',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._beaconId = null;
      this._stockIds = [];
      this._drops = 0;
      this._cleanTakes = 0;
      this._leftSinceTake = false;
      this._refillAt = null;
      this._takeAnnounced = false;
      const on = (event, fn) => {
        const off = this.bus?.on?.(event, fn);
        if (typeof off === 'function') this._unsubs.push(off);
      };
      on('pickup:collected', (p = {}) => this._onPickup(p));
      on('sector:exit', () => this._despawnProps());
      on('save:loaded', () => this._despawnProps());
      on('game:newGame', () => this._hardReset());
    },

    destroy() {
      for (const off of this._unsubs || []) {
        try { off(); } catch (err) { /* cleanup must not throw */ }
      }
      this._unsubs = [];
      this._despawnProps();
      this._drops = 0;
      this._cleanTakes = 0;
      this._leftSinceTake = false;
      this._refillAt = null;
      this._takeAnnounced = false;
    },

    _hardReset() {
      this._despawnProps();
      this._drops = 0;
      this._cleanTakes = 0;
      this._leftSinceTake = false;
      this._refillAt = null;
      this._takeAnnounced = false;
    },

    _flags() {
      const flags = this.state?.story?.flags;
      return flags ? flags : (this.state?.story ? (this.state.story.flags = {}) : null);
    },

    _now() {
      const s = this.state;
      return Number.isFinite(s?.simTime) ? s.simTime : (Number.isFinite(s?.tick) ? s.tick / 60 : 0);
    },

    _despawnProps() {
      const rm = this.helpers?.removeEntity;
      if (typeof rm === 'function') {
        if (this._beaconId != null) rm(this._beaconId);
        for (const id of this._stockIds || []) rm(id);
      }
      this._beaconId = null;
      this._stockIds = [];
    },

    _stopped() { return this._flags()?.[PL_272_STOPPED_FLAG] === true; },

    _spawnProps() {
      const spawn = this.helpers?.spawnEntity;
      if (typeof spawn !== 'function' || this._beaconId != null) return;
      const pos = beaconPos();
      const ent = spawn(beaconSpec(pos, this._stopped()
        ? this._flags()?.[PL_272_STOPPED_BY] ?? 'someone'
        : null));
      if (ent && ent.id != null) this._beaconId = ent.id;
      if (!this._stopped()) {
        // Something is always waiting out here — the cache starts full.
        while (this._stockIds.length < FORWARD_BEACON_TUNING.stockMax) this._stockOne(pos);
      }
    },

    _stockOne(pos) {
      const spawn = this.helpers?.spawnEntity;
      if (typeof spawn !== 'function') return;
      if (this._stockIds.length >= FORWARD_BEACON_TUNING.stockMax) return;
      this._drops += 1;
      const pod = spawnJettisonedCargoPod(this.state, {
        commodityId: stockItemFor(this._drops),
        amount: 1,
        pos: { x: pos.x + 7, z: pos.z + 3 },
        vel: { x: 0, z: 0 },
        radius: 3,
        ownerId: null,
        ownerName: 'The forward beacon',
      }, this.helpers);
      if (!pod || pod.id == null) return;
      pod.data = pod.data || {};
      pod.data.plantsPl272Stock = true;
      pod.data.scanLabel = 'From the anonymous drop cache.';
      this._stockIds.push(pod.id);
    },

    _onPickup(payload) {
      if (this._stopped()) return;
      if (payload?.pickupId == null) return;
      const idx = this._stockIds.indexOf(payload.pickupId);
      if (idx < 0) return; // not the beacon's stock
      this._stockIds.splice(idx, 1);
      const now = this._now();
      const pos = beaconPos();
      if (this._leftSinceTake) {
        // The last taker left something forward: a clean take now is one clean take, not two.
        this._cleanTakes = 0;
      } else {
        this._cleanTakes += 1;
      }
      this._leftSinceTake = false;
      if (this._cleanTakes >= FORWARD_BEACON_TUNING.cleanTakeLimit) {
        // Take clean twice: the beacon stops refilling, and the chalk names you.
        const flags = this._flags();
        if (flags) {
          flags[PL_272_STOPPED_FLAG] = true;
          flags[PL_272_STOPPED_BY] = this.state?.playerId ?? 'someone';
        }
        this._refillAt = null;
        const beacon = this.state?.entities?.get ? this.state.entities.get(this._beaconId) : null;
        if (beacon && beacon.data) {
          beacon.data.lampLit = false;
          beacon.data.chalkedBy = flags ? flags[PL_272_STOPPED_BY] : 'someone';
          beacon.data.scanLabel = 'Dead. The chalk names the hull that took clean twice.';
          beacon.data.swarmFloorPad = { label: 'Quit on you' };
        }
        this.bus?.emit('comms:popup', {
          id: `plants:pl272:stopped:${Math.round(now)}`,
          sender: 'The empty stretch',
          category: 'story',
          text: 'It stops. The chalk names you.',
          ttl: 9,
          persist: false,
        });
        this.bus?.emit('audio:cue', { id: 'ui_deny' });
        this.bus?.emit(PL_272_STOPPED_EVENT, { pos, by: flags ? flags[PL_272_STOPPED_BY] : null, t: now });
        return;
      }
      if (!this._takeAnnounced) {
        this._takeAnnounced = true;
        this.bus?.emit('comms:popup', {
          id: `plants:pl272:take:${Math.round(now)}`,
          sender: 'The forward beacon',
          category: 'story',
          text: 'Taken. It refills for givers.',
          ttl: 8,
          persist: false,
        });
      }
      this.bus?.emit(PL_272_TAKE_EVENT, {
        pickupId: payload.pickupId,
        cleanTakes: this._cleanTakes,
        pos,
        t: now,
      });
    },

    _playerPos() {
      const s = this.state;
      const ent = s?.entities?.get && s.playerId != null ? s.entities.get(s.playerId) : null;
      const px = Number((ent && ent.pos && ent.pos.x) ?? (s?.player?.pos && s.player.pos.x));
      const pz = Number((ent && ent.pos && ent.pos.z) ?? (s?.player?.pos && s.player.pos.z));
      if (!Number.isFinite(px) || !Number.isFinite(pz)) return null;
      return { x: px, z: pz };
    },

    update() {
      const s = this.state;
      if (!s || s.mode !== 'flight') return;
      const inSector = s.world?.currentSectorId === FORWARD_BEACON_TUNING.sectorId;
      if (!inSector) { if (this._beaconId != null) this._despawnProps(); return; }
      if (this._beaconId == null) this._spawnProps();
      if (this._stopped()) return;
      const now = this._now();
      const pos = beaconPos();

      // The refill clock: it only runs if the last taker left something forward.
      if (this._refillAt != null && now >= this._refillAt) {
        this._refillAt = null;
        this._stockOne(pos);
      }

      // Leaving something forward: your jettisoned pod, at rest, inside the ring.
      const playerPos = this._playerPos();
      if (!playerPos) return;
      const px = pos.x - playerPos.x;
      const pz = pos.z - playerPos.z;
      const near = (px * px + pz * pz) <= FORWARD_BEACON_TUNING.cacheRadiusWu * FORWARD_BEACON_TUNING.cacheRadiusWu * 4;
      if (!near || typeof this.helpers?.spawnEntity !== 'function') return;
      for (const ent of s.entities.values()) {
        if (!ent || ent.alive === false || !ent.data || !ent.pos) continue;
        if (ent.data.playerJettisonOrigin == null) continue; // yours, left behind
        if (ent.data.plantsPl272Stock === true || ent.data.plantsPl272Forward === true) continue;
        const vx = Number(ent.vel && ent.vel.x) || 0;
        const vz = Number(ent.vel && ent.vel.z) || 0;
        if (vx * vx + vz * vz > FORWARD_BEACON_TUNING.restSpeedWu * FORWARD_BEACON_TUNING.restSpeedWu) continue;
        const ex = ent.pos.x - pos.x;
        const ez = ent.pos.z - pos.z;
        if (ex * ex + ez * ez > FORWARD_BEACON_TUNING.cacheRadiusWu * FORWARD_BEACON_TUNING.cacheRadiusWu) continue;
        ent.data.plantsPl272Forward = true;
        ent.data.scanLabel = 'Left forward for the next hull.';
        this._leftSinceTake = true;
        this._cleanTakes = 0;
        this._refillAt = now + FORWARD_BEACON_TUNING.refillDelayS;
        this.bus?.emit('comms:popup', {
          id: `plants:pl272:left:${Math.round(now)}`,
          sender: 'The forward beacon',
          category: 'story',
          text: 'Left forward. It remembers.',
          ttl: 8,
          persist: false,
        });
        this.bus?.emit('audio:cue', { id: 'confirm' });
        this.bus?.emit(PL_272_LEFT_EVENT, {
          podId: ent.id,
          pos: { x: pos.x, z: pos.z },
          refillAt: this._refillAt,
          t: now,
        });
        break; // one gift per pass; the bounded loop moves on
      }
    },
  };
}

export const pl272ForwardBeacon = createPl272ForwardBeacon();
