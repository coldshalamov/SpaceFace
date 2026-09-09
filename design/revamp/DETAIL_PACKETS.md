# DETAIL PACKETS — the curated, wave-mapped index

> **What this is:** the 500-item quarry (`DETAIL_BRAINSTORM_R2.md`) curated by a 7-agent fleet under
> `DETAIL_DOCTRINE.md` into **91 gold packets**, plus **56 convergent-validation** items (already shipped —
> do not rebuild) and **58 cut/deferred**. Full gold-packet detail (fantasy · reuses · files · budget · rng ·
> acceptance · failure-modes) lives in `detail/A_sector_station.md` … `detail/G_story_evidence_map.md`.
> This file is the **ranked index + per-BP assignment + sequencing**. Every packet obeys the doctrine's one
> filter: *the player can see it, predict it, or change it.*

---

## 1. THE TOP 24 — ranked by (distance from a shipped system) × (visibility in first-15 / 47-A)

The two proof surfaces are the first-15-minutes ritual and the 47-A "Mass Discrepancy" slice. These are the
packets that most directly convert "flat/empty/cheap" into "inhabited/legible/causal."

| # | Packet | Wave/BP | Pillar | Surfaces (shipped) | Why it ranks |
|---|---|---|---|---|---|
| 1 | **Sector Postcard on arrival** | W3 · BP-11 | glance · world-was-here | `sectorZones` + `world:zoneEntered` | first thing a player feels each jump; near-free over shipped data |
| 2 | **Pirate Toll Ladder** (fake-civilian → scan → demand → fight; break off when patrol arrives) | W3 · BP-13 | world-was-here · one-voice | `encounterDirector` shapes + `scanner` hostility | turns "random zipping" into motive + restraint; visible in first-15 |
| 3 | **Intent Banner** (Intercepting/Fleeing/Scanning/Tethering/Overheating/Calling-Reinforcements) | W2-add · BP-02.1 | glance | SG-06 state (already computed) | HUD layer over existing state; the single biggest combat-legibility win |
| 4 | **Per-Role Contact Glyph + Intent Word** + **Traffic Radio Vocabulary** | W3 · BP-11 | glance · one-voice | `traffic.js` roles + `barks.js` | the 8 traffic roles EXIST but read as gold dots; this makes them legible |
| 5 | **Station Orbit Bubbles** (traffic/patrol/docking/no-fire rings) | W3 · BP-11 | glance · world-was-here | `world.js` station spawn geometry | stations stop being identical shells; readable from afar |
| 6 | **Cause-Ledger Tooltip** ("why prices changed") | W3 · BP-12 | world-was-here | `dangerModel`/`sectorSim` driver + `marketNews` | makes the deepest shipped system perceptible & causal |
| 7 | **First-15 Proof Ritual** (derelict teaches tether by *saving* → mining rhythm → weak pirate tolls then flees → station loop → first choice) | W3 · REVAMP_MASTER §6 | all four | tether + mining + `barks` + `encounterDirector` (all shipped) | the whole game's first impression; assembles shipped verbs into a ritual |
| 8 | **Wreck Provenance** ("who died here" — seed wreck fields from `sectorSim` offscreen losses) | W3 · BP-01.1 | world-was-here | `salvage.js` + `sectorSim` ("gold ore") | the universe-was-here-before-you pillar, made literal |
| 9 | **Sealed Berth** (non-dockable station surfaced: reason + comm-denial) | W3 · BP-11 | one-voice · world-was-here | `dockDeny.js` (shipped) | pure surface of shipped data; kills "why can't I dock, no answer" |
| 10 | **Threat-Tier + Class Badge** (trivial/fair/dangerous/lethal/unknown) | W2-add · BP-02.1 | glance | `scanner` + `entity.data.level` | "understand threat before dying"; data already present |
| 11 | **47-A Ledger-Corruption Readout** (names → weights; HUD wrong in *authored* moments only) | W2 · BP-05.1 | one-voice · world-was-here | `story.js` + the 47-A slice | the story's signature; the mass motif made UI |
| 12 | **Subsystem Targeting** (engines→drift, weapons→flee, tether-spool→free-object) | W2-add · BP-02.1 | momentum-toy · glance | `combat` + `tetherGameplay` (orphaned toy) | wires the dormant momentum toy to combat outcomes |
| 13 | **Named Crews & Aces** (flee-and-remember; return bigger; faction news) | W3 · BP-13 | world-was-here | `encounterDirector` + `barks` + `marketNews` | recurring characters the sector talks about |
| 14 | **Route-Risk Preview** (time/fuel/danger/tolls/last-prices) | W3 · BP-12/BP-03.1 | glance | `galaxyMap` + `dangerModel` | makes the map a decision, not a fog-unlock *(dedup: E+G proposed same → one packet, BP-12 owns)* |
| 15 | **Economy-Born Missions** (surplus→delivery, scarcity→fuel-run, convoy-loss→salvage) | W3 · BP-12 | world-was-here | `sectorSim` + `missions` | missions that feel *caused*, not board-spawned |
| 16 | **Mass-Feel + Mass-Personality** (loadout affects handling; per-hull character) | W2-add · BP-07.1 | momentum-toy · glance | `flightV3` + `ships.js` mass | cheapest depth gain; the toy made tactile |
| 17 | **Battle-Aftermath Persistence** (wrecks/black-boxes → salvage POIs → contracts) | W3 · BP-01/BP-12 | world-was-here | `salvage` + `wreckMissions` (shipped) | fights vanish today; this makes them leave a mark |
| 18 | **Telegraph Tell + Counter Window** (pre-attack flare → dodge/brake/tether-break) | W2-add · BP-02.1 | glance · momentum-toy | SG-06 + weapons | the skill-ceiling counterplay loop |
| 19 | **Customs Moment** (submit/bribe/spoof/run/dump + cargo reputation) | W3 · BP-12 | one-voice · glance | `dockDeny` + faction rep | cargo becomes a decision with stakes |
| 20 | **Mask-Proof Cue Priority** (shield-break/missile-lock/tether-break never mask) | W2-add · BP-10.1 | one-voice · glance | `audioSystem` + `voiceArbiter` | the audio side of "one voice at a time" |
| 21 | **Bounty Hunter Neutrality** (hostile only if the player is the contract; chase NPC marks) | W3 · BP-13 | world-was-here | `scanner` hostility | the world has agents with their own business |
| 22 | **Seam-Sight + Tow-the-Chunk** (mining as spatial/physics play) | W2-fold · BP-02 | momentum-toy · glance | Mining 2.0 (shipped) | mining becomes positioning, not beam-holding |
| 23 | **Hazard Language + Counterplay** (glyph per hazard + a verb to beat it) | W3 · BP-11 | glance · momentum-toy | `sectors.js` HAZARD_TYPES + `world._tickHazards` | "space terrain" made readable |
| 24 | **Faction Radio Cadence** (Concord procedure / Vael garble / Reach toll-wolves) | W2-add · BP-05.1 | one-voice · world-was-here | `barks` + `voiceArbiter` | factions *sound* different; near-free over shipped corpus |

