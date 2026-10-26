# W-COLOSSI (build_map row 547) — progress

**Agent:** devin-w547
**Unit:** the full 07 §5 Colossus roster on row-448's plate framework. No HP bars — the bar is
the parts — and every ripped part is ammunition.

## What landed

- **Six new colossi** as authored capital scores on the row-448 framework
  (`src/data/encounters/capital-boss/{nest-carrier,casket-worm,furnace-maw,yardmaster,
  adjudicator-44c,hive-hulk}.js`), registered in `capital-boss.js`. §5's own part ladders:
  Nest Carrier doors→bays→drive (shared cover over the bays), Casket Worm fore/mid/aft
  segments (mid is rope-only, "cut the middle"), Furnace Maw radiators→cavity, Yardmaster
  chunks→magnet core last (rope-only), Adjudicator 44-C emitters→seizure clamp→the weld act,
  Hive-hulk coupling nodes→armour→bay doors (four plates, rope-only doors).
- **Six enemy archetypes** in `enemies.js` — stable ids, capital shipClass, zero bounty/loot
  (same as every survival champion), real shipIds/weapons verified.
- **Validator** (`capital-boss/validate.js`): plate law relaxed from exactly two to **2–4**
  plates; `holdTension <= 1`; optional authored `partId` for the torn slab's aftermath piece.
  Multi-plate shared cover is legal — `_stampPlateCover` already aggregates attached plates
  into the cover map, verified against the Nest doors and Hulk nodes.
- **Swarm rotation** (`swarmMode.js`): six rows appended after the wave-80 Tendril —
  waves 90–140 in ascending weight. Six NEW distinct boss rooms (`nest_berth`,
  `casket_field`, `maw_feed`, `wreck_magnet`, `seal_gate`, `hive_shaft`) installed in
  `survivalArena.js` — the distinct-recipe law holds.
- **Swarm champions carry live plates** (`capitalBossEncounters.js` `_platesLive`): rope tears
  and act sheds leave tetherable slabs on `swarm:` fights exactly like contract fights. Only
  the Last Argument stays data-only.
- **Authored partId → slab visual** (`_tearPlate` fractureVisual + `WRECK_PART_FILES`
  whitelist in `visualFactory.js` widened to the aftermath piece vocabulary).
- **No HP bars:** `capitalBossPresentation.js` readouts carry `partsAttached/partsTotal/
  partsLive`; `capitalBossOverlayMount.js` gauge reads attached-parts fraction and labels
  "parts remaining" for live-plate fights (hull only for the plate-less Last Argument);
  `survivalHud.js` `_bossVitals` counts parts for score-backed swarm champions — figure reads
  `N/M`, no percent — while compositional champions keep the shipped hull meter.

## Verified

- `test/capital-boss-score-contract.test.mjs` — 4/4 (14 catalogued, all validate, all execute
  to first telegraph through the production factory).
- `test/w-colossi-547.test.mjs` — 11/11 (roster, start+telegraph, every-part tears→tetherable
  authored slab, shared cover, act shed, save/restore, no-HP-bar readout + swarm meter,
  ammunition, determinism, Last Argument exception).
- `test/gold-colossi-448-4242.test.mjs` + contract + w-colossi batch — 32/32 green.
- Swarm suites: `fb-024` + `fb-120` + `swarm-boss-round` + `swarm-brood-bosses` — 27/27 green.
- `test/pq-174-05-boss-physics.test.mjs` + `test/enemy-armor-flat-contract.test.mjs` — 4/4.
- `test/47a-jurisdiction-engagement.test.mjs` + `pq195-00-spindle-fork` +
  `squad-tether-overload-gate` — 19/19 (spindle regression check for the armorFlat fix).

## Adjacent pre-existing fixes landed with this row (not row scope, same push)

- `src/data/survivalArenas.js` — `simulateBossKill` gun horizon 600 s →
  `GUN_KILL_HORIZON_S` 1200 s. ROCK-GUN (row 482) cut the starter Pulse to dmg 5; the
  catalog's tankiest hull (Iron Maw) now needs ~833 s of pulse fire, so the old window
  reported dead:false — a harness artifact, not immunity. `pq-174-05` was red at HEAD.
- `src/data/scenarios/47aLiveScene.js` — evidence spindle `armorFlat` 6 → 3. 6 was legal
  when Pulse hit for 8; at dmg 5 it made the payload literally unkillable by the starter
  gun (the exact defect `enemy-armor-flat-contract` bans). 3 matches Iron Maw's plate.

## Leftover / notes

- `test/story-campaign47a-live.test.mjs` is red on `campaign47a:b3:bigger_boat` offer
  wiring — foreign in-flight work in `src/story/campaign47a/*` + `src/data/missions.js`
  (W-BOOKS-3-4 lane owns those exact files per NOW.md). Untouched, preserved dirty.
- `npm run player-truth` returns ENVIRONMENT (served assets stale vs HEAD on a dirty
  working tree; browser never started) — not a gameplay verdict. Deterministic suite
  evidence above is the landing proof.
- `spindle_mother` name: §5 maps it to the existing `brood_queen` row — no new encounter.
- Swarm plates inverted the old "swarm fights never spawn plates" law (gold-448 test updated).
- No new Forge assets required — torn parts draw on existing aftermath GLBs via authored
  `partId` (radiator_panel, cargo_module, engine_section, pressure_tank, corvette_turret,
  weapon_spar, armor_slab).
