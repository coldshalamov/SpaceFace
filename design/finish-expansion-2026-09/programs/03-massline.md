# SFQ-P03 — Massline, contact, and terrain as the signature toy

One simple relationship between two bodies produces readable swings, theft, rescue and violent collisions.

**Disposition:** supporting source program, not an independently active queue. **Milestone band:** 1. **Existing owners to search:** PQ-026–031 / PQ-137 / PQ-146 / PQ-154.

## Baseline and uncertainty

The constraint and physics-authority seams are established. The latest master commit specifically protects kinematic opt-outs; physical affordances must agree with body eligibility.

Sources: [S01](../audit/SOURCES.md#s01), [S07](../audit/SOURCES.md#s07), [S08](../audit/SOURCES.md#s08), [S12](../audit/SOURCES.md#s12). Source pins do not establish current performance or visual quality.

## Candidate owner paths

- `src/core/constraints/masslineController.js`
- `src/combat/attachments.js`
- `src/systems/tetherGameplay.js`
- `src/core/physicsAuthority.js`
- `src/systems/masslineImpacts.js`
- `src/systems/terrainAnchors.js`

These are owner neighborhoods; some are directly inspected and others are routed/inferred from repository maps or prior source context. Resolve the exact live selected function/file before activation. Do not create a missing path just to conform to a plan.

## Build-plan candidates

| Local ID | Work | Player outcome |
| --- | --- | --- |
| [SFQ-B021](../builds/SFQ-B021.md) | Make latch eligibility honest | What looks latchable behaves as the kind of anchor the player was promised. |
| [SFQ-B022](../builds/SFQ-B022.md) | Prove light medium heavy coupling | The same rope yields throw, mutual swing or self-sling according to the actual mass relationship. |
| [SFQ-B023](../builds/SFQ-B023.md) | Make release and break unambiguous | A clean release feels different from overloaded failure and both preserve the correct trajectory. |
| [SFQ-B024](../builds/SFQ-B024.md) | Build a deliberate snap-catch challenge | A skilled pilot can change anchors mid-flight without accidental double constraints. |
| [SFQ-B025](../builds/SFQ-B025.md) | Turn fresh wrecks into ammunition | Winning a fight changes the physical options in that same fight. |
| [SFQ-B026](../builds/SFQ-B026.md) | Make tension actionable | Players can anticipate a line failure and choose release, reel or reduced thrust. |
| [SFQ-B027](../builds/SFQ-B027.md) | Author terrain for swing decisions | Asteroids and machinery form useful routes, not a random obstacle soup. |
| [SFQ-B028](../builds/SFQ-B028.md) | Preserve roped cargo as matter | A payload stays physical until the appropriate collection or handoff action completes. |
| [SFQ-B029](../builds/SFQ-B029.md) | Give enemies counter-tether intentions | A specialist threatens the relationship rather than erasing it arbitrarily. |
| [SFQ-B030](../builds/SFQ-B030.md) | Compose a three-verb physical scene | Players combine rope, field and ordnance with ordinary terrain in a repeatable combat situation. |

## Directed INFERENCE candidates

| Local ID | Bounded change | Done when |
| --- | --- | --- |
| [SFQ-I009](../inference/SFQ-I009.md) | Denied latch names the actual reason | Range, protected kinematic target and line-of-sight do not all say the same misleading sentence. |
| [SFQ-I010](../inference/SFQ-I010.md) | Clean cut does not fake a snap | A manual cut preserves the ordinary release sound; overload emits the distinct break sound once. |
| [SFQ-I011](../inference/SFQ-I011.md) | Tethered pickup survives collector tick | A roped mission payload is not consumed by an automatic magnet. |
| [SFQ-I012](../inference/SFQ-I012.md) | Anchor highlight matches real eligibility | Preview and actual latch decision agree for that object. |

## Playable scenes

- [M02 — Breakaway freight](../missions/M02.md): SELECTED / ordinary-world teaching candidate
- [M04 — Counterweight shift](../missions/M04.md): SELECTED / extend Third Shift where overlapping
- [M05 — A pod in the crossfire](../missions/M05.md): SELECTED
- [M07 — Cargo in the wake](../missions/M07.md): OPTIONAL / combine with an existing heist if similar
- [M16 — Build your own escape](../missions/M16.md): OPTIONAL
- [M18 — The honest shortcut](../missions/M18.md): OPTIONAL
- [M19 — Arena of useful wrecks](../missions/M19.md): CORE / Crucible scenario, not campaign mission
- [M32 — Two ships, one mistake](../missions/M32.md): OPTIONAL SET PIECE

## Required working method

[Admit into current owners](../integration/01_ADMISSION_AND_CROSSWALK.md), then use the [build-worker loop](../workflows/03_BUILD_WORKER.md) and [independent review](../workflows/08_INDEPENDENT_REVIEW.md). Uncertain design belongs in a [strong-agent campaign](../workflows/02_STRONG_AGENT_DESIGN.md), not a weak worker’s imagination.

Each selected feature needs real input, authoritative behavior, complete presentation and persistence. It is legal to finish this program’s useful core while cutting/defering optional proposals. The full candidate count is not a production quota.
