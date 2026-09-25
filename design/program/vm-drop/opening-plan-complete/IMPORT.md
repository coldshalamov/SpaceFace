# IMPORT — opening-plan-complete

## What it is

Soft-GPU opening cook was early-exiting `opening.plan` with
`opening-plan-incomplete` because crucible/DirectAuthoredAdmission wasp
boundaries contributed only an `authoredResolvingMarker` leaf with **no**
verified content hash. That poisoned `blockingRootsHaveVerifiedBoundaryHashes`
and skipped residency + first-draw receipt (identity/plan hole).

Fix: resolving markers are not opening submission leaves; entity/shadow
censuses skip `awaiting-authored-admission` / `loading` boundaries. Mid-flight
admission owns those ships once the GLB lands.

## How to apply

```bash
git fetch origin
git checkout -B import/opening-plan-complete origin/master
git am design/program/vm-drop/opening-plan-complete/patches/*.patch
node --test test/opening-plan-awaiting-authored-skip.test.mjs test/opening-submission-plan.test.mjs
```

## Apply order

Clean on bare `origin/master` @ `59df2a08ed9684e947f79d88e1d41f5c59acbee0`.
Independent of hitch-opening-drain / shader-admission-slice. **Recommended pair:**
import hitch-opening-drain after this so soft-GPU does not still burn ~3 s in
`opening.planWait` once the plan can complete.

## Picture defaults

Untouched.
