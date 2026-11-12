# PERF-02 — Why the world runs at 0.68× in Swarm round 20

**Lane 2.** Ruling 4: sim/real ≥ 0.98 in Swarm round 20. Pinned profile (seed 4242, after 883a1ba3): **sim/wall 0.68**,
main thread 0.15 % idle, 180 long tasks in 15 s. The sim runs in `src/core/wholeSimBrowserWorker.js`. Three things can slow
the world, and nobody has measured which:
1. **The worker's own step cost** — a 1/60 s tick that takes > 16.7 ms of worker time can never keep up.
2. **The heartbeat hold** — `LOCAL_HEARTBEAT_HOLD_MS = 250`: the worker holds its clock when the main thread posts no rAF
   heartbeat for 250 ms. With 180 long tasks, some main-thread frames may exceed 250 ms.
3. **The catch-up cap** — `LOCAL_MAX_STEPS = 4` / `LOCAL_HITCH_CATCHUP_STEPS` per timer tick: owed time beyond the cap is
   dropped (read how owed ticks carry — 366db367 changed it).
(`LOCAL_MAX_UNACKED = 4` does *not* stall the sim — it merges replies.)

## Job
1. **Instrument** (counters only, no behaviour change, dev-only or behind the existing diagnostics read): per 15 s window —
   worker ms per tick (p50/p95), ticks stepped vs wall-owed, ms spent held by the heartbeat gate, ticks dropped by the cap.
   Read them through the existing diagnostics surface (`getDiagnostics` on the lane; find how PERF-01's profile reads
   `sim/wall`).
2. **Measure** Swarm round 20 (launch like `scripts/fleet/looks/throw.mjs`, `?swarmRound=20`) through the lock, 3 windows.
   Put the table in the receipt.
3. **Fix the biggest cause:**
   - step cost → profile the worker (CPU profile of the worker target) and cut the top owner without changing results
     (`npm run check:sim` v27 must still pass byte-identical);
   - heartbeat hold → hold only when the main thread has been silent for a real stall (e.g. 500 ms+, or count missed beats
     rather than wall time), keeping the anti-teleport intent written above the constant;
   - catch-up cap → carry owed ticks rather than dropping them, bounded so a long stall still re-seats cleanly.
   One change at a time, re-measure, keep what moves sim/wall.

## Rules
Determinism (`state.rng`, `state.simTime`); v27 replay identical; the anti-freeze-teleport contract above
`LOCAL_HEARTBEAT_HOLD_MS` must still hold (a 2 s main-thread stall must not jump the world seconds ahead — add a test).
Only through the lock; no other measurement while yours runs. Tests: `test/*whole-sim*`, `test/*snapshot-fence*`,
`test/presented-clock.test.mjs`, `npm run gate -- --quick`. Commits: `perf(PERF-02): <what> (<sim/wall before → after>)`.

## Follow-up (lead review of dc5f5c03, 2026-11-12)
dc5f5c03 raised `LOCAL_WORK_BUDGET_MS` 24 → 72: sim/wall 0.41–0.59 → 0.89–0.99 (v27 identical, gate pass — accepted).
Not measured: the **main thread**. Main-thread long tasks across the three windows rose 129/52/90 → 118/101/116 (271 → 335),
consistent with larger merged replies costing `applyTickReply` more per frame. Measure, same route/seed, back to back,
`scripts/probe-main-thread-profile.mjs --swarm-round=20` before (`LOCAL_WORK_BUDGET_MS = 24`, a local edit you revert) and
after: **rAF fps, idle %, long tasks, `applyTickReply` ms p95**. If fps or idle got worse, keep the sim pace but bound the
main-thread cost: e.g. cap steps merged into one reply and carry the rest to the next reply, or apply a large reply's
records across two frames. Report the table; commit only a measured improvement.
