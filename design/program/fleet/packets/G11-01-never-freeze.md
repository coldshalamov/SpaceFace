# G11-01 — The game never freezes and never jumps

**Commission:** EC-G11 (a machine that keeps its promises); master plan E1/E2/E10. **Tier:** L (or the
strongest agent available). **Size:** large; diagnosis first, then one fix at a time.

## The owner's words
"It freezes a lot where it's just blipping — the spinning speed gauge is spinning, the 3D models are
revolving in place, but they're not physically changing location — then it blips and everything's in
a new place."

## What is already known (verified 2026-11-09/10)
- The simulation runs in a worker. In busy scenes its step is slower than real time (p95 ≈ 58 ms,
  max ≈ 458 ms for a 16.7 ms tick); the worker **drops owed time**, so the sim runs at 0.11–0.40× real
  speed while busy. Replies reach the main thread at 2–10 Hz instead of 60.
- The presentation fence (`bd1b166`, E1) now covers a single 400 ms gap: a held-throttle capture went
  from 28 bad frames / 3.08 s of held pose to 4 / 0 s. **Short single gaps are handled.**
- What is NOT handled: a **sustained** slow sim. The fence extrapolates ~200 ms, then holds the last
  pose; ship and bodies stop while decor that runs on the wall clock keeps moving (the speed dial's
  WAAPI ring, idle spins, `_bgTime`, shader time). When the next snapshot arrives, everything snaps.
  That is exactly the owner's description.
- Cost centres: ~74 % of physics time is JS per-body passes; ~1.55 MB allocated per tick; an economy
  burst of ~52 ms (economy slicing exists behind `simCoreFlags.economySlicing`, OFF).

## The plan — presentation first (fast, felt immediately), then the sim cost
**Step 0 — measure on a quiet machine.** No fleet workers, no other games running (host contention
alone moves this game from 60 to 40 fps). Use `scripts/player-truth/freezeWatch.mjs` and the E10
frame-truth tooling in a busy scene: Swarm `?swarmRound=20` and crowded Helios. Record the
**inter-snapshot gap distribution** (p50/p95/max and how gaps cluster) and the sim-time/real-time
ratio over 60 s. Save the numbers in `design/program/fleet/drafts/G11-measure.md`.

**Step 1 — one clock.** Everything the player sees moving runs on the presented sim clock, not the
wall clock: the speed dial ring, idle spins, background time, shader time. When the sim slows, the
whole picture slows together; nothing spins while the world stands still. (Find wall-clock users:
`grep -rn "performance.now\|Date.now\|requestAnimationFrame" src/render src/ui | grep -v test`.)

**Step 2 — adaptive playout.** Replace hold-then-snap with continuous presentation at the rate the
sim actually delivers: present at `latestSnapshotSimTime − delay`, where `delay` tracks the recent
p95 snapshot interval (bounded, e.g. 50–300 ms), and advance the presented sim time at the measured
sim/real ratio. Result: when the sim is slow, motion is slower but continuous (like a mild slow-mo),
never a freeze followed by a jump. Never extrapolate past a known collision/deceleration — the E1
residual frames were exactly that.

**Step 3 — make the sim cheaper** (the real cure; only after 1–2 so the felt problem is gone first):
turn on economy slicing if the v26 replay agrees (`npm run check:sim`), then the per-body JS passes
and per-tick allocations. One change at a time, matched A/B on the quiet machine, keep what moves.

## Done when
On the quiet machine, 60 s of Swarm round 20 and 60 s of crowded Helios show **zero held-pose frames
and zero position jumps** larger than one frame's worth of motion, the speed dial never moves while
the ship stands still, and `npm run gate` passes. Two 10-second clips (before/after) for the owner.
