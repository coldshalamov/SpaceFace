<!-- LIFETIME: STABLE -->
# THE WEIGHT — the SpaceFace expansion bible (2026-10-21)

**What this is.** The creative plan for turning the SpaceFace that exists today into a complete,
modern, A-list game. It covers the world, the factions, the peoples, the creatures, the machines,
the 25 sectors, every asset family the game still needs, the campaign script, the mission and
encounter library, and the systems and polish a game of that class carries.

The owner asked for it in these words (2026-10-21):

> *"I need units and enemies and NPCs and objects, assets of all types … characters, factions,
> sectors, races, aliens, materials, technology … the missions and encounters and overall script
> of the game … all the game systems and polish … meticulously fretted over … I need you to supply
> the taste."*

It was written after reading the repo's canon in full. That canon is the worldbuilding folder, the
canonical factions and voice, THE-STORYLINE, the creative-direction rulings R1–R15, the alien-ecology
canon, every machine-person file, the sector way-of-life table and the runtime catalogs. It was also
written after measuring the live game (`build_map.md` §33.0).

**Where the work goes.** Work derived from this bible lives in two places:

- **The complex tasks** are rows **498–549** in [`build_map.md` §34](../../build_map.md).
- **The small, exact tasks** are the **EXP** section of
  [`design/program/INFERENCE_IDEAS.md`](../program/INFERENCE_IDEAS.md).

## Authority

- **Product emphasis** comes from `design/VISION.md`, the owner's words, and that wins. This bible
  works *under* VISION and the owner's 2026-10-21 direction: swarm play, physics as the main weapon,
  and Katamari-style growth (`build_map.md` §33).
- **Story facts stay canon.** The rulings R1–R15 in `docs/worldbuilding/CREATIVE-DIRECTION.md`, the
  protected lines and the five endings are not changed here.
- **Where this bible adds canon**, it says **PROPOSED CANON**. The narrative lane adopts it into
  the sheets, or rejects it in one sentence. The five factions that R10 left open (Understory,
  Fulfillment, Archive, Pitborn, Verge-Layers) and the Free Frontier get their full canon here,
  marked PROPOSED CANON.
- **Live code decides what is true today.** Every "exists" in this bible was checked against the
  repo on 2026-10-21. Every "build" is future work with a row or a line.

## The game in one breath

> You fly a cheap, haunted tug through a solar system that lies about everything on paper. Your one
> honest instrument is the Line, a precursor-grade mass tether that reads the true weight of
> whatever it holds. Swarms of fungal Bloom, pirate packs and paperwork fleets pour through rock
> fields that are all ammunition. You grab, swing, fling and smash. Every tonne you move is logged,
> and the more weight you have honestly moved, the heavier the things you can move next. You start
> by throwing pebbles at mites. You finish by hauling a derelict dreadnought through a Bloom tide.
> The world keeps the receipt for everything you broke.

## The six laws of this bible

Every asset, mission and system below must pass all six.

1. **The Line never lies.** The world's documents are correct and wrong. Physics is the one honest
   ledger. The player's power fantasy is weighing the world and throwing it back. This one idea
   bridges the canon thesis (*"the paperwork was correct, and the air is still gone"*) to the play
   fantasy (*"I understand how this world moves, and I can use that to do ridiculous things"*).
2. **Heavy is honest.** Progression is measured in true mass moved: *Tonnage Logged*. It is never
   measured in damage percentages. Katamari's grammar applies: what you can move grows, and the
   arena grows with you.
3. **Deadpan ledger, loud physics.** The voice is the canon's flat, bureaucratic deadpan. The picture
   and the motion are bright, kinetic arcade. The comedy is the collision between them: a
   clerk-voiced kill feed narrating physical slapstick. The canon's comedy law still governs where
   jokes may live.
4. **Connection is the catastrophe.** The Bloom is a fungus that couples nervous systems. Its swarms
   coordinate brilliantly and break all at once. Their pathologies (panic cascades, grief loops) are
   the player's openings. The bureaucracy is the same disease in paper. The subtext is never stated.
5. **Nothing is scenery.** Every rock, wreck, container, pod, buoy and station module on the play
   plane is either ammunition, terrain, or a job. Non-interactive dressing lives in the far layer
   (VISION: "the closer the player gets, the more truthful the world becomes").
