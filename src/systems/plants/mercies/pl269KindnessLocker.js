// PL-269 The kindness locker — "On a broken derelict, one locker is stocked, oiled, and clean —
// somebody maintains it for strays. One item per visit, no donor ever named | Take one thing
// when you need it; or strip it bare — it stays bare, with a chalk that says who"
//
// Seam (verified): derelict + locker are REAL story-prop bodies (type 'beacon' with
// parentType 'story_prop', like beacons.js:185; the derelict hull is a tetherable 'debris'
// body like pl152TheTally's wreck). Anchored at a hash32-derived offset off the verified
// sector_sedna_dark claim site POI (src/data/claimableBodies.js: poi_claim_far_ledger).
// Dispensed items are real cargo pods via spawnJettisonedCargoPod (src/systems/lootShards.js)
// — collected on the ordinary pickup route, no new system.
//
// The bite is proportional and physical: spaced visits are "one thing when you need it" and
// the maintainer quietly restocks; stockMax visits crammed inside stripWindowS strip it bare —
// the locker never restocks again, its chalk names the hull that did it, and everyone can read.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only; hash32 picks the item per visit.
//   No Math.random(), no Date.now(). No Three.js, no DOM.
// - Session state on `this`; destroy() unsubscribes, removes owned props, clears bounded Maps.
//   Durable verdicts ride story flags (`plantsPl269*`). Props respawn on sector re-entry.
// - One dispense per visit (visitGapS); the take ledger is bounded (memoryCap).
// - No economy mutation: items are physical pods; no credits, no donor, no menu.

import { hash32 } from '../../../core/rng.js';
import { spawnJettisonedCargoPod } from '../../lootShards.js';

export const PL_269_TAKE_EVENT = 'plants:pl269:take';
export const PL_269_STRIPPED_EVENT = 'plants:pl269:stripped';
export const PL_269_RESTOCKED_EVENT = 'plants:pl269:restocked';

export const KINDNESS_LOCKER_TUNING = Object.freeze({
  sectorId: 'sector_sedna_dark',
  poiX: -2600,                // verified claim-site POI poi_claim_far_ledger (sector-local)
  poiZ: -1700,
  derelictOffsetWu: 480,      // the broken derelict hangs off the POI at a hash32 offset
  lockerOffsetWu: 22,         // the locker is welded by the derelict's hatch
  visitRadiusWu: 40,          // inside this of the locker = a visit
  visitGapS: 25,              // one item per visit; back-to-back loitering is one visit
  stockMax: 3,                // somebody maintains it: never a hoard
  restockDelayS: 240,         // one in-world day later, if it was not stripped
  stripWindowS: 90,           // all stock taken inside this window = stripped bare
  lockerItems: ['cmdty_scrap_metal', 'cmdty_salvage_electronics', 'cmdty_alloys'],
  memoryCap: 8,               // bounded take ledger
});

export const PL_269_STRIPPED_FLAG = 'plantsPl269Stripped';
export const PL_269_STRIPPED_BY = 'plantsPl269StrippedBy';

/** Pure: derelict + locker positions — hash32 offsets off the real POI, stable per POI. */
export function derelictPositions(t = KINDNESS_LOCKER_TUNING) {
  const roll = hash32('plantsPl269Anchor', t.poiX, t.poiZ);
  const ang = (roll % 3600) * (Math.PI * 2) / 3600;
  const rad = t.derelictOffsetWu * (0.8 + ((roll >>> 8) % 40) / 100);
  const x = t.poiX + Math.cos(ang) * rad;
  const z = t.poiZ + Math.sin(ang) * rad;
  return {
    derelict: { x, z },
    locker: { x: x + t.lockerOffsetWu, z: z + t.lockerOffsetWu * 0.3 },
  };
}

/** Pure: the deterministic item pick for visit n — no donor, no pattern worth learning. */
export function lockerItemFor(visitCount, t = KINDNESS_LOCKER_TUNING) {
  const roll = hash32('plantsPl269Item', visitCount);
  return t.lockerItems[roll % t.lockerItems.length];
}

