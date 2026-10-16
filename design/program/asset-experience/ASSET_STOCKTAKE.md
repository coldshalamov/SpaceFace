# SpaceFace Asset Stocktake

This snapshot inventories every file under assets/ and the external runtime-support roots named by the release packager. It connects assets to existing canonical ownership, runtime maps, package readiness, and lightweight GLB structure. It is descriptive; current manifests and checks remain authoritative.

Generated: 2026-10-16T15:58:13.703Z.

## What is available

| Surface | Current result |
|---|---|
| Asset tree | 12,273 files; 5291.8 MiB |
| GLB metadata | 2,360 inspected; 2,360 JSON chunks parsed; 0 with missing external resources |
| Source parts | 197 tracked rows; 122 runtime-slot entries |
| Released asset rows | 354 source-to-release rows |
| Render-package routes | 353 pilots; 353 metadata and payload pairs present |
| Direct runtime refs | 963 assets; 963 retail-routable |
| External runtime roots | src/data/scenarios (12), vendor/addons/libs (9) |
| Classification coverage | 12,273 files labeled; 0 unclassified; 2,987 need a more specific route or lifecycle label |

### Existing checks on this snapshot

| Check | Result |
|---|---|
| check:asset-status | PASS — ok blocked asset tracked: wholeship_pelican (wholeships/pelican.glb) — Accessory-only export missing a Material_Hull body ok blocked asset tracked: wholeship_wasp (wholeships/wasp.glb) — Accessory-only export missing a Material_Hull body ok every runtimeSlots entry has a parts[] entry (197 parts tracked) Asset status OK: 197 parts tracked, 2 blocked, 0 reachable from runtime, 0 ambiguous. |
| check:asset-reachability | PASS — 963/963 routable, 0 issues |
| render-package coverage | PASS — skip assets/ships/release/kestrel/kestrel_reference.glb (no slot, and directory "kestrel_reference.glb" has no slot mapping) render-package coverage: all 353 release assets packaged |

The package and reachability checks answer file and routing questions. They do not establish visual acceptance. GLB inspection read only each GLB JSON chunk and never opened a renderer; every asset row therefore keeps visualAcceptance at not_assessed.

## Use, reuse and upgrade by family

Every file has a path family and a classification. needs_triage means no stronger live-route, release, source, reference, legacy or evidence label was supported by the inspected records; it does not mean unused. A copy-all bundle root also does not prove player-visible use.

| Family | Files and direct routes | First reuse | Upgrade when |
|---|---|---|---|
| assets/ships, assets/works, assets/models, assets/places, assets/characters, assets/wreck-court, assets/reactive-matter, assets/spectrum (5,154, 4200.8 MiB) | 808 mapped; 353 package routes; 1215 need triage | Compose a playable job from the existing hull, station, worksite, asset-bank and aftermath owners. Use registered motion banks for actor state. | Add or repair the smallest silhouette, collider, interaction anchor or readable state the live scene cannot supply. |
| assets/ui, assets/portraits, assets/brand, assets/intro, assets/store (1,290, 103.1 MiB) | 26 mapped; 0 package routes; 1264 need triage | Use ORRERY surfaces, portrait and faction registries, Codex plates, existing icons, fonts and screen backdrops. | Repair a real live-screen gap or stale derivative; keep controls usable when optional media is absent. |
| assets/audio (609, 48.1 MiB) | 141 mapped; 0 package routes; 468 need triage | Connect existing arrival, work, impact, comms, voice and music assets to the scene action and its aftermath. | Add only a missing causal transition or voice line; preserve speech priority and sound settings. |
| assets/background, assets/cinematics (43, 151.5 MiB) | 29 mapped; 0 package routes; 11 need triage | Reuse the sector sky, surface and intro media that already orient the player and establish the place. | Correct a visible scale, depth, repetition or story-state mismatch in its actual route. |
| assets/fx, assets/vfx (26, 0.3 MiB) | 0 mapped; 0 package routes; 26 need triage | Use the existing renderer and VFX owners for readable thrust, impact, fracture and environmental response. | Add the missing causal cue while preserving authored quality and reduced-motion behavior. |
| assets/third_party, assets/reference, assets/concept, assets/animation-references, assets/incubator (5,148, 788.1 MiB) | 0 mapped; 0 package routes; 0 need triage | Keep donor art, editable sources, release output and evidence attached to their current purpose and provenance. | Promote a specific needed component through its existing manifest and runtime owner. |
| assets root-level files (3, 0.0 MiB) | 0 mapped; 0 package routes; 3 need triage | Follow the exact row owner and runtime route before assigning a new use. | Give the file a named gameplay or presentation role before promoting or replacing it. |

