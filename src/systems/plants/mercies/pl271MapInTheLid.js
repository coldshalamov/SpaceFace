// PL-271 The map in the lid — "A hatch lid out on the rim is engraved with a route somebody
// marked SAFE, ending at a cache: one working charge cell and a note that says *Still good.* |
// Follow it and restock the cache; or sell the route to a scrapper — the cache is empty when
// anyone gets there, moved the same day"
//
// Seam (verified): the hatch lid is a REAL tetherable story prop on the rim of sector_sedna_dark,
// anchored at a hash32-derived offset off the verified poi_claim_far_ledger
// (src/data/claimableBodies.js). The route is a chain of small chalk buoys (beacon story props,
// beacons.js:185 shape) from the lid to the cache; the cache holds ONE charge-cell pod stamped
// to the combat pickup contract (data.kind 'charge_cell' + charge — combat.js owns the cap
// restore; this module only provides the physical cell). Restocking is physical: leave a
// cmdty_fuel_cells pod (verified commodity, used by the Throughline Sling materials) at rest in
// the cache ring. Selling the route is physical too: a BOLTED hatch lid has one reason to leave
// the rim — tow it beyond towRangeWu and it is sold to a scrapper; the cache empties and the
// same day it is found moved (hash32-placed), empty. No economy mutation anywhere: no credits,
// the sale is a physical disappearance and a chalk.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only; hash32 places everything.
//   No Math.random(), no Date.now(). No Three.js, no DOM.
// - Session state on `this`; destroy() unsubscribes, removes owned props, clears bounded Maps.
//   Durable verdicts ride story flags (`plantsPl271*`). Props respawn on sector re-entry.
// - One cache, one cell; restock bounded (memoryCap); a sold route is forever (durable flag).

import { hash32 } from '../../../core/rng.js';

export const PL_271_FOUND_EVENT = 'plants:pl271:found';
export const PL_271_RESTOCKED_EVENT = 'plants:pl271:restocked';
export const PL_271_SOLD_EVENT = 'plants:pl271:routeSold';

export const MAP_IN_THE_LID_TUNING = Object.freeze({
  sectorId: 'sector_sedna_dark',
  poiX: -2600,                // verified claim-site POI poi_claim_far_ledger (sector-local)
  poiZ: -1700,
  lidOffsetWu: 380,           // the hatch lid, out on the rim
  cacheOffsetWu: 1100,        // the SAFE route ends here, farther out
  buoyCount: 3,               // chalk buoys strung along the route
  cacheRadiusWu: 36,          // the cache ring
  restSpeedWu: 6,             // a left pod must be at rest in the ring to count
  restockCmdty: 'cmdty_fuel_cells', // "something that works" — the sling's own cells
  restockAmount: 2,
  towRangeWu: 90,             // a bolted lid this far from its rim seat = sold to a scrapper
  memoryCap: 8,               // bounded bookkeeping
});

export const PL_271_SOLD_FLAG = 'plantsPl271RouteSold';
export const PL_271_CACHE_NOTE = 'Still good.';

/** Pure: lid, cache, and chalk-buoy positions — hash32 offsets off the real POI. */
export function routePositions(t = MAP_IN_THE_LID_TUNING) {
  const roll = hash32('plantsPl271Route', t.poiX, t.poiZ);
  const ang = (roll % 3600) * (Math.PI * 2) / 3600;
  const base = { x: t.poiX + Math.cos(ang) * t.lidOffsetWu, z: t.poiZ + Math.sin(ang) * t.lidOffsetWu };
  const ang2 = ((roll >>> 12) % 3600) * (Math.PI * 2) / 3600;
  const cache = { x: t.poiX + Math.cos(ang2) * t.cacheOffsetWu, z: t.poiZ + Math.sin(ang2) * t.cacheOffsetWu };
  const buoys = [];
  for (let i = 1; i <= t.buoyCount; i++) {
    const f = i / (t.buoyCount + 1);
    buoys.push({ x: base.x + (cache.x - base.x) * f, z: base.z + (cache.z - base.z) * f });
  }
  return { lid: base, buoys, cache };
}

