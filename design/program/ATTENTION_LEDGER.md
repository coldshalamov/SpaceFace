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
| S-01 | Helios Prime (tier 0, home) | station ring, trade hub, 47-A scene staged at boot, starter traffic | third-shift working class; manifests wrong | ambient encounters tier-0, named hulls, gossip barks | open |
| S-02 | Ceres Belt (first jump) | mining belt, toll gate | company town, quiet dread | wreck dressing, claim tags, miner chatter | open |
| S-03 | Tethys Junction | trade hub + overlays, convoy traffic | commerce bustle, toll friction | convoy radio, customs checks, lane stories | open |
| S-04 | Vesta Forge | forge/industrial sector | hot industry, pride | foundry texture, guild marks, hazard lore | open |
| S-05 | Pallas Drift | drift sector | drift culture | drift-specific props, local factions' texture | open |
| S-06 | Io Reach | reach sector | frontier industry | reach flavor, outpost marks | open |
| S-07 | Charon Expanse | expanse sector | wide empty, eerie | anomalies, radio ghosts, lonely sights | open |
| S-08 | Sker Haven | haven sector (skerris) | haven refuge, skerris culture | haven dressing, refugee texture, shrine bits | open |
| S-09 | Veil Nebula | nebula sector | fogged, strange | nebula phenomena, veil cult texture, sightings | open |
| S-10 | Ashfall Reach | raider territory, rust + sodium | raider poetry, blade culture | totem wrecks, challenge barks, graffiti | open |
| S-11 | Asteroid fields (all sectors) | rocks + seams | geology + claim culture | graffiti (exists), claim marks, micro-props | open |
| S-12 | Landmarks | candle fleet, cathedral, skerris throne | monumental, mournful | lore plaques, memorial arrays, pilgrim traffic | open |
| S-13 | Debris/wreck fields | dead hulks, scraps | aftermath | named dead, salvage notes, kill-marks | open |
| S-14 | Frontier regions (14: Hyperion Cut, Dione Lane, Eris Margin, Eunomia Gulf, Haumea Rift, Kepler Scar, Nereid Shoal, Nyx March, Orcus Shadow, Phoebe Echo, Proteus Well, Rhea Cinder, Sedna Dark, Triton Wake — src/data/frontierRegions/) | far reaches | raw frontier | region dressing, reach flavor, isolation texture — splittable per region when claimed | open |
| S-15 | The Bolus (viscera interior + The Swallowed Rib station — sector_the_bolus) | swallowed interior, organic | viscera palette, biology industry | organ dressing, rib-station texture, harvest flavor | open |

## M. Missions & encounters

| id | surface | what the player sees | register | sanctioned detail | status |
|----|---------|---------------------|----------|-------------------|--------|
| M-01 | 47-A campaign chain | paperwork, spindle, bodies | noir corporate | dossier props, callback lines, witness chatter | open |
| M-02 | Lived vignettes 391-566 | one-shot lived scenes | varies by chain | per-vignette texture pass, follow-ons, callbacks | open |
| M-03 | Authored encounters (010-390, 567-586, 700-706, 901-925, 1100-1212, 1300s, 8201-8205, plus capital-boss/mega-heist/set-piece-authored) | named encounters | varies by class | per-family texture pass, named actors, callbacks | open |
| M-04 | Mission board offers | generated contracts | bureaucratic + colorful | flavor manifests, named clients, odd jobs | open |
| M-05 | Starter jobs (per-hull) | first income | gentle onboarding | employer voices, small twists, thanks | open |
| M-06 | Racing | course, rivals, ladder | sport + grudge | rival personalities, course landmarks, crowd lines | open |
| M-07 | Swarm arena | waves, boss | arcade menace | brood chatter, kill-marks, arena dressing | open |
| M-08 | Black flag path | outlaw arc | dangerous, seductive | underworld contacts, fence culture, wanted texture | open |
| M-09 | Patrol/law events | tolls, checks, heat | procedural authority | inspector types, citation flavor, grudge memory | open |

## H. Hulls & hardware

