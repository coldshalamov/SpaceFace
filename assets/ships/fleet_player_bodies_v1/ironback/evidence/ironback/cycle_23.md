# Ironback MTX Cycle 23 — REVISE

Cycle 23 is a construction-method pivot, not a polish pass. It keeps Cycle 22's
open-well perimeter barge and replaces the box-kit hosts: port/starboard sponsons
and fore/aft pressure bodies are 4–6-station chamfered section meshes; the hopper
is a sloped trough with apron, drums and proud V jaws; the cab is a tapered neck
plus faceted greenhouse with recessed dark panes; pulse beds are matched U-chambers
with canted vanes; tool heads are extruded profiles; decks use broad load-path
courses. The candidate is not accepted or promoted.

## Controller disposition

`REVISE`

Two Blender 5.1 runs. The first wrote evidence then showed `Pressure_Aft` collapsed
to 3 verts (`Mesh LOD0_Hull is not valid`) because the old pulse-well box cuts ate
the thinner formed shell. Those hull cuts were removed; the U-chambers stay as
separate parts. The second run wrote all source/evidence artifacts and exited 0
under the corrected occupancy contract:

- default chase: `17.51%` width — inside `8–22%`;
- abeam chase: `8.50%` width — inside `8–22%`, short of the `9.75%` useful-beam
  target;
- close chase: `44.66%` width — inside the derived `19.862–54.621%` band;
- no supported view crops.

Runtime display scale is `2.505` for the traced `41.28 WU` length. All three
supported views are legal and uncropped.

Original-resolution review of the exact-source stills:

- the hopper stays an open well. Close and default both show three light drums
  (center luma ~120) and darker aft jaws (~58). At D=144 the well average is ~82
  against a dark cab roof ~40 and a bright fore deck ~153, so the ore path reads
  more as filled tan machinery than as a dark three-beat pit;
- the command greenhouse is no longer a cyan card (0% cyan pixels in the cab roof
  sample). Roof glass at D=144 is dark (RGB ~53,38,30, luma ~40, ~59% of samples
  under luma 40). At D=58 the cab is a dark mass (~47% dark) rather than a pale
  lid, but the faceted wheelhouse/frame beat is still weak against the orange
  fore deck;
- twin pulse U-chambers exist as open wells in clay (both ~124 luma vs hull ~171).
  Under the real dorsal key, port still reads brighter than starboard at D=144
  (~80 vs ~58) and at D=58 (~89 vs ~35), so they do not yet hold a matched pair
  rhythm;
- the four arms keep Cycle-22 roots/booms. Tool heads are extruded profiles
  (saw arc, V jaws, tapered drill, grab forks) without a common HeadBlock. At
  D=144 they remain dark nubs; identity is still weak;
- sponson/fore/aft hosts are formed section meshes (LOD0 aft 202 verts after
  cuts, not a 3-vert remnant). Load-path courses replace overlap-plate banks.
  The normal-isolation pass is still a lavender hull field (R mean ~198, std
  ~16). ORM red now carries baked AO (range 43–233) rather than a flat channel,
  but the construction does not yet dominate the normal diagnostic.

A re-render, camera change, or texture-noise pass cannot close these facts.
The controller owns acceptance.

## Retained exact-source evidence

- LOD0: `818CABC3933F421C323FAF148EE0328ECD72FAC9F4E0F3E1AB9591FB50D88BF7`
  (`32,134` triangles, `8` draws)
- LOD1: `CBA751D7878CAA7AF8FB7194013EFC136654616D2BF50E41907005058AD1E5DA`
  (`28,730` triangles, `8` draws)
- LOD2: `62EFB60D7E03D54645C7E80C950B7943D5CDCCCDF3A0A950F13DCA9E40AE8237`
  (`19,583` triangles, `8` draws)
- Identity and occupancy: `cycles/cycle_23/EVIDENCE_IDENTITY.json`
- Required stills: `cycles/cycle_23/*.png`

No live, release, package, manifest, runtime, texture-size, or program-map path
changed in this cycle. Cycle 18–22 evidence were not modified.
