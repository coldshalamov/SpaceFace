# INV-17 — What does the Swarm loading veil wait for, and why? (READ-ONLY, one lock hold)

You change no tracked file. Files only under `.devshots/fleet/inv17/`. Prior: your INV-08 (`.devshots/fleet/runs/INV-08-*/RECEIPT.md`):
Adventure lifts on `live.requiredFirstPicture` (4.7 s) while Swarm's `exact.current-sector` is 28.7 s (survival `live.cook`
11.4 s incl. `cook.rockPools` 7.3 s, awaited `preparePostOpeningPipelines` 10.2 s). LOAD-01 deferring the post-opening pass
just moved the time into `live.survivalBoundarySettle` / `live.materialSettle` — suggesting the veil waits for a queue to
drain. Since INV-08, ROCK-02 (`f9030cc934`) made every Swarm rock request its authored body and the triplanar family landed.

## Answer (one lock hold, three interleaved Swarm loads + one Adventure load, INV-13's workload calibration per run)
1. **Re-baseline on HEAD:** the cook ledger rows (both doors) and, for Swarm round 1, per-Wasp publish time and how many
   rock admissions sit in the four-slot link queue ahead of the Wasps (INV-10/11 instrumentation). Did ROCK-02 lengthen the
   cook or delay the Wasps?
2. **The gate:** trace the code from PLAY to the veil lift for Swarm and name exactly what the lift awaits (every promise /
   predicate in the chain, `file:line`), vs Adventure's `live.requiredFirstPicture` path. Is it "everything in the cook
   drained" or a defined first-picture set?
3. **Why it exists:** `git log -S` / blame the survival cook and its awaits (`live.cook`, the post-opening await in the
   survival path, the settles) and quote the commit messages: what in-fight failure was each built to prevent (shader
   hitches when the wave arrives? pop-in? the 15 s failsafe?). That failure is the regression check for any change.
4. Recommend the smallest gate change: lift Swarm's veil on a first-picture set (player, round-1 roster, the room, rocks in
   view) with the rest continuing after — and list what must be in that set so the fight doesn't pay (link counts / frames
   over 50 ms in the first 30 s are the measure).
Receipt: the tables, the gate chain, the history quotes, the recommendation.
