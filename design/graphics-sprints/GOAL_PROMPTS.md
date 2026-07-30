# Goal Prompts — Copy Into Each Agent Thread

> **Manual prompt library — explicit activation required.** Paste a prompt only after a user/lead
> selects a named sprint thread. The path lists coordinate simultaneous writers; they are not
> repository-wide or permanent prohibitions. Adapt them when the designated integrator must cross a
> seam for a coherent result. Verify markers against current owner/process/build activity before
> treating a lane as occupied, and never overwrite genuinely active work.

Paste **one** prompt below as the opening message for a new Cursor/Grok thread. Keep concurrent
threads separate; update the coordination paths if the live ownership plan changes.

**Director:** replace `<SPRINT_BATCH>` and `<ASSET_IDS>` before paste.

For every Tier A/B asset or VFX prompt below, append the mandatory worker clause from
`VISUAL_ITERATION_PROTOCOL.md` and require that file in the worker's read list. A cropped/tiny/stale
screenshot is `EVIDENCE_INVALID`, and the protocol's minimum review cycles do not grant acceptance.

For every authored 3D/Blender prompt—including a copied Top-50 goal—prepend the canonical craft route:
`assets/ships/AGENTS.md` → `docs/visual-assets/README.md` →
`docs/visual-assets/VISUAL_ASSET_PRODUCTION_STANDARD.md` →
`.grok/skills/spaceface-blender-material-truth/SKILL.md`. The worker completes the material-truth
preflight before modeling, records `componentReferenceDecision`, uses a component-only generated
reference when that method is selected, invokes the Codex handoff in
`docs/visual-assets/AGENT_PROMPTS.md` § E if native image generation is unavailable, keeps the
complete surfaced assembly visible in Material Preview/Rendered shading when a non-conflicting
Blender MCP session is available, and produces exact-source evidence. Clay, headless builds, and
beauty renders may diagnose; none alone closes G4 or grants acceptance.

---

## Master campaign (Top-50 wonder)

For a **full slice or multi-asset campaign**, use the campaign prompt so shared scope, ownership,
evidence, integration, and coherent exit outcomes travel together.

Copy the fenced goal from:

**`design/graphics-sprints/TOP50_WONDER_BUILD_PLAN.md` §9.1** (campaign) or **§9.2** (single hero)

Fill: `<SLICE_LETTER>`, `<ASSET_OR_PACK_IDS>`, `<A|B|C|D|E|…>`.

That goal enforces current full-view critique, exporter and in-game proof, independent review, and continuation
files instead of silent completion claims.

---

## Integrator (run daily or after handoffs)

```
Read design/graphics-sprints/00_ORCHESTRATION.md and INTEGRATION_GATE.md fully.

You are the INTEGRATOR — not Blender, not runtime wiring.

Process all YAML files in design/graphics-sprints/handoffs/ that are not yet integrated.

For each asset:
1. Verify the evidence contains current critique, representative renders, and player-route proof.
2. Run finalize/build/release per INTEGRATION_GATE.md.
3. Update assets/ASSET_STATUS.json lifecycle to RELEASE_BUILT.
4. Run all integration checks; stop on first failure.
5. Move handoff to handoffs/integrated/ with notes.

Forbidden: Blender MCP, partsLibrary.js, vfx.js, editing test/*.expected.json.

Print a concise summary: IDs processed, checks, and Thread C actions pending.
```

---

## Thread A — Kit Quality

