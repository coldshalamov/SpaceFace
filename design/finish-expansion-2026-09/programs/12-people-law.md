# SFQ-P12 — People, law and memorable consequences

The world understands the difference between a rescue, a mistake and a crime, and gives the pilot something to do about it.

**Disposition:** supporting source program, not an independently active queue. **Milestone band:** 3. **Existing owners to search:** PQ-149 / PQ-150 / PQ-151 / current recognition and consequence systems.

## Baseline and uncertainty

Reputation, WANTED heat, provenance, returning contacts and consequences are existing owners. The work is to make their causal chain comprehensible and dramatically useful, not add a second reputation axis.

Sources: [S01](../audit/SOURCES.md#s01), [S08](../audit/SOURCES.md#s08), [S15](../audit/SOURCES.md#s15). Source pins do not establish current performance or visual quality.

## Candidate owner paths

- `src/systems/factions.js`
- `src/systems/heat.js`
- `src/systems/lawSecurity.js`
- `src/systems/provenanceLedger.js`
- `src/systems/nemesis.js`
- `src/systems/barkDirector.js`

These are owner neighborhoods; some are directly inspected and others are routed/inferred from repository maps or prior source context. Resolve the exact live selected function/file before activation. Do not create a missing path just to conform to a plan.

## Build-plan candidates

| Local ID | Work | Player outcome |
| --- | --- | --- |
| [SFQ-B111](../builds/SFQ-B111.md) | Attribute physical collateral honestly | The game can explain why the player is or is not responsible for a thrown object's collision. |
| [SFQ-B112](../builds/SFQ-B112.md) | Make the first law response readable | A pilot receives warning, cause and options before escalation where fiction permits. |
| [SFQ-B113](../builds/SFQ-B113.md) | Give rescue durable recognition | Saving a named pilot changes a future opportunity or response. |
| [SFQ-B114](../builds/SFQ-B114.md) | Let rivals remember tactics | An escaped opponent changes one observable countermeasure on return. |
| [SFQ-B115](../builds/SFQ-B115.md) | Make restitution playable | A mistake can be repaired through a job instead of only a fine. |
| [SFQ-B116](../builds/SFQ-B116.md) | Show factions in action | Human factions differ by work and choices as well as paint. |
| [SFQ-B117](../builds/SFQ-B117.md) | Keep comms from drowning the fight | Useful voices have priority, locality and a cooldown. |
| [SFQ-B118](../builds/SFQ-B118.md) | Give the ship a legible history | Scars, selected recognition and lawful status make the hull feel personal. |
| [SFQ-B119](../builds/SFQ-B119.md) | Create aftermath choices | After a fight the player chooses among rescue, salvage, pursuit and escape. |
| [SFQ-B120](../builds/SFQ-B120.md) | Review the consequence chain end to end | Complex incidents remain fair when several systems react. |

## Directed INFERENCE candidates

| Local ID | Bounded change | Done when |
| --- | --- | --- |
| [SFQ-I045](../inference/SFQ-I045.md) | Incident shows the responsible event | The reason agrees with the provenance record. |
| [SFQ-I046](../inference/SFQ-I046.md) | Rescued contact does not pay twice | Reloading and rehailing cannot repeat payment. |
| [SFQ-I047](../inference/SFQ-I047.md) | Bark suppresses duplicate cause | The useful line plays once while a later distinct event can speak. |
| [SFQ-I048](../inference/SFQ-I048.md) | Ship history avoids stale hull IDs | A new hull does not display the old hull's physical damage. |

## Playable scenes

- [M01 — The opening raid, made whole](../missions/M01.md): CORE / enrich existing, do not duplicate
- [M05 — A pod in the crossfire](../missions/M05.md): SELECTED
- [M06 — The moving manifest](../missions/M06.md): SELECTED
- [M07 — Cargo in the wake](../missions/M07.md): OPTIONAL / combine with an existing heist if similar
- [M08 — The impounded machine](../missions/M08.md): OPTIONAL
- [M09 — The salvage dispute](../missions/M09.md): OPTIONAL
- [M10 — False bloom](../missions/M10.md): SELECTED
- [M13 — Pay back the wake](../missions/M13.md): SELECTED
- [M14 — A rival remembers](../missions/M14.md): OPTIONAL
- [M34 — The harvest somebody else owns](../missions/M34.md): OPTIONAL SET PIECE

## Required working method

[Admit into current owners](../integration/01_ADMISSION_AND_CROSSWALK.md), then use the [build-worker loop](../workflows/03_BUILD_WORKER.md) and [independent review](../workflows/08_INDEPENDENT_REVIEW.md). Uncertain design belongs in a [strong-agent campaign](../workflows/02_STRONG_AGENT_DESIGN.md), not a weak worker’s imagination.

Each selected feature needs real input, authoritative behavior, complete presentation and persistence. It is legal to finish this program’s useful core while cutting/defering optional proposals. The full candidate count is not a production quota.
