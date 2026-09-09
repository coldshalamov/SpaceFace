# Ashline V2 Rig / Hook — fiction-development component bill

Status: G0 implementation contract for the existing Rig candidate; not runtime promotion or visual
acceptance authority. The current deterministic correction revision is
`rig-material-truth-2026-07-29-v5`; its source and candidate remain an exact pre-finalize mirror.

The Rig remains the V2 Ashline `tether_control_raider`: the Striker donor macro hull, the exact
`[18.5, 6.601560115814209, 11.493575096130371]` m envelope, `+X` forward axis, root
`SF_M4_ASHLINE_V2_RIG_ROOT`, nine stable sockets, and three compound collision helpers are frozen.
Those implementation facts come from `assets/ships/m4_ashline_v2/evidence/rig/build_summary.json`
and `production_metrics.json`; they are not worldbuilding canon.

## Canon anchors and limits

- `docs/worldbuilding/orgs/factions-CANONICAL.md`, **Crimson Reach**, establishes ambush lanes and
  black-market salvage as the Reach's primary function, including disabling a client's drive and
  selling the hull.
- `src/data/enemies.js`, exported `ENEMY_TYPES` records `reaver_pirate` and `corsair_raider`, assigns
  both to `faction_reach` and `tether_control_raider`, and gives them different weapons, speeds, and
  combat profiles.
- `src/data/pirateDoctrines.js`, exported
  `REACH_CULTURE_DOCTRINES['rust-lords']`, describes jury-rigged line crews that foul drives with
  tethers, fight in a line, and have a high disable chance.
- `src/data/encounters.js`, exported `NAMED_CAPTAINS[cap_vane_ash]`, proves that a named
  `corsair_raider` can use `tether_control_raider`; it does not define the ship's manufacturer or
  machinery.
- `src/render/partsLibrary.js`, `WHOLE_SHIP_FILE_BY_HOSTILE_ID` and
  `WHOLE_SHIP_ASSET_ID_BY_HOSTILE_ID`, maps both hostile IDs to the same current
  `ashline_rig.glb` / `SF_WHOLESHIP_ASHLINE_RIG`.

The repository does **not** name the Rig's commissioner, original manufacturer, conversion yard,
crew, component vendors, service log, or slang name. Every such detail below is explicitly
`ART EXTRAPOLATION`; it guides visual construction and does not amend canon or gameplay.

## Literary object portrait

At combat distance the Rig has to explain one canonical fact before it explains any fine detail: this
is the Reach hull that makes a tether-control attack look physical. The Reach lives by ambush and
black-market salvage, while the Rust-Lords' line crews foul drives with tethers; the Reaver and
Corsair records share that doctrine even though one is a slower, rougher gunship and the other a
faster mid-tier raider. The existing runtime mapping also makes them share one Rig presentation.
Those constraints demand a silhouette with a visible capture opening, a rooted forward load path, and
aft machinery that looks capable of dragging a resisting mass. They do not authorize a magic claw,
an invisible tractor beam, or a new player-facing tether socket.

**ART EXTRAPOLATION — commission and manufacture.** The donor hull began as ordinary serial
structure, not as a pirate icon. Its conversion was commissioned as a practical answer to an
expensive problem: intact drives, cargo frames, and pressure vessels are worth more than sprayed
fragments. No single named yard is asserted. The visual story instead assumes dispersed frontier
conversion shops working from shared measurements and whatever plate, bearings, and hot-section
stock they could certify. Their manufacturing signature is repeated plate-girder logic: doubled
roots, open webs, gussets aimed at load, split bearing caps, replaceable pins, and removable guards.
The conversion is financed job by job from recovered hardware rather than from an asserted formal
procurement program. The work is competent but not cosmetically unified. A replacement member can be
newer than the frame beside it without becoming random collage.

