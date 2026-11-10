// Restore boundary for station contact continuity. Kept event-only so old saves cannot inherit
// the current run's contact bag or transient berth receipts during saveSystem's merge restore.

import {
  createInitialStationContactCounters,
  normalizeStationContactCounters,
  normalizeStationContactRecord,
  normalizeRescueMemory,
} from '../data/stationContacts.js';

const STATION_LIFE_NEWS_VERSION = 1;
const MAX_RESCUE_NOTICES = 16;
const MAX_DEED_NOTICES = 8;
const DEED_NEWS_TTL_S = 1800;

// Save transport only: stationContacts remains the live writer and traffic is transient.
// Validate the small durable news bags at both boundaries rather than saving a whole UI bag.
export function stationLifeSaveProjection(raw, simTime = 0) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const now = Number.isFinite(simTime) ? Math.max(0, simTime) : 0;
  const rescueNotices = {};
  const deeds = {};
  const entries = (bag) => bag && typeof bag === 'object' && !Array.isArray(bag)
    ? Object.entries(bag).sort((a, b) => (Number(b[1] && b[1].simTime) || 0)
      - (Number(a[1] && a[1].simTime) || 0) || a[0].localeCompare(b[0])) : [];
  for (const [sectorId, rawNotice] of entries(source.rescueNotices)) {
    if (Object.keys(rescueNotices).length >= MAX_RESCUE_NOTICES) break;
    const notice = normalizeRescueMemory(rawNotice);
    if (!notice || notice.sectorId !== sectorId || notice.simTime > now
      || ['__proto__', 'constructor', 'prototype'].includes(sectorId)) continue;
    rescueNotices[sectorId] = {
      recordId: notice.recordId, sectorId: notice.sectorId, simTime: notice.simTime,
    };
  }
  for (const [sectorId, deed] of entries(source.deeds)) {
    if (Object.keys(deeds).length >= MAX_DEED_NOTICES) break;
    if (!deed || typeof deed !== 'object' || Array.isArray(deed)
      || deed.sectorId !== sectorId || typeof deed.text !== 'string' || !deed.text.trim()
      || typeof deed.outcome !== 'string' || !deed.outcome
      || !Number.isFinite(deed.simTime) || deed.simTime < 0 || deed.simTime > now
      || now - deed.simTime > DEED_NEWS_TTL_S
      || ['__proto__', 'constructor', 'prototype'].includes(sectorId)) continue;
    const id = sectorId.slice(0, 96);
    if (id !== sectorId) continue;
    deeds[id] = {
      sectorId: id,
      outcome: deed.outcome.slice(0, 48),
      shapeId: String(deed.shapeId || '').slice(0, 64),
      encounterId: String(deed.encounterId || '').slice(0, 96),
      text: deed.text.replace(/\s+/g, ' ').trim().slice(0, 320),
      simTime: deed.simTime,
    };
  }
  return { schemaVersion: STATION_LIFE_NEWS_VERSION, rescueNotices, deeds };
}

function clearForRestore(state) {
  if (!state.player || typeof state.player !== 'object') state.player = {};
  state.player.stationContacts = {};
  state.player.stationContactCounters = createInitialStationContactCounters();
  delete state.player.stationLife;
  state.stationLife = { traffic: [] };
}

export const stationContactLoadBoundary = {
  name: 'stationContactLoadBoundary',
  _subs: null,
  init(ctx) {
    const { state, bus } = ctx;
    const before = () => clearForRestore(state);
    const after = () => {
      const bag = state.player && state.player.stationContacts;
      if (!bag || typeof bag !== 'object' || Array.isArray(bag)) state.player.stationContacts = {};
      else for (const id of Object.keys(bag)) bag[id] = normalizeStationContactRecord(bag[id]);
      state.player.stationContactCounters = normalizeStationContactCounters(state.player.stationContactCounters);
      // Rescue notices are durable across Continue — a wipe here used to drop every unclaimed
      // notice the moment a save loaded. stationContacts' own save:loaded handler validates
      // them; this boundary only guarantees the bag exists.
      const transported = state.player.stationLife;
      const source = transported && transported.schemaVersion === STATION_LIFE_NEWS_VERSION
        ? transported : state.stationLife;
      const news = stationLifeSaveProjection(source, state.simTime);
      delete state.player.stationLife;
      state.stationLife = {
        traffic: [],
        rescueNotices: news.rescueNotices,
        ...(Object.keys(news.deeds).length ? { deeds: news.deeds } : {}),
      };
    };
    bus.on('save:restoring', before);
    bus.on('save:loaded', after);
    this._subs = [[bus, 'save:restoring', before], [bus, 'save:loaded', after]];
  },
  destroy() {
    for (const [bus, event, fn] of (this._subs || [])) bus.off(event, fn);
    this._subs = [];
  },
};
