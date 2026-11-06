<!-- LIFETIME: ACTIVE_PROGRAM -->
# SHIPS — the fifteen hulls you can fly

Every hull exists in `src/data/ships.js` [EXISTS]. This file gives each one an **identity**: the
fantasy it serves (DIRECTION §2), how it looks from above, how it handles, its one signature verb, its
sockets (KIT K2), the kit and liveries that suit it, where you get it, and who flies it in the world.
A hull is done when R1 and R5 (QUALITY.md) are ≥ 4 and its signature verb has a capture.

**Silhouette rule:** from the top-down camera, each hull must be recognisable by outline alone, at the
size it appears in play. A lineup screenshot of all fifteen with lighting off must still let a
reviewer name each one.

**Naming:** the data id `ship_kestrel` displays as **Hitch** in New Game; the tutorial once called it
"Kestrel" (report card tell). One name everywhere: **Hitch**.

---

## Skaters — small, fast, rope-first

### Hitch (`ship_kestrel`) — the starter scout [EXISTS]
- **Fantasy:** Skater. The ship you learn the Line in. Cheeky, light, fun.
- **Silhouette:** a short arrowhead with a long spine and a rope reel at the nose; big engine bell for its size.
- **Handling:** Skater class (VERBS §1). Slides when you let go; snaps around anchors.
- **Signature verb:** the swing — best swing radius-to-speed ratio in the game.
- **Sockets:** weapon S fixed ×1, utility S ×1, drive S, line.head, kit.top small.
- **Kit:** racing fins, a second reel, scrap bumpers. **Liveries:** civilian bright, courier stripes.
- **Get it:** start. **NPCs:** couriers, young pilots, racers.

### Ranger (`ship_ranger`) — explorer [EXISTS]
- **Fantasy:** Skater with legs: long-range, survey, scanning.
- **Silhouette:** long thin hull with a scanner dish and swept sensor wings.
- **Handling:** Skater, slightly heavier; best fuel range.
- **Signature verb:** the long Line (≈ +40% range) — rope across gaps no one else can.
- **Sockets:** weapon S ×1, utility M ×2 (scanners), drive M, line.head.
- **Get it:** mid-game reward from discovery work. **NPCs:** surveyors, prospectors.

### Saucer (`ship_saucer`) — exotic [EXISTS]
- **Fantasy:** Conjurer-Skater oddball: the flying saucer.
- **Silhouette:** a disc with a ring of lights — unmistakable.
- **Handling:** omnidirectional thrust (strafes as fast as it moves forward); spins.
- **Signature verb:** gravity lift — the saucer can hold a body under it like a tractor beam and carry it without a rope.
- **Get it:** a secret (discovery chain or a Swarm milestone). **NPCs:** the rare unexplained sighting.

## Mid — fighters and multiroles

### Wasp (`ship_wasp`) — fighter [EXISTS]
- **Fantasy:** Conjurer-lite gunfighter; starter alternative.
- **Silhouette:** a stubby wasp body with twin gun pods and a sting tail.
- **Handling:** Mid. Tight turns, good brake.
- **Signature verb:** twin guns — the best starter gun platform.
- **Sockets:** weapon M ×2 fixed, shield S, drive M, utility S, line.head.
- **Get it:** New Game choice / early research. **NPCs:** militia, pirate rookies.

### Hornet (`ship_hornet`) — interceptor [EXISTS]
- **Fantasy:** Conjurer. The Swarm default (Ricochet Runner build).
- **Silhouette:** a sharp delta with forward-swept guns and a turret blister.
- **Handling:** Mid, fastest of the mids.
- **Signature verb:** the turret — the only mid with a tracking mount; shoots while you Line.
- **Sockets:** weapon M fixed ×2, weapon M turret ×1, shield M, drive L, utility S ×2, thruster M.
- **Get it:** strike-craft research. **NPCs:** police interceptors (blue/white livery), elite pirates (red).

### Drifter (`ship_drifter`) — multirole [EXISTS]
- **Fantasy:** the do-everything ship; Conjurer leaning.
- **Silhouette:** a chunky wedge with a cargo spine and two power pylons.
- **Handling:** Mid, balanced.
- **Signature verb:** power capacity — runs two powers back-to-back without starving.
- **Get it:** mid-game purchase. **NPCs:** freelancers, mercenaries.

### Warden (`ship_warden`) — gunship [EXISTS]
- **Fantasy:** Conjurer-Juggernaut hybrid: a flying turret platform.
- **Silhouette:** a broad hexagonal hull bristling with turret blisters.
- **Handling:** Hauler class; slow but rotates turrets independently.
- **Signature verb:** broadside — turrets fire on targets on both sides while you fly straight.
- **Get it:** late mid-game. **NPCs:** police gunships (heat 4), faction escorts.

## Haulers and workers — weight with a job

