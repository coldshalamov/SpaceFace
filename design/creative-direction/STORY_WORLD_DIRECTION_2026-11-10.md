# SpaceFace: the people at the other end of the Line

**Creative-director research and proposed story development, 10 November 2026.**

This is a connected treatment of the world, its people and the player's expanding experience. It is not a new campaign, a completion ledger, or permission to implement every suggestion. It develops the existing *THE WEIGHT* and *THE OPEN REACH* direction using the actual current checkout. All newly proposed scenes and relationships below remain proposals. No source, canon file, existing plan or asset was changed for this report.

**Reading order:** the direction and campaign in §§1–4; characters and places in §§5–7; twelve scene treatments in §8; lore depth and production choices in §§9–11. The evidence and continuity notes are at the end so they do not stand in for the creative work.

**Inspection boundary:** primary checkout `/workspace/shared/SpaceFace`, HEAD `7dc248acec45`, with substantial concurrent local changes. The inspected working tree, not HEAD alone, is the source baseline. NOW was read; the liveness checker reported no active mutation rows, although the file also contains informal and historical claims. The only write for this task is this file. Source/data inspections and the original concept image support the analysis; there was no new rendered playthrough. Existing reports' focused tests are attributed to those reports, not represented as checks performed here.

**Publication boundary:** This report is published with the companion Swarm proposal and asset toolbox as one research bundle. References explicitly marked **local snapshot** were inspected in the shared working tree but are not included in this PR; they are kept as paths rather than broken remote links. Other relative source links navigate this branch and may differ from the inspected working tree. Publication of research does not publish those candidate implementations or establish their acceptance.

## 1. The direction

SpaceFace should let the player become powerful enough to change a place, then make that place specific enough that changing it matters.

At the beginning, a worker trusts you with a lamp. Later, a convoy trusts you with its route. By the end, an inhabited wreck trusts you with the load holding its passage open. The same Line goes through all three situations. What grows is the mass, the complexity of the physical problem, and the number of people living with the result.

The story already has an unusually strong central object: a recycler grid that weighs 12.4 tonnes. It has an unusually strong private counterweight: a fragment that weighs 3.1 kilograms. One is entangled in a human crime against a community. The other matters to Wren because of a sister whose fate remains unknown. They belong in the same hold without becoming the same mystery.

The large creative opportunity is the life between those weights. The person waiting for a shift meal. The weigher who knows exactly how inaccurate his scale is. The shipwright who can save a hull and knows how to make one fail. The collector who discovers that a debtor is currently bracing the only usable freight lane. The garden that can consume a wreck before the family finishes identifying it.

These people should not assemble to explain the plot. Their needs should make the player use the ship differently.

### The governing emotional progression

1. **Permission:** this world is solid, busy and unusually permissive. Try something.
2. **Belonging:** a few people recognize the way you work. There is somewhere worth returning to.
3. **Suspicion:** the cargo, the register and what you saw disagree.
4. **Responsibility:** your power can preserve one thing while endangering another.
5. **Recognition:** the distant system is built from the same work and evasions as home.
6. **Authorship:** the ending names a role you have already begun performing, in a world carrying your changes.

The grimness must earn its place inside the pleasure of flying, improvising and becoming formidable. A dramatic operation can be funny because a collector gets dragged backward by the collateral he came to seize. It can then become quiet when the player sees the civilian plate beneath that collateral. Neither moment needs to apologize for the other.

### This develops an existing correction

The October 27 [OPEN REACH story brief](../program/living-world/02-WORLD-AND-STORY.md), especially §§1, 5, 6 and 11, already rejects mandatory futility. It permits real local improvements, truthful survival branches and materially different aftermath. [Build map §35](../../build_map.md) explicitly carries that amendment. This report does not claim to invent that correction.

Use the earlier [creative bible](../../docs/worldbuilding/CREATIVE-DIRECTION.md) for exact quantities, voice, character history, off-frame Vale and Vethari, and the two personal objects. Do not let its older insistence that every beat prove institutional defeat erase a rescue or repair the player actually performed. The owner's [VISION](../VISION.md) remains the product authority: ordinary life, bright physical spectacle, honest consequences, and surprising combinations.

**Working thesis:** the official record may refuse to recognize the good you did. The game itself must recognize it.

## 2. The connected story already inside the repository

### Three strands, with different jobs

**The public crime:** the Pit's recycler catalyst grid was legally transferred out fourteen years before the campaign, shelved at Helios Bay 7 after an abandoned installation, and later issued home under a misleading cargo category. Contract 47-A intersects that return. The unknown vessel takes exactly the relevant mass. Elroy's maintenance report threatens the official account of the missing grid. Kessler, Rook, Slate, Drift, Mira, Quinn, Hale and Voss encounter pieces of the system through their ordinary jobs. Vale authorizes and legitimizes; Vale need not secretly micromanage every worker.

**The private search:** Wren's second fragment has been in the hold for six months. Callum's earlier sale, Marsh's channel, Brandt's channel and Special Custody make an investigation through evidence custody rather than an alien-invasion main quest. REF 44-C connects the apparatus processing both matters. The human atmospheric crime must remain comprehensible without resolving the Vethari. Lida stays unanswered. The 0.01-tonne navigational file is a possible lead, not a finale destination.

**The player's local history:** the working people, repaired sites, wrecks, stolen tools, routes and households affected by play. This strand is already the emphasis of OPEN REACH and the freshest Helios work. It should supply the emotional proof that the first two strands currently risk leaving to prose.

The third strand is the bridge. The player first learns that a heater changes a crew's day. Later, the player learns that a missing grid changed a district's decades. That is scale without requiring a speech about scale.

### The object trail that should carry the public story

Follow the grid's physical absence through the world:

1. **A competent small service:** a lamp or heater really works after it is returned or installed.
2. **A mass under contract:** the 47-A cargo has a declared weight, a source, a destination and a receipt.
3. **A measurable discrepancy:** Scale 4 provides an experience of matter disagreeing with paperwork.
4. **An interrupted service:** Elroy's cargo has a human receiver, regardless of his survival outcome.
5. **An empty rack:** Bay 7 shows where the same grid waited while another community needed it.
6. **A living beneficiary:** cleaner services and orderly traffic at the receiving end make the old transfer intelligible without making every beneficiary personally malicious.
7. **A present decision:** at Ashfall, the player can move cargo, evidence and people through an actual constrained route. Knowledge changes the operation.
8. **A return:** a previously visited place demonstrates what arrived, what did not, and who remembers.

Do not make every loose object an original piece of the grid. Its exact identity is powerful because it is rare. Most freight should be ordinary freight. A legitimate delivery is essential contrast for a misdeclared one.

### How much is presently embodied

The working tree contains much more than a text-only story. The [campaign data](../../src/story/campaign47a/campaignData.js) and [embodied missions](../../src/story/campaign47a/embodiedMissions.js) define B1's alloy run, Scale 4 and infested-hauler disposal; B2's cinder marks, player-fed garden growth, Nest and Elroy writ; B3's slag tow, Furnace maw and Foreman; and B4's distinct faction operation. Mission and encounter owners consume this machinery.

The late books are less fully expressed in the core progression table: B5 is a branch-chain completion, B6 is asset deployment, and B7 has no ordered steps there. Separate finale, encounters and world owners exist, so this is **not** proof that all late content is absent. It is a warning against presenting the ambitious [campaign script](../expansion/06_CAMPAIGN_SCRIPT.md) as the player's currently guaranteed journey.

The newest Helios material is particularly useful: a cutter yielding the current rock face to the player's real mining; a borrowed worklight and empty cage; a heater with an actual receiver; Lio's service route; repair holds; worker handovers; Wex's quiet break; and Neri at Scale 4. These are local candidates in a dirty checkout, with scoped evidence rather than a newly verified continuous playthrough. They give this treatment a stronger starting point than inventing another cast of strangers.

## 3. What to recover from the original concept map

The [original concept image](../../assets/concept/map/concept_universe_map.jpg) was viewed directly. It is a parchment-like imperial chart with an illuminated core, connective lanes, materially different outer territories, large landmark silhouettes, marginal annotations and dangerous-colored boundary regions. Its most valuable promise is that travelling outward changes the kind of authority and uncertainty surrounding the player.

It is not a reliable current gazetteer. Names such as Aurora Citadel, Voidforge Nexus and the duplicated Sable Tradewinds label do not establish new live sector identities. Do not rename the existing map after them or pretend those places are implemented.

Recover five things from it:

- **Routes as political space.** The legal route, the practical route and the route the locals actually use can differ. Give those differences physical gates, traffic and consequences.
- **Recognizable destinations before arrival.** A gate ring, ore mountain, reef of hulls or capital-sized surface should establish an expectation from far away. Arrival then answers what the landmark does.
- **A credible core/rim gradient.** Core confidence is maintained infrastructure, standard signs and frequent service craft. Rim uncertainty is a missing service, local navigation practice or improvised repair, not just darker color.
- **Marks left by travellers.** A chart should eventually distinguish a route the player reopened, a bypass someone taught them, and a landmark they have actually reached. Existing chart/receipt owners should carry this, not a second map history.
- **The sense of a larger unfinished world.** A far machine can be visible long before the player can move its evidence or survive its route. Curiosity is more valuable than a list of locked icons.

The current source defines **25 sectors**, verified by importing `SECTORS` from [sectors.js](../../src/data/sectors.js). Earlier inventories describing ten core plus eleven frontier regions are dated snapshots. Twenty-five definitions do not mean twenty-five equally inhabited districts. The eight OPEN REACH flagships are still the sensible depth-first composition.

## 4. A campaign the player could remember

These are proposed experience chapters over existing B0–B7 identities. They do not add B8 or require a second quest system. Duration should come from ordinary play, not an asserted novel-length estimate.

### Movement I: Before the shift ends

The first experience is a harbor carrying on without the player. A miner is cutting a face. A runner is trying to feed a watch. A worklight is in the wrong place. A repair crew wants the feed isolated. The player is allowed to be useful, greedy, reckless or uninterested.

The signature early success should involve the ship, not a menu: matching speed with a working hull, releasing an empty cage so it coasts neatly into storage, catching a moving load, or making a clean cut while someone gives them room. The small applause is that work resumes. This establishes that residents can cooperate intelligently with the player.

Three starter fantasies can see different sides of the same day. Hitch learns whose ore they cut. Pelican learns where a recovered object belongs. Wasp learns that a writ, a threat and a salvage claim are different things. They should later recognize the same station and the same workers rather than enter three unrelated tutorials.

47-A interrupts this earned normality. Resolve the opening's actual geographic contradiction before authoring an impressive intersector prologue; §12 lists it. In the near-term arrangement, preserve the working Helios opening and make its current recovery job intelligible. A future canon-aligned Helios-to-Pit freight operation needs an admitted destination and route, not the word “Pit” pasted onto Helios.

**What the player carries forward:** familiarity with a place, one successful physical improvisation, one person who remembers, and a contract whose missing load is more interesting because normal loads have been truthful.

### Movement II: The weight that does not match

B1 should feel like becoming a competent worker who can now notice a lie. The alloy run teaches the route. Scale 4 teaches measurement. Infested-hauler work introduces the possibility that salvaging matter changes another living process.

Keep Kessler's dishonesty personal and bounded. He is not the voice of all corruption. He wants a future for his daughter and has made a routine out of an act he cannot excuse honestly. Let Neri be competent enough to disagree with a reading while still needing to work tomorrow. Their relationship is more interesting if they can finish a dangerous loading operation together while disputing its account.

At the furnace, the pleasure of feeding heavy bodies to machinery can be large and spectacular. Afterward there should be a named receiver and an ordinary next shift. Otherwise the story is merely a sequence of physics demonstrations.

**New understanding:** the manifest is an assertion; mass is something you can test. A worker can be helpful and complicit in the same afternoon.

### Movement III: A name inside the target

B2's cinder marks teach bounty practice before the Elroy writ tests it. The Compost Run and Nest should establish that “organic” is not a moral category: a cultivated garden can protect a route; a hostile colony can occupy it; neither fact says the gardener is secretly a villain.

The Elroy scene should preserve the player's ability to stop. The local scanner contact already lets him identify himself and tell the player that this is not a fight he requested. A physically intact custody outcome exists in mission definitions. Killing, custody, departure and unresolved outcome must retain different factual meanings.

The more important new dramatic work is afterward. Who receives his medicine? Who expects his maintenance knowledge? If he survives, what is the difference between being alive, being free and being believed? If he dies, who has a practical job they can no longer finish? Do not substitute a guilt bark for the absence of that person.

**New understanding:** a good maneuver can serve a bad order. A refused order can still leave a problem the player chooses to solve.

### Movement IV: Bigger tools, more obligations

B3's tow, maw and yard feud are an excellent physical escalation. The player's new power should arrive with dimensions: the heavy object blocks a lane, a turning radius matters, a tow partner must keep clear, or the old shortcut no longer fits.

Slate's expertise should be something the player needs before his double seams become a threat. Build one shared operation in which his prediction saves time or a ship. Then let the player see the same predictive competence used to price another person's failure. A cartoon mechanic who only sabotages customers wastes this character.

The first Gate Audit should change a route the player has already used. A closure in an unexplored sector is a notification; a familiar service hull taking a longer path is a change in the world. Give a readable alternative, a finite local effort to preserve access, and a visible beneficiary of the altered freight flow.

**New understanding:** having more force does not abolish a difficult decision. It increases the number of difficult things the player can attempt.

### Movement V: A side is a set of obligations

B4 must let each institution solve a real problem.

- Traders can recouple and carry large volumes reliably. Their exclusion is who cannot afford carriage.
- Patrol can keep a public corridor safe. Its danger is authenticated wrongdoing and whom it is ordered to stop.
- Free captains can build and supply a settlement beyond the approved route. Their weakness is how fragile a supposedly independent network becomes when one contributor leaves.

Do not make the choice a personality quiz. The player should choose who gets an intact object, who vouches for a route, whose equipment they may borrow, and which obligation becomes theirs. The same scarce replacement part can make the differences tangible without turning every branch into the same mission in different paint.

Allow cross-faction friendships. A Patrol-aligned player may still owe a Quiet runner. A Free captain can respect an honest inspector. Broad faction standing should not flatten every resident into a team shirt.

### Movement VI: The person who sold the fragment

Callum belongs in a working market, as OPEN REACH already proposes. The reunion should be socially awkward and logistically dangerous, not a villain confrontation. He wants Wren's question to become a transaction because that is how he knows to end a difficult conversation.

The market's large moving load provides a second clock. Cade's arrival provides a third party with a different problem. Those clocks can converge without a fixed cutscene battle. The player might buy time by helping a freight operation, expose an inflated claim, carry the data out while someone else argues, or turn the market into a disaster.

Preserve the original emotional fact: Callum does not understand the full value of what he sold. Do not promote him into the mastermind. Use the canonical nine-year interval, not the older seven-year line in STORY-STRUCTURE.

The Archive then makes knowledge cost a specific existing truth. If the player never found that truth, the Archive cannot demand it. The clue must survive plausible mishaps through supported custody and copies, rather than through an indestructible floating quest token.

**New understanding:** personal betrayal is small enough to fit in a booth. The system that made it profitable is much larger.

### Movement VII: A place that needs you without orbiting you

B6 should make the player's home a place in the same network as the starting galley. Dock, power, shelter, feed and traffic are more meaningful than an income number. Preserve the current drone progression as a supported entry point, but do not call it the whole promised inhabited Empire Seed.

The first shortage should follow a known dependency. If the player prepared correctly, the place should cope better. If they never supplied a service, its failure must not masquerade as an arbitrary raid punishment for building. Friends can bring their actual craft, parts or local knowledge; no invisible friendship multiplier is needed.

Voss's Shaft 7 ambition gives this movement its dangerous outward pull. He sees a sealed claim as an opportunity. The player may see evidence, a biological hazard, recoverable machinery or an interior route. A rescue performed in time must count. If Voss died in this save, the map can pass through an estate, crew or wreck without resurrecting him.

**New understanding:** owning infrastructure means becoming someone else's unreliable institution unless you keep it working.

### An optional through-line: a light of your own

Morrowlight and RATCHET provide an unusually strong bridge from the first borrowed worklight to the inhabited Empire Seed. These are existing feature families, not names invented for this treatment.

The [Morrowlight runtime](../../src/features/salvageTender/runtime.js) discovers one persistent salvage tender in ordinary Adventure at Helios or Ceres, with a nearby-station fallback and a clear recovery corridor. The player moves the original hull into a safe berth before claiming it. Three finite supply pods support restoration. A repaired lamp, pump, working bench and later rack make the place useful in stages. Its memory records actual departure and return. The newer [pod-restock work](../program/finish/evidence/MORROWLIGHT_POD_RESTOCK_2026-11-09.md) lets the player pack their own unsealed supplies back into an original pod. Empty means empty until somebody puts something there.

