// Row 445 GOLD-HOME — the Long Berth: tow the abandoned yard tug to a claim, restore it in
// three paid stages, and keep towed trophies parked in its yard across reload.
//
// Single-writer contracts: credits move through `economy:chargeCredits`, cargo through cargo's
// own API via a `longBerth:pay` receipt the system settles itself (no foreign-state writes).
// The berth marker is a normal station entity — it docks through the real dock:range gate and
// the stock station shell; `state.longBerth` is this system's sole write.
import {
  LONG_BERTH_ONEOFF_ID, LONG_BERTH_STATION_ID, LONG_BERTH_NAME,
  BERTH_CLAIM_RANGE_WU, BERTH_YARD_RADIUS_WU, BERTH_DOCK_RADIUS_WU, BERTH_MARKER_OFFSET_WU,
  BERTH_STAGES, berthStageDef, berthGrant, berthTrophyLabel,
} from '../data/longBerth.js';
import { STATION_INFO } from './missions.js';
import { removeCargo } from './cargo.js';

const SCAN_S = 1.0;
const TOW_SPEED_EPS = 8; // WU/s — the tug must be parked before the claim holds

function ensureSlice(state) {
  const lb = state.longBerth || (state.longBerth = { version: 1 });
  if (lb.claimed !== true) lb.claimed = false;
  if (!Number.isFinite(lb.stage)) lb.stage = 0;
  if (!Array.isArray(lb.trophies)) lb.trophies = [];
  if (!Array.isArray(lb.crew)) lb.crew = [];
  if (!Array.isArray(lb.towedIds)) lb.towedIds = [];
  return lb;
}

function id32(v) { return typeof v === 'string' && v.length > 0 && v.length <= 96; }

