# Visual Iteration and Evidence Protocol

> **Companion craft protocol, not a plan or completion ledger.** This file prevents shallow
> technique-checking, invalid screenshots, premature approval, and generic clay/kitbash results while
> executing VA/VP packets from `ASSET_PRODUCTION_LEDGER.md`. The program queue still owns priority;
> the Visual Asset Production Standard owns G0–G7 acceptance after it lands.

## 1. Core rule

An agent does not earn acceptance by touching a technique, reaching an iteration number, generating
files, or saying that the result looks good. It earns acceptance only when the exact runtime candidate
survives valid evidence, defect-driven revision, normal-route use, measured cost, and required
independent review.

The counts below are **minimum scrutiny floors**, introduced because agents have repeatedly stopped
after one technically compliant pass. Reaching a floor does not permit stopping while a visible P0/P1
defect remains. A controller may waive a floor only when current exact-hash evidence proves that gate
already passed before the task began; the waiver must name that evidence and an independent reviewer.

## 2. What counts as one iteration

One iteration requires all six actions:

1. Name visible defects, their region, severity, likely cause, and observable repair target.
2. Change the editable source or owning generation code to repair those defects.
3. Rebuild/export the exact candidate through the sanctioned path and record its new hash.
4. Capture a valid, matched, stage-appropriate evidence set from that candidate.
5. Open and inspect every required image at useful resolution; inspect motion at speed and frame-by-frame.
6. Record `keep`, `revise`, or `revert`, with what visibly improved, regressed, and remains.

The following count as **zero iterations**:

- rerendering without a source change;
- changing only camera, lighting, exposure, bloom, or background to flatter the asset;
- applying a modifier/node/texture without evaluating its visible outcome;
- showing only a cropped detail, thumbnail, material ball, wireframe, or Blender viewport;
- reusing an older screenshot or an image from another hash/LOD/runtime route;
- running checks without visual inspection;
- writing a new plan, self-score, or approval paragraph;
- adding random greebles, subdivisions, scratches, noise, or texture resolution without repairing the
  named defect.

## 3. Evidence framing must fail closed

### 3.1 Valid full-subject asset views

Unless the view is explicitly a detail crop or an unmodified gameplay-camera capture:

- the complete subject and all extremities must be visible;
- leave approximately 8–15% clear margin around its projected bounds;
- the subject's long axis should occupy roughly 55–80% of the image;
- no required part may be hidden behind UI, clipping, another object, darkness, bloom, fog, depth of
  field, or a blown highlight;
- use at least 1280×720 output; Tier A/B diagnostic masters default to 1920×1080 or higher;
- record asset ID, candidate hash, LOD, camera transform/lens, image dimensions, lighting rig,
  exposure/color management, renderer, and whether the image is source, release, browser, or Electron;
- open the original image, not only a chat thumbnail. If the review tool downsamples it, inspect
  full-subject and named native-resolution crops.

A full-subject image is invalid if the asset is cropped, smaller than roughly 35% of the frame without
game-camera justification, mostly occluded, too dark/bright to evaluate, the wrong asset or LOD, or has
unknown candidate identity. Invalid evidence does not count toward an iteration floor and cannot be
approved. Adjust the camera/lighting and recapture before critique.

### 3.2 Gameplay-camera views

Gameplay views must use the real supported camera and public route. Do not move the camera closer merely
to make detail visible. Record projected subject width/height in pixels and capture:

- normal/default play distance;
- supported closest play distance;
- maximum zoom-out or far LOD band;
- a representative motion segment;
- crowded/worst-case context when the asset repeats.

If the asset is legitimately small at the default camera, the full gameplay frame remains required and
may be paired with a separately labeled inspection crop. The crop never substitutes for the full frame.

### 3.3 Required matched camera pack

Use the same framing, pose, lens, lighting, exposure, background, resolution, color management, and LOD
when comparing iterations unless the variable itself is under test.

