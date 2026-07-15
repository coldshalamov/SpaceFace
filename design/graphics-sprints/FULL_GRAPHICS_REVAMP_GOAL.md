# Full Graphics Revamp — Coverage and Outcome Bar

> **ACTIVE COVERAGE AUTHORITY.** This file defines the visual surfaces that must ultimately receive a
> professional player-facing result and the evidence needed to accept them. `TOP50_WONDER_BUILD_PLAN.md`
> owns priority/order. `README.md` owns this folder's authority map and quality doctrine. Whole-program
> status lives in `design/program/`.

## Goal

Raise the complete authored visual set—and the runtime presentation needed to show it—to the quality expected
of a professional contemporary space game. The target is not a particular triangle count, texture size,
iteration count, Blender technique, or inherited color recipe. The target is a coherent, distinctive,
convincing game at its real camera, in motion, on the normal browser/Electron route.

Do not stop after improving the starter ship or after proving that files load. Geometry-only, clay-only, or
beauty-render-only evidence is incomplete. Equally, do not rebuild a sound asset merely to satisfy a process
quota: inspect the current result, identify its real gaps, and spend effort where it buys visible quality.

## Coverage

The program covers:

- player and NPC ship families, including production whole-ship routes and modular parts;
- cockpits, engines, weapons, fins, pods, gear, and role-bearing details visible in play;
- stations, gates, landmarks, wrecks, asteroids, debris, traffic, and sector dressing;
- materials, decals, damage/wear language, faction identity, lighting, VFX, animation/readiness, and scale;
- authored-asset routing, manifests, export/release outputs, fallbacks, LOD/HLOD, batching, instancing, culling,
  loading, and frame pacing;
- the BP-08 gameplay-driven additions: faction-distinct station cores, landmarks, ring-gate variants, wreck
  families, comm beacon, hero asteroids, and any later asset activated by the build program.

The inventory must be derived from the live manifest, runtime maps, asset catalog, BP-08, and
`design/program/02_REMAINING_WORK.md`; dated file counts in old evidence are not coverage truth.

## Professional outcome bar

Judge each asset or presentation pack in context. Relevant expectations include:

- an immediately readable silhouette and role at its actual screen size;
- intentional macro/meso/micro hierarchy with functional construction rather than primitive blocks or
  indiscriminate greeble noise;
- materials that respond convincingly in the live renderer, with disciplined emissives and shadow form;
- faction, sector, ownership, age, damage, maintenance, and story signals appropriate to that specific asset;
- believable scale, orientation, mounts, sockets, motion, docking, and interaction with nearby objects;
- a coherent scene whose lighting, background, VFX, UI, and audio-visual timing support the asset;
- no obvious fallback, missing body, floating accessory, framing, or normal/texture/export failure;
- stable performance achieved through algorithmic and content-pipeline optimization without quality cuts.

Modeling, surfacing, and life/polish are useful passes for complex assets, but apply them according to the
asset's needs. `professional-techniques.md`, procedural nodes, trim sheets, decals, texture paint, image tools,
geometry nodes, bakes, and hand modeling are options—not a universal mandatory recipe. Avoid making every
surface the same chipped-gray sci-fi metal.

## Contract and performance

The live exporter, manifest schema, asset loader, and release pipeline own exact technical requirements. Do
not copy numeric triangle, byte, or texture ceilings into this design document: those values drift and are
diagnostic alarms, not taste ceilings. When a high-value asset needs more resources, justify it with screen-
space value and measured runtime evidence, then update the owning contract intentionally.

Preserve coordinate conventions, material roles, provenance/licenses, required maps/metadata, LOD groups,
mount/socket/hook semantics, and the one-game-path rule. Prefer material reuse, mesh merging by animated role,
instancing, batching, cache reuse, streaming, culling, LOD/HLOD, and precompile/warm-up over reducing visible
quality.

## Build sequence

`TOP50_WONDER_BUILD_PLAN.md` is the order of attack. After its slices, continue through the long tail:

1. **Hero player experience:** starter family, propulsion/weapons, initial station/gate/sector composition,
   mining/combat VFX, and the normal undock route.
2. **Ship cast:** distinct combat, mining, hauling, patrol, pirate, capital, and faction families.
3. **World identity:** faction stations, gates, landmarks, wreck fields, hero resources, traffic, and sector
   lighting/dressing from BP-08 and world-identity plans.
4. **Retail surfaces:** maps, icons, portraits/cinematics where activated, station presentation, and cohesive
   UI-to-world composition without visor/cockpit HUD motifs.
5. **Scale and completion:** fleet/capital scenes, remaining manifest assets, future build-program additions,
   and performance/integration polish.

Work can run in parallel according to `00_ORCHESTRATION.md`, but Blender/source authoring and release
integration remain serialized by their ownership signals.

## Evidence and acceptance

For each logical asset or presentation pack:

1. inspect current source, export, runtime route, and prior evidence;
2. use `QUALITY_RITUAL.md` to capture representative neutral, lit, detail, motion, and player-route views;
3. record concrete deficiencies and make coherent repairs until meaningful gaps are resolved;
4. obtain independent visual review of the current evidence and live route;
5. run exporter/finalizer/release and the relevant asset, reachability, visual-stability, and performance checks;
6. record provenance and any contract/resource exception with rationale and measured proof;
7. hand off integration facts through `HANDOFF_TEMPLATE.md` and update the sole global status in
   `design/program/` when the slice is actually accepted.

Automated checks prove contracts, not taste. Screenshots prove appearance, not reachability or performance.
Acceptance requires both, plus independent judgment. Transcripts and counters are not proof.

## Definition of complete

The graphics revamp is complete only when the live inventory is covered, default gameplay consistently uses
the accepted authored results, all activated BP-08/build-program additions are integrated, representative
first-hour/combat/mining/station/fleet scenes meet the professional outcome bar, relevant checks are green,
and measured performance is stable without silent quality reductions.
