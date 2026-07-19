# Graphics Merge and Resume Checkpoint — 2026-07-18

> **Purpose:** recoverable integration snapshot for the active graphics overhaul. This is detailed
> graphics merge guidance, not whole-program completion truth. `design/program/**`, current Git,
> current checks, and player-route evidence remain authoritative.

## 1. Goal

Preserve the highest-value visual result across the dirty `codex/graphics-overhaul` worktree,
newer `master` work, the incoming Kimi Helios task, and the Codex-owned Wasp production pass. Do not
choose a branch wholesale.
Select the stronger implementation per visual subsystem, port useful donor ideas from losing
implementations, and finish with one reproducible browser/Electron game path.

The merge checkpoint is reached when the opening route visibly contains the accepted Kestrel,
thruster/RCS, dark-space background, Helios, navigation infrastructure, representative geology,
combat VFX, and stable authored presentation without placeholder swaps or transform jumps.

## 2. Exact repository snapshot

Audit date: 2026-07-18, America/New_York.

| Checkout | Branch | HEAD | Dirty paths | Graphics-relevant dirty paths | Interpretation |
|---|---|---|---:|---:|---|
| `C:\Users\93rob\Documents\GitHub\SpaceFace` | `master` | `4c367cd7122cfa66118b9f15ea91766b71ea4f75` | 24 | 9 | Active local polishing; read-only to this lane. |
| `C:\Users\93rob\Documents\GitHub\SpaceFace-graphics-overhaul` | `codex/graphics-overhaul` | `9921f1a0abce9ccd2b12aa748f56b0c0e4779259` | 495 | 337 | Active graphics implementation and asset evidence. |

Git topology at the audit:

- `9921f1a0` is the merge base of `codex/graphics-overhaul` and `master`.
- The graphics branch has zero commits beyond that merge base; its implementation is dirty-tree work.
- `master` is 26 commits ahead and changes 697 files relative to the merge base.
- 35 paths are changed by both newer `master` and the graphics dirty tree.
- No other local branch has unmerged committed graphics work ahead of `master`.
- Other worktrees contain UI/content WIP, but no competing dirty background/asset implementation of
  comparable scope. They remain separate and are not merge donors unless their owner returns a
  specific visual handoff.

Snapshot update, later on 2026-07-18:

- `master` advanced to `f7e8a4fd630351919a9c633d3d60e1f85a2637a2`, 37 commits beyond the graphics
  merge base. The intervening commits are gameplay/mining/integration work, not a competing graphics
  branch.
- The master checkout still has 24 dirty paths, including `src/render/bloom.js`,
  `src/render/renderer.js`, `src/data/sectors.js`, and concurrent world/mining-related work.
- The graphics worktree has 496 dirty paths after adding the resumable checkpoint and completing
  candidate tooling. Treat both checkouts as active; do not merge directly into the dirty master
  checkout.
- Three user-owned tasks are running sequentially on `master`: **Prompt 1 — Reconcile current work
  and finish dependency roots**, **Prompt 2 — First playable systems and corridor operation**, and
  **Prompt 3 — Massline mechanics and Asteroid Ops production model**. Until Prompt 3 returns, master
  is a moving integration target and is read-only to the graphics lane. Safe graphics work is limited
  to the isolated graphics worktree, scratch candidates, evidence, audits, and recoverable graphics
  commits that do not alter another checkout.
- During checkpointing, `master` advanced again to
  `61e840714d4250ea5b353a12897d4f814791e045` (39 commits beyond the merge base). This confirms that
  integration must target the post-Prompt-3 commit rather than any intermediate master SHA.
- Recoverable graphics commit `dacc4a23` now preserves the Wasp hero candidate recipe, specification,
  deterministic raw/KTX2 pipeline, validators, matched-camera capture harness, and reporting tools.
  It contains no promoted GLB, release-manifest, runtime-map, or master-checkout change.
