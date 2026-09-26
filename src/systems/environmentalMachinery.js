// PQ-027 / SF-22 — Cinder Sluice runtime adapter, three Ceres kill machines, the
// Pallas Drift debris reef, Veil/Vesta weather, and the Ceres hangar aperture jam.
// World Site receipts are the durable Cinder Sluice state. The rest is authored furniture
// derived from the saved sim clock plus live occupancy for the jam. This adapter owns no
// saved timer and no movement state: it registers volumes into the ONE field kernel and
// emits hazard-language boundaries. The field kernel/physics membrane remains the only
// force writer. Death is the slam-law payoff against anvils or pinballed mass — never a
// hull-drain aura. The hangar jam holds reinforcements by moving mass, not by a spawn flag.

import { fieldsFlag } from '../data/fields.js';
import { scalarHitToDamagePacket } from '../combat/damage.js';
import {
  CINDER_SLUICE_FIELD,
  CINDER_SLUICE_SECTOR_ID,
  CINDER_SLUICE_SITE_ID,
  KILL_MACHINES,
  STARTER_FIELD_MACHINE,
  PALLAS_REEF_FIELD,
  PALLAS_REEF_SECTOR_ID,
  PALLAS_REEF_SITE_ID,
  APERTURE_FIELDS,
  APERTURE_ID,
  APERTURE_MOUTH,
  APERTURE_PLUG,
  METRONOME_BEAM_DPS,
  METRONOME_FIELD,
  METRONOME_POI_ID,
  METRONOME_SECTOR_ID,
  aperturePoint,
  WEATHER_SECTOR_IDS,
  WEATHER_VOLUMES,
  VESTA_ORE_WINNOW,
  vestaWinnowPhase,
  aperturePhase,
  cinderSluicePhase,
  isApertureOccupant,
  killMachineFieldCenter,
  killMachineFieldDir,
  killMachinePhase,
  killMachinesForSector,
  metronomeBeamDir,
  metronomeBeamEtaAt,
  pallasReefPhase,
  pointInsideAperture,
  pointInsideCinderSluice,
  pointInsideKillMachine,
  pointInsideMetronomeBeam,
  pointInsidePallasReef,
  pointInsideWeatherVolume,
  weatherPhase,
  weatherVolumesForSector,
} from '../data/environmentalMachinery.js';
import { queryNearbyEntities } from '../core/spatialQuery.js';
import { NEAR_EXIT_PAD_WU } from '../world/activityClassification.js';

const HAZARD_TYPE = 'debris_current';

// The jam occupancy read only needs entities whose centers sit inside the small mouth rectangle.
// One circle covering that rectangle is the whole candidate set; the spatial hash answers it
// without walking the sector list, and the unchanged predicate keeps the exact semantics.
const APERTURE_MOUTH_QUERY = (() => {
  const alongMid = (APERTURE_MOUTH.alongMin + APERTURE_MOUTH.alongMax) * 0.5;
  const center = aperturePoint(alongMid, 0);
  const radius = Math.hypot((APERTURE_MOUTH.alongMax - APERTURE_MOUTH.alongMin) * 0.5, APERTURE_MOUTH.halfWidth) + 4;
  return Object.freeze({ x: center.x, z: center.z, radius });
})();
const APERTURE_OCCUPANT_SCRATCH = [];
const EMPTY_LIST = [];

