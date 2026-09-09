# Examples D — Unique-Loot Wreckage Concepts (60 candidates)

**Pattern source:** Freelancer's signature depth technique (see `freelancer.md` §"Hidden wrecks" +
"Wreckage deep-dive" + "Discovery loop"). The strongest / most characterful gear in Freelancer is
**not sold; it is discovered** through `rumor → exploration → salvage`. Each wreck holds a **unique
item unavailable otherwise**, gated by a bar / news / comms / bark / mission rumor. This converts the
worldbuilding layer (who hated whom, where a ship went down) into the progression layer (best gear,
faction leverage, story hooks). The player who reads/listens is mechanically stronger; the player
who skips bars and news is permanently poorer.

**How this file is used.** Each of the 12 slots below is a *wreck position the design wants filled*
(one per wreckClass family of intent). For each slot we give **5 genuinely different candidate
wrecks** — different ship, different unique drop, different story, different sector — so a designer
can pick one (or seed one per save via the loss-ledger provenance hash). That is 12 × 5 = **60
candidates**, a creative-concept pool, not a final placement.

## The 5 wreckClasses (from `src/data/wreckClasses.js`)

| Class | `scanLabel` | `poolLean` | `restricted` | What it means for the player |
|---|---|---|---|---|
| `debris` | Wreck Debris | scrap | no | no-provenance default — slim pickings, no questions |
| `fresh` | Recent Wreck | intact | no | a recent loss — cargo intact, race the scavengers |
| `battlefield` | Battle-scarred Hulk | mixed | no | shot to pieces in a recorded fight — hot, cut carefully |
| `military` | Classified Military Hulk | milspec | **yes** | Concord/faction-flagged — stripping it is a crime (Concord fines, Quiet launders) |
| `ancient` | Ancient Derelict | trace | no | drifted here before the lane was charted — mostly picked clean; the black box may still read |

Class assignment in the live game is **seeded** via `pickWreckClass({seed, lossId, sectorId})` —
keyed off the recorded loss id + sector so the ledger and the wreck always agree (`lossLedger.js`).
These concepts are the *authored* layer that loss-ledger provenance promotes a wreck *into*.

## Slot layout

| Slots | Class | Theme | Loot family |
|---|---|---|---|
| 1–3 | `military` | lost military hulls (restricted salvage) | high-tier **weapon** blueprints |
| 4–6 | `ancient` | pre-lane / precursor derelicts | exotic **module** variants |
| 7–9 | `battlefield` | shot-up hulks in war zones | named-captain lore + mid-tier loot |
| 10–12 | `fresh` | recent losses in core space | story-hook commodities + minor unique module |

## Loot discipline (the whole point of "unique")

