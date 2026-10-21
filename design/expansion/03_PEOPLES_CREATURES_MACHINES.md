<!-- LIFETIME: STABLE -->
# 03 — Peoples, creatures and machines

This file covers four groups: the **Bloom** (the swarm the game is built around), the human
**peoples**, the **Verge-Layer** machines, and the **cast**, both human and machine. The fungus
biology is canon in `design/alien-ecology-program/00_CANON_SYNTHESIS.md`, and the 15 creature seeds
come from `02_FAUNA_AND_HOST_TAXONOMY.md`. This file arranges them for play, and adds new families
only where the Katamari ladder has a hole.

**Vethari stay off-frame.** That is law, not preference. You may show Vethari hulls, bone,
architecture and echoes, but never a living Vethari body.

---

## 1. The Bloom — the swarm

### 1.1 What the player must understand in one fight

The Bloom is a fungus that **couples nervous systems**. Its swarms share senses and urges, so they
coordinate like one animal and *break like one animal*. The canon calls this "synchronization
pathologies", and they are the player's openings. **The coupling is drawn on screen**: faint green
filaments join linked members. When a node dies, the filaments flare and snap, and the whole pack
flinches. A stranger reads the swarm's weakness from the picture alone.

### 1.2 The pathologies, as play

| Pathology (canon) | Trigger in play | What the swarm does | What the player gets |
|---|---|---|---|
| **Panic cascade** | a mass kill above a set energy inside a linked pack | the pack scatters for 1.5–2.5 s, then **re-forms in a tight knot** | the re-form knot is the best throw of the fight |
| **Aggression cascade** | a relay (Blind Shepherd) or the Queen is hit | every linked member turns on the player at once, filaments flushing red | a telegraphed rush you can meet with a rock wall or a Well |
| **Grief loop** | a Spindle Mother or Hive node dies | linked members cluster around the body for several seconds | a stationary crowd: the Katamari jackpot |
| **Pain loop** | a long body (Casket Worm, Wake Eel) is cut | the stump thrashes in a fixed arc | a hazard you can aim other enemies into |
| **Route-memory** | the player kills a tide in one place | the next tide in that sector routes around it, or comes back denser, decided per sector | the world remembers (law 6); the chart shows the new tide line |
| **Host-shadow** | a colonised human hull | flies its dead crew's old patterns: Reach passes, Concord lines | you recognise the old faction in the new monster |

These belong in the swarm AI (`build_map.md` §34 rows 503–504). They replace the existing reflex
jitter with *legible group behaviour*, which is the §33 row 491 problem solved for the swarm.

### 1.3 The Bloom ladder — every tier of the Katamari curve

The ladder is sized for the Line Class curve (08 §2): the player should always see swarm members
they can *just barely* move. "Existing" means the family is live in `src/data/swarmBrood.js` or the
model census today. The mass figures are design targets in tonnes and set the Katamari ordering.
Hull and speed stay with the balance owner.

