<!-- LIFETIME: HISTORICAL -->
# PQ-129.19 — Continue/load geometry residency receipt

- **packetId:** PQ-129
- **leafId:** PQ-129.19
- **candidateCommit:** (the commit carrying this receipt)
- **disposition:** PASS (mechanism landed; the player-visible pole did not reproduce)
- **acceptance:** focused_green

## What changed

Three mechanisms from the named causes (sweep #2 F1/F2/F3 + §8.4), each contract-tested:

1. **`yieldToNextPresent()` now resumes post-paint** (macrotask scheduled from inside rAF), so
   residency uploads and compile slices can no longer run inside the frame they claim to protect.
   This was a real correctness defect independent of any route's timing.
   `test/post-paint-yield.test.mjs` proves the ordering.
2. **Continue admits its geometry cohort behind the loading boundary** — the donor's clipped 1×1
   proxy admission (PR #100's `startupGpuResidency` rewrite) ported to the Continue route; at most
   one heavy queued boundary drains before the opening graph freezes; an execution-time token
   invalidates stale loading rAF callbacks so the handoff cannot race (the failure that killed the
   first attempt of this shape). `test/continue-geometry-cohort.test.mjs`.
3. **Ship aux pools stop growing inside prepareFrame** — pre-sized from the census at publication;
   overflow builds a detached replacement admitted post-paint and swapped, drawing existing
   capacity meanwhile. `test/ship-aux-prepare-frame-capacity.test.mjs`.

76/76 focused tests (lane), re-verified by the controller through the full gate battery below.

## The A/B (promotion law), quiet machine, `probe-runtime-witness --continue`

| | baseline (HEAD) | candidate |
|---|---|---|
| observed frames | 1209 | 1209 |
| hitches | **1** | **1** |
| presentation p95 / max | 3.0 / 3.9 ms | 3.0 / 3.7 ms |
| in-flight bloomScene max (180 samples) | ~1.4 ms | 1.4 ms |

**No hitch rise (the disqualifier), and no measurable presented-frame improvement either** — the
~730 ms brick class §8.4 recorded did NOT reproduce in presented frames in EITHER arm. One
~1.1 s `[GPU brick]` bloomScene event (geometries 13→19) still logs during Continue in
check:playable, and the witness places it BEHIND the loading boundary — the player never sees a
frozen frame (this is the §8.4 instrumentation blind spot: the warning cannot say which side of
the boundary it fired on). check:playable 16/16 on the candidate.

## Honest disposition

Accepted on correctness (the pre-paint yield defect and prepareFrame pool growth were real
mechanism bugs) and zero regression — NOT on a measured player-visible win, because the pole does
not manifest in presented frames on this machine's Continue route today. Residual, recorded: one
behind-the-boundary ~1.1 s admission event remains in the Continue load phase; it matters only if
a future witness run names it inside presented frames.
