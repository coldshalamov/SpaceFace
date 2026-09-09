# DETAIL BRAINSTORM — Round Two (source quarry)

> **What this is:** the raw idea quarry (500 items) from a round-two analysis, organized into clusters and
> tagged with the *existing system each one should deepen/surface* (per the analysis's own rule: "deepen and
> surface these roles, not invent a parallel system"). **This is source material, not a backlog.** It is
> curated into `DETAIL_DOCTRINE.md` (the governing rules) and `DETAIL_PACKETS.md` (wave-mapped gold packets).
>
> **The diagnosis it answers (the human's words):** the game has a *"flat, empty, cheap feeling"* because we're
> *"missing attention to detail."* The cure is not more features — it's making the systems we already have
> **visible, legible, causal, and emotionally charged.** That IS the point of the waves.
>
> **The filter every item must pass** (the pillars): momentum is the toy · read the battlefield at a glance ·
> one voice at a time · the universe was here before you. Reject anything that doesn't reinforce a pillar.

---

## A. SECTOR IDENTITY & ATMOSPHERE (reuse: `sectors.js`, `sectorZones.js`, palettes, audio, `spaceBackground`)
One-sentence sector identity felt in gameplay (Helios "safe civic core", Ceres "working-class industrial belt",
Pallas "smuggler-pressure frontier", Veil "sensor-poisoned anomaly country"). "Sector postcard" on first
arrival (name, dominant faction, security tier, hazards, primary commodity, rumor line). Signature ambient
sound per sector. Dominant silhouette per sector. Map shows "why this sector matters" at a glance. Each sector
has ≥1 named anchor landmark visible from afar. Planet/moon backdrops with labels + small orbital parallax.
Civilization-density bands (core dense lanes/patrols → frontier sparse/weird/profitable). Starfield shifts by
tier (clean core → dust belts → red sodium pirate space → green/purple anomaly). Local starmap landmarks
("Old Driller Grave", "Customs Spine", "Pallas Smuggler Spur", "Veil Listening Dark").

## B. STATIONS (reuse: `world.js` station spawn, `sectorZones` refinery/checkpoint zones, `dockDeny.js`, `marketNews.js`)
Functional orbit bubble per station (outer traffic ring → patrol ring → docking ring → hard no-fire inner).
Non-dockable stations still get label + reason + scan result + comm denial. Station-TYPE silhouettes (trade-hub
ring, refinery spine, military blockhouse, black-market junk-nest, research antenna array, mining depot, fab
lattice). Broadcast behavior (refinery vents, shipyard cranes, black-market stealth pings, military scan beams,
research dish sweeps). Tiny station-side events (hauler docking, patrol launching, drones repairing hull,
cargo pods tractored). Toll gates near Meridian lanes, Concord customs cones near secure sectors, Drift claim
markers on rich belts, Quiet route beacons (rep/scan gated), Reach graffiti/warning buoys, Choir relic shrines,
Vael wrong-geometry probes that distort HUD labels. Visible-but-not-always-active defenses (turrets track,
drones launch on alert). Local station reputation independent of faction rep. Service personality (same UI,
different voice — Concord "maintenance docket approved", Drift "patch her and pray", Quiet "cash first"). Station
news ticker tied to sectorSim causes. "Why prices changed" tooltip from the sector field driver.

## C. TRAFFIC ROLES — DEEPEN & SURFACE (reuse: `traffic.js` roles hauler/courier/miner/patrol/escort/smuggler/pirate/rescue)
Per role: unique map glyph + movement style + radio vocabulary + consequence-when-attacked. Haulers visibly
heavy (slow turn, long braking, big engine bloom, cargo-pod trails). Couriers anxious (fast, weaving, short
bursts, high-value). Miners sit near rocks and beam seams. Patrols fly wedge loops (not loose orbits). Escorts
physically shadow wards in offset positions. Smugglers use off-angle station approaches. Rescue craft appear
after combat/mining accidents. Pirates loiter outside lane coverage, not in the station's lap. Attacking
haulers → heat + scarcity; miners → ore supply down + Drift anger; rescue craft → moral/reputation scar.
Escorts react when ward attacked. Patrols warn before escalating. Smugglers dump decoy cargo if scanned.
Couriers request escort if chased. Miners cry "claim jumper" if player mines their faction space.

## D. PIRATES & ACES (reuse: `enemies.js`, SG-06 AI, `encounterDirector`, `barks.js`, `salvage.js`)
Scan-before-attack; toll-demand-before-violence; choose targets by value/risk; break off when Concord arrives;
fake civilian until scan range; ambush from cover (wrecks/nebula/dense-rocks/broken-lanes). NAMED crews (Red
Latch Crew, Sker Hooks, The Empty Ledger, Blackwake Knives) and leaders with reputations (Yara No-Cut, Toll
Saint Venn, Mako of the Broken Ring). Named pirates flee sometimes + return bigger if spared ("pirate
promotion"). Defeating a leader briefly increases civilian convoys; ignoring pirates raises route danger.
Ambushes leave wreck fields → later salvage POIs. Pirate bases discoverable via repeated ambush vectors.
Station "pirate rumor heat" ("three haulers vanished near the Pallas-Spur"). Ambush signatures (disabled beacon,
debris line, cargo bait, false distress, sudden sensor fog). Doctrines (toll/thief/slaver/tech-raider/salvage-
jackal/ideological). Nonlethal-unless-resisted / disable-and-board / flee-on-leader-death / surrender-if-disarmed
/ bribe-to-escape branches. Wrecks contain evidence of who funds them. ACES: recurring named combat NPCs with
radio voices, loadout gimmicks, flee-and-remember-humiliation, show up in faction news.

## E. BOUNTY HUNTERS (reuse: hostility model in `scanner.js`, `encounterDirector`)
Neutral unless the player IS the contract. Chase NPCs through the player's area. Player can help/ignore/interfere.
Each target has one signature trick (tether-cutter, mine-dropper, phase-jammer, shield-turtle, ram-plate,
decoy-clone, emergency-jump-spool).

## F. COMBAT READABILITY & ANATOMY (reuse: SG-06, `combat.js`, target panel, `scanner.js`)
Intent banner above enemies (Intercepting/Fleeing/Scanning/Tethering/Reeling/Overheating/Calling-Reinforcements).
Silhouette-based threat readability (tiny swarmers, long sniper triangles, fat brawlers, wide haulers, spoked
drone carriers). Ship-class-glyph + level near target brackets; level compresses hull class + pilot skill +
loadout + faction tech into ONE readable threat badge; relative-threat tier (trivial/fair/dangerous/lethal);
unknown-threat for unscanned. Scan reveals loadout/cargo/bounty/faction/mission-relevance; scan quality by
distance/sensors/nebula/stealth; smugglers show false manifests until deep-scanned; military detects illegal
cargo faster in high-sec. SUBSYSTEM targeting (midgame unlock): engines→drift, weapons→flee/surrender, scanner→
lose-lock, cargo-clamps→spill, shield-emitter→arc-fail, tether-spool→free-object. Pre-attack telegraphs (engine
flare, weapon spool glow, comm bark, target line). Player counter windows (dodge/brake/tether-break/counterpulse/
weak-point/debris). Post-hit readability (shield ripple, armor sparks, hull venting, engine cough, cargo spill).
Ship POSTURE/stability separate from HP (ram/tether-strain/explosive-push destabilize; heavy ships resist;
skilled pilots recover faster). Disable/capture/bribe/rescue/scare-off as outcomes — kills less central.

## G. ENCOUNTER VERBS (reuse: `encounterDirector`, `encounters.js`, tether, `salvage.js`)
Every encounter teaches a physical verb: mass duel (asteroid cover), cargo tug-of-war (both tether one
container), rescue-under-fire (pod drifting into radiation), minefield billiards (tethered debris clears mines),
shielded convoy (break escort formation), sniper-in-dust (scan pulse reveals), rammer cult (front plates),
drone shepherd (drone screen), tether-cutter (line-of-sight management), ion-leech (drains boost → manual drift),
counterpulse duelist, mine-web pirates, cargo-hostage, lawful-recovery-tug (not evil, opposed), civilian-traffic
complication, collateral warnings, combat-court after reckless secure-space kills. Battle aftermath persistence
(wrecks/black-boxes/pods/rumors); revenge contracts from repeatedly-hit factions. Wing morale (kill leader →
scatter; kill escorts → enrage leader; disable comms → no reinforcements). Formations-with-jobs (wedge patrol,
convoy screen, pincer ambush, sniper overwatch, tug-escort recovery, drone shell).

## H. FLIGHT & SHIP IDENTITY (reuse: `flightV3.js`, `ships.js`, tether, impulse charges)
Ship-mass personality per hull (Kestrel twitchy-nose/heavy-body; hauler slow-yaw/huge-inertia; miner stable-
under-load; pirate skiff oversteers; military fighter precise). Loadout affects flight (cargo mass → accel,
armor → turn, winch → mass, ram-plate → collision). Overloaded-cargo handling warning; illegal overloading for
smugglers; insurance grade from reckless collisions; persistent hull scars until repaired. Visible hull modules
(ram-plate, cargo pods, tether spool, charge rack, drill head) + socket identity + damage masks. Newtonian
trick medals (slingshots/drift-kills/tether-saves); training rings near Helios; flight-mastery contracts (fly
through debris, tow without breaking line, stop within docking tolerance, slingshot a beacon). Impulse charges
as physics tools first, damage second (emergent, not tutorialized).

## I. SHIP BUILDS & MODULES (reuse: `ships.js`, `modules.js`, `crafting.js`, BP-09)
Ship BUILD IDENTITIES tied to physics verbs (control-scout, interceptor, hauler-truck, mining-barge, smuggler-
runner, pirate-alpha, recovery-tug, quiet-raider, patrol-fighter, freighter, drift-barge, Vael-weird, Choir-
zeal). Role kits (rammer/tether-controller/sniper/drone-carrier/miner/smuggler/artillery/escort/salvage-tug),
each with one verb + one weakness + one map use + one economy use. Module SYNERGIES not just stats (ram-plate +
heavy-cargo = truck; winch + brake-thrusters = control; drill-amp + quiet-mining = stealth-miner; impulse +
cargo-pods = demolition; scanner + fast-courier = survey; shield + escort-AI = guardian; smuggler-hold + spoof
= contraband; salvage-claw + repair-drones = recycler; drone-rack + weak-hull = commander; sniper-rail + bad-turn
= positioning). Visible upgrade DRAWBACKS (armor slows turn, cargo raises scan/interdiction risk, illegal
modules raise suspicion, high-output mining raises pirate attention, military weapons need permits, alien tech
glitches sensors, prototype overheats, cheap modules fail, damaged modules malfunction). Used-ship market with
quirks/history (ex-patrol, pirate-modified, mining-scarred, corporate-repo, salvage-rebuild); named ships as
rewards not just bigger numbers.

## J. MINING AS SPATIAL PLAY (reuse: Mining 2.0 — seams/heat/fracture/direct-to-cargo/rich-cores/tether-haul/noise)
Spinning asteroids (timing), drifting asteroids (velocity match), overheat-crack, volatile gas pockets, shielded
corporate claim tags, tether-stabilized seams, tow-big-chunks-to-refinery, fragile ore (loses value if rammed),
rare cores draw pirate attention. Mining claim disputes with Drift; black-market buyers for unlicensed ore;
quiet-drill (low attention) vs loud-drill (fast, dangerous) upgrades; mining drones (vulnerable, recall/defend/
upgrade/abandon); field-depletion memory (over-mined safe fields → less profitable); survey-rich fields sellable
as map data; hazard-mining (rare ore in radiation/nebula/dense-rocks/moving-debris).

## K. SALVAGE & WRECKS (reuse: `salvage.js`, `wreckMissions.js`, `sectorSim` losses, tether)
Salvage distinct from mining (cut panels, pull modules, decode black boxes, avoid unstable reactors). Wreck
classes (fresh w/ survivors, ancient w/ lore, battlefield debris, pirate-trap w/ bait, military-classified w/
legal risk, alien w/ sensor distortion). Survivor pods + oxygen timers + tow-to-station + triage (pod/cargo/
evidence/bounty). Black boxes as mission seeds; "return to family/faction/newsbroker/pirates" choices; salvage
permits + illegal-salvage fines. Derelict interiors abstracted as scan/cut/tether puzzles (no walking).
**Wreck fields SEEDED FROM ACTUAL sectorSim offscreen losses** ("who died here?" provenance, loss ledger in
station news, ghost-convoy rumor from repeated wrecks → ambush base). Salvager rivals + scavenger-truce choices;
wreck-beacon hacking; tether-extraction of large modules; unstable-reactor-tow (pull from station before it blows).
"Communicator in the wreckage" starts a character mission; "encrypted manifest" reveals false mass / 47-A / fraud.

## L. CAUSAL WORLD & ECONOMY-DRIVEN MISSIONS (reuse: `dangerModel` reaction-diffusion field, `sectorSim`, `economy.js`, `marketNews.js`)
**"That is gold ore — mine it."** Missions BORN FROM ECONOMY not boards: ore surplus → delivery contracts;
fuel scarcity → high-pay fuel runs; rising danger → escort contracts; Concord influence drop → patrol support;
Reach pressure → bounty clusters; station attacked → repair-material demand; convoy lost → salvage + investigation
POIs; black-market flourish → smuggling offers; Vael influence → anomaly research panic. "Cause ledger" UI
("fuel rose because two Meridian convoys were interdicted near Tethys"). Diegetic strategic intel (station news,
courier rumor, military bulletin, smuggler whisper). Player-caused news. Markets-remember-violence. Security-
response-follows-danger. Pirate-adaptation (shift routes if convoys well-defended). Faction logistics (bases
need fuel/ammo/food/parts). Blockade states. Relief convoys. War-profiteering contracts.

## M. CARGO, CUSTOMS & CONTRABAND (reuse: `cargo.js`, `economy.js`, factions)
Moral cargo (medicine/refugees/prisoners/bodies/evidence/weapons); cargo reputation (medicine→Frontier,
weapons→anger-Concord, contraband→Quiet). Customs-scan gameplay (submit/bribe/spoof/run/dump/hide-in-nebula);
concealment modules + false-bottom pods + sensor-spoof commodity. Commodity condition (volatile/fragile/
refrigerated/radioactive/encrypted/living); cargo physicality (heavy→mass, fragile→breaks-on-impact, illegal→
police-behavior). Visible cargo pods + spills during combat + scoop-or-ignore mid-fight. Stolen-cargo serials;
stations reject stolen goods unless black-market; laundering fee at Quiet; contraband heat (decays / bribes).
Ship-inspection encounters near Customs Gate; wanted-poster UI; pay-fine/fight/flee/forge choices; faction legal
styles (Concord fines, Meridian tolls, Drift grudges, Reach extorts, Quiet bargains, Vael won't negotiate).

## N. MAP & NAVIGATION (reuse: `galaxyMap.js`, `scanner.js`, overview strip)
Overview strip enriched with INTENT (Hostile/Fleeing/Scanning/Docking/Mining/Escorting/Interdicting). Local
tactical map (motion vectors, danger circles, sensor contacts, current route). Set-course from any POI.
Autopilot obeys safety (avoids hazards, exits near hostile scans, asks before lawless entry) + autopilot
incidents (distress/scan/interdiction/derelict/toll/traffic-jam/minefield). Route-risk preview (time/fuel/danger/
scans/tolls/last-prices). Known-vs-live data (staleness), map CONFIDENCE not pure fog, "charted civilization is
known, secrets are discovered", make unknowns seductive. Rumor reliability (verified/stale/suspicious/propaganda),
survivor map annotations, breadcrumb smuggler trails, black routes (Quiet rep), restricted routes (Concord rep),
wormhole instability forecast, scanner ghosts in anomaly space, false map labels during 47-A HUD-corruption.
**NOTE (conflict):** #257 says "keep M local + N nav if standardized" — WE decided to unify to one galaxyMap.
Resolve in favor of the one map (BP-03) but keep its LOCAL/SYSTEM/GALAXY layers doing what M+N did.

## O. COMMS, AUDIO & MUSIC (reuse: `voiceArbiter.js`, `barks.js`, `comms.js`, `audioSystem.js`)
Faction radio cadence (Concord=procedure, Meridian=contracts, Drift=grit, Reach=toll-wolves, Quiet=deniability,
Vael=unsettling-translation, Choir=liturgy, Frontier=exhausted). GLOBAL comms cap + one-line ownership (**this is
voiceArbiter** — extend it), ambient-bark decay, post-combat silence for emotional beats. Audio signatures:
near-miss, engine-by-thrust-demand, tether-strain-by-tension-derivative, shield-by-impact-direction, hull-groans-
under-overload, ore-seam-chime, vent-bonus-chime, hostile-lock vs scan tone (distinct), customs-scan-tone (makes
players sweat), incoming-tether warning, tension-near-break whine, line-cut whipcrack, large-mass groan, cargo-
pod thunk, black-box-recovered sober cue. Adaptive music state (investigation/pressure/combat/reversal/aftermath),
music drop-out on false-mass/story-contradiction. NO voice-acting-required design (text barks + audio signatures);
captions for critical cues; audio priority so shield-break/missile-lock/tether-break/mission-comms never mask.

## P. ONBOARDING / FIRST-15 AS PROOF RITUAL (reuse: `onboarding.js`, `story.js`, voiceArbiter)
First-15 as a PROOF RITUAL not a tutorial: minute 1 = one objective, one beacon, no chatter → first derelict
teaches tether by SAVING something (not explaining a control) → first mining: scan pulse reveals seams, beam
pulse teaches rhythm → first combat: weak pirate tries to toll, flees at low hull (teaches combat AND mercy) →
first station: sell ore, buy one useful module, accept one recommended job → first choice (haul/bounty/survey).
Tutorial-memory (skip learned verbs), mentor-silence (never talk over success), failure-hint only after repeated
failure, objective-arrow language (distance/risk/route/recommended-action), "what just happened?" recap, codex-
unlock-from-action (not menu dump), "ask station contact: why does this matter?"

## Q. 47-A / STORY / EVIDENCE / THE MASS MOTIF (reuse: `story.js`, `narrative.js`, the 47-A slice, cargo/tether)
The mass-discrepancy motif: "evidence has mass", "cargo manifests lie", "the HUD can be wrong (authored moments
only)", sensor-contradiction events (manifest 480kg, inertia impossible), ledger-corruption UI (names briefly
replaced by weights/prices/claim-IDs), "accounting horror" (bodies/cargo/debt interchangeable), moral economy
(every delivery has someone on the other side). False-mass variants (cargo heavier near gates, wreckage accel
wrong, asteroid core bends scanner). Mass-debt faction mechanic (Meridian tracks losses as debt claims). Body-
as-inventory beats. Evidence-spindle variants w/ different faction consequences. Kessler/Vale/Elroy fact graph
+ "no character knows undiscovered facts" validator + rumor contradictions + investigation board (facts/lies/
sources/contradictions). Evidence handling (open/deliver-sealed/copy/destroy/leak/sell), evidence physical risk
(draws scans, affects mass, changes branches), smuggler compartment for evidence, customs recognizes evidence,
pirates HIRED to retrieve it (not random). Per-faction wants (Meridian=chain-of-custody, Concord=suppression,
Quiet=leverage, Vael=untranslatable, Choir=religious, Drift=proof-miners-sacrificed, Frontier=survival-collateral).
Story choices alter traffic-mix/patrol-strictness/bounties/HUD-trust/map-labels/ending-routes; midgame consequence
montage via station news (not cutscene); story facts unlock station services.

## R. HAZARDS & GATES (reuse: `sectorZones` hazard types, `world.js`, `cruise.js`, ring-gates)
Hazard LANGUAGE (radiation rings, nebula fog, debris glints, mine triangles, gravity-wave arcs) + hazard
COUNTERPLAY (avoid/scan/shield/time/tether/pay/upgrade). Radiation damages shields+cargo; nebula blocks sensors
(helps smugglers); dense-asteroid breaks cruise (favors pirates); debris → salvage+collision; minefields
cleared/hacked/detonated-with-tethered-debris; gravity wells bend cruise lanes; solar flares kill scanning; ion
storms disable shields but hide ships; gas clouds explode under energy fire; broken stations leak atmosphere
jets; ancient anomalies invert scanner labels; wormholes feel terrifying. Ring/gate travel: traffic-control
chatter, queues (safe sectors), tolls (Meridian), scans (Concord), sabotage (Reach), unreliable (Vael). Mass-lock
by large objects; cruise-charge-vulnerability (pirates strike during charge); route insurance; emergency beacon
consumable; tow-service-if-stranded (faction cost); fuel as SOFT constraint; dangerous shortcuts; smuggler holes;
patrol-checkpoint mini-scenes.

## S. CONTRACTS ENGINE (reuse: `missions.js`, economy, `dangerModel`, salvage, objects)
Contracts with collateral (fail → lose deposit), optional clauses (no-kills/cargo-intact/no-scan/time-limit/
rescue-priority), moral traps (cargo is weapons, passenger is fugitive, medicine is counterfeit), faction
ambiguity (lawful mission from corrupt official), physical twist (cargo too-massive/unstable/magnetic/radioactive/
tether-only), route planning (safe-long vs dangerous-short). Contracts that START FROM: objects (black box,
drifting communicator, manifest, encrypted beacon), events (pirate chase, bounty kill, patrol scan, convoy
attack), economy (station shortage), reputation (trusted with special job), failure (recover what you lost),
debt (repair bill obligation), ship damage (mechanic favor), rumor (bar contact partial location), map anomaly
(scanner pulse finds impossible return).

## T. DESIGN GUARDRAILS & PROCESS (the anti-flatness constitution — see DETAIL_DOCTRINE.md)
"No feature without counterplay · no UI without decision · no faction without behavior · no station without
purpose · no POI without payoff · no mission without consequence · no random spawn without provenance · no lore
without embodiment · no map marker without action · no enemy without readable intent · no economy change without
cause · no procedural generator without validation · no heroic object as primitive geometry in release · delete
old path when new path ships · one source of truth for tuning constants." Budgets: map-glyph, ship-silhouette,
station-silhouette, comms-per-minute, VFX-per-significance, entity-per-role, memory-per-sector. "Gold packet"
format (one encounter family = one verb + one prop set + one AI behavior + one economy consequence + one test
suite). "Brief mode" (every feature names: player-facing improvement, exact files, no-touch files, tests,
acceptance evidence). Telemetry gates: first-kill/first-trade/first-tether, five-second-screenshot-test (every
entity identifiable), one-voice audit, hitch budget on spawn-heavy events, world-cause-ledger (every change has
a cause), mission-branch reachability, policy-bots (miner/trader/fighter/smuggler/coward) + dominant-strategy
detector + confusion detector.
