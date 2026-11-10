<!-- LIFETIME: ACTIVE_PROGRAM -->
# HOTSPOTS — sixteen loud, working places

The open world's play happens here (DIRECTION §5, §7). Each dossier gives the builder everything:
**mood · layout from the arrival vantage · the job and its routine · the crowd · the hazard · the hero
asset (KIT K7 parts list) · activities · chaos chains · breakables · light and sound · moments.**

**Hotspot done (all of these):**
- [ ] An agent arriving cold has ≥ 3 MOMENTS there within 5 minutes, captured (R11 ≥ 4).
- [ ] One gameplay-zoom screenshot says what the place does and who runs it, no labels (R4 ≥ 4).
- [ ] Life count ≥ 4 NPC-caused events per 10 s within 1 screen of it.
- [ ] Every activity listed is playable from the map; every breakable breaks with a consequence.
- [ ] Every chaos chain listed has been seen happening at least once, unscripted.
- [ ] It sounds like itself (a 30 s audio capture judged R9 ≥ 4).
- [ ] Damage and changes persist across save/continue (CHAOS CH-65).

**Scale:** a Hotspot fills ≈ 2–4 screens at the default camera; its hero asset is visible from ≈ 6
screens away as a landmark (light, silhouette). **Routine:** every Hotspot runs a loop of 3–6 minutes
so a returning player sees it in a different phase.

**Builds on:** where an existing zone matches, build on it (`src/data/authoredPlaces.js`).

---

## Helios Prime (build these first, to the full bar)

### 1. The Big Dig [NEW]
- **Mood:** a city-sized mining rig eating an asteroid; industrial thunder; the money of the system.
- **Layout:** a giant asteroid (≈ 3 screens) half-carved; the rig clamped to it with four cutter
  arms; an ore conveyor arm reaching out to a loading cradle; a hauler queue in a lane to the cradle;
  slag and debris drift on the far side.
- **Job and routine (≈ 4 min loop):** cutters spin up (30 s) → cut (90 s, rock chunks break off and
  get scooped) → ore pods ride the conveyor (60 s) → haulers load and depart one by one → cutters
  reposition (30 s).
- **Crowd:** 4–6 Pelican miners (Drift Miners Collective, dust-yellow, cautious), 3–5 Mule haulers in
  queue (MTS, loaded ones sit low), 2 Hawser tugs clearing debris, 1 patrol cutter overhead (bored),
  1–2 pirate scouts lurking at the edge (Crimson Reach).
- **Hazard:** the cutter arms — spinning heads that shred anything they touch, including you; their
  spin-up whine is the tell.
- **Hero asset parts (KIT K7):** rig core, 4 cutter arms (each breakable), conveyor arm (breakable
  joints), loading cradle, control tower with lights, ore pods (physical), floodlight rigs.
- **Activities:** rob the queue (heist); race the conveyor (time trial along it); sabotage a cutter
  arm for a rival (it breaks loose and swings); defend the rig from a pirate raid (Swarm-style siege —
  the bridge between modes); salvage the slag field.
- **Chaos chains:** (a) shove a loaded hauler into the conveyor → pods spill → miners and pirates
  scramble (M10); (b) break a cutter arm's joint → it swings into the queue → pile-up (M6); (c) lure
  the lurking pirates into the cutter path (M24-style trap in Adventure).
- **Breakables:** cutter arms, conveyor joints, floodlight rigs, cradle clamps, ore pods (volatile? no —
  heavy and valuable).
- **Light and sound:** sodium-yellow floodlights in the dark, sparks at the cut face; a deep grinding
  drone, conveyor clank, cutter whine.
- **Moments:** M2, M5, M6, M10, M17, M21.

### 2. Helios Station rush hour [EXTEND — the main station]
- **Mood:** the busiest place in the system; traffic control yelling; police everywhere.
- **Layout:** the station with layered docking arms; inbound and outbound lanes marked by beacon
  rows; a customs checkpoint pocket; a taxi rank; a waiting area where ships hold.
- **Job and routine (≈ 3 min loop):** rush (lanes full, queue of 6–8) → customs inspections (a
  cutter pulls a random ship aside) → lull → shift change (lights change colour, a maintenance drone
  swarm comes out).
- **Crowd:** civilian shuttles (panicky, cocky, drunk personalities), taxis, Mule haulers, 2–3 police
  cutters, customs cutter, station tugs, maintenance drones.
- **Hazard:** traffic itself; the station's turrets at heat ≥ 2.
- **Hero asset parts:** docking arms (breakable), traffic-control tower with signal lights, beacon
  rows, customs pocket with a scanner gate, taxi rank pylons, PA horn arrays.
- **Activities:** taxi runs (the passenger reacts to your flying); smuggling past the scanner gate;
  customs dodging; a stunt — thread the docking arms at speed (M20).
