// Restore boundary for station contact continuity. Kept event-only so old saves cannot inherit
// the current run's contact bag or transient berth receipts during saveSystem's merge restore.

import {
  createInitialStationContactCounters,
  normalizeStationContactCounters,
  normalizeStationContactRecord,
} from '../data/stationContacts.js';

function clearForRestore(state) {
  if (!state.player || typeof state.player !== 'object') state.player = {};
  state.player.stationContacts = {};
  state.player.stationContactCounters = createInitialStationContactCounters();
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
      const prior = state.stationLife && typeof state.stationLife === 'object' && !Array.isArray(state.stationLife)
        ? state.stationLife.rescueNotices : null;
      state.stationLife = {
        traffic: [],
        rescueNotices: prior && typeof prior === 'object' && !Array.isArray(prior) ? prior : {},
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
