<!-- LIFETIME: VOLATILE -->
# INFERENCE ideas — directed grunt catalog

Law: [`INFERENCE_LANES.md`](./INFERENCE_LANES.md) §0.1. Feelings and inventions live in
[`../../build_map.md`](../../build_map.md) §23. This file is the other pass.

A line here is already considered. Do that change. Do not invent a system, a second
encounter for the same beat, a new faction, or a better idea. If the done check is already
true in the live owner, mark the line SHIPPED with "already true" and take the next line.
If the line fights the vision, move it to CUT with one causal sentence.

## How to take a line

1. Take the first OPEN line whose paths are not in a live `NOW.md` row and not named by a
   CLAIMED line. One line per agent.
2. Mark it CLAIMED with today's date and your thread, in the same edit as your NOW row.
3. Change only the owners the line names. Prove the done sentence on a fixed seed (4242
   unless the line says otherwise) with the live owner or a focused test. Do not add a package
   to finish the line. If a library is the honest fix, write that in one sentence and leave the
   line; a §23 campaign adopts it.
4. On ship: status SHIPPED, unit id, commit. Do not expand the line into a follow-on feature.
5. The next line you take is a different group (picture, verb, world, instrument) when one
   is free.

Groups may be worked in parallel when their paths do not overlap. Lines that share
`015-opening-hauler-raid.js` are one agent.

The tools are wired in build-map lane A2, in order: `AQ-CAS`, `AQ-LOD`, `AQ-LIGHT`,
`AQ-SURFACE`, `AQ-VOICE`, `AQ-HIT` (`build_map.md` §23.4). TOOL-01 through TOOL-04 can be
auditioned any time. TOOL-05 and TOOL-06 wait until `AQ-SURFACE` is committed. TOOL-07 waits
on `AQ-CAS`. TOOL-08 waits on `AQ-LIGHT`. TOOL-09 waits on `AQ-LOD`. Do not start an AQ task
from this catalog.

## TOOL — polish with the files on disk

Reference root: `assets/reference/cc0/`. Not runtime until a line promotes one file.

| Id | Player-visible change | Paths | Done | Do not | Status |
|---|---|---|---|---|---|
| TOOL-01 | A denied latch ticks instead of clicking like a menu | `assets/reference/cc0/kenney/interface/Audio/tick_001.ogg` or `error_001.ogg`, plus the deny cue in `src/audio/` | The deny cue id plays one of those files, and a successful latch still plays a different id | Use `confirmation_001.ogg`. Play it every frame while the button is held | SHIPPED |
| TOOL-02 | Hover and tab are two different interface sounds | `assets/reference/cc0/kenney/interface/Audio/`, `src/data/audioRecipes.js` | `sfx_ui_hover` and `sfx_ui_tab` bind two different Kenney files, neither of them `ui_click` | Retune the combat mix | OPEN |
| TOOL-03 | The authored starter shot stays the starter shot | `assets/audio/wpn/wpn_pulse.wav`, `assets/reference/cc0/kenney/sci-fi/Audio/laserSmall_000.ogg` | Listen to both. Keep `wpn_pulse.wav` unless the Kenney file is clearly the heavier, more mechanical shot, and say which you kept | Replace the pulse because a free file exists | SHIPPED |
| TOOL-04 | A light metal kiss and a heavy metal slam are different recordings if the live cues are still one sample | `assets/reference/cc0/kenney/impact/Audio/impactMetal_light_000.ogg`, `impactMetal_heavy_000.ogg`, the impact recipes | The light cue and the heavy cue resolve to two files. If the authored `impact_kiss` / `impact_hull` already differ, leave them and mark this SHIPPED already true | Layer both files on one hit | OPEN |
| TOOL-05 | The seal reads drier or oilier in the direction Rubber004 actually is | `assets/reference/cc0/ambientcg/Rubber004/Rubber004_1K-JPG_Roughness.jpg`, `matte_seal` in `src/render/industrialMaterialFamilies.js` | The family's roughness moves toward the scan, and the color of the seal stays the painted family color | Paste the rubber color photo onto a hull | OPEN |
| TOOL-06 | Ceramic stays matte next to painted metal | `assets/reference/cc0/ambientcg/Tiles132C/Tiles132C_1K-JPG_Roughness.jpg`, `thermal_ceramic` in the same families file | Ceramic roughness stays higher than `painted_shell`, using the tile scan as the check | Assign the tile color as a station albedo | OPEN |
| TOOL-07 | Full resolution is not sharpened on top of an already sharp frame | the CAS pass from AQ-CAS, once it exists | A fixture or a read of the pass shows strength 0 when render size equals canvas size | Delete the pass | OPEN |
| TOOL-08 | The foundry light never becomes the sky | the environment wiring from AQ-LIGHT, once it exists | `scene.background` is still the sector plate while the foundry HDRI is assigned as light | Turn the HDRI up until it beats the muzzle | OPEN |
| TOOL-09 | The player's hull is never the simplified LOD | the LOD output from AQ-LOD, once it exists | The player def stays on the full mesh. One other hull may use the simplify | Run `meshopt_simplifySloppy` on anything | OPEN |

