# P1 — the Ship Sheet — status

**2026-11-07, Lane 4 (SHIP). Final P1/P2 review pass: one tow law on the sheet and the band.**

## Done

| Piece | Where |
|---|---|
| The one pure stat model: six 1–10 stats, fixed documented anchors, build word from the shape (with the authored hull class as a near-tie), per-stat deltas in tenths, engineering block for Details | `src/ui/ship/shipStats.js` |
| The one DOM block: authored class + build word, one sentence, six pip rows, a meaning line that follows pointer/keyboard, a `Details` door holding the engineering numbers | `src/ui/ship/shipSheet.js` |
| Shipworks **and** THE SHIP lead with the sheet. The old engineering paragraph, hero numerals and the six raw gauges are gone from the surface; the chooser carries the six-stat delta, not engineering chips; the `Proposed fit` percentage strip is gone | `src/ui/station/screens/shipworks.js` |
| The dead band presenters (`heroHtml`, the handling/power/condition/identity detail branches) and the roster-relative `handlingProfileDomain()` / `handlingBandModel()` path are deleted from the fit screen | `shipworks.js` |
| New Game: the starter choice carries the sheet (compact), the meaning line stays in compact, the rows add no tab stops, the raw Mass/Thrust/Line arcs are gone, and the rail prints the sheet's authored class beside its build word (`Starter · Skirmisher`) | `src/ui/screens/newGame.js`, `src/ui/starterAirCard.js` |
| Firepower counts every damaging mount (including emergent primitives), ignores the phantom starter fallback gun, and pays each mount its own heat/energy duty. The ceiling is 3200: the strongest corrected full legal fit is **Leviathan 2184.48**, so no hull saturates at 10 | `shipStats.firepowerRawFor`, `SHIP_STAT_DEFS` |
| Speed reads the governed fight speed times the live burner gain (`boost.topSpeedPct`), never the boost reservoir | `shipStats.speedRawFor` |
| Power is a duration: `sustainedFireForFit` seconds, with the capacitor reserve at a documented 20/s reference draw when the limit is open or no gun is fitted | `shipStats.powerRawFor` |
| Muscle is the tow class rated at the hull's DRY mass (`hasTowRating` reads that dry rating); cargo only ever lowers it. The capability band names the heaviest roster hull at or under the SAME `towClassMassFor` rating, so the bar and the band's lead cannot disagree. A hull with no rating says "No Line load — this hull rams instead."; a rated hull whose hold is heavier than the drive says "Too loaded to tow." | `shipStats.muscleRawFor`, `shipCapabilities.hasTowRating` / `towClassMassFor` / `towPickFor`, `shipBandModels.leadFromTow` |
| Hover deltas print `before → after (+0.2)` in **tenths** (`6.3 → 5.5 (−0.8)`), never the contradiction `6 → 6 (−0.8)`; the aria text carries the exact after tenths. Each mounted sheet gets its own Details id | `shipSheet.js`, `deckplate/shipSheetStyles.js` |
| The hull record (`entityResolver.hullDossier`), the Shipworks side panel and the scanned-target badge all speak the sheet's class + build word. The hull record no longer repeats a raw Role fact; Hull/Cargo and module Mass/draw sit behind a Details disclosure. The old roster-relative `handlingBandModel` paragraph and the raw side-panel module tonnes / power-used fraction are gone | `entityResolver.js`, `entityLinks.js`, `shipworks.js`, `targetPanel.js` |
| New Game mounts the compact sheet and no longer draws the raw Mass/Thrust/Line arcs. Starter rail labels print the authored class beside the build word (`Starter · Skirmisher`), and Hitch/Pelican/Wasp differ by at least two whole bars | `newGame.js`, `starterAirCard.js`, `data/newGameDefaults.js` |
| A11y: stat rows are honest focusable list items (no fake `role="button"`), the delta is in the aria-label, and the meaning line is `aria-hidden` rather than a duplicate live region | `shipSheet.js` |
| The model test: exactly six stats, 1–10 bounds, full-fit Firepower headroom, per-gun duty fuzz, speed/power/muscle meaning, monotonic same-fit mass, starter shapes, deltas, rendered a11y contract | `test/ship-stats.test.mjs` |

## The anchors (documented, frozen)

`SHIP_STAT_DEFS` in `shipStats.js`. `floor` scores 1, `ceiling` scores 10, log-linear between.

| Stat | Raw reading (existing owner) | floor | ceiling |
|---|---|---|---|
| Firepower | each fitted gun's burst dps × its own heat/capacitor duty | 10 | 3200 |
| Toughness | `(hull + armour)/damageReduction + 1.3·shield` | 125 | 9000 |
| Speed | `governedFightSpeedFor × (1 + boost.topSpeedPct)` | 130 | 430 |
| Handling | `governedYawRateFor^0.65 · (brake/30)^0.35 · 10` | 6.5 | 90 |
| Power | `sustainedFireForFit.seconds`; when open/none, `(capMax + 5·capRegen) / 20` | 2 | 300 |
| Muscle | `towClassMassFor` rated at dry mass; when the hull has no rating, `0.15 · dry mass` | 8 | 4000 |

## Roster reading (full legal fit, 2026-11-06)

Columns are Firepower / Toughness / Speed / Handling / Power / Muscle, then the build word.

```
Hitch       4  3  4  6  3  4  Skirmisher
Pelican     4  3  4  6  4  5  Hauler
Wasp        5  4  5  7  4  4  Gunboat
Mule        4  4  3  4  4  4  All-Rounder
Drifter     6  5  4  6  3  5  Skirmisher
Hornet      6  5  3  7  3  6  Gunboat
Ironback    4  6  6  4 10  2  Workhorse
Hawser      4  5  8  3  5  7  Hauler
Bastion     8  7  2  7  7  7  Brawler
Atlas       6  7  3  4  6  6  Hauler
Ranger      7  6  1  6  6  2  Workhorse
Warden      8  8  2  7 10  8  Gunboat
Colossus    9  9  7  2  9  9  Brawler
Leviathan   9 10  7  2  8  9  Brawler
Saucer      8 10  8 10  2 10  Hauler
```

