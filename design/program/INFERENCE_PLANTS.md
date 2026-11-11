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
| PL-01 | **Near miss.** Pass a civilian within a ship-length at speed: they swerve, flash their lamps and say *"Lane's not yours, pal!"* | Do it again; the third time they report you | SHIPPED 894706179784 |
| PL-02 | **Fender bender.** Bump a parked ship: an alarm lamp strobes and the owner undocks to look at the dent | Stay and get shouted at, or leave and be described to the dock | OPEN |
| PL-03 | **Rubberneckers.** After any wreck, two passing civilians slow down to look; a scavenger arrives within a minute | Shoo them, or take the wreck first | SHIPPED aecf72a93682 |
| PL-04 | **Scramble.** When cargo spills in a lane, nearby civilians each grab a pod and scatter; the owner hails for help | Help the owner, join the scramble, or grab the thieves | OPEN |
| PL-05 | **Road rage.** Shove the same civilian twice and they shove back once, badly, then run | Laugh; or it knocks you into something | SHIPPED b34318ddee21 |
| PL-06 | **Tailgater.** Cut off a loaded hauler and it follows you for twenty seconds with its horn down | Outrun it, or lead it somewhere it will regret | SHIPPED 4fb8e0a3fb72 |
| PL-07 | **Witness.** A crime seen by the bus is mentioned by Benny on open radio and the fine is waiting at your next dock | Stop the bus leaving, or do not be seen | OPEN |
| PL-08 | **Applause.** A slingshot kill within sight of a station makes its dock lamps flash twice | Do it on purpose | OPEN |
| PL-09 | **The recovery tug.** A wreck left in a lane is collected by a real tug that comes from the nearest dock | Race it for the wreck; or cut its line | OPEN |
| PL-10 | **Getaway.** While wanted, riding a freight string or the Noon Train out of a sector loses the search | Learn the timetable | OPEN |
| PL-101 | **The far berth.** Cut the dock queue under boost and every horn behind you holds down; the dock berths you at the far pier. Cut in twice more and the pier is chalked with your tag — the walk is yours now | Queue like the rest; or own the joke and the exercise | DRAFT 2026-11-11 |
| PL-102 | **Mistaken.** Park dead-still in a lane for a minute, lamps off. A patrol sweeps you with its lamp and taps your hull twice. Play dead through it and the recovery tug clamps on and tows you in as a wreck | Wave a lamp and be on your way; or ride the tow in and explain yourself at the dock | DRAFT 2026-11-11 |
| PL-103 | **The bus does not move.** Shove Late Benny's bus mid-route: it sways and holds course, and the whole route hears *"We leave when we leave."* Shove it at a stop and one passenger pod rolls loose | Hand the pod up at the next stop; or keep it — the passenger talks from your hold, all day | DRAFT 2026-11-11 |
| PL-127 | **Litter.** Ditch cargo in a lane and it stays put; traffic files round it on open radio — *"Whose?"* Ditch three in a day and the sweep bill finds you at the next dock | Go back for it; or leave it and pay the sweep | DRAFT 2026-11-11 |

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
| PL-104 | **Inventory.** The gap behind Sker's Chop Line fits one small ship exactly. Spend a Market Night closed in behind it and the claws work round you till morning; Tinker Zell chalks a stock number on your hull | Sleep free, wearing a stock number; or take a normal berth | DRAFT 2026-11-11 |

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
| PL-105 | Tethys | The standoff. Where the two halves' queues merge at the border gate, one Customs ship and one Pitborn ship end up nose to nose — every shift, neither yielding | Shove them apart and both halves honk thanks; or nudge your side's ship through, and the other half closes ranks on you for a week | DRAFT 2026-11-11 |
| PL-106 | Sker | The parts sled. A scrapper on a sled works the Chop Line all day, catching what the claws drop. Take a part out of the air and the sled shadows you through the market till Market Night — bids run low with it there | Let the sled eat; or steal from a sled and haggle under its witness | DRAFT 2026-11-11 |
| PL-107 | Ceres | The empty slot. A barge misses its number and the whole shift circles the Rock an extra lap rather than re-count. Lead the barge home and the mouth flashes thanks; slide into its slot yourself and the board counts you in — mouth right-of-way included | Return it; or fly as barge nine for a day, and Dessa Kroll reads the board twice | DRAFT 2026-11-11 |
| PL-128 | Helios | The surge. At the shift horn every ship in the harbor moves at once for a full minute. Hold still in the middle and the whole harbor parts round you; cut across the flow and the tugs box you into a berth you did not pick | Be still and watch; or cut the flow and take the berth they give you | DRAFT 2026-11-11 |
| PL-129 | Vesta | Somebody's crate. The furnace door opens on a rhythm. A frozen lump through on the beat and the next pour runs a shade brighter; a whole crate through and the yard PA answers: *"That was somebody's crate."* The dock bill agrees | Feed it lumps; or feed it cargo and pay for the brightness | DRAFT 2026-11-11 |
| PL-130 | Vesta | The stamp. The stamping hammer hits once a plate. Get any part of yours under it and the part comes back Vesta-stamped, official, forever | Stamp your parts; or stamp a stolen one and watch Customs hold it up to the light | DRAFT 2026-11-11 |

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
| PL-108 | **Moving house.** A tug with a family's whole life strapped on takes a turn too hard and a chair comes loose. Hand it back: *"Take the chair. Just the chair."* | Keep the chair; or Line the whole rack off, and be chased across two sectors, sadly, on open radio | DRAFT 2026-11-11 |
| PL-109 | **His own fault.** A hotshot boosts past you, clips your wing and tumbles off ahead: *"My boost. My fault."* | Tow them upright for a trade; or strip the wreck while they watch, and be held at the next gate on the strength of their radio | DRAFT 2026-11-11 |
| PL-110 | **Still even.** Pass Juno Castellane head-on anywhere and she flashes her lamps once. The third time, a hail: *"Still even."* | Flash back; or shove her once, and the next three jobs you eye are done before you dock | DRAFT 2026-11-11 |
| PL-131 | **The broken toll.** A raider with a dead gun holds up traffic with a hand-painted sign: TOLL. It is not going well for them | Pay for the story; fly through for free; or take a lame ship apart, and hear about it on every dock that week | DRAFT 2026-11-11 |
| PL-132 | **The dark stretch.** A lone hauler with one lamp hails you to fly beside them through the dark. At the far end: *"Didn't feel so far."* — and a unit of cargo, tipped | Fly the stretch; or peel off whenever — they make it, this time | DRAFT 2026-11-11 |
| PL-133 | **The shadow pilot.** A brand-new pilot latches onto your wake and copies everything: your line, your route, your parking. Dock, and they dock behind you, badly | Fly well, and in three towns meet a pilot who flies well; fly like a maniac, and meet that instead | DRAFT 2026-11-11 |

