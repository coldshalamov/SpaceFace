// PQ-027 / SF-22 — Cinder Sluice runtime adapter.
//
// World Site receipts are the durable machine state. This adapter owns no saved timer and no
// movement state: it derives warning/surge/calm from the saved sim clock, registers the authored
// current into the ONE field kernel, and emits the existing hazard-language boundary for the
// player. The field kernel/physics membrane remains the only force writer for player, NPC, and
// payload bodies.

import { fieldsFlag } from '../data/fields.js';
import {
  CINDER_SLUICE_FIELD,
  CINDER_SLUICE_SITE_ID,
  cinderSluicePhase,
  pointInsideCinderSluice,
} from '../data/environmentalMachinery.js';

const SECTOR_ID = 'sector_ceres_belt';
const HAZARD_TYPE = 'debris_current';

function simTimeOf(state) {
  return Number.isFinite(state && state.simTime)
    ? state.simTime
    : Math.max(0, Number(state && state.tick) || 0) / 60;
}

export const environmentalMachinery = {
  name: 'environmentalMachinery',

  init(ctx) {
    for (const unsub of this._unsubs || []) unsub();
    this._unsubs = [];
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.registry = ctx.registry || null;
    this._phaseOut = {};
    this._fieldPatch = { strength: 0 };
    this._fieldRegistered = false;
    this._fieldStrength = null;
    this._playerInside = false;
    this._lastPhase = null;
    this._lastRegulated = null;
    if (this.bus && typeof this.bus.on === 'function') {
      const clear = (why) => this._clear(why);
      this._unsubs = [
        this.bus.on('sector:exit', () => clear('sector_exit')),
        this.bus.on('game:new', () => clear('new_game')),
        this.bus.on('save:restoring', () => clear('save_restoring')),
        this.bus.on('save:loaded', () => clear('save_loaded')),
      ];
    }
  },

  destroy() {
    this._clear('destroy');
    for (const unsub of this._unsubs || []) unsub();
    this._unsubs = [];
  },

  newGame() {
    this._clear('new_game');
  },

  update(_dt, state) {
    const record = state && state.sites && state.sites.worldById
      && state.sites.worldById[CINDER_SLUICE_SITE_ID];
    const inSector = state && state.mode === 'flight'
      && state.world && state.world.currentSectorId === SECTOR_ID;
    if (!fieldsFlag('enabled') || !inSector || !record) {
      this._clear(!record ? 'site_missing' : 'inactive_route');
      return;
    }

    const phase = cinderSluicePhase(record, simTimeOf(state), this._phaseOut);
    if (phase.fieldActive) this._upsertField(phase);
    else this._removeField();
    this._updatePlayerBoundary(state, phase.fieldActive);
    this._publishPhaseTransition(phase);
  },

  diagnostics(state = this.state) {
    const record = state && state.sites && state.sites.worldById
      && state.sites.worldById[CINDER_SLUICE_SITE_ID];
    if (!record) return null;
    const phase = cinderSluicePhase(record, simTimeOf(state));
    return Object.freeze({
      siteId: CINDER_SLUICE_SITE_ID,
      phase: phase.phase,
      regulated: phase.regulated,
      remainingS: phase.remainingS,
      fieldRegistered: this._fieldRegistered,
      playerInside: this._playerInside,
    });
  },

  _fieldsSystem() {
    return this.registry && typeof this.registry.get === 'function'
      ? this.registry.get('fields')
      : null;
  },

  _upsertField(phase) {
    const system = this._fieldsSystem();
    if (!system || typeof system.registerEnvironmental !== 'function') return;
    const live = typeof system.hasExternal === 'function'
      ? system.hasExternal(CINDER_SLUICE_FIELD.id)
      : this._fieldRegistered;
    if (!live) {
      system.registerEnvironmental({
        ...CINDER_SLUICE_FIELD,
        strength: phase.fieldStrength,
        createdAt: phase.anchorS,
      });
      this._fieldRegistered = true;
      this._fieldStrength = phase.fieldStrength;
      return;
    }
    this._fieldRegistered = true;
    if (this._fieldStrength === phase.fieldStrength) return;
    this._fieldPatch.strength = phase.fieldStrength;
    system.updateExternal(CINDER_SLUICE_FIELD.id, this._fieldPatch);
    this._fieldStrength = phase.fieldStrength;
  },

  _removeField() {
    const system = this._fieldsSystem();
    const live = system && typeof system.hasExternal === 'function'
      ? system.hasExternal(CINDER_SLUICE_FIELD.id)
      : this._fieldRegistered;
    if (live && typeof system.unregisterExternal === 'function') {
      system.unregisterExternal(CINDER_SLUICE_FIELD.id);
    }
    this._fieldRegistered = false;
    this._fieldStrength = null;
  },

  _updatePlayerBoundary(state, fieldActive) {
    const player = state && state.entities && typeof state.entities.get === 'function'
      ? state.entities.get(state.playerId)
      : null;
    const inside = !!(fieldActive && player && player.alive !== false
      && pointInsideCinderSluice(player.pos));
    if (inside === this._playerInside) return;
    this._playerInside = inside;
    if (!this.bus || typeof this.bus.emit !== 'function') return;
    if (inside) {
      this.bus.emit('hazard:enter', {
        zoneType: HAZARD_TYPE,
        zoneId: CINDER_SLUICE_FIELD.id,
        siteId: CINDER_SLUICE_SITE_ID,
      });
    } else {
      this.bus.emit('hazard:exit', {
        zoneType: HAZARD_TYPE,
        zoneId: CINDER_SLUICE_FIELD.id,
        siteId: CINDER_SLUICE_SITE_ID,
      });
    }
  },

  _publishPhaseTransition(phase) {
    if (phase.phase === this._lastPhase && phase.regulated === this._lastRegulated) return;
    const previous = this._lastPhase;
    this._lastPhase = phase.phase;
    this._lastRegulated = phase.regulated;
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('environmentalMachinery:phaseChanged', {
        siteId: CINDER_SLUICE_SITE_ID,
        previous,
        phase: phase.phase,
        regulated: phase.regulated,
        remainingS: phase.remainingS,
      });
    }
  },

  _clear(why) {
    this._removeField();
    if (this._playerInside && this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('hazard:exit', {
        zoneType: HAZARD_TYPE,
        zoneId: CINDER_SLUICE_FIELD.id,
        siteId: CINDER_SLUICE_SITE_ID,
        why,
      });
    }
    this._playerInside = false;
    this._lastPhase = null;
    this._lastRegulated = null;
  },
};

export default environmentalMachinery;
