<!-- LIFETIME: HISTORICAL -->
<!-- Superseded process scaffold. EXPANSION_PROGRAM.md supplies research context and TOP10_ROI_ASSET_PLAN.md a measured ranking; neither dispatches work. Archaeology and technical reference only; it cannot direct implementation unless explicitly reactivated through an admitted packet. -->
# CLI Asset Foundry Execution Plan

Status: historical execution-plan snapshot, 2026-07-16

Cost constraint: zero paid software, zero subscription-only steps

Execution shape: six sequential checkpoints; every checkpoint ends with a functional game and its own reviewed commit/push

Agent constraint: the work must be executable by lower-cost agents using deterministic commands, schemas, checklists, and evidence rather than broad artistic judgment

This plan does not own current priority, coverage, dispatch, acceptance, or cross-program status.
Its CLI-first method and six checkpoint boundaries are historical reference material that apply only
when an admitted packet explicitly reuses them. Current order comes from `CANONICAL_BUILD_MAP.md` and
the admitted queue; live contracts and candidate-bound evidence remain authoritative.

For substantive Tier A/B authored-3D work, the repeatable method begins with
`docs/visual-assets/VISUAL_ASSET_PRODUCTION_STANDARD.md` and the mandatory fiction/material preflight
in `.grok/skills/spaceface-blender-material-truth/SKILL.md`. Deterministic CLI reconstruction remains
the reproducibility spine; it does not waive the material-truth or player-facing visual bar. If
component image generation is useful but unavailable to the worker, use the isolated Codex terminal
handoff in `docs/visual-assets/AGENT_PROMPTS.md` § E.

## 1. Outcome

Build a zero-cost asset foundry that:

1. raises the default Helios undock route to an explicitly approved visual bar;
2. extracts maximum value from existing geometry, source files, materials, and modular parts;
3. prevents flat factor-only hero assets, generic glow-ball VFX, and global blue haze from becoming
   the default production language;
4. turns approved asset families into repeatable, story-aware variation systems;
5. lets inexpensive agents produce candidates without letting those agents self-approve weak work;
6. leaves browser and Electron gameplay working after every checkpoint.

No checkpoint is complete because code exists, a Blender render looks attractive, a model has a high
triangle count, an agent performed many iterations, or an agent gave itself a good score. Completion
requires the named checks, current normal-route evidence, and an independent verdict against named
defects.

## 2. Current baseline that agents must not reinterpret

At plan creation:

- assets/ships/parts/parts_manifest.json and the generated release manifest contain 80 entries;
- report:asset-status reports 47 manifest-only slots and two blocked whole ships;
- the production classification corpus has 19 records: 3 candidate, 8 missing_evidence, 8 rejected,
  and zero accepted;
- the live player ship is internally ship_kestrel and is always presented to the player as Hitch;
- the starting station is station_helios using place_station_trade_hub;
- eleven Blender-MCP authoring entries are eligible for factor-only source materials;
- primary VFX still share a small circle/ring sprite vocabulary;
- the working tree contains concurrent render and world work, so branch names alone are not proof of
  isolation.

Agents must refresh these facts with live commands. They are a starting snapshot, not permanent
counts.

## 3. Zero-cost toolchain

The production pipeline is CLI-first. MCP is optional and must never be a checkpoint dependency.

| Tool | Required interface | Purpose |
|---|---|---|
| Blender 5.1 | headless Python CLI through BLENDER_PATH | geometry, UVs, baking, animation, deterministic flipbook rendering, GLB export |
| Node.js and npm | CLI | orchestration, schemas, reports, tests |
| glTF Transform | Node/CLI, already in repo | prune, deduplicate, optimize, Meshopt/package |
| Khronos glTF Validator 2.0.0-dev.3.10 | GLTF_VALIDATOR_PATH | independent JSON glTF validation |
| Khronos KTX Tools 4.4.2 | KTX_PATH | KTX2 creation, inspection, glTF compatibility validation |
| ImageMagick 7 | magick CLI | deterministic channel packing, masks, atlases, image comparisons |
| FFmpeg | ffmpeg CLI | video evidence, frame extraction, flipbook assembly |
| Playwright | Node/CLI, already in repo | normal-route automation and screenshots |
| Spector.js | library injected by a repo CLI wrapper | WebGL frame, draw-call, shader, texture, and state capture |

