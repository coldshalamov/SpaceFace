<!-- LIFETIME: DURABLE -->
# Art remediation and evidence, 3 October 2026

## Owner visual verdict — 3 October 2026, 23:21 UTC

The owner rejected the quality of the shown models again. Any earlier agent static/LOD pass below
is historical technical review, **not current visual acceptance**. Mite M7 and Splitter A6/v12
remain unfinished art candidates requiring redesign; the Charger studies also remain unfinished
and must not repeat the same weak direction. Preserve editable sources, rendered evidence, exact
contracts, code, tests and known failures so another agent can continue. Publish this coherent WIP
handoff in the continuation draft PR promptly rather than waiting for every feature to be finished.
Do not silently enable rejected assets or claim topology/collision tests establish production value.
Reassess the artistic direction against strong finished-game references before further polishing.


Portable integration of the independent audit. This applies to the full existing expansion,
not just the new twenty concepts. Root independently opened the Brood/reference sheet and all
three machinery sheets; no real-game material or animation acceptance is implied.

## Which source the verdicts describe

The verdicts below are preserved diagnoses of the **original audited candidates**, not blanket
rejections of their later replacements. Read [current execution status](EXECUTION_STATUS.md) before
starting a new rebuild. As of 3 October 2026, Mite M7 and Splitter A6/v12 passed bounded static/LOD
visual review. Preserve those accepted-direction sources; do not restart their design from the old
rejection merely because this historical audit remains in the repo. Installed runtime appearance,
resident first-frame behavior and measured GPU cost are still separate open gates.

The Charger rebuild is active. Spitter, Leecher, the remaining P14 roster and colony terrain remain
unfinished. At the original audit, three distinct Splitter anatomy studies were required before
secondary detail; that study-and-review stage has since been completed. New visual corrections must
identify a concrete current-source defect and preserve already accepted work.

Machinery revisions remain concrete work under P01–P03, alongside their functional integration.
Preserve stronger existing forms rather than applying one blanket rebuild to every model.
Every ACCEPTABLE verdict below is explicitly limited to neutral diagnostic form quality.

## Retained evidence sheets

- [Brood against established art](art-review-2026-10-03/sheets/01-brood-vs-established.png)
- [Machinery 1](art-review-2026-10-03/sheets/02-machinery-1.png), [machinery 2](art-review-2026-10-03/sheets/02-machinery-2.png), [machinery 3](art-review-2026-10-03/sheets/02-machinery-3.png)
- [Equal-screen-size diagnostic](art-review-2026-10-03/sheets/03-gameplay-footprint.png)
- [Rejected Splitter iteration history](art-review-2026-10-03/sheets/04-splitter-iteration-history.png)
- [Fauna context only](art-review-2026-10-03/sheets/05-fauna-context.png)
- [Ceres geometry context](art-review-2026-10-03/sheets/06-ceres-context.png)

These are neutral Blender geometry/material-factor diagnostics, NOT gameplay screenshots.
They justify the stated primary-form rejection; they do not certify runtime shaders, texture
response, motion, collision, target-device performance or player comprehension.

# SpaceFace expansion: independent art-quality audit

## Bottom line

**Rebuild the delivered Splitter and all four Brood bodies at the primary-form level.** Their problem is not low triangle count or lack of polish. Capsule masses, straight connecting bars, blunt paddle appendages and repeated surface scutes do not form convincing anatomical systems. The four are distinguishable as icons, but that is not enough to meet the strongest existing game art.

**The machinery is not equally weak.** The collector, clamp raider, service craft, cooling rack, probe and several supporting fixtures have substantially more coherent construction, readable function and useful secondary forms. Some structural payloads and the Second Measure composition need revision. This audit does not grant any asset shipping approval.

## Scope and evidence

