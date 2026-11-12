# src/chronicler/

Evidence archive for `state.chronicler`. `systems/chronicler.js` is the only writer.

- Record facts. Do not emit `faction:repDelta`, heat changes, or spawns.
- New producers must be listed in `FACT_EVENTS` and handled in `normalize.js`, or they are ignored.
- A `news:headline` that carries a `source` id is an echo. Do not file it twice.
- `voiceBridge.js` may offer comms. It must not mutate memory.
- `pruneMemory` enforces `MAX_RETAINED_FACTS`. `configFor` must stay byte-canonical for old saves.
