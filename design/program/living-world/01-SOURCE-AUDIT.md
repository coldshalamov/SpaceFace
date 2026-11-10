<!-- LIFETIME: DURABLE -->
# Source audit and design response

Audited source: `coldshalamov/SpaceFace`, public master
`42d57a248209c9f5a7354e65817c0f7b8f5dbcec`, 2026-10-27. This was a source/design/catalog audit,
not a visual playthrough. No statement here certifies frame rate, live visual quality or complete
reachability merely because a module exists. Future agents must inspect their current source and
preserve intervening changes.

**Integration update:** master advanced to `985cb3108552af0af785afaa41730122eaefd902` while
this package was being written. This PR is based on that newer commit and preserves its Eris
Sweep Window and Gravedigger work. The original audit pin above remains the baseline for the
inventory. A targeted source review found no contradiction in the contracts below. Two stronger
reuse seams are now available to LW-13: `src/systems/sweepWindowRuntime.js` owns Eris's physical
Metronome crossing and director-owned completion; `src/systems/gravedigger.js` owns Eunomia's
named graves, claim contest, kin vigils, grudges and `gravedigger_ledger` persistence. Extend those
owners and their actors; do not create a second crossing mission or memorial ledger. This update
is source review, not a new gameplay-acceptance claim for the upstream work.

## 1. What is already here

The repository's own [VISION](../../VISION.md) already describes the correct fantasy: personally
fly a physical ship through meaningful activity and exploit the relationships. The owner's new
request identifies the missing *place-scale execution* of that fantasy. The architecture does not
need another unrelated manager called `LivingWorldSystem`.

