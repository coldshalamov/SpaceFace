# 12 — Swarm: the Pit, from round one to the last boss

**From the lead designer, 2026-11-10.** Written to be built from. Existing names are in `code style`. The arena cards (EC-A01–A07), the wave cards (EC-Z01–Z04) and the ending (EC-C01) each build a part of this; this page is the whole.

## What it is

**Zombies, in a room made of GTA.** They keep coming, you see how far you get, you spend what you earn on the floor while they are still coming — and the room is a physical playground with its own traffic, its own machinery and its own logic, so that getting good means learning the *room*, not just your gun.

In the fiction it is **the Pit**: the sport this world watches. **Madame Kiln** runs it. **Static** calls it on Lane Nine.

## The loop

1. **A round starts.** Its name appears on screen. Enemies arrive through visible gates, never out of nowhere.
2. **Kills pay Scrap at once.** More for a kill by collision than by bullet. More again for a chain.
3. **You spend on the floor, mid-round**, by flying to the thing. Nothing is bought in a menu.
4. **A four-second breath**, then the next round.
5. **Every fifth round is a boss.** Every tenth, the room changes.
6. **You die, or you cash out at a tenth round, or you win at thirty.**

### What is on the floor

| Thing | What it is | Costs | Why you cross the room for it |
|---|---|---|---|
| **Wall guns** | a gun mounted on the wall at a fixed spot; fly through to take it | low | you always know where the Thump gun is |
| **The Crate** | a random gun from the whole Armory. After three pulls it lifts off and settles somewhere else | medium | the gamble; the only way to the rare ones |
| **The Forge** | turns the gun you are holding into its Forged form (11 §2). Once per gun per run | high | the reason to save up |
| **Taps** | four at most. Each is a mod (11 §5), dispensed as a canister you fly through | medium, rising | your build |
| **Doors** | open another wing of the arena. More room, more hazards, a loop to run | rising | bigger playground, and somewhere to lead a train of enemies |
| **Traps** | a lever. The crusher, the furnace door, a pylon, the sluice gate | low, with a cooldown | the room kills for you if you set it up |
| **The Bench** | every tenth round: refit, change ship, or cash out | free | the breath |

Everything on the floor is lit, labelled with a price you can read from across the room, and marked on the radar.

### Drops — things that fall out of enemies

Physical pickups. They drift, they can be Lined and thrown to yourself, and they time out.

| Drop | What it does | Kiln says |
|---|---|---|
| **Full Rack** | every gun and power refilled | *"Reload, darling."* |
| **Heavy Hands** | twenty seconds of every Kick doubled | *"Oh, now you've done it."* |
| **Dead Weight** | twenty seconds where anything you throw kills what it touches | *"Throw something. Anything."* |
| **Magnet** | all the Scrap on the floor comes to you | *"Tidy."* |
| **Big Bang** | one Shove the size of the room | *"Everybody out."* |
| **Double Scrap** | thirty seconds of double pay | *"The sponsors are generous."* |
| **Loose Cannon** | a turret on a tether. Tow it where you want it | *"It's not house-trained."* |
| **Free Forge** | the Forge costs nothing once | *"On the house. Once."* |

## Traffic — the reason speed is fun

Every arena has **one or two freight lanes** crossing it. A string of containers comes through on a timetable. Lane lights go amber, a horn sounds, and then it is there, and it does not stop for anybody.

- It is **predictable**. Same lane, same warning, a rhythm you learn. That is what makes dodging it at full boost a pleasure and not a coin flip.
- It **crushes enemies and you alike**. Shove a pack into the lane as the lights go amber.
- You can **Line a container and ride it** across the room, or swing off it.
- You can **cut a container loose** — and now it is the heaviest throwable in the arena.
- In later rounds **enemies arrive on it**, and the round called *Rush Hour* doubles it.

Traffic is not decoration and it is not a hazard timer. It is the highway. Build it once in the Foundry, then every arena gets its own.

## The cast of enemies — who they are and what answers them