- Additional recoverable commits now preserve independently reviewable foundations:
  - `4ece012b` — de-hazed sector background substrate and focused checks;
  - `6b0b6914` — production thruster/RCS recipes, textures, generation, and runtime substrate;
  - `c3ba4490` — pooled combat beam/sprite/explosion substrates with lifecycle tests;
  - `dc4ab552` — authored presentation admission, capability policy, and exact pipeline warmup;
  - `11f9668c` — semantic authored PBR material profiles and coverage tests.

Latest checkpoint update:

- `master` is now `1bb71349e9a34d0e0b8acca4a022fbcc817b75e7`, 45 commits beyond the common
  base. It is still an active read-only target until the user confirms the three Claude tasks are
  finished.
- The graphics implementation tip immediately before this receipt update is
  `662d323e0ab5042b668e3bfd942eae5d30d33c9f`, comprising 23 recoverable commits beyond the
  common base. Against the recorded master it is 45 commits behind and 23 commits ahead; this is
  donor history, not a branch to merge wholesale.
- Dirty paths have fallen from roughly 496 to 225 because the graphics implementation and source
  assets have been partitioned into commits. The remaining tree is still intentionally dirty:
  generated catalog GLBs/manifests, UI/mining overlaps, candidate outputs, and unsafe release
  deletions remain quarantined.
- Kimi's paused Helios worktree is
  `C:\Users\93rob\Documents\GitHub\SpaceFace-oc-helios-golden`, at `4c367cd7`, with its work
  preserved under untracked `.scratch/helios-golden/`. It has no unique committed implementation yet.
- The full current recovery stack after `9921f1a0` is:
  - `dacc4a23` — Wasp hero candidate recipe/tooling/evidence, no runtime promotion;
  - `d44d602e` — original resumable merge checkpoint;
  - `4ece012b` — de-hazed sector background substrate;
  - `6b0b6914` — production thruster/RCS substrate;
  - `c3ba4490` — pooled combat and explosion substrates;
  - `dc4ab552` — presentation admission/capability/pipeline gates;
  - `11f9668c` — semantic authored PBR profiles;
  - `71d3416f` — thruster and combat-family runtime wiring;
  - `e9397641` — geology and interaction identities;
  - `c84c2318` — ship appearance identity schema;
  - `6cdbfe4a` — authored fallback identities;
  - `29ccbf09` — direct authored presentation, interpolation stability, and launch/probe contracts;
  - `f94449b1` — depth-correct celestial background layers;
  - `93a02d9e` — Kestrel V5 authoring source, role maps, and evidence;
  - `56670a0d` — Helios Golden V4 source, functional PBR maps, and export tools;
  - `3b1b6c14` — reusable Blender/PBR foundry sources;
  - `7fead19a` — repeatable release, Spector, and surface-receipt tooling;
  - `7b71eb5b` — refreshed merge/resume checkpoint;
  - `2e6959c5` — bounded, role-specific procedural PBR bridge for legacy assets;
  - `821b1a15` — authored canopy optical/PBR preservation;
  - `f57cb0fb` — fail-closed authored identity and stable station LOD behavior;
  - `0c34fc9e` — focused stable-presentation contract coverage;
  - `662d323e` — removal of the obsolete generic station proxy substrate.

High-risk current graphics state:

- Deleted release files must not be merged as-is:
  - `assets/ships/release/parts/wholeships/pelican.glb`
  - `assets/ships/release/parts/wholeships/wasp.glb`
  - `assets/ships/release/parts/wholeships/wasp_production_v1_lod1.glb`
  - `assets/ships/release/parts/wholeships/wasp_production_v1_lod2.glb` (Git may display this as a
    false rename to a Kestrel contact sheet)
- `src/systems/mining.js`, `src/ui/input.js`, `src/systems/world.js`, and the drilling/minigame lane
  include concurrent work. Graphics integration must not replace them wholesale.