- **Chaos chains:** (a) clip a shuttle → road rage (M8); (b) ram the queue → bowling strike → panic →
  station lockdown (M6, M9, CH-18); (c) a customs cutter pulls *you* aside — run, and it becomes a
  chase (M13).
- **Breakables:** docking arms (traffic jams for minutes), beacon rows, scanner gate, signal lights.
- **Light and sound:** a warm station glow with cyan docking strobes; constant radio chatter (≤ 8-word
  lines), horns, PA announcements that react to events.
- **Moments:** M6, M8, M9, M12, M13, M16, M18.

### 3. The Ring Circuit [NEW]
- **Mood:** an amateur race league in an old broken ring structure; spectators, bets, show-offs.
- **Layout:** a ring ≈ 3 screens across with gaps in its structure; lit gates around it; spectator
  ships parked in a cluster; a scoreboard hologram; a pit lane.
- **Job and routine (≈ 5 min loop):** warm-up laps → race (6 racers, 3 laps) → podium (fireworks of
  flares) → betting window.
- **Crowd:** 6 racers (cocky personalities, bright liveries, fins), 10–15 spectators, a race marshal
  ship, a medical tug.
- **Hazard:** the ring's broken structure (tight gaps), other racers, debris from crashes.
- **Hero asset parts:** ring segments (some broken), lit gates, scoreboard, spectator stands (a lashed
  structure), flare launchers.
- **Activities:** race (enter at the marshal), bet, sabotage a racer for a contract, crash the finale.
- **Chaos chains:** (a) a racer crashes into the stands → spectators scatter (M9); (b) you shortcut
  through a gap → rivals copy and crash (M20); (c) shoot the scoreboard → riot of horns.
- **Breakables:** gates, scoreboard, stand lashings.
- **Light and sound:** coloured gate lights, flares, a crowd of horns, an announcer voice.
- **Moments:** M1, M20, M9, M17.

## Ceres Belt

### 4. The Shipbreaker [EXTEND — `zone_ceres_closed_refinery` area / Ceres shipbreak data]
- **Mood:** a yard tearing apart a capital ship; sparks, cranes, salvage frenzy. **One-time hero asset.**
- **Layout:** a dead capital ship (≈ 2 screens long) in a cradle of gantries; cutter drones work its
  hull; tugs drag away sections; a salvage depot station.
- **Job and routine:** cut a section (2 min) → section comes loose → tugs tow it to the depot → repeat;
  over **days of game time the capital shrinks** — the place changes permanently.
- **Crowd:** cutter drones, 3 Hawser tugs, 2 salvage barges, yard security, scavengers at the edge.
- **Hazard:** loose sections drifting; cutter beams.
- **Hero asset parts:** the capital hulk (sectioned so pieces really come off), gantries, cutter drones,
  cradle clamps, salvage depot.
- **Activities:** steal parts as they come loose (race the tugs); salvage rush; tow contracts; the
  heist — steal the capital's reactor core.
- **Chaos chains:** (a) cut a clamp → a section drifts into the depot (M16); (b) hijack a tug mid-tow
  (M15); (c) scavengers vs security over a loose section (M10, M11).
- **Moments:** M2, M10, M15, M16, M21.

### 5. The Throughline [EXTEND — `zone_ceres_throughline`]
- **Mood:** the belt's freight highway; a river of convoys both ways.
- **Layout:** two lanes marked by gantry beacons through the belt; a toll station; side pockets where
  pirates wait.
- **Routine:** convoys every ≈ 40 s each way; toll checks; a police patrol sweeps every few minutes.
- **Crowd:** convoys (Atlas heavies with container trains — CH-32, Mule escorts), toll officers,
  pirates, highway police.
- **Hazard:** traffic at speed; container trains swinging on turns.
- **Hero asset parts:** gantry beacons, toll station with barrier fields, container trains.
- **Activities:** convoy heist (cut a container train), escort a convoy, toll evasion (smash the
  barrier), highway chases.
- **Chaos chains:** (a) cut a train line → containers spill across the lane → pile-up both ways; (b)
  smash the toll barrier → toll officers chase (M13); (c) pirates hit a convoy as you pass (CH-42).
- **Moments:** M2, M5, M10, M13, M20.

## Tethys Junction

### 6. Junction Market [NEW]
- **Mood:** a free market of ships lashed together; haggling, smuggling, brawls.
- **Layout:** 20–30 ships cabled into a raft; a central bazaar module; a fence's hidden dock.
- **Routine:** trading hours (busy) / night market (smugglers) / a brawl every few minutes that spills.
- **Crowd:** traders, smugglers, a fence, bouncers, drunks, a Choir preacher ship.
- **Hazard:** the lashings — cut one and part of the raft drifts away with whoever is on it.
- **Activities:** fence stolen goods, smuggling contracts, bar brawl spill-over, cut the lashings.
- **Chaos chains:** a brawl knocks a ship loose → it drifts into the lane → road rage.
- **Moments:** M8, M9, M18.

