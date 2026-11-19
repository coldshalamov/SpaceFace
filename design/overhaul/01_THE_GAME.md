# 01 — The game, in one place

**Director, 2026-11-18.** This is what SpaceFace is, after the owner's 2026-11-18 description, with
`design/VISION.md` underneath it. Every other page in this folder serves this one. The owner's words
are kept verbatim in §9 so nobody has to reconstruct them from a summary.

## 1. The game in one paragraph

You fly one ship through a busy, physical, industrial universe, and **the fight is the game.** You
have guns, a rope, and five powers, and everything around you has mass: rocks, freight, wrecks,
machinery, enemies. A light ship on a rope whips around heavy things like a hummingbird; a heavy ship
on a rope drags light things behind it like a wrecking ball. A minigun shreds without moving anything;
a cannon wallops a fighter so hard it becomes a projectile. You can plough twenty-five asteroids into a
carrier, tie two pirates together, or punt an enemy into a black hole from across the screen. **Swarm**
is that fight at full volume, in an arena, in fifteen-minute runs where you specialise fast and start
over. **Adventure** is the same fight in a living world where you start as hired labour, become an
owner of working asteroids, and spend what they earn on the monstrous ship and weapons Swarm let you
borrow — then go and use them on the people who used to beat you.

## 2. Two maxima of one game

The owner's frame: Swarm and Adventure are "optimizations of two different maxima" of the same atom.

| | **Swarm — the Pit** | **Adventure — the Reach** |
|---|---|---|
| What it maximises | **Replay value.** Every run is a different build. | **Continuous value.** Every hour adds to something that stays. |
| Inspiration | Crimsonland, Black Ops Zombies, Hades' build variety | Freelancer, GTA Vice City's businesses, Mindustry's layout puzzle, Hitman's environmental kills |
| Session | 15–30 minutes, winnable at round 30 | 1–3 hours a sitting, 40+ to see it all |
| Pilot Tree | Filled in minutes; resets each run | Filled over tens of hours; permanent |
| Money | Scrap, earned by kills, spent on the floor mid-round | Credits, earned by labour then capital |
| Gear | Lent to you by the floor, the Crate and the Forge | Bought, salvaged, stolen, forged; yours forever |
| The world | A lit room with machinery, freight, traps and gates | Towns, lanes, factions, a war, your yard |
| What it gives the other | **The shop window**: everything used in a run appears in Adventure's catalogue with where to get it | **The reason**: your yard is raided by named Swarm rounds on your own ground |

**Same atom.** Flight, the rope, guns, powers, collisions, enemies, hit feedback and the camera are
identical code and identical numbers in both doors (doc README ruling 5, "one feel in both doors").
A difference between the doors in how the fight *feels* is a defect.

## 3. The seven laws of the fight

1. **Mass decides who moves.** Latch something heavier and you swing around it; latch something
   lighter and it swings around you; latch something equal and it is a tug-of-war. The rope never
   refuses (ruling R12).
2. **Every gun trades damage for kick.** Hoses shred and do not push; cannons push and do not shred;
   everything else sits between. Rocks take kick too — a cannon is also a cue (R5).
3. **The room is a weapon.** Rocks, freight, furnaces, crushers, pylons, gravity wells and planets kill
   what you send into them, and a kill by the room pays more than a kill by a bullet.
4. **Calm until you touch it.** The world's own actors fly competently and its loose matter rests; the
   chaos on screen is chaos you caused (R11).
5. **Readable at any density.** Fifty bodies on screen and the player still knows where they are, what
   is about to hurt them, and what they just did. Impact is felt on the thing that was hit, not by
   shaking the whole screen (R10).
6. **Every verb from minute one; the monsters are earned.** Base forms of every verb are there from the
   start; bends, heads, capstones, Forged guns and heavy hulls are earned (R7).
7. **Specialise or stay ordinary.** Points spread across the tree make a competent generalist; points
   poured into one branch unlock capstones that break its rules. That is where replay value lives.

## 4. Fighting styles — the branches players will name

A build is a sentence a player can say out loud. These are the six styles the Pilot Tree is built
around (`06_PROGRESSION_AND_ECONOMY.md` §2 has the nodes).

