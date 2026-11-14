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
| PL-02 | **Fender bender.** Bump a parked ship: an alarm lamp strobes and the owner undocks to look at the dent | Stay and get shouted at, or leave and be described to the dock | CLAIMED flash 2026-11-11 |
| PL-03 | **Rubberneckers.** After any wreck, two passing civilians slow down to look; a scavenger arrives within a minute | Shoo them, or take the wreck first | SHIPPED 7c744edb21c4 |
| PL-04 | **Scramble.** When cargo spills in a lane, nearby civilians each grab a pod and scatter; the owner hails for help | Help the owner, join the scramble, or grab the thieves | SHIPPED 1332907af733 |
| PL-05 | **Road rage.** Shove the same civilian twice and they shove back once, badly, then run | Laugh; or it knocks you into something | SHIPPED b34318ddee21 |
| PL-06 | **Tailgater.** Cut off a loaded hauler and it follows you for twenty seconds with its horn down | Outrun it, or lead it somewhere it will regret | SHIPPED 4fb8e0a3fb72 |
| PL-07 | **Witness.** A crime seen by the bus is mentioned by Benny on open radio and the fine is waiting at your next dock | Stop the bus leaving, or do not be seen | OPEN |
| PL-08 | **Applause.** A slingshot kill within sight of a station makes its dock lamps flash twice | Do it on purpose | CLAIMED flash 2026-11-11 |
| PL-09 | **The recovery tug.** A wreck left in a lane is collected by a real tug that comes from the nearest dock | Race it for the wreck; or cut its line | OPEN (877da7c6 reverted a756f3c3: minted a string-id tug, bypassed npcJobs, tug never left) |
| PL-10 | **Getaway.** While wanted, riding a freight string or the Noon Train out of a sector loses the search | Learn the timetable | OPEN |
| PL-101 | **The far berth.** Cut the dock queue under boost and every horn behind you holds down; the dock berths you at the far pier. Cut in twice more and the pier is chalked with your tag — the walk is yours now | Queue like the rest; or own the joke and the exercise | DRAFT 2026-11-11 |
| PL-102 | **Mistaken.** Park dead-still in a lane for a minute, lamps off. A patrol sweeps you with its lamp and taps your hull twice. Play dead through it and the recovery tug clamps on and tows you in as a wreck | Wave a lamp and be on your way; or ride the tow in and explain yourself at the dock | DRAFT 2026-11-11 |
| PL-103 | **The bus does not move.** Shove Late Benny's bus mid-route: it sways and holds course, and the whole route hears *"We leave when we leave."* Shove it at a stop and one passenger pod rolls loose | Hand the pod up at the next stop; or keep it — the passenger talks from your hold, all day | DRAFT 2026-11-11 |
| PL-127 | **Litter.** Ditch cargo in a lane and it stays put; traffic files round it on open radio — *"Whose?"* Ditch three in a day and the sweep bill finds you at the next dock | Go back for it; or leave it and pay the sweep | DRAFT 2026-11-11 |
| PL-154 | **Wrong way.** Fly a freight lane against the flow and every hauler coming at you flashes hard; the lane's beacons turn amber as you pass. Far enough in, a tug meets you nose-on and simply waits | Turn around; or argue with a tug | DRAFT 2026-11-11 |
| PL-176 | **Through the moorings.** Boost across a field of parked ships and every alarm chirps in sequence as you pass, a wave of complaint following you to the far side | Cut the boost; or listen to the whole field complain | DRAFT 2026-11-11 |
| PL-177 | **The slow emergency.** A civilian's cargo hatch swings open and one pod hangs there, snagged, not falling. They have not noticed | Bump it back in and take a flash of thanks; take it, and they never knew; or bump it loose, and everyone knows | DRAFT 2026-11-11 |
| PL-197 | **The dead lane.** A lane with all beacons dark, and traffic still runs it, from memory, on horns | Follow a local's tail through; or tow a lamp line down it and be thanked in horns for a day | DRAFT 2026-11-11 |
| PL-198 | **The orphan.** A wreck nobody owns drifts across a lane for days, and everyone files around it, until the nearest town is arguing about it on open radio | Tow it to the dock and watch three owners appear; or enjoy the argument | DRAFT 2026-11-11 |
| PL-217 | **The sweeping line.** After a spill, a civilian holds a Rig wedge down the lane and walks the debris into a pile. Join with yours and it takes half the time, and the owner's thanks goes out on open radio | Sweep it clean; or sweep the pile your own way — everyone saw which way the wedge went | DRAFT 2026-11-11 |
| PL-218 | **The doorstop.** A dock's rolling shutter jams half-open every third day and the queue backs up. Pin it open and the queue flows; the dockhand chalks your tag on the shutter's edge | Be the fix; or Pin it shut instead — the dock reroutes, and the dockhand chalks a number where your tag was going | DRAFT 2026-11-11 |
| PL-219 | **One yank.** A loader drops a crate stack at a market and a passing hauler Pulls it back into a stack, mid-air, one practiced yank. The lane applauds | Try it yourself: misjudge the well, and the whole pile lands on you | DRAFT 2026-11-11 |
| PL-243 | **Perspective.** Boost past a patrol, wanted for something small, and it does not even turn — someone worse is in the lane today | Enjoy the relativity; or go and find out who | DRAFT 2026-11-11 |
| PL-244 | **Paper trail.** Your unpaid fines chase you from dock to dock as paper tags taped to your berth post | Pay them; or let them accumulate — a bouquet of debts | DRAFT 2026-11-11 |
| PL-257 | **The gutter run.** Fly through debris weather with lamps dead and a stranger falls in beside you just long enough to clamp a working lamp to your hull, no channel, no name: *"Dark out here. Take mine."* | Keep it mounted; or strip and sell it — the giver's yard number is engraved inside, and givers compare notes | DRAFT 2026-11-13 |
| PL-258 | **The tow-along.** Limp home at dawn on one working thruster and an unmarked hauler falls in alongside without being asked, matches speed the whole way, and peels off at the berth lights | Say thanks once; or try to latch them — they are gone between one ping and the next | DRAFT 2026-11-13 |
| PL-259 | **Spare and share.** Jettison a working spare where a broken-down hull can reach it, and word outruns you home — the next three docks chalk your berthing PAID | Farm it with a fake breakdown — the chalks stop, and one dock bills you for the wasted tow | DRAFT 2026-11-13 |
| PL-260 | **The fiftieth visit.** One station counts your arrivals; the fiftieth is already toll-paid when you reach the board, with a chalk mark underneath: *"Fifty. Ours now."* | Keep the chalk; or demand the toll back in cash — the mark becomes a bill | DRAFT 2026-11-13 |
| PL-261 | **The open tank.** Come in dry to a dark waystation and the fuel hatch is unlocked, exactly one tank's worth, the tab chalked to nobody | Take the tank; or drain the lot — the next arrival finds it locked, with your name chalked | DRAFT 2026-11-13 |
| PL-262 | **The gathered pile.** Lose cargo overboard in a lane; by the time you circle back it is collected in a neat cluster with a marker, nobody claiming salvage | Take only yours; or take the lot — gatherers watch, and gatherers gossip at market scales | DRAFT 2026-11-13 |
| PL-263 | **The lesson alongside.** Fly on a fresh Line class and an older hauler falls alongside, shows you one trick without a word, and is gone at the next mark | Learn it; or shove them off mid-lesson — nobody teaches you the next one | DRAFT 2026-11-13 |
| PL-264 | **The light remembers.** Hold still through the full count at a red lane light and the next three crossings for you run green one beat early | Jump the count — the light remembers that too, and runs you red all week | DRAFT 2026-11-13 |
| PL-265 | **The umbrella.** Boost through a station's wash while a tender is working and the tender swings its body wide to shield your line the whole way past | Cut through the work zone anyway — the umbrella comes down on your next pass | DRAFT 2026-11-13 |
| PL-266 | **Somebody's spare.** Come out of a fight with hull in the red and a passing miner tows you a sealed patch kit — no channel, no name, gone before you can thank them | Mount it; or hunt them for a second kit — miners watch their mirrors | DRAFT 2026-11-13 |
| PL-267 | **The queue pass.** Give up your berth slot to a visibly overloaded hauler and the dockmaster chalks you PREFERRED on the board for a week | Shout at the overloaded one instead — PREFERRED becomes LAST, in the same chalk | DRAFT 2026-11-13 |
| PL-268 | **The wake gift.** Ride a superhauler's wake the whole way into a port and the helmsman flashes lamps twice in farewell at the gate | Ride it again the same day; or honk for more — you get the wash instead | DRAFT 2026-11-13 |

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
| PL-155 | **Fair trade.** The second beacon at Sedna blinks a second pattern, slower. It marks a hatch in the dark, out past the last lamp. Whatever you post in comes back as something else, about the same weight | Post junk, receive junk; post something you love; or post nothing | DRAFT 2026-11-11 |
| PL-248 | **The crossing shadow.** At one hour of the day the Slipway's counterweight throws its shadow across exactly one window on the Tower side, and the light in that window goes out while it passes | Be there; that is all of it | DRAFT 2026-11-11 |
| PL-269 | **The kindness locker.** On a broken derelict, one locker is stocked, oiled, and clean — somebody maintains it for strays. One item per visit, no donor ever named | Take one thing when you need it; or strip it bare — it stays bare, with a chalk that says who | DRAFT 2026-11-13 |
| PL-270 | **The stashed medal.** A pension medal is taped under a shelf in a public berth with a note: *"For whoever needs the luck more than me."* | Carry it aboard and things read as luck; or sell it — buyers go quiet around a sold medal | DRAFT 2026-11-13 |
| PL-271 | **The map in the lid.** A hatch lid out on the rim is engraved with a route somebody marked SAFE, ending at a cache: one working charge cell and a note that says *"Still good."* | Follow it and restock the cache; or sell the route to a scrapper — the cache is empty when anyone gets there, moved the same day | DRAFT 2026-11-13 |
| PL-272 | **The forward beacon.** An anonymous drop cache in an empty stretch refills only if the last taker left something behind | Leave something forward; or take clean twice — the beacon stops refilling, and the chalk names you as why | DRAFT 2026-11-13 |

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
| PL-178 | Helios | Slingshot hour. At shift change the Slipway throws pods across the harbor one every few seconds, and the far side catches them | Ride the stream across for free; or throw something in and see if they catch it | DRAFT 2026-11-11 |
| PL-179 | Tethys | Kessler's number. The window over the Scale is lit at any hour. Park on the Scale at night, empty, and the board flips to your exact weight, and Kessler reads it aloud, once, from the dark | Learn your number — you will know when you are carrying something extra | DRAFT 2026-11-11 |
| PL-180 | Ceres | The chalk thief. Overnight, someone beats your swing time on the anchor board by a hair. It is Old Hob | Chalk yours under his; by morning it is beaten again, by the same hair | DRAFT 2026-11-11 |
| PL-181 | Vesta | Two towns' problem. Rhea's hot cargo cooks whoever carries it. Vesta's coolant fall quenches it on the instant — if you can make the crossing | Make the crossing; or deliver it roasted | DRAFT 2026-11-11 |
| PL-182 | Io | Not while it's down. While a flag is being repainted, the other side does not touch the painters. It is the one thing both sides keep | Watch the truce hold; or rag a flag mid-repaint, and find out what both sides agree on | DRAFT 2026-11-11 |
| PL-183 | Sker | The weather. The Door's toll board re-chalks itself as ships Vane likes or dislikes pass through. You can read his opinion of anyone, before you ever meet him | Read the board; or ask him why it changed — *"Weather."* | DRAFT 2026-11-11 |
| PL-199 | Tethys | The jug. Big Ansel fills one jug before the shutter goes up, and it goes to whoever looks like they need it. Look sorry enough and it is yours | Drink it; or steer it to a hull in worse shape — Ansel sees, and the jug finds you next anyway | DRAFT 2026-11-11 |
| PL-200 | Vesta | Two taps. Off-shift, Drip Moreau walks the coolant trench tapping joints with a long pole, listening. One joint gets two taps | Watch that joint — it hisses before the hour is out; or learn her knock and find your own | DRAFT 2026-11-11 |
| PL-201 | Sker | The odd queue. Outside Yusuf Tane's fitting berth, mismatched hulls queue in silence — the half-legal, the ugly, the wrong | Bring your worst; or count the hulls and wonder at all of it | DRAFT 2026-11-11 |
| PL-202 | Pallas | The kept berth. One berth on Rib Street stands empty, chalked RESERVED, and every ship honours it | Park in it and feel the whole street stare until you move — a funeral tow is always coming; or honour it, and be seen to | DRAFT 2026-11-11 |
| PL-203 | Charon | The tour. Em Sato points at the garden from her tender, naming each growth for nobody: wall, mouth, wall, wall, mouth | Follow the tour from flight, and learn which is which before you touch anything | DRAFT 2026-11-11 |
| PL-204 | Ashfall | The hook. Lazlo's crane, idle, hangs its hook at hover height, and the scar's pilots sit on it to wait, swaying | Take a seat; or hover near — someone will offer you theirs | DRAFT 2026-11-11 |
| PL-205 | Helios | The lit hull. In the Helios yard one hull is always lit, and nobody is ever seen aboard. Park beside it and the light inside moves, once | Leave it be; that light is hers | DRAFT 2026-11-11 |
| PL-230 | Helios | Venn's window. At Lamps-Up, Orla Venn's window is the first lit and the last dark. Park outside it and the whole crescent comes up in front of you | Be the audience of one | DRAFT 2026-11-11 |
| PL-231 | Ceres | Marsh's line. Tally Marsh's yard is a maze of things that are not salvage yet. Cross its line towing anything and Marsh is on open radio before your line goes taut | Admire the maze from outside; or test the reflex | DRAFT 2026-11-11 |
| PL-232 | Tethys | The valid instruction. Once a shift, Points Dunmore routes a string through a clear lane and the whole yard obeys instantly, right or wrong | Obey with them; or hold your ground — the string parts around you, and you were valid too | DRAFT 2026-11-11 |
| PL-233 | Pallas | The fresh mark. One morning every hull Fitch had chalked has a second mark beside it: KNOCKED, in a steady hand, all down the street. Somebody worked all night | Admire the night's work — Fitch does | DRAFT 2026-11-11 |
| PL-234 | Io | The middle seat. Gus Varga welded a bench to the dead pump, and both flags' pilots sit on it, opposite ends, same bench | Take the middle seat; both sides will look at you | DRAFT 2026-11-11 |
| PL-245 | Ceres | The Bell's hush. After any ring of the Bell, the whole belt's radio goes quiet for one minute — even Static waits | Be quiet with them; or fill the silence, and be answered by everyone at once | DRAFT 2026-11-11 |
| PL-246 | Io | Wall time. Ten seconds before the Plume, the whole lane parks nose-in against the Plate, like sardines | Park with them; or be the loose thing the Plume takes | DRAFT 2026-11-11 |
| PL-273 | Helios | Ansel's dish. The dish chalked up for a regular who never came back gets cooked one night anyway and set on the sill, steaming, no name on it | Eat it and ring the bell twice for thanks; leave it; or order something else while it cools — you watch him scrape it into the recycler | DRAFT 2026-11-13 |
| PL-274 | Helios | The coffee hatch. First hull to dock before the morning bell gets a free cup in a clip-on mug that fits a dashboard socket | Keep the mug — refills are free for mug-bearers; or toss it, and every hatch starts charging you | DRAFT 2026-11-13 |
| PL-275 | Tethys | The tip jar that tips back. Leave something in the fitting berth's jar and your next repair comes back with a free pressure wash already done | Tip kindly; or fish coins back out — washes become minimum service, for you alone | DRAFT 2026-11-13 |
| PL-276 | Tethys | The kid mechanic. A kid watches your fit-out from the fence and points at one coupling seated wrong. They are right | Thank them by name; or brush them off — next fit-out has no pointers, and one looseness nobody mentions | DRAFT 2026-11-13 |
| PL-277 | Ceres | The second chair. The queue runs one window deep, but the second chair by the wall is never sat in. Sit there and the clerk serves you anyway, off-book, a beat faster | Keep it a quiet habit; or hog the chair daily — the clerk stops bending the rule, and the chair stays empty for good | DRAFT 2026-11-13 |
| PL-278 | Ceres | The walking lunch. At the shift bell, street vendors flag down any hull still working with the unsold plate — half price, or free if the shift was bad | Take it as offered; or demand it free every day — the plate starts going to someone else | DRAFT 2026-11-13 |
| PL-279 | Vesta | The borrowed ladder. A work ladder hangs off the pier arm, chalked BORROW, BACK BY BELL. Borrow it and it is simply there when you need a hand | Return it by the bell; or keep it — the pier chain-lends you nothing again, and everyone sees the empty hook | DRAFT 2026-11-13 |
| PL-280 | Vesta | The window warmer. Dock late, after the windows go dark, and one clerk stays open an extra minute for late hulls — fines, fuel, either | Get in before they close it; or keep them late on purpose — that window closes for good, and the clerk remembers the hull | DRAFT 2026-11-13 |
| PL-281 | Sker | The loose bolts box. A box of serviceable bolts sits at the yard gate marked FREE, refilled by nobody anyone can name | Take a handful when you need them; or take the box home — it stops refilling, and the gate feels different | DRAFT 2026-11-13 |
| PL-282 | Sker | The coat rack. A public rack by the Chop Line gates: leave a spare you don't need and it is gone within a shift, replaced by something closer to what you lack | Trade honestly; or take two without leaving — the rack's keeper chalks your hull, and racks elsewhere go picked-over for you | DRAFT 2026-11-13 |
| PL-283 | Pallas | The gull drone. A scrap-gull drone drops one shiny thing on your deck as you pass — a button, a ring, a charge cap. It does not want anything | Keep the gift; or shoot at gulls — gulls remember hulls, and this street's gulls will not gift you twice | DRAFT 2026-11-13 |
| PL-284 | Pallas | The night bell. Ring the bell at the mission berth and a pallet comes out inside a minute — blanket, hot pack, no questions | Ring it when you need it; or ring it as a joke — the bell comes down, and the pallet stops coming | DRAFT 2026-11-13 |
| PL-285 | Charon | The fare pool. Share your tow-fare with a stranded skiffer at the pool box, and the pool marks you covered. The day YOUR hull dies out there, someone tows you in, prepaid | Pay it forward; or dodge a fare you owe — the pool forgets your hull, politely and forever | DRAFT 2026-11-13 |
| PL-286 | Charon | The overtime mug. Work any job past the shift bell and the foreman's drone climbs the line to bring you a hot mug, no charge | Drink it; or pour it out to keep working — drones remember who does not drink | DRAFT 2026-11-13 |
| PL-287 | Veil | The chalk seat. One seat at the market ring is chalked RESERVED, every day, and nobody sits in it. Sit anywhere else and vendors serve your line first | Leave the chalk alone; or sit in it — full price for a month, and the chalk does not fade | DRAFT 2026-11-13 |
| PL-288 | Veil | The lantern loan. A lantern hangs at the dark-hold berth, chalked TAKE, RETURN LIT. It is for jobs that go down where light has to be carried | Return it lit; or return it dead — lantern loans go dry for you, town-wide, by next bell | DRAFT 2026-11-13 |
| PL-289 | Io | The covered window. Nap in an unlit public berth overnight and someone walking their route pauses to plate your window against the morning flare of departing traffic | Thank the walker if you catch them; or leave your trash in the berth — no more covered windows, and the walker routes past you | DRAFT 2026-11-13 |
| PL-290 | Io | The good word. Do a small unasked favor for a dockhand — hold a line, spot a loose strap — and berths near their station open up for you all week without being asked | Keep the trade flowing; or take favors and give none — the word stops traveling, and berths fill around you | DRAFT 2026-11-13 |
| PL-291 | Ashfall | The sampler. A new stall on the Reach gives the first taste free to anyone who is not in a hurry — the stall can tell | Slow down once; or rush past daily — the day you finally stop, they point you to the back of the queue you could have skipped | DRAFT 2026-11-13 |

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
| PL-156 | **The ticking crate.** A hauler's hail: one crate, the last stretch, ticking gently. *"It ticks. That's the clock."* | Carry it smooth and the town clock keeps true time; or shake it open, and the town runs wrong for a week | DRAFT 2026-11-11 |
| PL-157 | **The empty berth.** A convoy of three flies with a gap where a fourth should be, slowing at every beacon. Fill the gap and the lamps sync | Ride it to the far dock and take the fourth's share; or fly sloppy, and be boxed out halfway | DRAFT 2026-11-11 |
| PL-158 | **The chased thief.** A laden skiff cuts across your bow with two angry haulers behind it | Line the thief and take a finder's cut; or block the haulers — *"Obliged."* — a crate tips your way, and Concord asks about it later | DRAFT 2026-11-11 |
| PL-159 | **The tanker's wake.** The great tanker on the long route never changes course for anything. Pass close and its slow bulk drags you along for a second — the only thing out here that tows you | Ride the drag; or give it room like everyone else | DRAFT 2026-11-11 |
| PL-184 | **The outrider.** Near a convoy's lane, one fast ship detaches, circles you once, and returns | Hold still for the circle and be waved through; or boost off, and the convoy closes ranks behind you | DRAFT 2026-11-11 |
| PL-206 | **The measuring hull.** A ship with no markings matches your course for a full sector, never closing, never falling behind | Break off and lose them; turn and confront — they bolt; or let them follow, and wonder what they were measuring | DRAFT 2026-11-11 |
| PL-207 | **The welder's sparks.** Wherever something is being fixed there are sparks, and behind the mask, Slate. Leave anything broken by the sparks overnight | Come back to it mended; leave something stolen, and it comes back mended and engraved with its owner's tag | DRAFT 2026-11-11 |
| PL-208 | **Same time tomorrow.** Give way to a stranger once, at a beacon, and ever after they hold that beacon for you at that hour — an appointment nobody named | Keep it; or miss a day, and they wave you through late the next, no grudge | DRAFT 2026-11-11 |
| PL-220 | **The stalled string.** Three containers sit dead at a green beacon, and nobody behind them has the mass to move them. One good Shove would do it | Be the shove and take a hundred flashes of thanks; or watch commuter patience die in real time | DRAFT 2026-11-11 |
| PL-221 | **The waiting line.** Once, your hull snags on a line that was already waiting for you. Nothing on the other end. It lets go the moment you slow | Slow down; or run full boost, and it holds on a while | DRAFT 2026-11-11 |
| PL-249 | **The dead stick.** A ship glides past you, dead silent — no radio, no thrust, straight as a rail for the dock. An old pilot flying it in on nothing | Escort silently; or offer a tow — they wave you off, gently | DRAFT 2026-11-11 |
| PL-292 | **The convoy godmother.** A freight convoy adopts a struggling stranger for a night: they pace you, run you a fuel line, and wave you off at the junction with lamps | Fly with them; or siphon from the line — convoys share hull numbers at junctions, all of them | DRAFT 2026-11-13 |
| PL-293 | **The silent mechanics.** Two tugs appear beside your stalled line, rotate it off the lane, set it somewhere safe, and leave without a word on any channel | Let them work; or send them a bill for the tow — tugs bill back, once, with interest | DRAFT 2026-11-13 |
| PL-294 | **The first light.** A rookie's first solo tow wobbles past you badly. One lamp flash from you tells them where the line should sit, and they catch it | Flash once and move on; or laugh about it on open channel — rookies remember callsigns longer than routes | DRAFT 2026-11-13 |
| PL-295 | **The tip line.** A stranger on a shared channel gives you the bearing of a rich seam, no reason offered, no bill asked | Work the seam; or sell the bearing — seams stop surfacing to you, and the stranger never explains | DRAFT 2026-11-13 |
| PL-296 | **The borrowed boost.** A racer tucked behind you at a launch queue offers their slipstream for your departure, free, because someone gave them one once | Take the ride; or bump them at the gate — queues stop offering, and the racer is always in the next one | DRAFT 2026-11-13 |
| PL-297 | **The open hatch.** A stranger docking ahead of you leaves their hold hatch open through flare weather, on purpose, for whoever is caught out in it | Shelter, then go; or shelter AND loot — open hatches close to your hull specifically, and stay closed | DRAFT 2026-11-13 |
| PL-298 | **The umbrella crane.** Dock in falling-debris weather and a crane operator angles their gantry over your hull without being asked or paid | Park and let them work; or complain the shadow is slow — cranes angle away from complainers for a season | DRAFT 2026-11-13 |
| PL-299 | **The rescue dividend.** Tow a stranger to safety with no bounty posted, no receipt asked. A week later, dead in the water yourself, a stranger tows YOU in, quoting your rescue number | Accept the dividend; or demand payment on the spot, twice — the pool crosses your hull off its books | DRAFT 2026-11-13 |
| PL-300 | **The kind checker.** A customs checker waves a small overweight with a chalk: *"Next time, fix it."* Fix it and the next overweight is waved too | Fix it before you return; or come back the same — the checker remembers exactly, and stops waving entirely | DRAFT 2026-11-13 |
| PL-301 | **The shared cab.** Two strangers bound for the same junction offer to draft with you, three ships pacing one another to split the fuel burn | Agree and fly the line; or draft along uninvited — pacing clubs do not invite loners twice | DRAFT 2026-11-13 |
| PL-302 | **The carried word.** Out of comms range, hand a passing hauler a message for a station — a name, a time, a yes or no — and they carry it exact, free | Trust them with it; or hand a smearer a lie for fun — carried words get read aloud at the destination bar | DRAFT 2026-11-13 |
| PL-303 | **The spare bed.** Dock broken at a tiny outpost late at night and an off-duty worker offers their own berth, takes the couch, will not hear a no | Sleep and say so at the counter; or strip the berth's fittings — outpost berths lock to your hull, all of them | DRAFT 2026-11-13 |
| PL-304 | **The after-hours coach.** A retired pilot idles at a launch mouth and coaches one clean takeoff per visitor, for nothing, because somebody did it for them once | Take the coaching; or mock it on channel — the mouth is empty the next time you launch, and stays empty | DRAFT 2026-11-13 |