- Current parts manifest: 208 rows versus 183 at immutable common base `f10eec26ab34c09ca43314fae3c683ebf48c7a68`: **25 new packaged models**, built by 18 recipes, including state variants. 9 Ceres, 12 Stormshift, 4 Brood. See [audited asset inventory](art-review-2026-10-03/expansion-assets.json) for exact repository-relative model/recipe paths, SHA256, base presence and manifest matches.
- The inventory also records new procedural Brood-glob projectile, tow-cable and attack-corridor VFX. Those dynamic effects are listed for scope completeness but are **not visually certified here**; actual renderer/motion review is required.
- Also inspected: the isolated delivered Splitter, making **26 packaged/prototype model verdicts**, and the new procedural Ceres fracture-rock family. Regenerated metadata for existing assets is not miscounted as new art. The existing Conveyor Barge package recompilation is not a new original model.
- The first three Brood source GLBs in the PR216 isolated source and integration tree are byte-identical (SHA256 checked). Leecher is the integration tree version.
- **Correct Splitter:** the refined `splitter_lod0.glb`, `splitter-refined-source.blend`, and `splitter-Blender-prototype-clean-preview.png`. `FROZEN_MANIFEST.json` explicitly names `output/refined` as current. All 46 frozen file hashes were checked and match; the verification was made against the prototype delivery manifest. The misleading `output/final` folder is an earlier iteration, used only in the labelled history sheet.
- Read: current root, tools, assets, ships and places AGENTS; FORGE.md; LOOK.md; visual-assets README; expansion ASSET_PIPELINE.md. The concept pack explicitly says its GLBs are blockouts, not production art. It supplies functional briefs, never the quality ceiling.

## What the pictures are, and are not

The audit decoder uses the repository's installed glTF-Transform and meshoptimizer to decode actual GLB geometry, node transforms and scalar materials. All texture objects are removed **equally from references and candidates** to avoid claiming Blender supports the release's KTX2 texture/shader path. No geometry, base colors, roughness, metalness or emission factors are redesigned. Blender glTF import restores Z-up. LOD1/2 and collision meshes are hidden. Render views use the same relative camera/light rig and AgX response, with framing normalized to each asset's envelope.

- `top`: orthographic top view
- `chase60`: same 60-degree elevation as the game, orthographic diagnostic framing
- `threequarter`: additional depth/attachment diagnostic, selected subjects
- `03-gameplay-footprint.png`: roughly 170-pixel-wide equal-screen-size comparisons; **not** a physical-size-matched actual game projection

These are **neutral diagnostic renders**, not game screenshots. The real Look's lacquer, colored rim, shader contour, texture response, bloom, current camera perspective, runtime tints and local occlusion are not certified. The Wasp export imports pale without its runtime presentation; it is retained as a named canonical silhouette reference but excluded from color/material scoring. Textureless Brood images omit the subtle chitin normal/roughness pair; that cannot explain or repair their primary-form problems. Biological bodies are not faulted for lacking industrial panel seams or metallic lacquer.

The cloud-browser loopback route was explicitly blocked. It was not bypassed. Actual runtime material, animation and gameplay-size acceptance remains unverified. This limitation prevents final acceptance; it does not prevent rejecting visibly inadequate geometry.

## Strong existing benchmarks

See [01-brood-vs-established.png](art-review-2026-10-03/sheets/01-brood-vs-established.png) and individual top/chase renders.

1. **Kestrel/Hitch:** a tapering central pressure body, shoulder masses, canopy, drives and attached equipment form a clear hierarchy. It holds its identity without textures. Large/medium/small forms support a coherent occupation, not arbitrary decoration.
2. **Salvage Cutter:** jaws, hinge housings, exposed working linkage and cargo cage express one job. The mouth's negative space and articulated supports remain intelligible at small scale.
3. **Trade Hub:** large ring, spoke voids, central tower and subordinate perimeter architecture form a readable place. Detail is organized by function and scale.
4. **Helios Arclight:** repeating volumes are unified by a clear bridge, supports, windows, drive grouping and controlled taper. Repetition itself is not the problem; unsupported or anatomically unexplained repetition is.
5. **Wasp:** named by current LOOK.md alongside Kestrel; useful as a pointed plan silhouette, but this neutral decode lacks its game material presentation and is not used to lower the bar.

Existing fauna was also inspected from **actual `buildFaunaMesh` output**, exported with Three.js GLTFExporter and reimported: Veil-Ray, Spindle Mother and Bristle Ram. These are procedural primitive bodies, not high-quality authored fauna GLBs. They offer ecological/species context only. **They are explicitly not acceptance benchmarks** and cannot excuse a weak new hero combatant. See [05-fauna-context.png](art-review-2026-10-03/sheets/05-fauna-context.png).

