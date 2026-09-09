# Examples E & F — Distinctive Planet States + Faction/Situation Props

> Creative-concept pool for SpaceFace (semi-3D top-down space sim, y=0 XZ plane).
> Extends `src/render/planetFactory.js` (9 existing backdrop types: terran, oceanic,
> gas_giant, arid, rocky, ice, lava, dead, scorched) and `src/render/partsLibrary.js`
> (PLACE_FILES register, ~13 existing dressing props placed by the four palette-class
> dressing functions in `src/systems/world.js`: `_spawnCoreDressing`,
> `_spawnBeltDressing`, `_spawnFringeDressing`, `_spawnAnomalyDressing`).
>
> Reference points used throughout:
> - **Faction tints** resolve via `FACTION_PALETTES` → `Material_Hull` = primary/hull,
>   `Material_Accent` = accent, `Material_Emissive` = emissive. The 8 gameplay factions:
>   `faction_scn` (Solar Concord Navy, blue #3A78FF, lawful), `faction_mts` (Meridian
>   Trade Syndicate, gold #F2B233, corporate), `faction_dmc` (Drift Miners Collective,
>   copper #C9772E, blue-collar), `faction_reach` (Crimson Reach, red #D8334A, pirate),
>   `faction_quiet` (The Quiet, violet #7A5FB0, smuggler), `faction_vael` (The Vael,
>   teal #2FCFA0, xenophobic alien), `faction_free` (Free Frontier, cyan #4ECBE0,
>   independent — the player), `faction_choir` (Ascendant Choir, magenta #E85FD0, zealot).
> - **Palette classes** drive the four dressing functions: `core` (cyan/blue, SCN/MTS
>   space), `belt` (orange, DMC space), `fringe` (red, Reach/Quiet frontier),
>   `anomaly` (purple/green, Vael/Choir rim).
> - **Real sector IDs**: core sectors `sector_helios_prime` (tier 0), `sector_ceres_belt`
>   (t1), `sector_tethys_junction` (t1), `sector_vesta_forge` (t1), `sector_pallas_drift`
>   (t2), `sector_io_reach` (t2), `sector_charon_expanse` (t2), `sector_sker_haven` (t3),
>   `sector_veil_nebula` (t3), `sector_ashfall_reach` (t4); frontier sectors
>   `sector_nereid_shoal`, `sector_proteus_well`, `sector_triton_wake` (east),
>   `sector_rhea_cinder`, `sector_haumea_rift`, `sector_eris_margin`, `sector_phoebe_echo`
>   (north), `sector_eunomia_gulf`, `sector_sedna_dark`, `sector_dione_lane` (south),
>   `sector_nyx_march`, `sector_hyperion_cut`, `sector_kepler_scar`, `sector_orcus_shadow`
>   (west).
> - **Planet body placement** lives in `buildSectorBodies` (planetFactory.js): planets
>   are parallax backdrops at 2800–5000 units, radius 200–650, drawn from
>   `PLANET_TYPES_BY_TIER`. The states below are **state overlays / new variants** on
>   that pipeline — visible-from-orbit story anchors, NOT landing content (y=0 plane).
> - **Tri budgets** (per P1 spec): landmarks 8–15k tris, props 1–3k tris.
> - **No first-person/interior elements** — non-diegetic HUD only.

---

## CATEGORY E — DISTINCTIVE PLANET STATES (8 slots × 5 = 40 concepts)

These are visible-from-orbit visual story anchors. Each extends `planetFactory.js` as
either a new planet-type variant in `PLANET_COLORS` / `PLANET_TYPES_BY_TIER`, or a
**state overlay** — a second shader pass / child mesh layered onto an existing body via
`buildSectorBodies` (which already stacks an atmosphere shell as a child of the planet
mesh, so the pattern is proven). States are selected per-sector by a new `planetStates`
table or by POI hooks, so a sector can opt into "this world is the cracked one."

Implementation note shared by all 40: the state contributes an extra `bodies.push({...})`
child to the planet mesh and, where the planet emits on the player's scanner, a
`scannerSignal` field read by the scan system. All shader work reuses the existing
`uSunDir`, `uTime`, `uSeed` uniforms already wired into `PLANET_FRAG`.

---

### SLOT E1 — Cracked / blown-apart world (cataclysmic: fractured shell, exposed mantle)

**E1-a · Shatterstone**
- **Visual:** An `IcosahedronGeometry` shell with a normal-mapped fracture web; radial
  cracks glow magma-orange along the terminator via an emissive `uCrackGlow` uniform
  (additive, reusing the `ATMSHELL_FRAG` blending trick). A jagged wedge is geometrically
  absent — a "bite" — revealing a darker subsurface disk behind the planet's silhouette.
  Atmosphere shell halved; a thin debris ring of 40 instanced rock shards orbits at 1.4×.
- **Cause:** A planet-cracker overload. The Drift Miners hit a volatile mantle pocket on
  what was a `rocky` world; the blast is still venting centuries later. DMC survey beacons
  ring the debris field, marking it as their catastrophic loss.
- **Gameplay signal:** Scanner emits a pulsing DMC distress signature; loot hint = rare
  `ast_rare_exotic` shards in the orbital debris ring (ties to `f_charon_*` exotic fields).
- **Where:** `sector_charon_expanse` (the belt's deep-mining edge), `sector_proteus_well`.

**E1-b · Cleft World "Gannymede's Wound"**
- **Visual:** A clean equatorial split — two hemispheres held 60 units apart by glowing
  cyan strut-work (SCN blue), the gap lit from within by a faint corona. Read as a world
  that cracked but didn't die. Struts are a low-poly torus-knot child mesh.
- **Cause:** A Concord prototype "stress-stabilizer" arrested the planet's tidal breakup
  mid-fracture — a propaganda monument as much as a salvage site. SCN engineering corps
  keeps a picket there.
- **Gameplay signal:** Blocks deep scan (the stabilizer field scatters probes); the
  cleft itself reads as a neutral faction_unknown signature. Story hook for "what broke
  it."
- **Where:** `sector_tethys_junction` (core, SCN showcase), `sector_helios_prime` (tutorial
  horizon — visible from spawn as a mystery).

**E1-c · Mantleblight**
- **Visual:** A `dead`-palette planet whose entire northern hemisphere is gone, exposing a
  raw glowing mantle that pulses slowly with `uTime`. No atmosphere shell; instead a
  black-soot particulate skirt (additive dark particles) drifts off the wound. The
  remaining shell is pocked and grey.
- **Cause:** Weapons test. Nobody claims it. The Choir blame the Vael; the Vael say it
  predates them. The wound is geologically fresh — centuries, not millennia.
- **Gameplay signal:** Emits a "forbidden" scan flag — surveying it triggers a Choir or
  Vael warning depending on player rep. No loot, just dread and a lore hook.
- **Where:** `sector_eris_margin`, `sector_sedna_dark` (deep, uncharted, plausible for a
  war crime).

**E1-d · Hollowed Rind**
- **Visual:** A gas-giant-sized shell with a single crater-puncture on the dark side; the
  sunlit limb shows the shell is *thin* — a backlit fresnel reveals hollow space behind it
  (inverted atmosphere shell, rendered front-side, faint interior glow). Surface banding is
  faded `gas_giant` palette.
- **Cause:** Precursor mining operation that stripped the gas giant's core and left the
  envelope. Whoever did it is long gone. The hole is the exhaust port.
- **Gameplay signal:** Deep-scan returns an "anomalous mass: near-zero" reading (a gas
  giant that weighs almost nothing). Strong precursor-tell for the megastructure slot.
- **Where:** `sector_orcus_shadow`, `sector_phoebe_echo`.

**E1-e · Glassed Verge**
- **Visual:** A former `terran`/`oceanic` world whose surface has been fused to a dark
  glass — high specular reflection band, no cloud cover, no city lights (`uCity` zeroed).
  Cracks across the glass glow a faint sickly green where the crust still cools. A single
  orbital mirror-shard field catches the sun.
- **Cause:** Orbital bombardment by energy weapon — the green glow is contaminated silicate.
  This is what the Crimson Reach did to a Meridian colony world during the Toll War.
- **Gameplay signal:** Emits a faint MTS mayday ghost (a looped distress call decades old);
  Reach ships avoid it (their own ghosts). Loot hint = black-box recorder in orbit.
- **Where:** `sector_pallas_drift` (MTS/Reach contested fringe), `sector_nyx_march`.

---

### SLOT E2 — Burning / lava world (active catastrophe, not just "lava type")

The existing `lava` type is a baseline hot world. These are worlds *on fire* — ongoing
catastrophe with motion, smoke, and a story.

**E2-a · Pyre World "Vesta's Burn"**
- **Visual:** A `lava` body with an animated fire-front shader: a second fbm octave in
  `PLANET_FRAG` scrolls burning bands across the day side (`uTime * 0.02`), and a sooty
  black cloud-band overtakes the normal cloud layer. Atmosphere shell pushed to deep
  orange-red, intensity 1.4. Occasional bright flare-spikes (procedural, seeded).
- **Cause:** A runaway atmo-ignition after the Forge foundry's exhaust array misfired into
  a methane-rich atmosphere. It's been burning for a generation; DMC denies fault.
- **Gameplay signal:** Scanner emits a heat-plume hazard flag — flying close in the XZ
  plane applies a thermal damage tick (reuses hazard-zone system). Salvage = refined alloys
  in the cinders.
- **Where:** `sector_vesta_forge` (DMC industrial home — visible from the Forge foundry
  station), `sector_rhea_cinder`.

**E2-b · Cinderfall**
- **Visual:** An `arid`/`scorched` world trailing a comet-like tail of glowing ejecta away
  from the sun (a particle child mesh oriented along `-uSunDir`). The day side is molten,
  the night side is ash. The tail drifts slowly.
- **Cause:** The planet is being ablated by a too-close, too-hot star in a destabilized
  orbit — a slow death visible in real time. Surveyors come to watch it go.
- **Gameplay signal:** The tail is a soft radiation hazard in a cone; the planet itself
  emits a "stellar decay" research signal (Free Frontier science interest). Loot = exotic
  volatiles scooped from the tail.
- **Where:** `sector_rhea_cinder` (named for this), `sector_triton_wake`.

**E2-c · Ember Core**
- **Visual:** A `rocky` shell with a single colossal caldera glowing white-hot at one pole,
  venting a slow plasma plume (cylinder of additive particles) into the orbital plane.
  Cracks radiate from the caldera across the whole disk. No atmosphere.
- **Cause:** Not natural — something punched through the crust from *below*. The plume is
  consistent with a Vael "deep-seed" device, though they won't confirm it.
- **Gameplay signal:** Emits a Vael-coded low-frequency signal; high Vael rep = scan reveals
  tech, low rep = hostile patrol spawns. Strong precursor/bio-faction ambiguity.
- **Where:** `sector_ashfall_reach` (Vael home), `sector_haumea_rift`.

**E2-d · Smoldering Husk**
- **Visual:** A `dead` world that isn't fully dead — the fractures between plates glow a
  sullen red, pulsing on a ~30s cycle (`uTime` sine). Wisps of gas escape the brightest
  cracks. The disk reads as "cooling, not cold."
- **Cause:** The corpse of a Shatterstone event — a world that cracked, vented, and is now
  slowly freezing from the inside out. The glow is the last of its core heat.
- **Gameplay signal:** Neutral survey signal; the pulse is a timing puzzle (scan during the
  bright phase for telemetry). Ties E1 and E2 together as a lifecycle.
- **Where:** `sector_charon_expanse` (paired with Shatterstone), `sector_eunomia_gulf`.

**E2-e · Ashveil World**
- **Visual:** A former `terran`/`oceanic` world entirely shrouded in a thick, churning ash
  cloud layer (cloud amount maxed, cloud color near-black, low albedo). Fires flicker
  through gaps — points of orange light visible only on the night side. Atmosphere shell
  dim and brown.
- **Cause:** Impact winter after a moon-sized body struck. The surface is unreachable; the
  fires are the biosphere burning itself out under the shroud.
- **Gameplay signal:** Blocks *all* surface scan (the ash is opaque); only the impact crater
  rim pings. Story hook = the missing moon, somewhere in the sector as a debris field.
- **Where:** `sector_io_reach`, `sector_kepler_scar`.

---

### SLOT E3 — Ringed hazard world (minable rings, but dangerous: debris + radiation)

Gas giants already exist; this adds a **dangerous ring system** as a child ring mesh +
hazard zone, sized to the planet.

**E3-a · Razor-ring World**
- **Visual:** A `gas_giant` with a bright, dense ring of instanced shard geometry (ring at
  1.6–2.2× radius, ~200 instances). Ring rotates with `uTime`. The ring material is highly
  specular (icy/mineral). Subtle cyan radiation aurora at the poles.
- **Cause:** A pulverized ice moon — the richest crystalline deposit in the sector, but the
  ring is a high-velocity debris field. DMC runs crewed cuts here despite losses.
- **Gameplay signal:** Ring = minable (`ast_crystalline` yield, high); crossing the ring
  plane applies collision/kinetic damage; aurora = radiation hazard tick. The combination
  forces a real flight path decision.
- **Where:** `sector_vesta_forge` (`f_vesta_3` crystalline field is already lore), `sector_charon_expanse`.

**E3-b · Glowing Band World**
- **Visual:** A `gas_giant` ringed by a single thin, intensely emissive ring (teal/choir
  magenta, additive) that pulses. The ring isn't debris — it's a coherent energy phenomenon
  caught in orbit. The planet's atmosphere shell is tinted to match.
- **Cause:** A captured exotic-matter stream — the Choir believe it's a relic of the
  precursor network still functioning. Mining it pays well but the radiation is severe.
- **Gameplay signal:** Ring = `ast_rare_exotic` mini-loot; the pulse syncs with a radiation
  burst — mine in the lulls or take shield damage. Choir-coded scan signal.
- **Where:** `sector_vesta_forge` (Choir outpost), `sector_veil_nebula`.

**E3-c · The Crown of Thorns**
- **Visual:** A `rocky`/`dead` world ringed by a chaotic, *non-planar* debris torus — ring
  tilted ~40°, patchy, with larger jagged boulders (8–12 hero shards). Reads as a recent,
  violent ring formation. Faint red hazard glow along the ring plane.
- **Cause:** A recent planetary defense action: the ring is the shattered remains of an
  invading Reach fleet and the moon-base they destroyed. Still settling.
- **Gameplay signal:** Salvage (wreck loot) *and* kinetic hazard; the boulders are moving.
  Emits a mixed Reach/unknown signal. Bounty hook: the flagship's black box is in the ring.
- **Where:** `sector_sker_haven` (Reach home), `sector_io_reach`.

**E3-d · Halo World**
- **Visual:** A large `ice` world with a pristine, wide, faintly-glowing ring (low albedo,
  high scattering) that catches the sun as a bright arc — a winter crown. Calm, cold,
  beautiful. Ring particles are fine (dust-like, dense instances).
- **Cause:** Primordial and undisturbed — the one ringed world in the sector that *isn't* a
  hazard, but the navigation is tricky (wide ring = long detour). A quiet contrast piece.
- **Gameplay signal:** Low-hazard ring, minable for water/ice (`ast_icy` yield); navigation
  marker, not a danger. Good mining for new pilots.
- **Where:** `sector_pallas_drift` (`f_pallas_*` icy fields), `sector_eunomia_gulf`.

**E3-e · Rad-belt World**
- **Visual:** Any base planet (usually `rocky` or `dead`) enveloped in a visibly crackling
  radiation torus — a bright magenta/cyan particle band at the magnetic equator, auroras at
  both poles, and a faint geometric "exclusion zone" wireframe ring at the hazard radius
  (non-diegetic HUD cue but rendered in-world).
- **Cause:** A magnetically-trapped charged-particle belt from a magnetar encounter or a
  wrecked reactor in orbit. Ships that linger fry.
- **Gameplay signal:** Hard radiation hazard tick inside the belt ring; the wireframe is the
  scanner's safety boundary. Loot (reactor salvage) sits *inside* the belt — risk/reward.
- **Where:** `sector_charon_expanse` (already has a radiation hazard), `sector_nyx_march`.

---

### SLOT E4 — Dyed / claimed world (terraformed or faction-marked: faction palette)

A faction has stamped this world with its colors. This is the cleanest place to exercise
the Material faction-tint convention at planet scale.

**E4-a · Concord Blue**
- **Visual:** A `terran` world whose continents, oceans, and atmosphere shell have been
  retuned to the SCN palette: deep blue landmasses, cyan oceans, blue rim, and the
  city-lights (`uCity`) arranged in a geometric grid pattern (modified `cities` fbm with a
  lattice mask). A faint SCN chevron sigil glows on the sunlit hemisphere.
- **Cause:** A fully terraformed SCN colony world — engineered climate, engineered
  population centers. The grid-of-lights is the tell: this is planned, not grown.
- **Gameplay signal:** Emits a strong SCN territorial signal; high SCN rep = friendly
  traffic, low rep = customs scan/harassment. The chevron is the "you're in SCN space" sign.
- **Where:** `sector_helios_prime`, `sector_tethys_junction`.

**E4-b · Meridian Gold**
- **Visual:** An `arid`/`terran` world tinted to MTS gold/amber — fields of gold (literal
  engineered grain biomes), amber oceans (mineral-rich), gold atmosphere rim. The
  city-lights form trade-route lines between bright hubs. A massive orbital ring-station
  child mesh (MTS gold) circles it.
- **Cause:** A corporate agri-world. Meridian terraformed it for export agriculture; the
  gold is the engineered crop cover seen from orbit. The orbital ring is the elevator hub.
- **Gameplay signal:** MTS commerce signal; high MTS rep = better commodity prices in the
  sector. The ring is a navigation landmark.
- **Where:** `sector_tethys_junction`, `sector_pallas_drift`.

**E4-c · Reach Scrawl**
- **Visual:** A `rocky`/`dead` world whose surface is covered in enormous painted tags —
  the Crimson Reach sigil, skull glyphs, kill-tallies — rendered as a decal layer over the
  base texture, emissive in Reach red. Crude, aggressive, faction-coded graffiti at
  planetary scale. Atmosphere shell tainted red.
- **Cause:** A claimed pirate trophy world. Every fleet that passes paints its tag; the
  biggest tags are legendary captains. It's a challenge board as much as a claim.
- **Gameplay signal:** Reach territorial signal; entering the sector triggers a bounty
  challenge (a named ace comes to defend the tag). The tags themselves are the loot table
  clue (biggest tag = biggest bounty).
- **Where:** `sector_sker_haven`, `sector_ashfall_reach`.

**E4-d · Choir Veil**
- **Visual:** A world (any base) wrapped in a luminous Choir-magenta lattice — a visible
  energy grid covering the sunlit hemisphere, glowing nodes at intersections, magenta
  atmosphere shell. The lattice slowly rotates. The surface underneath is dimmed.
- **Cause:** A Choir "sanctified" world — the lattice is a worship-array, a planetary-scale
  reliquary. Nonbelievers are warned off; the grid is also a weapons grid.
- **Gameplay signal:** Choir-coded; low Choir rep = the lattice fires (defense platform),
  high rep = sanctuary and repairs. Strong "zealot territory" tell.
- **Where:** `sector_vesta_forge` (Choir outpost), `sector_veil_nebula`.

**E4-e · Vael Bloom**
- **Visual:** A `terran`/`oceanic` world retuned to Vael teal-green: bioluminescent
  continent-cover (organic, swirling patterns rather than geometric), teal oceans, green
  atmosphere rim. The night side glows in slow organic pulses — not city grids, living
  cover. Reads as alien even though it's a human-type world.
- **Cause:** A Vael-seeded biosphere world — they terraformed it with their own biology.
  The glow is the alien ecosystem respiring. Humans find it deeply unsettling.
- **Gameplay signal:** Vael territorial signal; the pulse syncs with bio-scan telemetry.
  Strong infested-world ambiguity (bridges E4 and E6).
- **Where:** `sector_ashfall_reach` (Vael home), `sector_haumea_rift`.

---

### SLOT E5 — Shrouded / nebula-veiled world (mystery: half-hidden by local nebula)

The world is partially obscured by a local nebula cloud — a foreground additive cloud
mesh child between camera and planet, plus a shader-driven surface occlusion.

**E5-a · The Veiled Sister**
- **Visual:** A `terran`/`oceanic` world half-eaten by a drifting purple-magenta nebula
  cloud (an additive billboard cloud mesh, anomaly palette). The cloud rotates slowly
  across the disk; through the thin parts you glimpse continents, through the thick parts
  nothing. The atmosphere shell glows faintly through the cloud.
- **Cause:** The planet sits inside a nebula remnant. It's charted but never surveyed —
  the cloud scatters every probe. Scanners say it's inhabited. Nobody knows by what.
- **Gameplay signal:** Blocks deep scan intermittently (the cloud's drift creates scan
  windows); emits an unidentified biosphere signal during the windows. Pure mystery hook.
- **Where:** `sector_veil_nebula` (named for this), `sector_ashfall_reach`.

**E5-b · Smokescreen World**
- **Visual:** A `rocky` world actively venting a thick grey-white particulate plume from
  multiple surface points — the plumes merge into an orbital haze that hides the lower
  third of the disk. The haze catches sunlight (bright top, dark underside).
- **Cause:** A Quiet-faction black-site — the "smoke" is industrial exhaust deliberately
  masking the surface operations. The Quiet neither confirm nor deny it's theirs.
- **Gameplay signal:** Quiet-coded faint signal; scan returns corrupted/stripped data.
  High Quiet rep = a contact offers the real survey data for a price.
- **Where:** `sector_pallas_drift`, `sector_io_reach` (Quiet home sectors).

**E5-c · The Eclipse**
- **Visual:** A world permanently backlit by a too-close binary companion — only a thin
  bright crescent and a massive corona halo are visible; the disk is dark silhouette. The
  corona is a large additive ring child mesh, flickering. No surface detail resolves.
- **Cause:** Tidally locked in a binary, permanently in eclipse from the viewer's approach
  angle. What's on the surface is unknowable from this side. A navigation hazard (the
  companion star).
- **Gameplay signal:** No scan (no line of sight); companion star = radiation/thermal
  hazard on the lit side. Story hook = "go around" or get a different observation angle.
- **Where:** `sector_triton_wake`, `sector_dione_lane`.

**E5-d · The Shroud**
- **Visual:** A `dead` world inside a *perfect* sphere of opaque black dust — only the
  faint fresnel atmosphere rim betrays a planet is there at all. The dust sphere rotates
  with a faint swirl. Reads as a "missing" planet on the scanner until you're close.
- **Cause:** Artificial occlusion — someone wrapped the planet in a dust shell to hide it.
  The dust is uniform, not natural. Precursor or Quiet work; the planet inside is intact.
- **Gameplay signal:** On scanner the planet reads as a void/anomaly, not a body — until
  close. The dust shell is a mild sensor-debuff zone. Strong "hidden thing" hook.
- **Where:** `sector_sedna_dark` (named for darkness), `sector_orcus_shadow`.

**E5-e · Mistmeridian**
- **Visual:** A `gas_giant` whose upper atmosphere has condensed into a glowing fog-belt
  at the equator — a bright luminous ring of mist around the planet's middle, the poles
  clear above and below. Anomaly-palette teal/magenta mist, additive, drifting.
- **Cause:** A phase-transition phenomenon — the gas is condensing into a plasma mist at
  that latitude. Beautiful, anomalous, and slightly radioactive.
- **Gameplay signal:** The mist belt is a soft scan-debuff and mild radiation; skimming it
  yields exotic gas (`ast_gas_cloud`). Research signal (Free Frontier interest).
- **Where:** `sector_veil_nebula`, `sector_phoebe_echo`.

---

### SLOT E6 — Infested / organic world (alien life covering the surface — Vael/bio-faction tell)

Organic, *growing* cover — visibly alive, animated, coded to Vael/choir/anomaly palette.

**E6-a · The Bloom**
- **Visual:** A `rocky`/`dead` world whose surface is being consumed by a spreading teal
  organic mat — an animated growth-shader (a third fbm octave that expands over `uTime`,
  scaled to days). Where the mat meets rock, glowing vein-lines pulse. Spores drift off
  the day side as a faint particle plume.
- **Cause:** A Vael biological seed, mid-infestation. They seeded this world a century ago
  and the bloom is on schedule. The rock beneath is being digested.
- **Gameplay signal:** Vael bio-signal, intensifying over time; spore plume = mild bio
  hazard. Strong "this world is being eaten" read.
- **Where:** `sector_ashfall_reach` (Vael home), `sector_haumea_rift`.

**E6-b · Hivecarapace**
- **Visual:** A `terran` world where the continents have been replaced by a dark
  chitinous hive-structure — hexagonal cells visible at the terminator, glossy black-green,
  with glowing magenta vents. No oceans (drained into the hive). No city grid; the vents
  are the lights.
- **Cause:** Total biological conversion. Whatever lived here built over everything; the
  original biosphere is gone. The Vael disown it — it's not theirs, it's something else's.
- **Gameplay signal:** Anomalous bio-signal, *not* Vael-coded (unknown); high danger flag.
  Loot hook = the original inhabitants' archive, entombed.
- **Where:** `sector_veil_nebula`, `sector_eris_margin`.

**E6-c · Spore-ring World**
- **Visual:** An `ice`/`gas_giant` world with a ring made not of rock but of drifting
  spore-pods — soft glowing teal ellipsoidal instances, organic, pulsing. The ring is
  faintly luminescent and drifts in a slow breathing rhythm.
- **Cause:** A seeded biosphere that escaped the planet and went orbital. The pods are
  dormant, waiting for a new world. Harmless unless one bursts near a hull.
- **Gameplay signal:** Bio-signal ring; mini-loot (exotic organics) if scooped; small bio
  hazard if a pod ruptures on approach. Gentle, eerie.
- **Where:** `sector_veil_nebula`, `sector_proteus_well`.

**E6-d · Mycelia**
- **Visual:** A `dead` world whose entire dark side glows with a vast mycelial network —
  branching luminous teal filaments visible only where the sun *isn't*. The day side looks
  dead; the night side is a glowing brain. No atmosphere shell.
- **Cause:** A subterranean organism that only shows itself in the cold. The planet isn't
  dead — it's *occupied*. Day-side scans say "dead world," night-side scans say otherwise.
- **Gameplay signal:** Scan result flips with day/night cycle (unique mechanic); the
  night-side signal is a precursor/bio anomaly. Story hook for what it's thinking.
- **Where:** `sector_sedna_dark`, `sector_orcus_shadow`.

**E6-e · The Grip**
- **Visual:** A `gas_giant` with enormous tentacular bio-structures wreathing the upper
  atmosphere — vast dark tendrils trailing through the cloud bands, glowing nodes along
  their length. The tendrils drift and flex slowly. Reads as something *holding* the planet.
- **Cause:** A sky-lifeform that wraps gas giants to feed. Not Vael, not Choir — a true
  alien. The tendrils are its feeding appendages. It's been there longer than any faction.
- **Gameplay signal:** Massive unknown bio-signal; no loot (the lifeform is the loot, if
  you can scan it). Awe-tier landmark.
- **Where:** `sector_veil_nebula`, `sector_phoebe_echo`.

---

### SLOT E7 — Dead / silent world (no signals — eerie, story-hook for what killed it)

Distinct from the `dead` *type* (a palette). These are worlds that *should* emit and
don't — the silence is the story.

**E7-a · The Hush**
- **Visual:** A `terran`/`oceanic` world, fully intact, city lights intact... but the lights
  are frozen, not pulsing. No cloud drift (`uTime` decoupled from clouds). No atmosphere
  shell motion. A single dark ring of debris orbits. Everything is *still*.
- **Cause:** Every signal stopped at the same instant. The cities are there, undamaged,
  unpowered. No bodies detected (because no scan can resolve them). The debris ring is the
  comm-satellite constellation, also dead.
- **Gameplay signal:** Emits *nothing* — a scanner void where a world should ping. This
  absence is itself the signal. Strongest story hook in the set.
- **Where:** `sector_eunomia_gulf`, `sector_dione_lane`.

**E7-b · The Hollow Signal**
- **Visual:** A `rocky` world with a single bright automated beacon on the surface, flashing
  on a loop. Nothing else. The beacon is the only light; the rest is dark. No atmosphere.
- **Cause:** A lonely autopilot beacon, still running, marking a world where everyone died
  or left. The beacon's loop contains a fragment of the last transmission, if you scan long
  enough.
- **Gameplay signal:** Emits only the beacon ping; scanning it over time reveals a lore
  fragment (the story of what happened). A slow-burn discovery.
- **Where:** `sector_charon_expanse`, `sector_nyx_march`.

**E7-c · Blackglass**
- **Visual:** A `scorched` world pushed further — pure black, near-zero albedo, no features
  except a faint geometric pattern (city grid, fossilized under the glass) visible only at
  the sharpest terminator angle. Swallows light. Reads as a silhouette.
- **Cause:** Not burned — *absorbed*. Something took the light and the signals and the
  people. The geometry underneath is the only proof it was ever inhabited.
- **Gameplay signal:** Absorbs scans (negative signal — scanner reads quieter near it);
  the geometric pattern is a scan-puzzle (align to read). Eldritch hook.
- **Where:** `sector_eris_margin`, `sector_kepler_scar`.

**E7-d · The Mass Grave**
- **Visual:** A `dead` world orbited by a *vast* debris field — not rocks, but ships.
  Thousands of derelict hulls, all aligned, all silent, drifting in the same orbit. The
  planet below is unremarkable. The fleet is the corpse.
- **Cause:** A battle that ended with everyone dead and no victor — or a rendezvous where
  every ship died simultaneously. The ships are from every faction. Nobody claims them.
- **Gameplay signal:** Massive salvage *and* massive silence; the derelicts emit nothing.
  Each faction disavows their hulls. Deep lore hook (what killed a multi-faction fleet?).
- **Where:** `sector_sker_haven`, `sector_hyperion_cut`.

**E7-e · The Watcher**
- **Visual:** A `rocky` world with a single enormous eye-shaped structure on the surface
  facing the approach vector — a crater with a bright central peak, surrounded by a dark
  ring. It always faces the camera (billboard trick). The eye doesn't blink. No other
  features emit.
- **Cause:** Pareidolia or purpose — the eye is natural geology, but it *looks back*, and
  every survey crew reports being watched. Nothing scans. Nothing happens. Nobody stays.
- **Gameplay signal:** No signal; proximity applies a mild "unease" UI effect (non-diegetic
  vignette). Pure atmosphere piece.
- **Where:** `sector_sedna_dark`, `sector_orcus_shadow`.

---

### SLOT E8 — Megastructure-wrapped world (Dyson-swarm / ringworld partial — precursor tell)

Human-made stations exist; these are **precursor-scale** structures dwarfing the planet.

**E8-a · Ringworld Spine**
- **Visual:** A planet with a colossal partial ring — a thin bright band encircling the
  equator at 2.5× radius, broken in two places. The ring is geometrically perfect, faintly
  emissive (warm gold), and clearly artificial. Only ~40% of the ring remains.
- **Cause:** A precursor ringworld, shattered. Whoever built it is gone; the remaining arc
  is the single largest structure in the sector. The planet it encircled is still there,
  ordinary, beneath it.
- **Gameplay signal:** Emits a steady precursor signal; the ring arc is minable for
  precursor-tech loot (rare modules). Landmark visible across the whole sector.
- **Where:** `sector_orcus_shadow`, `sector_kepler_scar`.

**E8-b · The Swarm**
- **Visual:** A star (uses `buildSunMesh`) surrounded by a dense cloud of tiny bright
  mirror-sats — thousands of instances, orbiting, catching the star's light. A Dyson-swarm
  in progress. The swarm dims the star's disk.
- **Cause:** An active (or dormant) precursor stellar collector. The mirrors still track.
  Nobody knows who's maintaining them. Awe-tier; visible from neighboring sectors.
- **Gameplay signal:** The swarm occludes the star (navigation/detection debuff in a cone);
  individual mirrors are scan-targets for precursor data. Deep mystery.
- **Where:** `sector_eris_margin`, `sector_phoebe_echo`.

**E8-c · The Cage**
- **Visual:** A planet enclosed in a vast geometric lattice — a wireframe icosahedron at
  1.5× radius, faint cyan lines, glowing nodes. The lattice is larger than the planet.
  Through the gaps, the surface is visible and undamaged.
- **Cause:** A containment structure — precursor, Choir, or Vael origin unknown. Whatever's
  on the planet is being kept in (or out). The lattice hums on a frequency scanners can't
  classify.
- **Gameplay signal:** Precursor containment signal; entering the lattice (through a gap)
  applies a scan-jam and mild energy field. Loot hint = whatever's caged. Strong hook.
- **Where:** `sector_veil_nebula`, `sector_haumea_rift`.

**E8-d · The Pillar**
- **Visual:** A planet with a single impossibly-tall structure rising from one pole — a
  thin bright spire extending a full planet-diameter "up" into space, faintly emissive,
  perfectly straight. From orbit it looks like a needle stuck through the world. The far
  tip vanishes into parallax.
- **Cause:** A precursor space-elevator or -gun, still standing after eons. No cab runs.
  The tip is beyond reachable space. Its purpose is the sector's oldest question.
- **Gameplay signal:** Emits a single coherent beam-signal from the tip; the base is a
  scan-target for lore. Navigation landmark visible at extreme range.
- **Where:** `sector_orcus_shadow`, `sector_triton_wake`.

**E8-e · The Honeycomb**
- **Visual:** A small dense planet whose entire surface is covered in a hexagonal
  megastructure grid — clear at the terminator, glowing faintly at nodes, scale clearly
  too regular to be natural. The atmosphere shell is faint. Reads as a "built" world.
- **Cause:** A precursor shellworld — they paved the planet. The hexes are habitation cells
  or computation. Still drawing a trickle of power from an unknown source.
- **Gameplay signal:** Steady low precursor hum across the whole disk; individual hexes are
  scan-targets. The deepest precursor-tell in the set.
- **Where:** `sector_kepler_scar`, `sector_sedna_dark`.

---

## CATEGORY F — FACTION / SITUATION PROPS (15 slots × 5 = 75 concepts)

These register in `PLACE_FILES` (`src/render/partsLibrary.js` lines 59–79) and are placed
by the four palette-class dressing functions in `src/systems/world.js`
(`_spawnCoreDressing` / `_spawnBeltDressing` / `_spawnFringeDressing` /
`_spawnAnomalyDressing`) via `_spawnPlaceProp`. Each prop follows the existing place-prop
contract: an `fx` entity with `data.placeId`, `data.paletteClass`, `data.placeScale`,
`data.worldDressing`, placed in the y=0 XZ plane, radius from `DRESSING_RADIUS`.

**Material convention:** every prop exposes `Material_Hull` (primary structure, tints from
faction `primary`/`hull`), `Material_Accent` (trim, stripes, panels — faction `accent`),
and `Material_Emissive` (lights, beacons, screens — faction `emissive`). Faction tinting is
resolved via `paletteFor(entity)` in `partsLibrary.js`, which already pulls
`FACTION_PALETTES` by `factionId`. The fallback color path
(`fallbackPlaceColor`) keys off `paletteClass` (anomaly=0x8d66ff, fringe=0xff5c5c,
belt=0xffb35c, default 0x39d0ff), so props tint correctly even before authored GLBs land.

**Tri budgets:** props 1–3k tris; landmark-class props (the bigger faction tells) up to 8k.

---

### SLOT F1 — Cargo silo (faction-coded: different colors per faction)

**F1-a · Drum Silo**
- **Visual:** Cylindrical storage drum, 1.6k tris. Vertical ribbed hull (`Material_Hull`),
  faction-color band around the top quarter (`Material_Accent`), a single status light on
  the crown (`Material_Emissive`). ~12m radius, 18m tall. Stacks in clusters of 2–4.
- **Function:** Pure dressing; implies commodity storage at stations/fields. Optionally a
  scan-target showing commodity manifest.
- **Placement rule:** Near refinery/trade stations (`_spawnBeltDressing` near
  `station_ceres`/`station_expanse`; `_spawnCoreDressing` near trade hubs). Clustered in
  rows like a tank farm.
- **Faction/palette coding:** `Material_Hull` = faction `hull`, `Material_Accent` = faction
  `primary` (DMC copper at refineries, MTS gold at trade hubs).

**F1-b · Cargo Container Stack**
- **Visual:** Stacked intermodal containers, 1.2k tris. Rectangular boxes with ribbed
  sides, faction-color end-cap, registration stencil. 2×2×3 stack arrangement. 24m wide.
- **Function:** Dressing; common-as-dirt freight clutter. The faction color tells you whose
  freight this is (or was).
- **Placement rule:** Near freighter docks and trade hubs (`_spawnCoreDressing` near
  `station_tethys`/`station_helios`); also scattered near derelicts as spilled cargo.
- **Faction/palette coding:** `Material_Hull` = faction `hull`, `Material_Accent` = faction
  `primary`, stencil emissive off.

**F1-c · Cryo Silo**
- **Visual:** Tall insulated tank with frost-particle child and faint blue vent-glow
  (`Material_Emissive` in faction cyan-blue). Rounded dome top, 1.8k tris. 14m radius.
  Visible cold-mist drift.
- **Function:** Dressing + scan-target (cryo commodities: water, liquid oxygen, nerve gas).
  The frost particles make it read as hazardous cargo at a glance.
- **Placement rule:** Near mining/refinery stations and research stations
  (`_spawnBeltDressing`, `_spawnAnomalyDressing` near `station_veil`).
- **Faction/palette coding:** `Material_Hull` = faction `hull` (frosted), `Material_Emissive`
  = faction `emissive` dimmed.

**F1-d · Open Hopper**
- **Visual:** Trapezoidal open-topped bin of raw ore, 1.0k tris. Visible ore-lump geometry
  inside (low-poly rocks, faction-tinted to ore type). Crane-rail overhead. 16m wide. Reads
  as unrefined bulk.
- **Function:** Dressing; pairs with `place_conveyor_barge`. The visible ore color hints at
  the field's yield (`ast_metallic`, `ast_crystalline`, `ast_icy`).
- **Placement rule:** In belt fields near refineries (`_spawnBeltDressing` near
  `f_ceres_*`/`f_vesta_*`), always near a conveyor barge.
- **Faction/palette coding:** `Material_Hull` = faction `hull` (DMC copper dominant), ore
  tint overrides `Material_Accent` per field type.

**F1-e · Pressurized Sphere**
- **Visual:** Spherical pressure-tank on three legs, 1.4k tris. Glossy hull, faction-color
  warning stripe, valve-cluster emissive dots. 10m radius. Always in pairs.
- **Function:** Dressing; implies gas/ volatile storage. Scan-target shows gas type
  (hydrogen, exotic gas).
- **Placement rule:** Near fab/refinery stations and gas-cloud fields
  (`_spawnBeltDressing`, `_spawnAnomalyDressing` near `f_veil_1` gas cloud).
- **Faction/palette coding:** `Material_Hull` = faction `hull` (glossy), `Material_Accent` =
  faction `primary`, `Material_Emissive` = faction `emissive` (status dots).

---

### SLOT F2 — Solar collector array (energy-station prop)

**F2-a · Fan Array**
- **Visual:** Cluster of 6 hinged solar-panel fans around a central pylon, 2.2k tris. Panels
  are dark blue-grey with faction-color edge-lighting (`Material_Accent`). Fans slowly track
  (rotation tied to `uTime`). 30m footprint.
- **Function:** Dressing; energy-station tell. Optionally a soft scan-debuff (the array
  creates EM noise) in a small radius.
- **Placement rule:** Adjacent to fab/research/military stations
  (`_spawnCoreDressing`/`_spawnAnomalyDressing` near `station_forge`, `station_veil`).
- **Faction/palette coding:** Panel `Material_Hull` = neutral dark, frame `Material_Accent`
  = faction `primary`, edge-light `Material_Emissive` = faction `emissive`.

**F2-b · Mirror Trough**
- **Visual:** Long parabolic trough mirror on a tracked base, 1.8k tris. Curved reflective
  surface (`Material_Hull` high-metalness), faction-color receiver pipe at the focal line
  (`Material_Accent`, faintly emissive). 40m long. Pairs in rows.
- **Function:** Dressing; industrial heat-source tell near refineries.
- **Placement rule:** Belt/refinery sectors (`_spawnBeltDressing` near `station_ceres`,
  `station_expanse`).
- **Faction/palette coding:** Mirror = neutral, receiver = faction `emissive`.

**F2-c · Orbital Sun-Shade**
- **Visual:** Large deployable parasol — a hexagonal shade-cloth on thin struts, 2.5k tris,
  50m wide. Partially transparent, faction-color trim. Drifts near stations. Landmark-scale.
- **Function:** Dressing; a "this station is being terraformed/shaded" tell. Affects local
  lighting subtly (cast a soft shadow blob).
- **Placement rule:** Near trade/research stations in hot sectors
  (`_spawnCoreDressing`, `_spawnAnomalyDressing`).
- **Faction/palette coding:** Cloth `Material_Hull` = faction `hull` lightened, strut
  `Material_Accent` = faction `primary`, no emissive.

**F2-d · Power Core Pylon**
- **Visual:** Single tall pylon with a glowing fusion-core sphere at the top, 1.6k tris.
  Faction-color core glow (`Material_Emissive`), lattice mast (`Material_Hull`). 25m tall.
  Pulses slowly.
- **Function:** Dressing + soft EM scan-debuff; landmark at range (the glow is a navigation
  aid). Implies the station next to it has grid power.
- **Placement rule:** Every major station's edge (`_spawnCoreDressing`/all four functions
  near `stations[0]`).
- **Faction/palette coding:** Mast = faction `hull`, core = faction `emissive` bright.

**F2-e · Energy Lattice**
- **Visual:** Free-standing grid of glowing capacitor cells, 2.0k tris. 4×4 grid of small
  emissive cubes in a frame, faction-color, pulsing in sequence. 20m square. Reads as a
  battery bank.
- **Function:** Dressing;储能 tell. Optional mini-loot (charged cells) at derelict sites.
- **Placement rule:** Near fab/military stations and derelicts
  (`_spawnCoreDressing`, `_spawnFringeDressing` near `poi_freighter`).
- **Faction/palette coding:** Frame = faction `hull`, cells = faction `emissive`.

---

### SLOT F3 — Sensor / comm relay (scanner-affecting prop)

**F3-a · Dish Relay**
- **Visual:** Large parabolic dish on a gimbal mast, 2.0k tris. Dish interior faction-color
  (`Material_Accent`), mast `Material_Hull`, a red beacon at the hub (`Material_Emissive`).
  Dish slowly rotates. 18m footprint.
- **Function:** Scanner-affecting — extends the player's scan range when nearby (a "relay
  boost" buff in radius), and emits a faction scan-signal itself.
- **Placement rule:** Near research/military stations and at sector edges as a comm-net
  node (`_spawnCoreDressing`/`_spawnAnomalyDressing`).
- **Faction/palette coding:** Mast = faction `hull`, dish = faction `accent`, beacon =
  faction `emissive`.

**F3-b · Comm Spire**
- **Visual:** Tall slender spire bristling with antennae, 1.8k tris. 40m tall. Faction-color
  running light up the mast, blinking tip beacon. Minimal footprint, maximal height — a
  landmark.
- **Function:** Scanner-effect — reveals nearby POIs on the discovery overlay when in range
  (a "you have comms here" tell). At range, the beacon is a navigation aid.
- **Placement rule:** Distributed across core/belt sectors as a comm backbone
  (`_spawnCoreDressing`, `_spawnBeltDressing`), spaced evenly.
- **Faction/palette coding:** Spire = faction `hull`, running light = faction `emissive`.

**F3-c · Sensor Buoy Cluster**
- **Visual:** Three small sensor pods linked by a thin framework, 1.2k tris. Pods have
  faceted lenses (faction-color glass), drift in a loose triangle. 12m across. Read as a
  deployed sensor net.
- **Function:** Scanner-effect — *hostile* to stealth; emits a detection ping that can
  reveal cloaked/quiet ships. Faction-coded (SCN customs, Quiet black-sites).
- **Placement rule:** Near military stations, gates, and Quiet POIs
  (`_spawnCoreDressing` near `station_coalition`/`station_customs`; `_spawnFringeDressing`
  near Quiet POIs).
- **Faction/palette coding:** Frame = faction `hull`, lenses = faction `accent`.

**F3-d · Deep-Space Array**
- **Visual:** Long baseline interferometer — two separated dish-units on a connecting
  truss, 2.6k tris. 60m long, landmark-scale. Faction-color trim, faint operational glow.
- **Function:** Scanner-effect — enables deep-scan of distant planet states (slot E); the
  only way to resolve E5 (shrouded) and E7 (silent) worlds. Research tell.
- **Placement rule:** Research stations and anomaly sectors only
  (`_spawnAnomalyDressing` near `station_veil`).
- **Faction/palette coding:** Truss = faction `hull`, dishes = faction `accent`, trim =
  faction `emissive` dim.

**F3-e · Jammer Mast**
- **Visual:** Squat angled mast with a chaotic array of emitter horns, 1.6k tris. Faction-color
  hostile-red glow, visible electrical arcs (particle child). 14m tall. Reads as
  unfriendly.
- **Function:** Scanner-effect — *degrades* scan range in radius (hostile faction tell);
  Reach and Vael use these to blind customs scans. Also a mild EM hazard.
- **Placement rule:** Fringe/anomaly sectors and around pirate POIs
  (`_spawnFringeDressing`/`_spawnAnomalyDressing`).
- **Faction/palette coding:** Mast = faction `hull`, horns = faction `emissive` (red
  regardless of faction).

---

### SLOT F4 — Mining excavator rig (industrial, animated)

**F4-a · Beam Borer**
- **Visual:** Stationary rig with a large rotating bore-head on an arm, 2.8k tris. Bore-head
  spins (animated), faction-color warning stripes, dust-particle child at the bit face.
  25m tall. Reads as serious industrial equipment.
- **Function:** Dressing (animated); implies active mining. The dust particles tie it to
  the field. Optionally a scan-target showing ore throughput.
- **Placement rule:** Anchored to large asteroids in belt fields
  (`_spawnBeltDressing` near `f_ceres_*`/`f_vesta_*`/`f_charon_*`).
- **Faction/palette coding:** Rig = faction `hull` (DMC copper dominant), stripes =
  faction `accent`, bore-glow = faction `emissive`.

**F4-b · Bucket Ladder**
- **Visual:** Long angled ladder of buckets on a chain, 2.4k tris. Buckets rotate slowly
  (animated), dumping into a hopper. Faction-color frame. 40m long. Pairs with F1-d hopper.
- **Function:** Dressing (animated); bulk surface-mining tell.
- **Placement rule:** Large asteroids and claimable moons (`_spawnBeltDressing`;
  `_spawnAnomalyDressing` near `poi_claim_pallas`).
- **Faction/palette coding:** Frame = faction `hull`, buckets = faction `accent`.

**F4-c · Ramp Drill**
- **Visual:** Tracked crawler with a ramped drill-boom, 2.2k tris. Treads, cab, angled boom
  with rotating bit (animated). Faction-color cab. 20m long. Mobile read.
- **Function:** Dressing (animated); pairs with `place_mining_drone` as the crewed
  counterpart.
- **Placement rule:** Belt fields and claimable colony POIs (`_spawnBeltDressing`,
  `_spawnFringeDressing` near `poi_colony`).
- **Faction/palette coding:** Treads/frame = faction `hull`, cab = faction `primary`.

**F4-d · Fusion Piercer**
- **Visual:** Tall tower with a glowing fusion-torch at the base, 2.6k tris. Torch is a
  bright emissive column (`Material_Emissive`), faction-color cooling fins. 30m tall. The
  torch flickers.
- **Function:** Dressing (animated); deep-shaft mining tell. Soft thermal hazard in a tiny
  radius. Vael/Choir exotic-mining tell.
- **Placement rule:** Exotic-rare fields and anomaly sectors (`_spawnAnomalyDressing` near
  `f_ash_*`; `_spawnBeltDressing` near `f_charon_*`).
- **Faction/palette coding:** Tower = faction `hull`, fins = faction `accent`, torch =
  faction `emissive` (bright).

**F4-e · Automated Harvester**
- **Visual:** Box-bodied autonomous crawler with grasping arms and a collection hopper,
  2.0k tris. Arms cycle (animated), faction-color body, blinking autonomous-light
  (`Material_Emissive`). 16m long. Pairs with `place_mining_drone`.
- **Function:** Dressing (animated); "no crew here" tell. Quiet/Vael use these in hostile
  territory.
- **Placement rule:** All field types, especially uncrewed fringe/anomaly fields
  (`_spawnFringeDressing`/`_spawnAnomalyDressing`).
- **Faction/palette coding:** Body = faction `hull`, arms = faction `accent`, auton-light
  = faction `emissive`.

---

### SLOT F5 — Faction beacon (colored, emissive: territorial marker)

**F5-a · Claim Stele**
- **Visual:** Tall monolithic slab, 1.2k tris. Faction-color full-`Material_Emissive` face
  with the faction sigil, dark edges. 20m tall. Glows like a neon sign. Single-purpose
  "THIS IS OURS."
- **Function:** Territorial marker — emits the strongest faction signal in the game; the
  scanner reads "X-faction space" unmistakably. Also a navigation landmark.
- **Placement rule:** Sector edges and contested borders (`_spawnFringeDressing`;
  `_spawnCoreDressing` at gate approaches). One or two per sector.
- **Faction/palette coding:** Slab = faction `hull`, face = faction `emissive` (max
  intensity), sigil = faction `accent`.

**F5-b · Relay Beacon**
- **Visual:** Slim mast with three rotating emissive bars at the top (aeronautical style),
  1.0k tris. Faction-color bars, dark mast. 25m tall. The bars sweep slowly — reads as a
  lighthouse.
- **Function:** Territorial + navigation — emits faction signal and serves as a waypoint
  light. Common at gate-lane endpoints (pairs with `place_lane_beacon`).
- **Placement rule:** Gate approaches and lane midpoints (`_spawnCoreDressing`, replaces or
  augments `place_lane_beacon`).
- **Faction/palette coding:** Mast = faction `hull`, bars = faction `emissive`.

**F5-c · Boundary Pylon**
- **Visual:** Short stout pylon with a faction-color holographic "fence" plane projecting
  upward (additive, semi-transparent), 1.6k tris. 12m tall, fence-plane 40m wide. The plane
  shimmers. Read as a "you shall not pass" line.
- **Function:** Territorial marker — the fence-plane marks a customs/military boundary;
  crossing without rep triggers a faction warning. Mild scan-debuff on the far side.
- **Placement rule:** Military/customs station perimeters and contested sector borders
  (`_spawnCoreDressing` near `station_coalition`/`station_customs`; `_spawnFringeDressing`).
- **Faction/palette coding:** Pylon = faction `hull`, fence = faction `emissive` (semi-transparent).

**F5-d · Victory Arch**
- **Visual:** Large faction-color triumphal arch, 3.0k tris (landmark-scale). Inscribed
  with battle honors, sigil at the crown, emissive accent lines. 40m tall. Pairs of gates
  can be flown through.
- **Function:** Territorial + lore — emits faction signal and displays a historical event
  on scan ("Toll War victory, Meridian Trade Syndicate"). A pride monument.
- **Placement rule:** Core/wealthy faction space only (`_spawnCoreDressing` in
  `sector_helios_prime`/`sector_tethys_junction`).
- **Faction/palette coding:** Stone = faction `hull`, inscription lines = faction `accent`,
  sigil = faction `emissive`.

**F5-e · Outpost Flagpole**
- **Visual:** Single tall pole flying a large faction-color banner (cloth sim or
  billboard-shimmer), 0.8k tris. Banner snaps in a wind cycle (animated UV). 25m tall.
  Small footprint, high readability.
- **Function:** Territorial marker for small outposts and claims — the cheapest faction
  tell. Pairs with `place_claim_outpost_base`.
- **Placement rule:** Claim outposts, small stations, remote POIs
  (`_spawnFringeDressing`/`_spawnAnomalyDressing` near claimable POIs).
- **Faction/palette coding:** Pole = faction `hull`, banner = faction `primary`+`emissive`
  edge.

---

### SLOT F6 — Debris field cluster (combat-aftermath dressing, varies by wreck class)

**F6-a · Spalled Plate Field**
- **Visual:** Cluster of flat hull-plate shards tumbling slowly, 1.8k tris across ~12
  instances. Faction-color paint remnants on scorched metal, some still glowing at the
  edges (`Material_Emissive`). 60m spread. Read as a fresh kill.
- **Function:** Dressing; mini-loot (salvageable hull patches — small repair drops). The
  freshest debris class.
- **Placement rule:** Around wreck POIs and recent battle sites (`_spawnFringeDressing`
  near `poi_pwreck`/`poi_bounty`).
- **Faction/palette coding:** Plates = faction `hull` (scorched), edge-glow = faction
  `emissive` (fading).

**F6-b · Frozen Vapor Cloud**
- **Visual:** Diffuse additive particle cloud of crystallized vented atmosphere, 2.0k tris
  (mostly particles). Faction-color tint faint, drifting. 80m spread. Read as a breach.
- **Function:** Dressing; mild sensor-obscuration (the cloud scatters scans slightly).
  Eerie, beautiful.
- **Placement rule:** Around derelicts and dead hulks (`_spawnFringeDressing` near
  `poi_freighter`/`poi_cruiser`, pairs with `place_dead_hulk`).
- **Faction/palette coding:** Tint = faction `emissive` (very dim).

**F6-c · Tangled Spar Cluster**
- **Visual:** Knotted mass of structural spars and conduits, 2.2k tris. The skeleton of a
  station or capital ship, faction-color fragments. 50m across. Read as a *big* kill.
- **Function:** Dressing; scan-target (identifies the wreck class — capital vs freighter).
  Salvage hint (capital wrecks yield better loot).
- **Placement rule:** Capital-wreck POIs and boss-arena aftermath
  (`_spawnFringeDressing`/`_spawnAnomalyDressing` near `poi_cruiser`/`poi_boss`).
- **Faction/palette coding:** Spars = faction `hull`, conduit-glow = faction `emissive`.

**F6-d · Munition Scatter**
- **Visual:** Spread of unexploded ordnance — torpedo casings, mine bodies, 1.4k tris.
  Faction-color warning bands, blinking hazard lights (`Material_Emissive`). 70m spread.
  Read as a hot zone.
- **Function:** Hazard prop — proximity applies a small kinetic/explosive damage tick (UXO).
  Salvage (munitions) if disarmed (high rep with relevant faction).
- **Placement rule:** Military-station aftermath and combat POIs
  (`_spawnFringeDressing` near `poi_bounty`/military stations).
- **Faction/palette coding:** Casings = faction `hull`, warning bands = faction `accent`,
  hazard lights = faction `emissive` (red blink).

**F6-e · Drifting Chaff**
- **Visual:** Fine cloud of metallic confetti and foil strips, 1.6k tris (particles).
  Faction-color flecks catching light. 100m spread. Read as a defeated missile-swarm.
- **Function:** Dressing; soft sensor-obscuration (chaff effect — degrades targeting, not
  scan). Harmless clutter.
- **Placement rule:** Any combat-aftermath site, especially fighter battles
  (`_spawnFringeDressing`/`_spawnCoreDressing`).
- **Faction/palette coding:** Flecks = faction `accent` (faint).

---

### SLOT F7 — Cryo-pod cache (story-hook prop: derelicts with survivors/bodies)

**F7-a · Stacked Pod Rack**
- **Visual:** Rack of 8 cryo-pods, 2.0k tris. Frosted glass lids, faction-color frames,
  faint interior status-lights (`Material_Emissive` green/amber/red depending on occupant
  state). 12m long. The status-light color is the gameplay tell.
- **Function:** Story-hook scan-target — pods contain survivors (green), bodies (red), or
  are empty (amber). Each yields different lore/loot.
- **Placement rule:** Inside/near derelicts and dead hulks (`_spawnFringeDressing` near
  `poi_freighter`/`poi_cruiser`/`place_dead_hulk`).
- **Faction/palette coding:** Rack = faction `hull`, pods = faction `accent`, status =
  `Material_Emissive` semantic (not faction).

**F7-b · Single Hero Pod**
- **Visual:** One large cryo-pod on a standalone pedestal, 1.4k tris. Ornate (a VIP pod),
  faction-color trim, slow frost drift. 4m tall. Reads as "someone important is in here."
- **Function:** Story-hook — a named-NPC survival rescue mission hook, or a body with a
  data-chip. Scan reveals the occupant's identity.
- **Placement rule:** Derelict bridges and anomaly POIs (`_spawnFringeDressing`/
  `_spawnAnomalyDressing`).
- **Faction/palette coding:** Pod = faction `hull`+`accent`, status = semantic emissive.

**F7-c · Mass Grave Pod Field**
- **Visual:** Dozens of small pods scattered/disordered, 2.4k tris across instances. All
  status-lights red. Some cracked open (empty). Faction-color, grim. 40m spread.
- **Function:** Story-hook (dark) — a failed evacuation; scanning yields a casualty list and
  a faction-atrocity clue. No survivors.
- **Placement rule:** Catastrophe sites — `place_dead_hulk` clusters, bombarded worlds'
  orbit (E1/E2 states).
- **Faction/palette coding:** Pods = faction `hull`, status = red emissive (all).

**F7-d · Emergency Cache**
- **Visual:** Sturdy equipment locker with pod-compartments, 1.2k tris. Faction-color,
  flashing locator beacon (`Material_Emissive`). 6m tall. Designed to be found.
- **Function:** Mini-loot + story — contains supplies (repair/med) and a distress-log.
  Always "survivors were here."
- **Placement rule:** Remote POIs and hidden caches (`_spawnFringeDressing` near
  `poi_hcache`/`poi_stash`/`poi_survey`).
- **Faction/palette coding:** Locker = faction `hull`, beacon = faction `emissive`.

**F7-e · Smuggler Coffin**
- **Visual:** Crude single-occupant smuggler cryo-tube, 1.0k tris. Underscored Quiet-violet,
  concealed, no beacon. 3m long. Read as "someone hiding."
- **Function:** Story-hook (Quiet/blackmarket) — occupant is either a hiding VIP, a
  smuggler, or a hostage. High Quiet rep reveals the identity.
- **Placement rule:** Quiet POIs, blackmarket stations, hidden caches
  (`_spawnFringeDressing` near `poi_blackmkt`/`station_smuggler`).
- **Faction/palette coding:** Tube = `faction_quiet` `hull` regardless of sector faction,
  faint violet emissive.

---

### SLOT F8 — Navigation buoy (faction-coded: the "you're in X space" tell)

**F8-a · Lane Buoy**
- **Visual:** Compact buoy with a faction-color top-light and solar sail, 0.8k tris. 4m
  tall. Numbered/hex ID stencil. Pairs with `place_lane_beacon` and `place_nav_buoy` as the
  faction-coded variant.
- **Function:** Navigation + territorial — emits faction "you are entering X space" signal
  and marks the safe-transit lane.
- **Placement rule:** Gate lanes and transit corridors (`_spawnCoreDressing`,
  `_spawnBeltDressing`).
- **Faction/palette coding:** Body = faction `hull`, top-light = faction `emissive`.

**F8-b · Hazard Marker Buoy**
- **Visual:** Orange-and-black striped buoy with a hazard glyph and spinning warning light,
  0.9k tris. 5m tall. Faction-color base strip identifies who placed it. Read as "danger."
- **Function:** Navigation — marks a hazard zone boundary (radiation, debris, dense
  asteroid). Scanning it reveals the hazard type/radius.
- **Placement rule:** Edges of hazard zones (`_spawnBeltDressing`/`_spawnFringeDressing`/
  `_spawnAnomalyDressing` near `hazards`).
- **Faction/palette coding:** Body = faction `hull`, stripes = neutral hazard-orange,
  warning light = red emissive.

**F8-c · Jump-coordinate Buoy**
- **Visual:** Tall slim buoy with a holographic coordinate-display, 1.2k tris. 12m tall.
  Faction-color frame, emissive coordinate readout. Pairs with `place_gate_jump_ring`.
- **Function:** Navigation — provides jump alignment data; entering range calibrates the
  jump drive (a soft buff). Faction identifies the gate's owner.
- **Placement rule:** At gate approaches (`_spawnCoreDressing` near gates).
- **Faction/palette coding:** Frame = faction `hull`, readout = faction `emissive`.

**F8-d · Memorial Buoy**
- **Visual:** Somber buoy with a faction-color memorial plaque and eternal-flame glow,
  1.0k tris. 6m tall. Quiet, dignified. Scanning reveals who died here.
- **Function:** Navigation + lore — marks a historical loss site; scan for a short epitaph.
  No gameplay effect, pure worldbuilding.
- **Placement rule:** Battle sites and the orbit of dead/hushed worlds (E7 states)
  (`_spawnFringeDressing`/`_spawnAnomalyDressing`).
- **Faction/palette coding:** Body = faction `hull`, flame = faction `emissive` (warm).

**F8-e · Customs Buoy**
- **Visual:** Official SCN-blue (regardless of local faction) buoy with a scanning array and
  "CUSTOMS" stencil, 1.4k tris. 8m tall. Always SCN-coded even in MTS space (jurisdictional).
- **Function:** Navigation + gameplay — emits SCN customs authority; passing it triggers a
  cargo scan (lawful authority). Smugglers must evade.
- **Placement rule:** SCN-controlled gates and customs stations
  (`_spawnCoreDressing` near `station_customs`).
- **Faction/palette coding:** Body = `faction_scn` `hull` (blue, hardcoded), array = SCN
  `accent`, scanner-glow = SCN `emissive`.

---

### SLOT F9 — Docking gantry (station-adjacent, industrial)

**F9-a · Extendable Dock Arm**
- **Visual:** Long articulated arm with a docking collar at the tip, 2.2k tris. Faction-color
  framework, status-lights along the arm, the collar glows when active. 50m extended. Pairs
  with station archetypes.
- **Function:** Dressing; implies docking capacity. Optionally a soft "dock range" marker
  for missions.
- **Placement rule:** Station-adjacent, always near station archetypes
  (`_spawnCoreDressing`/`_spawnBeltDressing` near `stations[0]`).
- **Faction/palette coding:** Arm = faction `hull`, status-lights = faction `emissive`,
  collar = faction `accent`.

**F9-b · Service Tower**
- **Visual:** Vertical gantry tower with multiple platforms and hose-booms, 2.6k tris. 35m
  tall. Faction-color, refueling/repair tell. Pairs with `place_station_*`.
- **Function:** Dressing; implies refuel/repair service at the station.
- **Placement rule:** Adjacent to trade/refinery/military stations
  (`_spawnCoreDressing`/`_spawnBeltDressing`).
- **Faction/palette coding:** Tower = faction `hull`, platforms = faction `accent`.

**F9-c · Cargo Transfer Gantry**
- **Visual:** Horizontal conveyor gantry linking a station to a cargo silo cluster, 2.0k
  tris. Moving cargo-pallets (animated), faction-color. 60m long. Pairs with F1 silos.
- **Function:** Dressing (animated); shows commodity flow from silo to station.
- **Placement rule:** Between station and F1 silo cluster
  (`_spawnBeltDressing`/`_spawnCoreDressing`).
- **Faction/palette coding:** Gantry = faction `hull`, pallets = faction `accent`.

**F9-d · Tug Berth**
- **Visual:** Open-frame berth holding a small tug craft, 1.8k tris. Faction-color tug,
  charging-cable emissive. 25m footprint. Read as "station support vehicles."
- **Function:** Dressing; implies station has a tug fleet (lore). Mini-loot occasionally
  (a loose tug cargo).
- **Placement rule:** Major stations and freighter docks (`_spawnCoreDressing`).
- **Faction/palette coding:** Berth = faction `hull`, tug = faction `primary`, charge =
  faction `emissive`.

**F9-e · Emergency Berth**
- **Visual:** Stripped-down crash-berth with medical cross and amber lights, 1.4k tris.
  Faction-color, weathered. 18m footprint. Read as "damaged ships land here."
- **Function:** Dressing + soft buff — proximity applies a slow hull-repair tick (emergency
  field repairs). Faction-coded access (rep-gated).
- **Placement rule:** All stations, but emphasized at military/frontier stations
  (`_spawnCoreDressing`/`_spawnFringeDressing`).
- **Faction/palette coding:** Berth = faction `hull`, cross = neutral white, amber lights =
  faction `emissive`.

---

### SLOT F10 — Hull-plate scrap (salvageable dressing: mini-loot)

**F10-a · Scorched Plate**
- **Visual:** Single large hull-plate fragment, 0.4k tris. Faction-color scorched paint,
  glowing edge fading. 8m long. Tumbles slowly. Read as fresh salvage.
- **Function:** Mini-loot — scoopable for a small hull-patch/metal-alloy drop.
- **Placement rule:** Wreck POIs and combat sites (`_spawnFringeDressing` near
  `poi_pwreck`/`poi_bounty`).
- **Faction/palette coding:** Plate = faction `hull` (scorched), edge-glow = faction
  `emissive`.

**F10-b · Bent Frame**
- **Visual:** Buckled structural frame member, 0.6k tris. Faction-color, twisted. 12m long.
  Read as heavier salvage.
- **Function:** Mini-loot — scoopable for structure scrap (better value).
- **Placement rule:** Capital-wreck and station-wreck sites (`_spawnFringeDressing` near
  `poi_cruiser`).
- **Faction/palette coding:** Frame = faction `hull`.

**F10-c · Embedded Panel**
- **Visual:** Hull panel lodged into an asteroid, 0.5k tris. Faction-color, impact crater.
  Implies a wreck embedded deeper in the rock. Pairs with
  `place_asteroid_seamed`.
- **Function:** Mini-loot + hint — scoopable, and implies a larger wreck is embedded
  nearby (scan hint).
- **Placement rule:** Asteroid fields near wrecks (`_spawnBeltDressing`/`_spawnFringeDressing`).
- **Faction/palette coding:** Panel = faction `hull`.

**F10-d · Tagged Fragment**
- **Visual:** Hull fragment with a faction graffiti-tag (pairs with
  `place_asteroid_graffiti`), 0.5k tris. Faction-color paint over scorched metal, emissive
  tag. 6m long. Read as "pirates were here."
- **Function:** Mini-loot + lore — scoopable; scanning the tag reveals which pirate band
  claimed the kill.
- **Placement rule:** Pirate-attack sites in fringe sectors (`_spawnFringeDressing`).
- **Faction/palette coding:** Fragment = neutral scorched, tag = `faction_reach` `emissive`
  (red).

**F10-e · Crystalline Shard**
- **Visual:** Fragment of a crystalline hull (exotic faction — Vael/Choir), 0.5k tris.
  Translucent faction-color, refractive, faint internal glow. 5m long. Read as exotic
  salvage.
- **Function:** Mini-loot — scoopable for rare-exotic material (high value).
- **Placement rule:** Anomaly sectors and Vael/Choir combat sites
  (`_spawnAnomalyDressing`; `_spawnFringeDressing` in Vael space).
- **Faction/palette coding:** Shard = `faction_vael`/`faction_choir` `accent` (translucent),
  glow = faction `emissive`.

---

### SLOT F11 — Plasma vent (hazard prop: damages ships that pass)

**F11-a · Station Vent**
- **Visual:** Large exhaust louver on a station-adjacent structure, 1.0k tris. Periodic
  plasma-burst particle column (`Material_Emissive`, faction-color), 30m long plume.
  Cycles on/off. Read as industrial exhaust.
- **Function:** Hazard — the plume applies thermal/energy damage when active; timing-based
  avoidance. Pairs with industrial stations.
- **Placement rule:** Refinery/fab stations (`_spawnBeltDressing` near `station_ceres`/
  `station_forge`).
- **Faction/palette coding:** Louver = faction `hull`, plume = faction `emissive`.

**F11-b · Geothermal Vent**
- **Visual:** Planetary-surface-style vent (on a claimable body), 1.2k tris. Cracks in
  rock, plasma jet (`Material_Emissive` magenta/orange), particle steam. 20m plume. Cycles.
- **Function:** Hazard on claimable POIs — damage tick; also implies geothermal resource
  (mini-loot: exotic volatiles).
- **Placement rule:** Claimable colony POIs and burning-world (E2) orbits
  (`_spawnAnomalyDressing`/`_spawnFringeDressing` near `poi_claim_*`).
- **Faction/palette coding:** Rock = neutral, plume = anomaly-palette emissive (not faction).

**F11-c · Leaking Conduit**
- **Visual:** Broken plasma conduit spewing a lateral jet, 0.8k tris. Faction-color,
  arcing electricity. 15m jet. Read as battle damage.
- **Function:** Hazard — narrow but continuous damage jet; navigation obstacle. Pairs with
  debris fields.
- **Placement rule:** Wreck POIs and dead hulks (`_spawnFringeDressing` near
  `poi_freighter`/`place_dead_hulk`).
- **Faction/palette coding:** Conduit = faction `hull`, jet/arc = faction `emissive`.

**F11-d · Cryo Vent**
- **Visual:** Ruptured cryo-line venting a horizontal freezing jet, 0.8k tris. Pale
  cyan-white particles, frost accumulation, faction-color pipe. 15m jet. Read as cold
  hazard.
- **Function:** Hazard — slows ship (freeze effect) and applies cold damage; different
  damage type than plasma.
- **Placement rule:** Cryo-silo clusters (F1-c) and cryo-pod caches (F7) at derelicts
  (`_spawnFringeDressing`/`_spawnBeltDressing`).
- **Faction/palette coding:** Pipe = faction `hull`, jet = pale cyan emissive (not faction).

**F11-e · Reactor Plume**
- **Visual:** Massive vertical plasma column from a wrecked reactor, 1.8k tris. Faction-color,
  intense `Material_Emissive`, large particle volume, crackling. 60m tall. Landmark-scale
  hazard.
- **Function:** Major hazard — large damage zone, but high salvage (the reactor wreck at
  the base). Risk/reward landmark.
- **Placement rule:** Capital-wreck and catastrophe sites (`_spawnAnomalyDressing` near
  `poi_boss`/`poi_cruiser`).
- **Faction/palette coding:** Wreck = faction `hull`, plume = faction `emissive` (max).

---

### SLOT F12 — Holo-billboard (faction advertising: worldbuild flavor)

**F12-a · Trade Ad Board**
- **Visual:** Large rectangular holographic billboard, 1.4k tris. Faction-color frame,
  emissive ad-panel cycling faction commodity promos ("VESTA FORGE — FOUNDRY RATES").
  40m wide. Pairs with `place_station_billboard`.
- **Function:** Flavor dressing — cycles commodity/faction slogans; high flavor, low
  gameplay. Implies commerce.
- **Placement rule:** Trade hubs and gates (`_spawnCoreDressing` near `station_helios`/
  `station_tethys`).
- **Faction/palette coding:** Frame = faction `hull`, ad-panel = faction `emissive` (full
  faction palette).

**F12-b · Recruitment Holo**
- **Visual:** Triangular holo-projector displaying a faction mascot/sigil and "JOIN THE
  NAVY" copy, 1.2k tris. Faction-color, animated sigil. 25m tall. Military/reach tell.
- **Function:** Flavor — faction recruitment copy; scanning reveals a mission-board
  pointer.
- **Placement rule:** Military stations and faction-bastion POIs (`_spawnCoreDressing`/
  `_spawnFringeDressing`).
- **Faction/palette coding:** Projector = faction `hull`, holo = faction `emissive`.

**F12-c · Warning Holo**
- **Visual:** Red emissive warning holo with skull/hazard glyph, 1.0k tris. Faction-color
  base. 20m wide. Read as "TURN BACK" or "HAZARD."
- **Function:** Flavor + hazard-flag — marks restricted/dangerous zones; pairs with F8-b
  hazard buoys.
- **Placement rule:** Military-zone perimeters and hazard-zone edges
  (`_spawnFringeDressing`/`_spawnAnomalyDressing`).
- **Faction/palette coding:** Base = faction `hull`, holo = red `emissive` (regardless of
  faction).

**F12-d · Bazaar Sign**
- **Visual:** Cluttered, neon, multi-color holo-sign in Reach/Quiit/pirate style, 1.6k tris.
  Layered ads, faction-tag graffiti, chaotic. 30m wide. Read as black-market bazaar.
- **Function:** Flavor — blackmarket/pirate flavor; scanning reveals blackmarket inventory
  hints.
- **Placement rule:** Blackmarket stations (`_spawnFringeDressing` near
  `station_smuggler`/`station_sker`/`station_ashcache`).
- **Faction/palette coding:** Frame = `faction_reach`/`faction_quiet` `hull`, neon = mixed
  emissive (chaotic).

**F12-e · Reliquary Holo**
- **Visual:** Reverent holo-display of a faction relic/saint, 1.4k tris. Choir magenta or
  Vael teal, slow dignified animation, faint particle halo. 25m tall. Read as zealot
  worship-ad.
- **Function:** Flavor — Choir/Vael lore; scanning reveals a relic description and a rep
  bonus with that faction.
- **Placement rule:** Choir/Vael stations and anomaly sectors (`_spawnAnomalyDressing`
  near `station_veil`/`station_ashcache`).
- **Faction/palette coding:** Frame = `faction_choir`/`faction_vael` `hull`, holo = faction
  `emissive`.

---

### SLOT F13 — Mine / ordinance warning marker (military-zone prop)

**F13-a · Proximity Mine**
- **Visual:** Spherical mine with faction-color sensor-dots and blinking arming-light,
  0.5k tris. 3m diameter. Drifts. Read as active hazard.
- **Function:** Hazard — detonates on proximity (kinetic/EMP damage). Scannable and
  (with high rep) disarmable for salvage.
- **Placement rule:** Military-zone perimeters and combat POIs (`_spawnFringeDressing`/
  `_spawnCoreDressing` near military stations).
- **Faction/palette coding:** Body = faction `hull`, sensor-dots = faction `accent`,
  arming-light = red `emissive`.

**F13-b · Minefield Warning Buoy**
- **Visual:** Bright warning buoy with a mine-glyph and sweeping hazard-light, 0.8k tris.
  Faction-color, "MINED" stencil. 6m tall. Read as "the field starts here."
- **Function:** Navigation/hazard — marks a minefield boundary; pairs with F13-a mines.
  Scanning reveals field density.
- **Placement rule:** Edge of minefields (`_spawnFringeDressing`/`_spawnCoreDressing`).
- **Faction/palette coding:** Body = faction `hull`, glyph = neutral, hazard-light = red
  `emissive`.

**F13-c · Disarmed Mine Pile**
- **Visual:** Cluster of defused mines stacked like discarded ordnance, 1.0k tris.
  Faction-color, inert. 10m spread. Read as "field cleared."
- **Function:** Dressing + mini-loot — salvageable scrap from a swept field; tells a story
  of a prior clearing op.
- **Placement rule:** Former combat sites near stations (`_spawnCoreDressing`/
  `_spawnFringeDressing`).
- **Faction/palette coding:** Mines = faction `hull` (faded).

**F13-d · Torpedo Scaffold**
- **Visual:** Rack of ship-launched torpedoes on a loading scaffold, 1.6k tris. Faction-color,
  hazard-stripes, ordnance-glow. 20m long. Read as station re-armament.
- **Function:** Dressing + gameplay hint — implies the station offers missile re-armament
  service.
- **Placement rule:** Military stations and carrier-bastions (`_spawnCoreDressing` near
  `station_coalition`).
- **Faction/palette coding:** Scaffold = faction `hull`, torpedoes = faction `accent`,
  hazard-stripes = neutral, glow = faction `emissive`.

**F13-e · Detonation Crater Marker**
- **Visual:** Scorch-marked debris ring with a faction-color central marker and fading
  smoke, 1.2k tris. 30m spread. Read as "something blew up here."
- **Function:** Dressing — aftermath of a mine/ordnance detonation; scan reveals what
  died.
- **Placement rule:** Combat-aftermath sites (`_spawnFringeDressing`).
- **Faction/palette coding:** Marker = faction `hull`, smoke = neutral grey.

---

### SLOT F14 — Smuggler cache (hidden prop: blackmarket tell)

**F14-a · Shielded Locker**
- **Visual:** Small matte-black locker with a Quiet-violet seam-glow, 0.5k tris. 3m wide.
  No beacon — designed to be invisible on scanner unless close.
- **Function:** Hidden mini-loot — contains contraband (narcotics, battle-weapons). Only
  detectable at short range or with Quiet rep.
- **Placement rule:** Hidden POIs and blackmarket-adjacent sectors (`_spawnFringeDressing`
  near `poi_hcache`/`poi_stash`/`poi_blackmkt`).
- **Faction/palette coding:** Always `faction_quiet` palette regardless of sector (seam-glow
  violet `emissive`).

**F14-b · Buried Capsule**
- **Visual:** Half-buried smuggler capsule in an asteroid, 0.7k tris. Faction-color
  (Quiet) hatch visible, faint glow. Pairs with `place_asteroid_seamed`. Read as "hidden
  in the rock."
- **Function:** Hidden mini-loot — contraband + a Quiet contact datapoint.
- **Placement rule:** Asteroid fields in Quiet-influenced sectors (`_spawnFringeDressing`/
  `_spawnBeltDressing` in `sector_pallas_drift`/`sector_io_reach`).
- **Faction/palette coding:** Hatch = `faction_quiet` `hull`, glow = violet `emissive`.

**F14-c · Dead-Drop Buoy**
- **Visual:** Innocuous-looking nav-buoy with a concealed compartment, 0.8k tris. Faction
  (local) colors on the outside, Quiet-violet tell on close scan. 5m tall. Pairs with F8.
- **Function:** Hidden story-hook — a dead-drop; scanning with Quiet rep reveals a mission
  payload (data, not loot).
- **Placement rule:** Scattered in Quiet-influenced sectors, disguised among normal buoys
  (`_spawnCoreDressing`/`_spawnFringeDressing`).
- **Faction/palette coding:** Exterior = local faction `hull`, compartment = `faction_quiet`
  `emissive` (only on close scan).

**F14-d · Derelict Smuggler Hull**
- **Visual:** Small freighter hull (Quiet-coded) with a cargo-bay full of contraband
  crates, 2.2k tris. Faction-color, silent, dark. 40m long. Read as a smuggler who didn't
  make it. Pairs with `place_dead_hulk`.
- **Function:** Hidden mini-loot + story — high-value contraband; scanning reveals the
  smuggler's last log.
- **Placement rule:** Fringe/anomaly sectors near Quiet POIs (`_spawnFringeDressing` near
  `poi_freighter`/Quiet POIs).
- **Faction/palette coding:** Hull = `faction_quiet` `hull`, crates = violet `accent`.

**F14-e · Camouflaged Crate**
- **Visual:** Single crate painted to look like ordinary cargo, 0.3k tris. Faction (local)
  colors, Quiet tell on scan. 4m wide. Read as "one of these is not like the others."
- **Function:** Hidden mini-loot — concealed among real cargo containers (F1-b); short-range
  scan or Quiet rep reveals it.
- **Placement rule:** Amongst cargo-container stacks at trade hubs and freighter wrecks
  (`_spawnCoreDressing`/`_spawnFringeDressing`).
- **Faction/palette coding:** Exterior = local faction `hull`, tell = `faction_quiet`
  `emissive` (faint).

---

### SLOT F15 — Alien obelisk (precursor tell: scan for lore)

**F15-a · Standing Obelisk**
- **Visual:** Tall black monolith, 1.2k tris. Smooth, featureless except for a single
  glowing faction-agnostic teal glyph that pulses slowly. 25m tall. Read as alien.
- **Function:** Precursor lore — scanning reveals a lore fragment (precursor text/glyph);
  collecting all obelisks in a sector unlocks a deeper lore entry.
- **Placement rule:** Anomaly sectors and precursor-tell world orbits (E8 states)
  (`_spawnAnomalyDressing`; near E8 planet states).
- **Faction/palette coding:** Body = neutral black `hull`, glyph = teal `emissive` (never
  faction-colored — alien).

**F15-b · Ruined Arch**
- **Visual:** Partial precursor archway, 1.8k tris. Cracked, ancient, teal-glyph remnants,
  faint energy hum. 30m tall. Read as a relic.
- **Function:** Precursor lore + soft buff — passing through the arch grants a temporary
  scan-range boost (residual field). Scanning yields lore.
- **Placement rule:** Anomaly sectors and ringworld/megastructure orbits (E8-a/E8-c)
  (`_spawnAnomalyDressing`).
- **Faction/palette coding:** Stone = neutral dark `hull`, glyphs = teal `emissive`.

**F15-c · Resonance Spire**
- **Visual:** Slender crystalline spire emitting a faint harmonic ripple (additive ring
  child mesh, expanding), 1.6k tris. 40m tall. The ripple pulses outward periodically.
  Read as a functioning relic.
- **Function:** Precursor lore + gameplay — the ripple is a scan-ping that reveals nearby
  hidden POIs (including F14 smuggler caches); scanning the spire yields deep lore.
- **Placement rule:** Anomaly sectors and Vael/Choir rim (`_spawnAnomalyDressing`).
- **Faction/palette coding:** Crystal = neutral teal-translucent `hull`/`accent`, ripple =
  teal `emissive`.

**F15-d · Buried Monolith**
- **Visual:** Obelisk half-submerged in an asteroid, 1.0k tris. Only the top third visible,
  glowing glyph. Pairs with `place_asteroid_seamed`. Read as "older than the rock around
  it."
- **Function:** Precursor lore — scanning yields a fragment; implies the asteroid field is
  itself a precursor site.
- **Placement rule:** Asteroid fields in anomaly/frontier sectors (`_spawnAnomalyDressing`/
  `_spawnBeltDressing`).
- **Faction/palette coding:** Stone = neutral `hull`, glyph = teal `emissive`.

**F15-e · The Index**
- **Visual:** Large precursor data-monolith covered in dense glowing glyphs, 2.4k tris
  (landmark-scale). 50m tall. Glyphs cycle slowly. Read as a library or map.
- **Function:** Precursor lore landmark — the deepest lore scan in the game; reveals sector
  history and precursor network maps. Awe-tier.
- **Placement rule:** One per anomaly region, at the primary precursor site
  (`_spawnAnomalyDressing` in `sector_veil_nebula`/`sector_orcus_shadow`/
  `sector_kepler_scar`).
- **Faction/palette coding:** Body = neutral black `hull`, glyphs = teal `emissive` (full
  coverage, slow cycle).

---

## Summary

- **Category E (Distinctive Planet States):** 40 concepts across 8 slots (cracked,
  burning, ringed-hazard, dyed/claimed, shrouded, infested, dead/silent, megastructure).
  Each is a state-overlay/variant extending `planetFactory.js`'s `buildSectorBodies`,
  visible-from-orbit only (y=0 plane), with shader/child-mesh notes, backstory tied to the
  8 factions, scanner signals, and real sector IDs.

- **Category F (Faction/Situation Props):** 75 concepts across 15 slots (cargo silo, solar
  array, sensor relay, mining rig, faction beacon, debris cluster, cryo-pod cache, nav
  buoy, docking gantry, hull scrap, plasma vent, holo-billboard, mine marker, smuggler
  cache, alien obelisk). Each registers in `PLACE_FILES`, places via the four palette-class
  dressing functions, uses the `Material_Hull`/`Material_Accent`/`Material_Emissive` slot
  convention for faction tinting from `FACTION_PALETTES`, and respects the 1–3k (prop) /
  8k+ (landmark) tri budgets.