- `active_sessions.json`, `active_sessions.lock`, `docs/user-guide/`, and unrelated untracked work are
  not graphics checkpoint inputs.

## 3. Current graphics truth

### Player-route accepted or strongly evidenced in the graphics worktree

| Vertical | State | Durable implementation/evidence |
|---|---|---|
| Kestrel/Hitch starter | Advanced V5+ source and live-route donor are preserved; not yet final-accepted at normal/default camera | `93a02d9e`, `.devshots/k0-kestrel/v5-plus-live/`, `.devshots/graphics/kestrel-v5-plus-runtime-parity/` |
| Thruster and RCS | Substrate, recipes, textures, and runtime bindings are preserved; final synthesized browser/Electron route must still prove a visible plume | `6b0b6914`, `71d3416f`, `.devshots/graphics/thruster-acceptance/` |
| Authored admission | Focused tests prove no temporary blue box/procedural starter publication | `src/core/presentationAdmission.js`, relevant admission tests |
| Combat families | Implemented and focused capture/check accepted; global final pass remains | `.devshots/graphics/combat-vfx-acceptance-r23/` |
| Geology landmarks | Wired and stable; identity cues can still improve | `.devshots/graphics/geology-landmark-live/` |
| Background de-haze | R3 captured with black space/localized structure; transparent celestial overdraw was repaired and structurally tested; final master-based recapture remains | `4ece012b`, `f94449b1`, `.devshots/graphics/background-authored/` |

### Candidate-only work that must not be represented as integrated

| Candidate | State | Evidence/input |
|---|---|---|
| Wasp fleet hero | Candidate pipeline complete and recoverably committed at `dacc4a23`; controller promotion and live wiring remain | `.devshots/graphics/wasp-fleet-hero-v1/` |
| Helios golden station | Golden V4 source/PBR base is recoverably committed; Kimi's structurally consolidated alternative remains paused and visually unaccepted | `56670a0d`, `C:\Users\93rob\Documents\GitHub\SpaceFace-oc-helios-golden\.scratch\helios-golden\` |
| Lane beacon/nav buoy | Evidence complete: buoy is a strong conditional donor; beacon is rejected at gameplay distance pending silhouette repair | `.devshots/graphics/navigation-infrastructure-v1/` |

## 4. Overlap verdict: background, lighting, bloom, and renderer

This is not an `ours` versus `theirs` merge. Use the following subsystem verdicts.

### 4.1 Background composition — graphics presentation is the donor, master control flow is the base

Rebase the graphics presentation architecture from:

- `src/render/spaceBackground.js`
- `src/render/deepFieldStructureRecipes.js`
- `src/data/sectorVisualProfiles.js`
- `src/render/spaceReflectionEnvironment.js`

Reasons:

- It directly addresses the rejected full-screen blue haze and generic smudge language.
- It retains dark negative space and localizes sector structure.
- It separates density, structure, lighting, palette, and post behavior instead of tinting one field.
- It has matched multi-sector still/motion evidence and focused geometry/profile checks.
- Commit `f94449b1` repairs the previously hidden transparent-pass defect: stars, flares, planets,
  localized ribbons, wormholes, and comets now depth-test behind opaque gameplay geometry, never
  write depth, and remain ordered behind gameplay transparencies.

Do not copy `spaceBackground.js` or `renderer.js` wholesale. Current master remains the base for
renderer control flow, pipeline tracking, upload/write-if-changed optimizations, and newer sector
content. Port the declarative profiles and repaired background implementation into those seams.
R4 remains visually unaccepted until recaptured. Do not treat code/check success as the final verdict.

### 4.2 Master bloom/lighting work — donor, not wholesale winner

The dirty master versions of `src/render/bloom.js`, `src/render/renderer.js`,
`src/core/gameState.js`, and `src/data/sectors.js` contain useful ideas:

- black-preserving multiplicative shadow/highlight balance;
- non-negative saturation math preventing NaN before sRGB encoding;
- a higher selective-bloom threshold;
- lower flat ambient light;
- warm key/cool fill contrast;
- explicit image-based environment intensity;
- focused structural bloom regression coverage.

Port those ideas into the graphics architecture as follows:

1. Keep graphics `resolvePostPresentation()` and its default of zero full-screen grade, vignette, and
   grain. Optional presentation controls remain independent of bloom.
2. Replace the optional legacy grade math with master's black-preserving multiplicative balance and
   non-negative/NaN-safe saturation implementation.
3. Evaluate a base bloom threshold of `1.0` under matched captures; retain sector profile biasing.
4. Keep two bloom levels as the accepted default. Reject master's four-level wide-halo experiment:
   its explicit goal is broader screen-space glow and it conflicts with the required black-space,
   localized-emissive presentation.
5. Put master's warm-key/cool-fill and low-ambient values into the declarative core sector visual
   profile, not a new static global lighting constant.
6. Evaluate `scene.environmentIntensity = 1.1` with the graphics reflection environment. Retain only
   if coated paint, metal, glass, and engine materials separate without overexposure.
7. Preserve the master NaN probe and extend it to optional-grade values of zero and one.

### 4.3 Renderer — master control flow, graphics presentation modules

Use current `master` as the eventual control-flow base because it owns newer integration/control-flow work. Manually port
graphics renderer changes rather than accepting either `renderer.js` wholesale. Required graphics
features to preserve:

The latest detailed renderer preflight used master `3cd5c5fc`; master advanced to `1bb71349` while the
audit was running. Its ownership conclusions remain valid, but line numbers and exact overlap counts
must be refreshed from the user-confirmed final Claude tip.

- authored-direct admission and presentation readiness;
- asset/render residency policy without visible fallback publication;
- dynamic physics/interpolation stability;
- sector visual profiles;
- structured reflection environment;
- current shadows and canopy/material policy;
- thruster, combat, geology, and accessibility bindings;
- exact pipeline warmup and context-loss behavior.

Master-side gameplay/UI changes win outside those presentation seams unless a focused regression
demonstrates otherwise.

Renderer preflight blockers that the final synthesis must preserve explicitly:

- keep master's `createPipelineAdmissionTracker`, current-generation pipeline ownership, and
  write-if-changed instance upload helpers;
- keep master's render-target pipeline warmup, queued exact-pipeline commit, admission error handling,
  and New Game/loaded-game readiness rechecks; the graphics branch must not bypass them;
- keep master's shield/nav auxiliary pooling loop and port only the idle-hidden, impact-visible shield
  presentation predicate so unconditional buffer uploads are not reintroduced;
- preserve every newer master sector/POI addition; port only the de-haze palette/profile values and
  localized background composition, never adjacent content deletions;
- reapply the bounded 5.2k ship-authoring seam from `29ccbf09`, but do not restore whole-sector
  authored decode eagerness;
- keep optional common-rock texture readiness separate from critical Hitch/Helios launch readiness;
- start from current master for `renderer.js`, `assetLoader.js`, `partsLibrary.js`,
  `pipelineReadiness.js`, `visualFactory.js`, and `sectors.js`; use the graphics files as hunk-level
  donors only;
- validate any reflection-environment intensity and black-point change with matched material and
  black-ramp captures rather than carrying over constants.

## 5. Asset winner policy

Never merge binary GLBs by branch preference. Select one source candidate per asset, then rebuild its
release outputs once.

For every competing asset:

1. Resolve the exact runtime-selected source and release paths.
2. Compare source `.blend`, build scripts, PBR inputs, transforms, sockets, LODs, and provenance.
3. Run both candidates through the same renderer, camera, lighting, exposure, and quality settings.
4. Inspect close/default/far/grazing views plus normal/roughness/metallic/AO/emissive proof.
5. Name the visible strengths of each candidate.
6. Choose the stronger base.
7. Port any superior functional geometry, material role, texture technique, decal logic, optimization,
   or validation from the losing candidate.
