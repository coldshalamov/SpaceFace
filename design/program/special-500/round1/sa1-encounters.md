# Special-500 Round 1 — Subagent 1: Encounters & Missions lens (200 proposals)

Lens owner: encounters, one-off missions, comms events, anomalies reachable through the
encounter director / mission board seams. Ids SP1-001…SP1-200. All triggers are
determinism-safe (state.simTime, state.rng, proximity, persistent gates — never wall time).
Sector ids verified against src/data/sectors.js. Gate vocabulary verified against
src/systems/encounterDirector.js `_gatesPass` (sectorIds, uniqueOnce, blockAfterOutcome,
requiresCompletedShape, storyBeatMin, minSectorTier, minCargoValue, bountyOnly, maxSecurity,
minSecurity, claimsOnly, namedPool, requiredPoiDiscovered, moralDebtOnly, requiredTech).

---

## A. Reach & pirate culture

### SP1-001 — The Manifest Weigh-In
- Kind: encounter
- Where: sector_io_reach, ambush_lane / trade_lane
- Trigger: toll-script variant; gates minCargoValue 400, maxSecurity 0.5, cooldownS 600
- The player sees: A Reach weighmaster cutter locks alongside and demands a live manifest audit — "your hold says 40 units, your mass says 53." The discrepancy is the tithe: they name the delta, not a credit number.
- Payoff: Pay in the named commodity (cargo jettison, physical) or credits; receipts note the weighmaster's name for later encounters.
- Build seam: new numbered file src/data/encounters/600-weigh-in.js on script 'toll' via src/data/encounters.js index; receipt row added to ENCOUNTER_RECEIPTS
- Effort: data

### SP1-002 — The Wreck Court
- Kind: encounter
- Where: any sector, derelict_field
- Trigger: proximity to a fresh aftermathWreck while a Reach pack loiters; cooldownS 1800
- The player sees: Two scavenger crews and a Reach arbiter orbit a fresh wreck, beacon-banners out. The arbiter hails the player as a "disinterested hull" and asks them to witness a claim: which crew reached the wreck first, judged by who has a line attached right now.
- Payoff: Witnessing honestly earns Reach respect and a finder's fee; lying (vouching against the visible line) marks your transponder in their ledger for SP1-003.
- Build seam: numbered file src/data/encounters/ with script 'selfRegistered', small runtime reading state.combat.attachments (pattern of 1210-the-deadweight.js) via src/systems/crSituationKit.js
- Effort: data+glue

### SP1-003 — The Debt Finds You
- Kind: encounter
- Where: any sector
- Trigger: gates.requiresCompletedShape on a toll/whisper shape whose recorded outcome was 'escaped' (priorOutcome story.depthProgramEncounters), fires next sector day
- The player sees: Days after you ran a toll, a lean interceptor shadows you for a full minute before hailing: "Wake-bearer. The lane you skipped still counts its interest." It quotes your own escape vector back at you.
- Payoff: Settle the original toll plus interest (credits) or fight a motivated, stat-boosted collector; settling permanently clears the flag.
- Build seam: numbered file with gates.requiresCompletedShape + blockAfterOutcome reading story.depthProgramEncounters (src/systems/crSituationKit.js priorOutcome)
- Effort: data+glue

### SP1-004 — The Prize Auction
- Kind: encounter
- Where: sector_pallas_drift, outlaw_zone
- Trigger: proximity; Reach pack with a captured hauler in tow; gates minSectorTier 2, cooldownS 2400
- The player sees: Raiders have a mule hauler lashed in a mine-ring and are auctioning its manifest over open band: "Lot one, forty units refined, going once." The hauler's crew is still transmitting mayday under the noise.
- Payoff: Bid by jettisoning credits (physical choice), blow the ring open to free the hauler (rep with faction_mts/scn), or ignore; the hauler's crew remembers.
- Build seam: numbered file script 'selfRegistered' with mine props (mines.mineCorridorLayout precedent, 325-minefield-wake.js) + open-band barks via d.say
- Effort: data+glue

### SP1-005 — The Sheepdog
- Kind: encounter
- Where: sector_io_reach, ambush_lane
- Trigger: ambush script variant; fires only after an ambush already sprang in the same sector that day (requiresCompletedShape)
- The player sees: Just as a second Reach pack springs, an older pirate hull cuts in from the flank and fights them off — then hails: "That's my patch. You fly it again, you pay me, not them." A protection racket with a face.
- Payoff: Refuse and both packs hunt you next pass; pay and the sheepdog genuinely intervenes in future ambushes in that sector (persisted flag).
- Build seam: numbered file script 'selfRegistered' keyed off state.story.flags['sheepdog_paid']; ambush script reuse in src/systems/encounterScripts.js
- Effort: bespoke

### SP1-006 — The Gang Wire
- Kind: easter-egg
- Where: sector_sker_haven, outlaw_zone
- Trigger: first proximity to a specific derelict_field relay rock; uniqueOnce
- The player sees: A jury-rigged antenna mast on a rock plays a scratchy pirate station: pack heraldry read out like sports scores, which toll lanes are "hot", and a weather report for ambushes ("cloudy with a chance of you").
- Payoff: Pure flavor plus a codex page on Reach pack culture; the "hot lanes" list is real seeded schedule data, honestly readable.
- Build seam: numbered ambient encounter (script 'selfRegistered', noCombat) + codex page row in src/data/codexPages.js
- Effort: data+glue

### SP1-007 — The Ransom Buoy
- Kind: comms-event
- Where: sector_pallas_drift, trade_lane
- Trigger: sim-time window (sector day 3+ of a run), proximity to a roadside buoy; cooldownS 86400
- The player sees: A buoy transmits a rolling list of "captains of interest" — dry, official Reach bookkeeping: names, unpaid tithes, interest accrued. One entry matches a callsign you met earlier this run.
- Payoff: Lore; if the listed captain is later encountered, they are visibly poorer and angrier (level/escort delta), making the world feel connected.
- Build seam: numbered file script 'whisper' variant with barks table; list generated from the run's actual encounter history (d.stream seeded pick)
- Effort: data+glue

### SP1-008 — The Captain's tow
- Kind: visual-setpiece
- Where: sector_sker_haven, derelict_field
- Trigger: fires the sector day after a named pirate captain was killed in that sector (priorOutcome check on named_hunter)
- The player sees: A Reach pack tows a casket-rigged hull — the dead captain's ship — in slow column toward the sector's star, engines dim, one wasp peeling off every hundred WU like a gun salute. They do not attack anyone during the tow.
- Payoff: Pure spectacle + a receipt: "REACH BURIAL — {name} takes the long burn." Attacking it has real reputation consequences with every Reach pack.
- Build seam: numbered file script 'selfRegistered' checking priorOutcome of named hunter kills; column motion exists in src/systems/vignetteInterpreter.js MOTIONS
- Effort: data+glue

### SP1-009 — Toll War
- Kind: encounter
- Where: sector_io_reach, ambush_lane
- Trigger: two toll shapes scheduled same lane, same sector day (planner collision made deliberate); gates minSectorTier 2
- The player sees: Two rival packs have claimed the same lane and are arguing about it with mass drivers when you arrive. Both demand you pay the OTHER one's toll to pass through their fight.
- Payoff: Pay one side and slip through the brawl; side with either pack (escort for the day) for a cut of the other's toll; the lane stays contested for days.
- Build seam: two numbered files on script 'toll' with a shared state.story.flags['toll_war_sector'] key; both scripted in src/systems/encounterScripts.js toll handler
- Effort: data+glue

### SP1-010 — The Honest Fence
- Kind: encounter
- Where: sector_charon_expanse, outlaw_zone
- Trigger: gates.bountyOnly (player has a bounty), cooldownS 3600
- The player sees: A Quiet-registered broker hails with a ledger and offers the dullest service in the lawless belt: she re-registers stolen goods into clean paperwork, for a percentage, and is scrupulously polite about it.
- Payoff: Selling hot cargo at 70% value with zero rep damage vs. dumping it; her receipt is a physical stamped chit hulls can later scan.
- Build seam: numbered file script 'selfRegistered' with cargo commodityMoralTags read (src/data/commodityMoralTags.js) + d.grant/charge intents
- Effort: data+glue

### SP1-011 — The Muster
- Kind: visual-setpiece
- Where: sector_ashfall_reach, outlaw_zone
- Trigger: fires once per seeded sector week at a fixed rock; proximity; cooldownS 86400
- The player sees: Forty wasp swarmers drilling in silent formation grids around a dead carrier hull, reliefs cycling through a breach every thirty seconds — a pirate fleet doing PT. Nobody hails you. They are busy.
- Payoff: Pure spectacle; scanning the carrier yields a codex entry on how Reach packs actually work (mostly logistics).
- Build seam: numbered ambient encounter (tier 'ambient', deck 'civilian', noCombat) spawning a large cheap wasp grid via d.spawnShips
- Effort: data+glue

