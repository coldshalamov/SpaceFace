# DONE — radar-contact-list-reuse (measured miss — **not shipping patches**)

## Summary

Tried reusing `contactList` / `asteroidList` via `.length = 0` instead of
`= []` on dirty `refreshContacts`. Offline microbench (400 entities × 50k
refreshes): **~0.94×** (slightly slower / noise). V8 already makes short-lived
array headers cheap next to the scan loop.

## Evidence

- Scratch attempt on `vm-work/radar-contact-list-reuse` (reverted; no commit)
- Microbench: `/workspace/spaceface-scratch/hitch-hillclimb-20260922/radar-contact-list-reuse-microbench.json`
- Measured against master `35e519ebd`

## Next for this pole

Radar leftovers after trail-history-pool + project-scratch still open:
objectiveKey text writes, drawTrail stroke batching — measure before claiming.