| Existing seam | Source evidence | What it offers | What it does not establish |
|---|---|---|---|
| Stable geography | [`sectors.js`](../../../src/data/sectors.js), [`sectorZones.js`](../../../src/data/sectorZones.js), [`sectorAnchors.js`](../../../src/data/sectorAnchors.js) | 25 sectors and 118 named zones, stations, local anchors and routes | That any district is spatially distinctive or densely inhabited at the gameplay camera |
| Additive places | [`authoredPlaces.js`](../../../src/data/authoredPlaces.js), [`PLACE_REGISTRATION.md`](../../../src/data/PLACE_REGISTRATION.md) | Register canonical map-visible places through the existing zone table | A no-presence map marker is not a playable place |
| Work choreography | [`sectorActivityPockets.js`](../../../src/data/sectorActivityPockets.js), [`npcJobsRuntime.js`](../../../src/systems/npcJobsRuntime.js) | 58 activity pockets; native job, target, actor identity and physical-work seams | That all work is visible on a public player approach, meaningful after interruption, or different from its neighbor |
| Connected shipments | [`sectorCausalChains.js`](../../../src/data/sectorCausalChains.js), [`trafficCausalChainOps.js`](../../../src/systems/trafficCausalChainOps.js) | Connect producing work, traffic and receivers | A separate cosmetic convoy must not manufacture a second supply ledger |
| Institutions and law | [`factionPresence.js`](../../../src/systems/factionPresence.js), [`factionConduct.js`](../../../src/data/factionConduct.js), [`gateThreeWeir.js`](../../../src/systems/gateThreeWeir.js) | Presence, local conduct and customs interactions | A large finite military base with a complete invasion/retreat/replacement loop |
| Engagement safety | [`engagementAuthority.js`](../../../src/ai/engagementAuthority.js) | Final authority for firing and contextual hostility, including first-session protection | Permission to turn every neutral faction ship into an enemy or remove starter protections for a base fantasy |
| Theft and control | [`shipjack.js`](../../../src/systems/shipjack.js), [`shipControlTransfer.js`](../../../src/systems/shipControlTransfer.js), [`shipjack/`](../../../src/shipjack/) | Identity, custody, ownership and same-hull control-transfer primitives | That COUNTERSIGN exists or that an entire base heist is accepted |
| Time and civic life | [`worldCalendar.js`](../../../src/data/worldCalendar.js), [`stationLife.js`](../../../src/data/stationLife.js) | One simulation clock, three shifts per 600-second day, service/civic hooks | Passenger occupation routes, home/work links and readable daily schedules everywhere |
| Encounters | [`livedWorldDirector.js`](../../../src/systems/livedWorldDirector.js), [`encounterDirector.js`](../../../src/systems/encounterDirector.js) | Curated scenes and a recurring ambient-scene branch | Ordinary citizens should not disappear when a one-shot encounter is consumed |
| Persistence and scale | [`worldRecords.js`](../../../src/world/worldRecords.js), [`farActorTable.js`](../../../src/world/farActorTable.js), [`sectorCoordinates.js`](../../../src/data/sectorCoordinates.js) | Durable identity, far actors, sector-local/global conversion | Permission for two live copies of a named actor or a second district save authority |
| Buildings on the shelf | [`everydaySpaceKitDressing.js`](../../../src/data/everydaySpaceKitDressing.js) | 46 legal model identities: habitats, passenger platforms, transfer arms, repair structures and more | The scatter path's six-per-sector cap is not an authored city layout; these assets still need purposeful composition |
| Wreck vocabulary | [`wreckAftermathDressing.js`](../../../src/data/wreckAftermathDressing.js) | Reusable fracture/aftermath families | A navigable, inhabited wreckyard whose passages and cargo clearances were authored |
| Alien ground | [`alienEcology.js`](../../../src/systems/alienEcology.js), [`faction_understory.js`](../../../src/systems/faction_understory.js) | Ecology and growth with physical/custody hooks | A green surface tint is not a new biome or a route-changing garden |
| Interior precedent | [`theBolus.js`](../../../src/data/theBolus.js), [`theBolus.js` runtime](../../../src/systems/theBolus.js), [`bolusView.js`](../../../src/render/bolusView.js) | Existing interior-host and interior-view machinery | The debug asteroid interior preview does not prove flyable caves |
| Camera | [`camera.js`](../../../src/render/camera.js), [`racingCameraBlend.js`](../../../src/render/racingCameraBlend.js), [`cameraOccluders.js`](../../../src/render/cameraOccluders.js) | Overhead/stern blending and occlusion seams | Safe automatic interior framing, reversible transitions and good controls in every tunnel |
| Scale and atmosphere | [`sectorLandmarkBackground.js`](../../../src/render/sectorLandmarkBackground.js), [`lookMoods.js`](../../../src/data/lookMoods.js) | Background landmarks and one look-value owner | A close, collidable megastructure: the current background resolver uses a small generic art vocabulary |
| Existing creative spine | [THE WEIGHT](../../expansion/00_README.md), [sector bible](../../expansion/04_SECTORS.md), [campaign](../../expansion/06_CAMPAIGN_SCRIPT.md) | Named wonders, factions, characters, Books 0–7 and five endings | Complete implemented adventures; current implementation truth remains in the source |

The counts above were computed from the canonical exported catalogs at the source pin, not copied
from a historical handoff. They should not become gameplay targets. A count can be correct while
the player still sees an empty screen.

## 2. The structural diagnosis

The existing systems have many useful local rules. The missing connective layer is authored
geography that repeatedly brings those rules into the same legible situation.

A place has four kinds of structure:

1. **Physical:** a boundary, an entrance, a route hierarchy, cover, a landmark and useful gaps.
2. **Operational:** something comes from somewhere, receives work and goes somewhere else.
3. **Social:** people depend on that work, disagree about it and recognize what changed.
4. **Dramatic:** a normal state, pressure, intervention, aftermath and an eventual new normal.

Names and background colors provide only a thin part of physical structure. NPC labels provide
only a thin part of social structure. Hundreds of independent vignettes provide dramatic events
without necessarily making the operational relationships clear. The district briefs deliberately
require all four together.

**A negative finding is not an accusation that every existing module is broken.** The audit finds
strong reuse candidates and compositional gaps. Its claims are bounded to what was read. The task
is to bring existing toys, work and people into places the player can understand without opening
a technical readout.

## 3. Every concern in the commission, mapped to a design answer

