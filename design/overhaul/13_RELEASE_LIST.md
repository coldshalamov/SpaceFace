# 13 - Release list: where every item stands today

**Written 2026-11-20 by a read-only reconciliation of the 2026-11-19 polish list against the code, the git log since 18:00 that night, rulings R13 to R24, the board and the lead reports.** Status words: DONE (code or commit proves it), PARTLY, OPEN (nothing has changed it), IN PROGRESS (a lead or a queued brief owns it), CHANGED BY A RULING, CANNOT TELL FROM CODE (needs a look at the running game).

## 1. Summary

142 items. DONE: 17 | PARTLY: 31 | IN PROGRESS: 14 | OPEN: 62 | CHANGED BY A RULING: 2 | CANNOT TELL FROM CODE: 16.

Plainly: the fight feel, camera honesty, enemy pilot behaviour, attack warnings, maps, the minimap, the cargo bag, prices, plain wording and the Pilot Tree engine have moved a lot. The first-hour experience (harbour, boot, mining, dock), Swarm money, the rest of the skills, arena lighting, places, sound and shipping are mostly untouched. Two Swarm headline items are built but uncommitted in the working copy. Measured speed has not yet improved in the capture (28 fps average and 65 s to title, both under machine load).

Counts for the twelve headline items: DONE: 0 | PARTLY: 6 | IN PROGRESS: 2 | OPEN: 4 | CHANGED BY A RULING: 0 | CANNOT TELL FROM CODE: 0.

## 2. The twelve that decide whether it sells

**1. Every gun feels like a different tool** - PARTLY. The list said 13 of 19 guns miss. After f6db8fedc3 the bench scores 9 pass and 11 miss of the banded guns. The cannon now wallops (more than a screen) and the starter pistol kills in about 2 s. The railgun, stream gun bounce, heat and gun sounds are still open, and the five borrowed pictures are only partly fixed.

**2. Heat as rhythm, not punishment** - OPEN. Nothing built. Heat still locks every gun for about 2 s when it pegs (src/systems/weapons.js:188). No lead owns the follow-up gun-tuning (OVH-08b).

**3. Enemies fight like pilots; every attack warns 0.6 s ahead** - PARTLY. Pilot behaviours landed (2154f25b33, a19025d7f6, 5ce67ccf04) and the 0.6 s warning, lane and chip landed for every doctrine (0a469ef672). Still open: boss wind-ups unconfirmed, the pack caller has no marker, 14 enemy kinds are not on the shared brain, and nothing on screen reads the new cast announcement yet.

**4. One press from the Swarm door into the fight** - IN PROGRESS. The code exists in the working copy (title Swarm button calls the quick start; Customize Swarm key) but is not committed.

**5. No shop after every Swarm round** - IN PROGRESS. Working copy only: the shop moves to every fifth round and level-up cards come in a breath. Spending on the arena floor is still Foundry-only.

**6. The room pays** - OPEN. The 2.5 times room-kill and boss rewards are defined (src/core/runState.js:104) but nothing awards them. Carry-over power (hangar, perks, weapon levels) is still there.

**7. The skill tree finished** - PARTLY. 30 of 81 skills are live (29 on the list). None of the five evolutions is live; the Ghost branch has no live skill. No lead owns the rest yet.

**8. Arenas as lit places, not black space** - OPEN. Only the Foundry has a lit set, and its cost, vanishing furnace and Shadows Off problems are unchanged. Eight arenas remain dark.

**9. Adventure first ten minutes** - PARTLY. Title, harbour and boot are open or queued (LOAD-TIME-1). The first dock page landed (ccf4b9f7e9). Adventure still gives no XP (runSession.js:324). The capture failed at mining, docking, the station door, map and pause on 2026-11-20.

**10. Places look and play differently** - PARTLY. Skies: 9 distinct plates among 25 sectors (four plates still shared by 20). Arrival lines landed. Empty lanes, landmarks, job boards still open.

**11. Real sound** - OPEN. No audio work since the list; assets/audio is still 134 MB. R8 makes sound the last lane.

**12. Smooth and fast** - PARTLY. Large engine and render work landed (smooth slow-down, fixed cadences, LOD by size, minimap in budget). Not proven: capture ran 28 fps average and the A/B read 23 against 36 under load. Startup is 65 s to title under load; LOAD-TIME-1 is queued.

## 3. Every item, by area

### Combat: guns

