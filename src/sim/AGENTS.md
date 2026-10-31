# src/sim/

Recordings and pure projections. Not a second `GameState` owner.

- `titleAttract.js` runs only in `scripts/bake-title-attract.mjs` and `test/title-attract.test.mjs`. The menu fetches `titleAttractTapeData.json` via `src/render/titleAttractStage.js` after the idle gate. Keep this offline world off the boot path; physics changes must preserve the authored replay and its determinism checks.
- Seed is `TITLE_ATTRACT_SEED`. Tape schema is `spaceface.titleAttractTape.v2`. A roster, system, or seed change must re-bake. `npm run check:title-attract` byte-compares the committed tape.
- `killcamTape.js` is the registered `killcamRecorder` (table clock). `note()` only stores poses in a 30 Hz, 5 s ring. Do not write credits, velocity, or run phase from it.
- `sector/embodiment.js` projects intent recipes from sector-sim scalars. No `Math.random`, no `Date`, no DOM, no entity spawn, no credit, cargo, reputation, or hull writes. `proposedRecordId` must stay identical to `worldRecords.stableRecordId`.
- Proof: `npm run check:title-attract`; `node --test test/killcam-tape.test.mjs`; `npm run check:m2:sector-embodiment`.
