# 11 — The Armory: one set of toys, two speeds

**From the lead designer, 2026-11-10.** This is written to be built from. Names in `code style` already exist in the game's data; nothing here needs a new system, only for the existing pieces to be made *different from each other* and offered through one screen in both doors.

## The rule

**Swarm and Adventure share one Armory.** The same ships, guns, powers, Line heads and mods, with the same names, pictures and behaviour, on the same screen (EC-G20).

- **Swarm hands it to you fast.** Drops, wall buys, the Crate, the Forge. In twenty minutes you have held a dozen guns and three power bends, and you are a monster.
- **Adventure makes you earn it.** You buy it, find it, are given it, or watch it get made at Vesta. The same monster, ten hours later, and it is *yours*.
- **Seen in Swarm means known in Adventure.** Anything you have used in a run shows in the Adventure catalogue with its real name and a line about where to get it. Swarm is the shop window.

A build is five choices a player can say out loud: **my ship, my guns, my powers, my Line, my mods.**

## 1. Ships — each one is a different way to move

A ship is not a bigger number. It is a different pair of hands. All of these exist in `src/data/ships.js`.

| Ship | How it moves | What it is for | The feeling |
|---|---|---|---|
| **Hitch** | light, slides, snaps round anchors | the swing | a skateboard |
| **Hornet / Wasp** | twitchy, fragile, fastest boost | gunning and dodging | a motorbike in traffic |
| **Ranger** | long legs, big scanner, soft turn | going far | a road trip |
| **Pelican / Mule** | slow to start, hard to stop, huge hold | hauling; a full hold is a weapon | a loaded truck — *do not be in front of it* |
| **Hawser / Atlas** | the tow kings: strongest Line, steady under load | throwing things two classes up | a crane with engines |
| **Ironback / Bastion** | the tank. Ramming is its gun: it takes no collision damage below a high speed and *gives* double | driving through things | a snowplough |
| **Colossus / Leviathan** | moving terrain; small things orbit it | being the biggest thing in the room | a ferry that fights |
| **Saucer** | **does not turn.** It goes where the keys point, at full speed, at once. Right angles. Stops dead. Guns aim independently | impossible movement | the thing in the UFO reports |

**The Saucer, specifically.** No facing, no drift, no boost — it is always boosting. Tap a direction and it is already there. Its weakness is the Line: with no momentum it cannot swing, so it *reels* instead — it yanks things to itself, and itself to things, in straight lines. Its guns are **Burn** family only: a wide beam that leaves hulls glowing and sagging, and a pulse that melts a hole clean through a rock. Enemies hit by it do not fly away. They slump. It should feel like cheating in a different way from every other ship.

**The Tank, specifically.** Give it a blade on the nose that is visibly the weapon. Light enemies burst on contact and their pieces fly forward as shrapnel. Rocks split. Station panels come off. Its powers lean physical: its Shove is a forward bulldoze, and its Line is a chain — short, unbreakable, for dragging something enormous behind it and letting the swing do the work.

## 2. Guns — every hit pushes, and each family pushes differently

Every gun has four numbers a player sees as bars: **Rate, Punch, Reach** and **Kick**. Kick is the one that makes this game itself: how hard the hit moves the thing it hits. *Every* gun has some.

