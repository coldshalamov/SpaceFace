# THE COMMON YARD
### Manufacturing standards for the everyday machinery of inhabited space

Companion to `THE_WORKING_LIGHT.md` (the signal code), `THE_WORKING_TRADES.md`
(the job cycles) and `THE_WORKING_FLEET.md` (the occupational craft). Those three
describe the people and their boats. This one describes **everything they bolt to
the void and leave there**: the racks, tanks, gantries, pylons, pods and cages
that turn a station model floating in a level editor into a place where somebody
works a shift.

Authority for `tools/blender/build_everyday_space_kit.py` and
`assets/incubator/everyday_space_kit/`.

---

## §0 · The space between the nouns

SpaceFace has hero nouns — stations, asteroids, wrecks, the Cathedral — and it
has working verbs — the six job kinds hauling and cutting between them. What it
does not have is the **connective tissue**: real industry is nine-tenths fixed
plant. A refinery is not a building; it is a building *surrounded by* feed
hoppers, slurry tanks, radiator banks, parked containers, a bent scaffold nobody
returned, and one flood tower that has been on since the seam opened.

The kit exists so a composition lane can pour that tissue around any hero noun
and have the result read as *work happening here*, with the HUD off, at the R1
camera's 93–125 wu visible band.

## §1 · Manufacturing standards (why everything matches)

This economy buys from the same three yards everyone else does. Standards are
what make forty props feel like one universe — and they are load-bearing for
gameplay legibility, because a shape that repeats is a shape the player learns.

- **The Berth-standard pod** — 6 × 3 × 3 m end-framed freight container, long
  axis = flight axis. *Identical footprint to the container the working fleet
  carries* (`THE_WORKING_FLEET.md`, shared assembly): a pod on a rack, a pod on
  a hauler spine and a pod under a customs lamp are the same object in three
  sentences. Corner castings top and bottom; clamp rail along each long edge.
- **Span-gauge truss** — 1.2 m square lattice bay, galvanized. Every conveyor,
  mast, gantry leg and dock frame in the kit is an integer number of bays. A
  broken truss therefore reads as *broken*, not as a different product.
- **The formed vessel** — pressure loads live in cylinders and spheres with
  visible end-domes and cradle saddles. Insulated runs wear amber wrap. Nothing
  volatile ships in a box; a box holding liquid is a lie the player can spot.
- **The yard mast** — one standard: lattice column, service ladder face,
  equipment table at the head, hazard band at the foot. Floods, sensors,
  signals and pirate ears are all *fittings on the same mast*.
- **Cable trunking** — power never teleports. A skid that powers a gantry shows
  a trunk run between them; the composition rules (evidence/PLACEMENT_RULES.md)
  treat a visible trunk as the "this yard is live" tell.

## §2 · The light law

Extends `THE_WORKING_LIGHT.md` §2 unchanged — **light color is the trade code**,
and fixed plant obeys the same code the fleet does:

| Light | Meaning on fixed plant |
|---|---|
| White-warm flood | Someone is (or should be) working this face right now |
| Amber | Extraction: drills, crushers, sorters, ore handling |
| Blue-white | Service: welding, repair, construction |
| Arc-blue | Authority: customs, inspection, interdiction |
| Green / red pair | Lane logic: pass side / hold side, approach handedness |
| Warm cabin glow | Civilians live behind this window |
| Red, hooded, dim | Salvage/criminal plant — light that does not want witnesses |

Corollary for props: **an unlit yard is a dead yard**. The inactive/abandoned
state of any kit piece kills its practicals first; geometry damage is secondary.

## §3 · Family paint

Mid-value working paint, never charcoal. Paint says *who owns it*; light says
*what it does*; hazard marking says *what it can do to you*.

- **Industrial ochre** — extraction and heavy process plant.
- **Logistics teal** — pods, racks, transfer plant (the fleet's courier teal).
- **Civic bone** — habitation, passenger, observation.
- **Authority navy + arc-blue** — customs and law hardware.
- **Rust and patch** — salvage yards and everything they've re-welded. Patch
  plates are *bare steel or mismatched paint*, never color-matched: a criminal
  dock is built from four other people's equipment.

## §4 · State doctrine

States are **geometry and operational presentation, not an emissive recolor**:

- **Active** — practicals lit, working attitude (boom deployed, jaw open, dish
  tracking), consumables present (pods racked, ore in the basket).
- **Cold / inactive** — booms stowed, lamps dead, hatches dogged. Same paint.
- **Damaged** — bent members (authored bends, not scaled noise), scorch zones,
  a practical row with gaps where fittings tore away.
- **Abandoned** — cargo and consumables *gone* (empty rack, bare feed chute),
  one access panel missing, all light dead. Abandonment is subtraction.
- **Under-construction** — the standard reveals itself: bare truss bays and
  ribs where skin will go, staged panels nearby, service floods on the frame.
- **Faction-modified** — non-standard additions in non-matching materials
  bolted to standard bones (the salvage family is this doctrine, permanently).

## §5 · The six families

1. **Cargo & logistics** — the pod standard and everything that moves or holds
   it: racks, transfer arm, coupling manifold, freight platform, ore boxes.
2. **Mining & refining** — fixed extraction plant: drill platform, crusher,
   sorter, slurry spheres, radiator bank, conveyor span, extraction mast.
3. **Repair & construction** — the service trades' shore plant: gantry,
   scaffold, keel frame, welding drone, parts rack, power skid, flood tower.
4. **Navigation & law** — authority's fixed presence: customs pylon, inspection
   platform, interdiction buoy, transponder gate, sensor mast, lane signal.
   (Route beacons, warning buoys and billboards already exist as live corridor
   assets and are deliberately not duplicated here.)
5. **Civilian & habitation** — proof people *live* here: habitat pod, shuttle
   dock, observation blister, comms array, solar array, utility module,
   passenger platform.
6. **Salvage & criminal** — the same standards, stolen: salvage clamp, scrap
   cage, hull rack, illicit transfer frame, improvised dock, pirate ear.
