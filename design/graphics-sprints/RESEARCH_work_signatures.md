<!-- LIFETIME: DURABLE -->
<!-- Expansion Program loop step 1 (research). Source: grok web-search thread, 2026-08-05.
     Feeds design/fiction/THE_WORKING_LIGHT.md (step 2) and src/render/npcJobSignatureVfx.js (step 4). -->

# Ambient NPC Ships That “Do a Job”: Craft Findings

## 1. State discrimination: mid-cut vs transit, loaded vs empty, patrol vs response

Modern space games do not rely on ship identity alone. They encode **activity state** as a short stack of orthogonal signals that remain legible when the hull is a few pixels wide: **tool geometry + energy link + material flow + motion regime + light code**.

### Mining barge: mid-cut vs transit

| State | Dominant far signals | Named game evidence |
|---|---|---|
| **Mid-cut / on-station extract** | Locked pose relative to rock; continuous beam/arm contact; impact dust or fragment spray at the contact point; low/zero translation, small station-keeping thruster chatter | **EVE Online**: strip/mining lasers as continuous amber/yellow beams into asteroids; barges hold station while cycles run. **Elite Dangerous**: mining lasers scrape fragments off rotating rocks; fragments fly off on predictable trajectories; collector limpets orbit and ferry chunks into the cargo hatch. **Star Citizen** (Prospector/Mole): sustained mining laser into rock; fracture/extract phases with visible energy on the rock; multi-turret Mole shows three simultaneous work beams. **X4: Foundations**: mining lasers dig visible hotspots; material ejects from asteroid into ship. **Homeworld** lineage: collectors **latch** to a resource, fire a harvest beam (classic “PDA” green beam), then peel off and return to drop-off. **Homeworld 2**: mechanical dig arms + dust kicked while working, dust trails on return. |
| **Transit / full haul** | Beam off; hardpoints retracted or arms stowed; linear cruise path; higher speed; thrusters in sustained burn not RCS chatter | EVE/X4 miners after cycle completion head to station/refinery on long, boring paths. Homeworld collectors return on clear “loaded” paths to mothership/resource controller. Elite: hardpoints stowed, limpets gone or expired, ship leaves ring belt on a clean outbound vector. |

**Loaded vs empty** is almost never a cargo-bay texture at range. Games use:

- **Silhouette volume**: No Man’s Sky freighters and escorts wear **external cargo pods/containers** as readable mass; empty-looking hulls vs container-studded outlines.  
- **Motion mass**: loaded haulers in X4/EVE move slower, take wider turns, avoid dogfight-like course changes.  
- **Egress activity**: Star Citizen tractor-beam cargo work (handheld Multi-Tool and ship beams) shows **boxes floating on a cone/beam** between hold and pad—activity that empty ships simply do not emit.  
- **Mass proxy VFX**: Homeworld 2 collectors trail **dust after digging**; a dust-trailing return path reads “full of work product” without inventory UI.

### Patrol on station vs responding

| State | Far signals |
|---|---|
| **On station (orbit/CAP)** | Closed path (ellipse, race-track, figure-8) around a point of interest; predictable period; running lights only; weapons cold; formation spacing stable. **Star Wars Squadrons** capital-ship space is full of fighters on lazy CAP arcs until alerted. **Elite** system security often loiters near stations/RES with calm thruster use. |
| **Responding** | Path snaps to intercept/intercept cone; burn flares brighter/longer; anti-collision or afterburner glow up; formation compresses or spreads into attack stack; weapons hardpoints deploy (silhouette change) before shots land. **Squadrons** tractor emitters and subsystem targets only matter once the fight is “hot”—the visual shift is energy + intent, not paint. **Chorus** sells combat state with dense particle density and aggressive manoeuvre envelopes rather than subtle light codes. |

**Rule of thumb used across shipped titles:** if two states share the same hull, the cheaper state (idle/transit) is **absence of work VFX + smooth motion**; the expensive state is **a continuous geometric relationship** (beam to rock, clamp to hull, tractor to crate, latch to asteroid).

---

## 2. Effect vocabulary (what ships actually draw)

Concrete primitives, with game anchors:

| Primitive | What it looks like at craft level | Where it shows up |
|---|---|---|
| **Mining / cutting beam** | Continuous line or cone, often amber/yellow (industrial) vs combat red/blue; origin at turret/nose; termination spark/hotspot on rock | EVE strip miners (historically yellow/amber beams); Elite mining lasers; SC Prospector/Mole; X4 mining lasers; NMS Phase Beam (bright beam + cyan/light hit flash on ore) |
| **Ore / fragment stream** | Discrete glowing chunks on ballistic arcs, or continuous “suction” ribbon into a bay | Elite: laser → fragments → limpets → cargo hatch; X4: ejecta from asteroid hotspots; EVE: cycle deposits into ore hold (beam implies transfer even when chunks are stylized) |
| **Dust plumes** | Soft volumetric or particle bloom at contact; trails behind departing diggers | Homeworld 2 collectors “kick up a lot of dust” while digging and trail it on return |
| **Cargo strobes / work lights** | Amber/white work floods on bays; periodic cargo-area blink distinct from nav lights | Industrial SC cargo ops; freighter bay lighting in Elite/SC; NMS freighter exterior pods read as lit cargo architecture |
| **Docking clamps / hard dock** | Mechanical silhouette change: arms, umbilicals, clamp geometry; relative motion freezes to zero | Homeworld latch; SC landing/dock; Hardspace bay capture language (player-scale, but same clamp/hold grammar) |
| **Running-light codes** | Port/starboard + masthead/stern patterns; mode lights stacked vertically | Nearly all flight sims borrow aviation/maritime layouts; Elite/SC capital and industrial ships use persistent nav + work light layers |
| **Tether / tractor** | Soft cylinder or segmented cone; often additive cyan/blue; object rides along axis | SC Multi-Tool / ship tractor beams (explicit VFX task in alpha); Squadrons capital tractor as gameplay subsystem with spatial presence under the hull |
| **RCS puff patterns** | Short, asymmetric thruster jets opposite to small attitude corrections; idle = sparse; station-keeping = regular micro-puffs; burn = continuous main plume | Elite/SC flight models; readable even when hull is sub-pixel because **motion of light puffs** is larger than the ship |
| **Deployable arms / booms** | Silhouette grows: dig arms (HW2), multi-turret heads (Mole), grapples | Homeworld 2 “digging appendages”; SC Mole three-operator turrets |
| **Heat glow** | Orange/red emissive on tools and radiators after sustained work | Hardspace: cutter heat buildup (gameplay + audiovisual warning); industrial ships often “cook” mining heads after long cycles |
| **Welding / salvage arcs** | Intermittent bright sparks, short arc length, reflection when material resists | Hardspace Stinger: narrow continuous cut; Splitsaw: broad line cut; sparks when grade too high; pure visual “reflect” when too tough |
| **Survey pings / scan sweeps** | Expanding rings, cone sweeps, brief highlight on target rock | SC mining scan → fracture HUD; X4 scanners reveal asteroid hotspots before mining; Elite prospector limpet “marks” rocks |
| **Salvage cutters** | Short-range precision beam + cut-path line; debris separation | Hardspace modular cutter heads; ambient salvage NPCs in several titles copy the same “spark + sever + float” grammar |

**Secondary “job swarm” actors** (count as one ship signature at range): Elite collector limpets as tiny moving lights ferrying fragments; SC multi-crew mining turrets; HW resource controller + collector pair.

---

## 3. Real-world signalling borrowed by games

Games compress real industrial signalling into **silhouette + light rhythm**, not literal regulation compliance.

### COLREGS lights & day shapes (maritime)

From COLREGS / navigation training material:

- **Power-driven underway**: white masthead (225°), red port / green starboard sidelights (112.5°), white sternlight (135°).  
- **Anchored**: all-round white (often two on large vessels); **day shape = one black ball**.  
- **Not under command**: two all-round reds vertical; day = **two balls**.  
- **Restricted in ability to manoeuvre (RAM)** — dredging, cable lay, diving support: **red-white-red** all-round vertical; day = **ball–diamond–ball**. Side of obstruction: two greens (clear) or two reds (obstructed).  
- **Fishing / trawling**: green-over-white (trawl) or red-over-white (other fishing); day = **two cones apex together**.  
- **Towing**: extra masthead lights stacked; yellow towing light over sternlight; long tow day shape = **diamond**.  

**Game mapping that actually ships:**  
- “Mining on station” ≈ **RAM / fishing**: “I am working; I may not give way; stay clear of the beam/boom side.”  
- “Towing salvage / hauling modules” ≈ **tow lights + diamond**.  
- “Parked at beacon / on CAP loiter” ≈ **anchor ball / single white**.  
- “Emergency / disabled” ≈ **NUC two reds**.  

You do not need full COLREGS fidelity—**one extra vertical light stack or one day-shape proxy** is enough for players to learn “working ship, give way.”

### IALA buoyage (site, not ship)

