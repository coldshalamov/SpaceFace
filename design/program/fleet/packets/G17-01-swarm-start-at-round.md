# G17-01 — Start a Swarm run at any round (a tool so builders can see round 20)

**Commission:** EC-G17 The workbench. **Size:** medium. **Tier:** Devin (SWE-2 Max) or better.

## Why
Every builder working on Swarm (enemies, bosses, named rounds, frame rate in busy rounds) needs to
look at round 20 or round 30. Today the only way is to play 20 rounds. Build a developer
shortcut that starts a Swarm run at round N, with a kit a player would plausibly have by then.

## What to build
1. **A URL parameter** for the browser build: `?swarmRound=N` (N = 1..30). When present, the game
   skips the title, starts a Swarm run in the default arena (or `?swarmArena=<name>` if given), and
   the first wave spawned is round N, with the round counter showing N.
   - Find how the game starts a Swarm run from the menu: search `src/` for the Swarm/Crucible
     launch (`grep -rln "ruleset" src/ui/crucibleLaunch.js src/systems/*swarm* src/systems/*survival*`,
     and `src/data/swarmMode.js` for `SWARM_RULESET`). Then find where the run's current round/wave
     index is stored and where wave 1 is chosen; start it at N instead.
   - Give the player scrap/credits equal to the sum of what rounds 1..N-1 would normally pay, if
     the run tracks a currency; if you cannot compute that, give a flat amount and say so.
   - Find an existing dev URL parameter in the boot code (`grep -rn "URLSearchParams" src/ui/bootEntry.js src/main*.js src/boot*.js`)
     and add yours the same way. It must do nothing when the parameter is absent.
2. **A player-truth flag** `--start-round=N` for `scripts/player-truth/run.mjs` that opens the game
   with that URL parameter. Look at how run.mjs builds its game URL (around line 314 it parses
   flags into an object `a`).
3. **One line** in `scripts/AGENTS.md` (or `tools/AGENTS.md` if that is where player-truth is
   documented) saying the flag exists and what it does.

## Files you may edit
- the boot/URL-parameter file you find (name it in the receipt)
- the Swarm run start / wave index files you find (name them)
- `scripts/player-truth/run.mjs`
- `scripts/AGENTS.md` (one line)
- one new test `test/swarm-start-at-round.test.mjs`
Before each existing file: `git diff -- <file>`; foreign changes → stop, report Blocked.

## Checks
1. `node --test test/swarm-start-at-round.test.mjs` — test the pure piece: the function that turns
   a requested round into the run's starting state (round index, currency) clamps to 1..30 and
   returns N for N in range.
2. `npm run player-truth -- --mode=swarm --start-round=20 --rounds=1` — report the last 30 lines of
   its output in the receipt, and whether the trace shows round 20 (not round 1). This boots a
   headless browser and can take several minutes; give it up to 10 minutes. If it fails for a
   reason unrelated to your change, paste the error and continue.

## Done when
`?swarmRound=20` and `--start-round=20` both put a player into round 20. Commit message:
`fleet(G17-01): builders can start a Swarm run at any round`.
