# DONE — classify-pinfacts-cache

## Summary

`rebuildPinFacts` early-returns when entity-index membership, player intent pins,
attachments bag identity, and combat-trace length are unchanged. Damage pins keep a
`simTime` expiry so until-maps still clear. Also includes the closed-form catch-up
filter (`physicsBody === false` only).

## Before / after

### Offline microbench (primary — portable CPU)

| | pinFacts miss (full Set rebuild) | pinFacts cache hit |
|---|---|---|
| 400 aiShips + 40 projectiles × 5k iters | **54.5 ms** | **1.0 ms (~54×)** |

Catch-up closed-form (8k entities × 3k): full **510 ms** → closed **498 ms** (~1.02× in this
harness; prior closed-form package measured ~1.3×). Phase A cite: cpu-profile-flight
`classifyWorld` ~60–104 ms self settled.

### Focused tests

`test/activity-runtime.test.mjs` → **20/20**.

GPU tier: **software**. Owner iGPU fps not claimed.

## Evidence

- Patch: `patches/0001-perf-activity-pinFacts-rebuild-cache-closed-form-cat.patch`
- Scratch: `vm-work/classify-pinfacts` @ `a23a8619e`
- Microbench: `artifacts/classify-pinfacts-microbench.json`
- Tests: `artifacts/classify-pinfacts-focused-tests.log`
- Raw: `/workspace/spaceface-scratch/hitch-hillclimb-20260922/`
- Measured against master `a57d7036d`

## Apply order

Independent of opening-* / hitch-* packages. Safe alone on master `a57d7036d`.
Supersedes `classify-closed-form-scan`.

## Risks

- In-place mutation of `combat.attachments.byId` without replacing the bag object
  will not bust the cache (same reference). Live combat replaces/assigns attachments
  through normal seams; fixtures that mutate keys in place should bump membership.
- Closed-form movers must stamp `physicsBody: false` (travel-lanes already does).