8. Rebuild raw and Meshopt/KTX2 release GLBs from the resulting canonical source.
9. Validate source/release visual parity before changing manifests.

### 5.1 Controller visual decisions at this checkpoint

- **Background:** R3 de-haze is the integration foundation. It wins on black negative space,
  localized composition, and silhouette readability. Remaining defects are flat/cutout dust ribbons,
  abstract Veil strokes, simple planet bands/rings, and oversized repeated plus-shaped stars.
- **Wasp:** the committed candidate pipeline is the conditional integration base. Before final
  acceptance, strengthen meso-scale structural normals, broad-panel roughness contrast, localized
  engine/nose wear, and a few identity features that survive the default camera; then prove it on the
  real browser/Electron route.
- **Kestrel/Hitch V5+:** source and reproducible role maps are preserved at `93a02d9e`. The current
  close live capture is a material/readability improvement, but broad pale panels still converge
  toward one value and most surface richness collapses at the 120px/default-gameplay view. Treat it
  as the correct advanced construction base, not a finished hero asset. Its final pass needs larger
  meso-scale value/roughness breaks, controlled edge highlights/wear, stronger functional grouping,
  and a real throttle/RCS capture without detached celestial points painting over the hull.
- **Helios:** existing Golden v4 is the strongest visually demonstrated base at this checkpoint.
  STATION-GOLDEN-02 is a structural donor for primitive consolidation, exact sockets/bounds,
  supported service bays, and tangent repair. Kimi's interrupted candidate is preserved but visually
  unaccepted until its copper/orange material collapse, nearly uniform roughness, weak normal/AO, size,
  and release packaging are repaired.
- **Navigation buoy:** conditional promotion candidate after live-route proof and wear/plastic-sheen
  cleanup.
- **Lane beacon:** do not promote. Its thin mast silhouette collapses into a low-contrast line at
  default/far distance; broaden the upper/mid mass or add lateral range arms first.

Direct inspection note: Golden V4's overall silhouette and functional zoning are substantially
better than the live station, but its close approach still reveals flat broad cylinders, coarse
faceting, and several near-uniform grey surfaces. Kimi must beat or repair those exact weaknesses;
the comparison is not merely Golden V4 versus Kimi's current copper/orange candidate.

## 6. External and owned asset integration slots

### KIMI-HELIOS

- The current STATION-GOLDEN-02 scratch candidate is a donor/baseline, not the winner by default.
- Kimi must receive its build report, controller review, source/release inspection, and matched current
  Helios captures.
- Compare Kimi against both the live station and STATION-GOLDEN-02.
- Preserve STATION-GOLDEN-02's primitive consolidation, exact socket/bounds, supported service bays,
  clean tangents, and validator success if Kimi's visual base is better.
- Final Helios source/release promotion happens only after the comparison pass.

### CODEX-WASP

- Kimi's Wasp task is cancelled/deferred because its available usage is being consumed by the first
  asset task. Codex owns completion, controller acceptance, promotion, and live integration of Wasp.
- The current repaired Wasp candidate is the production baseline, not a disposable prototype.
- Preserve its selective normal repair, non-periodic roughness, segmented injector/ceramic/actuator
  engine construction, and flush mask-only vector markings.
- Close deterministic raw/KTX2 generation, Khronos/strict validation, fixed-camera parity, and the
  recorded residual defects before promotion.
- Judge Wasp at LOD0/1/2 and the default combat camera; the normal gameplay view remains decisive.
- Repair the pre-existing deleted/incomplete Wasp release state only after controller acceptance of
  the canonical candidate.

Any Kimi worktree must not edit `master`, the graphics worktree, or another worker's outputs. It returns
branches or integration-ready candidates with exact bases, hashes, scripts, captures, and checks.

## 7. Integration sequence

Do not start by merging the dirty graphics branch. Use serial, independently verifiable slices.

