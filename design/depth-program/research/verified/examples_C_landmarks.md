# Examples C — Sector Signature Landmarks (creative-concept pool)

> Creative-concept pool for SpaceFace (semi-3D top-down space sim, y=0 XZ plane).
> This is the **concept feed** for the P1 Sector-Signature-Landmarks pipeline
> (`design/depth-program/P1-sector-landmarks.md`). Each concept below is a candidate
> hero-asset brief a 3D artist could model in Blender (per `assets/AGENTS.md` §3 +
> SPEC3-F9) and wire via the two seams in P1 §3.
>
> **Reference points used throughout (all verified against the working tree 2026-07-12):**
> - **8 gameplay factions** (`src/data/factions.js`) with faction-tint that flows through
>   `paletteFor` → material slots: `faction_scn` (Solar Concord Navy, blue `#3A78FF`,
>   lawful), `faction_mts` (Meridian Trade Syndicate, gold `#F2B233`, corporate),
>   `faction_dmc` (Drift Miners Collective, copper `#C9772E`, blue-collar),
>   `faction_reach` (Crimson Reach, red `#D8334A`, pirate), `faction_quiet` (The Quiet,
>   violet `#7A5FB0`, smuggler), `faction_vael` (The Vael, teal `#2FCFA0`, xenophobic
>   alien / endgame), `faction_free` (Free Frontier, cyan `#4ECBE0`, independent
>   settlers — the player's default), `faction_choir` (Ascendant Choir, magenta
>   `#E85FD0`, zealot).
> - **Material convention** (P1 §4): every GLB uses slots `Material_Hull` /
>   `Material_Accent` / `Material_Emissive`; runtime tint applies the faction palette so
>   ONE asset reads as Concord-blue in Helios and Vael-teal in the Veil without rework.
> - **Tri budgets** (P1 §2, `parts_manifest.json` `trianglesPerLandmark`): hero
>   landmarks 8k–15k tris. Merge static bolts/ribs/panels into few submeshes per
>   material/role — solve silhouette, not micro-detail.
> - **Real zone/sector IDs**: cited inline per concept (from `sectorZones.js`,
>   `sectors.js`, and `frontierRegions/{west,north,east,south}.js`).
> - **Palette classes** drive the four `_spawn*Dressing` functions in `world.js`:
>   `core` (cyan/blue — SCN/MTS), `belt` (orange — DMC), `fringe` (red — Reach/Quiet),
>   `anomaly` (purple/green — Vael/Choir rim).
> - **Non-diegetic only** — no cockpit/visor/HUD-frame motifs; everything is a thing in
>   the world the player flies around/under/through on the y=0 plane. Y-axis is used for
>   vertical silhouette read (spires, arches, suspended rings the player flies beneath).
> - **Distinct-silhouette rule**: within each slot the five candidates are deliberately
>   different shapes (horizontal / vertical / ring / wedge / tangle / shell / etc.) so a
>   player who sees two landmarks from the same slot across separate playthroughs does
>   not read them as the same object.
> - **Emotional targets** are confined to the set awe / dread / mystery / greed and
>   varied within a slot.

---

## How the 15 slots map onto the named zones

Slots 1–10 are the pre-queued P1 backlog (`P1-sector-landmarks.md` §5) — each binds to
one real named zone or POI. Slots 11–15 open the backlog to wider themes
(megastructure, natural anomaly, faction capitals, alt-historical graveyards, precursor
ruins) so the pipeline has runway past its first 10 iterations.

| # | Slot | Anchor (verified) | Sector | Faction |
|---|---|---|---|---|
| 1 | Cruiser Graveyard | `zone_io_derelict` (sectorZones.js:161) | sector_io_reach | free |
| 2 | The Veil Anomaly | `zone_veil_anomaly` (sectorZones.js:206) | sector_veil_nebula | vael |
| 3 | Memorial to the Pit convoy | `zone_helios_memorial` (sectorZones.js:87) | sector_helios_prime | scn |
| 4 | Kurtz's Cache / Vault | `zone_ashfall_vault` (sectorZones.js:219) | sector_ashfall_reach | vael |
| 5 | Iron Maw Approach | `zone_ashfall_approach` (sectorZones.js:216) | sector_ashfall_reach | vael |
| 6 | Collapsed Drill Rig | `poi_hyperion_driller` (west.js:289,318) | sector_hyperion_cut | dmc |
| 7 | Colony Barge | `zone_charon_colony` (sectorZones.js:180) | sector_charon_expanse | free |
| 8 | Scarred Battlegroup wreck-bazaar | `poi_kepler_hulk` (west.js:407,431) | sector_kepler_scar | reach |
| 9 | Vael Echo Shrine | `station_phoebe_echo` (north.js:258) | sector_phoebe_echo | vael |
| 10 | Smuggler Well-Mouth | `poi_proteus_hulk` (east.js:192) | sector_proteus_well | quiet |
| 11 | Megastructure (ringworld/Dyson partial) | frontier anomaly sectors | — | precursor |
| 12 | Natural anomaly (wormhole/pulsar/BH-adj.) | anomaly/wormhole POIs | — | — |
| 13 | Faction capital landmark | faction core sectors | — | per-faction |
| 14 | Alt-historical graveyard/memorial | one per candidate | — | per-event |
| 15 | Alien / precursor ruin site | frontier deep sectors | — | precursor |

---

## SLOT 1 — Cruiser Graveyard  (`zone_io_derelict`, `sector_io_reach`)

Zone reason (verbatim): "A Concord cruiser died here in the last border flare; salvage
crews still comb the hull." The Io Reach is contested Free-Frontier ground; the wreck is
jurisdictionally orphaned. Five distinct ways to read "broken capital ship."

### C1-a · Wreck Cathedral (the canonical split-hull)
- **Location:** `zone_io_derelict`, `sector_io_reach` (palette `fringe`, faction `faction_free`)
- **Visual:** A Concord heavy cruiser snapped in two behind the bridge tower, the halves
  splayed open like a ribcage so the player flies *through* the gutted hangar bay. Broken
  keel rises ~280u above the plane; interior decks hang at angles. **Material_Hull:**
  scored Concord-grey plating with scorch lips. **Material_Accent:** blue stripe remnants
  (Concord livery, half-burned). **Material_Emissive:** cold cyan emergency strips still
  flickering on battery. ~12k tris, 4 submeshes.
- **Backstory:** The *Concord Vigilant* held the contested lane alone for nine hours
  while civilians jumped out; a Reach alpha-strike cracked its reactor spine. Both
  jurisdictions claim the wreck — so neither tows it.
- **Gameplay interaction:** Salvage (claimable — P1 §9 ceiling): beams the player's
  mining laser at exposed conduit for low-grade alloys + chance of a Concord mission
  chip. Rep gate: `faction_scn` ≥ neutral or `faction_free` ≥ neutral; red to the other.
- **Emotional target:** awe (a cathedral of a dead ship) shading to greed (it is full of metal).

### C1-b · The Keel-Spire (vertical wreck)
- **Location:** `zone_io_derelict`, `sector_io_reach`
- **Visual:** The cruiser's forward keel imbedded nose-first into a dense asteroid, so
  the entire hull stands near-vertical — a 600u dagger of ship pointing at the sky.
  Player flies circles around the suspended engine bells. **Material_Hull:** soot-black
  bow plating fading to clean aft paint where it never burned. **Material_Accent:** the
  gold stripe of a Concord flag-cruiser (rare). **Material_Emissive:** one still-hot
  reactor glow leaking from a cracked ventral port. ~9k tris.
- **Backstory:** The cruiser was rammed/pushed into the rock by a Reach boarding sled
  whose own hull is fused to the cruiser's flank — the two ships died mid-grapple and
  froze upright. Nobody has been able to pull it free.
