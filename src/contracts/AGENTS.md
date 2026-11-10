# src/contracts/

Not the mission board. Pure validators and codecs: combat-lab setup and build codes, sim and scenario documents, evidence and observatory records, render packages, motion banks, asset-release checks, content-factory lint.

- No bus, registry, DOM, credits, cargo, or combat-kernel writes.
- A schema-valid setup must still be reproducible. Do not coerce seed 0 to 1 (`combatLabSetupSchema`). A stale combat-lab content digest is a mismatch, not a code to repair.
- Motion banks move declared pivots only. Reject scale, camera, collider, and simulation-owned channels at validate time.
- Player contract pay lives in `src/systems/missions.js` and `src/economy/economyMissionTerms.js`.