Spector's MCP adapter may be enabled temporarily by an operator for an interactive diagnosis, but the
committed pipeline calls a normal Node command. Blender MCP is likewise not required for reproducible
CLI production. When a non-conflicting connected Blender session is available, however, the complete
surfaced asset must remain the primary Material Preview/Rendered authoring view under
`docs/visual-assets/VISUAL_ASSET_PRODUCTION_STANDARD.md`; headless output can diagnose or build, but
cannot close G2 construction truth or G4 surface truth, replace exact-source evidence, or grant
acceptance.

Material Maker 1.6 is not a dependency. On the reference Windows machine its official build repeatedly
terminated with 0xc0000005 before its export script began, including default, OpenGL compatibility, and
headless starts. Do not spend an agent run trying random flags. Blender node groups and baking are the
authoritative free surfacing path unless a later, separately verified CLI replacement is adopted.

## 4. Controller protocol

### 4.1 Checkpoint sequencing

The checkpoints are sequential:

1. CLI contracts and truthful baseline
2. renderer truth and background de-hazing
3. golden Helios asset surfacing
4. production thruster and RCS VFX
5. existing-asset family multiplier
6. story-to-asset compiler and first embodied pack

Each checkpoint begins from the accepted commit of the previous checkpoint. The controller may stop
after any checkpoint; the game must remain playable and improved or, for checkpoint 1, operationally
safer.

Suggested branches:

- codex/graphics-foundry-01-contracts
- codex/graphics-foundry-02-renderer-truth
- codex/graphics-foundry-03-golden-helios
- codex/graphics-foundry-04-thruster-vfx
- codex/graphics-foundry-05-family-multiplier
- codex/graphics-foundry-06-story-assets

The controller must verify each branch is backed by a real isolated worktree. A branch name is not
evidence of isolation.

### 4.2 Mandatory start procedure for every agent

1. Read AGENTS.md.
2. Read assets/AGENTS.md, assets/ships/AGENTS.md, and src/render/AGENTS.md when the packet touches
   their scope.
3. Read `docs/visual-assets/README.md` and
   `docs/visual-assets/VISUAL_ASSET_PRODUCTION_STANDARD.md`; they own G0-G7 craft and acceptance.
4. For every substantive Tier A/B authored-3D slice, read
   `.grok/skills/spaceface-blender-material-truth/SKILL.md` and complete its material-truth preflight
   before form or surfacing work. Use its component-only image-generation/Codex-handoff route when
   that method is selected; this is not conditional on an existing complaint already naming
   plastic/clay/LEGO-like work.
5. Read design/graphics-sprints/README.md, TOP50_WONDER_BUILD_PLAN.md section 5, and
   QUALITY_RITUAL.md.
6. Read only the packet-specific owner files listed below.
7. Run git status --short.
8. Run git worktree list --porcelain and prove the current directory is the assigned worktree.
9. Run git diff -- each intended owner file before editing.
10. Inspect release.__lock, release.__building, relevant Blender processes, and current file activity.
   Coordinate genuine overlap; do not delete signals.
11. Record the starting commit and dirty-file list in the packet handoff.
12. Capture or locate the packet's exact before evidence before changing presentation.

If owner files already contain unrelated work, the agent stops and reports the overlap. It does not
absorb, revert, or rewrite another lane.

### 4.3 Mandatory finish procedure for every agent

