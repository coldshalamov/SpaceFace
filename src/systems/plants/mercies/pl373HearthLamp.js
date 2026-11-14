// PL-373 The hearth lamp — "The first caller's lamp warms any visitor who docks cold at your
// rock: they stay longer, trade more, tell the next hull | Keep the lamp warm; or turn it into
// a policing floodlight — visitors dock fast, buy nothing, and the first caller stops coming"
//
// Coupling (do not duplicate): the hearth lamp IS the first caller's lamp. Its spec lives in
// src/systems/plants/pl146FirstCaller.js — callerLampSpec stamps data.plantsPl146Lamp === true
// and data.lampLit === true on the live entity; the durable verdict rides PL_146_LAMP_LIT_FLAG.
// This module only READS that lamp: presence via the live entity scan, lit-ness via lampLit,
// and it reacts to PL_146_CALL_EVENT / PL_146_SNUFFED_EVENT. It never spawns, moves, or kills
// the lamp itself.
//
// The policing floodlight is a player BUILD, observed through the verified seam
// claim:moduleBuilt { bodyId, modId } (src/systems/claims.js): mounting mod_defense (a Defense
// Battery, src/data/claimableBodies.js) on the claim that keeps the hearth is turning hospitality
// into policing. The bite publishes in two layers: visitors' stays are stamped short here, and
// PL_373_FLOODLIT_EVENT is emitted for the first caller's owner to consume — pl146 currently
// subscribes only plants:pl252:missed, so the "first caller stops coming" beat is a documented
// one-line subscription on pl146's side; this module owns the seam, not pl146's timer.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM.
// - Session state on `this`; destroy() unsubscribes every listener and clears bounded Maps.
// - Warmth lands ONCE per visitor (a warmed set, bounded by memoryCap); the extension is the
//   only write this module makes to pl146's visitor prop (visitUntil += warmthBonusS).
// - No economy mutation: "trade more" is a stamp (data.plantsPl373Warmed) and a voice beat.

import {
  PL_146_CALL_EVENT,
  PL_146_SNUFFED_EVENT,
  PL_146_LAMP_LIT_FLAG,
} from '../pl146FirstCaller.js';

export const PL_373_WARMED_EVENT = 'plants:pl373:warmed';
export const PL_373_FLOODLIT_EVENT = 'plants:pl373:floodlit';

export const HEARTH_LAMP_TUNING = Object.freeze({
  warmRangeWu: 90,            // "docks cold at your rock": visitor inside this of the claim
  warmthBonusS: 12,           // they stay longer
  coldDockShortS: 8,          // floodlit: visitors dock fast, stay short
  chatterCooldownS: 90,       // "tell the next hull" fires at most this often
  defenseModIds: ['mod_defense'], // verified buildable ids that read as a policing floodlight
  memoryCap: 8,               // bounded warmed set
});

export const PL_373_FLOODLIT_FLAG = 'plantsPl373Floodlit';

/** Pure: is this entity the first caller's lamp, still burning? */
export function isLitHearthLamp(ent) {
  return !!ent && ent.alive !== false
    && ent.data?.plantsPl146Lamp === true
    && ent.data?.lampLit === true;
}

/** Pure: is this entity a first-caller visitor hull? */
export function isCallerVisitor(ent) {
  return !!ent && ent.alive !== false && ent.data?.plantsPl146Visitor === true;
}

/** Pure: squared distance helper for the warm-range checks. */
export function distSqWu(a, b) {
  const dx = Number(a && a.x) - Number(b && b.x);
  const dz = Number(a && a.z) - Number(b && b.z);
  return dx * dx + dz * dz;
}