Strongest full legal fit: **Leviathan, 2184.48 raw Firepower** — below the 3200 ceiling; no
hull reads 10. The corrected strongest-fit comparator (missing `mods` values read as `0`, not
`NaN`) is what produced this number.

An empty fit now reads Firepower 1 with "No damaging gun fitted"; the starter fallback gun is not
counted. Muscle cargo sweep (0/200/600/1000 t, empty and full legal fits, Mule/Kestrel/Atlas/Hawser)
never rises; an overloaded rated hull reads 0 and says "Too loaded to tow".

## Evidence (real runs, 2026-11-06)

- `node --test test/ship-stats.test.mjs` — **20/20 pass**.
- `node --test test/part-facts.test.mjs` — **10/10 pass**.
- `node scripts/check-ui-screen-imports.mjs` — **55 UI screen imports ok, 0 fail**.
- `node scripts/check-type-floor.mjs` — **OK, 2426 sizes inspected**.
- `node scripts/check-player-facing-labels.mjs` — **OK**.
- `node scripts/check-ui-a11y.mjs` — **exit 0, all listed checks ok**.
- `node scripts/check-outfitting-buy-fit.mjs` — **OK** after removing the dead engineering presenter from the check.
- `node scripts/check-new-game-layout.mjs --headless` — **PASS** at 1024×768, 1280×720 and 1440×900 on the final run (an earlier cold-start run timed out before boot); the exact six-stop tab order holds.
- `node scripts/ui-bench.mjs --shot=station-shipworks --shot=new-game` — both render clean; the PNGs were opened. The New Game shot shows the six-stat sheet and the classed rail labels (`STARTER · SKIRMISHER`, `MINING · HAULER`, `FIGHTER · SKIRMISHER`) with no Mass/Thrust/Line arcs. The Shipworks shot shows `STARTER · Skirmisher`, `1/7 systems fitted`, no module tonnes or power-used fraction, and no raw variant-percentage row.

### 2026-11-07 follow-up (one tow law + one-source sweep)

- `node --test test/ship-stats.test.mjs test/part-facts.test.mjs` — **30/30 pass** (20 + 10).
- `node --test test/lg-tow-predict.test.mjs test/ship-tow-consistency.test.mjs test/ship-surface-consistency.test.mjs` — **12/12 pass** (3 + 4 + 5). The tow check covers Atlas/Hawser, Mule/Ironback and every roster pair with a rating.
- `node --test test/lg-hull-dossier.test.mjs test/lg-module-dossier.test.mjs test/pq-142-00-capability-verbs.test.mjs` — **10/10 pass**.
- `node scripts/check-player-facing-labels.mjs`, `check:outfitting-buy-fit` — **OK**; `check:ui-a11y` — **9 ok, 0 fail**; `check-ui-screen-imports` — **55 ok, 0 fail**.
- `node scripts/check-new-game-layout.mjs` — **PASS** at 1024×768, 1280×720 and 1440×900 on the final run. Two earlier runs stopped before New Game while waiting for the first-light `.sf-confirm` to detach (the same race reproduced headless); page issues were empty. The final run held the exact six-stop tab order.
- `node scripts/ui-bench.mjs --shot=station-shipworks --viewports=1280x800` — clean render; the buy column shows `Starter · Skirmisher` and a folded `Details` door.

## Not done / open — stated plainly

- **The `Details` door is the only raw-engineering reading, and it now records both what moved and
  what changed.** The old handling profile's `continuousDrain` reading (actually the always-on
  module draw, not weapon heat) is labelled `Draw · X/s continuous`. `Mass` is the **operational**
  mass (hull + modules + cargo), not `derived.mass` in isolation; the status below says so rather
  than pretending it is a dry hull figure.
- **The old `handlingProfile.js` module still exists for `shipBandModels.js` and
  `check-handling-profile.mjs`.** It is no longer reachable from the P1 hull surfaces
  (`entityResolver.hullDossier` now reads the sheet; `outfittingGuidance.buildOutfittingEngineeringFeel`
  and `outfittingEngineeringFeelHtml` are deleted). Retiring the band-model tests and that module
  is a separate cleanup, not a claim that the P1 surface still prints roster-relative bands.
- **The station frame still owns an empty, hidden `.sx-sw__gauges` element.** The rack's values are
  no longer computed or synced; the six engineering readings live behind the sheet's `Details`
  door. Deleting the element itself needs the `stationFrames.js` owner, outside this write set.
- **Blind comprehension check.** Still needs a second reader. The two sheets to hand over are
  `shipStatSheet({shipId:'ship_hornet',fittings:[…]})` vs `shipStatSheet({shipId:'ship_hawser',…})`;
  the model names Hornet a Gunboat and Hawser a Hauler, with Speed/Toughness deciding the drag
  race.
- **Starter content is only minimally retuned.** The Hitch now carries the shield liner (one module
  swap), which gives every starter pair at least two whole-bar differences and a unique
  class + build label. The authored blurbs, first-ten-minutes copy and the wider starter fit
  ladder are still content work, not a model change.
- **The 5-minute `ui-bench --walk` run did not finish.** It stopped after step 13 (`Details`) while
  writing walk screenshots; the focused chooser and the still shots above did complete. Treat the
  walk as unverified, not as a pass.
- Localization was regenerated with the existing generator; the readiness/catalog files are part of
  the generated diff.