This catalog is the assignment list. It is not the 20-line cap on owner-dropped raw notes
(that cap is in [`INFERENCE_CONVERGENCE.md`](./INFERENCE_CONVERGENCE.md)). Do not add a vague
line here. A new line names the player-visible change, the paths, the done check, and what
not to invent.

## PICTURE

| Id | Player-visible change | Paths | Done | Do not | Status |
|---|---|---|---|---|---|
| PIC-01 | An NPC Kestrel is the same complete body as the player Kestrel, not a kit of parts | `src/render/partsLibrary.js` | A spawned NPC kestrel resolves through the packaged whole-ship allowlist | Unhide the procedural kit. Author a new GLB | SHIPPED |
| PIC-02 | Common rocks are not one texture painted five times | `src/render/rockSurfaceLibrary.js` | At least two instance variants differ in tint or ORM at chase scale | Change the instance pool or the rock mesh | SHIPPED |
| PIC-03 | Kit and hero decals stay up at the distance the code comment says they still read | `src/render/ships/shipKit.js`, `src/render/ships/kestrelHero.js` | Decals are not hidden at the current LOD1 cut while the comment still claims they read much farther | Author new LOD meshes | SHIPPED |
| PIC-04 | The hero fan stops when the sim pauses | `src/render/ships/kestrelHero.js` | The fan advances on sim time, not `performance.now()` | Rewrite the hero GLB | SHIPPED |
| PIC-05 | Pickup spiral motes do not draw far off the glass | `src/render/pickupMotionPresentation.js` | Spiral VFX uses the live table draw radius | Retune the sim magnet range | SHIPPED |
| PIC-06 | A wreck you just made, on screen, is not hidden for the opening pipeline hold | `src/render/pipelineAutoFlushPolicy.js`, `src/render/renderer.js` | An on-glass fresh wreck submits during the hold the same way on-glass rocks do | Remove the hold | OPEN |
| PIC-07 | A large wreck does not swallow the chase camera | `src/render/renderer.js` | `'wreck'` is in the camera-clearance kinds when the span is already large enough for stations | Write a general occluder pass | OPEN |
| PIC-08 | A shove-kill and a gun-kill do not share the generic explosion schedule | `src/render/combat/phasedExplosions.js`, `src/presentation/causalVfxGrammar.js` | The schedule id follows the real cause already in the grammar | Grow the explosion solver | SHIPPED 26732571a |
| PIC-09 | Starter weapons scar with their own heat, not the unknown-weapon default | `src/render/weapons/contactMarks.js` | `heatForWeaponVariant` maps the starter ids in `vfxProfiles.js` to a named heat, not the unknown default | Redesign the scar atlas | SHIPPED |
| PIC-10 | The graphics lab does not teach a camera-facing halo as the method | `src/render/graphicsLab.js` | The lab-only halo demo is relabeled or restaged off the banned card | Change production VFX | OPEN |
| PIC-11 | A missing place does not appear as a published cube | `src/render/partsLibrary.js` | `buildFallbackPlaceProp` keeps an empty substrate or marker | Add fallback geometry | SHIPPED |
| PIC-12 | Hull tallies and patches read at the default chase | `src/render/livingHullPresentation.js` | The mark is sharper than the current 256×64 smear at chase distance | Add a second decal system | SHIPPED |