## 2. FULL ASSIGNMENT — all 91 packets by destination

| BP / target | # | Packets (see `detail/*.md` for full schema) |
|---|---|---|
| **BP-11 Sector Atmosphere & Station Life** | 14 | Sector Postcard, Station Orbit Bubbles, Sealed Berth, Station-Type Silhouette Readout, Station Broadcasts, Station Side-Events, Hazard Language, Gate Traffic-Control, Danger Gradient Readout · Traffic Radio Vocabulary, Per-Role Contact Glyph, Traffic Attack Consequence, Role Movement Signatures, Rescue Craft On Cue |
| **BP-12 Causal Economy Missions & Contracts** | 14 | Cause-Ledger Tooltip, Economy-Born Missions, Convoy-Loss Investigation, Customs Moment, Cargo-Reputation Glyph, Security-Response Read, Blockade/Relief Contracts, Collateral & Clauses, Moral-Trap Contracts, Price-Forecast Cone, Route-Risk Preview, Evidence-Cargo Item, Evidence-Scan-Draws-Heat, Smuggler-Compartment Conceal |
| **BP-13 Pirate Ecology & Named Characters** | 12 | Pirate Toll Ladder, Wolf In Gold Paint, Law On The Horizon, Pirate Doctrines, Named Crews & Aces, Pirate Promotion, Pirate Rumor Heat, Route Danger Feedback, Ambush Signatures, Ambush Leaves A Grave, Bounty Hunter Neutrality, Hunter's Signature Trick |
| **BP-02.1 Combat readability (addendum, W2)** | 9 | Intent Banner, Threat-Tier + Class Badge, Scan-Reveals-Loadout, Silhouette Threat Language, Subsystem Targeting, Telegraph Tell + Counter Window, Post-Hit Readability, Posture/Stability, Kills-Less-Central Outcomes |
| **BP-02 mining fold (W2)** | 7 | Seam-Sight, Core-Breach, Tow-the-Chunk, Loud-Drill, Spin-and-Drift, Field-Memory, Fragile-Ore |
| **BP-01 / BP-01.1 Encounter aftermath + salvage depth** | 8 | Encounter-Verb Shapes, Battle-Aftermath Persistence, Wing Morale · Wreck Provenance, Salvage-Distinct-From-Mining, Survivor-Pod Triage, Ghost-Convoy Rumor, Salvage Permit & Fines |
| **BP-05.1 Story/comms (addendum, W2)** | 7 | Situational Bark Surfacing, Bark Decay + Post-Combat Silence, Vael Translation Garble, Ledger-Corruption Readout, Sensor-Contradiction Beat, Fact-Graph Validator, Story-Consequence Map Labels |
| **BP-10.1 Audio (addendum, W2)** | 7 | Mask-Proof Cue Priority, Tether-Strain by Tension-Derivative, Hostile-Lock vs Scan Tone, Customs-Scan Dread Tone, Whipcrack/Groan, Seam & Vent-Bonus Chimes, Critical-Cue Caption Parity |
| **BP-07.1 Flight/ship-mass (addendum, W2)** | 5 | Mass-Feel, Mass-Personality, Drive-Voice, Overload-Handling, Hull-Scars |
| **BP-09.1 Builds/synergies (addendum)** | 4 | Loadout-Silhouette, Build-ID, Synergy-Tells, Module-Drawback-Glyphs |
| **BP-03.1 Map (addendum)** | 3 | Overview Intent Strip, Map-Confidence (not fog), Known-vs-Live Prices |
| **REVAMP_MASTER §6** | 1 | First-15 Proof Ritual |