1. **Freeze evidence and ownership**
   - Allow the current Wasp and navigation candidate lanes to finish their evidence packages.
   - Record the master bloom/renderer owner's final return before editing those files.
   - Keep mining/drilling and master UI/content WIP outside graphics staging.

2. **Recoverable graphics history — complete for the current donor set**
   - The 23-commit stack listed in section 2 now preserves the background, VFX, admission,
     materials, identities, Kestrel/Helios/Wasp sources, Blender foundry, and evidence tooling.
   - It deliberately excludes bulk-generated catalog GLBs, both manifests, Kimi scratch outputs,
     live Wasp/Helios promotion, and unsafe release deletions.
   - Do not squash this stack before synthesis; the vertical boundaries are the rollback and
     selection surface.

3. **Create a fresh integration branch from current `master`**
   - Do this only after all three user-owned sequential master tasks have returned and their commits,
     residual dirty paths, checks, and handoffs have been audited.
   - If master remains dirty after Prompt 3, preserve and classify every path; do not create the
     integration branch until each overlapping path has an explicit owner or handoff.
   - Do not checkout `master` in another worktree.
   - Port/cherry-pick GFX-C1 through GFX-C5 in order, resolving each slice before the next.

4. **Resolve the 35 overlapping paths manually**
   - Start from current master control/data/UI behavior.
   - Reapply graphics presentation modules and contracts deliberately.
   - Never use tree-wide `ours`/`theirs` resolution.
   - Rerun the narrow owning checks after each overlap group.

5. **Land the owned/external assets as leaf integrations**
   - Promote the controller-accepted Codex Wasp candidate.
   - Compare and select the Helios winner between Kimi and STATION-GOLDEN-02.
   - Port donor strengths from the losing Helios candidate.
   - Add canonical source/scripts first; build raw/release outputs once.

6. **Build manifests/releases once**
   - Reconcile source manifest, release manifest, runtime slots, and provenance after all winners exist.
   - Run the release build with no concurrent Blender/export process.

7. **Final visual synthesis**
   - Capture matched browser and Electron opening routes.
   - Compare bloom off/on, optional grade off/on, reduced motion/flash, and dense combat.
   - Repair visual regressions; do not round them down into documentation.

8. **Merge to master**
   - Merge only a clean, reviewed integration branch.
   - Update `design/program/01–05`, `NOW.md`, and the current roadmap receipt in the same lead-owned
     integration pass.

## 8. Mandatory comparison captures

| Surface | Matched scenarios |
|---|---|
| Background/post | Helios orbital void, Ceres dust lane, Pallas filament, Veil scar; bloom off/on; optional grade off/on; motion/parallax |
| Kestrel/thruster | idle, acceleration, cruise, turbo, hard-turn RCS, reduced settings |
| Helios | close/default/far, grazing material light, docking approach, normal route |
| Wasp | close/default/far, rear engine, LOD0/1/2, dense combat |
| Navigation | beacon and buoy close/default/far, no-emissive, in-context route |
| Combat | each weapon family firing/flight/shield/hull; explosion scale classes; dense and reduced settings |

Every comparison uses the same viewport, DPR, camera, exposure, quality, state seed, and asset identity.

## 9. Merge acceptance stack

Run focused owners first, then the combined set:

```powershell
node test/space-background-shared-geometry.test.mjs
node scripts/check-parallax-layers.mjs
node scripts/check-thruster-vfx-pack.mjs
node scripts/check-sg08-render-vfx.mjs
node scripts/check-vfx-trail-bind.mjs
node scripts/check-combat-hit-vfx-pack.mjs
node scripts/check-phased-explosion-vfx.mjs
npm run check:parts-manifest
npm run check:asset-status
npm run check:asset-reachability
npm run check:assets:live
npm run check:flight:clean
npm run check:visual-stability
npm run check:launch-policy
```