| Style | The fantasy in the player's words | Leans on |
|---|---|---|
| **Gunner** | "I just hose them. Nothing survives the stream." | Hose and Pew guns, heat rhythm, fire while moving, crits on exposed backs |
| **Bruiser** | "One shot and he's across the room, through his friends." | Thump and Needle guns, rock cue-shots, stun, knock-into-wall bonuses |
| **Rigger** | Light hull: "I orbit the big ones and they can't touch me." Heavy hull: "I drag them through the rocks." | The Line, heads, mass polarity, release timing, multi-line |
| **Conjurer** | "One press and the whole field moves." | The five powers and their bends: Avalanche, Leash, Implode, Sinker |
| **Juggernaut** | "I don't dodge. I'm the obstacle." | Heavy hulls, ram plates, armour, plough, collision immunity under a speed |
| **Ghost** | "They never saw which way it came from." | Cold drift, shadows, sabotage charges, ambush multipliers (Adventure-heavy; a small branch in Swarm) |

Plus **Industry** (Adventure only): mining, the rover, building, logistics. It never appears in Swarm.

Destination builds, for checking the tree delivers them (adapted from doc 11 §6):
*The Hummingbird* (Hitch · Hose · Rigger: orbit a heavy and pour fire), *The Wrecking Train* (Atlas ·
Chain head · twin line: drag three fighters through a rock field), *The Avalanche* (any · Rig:Plough ·
Shove:Avalanche: plough a field into a carrier), *The Pool Shark* (Hornet · Concussion · Bruiser:
bank rocks into packs), *The Black Hole* (Singularity Mortar · Pull:Implode · Bomb:Sinker), *The Bolas*
(Wasp · Coupler head: tie two together and leave), *The Snowplough* (Ironback · ram plate · Juggernaut),
*The Undertaker* (Ghost · Tumbler gun · gravity well: punt them into the dark from out of sight).

## 5. How the two doors feed each other

- **Swarm is the advertisement.** In a run you hold a dozen guns and three bends in twenty minutes.
  Everything you touched appears in Adventure's catalogue with its real name, its picture and one line
  about where to get it (`src/data/swarmCrossover.js` is the seam; extend it to every item).
- **Adventure is the payoff.** The same gun, ten hours later, is yours: it shows on your hull, it has
  your kill tally, and it changes how the open world treats you.
- **The yard is where they meet.** Your asteroid works attract raids; a raid is a named Swarm round
  fought on your ground with your lane, your traps and your turrets (doc 17 §6, kept).
- **Line Class is shared.** Tonnes moved in either door count.
- **The Pilot Tree is shared in shape, not in points.** The same branches and nodes; Swarm points live
  and die with a run; Adventure points stay.

## 6. The look, in one paragraph

**Industrial machinery pushed to arcade energy, lit like a real place.** Every glow has a source that
you can point at; light travels from it, is shaped by the geometry it passes, and lands on surfaces —
hulls, rock faces, deck plating — where it reveals form. There are surfaces below and around the fight
for that light to land on. Space is deep blue-black, never grey; each region has a sky you would
recognise in a screenshot; the key light is warm and the shadows are deep blue. Haze exists only where
there is air or dust, and it is cut by the things in front of the light. Effects are force made
visible — cones, sheets, rings, arcs, trails, debris — and switching them off leaves the bodies moving
exactly the same way. (`07_LOOK_AND_LIGHT.md`)

## 7. What it must never be

From VISION, still law: a normal space shooter with a grappling hook; an HP-bar dogfight; an X4-style
empire manager; a crafting treadmill; a loot-rarity ARPG; procedural places that play the same; a
dialogue RPG; an orbital simulator; disconnected minigames; a particle showcase over a boring event.

Added on 2026-11-18:

- **A web game.** No blurry blobs standing in for light, no flat radial halos, no billboard stickers
  pasted over 3D bodies, no paper-cutout ships, no dark-mode SaaS dashboards for menus. If a technique
  would not ship in a 2026 A-list game, it does not ship here (`memory: owner-bar-a-list`).
- **A seizure.** No camera that reacts to the room. No screen that is permanently shaking, flashing
  or covered in text.
- **Pinball.** No chain reactions the player did not start.
- **A spreadsheet.** No screen whose main content is a rate per minute, a list of 100 items, or a
  search box in an arcade shop.

## 8. The bar: "no lapse in quality that anyone would notice"

The owner's goal for when this plan is executed. Checkable form — **all at once**:

1. **The first ten seconds sell it.** From launch, the first picture is bright, specific and moving;
   the title is a lit place; nothing reads as a black screen, a loading bar over wireframes, or a
   developer prompt.
2. **The ten-second test passes anywhere** (doc 10 §2): in any ten seconds of ordinary play, something
   is thrown or knocked, something reacts, and a stranger can say what happened.