All fifteen exist in `src/data/swarmMode.js`. Today they are drawn as one template. Each must be sortable by sight and must do the one thing its name says.

| Enemy | Reads as | Does one thing | The physical answer |
|---|---|---|---|
| `Wasp Swarmer` | small yellow dart | comes straight at you in numbers | they are ammunition. Throw them |
| `Detonator Dart` | red, blinking faster as it nears | explodes on contact | Line it and send it back |
| `Bruiser Brawler` | wide, grey, horned | charges in a straight line | step aside in front of a wall |
| `Lancer Sniper` | long, thin, a visible aiming line | one hard shot from far away | break the line with a rock, or throw the rock |
| `Mine-Layer Jackal` | fat tail, dropping lights | leaves mines behind it | Shove the mines back into the pack |
| `Tether-Control Raider` | trailing its own cable | latches *you* | swing it into something; you are on the same rope |
| `Anchor Controller` | squat, with a dish | pins whatever you are towing | kill it first, or throw something it is not looking at |
| `Point-Defense Screen` | ringed with small guns | shoots down small thrown things | throw something big |
| `Warden Escort` | carries a dome | shields those near it | Pull the dome's owner out of the group |
| `Quiet Ghost` | almost invisible | appears behind you | Shove shows it; dust shows it |
| `Choir Zealot` | haloed, linked by light | makes its neighbours tougher | break the singer and the halos drop |
| `Corsair Raider` | red and black, fast | strafes and leaves | it must cross the lane to leave |
| `Reaver Pirate` | spiked, mismatched plates | goes for your Scrap and drops | it carries what it stole — kill it and it all falls out |
| `Patrol Lawman` | white and blue, strobes | herds you toward the middle | it obeys the lane lights. You do not have to |
| `Customs Cutter` | boxy, with a scanner cone | slows you while you are in its cone | get behind a container |

## The Course — thirty rounds with names

A round's name is on screen as it starts. A name is a promise about what the round *is*; more of the same enemy is never the twist.

| # | Name | What it is |
|---|---|---|
| 1 | **Doors Open** | ten Wasps, one gate. Kiln explains nothing |
| 2 | **Second Helpings** | Wasps from two gates. The first wall gun is lit |
| 3 | **Hot Potato** | Detonator Darts. The round teaches throwing things back |
| 4 | **Mind the Gap** | the lane runs for the first time, with Wasps on both sides of it |
| 5 | ***Iron Maw*** | **Boss.** A mouth that eats what you throw — until you throw a Detonator |
| 6 | **The Charge** | Bruisers. Every wall has a scorch mark by the end |
| 7 | **Long Shots** | Lancers at the edges, Wasps in the middle. Rocks appear for cover |
| 8 | **Breadcrumbs** | Jackals. The floor fills with mines that are also yours to use |
| 9 | **Tug of War** | Tether Raiders. Half the round you are attached to something |
| 10 | ***Corsair Wing*** | **Boss:** five ships that fly as one. **The room changes** — the crusher wakes. Bench |
| 11 | **The Umbrella** | a Warden shielding gunners. Take the handle away |
| 12 | **Delivery** | enemies arrive on the freight. Cut the container loose before it stops |
| 13 | **Lights Out** | the arena dims. Ghosts. Your own lamps and the lane lights are all you have |
| 14 | **Hands Off** | Anchor Controllers pin whatever you pick up. Nothing stays thrown |
| 15 | ***Mirrorjaw Foreman*** | **Boss.** Copies the last gun that hit it. Hit it with a rock |
| 16 | **Rush Hour** | both lanes, double the traffic, a full pack. The room is the weapon |
| 17 | **No Small Change** | Point-Defense Screens shoot down anything small. Find something big |
| 18 | **Highway Robbery** | Reavers steal your Scrap and run for the gates. Chase or lose it |
| 19 | **The Law** | Lawmen and Cutters box you in — and stop for the lane lights |
| 20 | ***The Yardmaster*** | **Boss.** It controls the freight. The lanes change direction mid-fight. **The room changes** again. Bench |
| 21 | **The Wall** | heavies, shoulder to shoulder. Guns do nothing. Use the room |
| 22 | **Chain Gang** | every enemy is tethered to another. Swing one, swing them all |
| 23 | **The Choir** | Zealots in rings. Find the singer |
| 24 | **Everything Must Go** | prices halved, enemies doubled, ninety seconds |
| 25 | ***The Anvil*** | **Boss.** Too heavy to move. So move everything else into it |
| 26 | **The Umbrella, Again** | two Wardens covering each other |
| 27 | **Tailgate** | a heavy rides the freight round and round. It can only be hit from the lane |
| 28 | **Black Friday** | every drop type falls at once, and so does every enemy type |
| 29 | **Quiet** | forty seconds of nothing. Then the gates all open together |
| 30 | ***The Forge Regent*** | **Final boss.** It runs the furnace. Three stages: it feeds the room to the furnace, then feeds the furnace to the room, then comes out itself. Win, and the lights come up |