## VERB

| Id | Player-visible change | Paths | Done | Do not | Status |
|---|---|---|---|---|---|
| VERB-01 | When the opening raid times out, the ships are still there | `src/data/encounters/015-opening-hauler-raid.js` | `raid_over` does not `despawnAll`; hauler and raiders remain ordinary entities | Add a fence route (§22 F11). Add encounter 016 | SHIPPED |
| VERB-02 | The opening raid is already happening; it does not wait for accept | `src/data/encounters/015-opening-hauler-raid.js` | No offer choice and no pass-on-timeout; the fight is in the sky | Rewrite spawn range or timing (§22 A1) | SHIPPED 0c4293e4d |
| VERB-03 | The hitch hint can fire on a heavy hauler, not only an express liner | `src/systems/onboarding.js` | Locking the opening mule can show the existing hitch hint once | Add a tow force (§22 F14). Flip the 47-A pin | OPEN |
| VERB-04 | The first Well you drop tells you, once, that you dropped it | `src/systems/onboarding.js` | The first player `fields:deployed` emits one hint and does not repeat that session | Change well force or radius | OPEN |
| VERB-05 | A detected stunt says its name once, as a receipt | `src/systems/stuntGrammar.js`, `src/ui/hudAttention.js` | `stunt:trickDetected` admits one receipt with the trick name | Add a combo meter. Toast a shove, hit, or dock sentence (§22 G3) | OPEN |
| VERB-06 | The opening hauler's cargo can cook when it slams | `src/data/encounters/015-opening-hauler-raid.js` | Its commodity is one `lootShards.js` already treats as a volatile slam | Add an explosive system. Retint pods (§22 F4) | OPEN |
| VERB-07 | Rocks dropped for the opening fight are not wiped at 45 seconds | `src/systems/terrainAnchors.js` | Those anchors survive until the player leaves the neighbourhood | Build a machine (§22 F13) | OPEN |
| VERB-08 | The throw diamond hides when you are the body that will move | `src/ui/masslineHud.js` | A heavy anchor or self-sling does not draw the meeting diamond | Draw a path ghost (§22 F1). Change release impulse | OPEN |
| VERB-09 | Helios sells one stack of impulse charges | Helios market or station stock data consumed by `src/systems/economy.js` | A new game can buy `cmdty_impulse_charge` at Helios Station | Change the charge solver or the ten-verb curve (§22 B8) | OPEN |
| VERB-10 | A pod or chip on your rope is not vacuumed into the hold | `src/systems/mining.js` | `_updatePickups` skips a Massline-latched pickup | Change credit amounts (§22 F6) | OPEN |
| VERB-11 | Spilled freight stays in the world long enough to rope | `src/systems/traffic.js` and the pickup TTL it uses | On seed 4242 a Helios spill still exists when a cruise-speed ship reaches latch range | Add a scavenger behaviour | OPEN |
| VERB-12 | A wreck made in this swarm round can be roped before the shop | `src/systems/tetherGameplay.js` | A survival-cohort wreck is a legal Massline target in the round that spawned it | Persist it across the shop (§22 B3) | OPEN |
| VERB-13 | One flight key dumps the selected lot as the payload body that already exists | `src/systems/input.js`, `src/systems/cargo.js` | The key emits `cargo:jettisoned` and a payload body exists | Add a minigame. Build the hot-dock spill (§22 F7) | OPEN |

## WORLD

