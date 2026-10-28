# THE OPEN REACH — places worth returning to

## Status and use

**Authored world and story expansion, 27 October 2026.** This is the creative production brief for the owner's request for inhabited places, visible routines, military concentrations, cities, wreck passages, vast surfaces and navigable interiors. It develops the existing **THE WEIGHT** campaign; it is not a second campaign competing for the same world. The section IDs and mission IDs below are stable authoring references. They are **planned content**, not a claim that the new districts, missions, vehicles or geometry already run in the game.

The existing sector IDs, character identities, saved site IDs, campaign beat indices and ending IDs survive. The user explicitly permits story changes. The narrow changes to old narrative constraints are declared in §1 and §11; they must be integrated deliberately rather than silently applied by a content agent. Source observations are from `master@42d57a248209c9f5a7354e65817c0f7b8f5dbcec`, not a playthrough. The implementation status and execution order live in this program's index and build map, not in this bible.

Read with the environment/asset brief and systems/implementation documents in this directory. This file owns what the player encounters, why it matters, the named cast, physical choices and remembered outcomes. It does not authorize a new economy, second clock, parallel mission writer or invisible reward ledger.

[`districts.json`](districts.json) is the machine-readable first-admission pack: the same eight primary stories plus sixteen compact opportunities, twenty-four routine briefs, source seams and acceptance cases. This prose supplies their social and dramatic context. Later optional ideas are explicitly separated from those twenty-four indexed opportunities.

## 1. What the world is about

The Reach was a prison supply network. The prison ended. The network inherited the prisoners.

Its gates, air plants, scales and delivery machines still sort human lives into categories that once made the prison efficient. People have built homes into those categories. A customs queue became a market. A decommissioned scale became a shrine. A wreck became a street. A relief convoy that never arrived became the place where a city remembers its dead.

Now the Helix Directorate is closing outer gates under the **Gate Audits**. The legal claim is consolidation: fewer routes, lower losses, safer freight. The physical result is stranded towns, uncollected wrecks, interrupted garden feed and a Bloom tide advancing along neglected work. The same administrative reference, **44-C**, appears on the closures, the missing recycler grid and Wren's sealed evidence. That is the main campaign's connection to the everyday world. The plot is carried by the things the player flies past.

The player is a pilot with an inconvenient ship, a Massline and enough mechanical literacy to become a local disaster. They can repair a supply chain, steal its best tool, become the person a neighborhood trusts, sell out a convoy, expose a lie, flee through the ventilation trench, or do several of these before lunch. The world must let those actions matter.

### The change in emphasis

The existing story has a strong prison, labor and bureaucracy identity. Keep it. Its weakest constraint is that every transaction must betray and every ending must leave the material world unchanged. That produces fatalism without discovery. Once a player knows every answer is “the system wins,” choices become another repeated texture.

For this expansion:

1. **Local victories remain victories.** If the player restores a filter bank, that block gets cleaner air. If they reopen a physical route, traffic uses it. A hostile institution can contest the result later; it cannot retroactively make the player's work imaginary.
2. **Complicity follows actions.** A false bounty can invite a murder. It cannot record a murder the player prevented. A frame-up is an allegation with a source, not an excuse for the game to falsify its own event history.
3. **Ordinary people are allowed to be decent, selfish, funny, frightened, competent and inconsistent.** Not every friendly face is a twist villain. A cook who feeds a stranded crew may also refuse to feed the player who destroyed her water tender.
4. **Institutions have functions worth fighting over.** Concord stops pirates and conducts abusive seizures. The Quiet moves medicine and sells routes. Drift protects crews and hoards claims. Choosing who controls a place changes what happens there, rather than changing only a flag.
5. **Mystery and practical understanding are separate.** The origin of the Vethari can remain unresolved. Whether a bridge is powered, a turret sees the player, or a cargo pod belongs to someone must be readable.
6. **Freedom survives the campaign.** The player can go to the base for the joy of stealing a ridiculous machine without accepting a story contract. A district does not switch on when its quest starts.

Maturity means a world that keeps its promises and has something to lose. More profanity, dimmer lighting and mandatory misery are cheap substitutes.

## 2. What already exists, and what this plan adds

The source already contains more identity than the present complaint suggests. Its definitions include 25 ways of life, authored sector activity pockets and causal chains, station shifts, world-site operations, recurring machine-people, 47-A's B0–B7 spine, region wonders and a Bloom ecology. Definitions are not proof that a player naturally sees their promised effect. This plan composes that material into legible places.

| Existing source | Preserve and use | New work specified here |
|---|---|---|
| `src/data/sectorWayOfLife.js` | Sector work, law, crime, signature machinery | District-scale spatial composition and social life around the work |
| `src/data/sectorActivityPockets.js`, `sectorCausalChains.js` | Authored cast, jobs and interrupted chain outcomes | Continuous neighborhood routines that persist between vignettes |
| `src/data/stationLife.js`, `worldCalendar.js` | Station notices, shifts and existing clock | Named shifts with visible labor, rest, public rituals and interrupted schedules |
| `src/data/worldSiteManifests.js`, `sectorWonders.js` | Physical work sites, components, custody and saved operations | New adjoining spaces, authored routes and large geometry; do not duplicate an existing root |
| `docs/worldbuilding/sheets/worlds/sector-wonders.md` | Directorate Tower, Gate 3, Cathedral, Switchyard, Maw, Song Field | Whole districts whose plan, work and routes make each wonder useful |
| `docs/worldbuilding/story/NPCs-CANONICAL.md` | Kessler, Rook, Hale, Slate, the Orphaned Shift, Lusk, Lise, Moss | Relationships expressed in repeated work and changing material conditions |
| `src/story/campaign47a/` | Beat/branch/ending identities and existing domain ownership | Physical campaign pressures and truthful variations on authored scenes |
| Bloom canon and live species definitions | Coupling filaments, host shadows, nonhostile ecology | Infested streets and interiors with feeder routes, visible fronts and recoverable services |

### Geography and identifiers

These are eight **flagship districts**, not eight new sectors and not a deletion of the remaining map. A district is a meaningful local arrangement of existing and new places. Each has a center, an edge, an ordinary route, a risky route, a resident cast and an afternoon that continues without the player.

| District ID | Name | Existing sector ID | First recognition | Signature mission ID |
|---|---|---|---|---|
| `district_helios_lantern_ward` | Lantern Ward | `sector_helios_prime` | A city tied around one dark memorial plinth | `lw_helios_empty_plinth` |
| `district_dione_niner_bastion` | Niner Bastion | `sector_dione_lane` | Ordered fleet berths beneath an ancient gate ring | `lw_dione_borrowed_authority` |
| `district_tethys_switchyard` | The Switchyard | `sector_tethys_junction` | Freight rails crossing terraces, markets and occupied hulls | `lw_tethys_wrong_address` |
| `district_ceres_cathedral` | The Cathedral | `sector_ceres_belt` | Vaulted wreckwork beside a mountain of ore with open mouths | `lw_ceres_ninth_mouth` |
| `district_pallas_widows_run` | Widow's Run | `sector_pallas_drift` | A street threaded through the ribs of dead ships | `lw_pallas_funeral_freight` |
| `district_charon_memorial_gardens` | Memorial Gardens | `sector_charon_expanse` | Ship paint beneath cultivated growth and advancing wild filaments | `lw_charon_green_debt` |
| `district_ashfall_iron_maw` | The Iron Maw | `sector_ashfall_reach` | Hull plating replaces the sky; neighborhoods sit in its scars | `lw_ashfall_last_relief` |
| `district_phoebe_fourth_toll` | Fourth Toll | `sector_phoebe_echo` | A harbor of bells around an engine that must remain still | `lw_phoebe_quiet_bell` |

The source also uses story-band names: Tycho = Tethys, Meridian = Ceres, Hollow = Pallas, Cinder = Charon, Skerris = Sker Haven. Public navigation should lead with the live sector name and show the local name as a subtitle when useful. Never create an accidental second Tycho because a writer read a chapter before reading the map.

### The physical dependency graph

The everyday network is deliberately comprehensible. Ceres supplies bulk structure. Vesta turns some of it into replacement machinery. Tethys sorts freight. Dione permits or obstructs its passage. Helios concentrates clean services and administrative power. Pallas carries the freight that the official network refuses. Charon makes wrecks useful and restrains the Bloom. Phoebe maintains relief and recovery routes. Ashfall holds stranded capital, old evidence and things nobody successfully decommissioned.

That is enough causal structure to create many stories. It is not permission to simulate every resident's bank account. A broken cutter delays one finite load. That load's absence affects one named recipient. The recipient's change becomes visible before any larger consequence is alleged.

## 3. Eight places

### 3.1 Lantern Ward — Helios Prime

**Promise:** a home port whose normal life the player can come to care about. The district has warmth without becoming a safe theme park. Its public streets remain a viable beginning for an unskilled pilot.

#### The first forty seconds

The ship clears a low service arch. A commuter launch crosses ahead, slows for a tug and disappears through a berth gate. Beside it a maintenance drone is repainting one side of a support while a resident hangs a lamp on the other. Both know the arrangement. Neither wins.

The Candle Fleet comes into view through the inhabited ring: twenty-four lights and the dark twenty-fifth plinth already established in the game. A repair launch drags a replacement globe toward an upper bracket. The huge Directorate Tower is visible beyond the memorial, its clean windows lit in rows. The contrast is geographical, not a paragraph about class.

The first useful invitation is a loose procession cradle caught against a mooring. Its tow point is visible. A neighbor asks, “Mind that? It has to turn before the candles do.” The player can help, ignore it or hit it. All three outcomes belong to the same world.

#### Neighborhoods and ordinary life

**The Apron** is the everyday working edge: boarding launches, hose tenders, a fuel queue, a battered sign that physically swings clear when the service lane opens. **Lantern Steps** is a chain of short terraced habitats with garden drums, a laundrette exhaust and a small repair courtyard. **The White Side** leads toward the Tower; traffic changes from work hulls to escorts and sealed couriers. The architecture offers short glimpses through its gaps rather than a field of disconnected stations.