IALA marks teach **rhythm as meaning**:

- Lateral A: red port / green starboard into harbour.  
- Cardinals: black/yellow banding + **VQ/Q flash counts** (N continuous, E 3, S 6+1 long, W 9).  
- Isolated danger: black/red bands, **group flash 2**.  
- Special marks: yellow, often **Fl Y**.  

**Game mapping:** mining fields, no-fire corridors, salvage lanes, and station approaches use **coloured beacon blink codes** more than hull decals. A yellow special-mark blink around a dig site reads “industrial work zone” the way IALA special marks mark pipelines/military exercise areas.

### Aviation light ops

- **Nav**: red left / green right / white rear (same lateral grammar as ships).  
- **Beacon (red rotating)**: “I’m powered / about to move.”  
- **Strobes (white wingtip)**: “I’m in the air / runway environment”—**off on ground** so they do not blind others.  
- **Landing / taxi lights**: directional floods only in approach/taxi.  

**Game mapping:** patrol “on station” = nav + dim beacon; “responding / afterburner intercept” = strobes + landing-light style nose floods + long plume. Cargo ships loading at a pad = taxi/work floods, strobes off. SC players explicitly notice landing lights and bay light states during hauling.

### Industrial / RoRo / crane conventions

- **Crane boom lights** and **amber rotating beacons** on heavy plant = “equipment moving.”  
- **RoRo ramp / open bay** = large dark aperture + interior spill light (reads as “loading” even without crates).  
- **High-vis yellow/black chevrons** on moving parts (boom edges) survive as emissive strips on deployable arms.  
- **Mining site**: flood banks aimed at the face, dust, and a single “hot” contact spark—not glamorous ship paint.

---

## 4. Three.js / WebGL: 8–20 signatures per frame, cheap

Goal: **one or few draw calls**, GPU motion, distance collapse of detail—not per-NPC particle systems.

### Architecture that scales

1. **Global instanced “signature buffer”**  
   Pack each active job into a struct (or texture row): `shipPos, shipQuat, targetPos, typeId, phase, intensity, seed, lodBits`.  
   One `InstancedMesh` / `THREE.Points` / custom `RawShaderMaterial` draw per **effect class**, not per ship.

2. **Effect classes (batch by material, not by ship)**  
   - Beams (mining, tractor, scan)  
   - Impact sparks / dust  
   - RCS puffs  
   - Nav/work lights (points or small quads)  
   - Soft cargo/ore streaks  

   8–20 ships × 2–3 classes ≈ still **~4–6 draws** if instanced.

3. **Beams: when a shader quad beats a billboard**  
   - **Shader beam (two-point stretched quad or capsule, additive)**: best for continuous mining/tractor links. Vertex shader places endpoints from instance data; fragment does soft core + noise scroll. Constant thickness in world or **pixel-clamped** with `minWorld / maxScreen`.  
   - **Billboard streak**: fine for short RCS jets and muzzle flashes; bad for long mining beams (orientation swimming, thickness wrong at glancing angles).  
   - **Line2 / fat lines**: acceptable for few hero beams; too expensive and uniform for 20 ambient jobs.

4. **Additive vs alpha**  
   - **Additive**: beams, arcs, heat, scan pings, thruster cores—order-independent, cheap, “energy” read. Cap intensity so 20 beams do not white-out.  
   - **Alpha premultiplied**: dust plumes, soft tractor haze—needs sort or accept artifacts; use **few large soft sprites**, not hundreds of smoke puffs at range.

5. **Screen-space vs world-space sizing**  
   - **Lights / RCS / sparks**: screen-space minimum size (1–2 px) so sub-pixel ships still blink.  
   - **Beams**: world-space length (ship→target), **screen-space minimum width** so the link does not vanish at 1–2 km.  
   - **Dust**: world-space at mid range; collapse to **single additive hotspot sprite** at far LOD.

6. **LOD by distance (effect LOD, not mesh LOD)**  

| Distance (illustrative) | Keep | Drop / collapse |
|---|---|---|
| Near | Full beam shader, dust particles, arm mesh pose, multi-light | — |
| Mid | Beam + 1 impact sprite + nav lights + RCS | Per-particle dust, secondary sparks |
| Far (500–2000 u) | **One link line**, **one contact glow**, **2–4 nav points**, motion of whole ship | Arms, limpets as individuals, heat detail, welding intermittency |

   Collapse N limpets to **one orbiting spark ring** or even a brighter hatch light pulse.

