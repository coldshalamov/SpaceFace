<!-- LIFETIME: STABLE -->
# 07 — Missions and encounters

**Canon added in this file (PROPOSED CANON, for row 537):** the forty-eight encounters as events in the world, the Colossi roster beyond the existing bosses (Nest Carrier, Casket Worm, Furnace Maw, Yardmaster, Adjudicator 44-C, Hive-hulk, Clerk 0003), and the world events Rock Rain and Derailment cascade.

## 1. Seven laws for every mission and encounter

1. **Physical first.** The objective is a physical act: move it, catch it, break it, build it, hide
   it. A mission that says "hold E" or "press 1 to salvage" is the wrong mission (§23.2 CR-CHAIN
   *Thin*).
2. **Three verbs, one situation.** Every encounter invites at least three different solutions from
   the toolbox (Line, throw, Pull, Shove, Pin, guns, the scenery). Name them in the brief for the
   builder, never on the player's screen.
3. **The stranger test.** A player who just walked up can say, from the picture alone, what is going
   on and what they could do.
4. **Fail forward.** Failure produces a new situation, never a reload (VISION "failure should make
   better stories"; §23.1 CV-SO). Each encounter below names its fail-forward.
5. **A receipt.** Every encounter leaves something on the map that something else reads (law 6).
6. **Quiet before loud.** Ordinary life is established before it is disrupted, so the disruption is
   legible.
7. **Rare physicists.** Enemies that grab or throw are authored specialists, one at a time and
   telegraphed (owner ruling, §22.11). Common enemies are ammunition.

## 2. Mission archetypes

Each archetype reuses a live owner. `src/systems/missions.js` and `src/data/missions.js` hold 21
mission types today. Build new archetypes as types there, not as a parallel system.

| Archetype | The verb | Fail-forward | Receipt | Builds on |
|---|---|---|---|---|
| **Haul** | carry cargo through danger | lost cargo drifts as salvage for someone, maybe you | delivery record; a market move | `cargo`, `economy` |
| **Tow** | move a big body on the Line | a dropped tow becomes terrain where it fell | the body stays at its new place | `tetherGameplay` |
| **Convoy** | keep a spine together | broken containers become a Spine Break salvage field | the convoy's fate on the board | `traffic`, `aiEncounter` |
| **Interdiction** | stop a ship | it escapes and becomes a recurring grudge | bounty or warrant | `bountyHunt`, `nemesis` |
| **Salvage** | strip a wreck | a rival salvor beats you and the wreck's value moves | a stripped wreck | `salvage`, `aftermathWrecks` |
| **Compost** | feed mass to a garden | the tide line advances | garden growth stage | Understory (new) |
| **Construct** | tow modules into a frame | a half-built structure stands, damaged | a structure on the chart | `claims`, outposts |
| **Heist** | steal mass by the tonne | an alarm turns it into a chase | a missing station section | `heistFacilities` |
| **Weighing** | beat or bluff a scale | fined, so a warrant hunter follows | customs record | `lawSecurity`, `economy.runScan` |
| **Catch** | intercept a thrown object | it lands with the other side | who holds the crate | `cargoCustody` |
| **Cull** | clear a swarm with physics | the tide spreads to the next lane | tide line | `swarmArena`, `survivalRun` |
| **Dismantle** | take a colossus apart | parts you left become a salvage field | the boss's scattered plates | `capitalBossRuntime` |
| **Herd** | push strays into a flock | the flock scatters across the lane as hazards | flock position | new (SHEPHERD-12) |
| **Run** | a sling or canyon route against a clock | you arrive late and the price or claim has moved | route time on the board | `racingGeometry` |
| **Appeal** | bring the right mass as evidence | the directive holds, so a law zone grows | Verge record | `precursorMachines` |
| **Throw-delivery** | deliver by throwing it into a catch-net | a miss turns into a recovery job | delivery record | `lootShards` catch nets |

## 3. The encounter library (E-01 to E-48)

Each entry gives where it happens, the setup, the play, the twist, the fail-forward (**FF**) and what
it **leaves**. The numbers are stable: other bible files cite them.

### Reach, Concord and the lanes

- **E-01 Lane Ambush in the Rocks** · any Junction or Belt lane · A Reach pack hits a hauler inside
  a rock field. · Throw rocks into the pack, pull it into a cluster, or shove the hauler clear. ·
  *Twist:* the hauler drops its cargo to run, so the pirates split between you and the loot. · FF:
  the hauler dies and its cargo is salvage. · *Leaves:* wrecks, loose cargo, a patrol notice.
  **This is the standard pocket for §33 row 497.**
- **E-02 Bowling Pins** · Helios and Dione · A Concord formation stands "hostile" (a drill, or a
  warrant). · Fling the commander and the formation locks rigid; then strike. · *Twist:* a rigid
  formation drifts into lane traffic. · FF: the formation re-forms around a new commander. ·
  *Leaves:* the drill score or the warrant.
- **E-03 Clamp Tug-of-War** · customs gates · A Clamp Tender grabs your tow. · Out-pull it (Line
  strain against its clamp) or cut the clamp arm with a thrown rock. · *Twist:* you win and the
  tender's clamp comes with you as a free throwable. · FF: the cargo goes to the Evidence Locker
  (E-31). · *Leaves:* a locker entry.
- **E-04 The Weighing** · Dione Gate 3, the Eris sweep (mobile) · A Scale Barge weighs your hull
  against your manifest. · Hide the extra mass in a big rock's mass shadow, hand it to a decoy pod,
  hold it with a Hush Head, or pay. · *Twist:* the scale is honest, but the manifest isn't yours. ·
  FF: a fine, then warrant hunters. · *Leaves:* customs record. **The root of mass-signature
  stealth (08 §5).**
- **E-08 The Nest** · Charon radiation lane · A Reach Nest Carrier launches wasp packs. · Rip the
  belly doors off and throw its launching Wasps back in. · *Twist:* the carrier vents its whole
  nest at once when it is half-stripped. · FF: it escapes and raids the next lane. · *Leaves:* the
  carrier's hull, a T4 throwable.
- **E-42 Bowling for Blockades** · Sker gate camps · A gate camp of chained rocks with turrets. ·
  Cut the chain links with throws, and the blockade drifts apart. · FF: the camp re-chains. ·
  *Leaves:* an open or closed gate.
- **E-44 Two Enemies, One Throw** · Rhea Cinder · A Reach raid meets a Bloom tide. · Throw mites into
  pirates and pirates into Spindle mothers. · *Twist:* both sides turn on whoever hurt them last. ·
  FF: the survivor holds the lane. · *Leaves:* who holds the lane.
- **E-47 The Lying Distress Call** · any lane · A distress beacon, with a Reach pack under the wreck.
  · Scan before approach; throw the wreck at the pack. · FF: an ambush on the approach. · *Leaves:*
  the beacon remembered as a lie.

### Meridian, Drift, Quiet and the cargo game

- **E-05 Spine Break** · the Tethys approach · Reach cut a cargo spine in a rock field. · Re-couple
  the train, steal containers, or sell to the Pitborn. · *Twist:* the hull tickers count each
  container's value down as it drifts. · FF: the Pitborn take what is left. · *Leaves:* a price
  move on the board.
- **E-06 Claim Jump** · Ceres, Hyperion · One crew is about to collapse the shaft on the other. ·
  Brace the falling rock with your Line or fling the charge away. · FF: the collapse happens and the
  survivors owe you, or hate you. · *Leaves:* a collapsed or open shaft.
- **E-07 The Swap** · Nyx March · Two Quiet runners toss a sealed crate across a rock field. · Catch
  it mid-air with the Line. · *Twist:* the crate is a decoy, and the real one is in the second
  throw. · FF: the Quiet sell your route. · *Leaves:* who has the crate.
- **E-12 The Avalanche Haul** · Hyperion Cut · Haul a full tow down the canyon as a slide starts
  behind you. · Fly and steer the tow through the slide. · FF: the tow is buried and becomes a dig
  site. · *Leaves:* the slide debris, which reshapes the Cut.
- **E-13 The Slingshot Run** · Proteus Well · Reach a finding before the den. · Whip around the Well
  with the Line anchored to well-sediment. · FF: the den files it first. · *Leaves:* who owns the
  finding.
- **E-14 The Melt Race** · Nereid Shoal · The ice cargo sublimates on sunlit legs. · Take shaded
  routes, use rock shadows, or fly faster. · FF: you deliver less mass, logged. · *Leaves:* the
  waystation scale record.
- **E-39 The Breaker Derby** · Ceres, Hyperion · Drift crews race to split the biggest rock. ·
  Breaker Head slams, and chunk throws into the competitors' piles. · FF: you lose the derby but keep
  the chunks. · *Leaves:* a Deed Name on the rock.

### Bloom fights

- **E-09 The Eel Whip** · Triton Wake · Wake eels follow your wake. · Grab one by the tail; while
  held, it is a whip. · *Twist:* the eel's pain loop thrashes on its own. · FF: eels wrap you, so
  spin to shed them. · *Leaves:* eel bodies in the lane.
- **E-11 Glassback Grazing** · Ceres incursions · Glassbacks scrape a mining rock and reflect your
  guns. · Smash them with rock, and the shards splash. · FF: they strip the claim rock bare. ·
  *Leaves:* a stripped rock.
- **E-16 Lantern Bombardment** · anywhere hot · Lantern cysts drift toward your reactor heat. · Grab
  them and throw them, as bombs, at the pack. · *Twist:* cut your heat (coast) and they drift to the
  nearest hot hull instead. · FF: one bursts on you, and the spore shove scatters your tow. ·
  *Leaves:* spore drift for a while.
- **E-17 Leech Storm** · wreck fields · Hull leeches swarm out of a wreck. · Scrape them off on rock
  or spin hard, then throw the sticky leeches as glue ammunition. · FF: you limp, heavy. · *Leaves:*
  leech-stripped plating.
- **E-27 Husk Recognition** · tidal sectors · A Bloom-colonised Concord patrol flies its old line
  formation (host-shadow). · Treat it as Concord: fling the commander-husk. · *Twist:* LOG reads its
  old transponder aloud. · FF: the husk line reaches a station. · *Leaves:* the husk wrecks, still
  painted.
- **E-28 Spindle Mother Grief** · tidal sectors · Break a Spindle mother's sacs and kill her. · Then
  the grief loop gathers the whole flock at her body: one throw for the jackpot. · FF: the
  aggression cascade, so survive the rush. · *Leaves:* the carcass, a T3 throwable.
- **E-38 Feed the Maw** · Vesta · A Furnace maw hunts the reactor approach. · Stun it with hot slag,
  then tow it out of the lane. · FF: it eats a hauler's reactor and grows. · *Leaves:* the maw's new
  den.
- **E-43 The Reef Surge** · Pallas · The reef current moves the whole arena mid-fight. · Ride the
  surge and let the reef do the throwing. · FF: the surge carries enemies into the Smuggler Den. ·
  *Leaves:* reef debris in new places.
- **E-45 Blind Shepherd Hunt** · tidal sectors · Packs flying coherent inside a shepherd's pulse. ·
  Kill or drive off the shepherd, and every linked pack panics at once. · *Twist:* carrying its pulse
  organ calls swarms to wherever you drop it, including into Reach camps. · FF: the shepherd
  relocates and the tide line jumps. · *Leaves:* tide line movement.
- **E-46 Hive-Hulk Dismantle** · Shaft 7 (B6), the deep tidal zones · A colonised capital ship. ·
  See §5. · *Leaves:* plates, bays and nodes, the biggest ammunition pile in the game.

### The factions' signature encounters

- **E-10 The Too-Perfect Pack** · lanes near Helix interests · A "Reach" pack with flawless
  formation ambushes a Quiet runner. · Break the pattern, and the flags flip to HELIX. · *Twist:*
  the runner's cargo is already logged as recovered contraband. · FF: the runner dies and Helix
  sells its cargo at Bourse. · *Leaves:* a Helix grudge.
- **E-18 Page Nine** · Veil, Ashfall burn · A Vael hazard salvage job; mid-job, a Lien Anchor clamps
  on. · Finish the job heavy, or throw the anchor at arriving claim-jumpers. · LOG: `LIEN
  TRANSFERRED.` · FF: the lien stays and the Vael own part of your hull. · *Leaves:* the lien
  ledger.
- **E-19 Administrative Boarding** · Fulfillment routes · A white boarding pod approaches to reroute
  your cargo. · Fling it off before it docks, or let it file your cargo. · FF: your cargo goes to an
  open order (and can be recovered at its address). · *Leaves:* an order record.
- **E-20 Order #0000001** · the Clerk capital's route · The oldest open order: a crate addressed to
  the Pit, failing verification for fourteen years. · Derail the crate from the Clerk and deliver it
  by hand. · *Payoff:* Sump gets a new broom. LOG closes ticket 0000001. The air does not change. ·
  *Leaves:* the oldest-open-order counter advances.
- **E-21 Barn Raising** · Io Reach and any Frontier site · Tow six modules to a homestead frame
  before a tide or a gate closure. · Snap the modules on, then hold the line with a rock wall. · FF:
  a half-built homestead survives, damaged. · *Leaves:* a homestead on the chart.
- **E-22 The Carried Relic** · Choir space · A certified relic pings your position to every Choir
  ship. · Crack its casing against a rock above impact speed before the shrine radius. · FF: arrive
  with the choir behind you, and the shrine is defended. · *Leaves:* the relic's fate.
- **E-23 Bell Shatter** · Phoebe, Choir shrines · Choir Bells pulse resonance through a crystal
  field. · Throw crystal near the Bell for chain shatters. · FF: the field shatters on *you*. ·
  *Leaves:* a cleared crystal field.
- **E-24 Derailment** · Fulfillment routes · A white re-router hauler on its fixed line. · Hit it
  with enough mass and it derails, spilling backordered goods. · *Twist:* its escorts never fire
  first, but they do re-rail it. · FF: it re-rails and keeps its cargo. · *Leaves:* a loot field and
  an order record.
- **E-25 Hitchhike** · any Fulfillment route · Latch a re-router and ride it across a sector,
  through a tide. · FF: you drop off mid-tide. · *Leaves:* nothing; it is free travel.
- **E-26 The Compost Run** · Charon, Eunomia · Tow wrecks into a garden ring. · Bring the right mass
  before the tide arrives. · FF: the garden is overrun and becomes a Bloom reef. · *Leaves:* garden
  growth and the tide line.
- **E-29 Redacted** · Pallas, Orcus · Censors black out your engines and HUD in a debris field. ·
  Escape the radius by swinging rock to rock. · FF: the Archive copies your logs, and your secrets are
  now trade goods. · *Leaves:* an Archive record.
- **E-30 The Appeal** · any Verge site · You broke a directive, and the court convenes. · Carry the
  right object at the right mass into the Exception Chamber. · FF: the directive holds and the law
  zone grows. · *Leaves:* a Verge record.
- **E-31 The Evidence Locker** · Dione, Helios · A Concord station holding everything seized from you
  since B0. · Steal a whole locker section at Line Class VI. · FF: an alarm turns it into a chase. ·
  *Leaves:* a missing locker section.
- **E-32 The Gate Audit** · the gate due to close this Book · A Helix scaffold welding a gate shut. ·
  Wreck the scaffold with thrown mass. · *Twist:* the Verge Gate Auditor wakes and helps you. ·
  FF: the gate closes on schedule. · *Leaves:* a delayed or closed gate.
- **E-34 The Sleeping Jury** · Verge sites · Twelve dormant jurors. · Bring one piece of testimony (a
  weighed object) per juror. · FF: jurors go back to sleep for a cycle. · *Leaves:* how many jurors
  are awake.
- **E-40 The Cull** · Sker Haven, every Cull arena · A live Bloom-tide culling with a crowd meter. ·
  Kill with style: impact kills, multi-kills, catches. · FF: a low rating, a small purse. ·
  *Leaves:* the leaderboard.
- **E-41 Ballast** · Pitborn yards · Build the biggest junk ball against Clatter before the horn. ·
  Magnet Head, Coupler, and stealing from Clatter's ball. · FF: Clatter's ball is named, not yours.
  · *Leaves:* a named ballast ball in the yard.

### The Orphaned Shift and quiet places

- **E-15 Holding the Rift** · Haumea · HOLDFAST's clamps are failing as the rift cracks. · Tow ice
  spires into the clamps before the crack runs. · FF: the rift widens and the route changes. ·
  *Leaves:* the rift's width.
- **E-33 The Song** · Phoebe · BELLHOP's broken song. · Strike crystals in order with thrown rocks. ·
  FF: you try again; nothing is lost. · *Leaves:* the song plays when you return.
- **E-35 Shepherd's Flock** · Orcus · SHEPHERD-12 herds debris flocks. · Push strays back into the
  flock. · FF: strays drift into the lane as hazards. · *Leaves:* the flock's shape.
- **E-36 Docket's Delivery** · Io · Throw DOCKET, accurately, at its own address across a contested
  floor. · FF: it lands with the wrong flag. · *Leaves:* DOCKET, delivered.
- **E-37 Lamplighter's Last Buoy** · Sedna · Tow the last dead buoy through an incursion to
  LAMPLIGHTER. · FF: the light goes out for a cycle. · *Leaves:* the lit path.
- **E-48 The Quiet Lane** · anywhere beautiful · Nothing hostile: a lane at dawn-light with Mourning
  kites following their grief route around an old wreck. · *The play:* none; fly through. ·
  *Leaves:* nothing. This is ordinary life (VISION "the game needs ordinary life"). It is placed
  deliberately between loud encounters.

## 4. Swarm wave grammar (the Cull and swarm mode)

The live rules in `src/data/swarmMode.js` stay: **pressure is concurrency, not HP**; a round ends
when its finite cohort is defeated; pressure has a release (the armory); cover is the point; variety
arrives one silhouette at a time. On top of them, the Katamari grammar:

1. **Every wave has a jackpot.** Waves are composed so one great throw kills many: a knot, a grief
   loop, or a panic re-form. A player who finds it is rewarded with a cascade.
2. **Tier mix by rating.** Most bodies are **one tier below** the player's current Line rating
   (ammunition). A few are **at** the rating (fights). **One** is **above** it (the aspiration: "next
   round I'll throw that").
3. **Pathology beats.** Every third wave stages a pathology on purpose: a Shepherd to kill, a Mother
   to grieve, or a Lantern drift to weaponise.
4. **The arena climbs.** Arena scale steps (04 §Arenas) follow the rating. The camera opens as the
   rating rises.
5. **The breath.** Between waves the armory opens (existing), and so does a 5–8 s **quiet beat** where
   the debris you made drifts and settles. The aftermath is a picture worth looking at.

A sample twenty-wave Cull run:

| Waves | Arena | Rating (t) | Composition | Beat |
|---|---|---|---|---|
| 1–3 | Pebble Yard | 20 → 80 | mites, then leechers | learn to throw pods |
| 4–6 | Slag Bowl | 80 → 400 | mites, spitters, lantern cysts | the lantern bomb |
| 7–9 | Container Graveyard | 400 → 1,200 | chargers, glassbacks, a Nest Carrier | guns stop working on glassbacks |
| 10–12 | Reef Pinball | 1,200 → 3,000 | bellows, wake eels, a Blind shepherd | panic cascade |
| 13–15 | Garden Ring | 3,000 → 10,000 | bristle rams, a Spindle mother | the grief jackpot |
| 16–18 | Breaker Field | 10,000 → 40,000 | husks (host-shadow), casket worms | the flail matters |
| 19–20 | Yardmaster's Belly | 40,000+ | a Hive-hulk | dismantle the nest |

## 5. Bosses you take apart (the Colossi)

Row 448 ("Colossi — bosses you take apart") already exists. This is its roster. **Law: no health
bar.** The bar is the parts, and every part the player rips off becomes ammunition against the rest.

| Boss | Where | Parts and phases | Ammunition it gives |
|---|---|---|---|
| **Nest Carrier** (mini) | Charon (B2) | belly doors → launch bays → drive | doors (T3), Wasps (T3), the hull (T4) |
| **Casket Worm** (mini) | Ceres derelict (B1 tease, fought later) | segments; cut the middle for the pain loop | segments (T2–T3) |
| **Furnace Maw** (mini) | Vesta (B3) | radiator plates → feeding cavity | hot plates that ignite spores |
| **Mirrorjaw Foreman** | Vesta (B3; existing) | the existing mirror plate and escorts | its plates and escorts |
| **Forge Regent** | Vesta finale (existing) | the existing crown and furnace beam | crown segments |
| **Spindle Mother** | tidal sectors (existing `brood_queen`) | sacs → body | carcass (T3) and the grief jackpot |
| **Yardmaster** | Ashfall, Sker (Pitborn) | accreted wreck pieces, piece by piece; the magnet core last | every piece of it, since it *is* a Katamari ball |
| **Adjudicator 44-C** | a closing gate (Helix arc) | seal emitters → seizure clamp → the gate weld | seal plates, and its clamp as a throwable |
| **Hive-hulk** | Shaft 7 (B6), deep tides | coupling nodes → armour plates → bay doors → the core node | plates (T4), bays full of mites, nodes (each kill a panic cascade) |
| **The Iron Maw** | Ashfall (B7; existing `dreadnought_boss`) | turrets → armour belt → barbette rings → bays → spine | the Gutted Maw: the biggest ammo pile in the game, and the B7 Cull arena |
| **Clerk 0003** (not a fight) | the Fulfillment route | derail its parcel pods; you cannot hurt it | backordered goods |

## 6. World events (systemic)

These run on the existing directors (encounter director, sector sim, lived-world director) and are
visible on the chart. Each has a physical telegraph, a window and a receipt.

| Event | What happens | Telegraph | Receipt |
|---|---|---|---|
| **Bloom tide** | a sector's infestation surges along unclaimed wreck lanes | green haze on the chart; Lostcalls go silent | the tide line |
| **Gate Audit** | a scaffold welds a gate shut over several cycles | a Helix notice on the band; the scaffold appears | an open or closed gate |
| **Convoy surge** | a Meridian spine run through a danger lane | the ticker flags it | prices |
| **Cull broadcast** | the Pitborn cull a tide live; join for a purse | Ma Sprocket on the band | leaderboard |
| **Drift Auction** | the existing Pallas lawless-pocket auction | a band ad | who owns what |
| **Reef Surge** | Pallas's current moves the field | the reef shimmer | debris positions |
| **Rock Rain** | a broken moonlet sheds rock through a lane (free ammunition, and danger) | a streak shower on the horizon | new rocks in the lane |
| **Derailment cascade** | one derailed re-router blocks a route, so the next ones pile up | Fulfillment "rerouting" spam on comms | a loot pile and route changes |
| **Patrol sweep** | a Concord weir moves through a sector | beacon lights in a line | customs records |
| **Storm** | weather as physics (row 449 exists) | the sky changes | storm-shaped debris |

## 7. The rhythm of an hour of Adventure (§33 row 497)

**First contact comes within two minutes, and contact recurs every three to five.** Loud and quiet
alternate. An example from the first hour after B0:

| Minute | Beat |
|---|---|
| 0–2 | Leave Helios. Ordinary lane life. A Fulfillment re-router rolls past on its fixed line. |
| 2–4 | **E-01 lite**: a small mite flock in a derelict drone field. Throw pods. |
| 4–7 | A quiet haul. A Mourning kite crosses the lane (**E-48**). |
| 7–10 | **E-47**: a distress call. Scan it and it's a lie; throw the wreck at the pack. |
| 10–14 | Dock at Tethys. Kessler's scale. Sell. |
| 14–18 | **E-05 Spine Break** on the way out. Re-couple or steal. |
| 18–22 | A Compost Run detour: tow your wrecks to the nearest garden. |
| 22–27 | **E-11**: glassbacks on a claim rock. Guns ping off, so smash them. |
| 27–30 | A quiet beat at the cleared claim. The Breaker cuts. Drift crews wave. |