```
Read in order:
1. AGENTS.md §3 + §10
2. design/graphics-sprints/README.md
3. design/graphics-sprints/00_ORCHESTRATION.md
4. design/graphics-sprints/THREAD_A_KIT_QUALITY.md
5. assets/ships/AGENTS.md
6. docs/visual-assets/README.md + docs/visual-assets/VISUAL_ASSET_PRODUCTION_STANDARD.md
7. .grok/skills/spaceface-blender-material-truth/SKILL.md
8. design/graphics-sprints/QUALITY_RITUAL.md
9. design/graphics-sprints/BLENDER_EXCLUSIVE_LOCK.md
10. .grok/skills/spaceface-blender-pipeline/SKILL.md
11. needed-assets.md §A — story roles for <ASSET_IDS>
12. FULL_GRAPHICS_REVAMP_GOAL.md §2–3

You are THREAD A — Kit Quality only.

Sprint batch: <SPRINT_BATCH>   (example: A-engines)
Asset IDs: <ASSET_IDS>         (example: engine_resonator, engine_vector)

Before any Blender MCP call, inspect `assets/ships/blender.LOCK` together with live Blender/export
processes, recent writes, and current agent ownership. Coordinate a live overlapping owner or choose
non-overlapping work. If no active owner exists, clear/replace stale residue safely and record thread-A
as the current writer.

For EACH asset ID:
- Use screenshot-driven critique until the modeling, surfacing, life, and role-specific result withstand
  independent visual review.
- Capture fully framed neutral and lit game-camera views, useful detail views, and the current player route.
- Write the material deficiencies that matter; choose techniques because they address those gaps.
- Save renders to assets/ships/parts/revamp-evidence/<id>/renders/
- Keep `deficiency.md` current; an iteration ledger is optional chronology, not an acceptance counter.
- Export via spaceface_export.py / finalize_part.mjs — zero assertion failures.

CONCURRENT OWNERSHIP: while those threads are active, do not edit src/render/**, src/data/**,
parts_manifest.json, release outputs, or Thread B/C/D/E work. Never use destructive git reset/stash/checkout.

When batch complete: release blender.LOCK, write handoff YAML to design/graphics-sprints/handoffs/ per HANDOFF_TEMPLATE.md.

Do not claim done without current review notes, screenshot paths, player-route proof, and exporter evidence.

Print a concise summary per asset: review outcome, exporter pass/fail, evidence paths, and handoff path.
```

---

## Thread B — World Identity

```
Read in order:
1. AGENTS.md §3 + §10
2. design/graphics-sprints/README.md
3. design/graphics-sprints/00_ORCHESTRATION.md
4. design/graphics-sprints/THREAD_B_WORLD_IDENTITY.md
5. design/graphics-sprints/QUALITY_RITUAL.md
6. design/graphics-sprints/BLENDER_EXCLUSIVE_LOCK.md
7. design/world-identity/PIPELINE.md
8. design/revamp/BP-08_VISUAL_ASSET_SPEC.md §2 — silhouette target for <ASSET_IDS>
9. needed-assets.md §B + assets/QUEUE.md
10. assets/ships/AGENTS.md + docs/visual-assets/README.md +
    docs/visual-assets/VISUAL_ASSET_PRODUCTION_STANDARD.md
11. .grok/skills/spaceface-blender-material-truth/SKILL.md for the mandatory preflight and any
    substantive Tier A/B form/surfacing work

You are THREAD B — World Identity only.

Sprint batch: <SPRINT_BATCH>   (example: B-faction-station-meridian)
Asset IDs: <ASSET_IDS>         (example: place_station_meridian_exchange)

Verify whether `assets/ships/blender.LOCK` identifies a live thread-A/thread-E process. If the work
really overlaps, coordinate the handoff or continue useful non-overlapping concept/data work; do not
reduce the task to a report merely because a marker exists. When the authoring lane is genuinely free,
record thread-B as the current Blender writer.

Per place ID:
- Iterate until independent review supports the intended silhouette, scale, material response, and identity.
- Load concept from assets/concept/index.json as REF_<id> in Blender.
- Follow world-identity PIPELINE bootstrap → promote.
- Capture fully framed neutral/lit views and a current player-route shot; faction silhouette must read at the
  real game camera.
- finalize_part.mjs + check:place-concept-resemblance when promoted.

CONCURRENT OWNERSHIP: while those threads are active, leave kit parts to A, wholeships to E, and
partsLibrary.js, sectorAnchors.js, vfx.js, and manifest integration to the designated integrator.

Handoff YAML must list thread_c_actions: PLACE_FILES + sectorAnchors entries needed.

Print a concise summary: review outcome, relevant resemblance evidence, handoff path, and Thread C wiring list.
```

---

## Thread C — Backend Wiring

```
Read in order:
1. AGENTS.md §3 + §5 + §10
2. design/graphics-sprints/00_ORCHESTRATION.md
3. design/graphics-sprints/THREAD_C_BACKEND_WIRING.md
4. design/graphics-sprints/HANDOFF_TEMPLATE.md
5. assets/AGENTS.md §3 three registries
6. design/world-identity/PIPELINE.md §7
7. All handoffs in design/graphics-sprints/handoffs/ with lifecycle >= RELEASE_BUILT

You are THREAD C — Backend Wiring only.

Sprint batch: <SPRINT_BATCH>   (example: C-sector-helios-places)
Asset IDs: <ASSET_IDS>         (from integrator-approved handoffs only)

Never wire an ID below `RELEASE_BUILT`. If a handoff is missing, inspect the current asset evidence and
release state, then complete or recover the required handoff before wiring; do not substitute a
report-only response for the integration prerequisite.

Per ID, make one coherent wiring change, run the relevant checks, and diagnose/rerun any failures:
- PART_LIBRARY_CONTRACT.slots.*
- Role maps: HULL_FILE_BY_DEF_ID, engineRecordFor, weaponRecordFor, PLACE_FILES
- sectorAnchors.js for stations/landmarks/gates
- Update assets/ASSET_STATUS.json wired[] and lifecycle

Required checks (all green before done):
npm run check:assets:live
npm run check:asset-reachability
node scripts/check-parts-manifest.mjs
npm run check:station-archetype-wiring  (if places)
npm run check:sector-geography         (if anchors)

CONCURRENT OWNERSHIP: do not enter active asset/Blender/VFX/input lanes. Never edit
test/*.expected.json to manufacture a pass or hand-edit generated release output.

Print a concise summary: files touched, checks output, and lifecycle per ID.
```

