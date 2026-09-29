# SFQ-P02 — The hand: nimble control without stealing momentum

Every deliberate input produces a trustworthy physical response; earned speed and readable control survive combat.

**Disposition:** supporting source program, not an independently active queue. **Milestone band:** 1. **Existing owners to search:** PQ-137 / PQ-164 / PQ-189; FUN_CONVERGENCE_LOOP.

## Baseline and uncertainty

The G-mode relative stick is already implemented, with bounded displacement and camera-basis projection. Cruise already filters chip hits. The current Feel Contract contains later speed-normalized B2/B3 amendments: old absolute-radius numbers must not be reinstated.

Sources: [S01](../audit/SOURCES.md#s01), [S07](../audit/SOURCES.md#s07), [S08](../audit/SOURCES.md#s08), [S09](../audit/SOURCES.md#s09), [S10](../audit/SOURCES.md#s10), [S11](../audit/SOURCES.md#s11). Source pins do not establish current performance or visual quality.

## Candidate owner paths

- `src/systems/dynamicFlightStick.js`
- `src/systems/input.js`
- `src/systems/flightV3.js`
- `src/core/flight/propulsionKernel.js`
- `src/systems/cruise.js`
- `src/render/camera.js`

These are owner neighborhoods; some are directly inspected and others are routed/inferred from repository maps or prior source context. Resolve the exact live selected function/file before activation. Do not create a missing path just to conform to a plan.

## Build-plan candidates

| Local ID | Work | Player outcome |
| --- | --- | --- |
| [SFQ-B011](../builds/SFQ-B011.md) | Calibrate the existing G combat stick | A trackpad user can steer and fight without drawing paths or chasing the screen edge. |
| [SFQ-B012](../builds/SFQ-B012.md) | Resolve input hand conflicts | The pilot can steer, latch, release and fire with two hands on keyboard and trackpad. |
| [SFQ-B013](../builds/SFQ-B013.md) | Protect earned speed across all launch causes | A sling, shove, collision or well release keeps the momentum it earned. |
| [SFQ-B014](../builds/SFQ-B014.md) | Make control-mode transitions continuous | Opening/closing the map or toggling assistance does not lurch the ship. |
| [SFQ-B015](../builds/SFQ-B015.md) | Tune loaded-hull handling visibly | Heavy cargo changes piloting in a predictable, learnable way. |
| [SFQ-B016](../builds/SFQ-B016.md) | Separate chase framing from steering | Camera changes help anticipate travel without feeling like control takeover. |
| [SFQ-B017](../builds/SFQ-B017.md) | Make emergency braking a choice | A player can intentionally spend speed to escape a bad trajectory. |
| [SFQ-B018](../builds/SFQ-B018.md) | Keep input responsive during time effects | Slow motion does not turn the controls into syrup. |
| [SFQ-B019](../builds/SFQ-B019.md) | Recover gracefully from contact | Scrapes remain steerable, hard earned impacts remain dramatic. |
| [SFQ-B020](../builds/SFQ-B020.md) | Teach handling through an actual job | The player learns drift, brake and release while accomplishing something useful. |

## Directed INFERENCE candidates

| Local ID | Bounded change | Done when |
| --- | --- | --- |
| [SFQ-I005](../inference/SFQ-I005.md) | Stick reset on focus return | Returning to the game produces neutral intent until fresh input; no weapon fires. |
| [SFQ-I006](../inference/SFQ-I006.md) | Actual brake cue | Empty capacitor, disabled drive and active brake show different truthful states. |
| [SFQ-I007](../inference/SFQ-I007.md) | Loaded-turn preview label | Fitting the same module yields the displayed direction of handling change in flight. |
| [SFQ-I008](../inference/SFQ-I008.md) | G hint names the live mechanic | The hint describes relative-stick steering and respects rebound keys. |

## Playable scenes

- [M18 — The honest shortcut](../missions/M18.md): OPTIONAL

## Required working method

[Admit into current owners](../integration/01_ADMISSION_AND_CROSSWALK.md), then use the [build-worker loop](../workflows/03_BUILD_WORKER.md) and [independent review](../workflows/08_INDEPENDENT_REVIEW.md). Uncertain design belongs in a [strong-agent campaign](../workflows/02_STRONG_AGENT_DESIGN.md), not a weak worker’s imagination.

Each selected feature needs real input, authoritative behavior, complete presentation and persistence. It is legal to finish this program’s useful core while cutting/defering optional proposals. The full candidate count is not a production quota.