## Brood verdicts: primary forms need rebuilding

### Delivered Splitter — REBUILD

The refined delivery retains three inflated lobes linked by two nearly cylindrical hoses. Raised pink scutes add bulk and facet changes, but they do not explain a joined organism's structural anatomy. Similar-sized rear/front masses compete; there is no decisive dominant trunk or strong directional gesture. Small terminal bulbs resemble appendages added to the larger capsules, without convincing neck-to-head transitions. The connecting tissue has little taper or anatomical reinforcement. At 170 pixels, it reads as a connected three-pod symbol rather than a creature with purposeful locomotion and separable offspring.

The broad central negative space is readable, and division into multiple bodies can be communicated; those are useful constraints, not sufficient art quality. Rebuild the shared tissue, mass proportions, joints and offspring/body relationship. Decide whether this is a branching organism, a brood carrier or a colonial animal, then make that mechanism visible. Do not add more ribs, noise or small spikes to these same lobes. Preserve separation gameplay through newly derived proxies, not by forcing the design to retain the rejected capsule layout.

### Brood Mite — REBUILD

A large rear capsule, two front capsules, two pale paddles and two side vanes are individually legible but weakly integrated. The pale plates lie across the forms as repeated badges rather than communicating growth, overlap or load. Equal-smoothness pink masses and rounded appendage ends soften the intended threat. A coherent thorax/abdomen transition, tapered jaw roots, articulate limbs/vanes and meaningful ventral attachment are needed. Keep the compact forked silhouette if desired; rebuild its anatomy.

### Brood Charger — REBUILD

The top silhouette is effectively a rounded H/fork: a straight crossbar carrying two large pills with an elongated capsule behind. That makes the collision/attack corridor obvious but gives almost no believable transfer of force from body to weapon. The abrupt crossbar/pod connection, broad constant-thickness members and paddle tips read as an assembly of soft components. Rebuild a converging shoulder/girdle and supported striking anatomy, with a dominant forward shield or fork and a subordinate abdomen. Differentiate the ram from Mite through mass and posture, not just stretched dimensions.

### Brood Spitter — REBUILD

A broad dark disc, paired pink pill masses and a straight nozzle-like snout form an icon rather than an organism. The disc has weak contour variation and little anatomical explanation; the pale repeated pieces and narrow grooves do not establish pressure chambers, musculature or a throat. A visible reservoir-to-throat-to-mouth chain and credible attachment of lateral masses are needed. Keep the projectile direction and broad body identity, but reshape the load-bearing anatomy and mouth opening.

### Brood Leecher — REBUILD

The extremely linear bar body, pale hammer-shaped contact end and nearly uniform tail form produce a tool-like silhouette. The small pale patches, lumped tail scales and dark vanes are not a coherent attachment/feeding system. The head/contact organ needs a designed cup, jaw or gripping architecture; the trunk needs deliberate taper and segmented volume that makes contraction plausible. Avoid merely exchanging the endcap while retaining a featureless connecting bar.

### Shared Brood materials/articulation/readability

The soft mauve/lilac palette does establish a family, and the pale/dark contrast survives reduction. It currently emphasizes pasted-on parts and broad blank masses. Surface response should distinguish shell, flexible joint and feeding tissue after form approval; adding gloss is not a substitute. Shared finish/material counts, opaque membranes, planar collision validity, node clips and source seals do not demonstrate successful anatomy or animation. Static joint ownership is not evidence of convincing articulation. Required later evidence is anticipation/contact/recovery and severance/attachment poses in the actual game, with supports and tissue behaving coherently throughout.

## Machinery: individual verdicts

Here **ACCEPTABLE** means the visible form is acceptable for the named supporting role under this neutral audit. It is not release acceptance, a hero-quality claim, or proof of runtime animation/materials. **REVISE** means preserve the core design and address the named visual weakness. The retained sheets 02 contain the paired top/chase diagnostic views for all machinery rows. Individual render files are not required for this portable plan amendment.