**ART EXTRAPOLATION — force and arrangement.** When the jaws take a hull, contact begins at six
small hardfaced pads rather than at one cartoon bite. The load travels through two forged arms into
real pin bosses and clevis ears, back along four tapered boom chords and crossed webs, through root
doublers, and into the donor frame. Paired hydraulic cylinders close the tool but do not pretend to
carry the entire tow. The tether leaves a grooved drum, passes a fairlead and sheave, and terminates
at the jaw assembly; it never disappears into a decorative tube. Under tension the drum brake,
split bearings, keyed shaft, and base frame share a continuous mechanical story. A mechanic should
be able to point from contact pad to hull structure without crossing a floating part. Captured mass
stays outside the pressure body; the frame carries drum vibration around the crew volume, the generic
forward saddle leaves the weapon root reachable, and the open jaw can clear docking and maintenance
approaches instead of sealing the ship behind its own tool.

**ART EXTRAPOLATION — propulsion and heat.** The paired drives are not luminous rings pasted onto
cylinders. Each cold pressure case sits in a saddle that spreads thrust into the aft frame. Nickel
hot sections and dark hollow bells step rearward from that case; dry ceramic throats live deep inside,
where heat and erosion belong. Valve packs and restrained service lines terminate at fittings instead
of wandering across the hull as greeble. The two visible bells may acquire different heat tint and
maintenance color, but their central gameplay trail/socket contract remains frozen and unresolved.
The asymmetry is service history, not permission to multiply VFX anchors.

**ART EXTRAPOLATION — ownership and maintenance.** A small Reach crew services the machine from the
protected side of the drum and from removable drive covers. Hands polish latch edges, release levers,
grease points, and bearing caps; boots scuff guard tops and root walk plates. Jaw pads and cable see
bright rubbed crowns, while sheltered web corners hold dull residue. Hot sections bleach and stain
along flow, not in arbitrary spots. The crew repaints removable guards in oxide red because those are
the pieces a hurried deckhand must not mistake for structure. It leaves the jaw teeth, pins, drum,
cable, bells, and ceramic unpainted because their substance and condition need to remain inspectable.
One brake cover is newer and slightly cleaner than its mate: the service-history clue, not a fashion
accent.

**ART EXTRAPOLATION — the one-metre read.** At arm's length the object is a negotiation between
materials. Phosphate-coated plate has dry batch-to-batch tonal change, shallow weld cleanup, and
localized bare edges; it does not have a leather grain or a universal square bump grid. Nitrided
pins and machined drum surfaces catch tight directional highlights. Braided cable breaks reflection
into fine strands but never becomes a rubber hose. Nickel sections carry axial heat response.
Refractory throats are granular and non-metallic, with sparse erosion rather than cracked pottery
everywhere. Grease appears at bearings and hydraulic glands, soot behind hot flow, and abrasion at
contact. Quiet plate remains quiet so these clues are legible.

**ART EXTRAPOLATION — the 120-pixel read.** From the supported play camera, the memorable asymmetry
is the open capture machine riding the donor body, counterweighted visually by paired drive cases and
two deep dark bells. The pilot should recognize the central jaw void, the A-frame's root-to-tip
direction, the drum/fairlead break in the midbody, and the separated aft drives before reading color.
At closer range, web openings, clevises, jaw pads, drum flanges, saddles, and ceramic throats explain
how it works. A target crew fears the opening because the force route is readable; the Rig's own
mechanic resents any cover that hides a bearing, fitting, or release point. At no range may the Rig
resemble a toy clamp on a tube, a LEGO ship assembled from meter-wide bars, generic NASA white,
molded soap, random cyberpunk greeble, a creature claw, or a
glowing engine disk. The manufacturing signature, the newer brake cover, and the load-path
asymmetry must do more identity work than paint or bloom.

## Production translation

### Five macro silhouette imperatives

1. Preserve the frozen donor envelope and `+X` identity while making the open jaw void the primary
   forward read.
2. Show one continuous root-to-pad load path through a tapered open-web A-frame; never substitute a
   solid box boom.
3. Keep the tether machinery as a protected but traceable midbody system whose fairlead and cable
   path remain visible from supported inspection views.
