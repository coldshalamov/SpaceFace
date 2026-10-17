Fixed D203: seed 47 reaches `extract` at **tick 11,247**, within the unchanged 12,000-tick cutoff.

The controller unnecessarily parked an aligned exterior head until carrier realignment finished. The carrier guard also used a radius-expanded box that falsely overlapped the released plate.

The fix allows collision-clear retraction during carrier return, stages before final docking, and encloses the measured head geometry with conservative rotation padding. Physics numbers and finite recovery deadlines remain unchanged.

Files changed:

- [src/systems/ceresWorkfleet.js](/C:/Users/93rob/Documents/GitHub/SpaceFace/src/systems/ceresWorkfleet.js)
- [src/systems/ceresWorkfleetRecovery.js](/C:/Users/93rob/Documents/GitHub/SpaceFace/src/systems/ceresWorkfleetRecovery.js)
- [test/ceres-head-late-sweep.test.mjs](/C:/Users/93rob/Documents/GitHub/SpaceFace/test/ceres-head-late-sweep.test.mjs) — added regression coverage for false contact and real-obstacle rejection; existing assertions and tolerances unchanged.

Focused test result:

```text
ℹ tests 1
ℹ pass 1
ℹ fail 0
```

All 67 targeted checks passed; sim/save comparison produced matching hashes.

Adjacent issue, left unfixed: [ceres-workfleet-recovery.test.mjs:101](/C:/Users/93rob/Documents/GitHub/SpaceFace/test/ceres-workfleet-recovery.test.mjs:101) depends on setup from an earlier test. Running that case alone with a name filter throws because `earned` is undefined.