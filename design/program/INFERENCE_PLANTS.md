<!-- LIFETIME: ACTIVE_PROGRAM -->
# INFERENCE plants — small things to put in the world, already written

**From the lead designer, 2026-11-10.** This is the fourth kind of INFERENCE unit (law:
[`INFERENCE_LANES.md`](./INFERENCE_LANES.md) §0.0). A **plant** is one small, physical, reactive
thing placed in the ordinary game: a reaction, a street moment, a chance meeting, a secret, a line on
the radio. They are what make a world feel inhabited between the jobs.

**You do not invent plants. You build the ones written here, as written.** If you have an idea for
one, add it under *Suggestions* at the bottom in one line and move on; the lead designer writes it up
or does not.

## Rules for every plant

- **It is physical.** Bodies move, things can be bumped, towed, thrown or cut. No plant is only text.
- **It uses what exists** — the Line, the powers, cargo, contacts, broadcasts, law, traffic. No new system.
- **It needs no job.** It happens on the ordinary route to a player who accepted nothing.
- **It reacts honestly.** If the player ignores it, wrecks it or exploits it, something sensible follows.
- **One line of voice at most,** eight words or fewer, unless the row gives the exact line.
- **Done when:** a stranger on the ordinary route meets it without being told, and you have a
  before-and-after capture of it happening. Record with `--kind plant --id <PL-nn>`.
