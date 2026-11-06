<!-- LIFETIME: ACTIVE_PROGRAM -->
# BESTIARY — every enemy, creature and boss

Commandment 6: **every enemy has one power you fear and one weakness you can see.** This file defines
both for every hostile, plus how it looks, moves and sounds. It supersedes nothing in code: entries
tagged **[EXISTS — reconcile]** have authored behaviour already (`src/data/enemies.js`,
`src/data/swarmMode.js`, `src/data/swarmBrood.js`, `swarmBroodLate.js`,
`src/data/encounters/capital-boss/*`) — **read the code first, keep what fits, and deepen it to this
entry.** Where the code and this file disagree on a fact, the code wins; where they disagree on
intent, this file wins.

**Colour language (fixed):** player = cyan + gold only. Hostile ships = warm hues (each archetype
its own: amber, red, crimson, orange, magenta, rust, white-hot). Brood = toxic hues (acid green,
violet, hot pink, white-gold, electric orange, sickly teal). Danger telegraphs = pure red lines and
rings, drawn above all VFX. Police = blue-white strobes (they're hostile only at heat).

**Tell rule:** every dangerous ability telegraphs ≥ 0.6 s in the world (a line, a ring, a glow, a
sound) before it lands, and is dodgeable.

**Done for an entry:** the lineup shot identifies it with the HUD hidden; a 5–10 s capture shows
tell → ability → counter; R6 ≥ 4.

---

## Part 1 — Ships (Swarm roster and Adventure hostiles)

Sizes are draw radius in world units (≈); speeds ≈ in WU/s. Swarm feel profile overrides apply in
Swarm (SWARM S1/S7).

| # | Archetype (debut wave) | Look | Size / speed / mass | The power you fear | Tell | The weakness you can see | Counter | Sound | Death |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **Wasp Swarmer** (1) [EXISTS] | small amber dart, twin flicker engines | r12 / 120 / 16 | packs of 5 strafing passes | none (fodder) | paper-thin; light enough to throw | mow it; throw it into its friends | high whine, pack buzz | instant amber pop |
| 2 | **Reaver Pirate** (2) [EXISTS] | red wedge with a skull-stripe, scrap plates | r18 / 112 / 60 | pack leader: calls 2 Wasps, presses hard | red flare + horn blast when calling | kill it and its Wasps panic-scatter for 3 s | focus it first | growling engine, radio taunts | burst + 1 tumbling chunk |
| 3 | **Choir Zealot** (4) [EXISTS] | tall narrow magenta spire, a halo ring | r12 / 125 / 17 | links a shield beam to a packmate | the beam itself (magenta line) | the beam breaks if you shove the zealot off-line | shove it, or kill the shielded one through the gap | choral hum | shatters into glass bits |
| 4 | **Detonator Dart** (5) [EXISTS] | tiny white-hot spike, fuse light | r8 / 170 / 20 | rams and explodes, hurting everything nearby | fuse brightens + rising beep for 1 s | it explodes on death too — it's your bomb | Line it and throw it into the pack | beep → bang | big blast ring |
| 5 | **Mine-Layer Jackal** (6) [EXISTS] | squat orange hull with a mine rack | r18 / 105 / 58 | drops mines in its wake | each mine blinks; the rack glows before a drop | mines hurt anyone — enemies too | lead enemies through its mine trail | clunk-clunk of drops | rack cooks off in a chain |
| 6 | **Lancer Sniper** (8) [EXISTS] | long rust needle | r14 / 126 / 24 | charged rail shot from far away | red line to you for 1 s, rising whine | slow to turn; can't fire without line of sight | break line of sight with a rock; throw a rock at it | whine → crack | splits lengthwise |
| 7 | **Warden Escort** (9) [EXISTS] | wide crimson shield-bearer | r20 / 100 / 70 | projects a bubble on a packmate | the bubble (crimson dome) | kill the warden and the bubble pops | flank it; Line it away from its charge | bubble thrum | dome bursts outward (shove) |
| 8 | **Corsair Raider** (10) [EXISTS] | sleek crimson blade, wing pairs | r16 / 140 / 40 | wing dash attack | a red charge line on the ground for 0.8 s | committed: can't turn mid-dash | sidestep — it hits whatever's behind you | afterburner roar | spins out burning |
| 9 | **Quiet Ghost** (12) [EXISTS] | shimmer outline; dark hull | r14 / 130 / 30 | cloaks and decloaks to strike from behind | a heat-shimmer ripple + a soft chime | fields reveal it (Pull drags it visible) | Pull the area; shoot the shimmer | chime → hiss | flickers out of existence |
| 10 | **Customs Cutter** (13) [EXISTS] | boxy amber-white with a dish | r18 / 110 / 55 | EMP pulse: your powers go dark for 2 s | an expanding ring for 1 s | it's slow and boxy — easy to ram | leave the ring; ram it | rising static | dish sparks, drifts dead |
| 11 | **Point-Defense Screen** (14) [EXISTS] | turret pod on a small hull | r16 / 90 / 50 | shoots down your bombs and thrown bodies | tracer stream toward your projectiles | can't cover two directions | kill it before you bomb; throw from two sides | rapid ticking | turret blows off (debris) |
| 12 | **Patrol Lawman** (15) [EXISTS] | plated blue-white duelist (red in Swarm) | r20 / 115 / 90 | presses relentlessly; too plated to throw | — | plates fall off under fire, then it's throwable | wear it down, then throw it | siren chirp | plates scatter |
| 13 | **Tether-Control Raider** (16) [EXISTS] | hook ship with a reel | r18 / 120 / 60 | **physics weapon:** tows you toward hazards | a rope-shot telegraph line | its rope can be cut | boost to snap it; tow it into its own hazard | reel whine | reel snaps |
| 14 | **Bruiser Brawler** (18) [EXISTS] | big dark-red brick | r34 / 75 / 160 | a moving wall that rams | a red charge line for 1 s | too heavy to throw, but things thrown *into* it hurt it badly | bait it into crushers; throw rocks into it | heavy diesel thrum | breaks into 3 throwable chunks |
| 15 | **Anchor Controller** (22) [EXISTS] | ring-shaped ship | r24 / 95 / 80 | **physics weapon:** drops an enemy gravity anchor that pulls you | a dark ring forms for 1 s | its anchor pulls enemies too | use its anchor against the pack | sub-bass hum | ring collapses inward |

**Adventure-only hostiles** [EXTEND]: pirates use roles 1–8 with faction liveries (Crimson Reach =
red/black, Pitborn = rust/scrap); police use 10, 12, Hornet-interceptors and Warden gunships in
blue-white with strobes; bounty hunters (Part 3) use any hull with a bespoke kit.

## Part 2 — The Brood (the horde)

The Brood are the screen-filling swarm: hundreds of small bodies on flat arrays, one draw call
[EXISTS]. Today they're too small and dark to read (SWARM baseline). Each family below needs: a
saturated toxic colour, a silhouette stretch, a motion signature, a sound, a tell for its attack, and
a death that matters. Families marked *late* come from `swarmBroodLate.js`.

| Family | Colour | Motion | Attack / role | Tell | Weakness | Remains on death |
|---|---|---|---|---|---|---|
| **Mite** [EXISTS] | acid green | flocking swarm, darts in | fodder; chews on contact | — | dies to anything; dies on rocks | husk shards |
| **Spitter** [EXISTS] | sickly teal | hangs back | lobs an acid arc; leaves an acid pool | a ground target ring for the whole wind-up | move off the ring; pools hurt Brood too | acid sac (throwable, splashes) |
| **Spore Drift** [EXISTS] | pale violet | drifts with currents | releases spores that slow you | a puffing pulse | drifts into hazards on its own | — |
| **Charger** [EXISTS] | electric orange | stalks, then dashes | charges in a straight line | a line drawn for the wind-up | sidestep and it hits a rock and dies | horn plate (throwable, heavy) |
| **Lantern Cyst** [EXISTS] | white-gold glow | floats, lights the swarm | lights up nearby Brood (they get faster/tougher) | the light radius | pop it and the swarm dims | — |
| **Leecher** [EXISTS] | hot pink | latches onto hulls | brakes you while latched | a lunge with a squeal | scrape it off on a wall or rock | still leech (glue) |
| **Glassback** [EXISTS] | crystalline blue-white | slow, armoured | shell blocks shots from the front | — | shatters into shards that hurt neighbours | glass shards (splash) |
| **Wake Eel** [EXISTS] | dark teal with a light stripe | sinuous, follows your wake | whips across your path | a ripple along its body | grab it with the Line — its body is a whip (×1.9) | eel body (whip weapon) |
| **Bellows** [EXISTS] | swollen orange | inflates and deflates | blasts a gust that shoves you | it swells for 1 s | pop it while swollen and it shoves the Brood instead | — |
| **Burrower** *late* | rust | hides in rock surfaces | erupts from rocks | the rock trembles | stay off the rock; shove rocks onto it | — |
| **Splitter** *late* | violet | normal | splits in two on death | — | splash damage kills both halves | two smaller bodies |
| **Remora** *late* | grey-green | rides on other enemies | detaches to swarm you | a cluster on a host | kill the host and they scatter | — |
| **Keelback** *late* | dark green, ridged | heavy, low | rams | a short line | too heavy to stop, easy to dodge | keel plate (throwable) |
| **Gloomcap** *late* | deep purple | slow | darkens an area | a spreading shadow | its own Brood can't see in it either | — |
| **Mirebulb** *late* | swamp green | stationary | sticky field that slows | visible goo ring | pull enemies into its goo | — |
| **Clutchstone** *late* | stone grey | rolls | a living rock — throwable when stunned | — | stun it, then it's ammunition | clutchstone (throwable) |
| **Undertow** *late* | deep blue | circles | pulls you toward the swarm | a whirlpool ring | it pulls Brood too — pile them | — |
| **Ash Wisp** *late* | ember red | flickers fast | burns on contact | a spark trail | dies to any splash | ash |
| **Volatile Brood** *late* | bright yellow-orange | normal | explodes on death | a pulsing glow | kill it near its friends | blast |
| **Plated Brood** *late* | grey with orange seams | normal | tanky | — | plates shatter under a shove | plates (throwable) |
| **Pox Sac** *late* | bruised purple | stationary | bursts into Mites | pulsing | burst it early (fewer Mites) | Mites |
| **Commander Brood** *late* | white-gold crown | stays back | buffs and directs the swarm | a crown glow | kill it and the swarm loses formation | — |
| **Brood Mother** *late* | hot pink, huge | slow | births Mites continuously | birthing pulses | it's a heavy: throw rocks into it | big carcass (terrain) |

**Brood done checklist:** every family has its colour, silhouette stretch, motion, sound, tell and
death; a lineup of all families on dark space is identifiable; the Brood is visible at the Swarm
camera as a horde (SWARM S6); population curve per SWARM S6 (gated on the laptop A/B).

## Part 3 — Bounty hunters (Adventure, heat 4–5 and contracts)

Named, recurring, adaptive (Nemesis learner [EXISTS]). Each has a gimmick that uses the physics.

| Hunter | Ship | Gimmick | How they adapt |
|---|---|---|---|
| **Vane "Hook" Marrow** | Hawser tug, harpoon kit | tows you into rocks and stations | after you cut his line twice, he uses two lines |
| **Sister Glass** | Choir Zealot variant, Quiet Choir livery | shields allies, then cracks your shield with resonance | learns your favourite power and jams it (EMP) |
| **The Accountant** | Warden gunship, clean MTS livery | brings a fine — offers to settle before shooting | if you run, he blocks gates next time |
| **Ruck** | Ironback barge, scrap plates | rams; plows through cover | if you dodge-into-hazard him, he stops chasing into hazards |
| **Two-Flags** | twin Hornets, Crimson Reach | a pincer from two sides | swaps roles if you focus one |

## Part 4 — Bosses (Swarm boss waves and Adventure set pieces)

Rule: **a boss is a physics puzzle, not an HP bar.** Each has a lesson (what physics it teaches), a
weak point you reach with a verb, and a death that becomes terrain or ammunition. Boss rotation names
come from `src/data/swarmMode.js` [EXISTS — reconcile with authored scores in
`src/data/encounters/capital-boss/`].

| Boss | Fantasy | Lesson | Weak point and how | Death |
|---|---|---|---|---|
| **Iron Maw** (Dreadnought) [EXISTS] | a capital that commits to a bearing and fires broadsides | cross its bow, break its rudder, use its coast | rip the rudder plate with the Line; throw ballast into the stern | breaks into 4–6 throwable chunks (SWARM S14) |
| **Mirrorjaw Foreman** [EXISTS] | an industrial foreman with reflective shields | reflections: your shots come back | shields only face forward — Line-swing behind it; throw rocks (rocks don't reflect) | shield panels fall as mirrors you can throw |
| **Forge Regent** [EXISTS] | a foundry crown ship pouring molten slag | heat lanes | lure it over its own slag; the crown cracks when it overheats | slag pools become hazards for the rest of the run |
| **Corsair Wing** [EXISTS] | an ace squadron of five | focus and separation | Line one away from the wing; the others lose formation | each ace drops a named trophy part |
| **The Anvil** [EXISTS] | a massive hammer that slams down | timing | dodge the slam; its arm is pinned for 2 s — Pin it longer, then hit the joint | the hammerhead stays as a heavy anchor |
| **The Quiet Choir** [EXISTS] | a cluster of zealots singing one shield | links | break the links one by one (shove members apart) | the choir scatters into fleeing Zealots |
| **Brood Queen** [EXISTS] | the Brood's mother-ship | the horde | burst her birth sacs (each spawns Mites when ripe — pop early); she's a heavy: throw things | her carcass becomes terrain; Brood panic |
| **The Tendril** [EXISTS] | a centipede of linked segments | segment chains | cut the chain (each segment's follower leads a free body) — then kill the head | segments scatter as small throwables |
| **Nest Carrier** [EXISTS] | a carrier launching drone waves | tempo | its launch bays open for 2 s — throw something in | hangar explodes, carrier drifts as terrain |
| **Casket Worm** [EXISTS] | a worm that hides in debris | patience | Pull the debris away to expose it | its shell becomes a hollow you can hide in |
| **Furnace Maw** [EXISTS] | a mouth that inhales everything | the inhale | feed it a volatile pod during the inhale | it chokes and erupts |
| **The Yardmaster** [EXISTS] | a crane boss in a shipyard | the arena is the boss | cut its cables; drop its own cargo on it | the crane collapses across the arena (new terrain) |

**Boss done checklist:** entrance card (≤ 2 s) + camera punch; 2–3 acts each with a 3-word callout;
the weak point is visible and reached with a verb; time-to-beat for a competent player 60–120 s; death
leaves terrain or ammunition; R6 and R11 ≥ 4.
