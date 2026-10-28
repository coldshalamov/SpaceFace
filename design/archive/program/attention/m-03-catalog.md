# M-03 catalog — authored encounters

Surface: `src/data/encounters/*.js` authored families (030 patrol-scan, 040 bounty-hunter,
344/362/363/367 convoy-salvage set pieces, 1200 the-wedge, 1300s, 8200s…) registered via
`defineEncounter`/`deepFreeze` in `catalog.js` → `index.generated.js`. Runtime executes
`script` ids; radio voice rides `ENCOUNTER_BARKS` in `src/data/encounters.js`
(`USER_BARK_LINES` may override; pick is hash-seeded per call site).

## What already exists

- Trigger headers: tier/deck/weight/zoneTypes/script/pressureCost/cooldown/gates.
- Rich set pieces (`1200-the-wedge`): crSituationKit, physical entities, lane geometry,
  salvage pools, keyed outcomes/news.
- `ENCOUNTER_BARKS` keyed corpora: `toll_*`, `patrol_scan_*`, `patrol_beat_hail`,
  `ambush_*`, `convoy_*`, `distress_*`, `bounty_notice`, `hunter_iask/sorrel/vane` (named),
  `salvage_ping`, `whisper_*`, `claim_*`, set-piece alert singles.

## Writable seams

- ENCOUNTER_BARKS arrays are append-shaped: keyed corpus → seeded pick over the whole
  array. Index-0 semantics aren't pinned per caller; appends keep determinism.
- Squad/archetype tables and manifest `lines` change mechanics — not seams.
- Outcome/news maps are keyed → closed.

## Foreign

encounter modules 401–429/536 dirty (lived lane); `encounters.js` verified clean.

Review: catalog ✓3 (Drifter / Archivist / Set Dresser) — recorded.
