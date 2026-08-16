<!-- LIFETIME: DURABLE -->
# ARCADE CORE — the build-out program for the game SpaceFace is supposed to be

**Status: PRODUCT DIRECTION, from the owner (2026-08-16).** This folder converts the owner's
current direction into executable plans. It sits under `design/VISION.md` and
`design/GDD_2_0.md` in the authority ladder and **overrides older plans wherever they disagree
about moment-to-moment gameplay**.

## The diagnosis

The repo has enormous breadth machinery and process docs, but the assembled 30 seconds the
owner describes — fly fast, blast enemies with physics into asteroids and atmospheres, watch
them burst into materials that stream into your hull, re-engage — was never built. Much of
the machinery exists (impulse-kernel weapons, Well/Repulsor/Cone field kernel, kill loot
shards, mining magnet vacuum, tumble states, a wave-equation market engine). The work is
**audit → fix → tune → wire → polish**, with new content added through data, not new
subsystems (I-9).

## The 30-second acceptance test

> See enemies → engage in seconds → kill with the environment as a first-class weapon →
> cause-specific spectacle → credits/materials erupt and stream into the ship → already
> steering at the next group. No menu. No waiting. No ball-chase.

## The volumes

### Core loop (the game)
| # | Plan | One-liner |
|---|---|---|
| 00 | [INVARIANTS](00_INVARIANTS.md) | The ten rules agents keep forgetting. Read first, always. |
| 01 | [KILL_ECONOMY](01_KILL_ECONOMY.md) | Kill-burst + universal vacuum; materials/credits/XP earn model |
| 02 | [STYLE_KILLS](02_STYLE_KILLS.md) | Silent kill-cause taxonomy: fireball, burn-up, chains, well-collapse |
| 03 | [PHYSICS_ARSENAL](03_PHYSICS_ARSENAL.md) | Audit/tune the impulse+field kit; honest tether; Impulse Lance gap |
| 04 | [ATMOSPHERE_EXECUTION](04_ATMOSPHERE_EXECUTION.md) | Planets as kill zones: gradient, drag, the 3–6 s flame spiral |
| 05 | [COMBAT_PACING](05_COMBAT_PACING.md) | Swarm density, TTK, time-to-contact, starter-ship feel |
| 06 | [MARKET_COHERENCE](06_MARKET_COHERENCE.md) | Fix price charts into learnable functions + forecast overlay |
| 07 | [LIVING_WORLD](07_LIVING_WORLD.md) | Populated islands in real emptiness; visible NPC intent; GTA memory |
| 08 | [FACTORY_LOOP](08_FACTORY_LOOP.md) | Mine → claim → factory → convoys → raids → ships |
| 09 | [VALIDATION](09_VALIDATION.md) | Metrics, bot routes, human gates, the tuning lab |
| 10 | [JUICE_DISCIPLINE](10_JUICE_DISCIPLINE.md) | Juice that can't break control or camera |

### Bestiary (who you fight and who you meet)
| # | Plan | One-liner |
|---|---|---|
| 11 | [ENEMY_ARCHITECTURE](11_ENEMY_ARCHITECTURE.md) | The mass ladder: ammunition → setup → terrain → place |
| 12 | [SWARMER_FAMILY](12_SWARMER_FAMILY.md) | Wasp, Dart, Mote, Flea, Skitter, Ember — the dopamine class |
| 13 | [MEDIUM_FAMILY](13_MEDIUM_FAMILY.md) | Marauder, Lancer, Interceptor, Bulwark, Corsair, Torcher |
| 14 | [HEAVY_AND_CAPITAL](14_HEAVY_AND_CAPITAL.md) | Moving terrain: turret-stripping, barge physics, capitals as levels |
| 15 | [SPECIALISTS](15_SPECIALISTS.md) | Tether-cutter, PD, jammer, projector, tender, minelayer, anchor, kiter |
| 16 | [NAMED_ACES](16_NAMED_ACES.md) | Bounties with faces: gimmicks, escapes, recurrences |
| 17 | [FACTION_COMBAT_IDENTITIES](17_FACTION_COMBAT_IDENTITIES.md) | Know who's shooting by silhouette and doctrine |
| 18 | [CIVILIAN_CAST](18_CIVILIAN_CAST.md) | 12 working NPC types with jobs, tells, and uses |
| 19 | [WILDLIFE_AND_ANOMALIES](19_WILDLIFE_AND_ANOMALIES.md) | Drifter shoals, crystal fields, eddies, the Quiet Patch |
| 20 | [BOSSES_AND_SETPIECES](20_BOSSES_AND_SETPIECES.md) | Phased capital fights; falling-rock and reactor events |