Nessa Venn, a new ward electrician, keeps the memorial's public lights working. Her service launch carries one replacement globe; it returns empty after a completed repair. A cook's water tender meets the commuter launch between watches. The meal crates move to the outbound ferry. A maintenance crew releases a short bridge for cleaning, with an alternative lane visible before it shuts. Vesper's rehearsal is heard and seen from one public edge; it is not displaced by this district. Sump still sweeps, but his tiny work platform has a real arrival route and a place to put what he collects.

Use the existing station shift clock. End-of-watch is a change in jobs and traffic, not a new local calendar. The district can become quieter without becoming empty.

#### `lw_helios_empty_plinth` — The Empty Plinth

**Situation:** a living family has made a lamp for a dead relative. Its cradle sits on the ward's outer procession route, beyond a blocked service cut. Nessa has promised to reconnect it, but the family tow cannot turn through the obstruction. The canonical dark twenty-fifth memorial plinth remains a historical absence. The family's empty cradle is an adjoining local place; the mission does not rewrite that established absence as a collectible bulb puzzle.

**Physical sequence:** identify the family's actual disabled lamp and matching cradle; escort its tow, move it with the borrowed cradle or clear the service cut so the crew can finish; hold or brace its cable arm during the attended service. Only the exact lamp's confirmed installation and restored native service settle the mission. A procession timer does not.

**Approaches:** help the slow tow through public traffic; borrow the yard's portable cradle and carry the lamp personally; move the fallen obstruction and let the scheduled crew do the installation. Missing parts can be bought through ordinary cargo or recovered from a suitable maintenance lot. Theft is optional and has a witnessed owner. Repair work is never a disguised invitation to attack a starter civilian.

**Outcomes:** the light works and the family tow takes its permanent berth; clearing the service cut also lets the shuttle use that route. If the lamp breaks, the family and same damaged object remain while a repair/recovery task opens. If the pilot leaves, the crew can attempt a slower route later. Missing the ceremony does not reset the watch or erase the household. Nessa can be angry and still point to the repair material she needs.

**Return evidence:** the new family light, the actual launch route, the lamp's source and receiver custody, a damaged or restored bracket, and a family tow now moored in the ward. Nessa's dialogue cites the recorded action. The memorial is not “completed.” People continue to mourn, work, complain and eat.

**Local toy:** the procession cradle is a steerable tow platform with multiple sockets. It can hold lamps, recovered passengers or inadvisable cargo. Its slow mass is useful for blocking a lane or bracing a repair. It is not a reward icon that vanishes into inventory.

**Two indexed smaller stories:** **Five Minutes Late** (`lw_helios_shift_change`) is a shuttle held behind a fallen traffic mast: clear it, lead the signed freight bypass or let a tug eventually resolve it. The actual arrival changes the schedule; causing a collision leaves a repair claim. **Borrowed, According to You** (`lw_helios_borrowed_cradle`) lets the player earn, purchase or steal the portable cradle as the same physical object. Its absence changes the yard's work until it returns or a replacement is delivered. No one needs to die for the world to remember.

### 3.2 Niner Bastion — Dione Lane

**Promise:** the military place the player visits voluntarily to see whether an outrageous theft is possible. It must also be a place where soldiers work before anyone fights them.

#### The first forty seconds

From the public freight lane the player sees two drill flights turn together, a damaged patrol ship being towed into repair and a crane lowering ammunition into a service collar. Gate 3 fills one side of the view. The dormant Auditor is visibly nested in the old ring, much older than the naval gantries bolted around it.

The approach is legible in geometry: public lane, inspection apron, restricted berth, inner arsenal. A traffic lamp and broadcast announce the restricted line before weapons respond. A clear exit remains behind the player. A base that kills an uninformed pilot before it communicates its boundary is a trap, not a challenge.

#### The standing force

The first-admission pack proposes **20 active bodies in ordinary work and an alert demand of 32**, including the district's civilian, military and service craft, plus **12 finite reserve identities** eligible for later admission. Reserve means a logical roster, not twelve additional simultaneous actors or a second copy of the active hulls. These are planning envelopes, not raised runtime defaults: the current shared default is 24 with a hard limit of 40. Other encounters, traffic and tools compete for those slots. Actual active admission remains the systems/performance owner's budget; an implementation must disclose how many hostile ships it sustains simultaneously.

Within that budget, arrange recognizable picket pairs, four-ship alert flights, a training element and logistics craft. Each ship has a named berth, watch assignment and damage/replenishment state. The whole district can sustain a long fight involving dozens of distinct defenders through staged, visible launches without pretending every dormant hull is already running a full combat AI. If the measured implementation can admit a large simultaneous battle, its extra cost must be qualified against the same shared world.

Flights launch from visible berths, traverse gates or arrive on an advertised relief route. Reinforcements cannot materialize behind the player. Destroyed craft stay destroyed in that incident. Later replacements require a communicated relief shipment or elapsed service cycle; the base does not refill because the camera turned away.

Commander Petra Lusk, an existing character, keeps the public route safe and believes too many authenticated files. Inspector Sula Dree asks questions that the forms do not. Chief Omi Tern, new, operates the repair collar and will refuse to launch a ship with an unfixed drive even under fire. An off-duty target tug lets cadets practice impulse discipline. Its battered shield plates tell their own story.

#### `lw_dione_borrowed_authority` — Borrowed Authority

**The desirable thing:** **COUNTERSIGN**, a Warden-based interdiction tender with a deployable mass anchor, a shielded towing collar and an external service deck. It is powerful because it can arrest or redirect heavy freight and brace machinery. It is not simply a superior gun. Its wide turning circle, exposed rear coupler and energy-heavy anchor make escape interesting.

**Location:** a visible inner-berth repair cradle. The hull appears in normal base life before a mission names it. Its crew disembarks at a scheduled service stop; an uncrewed ship is still owned. The player can learn this by watching the base, speaking to Tern or following a compatible service tender.

**Ways in:** earn temporary work clearance and bring the actual replacement drive unit; enter with a legitimate service convoy then leave its permitted route; approach through a maintenance trench during a shield-collar calibration; or attack the outside defenses and force entry. Each method changes the initial defenders and witnesses, not the physics or ownership rules.

**Taking control:** disable the remote immobilizer at its physical receiver; resolve the seated crew through evacuation, negotiation, surrender or an actually supported hostile boarding path; bring the drive online; transfer control to the same ship body through the existing custody/helm-transfer owner. The original player ship remains somewhere real. Mission prose must not claim a boarding minigame until that gameplay exists.

**The escape:** the main lane has a physical interdiction collar. The freight trench permits a tight rear-first tow through a maintenance gap. A player can also turn COUNTERSIGN's anchor on the collar, pull a patrol formation out of its firing geometry, release ballast and flee. A pursuit remains possible; victory is not a teleport at the district line.

**Law and aftermath:** the base escalates from warning to escort to disabling force when the relevant facts warrant it. Firing on personnel or occupied craft can warrant lethal response. Theft produces disputed title and named claimants. Returning the tender, buying an amnesty tied to the actual incident, surrendering a seized cargo or earning a legal requisition are distinct resolutions. A paid fine cannot resurrect dead crew. A legal requisition gives a parallel acquisition route without invalidating the theft fantasy.

**Return evidence:** the empty cradle, replacement or impound procedure; disabled defenses being repaired; a patrol leader who recognizes the serial number; Tern refusing repairs until restitution; civilian traffic temporarily rerouted around the incident. A successful clean theft can embarrass the navy without making the whole civilian population omnisciently hostile.

**Two indexed smaller stories:** **Target Practice, Revised** (`lw_dione_target_practice`) lets the player earn work access in an impulse drill, redirect its real ballast target to distract the watch or use it as cover during a heist. Bad shots can injure people and generate witnessed consequences. **The Last Bus Through** (`lw_dione_last_bus`) follows a civilian shuttle caught by an alarm. Escort it, restore the public relay or use its physical manifest to secure a corridor; a missed crossing moves passengers to a real refuge with another route. Rescue and theft settle separately. Neither a drill score nor a dialogue answer substitutes for the physical result.

### 3.3 The Switchyard — Tethys Junction

**Promise:** a city organized by movement: streets for ships, inhabited terraces, freight that goes somewhere, shortcuts worth learning. It is crowded enough to feel urban and structured enough that a pilot can read it.

#### The first forty seconds

The approach passes under a suspended garden barge, alongside a row of converted passenger hulls, then through the opening between two market gantries. Above and below the flight plane, rails carry standardized freight. At the playable crossings, actual cargo trains enter and leave the same rails. A vendor launch waits for the crossing to clear before pulling out. At Scale 4, Kessler's working pad is visible from a public service court.

The skyline has three reliable navigation marks: the high Switchyard mast, the crooked residential **Hundred Windows**, and Scale 4's blunt weighted arm. Hundred Windows occupies the inhabited side of the existing split-station anomaly; its other half and canonical actors retain their identity. These marks remain useful when labels are hidden. Freight ring, residential cut and impound trench form different routes through the same district.

#### Citizens with work

Kessler weighs freight. Rubric checks a coupling at the transfer spur. Paz Dowel, new, flies a patched courier with a crate rack larger than the cabin and refuses to leave an uncollected medicine delivery at a “safe location.” A scrap cook has a moving kitchen berth; the cooking craft must moor somewhere before serving. A municipal hose ship replenishes a greenhouse; a broken hose leaves that greenhouse dimmer until repaired. A dead Fulfillment address receives a small stream of perfectly documented deliveries. Residents have built a public bench out of the returns.

Freight follows normal inventory and custody. Small residential animation can be presentation, but a ship, crate or machine within reach must promote to the same real object the player saw approaching.

#### `lw_tethys_wrong_address` — The Wrong Address

**Situation:** a Fulfillment sorter routes a **refrigeration pod** toward the uninhabited half of the split station because that was the address on the standing order. Its finite medical lot is needed at the working clinic in Hundred Windows. Meridian wants the player to complete the manifest; Paz wants the shipment to reach the people who ordered it; Kessler has the old street plan. Clerk 0003 is the institution's recurring voice, not a duplicate local capital spawned for this job.

**Physical sequence:** identify the exact refrigerator pod on a moving train; uncouple its carriage at a reachable switch; transfer it to a shunter or tow it through the residential cut; hand its finite lot to the correct working receiver. Alternatively move and register the actual receiver mast with the recovered shipping plate, then accompany the corrected run. The existing Scale 4 episode retains its own cargo and receipt; this mission is not a second version of that quest.