export const longBerth = {
  name: 'longBerth',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
    this._scanT = 0;

    const lb = ensureSlice(this.state);
    if (lb.claimed) this._registerStation();

    // Any body the player ever latches earns tow history on its durable identity — a trophy is
    // only "towed home" if the rope actually touched it.
    this.bus.on('tether:latched', (p) => {
      const e = this.state.entities.get(p && p.targetId);
      const wrid = e && e.data && e.data.worldRecordId;
      if (wrid && id32(wrid)) {
        const slice = ensureSlice(this.state);
        if (!slice.towedIds.includes(wrid)) {
          slice.towedIds.push(wrid);
          if (slice.towedIds.length > 128) slice.towedIds.splice(0, slice.towedIds.length - 128);
        }
        if (e.data.oneOffId === LONG_BERTH_ONEOFF_ID) e.data.berthTowedOnce = true;
      }
    });

    this.bus.on('longBerth:claim', () => this._tryClaim());
    this.bus.on('longBerth:restore', () => this._tryRestore());
    this.bus.on('save:loaded', () => {
      const slice = ensureSlice(this.state);
      if (slice.claimed) this._registerStation();
    });
  },

  update(dt, state) {
    this._scanT -= dt;
    if (this._scanT > 0) return;
    this._scanT = SCAN_S;
    const lb = ensureSlice(state);
    const tug = this._findTug();
    if (!tug) return;

    if (!lb.claimed) this._maybeOfferClaim(tug, lb);
    else {
      if (lb.stage >= 1) this._syncMarker(tug);
      this._yardTrophies(tug, lb);
      this._offerRestoreIfDue(tug, lb);
    }
  },

  _findTug() {
    const entities = this.state.entities;
    if (!entities) return null;
    for (const e of entities.values()) {
      if (e && e.alive !== false && e.data && e.data.oneOffId === LONG_BERTH_ONEOFF_ID) return e;
    }
    return null;
  },

  _playerNear(pos, radius) {
    const p = this.state.entities.get(this.state.playerId);
    if (!p || !p.pos) return false;
    const dx = p.pos.x - pos.x, dz = p.pos.z - pos.z;
    return dx * dx + dz * dz <= radius * radius;
  },

  _tugParked(tug) {
    const v = tug.vel || {};
    return Math.hypot(v.x || 0, v.z || 0) <= TOW_SPEED_EPS;
  },

  _maybeOfferClaim(tug, lb) {
    const eligible = !!(tug.data && tug.data.berthTowedOnce) || lb.towedIds.includes(
      tug.data && tug.data.worldRecordId);
    const visible = eligible && this._playerNear(tug.pos, BERTH_CLAIM_RANGE_WU) && this._tugParked(tug);
    // The UI adapter owns the card; the offer is presence-gated every scan so a stale card can
    // never claim from far away.
    this.bus.emit('longBerth:claimOffer', { visible });
  },

  _tryClaim() {
    const lb = ensureSlice(this.state);
    const tug = this._findTug();
    if (!tug || lb.claimed) return;
    lb.claimed = true;
    lb.stage = 0;
    lb.tugWorldRecordId = tug.data && tug.data.worldRecordId || null;
    this._registerStation();
    this.bus.emit('toast', {
      text: `${LONG_BERTH_NAME} is yours — she still needs work before she takes a hull.`,
      kind: 'success', ttl: 6,
    });
  },

  _registerStation() {
    if (STATION_INFO.has(LONG_BERTH_STATION_ID)) return;
    STATION_INFO.set(LONG_BERTH_STATION_ID, {
      id: LONG_BERTH_STATION_ID,
      name: LONG_BERTH_NAME,
      type: 'yard',
      size: 'S',
      missionProfile: 'home',
      factionId: null,
      sectorId: 'sector_ceres_belt',
      sectorTier: 1,
      security: 'low',
      desklessOutpost: true,
      services: [],
      repGated: false,
      minRep: -999,
      record: null,
      home: true,
    });
  },

  // The dockable body: a real station entity shadowing the tug's live pose. Existing index
  // lanes (stations/dockStations/damageables) pick it up; the tug remains the visual.
  _syncMarker(tug) {
    const lb = ensureSlice(this.state);
    const marker = this._findMarker();
    if (!marker) {
      if (!this.helpers || typeof this.helpers.spawnEntity !== 'function') return;
      const pos = this._markerPos(tug);
      const e = this.helpers.spawnEntity({
        type: 'station',
        factionId: null,
        pos,
        radius: 14,
        mass: 0,
        collides: false,
        ttl: Infinity,
        data: {
          stationId: LONG_BERTH_STATION_ID,
          name: LONG_BERTH_NAME,
          dockRadius: BERTH_DOCK_RADIUS_WU,
          longBerthMarker: true,
        },
      });
      if (e) lb.markerEntityId = e.id;
    } else {
      const p = this._markerPos(tug);
      marker.pos.x = p.x;
      marker.pos.z = p.z;
    }
  },

  _markerPos(tug) {
    return { x: tug.pos.x + BERTH_MARKER_OFFSET_WU, z: tug.pos.z + BERTH_MARKER_OFFSET_WU };
  },

  _findMarker() {
    for (const e of this.state.entities.values()) {
      if (e && e.data && e.data.longBerthMarker && e.alive !== false) return e;
    }
    return null;
  },

  _offerRestoreIfDue(tug, lb) {
    const next = berthStageDef(lb.stage + 1);
    const visible = !!next && this._playerNear(tug.pos, BERTH_CLAIM_RANGE_WU);
    const costBits = [];
    if (next) {
      costBits.push(`${next.cost.credits} cr`);
      for (const [c, n] of Object.entries(next.cost.cargo || {})) costBits.push(`${n}u ${c.replace('cmdty_', '')}`);
    }
    this.bus.emit('longBerth:restoreOffer', {
      visible,
      stage: next ? next.stage : null,
      label: next ? next.label : null,
      verb: next ? next.verb : null,
      costText: costBits.join(' · '),
    });
  },

  _tryRestore() {
    const lb = ensureSlice(this.state);
    const tug = this._findTug();
    if (!tug || !lb.claimed) return;
    const next = berthStageDef(lb.stage + 1);
    if (!next || !this._playerNear(tug.pos, BERTH_CLAIM_RANGE_WU)) return;
    // Cargo is checked before the charge lands so a half-paid restore cannot happen; units leave
    // through cargo's own writer so usedVolume/usedMass caches stay honest.
    const cargo = this.state.player && this.state.player.cargo;
    for (const [cid, n] of Object.entries(next.cost.cargo || {})) {
      const have = cargo && cargo.items ? (cargo.items[cid] || 0) : 0;
      if (have < n) {
        this.bus.emit('toast', { text: `The yard needs ${n}u ${cid.replace('cmdty_', '')} you don't carry.`, kind: 'error', ttl: 4 });
        return;
      }
    }
    const credits = this.state.player && Number(this.state.player.credits);
    if (!Number.isFinite(credits) || credits < next.cost.credits) {
      this.bus.emit('toast', { text: `The yard quotes ${next.cost.credits} cr — you're short.`, kind: 'error', ttl: 4 });
      return;
    }
    for (const [cid, n] of Object.entries(next.cost.cargo || {})) removeCargo(this.state, cid, n);
    this.bus.emit('economy:chargeCredits', { amount: next.cost.credits, reason: `longBerth:restore:${next.key}` });
    lb.stage = next.stage;
    this._registerStation();
    const info = STATION_INFO.get(LONG_BERTH_STATION_ID);
    info.services = next.services.slice();
    this.bus.emit('toast', { text: next.line, kind: 'success', ttl: 7 });
    this.bus.emit('longBerth:stage', { stage: lb.stage });
  },

  // Released towed bodies inside the yard radius join the persistent trophy roster, once each.
  _yardTrophies(tug, lb) {
    if (!berthGrant(Math.max(1, lb.stage), 'yard')) return;
    const entities = this.state.entities;
    for (const e of entities.values()) {
      if (!e || e.alive === false || e === tug || !e.data) continue;
      const wrid = e.data.worldRecordId;
      if (!wrid || !lb.towedIds.includes(wrid)) continue;
      if (lb.trophies.some((t) => t.worldRecordId === wrid)) continue;
      const dx = e.pos.x - tug.pos.x, dz = e.pos.z - tug.pos.z;
      if (dx * dx + dz * dz > BERTH_YARD_RADIUS_WU * BERTH_YARD_RADIUS_WU) continue;
      lb.trophies.push({
        worldRecordId: wrid,
        label: berthTrophyLabel(e),
        type: e.type || 'wreck',
        at: Number(this.state.simTime) || 0,
      });
      if (lb.trophies.length > 24) lb.trophies.splice(0, lb.trophies.length - 24);
      this.bus.emit('toast', {
        text: `${berthTrophyLabel(e)} parked in the Long Berth yard.`,
        kind: 'info', ttl: 5,
      });
    }
  },
};

export default longBerth;
