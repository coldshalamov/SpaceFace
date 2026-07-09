# Goal Prompts — Copy Into Each Agent Thread

Paste **one** prompt below as the opening message for a new Cursor/Grok thread. Do not combine threads. Do not edit the forbidden paths list.

**Director:** replace `<SPRINT_BATCH>` and `<ASSET_IDS>` before paste.

---

## Master campaign (Top-50 wonder / anti-lazy)

For a **full slice or multi-asset campaign** that must not stop early, **do not use the thin prompts below alone**.

Copy the fenced goal from:

**`design/graphics-sprints/TOP50_WONDER_BUILD_PLAN.md` §9.1** (campaign) or **§9.2** (single hero)

Fill: `<SLICE_LETTER>`, `<ASSET_OR_PACK_IDS>`, `<A|B|C|D|E|…>`.

That goal enforces: 10–20× effort, 20 full-view iterations, ≥50% rebuild per iter, weighted rubric, exporter + in-game proof, continuation files instead of silent quit.

---

## Integrator (run daily or after handoffs)

```
Read design/graphics-sprints/00_ORCHESTRATION.md and INTEGRATION_GATE.md fully.

You are the INTEGRATOR — not Blender, not runtime wiring.

Process all YAML files in design/graphics-sprints/handoffs/ that are not yet integrated.

For each asset:
1. Verify evidence iteration_count meets QUALITY_RITUAL.md floor.
2. Run finalize/build/release per INTEGRATION_GATE.md.
3. Update assets/ASSET_STATUS.json lifecycle to RELEASE_BUILT.
4. Run all integration checks; stop on first failure.
5. Move handoff to handoffs/integrated/ with notes.

Forbidden: Blender MCP, partsLibrary.js, vfx.js, editing test/*.expected.json.

Print a 10-line summary: IDs processed, checks, Thread C actions pending.
```

---

## Thread A — Kit Quality

```
Read in order:
1. Agents.md §3 + §10
2. design/spec2/00_MASTER_TASTE.md
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
- Minimum 20 screenshot-driven iterations (QUALITY_RITUAL.md). Count every render→assess→fix cycle.
- Shot set every iteration: clay_34_full, clay_front, clay_side, lit_34_full, lit_close_detail (+ lit_nozzle for engines).
- If any shot crops the subject, redo at wider distance before counting the iteration.
- Write ≥5 deficiencies per iteration (≥8 for hero); name techniques from professional-techniques.md.
- Save renders to assets/ships/parts/revamp-evidence/<id>/renders/
- Update iteration_ledger.json each iter.
- Export via spaceface_export.py / finalize_part.mjs — zero assertion failures.

FORBIDDEN: src/render/**, src/data/**, parts_manifest.json, release/ manual edits, Thread B/C/D/E work, git checkout/reset/stash.

When batch complete: release blender.LOCK, write handoff YAML to design/graphics-sprints/handoffs/ per HANDOFF_TEMPLATE.md.

Do not claim done without iteration count and screenshot paths in handoff.

Print 10-line summary per asset: iter count, exporter pass/fail, handoff path.
```

---

## Thread B — World Identity

```
Read in order:
1. Agents.md §3 + §10
2. design/spec2/00_MASTER_TASTE.md
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
- Stations/landmarks: 20 iterations minimum. Small props: 10.
- Load concept from assets/concept/index.json as REF_<id> in Blender.
- Follow world-identity PIPELINE bootstrap → promote.
- Screenshot ritual: full shot set each iter; faction silhouette must read at clay_34_full.
- finalize_part.mjs + check:place-concept-resemblance when promoted.

FORBIDDEN: kit parts (Thread A), wholeships (Thread E), partsLibrary.js, sectorAnchors.js, vfx.js, parts_manifest edits (integrator).

Handoff YAML must list thread_c_actions: PLACE_FILES + sectorAnchors entries needed.

Print 10-line summary: iter count, IoU if run, handoff path, Thread C wiring list.
```

---

## Thread C — Backend Wiring

```
Read in order:
1. Agents.md §3 + §5 + §10
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

Per ID — 10 verification cycles (edit → check → fix):
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

Print 10-line summary: files touched, checks output, lifecycle per ID.
```

---

## Thread D — Presentation Code

```
Read in order:
1. Agents.md §3 + §5 + §10
2. design/spec2/00_MASTER_TASTE.md §3–4
3. design/graphics-sprints/00_ORCHESTRATION.md
4. design/graphics-sprints/THREAD_D_PRESENTATION_CODE.md
5. design/spec3/SPEC3-F8-graphics-visuals.md
6. src/data/combatDefs.js WEAPON_CUE_TABLES

You are THREAD D — Presentation Code only.

Sprint batch: <SPRINT_BATCH>   (example: D-projectile-trails)
Scope: <ONE vertical from THREAD_D doc — e.g. projectile trail wisps per weapon class>

10 verification cycles minimum:
node scripts/check-sg08-render-vfx.mjs
npm run check:juce-contract
npm run check:vfx-sleep
npm run check:visual-stability  (if visible change)

If visual: save .devshots/thread-D/<sprint>/wide.png and close.png.

FORBIDDEN: assets/**, Blender, partsLibrary.js, parts_manifest.json, test/*.expected.json, input.js.

No silent quality reduction. Math.random() only in vfx/render cosmetic paths.

Print 10-line summary: behavior change, checks, devshot paths.
```

---

## Thread E — Wholeship Repair

```
Read in order:
1. Agents.md §3 + §10
2. design/spec2/00_MASTER_TASTE.md
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

Goal: real Material_Hull body ≥800 tris, full spacefaceAsset contract, baked maps, chamfer law.

Minimum 20 screenshot iterations per QUALITY_RITUAL.md — full shot set each iter.

FORBIDDEN: other kit parts, WHOLE_SHIP_FILE_BY_DEF_ID wiring (Thread C later), partsLibrary edits, claiming unblocked before check:assets:live passes.

Handoff only when exporter + hull audit green. Integrator clears manifest blocked status.

Print 10-line summary: hull tris, iter count, check outputs, handoff path.
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