| Item | Status | Evidence | Owner lane | What is left |
|---|---|---|---|---|
| Heavy cannon shove is 8 % short of a full screen; small cannon reaches half | DONE | f6db8fedc3: Concussion M impulse 920 to 1400, S 520 to 1100 (src/data/weapons.js); bench now measures 1.39 and 1.09 screens in 2 s, above the 1.0 target | combat | Nothing for these two guns. |
| Railgun: one shot, through three targets | OPEN | src/data/weapons.js (wpn_railgun_m, about line 175): rate 0.8 a second, armour-piercing only, no pass-through count anywhere | combat | Build the pass-through and drop it to one shot per kill. |
| Stream gun bounces only with an add-on; own gold-thread look and buzzsaw voice | OPEN | src/data/weapons.js wpn_bank_stream_m has no bounce; the only bounce is the Gunner skill gunner_ricochet (src/data/pilotLive.js) | combat | Native bounce, own look (vfx kit gave it a "fizz" only, vfx/REPORT2.md), own sound. |
| Mortar, disc, glaive, debris orbit, stream gun borrow the autocannon picture and sound | PARTLY | vfx kit (789e245086) gave the stream gun a fizz and the cannon a ring, fan and chips (vfx/REPORT2.md); no sound work landed | effects | Mortar, disc, glaive, debris orbit pictures; all gun sounds. |
| Upgrade pistol strictly beats the starter; small autocannon strictly worse | PARTLY | f6db8fedc3 nudged Pulse S damage 9 to 10 and measured a kill in 2.0 s; the gun bench scores 9 pass and 11 miss (was 7 and 13) in scripts/bench-gun-curve.mjs | combat | Audit each pair for one strength traded for one weakness; autocannons wait on per-enemy overrides. |
| Two beams kill too fast; flak, plasma cone, small autocannon too slow | OPEN | Still on the bench miss list (Flak, Heavy Beam, Plasma Cone, Autocannon S; see 12_PIPELINE.md OVH-08a-fix row); f6db8fedc3 says they wait for the enemy lead | combat | Tune to the curve in src/data/weapons.js (OVH-08b). |
| Swarm quietly adds 12 % fire rate per weapon level | OPEN | src/data/swarmWeaponLevels.js:13 SWARM_WEAPON_LEVEL_STEP = 0.12, still applied by applySwarmWeaponLevels | swarm | Remove the rate bonus or replace it with something the design wants. |
| Round 1 cannot teach stream gun vs cannon (both delete the first enemies) | CANNOT TELL FROM CODE | Rounds 1 to 10 are now ten authored casts (1431703175), so the premise may have moved | swarm | Fly round 1 with each gun and watch; the Swarm capture (not yet run) would show it. |
| Only the cannon moves rocks; railgun, missiles, torpedoes should too | OPEN | No commit touches it; rock kick table is src/data/rockGunTape.js and src/data/weapons.js | combat | Give the other kinetic guns a rock impulse. |
| Shop shows two numbers per gun; should show rate, punch, reach, kick, firing time before overheat | OPEN | src/ui/screens/crucibleDraft.js; SCREENS-2-SWARM brief covers the draft layout but not the gun numbers | station-and-screens | Show the four stats and the firing time. |
| Heat as rhythm: release in amber to cool fast, only the hot gun locks for 1.2 s, show which gun is hot | OPEN | src/systems/weapons.js:188 WEAPON_VENT_S still locks every gun on a forced vent (about 2 s); OVH-08b has no owner | combat | Everything in the item. |
| A short aiming line showing where a kick gun will send its target | OPEN | No code or commit | combat | Build it. |
| The Tumbler: a no-damage long gun that sends a ship spinning | OPEN | Only named in src/data/gunFamilies.js comments (the "trick" family) | combat | Build the gun. |
| Recoil moves your ship, not the camera | DONE | CW-WPN landed in 3474e87069; railgun recoilImpulse 140 in src/data/weapons.js; R23 camera gate (61736e012e) | combat | Nothing. |

### Combat: hits, damage, death