6. **The world keeps the receipt.** Every big physical act leaves something that persists and that
   something else reads: a wreck, a scar, a garden, a grudge, a price, a rumour. "Recorded but not
   felt" is a defect (`build_map.md` §31.0 fault 1).

## The verdict on assets: enough in count, wrong in distribution

Measured 2026-10-21 (the runtime model census and catalogs):

| Family | Have | The real gap |
|---|---|---|
| Player hulls | 15, one per role | No choice *within* a role. Factions borrow these bodies |
| Enemy hulls | 26 | 11 are one-off bosses or set pieces. The everyday roster is about 13, mostly Reach-shaped |
| Faction identity hulls | 8 (Span / Wasp / Cradle / Rig kits) | Nine factions have **no body of their own**. Understory, Fulfillment, Archive, Pitborn, Verge-Layers, Helix, Vael, Quiet and Free all fly recoloured player hulls |
| Traffic hulls | 18 | Fine. Under-used on screen |
| Stations | 7 generic archetypes | Shared across 14 factions and 25 sectors. No faction station kits |
| Hand-made rocks | 5 | The game's ammunition is rock. There are no material families and no Katamari size ladder |
| Wrecks and debris | 43 pieces | Good kit. Not enough whole-hull wrecks per faction |
| Bloom fauna bodies | 2 (brood queen, brood tendril); mites, spitters, chargers and leechers are procedural bodies | Swarm families stop at 26 t of mass. Nothing for the Katamari mid and late tiers |
| Precursor machines | 14 kinds, 17 site types in data | Mostly data. Few authored bodies |
| Named characters and set pieces | About 35 authored one-offs (Morrow, Vesper, Bracket, Ravel, Rubric, Ruckus, Solstice, the Blind Welder, the Eighth Bell, the Runaway Kiln and more) | Plenty. They are short stories with no novel tying them to the campaign or to the sectors |

So: **do not commission content to fix the feel** (§33). Do commission content where the
distribution is broken: faction bodies, faction stations, the rock and throwable ladder, Bloom tiers,
and the precursor bodies. [`05_ASSET_ROSTER.md`](05_ASSET_ROSTER.md) gives each one a priority and a
reuse source.

## Reading order

| File | Read it when you are… |
|---|---|
| [`01_TONE_AND_WORLD.md`](01_TONE_AND_WORLD.md) | writing anything a player reads or sees; you need the history, the map, the voice and the look |
| [`02_FACTIONS.md`](02_FACTIONS.md) | touching any faction: ships, AI behaviour, encounters, voice, stations, rep |
| [`03_PEOPLES_CREATURES_MACHINES.md`](03_PEOPLES_CREATURES_MACHINES.md) | working on the Bloom swarm, fauna, precursor machines, human cultures, or the machine-person cast |
| [`04_SECTORS.md`](04_SECTORS.md) | building or dressing any of the 25 sectors, arenas, landmarks or hazards |
| [`05_ASSET_ROSTER.md`](05_ASSET_ROSTER.md) | making any model, material, VFX family, icon, portrait, module or commodity |
| [`06_CAMPAIGN_SCRIPT.md`](06_CAMPAIGN_SCRIPT.md) | working on the story route, Books 0–7, side arcs, endings or post-game |
| [`07_MISSIONS_AND_ENCOUNTERS.md`](07_MISSIONS_AND_ENCOUNTERS.md) | authoring missions, encounters, swarm waves, bosses or world events |
| [`08_SYSTEMS_AND_POLISH.md`](08_SYSTEMS_AND_POLISH.md) | building progression, economy, AI, camera, HUD, VFX, onboarding, performance, or the polish pass |

## How an agent uses this bible

1. Find your area in the table above and read that file's section, not the whole bible.
2. Your work item is the `build_map.md` §34 row or the INFERENCE EXP line. This bible is the *taste*
   that row points to. The row's done-when is the bar.
3. Reuse before you build. Every asset entry names a reuse source (an existing GLB, data row or
   system) where one exists. `build_map.md` §26 still applies: no new hull while a shelf body can
   fill the slot.
4. Physical first. If an idea works only as text, a menu or a number, it is the wrong idea for this
   game. Change the mechanism and keep the feeling.
5. **PROPOSED CANON** is not law until the narrative lane folds it into `docs/worldbuilding/`. Build
   against it anyway, because the owner delegated the taste. If the narrative lane rejects a line,
   the rejection says what replaces it.