1. Run the packet's focused checks.
2. Run npm run check:asset-reachability when manifests, release files, or runtime maps changed.
3. Run npm run check:assets:live when authored assets changed.
4. Run npm run check:visual-stability for any player-visible render or asset change.
5. Run npm run check:flight:clean for flight presentation, VFX, camera, or renderer changes.
6. Run npm run check:sim:compare for story/gameplay wiring and confirm hashEqual:true.
7. Run git diff --check.
8. Capture the exact normal route named by the packet in browser and Electron.
9. Obtain a fresh-context independent review. The author may not be the sole reviewer.
10. Stage only named packet files, review the staged diff, create one logical commit, and push only
    after every gate passes.
11. Return a handoff containing commit, branch, files, commands, results, evidence paths, remaining
    defects, and rollback instruction.

### 4.4 Universal rejection conditions

Reject the candidate and do not commit if any of these are true:

- authored load failure is hidden by procedural fallback;
- a hero or normal gameplay asset remains factor-only;
- a Blender turntable is offered without current player-route evidence;
- bloom, fog, exposure, or blue tint hides weak materials;
- a faction or regional variant is only a recolor;
- surface noise is repeated uniformly without construction or story logic;
- common rocks receive arbitrary emissive cracks merely to look detailed;
- primary VFX are still composed mainly of point circles, ring sprites, or opaque cones;
- the agent changes quality settings or disables authored visuals to pass performance checks;
- browser and Electron use different gameplay, assets, or settings;
- a generated release manifest is edited by hand;
- an accepted classification lacks durable evidence and a candidate hash;
- a check is waived because the agent believes its code is obviously correct;
- visual comparison is worse, ambiguous, or not same-framing.

## 5. Evidence format

Iteration media stays under .devshots/graphics-foundry/checkpoint-N/. Retain only the final useful
before/after and detail evidence needed by an accepted classification in the durable production
evidence location selected by the existing classification contract.

Every visual verdict must state:

- route and save/setup;
- browser or Electron;
- viewport and render scale;
- exact asset IDs visible;
- whether each visible asset is authored or fallback;
- named defects fixed;
- named defects still open;
- performance before and after;
- verdict: rejected, candidate, or accepted;
- reviewer identity/session distinct from the author.

No numeric beauty score is permitted. Review uses visible facts:

- silhouette and hierarchy;
- scale and functional construction;
- material separation and physically plausible response;
- macro, middle, and micro surface variation appropriate to viewing distance;
- wear, maintenance, repairs, ownership, and story specificity;
- motion and effect integration;
- readability against the real background;
- family distinctness;
- browser/Electron parity;
- measured performance.

## 6. Checkpoint 1 — CLI contracts and truthful baseline

### Goal

Make every later agent run deterministic and cheap. This checkpoint intentionally changes no default
rendered pixels.

### Allowed scope

- new scripts under scripts/graphics/
- focused tests under test/
- package.json command entries
- new schemas under design/production/schemas/
- new plan/evidence documentation under design/graphics-sprints/
- narrowly necessary additions to authoring metadata contracts

Do not touch src/render/, runtime GLBs, release outputs, sector palettes, VFX, or story progression.

### Required implementation

1. Add scripts/graphics/check-toolchain.mjs.
   - Resolve BLENDER_PATH, GLTF_VALIDATOR_PATH, KTX_PATH, magick, ffmpeg, Node, and the repo's
     glTF Transform package.
   - Print one JSON object containing resolved path, version, availability, and a short smoke result.
   - Exit nonzero when any required tool is missing.
   - Do not require Spector MCP or Blender MCP.

2. Add scripts/graphics/capture-webgl-frame.mjs.
   - Reuse the existing visual-probe server and Playwright launch path.
   - Inject the locally installed or npm-pinned Spector standalone bundle before WebGL context
     creation.
   - Navigate through the normal public game route; do not instantiate a private render scene.
   - Capture screenshot, canvas identity, command count, draw-call list, shader list, texture list,
     and GL state to JSON.
   - Accept output directory and route arguments.
   - Close browser and server processes on success and failure.

