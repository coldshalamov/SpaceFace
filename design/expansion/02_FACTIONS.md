<!-- LIFETIME: STABLE -->
# 02 — Factions

Fourteen factions, one template. The canon factions keep their betrayal patterns, graffiti,
superstitions and prison origins (`docs/worldbuilding/orgs/factions-CANONICAL.md`). This file adds
what a physics game needs from each of them:

- what they want **this cycle**, which is where their missions come from;
- how they **fly**, which decides what kind of physical puzzle they are;
- what they **look** like;
- a **roster** where every role says *reuse* (an existing body) or *new* (with a priority);
- one **signature encounter** and one **signature toy** they put in the player's hands;
- their **voice**, their **relations**, and the **mark** they leave on the world (law 6).

Priorities: **P0** is needed for the §33 swarm core or the first hour. **P1** is the campaign.
**P2** is depth. "Reuse" names a model in `src/data/modelTruthCensus.json` or a data row.

**The owner's physics ruling applies throughout (2026-10-21, `build_map.md` §22.11).** Enemies that
grab, throw or reshape the world stay **rare and authored**: one specialist at a time, always
telegraphed. Every such device in this file is either an authored specialist, a boss, a set piece,
or static terrain. Common enemies are ammunition, never physicists.

---

## How the factions read in a fight

The point of this table: a stranger should know, before the first shot, *how to use* everyone on
screen.

| Faction | In a fight they are… | The player's best verb against them | Their rare authored device |
|---|---|---|---|
| Concord | **bowling pins**: rigid formations around a commander | fling the commander, and the formation drifts rigid | Clamp Tender (grabs loose *cargo*, never ships) |
| Meridian | **a flail you can steal**: cargo spines | cut a coupling with a thrown rock | none; they hire escorts |
| Drift | **terrain makers**: they leave fresh rock everywhere | ally them and harvest their blast fields | Claim Collapse set piece |
| Reach | **ammunition**: light, numerous, bunching packs | everything | Harpoon raider (the existing tether specialist) |
| Quiet | **jugglers**: they toss cargo between runners | catch the throw mid-air | none |
| Vael | **contract hazards**: they make you heavier | fling the lien anchor at someone else | Lien Anchor (telegraphed contract clamp) |
| Free Frontier | **allies who need cover** | build them a rock wall | none |
| Choir | **resonators**: their bells shatter crystal | throw crystal near a Bell | Bell resonance pulse |
| Helix | **too-perfect formations**: a false flag you can see | break the pattern and the flag drops | Seizure Clamp (their cutter boss only) |
| Understory | **sponges**: they absorb impacts and eat mass | feed their gardens, don't fight them | Spore cloud (defensive, sticky) |
| Fulfillment | **trains**: fixed routes, enormous momentum | hitch a ride, or derail one for its cargo | none; boarding is paperwork |
| Archive | **blackout**: redaction kills your engines | steer by swinging on rocks | Redaction pulse (disables, never damages) |
| Pitborn | **rivals at your own game**: junk-ball sport | out-Katamari them | Yardmaster magnet (boss only) |
| Verge-Layers | **law**: slow, exact, disabling | appeal with the right evidence, or don't break directives | stasis and nullification (non-physical) |

---

## 1. Solar Concord Navy — CONCORD

*"Every name logged. Every shift counted. Every warden re-signed."* Customs enforcement and gate
control. Canon.

- **This cycle.** Enforce the Gate Audit schedule (01 §2) and hold the customs weirs on Dione and
  Tethys. Recover "seized evidence". Keep the Iron Maw's dead route patrolled: an eleven-year-dead
  Concord dreadnought still broadcasting enforcement traffic, crewed by the children of its crew.
- **How they fly.** Disciplined formations (wedge, line, box) that hold their shape around a
  **commander** hull. They never break formation unless the commander orders it. Fling or kill the
  commander and the rest *lock* their last formation and coast rigid. A rigid formation is the best
  bowling-pin set in the game. Concord never fires on a clean pilot (the existing lawful gate).
- **Look.** White and blue enamel, box-section hulls, stencilled hull numbers, rotating amber
  inspection beacons. Everything is in straight lines. The commander carries a tall beacon mast,
  which is how you find it in a crowd.
- **Roster.**
  | Role | Silhouette brief | Source |
  |---|---|---|
  | Picket (light, packs of 3) | narrow arrowhead, single beacon mast | **NEW P1** (Forge kit from `patrol_lawman`) |
  | Patrol Lawman | existing | reuse `patrol_lawman` |
  | Customs Cutter | existing interceptor | reuse `customs_cutter` |
  | Commander | Lawman with a mast and a pennant light | **NEW P1** variant of `patrol_lawman` |
  | Clamp Tender | flat hull with two oversized clamp arms | **NEW P1** |
  | Scale Barge | a ship-sized weighing deck with a gantry | **NEW P1** (terrain and job, not an enemy) |
  | Gate Frigate | heavy box hull, twin turrets | **NEW P2** (or reuse `warden_escort`) |
  | The Iron Maw | existing dreadnought | reuse `dreadnought_boss` |
