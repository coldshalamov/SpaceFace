# COMPASS-FIX — east is on the right

**For:** a careful engineer. **Kind:** one rule and the words that follow from it. **One commit.**
Small: about twenty minutes.

## Why

Every map in the game now agrees with the 3D view (commit 27ed5e861c): north is up on the minimap,
the chart and the screen. But the game's compass words call the **left** side of the screen east.
A thing drawn to the right of the player's ship with north up is labelled "198 m · W" (open
`.devshots/maps2/axes-after/three-views.png`: the goal sits right of YOU on the chart and is
labelled W). Anyone who has read a map will take that for a bug. The pictures are right; the
words are mirrored.

The cause is one convention in `src/core/playerCompass.js`: "East is +x (screen left on that same
camera)". The world's x axis is an internal detail a player never sees. The player's compass is
defined by the screen: **north up, east right, south down, west left.**

## Do

1. In `src/core/playerCompass.js` make screen-right east: the bearing index, the names, the
   letters, `sharedPlayerHalf` and the cryo sentence all follow (world −x is east for the player).
   Rewrite the header comment to state the rule as "north is screen up, east is screen right" and
   say plainly that world +x is west. Keep the function names and signatures.
2. Find every place that turns a world offset into a compass word or a heading letter WITHOUT
   going through that module and route it through the module: search `src/` for
   `'east'|'west'|"E"|"W"|Hdg|heading.*[EW]\b|bearing` in the files that import `playerCompass` and
   in `src/ui/galaxyMap.js`, `src/ui/hud.js`, `src/ui/radar.js`, `src/ui/map/*`,
   `src/systems/barkDirector.js`, `src/systems/survivalAnnounce.js`, `src/systems/world.js`,
   `src/data/contactHail.js`, `src/data/frontierRumors.js`, `src/data/kettleLine.js`.
3. Authored lines that name a fixed direction by hand ("the eastern belt", "west of the
   station", "from the south and the north", gate names with a compass word): for each one found,
   check it against where the thing actually is under the new rule and correct the word. List
   every line you changed and every one you checked and left.
4. Do not change any picture: the minimap, the chart and the 3D view already agree. Do not change
   world coordinates, spawn positions or anything in the simulation's behaviour; only words.
5. Update the tests that pin the old rule (`test/player-compass.test.mjs`,
   `test/maps-2-chart.test.mjs`, `test/inf-brood-reserve-tell.test.mjs`,
   `test/inf-reinforce-tell.test.mjs`, `test/r2-air-02.test.mjs` and any other that asserts a
   compass word) to the new rule, with the rule in the assertion message: "north up, east right".
   Run each with `node --test <file>`; never the whole suite.
6. `npm run check:sim` must be unchanged (words only). If the English text catalogue is generated
   from source strings (`scripts/extract-localization.mjs`), regenerate it.

Commit with the message `The compass reads like a map: north up, east right, on every label`.
If a file you need is being edited by another agent (use `git status --short` to see), use
`bash scripts/fleet/own-commit.sh begin <file>` before editing and
`bash scripts/fleet/own-commit.sh commit "<message>" <files>`.

## Receipt

The rule as now written, the files changed, the authored lines corrected, the tests updated, and
one sentence confirming that an object drawn to the right of the ship is now labelled east on the
minimap, the chart and the objective card.
