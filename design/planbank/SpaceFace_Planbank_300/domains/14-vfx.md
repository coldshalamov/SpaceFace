# 14 — Causal VFX, force shapes and readable impact

**Current lane:** THE PICTURE / THE HAND  
**Build-map connections:** PQ-134, PQ-139; CV-HAND, CV-AMMO  
**15 proposed packets:** SF-196–SF-210

## Existing foundation, not a blank slate

There is already a presentation orchestrator, semantic recipes, force-language geometry and specialized projectile/bomb motion. Existing lifecycle tests cover field winding/decay; distinguish a missing hookup or visibility defect from absent mechanics.

This is a source-informed working description, not a fresh gameplay acceptance claim. Read current source before treating any subfeature as missing. [Source provenance](../SOURCE_PROVENANCE.md) records scope and limitations.

## Domain contract

VFX never changes simulation outcomes. Read fenced presentation state and the correct clock. Use authored geometry/strands/surfaces, not camera-facing fuzzy discs. Maintain ownership, pool reset, reduced-motion/flash information and default visual quality.

## Reusable implementation workflow

1. Trace the real simulation event through normalization, recipe, render owner and lifetime cleanup. Fix a missing connection before inventing another effect emitter.
2. Specify anticipation, action, impact and aftermath as shapes with causal direction, size and duration. Use achieved force/velocity/material where available.
3. Implement bounded pooled geometry with explicit spawn/update/release reset. Drive visual phase from the authoritative action phase rather than unrelated timers.
4. Reserve brightness/occlusion budget for the event that demands a player response. Reuse current audio/camera cue family rather than fan out duplicate events.
5. Test overlapping instances, reused slots, skipped presentation frames, paused simulation, camera changes and accessibility settings. Verify cleanup and zero double emission.
6. View normal and reduced-effects-information modes at shipping camera. A frame-perfect screenshot is insufficient for a motion effect: inspect the whole grow/persist/dissipate cycle.

## Ordinary-route proof

Trigger the effect through normal gameplay at normal zoom in open space, beside a bright station and inside a mixed Swarm fight.

Choose one seed/route and compare it before and after; keep the scenario's meaningful variables fixed. Use both a competent intended action and a plausible mistake. Source or headless proof cannot establish visual, audio, feel or frame-pacing quality; inspect/listen/play the relevant route where tools permit, otherwise report that portion unproven.

## Authoritative INFERENCE depth bars

- [WF-12: Vfx Camera Lighting And Visual Feel](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-12_VFX_CAMERA_LIGHTING_AND_VISUAL_FEEL.md)

Do not copy an entire workflow into a new instruction hierarchy. The selected packet resolves the creative direction; the live workflow still supplies the completeness bar. An existing compatible capability satisfies a dependency.

## Packets

- [SF-196 — Diagnose and restore the submitted force-surface shader](../plans/14-vfx/SF-196-diagnose-and-restore-the-submitted-force-surface-shader.md) — conditional repair
- [SF-197 — Thruster response from achieved work](../plans/14-vfx/SF-197-thruster-response-from-achieved-work.md) — deepening
- [SF-198 — A field volume whose edge means something](../plans/14-vfx/SF-198-a-field-volume-whose-edge-means-something.md) — deepening
- [SF-199 — A projectile with a continuous authored body](../plans/14-vfx/SF-199-a-projectile-with-a-continuous-authored-body.md) — deepening
- [SF-200 — Impact hierarchy from material and transferred force](../plans/14-vfx/SF-200-impact-hierarchy-from-material-and-transferred-force.md) — deepening
- [SF-201 — A kill that becomes a body before becoming spectacle](../plans/14-vfx/SF-201-a-kill-that-becomes-a-body-before-becoming-spectacle.md) — deepening
- [SF-202 — Rope release with a visible tangent and settling residue](../plans/14-vfx/SF-202-rope-release-with-a-visible-tangent-and-settling-residue.md) — deepening
- [SF-203 — Bomb phases that can be read in a crowd](../plans/14-vfx/SF-203-bomb-phases-that-can-be-read-in-a-crowd.md) — deepening
- [SF-204 — A moving hazard that keeps its visual center](../plans/14-vfx/SF-204-a-moving-hazard-that-keeps-its-visual-center.md) — deepening
- [SF-205 — A scar that grows from the actual hit](../plans/14-vfx/SF-205-a-scar-that-grows-from-the-actual-hit.md) — deepening
- [SF-206 — Reduced motion that keeps force information](../plans/14-vfx/SF-206-reduced-motion-that-keeps-force-information.md) — deepening
- [SF-207 — Effect competition resolved by meaning](../plans/14-vfx/SF-207-effect-competition-resolved-by-meaning.md) — deepening
- [SF-208 — A ricochet that shows the actual second path](../plans/14-vfx/SF-208-a-ricochet-that-shows-the-actual-second-path.md) — deepening
- [SF-209 — Industrial motion that stops for the right reason](../plans/14-vfx/SF-209-industrial-motion-that-stops-for-the-right-reason.md) — deepening
- [SF-210 — A VFX family with production-complete lifecycle ownership](../plans/14-vfx/SF-210-a-vfx-family-with-production-complete-lifecycle-ownership.md) — deepening

## Owner reading map

- [`src/render/vfx.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/render/vfx.js)
- [`src/render/actionVfx.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/render/actionVfx.js)
- [`src/render/bombPresentation.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/render/bombPresentation.js)
- [`src/render/masslinePresentation.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/render/masslinePresentation.js)
- [`src/systems/presentationOrchestrator.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/presentationOrchestrator.js)
- [`src/presentation/cueRecipes.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/presentation/cueRecipes.js)
- [`src/render/projectileMotionPresentation.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/render/projectileMotionPresentation.js)
- [`src/render/forceLanguage`](https://github.com/coldshalamov/SpaceFace/tree/c92756afb46a9115d47e9d1757369678023efce4/src/render/forceLanguage)
- [`src/render/forceLanguage/sweptSurfaceBatch.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/render/forceLanguage/sweptSurfaceBatch.js)

[Return to index](../INDEX.md) · [Execution contract](../EXECUTION_CONTRACT.md)