| Id | Player-visible change | Paths | Done | Do not | Status |
|---|---|---|---|---|---|
| WORLD-01 | The Choir refuel depot has a missions board | `src/data/sectors.js` (`station_depot3` services) | Docking the Vesta depot shows Missions | Invent a Choir capital or move Vesta | SHIPPED |
| WORLD-02 | Vesta traffic includes one named hauler | `src/data/laneContacts.js`, `src/systems/traffic.js` | `sector_vesta_forge` can stamp that contact id | Add an encounter shape | SHIPPED |
| WORLD-03 | The Choir-Tender wreck is a wreck on the Helios chart, not another derelict beacon | `src/data/sectors.js`, `src/data/uniqueWrecks.js` | Helios POIs include `type: 'wreck'` bound to `wreck_choir_tender` | Invent a new unique drop | OPEN |
| WORLD-04 | Salvaging the Choir-Tender draws the investigator the wreck data already describes | a new encounter module beside `src/data/encounters/150-unique-wreck-silver-draft-cleaner.js`, wired from `uniqueWrecks.js` | The director catalog contains that id and it offers the existing complication choice plus one hull | Invent a mission type or a second Helios unique wreck | OPEN |
| WORLD-05 | A new game's Helios bar can name the Silver-Draft before you have scanned it | `src/ui/station/barContacts.js`, `src/ui/uniqueWreckRumorSurface.js` | `generateContacts('station_helios', new game)` can include rumor `bar.helios_meridian.silver_draft` | Invent a wreck class | OPEN |
| WORLD-06 | The Helios locker reads as a cache | `src/data/sectors.js` (`poi_helios_locker`) | Its POI type is `cache` and the scanner uses the cache label | Add a pirate base or a new POI type | SHIPPED |
| WORLD-07 | Sker Bazaar has ships on the apron | `src/data/sectors.js` (`sector_sker_haven` traffic) | Seed 4242 spawns at least two non-player ships near `station_sker` | Raise `enemyDensity`. Add an outlaw encounter | OPEN |
| WORLD-08 | A Collective hull hails in yard language, not Concord boilerplate | `src/data/factionContactGrammar.js`, `src/data/barks.js` | `FACTION_CONTACT_GRAMMAR.faction_dmc` exists and a Ceres trader or patrol line uses it | Change heat math. Add a faction | OPEN |
| WORLD-09 | A Meridian hull hails in invoice language | `src/data/factionContactGrammar.js`, `src/data/barks.js` | A Tethys trader line uses an MTS-specific sentence | Retune prices | OPEN |
| WORLD-10 | Helios outer rocks are not the same type as the starter field | `src/data/sectors.js` Helios fields | `f_helios_outer` uses a second existing asteroid type | Change beam rate, hold size, tax, or next-field distance (§22 A3) | SHIPPED |
| WORLD-11 | Io Reach traffic can include one named courier | `src/data/laneContacts.js` | `pickNamedLaneContact` can return an Io-only id | Add a station | OPEN |
| WORLD-12 | Charon traffic can include one named miner | `src/data/laneContacts.js` | The Expanse sector ids include that contact | Add a claimable | OPEN |
| WORLD-13 | Tethys has one always-there dressing piece made from a place that already exists | `src/data/worldOneOffs.js`, `src/systems/world.js` | Activating Tethys spawns that `placeId` near the customs gate or the hub | Add a GLB or a mission | OPEN |
| WORLD-14 | The Veil research station can run a research side event | `src/data/stationSideEvents.js` | `planStationSideEvents` for `research` can pick a research-specific kind | Spawn a combat ship | OPEN |
| WORLD-15 | The Sker Throne scan agrees with whether it can be claimed | `src/data/sectors.js` (`poi_sker_throne`), `src/data/claimableBodies.js` | The claimable flag and the scan sentence match | Add a teleporter | OPEN |
| WORLD-16 | The Helios liner has a name when you lock it | `src/data/laneContacts.js`, `src/systems/traffic.js`, `src/systems/barkDirector.js` | The lock title is the liner's name, not "Cargo Hauler" | Sell tickets or change the economy | OPEN |
| WORLD-17 | Coalition HQ offers the ace duel that already exists | `src/data/missions.js`, `src/systems/setPieceMissionOffers.js` | `station_coalition` board can list `ace_duel` | Spawn the ace in Helios ambient. `enemyDensity` 0 stays | OPEN |
| WORLD-18 | One Helios passenger or cargo offer reveals a moral trap that already exists | `src/data/moralTraps.js`, `src/systems/moralTrap.js` | Accepting a seeded Helios offer emits `revealLine` once | Add a sixth trap type | OPEN |
| WORLD-19 | Vesta's slag hazard and its radiation weather occupy the same neighbourhood | `src/data/sectors.js`, `src/data/environmentalMachinery.js` (`vesta_radiation_belt`) | The hazard center sits inside that weather radius | Add a third weather sector | OPEN |
| WORLD-20 | Someone is sightseeing at the Helios memorial | `src/systems/traffic.js`, `src/data/regionalEcology.js` | Seed 4242 has a living `trafficRole === 'tourist'` inside `zone_helios_memorial` | Add hostiles to Helios | OPEN |

