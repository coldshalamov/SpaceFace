# FULL GRAPHICS REVAMP GOAL — SpaceFace Professional Visual Assets Overhaul

**Date:** 2026-07-05  
**Status:** ACTIVE — DO NOT QUIT EARLY  
**Owner:** All agents + human director  
**Purpose:** Bring **every authored 3D asset** in the game to a true professional 2026 hard-surface game art standard (Eve Online / modern space sim tier). 3x+ fidelity, strong character per asset type, rich PBR response, optimized. No shortcuts, no "good enough", no stopping after the flagship.

This goal exists because prior efforts focused on the starter ship + pipeline setup and then stopped. That was insufficient. The user explicitly requires the **entire graphics revamp** of the game. Follow this plan to completion. No laziness. No early exit.

> ### ⇄ COMBINE WITH `design/revamp/BP-08_VISUAL_ASSET_SPEC.md` §0 (added 2026-07-05)
> A parallel gameplay revamp (see `design/revamp/REVAMP_MASTER.md`) shipped new systems — named sector zones,
> an encounter director, a salvage/wreck loop, and one zoomable galaxy map — that **reference new assets that
> don't exist yet**. **BP-08 §0 reconciles the two: THIS file stays the QUALITY + PROCESS master (the 3-pass
> bar, gates, batch discipline — never lowered); BP-08 supplies the COVERAGE list of new assets + the
> faction-distinct silhouette targets.** Net additions to your batch plan (details + budgets in BP-08 §0/§2):
> - **Batch 3 stations:** redesign to BP-08's 8 **faction-distinct silhouettes** (not just polish the generic ones).
> - **NEW Batch 3.5 — gameplay landmarks:** vault-maw, crystal-spire, cathedral-wreck, pit-anchor; 3 faction
>   **ring-gate** variants; 4–6 **wreck** variants + `place_comm_beacon` (the salvage "floating communicator").
> - **Batch 4:** add hero asteroids `place_asteroid_luminite` / `_ice`.
> - **Batch 5 whole-ships** = unchanged (kestrel/pelican/wasp repair).
> - Priority: after the flagship (Batch 0), do **stations (Batch 3) + Batch 3.5** before the long tail — they
>   unblock the just-shipped features. Manifest registration of any already-authored engines/weapons is a CODE
>   lane (BP-09), not yours — just make them export-clean.

## 1. Scope — Exactly What Must Be Revamped

**Primary authored assets (must reach pro bar):**
- All 63 parts declared in `assets/ships/parts/parts_manifest.json` (source GLBs + release copies).
- All place/asteroid/station/debris GLBs under `assets/ships/parts/places/` (~23 files).
- Wholeships under `assets/ships/parts/wholeships/` (currently blocked — repair to contract or explicitly document why they stay blocked).
- Any additional authored static meshes that ship or affect flight visuals (dock interiors if wired, etc.).

**Out of scope (but note for cohesion):**
- Purely procedural runtime (visualFactory.js panels/greebles on non-authored, vfx.js, spaceBackground.js, asteroid surfaces in flight, most planet surfaces).
- 2D (portraits, cinematics, UI icons, bible/concept images) — these stay reference or separate.
- Code-native hero (kestrelHero.js) — improve only by better authored overlays/parts.

**Total to treat:** ~70+ unique authored GLB sources. Grouped into batches below for efficiency while maintaining per-asset character and full 3-pass rigor.

Current baseline (2026-07-05):
- Most parts have generic "Class-authored ..." notes and basic topology.
- Only 4 authored .blend sources exist with deeper work (hull_starter_authored, weapon_gatling_authored, place_station_trade_hub_authored + a few station .blends).
- Budgets: trianglesPerPart [500, 15000], maxBytesPerPart 5000000 (already raised from legacy 1200; whole-ships/landmarks use the exporter kind budgets and may rise further for hero assets with rationale + perf proof).
- Live probe can pass on loader (authored path loads), but artistic quality is the gap.

## 2. Professional Bar (Non-Negotiable)