| Pack | Required views |
|---|---|
| Form | front, rear, left/right side, top, front three-quarter, rear three-quarter, normal-game silhouette |
| Construction | front/rear three-quarter, top, grazing-light side, wireframe-over-solid, 2–4 named joint/recess crops |
| Bake | UV checker, tangent normal, AO, curvature/ID where used, cage/skew/bleed diagnostics, exported runtime normal |
| Surface | base-color-only, roughness, metallic, AO, normal response, emissive without bloom, neutral/bright/dark/colored/grazing light |
| LOD | matched LOD0/1/2 stills plus approach/recede motion crossing every switch band |
| Runtime | browser and required Electron close/default/far, motion, interaction/VFX state, dense context and accessibility variants |

Beauty images supplement these packs. They replace none of them.

## 4. Story-grounded art brief before modeling

Before G1 work, create an **asset narrative dossier**. Start at `docs/worldbuilding/README.md` and follow
its canon order. Prefer the relevant faction, place, character, ship, commodity, chapter, and
contemporary-history sources. Do not sweep drafts or copy superseded prose as canon.

### 4.1 Literary object portrait

Write 600–1,000 words of concrete, sensorial prose describing the object as if it had been used,
maintained, financed, repaired, and argued over for years. Aim for the user's requested literary
specificity, not ornate vagueness. Describe:

- who commissioned, manufactured, owns, crews, services, fears, or resents it;
- what task shaped its silhouette and internal arrangement;
- how force, heat, cargo, atmosphere, vibration, weapons, mining debris, docking and maintenance move
  through it;
- what has been replaced, patched, cleaned, ignored, relabeled, repossessed, or made nonstandard;
- which surfaces are touched, sheltered, hot, abraded, wiped, leaking, newly painted or never reached;
- what a mechanic sees from one metre and what a pilot recognizes at 120 pixels;
- one memorable asymmetry, one manufacturing signature, and one service-history clue;
- what it must never resemble (toy, molded soap, generic NASA white, random cyberpunk greeble, etc.).

Quote or paraphrase canon sparingly and cite file plus heading. Mark every unsupported addition as
`ART EXTRAPOLATION`, so evocative invention cannot silently rewrite lore.

### 4.2 Production translation

Translate the portrait into a concise build brief containing:

- 5 macro silhouette imperatives;
- 8–15 meso construction zones and how they connect;
- material stack by zone: substrate → coating/finish → microstructure → use history → markings;
- edge-radius families tied to manufacturing method and screen size;
- load paths, service access, heat rejection, propulsion/tool/weapon roots, docking/contact regions;
- deliberate clean/rest areas versus dense machinery areas;
- decal typography/placement and faction/manufacturer identity;
- supported camera pixel bands and what must survive in each LOD;
- 8 forbidden shortcuts specific to this asset;
- reference images with provenance/licensing and the exact lesson from each.

The prose is a design constraint, not decoration. Every major modeled or surfaced zone must map back to
the production translation; every decorative part must justify function, scale, identity, history, or
composition.

## 5. Minimum scrutiny floors by production tier

Each number is the minimum number of **valid review cycles**, including the stage baseline. Four cycles
normally means baseline plus at least three source revisions. A cycle may satisfy adjacent stages only
when it contains both complete evidence packs and separate defect decisions.

| Stage | Tier A hero/landmark | Tier B prominent/repeated | Tier C supporting modular | Tier D distant dressing |
|---|---:|---:|---:|---:|
| G0 dossier/brief | 2 | 2 | 1 | 1 |
| G1 primary form/silhouette | 4 | 3 | 2 | 1 |
| G2 construction/geometry/shading | 4 | 3 | 2 | 1 |
| G3 UV/tangent/bake | 3 | 2 | 2 | 1 |
| G4 materials/surface story | 4 | 3 | 2 | 1 |
| G5 LOD and measured cost | 3 | 2 | 2 | 1 |
| G6 runtime integration | 3 | 2 | 1 | 1 |
| G7 independent review | at least 1 independent round | at least 1 independent round | controller review | controller review |

These floors are deliberately higher for Tier A/B because professional hard-surface form and material
response rarely emerge from one generated pass. They must not become “four renders means finished.” A
stage exits only when valid evidence shows no remaining P0/P1 for that stage.

## 6. What to inspect at each stage

### G1 — primary form

