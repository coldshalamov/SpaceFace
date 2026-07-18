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

High-risk current graphics state:

- Deleted release files must not be merged as-is:
  - `assets/ships/release/parts/wholeships/pelican.glb`
  - `assets/ships/release/parts/wholeships/wasp.glb`
  - `assets/ships/release/parts/wholeships/wasp_production_v1_lod1.glb`
- `src/systems/mining.js`, `src/ui/input.js`, `src/systems/world.js`, and the drilling/minigame lane
  include concurrent work. Graphics integration must not replace them wholesale.
- `active_sessions.json`, `active_sessions.lock`, `docs/user-guide/`, and unrelated untracked work are
  not graphics checkpoint inputs.

## 3. Current graphics truth

### Player-route accepted or strongly evidenced in the graphics worktree

| Vertical | State | Durable implementation/evidence |
|---|---|---|
| Kestrel/Hitch starter | Wired and player-route accepted in this worktree | `.devshots/k0-kestrel/v5-plus-live/`, `.devshots/graphics/kestrel-v5-plus-runtime-parity/` |
| Thruster and RCS | Wired, visible, throttle-responsive, reduced-settings evidence present | `.devshots/graphics/thruster-acceptance/` |
| Authored admission | Focused tests prove no temporary blue box/procedural starter publication | `src/core/presentationAdmission.js`, relevant admission tests |
| Combat families | Implemented and focused capture/check accepted; global final pass remains | `.devshots/graphics/combat-vfx-acceptance-r23/` |
| Geology landmarks | Wired and stable; identity cues can still improve | `.devshots/graphics/geology-landmark-live/` |
| Background de-haze | R3 captured with black space/localized structure; R4 code focused-green but not recaptured | `.devshots/graphics/background-authored/`, `src/render/spaceBackground.js` |

### Candidate-only work that must not be represented as integrated

| Candidate | State | Evidence/input |
|---|---|---|
| Wasp fleet hero | Candidate pipeline complete and recoverably committed at `dacc4a23`; controller promotion and live wiring remain | `.devshots/graphics/wasp-fleet-hero-v1/` |
| Helios golden station | Scratch candidate is Khronos-clean and structurally consolidated; no visual acceptance or live wiring | `C:\Users\93rob\AppData\Local\Temp\spaceface-station-golden-02-20260718-155559\` |
| Lane beacon/nav buoy | Repaired candidates are strict/Khronos-clean; final turntables/controller review and promotion remain | `.devshots/graphics/navigation-infrastructure-v1/` |

## 4. Overlap verdict: background, lighting, bloom, and renderer

This is not an `ours` versus `theirs` merge. Use the following subsystem verdicts.

### 4.1 Background composition — graphics implementation is the base

Keep the graphics worktree architecture from:

- `src/render/spaceBackground.js`
- `src/render/deepFieldStructureRecipes.js`
- `src/data/sectorVisualProfiles.js`
- `src/render/spaceReflectionEnvironment.js`

Reasons:

- It directly addresses the rejected full-screen blue haze and generic smudge language.
- It retains dark negative space and localizes sector structure.
- It separates density, structure, lighting, palette, and post behavior instead of tinting one field.
- It has matched multi-sector still/motion evidence and focused geometry/profile checks.

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
4. Keep two bloom levels as the accepted default. Master's four-level wide halo is not admitted until
   matched captures show localized emissive response without screen-wide softness or excess cost.
5. Put master's warm-key/cool-fill and low-ambient values into the declarative core sector visual
   profile, not a new static global lighting constant.
6. Evaluate `scene.environmentIntensity = 1.1` with the graphics reflection environment. Retain only
   if coated paint, metal, glass, and engine materials separate without overexposure.
7. Preserve the master NaN probe and extend it to optional-grade values of zero and one.

### 4.3 Renderer — master control flow, graphics presentation modules

Use current `master` as the eventual control-flow base because it is 26 commits newer. Manually port
graphics renderer changes rather than accepting either `renderer.js` wholesale. Required graphics
features to preserve:

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

2. **Create recoverable graphics commits on `codex/graphics-overhaul`**
   - GFX-C1: admission, identity, interpolation, asset pipeline/readiness.
   - GFX-C2: background, sector profiles, reflection environment, restrained bloom contract.
   - GFX-C3: Kestrel source/release, authored material profiles, thruster/RCS.
   - GFX-C4: projectiles, beams, impacts, phased explosions, accessibility/lifecycle.
   - GFX-C5: common rocks, geology landmarks, accepted navigation infrastructure.
   - Exclude candidate Wasp/Helios binaries and unsafe release deletions until their winner pass.

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

- only the Wasp candidate pipeline has been converted into a recoverable graphics commit so far;
- master was 26 commits newer at the original audit and reached 39 commits newer during checkpointing;
- 35 files overlap;
- three release whole-ship files are deleted;
- background R4, navigation, Wasp, and Helios lack final integrated acceptance;
- Kimi Helios is still incoming, while Codex Wasp still requires final acceptance and promotion;
- final browser/Electron/performance/accessibility synthesis has not run.

Do not convert this stop line into a claim that the existing accepted verticals are disposable. They
are the donor set to preserve while the integration branch is assembled.