## E. Lane Nine — Static reports what you did

Each is a trigger and the exact line. One line, once, shortly after the deed; never over a fight.

| ID | When | Static says | State |
|---|---|---|---|
| PL-51 | You ring the Ceres Bell twice in a minute | *"Somebody rang the Ceres Bell. Twice."* | OPEN |
| PL-52 | You throw a ship into a station | *"Whoever parked that in the dock: bold."* | SHIPPED 028d546081ef |
| PL-53 | You ride a freight string out of a sector | *"Stowaway on the noon freight. We see you."* | OPEN |
| PL-54 | Ten near misses in one minute | *"Traffic advisory: there's one of those out today."* | OPEN |
| PL-55 | You are killed by traffic | *"Lane lights exist. Just saying."* | SHIPPED 22f4977395b2 |
| PL-56 | Your Line goes up a class | *"New rope in the lanes. Mind your cargo."* | SHIPPED 1490116 |
| PL-57 | The Fridge changes sector | *"Fridge update."* and the sector's name | OPEN |
| PL-58 | You win the Pit | *"Lights came up at the Pit last night."* | SHIPPED 86ea9fb8b546 |
| PL-59 | You lose a search while wanted | *"Concord would like a word with a certain rope."* | OPEN |
| PL-60 | You finish a town's first job | the town's name, and *"says thanks, whoever you are."* | OPEN |
| PL-111 | You beat the recovery tug to a wreck | *"Today, the tug came second."* | DRAFT 2026-11-11 |
| PL-112 | You ride the Plume | *"Heard the Plume had a passenger."* | DRAFT 2026-11-11 |
| PL-113 | You settle Tolliver's whole list at a dock | *"Kind Regards reports all square. Suspicious."* | DRAFT 2026-11-11 |
| PL-134 | Your yard's lamp is lit for the first night | *"New light in the belt. Somebody's home."* | DRAFT 2026-11-11 |
| PL-135 | You crack the Ceres Bell | *"Bell sounds different. Nobody's saying who."* | DRAFT 2026-11-11 |
| PL-136 | You win three races in one day | *"Somebody get that rope a licence."* | DRAFT 2026-11-11 |

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
| PL-114 | **Sponsorship.** Between rounds a banner drone circles the floor. Throw it into the lane and the freight takes its banner — the next Wasp through wears it, blind. Kiln: *"The sponsors are thrilled."* | Do it on purpose; the blind one charges someone | DRAFT 2026-11-11 |
| PL-115 | **Lit up.** In Lights Out, anything crossing the lane's amber lights shows for a second — thrown rocks, Quiet Ghosts | Fight on the lane; or lead them across the amber and see them first | DRAFT 2026-11-11 |
| PL-137 | **Bad magnet.** A Magnet drop pulls every piece of Scrap on the floor to you — plus the nearest live barrel. Kiln: *"Tidy. Careful."* | Bank it all; or steer, quickly | DRAFT 2026-11-11 |

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
| PL-116 | Hyperion | Right of way. Dutch clips onto your anchor head-on — same anchor, opposite spin. One of you has to let go first: *"After you."* | Let go and be waved through; or hold on, and find out what two ships on one anchor do | DRAFT 2026-11-11 |
| PL-117 | Rhea | Magpie reads you. Passing the Seam, Magpie calls your hold out on open radio, item by item. Pass him empty and he reads that too: *"Nothing. Bold."* | Fly around; or carry exactly what you want the lane to know about | DRAFT 2026-11-11 |
| PL-118 | Veil | Pips counts. Pips paces you along the buoy line, counting aloud, always right. Passing you: *"Two."* | Count your own ships; or come back with a passenger pod and hear *"Three."* | DRAFT 2026-11-11 |
| PL-119 | Eunomia | The red minute. A seal flare goes red in the Graves and every cutter within sight stops dead for a full minute, lamps steady. Cut during the minute and every one of those lamps finds you | Wait it out with them; or work a claimed wreck in the hush | DRAFT 2026-11-11 |
| PL-120 | Sedna | The reading. After dark Dustwife Senna reads the names of the lost, one lamp hung for each. One night, without looking up, she hangs one and reads yours | Sit the night out; or leave Sedna a while — when you come back, she is past it | DRAFT 2026-11-11 |
| PL-138 | Proteus | Two ropes. Deep Colm's winch groans against its catch and loses: *"Pull!"* Anchor your stern behind him and it comes up on two lines — and the Well pulls back once, hard, to see who's new | Hold, and be hailed first next time; or let go early, and the Well is quiet for a day | DRAFT 2026-11-11 |
| PL-139 | The Bolus | The shelf. Leave anything against the wall on the inhale; on the exhale it sits flush in the wall, kept. Leave it too long and it is part of the road | Take it back on the exhale, on the Line; or start a row of things you meant to keep | DRAFT 2026-11-11 |
| PL-140 | Haumea | Glass pays. Calve a shard on the Pulse and Mr. Glass buys it off your rope on the spot. Miss the pulse and it is glitter — he buys glitter by the handful, cheap | Calve big; calve wrong; or ring a shard off the rift wall and hear *"Don't."* | DRAFT 2026-11-11 |
| PL-141 | Eris | Three-count. Wait out one beam beside Sabine's rock and she counts you across: *"One. Two."* Then a mark chalked for you on the waiting rock — you are one of the counters now | Cross on her count, safe; or cross early, and your mark gets crossed out | DRAFT 2026-11-11 |
| PL-142 | Nyx March | Twice. Flash once at Lark as she passes lights-off and she flashes back, once. Flash twice, and something further off answers — twice, both times you try it | Stick to once; or keep trying twice, and start mapping who answers | DRAFT 2026-11-11 |
| PL-143 | Triton | The good patch. Fly into Triton dented and Hanne Brandt has the patch on before you've docked: *"Patches and tea. That's the list."* Other patchers click their tongues at her work | Come back dented often; or ask what the tea is for — she pours you one instead of answering | DRAFT 2026-11-11 |

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
| PL-121 | **Your berth.** Dock in the same berth five times running and the dockhand chalks your tag on the post and shoos strangers out of it | Be a regular; or sleep one night in a chalked berth that is not yours — the morning tow is gentle, the look is not | DRAFT 2026-11-11 |
| PL-122 | **Red at home.** Come home wanted and your own berth's lamp burns red. Dock dark if you like: *"Saw nothing."* | Pay at the window; or keep flying dark, and he keeps seeing nothing | DRAFT 2026-11-11 |
| PL-123 | **Someone's course.** Planted anchors dot a lane in a pattern that is plainly a swing line, and the builder watches from a rock with a timer | Run it clean and get the nod; or cut one anchor loose — the builder collects the pieces, and your description | DRAFT 2026-11-11 |
| PL-144 | **Ducklings.** Tow anything big and small skiffs tuck in behind it for the slipstream, one by one | Let them ride, and one leaves a part at the far end; or shove them off — they take the long way, and so, now, do you | DRAFT 2026-11-11 |
| PL-145 | **Freight manners.** Hold at a beacon and let three strings through and the fourth flashes you across first. Never yield, and the strings close ranks — every crossing becomes a fight you started | Yield; or make an enemy of the timetable | DRAFT 2026-11-11 |

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
| PL-124 | **The parked light.** Beat the light on the Tethys bypass three times, and one night it waits at the far end, dark, beside a small cairn of parts | Take one — it flashes once as you do; take them all, and the next run is not a race | DRAFT 2026-11-11 |
| PL-125 | **Under the paint.** A scrape deep enough for the repair bay turns up a scratch under your hull's paint, older than your registration: 12.4 | Have it buffed out — it comes back with the next deep scrape; or leave it. It was there first | DRAFT 2026-11-11 |
| PL-126 | **Keeping it.** Wear the lost hat past Benny's bus and he looks at it a long while: *"Keeping it, then."* Hand it back and it rides on the dash, in the window, every route | Keep it; or give it up, and always know where the bus is | DRAFT 2026-11-11 |