| Item | Status | Evidence | Owner lane | What is left |
|---|---|---|---|---|
| Hits flash, spark and scorch the body; size it by how big the ship looks on screen | PARTLY | Landed in 3474e87069 (OVH-06b, src/render/vfx/bodyHitRead.js); no commit sizes it by screen size | effects | Screen-size scaling for small distant ships. |
| Camera shakes only for hits that matter; check red edge pulse cost on laptops | PARTLY | Done: one camera gate (OVH-06a, HARMONY-FIX 5 61736e012e, R23). Pulse cost not measured since | frame-rate | A laptop trace of the pulse layer. |
| Damage that stays: scars last the ship life, beam cuts glow and cool | OPEN | No code or commit | effects | Build it. |
| Running lights flicker on a dying ship are built but not connected | CANNOT TELL FROM CODE | Flicker code lives in src/render/vfx/bodyHitRead.js and src/data/bloomLadder.js; whether a dying ship reaches it needs a frame | effects | Shoot a ship to death and watch its lamps. |
| The first hit on each ship may hitch a frame | CANNOT TELL FROM CODE | vfx kit now compiles its shaders at fight start (vfx/REPORT2.md); hit-time hitch not re-measured | frame-rate | Per-second trace of a first hit (npm run capture:opening has the trace). |
| Nothing tells you your stream gun is the wrong tool against heavy armour | OPEN | No code or commit | hud | A hint on the target when armour beats the gun. |
| Death screen says "Unidentified weapon" and "?" for explosion kills | PARTLY | src/ui/screens/crucible.js:2936 still has the fallback text; a3a3668d9c adds a required cause for lethal contacts, which narrows when it can appear | words | Name explosions and hazards as killers. |
| A collision nobody caused never kills you | DONE | a3a3668d9c: a contact needs a cause (throw, shove, plow, gun kick, hazard) to be lethal | combat | Nothing. |

### Combat: enemies

| Item | Status | Evidence | Owner lane | What is left |
|---|---|---|---|---|
| Dodging by weight (small never, light once per 4 s, medium after a flinch, heavies never) | DONE | 2154f25b33 (dodge ranks) and 5ce67ccf04; judged in play: not yet | enemies | A fight frame to confirm it reads. |
| The horde attacks in squads | CHANGED BY A RULING | R19 withdrew the horde; fights are composed casts of dozens. 1431703175 composer, a19025d7f6 shared pack brain | enemies | Pack brain covers only Wasp, Dart, Zealot; 14 other kinds not moved (ai/REPORT2.md). |
| Packs bunch tighter so throws bowl several over | DONE | 2154f25b33; pack brain a19025d7f6 | enemies | Confirm in play. |
| Wounded enemies visibly break off | DONE | 2154f25b33 (flee announce, Swarm flights) | enemies | Confirm in play. |
| Enemies hold fire instead of pouring it into rocks | DONE | 2154f25b33 (no fire through rock); note a19025d7f6 deleted the older Swarm fire holds on purpose (R15) | enemies | Nothing. |
| Enemy aim misses moving targets | DONE | CW-WPN in 3474e87069 (aim quiver) | enemies | Nothing. |
| Big ships turrets turn at a real speed | DONE | CW-WPN in 3474e87069 (turret slew) | enemies | Nothing. |
| Readable attacks: every attack warns 0.6 s, lane painted, own marker | DONE | 0a469ef672: 36-tick clock, lanes for every doctrine, a chip for every cue kind | enemies | Frame check. |
| The pack caller is marked in the world | OPEN | Ledger D17 says pack_call has no in-world marker; 0a469ef672 does not list one | effects | Draw a marker on the caller. |
| Boss warnings are still 0.5 s | CANNOT TELL FROM CODE | The 0.6 s clock covers doctrines; bosses stay on the full tactical brain (ai/REPORT2.md); no boss-specific change found | enemies | Time a boss wind-up in a played round. |
| Enemy "mind" (flank, bait, punish, panic) computed but never shown; off in Swarm | PARTLY | 0a469ef672 shows FLANK / BAIT / PUNISH / COVER / PEEL chips; round-10 elites run the mind | enemies | Wider use in Swarm elites. |
| Each enemy type moves at its hull speed, not its own | PARTLY | Job table src/data/enemyJobs.js (e96d44416c); Wasp and Dart press at 80 to 160 units a second (ai/REPORT2.md); 14 kinds not yet moved to per-kind behaviour | enemies | AI slice S4: move the 14 kinds. |
| An enemy meant to hold ground chases you instead | IN PROGRESS | ai lead slice S4 (decisions in ai/REPORT2.md): Warden becomes a shield dome, Casket Worm a Wall, Mothlight a Deny | enemies | Build S4. |
| Each of the six bosses has its own trick | CANNOT TELL FROM CODE | src/ai/capitalBossOrders.js; no landing since the list | enemies | Fly each boss. |
| A stranger can tell enemy types apart by shape | PARTLY | 4671dc7ddd and 010e88724a: rings and minimap glyphs name the job by shape and colour; the hulls themselves are unchanged | effects | A stranger test on a frame. |
| Enemy pilots braking for each other | OPEN | src/ai/maneuver.js; the old "hold" is void under R13 | enemies | Build it. |

