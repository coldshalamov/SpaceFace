# P1 — the Ship Sheet — status

**2026-11-06, Lane 4 (SHIP). Re-reviewed and corrected after independent review.**

## Done

| Piece | Where |
|---|---|
| The one pure stat model: six 1–10 stats, fixed documented anchors, build word from the shape (with the authored hull class as a near-tie), per-stat deltas in tenths, engineering block for Details | `src/ui/ship/shipStats.js` |
| The one DOM block: authored class + build word, one sentence, six pip rows, a meaning line that follows pointer/keyboard, a `Details` door holding the engineering numbers | `src/ui/ship/shipSheet.js` |
| Shipworks **and** THE SHIP lead with the sheet. The old engineering paragraph, hero numerals and the six raw gauges are gone from the surface; the chooser carries the six-stat delta, not engineering chips; the `Proposed fit` percentage strip is gone | `src/ui/station/screens/shipworks.js` |
| The dead band presenters (`heroHtml`, the handling/power/condition/identity detail branches) and the roster-relative `handlingProfileDomain()` / `handlingBandModel()` path are deleted | `shipworks.js` |
| New Game: the starter choice carries the sheet (compact), the meaning line stays in compact, the rows add no tab stops, and the word under each starter is the sheet's own identity | `src/ui/screens/newGame.js`, `src/ui/starterAirCard.js` |
| Firepower counts every damaging mount (including emergent primitives), ignores the phantom starter fallback gun, and pays each mount its own heat/energy duty | `shipStats.firepowerRawFor` |
| Speed reads the governed fight speed times the live burner gain (`boost.topSpeedPct`), never the boost reservoir | `shipStats.speedRawFor` |
| Power is a duration: `sustainedFireForFit` seconds, with the capacitor reserve at a documented 20/s reference draw when the limit is open or no gun is fitted | `shipStats.powerRawFor` |
| Muscle is the tow class (`0.15 × dry mass` when the hull has no tow rating); ram weight moved to Details; a no-tow hull says "No Line load — this hull rams instead." | `shipStats.muscleRawFor` |
| Hover deltas print `before → after (+0.2)` and draw the ghost marker from `afterTenths`, so a sub-half move shows | `shipSheet.js`, `deckplate/shipSheetStyles.js` |
| A11y: stat rows are honest focusable list items (no fake `role="button"`), the delta is in the aria-label, and the meaning line is `aria-hidden` rather than a duplicate live region | `shipSheet.js` |
| The model test: exactly six stats, 1–10 bounds, full-fit Firepower headroom, per-gun duty fuzz, speed/power/muscle meaning, monotonic same-fit mass, starter shapes, deltas, rendered a11y contract | `test/ship-stats.test.mjs` |

## The anchors (documented, frozen)

`SHIP_STAT_DEFS` in `shipStats.js`. `floor` scores 1, `ceiling` scores 10, log-linear between.

| Stat | Raw reading (existing owner) | floor | ceiling |
|---|---|---|---|
| Firepower | each fitted gun's burst dps × its own heat/capacitor duty | 10 | 1900 |
| Toughness | `(hull + armour)/damageReduction + 1.3·shield` | 125 | 9000 |
| Speed | `governedFightSpeedFor × (1 + boost.topSpeedPct)` | 130 | 430 |
| Handling | `governedYawRateFor^0.65 · (brake/30)^0.35 · 10` | 6.5 | 90 |
| Power | `sustainedFireForFit.seconds`; when open/none, `(capMax + 5·capRegen) / 20` | 2 | 300 |
| Muscle | `towClassMassFor`; when no tow, `0.15 · dry mass` | 8 | 4000 |

## Roster reading (full legal fit, 2026-11-06)

Columns are Firepower / Toughness / Speed / Handling / Power / Muscle, then the build word.