### World character (places worth remembering)
| # | Plan | One-liner |
|---|---|---|
| 21 | [SECTOR_IDENTITIES](21_SECTOR_IDENTITIES.md) | Ten sectors, ten personalities across 8 axes |
| 22 | [STATION_CHARACTER](22_STATION_CHARACTER.md) | Seven station archetypes with bodies, voices, specialties |
| 23 | [PLANET_CHARACTER](23_PLANET_CHARACTER.md) | Six planet archetypes; color-coded atmosphere danger |
| 24 | [BELTS_AND_FIELDS](24_BELTS_AND_FIELDS.md) | Six rock families × five arena layouts |
| 25 | [LANDMARKS_AND_POIS](25_LANDMARKS_AND_POIS.md) | Wreck Cathedral, Bone Yard, the Anchor, Dead Gate… |
| 26 | [DERELICTS_AND_SALVAGE](26_DERELICTS_AND_SALVAGE.md) | Five wreck classes; stabilize-cut-extract; survivor pods |
| 27 | [EVENTS_AND_RUMORS](27_EVENTS_AND_RUMORS.md) | News reports the sim; rumors point at real things |
| 28 | [RARE_SPAWNS](28_RARE_SPAWNS.md) | Gold asteroid, Merchant Prince, ghost ship, aces' rendezvous |
| 29 | [NAMES_AND_FLAVOR](29_NAMES_AND_FLAVOR.md) | The writing voice standard: names, barks, slogans, titles |
| 30 | [SECRETS_AND_EASTER_EGGS](30_SECRETS_AND_EASTER_EGGS.md) | The Face, the Developer, caches, the 47a tribute |

### Dopamine & polish (the feel layer)
| # | Plan | One-liner |
|---|---|---|
| 31 | [DEATH_VFX](31_DEATH_AND_DESTRUCTION_VFX.md) | Explosion taxonomy by size × cause; cook-offs; real debris |
| 32 | [PICKUP_VFX](32_PICKUP_AND_VACUUM_VFX.md) | The inhale: capture waves, stream trails, pitch ladders |
| 33 | [WEAPON_VFX](33_WEAPON_VFX_IDENTITY.md) | Know every gun by light and sound |
| 34 | [FIELD_TETHER_VFX](34_FIELD_AND_TETHER_VFX.md) | Forces made visible: field behaviors, line strain gradient |
| 35 | [TRAILS_AND_MOTION](35_TRAILS_AND_MOTION.md) | Seeing velocity: thrust trails, drift tells, tumble ribbons |
| 36 | [IMPACT_FEEDBACK](36_IMPACT_AND_COLLISION_FEEDBACK.md) | Momentum-scaled collision language |
| 37 | [UI_COMBAT_FEEDBACK](37_UI_COMBAT_FEEDBACK.md) | The quiet HUD: reticle pips, chunk bars, threat vignette |
| 38 | [DAMAGE_STATES](38_DAMAGE_STATES.md) | Hulls tell their story: fires, venting, guttering, scars |
| 39 | [AMBIENT_VFX](39_AMBIENT_VFX.md) | Machinery that never sleeps, within a hard budget |
| 40 | [AUDIO_DESIGN](40_AUDIO_DESIGN.md) | Ducking ladder, signature sounds, adaptive music, silence |

