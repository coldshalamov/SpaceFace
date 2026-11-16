# INV-10 — What are hostile Wasps waiting on in `compiling-pipelines`? (READ-ONLY, measured)

**You change no tracked file.** Files only under `.devshots/fleet/inv10/`. Output: RECEIPT.md.

## Known
LOAD-01 (`.devshots/fleet/load01/pending.mjs`, headed `?swarmRound=1` → Armory → Launch round): at first contact
207 programs are linked, 22 with the `packed-orm` token, and only 9 new programs link in the next 12 s — yet every
admitted Wasp sits in `compiling-pipelines` for 10 s+ and 9 of 12 hostiles have no mesh at all. So the wait is
not shader linking. Hypothesis: in-flight admission pacing — the authored upgrade lane runs one job at a time and
late-present / forced-frame-budget checks in `src/render/partsLibrary.js` throttle it; or readiness polling in
`admitSubjectPipelines`. Your INV-09 run (`.devshots/fleet/runs/INV-09-*/RECEIPT.md`) saw a different route.

## Do this (through the lock; never kill a holder you did not start)
1. Reuse `.devshots/fleet/load01/pending.mjs`'s route. From Launch round for 15 s: a CDP CPU profile (1 ms) AND a
   per-frame log of the admission machinery — find in `partsLibrary.js` / `renderer.js` the upgrade/admission
   queue(s) and log each frame: queue length, jobs started/finished (entity id, phase), the budget value and
   whether the late-present / forced-frame-budget check deferred work, and each `admitSubjectPipelines` poll
   result. Wrap functions from the page (monkey-patch on the live objects) — do not edit tracked files.
2. Answer: per Wasp, the timeline from spawn → mesh created → `compiling-pipelines` → `ready`, and for each
   second of waiting what it was blocked on (queue position, budget deferral, a poll returning not-ready and
   why, main-thread busy elsewhere). Name the gate with `file:line`.
3. The 9 hostiles with no mesh: what decides when their admission starts?
## Receipt
The per-Wasp timeline, the blocking gate(s) with evidence, and the smallest change that admits round-1's
twelve Wasps within ~1 s of spawn without frames over 33 ms.