### Combat: the rope and the powers

| Item | Status | Evidence | Owner lane | What is left |
|---|---|---|---|---|
| Rope and power skill fixes, four of five; Combo back in the deck | DONE | PT-FIX-C landed in 3474e87069; Combo is in src/data/pilotLive.js | skills | Nothing. |
| "TOO HEAVY" still prints on one rope instrument | DONE | 2cc7dfe332 (now TOO BIG); remaining hits in src/ui/masslineHud.js are comments only | words | Nothing. |
| Five powers rebuilt to look like force, light and matter | PARTLY | 789e245086 and eight kit commits (src/render/vfx/kit/); director judged: Pull good, Bomb ok, Shove weakest, Pin unreadable (RESUME.md) | effects | Shove edge, Pin, Line tension, trails. vfx lead continuing. |
| Look: Pin, Bomb and the plough on screen | PARTLY | Plow wedge seen (1e24a7f2a7, c63df4d37a); Pin does not read; Bomb ok | effects | Pin. |
| Orbit-fire: roped to something big, your guns swing toward it | OPEN | No code or commit | combat | Build it. |
| Rope heads (Coupler, Breaker...) have no effect; first costs 14,000 vs 5,000 | OPEN | Head catalogue src/data/lineProgression.js:50-59 has the behaviours; the Coupler skill is not in src/data/pilotLive.js; price not re-checked | adventure | Make heads act; reprice. |
| Does turning while thrusting feel slower than turning alone? | CANNOT TELL FROM CODE | d320432d38 removed the post-hit steering penalty; nothing on thrust-turn | controller | A flight test. |

### Swarm mode

| Item | Status | Evidence | Owner lane | What is left |
|---|---|---|---|---|
| One press from the title into round 1 | IN PROGRESS | Working copy only (not committed): src/ui/screens/mainMenu.js _launchSwarm calling requestSwarmQuickStart in src/ui/crucibleLaunch.js; "Customize Swarm" key added. swarm lead | swarm | Review, test, commit. |
| Retire the shop after every round | IN PROGRESS | Working copy only: src/data/swarmMode.js SWARM_DRAFT_EVERY 1 to 5, a "breath" for level-up cards in src/systems/survivalRun.js. The list asked for none; the director chose every fifth round | swarm | Commit; decide five versus never. |
| "Match setup" has seven controls; keep three, rest under More | OPEN | src/ui/orrery/cruciblePreparation.js; SCREENS-2-SWARM brief (queued, neon2) | station-and-screens | Build the brief. |
| Floor shops (wall guns, Crate, Forge, Taps) in every arena | OPEN | src/data/swarmFloor.js has plans only for helios_core (the Foundry); nothing since | swarm | Plans for the other eight arenas. |
| Price the floor against the shop (500 wall gun vs items priced 12 to 112) | OPEN | src/data/swarmFloor.js header; no repricing commit | swarm | Reprice. |
| Arena kills pay 2.5 times; combo chain multiplies | OPEN | src/core/runState.js:104 RUN_XP_SOURCES.ROOM_KILL = 2.5 is defined but no award site reads it | swarm | Wire the award. |
| Bosses pay a real reward; extra swarm enemies pay experience | OPEN | RUN_XP_SOURCES.BOSS = 100 defined, not wired | swarm | Wire the award. |
| Level pacing: about level 14 by round 10 | PARTLY | Curve landed (3474e87069 PT-FIX-A): src/core/runState.js:97-116, level 14 needs 2,028 XP. Not re-measured in a played run | swarm | Measure with the Swarm capture. |
| A run lasts 32 to 48 minutes; target 20 to 25; round 6 jumps 28 to 40 | PARTLY | Rounds 1 to 10 recomposed (1431703175); rounds 11 to 30 still old rows (ai/REPORT2.md) | swarm | Recipes for rounds 11 to 30; time a run. |
| Strip the carry-over power (hangar bonuses, perks, weapon levels) | OPEN | src/data/swarmHangar.js, src/data/swarmPerks.js, src/data/swarmWeaponLevels.js still in use | swarm | Strip. |
| Daily, ghost and checkpoint runs still start with a purse | OPEN | No commit; src/data/swarmMode.js (purse comments near line 893) | swarm | Zero the purse. |
| Style score shows in two places and speaks jargon (IGNITION, FLARE, NOVA) | OPEN | IGNITION lives in src/systems/swarmJuice.js and src/render/vfx.js | words | One place, plain words. |
| Run-over screen: six clear lines, "Again" with fresh layout beside "same seed" | OPEN | SCREENS-2-SWARM brief (queued) | station-and-screens | Build. |
| Tower placement moves into the Adventure yard | OPEN | No commit | adventure | Build. |
| Look: the other eight arenas, freight lane, crusher, wall guns, Crate, Forge, drops | CANNOT TELL FROM CODE | Swarm opening capture is not yet run (12_PIPELINE.md section 4); the swarm lead is to run it | swarm | Run npm run capture:opening -- --mode=swarm. |
| Look: a run can be won, a first win takes several tries | CANNOT TELL FROM CODE | Packet C01-01 (can be won); no recorded win; needs a played run | swarm | Bot or human run to round 30. |

