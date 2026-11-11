<!-- LIFETIME: ACTIVE_PROGRAM -->
> **HISTORY — not a source of work.** Superseded on 2026-11-11 by `design/program/fleet/QUEUE.md`
> (work) and `design/game/` (design). Read for background only; do not take tasks from this file.

# Creative direction — what SpaceFace is, and how we'll know it's done

*Written by Claude as creative director, 2026-11-06, at the owner's request: "take more control and
have more creativity in the creation of this game." The owner's own words remain the authority
(`design/VISION.md`); this document is how I read them, the decisions I've made from them, and
the bar every agent builds to. Where it says "I", that's the creative director speaking. Agents:
when you are unsure whether something is right, ask what this document would say.*

---

## 1. The game I see

Picture this from above. A bright little ship drops out of a jump lane into a busy industrial
system. Below it, a mining rig the size of a city block is chewing an asteroid apart, haulers
queue for the ore, a police cutter is pulling someone over, two pirates are circling a stalled
tanker. The player fires a rope into a rock, whips around it, lets go, and slingshots straight
through the pirates' formation. One spins into the tanker. The tanker vents fuel. The player drops
a gravity mine into the venting cloud, ignites it, and rides the shockwave out of the system with
the police in pursuit and a hold full of somebody else's ore.

That is SpaceFace. Not a space sim and not a shooter. **A physics toy box the size of a solar
system**, with the open-world freedom of Freelancer, the scale of EVE, the "everything reacts"
density of GTA and the snowballing joy of Katamari. Every object has mass. Every actor has a job
and a temper. The player's verbs (rope, gravity, ram, web, bomb, shoot) combine into stunts nobody
designed.

The reason I'm excited about it: nobody has made this. Top-down space games are either spreadsheet
empires or twin-stick shooters. A *physical* top-down space world, where the fun is cause and
effect, is an empty niche with an obvious hook — you can explain it in one GIF.

It has two faces:

- **SWARM** is the arcade heart: Black Ops Zombies meets Mindustry meets a demolition derby. Waves of
  enemies with distinct powers pour out of visible gates; the arena is your weapon and your hazard;
  you buy upgrades with what you kill; "how far can you get?". This is where the fun is purest and
  where we prove the physics is a game.
- **ADVENTURE** is the open world: fly anywhere, come upon big places where something is happening,
  do jobs (race, steal, hunt, haul, wreck, rescue), cause chaos, get chased, get rich, build your
  ship. Freelancer's freedom, GTA's reactions.

Both share one ship, one set of verbs, one feel.

## 2. Three ways to fly (the identity of a build)

Every ship and every build leans toward one of three fantasies. Agents designing ships, parts,
upgrades or encounters should know which one they're serving.

| Fantasy | The feel | Signature verbs | References in your head |
|---|---|---|---|
| **The Skater** | small, fast, flips around rocks on a rope, never touches the ground | the Line (swing, slingshot, whip), boost-drift, dash | Spider-Man's web-swinging, Tony Hawk, F-Zero |
| **The Juggernaut** | huge, heavy, barrels through everything like a tank | ram, plow, tow, shoulder | Burnout takedowns, GTA's tank, Katamari's late game |
| **The Conjurer** | mid-size, controls the battlefield | gravity wells, black holes, webs, mines, AoE detonations | Just Cause's toys, a League mage's combo, Magicka |

The best moments mix them: the Skater webs three pirates together and slings a rock into the knot;
the Juggernaut drags a black hole behind it; the Conjurer tows a fuel tanker into a pirate nest.

**Decisions:**
- Starter hulls cover all three (Hitch = Skater, Pelican/Hawser line = Juggernaut-lite, Wasp/Hornet =
  Conjurer-lite). The heavy end (Ironback, Atlas, Colossus, Leviathan) is the Juggernaut ladder and
  is reachable in a normal campaign.
- Chase camera (stern view, the Velocity program) is a first-class way to play, especially the
  Juggernaut and racing. Top-down remains the default for reading the battlefield.
- The ship sheet (master plan P1) labels a build with its fantasy, not just stats.