/** Pure: the cache's moved position once the route is sold — the same day, somewhere else. */
export function movedCachePos(t = MAP_IN_THE_LID_TUNING) {
  const roll = hash32('plantsPl271Moved', t.poiX, t.poiZ);
  const ang = (roll % 3600) * (Math.PI * 2) / 3600;
  const rad = t.cacheOffsetWu * 1.3;
  return { x: t.poiX + Math.cos(ang) * rad, z: t.poiZ + Math.sin(ang) * rad };
}

/** Pure: the engraved hatch lid's prop spec. */
export function lidSpec(pos) {
  return {
    type: 'beacon',
    pos: { x: pos.x, z: pos.z },
    vel: { x: 0, z: 0 },
    radius: 9,
    mass: 60,
    physicsBody: { mass: 60 },
    hull: 10,
    hullMax: 10,
    flags: { persistent: true },
    data: {
      parentType: 'story_prop',
      storyPropKind: 'plants_map_lid',
      plantsPl271Lid: true,
      scanLabel: 'A hatch lid, engraved with a route somebody marked SAFE.',
      swarmFloorPad: { label: 'Map in the lid' },
      masslineTetherable: true,
      engravedRoute: true,
    },
  };
}

/** Pure: a chalk buoy's prop spec (the SAFE marks along the route). */
export function chalkBuoySpec(pos) {
  return {
    type: 'beacon',
    pos: { x: pos.x, z: pos.z },
    vel: { x: 0, z: 0 },
    radius: 3,
    mass: 1e6,
    hull: 1,
    hullMax: 1,
    flags: { persistent: true },
    data: {
      parentType: 'story_prop',
      storyPropKind: 'plants_safe_chalk',
      plantsPl271Chalk: true,
      scanLabel: 'Chalk: SAFE',
      swarmFloorPad: { label: 'SAFE' },
      lampLit: true,
    },
  };
}

/** Pure: the cache's prop spec; the sold chalk is visible to everyone. */
export function cacheSpec(pos, sold = false, stocked = true) {
  return {
    type: 'beacon',
    pos: { x: pos.x, z: pos.z },
    vel: { x: 0, z: 0 },
    radius: 8,
    mass: 1e6,
    hull: 1,
    hullMax: 1,
    flags: { persistent: true },
    data: {
      parentType: 'story_prop',
      storyPropKind: 'plants_route_cache',
      plantsPl271Cache: true,
      scanLabel: sold
        ? 'Empty. Moved the same day.'
        : (stocked ? 'A cache: one working charge cell. The note: "Still good."'
          : 'A cache, resting. The note: "Still good."'),
      swarmFloorPad: { label: sold ? 'Moved' : 'The cache' },
      cacheNote: PL_271_CACHE_NOTE,
      stocked,
      sold,
    },
  };
}