Also require current browser and Electron captures, Khronos validation for every promoted GLB, source
versus KTX2/Meshopt parity, accessibility comparisons, and measured frame/draw/transparent-pass evidence.

### Current focused receipts

- Authored admission, direct preview, pipeline gate, surface tint, dynamic interpolation, rock PBR,
  LOD policy, and launch checks: 44/44 green in the owning combined run; the later edge-case run was
  35/35 green.
- Background depth/negative-space contract: 3/3 new occlusion tests, shared-composite script pass,
  and 11/11 deep-field/profile/post-restraint tests green.
- Kestrel surface V5 verification passed with ten semantically distinct role receipts. The legacy
  `finalize_v4.mjs` end-to-end command is externally blocked by its missing downloaded runtime ZIP;
  source/release promotion is therefore intentionally not in this checkpoint.
- Helios Golden V4: 13/13 recipe-contract tests, surface-foundry receipt, and export/tangent contract
  all green.
- Reusable foundry: frigate, geology, reusable module, and Warden triad contract checks all green.
  Their own output correctly states that runtime visual acceptance is not implied.
- Release/GPU evidence tooling: 8/8 focused tests green; release-builder `--help` exits before lock
  acquisition.
- Procedural legacy-surface bridge: 9/9 authored-profile tests green and deterministic contact-sheet
  generation succeeded. Canopy optical preservation, fail-closed admission, stable station LOD,
  asteroid-instance identity, readability-core, and shield-presentation focused checks are green.
- The dirty generated-catalog PBR test was deliberately excluded: the quarantined Wasp assembly
  currently references 77 textures and fails its 64-reference budget. The budget was not weakened and
  the generated GLBs/manifests were not staged.

These receipts prove recoverability and narrow contracts. They do not replace the final normal-route
browser/Electron captures, motion/LOD/flicker evidence, or the Kimi/Golden Helios comparison.

## 10. Resume procedure

At pickup:

1. Read root `AGENTS.md`, `design/program/README.md`, and this file.
2. Re-run:

   ```powershell
   git status --short
   git worktree list --porcelain
   git branch --show-current
   git rev-parse master
   git rev-parse codex/graphics-overhaul
   git rev-list --left-right --count codex/graphics-overhaul...master
   ```

3. Recount overlapping paths; do not reuse the snapshot's `35` if branches moved.
4. Inspect active Blender/export/release locks and all dirty release/manifests.
5. Read the latest controller reviews in:
   - `.devshots/graphics/wasp-fleet-hero-v1/`
   - `.devshots/graphics/navigation-infrastructure-v1/`
   - `.devshots/graphics/background-authored/`
   - the STATION-GOLDEN-02 scratch root, if it still exists.
6. Locate incoming Kimi branches by exact commit, not branch name alone.
7. Resume at the first incomplete numbered step in section 7.

## 11. Current stop line

The graphics worktree is **not merge-ready** at this snapshot because:

- the donor implementation is now safely partitioned, but current master is still moving and is 45
  commits beyond the common base;
- overlap counts must be recalculated from the user's confirmed final Claude commit rather than the
  stale original count of 35;
- four release whole-ship files are missing or false-renamed;
- bulk catalog GLBs/manifests remain quarantined because several generated replacements appear
  visually weaker and the release set has unsafe deletions/false rename detection;
- background R4, final Hitch surfacing/thrusters, navigation, Wasp, and Helios still lack matched
  browser/Electron acceptance on the synthesized master route;
- Kimi Helios is paused in scratch, while Codex Wasp and Golden V4 still require winner comparison,
  final acceptance, and promotion;
- the graphics renderer donor cannot be copied wholesale because current master owns newer pipeline
  tracking, instance-write optimization, sector content, and gameplay control flow;
- final browser/Electron/performance/accessibility synthesis has not run.

Do not convert this stop line into a claim that the existing accepted verticals are disposable. They
are the donor set to preserve while the integration branch is assembled.