The [RATCHET runtime](../../src/features/rigWorkshop/runtime.js) admits an ordinary Adventure workshop, defers its introduction during guided onboarding, and yields the foreground to a current timed encounter. Its two named machines are **Tin Hand** and **Yard Mule**. The [workshop design and source contract](../../src/features/rigWorkshop/README.md) offers six physical part families and two original-load jobs: The Needle Orchard and A Very Bad Centre of Gravity. Assembly changes collision, clearance, mass and turning. Broken originals can be recovered; changing a name is not a free replacement body.

**Proposed connective experience:** the player first restores Morrowlight enough to make one departure possible. An optional RATCHET invitation becomes relevant because an awkward original load resists the player's current technique. The player modifies a rig, completes or partially completes the delivery, then comes home with legitimately acquired unsealed supplies. They choose how much to spend on the next expedition and how much to leave at the tender. On a later return, the lamp, an unfinished repair and the retained original pod are familiar. The player's growing competence has acquired a place to live.

This should be a relationship between activities, not a new compulsory chain. Neither feature currently requires the other. Their shared integration factory is consumed by both browser and Node registries, and the authoritative manifest names their update/mode scope; source inspection confirms an ordinary admission path, not a fresh rendered playthrough. Do not assume a RATCHET holder accepts a Morrowlight pod, or that a RATCHET delivery payment grants tender stock. Route supplies through the real cargo owners unless a separate interoperability task proves original-body compatibility. Morrowlight relocation is within its sector, not a cross-sector mobile base.

The thematic connection is **care creates capability**. It complements the main campaign's ownership and custody story without turning home into another accusation. The small home can remain valuable even if the player never builds the larger settlement. Preserve identity distinctions: Morrowlight is not the existing rescue machine MORROW, and RATCHET's workshop identity is not proof that the named ace Ratchet Lu operates it.

### Movement VIII: Last Relief

The finale should gather the game's established relations around one operation in Ashfall. OPEN REACH's inhabited Iron Maw treatment is the right destination for the ambition: a huge structure with a human keel, growth, old records and people still using it. This is proposed composition, not a claim that all its districts are already playable.

The player needs to open and hold a route, choose the sequence of loads, preserve or abandon evidence, and decide what can be dismantled without destroying the service they came to restore. The Long Field and its shepherds complicate the same operation. They should not become an unrelated final combat room separating the story from the ship.

Recognition should arrive physically: familiar fittings used differently; the same type of heater; a scale whose honest reading no longer carries authority; a voice using a handover phrase heard in Helios. The distant place is not simply home with gray lighting. It is home after routes failed and people improvised for years.

Then the Witness's room earns its quiet. Let the player inspect what they physically preserved and distinguish their history from the official one. The fragment and coordinates remain Wren's separate, unresolved matter. The local crime is not explained away by aliens.

**The ending:** the player takes a role through a final act, then flies a route where earlier people and places give that role substance.

## 5. Characters with lives before and after their quest

The central cast does not need ten times as many biographies. It needs more occasions on which existing motives conflict with current work.

| Person | Preserve | Develop through play | Return that would matter |
|---|---|---|---|
| **Wren** | Private search, working competence, humor without constant banter; Lida unresolved | Express attention through the routes and objects the player chooses. No automatic psychological punishment for refusing the intended moral | The hold contains the same personal effects alongside the consequences of a changed working life |
| **Kessler** | Nineteen years, the daughter's berth arithmetic, bounded dishonest scale | Let him need a correct physical result during a dangerous operation even while he wants the account closed his way | He remembers whether the player compared, disputed, protected or simply accepted the reading; his daughter is not a collectible rescue reward |
| **Neri** | The actual current Scale 4 tally-shift resident | A colleague with a practical standard: no claim about a load before it is stable and readable. Avoid making her an exposition assistant | She works around a damaged pad, trusts a repaired one, or insists on a second witness after a real dispute |
| **Slate** | Knowledge of seams, patient inventory of failure points, Shaft 7 connection | One job showing the indispensable competence beneath the exploitation; one bargain where the player can choose a safer repair or accept risk knowingly | The surviving hull carries a recognizable patch and a relationship, not just a durability bonus |
| **Mira, the broker** | Bought but unclaimed escape ticket; route-code work; fear of being noticed | A moment when someone else can cover the route she cannot leave. She must choose whether to use that real opening | An empty booth or a returned courier can be more powerful than another promise to leave |
| **Rook** | Double-billing, the referee fantasy, installments of confession | Give two claimants different valid interests in one physical wreck. He can be forced to distinguish possession from title | One claimant is still waiting; one ledger has the player's explicit decision; Rook's usefulness survives exposure |
| **Drift** | Moisture-loss rationalization and the exchange's missing pension | Contrast genuinely sublimating freight with a stable load charged for loss. Make the player learn the material before judging the account | He changes a practice only if something about the operation actually changed, not after a moral speech |
| **Quinn and Spence** | The second ledger; a friendship built on not saying; Quinn's unreal exit arithmetic | A practical interruption exposes the compartment's existence without requiring theft. Spence protects a person, not the integrity of the scam | A seat, a rejected transaction, or a concealed ledger changes because of what the player did |
| **Hale** | Procedural integrity, no conversion scene | Let him prevent a pirate seizure and enforce a harmful valid rule within the same route. His consistency should be legible | He applies the recorded exception accurately without becoming the protagonist's ally in every matter |
| **Dree** | Decency inside the apparatus; real history with Wren | Distinguish her discretion from Hale's discipline. A waiver keeps a specific ferry moving while another formal objection survives | A later inspector reads the waiver, or a changed supervisor refuses it. The original human act remains true |
| **Wex** | Bay 7, an ordinary manager rather than an architect of mass harm | Build on his current bar break: establish the person and tea before the empty rack re-means his routine | He helps solve today's mechanical problem while still being unable or unwilling to account for an old issue |
| **Lio** | The actual Shift Stores runner with a service route | Let the player know the route, habits and inconveniences before a major interruption. Keep him a worker, not a perpetual hostage | He passes through a repaired crossing, waits at an obstructed one, or serves a changed receiver using the same hull |
| **The seam cutter** | Actual finite work, yielding to a successful shared cut, courtesy and handover | A colleague whose trust is earned through useful physical conduct. Keep the name optional until an authoritative identity is established | A repaired tool, returned light or clear cage gives the next watch a materially different start |
| **Elroy** | Maintenance knowledge, real medicine, wrongful writ | Survival must open a difficult life, not remove the character from the story. Death must remove a real capability | A living Elroy repairs something; an absent Elroy leaves another worker making do. Custody is not automatically freedom |
| **Callum and Cade** | Small-scale betrayal, a public booth, a collector with a task | Three concurrent wants: Wren's information, Callum's business, Cade's collection. Give each an exit other than a boss fight | The booth, debt and buyer trail remember distinct results |
| **Voss** | The private shaft map and mistaken confidence | Let his enthusiasm be infectious enough that the player might follow for profit, then discover the risk | A survivor remains ambitious; a death leaves a map with a cause and an inheritor |
| **Moss-Keeps-Moss** | Garden practice, matter reused, appetite without easy moral labeling | A respectful disagreement over whether to digest a wreck before its names are recovered | A nameplate can be preserved while the rest becomes a useful reef; the garden and family both remain |
| **The Witness** | The count, records, a possible future for the player | Give him the exact record the player brought rather than omniscient knowledge of everything. Let what is missing remain missing | The ledger can travel through the player's continued work without turning the pilot into a permanently seated spectator |

**Identity caution:** the local `8208-helios-relief-run` uses the name “Mira” for a first-watch relief worker and a persistent record `helios:relief-watch:mira:v1`. The canon Mira is the established broker. No inspected source proves these are the same person. Reconcile or rename through the owning character registry before connecting them. Do not silently turn one name collision into a character arc.

**Keep a modest circle at home.** Wex, Lio, the cutter and one regular receiving worker are sufficient to make Helios familiar. Adding eight new quest-givers would dilute the investment already present. OPEN REACH's proposed Nessa Venn can remain the electrician for Lantern Ward when that district is actually commissioned, rather than retroactively replacing a current worker.

## 6. Places that create different stories

The regional network should be understandable from use: Ceres extracts and salvages; Vesta makes machinery; Tethys sorts and claims it; Dione controls passage; Helios concentrates reliable services; Pallas carries things through unofficial gaps; Charon turns remains into a defense against the Bloom; Phoebe maintains a relief practice; Ashfall contains what the network failed to finish.

These are proposed experiential emphases grounded in [ways of life](../../src/data/sectorWayOfLife.js), [sector definitions](../../src/data/sectors.js), [world sites](../../src/data/worldSiteManifests.js) and OPEN REACH. They do not imply every proposed routine already runs.

### The inhabited spine