### Skills (the Pilot Tree)

| Item | Status | Evidence | Owner lane | What is left |
|---|---|---|---|---|
| Skill tree with 29 skills, live, awaiting review | PARTLY | 30 of 81 nodes are live today (src/data/pilotLive.js, PILOT_LIVE_NODE_IDS); tree landed on master as 3474e87069 | skills | 51 not live. |
| Card fixes: Esc, no leak over pause, Ram Plate shields, execution cannot kill you, plain text | DONE | PT-FIX-A landed in 3474e87069 | skills | Nothing. |
| Stagger can still stun-lock a boss | DONE | c20d6a94f6: needs a real kick, never stun-locks (src/systems/weapons.js about 3146) | skills | Nothing. |
| The other 52 skills: five evolutions, finishers, Conjurer past four points, empty Ghost branch, Unstoppable, Free Hand, Deep Cast | PARTLY | Deep Cast is live. Five evolutions defined at src/data/pilotTree.js:205-209 but not live; no Ghost node is live; the PROGRESSION lead is "to open" (12_PIPELINE.md) | skills | Build effects for about 51 nodes. |
| Remove "Second Line" | PARTLY | Kept out of the live set (src/data/pilotLive.js comment) so it is never dealt; node still defined in src/data/pilotTree.js | skills | Delete the node. |
| Adventure gets the same tree | OPEN | src/systems/runSession.js:324 refuses awards when run.kind is adventure; the tree has an adventure door (src/data/pilotTree.js:235) | adventure | Feed XP and cards in Adventure. |

### Adventure: the first hour

| Item | Status | Evidence | Owner lane | What is left |
|---|---|---|---|---|
| Boot is 38.5 s with no skip; any key skips; title under 10 s | IN PROGRESS | LOAD-TIME-1 brief written, behind PORT-PRO-FIVE on devin3. Capture today: title in 65 s under load | load-time | Build the brief; skip key. |
| Desktop title is the two doors over the lit harbour; idle replay shows Swarm | PARTLY | Title has Swarm and Adventure doors (src/ui/screens/mainMenu.js); the idle replay and harbour backdrop unchanged; SCREENS-3-FRONT-DOOR queued | station-and-screens | Brief. |
| New Game screen never says what the game is | IN PROGRESS | SCREENS-3-FRONT-DOOR brief (queued, neon1) | station-and-screens | Build. |
| Harbour in sight of the opening, with working traffic | OPEN | Design accepted (world/REPORT.md, R16); the world lead has not started slice 1. 82bfcc6476 only thinned the crowd | world | Slice 1: station about 600 units from the field. |
| A calm screen during lessons | PARTLY | f10cd0fe03 quiet attention-driven flight HUD; stale-tip burst and raid waypoint unchecked | hud | Frame check of the first dock. |
| The Skim happens in front of you, not as a kill feed | OPEN | No commit | adventure | Build. |
| First dock opens on jobs; instructions do what they say | PARTLY | ccf4b9f7e9: arrival page, one Service ship button, four doors, Undock. Capture could not dock: overshoot at 435 m/s, S does not brake cruise (capture summary) | station-and-screens | Fix dock approach; verify each instruction. |
| Basic guns and the Wasp stop needing research; first mission stops paying retired currency | PARTLY | Pulse Laser S has no research gate; src/data/ships.js:98 ship_wasp still requires tech_combat_basics. Currency not checked | adventure | Ungate Wasp; check mission pay. |
| First rope head under 5,000 and changes the rope | OPEN | See rope heads above | adventure | As above. |
| "Recommended" badge vanishes from the first job | CANNOT TELL FROM CODE | No commit | station-and-screens | Dock frame. |
| First-hour route check is red because outdated | CHANGED BY A RULING | R24: the opening capture (0a9cc8910e) replaces it as the measure; old check not rewritten | cleanup | Delete or rewrite. |

