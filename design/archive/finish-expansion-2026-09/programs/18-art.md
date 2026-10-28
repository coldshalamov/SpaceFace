# SFQ-P18 — Authored models, spaces and animation at the gameplay camera

Every important object has a strong silhouette, coherent material and visible function in the real game.

**Disposition:** supporting source program, not an independently active queue. **Milestone band:** 2. **Existing owners to search:** Forge / GRAPHICS_PROGRAM / current release manifests; model briefs A01–A36.

## Baseline and uncertainty

Forge is the established flyable-hull pipeline; PR machine visuals use primitive compositions. That is a source fact, not a live aesthetic verdict. Judge new and existing assets together under current shipping lighting before deciding what must be replaced.

Sources: [S01](../audit/SOURCES.md#s01), [S21](../audit/SOURCES.md#s21), [S22](../audit/SOURCES.md#s22), [S25](../audit/SOURCES.md#s25). Source pins do not establish current performance or visual quality.

## Candidate owner paths

- `tools/blender/forge/FORGE.md`
- `tools/blender/forge/fleet.json`
- `src/render/partsLibrary.js`
- `src/render/visualFactory.js`
- `src/render/faunaVisuals.js`
- `src/render/machineVisuals.js`

These are owner neighborhoods; some are directly inspected and others are routed/inferred from repository maps or prior source context. Resolve the exact live selected function/file before activation. Do not create a missing path just to conform to a plan.

## Build-plan candidates

| Local ID | Work | Player outcome |
| --- | --- | --- |
| [SFQ-B171](../builds/SFQ-B171.md) | Audit silhouettes in a real mixed scene | The player distinguishes light, heavy, industrial and specialist objects at combat zoom. |
| [SFQ-B172](../builds/SFQ-B172.md) | Complete missing functional model parts | Engines, guns, clamps and moving parts visibly attach to solid bodies. |
| [SFQ-B173](../builds/SFQ-B173.md) | Build the mission workpiece kit | Cargo cages, flywheels, couplers and salvage pieces make mission actions visible. |
| [SFQ-B174](../builds/SFQ-B174.md) | Author a coherent infestation kit | Existing human structures can acquire biological occupation without bespoke full duplicates. |
| [SFQ-B175](../builds/SFQ-B175.md) | Make fauna animation express the drive | A creature's body visibly prepares, acts and recovers. |
| [SFQ-B176](../builds/SFQ-B176.md) | Give ancient machines functional geometry | Robots communicate their job through deployable instruments and exact motion. |
| [SFQ-B177](../builds/SFQ-B177.md) | Build landmarks from navigable composition | A site has a memorable silhouette and clear usable approach. |
| [SFQ-B178](../builds/SFQ-B178.md) | Model state changes that matter | Damage, repair, infestation and machine deployment create authored visible transitions. |
| [SFQ-B179](../builds/SFQ-B179.md) | Publish assets with complete runtime contracts | Source art becomes the exact released asset players receive. |
| [SFQ-B180](../builds/SFQ-B180.md) | Converge the art set by its weakest visible members | The scene looks like one intentional game at normal zoom. |

## Directed INFERENCE candidates

| Local ID | Bounded change | Done when |
| --- | --- | --- |
| [SFQ-I069](../inference/SFQ-I069.md) | Nozzle socket follows authored engine | Static, turning and boost views share a continuous nozzle origin. |
| [SFQ-I070](../inference/SFQ-I070.md) | One model loses a floating part | All inspected views show a mechanically supported part. |
| [SFQ-I071](../inference/SFQ-I071.md) | LOD preserves one gameplay feature | The interaction stays identifiable across the transition. |
| [SFQ-I072](../inference/SFQ-I072.md) | Prop collision matches its visible gap | The intended route is passable and solid walls still collide. |

## Playable scenes

Use a current ordinary route that exposes the stated player problem.

## Required working method

[Admit into current owners](../integration/01_ADMISSION_AND_CROSSWALK.md), then use the [build-worker loop](../workflows/03_BUILD_WORKER.md) and [independent review](../workflows/08_INDEPENDENT_REVIEW.md). Uncertain design belongs in a [strong-agent campaign](../workflows/02_STRONG_AGENT_DESIGN.md), not a weak worker’s imagination.

Each selected feature needs real input, authoritative behavior, complete presentation and persistence. It is legal to finish this program’s useful core while cutting/defering optional proposals. The full candidate count is not a production quota.
