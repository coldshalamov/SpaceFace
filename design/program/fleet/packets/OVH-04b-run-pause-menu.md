# OVH-04b [FE] — The pause menu inside a run offers only what a run needs

> **Pipeline (director, 2026-11-19):** make NO git writes. Edit surgically; other agents keep
> uncommitted work in the same files. Follow `docs/UI_VISUAL_ITERATION.md`: shoot the screen, open
> the PNG yourself, fix what you see, `--walk` the controls you changed.

**Design:** `design/overhaul/04_SWARM.md` §6.1 (a run lives in its own space) and §2 (the Bench is
the only menu in a run). Today the pause menu in a Swarm round (`src/ui/screens/pause.js`, frame
`.devshots/fleet/OVH-04/round-3-pause.png`) offers Adventure things: Save, Load, Quick save / Quick
load in the key strip, Mission Log, My Ship, Operations, Physics Challenges, Sandbox — while its own
brief says "This run is not saved."

## Do

1. In a Swarm run the pause menu shows: **Resume**, **Settings**, **Help / Controls**, **Photo**,
   **Records wall**, **End run** (keep the existing visual language; categories with one item fold).
   The key strip drops F5/F9. Adventure is unchanged.
2. Use the existing run predicate the screen already reads (or `isSwarmGlass(state)` from
   `src/ui/swarmGlass.js`); no new state.
3. Test: a Swarm-run pause lists exactly those entries and no save/load; an Adventure pause is
   unchanged (follow the existing pause tests: `grep -l "screens/pause.js" test/*.mjs`).
4. Shoot it: the pause shot in the UI bench for Adventure, and a Swarm pause (add a bench shot if
   none exists), open both PNGs, fix overlaps or orphaned category labels.

**Files:** `src/ui/screens/pause.js` (+ its stylesheet only if a folded category needs one rule), the
test, a bench shot entry if needed. **Done when:** both pause menus are seen on screen and the test passes.
