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

export const STUNT_SYSTEM_SCHEMA_VERSION = 1;
export const MAX_RECENT_TRICKS = 64;

function ensureState(state) {
  if (!state || typeof state !== 'object') return null;
  if (!state.stunts || typeof state.stunts !== 'object') {
    state.stunts = {
      schemaVersion: STUNT_SYSTEM_SCHEMA_VERSION,
      recentTricks: [],
      totalTricksDetected: 0,
      tricksByRarity: { common: 0, uncommon: 0, rare: 0, legendary: 0 },
    };
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
    }
  },

  update(state, dt) {
    if (!state) return;
    ensureState(state);
    if (this.detector && state.playerId != null) {
      this.detector.setPlayerId(state.playerId);
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
        }
        if (this.bus && typeof this.bus.emit === 'function') {
          this.bus.emit('stunt:trickDetected', trick);
        }
      }
    }
  },
};