7. **Avoid per-effect draws**  
   - No `new Mesh` per laser.  
   - No CPU particle integration per ship every frame—encode `age = fract(time * rate + seed)` in the vertex shader (GPU particle patterns used in Three.js tutorials for thousands of particles).  
   - Share one noise texture atlas for beam scroll, spark, dust.  
   - Disable work VFX entirely outside frustum + generous fade; keep **nav lights** longer than beams (identity survives after job detail dies).

8. **Motion authority on CPU, look on GPU**  
   Sim sets `targetPos` and `jobState` at 10–20 Hz. Render interpolates endpoints and scrolls UVs at frame rate. That is how Elite-style limpet swarms and SC beams stay cheap: **logic sparse, VFX dense but instanced**.

---

## 5. Silhouette and motion rules at 500–2000 units (sub-pixel detail)

At ranges where paint, panel lines, and even thruster geometry fail, **only shape change and path language survive**.

### Silhouette rules

1. **Job changes outline, not colour.** Deployed boom, latched collector, open cargo jaws, three raised Mole turrets, HW2 dig arms—**extra mass on one side of the hull**.  
2. **Contact geometry beats emissive colour.** A thin line from ship to asteroid is more informative than a green hull tint.  
3. **Asymmetry = work.** Patrols are symmetric formations; miners sit **nose/turret-locked to a rock**; haulers present **pod-studded mass**; salvage presents **clamp + debris pair**.  
4. **Negative space.** Open bay aperture, gap between latched collector and rock, or crate floating on a tractor line—readable as “void shapes” even when materials are noise.  
5. **Pair actors.** Homeworld collector+resource, Elite ship+limpet cloud, SC ship+cargo box: the **relationship** is the silhouette.

### Motion rules (more important than colour)

1. **Station-keeping micro-motion vs cruise.** Working ships jitter with small RCS corrections; transit ships hold a steady quaternion and constant velocity. The eye detects **path curvature and speed stability** before it detects hull type.  
2. **Phase-locked activity.** Mining: beam on + zero translation. Transit: beam off + translation. Docking: relative velocity → 0, then clamp. Response: high accel toward threat bearing.  
3. **Periodic signals over static ones.** Blink codes (work strobe ~1 Hz, nav fixed, anti-collision double-flash) survive sub-pixel better than constant emissive, because **temporal contrast** is still sampled.  
4. **Secondary particle motion larger than the ship.** Dust plume diameter, limpet orbits, fragment arcs, and RCS puffs can be **visually larger than the hull**, so the job remains visible after the mesh is gone.  
5. **No random beauty motion.** Ambient NPCs that “idle thrash” read as bugs. Real industrial craft hold attitude; only **corrective puffs** and **tool animation** should move.  
6. **Vector continuity.** A loaded hauler’s long straight burn toward a station is as strong a “job done / job carrying” signal as any cargo mesh—X4’s economy is readable from traffic flow alone.

### Cross-title pattern (what actually works)

| Title | Signature that sells the job far away |
|---|---|
| **EVE Online** | Continuous strip-miner beams + motionless barge on rock |
| **Elite Dangerous** | Laser → fragment spray → limpet ferry swarm → hatch |
| **Star Citizen** | Laser on rock / multi-turret Mole; tractor cones on cargo; landing/work lights |
| **No Man’s Sky** | Freighter + external cargo pods; Phase Beam + hit flash |
| **Everspace 2** | Site composition (G&B mining vessels in marked fields) + freighter/distress contexts |
| **Chorus** | Combat density via particle/manoeuvre envelope more than industrial codes |
| **Hardspace: Shipbreaker** | Narrow vs broad cut beams, sparks on fail, heat behaviour (near-field grammar ambient salvage can borrow) |
| **X4: Foundations** | Laser into hotspot + ejecta + dock/undock economy traffic |
| **Homeworld 3 / HW lineage** | Latch + harvest beam / dig arms + dust trail on return path |
| **Star Wars Squadrons** | CAP orbits vs intercept burns; capital tractor presence under the hull |

---

## Implementation checklist (craft-only)

For each ambient NPC job state, author **exactly four far-field channels**:

1. **Link** (beam / tractor / clamp line) — on or off  
2. **Contact** (impact glow / dust / crate) — present or absent  
3. **Attitude regime** (latched, station-keep, cruise, intercept)  
4. **Light rhythm** (nav only vs nav + work strobe vs RAM stack)

If those four are correct, colour grade and mesh detail can fail and the ship still **reads as doing a job**. That is the real technique behind A-list ambient traffic—not denser models, but **state machines made visible as geometry, energy links, and motion grammar**.
