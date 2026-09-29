# FB-092 — Sector arrival prewarms an enumerated roster the way the Crucible already does

**Kind:** build · **Lane:** THE MACHINE · **Routing:** open
**Seam tags:** seam: renderer.js, seam: openingSubmissionPlan.js, seam: latePipelineAdmission.js
**Write-set:** `src/render/renderer.js`, `src/render/openingSubmissionPlan.js`, `src/render/latePipelineAdmission.js`, `test/fb-sector-arrival-roster.test.mjs`
**Neighbours (extend, never restate):** SFQ-B212, NXB-060

## The gap
The Crucible warms a finite enumerated roster behind the loading shell (`_admitSurvivalRosterPrewarm`,
`crucibleWarmPackageResidency.js`). Sector arrival instead warms a predicted population; anything mispredicted
lands in `collectUncompiledSceneDrawables` and links inside a drawn frame. The header of
`src/render/latePipelineAdmission.js` states the prediction failure outright.

## Why this direction
More prediction heuristics were rejected; the Crucible path proves an enumerated census works.
`createOpeningProducerCensus` and `combineOpeningProducerCensuses` in `openingSubmissionPlan.js` already build
the census shape from real producers, so the arrival roster is a composition of existing pieces.

## Mechanism
- On `sector:enter`, build a roster from the sector's resident records plus the traffic role mix (what will
  actually spawn in the first minute), through `createOpeningProducerCensus` per producer and
  `combineOpeningProducerCensuses`.
- Feed that roster into the same warm path the Crucible uses, bounded by the existing residency byte budget;
  keep the predicted path as the fallback for anything the roster missed.
- Publish `+state.render.arrivalRosterMiss` (count of drawables that still reached
  `collectUncompiledSceneDrawables` in the first 600 presents) so the number is visible in the witness.

## Done when
Seed 4242 jump Helios→Ceres: `+arrivalRosterMiss` ≤ 2 in the first 600 presents (baseline recorded first);
`probe-frame-solid` shader links inside drawn frames drop to zero on the arrival window;
`test/fb-sector-arrival-roster.test.mjs` pins the roster contents for the seed.

## Do not
Do not prewarm every sector at boot. Do not evict the player shell or the current sector's opening cohort to
make room (governor roles stay pinned). Do not measure with a still.

## Focus test starting points
- `test/survival-arena-roster-prewarm.test.mjs`
- `test/sector-prewarm-boundary-generation.test.mjs`
- `test/authored-precompile-residency.test.mjs`