| Asset | Verdict | Concrete visual finding / next action |
|---|---|---|
| `ceres_breaker` | REVISE | Open twin truss rails and machinery bridge clearly communicate a cutter gantry. The near-rectangular overall outline and similarly weighted rails/bridge lack a strong focal cutting station; improve gantry-to-cutter hierarchy and functional edge profile, without filling the required mouth. |
| `place_ceres_breaker_cutter_head` | ACCEPTABLE | Bevelled main housing, dark vent, flanking drive/joint housings and controlled stripe support a credible industrial module. Check actual working face and mounted travel in game; this close top view alone does not prove cutting action. |
| `place_ceres_seam_survey_probe` | ACCEPTABLE | Tripod feet, struts, circular support and instrument box have clear attachment logic. Main head and support are distinct volumes; adequate supporting device rather than hero sculpture. |
| `place_ceres_seam_survey_probe_damaged` | REVISE | Changed head/loose panel reads at close scale, but damaged vs intact loses clarity when reduced. Make one significant displaced or absent functional component distinguish failure; avoid relying on tiny cracks. |
| `place_ceres_second_measure` | REVISE | Three open industrial bays have real ribs, decks, machinery and useful depth. The complete mounted assembly still reads as repeated shelf bays joined by flat bridges, with weak retired-freighter bow/stern hierarchy. Keep accessible passages; strengthen asymmetric end identity and shared structural spine. |
| `place_ceres_second_measure_crossbeam` | REVISE | A broad strip with cross tabs has too little sectional construction; very similar to Long Plate. Model a recognizable beam profile, load flanges and cut-end anatomy. |
| `place_ceres_second_measure_long_plate` | REVISE | Flat strip and simple tabs communicate a piece, but scarcely distinguish its job from Crossbeam. Establish plate-specific folded edges, rolled/torn section or attached ribs; large directional geometry before small seams. |
| `place_ceres_second_measure_keel` | REVISE | A framed flat rectangle reads as a generic panel. Give the keel a load-bearing section and recognizable connection/cut geometry that holds at pickup scale. |
| `place_ceres_section_cradle` | ACCEPTABLE | Open U-shaped fixture with restrained hardware and discrete receiving pads has clear receiving space and support hierarchy. Evaluate with mounted payload at gameplay scale before release. |
| `stormshift_collector` | ACCEPTABLE | Strong split-jaw silhouette, tapered scoops, visible inner teeth, pivot discs, paired mechanisms and rear fans express collection. Primary/secondary hierarchy is substantially stronger than Brood. Check all scoop/fan poses for intersections and actual travel; not certified here. |
| `stormshift_clamp_raider` | ACCEPTABLE | Squat U-shaped body, two distinct drive pods, jaw hinge caps and central winch establish occupation and force path. Large negative space and color blocking survive reduction. |
| `stormshift_service_craft` | ACCEPTABLE | Compact cabin/drive mass and long articulated arm give a specific service role. Links and visible elbow joints are attached and intelligible; test reach poses and end-effector contact in game. |
| `place_stormshift_cooling_rack_intact` | ACCEPTABLE | Repeated radiator banks, header, lower reservoirs and service handle create coherent industrial construction. Repetition serves heat exchange; fine fins may disappear at distance but major banks remain. |
| `place_stormshift_cooling_rack_damaged` | ACCEPTABLE | Missing/broken upper bank changes the broad outline, so the damaged state is readable without depending only on surface marks. Check this distinction under actual lighting. |
| `place_stormshift_cooling_rack_repaired` | ACCEPTABLE | Diagonal repair brace and contrasting plate visibly mark a repair while retaining the functional radiator structure. No need to rebuild the whole asset. |
| `place_stormshift_service_cradle_intact` | ACCEPTABLE | Two structured upright arms, hinge details and open bay communicate docking/service. Simple because it is a fixture; simplicity here is purposeful. |
| `place_stormshift_service_cradle_blocked` | REVISE | Absent right arm makes failure obvious, but the bay is visually more open, so 'cannot receive' is not self-evident. Strengthen unusable-receiver cues at the stump/contact system, or pair with clear runtime state signal; do not obstruct a physically required clear path arbitrarily. |
| `place_stormshift_service_cradle_repaired` | ACCEPTABLE | Distinct repaired-side cuff/hardware and complete two-arm outline make the state credible. Inspect receiving animation and repaired linkage load path. |
| `place_stormshift_storage_saddle_intact` | ACCEPTABLE | Vessel rows, straps, rails and rear service stem form a plausible pressure-container rack. Good medium-scale hierarchy for a supporting logistics prop. |
| `place_stormshift_storage_saddle_damaged` | REVISE | The missing rear protective hoop is a real state change but subordinate to repeated vessels; loss of service admission is weak at small scale. A more prominent broken protection/connector cue is needed while preserving recoverable cargo. |
| `place_stormshift_storage_saddle_foundation` | ACCEPTABLE | Intentionally empty support frame, mounts and service stem communicate the unbuilt state. Do not judge this purposeful foundation against a fully populated hero. |