- **Gameplay interaction:** Scan-only lore (the sled's log is the story); a high-tier
  scan reveals a hidden datacore with a Reach navigator's last entry. Encounter trigger:
  scavengers (`wasp_swarmer`) nest in the engine bells and aggro on close approach.
- **Emotional target:** dread (a giant dead thing standing upright is wrong).

### C1-c · The Shatter-Ring (frozen explosion)
- **Location:** `zone_io_derelict`, `sector_io_reach`
- **Visual:** No whole hull at all — the cruiser's matter distributed in a slow rotating
  ring of debris chunks around a central black scorch on the plane. A few large
  fragments (a turret, a shuttle, an engine cowl) carry recognisable silhouettes; the
  rest is sharp shrapnel. Player flies *around* the ring like a saturn. **Material_Hull:**
  mixed Concord-grey +Reach-red shards (two fleets died here).
  **Material_Accent:** brass fittings. **Material_Emissive:** none (truly dead). ~10k
  tris across many merged shards in 2 submeshes.
- **Backstory:** A reactor critical detonated simultaneously with the cruiser's magazine;
  the explosion was so symmetric surveyors logged it as a possible precursor-weapon hit.
  Both sides deny it. The ring is slowly spreading.
- **Gameplay interaction:** Hazard + salvage hybrid: dense_asteroid-style collision hazard
  across the ring; salvageable nodes scattered through it; a scan at the centre yields an
  "unresolved signature" quest hook (mystery). Claimable as a mining claim.
- **Emotional target:** mystery (an explosion too clean to be an accident).

### C1-d · The Wedge (bow stuck in a dead moonlet)
- **Location:** `zone_io_derelict`, `sector_io_reach`
- **Visual:** Just the cruiser's forward third — a broad wedge bow buried nose-in to a
  small dead moonlet, the deck tilting up out of the rock at ~30°. Half a bridge tower,
  one intact lance turret (silent). **Material_Hull:** Concord-grey with raw tear-edges
  showing the internal frame. **Material_Accent:** red warning chevrons.
  **Material_Emissive:** a single working amber obstruction light, still blinking on a
  solar-charged battery decades later. ~8k tris.
- **Backstory:** The bow was sheared off by a hit and tumbled into the moonlet under its
  own momentum; the rest of the ship drifted on. The obstruction light has become a
  navigational reference — pilots call it "the Marker."
- **Gameplay interaction:** Navigation landmark (improves long-range-scan resolution in
  the zone) + scan lore. The intact lance turret is claimable as a one-time module
  blueprint reward for players with `tech:tech_salvage_adv`.
- **Emotional target:** awe (a monument to momentum) shading to greed (the turret).

### C1-e · The Tangle (fused small-craft mass)
- **Location:** `zone_io_derelict`, `sector_io_reach`
- **Visual:** Not one cruiser but a grape-cluster of corvettes, shuttles, and a single
  cruiser engine block all fused together by repeated rescue-tug impacts and then
  abandoned. Irregular ball ~220u across. Player flies through gaps between hulls.
  **Material_Hull:** mismatched — Concord, Reach, civilian liveries welded on top of
  each other. **Material_Accent:** bare steel weld-beads. **Material_Emissive:** faint
  bioluminescent glow (space-mold growing on leaked organics). ~11k tris.
- **Backstory:** After the battle, salvors tried to grapple the wrecks together for a
  tow. The mass became too tangled to move, the tow company went bust, and the cluster
  was declared a hazard and forgotten. Squatters moved in.
- **Gameplay interaction:** Encounter hub — multiple short faction-based encounters
  (scavengers, a Quiet contact, a Reach deserter) all inside the tangle. Rep gates open
  different interior chambers. Claimable as a player base site (P1 §9 ceiling).
- **Emotional target:** greed (everyone left valuables in there) shading to dread (it is occupied).

---

## SLOT 2 — The Veil Anomaly  (`zone_veil_anomaly`, `sector_veil_nebula`)

Zone reason: "Sensors ghost, autopilot drifts; the Vael guard whatever waits inside."
The Anomaly is the canonical precursor/alien construct in the game; the Vael (alien,
xenophobic, teal) treat it as a shrine. Palette `anomaly` (purple/green).

### C2-a · Resonance Obelisk (the canonical construct)
- **Location:** `zone_veil_anomaly`, `sector_veil_nebula` (faction `faction_vael`)
- **Visual:** A single 700u tapered tetrahedral monolith of an unknown dark material,
  its faces etched with concentric grooves that catch the nebula light and re-emit it as
  a slow teal pulse from base to apex. Perfectly straight, perfectly still. Player flies
  around it; the obelisk's geometry subtly does not obey the scene lighting.
  **Material_Hull:** matte near-black with a faint teal sheen (not metal, not stone).
  **Material_Accent:** the etched grooves. **Material_Emissive:** the slow travelling
  pulse (1 shader uniform). ~9k tris, 1 submesh + emissive overlay.
- **Backstory:** Predates every known faction. Vael ships orbit it in slow ceremony; the
  Veil Research station was built only because the Vael permit it. Its pulse has sped up
  measurably since the player's species arrived in the sector.
- **Gameplay interaction:** Scan-only (long-scan tech required) yields escalating lore
  fragments; each scan slightly raises the pulse rate — a measurable consequence of the
  player's curiosity. Encounter trigger: Vael patrols aggro if the player loiters >60s
  inside the zone without `faction_vael` positive rep.
- **Emotional target:** awe (it is older than your species).

### C2-b · The Torus (liquid-crystal ring)
- **Location:** `zone_veil_anomaly`, `sector_veil_nebula`
- **Visual:** A 900u-diameter ring of translucent crystalline material, oriented edge-on
  to the plane so the player flies through the hole. The ring slowly rotates and the
  crystal shifts colour through teal→violet→void as it turns. No core, no supports — it
  holds itself. **Material_Hull:** the crystal mass (semi-transparent, refractive shader).
  **Material_Accent:** brighter vein lines running around the ring.
  **Material_Emissive:** the colour-shift core glow. ~13k tris.
- **Backstory:** The torus refracts light in ways current physics can't model — sensors
  bouncing off it return readings from seconds in the future. The Vael call it "the
  Eye-that-sees-back." Free Frontier scientists are forbidden from sampling it.
- **Gameplay interaction:** Sensor-hazard: while inside the ring's hole, the player's
  long-range scan returns ghost contacts (false radar blips). Scan lore at the centre
  reveals the "future-readings" hook. A claimable scan-data node rewards a unique
  tradeable data shard.
- **Emotional target:** mystery (it sees you before you see it).

### C2-c · The Coral (fractal branching construct)
- **Location:** `zone_veil_anomaly`, `sector_veil_nebula`
- **Visual:** A 500u-tall branching structure like antler-coral, grown (not built) out
  of the same dark material as the obelisk. Dozens of arms reach outward and upward;
  the player can fly between the branches. Tiny motes drift between the tips.
  **Material_Hull:** dark organic-looking matte. **Material_Accent:** teal vein-lines
  along each branch. **Material_Emissive:** the drifting motes (particle emitter anchored
  to the mesh). ~14k tris (branch tips merged).
- **Backstory:** Still growing — at ~1cm/year. Carbon-dating the oldest branch puts the
  seed at 2.3 million years. The Vael prune it; no one knows why it grows toward ships.
- **Gameplay interaction:** Hazard-light: branches are solid (collision damage).
  Salvageable for a rare `ast_crystalline` equivalent node at each tip — but each
  harvest permanently removes one branch (a stateful world change). Vael rep penalty
  for harvesting.
- **Emotional target:** dread (it is alive, slowly, and it reaches for you).

### C2-d · The Black Sphere (event-horizon-adjacent)
- **Location:** `zone_veil_anomaly`, `sector_veil_nebula`
- **Visual:** A 200u perfect sphere of absolute black, ringed by a flat halo of captured
  dust and light bent into a thin bright ring around it (a discrete accretion disc, not
  a real shader — faked with a tilted emissive torus). The sphere occludes stars behind
  it. Player cannot enter it (soft invisible boundary pushes back).
  **Material_Hull:** pure black, no lighting response. **Material_Accent:** none.
  **Material_Emissive:** the bright dust-ring (the only visible part).
  ~8k tris (most of it the dust ring).
- **Backstory:** Not a black hole — it has no gravity. It simply absorbs light and
  matter and gives nothing back. Probes sent in cease to exist; the Vael say it is "a
  door that forgot its other side."
- **Gameplay interaction:** Pure mystery — a scan yields the Vael quote and a quest hook
  (the "door" theme). Firing weapons into it absorbs the projectiles (no damage, no
  effect). A rare Quiet contact offers to buy coordinates to it.
- **Emotional target:** dread (it eats light).

### C2-e · The Helix (twin braided columns)
- **Location:** `zone_veil_anomaly`, `sector_veil_nebula`
- **Visual:** Two 600u spiralling columns of dark material, braided around a common
  vertical axis like a DNA strand, ~120u apart at the widest. Player can fly up the
  central channel between them. The two strands pulse out of phase — one bright while
  the other dims. **Material_Hull:** dark matte. **Material_Accent:** the inner faces of
  each strand, polished to a mirror sheen. **Material_Emissive:** the out-of-phase teal
  pulses. ~12k tris (two merged spiral submeshes).
- **Backstory:** The strands exchange energy cyclically; the net output is exactly zero,
  measured to seven decimal places. Whoever built it was balancing something. The Vael
  meditate in the channel; some come out changed.
- **Gameplay interaction:** Rep-gated interior: players with `faction_vael` positive may
  enter the channel for a one-time "attunement" buff (shield regen in Vael space).
  Hostile players get a Vael ambush trigger at the channel mouth.
- **Emotional target:** awe (it is a machine doing nothing, perfectly).

---

## SLOT 3 — Memorial to the Pit Convoy  (`zone_helios_memorial`, `sector_helios_prime`)

Zone reason: "A quiet beacon marking the Pit convoy lost decades ago — a signal that
draws the curious." Helios is the safe tier-0 home sector (no hostile spawns); this is a
quiet, story-beat landmark. Concord faction, palette `core`.

### C3-a · The Pit Anchor (the canonical beacon)
- **Location:** `zone_helios_memorial`, `sector_helios_prime` (faction `faction_scn`)
- **Visual:** A 160u Concord-built anchor-pylon: a vertical fluted column with four
  outrigger stabiliser arms at the base, topped by a steady blue memorial flame in a
  glass cage. A ring of name-plates orbits the base at a readable scale.
  **Material_Hull:** polished Concord-blue plating (clean — this is maintained).
  **Material_Accent:** brass name-plates. **Material_Emissive:** the blue memorial flame
  + soft cyan under-lighting on the name ring. ~8k tris.
- **Backstory:** The Pit was a 24-ship civilian convoy that vanished without trace on a
  routine core-sector run. The Concord Navy, who failed to escort it, funds this beacon
  and refuses to declare the crews dead. The flame has not gone out in 41 years.
- **Gameplay interaction:** Scan-only lore: a short unfolding story across 5 visits
  (each visit adds a name-plate read + a log fragment). Triggers the "What was the Pit?"
  questline. Rep-agnostic (everyone respects the dead).
- **Emotional target:** awe (a nation's guilt made permanent).

### C3-b · The Ghost Convoy (faded holographic ships)
- **Location:** `zone_helios_memorial`, `sector_helios_prime`
- **Visual:** Twenty-four faint translucent ship-silhouettes in convoy formation,
  drifting very slowly along their last-known course through the zone. Each is a
  semi-transparent emissive shell ~80u long, blue-white, flickering at the edges.
  Player can fly through them. **Material_Hull:** none (holographic).
  **Material_Accent:** the formation running-lights. **Material_Emissive:** the whole
  body of each ghost-ship. ~10k tris across 24 instances of 1 mesh.
- **Backstory:** A Concord memorial project replaying the convoy's last trajectory from
  its black-box telemetry on a loop. The telemetry is incomplete — at one point the
  ghosts "lose track" and the formation smears, then re-forms. Researchers argue about
  what the smear means.
- **Gameplay interaction:** Scan each ghost for its ship's name + crew manifest (lore).
  The smeared section is a quest clue. A Quiet contact pays for the raw telemetry.
- **Emotional target:** mystery (the smear is the story).

### C3-c · The Candle Fleet (drone memorial)
- **Location:** `zone_helios_memorial`, `sector_helios_prime`
- **Visual:** 24 small drone-sized candle-beacons, one per lost ship, anchored in a
  perfect 5×5 (minus one) grid, each a thin white spire ~40u tall with a single steady
  warm flame at the top. The grid's missing 25th slot holds a single dark plinth.
  **Material_Hull:** white ceramic. **Material_Accent:** dark plinth (the missing ship).
  **Material_Emissive:** the warm candle flames. ~6k tris across instances (under budget
  — appropriate for a quiet landmark).
- **Backstory:** The candle fleet is tended by a Concord veterans' order; one candle per
  ship, plus a plinth for the one convoy hull that was later recovered — empty. The
  drones re-light themselves if destroyed, which has become its own minor legend.
- **Gameplay interaction:** Scan lore per candle. The dark plinth starts a questline
  about the recovered ship. A player who destroys a candle gets a one-time Concord rep
  penalty (the order notices).
- **Emotional target:** awe (a quiet, dignified grid of light).

### C3-d · The Black Wall (monolith memorial)
- **Location:** `zone_helios_memorial`, `sector_helios_prime`
- **Visual:** A single 200u-long × 120u-tall matte-black monolith wall, thin edge-on,
  standing on the plane. The 1,418 crew names are inscribed as a texture on both faces,
  readable only when the player flies close. No glow, no ornament.
  **Material_Hull:** matte black stone-analogue. **Material_Accent:** the inscribed names
  (slightly lighter than the body). **Material_Emissive:** none.
  ~7k tris (mostly the name texture resolution).
- **Backstory:** Commissioned by the families, not the Navy. The Concord government
  refused to fund it; civilians paid. The wall is oriented exactly along the convoy's
  final heading. It is the only structure in Helios the Navy does not maintain.
- **Gameplay interaction:** Scan to receive the full crew list + family-submitted
  epitaphs (lore-heavy). Quest hook: one of the names matches a living NPC in another
  sector (identity-theft / fraud storyline).
- **Emotional target:** awe (deliberate, severe, mute).

### C3-e · The Hanging Wreath (suspended cargo containers)
- **Location:** `zone_helios_memorial`, `sector_helios_prime`
- **Visual:** A ring of 24 cargo containers — the standard civilian type the convoy was
  carrying — suspended in a slow rotating wreath-formation ~180u across, hanging above
  the plane on a grav-anchor. Each container is sealed with a memorial ribbon in
  Concord-blue. **Material_Hull:** standard civilian container off-white.
  **Material_Accent:** the blue ribbons. **Material_Emissive:** one small steady light
  on each container (memorial flame-analogue). ~9k tris.
- **Backstory:** The containers hold a representative sample of the cargo the convoy was
  carrying (medical supplies, school equipment, seed stock) — preserved as a memorial to
  what was lost beyond the lives. Families add a new sealed container each anniversary.
- **Gameplay interaction:** Scan each for its manifest and intended recipient colony
  (lore). Quest: one recipient colony still exists and would pay to know what was in the
  container meant for them. Claimable: the player can, with high Concord rep, sponsor the
  next anniversary container (a small world-state contribution).
- **Emotional target:** awe (the things, not just the people).

---

## SLOT 4 — Kurtz's Cache / Vault  (`zone_ashfall_vault`, `sector_ashfall_reach`)

Zone reason: "A sealed records cache — the reason anyone flies this far." The endgame
goal. Vael-held, tier-4, palette `anomaly`. The player has crossed the whole galaxy to
reach this.

### C4-a · The Vault Maw (the canonical toothed jaw)
- **Location:** `zone_ashfall_vault`, `sector_ashfall_reach` (faction `faction_vael`)
- **Visual:** A massive 400u sealed vault-door set into a basalt-like asteroid face,
  built as six overlapping petal-doors that read unmistakably as a closed jaw when seen
  in silhouette. The teeth interlock. Faint teal seams pulse where the petals meet —
  locked. **Material_Hull:** the asteroid basalt + the door's dark-metal skin.
  **Material_Accent:** the interlocking tooth-edges, polished.
  **Material_Emissive:** the teal seam-lines between petals. ~13k tris.
- **Backstory:** The Vael sealed the records of the rebel commander Kurtz — and
  something else — inside this vault and posted a permanent guard. The Concord, the
  Reach, and the Choir have all sent teams. None returned with the door open.
- **Gameplay interaction:** Endgame objective. The vault is locked until the player
  completes the Kurtz questline; on completion, a one-time scripted animation opens one
  petal and the player flies inside for the finale. Encounter trigger: the Iron Maw's
  Vael guard (slot 5) attacks if the player approaches under hostile Vael rep.
- **Emotional target:** dread (the door is a mouth) shading to awe (the end of the road).

### C4-b · The Concentric Lock (rotating rings)
- **Location:** `zone_ashfall_vault`, `sector_ashfall_reach`
- **Visual:** Four nested freestanding metal rings, each ~300u, oriented in different
  planes around a central sealed sphere. The rings slowly rotate at different speeds and
  periodically align — when they do, a bright teal flash pulses from the centre.
  Asteroid basalt is absent; this is a pure freestanding mechanism in open space.
  **Material_Hull:** dark gunmetal rings with engraved count-marks.
  **Material_Accent:** the alignment runes. **Material_Emissive:** the central flash.
  ~11k tris (4 ring submeshes + sphere).
- **Backstory:** The rings are a combination lock on a galactic scale; the alignment
  flash is the lock "checking itself." No faction has determined the combination. The
  Vael do not built it — they inherited the guard.
- **Gameplay interaction:** Scan yields "current alignment readings" lore. The
  questline requires the player to deliver specific found artefacts to specific ring
  positions; each correct delivery nudges a ring's speed. Endgame finale when all align.
- **Emotional target:** mystery (a puzzle the size of a station).

### C4-c · The Geode (crystalline shell)
- **Location:** `zone_ashfall_vault`, `sector_ashfall_reach`
- **Visual:** A 350u irregular geode: a cracked-open rocky shell revealing a hollow
  interior lined with enormous teal crystals, the largest ~120u. The player flies
  *inside* through the crack; the sealed records sit at the centre on a small plinth,
  behind a crystal lattice. **Material_Hull:** the rocky exterior (basalt-analogue).
  **Material_Accent:** the crystal interior faces (semi-transparent, refractive).
  **Material_Emissive:** the crystal inner glow + the central plinth's soft teal halo.
  ~14k tris.
- **Backstory:** The vault was carved into a natural crystal formation by an unknown
  earlier civilisation; the Vael found it, added the records, and re-sealed it with
  crystal growth. The crystals themselves are the lock — they re-grow over any breach.
- **Gameplay interaction:** Hazard + quest: crystal growth is a slow collision-hazard
  inside. The questline yields a crystal-tuning tool that opens a path. Salvageable
  crystal shards (rare) along the interior walls. Claimable as a rare-resource site
  post-finale.
- **Emotional target:** awe (a geode the size of a town) shading to greed (the crystals).

### C4-d · The Slab (monolithic door)
- **Location:** `zone_ashfall_vault`, `sector_ashfall_reach`
- **Visual:** A single 250u-tall × 180u-wide × 40u-thick rectangular slab of an unknown
  black material, standing on the plane, its face covered in a dense grid of small
  holes — keyholes, tens of thousands of them. No ornament, no mechanism visible.
  **Material_Hull:** the black slab material (deeper black than the surrounding space).
  **Material_Accent:** the keyhole grid (slightly lighter holes).
  **Material_Emissive:** a single working teal light at the exact centre of the grid.
  ~8k tris (mostly the hole texture).
- **Backstory:** Kurtz's records are behind the slab. The Vael hold the only known key
  — a physical spike that fits one specific hole. They will not say which. The slab is
  theorised to predate the Vael by millions of years; they simply found it and use it.
- **Gameplay interaction:** Endgame objective gated on the spike-quest. Each wrong-hole
  attempt (player flies a found spike-key to a hole) costs reputation or triggers a Vael
  patrol. The correct hole is the questline's final puzzle. Scan-only before that.
- **Emotional target:** mystery (a door with a million locks).

### C4-e · The Inverted Spire (hanging vault)
- **Location:** `zone_ashfall_vault`, `sector_ashfall_reach`
- **Visual:** A 500u tapered spire hanging point-down from... nothing — it simply
  hovers, apex 60u above the plane, broad base uppermost. The vault entrance is on the
  underside of the broad base, a sealed hexagonal port. Player flies *under* it and up
  into the port. **Material_Hull:** dark-metal skin with vertical fluting.
  **Material_Accent:** gold-inlay borders around the port (Vael livery).
  **Material_Emissive:** a slow teal pulse from the apex downward, as if draining.
  ~10k tris.
- **Backstory:** The spire's gravitic anchor predates the Vael; they built the records
  chamber inside the broad base and the entrance on the underside so it could only be
  approached deliberately, from below, in reverence. The Vael claim it will fall when
  the rightful heir of Kurtz stands beneath it.
- **Gameplay interaction:** Approach vector matters: the port only opens to a ship that
  enters the zone from a specific bearing (questline reveals which). Endgame finale
  plays inside. A long-range scan from below reveals the slow drain-pulse is accelerating.
- **Emotional target:** awe (a thing hanging from nothing) shading to dread.

---

## SLOT 5 — Iron Maw Approach  (`zone_ashfall_approach`, `sector_ashfall_reach`)

Zone reason: "The Iron Maw dreadnought holds the approach — the system's last
enforcement." Named-boss landmark. Vael, tier-4, palette `anomaly`. The Maw is a single
ship that IS the zone's garrison.

### C5-a · Broadsides Hulk (the canonical broadside dreadnought)
- **Location:** `zone_ashfall_approach`, `sector_ashfall_reach` (faction `faction_vael`)
- **Visual:** A 700u-long slab-sided Vael dreadnought with two rows of broadside lance
  ports along its flanks, oriented to present its broadside to the approach lane. Armour
  is organic-looking Vael plating (curved, ribbed) in teal-over-black. Bridge module
  rises amidships. Turrets track the player. **Material_Hull:** Vael teal-black organic
  plate. **Material_Accent:** the polished lance-port lips. **Material_Emissive:** teal
  reactor glow from engine bells + lance-port charging flickers. ~14k tris.
- **Backstory:** The *Iron Maw* is the Vael's oldest active hull — it held this approach
  against the Choir, the Concord, and the Reach in successive eras. Its captain has been
  the same Vael for 200 years; whether by longevity or succession-by-name, no outsider
  knows. The ship has never left its post.
- **Gameplay interaction:** Named-boss encounter: it IS the zone's gate. Hostile players
  must either defeat it (very high tier), pay a Quiet broker for a smuggling lane around
  it, or earn Vael rep. Positive-Vael players are permitted to dock for refuel/repair.
  Rep-gated service access.
- **Emotional target:** dread (it is watching the only door).

### C5-b · The Spinal Lance (fortress with one huge gun)
- **Location:** `zone_ashfall_approach`, `sector_ashfall_reach`
- **Visual:** A shorter, fatter 450u hull built around a single enormous spinal-mounted
  lance running its full length — the barrel projects far forward of the bow like a
  siege cannon. The hull is mostly reactor + crew support for the one weapon. The barrel
  glows faintly along its length. **Material_Hull:** Vael teal-black, heavier plating
  around the reactor bulge. **Material_Accent:** the polished lance barrel.
  **Material_Emissive:** the continuous low barrel-glow + a brutal muzzle flare when it
  fires (telegraphed). ~12k tris.
- **Backstory:** The *Maw's* spinal lance is rumoured to have been built to kill
  something specific — not a ship, a megastructure. It has fired only three times in
  recorded history; each shot coincided with a precursor construct going dark somewhere
  in the galaxy.
- **Gameplay interaction:** Boss + environmental hazard: the lance periodically fires a
  telegraphed beam down the approach lane; the player must fly clear of the lane when it
  charges. Scan yields the three-target lore hook. Hostile players must beat the
  recharge cycle to close.
- **Emotional target:** dread (it was built to kill something bigger than you).

### C5-c · The Twin-Hull (catamaran fortress)
- **Location:** `zone_ashfall_approach`, `sector_ashfall_reach`
- **Visual:** Two 350u Vael cruiser hulls joined by a 200u-wide crossbeam-and-bridge
  superstructure, forming a catamaran the player can fly *between* the hulls of. The
  crossbeam carries the bridge and a cluster of point-defence turrets. Each hull has
  independent engines. **Material_Hull:** Vael teal-black on both hulls.
  **Material_Accent:** the crossbeam's polished gold-inlay Vael crest.
  **Material_Emissive:** teal engine + bridge glow. ~13k tris.
- **Backstory:** The *Iron Maw* is technically two ships: the *Iron* and the *Maw*,
  welded together after a battle neither could win alone. They have moved as one for so
  long the crews share a single shift rotation. The space between the hulls is a
  known-smuggler shortcut — for those the Maw permits.
- **Gameplay interaction:** The between-hulls gap is a toll lane: positive-Vael players
  pay a toll and slip through; hostile players can attempt to dash through under fire from
  both hulls' point-defence. A Quiet broker quest reveals the toll can be bypassed for a
  cut. Encounter scales: destroying one hull cripples but does not kill the Maw.
- **Emotional target:** dread (two minds, one purpose).

### C5-d · The Dome (shield-fortress)
- **Location:** `zone_ashfall_approach`, `sector_ashfall_reach`
- **Visual:** A 300u hemispherical Vael command-station enclosed in a much larger
  shimmering teal shield-dome ~600u across — the dome is the visible silhouette. The
  station inside is dense with antenna and lance-turrets; through the translucent dome
  the player sees it ripple as objects impact. **Material_Hull:** the inner station's
  teal-black armour. **Material_Accent:** the dome's emitter rings at the base.
  **Material_Emissive:** the shimmering dome itself + the station's lance-charging
  flickers. ~11k tris (dome is a single low-poly shell with a custom shader).
- **Backstory:** The *Iron Maw* in this guise is a fixed fortress whose dome has not
  been lowered in living memory; the Vael garrison inside rotates out through a shielded
  docking tube. The dome draws so much power the fortress cannot move — by design.
- **Gameplay interaction:** Environmental siege: the dome blocks all weapons and most
  scans from outside. Positive-Vael players are granted shield-frequency clearance to
  fly through. Hostile players must either (a) overload the dome emitters (sustained
  fire over many minutes, broadcasting their position), or (b) accept they cannot enter
  Ashfall this way.
- **Emotional target:** dread (impenetrable, by intent).

### C5-e · The Ram (siege-engine hull)
- **Location:** `zone_ashfall_approach`, `sector_ashfall_reach`
- **Visual:** A 550u Vael hull dominated by a massive reinforced ram-bow — a blunt,
  armoured prow taking up the forward third, built to crush other ships by collision.
  The hull behind is comparatively slender. Engine block disproportionately huge for the
  ship's size, because the design priority is mass × velocity. **Material_Hull:** Vael
  teal-black, heavily scarred ram-bow with the paint of a dozen enemy factions scored
  into it. **Material_Accent:** the polished ram-tip (a rare non-Vael gold alloy —
  taken from a killed Choir fortress). **Material_Emissive:** teal engine flare.
  ~12k tris.
- **Backstory:** The *Iron Maw* earned its name in the ram — it has physically crushed
  seven capital ships across the centuries, including a Concord carrier. Its captain
  prefers to grapple and board. The scar-paint is a kill-record kept by the crew.
- **Gameplay interaction:** Mobile boss: the Maw physically moves to ram players who
  loiter in the lane — a collision-hazard on a capital scale. Hostile players must keep
  moving or be crushed. Scan yields the seven-kill history. Positive-Vael players can
  request a "ram escort" — the Maw clears a path for them through any ambush.
- **Emotional target:** dread (it will hit you, not shoot you).

---

## SLOT 6 — Collapsed Drill Rig  (`poi_hyperion_driller`, `sector_hyperion_cut`)

POI name: "Collapsed Drill Rig" (west.js:289). Hyperion Cut is a tier-2 DMC frontier
sector; the rig was industrial mining infrastructure that failed. Palette `fringe`.

### C6-a · The Toppled Tower (the canonical fallen rig)
- **Location:** `poi_hyperion_driller`, `sector_hyperion_cut` (faction `faction_dmc`)
- **Visual:** A 400u mining drill tower toppled onto its side, lying across an asteroid,
  its triangular truss-work broken in two places. The drill head — a 60u saw-toothed
  cone — is buried in the rock where it fell. Cables trail. **Material_Hull:** DMC
  industrial copper-orange truss-paint, heavy rust-bloom. **Material_Accent:** the
  drill-head steel teeth. **Material_Emissive:** one still-working amber hazard beacon
  on the highest surviving point. ~11k tris.
- **Backstory:** The rig was drilling deep-core when the asteroid's internal pressure
  blew out the shaft; the tower was pushed over by the venting gas and four crew died.
  The DMC wrote off the rig and the asteroid rather than recover either.
- **Gameplay interaction:** Salvage: the truss-work yields common alloys; the drill head
  yields rare `ast_metallic` equivalent once mined free. Scan yields the accident report
  (lore + a DMC safety-violation quest hook). Claimable as a mining claim once cleared.
- **Emotional target:** greed (industrial scrap on the cheap).

### C6-b · The Folded Umbrella (collapsed-in rig)
- **Location:** `poi_hyperion_driller`, `sector_hyperion_cut`
- **Visual:** A drill rig whose central mast has collapsed *downward* into its own ring
  of support legs, so the whole structure reads as a folded umbrella — the legs splay
  outward and upward from the crushed central hub. The drill head sits at the bottom of
  the crushed hub. Player flies around and between the splayed legs.
  **Material_Hull:** DMC copper-orange. **Material_Accent:** the polished collapsed-piston
  mechanism. **Material_Emissive:** leaking reactor fluid glow (faint amber). ~10k tris.
- **Backstory:** The rig's hydraulic mast failed under tension and the structure
  imploded faster than the crew could evacuate. The collapse pattern is used in DMC
  training manuals as a case study. The dead crew's suits are still inside.
- **Gameplay interaction:** Hazard + salvage: the splayed legs are solid (collision);
  interior salvage requires careful navigation. Scan yields crew records (the
  training-manual lore). Encounter trigger: a DMC survey drone still patrols the wreck
  and flags the player if `faction_dmc` rep is negative.
- **Emotional target:** dread (a machine that ate its crew).

### C6-c · The Caved Shaft (ring-only rig)
- **Location:** `poi_hyperion_driller`, `sector_hyperion_cut`
- **Visual:** Only the rig's outer support ring and base platform survive — a 250u-dia
  freestanding ring of legs and the drilling platform deck, with a gaping dark shaft-hole
  in the deck where the entire central mast assembly fell *down into* the asteroid. The
  deck tilts slightly. Player flies through the ring and can look down the shaft (it has
  no visible bottom). **Material_Hull:** DMC copper-orange platform + legs.
  **Material_Accent:** the shaft-lip warning chevrons. **Material_Emissive:** a faint
  amber glow from deep in the shaft (the buried reactor, still warm). ~8k tris.
- **Backstory:** The asteroid the rig sat on was hollow — a precursor void-chamber the
  DMC never detected. The rig's weight broke the crust and the entire central assembly
  fell into the chamber. Drone probes sent down do not return telemetry.
- **Gameplay interaction:** Mystery hook: the shaft is a one-way quest entry point — a
  player who accepts the "what is down there" quest gets a special probe that returns a
  single image (a lore artefact). Salvage on the surviving ring. Scan yields the
  "undetected void-chamber" hook.
- **Emotional target:** mystery (the hole goes somewhere).

### C6-d · The Snapped Auger (broken central drill)
- **Location:** `poi_hyperion_driller`, `sector_hyperion_cut`
- **Visual:** The rig's central auger — a 300u-long helical steel screw — snapped in
  half and now floating horizontally beside the rig's intact base platform, the two
  broken ends drifting apart very slowly. The helix threads are huge, each turn ~30u.
  Player flies through the coils. **Material_Hull:** DMC copper-orange on the platform;
  bare steel on the auger. **Material_Accent:** the polished break-edges (mirror-bright
  where the metal parted). **Material_Emissive:** none (dead). ~9k tris.
- **Backstory:** The auger hit a material harder than its own steel and the torque
  snapped it. The geological sample that broke it was never identified — the bit is still
  embedded somewhere below. DMC engineers argue about what could do that.
- **Gameplay interaction:** Salvage: the auger steel is a rare high-tensile alloy
  (one-time harvest). Scan yields the "unidentified hard material" hook — a long
  questline about precursor alloy. The intact base platform is claimable as a player
  outpost site.
- **Emotional target:** mystery (what is harder than this?) shading to greed.

### C6-e · The Capsized Platform (upside-down rig on an asteroid)
- **Location:** `poi_hyperion_driller`, `sector_hyperion_cut`
- **Visual:** An entire drill rig platform — a 280u rectangular deck with four corner-legs
  and a central mast — flipped entirely upside-down and resting on what is now its
  "topside," the legs pointing upward at the sky, the mast buried point-down in the
  asteroid it was drilling. Looks like an inverted table. **Material_Hull:** DMC
  copper-orange, heavy scorch on the deck's now-underbelly. **Material_Accent:** the
  corner-leg warning stripes (now upside down). **Material_Emissive:** one stubborn
  amber running light still cycling on a leg. ~10k tris.
- **Backstory:** A rogue asteroid rotation flipped the rig off its drilling face; the
  platform tumbled and landed inverted on the same asteroid. The crew evacuated; the rig
  was left as a navigational warning. Local pilots call it "the Table."
- **Gameplay interaction:** Navigation landmark + salvage. The inverted legs are a
  hazard. Scan yields the rogue-rotation event (a hazard-forecasting quest). Claimable as
  a novelty outpost for players who want a flipped base.
- **Emotional target:** awe (a whole industrial unit flipped like a toy).

---

## SLOT 7 — Colony Barge  (`zone_charon_colony`, `sector_charon_expanse`)

Zone reason: "A struggling colony trades air and salvage for anything it can get." A
civilian settlement landmark in a tier-2 DMC sector with thin escort coverage. Free
Frontier faction, palette `belt`.

### C7-a · The Barge Cathedral (the canonical hab-barge)
- **Location:** `zone_charon_colony`, `sector_charon_expanse` (faction `faction_free`)
- **Visual:** A 500u decommissioned freighter-barge converted to a colony: the cargo
  hold opened into stacked hab-blocks rising above the hull like a small city, with
  improvised domes, antennae, and greenhouses clustered on the deck. Reads as a
  cathedral-of-scrap from a distance. A faint atmosphere haze clings above it.
  **Material_Hull:** mismatched civilian hull paint (off-white, rust-streaked).
  **Material_Accent:** colourful hab-blocks (red, yellow, blue — the only colour in the
  sector). **Material_Emissive:** warm yellow hab-windows + a few working green grow-lights.
  ~14k tris.
- **Backstory:** The barge *Lung-of-Charon* was meant to ferry colonists to a garden
  world that turned out not to exist; the colonists settled the barge itself in the
  expanse and have been trading salvage for air filters ever since. Three generations
  have been born aboard.
- **Gameplay interaction:** Trade hub: minor market for air, food, salvage — pays well
  for oxygen, rare-earth, medical supplies. Mission giver (colony needs). Rep-agnostic
  but grateful. Claimable as a permanent ally: high-`faction_free` players can fund an
  expansion that unlocks new services.
- **Emotional target:** awe (a city on a barge) shading to greed (they pay well).

### C7-b · The Stack (vertical container city)
- **Location:** `zone_charon_colony`, `sector_charon_expanse`
- **Visual:** A 350u-tall vertical tower built from hundreds of stacked standard cargo
  containers, welded and braced, narrowing as it rises — a shanty-spire. The base is
  broad (a 4×4 container footprint), the top a single container with a comms aerial.
  External ladders and Tubes connect containers. **Material_Hull:** the standard
  container off-white with serial numbers. **Material_Accent:** the colours of repurposed
  faction containers (a Concord blue one, a Meridian gold one — scrounged).
  **Material_Emissive:** scattered warm hab-window lights up the stack. ~12k tris.
- **Backstory:** The colony ran out of barge and started stacking containers as the
  population grew; each new arrival welds their container on. The Stack now has its own
  informal neighbourhoods by altitude.
- **Gameplay interaction:** Trade + mission hub (vertical — services tiered by altitude,
  the better stuff up top). Mission giver. Hazard: the upper stack is unstable, periodic
  container-fall hazard. A player with high rep can sponsor a stabiliser to remove the
  hazard (stateful world change).
- **Emotional target:** greed (lots of stuff stacked up) shading to dread (it is unstable).

### C7-c · The Hab-Ring (spinning colony)
- **Location:** `zone_charon_colony`, `sector_charon_expanse`
- **Visual:** A 400u-diameter rotating hab-ring — a torus of hab-blocks and greenhouses
  orbiting a central hub via spokes. The whole assembly slowly rotates. The ring's
  outer rim shows wear; the inner rim (facing the hub) is where the greenhouses glow.
  Player can fly through the spokes. **Material_Hull:** civilian off-white.
  **Material_Accent:** greenhouse strips (the only colour). **Material_Emissive:** warm
  grow-lights + the hub's reactor glow. ~13k tris.
- **Backstory:** The ring was the barge's original centrifuge, repurposed when the
  colony needed gravity-grown food. It rotates to this day on its original bearings;
  the colony's engineers consider them sacred.
- **Gameplay interaction:** Trade + scan-lore: each spoke is a neighbourhood; the hub is
  the market. The rotation is a real hazard (collision with the spinning rim). Mission
  giver: colony needs bearings, parts, seeds. A unique quest rewards a greenhouse-grown
  luxury trade good.
- **Emotional target:** awe (a working spinning town).

### C7-d · The Tether Cluster (loose colony on cables)
- **Location:** `zone_charon_colony`, `sector_charon_expanse`
- **Visual:** Not one structure but a cluster of ~12 separate hab-modules (each a 60u
  pod) tethered by long cables to a central anchor-mass, drifting in a loose sphere
  ~300u across. The pods drift and slowly orbit the anchor; cables tension and slack.
  Player flies between pods. **Material_Hull:** pod civilian paint, sun-bleached.
  **Material_Accent:** the cable-tether reels. **Material_Emissive:** pod windows +
  anchor-mass nav lights. ~10k tris across instances.
- **Backstory:** The colony could never agree on a single habitat, so each family-group
  built a pod and tethered it to the shared anchor for air and power. The arrangement is
  democratic and fragile; cables snap in storms and are re-spliced.
- **Gameplay interaction:** Distributed trade hub: each pod buys/sells different goods;
  the player flies pod-to-pod. Mission giver per pod. Encounter: a snapped-cable event
  (a pod adrift) is a rescue mission. Claimable: a player can sponsor a new pod (their
  own storage locker in the colony).
- **Emotional target:** awe (a village of separate homes) shading to mystery.

### C7-e · The Hollow Asteroid (colony dug into rock)
- **Location:** `zone_charon_colony`, `sector_charon_expanse`
- **Visual:** A large 450u asteroid, clearly hollowed — a ring of hab-windows and
  airlock-doors dot its surface, and a big rectangular mining-portal opening on one face
  shows a lit interior space inside. Comms towers and solar arrays bristle on the
  exterior. Player can fly into the portal and dock inside. **Material_Hull:** asteroid
  rock. **Material_Accent:** the welded-on hab-portal frame (civilian metal).
  **Material_Emissive:** the hab-windows and the warm interior glow visible through the
  portal. ~11k tris.
- **Backstory:** The colony abandoned its failing barge and spent three years hollowing
  a nickel-iron asteroid for radiation shielding; the barge's hull was cut up for the
  interior fittings. The colony now considers the asteroid its homeland.
- **Gameplay interaction:** Trade + mission hub inside the asteroid (a small interior
  docking scene). Scan lore: the colony's three-year digging epic. Mission giver. The
  asteroid is claimable as a player headquarters site (P1 §9 ceiling — a real player
  base inside a rock).
- **Emotional target:** greed (a whole asteroid of refined metal) shading to awe.

---

## SLOT 8 — Scarred Battlegroup Wreck-Bazaar  (`poi_kepler_hulk`, `sector_kepler_scar`)

POI name: "Scarred Battlegroup" (west.js:407). Kepler Scar is a tier-3 Reach pirate
haven, palette `fringe`. A dead fleet turned into a market.

### C8-a · The Spine Bazaar (the canonical market-on-a-keel)
- **Location:** `poi_kepler_hulk`, `sector_kepler_scar` (faction `faction_reach`)
- **Visual:** A 600u dead cruiser keel lying horizontal, its interior gutted and replaced
  with a stacked shanty-market: stalls welded along the spine, awnings of salvaged
  hull-plate, neon signs in Reach-red. Small craft dock along the flanks. A hive of
  activity. **Material_Hull:** the dead cruiser's old Concord-grey keel (the irony is
  not lost on the Reach). **Material_Accent:** the market's Reach-red awnings and neon.
  **Material_Emissive:** neon signs + warm market-stall lights. ~14k tris.
- **Backstory:** The Scarred Battlegroup was a Reach fleet that died taking a Concord
  customs station; the survivors built their bazaar in the largest surviving hull. The
  keel has been a market longer than it was a warship. The Scar Bazaar station
  (`station_kepler_scar`) grew up around it.
- **Gameplay interaction:** Black-market trade hub (the bazaar, not the station): better
  prices for contraband, worse for legal goods. Mission giver (Reach). Encounter:
  pickpockets / scams are a small reputation/credit event. Rep-gated: `faction_reach`
  neutral minimum or guns come out.
- **Emotional target:** greed (everything is for sale) shading to dread (it is a pirate market).

### C8-b · The Overlap (overlapping hulls as roofs)
- **Location:** `poi_kepler_hulk`, `sector_kepler_scar`
- **Visual:** Three to four mid-sized wrecked warships (a cruiser, two destroyers, a
  carrier) toppled against each other in a jumble, their hulls forming overlapping
  "roofs" over the market spaces between them. Stalls and tents fill every sheltered
  gap. The player flies under the hull-overlaps. **Material_Hull:** mixed wreck
  liveries (Concord grey, Reach red, civilian). **Material_Accent:** the market tarps
  and lights strung between hulls. **Material_Emissive:** string-lights and stall neon.
  ~13k tris across the wrecks.
- **Backstory:** The battlegroup died in a melee where ships rammed and fell together;
  the Reach realised the jumble made natural shelter and never separated them. Each
  "roof" is a different dead ship and the market sections are named after them.
- **Gameplay interaction:** Multi-market: each "roof" is a different vendor specialism
  (weapons under the cruiser hull, slaves under the carrier hull, data under a
  destroyer). Rep gates per vendor. Hazard: a hull occasionally shifts (collision risk
  in certain sections after random events).
- **Emotional target:** greed shading to dread (the roofs could shift).

### C8-c · The Wreck-Tower (vertical market)
- **Location:** `poi_kepler_hulk`, `sector_kepler_scar`
- **Visual:** A 400u cruiser balanced on its stern, bow upward, converted into a vertical
  market tower — decks as floors, exterior lifts and ladders, stalls on every level,
  neon cascading down the side. A landmark visible across the sector.
  **Material_Hull:** the cruiser's old hull. **Material_Accent:** Reach-red exterior
  market signage. **Material_Emissive:** cascading neon + warm deck-lights. ~12k tris.
- **Backstory:** A dead cruiser was winched upright by the Reach as a deliberate
  spectacle — "we killed this, now we live in it." The verticality became a status
  symbol: the higher your stall, the higher your standing. The top deck belongs to the
  Scar's boss.
- **Gameplay interaction:** Tiered market: better goods higher (locked behind higher
  `faction_reach` rep). The top deck is the boss's — a unique mission giver and the
  payout for the local Reach questline. Encounter: climbing the tower under hostile rep
  means fighting through each level.
- **Emotional target:** greed (the good stuff is at the top) shading to awe.

### C8-d · The Bone-Ring (market in a ring of ship-bones)
- **Location:** `poi_kepler_hulk`, `sector_kepler_scar`
- **Visual:** A ring of standing wreck-keels — eight mid-sized warship hulls buried
  upright in the debris, forming a circular "bone-yard" wall around a central market
  space, ~250u across. The keels lean slightly inward like ribs. The market is inside
  the ring; the player flies in through gaps between the "bones."
  **Material_Hull:** the rusted wreck-keels. **Material_Accent:** market tarpaulins
  strung bone-to-bone. **Material_Emissive:** central market fire-pits (the only warm
  light). ~11k tris across the 8 keels.
- **Backstory:** The battlegroup died in a ring pattern — a defensive formation that
  held to the last. The Reach honoured the dead by leaving the formation in place and
  building the market inside it. Each "bone" is a named ship.
- **Gameplay interaction:** Enclosed market (atmospheric). Each bone-ship has a named
  vendor and a piece of the dead-fleet's lore. Scan the bones for the formation's last
  stand story. Mission giver at the centre. Encounter: the bone-ring is a defensible
  position; Reach ambushes sometimes spawn here against hostile players.
- **Emotional target:** awe (a graveyard repurposed) shading to greed.

### C8-e · The Flight Deck (market on a capsized carrier)
- **Location:** `poi_kepler_hulk`, `sector_kepler_scar`
- **Visual:** A 500u carrier hull lying upside-down, its broad flat flight-deck now
  forming a vast horizontal *ceiling* over the market built on the (former) keel-belly,
  which now faces up. The flight deck's launch-catapults hang down like rails. Market
  stalls cluster on the upturned belly; small craft dock on the edges.
  **Material_Hull:** the carrier's old hull. **Material_Accent:** the launch-catapult
  rails hanging from the ceiling. **Material_Emissive:** market lights on the belly +
  the carrier's old deck-markings still faintly reflective. ~13k tris.
- **Backstory:** The carrier *Void-Reach* was the battlegroup's flagship; it capsized
  on its roof when its launch-bays detonated. The Reach built the market on the
  upturned belly because it was flat and sheltered. The catapult rails are a hazard
  pilots joke about.
- **Gameplay interaction:** Black-market hub with a unique specialism (carrier-grade
  military surplus — rare modules at high prices). Mission giver. Hazard: the hanging
  catapult rails are a collision risk for tall ships. Claimable vendor slot for
  high-rep players (your own stall).
- **Emotional target:** greed (military surplus) shading to awe.

---

## SLOT 9 — Vael Echo Shrine  (`station_phoebe_echo`, `sector_phoebe_echo`)

Station name: "Echo Shrine" (north.js:258), type `research`, Vael, tier-4, palette
`anomaly`. A Vael relic/resonance site that doubles as the sector's research station.
Rep-gated (`repGated: true`).

### C9-a · The Resonance Bowl (the canonical shrine)
- **Location:** `station_phoebe_echo`, `sector_phoebe_echo` (faction `faction_vael`)
- **Visual:** A 300u-diameter shallow bowl-shaped Vael construct, open to the sky, its
  inner surface covered in concentric resonance-grooves that glow teal and pulse outward
  from the centre in slow waves. A small Vael research module sits at the bowl's centre
  on a thin pillar (the dockable station). Player flies over the bowl to dock.
  **Material_Hull:** Vael teal-black organic metal. **Material_Accent:** the polished
  resonance-grooves. **Material_Emissive:** the outward-pulsing teal waves. ~11k tris.
- **Backstory:** The bowl amplifies a faint signal from somewhere very far away — the
  Vael come here to listen. They permit a small Free Frontier research presence because
  the humans' instruments hear something the Vael's do not, and the Vael want to know
  what. The signal repeats every 19 hours.
- **Gameplay interaction:** Rep-gated research station (scan_tech service + missions).
  A unique mission: the player can bring a recording of the signal to other factions
  for competing rewards. Scan lore: the signal's pattern (a quest hook spanning
  sectors). Encounter: Vael defend the shrine against hostile rep.
