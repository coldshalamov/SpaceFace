// PL-147 The first part — "The works' first part comes out one size wrong, stamped with your
// yard's number. It fits nothing you own | Keep it; or scrap it — the works only knows the one size"
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
//   The "one size" is a hash32-derived stamp — the same size every time, on purpose.
// - No Three.js, no DOM.
// - Session state on `this`; destroy() unsubscribes, removes owned pods, clears bounded Maps.
// - The part is a REAL persistent cargo pod (spawnJettisonedCargoPod): tetherable, bumpable,
//   pickup-able. Keeping it keeps a physical object; scrapping it destroys a physical object.
// - Wrong choice: scrapping gains nothing — the works only knows the one size, so the next
//   module built produces the same wrong part again (bounded by tuning.maxLiveParts).

import { hash32 } from '../../core/rng.js';
import { spawnJettisonedCargoPod } from '../lootShards.js';

export const PL_147_PART_EVENT = 'plants:pl147:part';
export const PL_147_SCRAPPED_EVENT = 'plants:pl147:scrapped';

export const FIRST_PART_TUNING = Object.freeze({
  partDelayS: 2.5,            // the works finishes the part a beat after the module lands
  partAmountU: 2,             // small: it fits nothing, and it weighs almost nothing
  partUnitMass: 1.5,
  partRadius: 3,
  partOffsetWu: 20,
  maxLiveParts: 3,            // the yard does not drown in wrong parts
  scrapCooldownS: 10,         // one receipt per scrap beat
  memoryCap: 12,              // bounded bookkeeping
});

export const PART_SIZE_SALT = 'plantsPl147PartSize';

/** The works only knows the one size — a deterministic stamp, same every call. */
export function theOneSize(yardBodyId) {
  return hash32(PART_SIZE_SALT, String(yardBodyId ?? 'yard')) % 9000 + 1000;
}

export function firstPartSpec(pos, yardBodyId, t = FIRST_PART_TUNING) {
  return {
    commodityId: 'cmdty_scrap_metal',
    amount: t.partAmountU,
    unitMass: t.partUnitMass,
    radius: t.partRadius,
    pos: { x: pos.x + t.partOffsetWu, z: pos.z - t.partOffsetWu * 0.6 },
    vel: { x: 0, z: 0 },
    ownerId: null,
  };
}

export function stampFirstPart(entity, yardBodyId) {
  if (!entity) return entity;
  entity.data = entity.data || {};
  entity.data.plantsPl147Part = true;
  entity.data.plantsPl147Size = theOneSize(yardBodyId);
  entity.data.scanLabel = `The works\u2019 first part — one size wrong · yard no. ${entity.data.plantsPl147Size}`;
  entity.data.swarmFloorPad = { label: 'First part — wrong size' };
  return entity;
}

export function createPl147FirstPart() {
  return {
    name: 'plantsPl147',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._yard = null;           // { bodyId, x, z }
      this._partIds = new Set();   // live wrong parts
      this._pendingAt = null;      // armed spawn beat
      this._modulesBuilt = 0;
      this._lastScrapAt = -Infinity;
      const on = (event, fn) => {
        const off = this.bus?.on?.(event, fn);
        if (typeof off === 'function') this._unsubs.push(off);
      };
      on('claim:claimed', (p = {}) => this._onClaimed(p));
      on('claim:moduleBuilt', (p = {}) => this._onModuleBuilt(p));
      on('entity:killed', (p = {}) => this._onKilled(p));
      on('sector:exit', () => { this._pendingAt = null; });
      on('save:loaded', () => { this._partIds.clear(); this._pendingAt = null; });
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
      const rm = this.helpers?.removeEntity;
      if (typeof rm === 'function') {
        for (const id of this._partIds || []) rm(id);
      }
      this._partIds?.clear();
      this._yard = null;
      this._pendingAt = null;
      this._modulesBuilt = 0;
      this._lastScrapAt = -Infinity;
    },

    _now() {
      const s = this.state;
      return Number.isFinite(s?.simTime) ? s.simTime : (Number.isFinite(s?.tick) ? s.tick / 60 : 0);
    },

    _onClaimed(payload) {
      const body = payload.body || {};
      const x = Number(body.x ?? body.pos?.x);
      const z = Number(body.z ?? body.pos?.z);
      if (!Number.isFinite(x) || !Number.isFinite(z)) return;
      this._yard = { bodyId: body.id ?? null, x, z };
    },

    _onModuleBuilt(payload) {
      if (!this._yard) return;
      if (payload.bodyId != null && this._yard.bodyId != null && payload.bodyId !== this._yard.bodyId) return;
      this._modulesBuilt += 1;
      // The works only knows the one size: the first module yields the first part, and the
      // next wrong part comes only once the yard is rid of the last one (scrapped or gone).
      if (this._partIds.size !== 0) return;
      this._pendingAt = this._now() + FIRST_PART_TUNING.partDelayS;
    },

    _onKilled(payload) {
      if (!this._partIds.has(payload.id)) return;
      this._partIds.delete(payload.id);
      const now = this._now();
      if (now - this._lastScrapAt < FIRST_PART_TUNING.scrapCooldownS) return;
      this._lastScrapAt = now;
      this.bus?.emit('comms:popup', {
        id: `plants:pl147:scrapped:${Math.round(now)}`,
        sender: 'The works',
        category: 'story',
        text: 'Scrapped. The works only knows the one size.',
        ttl: 6,
        persist: false,
      });
      this.bus?.emit(PL_147_SCRAPPED_EVENT, { size: this._yard ? theOneSize(this._yard.bodyId) : null, t: now });
    },

    _spawnPart() {
      const spawn = this.helpers?.spawnEntity;
      if (typeof spawn !== 'function' || !this._yard) return;
      const entity = spawnJettisonedCargoPod(
        this.state,
        firstPartSpec(this._yard, this._yard.bodyId),
        this.helpers,
      );
      if (!entity) return;
      stampFirstPart(entity, this._yard.bodyId);
      if (entity.id != null) {
        this._partIds.add(entity.id);
        if (this._partIds.size > FIRST_PART_TUNING.memoryCap) {
          const oldest = this._partIds.values().next().value;
          this._partIds.delete(oldest);
          this.helpers?.removeEntity?.(oldest);
        }
      }
      this.bus?.emit(PL_147_PART_EVENT, {
        entityId: entity.id ?? null,
        size: entity.data?.plantsPl147Size ?? null,
        modulesBuilt: this._modulesBuilt,
        t: this._now(),
      });
    },

    update(dt, state) {
      const s = state || this.state;
      if (!s || s.mode !== 'flight') return;
      if (this._pendingAt != null && this._now() >= this._pendingAt) {
        this._pendingAt = null;
        this._spawnPart();
      }
    },
  };
}

export const pl147FirstPart = createPl147FirstPart();
