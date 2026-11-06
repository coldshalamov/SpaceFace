<!-- LIFETIME: CAMPAIGN -->
# The SpaceFace style bible — one page

**X1, owner review 2026-11-06.** One rendering language, one value system, one scale system, from
the sky to the HUD. It extends [`LOOK.md`](../../../../docs/visual-assets/LOOK.md) ("Neon Industrial")
and [`FORGE.md`](../../../../tools/blender/forge/FORGE.md) from ships to the whole frame. Where this
page and an older recipe disagree, this page wins for *composition*; LOOK.md still owns the mood
numbers and FORGE.md still owns how a ship is built.

> **The picture:** working machinery finished like a show car, under stage light, in black space.
> Every object is built by someone for a job, and the paint is the only thing that is decorative.

## 1. One medium per depth band

The eye must be able to tell depth without a label. Medium follows distance, never asset age.

| Band | What lives here | Medium | Rules |
|---|---|---|---|
| **SKY** (behind the play plane) | planets, nebulae, stars, deep field | **illustrated painted plate** (`paintedPlanets.js`): a 2D image with an authored terminator, posterised values, one key and one edge hue | parallax ≤ 0.06; never collides, never occludes a play body, never reads same-plane; one hero body at a time; a sky body may not exceed 34% of screen height |
| **FAR** (flyable landmark) | the sector's planet, giant station, cathedral wreck | **3D shaded body** at LOD, same sun, same palette, same lacquer rules as a ship | baked albedo ≤ 1024×512, hard terminator, fresnel rim, additive limb; silhouette readable in one still |
| **PLAY** | ships, rocks, cargo, props, arena furniture | **authored 3D** at one detail density (see §3) | three values, manufactured surfaces, nothing floats, every prop has a job |
| **GLASS** | HUD and menus | ORRERY (`design/frontend/ORRERY.md`) | bone at rest, amber for the Hand/primary, red for threat only; no medium pretends to be another |

A planet the player can reach is PLAY. The Tethys Anvil (`planetSiteVisual.js`) is the template for
every far body: baked surface, terminator, rim. A sky planet is never promoted into the play plane;
a play planet is never replaced by a painted sprite.

## 2. The planet rule

- **Sky bodies are illustrated, not photographic.** Values posterise into 3–4 bands; the terminator
  is authored and hard; chroma is deepened; the body recedes (value and contrast below the nearest
  play body, `PLANET_STYLE_GLSL` values).
- **One sun.** The terminator direction of a sky planet and the key light on the play geometry agree.
  A sky planet lit from a different side than the ship is a defect.
- **One palette family.** Sky bodies use the sector's key/edge hue fight (`lookMoods.js`), not a
  separate colour script.
- **No collision between bands.** A sky sprite may never cross in front of a ship, rock, station, or
  HUD. The current `hero depth 12` + parallax gate is the enforcement point.
- **A sky planet never explains a gameplay mechanic.** If a planet is a hazard, a site, or a target,
  it is 3D in PLAY.

## 3. The prop rule (Forge detail at prop scale)

Props do not need ship triangle counts. They need a ship's **value structure and silhouette
discipline** at the mode's real gameplay camera (Adventure: 60° top-down chase at 144 WU, ship
≈ 170 px; Swarm: the wider S6 horde frame, where the ship is smaller by composition):

1. **Three values, always.** Light primary paint, mid secondary, dark mechanical. Dark is a visible
   share of the top view (recesses, intakes, gaps). A prop whose whole range sits between 0x20 and
   0x60 reads as a greybox; that is the defect the baseline shows.
2. **Manufactured, never noisy.** Chamfer every hard edge; panel seams and hatches are geometry or a
   designed texture, never broadband grain. No painted-on words.
3. **One identity colour in bands.** Safety amber, faction hue, or occupation colour, cut into the
   form. Not a recolour of the whole prop.
4. **Lamps are light.** A working prop carries ≤ 2 lit points (beacon, work lamp, seam) above the
   bloom threshold. Paint never glows.
5. **Nothing floats.** Feet, pylons, clamps, welds. At the chase camera a gap reads as a bug.
6. **Detail budget at the camera.** Props ≤ 8 k tris LOD0; one prop family shares geometry and
   materials; one draw per material. Stars/nebulae are the only sprites.

## 4. Scale modules (one system)

| Module | Size | Used by |
|---|---|---|
| **Ship length** | `1.72 × entity.radius` (`WHOLE_SHIP_HULL_TARGET_LENGTH`) | every hull, every faction variant |
| **Cargo pod** | radius 6–7 WU, length ≈ 0.5 ship | `place_cargo_pod_*`, `pod_cargo_container` |
| **Container rack** | 2 pods wide, 1 pod tall | stations, docks, cargo yards |
| **Human-scale greeble** | 0.25–0.5 WU | doors, rails, ladders, windows on every prop |
| **Arena furniture** | 1.5–4 ship lengths (a bank plate is room-scale, not crate-scale) | Foundry plates, pylons, crushers |
| **Sky hero** | 0.32–0.34 screen height at depth 12 | Helios Saturn, Veil ringed ice |

A prop is never sized by taste. If it is a crate, it is a cargo pod. If it is furniture, it is
room-scale and reads as architecture. There is no third size.

## 5. Colour and light

- **Two hues fight in every frame** (LOOK.md): a key and an opposing edge. A third hue is an event
  (a weapon, a hazard, a reward), never decoration.
- **Shadow is the mood's shadow colour, never grey.** Dark sides are authored (`lookMoods.js`).
- **Paint never emits; lamps always do.** Bloom threshold stays 1.0.
- **Big means big in the world.** A capital ship, a planet, a boss: big geometry, big light, big
  debris. Never a screen-wide flash to imply size. Flash ≤ 15% of the screen, ≤ 0.2 s.

## 6. The never list

- A photographic or soft-edged body in the sky beside illustrated ships.
- A flat, untextured, single-value box as final art (greybox is a stage, not a ship).
- Three detail densities in one frame; a prop more detailed than the ship beside it.
- A prop bigger than a ship module unless it is room-scale architecture.
- Painted-on text, decals used as noise, or a recolour standing in for a silhouette.
- A screen-wide white flash, a glow card standing in for an object, or fake light geometry.
- Solving identity with floating labels. Identity is shape, motion, value, then text.

## 7. How a new asset is accepted

1. It sits in exactly one depth band and obeys that band's medium.
2. It passes the three-value test at the gameplay camera (a greyscale read still shows the form).
3. It has a scale module and a stated triangle/draw budget.
4. A lineup capture at the gameplay camera + a turntable is reviewed against this page by an
   independent reviewer.
5. It enters through the runtime manifest and Lane 3's residency path, with no frame-time
   regression on the E10 dashboard.

The census of current assets and their disposition is [`CENSUS.md`](./CENSUS.md).