## 3. The moments list — how we know it's done

"Feels mature" has no finish line, so here is mine. **The game is done when a player can have these
moments naturally, without a script steering them there.** Every one needs a capture of it
happening in ordinary play, reviewed by a second agent. Each program and lane owns some; the list
lives in `design/program/finish/MOMENTS.md` (to be created by Q2 route walkers, one row per moment
with its owner and capture).

**Movement and verbs**
1. Swing around a rock on the Line at full speed and let go into a perfect slingshot.
2. Tow a loose cargo pod away while being shot at, and have its weight change how you fly.
3. Web three enemies together and blow the knot up with one shot.
4. Drop a gravity well and watch debris, shots and enemies curve into it.
5. Ram a smaller ship in a heavy hull and watch it crumple and spin away.
6. Plow through a docking queue in the chase camera and send ships flying like bowling pins.
7. Throw an enemy into another enemy and kill both.

**The world reacts**
8. Clip a shuttle and have it lean on its horn, swear at you, and follow you.
9. Start a fight near a station and watch civilians scatter in a panic.
10. Spill a freighter's cargo and see scavengers arrive within seconds and fight over it.
11. Lure a pirate into a patrol and watch them go to war with each other.
12. Get seen, chase down the witness before they reach the police, and get away clean.
13. Climb from one star of heat to five and see a new kind of pursuer arrive at each step.
14. Lose the police by breaking line of sight in an asteroid field.
15. Hijack a freighter mid-flight and fly away in it.
16. Come back to a station you wrecked and see the damage — and the repair crew.

**Places and missions**
17. Arrive at a big place where something huge is happening (a city-sized mining rig, a shipbreaker
    tearing apart a capital ship, a race thundering through a ring) and immediately want to mess with it.
18. Finish a mission in a way the designer didn't plan.
19. Fail a mission and have it turn into a different, better situation.
20. Win a race through live traffic by shortcutting through a gap you shouldn't fit.
21. Pull off a heist that goes loud and becomes an escape.
22. Hunt a bounty who uses the terrain against you.

**Swarm**
23. See a new enemy type debut alone and learn what it does.
24. Turn the arena's machinery against the horde (lure them into the crusher).
25. Clear a screen-filling tide with one well-placed combo and feel the slow-mo.
26. Make a desperate run to the in-arena depot mid-wave to buy a weapon you need (see §4).
27. Beat the first boss by throwing its own armour back at it.
28. Reach a new personal best and want to go again immediately.

**Your ship**
29. Look at your ship and understand exactly what it's good at.
30. Buy a part and see the difference on the hull and in how it flies.

**A ten-minute test:** any 10 minutes of ordinary Adventure play near civilisation should produce at
least 3 of moments 1–17 without the player trying. Any 10 minutes of Swarm should produce at least
5 of 1–7 and 23–28.

## 4. SWARM — my decisions

The SWARM program (`swarm/`) is in flight and is right. These are additions, to land after its
S-plans (written as S17–S19 in `swarm/PLANS.md`).

**The depot is in the arena (the Zombies wall-buy).** In Zombies the shop is not a menu between
rounds, it's in the map: you run to it under pressure. So: each arena has **2–3 physical depots**
(lit pads with a holographic sign). Fly onto one mid-wave to buy from its small, fixed selection
with the points you've earned (a depot that sells webs, one that sells heavy guns, one that
repairs). Buying takes 1.5 s of standing still — that's the risk. The pick-one-of-three between
waves stays as the breather. This is how "the store comes up on a timer" without stopping play.

**Waves are recipes, with names.** A wave = an enemy mix × a terrain event × a modifier. Name them so
players talk about them: *"The Dart Rush"*, *"Spitter Rain"*, *"The Warden Wall"*, *"Blackout"* (the
lights go out, enemies glow), *"Hold the Line"* (survive a 60 s timer, kill count irrelevant),
*"Gravity Storm"* (random wells pulse across the arena). Mindustry-style: enemies stream from
**visible gates along visible lanes**, so you can read where pressure comes from and build Fortify
pieces across it.