- **Helios / Lantern Ward:** the pleasure of a place becoming familiar. Objects are maintained; work lamps have owners; official architecture is clean because service crews reach it. The player learns to recognize a delayed meal run before any quest says something is wrong. Bay 7 sits within that working abundance, so the abandoned grid has an intelligible destination.
- **Tethys / Switchyard:** conflicting claims in a moving place. Traffic queues, couplers, load transfers and scales turn law into geometry. A seized pod obstructs an actual route. The player can solve a mechanical obstruction while leaving its ownership dispute open.
- **Ceres / Cathedral:** industry as a place people inhabit, not an asteroid field with a shop. Preserve the saved Wreck Cathedral separately from the adjoining Nine-Mouth ore structure proposed in OPEN REACH. One is evidence and accumulated loss; the other is active extraction. A passage between them makes the contrast playable.
- **Vesta / Furnace Crown:** transformations with visible costs. Something leaves as a replacement part, slag, heat or a worker's exhausted watch. Use heat and mass to distinguish the route, but allow calm intervals in which crews perform clever maintenance. The spectacular pour should serve somebody.
- **Pallas / Widow's Run:** people living inside the remains the player normally monetizes. A wreck can be salvage, a home, a memorial and cover at once. The local question is who may cut which part. A passage becomes easier because an inhabited hull moved, with residents actually relocated.
- **Charon / Memorial Gardens:** cultivated afterlife beside dangerous growth. Paint and transponder remnants under the garden reveal previous purposes without turning the Understory into the Bloom. The player can preserve a name, feed a reef and clear a lane in one consequential operation.
- **Dione / Niner Bastion:** a functional institution with an irresistible machine. Watch training, repair, provisioning and lawful passage before attempting theft. COUNTERSIGN remains the existing OPEN REACH proposal, not a current ready-to-steal hull claimed by this report. A military port needs public and restricted boundaries the player can understand.
- **Phoebe / Fourth Toll:** a harbor organized around listening and restraint. Use the bell, recovery routes and work pauses rather than another hostile checkpoint. Preserve the Shard Sphere as a different existing place. A quiet operation can be difficult because force must be placed carefully, not because it has fewer mechanics.
- **Ashfall / Iron Maw:** the enormous unfinished job that contains a community. Large surfaces, scars and service corridors should tell the player where people still live and what they need. A boss-sized body and a place worth saving can share geometry without sharing one health bar.

### Beyond the spine

The outer sectors need compact identities and useful connections, not seventeen disconnected campaigns.

| Sector | A memorable local question | Connection back into the inhabited world |
|---|---|---|
| **Io Reach** | Can the shared tank and mail route keep working under a changed flag? | A real household supply run and a durable route through disputed authority |
| **Sker Haven** | Can you recover your own trophy without breaking the yard's one enforceable rule? | Salvage provenance, Pitborn spectacle and a rival who can recognize a specific previous encounter |
| **Veil Nebula** | Can you move carefully enough to make an old machine accept what you carry? | Verge evidence, navigation and the limits of institutional notation; no living Vethari reveal |
| **Hyperion Cut** | Can a loaded convoy negotiate a ledge that your small ship crosses easily? | A replacement cutter or cleared work route changes a named producer's next load |
| **Rhea Cinder** | Who gets paid when an industrial accident becomes a show? | Cull culture and legitimate competitions can coexist with exploitation of old footage |
| **Nereid Shoal** | How much ice remains when the receiver weighs it? | Real sublimation provides a concrete contrast to Drift's invented moisture loss |
| **Kepler Scar** | Which side of a capsized station has become the front door? | A reopened berth supports stranded traders after a route change |
| **Orcus Shadow** | Which true page are you willing to circulate? | An alternate Archive recipient, never a universal lore vending machine |
| **Nyx March** | How do you deliver without revealing the route? | Quiet freight can help real districts while making secrecy a physical cost |
| **Eris Margin** | What do you leave accessible when an audit takes away the convenient entrance? | Gate policy affects known clients, not only map lines |
| **Eunomia Gulf** | Can a second garden take overflow without destroying evidence? | Charon's practice becomes a regional trade-off rather than a unique magic location |
| **Triton Wake** | Whose momentum can you borrow to make a difficult crossing? | Working vessels create travel opportunities that exist without a mission marker |
| **Proteus Well** | What can still be recovered when the valuable object is too heavy for your old technique? | Physical mastery returns value to a previously seen problem |
| **Sedna Dark** | How do people keep names when no institution collects them? | Senna and the Question can deepen the private search without solving it |
| **Haumea Rift** | What makes a local route reliable when a chart is insufficient? | Develop only after reading its detailed current owner; use as a navigation connection, not a new invented cosmology |
| **The Bolus** | What does this already-authored place contribute that the other strange regions cannot? | Preserve its current identity and investigate `bolusLore` before commissioning new lore; this report does not pretend that full specialist review occurred |

The last two deliberately stop short of fabricated specificity. Depth requires learning a place before filling its empty-looking margin.

## 7. Factions as different ways of moving the same world

The faction cast is already large enough. Develop their interactions through practice, not fourteen more introductions.

| Faction | What the player should see them doing | Their useful promise | The pressure they create |
|---|---|---|---|
| Concord | Holding lanes, inspecting freight, recovering a damaged patrol hull | Safety and procedures that can be invoked | A correct procedure can protect an abusive claim |
| Meridian | Recoupling cargo spines and making deliveries predictable | Scale and reliability | The profitable receiver wins when carriage is scarce |
| Drift | Keeping dangerous extraction workable and guarding claims | Shared skills and protection | A crew's solidarity can exclude a stranger or conceal a skim |
| Free Frontier | Raising and supplying homesteads | A route outside the dominant institutions | Independence costs maintenance, fuel and someone else's time |
| Crimson Reach | Hunting valuable traffic and displaying captured identity | Coercive protection and access to outlaw markets | Their market is fed by the losses they help create |
| Quiet | Physical handoffs, decoys and route knowledge | Goods reach people the official route excludes | A useful route can be sold to someone else |
| Choir | Carrying and sounding meaningful objects; relief and ritual | Shared practice that keeps people organized | Reverence can obstruct a necessary change to the object |
| Helix | Measuring, auditing, closing and rerouting | A real account of risk and infrastructure | Consolidation exports the cost to another district |
| Vael Remnant | Hazardous work and contract-bound machinery | Skilled help when others refuse | Addenda turn a service into a claim on the client |
| Understory | Feeding, tending and reusing dead mass | Gardens restrain dangerous growth and make remains useful | Evidence and names can disappear into a useful garden |
| Fulfillment | Completing old orders along fixed routes | Relentless carriage that can sometimes be exploited | The destination can be correct while the recipient is gone |
| Archive | Exchanging and preserving records | A fact survives an official denial | Preservation and distribution have different beneficiaries |
| Pitborn | Wreck work, competitions, crowds and broadcasts | Skills, identity and pleasure after the prison | A fair payment can conceal who owns the spectacle |
| Verge-Layers | Measuring, disabling and enforcing old gate directives | Matter is measured without human discretion | An exact rule may be indifferent to a compelling human reason |

This corrects a real creative hazard in the newer [WORLD summary](../program/finish/bible/WORLD.md): it calls Vael mysterious biological aliens, Understory covert smugglers, Verge practical frontier builders and Fulfillment a generic logistics megacorp. The [canonical factions](../../docs/worldbuilding/orgs/factions-CANONICAL.md) and current faction data give them more distinctive identities. Vael are human or human-descended. Understory are gardeners of wrecks. Verge are precursor gate-law machines. Fulfillment is the autonomous continuation of old orders. Keep the newer summary's emphasis on readable play, but do not commission scenes from those mistaken identities.

### Four cross-faction stories worth developing

**The garden's cargo:** Drift claims the hull, Archive wants the black box, a family wants the nameplate, Understory needs dead mass to hold the tide back. The player can separate some interests physically. They cannot satisfy everyone merely by clicking the morally correct line.

**The audited bypass:** Helix closes the convenient gate, Concord must protect the legal detour, Quiet sells an alternate route, and Free captains build a receiving berth. Each has a real function. The player can enable one combination, expose a profiteer, steal equipment or simply profit from freight.

**The overdue order:** Fulfillment arrives with a load for a retired address. Meridian can redirect it, Vael can modify the receiver at a contractual price, and residents can receive it through a practical workaround. The cargo is useful even before anyone agrees who owns it.

**The public throw:** Pitborn turns a spectacular player maneuver into a show. A Reach claimant says the thrown hull was theirs; the surviving crew wants its workboat back. The entertaining physics event becomes an ownership argument and a possible repair job. Let the spectacle stay pleasurable while the aftermath becomes specific.