- **Emotional target:** mystery (something is calling) shading to awe.

### C9-b · The Tuning Forks (paired pillars)
- **Location:** `station_phoebe_echo`, `sector_phoebe_echo`
- **Visual:** Two 450u-tall slender Vael pillars standing parallel ~150u apart, each
  tapered to a fine point, the space between them shimmering with a faint teal resonance
  haze. The research station is suspended between them halfway up by visible energy
  filaments. Player flies between the forks to dock. **Material_Hull:** Vael teal-black.
  **Material_Accent:** the pillar tips (mirror-polished). **Material_Emissive:** the
  resonance haze between them + the station's lights. ~10k tris.
- **Backstory:** The pillars hum at a frequency that induces vivid waking dreams in
  most species; the Vael claim it is the "true name" of a star that no longer exists.
  Long exposure is not recommended for humans; the research station rotates its crew
  every 48 hours.
- **Gameplay interaction:** Rep-gated research station. Hazard: loitering between the
  forks >30s applies a screen-distortion effect (cosmetic + slight sensor blur) — the
  "dream." A unique quest unlocks a Vael attunement that negates it. Scan lore: the
  dead-star name. Mission giver.
- **Emotional target:** dread (it gets in your head) shading to mystery.

### C9-c · The Shard Sphere (resonance via suspended fragments)
- **Location:** `station_phoebe_echo`, `sector_phoebe_echo`
- **Visual:** A 250u central Vael research module surrounded by a 350u-diameter sphere
  of ~60 small free-floating crystal shards, each ~15u, held in spherical formation by
  no visible support. The shards slowly orbit and occasionally chime (visualised as
  brief teal rings emanating from the chiming shard). Player flies through the sphere.
  **Material_Hull:** the central module's Vael teal-black hull. **Material_Accent:** the
  crystal shards. **Material_Emissive:** the chime rings. ~12k tris across shards.