| Family | Kick | What a hit does to the body | Existing guns | Sound and look |
|---|---|---|---|---|
| **Pew** — fast and light | ● | a nudge; a stream of them walks a light enemy backwards | `Pulse Laser S/M`, `Autocannon S`, `Ironsong AC`, `Flak/PD Turret S` | crisp *tik-tik-tik*; short bright bolts |
| **Hose** — a ricocheting stream | ● | pins a light enemy against whatever is behind it | `Bank Stream M`, `Heavy Autocannon M` | a buzzsaw; gold thread and sparks off every wall |
| **Thump** — big slow balls | ●●●● | knocks a fighter spinning; two hits put it into a wall | `Concussion Cannon S/M`, `Disc Launcher`, `Plasma Cannon M`, `Mirrorjaw Pulse` | *whump*; a fat slug with a shock ring |
| **Needle** — the sniper | ●● through the target | goes through three bodies and nails the last one to what is behind it | `Railgun M`, `Siege Lance L`, `Veil-Cutter`, `Glaive` | charge whine, a crack, a white line that lingers |
| **Burn** — beams and cones | none — it melts | hulls glow, sag and slump; rocks get holes; a melted enemy is a soft, sticky throwable | `Beam Laser M`, `Heavy Beam L`, `Lighthouse Heavy Beam`, `Plasma Cone` | a rising tone; metal goes orange then white |
| **Boom** — things that explode | ●●●●● in all directions | scatters a pack; turns a pile into a spray | `Missile Rack M`, `Micro-missile Barrage`, `Torpedo L`, `Nestbreaker Rack`, `Singularity Mortar` | hiss, then a thump with a tail |
| **Trick** — tools, not guns | varies | changes the rules for one body | `Gravity Marker S`, `Gravity Wellhead M`, `Inertial Shunt S`, `Momentum Sink S`, `Vector Mine M`, `Snarl Webcaster`, `RCS Disruptor M`, `EMP Disruptor M`, `Debris Orbit` | each its own |

**Rules for whoever tunes them.**
- Heavies shrug at Pew and Hose. Heavies fear Thump, Boom, and anything thrown.
- A kill by Kick — the body died of what it hit, not of the bullet — pays more and is named on screen.
- Two guns from the same family must still be tellable apart with the sound off.

**Six guns to make famous first.** These get hero treatment: unique sound, unique tracer, a Forged form.

1. **`Concussion Cannon`** — the one everybody remembers. One slug, one fighter leaving the screen sideways. Forged: **Wrecking Ball** — the slug does not stop at the first body.
2. **`Bank Stream`** — fire it into a corner and the whole room fills with gold. Forged: **Pinball** — every ricochet gets faster.
3. **`Railgun`** — hold to charge, the world goes quiet, release. Forged: **Skewer** — the line stays for two seconds as a wall bodies cannot cross.
4. **`Heavy Beam`** — sweep it like a hose and leave a row of glowing, sagging hulls. Forged: **Lighthouse** — melted bodies stick to each other.
5. **`Disc Launcher`** — a spinning plate that bounces between bodies. Forged: **Saw** — it comes back.
6. **`Singularity Mortar`** — lobs a dot that inhales, holds, and bursts. Forged: **Second Sun** — the burst lights fires.

## 3. Powers — five, each with three bends

The five powers and their feel are fixed in `bible/VERBS.md` §4. A **bend** is a mod that changes a power's shape. One bend per power. Bends are found in Swarm and fitted in Adventure.

| Power | Bend | What changes | The moment it makes |
|---|---|---|---|
| **Pull** | **Vortex** | the pile spins as it gathers | release it and the pile sprays in a ring |
| | **Leash** | the well follows your ship | you tow a ball of enemies like a flail |
| | **Implode** | tiny radius, enormous force | two heavies become one wreck |
| **Shove** | **Wave** | a long forward cone | clears a lane the length of the screen |
| | **Hammer** | one target, everything | a boss slides back a ship-length |
| | **Avalanche** | ×3 on rocks and debris only | every loose rock in range leaves at once and grinds whatever is behind it to dust |
| **Pin** | **Nail** | pins a body *to another body* | two enemies bolted together, thrust fighting thrust |
| | **Post** | the pin lasts until broken | you plant your own anchors and build a swing course |
| | **Stasis** | pins everything in a small ring for a beat | freeze a pile, then choose what to do with it |
| **Bomb** | **Sticky** | attaches, then waits for Shove | plant six, press once |
| | **Cluster** | splits into five on the first bounce | a carpet |
| | **Sinker** | a gravity charge: pulls, *then* blows | the pile makes itself |
| **Rig** | **Plough** | a wide, short wedge | you drive through a crowd |
| | **Sluice** | a narrow, long channel | everything in it accelerates out the far end |
| | **Scoop** | curved; gathers as it pushes | you herd a pack into a hazard |

**Avalanche is the screenshot.** A field of asteroids, one press, and the whole field moves as a wall. Rocks must really travel, really hit and really break what they hit. If the effect is pretty and the rocks barely move, it has failed.

## 4. The Line — heads

The Line is the signature. Its strength is your Line Class (EC-G19). Its *head* is a choice.

