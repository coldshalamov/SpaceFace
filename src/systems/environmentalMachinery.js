// PQ-027 / SF-22 — Cinder Sluice runtime adapter, three Ceres kill machines, and the
// Pallas Drift debris reef. World Site receipts are the durable Cinder Sluice state. Kill
// machines and the reef are authored furniture derived from the saved sim clock. This adapter
// owns no saved timer and no movement state: it registers volumes into the ONE field kernel
// and emits hazard-language boundaries. The field kernel/physics membrane remains the only
// force writer. Death is the slam-law payoff against anvils or pinballed mass — never a
// hull-drain aura.

import { fieldsFlag } from '../data/fields.js';
import {
  CINDER_SLUICE_FIELD,
  CINDER_SLUICE_SECTOR_ID,
  CINDER_SLUICE_SITE_ID,
  KILL_MACHINES,
  PALLAS_REEF_FIELD,
  PALLAS_REEF_SECTOR_ID,
  PALLAS_REEF_SITE_ID,
  cinderSluicePhase,
  killMachineFieldCenter,
  killMachineFieldDir,
  killMachinePhase,
  pallasReefPhase,
  pointInsideCinderSluice,
  pointInsideKillMachine,
  pointInsidePallasReef,
} from '../data/environmentalMachinery.js';

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
    this._killPhaseOut = {};
    this._fieldPatch = { strength: 0 };
    this._fieldRegistered = false;
    this._fieldStrength = null;
    this._playerInside = false;
    this._lastPhase = null;
    this._lastRegulated = null;
    this._killFieldStrength = new Map();
    this._killPlayerInside = new Set();
    this._anvilsEnsured = new Set();
    this._reefPhaseOut = {};
    this._reefFieldPatch = { strength: 0 };
    this._reefFieldRegistered = false;
    this._reefFieldStrength = null;
    this._reefPlayerInside = false;
    this._reefEnsured = false;
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
    const sectorId = state && state.world && state.world.currentSectorId;
    const inCeres = !!(state && state.mode === 'flight' && sectorId === CINDER_SLUICE_SECTOR_ID);
    const inPallas = !!(state && state.mode === 'flight' && sectorId === PALLAS_REEF_SECTOR_ID);
    if (!fieldsFlag('enabled') || !(inCeres || inPallas)) {
      this._clear(!(inCeres || inPallas) ? 'inactive_route' : 'fields_disabled');
      return;
    }

    if (inCeres) {
      this._updateCinder(state);
      this._updateKillMachines(state);
    } else {
      this._clearCinder('wrong_sector');
      this._clearKillMachines('wrong_sector');
    }

    if (inPallas) this._updateReef(state);
    else this._clearReef('wrong_sector');
  },

  diagnostics(state = this.state) {
    const record = state && state.sites && state.sites.worldById
      && state.sites.worldById[CINDER_SLUICE_SITE_ID];
    const simTime = simTimeOf(state);
    const machines = KILL_MACHINES.map((machine) => {
      const phase = killMachinePhase(machine, simTime);
      return Object.freeze({
        id: machine.id,
        phase: phase.phase,
        fieldActive: phase.fieldActive,
        remainingS: phase.remainingS,
        playerInside: this._killPlayerInside.has(machine.id),
      });
    });
    if (!record) {
      return Object.freeze({
        siteId: null,
        phase: null,
        machines,
        reef: this._reefDiagnostics(simTime),
      });
    }
    const phase = cinderSluicePhase(record, simTime);
    return Object.freeze({
      siteId: CINDER_SLUICE_SITE_ID,
      phase: phase.phase,
      regulated: phase.regulated,
      remainingS: phase.remainingS,
      fieldRegistered: this._fieldRegistered,
      playerInside: this._playerInside,
      machines,
      reef: this._reefDiagnostics(simTime),
    });
  },

  _reefDiagnostics(simTime) {
    const phase = pallasReefPhase(simTime);
    return Object.freeze({
      siteId: PALLAS_REEF_SITE_ID,
      phase: phase.phase,
      fieldActive: phase.fieldActive,
      remainingS: phase.remainingS,
      fieldRegistered: this._reefFieldRegistered,
      playerInside: this._reefPlayerInside,
    });
  },

  _fieldsSystem() {
    return this.registry && typeof this.registry.get === 'function'
      ? this.registry.get('fields')
      : null;
  },

  _updateCinder(state) {
    const record = state && state.sites && state.sites.worldById
      && state.sites.worldById[CINDER_SLUICE_SITE_ID];
    if (!record) {
      this._clearCinder('site_missing');
      return;
    }

    const phase = cinderSluicePhase(record, simTimeOf(state), this._phaseOut);
    if (phase.fieldActive) this._upsertField(phase);
    else this._removeField();
    this._updatePlayerBoundary(state, phase.fieldActive);
    this._publishPhaseTransition(phase);
  },

  _updateKillMachines(state) {
    const simTime = simTimeOf(state);
    const player = state && state.entities && typeof state.entities.get === 'function'
      ? state.entities.get(state.playerId)
      : null;
    for (const machine of KILL_MACHINES) {
      const phase = killMachinePhase(machine, simTime, this._killPhaseOut);
      if (phase.fieldActive) this._upsertKillMachineFields(machine, phase);
      else this._removeKillMachineFields(machine);
      this._ensureAnvil(machine);
      this._updateKillMachinePlayerBoundary(state, machine, player, phase.fieldActive);
    }
  },

  _updateReef(state) {
    const phase = pallasReefPhase(simTimeOf(state), this._reefPhaseOut);
    if (phase.fieldActive) this._upsertReefField(phase);
    else this._removeReefField();
    this._ensureReef();
    this._updateReefPlayerBoundary(state, phase.fieldActive);
  },

  _upsertReefField(phase) {
    const system = this._fieldsSystem();
    if (!system || typeof system.registerEnvironmental !== 'function') return;
    const live = typeof system.hasExternal === 'function'
      ? system.hasExternal(PALLAS_REEF_FIELD.id)
      : this._reefFieldRegistered;
    if (!live) {
      system.registerEnvironmental({
        ...PALLAS_REEF_FIELD,
        strength: phase.fieldStrength,
        createdAt: simTimeOf(this.state),
      });
      this._reefFieldRegistered = true;
      this._reefFieldStrength = phase.fieldStrength;
      return;
    }
    this._reefFieldRegistered = true;
    if (this._reefFieldStrength === phase.fieldStrength) return;
    this._reefFieldPatch.strength = phase.fieldStrength;
    if (typeof system.updateExternal === 'function') {
      system.updateExternal(PALLAS_REEF_FIELD.id, this._reefFieldPatch);
    }
    this._reefFieldStrength = phase.fieldStrength;
  },

  _removeReefField() {
    const system = this._fieldsSystem();
    const live = system && typeof system.hasExternal === 'function'
      ? system.hasExternal(PALLAS_REEF_FIELD.id)
      : this._reefFieldRegistered;
    if (live && typeof system.unregisterExternal === 'function') {
      system.unregisterExternal(PALLAS_REEF_FIELD.id);
    }
    this._reefFieldRegistered = false;
    this._reefFieldStrength = null;
  },

  _ensureReef() {
    if (this._reefEnsured) return;
    if (!this.bus || typeof this.bus.emit !== 'function') return;
    this.bus.emit('environmentalMachinery:ensureReef', {
      siteId: PALLAS_REEF_SITE_ID,
      sectorId: PALLAS_REEF_SECTOR_ID,
    });
    this._reefEnsured = true;
  },

  _updateReefPlayerBoundary(state, fieldActive) {
    const player = state && state.entities && typeof state.entities.get === 'function'
      ? state.entities.get(state.playerId)
      : null;
    const inside = !!(fieldActive && player && player.alive !== false
      && pointInsidePallasReef(player.pos));
    if (inside === this._reefPlayerInside) return;
    this._reefPlayerInside = inside;
    this._emitHazardBoundary(inside, HAZARD_TYPE, PALLAS_REEF_FIELD.id, PALLAS_REEF_SITE_ID);
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

  _upsertKillMachineFields(machine, phase) {
    const system = this._fieldsSystem();
    if (!system || typeof system.registerEnvironmental !== 'function') return;
    const createdAt = simTimeOf(this.state);
    for (const field of machine.fields) {
      const strength = field.strength * phase.fieldStrengthScale;
      const live = typeof system.hasExternal === 'function'
        ? system.hasExternal(field.id)
        : this._killFieldStrength.has(field.id);
      if (!live) {
        system.registerEnvironmental({
          id: field.id,
          kind: field.kind,
          center: killMachineFieldCenter(machine, field),
          dir: killMachineFieldDir(machine, field),
          radius: field.radius,
          strength,
          falloff: field.falloff,
          halfAngleRad: field.halfAngleRad,
          edgeSoftRad: field.edgeSoftRad,
          halfWidth: field.halfWidth,
          sourceId: machine.id,
          team: null,
          createdAt,
        });
        this._killFieldStrength.set(field.id, strength);
        continue;
      }
      if (this._killFieldStrength.get(field.id) === strength) continue;
      if (typeof system.updateExternal === 'function') {
        system.updateExternal(field.id, { strength });
      }
      this._killFieldStrength.set(field.id, strength);
    }
  },

  _removeKillMachineFields(machine) {
    const system = this._fieldsSystem();
    for (const field of machine.fields) {
      const live = system && typeof system.hasExternal === 'function'
        ? system.hasExternal(field.id)
        : this._killFieldStrength.has(field.id);
      if (live && typeof system.unregisterExternal === 'function') {
        system.unregisterExternal(field.id);
      }
      this._killFieldStrength.delete(field.id);
    }
  },

  _ensureAnvil(machine) {
    const anvilId = machine.anvil.id;
    if (this._anvilsEnsured.has(anvilId)) return;
    if (!this.bus || typeof this.bus.emit !== 'function') return;
    this.bus.emit('environmentalMachinery:ensureAnvil', {
      id: anvilId,
      machineId: machine.id,
      pos: machine.anvil.pos,
      radius: machine.anvil.radius,
      mass: machine.anvil.mass,
    });
    this._anvilsEnsured.add(anvilId);
  },

  _updatePlayerBoundary(state, fieldActive) {
    const player = state && state.entities && typeof state.entities.get === 'function'
      ? state.entities.get(state.playerId)
      : null;
    const inside = !!(fieldActive && player && player.alive !== false
      && pointInsideCinderSluice(player.pos));
    if (inside === this._playerInside) return;
    this._playerInside = inside;
    this._emitHazardBoundary(inside, HAZARD_TYPE, CINDER_SLUICE_FIELD.id, CINDER_SLUICE_SITE_ID);
  },

  _updateKillMachinePlayerBoundary(state, machine, player, fieldActive) {
    const inside = !!(fieldActive && player && player.alive !== false
      && pointInsideKillMachine(machine, player.pos));
    const wasInside = this._killPlayerInside.has(machine.id);
    if (inside === wasInside) return;
    if (inside) this._killPlayerInside.add(machine.id);
    else this._killPlayerInside.delete(machine.id);
    this._emitHazardBoundary(inside, machine.hazardType, machine.id, machine.id);
  },

  _emitHazardBoundary(inside, zoneType, zoneId, siteId, why) {
    if (!this.bus || typeof this.bus.emit !== 'function') return;
    if (inside) {
      this.bus.emit('hazard:enter', { zoneType, zoneId, siteId });
      return;
    }
    this.bus.emit('hazard:exit', { zoneType, zoneId, siteId, why });
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

  _clearCinder(why) {
    this._removeField();
    if (this._playerInside) {
      this._emitHazardBoundary(false, HAZARD_TYPE, CINDER_SLUICE_FIELD.id, CINDER_SLUICE_SITE_ID, why);
    }
    this._playerInside = false;
    this._lastPhase = null;
    this._lastRegulated = null;
  },

  _clearKillMachines(why) {
    for (const machine of KILL_MACHINES) {
      this._removeKillMachineFields(machine);
      if (this._killPlayerInside.has(machine.id)) {
        this._emitHazardBoundary(false, machine.hazardType, machine.id, machine.id, why);
      }
    }
    this._killPlayerInside.clear();
    this._killFieldStrength.clear();
    this._anvilsEnsured.clear();
  },

  _clearReef(why) {
    this._removeReefField();
    if (this._reefPlayerInside) {
      this._emitHazardBoundary(false, HAZARD_TYPE, PALLAS_REEF_FIELD.id, PALLAS_REEF_SITE_ID, why);
    }
    this._reefPlayerInside = false;
    this._reefEnsured = false;
  },

  _clear(why) {
    this._clearCinder(why);
    this._clearKillMachines(why);
    this._clearReef(why);
  },
};

export default environmentalMachinery;
