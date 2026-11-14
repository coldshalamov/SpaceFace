// PL-146 The first caller — "In the yard's first week a hauler you never hired calls at night,
// takes on ore, and leaves a lamp burning on your rock: *"Saw your light."*
// | Leave the lamp lit, and the calls come weekly; snuff it, and the next call is a long time coming"
// The quoted line *"Saw your light."* is final copy and is emitted verbatim, once per visit.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM. The sim stamps numbers; presentation reads them.
// - All session state lives on `this`. destroy() unsubscribes every listener, removes owned
//   entities and clears bounded Maps. Durable facts ride story flags (`plantsPl146*`).
// - Night/day is a fixed sim clock (tuning.dayLengthS); calls happen only inside the night band.
// - One armed visit at a time; calls never land closer than tuning.minCallGapS.
// - PL-151's dark-sale flag silences the lane: honest haulers miss it. Once the lamp has been
//   snuffed, the caller's cadence is permanently slower (durable flag `plantsPl146EverSnuffed`).

import { PL_151_DARK_SOLD_FLAG } from './pl151NoPapers.js';

export const PL_146_CALL_EVENT = 'plants:pl146:call';
export const PL_146_SNUFFED_EVENT = 'plants:pl146:snuffed';

export const FIRST_CALLER_TUNING = Object.freeze({
  dayLengthS: 240,            // the yard's sim clock: one in-world day
  nightFraction: 0.25,        // last quarter of the day is night
  firstCallDelayS: 20,        // earliest a first call can land after the claim
  firstCallWindowS: 7 * 240,  // "the yard's first week"
  weekS: 7 * 240,             // weekly cadence while the lamp burns
  snuffedGapS: 25 * 240,      // snuff the lamp and the next call is a long time coming
  minCallGapS: 30,            // two calls never stack
  lampOffsetWu: 26,           // the lamp drops off the yard rock, not inside it
  lampFlashBurstS: 1.2,       // the lamp's arrival flash; the burner itself stays lit
  visitCircuitS: 18,          // the hauler's presence circles the rock this long
  visitCircuitRadiusWu: 90,
  visitCircuitRateRad: Math.PI / 9,
  memoryCap: 8,               // bounded bookkeeping
});

export const PL_146_LAMP_LIT_FLAG = 'plantsPl146LampLit';
export const PL_146_FIRST_DONE_FLAG = 'plantsPl146FirstCallDone';
export const PL_146_EVER_SNUFFED_FLAG = 'plantsPl146EverSnuffed';

export function isNightAt(simTime, t = FIRST_CALLER_TUNING) {
  const len = Math.max(1, t.dayLengthS);
  const phase = ((simTime % len) + len) % len;
  return phase >= len * (1 - t.nightFraction);
}

export function firstCallDue(state, claimAt, t = FIRST_CALLER_TUNING) {
  const now = Number.isFinite(state.simTime) ? state.simTime : 0;
  if (now < claimAt + t.firstCallDelayS) return false;
  if (now > claimAt + t.firstCallWindowS) return false;
  return isNightAt(now, t);
}

export function callerLampSpec(pos, now, t = FIRST_CALLER_TUNING) {
  return {
    type: 'beacon',
    pos: { x: pos.x + t.lampOffsetWu, z: pos.z + t.lampOffsetWu * 0.4 },
    vel: { x: 0, z: 0 },
    radius: 4,
    mass: 1e6,
    hull: 1,
    hullMax: 1,
    data: {
      parentType: 'story_prop',
      storyPropKind: 'plants_first_caller_lamp',
      plantsPl146Lamp: true,
      scanLabel: 'A lamp, left burning on your rock',
      swarmFloorPad: { label: 'The caller\u2019s lamp' },
      lampsFlashing: true,
      lampFlashUntil: now + t.lampFlashBurstS,
      lampLit: true,
    },
  };
}