### Systems breadth (careers and side games)
| # | Plan | One-liner |
|---|---|---|
| 41 | [CARGO_DEPTH](41_CARGO_AND_SALVAGE_DEPTH.md) | Cargo as physics: jettison tactics, decoys, fragile goods |
| 42 | [MINING_DEPTH](42_MINING_DEPTH.md) | Comets, gas skimming, crystal resonance, danger pacing |
| 43 | [CRAFTING](43_CRAFTING_AND_REFINERY.md) | Short chains that feed the physics kit |
| 44 | [SHIP_CUSTOMIZATION](44_SHIP_CUSTOMIZATION.md) | Paint, scars, kill-mark decals, names, trail tints |
| 45 | [MODULES_DEPTH](45_MODULES_AND_FITS_DEPTH.md) | Agency modules + forbidden tech with downsides |
| 46 | [TECH_TREE](46_TECH_TREE_SHAPE.md) | Kinesis/Bond/Industry/Ghost branches, feat-gated |
| 47 | [FACTION_PLAY](47_REPUTATION_AND_FACTION_PLAY.md) | Licenses, backrooms, conflict zones, disguises |
| 48 | [BOUNTY_AND_LAW](48_BOUNTY_AND_LAW.md) | Wanted lifecycle both directions; capture-tow careers |
| 49 | [SMUGGLING](49_SMUGGLING_AND_BLACK_MARKETS.md) | Cold running, hidden compartments, drop caches |
| 50 | [RACING](50_RACING_AND_CHALLENGES.md) | Time trials, slalom, slingshot courses, skim runs, arena |
| 51 | [CONTRACT_VARIETY](51_CONTRACT_VARIETY.md) | Ten new mission types that exercise the verbs |
| 52 | [STORY_CHARACTERS](52_STORY_AND_CHARACTERS.md) | The Rival, the Fixer, the Quartermaster, the Survivor |
| 53 | [CODEX_AND_LORE](53_CODEX_AND_LORE.md) | The collectible second game; black boxes; bestiary pages |
| 54 | [QUALITY_OF_LIFE](54_QUALITY_OF_LIFE.md) | Ten friction removals, no tradeoffs |
| 55 | [ONBOARDING](55_ONBOARDING_THE_VERBS.md) | Every player performs each signature move once, early |
| 56 | [DIFFICULTY_ACCESS](56_DIFFICULTY_AND_ACCESSIBILITY.md) | Levers, presets, and the accessibility floor |
| 57 | [ENDGAME](57_ENDGAME_AND_REPLAY.md) | Challenge sectors, legendary hunts, NG+, seeded runs |
| 58 | [ECONOMY_BREADTH](58_ECONOMY_BREADTH.md) | ~12 new commodities across chains and luxuries |
| 59 | [INSURANCE_AND_LOSS](59_INSURANCE_AND_LOSS.md) | Pod-out, wreck recovery, insurance tiers |
| 60 | [RIVALS_AND_WINGMEN](60_RIVALS_AND_WINGMEN.md) | Hired guns with loyalty; bounded personal memory |

## Build waves (rough ordering; the queue owns exact dispatch)

1. **Wave 1 — the loop**: 00–05, 09, 10. If the game isn't fun after this wave, nothing else
   matters.
2. **Wave 2 — the feel**: 31–40 (with 09's lab). The dopamine pass on top of the working loop.
3. **Wave 3 — the cast**: 11–20 + 07. The world fills with things worth doing the loop to.
4. **Wave 4 — the places**: 21–28 + 06. Character and coherence.
5. **Wave 5 — the careers**: 41–60 + 08. The long game, side games, and stories.

Cross-cutting dependencies are named inside each doc. 29 (flavor) rides along every wave —
content isn't done until it has a voice. 09's validation obligations apply to all waves.
