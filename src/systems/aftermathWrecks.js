// aftermathWrecks.js - BP-01/C11 Battle-Aftermath Persistence.
//
// Event-sourced battle residue. Live `entity:killed` events inside named sector zones become
// bounded, durable aftermath markers. On sector entry those markers materialize as ordinary wreck
// entities so the shipped scanner/mining/salvage-action paths can read them without combat,
// salvage, or sectorSim edits.

import { hash32 } from '../core/rng.js';
import { zoneAt, zoneThreat } from '../data/sectorZones.js';
import { globalToSectorLocalForSector } from '../data/sectorCoordinates.js';
import { wreckClassById } from '../data/wreckClasses.js';

const STATE_VERSION = 1;
const MAX_PER_SECTOR = 8;
const MAX_SPAWNED_PER_SECTOR = 6;
const WRECK_RADIUS = 9;
const WRECK_SALVAGE_TIME = 8;
const SHIPLIKE_TYPES = new Set(['ship', 'drone']);
const DEFAULT_POOL = Object.freeze({ cmdty_scrap_metal: 3, cmdty_salvage_electronics: 1 });

function clonePlain(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

export function ensureAftermathState(state) {
  if (!state) return null;
  if (!state.aftermathWrecks || typeof state.aftermathWrecks !== 'object') {
    state.aftermathWrecks = { schemaVersion: STATE_VERSION, bySector: {}, seed: seedOf(state) };
  }
  const own = state.aftermathWrecks;
  own.schemaVersion = STATE_VERSION;
  if (!own.bySector || typeof own.bySector !== 'object' || Array.isArray(own.bySector)) own.bySector = {};
  if (typeof own.seed !== 'number') own.seed = seedOf(state);
  return own;
}

export function aftermathForSector(state, sectorId) {
  const own = ensureAftermathState(state);
  if (!own || !sectorId || !Array.isArray(own.bySector[sectorId])) return [];
  return own.bySector[sectorId].slice();
}

function seedOf(state) {
  return (state && state.meta && state.meta.seed >>> 0) || 1;
}

function entityFor(state, id) {
  if (id == null || !state || !state.entities || typeof state.entities.get !== 'function') return null;
  return state.entities.get(id) || null;
}

function posFrom(payload, entity) {
  const pos = payload && payload.pos || entity && entity.pos;
  if (!pos) return null;
  const x = Number(pos.x);
  const z = Number(pos.z);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  return { x, z };
}

function sectorIdFrom(state, payload) {
  return payload && payload.sectorId || state && state.world && state.world.currentSectorId || null;
}

function markerIdFor(state, sectorId, payload) {
  const victimId = payload && (payload.id != null ? payload.id : payload.entityId);
  return 'aft_' + hash32(seedOf(state), sectorId, victimId, payload && payload.killerId, state && state.tick || 0, 'aftermath').toString(36);
}

function victimClassFor(entity, payload) {
  const data = entity && entity.data || {};
  return payload && payload.victimClass || data.shipClass || data.defId || entity && entity.type || 'ship';
}

function victimLabelFor(entity, payload) {
  const data = entity && entity.data || {};
  return data.name || data.shipName || data.callsign || data.callSign || payload && payload.label || victimClassFor(entity, payload);
}

function classForVictim(victimClass) {
  const key = String(victimClass || '').toLowerCase();
  if (key.includes('patrol') || key.includes('law') || key.includes('military')) return 'military';
  if (key.includes('drone')) return 'fresh';
  return 'battlefield';
}

function poolForMarker(marker) {
  const cls = marker && marker.victimClass || '';
  if (String(cls).toLowerCase().includes('drone')) return { cmdty_scrap_metal: 2, cmdty_ore_iron: 1 };
  if (marker && marker.wreckClass === 'military') {
    return { cmdty_scrap_metal: 2, cmdty_salvage_electronics: 2 };
  }
  return { ...DEFAULT_POOL };
}

function aftermathLine(marker) {
  const zone = marker.zoneName || 'a local zone';
  const victim = marker.victimLabel || marker.victimClass || 'ship';
  return `${victim} destroyed in ${zone}; black box lists killer ${marker.killerId == null ? 'unknown' : marker.killerId}.`;
}

function newsLine(marker) {
  const zone = marker.zoneName || 'a local zone';
  const victim = marker.victimClass || 'ship';
  return `Aftermath reported in ${zone}: ${victim} wreckage now drifting on the lane.`;
}

function makeMarker(state, payload, entity) {
  const sectorId = sectorIdFrom(state, payload);
  if (!sectorId) return null;
  const pos = posFrom(payload, entity);
  if (!pos) return null;
  const local = globalToSectorLocalForSector(pos, sectorId);
  const zone = zoneAt(sectorId, local.x, local.z);
  if (!zone) return null;
  const type = entity && entity.type || payload && payload.type;
  if (!SHIPLIKE_TYPES.has(type)) return null;
  const victimId = entity && entity.id != null ? entity.id : payload && payload.id;
  if (victimId == null || victimId === state.playerId) return null;

  const victimClass = victimClassFor(entity, payload);
  const wreckClass = classForVictim(victimClass);
  const cls = wreckClassById(wreckClass) || wreckClassById('battlefield');
  return {
    schemaVersion: STATE_VERSION,
    markerId: markerIdFor(state, sectorId, { ...payload, id: victimId }),
    sectorId,
    zoneId: zone.id,
    zoneName: zone.name || zone.id,
    zoneType: zone.type || null,
    zoneThreat: zoneThreat(zone),
    pos,
    victimId,
    victimClass,
    victimLabel: victimLabelFor(entity, payload),
    victimFactionId: entity && entity.factionId || payload && payload.factionId || null,
    killerId: payload && payload.killerId != null ? payload.killerId : null,
    tick: state.tick || 0,
    t: Number(state.simTime || 0),
    wreckClass: cls ? cls.id : 'battlefield',
    wreckClassLabel: cls ? cls.label : 'Battlefield Wreck',
    source: 'entity:killed',
  };
}

function rememberMarker(state, bus, marker) {
  const own = ensureAftermathState(state);
  if (!own || !marker || !marker.sectorId || !marker.markerId) return null;
  const arr = own.bySector[marker.sectorId] || (own.bySector[marker.sectorId] = []);
  if (arr.some((item) => item && item.markerId === marker.markerId)) return marker;
  arr.unshift(marker);
  if (arr.length > MAX_PER_SECTOR) arr.length = MAX_PER_SECTOR;
  if (bus && typeof bus.emit === 'function') {
    const headline = newsLine(marker);
    bus.emit('aftermathWreck:recorded', clonePlain(marker));
    bus.emit('news:headline', {
      headline,
      text: headline,
      kind: 'battle-aftermath',
      sectorId: marker.sectorId,
      zoneId: marker.zoneId,
      zoneName: marker.zoneName,
      markerId: marker.markerId,
    });
  }
  return marker;
}

function normalizeMarker(input) {
  if (!input || typeof input !== 'object') return null;
  if (!input.markerId || !input.sectorId || !input.pos) return null;
  const x = Number(input.pos.x);
  const z = Number(input.pos.z);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  const marker = {
    schemaVersion: STATE_VERSION,
    markerId: String(input.markerId),
    sectorId: String(input.sectorId),
    zoneId: input.zoneId || null,
    zoneName: input.zoneName || input.zoneId || 'Unknown Zone',
    zoneType: input.zoneType || null,
    zoneThreat: Number.isFinite(input.zoneThreat) ? input.zoneThreat : 0,
    pos: { x, z },
    victimId: input.victimId == null ? null : input.victimId,
    victimClass: input.victimClass || 'ship',
    victimLabel: input.victimLabel || input.victimClass || 'ship',
    victimFactionId: input.victimFactionId || null,
    killerId: input.killerId == null ? null : input.killerId,
    tick: Number.isFinite(input.tick) ? input.tick : 0,
    t: Number.isFinite(input.t) ? input.t : 0,
    wreckClass: input.wreckClass || 'battlefield',
    wreckClassLabel: input.wreckClassLabel || 'Battlefield Wreck',
    source: input.source || 'entity:killed',
  };
  return marker;
}

function trimAndSort(markers) {
  return markers
    .map(normalizeMarker)
    .filter(Boolean)
    .sort((a, b) => (b.tick - a.tick) || (b.t - a.t) || String(a.markerId).localeCompare(String(b.markerId)))
    .slice(0, MAX_PER_SECTOR);
}

export const aftermathWrecks = {
  name: 'aftermathWrecks',

  init(ctx) {
    this.state = ctx && ctx.state;
    this.bus = ctx && ctx.bus;
    this.helpers = ctx && ctx.helpers || {};
    this._spawned = new Map();
    ensureAftermathState(this.state);

    this._onKilled = (payload) => this._recordKill(payload || {});
    this._onSectorEnter = (payload) => this._spawnForSector(payload && payload.sectorId);
    this._onSectorExit = (payload) => this._clearLiveRefs(payload && payload.sectorId);
    this._onSalvageCompleted = (payload) => this._completeByEntity(payload && payload.wreckId);
    this._onNewGame = () => this.newGame();
    this._onSaveLoaded = () => {
      this._spawned.clear();
      this._spawnForSector(this.state && this.state.world && this.state.world.currentSectorId);
    };

    if (this.bus && typeof this.bus.on === 'function') {
      this.bus.on('entity:killed', this._onKilled);
      this.bus.on('sector:enter', this._onSectorEnter);
      this.bus.on('sector:exit', this._onSectorExit);
      this.bus.on('salvage:completed', this._onSalvageCompleted);
      this.bus.on('game:newGame', this._onNewGame);
      this.bus.on('save:loaded', this._onSaveLoaded);
    }
  },

  newGame() {
    if (this.state) this.state.aftermathWrecks = { schemaVersion: STATE_VERSION, bySector: {}, seed: seedOf(this.state) };
    if (this._spawned) this._spawned.clear();
  },

  _recordKill(payload) {
    const entity = entityFor(this.state, payload.id);
    const marker = makeMarker(this.state, payload, entity);
    return rememberMarker(this.state, this.bus, marker);
  },

  _spawnForSector(sectorId) {
    const state = this.state;
    if (!state || !sectorId || !this.helpers || typeof this.helpers.spawnEntity !== 'function') return 0;
    const markers = aftermathForSector(state, sectorId).slice(0, MAX_SPAWNED_PER_SECTOR);
    let count = 0;
    for (const marker of markers) {
      const existingId = this._spawned.get(marker.markerId);
      if (existingId != null && entityFor(state, existingId)) continue;
      const entity = this.helpers.spawnEntity(this._specForMarker(marker));
      if (!entity) continue;
      this._spawned.set(marker.markerId, entity.id);
      count++;
      if (this.bus && typeof this.bus.emit === 'function') {
        this.bus.emit('aftermathWreck:spawned', {
          markerId: marker.markerId,
          entityId: entity.id,
          sectorId,
          zoneId: marker.zoneId,
        });
      }
    }
    return count;
  },

  _specForMarker(marker) {
    const cls = wreckClassById(marker.wreckClass) || wreckClassById('battlefield');
    const line = aftermathLine(marker);
    return {
      type: 'wreck',
      pos: { x: marker.pos.x, z: marker.pos.z },
      radius: WRECK_RADIUS,
      mass: 1e6,
      hull: 1,
      hullMax: 1,
      data: {
        parentType: marker.wreckClass === 'military' ? 'military' : 'ship',
        loot: [],
        salvagePool: poolForMarker(marker),
        salvageTimeLeft: WRECK_SALVAGE_TIME,
        scanLabel: cls ? cls.scanLabel : 'Battle-scarred Hulk',
        wreckClass: marker.wreckClass || 'battlefield',
        wreckClassLabel: cls ? cls.label : marker.wreckClassLabel || 'Battlefield Wreck',
        wreckClassBlurb: cls ? cls.blurb : null,
        provenanceLine: line,
        provenance: {
          source: 'battle-aftermath',
          markerId: marker.markerId,
          sectorId: marker.sectorId,
          zoneId: marker.zoneId,
          zoneName: marker.zoneName,
          victimClass: marker.victimClass,
          victimLabel: marker.victimLabel,
          victimFactionId: marker.victimFactionId,
          killerId: marker.killerId,
          tick: marker.tick,
        },
        aftermath: clonePlain(marker),
      },
    };
  },

  _clearLiveRefs(sectorId) {
    if (!sectorId || !this._spawned) {
      if (this._spawned) this._spawned.clear();
      return;
    }
    const markers = aftermathForSector(this.state, sectorId);
    for (const marker of markers) this._spawned.delete(marker.markerId);
  },

  _completeByEntity(wreckId) {
    if (wreckId == null || !this._spawned || !this.state) return false;
    let markerId = null;
    for (const [mid, eid] of this._spawned.entries()) {
      if (eid === wreckId) {
        markerId = mid;
        break;
      }
    }
    if (!markerId) return false;
    const own = ensureAftermathState(this.state);
    for (const sectorId of Object.keys(own.bySector)) {
      const before = own.bySector[sectorId] || [];
      const after = before.filter((marker) => marker && marker.markerId !== markerId);
      if (after.length !== before.length) {
        own.bySector[sectorId] = after;
        this._spawned.delete(markerId);
        if (this.bus && typeof this.bus.emit === 'function') {
          this.bus.emit('aftermathWreck:completed', { markerId, wreckId, sectorId });
        }
        return true;
      }
    }
    return false;
  },

  serialize() {
    const own = ensureAftermathState(this.state);
    const bySector = {};
    for (const sectorId of Object.keys(own.bySector)) {
      const markers = trimAndSort(Array.isArray(own.bySector[sectorId]) ? own.bySector[sectorId] : []);
      if (markers.length) bySector[sectorId] = markers;
    }
    return { schemaVersion: STATE_VERSION, seed: own.seed, bySector };
  },

  deserialize(data) {
    const own = ensureAftermathState(this.state);
    own.seed = data && typeof data.seed === 'number' ? data.seed >>> 0 : seedOf(this.state);
    own.bySector = {};
    const bySector = data && data.bySector && typeof data.bySector === 'object' ? data.bySector : {};
    for (const sectorId of Object.keys(bySector)) {
      const markers = trimAndSort(Array.isArray(bySector[sectorId]) ? bySector[sectorId] : []);
      if (markers.length) own.bySector[sectorId] = markers;
    }
    if (this._spawned) this._spawned.clear();
  },

  destroy() {
    if (this.bus && typeof this.bus.off === 'function') {
      if (this._onKilled) this.bus.off('entity:killed', this._onKilled);
      if (this._onSectorEnter) this.bus.off('sector:enter', this._onSectorEnter);
      if (this._onSectorExit) this.bus.off('sector:exit', this._onSectorExit);
      if (this._onSalvageCompleted) this.bus.off('salvage:completed', this._onSalvageCompleted);
      if (this._onNewGame) this.bus.off('game:newGame', this._onNewGame);
      if (this._onSaveLoaded) this.bus.off('save:loaded', this._onSaveLoaded);
    }
    this._onKilled = this._onSectorEnter = this._onSectorExit = null;
    this._onSalvageCompleted = this._onNewGame = this._onSaveLoaded = null;
    if (this._spawned) this._spawned.clear();
  },
};

export default aftermathWrecks;
