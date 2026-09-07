// PQ-027 / SF-22 — Cinder Sluice runtime adapter, three Ceres kill machines, the
// Pallas Drift debris reef, Veil/Vesta weather, and the Ceres hangar aperture jam.
// World Site receipts are the durable Cinder Sluice state. The rest is authored furniture
// derived from the saved sim clock plus live occupancy for the jam. This adapter owns no
// saved timer and no movement state: it registers volumes into the ONE field kernel and
// emits hazard-language boundaries. The field kernel/physics membrane remains the only
// force writer. Death is the slam-law payoff against anvils or pinballed mass — never a
// hull-drain aura. The hangar jam holds reinforcements by moving mass, not by a spawn flag.

import { fieldsFlag } from '../data/fields.js';
import {
  CINDER_SLUICE_FIELD,
  CINDER_SLUICE_SECTOR_ID,
  CINDER_SLUICE_SITE_ID,
  KILL_MACHINES,
  PALLAS_REEF_FIELD,
  PALLAS_REEF_SECTOR_ID,
  PALLAS_REEF_SITE_ID,
  APERTURE_FIELDS,
  APERTURE_ID,
  APERTURE_PLUG,
  WEATHER_SECTOR_IDS,
  WEATHER_VOLUMES,
  aperturePhase,
  cinderSluicePhase,
  isApertureOccupant,
  killMachineFieldCenter,
  killMachineFieldDir,
  killMachinePhase,
  pallasReefPhase,
  pointInsideAperture,
  pointInsideCinderSluice,
  pointInsideKillMachine,
  pointInsidePallasReef,
  pointInsideWeatherVolume,
  weatherPhase,
  weatherVolumesForSector,
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
    this._weatherFieldStrength = new Map();
    this._weatherPlayerInside = new Set();
    this._weatherPhaseOut = {};
    this._aperturePhaseOut = {};
    this._apertureFieldStrength = new Map();
    this._aperturePlayerInside = false;
    this._apertureJammedAtS = null;
    this._aperturePlugEnsured = false;
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
    const inWeather = !!(state && state.mode === 'flight' && WEATHER_SECTOR_IDS.has(sectorId));
    if (!fieldsFlag('enabled') || !(inCeres || inPallas || inWeather)) {
      this._clear(!(inCeres || inPallas || inWeather) ? 'inactive_route' : 'fields_disabled');
      return;
    }

    if (inCeres) {
      this._updateCinder(state);
      this._updateKillMachines(state);
      this._updateAperture(state);
    } else {
      this._clearCinder('wrong_sector');
      this._clearKillMachines('wrong_sector');
      this._clearAperture('wrong_sector');
    }

    if (inPallas) this._updateReef(state);
    else this._clearReef('wrong_sector');

    if (inWeather) this._updateWeather(state);
    else this._clearWeather('wrong_sector');
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
        weather: this._weatherDiagnostics(state, simTime),
        aperture: this._apertureDiagnostics(state, simTime),
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
      weather: this._weatherDiagnostics(state, simTime),
      aperture: this._apertureDiagnostics(state, simTime),
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

  _apertureDiagnostics(state, simTime) {
    const phase = aperturePhase(simTime, {
      occupied: this._apertureOccupied(state),
      jammedAtS: this._apertureJammedAtS,
    });
    return Object.freeze({
      id: APERTURE_ID,
      phase: phase.phase,
      fieldActive: phase.fieldActive,
      remainingS: phase.remainingS,
      fieldRegistered: this._apertureFieldStrength.size > 0,
      playerInside: this._aperturePlayerInside,
      jammedAtS: this._apertureJammedAtS,
      occupied: phase.occupied,
    });
  },

  _weatherDiagnostics(state, simTime) {
    const sectorId = state && state.world && state.world.currentSectorId;
    return Object.freeze(weatherVolumesForSector(sectorId).map((volume) => {
      const phase = weatherPhase(volume, simTime);
      return Object.freeze({
        id: volume.id,
        role: volume.role,
        phase: phase.phase,
        fieldActive: phase.fieldActive,
        remainingS: phase.remainingS,
        playerInside: this._weatherPlayerInside.has(volume.id),
      });
    }));
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

  _updateAperture(state) {
    const simTime = simTimeOf(state);
    const occupied = this._apertureOccupied(state);
    if (occupied) {
      if (this._apertureJammedAtS == null) this._apertureJammedAtS = simTime;
    } else if (this._apertureJammedAtS != null) {
      const hold = aperturePhase(simTime, {
        occupied: false,
        jammedAtS: this._apertureJammedAtS,
      });
      if (hold.phase !== 'jam') this._apertureJammedAtS = null;
    }
    const phase = aperturePhase(simTime, {
      occupied,
      jammedAtS: this._apertureJammedAtS,
    }, this._aperturePhaseOut);
    if (phase.fieldActive && phase.fieldStrengthScale > 0) this._upsertApertureFields(phase);
    else this._removeApertureFields();
    const wantPlug = phase.fieldActive && phase.fieldStrengthScale > 0 && !occupied;
    if (wantPlug) this._ensureAperturePlug();
    else this._releaseAperturePlug();
    this._updateAperturePlayerBoundary(state, phase.fieldActive);
  },

  _apertureOccupied(state) {
    const list = state && state.entityList || [];
    for (const entity of list) {
      if (isApertureOccupant(entity)) return true;
    }
    return false;
  },

  _upsertApertureFields(phase) {
    const system = this._fieldsSystem();
    if (!system || typeof system.registerEnvironmental !== 'function') return;
    const createdAt = simTimeOf(this.state);
    for (const field of APERTURE_FIELDS) {
      const strength = field.strength * phase.fieldStrengthScale;
      const live = typeof system.hasExternal === 'function'
        ? system.hasExternal(field.id)
        : this._apertureFieldStrength.has(field.id);
      if (!live) {
        system.registerEnvironmental({
          ...field,
          strength,
          createdAt,
        });
        this._apertureFieldStrength.set(field.id, strength);
        continue;
      }
      if (this._apertureFieldStrength.get(field.id) === strength) continue;
      if (typeof system.updateExternal === 'function') {
        system.updateExternal(field.id, { strength });
      }
      this._apertureFieldStrength.set(field.id, strength);
    }
  },

  _removeApertureFields() {
    const system = this._fieldsSystem();
    for (const field of APERTURE_FIELDS) {
      const live = system && typeof system.hasExternal === 'function'
        ? system.hasExternal(field.id)
        : this._apertureFieldStrength.has(field.id);
      if (live && typeof system.unregisterExternal === 'function') {
        system.unregisterExternal(field.id);
      }
      this._apertureFieldStrength.delete(field.id);
    }
  },

  _ensureAperturePlug() {
    if (this._aperturePlugEnsured) return;
    if (!this.bus || typeof this.bus.emit !== 'function') return;
    this.bus.emit('environmentalMachinery:ensureAperturePlug', {
      id: APERTURE_PLUG.id,
      pos: APERTURE_PLUG.pos,
      radius: APERTURE_PLUG.radius,
      mass: APERTURE_PLUG.mass,
    });
    this._aperturePlugEnsured = true;
  },

  _releaseAperturePlug() {
    if (!this._aperturePlugEnsured) return;
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('environmentalMachinery:releaseAperturePlug', { id: APERTURE_PLUG.id });
    }
    this._aperturePlugEnsured = false;
  },

  _updateAperturePlayerBoundary(state, fieldActive) {
    const player = state && state.entities && typeof state.entities.get === 'function'
      ? state.entities.get(state.playerId)
      : null;
    const inside = !!(fieldActive && player && player.alive !== false
      && pointInsideAperture(player.pos));
    if (inside === this._aperturePlayerInside) return;
    this._aperturePlayerInside = inside;
    this._emitHazardBoundary(inside, HAZARD_TYPE, APERTURE_ID, APERTURE_ID);
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

  _clearAperture(why) {
    this._removeApertureFields();
    this._releaseAperturePlug();
    if (this._aperturePlayerInside) {
      this._emitHazardBoundary(false, HAZARD_TYPE, APERTURE_ID, APERTURE_ID, why);
    }
    this._aperturePlayerInside = false;
    this._apertureJammedAtS = null;
  },

  _clearReef(why) {
    this._removeReefField();
    if (this._reefPlayerInside) {
      this._emitHazardBoundary(false, HAZARD_TYPE, PALLAS_REEF_FIELD.id, PALLAS_REEF_SITE_ID, why);
    }
    this._reefPlayerInside = false;
    this._reefEnsured = false;
  },

  _updateWeather(state) {
    const simTime = simTimeOf(state);
    const sectorId = state && state.world && state.world.currentSectorId;
    const player = state && state.entities && typeof state.entities.get === 'function'
      ? state.entities.get(state.playerId)
      : null;
    for (const volume of weatherVolumesForSector(sectorId)) {
      const phase = weatherPhase(volume, simTime, this._weatherPhaseOut);
      if (phase.fieldActive) this._upsertWeatherField(volume, phase);
      else this._removeWeatherField(volume);
      this._updateWeatherPlayerBoundary(volume, player, phase.fieldActive);
    }
  },

  _upsertWeatherField(volume, phase) {
    const system = this._fieldsSystem();
    if (!system || typeof system.registerEnvironmental !== 'function') return;
    const field = volume.field;
    const strength = field.strength * phase.fieldStrengthScale;
    const live = typeof system.hasExternal === 'function'
      ? system.hasExternal(field.id)
      : this._weatherFieldStrength.has(field.id);
    if (!live) {
      system.registerEnvironmental({
        ...field,
        strength,
        createdAt: simTimeOf(this.state),
      });
      this._weatherFieldStrength.set(field.id, strength);
      return;
    }
    if (this._weatherFieldStrength.get(field.id) === strength) return;
    if (typeof system.updateExternal === 'function') {
      system.updateExternal(field.id, { strength });
    }
    this._weatherFieldStrength.set(field.id, strength);
  },

  _removeWeatherField(volume) {
    const system = this._fieldsSystem();
    const fieldId = volume.field.id;
    const live = system && typeof system.hasExternal === 'function'
      ? system.hasExternal(fieldId)
      : this._weatherFieldStrength.has(fieldId);
    if (live && typeof system.unregisterExternal === 'function') {
      system.unregisterExternal(fieldId);
    }
    this._weatherFieldStrength.delete(fieldId);
  },

  _updateWeatherPlayerBoundary(volume, player, fieldActive) {
    const inside = !!(fieldActive && player && player.alive !== false
      && pointInsideWeatherVolume(volume, player.pos));
    const wasInside = this._weatherPlayerInside.has(volume.id);
    if (inside === wasInside) return;
    if (inside) this._weatherPlayerInside.add(volume.id);
    else this._weatherPlayerInside.delete(volume.id);
    this._emitHazardBoundary(inside, volume.hazardType, volume.id, volume.id);
  },

  _clearWeather(why) {
    for (const volume of WEATHER_VOLUMES) {
      this._removeWeatherField(volume);
      if (this._weatherPlayerInside.has(volume.id)) {
        this._emitHazardBoundary(false, volume.hazardType, volume.id, volume.id, why);
      }
    }
    this._weatherPlayerInside.clear();
    this._weatherFieldStrength.clear();
  },

  _clear(why) {
    this._clearCinder(why);
    this._clearKillMachines(why);
    this._clearAperture(why);
    this._clearReef(why);
    this._clearWeather(why);
  },
};

export default environmentalMachinery;
