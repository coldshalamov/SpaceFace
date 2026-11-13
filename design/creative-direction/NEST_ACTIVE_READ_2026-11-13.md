# The Nest: a readable live decision

Parent: `265ad60d221b7b484e9c9553d963b991c4122202` on PR #982. This increment changes presentation only, not encounter results or balance.

## Why this follows Rookside

Cinder asks the pilot to distinguish a fight from the custody of its wrecks. The garden then turns genuine material into visible growth; the first growth, not a 240t contract, advances the journey. The Nest must turn that newly earned attention toward a different decision: use a small physical enemy as a tool, use conventional weapons, or leave alive. It must not turn the optional heavy baffles into an implicit upgrade gate.

The previous active objective repeated the same full instruction throughout combat. After the final launch it still told the pilot to watch the launch cycle, despite there being no further launch windows. It described withdrawal without explaining that returning to the 650WU approach marker is not sufficient.

## Implemented now

[`src/data/nestVisit.js`](../../src/data/nestVisit.js) reads the live encounter owner's confirmed return count, remaining onboard brood and published open/guarded coupling state. The normal story waypoint now distinguishes the active decision:

- guarded with brood aboard: catch a launched Wasp and watch the next coupling;
- exposed coupling: real physical contact, not mere proximity;
- final brood deployed and guarded: no more launch windows; guns, capable baffle handling or retreat remain;
- escape: more than 3,000WU from the carrier while alive, or genuine sector departure, not the nearby approach marker.

The same outside approach point is retained, never auto-selecting the hull. Counts are observations, not receipts. Missing/dead/foreign/incomplete live records fall back to the prior neutral briefing; snapshot-only restoration cannot invent a current exposed window. Ordinary campaign and outcome owners remain unchanged.

## Reusable toolbox

- `src/data/encounters/705-the-nest.js`: finite six-Wasp cast, two-second launch opening, actual contact receipts, physical baffle tear, alive-distance or sector departure escape. Source verified, not newly visually reviewed.
- `src/render/nestBayVisuals.js`: existing guarded-cross/open-chevron grammar, independent bay state. Tested object graph, not a screenshot in this run.
- `src/data/nestVisit.js`: pure story waypoint presentation can describe current tactical state without a second encounter writer.
- `test/nest-outcome-handoff.test.mjs`: all four terminal outcomes hand off to Tethys Registry without pretending escape is victory.

## Coverage and open goals

| Marker | Intended outcome | State / owner | Evidence | Next executable action |
| --- | --- | --- | --- | --- |
| SF-GAME | Readable choice throughout Nest fight | Source increment / creative integration | 20/20 focused and neighbor tests | Earn post-garden entry and act on ordinary waypoint in full runtime |
| SF-WORLD-DIRECTION | Cinder→garden→Nest→Registry causal arc | In progress / creative direction | Current source relationships above | Follow actual escape and combat outcomes to Registry |
| SF-SECTOR-COHERENCE | Approach, fight, departure, return are distinct | In progress / creative direction | Outside marker retained; escape threshold now explicit | Check camera composition and navigation while under attack |
| SF-LIVING-WORLD | Surviving nursery has visible consequences | Open / scene owner | Escape writes a threat flag; no scheduled raid consumer established | Define and implement consequence only through appropriate owner, not fabricated copy |
| SF-ASSETBANK / SF-ASSET-QUALITY | Existing carrier/baffles/brood support readable scene | Review gap / local asset producers own models | Existing assets reused; no model request justified | Inspect genuine live composition before requesting new assets |

Tests use controlled live records and real existing outcome/visual graph owners. They do not prove rendered legibility, input timing, full earned play, native contact difficulty or browser Continue. No visual acceptance, complete scene acceptance, merge or deployment. No user operation newly requested by this increment.
