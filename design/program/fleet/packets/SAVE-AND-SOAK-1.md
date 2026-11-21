# SAVE-AND-SOAK-1 — old saves load, a Swarm run resumes, two hours without a crash

**For:** a careful engineer. **Kind:** release stability. **One commit per fix.**

## Why

The release list (`design/overhaul/13_RELEASE_LIST.md`, "Speed and stability") has three checks
nobody has done, and a great deal changed the shape of a save in the last two days: the cargo hold
became slots (save v24), the market became stored curves (`marketRows:2` inside the economy
blob), Swarm runs start at zero and perks no longer apply, five expeditions added save fields,
the Pilot Tree is being rebuilt, cadences changed. A player who updates the game must find their
save intact; a player who quits a Swarm run must be able to pick it up tomorrow; and the game
must survive a long sitting.

## Part A — every old save loads

1. Collect real saves of every version the game has shipped that still exist as fixtures
   (`ls test/fixtures/saves/`; `SAVE_SCHEMA.md`; `src/save/migrations.js`; `src/data/saveVersion.js`).
   Where a version has no fixture, make one by loading the nearest older fixture and saving
   through that version's migration, or note that it cannot be made.
2. Write `scripts/check-save-compat.mjs` (and an npm script `check:saves`): for each fixture, load
   it through the real load path headlessly (the same path `check:sim --reload-at` and the worker
   save tests use), assert no error or warning, then assert the things a player would notice:
   credits, ship and fitted gear, hold contents unit for unit (packed into slots, over-capacity
   kept as a tail, nothing lost), station storage, claims and built sites, reputation, mission
   state, discovered places, the pilot's skill points, settings and bindings (a restored profile
   with no control scheme gets Standard). Then save again and load that: it must be identical.
3. Fuzz: the branch that added the expeditions claimed a 5,000-case save fuzz; find it
   (`grep -rn "fuzz" test scripts | head`) and run it or its equivalent against today's code.
4. Fix every failure at the migration, not by loosening the check.

## Part B — a Swarm run can be left and resumed

Decide from the code what exists today (is a run saved at all between sessions? at round
boundaries? `src/core/runState.js`, `src/systems/runSession.js`, `src/systems/survivalRun.js`,
the save system's handling of an active run). The rule: quitting or closing the game during a run
keeps the run. On the title the Swarm door then offers **Resume run (round N)** beside starting a
new one. Resuming restores the round at its start (not mid-fight): the ship, its fittings, the
skills taken, Scrap, the arena, the seed and the round number, deterministically. A crash or a
closed window is treated like a quit. Build what is missing; test it headlessly (begin a run,
play to round 3 by the stress harness `scripts/sim-crowd-stress.mjs` or the run test helpers,
serialise, tear down, restore, compare) and once in the real game through the lock.

## Part C — two hours in each mode

1. `scripts/soak.mjs`: boots the real game in the browser through the ordinary route (reuse the
   capture tool's routes in `scripts/capture-opening.mjs`: it plays by real input), then loops a
   varied session (Adventure: fly, fight, mine, dock, trade, undock, jump sectors, open and close
   the map and menus, save; Swarm: play rounds, take cards, die, run again) for a set time.
   Every minute it records JS heap, DOM node count, WebGL resource counts
   (`renderer.info.memory` geometries and textures, programs), entity counts by kind, listeners if
   countable, frame time, worker step time, and every console error or warning. It writes a
   report and exits non-zero on a crash, a page error, a hang (no frame for 10 s), or a metric
   that climbs without bound (fit a slope over the last hour; flag heap, textures, geometries,
   entities or DOM nodes that grow steadily).
2. Run it for 30 minutes in each mode first (through the lock:
   `node scripts/fleet/game-lock.mjs run -- node scripts/soak.mjs --mode=adventure --minutes=30`),
   fix what it finds (leaks at their source: a listener never removed, a geometry never
   disposed, a list that only grows), then run the two-hour sittings when the lock queue is quiet
   (they block other agents' game runs: say when you start one).
3. "Zero errors behind the scenes in a normal run" is on the release list: every console error
   and warning the soak sees is either fixed or listed with its cause.

## Prove

In the receipt: the save-compat table (fixture, version, result), the fuzz result, how Swarm
resume works and its test, the soak graphs as numbers (start, one hour, two hours for each
metric), every leak or error found and fixed with its commit, and what remains.
`npm run check:sim` and `node scripts/fleet/game-lock.mjs run -- npm run check:playable` stay green.

## Files

`src/save/**`, `src/data/saveVersion.js`, the run-state save path, the title's Swarm door for the
Resume entry (logic and one row; a designer restyles that screen), new scripts under `scripts/`,
tests and fixtures. Shared files (`saveVersion.js`, `migrations.js`, `runState.js`, `mainMenu.js`):
use `bash scripts/fleet/own-commit.sh begin <file>` before editing and
`bash scripts/fleet/own-commit.sh commit "<message>" <files>`. Another lead is changing the Pilot
Tree's saved shape this evening: coordinate through the save version (take the next number after
whatever is at HEAD when you commit).
