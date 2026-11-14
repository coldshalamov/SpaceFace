// PL-372 The wreckers' courtesy — "After you win a raid, their support ship lingers to recover
// their own wounded. Let it work, and the next raid comes in softer — somebody talked | Let them
// collect; or shoot the recovery — every future raid hits harder, and every yard on the lane
// knows why"
//
// Seam (verified): raid outcomes arrive as claim:defenseResolved { outcome, ... } from
// src/systems/claims.js — outcome 'defended' IS "you win a raid" (claims.js also emits
// claim:raidRepelled on the same settle). The recovery ship is a REAL story prop that lingers
// for recoveryLingerS inside the recovery window the module opens after the defense resolves.
// "Let them collect" = simply not attacking during that window; when it closes, the courtesy
// lands. Shooting the recovery is observed physically via entity:killed of the recovery ship.
//
// Handoff (single writers): raid hardness is claims.js/encounterDirector's business. This module
// NEVER mutates raid state or economy — it publishes the verdict as PL_372_COURTESY_EVENT
// { raidSoftenDelta } / PL_372_BROKEN_EVENT { raidHardenDelta } plus durable flags
// (`plantsPl372*`) for the raid owner to consume. The "every yard on the lane knows" beat is a
// lane-gossip comms line, one line, eight words or fewer.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM.
// - Session state on `this`; destroy() unsubscribes, removes the recovery ship, clears state.
// - One recovery window at a time; courtesyCooldownS keeps raid storms from stacking ships.
// - Breaking the courtesy once is durable (flag `plantsPl372BrokenForever`): no recovery ship
//   is ever offered again, and every future verdict rides the hardened delta.

export const PL_372_RECOVERY_EVENT = 'plants:pl372:recovery';
export const PL_372_COURTESY_EVENT = 'plants:pl372:courtesy';
export const PL_372_BROKEN_EVENT = 'plants:pl372:broken';

export const WRECKERS_COURTESY_TUNING = Object.freeze({
  recoveryLingerS: 40,        // the support ship works this long, then leaves
  recoveryOffsetWu: 55,       // it holds station off your rock, over their wounded
  courtesyCooldownS: 30,      // a raid storm does not stack recoveries
  softenDelta: -0.15,         // "the next raid comes in softer" — published, not applied
  hardenDelta: 0.30,          // "every future raid hits harder" — published, not applied
  memoryCap: 4,               // bounded bookkeeping
});

export const PL_372_BROKEN_FOREVER_FLAG = 'plantsPl372BrokenForever';
export const PL_372_COURTESY_EARNED_FLAG = 'plantsPl372CourtesyEarned';

/** Pure: the recovery ship's prop spec — a wrecker support hull holding station over the wounded. */
export function recoveryShipSpec(claim, now, t = WRECKERS_COURTESY_TUNING) {
  return {
    type: 'beacon',
    pos: { x: claim.x + t.recoveryOffsetWu, z: claim.z - t.recoveryOffsetWu * 0.3 },
    vel: { x: 0, z: 0 },
    radius: 8,
    mass: 1e6,
    hull: 40,
    hullMax: 40,
    data: {
      parentType: 'story_prop',
      storyPropKind: 'plants_wreckers_recovery',
      plantsPl372Recovery: true,
      scanLabel: 'Their support ship — recovering their own wounded',
      swarmFloorPad: { label: 'Recovery, underway' },
      lampsFlashing: true,
      lampFlashUntil: now + 1.0,
      recoveryUntil: now + t.recoveryLingerS,
    },
  };
}

/** Pure: the raid-difficulty verdict this module publishes for a given courtesy state. */
export function raidVerdictFor(brokenForever, earned, t = WRECKERS_COURTESY_TUNING) {
  if (brokenForever) return { delta: t.hardenDelta, kind: 'hardened' };
  if (earned) return { delta: t.softenDelta, kind: 'softened' };
  return { delta: 0, kind: 'neutral' };
}

