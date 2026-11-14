// PL-270 The stashed medal — "A pension medal is taped under a shelf in a public berth with a
// note: *For whoever needs the luck more than me.* | Carry it aboard and things read as luck;
// or sell it — buyers go quiet around a sold medal"
//
// Seam (verified): the medal is a REAL small prop (tetherable story-prop beacon) taped under a
// shelf at a hash32-derived offset off the verified sector_sker_haven claim-site POI
// (src/data/claimableBodies.js: poi_claim_morrow — the public berth fixture). The note is the
// row's exact copy, stamped on the scan everyone reads. Carrying is physical: the module rides
// the medal pod just off the player hull while it is aboard (stamped data.plantsPl270Aboard).
// Selling is physical too: drop the medal inside a station's trade ring and it is sold — no
// credits move here (no economy mutation); the verdict is stamps, a voice beat, and luck that
// never reads again. Luck while carried is a broadcast stamp (PL_270_LUCK_EVENT) other systems
// may read; nothing grants or charges anything.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
//   The nearest-station search is a deterministic geometry scan (like applausePlant's).
// - No Three.js, no DOM.
// - Session state on `this`; destroy() unsubscribes, removes owned props, clears bounded Maps.
//   Durable verdicts ride story flags (`plantsPl270*`). The prop respawns on sector re-entry
//   only while unclaimed fate allows: once sold, it respawns as the SOLD medal (chalk visible).
// - One medal; selling is forever (flag `plantsPl270Sold`); luck stops at the sale.

import { hash32 } from '../../../core/rng.js';

export const PL_270_CARRIED_EVENT = 'plants:pl270:carried';
export const PL_270_LUCK_EVENT = 'plants:pl270:luck';
export const PL_270_SOLD_EVENT = 'plants:pl270:sold';

export const STASHED_MEDAL_TUNING = Object.freeze({
  sectorId: 'sector_sker_haven',
  poiX: 2100,                 // verified claim-site POI poi_claim_morrow (sector-local)
  poiZ: -1450,
  berthOffsetWu: 520,         // the public berth hangs off the POI at a hash32 offset
  takeRadiusWu: 14,           // close enough to lift it off the shelf
  aboardOffsetWu: 9,          // while aboard: rides just off your hull
  releaseSpeedWu: 40,         // burn harder than this and the medal lags off (set it down)
  luckBeatS: 60,              // "things read as luck": a broadcast stamp once a minute
  sellRingRadiusWu: 160,      // set down inside this of a station = sold
  memoryCap: 4,               // bounded bookkeeping
});

export const PL_270_MEDAL_NOTE = 'For whoever needs the luck more than me.';
export const PL_270_SOLD_FLAG = 'plantsPl270Sold';
export const PL_270_ABOARD_FLAG = 'plantsPl270Aboard';

/** Pure: the medal's berth position — hash32 offset off the real POI, stable per POI. */
export function medalBerthPos(t = STASHED_MEDAL_TUNING) {
  const roll = hash32('plantsPl270Berth', t.poiX, t.poiZ);
  const ang = (roll % 3600) * (Math.PI * 2) / 3600;
  const rad = t.berthOffsetWu * (0.8 + ((roll >>> 8) % 40) / 100);
  return { x: t.poiX + Math.cos(ang) * rad, z: t.poiZ + Math.sin(ang) * rad };
}

/** Pure: the medal's prop spec; the sold chalk changes what everyone scans. */
export function medalSpec(pos, sold = false) {
  return {
    type: 'beacon',
    pos: { x: pos.x, z: pos.z },
    vel: { x: 0, z: 0 },
    radius: 3,
    mass: 4,
    physicsBody: { mass: 4 },
    hull: 1,
    hullMax: 1,
    flags: { persistent: true },
    data: {
      parentType: 'story_prop',
      storyPropKind: 'plants_stashed_medal',
      plantsPl270Medal: true,
      scanLabel: sold
        ? 'A pension medal, sold. Buyers go quiet around it.'
        : `A pension medal taped under a shelf. The note: "${PL_270_MEDAL_NOTE}"`,
      swarmFloorPad: { label: sold ? 'Sold medal' : 'Stashed medal' },
      medalNote: PL_270_MEDAL_NOTE,
      masslineTetherable: true,
      sold,
    },
  };
}