**Approaches:** tow the lost pod to the inhabited half; restore the legitimate address by moving its receiver mast; persuade the clerk with a recovered shipping plate and accompany the corrected delivery. Intercepting a carriage during a freight crossing is a physical route with actual custody consequences, not a magical alternative award. Cutting the wrong coupling releases neighboring cargo and creates a rescue/cleanup problem, not an instant failure screen.

**Outcomes:** the delivered quantity replenishes the clinic's real stock and changes its light/service rhythm. Correcting the receiver also changes subsequent delivery destinations. Cargo lost at the wrong half remains recoverable; spoiled or damaged cargo supplies fewer units and creates a replacement need. The oldest delivery machine may insist it succeeded while the physical world plainly says what happened; the UI reports both as different sources. An address correction and a completed delivery are distinct receipts.

**Return evidence:** the clinic's service state; subsequent parcels reaching the inhabited receiver; the order's confirmed destination; missing or returned carriage; a visible memorial tag if a preventable collision killed a named resident. Do not blame the player for a casualty merely because they accepted the job.

**Local toy:** a low-speed rail/impulse shunter can grab, orient and transfer train modules. It is valuable for salvage and improvised barricades. Its endpoint is a controllable physical mechanism, not a special mission-only animation.

**Two indexed smaller stories:** **No Such Thing** (`lw_tethys_free_lunch`) asks for one real canteen shipment: pay for it, escort it or steal it and accept the visible local shortage. The hatch opens when stock arrives; one lunch crate does not determine a whole sector's hunger. **The Switching Fee** (`lw_tethys_switching_fee`) gives access to the physical impulse shunter through hire, derailment clearance or theft. It can become a moving barricade, but it still obeys mass and coupling limits. Damaged couplers and abandoned pods remain until someone resolves them.

### 3.4 The Cathedral — Ceres Belt

**Promise:** mining country with geological scale, dangerous work and a real interior. The player should feel small without spending minutes staring at empty travel.

#### The two landmarks must stay distinct

The existing **Wreck Cathedral** is a saved world site with its own operations. Preserve it. This district adds the adjacent **Nine-Mouth Cut**, an ore-hollowed mass whose visible face fills multiple normal-camera views. Its open shafts, spoil terraces and lit vaults create the “mountain you can fly into” experience. The district can use “Cathedral” as the local collective name without rewriting the saved wreck as an asteroid.

#### The first forty seconds

A convoy disappears into a dark opening large enough for the player's ship and its tow. A cutting head flashes inside, partly hidden by a rib of rock. A small tug emerges towing a plate that makes the opening suddenly legible in scale. Across the gap, the Wreck Cathedral hangs over its own working yard. The two sites share traffic and history, not object identity.

Outside routes run along the face and across waste terraces. Inside, three interlocking shafts support a public freight passage, a narrow service throat and an abandoned cut. A roof is actual occluding geometry; it is not a screen tint. At mapped camera portals the chase view can take over with a clear entry and exit. Flight remains the game's supported XZ-plane controls unless a separate three-dimensional flight feature is explicitly built.

#### A working interior

Drift weighs outbound ore; Ruckus and Solstice retain their existing work and personalities. New foreman **Aunt Tor** runs a ventilation tug whose large intake fans visibly change pitch with load. Nine-Finger Abe sends crews into numbered cuts and remembers who brought them back. Shift ends gather the small craft near a warm service cradle while the large cutters cool. A hymn is a tool synchronization call; the Choir claims it used to be a hymn first. Neither side agrees.

#### `lw_ceres_ninth_mouth` — The Ninth Mouth

**Situation:** a roof fall cuts the direct freight route. The public map still marks the passage open because its last survey predates the collapse. A loaded crew is on the far side; a hot cutter is running down its safe cooling supply. The state of the passage is visible at the entrance before the pilot commits.

**Physical sequence:** scout the collapse from either end; stabilize a suspended block or redirect a cutter; make an actual ship-sized aperture; tow the disabled load or help the crew transfer it; leave the route marked according to its real clearance. The mine can be entered without accepting this mission.

**Approaches:** take the longer vent route and rescue the crew first; cut a short opening while bracing the unstable span; use a heavy counterweight to shift the fall; recruit a second tug if available. The short route has a distinct hazard, not a higher HP door. A large stolen tender may be unable to enter; the player must choose a smaller hull or work from outside.

**Outcomes:** clearing the full passage resumes trains. Opening only the service throat rescues crew but diverts freight. Abandoning the job leaves a sealed shaft and a visible rescue attempt by another crew. A failed brace can enlarge the fall and expose a salvage pocket; recovery remains possible from the other mouth. No story-critical person is made immortal inside the falling rock.

**Return evidence:** the opening's changed collision/geometry, marked route, recovered or lost cutter, worker roster, finite ore still on the far side. Dust, lamps and sound follow the working state. Mining cannot visibly continue through a sealed wall.

**Local toy:** a portable quarry winch head and massive hanging ore bell. Seating the winch creates a temporary anchor with a rated load; releasing the bell turns a piece of industrial infrastructure into a reckless momentum source. Tools move between sites through ordinary custody.

**Two indexed smaller stories:** **What the Rock Can Carry** (`lw_ceres_bell_load`) uses the quarry resonator to find a loaded member; unload the overloaded tug or bring a heavier anchor and share the load. A wrong pull breaks a replaceable member and changes the evacuation window. **The Portable Mountain** (`lw_ceres_winching`) lets the player borrow, buy or recover a dropped winch head from a side chamber. It is the same usable tool in later custody, and a borrowed winch's absence changes a crew's available lift. The repaired beam can carry an inspector's patch and workers' old names without becoming a second reward system.

### 3.5 Widow's Run — Pallas Drift

**Promise:** an outlaw neighborhood built inside a navigable ship graveyard. The best route is learned, not rolled randomly. Smuggling feels like piloting and local knowledge.

#### The first forty seconds

The official lane ends at a severed capital bow. Warm windows appear between the armor ribs. A laundry drum turns inside an old missile bay. The route bends around a reactor casing, through an open hangar and past a customs hull mounted upside down as a public clock. A repair crew is removing its gun, slowly, for reasons of taste and resale.

The dead ships are arranged as streets: **The Rib**, a broad route suitable for cargo; **Widow's Run**, a fast one-ship slalom through torn bulkheads; **Quiet Berths**, a sheltered town pocket; **The Hook**, an exposed crossing from which Ravel's loom is visible. A novice can take the long route. Skill saves time, heat exposure and convoy separation without becoming a compulsory race.

#### People who live in the wrecks

Mira operates sealed freight through the existing Quiet network; she is not relocated from every previous contact surface. Her runner **Fen Tallow**, new, paints over old transponder numbers only after checking that nobody is still broadcasting them. **Ava and Iri Doss**, new, run a salvage hearse, disagree constantly about what is salvage, and always share the tow. A hullwright repairs the public ribs because even thieves need a way home. Pirate crews eat and refuel here; merchants do not all attack on sight.

The town has enforceable local customs: no discharge inside Quiet Berths, no tow through a moored habitation, no dismantling an occupied hull. The Reach can violate those rules too. A supposedly lawless port should still have behavior that its inhabitants defend.

#### `lw_pallas_funeral_freight` — Funeral Freight

**Situation:** the Doss tow is moving the **Never-Landed Ferry**, a converted habitation hull, to a new berth while its residents mourn their dead captain. The ferry never fulfilled its original passenger route; its stranded occupants made homes aboard. Its aft modules are visibly occupied. The outer engine bay is unoccupied. A finite medical shipment can travel under the funeral's protection, while a valuable engine still carries a creditor's claim. Mira knows both opportunities exist.

**Physical sequence:** accompany or interfere with the tow through the Run; reach a sheltered pause where the medical lot can be checked or transferred; navigate the resulting mass and clearance to the new berth. The ferry's movement, its living occupants, the medical lot and any separated engine have distinct custody and safety outcomes. A body being delivered does not prove that all its contents arrived.

**Approaches:** help tow the ferry and protect its occupants; run the medicine in its sheltered wake and unload at the clinic; purchase or contest the engine's salvage rights; steal the unoccupied engine during the ceremony and manage the damage to the tow. A legal way to help is real, not a fake path designed to force heroic theft. Occupied bays are marked in silhouette, work lights, comms and the target information before a destructive decision.

**Chaos possibility:** a pursuer can snag a loose coupling, drag a chain of plates into the Run and block the town's primary freight entrance. The player can deliberately cause this. The same physical blockage can later be cleared for money, restitution or spite. Residents remember both acts separately.

**Return evidence:** the ferry in its inhabited berth, its engine still present or physically missing, the clinic's real stock, changed public clearance and repairs to any damaged habitation. A theft can become a rescue; rescue does not cancel the theft. A surviving family mourns at a specific damaged hull if an actual loss occurred. The local rumor identifies uncertainty: “Doss says you cut it loose” is different from a confirmed court record.

**Local toy:** a salvaged coupler ram that can hook multiple wreck sections into a rough plow. It is wonderful in a debris lane and terrible in somebody's front room.

**Two indexed smaller stories:** **A Short Cut Through Someone's Kitchen** (`lw_pallas_short_cut`) offers a family service gap as a tempting escape. Ask to use it, clear the blocked public way, or break an occupied passage whose hazard is unmistakably signaled; the resulting windows, shutters, access and claims change. Do not secretly kill unseen families as a surprise morality test. **Widowmaker, Secondhand** (`lw_pallas_salvage_ram`) is the coupler ram on a stalled tug: work a salvage lease, recover it with permission or hijack the rig. An oversized stolen assembly can visibly jam in a narrow street and require detachment or recovery.

### 3.6 Memorial Gardens — Charon Expanse

**Promise:** cultivated alien life and destructive infestation are visibly different. The landscape is beautiful, useful, uncanny and able to become hostile without turning everything green into an enemy.

#### The first forty seconds

The approach crosses a living mat grown over the ribs of a warship. Old faction paint is still visible beneath it. Understory tenders cut channels through cultivated growth, tow a finite wreck into a receiving bed and withdraw before the bed closes. On the far side, wild filaments climb a habitation shell in a pattern the tenders are actively keeping out. A Mourning kite follows its habitual route around the memorial wrecks. A player can fly through without firing once.

