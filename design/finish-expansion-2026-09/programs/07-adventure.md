# SFQ-P07 — Adventure: first-hour trust and a complete campaign spine

Personal flight, an owned ship and persistent consequences carry the player from ordinary work into deeper strangeness.

**Disposition:** supporting source program, not an independently active queue. **Milestone band:** 3. **Existing owners to search:** PQ-032 / PQ-142 / PQ-155 / PQ-163 / PQ-178 / PQ-195.

## Baseline and uncertainty

The repo has a story spine, 47-A and authored physical set pieces. The live mission data declares seventeen types; the module map description saying ten is stale. Do not create another campaign from scratch.

Sources: [S02](../audit/SOURCES.md#s02), [S15](../audit/SOURCES.md#s15), [S16](../audit/SOURCES.md#s16). Source pins do not establish current performance or visual quality.

## Candidate owner paths

- `src/systems/onboarding.js`
- `src/systems/story.js`
- `src/data/narrative.js`
- `src/data/missions.js`
- `src/systems/missions.js`
- `src/systems/scenarioRuntime.js`

These are owner neighborhoods; some are directly inspected and others are routed/inferred from repository maps or prior source context. Resolve the exact live selected function/file before activation. Do not create a missing path just to conform to a plan.

## Build-plan candidates

| Local ID | Work | Player outcome |
| --- | --- | --- |
| [SFQ-B061](../builds/SFQ-B061.md) | Audit and complete the actual story spine | Existing story beats connect through playable actions rather than missing offers or unexplained jumps. |
| [SFQ-B062](../builds/SFQ-B062.md) | Put a real choice in the opening job | The first work contract can produce help, theft, collateral or refusal with visible consequences. |
| [SFQ-B063](../builds/SFQ-B063.md) | Teach by need and recovery | Hints arrive when a player is stuck and disappear when the action is understood. |
| [SFQ-B064](../builds/SFQ-B064.md) | Make the first upgrade felt on departure | The player earns, fits and immediately experiences a new capability. |
| [SFQ-B065](../builds/SFQ-B065.md) | Pace freedom and narrative pressure | Story progression creates new opportunities without trapping the player in busywork. |
| [SFQ-B066](../builds/SFQ-B066.md) | Make failure mutate the job | A damaged convoy can become rescue, restitution or salvage rather than an unexplained hard reset. |
| [SFQ-B067](../builds/SFQ-B067.md) | Introduce alien evidence gradually | A player first sees a wrong detail, then earns the vocabulary to understand it. |
| [SFQ-B068](../builds/SFQ-B068.md) | Make characters interrupt for reasons | Comms correspond to observable events and relationships. |
| [SFQ-B069](../builds/SFQ-B069.md) | Finish chapter transitions as gameplay | Crossing into a new region changes the physical and economic problem before the title card explains it. |
| [SFQ-B070](../builds/SFQ-B070.md) | Close the campaign without closing the world | The main arc reaches a coherent conclusion and leaves bounded optional play. |

## Directed INFERENCE candidates

| Local ID | Bounded change | Done when |
| --- | --- | --- |
| [SFQ-I025](../inference/SFQ-I025.md) | Next objective names a physical action | Completing that action advances the objective without guessing a hidden verb. |
| [SFQ-I026](../inference/SFQ-I026.md) | Completed tutorial stops repeating | Relaunch/load respects the intended persistent or session teaching scope. |
| [SFQ-I027](../inference/SFQ-I027.md) | Reward has a usable fit route | The player can fit or intentionally store the reward and is told which. |
| [SFQ-I028](../inference/SFQ-I028.md) | Chapter denial explains prerequisite | The player receives a recoverable next action. |

## Playable scenes

- [M01 — The opening raid, made whole](../missions/M01.md): CORE / enrich existing, do not duplicate
- [M35 — The route that closes ahead](../missions/M35.md): OPTIONAL LATE CAMPAIGN / no required new ending
- [M36 — The universe keeps working](../missions/M36.md): CORE FINISH ROUTE / composite acceptance, not a new mission

## Required working method

[Admit into current owners](../integration/01_ADMISSION_AND_CROSSWALK.md), then use the [build-worker loop](../workflows/03_BUILD_WORKER.md) and [independent review](../workflows/08_INDEPENDENT_REVIEW.md). Uncertain design belongs in a [strong-agent campaign](../workflows/02_STRONG_AGENT_DESIGN.md), not a weak worker’s imagination.

Each selected feature needs real input, authoritative behavior, complete presentation and persistence. It is legal to finish this program’s useful core while cutting/defering optional proposals. The full candidate count is not a production quota.