function apertureOccupantIsLive(state, entity) {
  if (!entity || entity.alive === false) return false;
  const entities = state && state.entities;
  if (entities && typeof entities.get === 'function' && entity.id != null) {
    if (entities.get(entity.id) === entity) return true;
  }
  const list = (state && state.entityList) || EMPTY_LIST;
  for (let i = 0; i < list.length; i++) {
    if (list[i] === entity) return true;
  }
  const index = state && state.entityIndex;
  if (!(index && index.__spacefaceEntityIndexV1 && index.ready === true)) return false;
  const buckets = [index.ships, index.wrecks, index.asteroids];
  for (let b = 0; b < buckets.length; b++) {
    const bucket = buckets[b];
    if (!bucket) continue;
    for (let i = 0; i < bucket.length; i++) {
      if (bucket[i] === entity) return true;
    }
  }
  return false;
}

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
    this._starterMouthId = null;
    this._reefPhaseOut = {};
    this._reefFieldPatch = { strength: 0 };
    this._reefFieldRegistered = false;
    this._reefFieldStrength = null;
    this._reefPlayerInside = false;
    this._reefEnsured = false;
    this._weatherFieldStrength = new Map();
    this._weatherPlayerInside = new Set();
    this._weatherPhaseOut = {};
    this._weatherLastPhase = new Map();
    this._winnowPhaseOut = {};
    this._winnowLastPhase = null;
    this._winnowBanksEnsured = new Set();
    this._aperturePhaseOut = {};
    this._apertureFieldStrength = new Map();
    this._aperturePlayerInside = false;
    this._apertureJammedAtS = null;
    this._aperturePlugEnsured = false;
    this._apertureLastPhase = null;
    this._apertureLastOccupant = null;
    // The Metronome (Eris Margin): a rotating denial cone registered per-tick via one
    // dir patch — the field kernel renormalizes it, presentation reads field.dir live.
    this._metronomeRegistered = false;
    this._metronomePlayerInside = false;
    this._metronomeDirOut = { x: 1, z: 0 };
    this._metronomePatch = { dir: { x: 1, z: 0 } };
    // Perf: true once every machine region has been torn down and nothing is live. The per-tick
    // update() on a route with no environmental machinery (the default) otherwise re-ran the
    // whole _clear family at 60 Hz — dozens of field-system lookups and map ops that were all
    // no-ops. _clear sets it; any active branch clears it.
    this._clearSettled = false;
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
    const inFlight = !!(state && state.mode === 'flight');
    const inCeres = !!(inFlight && sectorId === CINDER_SLUICE_SECTOR_ID);
    const inPallas = !!(inFlight && sectorId === PALLAS_REEF_SECTOR_ID);
    const inWeather = !!(inFlight && WEATHER_SECTOR_IDS.has(sectorId));
    const sectorMachines = inFlight ? killMachinesForSector(sectorId) : EMPTY_LIST;
    const inKill = sectorMachines.length > 0;
    const inMetronome = !!(inFlight && sectorId === METRONOME_SECTOR_ID);
    if (!fieldsFlag('enabled') || !(inCeres || inPallas || inWeather || inKill || inMetronome)) {
      if (this._clearSettled !== true) {
        this._clear(!(inCeres || inPallas || inWeather || inKill || inMetronome) ? 'inactive_route' : 'fields_disabled');
      }
      return;
    }
    this._clearSettled = false;

    if (inCeres) {
      this._updateCinder(state);
      this._updateAperture(state);
    } else {
      this._clearCinder('wrong_sector');
      this._clearAperture('wrong_sector');
    }
    if (inKill) this._updateKillMachines(state, sectorMachines);
    else this._clearKillMachines('wrong_sector');

    if (inPallas) this._updateReef(state);
    else this._clearReef('wrong_sector');

    if (inWeather) this._updateWeather(state);
    else this._clearWeather('wrong_sector');
    if (inFlight && sectorId === VESTA_ORE_WINNOW.sectorId) this._updateWinnow(state);
    else this._clearWinnow();

    if (inMetronome) this._updateMetronome(_dt, state);
    else this._clearMetronome('wrong_sector');
  },

  // The Metronome beam: one rotating denial cone. The sweep is pure simTime math —
  // the kernel patch turns the beam, hazard boundaries speak on edge, and the wedge
  // burns the player through the combat kernel's hazard-radiation origin while the
  // field's own force carries mass out of the sweep. NPC ships and projectiles take
  // the shove through the same field candidates — baiting a patrol into the beam is
  // the authored counterplay; hull burn is player-only, same as every hazard zone.
  _updateMetronome(dt, state) {
    const system = this._fieldsSystem();
    if (!system || typeof system.registerEnvironmental !== 'function') return;
    const simTime = simTimeOf(state);
    const dir = metronomeBeamDir(simTime, this._metronomeDirOut);
    if (this._metronomeRegistered !== true || system.hasExternal(METRONOME_FIELD.id) !== true) {
      system.registerEnvironmental({
        ...METRONOME_FIELD,
        dir: { x: dir.x, z: dir.z },
        createdAt: simTime,
      });
      this._metronomeRegistered = true;
    } else if (typeof system.updateExternal === 'function') {
      const patch = this._metronomePatch;
      patch.dir.x = dir.x;
      patch.dir.z = dir.z;
      system.updateExternal(METRONOME_FIELD.id, patch);
    }
    const player = state && state.entities && typeof state.entities.get === 'function'
      ? state.entities.get(state.playerId)
      : null;
    const inside = !!(player && player.alive !== false && player.pos
      && pointInsideMetronomeBeam(player.pos, simTime));
    if (inside !== this._metronomePlayerInside) {
      this._emitHazardBoundary(inside, HAZARD_TYPE, METRONOME_FIELD.id, METRONOME_POI_ID, undefined, {
        phase: 'sweep',
        remainingS: inside ? 0
          : (player && player.pos ? metronomeBeamEtaAt(player.pos, simTime) : null),
      });
      this._metronomePlayerInside = inside;
    }
    if (inside) this._applyMetronomeBurn(state, player, dt);
  },

  // The authored "radiation damage through the hazard system": a thermal burn with a
  // hazard_radiation origin so the death log names the beam, through the combat
  // kernel's single damage writer. No kernel, no burn — a stub fields system in a
  // probe still gets the sweep without needing combat.
  _applyMetronomeBurn(state, player, dt) {
    const damage = METRONOME_BEAM_DPS * (Number(dt) || 0);
    if (!(damage > 0) || !player || player.alive === false) return;
    const combat = this.registry && typeof this.registry.get === 'function'
      ? this.registry.get('combat')
      : null;
    // Parity with the world radiation route: only route through a kernel bound to THIS state —
    // a divergent combat.state would silently reject the packet as target_missing.
    const live = state || this.state;
    if (!combat || combat.state !== live || typeof combat.ensureKernel !== 'function') return;
    const packet = scalarHitToDamagePacket({
      damage,
      damageType: 'thermal',
      pos: player.pos,
      source: { kind: 'hazard_radiation', hazardId: METRONOME_FIELD.id },
    });
    packet.flags = { ignoreFriendlyFire: true, allowAnyTarget: true };
    combat.ensureKernel().routeDamage({
      attackerId: null,
      targetId: player.id,
      packet,
      origin: { kind: 'hazard_radiation', id: METRONOME_FIELD.id },
    });
  },

  _clearMetronome(why) {
    const system = this._fieldsSystem();
    if (system && typeof system.hasExternal === 'function' && system.hasExternal(METRONOME_FIELD.id)
        && typeof system.unregisterExternal === 'function') {
      system.unregisterExternal(METRONOME_FIELD.id);
    }
    this._metronomeRegistered = false;
    if (this._metronomePlayerInside) {
      this._emitHazardBoundary(false, HAZARD_TYPE, METRONOME_FIELD.id, METRONOME_POI_ID, why);
      this._metronomePlayerInside = false;
    }
  },

  _updateWinnow(state) {
    const machine = VESTA_ORE_WINNOW;
    const phase = vestaWinnowPhase(simTimeOf(state), this._winnowPhaseOut);
    const system = this._fieldsSystem();
    if (!system || typeof system.registerEnvironmental !== 'function') return;
    for (let i = 0; i < machine.fields.length; i++) {
      const field = machine.fields[i];
      const active = i === 0 ? phase.phase === 'gather'
        : phase.phase === 'warning' || phase.phase === 'discharge';
      const strength = phase.phase === 'warning' ? 0 : field.strength;
      if (!active) {
        if (system.hasExternal(field.id)) system.unregisterExternal(field.id);
      } else if (!system.hasExternal(field.id)) {
        system.registerEnvironmental({ ...field, strength, createdAt: simTimeOf(state) });
      } else if (this._winnowLastPhase !== phase.phase) {
        system.updateExternal(field.id, { strength });
      }
    }
    if (this._winnowLastPhase !== phase.phase) {
      this._emitPhaseChanged({ siteId: machine.id, kind: 'winnow',
        previous: this._winnowLastPhase, phase: phase.phase, remainingS: phase.remainingS });
      this._winnowLastPhase = phase.phase;
    }
    const active = state.world.activeSector;
    for (const bank of machine.furniture) {
      if (this._winnowBanksEnsured.has(bank.id) || !this.bus?.emit) continue;
      this.bus.emit('environmentalMachinery:ensureAnvil', {
        id: bank.id, machineId: machine.id, pos: bank.pos, radius: bank.radius, mass: 12000,
      });
      this._winnowBanksEnsured.add(bank.id);
    }
    const sector = state.world.sectors && state.world.sectors[machine.sectorId];
    const world = this.registry && this.registry.get('world');
    if (!active || state.world.currentSectorId !== machine.sectorId || !sector || !world?._spawnPlaceProp) return;
    for (const bank of machine.furniture) {
      // The active sector owns furniture lifetime. Docking clears forces, not its rows.
      if ((active.dressing || []).some((row) => row.environmentalMachineryId === bank.id)) continue;
      const entity = world._spawnPlaceProp(active, sector, bank.placeId, bank.pos, {
        rot: bank.rot, radius: bank.radius, name: 'Ore Winnow', worldOneOff: true,
      });
      if (entity) {
        const row = active.dressing.find((item) => item.id === entity.id);
        if (row) row.environmentalMachineryId = bank.id;
      }
    }
  },

  _clearWinnow() {
    const system = this._fieldsSystem();
    for (const field of VESTA_ORE_WINNOW.fields) {
      if (system && system.hasExternal(field.id)) system.unregisterExternal(field.id);
    }
    this._winnowLastPhase = null;
    this._winnowBanksEnsured.clear();
  },

  diagnostics(state = this.state) {
    const record = state && state.sites && state.sites.worldById
      && state.sites.worldById[CINDER_SLUICE_SITE_ID];
    const simTime = simTimeOf(state);
    const machines = [...KILL_MACHINES, STARTER_FIELD_MACHINE].map((machine) => {
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
        metronome: this._metronomeDiagnostics(simTime),
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
      metronome: this._metronomeDiagnostics(simTime),
    });
  },

  _metronomeDiagnostics(simTime) {
    const dir = metronomeBeamDir(simTime, this._metronomeDirOut);
    return Object.freeze({
      id: METRONOME_FIELD.id,
      beamBearingDeg: Math.round((Math.atan2(dir.z, dir.x) * 180 / Math.PI) * 10) / 10,
      fieldRegistered: this._metronomeRegistered === true,
      playerInside: this._metronomePlayerInside === true,
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

  _updateKillMachines(state, machines) {
    const simTime = simTimeOf(state);
    const player = state && state.entities && typeof state.entities.get === 'function'
      ? state.entities.get(state.playerId)
      : null;
    const live = machines || KILL_MACHINES;
    this._retireKillMachinesOutside(live);
    for (const machine of live) {
      const phase = killMachinePhase(machine, simTime, this._killPhaseOut);
      if (phase.fieldActive) this._upsertKillMachineFields(machine, phase);
      else this._removeKillMachineFields(machine);
      this._ensureAnvil(machine);
      this._ensureStarterMouth(machine);
      this._updateKillMachinePlayerBoundary(state, machine, player, phase.fieldActive);
    }
  },

  _retireKillMachinesOutside(live) {
    const keep = new Set();
    for (const machine of live) keep.add(machine.id);
    for (const machine of [...KILL_MACHINES, STARTER_FIELD_MACHINE]) {
      if (keep.has(machine.id)) continue;
      this._removeKillMachineFields(machine);
      if (this._killPlayerInside.has(machine.id)) {
        this._emitHazardBoundary(false, machine.hazardType, machine.id, machine.id, 'wrong_sector');
        this._killPlayerInside.delete(machine.id);
      }
    }
    if (!keep.has(STARTER_FIELD_MACHINE.id)) this._starterMouthId = null;
  },

  // The jaw is an existing kit body. World already knows how to place one; this adapter
  // asks once per visit, and only for the starter cracker, so Ceres mouths stay as they are.
  _ensureStarterMouth(machine) {
    if (!machine || machine.id !== STARTER_FIELD_MACHINE.id || this._starterMouthId) return;
    const world = this.registry && typeof this.registry.get === 'function'
      ? this.registry.get('world')
      : null;
    const active = this.state && this.state.world && this.state.world.activeSector;
    const sector = this.state && this.state.world && this.state.world.sectors
      ? this.state.world.sectors[machine.sectorId]
      : null;
    if (!world || typeof world._spawnPlaceProp !== 'function' || !active || !sector) return;
    if (this.state.world.currentSectorId !== machine.sectorId) return;
    const existing = (active.dressing || []).find((row) => row.environmentalMachineryId === machine.id);
    if (existing) {
      this._starterMouthId = existing.id;
      return;
    }
    const ent = world._spawnPlaceProp(active, sector, machine.placeId, {
      x: machine.globalPos.x,
      z: machine.globalPos.z,
    }, {
      rot: machine.rot,
      name: 'Claim Cracker',
      radius: 18,
      worldOneOff: true,
    });
    if (ent && ent.id != null) {
      this._starterMouthId = ent.id;
      const row = (active.dressing || []).find((item) => item.id === ent.id);
      if (row) row.environmentalMachineryId = machine.id;
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
    if (phase.fieldActive) this._upsertApertureFields(phase);
    else this._removeApertureFields();
    const wantPlug = phase.fieldActive && phase.fieldStrengthScale > 0 && !occupied;
    if (wantPlug) this._ensureAperturePlug();
    else this._releaseAperturePlug();
    this._publishAperturePhase(phase);
    this._updateAperturePlayerBoundary(state, phase);
  },

  _apertureOccupied(state) {
    // The hash only holds activity-classified bodies, and the mouth is a fixed world point:
    // when the player is far enough away that the mouth lies outside the classify bubble, a
    // parked occupant is dormant and absent from the hash. Gate the query on coverage —
    // mouth circle inside the classify circle — and scan occupant-type buckets when it is not.
    const player = state && state.entities && typeof state.entities.get === 'function'
      ? state.entities.get(state.playerId)
      : null;
    const reach = state && state.activityRuntime && Number.isFinite(state.activityRuntime.physicsReachWu)
      ? state.activityRuntime.physicsReachWu + NEAR_EXIT_PAD_WU
      : 0;
    const mouthDist = player && player.pos
      ? Math.hypot(player.pos.x - APERTURE_MOUTH_QUERY.x, player.pos.z - APERTURE_MOUTH_QUERY.z)
      : Infinity;
    const covered = mouthDist + APERTURE_MOUTH_QUERY.radius <= reach;
    if (covered) {
      const nearby = queryNearbyEntities(
        state,
        APERTURE_MOUTH_QUERY,
        APERTURE_MOUTH_QUERY.radius,
        APERTURE_OCCUPANT_SCRATCH,
      );
      for (let i = 0; i < nearby.length; i++) {
        const entity = nearby[i];
        if (isApertureOccupant(entity)) {
          this._apertureLastOccupant = entity;
          return true;
        }
      }
      this._apertureLastOccupant = null;
      return false;
    }
    // Off-hash: a parked occupant is dormant and missing from the classify bubble.
    // Do not walk rocks, FX, or projectiles — only the three occupant types.
    const last = this._apertureLastOccupant;
    if (last && isApertureOccupant(last) && apertureOccupantIsLive(state, last)) return true;
    this._apertureLastOccupant = null;
    const index = state && state.entityIndex;
    const ready = !!(index && index.__spacefaceEntityIndexV1 && index.ready === true);
    const buckets = ready
      ? [index.ships, index.wrecks, index.asteroids]
      : [(state && state.entityList) || EMPTY_LIST];
    for (let b = 0; b < buckets.length; b++) {
      const list = buckets[b];
      if (!list) continue;
      for (let i = 0; i < list.length; i++) {
        const entity = list[i];
        if (isApertureOccupant(entity)) {
          this._apertureLastOccupant = entity;
          return true;
        }
      }
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

  _updateAperturePlayerBoundary(state, phase) {
    const player = state && state.entities && typeof state.entities.get === 'function'
      ? state.entities.get(state.playerId)
      : null;
    const watching = !!(player && player.alive !== false && pointInsideAperture(player.pos)
      && (phase.fieldActive || phase.phase === 'open' || phase.phase === 'jam'));
    if (watching === this._aperturePlayerInside) return;
    this._aperturePlayerInside = watching;
    this._emitHazardBoundary(watching, HAZARD_TYPE, APERTURE_ID, APERTURE_ID, undefined, {
      remainingS: phase.remainingS,
      phase: phase.phase,
    });
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

  _emitHazardBoundary(inside, zoneType, zoneId, siteId, why, extras) {
    if (!this.bus || typeof this.bus.emit !== 'function') return;
    if (inside) {
      this.bus.emit('hazard:enter', {
        zoneType,
        zoneId,
        siteId,
        remainingS: extras && Number.isFinite(extras.remainingS) ? extras.remainingS : null,
        phase: extras && extras.phase ? extras.phase : null,
      });
      return;
    }
    this.bus.emit('hazard:exit', { zoneType, zoneId, siteId, why });
  },

  _publishPhaseTransition(phase) {
    if (phase.phase === this._lastPhase && phase.regulated === this._lastRegulated) return;
    const previous = this._lastPhase;
    this._lastPhase = phase.phase;
    this._lastRegulated = phase.regulated;
    this._emitPhaseChanged({
      siteId: CINDER_SLUICE_SITE_ID,
      kind: 'current',
      previous,
      phase: phase.phase,
      regulated: phase.regulated,
      remainingS: phase.remainingS,
    });
  },

  _publishWeatherPhase(volume, phase) {
    const previous = this._weatherLastPhase.get(volume.id);
    if (previous === phase.phase) return;
    this._weatherLastPhase.set(volume.id, phase.phase);
    this._emitPhaseChanged({
      siteId: volume.id,
      kind: 'weather',
      role: volume.role,
      previous: previous || null,
      phase: phase.phase,
      remainingS: phase.remainingS,
    });
  },

  _publishAperturePhase(phase) {
    if (this._apertureLastPhase === phase.phase) return;
    const previous = this._apertureLastPhase;
    this._apertureLastPhase = phase.phase;
    this._emitPhaseChanged({
      siteId: APERTURE_ID,
      kind: 'aperture',
      previous,
      phase: phase.phase,
      remainingS: phase.remainingS,
      occupied: phase.occupied,
    });
  },

  _emitPhaseChanged(payload) {
    if (!this.bus || typeof this.bus.emit !== 'function') return;
    this.bus.emit('environmentalMachinery:phaseChanged', payload);
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
    for (const machine of [...KILL_MACHINES, STARTER_FIELD_MACHINE]) {
      this._removeKillMachineFields(machine);
      if (this._killPlayerInside.has(machine.id)) {
        this._emitHazardBoundary(false, machine.hazardType, machine.id, machine.id, why);
      }
    }
    this._killPlayerInside.clear();
    this._killFieldStrength.clear();
    this._anvilsEnsured.clear();
    this._starterMouthId = null;
  },

  _clearAperture(why) {
    this._removeApertureFields();
    this._releaseAperturePlug();
    if (this._aperturePlayerInside) {
      this._emitHazardBoundary(false, HAZARD_TYPE, APERTURE_ID, APERTURE_ID, why);
    }
    this._aperturePlayerInside = false;
    this._apertureJammedAtS = null;
    this._apertureLastPhase = null;
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
      this._publishWeatherPhase(volume, phase);
      this._updateWeatherPlayerBoundary(volume, player, phase);
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

  _updateWeatherPlayerBoundary(volume, player, phase) {
    const inside = !!(phase.fieldActive && player && player.alive !== false
      && pointInsideWeatherVolume(volume, player.pos));
    const wasInside = this._weatherPlayerInside.has(volume.id);
    if (inside === wasInside) return;
    if (inside) this._weatherPlayerInside.add(volume.id);
    else this._weatherPlayerInside.delete(volume.id);
    this._emitHazardBoundary(inside, volume.hazardType, volume.id, volume.id, undefined, {
      remainingS: phase.remainingS,
      phase: phase.phase,
    });
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
    this._weatherLastPhase.clear();
  },

  _clear(why) {
    this._clearWinnow();
    this._clearCinder(why);
    this._clearKillMachines(why);
    this._clearAperture(why);
    this._clearReef(why);
    this._clearWeather(why);
    this._clearMetronome(why);
    this._clearSettled = true;
  },
};

export default environmentalMachinery;
