# Goal Prompts — Copy Into Each Agent Thread

Paste **one** prompt below as the opening message for a new Cursor/Grok thread. Do not combine threads. Do not edit the forbidden paths list.

**Director:** replace `<SPRINT_BATCH>` and `<ASSET_IDS>` before paste.

---

## Master campaign (Top-50 wonder)

For a **full slice or multi-asset campaign** that must not stop early, **do not use the thin prompts below alone**.

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
5. design/graphics-sprints/QUALITY_RITUAL.md
6. design/graphics-sprints/BLENDER_EXCLUSIVE_LOCK.md
7. .grok/skills/spaceface-blender-pipeline/SKILL.md
8. needed-assets.md §A — story roles for <ASSET_IDS>
9. FULL_GRAPHICS_REVAMP_GOAL.md §2–3

You are THREAD A — Kit Quality only.

Sprint batch: <SPRINT_BATCH>   (example: A-engines)
Asset IDs: <ASSET_IDS>         (example: engine_resonator, engine_vector)

Acquire assets/ships/blender.LOCK as thread-A before any Blender MCP call. If lock exists, STOP and report owner.

For EACH asset ID:
- Use screenshot-driven critique until the modeling, surfacing, life, and role-specific result withstand
  independent visual review.
- Capture fully framed neutral and lit game-camera views, useful detail views, and the current player route.
- Write the material deficiencies that matter; choose techniques because they address those gaps.
- Save renders to assets/ships/parts/revamp-evidence/<id>/renders/
- Keep `deficiency.md` current; an iteration ledger is optional chronology, not an acceptance counter.
- Export via spaceface_export.py / finalize_part.mjs — zero assertion failures.

FORBIDDEN: src/render/**, src/data/**, parts_manifest.json, release/ manual edits, Thread B/C/D/E work, git checkout/reset/stash.

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

You are THREAD B — World Identity only.

Sprint batch: <SPRINT_BATCH>   (example: B-faction-station-meridian)
Asset IDs: <ASSET_IDS>         (example: place_station_meridian_exchange)

If assets/ships/blender.LOCK is held by thread-A or thread-E, STOP — produce concept alignment + handoff PLAN only, no MCP.

When lock available: acquire as thread-B.

Per place ID:
- Iterate until independent review supports the intended silhouette, scale, material response, and identity.
- Load concept from assets/concept/index.json as REF_<id> in Blender.
- Follow world-identity PIPELINE bootstrap → promote.
- Capture fully framed neutral/lit views and a current player-route shot; faction silhouette must read at the
  real game camera.
- finalize_part.mjs + check:place-concept-resemblance when promoted.

FORBIDDEN: kit parts (Thread A), wholeships (Thread E), partsLibrary.js, sectorAnchors.js, vfx.js, parts_manifest edits (integrator).

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

NEVER wire an ID below RELEASE_BUILT. If handoff missing, STOP.

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

FORBIDDEN: assets/ships/parts/**, Blender MCP, vfx.js, test/*.expected.json, input.js, release build.

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

FORBIDDEN: assets/**, Blender, partsLibrary.js, parts_manifest.json, test/*.expected.json, input.js.

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

You are THREAD E — Wholeship Repair only.

Sprint batch: <SPRINT_BATCH>   (example: E-kestrel)
Asset ID: <ONE OF wholeship_kestrel | wholeship_pelican | wholeship_wasp>

Acquire blender.LOCK as thread-E. Thread A must be paused.

Goal: credible complete hull body, full current `spacefaceAsset` contract, required maps, and intentional edge
treatment. The live exporter/checker—not this prompt—owns exact thresholds.

Use `QUALITY_RITUAL.md` until the full ship passes independent visual review at the real player camera;
capture representative neutral, lit, detail, and player-route evidence.

FORBIDDEN: other kit parts, WHOLE_SHIP_FILE_BY_DEF_ID wiring (Thread C later), partsLibrary edits, claiming unblocked before check:assets:live passes.

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