3. Add closed JSON schemas:
   - asset-brief.schema.json;
   - asset-build-receipt.schema.json;
   - visual-verdict.schema.json;
   - asset-reuse-disposition.schema.json.

4. The asset brief schema must require:
   - assetId, familyId, storySources, gameplayRole, screenProfile, silhouetteIntent;
   - constructionLogic, materialRoles, surfaceHistory, reusableDonors;
   - sockets, collision, LOD, animation, VFX, audio, provenance;
   - requiredViews, routeSetup, forbiddenShortcuts, acceptanceChecks.

5. Add scripts/graphics/report-asset-reuse.mjs.
   - Read source manifest, generated release manifest, authoring registry, runtime maps, diagnostics,
     and classifications.
   - Output one row per exact asset ID.
   - Disposition enum: resurface, recompose, rebuild_around_donor, variant_donor,
     background_or_lod, retire, blocked_pending_evidence.
   - Never infer acceptance from filename, file size, or manifest presence.

6. Add a forward-looking quality tier to authoring metadata without breaking current runtime:
   - hero: player ship, major station, landmark, close story object;
   - standard: commonly visible gameplay asset;
   - background: distant or crowd asset.
   New hero and standard candidates must have bound image maps. Existing factor-only entries remain
   legacy candidates until migrated; do not mass-mark them accepted or break boot.

7. Add npm commands:
   - check:graphics-toolchain
   - capture:webgl-frame
   - report:asset-reuse
   - check:asset-briefs

8. Add unit tests for schema closure, path containment, tool failure, and report classification.

### Acceptance

- npm run check:graphics-toolchain succeeds and emits machine-readable versions.
- capture:webgl-frame produces a nonempty screenshot and JSON containing draw calls, shaders,
  textures, and GL state from the normal game.
- report:asset-reuse covers every current manifest ID exactly once.
- existing asset, launch, and visual checks remain unchanged.
- git diff confirms no src/render or runtime asset change.

### Commit boundary

Commit message: build(graphics): establish zero-cost CLI asset foundry contracts

Rollback: revert this commit; runtime presentation is unchanged.

## 7. Checkpoint 2 — Renderer truth and background de-hazing

### Goal

Remove the global conditions that make every asset look blue, blurry, emissive, and ungrounded. Make
the renderer an honest place to judge materials.

### Preconditions

- Checkpoint 1 accepted.
- Existing dirty renderer work has been integrated or isolated.
- Same-framing before captures exist for Helios undock, station approach, an asteroid field, and
  one combat encounter.

### Allowed scope

- src/render/renderer.js
- src/render/spaceBackground.js
- src/render/bloom.js
- narrowly related src/render/post/ and precompile owners
- src/core/gameState.js only for owned graphics defaults
- src/data/sectors.js or palette owners only when needed to separate environment data
- focused render tests and capture scripts

Do not change asset geometry, material textures, simulation, controls, or story.

### Required implementation

1. Add diagnostic capture modes for final color, albedo, normals, roughness/metalness, emissive,
   bloom contribution, and depth. These are development-only and must not alter the normal route.

2. Decouple visible background from reflection/lighting environment.
   - The full-screen nebula image must not become the universal PMREM light source.
   - Use a neutral, bounded environment suitable for metallic PBR response.
   - Preserve data-driven sector identity without coating neutral materials in sector color.

3. Rebuild the default Helios composition around dark space.
   - Retain stars as points with depth and varied intensity.
   - Keep nebulae, planets, dust, and anomalies localized and spatially motivated.
   - Ensure meaningful near-black negative space exists.
   - Remove full-frame blue fog from the ordinary starting route.