### Adventure: station, map, long game

| Item | Status | Evidence | Owner lane | What is left |
|---|---|---|---|---|
| Station as a hangar: Jobs, Market, Shipyard, Bar plus Undock; retire seven tabs, palette, two crawls | IN PROGRESS | Part A landed (ccf4b9f7e9); parts B to D queued (SCREENS-1-STATION, neon1). Four doors, not the four places named | station-and-screens | Parts B to D. |
| Fitting a part takes four clicks and a forced confirm; selling three | OPEN | SCREENS-1-STATION part D | station-and-screens | Build. |
| Shipyard shows your ship as a capsule with text over it | OPEN | No commit | station-and-screens | Build. |
| Map has nine inspector tabs (should be three); plain words not coordinates | DONE | 756215e99d: four tabs and a Log link; "Ship fix" no longer anywhere in src. Four, not three | maps | Nothing. |
| Mining board reads as a rock and a puzzle | OPEN | Capture: 78 s of beam, empty hold (a2acabe07e tightened the beam since) | adventure | Fix yield; build. |
| The yard outside your claim: drones, raids, no income cap, no cr/min | OPEN | R4, R21; no commit | adventure | Build. |
| Late-game purchases and stage-scale threats | OPEN | No commit | adventure | Build. |
| Stealth: cold drift, shadows, cones, sabotage | OPEN | Ghost branch of the Pilot Tree has no live node | skills | Build. |
| Factions cut from 14 to four or five | OPEN | FACTION_META in src/data/factions.js still has 14 | world | Cut. |
| Re-price the economy (early income 3 to 6 k an hour; ships to 4.2 million) | PARTLY | R20 curves and events landed (6fddfd284f). Income and ship price levels not re-set | adventure | Re-price. |
| Look: jobs, travel, gates, docking; law and WANTED; story staging; death and recovery | CANNOT TELL FROM CODE | Capture passed the job and fight steps; dock, map, pause failed. combat lead holds the findings | adventure | Rerun the capture. |

### Places and the world

| Item | Status | Evidence | Owner lane | What is left |
|---|---|---|---|---|
| 17 of 25 sectors share four skies; endgame wears another sector sky | PARTLY | 0fe665373c: now 9 distinct sky plates; 20 sectors still share four (7, 5, 5, 3); Ashfall has its own | world | Split the four groups. |
| Something on every route (14 frontier lanes empty) | OPEN | No commit | world | Population owner. |
| Staged stories in three storyless sectors; sign of life in the two empty | OPEN | PORT-PRO-FIVE gives five expeditions | world | Authored scenes. |
| Arrival line names each place in its own voice | DONE | 0fe665373c: src/systems/sectorArrivalPlate.js | words | Nothing. |
| Job boards that differ by place | OPEN | No commit | adventure | Build. |
| A big landmark on each look-alike frontier approach | OPEN | No commit | world | Build. |
| Paid races on the three practice circuits | OPEN | No commit | adventure | Build. |
| More places with their own verbs (Bolus, Charon) | IN PROGRESS | PORT-PRO-FIVE (devin3): Towjaw, Switchback, Blackbox Runs, Glasswake, Kinetic Catalysts. Switchback files untracked in working copy | adventure | Finish ports. |
| Ground under the fight | OPEN | No commit | look-and-light | Build. |
| Moon named after Pallas in Io; two Io places share a name | OPEN | src/data/sectors.js: sector_io_reach has "Pallas Industrial Moon" and two "Mercenary Outpost" | cleanup | Rename. |
| Look: six frontier wonders sit somewhere you would fly past | CANNOT TELL FROM CODE | src/data/sectorWonders.js | world | Fly there. |

### Look and light

| Item | Status | Evidence | Owner lane | What is left |
|---|---|---|---|---|
| Foundry lit floor costs 17 to 20 ms, furnace vanishes, ignores Shadows Off | OPEN | src/render/arenaSets/foundrySet.js has no shadow-setting check; no cost cut since; fbac0926fe cut ship death blasts only | look-and-light | All three. |
| Lit sets for the other eight arenas | OPEN | Only foundrySet.js exists in src/render/arenaSets/ | look-and-light | Build. |
| The light recipe: sun shadow fitted to the fight; a sky per region | PARTLY | Sky per sector split by 0fe665373c; shadow recipe not built | look-and-light | Shadow fit. |
| Your ship is small and dark at round start | PARTLY | 4671dc7ddd: ships pop from the floor, player ring fades in calm flight | look-and-light | Frame check. |
| Title scene murky, placeholder-looking rock | CANNOT TELL FROM CODE | screens/AUDIT.md rates the title among the best screens; rock work 544d361c22 | look-and-light | Frame. |
| Hover tag prints over floor signs | IN PROGRESS | HUD-2-POLISH (queued, neon2) covers the floor-shop card mid-screen | hud | Build. |
| Readable markings on stations | OPEN | No commit | look-and-light | Build. |
| A "ready to fire" cue on enemy ships | OPEN | LOOK-THREAT-b, no owner | effects | Build. |
| Look: blown-out white rock; red edge boxes | PARTLY | 932915b4ad, 544d361c22; white card near the planet and iron foil are in ROCK-LOOK-2 (queued) | look-and-light | ROCK-LOOK-2. |

