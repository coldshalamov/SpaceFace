# BP-13 — PIRATE ECOLOGY & NAMED CHARACTERS

> **New BP** (doctrine §6). Satisfies **"no enemy without readable intent"** + **"the universe was here before
> you."** **Absorbs clusters D (pirates & aces, 53-75 + 121-125), E-bounty (bounty hunters, 77-80),** and the
> pirate-facing half of C (traffic). Packets: `detail/B_traffic_pirates.md` + `DETAIL_PACKETS.md`. **Extends**
> SPEC3-F4/F7. **Every spawn in this BP is a `spawnBudget` client** — this is why it must not ship on a phantom
> budget (BP depends on the shipped `world.js`→`spawnBudget` client edit).

## Goal
Turn "random enemies zipping around" into **an ecology with motive, restraint, and memory** — pirates who scan,
demand, break off, flee, and *come back*; named characters the sector talks about. The AI brains (SG-06) are
already good — this is identity, restraint logic, and readability.

## Scope (packets in `detail/B_traffic_pirates.md`; highlights)
- [ ] **Scan → toll → violence ladder** — pirates fake civilian until scan range, scan cargo, demand a toll, and only then fight; they **break off when a Concord patrol arrives**. Transforms the shipped `encounterDirector` ambush shapes; hostility stays via `scanner.isHostileToPlayer` (never factionId).
- [ ] **Pirate doctrines** — toll / cargo-thief / tech-raider / salvage-jackal / ideological, each with one verb + one map use.
- [ ] **Named crews + aces** — crews (Red Latch, Sker Hooks, The Empty Ledger) and aces with radio voices (via `barks`), loadout gimmicks, and **flee-and-remember**: a beaten ace returns bigger and appears in `marketNews`.
- [ ] **Pirate rumor heat** — stations report "three haulers vanished near the Pallas-Spur"; ignoring pirates raises route danger; killing a leader briefly increases civilian convoys (feeds `sectorSim`).
- [ ] **Spared-pirate-returns-bigger** — mercy has a consequence (pirate promotion).
- [ ] **Bounty hunters** — **neutral unless the player is the contract**; they chase *NPC* marks through the player's area; the player can help / ignore / interfere; each mark has one signature trick (tether-cutter, mine-dropper, decoy-clone).

## Contracts
**`spawnBudget` client (mandatory)** — request/release; respect the ambient headroom. `voiceArbiter` for barks
(bark rate-limit already enforced). Determinism (seeded encounter streams). `factionId` cosmetic; hostility via
`scanner`. Ambush placement via `sectorZones` ambush lanes + `encounterDirector`.

## Acceptance
`check:pirate-ecology` (new): a pirate scans before firing and breaks off when a patrol enters range; a named ace
flees at low hull and reappears in a later encounter + a news line; a bounty hunter ignores the player until the
player is the contract; total live ships never exceed the `spawnBudget` cap during a multi-pirate encounter.

## Dependencies
`encounterDirector` + `spawnBudget` + `barks` + `scanner` hostility + `marketNews` (all shipped). **Sequence:**
after BP-01 wreck-provenance (ambushes leave wreck fields) and BP-12 (danger → bounty clusters).