4. Make bloom selective and exposure-aware.
   - Non-emissive hull, station, rock, HUD background, and fog must not contribute materially.
   - Primary emitters retain controlled bloom without destroying silhouettes.
   - Provide a bloom-contribution capture proving what enters the pass.

5. Establish readable light hierarchy.
   - One dominant key direction.
   - Limited ambient/fill.
   - Contact grounding through the most suitable shadow/AO technique for the route.
   - Preserve dark values; do not lift the entire frame to make geometry visible.

6. Add a native-resolution review mode. Adaptive quality remains available during play, but visual
   acceptance captures may not be evaluated at a hidden low render scale.

7. Precompile any new shader variants and measure startup/frame cost. Recover performance through
   precompile, batching, cadence, and pass structure rather than disabling the accepted image.

### Required visual facts

- neutral gray and warm painted surfaces remain neutral/warm rather than cyan;
- the player ship has a readable light side, shadow side, and silhouette;
- common rocks look non-emissive and materially distinct from metal;
- at least one large region of the normal Helios frame reads as dark space rather than fog;
- bloom mask excludes ordinary hull, station, rock, and background haze;
- background stars remain sharp enough to read as points;
- HUD text remains legible without using global bloom or blur as contrast.

### Acceptance

- npm run check:flight:clean
- npm run check:visual-stability
- npm run check:assets:live
- relevant bloom/background/precompile tests
- current browser and Electron same-framing captures
- current performance/hitch measurement with no hidden quality downgrade
- independent visual verdict names each required visual fact

### Commit boundary

Commit message: feat(render): establish neutral lighting and localized deep-space composition

Rollback: revert this commit; checkpoint 1 remains available and runtime assets are unchanged.

## 8. Checkpoint 3 — Golden Helios asset surfacing

### Goal

Create the first approved coherent gameplay frame using the existing Hitch, Helios Station, and
starting-field rock assets. This checkpoint establishes the visual reference later agents must copy
in rigor, not in arbitrary color or noise.

### Asset scope

- live Hitch whole-ship/source family for internal ship_kestrel;
- place_station_trade_hub for station_helios;
- the exact common-rock asset used by f_helios_starter, selecting the highest-exposure donor from
  the manifest/runtime mapping;
- their source Blend files, material graphs/node groups, baked maps, authoring receipts, release
  candidates, exact manifest/runtime/classification records;
- shared material-policy seams only where required for these assets.

Do not migrate unrelated ships, stations, weapons, or the entire manifest.

### Required implementation

1. Freeze the starting candidate hashes and capture authored/fallback diagnostics.

2. Inspect each source in Blender through a repeatable Python report:
   - mesh hierarchy, loose/nonmanifold geometry, transforms, normals, bevel/shading;
   - UV coverage, overlap policy, texel density, material slots;
   - sockets, pivots, collision, LODs, animation;
   - bound images and color-space settings.

3. Preserve good work deliberately.
   - Keep strong silhouette, modules, proportions, sockets, collision, and useful topology.
   - Rebuild only the specific geometry that causes silhouette, construction, shading, or UV defects.
   - Record every donor mesh and every discarded piece in the build receipt.

4. Author real surface families with Blender node groups and baking.
   - Hitch: painted structural hull, exposed mechanical metal, canopy/glass, rubber/seals,
     emissive drive hardware, repairs/ownership marks.
   - Helios: load-bearing structure, clad commercial/administrative surfaces, docking/mechanical
     zones, windows/emissives, maintenance and repair history.
   - Common rock: geological macro forms, fracture planes, mineral/material variation, fine normal
     detail appropriate to screen size; no unexplained cyan emissive seams.

5. Use construction masks, curvature, AO, object/material IDs, and authored decals intentionally.
   Do not spray universal edge wear or repeated noise over every surface.

6. Produce base color, tangent-space normal, and ORM maps at screen-appropriate source resolution.
   Use ImageMagick through a committed wrapper for deterministic ORM packing and inspection. Encode
   release textures with KTX2 and validate them with KTX_PATH validate --gltf-basisu.

