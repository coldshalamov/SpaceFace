# src/save/

The versioned envelope. Schema version lives only in `src/data/saveVersion.js`.

- `saveSystem.js` is the registered `save` system (calendar clock, last in the update order). It does not own `newGame()` (`main.js` does).
- Bump `CURRENT_VERSION` and append one `{from,to,fn}` in `migrations.js`. Migrations are pure and re-runnable on a candidate copy. Do not hand-edit `SAVE_SCHEMA.md`. `npm run generate:save-schema` writes it; `npm run check:save-schema` only checks. `EVENT_ROUTING.md` and `SYSTEM_REGISTRY.md` are likewise generated (`npm run build:indexes`).
- Restore order: format, version at most current, checksum, migrate, then one apply. A failed or superseded restore must not publish the loser's error. Normalize backends to `rapier-dynamic`, `sg06-tactical`, and `v3`. Delete a saved `runtimeProfile`.
- Checksum is FNV-1a of canonical JSON `data`. Thumbnails (`slotStill.js`) sit beside `data` and are not in the checksum.
- Browser and Electron share the loopback store (`sharedPlayerStore.js`). A 404 no-ops. Tombstones stop a stale peer from resurrecting a deleted slot. Gzip wrapper is `spaceface-save-gz`; refuse payloads over 12 MiB.
- Ironman locks once the run has playtime or the latch is stamped. A corrupt or wrong-version save must not crash boot.
- Proof: `npm run check:save-schema`, `npm run check:save-import-safety`, `npm run check:save-fuzz`, `npm run check:player-save-store`.