4. Resolve the aft as two separated, saddle-mounted pressure cases ending in hollow bells, not
   cylinders with bright caps.
5. Maintain quiet donor plate around the dense capture and drive zones so construction hierarchy
   survives at normal gameplay size.

### Meso construction zones

| # | Zone | Construction and connection |
|---:|---|---|
| 1 | donor pressure hull / frame | Frozen macro body; receives capture and drive loads through overlapping doublers rather than surface tabs. |
| 2 | capture root doublers | Layered plates spread four boom-chord loads into the donor frame; welded perimeter and service-fastener logic remain visible. |
| 3 | A-frame chords and webs | Four tapered chords, crossed strap webs, and large openings connect the root to the clevis collar. |
| 4 | boom clevis collar | Split ears, bearing gaps, pins, collars, and retainer caps connect boom to independent jaw arms. |
| 5 | jaw arms and contact pads | Two forged arms retain a central void; keeper plates and countersunk fasteners make six hardfaced pads replaceable. |
| 6 | jaw hydraulics | Two cylinders, rods, glands, clevises, valve fittings, and terminated braided lines explain closure without carrying the tow alone. |
| 7 | drum, keyed shaft, and bearings | Grooved fabricated drum on a keyed shaft lands in two split bearing blocks rooted to a base frame. |
| 8 | brake, clutch, and service guard | External brake band and clutch lever remain serviceable behind one removable oxide-red sheet guard. |
| 9 | fairlead, sheave, and tether | Drum exit, guided direction change, braided run, and two terminal fittings form one unbroken route to the jaw. |
| 10 | drive roots and saddles | Paired apertured saddle cheeks, transverse feet, cheek-plane webs, overlapping root links, and root doublers transfer axial load into the aft donor frame. Buried center-plane straps are forbidden. |
| 11 | pressure cases and hot sections | Faceted cold cases step into nickel hot sections with clamps, covers, valve packs, and rooted lines. |
| 12 | bells, throats, and forward mount | Hollow bells contain recessed dry ceramic throats; the generic forward saddle preserves `SOCKET_Weapon_Front` without new weapon fiction. |

### Material stacks and actual builder values

The values below record the final deterministic authoring targets in
`tools/blender/build_m4_ashline_v2.py`. Principled and nominal packed-ORM
`roughness / metallic` values are deliberately aligned so metadata, shader response, and data maps
do not tell different material stories. Maps, geometry, lighting, and wear location still determine
the rendered substance.

| Zone / slot | Substrate → finish → microstructure → use history → markings | Principled and ORM roughness / metallic |
|---|---|---:|
| donor plate, boom, doublers / `Material_Hull` | welded high-strength steel → phosphate-like coating → low-amplitude plate-batch variation without a global grid → joint/contact edge rub and sheltered residue → no broad decorative mark | `0.72 / 0.08` |
| pins, drum, bearings, cases / `Material_Mechanical` | cold/tool steel → nitrided or blackened finish → directional machining → grease at bearings and rubbed pin shoulders → stamped identity deferred | `0.31 / 0.88` |
| guards and service tags / `Material_Red_Paint` | steel sheet → oxide-red dielectric paint → restrained coating variation → localized chips where handled or struck → alignment and hazard shapes only | `0.78 / 0.00` |
| keyed shaft, hydraulic rods, retainers, valve fittings / `Material_PolishedSteel` | turned interface steel → polished service surface → fine axial/turned lines → rubbed shoulders and handling marks → unpainted | `0.18 / 0.96` |
| tether, drum wrap, and braided hydraulic runs / `Material_CableSteel` | high-carbon wire → braided metallic cable → crossed strand breakup → crown/flex wear → unpainted | `0.42 / 0.93` |
| replaceable jaw contact inserts / `Material_Hardface` | hardfacing alloy → heat-darkened exposed contact surface → irregular abrasion grain → rubbed crowns and impact wear → unpainted | `0.38 / 0.90` |
| drive hot jackets and rolled bells / `Material_HotSection` | nickel hot alloy → heat-darkened exposed shell → axial heat/flow bands → throat-local staining and service variation → unpainted | `0.34 / 0.94` |
| drive throats / `Material_Refractory` | alumina/zirconia-like ceramic → dark dry exposed surface → low-contrast non-periodic fine grain with sparse pitting/microcracks, never contour rings or swirls → throat-local heat and edge loss → none | `0.97 / 0.00` |
| protected cues / `Material_Cyan` | recessed metal fixture with non-plastic optical insert → dark protected face → smooth, low-noise response → little exterior wear → dim internal pilot/status cue only | `0.52 / 0.02`, emission RGB `(0.004, 0.07, 0.11)`, strength `1.0` |