## INSTRUMENT

| Id | Player-visible change | Paths | Done | Do not | Status |
|---|---|---|---|---|---|
| INST-01 | Field, mass-seed, and planet tells are the flight instrument, not three cyan pills | `src/ui/fieldHud.js`, `src/ui/massSeedHud.js`, `src/ui/planetHud.js` | Those three inject no Segoe UI / `rgba(10, 18, 28` cards; they use tokens already on `#hud` | Invent a new HUD product | SHIPPED |
| INST-02 | The comms fan matches the power rail | `styles/commsradial.css` | `#sf-commsfan` has no `--sf-surface` fill and no 6px web radius; it uses the flight bezel or glass tokens | Restyle the whole HUD | OPEN |
| INST-03 | The Crucible armory is not a cyan storefront | `styles/crucible.css` | `.sf-cru-card` uses the kit or deckplate face; `#8ee8ff` is not the fill or outline | Redesign the Crucible door | OPEN |
| INST-04 | The prompt deck matches the flight cluster | `styles/prompt-deck.css` | No 10px consumer card; the deck uses the same glass or bezel language as the flight cluster | Add a new prompt system | OPEN |
| INST-05 | Resting flight does not wear the aerospace G-LOC sheet | `index.html`, `styles/hud.css` | G-LOC and EMP rules apply only while that effect is on | Delete the effects. Repaint station | OPEN |
| INST-06 | The boot screen does not write to instruments that are not in the page | `src/ui/loadingTerminalArt.js` | No queries for `data-loading-diag-stream`, `-hex`, `-subsystems`, or `-segments` | Invent a second boot story | OPEN |
| INST-07 | The boot picture is not a 640×380 buffer stretched over the window | `index.html` | `#boot-terminal-canvas` is not a tiny buffer scaled to the viewport | Replace the loader with a new product | OPEN |
| INST-08 | An unknown gun does not sound like the starter pulse | `src/audio/audioSystem.js` (`weaponRecipeFor`) | A weapon id with no family resolves to a named generic combat recipe, or fails closed, never `sfx_wpn_pulse_laser` | Author a new sample bank (§22 C5 is the verb table) | OPEN |
| INST-09 | Doctrine setup, telegraph, commit, and aftermath are four cues | `src/audio/audioSystem.js` | Those four cue ids resolve to four recipe ids, not all `sfx_encounter_escalation` | Add a music system | OPEN |
| INST-10 | Hover and tab are not the click sample at another pitch | `src/data/audioRecipes.js` | `sfx_ui_hover` and `sfx_ui_tab` bind distinct samples, or synth-only, not `ui_click` | Replace the combat mix | OPEN |
| INST-11 | A capital's pre-detonation ticks are not menu hovers | `src/audio/audioSystem.js` | Those ticks use a combat recipe, not `sfx_ui_hover` | Retune the explosion | OPEN |
| INST-12 | Station primary buttons are the same keys as the rest of the kit | `styles/station-orbital.css` | Primary station verbs are `fh-key` or `data-sf-role="primary"`; `button:not(.fh-key)` does not paint a second control language | Redesign the station (that is §23 CV-KIT) | OPEN |
| INST-13 | Docked, the station has the room tone that already exists | `src/audio/audioSystem.js` | Dock starts `station_hum_loop`; undock stops it | Author a new loop | OPEN |
| INST-14 | "SHIELD DOWN" does not float over the fight | `src/ui/floatingText.js` | `combat:damage` does not spawn that floater | Delete the objective line (§22 G3) | SHIPPED |
| INST-15 | The local map frame uses the kit, not a one-off plate | `src/ui/screens/localmap.js` | Frame and labels use kit or deckplate tokens | Rebuild the map (that is §22 C2 if it is the chart) | OPEN |
| INST-16 | The UI bench boot is the game boot | `tools/ui-bench.html` | The bench does not load the green `styles/orbital.css` boot overlay on top of `styles/intro.css` | Change the production intro palette | OPEN |