### Screens and words

| Item | Status | Evidence | Owner lane | What is left |
|---|---|---|---|---|
| Banned-words check that fails the build | PARTLY | scripts/capture-opening.mjs:47 flags banned words per capture (11 seen); no check script fails the build | words | Make it a check. |
| Clear the 37 hits (Crucible, jargon, STALE, cr/min, Research points, coordinates, Bay screen, Station wire) | PARTLY | Batches c7aef99cfe, 8bc22b0484, 0f5a510731, df01ea648d, 94046e47ce, 2cc7dfe332; window title is SpaceFace (index.html:13). Left: achievements.js says Crucible in 7 places; Bay screen and Station wire in src/ui/orrery/stationLayouts.js; "Universe seed" | words | Finish the last. |
| One visual style (15+ sets, 11 button shapes) | IN PROGRESS | SCREENS-2, 3, 4 briefs (queued) | station-and-screens | Build. |
| Unfinished modes (Sandbox, Physics Challenges) reachable from title | OPEN | src/ui/screens/mainMenu.js still builds both buttons | station-and-screens | Hide. |
| Photo mode, replays and clips need keyboard and controller | OPEN | No commit | controller | Build. |
| First boot asks a motion question; follow system silently | IN PROGRESS | src/ui/screens/motionAsk.js still asks; SCREENS-3 only rephrases it, which differs from the list | station-and-screens | Decide. |
| Swarm power bar shows empty sockets and "unbound" | DONE | f10cd0fe03 and 94046e47ce | hud | Nothing. |
| A level-up should feel like something happened | CANNOT TELL FROM CODE | Cards in the breath (3474e87069) | effects | Frame. |
| Cut the word count (17,798 lines) | OPEN | Not re-counted | words | Recount. |
| Look: Settings, Help, Credits, Achievements, Save/Load | IN PROGRESS | screens/AUDIT.md done; fixes in SCREENS-3 and 4 | station-and-screens | Build. |
| Look: every screen at laptop and phone sizes | PARTLY | Audit shot many; 1366x768 station overlap fixed by part A | station-and-screens | Re-shoot. |

### Sound

| Item | Status | Evidence | Owner lane | What is left |
|---|---|---|---|---|
| Thirty hero sounds | OPEN | No audio commit since the list; assets/audio is 1,572 files | sound | Source. |
| One voice per gun family | OPEN | No commit | sound | Build. |
| Music: Swarm layers and town themes | OPEN | src/audio/scoreDirector.js exists | sound | Build. |
| Real echo in hangars and tunnels | OPEN | No commit | sound | Build. |
| Sound files from 134 MB to under 20 | OPEN | assets/audio still 134 MB | sound | Re-encode. |
| Look: with eyes closed, throw, shot, crash tellable apart | CANNOT TELL FROM CODE | R8 puts sound last | sound | Listen. |

### Speed and stability

| Item | Status | Evidence | Owner lane | What is left |
|---|---|---|---|---|
| Boot to title in 10 s | IN PROGRESS | LOAD-TIME-1 queued; capture 65 s under load | load-time | Build. |
| Into a Swarm fight in 5 s warm, 10 s cold | IN PROGRESS | LOAD-TIME-1; not re-measured | load-time | Probe. |
| Into Adventure flight in 10 s | IN PROGRESS | Capture 114 s under load | load-time | Build. |
| 60 fps in Swarm round 20 and busy Helios | PARTLY | Engine and render work landed: 7b2eaf7594, 9ae5e63ff8, 64a8e4bf76, 94fddd6b6c. Capture 28 fps under load | frame-rate | A/B on a quiet machine. |
| Zero console errors | CANNOT TELL FROM CODE | Not recorded by the capture | cleanup | Add a counter. |
| Two hours in each mode without a crash | OPEN | No soak | cleanup | Soak. |
| Old saves load | PARTLY | Save v24 migration (7592bb895f) | cleanup | Load a real save. |
| A Swarm run can be resumed next day | CANNOT TELL FROM CODE | src/save/saveSystem.js | swarm | Test. |

