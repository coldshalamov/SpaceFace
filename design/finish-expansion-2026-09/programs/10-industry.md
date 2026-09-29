# SFQ-P10 — Mining, salvage and construction as tactile work

Work in the belt is an interesting physical activity, not a progress bar financing the interesting game.

**Disposition:** supporting source program, not an independently active queue. **Milestone band:** 3. **Existing owners to search:** PQ-145 / PQ-148 / Asteroid Works / current Third Shift owners.

## Baseline and uncertainty

Beam mining, fracture, deep-core drilling, claims and automation already exist. Current Works-screen defects have their own ledger; preserve its ownership and distinguish scheduler symptoms from gameplay changes.

Sources: [S08](../audit/SOURCES.md#s08), [S15](../audit/SOURCES.md#s15), [S22](../audit/SOURCES.md#s22). Source pins do not establish current performance or visual quality.

## Candidate owner paths

- `src/systems/mining.js`
- `src/systems/drill.js`
- `src/systems/asteroidSites.js`
- `src/systems/automation.js`
- `src/systems/salvage.js`
- `src/systems/cargo.js`

These are owner neighborhoods; some are directly inspected and others are routed/inferred from repository maps or prior source context. Resolve the exact live selected function/file before activation. Do not create a missing path just to conform to a plan.

## Build-plan candidates

| Local ID | Work | Player outcome |
| --- | --- | --- |
| [SFQ-B091](../builds/SFQ-B091.md) | Make each extraction phase readable | Survey, cut, fracture and collect communicate different physical jobs. |
| [SFQ-B092](../builds/SFQ-B092.md) | Design interesting rock geometry | Ore access depends on approach, shielding and safe chunk trajectories. |
| [SFQ-B093](../builds/SFQ-B093.md) | Make freight handling enjoyable | Loading and recovering chunks offer useful choices between precision, throughput and danger. |
| [SFQ-B094](../builds/SFQ-B094.md) | Turn salvage into structural decisions | Recovering one valuable component changes the wreck's stability or access. |
| [SFQ-B095](../builds/SFQ-B095.md) | Make repair a visible operation | Repair has a source, target, material cost and completion state. |
| [SFQ-B096](../builds/SFQ-B096.md) | Create a small construction kit | One player-owned site grows through useful modules rather than a building catalog. |
| [SFQ-B097](../builds/SFQ-B097.md) | Make industrial hazards manipulable | Vents, flywheels and charged cargo can help or hurt the player. |
| [SFQ-B098](../builds/SFQ-B098.md) | Develop industrial NPC competence | Workers complete recognizable jobs and respond sensibly to disruption. |
| [SFQ-B099](../builds/SFQ-B099.md) | Make industrial upgrades change technique | Better gear opens a distinct operation, not merely a shorter timer. |
| [SFQ-B100](../builds/SFQ-B100.md) | Finish one complete working district | A district can be visited, worked, disrupted and repaired across a session. |

## Directed INFERENCE candidates

| Local ID | Bounded change | Done when |
| --- | --- | --- |
| [SFQ-I037](../inference/SFQ-I037.md) | Beam contact follows the seam | Rotating or moving the rock does not leave the cut in space. |
| [SFQ-I038](../inference/SFQ-I038.md) | Rich-core cue has a termination | No permanent bright core remains after the underlying state ends. |
| [SFQ-I039](../inference/SFQ-I039.md) | Work-order label names the object | Player can see what the tug is trying to move. |
| [SFQ-I040](../inference/SFQ-I040.md) | Salvage preview distinguishes intact yield | The actual recovered result matches the preview condition. |

## Playable scenes

- [M02 — Breakaway freight](../missions/M02.md): SELECTED / ordinary-world teaching candidate
- [M03 — Warm cargo, narrow margin](../missions/M03.md): SELECTED
- [M04 — Counterweight shift](../missions/M04.md): SELECTED / extend Third Shift where overlapping
- [M09 — The salvage dispute](../missions/M09.md): OPTIONAL
- [M15 — Shortage at the gate](../missions/M15.md): SELECTED
- [M17 — The working battlefield](../missions/M17.md): OPTIONAL
- [M26 — The station that kept breathing](../missions/M26.md): OPTIONAL / enrich existing Breathing Dock
- [M28 — A place for the missing piece](../missions/M28.md): SELECTED MACHINE
- [M34 — The harvest somebody else owns](../missions/M34.md): OPTIONAL SET PIECE

## Required working method

[Admit into current owners](../integration/01_ADMISSION_AND_CROSSWALK.md), then use the [build-worker loop](../workflows/03_BUILD_WORKER.md) and [independent review](../workflows/08_INDEPENDENT_REVIEW.md). Uncertain design belongs in a [strong-agent campaign](../workflows/02_STRONG_AGENT_DESIGN.md), not a weak worker’s imagination.

Each selected feature needs real input, authoritative behavior, complete presentation and persistence. It is legal to finish this program’s useful core while cutting/defering optional proposals. The full candidate count is not a production quota.