### Pelican (`ship_pelican`) — miner / tug-lite [EXISTS]
- **Fantasy:** Juggernaut-lite worker; starter alternative.
- **Silhouette:** a wide body with a scoop mouth and a mining laser boom.
- **Handling:** Hauler.
- **Signature verb:** the scoop — sucks in ore and small debris on contact.
- **Get it:** New Game choice. **NPCs:** miners (Drift Miners Collective dust-yellow).

### Mule (`ship_mule`) — freighter [EXISTS]
- **Fantasy:** the everyday hauler; a target and a battering ram.
- **Silhouette:** a long box with visible container racks; loaded Mules sit lower and carry visible containers (KIT, CH-64).
- **Handling:** Hauler; heavier when loaded.
- **Signature verb:** cargo train — tows a string of containers behind it (CH-32).
- **Get it:** early purchase. **NPCs:** the most common traffic; Meridian Trade Syndicate liveries.

### Hawser (`ship_hawser`) — tug [EXISTS]
- **Fantasy:** Juggernaut worker; the tow truck.
- **Silhouette:** all engine and clamp — a short body with a huge thruster cluster and grapple arms.
- **Handling:** Hauler accelerating like a Mid; brutal pulling power.
- **Signature verb:** the heavy tow — the only non-capital that can tow a capital-class body (and a station module).
- **Get it:** mid-game; repo and salvage jobs reward it. **NPCs:** station tugs, wreck clearers (CH-05).

### Ironback (`ship_ironback`) — mining barge [EXISTS]
- **Fantasy:** first true Juggernaut.
- **Silhouette:** a slab with a reinforced prow and cutter heads.
- **Handling:** Juggernaut (light end).
- **Signature verb:** the plow — the prow turns rams into cuts: rocks split, light ships crumple (CH-01).
- **Get it:** mid-game purchase or hijack at the Big Dig. **NPCs:** Big Dig crews.

### Atlas (`ship_atlas`) — heavy hauler [EXISTS]
- **Fantasy:** Juggernaut cargo king.
- **Silhouette:** a long spine carrying stacked containers; a bridge tower at the stern.
- **Handling:** Juggernaut.
- **Signature verb:** the shoulder — side-swipes push smaller ships out of lanes without losing speed.
- **Get it:** late purchase; heist target on the Throughline. **NPCs:** convoys.

## Capitals — the end of the Juggernaut ladder

### Bastion (`ship_bastion`) — corvette [EXISTS]
- **Fantasy:** the first warship you own.
- **Silhouette:** a compact armoured wedge with a dorsal turret.
- **Handling:** Juggernaut (agile end).
- **Signature verb:** armour that sheds — plates absorb hits and fall off as debris you can see (KIT K6).
- **Get it:** late game. **NPCs:** navy patrol leaders.

### Colossus (`ship_colossus`) — battlecruiser [EXISTS]
- **Fantasy:** the tank. You barrel through everything.
- **Silhouette:** a massive hammerhead prow, long hull, engine wall at the stern.
- **Handling:** Juggernaut heavy. Barely slows on impact.
- **Signature verb:** the ram prow — rams are its main weapon; lights die on contact, mediums tumble (M5, M6).
- **Get it:** endgame purchase, or steal one (a story heist). **NPCs:** navy at heat 5.

### Leviathan (`ship_leviathan`) — flagship [EXISTS]
- **Fantasy:** a moving station. The final Juggernaut.
- **Silhouette:** enormous; turrets, hangar mouths, a city of lights.
- **Handling:** the heaviest; needs the chase camera to drive well.
- **Signature verb:** launch wing — releases drone fighters (exists: drone wing call-in) and tows anything.
- **Get it:** the endgame. **NPCs:** faction flagships at Hotspots and story beats (hero asset).

## Build identity on the ship sheet (SHIP lane P1)

| Stat (1–10) | Skater typical | Mid typical | Hauler typical | Juggernaut typical |
|---|---|---|---|---|
| Firepower | 2–4 | 5–7 | 2–4 | 4–8 |
| Toughness | 2–3 | 4–6 | 5–7 | 8–10 |
| Speed | 8–10 | 6–8 | 3–5 | 2–4 |
| Handling | 8–10 | 6–8 | 3–5 | 1–3 |
| Power | 4–6 | 5–8 | 3–5 | 5–7 |
| Muscle | 3–5 | 3–5 | 6–8 | 9–10 |

Fits move these by 1–3 points. The ship sheet labels the build with its fantasy (Skater / Juggernaut /
Conjurer) from the stat shape.

## Done checklist for the fleet

- [ ] Lineup screenshot: all fifteen identifiable by outline (R5 ≥ 4).
- [ ] Each hull's signature verb captured in play.
- [ ] Handling targets met within ±15% and each class *feels* like its "feels like" line (R1 ≥ 4).
- [ ] Every hull declares the KIT socket vocabulary for every slot it offers.
- [ ] Every hull has ≥ 3 liveries and ≥ 4 wear levels (KIT K5).
- [ ] One name per hull everywhere.