### 7. The Split Station [EXTEND — `zone_tethys_split_station`]
- **Mood:** a station torn in half years ago, now gang turf (Pitborn).
- **Layout:** two halves with a river of debris between; gang checkpoints; a vault in the debris.
- **Routine:** gang patrols; a rival gang (Crimson Reach) probes every few minutes → skirmish.
- **Activities:** gang war (start it — M11), rescue hostages, heist the vault, pay the toll.
- **Hero asset:** the two halves with exposed decks.
- **Moments:** M11, M21, M22.

## Vesta Forge

### 8. The Forge [EXTEND — Vesta forge data]
- **Mood:** a foundry station pouring molten metal; heat, sparks, crane arms.
- **Layout:** a ladle station tipping slag into cooling molds; crane arms move ingots; heat lanes glow.
- **Routine:** pour (60 s, slag river live) → cool → cranes move ingots → repeat.
- **Hazard:** heat lanes and the pour itself.
- **Activities:** demolition contract, heat-lane race, throw pirates into the pour.
- **Breakables:** crane arms, ladle (a spilled pour lasts minutes).
- **Moments:** M5, M24 (Adventure trap), M17.

### 9. Red Cable Yard [EXTEND — `zone_vesta_red_cable_yard`]
- **Mood:** a cable-laying operation stringing giant cables between rocks.
- **Layout:** rocks linked by taut red cables; a cable-laying ship; crews on tethers.
- **Hazard:** the cables — snap one and it whips across the yard.
- **Activities:** Line playground (swing on the cables), sabotage, rescue a snapped crew.
- **Moments:** M1, M2, M19.

## Pallas Drift

### 10. The Drift Derby [NEW]
- **Mood:** a demolition derby league in a bowl of bouncy reef debris (Reef Pinball physics).
- **Layout:** a bowl of high-bounce debris; stands; a pit; a scoreboard.
- **Routine:** derby rounds every few minutes; Juggernaut-class ships slam each other.
- **Activities:** enter the derby (last ship moving wins), bet, sponsor a driver.
- **This is the Juggernaut showcase** — R1 and R2 at their best.
- **Moments:** M5, M6, M17.

## Io Reach

### 11. The Shepherd's Ring [EXTEND — `zone_io_shepherds_ring`]
- **Mood:** tugs herding a stampede of rocks into orbit like cattle.
- **Layout:** a herd of rocks moving along an arc; tugs at the flanks; a corral station.
- **Hazard:** the herd itself.
- **Activities:** herd (a tow job), stampede the herd into a pirate camp, rock race.
- **Moments:** M2, M24, M18.

## Charon Expanse

### 12. The Hull Garden [EXTEND — `zone_charon_hull_garden`]
- **Mood:** scavenger families harvesting a field of old wrecks, lit by living lights.
- **Layout:** a wreck field with lights strung between hulks; family camps.
- **Activities:** salvage rush, bounty hunts in the wrecks, wreck-diving for loot.
- **Moments:** M10, M22.

## Sker Haven

### 13. The Pirate Citadel [NEW, near `zone_sker_quiet_dock`]
- **Mood:** a fortified pirate base in an asteroid; music, lights, menace.
- **Layout:** the citadel gate with guns; a hangar mouth; prisoner cages; a market inside.
- **Activities:** infiltrate (quiet), siege (loud, Swarm-style), join them (reputation), free prisoners.
- **Moments:** M11, M19, M21.

## Veil Nebula

### 14. The Lighthouse [NEW]
- **Mood:** a beacon station guiding ships through a nebula storm.
- **Layout:** the beacon tower; a storm wall; ships queuing to cross.
- **Activities:** storm runs, rescue ships lost in the storm, turn off the light (chaos — ships crash
  in the storm).
- **Moments:** M17, M19.

## Ashfall Reach

### 15. The Towed Moonlet [EXTEND — `zone_ashfall_towed_moonlet`] (one-time event)
- **Mood:** a convoy towing an entire moonlet across the system.
- **Layout:** the moonlet with tow lines to an armada of tugs; escorts.
- **Activities:** cut a tow line and watch the moonlet drift into a station (permanent change);
  defend the tow; hijack a tug.
- **Moments:** M15, M16, M17.

### 16. The Gladiator Pit [NEW]
- **Mood:** a Swarm arena inside the Adventure world; crowds watch.
- **Layout:** the pit (an arena from ARENAS.md); stands; a betting window.
- **Activities:** enter Swarm from Adventure (winnings carry over as credits); bet on others.
- **Moments:** M23–M28 inside the open world.