The town is arranged along a controlled **tide wall**: **The Fed Beds**, **The Dry Street**, **Memorial Three**, and **Greenwake**, the street beyond the current line. The safe path, growth boundary and relay-bearing structures differ in silhouette and movement. Do not use color alone.

#### Residents and work

Moss-Keeps-Moss measures wreck feed by mass and offers exact terms. Rook's existing bounty booth is nearby enough that the player sees how his paperwork produces the garden's raw material. **Dara Vetch**, new, maintains a nursery of ordinary food plants on the dry side and refuses to call the Bloom “evil” while treating an infected ventilation duct as an emergency. GRAVEDIGGER stays associated with Eunomia, its canon home; a visiting work convoy can connect the two gardens without duplicating the named machine.

Garden work has consequences. A fed cultivated bed can bind a wreck, absorb a finite spill and hold a particular front. A hungry bed loses that capacity. Wild growth follows available substrate, not arbitrary difficulty waves. The exact rates are tuned; the observable causal relationship is part of the story contract.

#### `lw_charon_green_debt` — Green Debt

**Situation:** a hot seized relief wreck is scheduled for disposal at the existing Three Hull Garden. Its spreading bridge is reaching toward Dara's greenhouse. The wreck is useful feed for Memorial Three, which holds a wild front off the Dry Street, but a survivor is trapped in its damaged evacuation boat. A record casing may also clear that crew's name. Moss's price for feed, the survivor's safety and the greenhouse's support are separate practical concerns.

**Physical sequence:** quarantine the hulk's active spread; free and deliver the actual survivor; cut the evacuation boat and any recovered record casing loose; tow the remaining finite mass to a safe feed mouth or sever the spreading bridge and rebuild the greenhouse support mechanically. A receipt records each actual rescue, consumption and stage change. The garden cannot consume the hulk while the same unconsumed hull remains available for salvage.

**Approaches:** isolate the hot wreck and protect the greenhouse while a rescue crew works; tow it to a safe feed mouth after recovering its occupant; separate the spreading section and use metal bracing to hold the greenhouse; move vulnerable modules if the front cannot be held. Valuable plates can replace missing feed or become mechanical shelter, but not both at once. Killing a Blind Shepherd breaks a hostile coupling path; it does not sterilize the district or magically feed a cultivated bed.

**Outcomes:** a held front, a narrowed safe route, a temporarily evacuated street, or recoverable infestation. A compromised street remains a place with furniture, signs and known former occupants. Retaking it means cutting relay connections, clearing specified bodies, restoring power and bringing residents back. It is not a combat arena reskinned green.

**Return evidence:** the same doors under or clear of growth; actual tenders back at work; memorial marks retained; saved crew living somewhere visible; changed feed demand. The Bloom may remain endemic even after a local victory. Victory still opens a real street.

**Local toy:** a detached Blind Shepherd pulse organ, with finite life and heat-dependent behavior, can draw hostile Bloom toward where the player places it. It is transportable bait and a dangerous load, not a permanent army-control wand. Its original faction and nonhostile neighbors do not become enemies by association.

**Two indexed smaller stories:** **Second Skin** (`lw_charon_second_skin`) gives Dara a choice of protection she can actually use: a cultivated membrane fed with delivered material or a metal shield rig installed over the greenhouse. Selling the biomass leaves a specific shelter shortage, not a sector-wide apocalypse. **Borrow a Voice** (`lw_charon_shepherd_borrow`) makes the harvested pulse organ available through earned service, salvage from a dead node or theft from a living one. Its pulse affects supported species, can attract threats and leaves the original site changed. A quiet memorial bed and the Mourning kite's route remain cultural texture, not compulsory additional quests.

### 3.7 The Iron Maw — Ashfall Reach

**Promise:** a structure so large that the player flies over a place rather than around an object. Its trenches, neighborhoods, plate seams, cranes and tunnels become terrain.

#### Canon reconciliation is explicit

Current adopted narrative calls the Maw an eleven-year-dead dreadnought. Current sector descriptions also identify the Iron Maw with a killed Vael-grown Deep-Mother and its growth archive. Neither meaning may be silently discarded. **Proposed reconciliation:** the district is an accreted dreadnought shell constructed and grown around that dead capital organism. Human administrative machinery occupies the keel; the Deep-Mother remains a distinct corpse chamber; the growth archive retains its own vault identity. A writer may describe the same inhabited ruin through different local traditions. An implementer must map the existing boss/vault flags to the preserved child sites and must not respawn a defeated boss to make a new story fit.

#### The first forty seconds

The player descends toward the safe approach plane and the starfield leaves the central frame. Plating goes on beyond the camera. A headlight sweeps across welded names, coolant gutters and the edge of a plate wider than the nearby buildings. A line of inhabited containers sits inside a seam in the armor. A tram of service pods moves parallel to a trench. Far away, the same impossible administrative message repeats: a relief docking clearance issued eleven years late.

**The Back**, a surface district, is the ordinary way across. **The Trench**, a maintenance canyon, provides cover and a pursuit route. **The Teeth**, huge missing plates with exposed ribs, are a dangerous salvage margin. **The Belly** contains industrial chambers and the retained Deep-Mother remains. **The Receipt Room** is a physically reachable archive compartment, not a destination reached by clicking a station tab.

#### Who remains here

Petra Lusk was the Maw's last relief captain; her involvement depends on her current survival and relationship state. If she cannot attend, a surviving duty officer or recovered order carries her institutional role without impersonating her. The inherited maintenance crew has spent years keeping pumps alive for a ship that is officially dead. The Witness records transactions and withholds conclusions. Ma Sprocket wants plates for the Gutted Maw's future arena; the workers want roofs. The conflict is material before it is ideological.

#### `lw_ashfall_last_relief` — Last Relief

**Situation:** the old docking clearance has become actionable because a jammed lift exposes a route to the receiver. A finite relief train can now reach the inhabited seam, but an obsolete control stack feeds both its colony services and a dangerous automated battery. The route also reaches the evidence compartment and deep structural clamps. Every faction wants a different part of the same opening.

**Physical sequence:** reach the receiver from the surface or trench; restore or bypass two independent power feeds; isolate the harmful control stack while maintaining colony power, or evacuate the affected court first; move an obstructing armor plate without dropping it on the seam homes; escort, steal or reroute the relief train; physically retrieve the archive casing. Evacuation, power, already-settled boss state and evidence custody each settle through their own native receipt. Breaking the Long Field's shepherd anchors is a connected regional operation, not a substitute for moving the plate.

**Approaches:** keep the colony supplied while removing the control stack; evacuate the court and dismantle the battery using crane and plates; bargain for access and isolate the archive without destroying the whole installation. Each can use the intended lift, a heavy crane, a stolen interdiction tender or a slower route through a disused chamber. No single stolen vehicle is mandatory. A player who arrives without it can still solve the place.

**Crisis:** an exposed coupling segment can pull loose wreckage across the surface. The player can anchor the train, use a plate as shielding, abandon part of the load or attract the hostile pack away from the receiver. The mission accepts partial delivery and a damaged archive. It does not award the intact evidence because a trigger volume was entered.

**Outcomes:** relief reaches the seam; some roofs are displaced and later replaced; the archive is intact, partial, sold or destroyed; the Maw opens into the Gutted Maw without erasing its residents. The arena only occupies cleared, designated chambers. Turning a neighborhood into an arena is a contested demolition decision, not an automatic unlock ceremony.

**Return evidence:** changed surface geometry, new traversal gaps, workers repairing what fell, a train route that now functions or remains interrupted, a surviving community with a specific debt or grievance. The broad silhouette persists so the player recognizes the same place they changed.

**Local toy:** a surface crane and detachable armor plate. The crane moves huge mass slowly, can become cover, and provides a moving fulcrum. The plate can shelter a convoy, block a trench or become a catastrophic projectile if the player earns the necessary force. Its size must be demonstrated by work, collision and camera framing, not a lore adjective.

**Two indexed smaller stories:** **A Window in the Gun** (`lw_ashfall_headlight`) is a service-cable run through a battery's forecastable blind interval. Follow the maintenance barge, move a plate into cover or exploit the crossing window; the load must physically arrive. A hit drops recoverable repair cargo. **Surface Rights** (`lw_ashfall_surface_rights`) lets the player lease, repair or seize a crane through native control authority. The same moved plate can remain as a useful navigation landmark. A long-delayed Fulfillment delivery is background texture unless a later packet gives it an independent supported outcome.

### 3.8 Fourth Toll — Phoebe Echo

**Promise:** a pilgrimage port that is strange, restful and mechanically rich. The place has a central object whose meaning is debated and whose behavior explains its layout.

#### The landmark

The **Missing Fourth Bell** is a deliberately empty place in the existing Echo Shrine's resonator court. Three traveling bells ring. On the fourth interval the port waits for crews beyond its visible horizon to answer. A workship sometimes answers with an engine pulse; sometimes nobody answers. Cantor Lise keeps the interval. BELLHOP tunes and moves the real resonators through its existing owner. The adjacent Shard Sphere retains its own identity; it is not renamed or respawned as a bell.

The ritual began with a lost crew. Its family asked that the fourth place remain open. Later crews turned the open interval into a way to announce they were still alive. One resident wants to restore the missing bell. Another hears a restored bell as the erasure of a person. The missing strike is not an incomplete collectible set. It is a shared practice people can reasonably disagree about.

#### The first forty seconds

Crystal spires appear beside a dim, clearly marked ship lane. BELLHOP carries a small resonator to a tuning point. A pilgrim launch shuts off its main engine and coasts through the cradle. Dockside repair crews continue working during the ceremony; one worker pauses a torch for the fourth silence and then resumes. The harbor does not become a cutscene.

**Bell Street** is the safe public route. **The Listening Cut** is a resonance passage with alternate timing windows. **The Cradle** is the resonator court. **The Shelter** houses repair and relief berths. Refuge hulls are anchored into a village, not randomly scattered around a shrine. A cook skiff brings a meal to the late repair crew. Long empty intervals have useful bearings and warm destinations.