Second Measure was additionally assembled from the actual four decoded models using the recipe's declared mounted centers (Blender offsets Long Plate -40 X, Crossbeam +40 X, Keel -35 Y). `context_second_measure_assembled` is a faithful mounted diagnostic, not a new authored mesh. The isolated shell's three bays must not be mistaken for accidental simultaneous LODs.

## Procedural Ceres fracture rocks

Actual `ceresSurveyGeometry` output for seed variant 0 was exported/reimported in intact, calved and child states. These images use explicitly substituted gray clay materials: they judge geometry only, not the game's asteroid shader. The faceted outline and matched planar fracture are serviceable supporting geology. **ACCEPTABLE geometry for a fracture prop**, with material/state readability unverified. A plane alone should not be sold as high-quality hero geological art. See [06-ceres-context.png](art-review-2026-10-03/sheets/06-ceres-context.png).

## A stronger iterative art loop

1. **Choose visual intent before preserving the rejected envelope.** One anatomical/mechanical explanation, one dominant gesture, three distinguishable species silhouettes. Use the concept dossiers for behavior. Sketch several genuinely different mass arrangements at top and 60-degree views; do not produce detail variants of the same capsule assembly.
2. **Form-only independent rejection.** Compare solid black silhouettes and neutral clay at ~170 px and close scale beside Kestrel/Cutter/strong place references. The reviewer did not author the candidate and receives no passing test count first. Reject weak proportion, unexplained joins, floating-looking trim, primitive assembly and lack of functional anatomy. A named silhouette is not enough.
3. **Resolve anatomy/force paths.** Build transitional volumes, joint roots, shell overlap, feeding/contact organs and shared tissue. A Splitter must look like a complete organism before separation and purposeful organisms afterward. Re-derive collision proxies from the accepted design within gameplay constraints rather than making old proxies an aesthetic straitjacket.
4. **Prove motion with poses.** Show rest, anticipation, extension/contact, recovery and detached states as side-by-side pictures. Inspect articulation supports, collapsing volume, self-intersections and mass/visual continuity. Node/rig validation is a separate technical requirement.
5. **Apply the established finish system after form approval.** Assign a limited, legible shell/joint/soft-tissue response. Biological exceptions are intentional; no machinery panel texture or random noise just to fill empty surfaces. Review the real game shader before tuning materials from Blender output.
6. **Before/after evidence, not progress claims.** Freeze the previous candidate image and compare identical view, scale, pose and lighting against the new one. Label remaining defects. The existing `04-splitter-iteration-history.png` demonstrates why “more scutes” was not a sufficient improvement; both shown iterations fail the primary-form bar.
7. **Two independent gates.** Visual review can reject an asset despite green performance/collision tests. Geometry/performance validation can reject an attractive asset. Neither gate substitutes for the other. Keep the author out of sole acceptance authority, and have the parent independently open the decisive images.
8. **Actual gameplay acceptance before release.** Use the authorized real renderer at default/close zoom, bright and dark moods, moving encounter/attachment/severance and default player route. If the renderer is unavailable, leave that gate explicitly unverified. Never replace missing observation with a receipt or test count.

No active repository/source assets were changed; no publishing, commits, pushes, merges or deployments were performed. This portable report preserves all 26 model verdicts and their remediation requirements. The attached diagnostic sheets are evidence, not release assets.
