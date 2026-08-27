# Ironback MTX Cycle 21 — REVISE

Cycle 21 keeps Cycle 20's open-well perimeter barge and changes the load-bearing
forms the default camera still misread: a few large hopper conveyor/breaker/gate
masses, a three-pane armored greenhouse on a pressure neck, twin stepped pulse
beds with gapped plates, broader inward tool heads in the same compact booms,
and directional dorsal plates/trenches/ribs. The candidate is not accepted or
promoted.

## Controller disposition

`REVISE`

The single Blender 5.1 build wrote all source/evidence artifacts and then failed
closed on occupancy:

- default chase: `17.628%` width — inside `8–22%`;
- abeam chase: `9.013%` width — inside `8–22%`, short of the `9.75%` vertical-relief
  target;
- close chase: `45.626%` width — outside `20–42%`;
- no supported view crops.

Runtime display scale is `2.505` for the traced `41.28 WU` length. Default and
abeam stay legal. Close width is still the locked +X length axis at D=58. Cab
height and inward tool mass did not, and cannot, put 41.28 WU under 42% at D=58.
A later controller-owned visual-scale decision remains the legal close-band
route. Abeam only moved from `8.951%` to `9.013%`; useful bow height does not
drive abeam width, which is beam.

Original-resolution review of the exact-source stills:

- the hopper stays a genuine open well. Close floor luma ~22 against sponson deck
  ~62, with a large breaker mass (~102) in the aft third and a dark conveyor
  stripe. At D=144 the well is darker than the deck (~25 vs ~55) but the
  conveyor/breaker/gates still do not dominate as a few high-contrast industrial
  forms;
- the command cage is a real greenhouse from the bow: abeam near-field samples
  read cyan-blue panes, and close shows dark roof glass against a thick brow.
  At default D=144 the forward block is still mostly orange deck plus a dark
  brow; three broad panes are not yet the unmistakable cab identity;
- twin pulse beds are open frames with ceramic/armor plate edges, not lids.
  Close lighting splits them — port plates catch fill (~153) while starboard
  stays a dark well (~41) — so they do not yet read as a matched pair of
  industrial beds from D=144, where they remain dark rectangles;
- the four arms stay heavy and compact on the Cycle-20 envelope. Turntable wells
  are larger, and close tool heads are dark silhouettes, but saw/jaw/drill/grab
  identity is still weak at D=144;
- dorsal overlap plates, load ribs and sponson trenches are present in clay and
  close. The normal-isolation pass is still a largely uniform lavender hull
  silhouette; directional relief does not yet carry the dominant decks.

A re-render, camera change, or texture-noise pass cannot close these facts.
Close occupancy must stay an honest length-axis miss until a legitimate scale
decision. Cycle 22 still needs hopper machinery that reads as ore path at D=144,
cab roof glass that owns the forward block in the default chase, twin pulse beds
that stay a pair in dorsal light, and tool/turntable beats that survive 144 WU.

## Retained exact-source evidence

- LOD0: `70FDFDA417E7D76EE33452BB4CC2012FDF5DDFF28E128C33D3528385613FFDFD`
  (`51,745` triangles, `8` draws)
- LOD1: `04561AD7BC5499EC4FF2B4F42ADD10E531BA1A65B5D8CB18928CBAEF4D706EC8`
  (`39,501` triangles, `8` draws)
- LOD2: `00A98E0391C76DE9ACC38B9C30E82972DD3ACC0FD92DE6083AFEA68AA46F61BC`
  (`29,557` triangles, `8` draws)
- Identity and occupancy: `cycles/cycle_21/EVIDENCE_IDENTITY.json`
- Required stills: `cycles/cycle_21/*.png`

No live, release, package, manifest, runtime, texture-size, or program-map path
changed in this cycle. Cycle 18–20 evidence were not modified.