- **Backstory:** The shards are fragments of an older Vael construct destroyed in a
  schism; the shrine holds them in formation as both memorial and instrument. Each shard
  retains a fragment of the old construct's resonance, and together they replay a
  fragmentary song. The Vael come to grieve and to listen.
- **Gameplay interaction:** Rep-gated research station + memorial. Each shard, when
  scanned, gives a fragment of the schism's story (lore — collect-all across many
  visits). Mission giver. A unique high-value quest reconstructs the full song for a
  Vael reward. Hostile-rep players trigger a shard-storm defensive encounter.
- **Emotional target:** awe (a shattered instrument still playing).

### C9-d · The Nautilus (spiral shell shrine)
- **Location:** `station_phoebe_echo`, `sector_phoebe_echo`
- **Visual:** A 400u Vael construct coiled in a logarithmic spiral — a vast nautilus
  shell of dark organic metal, the inner chamber open to space at the spiral's centre
  where the research station sits. The shell's outer face is etched with resonance
  grooves following the spiral curve. Player flies along the spiral channel inward to
  dock. **Material_Hull:** Vael teal-black. **Material_Accent:** the spiral resonance
  grooves. **Material_Emissive:** a teal glow that travels inward along the spiral.
  ~13k tris.
- **Backstory:** The shell's geometry exactly matches a galactic-scale precursor
  structure detected in long-range surveys — at a vastly smaller scale. The Vael
  consider it a "model" of something they cannot name. Humans who study it too long
  report an urge to travel toward a specific star.
