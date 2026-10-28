<!-- LIFETIME: ACTIVE_PACKET -->
# THE OPEN REACH — places people live in

**Owner request: 2026-10-27. Source audit: master `42d57a248209c9f5a7354e65817c0f7b8f5dbcec`.**

Integrated on master `985cb3108552af0af785afaa41730122eaefd902`; see the source audit's update
for the preserved Eris Sweep Window and Gravedigger work.

SpaceFace should let a pilot recognize a place, understand what its people are doing, find a way
to interfere, and return to a consequence. This package turns that request into a connected world
design, actual stories, authored district specifications and bounded implementation commissions.
It develops **THE WEIGHT** rather than creating a second universe or replacing the game's physics.

## What this change delivers

**Delivered here:** a source audit; eight fully specified flagship districts; 24 machine-readable
occupation routines and 24 opportunities; a campaign and local-story bible; environment, interior,
camera and model commissions; native-system contracts; implementation packets; and a working,
read-only authoring command that validates references and dependencies and prints complete briefs.

**Not delivered here:** the new districts running in the game, the new models, new garrison AI,
new camera transitions, or a completed campaign implementation. Existing systems named in this
pack are reuse seams, not evidence that the proposed experience already works. The source code
added by this change is authoring tooling; it does not change the default game route. Successful
validation means the specification is structurally consistent, not that the game is fun or finished.

The user explicitly prioritized the creative documents and asked for an agent handoff. This is
that seed package. Each future packet owns an integrated player outcome, including its presentation
and failure paths. Do not close a district by shipping only its catalog, its art, its tests or its lore.

## The design decision

**Build a small set of places with different spatial grammar and ordinary life before expanding
the number of things in space.** Source already contains 25 sectors, 118 named zones and 58 activity
pockets. Those are data counts, not a verdict on visible density. Another random spawn table cannot
turn them into neighborhoods.

The new unit of authorship is a district: a recognizable landmark, a shape you can navigate,
people with a job and a home, an institution with rules, a useful physical toy, and a change that
survives leaving. The existing sector/zone/anchor registries keep geographical authority. District
IDs in this package group design work; they do not register a second runtime map.

## The eight places

| Existing sector | Proposed district | What you encounter | What you can do there |
|---|---|---|---|
| Helios Prime | **Lantern Ward** | A harbor crescent around a memorial; lamp service, shift shuttles, working repairs | Restore a family's missing lamp, clear a traffic knot, borrow or steal a tow cradle |
| Dione Lane | **Niner Bastion** | Gate 3, a visible standing garrison, inspection aprons and restricted hangars | Study the watch, raid the base, steal **COUNTERSIGN**, a usable interdiction tender |
| Tethys Junction | **The Switchyard** | Freight trains through a town built in disused sidings; household services around the Split Station | Correct a physical delivery mistake, rescue or steal a shipment, use an impulse shunter |
| Ceres Belt | **The Cathedral** | A huge mined rock with nine mouths, occupied vaults, working cutters and a quarry bell | Fly inside, evacuate a crew, shore a passage, tow through alternative routes |
| Pallas Drift | **Widow's Run** | A wreck gauntlet concealing Quiet Berths, inhabited ferries and salvage crews | Smuggle under a funeral tow, recover a ram, steal or protect actual salvage |
| Charon Expanse | **Memorial Gardens** | An inhabited wreck garden where the Bloom both shelters and threatens | Prune routes, feed real wreck mass, rescue occupants, carry a Shepherd organ |
| Ashfall Reach | **The Iron Maw** | An enormous manufactured surface wrapped around a dead creature; trenches, batteries and inhabited keel | Fly over steel terrain, work a surface crane, dismantle a battery, preserve or evacuate a community |
| Phoebe Echo | **Fourth Toll** | A quiet refuge of repair tenders and resonators; one deliberate interval of silence | Rescue late crews, repair a signal, keep a chosen silence, earn a resonator tool |

Every row is a **planned composition over stable existing sector IDs**. They are not new replacement
sectors. The Cathedral retains the existing Wreck Cathedral site as a neighbor. The Iron Maw retains
the existing corpse, boss and vault identities rather than resurrecting or renaming saved objects.

## Reading order

| Need | File |
|---|---|
| What actually exists, what is missing, and how all the owner's concerns are handled | [01-SOURCE-AUDIT.md](01-SOURCE-AUDIT.md) |
| Original world, people, district stories, opening hour, campaign and endings | [02-WORLD-AND-STORY.md](02-WORLD-AND-STORY.md) |
| Which existing system owns each behavior; jobs, garrisons, custody, memory and failure | [03-SYSTEMS-AND-CONTRACTS.md](03-SYSTEMS-AND-CONTRACTS.md) |
| How places look and fly; megastructures, interiors, camera, model briefs and budgets | [04-SPACE-AND-ASSETS.md](04-SPACE-AND-ASSETS.md) |
| Work order, parallel lanes, integration and the quality bar | [05-IMPLEMENTATION-PROGRAM.md](05-IMPLEMENTATION-PROGRAM.md) |
| Direct prompt for a local implementation agent | [AGENT_PROMPT.md](AGENT_PROMPT.md) |
| Exact authored routines, resources, opportunities and acceptance cases | [districts.json](districts.json) |
| Dependencies and task-packet paths | [program.json](program.json) |
| What was actually checked in this PR | [EVIDENCE.md](EVIDENCE.md) |

The prose bible owns fiction and scene intent; `districts.json` owns the explicit routine and
opportunity specifications; native catalogs own existing IDs; `program.json` orders commissions.
If these disagree, resolve the discrepancy before coding. The command catches structural errors;
an agent still has to read and understand the scene.

## Use the executable brief

From the repository root:

```sh
node scripts/living-world.mjs --validate
node scripts/living-world.mjs --next
node scripts/living-world.mjs --district=district_dione_niner_bastion
node scripts/living-world.mjs --task=LW-01
node scripts/living-world.mjs --district=district_ceres_cathedral --json
node test/living-world-plan.test.mjs
```

The command is read-only. It does not reserve paths, launch an agent, infer completion, install
assets, change a save, or publish anything. `--next` reports dependency-ready **planned briefs**
within this package. Existing `build_map.md`, FINISH_LANES and current exact-path ownership still
coordinate implementation. This is a support pack for those surfaces, not a replacement scheduler.

## Creative latitude and commitments

The districts, named people, hooks and story in these documents are actual creative decisions, not
prompts asking future agents to invent the game from scratch. An implementation agent can improve
a mechanism when source evidence warrants it, but must preserve the player's promised experience
and update the affected brief. Do not exchange a physical heist for a menu purchase because it is
easier to verify. Do not exchange a working town for ten arbitrary orbital loops.

The owner's latest permission to change the story also allows a specific amendment to the older
fatalistic ending policy: a prevented death remains prevented, delivered relief remains delivered,
and a repaired neighborhood remains improved. The original harm at the Pit can remain irreversible
without making every future intervention meaningless. Existing save IDs, established facts and
protected dialogue are preserved unless the implementation packet explicitly migrates them.

**The town needs to be worth saving before the player decides whether to save it.**
