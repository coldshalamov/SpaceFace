# Placement rules — how to scatter the kit so it reads as work, not as an asset demo

The composition grammar behind the six boards (`comp1..comp6`, replayable from
`compositions.json`). A later composition lane should follow these rules rather
than reverse-engineering the boards.

## The five laws

1. **Every yard has a POWER story.** One `power_skid` (or a station wall) per
   worksite, with the cable trunk visibly pointing at what it feeds. A gantry with
   no power source reads as a prop; the same gantry with a skid and a trunk reads
   as a shift in progress. (The trunk is the "this yard is live" tell — fiction §1.)
2. **Every yard has a LIGHT story.** Active sites: floods aimed AT the work, trade
   color per the light law (amber extraction, blue-white service, arc-blue law,
   warm civic). Dead sites: kill the practicals FIRST, then apply damage. Criminal
   sites: hooded red only, never strobes — absence of honest light is the signal.
3. **Every yard has a CONSUMABLE story.** Work consumes and produces: parts racks
   near service, ore boxes near extraction, pods near logistics, scrap near
   breaking. An empty-handed worksite reads staged. Use the fill states (loaded
   buckets, racked plates, held pods) near activity and the empty/abandoned
   variants away from it.
4. **Flow must be traceable.** Feed → process → take-away should be readable in
   one glance: drill → crusher → conveyor → containers; rack → crane → platform →
   berth. Point `SOCKET_Discharge` at the next stage. Never orphan a conveyor.
5. **One standard, many owners.** Repeat the same prop rather than reaching for a
   new one — three pods and two racks read as an economy; five unique objects read
   as a diorama. Ownership changes are paint (`esk_paint_*`) and state, not shape.

## Density and camera truth

The R1 camera's visible strip is ~93–125 wu deep (CAMERA_VISIBLE_BUBBLE.md). A
"cluttered" yard therefore needs its clutter inside a ~100 m radius of the hero
noun; anything past ~150 m from the flight path is radar content, not frame
content. The boards use 8–11 kit instances inside ~60 m radius — treat that as
the working density for "this place is busy," and half that for "this place is
merely inhabited."

Vertical offsets matter in space: float small items (pods ±1 m, drones at work
height, buoys above the lane plane) so compositions don't collapse into a
ground-plane diorama.

## Per-family notes

- **Cargo:** racks against station/platform edges, long axis parallel to traffic;
  loose pods only near cranes or breach sites (an unattended tidy pod is wrong).
  The hazmat pod keeps distance from habitats (fiction says so; players feel it).
- **Mining:** drill feet must CONTACT rock. Radiators face away from approach
  lanes (their glow silhouettes the site). The conveyor chains in integer spans.
- **Service:** the gantry berth stays empty or holds exactly one client. Scaffolds
  clamp to something — a free-floating scaffold is a bug, use `_bent` for wrecks.
  Drones swarm within ~10 m of a lit work face.
- **Law:** gates ACROSS lanes, pylons paired AHEAD of gates, inspection platform
  offset BEHIND the pylon line, buoys marking the no-go edge. Law geometry is
  symmetric and frontal — that is its identity; do not scatter it casually.
- **Civic:** habitats cluster (min 2) with a utility module per ~3 crewed pieces;
  solar arrays sunward and unshadowed; passenger platform gate faces the shuttle
  dock cradle within ~40 m.
- **Salvage:** nothing aligns. Yaw everything 5–30° off-grid, mix paint families
  on one site (stolen bones), keep exactly one hooded red lamp per structure. A
  salvage yard with straight rows or strobes has been mis-dressed.

## States by distance from civilization

A cheap large-scale rule that keeps the world honest: active states near stations
and lanes; cold/abandoned states in mid-nowhere; salvage/criminal fits in shadow
zones (rock lee sides, off-lane voids) — plus one deliberate inversion per region
(a dead rack beside a busy lane, a lit pirate ear near a station) so the rule
never reads as a rule.