#### `lw_phoebe_quiet_bell` — The Quiet Bell

**Situation:** a displaced resonator lies near an unlit approach, and a stranded work crew cannot reach listening range. A local sponsor wants a fourth bell restored. The bereaved family wants the place left empty. Lise wants the living crew brought home. None of these preferences is a secret trap.

**Physical sequence:** find and recover the actual resonator; carry or tune it at a valid socket, rescue the stranded crew into range, or repair the approach while honoring the requested silence. Native resonator state, crew arrival and approach service are separate outcomes. The existing Struck Bell and BELLHOP work are reused where applicable, not duplicated behind a new story flag.

**Approaches:** recover and tune the displaced bell; tow the crew home and let their engine answer the fourth interval; leave the socket empty and restore the light path so future crews can arrive safely. The sound changes only when the corresponding physical state changes. Silence by choice is a valid conclusion, not a secretly unfinished objective.

**Outcomes:** a tuned court with a changed pattern; a rescued crew answering the silence; a repaired approach and deliberately empty place; or a broken resonator that can be salvaged and rebuilt. No peaceful route summons mandatory attackers to supply excitement. If the player causes harm, individual survivors can still accept rescue; a faction hostility value must not make saving them mechanically impossible.

**Return evidence:** the actual sound and visible bell pattern, BELLHOP's revised tuning route, waiting or returned visitors, the lit approach and a line from Lise that names the choice without instructing the player what to feel. Captions and visible motion preserve every essential cue when audio is muted.

**Local toy:** a tuned resonator cluster that makes specific impulse and collision relationships legible. It can brace, scatter or redirect nearby loose bodies within its implemented rules. It cannot solve every district merely because the text calls it ancient.

**Two indexed smaller stories:** **A Light They Can Find** (`lw_phoebe_home_signal`) establishes a route that other ships use: deliver cells, tow a repair ship through the dark or install a recovered resonator as an alternate signal. **The Bell You Carry** (`lw_phoebe_bell_weapon`) makes one tuned cluster available through service, salvage or theft. It remains the same object; a stolen cluster leaves a missing voice until someone delivers a real replacement. Resonance is material-specific, never a universal stun command.

#### Optional later extension: the Quiet Engine

**Retained proposal, outside the twenty-four indexed opportunities and not a first-admission dependency.** After Fourth Toll works as an ordinary refuge, a later commission may develop a separate adjacent **Quiet Engine**: a decommissioned emergency impulse driver caught in a crystal cradle. It once displaced a refuge convoy out of a killing lane and never completed its release cycle. Its sustained load holds a small outer anchorage in a useful arrangement. It is not a renamed Shard Sphere, Struck Bell or existing shrine owner.

Lise's congregation interprets restraint as mercy. A guild mechanic calls it a stuck governor. Both keep the machinery supplied. When it drifts, a future physical job can ask the player to brace the path, move occupied modules, then repair the governor or release it under control. A thief can want the same governor for a field rig. Any release must move the real bodies; no dialogue option teleports occupants to safety. Successful evacuation can permit an entirely changed harbor, while a botched theft creates rescue and rebuilding.

This provides the owner's desired combination of an extraordinary landmark, local belief and useful dangerous machinery without copying the bomb-town example literally. It requires its own approved site/asset identity and physical contract before implementation. The current package makes no claim that this machine exists.

## 4. The first hour: teach the player to inhabit a place

These times are editorial targets for a new pilot, **not wall-clock triggers or deadlines**. The authored events are admitted through actual progress, location and readiness. A slow pilot gets the same coherent opportunity. An expert can skip the invitations and fly. The main experiment is whether a player can describe what three people were doing and predict one consequence without reading a codex.

| Approximate play time | What the player sees and does | The place changes | What must remain optional |
|---|---|---|---|
| 0–2 minutes | Leave Bay 7, read actual controls, encounter Nessa's loose cradle across a visible service lane | A moved cradle clears the worker's route; a worker thanks the action after it happens | Helping; stopping to hear the whole line; inspecting the manifest |
| 2–6 | Fly the short Lantern Ward loop: commuter launch, market water tender, memorial, white Tower beyond | The district continues its watch with or without help | A lore tour, combat or three separate tutorial panels |
| 6–12 | Begin the supported 47-A opening work and follow the freight spine out of town; a patrol and a working salvor establish normal traffic | The exact carried mass and convoy bodies exist before the disruption | Copying an NPC's exact flight line; waiting through a full watch |
| 12–20 | Encounter the Skim with clear disparity, an escape route and recoverable debris; choose survival, resistance, rescue or pursuit within the real mechanics | Only actual losses become wrecks; a surviving escort remains alive; recorded mass shows what was taken | Deliberately losing a rigged tug-of-war; shooting a neutral body to progress |
| 20–27 | Return or dock on the next supported leg; the missing or recovered cargo has a truthful outcome; one practical way to earn, repair or recover appears | A rescued launch can moor at the ward; repaired service stays repaired | Hearing the plot before returning to ordinary work |
| 27–42 | Take a short legal run to Tethys via the existing connection, or remain local; see the Switchyard's crossing and Scale 4 | The delivered object goes to a visible receiver; the scale discrepancy has a physical comparison | Side mission acceptance; theft; proceeding to a second sector |
| 42–60 | Follow the Ceres route to the Cathedral edge, or work the city; glimpse the Nine-Mouth interior and a load that is too large for the starter ship | A small delivery completes and exposes a larger attainable problem | Entering the cave, buying a ship, fighting a swarm or seeing all flagship content |

The teaching sequence is **notice → try → understand → choose → return**. The first screen must contain ordinary purpose before drama. The first meaningful consequence should fit inside one view: a cleared lane, a reconnected lamp, a tow arriving. Large plot consequences are earned after the player trusts those small ones.

### An opening written for movement

The following is an authored scene treatment, not a cutscene transcript to play over locked controls:

> The cradle catches one foot against the service rail. Nessa's launch pulls, backs off and pulls again. A ferry waits behind her. Its passengers are visible as small interior silhouettes, not floating heads above the ship.
>
> Nessa: “Cradle's hung up. Tow eye's on your side.”
>
> If the player frees it, the cradle turns. Nessa catches the other end, brings it into its receiver and the ferry slips past.
>
> Ferry pilot: “There we go.”
>
> If the player ignores it, Nessa calls a tug after the existing service delay. The world solves an ordinary problem slowly. If the player breaks the cradle, the ferry reverses to the alternate lane and Nessa calls the hull number she actually saw.

There is no reward stinger for every considerate act. A real wage, relationship or route change can settle through existing owners where appropriate. Small actions can simply receive a perceptible answer.

## 5. THE WEIGHT, played through THE OPEN REACH

### The campaign's question

**What do you do when the machine that keeps people alive is also the machine that owns them?**

Wren's professional thread remains Contract 47-A, the missing recycler, the 12.4-tonne discrepancy and the bureaucracy of REF 44-C. His personal thread remains the 3.1 kg fragment, Callum, Lida and coordinates he cannot yet interpret. The alien origin does not explain away human exploitation. No final monster is secretly responsible for years of ordinary decisions.

The new world thread makes both stories physical. Gates close. Cargo backs up. A garden loses feed. A refuge needs a working route. A military tender becomes desirable because of what it can do to that route. The same machine can seize a town's freight or hold its bridge steady. The player builds relationships by deciding where the mass goes.

The finale resolves the player's standing and a set of local obligations. It does not cure history, answer every mystery or disable sandbox play. Wren can learn that he was used without the game insisting he remain powerless after learning it.

### Book 0 — Cold Start: the world before the harm

**Existing anchor:** Helios/Bay 7, the sample, 47-A, the Skim, 12.4 t and the withheld payment. **New emphasis:** the convoy belongs to a port the player has just watched working.

One escort previously yielded to the commuter launch. One freighter carries a lamp bracket identical to the ward's broken one. These are small connective details, not exposition. When the unknown black-Line hull comes, the player's priority is intelligible: retain cargo, keep someone alive, or get clear. The thief acts with a goal and a physical exit route. It does not perform a victory animation while invulnerable.

The reference path loses the sample and leaves recoverable wreckage. Alternative successful intervention records different surviving bodies, recovered fractions and evidence. The campaign can converge on **a fraudulent demand over the disputed shipment** without demanding an exact fabricated casualty list. Any changes to live B0 completion and reward conditions require the campaign owner's implementation packet; a prose amendment is not enough.

**Continuing reason to play:** the port offers honest paid work and one route to investigate the difference. The player is poor enough to want a wage, not trapped into one mandatory five-step errand.

### Book 1 — Honest Work: learn to read what is carried

**Existing anchor:** Tethys alloy run, Kessler's Scale 4, Ceres infested hauler. **New emphasis:** the fraud lives inside a city with real destinations.

Scale 4's discrepancy is now legible against ordinary work. A fair load is weighed first. The questionable load behaves differently. The player can compare mass with the Line and preserve the actual object or measurement. Kessler is neither a vending machine for clues nor an automatic combat target. His shift continues; he has a daughter and a reason to fear losing it.

The infested hauler remains a teaching problem: clear or contain what the player can handle; notice the much larger living thing inside; decide whether to tow dangerous material through a public route. The furnace's receiver is a real destination. Afterward the stripped shell has a use at the yard.

**District connection:** The Wrong Address can be experienced here but is not compulsory. Helping Hundred Windows gives the player a later shelter and material stake in trade disruption. Refusing it preserves a playable B1.

### Book 2 — First Blood: a bad order is not a bad fact

**Existing anchor:** Charon, Rook, Elroy, the Compost Run, the Nest. **New emphasis:** contracts label threats; physical evidence can contradict them.

Rook's first ordinary bounty demonstrates a genuine danger and a valid resolution. The second order against Elroy carries a missing or inconsistent field. Elroy's transport carries recognizable medical or recycler equipment; its flight behavior and offered surrender are evidence a careful player can act on. The contract issuer's hostile classification is clearly attributed. It must not overwrite the pilot's verified sensor facts.

The player can kill, disable and tow, warn and escort, demand an inspection, or let the target escape. The existing fatal branch remains grim and consequential. Its established lines belong to that branch. If Elroy survives, he is frightened, difficult and useful; he does not instantly explain the conspiracy. If he escapes without trusting Wren, the next clue comes from the abandoned order and a maintenance record. If the evidence is destroyed, another source exists at a cost or with less certainty.

