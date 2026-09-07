<!-- LIFETIME: ACTIVE_RECEIPT -->
# PQ-171.00 — Encounter grammar

```text
DONE  PQ-171.00 — every live encounter names its situation, place, twist, and actor.

WHAT I FOUND
The repository contains 49 authored encounter modules under `src/data/encounters/` (`010-*.js` through `336-*.js`) loaded via `src/data/encounters/index.generated.js` and `catalog.js`. While these modules contained trigger metadata (such as `id`, `tier`, `deck`, `zoneTypes`, `script`, and `gates`) and body fields (like `squad`, `factionId`, and dialogue barks), none declared an explicit 4-axis encounter grammar shape (`situation × place × twist × actor`). Without a declared shape, encounter variety could only be measured by raw file count rather than grammatical combinations, and duplicate encounter setups could not be systematically audited or metered.

WHAT I CHANGED
1. Created `src/data/encounters/shape.js` defining frozen axis vocabularies (`SITUATION_VOCABULARY`, `PLACE_VOCABULARY`, `TWIST_VOCABULARY`, `ACTOR_VOCABULARY`) and `validateEncounterShape` to enforce full validity across all 4 axes.
2. Updated `src/data/encounters/catalog.js` to re-export shape vocabularies and validation, and added shape validation checks inside `defineEncounter` and `buildEncounterCatalog` so any missing or illegal shape fails fast at load time.
3. Updated all 49 authored encounter modules in `src/data/encounters/` to include explicit `shape: { situation, place, twist, actor }` declarations mapping honestly to each module's gameplay role.
4. Added `scripts/check-encounter-shapes.mjs` to inspect and assert grammar integrity and diversity across the catalogue.
5. Added `test/encounter-shapes.test.mjs` verifying:
   - Module count matches `index.generated.js` (49 modules).
   - Every catalog entry carries a frozen, valid shape conforming to the vocabularies.
   - Broad diversity across situations, twists, and actors (well exceeding the threshold of at least two distinct values per axis).
   - Rejection of missing shapes and unknown axis values by `defineEncounter` and `buildEncounterCatalog`.
6. Preserved migration baselines in `test/depth-program-encounter-loader.test.mjs` and updated `test/encounter-scavengers-fresh-wreck.test.mjs` to read body properties accurately.

WHAT YOU WILL FEEL
Every encounter in the SpaceFace universe now declares its narrative and tactical structure in terms of situation, location, twist, and actor. This provides the foundational grammar for anti-repetition metering, ensuring the storyteller can balance encounters across combinations rather than repetitive stamps, while keeping encounter modules self-describing and strictly validated.

THE NUMBERS   49 authored modules | 17 distinct situations | 10 distinct twists | 14 distinct actors | validator green
```

## Controller review — 2026-09-07

Re-ran 11/11 focused tests and `scripts/check-encounter-shapes.mjs` on the isolated candidate. 40 unique situation|twist|actor tuples of 49 — not one stamp. Place copies each file's `zoneTypes`; gated unique-wreck / K1 / follow-on stubs keep an empty place because those files already have empty `zoneTypes`. Actor is the `factionId` already on the file. No new encounter content. Dispatch unit `ready` → `done`. PQ-171.01 (the repetition meter) remains.
