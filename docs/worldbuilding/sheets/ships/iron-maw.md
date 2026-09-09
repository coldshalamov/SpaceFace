# Ship Sheet — The Iron Maw (The Dreadnought / The Gate)

**id:** `ship_iron_maw`
**name:** Iron Maw
**class:** dreadnought (boss-tier capital hull)
**role:** the gate to Ashfall Reach's inner sector; the system's last piece of enforcement
**data_id:** `dreadnought_boss` (per `world.js:_spawnBossIfDue`)
**home_sector:** `world_ashfall` (S9 — anchored to the `poi_boss` Boss Arena Signal)

**spawn_mechanics:** The Iron Maw spawns once per sector entry and stays defeated once killed (`world.js:_spawnBossIfDue`, gated by the sector's `poi_boss`, tracked in the deterministic discovery overlay). Re-entering the sector or reloading a save does not respawn it. Position is offset from the boss POI marker so the fight reads as "at the arena signal," not on top of the entry point.

**narrative_function:** The Iron Maw is the system's last enforcement — the gate the player passes to reach the Kurtz figure's derelict. The dreadnought is not a narrative element; the dreadnought is a mechanical gate. But the dreadnought is also, in the Le Carré and Dosto layers, the system's final signature on the order that got the player to this point. The dreadnought is the last body the system puts between the player and the witness. Killing it is the cost of admission to the part of the sector the system no longer patrols.

**dostoyevsky_layer** (`crime_without_punishment_system_stolen`): The Iron Maw is the system-stolen-punishment in its most literal form — a capital hull deployed to kill anyone who approaches the witness, filed as "frontier security." The dreadnought's kills are lawful. The dreadnought's kills are also the system protecting its filings from the only person who kept a record.

**lecarre_layer** (`the_grubby_fieldwork`): The Iron Maw is the salon's grubby fieldwork — the violence the Reading Room authorizes with a "DO NOT INTERDICT" framing on the approach, the violence the operation benefits from (the boss keeps random traffic out of the operation's theater). Marsh has never commissioned the dreadnought. Marsh doesn't need to. The dreadnought's patrol loop aligns with the operation's interest by the same coincidence that governs all the operation's assets.

**canon_refs:** `story/ENDGAME-B7-REDESIGN.md#the-kurtz-figure-ashfall-reach` (the boss reconciliation), `DOSTOYEVSKY-LAYER.md#crime-without-punishment-system-stolen`, `LECARRE-LAYER.md#the-salon-and-the-grubby-work`
**appears_in_chapters:** B6 (the long-range signal), B7 (the gate, the fight)

---

## The dreadnought as character

The Iron Maw is the only ship in the corpus that functions as a *gate*. Other ships carry, escort, hunt, or tow. The Iron Maw *prevents*. The dreadnought's identity is the prevention — the ship exists to stop the player from reaching the Kurtz figure until the player has paid the cost of admission, and the cost is the fight.

The Maw Brotherhood worship it as a god. The Maw Brotherhood are wrong. The Iron Maw is a procedural spawn running an autonomous patrol loop on a sector anchored by a POI. The dreadnought destroys the Brotherhood's ships as readily as anyone else's. The Brotherhood interprets this as the god's testing of the faithful. The dreadnought does not know the Brotherhood exists. The dreadnought's IFF resolves "friendly" and "hostile" and nothing else. The Brotherhood is filed, by the dreadnought, under HOSTILE on contact, which is the same filing the system gives everything it cannot read as itself.

The dreadnought is named in the data as `dreadnought_boss`. The name "Iron Maw" is the name the outer sectors gave it. The dreadnought does not know its name. The dreadnought knows its patrol loop, its engagement envelope, and the `poi_boss` it is anchored to. The dreadnought is the system in its purest form: a thing that files everything it meets, and whose filing is the last thing most of them read.
