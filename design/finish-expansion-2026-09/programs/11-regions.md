# SFQ-P11 — Regions, routes and places with a physical identity

Players remember places by how they fly, work and change—not just their skybox color.

**Disposition:** supporting source program, not an independently active queue. **Milestone band:** 3. **Existing owners to search:** PQ-153 / PQ-154 / world-identity / world-site owners.

## Baseline and uncertainty

The game already has sectors, lanes, authored POIs and an encounter director. Regional proposals below enrich selected existing locations; new region counts are not a release requirement.

Sources: [S01](../audit/SOURCES.md#s01), [S08](../audit/SOURCES.md#s08), [S15](../audit/SOURCES.md#s15), [S17](../audit/SOURCES.md#s17). Source pins do not establish current performance or visual quality.

## Candidate owner paths

- `src/data/sectors.js`
- `src/data/sectorZones.js`
- `src/data/sectorAnchors.js`
- `src/systems/world.js`
- `src/systems/travelLanes.js`
- `src/systems/encounterDirector.js`

These are owner neighborhoods; some are directly inspected and others are routed/inferred from repository maps or prior source context. Resolve the exact live selected function/file before activation. Do not create a missing path just to conform to a plan.

## Build-plan candidates

| Local ID | Work | Player outcome |
| --- | --- | --- |
| [SFQ-B101](../builds/SFQ-B101.md) | Give six existing regions distinct flying questions | Each chosen region introduces a recognizable geometry, work pattern and risk. |
| [SFQ-B102](../builds/SFQ-B102.md) | Make approaches compose the scene | A station or landmark is legible before the player reaches its service radius. |
| [SFQ-B103](../builds/SFQ-B103.md) | Make travel contain optional action | Routes offer observable opportunities without constant interruption. |
| [SFQ-B104](../builds/SFQ-B104.md) | Treat wreck fields as topology | Persistent wreckage creates cover, anchor choices and evidence. |
| [SFQ-B105](../builds/SFQ-B105.md) | Make local maps describe playable space | Map landmarks, hazard extents and actionable contacts agree with the world. |
| [SFQ-B106](../builds/SFQ-B106.md) | Preserve safe escape topology | New gates, quarantines or moving hazards cannot silently imprison a save. |
| [SFQ-B107](../builds/SFQ-B107.md) | Stage ordinary life before catastrophe | A region establishes work and relationships before alien or combat transformation. |
| [SFQ-B108](../builds/SFQ-B108.md) | Make the sky support orientation | Distant landmarks guide travel without competing with near action. |
| [SFQ-B109](../builds/SFQ-B109.md) | Give optional discoveries useful returns | Exploration earns routes, knowledge or tools that matter elsewhere. |
| [SFQ-B110](../builds/SFQ-B110.md) | Close the regional content set | Each retained region supports one complete local loop and a reason to revisit. |

## Directed INFERENCE candidates

| Local ID | Bounded change | Done when |
| --- | --- | --- |
| [SFQ-I041](../inference/SFQ-I041.md) | Map marker uses discovered position | Discovery updates it once and a moved object remains correctly represented. |
| [SFQ-I042](../inference/SFQ-I042.md) | Landmark has a quiet approach | The landmark remains continuous over the tested approach. |
| [SFQ-I043](../inference/SFQ-I043.md) | Route refusal identifies a remedy | The player sees an actionable remedy without a spoiler. |
| [SFQ-I044](../inference/SFQ-I044.md) | Wreck identity survives revisit | One wreck returns once, not as both old and new salvage. |

## Playable scenes

- [M12 — Quiet passage](../missions/M12.md): OPTIONAL
- [M15 — Shortage at the gate](../missions/M15.md): SELECTED
- [M16 — Build your own escape](../missions/M16.md): OPTIONAL
- [M18 — The honest shortcut](../missions/M18.md): OPTIONAL
- [M24 — Move the nursery, not the animals](../missions/M24.md): SELECTED ALIEN
- [M30 — The clean cylinder](../missions/M30.md): SELECTED MACHINE/ECOLOGY
- [M35 — The route that closes ahead](../missions/M35.md): OPTIONAL LATE CAMPAIGN / no required new ending

## Required working method

[Admit into current owners](../integration/01_ADMISSION_AND_CROSSWALK.md), then use the [build-worker loop](../workflows/03_BUILD_WORKER.md) and [independent review](../workflows/08_INDEPENDENT_REVIEW.md). Uncertain design belongs in a [strong-agent campaign](../workflows/02_STRONG_AGENT_DESIGN.md), not a weak worker’s imagination.

Each selected feature needs real input, authoritative behavior, complete presentation and persistence. It is legal to finish this program’s useful core while cutting/defering optional proposals. The full candidate count is not a production quota.
