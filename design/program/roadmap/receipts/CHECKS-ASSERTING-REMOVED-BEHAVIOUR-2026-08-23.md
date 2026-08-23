# Three checks assert behaviour the game deliberately removed

**Date:** 2026-08-23
**Status:** diagnosed. Each needs a decision, and none should be fixed by editing its assertion.

A pattern worth naming, because it has now cost two investigations and nearly caused two wrong
"fixes". A check goes red. The obvious repair is to relax the assertion until it passes. In all three
cases below that would have hidden a deliberate design decision behind a green tick.

## 1. `check-47a-tactics` / `check-47a-live-branch`

Full write-up in `47A-DELIVER-BRANCH-2026-08-23.md`.

The covert-courier delivery needs the evidence spindle within 160 WU of the beacon. It starts at
145.6 — **inside** — and drifts to 234.6, because `6996ef65` deliberately removed the release
snap-correction that used to rotate a thrown payload onto the intercept angle. Its own comment:
*"release assistance never steers either endpoint."*

**Do not widen `maxDistance`.** The spindle starts inside the radius and leaves.

## 2. `check-depth-program-a1`

The plinth-scan check looks for a signal identity of the form `signal:entity:<runtime-id>` — a
**transient** id tied to a live entity. The game replaced that with a **stable** id after the test
was written: `src/data/landmarkMissions.js` builds `` `signal:poi:${definition.poiId}` `` and names
the variable `stableId`. There is no `signal:entity:` anywhere in `src/`.

The delegation lane assigned to fix this **correctly refused**, reporting that it could not make it
green "without editing its stale assertion or reintroducing transient POI identity". That was the
right call and is why this receipt exists.

**The decision:** update the check to the stable-identity contract (it is a genuinely better
contract — a discovery keyed to a runtime id cannot survive a reload), or state that transient
identity was wrongly removed. The first is almost certainly right, but it is a contract change and
should be made deliberately rather than as a side effect of chasing green.

## 3. The general rule this repo keeps re-learning

A red check is one of four things, and they need opposite responses:

| What it is | What to do |
| --- | --- |
| A real defect | Fix the code |
| A stale check against superseded design | Update the contract, deliberately, and say so |
| A check asserting REMOVED behaviour | Decide whether the removal was right. Never loosen quietly |
| A load artefact inside a big batch run | Re-run it alone first — three of today's were this |

The tell for the third case is that the check once passed and nothing near it changed. `git log` on
the assertion's subject, and the commit message of whatever last touched the behaviour, settles it in
a couple of minutes. Both of today's cases named the deliberate removal in the commit message of the
change that caused them.