The Rig source contract is exactly these nine authored roles and exactly three distinct 256 px images
per role: base color, packed ORM, and OpenGL normal. `Material_HeatMetal` remains the established
Dart/Lode implementation slot but is forbidden from the Rig material graph; cable, hardface, polished
interfaces, and nickel hot sections may not share or alias image payloads.

### Edge-radius families

These are **ART EXTRAPOLATION authoring targets**, to be evaluated at supported screen size rather
than treated as universal bevels.

| Family | Manufacturing logic | Target treatment |
|---|---|---|
| welded heavy plate | cut plate, ground corners, weld access | broad but planar edge break, approximately `0.04–0.09 m`; preserve hard faces |
| forged jaw and clevis | high-load forging with machined interfaces | stronger silhouette break, approximately `0.05–0.12 m`, tightening at pin bores |
| machined pin, shaft, bearing | turned or milled steel | small controlled chamfer, approximately `0.015–0.035 m`; directional highlight |
| folded guard and service cover | thinner formed sheet | approximately `0.01–0.025 m`, with visible thickness and fastened seams |
| nozzle bell and hot jacket | rolled/fabricated heat hardware | stepped lips and section changes; no pillow bevel or smooth torus |
| refractory insert | replaceable ceramic body | small dry edge break, approximately `0.015–0.04 m`; chipped only where mechanically plausible |

### Load, heat, access, and contact paths

- Capture load: pads → keeper plates → jaw arms → clevis pins → four boom chords/webs → root
  doublers → donor frame.
- Tether load: jaw terminal → braided run → fairlead/sheave → grooved drum → keyed shaft → split
  bearings/brake → base frame → donor structure.
- Drive load: pressure case/hot section → clamps and saddle → short truss bays/gussets → aft root
  doubler → donor frame.
- Heat path: refractory throat and bell interior → nickel hot section → case transition; staining
  follows flow and cannot spread as generic dirt across cold structure.
- Service path: removable brake guard, bearing caps, clutch lever, valve packs, drive inspection
  covers, jaw keepers, and hydraulic glands remain reachable and visually distinct.
- Contact regions: jaw pads, cable crowns, fairlead, latch/lever edges, guard tops, and root walk
  plate take abrasion; sheltered webs and ceramic recesses do not receive the same wear.

### Clean versus dense zones

- Dense: jaw pivots and pad keepers; drum bearings/brake/fairlead; drive saddle/valve/hot-section
  transitions.
- Medium: root doublers, A-frame web nodes, hydraulic terminations, drive truss bays.
- Clean: broad donor side and dorsal plate, chord spans between nodes, pressure-case facets between
  clamps. These are intentional rest areas, not unfinished surfaces.

### Decal and faction plan

The canonical Reach identity is ambush and black-market salvage, not a universal punk sticker pack.
**ART EXTRAPOLATION:** use chipped oxide-red stencil bars, service alignment arrows, pad-change
ticks, and small hand-cut claim marks on removable guards and access covers. Keep exact words,
manufacturer logos, serials, clan glyphs, and named-yard marks deferred until canon or an art owner
supplies them. No lettering crosses jaw contact faces, hot sections, cable, ceramic, or broad quiet
plate. Typography must look sprayed through a reusable industrial stencil and worn by handling, not
printed as a clean floating decal.