- **Gameplay interaction:** Rep-gated research station. The spiral inward is a one-way
  docking channel (must be navigated). Scan lore: the matching-precursor hook (a deep
  mystery questline across multiple sectors). Mission giver. A unique attunement
  reward: the "specific star" becomes a map marker.
- **Emotional target:** mystery (a model of something huge) shading to awe.

### C9-e · The Drip-Tree (inverted resonance)
- **Location:** `station_phoebe_echo`, `sector_phoebe_echo`
- **Visual:** A 500u Vael construct resembling an inverted tree: a central trunk hanging
  point-down from a branched canopy overhead (the canopy is a 200u-wide disc of
  branch-arms), with droplet-shaped resonance pods hanging from the branch-tips. The
  pods slowly migrate outward along the branches and "drip" — releasing a slow-falling
  teal spark that fades before reaching the plane. Research station docked under the
  canopy. **Material_Hull:** Vael teal-black trunk and branches.
  **Material_Accent:** the polished droplet pods. **Material_Emissive:** the dripping
  teal sparks + canopy glow. ~14k tris.
- **Backstory:** The "drips" are a directed signal — not outward, but *downward* into
  the plane, as if signalling something below the galactic plane. The Vael do not
  explain. The Free Frontier researchers set up under the canopy to sample the drips
  and have not yet decoded them.
- **Gameplay interaction:** Rep-gated research station. Hazard: the drips are minor
  energy-discharge hazards to fly through. Scan lore: the "below the plane" hook
  (a deep-lore mystery). Mission giver. Collecting drips (special collector module)
  yields a tradeable resonance-sample good for high Vael rep.
- **Emotional target:** mystery (who is below?) shading to dread.

---

## SLOT 10 — Smuggler Well-Mouth  (`poi_proteus_hulk`, `sector_proteus_well`)

POI name: "Well-Mouth Hulk" (east.js:192). Proteus Well is a tier-3 Quiet sector, palette
`fringe`. The Quiet (violet, smuggler faction) operate here. A hulk used as a
smuggler-gateway.

### C10-a · The Mouth-Arch (the canonical gateway-hulk)
- **Location:** `poi_proteus_hulk`, `sector_proteus_well` (faction `faction_quiet`)
- **Visual:** A 350u gutted freighter hulk, its bow opened up into a broad archway —
  the cargo bay doors permanently retracted — so the hulk reads as a gaping mouth
  leading into a dark interior. Violet Quiet-running lights line the arch's inner edge.
  Small smuggler craft flicker in and out. Player flies through the mouth into a
  concealed interior dock. **Material_Hull:** the hulk's old civilian paint, sun-faded.
  **Material_Accent:** the Quiet violet running lights along the arch.
  **Material_Emissive:** the violet arch-glow + a faint interior welcome-light.
  ~10k tris.
- **Backstory:** The Quiet towed the dead freighter here, gutted it, and rebranded the
  cargo bay as a covert dock accessible only to those who know the approach vector. The
  "Well" is the secrecy itself; "Proteus" is the Quiet codename for the operation. The
  hulk's original name is scratched off.
- **Gameplay interaction:** Black-market dock for `faction_quiet` positive players —
  hidden services (fence, false transponder, contraband missions). Rep-gated. Approach
  vector matters: only revealed by a Quiet contact. Hostile-rep players find only an
  empty hulk (the interior dock cloaks). Encounter: Quiet stealth-ambush on hostile
  scanners inside the mouth.
- **Emotional target:** greed (the good stuff is hidden) shading to mystery.

### C10-b · The Funnel (tapered throat hulk)
- **Location:** `poi_proteus_hulk`, `sector_proteus_well`
- **Visual:** A 400u freighter hulk tapering from a wide bow (200u) down to a narrow
  stern aperture (40u) — a funnel shape — lying stern-toward the player. The whole
  interior is gutted into a single tapered throat; smuggler craft emerge single-file
  from the narrow end. Violet lights march down the funnel's interior.
  **Material_Hull:** the hulk's civilian hull. **Material_Accent:** the funnel interior's
  Quiet violet strip-lighting. **Material_Emissive:** the marching violet lights +
  the narrow stern aperture's glow. ~11k tris.
- **Backstory:** The Quiet deliberately re-shaped the hulk into a funnel to enforce
  single-file traffic — a security measure that also doubles as an ambush chokepoint
  for intruders. The "well-mouth" is the narrow stern; what's inside is for those who
  pass the gate.
- **Gameplay interaction:** Black-market dock. The funnel is a navigational challenge
  (narrow, one-way for large ships) and a defensive chokepoint. Rep-gated services
  inside. Hostile-rep players who enter the funnel are trapped and ambushed.
- **Emotional target:** dread (a throat you have to fly down).

### C10-c · The Cargo Tent (hulk-as-canopy)
- **Location:** `poi_proteus_hulk`, `sector_proteus_well`
- **Visual:** A 300u freighter hulk split lengthwise and propped open like a tent — the
  two hull-halves form a pitched canopy over a market/dock space on the plane below.
  Violet tarps span the gaps. The interior is open-air (no enclosed dock). Player flies
  under the canopy. **Material_Hull:** the two hull-halves. **Material_Accent:** the
  violet Quiet tarps. **Material_Emissive:** market lights under the canopy + a few
  violet running lights on the hull-halves' upper edges. ~10k tris.
- **Backstory:** The Quiet chose an open-air layout for the Well — riskier, but it lets
  the market vanish instantly if a Concord patrol arrives: the hull-halves drop, the
  tarps reel in, and it reads as an ordinary wreck. This has happened four times.
- **Gameplay interaction:** Black-market hub (open-air). Quick-rotating inventory
  (refreshes often — it is meant to be fleeting). Mission giver. The "drop and hide"
  is a real event: occasional Concord patrols force the market to close temporarily;
  timing visits is part of the gameplay. Rep-gated.
- **Emotional target:** greed (fleeting deals) shading to mystery.

### C10-d · The Stern (sinking freighter)
- **Location:** `poi_proteus_hulk`, `sector_proteus_well`
- **Visual:** A 400u freighter whose forward two-thirds has sunk into a dense debris
  field / soft micro-asteroid mass, leaving the stern and engine block sticking up at a
  tilt ~150u above the surface — like a sinking ship half-submerged. The Quiet operate
  out of the raised stern; the sunk bow is the "well" where contraband is hidden below
  the debris surface. **Material_Hull:** the freighter's hull, the submerged portion
  encrusted. **Material_Accent:** the Quiet violet markings on the raised stern.
  **Material_Emissive:** stern engine-glow + violet running lights. ~11k tris.
