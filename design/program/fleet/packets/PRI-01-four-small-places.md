# PRI-01 — Four small place changes from the commission branches (#947 #956 #957 #958)

**Lane 3.** Data only. Read `design/program/fleet/PR-INTAKE.md` first ("How to read and port a PR"),
then the sections "#947", "#956", "#957", "#958" of `.devshots/pr-intake/reviews/grunt-ec-a.md`.

## Build — four separate commits, in this order

1. **Dione Lane has its own look (#947).** `src/data/sectorVisualProfiles.js` gains the
   `sector_dione_lane` rig and its `PROFILE_BY_ID` entry; `src/data/lookMoods.js` gains
   `dione_lane: 'sodium_yard'`. Three-way merge both files from the PR.
   Tests: `test/sector-visual-profiles.test.mjs` and `test/wave-c6-sky-plates.test.mjs` — add the Dione
   rows the PR added, but **derive the expected bloom/exposure numbers from what master computes
   today** (master re-baselined that table to one flat scheme; the PR's `0.416 / 0.98 / 0.96` are stale).
   Do not change any other sector's expected numbers.
   Commit: `fleet(PRI-01): Dione Lane has its own light and sky (lands PR #947)`.
2. **The yard tow-out can stage in Hyperion Cut (#956).** `src/data/encounters/346-yard-towout.js`:
   `zoneTypes` gains `'mining_belt'`, `gates.sectorIds` gains `'sector_hyperion_cut'`. Bring
   `test/hyperion-towout-gate.test.mjs` (new) and the PR's change to `test/b7-set-pieces.test.mjs`.
   Commit: `fleet(PRI-01): the yard tow-out stages in Hyperion Cut (lands PR #956)`.
3. **Kepler Scar's tally day (#957).** `src/data/sectorCausalChains.js` gains `KEPLER_CAUSAL_CHAIN`,
   `keplerCycleNewsText` and the `sector_kepler_scar` entry in `SECTOR_CAUSAL_CHAIN_DEFS`; bring
   `test/kepler-bazaar-chain.test.mjs`.
   Commit: `fleet(PRI-01): Kepler Scar's bazaar walks its tally day (lands PR #957)`.
4. **Orcus Shadow's courier (#958).** Same file gains `ORCUS_CAUSAL_CHAIN`, `orcusCycleNewsText` and the
   `sector_orcus_shadow` entry; bring `test/orcus-courier-chain.test.mjs`. #957 and #958 insert at the
   same place in the file — keep both, Kepler first.
   Commit: `fleet(PRI-01): one courier threads Orcus Shadow on a timetable (lands PR #958)`.

For 3 and 4, before committing confirm with grep that every actor slot id the chain names
(`kepler_bazaar_runner`, `kepler_hulk_salvor`, `orcus_supply_hauler`, `orcus_anomaly_listener`) still
exists in `src/data/sectorActivityPockets.js` and both station ids exist under `src/data/`. If one is
gone, do not land that chain; report it under Blocked.

Any news/cycle line longer than about 90 characters: shorten it to one plain sentence (PR-INTAKE rule 5).

## Files you may edit
`src/data/sectorVisualProfiles.js`, `src/data/lookMoods.js`, `src/data/encounters/346-yard-towout.js`,
`src/data/sectorCausalChains.js`, `test/sector-visual-profiles.test.mjs`, `test/wave-c6-sky-plates.test.mjs`,
`test/hyperion-towout-gate.test.mjs`, `test/b7-set-pieces.test.mjs`, `test/kepler-bazaar-chain.test.mjs`,
`test/orcus-courier-chain.test.mjs`.

## Checks (run the ones for each commit before that commit)
`node --test test/sector-visual-profiles.test.mjs test/wave-c6-sky-plates.test.mjs`
`node --test test/hyperion-towout-gate.test.mjs test/b7-set-pieces.test.mjs`
`node --test test/kepler-bazaar-chain.test.mjs test/orcus-courier-chain.test.mjs`
Then find and run the existing tests that import `sectorCausalChains` (`grep -ln sectorCausalChains test/*.mjs`).
`npm run check:src-imports`. No game or browser run.