| Owner's concern | Concrete answer | Delivery / implementation reference |
|---|---|---|
| Disconnected simulation instead of a game | A recurring loop: notice a need or opportunity, study the place, intervene physically, take an earned capability/consequence elsewhere, return | Story bible; LW-01, LW-11, LW-12 |
| Zones need personalities like towns, deserts and military holdings | Eight different topologies, materials, institutions, sounds, routine tempos and tools; remaining sectors become supporting corridors with particular functions | District table; environment bible; LW-13 |
| Citizens should visibly do things | Source → pickup → travel → wait/work → transfer → return; home/work/service endpoints and interruptions | 24 routines in `districts.json`; native contracts |
| Standing armies | Visible ready/repair/reserve berths, watches, drills, signal duty, real defenders and finite replacements | Niner Bastion; LW-04 |
| GTA-style optional base chaos and stolen special equipment | The COUNTERSIGN heist, three entry methods, actual control transfer, recovery and a useful cargo-control capability | LW-05; `lw_dione_borrowed_authority` |
| Smugglers, wreckage and a gauntlet | Widow's Run's three different route widths and risk profiles around an inhabited ferry and real salvage work | LW-06 |
| Flying a certain way through places | Hull/load clearance, timed machinery, guarded crossings, alternate entrances and a safe retreat route | LW-06, LW-07, LW-08 |
| Space itself feels monotonous | Steel terrain, occupied cavities, rock vaults, bright pruned gardens, dark wreck throats and composed empty refuge; difference comes from geometry and behavior | Environment bible §§ district grammar and camera |
| Planets feel tiny | Preserve playable orbital-scale objects; distinguish distant astronomical bodies, terrain-scale hosts and ship-scale interactables. Show scale through occlusion, time-to-cross, repeated human fixtures and nearby motion | Environment bible; LW-08 |
| Huge Death-Star-like structure covering the view | Original Iron Maw hull surface with local physical panels, trenches, relief court and headlight-readable steel; macro body stays coherent across transitions | LW-08; no borrowed franchise geometry |
| Infested surfaces/cities/caves | Develop existing Understory/Bloom owners; growth and pruning alter cover, routes, homes and work, not only color | LW-09 |
| Enormous hollow asteroids | Nine-Mouth Cut, compound or shell colliders, explicit openings, service bays and contiguous XZ passages | LW-07 |
| Third-person camera inside | Reuse stern blend through an explicit approach/threshold/interior/exit state machine, preserve input, offer overhead/cutaway and motion settings | Environment bible; LW-07 |
| Floating towns, landmark navigation | Modules arranged into courts, spines and thresholds; consistent naming, signs, visible passage hierarchy and destination services | LW-01, LW-03 |
| A landmark tied to culture and story | Empty Plinth, sleeping Gate Auditor, moving address, quarry bell, ferry funeral, garden graves, dead shift and missing fourth toll | Story bible and district primary opportunities |
| Mature, edgy, quirky writing | Specific institutions and affections, practical needs, occasional cruelty, earned absurdity, real victories; ordinary warmth makes transgression matter | Story bible, cast/voice and outcome amendments |
| A complete actual story | Existing Books/ending IDs retained; opening hour, district arcs, regional pressure, finale consequences and post-game callbacks authored | Story bible; LW-11, LW-12 |
| Agent work should not decay into shallow substitutes | Exact outcomes, source owners, data references, scene scripts, negative cases, asset sockets and packet-specific rejection criteria | AGENT_PROMPT; task packets; authoring command |

## 4. Breadth and depth: what “major-game maturity” means here

There is no defensible numerical threshold at which a game becomes comparable to a major release
in 2026. Eight districts do not purchase a quality badge. The proposed scope is a production choice:
enough contrasting places to establish a world, few enough to make their relationships coherent.

The eight flagships should each provide a complete ordinary-life cycle, a discovery route, at least
one locally useful toy, a substantial optional operation with multiple approaches, smaller everyday
work, a revisit transformation and a quiet interval. These are authored requirements for this
package, not universal laws of game design. The remaining 17 existing sectors retain their identities
and gain routes, resources, residents and follow-on consequences that support the flagships. They
do not need 17 more copies of the same town or an immediate expansion to hundreds of characters.

The proposed experience grows in three steps:

