<!-- LIFETIME: STABLE -->
# Visual Direction and VFX Convergence

This document turns the repository's strongest existing visual decisions into one production direction for agentic work. It does not replace `docs/visual-assets/`, the frontend instrument grammar, Physics-as-Spectacle, PQ-134, or per-feature art laws. It tells the Central Brain how to allocate visual effort and what "coherent" means across those systems.

## 1. House direction: luminous arcade aerospace

SpaceFace should be bright, smooth, readable and authored without requiring maximal photorealism from every asset.

The hierarchy is:

- deep space is the darkest field;
- ships and world geometry carry clear material/faction identity;
- engines, machinery and active systems are brighter;
- weapons, fields, Massline forces, collisions and destruction carry the brightest causal energy;
- effects communicate what happened before they decorate the frame.

Physically coherent materials are useful because they make objects legible and consistent. Photorealistic microdetail is not the objective.

## 2. Normal-camera truth

The shipping camera decides the value of detail. For flyable ships, use the established chase camera and normal play size. For Asteroid Works, use the works camera. For UI, use the supported viewport/capture matrix.

A detail visible only in a beauty crop cannot justify repeated production cycles for ordinary-route acceptance.

Prioritize, in order:

1. silhouette and proportion;
2. large negative spaces/openings;
3. functional landmarks: canopy, drives, wells, weapons, machinery;
4. major material/value grouping;
5. faction/role markings and medium-scale construction;
6. small surface detail that survives the player camera.

## 3. Maturity tiers

Use the same L0–L3 language as the quality scorecard:

- L0 — missing, fallback, partial, invalid or visibly broken.
- L1 — complete and immediately readable at the shipping camera.
- L2 — coherent authored production quality: convincing form, materials, identity, appropriate LOD/release treatment.
- L3 — premium hero treatment where extra detail/composition meaningfully survives the camera or marketing/cinematic route.

The portfolio goal is controlled variance. A common L0 beside L2 assets is worse than a common L2 asset lacking L3 microdetail.

## 4. Marginal-value iteration

The old fixed seven-pass / three-reviewer-per-angle model is retired as a universal requirement.

A normal asset loop is:

```text
reference / player-role target
→ baseline shipping-camera capture
→ one coherent form/material intervention
→ shipping-camera capture
→ one cold review or objective visual test when needed
→ keep/revise/revert
```

Continue only for a **named player-visible defect**.

If two consecutive valid passes under the same causal model fail to change the play-size disposition, stop polishing. Rebuild the causal approach, defer, or let the manager spend the next unit elsewhere.

This is not a lower quality bar. It is a ban on spending premium effort below the screen-space noise floor while adjacent systems remain weak.

## 5. Review economy

Default visual review is one composite evidence set and one fresh reviewer. Use multiple independent reviewers only when:

- the packet explicitly requires independent acceptance;
- a high-risk/high-cost promotion is genuinely ambiguous;
- two visual hypotheses are close enough that one review is unstable;
- calibration of a new visual detector/review method is itself the task.

Do not equate number of reviewers with quality.

## 6. Asset-family strategy

For unique hero/ship forms, preserve individual silhouette and authored identity.

For repeated manufactured C/D-tier families—crates, buoys, machinery variants, conduits, fragments—batching is allowed when it increases consistency and throughput. Batch the shared design/material grammar, then prove representative members and outliers at play size.

Do not hand-polish every identical bolt as a separate hero asset.

## 7. Structural VFX grammar

PQ-134 already established pooled structural primitives and a causal grammar. Build on it instead of reverting to generic sprites/rings.

Useful primitive vocabulary:

- blades / directional cuts;
- broken arcs;
- shards/fragments;
- trails/ribbons with authored history semantics;
- beams/lines;
- localized fields where the gameplay mechanism is actually a field;
- particles/sparks/debris as secondary material response, not the primary explanation.

The causal families already include direct, bank, chain, collision, terrain, tether, field and reaction. New gameplay should map to or deliberately extend this grammar.

## 8. VFX recipe contract

A significant gameplay effect should define:

```text
causal family
shape vocabulary
origin / target / surface relationship
timing envelope
motion law
color/value role
priority
saturation/shedding behavior
audio relationship
HUD/radar relationship if relevant
reduced-motion behavior
performance budget
```

The recipe is data/grammar where possible. Do not hide gameplay branching inside render code.

## 9. Saturation hierarchy

When many effects occur together:

1. player damage/threat and major boss/physics consequences survive;
2. target-relevant attack cause survives;
3. medium tactical feedback survives while capacity permits;
4. ambience/decorative fragments shed first.

The observer should record requested/admitted/dropped families so a saturation failure can be reproduced rather than judged from one lucky clip.

## 10. Trails and history effects

History trails are spatial records, not elastic tails attached to a moving object unless the product explicitly says otherwise.

For a thruster-history/burn trail:

- sample the relevant emitter location in world history;
- old samples remain where authored when the ship slows/stops;
- the trail does not suck back toward the current ship position;
- no pulse/jet metaphor unless that is a separate engine effect;
- smoothing operates on the historical polyline without turning it into a tether;
- culling/LOD follows the live table and performance contract;
- player/current-target importance may justify higher fidelity than off-glass NPC trails.

This is an example of why VFX needs semantic contracts, not "make it prettier" prompts.

## 11. Materials and realism

Use material truth to support identity:

- authored roughness/normal/ORM variation where it reads;
- avoid DCC defaults on visible changed zones;
- avoid flat plastic/clay response on production assets;
- preserve faction colors/markings and functional material separation;
- use emissive intentionally for powered systems, not as an outline cheat for every object.

Do not chase physically perfect microvariation that the normal camera cannot resolve.

## 12. World-object parity

A high-quality ship next to a tube-and-ring beacon, crude pod or procedural machine creates a stronger negative impression than uniformly coherent L2 art.

Cross-system visual review should compare representative frames that include neighboring families. The Central Brain should rank the largest exposed maturity discontinuity, not only the worst isolated asset.

## 13. Frontend parity

The frontend has its own binding `design/frontend/INSTRUMENT_GRAMMAR.md`. Do not make 3D art rules override it.

Cross-system parity means the same production values:

- clear hierarchy;
- causal motion;
- coherent color roles;
- authored iconography;
- state completeness;
- responsive/accessibility support;
- visual regression.

The strategic layer may be visually different from the 3D world while still feeling like the same product.

## 14. Reference generation

Generated concept/reference art is a construction aid, not acceptance evidence.

Generate references that answer a specific form/material problem from the shipping camera. Record provenance. Do not force an asset to pixel-match generated art when live silhouette, sockets, gameplay scale or performance require a different solution.

## 15. Performance is part of the visual system

No visual quality is real if it causes route hitching or falls back under density.

Every substantial new effect/asset family needs:

- bounded pools/instances or known count limits;
- LOD/residency strategy where appropriate;
- compile/admission behavior that does not create first-use bricks;
- representative crowded-route measurement;
- no default-quality downgrade as the proof of performance.

## 16. Visual completeness

A milestone visual pass is complete when:

- every common route publishes complete authored identity;
- no frequently exposed family sits at L0 without an explicit reason;
- L1/L2 families share a coherent value/material/VFX language;
- primary actions have causal feedback;
- saturated scenes preserve tactical readability;
- the frame is smooth at the representative density;
- remaining L3 work is genuinely hero/premium rather than debt disguised as polish.

The desired result is not "maximum fidelity." It is a game whose visual decisions look intentional everywhere the player regularly looks.