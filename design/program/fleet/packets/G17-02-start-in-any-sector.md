# G17-02 — Start an Adventure run in any sector (a tool for look and town work)

**Lane 3.** Commission EC-G17 The workbench. Sibling of G17-01 (`?swarmRound=N`, commit 2f8b164a —
read how it was built in `src/main.js` and copy its shape).

## What to build
1. **`?sector=<id>`** on the browser build: skips the title, starts a fresh Adventure game with the
   default seed (or `?seed=N`), and places the player in sector `<id>` (e.g. `sector_vesta_forge`,
   `sector_ceres_belt`, `tethys`, `helios_core`) at that sector's normal arrival point, in flight.
   Use the game's own sector-transition/arrival owner — find how a gate jump or a new game places the
   ship (`grep -rn "sector:enter\|arrival\|spawnPlayerInSector\|enterSector" src/systems src/core | head`)
   — never teleport by writing the position. Invalid id: start normally and log one plain line.
2. **`?shot=1`** (only together with `?sector=`): after the sector has finished loading and 3 s of sim
   have passed, set `window.__sfShotReady = true` so a script can take a picture.
3. **A capture script** `scripts/fleet/looks/sector-shots.mjs`: for each sector id given on the command
   line (default: the seven ids in `src/data/sectorVisualProfiles.js` plus `helios_core`), open
   `?sector=<id>&shot=1` in Playwright (copy the launch in `scripts/fleet/looks/context-wheel.mjs`,
   real GPU flags), wait for `__sfShotReady`, and save `.devshots/fleet/looks/sectors/<id>.png` at
   1280×720, then a contact sheet `.devshots/fleet/looks/sectors/sheet.png` (2 rows). Run it under the lock:
   `node scripts/fleet/game-lock.mjs run -- node scripts/fleet/looks/sector-shots.mjs`.
4. One line in `scripts/AGENTS.md`.

## Files you may edit
`src/main.js` (the URL-parameter block only), the arrival/transition owner if a small entry point is
needed (name it), new `scripts/fleet/looks/sector-shots.mjs`, `scripts/AGENTS.md`, new
`test/start-in-sector.test.mjs` (the pure part: parse/validate the id). `git diff` first. Dev-only:
nothing changes without the parameter.

## Done when
The capture script produces one picture per sector and the sheet, and you describe each picture in one
line in your receipt (what place it is, is the ship visible). Commit:
`fleet(G17-02): start in any sector, and a script that photographs every sector`.