3. **Every screen passes a fresh-eyes look** by a reviewer who has not read the plan, at 1280×720 and
   on a phone: no clipped, overlapping, jargon or developer string; one obvious next action. The UI
   bench is a tool, not the verdict — it passed `station-shipworks` at 301d3fb074 while the picture shows
   text stacked over the hull diagram.
4. **Every effect, light and material would survive a side-by-side with the three reference frames**
   the owner gave (Fable's braziers on wet stone, Freelancer's emerald nebula and sunlit station, Dead
   Space's light shafts through the corridor ribs) — judged on whether light comes from a source and
   lands on a surface, not on whether it is realistic.
5. **Sixty frames a second** in Swarm round twenty and in crowded Helios on the owner's laptop, preset
   low; ten seconds or less to the title; five or less into a new run (doc 19).
6. **The density test passes**: at fifty bodies the player can find their ship in under a second, name
   what is about to hit them, and nothing the player did not start is exploding.
7. **The owner ticks the ten-minute card five out of five, three sessions running** (doc 18 §3).
8. **Nothing a player can reach is a stub.** Every button does what it says; every system shown is
   finished; anything unfinished is not reachable.

## 9. The owner's words, 2026-11-18 (verbatim)

Kept exactly as written, including typos, because paraphrase is how intent gets lost.

> well what I was hoping to do with this game is for the Swarm mode to really be the addictive
> slam-bang that everyone plays at first or most, like playing rounds of Black Ops Zombies, but the
> adventure mode in that game was technically the main game, But the idea in this game was that the
> combat would be so fun and physics based, in that you have guns but maybe the weaker ones don't
> knock enemies and things back much, like a pistol type weapon, but they do damage, and you can lay
> into enemies, maybe that's a strategy choice, like are you going to get the minigun which blasts
> tons of tiny bullets and soak them with constant damage but not knock them back visibly at all, or
> the cannon gun that wallops them and does some extreme damage but knocks them back so hard they
> become a weapon themselves, and it's free to blast at asteroids to knock them into enemies, there's
> powers you can buy (even though the VFX makes them feel shitty, it's really cheap) that like will
> bull doze stuff in front of you so you can fly around an asteroid field and then bull doze with this
> cone straight through it and now you're flying at the enemies and their station or carrier or
> whatever with 25 big-ass asteroids barreling towards them. Or you can flip around them with the
> tether and dodge enmmies, swinging around them while soaking them wh h shots, so that when you're
> small the tether makes you swing around THEM like a little misquito or hummingbird they can't hit,
> while maybe later you decide to play a huge ship that's way heavier, now the tether plays
> differently, now when you tether something and pull, YOU PULL THEM, now they're out of control
> swinging behind you and you're towing them dashing them on the rocks around you dragging them. So
> its largely a physics sandbox, with powers that make it fun, the combat is fast-paced and fun, and
> it is the primary method of gameplay, it's the combat. That's the center, that's why Swarm mode
> takes the instant dopamine of that to the highest level, give the players what they want for a
> quick game. But in that mode you advance quickly and you can spread out into different areas of the
> skill and equipment trees. You see, the combat is always the centerpiece, but how you choose to
> customize yourself in this game makes the same combat a very different experience, you fight with
> strategy, but the combination of game systems, as in life, make your options very unlimited. So in
> Swarm you can beat the levels and advance quickly, my main influence for this may be an indie game
> you might remember called Crimsonland from the early 2000s, it was a swarm shoot em up top down
> game, no physics, but the same chaotic fun. But since in this game the skill tree can be filled out
> and you can only have so much equipment at a time, you basically advance fast in the swarm mode but
> the only way to realluy get powerful is to pick a strategy and maximize it, you could spread all
> your points and credits across the tree but you'd be kind of weak, you'd have to really find your
> niche and maximize it, so even though it progresses quickly, it has replay value because the quick
> progress through the game customization systems makes the gameplay very different quickly. So Swarm
> mode is all about replay value, Adventure mode is all about continuous value, build up na dadvancing
> RPG-style. Same underlying system, same combat experiences and dogfighting, same atomic experience,
> but in this case you don't advance so quickly. This gives players a chance to see how fun the game
> can be and get amazed, and show them what the adventure mode holds, this fights the central problem
> of the adventure mode progressing too slowly, and since the advancement really changes the way you
> can play the game, much of the game is locked behind doors that don't open till way later, but
> imagine the exitement when a player uococks that badass weapon or ship that makes them a god in
> ADVENTURE MODE, not Swarm in a round with a million enemies comnng at you, adventure mode where
> you're really living in the world with this badass shit fucking things up intergalactically like
> GTA. So, since the progression system isn't this fast credits things from swarm rounds, you don't
> get free skill points every round or whatever, you have to grind. SO my idea in this adventure mode,
> that makes it more than just a spread-out swarm mode, is that in order to fight like you do in swarm
> with advanced shit, you have to build. Just like in GTA Vice City when you start buying and owning
> clubs and businesses and it's making you money you need, or assassins creed 2 and on, whree you have
> your own little city strategy game that makes you money you use for gear, ultimately people come for
> te combat, but having these related and interconnected games that allow them to advance makes it
> more fun and smart, it makes the smart gamers have something to enjoy here, it's more like eve. So
> how do you advance in adventure mode? Well probably there should be skill points and probably
> experience of some sort maybe, that's surely not built correctly, almost none of this is probably
> built correctly, but this is my vision and you can fill in the blanks to make a badass game. So in
> adventure mode, besides missions and experience or whatever, the economy is how you buy shit,
> obviously. So a lot of space games have you advance by buying spaceship parts, so you make money and
> buy parts, buy ships, buy one-use items or buffs or whatever etc. So how does a game like Freelancer
> handle this, for instance? Ok in freelancer you can kill ships and take some shit they drop, and you
> can sell it, and you can buy items at stations, and you can travel to other stations and sell it if
> it's priced higher, so you can become a trader. You can also be a pirate becuase you can kill things
> and steal. I was thinking that this would be the begining, like in real life, you hit gigs or steal
> or work. You get moeey for missions, you mine asteroids, sell the stuff, you maybe can refine or
> process the stuff if you have the skills and its worth more, these are all little mini systems like
> skill trees and evconomics that players are all familiar with how to operate, so it's not a learning
> curve except for the exact functions fo the things you buy and research. So you work to get money,
> that gets boring after a while, repetitive, so in order to really sport the badass shit you used in
> Swarm, you really need to work for it. So I was thinking that you'd progress naturally from labor to
> capital deployment. So you'd start building things, you can mine the asteroids by sending a rover
> down there, at first it's just a way to be more exact about what materials you're mining and cherry
> pick them, maybe your hull fills up with bullshit because every asteroid has more and less expensive
> things in it to mine and its randomized when you use the quick laser, no big deal when you don't even
> have the equipment or skills to mine anything but the basics anyways, so the rover and the laser are
> the same. But you quickly realize once you have the ability to mine 4 materials, that you want the
> deepest most expensive one, and you only get it 1/4 of the time when you use the laser, this will
> naturally phase the player out of using the laser and becoming more proficient in the mining
> minigame. This then will progress from cherry picking materials in the asteroid to building things
> inside them, then the materials in the asteroid take on a dual purpose, when you build something on
> or adjacent to a material block in the asteroid, it has persistent and permanent effects on whatever
> you build, so choosing to build by dirt has certain properties, building next to copper or silver or
> a gas pocket, maybe the generator has to be next to a gas pocket, and if you've mined the block then
> it's empty and it has no properties, so you'd want to mine the least, even dirt has some buff that
> helps or something, so the number of adjacent blocks that are x or y material, any material, matter
> in building. THis means that at first no big deal, but as you get advanced and you're trying to
> squeeze the most shit into one asteroid, you run out of space, and if you mine too many holes
> throughout it strip mining for materials like a noob, then you've diminished its capacity to build
> in. Asteroids you haven't built in should probably restore themselves to stock state after a while
> but not immediately, you don't want to depopulate every asteroid in the galaxy and have none left,
> that'd be stupid, but you want the player to have a feeling of persistence liek they're changing the
> world. So the physical layout of the asteroid becomes a type of strategy puzzle wherein the player is
> trying to maximize the production within it with factories and automated whatever, kind of like
> mindustry, if we can find a way to do that sort of thing that game does with the puzzle resource
> management thing but without as complex of a conveyer belt thing, I think it must matter what the
> playyer builds next to or it won't be as fun, I think some things would have to feed into other
> things to be more advanced or something, the things you build would have to comtimes have a way to
> interact, like in most strategy games "you can build an electric wall or gun tower but it has to be
> powered so you have to build a coal mine on a coal field and a belt to a power plant and power lines
> to the wall and towers etc" That sort of thing, where the more advanced structures take more
> strategy to build, prerequisites, continuous long value for continuous players. So the player,
> looking at the procedurally generated locations of the materials in this asteroid, then uses their
> experience and skill to calculate the best path through these blocks such that it preserves enough of
> the materials and gas and dirt to build what thety want, some things can only be build on dirt and
> adjacent to certain materials, meaning the procedurally generated landscape is a game board the
> player must learn to adapt to in order to optimize. So then the player gets tweaking on building in
> these asteroids, they learn how to balance bringing materials to build with, and mining the materials
> on the spot from the asteroid to build in the asteroid, if they have a small hull, that's how you
> work at first, and then you progress. Hell, maybe you can even bring materials with you, if you've
> depopulated the asteroid, and replenish a block with the material, so you can optimize it later, but
> it's a pain in the ass because you have to get the materials, Some materials come from asteroids or
> from stations sales, or have to be processed, or have to be bought like special reagents or tech or
> something, skills unlock these things so it's not confusing too much at any one time and gets more
> complex. The idea is to make the asteroids become little money makers and then getting droines to
> pick up from them and take to the station, maybe they have an x percent chance of getting pirated
> depnding on the danger of the area, but you can make security drones so you don't even have to
> replace the transport drones, now it's self sufficient, now you realize that you can set these things
> up just right and really optimize them to the point where it runs itself and never needs
> maintainance, so you move on, and you're stakcing money while you're doing it, and this is all in the
> service of combat and real action gameplay, because you're not just jacking off, you're trying to pay
> for those awesome guns you played with in the swarm mode, you're fighting these pirates and stuff in
> an actual ongoing war and stuff, there's factions and a story and you're immersed in it, so you want
> that fucking badass gun or power that you used in Swarm to kill these enemies that've been kicking
> your ass and forcing your to respawn, you know that there's a big black hole or a planet or something
> nearby them, so if you could just get that long-distance gravity blast laser thing that shoots pretty
> far away and doesn't do any damage but it sends them tumbling, triggering a satisfying animation
> wherein the enemies are tumbling like a Tie Fighter end over end adn they do get damage though when
> they smash into an object or crash into a black hole, so it's like Mortal Kombat trying to use the
> stage as a weapon, or like in Hitman Agent 47 you use the environment to solve the puzzle of how to
> accomplish the mission. Combat is often the mission, I thought it might be fun to introduce some
> stealth temporary mode where you can sneak around and do some rogue stuff too, it's all familiar
> advancement systems from other games that slowly unlock a lot of variations on basic parameters like
> damage and knock-back and speed and mass and area, and instead of overwhelming the player with a
> bazillion things at once, there's an advancement, but the customization UI in Swarm needs to
> basically make that system accessible too, the idea being advancement and having reletively limited
> set of decisions at any one point but advancing through rounds fast and splaying out into a branch of
> the customization tree quickly, so replay value until you get the hang of it, But it's also important
> to get the gameplay all the way tuned in so it really feels like i'm describing it. Does that make
> sense to you now? What the game is supposed to be? because I don't think it is supposed to be
> disconnected systems, they all seem like a coherent vision to me, the Swarm and Adventure are just
> optimizations of 2 different maxima

Earlier the same day, correcting the previous agent:

> Making screen shakes on events like a shot landing or shooting, considering how many swarms of tons
> of objects and enemies are in this game, it would just cause the whole screen to vioilently shake
> out of control all the time. The same thing was happening when agents made damage from bumping into
> things, but things float in this game so as soon as they spawn they'd float and NPCs didn't really
> know how to control the flight physics so they're constanytly crashing into each other and
> triggering chain reactions of pinball crashing and everything's exploding. THe way that all the game
> systems fit together seems to produce bad player experience all the time. I just want you to
> actually give me some good ideas and not try to plan out some things that are going to cause
> problems and be another regression, I'm trying to maintain a level of quality in this game

> I do think that the headlight and the lighting in general is a shit implementation, an agent did
> whatever blurry shit that is and I hate it, I've always said those cheapo implementations like bloom
> blur like that or billboard graphics or something are cheapo web game techniques and they suck, at
> least every implementation I've seen. light is supposed to look leke these imaged in games.

(The three reference frames — Fable's blue braziers on rain-wet stone stairs, Freelancer's sunlit
station before an emerald nebula, the Dead Space remake's light shaft through a corridor — are copied
to `design/overhaul/references/`.)

And to this director, the same evening:

> There's a ton of stuff in this repo that could be done, a lot of blanks that could be filled in, I
> want you to sit in the driver's seat and use your taste to try to plan out how we could better this
> game… When an agent is finished executing your plan, I should have the professional A-list game I
> want this to be with no lapse in quality that anyone would notice