## 3. CONVERGENT VALIDATION (56 items — already shipped, reframed; DO NOT rebuild)

The brainstorm independently re-derived our architecture — proof it's right. Highlights: global-comms-cap ≡
`voiceArbiter` · station-news-ticker ≡ `marketNews` · sector-identity ≡ `sectorZones` · zone-entry announce ≡
`world._tickZoneLabel` · ambush-from-cover / fake-distress-bait / flee-at-low-hull / call-reinforcements / named-
captains ≡ `encounterDirector` + `encounters.js` + `enemies.js` · per-faction voice ≡ `barks.js` · hostility-by-
context-not-faction ≡ `scanner.isHostileToPlayer` · toll/customs/claim zones ≡ `sectorZones` types · danger
gradient ≡ `dangerTier`/`dangerIndex` · palettes/parallax ≡ `SECTOR_PALETTE_CLASSES` + `spaceBackground`.

## 4. CUT / DEFER (58 items)

- **Hard cut (violates a decision):** keep-two-maps (#257 — we unified to `galaxyMap`); Vael HUD-distortion as an
  ambient generator (HUD-wrong reserved for authored 47-A moments); gate sabotage (breaks the travel contract).
- **Deferred (gold-plating, backlog):** local station reputation (2nd invisible rep axis), used-ship market w/
  history, Newtonian trick medals, training rings, adaptive music state, slaver/boarding doctrines, full
  disable/surrender/bribe branch matrix, per-service voiced dock UI, always-on station turret defenses.
- **Reshaped (fights determinism/perf):** per-frame flavor rolls → seeded domains; unbounded ambient VFX → the
  VFX-per-significance budget.

## 5. SEQUENCING (dependencies)

- **W2 addenda apply AFTER their lane merges** (hard-freeze rule): BP-02.1/05.1/07.1/10.1 + the BP-02 mining fold
  land in a W2 detail pass, not inline.
- **W3 new BPs:** BP-11 first (atmosphere is the widest-felt, lowest-risk, mostly surfacing). Then BP-12 (needs the
  cause-ledger seam) and BP-01.1 wreck-provenance (needs `sectorSim` loss hooks). **BP-13 LAST** of the three —
  every packet is a `spawnBudget` client, so it must ship on the verified budget (it depends on BP-01.1 ambushes-
  leave-wrecks and BP-12 danger→bounty-clusters).
- **Route-Risk Preview dedup:** proposed by both the economy and map lanes → single packet, owned by **BP-12**,
  rendered on `galaxyMap` (BP-03.1 references it).
