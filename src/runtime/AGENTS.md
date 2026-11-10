# src/runtime/

The import-boundary-pure manifest: which systems exist, in what order, on which clock.

- `authoritativeSystemManifest.js` is the single order and clock source. It must not import render, UI, audio, or DOM factories.
- Invariants: update ids are a subset of init ids; every update id has exactly one clock; `validateSystemClockDeclarations()` is empty. Glass is a capability (`hud` / `voice` / `presentation`), not a fourth id list.
- `registry.js` and `nodeSystemFactoryTable.js` are lookup tables. A new system needs a manifest id, a lookup entry in both tables, and a clock. Lookup-only objects never `init`.
- Hosts partition with `system.name`. That string must equal the manifest id, or `getDeclaredSystemClock` must alias it (`ai` / `tacticalAI` → `aiSlot`, `moralTrap` → `moralTrapSystem`). A mismatched name falls through to the table clock and does not throw.
- Profiles are `production` (default) and `legacy47a`. Never derive features from `window` or env. Do not step two authoritative runtimes at once.
- `render`, `vfx`, `feel`, `audio`, and `ui` are browser-only. A DOM prompt that cannot load under Node sets `nodeSafe: false`.
- Proof: `node --test test/authoritative-manifest.test.mjs test/runtime-profiles.test.mjs test/sim-clock-catchup.test.mjs`.