### Supported-camera and LOD survival

Pixel bands below are authoring targets, not measured acceptance evidence.

- At roughly `90–140 px` ship length: preserve donor silhouette, central jaw void, A-frame direction,
  fairlead interruption, two drive masses, and two dark bell apertures.
- At roughly `180–320 px`: add root doublers, web openings, jaw separation, drum flanges, drive
  saddles, and ceramic/metal boundaries.
- In close inspection: reveal pins, keepers, grooves, braid, glands, valve packs, service covers,
  weld cleanup, and localized material-specific wear.
- LOD0 retains boom chords/webs, jaw pads/keepers/pins, rope path, drum grooves/bearings/brake,
  hydraulics, cases/bells/throats, saddles, and restrained markings.
- LOD1 retains the open load path, two-arm jaw, flanged drum silhouette, protected tether route,
  pressure cases, hollow bells, throats, saddles, and physical material boundaries.
- LOD2 remains the donor macro hull. It cannot be used to claim close material truth.

### Eight forbidden shortcuts

1. A solid box boom with texture lines pretending to be web construction.
2. A single bevelled jaw block or creature-claw silhouette without pins and replaceable pads.
3. Naked cylinders, torus rings, or bright disks standing in for drum, pressure case, bell, or
   throat.
4. A universal plate grid, leather bump, corner-stud recipe, recolored one-material shader, or
   shared image payload across any of the nine Rig roles.
5. Floating hoses, rails, tags, or greebles with no fittings, load root, service purpose, or
   endpoint.
6. Emission, bloom, oxide red, or grime used to hide unreadable geometry or undifferentiated
   substance.
7. Uniform edge radius or unconditional smooth shading that turns forged, welded, sheet, machined,
   and ceramic parts into the same molded object.
8. Promotion from a beauty render, pre-finalize image, stale hash, generated reference, or technical
   test without exact-candidate material/runtime evidence and independent review.

## Component material bill

### Capture boom and jaw

| Visible component | Function and construction | Material and optical read | Interfaces / forbidden read |
|---|---|---|---|
| plate-girder A-frame | Four tapered, chamfered high-strength welded chords form an open bay with crossed strap webs and real negative-space openings. Root doublers overlap the donor frame. | Dark phosphate-coated structural steel (`Material_Hull`) with bare edge wear only at service joints. | Root doublers, gussets, collar plates, clevis ears, and bolts visibly terminate in hull structure; never one 8.2 m box or a solid triangular wall. |
| boom clevises and pins | Split ears receive the jaw y-axis pin; caps let the tool be replaced. | Nitrided cold steel (`Material_Mechanical`), dark metallic with tight grazing highlights. | Two ear plates, pin collars, retainer caps, and bearing gaps; never painted-on hinge detail. |
| two-arm capture jaw | Forged tapered arms leave a real central opening while closing around salvage. Replaceable pads bolt to the arms. | Tool steel (`Material_Mechanical`), with darker contact inserts (`Material_Hardface`). | Pin bosses and keeper plates are visible; never a single bevelled block. |
| serrated pads and keeper plates | Three small hardfaced inserts per arm are consumable contact surfaces retained by plates and countersunk fasteners. | Heat-darkened contact alloy (`Material_Hardface`) against nitrided steel. | Teeth attach to the jaw tip with explicit keepers; no glowing teeth or rubber contact strip. |

### Tether, drum, and service path

