<!-- LIFETIME: HISTORICAL -->
# PQ-135.03 — Hull-relative enemy capability envelopes receipt

- **packetId:** PQ-135
- **leafId:** PQ-135.03
- **candidateCommit:** (the commit carrying this receipt)
- **disposition:** PASS
- **acceptance:** focused_green

## What changed

Enemy motion derives from the hull being flown. The kind-keyed maneuver caps remain the planning
base; the spawned hull scales them from THE SAME player feel rows (`flightFeelEnvelopes.js` — one
truth table, no parallel constants): Wasp is the identity reference (historical caps preserved, so
47-A scavenger behavior is untouched), Atlas ~64% speed / ~55% yaw slew and waits longer before it
burns, Hitch/Drifter their own rows, Hornet shares Wasp, capitals share the capital row, unmapped
hulls (incl. the 47-A Mule) stay on old caps. Formation/hold/screen/intercept now command
desired-state (where to be, at what speed) through the thrusters — physics still owns motion.

## The differentiation table (same formation-follow intent, virtual slot)

Wasp vs Atlas: peak speed 57 vs 39 (37% spread), closing 52 vs 38 (30%), overshoot 123 vs 172
(33%), mean yaw rate 2.80 vs 0.71 (119%). Mutation: forcing one shared envelope collapses speed
spread to 1% and closing to 3% — the two-of-three ≥18% gate goes red. Motion Lab suite 9/9
(controller-verified).

## Goldens

Legacy and V3 hashes byte-identical before/after across 5 repeats (the 47-A harness does not run
tactical AI). No re-record needed or made.

## Honest residuals

Overshoot alone survives a shared envelope (mass does it), which is why the gate demands two
envelope metrics. Wing choreography (.04) and fodder cohort (.05) now have their prerequisite.