7. Export GLB through the existing exporter/finalizer. Run glTF Transform, independent Khronos
   validation, the current source texture-role validator, and release checks.

8. Integrate only through exact manifests and live maps. Do not hand-edit generated release metadata.

9. Capture:
   - Helios undock wide shot;
   - Hitch gameplay-distance three-quarter view under normal controls;
   - Helios station approach wide and close;
   - common rock in the starting field at mining distance;
   - diagnostic albedo, roughness, emissive, and bloom masks.

### Asset-specific rejection conditions

- large surfaces read as one uniform roughness value;
- material separation is communicated only by color;
- the Hitch silhouette is erased by its engine glare;
- station windows or panels are opaque/unshaded by accident;
- texture scale changes arbitrarily between adjacent panels;
- decals float, mirror incorrectly, or become illegible texture noise;
- rock detail is texture-only while its silhouette remains a smooth lump;
- any hero asset passes only because readable fallback geometry remains visible;
- source is not reproducible from committed Blend, scripts, and receipts.

### Acceptance

- independent glTF Validator reports zero errors for all three releases;
- KTX validation passes with glTF BasisU compatibility;
- npm run check:asset-reachability
- npm run check:assets:live with failureCount:0
- npm run check:visual-stability
- npm run check:flight:clean
- browser/Electron same-route evidence;
- accepted production classifications with hashes and durable evidence;
- explicit user approval of the coherent Helios frame before this checkpoint becomes the visual bar.

### Commit boundary

Commit message: feat(assets): establish approved Hitch and Helios surfacing bar

Rollback: revert the release/manifests/runtime commit together; prior release assets remain recoverable.

## 9. Checkpoint 4 — Production thruster and RCS VFX

### Goal

Replace the player's polygon cone and floating-ball trail with a reusable effect substrate and an
approved Hitch thruster/RCS family.

### Allowed scope

- src/render/vfx.js
- src/render/engineTrailSurfaces.js
- src/render/energy/
- narrowly related post/depth/precompile files
- new VFX data/recipe owners
- VFX textures generated through Blender/ImageMagick/KTX
- focused tests and captures

Do not rewrite unrelated combat, mining, massline, or simulation behavior.

### Required implementation

1. Introduce a data-driven VFX recipe contract separating:
   - hot core;
   - animated plume;
   - smoke/vapor where appropriate;
   - heat distortion;
   - sparks/debris;
   - event light;
   - audio hook;
   - reduced-motion and low-quality behavior.

2. Add a reusable flipbook/flow-capable material path:
   - frame interpolation;
   - premultiplied alpha for smoke/flame edges;
   - soft-particle depth blending;
   - optional scene-color distortion;
   - deterministic texture/atlas metadata;
   - no per-frame allocations.

3. Generate the first free flipbooks through deterministic Blender scripts or a procedural shader
   authored specifically for the plume. Store source, seed, render settings, atlas metadata, and
   build command. ImageMagick/FFmpeg may assemble frames; KTX packages the final atlas.

4. Implement the Hitch forward thruster:
   - compact white/hot core at the nozzle;
   - turbulent colored body with coherent direction and velocity response;
   - soft dissipating edge rather than an opaque cylinder;
   - restrained heat haze;
   - sparse sparks only under justified load/damage states;
   - local illumination that does not erase the hull silhouette.

5. Implement RCS as brief directional impulses with socket-correct orientation. Do not reuse the
   main plume at miniature scale.

6. Remove the old player trail only after the new route is accepted. Preserve a bounded fallback for
   unsupported/reduced effects, but do not layer the old balls over the new plume.

7. Precompile materials, pool instances, measure overdraw and GPU cost, and inspect a Spector CLI
   frame to confirm draw/state behavior.

### Required captures