| Head | What it does | For |
|---|---|---|
| **Hook** | the standard latch | everything |
| **Coupler** | latches two bodies to each other, not to you | bolas; tying a raider to a rock |
| **Breaker** | a slammed rock splits into throwable chunks | making your own ammunition |
| **Harpoon** | goes through a light body and latches the one behind | kebabs |
| **Chain** | short and unbreakable | the Tank; dragging the enormous |
| **Reel** | winds fast, no swing | the Saucer; snatching cargo |

## 5. Mods — every one is a trade

No mod is simply "better". Each gives and takes, and the player can feel both within thirty seconds.

| Mod | Gives | Takes |
|---|---|---|
| **Overbore** | Kick up two steps | Rate halved |
| **Hair Trigger** | Rate doubled | Kick down one, heat builds |
| **Long Reel** | Line reaches half again as far | reels in slower |
| **Hot Core** | boost lasts twice as long | hull cooks at redline |
| **Ballast** | you are heavier: you win collisions | you turn like it |
| **Stripped** | you are lighter: quicker everything | you lose collisions |
| **Magnet Hull** | loose scrap and cargo drift to you | so do mines |
| **Glass Cannon** | all Kick up one | half your hull |
| **Bumper Rails** | ramming hurts them more than you | top speed down |
| **Wide Bore** | powers reach further | powers cool down slower |
| **Volatile Wake** | your exhaust ignites what it touches | so does everyone else's on you |
| **Second Reel** | two Lines at once | each is one class weaker |

## 6. Ten builds worth chasing

These are the destinations. A player should stumble into one, recognise it, and want to finish it.

1. **The Wrecking Ball** — Hawser · Chain head · Ballast · Pull:Leash. You tow a boulder and never fire a shot.
2. **The Pinball Wizard** — Hitch · Bank Stream · Shove:Wave · Bumper walls. Nothing in the room ever stops moving.
3. **The Shepherd** — Ranger · Rig:Scoop · Pin:Stasis. You herd the whole wave into the furnace.
4. **The Snowplough** — Ironback · Bumper Rails · Rig:Plough · Volatile Wake. You are the weapon; hold forward.
5. **The Lighthouse** — Saucer · Heavy Beam · Pull:Vortex. A slow turning ring of melted hulls.
6. **The Demolition Man** — Mule · Bomb:Sticky · Shove:Hammer · Overbore. Plant, plant, plant, press.
7. **The Kebab** — Hornet · Railgun · Harpoon · Pin:Nail. Everything ends up attached to everything.
8. **The Quarry** — Atlas · Breaker · Shove:Avalanche. You make the rocks, then you send them.
9. **The Black Hole** — any · Singularity Mortar · Pull:Implode · Bomb:Sinker · `Graviton Heart`. One point on the screen eats the round.
10. **The Bolas** — Wasp · Coupler · Second Reel · Stripped. Tie two together, tie the pair to a third, leave.

## 7. How you get it — the two speeds

| | Swarm | Adventure |
|---|---|---|
| Guns | wall buys, the Crate, boss drops | bought, salvaged off wrecks, made at Vesta |
| Forged forms | the Forge, once a run per gun | one per gun, a job at Vesta for each |
| Bends | drops from named waves; draft offers | fitted at Sker (Zell) or earned from a town's people |
| Heads | draft offers | bought; the first is under 5,000 credits |
| Mods | perk taps, four at most | fitted at any shipworks, two at most at first |
| Ships | pick at the start from what you have flown | bought, or taken |
| Line Class | tonnes moved, counted across both | the same counter |

## How to build this and check your own work

- **One family at a time.** Make Thump feel like Thump before touching Needle. Proof is a ten-second clip of each family against the same three targets — a fighter, a bruiser, a rock — shown side by side.
- **Kick is measured, not felt by the author.** For each gun, a trace of how far a standard fighter travels after one hit (`node scripts/agent-loop.mjs sim <scenario> --trace`). The table of those distances goes in the PR.
- **A bend is done** when a stranger shown two clips can say which bend is which.
- **Never fake movement with effects.** Turn the effects off; the bodies must still go where the clip says.
- **Nothing here is finished** until it is on the shared screen (EC-G20) in both doors.