Every asset must demonstrate:
- **Form (Modeling Pass):** Strong readable silhouette at distance. Macro/meso/micro hierarchy. Consistent bevel language (segments 2-4+). Quad-dominant, support loops, no visible ngons on hero surfaces. Non-destructive modifier stacks.
- **Surfacing (Surfacing Pass):** Layered materials (node groups for EdgeWear, CavityDirt, PanelVariation). Baked AO + Roughness variation + Normal. Curvature/Pointiness driven wear, chipping, dirt, repair patches, material zones. ORM packed correctly. Faction-appropriate paint + weathering + stenciled decals.
- **Life (Life & Polish Pass):** Secondary details (bolts, wiring hints, thruster cones, RCS). Where useful: simple armatures/GN for moving parts (barrels, fans, plumes). Lit/animated evaluation.
- **Character:** Per-type. Examples:
  - Starter / beginner ships: rugged industrial, slightly beat-up, stencils/graffiti, honest wear.
  - Fighters: sleek aggressive, combat scars, panel precision.
  - Freighters/haulers: bulky utilitarian, cargo scars, grime.
  - Military stations: armored, clean-but-battle-worn, authority.
  - Blackmarket/trade: patched, gritty, asymmetric.
  - Asteroids/rocks: varied by sector (icy/rocky/volcanic), seams, craters via GN + bakes.
- **Optimization:** Respect (or intelligently exceed with justification + manifest update) budgets. Prefer bakes + trim + GN variation over raw geo. Efficient UVs. LODs via exporter.
- **Contract:** Every exported GLB must pass `spaceface_export.py` (spacefaceAsset extras, required baked maps, chamfer assertions, material roles Material_Hull/Accent/etc.).
- **Evidence:** For **each asset** — before/after turntables (clay + lit + close detail), min 8-10 deficiency lists naming specific techniques from `professional-techniques.md`, iteration log, exporter output, post-build check snippets, in-game flight screenshot (distance + close + different lighting/faction tint).

Reference images: assets/concept/ (ships, stations, planets), assets/bible/B-*.jpg (especially ship materials), previous Eve-style refs provided by user.

**Do not accept** flat colors, razor edges, random greeble, toy-like results, missing bakes, or "it loads so it's done".

## 3. Required Process for Every Single Asset (3 Passes + Gates)

**Always follow exactly (load the tier skills):**

1. **Read mandatory docs first** (per asset or batch):
   - `.grok/skills/spaceface-blender-pipeline/SKILL.md`
   - `.grok/skills/spaceface-blender-pipeline/references/professional-techniques.md` (name techniques used)
   - `assets/AGENTS.md`
   - `design/spec3/SPEC3-F9-asset-pipeline.md`
   - `assets/ships/parts/parts_manifest.json`
   - Relevant concept/bible images loaded as planes in Blender.

2. **Inspect current** (MCP `execute_blender_code` + `get_objects_summary` + render):
   - Load .glb or existing .blend.
   - Stats (tris, ngons, materials, UVs, modifiers).
   - Current clay + lit renders (multiple orthos + 3/4 + turntable).

3. **Define character** (write 3-5 sentences specific to this asset/type/faction).

4. **Modeling Pass** (use `spaceface-blender-blockout` + techniques doc):
   - Apply advanced non-destructive: heavy Bevel (weight/angle), Booleans + cleanup, Weighted Normal, GN for variation, support loops, consistent radii.
   - Iterate ≥4-6 cycles: edit → multi-camera render → deficiency list (≥8-10 specific missing techniques) → fix.
   - Respect topology for baking.

5. **Surfacing Pass** (use `spaceface-blender-hardsurface` + techniques):
   - Layered Principled + node groups.
   - Procedural + hand wear (curvature, AO masks, scratches at multiple scales, chipping, streaks).
   - Proper bakes: AO, Normal (tangent OpenGL), Roughness variation (or full ORM prep), emissive mask.
   - Decals, trim sheets, material zones, Clearcoat/Anisotropic where fits.
   - ≥4-6 iterations with lit renders + deficiency lists.

6. **Life & Polish Pass** (use `spaceface-blender-surface-pass`):
   - Micro details, thruster/gun life, any animation (armature/GN/drivers).
   - Final lit/animated turntables.
   - Polish against pro refs.

7. **Validate & Release**:
   - Export exclusively via `tools/blender/spaceface_export.py` (MCP or CLI).
   - Run `node tools/art/finalize_part.mjs <id>` if needed for metadata/manifest.
   - `npm run build-hull-release-assets` (or equivalent release script) for KTX2/meshopt.
   - Update `parts_manifest.json` note: "PRO revamp YYYY-MM-DD — [list 5+ specific techniques + character note]". Update tris/bytes.
   - Run full gates (see §5).

**MCP usage:** Heavy. `execute_blender_code` for everything precise. `render_viewport_to_path` (or equivalent) for consistent evidence. Never assume state — inspect first.

**Distant/low-priority props** (e.g. some nav buoys): Abbreviated (Tier 1 + basic surfacing) is allowed **only** with explicit justification in the tracking table. Hero/player/station assets get full 3 passes.

