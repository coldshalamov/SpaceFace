# INV-14 — Where does the other half of a flight frame go? (READ-ONLY, CDP trace)

You change no tracked file. Files only under `.devshots/fleet/inv14/`. Your INV-13 found flight CPU-bound: frames 67–83 ms,
but the measured presentation phase is only ~25–40 ms, UI ~2–3.5 ms, main-thread sim ~0 (worker). Half the frame is
outside the phases the game measures.

## Do this (one lock hold; never kill a holder you did not start)
Reuse your INV-08 trace setup (`.devshots/fleet/inv08/profile.mjs`: CDP Tracing with
`devtools.timeline, disabled-by-default-devtools.timeline, disabled-by-default-devtools.timeline.stack,
disabled-by-default-devtools.timeline.invalidationTracking, v8.execute, gpu`), but over **10 s of steady flight**
(Swarm round 1 after the first hostile, then the Adventure opening after 20 s of flight) — not the load.
Report per scene, per frame on average: main-thread RunTask breakdown — JS (top 15 functions by self time with
url:line), style recalc (and its invalidation sources), layout, paint, composite/commit, GC, `WaitForGetOffset` /
`GetBucketContents` / other GPU-sync waits, worker message handling, and idle. Also the GPU process busy time per frame
and whether the main thread blocks on it. Sum it to the frame time.
## Receipt
The per-frame budget table for both scenes (adds up to the frame), the biggest non-render bucket with its source
(`file:line` or Chrome stage), and the top 3 levers with evidence.