/** Pure: the derelict hull's prop spec. */
export function derelictSpec(pos) {
  return {
    type: 'debris',
    pos: { x: pos.x, z: pos.z },
    vel: { x: 0, z: 0 },
    radius: 26,
    mass: 400,
    physicsBody: { mass: 400 },
    hull: 30,
    hullMax: 30,
    flags: { persistent: true },
    data: {
      parentType: 'story_prop',
      storyPropKind: 'plants_kindness_derelict',
      plantsPl269Derelict: true,
      scanLabel: 'A broken derelict. One locker is stocked, oiled, and clean.',
      swarmFloorPad: { label: 'Broken derelict' },
      masslineTetherable: true,
    },
  };
}

/** Pure: the locker's prop spec; chalk state changes the label everyone scans. */
export function lockerSpec(pos, now, strippedBy = null) {
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
      storyPropKind: 'plants_kindness_locker',
      plantsPl269Locker: true,
      scanLabel: strippedBy == null
        ? 'A stocked, oiled, clean locker. One thing per visit.'
        : 'Stripped bare. The chalk says who.',
      swarmFloorPad: { label: strippedBy == null ? 'Kindness locker' : 'Stripped bare' },
      chalkedBy: strippedBy,
      lampLit: strippedBy == null,
    },
  };
}

