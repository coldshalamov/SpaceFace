// PR95 Plan 19 — one physical, always-on Gravity Eddy at the Orcus Signal.
//
// The eddy is a small authored WELL in the shared fields kernel. That kernel owns coupling,
// acceleration bounds, projectile/loose-body response, and the SG-02 additive impulse membrane;
// this adapter never writes position or velocity and contains no force equation of its own.
// `registerEnvironmental` also gives the eddy the existing world-space Well presentation instead
// of inventing a second visual vocabulary.
//
// Lifecycle is deliberately transient. Sector/new/load boundaries unregister it immediately and
// the next active Orcus tick re-resolves the canonical zone and re-registers it. Missing Atlas
// identity fails closed. All values derive from authored data + state.simTime; no RNG or wall time.

import { ORCUS_GRAVITY_EDDY, anomalySiteForSector } from '../data/anomalySites.js';
import { fieldsFlag } from '../data/fields.js';
import { sectorLocalToGlobalForSector } from '../data/sectorCoordinates.js';
import { SECTOR_ZONES } from '../data/sectorZones.js';

function simTimeOf(state) {
  return Number.isFinite(state && state.simTime)
    ? state.simTime
    : Math.max(0, Number(state && state.tick) || 0) / 60;
}

function resolveAnchor(site) {
  const zones = site && SECTOR_ZONES[site.sectorId];
  const zone = Array.isArray(zones)
    ? zones.find((candidate) => candidate && candidate.id === site.zoneId)
    : null;
  if (!zone || !zone.center) return null;
  const global = sectorLocalToGlobalForSector(zone.center, site.sectorId);
  if (!global || !Number.isFinite(global.x) || !Number.isFinite(global.z)) return null;
  return { x: global.x, z: global.z };
}

export const anomalyRuntime = {
  name: 'anomalyRuntime',

  init(ctx) {
    for (const unsub of this._unsubs || []) unsub();
    this._unsubs = [];
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.registry = ctx.registry || null;
    this._registered = false;
    this._anchor = { x: 0, z: 0 };
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
    const site = anomalySiteForSector(sectorId);
    const activeRoute = fieldsFlag('enabled') && state && state.mode === 'flight';
    if (!activeRoute || !site) {
      this._clear(!site ? 'inactive_sector' : 'inactive_route');
      return;
    }

    // Re-resolve every active tick. This makes Atlas identity the live authority and fails closed
    // immediately if the zone disappears rather than letting a stale private coordinate persist.
    const anchor = resolveAnchor(site);
    if (!anchor) {
      this._clear('zone_missing');
      return;
    }
    this._anchor.x = anchor.x;
    this._anchor.z = anchor.z;

    const fields = this._fieldsSystem();
    if (!fields || typeof fields.registerEnvironmental !== 'function') {
      this._registered = false;
      return;
    }
    const live = typeof fields.hasExternal === 'function'
      ? fields.hasExternal(site.field.id)
      : this._registered;
    if (live) {
      this._registered = true;
      return;
    }

    fields.registerEnvironmental({
      ...site.field,
      center: { x: anchor.x, z: anchor.z },
      sourceId: site.id,
      ownerId: null,
      team: null,
      createdAt: simTimeOf(state),
    });
    this._registered = typeof fields.hasExternal === 'function'
      ? fields.hasExternal(site.field.id)
      : true;
    if (this._registered && this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('anomaly:registered', {
        anomalyId: site.id,
        poiId: site.poiId,
        zoneId: site.zoneId,
        fieldId: site.field.id,
        center: { x: anchor.x, z: anchor.z },
        presentation: 'environmental_well',
      });
    }
  },

  diagnostics() {
    const fields = this._fieldsSystem();
    const live = fields && typeof fields.hasExternal === 'function'
      ? fields.hasExternal(ORCUS_GRAVITY_EDDY.field.id)
      : this._registered;
    return Object.freeze({
      anomalyId: ORCUS_GRAVITY_EDDY.id,
      zoneId: ORCUS_GRAVITY_EDDY.zoneId,
      fieldId: ORCUS_GRAVITY_EDDY.field.id,
      registered: !!live,
      center: Object.freeze({ x: this._anchor.x, z: this._anchor.z }),
    });
  },

  _fieldsSystem() {
    return this.registry && typeof this.registry.get === 'function'
      ? this.registry.get('fields')
      : null;
  },

  _clear(why) {
    const fields = this._fieldsSystem();
    const live = fields && typeof fields.hasExternal === 'function'
      ? fields.hasExternal(ORCUS_GRAVITY_EDDY.field.id)
      : this._registered;
    if (live && fields && typeof fields.unregisterExternal === 'function') {
      fields.unregisterExternal(ORCUS_GRAVITY_EDDY.field.id);
    }
    if (this._registered && this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('anomaly:unregistered', {
        anomalyId: ORCUS_GRAVITY_EDDY.id,
        fieldId: ORCUS_GRAVITY_EDDY.field.id,
        why,
      });
    }
    this._registered = false;
  },
};

export default anomalyRuntime;
