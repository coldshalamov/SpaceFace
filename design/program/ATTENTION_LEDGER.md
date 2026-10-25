<!-- LIFETIME: ACTIVE_PROGRAM -->
# ATTENTION LEDGER — every surface a player can reach, and how much love it has

Claimable rows for the ATTENTION PROGRAM (`ATTENTION_PROGRAM.md`). One row = one
surface + one audit → drafts → tribunal → implement cycle, each gate stamped
`✓3` (the 3× rule). Status stages: `open → audit✓3 → plan✓3 → impl✓3 → landed`.
Mark a row `CLAIMED <agent> <stage>` in place while working; artifacts live in
`design/program/attention/`.

Row format: `id | surface | what the player sees | register | sanctioned detail | status`

## S. Sectors & space (ten core sectors + The Bolus + fourteen frontier regions — src/data/sectors.js, src/data/frontierRegions/)

| id | surface | what the player sees | register | sanctioned detail | status |
|----|---------|---------------------|----------|-------------------|--------|
| S-01 | Helios Prime (tier 0, home) | station ring, trade hub, 47-A scene staged at boot, starter traffic | third-shift working class; manifests wrong | ambient encounters tier-0, named hulls, gossip barks | shipped 1312cc53bb |
| S-02 | Ceres Belt (first jump) | mining belt, toll gate | company town, quiet dread | wreck dressing, claim tags, miner chatter | shipped 1312cc53bb |
| S-03 | Tethys Junction | trade hub + overlays, convoy traffic | commerce bustle, toll friction | convoy radio, customs checks, lane stories | shipped 1312cc53bb |
| S-04 | Vesta Forge | forge/industrial sector | hot industry, pride | foundry texture, guild marks, hazard lore | shipped 1312cc53bb |
| S-05 | Pallas Drift | drift sector | drift culture | drift-specific props, local factions' texture | shipped 1312cc53bb |
| S-06 | Io Reach | reach sector | frontier industry | reach flavor, outpost marks | shipped 1312cc53bb |
| S-07 | Charon Expanse | expanse sector | wide empty, eerie | anomalies, radio ghosts, lonely sights | shipped 1312cc53bb |
| S-08 | Sker Haven | haven sector (skerris) | haven refuge, skerris culture | haven dressing, refugee texture, shrine bits | shipped 1312cc53bb |
| S-09 | Veil Nebula | nebula sector | fogged, strange | nebula phenomena, veil cult texture, sightings | shipped 1312cc53bb |
| S-10 | Ashfall Reach | raider territory, rust + sodium | raider poetry, blade culture | totem wrecks, challenge barks, graffiti | shipped 1312cc53bb |
| S-11 | Asteroid fields (all sectors) | rocks + seams | geology + claim culture | graffiti (exists), claim marks, micro-props | shipped 1312cc53bb |
| S-12 | Landmarks | candle fleet, cathedral, skerris throne | monumental, mournful | lore plaques, memorial arrays, pilgrim traffic | shipped 1312cc53bb |
| S-13 | Debris/wreck fields | dead hulks, scraps | aftermath | named dead, salvage notes, kill-marks | done 2026-10-24 |
| S-14 | Frontier regions (14: Hyperion Cut, Dione Lane, Eris Margin, Eunomia Gulf, Haumea Rift, Kepler Scar, Nereid Shoal, Nyx March, Orcus Shadow, Phoebe Echo, Proteus Well, Rhea Cinder, Sedna Dark, Triton Wake — src/data/frontierRegions/) | far reaches | raw frontier | region dressing, reach flavor, isolation texture — splittable per region when claimed | shipped 1312cc53bb |
| S-15 | The Bolus (viscera interior + The Swallowed Rib station — sector_the_bolus) | swallowed interior, organic | viscera palette, biology industry | organ dressing, rib-station texture, harvest flavor | shipped 1312cc53bb |

## M. Missions & encounters

| id | surface | what the player sees | register | sanctioned detail | status |
|----|---------|---------------------|----------|-------------------|--------|
| M-01 | 47-A campaign chain | paperwork, spindle, bodies | noir corporate | dossier props, callback lines, witness chatter | shipped 4a6e9c7c3a |
| M-02 | Lived vignettes 391-566 | one-shot lived scenes | varies by chain | per-vignette texture pass, follow-ons, callbacks | shipped 4a6e9c7c3a |
| M-03 | Authored encounters (010-390, 567-586, 700-706, 901-925, 1100-1212, 1300s, 8201-8205, plus capital-boss/mega-heist/set-piece-authored) | named encounters | varies by class | per-family texture pass, named actors, callbacks | shipped 4a6e9c7c3a |
| M-04 | Mission board offers | generated contracts | bureaucratic + colorful | flavor manifests, named clients, odd jobs | shipped 4a6e9c7c3a |
| M-05 | Starter jobs (per-hull) | first income | gentle onboarding | employer voices, small twists, thanks | shipped 4a6e9c7c3a |
| M-06 | Racing | course, rivals, ladder | sport + grudge | rival personalities, course landmarks, crowd lines | shipped 4a6e9c7c3a |
| M-07 | Swarm arena | waves, boss | arcade menace | brood chatter, kill-marks, arena dressing | shipped 4a6e9c7c3a |
| M-08 | Black flag path | outlaw arc | dangerous, seductive | underworld contacts, fence culture, wanted texture | shipped 4a6e9c7c3a |
| M-09 | Patrol/law events | tolls, checks, heat | procedural authority | inspector types, citation flavor, grudge memory | shipped 4a6e9c7c3a |

