<!-- LIFETIME: HISTORICAL -->
# PQ-129.18 — Pole sweep receipt

- **packetId:** PQ-129
- **leafId:** PQ-129.18
- **candidateCommit:** 4ca52353
- **disposition:** PASS
- **acceptance:** focused_green

## What ran

The 2026-08-24 crowded-scene review IS the pole sweep (recorded in
`CANONICAL_BUILD_MAP.md` §8.4). A crowded scene was built deliberately
(218 draw calls, 12 nearby contacts) rather than an idle fly, and every
phase came in under the 16.7 ms budget: render p95 7.4 ms, presentation
p95 9.4 ms, sim p95 7.7 ms.

## What it decided

Seven of eight Wave C leaves (`.11`–`.17`) closed as no-ops because the
poles they assume do not exist on this machine; the per-leaf numbers are
in the §8.4 disposition table. `.18` itself is JUSTIFIED — only 71.3 %
of hitches got a named owner.

## What the sweep found instead

122 hitch frames (11.7 %) remain; the largest bucket is external
scheduling (55) plus unknown (35), outside the measured game phases. The
strongest in-game lead points back at Wave B territory: four more
`bloomScene` bricks of 219–496 ms, each accompanied by new
shader-program or geometry activity, while an authored background job
was still running — compile / upload / admission again, in the crowded
and Continue paths this time.

## Honest residuals

No GPU timestamp queries, so compilation, upload and driver stalls
cannot be separated precisely; 35 hitches remain unowned; the crowd was
synthetic, not an organic playthrough; the 30-pixel fighter case was
never exercised; the authored-settlement gate would not complete, so
this reflects the live fallback/admission state rather than a fully
settled fleet. Per this unit's own brief, the pole sweep is recurring
and "never done forever" — this receipt closes the 2026-08-24 pass only.