## 8. Twelve concrete scene treatments

Each treatment separates the **verified substrate** from the **proposed scene**. These are development cards, not claims of implemented events. Where a card extends an OPEN REACH mission, use that existing mission identity rather than making a parallel quest.

### 1. The second cup

**Substrate:** Helios Shift Stores has authored repair, cut and transfer operations, an 18-mass heater, an optional six-mass pack and a receiver. Lio's actual route is connected through `traffic.js`. The relay-watch prose already puts the kettle back when service is restored. See Shift Stores (local snapshot: `src/data/heliosShiftStores.js`), Lio (local snapshot: `src/systems/heliosGalleyRun.js`) and relay watch (local snapshot: `src/data/heliosRelayShift.js`).

**Scene:** once the player has seen the normal meal run, the next watch has a practical crossing problem. A finite working load occupies the lane Lio uses. The player can move the obstruction, help its owner finish the transfer, or lead Lio through a slower clear approach. The crew are not starving on a surprise timer. They are waiting for the end of a long shift.

**Complication:** the tempting shortcut passes a cutter's active face. Respecting the cutter's actual pause and current work makes the crossing possible. Ramming through may get the food there sooner while damaging somebody's tool.

**Return:** the same route and people show the result. A repaired crossing supports later service; a damaged cutter remains a repair need. No friendship point substitutes for the movement of the food. This is the first small expression of the final relief operation.

### 2. Bay 7: issued, not installed

**Substrate:** `poi_helios_bay7` exists at `(1410, -310)` with the `place_cold_locker` body and discovery text. It is not a verified movable 12.4-tonne grid. Wex already has a quiet bar-break conversation. See [sectors](../../src/data/sectors.js) and Wex's current scene (local snapshot: `src/ui/station/wexBreakConversation.js`).

**Scene:** Wex needs access to a modern service piece obstructed by ordinary stored freight. Helping creates a legitimate reason to work beside the old rack. The player can inspect a retained tag or compare it with a contract already in their possession. The issue date, source and empty rack do the dramatic work.

**Complication:** clearing the rack would erase a useful physical arrangement but speed today's work. Photographing or copying evidence, if supported by the existing evidence owner, preserves information without making the absent grid reappear. Otherwise the inspectable tag stays the small first implementation.

**Return:** a functional present-day service and an unresolved historical absence coexist. Wex is grateful for a real job and uncomfortable about a different one. Avoid a confession monologue and avoid declaring the grid recovered from an empty locker.

### 3. The load between two readings

**Substrate:** Scale 4, Kessler's comparison/dispute contacts, freight recovery/witness helpers and Neri's actual tally-shift resident exist in the local tree. Kessler comparison (local snapshot: `src/systems/kesslerComparisonContact.js`), resident (local snapshot: `src/systems/kesslerYardResident.js`), [book contracts](../../src/story/campaign47a/embodiedMissions.js).

**Scene:** a named receiving crew needs a load unloaded before its service window ends. The loaded object has a stable physical reading, a posted commercial reading and an owner who cannot remain indefinitely. The player can compare, move it to the available second measure, take the posted settlement, or preserve it for a dispute.

**Complication:** the second measurement is physically awkward, not a mandatory extra menu. Bracing the pod, making room for another hull, or protecting it while it settles makes the player's competence relevant. Do not corrupt the physics to manufacture an inaccurate reading.

**Return:** custody and the dispute may end differently. The cargo can arrive while the underpayment remains contested. Neri remembers what she actually saw. The player has learned an evidence practice later useful at the Archive or Verge court.

### 4. Elroy's next shift

**Substrate:** the registry writ offers `terminal_register_kill` and `custody_reel`; the scanner contact lets Elroy identify himself. See Elroy contact (local snapshot: `src/systems/elroyRegistryContact.js`) and the B2 definition in [embodied missions](../../src/story/campaign47a/embodiedMissions.js). This does not establish every post-custody life state.

**Scene:** a lower-deck receiving point is waiting for his maintenance cargo. After a confirmed survival outcome, the player can help secure legal or unofficial onward passage for him and the shipment. If the supported outcome is only custody, liberation is a separate job, not an assumption. If he died, another worker can receive surviving supplies and explain only the practical missing skill.

**Complication:** hull, person and medicine may have different locations. A route convenient for one may be wrong for another. Damaged cargo changes what can be repaired. Do not recreate destroyed medicine to guarantee a redemptive mission.

**Return:** an actual service works if enough correct material arrived. A living Elroy can become a technician with opinions rather than a gratitude dispenser. The dead route leaves an empty work position, not a false accusation that the player killed him in a save where they did not.

### 5. The Wrong Address, with two honest claimants

**Substrate:** OPEN REACH already names `lw_tethys_wrong_address`; the current world has Tethys freight, customs and physical heist facilities. Extend the [existing district treatment](../program/living-world/02-WORLD-AND-STORY.md), not a duplicate quest.

**Scene:** an automated load arrives for a retired address now occupied by homes. The original buyer's successor holds a valid order. The residents have a valid need and a history of receiving deliveries through this aperture. Both claims contain truth.

**Physical problem:** the freight spine will not fit the changed street. Recouple the load, temporarily move a terrace module, use the old receiving throat, or take the claimants to a different berth. A theft can resolve delivery while creating a legal claim.

**Return:** the street changes if the player moved it; an alternate route becomes familiar; the paying client may still be angry. No hidden reveal that one claimant was evil is needed to make the decision interesting.

### 6. Slate's honest weld

**Substrate:** B3 currently asks for a slag-core tow, a Furnace maw operation and the Foreman. Older comments and the campaign bible describe a Hawser called VARIANCE ADJUSTMENT with a fourth-spike seam. Those are not interchangeable. Preserve the actual current contract while deciding how the intended tug belongs. See [B3 data](../../src/story/campaign47a/campaignData.js) and [campaign script](../expansion/06_CAMPAIGN_SCRIPT.md).

**Scene:** a damaged working hull needs a brace held steady long enough for a repair crew to finish. Slate can tell the player exactly where the load will go if the brace moves. The player sees him be right. The same operation later exposes a second seam carrying his recognizable workmanship.

**Choices:** pay for a supported permanent repair, take a declared temporary tow limitation, borrow a brace, or seize a better component and accept its owner’s reaction. A spectacular emergency recovery is possible when the player exceeds a visible limit.

**Return:** preserve the repaired original hull and its patch. Do not make the player's current ship fail on an invisible narrative counter merely to demonstrate the thesis.

### 7. The Last Bus through Niner

**Substrate:** OPEN REACH already assigns Niner Bastion public traffic, finite defenders, Dree and a Last Bus opportunity. The supporting district is planned rather than certified current play. [District brief](../program/living-world/02-WORLD-AND-STORY.md).

**Scene:** a service ferry is cleared, but the equipment that makes its passage safe is scheduled for withdrawal. Dree can authorize a specific temporary exception. Lusk can keep one lane open without abolishing the audit. The player can brace the mechanism, escort a slower alternative, or borrow equipment from the restricted service berth.

**Complication:** borrowing becomes theft only through the actual custody rule, not because the story requires a chase. Taking COUNTERSIGN is an optional ambitious approach when that ship exists; it must never be the only correct solution.

**Return:** the ferry reaches a named receiver. A waiver, missing tool or damaged gate remains. Later visits show whether the corridor is operational, contested or replaced by a workable bypass. The player has changed a local operation without magically ending the Gate Audits.

### 8. Callum's booth stays open

**Substrate:** Callum is already a B5 contact; OPEN REACH proposes a living market reunion with Cade and a moving large load. The core B5 completion table remains generic. [Story structure](../../docs/worldbuilding/story/STORY-STRUCTURE.md), [OPEN REACH §5](../program/living-world/02-WORLD-AND-STORY.md), [embodied missions](../../src/story/campaign47a/embodiedMissions.js).

**Scene:** the dialogue begins while a market crew tries to pass a large coupled load. Callum wants privacy without leaving business. Cade wants collateral. The crew wants the passage clear. Wren wants the buyer trace. Any two of these can temporarily cooperate.

**Physical approaches:** finish the move to buy a quiet interval; intercept the collector outside the market; hide the relevant data carrier among legitimate freight; carry the whole booth's secured storage out if the supported custody rules permit that absurdity. Violence can spill into cover, loads and civilian escape routes.

**Return:** the market keeps its damage and debts. The information can be copied without duplicating money. Callum still has a business or a reason it is gone. His limited understanding of the fragment survives every branch.

### 9. One page from your hold