Look specifically for:

- recognizable primitive origins: untouched boxes, cylinders, cones, capsules and spheres;
- broad slabs without plane hierarchy, thickness or believable joins;
- “role hat on a box” differentiation;
- forward direction or function readable only through color/emissive labels;
- weak negative space, repetitive symmetry, accidental tangencies and silhouette noise;
- engines, tools, weapons, cargo or sensors pasted on rather than integrated into load-bearing form;
- scale ambiguity and detail that disappears at the normal camera.

The repair target is not “more detail.” It is a better designed object in flat silhouette and clay light.

### G2 — construction and edge language

Look specifically for:

- perfectly rectangular bars with no joint, fastener, rib, center break, taper, flange or load purpose;
- uniform rounded corners and one bevel radius across armor, casting, sheet, glass and rubber;
- floating panel strips, decals pretending to be deep seams, coplanar/z-fighting surfaces and impossible
  intersections;
- unsupported masses, sealed maintenance systems, no hinges/latches/fastener pattern, no heat path;
- shading waves, pinching, razor edges, over-smoothed normals and boolean debris;
- identical repetition without manufacturing logic or deliberate rhythm.

Required challenge: inspect under hard grazing light and without textures. If it still looks like molded
clay, G2 fails regardless of texture quality.

### G3 — UVs and bakes

Look specifically for:

- Smart Project used as final proof; inconsistent density, arbitrary island rotation and insufficient mip
  padding;
- seams crossing hero faces, mirrored writing/wear, stretched normals and tangent discontinuities;
- flat/neutral normal maps, normals generated directly from color, skewed cages, ray misses and bake bleed;
- curvature/AO/ID/thickness/position maps that do not derive from the exact final geometry;
- high/low triangulation or tangent basis changing after bake;
- texture sources that cannot be reproduced or edited.

At least one bake cycle must use an adversarial checker and one must inspect the exported runtime normal,
not only Blender's viewport.

### G4 — materials and surface story

Look specifically for:

- every material sharing the same matte/shiny plastic response;
- color swaps standing in for paint, alloy, composite, glass, ceramic, rubber or rock;
- nearly constant roughness; broad reflection shapes that remain smooth clay;
- uniform procedural noise, repeated grid patterns, scratches everywhere and curvature wear on every edge;
- base color carrying fake lighting, metallic values used as brightness, overdriven normals and ambient
  occlusion painted as black dirt;
- wear unrelated to contact, heat, flow, maintenance, shelter or orientation;
- clean panels with no hierarchy versus uniformly filthy objects with no maintenance history;
- decals floating like stickers, emissive used as surface detail, and glass that fails sorting/depth.

Every Tier A/B surface cycle must inspect neutral, grazing, dark and colored/environment-lit response. At
least one cycle must remove bloom and emissive so material quality cannot hide behind glow.

### G5 — LOD and cost

Look specifically for:

- fixed-ratio decimation presented as authored LOD completion;
- silhouette, negative space, engine/tool/weapon identity or emissive anchors disappearing;
- material/normal/UV changes, position jumps, shimmer and abrupt draw-state swaps;
- subpixel geometry retained while important shape is removed;
- an impressive isolated asset whose repeated scene cost is not measured;
- performance “fixes” that reduce default visible quality or reintroduce fallback identity.

Review approach and recession at normal speed, slow motion and frame-by-frame. Count visible scene cost,
not only per-asset triangles.

### G6 — runtime and presentation

Look specifically for:

- blue-clay/box/proxy frames before authored admission;
- flicker, multi-width position jumps, transform/rebase/interpolation errors and material/LOD swaps;
- wrong pivot, scale, forward direction, collision, sockets, muzzle or plume origin;
- lighting/exposure/environment that flattens PBR response or full-screen haze that lifts black space;
- texture cards, alpha sorting, overdraw, bloom blobs and unreadable dense combat;
- standalone framing that does not survive the actual camera;
- browser/Electron disagreement, save/Continue drift and accessibility modes that erase feedback.

### VFX-specific inspection

