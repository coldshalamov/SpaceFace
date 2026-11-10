Implemented MJ3: lost hulls persist by name, class and loss sector, and the Preserved Cockpit supports observe → follow → align → recover. No-loss profiles receive no personal hook.

The archive lives in world records independently of the capped loss ledger. Save v17 adds defaults without replacing existing records.

Validation: M11 **6 passed, 0 failed**; neighboring tests **34 passed**; save-schema and reload-determinism checks passed.

Files changed:

- `src/world/worldRecords.js`, `src/world/playerHullEcho.js`
- `src/systems/world.js`, `src/systems/alienEcology.js`
- `src/data/alienEcology.js`, `src/data/saveVersion.js`
- `src/save/migrations.js`, `SAVE_SCHEMA.md`, `index.html`
- `test/m11-ship-that-flew-before.test.mjs`
- `test/world-persistence-foundation.test.mjs`

Adjacent failures left unchanged: the ecology test’s first-site assumption and the missing `sectorCausalChains.js` preload entry.

Uncommitted, as required by the worker constraints.