- **Backstory:** The freighter was scuttled by the Quiet into a debris bog specifically
  to create concealed below-surface storage; the raised stern is the only visible dock.
  Concord patrols scan the surface and find nothing — the goods are physically below the
  debris plane, invisible to standard scans.
- **Gameplay interaction:** Black-market dock at the stern + below-surface salvage node
  (requires a special "debris-penetrating" scan to find). Rep-gated. Mission giver:
  smuggling runs that exploit the below-surface trick. Hostile players must use the
  special scan to even detect the market.
- **Emotional target:** greed (hidden below the surface) shading to mystery.

### C10-e · The Container-Coral (welded-container mass)
- **Location:** `poi_proteus_hulk`, `sector_proteus_well`
- **Visual:** A 250u irregular mass formed of hundreds of standard cargo containers
  welded together over years into a coral-like growth, bristling with antennae and
  sensor-baffling fins. No single "ship" remains — the hulk has been consumed. Interior
  tunnels honeycomb the mass; violet lights leak from gaps. Player flies into the
  tunnels. **Material_Hull:** container off-white, faded. **Material_Accent:** the
  sensor-baffle fins (Quiet-violet). **Material_Emissive:** the violet light-leaks from
  interior gaps. ~12k tris.
- **Backstory:** The Quiet have been adding containers to the mass for decades; it is
  now part dock, part cache, part sensor-baffle. No one — not even the Quiet — has a
  full map of the interior. Lost contraband is simply sealed in and forgotten.
- **Gameplay interaction:** Black-market dock + labyrinthine interior (procedural
  tunnel layout, scan to navigate). Some containers are salvageable (rare goods the
  Quiet forgot they had). Rep-gated. Mission giver. Hazard: getting lost inside costs
  time and oxygen if life-support is a constraint.
- **Emotional target:** greed (forgotten contraband) shading to dread (it is a maze).

---

## SLOT 11 — A Megastructure  (ringworld / Dyson partial — ancient precursor)

These are the "Space Wonders" tier (`SALVAGE_NOTES.md`): precursor-scale structures
that dwarf any faction build. Placed in deep frontier anomaly sectors. All factions
react to them; none claim to have built them.

### C11-a · The Broken Ringworld Arc
- **Location:** `sector_sedna_dark` (Vael tier-4, palette `anomaly`)
- **Visual:** A vast arc of ringworld — a 3000u-diameter ribbon (implied — only a ~60°
  arc survives) standing edge-on to the plane, the ribbon itself ~400u wide. The arc's
  inner face shows the ghost of terrain (rivers, plains) long dead; the outer face is a
  dark structural lattice. The arc casts a real shadow across the sector. Player flies
  under the arc's curve. **Material_Hull:** the ribbon's grey-green dead terrain
  (texture-mapped, low-poly). **Material_Accent:** the structural lattice on the outer
  face. **Material_Emissive:** a few still-powered city-grid lights on the inner face
  (very faint). ~14k tris (mostly LOD-friendly lattice).
- **Backstory:** A precursor civilisation built a ringworld around a star that is no
  longer there; only this arc survived whatever destroyed the rest. The terrain is dead
  but the city-grid lights still cycle on battery power that should have run out
  millennia ago. The Vael permit no landings.
- **Gameplay interaction:** Mystery landmark + scan lore (the city-grid lights spell
  out a precursor script — long questline). A claimable observation post on the outer
  lattice for high-tier players. Hazard: the arc's shadow is a navigation hazard at
  speed. Encounter: Vael patrol this space jealously.
- **Emotional target:** awe (a dead world on a ribbon).