**Substrate:** the Archive's canonical trade is a true record for another true record. The Wreck Cathedral has actual forensic and archive-linked operations. The asset research found a specific `place_landmark_wreck_cathedral` binding, not merely a concept painting. [World sites](../../src/data/worldSiteManifests.js), [Archive canon](../../docs/worldbuilding/orgs/factions-CANONICAL.md).

**Scene:** the player's available evidence determines what the reading room can trade. A recovered black box, an observed discrepancy or a witnessed custody event can open different pages. The room should explain whose record will be disclosed before the player makes that exchange. The moral tension comes from the fact's consequence, not an interface trick.

**Complication:** an external claimant tries to recover the physical source before the trade. The player can preserve a copy, surrender the original, move the witness or abandon the exchange. A previously saved person can object to being made useful evidence.

**Return:** the disclosed truth reaches an identifiable second party. An unchanged “sealed” label may be institutional deception, but the game retains the actual copy history. The player learns that preserving truth and distributing it are different acts.

### 10. A name before the garden

**Substrate:** Understory has five defined growth stages, player-fed growth and a tide-reduction threshold; the B2 Compost step already asks for visible growth. A colonized DMC service barge also has a bound `place_conveyor_barge` work-site body with unseal/extract/sever choices. [Understory data](../../src/data/factions/understory.js), [world sites](../../src/data/worldSiteManifests.js).

**Scene:** a garden can consume a wreck needed to protect the nearby lane, but the original crew's identifying plate or black box remains inside. A family member asks for that small part; a receiving crew needs the mass now. The player can extract evidence first, feed a different suitable wreck, tow the original into safer position, or accept that delay leaves the service route exposed.

**Complication:** heavy overgrown material can move in ways that obscure the old hull without implying living Vethari. Host identity and present organism remain distinct. Firing indiscriminately can destroy both danger and evidence.

**Return:** the preserved plate and the grown reef can coexist. An omitted name stays omitted. Do not make the entire garden secretly hostile to punish trust in a nonhuman-looking ecology.

### 11. The weight of an appeal

**Substrate:** current Verge data defines an Appeal requiring a carried object around 40 mass with a tolerance, weighed testimony, directives and a Sleeping Jury. This report inspected the data contract, not a new rendered court playthrough. [Verge data](../../src/data/factions/vergelayers.js).

**Scene:** a human file and an actual object tell different stories at an old gate. The machine asks for a condition that must be understood physically. The player must bring the correct evidence with its provenance, rather than simply any rock satisfying a numerical threshold if the intended claim requires identity.

**Complication:** a human claimant needs the object elsewhere. Carrying it to court has a real opportunity cost. The player may choose a legal alternative route, risk holding the gate physically, or defer the appeal. An exact law can be useful without being morally wise.

**Return:** the machine remembers the supported appeal result and applies the same directive. A physical route changes only when the travel owner supports it. The scene echoes Kessler's scale while reversing who can be bargained with. It must not decode Lida's coordinates as an incidental reward.

### 12. Last Relief: hold the whole passage

**Substrate:** the existing finale has branch-specific physical actions and A–E dispositions; OPEN REACH proposes an inhabited Iron Maw with cargo, evidence and residents. The Long Field and Iron Maw belong to the existing expansion. [Finale](../../src/story/endings/finaleRuntime.js), [ending definitions](../../src/story/endings/endingDefs.js), [OPEN REACH](../program/living-world/02-WORLD-AND-STORY.md).

**Scene:** a displaced structural body blocks the relief path through the Maw. Moving it opens a route but transfers load into another part of the district. The player's earned capability is enough to begin, while observation and sequence decide whether the attempt is elegant or catastrophic.

**Approaches:** brace with an available heavy hull, dismantle a supported section and reuse it, tow cargo through a narrow alternative, employ a garden or cleared growth route where physically justified, or negotiate use of someone else's machine. Prior friends provide actual vessels, materials or access when their recorded state permits. A friend never teleports a miracle into the finale.

**Aftermath:** the operation leaves an inhabited place with an open route, a compromised service, a lost resident, preserved evidence or some combination. The ending then determines who will maintain, hide, govern, publish or keep working that result. It is the largest version of making room for Lio's run.

## 9. Tenfold lore support without tenfold exposition

Give every important place ten kinds of evidence. These are authoring questions, not ten mandatory popups or ten new simulated subsystems.

| Layer | Helios example | Later re-meaning |
|---|---|---|
| **Work** | A finite cut, a repaired feed, a received heater | Missing maintenance is a chain of interrupted jobs, not a generic poverty texture |
| **Ownership** | Player-cut iron is theirs; crew-cut chips retain their title | Medicine can be lawful property misclassified by a writ |
| **Home** | A stool, a watch meal, a regular service berth | A wreck at Pallas is somebody's address before it is salvage |
| **Time** | A shift changes who uses the tool and who receives the load | A closure changes the next route; it need not be a universal countdown |
| **Material culture** | Reused straps, worklights and cage storage | The same fittings appear in increasingly improvised arrangements at the rim |
| **Law** | A readable receiving boundary and a clear inspection rule | A correct filed instruction can conflict with a person the player can see |
| **Mutual aid** | A cutter pauses for the player; Lio yields at a crossing | Convoy partners cooperate in a harder operation without requiring a cutscene army |
| **Ambition** | Someone wants off the watch, a better berth, or ownership of a tool | Mira and Quinn's exits become choices with material conditions |
| **Memory** | A returned original lamp stays returned | A repaired corridor remains part of the route after the ending |
| **Unknown** | A peculiar mark or dormant mechanism has no immediate answer | The fragment retains its private uncertainty even when the public crime is understood |

For each flagship district, author a compact working-life sheet before more dialogue: three normal routines; two people with incompatible but intelligible wants; one shared resource; one ritual; one illicit practice; one recognizable repair; one absence with a history; one way the player's prior deed appears. Reuse existing cast and site IDs. A long list of facts without an ordinary route to encounter them is not lore depth.

### Cultural texture that can be cheap and memorable

**Shift etiquette:** workers lower lights or tools in a specific sequence before a handover. The player learns the sequence by using the place. A later interrupted handover is readable without a new warning system.

**Borrowing culture:** a tool can be returned to its owner or a recognized next-watch berth. The existing worklight already supports this useful distinction. Expand the social meaning before adding more interchangeable tools.

**Salvage manners:** a crew removes names before cutting valuable material. Another crew does not. A garden will take both. The player can choose how to work without an explicit honor meter.

**Local competence:** Helios respects clean handoffs; Tethys a correct count under traffic pressure; Vesta a safe hot-load move; Pallas a maneuver that does not smash someone else's home; Phoebe restraint; Sker a spectacular act that respects a local rule. These values can conflict.

**Music and silence:** ordinary machinery and radio give a place its rhythm. When the Elroy truth or a Vethari trace lands, suspend the joke layer, not the player's controls. A repaired machine restarting can carry the emotional resolution better than a musical victory sting.

**Leisure:** let people watch racing, gamble, argue about a Cull recording, rehearse or take tea without making every pastime a quest system. Vesper and Wex are useful existing anchors. The world needs pleasure that does not conceal another cruelty.

**Material superstition:** a hull scar, a particular repeated figure or an avoided berth can accrue stories. Some superstitions should be wrong. If every rumor is a reliable hidden quest, the culture becomes a checklist.

**Names and anonymity:** keep the Tessera's prior owners' unresolved traces distinct from newly named characters. A named “previous captain” in current data conflicts with the older explicit anonymity ruling and needs a decision, not casual elaboration.

**Children and future generations:** the daughter's berth or a family lamp can make time matter without putting children in recurring rescue jeopardy. Objects, schooling routes and changed household habits can show what a future costs.

**Distance:** the farther route should have a different repair practice, ownership custom or service rhythm. Foreignness need not mean an enemy species or an obscure vocabulary.

## 10. The five endings as the beginning of a different working life

Preserve A–E IDs, the actual earned history and the ability to keep flying. The [current ending definitions](../../src/story/endings/endingDefs.js) already provide continuation objectives and explicitly preserve inventory/history through the Loop. OPEN REACH's larger district consequences are future work and should not be claimed as all present today.

- **A, the commission:** the player takes responsibility for a particular corridor. A real relief ferry crosses under their authority. The cost is having a superior and orders that may conflict with that corridor's people. The first return should test a specific rule, not reveal that all help was imaginary.
- **B, the quiet route:** the player makes an unofficial supply line viable and masks their public identity. A receiver gets its cargo. The cost is exposure and the fact that a private route can be sold. Keep the beneficiary visible even when the pilot's name is absent.
- **C, the Loop:** the physical return preserves the changed world. A familiar worker can notice that the same ship has come back with knowledge or cargo that does not fit its account. Do not reset rescued people, rebuilt services or rewards to manufacture a metaphysical punchline.
- **D, the witness:** the player keeps and carries evidence. A useful truth reaches a claimant through actual distribution. The cost is the exposure of sources and the labor of protecting them. The desk is a home port, not a command to stop piloting.
- **E, the next run:** the ordinary relief circuit works. The modest payment remains modest. Let the final load arrive and be used. A genuinely correct cargo description is an earned surprise after the campaign's misclassifications.

