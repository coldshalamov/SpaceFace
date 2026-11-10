# SFQ-P04 — Weapons, states, and combinatorial combat

Every weapon changes a physical situation; shooting remains fun and physical setups expand possibilities rather than replace it.

**Disposition:** supporting source program, not an independently active queue. **Milestone band:** 2. **Existing owners to search:** PQ-139 / PQ-147 / PQ-205 / PQ-206.

## Baseline and uncertainty

Eight bomb payloads and status/field owners already exist; Tarburst is not a new proposal. Bomb target predicates currently omit fauna. New damage/status routes need explicit actor eligibility, not assumed universal support.

Sources: [S07](../audit/SOURCES.md#s07), [S12](../audit/SOURCES.md#s12), [S13](../audit/SOURCES.md#s13), [S14](../audit/SOURCES.md#s14). Source pins do not establish current performance or visual quality.

## Candidate owner paths

- `src/data/weapons.js`
- `src/data/bombs.js`
- `src/data/combatDefs.js`
- `src/systems/weapons.js`
- `src/systems/bombs.js`
- `src/systems/fields.js`
- `src/combat/impulseKernel.js`

These are owner neighborhoods; some are directly inspected and others are routed/inferred from repository maps or prior source context. Resolve the exact live selected function/file before activation. Do not create a missing path just to conform to a plan.

## Build-plan candidates

| Local ID | Work | Player outcome |
| --- | --- | --- |
| [SFQ-B031](../builds/SFQ-B031.md) | Differentiate the existing starter loadout | A new player understands gun, shove, rope and bomb as different choices. |
| [SFQ-B032](../builds/SFQ-B032.md) | Complete ordnance interaction coverage | Bombs affect every explicitly eligible body, including admitted physical fauna. |
| [SFQ-B033](../builds/SFQ-B033.md) | Make status combinations explain themselves | Primed, pinned, gooed, tumbling and burning states have readable setup and payoff. |
| [SFQ-B034](../builds/SFQ-B034.md) | Keep moving traps moving honestly | Dropped bombs inherit velocity and stay relevant to pursuit geometry. |
| [SFQ-B035](../builds/SFQ-B035.md) | Make directional impulse aim matter | Hitting a flank produces a different opportunity from hitting a nose. |
| [SFQ-B036](../builds/SFQ-B036.md) | Bound control denial without removing power | Earned stuns are strong, but the player is not permanently unable to act. |
| [SFQ-B037](../builds/SFQ-B037.md) | Give environmental destruction distinct physics | Fuel, armor, rock and industrial machinery break into useful different aftermaths. |
| [SFQ-B038](../builds/SFQ-B038.md) | Turn defense into positional play | Protection is a direction/relationship decision rather than a permanent bright bubble. |
| [SFQ-B039](../builds/SFQ-B039.md) | Prove two unusual builds without a dominant answer | Fitting choices alter how a pilot solves a fight. |
| [SFQ-B040](../builds/SFQ-B040.md) | Ship a shared combat composition matrix | The core toys, alien matter and machinery obey compatible rules across modes. |

## Directed INFERENCE candidates

| Local ID | Bounded change | Done when |
| --- | --- | --- |
| [SFQ-I013](../inference/SFQ-I013.md) | Bomb refusal is truthful | Each refusal maps to the real bomb owner state and release does not spend ammo. |
| [SFQ-I014](../inference/SFQ-I014.md) | Goo expiry clears active force | After expiry the status is gone and only bounded cosmetic residue may remain. |
| [SFQ-I015](../inference/SFQ-I015.md) | One cause one detonation cue | One detonation means one damage application and one main sound/visual onset. |
| [SFQ-I016](../inference/SFQ-I016.md) | Heavy target response label | The player's preview no longer promises a light-hull throw on a heavy target. |

## Playable scenes

- [M14 — A rival remembers](../missions/M14.md): OPTIONAL
- [M17 — The working battlefield](../missions/M17.md): OPTIONAL
- [M19 — Arena of useful wrecks](../missions/M19.md): CORE / Crucible scenario, not campaign mission
- [M20 — A room with a different law](../missions/M20.md): SELECTED / Crucible variation
- [M23 — Glue, meet mass](../missions/M23.md): SELECTED XENOTECH / later slice
- [M31 — The Mason moves the cover](../missions/M31.md): OPTIONAL SET PIECE
- [M33 — At the edge of order](../missions/M33.md): OPTIONAL SET PIECE

## Required working method

[Admit into current owners](../integration/01_ADMISSION_AND_CROSSWALK.md), then use the [build-worker loop](../workflows/03_BUILD_WORKER.md) and [independent review](../workflows/08_INDEPENDENT_REVIEW.md). Uncertain design belongs in a [strong-agent campaign](../workflows/02_STRONG_AGENT_DESIGN.md), not a weak worker’s imagination.

Each selected feature needs real input, authoritative behavior, complete presentation and persistence. It is legal to finish this program’s useful core while cutting/defering optional proposals. The full candidate count is not a production quota.
