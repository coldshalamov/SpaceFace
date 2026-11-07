<!-- LIFETIME: ACTIVE_PROGRAM -->
# ARENAS — the seven Swarm arenas and the wave-recipe book

Swarm is played in seven arenas (the Crucible menu list) [EXISTS — reconcile with
`src/data/survivalArenas.js`, `swarmArenaLadder.js`, `swarmOpticArenas.js`,
`swarmOpeningTerrain.js`]. The cull rooms (Pebble Yard, Slag Bowl, Container Graveyard, Reef
Pinball, Ice Orchard, Glass Garden, Garden Ring, Breaker Field, The Gutted Maw) are a separate ladder
whose mechanics are reused below.

Every arena has: **an identity** (one screenshot says which arena), **a signature hazard** (friend and
foe), **gates and lanes** (where the horde comes from), **depots** (SWARM S17), **a wave-10 and a
wave-15 transformation** (SWARM S19), **a light and sound signature**, and **its menu picture taken
from the real round**.

**Arena done:** identifiable from one screenshot (R4 ≥ 4); the hazard kills thrown enemies and a
careless player, with a ≥ 1 s telegraph; both transformations captured; menu image = real round; a
fresh agent plays waves 1–10 and has ≥ 5 Swarm moments (MOMENTS M23–M28 + M1–M7).

**Size rule:** an arena is about 3 × 3 screens at the Swarm camera — big enough to run, small enough
that the hazard and the depots are always within reach. A visible edge (machinery walls, a glowing
field fence) — never an invisible wall.

---

## 1. Ricochet Foundry (`helios_core`) — the starter arena

- **Identity:** an enclosed industrial foundry floor in red-orange work light; steel bank plates
  ring the arena; conveyor rails cross it; sparks drift down. **Not open space** — hide the Helios
  ringed-planet backdrop here.
- **Signature hazard:** **the bank plates** — angled steel slabs that ricochet shots and bodies
  (Bank Stream / bank shot synergy), plus **the crusher** (dormant until wave 10).
- **Gates:** four freight doors on the walls (N, E, S, W); doors flash amber and klaxon 1 s before a
  group comes through.
- **Depots:** *Weapons rack* (NE corner, between two plates), *Repair bay* (S, under the conveyor),
  *Power cache* (W, exposed).
- **Wave 10 — the crusher wakes:** a hydraulic crusher in the middle cycles (open 3 s → warning
  1 s → slam). Anything under it dies. The conveyor starts moving and carries bodies toward it.
- **Wave 15 — meltdown:** a crucible tips and pours a slag river across the floor (heat lane: burns
  ships crossing it; Brood die in it), splitting the arena.
- **Light:** warm key light from above-right, cool cyan fill from the doors, sparks as emissive points.
- **Sound:** machine hum, distant hammering; crusher hiss-slam.

## 2. Lagrange Crucible — the open-space arena

- **Identity:** an open field between two moons at a Lagrange point; debris rings drift slowly;
  the two moons light the scene from two sides (warm and cold).
- **Signature hazard:** **drifting debris rings** — slow rivers of rock you can throw, hide behind
  or get crushed between.
- **Gates:** debris lanes themselves: enemies arrive riding the rings from two sides.
- **Depots:** on two anchored rocks that drift on a loop — the depot moves (timing!).
- **Wave 10:** the rings speed up and tighten — the arena gets smaller and more dangerous.
- **Wave 15:** a moon shard calves off and crosses the arena slowly (a moving wall).
- **Light:** two-sided moonlight; rocks rim-lit on both edges (readability).

## 3. Cinder Sluice — the heat arena

- **Identity:** a channel of molten slag flowing between basalt banks; orange glow from below.
- **Signature hazard:** **heat lanes** (Slag Bowl mechanic) — crossing one burns; shoving enemies in
  kills them; ships on fire panic.