Every unique drop is a **named variant / blueprint of an EXISTING item family** from `weapons.js` or
`modules.js` — the codename (à la Freelancer's *Tizona del Cid*, *Nattermodul*, *Kraken*) is the
fiction skin over a real mechanical tradeoff (e.g. `wpn_beam_laser_m` blueprint with +range / +heat).
No new item system is invented. The base family id is cited in `backticks` on every drop.

## Rumor-delivery systems (all verified real in the codebase)

Every `Rumor leak` cites a system that actually exists:

- **`bar.js`** — station "Bar" tab, rumor sub-menu, `stationContacts.js` memory (NPCs sell rumors for credits)
- **`newsTemplates.js` / `marketNews.js`** — news-ticker articles (the LNN equivalent)
- **`comms.js`** via **`encounterDirector.js`** — comms intercepts (overheard with a Cargo Scanner / Sensor Array)
- **`barkDirector.js`** — ship barks / taunts / death-lines
- **`missions.js` / `embodiedMissions.js` / `careerContracts.js`** — missions board (chain rewards reveal the bearing)
- **`story/campaign47a/*`** — campaign-thread reveals
- **`lossLedger.js` / `lossInvestigation.js`** — recorded-loss investigation feeds wreck provenance directly

---

# SLOT 1 — MILITARY · Concord fast-attack gunships lost on fringe patrol

> Energy-weapon blueprints (`wpn_pulse_laser_m` / `wpn_beam_laser_m` family). Five different lost
> gunships, five different fringe/anomaly sectors. All `restricted: true` — Concord fines, the Quiet
> launders.

### 1a. ISC Vigilant
- **Class:** `military`
- **Location:** `sector_veil_nebula` — buried in the central nebula (radius 3000, intensity 0.9), beyond the wormhole POI; resolves only on a survey scan
- **Unique drop:** **"Veil-Cutter"** (`wpn_beam_laser_m` blueprint) — +15% range, tighter spread (0.3°), but +20% heat/sec. A beam tuned to cut through fog/nbeula visibility penalty.
- **Rumor leak:** `newsTemplates.js` — a "Losses in the Veil" ticker references a Concord gunship that went dark during a nebula survey; the bearing opens as a `lossInvestigation.js` case file.
- **Backstory:** The Vigilant was the last gunship assigned to chart the Veil's core before Concord pulled the survey budget. Its pilot, Lt. Cairn Vesh, ignored the recall beacon to finish one more pass. The nebula ate the ship's telemetry; only the weapon's focusing array still pings.
- **Hazard to reach:** full-immersion nebula (radar-range cut, sensor ghosting), a drifting radiation pocket, and a Free Frontier research skiff that claims salvage rights.

### 1b. SCN Cascader
- **Class:** `military`
- **Location:** `sector_kepler_scar` — inside the Scar Radiation Field (radius 900, intensity 0.65), wedged under a debris overhang
- **Unique drop:** **"Cascade Array"** (`wpn_pulse_laser_m` blueprint) — +35% RoF (8.1/s), -20% dmg/shot. A sustained-suppression pulse for overwhelming missile swarms.
- **Rumor leak:** `comms.js` intercept via `encounterDirector.js` — encrypted Concord traffic ("is the Cascader's array still hot?") overheard when carrying a Cargo Scanner in Scar-adjacent sectors.
- **Backstory:** The Cascader tested a rapid-cycle pulse array meant to break missile locks. It died covering a retreat from the Scar Bazaar raid; Reach salvaged the hull but couldn't crack the weapon's lockout, then abandoned it when the radiation climbed.
- **Hazard to reach:** Scar Radiation Field (shield bleed), a Reach corsair patrol (3–5 ships) returning to loot the wreck on a timer.

### 1c. Concord Argent
- **Class:** `military`
- **Location:** `sector_triton_wake` — in the radiation field (radius 780, intensity 0.62) near the Wake Anomaly POI, half-frozen in a gas-cloud crystallite
- **Unique drop:** **"Argent Beam Refit"** (`wpn_beam_laser_m` blueprint) — -30% heat/sec, +10% dps, -15% range. A cooler, punchier cutter.
- **Rumor leak:** `missions.js` / `embodiedMissions.js` — a Triton Wake Lab mission "Anomaly Calibration" hints the Argent's beam array is needed to tune the lab's instruments; accepting reveals the bearing.
- **Backstory:** The Argent was loaned to Free Frontier scientists as a calibration platform for the Wake Anomaly. When the Vael tightened their hold on the sector, Concord ordered it scuttled rather than let the array fall into precursor-cult hands. The pilot scuttled the drive but not the gun.
- **Hazard to reach:** Vael lancer-sniper overwatch from the anomaly-deep zone, moving gas-cloud crystallites (collision), and the wreck is rep-gated (Vael hostile on sight).

### 1d. ISC Sunpike
- **Class:** `military`
- **Location:** `sector_pallas_drift` — in the nebula hazard (radius 800, intensity 0.4), drifting near the hidden Smuggler Den approach
- **Unique drop:** **"Sunspike"** (`wpn_pulse_laser_m` blueprint) — +50% dmg/shot, halved RoF (3/s), +30% energy cost. A marksman's pulse.
- **Rumor leak:** `bar.js` rumor sub-menu — a drunk ex-Concord armorier at the Drift Market sells the rumor for credits: "the Sunpike's capacitors are worth the trip if you can shoot straight."
- **Backstory:** The Sunpike was a precision-strike gunship hunting Quiet smugglers through the Pallas nebula. It killed three skiffs before a fourth planted a limpet mine on its reactor. The armorier who tuned its capacitors still drinks over what he built.
- **Hazard to reach:** a Quiet smuggler patrol that does not appreciate Concord salvage being touched, nebula sensor fog, and the Smuggler Den's rep-gated hostility if you're flagged Concord-friendly.

### 1e. SCN Heliacal
- **Class:** `military`
- **Location:** `sector_orcus_shadow` — deep in the Shadow Threshold anomaly zone (radius 1000, threat 4), at the edge of the radiation field (radius 1600, intensity 0.75)
- **Unique drop:** **"Heliacal Repeater"** (`wpn_pulse_laser_m` blueprint) — +25% RoF, +15% tracking-friendly spread, -15% range. A close-in pulse spammer.
- **Rumor leak:** `barkDirector.js` — a Vael bruiser-brawler taunts "your Concord sun-boat sank in our shadow" when engaged in Orcus-adjacent sectors, dropping the wreck's general bearing.
- **Backstory:** The Heliacal was part of a doomed Concord reprisal into Vael-held space. It lasted eleven minutes. The Vael left the hull as a marker — a warning at the threshold of what they guard.
- **Hazard to reach:** Vael ring-formation defense (1–3 bruiser/lancer), extreme radiation (shields degrade fast), anomaly-deep sensor ghosting that makes the wreck hard to lock.

---

# SLOT 2 — MILITARY · Syndicate/Drift escort corvettes lost guarding convoys

> Kinetic-weapon blueprints (`wpn_autocannon_m` / `wpn_railgun_m` family). Five named escort
> corvettes across contested mining/trade space. All `restricted: true`.

### 2a. RTS Halberd
- **Class:** `military`
- **Location:** `sector_rhea_cinder` — in the Slag Glow radiation field (radius 720, intensity 0.55), under the Slag Hauler Hulk POI debris
- **Unique drop:** **"Halberd Grudgegun"** (`wpn_autocannon_m` blueprint) — +40% armor-pierce (0.7), +10% dmg, +25% heat/shot. A hull-breaker.
- **Rumor leak:** `newsTemplates.js` — a Meridian trade-wire piece "Cinder Claims: Who Pays for the Halberd?" references the lost escort and the unpaid bounty on its gun.
- **Backstory:** The Halberd was a Drift Miners Collective escort guarding a slag hauler through Reach-patrolled space. When the convoy was hit, the Halberd's captain turned back into the ambush to recover the hauler's crew. Both ships died in the glow; the Collective never sent another escort that far north.
- **Hazard to reach:** Reach ambush-lane patrol (corsair/reaver, 2–4 ships) on the Sker-facing approach, slag radiation, and the wreck is Drift-flagged (Concord may fine unpermitted salvage).

### 2b. MTS Farstrike
- **Class:** `military`
- **Location:** `sector_charon_expanse` — in the radiation hazard (radius 700, intensity 0.5), beyond the Abandoned Mining Colony POI
- **Unique drop:** **"Farstrike Rail"** (`wpn_railgun_m` blueprint) — +30% range (1430 wu), +15% dmg, +50% energy cost and longer lock. A sniper's rail.
- **Rumor leak:** `careerContracts.js` — a Meridian "long-shot bounty" contract chain; completing the chain unlocks a tip that the Farstrike's tuned rail was the bounty hunter's edge.
- **Backstory:** The Farstrike was a Meridian-hired bounty corvette that ran pirates out of the Charon exotics fields for three years. It died on a mine it had seeded itself and forgotten; the rail it carried was the only thing the exotics-miners couldn't sell.
- **Hazard to reach:** dense-asteroid navigation, the radiation field, and an active Drift mining crew that claims exotics salvage rights (negotiation or hostility).

### 2c. DMC Ironsong
- **Class:** `military`
- **Location:** `sector_nyx_march` — in the Hyperion Cut Lane ambush zone (radius 620, threat 3), near the Cut-Runner Wreck POI
- **Unique drop:** **"Ironsong AC"** (`wpn_autocannon_m` blueprint) — +20% RoF, tighter spread (1.0°), -10% dmg. A suppression autocannon.
- **Rumor leak:** `comms.js` intercept — Quiet fence traffic overheard at the Nyx Fence mentions "the Ironsing gun" (sic) still bolted to a hull in the cut-lane.
- **Backstory:** The Ironsong ran Drift ore convoys through the cut-lane until Reach skiffs finally caught it between gates. Its captain sang over the comms as she went down; the recording still circulates in Quiet bars, and the gun still has her name etched in it.
- **Hazard to reach:** Reach ambush-lane (corsair/reaver/wasp, 2–4 ships, wedge), Quiet smuggler interference, and Quiet-patrolled space (rep-gated safe passage).

### 2d. SCN Whipsnap
- **Class:** `military`
- **Location:** `sector_haumea_rift` — in the Ice Fissure anomaly signal (radius 520, threat 2), beneath the fissure line
- **Unique drop:** **"Whipsnap Rail"** (`wpn_railgun_m` blueprint) — +50% projSpeed (1050 wu), +20% tracking-friendly, -25% dmg. A fast-light hit-register rail.
- **Rumor leak:** `bar.js` rumor sub-menu — a Rift Observatory scientist at `station_haumea_rift` trades the rumor for a completed scan-data favor: "the Whipsnap's coil is the only thing in this fissure that still resonates."
- **Backstory:** The Whipsnap was a Concord patrol courier testing a fast-coil rail against ice-pirate skimmers. It vanished into the fissure during a resonance event; the Observatory still picks up its coil's signature on cold days.
- **Hazard to reach:** the Ice Fissure anomaly (sensor ghosting, autopilot drift), dense-asteroid ice field, and Free Frontier scientists who want the coil for their research (rival-salvager encounter).

### 2e. MTS Maul
- **Class:** `military`
- **Location:** `sector_proteus_well` — in the nebula hazard (radius 900, intensity 0.55), near the Well-Mouth Hulk POI
- **Unique drop:** **"Maul Autocannon"** (`wpn_autocannon_m` blueprint) — +35% dmg, +20% armor-pierce, -30% RoF, +30% heat. A heavy single-shot puncher.
- **Rumor leak:** `newsTemplates.js` — a Quiet-wire shadow-news piece (carried on the blackmarket feed) "The Maul That Walked the Well" romanticizes the lost Meridian escort.
- **Backstory:** The Maul was the heaviest escort Meridian ever sent into Quiet space — a show of force that lasted one jump. Quiet fences stripped the cargo but left the gun; nobody could lift it without the captain's biometric lock, and the captain died with it.
- **Hazard to reach:** Quiet fence patrol (reaver-pirate smugglers), nebula fog, and the wreck is biometric-locked (requires a Quiet favor or a Cargo Scanner brute-force minigame to open).

---

# SLOT 3 — MILITARY · Capital-class weapon test platforms / prototype dreadnoughts

> Tier-4/5 `L`-slot weapon blueprints (`wpn_heavy_beam_l` / `wpn_torpedo_l` / `wpn_siege_lance_l`
> family). Endgame salvage; the strongest guns in the game, found not bought.

### 3a. ISC Lighthouse
- **Class:** `military`
- **Location:** `sector_ashfall_reach` — in the moving radiation field (radius 2000, intensity 0.8), near the Boss Arena Signal POI; reachable only when the radiation drifts away on its cycle
- **Unique drop:** **"Lighthouse Heavy Beam"** (`wpn_heavy_beam_l` blueprint) — +25% dps, +15% range, +35% heat/sec. A sustained-capital cutter.
- **Rumor leak:** `story/campaign47a/embodiedMissions.js` — a late-campaign mission references the Lighthouse as a "lost testbed" whose beam array is the only thing that can reliably cut the Boss Arena's shell.
- **Backstory:** The Lighthouse was Concord's prototype siege-beam platform, sent to crack the Ashfall anomaly. It fired once, killed whatever it hit, and the return-fire split the ship lengthwise. The beam array is intact because it was the only thing hardened enough to survive.
- **Hazard to reach:** the moving radiation field (timing-dependent approach), Vael boss-tier presence at the arena, and the debris field (collision) — endgame salvage.

### 3b. Choir Bedrock
- **Class:** `military`
- **Location:** `sector_phoebe_echo` — in the radiation field (radius 1400, intensity 0.7), at the Echo Shrine anomaly's edge
- **Unique drop:** **"Bedrock Torpedo"** (`wpn_torpedo_l` blueprint) — +50% dmg (480), +30% splash, -40% projSpeed, longer lock. A slow dreadnought-killer.
- **Rumor leak:** `barkDirector.js` — a Vael lancer-sniper at the Shrine mutters "the Choir's bedrock-thrower sleeps here" as a death-bark when killed near Phoebe.
- **Backstory:** The Bedrock was an Ascendant Choir capital that bombarded the Vael shrine from orbit two centuries ago. The Vael pulled it down with gravity anchors and left it as a lesson. Its torpedoes were tuned to crack precursors — and still can.
- **Hazard to reach:** Vael Shrine defense (ring formation, 1–3 elite), extreme radiation, anomaly-deep sensor kill-zone.

### 3c. SCN Trenchweight
- **Class:** `military`
- **Location:** `sector_sedna_dark` — in the radiation field (radius 900, intensity 0.72), near the Sedna Vault POI
- **Unique drop:** **"Trenchweight Torpedo"** (`wpn_torpedo_l` blueprint) — +60% turn-rate (2.2) for closer-range launch, -30% range, -20% dmg. A maneuverable anti-capital torpedo.
- **Rumor leak:** `newsTemplates.js` — a Concord defense-wire piece "Sedna Survey: What We Lost" declassifies the Trenchweight's last bearing.
- **Backstory:** The Trenchweight was a Concord torpedo-testbed surveying the Vael frontier. It launched one salvo at something it shouldn't have, and the something answered. The wreck's racks are still loaded — the Vael never approached close enough to disarm them.
- **Hazard to reach:** Vael survey-post defense, radiation, and loaded torpedo racks (proximity detonation risk if you shoot the wreck instead of tractoring).

### 3d. DMC Wyrmbreaker
- **Class:** `military`
- **Location:** `sector_eunomia_gulf` — in the debris hazard (radius 700, intensity 0.5), tangled in the Gulf Hulk POI debris chain
- **Unique drop:** **"Wyrmbreaker Lance"** (`wpn_siege_lance_l` blueprint) — +40% armor-pierce, +20% dmg, +50% energy cost. A capital-cracking lance.
- **Rumor leak:** `missions.js` — a Vael Fence black-market mission "Recover the Wyrmbreaker's Tooth" offers the bearing as the reward.
- **Backstory:** The Wyrmbreaker was a Drift-funded privateer capital that harried Reach shipping for a decade. It died in the Gulf debris when a Reach swarm-king drove it into the rocks. The lance it carried was the only thing that ever reliably cut a swarm-king's carapace.
- **Hazard to reach:** Vael Fence rep-gate, debris-field collision, and a Reach swarm-king that returns to the Gulf on a patrol cycle.

### 3e. Choir Watchfire
- **Class:** `military`
- **Location:** `sector_veil_nebula` — at the Wormhole POI (gatedBy `tech_long_range_survey`), in a pocket of calm inside the nebula
- **Unique drop:** **"Watchfire Heavy Beam"** (`wpn_heavy_beam_l` blueprint) — -20% heat/sec, +30% range, -25% dps. A long-cool sustained beam.
- **Rumor leak:** `comms.js` intercept via `encounterDirector.js` — a Choir hymn-frequency broadcast heard only when carrying a Sensor Array through the Veil references "the Watchfire that guards the door."
- **Backstory:** The Watchfire was a Choir capital stationed to guard the Veil wormhole against whatever comes through. It succeeded once. The second thing that came through was bigger. The beam array still tracks the wormhole's mouth, two centuries cold.
- **Hazard to reach:** requires `tech_long_range_survey`, nebula immersion, wormhole instability (radiation pulses).

---

# SLOT 4 — ANCIENT · Pre-lane survey derelicts (engine / mobility blueprints)

> Exotic engine + mobility module variants (`mod_engine_*` / `mod_jump_drive_m` / `mod_drone_bay_l`
> family). Drifted here before the lane was charted. Deep fringe / anomaly sectors.

### 4a. Surveyor Driftwind
- **Class:** `ancient`
- **Location:** `sector_orcus_shadow` — in the nebula hazard (radius 1100, intensity 0.55), drifting at the far edge beyond the Shadow Cache station
- **Unique drop:** **"Driftwind Ion Thruster"** (`mod_engine_ion_m` blueprint) — +20% top speed (84), +15% turn, +25% energy draw. A fast old-survey drive.
- **Rumor leak:** `bar.js` rumor sub-menu — the Shadow Cache station contact tells, after a rep-favor, of "the first ship that ever charted this place" and its still-ticking drive.
- **Backstory:** The Driftwind was a pre-lane Free Frontier surveyor that charted Orcus before the Vael claimed it. It ran out of fuel fifty years before the first gate was built. Its drive was over-engineered for a ship that would never come home — and still runs.
- **Hazard to reach:** Vael Shadow Threshold patrol, nebula fog, extreme distance from any dock (fuel/energy management).

### 4b. Pathfinder Emberthrust
- **Class:** `ancient`
- **Location:** `sector_rhea_cinder` — in the Cinder Claim mining belt, buried under slag at the Burned Survey Cache POI
- **Unique drop:** **"Emberthrust Fusion Drive"** (`mod_engine_fusion_m` blueprint) — +25% accel (1.6×), +30% energy draw, +20% heat signature (cloaks less effective). A hot old burner.
- **Rumor leak:** `newsTemplates.js` — a Frontier-archaeology wire piece "The Cinder Surveys" lists the Emberthrust among ships "never recovered" with a bearing hint.
- **Backstory:** The Emberthrust was one of the first fusion-drive survey ships to map the Cinder belt. It crashed during a core-sample burn and was buried in its own slag. Drift miners have been walking over it for thirty years.
- **Hazard to reach:** Reach ambush-lane on the Sker approach, slag radiation, mining-belt claim holder (negotiate or trespass).

### 4c. Lanebreaker Pale-Coil
- **Class:** `ancient`
- **Location:** `sector_phoebe_echo` — at the Silent Vault POI (hidden cache), inside the radiation field
- **Unique drop:** **"Pale-Coil Warp Drive"** (`mod_engine_warp_l` blueprint) — +15% top speed (150) and the warp coil doubles as a one-time emergency in-sector micro-jump (blink). An old experimental drive.
- **Rumor leak:** `embodiedMissions.js` — a Free Frontier research chain "The Lost Coils" unlocks the bearing after three completed anomaly scans.
- **Backstory:** The Pale-Coil was the prototype ship for the warp-coil tech that became standard a century later. It disappeared into Vael space testing a micro-jump maneuver the modern coil can no longer do. The Vael sealed it in the Vault because they couldn't decide if it was a relic or a weapon.
- **Hazard to reach:** Vael Shrine overwatch, extreme radiation, and the Vault is hidden (requires a Survey Suite ping to reveal).

### 4d. Courier Slipdrive
- **Class:** `ancient`
- **Location:** `sector_haumea_rift` — at the Rift Range Buoy POI, frozen in the ice fissure
- **Unique drop:** **"Slipdrive T3 Jump"** (`mod_jump_drive_m` blueprint) — `jumpDriveTier: 3` (one tier above stock), -20% charge time. An old pre-standard jump coil.
- **Rumor leak:** `bar.js` rumor sub-menu — a Rift Observatory elder scientist reminisces about "the courier that could jump farther than anything we build now" for a drink and a favor.
- **Backstory:** The Slipdrive was a Meridian courier that ran pre-lane jumps through the rift before the gate network reached Haumea. Its jump coil was hand-tuned past modern tolerances; nobody has matched it since. It iced up on a cold run and never thawed.
- **Hazard to reach:** the Ice Fissure anomaly, dense ice-asteroid field, rival Free Frontier researchers who want the coil.

### 4e. Drone-Tender Wingden
- **Class:** `ancient`
- **Location:** `sector_sedna_dark` — at the Sedna Vault POI (hidden cache), deep in the radiation
- **Unique drop:** **"Wingden Drone Bay"** (`mod_drone_bay_l` blueprint) — +50% drone count, drones are slower. An old swarm-tender hangar.
- **Rumor leak:** `newsTemplates.js` — a Vael-archaeology shadow-piece "The Tender That Fed the Swarm" references the Sedna Vault and the hangar inside.
- **Backstory:** The Wingden tendered the drone swarms that built the first Sedna survey post. When the Vael moved in, the crew scuttled the tender in the Vault rather than let the drones be turned. The hangar still has its complement, cold but viable.
- **Hazard to reach:** Vael survey-post defense, extreme radiation, and the drones themselves activate if you trigger the wrong panel (defensive swarm).

---

# SLOT 5 — ANCIENT · Precursor-shielded hulks (shield / defensive module variants)

> Shield-family variants (`mod_shield_booster_s` / `mod_shield_capacitor_m` / `mod_shield_hardener_m`
> / `mod_shield_aegis_l`). Old bulwarks that still cycle, empty.

### 5a. Bulwark Veilshield
- **Class:** `ancient`
- **Location:** `sector_veil_nebula` — at the Anomaly Signal POI, inside the central nebula
- **Unique drop:** **"Veilshield Capacitor"** (`mod_shield_capacitor_m` blueprint) — +30% shield flat (234), -20% regen. A heavy old bulwark.
- **Rumor leak:** `comms.js` intercept — a Research Station Veil transmission references "the old bulwark that still holds the anomaly's edge."
- **Backstory:** The Veilshield was a Concord science-bulwark stationed at the anomaly to study it. It held the line against an anomaly pulse that killed its crew but left the shields intact. The shields have been cycling, empty, for decades.
- **Hazard to reach:** nebula immersion, anomaly-pulse radiation spikes, Free Frontier scientists who want the shield data.

### 5b. Choir-Bell Aegis
- **Class:** `ancient`
- **Location:** `sector_triton_wake` — at the Wake Marker POI, in the nebula (radius 1100, intensity 0.7)
- **Unique drop:** **"Choir-Bell Aegis"** (`mod_shield_aegis_l` blueprint) — +25% shield flat (650) with a 1/encounter reactive-pulse that knocks back nearby missiles, +50% energy draw. An old Choir fortress shield.
- **Rumor leak:** `barkDirector.js` — a Vael lancer at the Wake mutters about "the singing bell that won't break" as a patrol taunt.
- **Backstory:** The Choir-Bell was an Ascendant Choir fortress ship that rang the Wake's resonance until the Vael silenced it. The shield-bell still hums at the resonance frequency; the Vael leave it as a shrine to a worthy enemy.
- **Hazard to reach:** Vael Wake patrol, nebula + radiation, and the resonance frequency (the shield discharges if you don't tractor at the right moment — a timing minigame).

### 5c. Hardcase Thornwall
- **Class:** `ancient`
- **Location:** `sector_charon_expanse` — in the dense-asteroid hazard (radius 650, intensity 0.5), under the Abandoned Colony
- **Unique drop:** **"Thornwall Hardener"** (`mod_shield_hardener_m` blueprint) — +50% damage-reduction (0.18), +100% energy draw when active (burst-mode). An old siege-hardener.
- **Rumor leak:** `bar.js` rumor sub-menu — an ex-Concord engineer at the Expanse Refinery sells the rumor cheap: "the Thornwall's hardener is the only reason the colony lasted as long as it did."
- **Backstory:** The Thornwall was the shield-ship defending the Charon colony in its last stand. Its hardener held for three days against Reach siege. When the colony fell, the crew scuttled rather than be taken; the hardener still cycles on siege-mode.
- **Hazard to reach:** dense-asteroid navigation, radiation, a Reach raider band that returns to loot the colony.

### 5d. Pale-Bulwark
- **Class:** `ancient`
- **Location:** `sector_proteus_well` — at the Well Stash POI (hidden cache), in the nebula
- **Unique drop:** **"Pale-Bulwark Booster"** (`mod_shield_booster_s` blueprint) — +50% regen (3/s), -30% flat. A regen-focused old booster.
- **Rumor leak:** `missions.js` — a Quiet Den mission "Recover the Pale-Bulwark's Heart" offers the bearing for a cut of the take.
- **Backstory:** The Pale-Bulwark was a Quiet blockade-runner that ran the Well for decades on sheer shield-regen. It finally died when a Concord interdictor pinned it in the nebula. The booster still ticks, regenerating nothing, waiting for a hull.
- **Hazard to reach:** Quiet Den rep-gate, nebula fog, a Concord patrol that intermittently sweeps the Well for Quiet salvage.

### 5e. Aegis-Reborn
- **Class:** `ancient`
- **Location:** `sector_kepler_scar` — at the Raider Stash POI (hidden cache), in the debris hazard
- **Unique drop:** **"Aegis-Reborn"** (`mod_shield_aegis_l` blueprint) — +15% flat, +15% regen, passive 5% damage-reflection, -20% maneuverability while equipped. An old reactive aegis.
- **Rumor leak:** `newsTemplates.js` — a Reach-shadow wire piece "The Aegis That Bites Back" romanticizes the lost fortress ship.
- **Backstory:** The Aegis-Reborn was a Reach-captured Concord fortress that the corsairs refit with a reflection lattice. It turned on them at the Scar and held the bazaar for a week alone. Reach still tells the story; the ship still bites.
- **Hazard to reach:** Scar Bazaar rep-gate (Reach hostile if you're flagged lawful), radiation + debris, reflection lattice (shooting the wreck reflects damage).

---

# SLOT 6 — ANCIENT · Vael-guarded tombs / Choir relics (exotic utility)

> The weirdest tools — cloak / sensor / tractor / repair / mining variants. Guarded by Vael in
> anomaly-deep sectors. `poolLean: trace` but the one unique is the point.

### 6a. Shroud-Mk0 Veilwalker
- **Class:** `ancient`
- **Location:** `sector_ashfall_reach` — at the Ancient Vault POI (hidden cache), inside the moving radiation field
- **Unique drop:** **"Veilwalker Cloak"** (`mod_cloak_mk2` blueprint) — -25% cloak radius (158), -30% drain, +50% recharge time. A deeper old cloak.
- **Rumor leak:** `story/campaign47a/embodiedMissions.js` — a campaign-thread mission reveals the Vault's bearing and that "what hides inside can hide you better."
- **Backstory:** The Veilwalker was a Choir stealth-scout that first charted Ashfall before the Vael woke. Its cloak was a generation ahead of the modern Shroud; the Vael sealed it in the Vault because they could not see it to remove it.
- **Hazard to reach:** moving radiation (timing), Vael boss-tier at the arena, Vault is hidden (Survey Suite required).

### 6b. Far-Ear Echofinder
- **Class:** `ancient`
- **Location:** `sector_phoebe_echo` — at the Echo Resonance POI (anomaly-deep zone)
- **Unique drop:** **"Echofinder Array"** (`mod_sensor_array_l` blueprint) — +80% radar range, -50% while cloaked (mutual-exclusion). An old deep-listening array.
- **Rumor leak:** `bar.js` rumor sub-menu — the Echo Shrine keeper trades the rumor for a Vael rep-favor: "the ear that first heard the echo still listens."
- **Backstory:** The Far-Ear was the Free Frontier array-ship that detected the Phoebe echo. It was pulled into the resonance and never recovered; its array still listens at the frequency that killed it.
- **Hazard to reach:** Vael Shrine overwatch, extreme radiation, resonance (sensor ghosting that punishes active scanning).

### 6c. Gravhand Tideline
- **Class:** `ancient`
- **Location:** `sector_eunomia_gulf` — at the Gulf Hulk POI, in the debris + radiation
- **Unique drop:** **"Tideline Tractor"** (`mod_tractor_beam_m` blueprint) — +80% magnet range (720), can tractor small wrecks whole, +100% energy draw. An old heavy tractor.
- **Rumor leak:** `newsTemplates.js` — a Drift-archaeology wire "The Hand That Fed the Gulf" references the lost tractor-ship.
- **Backstory:** The Tideline was a Drift recovery tug that pulled whole wrecks out of the Gulf for decades. It died pulling something too big; the tractor still grips the thing it died holding. Nobody has looked at what it is.
- **Hazard to reach:** Vael Fence rep-gate, debris collision, radiation, and the "thing" the tractor holds (unknown signature — possible boss hook).

### 6d. Mender-Swarm Bloodwire
- **Class:** `ancient`
- **Location:** `sector_haumea_rift` — at the Ice Fissure Signal POI, frozen deep
- **Unique drop:** **"Bloodwire Nanobots"** (`mod_repair_nanobots_m` blueprint) — +50% hull-repair rate (6/s), consume a small commodity (rare ore) per use. An old self-repair swarm.
- **Rumor leak:** `comms.js` intercept — a Free Frontier Observatory transmission frets about "the swarm that won't stop mending the dead ship."
- **Backstory:** The Bloodwire was a Choir medical-tender whose nanobots were tuned to keep repairing long after the crew died. It still drifts the fissure, mending a hull with no one inside. The bots will work for anyone who feeds them ore.
- **Hazard to reach:** Ice Fissure anomaly, dense ice field, rival researchers; the nanobots will also "mend" your enemies if they get closer than you.

### 6e. Deepcore Coretap
- **Class:** `ancient`
- **Location:** `sector_orcus_shadow` — at the Orcus Signal POI (anomaly-deep zone), in the radiation core
- **Unique drop:** **"Coretap Pulverizer"** (`mod_mining_pulverizer_l` blueprint) — +60% dps (77), +50% rare-ore chance (0.15), +100% energy draw, shorter range. An old precursor core-drill.
- **Rumor leak:** `embodiedMissions.js` — a Vael research chain "The Core That Sang" unlocks the bearing after you bring the Shadow Cache three anomaly scans.
- **Backstory:** The Coretap was a Choir mining-rig that drilled the Orcus anomaly's core. It pulled up something that sang, and the rig was sealed at the signal by the Vael. The drill still runs at precursor frequency; it cuts rock like silk.
- **Hazard to reach:** Vael Shadow Threshold overwatch, extreme radiation, anomaly-deep sensor kill-zone.

---

# SLOT 7 — BATTLEFIELD · Reach-vs-Concord border battles (named pirate hunters / corsair captains)

> Mid-tier weapon variants (`wpn_missile_rack_m` / `wpn_emp_disruptor_m` / `wpn_plasma_cannon_m` /
> `wpn_flak_turret_s` family) + named-captain lore. `poolLean: mixed`, cut carefully.

### 7a. Corsair-King Vrael's "Nestbreaker"
- **Class:** `battlefield`
- **Location:** `sector_sker_haven` — at the Bounty Wrecks POI, in the dense-asteroid field
- **Unique drop:** **"Nestbreaker Missile Rack"** (`wpn_missile_rack_m` blueprint) — missiles split into 2 sub-munitions on impact (+100% effective hit count), -30% per-missile dmg. A swarm-breaker.
- **Rumor leak:** `bar.js` rumor sub-menu — the Sker Bazaar bartender tells the legend of Vrael, who "built the rack that broke Concord's nest," for a drink and rep.
- **Backstory:** Vrael was the Reach corsair-king who held Sker Haven against three Concord punitive raids. His Nestbreaker rack was designed to kill fighter swarms; he died on the fourth raid when Concord brought a capital. His wreck is a shrine to Reach pilots.
- **Hazard to reach:** dense-asteroid field, Reach bounty-hunter patrols (the wreck is sacred to them — hostile if you loot), Sker is rep-gated.

### 7b. Captain Linn Harg's "Hushgun"
- **Class:** `battlefield`
- **Location:** `sector_io_reach` — in the dense-asteroid hazard (radius 700, intensity 0.5), near the Derelict Cruiser POI
- **Unique drop:** **"Hushgun EMP"** (`wpn_emp_disruptor_m` blueprint) — +50% subsystem-share disruption, -30% range. A close-in disable gun.
- **Rumor leak:** `newsTemplates.js` — a Meridian-wire piece "The Captain Who Silenced Io" eulogizes Linn Harg and hints the gun is still in the debris.
- **Backstory:** Linn Harg was a Meridian-hired pirate-hunter who cleared the Io Reach of disabling raids. She died when a Reach swarm overwhelmed her after she'd hushed their lead ship; the swarm couldn't fire, so they rammed her. The Hushgun still holds a charge.
- **Hazard to reach:** dense-asteroid + nebula hazards, Reach swarm patrols, contested sector (Free Frontier and Reach both claim salvage).

### 7c. Reaver-Captain Mokk's "Slag-Spitter"
- **Class:** `battlefield`
- **Location:** `sector_pallas_drift` — at the Pirate Wreckage POI, in the nebula
- **Unique drop:** **"Slag-Spitter Plasma"** (`wpn_plasma_cannon_m` blueprint) — +40% splash radius (42), -20% dmg. An area-denial plasma.
- **Rumor leak:** `comms.js` intercept — Quiet smuggler traffic at the Smuggler Den references "Mokk's spitter" as a reason to give the nebula a wide berth.
- **Backstory:** Mokk was a Reach reaver who turned the Pallas nebula into a kill-zone with area-denial plasma. He died when a Quiet fence double-crossed him and lit up his position to Concord. The Slag-Spitter still cycles, hot.
- **Hazard to reach:** nebula fog, Quiet double-cross encounter (a fence ship leads you in then signals pirates), wreck is booby-trapped (proximity plasma if shot).

### 7d. Commander Tess Vorn's "Pinpoint"
- **Class:** `battlefield`
- **Location:** `sector_eris_margin` — at the Toll-Runner Wreck POI, in the Ashfall Approach ambush zone
- **Unique drop:** **"Pinpoint Targeting Computer"** (`mod_targeting_computer_m` blueprint) — +25% weapon-range, -15% dmg. A long-shot fire-control.
- **Rumor leak:** `careerContracts.js` — a Concord "border pacification" contract chain unlocks Tess Vorn's last bearing as a reward.
- **Backstory:** Tess Vorn was the Concord commander who held the Eris approach for two years against Reach toll-running. She died on a solo patrol when the Ashfall ambush camp caught her between gates. Her Pinpoint computer was the edge that let her hit at range; it's still calibrated to her eye.
- **Hazard to reach:** Reach ambush-lane (corsair/reaver/wasp, 3–5 ships, wedge), nebula fog, Quiet Fence rep-gate (wreck in Quiet-patrolled space).

### 7e. Wing-Leader Sera Kell's "Skysweep"
- **Class:** `battlefield`
- **Location:** `sector_kepler_scar` — at the Scarred Battlegroup POI, in the debris hazard
- **Unique drop:** **"Skysweep Flak Turret"** (`wpn_flak_turret_s` blueprint) — +60% intercept chance, wider arc (220°), -25% dmg. An anti-missile specialist.
- **Rumor leak:** `barkDirector.js` — Reach wasp-swarmers taunt "we lost a wing to the Skysweep" when engaged near the Scar, dropping the battlegroup's bearing.
- **Backstory:** Sera Kell led the Concord fighter wing that dueled Reach swarmers over the Scar. Her Skysweep turret killed forty missiles before a swarm overwhelmed her. The flak array still auto-tracks incoming ordnance, decades cold.
- **Hazard to reach:** Scar radiation + debris, Reach swarm patrols, and the flak array will shoot your missiles if you fire them near the wreck (passive hazard).

---

# SLOT 8 — BATTLEFIELD · Drift-vs-Reach mining war (named miner / escort captains)

> Mining + cargo + massline module variants (`mod_mining_beam_m` / `mod_massline_spool_m` /
> `mod_smuggler_hold` / `mod_survey_suite` / `mod_ram_plate`). The mining frontier's bloodiest fights.

### 8a. Mine-Captain Dru Velez's "Veincutter"
- **Class:** `battlefield`
- **Location:** `sector_charon_expanse` — at the Abandoned Mining Colony POI, in the radiation hazard
- **Unique drop:** **"Veincutter Mining Beam"** (`mod_mining_beam_m` blueprint) — +40% dps (42), +50% rare-ore chance on crystalline, +50% energy draw. A hot-cut miner.
- **Rumor leak:** `bar.js` rumor sub-menu — the Expanse Refinery quartermaster tells of Dru Velez, "the only miner who made the exotics pay," for a cut.
- **Backstory:** Dru Velez was the Drift mine-captain who proved the Charon exotics could be profitable. Reach killed her convoy for the ore; she scuttled the beam rather than let them have it. The Veincutter still cuts cleaner than anything modern.
- **Hazard to reach:** radiation field, dense asteroid, a Reach raider band that still hunts the colony ruins for the ore she hid.

### 8b. Escort-Captain Renn Tavor's "Longline"
- **Class:** `battlefield`
- **Location:** `sector_rhea_cinder` — at the Slag Hauler Hulk POI, in the Slag Glow radiation field
- **Unique drop:** **"Longline Massline Spool"** (`mod_massline_spool_m` blueprint) — +60% tether-spool capacity, -20% reel rate. A long tactical tether.
- **Rumor leak:** `newsTemplates.js` — a Drift-miners wire "The Tether That Held the Cinder" eulogizes Renn Tavor's last stand.
- **Backstory:** Renn Tavor was the Drift escort-captain who used a long massline to hold wounded ships in formation through the Cinder ambushes. She died holding a slag hauler in tow while the crew evacuated; the spool still pays out, stuck open.
- **Hazard to reach:** slag radiation, Reach ambush-lane on the Sker approach, stuck-open spool (the wreck trails massline cable — collision/entanglement hazard).

### 8c. Hauler-Captain Mira Souk's "Smuggler's Belly"
- **Class:** `battlefield`
- **Location:** `sector_nyx_march` — at the Cut-Runner Wreck POI, in the Hyperion Cut Lane ambush zone
- **Unique drop:** **"Smuggler's Belly Hold"** (`mod_smuggler_hold` blueprint) — +80% hidden-cargo (0.36), -50% open cargo. A deep false-bottom hold.
- **Rumor leak:** `comms.js` intercept — Quiet fence traffic overheard at the Nyx Fence references "Mira's belly" as the best hidden hold that ever ran the cut.
- **Backstory:** Mira Souk ran Quiet contraband through the cut-lane for years in a false-bottom hold of her own design. She died when a Concord scan finally caught the residue; her crew scuttled rather than be boarded. The Belly still hides what's inside it.
- **Hazard to reach:** Reach ambush-lane (corsair/reaver/wasp), Quiet rep-gate, Concord intermittent sweeps (the wreck is evidence — fines if caught with it).

### 8d. Survey-Captain Pell Okar's "Deepsurvey"
- **Class:** `battlefield`
- **Location:** `sector_haumea_rift` — at the Burned Survey Cache POI, in the dense-asteroid hazard
- **Unique drop:** **"Deepsurvey Suite"** (`mod_survey_suite` blueprint) — +50% scanner radius, +100% ping-persist, +50% energy draw. A deep-ping surveyor.
- **Rumor leak:** `bar.js` rumor sub-menu — the Rift Observatory elder tells of Pell Okar, "who charted more rift than anyone alive," for a favor.
- **Backstory:** Pell Okar was the Free Frontier survey-captain who mapped the Haumea fissures. She died when her deep-ping drew something out of the ice; her crew sealed the cache and ran. The Deepsurvey still pings, calling whatever answered.
- **Hazard to reach:** dense-asteroid + Ice Fissure anomaly, and the "something" the ping calls (a rare elite encounter on repeated pings).

### 8e. Breach-Captain Jor Vane's "Maul"
- **Class:** `battlefield`
- **Location:** `sector_eunomia_gulf` — at the Gulf Hulk POI, in the debris hazard
- **Unique drop:** **"Maul Ram Plate"** (`mod_ram_plate` blueprint) — +50% ram-damage dealt, -30% self-damage, +50% mass (worsens maneuverability). A heavy assault ram.
- **Rumor leak:** `missions.js` — a Vael Fence mission "The Breacher's Plate" offers the bearing for a Gulf salvage run.
- **Backstory:** Jor Vane was a Reach breacher-captain who rammed Drift haulers in the Gulf for their ore. He died when he rammed a hauler that was rigged to blow; the plate held, the hull didn't. The Maul is still wedged in the hauler it killed.
- **Hazard to reach:** Vael Fence rep-gate, debris collision, and the wreck is tangled with the hauler (you must cut free, not just tractor).

---

# SLOT 9 — BATTLEFIELD · Free Frontier insurrection / Meridian customs fights (countermeasure / utility variants)

> Countermeasure + utility variants (`mod_chaff_dispenser_m` / `mod_ecm_jammer_l` / `mod_cloak_mk1` /
> `mod_afterburner_m` family). The smuggler-vs-customs war's named casualties.

### 9a. Free-Captain Ana Tirr's "Smokesong"
- **Class:** `battlefield`
- **Location:** `sector_io_reach` — at the Mercenary Outpost POI (Quiet faction), in the nebula hazard
- **Unique drop:** **"Smokesong Chaff"** (`mod_chaff_dispenser_m` blueprint) — +60% radius, +50% divert chance, +100% cooldown. A heavy one-shot cloud.
- **Rumor leak:** `bar.js` rumor sub-menu — a Reach mercenary at the Outpost tells of Ana Tirr, "who walked through three missile locks on smoke alone," for a price.
- **Backstory:** Ana Tirr was a Free Frontier smuggler who ran Meridian customs with chaff and nerve. She died when a customs frigate seeded her cloud with tracer fléchettes; the Smokesong still deploys thicker than anything on the market.
- **Hazard to reach:** nebula fog, Meridian customs patrol (lawful faction — hostile if you're flagged smuggler), Quiet Outpost rep-gate.

### 9b. Customs-Captain Dren Halc's "Nullfield"
- **Class:** `battlefield`
- **Location:** `sector_dione_lane` — at the Lane Relay POI, near the Dione Customs station
- **Unique drop:** **"Nullfield ECM"** (`mod_ecm_jammer_l` blueprint) — +50% radius, full turn-rate kill (0.0), +50% cooldown. A wide-area jammer.
- **Rumor leak:** `newsTemplates.js` — a Meridian-wire piece "The Customs Net That Held Dione" references Halc's lost jammer.
- **Backstory:** Dren Halc was the Meridian customs-captain who made the Dione lane impassable to smugglers. He died when a Quiet convoy sacrificed a ship to overload his ECM; the Nullfield still cycles, jamming nothing.
- **Hazard to reach:** Dione Customs (Concord) patrol — the wreck is Concord property (restricted salvage, fines), and the active ECM pulses (your missiles/locks degrade near it).

### 9c. Smuggler-Captain Vex Roa's "Ghostline"
- **Class:** `battlefield`
- **Location:** `sector_pallas_drift` — at the Hidden Cache POI (Quiet faction), in the nebula
- **Unique drop:** **"Ghostline Cloak"** (`mod_cloak_mk1` blueprint) — -30% radius (224), +100% recharge time. A cheap deep-cloak.
- **Rumor leak:** `comms.js` intercept — Quiet fence traffic at the Smuggler Den references "Vex's ghostline" as the reason the nebula hides what it hides.
- **Backstory:** Vex Roa was a Quiet smuggler who ran the Pallas nebula on a deep-cloak of her own tuning. She died when the cloak's recharge lag caught her at the wrong moment; the Ghostline still drops her signal deeper than any stock cloak.
- **Hazard to reach:** nebula fog, Quiet smuggler patrol, Meridian customs intermittent sweeps.

### 9d. Insurgent-Captain Kel Mar's "Flarewind"
- **Class:** `battlefield`
- **Location:** `sector_tethys_junction` — at the Black Market Contact POI (hidden, Quiet), near the Customs Gate
- **Unique drop:** **"Flarewind Afterburner"** (`mod_afterburner_m` blueprint) — +60% boost speed, +50% duration, +100% cooldown. A long hot burn.
- **Rumor leak:** `bar.js` rumor sub-menu — a black-market contact at Tethys tells of Kel Mar, "who outran three Concord patrols on one burn," for Quiet rep.
- **Backstory:** Kel Mar was a Free Frontier insurgent who ran blockades against Meridian tolls. She died when her afterburner's heat bloom lit her up for a customs sniper; the Flarewind still burns hotter and longer than stock.
- **Hazard to reach:** Concord Customs Gate patrol (lawful — fines/aggro if you're flagged), wreck is near the gate (high traffic — witnesses).

### 9e. Privateer-Captain Doe Renn's "Mistglass"
- **Class:** `battlefield`
- **Location:** `sector_nereid_shoal` — at the Ice-Hull Wreck POI, in the dense-asteroid hazard
- **Unique drop:** **"Mistglass Chaff"** (`mod_chaff_dispenser_m` blueprint) — chaff cloud also reduces enemy radar range within it (-50%) for its duration, smaller radius. A radar-blind cloud.
- **Rumor leak:** `missions.js` — a Nereid Waystation mission "The Privateer's Last Cloud" offers the bearing for a recovery fee.
- **Backstory:** Doe Renn was a Free Frontier privateer who used radar-blinding chaff to vanish from Meridian pursuers. She died when an icy shard ruptured her chaff tank in the Shoal; the Mistglass still blooms when the wreck is disturbed.
- **Hazard to reach:** dense-asteroid field, Meridian patrol (the privateer was their enemy), chaff tank (ruptures on weapon fire — blinding you if you shoot the wreck).

---

# SLOT 10 — FRESH · Recently ambushed convoy freighters (commodity loot + minor module)

> Core-sector recent losses. The cargo is the prize; the module is a bonus. Race the scavengers.
> `poolLean: intact`. Story hooks via `newsTemplates.js` / `marketNews.js` tickers.

### 10a. Freighter ISC Long-Hope
- **Class:** `fresh`
- **Location:** `sector_tethys_junction` — near the Customs Gate, in the single asteroid field; recent loss (still glowing)
- **Unique drop:** 40 units `cmdty_munitions` (rare commodity lot) + **"Quickmend Nanobots"** (`mod_repair_nanobots_m` variant — +20% repair, single-use, refills at station). A field-repair stash.
- **Rumor leak:** `newsTemplates.js` / `marketNews.js` — a fresh LNN-style ticker "CONVOY AMBUSH AT TETHYS: Munitions Lost" gives the bearing in the report.
- **Backstory:** The Long-Hope was a Meridian munitions freighter hit by Reach raiders twenty cycles ago. Concord chased the raiders off but never recovered the cargo; the hold is still sealed and the munitions still live.
- **Hazard to reach:** live munitions (proximity explosion if shot), Concord Customs (the cargo is restricted — fines/seizure if you carry it through the gate), scavenger competition (an NPC scavenger ship races you to it).

### 10b. Ore-Hauler DMC Cinder-Lade
- **Class:** `fresh`
- **Location:** `sector_ceres_belt` — in the dense-asteroid hazard (radius 700, intensity 0.5), near the Abandoned Driller POI
- **Unique drop:** 60 units rare exotic ore + **"Cargocrane Tractor"** (`mod_tractor_beam_m` variant — +30% cargo-only magnet range, cheap). A freight-handling tractor.
- **Rumor leak:** `bar.js` rumor sub-menu — a Ceres Refinery dockhand tells of the Cinder-Lade, "still loaded, still hot," for a drink.
- **Backstory:** The Cinder-Lade was a Drift ore-hauler full of rare exotics when a reactor fault stranded it in the belt. The crew evacuated; the ore was never worth the salvage risk. The hold is still full and the reactor still ticks.
- **Hazard to reach:** dense-asteroid navigation, the reactor (radiation leak — shield bleed near the wreck), Drift claim dispute (the ore is contested property).

### 10c. Contraband Runner Quiet-Veil
- **Class:** `fresh`
- **Location:** `sector_vesta_forge` — in the radiation hazard (radius 600, intensity 0.4), near the Derelict Freighter POI
- **Unique drop:** 30 units contraband + **"Lantern Hold"** (`mod_cargo_pod_m` variant — +20% cargo, glows faintly on scan — easier to detect smuggling). A tainted cargo pod.
- **Rumor leak:** `comms.js` intercept — Quiet fence traffic overheard at the Forge Foundry references "the Veil's last run" and its cargo.
- **Backstory:** The Quiet-Veil was running contraband into Vesta when a Concord patrol cornered it. The captain dumped drive and dove into the radiation belt; the patrol didn't follow. The cargo is still there, and still very illegal.
- **Hazard to reach:** radiation field, Concord patrol (the cargo is contraband — heavy fines/seizure), Lantern Hold's scan-glow (you're easier to catch carrying it).

### 10d. Tech-Courier Meridian Spark
- **Class:** `fresh`
- **Location:** `sector_dione_lane` — at the Lane Relay POI, near the customs lane (recent wreck, debris still settling)
- **Unique drop:** 1 unit **"Lost Data Core"** (story-hook commodity — a data macguffin wanted by 3 factions) + **"Quickwire Scanner"** (`mod_cargo_scanner_s` variant — +30% scan range, -20% scan time). A tuned cargo scanner.
- **Rumor leak:** `missions.js` / `embodiedMissions.js` — three competing missions (Meridian, Concord, Quiet) each offer to buy the Data Core and reveal the bearing when accepted.
- **Backstory:** The Spark was a Meridian tech-courier carrying a faction-data core when something — nobody agrees what — tore it open on the Dione lane. The core is the story; whoever buys it learns something the others don't want known.
- **Hazard to reach:** three-faction interest (accepting one mission angers the other two — faction-rep consequences), high traffic (witnesses), core is trackable (rival agents ambush you on departure).

### 10e. Relief-Freighter Choir-Tender
- **Class:** `fresh`
- **Location:** `sector_helios_prime` — at the Outer Yard Derelict POI (tutorial sector), in the outer asteroid field
- **Unique drop:** 50 units medical supplies + **"Knitbots Swarm"** (`mod_repair_nanobots_m` variant — +10% repair, also slowly repairs docked escort drones). A tender's repair swarm.
- **Rumor leak:** `newsTemplates.js` — a Concord relief-wire piece "Tragedy at Helios: Relief Freighter Lost" gives the bearing near the tutorial sector.
- **Backstory:** The Choir-Tender was carrying medical relief to the Helios outer yard when a reactor fault — or sabotage — killed it in the home sector. It's the freshest wreck in the game and the closest to the spawn; a gentle first-salvage for new pilots.
- **Hazard to reach:** minimal (tutorial sector, no hostiles) — the only hazard is the reactor leak and a Concord investigation (the wreck is evidence; they'd prefer you report it, not loot it). A teaching wreck.

---

# SLOT 11 — FRESH · Lost courier ships (data / macguffin cargo + small unique utility)

> The cargo is a **story-hook commodity** (data macguffin with faction-specific payoffs). The module
> is a small tuned utility. Recent losses, mostly near core.

### 11a. Courier MTS Silver-Draft
- **Class:** `fresh`
- **Location:** `sector_helios_prime` — in the outer asteroid field (`f_helios_outer`), drifting; recent loss
- **Unique drop:** **"Lost Ledger"** (story-hook data — reveals a Meridian price-manipulation scheme; sellable to Concord or Quiet for different rewards) + **"Truesight Scanner"** (`mod_cargo_scanner_s` variant — +50% scan range). A sharp scanner.
- **Rumor leak:** `bar.js` rumor sub-menu — a nervous Meridian clerk at Helios Station sells the rumor cheap and asks you to "make it disappear."
- **Backstory:** The Silver-Draft carried a Meridian internal ledger that someone very much wants gone. The clerk who tipped you is one of them — or one of the people the ledger would expose. Either way, the wreck is fresh and the data is hot.
- **Hazard to reach:** Meridian faction interest (turning the ledger in to Concord tanks Meridian rep; selling to Quiet makes you a Quiet asset), a Meridian "cleaner" ship that arrives on a timer to sanitize the wreck.

### 11b. Comms-Courier Quiet-Wire
- **Class:** `fresh`
- **Location:** `sector_pallas_drift` — at the Hidden Cache POI (Quiet), in the nebula; recent loss
- **Unique drop:** **"Intercept Cache"** (story-hook data — a Quiet comms-intercept log naming three Concord officers on the Quiet take) + **"Eagle-Ear Scanner"** (`mod_market_data_s` variant — +30% market-intel refresh rate). A tuned market uplink.
- **Rumor leak:** `comms.js` intercept — a garbled Quiet transmission overheard at the Smuggler Den references "the wire that went dark" and its intercepts.
- **Backstory:** The Quiet-Wire carried comms intercepts that could burn three Concord officers secretly on the Quiet payroll. It died in the nebula when one of those officers arranged an "accident." The cache is leverage — for the right buyer.
- **Hazard to reach:** nebula fog, Quiet rep-gate (the cache is Quiet property — they'll buy it, but cheap), a Concord "internal affairs" encounter (an officer who wants the cache buried, by force).

### 11c. Survey-Courier Free-Far-Ear
- **Class:** `fresh`
- **Location:** `sector_veil_nebula` — near the Anomaly Signal POI, in the nebula; recent loss (the wormhole research run)
- **Unique drop:** **"Anomaly Survey"** (story-hook data — completes one Veil survey for any faction, unlocking `tech_long_range_survey` discount) + **"Long-View Array"** (`mod_sensor_array_l` variant — +40% radar, -20% energy). A tuned survey array.
- **Rumor leak:** `embodiedMissions.js` — a Research Station Veil mission "Recover the Far-Ear's Survey" sends you to the bearing.
- **Backstory:** The Far-Ear was a Free Frontier survey-courier carrying the only complete scan of the Veil anomaly. It died one jump from home when its drive failed in the nebula. The survey is the data the Veil researchers need to crack the wormhole.
- **Hazard to reach:** nebula immersion, anomaly-pulse radiation, Free Frontier rivals (the data is their career — they'll compete for it).

### 11d. Bounty-Courier SCN Iron-Receipt
- **Class:** `fresh`
- **Location:** `sector_sker_haven` — at the Bounty Wrecks POI, in the dense-asteroid field; recent loss
- **Unique drop:** **"Bounty Ledger"** (story-hook data — a Concord bounty ledger worth 80k credits at the Coalition HQ, or 40k from Reach to suppress) + **"Truesight FC"** (`mod_targeting_computer_m` variant — +20% range, +10% dmg). A tuned fire-control.
- **Rumor leak:** `newsTemplates.js` — a Concord-wire piece "Bounty Courier Lost in Sker Approach" gives a directional hint (not exact).
- **Backstory:** The Iron-Receipt carried a bounty ledger worth a fortune to whoever cashes it — Concord to collect, Reach to suppress. It died in the Sker approach to a Reach ambush; the ledger is still in the strongbox.
- **Hazard to reach:** dense-asteroid field, Reach bounty-hunter patrols (they want the ledger suppressed), Sker rep-gate.

### 11e. Heir-Courier Meridian Last-Will
- **Class:** `fresh`
- **Location:** `sector_vesta_forge` — near the Forge Foundry, in the radiation hazard; recent loss
- **Unique drop:** **"Sealed Will"** (story-hook data — a Meridian heir's inheritance claim; turns into a 60k credit payout or a unique-module favor at the Foundry) + **"Driftwind Afterburner"** (`mod_afterburner_m` variant — +30% boost, -20% cooldown). A tuned courier's burner.
- **Rumor leak:** `bar.js` rumor sub-menu — a Forge Foundry shipwright tells of the Last-Will courier, "carrying the inheritance that never arrived," for a favor.
- **Backstory:** The Last-Will carried a Meridian heir's sealed inheritance to the Forge. It died in the radiation belt one jump out; the heir has been contesting the estate ever since. The will is worth its face value in credits — or a favor the Foundry owes no one else.
- **Hazard to reach:** radiation field, Meridian legal entanglement (cashing the will draws a rival-claimant ambush), Foundry politics.

---

# SLOT 12 — FRESH · Disappeared VIP / scandal ships (story-hook cargo + fresh unique variant)

> The cargo is a **scandal-level data macguffin** with major faction-consequence payoffs. The module
> is a fresh-tuned variant. These are the highest-stakes fresh wrecks — each one is a one-salvage
> political lever.

### 12a. VIP-Yacht Concord-Aurelia
- **Class:** `fresh`
- **Location:** `sector_io_reach` — at the Derelict Cruiser POI, in the nebula; recent loss (scandal)
- **Unique drop:** **"Aurelia Logs"** (story-hook data — exposes a Concord admiral's Reach-collusion; sellable to Quiet for a unique-weapon contact or to Concord IA for a promotion-line favor) + **"Brightburn Afterburner"** (`mod_afterburner_m` variant — +40% boost speed, +20% heat). A VIP's tuned burner.
- **Rumor leak:** `comms.js` intercept — encrypted Concord traffic overheard with a Cargo Scanner near Io references "the Aurelia situation" and a bearing.
- **Backstory:** The Aurelia was a Concord admiral's private yacht — until the admiral's Reach dealings caught up with him. The yacht died in the Io nebula on the way to a Quiet meet; the logs are the scandal, and the scandal is leverage.
- **Hazard to reach:** nebula fog + dense-asteroid, Concord "damage control" encounter (a patrol sent to sanitize), three-faction interest in the logs.

### 12b. Diplomat-Yacht Choir-Cassandra
- **Class:** `fresh`
- **Location:** `sector_haumea_rift` — at the Ice Fissure Signal POI; recent loss (the secret peace mission)
- **Unique drop:** **"Cassandra Treaty"** (story-hook data — a draft Choir-Vael peace treaty; delivering it to the right faction unlocks a unique Choir/Vael rep path and a cloak variant) + **"Quietcloak"** (`mod_cloak_mk2` variant — -20% radius, -20% drain, +20% recharge — a diplomat's deep cloak).
- **Rumor leak:** `story/campaign47a/embodiedMissions.js` — a campaign thread reveals the Cassandra's peace mission and its bearing.
- **Backstory:** The Cassandra carried a Choir-Vael peace treaty that neither side's hardliners wanted. It died in the Haumea fissure when a Choir hardliner faction sabotaged its drive. The treaty is the only thing that can unlock the Vael rep path — and the cloak it carried is the only proof of who sabotaged it.
- **Hazard to reach:** Ice Fissure anomaly, Choir hardliner encounter (they want the treaty destroyed), Vael interest (they want to verify it).

### 12c. Whistleblower-Ship Free-True-Lantern
- **Class:** `fresh`
- **Location:** `sector_nereid_shoal` — at the Ice-Hull Wreck POI, in the dense-asteroid hazard; recent loss
- **Unique drop:** **"True-Lantern Files"** (story-hook data — a Free Frontier scientist's evidence that Meridian is suppressing anomaly research; unlocks a unique research contact + the Veil wormhole) + **"Lantern Hold"** (`mod_cargo_expander_l` variant — +25% cargo, +10% scan-resistance). A scientist's shielded hold.
- **Rumor leak:** `newsTemplates.js` — a Free Frontier underground-wire piece "The Lantern Went Dark" gives a directional hint.
- **Backstory:** The True-Lantern carried a scientist's evidence that Meridian was burying anomaly research to protect its toll-lane monopoly. It died in the Shoal when a Meridian "private security" contractor caught up with it. The files are the key to the Veil wormhole — and to Meridian's embarrassment.
- **Hazard to reach:** dense-asteroid field, Meridian "private security" encounter (they want the files destroyed), contested Shoal salvage.

### 12d. Defector-Ship Quiet-Hollow
- **Class:** `fresh`
- **Location:** `sector_tethys_junction` — at the Black Market Contact POI (hidden, Quiet), near the Customs Gate; recent loss (the defector)
- **Unique drop:** **"Quiet Roster"** (story-hook data — a Quiet fence defector's roster of operatives; sellable to Concord for a massive bounty + rep, or to Quiet's rivals for targeted raids) + **"Ghostline Cloak"** (`mod_cloak_mk2` variant — -30% radius, +30% recharge — a defector's escape cloak).
- **Rumor leak:** `bar.js` rumor sub-menu — a panicked Quiet defector at the Tethys Black Market Contact gives the bearing as proof of good faith before fleeing.
- **Backstory:** The Hollow carried a Quiet fence defector and his roster of operatives to a Concord meet. It died at the Customs Gate when a Quiet cleaner detonated a limpet; the defector is dead but the roster survived. It's the biggest Quiet leak in a decade.
- **Hazard to reach:** Concord Customs (high traffic — witnesses), Quiet cleaner encounter (a fast interceptor that arrives on a timer to recover/destroy the roster), three-faction bidding.

### 12e. Scandal-Ship Meridian Gold-Vow
- **Class:** `fresh`
- **Location:** `sector_ceres_belt` — in the dense-asteroid hazard, near the Survey Cache POI; recent loss
- **Unique drop:** **"Gold-Vow Books"** (story-hook data — a Meridian shell-company's cooked books; worth 50k to Concord regulators or a unique Drift rep-favor) + **"Pullwell Tractor"** (`mod_tractor_beam_m` variant — +40% magnet range, +20% reel speed — a salvage-specialist tractor).
- **Rumor leak:** `missions.js` — a Drift Miners Collective mission "The Books That Broke the Gold-Vow" offers the bearing as a Coalition-embarrassing favor.
- **Backstory:** The Gold-Vow was a Meridian shell-company ship carrying cooked books that proved a price-fixing scheme against the Drift miners. It died in the Ceres belt when a Meridian "salvage accident" was arranged; the books are the Drift's leverage — if anyone finds them before Meridian does.
- **Hazard to reach:** dense-asteroid navigation, Meridian "salvage" encounter (a Meridian-hired clean-up crew), Ceres traffic (the wreck is in a busy sector).

---

## Coverage summary

- **60 candidates** across **12 slots** (5 each), one `wreckClass` family per slot-group (1–3 military,
  4–6 ancient, 7–9 battlefield, 10–12 fresh).
- **Sectors used (23 of 24):** helios_prime, ceres_belt, tethys_junction, vesta_forge, pallas_drift,
  io_reach, charon_expanse, sker_haven, veil_nebula, ashfall_reach (core story) + nyx_march,
  hyperion_cut, kepler_scar, orcus_shadow (west) + rhea_cinder, haumea_rift, eris_margin,
  phoebe_echo (north) + nereid_shoal, proteus_well, triton_wake (east) + eunomia_gulf, sedna_dark,
  dione_lane (south). (`sector_hyperion_cut` appears only as a neighbor/zone reference, not a wreck
  site — a deliberate spare for future expansion.)
- **Loot families:** every unique drop is a named variant/blueprint of an existing id from
  `weapons.js` (12 weapon families) or `modules.js` (shield / engine / cargo / mining / utility
  families). No new item system invented.
- **Rumor systems:** every leak cites a verified system — `bar.js`, `newsTemplates.js` /
  `marketNews.js`, `comms.js` (+`encounterDirector.js`), `barkDirector.js`, `missions.js` /
  `embodiedMissions.js` / `careerContracts.js`, or `story/campaign47a/*`. Several also hook the
  `lossLedger.js` / `lossInvestigation.js` provenance path.
- **5 candidates per slot are genuinely distinct:** different ship name, different captain, different
  unique drop, different sector, different rumor channel, different hazard.
