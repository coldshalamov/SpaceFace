# NINTH-MOUTH-CUT-01 — the Ninth Mouth's rock walls stop reading as flat polygons

**Lane 1 look job (3D), dispatched to hydrogen (gemini-4-hydrogen-xhigh). You can read frames —
verify every visual claim on a capture before you write it.** Every game/browser run goes through
the lock: `node scripts/fleet/game-lock.mjs run -- <cmd>`.

## Why

AUDIT-14's lead-viewed capture `.devshots/audit-14/04-ceres-ninth-mouth.png` shows the Mouth mass
as huge flat unshaded facets — dark olive planes with no cut separation (the owner's "flat and
blocky"). PR #945's fix for exactly this (a per-facet `shadeRegions` shader) was deliberately
deferred to the look lane "after LOOK-04" (`build_map.md` §#945). LOOK-04's rock family — banded
light, shadow side, rim (`67af648297`), opaque satin rock (`ee27339278`) — has landed, so the
dependency is met. The receiver board, lamp and tow job in the same frame all work; only the look
is wrong.

## Design law (LOOK-04 governs; the PR's Nocturne mood does not)

- Two energy bands: non-emissive surface terms soft-clip ≤ ~0.8 scene-linear; only authored
  emissive exceeds 1 and can bloom.
- Saturated indigo shadow, warm key. Band the light, never the texture.
- Rim = readability, role colour (rocks are neutral bone).
- Background stays subordinate to bodies.
- Shader programs are a budget: LOOK-04 is collapsing 216 programs toward one shared family
  material. Do not add one program per rock; prefer per-instance/per-region attributes on the
  family material. At most one new shared program, and only if the family material truly cannot
  carry region gains.

## Reference material (read it; do not paste it)

- `.devshots/ninth-mouth-pr945.diff` — PR #945's full diff. Relevant parts:
  `src/render/nocturne/shadeRegions.js` (the mechanism: `claimShadeRegion`,
  `installShadeRegionShader`, `SHADE_REGION_GAIN_GLSL` — per-region facet gains claimed by bodies
  and applied as a GLSL gain), its renderer wiring (~diff line 2257), and its test seam (~diff
  line 7151). Steal the mechanism, not the palette: it was authored under the old dark
  "nocturne" direction, which is no longer the design authority.
- The current rock family: how LOOK-04 landed banded light + rim on rocks. Start at
  `src/data/lookMoods.js` and the rock/asteroid material path under `src/render/`. AUDIT-14's
  capture proves the Mouth bodies draw through the ordinary rock admission, not a bespoke mesh —
  find the exact owner first.

## Do

**Lead amendment 2026-11-16 (second dispatch):** the previous hydrogen run was lock-starved by a
long legitimate measurement (`throw-fixture` f7, round 2, attempt 19/40 — it advances, leave it
alone). Its static Step-1 diagnosis is written up and **adopted as the working root cause**; read
it first: `.devshots/fleet/runs/NINTH-MOUTH-CUT-01.hydrogen.2026-11-16T06-12-20/RECEIPT.md`
("Static pre-diagnosis notes"). Summary of what it established (file:line in the receipt):

- The Mouth shoulders/fallen rock are authored GLBs (`place_asteroid_rock_a/b.glb` →
  `helios-rock-a/render.glb`, factor-only PBR: roughness 0.92, metallic 0, no textures).
- `applyForgeFinish` (`src/render/authoredMaterialProfiles.js:125-171`) never calls
  `stampSharedMaterialRole(material, SHARED_MATERIAL_ROLE.ROCK)` for these, so
  `sfRockSurface` evaluates 0 (`illustratedSurface.js:282`) and LOOK-04's banded rock treatment
  never applies; `bandMix` additionally attenuates to 0.07 at roughness 0.92
  (`illustratedSurface.js:65-83`) → flat factor-only facets.
- `src/render/ceresNinthMouthVisuals.js` mounts only worklights and never claims shade regions,
  while `test/ceres-ninth-mouth-presentation.test.mjs:30` still mocks `claimShadeRegion` —
  the seam is expected but unused.
- Open question needing one live look: the capture shows ~30 huge flat polys + a C-shaped hole on
  the upper-right mass despite LOD0 having 6k+ tris (LOD selection, `cameraOccluders`, or
  near-plane clipping?).

So the order flips: **implement lock-free first, verify live last.**

1. **Implement from the diagnosis** (no game boot needed): give these rocks the family's rock
   treatment (stamp the shared role / correct the `sfRockSurface` gate the way the committed rock
   family does it), and make `ceresNinthMouthVisuals` claim per-facet shade regions through the
   nocturne `claimShadeRegion` seam so adjacent facets take visibly distinct shade steps under the
   same key light. Region gains default to zero outside claimed regions. Extend the existing
   headless tests (`ceres-ninth-mouth-lighting/presentation/layout`, currently 19 passing) to pin
   the new contract — red first, then green.
2. **Then verify live, under the lock**: before/after PNGs (same route, same seed, 1920×1080)
   into `.devshots/ninth-mouth-cut/`, plus the look bench hero frames + lint. If the lock is
   held by the throw-fixture, poll `node scripts/fleet/game-lock.mjs status` — cite the f-file
   attempt numbers advancing as proof it is alive, and wait; do not kill it. If your 5-minute
   cap hits while queued, say so in the receipt and leave the live verification marked open.
3. **No gameplay edits.** Nothing in `src/systems/ceresNinthMouth.js`, the job logic, physics, or
   saves may change. Render-side and at most one data file for region authoring only.
4. **Foreign WIP**: `src/render/rockTriplanar.js` and `test/rock-triplanar.test.mjs` sit untracked
   in the tree as a dead worker's in-flight work. Do not import, edit, or delete them. Concurrent
   live edits exist under `src/render/ships/*` (another agent) — stay off those files. Build only
   on committed files otherwise.

## Files you may edit

The render seam you diagnose in step 1 (expected 2–4 files under `src/render/`, at most one file
under `src/data/` for region authoring), plus at most one new test file for the region claim/gain
contract. List every file you touch in the receipt; anything beyond this list goes under
"Blocked", not an edit.

## Done

A keyboard player flying into the pocket sees separated shaded cut faces; the before/after pair
proves it on this route; the hero sweep lint holds; your touched/new tests pass; committed by
exact path; honest receipt with the step-1 diagnosis.