/** Pure: nearest station within the sell ring (deterministic geometry scan over a station list). */
export function stationInSellRing(pos, stations, radiusWu = STASHED_MEDAL_TUNING.sellRingRadiusWu) {
  if (!pos || !Array.isArray(stations)) return null;
  let best = null;
  let bestDistSq = radiusWu * radiusWu;
  for (const st of stations) {
    if (!st || st.alive === false || !st.pos) continue;
    const x = Number(st.pos.x);
    const z = Number(st.pos.z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
    const dx = x - pos.x;
    const dz = z - pos.z;
    const dSq = dx * dx + dz * dz;
    if (dSq <= bestDistSq) { best = st; bestDistSq = dSq; }
  }
  return best;
}

export function createPl270StashedMedal() {
  return {
    name: 'plantsPl270',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._medalId = null;
      this._aboard = false;
      this._carriedAnnounced = false;
      this._nextLuckAt = -Infinity;
      const on = (event, fn) => {
        const off = this.bus?.on?.(event, fn);
        if (typeof off === 'function') this._unsubs.push(off);
      };
      on('sector:exit', () => this._despawnMedal());
      on('save:loaded', () => this._despawnMedal());
      on('game:newGame', () => this._hardReset());
    },

    destroy() {
      for (const off of this._unsubs || []) {
        try { off(); } catch (err) { /* cleanup must not throw */ }
      }
      this._unsubs = [];
      this._despawnMedal();
      this._aboard = false;
      this._carriedAnnounced = false;
      this._nextLuckAt = -Infinity;
    },

    _hardReset() {
      this._despawnMedal();
      this._aboard = false;
      this._carriedAnnounced = false;
      this._nextLuckAt = -Infinity;
    },

    _flags() {
      const flags = this.state?.story?.flags;
      return flags ? flags : (this.state?.story ? (this.state.story.flags = {}) : null);
    },

    _now() {
      const s = this.state;
      return Number.isFinite(s?.simTime) ? s.simTime : (Number.isFinite(s?.tick) ? s.tick / 60 : 0);
    },

    _despawnMedal() {
      const rm = this.helpers?.removeEntity;
      if (typeof rm === 'function' && this._medalId != null) rm(this._medalId);
      this._medalId = null;
      this._aboard = false;
    },

    _sold() { return this._flags()?.[PL_270_SOLD_FLAG] === true; },

    _spawnMedal(pos) {
      const spawn = this.helpers?.spawnEntity;
      if (typeof spawn !== 'function' || this._medalId != null) return;
      const ent = spawn(medalSpec(pos, this._sold()));
      if (ent && ent.id != null) this._medalId = ent.id;
    },

    _sellAt(pos, now) {
      const flags = this._flags();
      if (flags) flags[PL_270_SOLD_FLAG] = true;
      this._aboard = false;
      this._nextLuckAt = -Infinity;
      // The chalk is physical: the live medal re-stamps so every scan reads SOLD.
      const medal = this.state?.entities?.get ? this.state.entities.get(this._medalId) : null;
      if (medal && medal.data) {
        medal.data.sold = true;
        medal.data.scanLabel = 'A pension medal, sold. Buyers go quiet around it.';
        medal.data.swarmFloorPad = { label: 'Sold medal' };
      }
      const station = stationInSellRing(pos, Array.isArray(this.state?.stations) ? this.state.stations : []);
      this.bus?.emit('comms:popup', {
        id: `plants:pl270:sold:${Math.round(now)}`,
        sender: 'The berth',
        category: 'story',
        text: 'Buyers go quiet around that medal.',
        ttl: 9,
        persist: false,
      });
      this.bus?.emit('audio:cue', { id: 'ui_deny' });
      this.bus?.emit(PL_270_SOLD_EVENT, {
        stationId: station ? (station.id ?? station.data?.stationId ?? null) : null,
        pos: { x: pos.x, z: pos.z },
        t: now,
      });
    },

    update() {
      const s = this.state;
      if (!s || s.mode !== 'flight') return;
      const inSector = s.world?.currentSectorId === STASHED_MEDAL_TUNING.sectorId;
      if (!inSector) { if (this._medalId != null) this._despawnMedal(); return; }
      const now = this._now();

      // Player hull position (canonical entity first, plain field fallback for harnesses).
      const pEnt = s.entities?.get && s.playerId != null ? s.entities.get(s.playerId) : null;
      const px = Number((pEnt && pEnt.pos && pEnt.pos.x) ?? (s.player && s.player.pos && s.player.pos.x));
      const pz = Number((pEnt && pEnt.pos && pEnt.pos.z) ?? (s.player && s.player.pos && s.player.pos.z));
      const playerPos = Number.isFinite(px) && Number.isFinite(pz) ? { x: px, z: pz } : null;
      if (!playerPos) return;

      const medal = this._medalId != null && s.entities?.get ? s.entities.get(this._medalId) : null;
      if (this._medalId != null && (!medal || medal.alive === false)) {
        this._medalId = null;
        this._aboard = false;
      }

      // Sold medals still exist physically — respawn as the chalked, sold medal.
      if (this._medalId == null) {
        this._spawnMedal(medalBerthPos());
        return;
      }

      if (this._aboard) {
        // Aboard: the medal rides just off your hull — while you fly gently. It is taped to a
        // shelf, not to your hull: burn hard and it lags off (the physical "set it down").
        const vx = Number(pEnt && pEnt.vel && pEnt.vel.x);
        const vz = Number(pEnt && pEnt.vel && pEnt.vel.z);
        const speedSq = (Number.isFinite(vx) ? vx * vx : 0) + (Number.isFinite(vz) ? vz * vz : 0);
        if (speedSq > STASHED_MEDAL_TUNING.releaseSpeedWu * STASHED_MEDAL_TUNING.releaseSpeedWu) {
          this._aboard = false;
          medal.data.aboard = false;
          const flags = this._flags();
          if (flags) flags[PL_270_ABOARD_FLAG] = false;
          // Set down. Inside a station's trade ring = sold, and luck never reads again.
          if (stationInSellRing(medal.pos, Array.isArray(s.stations) ? s.stations : [])) {
            this._sellAt(medal.pos, now);
          }
          return;
        }
        medal.pos.x = playerPos.x + STASHED_MEDAL_TUNING.aboardOffsetWu;
        medal.pos.z = playerPos.z - STASHED_MEDAL_TUNING.aboardOffsetWu * 0.4;
        if (this._nextLuckAt < 0) this._nextLuckAt = now + STASHED_MEDAL_TUNING.luckBeatS;
        if (now >= this._nextLuckAt && !this._sold()) {
          this._nextLuckAt = now + STASHED_MEDAL_TUNING.luckBeatS;
          this.bus?.emit(PL_270_LUCK_EVENT, { carried: true, pos: { x: playerPos.x, z: playerPos.z }, t: now });
        }
        return;
      }

      // On the shelf: reachable, liftable.
      const bx = medal.pos.x - playerPos.x;
      const bz = medal.pos.z - playerPos.z;
      if (bx * bx + bz * bz <= STASHED_MEDAL_TUNING.takeRadiusWu * STASHED_MEDAL_TUNING.takeRadiusWu
        && !this._sold()) {
        this._aboard = true;
        medal.data.aboard = true;
        if (this._nextLuckAt < 0) this._nextLuckAt = now + STASHED_MEDAL_TUNING.luckBeatS;
        const flags = this._flags();
        if (flags) flags[PL_270_ABOARD_FLAG] = true;
        if (!this._carriedAnnounced) {
          this._carriedAnnounced = true;
          this.bus?.emit('comms:popup', {
            id: `plants:pl270:carried:${Math.round(now)}`,
            sender: 'The medal',
            category: 'story',
            text: 'Whoever needs the luck more.',
            ttl: 8,
            persist: false,
          });
          this.bus?.emit('audio:cue', { id: 'confirm' });
        }
        this.bus?.emit(PL_270_CARRIED_EVENT, { medalId: this._medalId, t: now });
      }
    },
  };
}

export const pl270StashedMedal = createPl270StashedMedal();
