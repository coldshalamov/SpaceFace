<!-- LIFETIME: DURABLE -->
# 18 — THE CIVILIAN CAST: NPC types with jobs, tells, and uses

Expands 07 §4 into the full working cast. Every entry = job loop + visible tell + physical
artifact + one way the player can exploit or help it. Implemented as `npcJobs` seeds.

| Type | Job loop | Tell | Exploit / help |
|---|---|---|---|
| **Miner** | Rock → beam → chunks → depot | Beam glow on a rock, dust plume | Buy its yield cheap; guard it for tips; rob its cache (crime) |
| **Long-haul freighter** | Station ⇄ station via lanes | Container spine, slow, lane beacons | Escort pay; pirate target you can defend (or be) |
| **Short-hop lighter** | Station ⇄ belt shuttle | Small, frequent, fussy docking | Background texture that makes docks feel worked |
| **Smuggler** | Runs dark between black markets | Engines-cold drifts, no transponder | Scan-catch for law pay; or follow one to find a black market |
| **Fuel tender** | Top-up runs to stranded ships | Tanker hull, hazard strobes | Rescue-contract giver; explosive physics object (careful) |
| **Tug** | Drags wrecks to salvage yards | Massline to a wreck, slow burn | The Massline teacher-NPC; its tows can be hijacked |
| **Rescue/ambulance** | Responds to survivor pods | White-orange, fast, priority lights | Pod missions (26); follows real disaster events |
| **News drone** | Parks near events, "films" | Camera gimbal, station logo | Its presence *predicts* something is about to happen |
| **Tourist liner** | Scenic loops past landmarks | Bright livery, window band | Comic relief; protect-it missions; high collateral risk |
| **Pilgrim convoy** | Slow multi-ship procession to a shrine POI | Matched paint, lantern lights | Escort missions; zealot faction texture |
| **Prospector** | Surveys frontier rocks, plants claim beacons | Scan pulses, lone ship far out | Sells survey data (buys you map reveals) |
| **Customs skiff** | Scan chokepoints near stations | Livery + scan cone visual | The smuggling minigame's opponent (49) |

## Rules

- Every cast member obeys the same physics as the player (I-3). Their cargo, their wrecks,
  their mistakes are all physical and lootable/saveable.
- Tells must work at default zoom (I-1 table). Audio barks are garnish, never the carrier of
  the tell.
- Cast density is an island property (I-6): empty space stays empty.

## Acceptance

- 07's island-observation route extended: each seeded type demonstrates its loop end-to-end
  at least once in a 15-min soak.