### Shipping it

| Item | Status | Evidence | Owner lane | What is left |
|---|---|---|---|---|
| One full sitting by a stranger | OPEN | None | shipping | Run. |
| Full controller play | OPEN | No commit | controller | Build. |
| Steam build and its 44 achievements | PARTLY | electron/steamAchievements.json holds 40; no Crucible there | shipping | Review. |
| A store page | OPEN | None | shipping | Build. |
| A festival demo | OPEN | None | shipping | Build. |
| Translations | OPEN | catalogs exist, nothing since | words | After word cut. |
| Stranger playtests | OPEN | None | shipping | Run. |

### Cleanup

| Item | Status | Evidence | Owner lane | What is left |
|---|---|---|---|---|
| Unused code, stale comments, broken Swarm bench shot, red attack-timing check, unreachable checks | PARTLY | TEST-DEBT x11, 5fd218b028, ccf2c47460. Bench cell will not mount (maps/REPORT.md) | cleanup | Rest. |

## 4. Open and unowned, ranked by what a first-hour player would feel

1. Adventure gives no experience or cards (the same tree in Adventure) (runSession.js:324; lane: skills)
2. Mining yields nothing in the capture; mining board; first dock overshoot (capture summary; lane: adventure)
3. Harbour in sight and calm opening (world lead has not started) (world/REPORT.md; lane: world)
4. The room pays: wire the 2.5 times room kill and boss rewards; strip carry-over (runState.js:104; lane: swarm)
5. First rope head price and effect; Wasp research gate (ships.js:98; lane: adventure)
6. Gun tuning follow-up: railgun pass-through, stream bounce, heat as rhythm, shop numbers, Swarm 12 % (weapons.js; lane: combat)
7. The other 51 skills including evolutions and the Ghost branch (pilotLive.js; lane: skills)
8. Floor shops and lit sets for the other eight arenas; Foundry cost fix (swarmFloor.js, foundrySet.js; lane: look-and-light)
9. Damage that stays; hit size by screen; wrong-tool hint; death screen naming explosions (bodyHitRead.js, crucible.js:2936; lane: effects)
10. Sound: all items (assets/audio; lane: sound)
11. Empty lanes, job boards, landmarks, Io naming (sectors.js; lane: world)
12. Unfinished modes on title; photo mode on controller; build-failing banned-words check (mainMenu.js; lane: words)
13. Yard, late game, stealth, factions, paid races (none; lane: adventure)
14. Controller, store page, demo, translations, soak, stranger sitting (none; lane: shipping)

Owned and running or queued, so not listed above: pack brain and enemy roster slice S4 (ai), boot time (LOAD-TIME-1), station parts B to D and the Swarm, front-door and records screens (SCREENS-1 to 4), flight HUD second pass (HUD-2-POLISH), rocks (ROCK-LOOK-2), bag screen (CARGO-BAG-UI), five expeditions (PORT-PRO-FIVE), frame cost (engine and render leads), the five powers look (vfx), Swarm one-press and shop (swarm lead, uncommitted).

## 5. How we will know it is done (doc 18 finish line)

| Test | How it is checked today |
|---|---|
| Any ten seconds has something thrown and something reacting | Contact sheet and per-second trace from npm run capture:opening, both modes. |
| 30 s from title to first throw, either door | The capture steps title-to-launch, line and throw. Today Adventure took 114 s under load. |
| 60 fps in Swarm round 20 and busy Helios | Interleaved A/B on a quiet machine (PERF-AB); the capture trace. |
| A stranger sorts enemies by sight and says how they get stronger | A frame of a mid-run fight shown to a stranger. |
| There is always one next step | Capture steps for dock, station, undock, map, pause: today 6 of 13 failed. |
| A Swarm run is winnable, first win takes several tries | A bot or human run to round 30. |
| No cut-off words in the first hour | The capture words list and banned-word findings (11 today). |
| Map makes sense at a glance; story followable with text off | Chart frames (maps/REPORT.md) and a text-off play. |
| Five of five on the ten-minute card, three sessions running | Human sessions only. |

Command for the capture: node scripts/fleet/game-lock.mjs run -- npm run capture:opening -- --mode=adventure (or swarm) --minutes=12 --out=<dir>.