## J. The yard — street life on your own rock

| ID | What happens | What the player can do | State |
|---|---|---|---|
| PL-146 | **The first caller.** In the yard's first week a hauler you never hired calls at night, takes on ore, and leaves a lamp burning on your rock: *"Saw your light."* | Leave the lamp lit, and the calls come weekly; snuff it, and the next call is a long time coming | DRAFT 2026-11-11 |
| PL-147 | **The first part.** The works' first part comes out one size wrong, stamped with your yard's number. It fits nothing you own | Keep it; or scrap it — the works only knows the one size | DRAFT 2026-11-11 |
| PL-148 | **The count.** Before the first raid, a fast skiff flies your yard's perimeter at night, once, lamps off | Let it count; or Line it — the pilot ejects, the skiff is yours, and the raid comes early | DRAFT 2026-11-11 |
| PL-149 | **Which way it leans.** The seedling on your rock leans a little more each day, always the same way: out, toward the dark | Follow the lean, one day; or ignore it — it grows anyway | DRAFT 2026-11-11 |
| PL-150 | **Its spot.** One turret you place drifts back, overnight, to the first spot you ever set it, whatever you tow it to | Give it the spot; or keep moving it — it goes home anyway, dragging its base | DRAFT 2026-11-11 |
| PL-151 | **No papers.** Once the works makes parts, a hail on a private channel offers to buy the lot, unlogged: *"No papers. Better price."* | Sell dark, and watch honest haulers give your lane a miss; or refuse, and the hail comes back weekly, polite | DRAFT 2026-11-11 |
| PL-152 | **The tally.** Lose a raid and they take a module — and leave one of their own behind, wrecked on your rock. Inside, a chalked list of yards, and yours is on it | Keep the wreck as proof; or feed it to the works, and the list burns with it | DRAFT 2026-11-11 |
| PL-153 | **The minute.** Every shift change your drill head stops dead for one minute, whatever it is in the middle of | Be there for the minute; the drill taps twice, like the rest of the Rock | DRAFT 2026-11-11 |

## Suggestions

One line each. The lead designer writes them up or does not.

- One wall on Sker gets a new painted portrait every week; nobody has ever seen it happen.
- Once a week one Concord patrol flies a perfect lap of a town, and everything in the lane stops to watch.
- Big Ansel's shutter still has a dish chalked up for a regular who never came back for it.
