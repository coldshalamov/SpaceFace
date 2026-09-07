// src/systems/stuntGrammar.js — Stunt grammar runtime observer (PQ-146.00).
//
// Observes canonical physics and combat receipts through the event bus and feeds them
// to the pure StuntDetector module. When a named trick with a verified cause chain is
// detected, it emits `stunt:trickDetected` and records it to state for combo scoring
// and ship ledger projection.
//
// Single-writer contract:
//   - Owns only state.stunts (transient recent trick buffer)
//   - Never mutates entity physics, health, or controller state

import { createStuntDetector } from '../combat/stuntTaxonomy.js';
import {
  bankIfQuiet,
  createComboState,
  recordKill,
  recordTrick,
  recordTrickKill,
} from './stuntCombo.js';

export const STUNT_SYSTEM_SCHEMA_VERSION = 1;
export const MAX_RECENT_TRICKS = 64;

// Kill receipts that carry no trick are flat gun kills for combo scoring. Trick kills
// (a tow-kill, a wreck crush, ...) arrive WITH a trick on the same event and are counted
// as trick kills instead — never double-paid.
const KILL_EVENTS = Object.freeze(['entity:killed', 'combat:kill']);

function ensureState(state) {
  if (!state || typeof state !== 'object') return null;
  if (!state.stunts || typeof state.stunts !== 'object') {
    state.stunts = {
      schemaVersion: STUNT_SYSTEM_SCHEMA_VERSION,
      recentTricks: [],
      totalTricksDetected: 0,
      tricksByRarity: { common: 0, uncommon: 0, rare: 0, legendary: 0 },
      combo: createComboState(),
    };
  }
  if (!state.stunts.combo || typeof state.stunts.combo !== 'object') {
    state.stunts.combo = createComboState();
  }
  return state.stunts;
}

export const stuntGrammar = {
  id: 'stuntGrammar',
  name: 'stuntGrammar',

  init(ctx) {
    this.bus = ctx && ctx.bus ? ctx.bus : null;
    this.detector = createStuntDetector({
      playerId: ctx && ctx.state ? ctx.state.playerId : null,
    });
    this._unsubs = [];

    if (this.bus && typeof this.bus.on === 'function') {
      const listen = (evt) => {
        const unsub = this.bus.on(evt, (payload) => this._onEvent(evt, payload, ctx && ctx.state));
        if (typeof unsub === 'function') this._unsubs.push(unsub);
      };

      listen('tether:attached');
      listen('tether:latch');
      listen('tether:releaseRated');
      listen('tether:cut');
      listen('tether:released');
      listen('tether:whipImpact');
      listen('tether:snapCatch');
      listen('massline:sweepImpact');
      listen('massline:clothesline');
      listen('combat:hitstunImpulse');
      listen('weapon:shove');
      listen('combat:collisionConsequence');
      listen('entity:killed');
      listen('combat:kill');
      listen('flight:nearMiss');
      listen('well:capture');
      listen('well:fling');
      // Run boundary resets the combo meter. The banked score survives run:ended so the
      // results surface can still read it; the next run:started opens a fresh meter.
      listen('run:started');
      listen('game:started');
    }
  },

  update(state, dt) {
    if (!state) return;
    ensureState(state);
    if (this.detector && state.playerId != null) {
      this.detector.setPlayerId(state.playerId);
    }
    // Bank a live chain once it has gone quiet. One cheap branch when no chain is live;
    // no per-tick allocation.
    if (state.stunts && state.stunts.combo && state.stunts.combo.activeCount > 0) {
      const nowTick = Number.isFinite(Number(state.tick))
        ? Number(state.tick)
        : (this.detector ? this.detector.tick : 0);
      bankIfQuiet(state.stunts.combo, nowTick);
    }
  },

  destroy() {
    for (const unsub of this._unsubs) {
      if (typeof unsub === 'function') unsub();
    }
    this._unsubs = [];
    this.detector = null;
    this.bus = null;
  },

  _onEvent(evt, payload, state) {
    // Fresh meter per run. Reset is idempotent: game:started then run:started just opens
    // two fresh meters in a row.
    if (evt === 'run:started' || evt === 'game:started') {
      const stuntsState = ensureState(state);
      if (stuntsState) stuntsState.combo = createComboState();
      return;
    }
    if (!this.detector) return;
    if (state && state.playerId != null) {
      this.detector.setPlayerId(state.playerId);
    }

    const tricks = this.detector.processEvent(evt, payload);
    if (tricks.length > 0) {
      const stuntsState = ensureState(state);
      for (const trick of tricks) {
        if (stuntsState) {
          stuntsState.recentTricks.push(trick);
          if (stuntsState.recentTricks.length > MAX_RECENT_TRICKS) {
            stuntsState.recentTricks.shift();
          }
          stuntsState.totalTricksDetected += 1;
          const rarity = trick.rarity || 'common';
          if (stuntsState.tricksByRarity[rarity] != null) {
            stuntsState.tricksByRarity[rarity] += 1;
          }
          // Combo meter: the single writer for combo/score feeds on the same receipt.
          // Scoring never alters the trick itself and never touches moment:holyShit.
          if (stuntsState.combo) recordTrick(stuntsState.combo, trick);
        }
        if (this.bus && typeof this.bus.emit === 'function') {
          this.bus.emit('stunt:trickDetected', trick);
        }
      }
      // A kill that arrives WITH a trick is a trick kill, not a gun kill.
      if (KILL_EVENTS.includes(evt)) {
        const stuntsState = ensureState(state);
        if (stuntsState && stuntsState.combo) {
          for (let i = 0; i < tricks.length; i += 1) recordTrickKill(stuntsState.combo);
          bankIfQuiet(stuntsState.combo, Number.isFinite(Number(payload && payload.tick)) ? Number(payload.tick) : 0);
        }
      }
    } else if (KILL_EVENTS.includes(evt)) {
      // A trickless kill is flat gun pay: no chain, no multiplier. The free Pulse pays
      // less than any other gun (scoring only — damage untouched).
      const stuntsState = ensureState(state);
      if (stuntsState && stuntsState.combo) {
        const data = payload && typeof payload === 'object' ? payload : {};
        recordKill(stuntsState.combo, {
          weaponId: data.weaponId || data.weapon || (data.provenance && data.provenance.weaponId),
          tick: data.tick,
        });
        bankIfQuiet(stuntsState.combo, Number.isFinite(Number(data.tick)) ? Number(data.tick) : 0);
      }
    }
  },
};