The epilogue should pass through at least one place the player altered. It can be short. An unchanged sweeping routine interrupted for three seconds by a service launch the player saved already says more than a paragraph ranking their morality. That image belongs to OPEN REACH; use it as a model for specific material recognition, not as a mandatory universal cutscene.

## 11. What to build next, and what to resist

### First: one complete local-to-regional story

The strongest next creative package is **the shift meal → first discrepancy → medicine receiver → Bay 7 return**. It links the best new Helios work to the existing campaign without adding a faction, a sector or a second mission architecture.

It should have four scenes, a readable path between them, and at least two return visits. The first scene must be enjoyable for a player who never reads the lore. The last should make that same player recognize why the first mattered.

This package needs a focused identity/continuity decision before implementation: the Pit destination, which Mira is which, and Elroy's supported post-custody condition. Those are concrete authoring choices, not reasons to postpone all independent scene composition.

### Then: the market convergence

Develop Callum/Cade, the freight movement and the Archive exchange as one regional operation. It can supply B5 with an actual dramatic shape rather than a chain-count finale plus optional lore. Build around the existing market/transfer machinery and custody owners. Do not commission a new bespoke cinematic boss.

### In parallel: spend existing art on these relationships

The companion [asset-to-experience toolbox](../research/asset-experience-2026-11-10/ASSET_EXPERIENCE_TOOLBOX.md) verifies a substantial physical vocabulary: distinct miner, tug, rescue and tender hulls; worklights, scrap cages, transfer arms, gantries and repair machinery; multi-stage Relay and Wreck Cathedral sites; Second Measure shipbreaking; and a colonized conveyor barge. Ordinary decoration is not automatically interactable, and a model in the release manifest is not proof of a readable scene. Compose those existing subjects before requesting generic new industrial props.

For the first connected story package, a recognizable **Wex** portrait is a more justified new art request than another worker-hull family. The [portrait registry](../../src/data/portraits.js) explicitly lists 18 pending canonical portraits, and the companion inventory verifies all 18 files absent. Callum, Dree, Moss-Keeps-Moss and Brother Index would be useful later priorities as their scenes become reachable. Do not borrow another named character's portrait. Preserve deterministic fallback identity until the actual face lands. This report commissions no image and claims no new asset production.

Keep Cinder Nursery's current operations honest: cyst extraction and relay severing are separate authored operations, not mechanically exclusive alternatives merely because a prose summary says “or.” A proposed choice needs a real consequence relationship, not a fabricated lock in the description.

### Then: one finale dependency carried from home

Choose one earlier service or relationship that can physically assist Last Relief. A saved heavy workboat, a route authorization, a correctly sourced power unit or a trained receiving crew is sufficient. Prove it arrives through the ordinary route and preserves its earlier state. Then widen the cast. Twenty hypothetical callbacks are less valuable than one visible, truthful reunion.

### Preserve these things

- The 12.4-tonne grid, 3.1-kilogram fragment and 0.01-tonne undecoded file have different identities and meanings.
- Wren is not a chosen savior; a powerful working pilot can nevertheless change lives.
- Vale's absence, the Vethari's off-frame presence and Lida's unresolved fate remain strengths.
- The physics should be joyous, bright and sometimes undignified. Do not make every rescue slow to signify seriousness.
- A quiet break can just be a quiet break. Wex's tea does not require a reward or a twist.
- Real victories and real harm both survive into return play.

### Stop doing these things

- Adding further disconnected lore contacts before the existing ensemble has a second meeting that matters.
- Treating a dialogue acknowledgment as the implementation of a rebuilt service.
- Turning every new industrial operation into cut, tow, deposit with the same geometry. Change the traffic, load relationship, ownership, timing, recipient or alternative solution.
- Repeating a giant theme through multiple popups. Let a number, object, route and reaction carry different parts of it.
- Assuming every canonical event has a current player route because a file or build-map row names it.
- Forcing a death, destroyed service or confessed guilt after the player's actual conduct prevented it.
- Solving the institutional story by revealing that aliens caused it.
- Growing a second quest ledger to track literary intent. Existing owners must establish custody, damage, payment, survival and route state.

### Creative acceptance questions

For a completed scene, ask a fresh player:

1. Who was trying to do what before you arrived?
2. What did you move, protect, damage, take or leave?
3. What alternative did the situation suggest without a menu explaining every solution?
4. What surprised you?
5. What is different if you return?
6. Which person would you recognize next time, and why?

Then check the facts behind those answers. The player should be able to describe an event, not only a completed objective. A production claim still needs ordinary-route, rendered and persistence evidence appropriate to the scene; this document supplies none of those by assertion.

## 12. Continuity decisions that change the creative work

These are included because getting them wrong changes scenes, not to turn the treatment into a status audit.

### A. The opening still contains incompatible places and jobs

The canonical R14 route is Helios → Pit with the grid consigned home. The older [story-sector reconciliation](../world-identity/STORY_SECTOR_MAP.md) makes the Pit backstory with no live sector. The current B0 recipe says sample, skim, then dock at Helios, while its step label says “Dock at the Pit.” `_installContract47aColdStart` in [missionStoryOps](../../src/systems/missionStoryOps.js) creates a salvage-retrieval contract delivering to `station_helios`. The 12.4-tonne black-Line message exists in the skim owner.

**Recommendation:** preserve the actual ordinary opening while making its local recovery meaning coherent. For the eventual canon freight operation, commission the Pit as a supported destination or explicitly amend the exact route. Do not conflate a receiving district with an existing station ID and claim the trip exists. The current “mine” signal, salvage contract and preloaded-grid prose require a single authored account.

### B. Newer direction permits local improvement; older canon still forbids it

The old thesis and Slow Gray rule make every improvement null. OPEN REACH and build-map §35 explicitly distinguish irreversible historical harm from a functioning present-day filter. **Recommendation:** label future projections by scope. A local service can improve without erasing historical deaths or making a global index recover. Apply the same distinction to endings.

### C. Elroy can be taken intact; the older novel still declares his death

The current B2 mission offers an intact custody completion and scanner conversation. The older THE-STORYLINE and NPC canon are unconditional. **Recommendation:** keep the authored fatal route as one route. Resolve downstream text from actual survival/custody facts. Do not equate `custody_reel` with freedom or invent a destination the code did not record.

### D. Several chronology statements are stale

CREATIVE-DIRECTION R1 specifies nine years since the vault/sale/arrest, four frozen years, Wren 31, and the second fragment planted six months ago. STORY-STRUCTURE still says seven years in the reunion explanation. `narrative.js` retains an old friend/colony six-month history. **Recommendation:** use the exact R1 chronology in new scenes and reconcile the legacy runtime backstory separately. “KAEL” is currently the friend's callsign, not proof that the current protagonist is named Kael.

### E. REF and REG should not be flattened

The older weak-point report recommends a single form. The later R2 explicitly distinguishes `REG 44-C`, the regulation, from `REF 44-C`, the case reference. Current narrative metadata still describes REF as the code for everything. **Recommendation:** preserve the deliberate two-prefix tell. Correct context, not global search-and-replace. Let players notice the apparatus without a glossary lecture.

### F. B3 is not yet consistently the named tug scene

Current B3 objectives and contract fields use a slag core; comments and expansion prose describe VARIANCE ADJUSTMENT, a Hawser tug and a fourth strain spike. **Recommendation:** choose how the tug enters the actual mission before writing characters who witnessed its failure. A scar counter is not physical seam failure. Avoid imposed damage to an unrelated player hull.

### G. B4 audit naming is inconsistent

The current step ID `gate_audit_io` labels the Nereid gate. Canon and OPEN REACH name the policy attempts Kepler/Io/Eris. **Recommendation:** inspect the world-pressure owner's actual edge and label the route the player will meet. This report did not certify a particular closure graph; it does not silently choose one.

### H. The late-game plan is more ambitious than its core step table

B5 chain, B6 drone deployment and B7 observe-only progression do not themselves prove the full Reunion, inhabited seed, Hive-hulk, Long Field and Last Relief sequence. Separate late-game owners may implement pieces. **Recommendation:** commission a continuous named sequence and verify it through public play. Reuse existing physical contracts and finale owners; do not discard them because an old audit called B7 empty.

