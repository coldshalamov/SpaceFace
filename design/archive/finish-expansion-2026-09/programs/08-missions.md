# SFQ-P08 — Mission craft and authored world-site interactions

Contracts are physical situations with multiple solutions, not interchangeable errands with different nouns.

**Disposition:** supporting source program, not an independently active queue. **Milestone band:** 3. **Existing owners to search:** PQ-152 / PQ-171 / current world-site kernel; mission briefs M01–M36.

## Baseline and uncertainty

The mission catalog already includes tow_recovery, demolition, rescue_under_fire, authored_set_piece, capital_boss and breakaway_recovery. The human opening raid and Third Shift must be extended or polished, not duplicated.

Sources: [S14](../audit/SOURCES.md#s14), [S16](../audit/SOURCES.md#s16), [S17](../audit/SOURCES.md#s17). Source pins do not establish current performance or visual quality.

## Candidate owner paths

- `src/data/missions.js`
- `src/systems/missions.js`
- `src/data/worldSiteManifests.js`
- `src/systems/worldSiteKernel.js`
- `src/systems/worldSiteRuntime.js`
- `src/data/encounters/015-opening-hauler-raid.js`

These are owner neighborhoods; some are directly inspected and others are routed/inferred from repository maps or prior source context. Resolve the exact live selected function/file before activation. Do not create a missing path just to conform to a plan.

## Build-plan candidates

| Local ID | Work | Player outcome |
| --- | --- | --- |
| [SFQ-B071](../builds/SFQ-B071.md) | Make authored interactions use actual objects | The mission names the body the player is towing, damaging, scanning or delivering. |
| [SFQ-B072](../builds/SFQ-B072.md) | Publish a mission clause grammar | Existing contract families can express optional constraints and distinct solutions without new type proliferation. |
| [SFQ-B073](../builds/SFQ-B073.md) | Build the industrial rescue trilogy | Three ordinary-world jobs teach tow, controlled throw and protecting fragile cargo. |
| [SFQ-B074](../builds/SFQ-B074.md) | Build the physical heist trilogy | Theft is a problem of trajectories, custody and escape. |
| [SFQ-B075](../builds/SFQ-B075.md) | Build the investigation trilogy | Information is earned through interventions and contradictory instruments. |
| [SFQ-B076](../builds/SFQ-B076.md) | Build ecology jobs around existing fauna | Alien missions require following, isolating, diverting or capturing rather than extermination. |
| [SFQ-B077](../builds/SFQ-B077.md) | Build machine jobs around work | Robots alter the situation through construction, logistics or classification. |
| [SFQ-B078](../builds/SFQ-B078.md) | Compose cross-system set pieces | Existing human, biological and machine rules collide without bespoke cinematic physics. |
| [SFQ-B079](../builds/SFQ-B079.md) | Stress mission edge paths | Abandonment, late arrival, sold cargo and destroyed targets do not produce softlocks. |
| [SFQ-B080](../builds/SFQ-B080.md) | Curate the finished mission set | Only distinct, fully built situations remain on the launch route. |

## Directed INFERENCE candidates

| Local ID | Bounded change | Done when |
| --- | --- | --- |
| [SFQ-I029](../inference/SFQ-I029.md) | Objective follows moved target | Towing the objective does not leave its marker behind. |
| [SFQ-I030](../inference/SFQ-I030.md) | Capacity checked before payment | The player cannot lose collateral for a load that never fit. |
| [SFQ-I031](../inference/SFQ-I031.md) | Physical finish does not pay twice | Repeated receipt/reload yields one payout. |
| [SFQ-I032](../inference/SFQ-I032.md) | Timeout leaves a meaningful object | Timeout does not erase valuable on-screen matter without explanation. |

## Playable scenes

- [M01 — The opening raid, made whole](../missions/M01.md): CORE / enrich existing, do not duplicate
- [M02 — Breakaway freight](../missions/M02.md): SELECTED / ordinary-world teaching candidate
- [M03 — Warm cargo, narrow margin](../missions/M03.md): SELECTED
- [M04 — Counterweight shift](../missions/M04.md): SELECTED / extend Third Shift where overlapping
- [M05 — A pod in the crossfire](../missions/M05.md): SELECTED
- [M06 — The moving manifest](../missions/M06.md): SELECTED
- [M07 — Cargo in the wake](../missions/M07.md): OPTIONAL / combine with an existing heist if similar
- [M08 — The impounded machine](../missions/M08.md): OPTIONAL
- [M09 — The salvage dispute](../missions/M09.md): OPTIONAL
- [M10 — False bloom](../missions/M10.md): SELECTED
- [M11 — The ship that flew this before](../missions/M11.md): SELECTED
- [M12 — Quiet passage](../missions/M12.md): OPTIONAL
- [M13 — Pay back the wake](../missions/M13.md): SELECTED
- [M14 — A rival remembers](../missions/M14.md): OPTIONAL
- [M15 — Shortage at the gate](../missions/M15.md): SELECTED
- [M16 — Build your own escape](../missions/M16.md): OPTIONAL
- [M17 — The working battlefield](../missions/M17.md): OPTIONAL
- [M18 — The honest shortcut](../missions/M18.md): OPTIONAL
- [M21 — Cinder Nursery: the physical return](../missions/M21.md): CORE ALIEN SLICE / enrich existing
- [M22 — The sample that must arrive alive](../missions/M22.md): SELECTED ALIEN
- [M23 — Glue, meet mass](../missions/M23.md): SELECTED XENOTECH / later slice
- [M24 — Move the nursery, not the animals](../missions/M24.md): SELECTED ALIEN
- [M25 — A fossil made of motion](../missions/M25.md): SELECTED RESEARCH
- [M26 — The station that kept breathing](../missions/M26.md): OPTIONAL / enrich existing Breathing Dock
- [M27 — Dead-letter delivery](../missions/M27.md): CORE MACHINE SLICE
- [M28 — A place for the missing piece](../missions/M28.md): SELECTED MACHINE
- [M29 — Two correct orders](../missions/M29.md): OPTIONAL MACHINE
- [M30 — The clean cylinder](../missions/M30.md): SELECTED MACHINE/ECOLOGY
- [M31 — The Mason moves the cover](../missions/M31.md): OPTIONAL SET PIECE
- [M32 — Two ships, one mistake](../missions/M32.md): OPTIONAL SET PIECE
- [M33 — At the edge of order](../missions/M33.md): OPTIONAL SET PIECE
- [M34 — The harvest somebody else owns](../missions/M34.md): OPTIONAL SET PIECE
- [M35 — The route that closes ahead](../missions/M35.md): OPTIONAL LATE CAMPAIGN / no required new ending
- [M36 — The universe keeps working](../missions/M36.md): CORE FINISH ROUTE / composite acceptance, not a new mission

## Required working method

[Admit into current owners](../integration/01_ADMISSION_AND_CROSSWALK.md), then use the [build-worker loop](../workflows/03_BUILD_WORKER.md) and [independent review](../workflows/08_INDEPENDENT_REVIEW.md). Uncertain design belongs in a [strong-agent campaign](../workflows/02_STRONG_AGENT_DESIGN.md), not a weak worker’s imagination.

Each selected feature needs real input, authoritative behavior, complete presentation and persistence. It is legal to finish this program’s useful core while cutting/defering optional proposals. The full candidate count is not a production quota.