**No compulsory guilt:** narration says what happened. “They were carrying medicine” is valid when their actual cargo proves it. “You killed him” is never emitted for a successful rescue. A false accusation from Rook is a hostile claim the player can contest.

**District connection:** Green Debt turns the pile of wrecks into a question about living people and containment. The same player who was reckless in combat can do careful salvage afterward. Their rescue does not cancel a death, but it still saves someone.

### Book 3 — Bigger Boat: power comes with dimensions

**Existing anchor:** Vesta, Slate, VARIANCE ADJUSTMENT, the faulty seam, first Gate Audit. **New emphasis:** a heavier hull lets the player solve a place differently.

The ship is acquired through the existing progression path; ownership and resources remain honest. The flawed seam has an inspectable maintenance history, a structural cue and a supported repair path. Deliberately stressing it can be a risk. A numbered invisible curse that breaks the hull on the fourth dramatic moment is not acceptable.

The first Gate Audit closes or restricts the Kepler connection through a physical platform. Workers are stranded on opposite sides. The player can attack the platform, delay its installation, secure a temporary appeal, help residents relocate or establish a longer service route. The Directorate's policy remains active, but the district's outcome is not predetermined. A bypass the player built remains a route until a later, observable action changes it.

**District connection:** The Ninth Mouth demonstrates the new hull's usefulness and limits. The large tow that once seemed impossible can now move, while the narrow service throat may require the starter hull. Progression increases choice instead of deleting smaller ships from play.

### Book 4 — Pick a Side: same object, different obligations

**Existing anchor:** `traders`, `patrol`, `free` branches; Tethys, Io and Dione; the second Gate Audit. **New emphasis:** three institutions want different outcomes for one threatened relief movement.

The shared situation is a loaded convoy bound for the Io homesteads. A planned gate restriction can strand it. Meridian wants the freight delivered under its title. Concord wants an inspected, defensible lane. The Free Captains want modules at the settlement even if the approved route closes. Each branch offers a distinct physical plan through the same world:

| Branch ID | Main operation | Specific benefit | Specific obligation |
|---|---|---|---|
| `traders` | Recouple and escort the freight spine, then negotiate or physically reach the named receiver | Reliable supplies and access to better couplers | Protect a carrier whose contract can exclude residents without payment |
| `patrol` | Hold the inspection corridor, investigate the false-flag pack, preserve a lawful relief opening | Safer public travel and access to requisitioned heavy equipment | Defend a process that others can exploit; disobeying a bad order has a named superior |
| `free` | Tow habitat and service modules through a secondary route, then hold the new berth against displacement | A real homestead and an alternative route | The settlement depends on maintenance and fuel someone must provide |

Borrowed Authority can support any branch, but its theft is not required for the main plot. A legitimate requisition, hired tug, portable anchor or slower route must remain viable. Counterplay comes from the player's plan, not from knowing which side quest the designer secretly required.

The doubled civilian contract remains optional and plainly identified. No aim tremor, input sabotage or other bodily punishment is imposed as an automatic moral sermon. If a character's disability or stress is represented, it follows an explicit accessibility-respecting mechanic, not a surprise penalty for a narrative choice.

### Book 5 — The Reunion: a private betrayal in a public place

**Existing anchor:** Callum's booth at Ceres, Cade Haltred, Pallas Reading Room, evidence locker. **New emphasis:** the meeting happens during a normal day the player can disturb.

Callum is not waiting in a boss room. He trades in a busy market court while a work crew moves a real large load behind the booth. He recognizes Wren, then attempts to keep the conversation inside a transaction. The important clue changes custody physically; the player can secure it, lose it in a chase, buy a copy or follow the thief. A copied clue is information, not a duplicate payout object.

Cade arrives by a known route. The player can settle the legitimate part of the claim, expose its fabricated part, hide Callum, hand him over, intimidate the collectors or fight. Civilians flee through actual lanes. The large load, couplings and shelter roofs shape the encounter. Breaking the market leaves a damaged market, not a clean scene after the boss music.

At Pallas, the Archive's price is an existing truth about the player or a piece of evidence they possess. It cannot demand a secret they never discovered. Funeral Freight can supply a relationship or route useful here, but the Reading Room has other approaches. Evidence may be published, sold, copied, concealed or destroyed. Those outcomes have distinct future witnesses.

### Book 6 — The Empire Seed: build somewhere someone can live

**Existing anchor:** physically assembled outpost, Dione/Inspector Dree, Voss's map and Shaft 7 Hive-hulk. **New emphasis:** the player's home becomes a place in the region's network.

A useful home requires dock, power, shelter and a supported service route. Modules are towed, seated and made operational. Tamsin can help plan the wall and later work in the place; she is not a crew bonus that disappears into a stat panel. A garden planter, repaired service tender or saved boat from earlier districts gives the home a history. None is a mandatory collectible set.

The first crisis is caused by a traceable dependency: interrupted feed, a hostile claimant, a damaged power line or a Bloom path along an unprocessed wreck. It must not be a punishment automatically spawned because the player built something. Successful preparation changes the crisis. The attack director does not secretly disable defenses so the story can proceed.

Voss's Shaft 7 can remain a dangerous discovery. If the player finds and rescues Voss before the fatal event, he lives; the map still exists and his interests become a complication. If he dies, the map changes hands through the supported estate/salvage path. A key NPC is not an unkillable quest token and not a mandatory corpse.

The Hive-hulk is an interior operation with distinct routes, severable coupling nodes, removable plates and retreat pockets. Its wreck can feed a garden, build defenses or become a site people exploit. The player does not “finish the dungeon” and leave every material consequence behind.

### Book 7 — The Deep Reach: move what the history was hiding

**Existing anchor:** Ashfall, the Long Field, Iron Maw, Witness and coordinates. **New emphasis:** the finale is a set of decisions about the same populated structure, not a silent ending room after an unrelated boss.

The Last Relief operation opens the Maw physically. The player chooses how much risk to take for cargo, evidence, residents and salvage. Earlier relationships can supply a tow partner, alternate berth, safe passage or replacement power unit, with the required objects and actors actually present. They do not collapse into a “friends earned” multiplier.

The Witness shows that Wren's identity was used before 47-A. The evidence also shows who authorized the original harm. Wren's fragment and unfamiliar coordinates remain separate from the recycler crime. The player can understand the local crime without decoding the ancient universe.

The concluding action determines custody of evidence, local route authority and the player's role. It also leaves an operational problem for the continued game: a bypass to maintain, a relief corridor to protect, a legal office to answer for, an archive to distribute, or a paid circuit to fly. The world has an after because it had a before.

## 6. Five endings with material consequences

**Proposed amendment, not current behavior.** Preserve A–E identifiers and the main institutional identities. Preserve historical casualties, irreversible losses and any old save's earned outcomes. Remove the older requirement that every material improvement must be null. The tragedy already happened; an ending need not repeat it to remain serious.

| Ending | Player's final physical act | New position | What can improve | What remains compromised | Continuing play |
|---|---|---|---|---|---|
| **A — The Clean Uniform** | Deliver evidence to an accountable Concord office and hold a real relief convoy through the lane it authorizes | A licensed auxiliary with influence over one corridor | A named route stops double-fining relief freight; seizure records become contestable | Clearance is narrow, political and revocable through future events; abusive contracts still exist elsewhere | Protect the corridor, refuse or comply with specific orders, expose allies, acquire heavy equipment legally |
| **B — The Same Silence** | Establish the physical covert route, move the ledger copy and retire the public transponder through supported identity custody | A deniable coordinator who still flies | Stranded districts receive goods the official network excludes | Routes can be sold; open civic accountability is harder; private beneficiaries demand favors | Keep a hidden network supplied, rescue exposed runners, decide whom to admit |
| **C — The Loop** | Make the anomalous jump, return to a known port and choose what work to repeat with changed knowledge | A pilot who declines institutional closure | Previously repaired places and saved people remain real; the returned pilot can try another local path | The personal mystery is unresolved; no escape from consequences | Optional replay/continuation with explicit rules; no automatic destruction of district history or duplicate rewards |
| **D — The Ledger Continues** | Carry the record to multiple physical relays and choose which pages to expose or withhold | A witness with a distribution network | Specific seizures can be reversed, claimants find evidence and some gate policy is challenged | Publication endangers sources and gives rivals usable intelligence | Protect witnesses, recover stolen copies, repair the costs of disclosure; player remains a pilot, not a desk-bound observer |
| **E — The Next Run** | Complete an ordinary three-port relief circuit with cargo that actually reaches its people | An independent working captain | A small supply network works; the 47-A claim can close under its supported settlement | The wage is modest and the next job still has risks; there is no universal pardon | Keep flying, build home, take legal or illegal jobs, accept or refuse the next contract |

The final words need not explain the moral. Show the returned launch, the opened street, the missing neighbor and the newly patched roof. The player's route through known places is the epilogue.

**Pit air and the Slow Gray:** original exposure and deaths are not undone. “The historical injury cannot be reversed” and “a working filter cannot improve one living block” are different claims. Keep the first; reject the second. Any new live air index must distinguish historical harm, current local service and the scope of a measurement. Never make a global meter rise merely because a garden in another sector was fed.

**A sample last image:** Sump sweeps the same bay. A service launch the player saved arrives through the new branch. He pauses to let it pass. It takes him three seconds. His job continues. So does the world. The point is the three seconds are different because the player was there.

## 7. Other sectors: a wider world without twenty-five unrelated games

The eight flagships receive the deepest composition first. The remaining regions have specific identities and links. These are compact briefs for later area work, not a demand to add seventeen new self-contained mission frameworks. Reuse existing wonders, residents and jobs; develop the route between them.