- **Places.** Customs Gate (reuse `station_military` with the weir kit), Patrol Bastion, and the
  **Evidence Locker**: a station where everything Concord seized from you is stored, and a heist
  target (07, encounter E-31).
- **Signature encounter: The Weighing.** At a gate, a Scale Barge weighs your hull against your
  manifest. Anything over is fined or seized. Before the scale reads, you can sling the extra cargo
  behind a large rock (it sits in that rock's *mass shadow*), hand it off to a decoy pod, or bluff.
  This is the root of **mass-signature stealth** (08 §5): sensors read mass and heat, not sight.
- **Signature toy: the Evidence Clamp** (a Line head, seized Concord gear bought on the black
  market). It staples two objects together where they touch: pirate to pirate, pirate to rock,
  container to container.
- **Voice.** "Hold for weight." · "Your manifest says one mass. The scale says another. The scale is
  correct." · "Clearance logged."
- **Relations.** Always hostile to the Pitborn. Taxes Meridian. Chases the Reach. Takes orders from
  Helix without ever saying so.
- **The mark they leave.** Fines become warrant hunters (`warrantHunterWaves` exists). Evidence
  Lockers fill with your seized cargo, and you can take it back.

## 2. Meridian Trade Syndicate — MTS

*"Every man pays twice. First in flesh. Then in coin."* Commodity exchange and tolls. Canon.

- **This cycle.** Keep cargo spines moving through closing gates. Sell Atmo tokens on the Slow Gray.
  Collect tolls. Hire escorts, because a cheaper escort is always available.
- **How they fly.** **Cargo spines**: a tug pulling 4–12 containers on rigid couplers, followed by a
  broker's yacht at a safe distance. They do not fight. They pay others to. A spine is a flail you
  can steal: a thrown rock that hits a coupling snaps it, and the tail containers become loose mass.
  Latch the lead tug and you are towing a train.
- **Look.** Gold and teal, long segmented bodies. The flank light-strips scroll **the live price of
  the cargo inside**, so a container's value is visible on its hull while it tumbles.
- **Roster.**
  | Role | Silhouette brief | Source |
  |---|---|---|
  | Spine Tug | blunt cab, coupling yoke | **NEW P1** (reuse `traffic:tug` base) |
  | Spine container | existing | reuse `pod_cargo_container`, `container_rack` |
  | Coupler link | a breakable joint body | **NEW P1** (simple prop) |
  | Broker Yacht | long, glossy, slow | **NEW P2** |
  | Mule trader | existing | reuse `mule_trader` |
  | Escort | existing | reuse `pd_screen_escort`, `span:faction_mts` |
  | Toll Pylon | lane-straddling arch | **NEW P1** (station prop) |
- **Places.** The Exchange (reuse `station_trade_hub` with a giant ticker billboard kit) and toll
  gates.
- **Signature encounter: Spine Break.** The Reach cut a spine in a rock field. Containers scatter,
  and each one's hull ticker counts its value down as it drifts ("−4,000 CR … −4,200 CR"). Re-couple
  the spine for the fee, steal what you can carry, or sell the lot to the Pitborn.
- **Signature toy: the Coupler Head.** It chains held bodies together, so you can tow three
  containers as one. This is the ancestor of the flail (§33 row 484).
- **Voice.** "Stable pricing." · "Your account is nine cycles past due." · "The market prices what it
  is told."
- **The mark they leave.** Prices move with what you physically destroyed, and the market names the
  mover (row 465 exists).

## 3. Drift Miners Collective — DRIFT

*"The vein remembers who bled for it."* Ore extraction and claim defence. Canon.

- **This cycle.** Hold claims. Break bigger rock, which the Ceres Breaker workfleet already does.
  Keep the refineries fed. Settle claim feuds before they become shaft collapses.
- **How they fly.** Slow, heavy tugs and barges moving rock for work. Their rock-moving is a *job*,
  not a weapon. Their one weapon is the authored **Claim Collapse** set piece. They are **terrain
  makers**: their blasting leaves fresh rock fields, so allying with them fills the arena with
  ammunition.
- **Look.** Hi-vis orange and yellow, cage frames, flood lights, drill heads, big rock grabbers.
- **Roster.** Rock Tug (reuse `traffic:tug` and the Ceres workfleet). Breaker (reuse
  `ceres_breaker`). Ironback barge (reuse `ship_ironback`). Claim Warden (reuse `cradle:faction_dmc`).
  Rockhound driller (**NEW P2**: a ship that is mostly drill). Bosses: Mirrorjaw Foreman and Forge
  Regent (reuse).
- **Places.** Refinery (reuse `station_refinery`). **Claim pylons** (**NEW P1**: pylons that stake a
  claim and can be thrown). Ore hoppers (reuse).
- **Signature encounter: Claim Jump.** Two crews feud over a seam, and one is about to collapse the
  shaft on the other (the canon betrayal). Brace the collapsing rock with your Line, fling the
  saboteur's charge into open space, or pick a side and let it fall.
- **Signature toy: the Breaker Head.** Slam a held rock into anything hard and it splits into three
  to five throwable chunks. It keeps the ammunition supply up.
- **Voice.** "Take what you can carry." · "Rock sweats. I've seen it sweat." · "Shift's over when the
  rock says."
- **The mark they leave.** Worked asteroids keep their scars and Deed Names (row 466), and field
  depletion persists.

## 4. Crimson Reach — REACH

*"The hole had no locks on the inside."* Ambush lanes and black-market salvage. Canon.

- **This cycle.** Take the lanes the Gate Audits made long. Sell salvage at Sker Haven. Feud between
  clans (the Maw culture and its rivals). Hang trophy plates.
- **How they fly.** **Packs**: wasp swarmers in tight groups, reavers, corsairs, rams, mine-layers and
  the one rare harpoon raider. They are the game's ammunition (CV-AMMO). They bunch, they make
  passes, and they die in clusters.
- **Look.** Red and black, asymmetric, welded rams, trophy plates painted with hands ("every hand is
  a ship that failed to turn"), orange exhaust.
- **Roster.** Most exists: Wasp swarmer, Reaver, Corsair, Jackal mine-layer, Harpoon
  (`tether_control_raider`), Ram-hulk (`bruiser_brawler`), Detonator dart, Lancer sniper. New:
  - **Nest Carrier (NEW P0).** A gutted freighter that launches wasp packs from its belly. It is a
    dismantle-able mini-boss and a mid-tier Katamari target, so pull its belly doors off and the
    nest spills out.
  - **Trophy Barge (NEW P2).** Carries the clan's trophies. Destroy it and every clan in the sector
    wants you.
- **Places.** The Sker Haven bazaar (reuse `station_blackmarket`). Gate camps made of chained rock.
- **Signature encounter: Lane Ambush in the Rocks.** The standard swarm pocket (§33 row 497,
  07 E-01).
- **Signature toy: the Barb Head.** It hooks a *light* ship and drags it, so a fighter becomes a
  wrecking ball.
- **Voice.** "Cargo comes loose, or hull plates do." · "Count the painted edge." · "Neutral. Open
  contract." (the tag never flips)
- **The mark they leave.** Clan grudges (the nemesis system). Trophy plates of the ships you killed
  hang at Sker Haven, and you can steal them back.

## 5. The Quiet — QUIET

*"The walls were never the real prison."* Contraband routing. Canon.

- **This cycle.** Move what nobody logs. Find routes around closed gates; the Gate Audits are good
  business. Sell findings before anyone files them.
- **How they fly.** Alone, dark and fast. They drop decoy pods, swap cargo mid-flight, and field
  ghost snipers (`quiet_ghost`). They are **jugglers**: two runners toss a sealed crate between them
  to break your lock, and you catch it.
- **Look.** Matte charcoal, no running lights, thin knife silhouettes. Their only light is a dim
  violet relay pip.
- **Roster.** Runner (**NEW P1**, or reuse `traffic:smuggler`). Ghost (reuse `quiet_ghost`). Rig
  (reuse `rig:faction_quiet`). Decoy pod (reuse the cargo pods with a Quiet decal). Relay buoy-ship
  (**NEW P2**).
- **Places.** Smuggler dens inside hollow rock (Pallas already has one). Dead drops (`boreDeadDrop`
  exists).
- **Signature encounter: The Swap.** A runner throws the crate to a second runner across a rock
  field. Intercept it mid-air with the Line, which is the game's cleanest skill shot.
- **Signature toy: the Hush Head.** While your Line holds an object, its mass does not show on any
  scale. It is built for The Weighing.
- **Voice.** "Safe. Last scan fourteen days." · "Never the same code twice." · often nothing at all
  (the comms line shows "—").
- **The mark they leave.** A route you used gets sold: next time, it is patrolled.

## 6. The Vael — VAEL

*"They didn't modify the workers. They modified the terms of the workers."* Hazardous labour and
modification services. Canon: human, from the Veil; their alien quality is legal, not biological.

- **This cycle.** Take hazardous salvage below market and invoice the addendum. Research Verge sites
  and the Bloom from the Veil's quiet sectors. Collect on page 9.
- **How they fly.** Careful and instrument-heavy, never aggressive. Their contracts bite
  physically through the **Lien Anchor**: if you owe them, an Override Tender clamps a lien mass to
  your hull (telegraphed, and only on contract jobs). You get heavier, which is Katamari in reverse.
  Pay it off, cut it loose (and lose rep), or **fling it into a pirate**. Then LOG files it:
  `LIEN TRANSFERRED: REAVER-3 NOW OWES THE VAEL.`
- **Look.** Nacre and violet, ribbed shells, instrument antennae, soft violet light. Contract text
  is etched into their hull panels in tiny type. If you zoom in, you can read page 9.
- **Roster.** Research Courier (reuse `traffic:surveyor`, or **NEW P1**). **Override Tender** (**NEW
  P1**; it carries the lien anchor). Lien Anchor (**NEW P1**: a prop with a clamp and a heavy core).
  Hazard Crawler (**NEW P2**: works burn zones). Addendum Barge (**NEW P2**: a contract station on
  engines).
- **Places.** Veil research station (reuse `station_research`). The Phoebe Echo shrine. The Ashfall
  cache.
- **Signature encounter: Page Nine.** A hazardous salvage job in a burn zone. Halfway through, the
  addendum activates and a Lien Anchor clamps on. Finish the job heavy, or throw the anchor at the
  claim-jumpers who just arrived.
- **Signature toy: the Override Head** (reuse `tool_thruster_hijacker`). While the Line holds a ship,
  you can fire its thrusters.
- **Voice.** "Voluntary. Standard terms." · "Page nine." · "The addendum reaches farther than the
  job does."
- **The mark they leave.** Debts become physical liens. The Vael remember every override.

## 7. Free Frontier — FRONTIER (PROPOSED CANON; completes R9)

*"Every captain on this board believes they are temporary."* A brokers' compact of independent
captains, with no customs arm of their own. The Quiet vet their freight. The Reach wait at the
bottom for whoever goes bankrupt.

- **This cycle.** Stay independent. Keep homesteads alive as the Gate Audits strand them. Hire
  escorts. Raise new homesteads out of towed modules.
- **How they fly.** Patchwork hulls in mixed formations, brave and under-gunned. They are **allies
  who need cover**: they rally behind any rock wall you build and fight better from it.
- **Look.** Sky-cyan and patched primer. Every hull is a different repaint, with family names
  stencilled on. Homesteads are quilts of mismatched modules.
- **Roster.** Frontier Runner (reuse `traffic:courier` and the Kestrel). Homestead Guard (reuse
  `wasp:faction_free`). Frontier Heavy (reuse `ship_ironback` / `ship_atlas` with a patch kit).
  **Homestead modules** (**NEW P1**: six snap-together, throwable modules covering habitat, tank,
  solar, dock, garden and mast).
- **Places.** Homesteads (**NEW P1** modular kit) and neutral waystations.
- **Signature encounter: Barn Raising.** Tow six modules to a homestead frame before a Bloom tide or
  a gate closure arrives. Snap them on, then hold the line while the welders work. The homestead
  stays built and grows (01 law 6).
- **Signature toy: the Weld Head** (builds on `glueMeetMassRuntime`). It welds the held object where
  it touches: build a wall, armour a station with a rock, stick a container shut.
- **Voice.** "Still temporary." · "We'll owe you. We always owe somebody." · "Board's open."
- **The mark they leave.** Homesteads you raised appear on the chart, gain traffic, and remember you.

## 8. Ascendant Choir — CHOIR

*"The relic reports home. The shrine is home."* Relic recovery and shrine defence. Canon.

- **This cycle.** Recover relics: Verge fragments and Vethari bone. Defend the shrines. Certify
  relics, and broadcast whoever carries them.
- **How they fly.** Zealot packs screening a marked ally (`choir_zealot` exists). **Bell** ships pulse
  resonance that makes crystal rocks hum and then shatter. They are **resonators**: throw crystal
  near a Bell and you get a chain of shatters.
- **Look.** Bronze and ivory, bell-mouthed hulls, long trailing ribbons (cloth VFX), chant-lights
  pulsing in rhythm.
- **Roster.** Zealot dart (reuse `choir_zealot`). **Bell** (**NEW P1**; source the shape from the
  `Choir-Bell Aegis` unique wreck). Censer (**NEW P2**: drops incense fields that mask relic pings).
  Reliquary Carrier (**NEW P2**: a capture target). The Ceres Cathedral (existing station).
- **Signature encounter: The Carried Relic.** You carry a certified relic past a shrine, and it pings
  your position to every Choir ship. Crack its casing before the shrine radius by smashing it into a
  rock above a set impact speed, or arrive with the whole choir behind you.
- **Signature toy: the Bell Head.** Anything your Line slams with it rings, and the pulse shatters
  nearby crystal.
- **Voice.** "Dormant. No signal." · "The shrine is home." · fragments of hymn.
- **The mark they leave.** Shrines pile up the relics you brought. The Choir remembers sacrilege.

## 9. Helix Directorate — HELIX

*"The invoice and the fine are written in the same hand. Read the invoice first."* The
legal-corporate membrane and tariff enforcement. Canon. Its cutters fly MTS transponders 60 % of the
time and Reach hulls 40 %.

- **This cycle (PROPOSED CANON).** Run the **Gate Audits**: close outer gates "for fiscal
  consolidation". Seize and resell. Keep REF 44-C open and unread. Vale's administrative office
  sits inside the Directorate's Helios tower, and the filing is the power (R10).
- **How they fly.** **Too perfectly.** A Helix false-flag "Reach" pack flies exact geometry at
  matched speeds, and that perfection is the tell a careful player learns. Break the pattern (fling
  one into the others) and the transponders flip to HELIX. Lien drones stick fines to your hull.
  Only the Adjudicator boss carries a Seizure Clamp.
- **Look.** Unmasked: white glass, black hairlines, holographic seals, one gold line. Masked: Meridian
  gold or Reach red, but too clean, with no scorch marks and no trophies.
- **Roster.** Adjudicator Cutter (a **NEW P1** skin on `customs_cutter`). Lien Drone (**NEW P1**:
  small, sticks to hulls). Auditor Frigate (**NEW P2**). **Adjudicator 44-C** (**NEW P2** boss: a
  capital that closes a gate around you).
- **Places.** The Directorate tower at Helios (an interior variant of `station_trade_hub`). **Gate
  Audit platforms** at closing gates (**NEW P1**: a scaffold that welds a gate shut over several
  cycles and can be physically wrecked).
- **Signature encounter: The Too-Perfect Pack.** A "Reach" pack ambushes a Quiet runner, and its
  formation is flawless. Break it and the flags drop to HELIX. The runner's cargo is already logged
  as "recovered contraband".
- **Signature toy: the Seal Head** (rare, from the Archive black market). It sticks a Directorate
  fine on an enemy, and every lawful ship in range now hunts that enemy. It is weaponised paperwork.
- **Voice.** "Lawful interdiction." · "Under orders." · "Read the invoice first."
- **The mark they leave.** Closed gates, longer lanes, escalating fines.

## 10. The Understory — UNDERSTORY (PROPOSED CANON; R10)

*"Everything feeds something."*

**Who they are.** Human-descended wreck-reef communities in Charon Expanse and Eunomia Gulf. They
cultivate a domesticated cousin of the Bloom, **the slow rot**, which digests dead hulls into
feedstock and breathable air. **They are the only working recyclers in a system whose recyclers
failed.** They are gardeners, patient and plural-voiced ("we"). They fear the wild Bloom more than
anyone, because their gardens are the wall that holds it back. They never fire first. They buy
wreckage and ask nothing. When an Understory ship dies, it seeds a garden where it falls (the
existing `sporeBloomOnDeath`).

- **This cycle.** They need wrecks, which are food. They want quiet. They want the wild Bloom kept
  out of the lanes. They pay by the tonne.
- **How they fly.** Slow, soft, grown ships: old ledger hulls re-flown under overgrowth. Collisions
  are absorbed (low restitution, spongy), and **anything you fling into a garden is eaten** and
  makes it grow. They are **sponges**: don't fight them, feed them. If attacked, they release
  sticky spore clouds that slow hulls, then they withdraw.
- **Look.** Moss green and peat brown, bioluminescent yellow-green fruiting bodies, shelf fungus on
  old hulls, slow pulsing light.
- **Roster.** Gardener skiff (**NEW P1**, small). **Overgrowth kit** (**NEW P0**: one reusable shell
  of geometry and material that turns any existing hull into an Understory hull; it serves the
  Rot-frigate, Spore-tender and Bloated carrier-barge roles in `src/data/factions/understory.js`).
  **The Garden** (**NEW P1**: a wreck-reef that grows through five visible stages).
- **Signature encounter: The Compost Run.** Tow wrecks into a garden ring. The garden grows
  visibly over the campaign and becomes a landmark reef. A big enough garden pushes the Bloom tide
  line back on the chart (01 §2).
- **Signature toy: the Spore Head.** Anything held on the Line long enough grows a rot-skin. It goes
  soft (low bounce) and sticks to whatever it hits, turning any rock into glue ammunition.
- **Voice.** "We will take that. We take everything, eventually." · "Leave it. It is becoming
  something." · "The wild one is coming up the lane. Bring us more dead."
- **Relations.** Neutral to all. The Choir call them heretics. The Pitborn trade with them. The
  Bloom is their only enemy.
- **The mark they leave.** Gardens. This is region authorship in a biological register.

## 11. The Fulfillment — FULFILLMENT (PROPOSED CANON; R10)

*"Your order is important to us. Your order has always been important to us."*

**Who they are.** In Year 6 a logistics combine dissolved in a merger, and its autonomous routing
fleet kept running. It fulfils every order ever placed, along fixed routes, forever. It is clinically
polite and unstoppable. Its reputation cannot improve, because it has no opinions (the existing
`repStartsNeutralCannotImprove`). **It is the thesis made into a machine: a system that is
procedurally correct forever.**

- **This cycle.** Deliver every order. The oldest open order is **#0000001**.
- **How they fly.** **Trains.** Fixed routes, constant speed, no deviation, never the first to fire.
  They are moving terrain with enormous momentum and perfect predictability. Latch one and it tows
  you across the sector, which is fast travel by hitchhiking. Derail one with enough mass and it
  spills its cargo: decades-old backordered goods, the game's best loot pinata (08 §2, rarity
  "Backordered").
- **Look.** Hospital white, pale blue light strips, barcodes, perfect geometry. They show no damage,
  because they repair at once, until you derail them.
- **Roster.** **Re-router Hauler** (**NEW P1**: a long white box on rails of light). Escort frigate
  (reuse `ship_bastion` / `ship_warden` with a white kit). **Clerk capital** (**NEW P2**: a vast white
  routing ship, "Clerk 0003"). Parcel pods (reuse pods with a white kit).
- **Signature encounters.**
  - **Administrative Boarding.** A Fulfillment pod tries to board you and reroute your cargo to an
    open order. Fling the boarding pod off before it docks, or let it file your cargo away.
  - **Order #0000001.** The Clerk capital is delivering the first order ever placed: one crate, and
    its address has failed verification for fourteen years. The address is the Pit. The crate is a
    recycler *service kit*. If the player delivers it, the Pit's sweeper **Sump** gets a new broom,
    and LOG closes the ticket. This is the comedy law exactly: the laugh that ends in the smell
    ticket. The air does not change (R12, epilogue canon).
- **Signature toy:** hitching. Latching a Fulfillment hauler rides its route.
- **Voice.** "Your order is important to us." · "Address verification failed. Rerouting." · "Thank you
  for your patience. Your patience has been noted for fourteen years."
- **The mark they leave.** Open orders become missions. A delivered order closes forever, and the
  "oldest open order" counter visibly ticks.

## 12. The Archive — ARCHIVE (PROPOSED CANON; R10)

*"A secret for a secret."*

**Who they are.** A monastic order that keeps the only complete records in the Reach, sealed in the
**Severed Codex**. They trade only in secrets. They are neutral to all, and burning an Archive unites
everyone against you (existing data). **The Reading Room of B7 is an Archive office** (PROPOSED
CANON, consistent with R10's "observer lattice" note). They are not villains. They hoard truth
because they decided it is too dangerous to circulate.

- **This cycle.** They want secrets, including yours. Above everything else, they want the Witness's
  ledger.
- **How they fly.** Slow scriptorium ships whose weapon is **Redaction**: a pulse that blacks out your
  engines and HUD. While redacted you have only momentum and the Line, so you steer by snagging
  rocks and swinging. They never destroy.
- **Look.** Indigo and paper-white, lantern-lit scriptorium windows, glyph panels like illuminated
  pages, slow candle-flicker light.
- **Roster.** Censor Frigate (**NEW P1**). Abbot Cruiser (**NEW P2**). Indexer capital (**NEW P2**).
  Page drones (**NEW P2**: they copy your logs). Reading-room station (**NEW P1** kit on a
  `station_research` base).
- **Signature encounter: Redacted.** Censors blank your systems inside a debris field. Escape the
  redaction radius by swinging from rock to rock.
- **Signature toy: the Index Head.** Scan while the Line is held and you see the object's full
  history: provenance, owners and mass record. It is the investigation tool for Books 5–7.
- **Voice.** "A secret for a secret." · "That entry is sealed." · "Brother Index will see you. Bring
  something worth reading."
- **The mark they leave.** They record you. Late in the game they offer your own past deeds as trade
  goods.

## 13. The Pitborn — PITBORN (PROPOSED CANON; R10)

*"Heavy is honest."*

**Who they are.** The second generation of the Pit, born after the Release. They never took the count
and refuse to. They run salvage yards, wreck fences and deep anchorages in Ashfall, and they run
**the Cull**: a broadcast blood-sport of culling Bloom tides in wrecked arenas, which is the fiction
of the swarm mode and the Crucible. **They are the game's joy**: loud, musical, generous, rude and
built from junk. They sing the wardens' count back as a chant at every Cull ("COUNT 'EM!"). Their
motto is the game's progression law. They are always hostile to Concord and allied with the Reach
and the Quiet (existing data).

- **This cycle.** Ratings for the Cull. Scrap. Turning the Count into a show.
- **How they fly.** Junk-built ships with magnetic grapples. They play Katamari as sport: **Ballast**
  is a race to build the biggest junk ball. They are **rivals at your own game**, so out-throw them.
- **Look.** Rust orange, primer and gold, string lights, scrap trophies, loudspeakers, painted
  numbers everywhere.
- **Roster.** Salvage Tender and Yard Gunship (reuse `ship_mule`, `ship_pelican`, `ship_drifter`,
  `ship_hornet` with a **junk kit, NEW P1**). **Yardmaster** capital (**NEW P1**: a mobile scrapyard
  accreted from wreck pieces, generated from the 43 existing aftermath pieces. It is a colossus you
  dismantle piece by piece, and you keep the pieces). **Ballast balls** (**NEW P0**: junk spheres in
  five sizes, the swarm arenas' signature throwable).
- **Places.** Cull arenas (the existing Crucible arenas get Pitborn dressing: crowd lights, banners,
  a scoreboard). Yards at Ashfall and Sker Haven.
- **Signature encounter: The Cull.** In Adventure, a Cull crew invites you into a live Bloom-tide
  culling. A crowd meter rates your style, and the purse scales with it. In swarm mode, the Cull is
  the frame of every run.
- **Signature toy: the Magnet Head** (§33 row 489). The Pitborn make it, and the Cull sells it.
- **Voice.** "Heavy's honest!" · "Count 'em! COUNT 'EM!" · "You break it, it's ammunition."
- **The mark they leave.** The Cull leaderboard lists your runs. Yards display your trophies. Ma
  Sprocket names a ballast ball after you.

## 14. The Verge-Layers — VERGE (canon in data; PROPOSED CANON additions)

*"PRESENT. WITNESS. APPEAL."* Precursor machines. They run the jump-gate web, are hostile only to
gate-closers, disable rather than destroy, and wake as gates close. Per R10 they are **not** a Vale
superpower.

**Who they are.** The surviving machines of the **First Clerks** (01 §2). They still run the gate
web's law through nine directives: PRESENT, VACATE, HOLD, WITNESS, RETURN, ISOLATE, CLOSE, OPEN,
APPEAL. Their law is just, slow, literal and incorruptible: **the counter-image of the human paper
system.** They do not care about the Reach's factions. They care about gates and directives. Each
gate the Audits close wakes more of them.

- **How they fly.** Geometric and prism-like. Their motion is exact and slow, then suddenly instant.
  Their weapons disable (stasis, nullification) and never break hulls. **They measure mass**:
  Measure Engines read the true mass of everything, and Debris Sorters sort debris by mass, which
  makes a physics puzzle out of your own throws.
- **Look.** Nacre white with violet-grey lattices, pearl light, geometric seams that open. No visible
  engines.
- **Roster** (all 14 kinds exist in `src/data/precursorMachines.js`; bodies are needed):
  | Kind | What it does in play | Body |
  |---|---|---|
  | Surveyor Prism | scouts, marks gate violators | **NEW P1** |
  | Gate Auditor | answers gate closers; the counter-Helix | **NEW P1** |
  | Measure Engine | weighs everything; its fragments upgrade the Line | **NEW P1** |
  | Debris Sorter | sorts thrown mass into bins (puzzle arena) | **NEW P1** |
  | Executor | enforces directives with stasis | **NEW P2** |
  | Appeals Clerk | hears appeals; evidence is weighed | **NEW P2** |
  | Witness | records; reads true history | **NEW P2** |
  | Sleeping Jury | twelve dormant jurors woken by testimony | **NEW P2** |
  | Boundary Walker, Mason, Courier Frame, Custodian, Conservator, Shepherd Engine | site-specific | **NEW P2 to P3** |
- **Signature encounter: The Appeal.** Break a directive (for example, run a closing gate) and a Verge
  court convenes. The Appeals Clerk accepts evidence: objects you carry into its chamber, weighed.
  Bring the right object at the right mass and the appeal is granted. The Sleeping Jury wakes one
  juror per piece of testimony.
- **Signature toy: Measure Engine fragments**, which are the Line Class upgrades (08 §2).
- **Voice.** Single words in capitals: "PRESENT." · "MASS RECORDED. MASS CORRECT." · "APPEAL HEARD."
- **The mark they leave.** Woken law zones on the chart. The machines remember your appeals.

---

## Relations at a glance

Starting relations in `src/data/factions/*.js` are law. This shows the *story* temperature the
encounters should express. Hostile means open conflict, and wary means friction and bribes.

| | Concord | MTS | Drift | Reach | Quiet | Vael | Frontier | Choir | Helix | Understory | Fulfillment | Archive | Pitborn | Verge |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Concord** | — | taxes | oversees | hostile | hostile | wary | wary | tolerates | obeys | ignores | escorts | fears | **hostile** | fears |
| **Helix** | commands | wears its flag | audits | wears its flag | hunts | contracts | strands | uses | — | ignores | exploits | wants its secrets | hostile | **hostile** (gate closer) |
| **Pitborn** | **hostile** | sells to | trades | **allied** | **allied** | wary | friendly | mocks | hostile | trades | robs | ignores | — | wary |
| **Understory** | — | — | — | — | — | — | — | heretics | — | — | — | — | trades | — *(the Bloom is the enemy)* |

---

## Appendix — canon blocks for the open factions (PROPOSED CANON, R9/R10)

These blocks follow the format of `docs/worldbuilding/orgs/factions-CANONICAL.md` exactly, so the
narrative lane can transcribe them (INFERENCE EXP-11). The canon's non-negotiables apply: clipped
declaratives, no faction framed as heroic, every betrayal costs something concrete, and the prison
origin as live grammar.

**The Understory** (short: UNDERSTORY)
Primary function: wreck composting and graveyard salvage.
Betrayal pattern: A gardener buys a wreck and asks nothing, as promised. The wreck was evidence in somebody's claim. By the time the claimant arrives, the hull is moss and the claim is a garden. The garden thanks them for their patience.
HUD/graffiti lie: Wreck tags read "derelict — no claimant" on hulls the garden has already begun to eat, with the claimants still in the queue.
Spacer superstition: Never tow your own crew's wreck to a garden. Whatever the rot remembers, it keeps.
Prison origin: The Pit buried its dead in the hydroponics beds because there was nowhere else. The ones who tended the beds learned that everything feeds something. After the Release they kept tending.
Graffiti: *Everything feeds something.*

**The Fulfillment** (short: FULFILLMENT)
Primary function: autonomous order fulfilment along fixed routes.
Betrayal pattern: A re-router accepts your cargo for expedited routing, logs it under an open order fourteen years old, and delivers it to an address reclassified the year after the order was placed. The delivery is confirmed. The recipient does not exist. The confirmation is correct.
HUD/graffiti lie: Route tags read "on schedule" on haulers whose schedule was set by a company that no longer exists.
Spacer superstition: Never place an order with the Fulfillment. It will be fulfilled.
Prison origin: The Pit's supply chain ran on standing orders nobody was allowed to cancel. Rations arrived for prisoners six years dead. The combine that delivered them was sold, merged and dissolved, and it kept delivering.
Graffiti: *Your order has always been important to us.*

**The Archive** (short: ARCHIVE)
Primary function: record-keeping and secret exchange.
Betrayal pattern: A reading room trades you one sealed entry for one of yours. The entry you receive is true. The entry you gave is copied to every reading room in the Reach before you undock, and priced.
HUD/graffiti lie: Entry tags read "sealed — no copies" on records already held in three indexes.
Spacer superstition: Never say a true thing inside a reading room's lantern light. The lamp is a lens.
Prison origin: The Pit's library was the only room without cameras, because no warden believed prisoners read. The readers kept a second ledger in the margins of the hymnals. After the Release they kept the margins.
Graffiti: *A secret for a secret. The second secret is the price.*

**The Pitborn** (short: PITBORN)
Primary function: salvage yards, wreck fences, and the Cull.
Betrayal pattern: A yard boss buys your salvage at a fair weight on an honest scale. Then she broadcasts the fight you pulled it from as Cull footage, with your callsign as the villain of the week, and keeps the ratings.
HUD/graffiti lie: Cull scoreboards read "live" on fights recorded three days earlier.
Spacer superstition: Never paint over a Pitborn tally. The next count adds your hull to it.
Prison origin: They were born in the Pit after the Release and never took the count. They heard their parents count every morning. They turned the count into a chant, and the chant into a show.
Graffiti: *Heavy is honest.*

**Free Frontier** (short: FRONTIER)
Primary function: independent freight and homesteads.
Betrayal pattern: The board pairs two temporary captains on one contract, for safety. The first to miss a payment is sold to the Reach by the second, who keeps the homestead and believes, sincerely, that it is temporary.
HUD/graffiti lie: Contract tags read "partnership — equal shares" on boards where the Quiet have already priced the default.
Spacer superstition: Never say "permanent" on the board. The board will make it true for one of you.
Prison origin: Released prisoners who refused every faction pooled what they had. They promised each other it was temporary. Seventeen years later it still is.
Graffiti: *Still temporary.*

**The Verge-Layers** (short: VERGE)
Primary function: jump-gate law.
Betrayal pattern: None. The Verge do not betray. They apply a directive exactly as written, including to the people who wrote it. Pilots experience this as betrayal.
HUD/graffiti lie: None. Verge tags never lie. Pilots distrust them for it.
Spacer superstition: Never argue with a Gate Auditor. Appeal.
Origin: not the Pit. They are older than the Reach. The only institution in the Reach that predates the count is also the only one that never kept one. They measure. They have never counted.
Graffiti: *PRESENT. WITNESS. APPEAL.*