- **Gates:** upstream and downstream ends of the channel; enemies come with the flow.
- **Depots:** on three basalt islands — reaching one means crossing a lane.
- **Wave 10:** the sluice gates open — the flow speeds up and floods a second channel.
- **Wave 15:** eruption — slag bergs (Slag Bowl's bodies) break off and float as burning throwables.
- **Light:** warm under-light from the slag; silhouettes against the glow (readability bonus).

## 4. Cryo Drift — the ice arena

- **Identity:** a field of ice spires and frozen ship hulks under pale blue light.
- **Signature hazard:** **shard ricochet** (Ice Orchard) — spires shatter into shards that fly as free
  fragments and shred whatever they hit.
- **Gates:** ice caves at three points.
- **Depots:** inside two frozen hulks (enter through a crack).
- **Wave 10:** the freeze cracks — the floor becomes drifting ice floes; slow-moving cover.
- **Wave 15:** a frozen capital ship thaws and starts to break up, shedding hull chunks.
- **Light:** cold, high-key; ice emissive edges; the horde's warm hues pop against it.

## 5. Storm Lattice — the lightning arena

- **Identity:** a lattice of conductor pylons in a charged nebula; lightning arcs between pylons.
- **Signature hazard:** **arcs** (Glass Garden resonance chains) — lightning jumps between pylons on a
  readable rhythm; bodies in an arc's path take damage and the arc chains through metal bodies.
- **Gates:** storm fronts: enemies emerge from cloud banks on two sides.
- **Depots:** on two insulated platforms.
- **Wave 10:** the storm surges — arcs come faster and you can redirect them by throwing metal bodies
  into a gap (a conductor you place).
- **Wave 15:** a pylon falls; the lattice rearranges.
- **Light:** violet-blue nebula, white arc flashes (capped at the flash rule — big in the world, small on screen).

## 6. Asteroid Mill — the machinery arena

- **Identity:** a giant ore mill: grinder drums, conveyor belts, a crushing yard (Breaker Field).
- **Signature hazard:** **the grinders** — rotating drums that pull in anything nearby (cut
  ammunition: what goes in comes out as chunks you can use).
- **Gates:** ore chutes from above; enemies drop in with the ore.
- **Depots:** on the control gantry (high, exposed) and the loading dock (low, crowded).
- **Wave 10:** the main grinder spins up and the belts reverse — bodies flow toward the drum.
- **Wave 15:** the drum breaks loose and rolls across the arena (a moving boss-hazard).
- **Light:** sodium-yellow work lights; dust in the beams.

## 7. The Hive — the Brood arena

- **Identity:** the inside of a Brood nest grown over a dead station; organic walls, glowing sacs.
- **Signature hazard:** **spawn sacs** (Hive reserve [EXISTS]) — sacs hold back part of each wave and
  birth it on a cadence; popping a sac early strands its share.
- **Gates:** the sacs themselves plus two tunnels.
- **Depots:** in the dead station's surviving rooms (metal islands in the organic).
- **Wave 10:** the walls breathe — the arena contracts and expands on a slow rhythm.
- **Wave 15:** the Brood Mother wakes (BESTIARY bosses).
- **Light:** bioluminescent pinks and acid greens on near-black — the one arena where dark is the
  point, so the Brood palette must glow brightly.

---

## The wave-recipe book (SWARM S18)

A wave = **mix × terrain event × modifier**, with a name that's the round title. Recipes are drawn
by the arena ladder with variety rules (no back-to-back repeats; a new recipe every 3 waves; a
special every ~4–5). Mixes use the roster clock (BESTIARY Part 1 debut waves).

| Recipe | Mix | Terrain event | Modifier | What it teaches / why it's fun |
|---|---|---|---|---|
| **The Pack** | Wasps + Mites | none | — | mowing; the opener |
| **Leader Down** | 2 Reavers + Wasps | none | Wasps panic when their Reaver dies | focus the leader |
| **The Choir** | Zealots linking Reavers | none | — | break links with Shove |
| **Dart Rush** | 12 Darts + Mites | none | Darts come in waves of 4 | throw them back |
| **Minefield** | 2 Jackals + Wasps | mines pre-seeded | — | lure enemies through mines |
| **Sniper Alley** | 3 Lancers + Brood screen | rocks spawn as cover | — | use cover; throw rocks |
| **The Warden Wall** | Wardens bubbling Corsairs | none | — | flank and pop bubbles |
| **Spitter Rain** | Spitters + Chargers | none | ground rings everywhere | keep moving |
| **Blackout** | Ghosts + Gloomcaps | the lights go out | enemies glow; you see by explosions | spectacle + Pull reveals |
| **Hold the Line** | everything available | none | survive 60 s; kills don't end it | a pure survival breather from planning |
| **Gravity Storm** | mixed | random wells pulse | wells affect everyone | combo heaven |
| **Bulldozers** | 2 Bruisers + Brood tide | — | Bruisers shove rocks ahead of them | bait them into hazards |
| **The Leash** | Tether Raiders + Wasps | — | — | cut ropes; tow them into hazards |
| **Anchors Aweigh** | Anchor Controllers + mixed | — | enemy wells | use their wells |
| **Customs Check** | Cutters + Lawmen | — | EMP rings | power discipline |
| **Brood Tide** | Brood only, max population | — | — | the screen-filler; Shove and Pull |
| **The Hunt** | one Corsair Wing (5 aces) | — | named aces | a mini-boss wave |
| **Hazard Hour** | mixed | the arena hazard runs double-speed | — | the arena is the weapon |
| **Boss** | boss + escort | arena event | — | BESTIARY Part 4 |

**Recipe done:** its opening 10 s reads distinctly with the HUD hidden; 20 consecutive waves never
repeat back-to-back; each recipe has a capture; the name appears as the round title (≤ 3 words).