- **Mark the row** `SHIPPED <sha>` when it lands, or `CLAIMED <who> <date>` while you work.
- If a plant needs a place that is not built yet (a town's toy, a named person), **skip it** and take another.
- **Radio lines (section E) are the easy ones.** Take at most one for every two physical plants you build.
  A run of radio lines is not a run of plants.

## A. The world reacts to you (anywhere)

| ID | What happens | What the player can do | State |
|---|---|---|---|
| PL-01 | **Near miss.** Pass a civilian within a ship-length at speed: they swerve, flash their lamps and say *"Lane's not yours, pal!"* | Do it again; the third time they report you | OPEN |
| PL-02 | **Fender bender.** Bump a parked ship: an alarm lamp strobes and the owner undocks to look at the dent | Stay and get shouted at, or leave and be described to the dock | OPEN |
| PL-03 | **Rubberneckers.** After any wreck, two passing civilians slow down to look; a scavenger arrives within a minute | Shoo them, or take the wreck first | OPEN |
| PL-04 | **Scramble.** When cargo spills in a lane, nearby civilians each grab a pod and scatter; the owner hails for help | Help the owner, join the scramble, or grab the thieves | OPEN |
| PL-05 | **Road rage.** Shove the same civilian twice and they shove back once, badly, then run | Laugh; or it knocks you into something | SHIPPED b34318ddee21 |
| PL-06 | **Tailgater.** Cut off a loaded hauler and it follows you for twenty seconds with its horn down | Outrun it, or lead it somewhere it will regret | SHIPPED 4fb8e0a3fb72 |
| PL-07 | **Witness.** A crime seen by the bus is mentioned by Benny on open radio and the fine is waiting at your next dock | Stop the bus leaving, or do not be seen | OPEN |
| PL-08 | **Applause.** A slingshot kill within sight of a station makes its dock lamps flash twice | Do it on purpose | CLAIMED deepseek 2026-11-10 |
| PL-09 | **The recovery tug.** A wreck left in a lane is collected by a real tug that comes from the nearest dock | Race it for the wreck; or cut its line | OPEN |
| PL-10 | **Getaway.** While wanted, riding a freight string or the Noon Train out of a sector loses the search | Learn the timetable | OPEN |

## B. Secrets

| ID | What happens | What the player can do | State |
|---|---|---|---|
| PL-11 | **The Fridge.** One household fridge drifts in the Ceres belt. It cannot be destroyed. It is the best throwable in the game. Static reports its last known position | Throw it at everything; lose it; find it again three sectors away | OPEN |
| PL-12 | **The Sofa.** Bolted to a dead hull at Pallas, with a standing lamp. Park beside it for ten seconds and your lights dim and the radio plays something quiet | Nothing. That is the point | OPEN |
| PL-13 | **The number station.** A beacon at Orcus blinks a pattern. The pattern is a position at Sedna | Go there. There is a cache, and a second beacon | OPEN |
| PL-14 | **Do Not Tilt.** A pod stencilled DO NOT TILT. Deliver it to Phoebe without one hard knock and a bell rings by itself | Carry it like an egg — or do not, and hear what was inside | OPEN |
| PL-15 | **The box seat.** A window high in the Foundry with a silhouette in it. Put an enemy through it: *"Mind the glass."* | Do it again: *"That's coming out of your deposit."* | OPEN |
| PL-16 | **12.4.** The number is scratched on a wall somewhere in each of the five towns | Find all five; Kessler has one line about it | OPEN |
| PL-17 | **The old racer.** A single light on the Tethys bypass that paces you if you match its speed | Beat it; it never mentions it | OPEN |
| PL-18 | **The lost stop.** A bus shelter floating at Triton. Wait thirty seconds and Benny arrives: *"This isn't on my route."* | Get on. It goes to Helios | OPEN |
| PL-19 | **The Bell's twin.** A small bell in a Ceres service mouth. Ring both bells within five seconds and a hidden mouth's lamp comes on | Go in | OPEN |
| PL-20 | **J.C.** A scorch mark and the initials at places Juno reached before you. After a job together it reads *J.C. + you* | Get there first for once | OPEN |

## C. Street life in the towns

| ID | Where | What happens | What the player can do | State |
|---|---|---|---|---|
| PL-21 | Helios | A lamplighter's skiff goes lamp to lamp along the crescent | Follow it; it ends at a dark one it cannot reach | OPEN |
| PL-22 | Helios | Three kids in tiny skiffs race the Slipway | Beat their line and they follow you round the harbor for a minute | OPEN |
| PL-23 | Tethys | Ansel's lunch queue: ships line up at the shutter | Wait your turn for a hull patch; jump it and get honked out | OPEN |
| PL-24 | Tethys | A container with a loose door leaks small boxes down the track | Follow the trail, or shut the door with a bump | OPEN |
| PL-25 | Ceres | The headcount board changes as barges really go in and out | Block a mouth and watch the number hang | OPEN |
| PL-26 | Ceres | A miner asleep in a tug at Mouth Four | Bump it: *"I'm up. I'm up."* | OPEN |
| PL-27 | Vesta | A pile of rejected plates on the apron | Throw one into the furnace: the next pour is bigger | OPEN |
| PL-28 | Vesta | The coolant crew pelt each other with frozen lumps on their break | Join in. They aim at you now | OPEN |
| PL-29 | Sker | Two hulls playing dice with a tumbling crate | Shove the crate mid-roll; each blames the other | OPEN |
| PL-30 | Sker | The Door stops you: *"Toll."* | Pay, show Vane's mark, or try shoving the Door once | OPEN |
| PL-31 | Dione | A drill formation wheels under the gate ring | Hold the gap in it for ten seconds: *"Again. With him."* | OPEN |
| PL-32 | Io | Couriers sling mailbags at the chutes from further and further back | Take a bag and try; the chute keeps score | OPEN |
| PL-33 | Pallas | A funeral tow passes and every light on Rib Street dims | Dim yours and be nodded to; do not and be remembered | OPEN |
| PL-34 | Ashfall | Wick lights one window in the scar for each relief run finished | Count them | OPEN |
| PL-35 | Phoebe | During the Quiet, a boost makes every ship in the harbor turn its lamps on you | Sit still, or explain yourself to Keeper Aud | OPEN |

## D. Chance meetings (anywhere)

| ID | What happens | What the player can do | State |
|---|---|---|---|
| PL-36 | A pilot in an escape pod drifts toward a hazard, holding something | Tow them clear; take the thing; both | OPEN |
| PL-37 | A hauler with a slipping load: *"Hold the back end, would you?"* | Line the load through one turn. They pay in whatever fell off | OPEN |
| PL-38 | Two pirates in a tug of war over one crate on one rope | Cut the rope; take the crate; pull on a third rope | OPEN |
| PL-39 | A patrol is pulling over a smuggler, who throws a pod your way: *"Hold this."* | Keep it, hand it over, or throw it back | OPEN |
| PL-40 | A rock with a ship's tail sticking out of it | Pull it free. The log says it weighed more than it should | OPEN |
| PL-41 | A racer at any gate: first to the next beacon, ropes allowed | Win, lose, or sling them into the beacon | OPEN |
| PL-42 | Tolliver towing a ship with its pilot still aboard, complaining on open radio | Help him. Help them. Stay out of it | OPEN |
| PL-43 | Juno, stuck with a load too heavy for her | Help and split it. Ignore her and she manages — and tells everyone | OPEN |
| PL-44 | A distress call that is a trap. The tell: the "pod" is far too heavy on the Line | Notice, and throw it at whoever is waiting | OPEN |
| PL-45 | A dozen Wasps loose in a lane. Static: *"Somebody left the Pit door open."* | A free round, with traffic | OPEN |
| PL-46 | A licensed salvor and a scavenger arguing over a wreck you made | Give it to one, or tow it away from both | OPEN |
| PL-47 | A convoy with one container glowing hot; the others keep their distance | Leave it. Or do not | OPEN |
| PL-48 | A rock shower crosses a lane | Dodge it, shelter behind a hauler, or send it back | OPEN |
| PL-49 | A wedding convoy, ships joined by ribbons | Fly under the ribbons; do not break one. Or break one | OPEN |
| PL-50 | A lost drone that copies every move you make | Lead it home to Vesta. Its owner has been looking | OPEN |

## E. Lane Nine — Static reports what you did

Each is a trigger and the exact line. One line, once, shortly after the deed; never over a fight.

| ID | When | Static says | State |
|---|---|---|---|
| PL-51 | You ring the Ceres Bell twice in a minute | *"Somebody rang the Ceres Bell. Twice."* | OPEN |
| PL-52 | You throw a ship into a station | *"Whoever parked that in the dock: bold."* | OPEN |
| PL-53 | You ride a freight string out of a sector | *"Stowaway on the noon freight. We see you."* | OPEN |
| PL-54 | Ten near misses in one minute | *"Traffic advisory: there's one of those out today."* | OPEN |
| PL-55 | You are killed by traffic | *"Lane lights exist. Just saying."* | SHIPPED 22f4977395b2 |
| PL-56 | Your Line goes up a class | *"New rope in the lanes. Mind your cargo."* | SHIPPED 1490116 |
| PL-57 | The Fridge changes sector | *"Fridge update."* and the sector's name | OPEN |
| PL-58 | You win the Pit | *"Lights came up at the Pit last night."* | SHIPPED 86ea9fb8b546 |
| PL-59 | You lose a search while wanted | *"Concord would like a word with a certain rope."* | OPEN |
| PL-60 | You finish a town's first job | the town's name, and *"says thanks, whoever you are."* | OPEN |

## F. In the Pit

| ID | What happens | What the player can do | State |
|---|---|---|---|
| PL-61 | **Stowaway.** A Wasp clings to a freight container and rides it across the arena | Shove the container; or let it arrive behind you | OPEN |
| PL-62 | **The janitor.** In the breath between rounds a small sweeper crosses the floor collecting Scrap | Bump it and it drops everything. Kiln: *"Leave the staff alone."* | OPEN |
| PL-63 | **Crowd pleaser.** Three collision kills inside two seconds: the arena lights flash and Scrap rains from the stands | Do it on purpose | OPEN |
| PL-64 | **The heckler.** A spectator drone hovers at the rail | Put an enemy through it. Next round it is back, taped up | OPEN |
| PL-65 | **Loose container.** One freight string in ten has a container that is not latched | A hard bump frees it. It is full of barrels | OPEN |
| PL-66 | **Red barrels.** A few volatile barrels stand about the floor each round | Shoot one, or better, throw one. They chain | OPEN |
| PL-67 | **The gong.** A hanging plate in the Foundry | Hit it with a thrown body: everything near it is stunned for a second | OPEN |
| PL-68 | **Leftovers.** When the Iron Maw dies its jaw stays on the floor | Throw something into it and it snaps shut. A trap you earned | OPEN |
| PL-69 | **Kiln's tip.** In round seven one gold Wasp crosses the arena and does not fight | Catch it on the Line for a Free Forge. Shoot it and get nothing | OPEN |
| PL-70 | **Had enough.** The last enemy of a round, if it is small, runs for a gate | Let it go. It comes back at the next boss wearing a scarf, with a name | OPEN |

## G. Street life at the outposts and waystations

| ID | Where | What happens | What the player can do | State |
|---|---|---|---|---|
| PL-71 | Dione | A cadet stalls out of the formation | Nudge them back before Baig counts four | OPEN |
| PL-72 | Dione | A range drone slips its rail as the flag goes red | Catch it and hand it back. Sorrel has one word | OPEN |
| PL-73 | Pallas | A child's ball comes bouncing down Rib Street off the plates | Bounce it back to the window it came from | OPEN |
| PL-74 | Io | A paint pod drifts loose from the crew on the Plate | Bump it into the Plate: a stripe in a third colour, until the next repaint | OPEN |
| PL-75 | Charon | A pruning tender is snagged in the growth | Pull gently. Too hard and you tear what it was pruning | OPEN |
| PL-76 | Veil | The lighthouse beam sweeps | Fly inside it for one full turn. The keeper flashes it twice | OPEN |
| PL-77 | Ashfall | A kite on a long tether, flown from the scar | Fly under it. Snag it and a window goes dark for a while | OPEN |
| PL-78 | Kepler | A stall starts folding with a customer's ship still inside | Hold it open with your hull | OPEN |
| PL-79 | Hyperion | A load swings loose on an anchor, back and forth across the Cut | Time your pass. Or catch it | OPEN |
| PL-80 | Nereid | Somebody has a nose on the Scale | Bump them off. The board flips. Fair Tobias: *"Thank you."* | OPEN |
| PL-81 | Sedna | One buoy in your chain of lights has gone dark; a scavenger is sitting on it for the warmth | Shoo it, or leave it and tow out another | OPEN |
| PL-82 | Eunomia | Boosting near the Graves blows out a vigil light | Tow a lamp back and relight it. Little Oda is watching | OPEN |

## H. The world reacts, part two

| ID | What happens | What the player can do | State |
|---|---|---|---|
| PL-83 | **Too heavy.** Tow something above your class and the line creaks. A passing hauler: *"That's not going to hold."* It does not | Let go first, or chase the load when it snaps | OPEN |
| PL-84 | **A good turn.** After you have helped three strangers in a sector, the next time you are disabled a passing tug pushes you to the dock | Nothing. You earned it | OPEN |
| PL-85 | **Known.** With Vane's mark on your hull civilians give you room. With a Venn lamp lit, Helios traffic yields | Notice | OPEN |
| PL-86 | **Itemised.** Wreck three parked ships and Tolliver arrives with a clipboard and follows you, reading the list | Pay at a dock, or lose him | OPEN |
| PL-87 | **Copycat.** A kid in a skiff who saw your slingshot tries it, and fails. Later, somewhere else, they try again and land it | Applaud, by flashing your lamps | OPEN |
| PL-88 | **A crowd.** Fight within sight of a town and ships gather at a safe distance to watch | Win: the dock lamps flash. Lose: they are already eyeing your wreck | OPEN |
| PL-89 | **Hitchhiker.** A pod at a gate with one lamp held out | Tow it to the next town. It pays with a rumour: a pencil mark on your Chart | OPEN |
| PL-90 | **Wrong turn.** A very large hauler has missed the lane and is wedging itself into a gap | Shove its tail round and it clears. Leave it and that route is blocked until the tugs come | OPEN |
| PL-91 | **A price on you.** Enough chaos and a named hunter takes the contract. Static gives his arrival time | Be ready, be elsewhere, or be waiting with something heavy | OPEN |
| PL-92 | **Clean.** A full hour without a crime and patrols wave you past the gate queue | Enjoy it while it lasts | OPEN |

## I. Secrets, part two

| ID | What happens | What the player can do | State |
|---|---|---|---|
| PL-93 | **KILN 7.** A wreck in the Foundry's Scrap Yard with that painted on it | Tow it to the Forge. She says nothing at all for one whole round | OPEN |
| PL-94 | **Hot Fridge.** The Fridge survives the Vesta furnace | It comes out glowing, and for a minute everything it hits goes twice as far | OPEN |
| PL-95 | **Lost property.** A box strapped to the roof of Benny's bus | Line it off at speed. It is a hat. Your ship can wear it | OPEN |
| PL-96 | **Something big.** Once in a long while something enormous and slow passes far beneath Triton | Be there with your lamps off. It passes close | OPEN |
| PL-97 | **The honest scale.** Put any story cargo on the Scale at Nereid | It reads 12.4 over. Fair Tobias checks it twice and says nothing | OPEN |
| PL-98 | **Mirror rock.** A polished rock at Haumea | Your reflection is painted differently. Now you can be too | OPEN |
| PL-99 | **Back in 5.** A berth at Helios with a sign in the window, all game | After any ending it reads *Gone fishing* | OPEN |
| PL-100 | **The seedling.** A small pod at the edge of the Charon garden, stencilled *100* | Tow it home to your yard. Something grows on your rock. It is harmless and it is yours | OPEN |

## Suggestions

One line each. The lead designer writes them up or does not.