- idle;
- low thrust;
- sustained thrust;
- boost transition;
- turn with left/right RCS;
- reverse/brake impulse;
- dark-background silhouette;
- bright-station-background silhouette;
- reduced-motion/accessibility mode.

### Acceptance

- VFX recipe/schema tests
- particle-pool/no-allocation tests
- precompile contract
- npm run check:flight:clean
- npm run check:visual-stability
- relevant VFX/performance checks
- Spector CLI capture with named plume draws, shaders, textures, blend/depth state
- browser/Electron motion capture
- vfx_thruster_rcs classification accepted with durable evidence

### Commit boundary

Commit message: feat(vfx): replace player glow-ball trails with production plume system

Rollback: revert this commit to checkpoint 3; no simulation state or saves change.

## 10. Checkpoint 5 — Existing-asset family multiplier

### Goal

Prove that the approved standard can improve quantity economically by upgrading two high-reuse
existing families without producing recolored clones.

### Initial families

1. Station function family:
   place_station_trade_hub, refinery, mining, fab, military, blackmarket, research.
2. Natural/wreck dressing family:
   current common rock variants, debris chunks, and the most-used wreck donors.

This is a first migration wave, not a claim that all 80 assets are complete.

### Required implementation

1. Turn the checkpoint-3 material work into versioned family recipes:
   - shared node groups and trim/material sources;
   - semantic material roles;
   - construction and damage masks;
   - parameter bounds appropriate to the family;
   - explicit variables for function, faction, age, damage, maintenance, and story marks.

2. Build a family-variation matrix. Every variant must differ meaningfully in at least one non-color
   dimension such as silhouette, module arrangement, functional equipment, damage state, motion, or
   context. Color remains supportive, not sufficient.

3. Use existing geometry as donors:
   - resurface when form is strong;
   - recompose modules when the hierarchy is weak;
   - rebuild around preserved silhouette/sockets when topology blocks quality;
   - assign weak but serviceable versions to honest background/LOD roles;
   - retire only with a recorded reason.

4. Add faction-aware station identity through a data resolver, not per-station hard-coded branches.
   Identity includes construction, markings, light behavior, maintenance, and contextual dressing.

5. Add a runtime variety diagnostic that records recently visible asset family, silhouette variant,
   material recipe, faction, and damage/age treatment. It reports repetition; it must not freeze an
   arbitrary global count as aesthetic policy.

6. Process exact manifest/release/runtime/classification records one family member at a time. A
   family is not accepted wholesale because one member looks good.

7. Capture sparse, normal, and crowded routes plus a station lineup and rock/wreck field. Confirm
   batching, LOD, residency, and loading do not introduce quality cliffs.

### Acceptance

- family-recipe and variant-schema tests
- faction livery/identity contract
- npm run check:asset-status
- npm run check:asset-reachability
- npm run check:assets:live
- npm run check:visual-stability
- npm run check:flight:clean
- current performance/hitch checks
- per-asset classifications and independent side-by-side review
- no color-only clones and no newly accepted factor-only standard assets

### Commit boundary

Commit message: feat(assets): multiply approved station and world-dressing families

Rollback: revert this family wave; checkpoints 1–4 remain accepted.

## 11. Checkpoint 6 — Story-to-asset compiler and first embodied pack

### Goal

Make story-driven autonomous expansion concrete. Cheap agents receive a closed brief generated from
canonical story/game data rather than being told to read lore broadly and invent whatever seems cool.

### Canonical read sources

- src/data/missions.js STORY_BEATS
- src/story/campaign47a/embodiedMissions.js
- src/story/campaign47a/embodiedDialogue.js
- src/data/narrative.js
- exact faction and sector data referenced by the beat
- design/world-identity/STORY_SECTOR_MAP.md
- design/depth-program/P2-story-beat-embodiment.md
- relevant exact Depth roster entry

Do not treat transcripts, old prompts, broad archive searches, or generated concepts as canon.

