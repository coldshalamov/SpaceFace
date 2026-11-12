# src/world/

Records, catch-up, and activity class for the sim. Not Three.js.

- The registered owner is `systems/world.js` (sectors, fuel, jump, discovery).
- This folder does not write credits, cargo, or reputation.
- `factions.js` may set `state.world.sectors[id].owner` on a war flip. Do not also write it here.
- `stableRecordId` and schema ids are save keys. Bump `schemaVersion` and normalize; do not recycle an id.
- `worldCatchup.js` never resolves a fight. Pass `simTime` in. No `Math.random`, no `Date`.
- Far-row and per-sector caps evict reclaimable rows only. Durable, mission, and player rows stay.
- `presentationSources.js` may choose meshes. It must not change outcomes.
- `explorationJournal.js` only reads `state.world.discovery`.
