# src/nemesis/

Schema and inference for `state.nemesis`. `systems/nemesis.js` is the only writer.

- `model.js` is the save boundary. An unknown `schemaVersion` throws. Do not widen the blob with executable fields.
- `learning.js` does not draw RNG or read the renderer. Unknown kill causes stay unknown.
- `encounterHost.js` returns specs. Spawning, damage, and faction reputation stay with their owners.
- Evidence budgets in `LIMITS` are hard caps. A save cannot mint extra counts.