**The arena changes as you climb.** Wave 5 boss. Wave 10: the arena transforms — the Foundry's
crusher wakes up, the Mill's grinders start turning, the Hive's sacs burst. Wave 15: a second boss
plus a new hazard. "How far can you get" means the place itself escalates, not just the numbers.

**Every enemy has a power and a weakness you can see.** (Swarm S7's character sheet.) The
weakness is always physical: the Bruiser can't be thrown but dies to things thrown *into* it; the
Warden's bubble pops if you kill the Warden; the Dart explodes, so throw it.

## 5. ADVENTURE — my decisions

**Open like Freelancer/EVE, dense where it matters.** Space between places is open and fast (lanes,
boosts, a few random encounters — master plan W1 and CHAOS CH-42). Then you **come upon a place
where something big is happening**. Those places are the game.

**The world today is a quiet museum.** I counted 40 authored places; almost all are ruins and
mysteries: "Quiet Dock", "Empty Habitat", "Ossuary", "Sterile Zone", "Preserved Cockpit". Lovely for
discovery, but a world of empty places can't produce GTA. **Keep the ruins as the discovery layer;
build a new layer of loud, working places.** That is the biggest single change I'd make to the
game's mood.

**The Hotspots** — sixteen big working places, two or three per sector, each with a job going on,
a crowd, a hazard, a hero asset and things to do. Specs in §7. Each is a level, a playground and a
landmark at once.

**Experience types** (each Hotspot hosts some; master plan W2 picks the forty best missions):
races (through traffic, through rings, through a collapsing structure), heists (quiet or loud),
bounties (the target uses the terrain), smuggling (scans and chases), demolition (bring something
down), salvage rush (first to the wreck), towing and repo, escort (the convoy is a physics problem),
rescue (pods drifting into a hazard), sieges (defend a place in Swarm style — the bridge between the
two modes), gladiator pits (an Adventure doorway into Swarm), storm runs (cross a hazard before it
closes).

**One-time hero assets.** Some things happen once, and are built once, with full care: a capital
ship being torn apart at the shipbreaker; a space leviathan creature passing through a lane; a
station that collapses during a story beat and stays collapsed; a jump gate that misfires; a comet
that sweeps through a mining field. These are what players remember and tell friends about.

## 6. Honest analysis — where we really are

**Strengths that are real:** the physics verbs (the Line, fields, impulse, Brood) are deeper than
anything comparable; the world simulation is deep; the menus are professional; the ships look good.

**What's holding it back:**
1. It doesn't run smoothly (master plan engine lanes are on it).
2. Too much breadth, too little finish: ~380 systems, 428 data files, 40 places, 370 encounters,
   and almost none of it at a bar a stranger would call professional. **The disease is starting the
   next thing before finishing this one.**
3. The world is quiet and the places are empty (§5).
4. Assets are lopsided: ~1,650 ship model files but 6 place models and 4 characters. **Yes, we need
   two to three times the assets — but not more ships. We need places, crowds, breakables and hero
   set pieces** (§8).
5. Nothing tells agents when to stop. The moments list (§3), the reaction matrix (CHAOS §3) and the
   Hotspot checklist (§7) are the answer.

**My rule for growth: one place perfect before ten places okay.** Helios Prime and Swarm reach the
moments list first. Only then the next sector. Every agent should be able to point at Helios and
say "that's the bar".

## 7. The Hotspots (specs)

Each Hotspot has: **the job** (what's happening when you arrive), **the crowd** (who's there doing
what), **the hazard** (friend and foe), **the hero asset**, **things to do**, and **what you can
wreck**. A Hotspot is done when an agent arriving cold can have at least three moments from §3
there within five minutes, captured.

| # | Sector | Hotspot | The job / what's happening | Hero asset | Things to do |
|---|---|---|---|---|---|
| 1 | Helios | **The Big Dig** | a city-sized mining rig carves a giant asteroid; ore pods stream to a hauler queue | the rig: rotating cutter heads, conveyor arms, ore chutes | rob the queue, race the conveyor, sabotage the cutter, defend the rig from raiders |
| 2 | Helios | **Helios Station rush hour** | the main station's docking lanes at peak: queues, police checks, taxis | layered docking arms, a traffic-control tower with lights | taxi jobs, smuggling past the scan, domino the queue, chase at the docks |
| 3 | Helios | **The Ring Circuit** | an amateur race league runs laps through an old ring structure; crowds of spectator ships | the ring with lit gates and a scoreboard | race, sabotage racers, bet, crash the finale |
| 4 | Ceres | **The Shipbreaker** | a yard is tearing apart a capital ship with cutters and tugs | the half-dismantled capital ship (one-time) | steal parts as they come loose, salvage rush, tow jobs, bring the hulk down |
| 5 | Ceres | **The Throughline** | the belt's freight highway: convoys in both directions | gantry beacons, a toll station | convoy heists, escort, toll evasion, highway chases |
| 6 | Tethys | **Junction Market** | a free market of docked ships lashed together, haggling, fights | the lashed-together market raft | smuggling, fence, bar brawl spill-over, cut the lashings |
| 7 | Tethys | **The Split Station** | a station torn in half years ago, now a gang's turf | the two halves with a debris river between | gang war, rescue, heist the vault in the debris |
| 8 | Vesta | **The Forge** | a foundry station pours molten metal; heat lanes, crane arms | crucible arms pouring glowing slag | demolition, heat-lane races, throw enemies into the pour |
| 9 | Vesta | **Red Cable Yard** | a cable-laying operation strings giant cables between rocks | the cables (tight ropes you can grapple and snap) | Line playground, sabotage, rescue a snapped crew |
| 10 | Pallas | **The Drift Derby** | a demolition derby league in a reef of bouncy debris (Reef Pinball physics) | the derby bowl with stands | demolition derby, betting, Juggernaut showcase |
| 11 | Io | **The Shepherd's Ring** | a moonlet shepherding operation pushes rocks into orbit with tugs | giant tugs and a herd of rocks | herd or stampede the rocks, tow races, pirate ambush |
| 12 | Charon | **The Hull Garden** | scavenger families harvest a field of old wrecks | wreck field with living lights | salvage rush, bounty hunts, wreck-diving |
| 13 | Sker Haven | **The Pirate Citadel** | a fortified pirate base built into an asteroid | the citadel gate and its guns | infiltrate, siege, join them, free prisoners |
| 14 | Veil | **The Lighthouse** | a beacon station guides ships through a nebula storm | the beacon and its storm wall | storm runs, rescue, turn off the light (chaos) |
| 15 | Ashfall | **The Towed Moonlet** | a convoy is towing a whole moonlet across the system | the moonlet and its tug armada (one-time event) | cut a tow line and watch it drift into a station, defend or hijack the tow |
| 16 | Ashfall | **The Gladiator Pit** | a Swarm arena inside the Adventure world; crowds watch | the pit and its gates | enter Swarm from Adventure; bet on others |

Existing places stay: the quiet ruins are where you go to explore; the Hotspots are where you go to
play. Where an existing zone fits a Hotspot (`zone_ceres_throughline`, `zone_tethys_split_station`,
`zone_vesta_red_cable_yard`, `zone_charon_hull_garden`, `zone_io_shepherds_ring`,
`zone_ashfall_towed_moonlet`), **build the Hotspot on it** rather than beside it.

## 8. The asset plan (what "double or triple" means)

Priorities, in order, all through the Forge/Blender route and judged by image review against the
art direction (master plan X1):

| Kind | Today (rough) | Need | Why |
|---|---|---|---|
| Hotspot hero sets | 6 place models | 16 Hotspots × 1 hero set + 3–6 parts each | the places are the game |
| Breakable station modules | few | 12–15 module types (arms, tanks, solar wings, racks, antennae, lights) × 2–3 styles | CHAOS CH-03 |
| Crowd ships | many hulls, few roles visible | civilian shuttles, taxis, tugs, haulers with visible loads, police, racers, spectators — every role readable | the reaction matrix needs actors |
| Swarm enemy silhouettes | one template | 16 distinct silhouettes + Brood families readable | Swarm S7 |
| One-time hero events | none | 5–8 (capital teardown, leviathan pass, station collapse, gate misfire, comet sweep, moonlet tow) | memories |
| Arena kits | partial | 7 Swarm arenas fully dressed + their wave-10 transformations | Swarm S9, §4 |
| Characters | 4 | portraits/voices for ~20 named contacts + generic pilot voices | the world talks |
| Props | voxel crates | containers, pods, ore, debris families in the art direction | consistency |

Rule: **every asset has a job.** If it can't be wrecked, used, ridden, stolen, or tell you something,
it isn't a priority.

## 9. How every agent should work on this game

- **Know which fantasy you're serving** (§2) and **which moments you're enabling** (§3).
- **Build depth, not breadth:** finish the place, the enemy, the mission to the bar before starting
  the next.
- **Make it react:** if the player can do something to it, it should respond (CHAOS §3).
- **Make it readable:** the world can be messy, the player's understanding can't.
- **Make it loud and alive:** a place with a job beats a beautiful empty place.
- **Stop when the moment happens in a capture**, not when the tests pass.

## 10. The Hotspots lane prompt

```text
You are the HOTSPOTS lane of SpaceFace — building the big, loud, working places of the open world.
Repository: C:\Users\93rob\Documents\GitHub\SpaceFace (Windows 11, Git Bash + PowerShell, branch
master, ONE shared checkout other agents edit at the same time).

READ FIRST, ALL OF EACH: design/program/finish/DIRECTION.md (the creative direction — §1, §3 the
moments, §5, §7 the Hotspot specs, §8 assets, §9); design/VISION.md; design/program/finish/chaos/
README.md and IDEAS.md (the reaction matrix and units your places will host);
design/program/finish/MASTER_PLAN.md Part 0; design/program/finish/MASTER_LANES.md (who owns what);
docs/visual-assets/README.md (the Forge route); AGENTS.md; design/program/NOW.md. Then the owners:
src/data/authoredPlaces.js (40 zones — build on the matching ones), sector data, traffic and NPC job
owners, station shell, encounter director.

YOUR JOB: build the sixteen Hotspots in DIRECTION.md §7, **Helios first (1, 2, 3), to the full bar,
before any other sector.** For each Hotspot: (1) write a one-page spec in
design/program/finish/hotspots/<id>.md — the job, the crowd, the hazard, the hero asset, things to
do, what you can wreck, which moments from §3 it enables, how GTA/Freelancer/EVE would make it feel
(from what you know); (2) request its assets from master Lane 6 (X2) via NOW.md, or build them
through the Forge route yourself if that lane agrees; (3) place it in the world with its working
crowd (NPC jobs, traffic, queues), its hazard and its breakables (CHAOS lane C1 owns breakable
rules — use them), its activities (CHAOS lane C3 / master Lane 5 own activity and mission systems —
host them); (4) walk it.

DONE FOR A HOTSPOT: an agent arriving cold has at least three §3 moments there within five minutes,
captured on the ordinary route with the Browser pane VISIBLE, reviewed by an independent agent
against DIRECTION.md §9; it reads as its place in one screenshot without labels; life count ≥ 4
events per 10 s around it.

RULES: build on existing zones where they match; reuse existing owners (no parallel traffic, job or
mission systems); every asset has a job; depth before breadth. Before any edit, write the Hotspot's
spec (step 1). Determinism references versioned, never overwritten; no per-frame cost without a
matched laptop before/after. Shared checkout: claim paths in NOW.md; git add/commit exact paths
only; never -A, reset, stash, clean, rebase or force-push; publish only your paths when local master
carries others' unpublished commits (temp GIT_INDEX_FILE, read-tree origin/master, ls-tree HEAD --
<paths> | update-index --index-info, write-tree, commit-tree -p origin/master, push, merge back).
End commits with: Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Keep design/program/finish/hotspots/STATUS.md current.

FINISH: Helios's three Hotspots done to the bar, then the rest in table order. If blocked, finish
everything else and name the blocker in one plain sentence. Report in plain words.
```