## H. Hulls & hardware

| id | surface | what the player sees | register | sanctioned detail | status |
|----|---------|---------------------|----------|-------------------|--------|
| H-01 | Player starter hulls | kestrel/pelican/wasp close-up | used-machine pride | stencils (exists), wear, named quirks | shipped 9b1a6664d7 |
| H-02 | NPC hulls on traffic | wasp/helios/ashline variants | faction liveries | per-variant markings, kill tallies, owner names | shipped 9b1a6664d7 |
| H-03 | Module/outfitting catalog | shop list, stats | parts-yard | part flavor, maker marks, install notes | shipped 9b1a6664d7 |
| H-04 | Weapons & gear | stat lines, fire feel | industrial | recoil/read feedback, lore tags, wear | shipped 9b1a6664d7 |

## T. Stations & interiors

| id | surface | what the player sees | register | sanctioned detail | status |
|----|---------|---------------------|----------|-------------------|--------|
| T-01 | Station screens (ledger, outfitting, board) | menus, lists | ORRERY instrument | micro-copy, posters, notices, kiosk ads — content only; ORRERY owns layout | shipped 9b1a6664d7 |
| T-02 | Station life (people, comms) | barks, radio | crowded, gossiping | named regulars, rumors, overheard plots | shipped 9b1a6664d7 |
| T-03 | Dock interiors | hangar bays | workyard | dressed bays per faction, signage, workers | open |
| T-04 | Claim outposts & mining sites | frontier rigs | improvised, proud | camp texture, owner logs, warning signs | open |

## V. Verbal/ambient layer

| id | surface | what the player sees | register | sanctioned detail | status |
|----|---------|---------------------|----------|-------------------|--------|
| V-01 | Comms popups/barks | radio chatter | sector voice | per-sector bark banks, traffic flavor — joint with §1P X-06 | done 2026-10-24 |
| V-02 | Objective/story tracker | guide text | clipped, useful | voice per arc, deadpan flavor | shipped 9b1a6664d7 |
| V-03 | Help/codex | guides | manual tone | lore sidebars, technician notes | shipped 9b1a6664d7 |
| V-04 | Death/defeat screens | after-action | insurance corporate | per-cause lessons (exists), condolences, bills — joint with §1P X-09 | shipped 9b1a6664d7 |

## E. Experience edges

| id | surface | what the player sees | register | sanctioned detail | status |
|----|---------|---------------------|----------|-------------------|--------|
| E-01 | Onboarding rail + first hour (minutes 0-60) | tutorial rail then open space | should be alive | rail texture, tier-0 deck, ambient traffic — see dossier; joint with §1P X-01 (directions 1-3); guided beat joint with §1P X-04; raid beat joint with §1P X-02 | shipped 9b1a6664d7 |
| E-02 | Save/load & persistence | resume flow | invisible | continuity touches, remembered state flavor | shipped 9b1a6664d7 |
| E-03 | Economy surfaces | prices, tolls, payouts | market math | margin drama, price-talk, debt culture | shipped 9b1a6664d7 |
| E-04 | Easter eggs & secrets | rare one-offs | reward the curious | hidden props, coded barks, ritual sights | shipped 9b1a6664d7 |

## U. Screen families (33 registered screens in src/ui/uiRoot.js + helper panels — content/micro-copy rows only; ORRERY owns layout)

| id | surface | register | sanctioned detail | status |
|----|---------|----------|-------------------|--------|
| U-01 | Front door: mainMenu, newGame, credits, demoEnd, motionAsk (first-boot) | threshold | title texture, cold-open polish | shipped 9b1a6664d7 |
| U-02 | Session: pause, settings, saveLoad, saveNotices | utility | micro-copy, confirm flavor | shipped 9b1a6664d7 |
| U-03 | Charts: galaxyMap (live map), starmap, localmap | navigational | map annotations, rumor pins | open |
| U-04 | Career/records: missionLog, manifest, achievements, statistics, techTree, footprint, resultsSheet | archival | record texture, footnotes, stamps | shipped 9b1a6664d7 |
| U-05 | Labs/modes: crucible, drill, sandbox, physicsVenues, range, raceBoard, survival/swarm drafts | testbed | lab flavor, mode posters | shipped 9b1a6664d7 |
| U-06 | Replay/share: replay, flightFootage, theater, clips, shareCode | broadcast | broadcast flavor, credits | open |
| U-07 | Automation/industry: automationPanel, industryReadout (passive-income UVP) | ledger | plant flavor, yield talk | shipped 9b1a6664d7 |
| U-08 | Audio surface: stationLifeAudio, audioRecipes | ambient | audio texture rows — lands via audio dossier | shipped 9b1a6664d7 |
| U-09 | System surfaces: crew, nemesis, mail, docket, survey/scan, ship (shared shipworks stage) | operational | system flavor, notices | shipped 9b1a6664d7 |

Deferred, already owned: **flight HUD** → `design/HUD_FLIGHT_ATTENTION.md`;
**UI layout/redesign** → ORRERY lane (`design/frontend/ORRERY.md`).
Implicit routing: `stationScreen` → T-01, `baseScreen` → T-04, `gameOverScreen` → V-04,
`helpScreen`/`codexScreen` → V-03.

Rows may be split (e.g. M-02 → one row per vignette) when claimed. New surfaces
get appended; never renumber landed ids.
