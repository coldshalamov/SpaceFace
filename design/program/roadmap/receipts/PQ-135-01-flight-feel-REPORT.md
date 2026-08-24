<!-- LIFETIME: HISTORICAL -->
# PQ-135.01 — Player flight feel receipt

- **packetId:** PQ-135
- **leafId:** PQ-135.01
- **candidateCommit:** (the commit carrying this receipt)
- **disposition:** PASS
- **acceptance:** focused_green

## Premise correction (measured)

The famous "2.0 s throttle response" was a peak-window measurement artifact; useful low-speed 10–90
was 0.667 s (Hitch). The real defects were: every fighter hull shared one feel (Hitch and Drifter
IDENTICAL — same medium reaction drive; the kernel commands acceleration, so mass cancels), and a
global translation bump was the only per-player tuning that existed.

## What changed

Per-hull feel envelopes (`src/data/flightFeelEnvelopes.js`, new) consumed by live flight
(`flightV3.js` / `flight.js`): Hitch crisp starter (useful 10–90 0.667→0.417 s), Wasp the fast
twitch (0.267 s, peak 206 WU/s, but bleeds speed and stops long — mass, not mush), Drifter the
deliberate multirole (0.617 s, no longer a Hitch clone), Atlas the heavy (nose-180 slowest at
2.28 s, velocity-reversal floor ≥5 s — crispness was NOT bought by deleting inertia, asserted).
Compatibility (legacy) flight got NO envelopes — putting them there moved the legacy 47-A golden,
so it was left byte-stable. Envelopes are skipped while a drawn route is active (the just-landed
governor stays untouched; tracking suite 21/21).

Motion Lab gained M2 (slalom) and M3 (reversal box, timing nose vs velocity separately so a
snap-turn cannot hide). M2 baseline: Hitch 6/6 gates; Wasp wider line, 2 misses, finishes first;
Atlas 3/6 and last. All scenario determinism gates hold.

## What passed (controller-verified)

motion-lab 7/7; draw-to-fly tracking 21/21; legacy 47-A hash unchanged; two-sided mutations both
red (Hitch given Drifter's envelope fails the crispness bar; Atlas given fighter envelopes fails
the heavy-order bar). LF endings; write set exactly respected.

## The V3 golden moved, deliberately

`sim-golden-diff --flight-system v3`: VERDICT MOTION_CHANGED — 10 entity motion fields (player
path under the same stick tape), projectile:hit and combat:damage 9→2, cue fanout 13→6,
combat:fire unchanged at 17 (same shots fired; the crisper ship evades — entity[2] shield
40.75→110). This is the owner-mandated feel change, causally reviewed; the envelope re-record
follows in its own commit per the envelope's documented procedure.

## Shared-change requests recorded

Ship catalog / getDerivedStats (mass visible without envelopes), propulsion kernel's
acceleration-not-force model, and the global 1.15 translation bump all belong to other owners and
were not touched.