### I. Faction summaries must not overwrite faction identity

The newer WORLD table contradicts canon and data for Vael, Understory, Verge and Fulfillment. **Recommendation:** author against the canonical practices and current source while retaining readable visual and behavioral differentiation. Vethari, Vael, Bloom, Understory and Verge are not synonyms for “aliens.”

### J. Named prior owners and duplicate Miras need explicit decisions

R15 leaves Tessera's earlier owners unnamed; current `FIGURES` includes Maera Vols as previous captain and hull ghost, and the W1 Journey repeats that role. The new Helios relief worker shares the broker's name without an inspected identity bridge. **Recommendation:** retain observed files, flag the conflict and do not amplify either into a new backstory until the identity owner resolves it. A false reconciliation would be harder to remove after more scenes depend on it.

## 13. Evidence index and implementation boundary

### Product and recent creative direction

- [VISION](../VISION.md): authored physical agency, ordinary life, consequences, joy and persistent personal ship.
- [GDD 2.0](../GDD_2_0.md): core verbs, onboarding and information/readability contracts.
- [November direction](../program/finish/DIRECTION.md): shared physical feel, Adventure freedom, three build fantasies and memorable moments.
- [OPEN REACH world/story](../program/living-world/02-WORLD-AND-STORY.md): eight districts, material victories, narrow canon amendments, proposed ending consequences and identity preservation.
- [OPEN REACH evidence](../program/living-world/EVIDENCE.md): authoring/schema proof; explicitly not proof of built districts or assets.
- [Build map](../../build_map.md): §34 THE WEIGHT source ambition; §35 OPEN REACH and outcome amendment; §36 latest priorities. Rows describe scope, not implementation proof.
- [Original concept chart](../../assets/concept/map/concept_universe_map.jpg): inspected pixels for topology and atmosphere, not current place names.

### Canon, archaeology and useful earlier thinking

- [Creative direction and R1–R15](../../docs/worldbuilding/CREATIVE-DIRECTION.md): quantities, chronology, voice, identity and deliberate ambiguity.
- [Canon ledger](../../docs/worldbuilding/CANON-LEDGER.md): October adoption of expanded factions, residents, ecology, wonders and campaign events.
- [The Storyline](../../docs/worldbuilding/story/THE-STORYLINE.md) and [Story Structure](../../docs/worldbuilding/story/STORY-STRUCTURE.md): public and private strands; inspect against later amendments rather than accepting every sentence as current behavior.
- [NPC canon](../../docs/worldbuilding/story/NPCs-CANONICAL.md), [faction canon](../../docs/worldbuilding/orgs/factions-CANONICAL.md): private motives and regional practices.
- [Literary deepening](../../docs/worldbuilding/review/LITERARY-DEEPENING-GOAL-RESULT.md), [expansion portfolio](../../docs/worldbuilding/review/EXPANSION_PORTFOLIO.md), [five-pass weak-point report](../../docs/worldbuilding/review/STORY-WEAK-POINTS-5X.md): useful plant/payoff and embodiment reasoning; their July runtime diagnoses and proposed fixes are historical, not current verdicts.
- [W1 Journey](../program/finish/campaigns/W1/JOURNEY.md): useful existing arrangement of contacts and story; explicitly draft, with internal corrected inventory claims and dated counts. Do not repeat its original “14 of 16 counters have no writer” summary after its own later correction says 15 of 16 have writers.

### Current inspected source

- [sectors.js](../../src/data/sectors.js): 25 exported sector definitions and actual place names; imported read-only during this research.
- [sectorWayOfLife.js](../../src/data/sectorWayOfLife.js) and [sectorCausalChains.js](../../src/data/sectorCausalChains.js): regional work and composed activity foundations.
- [campaignData.js](../../src/story/campaign47a/campaignData.js): actual ordered book steps, branch and continuation contracts; imported read-only for the beat summary.
- [embodiedMissions.js](../../src/story/campaign47a/embodiedMissions.js): B1–B4 contracts, Elroy methods and branch-specific finale toys.
- [missionStoryOps.js](../../src/systems/missionStoryOps.js): actual cold-start installer and skim handling; [missions.js](../../src/systems/missions.js): live owner consuming the campaign.
- [narrative.js](../../src/data/narrative.js): current cold-start messages, cast metadata and legacy contradictions.
- [endingDefs.js](../../src/story/endings/endingDefs.js), [finaleRuntime.js](../../src/story/endings/finaleRuntime.js): five dispositions, continuation and physical finale ownership. Source existence is not a new completion claim.
- [worldSiteManifests.js](../../src/data/worldSiteManifests.js): concrete multi-stage world-site substrate, including the relay, Wreck Cathedral and colonized barge.
- heliosShiftStores.js (local snapshot: `src/data/heliosShiftStores.js`), heliosGalleyRun.js (local snapshot: `src/systems/heliosGalleyRun.js`), [traffic.js](../../src/systems/traffic.js): service site and integrated runner, with actual receipt-dependent behavior.
- heliosSharedCut.js (local snapshot: `src/systems/heliosSharedCut.js`), heliosCutterRepair.js (local snapshot: `src/systems/heliosCutterRepair.js`), [npcJobsRuntime.js](../../src/systems/npcJobsRuntime.js): local cutter work, repair and current consumer seams.
- borrowed worklight (local snapshot: `src/data/encounters/8206-helios-borrowed-light.js`), shift cage (local snapshot: `src/data/encounters/8207-helios-shift-cage.js`), relief run (local snapshot: `src/data/encounters/8208-helios-relief-run.js`): original-object handover, stowage, a persistent relief identity and the Mira-name collision.
- heliosShiftHandover.js (local snapshot: `src/data/heliosShiftHandover.js`): worker-specific handover evidence; a receipt from a different hull is not silently reused.
- [Morrowlight runtime](../../src/features/salvageTender/runtime.js), [physical owner](../../src/features/salvageTender/physical.js), [RATCHET runtime](../../src/features/rigWorkshop/runtime.js), [workshop jobs](../../src/features/rigWorkshop/jobs.js), [shared integration factory](../../src/features/proExperienceSystems.js), [authoritative manifest](../../src/runtime/authoritativeSystemManifest.js): optional personal-home and named-machine substrate, actual ordinary admission and ownership seams. Their READMEs mix later integration notices with earlier candidate instructions; the inspected consumers establish registration, not a new playthrough certificate.
- [Morrowlight encounter](../../src/data/encounters/8203-pro-salvage-tender.js), [RATCHET encounter](../../src/data/encounters/8202-pro-rig-workshop.js): ordinary catalog entry routes to the same persistent feature owners.
- [Asset-to-experience toolbox](../research/asset-experience-2026-11-10/ASSET_EXPERIENCE_TOOLBOX.md) and [portrait registry](../../src/data/portraits.js): verified material bindings, absent canonical faces and explicit current-render limits from the companion research.
- Wex conversation (local snapshot: `src/ui/station/wexBreakConversation.js`), Kessler comparison (local snapshot: `src/systems/kesslerComparisonContact.js`), Neri resident (local snapshot: `src/systems/kesslerYardResident.js`), Elroy contact (local snapshot: `src/systems/elroyRegistryContact.js`): the strongest current person-to-work links for the next scenes.
- [Understory](../../src/data/factions/understory.js) and [Verge](../../src/data/factions/vergelayers.js): specific ecological and machine-law data, distinct from simplified faction prose.

### Prior evidence read, without upgrading its claims

- Shared cutter face (local snapshot: `design/program/finish/campaigns/W5/HELIOS_SHARED_CUT.md`): focused native simulation and worker/presenter evidence, with full rendered approach and Save/Continue still open.
- Wex shift break (local snapshot: `design/program/finish/campaigns/W5/WEX_SHIFT_BREAK.md`): mounted Bar and state restoration checks, not full rendered/native acceptance.
- Kessler open ticket (local snapshot: `design/program/finish/campaigns/W5/KESSLER_OPEN_TICKET.md`): actual existing-card handoff and scoped tests, with broader rendering/import limits disclosed.
- Adventure integration, November 7 (local snapshot: `design/program/finish/campaigns/W5/ADVENTURE_INTEGRATION_2026-11-07.md`): combined source/test compatibility for rescue and route candidates, explicitly not one continuous player session.

**Conclusion:** SpaceFace already has enough extraordinary material for a much richer world. Its best next story work is to give existing matter more relationships: a tool belongs to a watch; a load keeps a service running; a wreck has a name and a use; a route joins people the player knows; an ending changes who will keep that route open. Let the player learn those relationships, become powerful enough to interfere with them, and return to see what the interference made.