The [Luna workflows for the complete player moment](../asset-experience-program/ASSET_EXPERIENCE_PROGRAM.md#8-luna-workflows-for-the-complete-player-moment) own scene selection, worker briefs, validation and dispatch. Use the inventory to find stock and owners; keep new work inside those existing lanes.

## Live scene dressing maps

The JSON preserves every ID, role, route and selection rule. Use these exact maps when they fit the scene.

### Everyday space kit

The live EVERYDAY_SPACE_KIT_LEGAL_MODELS map contains 46 IDs. It supplies cargo, service, law, mining, civic, and salvage dressing around stations, lanes, work sites, and wrecks. Sector and anchor filters choose the subset at runtime. For salvage scenery, place_power_skid_patched already routes to assets/ships/release/parts/places/place_power_skid_patched.glb.

### Wreck and aftermath

The live WRECK_AFTERMATH_MODELS map contains 45 release URLs: 38 live rows and 7 source-twin rows. It provides family-specific debris, fragments, torn ship components, and damaged hero hulls. Reuse authored-down place_aftermath_frag_grating_sheet_authored_down or place_aftermath_wreck_corvette_forward__stripped_heavy for routine field dressing; each row carries spawn eligibility and family shedding rules.

### Whole-ship candidates

The parts manifest has 12 integration_candidate whole ships. Consider them before authoring another fleet role, subject to normal Forge look review and runtime assignment. The blocked wholeship_pelican source has a pelican_production_v1 integration candidate; wholeship_wasp_production_v1 is accepted at assets/ships/release/parts/wholeships/wasp_production_v1.glb.

## Motion banks and baked GLB clips

Render-package metadata declares 145 motion-bank links to 88 unique banks; 88 referenced bank files are present and 0 local references are missing. The JSON lists package, rig, bank path, clips and bindings. Runtime loading and state-driven binding belong to src/render/authoredMotion.js and src/contracts/motionBank.js.

The GLB JSON chunks contain 3 files with baked animation and 18 clip occurrences across those files. GLB JSON structure only: mesh/material/animation/node/extras/extensions and external URI presence. The generic src/render/assetLoader.js route rejects baked clips; alternate render-package parsing and code-driven hooks need their own consumer checks. These counts do not measure gameplay motion or visual acceptance.

## Unready and unresolved assets

The parts manifest marks 2 source GLBs blocked: wholeship_pelican at assets/ships/parts/wholeships/pelican.glb and wholeship_wasp at assets/ships/parts/wholeships/wasp.glb. Both are accessory-only exports without a Material_Hull body. Do not route either as a complete ship. Other components may be donor material only after inspecting the actual parts and choosing a separate valid body.

The source lifecycle field has a token on 15 of 197 rows: integration_candidate 12, blocked 2, accepted 1. The other 182 rows have no lifecycle token. That field describes source-process status and does not override release rows, package routing, or gameplay maps; a missing token is not a failure verdict.

There are 1997 GLBs with no exact current-use or package URL in the inspected maps. They are candidates for reuse or dynamic-loader tracing, not confirmed orphans: ID-built paths and procedural selection are not ruled out by string search. Each JSON row carries known owners and selection status for targeted follow-up.

Classification counts: runtime 1,004, release 731, source 2,033, reference 4,939, evidence 579, legacy 0, needs_triage 2,987.

## Missing assets and interpretation

This snapshot found 0 missing files declared by canonical source, release, package, generic manifest, or GLB URI records. The inspected runtime file contracts currently identify no required missing asset. That does not imply every possible scene has all desired art; a missing art request needs a gameplay role before it can be called genuinely missing.

The index does not hash files. Byte reconciliation compares present files with manifest-declared sizes. A none_observed runtime route means no exact route was resolved; it never means unused. Technical readiness records presence and structure only. Visual acceptance needs the real game picture at the gameplay camera.

## Inventory file

ASSET_STOCKTAKE.json contains one row per file under assets/, plus every file under the external runtime roots vendor/addons/libs and src/data/scenarios. Each row records bytes, family, classification basis, canonical owners, explicit runtime references, current gameplay uses, distribution route, GLB metadata where applicable, and technical readiness. It also includes complete family and extension counts, package routes, motion-bank links, lifecycle rows, missing declarations, and the full 46-model and 45-model reuse maps.

