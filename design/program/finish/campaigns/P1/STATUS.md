# P1 — the Ship Sheet — status

**2026-11-06, Lane 4 (SHIP).**

## Done

| Piece | Where |
|---|---|
| The one pure stat model: six 1–10 stats, fixed documented anchors, build word from the shape, per-stat deltas in tenths, engineering block for Details | `src/ui/ship/shipStats.js` (new) |
| The one DOM block: build word, one sentence, six pip rows, a meaning line that follows pointer/keyboard, a `Details` door holding the engineering numbers | `src/ui/ship/shipSheet.js` (new) |
| Shipworks **and** THE SHIP — the same shared stage, so this one edit covers both — now lead with the sheet. The five-clause engineering paragraph under the hull name is gone; the hero row of engineering numerals is gone; the catalogue's resting band is a wrapping sentence instead of clipped chips. | `src/ui/station/screens/shipworks.js` |
| Hover a part or a preset in the fitter: every stat paints its green/red tenth delta and a ghost pip on the bar, from the same model (no second calculator) | `shipworks.js` `applyModuleGhost` / preview-preset path |
| New Game: the starter choice carries the sheet (compact), and the word under each starter is the sheet's own identity, so a hull is never named two things | `src/ui/screens/newGame.js`, `src/ui/starterAirCard.js` |
| The model test: exactly six stats, 1–10 bounds, monotonic Firepower and Handling, distinct starter shapes, identity words, deltas, no naked stat-name sentence | `test/ship-stats.test.mjs` (new) |

## The anchors (documented, frozen)

`SHIP_STAT_DEFS` in `shipStats.js`. `floor` scores 1, `ceiling` scores 10, log-linear between.

| Stat | Raw reading (existing owner) | floor | ceiling |
|---|---|---|---|
| Firepower | fitted guns' damage/s × a duty factor from `sustainedFireForFit` | 10 | 130 |
| Toughness | `(hull + armour)/damageReduction + 1.3·shield` | 125 | 5700 |
| Speed | `governedFightSpeedFor` + 0.2·boost ceiling | 130 | 430 |
| Handling | `governedYawRateFor^0.65 · (brake/30)^0.35 · 10` | 6.5 | 90 |
| Power | `capMax + 5·capRegen` | 100 | 2400 |
| Muscle | `max(towClassMassFor, 1.5·operationalMass)` | 15 | 2000 |

## Roster reading (empty fit, 2026-11-06)

```
Hitch      4 2 5 6 2 2   Skirmisher
Pelican    4 3 5 6 3 4   Skirmisher
Wasp       4 3 6 6 4 3   Skirmisher
Mule       4 3 5 4 3 4   Runner
Drifter    4 5 6 6 4 4   Generalist
Hornet     4 5 5 8 5 4   Skirmisher
Ironback   3 5 7 4 5 5   Runner
Hawser     3 4 8 3 4 6   Runner
Bastion    4 6 4 7 6 6   Skirmisher
Atlas      4 6 5 4 6 7   Hauler
Ranger     4 6 2 6 7 4   Workhorse
Warden     4 8 4 7 8 7   Workhorse
Colossus   4 9 8 1 8 9   Brawler
Leviathan  4 10 7 1 10 10 Brawler
Saucer     10 10 10 10 10 10 Generalist
```

## Evidence

- `node scripts/ui-bench.mjs --shot=station-shipworks,ship,new-game` — before/after PNGs read in
  `.devshots/ui-bench/`. Before: `Agility 8.8 / Inertia 18 / Brake 78`, `CORE · 0 DRAW`, seven
  `EMPTY · S` slots, a five-clause paragraph. After: `Skirmisher`, six bars, one meaning line,
  `Details`.
- `node scripts/ui-bench.mjs --shot=station-shipworks --walk` — the six stat rows are focusable
  controls and each one changes the meaning line (walk entries 13–15).
- `node scripts/check-type-floor.mjs` — OK, 2421 sizes.
- `node --test test/ship-stats.test.mjs` — 8/8 pass (re-run after the merge that landed this work).
- Final bench shots after the merge: `station-shipworks` 11.1 s, `ship` 8.8 s, `new-game` 9.5 s, all
  "no tangled, buried, cut-off or offscreen type".

## Not done / open

- **Blind comprehension check.** Not run: it needs a second reader. The two sheets to hand over are
  `shipStatSheet({shipId:'ship_hornet',fittings:[…]})` vs `shipStatSheet({shipId:'ship_hawser',…})`;
  the expectation encoded in the model is Hornet wins the slug-fest (Firepower) and Hawser the tow
  job (Muscle), with Speed/Toughness deciding the drag race.
- **A foreign circular import makes `src/systems/ships.js` flaky to load.** `src/world/tallyThreeIdentity.js`
  evaluates `makeShipEntitySpec()` at module top level; when that module is reached before `ships.js`
  has finished initialising, the import throws `Cannot access 'SHIP_BY_ID' before initialization`.
  It is not caused by the Ship Sheet (it reproduces with `import('./src/systems/ships.js')` alone)
  and it is not mine to fix; it is recorded in `NOW.md`. The stat model's suite and the three bench
  shots both pass while the cycle happens to resolve, and both fail when it does not — so treat a
  red run of anything that imports `systems/ships.js` as this bug first.
- **The flight-host side column still speaks engineering** (`0/1 fitted · 0 draw` per system). It is
  the systems/power instrument rather than the ship's stats; the `core · N draw` caption is now
  `power used · N of M`, but the per-row draw numbers are still raw. Follow-up.
- Localization: the new strings are literals in the modules above. `extract-localization --check`
  fails on the whole tree (`nondeterministic extraction result`) while other agents' copy is in
  flight, so the generated catalog was not regenerated (it would bake their strings into one commit).