## CLAIMED

| Id | Date | Thread | Paths |
|---|---|---|---|

| PIC-02 | 2026-09-22 | devin-inference-10 | `src/render/rockSurfaceLibrary.js` |
| VERB-02 | 2026-09-22 | devin-inference-10 | `src/data/encounters/015-opening-hauler-raid.js` |

## SHIPPED

| Id | Unit | Commit | Note |
|---|---|---|---|
| TOOL-01 | tool-01-denied-latch-tick | 6ac65cd74 | `sfx_massline_deny` binds promoted Kenney tick; latch keeps `tether_latch` |
| PIC-02 | pic-02-rock-variant-surfaces | c4592b62f | five common-rock variants get distinct tint/ORM material specs via `rockSurfaceVariantSpec` |
| WORLD-01 | WF-04 | 147e71c24 | Choir refuel depot (station_depot3) adds missions service so docking shows Missions board |
| PIC-01 | WF-11 | 62c7346d8 | NPC Kestrel resolves through packaged whole-ship allowlist as complete body |
| PIC-09 | WF-09 | 79657724b | Starter weapons scar with their own heat; heatForWeaponVariant resolves weapon IDs via vfxProfiles |
| WORLD-10 | WF-04 | bd59636a7 | Helios outer rocks (f_helios_outer) use ast_metallic instead of repeating starter ast_common_rock |
| INST-01 | inst-01-flight-instrument-tells | bda1642323701cab37d3b6d8215ed60124ed8c4c | Field, mass-seed, and planet tells repainted with deck tokens — no more Segoe UI navy cards |
| VERB-01 | verb-01-raid-timeout-ships-remain | 171220e26caecaab5be919cbed419344f33d6059 | raid_over releases the squad instead of despawnAll; hauler and raiders remain ordinary entities |
| WORLD-01 | world-01-choir-depot-missions-board | 8b07f720d6adc91de572d7dd4b0b5a839085f303 | Missions service shipped (147e71c24); this unit adds the authored chart note and strengthened proof |
| PIC-11 | WF-11 | da2abd5f1 | Missing place prop keeps an empty substrate or marker without published cube geometry |
| WORLD-02 | WF-01 | 80086277e | Vesta traffic includes named hauler Tann of the Slag Run (lane_tann_slag_carrier) |
| INST-14 | WF-13 | 244bb1d40 | "SHIELD DOWN" does not float over the fight; combat:damage does not spawn that floater |
| TOOL-03 | tool-03-starter-shot-audition | this mark commit | Kept authored `wpn_pulse.wav`; Kenney `laserSmall_000.ogg` measures lighter (-5.4 dB mean, less low-band, brighter top) — not the heavier shot |

## CUT

| Id | Cause |
|---|---|
| — | — |

## Promoted 2026-09-22

These owner lines were directions. They moved to build map §23 so a grunt pass is not asked
to invent them. Specific slices of them are the catalog above.

| Was | Direction | Now |
|---|---|---|
| 001 | Deeper faction writing | CV-QUIET, CV-EAR; WORLD-08, WORLD-09, WORLD-16 |
| 002 | Mix a crowded fight | CV-EAR |
| 003 | Fix the frustrations you hit by playing badly | CV-SO; VERB-01, VERB-02, VERB-11 |
| 004 | Teach the stunts the game already detects | CV-AMMO; VERB-05 |
| 005 | Death mutates the world | CV-SO |
| 006 | Something in the minutes between jobs | CV-QUIET; CR-TEXTURE |
| 007 | You can see an NPC change its mind | CV-DAY, CV-MOTION |
| 008 | Events bigger than the player, still physical | CR-FEED, CR-ANVIL, CR-CHAIN |
| 009 | The game keeps receipts and shows them | CV-SO; CR-BERTH |