| Tier | Mass band | Family | Source | Role in a fight | Telegraph → counter | On death it leaves |
|---|---|---|---|---|---|---|
| **T0** | dust | **Spore drift** | NEW P1 (VFX hazard) | sticky clouds that slow hulls | green haze; burn it with heat or blow it with a Repulsor | nothing; clears |
| **T0** | dust | **Lostcalls** (seed 4.13 "Choirless", renamed so it never collides with the Ascendant Choir) | NEW P2 | harmless; their calls mark a *dead pocket* where the field cannot reach | a lonely chirping light → follow it | a clue |
| **T1** | 5–15 t | **Needle mite** (live data id `mite`; seed 4.4) | existing | the ammunition: flocks that dive | flock-shimmer → sweep them with anything | husk shards (throwable) |
| **T1** | 10–15 t | **Hull leech** (`leecher`; seed 4.3) | existing | latches and adds mass, slowing you | the hull flashes green → scrape a wall or spin hard | the leech, still sticky (glue ammunition) |
| **T1** | 10–20 t | **Spitter** (`spitter`) | existing | lobs acid from range | marker on the floor → dodge, then throw | acid sac (a thrown sac splashes) |
| **T1** | 15–30 t | **Lantern cyst** (seed 4.2) | NEW P0 | drifts toward heat, then bursts in a spore shove | its glow brightens → grab and *throw it as a bomb* | spore burst (shoves everything) |
| **T2** | 25–60 t | **Charger** (`charger`; a juvenile Bristle Ram, seed 4.12) | existing | lines a dash | dash line → sidestep and feed it a rock | horn plate (heavy throwable) |
| **T2** | 40–120 t | **Glassback** (seed 4.9) | NEW P0 | silicate-armoured grazers **that reflect gunfire**, so only mass kills them | glints → guns ping off; smash them | glass shards (they shatter on impact, splash damage) |
| **T2** | 60–200 t | **Wake eel** (seed 4.10) | NEW P1 | trails your wake, then wraps small ships | a ribbon in your trail → turn hard and grab its tail | the eel body, which is a **whip** while held |
| **T2** | 80–250 t | **Bellows** (NEW; fills the T2 bomb slot) | NEW P1 | swells and bursts when struck hard | it inflates on a hit → grab it before it bursts and fling it into a pack | a shockwave that shoves the pack |
| **T3** | 300–900 t | **Bristle ram** (adult; seed 4.12) | NEW P1 | territorial rammer, no ranged attack | it lowers its horn cage → bait it into a rock or another ram | the horn cage (a ram you can throw) |
| **T3** | 400–1,500 t | **Casket worm** (live `brood_tendril`; seed 4.5) | existing | emerges from wreck breaches in a segmented chain | the wreck rattles → cut a middle segment (pain loop) | segments (each throwable) |
| **T3** | 600–2,000 t | **Furnace maw** (seed 4.8) | NEW P1 | a heavy predator drawn to reactor output | its plates glow → feed it hot slag or a reactor core to stun it | radiator plates (hot; they ignite spore drift) |
| **T3** | 800–2,500 t | **Spindle mother** (live `brood_queen`; seed 4.11) | existing | a slow carrier wreathed in juveniles | the sacs pulse → break the sacs, then the grief loop gathers the flock | the carcass (the biggest T3 throwable) |
| **T3** | 1,000–3,000 t | **Husk** (a colonised human hull; Class D technical host) | NEW P1 (Overgrowth-kit variant on existing hulls) | flies its dead crew's patterns (host-shadow) | old faction lights flicker green → treat it like the old faction | the hull, which spills mites |
| **T4** | 3k–10k t | **Veil ray** (seed 4.1) | NEW P2 | a membrane surfer; infected rays tow swarms | the membrane ripples → tear the edge (centre hits are absorbed) | membrane sheets that catch and hold thrown bodies |
| **T4** | 5k–20k t | **Blind shepherd** (seed 4.15) | NEW P1 | a **relay**: packs within its pulse fly coherent | visible pulse rings → kill or drive it off, and every linked pack panics | the pulse organ; carrying it *calls* swarms to where you drop it |
| **T4** | 5k–30k t | **Anchor beast** (seed 4.6) | NEW P2 | sessile, grown around an asteroid; a territory anchor and relay | the rock is wrapped in growth → move the whole rock with the beast still on it | a living rock |
| **T5** | 30k–150k t | **Hive-hulk** (a colonised capital ship) | NEW P1 (reuse `dreadnought_boss` or Leviathan with the Overgrowth kit) | a nest you dismantle piece by piece | glowing nodes → break nodes, rip plates, empty the bays | its plates, bays and nodes; the endgame ammo pile |
| **T5** | colossal | **The Bolus** (a colonised Vethari carrier) | existing sector | an interior: one volume, one fungus, one Line | — | (`design/alien-ecology-program/16_THE_BOLUS.md`) |
| **T6** | sector-scale | **The Long Field** (Ashfall's coupling field) | NEW P2 (environment) | the field itself, drawn as filaments across the whole sky | sky-filaments → break the shepherds that anchor it | the field thins and the tide line falls back |

**Non-hostile ecology is mandatory** (seed doc §5): the **Mourning kite** (seed 4.7, which follows a
grief route around old wrecks) and the **Archive crab** (seed 4.14, which piles fragments into
geometric heaps that hold salvage) are wonder and texture. They are not targets. A player who
throws a rock at a Mourning kite gets nothing but a kite that changes route forever.

### 1.4 Where the Bloom lives (the tide map)

The First Tide (Year 11) came through Ashfall. Tides follow lanes where wrecks rot unclaimed, so
the tide map is a function of player and Understory behaviour (01 §2):

- **Endemic:** Ashfall Reach, The Bolus.
- **Tidal:** Charon Expanse and Eunomia Gulf, where the Understory gardens hold the line. Also Rhea
  Cinder and Haumea Rift.
- **Incursion:** Pallas Drift's reef, Sker Haven's gate camps (the Pitborn Cull farms them), Vesta's
  slag field (Furnace maws).
- **Clean:** the Core and the Veil (Vael instruments suppress the field, and Lostcalls are common
  there).

### 1.5 How the Bloom looks

Bioluminescent green veins on host tissue, and **coupling filaments** drawn between linked members.
Spore drift is a soft green haze that keeps its silhouette (never a camera-facing soft square;
`AGENTS.md` §6 VFX law). Husks keep their old faction paint under the growth, because host-shadow
must be readable.

---

## 2. Peoples of the Reach

Every human culture has a look (for portraits and crowds), a way of speaking, and a job on screen
(`npcJobs` traffic). Portrait sets are rows in 05 §7.

| People | Who they are | Look | Speech | On screen |
|---|---|---|---|---|
| **Core-born** | Helios and Dione citizens: clerks, inspectors, the licensed | pressed uniforms, ID lanyards, good teeth, tired eyes | correct, procedural | patrols, customs, tourists, liners |
| **Beltborn** | Drift miners and their families | hi-vis, burn scars, missing fingers, tool belts | short, wry, numbers | tugs, barges, claim crews |
| **The Released** | first-generation Pit survivors (Wren's generation) | chalk-pale, flinch at bright rooms, prison tattoos as intake numbers | the canon register: flat inventory | couriers, weighers, welders, sweepers |
| **Pitborn** | the second generation | rust and gold, string lights, layered junk-jewellery, loud | fast slang, chant, insult as affection | yards, Cull crews, junk ships |
| **Vael contract-folk** | the Veil's people | nacre fabrics, gloves always on, script-etched cuffs | conditional clauses ("provided that…") | research couriers, hazard crews |
| **Homesteaders** | Free Frontier families | patched work clothes, children aboard, homemade insignia | hopeful, practical, owing | runners, homestead guards |
| **Choir faithful** | relic pilgrims and zealots | bronze ornaments, bell charms, shaved temples | hymn fragments, certainty | pilgrims, zealot packs |
| **Understory** | the gardeners | moss-dyed wraps, breathing masks grown not made, spores in the hair | slow, plural, decomposition metaphors | gardeners, spore-tenders |
| **The shop floor** | weighers, welders, scale-hands, sweepers, tug crews, dock clerks of every faction | uniforms of their station, worn to the thread | the comedy law's "dry wit, fast and confessional" | everywhere work happens |

---

## 3. The Verge-Layer machines

All 14 kinds and 17 site types already exist in `src/data/precursorMachines.js`. What they need is
**bodies** (05 §4) and **one physical puzzle per site type**. Every site is a "law you can fly":
its directive is shown as one capitalised word on the glass, and obeying or breaking it is a
physical act.

| Site | Directive | The physical puzzle |
|---|---|---|
| Quarantine Pylon Field | ISOLATE | pylons project a boundary; carry an infected body out without touching a beam |
| Survey Monolith | PRESENT | park a body of the right mass on the plinth to open the reading |
| Null Corridor | HOLD | engines are nulled inside, so cross on momentum and the Line alone |
| Gate Underlayer | OPEN / CLOSE | restore a gate's mass-balance by moving counterweights |
| Machine Ossuary | WITNESS | dead machines; bring their parts to the Witness to hear their history |
| Black Vault | (none) | sealed; opened only by the Measure Engine fragment set |
| Active Maintenance | RETURN | Masons rebuild a structure; hand them parts and they build faster |
| Revoked Transit | VACATE | a dead gate; whatever is inside is ejected at speed, so ride the ejection |
| Containment Ring | ISOLATE | a ring holding something in; don't break it, or do |
| Star Marker / Listening Field | WITNESS | align reflectors with thrown bodies to point a beam (works with Solstice) |
| Empty Foundry | RETURN | a Mason foundry; feed it ore and it prints precursor plate |
| **The Line** (site) | PRESENT | the origin of the Line technology; Measure Engines weigh *you*. Line Class trial (08 §2) |
| Broken Shepherd | HOLD | a Shepherd Engine herding debris; help it re-form the flock |
| Exception Chamber | APPEAL | the Appeals Clerk hears evidence; the weighed object decides it |

---

## 4. The cast

### 4.1 The canon human cast, given a physical hook

The canon cast lives in `docs/worldbuilding/story/NPCs-CANONICAL.md` and THE-STORYLINE. Every one of
them should give the player *something to do with their hands*, or they stay a text box.

| Character | Where | Physical hook |
|---|---|---|
| **Kessler**, Scale 4 (nineteen years) | Tethys / Tycho | **the Scale**: put cargo on his deck, compare his reading with your Line's strain gauge. The discrepancy is the clue (06 B1) |
| **Slate**, the welder | Vesta Forge | hull rebuilds; his "column" predicts where your hull fails. The fourth pressure spike is a real stress value on the Variance Adjustment (06 B3) |
| **Drift**, the moisture-loss weigher | Ceres / Meridian | moisture loss as a physical mechanic: ice cargo loses mass in sunlight, so race it |
| **Rook**, the bounty booth | Charon | bounties he double-bills; physical bounty delivery (tow the wreck to his booth) |
| **Hale**, Gate 3 customs | Dione Lane | runs The Weighing (02 §1) |
| **Inspector Sula Dree** | Gate 3 | the waived fine (B6); she can wave you through a weir once |
| **Callum Oakes** | Meridian Exchange | the ticker; a Spine Break where his cargo is at stake (B5) |
| **Wex**, Helios Bay 7 | Helios | the empty rack; the smell ticket as a findable object |
| **Sump**, the sweeper | the Pit | background in every Book; Order #0000001 gives him a broom |
| **Voss**, claim recorder | Ceres / Shaft 7 | his map of sealed shafts as a salvage route (B6) |
| **The Witness** | Ashfall | the ledger room: airless, no physics toys, the terminal register |

### 4.2 New faces for factions that have none (PROPOSED CANON)

| Name | Faction | Role | First line |
|---|---|---|---|
| **Ma Sprocket** | Pitborn | Cull announcer and yard boss; names ballast balls after good pilots | "Heavy's honest, babies! COUNT 'EM!" |
| **Clatter** | Pitborn | your Cull rival ace; plays Ballast, magnet-head junk ball | "That rock had my name on it. It has your hull on it now." |
| **Moss-Keeps-Moss** | Understory | garden elder; pays by the tonne | "Bring us what died. We will make it something." |
| **Brother Index** | Archive | Reading-room keeper; trades a secret for a secret | "That entry is sealed. Unseal one of yours." |
| **Addendum Seroy** | Vael | contract officer; the voice of page 9 | "Provided that you read it, the terms are fair." |
| **Cantor Lise** | Choir | shrine keeper of the Fourth Toll | "The relic was never inert. Only waiting." |
| **Adjudicator Mael Ost** | Helix | the false-flag commander; Gate Audit officer | "Lawful interdiction. Read the invoice." |
| **Commander Petra Lusk** | Concord | a straight officer who believes the file; the Iron Maw's last relief captain | "Hold for weight. I will not ask twice." |
| **Nine-Finger Abe** | Drift | claim boss; runs the Claim Jump | "The rock took one. It won't take another." |
| **Tamsin** | Free Frontier | homestead pilot; crew candidate (row 446) | "Still temporary. Tell me where to put the wall." |
| **Clerk 0003** | Fulfillment | the routing capital's voice | "Your order has always been important to us." |

### 4.3 The Orphaned Shift — machine-people

**Unifying idea (PROPOSED CANON).** The Reach is full of human-built machines whose crews never came
back, and they kept working. They are the warmth of the game, and the canon's honest narrators
alongside the graffiti. "The machines kept the count better than we did." Each one is a single,
physical, optional relationship built on the real verbs.

**Existing (implemented; read each file before touching):** Morrow R-07 (rescue,
`design/characters/MORROW.md`), Vesper SV-3 (the kinetic choir), Bracket BX-9 (the goalkeeper),
Ruckus RU-7 (open work order, Ceres), Rubric HM-11 (the hull marker, Tethys), Solstice SL-9 (the star
lantern, Ceres), and **Ravel** (a precursor gravity loom, Pallas). The set pieces include the Blind
Welder, the Eighth Bell, the Runaway Kiln (Vesta), Pallet Jack (Vesta), Kilnback, Mothlight,
Scissorwake, Last Argument, Latch Nine, Tally Three, Red Kite, Last Shift, the Ilex Ark, Sable Venn,
Hook-Left (Ruud), Hasp's Second Rinse (Helios–Ceres chord), the Memorial Thief (Helios), Two Ships
One Mistake, the Drift Auction (Pallas), Wake Handoff, Wreck Court, Borrowed Sun and Voice, and
Stormshift (Anvil). Row 505 maps every one of them to a sector, a Book and a chart entry.

**New machine-people, one for each sector that has no resident** (each is a §34 row 506 slice or a
one-encounter build):

| Name | Sector | What it is | The physical play | Payoff line |
|---|---|---|---|---|
| **TARE / WG-2** | Dione Lane | a weighing robot left on a decommissioned scale deck | bring it objects of an exact mass; it teaches the Line's honesty and pays in Measure fragments | "Tare set. Bring me something true." |
| **DOCKET / PX-14** | Io Reach | a Fulfillment parcel drone that lost its fleet and wants to be delivered | throw it, accurately, at its own address across a contested sector | "Delivered. Thank you. I have never been delivered." |
| **LAMPLIGHTER / LL-6** | Sedna Dark | relights dead lane buoys on the dark rim | tow dead buoys into its arms; it builds a lit path, and the rim *stays* lit | "One more light. The dark is smaller." |
| **SHEPHERD-12** | Orcus Shadow | a broken Verge Shepherd Engine herding debris flocks | help it herd: push strays back into the flock, Katamari as husbandry | "FLOCK: PRESENT." |
| **QUILL / AR-3** | Triton Wake | an Archive page-drone that deserted | bring it logs (scanned wrecks); it reveals one sealed secret per log | "I copied it. Now it exists twice. That is how you keep a thing." |
| **HOLDFAST / AN-1** | Haumea Rift | an ice-anchor robot holding a cracking rift together | re-anchor the rift by towing ice spires into its clamps before the crack runs | "Holding. Holding. Holding." |
| **BOUNCER / DR-0** | Sker Haven | the bazaar's door robot | it throws rowdy ships out of the no-weapons ring; you can be its backup, or its problem | "No guns in the ring. Rocks are fine." |
| **RECEIPT / PR-8** | Kepler Scar | a receipt printer that prints a receipt for everything that happens in the bazaar | it follows you and prints your kills as receipts, a walking kill feed; the comic relief | "Receipt 4,412: one corsair, returned to sender." |
| **MOP / CL-5** | Nyx March | a Quiet clean-up drone that erases evidence | enlist it to clear wrecks, or race it to the evidence first | "Tidy. Nothing happened here." |
| **BELLHOP / CB-9** | Phoebe Echo | a Choir bell-tuning drone | strike crystals in order with thrown rocks to play the broken song | "Again. Lower. There." |
| **GRAVEDIGGER / UG-4** | Eunomia Gulf | an Understory machine that buries wrecks into gardens | it races you for wrecks, then teaches you composting | "Everything goes in the ground. Even the ground." |
| **TALLYHO / CN-2** | Rhea Cinder | a Cull scoreboard robot that came loose and wants a crowd | it rates your swarm kills aloud and attracts Pitborn spectators | "THAT ONE COUNTS DOUBLE!" |