## E. Lane Nine — Static reports what you did

Each is a trigger and the exact line. One line, once, shortly after the deed; never over a fight.

| ID | When | Static says | State |
|---|---|---|---|
| PL-51 | You ring the Ceres Bell twice in a minute | *"Somebody rang the Ceres Bell. Twice."* | OPEN |
| PL-52 | You throw a ship into a station | *"Whoever parked that in the dock: bold."* | SHIPPED 028d546081ef |
| PL-53 | You ride a freight string out of a sector | *"Stowaway on the noon freight. We see you."* | OPEN |
| PL-54 | Ten near misses in one minute | *"Traffic advisory: there's one of those out today."* | SHIPPED a753e2f6ec0f |
| PL-55 | You are killed by traffic | *"Lane lights exist. Just saying."* | SHIPPED 22f4977395b2 |
| PL-56 | Your Line goes up a class | *"New rope in the lanes. Mind your cargo."* | SHIPPED 1490116 |
| PL-57 | The Fridge changes sector | *"Fridge update."* and the sector's name | OPEN |
| PL-58 | You win the Pit | *"Lights came up at the Pit last night."* | SHIPPED 86ea9fb8b546 |
| PL-59 | You lose a search while wanted | *"Concord would like a word with a certain rope."* | SHIPPED 99136ecd8ae0 |
| PL-60 | You finish a town's first job | the town's name, and *"says thanks, whoever you are."* | SHIPPED a96f601d0e9f |
| PL-111 | You beat the recovery tug to a wreck | *"Today, the tug came second."* | DRAFT 2026-11-11 |
| PL-112 | You ride the Plume | *"Heard the Plume had a passenger."* | DRAFT 2026-11-11 |
| PL-113 | You settle Tolliver's whole list at a dock | *"Kind Regards reports all square. Suspicious."* | DRAFT 2026-11-11 |
| PL-134 | Your yard's lamp is lit for the first night | *"New light in the belt. Somebody's home."* | DRAFT 2026-11-11 |
| PL-135 | You crack the Ceres Bell | *"Bell sounds different. Nobody's saying who."* | DRAFT 2026-11-11 |
| PL-136 | You win three races in one day | *"Somebody get that rope a licence."* | DRAFT 2026-11-11 |
| PL-160 | You return stolen cargo to its owner | *"Stolen goods came home today. No questions."* | DRAFT 2026-11-11 |
| PL-161 | Your yard wins its first raid | *"The rock with the light kept its light."* | DRAFT 2026-11-11 |
| PL-162 | You dock at all five towns in one day | *"Five towns, one rope, one day."* | DRAFT 2026-11-11 |
| PL-185 | You cut another ship's tow line | *"A line was cut out there. Neat work."* | DRAFT 2026-11-11 |
| PL-186 | You quench Rhea's hot cargo at Vesta's fall | *"Steam over Vesta. Somebody's freight ran hot."* | DRAFT 2026-11-11 |
| PL-187 | You thread the Charon arch on the inhale | *"Somebody threaded the arch on the inhale."* | DRAFT 2026-11-11 |
| PL-209 | You relight a dead lane's beacons | *"Dead lane relit. Traffic appreciates it."* | DRAFT 2026-11-11 |
| PL-210 | Slate mends something of yours overnight | *"Somebody left a welder work. It's done."* | DRAFT 2026-11-11 |
| PL-211 | A Slipway kid beats you in a race | *"One of the crescent kids took a race."* | DRAFT 2026-11-11 |
| PL-240 | You wear the same mark into all five towns | *"That mark's been around. So has its rope."* | DRAFT 2026-11-11 |
| PL-241 | The tug tows you in while you played dead | *"One derelict recovered. It waved."* | DRAFT 2026-11-11 |
| PL-242 | A frozen Wasp rides the Cryo ice barge | *"The ice barge has a new figurehead."* | DRAFT 2026-11-11 |
| PL-254 | You weigh a whole wreck on the Nereid Scale | *"Somebody weighed a wreck. The Scale held."* | DRAFT 2026-11-11 |
| PL-255 | You push a stranger's disabled ship to dock | *"Good turn out there. Logged."* | DRAFT 2026-11-11 |
| PL-256 | You settle your fines in full | *"Fines settled in full. Unusual."* | DRAFT 2026-11-11 |
| PL-305 | You give your berth to an overloaded hauler at a dock | *"Somewhere a dockmaster owes you one."* | DRAFT 2026-11-13 |
| PL-306 | You leave a working spare where a broke-down hull can reach it | *"Left-handed help. The best kind."* | DRAFT 2026-11-13 |
| PL-307 | Your fiftieth arrival at one station is toll-paid by the house | *"Fifty visits. Some places count."* | DRAFT 2026-11-13 |
| PL-308 | You steady a rookie's first tow with one lamp flash | *"Rookie's station chalked you HELPER. Good look."* | DRAFT 2026-11-13 |
| PL-309 | You take a stranger's leak under tow with no bounty posted | *"No bounty on that one. Did it anyway."* | DRAFT 2026-11-13 |
| PL-310 | A fuel hatch is left unlocked for you at a dark waystation | *"Somebody left the tab open. Says nobody."* | DRAFT 2026-11-13 |
| PL-311 | You return a borrowed lantern lit | *"Lanterns come back lit out there. Rare."* | DRAFT 2026-11-13 |
| PL-312 | The market line moves early for you, three days straight | *"The chalk seat stays empty. Line knows."* | DRAFT 2026-11-13 |
| PL-313 | A crew tows your skiff home after debris weather | *"Whole lane came out for one skiff."* | DRAFT 2026-11-13 |
| PL-314 | Your repairs start coming back with the wash included | *"Repairs come washed now. Somebody tips."* | DRAFT 2026-11-13 |
| PL-315 | You give way three times in one shift | *"Three yields, one shift. Well raised."* | DRAFT 2026-11-13 |
| PL-316 | A convoy paces a stranger home at dawn, wordless | *"Paced them all the way in. Silent."* | DRAFT 2026-11-13 |
| PL-317 | You plate a sleeping stranger's window against the morning flare | *"Somebody slept late. Somebody got up."* | DRAFT 2026-11-13 |
| PL-318 | Your callsign keeps turning up on kindness chalks | *"The chalks read like a fan letter."* | DRAFT 2026-11-13 |
| PL-319 | You take the medal but leave the note | *"Medal's gone, note stays. The deal."* | DRAFT 2026-11-13 |
| PL-320 | You coach one clean takeoff at a launch mouth | *"Someone's coaching takeoffs again. For free."* | DRAFT 2026-11-13 |

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
| PL-163 | **On the call.** Kill by collision while Kiln is still saying the round's name, and the crowd shouts the end of it | Time it | DRAFT 2026-11-11 |
| PL-164 | **The gate gawker.** Between rounds one gate stays open a crack, and a Wasp watches you shop, bobbing | Shop; or bob back — it bobs more | DRAFT 2026-11-11 |
| PL-188 | **Reversed robbery.** A Reaver makes the gates with your Scrap. Line it in the gate mouth and it all falls out — yours, and two other pilots'. Kiln: *"Sponsors love a chase."* | Chase; or let it go and hear Kiln enjoy it | DRAFT 2026-11-11 |
| PL-189 | **Rung.** Put an enemy through the gong and the crowd is louder than Kiln | Aim for it | DRAFT 2026-11-11 |
| PL-212 | **The wave-back.** Flash your lamps at the stands between rounds and a whole section flashes back | Play to them; they came for this | DRAFT 2026-11-11 |
| PL-213 | **The sweeper's route.** The janitor's path between rounds is the cleanest line on the floor — it sweeps round every hazard on the map | Follow it once and learn the room | DRAFT 2026-11-11 |
| PL-222 | **One shot short.** Try Kiln's round-five-without-firing dare and fail by one shot: Kiln says nothing at all, and the crowd finds that funnier than anything she could say | Try again next run | DRAFT 2026-11-11 |
| PL-223 | **Your own ghost.** The Nightly keeps your best line as a ghost on your own board | Race it; the board only keeps the winner | DRAFT 2026-11-11 |
| PL-224 | **The Brood's shortcut.** In the Hive, a wall you cut stays cut for the run — and the Brood uses your cut too, every one you did not need | Cut only what you need | DRAFT 2026-11-11 |
| PL-225 | **The figurehead.** In the Cryo Drift, throw a Wasp against the passing ice barge and it sticks, frozen, riding the lane a full circuit | Decorate the barge; the crowd has opinions | DRAFT 2026-11-11 |
| PL-226 | **The ding.** In the Storm Lattice, the cable car dings at each pylon just before the arc comes | Move on the ding, not the arc | DRAFT 2026-11-11 |
| PL-321 | **The veteran's tap.** Between rounds, a scarred drone taps your shoulder-lamp twice and points at a door you have not bought — then at your scrounge pile | Take the hint; or ignore it twice — the drone picks somebody else to help | DRAFT 2026-11-13 |
| PL-322 | **The crowd's coin.** Clear a round with a stunt — a throw, a chain, a last-hit catch — and the stands throw scrap down at your feet worth more than the round paid | Take the bow; or taunt the crowd for more — the next throw lands at the other fighter | DRAFT 2026-11-13 |
| PL-323 | **The medic mule.** Come off a round badly hurt and a medic drone trundles across to patch one bar, free, no bill, once per run | Accept the patch; or farm it by self-harm — the mule stops coming, mid-run | DRAFT 2026-11-13 |
| PL-324 | **The loaner gun.** Before round five with a drained wallet, a wall mount grows a gun stenciled LOANER — no charge. Bring it to round ten and the loan is settled in the ledger | Return it by ten; or keep it past ten — loaners stop spawning for your runs, a month of floors | DRAFT 2026-11-13 |
| PL-325 | **The underdog plate.** Lose five straight and the floor spawns one extra health pad, unannounced, near your wreck | Take the mercy; or lose on purpose to farm it — the sixth loss spawns nothing, and the floor is not sorry | DRAFT 2026-11-13 |
| PL-326 | **The shadow coach.** After a death, your own wreck's ghost replays one better route — line, doors, taps, the whole run, once | Watch and learn; or skip it three times — the ghost stops showing, and the replay keeps its secrets | DRAFT 2026-11-13 |
| PL-327 | **The open door.** On the last round before a boss, one random door stands open and paid, a chalk arrow beside it | Use the gift; or wait for two — the arrow moves on, and the door shuts | DRAFT 2026-11-13 |
| PL-328 | **The Tap cheer.** Let a stranger share your Tap's output mid-round and the stands chant; the Tap runs one surge longer than it should | Share the tap; or hog every tap — taps on your runs run dry a beat early | DRAFT 2026-11-13 |
| PL-329 | **The veteran's seat.** Hold still in the corner seat between rounds — an old champion's name chalked above it — and your next draft shows one stat it usually hides | Sit the seat; or chalk your own name over it — your next draft is blind, and the chalk remembers | DRAFT 2026-11-13 |
| PL-330 | **The surrender door.** Outgunned past hope in the first minute, a side door opens — no taunt, no toll, an exit that never touches your record | Leave with your hull; or exit-camp for pity doors — the floor stops opening them for your hull | DRAFT 2026-11-13 |
| PL-331 | **The free forge.** Feed the Forge scrap you scrounged off the floor — never bought — and one upgrade runs free | Earn the free slot; or buy your way to it — scrounged means scrounged, and the Forge knows its ledger | DRAFT 2026-11-13 |
| PL-332 | **The mascot.** A tiny drone with a painted number adopts your run: follows your wall guns, perches on your Tap, watches everything | Feed it a final blow; or starve it of spectacle — it flies across the floor to the other fighter | DRAFT 2026-11-13 |

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
| PL-165 | Pallas | The rat-run. A delivery skiff takes Rib Street corner by corner off the bounce plates, flat out, every hour. The street parts for it — everyone knows the run | Follow its line clean, and the street parts for you too; or cut it off, and your tag goes chalked on a plate: the one who cut the run | DRAFT 2026-11-11 |
| PL-166 | Pallas | The bright one. A funeral tow passes, every light on Rib Street dims — and one stranger runs lamps-full straight through it | Flash yours at them once, and Mother Calloway nods at you later; or run bright yourself, and be remembered beside them | DRAFT 2026-11-11 |
| PL-167 | Charon | The arch. Where the growth bridged two hulls, locals fly through the living arch — wide on the exhale, narrow on the inhale | Thread it on the exhale; or on the inhale, if you must | DRAFT 2026-11-11 |
| PL-168 | Charon | Ruth's knock. Any wreck in the garden's reach: bump it once before you Line it, and something knocks back, once | Knock, always; or skip it, and the growth holds your line one beat too long on release | DRAFT 2026-11-11 |
| PL-169 | Ashfall | The old trail. Someone's trail runs into an ash drift and stops. Follow it: the out-trail is there too, wind-filled, and a lamp still burns where they rested | Follow it through; or plough your own line beside it — both trails stay | DRAFT 2026-11-11 |
| PL-170 | Ashfall | The window that doesn't. Wick lights one window per relief run, and the count climbs — but one window on the scar has never lit, any run | Look, lit by your own lamps; or pass it by | DRAFT 2026-11-11 |
| PL-171 | Phoebe | B flat. The harbor's bells are tuned, and Keeper Aud's ear is better. Come in dented and he knows your pitch before you dock: *"You rattle in B."* | Get patched; or rattle on — the whole row knows it is you | DRAFT 2026-11-11 |
| PL-172 | Kepler | Riding the shade. The shade's edge crosses the Scar on its own schedule, and the stalls unfold where it touches. Fly on the line and the market opens round you as you go | Bring the market with you; or sit in its path — a stall unfolds round your hull, and Okoye says *"Rent."* | DRAFT 2026-11-11 |
| PL-173 | Orcus | Hesper's light. Once, it does not cross on time. Go and look: the lamp is simply out. Bump it alight and it crosses exactly on time, as if it never stopped | Relight it; or wait in the dark, and see who else comes to look | DRAFT 2026-11-11 |
| PL-190 | Dione | Off-hours. The range dark, the drones racked, and Lt. Sorrel alone on the rail: shooting one drone down, catching it, racking it, again | Watch; or take a turn — she racks them slower for you | DRAFT 2026-11-11 |
| PL-191 | Veil | Less metal showing. In the storm wall, run lamps dark and the lightning finds the pylons; run lit, and it finds you | Run dark and slow; or run bright and mean it | DRAFT 2026-11-11 |
| PL-192 | Hyperion | Again, maybe. Mags says one thing about every ship that clears the Cut. Clear it clean and yours is: *"Again, maybe."* | Earn the maybe | DRAFT 2026-11-11 |
| PL-193 | Sedna | One short. Senna's lamp line runs out into the dark. Count the lamps and count her words: the line is always one lamp short of the names she reads | Count them yourself; or stop counting — it is easier out here | DRAFT 2026-11-11 |
| PL-214 | Proteus | Pyrrha's box. Hand Pyrrha anything and she lifts it once, sets it down, and tells you what it is worth as a rumour. Arrive empty-handed and you get the speech: *"A reading's a rumor. Bring me a box."* | Bring her the strangest thing you can tow | DRAFT 2026-11-11 |
| PL-215 | Kepler | Somebody's stall. One stall at the Scar sells a single item a night, and the item is always somebody's lost thing | Buy it back for its owner; or wonder how it keeps getting lost | DRAFT 2026-11-11 |
| PL-216 | Nyx March | The blue minute. On nights no lot is due, the light on the Fence still turns blue for one minute — and every ship in Nyx March looks away | Look away with them; or watch the blue, and Clerk Yune will make a small note about you | DRAFT 2026-11-11 |
| PL-235 | Eunomia | The new weld. Kowalczyk's own seal-flare launcher is welded shut — one clean weld, newer than everything else on his hull. He did it himself | Notice; say nothing | DRAFT 2026-11-11 |
| PL-236 | The Bolus | Ives's minute. Every day at the same minute, Ives stands on the wall's road, hands in pockets, riding the Breath like a ferry | Stand your ship beside him for one breath | DRAFT 2026-11-11 |
| PL-237 | Rhea | Honk at heat. Rhea haulers honk at any hull carrying an old scorch, whoever earned it | Wear your burns; they were earned somewhere | DRAFT 2026-11-11 |
| PL-238 | Io | Half and half. Coldburn Rey's hull is painted half one flag's colours, half the other's. Both sides pretend not to see him | See him | DRAFT 2026-11-11 |
| PL-239 | Haumea | Rowan's tap. Tap Rowan strikes the ice once a pulse, and the whole rift flashes on his stroke | Move on the tap; everyone out here does | DRAFT 2026-11-11 |
| PL-247 | Nereid | The scandal. Put a wreck on the Scale and the whole yard stops to watch the number — and argues for an hour about whether that counts | Weigh anything; the yard loves a scandal | DRAFT 2026-11-11 |
| PL-333 | Nyx March | The no-questions shelf. One shelf at the Fence is stocked with one useful thing, free, restocked between visitors, priced only as a rumor | Take it when you need it; or resell it at Yune's own counter — the shelf goes dry for you specifically | DRAFT 2026-11-13 |
| PL-334 | Hyperion Cut | The wind-break chain. At the Cut's worst reach somebody keeps a queue of chained handles so small hulls can pull through hand over hand | Use a handle, let go at the mark; or skip the chain — handles stop being chained, and the wind argues with you alone | DRAFT 2026-11-13 |
| PL-335 | Kepler Scar | The dawn line. The chart post carries a fresh chalk of today's safe line through the Scar, redrawn every dawn by an anonymous hand | Follow the chalk and add a correction if you find one; or chalk a wrong line for fun — visitors chalk over your name for a month | DRAFT 2026-11-13 |
| PL-336 | Orcus Shadow | The lamp keeper. The keeper lights your dark side free if word says you helped anyone else that day — and the keeper hears everything out here | Help somebody first; or help nobody and grumble — your dark side stays dark, and the lamp knows why | DRAFT 2026-11-13 |
| PL-337 | Rhea Cinder | The honor urn. A coffee urn at the Cinder runs on honor credits: take a cup, drop a bolt in the tin | Pay the tin; or skip it daily — the urn runs dry, and the chalk explains exactly who dried it | DRAFT 2026-11-13 |
| PL-338 | Haumea Rift | The tow-post. The Rift's post lends a line to stuck hulls, no fee, one per hull per week | Borrow your one; or take two in a week — the post rations you for a month, in front of everyone | DRAFT 2026-11-13 |
| PL-339 | Eris Margin | The signal mirror. When debris weather closes the Margin, a fixed mirror flashes three short from the post — saving you the whole dead trip | Turn back on the flash; or ignore it and fly in anyway — the keeper stops flashing for your hull | DRAFT 2026-11-13 |
| PL-340 | Phoebe Echo | The echo count. Clap (a hull tap) at the Echo's trading post and the echo counts back your hull's remaining service life, as a joke that is somehow never wrong | Take the joke; or clap all night — the post bans clapping for your hull, and the echo stops answering | DRAFT 2026-11-13 |
| PL-341 | Nereid Shoal | The re-strung buoys. The Shoal's marker buoys are re-strung before dawn by a volunteer. Snag a loose one and they will re-string YOUR hull's markers too, free | Leave theirs be; or cut a marker for parts — your hull gets no re-string, ever, in that water | DRAFT 2026-11-13 |
| PL-342 | Proteus Well | The bleed vent. The Well's oxygen bleed runs free for stragglers, one lungful at a time, first come | Breathe and go; or tape a bag to it — the vent gets a meter, and the bag gets returned to you | DRAFT 2026-11-13 |
| PL-343 | Triton Wake | The lift bell. Ring the Wake's bell and a passing hauler breaks off to check your line once | Ring once; or ring it twice — the bell goes quiet for your hull, and haulers stop breaking off | DRAFT 2026-11-13 |
| PL-344 | Eunomia Gulf | The needs list. The Gulf's fence posts a list of small parts the yards out here actually need, with a tip above market rate for each | Fill a need; or lowball the list — your offers get lowballed back, everywhere on the Gulf | DRAFT 2026-11-13 |
| PL-345 | Sedna Dark | The kettle window. The one lit window keeps a kettle going for whoever knocks, any hour, no charge, one cup | Knock for the cup; or knock and ask for fuel too, every night — the kettle cools for you, and the window stays warm | DRAFT 2026-11-13 |
| PL-346 | the Bolus | The fixed rope. Inside the iris, a rope line runs the safe path through, maintained by generations of passers-by, mended with whatever they had | Use it, mend it if it's fraying; or cut a length for yourself — your next transit finds the line gone and the iris in no mood | DRAFT 2026-11-13 |
| PL-347 | Dione | The small-hull drum. The Exchange runs a lottery drum: one free part a week, drawn at the bell, small hulls only | Enter fair; or enter under three hull IDs — the drum remembers voices, and skips yours by name | DRAFT 2026-11-13 |
| PL-348 | Pallas | The seam kitchen. Rib Street's cook feeds anyone who worked the seam that day, off the books, no receipt | Work, then eat; or claim the meal without working — the cook serves you last, forever, and tells the other cooks | DRAFT 2026-11-13 |
| PL-349 | Io Reach | The mercy tug. A tug stands by the launch mouth every dusk, no fee, one tow, first claimant | Need it once, say so; or fake stalls daily — the tug stands elsewhere at dusk, and dusk lasts a season | DRAFT 2026-11-13 |
| PL-350 | Charon Expanse | The key wall. The chapel-berth keeps a wall of keys left by travelers for anyone stuck out here. Borrow one, return one | Return what you take; or keep a key — the wall locks, and your hull is chalked under LOCKS WHY | DRAFT 2026-11-13 |
| PL-351 | Veil Nebula | The sample pad. Research leaves working mislabeled parts on the public pad for locals — take one, it was bound for the recycler | Take one; or clear the pad to sell off-station — the pad goes bare, and your next part is labeled wrong in the dangerous way | DRAFT 2026-11-13 |
| PL-352 | Ashfall Reach | The chalked name. The keykeeper chalks one name a week for a free gate service, drawn from whoever was seen helping around the station | Help and wait for the chalk; or nominate yourself — the chalk never lands on nominees, and everyone knows why | DRAFT 2026-11-13 |
| PL-353 | Dione | The clean stamp. The funnel's checker stamps small hulls CLEAN for a month after one honest declaration, unprompted | Declare once; or smuggle once — the stamp and the memory last a year, and the line moves slower for you | DRAFT 2026-11-13 |

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
| PL-174 | **The witness.** A civilian saw it, and your description goes chalked on the Berth Board — wrong colour, wrong tag. It holds until the witness docks and corrects it | Enjoy the wrong chalk; or be gone before they dock | DRAFT 2026-11-11 |
| PL-194 | **Your wake.** Boost past a working crew and their work scatters — ore piles drift, tethers swing, and the crews hold up whatever is at hand | Slow down past work; or owe three crews in one pass | DRAFT 2026-11-11 |
| PL-227 | **Seen.** Wear a mark from one town into a town that has never seen it: a kid points, and an old pilot nods once — they know what it took | Wear your history around | DRAFT 2026-11-11 |
| PL-228 | **Two names.** Two towns' Berth Boards have named you differently for the same deed, and each town is sure theirs is right | Live with both; each town is certain | DRAFT 2026-11-11 |
| PL-229 | **The other name.** The town chalked a name on the board for the day the tug brought you in asleep, and it stuck | Earn a better one; the town will keep both | DRAFT 2026-11-11 |
| PL-250 | **Known by name.** Near a town that has named you, civilians give you room — your own name, no mark needed | Enjoy it; or exploit it — they let you, muttering | DRAFT 2026-11-11 |
| PL-251 | **The other side of it.** A disabled stranger hails the nearest good hull, and today that is you | Push them to the dock; or fly past — the next time you are down, nobody comes | DRAFT 2026-11-11 |
| PL-354 | **The good-hull rate.** The law boards keep quiet hull ratings; hulls that towed strangers dock cheaper everywhere for a month, no sign, no announcement | Earn the rate; or fake rescue receipts — the boards compare notes with the docks, and fakes dock at a premium | DRAFT 2026-11-13 |
| PL-355 | **The unit.** Help three strangers in one sector and stations start using your callsign as a measure — "one [you] of fuel" meaning a spare tank's worth | Be the unit; or price the unit — it changes to somebody else's name within the week | DRAFT 2026-11-13 |
| PL-356 | **The parade berth.** Come home off a long deep-route run and your home berth is swept, lit, and stocked by whoever kept the light while you were gone | Dock and let them; or ghost the sector for months first — swept, yes, but cold | DRAFT 2026-11-13 |
| PL-357 | **The warm grid.** Dock with an empty charge and the berth's grid tops you to launch minimum before the meter even wakes | Take the minimum; or drain the grace daily — the grid meters you from zero, and the grace goes to someone else | DRAFT 2026-11-13 |
| PL-358 | **The apprentice's return.** An apprentice you were decent to back at Helios turns up at Vesta years later, carrying exactly the part your build has been missing, at their own cost | Pay their price; or haggle them down — apprentices talk to journeymen, and journeymen set prices | DRAFT 2026-11-13 |
| PL-359 | **The escort's gift.** Walk a slow convoy through dangerous water to the far end and they press their spare countermeasure on you at the gate | Arrive with them; or peel off at the last leg — gifts need arrivals, and convoys remember departures | DRAFT 2026-11-13 |
| PL-360 | **The rain check.** A station you once saved keeps your docking comped for a year — the chalk is on the board beside the toll, your name on it | Use the chalk; or sell it to another hull — the board keeps the comp, adds a fine, and your name stays up there anyway | DRAFT 2026-11-13 |
| PL-361 | **The second start.** Hit true bankrupt and a starter kit waits in a locker at your last dock — rope, tank, chalk: FROM THE LANE | Take it and pay it back someday; or go bankrupt twice — the second kit comes with a loan note, in someone's handwriting | DRAFT 2026-11-13 |
| PL-362 | **The name on the plate.** Wear a mark you earned into its home sector and dock plates greet your hull by name, out loud | Wear what you earned; or counterfeit a mark — the plates greet you by the real owner's name, loudly | DRAFT 2026-11-13 |
| PL-363 | **The family rate.** Fly one lane long enough and berths quietly go family-rate for you — discounts nobody announces, taken off before you see the total | Stay in the lane; or change hulls to farm it twice — family means the name, and the name only rides one hull | DRAFT 2026-11-13 |

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
| PL-175 | **First.** Beat Juno to a place you both marked, and the wall there reads only your tag — with, small, underneath: *J.C.* and nothing else | Leave it as is; or add the plus yourself | DRAFT 2026-11-11 |
| PL-195 | **The fixed X.** One mark on your Chart is not yours, and never moves: a small X beside nothing, there since your first chart | Go and look: nothing, at first | DRAFT 2026-11-11 |
| PL-196 | **Ahead of you.** Come back to the mirror rock wearing your marks, and the reflection wears them too — and one more you have not earned yet | Catch it up; or stop looking | DRAFT 2026-11-11 |
| PL-364 | **The kindness ledger.** A sealed ledger welded to a lane post records every unclaimed kindness done in that lane, and pays the whole book out once a year, in parts, to the names in it | Do the kindnesses and wait for the payout; or forge entries — the ledger pays what each entry weighs, and lies weigh nothing | DRAFT 2026-11-13 |
| PL-365 | **The lamp garden.** A cluster of rocks at a waystation each carries a name and one working lamp, kept lit by nobody official, for years | Sit with them a while; or salvage the lamps — your hull's lamps run dim at that station, and the keeper of nothing knows | DRAFT 2026-11-13 |
| PL-366 | **The registry hatch.** A hatch that takes what you have and returns what you need — once, for anyone, ever | Post honestly once; or game it with a token — it returns exactly what you gave, and does not open again for you | DRAFT 2026-11-13 |
| PL-367 | **The lingering lift.** A dead station's lift still runs — somebody keeps it oiled — hauling small hulls up the spine to a long view and a stashed gift at the top | Ride it and leave the gift for the next hull; or carve your name in the car — it stops at your floor forever after | DRAFT 2026-11-13 |
| PL-368 | **The thank-you slate.** A slate at a dockside: leave anything on it with your tag, and one day the tag comes back engraved THANKS, with a small part you were short of | Leave something real; or leave junk tagged as treasure — slates engrave what they weigh, and everyone can read the slate | DRAFT 2026-11-13 |
| PL-369 | **The last allowance.** A dead man's standing order at a depot: one charge cell a month to whoever asks in person, code word required, asked once a month only | Learn the word the slow way, from the old regulars; or brute-force it — the order closes forever, and the depot chalks who closed it | DRAFT 2026-11-13 |

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
| PL-252 | **The regular's hour.** The hauler that first called on your light comes back at the same hour every week, expecting the hopper full | Be full; or miss the hour — it circles once, leaves, and the next call is a long time off | DRAFT 2026-11-11 |
| PL-253 | **The wall's first dent.** Win your first raid and one wreck stays half-buried in your wall where it hit | Leave it — proof; or feed it to the works | DRAFT 2026-11-11 |
| PL-370 | **The housewarming part.** The first stranger to dock at your new yard leaves a good part wedged in your airlock frame, no note | Keep it mounted; or charge visitors docking fees from day one — gifts stop, fees don't | DRAFT 2026-11-13 |
| PL-371 | **The lane tithe.** Haulers who use your freight lane start leaving their overloads in your hopper on the way through — a quiet tithe of the road, nobody discusses it | Let the tithes lie; or bill them for the lane — they route around you, and the lane goes quiet in a week | DRAFT 2026-11-13 |
| PL-372 | **The wreckers' courtesy.** After you win a raid, their support ship lingers to recover their own wounded. Let it work, and the next raid comes in softer — somebody talked | Let them collect; or shoot the recovery — every future raid hits harder, and every yard on the lane knows why | DRAFT 2026-11-13 |
| PL-373 | **The hearth lamp.** The first caller's lamp warms any visitor who docks cold at your rock: they stay longer, trade more, tell the next hull | Keep the lamp warm; or turn it into a policing floodlight — visitors dock fast, buy nothing, and the first caller stops coming | DRAFT 2026-11-13 |

## Suggestions

One line each. The lead designer writes them up or does not.

- One wall on Sker gets a new painted portrait every week; nobody has ever seen it happen.
- Once a week one Concord patrol flies a perfect lap of a town, and everything in the lane stops to watch.
- Big Ansel's shutter still has a dish chalked up for a regular who never came back for it.
