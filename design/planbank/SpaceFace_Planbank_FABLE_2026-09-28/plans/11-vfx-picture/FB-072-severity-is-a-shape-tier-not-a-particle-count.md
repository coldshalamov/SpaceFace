# FB-072 — Cue severity escalates by silhouette and layout, with particle counts held flat

**Kind:** deepening · **Lane:** THE PICTURE · **Routing:** open
**Seam tags:** seam: cueRecipes.js, seam: causalVfxGrammar.js
**Write-set:** `src/presentation/cueRecipes.js`, `src/presentation/causalVfxGrammar.js`, `test/fb-severity-shape-tier.test.mjs`
**Neighbours (extend, never restate):** SFQ-B188, NXB-049

## The gap
In `src/presentation/cueRecipes.js` the tether attach→near-break→break ladder and the kill tiers escalate
`budgets.particles` 48→96 and `cameraTrauma` 0.12→0.22. Severity is answered with more particles and more
shake, which the visual craft law forbids. `CAUSAL_VFX_GRAMMAR` already carries `silhouette`, `layout` and
`signaturePrimitive` per family, so a shape tier is available and unused.

## Why this direction
Bigger bursts were rejected by law. A shape ladder (cone→sheet→ring) reads at every zoom and under reduced
motion, where a count ladder collapses.

## Mechanism
- For each escalating recipe, replace the particle step with a `layout`/`signaturePrimitive` swap from the
  grammar and hold `particles` at the tier-1 value.
- Cap `cameraTrauma` per recipe at its tier-1 value; severity moves the directed impact kick (`stepCameraKick`
  in `camera.js`) along the real knock axis instead.
- Add a grammar assertion: within one recipe family, tiers differ in silhouette or layout, never only in count.

## Done when
`test/fb-severity-shape-tier.test.mjs` asserts the grammar rule over all recipes; the seed-4242 Crucible run's
VFX record shows tier-3 kills with the same particle budget as tier-1 and a distinct layout id; reduced-motion
run still distinguishes the three tiers by silhouette.

## Do not
Do not raise any particle budget. Do not add trauma. Do not remove the tier distinction.

## Focus test starting points
- `test/world-cue-recipes.test.mjs`
- `test/pq-165-03-reduced-motion-information.test.mjs`
