DONE ENEMY-ARMOR-FLAT-CONTRACT — starter Pulse now kills Iron Maw; thrown mass is still the fast way.
WHAT I FOUND     Iron Maw's flat armour was 25 against a starter shot of 8, so Pulse and Autocannon did zero residual damage after shields; no other catalog hull had that bug.
WHAT I CHANGED   I dropped only that flat plate to the existing bruiser ceiling and added a check that reads starter Pulse damage from the weapon table.
WHAT YOU WILL FEEL   The Hitch gun can now chip the wave-10 champion instead of sparking off it forever. It is still a long, ugly grind — thrown rocks remain the way you actually want to kill it.
THE NUMBERS      seed 17405, catalog sim (same harness as PQ-174.05; Pulse dmg 8 at 5.5 rps, perfect hits, no heat)
bar | before | after | target
Iron Maw Pulse TTK | never (600.18s cap, dead=false) | 352.73s dead | Pulse must finish; slow is correct
Iron Maw physics TTK | 85.80s dead | 69.00s dead | physics clearly faster than Pulse, and ≤90s
Iron Maw Autocannon TTK | never (600.25s cap) | 170.25s dead | slower than physics
Iron Maw Rail TTK | 343.75s | 230.00s | slower than physics
wave 20 Corsair Pulse TTK | 8.73s (already legal) | 8.73s | Pulse finishes
wave 30 Bruiser Pulse TTK | 15.27s (already legal) | 15.27s | Pulse finishes
FILES            src/data/enemies.js
                 test/enemy-armor-flat-contract.test.mjs
                 design/program/roadmap/receipts/ENEMY-ARMOR-FLAT-CONTRACT-REPORT.md
CHECKS           node --test test/enemy-armor-flat-contract.test.mjs — PASS (2/2)
                 npm run check:baseline entry — FAIL 12/15 (pq020-ceres-topology, sim-v3, sim); not mine
                 npm run check:baseline exit — FAIL 12/15, same three reds, same golden hashes; list not longer
                 npm run check:crucible:arc — PASS 15/15
                 npm run check:combat — PASS
UNPROVEN         Live Pulse heat (12-shot burst then vent) and missed shots are not in this harness, so a real Hitch fight will take longer than 352s. Shield regen is 60/s after a 6s delay; continuous hits refresh lastDamageT so regen should stay suppressed, but I did not play the wave. test/pq-174-05-boss-physics.test.mjs still asserts `Pulse must not be the fast or only way` as `gun.dead === false`; that file is outside this lane's write set, so I did not edit it — it is now red because Pulse finishes in 352.73s. Controller should retarget that assertion to "Pulse finishes slower than thrown mass". Historical design/CONTENT_BIBLE.md still lists armorFlat 25; it is not live.

## Why 3, not a neighbour

Siblings already use 0, 1, 2, 3. Legal range under the header rule is anything strictly below Pulse dmg 8.

- 0 would make a capital hull identical to a wasp per-hit. Rejected.
- 2 is corsair plate. A dreadnought should not be thinner than a bruiser.
- 3 is the existing bruiser / warden / anchor ceiling, well below 8, and Pulse TTK is 5.9 minutes of perfect hits — the slow way, not immunity. Physics 69.00s vs Pulse 352.73s is 5.1×.
- 4 is 427s (~7.1 min). Heading toward the nine-minute warning for no new feel.
- 7 is 1545s (25.8 min). Technically not immune, not the slow way. I did not pick it.

Physics TTK also dropped 85.80s → 69.00s because the same flat plate was nicking thrown-mass hits in this harness. Hull, armour HP, and shield are untouched. Physics stays the fast way.

## Part 1 survey — armorFlat at or above starter Pulse dmg 8

| id | name | armorFlat | ≥ 8? |
|---|---|---|---|
| wasp_swarmer | Wasp Swarmer | 0 | no |
| lancer_sniper | Lancer Sniper | 1 | no |
| bruiser_brawler | Bruiser Brawler | 3 | no |
| mule_trader | Fleeing Trader | 1 | no |
| reaver_pirate | Reaver Pirate | 1 | no |
| corsair_raider | Corsair Raider | 2 | no |
| patrol_lawman | Patrol Interceptor | 2 | no |
| dreadnought_boss | Dreadnought 'Iron Maw' | 25 → 3 | yes, only one |
| mine_layer_jackal | Mine-Layer Jackal | 1 | no |
| pd_screen_escort | Point-Defense Screen | 2 | no |
| customs_cutter | Customs Cutter | 1 | no |
| choir_zealot | Choir Zealot | 0 | no |
| quiet_ghost | Quiet Ghost | 1 | no |
| tether_control_raider | Tether-Control Raider | 2 | no |
| warden_escort | Warden Escort | 3 | no |
| field_anchor_controller | Anchor Controller | 3 | no |

## Other live armorFlat writers (not edited)

| file:line | what it does | value vs Pulse 8 |
|---|---|---|
| src/data/scenarios/47aLiveScene.js:34 | 47-A evidence spindle payload | 6, already legal; covered in the test |
| src/data/scenarios/47aLiveScene.js:308 | 47-A passive wreck/station helper | 0 |
| src/systems/combat.js:122 | copies catalog `def.armorFlat` onto spawns; `scaleCombatant` does not scale it | copy, not a source |
| src/data/survivalArenas.js:405 | copies catalog into the boss TTK harness | copy, not a source |
| src/systems/missions.js:4114 | forces `spec.armorFlat = 0` on one spawn path | 0 |
| src/systems/ships.js:828 | player `getDerivedStats` hardcodes `armorFlat: 0` | 0 |
| unique-loot / bounty hunters / arena modules / ship and module tables | no `armorFlat` assignments | none |

`src/combat/damage.js:104` applies the number; it does not author it.