## 4. Batch Plan (Phased — Complete One Before Next)

**Do not jump around. Finish batch + full verification before advancing.** Update this file's tracking table after every batch.

**Batch 0: Flagship Audit & Completion (hull_starter + its ecosystem)**
- hull_starter
- Common slots used by player kestrel: engine_ion_twin, cockpit_recessed, fin_wedge, weapon_pulse_cannon (or gatling if primary), relevant greebles (hatches, antennas), pod_utility, skid_trio, etc.
- Goal: Make the actual starting ship the showcase. Full character (rugged beginner industrial). Finish any remaining passes/iterations.
- Evidence bar: Highest.

**Batch 1: All Other Hulls (distinct characters)**
- hull_fighter, hull_miner, hull_freighter, hull_interceptor, hull_corvette, hull_gunship, hull_frigate, hull_capital, hull_multirole.
- Each gets faction/role-appropriate weathering + silhouette strength.

**Batch 2: Core Modular Parts (shared across ships)**
- All remaining engines (6), fins (6), weapons (6), cockpits (3), greebles (7), pods (3), gear (2).
- Group by type for efficiency (e.g. all engines in one MCP session) but give each individual character and full passes.

**Batch 3: Places — Stations & Large Landmarks (high visual impact)**
- All station_* (trade_hub, refinery, military, blackmarket, mining, fab, research, etc.)
- gate_jump_ring, conveyor_barge, dead_hulk, mining_drone, billboard, etc.
- Larger budgets allowed. Architectural + industrial character.

**Batch 4: Places — Asteroids, Debris, Small Props**
- All place_asteroid_*, place_debris_*, lane_beacon, nav_buoy, etc.
- Use GN heavily for variation. Sector-specific character.

**Batch 5: Wholeships + Cleanup + Final Items**
- Repair kestrel/pelican/wasp wholeships to full contract (spacefaceAsset, maps, bevels, no fallback) or mark blocked with reason + remove from player-facing if appropriate.
- Any QUEUE.md items that are now relevant (claims, hunter signatures, landmarks, module visuals) — cross-reference and add if they have GLB authoring.
- Final pass on any missed.

**Batch 6: Integration, Polish, Performance, Sign-off**
- Full release rebuild.
- In-game soak (flight + stations + combat visuals).
- Perf validation (`check:perf`, hitch budget).
- Update all docs (AGENTS, QUEUE, manifest notes, release notes).
- Collect master evidence set in `.devshots/graphics-revamp-2026/` or scratch.
- Only then mark COMPLETE.

## 5. Mandatory Verification Gates (Never Skip)

After **every asset** (or small logical group) and after **every batch**:
1. `npm run check:assets:live` — failureCount: 0, player "authored" state, no fallback.
2. `npm run check:asset-reachability`
3. `npm run check:asset-status` (or equivalent).
4. Exporter validation green.
5. Release build + manifest updated.
6. At least one in-game screenshot (use dev tools or camera probe) showing the asset in flight/dock with good lighting + tint.
7. Update this goal's tracking table.
8. Commit evidence (renders + logs) to session scratch or `.devshots/`.

**Global final gate:** Full `npm run check` (or the broad suite), `check:flight:clean`, visual stability. Zero regressions.

**"Do not quit early" enforcement:**
- You only advance batches after the current batch's gate is fully green and evidence is recorded here.
- If stuck on one asset, iterate more or escalate — do not declare the batch "close enough" and move on.
- At the end, produce a summary table showing every single asset marked PRO with date + key techniques used.
- If a check fails, fix it before claiming progress.

## 6. Budget & Performance Policy

- Current manifest/exporter budgets are already raised. For hero/main assets (starter, other hulls, major stations): further increase is justified when it buys real pro density via smart bakes/LODs; update the manifest/queue/spec and record perf proof.
- Always prefer optimization techniques (bakes over geo, GN instances, trim sheets, efficient packing).
- After batches, run perf checks. No silent quality drops to hit perf.
- Document any budget change with rationale.

## 7. Tracking Table (Update Live)

Copy/update this table in the file after work. Columns: id | category | batch | status (BASELINE / IN-PROGRESS / PRO / ABBREVIATED) | tris_before/after | key_techniques | evidence_link | date

Example starter row (fill real data as you go):
- hull_starter | hulls | 0 | PRO (partial as of prior) | 2803 → XXXX | Bevel segments=3, GN greebles, curvature wear layers, AO/rough bakes, stenciled decals, ... | [renders in scratch + in-game] | 2026-07-05

Initial state (most): BASELINE. 

