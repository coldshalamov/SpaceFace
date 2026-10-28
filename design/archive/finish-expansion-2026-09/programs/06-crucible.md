# SFQ-P06 — Crucible: the repeatable physics showcase

A run escalates from readable play to spectacular earned chaos, with fast retries and genuinely different builds.

**Disposition:** supporting source program, not an independently active queue. **Milestone band:** 2. **Existing owners to search:** PQ-133 / PQ-169 / PQ-174 / PQ-175.

## Baseline and uncertainty

Crucible wave/arc, survival-style and no-HP-scaling checks exist in package.json. Existing mode owners must be verified at activation; this is not a new survival framework.

Sources: [S02](../audit/SOURCES.md#s02), [S07](../audit/SOURCES.md#s07), [S14](../audit/SOURCES.md#s14). Source pins do not establish current performance or visual quality.

## Candidate owner paths

- `src/systems/survivalWave.js`
- `src/systems/survivalRewards.js`
- `src/systems/survivalDraft.js`
- `src/systems/survivalArena.js`
- `src/systems/swarmArena.js`
- `src/systems/stuntGrammar.js`
- `src/ui/orrery/hudAdapter.js`

These are owner neighborhoods; some are directly inspected and others are routed/inferred from repository maps or prior source context. Resolve the exact live selected function/file before activation. Do not create a missing path just to conform to a plan.

## Build-plan candidates

| Local ID | Work | Player outcome |
| --- | --- | --- |
| [SFQ-B051](../builds/SFQ-B051.md) | Make the first minute demonstrate the game | A new run provides a throwable body, a clear pursuer and a readable payoff quickly. |
| [SFQ-B052](../builds/SFQ-B052.md) | Compose an escalation arc | Early, middle and late rounds test different skills, not the same crowd with larger numbers. |
| [SFQ-B053](../builds/SFQ-B053.md) | Preserve meaningful arena aftermath | Wrecks and hazards make the next decisions interesting without unbounded debris growth. |
| [SFQ-B054](../builds/SFQ-B054.md) | Make draft choices change play | The between-round choice has an observable effect in the next fight. |
| [SFQ-B055](../builds/SFQ-B055.md) | Keep ordinary kills fairly paid | Guns fund survival, while unusual physics adds bounded style and readable celebration. |
| [SFQ-B056](../builds/SFQ-B056.md) | Create arena laws with counterplay | Local machinery changes trajectories and creates decisions. |
| [SFQ-B057](../builds/SFQ-B057.md) | Make recovery an earned interval | Clearing pressure produces a short perceptible release before the next challenge. |
| [SFQ-B058](../builds/SFQ-B058.md) | Show why the run ended | Death/replay makes the decisive cause intelligible and retry immediate. |
| [SFQ-B059](../builds/SFQ-B059.md) | Keep seed and build sharing truthful | A shared challenge reproduces the rules and starting configuration it names. |
| [SFQ-B060](../builds/SFQ-B060.md) | Converge the full run loop | Boot, play, shop, die, retry and return to Adventure behave like one finished product. |

## Directed INFERENCE candidates

| Local ID | Bounded change | Done when |
| --- | --- | --- |
| [SFQ-I021](../inference/SFQ-I021.md) | Run seed visible on results | Copying it yields a valid supported share payload. |
| [SFQ-I022](../inference/SFQ-I022.md) | Empty rack refusal | The next attempted drop neither spends stock nor silently fails. |
| [SFQ-I023](../inference/SFQ-I023.md) | Retry clears one stale loop | Repeating retry five times does not multiply the loop. |
| [SFQ-I024](../inference/SFQ-I024.md) | Reward receipt follows true cause | The same kill is counted once with an accurate cause. |

## Playable scenes

- [M19 — Arena of useful wrecks](../missions/M19.md): CORE / Crucible scenario, not campaign mission
- [M20 — A room with a different law](../missions/M20.md): SELECTED / Crucible variation

## Required working method

[Admit into current owners](../integration/01_ADMISSION_AND_CROSSWALK.md), then use the [build-worker loop](../workflows/03_BUILD_WORKER.md) and [independent review](../workflows/08_INDEPENDENT_REVIEW.md). Uncertain design belongs in a [strong-agent campaign](../workflows/02_STRONG_AGENT_DESIGN.md), not a weak worker’s imagination.

Each selected feature needs real input, authoritative behavior, complete presentation and persistence. It is legal to finish this program’s useful core while cutting/defering optional proposals. The full candidate count is not a production quota.