export function createPl269KindnessLocker() {
  return {
    name: 'plantsPl269',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._derelictId = null;
      this._lockerId = null;
      this._podIds = [];
      this._stock = KINDNESS_LOCKER_TUNING.stockMax;
      this._visits = 0;
      this._takeTimes = [];
      this._lastVisitAt = -Infinity;
      this._restockAt = null;
      this._visitedThisPass = false;
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
      this._stock = KINDNESS_LOCKER_TUNING.stockMax;
      this._visits = 0;
      this._takeTimes = [];
      this._lastVisitAt = -Infinity;
      this._restockAt = null;
    },

    _hardReset() {
      this._despawnProps();
      this._stock = KINDNESS_LOCKER_TUNING.stockMax;
      this._visits = 0;
      this._takeTimes = [];
      this._lastVisitAt = -Infinity;
      this._restockAt = null;
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
        if (this._derelictId != null) rm(this._derelictId);
        if (this._lockerId != null) rm(this._lockerId);
        for (const id of this._podIds || []) rm(id);
      }
      this._derelictId = null;
      this._lockerId = null;
      this._podIds = [];
      this._visitedThisPass = false;
    },

    _spawnProps() {
      const spawn = this.helpers?.spawnEntity;
      if (typeof spawn !== 'function' || this._derelictId != null) return;
      const pos = derelictPositions();
      const hull = spawn(derelictSpec(pos.derelict));
      const locker = spawn(lockerSpec(pos.locker, this._now(),
        this._flags()?.[PL_269_STRIPPED_FLAG] === true
          ? this._flags()?.[PL_269_STRIPPED_BY] ?? 'someone'
          : null));
      if (hull && hull.id != null) this._derelictId = hull.id;
      if (locker && locker.id != null) this._lockerId = locker.id;
    },

    _stripped() { return this._flags()?.[PL_269_STRIPPED_FLAG] === true; },

    _playerPos() {
      const s = this.state;
      const ent = s?.entities?.get && s.playerId != null ? s.entities.get(s.playerId) : null;
      const px = Number((ent && ent.pos && ent.pos.x) ?? (s?.player?.pos && s.player.pos.x));
      const pz = Number((ent && ent.pos && ent.pos.z) ?? (s?.player?.pos && s.player.pos.z));
      if (!Number.isFinite(px) || !Number.isFinite(pz)) return null;
      return { x: px, z: pz };
    },

    _inRadius(pos, radius) {
      const p = this._playerPos();
      if (!p || !pos) return false;
      const dx = p.x - pos.x;
      const dz = p.z - pos.z;
      return dx * dx + dz * dz <= radius * radius;
    },

    _stripBare(now) {
      const flags = this._flags();
      if (flags) {
        flags[PL_269_STRIPPED_FLAG] = true;
        flags[PL_269_STRIPPED_BY] = this.state?.playerId ?? 'someone';
      }
      this._restockAt = null;
      const pos = derelictPositions().locker;
      // The chalk is physical: the locker prop is re-stamped so every scan reads it.
      const locker = this.state?.entities?.get ? this.state.entities.get(this._lockerId) : null;
      if (locker && locker.data) {
        locker.data.scanLabel = 'Stripped bare. The chalk says who.';
        locker.data.swarmFloorPad = { label: 'Stripped bare' };
        locker.data.lampLit = false;
        locker.data.chalkedBy = flags ? flags[PL_269_STRIPPED_BY] : 'someone';
        locker.data.chalkedAt = now;
      }
      this.bus?.emit('comms:popup', {
        id: `plants:pl269:stripped:${Math.round(now)}`,
        sender: 'The derelict',
        category: 'story',
        text: 'It stays bare. The chalk says who.',
        ttl: 9,
        persist: false,
      });
      this.bus?.emit('audio:cue', { id: 'ui_deny' });
      this.bus?.emit(PL_269_STRIPPED_EVENT, { pos, by: flags ? flags[PL_269_STRIPPED_BY] : null, t: now });
    },

    update() {
      const s = this.state;
      if (!s || s.mode !== 'flight') return;
      const inSector = s.world?.currentSectorId === KINDNESS_LOCKER_TUNING.sectorId;
      if (!inSector) { if (this._derelictId != null) this._despawnProps(); return; }
      if (this._derelictId == null) this._spawnProps();
      if (this._lockerId == null) return;
      const now = this._now();
      if (this._stripped()) return;

      // The maintainer: a locker emptied at need is quietly refilled a day later.
      if (this._stock === 0 && this._restockAt != null && now >= this._restockAt) {
        this._stock = KINDNESS_LOCKER_TUNING.stockMax;
        this._takeTimes = [];
        this._restockAt = null;
        this.bus?.emit(PL_269_RESTOCKED_EVENT, { stock: this._stock, t: now });
      }

      // Visits: one item per visit, visitGapS apart.
      if (!this._inRadius(derelictPositions().locker, KINDNESS_LOCKER_TUNING.visitRadiusWu)) {
        this._visitedThisPass = false;
        return;
      }
      if (this._visitedThisPass) return;
      if (now - this._lastVisitAt < KINDNESS_LOCKER_TUNING.visitGapS) return;
      if (this._stock <= 0) return;
      this._visitedThisPass = true;
      this._lastVisitAt = now;
      this._stock -= 1;
      this._visits += 1;
      this._takeTimes.push(now);
      if (this._takeTimes.length > KINDNESS_LOCKER_TUNING.memoryCap) this._takeTimes.shift();
      const item = lockerItemFor(this._visits);
      const spawn = this.helpers?.spawnEntity;
      if (typeof spawn === 'function') {
        if (this._podIds.length >= KINDNESS_LOCKER_TUNING.memoryCap) {
          const oldest = this._podIds.shift();
          this.helpers?.removeEntity?.(oldest);
        }
        const pos = derelictPositions().locker;
        const pod = spawnJettisonedCargoPod(this.state, {
          commodityId: item,
          amount: 1,
          pos: { x: pos.x + 6, z: pos.z + 2 },
          vel: { x: 0, z: 0 },
          radius: 3,
          ownerId: null,
          ownerName: 'No donor',
        }, this.helpers);
        if (pod && pod.id != null) {
          pod.data = pod.data || {};
          pod.data.plantsPl269Gift = true;
          this._podIds.push(pod.id);
        }
      }
      const span = now - (this._takeTimes[0] ?? now);
      const bare = this._stock === 0;
      if (bare && this._takeTimes.length >= KINDNESS_LOCKER_TUNING.stockMax
        && span <= KINDNESS_LOCKER_TUNING.stripWindowS) {
        this._stripBare(now); // crammed visits: stripped bare, forever, chalked
      } else if (bare) {
        this._restockAt = now + KINDNESS_LOCKER_TUNING.restockDelayS;
      }
      this.bus?.emit(PL_269_TAKE_EVENT, {
        visit: this._visits,
        stock: this._stock,
        commodityId: item,
        pos: derelictPositions().locker,
        t: now,
      });
    },
  };
}

export const pl269KindnessLocker = createPl269KindnessLocker();
