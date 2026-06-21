// Ordered save-schema migrations (ARCHITECTURE §4.5). Each entry: { from, to, fn(data) } where
// fn mutates the `data` envelope payload in place to move it one version forward. loadEnvelope
// runs the matching chain from the save's version up to CURRENT_VERSION. Migrations must be pure
// and re-runnable; a throw aborts the load (no partial mutation of live state — we migrate a
// candidate copy first).
//
// CURRENT_VERSION lives in src/data/saveVersion.js (the single source of truth) and is re-exported
// here for convenience.
// When the schema changes: bump CURRENT_VERSION in saveVersion.js and append { from:N-1, to:N, fn }.
export { CURRENT_VERSION } from '../data/saveVersion.js';

export const MIGRATIONS = [
  {
    from: 1,
    to: 2,
    fn(data) {
      if (!data.crafting || typeof data.crafting !== 'object') {
        data.crafting = { queues: {} };
        return;
      }
      if (!data.crafting.queues || typeof data.crafting.queues !== 'object') {
        data.crafting.queues = {};
      }
    },
  },
  // v3: offscreen sector-simulation engine (ADR-0002 / V2 §33). Old saves have no data.sectorSim;
  // seed an empty subtree so sectorSim.deserialize can overlay defaults cleanly. Pure + idempotent.
  {
    from: 2,
    to: 3,
    fn(data) {
      if (!data.sectorSim || typeof data.sectorSim !== 'object') {
        data.sectorSim = { sectors: {}, meta: {} };
        return;
      }
      if (!data.sectorSim.sectors || typeof data.sectorSim.sectors !== 'object') data.sectorSim.sectors = {};
      if (!data.sectorSim.meta || typeof data.sectorSim.meta !== 'object') data.sectorSim.meta = {};
    },
  },
  // v4: SG-02 dynamic authority makes entity angVel and `rapier-dynamic` gameplay settings
  // authoritative save fields. Existing v3 saves may omit them; omission remains a valid zero/default.
  {
    from: 3,
    to: 4,
    fn(data) {
      if (data && data.entities && data.entities.player && typeof data.entities.player === 'object') {
        if (data.entities.player.angVel != null && typeof data.entities.player.angVel !== 'number') {
          data.entities.player.angVel = 0;
        }
      }
      if (data && data.entities && Array.isArray(data.entities.persistent)) {
        for (const entity of data.entities.persistent) {
          if (entity && typeof entity === 'object' && entity.angVel != null && typeof entity.angVel !== 'number') {
            entity.angVel = 0;
          }
        }
      }
    },
  },
];
