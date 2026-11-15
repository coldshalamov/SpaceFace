# INV-05 — Why does Adventure flight run at ~9 fps when Swarm runs at ~42? (READ-ONLY, measured)

**You change no tracked file.** Create files only under `.devshots/fleet/inv05/`. Output: RECEIPT.md with
numbers and `file:line` evidence. Mark anything not measured or read "UNVERIFIED".

## The observation
Headless demo routes on this laptop (`.devshots/fleet/inv02/{adventure,swarm}/report.md`): Adventure flight
averaged 9.1 fps (p50 100 ms, p95 183 ms, max 1.67 s, 3,534 long tasks over 50 ms in 8 min); Swarm averaged
42 fps on the same machine and harness.

## Do this
1. Write a probe under `.devshots/fleet/inv05/` that boots the Adventure opening the way
   `scripts/fleet/looks/demo-route.mjs --route=adventure` does (reuse its title→New Game code via
   `scripts/lib/titleRoute.mjs` `pressNewGame`), or boots `/?sector=sector_helios_prime` if that reaches
   flight directly, with the same Chromium flags as `scripts/fleet/looks/scene-census.mjs`. Run ONLY through
   the lock: `node scripts/fleet/game-lock.mjs run -- node .devshots/fleet/inv05/probe.mjs`.
2. Once flying, for 30 s record: frame intervals (rAF deltas: p50/p95/max), `renderer.info.render`
   (calls, triangles) and `.programs.length`, the number of entities by type in `SF.state`, and the visible
   mesh count. Do the same for 30 s of Swarm round 1 (`/?swarmRound=1`) as the comparison.
3. In Adventure, take a 10 s CPU profile with the Chrome DevTools Protocol
   (`page.context().newCDPSession(page)`, `Profiler.enable` / `Profiler.start` / `Profiler.stop`). Aggregate
   self time by function + url:line; list the top 25. Also list the top 10 by total time.
4. Explain the difference: which functions/systems take Adventure's frame that Swarm does not have, or does
   not pay as much for. Point to the code.

## Receipt
Under **What the player now sees or feels**: the side-by-side table (fps, calls, tris, programs, entities),
the two top-25 tables, and your ranked list of the 5 biggest causes with evidence. Raw JSON paths.
