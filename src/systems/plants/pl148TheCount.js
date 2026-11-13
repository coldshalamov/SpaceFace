// PL-148 The count — "Before the first raid, a fast skiff flies your yard's perimeter at night,
// once, lamps off | Let it count; or Line it — the pilot ejects, the skiff is yours, and the
// raid comes early"
//
// DELIVERABILITY NOTE (no fake seams): the raid clock belongs to claims.js — its `claim:defenseGo`
// listener only re-affirms a waypoint, so "the raid comes early" is not writable from outside.
// The row's cost is delivered through what this module DOES own: the yard-watch relay. While
// The Count is intact, every `claim:defenseWarning` is relayed to the yard as a heads-up beat.
// Line/kill The Count (any physical kill of the tetherable skiff): the pilot ejects as a real
// pod, the skiff wreck stays yours — and the NEXT raid warning is NOT relayed. The yard gets
// no heads-up for one raid. That cost is real, deliverable, and stated in the player line.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM.
// - Session state on `this`; destroy() unsubscribes, removes owned entities, clears state.
// - Night is the fixed sim clock band (tuning.dayLengthS / nightFraction).
// - The skiff is a real tetherable prop running ONE authored perimeter lap; finishing the lap
//   is "let it count". It arms only off the first defense warning (claim bodies carry pos;
//   `claim:raidWarning` does not, so it is not an arm seam).
// - One count attempt per warning; the count never starts once the raid has begun.

import { spawnJettisonedCargoPod } from '../lootShards.js';
import { isNightAt } from './pl146FirstCaller.js';

export const PL_148_COUNT_EVENT = 'plants:pl148:count';
export const PL_148_LINED_EVENT = 'plants:pl148:lined';

export const THE_COUNT_TUNING = Object.freeze({
  dayLengthS: 240,
  nightFraction: 0.25,
  perimeterRadiusWu: 140,
  lapRateRad: Math.PI / 6,     // one lap in 12 s at this rate — a fast skiff
  skiffRadius: 6,
  skiffMass: 14,
  skiffHull: 8,
  pilotUnitMass: 60,           // a pilot's mass, honestly carried by the pod
  pilotAmountU: 1,
  pilotRadius: 2,
  memoryCap: 6,
});

export function skiffSpec(pos, t = THE_COUNT_TUNING) {
  return {
    type: 'debris',
    pos: { x: pos.x + t.perimeterRadiusWu, z: pos.z },
    vel: { x: 0, z: 0 },
    radius: t.skiffRadius,
    mass: t.skiffMass,
    physicsBody: { mass: t.skiffMass },
    hull: t.skiffHull,
    hullMax: t.skiffHull,
    data: {
      parentType: 'story_prop',
      storyPropKind: 'plants_the_count_skiff',
      plantsPl148Skiff: true,
      scanLabel: 'A fast skiff — lamps off, flying your perimeter',
      masslineTetherable: true, // "Line it"
      lampsOff: true,
    },
  };
}

