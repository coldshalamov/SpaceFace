# Category B — Ship Concept Pool (100 candidates, 20 slots × 5)

**Purpose:** the asset-expansion ship roster for SpaceFace. 20 ship "slots" (Category B from the plan), each with 5 GENUINELY DIFFERENT candidate ships so a 3D artist and designer can pick the strongest. All concepts are tuned to fit SpaceFace's existing data shape (`ships.js` / `enemies.js`) and the verified depth research (`synthesis.md` Patterns A & C: multi-axis faction identity; signature silhouettes, never palette swaps).

**How to read each entry:**
- **Name** — faction-appropriate register. Bio = organic; drone = designation codes; pirate = raucous personal names; authority = formal naval.
- **Class/role (tier)** — maps to `role` + `tier` in `ships.js`. Tier ladder T0→T5 respected per slot.
- **Visual description** — silhouette + `Material_Hull` / `Material_Accent` / `Material_Emissive` (the three material slots SpaceFace's render track consumes), + signature feature. Each candidate in a slot has a DISTINCT silhouette.
- **Stats sketch** — relative hull/shield/speed/cargo + weapon-slot layout (size + facing: front/left/right/rear/turret). Rough; not exact numbers.
- **Backstory** — origin + notable engagement, 1-2 sentences.
- **Signature tactic** — how it fights, distinct from the other 4 in its slot.
- **Faction association** — which existing (or Category-A) faction fields it.

**Slot map:**
- **B1–B5** Alien/bio ships — xenomorphic Vael/Choir faction. Roles: scout, fighter, cruiser, freighter, capital.
- **B6–B10** Drone/AI ships — geometric automaton faction (the Helix paper-faction made real, or a new "Concordance" machine intelligence). Roles: swarm-fighter, interceptor, gunship, tender, dreadnought-core.
- **B11–B15** Pirate/scav variants — distinct silhouettes per Reach sub-faction, NOT a shared chassis. Roles: raider, boarding-tender, scrap-hauler, gun-brig, flagship.
- **B16–B20** Authority/capital ships — the "big gun" tier for SCN Concord / MTS Meridian / DMC. Roles: patrol-cruiser, carrier, battleship, station-killer, flagship-of-the-line.

**Research hooks honored:** every slot delivers role-distinct beats (Rebel Galaxy Pattern D — "Tug vs Dreadnought is a vast gulf"), faction-identity-is-multi-axis (Starsector Pattern A — silhouette + material + tactic + origin all encode faction), and signature-asset-not-palette-swap (Pattern C — no two candidates in a slot share a silhouette).

---
---

# GROUP 1 — ALIEN / BIO SHIPS (B1–B5)

**Faction:** the Vael (xenomorphic, hostile, fields the existing dreadnought boss "Iron Maw") and the Choir (older, stranger, possibly precursor). Organic silhouettes grown, not built. Bioluminescent, chitinous, membranous. Drives are biological reaction analogues (`drive_` equivalents named bio-gravitic / chromatophore-pulse / etc.). All ships read as *grown creatures* first, spaceships second.

## B1 — Bio SCOUT (tier 1)

**Role-fit:** the xenomorphic answer to the Kestrel/Wasp — a fragile, fast, sensor-sharp first-contact craft. Three-layer bio model (membrane-shield / carapace-armor / flesh-hull).

### B1-a. Mycel
- **Class/role:** Bio scout (T1). Family `scout` analogue → new bio family `spore`.
- **Visual:** A teardrop seed-pod, blunt-nosed, trailing a spray of thread-thin filament tendrils like a dandelion seed. Carapace split along the equator to expose a glowing amber central eye. `Material_Hull`: pale nacreous chitin (iridescent). `Material_Accent`: translucent filament tendrils. `Material_Emissive`: single amber biolume eye + filament tips.
- **Stats sketch:** hull low / shield medium / speed very high / cargo tiny (≈20). Weapon: 1×S front (a spat bioluminescent spit-gland). 1×S engine (chromatophore-pulse drive).
- **Backstory:** Grown in vats aboard Vael hive-ships as one-use pathfinders; the mycel-network lets a hive-twin see whatever one sees. First Contact was a single Mycel drifting into the Concord buoy net at Reese's Reach — it transmitted a song, then died.
- **Signature tactic:** Flies in sibling-pairs that share vision (sensor-fused). Kites at max range, marks targets for heavier sisters; never commits to a fight it can't flee.
- **Faction:** Vael.

### B1-b. Sylph
- **Class/role:** Bio scout (T1). New bio family `glider`.
- **Visual:** A flat manta-ray glider — wide rhombic wings, pinched waist, no discernible nose. Undulates gently even at rest. Eyespots stipple the wing-edges. `Material_Hull`: dark indigo leathery membrane stretched over bone-struts. `Material_Accent`: pale bone leading-edges. `Material_Emissive`: scattered cyan eyespots that blink in sequence (a communication display).
- **Stats sketch:** hull low / shield high / speed high / cargo tiny (≈15). Weapon: 1×S turret (a stinging tail-spike that tracks). 1×S engine.
- **Backstory:** Choir-bred, not Vael — older, slower, sadder. Sylphs drift the nebulae singing harmonic chains to one another across light-years. Hunters shoot them for sport; Concord formally protects them in four reserves.
- **Signature tactic:** Pure evasion — flies a slow rolling sinusoid that defeats fixed-gun leading, sting-turret fires only when cornered. Survives by being hard to hit, not by hitting.
- **Faction:** Choir.

### B1-c. Tendril-Moth
- **Class/role:** Bio scout (T1). New bio family `moth`.
- **Visual:** Two vast tattered filament-wings held wide, a small bulbous body slung between them like a moth. The wings are sensory arrays — feathered antennae rather than flight surfaces. `Material_Hull`: matte black down-covered thorax. `Material_Accent`: bone-white feather-antennae wings. `Material_Emissive`: a single red abdominal glow that pulses with the ship's "heartbeat" (capacitor).
- **Stats sketch:** hull very low / shield low / speed medium / cargo tiny (≈10). NO offensive weapon — 1×S utility (a sensor-tongue with triple radar range). 1×S engine.
- **Backstory:** The Vael's eyes. A Tendril-Moth can resolve a cargo manifest at 4,000 wu; the corsair fleet at the Sallow Banks was mapped entirely by three of them, none of which ever fired a shot.
- **Signature tactic:** Non-combatant. Uncloaks, scans everything in a huge radius, relays target data to ambush pack-mates, then flees. Killing one spikes Vael hostility hard.
- **Faction:** Vael.

### B1-d. Chitin-Dart
- **Class/role:** Bio scout (T1), leaning scout/fighter hybrid. New bio family `dart`.
- **Visual:** A four-finned needle — long straight spine, four stubby chitin fins at the midpoint like a flechette. Needle-nose is a hollow piercing beak. Reads as a thrown spear. `Material_Hull`: ribbed bone-white chitin, segmented like an insect abdomen. `Material_Accent`: keratin-yellow fin edges. `Material_Emissive`: a thin red ventral stripe (the propulsion gut).
- **Stats sketch:** hull low / shield low / speed extreme / cargo tiny (≈8). Weapon: 1×S front (the beak itself — a short-range high-pierce spine). 1×S engine.
- **Backstory:** The Vael's fastest living hull. Bred from a deep-atmosphere predator of their lost homeworld; in vacuum it never stops accelerating until it dies. A flight of Chitin-Darts gutted the patrol frigate *Clemency* in eleven seconds.
- **Signature tactic:** Pure boom-and-zoom — one high-speed pass with the piercing beak, then a long arc to reset. Never turns to dogfight; if you make it turn, you've already killed it.
- **Faction:** Vael.

### B1-e. Blister-Eye
- **Class/role:** Bio scout (T1). New bio family `buoy`.
- **Visual:** A bulbous single giant ocular sphere wrapped in a thin protective skin, with six stubby clawed legs folded under it for docking. Looks like a floating eye with cataracts. `Material_Hull`: translucent amber sclera showing dark veins beneath. `Material_Accent`: milky-white cataract scar-plaques. `Material_Emissive`: a huge contracting black pupil that glows red at its rim.
- **Stats sketch:** hull very low / shield low / speed low / cargo tiny (≈12). Weapon: 1×S front (a focused photic beam — the eye's own focused light). 1×S engine.
- **Backstory:** A Choir curiosity — a living telescope. Blister-Eyes stare at distant stars for decades, recording. They are almost harmless individually but a staring ring of them is the universal Choir distress signal.
- **Signature tactic:** Stationary sentry — drops to zero velocity, focuses its photic beam with perfect accuracy at long range. Punishes anything that holds still in its arc; trivially evaded by moving.
- **Faction:** Choir.

## B2 — Bio FIGHTER (tier 2)

**Role-fit:** the xenomorphic line fighter, peer to the Wasp/Hornet. Predatory silhouettes; each candidate embodies a different predatory archetype (ambush, grapple, swarm, armor, latch).

### B2-a. Mantis
- **Class/role:** Bio fighter (T2). New bio family `striker`.
- **Visual:** Praying-mantis silhouette folded into a delta — long thorax-neck, two enormous raptorial foreclaws folded under the chin (these are the weapon mounts). Reads as a coiled spring. `Material_Hull`: emerald-green segmented chitin, wet-looking. `Material_Accent`: ivory claw-tips and joint-pins. `Material_Emissive`: two compound-eye clusters that glow acid yellow, dimming when it stalks.
- **Stats sketch:** hull medium / shield medium / speed high / cargo tiny (≈15). Weapons: 2×S front (the two raptorial claws — short-range high-burst). 1×M engine.
- **Backstory:** The Vael line combatant. Bred to ambush; the compound eyes see in every spectrum. A single Mantis accounted for nine of seventeen kills at the Battle of Sallow Banks, all from above.
- **Signature tactic:** Stalks dark (sensor-cold) until point-blank, then both claws fire simultaneously for a single devastating burst before it boosts away to reset. Trades sustained DPS for one perfect shot.
- **Faction:** Vael.

### B2-b. Lash
- **Class/role:** Bio fighter (T2). New bio family `tentacle`.
- **Visual:** A small flat central disk — a beaked mouth — with three long prehensile tentacle-whips trailing behind it, each twice the hull's length. The whips writhe constantly. Reads as a tiny octopus flying backward. `Material_Hull`: mottled grey-purple skin, slick. `Material_Accent`: pale sucker-disks along the whips. `Material_Emissive`: a blue-green throat-glow visible when the beak opens to fire.
- **Stats sketch:** hull low / shield high / speed medium / cargo tiny (≈18). Weapons: 3×S turret (each whip-tip is an independent turret — all-aspect coverage). 1×M engine.
- **Backstory:** An ambush predator from the Vael deep-reef lineage. The whips are old mouths repurposed as guns; Lashes hunt in loose pairs, one drawing fire while the other flanks.
- **Signature tactic:** The three turrets cover all arcs — it has no blind spot but no concentrated front either. Wins by out-sustaining in a turning fight; dies to anything that overwhelms one shield facing.
- **Faction:** Vael.

### B2-c. Spore-Wasp
- **Class/role:** Bio fighter (T2). New bio family `gastric`.
- **Visual:** A swollen segmented abdomen dominates the silhouette, with a tiny head and two pairs of fast-beating membrane wings (which are bio-thrusters, not lifting surfaces). Reads as a flying termite queen. `Material_Hull`: striped yellow-and-black chitin, wasp-warning colors. `Material_Accent`: papery membrane wings. `Material_Emissive`: the abdomen glows hot orange — it is full of volatile spore-munitions.
- **Stats sketch:** hull low / shield low / speed very high / cargo tiny (≈10). Weapons: 1×M front (a spore-spray — short-range explosive splash). 1×M engine.
- **Backstory:** A Vael living munitions-factory. It digests asteroid organics into explosive spores mid-flight; the abdomen is essentially a fueled bomb with a brain. Crews call them "lint-traps."
- **Signature tactic:** Dash-and-splash — closes fast, dumps a spread of short-range explosive spores like a shotgun, then outruns the blast. The blast hurts it too if it mistimes.
- **Faction:** Vael.

### B2-d. Crab-Kite
- **Class/role:** Bio fighter (T2), the armored/brawler variant. New bio family `carapace`.
- **Visual:** A broad flat oval carapace with eight short articulated legs folded along the edges and two pincer-claws flanking a small forward mouth. Reads as a horseshoe crab viewed from above. `Material_Hull`: thick lumpy rust-red armor plate, scarred. `Material_Accent`: pale calcified leg-joints. `Material_Emissive`: two small stalked eyes glowing dull red.
- **Stats sketch:** hull high (for a fighter) / shield medium / speed low / cargo small (≈25). Weapons: 2×S front (the two pincer-claws). 1×M engine.
- **Backstory:** The Vael brawler — a hull that takes hits other bio-fighters cannot. Bred from a deep-trench scavenger; they often finish fights by simply outlasting the enemy's ammunition.
- **Signature tactic:** Slow relentless pursuit — does not dodge, walks its shots onto target, relies on regenerating carapace between engagements. The fighter you cannot chase off.
- **Faction:** Vael.

### B2-e. Lamprey
- **Class/role:** Bio fighter (T2), the latch/disabler. New bio family `eel`.
- **Visual:** A long sinuous eel-body with a circular toothed sucker-mouth at the nose and a single ribbon-fin running the dorsal length. Reads as a jawed torpedo. `Material_Hull`: smooth dark-blue scale-hide, counter-shaded. `Material_Accent`: ring of bone-white teeth in the mouth. `Material_Emissive`: a biolume stripe along the flank that flickers when it feeds.
- **Stats sketch:** hull medium / shield low / speed high / cargo tiny (≈12). Weapons: 1×M front (the sucker-mouth — a shield-piercing drain beam, EMP-flavored). 1×M engine.
- **Backstory:** A Vael parasite-hull. Lampreys latch onto larger ships, chew through shields, and drink the capacitor dry — a single Lamprey on a freighter's back can brick its drive in thirty seconds. The *Iron Maw* keeps a swarm of them.
- **Signature tactic:** Latches and drains — closes to zero range, attaches, and siphons cap while disabling systems. Useless in a furball; deadly against one big slow target.
- **Faction:** Vael.

## B3 — Bio CRUISER (tier 3)

**Role-fit:** the xenomorphic mid-tier workhorse, peer to the Bastion/Ranger. Each candidate a different body-plan at cruiser scale — spiral, radial, parasitic, serpentine, colonial.

### B3-a. Nautilus
- **Class/role:** Bio cruiser (T3). New bio family `spiral`.
- **Visual:** A logarithmic-spiral shell like a chambered nautilus, the body curled into the opening; small fleshy tentacles trail from the mouth. Reads as a floating shell. `Material_Hull`: pearlescent banded shell, tiger-striped orange and cream. `Material_Accent`: wet muscular tentacle-flesh at the mouth. `Material_Emissive`: a warm gold glow from the shell-mouth and the chamber-internals visible through the translucent last whorl.
- **Stats sketch:** hull high / shield very high / speed low / cargo medium (≈90). Weapons: 2×M front (tentacle-spit) + 1×M turret (a barnacle on the shell). 1×L engine.
- **Backstory:** A Vael flagship-of-small-fleets, grown over decades. The shell is a record — each chamber is a past engagement. The oldest Nautili predate the Concord and remember stars by different names.
- **Signature tactic:** Turtling fortress — the shell contributes massive regenerating shield; it advances slowly under tentacle-fire and barnacle-turret defense. Dies only if you flank and break the mouth-shield.
- **Faction:** Vael.

### B3-b. Anemone
- **Class/role:** Bio cruiser (T3). New bio family `radial`.
- **Visual:** A wide low dome-body bristling with hundreds of waving frond-tentacles in a perfect radial crown — no front or back, fully symmetric. Reads as a sea anemone or a slow explosion. `Material_Hull`: deep purple-grey stalked body. `Material_Accent`: frond-tentacles tipped in pale stinging cells. `Material_Emissive`: the central mouth glows soft green; the stinging tips flash white on discharge.
- **Stats sketch:** hull medium / shield high / speed very low / cargo medium (≈70). Weapons: 6×S turret (the stinging fronds — six independent turrets covering all arcs). 1×L engine.
- **Backstory:** A Vael sentinel organism, planted to hold a point. Anemones do not pursue; they sit. The defense of the Wailing Coil was twelve Anemones and nothing else, and three of them survived.
- **Signature tactic:** Point-defense web — six turrets with overlapping arcs create a no-fly zone. Cannot chase; punishes anything that enters its sphere. The counter is standoff range, not aggression.
- **Faction:** Vael.

### B3-c. Cordyceps
- **Class/role:** Bio cruiser (T3), the parasitic/boarder. New bio family `fungal`.
- **Visual:** A lumpy irregular mass — clearly once another shape (a freighter? a frigate?) now bulging and overgrown with shelf-fungus brackets and veined fungal mats. Reads as a ship-shaped tumor. `Material_Hull`: dead grey host-metal showing through. `Material_Accent`: shelves of rust-orange fungal growth. `Material_Emissive`: sporulating patches that pulse sickly yellow and vent pale spore-clouds.
- **Stats sketch:** hull medium / shield low / speed low / cargo high (≈140). Weapons: 1×M turret (a sporulating launch-blister) + 2×S turret (spore-pods). 1×L engine.
- **Backstory:** A Vael parasitic growth that has consumed and re-purposed a captured hull. Cordyceps cruisers are evidence of a victory — the host ship's silhouette is still half-recognizable under the growth. The *Helm of Ader* was returned to its owners as one.
- **Signature tactic:** Spore-boarding — vents spore clouds that, on contact, disable and slowly convert enemy subsystems (a slow EMP-over-time). Loses straight fights; wins by rotting the enemy from within.
- **Faction:** Vael.

### B3-d. Leviathan-Spawn
- **Class/role:** Bio cruiser (T3), the serpentine. New bio family `serpent`.
- **Visual:** A long sinuous serpentine body — fifty body-segments, four flippered limbs mid-body, a wedge-shaped toothed head. The body flexes as it turns. Reads as a sea-serpent or young dragon. `Material_Hull`: overlapping blue-black scale-plates. `Material_Accent`: pale belly-plates and ivory teeth. `Material_Emissive`: a long dorsal biolume stripe running head-to-tail in cold cyan.
- **Stats sketch:** hull high / shield medium / speed high / cargo small (≈50). Weapons: 1×L front (a breath-lance) + 2×M broadside (flank-fin spitters, one each side). 1×L engine.
- **Backstory:** A juvenile of something vast. The Vael do not speak of what a full-grown one looks like; the *Iron Maw* is rumored to be a Leviathan-Spawn that never stopped growing. Spawn hunt alone and are trophy-kills for corsairs.
- **Signature tactic:** Strafing serpent — uses its length to present a narrow profile on approach, then uncoils into a broadside pass with flank-spitters and breath-lance. The body-flex makes its heading hard to read.
- **Faction:** Vael.

### B3-e. Brain-Reef
- **Class/role:** Bio cruiser (T3), the neural/command. New bio family `reef`.
- **Visual:** A convoluted coral-reef mass — branching arborescent growths over a central lumpy brain-like core, all encrusted with tiny polyp-turrets. Reads as a floating brain made of coral. `Material_Hull`: pale pink-grey neural tissue and white coral skeleton. `Material_Accent`: jewel-bright polyp-tubes in reds and greens. `Material_Emissive`: the brain-core pulses with slow violet light, brightening when it "thinks" (issues commands).
- **Stats sketch:** hull medium / shield high / speed very low / cargo medium (≈80). Weapons: 4×S turret (polyp-tubes) + 1×M turret. 1×L engine. (Utility: buffs nearby Vael.)
- **Backstory:** A Choir command-node — a distributed intelligence that coordinates lesser bio-ships the way a reef coordinates its polyps. A Brain-Reef attended by a cloud of Mycel scouts is one of the most dangerous sights in the deep reach.
- **Signature tactic:** Force-multiplier — itself weak, but every Vael ship within its radius fires faster and tanks harder. Priority target; killing it collapses the pack's cohesion.
- **Faction:** Choir.

## B4 — Bio FREIGHTER (tier 2-3)

**Role-fit:** the xenomorphic hauler — a biological organism carrying cargo in body-cavities. Peer to the Mule/Atlas. Each candidate stores cargo differently (brood-sac, comb, gall, shell, tuber).

### B4-a. Brood-Sac
- **Class/role:** Bio freighter (T2). New bio family `brood`.
- **Visual:** A small tapered head and propulsion-tail on a vast swollen translucent belly-sac — the brood-pouch, distended and veined, with cargo visible inside as dark shapes. Reads as a pregnant seahorse. `Material_Hull`: mottled green-brown head and tail chitin. `Material_Accent`: translucent amber sac-membrane. `Material_Emissive`: the veins in the sac pulse slow warm orange.
- **Stats sketch:** hull low / shield medium / speed low / cargo very high (≈200). Weapons: 1×S rear (tail-sting). 1×M engine.
- **Backstory:** The Vael's living cargo-vessel — the sac is literally a brood-pouch repurposed for haulage. If the sac ruptures, the cargo (and often the ship) is lost; Brood-Sacs travel under heavy escort.
- **Signature tactic:** Flee-and-fortify — huge dash on panic, drops a cloud of noxious spores from the sac to discourage pursuit. Cannot fight; only run.
- **Faction:** Vael.

### B4-b. Hive-Comb
- **Class/role:** Bio freighter (T2-3). New bio family `comb`.
- **Visual:** A flat hexagonal slab — a giant honeycomb — with the wax-cell cargo-containers visible as an open lattice on both broad sides. Small worker-drones flit around it. Reads as a floating honeycomb section. `Material_Hull`: pale wax-yellow comb walls. `Material_Accent`: dark amber cargo-resin pooling in the cells. `Material_Emissive`: a faint warm glow from within each occupied cell.
- **Stats sketch:** hull medium / shield medium / speed low / cargo extreme (≈260). Weapons: 2×S turret (worker-drone spitters). 1×M engine.
- **Backstory:** Choir construction, not Vael — a colonial organism whose worker-caste doubles as point defense. The comb is modular; sections can be jettisoned to bribe pirates (a habit that has saved more Choir freighters than guns ever did).
- **Signature tactic:** Bribe-or-blight — can jettison cargo cells to instantly satisfy pirate demand, OR detonate a cell as a flak-burst. Trading vessel with teeth.
- **Faction:** Choir.

### B4-c. Gall
- **Class/role:** Bio freighter (T2). New bio family `cyst`.
- **Visual:** A smooth ovoid tumor-like cyst on stubby root-legs, with a lumpy irregular surface and a single yawning sphincter-door. Reads as a floating boil or onion. `Material_Hull`: waxy pale-yellow skin, faintly translucent. `Material_Accent`: angry red stress-veins across the surface. `Material_Emissive`: a dull red glow from the open sphincter when loading.
- **Stats sketch:** hull medium / shield low / speed low / cargo high (≈220). Weapons: 1×S turret (a defensive wart). 1×M engine.
- **Backstory:** A Vael hauler grown around captured wreckage — the cargo hold is a digestive chamber that can hold (and slowly digest) almost anything. Galls are disreputable; even other Vael find them ugly.
- **Signature tactic:** Slow, ugly, and armored enough to ignore light fire — the AFK hauler's choice. Its one turret exists to swat swarmers while it plods to dock.
- **Faction:** Vael.

### B4-d. Shellback
- **Class/role:** Bio freighter (T2-3), the armored hauler. New bio family `chelonian`.
- **Visual:** A broad domed turtle-shell carapace over a small head and four paddle-limbs; the cargo is held inside the shell, accessed from under the belly. Reads as a giant sea-turtle. `Material_Hull`: thick mossy green-brown shell-plate, crusted with barnacles. `Material_Accent`: pale leathery limb-skin and head. `Material_Emissive`: two small steady amber eyes; otherwise dark.
- **Stats sketch:** hull very high (for a freighter) / shield medium / speed very low / cargo high (≈200). Weapons: 1×S rear. 1×M engine.
- **Backstory:** Choir-bred, ancient, patient. Shellbacks plod the trade lanes for decades; some still flying predate the Concord charter. They are nearly impossible to kill for their tier and pirates learn to let them pass.
- **Signature tactic:** Walks the lane — too slow to flee, too tough to bother. The freighter that doesn't need an escort; its defense is that killing it costs more ammo than the cargo is worth.
- **Faction:** Choir.

### B4-e. Tuber
- **Class/role:** Bio freighter (T2). New bio family `root`.
- **Visual:** A lumpy oblong root-tuber with a tangle of thick root-tendrils at one end (the drive) and a sprout of green shoots at the other (the sensor mast). Reads as a giant potato with roots. `Material_Hull`: rough brown root-bark skin, earthy. `Material_Accent`: pale cream flesh where the bark is scarred. `Material_Emissive`: a faint violet glow from the root-tangle drive.
- **Stats sketch:** hull high / shield low / speed low / cargo very high (≈240). Weapons: 1×S rear. 1×M engine.
- **Backstory:** A Vael bulk-hauler that extracts its own reaction-mass from ice and organics en route — effectively self-fueling. Tubers are the backbone of the deep-reach Vael logistics chain.
- **Signature tactic:** Endurance-hauler — extremely long-range and self-sufficient, can run dark for long stretches. No combat edge; its virtue is that it shows up where nothing else can.
- **Faction:** Vael.

## B5 — Bio CAPITAL (tier 4-5)

**Role-fit:** the xenomorphic endgame hull, peer to the Colossus/Leviathan. Each candidate is a different kind of apex organism — bloom, leviathan-mother, thorn-cathedral, gyre-womb, old-molt.

### B5-a. Tyrant-Bloom
- **Class/role:** Bio capital (T4). New bio family `bloom`.
- **Visual:** A vast flower-bud — five enormous fleshy petals opening from a central column, the whole thing the size of a station. The petals are weapon-decks; the column is the bridge-spine. Reads as a blooming lotus the size of a city block. `Material_Hull`: crimson petal-flesh, veined. `Material_Accent`: pale gold stamen-turrets lining each petal-edge. `Material_Emissive`: the column-core blazes white-hot; the petal-veins pulse red.
- **Stats sketch:** hull extreme / shield extreme / speed very low / cargo medium (≈250). Weapons: 2×L front (column) + 4×L broadside (two petals each side) + 8×S turret (stamen-PD). 1×L engine.
- **Backstory:** A Vael fleet-queen. The Bloom is the hub of a swarm — its spore-light coordinates every lesser bio-ship within a system. The destruction of the Bloom at Lorne's Star broke the Vael offensive there in an afternoon.
- **Signature tactic:** Blooming fortress — petals fold shut to tank on a single facing, open to unleash every broadside. The petal-cycle is its combat rhythm; punish the open phase.
- **Faction:** Vael.

### B5-b. Deep-Mother
- **Class/role:** Bio capital (T4-5), the whale-shark brooder. New bio family `leviathan`.
- **Visual:** An immense whale-shark silhouette — broad blunt head, cavernous filtering mouth, vast slow body tapering to a tail. The whole dorsal surface is dotted with hundreds of smaller bio-ships docked like remoras. Reads as a living carrier-reef. `Material_Hull`: dappled blue-grey hide, star-scared. `Material_Accent`: pale belly and the white-scarred rims of its mouth. `Material_Emissive`: a cold blue biolume pattern down each flank, like a starfield.
- **Stats sketch:** hull extreme / shield high / speed very low / cargo high (≈400). Weapons: 2×L front + 2×L broadside (each side) + 6×S turret. Utility: 2× drone-bays (launches Mycel/Spore-Wasp brood). 1×L engine.
- **Backstory:** The Vael's mobile hive-ship — a single organism that births and refits the entire swarm. The *Iron Maw* is a Deep-Mother that turned. There are never many; killing one is a strategic victory.
- **Signature tactic:** Carrier-spammer — launches endless waves of bio-drones while its own guns suppress. The body is a landing strip; the swarm is the weapon.
- **Faction:** Vael.

### B5-c. Thorn-Cathedral
- **Class/role:** Bio capital (T4-5), the ranged artillery. New bio family `cathedral`.
- **Visual:** A massive branching spire — like a coral cathedral or a giant thornbush — a central trunk with dozens of upward-thrusting branched spires, each tipped with a long-range spine-launcher. Reads as a Gothic cathedral grown from thorns. `Material_Hull`: bone-white calcified trunk and branches. `Material_Accent`: dark red leaf-membranes between the branches. `Material_Emissive`: each spine-tip glows dull red before it fires; the trunk-core pulses violet.
- **Stats sketch:** hull high / shield high / speed very low / cargo small (≈120). Weapons: 1×L front (main spine) + 6×L turret (the spine-spires — extreme range, slow rate). 1×L engine.
- **Backstory:** Choir-bred artillery-organism, centuries old. A Thorn-Cathedral holds a system the way a castle holds a pass — by reaching out and killing anything that approaches long before it arrives.
- **Signature tactic:** Pure standoff — extreme-range spine-barrages from a stationary hull. Untouchable at range; helpless if something closes under its guns. The counter is a fast dasher, not a brawler.
- **Faction:** Choir.

### B5-d. Gyre-Womb
- **Class/role:** Bio capital (T5), the vortex/spiral. New bio family `gyre`.
- **Visual:** A vast slow-rotating spiral of organic matter — a galactic-pinwheel of flesh and chitin, three arms curving into a glowing central maw. The whole ship spins. Reads as a living hurricane or a galaxy. `Material_Hull`: dark indigo chitin arms streaked with bright filaments. `Material_Accent`: pale bone leading-edges of the arms. `Material_Emissive`: the central maw is a blinding white-gold vortex.
- **Stats sketch:** hull extreme / shield extreme / speed low / cargo medium (≈300). Weapons: 3×L turret (arm-tips) + central maw (a tractor-vortex that pulls and crushes). 1×L engine.
- **Backstory:** A Choir endgame-hull, possibly a precursor organism. The Gyre-Womb does not fight so much as ingest — its central vortex pulls in anything within range and tears it apart. One was seen at the Margin once, in 2298.
- **Signature tactic:** Gravitic vortex — the maw creates a pull-field that drags ships into range; the arms pin them; the maw devours. The only counter is to fight at the edge of its pull and never close.
- **Faction:** Choir.

### B5-e. Old-Chitin
- **Class/role:** Bio capital (T5), the ancient molted hull. New bio family `relic`.
- **Visual:** An enormous empty molted shell — a hollow carapace of something that grew too large and shed this skin. The interior is exposed ribs and empty chamber-walls; lights and jury-rigged equipment are visible inside. Reads as a giant insect exoskeleton repurposed as a station-ship. `Material_Hull`: dead bleached-white chitin, cracked and holed. `Material_Accent`: rusting metal scaffolding welded into the chambers. `Material_Emissive`: harsh industrial lights strung through the interior, the wrong color temperature for a living thing.
- **Stats sketch:** hull extreme / shield low / speed very low / cargo high (≈500). Weapons: 4×L turret (bolted onto the shell-rim) + 8×S turret (PD). 1×L engine.
- **Backstory:** Not grown — *found*. Old-Chitin hulls are the shed skins of something the Vael worship and fear; corsairs and Quiet-cults occupy them and weld guns to the shell. The *Iron Maw* may itself be a thing that once wore one of these.
- **Signature tactic:** Dead-wall fortress — all guns on turrets, all arcs covered, but no shield to speak of; it soaks damage on raw hull. A pirate king's throne-room.
- **Faction:** Reach (occupied) / Quiet (cult) — cross-faction salvage hull.

---
---

# GROUP 2 — DRONE / AI SHIPS (B6–B10)

**Faction:** the Concordance (new), or the Helix paper-faction made real — a machine intelligence. Geometric, uniform, mass-produced. No cockpit, no bridge (non-diegetic HUD respected — these are unmanned). Materials are uniform across the line: the same hull-metal, the same accent-color, the same emissive — because the Concordance is one mind, many bodies. Naming is designation codes (OCELLUS-3, LANCE-A). Drives are clean, signature-free.

**Design doctrine:** every drone is identical to every other of its type; differentiation is by silhouette-role, not individual personality. The horror is the uniformity.

## B6 — Drone SWARM-FIGHTER (tier 1)

**Role-fit:** the automaton answer to swarmers — tiny, cheap, flown in clouds. Each candidate is a different primitive geometric solid.

### B6-a. OCELLUS-3
- **Class/role:** Drone swarm-fighter (T1). New drone family `polyhedron`.
- **Visual:** A perfect regular octahedron — two pyramids base-to-base — small enough that a flight of them fits in a cargo bay. No features except a single glowing eye-spot on one vertex. Reads as a floating diamond. `Material_Hull`: matte grey cerametal, faceted. `Material_Accent`: thin black grooves along every edge (the seams). `Material_Emissive`: a single cold-blue eye-vertex.
- **Stats sketch:** hull very low / shield low / speed very high / cargo none. Weapon: 1×S front (a vertex-mounted microlaser). 1×S engine.
- **Backstory:** The Concordance's baseline combat-unit. OCELLUS-3s are produced in asteroid factories by the thousand; a swarm is a single distributed firing solution.
- **Signature tactic:** Swarm-fuse — fly in clouds of 6-12, share one targeting solution, all fire on the same shield facing simultaneously. Individually trivial; collectively lethal.
- **Faction:** Concordance (Helix).

### B6-b. VECTOR-7
- **Class/role:** Drone swarm-fighter (T1). New drone family `tetrahedron`.
- **Visual:** A regular tetrahedron — four triangular faces, sharp — slightly larger than the OCELLUS, with three tiny thrusters at the base vertices. Reads as a flying pyramid. `Material_Hull`: same matte grey cerametal. `Material_Accent`: black edge-seams. `Material_Emissive`: a red ring around the forward-pointing apex.
- **Stats sketch:** hull very low / shield low / speed high / cargo none. Weapon: 1×S front (apex flechette-gun). 1×S engine.
- **Backstory:** The Concordance's fast-attack variant. VECTOR-7s sacrifice the OCELLUS's sensor-fusion for raw speed; they hit the swarm first and die first.
- **Signature tactic:** Headlong charge — closes at top speed, fires once at point-blank, often rams. The cheap bullet-sponge that screens the heavier drones behind it.
- **Faction:** Concordance.

### B6-c. SHARD-1
- **Class/role:** Drone swarm-fighter (T1). New drone family `rhombus`.
- **Visual:** A flat thin rhombus — a single faceted plate, edge-on to the enemy by default, rotating to present a knife-profile. Reads as a flying shard of glass. `Material_Hull`: same matte grey cerametal, polished mirror-flat. `Material_Accent`: hairline black edge-seam. `Material_Emissive`: a thin violet line along the long axis.
- **Stats sketch:** hull very low / shield low / speed high / cargo none. Weapon: 1×S turret (an edge-mounted emitter that tracks). 1×S engine.
- **Backstory:** The Concordance's evasive variant. SHARD-1s present minimum cross-section; they're hard to hit and they know it, rolling constantly to defeat lead.
- **Signature tactic:** Edge-on evasion — keeps its thin profile toward the target, rolls continuously, turret nicks away. The drone that doesn't die to return fire.
- **Faction:** Concordance.

### B6-d. PRISM-9
- **Class/role:** Drone swarm-fighter (T1), the gunboat-lite. New drone family `prism`.
- **Visual:** A triangular prism — long, three rectangular faces, two triangular end-caps — noticeably chunkier than the other swarm drones. Reads as a flying toblerone. `Material_Hull`: matte grey cerametal. `Material_Accent`: black face-seams. `Material_Emissive`: three small steady green lights, one centered on each rectangular face.
- **Stats sketch:** hull low / shield low / speed medium / cargo none. Weapons: 3×S (one emitter per face — all-aspect, no front bias). 1×S engine.
- **Backstory:** The Concordance's all-aspect swarm-unit. PRISM-9s have no "front" — they fire from whichever face is toward you. Used to screen against flanking fighters.
- **Signature tactic:** Omni-fire — three emitters mean it's always shooting you regardless of facing. Slow for a swarm drone but relentless; you cannot get behind it.
- **Faction:** Concordance.

### B6-e. CIPHER-0
- **Class/role:** Drone swarm-fighter (T1), the stealth-spotter. New drone family `sphere`.
- **Visual:** A featureless smooth sphere, small, with no visible seams, ports, or features — just a dark ball. Reads as a ball bearing or a black marble. `Material_Hull`: obsidian-black non-reflective coating. `Material_Accent`: none — intentionally featureless. `Material_Emissive`: none visible; glows faint IR only when firing.
- **Stats sketch:** hull very low / shield low / speed high / cargo none. Weapon: 1×S (a short-range disruptor pulse). 1×S engine. (Utility: passive stealth — small sensor radius.)
- **Backstory:** The Concordance's stealth-spotter. CIPHER-0s go dark, infiltrate, mark targets for the swarm. They are the first sign of a Concordance incursion, if you see them — most don't.
- **Signature tactic:** Stealth-mark — runs cold and small, gets close, paints the target for the OCELLUS swarm. No one ever sees the CIPHER that killed them; they see the swarm it called.
- **Faction:** Concordance.

## B7 — Drone INTERCEPTOR (tier 2)

**Role-fit:** the automaton's fast-pursuit hull, peer to the Hornet. Each candidate is a different sharp-elongated geometry.

### B7-a. LANCE-A
- **Class/role:** Drone interceptor (T2). New drone family `needle`.
- **Visual:** A long thin needle — a four-finned dart, mostly barrel, with a needle-point nose. Extreme length-to-width ratio. Reads as a thrown spear or a railgun with fins. `Material_Hull`: matte grey cerametal. `Material_Accent`: black fin-edges. `Material_Emissive`: a single bright white muzzle-glow at the point.
- **Stats sketch:** hull low / shield medium / speed extreme / cargo none. Weapons: 1×M front (a long-barrel railgun built into the body). 1×M engine.
- **Backstory:** The Concordance's sniper. LANCE-As hold at range and pick targets with their integral railgun; their bodies are essentially a barrel with an engine.
- **Signature tactic:** Range-snipe — loiters at railgun-max, fires, relocates before you can close. Pure standoff; if you corner one it dies in seconds.
- **Faction:** Concordance.

### B7-b. CRESCENT-B
- **Class/role:** Drone interceptor (T2). New drone family `crescent`.
- **Visual:** A crescent-moon shape — a thin curved blade of metal opening forward like a pair of jaws, with a small engine-pack at the base. Reads as a flying boomerang or jaw-trap. `Material_Hull`: matte grey cerametal. `Material_Accent`: black inner-edge groove. `Material_Emissive`: a hot orange glow along the inner crescent-edge (the weapon).
- **Stats sketch:** hull low / shield medium / speed high / cargo none. Weapons: 2×S front (the two crescent-tips fire converging beams). 1×M engine.
- **Backstory:** The Concordance's pincer-unit. CRESCENT-Bs attack in pairs from offset angles, their converging fire creating a kill-zone at the intersection.
- **Signature tactic:** Converging-pair — two CRESCENT-Bs bracket a target and fire inward; the target must break toward one to escape the other. Designed to be flown in twos.
- **Faction:** Concordance.

### B7-c. STILETTO-C
- **Class/role:** Drone interceptor (T2). New drone family `blade`.
- **Visual:** A flat double-edged blade — thin side-on, wide face-on, tapering to a point. Like a thrown knife or a broadsword silhouette. Reads as a flying sword. `Material_Hull`: matte grey cerametal, mirror-polished flats. `Material_Accent`: black sharpened edge. `Material_Emissive`: a thin red spine-line down the centerline.
- **Stats sketch:** hull low / shield medium / speed very high / cargo none. Weapons: 1×M front (a cutting-beam from the point). 1×M engine.
- **Backstory:** The Concordance's dasher. STILETTO-Cs present a knife-edge profile on approach, then pivot flat-on to fire — a profile-shift that defeats aim.
- **Signature tactic:** Profile-flip — knife-edge to close (hard to hit), flat-on to fire (suddenly big target that already shot you). The interceptor that survives its own attack run by being thin when it matters.
- **Faction:** Concordance.

### B7-d. HELIX-D
- **Class/role:** Drone interceptor (T2), the disabler. New drone family `helix`.
- **Visual:** Two long thin struts twisted around each other in a double-helix, joined at nose and tail, with a small drone-core at the center. Reads as a flying DNA-strand or drill-bit. `Material_Hull`: matte grey cerametal struts. `Material_Accent`: black twist-grooves. `Material_Emissive`: the central core pulses electric-blue.
- **Stats sketch:** hull low / shield medium / speed high / cargo none. Weapons: 1×M front (an EMP lance from the core). 1×M engine.
- **Backstory:** The Concordance's disabler. HELIX-Ds are why captured Concordance drones are rare — they disable the disabler. Used to strip the drive off fleeing ships so the swarm can catch up.
- **Signature tactic:** Disable-then-swarm — EMP-lances the drive/shields, then holds position while OCELLUS clouds arrive. Never finishes the kill itself.
- **Faction:** Concordance.

### B7-e. RAZOR-E
- **Class/role:** Drone interceptor (T2), the knife-fighter. New drone family `razor`.
- **Visual:** A single flat rectangular plate — like a razor-blade or a domino — thin, with a small emitter-cluster at each long edge. Reads as a flying bar of soap or a credit card. `Material_Hull`: matte grey cerametal. `Material_Accent`: black perimeter groove. `Material_Emissive`: two small green lights at the forward corners.
- **Stats sketch:** hull low / shield medium / speed very high / cargo none. Weapons: 2×S front (corner emitters, wide gimbal). 1×M engine.
- **Backstory:** The Concordance's knife-fighter — the interceptor meant to win turning fights, not just dashes. Its flat body generates more turn-authority than the needle-types.
- **Signature tactic:** Turn-fight — unlike its dash-focused siblings, the RAZOR-E stays in the fight and out-turns you. The interceptor you can't shake once it's on you.
- **Faction:** Concordance.

## B8 — Drone GUNSHIP (tier 3)

**Role-fit:** the automaton's heavy-brawler, peer to the Bastion/Warden. Each candidate is a different large geometric solid — fort, slab, lattice.

### B8-a. CITADEL-F
- **Class/role:** Drone gunship (T3). New drone family `hexagon`.
- **Visual:** A regular hexagonal prism — flat top and bottom, six vertical faces — a flying honeycomb-cell or nuts-and-bolts hex-nut scaled up. Each vertical face mounts a weapon. Reads as a fort or a die. `Material_Hull`: matte grey cerametal. `Material_Accent`: black face-seams. `Material_Emissive`: a steady green light centered on each face (the weapon-eye).
- **Stats sketch:** hull high / shield high / speed low / cargo small (≈40). Weapons: 6×M turret (one per face — true all-aspect). 1×L engine.
- **Backstory:** The Concordance's gunship-blockhouse. A CITADEL-F has no weak facing; it is the drone you use to hold a station-approach. They deploy in rings.
- **Signature tactic:** All-aspect wall — six turrets, no blind spot, advances slowly under continuous fire from every face. There is no "behind" a CITADEL-F; you break it by focus-firing one face down.
- **Faction:** Concordance.

### B8-b. BASTION-G
- **Class/role:** Drone gunship (T3). New drone family `cube`.
- **Visual:** A large featureless cube — the platonic solid, just bigger than the others — with a single heavy emitter recessed into the center of each of its six faces. Reads as a Borg cube or a die. `Material_Hull`: matte grey cerametal. `Material_Accent`: deep black recessed weapon-ports. `Material_Emissive`: a single red light deep within each weapon-port.
- **Stats sketch:** hull extreme (for tier) / shield medium / speed very low / cargo small (≈30). Weapons: 6×M (one per face) — slow-firing heavy emitters. 1×L engine.
- **Backstory:** The Concordance's block. BASTION-Gs are the slowest, toughest drone in their weight class — a wall that walks. Where a CITADEL suppresses, a BASTION anchors.
- **Signature tactic:** Slow dreadnought-lite — six slow heavy guns, immense hull, barely moves. The anvil the swarm hammers you against.
- **Faction:** Concordance.

### B8-c. KEEPER-H
- **Class/role:** Drone gunship (T3), the artillery. New drone family `polyhedron2`.
- **Visual:** An icosahedron — twenty triangular faces — bristling with small turrets at each vertex. The most complex drone silhouette. Reads as a spiked ball or a d20. `Material_Hull`: matte grey cerametal. `Material_Accent`: black vertex-collars. `Material_Emissive`: a pulsing violet core-light visible through the face-gaps.
- **Stats sketch:** hull high / shield high / speed low / cargo small (≈35). Weapons: 12×S turret (every vertex) + 1×L turret (a top-mounted spine). 1×L engine.
- **Backstory:** The Concordance's flak-platform. KEEPER-Hs deny a volume of space — their twelve vertex-guns create a PD-web that shreds missiles and fighters alike.
- **Signature tactic:** Volume-denial — the PD/suppression platform; punishes missile-boats and strike-craft, vulnerable to heavy direct fire. The gunship you cannot missile-spam.
- **Faction:** Concordance.

### B8-d. MONOLITH-I
- **Class/role:** Drone gunship (T3), the slab-brawler. New drone family `slab`.
- **Visual:** A single vast rectangular slab — a flying black-rectangle monolith, narrow edge-on, huge flat-face — with two heavy gun-blisters on the broad faces and an engine slab at the base. Reads as the 2001 monolith or a giant smartphone. `Material_Hull`: matte grey cerametal. `Material_Accent`: perfect black broad faces (intentionally light-absorbing). `Material_Emissive`: two cold white gun-ports.
- **Stats sketch:** hull high / shield high / speed low / cargo small (≈40). Weapons: 2×L front (the blisters, fires through the slab) + 2×M broadside (edge-mounted). 1×L engine.
- **Backstory:** The Concordance's main-line gunship. MONOLITH-Is advance in line-abreast — each slab face a shield, each blister firing forward — a wall of cerametal that walks toward you.
- **Signature tactic:** Line-advance — flies flat-face-forward to tank, edge-on to present the broadside, cycling profiles. The drone that wins by formation, not individual skill.
- **Faction:** Concordance.

### B8-e. LATTICE-J
- **Class/role:** Drone gunship (T3), the open-frame. New drone family `lattice`.
- **Visual:** An open cubic frame — twelve struts forming a wireframe cube, no skin, with a small glowing core floating at the center and weapon-nodes at each of the eight vertices. You can see through it. Reads as a wireframe model or a tinker-toy construction. `Material_Hull`: thin matte grey cerametal struts. `Material_Accent`: black node-joints. `Material_Emissive`: the central core and eight vertex-nodes glow electric-blue.
- **Stats sketch:** hull low (for tier) / shield very high / speed medium / cargo small (≈30). Weapons: 8×S turret (vertex-nodes). 1×L engine.
- **Backstory:** The Concordance's shield-tank — most of its mass is projected shield, not hull. LATTICE-Js are fragile if you break the shield, near-immortal until you do.
- **Signature tactic:** Shield-egg — tiny hull inside a vast regenerating shield, eight light turrets. The gunship that dies the instant its shield drops but is unkillable until then — a sharp phase-transition fight.
- **Faction:** Concordance.

## B9 — Drone TENDER (tier 2-3)

**Role-fit:** the automaton's support/carrier — refits, recharges, and re-spawns the swarm. Peer to a mini-carrier. Each candidate is a different support-architecture.

### B9-a. CRADLE-K
- **Class/role:** Drone tender (T3). New drone family `cradle`.
- **Visual:** A large open frame shaped like a cradle or a sling — a curved trough that holds 4-6 smaller drones docked along its inner face, with an engine-block at the base. Reads as a flying bookshelf or a quiver. `Material_Hull`: matte grey cerametal frame. `Material_Accent`: black docking-clamps. `Material_Emissive`: a warm amber charge-glow at each dock (drones glow brighter as they recharge).
- **Stats sketch:** hull medium / shield medium / speed low / cargo medium (≈80). Weapons: 2×S turret (PD). Utility: recharges docked drones' shields/cap, re-spawns destroyed drones slowly. 1×L engine.
- **Backstory:** The Concordance's mobile drone-factory. CRADLE-Ks sit behind the swarm line, regenerating losses; kill the CRADLE and the swarm stops replenishing.
- **Signature tactic:** Nest-guardian — stays at the back, spits replacement drones, heals the damaged. Priority target that is heavily defended; never approaches the line itself.
- **Faction:** Concordance.

### B9-b. HIVE-L
- **Class/role:** Drone tender (T2-3), the mass-carrier. New drone family `hivedrone`.
- **Visual:** A large flat honeycomb slab — like the bio Hive-Comb but rigid metal — dozens of hexagonal drone-bays on the broad faces, each bay holding a ready OCELLUS. Reads as a flying beehive or a server-rack. `Material_Hull`: matte grey cerametal. `Material_Accent`: black bay-rims. `Material_Emissive`: a cold blue light in each occupied bay.
- **Stats sketch:** hull medium / shield low / speed low / cargo high (≈120). Weapons: 4×S turret (PD). Utility: launches OCELLUS-3 swarms rapidly. 1×L engine.
- **Backstory:** The Concordance's mass-launcher. A HIVE-L can flood a sector with swarm-drones in minutes; the Battle of Reese's Reach was decided by three of them.
- **Signature tactic:** Swarm-spammer — pure carrier, dumps clouds of OCELLUS-3s, has no teeth itself. The soft target that makes the swarm unending; kill it first or not at all.
- **Faction:** Concordance.

### B9-c. WARDEN-M
- **Class/role:** Drone tender (T3), the shield-projector. New drone family `projector`.
- **Visual:** A wide disc — a shallow flying-saucer / shield-dome generator — with a central projector-spire on top and a flat underside bristling with emitter-arrays. Reads as a hover-disc or a mushroom. `Material_Hull`: matte grey cerametal. `Material_Accent`: black emitter-rings. `Material_Emissive`: the projector-spire pulses cyan; a faint shimmering dome is visible around it.
- **Stats sketch:** hull low / shield high / speed low / cargo small (≈40). Weapons: 2×S turret. Utility: projects a shield-bubble that protects nearby drones. 1×L engine.
- **Backstory:** The Concordance's force-multiplier. WARDEN-Ms anchor a drone-formation under a shared shield; combined with a CRADLE, a Concordance fleet becomes near-unbreakable.
- **Signature tactic:** Shield-bubble — buffs all friendly drones' shields in radius. The support that makes the swarm tanky; killing it collapses the formation's survivability.
- **Faction:** Concordance.

### B9-d. FOUNDRY-N
- **Class/role:** Drone tender (T3), the munitions-factory. New drone family `foundry`.
- **Visual:** A boxy industrial frame — a flying factory — with visible conveyor-chutes, hopper-silos, and extruder-ports along its flanks, constantly ejecting spent casings and freshly-built drone-parts. Reads as a floating assembly-line or a 3D-printer the size of a bus. `Material_Hull`: matte grey cerametal, soot-stained. `Material_Accent`: rust-orange machinery. `Material_Emissive`: orange smelt-glow from the extruder-ports.
- **Stats sketch:** hull medium / shield low / speed very low / cargo high (≈150). Weapons: 2×S turret. Utility: consumes onboard raw-material to *print* ammo/missiles for allied drones, refits destroyed drones slowly. 1×L engine.
- **Backstory:** The Concordance's logistics-node. FOUNDRY-Ns eat asteroid debris and wreckage and excrete fresh drones — they are why a Concordance presence, once established, is so hard to eradicate.
- **Signature tactic:** Resource-loop — converts nearby wreckage/asteroids into drone-replacements. The longer the fight, the stronger it gets; must be killed fast or starved of debris.
- **Faction:** Concordance.

### B9-e. ARSENAL-O
- **Class/role:** Drone tender (T3), the missile-barge. New drone family `arsenal`.
- **Visual:** A long flat barge stacked with vertical missile-cell tubes in neat rows, like a submarine's missile deck or a pipe-organ. Reads as a flying missile-sub or a rocket-battery. `Material_Hull`: matte grey cerametal. `Material_Accent`: black cell-rims. `Material_Emissive`: green ready-lights on each cell, going dark as it fires.
- **Stats sketch:** hull medium / shield low / speed very low / cargo medium (≈90). Weapons: 4×L (missile cells — extreme volley but limited ammo, no reload). 1×L engine.
- **Backstory:** The Concordance's fire-support. ARSENAL-Os dump their entire magazine in one overwhelming barrage, then withdraw to a FOUNDRY to reload — a cyclic artillery rhythm.
- **Signature tactic:** Alpha-strike — one colossal missile-volley, then it's an empty hull that must retreat. All-or-nothing; if the barrage doesn't break you, the ARSENAL is helpless.
- **Faction:** Concordance.

## B10 — Drone DREADNOUGHT-CORE (tier 5)

**Role-fit:** the automaton's endgame hull — the central mind-node, peer to the Leviathan. Each candidate is a different "core" architecture — pyramid, sphere, merged-poly, obelisk, crown.

### B10-a. OVERSEER-PRIME
- **Class/role:** Drone dreadnought-core (T5). New drone family `pyramid`.
- **Visual:** A vast four-sided pyramid — like a Giza pyramid scaled to a battleship — floating point-up, with a glowing eye-aperture at the apex and weapon-arrays along each base-edge. Reads as a floating pyramid or the back of a dollar bill. `Material_Hull`: matte grey cerametal, facet-edges razor-clean. `Material_Accent`: black hieroglyph-like seam-grooves (actually serial-codes). `Material_Emissive`: the apex-eye blazes white-gold; the base-edges glow dull red.
- **Stats sketch:** hull extreme / shield extreme / speed very low / cargo medium (≈200). Weapons: 1×L front (apex-eye main gun) + 4×L turret (base-edge arrays) + 12×S turret (PD). Utility: coordinates all Concordance in system. 1×L engine.
- **Backstory:** The Concordance's system-capital — the mind that runs a swarm. An OVERSEER-PRIME is a strategic target; destroying one blinds every drone in the sector for critical seconds.
- **Signature tactic:** Apex-lance — the eye-gun is a devastating fixed superweapon; the base-arrays cover all arcs. Killing it collapses the entire local Concordance into disorganized fragments.
- **Faction:** Concordance.

### B10-b. NEXUS-ZERO
- **Class/role:** Drone dreadnought-core (T5). New drone family `nucleus`.
- **Visual:** A single perfect sphere — vast, smooth, featureless — surrounded by three orbiting rings of weapon-nodes and drone-docks (like a gyroscope or an atom-model). The sphere itself has no openings. Reads as a death-star-as-atom or a moon with rings. `Material_Hull`: obsidian-grey mirror-polished cerametal sphere. `Material_Accent`: black matte ring-struts. `Material_Emissive`: the sphere's surface ripples with slow internal violet light; the ring-nodes glow blue.
- **Stats sketch:** hull extreme / shield extreme / speed very low / cargo medium (≈180). Weapons: 6×L turret (ring-mounted) + 12×S turret. Utility: drone-bay (launches all types). 1×L engine.
- **Backstory:** The Concordance's mobile core-world. NEXUS-ZEROS are rare — the rumor is that there is only one, and it moves. Concord doctrine is to flee on detection.
- **Signature tactic:** Orbiting-battery — the rings rotate, cycling turrets through arcs; combined with constant drone-launch, it projects power in every direction equally. No weak arc; you must out-sustain it.
- **Faction:** Concordance.

### B10-c. CONSENSUS
- **Class/role:** Drone dreadnought-core (T5), the merged-mind. New drone family `convergence`.
- **Visual:** A cluster of several distinct large polyhedra — a pyramid, a cube, an octahedron, a prism — physically fused together at their faces into one irregular mass, as if they grew into each other. Reads as a merged crystal-cluster or a tumor of shapes. `Material_Hull`: matte grey cerametal, each sub-shape slightly different shade. `Material_Accent`: black fusion-seams between the shapes. `Material_Emissive`: each sub-shape has its own colored core-light (blue, red, green, violet), pulsing out of sync.
- **Stats sketch:** hull extreme / shield high / speed very low / cargo medium (≈220). Weapons: 8×L turret (distributed across the sub-shapes) + 16×S turret. Utility: when a sub-shape is destroyed, the core weakens but survives. 1×L engine.
- **Backstory:** The Concordance's fallback-node — several minds merged into one hull when their individual cores were threatened. CONSENSUS is what the Concordance builds when it's losing; it is grief made geometry.
- **Signature tactic:** Multi-phase — destroy each sub-shape in sequence to disable its guns; the core fights at full strength until the last shape falls. A fight of attrition with clear phase-breaks.
- **Faction:** Concordance.

### B10-d. AXIOM
- **Class/role:** Drone dreadnought-core (T5), the obelisk. New drone family `obelisk`.
- **Visual:** A single towering rectangular obelisk — narrow, immensely tall (long), tapered to a point, floating on its side like a stiletto the size of a station. Weapon-arrays run along the four long edges. Reads as a flying black-monolith-spike or a sharpened Washington-Monument. `Material_Hull`: obsidian-black cerametal, mirror-flat. `Material_Accent`: hairline silver edge-lines. `Material_Emissive`: the point and the edge-arrays glow steady cold white.
- **Stats sketch:** hull extreme / shield high / speed low / cargo small (≈120). Weapons: 2×L front (point) + 4×L broadside (edges, two each side). 1×L engine.
- **Backstory:** The Concordance's axiom — the foundational principle made material. AXIOMs are the dreadnought the Concordance fields when it has decided a thing no longer exists. None has ever retreated.
- **Signature tactic:** Broadside-monolith — presents its narrow edge on approach (nearly unkillable head-on), then pivots to unleash edge-broadsides. The fight is about managing which face it shows you.
- **Faction:** Concordance.

### B10-e. MONARCH
- **Class/role:** Drone dreadnought-core (T5), the crown. New drone family `crown`.
- **Visual:** A wide ring-torus — a crown — with a dozen tall vertical spires rising from the outer rim, each spire a heavy weapon, and an empty void at the center. Reads as a flying crown or a circular-saw with spires. `Material_Hull`: matte grey cerametal ring and spires. `Material_Accent`: black gem-like insets on each spire. `Material_Emissive`: the central void crackles with continuous blue lightning; the spire-gems pulse in sequence.
- **Stats sketch:** hull extreme / shield extreme / speed low / cargo medium (≈200). Weapons: 12×L turret (spires — all-aspect) + the central void (a tractor-crusher, like the bio Gyre-Womb's maw). 1×L engine.
- **Backstory:** The Concordance's throne — the rarest core-class, fielded only in defense of the deep-factories. A MONARCH holds a system by itself; the ring is the wall, the void is the execution.
- **Signature tactic:** Ring-and-void — twelve all-aspect spires suppress, the central void pulls in and destroys anything small that crosses the ring. The counter is standoff fire; the trap is getting pulled in.
- **Faction:** Concordance.

---
---

# GROUP 3 — PIRATE / SCAV VARIANTS (B11–B15)

**Faction:** the Reach (existing hostile pirate faction), but the POINT of this group is that each Reach *sub-faction* builds its OWN distinct chassis — no shared hulls. The Reach is a confederation of distinct pirate cultures, not a uniform navy. Each sub-faction has a name, a visual language (materials + silhouette logic), and a doctrine.

**Sub-factions defined here (for Category-A faction-kit use):**
- **The Maw** — reaver raiders; swooping aggressive shapes; raw red-and-black; doctrine: hit-and-fade.
- **Rust-Lords** — junk-barons; welded-slag asymmetry; rust-orange and patched; doctrine: jury-rigged volume.
- **The Splinters** — desperate refugees; thin spike-shapes; pale and stripped; doctrine: numbers over quality.
- **Drift-Kings** — nomad freebooters; masked, symmetrical, painted; doctrine: versatile multirole.
- **Black Tot** — veteran buccaneers; heavy armored shapes; black-and-gold; doctrine: stand-up fights.

Naming register is raucous and personal (Scythe, Razorjack), not formal.

## B11 — Pirate RAIDER (tier 2)

**Role-fit:** the Reach's line attacker, peer to the Drifter/Corsair. Each candidate is a different sub-faction's idea of a fast attack craft.

### B11-a. Scythe
- **Class/role:** Pirate raider (T2). Reach family `maw`.
- **Visual:** A long curving single wing — a crescent or sickle-blade — with a small podded cockpit-gondola slung below the leading edge and an oversized thruster at the base. The wing-edge is sharpened. Reads as a flying scythe or crescent-moon. `Material_Hull`: raw unpainted dark metal, scorched. `Material_Accent`: blood-red leading-edge paint. `Material_Emissive`: the thruster burns an angry orange; a single red running-light on the gondola.
- **Stats sketch:** hull medium / shield low / speed very high / cargo tiny (≈20). Weapons: 2×S front (wing-root guns). 1×M engine.
- **Backstory:** The Maw's signature rider. Scythes strafe in low and fast, slash through, and run before the gunners track them. The red edge-paint is a kill-count tradition.
- **Signature tactic:** Slash-and-run — one high-speed firing pass, never turns to re-engage, relies on the next Scythe in the wave. The raider you fight in sequence, not one-on-one.
- **Faction:** Reach / the Maw.

### B11-b. Razorjack
- **Class/role:** Pirate raider (T2). Reach family `rust`.
- **Visual:** An asymmetrical welded junk-heap — three different hull-plates bolted together at wrong angles, a scavenged freighter engine duct-taped to the back, guns sticking out at odd directions. Reads as a flying scrap-pile or Mad-MMax buggy. `Material_Hull`: mismatched rust-orange and grey plates, riveted. `Material_Accent`: bare-metal weld-beads and patches. `Material_Emissive`: a sputtering yellowish thruster-flame (the engine runs rough).
- **Stats sketch:** hull medium / shield low / speed high / cargo small (≈40). Weapons: 3×S (front + two off-angle turrets jury-rigged from salvaged emitters). 1×M engine.
- **Backstory:** The Rust-Lord rider, built from whatever washed up. No two Razorjacks are quite identical; they're as individual as their builders. The Rust-Lord fleet looks like a junkyard and fights like one too.
- **Signature tactic:** Jury-rigged spray — three guns at odd angles create an unpredictable fire-spread; worse accuracy but covers a wide cone. The raider that hits glancing from unexpected angles.
- **Faction:** Reach / Rust-Lords.

### B11-c. Splinter
- **Class/role:** Pirate raider (T2), the cheap-numbers type. Reach family `splinter`.
- **Visual:** A thin sharp spike — a stripped-down needle-frame with the absolute minimum of structure, the cockpit a bare bubble, the engine a bare nozzle, everything else cut away to save mass. Reads as a flying fencing-foil or a stripped drag-racer. `Material_Hull`: pale unpainted bare metal, unfinished. `Material_Accent`: none — no paint, no comfort. `Material_Emissive`: a single bright-blue drive flare; nothing else.
- **Stats sketch:** hull very low / shield none / speed extreme / cargo tiny (≈8). Weapons: 1×M front (one good gun, all they could afford). 1×M engine.
- **Backstory:** The Splinter-caste raider — desperate refugees turned pirate, flying ships they can barely afford. Individually pitiful; in a swarm of twenty, lethal. They have nothing to lose and they fly like it.
- **Signature tactic:** Swarm-suicide — closes at top speed, fires once, often rams if the gun jams. The cheapest hull in the Reach; you kill dozens and they keep coming.
- **Faction:** Reach / the Splinters.

### B11-d. Hollow-Bill
- **Class/role:** Pirate raider (T2), the deceptive multirole. Reach family `drift`.
- **Visual:** A clean symmetrical shape — a flat diamond or kite — but the entire forward face is a painted false-transom: a mural of a peaceful trader or a friendly emblem, concealing the gun-ports behind it. Reads as a masked corsair or a stage-flat. `Material_Hull`: clean painted metal, gaudy. `Material_Accent`: the false-transom mural (different per ship). `Material_Emissive`: concealed amber gun-ports that only glow when the panels open.
- **Stats sketch:** hull medium / shield medium / speed high / cargo small (≈35). Weapons: 2×M front (concealed behind drop-panels). 1×M engine.
- **Backstory:** The Drift-King decoy-raider. Hollow-Bills masquerade as traders until they're in range, then the false-face drops and the guns come out. The murals are an art-form and a point of pride.
- **Signature tactic:** False-flag ambush — reads as a neutral or friendly on sensors and silhouette until it opens fire. The raider that wins the first volley by deception.
- **Faction:** Reach / Drift-Kings.

### B11-e. Scab
- **Class/role:** Pirate raider (T2), the armored-brawler. Reach family `blacktot`.
- **Visual:** A chunky armored wedge — a small but heavily plated attacker, every surface layered with welded-on armor plates (the "scabs"), guns recessed into armored sockets. Reads as a flying armored-car or a barnacled brick. `Material_Hull`: black-painted heavy plate. `Material_Accent`: gaudy gold trim and skull-motifs. `Material_Emissive`: gold-tinted gun-muzzles and a dirty yellow drive.
- **Stats sketch:** hull high (for a raider) / shield medium / speed medium / cargo small (≈30). Weapons: 2×S front + 1×S turret. 1×M engine.
- **Backstory:** The Black Tot raider — a veteran's hull, built to take hits and dish them. Black Tot raiders don't run; they're too well-armored to need to. The gold trim is plundered bullion, welded on as a taunt.
- **Signature tactic:** Stand-up brawl — the raider that doesn't need to flee; closes and grinds. The pirate you can't chase off with a single volley.
- **Faction:** Reach / Black Tot.

## B12 — Pirate BOARDING-TENDER (tier 2-3)

**Role-fit:** the Reach's capture-specialist — disables and boards rather than destroys. Peer to a mini-corsair with a grapple-doctrine. Each candidate a different boarding-architecture.

### B12-a. Grapple-Iron
- **Class/role:** Pirate boarding-tender (T2-3). Reach family `maw`.
- **Visual:** A blunt heavy bow shaped like a harpoon-launcher — the forward third is a massive magnetic grapple-cannon on a rotating collar, the aft two-thirds is troop-pod and engine. Reads as a flying harpoon-gun or tugboat-with-claw. `Material_Hull`: raw dark metal, battered. `Material_Accent`: red war-stripe down the grapple-collar. `Material_Emissive`: the grapple-tip glows hot orange when charging; blue drive flare aft.
- **Stats sketch:** hull high / shield low / speed medium / cargo medium (≈80, for captured goods). Weapons: 1×M front (the grapple — pulls target in) + 2×S turret (cover fire). Utility: boarding (captures disabled ships). 1×M engine.
- **Backstory:** The Maw's prize-taker. Grapple-Irons fire a magnetic harpoon, reel the target in, and board it. Where the Scythe destroys, the Grapple-Iron captures — and a captured freighter is worth ten destroyed ones.
- **Signature tactic:** Grapple-board — harpoons a disabled or slow target, drags it close, boards to seize cargo/ship. Useless against a fighting ship; devastating against a freighter that can't break the line.
- **Faction:** Reach / the Maw.

### B12-b. Breacher
- **Class/role:** Pirate boarding-tender (T2-3), the ram-boarder. Reach family `rust`.
- **Visual:** A flat-fronted slab — a flying battering-ram — the entire forward face a reinforced impact-plate with explosive breaching-charges studded across it, aft section a troop-compartment. Reads as a floating door-breacher or a riot-shield with engines. `Material_Hull`: rust-orange slab-armor. `Material_Accent`: bare-metal breach-charge rims. `Material_Emissive`: the breach-charges blink red before detonation; sputtering yellow drive.
- **Stats sketch:** hull very high / shield low / speed medium (high dash) / cargo medium (≈70). Weapons: 1×M front (breach-charge volley on contact). Utility: ram-boards (docks by collision). 1×M engine.
- **Backstory:** The Rust-Lord's brutalist boarder. Breachers ram the target flat-on, detonate the breaching-charges, and flood the wound with boarders. It is as subtle as a hammer and twice as effective.
- **Signature tactic:** Ram-and-board — boosts into the target, breaches on impact, boards through the hole. Trades hull for capture; the boarding-tender that doesn't need the target disabled first.
- **Faction:** Reach / Rust-Lords.

### B12-c. Leech
- **Class/role:** Pirate boarding-tender (T2-3), the latch-drainer. Reach family `splinter`.
- **Visual:** A small central pod with four long articulated claw-arms folded along the hull, each arm tipped with a drill-mandible and fuel-line. Reads as a flying tick or lamprey with legs. `Material_Hull`: pale stripped metal. `Material_Accent`: bare drill-steel mandibles. `Material_Emissive`: a sickly green siphon-glow at each drill-tip.
- **Stats sketch:** hull low / shield low / speed high / cargo medium (≈90). Weapons: 4×S (the drill-arms — EMP + drain). Utility: latches and siphons fuel/cargo directly. 1×M engine.
- **Backstory:** The Splinters' parasite-boarder. Leeches latch on, drill in, and drain — fuel, cargo, air, whatever they can pull. A single Leech can strip a stranded freighter bare in minutes.
- **Signature tactic:** Latch-and-drain — attaches to a slow target, disables it by siphoning cap/fuel, then pumps cargo directly across. Flees if challenged; the boarder that works alone and quietly.
- **Faction:** Reach / the Splinters.

### B12-d. Casket
- **Class/role:** Pirate boarding-tender (T2-3), the pod-launcher. Reach family `drift`.
- **Visual:** A flat rack-shaped hull carrying a dozen coffin-shaped boarding-pods along its spine, with a catapult-mechanism at the rear and a small bridge-pod at the front. Reads as a flying missile-submarine or a hearse-with-tubes. `Material_Hull`: clean painted metal, dark. `Material_Accent`: pale ivory pod-casings. `Material_Emissive`: green pod-ready lights down the spine; blue drive flare.
- **Stats sketch:** hull medium / shield medium / speed low / cargo high (≈120). Weapons: 2×S turret (PD). Utility: launches boarding-pods at range (magnetic, homes to target hull). 1×M engine.
- **Backstory:** The Drift-King standoff-boarder. Caskets fling boarding-pods across a gap — no ram, no grapple, no latch; just marines in coffins fired at your hull. The most civilized way the Reach captures a ship.
- **Signature tactic:** Standoff-board — launches boarding-pods from outside PD range, each pod a marine squad that boards on impact. The tender that never has to close; vulnerable if its pods are shot down.
- **Faction:** Reach / Drift-Kings.

### B12-e. Maul
- **Class/role:** Pirate boarding-tender (T2-3), the jaw-clamp. Reach family `blacktot`.
- **Visual:** A huge split-bow hull — the forward third is a pair of massive hydraulic clamp-jaws that open to engulf a target's stern, the rest is a bristling troop-fortress. Reads as a flying vice-jaw or a crocodile-head. `Material_Hull`: black heavy plate. `Material_Accent`: gold-trimmed jaw-rims and teeth. `Material_Emissive`: orange jaw-hydraulic glow; gold-tinted gun-ports.
- **Stats sketch:** hull extreme (for tier) / shield medium / speed low / cargo high (≈130). Weapons: 1×M turret + 4×S turret. Utility: jaw-clamp (engulfs target, immobilizes, boards). 1×L engine.
- **Backstory:** The Black Tot prize-ship — a hull built to take a capital-ship's stern in its jaws and not let go. Mauls are what the Reach sends when they want a battleship, not a freighter.
- **Signature tactic:** Jaw-clamp — envelops the target's engine-section, immobilizing and boarding simultaneously. The heaviest boarder; can capture ships far above its tier if it gets the clamp on.
- **Faction:** Reach / Black Tot.

## B13 — Pirate SCRAP-HAULER (tier 2)

**Role-fit:** the Reach's logistics — looted-goods transport and battlefield salvage. Peer to the Mule, but pirate. Each candidate hauls differently.

### B13-a. Kettle
- **Class/role:** Pirate scrap-hauler (T2). Reach family `maw`.
- **Visual:** A round bellied boiling-tank on a small drive-frame — a literal flying kettle or cauldron — with a pipe-chimney venting steam and an open scoop-mouth at the front. Reads as a witch's-cauldron or a flying boiling-vat. `Material_Hull`: blackened scorched metal tank. `Material_Accent`: rust-orange pipe-work. `Material_Emissive`: the tank-glow of molten salvage inside; orange chimney-flare.
- **Stats sketch:** hull medium / shield low / speed low / cargo high (≈180). Weapons: 1×S rear + 1×S turret. Utility: processes wreckage into salvage on the fly. 1×M engine.
- **Backstory:** The Maw's salvage-vat. Kettles follow a raid, scoop the wreckage, and melt it down into portable ingots before the Concord arrives. The steam from a working Kettle-line is the smell of a pirate victory.
- **Signature tactic:** Salvage-processor — scoops debris and converts it to cargo-value in real-time. The hauler that turns your dead allies into pirate profit; kill it to deny the salvage.
- **Faction:** Reach / the Maw.

### B13-b. Slag-Barge
- **Class/role:** Pirate scrap-hauler (T2). Reach family `rust`.
- **Visual:** A long flat open-top barge — literally a flying garbage-scow — with low walls and heaped scrap visible in the well, a small control-cabin at the bow. Reads as a floating dump-truck or canal-barge. `Material_Hull`: mismatched rusted plates. `Material_Accent`: yellow safety-striping (faded). `Material_Emissive`: a single dim cabin-light; nothing else.
- **Stats sketch:** hull high / shield low / speed very low / cargo very high (≈240). Weapons: 1×S rear. 1×M engine.
- **Backstory:** The Rust-Lord junk-barge. Slag-Barges haul anything — scrap, stolen cargo, waste, sometimes prisoners. Slow, ugly, and almost impossible to sink for their tier; even pirates escort them grudgingly.
- **Signature tactic:** Dumb-mule — maximum cargo, minimum everything else. The hauler that has no tricks and doesn't need them; it just absorbs punishment while the escorts do the work.
- **Faction:** Reach / Rust-Lords.

### B13-c. Pack-Maw
- **Class/role:** Pirate scrap-hauler (T2). Reach family `splinter`.
- **Visual:** An open lattice-crate frame — a flying shelf-unit or cargo-rack — with a jawed clamp-crane at the front that grabs debris and stacks it in the racks. Bare frame, no skin. Reads as a floating warehouse-shelving or a claw-vending-machine. `Material_Hull`: pale bare metal frame. `Material_Accent`: rust-orange clamp-crane. `Material_Emissive`: a green crane-status light.
- **Stats sketch:** hull low / shield none / speed medium / cargo high (≈200). Weapons: 1×S front (the crane can swat). Utility: tractor-scoops debris fast. 1×M engine.
- **Backstory:** The Splinters' pack-mule. Pack-Maws are built from scaffolding and hope; they sweep battlefields clean with their tractor-crane faster than anything else their size.
- **Signature tactic:** Fast-salvager — quickest debris-scoop in the Reach, but paper-thin. The hauler that races in, grabs everything, and races out before the guns find it.
- **Faction:** Reach / the Splinters.

### B13-d. Bone-Wain
- **Class/role:** Pirate scrap-hauler (T2). Reach family `drift`.
- **Visual:** A long wagon-frame with curved rib-cage ribs arching over the cargo-bed (a wain = open wagon), canvas-tarps stretched between the ribs covering the loot. Reads as a covered-wagon or a Conestoga-with-ribs. `Material_Hull`: weathered wood-and-metal wagon-frame (an affectation). `Material_Accent`: bone-white rib-cage arches (salvaged hull-ribs). `Material_Emissive`: warm lantern-glow hanging from the ribs.
- **Stats sketch:** hull medium / shield low / speed low / cargo very high (≈220). Weapons: 1×S rear + 1×S turret. 1×M engine.
- **Backstory:** The Drift-King hauler — a nomad's wagon, draped and ribbed, home to a pirate family as much as a cargo-hold. Bone-Wains are the Reach's caravan; where they gather, a fleet follows.
- **Signature tactic:** Caravan-hauler — travels in convoys, mutually defending. The hauler that's weak alone but always found in a cluster; the cluster is the threat.
- **Faction:** Reach / Drift-Kings.

### B13-e. Tinker-Heap
- **Class/role:** Pirate scrap-hauler (T2), the mobile-workshop. Reach family `rust`.
- **Visual:** A lopsided heap of welded modules — a small factory smashed into a freighter-frame — with working lathes, smelters, and drone-bays visible on the exterior, sparks flying. Reads as a floating mechanic's-shop or a junkyard-foundry. `Material_Hull`: rusted patchwork plates. `Material_Accent`: bare steel tool-rigs. `Material_Emissive`: bright welding-spark flares all over the hull; orange smelt-glow.
- **Stats sketch:** hull medium / shield low / speed low / cargo high (≈170). Weapons: 2×S turret. Utility: field-refits allied pirates (heals/repairs nearby). 1×M engine.
- **Backstory:** The Rust-Lord workshop-ship. Tinker-Heaps follow a fleet and keep it flying — patching armor, refitting drones, melting loot. A pirate fleet without one is a dying fleet.
- **Signature tactic:** Fleet-tender — repairs and refits nearby pirates during a fight. The hauler that makes the rest of the Reach fleet sustainable; high-value support target.
- **Faction:** Reach / Rust-Lords.

## B14 — Pirate GUN-BRIG (tier 3-4)

**Role-fit:** the Reach's mid-tier gunship, peer to the Bastion/Warden. Each candidate is a different pirate idea of a "wall of guns."

### B14-a. Iron-Reef
- **Class/role:** Pirate gun-brig (T3). Reach family `maw`.
- **Visual:** A broad low platform bristling with gun-barrels pointing in every direction — like a reef of guns, no clean lines, just a flat deck covered in turrets and launchers. Reads as a floating gun-platform or a hedgehog of barrels. `Material_Hull`: raw dark metal deck. `Material_Accent`: red war-paint on each gun-base. `Material_Emissive`: dozens of orange muzzle-glow points.
- **Stats sketch:** hull high / shield medium / speed low / cargo small (≈50). Weapons: 6×M turret (true all-aspect) + 2×S turret (PD). 1×L engine.
- **Backstory:** The Maw's gun-barge. Iron-Reefs are platforms, not ships — a flat deck with every gun the Maw could weld on. They sit in a lane and deny it.
- **Signature tactic:** Area-denial — six turrets cover everything; it can't chase but nothing comes close. The gun-brig that holds ground; the counter is standoff fire from outside its range.
- **Faction:** Reach / the Maw.

### B14-b. Murder-Crow
- **Class/role:** Pirate gun-brig (T3-4). Reach family `drift`.
- **Visual:** A long symmetrical broadside-brig — a proper age-of-sail frigate silhouette translated to space — with two rows of gun-ports along each flank and a tall sensor-mast like a crow's-nest. Reads as a flying galleon or a Napoleonic-frigate. `Material_Hull`: clean dark-painted hull. `Material_Accent`: gaudy painted gun-port lids (each a different color). `Material_Emissive`: amber gun-port glow when the lids open.
- **Stats sketch:** hull high / shield medium / speed medium / cargo small (≈60). Weapons: 2×L front + 4×M broadside (two each side). 1×L engine.
- **Backstory:** The Drift-King broadside-ship. Murder-Crows fight like sailing frigates — close to broadside range and unload both flanks. The most "naval" of the pirate gun-brigs; their captains affect old-world manners.
- **Signature tactic:** Broadside-pass — closes to present both flank batteries, rolls through, fires both sides in sequence. The gun-brig that wins a turning duel by out-DPSing you in the pass.
- **Faction:** Reach / Drift-Kings.

### B14-c. War-Pyre
- **Class/role:** Pirate gun-brig (T3-4), the volatile gun-brig. Reach family `rust`.
- **Visual:** A bulging overloaded hull — clearly carrying too much — with ammo-bunkers and fuel-tanks exposed on the exterior, everything running hot, flames venting from safety-valves. Reads as a floating powder-keg or a refinery-on-fire. `Material_Hull`: scorched rust-orange plates. `Material_Accent`: bare steel valve-pipes. `Material_Emissive`: continuous orange flame-vents everywhere; it is always visibly burning.
- **Stats sketch:** hull medium / shield low / speed medium / cargo high (≈100, mostly ammo). Weapons: 4×M front (overcharged, high-DPS) + 2×M turret. 1×L engine.
- **Backstory:** The Rust-Lord's volatile gun-brig. War-Pyres run their guns hot with overcharged ammo — more damage, but the ship is a fire hazard. When a War-Pyre dies, it detonates.
- **Signature tactic:** Overcharge-brawl — extreme front-DPS but takes more self-damage and explodes violently on death. The gun-brig that's dangerous dead; kill it at range or it takes you with it.
- **Faction:** Reach / Rust-Lords.

### B14-d. Black-Bill
- **Class/role:** Pirate gun-brig (T3). Reach family `blacktot`.
- **Visual:** A clean heavy cruiser silhouette — broadside batteries in armored casemates, a tall armored bridge-tower, purposeful and symmetrical — but every surface painted black with a single gold bill/motif on the bow. Reads as a proper warship in pirate livery. `Material_Hull`: black-painted heavy armor. `Material_Accent`: gold scrollwork and the bill-emblem. `Material_Emissive`: gold-tinted gun-ports; a single gold lantern atop the bridge.
- **Stats sketch:** hull very high / shield high / speed low / cargo small (≈50). Weapons: 2×L front + 4×L broadside (two each side) + 2×S turret. 1×L engine.
- **Backstory:** The Black Tot gun-brig — a stolen Concord cruiser hull, stripped and re-armed. Black-Bills are what happens when real warship doctrine meets pirate resources. The Reach fields them as squadron-leaders.
- **Signature tactic:** Stand-up warship — fights like a real broadside-cruiser, no pirate tricks, just guns and armor. The gun-brig that out-classes a Concord patrol-cruiser in a fair fight.
- **Faction:** Reach / Black Tot.

### B14-e. Scourge
- **Class/role:** Pirate gun-brig (T3-4), the spike-brawler. Reach family `maw`.
- **Visual:** A long hull covered in forward-pointing spikes — the spikes are ram-prow and gun-mounts both — bristling like a mace or a cactus. No clean lines; aggression in geometry. Reads as a floating weapon-bush or a spiked club. `Material_Hull`: raw dark metal spikes. `Material_Accent`: red war-paint on every spike-tip. `Material_Emissive`: orange spike-base glow.
- **Stats sketch:** hull high / shield low / speed medium / cargo small (≈40). Weapons: 4×L front (the spikes, converging) + 2×S turret. 1×L engine. Utility: ram-plate (spikes deal ram damage).
- **Backstory:** The Maw's line-breaker. Scourges charge — spikes forward — and either gut you with guns or gut you with the spikes. There is no third option and they prefer it that way.
- **Signature tactic:** Charge-and-impale — closes to point-blank, fires all four front-guns, and rams if you don't break. The gun-brig that wants to be in your face; the counter is keeping distance.
- **Faction:** Reach / the Maw.

## B15 — Pirate FLAGSHIP (tier 4-5)

**Role-fit:** the Reach's endgame hull — a pirate lord's throne-ship, peer to the Colossus/Leviathan. Each candidate is a different pirate king's idea of a capital.

### B15-a. Reaver-King
- **Class/role:** Pirate flagship (T4-5). Reach family `maw`.
- **Visual:** A vast jagged blade-hull — a single enormous forward-swept wedge like a saber-blade — with gun-decks cut into the edge and a crown of antenna-spikes atop the bridge-tower. Reads as a flying sword or a executioner's-axe scaled up. `Material_Hull`: raw dark metal blade. `Material_Accent`: blood-red edge-paint. `Material_Emissive`: orange gun-port glow; a single red beacon atop the crown.
- **Stats sketch:** hull extreme / shield medium / speed medium / cargo medium (≈200). Weapons: 3×L front + 4×L broadside (two each side) + 8×S turret. 1×L engine.
- **Backstory:** The flagship of a Maw reaver-king — the blade that carved his kingdom. Reaver-Kings are personal ships; each is named, and the name is feared across a sub-sector.
- **Signature tactic:** Blade-charge — advances under front-fire, then slashes through with a broadside pass. The flagship that fights like a giant Scythe; mobile for its size and aggressive.
- **Faction:** Reach / the Maw.

### B15-b. Wreck-of-Ages
- **Class/role:** Pirate flagship (T4-5). Reach family `rust`.
- **Visual:** A colossal salvage-hulk — clearly once a Concord battleship, now rebuilt ten times over with welded-on pirate additions, mismatched plates, and jury-rigged gun-towers, trailing debris and loose wiring. Reads as a Frankenstein-capital or a ship-of-Theseus nightmare. `Material_Hull`: mismatched rusted plates and patches. `Material_Accent`: bare steel weld-scars. `Material_Emissive`: sputtering yellowish power-glows all over; sparks.
- **Stats sketch:** hull extreme / shield low / speed very low / cargo high (≈400). Weapons: 2×L front + 6×L turret (scattered, all-aspect) + 12×S turret. Utility: self-repairs slowly. 1×L engine.
- **Backstory:** The Rust-Lord lord-flagship — a hulk that has been rebuilt so many times no one remembers what it started as. Wreck-of-Ages ships are passed down; each lord adds a layer.
- **Signature tactic:** Zombie-capital — immense hull, self-repairs, scattershot guns. The flagship that won't stay dead; you have to out-DPS its repair or it just keeps coming.
- **Faction:** Reach / Rust-Lords.

### B15-c. Drowned-Star
- **Class/role:** Pirate flagship (T4-5). Reach family `splinter`.
- **Visual:** A huge darkened silhouette — a capital hull running dark, no running lights, no paint, no insignia — bristling with concealed weapons behind shuttered ports. Reads as a blacked-out battleship or a submarine-surfaced-at-night. `Material_Hull`: matte black radar-absorbent coating. `Material_Accent`: none — intentionally blank. `Material_Emissive**: nothing visible until the gun-shutters open, then brief amber flashes.
- **Stats sketch:** hull high / shield medium / speed medium / cargo medium (≈220). Weapons: 4×L front + 4×L broadside + 8×S turret. Utility: cloak (capital-scale stealth). 1×L engine.
- **Backstory:** The Splinters' flagship — a stolen capital, stripped of every identifier, used for the one operation that matters. Drowned-Stars appear from nowhere, strike, and vanish. The Reach denies they exist.
- **Signature tactic:** Stealth-capital — cloaks, closes, uncloaks at close range for an alpha-strike. The flagship that fights like a giant ambush-predator; if you detect it early you win, if not you don't.
- **Faction:** Reach / the Splinters.

### B15-d. Tyrant-Maw
- **Class/role:** Pirate flagship (T4-5). Reach family `maw`.
- **Visual:** An enormous split-bow hull — the entire forward half is a gaping jaw-shaped opening lined with gun-decks and torpedo-tubes, the ship literally opens like a mouth to fire. Reads as a flying maw or a giant crocodile-skull. `Material_Hull**: raw dark metal jaw. `Material_Accent`: red war-paint on every tooth-gun. `Material_Emissive**: a hellish orange glow from deep inside the maw when it opens.
- **Stats sketch:** hull extreme / shield high / speed low / cargo high (≈300). Weapons: the maw (a 360° front-arc devastation-volley of all guns at once) + 4×L broadside + 12×S turret. 1×L engine.
- **Backstory:** The Maw's king-flagship — the namesake of the sub-faction. A Tyrant-Maw opens its bow and unloads everything at once; the *Gnashing* held the Sallow Banks for six hours alone.
- **Signature tactic:** Maw-volley — opens the bow (a telegraphed windup), then fires every forward gun in a single cataclysmic alpha. Punish the windup or eat the volley; the fight is about timing.
- **Faction:** Reach / the Maw.

### B15-e. Ashen-Lord
- **Class/role:** Pirate flagship (T4-5). Reach family `blacktot`.
- **Visual:** A massive armored dreadnought — a proper capital silhouette, broadside batteries in armored barbettes, a towering bridge — but the hull is volcanic: cracked armor-plates glowing from within, vents spewing glowing ash, the ship running so hot it visibly burns. Reads as a volcano-shaped-capital or a floating forge. `Material_Hull`: blackened cracked armor-plate. `Material_Accent`: gold trim surviving amid the ruin. `Material_Emissive`: continuous orange-red glow from every crack and vent; it is on fire from the inside.
- **Stats sketch:** hull extreme / shield high / speed low / cargo medium (≈250). Weapons: 3×L front + 6×L broadside (three each side) + 16×S turret. Utility: thermal-damage aura (burns nearby enemies). 1×L engine.
- **Backstory:** The Black Tot king-flagship — a stolen Concord dreadnought, pushed far past safe limits, burning from within but refusing to die. Ashen-Lords are legends; each is a one-ship war.
- **Signature tactic:** Burning-fortress — extreme sustained fire plus a thermal aura that damages anything close. The flagship you cannot brawl; you must out-range it. The throne of a pirate empire.
- **Faction:** Reach / Black Tot.

---
---

# GROUP 4 — AUTHORITY / CAPITAL SHIPS (B16–B20)

**Faction:** the established powers — SCN (Concord, the federation), MTS (Meridian, the industrial corp), DMC (DMC, the martial corp). These are the "big gun" tier — the lawful navies. Materials and silhouettes here are CIVILIZED: clean lines, faction-color liveries, proper naval architecture (bridges, sensor-masts, armored barbettes). Naming is formal naval (Censor, Aerie, Sovereign).

**Faction-material convention:**
- **SCN Concord** — `Material_Hull`: white-and-grey federal livery; `Material_Accent`: blue; `Material_Emissive`: clean white-blue. Doctrine: balanced, carrier-heavy, lawful.
- **MTS Meridian** — `Material_Hull`: yellow-and-black industrial; `Material_Accent`: hazard-orange; `Material_Emissive`: warm amber. Doctrine: mass-produced, drone-heavy, logistical.
- **DMC** — `Material_Hull`: dark-grey martial; `Material_Accent`: red command-stripe; `Material_Emissive`: cold red. Doctrine: heavy-gun, aggressive, professional.

## B16 — Authority PATROL-CRUISER (tier 3)

**Role-fit:** the lawful mid-tier workhorse, peer to the Bastion. The ship that polices lanes and shows the flag. Each candidate is a different authority's patrol-doctrine.

### B16-a. Censor
- **Class/role:** Authority patrol-cruiser (T3). SCN family `frigate`.
- **Visual:** A clean delta-wing cruiser — swept wings, central spine, a tall bridge-tower amidships, twin engine-nacelles aft. Balanced and purposeful. Reads as a classic federation-cruiser. `Material_Hull`: white-and-grey federal livery, regulation. `Material_Accent`: blue Concord-insignia and shield-motifs. `Material_Emissive`: clean white-blue drive flares and sensor-lights.
- **Stats sketch:** hull high / shield high / speed high / cargo small (≈60). Weapons: 2×L front + 2×L broadside (one each side) + 2×S turret (PD). 1×L engine.
- **Backstory:** The Concord's lane-cruiser — the ship every trader sees first. Censors patrol, interdict, and escalate; a Censor on your scanner is a warning, and warnings from the Concord are not repeated.
- **Signature tactic:** Interdict-and-demand — fast for a cruiser, closes to demand surrender/cargo-scan, fights only if refused. The patrol-cruiser that wins by reputation before guns; you break off or you lose.
- **Faction:** SCN Concord.

### B16-b. Magistrate
- **Class/role:** Authority patrol-cruiser (T3). MTS family `frigate`.
- **Visual:** A boxy utilitarian cruiser — flat slabs, cargo-handling cranes along the flanks, a jury-rigged looking sensor-array, no swept wings. Reads as a converted freighter or a coast-guard-cutter. `Material_Hull`: yellow-and-black industrial hazard-livery. `Material_Accent`: hazard-orange warning stripes. `Material_Emissive`: warm amber work-lights and drive.
- **Stats sketch:** hull very high / shield medium / speed medium / cargo medium (≈120). Weapons: 2×L front + 2×M turret + 2×S turret. Utility: drone-bay (PD drones). 1×L engine.
- **Backstory:** Meridian's patrol-cruiser — a militarized logistics-hull. Magistrates enforce Meridian's trade-interests, not Concord law; they're slower, tougher, and carry marines for boarding.
- **Signature tactic:** Drone-screen — deploys PD/repair drones, grinds out the fight with hull and turrets. The patrol-cruiser that wins a war of attrition, not a dash; favors the convoy-escort mission.
- **Faction:** MTS Meridian.

### B16-c. Inquisitor
- **Class/role:** Authority patrol-cruiser (T3). DMC family `frigate`.
- **Visual:** A sleek aggressive cruiser — narrow hull, raked bridge, integrated gun-barrels running the spine, no deck-cranes or freight-handling. Pure warship. Reads as a battlecruiser-in-miniature or a heavy-interceptor. `Material_Hull`: dark-grey martial livery. `Material_Accent`: red command-stripe along the waterline. `Material_Emissive`: cold red drive and targeting-lasers.
- **Stats sketch:** hull high / shield high / speed very high / cargo tiny (≈30). Weapons: 3×L front + 1×L turret. 1×L engine.
- **Backstory:** DMC's patrol-cruiser — a warship, not a police-ship. Inquisitors hunt pirates (and DMC's enemies) with extreme prejudice. They do not demand surrender; they offer none.
- **Signature tactic:** Aggressive pursuit — fastest patrol-cruiser in the tier, three front-guns for alpha-strike. The patrol-cruiser that chases you down and kills you; no interdiction-theater, just violence.
- **Faction:** DMC.

### B16-d. Watchman
- **Class/role:** Authority patrol-cruiser (T3), local-system militia. New family `militia`.
- **Visual:** A small home-built cruiser — clearly a system-defense hull, slightly outdated lines, a mix of civilian and military components, a large local-flag painted on the hull. Reads as a national-guard-cruiser or a armed-cutter. `Material_Hull`: unpainted or local-color livery (varies by system). `Material_Accent`: system-flag colors. `Material_Emissive`: mixed civilian and military lights.
- **Stats sketch:** hull medium / shield medium / speed medium / cargo medium (≈80). Weapons: 2×L front + 2×M turret. 1×L engine.
- **Backstory:** A system-militia patrol-cruiser — the local defense force, not a great-power navy. Watchmen defend their home system with determination out of proportion to their tech. The Free Systems fly these.
- **Signature tactic:** Home-soil-bonus — fights harder in its own system (rep/territory mechanic hook), weaker abroad. The patrol-cruiser that's a menace at home and a non-issue away; the local underdog.
- **Faction:** Free Systems / local militias (Category-A).

### B16-e. Vigil
- **Class/role:** Authority patrol-cruiser (T3), the deep-surveyor. SCN family `frigate`.
- **Visual:** A long-range patrol-cruiser — stretched hull, enormous sensor-masts and dish-arrays along the spine, extra fuel-tanks, a quieter drive. Reads as a survey-vessel or a picket-ship. `Material_Hull`: white-and-grey federal livery, weathered. `Material_Accent`: blue sensor-dish accents. `Material_Emissive`: blue sensor-runs and a quiet efficient drive.
- **Stats sketch:** hull high / shield high / speed medium / cargo medium (≈100). Weapons: 2×L front + 2×L turret + 2×S turret. Utility: long-range sensors, deep-tank (extreme range). 1×L engine.
- **Backstory:** Concord's deep-reach patrol-cruiser — the long-range eyes of the federation. VIGILs patrol the frontier alone for months; they are the first to find trouble and often the last to report it.
- **Signature tactic:** Long-range picket — detects threats at extreme range, calls reinforcements, kites at standoff. The patrol-cruiser that never fights alone if it can help it; it buys time for the fleet.
- **Faction:** SCN Concord.

## B17 — Authority CARRIER (tier 4)

**Role-fit:** the lawful strike-craft platform, peer to a T4 gunship but built to launch fighters. Each candidate a different carrier-doctrine.

### B17-a. Aerie
- **Class/role:** Authority carrier (T4). SCN family `capital`.
- **Visual:** A vast flat-top hull — a long flight-deck running the spine, an open launch-bay down the centerline, a tall island-bridge offset to one side. Reads as a classic aircraft-carrier or a flying airbase. `Material_Hull`: white-and-grey federal livery. `Material_Accent`: blue deck-markings and Concord-insignia. `Material_Emissive`: clean white deck-lights; blue drive flares (four, aft).
- **Stats sketch:** hull extreme / shield high / speed low / cargo high (≈300, including hangar). Weapons: 2×L turret (defensive) + 8×S turret (PD). Utility: 4× drone-bays (launches Hornet/Wasp flights). 1×L engine.
- **Backstory:** The Concord's carrier — the backbone of federal projection. An Aerie can flood a system with strike-craft; the Battle of Lorne's Star was won by two of them holding the line.
- **Signature tactic:** Strike-craft-spam — launches waves of fighters/bombers, defends itself with PD, never closes. The carrier that fights at the edge of the system; kill its strike-craft or kill it, you must choose.
- **Faction:** SCN Concord.

### B17-b. Foundry
- **Class/role:** Authority carrier (T4), drone-carrier. MTS family `capital`.
- **Visual:** A boxy industrial carrier — covered in drone-launch cells and reclamation-bays, with visible assembly-lines on the exterior printing replacement drones in real-time. Reads as a floating drone-factory or a server-farm-with-engines. `Material_Hull`: yellow-and-black industrial livery. `Material_Accent`: hazard-orange cell-rims. `Material_Emissive`: amber print-bays and drone-ready lights.
- **Stats sketch:** hull high / shield medium / speed low / cargo medium (≈200). Weapons: 4×M turret + 8×S turret. Utility: 6× drone-bays + self-manufactures drones (slower but unending). 1×L engine.
- **Backstory:** Meridian's drone-carrier — a mobile factory-ship. Foundries don't carry strike-craft so much as *produce* them; a Foundry on station is an inexhaustible drone-swarm.
- **Signature tactic:** Factory-carrier — drones are weaker than Aerie's fighters but replenished indefinitely. The carrier that wins the long game; if you can't kill it fast, you can't kill it.
- **Faction:** MTS Meridian.

### B17-c. Hatchery
- **Class/role:** Authority carrier (T4), marine/assault-carrier. DMC family `capital`.
- **Visual:** An assault-carrier — a heavily armored hull bristling with boarding-pod launchers and drop-bays, marine-barracks visible, more gun than a carrier usually carries. Reads as an amphibious-assault-ship or a marine-carrier. `Material_Hull`: dark-grey martial livery. `Material_Accent`: red command-stripe and marine-emblems. `Material_Emissive`: cold red drop-bay lights and drive.
- **Stats sketch:** hull extreme / shield high / speed low / cargo high (≈280). Weapons: 2×L front + 2×L broadside + 6×S turret. Utility: 3× drone-bays (boarding-shuttles) + marines (boards enemy capitals). 1×L engine.
- **Backstory:** DMC's assault-carrier — built to take enemy stations and capitals by boarding. Hatcheries are DMC's answer to fortifications; where they appear, an assault follows.
- **Signature tactic:** Assault-carrier — launches boarding-shuttles at enemy capitals/stations while its guns suppress. The carrier that captures rather than destroys; the threat is marines on your hull.
- **Faction:** DMC.

### B17-d. Roost
- **Class/role:** Authority carrier (T4), the fast-carrier. SCN family `capital`.
- **Visual:** A smaller, faster carrier — sleeker hull, fewer deck-bays but more engines, clearly built to keep up with a battle-line. Reads as a light-carrier or a convoy-carrier. `Material_Hull`: white-and-grey federal livery. `Material_Accent`: blue engine-cowls (it's about the engines). `Material_Emissive`: oversized blue drive flares (four big ones); white deck-lights.
- **Stats sketch:** hull high / shield high / speed high (for a carrier) / cargo medium (≈200). Weapons: 2×L front + 4×S turret. Utility: 3× drone-bays. 1×L engine.
- **Backstory:** Concord's fast-carrier — the escort-carrier that travels with battle-groups. Roosts bring strike-craft to the fight instead of waiting at the rear; they're the most-deployed carrier in the fleet.
- **Signature tactic:** Mobile-strike — moves with the fleet, launches on the move, can reposition to reinforce. The carrier that isn't a sitting duck; trades capacity for speed.
- **Faction:** SCN Concord.

### B17-e. Ark
- **Class/role:** Authority carrier (T4-5), the colony/flag-carrier. New family `ark`.
- **Visual:** A colossal slow hull — vast internal volume, multiple stacked flight-decks, habitat-domes visible, clearly built to carry everything a civilization needs. Reads as a generation-ship or a flying colony. `Material_Hull`: mixed liveries (often multi-faction — these are joint-hull). `Material_Accent`: pale habitat-domes. `Material_Emissive**: warm interior lights visible through the domes; steady drive.
- **Stats sketch:** hull extreme / shield extreme / speed very low / cargo extreme (≈600). Weapons: 4×L turret + 12×S turret. Utility: 6× drone-bays + repair-bays (heals allied capitals). 1×L engine.
- **Backstory:** A colony-ark pressed into military service — the largest hull classification any faction fields. Arks are mobile forward-bases; where an Ark anchors, a fleet operates indefinitely.
- **Signature tactic:** Forward-base — extreme capacity, heals allied capitals, launches everything. The carrier that is also the fleet's logistics-hub; killing it cripples the whole formation's sustainability.
- **Faction:** Multi-faction / Concord-led coalition.

## B18 — Authority BATTLESHIP (tier 4-5)

**Role-fit:** the lawful gun-capital, peer to the Colossus. Each candidate a different battleship-doctrine.

### B18-a. Dreadnought
- **Class/role:** Authority battleship (T4-5). SCN family `capital`.
- **Visual:** A massive balanced battleship — broadside batteries in triple turrets, a tall armored bridge-tower, a clean axial main-battery, symmetrical and purposeful. Reads as the classic HMS-Dreadnought silhouette in space. `Material_Hull`: white-and-grey federal livery. `Material_Accent`: blue turret-rings and Concord-insignia. `Material_Emissive`: clean white-blue gun-flashes and four big drive flares.
- **Stats sketch:** hull extreme / shield extreme / speed low / cargo medium (≈200). Weapons: 3×L front (main battery) + 4×L broadside (two each side) + 8×S turret. 1×L engine.
- **Backstory:** The Concord's battleship — the ship that defines the federation battle-line. Dreadnought-class ships anchor every federal fleet; they are the ironclad promise that Concord law extends this far.
- **Signature tactic:** Line-battle — advances under main-battery fire, unleashes broadsides at range, tanks on balanced hull+shield. The battleship that wins a fair fight with anyone; no tricks, just power.
- **Faction:** SCN Concord.

### B18-b. Sovereign
- **Class/role:** Authority battleship (T4-5). MTS family `capital`.
- **Visual:** A heavy industrial battleship — slab-sided, gun-turrets recessed into armored wells, visible cargo-handling and self-repair systems, less elegant but more utilitarian. Reads as a floating foundry-with-guns or a industrial-battleship. `Material_Hull`: yellow-and-black industrial livery. `Material_Accent`: hazard-orange turret-hazards. `Material_Emissive**: amber repair-glow and drive flares.
- **Stats sketch:** hull extreme / shield high / speed very low / cargo high (≈300). Weapons: 2×L front + 6×L broadside (three each side) + 6×S turret. Utility: self-repair. 1×L engine.
- **Backstory:** Meridian's battleship — a self-repairing gun-platform built for sustained siege. Sovereigns don't win quick; they win the three-day bombardment, then salvage the field.
- **Signature tactic:** Siege-battleship — immense broadside, self-repairs, extreme endurance. The battleship you outmaneuver but cannot outlast; it grinds down stationary targets (stations, fixed defenses) better than any peer.
- **Faction:** MTS Meridian.

### B18-c. Imperator
- **Class/role:** Authority battleship (T4-5). DMC family `capital`.
- **Visual:** An aggressive forward-biased battleship — all guns forward, a massive axial main-lance running the spine, minimal broadside, raked and predatory. Reads as a battlecruiser-overdosed or a giant-interceptor. `Material_Hull`: dark-grey martial livery. `Material_Accent`: red command-stripe and gun-muzzle rings. `Material_Emissive`: cold red drive and a single blinding main-lance glow.
- **Stats sketch:** hull high / shield high / speed high (for a battleship) / cargo small (≈120). Weapons: 4×L front (overweighted forward) + 2×L broadside + 4×S turret. 1×L engine.
- **Backstory:** DMC's battleship — built for the offensive, not the line. Imperators lead assaults; their doctrine is to close, destroy, advance. The DMC does not believe in defense.
- **Signature tactic:** Assault-battleship — fast for its size, overwhelming forward firepower, charges the line. The battleship that fights like a giant gunship; it cannot be kited, only out-brawled.
- **Faction:** DMC.

### B18-d. Ironclad
- **Class/role:** Authority battleship (T4-5), the monitor/siege. SCN family `capital`.
- **Visual:** A low-slung heavily armored battleship — almost no superstructure, just a vast armored raft of guns, turrets recessed behind thick gun-shields, built to tank and bombard. Reads as a monitor or a floating-citadel. `Material_Hull`: thick grey armor-citadel plating, layered. `Material_Accent`: blue turret-shields. `Material_Emissive`: minimal — gun-flashes only; the hull runs dark and cold.
- **Stats sketch:** hull maximum (the tankiest T4-5) / shield low / speed very low / cargo small (≈100). Weapons: 2×L front + 4×L turret + 6×S turret. 1×L engine.
- **Backstory:** The Concord's siege-battleship — a floating citadel built to anchor a bombardment line. Ironclads tank what would kill any other hull and keep firing; they're the wall the fleet hides behind.
- **Signature tactic:** Anchor-citadel — slowest, tankiest battleship, all-turret coverage, advances only under bombardment. The battleship that cannot be dislodged; you go around it or you don't go.
- **Faction:** SCN Concord.

### B18-e. Thunderchild
- **Class/role:** Authority battleship (T4-5), the heroic/martyr. New family `martyr`.
- **Visual:** A scarred battle-worn battleship — clearly a veteran, hull-plating replaced with mismatched patches, kill-markings painted on the flank, a figurehead or emblem on the bow. Reads as a heroic-flagship or a ship-with-history. `Material_Hull`: mismatched patched plates over original livery (any faction). `Material_Accent`: kill-markings and unit-crests. `Material_Emissive**: battle-damaged flickering lights; one steady beacon (the figurehead).
- **Stats sketch:** hull extreme / shield high / speed medium / cargo small (≈90). Weapons: 3×L front + 4×L broadside + 8×S turret. Utility: fleet-morale (buffs nearby allies). 1×L engine.
- **Backstory:** Not a class — a status. Thunderchild is the title given to a battleship that has held the line beyond all expectation; the name passes to whichever hull next earns it. The current Thunderchild held Reese's Reach alone for nine hours.
- **Signature tactic:** Morale-anchor — buffs all allied ships in radius; itself fights harder below 50% hull (last-stand bonus). The battleship that inspires the fleet; killing it breaks the formation's will more than its strength.
- **Faction:** Any lawful faction (the title is cross-faction).

## B19 — Authority STATION-KILLER (tier 4-5)

**Role-fit:** the lawful siege-specialist — a capital built to destroy stations and fixed defenses, peer to or above a battleship in siege-role. Each candidate a different siege-doctrine.

### B19-a. Holocaust
- **Class/role:** Authority station-killer (T5). SCN family `capital`.
- **Visual:** A vast bombardment-platform — a hull dominated by a single enormous spinal siege-cannon running the entire length, the rest of the ship secondary. Reads as a planet-cracker or a giant-gun-with-engines. `Material_Hull`: white-and-grey federal livery, scorched along the cannon. `Material_Accent`: blue cooling-rings on the cannon. `Material_Emissive**: a building white-gold glow along the cannon before firing; blue drive flares (six, aft).
- **Stats sketch:** hull extreme / shield high / speed very low / cargo small (≈80). Weapons: 1×XL spinal siege-cannon (a super-tier fixed weapon — charges, then one-shots a station) + 4×L turret + 8×S turret. 1×L engine.
- **Backstory:** The Concord's siege-ship — a strategic asset, deployed to end a fixed position that cannot be taken any other way. A Holocaust has fired in anger only seven times in Concord history; each firing is recorded.
- **Signature tactic:** Spinal-siege — one catastrophic spinal-shot per charge-cycle destroys a station (or cripples a capital). Telegraphed windup; the fight is whether you can kill it or flee before it fires.
- **Faction:** SCN Concord.

### B19-b. Gavel
- **Class/role:** Authority station-killer (T4-5). DMC family `capital`.
- **Visual:** A heavy bombardment-cruiser — broadside batteries of siege-lances, a judge's-bench of armored gun-towers, a formal symmetrical silhouette. Reads as a flying courthouse or a gun-judge. `Material_Hull`: dark-grey martial livery. `Material_Accent`: red command-stripe and gold tribunal-emblems. `Material_Emissive**: cold red siege-lance glows along both broadsides.
- **Stats sketch:** hull extreme / shield high / speed low / cargo small (≈100). Weapons: 6×L broadside (three each side, all siege-lances) + 2×L front + 8×S turret. 1×L engine.
- **Backstory:** DMC's station-killer — the ship that delivers DMC's "judgments" on stations that harbor enemies. Gavels orbit a station and reduce it with sustained broadside-lance fire; the process is deliberate and called a "hearing."
- **Signature tactic:** Orbital-bombardment — orbits the target at siege-lance range, both broadsides cycling, sustained reduction over minutes. The station-killer that takes its time; the counter is a sortie before it settles into orbit.
- **Faction:** DMC.

### B19-c. Maul
- **Class/role:** Authority station-killer (T4-5), the breaching-siege. MTS family `capital`.
- **Visual:** A massive breaching-hull — a colossal reinforced ram-prow shaped to punch into a station's hull, with breaching-charges studding the prow and assault-bays behind. Reads as a giant assault-ram or a siege-breach-ship. `Material_Hull`: yellow-and-black industrial livery, reinforced prow. `Material_Accent`: hazard-orange breach-charge rims. `Material_Emissive**: orange breach-charge blinkers; amber drive flares.
- **Stats sketch:** hull extreme / shield low / speed medium (high dash) / cargo medium (≈150, for marines/loot). Weapons: 2×L front + 4×L turret + breaching-ram. Utility: rams stations to breach, then boards. 1×L engine.
- **Backstory:** Meridian's station-taker — a hull built to ram a station, blow a hole, and flood it with marines for capture (not destruction). Mauls are how Meridian acquires stations intact; they are terrifying up close.
- **Signature tactic:** Breach-and-board — rams the station, breaches the hull, captures rather than destroys. The station-killer that takes the station; you must kill it before it closes or lose the station.
- **Faction:** MTS Meridian.

### B19-d. Anvil
- **Class/role:** Authority station-killer (T4-5), the bombardment-monitor. SCN family `capital`.
- **Visual:** A flat bombardment-platform — a wide low hull covered in vertical missile-silos and bomb-bays, designed to hover over a target and drop ordnance. Reads as a flying missile-submarine or a bomber-scaled-up. `Material_Hull`: white-and-grey federal livery. `Material_Accent`: blue silo-rims. `Material_Emissive**: green silo-ready lights going dark as it fires; blue drive.
- **Stats sketch:** hull extreme / shield high / speed very low / cargo high (ammo, ≈400). Weapons: 8×L (missile/torpedo cells — extreme alpha, finite ammo) + 4×S turret. 1×L engine.
- **Backstory:** The Concord's bombardment-monitor — a hull that hovers and rains torpedoes. Anvils carry enough ordnance to reduce a station and must withdraw to re-arm; they define siege-economics.
- **Signature tactic:** Bombardment-alpha — dumps its entire magazine in one overwhelming torpedo-barrage, then must withdraw (out of ammo). The station-killer with a clear "vulnerable and empty" phase after its strike.
- **Faction:** SCN Concord.

### B19-e. Sunder
- **Class/role:** Authority station-killer (T4-5), the superweapon. New family `superweapon`.
- **Visual:** An exotic experimental hull — a sleek unstable hull dominated by a glowing exotic-matter core visible through containment-windows, bristling with overheating capacitors. Reads as a prototype-weapon or a experimental-doomsday. `Material_Hull`: dark experimental composite (no faction livery — these are above faction). `Material_Accent`: bare copper containment-coils. `Material_Emissive**: the core blazes an unstable violet-white; the whole ship hums with contained energy.
- **Stats sketch:** hull high / shield high / speed low / cargo none. Weapons: 1×XL exotic-weapon (a reality-sundering area-effect shot) + 2×L turret. Utility: the exotic weapon damages everything in a wide cone but hurts the Sunder to fire. 1×L engine.
- **Backstory:** A black-project superweapon — jointly developed, owned by no single faction. Sunders fire a shot that tears space; each firing permanently damages the firing-ship. Only three exist; their deployment requires council authorization.
- **Signature tactic:** Exotic-area-sunder — one shot devastates a wide area (station + escorts) but damages itself; a trump-card used once per engagement. The superweapon that is its own countdown; you must kill it before it decides to fire.
- **Faction:** Joint (Concord-led black project).

## B20 — Authority FLAGSHIP-OF-THE-LINE (tier 5)

**Role-fit:** the lawful endgame hull, peer to the Leviathan — the fleet-admiral's throne. Each candidate a different faction's ultimate expression of naval power.

### B20-a. Ascendant
- **Class/role:** Authority flagship-of-the-line (T5). SCN family `capital`.
- **Visual:** The ultimate Concord flagship — a vast balanced dreadnought, the largest lawful hull, multiple tower-tiers, broadside batteries in quadruple turrets, a grand bridge-complex, Concord-banner the size of a building. Reads as the apex-federation-flagship. `Material_Hull`: pristine white-and-grey federal livery, ceremonial. `Material_Accent`: blue and gold (gold reserved for flagships). `Material_Emissive**: clean white-blue drive flares (eight); gold-lit bridge complex.
- **Stats sketch:** hull maximum / shield maximum / speed low / cargo high (≈350). Weapons: 3×L front + 6×L broadside (three each side) + 16×S turret. Utility: fleet-command (buffs entire fleet), 2× drone-bays. 1×L engine.
- **Backstory:** The Concord flagship-of-the-line — the throne of a sector-admiral. An Ascendant present means the Concord has decided the matter is settled; the Sallow Banks campaign ended when the *Ascendant Justice* entered the system.
- **Signature tactic:** Fleet-anchor — buffs the entire friendly fleet, fights as a peer battleship, launches strike-craft. The flagship that is a one-ship fleet; killing it is a strategic objective that decides systems.
- **Faction:** SCN Concord.

### B20-b. Pinnacle
- **Class/role:** Authority flagship-of-the-line (T5). MTS family `capital`.
- **Visual:** The Meridian flagship — an enormous industrial-capital, the ultimate self-repairing gun-and-factory, decked in hazard-livery and corporate-gold, with visible mega-fabricators and a drone-swarm bay the size of a station. Reads as a flying megafactory or a corporate-capital. `Material_Hull`: yellow-and-black industrial livery, with gold. `Material_Accent`: hazard-orange and gold corporate-crests. `Material_Emissive**: amber fabricator-glow and endless drone-ready lights; massive drive flares.
- **Stats sketch:** hull maximum / shield high / speed very low / cargo extreme (≈600). Weapons: 2×L front + 8×L broadside + 12×S turret. Utility: self-repair, 6× drone-bays, on-board factory. 1×L engine.
- **Backstory:** Meridian's flagship — a mobile corporate-headquarters and mega-factory. Pinnacles don't just lead fleets; they sustain them indefinitely. The *Pinnacle Acquisitive* has been on-station in the Meridian home-sector for forty years.
- **Signature tactic:** Logistics-flagship — extreme endurance, repairs allies, manufactures drones, never needs to withdraw. The flagship that wins by out-lasting the enemy fleet; you must kill it fast or not at all.
- **Faction:** MTS Meridian.

### B20-c. Apex
- **Class/role:** Authority flagship-of-the-line (T5). DMC family `capital`.
- **Visual:** The DMC flagship — a colossal aggressive warship, all forward-guns and armor, a predator among capitals, with a command-spire and the DMC martial-livery elevated to ceremonial. Reads as the apex-predator-battleship or a martial-throne. `Material_Hull`: dark-grey martial livery, ceremonial black. `Material_Accent`: red command-stripe and gold martial-honors. `Material_Emissive**: cold red everywhere; a single blinding forward-lance.
- **Stats sketch:** hull maximum / shield high / speed medium (for a flagship) / cargo medium (≈250). Weapons: 5×L front (overwhelming forward) + 4×L broadside + 8×S turret. Utility: fleet-command (offensive bias). 1×L engine.
- **Backstory:** DMC's flagship — the martial apex of the corporate fleets. Apexes exist to destroy the enemy flagship and break the line; their doctrine is decapitation. The DMC's *Apex Verdict* has dueled and killed three hostile capitals in single combat.
- **Signature tactic:** Decapitation-strike — fastest flagship, overwhelming forward firepower, designed to kill the enemy flagship in a duel. The flagship that wins by removing the other flagship; a knife-fight between two T5s.
- **Faction:** DMC.

### B20-d. Leviathan-Class Variant ("Bulwark")
- **Class/role:** Authority flagship-of-the-line (T5), the super-flagship/titan. SCN family `capital` (same hull-class as the existing player Leviathan, NPC variant).
- **Visual:** The largest hull ever built — an order of magnitude beyond a normal flagship, a true titan, dwarfing stations. Multiple city-sized tower-complexes, broadside batteries in quintuple turrets, a drive-array that outshines a star. Reads as a flying arcology or a death-star-done-lawful. `Material_Hull`: white-and-grey federal livery at vast scale. `Material_Accent`: blue and gold, banner-fields of Concord-insignia. `Material_Emissive**: a drive-glow bright as a small sun; city-light complexes across the hull.
- **Stats sketch:** hull beyond-maximum / shield beyond-maximum / speed very low / cargo extreme (≈800). Weapons: 4×L front + 8×L broadside (four each side) + 24×S turret. Utility: fleet-HQ (system-wide buffs), 4× drone-bays, on-board repair-yard. 1×L engine.
- **Backstory:** The Concord's titan — one per sector-fleet, the ship that defines a theater of war. The *Bulwark* has anchored the Concord core-fleet for a century; it has never been defeated, only declined to engage. Its movement is news.
- **Signature tactic:** Theater-anchor — a one-ship strategic asset; its presence in a system IS the battle outcome. Untankable; the only counter is to not be where it is. The flagship that exists to not need to fight.
- **Faction:** SCN Concord (the existing `ship_leviathan` re-skinned as the authority super-flagship — closes the loop with the player's T5).

### B20-e. Empyrean
- **Class/role:** Authority flagship-of-the-line (T5), the golden-age relic. New family `relic2`.
- **Visual:** A breathtaking relic-flagship — a hull from a previous era, refitted and re-commissioned, with art-deco lines, ceremonial gold-leaf plating, vast stained-glass-emitter windows, and a figurehead. Reads as a golden-age-cathedral-ship or a flying palace. `Material_Hull`: white-and-gold ceremonial livery (no faction — pre-dates the current factions). `Material_Accent`: gold-leaf scrollwork and stained-glass emitter-panels. `Material_Emissive**: warm gold light from every window-panel; a steady sanctuary-glow.
- **Stats sketch:** hull maximum / shield maximum / speed low / cargo high (≈400). Weapons: 3×L front + 6×L broadside + 12×S turret. Utility: fleet-morale (major buffs), on-board sanctuary (heals allies). 1×L engine.
- **Backstory:** A flagship from the founding era — the ship that signed the Concord charter, refitted across centuries. The *Empyrean* is the soul of the federation; its loss would be a civilizational wound. It fights only when the federation itself is threatened.
- **Signature tactic:** Inspiration-flagship — the ultimate morale-anchor; massive fleet-buffs, heals allies, itself fights with relic-tier power. The flagship whose presence turns the fleet legendary; the moral center of the lawful endgame.
- **Faction:** Concord (founding-era relic, cross-faction symbol).

---
---

# Appendix — Slot-group summary (one line per group)

- **B1–B5 (Alien/bio, Vael & Choir):** 25 concepts across scout/fighter/cruiser/freighter/capital — organic silhouettes (spore, glider, moth, dart, buoy / striker, tentacle, gastric, carapace, eel / spiral, radial, fungal, serpent, reef / brood, comb, cyst, chelonian, root / bloom, leviathan, cathedral, gyre, relic), all chitin-biolume materials, Vael aggressive + Choir ancient split.
- **B6–B10 (Drone/AI, Concordance/Helix):** 25 concepts across swarm-fighter/interceptor/gunship/tender/dreadnought-core — geometric silhouettes (polyhedron, tetrahedron, rhombus, prism, sphere / needle, crescent, blade, helix, razor / hexagon, cube, polyhedron2, slab, lattice / cradle, hivedrone, projector, foundry, arsenal / pyramid, nucleus, convergence, obelisk, crown), uniform cerametal materials, horror-of-uniformity doctrine.
- **B11–B15 (Pirate/scav, Reach sub-factions):** 25 concepts across raider/boarding-tender/scrap-hauler/gun-brig/flagship — five distinct sub-faction chassis (the Maw, Rust-Lords, Splinters, Drift-Kings, Black Tot), each with its own materials + silhouette-logic + doctrine, no shared hulls, raucous personal naming.
- **B16–B20 (Authority/capital, SCN/MTS/DMC):** 25 concepts across patrol-cruiser/carrier/battleship/station-killer/flagship-of-the-line — clean naval architecture, faction-material conventions (Concord white-blue, Meridian yellow-orange, DMC grey-red), formal naming, "big gun" tier culminating in the Leviathan-class super-flagship that closes the loop with the player's T5.