export function createPl271MapInTheLid() {
  return {
    name: 'plantsPl271',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._lidId = null;
      this._buoyIds = [];
      this._cacheId = null;
      this._cellPodId = null;
      this._found = false;
      const on = (event, fn) => {
        const off = this.bus?.on?.(event, fn);
        if (typeof off === 'function') this._unsubs.push(off);
      };
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
      this._found = false;
    },

    _hardReset() {
      this._despawnProps();
      this._found = false;
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
        if (this._lidId != null) rm(this._lidId);
        for (const id of this._buoyIds || []) rm(id);
        if (this._cacheId != null) rm(this._cacheId);
        if (this._cellPodId != null) rm(this._cellPodId);
      }
      this._lidId = null;
      this._buoyIds = [];
      this._cacheId = null;
      this._cellPodId = null;
    },

    _sold() { return this._flags()?.[PL_271_SOLD_FLAG] === true; },

    _spawnProps() {
      const spawn = this.helpers?.spawnEntity;
      if (typeof spawn !== 'function' || this._lidId != null || this._cacheId != null) return;
      const pos = routePositions();
      const sold = this._sold();
      if (!sold) {
        // The lid only exists until the route is sold — the scrapper took it.
        const lid = spawn(lidSpec(pos.lid));
        if (lid && lid.id != null) this._lidId = lid.id;
        for (const bp of pos.buoys) {
          const buoy = spawn(chalkBuoySpec(bp));
          if (buoy && buoy.id != null) this._buoyIds.push(buoy.id);
        }
        const cache = spawn(cacheSpec(pos.cache, false, this._cellPodId == null));
        if (cache && cache.id != null) this._cacheId = cache.id;
        this._spawnCell(pos.cache);
      } else {
        const cache = spawn(cacheSpec(movedCachePos(), true, false));
        if (cache && cache.id != null) this._cacheId = cache.id;
      }
    },

    _spawnCell(cachePos) {
      const spawn = this.helpers?.spawnEntity;
      if (typeof spawn !== 'function' || this._cellPodId != null) return;
      // The gift: ONE working charge cell, stamped to the combat pickup contract.
      // combat.js owns cap restore (it scans for cell entities and pays the player's cap);
      // this module only provides the physical cell — the documented handoff.
      const ent = spawn({
        type: 'payload',
        pos: { x: cachePos.x + 5, z: cachePos.z + 2 },
        vel: { x: 0, z: 0 },
        radius: 4,
        mass: 24,
        physicsBody: { mass: 24 },
        hull: 40,
        hullMax: 40,
        flags: { persistent: true },
        collides: true,
        data: {
          kind: 'payload',
          payloadType: 'charge_cell',
          kind_pickup: 'charge_cell',
          charge: 40,
          plantsPl271Cell: true,
          note: PL_271_CACHE_NOTE,
          scanLabel: 'A charge cell. The note: "Still good."',
          swarmFloorPad: { label: 'Charge cell' },
          salvagePool: { cmdty_fuel_cells: 1 },
          ownerId: null,
          factionId: 'player',
        },
      });
      if (ent && ent.id != null) this._cellPodId = ent.id;
    },

    _playerPos() {
      const s = this.state;
      const ent = s?.entities?.get && s.playerId != null ? s.entities.get(s.playerId) : null;
      const px = Number((ent && ent.pos && ent.pos.x) ?? (s?.player?.pos && s.player.pos.x));
      const pz = Number((ent && ent.pos && ent.pos.z) ?? (s?.player?.pos && s.player.pos.z));
      if (!Number.isFinite(px) || !Number.isFinite(pz)) return null;
      return { x: px, z: pz };
    },

    _sellRoute(now) {
      const flags = this._flags();
      if (flags) flags[PL_271_SOLD_FLAG] = true;
      // The cache is empty when anyone gets there, moved the same day: the old cache props
      // despawn; the chalked empty cache reappears at the moved position.
      this._despawnProps();
      const spawn = this.helpers?.spawnEntity;
      if (typeof spawn === 'function') {
        const cache = spawn(cacheSpec(movedCachePos(), true, false));
        if (cache && cache.id != null) this._cacheId = cache.id;
      }
      this.bus?.emit('comms:popup', {
        id: `plants:pl271:sold:${Math.round(now)}`,
        sender: 'The rim',
        category: 'story',
        text: 'Cache empty. Moved the same day.',
        ttl: 9,
        persist: false,
      });
      this.bus?.emit('audio:cue', { id: 'ui_deny' });
      this.bus?.emit(PL_271_SOLD_EVENT, { pos: movedCachePos(), t: now });
    },

    update() {
      const s = this.state;
      if (!s || s.mode !== 'flight') return;
      const inSector = s.world?.currentSectorId === MAP_IN_THE_LID_TUNING.sectorId;
      if (!inSector) { if (this._lidId != null) this._despawnProps(); return; }
      if (this._lidId == null) { this._spawnProps(); return; }
      const now = this._now();
      const playerPos = this._playerPos();
      if (!playerPos) return;
      const pos = routePositions();
      const lid = s.entities?.get ? s.entities.get(this._lidId) : null;

      // Selling: the lid towed off its rim seat — a bolted hatch lid has one buyer.
      if (!this._sold() && lid && lid.pos) {
        const dx = lid.pos.x - pos.lid.x;
        const dz = lid.pos.z - pos.lid.z;
        if (dx * dx + dz * dz > MAP_IN_THE_LID_TUNING.towRangeWu * MAP_IN_THE_LID_TUNING.towRangeWu) {
          this._sellRoute(now);
          return;
        }
      }
      if (this._sold()) return;

      // Following the route: first arrival at the cache ring is the find.
      const cx = pos.cache.x - playerPos.x;
      const cz = pos.cache.z - playerPos.z;
      const inRing = (cx * cx + cz * cz) <= MAP_IN_THE_LID_TUNING.cacheRadiusWu * MAP_IN_THE_LID_TUNING.cacheRadiusWu;
      if (inRing && !this._found && this._cellPodId != null) {
        this._found = true;
        this.bus?.emit('comms:popup', {
          id: `plants:pl271:found:${Math.round(now)}`,
          sender: 'The cache',
          category: 'story',
          text: 'One working cell. "Still good."',
          ttl: 8,
          persist: false,
        });
        this.bus?.emit(PL_271_FOUND_EVENT, { pos: { x: pos.cache.x, z: pos.cache.z }, t: now });
      }

      // Restocking: leave a working cell at rest in the ring and the cache is honest again.
      if (inRing && typeof this.helpers?.spawnEntity === 'function') {
        const candidates = [];
        for (const ent of s.entities.values()) {
          if (!ent || ent.alive === false || !ent.data || !ent.pos) continue;
          if (ent.data.playerJettisonOrigin == null) continue; // must be YOURS, left behind
          if (ent.data.plantsPl271Cell === true || ent.data.plantsPl271Restocked === true) continue;
          const vx = Number(ent.vel && ent.vel.x) || 0;
          const vz = Number(ent.vel && ent.vel.z) || 0;
          if (vx * vx + vz * vz > MAP_IN_THE_LID_TUNING.restSpeedWu * MAP_IN_THE_LID_TUNING.restSpeedWu) continue;
          const ex = ent.pos.x - pos.cache.x;
          const ez = ent.pos.z - pos.cache.z;
          if (ex * ex + ez * ez > MAP_IN_THE_LID_TUNING.cacheRadiusWu * MAP_IN_THE_LID_TUNING.cacheRadiusWu) continue;
          candidates.push(ent);
        }
        const left = candidates[0];
        if (left) {
          left.data.plantsPl271Restocked = true;
          left.data.scanLabel = 'Left forward for whoever walks this route.';
          const stockedCache = s.entities?.get ? s.entities.get(this._cacheId) : null;
          if (stockedCache && stockedCache.data) stockedCache.data.stocked = true;
          this.bus?.emit('comms:popup', {
            id: `plants:pl271:restock:${Math.round(now)}`,
            sender: 'The cache',
            category: 'story',
            text: 'Restocked. Still good.',
            ttl: 8,
            persist: false,
          });
          this.bus?.emit('audio:cue', { id: 'confirm' });
          this.bus?.emit(PL_271_RESTOCKED_EVENT, {
            podId: left.id,
            commodityId: left.data.cargoIdentity?.commodityId ?? left.data.commodityId ?? null,
            pos: { x: pos.cache.x, z: pos.cache.z },
            t: now,
          });
        }
      }
    },
  };
}

export const pl271MapInTheLid = createPl271MapInTheLid();