export function createPl372WreckersCourtesy() {
  return {
    name: 'plantsPl372',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._claim = null;
      this._shipId = null;
      this._lastCourtesyAt = -Infinity;
      const on = (event, fn) => {
        const off = this.bus?.on?.(event, fn);
        if (typeof off === 'function') this._unsubs.push(off);
      };
      on('claim:claimed', (p = {}) => this._onClaimed(p));
      on('claim:defenseResolved', (p = {}) => this._onDefenseResolved(p));
      on('claim:raidRepelled', (p = {}) => this._onRaidRepelled(p));
      on('entity:killed', (p = {}) => this._onKilled(p));
      on('sector:exit', () => { /* the window keeps its clock across sector lines */ });
      on('save:loaded', () => this._shipId = null); // physical ship is session truth
      on('game:newGame', () => this._hardReset());
    },

    destroy() {
      for (const off of this._unsubs || []) {
        try { off(); } catch (err) { /* cleanup must not throw */ }
      }
      this._unsubs = [];
      this._removeOwned();
      this._claim = null;
      this._lastCourtesyAt = -Infinity;
    },

    _hardReset() {
      this._removeOwned();
      this._claim = null;
      this._lastCourtesyAt = -Infinity;
    },

    _flags() {
      const flags = this.state?.story?.flags;
      return flags ? flags : (this.state?.story ? (this.state.story.flags = {}) : null);
    },

    _now() {
      const s = this.state;
      return Number.isFinite(s?.simTime) ? s.simTime : (Number.isFinite(s?.tick) ? s.tick / 60 : 0);
    },

    _removeOwned() {
      const rm = this.helpers?.removeEntity;
      if (typeof rm !== 'function') return;
      if (this._shipId != null) rm(this._shipId);
      this._shipId = null;
    },

    _onClaimed(payload) {
      const body = payload.body || {};
      const x = Number(body.x ?? body.pos?.x);
      const z = Number(body.z ?? body.pos?.z);
      if (!Number.isFinite(x) || !Number.isFinite(z)) return;
      this._claim = {
        bodyId: body.id ?? payload.bodyId ?? null,
        sectorId: body.sectorId ?? null,
        x, z,
      };
    },

    _onDefenseResolved(payload) {
      if (!payload || payload.outcome !== 'defended') return;
      this._offerRecovery(payload.bodyId);
    },

    _onRaidRepelled(payload) {
      // Some settles emit raidRepelled without a defenseResolved pass; either receipt opens
      // the same single window (the cooldown keeps them from doubling).
      this._offerRecovery(payload && payload.bodyId);
    },

    _offerRecovery() {
      if (!this._claim) return;
      const flags = this._flags();
      if (flags?.[PL_372_BROKEN_FOREVER_FLAG] === true) return; // you shot it once; never again
      const now = this._now();
      if (now - this._lastCourtesyAt < WRECKERS_COURTESY_TUNING.courtesyCooldownS) return;
      const spawn = this.helpers?.spawnEntity;
      if (typeof spawn !== 'function' || this._shipId != null) return;
      this._lastCourtesyAt = now;
      const ent = spawn(recoveryShipSpec(this._claim, now));
      if (!ent || ent.id == null) return;
      this._shipId = ent.id;
      this.bus?.emit(PL_372_RECOVERY_EVENT, {
        shipId: ent.id,
        bodyId: this._claim.bodyId,
        windowEndsAt: now + WRECKERS_COURTESY_TUNING.recoveryLingerS,
        t: now,
      });
    },

    _onKilled(payload) {
      if (this._shipId == null || payload?.id !== this._shipId) return;
      // You shot the recovery. Every future raid hits harder, and the lane knows why.
      this._shipId = null;
      const flags = this._flags();
      if (flags) flags[PL_372_BROKEN_FOREVER_FLAG] = true;
      const now = this._now();
      this.bus?.emit('comms:popup', {
        id: `plants:pl372:broken:${Math.round(now)}`,
        sender: 'The lane',
        category: 'story',
        text: 'Every yard on the lane knows why.',
        ttl: 9,
        persist: false,
      });
      this.bus?.emit('audio:cue', { id: 'ui_deny' });
      this.bus?.emit(PL_372_BROKEN_EVENT, { raidHardenDelta: WRECKERS_COURTESY_TUNING.hardenDelta, t: now });
    },

    update() {
      if (this._shipId == null) return;
      const s = this.state;
      const ship = s?.entities?.get ? s.entities.get(this._shipId) : null;
      if (!ship || ship.alive === false) { this._shipId = null; return; }
      const now = this._now();
      if (now < (ship.data?.recoveryUntil ?? 0)) return;
      // They finished collecting. The ship leaves; the courtesy lands.
      this.helpers?.removeEntity?.(this._shipId);
      this._shipId = null;
      const flags = this._flags();
      if (flags) flags[PL_372_COURTESY_EARNED_FLAG] = true;
      this.bus?.emit('comms:popup', {
        id: `plants:pl372:courtesy:${Math.round(now)}`,
        sender: 'Somebody talked',
        category: 'story',
        text: 'Softer, next time.',
        ttl: 8,
        persist: false,
      });
      this.bus?.emit('audio:cue', { id: 'confirm' });
      this.bus?.emit(PL_372_COURTESY_EVENT, {
        raidSoftenDelta: WRECKERS_COURTESY_TUNING.softenDelta,
        bodyId: this._claim ? this._claim.bodyId : null,
        sectorId: this._claim ? this._claim.sectorId : null,
        pos: this._claim ? { x: this._claim.x, z: this._claim.z } : null,
        t: now,
      });
    },
  };
}

export const pl372WreckersCourtesy = createPl372WreckersCourtesy();
