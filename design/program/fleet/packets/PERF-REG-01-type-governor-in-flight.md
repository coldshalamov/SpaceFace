# PERF-REG-01 — Frame-rate regression: the type governor and pad labels now dominate flight frames

INV-05b (`.devshots/fleet/runs/INV-05b-frame-rate-after.grok.*/RECEIPT.md`, probe `.devshots/fleet/inv05/`) re-measured
flight on HEAD `7a7b0315a1`: Adventure **29.3 → 18.0 fps**, Swarm round 1 **19.4 → 12.1 fps**, same laptop/settings as
INV-05 (`.devshots/fleet/runs/INV-05-*/RECEIPT.md`). Render phase barely moved; the **UI phase** doubled (Swarm p50 4.4
→ 10.5 ms; Adventure p95 16.4 → 40.7 ms). New top self-time in a 10 s Swarm profile:
- #2 `measure` `src/ui/orrery/typeGovernor.js:94` (calls `getComputedStyle`), 1351 ms = 10.9% — not in INV-05's top 25;
  also #2 in Adventure (864 ms).
- #3 `syncPadLabels` `src/ui/floatingText.js:210`, 648 ms = 5.2%.
- `querySelectorAll` from `src/ui/hudAvoidRects.js:64`, 211 ms (was 85).

Suspects (verify, don't assume): your LOAD-STYLE-02 commit `94404e2e53` (governStep/governTree/run stand down while
`loadingShellVisible`; tasks "stay queued" — does a backlog build during loading and then re-measure every frame in
flight? does `loadingShellVisible` ever stay true after the veil lifts, or flip each frame?), `9cfe72da04`,
`7dbe6c19fb`, `fbdaed530c`, and any UI commit since INV-05 (`git log --since="2026-11-15 18:00" -- src/ui`).

## Do this
1. Find the cause with evidence: count `governStep`/`measure` calls per second in flight and the queue length over
   time (a probe under `.devshots/fleet/perfreg01/`, through the lock, never killing a holder you did not start — reuse
   `.devshots/fleet/inv05/` route), on HEAD and with your suspect change reverted **in a scratch copy of the file
   loaded via the probe** (do not edit tracked files to bisect; or reason from code if a scratch load is impractical).
2. Fix the cause so the governor measures only what changed (a settled element is never re-measured each frame) and
   the pad labels / avoid-rect queries do no per-frame DOM queries in steady flight. Keep the loading-veil
   stand-down (it cut style recalc during loading) but make it not create in-flight work.
3. Re-run the INV-05 probe and report fps / UI phase / the two functions' self time before and after.
Exact-path commits; tests before/after for touched files.
