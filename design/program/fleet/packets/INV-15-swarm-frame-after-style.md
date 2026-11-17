# INV-15 — Why is Swarm still ~30 fps after STYLE-03? (READ-ONLY, CDP trace)

You change no tracked file. Files only under `.devshots/fleet/inv15/`. After STYLE-03 (`d96d708867`) the headed acceptance
run measured Adventure 16.9 → 51.7 fps but Swarm flat at ~30 fps (`.devshots/fleet/runs/ACCEPT-04-*/RECEIPT.md`). Repeat your
INV-14 trace (`.devshots/fleet/inv14/`, same categories) on **Swarm only**, 10 s of steady round-1 fight after the first
hostile, and a second 10 s window in round 3 if you can reach it (`?swarmRound=3`). One lock hold; never kill a holder
you did not start.
Report the per-frame budget table (JS / style / worker messages / composite / paint / GC / GPU sync / idle, summing to
the frame), next to INV-14's Swarm column; the top 20 JS functions by self time with url:line; style recalc ms and its
invalidation sources if still non-trivial; `renderer.info.render.calls` and triangles; and the top 3 levers with evidence.