```
Hitch       4  3  4  6  3  4  Skirmisher
Pelican     4  3  4  6  4  5  Hauler
Wasp        5  4  5  7  4  4  Gunboat
Mule        4  4  3  4  4  4  All-Rounder
Drifter     6  5  4  6  3  5  Skirmisher
Hornet      7  5  3  7  3  6  Gunboat
Ironback    5  6  6  4 10  2  Workhorse
Hawser      4  5  8  3  5  7  Hauler
Bastion     8  7  2  7  7  7  Brawler
Atlas       6  7  3  4  6  6  Hauler
Ranger      7  6  1  6  6  2  Workhorse
Warden      8  8  2  7 10  8  Gunboat
Colossus    9  9  7  2  9  9  Brawler
Leviathan   9 10  7  2  8  9  Brawler
Saucer      8 10  8 10  2 10  Hauler
```

An empty fit now reads Firepower 1 with "No gun fitted"; the starter fallback gun is not counted.

## Evidence (real runs, 2026-11-06)

- `node --test test/ship-stats.test.mjs` — **16/16 pass**.
- `node --test test/part-facts.test.mjs` — **9/9 pass**.
- `node scripts/check-ui-screen-imports.mjs` — **55 UI screen imports ok, 0 fail**.
- `node scripts/check-type-floor.mjs` — **OK, 2426 sizes inspected**.
- `node scripts/check-player-facing-labels.mjs` — **OK**.
- `node scripts/check-ui-a11y.mjs` — **all listed checks ok**.
- `node scripts/extract-localization.mjs --check` — **OK** after the generator write.
- `node scripts/check-new-game-layout.mjs --headless` — **PASS** at 1024×768, 1280×720 and 1440×900; the exact six-stop tab order holds.
- `node scripts/ui-bench.mjs --shot=station-shipworks`, `--shot=ship`, `--shot=new-game` — all render clean; the PNGs were opened. The shipworks shot now shows six bounded bars, `Starter · Skirmisher`, one meaning line and `Details`; the raw mass/energy/shield/cargo/thrust/heat gauges are no longer on the surface.
- Focused chooser probe: opening the Hitch weapon slot renders `FIGHT 10` / `WORK 2` intent headings, `Gun · S · Mk I` rows, authored sentences and `+1.9 Firepower` style tenths deltas.

## Not done / open — stated plainly

- **Scanner build badge not rewired.** `src/ui/targetPanel.js` still prints the label stamped by
  `systems/buildIdentity.js`; it is outside the P1/P2 write set. The ship sheet no longer reuses the
  scanner's `Gunship` / `Generalist` words, and it prints the authored hull class beside its own
  build word, so the two surfaces no longer give the same word two meanings. A follow-up should call
  `buildIdentityForStats` from the badge and retire the duplicate vocabulary.
- **THE SHIP's systems column no longer prints a raw draw number**: it reads `0/1 fitted` and
  `stock`, which are fit-state words, not engineering units. The engineering numbers are behind the
  sheet's `Details` door (and the Record verb, an explicit disclosure). Follow-up only if the Record
  grid should fold into the same door.
- **Blind comprehension check.** Still needs a second reader. The two sheets to hand over are
  `shipStatSheet({shipId:'ship_hornet',fittings:[…]})` vs `shipStatSheet({shipId:'ship_hawser',…})`;
  the model now names Hornet a Gunboat and Hawser a Hauler, with Speed/Toughness deciding the drag
  race.
- **Starter fits still share most bars.** Hitch and Pelican now read different words
  (`Skirmisher` vs `Hauler`) but still share five of six whole bars; a real fit re-tune is content
  work, not a model change.
- **The 5-minute `ui-bench --walk` run did not finish.** It stopped after step 13 (`Details`) while
  writing walk screenshots; the focused chooser and the three still shots above did complete. Treat
  the walk as unverified, not as a pass.
- Localization was regenerated with the existing generator; the readiness/catalog files are part of
  the generated diff.