### SP1-012 — The Maroon
- Kind: encounter
- Where: sector_pallas_drift, any derelict_field
- Trigger: proximity to a lone escape pod at seeded offset; uniqueOnce per sector; cooldownS 86400
- The player sees: A pod with one survivor: a pirate the pack marooned for skimming. "They left me the air I'd stolen. That's Reach arithmetic." He'll trade the pack's next ambush plan for a ride to anywhere with a bar.
- Payoff: Ferry him (he rides as a latchable pod) for a future-ambush forewarning flag and bar gossip; or leave him; or hand him to a passing pack (Reach rep).
- Build seam: numbered file script 'selfRegistered' with a pod prop the player tows (tetherable: true, as 1210's beacon); barks table in the file
- Effort: data+glue

### SP1-013 — The Parley Chit
- Kind: comms-event
- Where: sector_io_reach, trade_lane
- Trigger: after the player has escaped (not killed) three pirate encounters in a sector (story flag counter)
- The player sees: A Reach voice you've run from three times finally hails: "You're expensive to chase. Cheaper to talk." They offer to sell the bearing of their rival pack's stash — for you, not for them, if you keep their name out of it.
- Payoff: A one-time stash cache (rich, guarded by the rival) that exists only because you kept running.
- Build seam: story flag counter incremented in encounterScripts.js toll/ambush escape receipts; stash spawns as numbered encounter with gates.requiresCompletedShape
- Effort: data+glue

### SP1-014 — The Wrecking Permit
- Kind: easter-egg
- Where: sector_pallas_drift, station_reach dock
- Trigger: dock interaction after ≥1 salvager hostile encounter; uniqueOnce
- The player sees: A booth at the Reach dock sells laminated "salvage licenses" — obvious forgeries that nonetheless make scavenger packs hail you with "Permit holder" respect before standing down.
- Payoff: One cheap purchase flips scavenger first-contact hostility in outlaw zones (persisted flag); Concord patrols scan it and add a fine line item.
- Build seam: dock offer in src/data/missions.js AUTHORED_SET_PIECES-adjacent authored offer; flag read by scavenger spawn context in encounterScripts.js — DIRTY file, prefer flag read in a new numbered encounter file instead
- Effort: data+glue

## B. Lawful / customs / Concord bureaucracy

### SP1-015 — The Mass Discrepancy
- Kind: encounter
- Where: sector_ceres_belt, border_checkpoint
- Trigger: patrolScan variant; gates minCargoValue 200; unique mass-vs-manifest mismatch computed from real hold
- The player sees: Customs holds you at the scan ring: "Declared mass and measured mass disagree by 12 units. Resolve the difference or I resolve it for you." Your actual smuggled/undeclared crates are named.
- Payoff: Jettison the discrepancy (physical, honest), declare it (fine), or run (transponder flag). If you genuinely carry nothing illegal, the scan finds nothing and the examiner is embarrassed.
- Build seam: numbered file script 'patrolScan' with custom gates reading cargo mass vs manifest; src/data/encounters/321-the-customs-logic-puzzle.js is the family precedent
- Effort: data

### SP1-016 — The Lane Priority Bond
- Kind: oneoff-mission
- Where: sector_helios_prime, station_helios
- Trigger: posted at station_helios after the player completes 3 deliveries (story flag); repeatable per sector-month
- The player sees: Concord sells "lane priority bonds" — pay a fee, and for the next sector-day patrol cutters actually wave you through scan rings while everyone else queues. The queue you skip is visibly resentful.
- Payoff: Time saved, one free scan waiver; refusing all bonds makes one particular customs officer remember your face (flavor barks).
- Build seam: authored offer in src/data/missions.js or a dock contract via missionSpawningOps.js — DIRTY files; fallback: numbered encounter posted by a Concord desk hull
- Effort: data+glue

### SP1-017 — The Weigh-Point Milestone
- Kind: comms-event
- Where: sector_helios_prime, poi_helios_tally
- Trigger: proximity to the Helios Weigh-Point beacon at lifetime tonnage thresholds (1k/10k/100k units hauled)
- The player sees: The old weigh-point beacon finally has something to say after all these passes: "Lifetime registered mass: 10,043 units. The lane notes the number. Keep the wheels turning."
- Payoff: Dry milestone receipts at three thresholds; the 100k line is signed by a stationmaster who retired decades ago.
- Build seam: numbered ambient encounter reading cumulative cargo stats from state; barks in src/data/encounters.js ENCOUNTER_BARKS
- Effort: data+glue

### SP1-018 — The Sworn Scan
- Kind: oneoff-mission
- Where: sector_tethys_junction, border_checkpoint
- Trigger: patrol scan completes clean for the 5th time in a sector (story flag); offered on the spot
- The player sees: The customs officer who has scanned you five times without finding anything deputizes you mid-lane: "You're clean, you're regular, and I'm short-staffed. Ride with this convoy and read three hulls for me."
- Payoff: A scan-three-hulls escort leg; finding real contraband pays a bonus and a Concord contact; finding nothing still pays — he suspected as much.
- Build seam: authored set-piece row in src/data/missions.js SET_PIECE_MISSIONS pattern (recon_scan stage over convoy hulls) — DIRTY file; fallback: numbered selfRegistered encounter
- Effort: data+glue

### SP1-019 — The Runner at the Ring
- Kind: encounter
- Where: sector_tethys_junction, border_checkpoint
- Trigger: proximity during any customs scan hold; cooldownS 1200
- The player sees: While you're held for scan, a smuggler blows through the checkpoint at full burn with two cutters peeling after. The examiner's voice goes flat: "Hold position. This is now a pursuit corridor."
- Payoff: Block the runner with your hull ( Concord rep, contraband reward), wave him through (Quiet thanks, flag), or ignore. The pursuit is real AI, not choreography.
- Build seam: numbered file script 'selfRegistered' spawning a chase via vignetteInterpreter chase motion; concord pursuit reuses patrol doctrine (src/ai/doctrine.js)
- Effort: data+glue

### SP1-020 — The Impound Auction
- Kind: oneoff-mission
- Where: sector_vesta_forge, station yard
- Trigger: posted when state has ≥1 impounded/confiscated hull record; uniqueOnce per hull
- The player sees: The impound yard auctions a confiscated smuggler's ship at 40% book value — payment due on delivery, and delivery means towing her out yourself past three claimant-hulls who also got the notice.
- Payoff: A real ship (sellable or keepable), a race against claimants, and an entry in the yard's ledger that other NPCs reference.
- Build seam: wreck/tow mission in src/data/wreckMissions.js WRECK_MISSIONS pattern + tow_recovery type from MISSION_TYPES; hull spawns as disabled entity (1210 pattern)
- Effort: data+glue

### SP1-021 — The Transponder That Isn't Yours
- Kind: oneoff-mission
- Where: sector_tethys_junction, patrol_corridor
- Trigger: patrolScan reads a stale registry collision (seeded, rare, uniqueOnce)
- The player sees: A patrol scan flags YOUR hull for a hijacking committed two years ago by a ship whose registry number now collides with yours after a clerical reform. "The record doesn't care what you say. It cares what it says."
- Payoff: A three-leg paper trail (station records office, the actual wreck of the old hijacker, a notarized scan) that ends with the record corrected — and a codex page on registry reform nobody asked for.
- Build seam: authored chain in SET_PIECE_MISSIONS pattern (three commonStages, no branch); wreck leg reuses uniqueWreck rumor→bearing→scan (src/systems/uniqueWrecks.js)
- Effort: data+glue

### SP1-022 — The Amnesty Burn
- Kind: oneoff-mission
- Where: sector_ceres_belt → sector_helios_prime
- Trigger: posted at Ceres when player bounty > 0; sim-time window announced on the band (state.simTime based)
- The player sees: "CONCORD NOTICE: transponder amnesty window open six hours." Every hunter in the belt got the same notice and reads it as 'open season while they're lined up for the desk.' The run to the amnesty desk is the event.
- Payoff: Reach the desk inside the window: bounty cleared at a discount, hunters paid off, one hunter who followed you the whole way respects you afterward (named-hunter state).
- Build seam: numbered encounter + bountyHunters.js hunter spawn table (src/data/bountyHunters.js); window on state.simTime; settlement via d.rep intents
- Effort: data+glue

### SP1-023 — The Checkpoint Cat
- Kind: easter-egg
- Where: sector_helios_prime, border_checkpoint
- Trigger: proximity to any Concord scan ring after 10+ scans (persistent counter); cooldownS 86400
- The player sees: A maintenance drone has adopted the checkpoint. It perches on the scan-ring emitter, follows the examiner's cutter around like a duckling, and is officially logged as "equipment, morale." The examiner denies it in writing.
- Payoff: Pure flavor, one codex entry; the drone appears at every Concord checkpoint you visit from then on (persistent flag).
- Build seam: numbered ambient encounter (noCombat, visual prop only) + story flag; codex row in src/data/codexPages.js
- Effort: data

### SP1-024 — The Clock Trap
- Kind: encounter
- Where: sector_vesta_forge, trade_lane
- Trigger: cruise engaged on a marked lane with a seeded patrol timing window; cooldownS 1800
- The player sees: You drop out of cruise into a pre-laid speed trap — three cutters in a box formation, radar trip-lines strung between them (AMBUSH_SIGNATURES 'sensor_tripline' made physical). "Mass and velocity logged. Courtesy notice issued."
- Payoff: A fine issued to your account (collectable at any dock), or a chase if you bolt; the notice is a real item that lowers prices at Concord docks by nothing and is fun to have.
- Build seam: numbered file script 'ambush' variant with customs_cutter archetypes; ambush signature vocabulary from src/data/ambushSignatures.js
- Effort: data

### SP1-025 — Chain of Custody
- Kind: oneoff-mission
- Where: sector_tethys_junction → sector_helios_prime
- Trigger: posted after the player witnesses any raider attack on a convoy (witnessed-price precedent, 1207-the-witnessed-price.js)
- The player sees: Concord hands you a sealed evidence pod — a black box from a raid they prosecuted — to carry to Coalition HQ. The Reach wants it destroyed quietly, the Quiet wants it copied, and both send very polite people to explain this at the refuel stop.
- Payoff: Deliver intact: Concord rep + the trial's outcome shows up in the news wire a week later (real consequence chain). Every fork is remembered.
- Build seam: authored escort/fragile-cargo mission (src/data/missions.js fragileCargo patterns — DIRTY; fallback numbered encounter with a custody pod prop), news via publishSituationNews (src/systems/crSituationKit.js)
- Effort: data+glue

### SP1-026 — The Mole's Handoff
- Kind: encounter
- Where: sector_tethys_junction, border_checkpoint
- Trigger: whisper-class rare; gates maxSecurity 0.7; uniqueOnce
- The player sees: At the edge of scan range, a customs cutter drifts alongside a Quiet ghost hull for exactly forty seconds, says nothing on any band, then both leave. If scanned at the right moment, the cutter's cargo hold reads as empty and its mass doesn't.
- Payoff: Reporting it (Concord rep, the mole vanishes) or selling the observation to the ghost (a stolen scan schedule: patrols literally avoid you for a day — real seeded schedule change).
- Build seam: numbered file script 'whisper' with scan tell (DIST_TELL_R pattern in encounterScripts.js); schedule change via story flag read by patrol planner
- Effort: bespoke

### SP1-027 — The Registry That Forgot to Die
- Kind: anomaly
- Where: sector_helios_prime, patrol_corridor
- Trigger: proximity to a derelict relay on the starter lane; uniqueOnce
- The player sees: A Concord relay wreck from before the sector was charted still auto-files every ship that passes — including yours — into a log nobody collects. The filings are oddly kind: "Vessel observed maintaining lane discipline. Noted with approval."
- Payoff: One free "clean transponder" stamp (a one-time shield against a future fine) for anyone who bothers to read the whole log; codex entry.
- Build seam: numbered ambient encounter + state.story.flags['relay_stamp'] consumed by patrol_scan fine logic in encounterScripts.js
- Effort: data+glue

### SP1-028 — The Warden Drill
- Kind: world-oneoff
- Where: sector_io_reach, border_checkpoint
- Trigger: fixed sim-time cadence (every sector day at a seeded offset, 120s closure)
- The player sees: Vael runs lane-closure drills: the checkpoint shuts, ALL traffic queues in a visible holding pattern, wardens walk the line hull-to-hull, and the whole thing reopens with zero ceremony. Locals just... wait. You can queue or cut through the mine-marker lane at your own risk.
- Payoff: Queuing politely builds tiny Vael rep over visits (persisted count); cutting through is free until it isn't.
- Build seam: numbered ambient encounter with scheduled fire (planner sim-time window); queue behavior via vignetteInterpreter 'hold'/'ring' motions
- Effort: data+glue

## C. Salvage culture

### SP1-029 — The First-Rights Picket
- Kind: encounter
- Where: sector_ceres_belt, derelict_field
- Trigger: proximity to fresh aftermathWreck while a scavenger crew is present; cooldownS 2400
- The player sees: Scavengers have thrown a physical picket around a fresh wreck — five beacon-banners in a ring and one old hull parked nose-in like a dog on a bone. The banner codes read, honestly, "FIRST LINE HOLDS."
- Payoff: Cross the picket and they fight (they are worse armed than they act); wait 60 seconds and the lead shares a third of the salvage pool as a finds-fee for patience; come back next day and the wreck is cleanly stripped.
- Build seam: numbered file script 'claimThreat' variant (the script already adjudicates claim contests) via src/systems/encounterScripts.js
- Effort: data

### SP1-030 — The Insurance Hull
- Kind: oneoff-mission
- Where: sector_vesta_forge, refinery_approach
- Trigger: posted after the player scans a hauler whose damage pattern reads as deliberate (seeded, uniqueOnce)
- The player sees: A hauler is positioning itself to scuttle on a refinery's sensor blind spot — venting arranged just so, distress beacon conveniently dead. The crew is bad at crime and knows it. "You see nothing, we owe you a favor."
- Payoff: Let it happen and collect the favor (a real one, spent later); report it (insurance rep, they hate you); or tow them to the refinery yourself mid-act, which nobody has a rule for.
- Build seam: numbered selfRegistered encounter reading hull damage state; favor stored as state.story.flags entry; refinery reaction via news:publish
- Effort: data+glue

### SP1-031 — The Keel Bell
- Kind: encounter
- Where: sector_ceres_belt, ceres shipbreak yard
- Trigger: proximity during any yard cut event; cooldownS 600
- The player sees: When the yard's cutters free a keel section, an actual bell tolls over the band — and the section falls. Anyone with a line on it before it hits the catcher-net gets first refusal on the scrap. Yard hands bet on which hull catches it.
- Payoff: Catch the keel: a heavy bonus scrap payout and the yard crew's respect (chalk mark on the tally board, see SP1-040).
- Build seam: numbered ambient encounter hooking the shipbreak event (src/data/ceresShipbreak.js) with a latch-competition check (attachments read)
- Effort: bespoke

### SP1-032 — The Dead Man's Manifest
- Kind: oneoff-mission
- Where: sector_pallas_drift, derelict_field
- Trigger: salvage_signal find with a seeded manifest twist; uniqueOnce
- The player sees: A black box lists a cargo the ship never delivered — four pods jettisoned at four different bearings "so at least someone gets paid." The bearings are real, spread across the sector, and not all pods survived.
- Payoff: Four-site scavenge chain with seeded outcomes (one pod crushed, one already claimed, one full, one full of something else entirely); total payout beats a delivery contract if you finish it.
- Build seam: numbered encounter chain via salvage_signal script + follow-on stubs (followOnStub pattern in src/systems/encounterScripts.js)
- Effort: data+glue

### SP1-033 — The Vulture Ring
- Kind: encounter
- Where: any sector, derelict_field
- Trigger: proximity to a hull with hull &lt; 15% and no crew aboard; cooldownS 3600
- The player sees: Six scavenger hulls orbit a dying ship at a respectful, patient distance — nobody fires, everyone waits. One hails you: "Rule's simple. It pops, we split. You want in, you hold station. You want the whole thing, that's a different conversation."
- Payoff: Join the ring (share), kill the ship early (they scatter, you own the wreck but the belt remembers), or defend the dying ship (a stranger's life for rep everywhere).
- Build seam: numbered file script 'selfRegistered' with vulture motion (vignetteInterpreter MOTIONS has 'vulture'); outcome flags persist
- Effort: data+glue

### SP1-034 — The Tailings Sift
- Kind: visual-setpiece
- Where: sector_vesta_forge, refinery_approach
- Trigger: ambient schedule while near the refinery intake; cooldownS 1800
- The player sees: The refinery periodically burps a slow fan of glowing tailings out a vent. A formation of tiny scoop drones pours through the fan in choreographed passes, and yard hands narrate the "catch of the shift" like a sports broadcast on a local channel.
- Payoff: Pure ambience; if the player scoops a tailing pod themselves before the drones, the broadcast names their hull, deadpan.
- Build seam: numbered ambient encounter + scoop competition check; broadcast via bandRadio/barkDirector seams (src/systems/barkDirector.js)
- Effort: data+glue

### SP1-035 — The Jumped Seam
- Kind: encounter
- Where: sector_ceres_belt, mining_belt
- Trigger: gates.claimsOnly (player owns a claim in-sector); fires while actively mining the claimed body
- The player sees: Mid-cut, a jackal hull screams past and slaps a rival claim beacon onto YOUR asteroid with a harpoon. "Registered before yours expired. Check the paperwork. Oh — you can't. I have it."
- Payoff: Physically pull their beacon out (tug-of-war with their line), pay them off, or let it ride and fight a claim-defense (claim_threat script already handles the war).
- Build seam: numbered file on script 'claimThreat' with beacon-as-prop and attachments tug logic; claims read via state.claims (director _gatesPass claimsOnly precedent)
- Effort: data+glue

### SP1-036 — The Old Web
- Kind: anomaly
- Where: sector_charon_expanse, derelict_field
- Trigger: proximity; uniqueOnce
- The player sees: A dozen wrecks from different decades are still lashed together by dead tethers that never rotted — a physical web hanging in the dark. Cutting one line shifts load visibly to the others; some groan. One strand is not dead.
- Payoff: Methodical cutting nets five wrecks' salvage; cutting wrong drops a whole cluster on you; the live strand belongs to something still home (a resident, see SP1-084).
- Build seam: numbered selfRegistered encounter with pre-latched attachment bodies (state.combat.attachments seeding precedent from 1210)
- Effort: bespoke

### SP1-037 — The Executor Arrives
- Kind: encounter
- Where: sector_pallas_drift, derelict_field
- Trigger: mid-loot timing — fires 40s after the player strips a wreck with a "family" flag (seeded); uniqueOnce per wreck
- The player sees: Just as you crack a dead salvager's strongbox, a battered family hauler drops out of cruise: "That was my father's hull. Take the credits. The logbook stays." They are not hostile. They are just early.
- Payoff: Hand over the logbook (their story continues — a letter reaches you two sectors later), refuse (they leave, and the wreck's plaque when you pass it again says something colder), or fight them (bounty, real).
- Build seam: numbered selfRegistered encounter with timing trigger on loot events; letter delivery via comms:popup pattern (src/data/narrative.js event style)
- Effort: data+glue

### SP1-038 — The Slag Diver
- Kind: encounter
- Where: sector_ashfall_reach, radiation_field
- Trigger: proximity to a radiation pocket rim; cooldownS 86400; gates minSectorTier 3
- The player sees: A local legend does something insane on purpose: dives her scow into a radiation storm to skim a half-molten cache before the vent window closes. Her route is visible — bloom-lit, smoking, exactly survivable if you fly it perfectly.
- Payoff: Follow her line and claim the second cache (she keeps the first, and toasts you at the bar); fail and she tows YOUR hull out, adding the debt to the same ledger.
- Build seam: numbered selfRegistered encounter with a fixed seeded waypoint line + hazard window (uniqueWrecks timingGate precedent, src/data/uniqueWrecks.js)
- Effort: bespoke

### SP1-039 — The Prop Wreck
- Kind: encounter
- Where: sector_charon_expanse, ambush_lane
- Trigger: salvage_signal whose tell reads wrong (scan_tell_bait variant); cooldownS 2400
- The player sees: A wreck that scans perfectly dead — except one heat bloom where no engine should be, and the "hull breach" that's welded from inside. It's a nest. The wreck is crewed, the distress is pre-recorded, and you are already inside their mine envelope.
- Payoff: Spot the tell before the spring: leave clean with proof (sellable intel). Spring it: a close-quarters fight where the wreck itself is cover for both sides.
- Build seam: numbered file script 'distress' with custom scan_tell lines (ENCOUNTER_BARKS distress block precedent in src/data/encounters.js)
- Effort: data

### SP1-040 — The Tally Board
- Kind: world-oneoff
- Where: sector_ceres_belt, derelict_field
- Trigger: permanent fixture rock at a fixed sector-local coordinate; updates on visit
- The player sees: A hull plate bolted to the biggest rock in the field, chalked with the field's working scores: who stripped what, who caught the keel, who owes the yard. Your hull gets chalked on it the first time you do anything here — and it never washes off.
- Payoff: Persistent, visible, world memory in physical form; NPC scavengers reference the board's current standings in barks.
- Build seam: persistent prop registered like src/data/authoredPlaces.js zones; chalk state in state.story.flags; barks via encounterScripts ambient pool
- Effort: bespoke

### SP1-041 — The Two-Line Problem
- Kind: encounter
- Where: sector_vesta_forge, refinery_approach
- Trigger: proximity; fires when two NPC hulls hold lines on the same pod; cooldownS 1800
- The player sees: Two salvagers have both latched the same ore pod and are having a towing argument at 30 WU/s, screaming over the band about line seniority. The pod, notably, has opinions and is heading for a rock.
- Payoff: Cut one line (the loser hates you, the winner pays), catch the pod yourself (nobody pays, everyone respects), or watch physics settle it (the pod wins, both pay you as an independent witness).
- Build seam: numbered ambient encounter reading two active attachments on one target; resolution via existing attachment cut seam (src/combat/attachments.js)
- Effort: data+glue

### SP1-042 — The Story Broker
- Kind: comms-event
- Where: any station dock
- Trigger: dock event after any moral-tagged cargo sale (state flag on sale); cooldownS 86400
- The player sees: A Quiet broker finds you at the dock, not to buy goods: "You sold famine-grade ration packs to a resort station. That's a story. I'll buy the story. The resort never needs to know you know what you did."
- Payoff: Sell the story (credits, and the commodity's moral ledger stays clean — the Quiet owns the shame); refuse (the deed stays on YOUR ledger, visibly, in codex).
- Build seam: dock comms popup + commodityMoralTags read (src/data/commodityMoralTags.js); codex entry in src/data/codexPages.js
- Effort: data+glue

## D. Hauler, convoy & market life

### SP1-043 — The Drafter
- Kind: encounter
- Where: any sector, trade_lane
- Trigger: proximity behind any heavy hull at matched speed for 20s; cooldownS 1200
- The player sees: A mule hauler settles in 30 WU behind your wake and just... rides it, visibly saving burn. When you finally hail, the pilot is unashamed: "Your wake, my range. I'll take the next gate's toll for it." Everyone does this. Nobody admits it first.
- Payoff: Accept the toll trade (a small credit transfer, a named acquaintance added to the band); refuse and she peels off with dignity intact.
- Build seam: numbered ambient encounter with speed/position check; credit transfer via d.grant/d.charge; a well-known friendly NPC roster entry
- Effort: data+glue

### SP1-044 — The Corner
- Kind: oneoff-mission
- Where: sector_ceres_belt, station_ceres
- Trigger: posted when a seeded commodity price spike is scheduled; visible only 1 sector-day ahead
- The player sees: Three independent traders are all quietly buying the same commodity for the same reason — a refinery order due tomorrow. The board doesn't say this. The queue at the commodity exchange does.
- Payoff: Buy first and the three pay YOU to step aside; escort all three instead (they split, you're owed by a syndicate); or beat them to the refinery and sell into the spike yourself.
- Build seam: authored mission via economyContracts seams (src/systems/economyContracts.js) reading economyCycles schedule; DIRTY-adjacent, prefer numbered encounter with d.grant
- Effort: bespoke

### SP1-045 — The Reefer Handoff
- Kind: encounter
- Where: sector_vesta_forge, trade_lane
- Trigger: proximity to a hauler with a "failing container" state flag (seeded); cooldownS 3600
- The player sees: A hauler hails with something genuinely urgent: a volatile reefer is venting and she can't dock with it aboard. "Take it. Run it to the refinery in ten minutes. I'll pay the container's whole margin." The container is visibly frosting over.
- Payoff: A timed fragile-carry (fragileCargo seam); deliver and she becomes a recurring named hauler; fail and the venting makes a visible, harmless-but-humiliating ice cloud.
- Build seam: numbered selfRegistered encounter spawning a fragile prop pod; fragileCargo.js (src/systems/fragileCargo.js) patterns
- Effort: data+glue

### SP1-046 — The Extra Crate
- Kind: oneoff-mission
- Where: sector_tethys_junction, trade_lane
- Trigger: fires on a hauler whose cargo count exceeds manifest by exactly one (seeded); proximity; uniqueOnce
- The player sees: A panicky junior hauler has counted wrong and everyone knows it: forty crates on manifest, forty-one in the hold, and the extra one is humming. "It was on the dock. It had a shipping label. Labels mean it's mine. Right?"
- Payoff: Open it (a module, a stowaway, or a very lost pet drone — seeded), deliver it somewhere, or teach her the broker's trick: bill it as sentimental freight and dock it anyway.
- Build seam: numbered selfRegistered encounter with cargo inspection; three outcome props; module reward from src/data/modules.js
- Effort: data+glue

### SP1-047 — The Berth Queue
- Kind: visual-setpiece
- Where: sector_helios_prime, station_helios approach
- Trigger: fires when station traffic density exceeds a seeded threshold; ambient
- The player sees: Peak shift at Helios: a visible queue of six hulls holding pattern around the dock spine, a tug assigning berths with hand-signal light codes, two captains bickering over the band about who called the berth first ("I said 'mark' before he said 'dibs'").
- Payoff: Pure world-life; joining the queue politely is faster than cutting, which the traffic controller notes with approval for future visits.
- Build seam: numbered ambient encounter + vignetteInterpreter 'column'/'hold' motions; controller barks in ENCOUNTER_BARKS
- Effort: data+glue

### SP1-048 — The Mirror Hauler
- Kind: easter-egg
- Where: any sector, trade_lane
- Trigger: fires after the player completes 10+ trade runs (persistent counter); uniqueOnce
- The player sees: A hauler running your exact last route, buying what you bought, in a ship painted in colors one shade off yours. She hails, delighted and unembarrassed: "You're the only hull making money out here. I'm not proud. I'm solvent."
- Payoff: A recurring shadow NPC who copies your trading for the rest of the run; if you go broke, she goes broke, and blames you warmly.
- Build seam: numbered ambient encounter keyed to a story-flag counter that snapshots the player's last N transactions; persistent roster entry
- Effort: bespoke

### SP1-049 — The Futures Broker
- Kind: oneoff-mission
- Where: sector_ceres_belt, station_ceres
- Trigger: posted when a convoy carrying a specific commodity is scheduled through the sector
- The player sees: A broker offers paper on tomorrow's convoy: "That hull arrives full, price dips, you lose. It arrives empty, price spikes, you win. It arrives at all, that's your problem to arrange." The contract is a bet on a real scheduled convoy.
- Payoff: Escort the convoy (honest win), raid it (profit, wanted), or ignore it (the market moves without you, pillar 4). All three are visible in prices the next day.
- Build seam: numbered encounter + economy intents via economyCycles; convoy spawns via convoy script (encounterScripts.js)
- Effort: bespoke

### SP1-050 — The Narrow Gate
- Kind: world-oneoff
- Where: sector_charon_expanse, trade_lane
- Trigger: permanent fixture at a fixed choke; fires on approach with heavy cargo
- The player sees: A canyon gate between two massed rocks, marked "NO HULLS OVER 400 MASS." Locals have bolted a second, obviously older sign under it: "or unload honestly, we all did." Wide loads visibly shed trailers and ferry cargo through in two trips, grumbling.
- Payoff: A physical routing choice with real cost either way; the ferry trip is a legitimate local micro-economy you can work.
- Build seam: static zone fixture via authoredPlaces.js pattern + a numbered encounter keyed to player mass; ferry work as repeatable d.grant jobs
- Effort: bespoke

### SP1-051 — The Hot Potato
- Kind: encounter
- Where: sector_pallas_drift, trade_lane
- Trigger: proximity; three hulls flying a visible staggered relay; cooldownS 86400
- The player sees: Three ships pass one glowing crate between them in perfect rhythm — each handoff timed to look like routine traffic, all of it visible from above like a choreographed play. One of them is being followed and doesn't know it's you.
- Payoff: Catch the crate mid-relay (a real contraband prize), warn the pursued (Quiet rep), or shadow the whole relay to its endpoint (a drop cache).
- Build seam: numbered selfRegistered encounter with a passed prop pod; drop cache via beacons seam (src/systems/beacons.js)
- Effort: data+glue

### SP1-052 — The Merger Convoy
- Kind: visual-setpiece
- Where: sector_ceres_belt, trade_lane
- Trigger: two scheduled convoys converging at a seeded junction; once per seeded week
- The player sees: Two convoys meet at a lane junction, run lights-to-lights for a moment, merge into one column with the old leads falling in side by side, and the band plays a brief, formal exchange of freight manifests like a marriage register.
- Payoff: Pure spectacle with one honest mechanic: the merged convoy is 2x the loot for raiders and 2x the escort work — everyone on the band knows it, including them.
- Build seam: two 'convoy' script instances with a shared junction anchor; barks table in src/data/encounters.js
- Effort: data

### SP1-053 — Your Receipts, Read Aloud
- Kind: comms-event
- Where: sector_pallas_drift, any station dock
- Trigger: fires after 20+ market transactions; uniqueOnce; dock proximity
- The player sees: A data-broker has your purchase history and reads the three funniest entries over open band: "Sixty units of water ice, bought at panic prices, sold at panic prices, to the same station. Beautiful. Frame it."
- Payoff: Buy the transcript (it's a real codex page of your own stats, gently roasted) or shut him up (he sells it anyway; you hear it later from an NPC).
- Build seam: numbered dock encounter reading economy transaction history; codex page in src/data/codexPages.js
- Effort: data+glue

### SP1-054 — The Perishable Sprint
- Kind: oneoff-mission
- Where: sector_helios_prime, colony
- Trigger: posted when colony food stock hits a seeded low; visible to all, first-come
- The player sees: A colony's agri-dome had a blower failure. The station posts a produce run at triple rate, the produce visibly frosts as the clock runs, and every hull in the sector hears the same posting at the same moment.
- Payoff: Triple-rate delivery inside the window; the colony's stock levels (visible on the market) actually recover; latecomers sell at normal rate to a grateful-but-broke dome.
- Build seam: economyContracts delivery with a real decay on commodity state (economyCycles); DIRTY-adjacent files — fallback: numbered encounter with deadlineS
- Effort: bespoke

### SP1-055 — The Flare Reroute
- Kind: world-oneoff
- Where: sector_ashfall_reach, radiation_field
- Trigger: seeded solar-flare schedule closes the fast lane for one sector-day
- The player sees: The sector's fast lane shuts for a flare window and ALL traffic piles into the old slow route through the debris field — a visible, grumbling migration. Toll keepers relocate to the slow lane within minutes, because of course they do.
- Payoff: A day-long changed world: different ambushes, different prices at the far end (everything arrives late), and one unique cache visible only during the migration crush.
- Build seam: sim-time scheduled event flipping zone availability (sectorZones.js) + a one-day numbered encounter at the choke
- Effort: bespoke

### SP1-056 — The Paid Stamp
- Kind: world-oneoff
- Where: sector_io_reach, trade_lane
- Trigger: permanent toll fixture; state persists per player
- The player sees: The toll ring's scanner physically sprays a light-dust "PAID" stencil on your hull that other pilots can see for the rest of the day. Skippers nod as you pass. If you skip the toll, the stencil reads "SKIP" and everyone can see that too.
- Payoff: Social status as visible game state; "SKIP" marks attract exactly the attention you'd expect (hunters assume bounty, patrol assumes worth scanning).
- Build seam: numbered toll variant + a persistent hull decal via visualOverrides/story prop (src/render/visualOverrides.js) keyed to a story flag
- Effort: bespoke

## E. Mining, belt & industry

### SP1-057 — The Seam Singer
- Kind: encounter
- Where: sector_vesta_forge, mining_belt
- Trigger: proximity to a solo prospector mid-scan; cooldownS 3600
- The player sees: An old prospector "sings" — a slow tonal pulse from her rig that resonates off ore bodies differently than rock. "The belt lies to instruments. It never lies to a tuned throat." Following her song's echo leads to a vein her own gear can't crack alone.
- Payoff: A rich co-mining site: she cracks, you haul, split is honest. Her song becomes buyable as a rig tune (permanent survey buff, small).
- Build seam: numbered selfRegistered encounter with audio-cue prop; co-mining split via mining yield events; buff as a module or trait via src/data/modules.js
- Effort: bespoke

### SP1-058 — The Rodeo
- Kind: encounter
- Where: sector_ceres_belt, mining_belt
- Trigger: gates.claimsOnly; fires while player mines a claimed seam; cooldownS 86400
- The player sees: Claim-jumpers run a literal rodeo: they lasso loose boulders from your claim with masslines and drag them out of the beacon ring, whooping, scoring themselves. It's theft as sport and they want an audience.
- Payoff: Re-lasso your own rocks back (a tug-of-war minigame that's just the massline, honestly), shoot their lines, or out-score them by throwing bigger rocks than they do — they'll concede the seam with a tip of the hat.
- Build seam: numbered selfRegistered encounter with attachment tug logic; scoring on massline throw events (massline throw precedent in tow_recovery type)
- Effort: bespoke

### SP1-059 — The Bell Rock
- Kind: easter-egg
- Where: sector_charon_expanse, mining_belt
- Trigger: player mines any rock within 200 WU of the hollow bell rock; uniqueOnce
- The player sees: Your blast rings something enormous: the hollow asteroid next door tolls like a cathedral bell, audible across the belt, and every hull on the band goes quiet for a second. A prospector finally says: "It does that. We don't tell tourists."
- Payoff: The ring cracks a seam on the bell rock itself — a hidden interior cache; the bell re-rings (quietly) every time you pass for the rest of the save.
- Build seam: numbered ambient encounter keyed to mining events at proximity; cache as a lootShards spawn; persistent echo flag
- Effort: data+glue

### SP1-060 — The Prospector's Cairn
- Kind: easter-egg
- Where: sector_ashfall_reach, mining_belt
- Trigger: proximity to a fixed deep-belt coordinate; uniqueOnce
- The player sees: A cairn of forty marked rock samples, each hand-etched with assay numbers, planted over a grave that isn't there — just a suit, arranged sitting, facing the seam he found. The last sample is the richest rock anyone has ever assayed here. It is not for taking, and everyone seems to know it.
- Payoff: One free ultra-rich assay of the seam he faces (the location is the inheritance); taking the last sample is possible, weighted, and the belt remembers (barks change).
- Build seam: numbered ambient encounter + fixed prop cluster; moral flag read by later belt barks
- Effort: data+glue

### SP1-061 — The Ore Hound
- Kind: easter-egg
- Where: sector_ceres_belt, mining_belt
- Trigger: proximity to a derelict mining rig; uniqueOnce
- The player sees: A quadruped assay drone, twenty years past its warranty, still "hunting" — pointing rigidly at the nearest ore body every few minutes like a bird dog, waiting for a handler who retired. It follows anyone who scans it.
- Payoff: Adopt it: it parks on your hull and points at one hidden ore body per sector day (a real, bounded, deterministic hint). It cannot be repaired, only kept.
- Build seam: numbered ambient encounter + a persistent companion prop with a daily seeded pick from actual ore positions; codex entry
- Effort: bespoke

### SP1-062 — The Intake Ballet
- Kind: visual-setpiece
- Where: sector_vesta_forge, refinery_approach
- Trigger: ambient schedule at refinery shift change; cooldownS 3600
- The player sees: Shift change at the Forge refinery: eight ore barges perform the intake ballet — a slow spiral queue where each barge sheds exactly at the horn and the intake never stops moving. Off-key barges get corrected by tugs with visible, gentle shoves.
- Payoff: Ambience; flying the spiral correctly yourself (with or without cargo) earns a one-line acknowledgment from the intake tower that regulars recognize.
- Build seam: numbered ambient encounter + column/spiral motions (vignetteInterpreter); acknowledgment as persistent bark flag
- Effort: data+glue

### SP1-063 — The Shelf Drop
- Kind: encounter
- Where: sector_pallas_drift, mining_belt
- Trigger: fires while the player is mining inside a seeded unstable shelf zone; cooldownS 86400
- The player sees: Your latest crack rings hollow: the whole shelf face is detaching. A slow-motion cascade of house-sized rocks pours down the seam line — and one of the falling rocks flashes with a metallic seam everyone in the belt would call payable.
- Payoff: Catch the rich boulder on your line mid-fall (a one-in-a-run physics save) or dive clear; the shelf's collapse permanently reshapes that zone's rock layout (honest world change).
- Build seam: numbered selfRegistered encounter hooking mining events; asteroid reshuffle via asteroidMotion seams (src/data/asteroidMotion.js)
- Effort: bespoke

### SP1-064 — The Pulse Seam
- Kind: oneoff-mission
- Where: sector_veil_nebula, radiation_field
- Trigger: posted at a Veil station after the player survives one hazard pulse inside the field
- The player sees: A survey company posts the impossible job: the sector's richest seam sits inside a radiation pocket that pulses on a fixed clock. Every miner who tried mined between pulses and died between pulses. The clock is public. The rhythm is learnable.
- Payoff: Mine the seam on the pulse's timing (hold-and-dash loops); payout scales with purity; the company's gratitude is real and priced (module discount).
- Build seam: hazard-window mining contract (uniqueWrecks timingGate precedent, src/data/uniqueWrecks.js); reward via economyTerms
- Effort: data+glue

### SP1-065 — The Belt Strike
- Kind: oneoff-mission
- Where: sector_ceres_belt, mining_belt
- Trigger: fires when a seeded toll increase lands; uniqueOnce per toll change
- The player sees: Belt miners have downed tools over a new toll and are holding a physical picket line across the lane — beacons, banners, and a pot of the worst coffee in the belt. The company is hiring non-union haulers. Both sides post. The band is a mess.
- Payoff: Haul for the company (pay, miner resentment flags) or run supply through the picket for the union (rep, company resentment flags); either way prices and patrols visibly shift for days.
- Build seam: numbered encounter pair reading a shared story flag; consequences via faction rep intents (d.rep) and economy notes
- Effort: bespoke

### SP1-066 — The Assay War
- Kind: oneoff-mission
- Where: sector_vesta_forge, mining_belt
- Trigger: posted after the player scans any big rock (seeded rare); uniqueOnce
- The player sees: Two survey companies have assayed the same mountain-sized rock and disagree by a factor of ten. Both post contracts to have "an independent hull" scan it their way — and both have quietly armed their follow-up teams.
- Payoff: Scan honestly (the truth is a seeded number, released publicly, embarrassing someone), or take one side's money and their enemies; the rock's true value then persists on the starmap for everyone.
- Build seam: authored two-offer contract pair (missions.js SET_PIECE pattern, DIRTY — fallback numbered); survey result persisted to world.discovery
- Effort: data+glue

### SP1-067 — The Tailings Fire
- Kind: encounter
- Where: sector_ceres_belt, mining_belt
- Trigger: proximity to a miner camp after a seeded misfire event; cooldownS 86400
- The player sees: A volatile tailings heap has self-ignited next to a three-habitat camp and the camp's own tug is too small to move it. The burning pile is drifting — slowly, at walking pace — toward the habitats. You have maybe four minutes and one very useful massline.
- Payoff: Tow or shove the pile clear before it cooks the camp (physics rescue, triumphant); the camp's gratitude is a permanent dock discount and the best fuel in the belt.
- Build seam: numbered selfRegistered encounter with a burning prop on a real drift vector; fire prop via vfx-adjacent story props; rescue via massline physics
- Effort: bespoke

### SP1-068 — The Comet Road
- Kind: visual-setpiece
- Where: sector_charon_expanse, any approach lane
- Trigger: seeded comet perihelion window (sim-time schedule, announced on band)
- The player sees: For one day, ice haulers ride the comet's tail like a highway — the outgassing gives a visible, honest slipstream, and the whole industry moves a degree to follow it. "Comet road's open!" is the best news the belt has all season.
- Payoff: Riding the road is a real speed bonus on the marked lane; hauling during the window pays a premium; the road visibly closes behind the comet.
- Build seam: scheduled zone modifier + a numbered ambient encounter at the head of the road; speed effect via a local field (fields.js precedent, src/systems/fields.js)
- Effort: bespoke

## F. Distress, survival & rescue

### SP1-069 — The Air Auction
- Kind: encounter
- Where: sector_pallas_drift, any deep lane
- Trigger: proximity to a genuine distress with limited remaining life-support (seeded); cooldownS 86400
- The player sees: A stranded freighter with hours of air, and — arriving from the opposite bearing — a Reach "rescuer" who hails the victims first with a price list. The victims transmit both offers to you, in the clear, hoping market pressure helps them.
- Payoff: Outbid, outrun, or outfight; rescue without payment (faction-wide gratitude + a named family that writes later); let the Reach have it and hear about it in a bar for years.
- Build seam: numbered file script 'distress' with a second responder squad spawned by the same runtime; src/data/encounters/100-distress-call.js is the family base
- Effort: data+glue

### SP1-070 — The Relay Chain
- Kind: encounter
- Where: any sector
- Trigger: 2 sector-days after any completed rescue (priorOutcome on distress); uniqueOnce per chain
- The player sees: A mayday comes in, and the voice is one of the crew you saved last week — different ship, different sector, same luck. "I know. I KNOW. It's not a curse, it's a franchise. Please."
- Payoff: Second rescue earns a permanent crew discount from their employer (a real dock discount), and the radio traffic between rescues starts treating you as their personal roadside service.
- Build seam: numbered selfRegistered encounter with gates.requiresCompletedShape on distress outcome 'rescued'; roster memory via state.story.flags
- Effort: data+glue

### SP1-071 — The Warm Tow
- Kind: oneoff-mission
- Where: sector_tethys_junction → sector_helios_prime
- Trigger: posted when a seeded medical emergency spawns; visible on all boards
- The player sees: A stasis pod's heater is dead and the patient has cold hours, not days. The medical station's rule is immutable: pods travel warm. Your hull, running warm, latched to the pod, is the ambulance. The pod is fragile. The lane is not.
- Payoff: A tense no-combat tow where the threat is entirely physical (debris, tolls, your own line discipline); arrival pays and the patient's family names a berth after your hull.
- Build seam: authored tow/escort mission (tow_recovery type in MISSION_TYPES); pod temperature as a deadline proxy (deadlineS)
- Effort: data+glue

### SP1-072 — The Genuine Article
- Kind: encounter
- Where: sector_io_reach, ambush_lane
- Trigger: distress in a sector where the player has already escaped ≥2 bait distresses (persistent counter)
- The player sees: Another distress ping in the same belt that has burned you twice as bait. Everything about it scans wrong the same way. You'd be right to ignore it — and this once, buried under the same fake signature, there's a real crew that found an old decoy transmitter and is praying you're not as burned as you should be.
- Payoff: Scan past the tell (a second scan pulse, deliberately) to find the real heartbeat; rescue pays double in reputation because you risked it on a read.
- Build seam: numbered file script 'distress' with counter-gated tell lines; counter in story.flags
- Effort: data

### SP1-073 — The Ring of Hands
- Kind: visual-setpiece
- Where: sector_veil_nebula, anomaly_deep
- Trigger: proximity to a seeded survivor cluster; uniqueOnce
- The player sees: Nine suited survivors drifting in a perfect ring, hand over hand, suits touching suits — the only way eleven people keep together without tethers. They do not break the ring to wave. One of them conducts, silently, keeping them facing the rescue beacon.
- Payoff: Tow the ring home intact (a precise, gentle pull — breaking formation scatters them); each survivor reaches a different port and the story travels.
- Build seam: numbered selfRegistered encounter with a formation-preserved tow (vignetteInterpreter awaits include 'formation'); scatter penalty physics
- Effort: bespoke

### SP1-074 — The Reactor Ferry
- Kind: oneoff-mission
- Where: sector_ashfall_reach, colony
- Trigger: posted when a seeded reactor-casualty event fires near a colony
- The player sees: A freighter's reactor is in cascade and the ship cannot dock — docking means the station eats the blast. The job: tow the whole dying ship to a disposal trajectory while her crew shuttles off. Every second of the tow, the reactor's countdown is visible and audible.
- Payoff: A pure-tension tow with a real explosion if failed (visible from the colony, remembered by it); success pays from three directions (crew, company, colony).
- Build seam: authored tow mission with a sim-time fuse (deadlineS + visible countdown UI via ui:setCourse/deadline); explosion via lootShards
- Effort: bespoke

### SP1-075 — The Ration Ledger
- Kind: comms-event
- Where: sector_charon_expanse, deep lanes
- Trigger: proximity to a long-haul adrift hull; cooldownS 86400
- The player sees: A ship two months off-lane, on air rations, sells its log by the page to anyone who hails: "Day forty-one. The cook found a way to make algae taste like regret. Day forty-two. Regret again." It's not begging. It's a business model, and the writing is good.
- Payoff: Buy pages (codex entries, a real serialized story); buy the whole log at the end for the ending; a page you buy is a page they eat better for.
- Build seam: numbered ambient encounter with a page-store in state.story.flags; codex additions in src/data/codexPages.js
- Effort: data+glue

### SP1-076 — The Fourth Mayday
- Kind: anomaly
- Where: any sector
- Trigger: fourth distress the player responds to in a run (persistent counter); uniqueOnce
- The player sees: The fourth mayday of your run transmits your own registry number as the vessel in distress, at your own last-known heading, with your own voice pattern in the carrier wave. Nobody is there. Your ship's transponder, checked mid-flight, is fine and slightly smug about it.
- Payoff: A short mystery: the source is a crashed courier that copied traffic to spoof rescues — its final real log is the reward (codex page: it was never hunting ships, it was lonely).
- Build seam: numbered selfRegistered encounter gated on a distress-response counter; spoof lines via comms:popup; codex in src/data/codexPages.js
- Effort: data+glue

### SP1-077 — The Bucket Line
- Kind: world-oneoff
- Where: sector_helios_prime, colony
- Trigger: fires during a seeded water-crisis week; all traffic invited on band
- The player sees: A colony's reclamation loop is down and the belt improvises: a bucket line of hulls passing water tanks hand to hand up the lane to the colony, day and night, with a chalk tally on the station wall. Nobody's making money. Everyone's counting.
- Payoff: Join the line (each leg is a short real tow) for colony rep and a name on the tally wall; the tally wall persists after the crisis, listing the week's haulers forever.
- Build seam: numbered repeatable tow legs + a persistent tally prop (authoredPlaces pattern); rep via d.rep to faction
- Effort: bespoke

### SP1-078 — The Cold Manifest
- Kind: oneoff-mission
- Where: sector_veil_nebula, derelict_field
- Trigger: salvage_signal find with cryo-pod payload (seeded); uniqueOnce
- The player sees: A dead hauler's hold contains six cryo pods, labels worn, power for one. The manifest's last line, in the captain's hand: "Thaw in order of fare paid. I'm sorry. That's the whole law out here."
- Payoff: Choose which pod wakes (three seeded outcomes: a mechanic, a debtor, a child of somebody important) or deliver all six frozen to a station for the honest price; the choice is remembered by whoever you wake.
- Build seam: authored one-off in SET_PIECE pattern (DIRTY — fallback numbered selfRegistered with three outcome branches); woken NPC appears at a dock
- Effort: data+glue

### SP1-079 — The Fire Watch
- Kind: encounter
- Where: sector_helios_prime, station_helios exterior
- Trigger: seeded station mishap; fires once per sector week; proximity
- The player sees: A station module catches fire and the extinguisher drones' sweeps keep missing by meters in the vent wind. The station's solution over the band is dignified and desperate: "Any hull with mass assist. Push the module off the spine. We will owe you the respect of the ledger."
- Payoff: Shove the burning module clear with hull contact or a thrown mass (physics, spectacle); save the module (rep + discount) or let it torch (the station rebuilds, and mentions it).
- Build seam: numbered selfRegistered encounter with a burning module prop; shove via massline/bolus force seams (src/data/bolusForces.js)
- Effort: bespoke

### SP1-080 — The Keeper
- Kind: easter-egg
- Where: sector_sker_haven, derelict_field
- Trigger: proximity to a specific dead station; uniqueOnce
- The player sees: A lone suit-tender lives aboard a dead station and re-transmits its final broadcast — arrival boards, shift bells, a weather report for a sky that no longer exists — word-perfect, every hour, for a town that evacuated eleven years ago. He'll do it until the transmitter dies, and the transmitter is dying.
- Payoff: Donate a transmitter part (findable or purchasable) and the broadcast continues; the keeper reads your hull number into the station log as "crew, visiting" — the nicest thing anyone does all week.
- Build seam: numbered ambient encounter + item requirement via vignetteInterpreter requires {module} pattern; persistent flag
- Effort: data+glue

## G. Unique wrecks & the dead

### SP1-081 — The Ticketed Wreck
- Kind: encounter
- Where: sector_ceres_belt, derelict_field
- Trigger: proximity to a famous wreck during a seeded tour window; cooldownS 86400
- The player sees: The most famous wreck in the belt has a ticket booth. A tug runs sightseeing loops around it, a licensed narrator reads the disaster's timeline over the band, and a queue of six civilian hulls holds formation at the "no closer" ring while a scavenger works the far side, banned but working.
- Payoff: Take the tour (codex + the narrator's one honest sentence the script doesn't advertise), or chase the poacher for the operator's fee.
- Build seam: numbered ambient encounter with tour column (vignetteInterpreter) + codex page; fee via d.grant
- Effort: data+glue

### SP1-082 — The Two Halves
- Kind: world-oneoff
- Where: sector_ceres_belt + sector_tethys_junction
- Trigger: scanning one half reveals the other's bearing; the pair persists across the whole save
- The player sees: A ship torn in two by something nobody wants to name: bow in Ceres, stern in Tethys, both still squawking a joined transponder. Scanning either half marks the other on the chart with a line between them that no map function drew.
- Payoff: Visit both halves and the joined log assembles itself in codex — the crew's last three days, ending on a decision the player now understands but cannot judge.
- Build seam: two wreck sites in src/data/uniqueWrecks.js with a shared log fragment pool; codex assembly via codexPages.js
- Effort: data+glue

### SP1-083 — The Reef Light
- Kind: easter-egg
- Where: sector_charon_expanse, ambush_lane
- Trigger: proximity at night-cycle equivalent (sector shadow window); permanent
- The player sees: A dead survey ship's beacon still rotates on the exact period it held in life — and traffic still obeys it. Locals won't say what it warns off, but every hull that cuts the corner here goes wide, silently, first. There is no reef. There is something.
- Payoff: Pure dread as world texture; cutting the corner is survivable N-1 times out of N (seeded), and the one exception has never been explained on any band.
- Build seam: numbered ambient encounter + a seeded rare hazard roll on proximity; codex entry
- Effort: data+glue

### SP1-084 — The Resident
- Kind: encounter
- Where: sector_charon_expanse, the Old Web (SP1-036)
- Trigger: proximity to the web's center wreck; uniqueOnce
- The player sees: One wreck in the web has a breathable seam, a laid-out bunk, and a garden of vacuum-hardy lichen in a cracked dome. The resident trades: stories for supplies, precise, unhostile, and completely uninterested in leaving. "The dead keep better company than the living. Quieter, too."
- Payoff: A recurring trade point (she sells maps of every wreck she's watched strip, which is all of them); her lichen becomes a rare trade good.
- Build seam: numbered selfRegistered encounter as a dock-like vendor entity; inventory from actual wreck loot tables
- Effort: bespoke

### SP1-085 — The Engine Shrine
- Kind: easter-egg
- Where: sector_sker_haven, derelict_field
- Trigger: proximity; uniqueOnce
- The player sees: Scavengers have built a shrine around a wreck's intact main engine: laid tools as offerings, burned tally-marks on the housing, and a sign that reads, without irony, "IT STILL TURNS." One pilgrim is always present, as requested: they leave it running at idle, in the dark, forever.
- Payoff: Pay respect (leave any tool) and the pilgrim gifts a cold-start module pulled from "the offering pile"; rob the shrine and every scavenger pack in the sector knows within the day.
- Build seam: numbered ambient encounter with offerings counter in story.flags; consequence broadcast via bandRadio
- Effort: data+glue

### SP1-086 — The Honor Guard
- Kind: encounter
- Where: sector_veil_nebula, derelict_field
- Trigger: proximity to a military wreck site; cooldownS 86400
- The player sees: Two honor-guard drones still patrol a warship's wreck, and their rules of engagement are legible and fair: crew areas are inviolate, the armory is fair game, and they announce both, on loop, in a voice forty years dead. They do not miss.
- Payoff: Salvage the allowed sections freely (the drones mark your respect in their log); touch a crew area and they escalate precisely, not lethally — they take the module back.
- Build seam: numbered selfRegistered encounter with zone-based ROE (doctrine per-entity, src/ai/doctrine.js setEntityDoctrine pattern)
- Effort: data+glue

### SP1-087 — The Falling Anchor
- Kind: world-oneoff
- Where: sector_ashfall_reach, planetary_mass
- Trigger: permanent fixture with sim-time decay; state persists per save
- The player sees: A capital wreck is falling — slowly, over weeks — toward the gravity well of a dead moon. Each visit it is visibly lower against the moon's face, and the salvage on it is visibly re-priced by risk. The belt has started a pool on the day it hits.
- Payoff: A deadline as a landscape: early salvage is cheap and safe, late salvage pays triple; on impact day, the whole sector hears it, and the site remains as a crater landmark.
- Build seam: persistent prop with simTime-based drift (asteroidMotion precedent); impact event via news:publish; pool as a station bet (economy)
- Effort: bespoke

### SP1-088 — The Wreck Deed
- Kind: oneoff-mission
- Where: sector_tethys_junction, station
- Trigger: posted when a famous wreck's legal owner finally defaults (seeded schedule); uniqueOnce
- The player sees: The auction of a legendary wreck is posted, and the fine print is the event: delivery within the week, current possession "contested by all previous bidders, who were notified." You are not buying a ship. You are buying an argument.
- Payoff: Win the auction, then defend/settle the claim physically; deliver the deed intact and the wreck (a genuine capital-adjacent hull) is yours to strip or register.
- Build seam: authored chain (auction leg + claim-defense leg reusing claim_threat script); hull reward via a disabled entity grant (1210 pattern)
- Effort: bespoke

### SP1-089 — The Far-Side Message
- Kind: easter-egg
- Where: sector_veil_nebula, nebula_fog
- Trigger: proximity with the wreck on the correct bearing from the sector's light source; uniqueOnce
- The player sees: A wreck's hull, lit from behind by the nebula's rim glow, throws a shadow across the fog — and the shadow is a word, welded in plate and readable only as a silhouette from exactly this side: "SORRY". The hull's registration says it carried passengers.
- Payoff: Pure elegy; scanning it produces the shortest codex page in the game and a whisper-line variant that only ever plays near it.
- Build seam: numbered ambient encounter + lighting-position trigger (sim-time shadow angle, deterministic); whisper variant in WHISPER_LINES (src/data/encounters.js)
- Effort: bespoke

### SP1-090 — The Flag Change
- Kind: world-oneoff
- Where: sector_pallas_drift, derelict_field
- Trigger: permanent wreck with a seeded weekly "owner"; state persists
- The player sees: The good wreck in the field changes hands like a fishing spot: Concord claims it Monday, a scavenger crew strips it lawfully Tuesday, the Reach taxes the scavengers Wednesday, and by Friday three flags fly on one mast and nobody can say who owns what. The flags are real fabric props, replaced by someone, every time.
- Payoff: A living landmark whose current flag honestly predicts the encounter you get there this week (patrol scan / share / toll); reading the flags correctly is a learnable skill the game never explains.
- Build seam: numbered encounter with seeded weekly variant pick at site; flag as a visual prop (visualOverrides); three script reuses
- Effort: data+glue

### SP1-091 — The Hum
- Kind: anomaly
- Where: sector_veil_nebula, anomaly_deep
- Trigger: proximity to a specific ancient wreck; scan gate requires 3+ close passes; uniqueOnce
- The player sees: The wreck hums — a low, structural tone that only resolves into the whisper-pool's cadence when you hold scan on it across three passes. It is not broadcasting. It is resonating, at the exact interval of the voices, as if the whispers come FROM hulls like this one, all of them, everywhere.
- Payoff: The whisper's source mystery deepens productively: a codex entry that reframes every prior whisper as fleet-wide, plus one new whisper line only readable here.
- Build seam: numbered anomaly encounter with requiredPings pattern (140-unique-wreck-deepsurvey-ping-elite.js precedent); whisper line added to WHISPER_LINES
- Effort: data+glue

### SP1-092 — The Paid Fare
- Kind: oneoff-mission
- Where: sector_ceres_belt, derelict_field
- Trigger: scanning the wreck reads a passenger manifest with one "PAID, STATUS: ABOARD" entry; uniqueOnce
- The player sees: Everything about the wreck says total loss except one line of the manifest: a passenger who paid in full, boarded, and was listed aboard at impact. The pod bays are empty. The pods themselves are somewhere, and pods keep life support logs.
- Payoff: A quiet search contract (scan candidate debris for pod transponders) with a seeded ending: found-alive (a passenger with one scene's worth of story) or found-at-peace (the log is the reward).
- Build seam: authored search chain (recon_scan stages over seeded debris, SET_PIECE pattern — DIRTY file; fallback numbered chain); passenger NPC via crew data
- Effort: data+glue

## H. The Quiet, anomalies & mysteries

### SP1-093 — The Silence
- Kind: anomaly
- Where: sector_veil_nebula, anomaly_deep
- Trigger: crossing into a fixed seeded region; state persists while inside
- The player sees: A hard-edged region where every band goes dead — NPC comms, barks, your own transmission echo, all of it. Traffic inside flies with running lights only, and the accepted etiquette, learned from watching, is to pass port-to-port and say nothing. Whatever is said in here stays in here.
- Payoff: A recurring dread-space with one rule; the ONE scripted voice that ever speaks inside (once per save) is worth the price of entry. Comms silence is real (bandRadio muted by zone).
- Build seam: zone fixture via sectorZones.js + numbered ambient encounter; audio/comms suppression via bandRadio.js and barkDirector gates
- Effort: bespoke

### SP1-094 — The Echo Bank
- Kind: anomaly
- Where: sector_veil_nebula, anomaly_deep
- Trigger: proximity at a seeded rotation angle; fires with ≥60min of player comms history in the save
- The player sees: A crystalline debris cluster that stores comm traffic in its lattice and replays it — years old, other hulls' arguments, a station's last night shift — and then, once, your own voice, from hours ago, saying something you'd forgotten typing. The bank does not care that it's unsettling. It is a bank.
- Payoff: One replay of the player's own actual past line per visit window (persisted record), plus a codex entry on who built a memory bank and why they needed receipts.
- Build seam: numbered anomaly encounter recording comms:popup payloads to story.flags; replay via comms:popup with lag; codex in src/data/codexPages.js
- Effort: bespoke

### SP1-095 — The Scale
- Kind: anomaly
- Where: sector_ashfall_reach, anomaly_deep
- Trigger: proximity with cargo; uniqueOnce per hull-mass bracket
- The player sees: A ring of worked stone — actual stone, ancient — that projects a number above your hull when you pass through: your exact cargo value, honest to the credit. Locals have carved their whole history of guesses around the rim. Everyone is wrong about what it means. It means exactly what it says.
- Payoff: A reading that is always true and never explains itself; the codex entry is just the community's wrong theories, lovingly collected.
- Build seam: numbered ambient encounter reading live cargo value (director cargoValue() seam); number via floatingText/comms popup
- Effort: data+glue

### SP1-096 — The Courtesy
- Kind: encounter
- Where: sector_pallas_drift, any deep lane
- Trigger: fires after the player has LEFT three hostile encounters without firing (persistent counter); uniqueOnce
- The player sees: A quiet_ghost falls in off your wing and flies perfect formation for sixty seconds — matching every burn, holding exactly station — then drops a small sealed cache and is gone without one word on any band. The cache contains exactly enough fuel to reach the next station.
- Payoff: The cache (real, sized honestly); the ghost's courtesy repeats once more if the counter reaches ten, then never again — restraint has a budget too.
- Build seam: numbered selfRegistered encounter keyed to a no-fire counter in story.flags; cache prop via beacons; ghost uses quiet_ghost archetype passive behavior
- Effort: data+glue

### SP1-097 — The Favor Ledger
- Kind: world-oneoff
- Where: sector_tethys_junction, trade_lane
- Trigger: permanent buoy; reads and writes persistent favor records
- The player sees: A plain station-grade buoy with a public ledger: favors owed and owed-by, maintained by nobody, accurate about everybody. Your hull's line appears the first time you owe anyone anything ("Hull 4471-T: owes the belt one honest tow") and settles when the belt says it does.
- Payoff: A persistent reputation artifact the world actually reads: favors you do get chalked, debts you skip surface as worse job offers everywhere.
- Build seam: persistent prop + state.story.flags['favor_ledger'] written by rescue/tow/refusal outcomes across encounters; displayed via scanLabel
- Effort: bespoke

### SP1-098 — The Negative
- Kind: anomaly
- Where: sector_veil_nebula, nebula_fog
- Trigger: proximity with hull damage of any kind; uniqueOnce
- The player sees: A fog bank that shows your hull back to yourself — a perfect reflection, moving mirrored — except the reflection's damage is different: the scars it wears are not yours, and the ones you have, it lacks. It flies your exact flight, badly, one second late.
- Payoff: No reward and no threat: a one-visit mirror whose differing scars are a seeded preview of the sector's most famous wreck (which you will now recognize when you find it).
- Build seam: numbered anomaly encounter with a mirrored echo hull (290-depth-h8-echo-of-player.js is the shipped precedent in src/data/encounters/)
- Effort: data+glue

### SP1-099 — The Long Sentence
- Kind: easter-egg
- Where: sector_charon_expanse, anomaly_deep
- Trigger: proximity to a fixed beacon; the message completes only across a real sim-time hour
- The player sees: A pre-Collapse beacon blinking an alphabet no catalog matches. It is not a loop. Each pulse advances one character of one very long sentence, and the sentence has been transmitting — patient, unattended — longer than the chart has existed. The full text takes an hour of attention and is worth every minute.
- Payoff: A complete codex page with the translated sentence (an apology from a survey crew that never made it home); the beacon's character state persists in the save.
- Build seam: numbered ambient encounter with a simTime-indexed character state (persisted); codex page in src/data/codexPages.js
- Effort: data+glue

### SP1-100 — The Empty Barycenter
- Kind: anomaly
- Where: sector_veil_nebula, anomaly_deep
- Trigger: proximity to three large bodies in a visible mutual orbit; uniqueOnce
- The player sees: Three dead moons orbit a common center that contains nothing at all — and the nothing has mass. Instruments agree on the gravity and disagree on everything else. Rocks that drift too close to the center slow down, politely, as if remembering something.
- Payoff: A navigational curiosity with one honest mechanic: the slow zone is real, physics-honest, and the fastest route across the sector deliberately threads it; locals charge to teach the timing.
- Build seam: numbered anomaly encounter + a local field effect (fields.js precedent, src/systems/fields.js); lore in codex
- Effort: bespoke

### SP1-101 — The Scheduled Ghost
- Kind: anomaly
- Where: sector_charon_expanse, patrol_corridor
- Trigger: fires on the seeded schedule of a convoy that no longer exists; every sector day, same clock
- The player sees: Every day at the same minute, sensors paint a nine-hull convoy crossing the lane — arrivals logged, traffic advisories issued — and no hull is ever visible. The advisory board still thanks it for right-of-way. It has never been late.
- Payoff: A standing mystery that other systems treat as real (schedule data everywhere); scanning the empty route at the exact minute once per save yields the convoy's final black box.
- Build seam: numbered anomaly encounter on a fixed simTime window; black box via salvage_signal seams; advisories via news:publish
- Effort: data+glue

### SP1-102 — The Four Points
- Kind: anomaly
- Where: sector_ashfall_reach, anomaly_deep
- Trigger: proximity to each of four fixed beacons (any order); the fourth fires the payoff; uniqueOnce
- The player sees: Four identical beacons stand at compass points around a dead star. Each has one sentence, plain as a shipping notice — and each sentence is about a thing YOU actually did this run (rescued, refused, robbed, ran). Nobody built them this week. They were here first.
- Payoff: The fourth point sums the other three into a verdict with no author and no punishment — just the record, read aloud. The most quietly effective codex entry in the game.
- Build seam: four numbered ambient encounters reading real player deed stats (deedRecord.js, src/systems/deedRecord.js); verdict composes from completed records
- Effort: bespoke

### SP1-103 — The Tally Sweep
- Kind: anomaly
- Where: sector_io_reach, trade_lane
- Trigger: fixed sweep period (seeded sector rotation); being inside the sweep cone counts you
- The player sees: A retired toll-keeper's lighthouse still sweeps the lane on its old schedule, and being caught in the sweep feels exactly like being counted — because the old tally buoy next to it increments, visibly, every pass. The count is in the hundreds of thousands. Yours is on it now.
- Payoff: The count is honest: re-visits increment your line. At milestone passes, the buoy's voice (a recording, dry as sand) says one line per milestone. Twelve lines exist. Collecting all twelve takes a whole save.
- Build seam: numbered ambient encounter with a persisted per-player pass count; milestone lines in ENCOUNTER_BARKS
- Effort: data+glue

### SP1-104 — The Whisper With a Name
- Kind: comms-event
- Where: any sector
- Trigger: fires when the player has an actually-unpaid toll AND a whisper roll lands (priorOutcome check)
- The player sees: The whisper pool, which never addresses anyone, addresses you: "the toll you skipped still counts your engine note" — and then, for one transmission only, it names the exact lane. The pool's voice is the same. The specificity is not.
- Payoff: Paying at the named lane silences that line forever (a real flag); not paying means the line follows you into every later whisper roll, slightly closer to your name each time.
- Build seam: whisper script variant checking unpaid-toll story flags; line added to WHISPER_LINES (src/data/encounters.js — clean file)
- Effort: data

### SP1-105 — The Null Auction
- Kind: oneoff-mission
- Where: sector_sker_haven, outlaw_zone
- Trigger: proximity at a seeded auction time; uniqueOnce
- The player sees: A ring of hulls bidding on nothing. There is no lot, no seller, no cargo — only a price climbing on a public board, paid in jettisoned credits, with total solemnity. When you hail, the answer is serene: "The lot is the auction. Everything is the lot. You are early; the lot has not been chosen."
- Payoff: A memory-market: the winning bidder chooses one event from the sector's history and buys the right to have it remembered differently (one news-wire line, rewritten, permanently).
- Build seam: numbered selfRegistered encounter with credit-jettison bids; news rewrite via news:publish with sourceRef override; history pool from deedRecord
- Effort: bespoke

### SP1-106 — The Stutter
- Kind: anomaly
- Where: sector_charon_expanse, mining_belt
- Trigger: proximity to a specific rock; every 60s sim the rock displaces 1 WU for one tick
- The player sees: One asteroid in a quiet field stutters — visibly, mechanically, one meter, every minute, like a faulty hologram. It has been doing this for years. The locals think it's haunted. It is, in the most boring possible sense: a smuggler's phase-anchor, and the stutter is its clock.
- Payoff: Watching three full stutter cycles reveals the anchored cache (it exists only in the stutter tick); the rock then stops forever, which the locals blame on you, correctly.
- Build seam: numbered anomaly encounter with a simTime-modulo position offset on a prop; cache reveal as one-tick window
- Effort: bespoke

### SP1-107 — The Undertow
- Kind: anomaly
- Where: sector_veil_nebula, nebula_fog
- Trigger: entering the marked fog region; persistent while inside
- The player sees: A fog region with a real current: everything drifts two WU/s the same direction, all the time, and the locals have adapted — sails of foil, tide tables posted at the lane mouth, and a whole etiquette about who drifts with it and who fights it.
- Payoff: A physics-honest region that changes how you fly there forever; the tide table (readable) is accurate; riding the undertow outward is the sector's cheapest freight speed-up and everyone pretends it isn't.
- Build seam: region field force (curlField.js precedent, src/data/curlField.js) + numbered ambient encounter for the tide-table NPC
- Effort: bespoke

### SP1-108 — The Dimming
- Kind: world-oneoff
- Where: sector_charon_expanse, deep lanes
- Trigger: permanent buoy; state persists per player across the save
- The player sees: A vigil buoy nobody claims, burning for a disaster no record names. It is, very slowly, dying — each pass you make, it is measurably dimmer, and the belt has noticed. Nobody will fund it. Everyone will mention it. A grieving light, going out on a schedule.
- Payoff: Donate power (latch and feed it, a real charge interaction) to reset its decay; each donation is logged on the buoy; at three donations the belt quietly names the buoy after your hull.
- Build seam: persistent prop with a decay value in story.flags; charge interaction via massline; naming via news:publish
- Effort: bespoke

## I. Bosses, hunters & standoffs

### SP1-109 — The Ring Rules
- Kind: encounter
- Where: sector_sker_haven, outlaw_zone
- Trigger: proximity to a fixed dueling ring rock; any hostile commander present; cooldownS 7200
- The player sees: A circle of rocks with a physical PD-screen boundary (331-pd-screen-wall.js's tech, repurposed) and a posted rule in three languages: one hull each, inside the ring, anything goes, nobody's friends intervene. A Reach commander is already inside, waiting for someone worth the fuel.
- Payoff: An honest 1v1 with a real purse; win inside the ring and even their pack respects it (a chalk on the ring's tally); win by cheating (escorts, mines) and every pack in the sector treats it as a debt.
- Build seam: numbered selfRegistered encounter with a pd_screen boundary prop and single-spawn rule; purse via d.grant
- Effort: bespoke

### SP1-110 — The Heir
- Kind: encounter
- Where: any sector
- Trigger: 2-5 sector-days after killing any named captain (priorOutcome named_hunter 'killed'); uniqueOnce per captain
- The player sees: A formal hail, of all things: "I am {name}'s heir. The pack requires a conclusion, not a grudge. The paper says you killed well. The paper says I inherit. One of us is about to be right." They arrive with better escorts and worse experience.
- Payoff: Defeat the heir and the pack closes the file — future pack encounters in that sector open with respect (visible bark change). Let them escape and the file stays open: they return once more, better.
- Build seam: numbered file script 'namedHunter' variant with gates.requiresCompletedShape; heir entry added to NAMED_CAPTAINS roster pattern (src/data/encounters.js)
- Effort: data+glue

### SP1-111 — The Brood Mare
- Kind: encounter
- Where: sector_ashfall_reach, outlaw_zone
- Trigger: proximity; gates minSectorTier 4; cooldownS 86400; uniqueOnce
- The player sees: Acapital hull that isn't fighting — it's spawning: rack after rack of live wasps rolling off a carousel while the crew works the decks like a farm. Killing the hull is a massacre. Killing the RACKS is the fight: each one pops like a piñata and the swarm thins by arithmetic.
- Payoff: A boss whose defeat condition is subsystem destruction (racks), paying in a intact spawn-rack module nobody else has; the hull, racks gone, surrenders by simply powering down.
- Build seam: capital-boss-adjacent numbered encounter using src/systems/capitalBossEncounters.js subsystem pattern with rack targets
- Effort: bespoke

### SP1-112 — The Grid Hostage
- Kind: encounter
- Where: sector_veil_nebula, colony
- Trigger: fires during a seeded raid on a colony with a station power core; uniqueOnce
- The player sees: Raiders have clamped the colony's power core and hauled it outside station reach: "The lights come back when the vault does." The colony is running dark, and the raiders' terms timer is honest. Shoot the core and the whole map section browns out — for weeks.
- Payoff: Negotiate, sneak the core back on a line, or pay; every resolution leaves the colony's lights at a state you chose, visible from orbit, for the rest of the save.
- Build seam: numbered selfRegistered encounter with a towable core prop + colony lighting state in story.flags (endingWorldPresence.js precedent, src/systems/endingWorldPresence.js)
- Effort: bespoke

### SP1-113 — The Return
- Kind: world-oneoff
- Where: any sector
- Trigger: 3+ sector-days after the player survives any fight at hull &lt; 20% (persisted record); uniqueOnce
- The player sees: An old enemy hull drops out of cruise beside you — the one who nearly ended you — and escorts you, in silence, to the station ring. Before peeling off, one transmission: "Not today. I want the version that's repaired." The band, for once, has nothing to say.
- Payoff: A nemesis with a code: they appear exactly once more, at your next worst moment, and take a side you don't expect. The rivalry gets an ending.
- Build seam: story-flag record of near-death fights; numbered selfRegistered encounter keyed to the flag; escort via vignetteInterpreter face/depart motions
- Effort: bespoke

### SP1-114 — The Taxidermist
- Kind: world-oneoff
- Where: sector_ashfall_reach, derelict_field
- Trigger: permanent lair site; unlocks after the player survives any hunter encounter
- The player sees: A hunter's lair built like a museum: forty hull IDs engraved on the airlock, each with a hull plate from the kill bolted under it, arranged chronologically. There is one empty space at the end, polished, waiting. The current occupant is home, and charming, and absolutely not apologetic.
- Payoff: Trade with the collector (they buy trophies at premium); the empty space is yours if you want it, and the price is a fight with house rules.
- Build seam: persistent lair site (authoredPlaces pattern) + vendor encounter; trophy record from deedRecord kill history
- Effort: bespoke

### SP1-115 — The Range Note
- Kind: visual-setpiece
- Where: any sector
- Trigger: fires sector-day after escaping Sable Iask specifically (priorOutcome named_hunter 'escaped'); cooldownS 86400
- The player sees: For a whole day, occasionally, a red ranging fleck crosses your hull glass — brief, precise, from nowhere — with no contact on any scanner. It is not an attack. It is a subscription reminder from the best sniper in the belt: "Range is mine. I decide when."
- Payoff: Pure dread with one honest mechanic: while the flecks last, all your ranged weapon accuracy reads one tick worse on the band (your own gunners know he's out there).
- Build seam: numbered ambient encounter (no spawns, pure vfx event via vfx.js seams — DIRTY file, prefer story-prop fleck) + a day-long flag read by combat readouts
- Effort: bespoke

### SP1-116 — The Witnessed Standoff
- Kind: encounter
- Where: sector_io_reach, trade_lane
- Trigger: two scheduled lawfree convoys intersecting; proximity; cooldownS 86400
- The player sees: Two armed convoys have stopped nose to nose over a lane dispute — right of way, the oldest war — and both sides, seeing you, independently hail: "Neutral hull. Witness this. Whatever happens here happened fairly." Then nobody moves. Nobody will move. Someone has to move.
- Payoff: Be the witness (record the truth in the news wire, both sides pay a fee), or nudge one hull a meter with a line and let physics end the argument (one side wins, the other remembers).
- Build seam: numbered selfRegistered encounter with two convoy columns + a witnessed-price news publish (1207-the-witnessed-price.js precedent in src/data/encounters/)
- Effort: data+glue

### SP1-117 — The Counter-Contract
- Kind: encounter
- Where: sector_pallas_drift, any lane
- Trigger: while a bounty hunter pursuit is live (bountyHunt.js active), a seeded rival hunter rolls; cooldownS 86400
- The player sees: Your hunter's approach is interrupted — professionally — by a second hunter who hails YOU, not them: "Ignore the writ. I pay better for the writ-holder's hull. Or just stay out of my firing line, either way." The contract has a contract on it now.
- Payoff: A three-way fight where any pair can ally for the moment; deliver the writ-holder's wreck to the rival for double; or watch two professionals duel and sell the story later.
- Build seam: numbered file script 'bountyHunter' with a second hunter squad keyed to active bounty state (src/systems/bountyHunt.js)
- Effort: data+glue

### SP1-118 — The Professional
- Kind: encounter
- Where: any sector
- Trigger: fires on the third escape from the SAME named hunter (persisted per-captain escape count)
- The player sees: The hunter who has chased you across three sectors and three escapes finally hails mid-pursuit, winded and honest: "You're the first hull to make me look bad three times. That's a pension problem. Last offer: split the writ, and we both retire rich."
- Payoff: Split (the writ is voided, you both get paid, and the hunter becomes a bar story that follows you), refuse and win the fourth round (the hunter's ship is genuinely retired either way — that's the code).
- Build seam: per-captain escape counter in state.encounterDirector.named (NAMED_CAPTAINS state precedent); numbered file script 'namedHunter' variant
- Effort: data+glue

### SP1-119 — The Wrecker's Bout
- Kind: encounter
- Where: sector_sker_haven, derelict_field
- Trigger: proximity to the ring rock after any duel loss (SP1-109); cooldownS 86400
- The player sees: The wreckers run their own ring with their own rules, posted plainly: NO GUNS. Hull, hook, and nerve. An audience of six hulls holds the boundary, and their champion — an ugly, wonderful old tug — is practicing shoves against a dead hulk when you arrive.
- Payoff: A massline-and-ram duel where the crowd pays for spectacle; win or lose, a good showing makes you ring-regular (the champion nods, forever after).
- Build seam: numbered selfRegistered encounter with weapons-locked ROE (doctrine) and massline tug-of-war as the weapon; audience via vignetteInterpreter ring motion
- Effort: bespoke

### SP1-120 — The Second Last Argument
- Kind: encounter
- Where: sector_charon_expanse, any lane
- Trigger: after the player has SEEN 901-last-argument resolve (requiresCompletedShape); uniqueOnce
- The player sees: Someone else is running the same play you watched once: a lone hull, a final offer, a very calm voice about consequences. Only this time the mark is a whole station's fuel line, the offer is worse, and the speaker's hands are shaking — you can see the gun-arm tremor on scan.
- Payoff: The same gambit, deconstructed: end it quietly, end it loudly, or — the third option nobody takes — back the blackmailer, who pays in a currency of favors you'll wish you hadn't accepted.
- Build seam: numbered file with gates.requiresCompletedShape on 901-last-argument; three-way outcome via crSituationKit settleSituation
- Effort: data+glue

### SP1-121 — The Frozen Watch
- Kind: easter-egg
- Where: sector_veil_nebula, anomaly_deep
- Trigger: proximity to a specific cold-drift hull; uniqueOnce
- The player sees: A military hull, powered, intact, and four degrees above vacuum — her bridge crew still at stations, frozen mid-shift, watches still on wrists, coffee still in the cup. Nothing killed them. Something turned the heat off and left. The log's last entry is a routine requisition.
- Payoff: The soberest codex page in the game; delivering the crew's effects to their faction's office opens one quiet dialogue that never mentions it again.
- Build seam: numbered ambient encounter with an interior-read scan sequence; faction dialogue via barContacts pattern (src/ui/station/barContacts.js — DIRTY; prefer comms popup)
- Effort: data+glue

### SP1-122 — The Resignation Letter
- Kind: oneoff-mission
- Where: sector_pallas_drift → any station
- Trigger: drops from the boss wreck of any major pirate fight (priorOutcome 'cleared' on a boss shape); uniqueOnce
- The player sees: The warlord's wreck yields, of all things, a sealed letter — a resignation, written to his own pack, dated the day he died, never sent: "Tell them I was tired. Tell them the tolls were getting heavy to carry. Don't tell them I said sorry."
- Payoff: Deliver it to the pack (a succession with less blood than expected — the sector's raid prices actually soften) or keep it (the pack hardens, and the letter is the best item description in your hold).
- Build seam: drop attached to boss outcome records (crSituationKit facts); delivery as numbered encounter; faction pricing note via economy intents
- Effort: data+glue

## J. Races, chases & the physics of showing off

### SP1-123 — The Comet Run
- Kind: oneoff-mission
- Where: sector_charon_expanse
- Trigger: comet perihelion window (seeded schedule, announced); race posts at the lane mouth
- The player sees: The comet run: gates strung along the comet's tail, and the whole field rides the outgassing — the only race in the belt where the COURSE moves and every gate drifts with it. The locals' advice, posted at the start: "The comet does not care who wins. This is why it is honest."
- Payoff: A race with moving gates and a real slipstream; three pay bands (race type exists in MISSION_TYPES); winners get their hull names chalked on the comet-post until next perihelion.
- Build seam: race-type mission with courseSector + moving gate positions (race type in src/data/missions.js MISSION_TYPES)
- Effort: bespoke

### SP1-124 — The Gate Sprint
- Kind: oneoff-mission
- Where: sector_helios_prime, station-to-gate lane
- Trigger: posted during scheduled traffic lulls (seeded); repeatable weekly
- The player sees: Two stations, one gate, and an unofficial lunchtime tradition: the gate sprint. Traffic control pretends not to see it and issues a formal advisory about "recreational velocity." The purse is small, the bragging is eternal, and the safety record is, frankly, remarkable.
- Payoff: A clean timed sprint on real lane geometry; beat the record and your time is the record (persisted, visible at both stations).
- Build seam: race-type mission; record persisted in story.flags; advisory lines via news:publish
- Effort: data+glue

### SP1-125 — The Anchor Drag
- Kind: oneoff-mission
- Where: sector_ceres_belt, trade_lane
- Trigger: fires when a scheduled freight column passes the belt; uniqueOnce per column
- The player sees: The illegal one: latch a moving freight train and hold — no winching, no slack, just nerve and a line rated for less than this. The record is chalked on the last car. The railway does not endorse this. The railway rates your line, loudly, by name.
- Payoff: Hold-time competition against a posted record (physics-pure: tension, breaking thresholds); the record-holder's identity is a legend you can meet.
- Build seam: numbered selfRegistered encounter reading attachment tension telemetry (src/combat/attachments.js); record in story.flags
- Effort: bespoke

### SP1-126 — The Deadweight Derby
- Kind: oneoff-mission
- Where: sector_vesta_forge, refinery_approach
- Trigger: posted at the yard on off-shifts; repeatable
- The player sees: The derby is simple: everyone races towing a yard-supplied dead hulk, and the hulks are all worse than yours. Winning is less about thrust than about line discipline — every towed swing through the refinery shallows is a chance to lose the whole thing.
- Payoff: A race where the physics is the opponent; prizes scale with hulk intactness at the line, and the yard re-sells your "raced" hulk with a plaque.
- Build seam: race mission with a mandatory latched prop (tow constraint on courseSector); hulk props from wreckClasses
- Effort: bespoke

### SP1-127 — The Credible Loss
- Kind: oneoff-mission
- Where: sector_tethys_junction, any scenic lane
- Trigger: posted by a named wealthy pilot after any race the player wins; uniqueOnce
- The player sees: A rich kid's offer, itemized: race my autopilot, lose by less than a length, no crashes, one take. "Father thinks the ship is cursed. It is not cursed. It is embarrassing. Fix the STORY." The contract's success condition is a photo finish you must lose on purpose.
- Payoff: A race scored in reverse; throw it cleanly (harder than winning) for triple pay, or win honestly and double the insult (he doubles your fee out of respect).
- Build seam: race mission with inverted scoring bands (rewards on near-miss); autopilot rival via fixed-line AI (combatDoctrine)
- Effort: bespoke

### SP1-128 — The Burn Line
- Kind: oneoff-mission
- Where: sector_ashfall_reach, radiation_field
- Trigger: posted at the field rim during a seeded hazard window; repeatable with escalating entry fee
- The player sees: The rule is one sentence: every gate must be taken at full burn, no coast. In a radiation field, with vent windows and a course that threads the hazard clocks, "full burn" stops being bravado and becomes a rhythm you learn with your hands.
- Payoff: The belt's purest skill race; band records persist, and the window's hazard timing is public data — learning the clock IS the game.
- Build seam: race mission with hazard-window gates (timingGate pattern from src/data/uniqueWrecks.js); records in story.flags
- Effort: data+glue

### SP1-129 — The Hare
- Kind: encounter
- Where: sector_pallas_drift, any lane
- Trigger: fires after the player's bounty or notoriety crosses a seeded threshold (bountyOnly OR fame flag)
- The player sees: You wake up the hare: a bounty poster with your hull, a purse, and — visible on scan — three hunters already burning your way from different bearings, chattering on a shared private channel you can partly hear. The poster's fine print lists your known routes. It is accurate.
- Payoff: Survive the purse-window (they must corner you before the clock ends) or clear your name mid-chase; every hunter in it remembers the one that got away, by name, for the rest of the save.
- Build seam: numbered file script 'bountyHunter' with a timed purse window and a three-bearing spawn; poster data from player route stats
- Effort: data+glue

### SP1-130 — The Wrong Way
- Kind: oneoff-mission
- Where: sector_charon_expanse, debris stream
- Trigger: posted at the stream mouth during drift season; repeatable
- The player sees: The debris stream flows one way at a walking pace, and the locals race it wrong-way — upstream through the grains, drafting between the big rocks where the current slackens, for a purse paid by the salvors who want the stream mapped at speed.
- Payoff: A course that is also a survey: your run produces a real, sellable map of the stream's slow lanes; the map makes the upstream route permanently faster for everyone.
- Build seam: race mission + a persisted map record consumed by navigation (mapWorkbench reads a flag); salvor pool via d.grant
- Effort: bespoke

### SP1-131 — The Pace Car
- Kind: encounter
- Where: sector_veil_nebula, nebula_fog
- Trigger: proximity to the fog's dangerous stretch during low traffic; cooldownS 3600
- The player sees: A battered local hull runs the fog at exactly the safe speed, lights on, and the regulars tuck in behind her wake like ducklings — she is the pace car, unpaid, permanent, and deeply tired of the job. Her wake visibly parts the fog in a lane you can follow.
- Payoff: Following her wake through the fog is a real, honest speed-and-safety bonus; tip her (jettison credits) and she'll add a hand-signal for the deep shortcut she's never told anyone.
- Build seam: numbered ambient encounter with a wake-visual bonus (masslinePresentation adjacent — DIRTY; prefer story-prop wake marker) + follow check
- Effort: data+glue

### SP1-132 — The Long Follow
- Kind: encounter
- Where: sector_tethys_junction, trade_lane
- Trigger: a seeded racer hull passes the player at speed; fires once; uniqueOnce
- The player sees: A racer blows past and, without slowing, tags you on the band: "Keep up or don't." The chase has no purse, no rules, no finish line announced — just a hull ahead that flies beautifully for exactly two minutes and then buys the drinks.
- Payoff: Keep visual contact for 120s (a real proximity check, honestly judged) and the racer introduces themselves at the next bar — a named contact who tips rumors worth credits; lose them and they never mention it again.
- Build seam: numbered selfRegistered encounter with a 120s proximity await (vignetteInterpreter 'near'/'trail' awaits); contact reward via barContact flag
- Effort: data+glue

## K. The band: comms events

### SP1-133 — The Bet
- Kind: comms-event
- Where: any sector, trade_lane
- Trigger: seeded twice per sector week; plays out over three stations as the player travels
- The player sees: Two haulers are having an argument on the open band about whether the Ceres queue or the Forge queue moves faster, with money on it, and the argument is STRUCTURED: each station visit adds a measurement, both cite sources, one of them is increasingly obviously wrong. You can settle it (they ask the nearest neutral hull — you) at the third stop.
- Payoff: Judge correctly (a cut of the pot, two named acquaintances) or get it wrong (they're gracious; the belt notices); the bet's result is on the news wire either way.
- Build seam: scripted comms arc keyed to station-visit events (docking hooks); judgment via comms choice; pot via d.grant
- Effort: data+glue

### SP1-134 — The Wrong Number
- Kind: comms-event
- Where: sector_pallas_drift, any lane
- Trigger: proximity to a Quiet relay; cooldownS 86400; uniqueOnce
- The player sees: A routed-for-someone-else burst lands in your queue: full handler's orders for a smuggling run — the cargo, the window, the buyer's scan schedule. Then, thirty seconds later, a very calm voice: "Delete that." The job is real. The window is real. The voice is closer than you'd like.
- Payoff: Run someone else's job honestly (they never acknowledge you, the payment arrives anyway, which is somehow worse), sell the orders back (Quiet rep), or ignore it (the buyer waits at the drop for a hull that never comes).
- Build seam: comms popup with payload + a real drop-site encounter (boreDeadDrop.js precedent, src/systems/boreDeadDrop.js)
- Effort: data+glue

### SP1-135 — The Tower's Favorites
- Kind: comms-event
- Where: any station
- Trigger: after 10+ dockings at the same station (persisted counter)
- The player sees: Traffic control has developed opinions. "Helios Tower to hull 4471-T: welcome back. Berth 12, as usual. Try not to dent 12." Then, months in, the one day you dock sloppily, the whole approach goes quiet, and the tower says only: "...noted." The regulars on the band enjoyed that.
- Payoff: A relationship that costs nothing and reads everywhere: favorites get berth preference (a real, small docking speed-up), slobs get the far berth and public numbers.
- Build seam: dock-count flags per station; tower lines via dockingCorridor/barkDirector seams (src/systems/dockingCorridor.js)
- Effort: data+glue

### SP1-136 — The Broadcast Will
- Kind: comms-event
- Where: sector_charon_expanse
- Trigger: seeded death event at a remote site; fires once per run
- The player sees: A dying captain wills his ship live on the band — "to the nearest hull with a clean registry, no offense" — and the nearest hull, per the actual sensor math, is you, while four other hulls dispute the math and one of them starts moving with intent.
- Payoff: An inheritance with contest attached: claim it (a real ship, a real fight, a real registry battle at the dock) or refuse on-band (the will names you as the witness instead, which pays nothing and changes how executors treat you forever).
- Build seam: numbered selfRegistered encounter computing the actual nearest hull; ship grant as disabled entity (1210 pattern); contest fight
- Effort: bespoke

### SP1-137 — The Morning Report
- Kind: comms-event
- Where: any station dock
- Trigger: one digest per sector day, on dock
- The player sees: The daily report: three headlines, two true, one wrong in a specific direction — prices that didn't move, a raid that was smaller than filed, a rescue that has no rescuer. It never lies about anything that matters to the sim. It lies about exactly one thing per day, and nobody knows why.
- Payoff: Spotting the lie (checking the report against the actual market/news data the game has) builds a "reader" flag; after 30 spotted lies the reporter leaves you a private note that explains nothing and is the best text in the game.
- Build seam: digest generator comparing economy/news state; flag counter in story.flags; note via comms popup
- Effort: bespoke

### SP1-138 — The Blind
- Kind: comms-event
- Where: sector_sker_haven, outlaw_zone
- Trigger: proximity to a hunter stakeout while quiet (no weapons hot); cooldownS 86400
- The player sees: You drift through a hunter team's comms discipline by accident: target descriptions, shift changes, the quarry's known habits — all in crisp argot, all audible, none of it about you. They are professionals mid-job and the band is their workplace. Then the quarry's engine note passes under everyone, including yours.
- Payoff: Sell the plan to the quarry (they pay, and become a named contact) or sit on it (the takedown happens; you can watch; the hunters tip professionals who stayed out of the line).
- Build seam: numbered ambient encounter with overheard-bark arc; bountyHunt coordination as the payload; tips via d.grant
- Effort: data+glue

### SP1-139 — The Quiet Hours
- Kind: comms-event
- Where: sector_helios_prime, station_helios approach
- Trigger: station night-shift window (seeded, daily); fires on first night approach; then every night
- The player sees: Between shifts, the station's band plays one song for empty lanes and holds a hard rule: nobody talks over it. Traffic that would normally chatter goes silent, dances its approach in lights, and resumes afterward. Breaking the rule once gets you gently, permanently named on the band as "the one who talked."
- Payoff: A nightly ritual that makes the world feel staffed; the "talker" name is a real persistent bark-pool entry that regulars reference.
- Build seam: night-window comms state (bandRadio) + a lullaby track + a violation flag; bark pool entry in ENCOUNTER_BARKS
- Effort: data+glue

### SP1-140 — The Complaint Desk
- Kind: comms-event
- Where: any station dock
- Trigger: fires after any incident the player caused (raid, ram, fine) — on next dock
- The player sees: A formal reading of complaints filed against your hull, verbatim, by name, with registration numbers: the toll you ran ("witness: three hulls, one of them a child"), the queue you cut, the wake that rattled a pilgrim's lamp. The clerk reads them all. The clerk has heard worse. The clerk has, in fact, a favorite.
- Payoff: A comedy of record-keeping with one real effect: settle any complaint with a formal apology payment and the complainant withdraws it (small rep, the clerk's approval, which matters more).
- Build seam: incident-history read (deedRecord/fines) rendered as a dock comms popup; settlement via d.charge/d.rep
- Effort: data+glue

### SP1-141 — The Weather Desk
- Kind: comms-event
- Where: any station dock
- Trigger: subscription offer after the player survives any hazard event; persists
- The player sees: A forecaster sells hazard calls — flare windows, bloom tides, undertow shifts — with a visible accuracy percentage that is HONEST because it is computed. "Eighty-two percent. The other eighteen percent is why it's cheap." Her misses are real misses and she logs them publicly.
- Payoff: A paid subscription with real predictive value (the schedule data is the sim's own); her accuracy drifts by sector, and the good sectors are worth the fee.
- Build seam: subscription flag + forecast lines generated from the actual hazard schedules (environmentalMachinery.js, src/data/environmentalMachinery.js)
- Effort: bespoke

### SP1-142 — The Courtesy Loop
- Kind: comms-event
- Where: sector_charon_expanse, derelict_field
- Trigger: proximity to two specific dead relay hulls; uniqueOnce
- The player sees: Two dead stations' automated handshake protocols still exchange courtesies across the field — arrival pings, "good morning" acknowledgments, berth availability reports for berths that no longer exist — with the mechanical politeness of two machines that never learned their operators died.
- Payoff: A two-minute elegy in protocol-speak; the final exchange (a request for a status report that will never come) is a codex entry; leaving any relay part makes the loop one step more complete, forever.
- Build seam: numbered ambient encounter with a scripted exchange; donation flag; codex in src/data/codexPages.js
- Effort: data+glue

### SP1-143 — The Open Auction
- Kind: comms-event
- Where: sector_sker_haven, outlaw_zone
- Trigger: fires when a hunter delivers a famous quarry (seeded schedule); cooldownS 86400
- The player sees: A captured ship sold by open auction on the band — hull tethered and scarred, the auctioneer pricing it in jettisoned credit-canisters, bids visible as physical vents of light. No paperwork, no law, total probity: the Reach's auctions are honest in the way only completely illegal things can be.
- Payoff: Bid physically (credits jettisoned in-canister, escrowed by the ring's gravity well) and win a genuinely good hull with a genuinely stolen history; the ring remembers who paid fair.
- Build seam: numbered selfRegistered encounter with jettison-escrow mechanic; hull grant; "fair payer" flag
- Effort: bespoke

### SP1-144 — The Sermon
- Kind: comms-event
- Where: sector_veil_nebula, any lane
- Trigger: choir broadcast cadence (seeded weekly); content composed from the player's last three receipts
- The player sees: The Choir's weekly sermon is public, serene, and — this week — tailored: it cites your last three deeds by fact and number, without names, without judgment, as verses. "And the hull that paid the tithe twice and the third time ran — what did the third lane cost, children?" Everyone in earshot knows who it's about. It is not about anyone.
- Payoff: A chilling, gorgeous use of the game's own receipt system; the sermon's citations are accurate to the real encounter history, and the Choir's rep shifts one point by what it read.
- Build seam: numbered comms encounter composing text from crSituationKit history records; rep via d.rep faction_choir
- Effort: data+glue

### SP1-145 — The Missed Connection
- Kind: comms-event
- Where: any station dock
- Trigger: fires 2+ sector-days after any completed rescue (priorOutcome); uniqueOnce per rescuer
- The player sees: A notice on the band, awkward and formal, looking for "the hull that answered, description follows" — and the description is yours, itemized with embarrassing accuracy down to a dent you forgot about. The poster has something to say and couldn't find you until now.
- Payoff: Meet them (a scene worth the detour: the rescued family's own accounting of that day, which is nothing like yours) and receive the thing they saved for you — never money.
- Build seam: rescue-outcome flag + a dock comms scene; gift as a unique item (modules.js one-off)
- Effort: data+glue

### SP1-146 — The Sixth Pip
- Kind: easter-egg
- Where: sector_helios_prime
- Trigger: listen through a full sim-hour boundary at any station
- The player sees: The official time pips: five pips, then the hour. Except Helios' tower plays six, and has for years, and the error is documented, filed, and uncorrectable because the technician who knew why retired rich and happy and refuses to say. The band's old-timers set their watches by the sixth pip on purpose.
- Payoff: Pure charm; asking about it at the dock (a comms choice) yields three different explanations from three different crew, all of whom believe theirs completely.
- Build seam: numbered ambient encounter + dock comms choice; timer anchored to state.simTime hour boundaries
- Effort: data

## L. Weather, physics & the sky doing something

### SP1-147 — The Bloom Tide
- Kind: visual-setpiece
- Where: sector_veil_nebula, nebula_fog
- Trigger: bloom tide wavefront on its seeded schedule (announced on the band); sector-wide
- The player sees: The nebula blooms on schedule: a light-front rolls across the whole sector, and every hull, rock and wreck it passes flares briefly in sequence — traffic light up like a coastline at night. Everyone stops what they're doing to watch. It happens exactly as often as it should.
- Payoff: A scheduled spectacle the world treats as weather (jobs pause, tolls pause); one unique cache is visible ONLY during the bloom (its surface phosphors), same window every time.
- Build seam: scheduled sector-wide vfx wavefront (bloom ladder/lookMoods adjacent — DIRTY files; prefer encounter-driven story prop) + numbered ambient encounter for the cache
- Effort: bespoke

### SP1-148 — The Shelf Avalanche
- Kind: encounter
- Where: sector_ceres_belt, mining_belt
- Trigger: a seeded mining misfire nearby (fired by an NPC rig); proximity; cooldownS 86400
- The player sees: Someone else's overcharged crack sets off a shelf: a slow-motion river of boulders pouring across the lane while every hull in earshot scatters and swears on the band. The physics is honest — you can surf the slow edges, cut through the gaps, or do the stupid brave thing.
- Payoff: The avalanche exposes a fresh ore face (rich, real, first-come) at the scar line; dodging through pays nothing and feels incredible.
- Build seam: numbered selfRegistered encounter spawning a boulder cascade (asteroidMotion precedent); exposure via lootShards seam
- Effort: bespoke

### SP1-149 — The Ring Rain
- Kind: world-oneoff
- Where: sector_charon_expanse, planetary_mass
- Trigger: permanent seasonal fixture (seeded month each sector year)
- The player sees: For one season, the gas giant's ring sheds: slow silver rain of ice grains crossing the approach lane at an angle, pattering off hulls audibly, visible from every station. Harvesters ride the rain with nets. Children watch from the windows. The locals call the whole season "the sift."
- Payoff: A season the economy honestly notes (volatiles dip as everyone free-harvests); riding the rain gives a slow free ice accrual capped per day, because the belt refuses to let a good thing be infinite.
- Build seam: seasonal vfx fixture + a capped harvest interaction; economy note via economyCycles
- Effort: bespoke

### SP1-150 — The Anvil Skim
- Kind: visual-setpiece
- Where: sector_ashfall_reach, radiation_field
- Trigger: scheduled refinery skim runs (visible on the band); cooldownS 3600
- The player sees: The Anvil's skim barges dip close enough to the star's surface that their hulls read as silhouettes against the flare, dragging collector fields behind them on lines, and the whole crew's voices come over the band with the calm of people who do this twice a shift. The star, meanwhile, is enormous and completely indifferent.
- Payoff: Ambience with an edge: the skim run's wake is a real brief speed lane (the collector fields shear the local drag), and flying it uninvited is possible, stupid, and faintly legendary.
- Build seam: numbered ambient encounter + skim schedule; wake-speed bonus as a lane field; barks via ENCOUNTER_BARKS
- Effort: bespoke

### SP1-151 — The Frost Line
- Kind: visual-setpiece
- Where: sector_charon_expanse, outer belt
- Trigger: crossing the marked frost line on any outward bearing; every crossing
- The player sees: One invisible boundary and the universe changes: hull rims whiten with feathered ice, exhales hang, comms acquire a crackle, and every hull ahead of you wears the same frost — the belt's whole economy visible as a line ships don't cross without reason. Your own hull frosts in real time, from nose back.
- Payoff: Pure place-making; the frost persists on your hull until you return sunward (a visible trip record), and one trade good only buys frost-side.
- Build seam: crossing check on a fixed radius + hull frost state as a visual flag; frost-side-only good in commodities.js
- Effort: bespoke

### SP1-152 — The Tumbleweed
- Kind: world-oneoff
- Where: sector_ceres_belt
- Trigger: permanent wanderer on a seeded slow trajectory; persists all save
- The player sees: A dead fuel skid has been tumbling through the belt for years on a trajectory everyone knows, too slow to matter and too stubborn to stop — it has bounced off three claims, been raided twice, been used as a table by salvagers, and appears in local sayings. Everyone just... watches it go.
- Payoff: A landmark in motion: it is where it is (findable, honest), it holds one small secret cache nobody's found, and the band still tracks it like a pet.
- Build seam: persistent wandering prop on a fixed ballistic path (asteroidMotion); cache; band commentary via ambient barks
- Effort: data+glue

### SP1-153 — The Full Burn
- Kind: visual-setpiece
- Where: sector_helios_prime, station_helios
- Trigger: scheduled weekly fleet drill (announced); fires once
- The player sees: The drill: every operational hull at the station — tugs, barges, patrol, the lot — lights off simultaneously for a synchronized station-keeping burn, holds for ten seconds, and cuts together. It is pure, pointless, perfect choreography, and it exists because a stationmaster sixty years ago thought morale was a system.
- Payoff: A spectacle the player can join (the drill accepts any hull in the formation ring, and you'll get a one-line grading from the tower, forever after).
- Build seam: scheduled formation event (vignetteInterpreter column/ring motions at scale); join check; grading via persistent bark
- Effort: data+glue

### SP1-154 — The Metal Garden
- Kind: anomaly
- Where: sector_ashfall_reach, radiation_field
- Trigger: proximity to a fixed magnetic spine rock; persistent while inside
- The player sees: A magnetic spine so strong that loose hull-plate, bolts and dead drones from a kilometer around hang off it in slow, still fringes — a garden of iron, sorted by mass, swaying when anything passes. Salvage hangs here like fruit. Taking it is possible. The spine takes it back, eventually, from everyone.
- Payoff: Free salvage with an honest gimmick: everything you pull free is dragged back within a day unless you also leave metal (a real trade: the garden keeps its mass); locals leave offerings and the garden grows.
- Build seam: numbered anomaly encounter with magnetic attraction forces (bolusForces precedent); mass-balance persistence in story.flags
- Effort: bespoke

### SP1-155 — The Long Fall
- Kind: visual-setpiece
- Where: sector_ashfall_reach, planetary_mass
- Trigger: scheduled meteor shower window; proximity to the moon's face
- The player sees: The moon takes a meteor stream broadside: a hundred visible impacts stitched across its face like a slow string of flashbulbs, each one sending up a plume you can see from the lane, while the band goes uncharacteristically respectful. The moon is not in danger. Everyone watches anyway.
- Payoff: Scheduled spectacle; the stream's leading edge is real and physically present in the lane (honest dodge-or-weather-it gameplay), and the plumes persist for the hour.
- Build seam: scheduled impact event with lane-crossing debris (debrisCrossings.js precedent, src/systems/debrisCrossings.js)
- Effort: data+glue

### SP1-156 — The Dust Script
- Kind: easter-egg
- Where: sector_veil_nebula, nebula_fog
- Trigger: within the calm dust sea; any deliberate wake pattern; persistence by sector day
- The player sees: The dust sea holds wakes. In the calm patches, your wake lines persist for hours — and someone has been writing there: old routes, a name, an arrow pointing at nothing, all in wake-script, all fading at the same honest rate. You can write too. Yours will last as long as anyone's.
- Payoff: A canvas with rules: the day's surviving script is visible to every hull that passes (persisted per sector-day); the best-known entry, carved by wake every day for years, is from the pilot everyone thought died.
- Build seam: wake-pattern persistence buffer per sector day + a fixed "daily writer" entry; reading via proximity reveal
- Effort: bespoke

### SP1-157 — The Lightning Farmers
- Kind: visual-setpiece
- Where: sector_veil_nebula, radiation_field
- Trigger: storm cell season (seeded schedule); proximity to the farm rocks
- The player sees: The storm cells ground themselves on the farm rocks, and the farmers harvest: long collector lines between rocks, each strike running the line to a capacitor bank with a bang you feel in your teeth, and the farmers' commentary on the band has the rhythm of people who talk about weather because the weather is the whole conversation.
- Payoff: The farm sells charged cells (a real module charge) with a queue, a price, and a farmer who tells you, free, which rock to stand behind.
- Build seam: seasonal storm vfx + a vendor encounter; charge as a module state; farmer barks
- Effort: data+glue

### SP1-158 — The Crossing
- Kind: anomaly
- Where: sector_charon_expanse
- Trigger: moon eclipse shadow crossing the sector on its fixed schedule (announced)
- The player sees: The moon's shadow crosses the sector on schedule, a hard-edged circle of dark sliding over the lane, and everything inside it runs on running lights: traffic, tolls, arguments — all of it conducted in silhouette for twenty minutes. The band, briefly, is full of people describing the dark to each other.
- Payoff: A scheduled dark with real edges (visibility is genuinely changed inside the shadow); one smuggler runs the shadow on purpose every single time, and you can watch the patrol miss her, every single time.
- Build seam: scheduled shadow state (lighting flag) + a numbered ambient encounter at the shadow's edge; smuggler AI uses it as cover
- Effort: bespoke

### SP1-159 — The Fog Wedding
- Kind: visual-setpiece
- Where: sector_veil_nebula, nebula_fog
- Trigger: seeded ceremony date; proximity inside the fog; cooldownS 86400
- The player sees: Two ships marry inside the fog, and nobody sees hulls: the whole ceremony is lights — approach patterns as vows, a horn duet, both families' convoys forming a corridor of running lights that you're silently invited to join as the aisle. Nobody knows whose hull is whose. Nobody needs to.
- Payoff: Join the corridor (a real formation event, judged by nothing, remembered by the families) or pass outside the lights; the married pair's merged convoy is a permanent fixture afterward with a name you watched chosen.
- Build seam: light-only ceremony via vignetteInterpreter formation + lighting states; permanent merged convoy via a persistent fixture record
- Effort: data+glue

### SP1-160 — The Cascade
- Kind: easter-egg
- Where: sector_tethys_junction, station orbit
- Trigger: proximity during the seeded cascade window; uniqueOnce
- The player sees: The Tethys debris cascade, twice a year: a derelict ring's slow decay reaches critical and for an hour the lane rains junk — hulls hitting hulls hitting hulls in slow, grinding, enormous silence, while traffic holds at the rim and the band counts collisions like a horse race. Nobody is hurt. Everything is memorial.
- Payoff: The aftermath is real loot physics (first-come salvage on the fresh field) and the ring's orbit is visibly, permanently cleaner — the same decay the game models, observed.
- Build seam: scheduled debris event (aftermathWrecks seam, src/systems/aftermathWrecks.js) + loot physics; countdown via band commentary
- Effort: bespoke

### SP1-161 — The Undertakers' Bell
- Kind: anomaly
- Where: sector_sker_haven, deep lanes
- Trigger: proximity to a fixed wreck after ANY player-caused kill in the sector that day
- The player sees: A derelict tug that tows nothing, followed by nothing, rings its bell once for every hull that died in the sector that day. The count is honest — the bell knows things the news doesn't — and on the day you first hear it, it rings for someone you never met and one more time than the news reported.
- Payoff: A standing memorial with a real count (persisted per sector-day); ring it yourself once (a deliberate, manual choice) for your own dead, and the bell holds that count forever, on a plaque no one can find.
- Build seam: numbered ambient encounter reading kill records; bell count in story.flags; plaque as codex
- Effort: data+glue

### SP1-162 — The Long Shadow
- Kind: visual-setpiece
- Where: sector_pallas_drift, planetary_mass
- Trigger: fixed celestial schedule (moon occultation of the sector's star); twice per sector week
- The player sees: Pallas' moon eats the star for six minutes, and the sector does what it always does: stations dim to running lights, the toll lanes go dark-side, and every hull's shadow — if it has anything to cast — stretches a hundred kilometers across the dust. Traffic control calls it "the long shadow" and, quietly, times its own breaks by it.
- Payoff: A scheduled dark with real surface changes (darker approach, cooler hull read) and one cache that only reads scan during the shadow (thermal tell, honest physics).
- Build seam: occultation schedule + lighting state flag + a shadow-window cache scan; cache from beacons
- Effort: bespoke

### SP1-163 — The Traffic Keeper
- Kind: encounter
- Where: sector_ceres_belt, refinery_approach
- Trigger: fires when refinery traffic density crosses a seeded jam threshold; ambient
- The player sees: The Forge intake has jammed: nine barges in a mutual standoff of right-of-way, nobody able to move without someone else pretending to, and the intake tower is narrating with the flat despair of a machine that has seen this before. Everyone knows the fix. Nobody wants to be the one to move.
- Payoff: Un-jam it physically: one good shove (or one line, or one polite broadside against an empty ore rack) restarts the whole system, and the tower logs your hull as "priority intake" for a month — a real, earned dock speed-up.
- Build seam: numbered selfRegistered encounter reading traffic density; shove via massline; priority flag consumed by docking
- Effort: bespoke

### SP1-164 — The Graveyard Orbit
- Kind: world-oneoff
- Where: sector_veil_nebula, anomaly_deep
- Trigger: permanent fixture; reveals state on each visit
- The player sees: A graveyard orbit where decommissioned hulls are parked in a slow ring, nose to tail, kilometer after kilometer — each one stripped of anything useful and left exactly as it was, with its name still on. The ring is maintained by nobody, and hulls are added to it by somebody, in order, always at the tail.
- Payoff: A place that remebers the sector's dead fleet; the newest hull in the ring is always someone you heard of; reading a full hull's plaque (scan, long-form) yields one codex page per hull, twenty in all.
- Build seam: persistent ring of wrecks (wreckClasses) with an append-on-event rule keyed to major NPC deaths; codex pages per plaque
- Effort: bespoke

## M. The factions' interior life

### SP1-165 — The Confessional
- Kind: encounter
- Where: sector_veil_nebula, any choir-adjacent lane
- Trigger: proximity to a choir penitence buoy; cooldownS 86400
- The player sees: The Choir's confessional buoy listens to your band for thirty seconds — traffic only, nothing forced — and then issues absolution in receipt format: "Heard: one refusal, one rescue, one skipped tithe. Weighted: the rescue. Absolved: the tithe. The refusal is yours to keep." It is completely sincere and completely serious.
- Payoff: Absolution with receipts: the Choir's rep nudges by what was actually heard, once per visit, and the buoy remembers your pattern across the whole save.
- Build seam: numbered ambient encounter reading recent encounter receipts (crSituationKit history); rep via d.rep faction_choir
- Effort: data+glue

### SP1-166 — The Read Fee
- Kind: oneoff-mission
- Where: sector_tethys_junction, archive relay
- Trigger: posted whenever the player scans any wreck (seeded interest roll); repeatable per wreck
- The player sees: The Archive offers the strangest service in the belt: pay a fee and their readers will reconstruct the last sixty seconds of any wreck's existence from hull stress, log fragments and powder burns. The report arrives as a single paragraph. It is always about something you didn't ask.
- Payoff: Paid lore that is honest about method ("the galley's coffee pot was still warm; impact came from above"): a codex fragment per wreck read, and the Archive's debt of gratitude after ten reads.
- Build seam: per-wreck read service (numbered encounter keyed to scan events); fragments via codexPages.js; fee via d.charge
- Effort: data+glue

### SP1-167 — The Efficiency Audit
- Kind: encounter
- Where: sector_ceres_belt, refinery_approach
- Trigger: proximity to a Fulfillment surveyor; fires on any dock-approach with fitted modules; cooldownS 86400
- The player sees: A Fulfillment auditor hails with genuine warmth and a spreadsheet: your hull's fit is audited on the spot — "two modules overlap functionally, one is six percent under-rated, and you carry cargo capacity you have never once used." Everything it says is true. It wants, with visible joy, to fix you.
- Payoff: Accept the audit (a real refit recommendation that is actually good) or decline politely (it marks you "awaiting optimization" and checks back, forever, kindly).
- Build seam: numbered ambient encounter reading fitted modules (src/core/fittedModules.js) vs usage stats; recommendation as a real refit offer
- Effort: data+glue

### SP1-168 — The Graft
- Kind: world-oneoff
- Where: sector_charon_expanse, hull garden (authoredPlaces)
- Trigger: permanent fixture; one-time offer on first close approach
- The player sees: The Understory's growers offer a living graft: a patch of hull-tissue that bonds to your plating, seals micro-fractures, and grows — slowly, visibly, over weeks — toward your cockpit. It wants light. It hums when you're in danger. It is not equipment. It is, the growers insist, a crew member.
- Payoff: A permanent hull companion with a visible growth state and one honest function (micromend, capped); it can be removed, painfully, and it remembers.
- Build seam: authored offer at the fixture + a persistent hull-state prop (growth in story.flags); micromend hook in damage pipeline
- Effort: bespoke

### SP1-169 — The Dock Wedding
- Kind: easter-egg
- Where: sector_pallas_drift, station dock
- Trigger: seeded contract-marriage schedule between two hauling lines; fires once per run
- The player sees: The Pitborn seal a merger as a marriage: two hauling families, two hulls tied nose to nose at the dock with a literal line, the band doing a liturgy of freight terms ("for richer, for poorer, in slack and in strain"), and a reception where every guest is armed and nobody is drinking.
- Payoff: Crash it politely (a gift earns a standing favor from both lines) or miss it (the merged line's tolls change and everyone assumes you knew).
- Build seam: authored dock scene + a merged-line fixture afterward (toll change via encounter data); favor flag
- Effort: data+glue

### SP1-170 — The Helix Barge
- Kind: world-oneoff
- Where: sector_sker_haven, deep lanes
- Trigger: permanent neutral fixture at a fixed drift; state persists
- The player sees: The Helix clinic barge hangs in the deep with its lights on and its doors open to anyone — pirates, patrols, you — and its one rule is painted twice: "No weapons inside the ring. No exceptions except yours." The ring is honest: fire inside it and every faction's ledger hears about it within the day.
- Payoff: Free repairs with a waiting queue and real triage (worse hulls first, including your enemies, which you watch); the ring's sanctity is a mechanic the whole sector respects, and testing it once is permanent.
- Build seam: persistent vendor fixture with a queue system; ring-violation broadcast via news:publish; faction-wide rep penalty
- Effort: bespoke

### SP1-171 — The Prism Read
- Kind: anomaly
- Where: sector_charon_expanse, anomaly_deep
- Trigger: proximity to the prism field with running lights on
- The player sees: The prism field splits your running lights into a long spectrum fan, and the Vergers read the fan like a mood ring — hull by hull, they'll tell you what your light says ("exhausted, well-fed, recently paid, afraid of checkpoints") and they are right, because it is literally your power budget, refracted.
- Payoff: One honest reading per visit (your real systems, poetically described); adjusting your fit changes the reading, which is how locals check each other's hulls without asking.
- Build seam: numbered ambient encounter reading power/fit state; fan vfx via light behavior; readings as barks
- Effort: data+glue

### SP1-172 — The Census
- Kind: encounter
- Where: sector_tethys_junction, border_checkpoint
- Trigger: border census on its seeded schedule; fires once per census year
- The player sees: The Meridian census is physical: three questions, each with a required action, not an answer — "Dump one unit of anything and tell us what it was. Flash your lights twice for the record. Name the last hull you refused." The census taker writes it all down without comment. Your answers become a row in a ledger nobody can edit.
- Payoff: The census row is permanent (persisted) and one future encounter — a census follow-up — opens by quoting it back to you, word for word, five years later.
- Build seam: numbered selfRegistered encounter with physical-response choices; row stored in story.flags; follow-up with gates.requiresCompletedShape
- Effort: data+glue

### SP1-173 — The Hours
- Kind: easter-egg
- Where: sector_ceres_belt, station_ceres
- Trigger: first dock at Ceres after the player has 20+ hours of logged labor (persistent counter)
- The player sees: The Collective's tally office converts your logged work hours into their internal currency — "credit hours," one per hour worked, never spendable, always counted — and stamps your ledger with your number. The number is lower than you'd guess. Everyone's is. That's the point, says the clerk, and the clerk has done this ten thousand times and believes it every time.
- Payoff: A permanent, useless, perfectly meaningful number that other Collective NPCs reference with respect proportional to its size.
- Build seam: labor counter in story.flags; stamp via dock comms; referenced in Collective NPC barks
- Effort: data+glue

### SP1-174 — The One Favor
- Kind: oneoff-mission
- Where: sector_io_reach, Frontier station
- Trigger: posted when the player's Frontier rep crosses zero (from either side); uniqueOnce
- The player sees: The Frontier doesn't recruit. A recruiter buys you one drink and explains the actual arrangement: "One job. You can say no. If you say no, we'll like you anyway, and this conversation never happened. If you say yes, you're one of ours until the job's done, and the job is real."
- Payoff: A genuinely hard job with Frontier-standard honesty (the briefing names every risk, correctly); refusing is honored forever; accepting makes the Frontier yours and you theirs.
- Build seam: authored mission via missions.js authored pattern (DIRTY — fallback numbered selfRegistered job chain); rep gate on faction_free
- Effort: bespoke

### SP1-175 — The Lost Luggage Office
- Kind: oneoff-mission
- Where: sector_helios_prime, station_helios
- Trigger: dock interaction; repeatable with rotating inventory (seeded weekly)
- The player sees: MTS maintains an office for cargo nobody claimed: a wall of crates with scan labels and no owners. The claiming procedure is one question: "Describe the label." Get it right from memory (you saw that crate days ago, in a wreck, in a briefing, on a manifest) and it's yours. Get it wrong and the clerk smiles and says the office will keep looking.
- Payoff: A memory game with real stakes: the inventory is drawn from the actual wrecks and convoys you've passed; correct claims pay in goods, wrong guesses cost nothing but face.
- Build seam: numbered dock encounter with an inventory pool built from encounter history; claim via comms choice
- Effort: bespoke

### SP1-176 — The Librarian's Grudge
- Kind: world-oneoff
- Where: sector_tethys_junction, archive relay
- Trigger: permanent fixture; grudge state persists and updates
- The player sees: The Archive's night librarian maintains a personal, non-official ledger of every record destroyed in the sector, by cause — and since you arrived, the causes column has a new entry that grows. "Hull 4471-T: two survey logs, one black box, one piece of evidence, destroyed." The librarian is not angry. The librarian is keeping score, which is worse.
- Payoff: A permanent reputation as a record-destroyer (or, if you donate records, as a donor — the same ledger, better column); donations are one-click and the librarian's thanks are worth more than the fee.
- Build seam: persistent fixture reading destruction events; donations via a dock interaction; ledger state in story.flags
- Effort: bespoke

## N. Docks, stations & the working day

### SP1-177 — The Loader's Fumble
- Kind: easter-egg
- Where: any station dock
- Trigger: random per dock (seeded); visible on approach
- The player sees: The loader exoskeletons hand your cargo down the dock line — and one of them fumbles. The crate pinwheels in low-grav, three loaders dive, and it lands: either cracked open (one unit of something free, with a handwritten apology taped to the rest) or caught at the last second (the lead loader takes a bow).
- Payoff: Either outcome is a moment; the apology note is a real readable item; the bow gets applause on the band from every dockworker who saw it.
- Build seam: dock ambient vignette via vignetteInterpreter spec (902-scene-* precedent) + item drop
- Effort: data

### SP1-178 — The Wash Refusal
- Kind: easter-egg
- Where: sector_helios_prime, station_helios dock
- Trigger: first docking after the player's hull has ≥1 visible story mark (toll stamp, frost, scorch); uniqueOnce
- The player sees: The hull-washer arch takes your hull on its first pass, then — audibly — re-runs the one spot it can't clean, three times, and gives up with a mechanical sigh. The dock hands lean out to look. The spot is the exact dent from your first fight, and the washer has decided it is "structural."
- Payoff: Pure charm; the spot stays forever, and the washer "greets" your hull by re-trying the spot every visit without comment.
- Build seam: dock vignette keyed to hull story-mark flags; persistent mark as visual flag; washer behavior as a fixed vignette spec
- Effort: data

### SP1-179 — The Busker
- Kind: easter-egg
- Where: any station dock
- Trigger: dock proximity; one per station; seeded rotation of three drones
- The player sees: A refit drone with a speaker bolted on plays at the dock mouth — old station songs, two of them good — with a cargo-net for tips. Dockhands toss rivets. A pilot once tossed a full canister and the drone still has the canister, displayed, thirty years later, with a small sign: "SOMETIMES."
- Payoff: Tip it (jettison credits in the net — physical, honest); at the third tip the drone learns your hull's name and plays it, forever, whenever you dock.
- Build seam: dock vignette with a jettison-tip interaction; persistent name flag; song via audioRecipes (src/data/audioRecipes.js)
- Effort: data+glue

### SP1-180 — The Sniffer
- Kind: comms-event
- Where: any fuel dock
- Trigger: every fueling, low chance (seeded)
- The player sees: The line inspector taps your tank, listens, and reads your week back to you from the fuel: "Three hard burns, one cold soak, and somebody ran you rich for about a minute — chase? Race? Either way, your mixture's honest. Sign here." The paperwork is real. The insight is free.
- Payoff: Flavor with one true detail per reading (drawn from actual flight telemetry); the inspector remembers regulars and asks after the chase by name if it was a race.
- Build seam: dock comms popup reading recent flight telemetry summary; inspector memory in story.flags
- Effort: data+glue

### SP1-181 — The Night Shift
- Kind: world-oneoff
- Where: sector_pallas_drift, station_drift
- Trigger: station dark-cycle window (seeded, daily, 8 sim-minutes)
- The player sees: Drift station goes dark between shifts: running lights only, half the desks empty, and the skeleton crew runs a different economy — cash deals, no paperwork, prices marked "night" that are occasionally better and occasionally a trap. Everyone who matters to the night shift is awake and knows everyone else.
- Payoff: A second station inside the first: night-only trades, night-only rumors, and a night clerk who remembers exactly which night you chose the trap.
- Build seam: schedule-driven station state + night vendor list; clerk memory in story.flags
- Effort: bespoke

### SP1-182 — The Naming
- Kind: world-oneoff
- Where: sector_helios_prime, station_helios
- Trigger: fires on the first dock after the player's first major rescue (priorOutcome rescue)
- The player sees: The yard has named a tug. Your hull's name, on a brand-new tug, at the naming ceremony you weren't told about, with a speech that mispronounces it. The yardmaster's explanation is a masterpiece of understatement: "Small yard. We name what we're grateful for. She's yours to borrow, any time she's not working."
- Payoff: A permanent borrowable tug (a real assist verb at that station, capped fairly) and the mispronunciation, which the yardmaster refuses to correct and the tug answers to.
- Build seam: rescue flag + a dock ceremony vignette; assist as a docking speed-up; name persisted
- Effort: bespoke

### SP1-183 — The Last Tow
- Kind: visual-setpiece
- Where: sector_ceres_belt, ceres shipbreak yard
- Trigger: scheduled yard retirement (seeded monthly); fires once
- The player sees: The yard retires its oldest tug with full honors: a procession to the crusher mouth, every working hull at rest with lights on, the tug's forty-year log read over the band by the three crew who know it best, and then — the yard's own tradition — one last tow, unmanned, into the jaw, at the exact speed she always towed at.
- Payoff: A funeral the whole belt attends; attending (formation, lights) is a real formation event, and the yard's next tug is named for the old one, forever after.
- Build seam: scheduled procession via vignetteInterpreter column + audio log; attendance check; naming flag
- Effort: data+glue

### SP1-184 — The Squatter
- Kind: easter-egg
- Where: any station
- Trigger: fires when the player's habitual berth (most-docked berth) is taken by a seeded visitor; once
- The player sees: Your berth — your berth — has a stranger in it. They are apologetic to the point of ceremony: your berth fee for the night is paid, there's a note ("they said someone loves this berth; it looked like just a berth; I'm sorry"), and a small gift, chosen with alarming precision from your known tastes.
- Payoff: A stranger who becomes a named contact (the gift's precision makes that inevitable); the berth war recurs once a season, and the third time, they leave the berth to you, permanently, with a formal note.
- Build seam: berth-visit counter + visitor vignette; contact flag; seasonal recurrence via seeded schedule
- Effort: data+glue

### SP1-185 — The Book
- Kind: easter-egg
- Where: any station dock
- Trigger: after 20 dockings (persistent counter), dockworkers' book opens for the player
- The player sees: The dock crew keeps a betting book on dockings — who lands hot, who lands drunk, who lands perfectly — with odds updated per hull. Yours has a page now. The odds are visible. The crew's commentary is worse than the odds. The one perfect landing in the book's history is annotated, simply: "show-off."
- Payoff: A running odds line for your landings (gentle physics read: hot approaches shorten the odds); a perfect landing pays the book's pot once, ever, to whoever bet on you.
- Build seam: docking-speed telemetry read; odds in a persisted per-hull record; pot as a one-time payout
- Effort: bespoke

### SP1-186 — The View
- Kind: world-oneoff
- Where: sector_helios_prime, station_helios
- Trigger: dock offer after the player has docked 30+ times; purchase persists
- The player sees: The station auctions "view berths" — the six docks facing open star — with a price and a waiting list, and the fine print is honest: "The view is the same star. The star does not care. This berth is about what you look at while you drink." The current holders include a legend who bought theirs fifty years ago and has never once docked elsewhere.
- Payoff: A purchasable permanent berth with a real (modest, dignified) visual change at dock and a spot on the view-berth plaque, which is read aloud once a year.
- Build seam: dock purchase + a persistent berth flag consumed by dock layout; plaque as a dock fixture
- Effort: bespoke

## O. The world keeping your receipts

### SP1-187 — The Statistician
- Kind: easter-egg
- Where: any station bar
- Trigger: first bar visit after 50 recorded deeds (persistent counter); uniqueOnce
- The player sees: A professional rememberer — that's the job title — performs "your legend" to the bar: your career stats as folk numbers ("forty-one rescues! give or take; who counts?"), slightly wrong in the direction of a better story, and corrected live by hecklers who were THERE for three of them.
- Payoff: Your actual statistics, roasted; after the show the rememberer buys you a drink and asks for the corrections, which improve the next performance for every player.
- Build seam: deedRecord stats rendered as a bar scene (barContacts adjacent — DIRTY; prefer comms popup); corrections feed the pool
- Effort: data+glue

### SP1-188 — The Copycat
- Kind: encounter
- Where: any sector
- Trigger: fires after the player's most-used maneuver type crosses a threshold (persisted maneuver stats)
- The player sees: A young pilot in a ship fitted like yours, flying like yours — visibly practicing your signature move, badly, on traffic that deserves it. When hailed: "You're the one who does the [move]. I've been doing it for a month. I still lose the tail every time." They want one lesson. They have saved up for it.
- Payoff: Teach it (a real, short flight lesson — they get better, permanently, and their gratitude is a named contact) or charge for it (they pay; the move spreads; one day you'll see three ships doing it).
- Build seam: maneuver-stat read (flight telemetry) + a lesson vignette; pupil improvement persisted as an NPC flag
- Effort: bespoke

### SP1-189 — The Plaque
- Kind: world-oneoff
- Where: any sector, at the site of the player's first hostile kill
- Trigger: permanent marker placed at first-kill coordinates; persists all save
- The player sees: The site of your first kill, marked by somebody — a small buoy, a plate, and an inscription nobody signs: "First hull down, {date}, by an unregistered hull. It had a name too." The plate does not judge. The plate is just accurate, and it has been here the whole time.
- Payoff: A permanent, quiet landmark; returning years later (the game knows how long it's been) the plate has accumulated small objects — bolts, a ribbon, someone's spare key — left by people who fly this lane.
- Build seam: first-kill record writes site coordinates + persistent marker prop; offerings accumulate in story.flags
- Effort: bespoke

### SP1-190 — The Debt Garden
- Kind: world-oneoff
- Where: sector_sker_haven, a fixed rock
- Trigger: permanent garden; each unpaid debt/failed promise in the save grows one weed-rock
- The player sees: A rock with a garden of rusted scrap-weeds, one per unpaid debt in the belt's living memory — tolls skipped, promises broken, rescues billed. It grows on a schedule nobody admits to maintaining. Your own contributions are there, and they have your hull color, and everyone who flies past can see how many.
- Payoff: Settle a debt (any debt, any of them, honestly) and a weed is pulled — visibly, publicly, at the next pass; the garden is the belt's credit report and everyone reads it.
- Build seam: debt-event hooks write garden state in story.flags; settle actions prune; visible marker count
- Effort: bespoke

### SP1-191 — The Letter Home
- Kind: comms-event
- Where: any station
- Trigger: 5+ sector-days after any rescue whose survivor named a home port
- The player sees: A message arrives from the rescued crew's home station — not thanks, better: their mail. "Thought you'd want to know the kid talks about the rescue like weather. 'And then the hull just CAME.' We told them you charge rates like everyone. They've decided you're a smuggler of people. High praise here."
- Payoff: One letter per rescue, kept in a codex folder that becomes, without ever saying so, the best thing in it.
- Build seam: rescue records → a letter queue; delivery via comms popup; folder in codexPages.js
- Effort: data+glue

### SP1-192 — The Wake Market
- Kind: world-oneoff
- Where: sector_pallas_drift, a fixed coordinate on the player's habitual route
- Trigger: permanent site; inventory persists and updates
- The player sees: A scavenger has set up shop at the exact point where your habitual route crosses his — because everything you've ever jettisoned, dropped, or lost settles here on the slow drift, and he has been collecting. "Your wake pays better than most wrecks. Don't take it personal. I also sell it back."
- Payoff: A buy-back shop for your own history (cargo you dumped days ago at a panic price, at a markup that is somehow fair); the shop's stock is literally your past.
- Build seam: jettison-event log → shop inventory at a persistent site; buy-back via d.charge
- Effort: bespoke

### SP1-193 — The Portrait Buoys
- Kind: visual-setpiece
- Where: sector_helios_prime → sector_ashfall_reach
- Trigger: permanent buoy line; each famous hull in the sector gets one, in order of fame
- The player sees: Somebody paints hull portraits on beacon shrouds — working pilots, dead pilots, the lot — hung along the approach lanes like saints' cards. The style is good, the likenesses are kind, and the newest shroud, half-finished on its frame, has your hull on it, still wet.
- Payoff: Fame made visible and persistent: your shroud weather at the same rate as everyone's; the painter is findable, takes commissions, and refuses payment in anything but a good story.
- Build seam: persistent buoy props with painted shrouds (illustratedSurface adjacent — DIRTY; prefer story-prop texture); fame read from deedRecord
- Effort: bespoke

### SP1-194 — The Interest
- Kind: encounter
- Where: any sector
- Trigger: fires 10+ sector-days after any refused bargain (persisted refusal record); uniqueOnce per bargain
- The player sees: The counterpart from a deal you refused weeks ago finds you — not hostile, just thorough: "You said no. Fair. I've had time to think about why, and I've raised the offer, and I've brought the thing you'd have needed to do it safely. I want this DONE."
- Payoff: The same deal, matured: better terms, real safety included, and a counterpart who has earned the yes; refuse again and they finally, gracefully, accept it — as a person would.
- Build seam: refusal records in story.flags; matured-deal numbered encounter; graceful exit flag
- Effort: data+glue

### SP1-195 — The Witness
- Kind: encounter
- Where: sector_io_reach, a toll lane you once ran
- Trigger: proximity to the exact lane of a skipped toll (priorOutcome 'escaped'), after 5+ sector-days
- The player sees: A kid working the toll lane's buoy — real job, too young for it — looks up your registry on the public board and asks the question the belt won't: "It says a hull with this number ran the toll in spring. Was that you?" The lane is empty. The buoy is counting. The kid just wants to know if the legends are true.
- Payoff: Answer honestly (yes: the kid respects it and the toll quietly caps for you thereafter; no: the kid knows anyway, and likes you more for the lie's badness) — the toll lane treats you differently forever.
- Build seam: priorOutcome check + numbered ambient encounter; answer flag consumed by toll pricing
- Effort: data+glue

### SP1-196 — The Notary
- Kind: world-oneoff
- Where: any station dock
- Trigger: dock presence; one offer per deed type (rescue, kill, delivery, refusal); repeats per type
- The player sees: A notary drone offers, in perfect legalese, to witness anything: "Your next deed, whatever it is, witnessed and sealed. Witnessed deeds are... different. Ask anyone who has one." The fee is trivial. The drone has witnessed eleven thousand deeds and been thanked by none of them, professionally.
- Payoff: Each witnessed deed type pays its rep once at double weight (the seal makes it official); the notary's ledger of your witnessed deeds is a codex page you can read any time, stamped and dull and wonderful.
- Build seam: dock comms offer + a witnessed flag per deed type read at outcome time; ledger in codexPages.js
- Effort: data+glue

### SP1-197 — The Chalk
- Kind: visual-setpiece
- Where: any habitual route
- Trigger: persists along routes the player has flown 5+ times; updates on pass
- The player sees: Your regular route has developed chalk: marks on the rocks you pass — a tally of your passes, a correction arrow where you once drifted wide, and, on the worst corner, a small, professionally painted sign that just says "AGAIN?" Nobody signs the chalk. Everybody adds to it.
- Payoff: The route remembers you in the world's own handwriting; the marks are persistent, the corrections are real (they mark actual hazards), and the tally increments forever.
- Build seam: route-pass counter + persistent chalk props along the lane (story props); hazard data from your actual collision/drift records
- Effort: bespoke

### SP1-198 — The Homecoming Bell
- Kind: world-oneoff
- Where: sector_helios_prime, poi_tutorial
- Trigger: first re-entry to the starter sector after 20+ sector-days away (persisted absence record)
- The player sees: The starter beacon rings your arrival home the way it rings nothing else — a pattern the old-timers on the band notice immediately ("someone's come back"), because the pattern is reserved for hulls that left and made it. The tutorial beacon, which taught you the throttle, has one extra line it saved for exactly this.
- Payoff: A two-line homecoming from the game's first voice; the pattern is permanent, and rings differently for hulls that left and hulls that left and got rich.
- Build seam: absence record + beacon bark pattern; lines in ENCOUNTER_BARKS
- Effort: data+glue

### SP1-199 — The Successor
- Kind: oneoff-mission
- Where: any station dock
- Trigger: after the player's first ship has been outgrown (persisted loadout history), a young pilot appears; uniqueOnce
- The player sees: A kid has bought — genuinely bought, at auction, with saved wages — a ship fitted exactly like your first fit, down to a module you replaced years ago. "It's a good starter. Everyone says so. Everyone says YOU said so, years ago, to somebody. One tip. That's all I'm asking."
- Payoff: Your one tip (a real choice from your actual early-game history) becomes the kid's doctrine — they fly it, their record accrues, and the belt eventually credits the technique to your name with a date and a witness.
- Build seam: loadout history read + a tip-choice scene; successor NPC with a persistent doctrine flag; credit via news:publish
- Effort: bespoke

### SP1-200 — The Book of Receipts
- Kind: easter-egg
- Where: any sector
- Trigger: fires after 50 notable deeds of 5+ types (priorOutcome history threshold); uniqueOnce
- The player sees: A Quiet courier, the first and only one to ever hail you unbidden, hands over a bound book — every receipt the game ever gave you, bound in order, with the Quiet's own stamp on the spine and a title page that says, in no language you read but understand: "ACCOUNTS CURRENT." The last page is blank. It is not an error. It is, the courier indicates, "for the next ones."
- Payoff: The campaign's receipts made physical; the blank page means the game expects more of you — and every receipt after this one is printed, by the world, slightly better bound.
- Build seam: encounter-history threshold (crSituationKit records + deedRecord); book as a codex artifact in codexPages.js; courier one-off numbered encounter
- Effort: bespoke

---

## Seam map

Where encounter/mission content actually enters the game (all verified this session):

- **New numbered encounter files** — drop a file in `src/data/encounters/NNNN-name.js` exporting `encounterOrder` (unique int), `trigger` (id, tier major/minor/ambient, deck combat/civilian/mystery/patrol, weight, zoneTypes from `src/data/sectorZones.js` ZONE_TYPES, script id, pressureCost, cooldownS, gates, proximity), optional `runtime` (for `script: 'selfRegistered'`, the d.* API: fire/tick/event, d.spawnShips, d.spawnProp, d.say, d.grant, d.rep, d.stream seeded rng, d.abort/resolve), and `export default defineEncounter(trigger, {shape, ...})`. Pickup: run `node scripts/build-encounter-index.mjs`, which regenerates `src/data/encounters/index.generated.js` (checked-in static import graph — browser ESM cannot glob; NOT git-dirty; regeneration verified idempotent). Full custom runtime precedent: `src/data/encounters/1210-the-deadweight.js` (order 1210) and the 1200-series (orders 1200-1306 are taken; 1310+ free).
- **Shipped phase scripts (data-only shapes)** — reuse `script:` ids registered in `src/systems/encounterScripts.js` ENCOUNTER_SCRIPTS (line ~4127): toll, patrolScan, ambush, distress, convoy, traderRun, patrolBeat, salvageSignal, whisper, namedHunter, bountyHunter, claimThreat, uniqueWreck* — with `squad`/`escort`/`bark`/`choices`/`timeoutChoice` data in the encounter file. Bark lines and receipt text live in `ENCOUNTER_BARKS` / `ENCOUNTER_RECEIPTS` in `src/data/encounters.js` (clean, NOT dirty).
- **Vignette/scene specs (external-only ambient scenes)** — declarative `spec` objects (cast with roles/archetypes/dx/dz/scanLabels, choices with requires {module|commodity}, phases with verbs/motions/awaits) compiled by `src/systems/vignetteInterpreter.js`; precedent files `src/data/encounters/902-scene-mail-through-crossfire.js` … `931`. Motions: hold/orbit/creep/ring/weave/depart/face/chase/tow/column/vulture; awaits: latched/near/trail/formation/visit/meet/etc. NOT dirty.
- **Situation kit for self-registered one-offs** — `src/systems/crSituationKit.js`: `priorOutcome(state, shapeId)`, `settleSituation(...)` (writes outcome+facts+visits), `publishSituationNews(...)` (news wire), `loosenBody` (tetherable mass). NOT dirty.
- **One-time persistence** — two durable save-carried stores: (1) `state.story.depthProgramEncounters.completed[shapeId] = {outcome, at, facts, visits}` written by settleSituation; the director's `_gatesPass` (src/systems/encounterDirector.js ~line 1374) reads it for gates `uniqueOnce`, `blockAfterOutcome`, `requiresCompletedShape`; (2) generic `state.story.flags` bag (seeded at src/core/gameState.js:214, owned by story systems), the universal flag store for cross-encounter memory. Named captains persist in `state.encounterDirector.named` (NAMED_CAPTAINS roster in src/data/encounters.js).
- **Gate vocabulary available to any new encounter's trigger** (verified in encounterDirector.js `_gatesPass`): sectorIds, uniqueOnce, blockAfterOutcome, requiresCompletedShape, storyBeatMin, minSectorTier, requiredTech, requiredPoiDiscovered (+requirePriorPoiVisit), moralDebtOnly, minCargoValue, bountyOnly, maxSecurity/minSecurity, claimsOnly, namedPool, externalOnly. Plus per-shape: weight, pressureCost, cooldownS, proximity, fireWithinWu.
- **Authored one-off missions** — `src/data/missions.js` (DIRTY — other agent active): MISSION_TYPES (race, tow_recovery, demolition, rescue_under_fire, authored_set_piece, capital_boss…), SET_PIECE_MISSIONS (multi-stage authored chains with branches), AUTHORED_SET_PIECES; posting via `missions._sync*` functions and missionSpawningOps.js (DIRTY). DIRTY-adjacent alternatives used in this doc: numbered encounter files, wreckMissions.js (clean), landmarkMissions.js (clean, POI-bound recon quests).
- **Unique wrecks** — `src/data/uniqueWrecks.js` (clean): each wreck declares sectorId, rumorSources (bar/news/comms/bark/mission channels), scanGate, salvageDecision (claim vs hand-over fork), complications (can reference an authored encounter via `encounterRef` — the 130/140/150/160-series encounter files are exactly this), followup news. Placement is hash-seeded from (programSeed, wreckId, sectorId) — determinism built in.
- **Pirate/hunter flavor vocab** — src/data/ambushSignatures.js (disabled_beacon, anchor_spin_echo, cargo_bait, callsign_shadow, sensor_tripline, false_distress_ping, towed_bell_note), src/data/bountyHunters.js, src/systems/bountyHunt.js, src/systems/capitalBossEncounters.js (subsystem-targeting boss fights), NAMED_CAPTAINS escalation-by-composition. All clean except combatDoctrine/maneuver AI files (src/ai/* DIRTY — other agent).
- **Currently git-dirty files touched by this lens** (other agents' live work — proposals route around them): src/systems/encounterDirector.js, src/data/missions.js, src/data/narrative.js, src/data/encounters/358-the-press-camp.js, src/systems/missionBoardOps.js, src/systems/missionObjectiveOps.js, src/ai/combatDoctrine.js, src/ai/maneuver.js, src/ai/reflexes.js, src/render/vfx.js, src/ui/station/barContacts.js, test/encounter-barks.test.mjs. Everything else cited (encounters/index.generated.js, encounters.js, encounterScripts.js, crSituationKit.js, vignetteInterpreter.js, uniqueWrecks.js, wreckMissions.js, landmarkMissions.js, codexPages.js, sectorZones.js, sectors.js) is clean in `git status --short` as of this writing.