export function createPl148TheCount() {
  return {
    name: 'plantsPl148',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._pendingWarning = null; // { bodyId, x, z, encounterId, warnedAt }
      this._skiffId = null;
      this._skiffAngle = 0;
      this._raidsSeen = 0;
      this._suppressNextWarning = false;
      this._lastLinedAt = -Infinity;
      const on = (event, fn) => {
        const off = this.bus?.on?.(event, fn);
        if (typeof off === 'function') this._unsubs.push(off);
      };
      on('claim:defenseWarning', (p = {}) => this._onWarning(p));
      on('claim:defenseStarted', (p = {}) => this._onRaidStarted(p));
      on('entity:killed', (p = {}) => this._onKilled(p));
      on('sector:exit', () => this._reset());
      on('save:loaded', () => this._reset());
      on('game:newGame', () => this._reset());
    },

    destroy() {
      for (const off of this._unsubs || []) {
        try { off(); } catch (err) { /* cleanup must not throw */ }
      }
      this._unsubs = [];
      this._reset();
      this._raidsSeen = 0;
      this._suppressNextWarning = false;
      this._lastLinedAt = -Infinity;
    },

    _now() {
      const s = this.state;
      return Number.isFinite(s?.simTime) ? s.simTime : (Number.isFinite(s?.tick) ? s.tick / 60 : 0);
    },

    _reset() {
      const rm = this.helpers?.removeEntity;
      if (typeof rm === 'function' && this._skiffId != null) rm(this._skiffId);
      this._skiffId = null;
      this._skiffAngle = 0;
      this._pendingWarning = null;
    },

    _yardPosOf(bodyId) {
      const bodies = this.state?.claims?.bodies;
      const body = Array.isArray(bodies) && bodyId != null
        ? bodies.find((b) => b && b.id === bodyId) : null;
      const x = Number(body?.x ?? body?.pos?.x);
      const z = Number(body?.z ?? body?.pos?.z);
      return Number.isFinite(x) && Number.isFinite(z) ? { x, z } : null;
    },

    _onWarning(payload) {
      // The yard-watch relay: while The Count is intact, every warning reaches the yard.
      if (this._suppressNextWarning) {
        // You blinded your own watch: this raid arrives unheard.
        this._suppressNextWarning = false;
        this.bus?.emit(PL_148_COUNT_EVENT, { outcome: 'warning-suppressed', bodyId: payload.bodyId ?? null, t: this._now() });
      } else {
        this.bus?.emit('comms:popup', {
          id: `plants:pl148:watch:${Math.round(this._now())}`,
          sender: 'Yard watch',
          category: 'story',
          text: `Yard watch: ${payload.attackerName || 'raiders'} — ${payload.attackerCount ?? 1} inbound.`,
          ttl: 8,
          persist: false,
        });
        this.bus?.emit('audio:cue', { id: 'warning' });
        this.bus?.emit(PL_148_COUNT_EVENT, { outcome: 'warning-relayed', bodyId: payload.bodyId ?? null, t: this._now() });
      }
      if (this._pendingWarning || this._skiffId != null) return; // one count at a time
      if (this._raidsSeen > 0) return;                            // "before the FIRST raid"
      const pos = this._yardPosOf(payload.bodyId) || (Number.isFinite(Number(payload.pos?.x))
        ? { x: Number(payload.pos.x), z: Number(payload.pos.z) } : null);
      if (!pos) return;
      this._pendingWarning = {
        bodyId: payload.bodyId ?? null,
        x: pos.x,
        z: pos.z,
        encounterId: payload.encounterId ?? null,
        warnedAt: this._now(),
      };
    },

    _onRaidStarted() {
      this._raidsSeen += 1;
      if (this._skiffId != null || this._pendingWarning) this._reset();
    },

    _launch() {
      const spawn = this.helpers?.spawnEntity;
      const warn = this._pendingWarning;
      if (!warn || typeof spawn !== 'function') return;
      const ent = spawn(skiffSpec(warn));
      if (ent && ent.id != null) {
        this._skiffId = ent.id;
        this._skiffAngle = 0;
      } else {
        this._pendingWarning = null;
      }
    },

    _onKilled(payload) {
      if (this._skiffId == null || payload.id !== this._skiffId) return;
      const now = this._now();
      this._skiffId = null;
      if (now - this._lastLinedAt < 1) return;
      this._lastLinedAt = now;
      const warn = this._pendingWarning;
      this._pendingWarning = null;
      const spawn = this.helpers?.spawnEntity;
      // The pilot ejects — a real pod, his weight honest in physics.
      if (typeof spawnJettisonedCargoPod === 'function' && warn) {
        const pilot = spawnJettisonedCargoPod(this.state, {
          commodityId: 'cmdty_alloys',
          amount: THE_COUNT_TUNING.pilotAmountU,
          unitMass: THE_COUNT_TUNING.pilotUnitMass,
          radius: THE_COUNT_TUNING.pilotRadius,
          pos: { x: warn.x + THE_COUNT_TUNING.perimeterRadiusWu, z: warn.z + 8 },
          vel: { x: 0, z: 0 },
          ownerId: null,
        }, this.helpers);
        if (pilot) {
          pilot.data = pilot.data || {};
          pilot.data.plantsPl148Pilot = true;
          pilot.data.scanLabel = 'An ejected pilot — counting is voluntary';
          pilot.data.swarmFloorPad = { label: 'Ejected pilot' };
        }
      }
      // The skiff is yours: a persistent wreck the player can keep.
      if (typeof spawn === 'function' && warn) {
        spawn({
          type: 'debris',
          pos: { x: warn.x + THE_COUNT_TUNING.perimeterRadiusWu, z: warn.z },
          vel: { x: 0, z: 0 },
          radius: THE_COUNT_TUNING.skiffRadius,
          mass: THE_COUNT_TUNING.skiffMass,
          physicsBody: { mass: THE_COUNT_TUNING.skiffMass },
          hull: THE_COUNT_TUNING.skiffHull,
          hullMax: THE_COUNT_TUNING.skiffHull,
          flags: { persistent: true },
          data: {
            parentType: 'story_prop',
            storyPropKind: 'plants_the_count_wreck',
            plantsPl148Yours: true,
            scanLabel: 'The skiff — yours now, lamps off',
            masslineTetherable: true,
            lampsOff: true,
          },
        });
      }
      // The cost you bought: the next warning reaches no one.
      this._suppressNextWarning = true;
      this.bus?.emit('comms:popup', {
        id: `plants:pl148:lined:${Math.round(now)}`,
        sender: 'Yard watch',
        category: 'story',
        text: 'The pilot ejects. Your watch goes blind.',
        ttl: 8,
        persist: false,
      });
      this.bus?.emit('audio:cue', { id: 'warning' });
      this.bus?.emit(PL_148_LINED_EVENT, { bodyId: warn?.bodyId ?? null, watchBlindNext: true, t: now });
    },

    update(dt, state) {
      const s = state || this.state;
      if (!s || s.mode !== 'flight') return;
      const now = this._now();
      const t = THE_COUNT_TUNING;
      if (!this._skiffId && this._pendingWarning && isNightAt(now, t)) this._launch();
      if (this._skiffId != null) {
        const ent = s.entities?.get ? s.entities.get(this._skiffId) : null;
        if (!ent || ent.alive === false) { this._skiffId = null; return; }
        this._skiffAngle += t.lapRateRad * Math.max(0, Number(dt) || 0);
        const warn = this._pendingWarning;
        if (warn && ent.pos) {
          ent.pos.x = warn.x + Math.cos(this._skiffAngle) * t.perimeterRadiusWu;
          ent.pos.z = warn.z + Math.sin(this._skiffAngle) * t.perimeterRadiusWu;
          ent.data = ent.data || {};
        }
        // One lap, lamps off: the count completes on its own.
        if (this._skiffAngle >= Math.PI * 2) {
          this.helpers?.removeEntity?.(this._skiffId);
          this._skiffId = null;
          this._pendingWarning = null;
          this.bus?.emit(PL_148_COUNT_EVENT, { bodyId: warn?.bodyId ?? null, outcome: 'counted', t: now });
        }
      }
    },
  };
}

export const pl148TheCount = createPl148TheCount();