| Sector | Place and ordinary life | Local opportunity | Connection and return |
|---|---|---|---|
| **Vesta Forge** | Furnace Crown; slag terraces; crews shelter behind plates between hot pours; Slate's repair row | Catch and redirect a loose hot ladle; buy, repair or steal a thermal shield plate | Machinery made here appears in Tethys/Helios; a disrupted pour changes the next real shipment |
| **Hyperion Cut** | The long luminous cut becomes a canyon with working ledges and blind bends | Ride a work convoy safely or take a fast wall-side sling; recover a fallen cutter | The cleared or blocked ledge changes which crews can reach a seam |
| **Rhea Cinder** | Black crust, orange fissures, TALLYHO's impromptu crowd around a safe test pit | Move the scoreboard to attract a legitimate match or steal the crowd's attention as cover | The crowd travels by finite arrivals; a fight leaves useful wrecks and objections |
| **Nereid Shoal** | Ice floes, low sun, soft shaded freight passages and scale pads | Carry ice under moving shade; tilt a reflector or use a large hull as cover | Actual sublimation changes mass and payment; shade infrastructure makes a repeat route better |
| **Io Reach** | Flag Station, homesteads tethered around a shared tank, DOCKET seeking delivery | Raise a wall, repair the shared tank, reroute a household before the gate closes | Flags change by control; homesteads and their residents persist under a new flag |
| **Kepler Scar** | Capsized station still trades; entrances sit on the old underside; RECEIPT tries to orient signs | Bring a market module through the awkward service approach | A reopened berth gives stranded traders a place to return; orientation stays a navigational trait |
| **Sker Haven** | Trophy Wall, yard homes, a no-guns ring and Pitborn workshops; BOUNCER enforces one comprehensible rule | Steal back a named trophy plate; challenge Clatter; learn an industrial weapon in a live yard | Reputation depends on the local act, not blanket “all pirates like theft”; plate removal is visible |
| **Haumea Rift** | Blue Throat, enormous ice arches, HOLDFAST carrying a structural load | Share the load while a damaged anchoring spur is replaced; carry sound-making cargo through brittle ice | The working route changes with the restored anchor; not every cracking sound is a timed death trap |
| **Veil Nebula** | Instrument curtains, quiet work platforms, Vael suppression gear, Lostcalls in dead pockets | Move a sensor arm to triangulate a hidden vessel or steal a portable suppression instrument | Instruments suppress a bounded local field; they do not make the entire faction immune |
| **Orcus Shadow** | Broken Shepherd circles an empty center; Archive reading room on a sheltered rib | Reunite its debris flock or follow a displaced fragment to the absent object | Repaired flock geometry becomes cover/navigation; the Archive can price what the player found |
| **Triton Wake** | The permanent trail becomes an elongated roadside world of survey floats and intermittent shelters | Follow QUILL across the wake while its data copies attract pursuit | An established shelter or published copy changes the next passage |
| **Eunomia Gulf** | License Board above a second Understory garden; GRAVEDIGGER sorts wrecks by a rule no one likes | Recover a claimant's identifying section before composting the rest | Claim resolution and feed are separate; a rescued hull does not also count as consumed mass |
| **Sedna Dark** | A very large night with rare local pools of honest light; LAMPLIGHTER has a route | Restore a chain of buoys and establish safe refueling through real supply | The Lit Path is visible because the player built and supplied it; quiet space remains quiet |
| **Eris Margin** | Margin Fence, watch platforms and transient runner shelters | Learn the sweep window, move a fence segment or carry someone across under observation | An alarm changes a specific local patrol route; it does not give all factions instant knowledge |
| **Nyx March** | The Hush, evidence-cleaning docks, MOP erasing a real trail | Choose which evidence to preserve before a cleanup; find a ship by its wake rather than tag | A cleaned scene loses certain clues, not the causal history; other witnesses may remain |
| **Proteus Well** | A debris funnel beside a tucked-in den; workers use asymmetric currents to move heavy lots | Redirect a salvage lot into a safe eddy, dive for a specific fragment, expose an unsafe tug route | Findings return to the existing den and residents; they do not spawn a second quest hub |
| **The Bolus** | The carrier's existing lumen, swallowed rib and biological architecture | Preserve and deepen its current interior route, secretion hazards and recoverable cargo | The Bolus is the advanced alien interior; the Nine-Mouth Cut teaches the same camera/traversal grammar earlier |

The macro map should have spatial argument: clean core, productive belt, contested arteries, inhabited wreck margins, tidal gardens, distant ruin. Travel changes the density and kind of activity. Five minutes of open dark can be valuable after a crowded town if the destination is worth reaching. Empty space becomes monotonous when it is the only composition.

**Integration note at `985cb31`:** Eris's physical Sweep Window adapter and Eunomia's expanded
Gravedigger claim/vigil ledger landed during this writing. Their existing actors, physical crossing,
settlements and persistence are the starting point for those two supporting-sector briefs.
LW-13 expands their surroundings and connections; it does not replace either with a parallel mission.

## 8. Culture, voices and recurring life

### Different places value different competent acts

The military respects controlled force, recovered crew and honest identification. The yard respects clean cuts, useful mass and not blocking the work. The Switchyard respects predictable movement and properly handed-over freight. The Quiet respects discretion, fulfilled local promises and leaving a route usable. The gardens respect careful separation and feeding without contaminating inhabited space. The Fourth Toll respects attention and deliberate motion.

This is not six new reputation bars. Existing relationships and incident facts should supply the response where possible. A person can trust the player's towing and distrust their shooting. A public faction standing can coexist with a private debt.

### New supporting cast

These are **proposed named residents**, distinct from existing canonical faces. Do not generate a full dialogue tree for each. Give each one an observed routine, a dependency, an interruption response and two or three well-placed lines. Their roles must be supported by actual jobs.

| Resident | What they do | A contradiction | Working line | Return line with a real condition |
|---|---|---|---|---|
| **Nessa Venn** | Repairs Lantern Ward lamps and cradle fittings | Distrusts ceremony; keeps every ceremony lit | “Tow eye's on your side.” | After successful berth repair: “They came through last watch. Three launches.” |
| **Chief Omi Tern** | Maintains Niner's patrol craft | Loves the navy; will refuse its unsafe launch order | “Drive's open. It stays open.” | After returned tender: “You bent the collar. You brought it back.” |
| **Paz Dowel** | Carries local parcels and medicine through Tethys | Cuts every navigational corner; never fakes a delivery | “Window on the left. They can't reach the main dock.” | After confirmed clinic delivery: “Cold cabinet's full. First time this watch.” |
| **Aunt Tor** | Runs Nine-Mouth ventilation and rescues stuck crews | Complains about outsiders; carries spare air for them | “Hear that? Fan's pulling against a shut throat.” | After partial rescue: “Crew's home. Cutter's still in there.” |
| **Fen Tallow** | Restores identities on salvaged Pallas hulls | Earns money hiding ships; refuses to erase a live distress identity | “That number's still answering.” | After clearing a claimant: “Paint's yours. Underneath is still theirs.” |
| **Ava Doss** | Pilots the salvage hearse | Thinks sale value keeps the family alive | “Dead captain. Live tow. Give us room.” | After safe ferry arrival with engine intact: “Same hull. Better berth. Captain would hate the view.” |
| **Iri Doss** | Handles the hearse's couplings and cargo | Sees history in every wreck; still strips them for wages | “Someone's still using those cabins.” | After medicine delivery: “Clinic took the lot. Families kept their rooms.” |
| **Dara Vetch** | Keeps a dry-side nursery and clean ventilation | Defends cultivated alien life; burns infected ducts without hesitation | “Roots on that side. Air on this one.” | After street restored: “First leaves opened this morning.” |

Avoid the same rhythm for all voices. Nessa is practical and patient. Tern is procedural but concrete. Paz runs out of breath. Tor hears machinery before she speaks. Fen is sparse. Ava is decisive; Iri qualifies. Dara speaks in care instructions. Their language should make sense spoken over a motor, not only read in an essay.

### Rituals that occupy the world

Lantern Ward's procession moves through the lanes it can actually traverse. Niner's watch change involves crew launches, handover at a service berth and a finite relief flight. Tethys' market relocation is a row of shop barges being towed to a new shadow as the hot side turns. Ceres crews touch an old beam before a dangerous cut; the beam is worn where hands and tools reach it. Pallas opens a returned ship's nameplate before breaking the hull. Charon leaves a small unconsumed fragment in a memorial bed. Phoebe allows three strikes and one silence. Ashfall residents open shutters for a daily star glimpse along a specific plate seam.

Most of these are not quests. They are normality. They create readable interruptions: the procession cannot pass because a ship is blocking its turn; a watch changes late because a repair is not done; a star glimpse disappears because the player left a huge plate across the seam. A small action can mean something because an ordinary custom was already there.

### Ambient story grammar

Every authored ambient loop should answer four questions in its source or packet: **What is the task? Where did the object come from? What ends the task? What happens if interrupted?** A welding animation without a workpiece or a miner beam without extraction is not automatically life. It may be appropriate distant dressing, but it cannot masquerade as an interruptible job.

Do not make every routine a crisis. Some crews finish. Some merchants deliver exactly what they promised. Some pilgrims go home. Humor often belongs in the physical timing: a maintenance robot moves an unauthorized stool out of the lane, a worker waits until it turns away and puts it back. A fleet can be formidable without every soldier announcing a slogan.

## 9. The scope needed for depth

This is a focused world, not an attempt to match the square kilometers or raw asset count of a large studio's open world. The production target is comparable **local credibility and freedom of action** in the places the player actually encounters. The following is an authored scope target, not a market statistic or an assertion about completed content:

| Layer | Complete target | Why it earns its cost |
|---|---|---|
| Flagship geography | 8 districts, each with 3–5 connected subplaces, multiple routes and a recognizable boundary | Enough contrast for return journeys without diluting authorship across every chart cell |
| Continuous life | 3–5 supported work/routine chains per flagship, shared across characters where sensible | More useful than dozens of unrelated orbiting NPCs |
| Major district stories | The 8 named missions above, each with lawful, illicit and physical alternatives where appropriate | Each demonstrates the district's special affordance and leaves visible states |
| Small local stories | The 16 compact stories above, expanded only where they create a real new situation | Everyday stakes, humor and surprising discoveries between major events |
| Main narrative | Existing B0–B7 reshaped through these places, with truthful alternatives and A–E outcome projections | An authored spine without scripting away sandbox agency |
| Regional texture | The 17 smaller place briefs, developed by reusing existing wonders/cast/jobs | The wider map supports the flagship world rather than competing with it |
| Continuing game | Repair, custody, service and relationship outcomes plus existing faction/Cull/Orphaned Shift content | Replay comes from changed situations and new capabilities, not infinite quest copies |

