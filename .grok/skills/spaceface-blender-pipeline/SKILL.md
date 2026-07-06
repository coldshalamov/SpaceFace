---
name: spaceface-blender-pipeline
description: >
  SpaceFace hard-surface Blender authoring pipeline — phase-gated mesh work, baked AO/roughness,
  chamfered edges, material roles, and spaceface_export.py validation through release checks.
  Use when authoring or repairing ship parts, hulls, props, stations, or wholeships for SpaceFace;
  when graphics look like flat gray N64 slop; when agents need Destiny-tier bake sets not Three.js
  metalness sliders; when briefing Blender MCP work; or when the user runs /spaceface-blender-pipeline.
  Optional image-gen only for concept refs, trim sheets, and mask plates — never as a substitute for
  mesh-specific bakes. Rejects product-polish, Meshy image-to-3D, and generic blender-skills repos.
---

# SpaceFace Blender Pipeline (Orchestrator)

**This is not "build a basic model then add a bit more".**

These three skills exist to **force** professional-grade hard-surface spaceship work in Blender that can survive comparison to the provided reference images (#2 Eve Online, #3, #4) and not get laughed off a 2026 3D art forum or Reddit.

The old incremental "Tier 1 = Star Fox 64 baseline, add polygons later" mindset produced the current low-quality output. That stops now.

## The Three Professional Passes (reframed)

| Pass | Focus | Skill file | Goal vs your references |
|------|-------|------------|-------------------------|
| **Modeling Pass** | Establish the 3D form using full advanced Blender modeling power. Screenshot + iterate rigorously against pro refs until the *base geometry* holds professional quality in clay. | `spaceface-blender-blockout/SKILL.md` | Stop producing basic readable fighters. The output of this pass alone must already look substantially closer to the pro ships in form and execution. |
| **Surfacing Pass** | All advanced "on top of the polygons" work: skins, textures, layers, node-based effects, filters, wear systems, multi-material complexity. | `spaceface-blender-hardsurface/SKILL.md` | The rich material response, depth, and detail you see in #4 and Eve ships. |
| **Life & Polish Pass** | Making it alive: thrusters, guns, moving/animated parts, secondary details, advanced finishing touches, integration. | `spaceface-blender-surface-pass/SKILL.md` | The "feels real and detailed" quality beyond static mesh. |

The specific images you provided earlier illustrate the gap. For day-to-day use of these skills, rely on the detailed technique lists in `references/professional-techniques.md`, project concept/bible art, and the rigorous iteration protocol. The goal is always professional craft on whatever asset is needed.

## Core Philosophy this skillset must enforce

- Use **far more than 10% of Blender**. You will be required to demonstrate specific advanced techniques from modeling, modifiers, nodes, sculpt, UV, bake, texturing, animation, and compositor.
- **Screenshot-driven iteration is mandatory**. Model → set up proper cameras → render clean turntables/orthos → load pro reference images as planes or compare directly → create detailed deficiency list (minimum 8-10 specific failures against pro standards) → apply the missing professional techniques → repeat. Do not "call it good" after one pass.
- Acceptance threshold is professional, not "good enough for a game". If a 16-year-old on Reddit or ArtStation would be embarrassed by it, it fails.
- No "2-3 colors per ship". Full material layering, variation, and effects.
- The goal of Pass 1 is *professional form*, not "low poly starter". Budgets are respected by smart topology and baking, not by staying low-detail.

## Execution order for any hero asset

1. **Modeling Pass** (blockout skill) — iterate until the clay model would pass pro scrutiny.
2. **Surfacing Pass** (hardsurface skill) — layers, effects, textures on top.
3. **Life & Polish Pass** (surface-pass skill) — animation, secondary life, finishing.

Only after all three + exporter + checks do you consider it done.

Distant props may use abbreviated versions, but never for player ship or key landmarks.

## What this skill is NOT (deduplicated reject list)

Do **not** install, cite, or follow these — they conflict with SpaceFace or optimize for the wrong layer:

| Source | Why rejected |
|---|---|
| `kevinbadi/blender-skills` | E-commerce/product polish; strips normal/roughness; Meshy image-to-3D; standalone Three.js toy viewer |
| Meshy / image-to-3D / single-photo-to-mesh | No bake control, no chamfer law, no `spacefaceAsset` contract |
| `product-polish` workflows that remove normal/roughness maps | Breaks `assetLoader` ORM contract |
| Three.js `metalness`/`roughness` slider fixes in `src/render/**` | Wrong layer — fix the GLB |
| Relaxing `spaceface_export.py` assertions to ship broken assets | Repair the asset; contract is locked (SPEC3-37) |
| Wiring `assets/concept/*.jpg` or `wholeships/*.glb` directly into runtime | Reference/blocked; see `assets/AGENTS.md` |

**Graphics lane ownership:** if `assets/ships/release.__lock/` or `release.__building/` exists, do not edit `assets/**` or `src/render/**` unless the user redirects.

---

## Read first (mandatory, in order)

1. `assets/AGENTS.md` — ship visual stack, 3 registries, blocked wholeships
2. `tools/blender/spaceface_export.py` — executable contract (budgets, maps, chamfer, hull body)
3. `design/spec3/SPEC3-F9-asset-pipeline.md` — SPEC3-37 style law + SPEC3-38 image-gen lane
4. `assets/QUEUE.md` — what is queued; pick a row before starting unscoped work
5. `assets/concept/index.json` + `assets/concept/AGENTS.md` — mood refs for places/hulls (REFERENCE only)

**Quality bar in-repo:** `src/render/ships/kestrelHero.js` (code-native hero) — match its *readability at game scale*, not its implementation path.

---

## Tier Dispatch & Pro Gap Analysis

**Load the specific tier skill for the current phase.** The detailed "how" lives in the tier SKILL files.

- **Tier 1 (matches your Image #1 — the current baseline)**: `.grok/skills/spaceface-blender-blockout/SKILL.md`
- **Tier 2 (matches your Image #3 — dense industrial geometry)**: `.grok/skills/spaceface-blender-hardsurface/SKILL.md` (after Tier 1)
- **Tier 3 (matches your Image #4 — weathered pro baked surfaces; Eve ships' surface quality)**: `.grok/skills/spaceface-blender-surface-pass/SKILL.md` (after Tier 2)

**Execution order for hero / priority assets (do not skip):**
```
Tier 1 blockout → Tier 2 hardsurface (density) → Tier 3 surface-pass (bakes + wear) → checks
```

Distant props can stop at Tier 1.

## What the pro references (Images #2/#3/#4) require that current assets lack

Your Image #1 is readable game art. The leap is:

- **Image #3 level (Tier 2)**: 3-scale geometry (macro forms, meso panels/insets, micro kitbash/greeble) with consistent bevels, asymmetric purposeful construction, density ramp at joints. Not random noise or floating accessories.
- **Image #4 / Eve ship surfaces (Tier 3)**: Baked maps that sell the form. AO for real recess depth and contact. Roughness with edge wear (lighter), cavities (darker/matte), material zones. Normals for fine panel/bolt detail without extra geo. Localized weathering (rust, chips) that responds to light. Emissive strictly masked.

The skills must teach the craft that produces this (bevel craft, highpoly source quality, curvature-driven wear layers, clean bakes, modular cohesion) — not just checklists.

## Common rules & reads (before loading any tier skill)

1. `assets/AGENTS.md`
2. `tools/blender/spaceface_export.py` (the executable contract)
3. `design/spec3/SPEC3-F9-asset-pipeline.md`
4. `assets/QUEUE.md`
5. `assets/concept/index.json` + bible images (load as reference planes in Blender)

**Quality bar:** readability + surface response at game scale (see kestrelHero.js as floor).

## Background search result

Global/temp searches (the long-running task) found only unrelated blender-mcp and fixture SKILLs. All relevant SpaceFace authoring skills are the four in this workspace's `.grok/skills/` (pipeline + the three tiers). No other copies or competing versions.

## Blender MCP patterns

Use `execute_blender_code` for inspections, batch bevels/chamfers, cage setup, bake automation, and map-flat generation. Always inspect collections (LP/HP), modifiers, and materials first. Route export exclusively through `spaceface_export.py`.

## Image-gen (support, never replacement)

Only for early concepts, trim sheets, or mask plates. Import as reference. Bakes and geo detail always win.

## Acceptance

Artifacts on disk + exporter green + `check:assets:live` + in-game authored mesh screenshot. Beauty only for humans.

See the tier SKILLs for their specific artifacts and techniques. The rest of this file (legacy monolithic phases) is superseded by the tier skills.

(Obsolete monolithic phases removed — detailed per-tier work, artifacts, and pro craft techniques now live in the three tier skills. See dispatch section above.)

---

## Visual Assets Pass – Full Game Revamp Workflow

This orchestrator now supports a complete visual assets overhaul for the entire game to bring graphics to professional levels (3x+ improvement in fidelity, character, and polish while staying optimized).

**Scope:** All assets – main starting ship (hull_starter + supporting modular parts first), other ships, stations, guns, thrusters, asteroids/rocks, planets (authored details + procedural enhancements), props.

**Principles (professional 3D game design):**
- Per-asset character: futuristic/beautiful base form + context-appropriate weathering, paint, decals, wear (e.g. combat scars on fighters, industrial grime on haulers, corporate clean on trade hubs).
- Advanced techniques chosen case-by-case (see professional-techniques.md): heavy node layering for ships, GN for variation on asteroids, rigging for animated guns/thrusters, sculpt/bakes for planets.
- Optimized always: respect tri budgets (from manifest), use bakes/trim sheets/vertex color over dense geo, efficient UVs, LODs (exporter), shared materials, modular reuse. Never sacrifice perf for looks – professional balance.
- Diversity + cohesion: varied but unified PBR response, strong silhouettes at distance, rich detail up close, good lighting/material interaction.
- Iteration: model/surface/polish → render turntables in Blender (via MCP) → critique against style bible/concepts + techniques doc → fix with specific advanced methods → repeat until high bar.
- Validation: always through spaceface_export.py, checks (assets:live, asset-status, etc.), in-game screenshots + perf test.

**Process (three passes + overall):**
1. **Modeling Pass** (blockout skill): Professional base forms with advanced topology/modifiers for all new/improved assets.
2. **Surfacing Pass** (hardsurface skill): Layered materials, weathering, decals, effects using full node power, bakes.
3. **Life & Polish Pass** (surface-pass skill): Animation for moving parts, secondary details, final character polish.
4. Release build, checks, in-game validation.

Start with main starting ship (kestrel/starter hull + key parts like engines, fins, weapons). Then expand to other categories per QUEUE and needs.

Use the detailed techniques in `references/professional-techniques.md` (now includes asset-type specific + overall strategy).

Leverage Blender MCP for all work: inspect, precise edits, bakes, validation.

## Goal Prompt for Initiating Visual Assets Revamp with Blender MCP

Copy the following as the primary goal/brief when launching a subagent or direct MCP session for the revamp. Adapt per specific asset.

---

**GOAL PROMPT – Visual Assets Revamp (start with main starting ship, expand to full game)**

You are executing a full professional visual assets pass for SpaceFace using the Blender MCP and the spaceface-blender-pipeline skills.

Read first (in order):
- .grok/skills/spaceface-blender-pipeline/SKILL.md (orchestrator + visual assets pass section)
- .grok/skills/spaceface-blender-pipeline/references/professional-techniques.md (core techniques + asset-type guidance + MCP best practices)
- assets/AGENTS.md (pipeline rules, modular ship stack, release process, no touching locked dirs)
- design/spec3/SPEC3-F9-asset-pipeline.md (contract, style law, budgets, exporter)
- assets/ships/parts/parts_manifest.json (current tris, slots, hull_starter details)
- assets/bible/B-002_ship_materials.jpg and other B-*.jpg + assets/concept/ for style/character references (load as planes)
- assets/QUEUE.md for priorities

**Primary target:** Main starting ship (hull_starter.glb for player kestrel, plus supporting parts: engines, fins, greebles, weapons, cockpits used with it). Make it at least 3x more professional: strong futuristic beautiful silhouette with character (rugged industrial starter – weathered paint, stenciled decals/graffiti, battle wear appropriate to a beginner pilot ship), rich PBR surfacing, life in thrusters/guns.

Then systematically improve:
- Other ship hulls/parts for diversity (each faction/ship type gets distinct character via weathering/decals while cohesive).
- Stations (use existing .blends or create).
- Guns and thrusters (detailed small parts).
- Asteroids/rocks (authored hero or improved procedural bases).
- Planets (authored details or shader enhancements via authored maps if applicable).
- Any other authored GLBs.

**Process for each asset (follow the three passes strictly, using MCP):**
1. **Inspect current state** (MCP): Load relevant .glb or .blend if exists. Use execute_blender_code to inspect topology, materials, tris, UVs, modifiers. Render current state turntables (matcap + basic lit).
2. **Define character**: Futuristic + beautiful base. Add weathered/painted/decals appropriate to type/faction (use palettes from src/data/palettes.js, bible for material refs). Diverse across game.
3. **Modeling Pass**: Use advanced techniques from professional-techniques.md (modifier stacks, GN, sculpt, support loops, consistent bevels, etc.). Iterate: edit → render clean evaluation images → deficiency list naming specific techniques → fix. Respect budgets. Non-destructive where possible.
4. **Surfacing Pass**: Full advanced surfacing – node groups, layered materials, procedural+hand wear/decals, curvature/AO driven effects, trim sheets, proper bakes (AO/rough/normal/emissive), compositor polish. Multiple materials per roles. Iterate with lit renders.
5. **Life & Polish Pass**: Add thruster/gun details with character, any animation setup (armatures/shape keys for moving parts if it adds life), micro details, final integration. Lit/animated turntables.
6. **Validate & Export**: Use spaceface_export.py via MCP or CLI for metadata, maps, chamfers, budgets. Run npm checks. Fix any failures.
7. **Performance & Optimization**: Stay in tri budgets. Prefer bakes, efficient topology, shared assets, GN variation over raw geo. After updates, test in-game (check:assets:live, flight performance, visual stability).
8. **Documentation**: Update iteration logs, QUEUE if needed, release notes.

**Advanced techniques selection**: Case-by-case from professional-techniques.md (e.g. heavy GN for asteroid variation, node layering + decals for ships, rigging for guns). Always combine for character and perf.

**Quality bar**: Professional game asset level – strong readable silhouette at distance, interesting forms mid, rich materials/micro detail close-up. Weathered + decals where fits character. Optimized (no perf hit). Looks 3x+ better than current (futuristic, beautiful, cohesive yet diverse). Would pass modern game dev scrutiny.

**MCP usage**: Heavily use execute_blender_code for inspection, precise operations (apply modifiers correctly, set up bakes, validate), scene management. Load references as planes. Render via code if possible for consistency.

**Constraints (never violate)**:
- Follow exporter contract, material roles (Material_Hull etc.), ORM packing.
- Modular for ships (improve parts that slot in).
- Author in parts/ or appropriate, release via build.
- No heavy textures if trim/vertex/bake suffices.
- Coordinate with any .__lock__ dirs.
- Player main ship may involve both authored parts and coordination with kestrelHero.js.

**Deliverables per asset**:
- Improved source in authoring location.
- Validated GLB in parts/.
- Iteration log with before/after renders, technique usage, deficiencies fixed.
- Run full checks.
- In-game screenshots showing improvement (distance, close, different lighting/factions).
- For starter ship: make it the showcase.

Begin with the main starting ship. After it's significantly improved (characterful, professional, optimized), move to next priorities (other core hulls, key stations, weapons/thrusters).

Report progress with specific technique usage, renders, and check outputs. Use vision on your renders to self-critique against pro standards.

End goal: Game visuals brought up to a level where ships/stations/etc have distinct character, look futuristic/beautiful/weathered as appropriate, perform well, and feel like professional 3D game design.

---

Use this goal prompt to launch the revamp. The skills now lay out the professional workflows, techniques, and rigor needed.

## References (orchestrator level)

- `references/professional-techniques.md` (expanded with asset types + strategy)
- `references/quality-ladder.md`
- `references/technique-checklist.md`
- `references/map-flat-examples.md`
- The three pass SKILL.md files

Follow the three passes with full rigor for every asset. Choose and apply advanced techniques per case. Iterate until professional bar. Optimize by design. Give every asset character.

This directly addresses the need for a structured, high-quality visual assets overhaul using the Blender MCP.