| Visible component | Function and construction | Material and optical read | Interfaces / forbidden read |
|---|---|---|---|
| grooved fabricated drum | A flanged, welded steel drum has discrete rope grooves rather than a smooth spool. A keyed shaft runs through it. | Fabricated drum (`Material_Mechanical`) around a turned keyed shaft (`Material_PolishedSteel`). | Flanged ends, shaft shoulders, split bearing blocks, and a band-brake/clutch side; never `HOOK_TETHER_SPOOL` cylinder vocabulary. |
| tether and fairlead | Braided cable leaves the drum through a protected fairlead and sheave so its direction change is explainable. | Braided metal (`Material_CableSteel`) with crossed strand breakup and restrained highlights. | Cable has drum, sheave, and jaw endpoints; no free-floating hose or torus. |
| brake / clutch guard | Bolted sheet guard shields the brake band while exposing the service seam and release lever. | Oxide-red painted steel (`Material_Red_Paint`) over structural steel. | The only broad red tether treatment; guard is rooted to bearing housing, not a floating threat rail. |
| hydraulics and hoses | Paired cylinders close the arms; polished rods pass through gland blocks and clevises. Braided hoses route to fixed valve packs. | Cylinders and glands (`Material_Mechanical`); rods and interfaces (`Material_PolishedSteel`); hose braid (`Material_CableSteel`). | Every hose ends at a fitting; no generic round tube network. |

### Drive and generic weapon root

| Visible component | Function and construction | Material and optical read | Interfaces / forbidden read |
|---|---|---|---|
| paired drive pressure cases | Faceted welded pressure cases carry stepped nickel hot sections on thrust saddles. | Cold case (`Material_Mechanical`), nickel jacket (`Material_HotSection`). | Paired saddle cheeks, feet, cheek-plane webs, overlapping root links, valve packs, and rooted service lines; never a cylinder with a bright end disk or a buried decorative truss. |
| hollow bells, cavity liners, and refractory throats | Each drive has a 16-sided converging/diverging rolled bell, a separately modeled dark nested liner behind the lip, and a smaller dry replaceable ceramic throat recessed behind that liner. | Bell: restrained heat-darkened nickel (`Material_HotSection`); cavity liner: dark nitrided steel (`Material_Mechanical`); throat: dark dry non-metallic refractory (`Material_Refractory`). | The annular opening remains physically hollow and meaningful with emission off; the liner cannot cap the aperture, and neither ceramic nor cue may return to the mouth as a bright plug. |
| generic forward mount | Retains `SOCKET_Weapon_Front` without asserting a new weapon class. | Nitrided steel saddle and protected service routing (`Material_Mechanical`). | It is generic because shared reaver/corsair use remains unresolved; no unique weapon fiction or changed socket. |

## Promotion blockers

1. `reaver_pirate` and `corsair_raider` both map to the same current Rig. A capture-focused Rig cannot
   be promoted until the owner decides whether accepted role-specific variants are required.
2. The V2 asset deliberately lacks the old live `SOCKET_Tether_Front`. Runtime tool/VFX behavior needs
   an explicit contract decision; the visual rope is not permission to add, move, or infer a socket.
3. The candidate has two visible drive bells but preserves one central engine/trail socket pair.
   Browser/Electron VFX proof or an owner-approved interface decision is required before promotion;
   the art pass does not move or multiply those sockets.

## Component-only reference translation

The three accepted studies are logged with exact prompts, call IDs, source paths, hashes, decisions,
and provenance in `REFERENCE_PROVENANCE.md`:

- `rig_capture_assembly_reference.png`: selected for open web openings, continuous root-to-pad load
  path, root doublers, gussets, clevises, two independent forged arms, keeper-retained pads, and
  hydraulics with real endpoints. Its crane-like silhouette was not copied.
- `rig_tether_winch_reference.png`: selected for a grooved fabricated drum, keyed shaft, split
  bearings, a visible band brake/clutch, removable guard, and aligned fairlead/sheave. Its rope
  texture, cage silhouette, and presentation base were not copied.
- `rig_paired_reaction_drive_reference.png`: selected for exactly two faceted pressure cases, nickel
  hot sections, deep hollow bells, dry ceramic throats, saddles, gussets, valve packs, and rooted
  service lines. Its stand, bolt density, and whole-engine silhouette were not copied.

The images supply construction logic and material boundaries only. Their pixels are not textures,
normal maps, material authority, canon, or visual-acceptance evidence.
