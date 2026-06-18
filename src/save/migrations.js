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
];