| Step | Scope | Demonstrated claim |
|---|---|---|
| First coherent neighborhood | Lantern Ward and one adjacent working route, using existing art where possible | A player sees a real life cycle, affects it and recognizes the result after a return |
| Connected regional slice | Lantern Ward, Switchyard, Niner and Widow's Run | Trade, law, theft, help and travel produce cross-place stories; multiple player approaches remain valid |
| Complete authored world | Eight flagships, supporting sectors and campaign integration | Places differ in geometry and daily life, share coherent systems, remember interventions and support an ending plus continued play |

A tentative content envelope is 8 flagship operations plus 16 smaller opportunities, 24 recurring
occupation graphs and the existing campaign/faction material woven through them. They are already
specified in the JSON and story documents. This is a scope estimate, not 24 implemented quests or
a promised number of hours. Do not assign playtime until measured on normal traversal and ordinary
input; empty travel is not depth.

### External design precedents used narrowly

Ubisoft's own account of *The Division 2* describes resource needs generating journeys from
control points and clashes that can occur without player intervention. That supports the design
choice of activity with sources, destinations and competing needs; it does not prove any particular
SpaceFace implementation or establish a performance budget. [Ubisoft development article](https://www.ubisoft.com/en-us/game/the-division/the-division-2/news-updates/74lAgK3TFbHYVoZrTtxqn2/intelligence-annex-the-living-world-in-the-division-2).

Blizzard's housing design article explains concentrating effort in a small number of distinctive
neighborhood zones. The relevant lesson for this single-player game is the production tradeoff
between breadth and place quality; its MMO social-density rationale does not transfer unchanged.
[Blizzard design article](https://news.blizzard.com/en-gb/article/24176592/building-in-azeroth-a-first-look-at-housing).

These are primary developer sources, read 2026-10-27. No paid conference recording was viewed and
no inaccessible talk is claimed as evidence. The creative proposals in this pack are ours.

## 5. Existing plans, conflicts and adoption

The new work extends build-map §23's CV-DAY/CV-MOTION/CV-QUIET and physical-place campaigns,
§31's world-convergence work, §34/THE WEIGHT, and the existing WORLD/LONG GAME/PICTURE lanes.
It is not authorization to recreate already-landed mechanics. Packet authors must start with the
actual source owner, preserve good behavior, and implement the missing district outcome.

Three conflicts require explicit treatment:

* **Fatalistic outcome policy:** older prose and §34 rows 522/536 constrain all endings to unchanged
  Pit air. The latest user permits story changes and asks for honest reactivity. The new plan keeps
  irreversible historical harm but permits successful local relief, prevented death, improved living
  conditions and materially different continued play. Narrative implementation must reconcile
  readers and ending projections without silently reusing old save fields with new meanings.
* **The Cathedral:** the expansion bible calls it an ore-hollowed rock; source also contains a saved
  Wreck Cathedral worksite. The new rock is a neighboring structure. Existing grave/workfleet identity
  is preserved. Art must not cover or replace a saved object just because the names resemble each other.
* **The Iron Maw:** boss-source fiction and dreadnought fiction differ. Proposed resolution: an
  accreted industrial hull surrounds the dead Deep-Mother. Its old chamber, vault and death state
  survive. The new surface is not an excuse to respawn an old boss or collapse saved aftermath.

Open PR [#638](https://github.com/coldshalamov/SpaceFace/pull/638) contains strategic-chaos authoring
foundations. Open PR [#637](https://github.com/coldshalamov/SpaceFace/pull/637) contains opening-route
work. They were inspected as unmerged related efforts. This PR does not merge, absorb or depend on
their branches. If they land, re-read the changed owners and use their resulting source as the next
base. Their existence is not a completion claim for anything in this pack.

## 6. What to refuse

Refuse a new landmark that is only a map label; a city that is random kit scatter; a citizen whose
whole life is an orbit; a garrison that refills every visit; a vehicle reward that clones the vehicle;
a mission that pays because a fabricated event was emitted; an interior with an invisible sphere
blocking its entrance; an ecological consequence with no collision or job reader; a supposedly huge
object with no traversable local detail; and a world that forgets what happened as soon as the pilot
crosses a loading boundary.

Also refuse the opposite excess: simulating every unseen citizen at 60 Hz, building full walking
cities before ship-scale districts work, pursuing astrophysical scale at the expense of navigation,
or turning every conversation into another log pane. The target is readable, playable life.