| id | surface | what the player sees | register | sanctioned detail | status |
|----|---------|---------------------|----------|-------------------|--------|
| H-01 | Player starter hulls | kestrel/pelican/wasp close-up | used-machine pride | stencils (exists), wear, named quirks | open |
| H-02 | NPC hulls on traffic | wasp/helios/ashline variants | faction liveries | per-variant markings, kill tallies, owner names | open |
| H-03 | Module/outfitting catalog | shop list, stats | parts-yard | part flavor, maker marks, install notes | open |
| H-04 | Weapons & gear | stat lines, fire feel | industrial | recoil/read feedback, lore tags, wear | open |

## T. Stations & interiors

| id | surface | what the player sees | register | sanctioned detail | status |
|----|---------|---------------------|----------|-------------------|--------|
| T-01 | Station screens (ledger, outfitting, board) | menus, lists | ORRERY instrument | micro-copy, posters, notices, kiosk ads — content only; ORRERY owns layout | open |
| T-02 | Station life (people, comms) | barks, radio | crowded, gossiping | named regulars, rumors, overheard plots | open |
| T-03 | Dock interiors | hangar bays | workyard | dressed bays per faction, signage, workers | open |
| T-04 | Claim outposts & mining sites | frontier rigs | improvised, proud | camp texture, owner logs, warning signs | open |

## V. Verbal/ambient layer

| id | surface | what the player sees | register | sanctioned detail | status |
|----|---------|---------------------|----------|-------------------|--------|
| V-01 | Comms popups/barks | radio chatter | sector voice | per-sector bark banks, traffic flavor | open |
| V-02 | Objective/story tracker | guide text | clipped, useful | voice per arc, deadpan flavor | open |
| V-03 | Help/codex | guides | manual tone | lore sidebars, technician notes | open |
| V-04 | Death/defeat screens | after-action | insurance corporate | per-cause lessons (exists), condolences, bills | open |

## E. Experience edges

| id | surface | what the player sees | register | sanctioned detail | status |
|----|---------|---------------------|----------|-------------------|--------|
| E-01 | Onboarding rail + first hour (minutes 0-60) | tutorial rail then open space | should be alive | rail texture, tier-0 deck, guided beat, ambient traffic — see dossier | open |
| E-02 | Save/load & persistence | resume flow | invisible | continuity touches, remembered state flavor | open |
| E-03 | Economy surfaces | prices, tolls, payouts | market math | margin drama, price-talk, debt culture | open |
| E-04 | Easter eggs & secrets | rare one-offs | reward the curious | hidden props, coded barks, ritual sights | open |

## U. Screen families (33 registered screens in src/ui/uiRoot.js + helper panels — content/micro-copy rows only; ORRERY owns layout)

| id | surface | register | sanctioned detail | status |
|----|---------|----------|-------------------|--------|
| U-01 | Front door: mainMenu, newGame, credits, demoEnd, motionAsk (first-boot) | threshold | title texture, cold-open polish | open |
| U-02 | Session: pause, settings, saveLoad, saveNotices | utility | micro-copy, confirm flavor | open |
| U-03 | Charts: galaxyMap (live map), starmap, localmap | navigational | map annotations, rumor pins | open |
| U-04 | Career/records: missionLog, manifest, achievements, statistics, techTree, footprint, resultsSheet | archival | record texture, footnotes, stamps | open |
| U-05 | Labs/modes: crucible, drill, sandbox, physicsVenues, range, raceBoard, survival/swarm drafts | testbed | lab flavor, mode posters | open |
| U-06 | Replay/share: replay, flightFootage, theater, clips, shareCode | broadcast | broadcast flavor, credits | open |
| U-07 | Automation/industry: automationPanel, industryReadout (passive-income UVP) | ledger | plant flavor, yield talk | open |
| U-08 | Audio surface: stationLifeAudio, audioRecipes | ambient | audio texture rows — lands via audio dossier | open |
| U-09 | System surfaces: crew, nemesis, mail, docket, survey/scan, ship (shared shipworks stage) | operational | system flavor, notices | open |

Deferred, already owned: **flight HUD** → `design/HUD_FLIGHT_ATTENTION.md`;
**UI layout/redesign** → ORRERY lane (`design/frontend/ORRERY.md`).
Implicit routing: `stationScreen` → T-01, `baseScreen` → T-04, `gameOverScreen` → V-04,
`helpScreen`/`codexScreen` → V-03.

Rows may be split (e.g. M-02 → one row per vignette) when claimed. New surfaces
get appended; never renumber landed ids.
