# SFQ-P21 — ORRERY as a complete usable instrument

The interface makes the game’s choices legible while looking like the same authored instrument everywhere.

**Disposition:** supporting source program, not an independently active queue. **Milestone band:** 3. **Existing owners to search:** Existing ORRERY redesign lane; minimal feature-required UI writes allowed.

## Baseline and uncertainty

ORRERY is the current direction. Older Field Hardware/approved-image authority is superseded by current root instructions. These outcomes belong to that lane and its component library, not a competing frontend plan.

Sources: [S01](../audit/SOURCES.md#s01), [S02](../audit/SOURCES.md#s02), [S19](../audit/SOURCES.md#s19). Source pins do not establish current performance or visual quality.

## Candidate owner paths

- `design/frontend/ORRERY.md`
- `src/ui/orrery/`
- `src/ui/screens/`
- `src/ui/market/`
- `src/ui/asteroid/`
- `styles/`

These are owner neighborhoods; some are directly inspected and others are routed/inferred from repository maps or prior source context. Resolve the exact live selected function/file before activation. Do not create a missing path just to conform to a plan.

## Build-plan candidates

| Local ID | Work | Player outcome |
| --- | --- | --- |
| [SFQ-B201](../builds/SFQ-B201.md) | Finish the boot-to-play instrument | Title, mode selection, loading and first input form one responsive route. |
| [SFQ-B202](../builds/SFQ-B202.md) | Make flight HUD answer the next decision | Hull, shield, speed, target, rig and ordnance communicate current action without covering it. |
| [SFQ-B203](../builds/SFQ-B203.md) | Make the map a planning instrument | Navigation connects known routes, hazards, jobs and services with clear selection. |
| [SFQ-B204](../builds/SFQ-B204.md) | Make Shipworks explain physical tradeoffs | Fitting previews show what the actual ship will do differently. |
| [SFQ-B205](../builds/SFQ-B205.md) | Make the market usable under pressure | Buying, selling and comparing a route are concise but truthful. |
| [SFQ-B206](../builds/SFQ-B206.md) | Make station services feel like one place | Repair, contracts, research, contacts and departure share context and focus. |
| [SFQ-B207](../builds/SFQ-B207.md) | Make menus preserve player agency | Pause, settings, saves and results support quick recovery and deliberate destructive actions. |
| [SFQ-B208](../builds/SFQ-B208.md) | Make density and accessibility coexist | Long lists, small screens, large text and reduced motion retain useful information. |
| [SFQ-B209](../builds/SFQ-B209.md) | Make interface motion feel responsive | Choreography supports comprehension but never postpones interaction or repeats needlessly. |
| [SFQ-B210](../builds/SFQ-B210.md) | Converge every ordinary screen | One complete action walk catches gaps a beauty still cannot. |

## Directed INFERENCE candidates

| Local ID | Bounded change | Done when |
| --- | --- | --- |
| [SFQ-I081](../inference/SFQ-I081.md) | Disabled action states its reason | The visible reason equals the operation predicate. |
| [SFQ-I082](../inference/SFQ-I082.md) | Focus returns to its origin | Keyboard play resumes at the expected control without firing in flight. |
| [SFQ-I083](../inference/SFQ-I083.md) | One leader label stops overlapping | Label and anchor remain readable at the tested sizes. |
| [SFQ-I084](../inference/SFQ-I084.md) | Reduced motion reaches the final state | Its final reading/selection is present with motion disabled. |

## Playable scenes

- [M08 — The impounded machine](../missions/M08.md): OPTIONAL
- [M36 — The universe keeps working](../missions/M36.md): CORE FINISH ROUTE / composite acceptance, not a new mission

## Required working method

[Admit into current owners](../integration/01_ADMISSION_AND_CROSSWALK.md), then use the [build-worker loop](../workflows/03_BUILD_WORKER.md) and [independent review](../workflows/08_INDEPENDENT_REVIEW.md). Uncertain design belongs in a [strong-agent campaign](../workflows/02_STRONG_AGENT_DESIGN.md), not a weak worker’s imagination.

Each selected feature needs real input, authoritative behavior, complete presentation and persistence. It is legal to finish this program’s useful core while cutting/defering optional proposals. The full candidate count is not a production quota.