export function createPl146FirstCaller() {
  return {
    name: 'plantsPl146',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._claim = null;          // { bodyId, x, z, at }
      this._nextCallAt = null;
      this._visits = 0;
      this._lastCallAt = -Infinity;
      this._everSnuffed = false;
      this._plantsPl373Floodlit = false; // PL-373's floodlight: the first caller stops coming
      this._lampId = null;
      this._visitor = null;        // { id, until, lastAngle, angle }
      const on = (event, fn) => {
        const off = this.bus?.on?.(event, fn);
        if (typeof off === 'function') this._unsubs.push(off);
      };
      on('claim:claimed', (p = {}) => this._onClaimed(p));
      on('entity:killed', (p = {}) => this._onKilled(p));
      on('plants:pl252:missed', () => {
        // The regular missed the hopper — the next call is a long time off.
        if (this._nextCallAt != null && Number.isFinite(this.state?.simTime)) {
          this._nextCallAt = Math.max(this._nextCallAt, this.state.simTime + FIRST_CALLER_TUNING.snuffedGapS);
        }
      });
      on('plants:pl373:floodlit', () => {
        // PL-373's documented handoff: under the floodlight, the first caller stops coming.
        this._plantsPl373Floodlit = true;
      });
      on('sector:exit', () => this._resetVisit());
      on('save:loaded', () => this._resyncFromFlags());
      on('game:newGame', () => this._hardReset());
      this._resyncFromFlags();
    },

    destroy() {
      for (const off of this._unsubs || []) {
        try { off(); } catch (err) { /* cleanup must not throw */ }
      }
      this._unsubs = [];
      this._removeOwned();
      this._claim = null;
      this._nextCallAt = null;
      this._visits = 0;
      this._lastCallAt = -Infinity;
      this._everSnuffed = false;
      this._plantsPl373Floodlit = false;
      this._visitor = null;
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
      if (this._lampId != null) rm(this._lampId);
      if (this._visitor?.id != null) rm(this._visitor.id);
      this._lampId = null;
      this._visitor = null;
    },

    _resetVisit() {
      this._visitor = null;
    },

    _hardReset() {
      this._removeOwned();
      this._claim = null;
      this._nextCallAt = null;
      this._visits = 0;
      this._lastCallAt = -Infinity;
      this._everSnuffed = false;
      this._plantsPl373Floodlit = false;
      this._visitor = null;
    },

    _resyncFromFlags() {
      const flags = this._flags();
      // Durable facts survive a load; the physical lamp does not (a lit bulb is session truth).
      this._lampId = null;
      this._visitor = null;
      this._everSnuffed = flags?.[PL_146_EVER_SNUFFED_FLAG] === true;
      this._plantsPl373Floodlit = flags?.plantsPl373Floodlit === true; // PL-373's durable floodlight verdict
      if (flags && flags[PL_146_FIRST_DONE_FLAG] === true && this._claim) {
        this._nextCallAt = this._now()
          + (this._everSnuffed ? FIRST_CALLER_TUNING.snuffedGapS : FIRST_CALLER_TUNING.weekS);
      }
    },

    _onClaimed(payload) {
      const body = payload.body || {};
      const x = Number(body.x ?? body.pos?.x);
      const z = Number(body.z ?? body.pos?.z);
      if (!Number.isFinite(x) || !Number.isFinite(z)) return;
      this._claim = { bodyId: body.id ?? payload.bodyId ?? null, x, z, at: this._now() };
    },

    _onKilled(payload) {
      if (this._lampId != null && payload.id === this._lampId) {
        // Snuffed. The next call is a long time coming.
        this._lampId = null;
        const flags = this._flags();
        if (flags) {
          flags[PL_146_LAMP_LIT_FLAG] = false;
          flags[PL_146_EVER_SNUFFED_FLAG] = true; // snuff once: the cadence is slower for good
        }
        this._everSnuffed = true;
        if (this._nextCallAt != null && Number.isFinite(this.state?.simTime)) {
          this._nextCallAt = this.state.simTime + FIRST_CALLER_TUNING.snuffedGapS;
        }
        this.bus?.emit(PL_146_SNUFFED_EVENT, { t: this._now() });
        this.bus?.emit('audio:cue', { id: 'ui_deny' });
      }
    },

    _due() {
      if (!this._claim) return false;
      if (this._plantsPl373Floodlit === true) return false; // floodlit: the first caller stops coming (PL-373)
      if (this._visits > 0 && this._nextCallAt == null) return false;
      const flags = this._flags();
      if (flags?.[PL_151_DARK_SOLD_FLAG] === true) return false; // honest haulers skip this lane
      const now = this._now();
      if (this._visits === 0) return firstCallDue(this.state, this._claim.at);
      if (this._nextCallAt == null || now < this._nextCallAt) return false;
      const lampLit = flags?.[PL_146_LAMP_LIT_FLAG] === true;
      return lampLit ? isNightAt(now) : true; // a snuffed lamp still earns one late call
    },

    _call() {
      const now = this._now();
      if (now - this._lastCallAt < FIRST_CALLER_TUNING.minCallGapS) return; // calls never stack
      this._lastCallAt = now;
      this._visits += 1;
      const first = this._visits === 1;
      const flags = this._flags();
      if (flags) {
        flags[PL_146_FIRST_DONE_FLAG] = true;
        if (first || flags[PL_146_LAMP_LIT_FLAG] !== false) flags[PL_146_LAMP_LIT_FLAG] = true;
      }
      this.bus?.emit('comms:popup', {
        id: `plants:pl146:call:${this._visits}`,
        sender: 'Hauler, unlogged',
        category: 'story',
        text: 'Saw your light.',
        ttl: 8,
        persist: false,
      });
      this.bus?.emit('audio:cue', { id: 'confirm' });
      // The hauler takes on ore: a physical presence circles the rock, then goes.
      this._spawnVisitor(now);
      if (first) this._spawnLamp(now);
      const len = Math.max(1, FIRST_CALLER_TUNING.dayLengthS);
      // Schedule the next visit BEFORE announcing this one, so a synchronous verdict
      // listener (PL-252's miss) can push the next call out a long stretch. A snuffed
      // lamp slows the caller permanently.
      this._nextCallAt = now
        + (this._everSnuffed ? FIRST_CALLER_TUNING.snuffedGapS : FIRST_CALLER_TUNING.weekS);
      this.bus?.emit(PL_146_CALL_EVENT, {
        visit: this._visits,
        hourOfDay: ((now % len) + len) % len / len,
        pos: { x: this._claim.x, z: this._claim.z },
        t: now,
      });
    },

    _spawnLamp(now) {
      const spawn = this.helpers?.spawnEntity;
      if (typeof spawn !== 'function' || this._lampId != null) return;
      const ent = spawn(callerLampSpec(this._claim, now));
      if (ent && ent.id != null) this._lampId = ent.id;
    },

    _spawnVisitor(now) {
      const spawn = this.helpers?.spawnEntity;
      if (typeof spawn !== 'function') return;
      if (this._visitor?.id != null) this.helpers?.removeEntity?.(this._visitor.id);
      const t = FIRST_CALLER_TUNING;
      const ent = spawn({
        type: 'beacon',
        pos: { x: this._claim.x + t.visitCircuitRadiusWu, z: this._claim.z },
        vel: { x: 0, z: 0 },
        radius: 7,
        mass: 1e6,
        hull: 1,
        hullMax: 1,
        data: {
          parentType: 'story_prop',
          storyPropKind: 'plants_first_caller_visitor',
          plantsPl146Visitor: true,
          scanLabel: 'A hauler you never hired — taking on ore',
          lampsFlashing: true,
          lampFlashUntil: now + 1.0,
          visitUntil: now + t.visitCircuitS,
        },
      });
      if (ent && ent.id != null) this._visitor = { id: ent.id, angle: 0 };
    },

    update(dt, state) {
      const s = state || this.state;
      if (!s || s.mode !== 'flight') return;
      if (this._due()) this._call();
      const now = this._now();
      const t = FIRST_CALLER_TUNING;
      // The visitor circles the rock for the visit, then is gone.
      if (this._visitor?.id != null) {
        const ent = s.entities?.get ? s.entities.get(this._visitor.id) : null;
        if (!ent || !ent.alive) {
          this._visitor = null;
        } else if (now >= (ent.data?.visitUntil ?? 0)) {
          this.helpers?.removeEntity?.(this._visitor.id);
          this._visitor = null;
        } else if (this._claim && ent.pos) {
          this._visitor.angle += t.visitCircuitRateRad * Math.max(0, Number(dt) || 0);
          ent.pos.x = this._claim.x + Math.cos(this._visitor.angle) * t.visitCircuitRadiusWu;
          ent.pos.z = this._claim.z + Math.sin(this._visitor.angle) * t.visitCircuitRadiusWu;
        }
      }
      // The lamp's arrival flash decays; the burner itself stays lit until snuffed.
      if (this._lampId != null) {
        const lamp = s.entities?.get ? s.entities.get(this._lampId) : null;
        if (!lamp || lamp.alive === false) { this._lampId = null; }
        else if (lamp.data && lamp.data.lampsFlashing === true
          && Number.isFinite(lamp.data.lampFlashUntil) && now >= lamp.data.lampFlashUntil) {
          lamp.data.lampsFlashing = false; // burst over; lampLit stays true
        }
      }
    },
  };
}

export const pl146FirstCaller = createPl146FirstCaller();
