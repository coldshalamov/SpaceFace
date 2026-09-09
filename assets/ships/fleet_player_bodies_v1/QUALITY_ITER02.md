# Quality iteration 2 — manufactured construction

Hitch left untouched. Live Hitch V7 is the floor; Hitch component refs (drive vanes,
midship plates, radiator cassette) are the quality target.

## Brainstorm revision 1
Beat the clay/blockout read: replace box vanes with tapered rooted vanes, add
recessed radiator cassettes with fins and header pipes, hatches with rims and
bolts, RCS as a three-nozzle bay, sensor as dish+gimbal.

## Brainstorm revision 2
Break the hull into overlapping armor tiles, panel seams, and service pipes along
the chines so the silhouette is manufactured plate, not one tinted loft.

## Brainstorm revision 3
Show texture (lower tint mix, stronger normals), add a dry radiator metal, and
keep each ship's role kit (wings, pods, arms, tower) so identities stay distinct.

## Implement
Shared `fleet_construction.py` used by the factory and Pelican. Rebuild every
factory player + NPC body. Pelican drive vanes and radiators upgraded in place.
Wasp is next dedicated loop.