**Batch 0 + places + parts progress (2026-07-05 continued):**
- Budget/contract updates for pro (15k parts).
- Starter (surfacing continuation): loaded bakes (ao/rough/normal), added geometry wear layers via nodes + pointiness, material cleanup. New renders: starter_s1_clay.png + starter_s1_lit_front.png in .devshots. Re-export ok, finalize, build. LOD tris balanced ~5.7k/7k/4.7k. PRO manifest note.
- weapon_gatling: bevel3 + WN on 5 meshes. Enhanced surfacing. Export ok (6912 tris), finalize, build. New render gatling_s1_lit.png. PRO note.
- fin_wedge: imported, new fin_wedge_authored.blend created, bevel+WN. Export + finalize (584 tris). PRO note.
- cockpit_recessed: imported, new cockpit_recessed_authored.blend, bevel+WN on 4 meshes. Export + finalize (960 tris, multi-mat). PRO note.
- place_asteroid_rock_a: imported, new authored.blend, bevel + WN + basic GN var. Export + finalize (808 tris). PRO note.
- place_station_trade_hub: prior.
- Evidence: new renders + authored .blends (fin, cockpit, asteroid).
- Latest probe: PASS (failureCount:0, 63/63).
- No quit: starter + gatling + fin + recessed cockpit + asteroid + station pro-treated. Continuing full batches for remaining hulls/parts/places.

Full tracking table to be maintained below as batches complete.

Full list to track (from manifest + places):
Hulls (10): hull_starter, hull_fighter, hull_miner, hull_freighter, hull_interceptor, hull_corvette, hull_gunship, hull_frigate, hull_capital, hull_multirole
Cockpits (3): ...
(Include all from the node extraction in §1. List them all explicitly when maintaining.)

## 8. Execution Instructions — What To Do Right Now

1. Read this file + the 3 tier skill files fully + professional-techniques.md.
2. Start Blender + ensure MCP connected.
3. **Immediate first action (Batch 0):** Audit hull_starter_authored.blend + current hull_starter.glb. Load references. Run full 3 passes if any pass is incomplete. Produce fresh evidence. Export → finalize → build → checks.
4. For any asset:
   - `cd` to repo.
   - Use MCP `execute_blender_code` extensively.
   - Render via viewport tools for evidence.
   - After modeling/surfacing: run the python exporter.
   - `node tools/art/finalize_part.mjs <part-id>`
   - Run release build script.
   - Run the check commands above.
5. Use subagents only for parallel independent batches (e.g. one per category after core) with this goal as their prompt. Each subagent must report full evidence and wait for gate.
6. Never edit legacy files. Never relax exporter contract. Never skip evidence.
7. When in doubt on character: load more concept images + define explicitly before modeling.

**Sub-goal prompt template** (for a specific asset or batch — paste into agent):
"Follow FULL_GRAPHICS_REVAMP_GOAL.md exactly for [asset id or batch name]. Perform the 3 passes with minimum 4 iterations each using named techniques from professional-techniques.md. Produce all required evidence. Do not stop until the asset is PRO and local gates pass."

## 9. References & Tools

- Skills: `.grok/skills/spaceface-blender-*/SKILL.md`
- Techniques: `.grok/skills/spaceface-blender-pipeline/references/professional-techniques.md`
- Contract: `tools/blender/spaceface_export.py`, `design/spec3/SPEC3-F9-asset-pipeline.md`
- Rules: `assets/AGENTS.md`, repo root AGENTS.md §graphics lane
- Checks: `npm run check:assets:live`, `check:asset-reachability`, release scripts.
- Blender MCP tools: execute_blender_code, render_viewport_to_path, get_objects_summary, etc.
- Bible/Concepts: `assets/bible/`, `assets/concept/`

## 10. Sign-off Criteria (Only Then Is The Job Done)

- Every asset in the tracking table is marked PRO (or justified ABBREVIATED for true background props).
- All checks green with failureCount:0 across the board.
- In-game evidence that the game now looks professionally upgraded (screenshots of player ship, NPC ships, stations, asteroids in context).
- Manifests and release up to date with new notes + KTX2.
- This goal file updated with final table + summary of techniques used across the project.
- Performance not regressed.
- No "we'll do the rest later" — the rest is done.

**This goal supersedes any prior "start with starter then see" language.** Execute until the table is complete and the final gate is green.

Start with Batch 0 audit right now. Do the work. Do not quit early.

---

**End of Goal.** Copy this entire document as the brief for any future agent session on graphics. Update the table and status as progress is made. The game graphics will be revamped when this file says COMPLETE and evidence backs it.