### C11-b · The Dyson Swarm Lattice
- **Location:** `sector_eunomia_gulf` (Vael tier-3, palette `fringe`)
- **Visual:** A cloud of ~40 separate flat mirror-panels, each ~200u across, distributed
  in a loose spherical cloud ~1500u across, slowly orbiting a central point where no
  star is visible (it was the swarm's host). The panels are angled to a long-dead
  calculations. Player flies between them. **Material_Hull:** the panels' mirror-bright
  surface (high reflectivity). **Material_Accent:** the panel-edge frame.
  **Material_Emissive:** none (mirrors reflect the sector palette). ~12k tris across
  instances.
- **Backstory:** A partial Dyson swarm built to power... something... around a star the
  swarm itself consumed or that went nova. The panels still hold their formation by
  mutual gravimagnetic anchor. Whatever they powered is gone. The Vael study the
  anchoring tech; they have not replicated it.
- **Gameplay interaction:** Salvage: each panel yields rare precursor-alloy (limited
  harvest, regenerates very slowly). Scan lore: the anchor-tech hook (a faction-quest
  reward for any faction that gets the data). Hazard: the mirrors reflect lasers
  (combat in the swarm is unpredictable). Encounter: multiple factions send raiders.
- **Emotional target:** greed (precursor alloy) shading to awe.

### C11-c · The Star-Lifter Column
- **Location:** `sector_orcus_shadow` (Quiet tier-3, palette `fringe`)
- **Visual:** A single 2000u-tall vertical column of precursor material rising from the
  plane (which it appears to emerge from) straight up out of the sector — a fountain of
  structured matter. The column is ~150u thick, faintly translucent, with internal
  structure visible (rings, conduits) and a slow upward pulse travelling its length. Its
  top is lost in the sector's fog ceiling. Player flies around its base; the column
  tapers as it rises. **Material_Hull:** the column's translucent precursor material.
  **Material_Accent:** the internal conduit rings. **Material_Emissive:** the slow
  upward-traveling pulse. ~11k tris.
- **Backstory:** A star-lifter — a structure built to lift matter off a star's surface
  into orbit. The star is gone; the column persists, still lifting nothing. The Quiet
  have built their `station_orcus` "Shadow Cache" at its base to study the column's
  impossible persistence. The column's top has never been reached.
- **Gameplay interaction:** Mystery landmark. Scan lore at the base (the Quiet
  research). A unique high-tier quest: a player with the right tech can ride the
  upward pulse a short distance (a scripted vertical traversal) for a unique reward.
  Encounter: Quiet defend the base against hostile rep.
- **Emotional target:** awe (a fountain taller than worlds).

### C11-d · The Shattered Sphere (Dyson sphere fragment)
- **Location:** `sector_haumea_rift` (Free tier-3, palette `anomaly` — note `haumea_rift`
  has an "Ice Fissure" anomaly zone, fitting)
- **Visual:** A single enormous curved plate — a ~1200u-wide fragment of a Dyson sphere's
  shell — drifting through the sector, tilted, its concave inner face catching and
  focusing the faint sector light into a bright caustic. The plate's edges are jagged
  (torn from the rest of the sphere). Player flies around/under the plate.
  **Material_Hull:** the plate's outer shell (grey, scored). **Material_Accent:** the
  inner focusing surface (mirror-polished). **Material_Emissive:** the bright caustic
  hotspot the inner face creates on the plane below it. ~13k tris.
- **Backstory:** One plate of a Dyson sphere that enclosed a star and was destroyed from
  within; this fragment drifted for millennia into Haumea Rift. The focusing caustic is
  so intense it warms the ice-fissure zone below — the only reason anything lives there.
  Free Frontier researchers study the plate; nobody has mined it (the material resists
  everything tried).
- **Gameplay interaction:** Mystery landmark. Scan lore: the sphere's destruction story.
  Environmental hook: the caustic creates a local warm-zone with unique flora trade
  goods below the plate. Hazard: flying into the caustic hotspot is radiation-style
  damage. Claimable observation post on the plate's edge.
- **Emotional target:** awe (a wall that warms a world) shading to mystery.

### C11-e · The Orbital Ring (tethered ring around a dead world)
- **Location:** `sector_triton_wake` (Vael tier-3, palette `anomaly`)
- **Visual:** A 1800u-diameter precursor ring orbiting a dead world (planet body via
  `planetFactory.js`), connected to the planet by ~8 elevator cables spaced evenly. The
  ring is ~80u thick, its outer face bristling with broken precursor machinery. Most
  cables are snapped; two still tether. Player flies between ring and planet.
  **Material_Hull:** the ring's dark structural material. **Material_Accent:** the
  elevator cables (still-taut ones under tension). **Material_Emissive:** faint
  precursor lighting on the ring's inner face + the planet's dead surface below.
  ~14k tris.
- **Backstory:** A precursor space-elevator ring system around a world they were
  strip-mining; the world is now dead and the ring is silent. The two surviving cables
  are under tension that has not decayed — the elevators are stuck partway up, frozen.
  The Vael have a research outpost on the ring.
- **Gameplay interaction:** Mystery landmark + multi-layer scan lore (ring + planet +
  cables). A unique quest: the frozen elevators still contain cargo (reachable via a
  scripted tether-climb). Hazard: the snapped cables drift (collision). Encounter: Vael
  research post is rep-gated.
- **Emotional target:** awe (a ring around a corpse-world).

---

## SLOT 12 — A Natural Anomaly  (wormhole / pulsar / black-hole-adjacent)

Natural phenomena — not built, just there. The game already has wormhole POIs
(`sector_veil_nebula` `poi_wormhole`, gated by `tech:tech_long_range_survey`).

### C12-a · The Accretion Donut (black-hole-adjacent)
- **Location:** `zone_veil_wormhole`, `sector_veil_nebula` (faction `faction_vael`)
- **Visual:** A 400u black sphere (the event-horizon prop) surrounded by a bright
  tilted accretion disc ~800u across — a flat donut of glowing orange-white matter
  whipping around the sphere at impossible speed, lensed into a halo above and below
  the disc by the sphere's gravity (faked with two extra tilted emissive rings).
  Player flies around the disc's outer edge; the sphere occludes stars.
  **Material_Hull:** the black sphere. **Material_Accent:** none.
  **Material_Emissive:** the accretion disc + halo. ~10k tris.
- **Backstory:** A small black hole drifting through the Veil; the Vael use its gravity
  well as a slingshot for their deep-range patrols. The accretion matter is mostly
  stolen from a gas cloud the hole is slowly consuming. The wormhole threshold
  (`zone_veil_wormhole`) is near it — the two phenomena may be related.
- **Gameplay interaction:** Gated by `tech:tech_long_range_survey`. Navigation tool:
  a slingshot maneuver past the disc gives a temporary speed boost (gameplay mechanic).
  Hazard: crossing the disc plane applies shield drain. Scan lore: the wormhole
  relationship hook. Encounter: Vael patrol the disc.
- **Emotional target:** dread (light-eating) shading to awe.

### C12-b · The Lighthouse (pulsar)
- **Location:** `sector_eris_margin` (Quiet tier-3, palette `fringe`)
- **Visual:** A 150u intensely bright neutron-star sphere, oriented so its two polar
  jets sweep the plane like a lighthouse beam — a flat bright plane of light rotating
  around the central sphere once every ~8 seconds. The beam lights up everything it
  sweeps across. Faint violet nebular gas is being pushed outward by the jets.
  **Material_Hull:** the neutron-sphere (intensely bright white). **Material_Accent:**
  the two polar jet-emitter bands. **Material_Emissive:** the sphere + the rotating
  beam plane. ~9k tris.
- **Backstory:** A pulsar whose beam, uniquely, sweeps exactly along the galactic plane
  rather than across it — the odds are astronomical. The Quiet use it as a clock (their
  schedules are kept in pulsar-rotations). Free Frontier navigators use it as a
  lighthouse for the whole region.
- **Gameplay interaction:** Navigation landmark (massive long-range-scan resolution
  boost in the sector). Hazard: the sweeping beam is a radiation-damage plane (timed
  crossings required). Scan lore: the improbable alignment hook. A Quiet contact pays
  for precise beam-timing data.
- **Emotional target:** awe (a clock the size of a sun) shading to dread.

### C12-c · The Iris (wormhole as opening eye)
- **Location:** `zone_veil_wormhole`, `sector_veil_nebula` (faction `faction_vael`)
- **Visual:** A 250u wormhole rendered as an iris — a dark central opening surrounded by
  six overlapping curved "petals" of energised violet gas that slowly open and close
  (a breathing effect, ~30s cycle). When the iris is open, the central opening shows a
  distorted glimpse of another star field (a different skybox sample). When closed, it
  is just gas. Player must enter during the open phase. **Material_Hull:** the petal-gas
  (violet, semi-transparent). **Material_Accent:** the petal edges (brighter violet).
  **Material_Emissive:** the central opening's other-starfield glow. ~11k tris.
- **Backstory:** The Iris is the only known stable wormhole to Ashfall Reach; the Vael
  permit its use only to those with the Long-Range-Survey tech to navigate it. It opens
  and closes on a cycle no one fully understands. What's on the other side has changed
  since the last mapping.
- **Gameplay interaction:** Gated by `tech:tech_long_range_survey`. Travel mechanic:
  jump to Ashfall Reach requires entering during the open phase (timing challenge).
  Mis-timed entry ejects the player violently. Scan lore: the "other side has changed"
  hook. Encounter: Vael control traffic.
- **Emotional target:** mystery (a door that breathes).

### C12-d · The Crackle-Field (magnetar)
- **Location:** `sector_sedna_dark` (Vael tier-4, palette `anomaly`)
- **Visual:** A 100u neutron sphere surrounded by a 600u crackling field of visible
  energy-arcs — jagged bright violet-white lightning leaping between the sphere and a
  cloud of ferromagnetic debris orbiting it. The arcs are constant and chaotic. The
  debris is slowly being crushed into the sphere. **Material_Hull:** the neutron sphere
  + the orbiting debris. **Material_Accent:** the debris's polished metal.
  **Material_Emissive:** the energy-arcs (particle/particle-like shader). ~12k tris.
- **Backstory:** A magnetar — a neutron star with a magnetic field so strong it bends
  light and shreds matter at range. The debris cloud is the remains of three Vael
  research probes that got too close; the field's strength is increasing year over year.
  The Vael have a policy of non-interference and observation.
- **Gameplay interaction:** Hazard zone: the crackle-field disables shields and scrambles
  sensors within its radius. Navigation challenge (a "thread-the-needle" path through
  the debris). Scan lore: the increasing-field hook. Salvage: the crushed debris yields
  rare precursor-alloy (the dead probes' hulls) for high-tier players who can survive the
  field. Encounter: Vael patrol warns players back.
- **Emotional target:** dread (it shreds ships) shading to greed.

### C12-e · The Eddy (binary-star turbulence)
- **Location:** `sector_rhea_cinder` (Choir/DMC tier-3, palette `belt`/`fringe`)
- **Visual:** A 700u-wide turbulent eddy of glowing orange-red plasma — a swirling
  spiral — where the gravitational influence of two nearby stars (off-scene) churns a
  gas cloud into a slow vortex. Bright hot-spots rotate through the spiral. The eddy is
  flat-ish (oriented near the plane) so the player flies around and slightly over it.
  **Material_Hull:** none. **Material_Accent:** none. **Material_Emissive:** the whole
  plasma spiral (a single complex shader). ~9k tris (shader does the work).
- **Backstory:** Two binary stars' combined tidal force stirs a gas cloud into a
  permanent storm; the hot-spots are local fusion events where pressure ignites pockets
  of gas. The Choir consider it a sacred fire and patrol against miners; the DMC
  considers it an unclaimed energy source and patrols to mine it. Both are right.
- **Gameplay interaction:** Hazard (heat damage in the spiral) + resource node (rare
  gas-cloud salvage at the hot-spots). The two factions' overlapping claims make it an
  encounter trigger (Choir vs DMC skirmishes). Scan lore: the sacred-fire / energy-source
  factional tension. A rep-gated observation mission for either side.
- **Emotional target:** awe (a permanent fire-storm) shading to greed.

---

## SLOT 13 — A Faction Capital Landmark  (each major faction's signature structure)

One signature landmark per major faction at their core sector — the structure that
*is* the faction's identity in space. Faction tint flows through `paletteFor`.

### C13-a · The Concord Citadel (Solar Concord Navy)
- **Location:** `zone_helios_core`, `sector_helios_prime` (faction `faction_scn`)
- **Visual:** A 600u octagonal Concord military citadel station: layered armoured plates
  in clean Concord-blue, four massive broadside lance-turrets on rotating mounts at the
  cardinal points, a central flag-tower topped with a holographic Concord sun-emblem.
  Patrolling cruisers dock along its lower ring. Reads as a fortress of order.
  **Material_Hull:** polished Concord-blue plating. **Material_Accent:** white
  institutional striping + brass command-bands. **Material_Emissive:** blue lance-port
  charging lights + the golden sun-emblem holo. ~14k tris.
- **Backstory:** Helios Citadel is the Concord Navy's home anchorage and the seat of its
  high command; the broadside turrets have not fired in 40 years but are kept live. The
  sun-emblem is the largest hologram in core space. Civilian traffic gives it wide berth.
- **Gameplay interaction:** Military-station services (missions, repair, refuel) — the
  sector's existing `station_coalition` is this landmark. Rep-gated (Concord hostile
  players cannot dock). Mission hub for all Concord naval questlines. Scan lore: the
  40-year-peace hook. The lance-turrets are a defensive encounter trigger if the sector
  is ever attacked (future-proofed).
- **Emotional target:** awe (the centre of order).

### C13-b · The Meridian Exchange Spire (Meridian Trade Syndicate)
- **Location:** `zone_tethys_hub`, `sector_tethys_junction` (faction `faction_mts`)
- **Visual:** A 700u-tall single tapering spire of Meridian-gold glass-and-steel, the
  tallest civilian structure in the core — a literal monument to commerce. The spire is
  ringed by ~12 horizontal trading-ring platforms at intervals, each bristling with dock
  gantries and Meridian flags. A slow procession of freighters spirals up and down its
  length. **Material_Hull:** Meridian-gold reflective cladding.
  **Material_Accent:** bright corporate chromium trim. **Material_Emissive:** warm
  internal office-light glow + the gold top-beacon. ~13k tris.
- **Backstory:** The Tethys Exchange Spire is the busiest market in the galaxy and the
  seat of the Meridian Trade Syndicate's board. Every toll collected in Concord space
  flows up this spire. The 12 trading rings represent the original 12 founding houses;
  three are now empty (a story the Syndicate does not tell).
- **Gameplay interaction:** Trade-hub services (the sector's `station_tethys` is this
  landmark). The best commodity prices in the core. Mission hub for Meridian
  questlines. Scan lore: the three empty rings (a corporate-history mystery). A
  rep-gated "board access" mission for high-Meridian players.
- **Emotional target:** greed (the centre of money) shading to awe.

### C13-c · The Drift Crucible (Drift Miners Collective)
- **Location:** `zone_ceres_refinery`, `sector_ceres_belt` (faction `faction_dmc`)
- **Visual:** A 500u-wide industrial foundry complex — the Ceres Refinery expanded to
  capital-landmark scale. A central molten-metal crucible glows orange at the heart of a
  cage of heavy copper-orange industrial truss-work; ore-haulers dock along the rim and
  tip their loads into the crucible; ingots emerge on a conveyor to a fabricator array.
  Smoke and sparks. **Material_Hull:** DMC copper-orange industrial plate, soot-stained.
  **Material_Accent:** bare steel walkways. **Material_Emissive:** the orange crucible
  glow + molten-metal conveyor streaks. ~14k tris.
- **Backstory:** The Drift Crucible is the industrial heart of the Collective — where
  raw belt ore becomes the alloys that build every ship in core space. It runs 24/7 and
  has not shut down in 80 years. The original founders' names are welded into the
  crucible lip.
- **Gameplay interaction:** Refinery services (the `station_ceres` is this landmark).
  Ore-buy and refine services. Mission hub for DMC questlines. Scan lore: the
  founders' names (a labour-history questline). A rep-gated "furnace-hand" mission lets
  high-DMC players run a shift for unique industrial rewards.
- **Emotional target:** awe (the engine of the economy) shading to greed.

### C13-d · The Skerris Throne (Crimson Reach)
- **Location:** `zone_sker_haven`, `sector_sker_haven` (faction `faction_reach`)
- **Visual:** A 600u Reach pirate fortress-citadel built from the welded-together hulls
  of dozens of captured ships — a Frankenstein mass of mismatched naval and civilian
  hulls in Reach-red, bristling with salvaged weapons of every faction's make. A
  massive crude Reach skull-emblem painted on the largest surviving hull face. Reads as
  defiant, violent, improvised. **Material_Hull:** mismatched captured-ship hulls (DMC
  copper, MTS gold, Concord grey — all re-painted red). **Material_Accent:** Reach-red
  overpaint. **Material_Emissive:** red weapon-port charging lights + warm interior
  market glow. ~14k tris.
- **Backstory:** Skerris Deep is the Crimson Reach's capital — a fortress built from
  their own victories, each hull a trophy. The Reach's boss holds court here. It has
  never been successfully assaulted. The skull-emblem is repainted larger after every
  successful raid.
- **Gameplay interaction:** Black-market services (the `station_sker` is this landmark).
  Heavily rep-gated (`repGated: true`). Mission hub for Reach questlines. Scan lore:
  the trophy-hulls (each tells a raid story). Encounter: the skull-emblem grows if the
  Reach completes certain sector events (stateful world change). Hostile players are
  swarmed on approach.
- **Emotional target:** dread (a fortress of captured ships) shading to greed.

### C13-e · The Resonant Cathedral (Ascendant Choir)
- **Location:** `zone_vesta_forge`, `sector_vesta_forge` (faction `faction_choir`)
- **Visual:** A 550u-tall Choir cathedral: twin tapering magenta spires flanking a
  central resonance-arch, the whole structure built in the Choir's organic-curved
  zealot-aesthetic (no straight lines), wrapped in magenta resonance-veins that pulse in
  time with a deep slow harmonic. The structure hums audibly (the game's only diegetic
  sound-from-a-landmark). A small Choir hab clusters at its base.
  **Material_Hull:** Choir magenta-white organic ceramic. **Material_Accent:** the
  darker magenta resonance-veins. **Material_Emissive:** the pulsing veins + a soft
  internal choral-glow. ~13k tris.
- **Backstory:** The Resonant Cathedral is the Ascendant Choir's spiritual seat, built
  in the shadow of the Vesta Forge foundries (where the Choir were first persecuted as a
  cult). The Cathedral's resonance is calibrated to the Forge's old industrial rhythm —
  a statement of survival. Pilgrims come from across Choir space.
- **Gameplay interaction:** Research/station services (the sector's Choir `station_depot3`
  is repurposed into this landmark's base). Mission hub for Choir questlines. Rep-gated
  for non-believers. Scan lore: the persecution-and-survival history. Encounter: the
  Cathedral's harmonic is a defensive weapon — hostile ships inside the arch take shield
  damage from resonance. A unique attunement mission rewards a Choir buff.
- **Emotional target:** awe (a singing cathedral) shading to dread.

---

## SLOT 14 — A Graveyard / Memorial of a Different Historical Event

Each candidate commemorates a *different* historical event from the Pit convoy (slot 3)
and from each other. One per candidate, placed at a real zone.

### C14-a · The Quiessence (the vanished Quiet fleet)
- **Location:** `zone_pallas_drift` `zone_pallas_drift` Hollow Station zone, `sector_pallas_drift` (faction `faction_quiet`)
- **Visual:** 17 freighter hulks floating in tight formation, completely intact — no
  battle damage — but dead, dark, and cold. Each is exactly where it was when its crew
  stopped. A single violet Quiet memorial buoy drifts among them, slowly pulsing.
  **Material_Hull:** civilian hull paint, perfectly preserved. **Material_Accent:** the
  Quiet violet memorial buoy. **Material_Emissive:** the buoy's slow violet pulse (the
  only light). ~9k tris across instances.
- **Backstory:** The Quiessence was a Quiet smuggling fleet of 17 ships that, in the
  middle of a routine run, simultaneously went dark — no distress, no explosion, no
  boarding. Crews were gone, cargo intact, ships undamaged. The Quiet preserve the
  formation as a memorial and a warning. The cause was never determined.
- **Gameplay interaction:** Scan-only lore (a slow-unfolding mystery across 17 ship
  scans). Each ship's black-box yields one fact incompatible with the others. The
  memorial buoy gives the Quiet's only official statement ("they are not dead"). Quest
  hook for a long mystery. Encounter: Quiet defend the formation against boarding.
- **Emotional target:** mystery (17 ships, no cause).

### C14-b · The Pilgrimage Bones (the Vael retreat)
- **Location:** `zone_phoebe_echo`, `sector_phoebe_echo` (faction `faction_vael`)
- **Visual:** ~30 ancient Vael ship-skeletons — not intact hulls, just the bare organic
  rib-frames, stripped of all plating — arranged in a long line pointing toward the Echo
  Shrine, like a processional avenue of bones. The frames are enormous (each ~200u) and
  ancient (material bleached teal-white). Player flies down the avenue to reach the
  Shrine. **Material_Hull:** bleached Vael frame-material. **Material_Accent:** none
  (no plating remains). **Material_Emissive:** faint teal veins in each frame still
  carrying a trace pulse. ~11k tris across the frames.
- **Backstory:** Three thousand Vael years ago, a great pilgrimage stripped their own
  ships of plating (to build the original Echo Shrine) and walked the avenue of bare
  frames toward the Shrine as an act of devotion. The frames were left in place as the
  memorial. The Vael still walk it (in ships) before important ceremonies.
- **Gameplay interaction:** Scan-only lore (the pilgrimage's history). Each frame yields
  a fragment of the pilgrimage's purpose (collect-all). Walking the avenue (slow
  traversal) is itself a Vael-rep gain for devout players. Encounter: Vael guard the
  avenue against non-pilgrims.
- **Emotional target:** awe (a boulevard of bones) shading to mystery.

### C14-c · The Schism Pyre (the Choir martyrs)
- **Location:** `sector_eunomia_gulf` (faction `faction_choir`)
- **Visual:** A single 250u fused mass of partially-melted Choir ship-hulls — the
  residue of a mass immolation — slowly orbiting a still-hot central core. The mass
  glows dull orange-red where the metal fused. Around it, a perfect ring of 40 small
  magenta memorial lights marks each martyr. **Material_Hull:** the fused melted hull
  mass (Choir magenta-black, heat-discoloured). **Material_Accent:** the memorial light
  ring. **Material_Emissive:** the dull core heat-glow + the magenta memorial lights.
  ~10k tris.
- **Backstory:** During the Choir's founding schism, 40 heretics chose mass self-
  immolation rather than recant; their fused ships are preserved as the Schism Pyre, the
  holiest site of the martyred faction. Choir pilgrims add a memorial light each year.
  The core is still thermally hot centuries later — unexplained.
- **Gameplay interaction:** Scan-only lore (the schism's founding story, told from the
  martyrs' side). Each memorial light names a martyr (collect-all). A high-`faction_choir`
  quest grants a "pilgrim's circuit" buff. Encounter: Choir defend the Pyre against all
  others; the unexplained heat is a hazard to close approach.
- **Emotional target:** dread (40 people burned here) shading to awe.

### C14-d · The Mutiny Wrecks (the Reach mutiny)
- **Location:** `zone_kepler_scar`, `sector_kepler_scar` (faction `faction_reach`)
- **Visual:** Six Reach raider hulls in a rough circle, each with a single clean
  execution-shot through the bridge — not battle damage, deliberate kills. They are
  fresh enough to still have Reach-red paint but old enough to be cold and dark. A crude
  Reach-red flag planted at the circle's centre. **Material_Hull:** Reach-red raider
  hulls. **Material_Accent:** the crude flag. **Material_Emissive:** none (deliberately
  dark). ~9k tris.
- **Backstory:** A Reach captain and five ship-leaders tried to reform the Crimson
  Reach into something less predatory; the existing boss had all six bridges shot out in
  a single night and left the wrecks in a circle as a lesson. The flag is replaced when
  it tatters; the lesson is renewed. Reach recruits are shown this place.
- **Gameplay interaction:** Scan-only lore (the reform attempt and its end). A questline
  for players who want to finish what the mutineers started (a Reach reform branch).
  Encounter: Reach patrols attack anyone who lingers (the boss does not want the story
  told). Hostile players, ironically, are safer here.
- **Emotional target:** dread (a circle of executions).

### C14-e · The Armistice Anchor (the Concord-Reach border war)
- **Location:** `zone_io_contest`, `sector_io_reach` (faction `faction_scn` / contested)
- **Visual:** A 200u joint memorial: half the structure is built of Concord-blue
  plating, half of Reach-red, joined down the middle where the two colours interlock —
  a literal seam of two enemies. Two memorial flames (one blue, one red) burn side by
  side at the top. The structure stands on the contested lane itself.
  **Material_Hull:** half Concord-blue, half Reach-red, interlocking at the seam.
  **Material_Accent:** the seam itself (a band of bare steel where the two meet).
  **Material_Emissive:** the twin memorial flames (blue + red, never the same height).
  ~10k tris.
- **Backstory:** The anchor marks the armistice that ended the last Concord-Reach border
  war — the same war that produced the Cruiser Graveyard (slot 1). Both sides maintain
  it jointly; neither will be the one to stop. The two flames are rumoured to flicker
  when one side is planning to break the truce.
- **Gameplay interaction:** Scan-only lore (the border war and the armistice terms). A
  diplomatic questline for players working both sides. Encounter: the zone is contested
  (`zone_io_contest`, patrol presence) — fighting here angers both factions. The
  flicker-flames are a real scripted signal before major faction events (stateful).
- **Emotional target:** awe (two enemies joined) shading to dread (it could break).

---

## SLOT 15 — An Alien / Precursor Ruin Site

Pre-faction precursor sites — older than the Vael, older than the ringworld's builders,
perhaps older than anything. The "alien ruin" tier of mystery.

### C15-a · The Geode Temple
- **Location:** `sector_eris_margin` (Quiet tier-3, palette `fringe`)
- **Visual:** A 300u hollow geode opened to space: a rocky shell with one large aperture,
  the interior lined with enormous violet crystals arranged in deliberate geometric
  patterns — clearly a constructed space, not natural. A central crystal dais holds a
  single carved symbol. The player flies inside through the aperture.
  **Material_Hull:** the rocky shell. **Material_Accent:** the geometric crystal
  arrangement (violet, semi-transparent). **Material_Emissive:** the central dais's
  faint violet glow + the symbol's pulse. ~12k tris.
- **Backstory:** The temple predates the Vael by an estimated 40 million years; its
  crystal arrangement is a star-chart of the galaxy as it was then (verified by stellar
  drift modelling). The central symbol matches no known script. The Quiet study it
  obsessively and have built their Eris Margin operation around it.
- **Gameplay interaction:** Scan-only lore (the 40-million-year-old star-chart — a deep
  mystery). The star-chart, once fully scanned, marks several precursor sites across the
  galaxy (a meta-questline spanning sectors). Encounter: Quiet defend; hostile players
  cannot enter the Quiet-controlled sector easily. A claimable research cache for
  high-tier scans.
- **Emotional target:** mystery (a map of a forgotten sky).

### C15-b · The Star-Chart Menhir
- **Location:** `sector_haumea_rift` (Free tier-3, palette `anomaly`)
- **Visual:** A single 400u tapered standing stone (menhir) of an unknown black-green
  material, its four faces carved with deep grooves that, viewed from directly above,
  form a recognizable star pattern. The menhir stands alone in a clearing in the
  sector's ice-fissure fog. No other structure within 1000u. **Material_Hull:** the
  black-green menhir material. **Material_Accent:** the carved star-pattern grooves.
  **Material_Emissive:** a faint teal glow that fills the grooves at night (sector
  lighting cycle). ~9k tris.
- **Backstory:** The menhir is a single carved star-chart, ~60 million years old, its
  pattern matching no current constellation. Free Frontier researchers discovered that
  the pattern matches the *current* positions of three precursor megastructures
  (including the ringworld arc, C11-a) — implying the carvers knew where those sites
  would be. The implications are uncomfortable.
- **Gameplay interaction:** Scan-only lore (the predictive star-chart hook — ties into
  the slot-11 megastructure questline). The menhir's top-down view requires a high-altitude
  scan (special tech). Encounter: none native — the site is eerily undefended,
  which is itself the unsettling detail. A Quiet broker pays for the pattern.
- **Emotional target:** mystery (someone knew where things would be).

### C15-c · The Tide-Locked Watcher
- **Location:** `sector_triton_wake` (Vael tier-3, palette `anomaly`)
- **Visual:** A precursor construct built on a small dead moonlet (~350u dia): a single
  enormous carved eye-structure on the moonlet's tide-locked face, always pointed at the
  same distant point in space (which is empty). The eye is ~120u across, perfectly
  geometric, the "iris" a slowly rotating ring of dark material. The rest of the moonlet
  is bare rock. **Material_Hull:** moonlet rock + the eye's dark frame.
  **Material_Accent:** the rotating iris ring. **Material_Emissive:** a faint teal
  eye-glow that intensifies if the player flies into the eye's line of sight.
  ~11k tris.
- **Backstory:** The Watcher's eye has been fixed on the same empty point in space for
  ~80 million years; the point is empty now but stellar-drift modelling suggests a star
  was there when the eye was carved. The carvers may have been watching a star that was
  already dying. The eye's glow intensifies for any ship — it is still "looking."
- **Gameplay interaction:** Scan-only lore (the watched-star hook). The intensifying
  glow is a real mechanic: flying into the line of sight applies a "you are being seen"
  effect (slight sensor debuff + a quiet audio cue). A unique quest reveals what the
  carvers were watching for (a deep-time revelation). Encounter: Vael patrol the
  moonlet; they consider the Watcher theirs.
- **Emotional target:** dread (something is still watching).

### C15-d · The Glass Ruin Field
- **Location:** `sector_sedna_dark` (Vael tier-4, palette `anomaly`)
- **Visual:** A 500u field of "glass" ruins — the vitrified remains of an entire
  precursor surface structure, melted into smooth glassy shards and flows by heat beyond
  any weapon's output. The glass is dark teal, semi-transparent, catching the sector's
  faint light. Faint frozen impressions of former structures are visible in the glass
  flows. **Material_Hull:** the dark teal glass (semi-transparent, refractive shader).
  **Material_Accent:** the brighter flow-edges. **Material_Emissive:** a faint internal
  teal glow that pulses very slowly (residual heat, still). ~12k tris.
- **Backstory:** A precursor city was flash-vitrified — melted to glass in an instant —
  by an event that left no crater and no other trace. The glass is still warm to
  sensitive instruments, 100 million years later. Whatever did this is unknown; the Vael
  treat the field as a warning and forbid sampling.
- **Gameplay interaction:** Hazard (the residual heat is a slow radiation-style drain) +
  scan-only lore. Each ruin-shard, scanned, yields a fragment of the former city's layout
  (a slow reconstruction). A unique quest reveals the flash-vitrification was not an
  attack but a deliberate act of the city's inhabitants. Encounter: Vael defend; high-tier
  hostile players can raid for rare vitrified-alloy salvage.
- **Emotional target:** dread (a city melted in an instant) shading to mystery.

### C15-e · The Spore Vault
- **Location:** `sector_nereid_shoal` (Free tier-2, palette `fringe`)
- **Visual:** A 250u precursor vault built as a cluster of seven sealed spherical
  chambers (each ~80u) connected by short corridors, the whole assembly overgrown with
  an unknown deep-violet organic growth — spore-pods the size of small ships cling to
  the exterior and leak a faint violet mist. The chambers are clearly still sealed
  (visible seam-lines); the growth is on the outside only. **Material_Hull:** the vault's
  dark precursor material. **Material_Accent:** the violet organic growth.
  **Material_Emissive:** the spore-pods' faint internal glow + the violet mist.
  ~12k tris.
- **Backstory:** The vault was built to contain something — the spore growth on the
  exterior suggests what — and the seals have held for ~50 million years. The growth is
  the escaped fraction; what remains inside the chambers is contained. Free Frontier
  researchers have not breached a seal. The Vael, unusually, defer to the Free Frontier's
  study here — they do not want the seals broken either.
- **Gameplay interaction:** Scan-only lore (the contained-something hook). The spore
  mist is a hazard (bio-damage to shields). A high-tier questline invites the player to
  decide whether to breach a seal (a major branching choice with faction-wide
  consequences). Encounter: the exterior spore growth defends itself with bio-projectiles
  if attacked. Claimable as a unique salvage site for spore-derived rare goods (without
  breaching).
- **Emotional target:** dread (something is sealed inside) shading to mystery.

---

## End-notes

- **Cross-references:** slot 11 (megastructures) and slot 15 (precursor ruins) are
  designed to share questline hooks — the Star-Chart Menhir (C15-b) predicts the
  ringworld arc (C11-a); the Geode Temple's (C15-a) star-chart marks several slot-11
  sites. A meta-questline could run across them.
- **Slot 13 faction-capital landmarks re-use existing sector stations** (per
  `P1-sector-landmarks.md` §4, `paletteFor` applies faction tint at runtime — so the
  Concord Citadel and the Meridian Spire can each be one GLB that tints correctly across
  the faction's stations if desired, OR bespoke hero assets per the P3 Tier-B faction
  pipeline).
- **Distinct silhouette check (per slot):**
  - Slot 1: split-horizontal / vertical-spike / flat-ring / wedge-in-rock / tangle-ball.
  - Slot 2: tapered-tetrahedron / torus / coral-branches / black-sphere / twin-helix.
  - Slot 3: pylon-column / holographic-convoy / candle-grid / wall-slab / container-wreath.
  - Slot 4: jaw-door / nested-rings / geode-shell / slab-with-holes / inverted-spire.
  - Slot 5: broadside-slab / spinal-cannon / catamaran / dome / ram-bow.
  - Slot 6: toppled-horizontal / folded-umbrella / ring-with-shaft / floating-screw / inverted-table.
  - Slot 7: stacked-cathedral / vertical-tower / spinning-ring / tethered-pods / hollowed-rock.
  - Slot 8: horizontal-keel / overlapping-roofs / vertical-tower / bone-ring / capsized-ceiling.
  - Slot 9: open-bowl / twin-pillars / shard-sphere / nautilus-spiral / inverted-tree.
  - Slot 10: open-arch / tapered-funnel / open-canopy / raised-stern / container-coral.
  - Slot 11: ring-arc / mirror-cloud / vertical-column / curved-plate / planet-ring.
  - Slot 12: black-hole-disc / pulsar-beam / wormhole-iris / crackle-arcs / plasma-eddy.
  - Slot 13: octagonal-citadel / tapering-spire / crucible-cage / welded-mass / twin-spires.
  - Slot 14: intact-fleet / bone-avenue / fused-pyre / execution-circle / bicolour-anchor.
  - Slot 15: crystal-geode / standing-stone / carved-eye / glass-field / spore-spheres.
  No within-slot silhouette collisions.
- **All zone/sector IDs cited above were verified present** in `src/data/sectorZones.js`,
  `src/data/sectors.js`, and `src/data/frontierRegions/{west,north,east,south}.js` as of
  2026-07-12.
- **All material slots** use the P1 §4 convention (`Material_Hull` / `Material_Accent` /
  `Material_Emissive`) so faction tint flows via `paletteFor` without per-faction rework.
- **All tri budgets** fall within the P1 hero-landmark band (8k–15k).