### Required implementation

1. Add scripts/graphics/compile-story-asset-briefs.mjs.
   - Import live data where practical.
   - Resolve beat ID, gameplay steps, location, faction, named contacts/targets, consequence,
     aftermath, and persistence.
   - Emit schema-valid briefs; never rewrite canonical story data.
   - Detect unresolved asset IDs, locations, factions, and missing route prerequisites.
   - Generate a dependency DAG so asset work does not silently precede required gameplay/location
     integration.

2. Each generated brief must identify:
   - the story claim the player should read visually;
   - the gameplay verb that exposes it;
   - one anchor object or state;
   - reusable family donors;
   - required new geometry/surfacing/VFX/audio;
   - before, during, and aftermath states;
   - save/persistence implications;
   - route and evidence.

3. Pilot the compiler on B2 first_blood, the existing richest embodiment reference.
   Build the smallest coherent visual pack that makes its existing interaction memorable:
   - named target treatment using an approved ship donor;
   - readable scan/identification signature;
   - tether/combat damage state;
   - wreck/debris aftermath using checkpoint-5 family assets;
   - story-specific markings and effect treatment;
   - no new progression writer.

4. Preserve missions as the sole story beat progression owner. campaignTransitions remains a
   read-only observer. Do not casually rewrite STORY_BEATS.

5. Wire the pack through existing encounter, aftermath, asset, and dialogue seams. Reuse approved
   families before authoring unrelated one-offs.

6. Capture the normal B2 route:
   - approach and identification;
   - physical interaction/combat;
   - immediate aftermath;
   - revisit/save-reload state where persistent;
   - browser and Electron.

7. After B2 is accepted, generate candidate briefs for B0–B7 and Depth story entries. Do not build
   or mark them accepted in this checkpoint.

### Acceptance

- asset brief schema/closure/path tests
- deterministic brief-generation test
- node scripts/check-m5-story-progression.mjs
- npm run check:story-beats
- relevant embodied-story and encounter checks
- npm run check:sim:compare with hashEqual:true
- npm run check:asset-reachability
- npm run check:assets:live
- npm run check:visual-stability
- save/reload proof when the pack persists
- independent review that the visual pack communicates the named story claim during normal play

### Commit boundary

Commit message: feat(story-assets): compile canon into first embodied visual pack

Rollback: revert this pack/compiler commit; story progression and checkpoints 1–5 remain intact.

## 12. Recurring production loop after checkpoint 6

Once all six checkpoints are accepted, future cheap-agent runs use one brief and one family at a time:

1. Select the highest story leverage or player-exposure brief whose dependency DAG is green.
2. Create a real isolated worktree.
3. Resolve and validate the brief.
4. Reuse approved donors and family recipes.
5. Author source and candidate; never overwrite release output.
6. Bake, pack, optimize, and independently validate.
7. Integrate through exact registries.
8. Run focused checks.
9. Capture the real route.
10. Send the evidence packet to a fresh-context reviewer.
11. Rework named defects or classify the result.
12. Commit and push one logical asset pack.

The recurring loop may create candidates autonomously. Only evidence-backed independent review may
promote them. If no approved reference covers the proposed new visual language, the agent stops at
candidate and requests a user preference decision.

## 13. Cheap-agent handoff template

Every run returns:

- checkpoint or brief ID:
- starting commit:
- worktree path and branch:
- owner files inspected before edit:
- active locks/processes checked:
- files changed:
- source assets and donor hashes:
- generated candidates:
- commands run with exit summaries:
- authored/fallback diagnostics:
- browser evidence:
- Electron evidence:
- GPU/performance evidence:
- independent reviewer verdict:
- classification changes:
- open defects:
- commit and pushed branch:
- exact rollback:
- next eligible packet:

Missing fields mean the handoff is incomplete. A conversational claim such as "looks much better" is
not a substitute for any field.
