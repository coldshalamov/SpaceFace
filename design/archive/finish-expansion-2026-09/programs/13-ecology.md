# SFQ-P13 — Alien ecology that shares the physical world

Animals have motives, anatomy and consequences without becoming a second human combat faction.

**Disposition:** supporting source program, not an independently active queue. **Milestone band:** 4. **Existing owners to search:** AE-000–349 / PR 170 / existing alien-ecology-program.

## Baseline and uncertainty

PR 170 contains fauna drives, contamination, capture hooks and selected physics bodies. It is unmerged at the audit pin. Capability coverage across ordinary combat/physics tools is not uniform and needs a targeted matrix, not blanket conversion.

Sources: [S01](../audit/SOURCES.md#s01), [S17](../audit/SOURCES.md#s17), [S23](../audit/SOURCES.md#s23), [S24](../audit/SOURCES.md#s24), [S25](../audit/SOURCES.md#s25). Source pins do not establish current performance or visual quality.

## Candidate owner paths

- `src/data/alienFauna.js`
- `src/data/alienEcology.js`
- `src/systems/alienEcology.js`
- `src/systems/impulseCharges.js`
- `src/core/physicsAuthority.js`
- `src/systems/world.js`

These are owner neighborhoods; some are directly inspected and others are routed/inferred from repository maps or prior source context. Resolve the exact live selected function/file before activation. Do not create a missing path just to conform to a plan.

## Build-plan candidates

| Local ID | Work | Player outcome |
| --- | --- | --- |
| [SFQ-B121](../builds/SFQ-B121.md) | Prove one fauna interaction matrix | The same organism can be observed, shoved, captured or left alone according to explicit capabilities. |
| [SFQ-B122](../builds/SFQ-B122.md) | Make drives observable | The player can infer feeding, alarm, defense and retreat from motion. |
| [SFQ-B123](../builds/SFQ-B123.md) | Make relay severance interesting | Removing coherence changes coordination without switching animals off. |
| [SFQ-B124](../builds/SFQ-B124.md) | Build a three-species food web | One predator, prey and cleaner/scavenger interact around finite resources. |
| [SFQ-B125](../builds/SFQ-B125.md) | Give capture a handling problem | Live recovery requires a gentle physical approach and suitable containment. |
| [SFQ-B126](../builds/SFQ-B126.md) | Create behavioral fossils | A dumb host repeats a fragment of another host's past without becoming intelligent. |
| [SFQ-B127](../builds/SFQ-B127.md) | Make corpses and molts useful | Dead fauna leaves finite habitat, material or shelter rather than a generic explosion. |
| [SFQ-B128](../builds/SFQ-B128.md) | Make parasites removable through play | An attachment creates a local problem with clear counter-actions. |
| [SFQ-B129](../builds/SFQ-B129.md) | Develop the Cinder Nursery beyond its checklist | One colony is convincing as a place before species are mass-produced. |
| [SFQ-B130](../builds/SFQ-B130.md) | Expand only distinct ecological roles | Additional fauna earns its place through a new decision or relationship. |

## Directed INFERENCE candidates

| Local ID | Bounded change | Done when |
| --- | --- | --- |
| [SFQ-I049](../inference/SFQ-I049.md) | Fauna label respects knowledge | Unknown remains unknown until the existing knowledge predicate allows classification. |
| [SFQ-I050](../inference/SFQ-I050.md) | Purge clears the same attachment | Gameplay and visual status end together, including reload. |
| [SFQ-I051](../inference/SFQ-I051.md) | Captured specimen cannot be double-collected | Repeated capture receipt yields one specimen. |
| [SFQ-I052](../inference/SFQ-I052.md) | Relay-off text matches live behavior | Text describes loss of coherence, not disappearance of biomass. |

## Playable scenes

- [M11 — The ship that flew this before](../missions/M11.md): SELECTED
- [M12 — Quiet passage](../missions/M12.md): OPTIONAL
- [M21 — Cinder Nursery: the physical return](../missions/M21.md): CORE ALIEN SLICE / enrich existing
- [M22 — The sample that must arrive alive](../missions/M22.md): SELECTED ALIEN
- [M23 — Glue, meet mass](../missions/M23.md): SELECTED XENOTECH / later slice
- [M24 — Move the nursery, not the animals](../missions/M24.md): SELECTED ALIEN
- [M25 — A fossil made of motion](../missions/M25.md): SELECTED RESEARCH
- [M26 — The station that kept breathing](../missions/M26.md): OPTIONAL / enrich existing Breathing Dock
- [M30 — The clean cylinder](../missions/M30.md): SELECTED MACHINE/ECOLOGY

## Required working method

[Admit into current owners](../integration/01_ADMISSION_AND_CROSSWALK.md), then use the [build-worker loop](../workflows/03_BUILD_WORKER.md) and [independent review](../workflows/08_INDEPENDENT_REVIEW.md). Uncertain design belongs in a [strong-agent campaign](../workflows/02_STRONG_AGENT_DESIGN.md), not a weak worker’s imagination.

Each selected feature needs real input, authoritative behavior, complete presentation and persistence. It is legal to finish this program’s useful core while cutting/defering optional proposals. The full candidate count is not a production quota.