export function createPl373HearthLamp() {
  return {
    name: 'plantsPl373',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._claim = null;
      this._warmed = new Map();   // visitorId -> true, bounded
      this._chatterAt = -Infinity;
      const on = (event, fn) => {
        const off = this.bus?.on?.(event, fn);
        if (typeof off === 'function') this._unsubs.push(off);
      };
      on('claim:claimed', (p = {}) => this._onClaimed(p));
      on(PL_146_CALL_EVENT, (p = {}) => this._onCall(p));
      on(PL_146_SNUFFED_EVENT, () => { this._warmed.clear(); });
      on('claim:moduleBuilt', (p = {}) => this._onModuleBuilt(p));
      on('sector:exit', () => this._warmed.clear());
      on('game:newGame', () => this._hardReset());
    },

    destroy() {
      for (const off of this._unsubs || []) {
        try { off(); } catch (err) { /* cleanup must not throw */ }
      }
      this._unsubs = [];
      this._hardReset();
    },

    _hardReset() {
      this._claim = null;
      this._warmed?.clear();
      this._chatterAt = -Infinity;
    },

    _flags() {
      const flags = this.state?.story?.flags;
      return flags ? flags : (this.state?.story ? (this.state.story.flags = {}) : null);
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
      this._claim = {
        bodyId: body.id ?? payload.bodyId ?? null,
        sectorId: body.sectorId ?? null,
        x, z,
      };
    },

    _onCall() {
      // A fresh visitor hull arrived; warm it this tick if the hearth burns.
      this._warmed?.clear(); // one visitor hull per call; the bounded set tracks only the live one
    },

    _hearthBurning() {
      if (this._flags()?.[PL_373_FLOODLIT_FLAG] === true) return false;
      const s = this.state;
      if (s?.entities && typeof s.entities.values === 'function') {
        for (const ent of s.entities.values()) {
          if (isLitHearthLamp(ent)) return true;
        }
      }
      return this._flags()?.[PL_146_LAMP_LIT_FLAG] === true;
    },

    _onModuleBuilt(payload) {
      if (!this._claim) return;
      const modId = String(payload?.modId || '');
      if (!HEARTH_LAMP_TUNING.defenseModIds.includes(modId)) return;
      if (payload.bodyId != null && this._claim.bodyId != null
        && payload.bodyId !== this._claim.bodyId) return; // a battery on some other rock
      const flags = this._flags();
      if (!flags || flags[PL_373_FLOODLIT_FLAG] === true) return;
      flags[PL_373_FLOODLIT_FLAG] = true; // durable: the hearth reads as a policing floodlight
      this._warmed?.clear();
      const now = this._now();
      this.bus?.emit('comms:popup', {
        id: `plants:pl373:floodlit:${Math.round(now)}`,
        sender: 'The rock',
        category: 'story',
        text: 'Visitors dock fast. Buy nothing.',
        ttl: 9,
        persist: false,
      });
      this.bus?.emit('audio:cue', { id: 'ui_deny' });
      this.bus?.emit(PL_373_FLOODLIT_EVENT, {
        bodyId: this._claim.bodyId,
        modId,
        firstCallerStopsComing: true, // the documented handoff pl146 consumes
        t: now,
      });
    },

    update() {
      if (!this._claim) return;
      const s = this.state;
      if (!s?.entities || typeof s.entities.values !== 'function') return;
      const now = this._now();
      const floodlit = this._flags()?.[PL_373_FLOODLIT_FLAG] === true;
      for (const ent of s.entities.values()) {
        if (!isCallerVisitor(ent) || !ent.pos) continue;
        if (distSqWu(ent.pos, this._claim) > HEARTH_LAMP_TUNING.warmRangeWu * HEARTH_LAMP_TUNING.warmRangeWu) continue;
        if (floodlit) {
          // Policing floodlight: they dock fast and leave short.
          if (ent.data?.plantsPl373Cold !== true) {
            ent.data.plantsPl373Cold = true;
            if (Number.isFinite(ent.data.visitUntil)) {
              ent.data.visitUntil = Math.min(ent.data.visitUntil, now + HEARTH_LAMP_TUNING.coldDockShortS);
            }
          }
          continue;
        }
        if (!this._hearthBurning()) continue; // lamp dead: nobody lingers
        if (this._warmed.has(ent.id)) continue; // once per visitor
        if (this._warmed.size >= HEARTH_LAMP_TUNING.memoryCap) this._warmed.clear();
        this._warmed.set(ent.id, true);
        ent.data.plantsPl373Warmed = true; // "trade more" reads from this stamp
        if (Number.isFinite(ent.data.visitUntil)) {
          ent.data.visitUntil += HEARTH_LAMP_TUNING.warmthBonusS; // they stay longer
        }
        if (now - this._chatterAt >= HEARTH_LAMP_TUNING.chatterCooldownS) {
          this._chatterAt = now;
          this.bus?.emit('comms:popup', {
            id: `plants:pl373:warmed:${Math.round(now)}`,
            sender: 'The next hull',
            category: 'story',
            text: 'Stayed longer. Warm rock, that.',
            ttl: 8,
            persist: false,
          });
        }
        this.bus?.emit(PL_373_WARMED_EVENT, {
          visitorId: ent.id,
          extraS: HEARTH_LAMP_TUNING.warmthBonusS,
          pos: { x: this._claim.x, z: this._claim.z },
          sectorId: this._claim.sectorId,
          t: now,
        });
      }
    },
  };
}

export const pl373HearthLamp = createPl373HearthLamp();