VFX iteration requires motion. Inspect ignition, growth, sustain, decay and cleanup; pause on at least five
meaningful temporal frames. Reject polygon cones, bead trails, visible cards, generic circular flashes,
primary expanding rings, color-only family identity, strobing beams, identical smoke puffs and long-lived
white bloom. Include idle/ordinary/high-energy, dense, reduced-motion and reduced-flash scenarios.

## 7. Defect-driven escalation

After every valid cycle, produce a defect table:

| ID | Severity | View/frame | Region | Visible defect | Likely cause | Required observable result | Decision |
|---|---|---|---|---|---|---|---|

Rules:

- fix macro before meso, meso before micro, and geometry/UV before surfacing that depends on them;
- if the same defect survives two repair cycles, stop parameter nudging and change method;
- if it survives a third cycle, return to the earlier gate or request controller/Blender-specialist review;
- if a revision improves one view but breaks another, it is not a clean improvement;
- discovering an earlier-gate failure invalidates dependent bakes, materials and LOD claims;
- never hide a defect by changing evidence camera, lighting, crop, background, bloom or exposure;
- do not demand a fixed number of defects. “No defect found” is credible only with valid evidence and
  explicit inspection of the stage checklist.

## 8. Independent review protocol

The Tier A/B reviewer must not be the authoring session or inherit its approval language. Give the reviewer:

- frozen brief and narrative dossier;
- exact candidate/source/release hashes;
- baseline and final matched packs;
- normal-route browser/Electron stills and motion;
- performance/cost evidence;
- unresolved defect list and every waiver.

The reviewer validates evidence framing and identity first. If a required image is cropped, tiny,
unreadable, stale, unmatched or from the wrong candidate, return `EVIDENCE_INVALID` and request recapture;
do not judge the asset from it.

Then review from the far/default gameplay frame inward, not from beauty closeups outward. Return only:

- `accept` — exact hash, applicable gates pass, no P0/P1;
- `reject` — gate, evidence view/frame, region, visible defect, why it matters and observable repair target;
- `blocked` — exact missing dependency and smallest unblock action.

“Looks good,” “professional,” “techniques applied,” “checks pass,” or “minor polish remains” without the
required inspection record is an invalid review.

## 9. Mandatory worker clause

Append this to every Tier A/B asset or VFX prompt:

```text
Follow design/graphics-sprints/VISUAL_ITERATION_PROTOCOL.md. Its review-cycle
numbers are minimum scrutiny floors, not completion quotas. A cycle counts only
after a source change, exact-candidate rebuild/hash, valid full-subject matched
evidence, original-resolution inspection, and a recorded keep/revise/revert
decision. Cropped, tiny, obscured, stale, unmatched, beauty-only or wrong-LOD
images are EVIDENCE_INVALID: adjust camera/lighting and recapture; do not approve.

Write the canon-cited narrative dossier and production translation before G1.
Repair the earliest failed gate and inspect every named defect class for that
stage. Continue beyond the floor while any P0/P1 remains. After two failed repairs
change method; after three return to an earlier gate or escalate. Tier A/B cannot
self-accept. The independent reviewer validates evidence first and reviews the
normal gameplay frame before closeups.
```

## 10. Evidence record additions

Each cycle should add these fields to its packet receipt or linked iteration ledger:

```yaml
iterationId: VA-111-G2-i03
candidateSha256: <hash>
sourceRevision: <commit-or-source-hash>
gate: G2
defectsTargeted: []
sourceChanges: []
captures:
  - path: <path>
    width: 1920
    height: 1080
    subjectBoundsPx: [x, y, width, height]
    subjectCoverage: 0.68
    fullSubjectVisible: true
    candidateSha256: <hash>
    lod: LOD0
    camera: <transform-and-lens>
    lighting: neutral
    route: release-preview
inspection:
  openedAtOriginalResolution: true
  viewsInspected: []
decision: revise
improved: []
regressed: []
remainingDefects: []
```

VA-002 should eventually automate fail-closed checks for dimensions, subject bounds/coverage,
candidate/hash identity, required view names, camera matching, LOD identity, stale captures and missing
inspection decisions. Automation validates evidence integrity; it does not perform artistic acceptance.