Beyond thirty is the open ladder: the same names recombined, two at a time (*"Rush Hour + Lights Out"*).

### The bosses, in one line each

- **`Iron Maw`** — it swallows your throws and spits them back bigger. Feed it a Detonator.
- **`Corsair Wing`** — five ships, one mind. Tie two together with a Coupler and the formation tears itself apart.
- **`Mirrorjaw Foreman`** — returns your own gun at you. It cannot copy a rock.
- **`The Yardmaster`** — a crane on rails that reroutes the freight. Derail it with its own containers.
- **`The Anvil`** — does not move, does not dodge, barely notices guns. Everything else in the room is your ammunition.
- **`Forge Regent`** — the room itself turns on you, and you have spent thirty rounds learning the room.

## Madame Kiln

Dry, amused, on the sponsors' side until you impress her. Eight words or fewer. She never explains a mechanic; she reacts to what you did.

*"Doors open. Try to last."* · *"Off the wall. Lovely."* · *"That was his friend."* · *"Mind the eleven-forty."* · *"You've been shopping."* · *"The crusher's awake. So sorry."* · *"That's coming out of your deposit."* · *"Round twenty. I had money on twelve."* · *"Somebody feed it."* · *"Nobody's ever done that. Do it again."* · *"Lights up. Well. Look at you."*

## What you keep

- **Tonnes moved** count toward your Line Class in both doors.
- **Anything you used** shows in the Adventure catalogue.
- **Stars** open arenas, as now.
- **Your best round and your win** go on Berth Boards in the towns.
- Scrap, Taps and Forged guns end with the run. That is the point of a run.

## How to build this and check your own work

Build in this order, each on the Foundry alone before any other arena: **enemies you can tell apart → the lane → wall guns and one Tap → the Crate and the Forge → rounds one to ten with names → doors → the rest of the Course.**

- **Before and after, every time:** `npm run player-truth -- --mode=swarm --arena="Ricochet Foundry" --rounds=3 --seed=4242`, and open the contact sheet.
- **No screen, for tuning:** `simulateCrucibleSwarm` in `scripts/lib/bench/crucibleBench.mjs`.
- **Later rounds:** `node scripts/probe-crucible-stress.mjs` until EC-G17's start-at-round exists.
- **The traffic test:** a stranger watches thirty seconds and can say when the next string is due.
- **The spending test:** in a real ten-round run, the player crossed the room to buy something at least six times.
- **The name test:** shown clips of rounds 3, 12, 16 and 21 with the titles removed, a stranger matches each clip to its name.

**Ways this gets faked. Check each.**
- *A shop menu with a picture of a wall.* If the player did not fly to it, it is not on the floor.
- *Traffic as a damage zone that appears.* It must be bodies, on a lane, with a warning.
- *A named round that is the previous round plus four enemies.*
- *A boss with a health bar and no trick.*
- *Any of this working only in a probe.* Play it from the title screen.