The older expansion's roughly twenty-hour main-route ambition remains a planning estimate. Do not add this document's eight stories as eight compulsory detours on top of it. Fold a district story into a Book where it serves that Book; leave the others optional. A satisfying first 90-minute region is a better production checkpoint than twenty-five newly named empty sectors.

Depth is earned when a player revisits a known street and has a different plan because of what they learned, obtained or broke. It is not measured by the number of codex pages, dialogue lines, mission flags or generated meshes.

## 10. How to turn this bible into playable content without losing it

### What a district implementation must contain

Each flagship needs an ordinary route that can be flown without accepting anything; a recognizable skyline/ground composition; useful services; residents visibly finishing ordinary jobs; at least one discoverable physical toy; a supported chaotic intervention; a reason to come back; and a recovery path if the player damages it. The environment brief owns detailed dimensions, sockets, camera transitions, collision and models. The systems brief owns scheduling, state and incidents. Neither replaces the authored scene.

The eight primary mission IDs remain the cross-document references. Each mission records actual causal facts through the existing owning systems. Content agents may not settle an outcome because a timer expired, the player entered a volume, a progress bar filled, or the dialogue said the work occurred when the physical work did not occur. A timed action is valid only when timing is itself the action and its preconditions remain true.

### Five acceptance scenarios per district

1. **Observe:** enter naturally without accepting a job. Identify the landmark, work, danger and safe route. A code catalog alone cannot establish this pass.
2. **Cooperate:** complete a normal transaction and the district's main physical work. Confirm source, transit, receiver and lasting effect.
3. **Interfere:** steal, block, attack or redirect something the system actually supports. Confirm witness knowledge, finite responders, reactions and an escape route.
4. **Fail and recover:** lose cargo, damage a tool or leave halfway. Return and solve the transformed problem; no duplicate reward, vanished victim or unwarranted reset.
5. **Return:** leave the region, save/load through the production save envelope, and return on another watch. The important people, owned objects, repaired geometry and damage agree with the prior outcome.

These are agent-run acceptance scenarios, not requests for the owner to playtest before work can continue. A focused test establishes its own claims; a visual or usability claim needs actual player-route evidence. An inability to run one form of evidence must be disclosed rather than replaced by a fabricated pass.

### Failure modes to reject during review

| Weak implementation | Why it misses the request | Required correction |
|---|---|---|
| Eight new sector names and eight palette variants | Places still have the same geometry and behavior | Build different routes, masses, work, laws and useful objects |
| “Citizens” randomly circling a hub | Nothing begins, transfers or finishes | Give jobs concrete sources, destinations and interruption responses |
| A fortress populated only after accepting its raid | The world exists for the mission | Maintain the roster, berths and work before any invitation |
| A stolen ship awarded to inventory after a cutscene | The tank-stealing fantasy never happens | Transfer control/custody of the actual defended hull and escape with it |
| A gigantic decorative sphere at the edge of the screen | Scale is stated, not experienced | Make a surface, trench or interior occupy several consecutive views |
| A camera snap plus a dark overlay called a cave | Navigation and occlusion are unchanged | Author actual enclosing geometry, clearance and safe camera transitions |
| A repaired place resets because the quest is repeatable | The world forgets the player's work | Repeat a new incident against the changed state, never undo the settled one silently |
| Everyone condemns the player regardless of action | The world is narratively omniscient and mechanically dishonest | Derive response from actual acts, witnesses, evidence and uncertainty |
| Lore explains all the inhabitants' lives in a menu | The flight view is still empty | Put a small portion of those lives in motion at the default camera |
| Everything is a fraud joke | The tone becomes as uniform as the starfield | Add work pride, family ritual, generosity, sincere faith, ordinary irritation and physical comedy |
| A beautiful scene has no safe lane or gameplay reads | Visual density has displaced agency | Recompose without deleting its identity; silhouette and traffic rules must carry the route |
| A generated asset or existing GLB is declared done because it loads | A valid file can still look wrong or have unusable scale | Judge its intended job at the actual gameplay camera and through the actual passage |

## 11. Canon amendments and save compatibility

### Narrow amendments authorized by the new direction

The older THE WEIGHT bible explicitly froze story outcomes. This new user commission permits changing the story and asks for a reactive world where player agency matters. The amendments below are therefore deliberate future direction. They are not a claim that the existing runtime or canonical files have already been migrated.

| Prior constraint or ambiguity | New rule | Integration boundary |
|---|---|---|
| `build_map.md` §34 row 522 and expansion §06: Pit air only worsens; player action never improves air | Original harm/deaths persist; specific working services can improve the living districts they actually serve | Distinguish historical injury, local service and measured air; update the old completion criterion when the relevant runtime lands |
| Row 536 / `THE-WORLD-AFTER.md`: every ending leaves material life unchanged | A–E preserve their institutional meaning but project real district consequences | Keep ending IDs and existing saved outcomes; implement projections through current owners |
| B0 exact mandatory losses; B2 mandatory murder; future Voss death irrespective of intervention | Authored reference paths remain, but confirmed action determines survival and custody | Campaign progression must accept honest alternatives and migrate missing evidence safely |
| Gate Audit closes named gates regardless of an effective intervention | Policy attempts remain Kepler/Io/Eris; delaying, contesting, bypassing and locally defeating an operation can produce durable access | Gate state, access rights and alternative physical routes are separate facts; no invented graph edge without travel support |
| Main plot can force the player to sign/accept again after a choice | The next offer appears; acceptance remains a player action | Endings do not write an unperformed crime or silently accept a new contract |
| Iron Maw is simultaneously a dreadnought and killed Deep-Mother | One accreted district with retained human keel, corpse chamber and growth archive | Preserve boss/vault identities and already-settled flags; new surface is adjoining geometry |
| Cathedral lore can imply replacing the current Wreck Cathedral | Existing saved wreck plus adjacent Nine-Mouth ore mass within one district | Preserve world-site identity and operations; no double-spawn or state reuse |

Vale remains an off-frame administrative presence. Vethari remain off-frame. Wren's personal mystery is unresolved. The 3.1 kg fragment and established 47-A quantities retain their meanings. Existing named losses are not resurrected in old saves. No agent should treat “current user permits story changes” as authority to discard every distinctive part of the existing world.

### Migration rules

Keep an additive narrative revision for newly admitted story variations. Never reset `beatIndex`, current branch, ending identity, current ship title, settled cargo or existing world-site operations merely to make a new opening run. An old save that killed Elroy keeps that outcome; a new version may allow an unstarted Elroy incident to resolve nonlethally. If old data does not establish a survivor's location or an object's custody, mark that uncertainty and use a supported follow-up; do not invent a reward or quietly claim the object was delivered.

New district IDs are references to spatial/narrative groups, not replacements for sector IDs. Content receipts must not become a second authority for money, inventory, damage or faction standing. A record such as `clinic_lot_delivered` is valid only after the receiver confirms custody. Records used for return dialogue should point to their actual causes and remain bounded.

World persistence needs a truthful distinction between a named person's survival, their current representation and their narrative role. A story role can pass to another worker when an existing person dies. That new worker has a new identity and a reason to inherit the job. They do not impersonate the dead person or erase the player's consequences.

### Creative freeze for downstream agents

The eight district names/IDs, eight mission IDs, their stable sector mappings, the COUNTERSIGN concept and the narrow amendments above are this package's common vocabulary. The asset and systems packets may refine dimensions, counts and mechanics when source/performance evidence requires it. They may not replace “a visible, stealable ship” with a menu reward, “inhabited streets” with random props, or “changed place” with a log entry and call the same outcome done.

The eight new supporting residents are proposals. Before creating production IDs, search the complete character catalog for name collisions and place each in one authoritative registry. Use the existing portraits/voice pipeline where appropriate. Do not create a second instance of Lusk, Rook, Kessler or an Orphaned Shift machine merely because two district briefs mention them.

## 12. Source trail

These sources ground the retained setting and existing implementation seams. The creative district details and revised outcomes above are authored in this document; citations do not imply those additions already exist.

- [Owner's existing vision](../../VISION.md): ordinary work, physical agency, places with verbs and a world that remembers.
- [GDD](../../GDD_2_0.md): 2.5D simulation, one personally flown ship, physical readability and information hierarchy.
- [THE WEIGHT index](../../expansion/00_README.md), [existing campaign script](../../expansion/06_CAMPAIGN_SCRIPT.md), [mission library](../../expansion/07_MISSIONS_AND_ENCOUNTERS.md): prior creative plan and retained content.
- [Sector definitions](../../../src/data/sectors.js), [sector ways of life](../../../src/data/sectorWayOfLife.js), [activity pockets](../../../src/data/sectorActivityPockets.js), [causal chains](../../../src/data/sectorCausalChains.js): live IDs, compositions and behavior data inspected for this brief.
- [Station life](../../../src/data/stationLife.js), [world calendar](../../../src/data/worldCalendar.js): existing shift and presentation owners.
- [World-site manifests](../../../src/data/worldSiteManifests.js), [sector wonder manifests](../../../src/data/sectorWonders.js): saved physical work roots to retain.
- [Canonical wonders](../../../docs/worldbuilding/sheets/worlds/sector-wonders.md), [canonical residents](../../../docs/worldbuilding/story/NPCs-CANONICAL.md), [canonical factions](../../../docs/worldbuilding/orgs/factions-CANONICAL.md), [Bloom families](../../../docs/worldbuilding/sheets/species/bloom.md): retained names and world logic.
- [Story structure](../../../docs/worldbuilding/story/STORY-STRUCTURE.md), [storyline](../../../docs/worldbuilding/story/THE-STORYLINE.md), [campaign event register](../../../docs/worldbuilding/story/CAMPAIGN-EVENTS.md), [prior post-ending constraints](../../../docs/worldbuilding/story/THE-WORLD-AFTER.md): existing narrative, with the precise amendments identified above.
- [Campaign data](../../../src/story/campaign47a/campaignData.js), [story ownership rules](../../../src/story/AGENTS.md), [ship catalog](../../../src/data/ships.js): stable identities, writers and reusable hull families.
