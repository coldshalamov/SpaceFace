<!-- LIFETIME: ACTIVE_PROGRAM -->
# The SpaceFace bible — the game, described in enough detail to build

*Creative direction (Claude, 2026-11-06), at the owner's request: "imagine the game and fill in the
blanks so other agents can build it, and know when they're finished and what the quality bar is."*

`../DIRECTION.md` says what the game *is*. This folder says what is *in* it — every place, enemy,
ship, power, arena and moment — in enough detail that an agent can build it without inventing the
taste, and knows exactly when it's done.

| File | What's in it | Who reads it |
|---|---|---|
| [`QUALITY.md`](./QUALITY.md) | the scoring rubrics (1 / 3 / 5 anchors) for flight feel, combat feel, reactions, places, ships, UI, VFX, audio, writing; the review procedure | everyone, before claiming done |
| [`MOMENTS.md`](./MOMENTS.md) | the 30 moments that define "finished", each with setup, systems it needs, how to capture it, and pass criteria | route walkers, every lane |
| [`VERBS.md`](./VERBS.md) | every player verb (Line, Pull, Shove, Pin, Bomb, Rig, Gyre, web, black hole, ram, boost, dash) with feel targets, timings, visuals, sounds and the combo matrix | SWARM F/S, CHAOS C1, SHIP, VFX/audio |
| [`SHIPS.md`](./SHIPS.md) | all 15 player-flyable hulls: fantasy, silhouette, handling targets, signature verb, sockets, kit, liveries, where you get it | SHIP lane, KIT lane, Forge |
| [`BESTIARY.md`](./BESTIARY.md) | every enemy and creature: look, size, colour, behaviour, power, tell, weakness, counter, sound, death; the bosses | SWARM F, CHAOS C2, KIT, assets |
| [`ARENAS.md`](./ARENAS.md) | the seven Swarm arenas (layout, hazards, gates, depots, wave-10/15 transformations) and the wave-recipe book | SWARM F/S |
| [`HOTSPOTS.md`](./HOTSPOTS.md) | the sixteen Hotspots as full dossiers: layout, crowd and routine, hazard, hero asset parts list, activities with rules, chaos chains, sound and light, done checklist | HOTSPOTS lane, KIT K7, CHAOS, WORLD |
| [`WORLD.md`](./WORLD.md) | the ten sectors' identities, the fourteen factions' visual and behavioural grammar, the shape of the Adventure journey, the voice of the world | WORLD lane, CHAOS C2, LOOK & SOUND |
| [`LOOK.md`](./LOOK.md) | luminous industrial: why it's dark-on-dark and the bloom looks cheap, value structure, tone mapping, energy-conserving bloom, HDR emissive authoring, light that lands, haze, golden frames | LIGHT lane, Lane 3 renderer, Lane 6 look |
| [`FEEL.md`](./FEEL.md) | the real-feel layer: mass cues, engines that work (redline shake, RCS, retro, ignition), strain, impacts, damage, camera and sound weight | FEEL lane, SWARM S, CHAOS, audio |
| [`ASSETS.md`](./ASSETS.md) | the asset refinery: hidden-geometry removal, joint cleanup, merge by material, trim sheets, LODs, textures, emissive/value/style passes, census | REFINERY lane, KIT, Lane 3 |
| [`ENGINE.md`](./ENGINE.md) | the target architecture: five threads (render worker), SoA sim core, frame budgets, hitch-proof policies, flight recorder, decision gates | master-plan Lanes 1–3, 7 |
| [`LANES.md`](./LANES.md) | prompts for the three bible lanes that had no owner: LIGHT, FEEL, REFINERY | you |

## How to use it

1. **Find your thing** in the matching file. If it's there, build *that*. If the bible and the code
   disagree on a fact (a name, a number), the code is the fact; the bible is the intent — build the
   intent on top of the fact and note the difference in your commit.
2. **Every entry is tagged:** **[EXISTS]** in code, deepen it; **[EXTEND]** exists in part, finish it;
   **[NEW]** build it. Numbers marked **≈** are starting targets to tune by feel; numbers without ≈ are
   bars.
3. **Done** for an entry = its checklist passes, its captures are taken on the ordinary route (Browser
   pane visible), and an independent reviewer scores it **≥ 4 on every relevant QUALITY.md rubric**.
4. **Fill gaps in the same voice.** If an entry is thin, write the missing detail into this bible
   first (a short commit), then build. The bible grows; it never goes stale silently.
5. **Taste rule of thumb:** when two choices both fit the text, pick the one that makes a better
   *moment* (MOMENTS.md) and reads more clearly from the top-down camera.

## The ten commandments (short version of everything)

1. Everything has mass; everything can be moved, broken or used.
2. Everything the player can do to something gets a visible, audible reaction.
3. The player's understanding is never messy, even when the world is.
4. A place with a job beats a beautiful empty place.
5. Fodder dies fast; heavies are terrain; bosses are puzzles you solve with physics.
6. Every enemy has one power you fear and one weakness you can see.
7. Every part you buy is visible on your ship and changes how it plays.
8. Words on screen are few, plain and short; the world explains itself.
9. Big means big *in the world* — debris, rings, light, smoke — never a white screen.
10. Finish one thing to the bar before starting the next.