---

## Thread D — Presentation Code

```
Read in order:
1. AGENTS.md §3 + §5 + §10
2. design/graphics-sprints/README.md
3. design/graphics-sprints/00_ORCHESTRATION.md
4. design/graphics-sprints/THREAD_D_PRESENTATION_CODE.md
5. design/spec3/SPEC3-F8-graphics-visuals.md
6. src/data/combatDefs.js WEAPON_CUE_TABLES

You are THREAD D — Presentation Code only.

Sprint batch: <SPRINT_BATCH>   (example: D-projectile-trails)
Scope: <ONE vertical from THREAD_D doc — e.g. projectile trail wisps per weapon class>

Run the relevant checks after the coherent change; diagnose and rerun failures:
node scripts/check-sg08-render-vfx.mjs
npm run check:juce-contract
npm run check:vfx-sleep
npm run check:visual-stability  (if visible change)

If visual: save .devshots/thread-D/<sprint>/wide.png and close.png.

CONCURRENT OWNERSHIP: do not enter active asset/Blender/parts-library/manifest/input lanes. Never
edit test/*.expected.json to manufacture a pass.

No silent quality reduction. Math.random() only in vfx/render cosmetic paths.

Print a concise summary: behavior change, checks, and devshot paths.
```

---

## Thread E — Wholeship Repair

```
Read in order:
1. AGENTS.md §3 + §10
2. design/graphics-sprints/README.md
3. design/graphics-sprints/00_ORCHESTRATION.md
4. design/graphics-sprints/THREAD_E_WHOLESHIP_REPAIR.md
5. design/graphics-sprints/QUALITY_RITUAL.md
6. design/graphics-sprints/BLENDER_EXCLUSIVE_LOCK.md
7. design/spec3/SPEC3-F9-asset-pipeline.md SPEC3-37 step 2
8. assets/AGENTS.md §2.1 blocked wholeships
9. FULL_GRAPHICS_REVAMP_GOAL.md Batch 5
10. assets/ships/AGENTS.md + docs/visual-assets/README.md +
    docs/visual-assets/VISUAL_ASSET_PRODUCTION_STANDARD.md
11. .grok/skills/spaceface-blender-material-truth/SKILL.md for the mandatory preflight and any
    substantive Tier A/B form/surfacing work

You are THREAD E — Wholeship Repair only.

Sprint batch: <SPRINT_BATCH>   (example: E-kestrel)
Asset ID: <ONE OF wholeship_kestrel | wholeship_pelican | wholeship_wasp>

Verify the live Blender/source-GLB owner before authoring. Thread E and an actively overlapping Thread A
must not write concurrently; coordinate an explicit handoff, then record Thread E as the current writer.

Goal: credible complete hull body, full current `spacefaceAsset` contract, required maps, and intentional edge
treatment. The live exporter/checker—not this prompt—owns exact thresholds.

Use `QUALITY_RITUAL.md` until the full ship passes independent visual review at the real player camera;
capture representative neutral, lit, detail, and player-route evidence.

CONCURRENT OWNERSHIP: while A/C are active, leave their kit and runtime-wiring files untouched.
Do not claim the asset route is ready before the live asset checks and player-route evidence pass.

Handoff only when exporter + hull audit green. Integrator clears manifest blocked status.

Print a concise summary: contract/body evidence, visual review result, check outputs, and handoff path.
```

---

## Suggested first sprint batches (director)

| Thread | SPRINT_BATCH | ASSET_IDS |
|--------|--------------|-----------|
| A | A-engines-remaining | engine_resonator, engine_vector, engine_plasma_ring |
| B | B-station-meridian | place_station_meridian_exchange (after concept; Blender when lock free) |
| C | C-wire-engines | engine_* from latest integrated handoff |
| D | D-projectile-trails | (vertical — no asset IDs) |
| E | E-kestrel | wholeship_kestrel (dedicated week — pauses A) |
